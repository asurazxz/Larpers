// Client for Damien's FastAPI solver (api/main.py).
// Public: GET /api/health, GET /api/data, POST /api/validate.
// Signed-in: POST /api/solve, POST /api/solve/stream, POST /api/baseline, POST /api/explain, POST /api/plain-english,
// with Authorization: Bearer <Supabase access token>.
import type { AuditReport, Scenario, Solution } from './contract';
import type { ExplainInput } from './explain';
import type { SolveEvent } from './solveProgress';
import { getAccessToken, refreshAccessToken } from './supabase';

export const SOLVER_API_URL = (process.env.NEXT_PUBLIC_SOLVER_API_URL ?? '').trim().replace(/\/+$/, '');

export const liveEnabled = SOLVER_API_URL.length > 0;

export const HEALTH_TIMEOUT_MS = 3_000;
export const SOLVE_TIMEOUT_MS = 150_000;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const EXPLAIN_TIMEOUT_MS = 30_000;
/** The API sends a line at least every 2 s during a run, so this much silence means the connection died. */
export const STREAM_IDLE_MS = 15_000;
export const PLAIN_ENGLISH_TIMEOUT_MS = 20_000; // above the API's 16 s worst case, so its empty answer arrives first

// Fixed unless a caller overrides them explicitly.
export const SCENARIO_DEFAULTS = { depot_retention: 1, time_limit_s: 90 } as const;

export type ScenarioInput = Partial<Scenario>;
export type { AuditReport };

export interface PlainEnglishResult {
    run_id: string;
    text: string | null;
    model: string | null;
}

/** One number-bearing statement computed from the run by the API (api/explain.py). */
export interface ExplainFact {
    id: string;
    label: string;
    value: string;
}

export type Explanation =
    | {
          available: true;
          headline: string;
          points: { text: string; fact_ids: string[] }[];
          caveat: string;
          facts: ExplainFact[];
          model: string;
          verified: true;
      }
    | { available: false; reason: string };

export interface HealthResult {
    ok: boolean;
    status: number; // HTTP status, 0 if unreachable or not configured
    info: unknown; // response body, whatever /api/health returns
    error: string | null;
}

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'aborted' | 'bad_response' | 'not_configured';

export class ApiError extends Error {
    readonly status: number;
    readonly kind: ApiErrorKind;
    readonly detail: unknown;

    constructor(status: number, message: string, kind: ApiErrorKind = 'http', detail: unknown = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.kind = kind;
        this.detail = detail;
    }
}

// Solve or baseline was refused for lack of a valid session, even after one refresh.
// The UI should prompt sign-in and keep the scenario inputs (see savePendingInputs).
export class AuthRequiredError extends Error {
    readonly status = 401;

    constructor(message = 'Sign in with Google to run the solver.') {
        super(message);
        this.name = 'AuthRequiredError';
    }
}

export interface TokenSource {
    getAccessToken(): Promise<string | null>;
    refreshAccessToken(): Promise<string | null>;
}

export interface ApiClientOptions {
    baseUrl?: string;
    tokens?: TokenSource;
    fetch?: typeof fetch;
    healthTimeoutMs?: number;
    solveTimeoutMs?: number;
    defaultTimeoutMs?: number;
}

export interface RequestOptions {
    signal?: AbortSignal; // lets the UI cancel a run
    timeoutMs?: number;
}

export interface StreamOptions extends RequestOptions {
    onEvent: (event: SolveEvent) => void;
}

export interface ApiClient {
    readonly baseUrl: string;
    readonly liveEnabled: boolean;
    health(): Promise<HealthResult>;
    getData<T = unknown>(opts?: RequestOptions): Promise<T>;
    validate(scenario: ScenarioInput, solution: Solution, opts?: RequestOptions): Promise<AuditReport>;
    solve(scenario: ScenarioInput, opts?: RequestOptions): Promise<Solution>;
    solveStream(scenario: ScenarioInput, opts: StreamOptions): Promise<Solution>;
    baseline(scenario: ScenarioInput, opts?: RequestOptions): Promise<Solution>;
    explain(scenario: ScenarioInput, solution: Solution, baseline: Solution | null, opts?: RequestOptions): Promise<Explanation>;
    plainEnglish(input: ExplainInput, opts?: RequestOptions): Promise<PlainEnglishResult>;
}

// Applies depot_retention 1 and time_limit_s 90 when the caller left them out.
// Sends only fields the caller set: the API's Scenario forbids unknown keys.
export function buildScenario(scenario: ScenarioInput): ScenarioInput {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scenario)) {
        if (value !== undefined) {
            out[key] = value;
        }
    }
    out.depot_retention = scenario.depot_retention ?? SCENARIO_DEFAULTS.depot_retention;
    out.time_limit_s = scenario.time_limit_s ?? SCENARIO_DEFAULTS.time_limit_s;
    return out as ScenarioInput;
}

function describeDetail(body: unknown, fallback: string): string {
    if (body && typeof body === 'object' && 'detail' in body) {
        const detail = (body as { detail: unknown }).detail;
        if (typeof detail === 'string') {
            return detail;
        }
        if (Array.isArray(detail)) {
            // FastAPI 422: [{ loc: [...], msg: '...' }]
            const parts = detail.map((item) => {
                if (item && typeof item === 'object') {
                    const loc = Array.isArray((item as { loc?: unknown }).loc)
                        ? ((item as { loc: unknown[] }).loc).filter((p) => p !== 'body').join('.')
                        : '';
                    const msg = String((item as { msg?: unknown }).msg ?? 'invalid');
                    return loc ? `${loc}: ${msg}` : msg;
                }
                return String(item);
            });
            if (parts.length) {
                return parts.join('; ');
            }
        }
    }
    return fallback;
}

async function readBody(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
    const baseUrl = (options.baseUrl ?? SOLVER_API_URL).trim().replace(/\/+$/, '');
    const enabled = baseUrl.length > 0;
    const tokens: TokenSource = options.tokens ?? { getAccessToken, refreshAccessToken };
    const doFetch: typeof fetch =
        options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
    const healthTimeoutMs = options.healthTimeoutMs ?? HEALTH_TIMEOUT_MS;
    const solveTimeoutMs = options.solveTimeoutMs ?? SOLVE_TIMEOUT_MS;
    const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

    async function send(
        method: 'GET' | 'POST',
        path: string,
        body: unknown,
        token: string | null,
        timeoutMs: number,
        signal?: AbortSignal,
    ): Promise<Response> {
        if (!enabled) {
            throw new ApiError(0, 'Live solving is not configured on this URL.', 'not_configured');
        }
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeoutMs);
        const onAbort = () => controller.abort();
        if (signal) {
            if (signal.aborted) {
                controller.abort();
            } else {
                signal.addEventListener('abort', onAbort, { once: true });
            }
        }
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        try {
            return await doFetch(baseUrl + path, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal,
                cache: 'no-store',
            });
        } catch (err) {
            if (timedOut) {
                throw new ApiError(0, `The solver did not answer within ${Math.round(timeoutMs / 1000)} s.`, 'timeout');
            }
            if (controller.signal.aborted) {
                throw new ApiError(0, 'Request cancelled.', 'aborted');
            }
            const reason = err instanceof Error ? err.message : String(err);
            throw new ApiError(0, `Cannot reach the solver API (${reason}).`, 'network');
        } finally {
            clearTimeout(timer);
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
        }
    }

    async function parseOk<T>(res: Response): Promise<T> {
        const body = await readBody(res);
        if (!res.ok) {
            throw new ApiError(res.status, describeDetail(body, `${res.status} ${res.statusText}`.trim()), 'http', body);
        }
        if (body === null || typeof body !== 'object') {
            throw new ApiError(res.status, 'The solver API returned an unexpected response.', 'bad_response', body);
        }
        return body as T;
    }

    // POST with the session token; on 401 refresh once and retry once, else AuthRequiredError.
    async function authedResponse(path: string, body: unknown, opts: RequestOptions = {}): Promise<Response> {
        const timeoutMs = opts.timeoutMs ?? solveTimeoutMs;
        const token = await tokens.getAccessToken();
        let res = await send('POST', path, body, token, timeoutMs, opts.signal);
        if (res.status === 401) {
            const fresh = await tokens.refreshAccessToken();
            if (!fresh) {
                throw new AuthRequiredError();
            }
            res = await send('POST', path, body, fresh, timeoutMs, opts.signal);
            if (res.status === 401) {
                throw new AuthRequiredError('Your session expired. Sign in with Google again to run the solver.');
            }
        }
        return res;
    }

    async function authedPost<T>(path: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
        return parseOk<T>(await authedResponse(path, body, opts));
    }

    // Reads NDJSON until the result line. Cancelling closes the connection, which ends the solve on the server.
    async function readStream(res: Response, opts: StreamOptions): Promise<Solution> {
        if (!res.ok) {
            await parseOk(res);
        }
        if (!res.body) {
            throw new ApiError(res.status, 'The solver API returned an empty stream.', 'bad_response');
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let cancelled = false;
        let idle = false;
        const onAbort = () => {
            cancelled = true;
            void reader.cancel();
        };
        if (opts.signal?.aborted) {
            onAbort();
        } else {
            opts.signal?.addEventListener('abort', onAbort, { once: true });
        }
        let silence: ReturnType<typeof setTimeout> | undefined;
        const watch = () => {
            clearTimeout(silence);
            silence = setTimeout(() => {
                idle = true;
                void reader.cancel();
            }, STREAM_IDLE_MS);
        };
        let buffer = '';
        let solution: Solution | null = null;
        const line = (text: string) => {
            if (!text.trim()) return;
            let event: SolveEvent;
            try {
                event = JSON.parse(text) as SolveEvent;
            } catch {
                throw new ApiError(res.status, 'The solver API sent an unreadable progress line.', 'bad_response');
            }
            if (event.type === 'error') {
                throw new ApiError(500, event.detail, 'http', event);
            }
            if (event.type === 'result') {
                solution = event.solution;
            }
            opts.onEvent(event);
        };
        try {
            watch();
            for (;;) {
                let chunk: ReadableStreamReadResult<Uint8Array>;
                try {
                    chunk = await reader.read();
                } catch (err) {
                    if (cancelled) break;
                    const reason = err instanceof Error ? err.message : String(err);
                    throw new ApiError(0, `Lost the solver API mid-run (${reason}).`, 'network');
                }
                if (chunk.done) break;
                watch();
                buffer += decoder.decode(chunk.value, { stream: true });
                const parts = buffer.split('\n');
                buffer = parts.pop() ?? '';
                parts.forEach(line);
            }
            line(buffer);
        } finally {
            clearTimeout(silence);
            opts.signal?.removeEventListener('abort', onAbort);
        }
        if (cancelled) {
            throw new ApiError(0, 'Request cancelled.', 'aborted');
        }
        if (idle) {
            throw new ApiError(0, `The solver went silent for ${Math.round(STREAM_IDLE_MS / 1000)} s.`, 'timeout');
        }
        if (!solution) {
            throw new ApiError(res.status, 'The solver stream ended without a result.', 'network');
        }
        return solution;
    }

    return {
        baseUrl,
        liveEnabled: enabled,

        async health(): Promise<HealthResult> {
            if (!enabled) {
                return { ok: false, status: 0, info: null, error: 'not configured' };
            }
            try {
                const res = await send('GET', '/api/health', undefined, null, healthTimeoutMs);
                const info = await readBody(res).catch(() => null);
                const flagged =
                    info && typeof info === 'object'
                        ? (info as { ok?: unknown; status?: unknown })
                        : {};
                const bodyOk =
                    flagged.ok !== false &&
                    !(typeof flagged.status === 'string' && /^(error|down|fail)/i.test(flagged.status));
                const ok = res.ok && bodyOk;
                return { ok, status: res.status, info, error: ok ? null : `health ${res.status}` };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { ok: false, status: 0, info: null, error: message };
            }
        },

        async getData<T = unknown>(opts: RequestOptions = {}): Promise<T> {
            const res = await send('GET', '/api/data', undefined, null, opts.timeoutMs ?? defaultTimeoutMs, opts.signal);
            return parseOk<T>(res);
        },

        async validate(scenario: ScenarioInput, solution: Solution, opts: RequestOptions = {}): Promise<AuditReport> {
            // The UI-attached `scenario` is not in the contract, and the API's Solution forbids unknown keys.
            const { scenario: _attached, ...wire } = solution;
            const res = await send(
                'POST',
                '/api/validate',
                { scenario: buildScenario(scenario), solution: wire },
                null,
                opts.timeoutMs ?? defaultTimeoutMs,
                opts.signal,
            );
            return parseOk<AuditReport>(res);
        },

        solve(scenario: ScenarioInput, opts?: RequestOptions): Promise<Solution> {
            return authedPost<Solution>('/api/solve', buildScenario(scenario), opts);
        },

        // Falls back to the plain endpoint when the API predates streaming: the run still finishes, unseen.
        async solveStream(scenario: ScenarioInput, opts: StreamOptions): Promise<Solution> {
            const res = await authedResponse('/api/solve/stream', buildScenario(scenario), opts);
            if (res.status === 404 || res.status === 405) {
                return authedPost<Solution>('/api/solve', buildScenario(scenario), opts);
            }
            return readStream(res, opts);
        },

        baseline(scenario: ScenarioInput, opts?: RequestOptions): Promise<Solution> {
            return authedPost<Solution>('/api/baseline', buildScenario(scenario), opts);
        },

        explain(scenario: ScenarioInput, solution: Solution, baseline: Solution | null, opts: RequestOptions = {}): Promise<Explanation> {
            // Strip the UI-attached `scenario`: the API's Solution forbids unknown keys.
            const { scenario: _attached, ...wire } = solution;
            const body: Record<string, unknown> = { scenario: buildScenario(scenario), solution: wire };
            if (baseline) {
                const { scenario: _baseAttached, ...baseWire } = baseline;
                body.baseline = baseWire;
            }
            return authedPost<Explanation>('/api/explain', body, { ...opts, timeoutMs: opts.timeoutMs ?? EXPLAIN_TIMEOUT_MS });
        },

        plainEnglish(input: ExplainInput, opts?: RequestOptions): Promise<PlainEnglishResult> {
            return authedPost<PlainEnglishResult>('/api/plain-english', input, { timeoutMs: PLAIN_ENGLISH_TIMEOUT_MS, ...opts });
        },
    };
}

// Default client from NEXT_PUBLIC_SOLVER_API_URL and the Supabase session.
export const api: ApiClient = createApiClient();

export const health = (): Promise<HealthResult> => api.health();
export const getData = <T = unknown>(opts?: RequestOptions): Promise<T> => api.getData<T>(opts);
export const validate = (scenario: ScenarioInput, solution: Solution, opts?: RequestOptions): Promise<AuditReport> =>
    api.validate(scenario, solution, opts);
export const solve = (scenario: ScenarioInput, opts?: RequestOptions): Promise<Solution> => api.solve(scenario, opts);
export const solveStream = (scenario: ScenarioInput, opts: StreamOptions): Promise<Solution> => api.solveStream(scenario, opts);
export const baseline = (scenario: ScenarioInput, opts?: RequestOptions): Promise<Solution> =>
    api.baseline(scenario, opts);
export const explain = (
    scenario: ScenarioInput,
    solution: Solution,
    baseline: Solution | null,
    opts?: RequestOptions,
): Promise<Explanation> => api.explain(scenario, solution, baseline, opts);
export const plainEnglish = (input: ExplainInput, opts?: RequestOptions): Promise<PlainEnglishResult> => api.plainEnglish(input, opts);
