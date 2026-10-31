'use client';

// One page, one screen (1280x720). Phase-2 components drop into the slot divs below by id:
// #header-badge, #auth-slot, #map-slot, #trace-slot, #panel-scenario, #panel-cost,
// #panel-assumptions, #panel-disrupt, #panel-robustness, #failure-band.
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { Flow, Solution } from '../lib/contract';
import { baseEntry, sites, solutionOf } from '../lib/bundle';
import { DEFAULT_VIEW, flowKey, type View } from '../lib/view';
import Header from '../components/Header';
import ScenarioPanel from '../components/ScenarioPanel';
import { isLiveDisplayed, useSolverHealth, type LiveRun } from '../lib/useLive';
import SweepPicker from '../components/SweepPicker';
import Disrupt from '../components/Disrupt';
import Robustness from '../components/Robustness';
import { baseSolution, disruptHighlight, robustness, siteBandFn, type RobustKind } from '../lib/robustness';
import CostPanel, { storedBaselineFor } from '../components/CostPanel';
import Provenance from '../components/Provenance';
import FailureBand from '../components/FailureBand';
import Trace from '../components/Trace';

const SafMap = dynamic(() => import('./Map'), {
    ssr: false,
    loading: () => <div className="flex h-full items-center justify-center text-gray-500">Loading map…</div>,
});

function Section({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
    return (
        <section id={id} className="border-b border-gray-200 px-3 py-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600">{title}</h2>
            <div className="mt-1">{children}</div>
        </section>
    );
}

export default function Page() {
    const entry = baseEntry();
    const [view, setView] = useState<View>(DEFAULT_VIEW);
    const [solution, setSolution] = useState<Solution | null>(solutionOf(entry) ?? null);
    // Live run (Header, ScenarioPanel). The displayed run is live only while `solution` is that exact
    // object; any other setSolution (stored radio, sweep, disrupt) makes it a stored run again.
    const solverHealth = useSolverHealth();
    const [liveRun, setLiveRun] = useState<LiveRun | null>(null);
    const isLive = isLiveDisplayed(solution, liveRun) || (view.kind === 'disrupt' && !!view.live);
    /** Greedy baseline for the displayed live run (null for stored runs). */
    const baselineSolution = isLiveDisplayed(solution, liveRun) ? (liveRun?.baseline ?? null) : null;
    const [pickedNode, setPickedNode] = useState<{ id: string; seq: number } | null>(null);
    const [selected, setSelected] = useState<{ flow: Flow; index: number } | null>(null);
    const highlight = useMemo(
        () => (selected ? new Set([flowKey(selected.flow), selected.flow.from, selected.flow.to]) : new Set<string>()),
        [selected],
    );

    // Sweep / disrupt / robustness (components/SweepPicker, Disrupt, Robustness). One View state:
    // selecting a stored sweep run or a disruption replaces the other.
    const [robustKind, setRobustKind] = useState<RobustKind>('off');
    const selectView = (v: View, s: Solution | null) => {
        setView(v);
        setSolution(s);
        setSelected(null);
    };
    const viewHighlight = useMemo(
        () => (view.kind === 'disrupt' && solution ? disruptHighlight(baseSolution(), solution, view.siteIds ?? []) : null),
        [view, solution],
    );
    const bandFor = useMemo(() => siteBandFn(robustKind === 'off' ? null : robustness(robustKind)), [robustKind]);

    return (
        <div className="flex h-screen flex-col overflow-hidden" data-view={view.kind}>
            {/* Header: run label, badge (#header-badge) and auth (#auth-slot), from components/Header.tsx */}
            <Header solution={solution} view={view} health={solverHealth} isLive={isLive} />
            {/* Provenance strip (components/Provenance.tsx): run, stored/live, hashes, trace count. */}
            <Provenance solution={solution} entry={entry} live={isLive} />

            {/* Main: map ~65%, right column ~35% */}
            <main className="flex min-h-0 flex-1">
                <div id="map-slot" className="relative h-full" style={{ width: '65%' }}>
                    <SafMap
                        solution={solution}
                        sites={sites}
                        highlight={selected ? highlight : (viewHighlight ?? highlight)}
                        bandFor={bandFor}
                        onSelectFlow={(flow, index) => setSelected({ flow, index })}
                        onSelectNode={(id) => setPickedNode((p) => ({ id, seq: (p?.seq ?? 0) + 1 }))}
                    />
                    {/* TRACE SLOT: arc-click trace panel, absolutely positioned over the map. */}
                    <div id="trace-slot" className="pointer-events-none absolute bottom-2 left-2 z-[1000]">
                        <Trace solution={solution} selected={selected} onClose={() => setSelected(null)} />
                    </div>
                </div>

                <aside id="right-column" className="h-full overflow-y-auto border-l border-gray-300" style={{ width: '35%' }}>
                    <Section id="panel-scenario" title="Scenario / Run">
                        <ScenarioPanel
                            solution={solution}
                            health={solverHealth}
                            isLive={isLive}
                            setSolution={setSolution}
                            setView={setView}
                            onLiveRun={(run) => {
                                setLiveRun(run);
                                setSolution(run.solution);
                            }}
                            pickedNode={pickedNode}
                        />
                    </Section>

                    <Section id="panel-cost" title="Cost (USD)">
                        <CostPanel
                            solution={solution}
                            baseline={view.kind === 'disrupt' ? null : (baselineSolution ?? storedBaselineFor(solution))}
                        />
                    </Section>

                    <Section id="panel-assumptions" title="Assumptions / Sweep">
                        <SweepPicker view={view} onSelect={selectView} />
                    </Section>
                    <Section id="panel-disrupt" title="Disrupt (at base assumptions)">
                        <Disrupt view={view} solution={solution} onSelect={selectView} focusSiteId={pickedNode?.id ?? null} />
                    </Section>
                    <Section id="panel-robustness" title="Robustness">
                        <Robustness kind={robustKind} onKindChange={setRobustKind} />
                    </Section>
                </aside>
            </main>

            {/* Permanent failure band: never behind a click. */}
            <footer id="failure-band" className="border-t-2 border-gray-800 bg-gray-50 px-4 py-2">
                <FailureBand solution={solution} onSelectFlow={(flow, index) => setSelected({ flow, index })} />
            </footer>
        </div>
    );
}
