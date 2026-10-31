'use client';

import { Fragment, useMemo } from 'react';
import { Card, Check, EmptyState, MetricCard, PageHeader, SolverChip, Tabs } from '../common/ui';
import { useApp } from '../../lib/store';
import { bundle, BASE_SLUG, getEntry, slugs, solutionOf } from '../../lib/bundle';
import { storedSlugOf } from '../../lib/useLive';
import { traceAll } from '../../lib/trace';
import { MISSING, isProvenOptimal, pct, statusLabel, usd } from '../../lib/format';
import SweepPicker from '../SweepPicker';
import Disrupt from '../Disrupt';
import Robustness from '../Robustness';
import Provenance from '../Provenance';
import FailureBand from '../FailureBand';
import { ValidationOverview } from '../audit/SolverValidation';

const TABS = [
    { key: 'solver', label: 'Solver Validation' },
    { key: 'sensitivity', label: 'Sensitivity Analysis' },
    { key: 'disruptions', label: 'Disruptions' },
    { key: 'routing', label: 'Routing Validation' },
    { key: 'data', label: 'Data & Assumptions' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const fmtNum = (v: number | null | undefined, dp = 0) =>
    v === null || v === undefined || !Number.isFinite(v) ? MISSING : v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export default function ReliabilityPage() {
    const app = useApp();
    const { solution, view, go, selectView, selectFlow, robustKind, setRobustKind, selectedNode, isLive, feed } = app;
    const active: TabKey = (TABS.find((t) => t.key === app.tab)?.key ?? 'solver') as TabKey;

    return (
        <div className="p-6 lg:p-8">
            <PageHeader title="Reliability" subtitle="Solver status, independent audit, sensitivity, disruptions, routing basis and data provenance." />
            <Tabs tabs={[...TABS]} active={active} onChange={(k) => go('reliability', k)} />
            <div className="mt-5 space-y-5">
                {active === 'solver' && <SolverTab />}
                {active === 'sensitivity' && (
                    <>
                        <Card title="Stored sweep runs">
                            <div className="legacy"><SweepPicker view={view} onSelect={selectView} /></div>
                        </Card>
                        <StoredRunsTable />
                        <Card
                            title="Robustness"
                            aside={<button type="button" className="btn-secondary" onClick={() => go('network')}>See rings on map</button>}
                        >
                            <div className="legacy"><Robustness kind={robustKind} onKindChange={setRobustKind} /></div>
                        </Card>
                    </>
                )}
                {active === 'disruptions' && (
                    <Card title="Site disruptions">
                        <div className="legacy"><Disrupt view={view} solution={solution} onSelect={selectView} feed={feed} focusSiteId={selectedNode} /></div>
                    </Card>
                )}
                {active === 'routing' && <RoutingTab />}
                {active === 'data' && (
                    <>
                        <Card title="Provenance">
                            <div className="legacy"><Provenance solution={solution} entry={getEntry(storedSlugOf(solution) ?? '')} live={isLive} /></div>
                        </Card>
                        <AssumptionsTable />
                        <Card title="Failure modes">
                            <div className="legacy">
                                <FailureBand solution={solution} onSelectFlow={(flow, index) => { selectFlow({ flow, index }); go('network'); }} />
                            </div>
                        </Card>
                    </>
                )}
            </div>
        </div>
    );
}

function SolverTab() {
    const { solution: s } = useApp();
    const trace = useMemo(() => traceAll(s), [s]);
    if (!s) return <EmptyState title="No run selected">Pick or solve a run to see solver and audit details.</EmptyState>;
    const v = s.validation ?? {};
    const failures = v.failures ?? [];
    const residuals = Object.entries(v.max_residuals ?? {});
    const recomputed = trace.total + trace.hiddenTotal;
    return (
        <>
            <ValidationOverview s={s} slug={storedSlugOf(s) ?? null} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard label="Status" value={<SolverChip solution={s} />} sub={s.status_reason ?? statusLabel(s)} />
                <MetricCard label="Primal (best found)" value={usd(s.primal)} sub={s.primal !== null ? `$${fmtNum(s.primal)}` : undefined} />
                <MetricCard label="Bound" value={usd(s.bound)} />
                <MetricCard label="MIP gap" value={pct(s.gap, 3)} sub={isProvenOptimal(s) ? 'Proven optimal: gap 0' : s.status === 'infeasible' ? 'Infeasible' : 'Not proven optimal'} tone={isProvenOptimal(s) ? 'green' : 'amber'} />
            </div>
            <Card title="Run">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm lg:grid-cols-4">
                    {[
                        ['Solve time', s.solve_seconds !== undefined ? `${fmtNum(s.solve_seconds, 1)} s` : MISSING],
                        ['Candidates', fmtNum(s.n_candidates)],
                        ['Run id', s.run_id],
                        ['Data hash', s.data_hash ? s.data_hash.slice(0, 12) : MISSING],
                        ['Source', s.source],
                        ['Scenario hash', s.scenario_hash ? s.scenario_hash.slice(0, 12) : MISSING],
                    ].map(([k, val]) => (
                        <div key={k}>
                            <dt className="text-muted">{k}</dt>
                            <dd className="num break-all font-medium text-deep">{val}</dd>
                        </div>
                    ))}
                </dl>
            </Card>
            <div className="grid gap-5 lg:grid-cols-2">
                <Card title="Solver audit" aside={<span className={`chip ${v.passed ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'}`}>{v.passed ? 'Passed' : 'Not passed'}</span>}>
                    <ul className="space-y-2">
                        <Check ok={v.passed ?? null}>{v.passed ? 'solver/audit.py reported no failures' : 'Audit did not pass or was not run'}</Check>
                        {failures.map((f, i) => <Check key={i} ok={false}>{f}</Check>)}
                    </ul>
                    {residuals.length > 0 && (
                        <table className="tbl mt-3 w-full text-sm">
                            <thead><tr><th className="text-left">Check</th><th className="text-right">Max residual</th></tr></thead>
                            <tbody>{residuals.map(([k, r]) => <tr key={k}><td>{k}</td><td className="num text-right">{r.toExponential(2)}</td></tr>)}</tbody>
                        </table>
                    )}
                </Card>
                <Card title="Independent browser recheck">
                    <ul className="space-y-2">
                        <Check ok={trace.failing.length === 0 && recomputed > 0}>
                            {fmtNum(recomputed)} flows recomputed, {trace.failing.length} mismatches
                        </Check>
                    </ul>
                    <p className="mt-2 text-sm text-muted">
                        Each flow is recomputed in this browser from coordinates (haversine), the road factor, the leg rate and tonnage, and compared with the solver's km and cost.
                        {trace.hiddenTotal > 0 && ` ${trace.hiddenTotal} co-located (0 km) flows are checked but not drawn.`}
                    </p>
                </Card>
            </div>
            {s.portfolios && s.portfolios.length > 0 && (
                <Card title="Portfolios tried">
                    <table className="tbl w-full text-sm">
                        <thead><tr><th className="text-left">Large</th><th className="text-left">Small</th><th className="text-left">Status</th><th className="text-right">Primal</th><th className="text-right">Gap</th><th className="text-right">Seconds</th><th className="text-left">Reason</th></tr></thead>
                        <tbody>
                            {s.portfolios.map((p, i) => (
                                <tr key={i}>
                                    <td className="num">{p.n_large}</td><td className="num">{p.n_small}</td><td>{p.status}</td>
                                    <td className="num text-right">{usd(p.primal)}</td><td className="num text-right">{pct(p.gap, 2)}</td>
                                    <td className="num text-right">{fmtNum(p.solve_seconds ?? 0, 1)}</td><td className="text-muted">{p.reason ?? ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}
        </>
    );
}

function StoredRunsTable() {
    const { solution } = useApp();
    const base = solutionOf(bundle[BASE_SLUG]);
    const rows = slugs().map((slug) => ({ slug, e: bundle[slug], s: solutionOf(bundle[slug]) })).filter((r) => r.s);
    if (!base || rows.length === 0) return <EmptyState title="No stored runs">The bundle has no runs to compare.</EmptyState>;
    return (
        <Card title="Stored runs vs base objective" aside={<span>Base: {usd(base.primal)}</span>}>
            <div className="max-h-72 overflow-auto">
                <table className="tbl w-full text-sm">
                    <thead><tr><th className="text-left">Run</th><th className="text-left">Family</th><th className="text-left">Status</th><th className="text-right">Objective</th><th className="text-right">Delta vs base</th></tr></thead>
                    <tbody>
                        {rows.map(({ slug, e, s }) => {
                            const d = s!.primal !== null && base.primal ? (s!.primal - base.primal) / base.primal : null;
                            return (
                                <tr key={slug} className={s === solution ? 'bg-blue-50' : ''}>
                                    <td className="font-medium">{e.label ?? slug}</td>
                                    <td className="text-muted">{e.family}</td>
                                    <td>{statusLabel(s!)}</td>
                                    <td className="num text-right">{usd(s!.primal)}</td>
                                    <td className="num text-right">{slug === BASE_SLUG ? 'base' : d === null ? MISSING : `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%`}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="mt-2 text-xs text-muted">Only runs stored in the bundle are listed. Runs with different yield, demand or exclusions are different problems, so a delta is a comparison and not a like-for-like error.</p>
        </Card>
    );
}

function RoutingTab() {
    const { solution: s } = useApp();
    if (!s) return <EmptyState title="No run selected" />;
    const factors = Array.from(new Set(s.flows.map((f) => f.road_factor))).sort((a, b) => a - b);
    const withRoad = s.flows.filter((f) => f.road_km !== null && f.road_km !== undefined).length;
    const osrmBasis = (s.scenario as any)?.distance_basis === 'osrm';
    const trk = s.flows.filter((f) => f.leg === 'refinery_airport' && f.to === 'TRK');
    return (
        <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Costed distance">
                <ul className="space-y-2">
                    <Check ok={true}>
                        {osrmBasis
                            ? 'This run is costed on OSRM road km (never below the straight line).'
                            : <>Costed as great-circle (haversine) km × road factor. Road factor in this run: <span className="num font-medium">{factors.length ? factors.join(', ') : MISSING}</span>.</>}
                    </Check>
                    <Check ok={factors.length === 1 && factors[0] === 1.3 ? true : null}>
                        Official factor is 1.3 (12:45 update). {factors.some((f) => f !== 1.3) ? 'This run uses a different value, as a sensitivity or earlier basis.' : 'This run matches it.'}
                    </Check>
                    <Check ok={null}>The 214 km straight-line supply-leg haul limit is our own assumption, not official.</Check>
                </ul>
            </Card>
            <Card title="OSRM reference">
                <ul className="space-y-2">
                    <Check ok={withRoad > 0 ? true : null}>
                        {withRoad > 0
                            ? `${withRoad} of ${s.flows.length} flows carry an OSRM car-profile road_km; ${s.flows.length - withRoad} do not.`
                            : 'OSRM reference not attached to this run.'}
                    </Check>
                    <Check ok={null}>
                        Map lines may follow OSRM geometry where available, but costs use the road factor{osrmBasis ? ' unless the run says otherwise, and this run does use OSRM km' : ''}.
                    </Check>
                </ul>
            </Card>
            <Card title="Tarakan (TRK) barge leg" className="lg:col-span-2">
                <p className="mb-2 text-sm text-muted">Tarakan is an island: trucks cannot reach it, so the last leg is a barge at 0.08 USD/t/km with no extra fixed cost (12:45 update).</p>
                {trk.length === 0 ? <p className="text-sm text-muted">No refinery to TRK flow in this run.</p> : (
                    <table className="tbl w-full text-sm">
                        <thead><tr><th className="text-left">From</th><th className="text-right">kt</th><th className="text-right">km</th><th className="text-right">Rate</th><th className="text-right">Cost</th></tr></thead>
                        <tbody>{trk.map((f, i) => <tr key={i}><td>{f.from_label}</td><td className="num text-right">{fmtNum(f.kt, 1)}</td><td className="num text-right">{fmtNum(f.km, 1)}</td><td className="num text-right">{f.rate_usd_per_t_km}</td><td className="num text-right">{usd(f.cost_usd)}</td></tr>)}</tbody>
                    </table>
                )}
            </Card>
        </div>
    );
}

function AssumptionsTable() {
    const groups: { title: string; tone: string; rows: [string, string][] }[] = [
        {
            title: 'Official (12:45 update and Airbus PDF)', tone: 'bg-green-50 text-success',
            rows: [
                ['Demand', '300 kt SAF per airport per year, 1,200 kt total'],
                ['Yield', '0.20 SAF per unit biomass; depots lose no mass'],
                ['Road factor', '1.3 × great-circle distance'],
                ['Transport rates', '0.10 supply→depot, 0.12 depot→refinery, 0.08 refinery→airport USD/t/km'],
                ['CapEx', 'Straight-line over 20 years, no interest'],
                ['Fixed OpEx', '5% of CapEx per year'],
                ['Variable OpEx per tonne in', 'Depot $5 / $4, refinery $60 / $55 (small / large)'],
            ],
        },
        {
            title: 'Our assumptions (not official)', tone: 'bg-amber-50 text-warning',
            rows: [
                ['Haul limit', '214 km straight-line on supply legs'],
                ['Facilities per site', 'One facility of each type per site'],
                ['Ketapang sea sites', '11 sites plot in the sea: supply only, not facility candidates'],
            ],
        },
        {
            title: 'Not modelled', tone: 'bg-slate-100 text-muted',
            rows: [['Seasonality', 'Biomass supply is treated as annual'], ['Financing', 'No interest or financing costs']],
        },
    ];
    return (
        <Card title="Assumptions" bodyClass="p-0">
            <table className="tbl w-full text-sm">
                <tbody>
                    {groups.map((g) => (
                        <Fragment key={g.title}>
                            <tr><td colSpan={2}><span className={`chip ${g.tone}`}>{g.title}</span></td></tr>
                            {g.rows.map(([k, val]) => <tr key={g.title + k}><td className="w-56 font-medium text-deep">{k}</td><td>{val}</td></tr>)}
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </Card>
    );
}
