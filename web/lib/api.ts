// Client for Damien's FastAPI solver (api/main.py).
// Public: GET /api/health, GET /api/data, POST /api/validate.
// Signed-in: POST /api/solve, POST /api/baseline, with Authorization: Bearer <Supabase access token>.
import type { AuditReport, Scenario, Solution } from './contract';
import { getAccessToken, refreshAccessToken } from './supabase';

export const SOLVER_API_URL = (process.env.NEXT_PUBLIC_SOLVER_API_URL ?? '').trim().replace(/\/+$/, '');

export const liveEnabled = SOLVER_API_URL.length > 0;

export const HEALTH_TIMEOUT_MS = 3_000;
export const SOLVE_TIMEOUT_MS = 150_000;
export const DEFAULT_TIMEOUT_MS = 30_000;

// Fixed unless a caller overrides them explicitly.
export const SCENARIO_DEFAULTS = { depot_retention: 1, time_limit_s: 90 } as const;

export type ScenarioInput = Partial<Scenario>;
export type { AuditReport };

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

export interface ApiClient {
    readonly baseUrl: string;
    readonly liveEnabled: boolean;
    health(): Promise<HealthResult>;
    getData<T = unknown>(opts?: RequestOptions): Promise<T>;
    validate(scenario: ScenarioInput, solution: Solution, opts?: RequestOptions): Promise<AuditReport>;
    solve(scenario: ScenarioInput, opts?: RequestOptions): Promise<Solution>;
    baseline(scenario: ScenarioInput, opts?: RequestOptions): Promise<Solution>;
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
    async function authedPost<T>(path: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
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
        return parseOk<T>(res);
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
            const res = await send(
                'POST',
                '/api/validate',
                { scenario: buildScenario(scenario), solution },
                null,
                opts.timeoutMs ?? defaultTimeoutMs,
                opts.signal,
            );
            return parseOk<AuditReport>(res);
        },

        solve(scenario: ScenarioInput, opts?: RequestOptions): Promise<Solution> {
            return authedPost<Solution>('/api/solve', buildScenario(scenario), opts);
        },

        baseline(scenario: ScenarioInput, opts?: RequestOptions): Promise<Solution> {
            return authedPost<Solution>('/api/baseline', buildScenario(scenario), opts);
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
export const baseline = (scenario: ScenarioInput, opts?: RequestOptions): Promise<Solution> =>
    api.baseline(scenario, opts);
