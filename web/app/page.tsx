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
import CostPanel, { CostSummary, storedBaselineFor } from '../components/CostPanel';
import Provenance from '../components/Provenance';
import FailureBand from '../components/FailureBand';
import Trace from '../components/Trace';

const SafMap = dynamic(() => import('./Map'), {
    ssr: false,
    loading: () => <div className="flex h-full items-center justify-center text-ink2">Loading map…</div>,
});

function Section({ id, title, aside, children }: { id: string; title: string; aside?: string; children?: React.ReactNode }) {
    return (
        <section id={id} className="card px-5 py-3.5">
            <h2 className="flex items-baseline justify-between gap-3">
                <span className="card-title">{title}</span>
                {aside && <span className="text-base text-ink2">{aside}</span>}
            </h2>
            <div className="mt-1.5">{children}</div>
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
    const costBaseline = view.kind === 'disrupt' ? null : (baselineSolution ?? storedBaselineFor(solution));
    const bandFor = useMemo(() => siteBandFn(robustKind === 'off' ? null : robustness(robustKind)), [robustKind]);

    return (
        <div className="flex min-h-screen flex-col bg-canvas text-ink md:h-screen md:overflow-hidden" data-view={view.kind}>
            {/* Translucent header: run label, badge (#header-badge), auth (#auth-slot) and the provenance strip. */}
            <div className="relative z-[1100] bg-white/80 backdrop-blur-xl backdrop-saturate-150 hair-b md:sticky md:top-0">
                <Header solution={solution} view={view} health={solverHealth} isLive={isLive} />
                <Provenance solution={solution} entry={entry} live={isLive} />
            </div>

            {/* Main: map 60%, right column 40% */}
            <main className="flex flex-col gap-3 px-3 pt-3 md:min-h-0 md:flex-1 md:flex-row">
                <div
                    id="map-slot"
                    className="relative h-[55vh] min-h-[320px] min-w-0 overflow-hidden rounded-card bg-white shadow-card md:h-full md:min-h-0 md:flex-[3_1_0%]"
                >
                    <SafMap
                        solution={solution}
                        sites={sites}
                        highlight={selected ? highlight : (viewHighlight ?? highlight)}
                        bandFor={bandFor}
                        onSelectFlow={(flow, index) => setSelected({ flow, index })}
                        onSelectNode={(id) => setPickedNode((p) => ({ id, seq: (p?.seq ?? 0) + 1 }))}
                    />
                    {/* Arc-click trace panel, floating over the map. */}
                    <div id="trace-slot" className="pointer-events-none absolute bottom-3 left-3 z-[1000] flex max-h-[calc(100%-1.5rem)]">
                        <Trace solution={solution} selected={selected} onClose={() => setSelected(null)} />
                    </div>
                </div>

                <aside id="right-column" className="min-w-0 pb-3 md:h-full md:flex-[2_1_0%] md:overflow-y-auto">
                    {/* Pinned summary: total, status, audit and baseline stay visible while the column scrolls. */}
                    <div id="panel-summary" className="z-10 bg-canvas pb-3 md:sticky md:top-0 md:max-h-full md:overflow-y-auto">
                        <div className="card px-5 py-3">
                            <CostSummary solution={solution} baseline={costBaseline} />
                        </div>
                    </div>
                    <div className="space-y-3">
                        <Section id="panel-scenario" title="Scenario and run">
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

                        <Section id="panel-cost" title="Cost detail" aside="USD">
                            <CostPanel solution={solution} baseline={costBaseline} />
                        </Section>

                        <Section id="panel-assumptions" title="Assumptions">
                            <SweepPicker view={view} onSelect={selectView} />
                        </Section>
                        <Section id="panel-disrupt" title="Disrupt" aside="at base assumptions">
                            <Disrupt view={view} solution={solution} onSelect={selectView} focusSiteId={pickedNode?.id ?? null} />
                        </Section>
                        <Section id="panel-robustness" title="Robustness">
                            <Robustness kind={robustKind} onKindChange={setRobustKind} />
                        </Section>
                    </div>
                </aside>
            </main>

            {/* Permanent failure band: never behind a click. */}
            <footer id="failure-band" className="px-3 pb-2.5 pt-2">
                <FailureBand solution={solution} onSelectFlow={(flow, index) => setSelected({ flow, index })} />
            </footer>
        </div>
    );
}
