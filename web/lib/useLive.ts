// Live-run state: solver health polling, the scenario form, and the solve + baseline run.
// The page keeps `solution` as the single source of truth; a live result is displayed by
// passing it to setSolution, exactly as a stored run is.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, baseline, health, liveEnabled, solveStream } from './api';
import { bundle, getEntry, siteById, sites, slugs, solutionOf } from './bundle';
import {
    AIRPORTS,
    DEFAULT_SCENARIO,
    type AirportCode,
    type BundleEntry,
    type CapacityBasis,
    type CollectionPolicy,
    type Scenario,
    type Solution,
} from './contract';
import type { SolveFeed } from './solveProgress';
import { baseView, disruptView, gridView, type View } from './view';

// ---------- Options (sweep values from the brief amendments) ----------

export const YIELD_OPTIONS = [0.13, 0.15, 0.1598, 0.16, 0.17, 0.19] as const;
export const ROAD_FACTOR_OPTIONS = [1.4, 1.9, 2.3] as const;
export const HORIZON_OPTIONS = [1, 5, 10] as const;
export const TIME_LIMIT_S = 90;
export const DEPOT_RETENTION = 1;
export const HEALTH_POLL_MS = 10_000;

/** Onshore sites: the facility candidates (sea plots are supply only). */
export const CANDIDATE_IDS: string[] = sites.filter((s) => !s.sea).map((s) => s.id);
const CANDIDATE_SET = new Set(CANDIDATE_IDS);
export const isCandidate = (id: string): boolean => CANDIDATE_SET.has(id);

// ---------- Health ----------

export type HealthState = 'disabled' | 'checking' | 'up' | 'down';

export interface SolverHealth {
    state: HealthState;
    /** Last error text from /api/health, if down. */
    error: string | null;
    checkedAt: number | null;
    /** Re-check now (e.g. after a failed run). */
    recheck: () => void;
}

/** Polls GET /api/health every 10 s when a solver URL is configured. */
export function useSolverHealth(): SolverHealth {
    const [state, setState] = useState<HealthState>(liveEnabled ? 'checking' : 'disabled');
    const [error, setError] = useState<string | null>(null);
    const [checkedAt, setCheckedAt] = useState<number | null>(null);
    const alive = useRef(true);
    const inFlight = useRef(false);

    const check = useCallback(async () => {
        if (!liveEnabled || inFlight.current) return;
        inFlight.current = true;
        try {
            const res = await health();
            if (!alive.current) return;
            setState(res.ok ? 'up' : 'down');
            setError(res.ok ? null : res.error);
            setCheckedAt(Date.now());
        } finally {
            inFlight.current = false;
        }
    }, []);

    useEffect(() => {
        alive.current = true;
        if (!liveEnabled) return;
        void check();
        const timer = window.setInterval(() => void check(), HEALTH_POLL_MS);
        return () => {
            alive.current = false;
            window.clearInterval(timer);
        };
    }, [check]);

    return { state, error, checkedAt, recheck: () => void check() };
}

// ---------- Live run record ----------

export interface LiveRun {
    solution: Solution;
    /** Greedy baseline for the same scenario, or null if that call failed. */
    baseline: Solution | null;
    baselineError: string | null;
    scenario: Scenario;
    finishedAt: number;
    elapsedS: number;
}

/** True when the displayed solution is the live result (identity, so any other setSolution makes it stored). */
export function isLiveDisplayed(solution: Solution | null | undefined, liveRun: LiveRun | null): boolean {
    return !!solution && !!liveRun && solution === liveRun.solution;
}

// ---------- Stored runs ----------

/** The bundle slug whose stored solution is the displayed one, if any. */
export function storedSlugOf(solution: Solution | null | undefined): string | undefined {
    if (!solution) return undefined;
    for (const slug of slugs()) {
        if (solutionOf(bundle[slug]) === solution) return slug;
    }
    for (const slug of slugs()) {
        if (solutionOf(bundle[slug])?.run_id === solution.run_id) return slug;
    }
    return undefined;
}

/** View for a stored entry: base | grid (yield, road factor) | disrupt. */
export function viewForEntry(entry: BundleEntry | undefined): View {
    if (!entry) return baseView();
    const fam = (entry.family ?? '').toLowerCase();
    if (fam === 'base') return baseView();
    if (fam.startsWith('disrupt')) return disruptView(entry.slug);
    if (fam === 'grid' || fam === 'sweep') {
        const p = (entry.params ?? {}) as Record<string, unknown>;
        const sc = solutionOf(entry)?.scenario;
        const y = Number(p.yield ?? p.yield_value ?? sc?.yield);
        const r = Number(p.road_factor ?? sc?.road_factor);
        if (Number.isFinite(y) && Number.isFinite(r)) return gridView(y, r);
    }
    return baseView();
}

export function entryForSlug(slug: string): BundleEntry | undefined {
    return getEntry(slug);
}

// ---------- Scenario form ----------

/** Form values as strings, so blanks survive (blank demand = full-production preset). */
export interface ScenarioForm {
    demand: Record<AirportCode, string>;
    yieldValue: string;
    roadFactor: string;
    horizon: string;
    collection: CollectionPolicy;
    capacityBasis: CapacityBasis;
    excluded: string[];
}

const BLANK_DEMAND: Record<AirportCode, string> = { PNK: '', PKN: '', BPN: '', TRK: '' };

/** Form defaults from a run's echoed scenario, else the contract defaults with blank demand. */
export function formFromScenario(sc: Scenario | undefined | null): ScenarioForm {
    const base = sc ?? DEFAULT_SCENARIO;
    const demand = { ...BLANK_DEMAND };
    if (base.demand_kt) {
        for (const a of AIRPORTS) {
            const v = base.demand_kt[a];
            demand[a] = v === undefined || v === null ? '' : String(v);
        }
    }
    return {
        demand,
        yieldValue: String(base.yield ?? DEFAULT_SCENARIO.yield),
        roadFactor: String(base.road_factor ?? DEFAULT_SCENARIO.road_factor),
        horizon: String(base.horizon_years ?? DEFAULT_SCENARIO.horizon_years),
        collection: base.collection_policy ?? DEFAULT_SCENARIO.collection_policy,
        capacityBasis: base.capacity_basis ?? DEFAULT_SCENARIO.capacity_basis,
        excluded: [...(base.excluded_ids ?? [])],
    };
}

export type FormErrors = Partial<Record<'demand' | 'yield' | 'road' | 'horizon' | 'excluded', string>>;

/** Validates like solver/contract.py Scenario and builds the request. Errors are typed, never silent defaults. */
export function buildScenarioFromForm(form: ScenarioForm): { scenario: Scenario | null; errors: FormErrors } {
    const errors: FormErrors = {};

    const filled = AIRPORTS.filter((a) => form.demand[a].trim() !== '');
    let demand_kt: Scenario['demand_kt'] = null;
    if (filled.length > 0 && filled.length < AIRPORTS.length) {
        errors.demand = 'Fill all four airports, or leave all blank for the full-production preset.';
    } else if (filled.length === AIRPORTS.length) {
        const d = {} as Record<AirportCode, number>;
        for (const a of AIRPORTS) {
            const v = Number(form.demand[a]);
            if (!Number.isFinite(v) || v < 0) {
                errors.demand = `${a} demand must be a number ≥ 0 kt.`;
                break;
            }
            d[a] = v;
        }
        if (!errors.demand) demand_kt = d;
    }

    const y = Number(form.yieldValue);
    if (!Number.isFinite(y) || y <= 0 || y > 1) errors.yield = 'Yield must be in (0, 1].';

    const r = Number(form.roadFactor);
    if (!Number.isFinite(r) || r < 1) errors.road = 'Road factor must be ≥ 1.';

    const h = Number(form.horizon);
    if (!Number.isFinite(h) || h < 1) errors.horizon = 'Horizon must be ≥ 1 year.';

    const unknown = form.excluded.filter((id) => !siteById(id));
    if (unknown.length) errors.excluded = `Unknown site id: ${unknown.join(', ')}`;

    if (Object.keys(errors).length) return { scenario: null, errors };
    return {
        scenario: {
            demand_kt,
            yield: y,
            depot_retention: DEPOT_RETENTION,
            road_factor: r,
            horizon_years: h,
            collection_policy: form.collection,
            capacity_basis: form.capacityBasis,
            excluded_ids: [...form.excluded].sort(),
            time_limit_s: TIME_LIMIT_S,
        },
        errors,
    };
}

// The current form, readable by other pages without lifting state.
let currentForm: ScenarioForm | null = null;
export const setCurrentForm = (f: ScenarioForm | null): void => {
    currentForm = f;
};
export const getCurrentForm = (): ScenarioForm | null => currentForm;

// ---------- Run ----------

export type RunPhase = 'idle' | 'running' | 'done' | 'infeasible' | 'error';

export interface RunState {
    phase: RunPhase;
    startedAt: number | null;
    elapsedS: number;
    message: string | null;
    runId: string | null;
}

function describeError(err: unknown): string {
    if (err instanceof ApiError) {
        switch (err.kind) {
            case 'timeout':
                return `Timed out: ${err.message} Still showing the previous run.`;
            case 'network':
                return `${err.message} Still showing the previous run.`;
            case 'aborted':
                return 'Run cancelled. Still showing the previous run.';
            case 'http':
                return `Solver API error ${err.status}: ${err.message}. Still showing the previous run.`;
            default:
                return `${err.message} Still showing the previous run.`;
        }
    }
    return `Run failed: ${err instanceof Error ? err.message : String(err)}. Still showing the previous run.`;
}

/** How long the finished solve stays on screen before the panel clears. */
export const RESULT_LINGER_MS = 1_800;

/** Runs solve and baseline in parallel with a ticking elapsed counter, feeding the solver's progress to `feed`. */
export function useLiveRunner(onResult: (run: LiveRun) => void, feed: SolveFeed, onFailure?: () => void) {
    const [state, setState] = useState<RunState>({ phase: 'idle', startedAt: null, elapsedS: 0, message: null, runId: null });
    const controller = useRef<AbortController | null>(null);
    const resultRef = useRef(onResult);
    const failureRef = useRef(onFailure);
    const feedRef = useRef(feed);
    resultRef.current = onResult;
    failureRef.current = onFailure;
    feedRef.current = feed;

    useEffect(() => {
        if (state.phase !== 'running' || state.startedAt === null) return;
        const started = state.startedAt;
        const t = window.setInterval(() => {
            setState((s) => (s.phase === 'running' ? { ...s, elapsedS: (Date.now() - started) / 1000 } : s));
        }, 200);
        return () => window.clearInterval(t);
    }, [state.phase, state.startedAt]);

    useEffect(() => () => controller.current?.abort(), []);

    const run = useCallback(async (scenario: Scenario) => {
        controller.current?.abort();
        const ctl = new AbortController();
        controller.current = ctl;
        const startedAt = Date.now();
        setState({ phase: 'running', startedAt, elapsedS: 0, message: null, runId: null });
        feedRef.current.begin();

        const [sol, base] = await Promise.allSettled([
            solveStream(scenario, { signal: ctl.signal, onEvent: (e) => controller.current === ctl && feedRef.current.push(e) }),
            baseline(scenario, { signal: ctl.signal }).then((b) => {
                if (controller.current === ctl) feedRef.current.setGreedy({ ...b, scenario });
                return b;
            }),
        ]);
        if (controller.current !== ctl) return; // superseded by a newer run
        controller.current = null;
        const elapsedS = (Date.now() - startedAt) / 1000;

        if (sol.status === 'rejected') {
            const err = sol.reason;
            feedRef.current.end();
            setState({ phase: 'error', startedAt: null, elapsedS, message: describeError(err), runId: null });
            failureRef.current?.();
            return;
        }

        // If the API does not echo the scenario, attach the one we sent (the map draws exclusions from it).
        const solution = sol.value && !sol.value.scenario ? { ...sol.value, scenario } : sol.value;
        if (!solution || !Array.isArray(solution.flows) || !Array.isArray(solution.facilities)) {
            feedRef.current.end();
            setState({
                phase: 'error',
                startedAt: null,
                elapsedS,
                message: 'The solver returned a response without flows or facilities. Still showing the previous run.',
                runId: null,
            });
            return;
        }
        const baselineError =
            base.status === 'rejected'
                ? base.reason instanceof Error
                    ? base.reason.message
                    : String(base.reason)
                : null;
        feedRef.current.end(RESULT_LINGER_MS);
        resultRef.current({
            solution,
            baseline: base.status === 'fulfilled' ? (base.value && !base.value.scenario ? { ...base.value, scenario } : base.value) : null,
            baselineError,
            scenario,
            finishedAt: Date.now(),
            elapsedS,
        });
        setState({
            phase: solution.status === 'infeasible' ? 'infeasible' : 'done',
            startedAt: null,
            elapsedS,
            message: baselineError ? `Baseline failed: ${baselineError}` : null,
            runId: solution.run_id,
        });
    }, []);

    const cancel = useCallback(() => controller.current?.abort(), []);

    const clear = useCallback(() => setState({ phase: 'idle', startedAt: null, elapsedS: 0, message: null, runId: null }), []);

    return { state, run, cancel, clear };
}
