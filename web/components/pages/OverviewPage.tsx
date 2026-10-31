'use client';

import { useEffect, useState, type ReactNode } from 'react';
import NetworkMap from '../map/NetworkMap';
import { EmptyState, PageHeader } from '../common/ui';
import { IconDollar, IconTruck, IconCheck } from '../common/icons';
import { HeroArt, IconArrow, IconBuilding, IconDepot, IconFlame, IconNetwork, IconPin, IconPlaneSm, IconTrend, Kpi, OutcomeRow, Tile } from '../overview/Parts';
import { demandOf } from '../../lib/demand';
import { useApp } from '../../lib/store';
import { useSession } from '../../lib/auth';
import { AIRPORTS, type Leg, type Solution } from '../../lib/contract';
import { annualCost } from '../../lib/annual';
import { legSums } from '../../lib/trace';
import { isProvenOptimal, kt, km, LEG_LABEL, MISSING, pct, seconds, usd } from '../../lib/format';

const TOL = 1e-6;
const card = 'rounded-xl border border-line bg-white shadow-sm';

function greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function NetRow({ icon, tone, count, label, detail }: { icon: ReactNode; tone: 'orange' | 'red' | 'blue' | 'amber'; count: ReactNode; label: string; detail?: string }) {
    return (
        <li className="flex items-center gap-3">
            <Tile tone={tone} size="sm">{icon}</Tile>
            <span className="num w-6 text-lg font-bold text-deep">{count}</span>
            <span className="min-w-0 text-[13.5px] text-deep">
                {label}
                {detail && <span className="ml-1 text-[12px] text-muted">{detail}</span>}
            </span>
        </li>
    );
}

function Insight({ tone, icon, title, children }: { tone: 'red' | 'green' | 'amber'; icon: ReactNode; title: ReactNode; children: ReactNode }) {
    return (
        <div className="flex min-w-0 items-start gap-3">
            <Tile tone={tone} size="md">{icon}</Tile>
            <div className="min-w-0">
                <div className="text-[14px] font-bold leading-snug text-deep">{title}</div>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{children}</p>
            </div>
        </div>
    );
}

export default function OverviewPage() {
    const { solution, baseline, go } = useApp();
    const { user } = useSession();
    const [hello, setHello] = useState('Hello');
    useEffect(() => setHello(greeting()), []);
    const first = user?.name?.split(/\s+/)[0] ?? null;

    if (!solution) {
        return (
            <div className="p-6 lg:p-8">
                <PageHeader title="Recommended SAF supply chain for Kalimantan" />
                <EmptyState title="No run selected">Pick a stored run or solve one in the planner.</EmptyState>
            </div>
        );
    }

    const s: Solution = solution;
    const ann = annualCost(s);
    const demand = demandOf(s);
    const optimal = isProvenOptimal(s);
    const infeasible = s.status === 'infeasible';

    const fac = s.facilities;
    const count = (type: string, size: string) => fac.filter((f) => f.type === type && f.size === size).length;
    const refs = fac.filter((f) => f.type === 'refinery');
    const deps = fac.filter((f) => f.type === 'depot');
    const refCapex = refs.reduce((a, f) => a + f.capex_usd, 0);
    const depCapex = deps.reduce((a, f) => a + f.capex_usd, 0);

    const inbound: Record<string, number> = {};
    for (const a of AIRPORTS) inbound[a] = 0;
    for (const f of s.flows) if (f.leg === 'refinery_airport' && f.to in inbound) inbound[f.to] += f.kt;
    const served = AIRPORTS.filter((a) => inbound[a] > 0);
    const deliveredKt = AIRPORTS.reduce((a, c) => a + inbound[c], 0);
    const sites = new Set(s.flows.filter((f) => f.leg === 'supply_depot').map((f) => f.from)).size;
    const strandedKt = s.stranded.reduce((a, x) => a + x.kt, 0);

    const total = ann.total ?? s.total_horizon_usd;
    const totalLabel = ann.total != null ? 'Total modelled cost (1 yr)' : 'Total modelled cost (horizon)';

    // Baseline only on the same cost basis; a negative saving is shown as higher, never as a saving.
    let basePct: number | null = null;
    if (baseline) {
        const bAnn = annualCost(baseline);
        const bTotal = ann.total != null ? bAnn.total : baseline.total_horizon_usd;
        if (bTotal != null && bTotal > 0) basePct = (bTotal - total) / bTotal;
    }

    const legs = legSums(s);
    const legTotal = (Object.values(legs) as number[]).reduce((a, b) => a + b, 0);
    const topLeg = (Object.entries(legs) as [Leg, number][]).sort((a, b) => b[1] - a[1])[0];
    const topRef = [...refs].sort((a, b) => b.capacity_kt - a.capacity_kt || b.utilisation - a.utilisation)[0];
    const supply = s.flows.filter((f) => f.leg === 'supply_depot');
    const supplyKt = supply.reduce((a, f) => a + f.kt, 0);
    const avgSupplyKm = supplyKt > 0 ? supply.reduce((a, f) => a + f.kt * f.km, 0) / supplyKt : null;

    const failures = s.validation.failures ?? [];
    const auditOk = s.validation.passed === true;
    const demandMet = demand ? AIRPORTS.every((a) => Math.abs(inbound[a] - demand[a]) <= TOL * Math.max(1, demand[a])) : null;
    const unmet = demand ? AIRPORTS.filter((a) => Math.abs(inbound[a] - demand[a]) > TOL * Math.max(1, demand[a])) : [];

    return (
        <div className="space-y-4 p-4 lg:p-6">
            <section className={`relative min-h-[140px] overflow-hidden ${card}`}>
                <HeroArt />
                <div className="relative z-10 px-8 py-8">
                    <h1 className="text-[28px] font-bold tracking-tight text-deep">{first ? `${hello}, ${first}.` : `${hello}.`}</h1>
                    <p className="mt-1 text-[15px] text-muted">Here is the recommended SAF supply chain for Kalimantan.</p>
                </div>
            </section>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi tone="blue" icon={<IconDollar width={24} height={24} />} label={totalLabel} value={usd(total)}>
                    {basePct != null ? (
                        basePct >= 0 ? (
                            <span className="font-semibold text-success">▼ {pct(basePct)} vs baseline</span>
                        ) : (
                            <span className="font-semibold text-warning">▲ {pct(-basePct)} above baseline</span>
                        )
                    ) : ann.total != null && ann.variableOpex == null ? (
                        'Variable OpEx not in this run'
                    ) : null}
                </Kpi>
                <Kpi tone="blue" icon={<IconBuilding width={24} height={24} />} label="CapEx (one-off)" value={usd(s.capex_usd)}>
                    Refineries {usd(refCapex)} · Depots {usd(depCapex)}
                </Kpi>
                <Kpi tone="blue" icon={<IconTruck width={24} height={24} />} label="Annual logistics cost" value={usd(s.logistics_annual_usd)}>
                    {s.flows.length} costed flows
                </Kpi>
                <Kpi tone={infeasible ? 'red' : optimal ? 'green' : 'amber'} icon={<IconCheck width={24} height={24} />} label="Solver status" value={<span className={`text-[17px] ${infeasible ? 'text-danger' : optimal ? 'text-success' : 'text-warning'}`}>{infeasible ? 'Infeasible' : optimal ? 'Proven optimal' : 'Best found solution'}</span>}>
                    Gap {s.gap == null ? MISSING : pct(s.gap, 2)} · Runtime {seconds(s.solve_seconds)}
                </Kpi>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <section className={`p-5 lg:col-span-3 ${card}`}>
                    <h2 className="mb-4 text-[15px] font-bold text-deep">Recommended network</h2>
                    <ul className="space-y-3.5">
                        <NetRow icon={<IconFlame />} tone="orange" count={refs.length} label="Refineries" detail={`(${count('refinery', 'large')} large, ${count('refinery', 'small')} small)`} />
                        <NetRow icon={<IconDepot />} tone="red" count={deps.length} label="Depots" detail={`(${count('depot', 'large')} large, ${count('depot', 'small')} small)`} />
                        <NetRow icon={<IconPlaneSm />} tone="blue" count={served.length} label="Airports" detail={served.length === AIRPORTS.length ? '(all served)' : `(${served.length} of ${AIRPORTS.length}: ${served.join(', ') || 'none'})`} />
                        <NetRow icon={<IconPin />} tone="amber" count={sites} label="Collection sites" detail="(used)" />
                    </ul>
                </section>

                <section className={`relative h-[300px] overflow-hidden lg:col-span-5 ${card}`}>
                    <NetworkMap />
                    <button type="button" onClick={() => go('network')} className="absolute bottom-3 right-3 z-[1000] inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-primary shadow-md hover:bg-blue-50">
                        View network <IconArrow width={14} height={14} />
                    </button>
                </section>

                <section className={`p-5 lg:col-span-4 ${card}`}>
                    <h2 className="mb-4 text-[15px] font-bold text-deep">Key outcomes</h2>
                    <ul className="space-y-3">
                        {demand ? (
                            <OutcomeRow ok={demandMet}>{demandMet ? `All airport demands satisfied (${AIRPORTS.map((a) => `${a} ${kt(demand[a], 0)}`).join(', ')})` : `Demand not met at ${unmet.join(', ')}`}</OutcomeRow>
                        ) : (
                            <OutcomeRow ok={served.length === AIRPORTS.length}>
                                Delivered SAF to {served.length === AIRPORTS.length ? 'all 4 airports' : `${served.length} of 4 airports`}: {kt(deliveredKt)} (demand not echoed by this run)
                            </OutcomeRow>
                        )}
                        <OutcomeRow ok={auditOk}>{auditOk ? 'Independent audit passed, no constraint violations' : `Audit not passed${failures.length ? `: ${failures.length} failure(s)` : ''}`}</OutcomeRow>
                        <OutcomeRow ok={infeasible ? false : true}>{infeasible ? 'Model reported infeasible' : 'Network is feasible'}</OutcomeRow>
                        <OutcomeRow ok={strandedKt <= TOL}>{strandedKt <= TOL ? 'No stranded biomass' : `Stranded biomass ${kt(strandedKt)}`}</OutcomeRow>
                        {baseline && basePct != null && (
                            <OutcomeRow ok={basePct >= 0 ? true : null}>{basePct >= 0 ? `Total cost ${pct(basePct)} lower than greedy baseline` : `Total cost ${pct(-basePct)} above greedy baseline`}</OutcomeRow>
                        )}
                        {!optimal && !infeasible && <OutcomeRow ok={null}>Best found, not proven optimal; the gap is not a saving</OutcomeRow>}
                    </ul>
                </section>
            </div>

            <section className={`p-5 ${card}`}>
                <h2 className="mb-4 text-[15px] font-bold text-deep">Top insights</h2>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <Insight tone="red" icon={<IconFlame />} title={topRef ? `Largest refinery: ${topRef.label}` : 'No refineries in this run'}>
                        {topRef ? `${topRef.size} refinery, ${kt(topRef.capacity_kt, 0)} capacity, ${pct(topRef.utilisation)} utilised.` : MISSING}
                    </Insight>
                    <Insight tone="green" icon={<IconNetwork />} title={deps.length ? `${deps.length} depot${deps.length === 1 ? '' : 's'} consolidate biomass` : 'No depots in this run'}>
                        {avgSupplyKm != null ? `Supply legs average ${km(avgSupplyKm, 0)} (kt-weighted) from ${sites} collection sites.` : MISSING}
                    </Insight>
                    <Insight tone="amber" icon={<IconTrend />} title={topLeg && legTotal > 0 ? `${LEG_LABEL[topLeg[0]]} is the largest cost leg` : 'No costed flows'}>
                        {topLeg && legTotal > 0 ? `${usd(topLeg[1])}, ${pct(topLeg[1] / legTotal)} of annual logistics cost.` : MISSING}
                    </Insight>
                </div>
                <div className="mt-3 flex justify-end">
                    <button type="button" onClick={() => go('results', 'costs')} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline">
                        View detailed analysis <IconArrow width={14} height={14} />
                    </button>
                </div>
            </section>
        </div>
    );
}
