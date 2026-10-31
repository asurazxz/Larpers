// What the page knows about a solve in progress. Every value here arrived from the solver over
// POST /api/solve/stream; nothing is simulated or interpolated. `best` is never called optimal: only
// the final audited Solution earns a status label.
import { useSyncExternalStore } from 'react';
import { annualCost } from './annual';
import type { Leg, Solution } from './contract';

export interface LiveArc {
    leg: Leg;
    from: string;
    to: string;
    kt: number;
}

export interface LiveFacility {
    id: string;
    size: 'small' | 'large';
}

export interface LiveNetwork {
    depots: LiveFacility[];
    refineries: LiveFacility[];
    arcs: LiveArc[];
    primal: number;
    n_large: number;
    n_small: number;
}

export interface LiveNode {
    id: string;
    label: string;
    lat: number;
    lon: number;
}

/** A mix's raw engine state, plus `running` while a worker holds it. */
export type MixState = 'not_run' | 'running' | 'proven' | 'best_found' | 'infeasible' | 'no_incumbent' | 'failed' | 'skipped_capacity' | 'skipped_capex' | 'dominated';

export interface MixCell {
    n_large: number;
    n_small: number;
    state: MixState;
    primal: number | null;
    bound: number | null;
}

interface Summary {
    best: number | null;
    lower_bound: number | null;
    gap: number | null;
    settled: number;
    total: number;
    nodes: number;
}

type Arc = [Leg, string, string, number];
type Opened = [string, 'small' | 'large'];

/** One line of the stream. `result` and `error` end it. */
export type SolveEvent = { t?: number } & (
    | { type: 'start'; budget_s: number; candidates: string[]; n_depots: number; airports: LiveNode[] }
    | ({ type: 'portfolio'; workers: number; budget_s: number; mixes: Pick<MixCell, 'n_large' | 'n_small' | 'state' | 'bound'>[] } & Summary)
    | ({ type: 'mix'; n_large: number; n_small: number; state: MixState; primal: number | null; bound: number | null; seconds: number | null } & Summary)
    | ({ type: 'incumbent'; n_large: number; n_small: number; primal: number | null; improved?: boolean; depots: Opened[]; refineries: Opened[]; flows: Arc[] } & Summary)
    | ({ type: 'bound'; n_large: number; n_small: number; bound: number | null; nodes: number } & Summary)
    | { type: 'phase'; phase: 'polish' | 'audit' }
    | { type: 'tick' }
    | { type: 'result'; solution: Solution }
    | { type: 'error'; run_id?: string; detail: string }
);

export type SolvePhase = 'starting' | 'searching' | 'polish' | 'audit' | 'done' | 'failed';

export interface SeriesPoint {
    t: number;
    best: number | null;
    bound: number | null;
}

export interface SolveProgress {
    phase: SolvePhase;
    /** Browser clock at the start of the run. */
    startedAt: number;
    t: number;
    budgetS: number;
    candidates: string[];
    airports: LiveNode[];
    workers: number;
    /** Keyed `${n_large}:${n_small}`, in the solver's order. */
    mixes: Map<string, MixCell>;
    best: LiveNetwork | null;
    /** The newest incumbent from any mix, usually a worse plan than `best`. */
    latest: LiveNetwork | null;
    /** The greedy baseline, drawn until the solver beats it. */
    greedy: LiveNetwork | null;
    greedyUsd: number | null;
    bestUsd: number | null;
    lowerBoundUsd: number | null;
    gap: number | null;
    settled: number;
    total: number;
    nodes: number;
    incumbents: number;
    /** Best plan and lower bound over time. */
    series: SeriesPoint[];
    /** The final audited run, once it has arrived. */
    solution: Solution | null;
}

export const mixKey = (m: { n_large: number; n_small: number }): string => `${m.n_large}:${m.n_small}`;

export function emptyProgress(): SolveProgress {
    return {
        phase: 'starting',
        startedAt: Date.now(),
        t: 0,
        budgetS: 0,
        candidates: [],
        airports: [],
        workers: 0,
        mixes: new Map(),
        best: null,
        latest: null,
        greedy: null,
        greedyUsd: null,
        bestUsd: null,
        lowerBoundUsd: null,
        gap: null,
        settled: 0,
        total: 0,
        nodes: 0,
        incumbents: 0,
        series: [],
        solution: null,
    };
}

function network(e: Extract<SolveEvent, { type: 'incumbent' }>): LiveNetwork {
    return {
        depots: e.depots.map(([id, size]) => ({ id, size })),
        refineries: e.refineries.map(([id, size]) => ({ id, size })),
        arcs: e.flows.map(([leg, from, to, kt]) => ({ leg, from, to, kt })),
        primal: e.primal ?? Number.POSITIVE_INFINITY,
        n_large: e.n_large,
        n_small: e.n_small,
    };
}

function withSummary(p: SolveProgress, e: Summary & { t?: number }): void {
    p.bestUsd = e.best;
    p.lowerBoundUsd = e.lower_bound;
    p.gap = e.gap;
    p.settled = e.settled;
    p.total = e.total;
    p.nodes = e.nodes;
    const last = p.series[p.series.length - 1];
    if (!last || last.best !== e.best || last.bound !== e.lower_bound) {
        p.series = [...p.series, { t: e.t ?? p.t, best: e.best, bound: e.lower_bound }];
    }
}

/** Folds one stream event into a new progress value. */
export function applyEvent(state: SolveProgress, e: SolveEvent): SolveProgress {
    const p: SolveProgress = { ...state, t: e.t ?? state.t };
    switch (e.type) {
        case 'start':
            p.phase = 'searching';
            p.budgetS = e.budget_s;
            p.candidates = e.candidates;
            p.airports = e.airports;
            return p;
        case 'portfolio':
            p.workers = e.workers;
            p.mixes = new Map(e.mixes.map((m) => [mixKey(m), { ...m, primal: null }]));
            withSummary(p, e);
            return p;
        case 'mix': {
            p.mixes = new Map(p.mixes);
            p.mixes.set(mixKey(e), { n_large: e.n_large, n_small: e.n_small, state: e.state, primal: e.primal, bound: e.bound });
            withSummary(p, e);
            return p;
        }
        case 'incumbent': {
            const net = network(e);
            p.incumbents += 1;
            p.latest = net;
            if (e.improved) p.best = net;
            withSummary(p, e);
            return p;
        }
        case 'bound':
            withSummary(p, e);
            return p;
        case 'phase':
            p.phase = e.phase;
            return p;
        case 'result':
            p.phase = 'done';
            p.solution = e.solution;
            return p;
        case 'error':
            p.phase = 'failed';
            return p;
        case 'tick':
            return p;
    }
}

/**
 * The baseline's cost on the MILP objective's basis: annual cost times horizon. Its own `primal` charges
 * full CapEx, so it cannot be set against the solver's numbers.
 */
export function greedyObjective(s: Solution): number | null {
    const annual = annualCost(s).total;
    const horizon = s.scenario?.horizon_years;
    return s.status === 'infeasible' || annual === null || !horizon ? null : annual * horizon;
}

/** The greedy baseline as a network, or null when it found none. */
export function greedyNetwork(s: Solution): LiveNetwork | null {
    const primal = greedyObjective(s);
    if (primal === null) return null;
    return {
        depots: s.facilities.filter((f) => f.type === 'depot').map((f) => ({ id: f.site_id, size: f.size })),
        refineries: s.facilities.filter((f) => f.type === 'refinery').map((f) => ({ id: f.site_id, size: f.size })),
        arcs: s.flows.map((f) => ({ leg: f.leg, from: f.from, to: f.to, kt: f.kt })),
        primal,
        n_large: s.facilities.filter((f) => f.type === 'refinery' && f.size === 'large').length,
        n_small: s.facilities.filter((f) => f.type === 'refinery' && f.size === 'small').length,
    };
}

export interface SolveFeed {
    get: () => SolveProgress | null;
    subscribe: (listener: () => void) => () => void;
    begin: () => void;
    push: (e: SolveEvent) => void;
    /** Records the greedy baseline as soon as it is known. */
    setGreedy: (s: Solution | null) => void;
    /** Ends the display: at once for a failure or cancel, after `lingerMs` to let a result be read. */
    end: (lingerMs?: number) => void;
}

/** Shortest time between refreshes of the panel and map during a burst of events. */
const FLUSH_MS = 90;

/**
 * Holds the run outside React state, so a burst of events repaints the panel and the map layer only.
 * Subscribers see at most one update every FLUSH_MS.
 */
export function createSolveFeed(): SolveFeed {
    let latest: SolveProgress | null = null;
    let published: SolveProgress | null = null;
    let timer: number | null = null;
    let linger: number | null = null;
    const listeners = new Set<() => void>();

    const publish = () => {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        published = latest;
        listeners.forEach((listener) => listener());
    };
    const schedule = () => {
        if (timer === null) timer = window.setTimeout(publish, FLUSH_MS);
    };
    const stopLinger = () => {
        if (linger !== null) window.clearTimeout(linger);
        linger = null;
    };

    return {
        get: () => published,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        begin() {
            stopLinger();
            latest = emptyProgress();
            publish();
        },
        push(e) {
            if (!latest) return;
            latest = applyEvent(latest, e);
            schedule();
        },
        setGreedy(s) {
            if (!latest || !s) return;
            latest = { ...latest, greedy: greedyNetwork(s), greedyUsd: greedyObjective(s) };
            schedule();
        },
        end(lingerMs = 0) {
            stopLinger();
            const clear = () => {
                latest = null;
                publish();
            };
            if (lingerMs > 0) {
                publish();
                linger = window.setTimeout(clear, lingerMs);
            } else {
                clear();
            }
        },
    };
}

export const isSolving = (p: SolveProgress | null): boolean => !!p && p.phase !== 'done' && p.phase !== 'failed';

export function useSolveProgress(feed: SolveFeed): SolveProgress | null {
    return useSyncExternalStore(feed.subscribe, feed.get, () => null);
}

export function useSolving(feed: SolveFeed): boolean {
    return useSyncExternalStore(feed.subscribe, () => isSolving(feed.get()), () => false);
}

/** True while there is a run to show, which outlasts the solve by the result's linger. */
export function useFeedActive(feed: SolveFeed): boolean {
    return useSyncExternalStore(feed.subscribe, () => feed.get() !== null, () => false);
}
