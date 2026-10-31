'use client';

// Live solve inside the workspace shell: Jing Yuan's streaming solve (map feed, SolvePanel, ScenarioPanel,
// Explanation) laid out with the workspace cards and KPI tiles. Logic is the planner's; only the frame changes.
import NetworkMap from '../map/NetworkMap';
import ScenarioPanel from '../ScenarioPanel';
import SolvePanel from '../SolvePanel';
import Explanation from '../Explanation';
import Trace from '../Trace';
import { badgeFor } from '../Header';
import { Card, MetricCard, PageHeader } from '../common/ui';
import { IconBolt, IconCheck, IconDollar, IconShield } from '../common/icons';
import { useApp } from '../../lib/store';
import { isLiveDisplayed } from '../../lib/useLive';
import { useFeedActive } from '../../lib/solveProgress';
import { annualCost } from '../../lib/annual';
import { isProvenOptimal, MISSING, pct, seconds, statusLabel, usd } from '../../lib/format';

const BADGE_CLS = {
    live: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
    offline: 'bg-red-50 text-danger ring-1 ring-red-200',
    stored: 'bg-slate-100 text-deep ring-1 ring-line',
    checking: 'bg-slate-100 text-muted ring-1 ring-line',
} as const;

function HonestyBadge() {
    const { solverHealth, isLive } = useApp();
    const b = badgeFor(solverHealth, isLive);
    return (
        <span
            id="header-badge"
            data-badge={isLive && solverHealth.state === 'up' ? 'live' : solverHealth.state === 'down' ? 'offline' : 'stored'}
            className={`chip font-semibold ${BADGE_CLS[b.kind]}`}
            title={b.title}
            aria-live="polite"
        >
            <span className={`h-2 w-2 rounded-full bg-current ${b.kind === 'live' ? 'animate-pulse' : ''}`} aria-hidden="true" />
            {b.text}
        </span>
    );
}

const fin = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export default function LiveSolvePage() {
    const { solution, setSolution, setView, solverHealth, isLive, liveRun, onLiveRun, pickedNode, feed, baseline, selectedFlow, selectFlow } = useApp();
    const running = useFeedActive(feed);
    const liveShown = liveRun && isLiveDisplayed(solution, liveRun) ? liveRun : null;

    const total = solution ? fin(annualCost(solution).total) : null;
    const baseTotal = baseline ? fin(annualCost(baseline).total) : null;
    const saving = total !== null && baseTotal !== null ? baseTotal - total : null;
    const audit = solution?.validation;
    const optimal = solution ? isProvenOptimal(solution) : false;

    return (
        <div className="p-5 lg:px-8 lg:py-5" data-page="live">
            <PageHeader
                title="Live Solve"
                subtitle={
                    solution
                        ? isLive
                            ? `Live run ${solution.run_id} · solved in ${seconds(solution.solve_seconds)}`
                            : `Showing a stored run (${solution.source}). Run the solver to stream a live plan.`
                        : 'Run the solver to stream a live plan.'
                }
                actions={<HonestyBadge />}
            />

            <div id="live-kpis" className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    label="Total annual cost"
                    icon={<IconDollar />}
                    value={total !== null ? usd(total) : MISSING}
                    sub={total !== null ? "per year, organisers' basis" : undefined}
                />
                <MetricCard
                    label={saving !== null && saving < 0 ? 'Greedy baseline cheaper by' : 'Saving vs greedy baseline'}
                    icon={<IconBolt />}
                    tone={saving !== null && saving < 0 ? 'amber' : 'green'}
                    value={<span data-kpi="saving">{saving !== null ? `${usd(Math.abs(saving))}` : MISSING}</span>}
                    sub={saving !== null && baseTotal ? `${pct(Math.abs(saving) / baseTotal, 1)} per year` : 'Greedy baseline not in this run'}
                />
                <MetricCard
                    label="Solver status"
                    icon={<IconCheck />}
                    tone={!solution || solution.status === 'infeasible' ? 'red' : optimal ? 'green' : 'amber'}
                    value={<span id="cost-status" className="text-[20px]">{solution ? statusLabel(solution) : MISSING}</span>}
                    sub={solution ? `run ID ${solution.run_id.slice(0, 12)}` : undefined}
                />
                <MetricCard
                    label="Independent audit"
                    icon={<IconShield />}
                    tone={!audit ? 'blue' : audit.passed ? 'green' : 'red'}
                    value={<span className="text-[20px]">{!audit ? MISSING : audit.passed ? 'Passed' : `Failed (${audit.failures?.length ?? 0})`}</span>}
                    sub={audit ? 'feasibility re-checked outside the solver' : undefined}
                />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
                <div className="min-w-0 space-y-5">
                    <Card
                        title="Live network"
                        aside={running ? <span className="chip bg-blue-50 text-primary">Streaming the solver&apos;s best plan</span> : 'Click an arc to trace it'}
                        bodyClass="p-0"
                    >
                        <div id="map-slot" className="relative h-[460px] overflow-hidden rounded-b-xl lg:h-[calc(100vh-330px)] lg:min-h-[420px]">
                            <NetworkMap />
                            <div id="trace-slot" className="legacy pointer-events-none absolute bottom-3 left-3 z-[1000] flex max-h-[calc(100%-1.5rem)]">
                                <Trace solution={solution} selected={selectedFlow} onClose={() => selectFlow(null)} />
                            </div>
                        </div>
                    </Card>
                    {liveShown && (
                        <div className="legacy [&_#panel-explanation]:rounded-xl [&_#panel-explanation]:border [&_#panel-explanation]:border-line [&_#panel-explanation]:shadow-sm">
                            <Explanation run={liveShown} />
                        </div>
                    )}
                </div>

                <div className="min-w-0 space-y-5">
                    <Card title="Solver progress" aside={running ? <span className="chip bg-blue-50 text-primary">Solving</span> : undefined} bodyClass="p-0">
                        <div className="legacy relative h-[250px] overflow-hidden rounded-b-xl">
                            <div className={`flex h-full flex-col justify-center gap-2 px-5 text-sm text-muted transition-opacity duration-300 ${running ? 'opacity-0' : ''}`}>
                                <div className="text-[15px] font-semibold text-deep">{solution ? statusLabel(solution) : 'No run yet'}</div>
                                <p>
                                    Press Run to stream the solve: the best plan found so far, the lower bound on any plan, the gap between them and every
                                    refinery mix as it settles. The map draws the network as the solver finds it.
                                </p>
                                {solution && (
                                    <p className="num text-deep">
                                        Gap {pct(solution.gap, 2)} · solve {seconds(solution.solve_seconds)}
                                    </p>
                                )}
                            </div>
                            <SolvePanel feed={feed} />
                        </div>
                    </Card>
                    <Card title="Scenario and run" aside={solverHealth.state === 'up' ? 'Solver online' : undefined}>
                        <div id="panel-scenario" className="legacy">
                            <ScenarioPanel
                                solution={solution}
                                health={solverHealth}
                                isLive={isLive}
                                setSolution={setSolution}
                                setView={setView}
                                feed={feed}
                                onLiveRun={(run) => {
                                    onLiveRun(run);
                                    selectFlow(null);
                                }}
                                pickedNode={pickedNode}
                            />
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
