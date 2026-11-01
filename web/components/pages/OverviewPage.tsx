'use client';

import { useState, type ReactNode } from 'react';
import NetworkMap from '../map/NetworkMap';
import RunExplain from '../RunExplain';
import { EmptyState, PageHeader } from '../common/ui';
import { IconDollar, IconTruck, IconCheck } from '../common/icons';
import { HeroArt, IconArrow, IconBuilding, IconDepot, IconFlame, IconNetwork, IconPin, IconPlaneSm, IconTrend, Kpi, OutcomeRow, RowButton, Tile } from '../overview/Parts';
import Legend from '../overview/Legend';
import { demandOf } from '../../lib/demand';
import { useApp } from '../../lib/store';
import { sites as allSites } from '../../lib/bundle';
import { runKind, runLabel } from '../../lib/runs';
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

/** "KAL_SUP_16 Kotawaringin Timur" -> place name first, ID as secondary text. */
function splitLabel(label: string): { id: string | null; name: string } {
    const m = /^([A-Z]+_[A-Z]+_\d+)\s+(.+)$/.exec(label);
    return m ? { id: m[1], name: m[2] } : { id: null, name: label };
}

const hover = 'transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function NetRow({ icon, tone, count, label, detail, hint, onClick }: { icon: ReactNode; tone: 'orange' | 'red' | 'blue' | 'amber'; count: ReactNode; label: string; detail?: string; hint: string; onClick: () => void }) {
    return (
        <li>
            <RowButton onClick={onClick} hint={hint} className="items-center gap-3">
                <Tile tone={tone} size="sm">{icon}</Tile>
                <span className="num w-6 text-lg font-bold text-deep">{count}</span>
                <span className="min-w-0 text-[13.5px] text-deep">
                    {label}
                    {detail && <span className="ml-1 text-[12px] text-muted">{detail}</span>}
                </span>
            </RowButton>
        </li>
    );
}

function Insight({ tone, icon, title, link, onClick, children }: { tone: 'red' | 'green' | 'amber'; icon: ReactNode; title: ReactNode; link: string; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} className={`group flex min-w-0 items-start gap-3 rounded-lg p-2 text-left ${hover}`}>
            <Tile tone={tone} size="md">{icon}</Tile>
            <div className="min-w-0">
                <div className="text-[14px] font-bold leading-snug text-deep">{title}</div>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{children}</p>
                <span className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary group-hover:underline">
                    {link} <IconArrow width={13} height={13} />
                </span>
            </div>
        </button>
    );
}

/** Lower is good (green); higher is neutral/amber. Same annual basis as the total. */
function vsText(basePct: number, against: string): { text: string; cls: string } {
    return basePct >= 0
        ? { text: `${pct(basePct)} lower than ${against} (annual)`, cls: 'font-semibold text-success' }
        : { text: `+${pct(-basePct)} vs ${against} (annual)`, cls: 'font-semibold text-warning' };
}

export default function OverviewPage() {
    const { solution, baseline, baselineKind, runSlug, isLive, go } = useApp();
    // The workspace is client-only, so the clock can seed the state directly.
    const [hello] = useState(greeting);

    if (!solution) {
        return (
            <div className="p-6 lg:p-8">
                <PageHeader title="Recommended SAF supply chain for Kalimantan" />
                <EmptyState title="No run selected">Pick a stored run or solve one in the planner.</EmptyState>
            </div>
        );
    }

    const s: Solution = solution;
    const kind = runKind(runSlug, isLive);
    const label = runSlug ? runLabel(runSlug) : 'this run';
    const disrupted = runSlug ? runSlug.replace(/^no_[a-z]+_/, '') : '';
    const disruptedName = splitLabel(allSites.find((x) => x.id === disrupted)?.label ?? disrupted).name;
    const netHeading = { base: 'Recommended network', baseline: 'Greedy baseline network', disruption: `Network if ${disruptedName} is unavailable`, earlier: 'Earlier assumptions network', live: 'Live run network', sensitivity: `Network for ${label}`, other: `Network for ${label}` }[kind];
    const heroLine = { base: 'Here is the recommended SAF supply chain for Kalimantan.', baseline: 'Greedy baseline (comparison only, not the recommendation).', disruption: `Network if ${disruptedName} is unavailable.`, earlier: 'Earlier assumptions (sensitivity), not the recommendation.', live: 'Live run.', sensitivity: `Network for ${label}.`, other: `Network for ${label}.` }[kind];
    const ann = annualCost(s);
    const demand = demandOf(s);
    const optimal = isProvenOptimal(s);
    const infeasible = s.status === 'infeasible';
    const heuristic = !infeasible && !optimal && (s.status === 'heuristic' || s.gap == null);

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

    // Comparator only on the same cost basis; a negative saving is shown as higher, never as a saving.
    const against = baselineKind === 'greedy' ? 'greedy baseline' : baselineKind === 'base' ? 'recommended network' : null;
    let basePct: number | null = null;
    if (baseline && against) {
        const bAnn = annualCost(baseline);
        const bTotal = ann.total != null ? bAnn.total : baseline.total_horizon_usd;
        if (bTotal != null && bTotal > 0) basePct = (bTotal - total) / bTotal;
    }

    const vs = basePct != null && against ? vsText(basePct, against) : null;

    const legs = legSums(s);
    const legTotal = (Object.values(legs) as number[]).reduce((a, b) => a + b, 0);
    const topLeg = (Object.entries(legs) as [Leg, number][]).sort((a, b) => b[1] - a[1])[0];
    const topRef = [...refs].sort((a, b) => b.capacity_kt - a.capacity_kt || b.utilisation - a.utilisation)[0];
    const topName = splitLabel(topRef?.label ?? '');
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
                    <h1 suppressHydrationWarning className="text-[28px] font-bold tracking-tight text-deep">{`${hello}.`}</h1>
                    <p className="mt-1 text-[15px] text-muted">{heroLine}</p>
                </div>
            </section>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi tone="blue" icon={<IconDollar width={24} height={24} />} label={totalLabel} value={usd(total)} onClick={() => go('results', 'costs')} hint="CapEx spread over 20 years plus fixed and variable OpEx, for one year. Opens the cost breakdown.">
                    {vs ? (
                        <span className={vs.cls}>{vs.text}</span>
                    ) : ann.total != null && ann.variableOpex == null ? (
                        'Variable OpEx not in this run'
                    ) : null}
                </Kpi>
                <Kpi tone="blue" icon={<IconBuilding width={24} height={24} />} label="CapEx (one-off)" value={usd(s.capex_usd)} onClick={() => go('results', 'costs')} hint="CapEx = capital expenditure, the one-off build cost of facilities. Opens the cost breakdown.">
                    Refineries {usd(refCapex)} · Depots {usd(depCapex)}
                </Kpi>
                <Kpi tone="blue" icon={<IconTruck width={24} height={24} />} label="Annual logistics cost" value={usd(s.logistics_annual_usd)} onClick={() => go('results', 'costs')} hint="Transport cost of moving biomass and SAF over the three legs, per year. Opens the cost breakdown.">
                    {s.flows.length} flows with a transport cost
                </Kpi>
                <Kpi tone={infeasible ? 'red' : optimal ? 'green' : 'amber'} icon={<IconCheck width={24} height={24} />} label="Solver status" onClick={() => go('reliability', 'validation')} hint="Gap = how far the best solution could be from the true optimum. Opens validation." value={<span className={`text-[17px] ${infeasible ? 'text-danger' : optimal ? 'text-success' : 'text-warning'}`}>{infeasible ? 'Infeasible' : optimal ? 'Proven optimal' : heuristic ? 'Heuristic' : 'Best found solution'}</span>}>
                    {infeasible ? 'No feasible network' : heuristic ? 'No optimality guarantee' : `Gap ${s.gap == null ? MISSING : pct(s.gap, 2)} · Runtime ${seconds(s.solve_seconds)}`}
                </Kpi>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <section className={`p-5 lg:col-span-3 ${card}`} aria-label={netHeading}>
                    <h2 className="mb-4 text-[15px] font-bold text-deep">{netHeading}</h2>
                    <ul className="space-y-1.5">
                        <NetRow icon={<IconFlame />} tone="orange" count={refs.length} label="Refineries" detail={`(${count('refinery', 'large')} large, ${count('refinery', 'small')} small)`} hint="Opens the facility list" onClick={() => go('results', 'facilities')} />
                        <NetRow icon={<IconDepot />} tone="red" count={deps.length} label="Depots" detail={`(${count('depot', 'large')} large, ${count('depot', 'small')} small)`} hint="Opens the facility list" onClick={() => go('results', 'facilities')} />
                        <NetRow icon={<IconPlaneSm />} tone="blue" count={served.length} label="Airports" detail={served.length === AIRPORTS.length ? '(all served)' : `(${served.length} of ${AIRPORTS.length}: ${served.join(', ') || 'none'})`} hint="Opens demand by airport" onClick={() => go('results', 'demand')} />
                        <NetRow icon={<IconPin />} tone="amber" count={sites} label="Collection sites" detail="(supplying biomass)" hint="Opens the Network Explorer" onClick={() => go('network')} />
                    </ul>
                </section>

                <section className={`flex flex-col overflow-hidden lg:col-span-5 ${card}`} aria-label="Network map preview">
                    <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
                        <h2 className="text-[15px] font-bold text-deep">Network map</h2>
                        <button type="button" onClick={() => go('network')} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1 text-[13px] font-semibold text-primary hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                            Open in Network Explorer <IconArrow width={14} height={14} />
                        </button>
                    </div>
                    <div className="relative h-[260px] border-y border-line">
                        <NetworkMap preview onPreviewClick={() => go('network')} />
                    </div>
                    <div className="px-4 py-2.5">
                        <Legend />
                    </div>
                </section>

                <section className={`p-5 lg:col-span-4 ${card}`}>
                    <h2 className="mb-4 text-[15px] font-bold text-deep">Key outcomes</h2>
                    <ul className="space-y-3">
                        {demand ? (
                            <OutcomeRow ok={demandMet}>{demandMet ? `All airport demands satisfied (${AIRPORTS.map((a) => `${a} ${kt(demand[a])}`).join(', ')})` : `Demand not met at ${unmet.join(', ')}`}</OutcomeRow>
                        ) : (
                            <OutcomeRow ok={served.length === AIRPORTS.length}>
                                Delivered SAF to {served.length === AIRPORTS.length ? `all ${AIRPORTS.length} airports` : `${served.length} of ${AIRPORTS.length} airports`}: {kt(deliveredKt)} (demand not echoed by this run)
                            </OutcomeRow>
                        )}
                        <OutcomeRow ok={auditOk}>{auditOk ? 'Independent audit passed, no constraint violations' : `Audit not passed${failures.length ? `: ${failures.length} failure(s)` : ''}`}</OutcomeRow>
                        <OutcomeRow ok={infeasible ? false : true}>{infeasible ? 'Model reported infeasible' : 'Network is feasible'}</OutcomeRow>
                        <OutcomeRow ok={strandedKt <= TOL ? true : demandMet === false ? false : null}>{strandedKt <= TOL ? 'No stranded biomass' : `${kt(strandedKt)} left uncollected${demandMet === false ? '' : ' (not needed for demand)'}`}</OutcomeRow>
                        {vs && <OutcomeRow ok={basePct != null && basePct >= 0 ? true : null}>{`Total cost ${vs.text}`}</OutcomeRow>}
                        {heuristic && <OutcomeRow ok={null}>Heuristic result with no optimality guarantee</OutcomeRow>}
                        {!optimal && !infeasible && !heuristic && <OutcomeRow ok={null}>Best found, not proven optimal; the gap is not a saving</OutcomeRow>}
                    </ul>
                </section>
            </div>

            <RunExplain />

            <section className={`p-5 ${card}`}>
                <h2 className="mb-4 text-[15px] font-bold text-deep">Top insights</h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Insight tone="red" icon={<IconFlame />} link="View facilities" onClick={() => go('results', 'facilities')} title={topRef ? <>Largest refinery: {topName.name}{topName.id && <span className="ml-1.5 text-[12px] font-normal text-muted">{topName.id}</span>}</> : 'No refineries in this run'}>
                        {topRef ? `${topRef.size} refinery, ${kt(topRef.capacity_kt)} biomass intake capacity, ${pct(topRef.utilisation)} utilised (share of capacity used).` : MISSING}
                    </Insight>
                    <Insight tone="green" icon={<IconNetwork />} link="View on the map" onClick={() => go('network')} title={deps.length ? `${deps.length} depot${deps.length === 1 ? '' : 's'} consolidate biomass` : 'No depots in this run'}>
                        {avgSupplyKm != null ? `Supply legs average ${km(avgSupplyKm)} (weighted by tonnes) from ${sites} collection sites.` : MISSING}
                    </Insight>
                    <Insight tone="amber" icon={<IconTrend />} link="View cost breakdown" onClick={() => go('results', 'costs')} title={topLeg && legTotal > 0 ? `${LEG_LABEL[topLeg[0]]} is the largest cost leg` : 'No costed flows'}>
                        {topLeg && legTotal > 0 ? `${usd(topLeg[1])}, ${pct(topLeg[1] / legTotal)} of annual logistics cost.` : MISSING}
                    </Insight>
                </div>
                <p className="mt-3 text-[12px] text-muted">kt = thousand tonnes. CapEx = one-off build cost, spread over 20 years in the 1-year total. OpEx = operating cost. Gap = distance from the proven optimum.</p>
            </section>
        </div>
    );
}
