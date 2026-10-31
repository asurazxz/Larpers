'use client';

// App-wide state shared by every workspace page. One route only (static export with a relative
// asset prefix), so pages switch on the URL hash (#overview, #network, ...) inside one React tree:
// the selected run, live run, map selection and scenario form survive page switches for free.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Flow, Solution } from './contract';
import { baseEntry, solutionOf } from './bundle';
import { DEFAULT_VIEW, flowKey, type View } from './view';
import { isLiveDisplayed, useSolverHealth, type LiveRun, type SolverHealth } from './useLive';
import { baseSolution, disruptHighlight, robustness, siteBandFn, type RobustKind } from './robustness';
import { storedBaselineFor } from '../components/CostPanel';
import { createSolveFeed, type SolveFeed } from './solveProgress';
import type { Band } from './view';

export const PAGES = ['overview', 'network', 'scenarios', 'results', 'reliability'] as const;
export type PageKey = (typeof PAGES)[number];

export interface SelectedFlow {
    flow: Flow;
    index: number;
}

export interface AppState {
    page: PageKey;
    /** Navigate to a workspace page; optional sub-tab is kept in the hash as #page/tab. */
    go: (page: PageKey, tab?: string) => void;
    tab: string | null;
    view: View;
    setView: (v: View) => void;
    solution: Solution | null;
    setSolution: (s: Solution | null) => void;
    /** Select a stored sweep/disrupt view and its solution together (clears map selection). */
    selectView: (v: View, s: Solution | null) => void;
    solverHealth: SolverHealth;
    liveRun: LiveRun | null;
    onLiveRun: (run: LiveRun) => void;
    isLive: boolean;
    /** Greedy baseline for the displayed run: live baseline or the stored baseline run, else null. */
    baseline: Solution | null;
    selectedFlow: SelectedFlow | null;
    selectFlow: (f: SelectedFlow | null) => void;
    selectedNode: string | null;
    selectNode: (id: string | null) => void;
    /** Node click counter for ScenarioPanel's exclusion picker. */
    pickedNode: { id: string; seq: number } | null;
    highlight: ReadonlySet<string>;
    robustKind: RobustKind;
    setRobustKind: (k: RobustKind) => void;
    bandFor: ((siteId: string) => Band | null) | undefined;
    /** True when the scenario form differs from the displayed run's inputs (set by the planner). */
    dirty: boolean;
    setDirty: (d: boolean) => void;
    /** Live solve progress: the map draws what the solver has found so far during a run. */
    feed: SolveFeed;
}

const Ctx = createContext<AppState | null>(null);

/** Workspace route of a hash (#results/compare → results, compare), or null for any other hash. */
export function parseWorkspaceHash(hash: string): { page: PageKey; tab: string | null } | null {
    const [p, t] = hash.replace(/^#\/?/, '').split('/');
    return (PAGES as readonly string[]).includes(p) ? { page: p as PageKey, tab: t || null } : null;
}

function parseHash(): { page: PageKey; tab: string | null } {
    if (typeof window === 'undefined') return { page: 'overview', tab: null };
    return parseWorkspaceHash(window.location.hash) ?? { page: 'overview', tab: null };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
    // AppProvider only mounts in the browser (app/page.tsx renders a placeholder until the hash is known).
    const [{ page, tab }, setRoute] = useState<{ page: PageKey; tab: string | null }>(parseHash);
    useEffect(() => {
        // Leaving for #home or #planner unmounts the workspace; only workspace hashes move the route.
        const sync = () => {
            const r = parseWorkspaceHash(window.location.hash);
            if (r) setRoute(r);
        };
        window.addEventListener('hashchange', sync);
        return () => window.removeEventListener('hashchange', sync);
    }, []);
    const go = useCallback((p: PageKey, t?: string) => {
        const h = `#${p}${t ? `/${t}` : ''}`;
        if (window.location.hash !== h) window.location.hash = h;
        setRoute({ page: p, tab: t ?? null });
    }, []);

    const [view, setView] = useState<View>(DEFAULT_VIEW);
    const [solution, setSolution] = useState<Solution | null>(solutionOf(baseEntry()) ?? null);
    const solverHealth = useSolverHealth();
    const [liveRun, setLiveRun] = useState<LiveRun | null>(null);
    const isLive = isLiveDisplayed(solution, liveRun) || (view.kind === 'disrupt' && !!view.live);
    const liveBaseline = isLiveDisplayed(solution, liveRun) ? (liveRun?.baseline ?? null) : null;
    const baseline = view.kind === 'disrupt' ? null : (liveBaseline ?? storedBaselineFor(solution));

    const [selectedFlow, setSelectedFlow] = useState<SelectedFlow | null>(null);
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [pickedNode, setPickedNode] = useState<{ id: string; seq: number } | null>(null);
    const [robustKind, setRobustKind] = useState<RobustKind>('off');
    const [dirty, setDirty] = useState(false);
    const feed = useMemo(createSolveFeed, []);

    const selectFlow = useCallback((f: SelectedFlow | null) => {
        setSelectedFlow(f);
        if (f) setSelectedNode(null);
    }, []);
    const selectNode = useCallback((id: string | null) => {
        setSelectedNode(id);
        if (id) {
            setSelectedFlow(null);
            setPickedNode((p) => ({ id, seq: (p?.seq ?? 0) + 1 }));
        }
    }, []);
    const selectView = useCallback((v: View, s: Solution | null) => {
        setView(v);
        setSolution(s);
        setSelectedFlow(null);
    }, []);
    const onLiveRun = useCallback((run: LiveRun) => {
        setLiveRun(run);
        setSolution(run.solution);
        setDirty(false);
    }, []);

    const viewHighlight = useMemo(
        () => (view.kind === 'disrupt' && solution ? disruptHighlight(baseSolution(), solution, view.siteIds ?? []) : null),
        [view, solution],
    );
    const highlight = useMemo<ReadonlySet<string>>(() => {
        if (selectedFlow) return new Set([flowKey(selectedFlow.flow), selectedFlow.flow.from, selectedFlow.flow.to]);
        if (selectedNode && solution) {
            const s = new Set<string>([selectedNode]);
            for (const f of solution.flows) {
                if (f.from === selectedNode || f.to === selectedNode) {
                    s.add(flowKey(f));
                    s.add(f.from);
                    s.add(f.to);
                }
            }
            return s;
        }
        return viewHighlight ?? new Set<string>();
    }, [selectedFlow, selectedNode, solution, viewHighlight]);
    const bandFor = useMemo(() => siteBandFn(robustKind === 'off' ? null : robustness(robustKind)), [robustKind]);

    const value: AppState = {
        page,
        go,
        tab,
        view,
        setView,
        solution,
        setSolution,
        selectView,
        solverHealth,
        liveRun,
        onLiveRun,
        isLive,
        baseline,
        selectedFlow,
        selectFlow,
        selectedNode,
        selectNode,
        pickedNode,
        highlight,
        robustKind,
        setRobustKind,
        bandFor,
        dirty,
        setDirty,
        feed,
    };
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
    const v = useContext(Ctx);
    if (!v) throw new Error('useApp outside AppProvider');
    return v;
}
