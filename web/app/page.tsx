'use client';

// One page, one screen (1280x720). Phase-2 components drop into the slot divs below by id:
// #header-badge, #auth-slot, #map-slot, #trace-slot, #panel-scenario, #panel-cost,
// #panel-assumptions, #panel-disrupt, #panel-robustness, #failure-band.
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { Flow, Solution } from '../lib/contract';
import { baseEntry, sites, solutionOf, storedRunCount } from '../lib/bundle';
import { kt, MISSING, orMissing, seconds, statusLabel, usd } from '../lib/format';
import { DEFAULT_VIEW, flowKey, type View } from '../lib/view';

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

function Row({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-gray-600">{k}</span>
            <span className="text-right font-medium">{v}</span>
        </div>
    );
}

export default function Page() {
    const entry = baseEntry();
    const [view] = useState<View>(DEFAULT_VIEW);
    const [solution] = useState<Solution | null>(solutionOf(entry) ?? null);
    const [selected, setSelected] = useState<{ flow: Flow; index: number } | null>(null);
    const highlight = useMemo(
        () => (selected ? new Set([flowKey(selected.flow), selected.flow.from, selected.flow.to]) : new Set<string>()),
        [selected],
    );

    const runLabel = entry?.label ?? entry?.slug ?? MISSING;
    const isStored = entry?.precomputed ?? true;

    return (
        <div className="flex h-screen flex-col overflow-hidden" data-view={view.kind}>
            {/* Header: run label + badge slot + auth slot */}
            <header id="header" className="flex items-center justify-between gap-4 border-b border-gray-300 px-4 py-2">
                <div className="min-w-0">
                    <h1 className="text-xl font-bold">Kalimantan SAF Network Planner</h1>
                    <div id="run-label" className="truncate text-gray-700">
                        Run: {runLabel}
                        {solution && (
                            <>
                                {' '}| {statusLabel(solution)} | solve {seconds(solution.solve_seconds)} | run ID {solution.run_id}
                            </>
                        )}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                    <div id="header-badge" className="rounded border-2 border-gray-800 px-3 py-1 font-bold">
                        {isStored ? `STORED RUN: ${storedRunCount()} stored, no solver running` : 'LIVE SOLVE'}
                    </div>
                    {/* AUTH SLOT: <AuthButton /> from components/AuthButton.tsx goes here. */}
                    <div id="auth-slot" />
                </div>
            </header>

            {/* Main: map ~65%, right column ~35% */}
            <main className="flex min-h-0 flex-1">
                <div id="map-slot" className="relative h-full" style={{ width: '65%' }}>
                    <SafMap
                        solution={solution}
                        sites={sites}
                        highlight={highlight}
                        onSelectFlow={(flow, index) => setSelected({ flow, index })}
                    />
                    {/* TRACE SLOT: arc-click trace panel, absolutely positioned over the map. */}
                    <div id="trace-slot" className="pointer-events-none absolute bottom-2 left-2 z-[1000]" />
                </div>

                <aside id="right-column" className="h-full overflow-y-auto border-l border-gray-300" style={{ width: '35%' }}>
                    <Section id="panel-scenario" title="Scenario / Run">
                        {solution ? (
                            <>
                                <Row k="Source" v={`${solution.source}${isStored ? ' (stored)' : ''}`} />
                                <Row k="Status" v={statusLabel(solution)} />
                                <Row k="Yield" v={orMissing(solution.scenario?.yield, (y: number) => `${(y * 100).toFixed(2)}%`)} />
                                <Row k="Road factor" v={orMissing(solution.scenario?.road_factor)} />
                                <Row k="Horizon" v={orMissing(solution.scenario?.horizon_years, (h: number) => `${h} yr`)} />
                            </>
                        ) : (
                            <div>No stored run in the bundle.</div>
                        )}
                    </Section>

                    <Section id="panel-cost" title="Cost (USD)">
                        {solution && (
                            <>
                                <Row k="CapEx" v={usd(solution.capex_usd)} />
                                <Row k="Logistics / year" v={usd(solution.logistics_annual_usd)} />
                                <Row k="OpEx" v="not provided" />
                                <Row k="Total, horizon" v={usd(solution.total_horizon_usd)} />
                                <Row
                                    k="Audit"
                                    v={solution.validation ? (solution.validation.passed ? 'passed' : `FAILED (${solution.validation.failures.length})`) : MISSING}
                                />
                            </>
                        )}
                    </Section>

                    <Section id="panel-assumptions" title="Assumptions / Sweep" />
                    <Section id="panel-disrupt" title="Disrupt (at base assumptions)" />
                    <Section id="panel-robustness" title="Robustness" />
                </aside>
            </main>

            {/* Permanent failure band: never behind a click. */}
            <footer id="failure-band" className="border-t-2 border-gray-800 bg-gray-50 px-4 py-2">
                <span className="font-bold">Where this fails: </span>
                {solution ? (
                    <span>
                        stranded {kt((solution.stranded ?? []).reduce((a, s) => a + s.kt, 0), 1)}; surplus SAF{' '}
                        {kt((solution.surplus ?? []).reduce((a, s) => a + s.kt, 0), 1)}; OpEx, seasonality, moisture and the road
                        network are not modelled.
                    </span>
                ) : (
                    <span>{MISSING}</span>
                )}
            </footer>
        </div>
    );
}
