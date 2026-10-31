'use client';

import type { ReactNode } from 'react';
import NetworkMap from '../map/NetworkMap';
import { Card, Check, EmptyState, MetricCard, PageHeader, SolverChip } from '../common/ui';
import { IconDollar, IconFactory, IconTruck, IconCheck } from '../common/icons';
import { demandOf } from '../../lib/demand';
import { useApp } from '../../lib/store';
import { AIRPORTS, DEFAULT_SCENARIO, type DemandKt, type Leg, type Scenario, type Solution } from '../../lib/contract';
import { annualCost } from '../../lib/annual';
import { legSums } from '../../lib/trace';
import { getEntry } from '../../lib/bundle';
import { storedSlugOf } from '../../lib/useLive';
import { isProvenOptimal, kt, km, LEG_LABEL, MISSING, pct, seconds, statusLabel, usd } from '../../lib/format';

const TOL = 1e-6;

function scenarioOf(s: Solution): Scenario {
    if (s.scenario) return s.scenario;
    const entry = getEntry(storedSlugOf(s) ?? '') as unknown as { scenario?: Scenario } | undefined;
    return entry?.scenario ?? DEFAULT_SCENARIO;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="num text-sm font-semibold text-deep">{value}</dd>
        </div>
    );
}

function LinkBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} className="mt-2 text-sm font-medium text-primary hover:underline">
            {children}
        </button>
    );
}

export default function OverviewPage() {
    const { solution, baseline, isLive, go } = useApp();

    if (!solution) {
        return (
            <div className="p-6 lg:p-8">
                <PageHeader title="Recommended SAF supply chain for Kalimantan" />
                <EmptyState title="No run selected">Pick a stored run or solve one in the planner.</EmptyState>
            </div>
        );
    }

    const ann = annualCost(solution);
    const sc = scenarioOf(solution);
    const demand: DemandKt | null = demandOf(solution);
    const optimal = isProvenOptimal(solution);

    const fac = solution.facilities;
    const count = (type: string, size: string) => fac.filter((f) => f.type === type && f.size === size).length;
    const refCapex = fac.filter((f) => f.type === 'refinery').reduce((a, f) => a + f.capex_usd, 0);
    const depCapex = fac.filter((f) => f.type === 'depot').reduce((a, f) => a + f.capex_usd, 0);

    const inbound: Record<string, number> = {};
    for (const a of AIRPORTS) inbound[a] = 0;
    for (const f of solution.flows) if (f.leg === 'refinery_airport' && f.to in inbound) inbound[f.to] += f.kt;
    const served = AIRPORTS.filter((a) => inbound[a] > 0);
    const sites = new Set(solution.flows.filter((f) => f.leg === 'supply_depot').map((f) => f.from)).size;
    const strandedKt = solution.stranded.reduce((a, s) => a + s.kt, 0);

    const totalBasis = ann.total != null ? 'annual basis' : 'horizon basis, CapEx plus logistics';
    const total = ann.total ?? solution.total_horizon_usd;

    // Baseline comparison only on the same cost basis.
    let baseDelta: ReactNode = null;
    if (baseline) {
        const bAnn = annualCost(baseline);
        const sameBasis = ann.total != null && bAnn.total != null;
        const bTotal = sameBasis ? bAnn.total : ann.total == null ? baseline.total_horizon_usd : null;
        if (bTotal != null) {
            const diff = bTotal - total;
            baseDelta = diff >= 0 ? `${usd(diff)} below greedy baseline (${usd(bTotal)})` : `${usd(-diff)} above greedy baseline (${usd(bTotal)})`;
        }
    }

    // Insights, all from this run.
    const legs = legSums(solution);
    const legTotal = (Object.values(legs) as number[]).reduce((a, b) => a + b, 0);
    const topLeg = (Object.entries(legs) as [Leg, number][]).sort((a, b) => b[1] - a[1])[0];
    const topFac = [...fac].sort((a, b) => b.utilisation - a.utilisation)[0];
    const topFlow = [...solution.flows].sort((a, b) => b.cost_usd - a.cost_usd)[0];

    const failures = solution.validation.failures ?? [];
    const auditOk = solution.validation.passed === true;

    return (
        <div className="p-6 lg:p-8">
            <PageHeader
                title="Recommended SAF supply chain for Kalimantan"
                subtitle={
                    <>
                        {solution.run_id} · {isLive ? 'live solve' : solution.source} · {statusLabel(solution)}
                    </>
                }
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    icon={<IconDollar />}
                    label={`Total modelled cost (${totalBasis})`}
                    value={usd(total)}
                    sub={baseDelta ?? (ann.total != null && ann.variableOpex == null ? 'Variable OpEx not in this run' : undefined)}
                />
                <MetricCard
                    icon={<IconFactory />}
                    tone="amber"
                    label="CapEx, one-off"
                    value={usd(solution.capex_usd)}
                    sub={`Refineries ${usd(refCapex)} · depots ${usd(depCapex)}`}
                />
                <MetricCard icon={<IconTruck />} tone="green" label="Annual logistics" value={usd(solution.logistics_annual_usd)} sub={`${solution.flows.length} costed flows`} />
                <MetricCard
                    icon={<IconCheck />}
                    tone={optimal ? 'green' : 'amber'}
                    label="Solver status"
                    value={<SolverChip solution={solution} />}
                    sub={`Solve time ${seconds(solution.solve_seconds)}`}
                />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
                <Card title="Recommended network" className="lg:col-span-3">
                    <dl>
                        <Stat label="Large refineries" value={count('refinery', 'large')} />
                        <Stat label="Small refineries" value={count('refinery', 'small')} />
                        <Stat label="Large depots" value={count('depot', 'large')} />
                        <Stat label="Small depots" value={count('depot', 'small')} />
                        <Stat label="Airports served" value={`${served.length} (${served.join(', ') || 'none'})`} />
                        <Stat label="Collection sites used" value={sites} />
                        <Stat label="Stranded sites" value={solution.stranded.length} />
                    </dl>
                </Card>
                <Card title="Network map" className="overflow-hidden lg:col-span-6" bodyClass="p-0" aside={<button type="button" className="btn-secondary" onClick={() => go('network')}>Explore full network →</button>}>
                    <div className="relative h-[340px]">
                        <NetworkMap />
                    </div>
                </Card>
                <Card title="Key outcomes" className="lg:col-span-3">
                    <ul className="space-y-3">
                        {AIRPORTS.map((a) => {
                            const want = demand ? demand[a] : null;
                            return (
                                <Check key={a} ok={want == null ? null : Math.abs(inbound[a] - want) <= TOL * Math.max(1, want)}>
                                    {a}: {kt(inbound[a])} delivered{want == null ? ' (demand not echoed by this run)' : ` of ${kt(want)} demand`}
                                </Check>
                            );
                        })}
                        <Check ok={auditOk}>{auditOk ? 'Independent audit passed' : `Audit not passed${failures.length ? `: ${failures.length} failure(s), first: ${failures[0]}` : ''}`}</Check>
                        <Check ok={strandedKt <= TOL}>Stranded biomass {kt(strandedKt)}</Check>
                        {baseline && baseDelta && <Check ok={null}>{baseDelta}</Check>}
                        {!optimal && <Check ok={null}>Best found, gap {solution.gap == null ? MISSING : pct(solution.gap, 2)}; the gap is not a saving</Check>}
                    </ul>
                </Card>
            </div>

            <Card title="Insights & risks" className="mt-5">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <div>
                        <div className="text-sm text-deep">
                            {topLeg && legTotal > 0 ? (
                                <>
                                    <b>{LEG_LABEL[topLeg[0]]}</b> is the largest logistics leg: {usd(topLeg[1])}, {pct(topLeg[1] / legTotal)} of flow cost.
                                </>
                            ) : (
                                'No costed flows in this run.'
                            )}
                        </div>
                        <LinkBtn onClick={() => go('results', 'costs')}>See cost breakdown →</LinkBtn>
                    </div>
                    <div>
                        <div className="text-sm text-deep">
                            {topFac ? (
                                <>
                                    <b>{topFac.label}</b> ({topFac.size} {topFac.type}) is the most utilised facility at {pct(topFac.utilisation)}.
                                </>
                            ) : (
                                'No facilities in this run.'
                            )}
                        </div>
                        <LinkBtn onClick={() => go('results', 'facilities')}>See facilities →</LinkBtn>
                    </div>
                    <div>
                        <div className="text-sm text-deep">
                            {topFlow ? (
                                <>
                                    Costliest flow: <b>{topFlow.from_label}</b> to <b>{topFlow.to_label}</b>, {kt(topFlow.kt)} over {km(topFlow.km)} costing {usd(topFlow.cost_usd)}.
                                </>
                            ) : (
                                'No flows in this run.'
                            )}
                        </div>
                        <LinkBtn onClick={() => go('results', 'flows')}>See flows →</LinkBtn>
                    </div>
                </div>
            </Card>
        </div>
    );
}
