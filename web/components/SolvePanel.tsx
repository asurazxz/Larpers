'use client';

// Floats over the map during a live solve. Every figure is the solver's own: the best plan HiGHS has
// found, the lower bound on any plan, and what happened to each refinery mix. It says "so far" until
// the audited result arrives, and only that result can say optimal.
import { useEffect, useMemo, useRef, useState } from 'react';
import { isSolving, mixKey, useSolveProgress, type MixCell, type MixState, type SeriesPoint, type SolveFeed, type SolveProgress } from '../lib/solveProgress';
import { pct, statusLabel, usd } from '../lib/format';

const LEAVE_MS = 260;
const CHART_W = 260;
const CHART_H = 78;
const GAP_LINE = '#0f766e';

const CELL_CLASS: Record<MixState, string> = {
    not_run: 'bg-[#d2d2d7]',
    running: 'bg-accent mix-running',
    proven: 'bg-[#2f9e4f]',
    best_found: 'bg-[#f0a30a]',
    infeasible: 'bg-[#86868b]',
    no_incumbent: 'bg-[#f0a30a]',
    failed: 'bg-[#c0392b]',
    skipped_capacity: 'bg-[#f0f0f3]',
    skipped_capex: 'bg-[#e8e8ed]',
    dominated: 'bg-[#e8e8ed]',
};

const STATE_LABEL: Record<MixState, string> = {
    not_run: 'waiting',
    running: 'solving now',
    proven: 'solved to proof',
    best_found: 'best found, not proven',
    infeasible: 'infeasible',
    no_incumbent: 'no plan found in time',
    failed: 'worker failed',
    skipped_capacity: 'too little capacity for demand',
    skipped_capex: 'ruled out: its cost floor exceeds the best plan',
    dominated: 'ruled out: its bound exceeds the best plan',
};

/** A waiting mix whose cost floor has passed the best plan can no longer win, and the solver will skip it. */
function shownState(c: MixCell, best: number | null): MixState {
    return c.state === 'not_run' && c.bound !== null && best !== null && c.bound >= best ? 'skipped_capex' : c.state;
}

function counts(cells: MixCell[], best: number | null) {
    const n = (...states: MixState[]) => cells.filter((c) => states.includes(shownState(c, best))).length;
    return {
        running: n('running'),
        proven: n('proven'),
        ruledOut: n('skipped_capex', 'dominated', 'skipped_capacity', 'infeasible'),
    };
}

/** Step path: a value holds until the solver changes it. */
function stepPath(points: { x: number; y: number }[]): string {
    return points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `H${p.x}V${p.y}`)).join('');
}

/** Gap from 30% down to 0.03%, three decades: the first plans and the last 0.1% both stay readable. */
const GAP_TOP = 0.3;
const GAP_FLOOR = 0.0003;
const GAP_TICKS: [number, string][] = [
    [0.1, '10%'],
    [0.01, '1%'],
    [0.001, '0.1%'],
];
const gapY = (gap: number) => {
    const clamped = Math.min(GAP_TOP, Math.max(GAP_FLOOR, gap));
    return (Math.log10(GAP_TOP / clamped) / Math.log10(GAP_TOP / GAP_FLOOR)) * CHART_H;
};

function Convergence({ series, tNow }: { series: SeriesPoint[]; tNow: number }) {
    const path = useMemo(() => {
        const tMax = Math.max(tNow, 5);
        const points = series.flatMap((p) => {
            if (p.best === null || p.bound === null || p.best <= 0) return [];
            return [{ x: (p.t / tMax) * CHART_W, y: gapY(Math.max(p.best - p.bound, 0) / p.best) }];
        });
        return points.length ? `${stepPath(points)}H${CHART_W}` : '';
    }, [series, tNow]);

    return (
        <figure>
            <figcaption className="text-sm leading-tight text-ink2">Gap to proof, log scale</figcaption>
            <div className="relative mt-1">
                <svg
                    viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                    className="block h-[78px] w-full"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Gap between the best plan and the lower bound over the run"
                >
                    {GAP_TICKS.map(([gap]) => (
                        <line key={gap} x1="0" x2={CHART_W} y1={gapY(gap)} y2={gapY(gap)} stroke="#e8e8ed" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    ))}
                    {path && <path d={path} fill="none" stroke={GAP_LINE} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                </svg>
                {GAP_TICKS.map(([gap, label]) => (
                    <span
                        key={gap}
                        className="num pointer-events-none absolute right-0 -translate-y-full bg-white/80 pl-1 text-[13px] leading-none text-ink2"
                        style={{ top: `${(gapY(gap) / CHART_H) * 100}%` }}
                    >
                        {label}
                    </span>
                ))}
            </div>
        </figure>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <div className="truncate text-sm leading-tight text-ink2">{label}</div>
            <div className="num truncate font-semibold leading-snug">{value}</div>
        </div>
    );
}

function heading(p: SolveProgress): string {
    if (p.phase === 'starting') return 'Starting the solver';
    if (p.phase === 'polish') return 'Polishing the winning network';
    if (p.phase === 'audit') return 'Auditing the result';
    if (p.phase === 'failed') return 'Run stopped';
    if (p.phase === 'done' && p.solution) return statusLabel(p.solution);
    return 'Solving live';
}

export default function SolvePanel({ feed }: { feed: SolveFeed }) {
    const progress = useSolveProgress(feed);
    const shown = useRef<SolveProgress | null>(progress);
    const [leaving, setLeaving] = useState(false);
    const [, redraw] = useState(0);
    if (progress) shown.current = progress;
    const running = isSolving(progress);

    useEffect(() => {
        if (progress) {
            setLeaving(false);
            return undefined;
        }
        if (!shown.current) return undefined;
        setLeaving(true);
        const t = window.setTimeout(() => {
            shown.current = null;
            setLeaving(false);
        }, LEAVE_MS);
        return () => window.clearTimeout(t);
    }, [progress]);

    useEffect(() => {
        if (!running) return undefined;
        const t = window.setInterval(() => redraw((n) => n + 1), 100);
        return () => window.clearInterval(t);
    }, [running]);

    const p = shown.current;
    if (!p) return null;
    const cells = [...p.mixes.values()];
    const tally = counts(cells, p.bestUsd);
    const leader = p.best ? mixKey(p.best) : null;
    const elapsed = p.phase === 'done' && p.solution ? p.solution.solve_seconds : (Date.now() - p.startedAt) / 1000;
    const saved = p.bestUsd !== null && p.greedyUsd ? (p.greedyUsd - p.bestUsd) / p.greedyUsd : null;

    return (
        <section
            id="solve-panel"
            data-phase={p.phase}
            data-testid="solve-panel"
            aria-label="Live solver progress"
            className={`solve-panel absolute inset-0 z-10 flex flex-col rounded-card bg-gradient-to-b from-white to-[#f6faf9] px-3.5 py-3 text-base leading-snug ${leaving ? 'solve-panel-out' : ''}`}
        >
            <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                    {running && <span className="live-dot" aria-hidden="true" />}
                    <span className="truncate" aria-live="polite">
                        {heading(p)}
                    </span>
                </span>
                <span className="num shrink-0 text-ink2">{elapsed.toFixed(1)} s</span>
            </div>

            <div className="mt-1.5 grid grid-cols-3 gap-2">
                <Stat label={p.phase === 'done' ? 'Best plan' : 'Best so far'} value={usd(p.solution?.primal ?? p.bestUsd)} />
                <Stat label="Lower bound" value={usd(p.solution?.bound ?? p.lowerBoundUsd)} />
                <Stat label="Gap" value={pct(p.solution ? p.solution.gap : p.gap, 2)} />
            </div>

            <div className="mt-1 flex min-h-0 flex-1 gap-4">
                <div className="min-w-0 flex-1">
                    <Convergence series={p.series} tNow={p.t} />
                </div>
                {cells.length > 0 && (
                    <div className="w-[10.5rem] shrink-0">
                        <div className="num text-sm leading-tight text-ink2">
                            {p.settled} of {p.total} mixes settled
                        </div>
                        <div className="mt-1 flex flex-wrap gap-[2px]" data-testid="mix-grid">
                            {cells.map((c) => {
                                const state = shownState(c, p.bestUsd);
                                return (
                                    <span
                                        key={mixKey(c)}
                                        title={`${c.n_large} large, ${c.n_small} small: ${STATE_LABEL[state]}`}
                                        data-state={state}
                                        className={`mix-cell ${CELL_CLASS[state]} ${leader === mixKey(c) ? 'mix-leader' : ''}`}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="num hair-t mt-1.5 pt-1 text-sm leading-tight text-ink2">
                {tally.proven} proved · {p.incumbents} networks · {p.nodes.toLocaleString('en-US')} nodes
                {saved !== null && saved > 0 && ` · ${pct(saved, 1)} under greedy`}
            </div>
        </section>
    );
}
