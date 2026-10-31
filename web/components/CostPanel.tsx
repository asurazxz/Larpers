'use client';

// Cost, solver state, audit and baseline comparison. Every value is read from the run; anything the run
// does not carry shows "not in this run". Bars are plain divs, no chart library.
import type { Leg, Portfolio, Solution } from '../lib/contract';
import { bundle, solutionOf } from '../lib/bundle';
import { LEG_LABEL, MISSING, orMissing, pct, seconds, statusLabel, usd } from '../lib/format';
import { legSums } from '../lib/trace';
import { annualCost, CAPEX_YEARS, FIXED_OPEX_SHARE, type AnnualCost } from '../lib/annual';
import { Tween } from './motion';
import { preUpdateBasis } from '../lib/basis';
import { explainInput, fixedText, hasNoNetwork, plainReason } from '../lib/explain';
import ExplainButton from './ExplainButton';
import { Factory, ShieldCheck, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

const LEGS: Leg[] = ['supply_depot', 'depot_refinery', 'refinery_airport'];
const LEG_BAR: Record<Leg, string> = {
    supply_depot: '#2f9e4f',
    depot_refinery: '#e5a00d',
    refinery_airport: '#0ea5c6',
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Total horizon cost of a run: the stored total, else its primal. */
export function totalOf(s: Solution | null | undefined): number | null {
    if (!s) return null;
    if (finite(s.total_horizon_usd)) return s.total_horizon_usd;
    return finite(s.primal) ? s.primal : null;
}

function isBaseline(s: Solution, slug: string, family: string): boolean {
    return s.source === 'baseline' || s.status === 'heuristic' || /baseline|greedy/i.test(slug) || /baseline|greedy/i.test(family);
}

/** A stored greedy baseline for the same scenario (matched on scenario_hash), or null. */
export function storedBaselineFor(solution: Solution | null | undefined): Solution | null {
    if (!solution) return null;
    for (const [slug, entry] of Object.entries(bundle)) {
        const s = solutionOf(entry);
        if (!s || s === solution) continue;
        if (isBaseline(s, slug, entry.family ?? '') && s.scenario_hash === solution.scenario_hash) return s;
    }
    return null;
}

function Line({ k, v, strong, title }: { k: React.ReactNode; v: React.ReactNode; strong?: boolean; title?: string }) {
    return (
        <div className="flex justify-between gap-3 py-px" title={title}>
            <span className="text-ink2">{k}</span>
            <span className={`num text-right ${strong ? 'font-semibold' : 'font-medium'}`}>{v}</span>
        </div>
    );
}

function Bar({ frac, color, label }: { frac: number; color: string; label?: string }) {
    const w = Math.max(0, Math.min(1, frac)) * 100;
    return (
        <div className="my-0.5 h-1.5 w-full rounded-full bg-track" aria-label={label} title={label}>
            <div className="h-1.5 rounded-full" style={{ width: `${w}%`, background: color }} />
        </div>
    );
}

function Sub({ children }: { children: React.ReactNode }) {
    return <h3 className="mt-3 text-sm font-semibold text-ink2">{children}</h3>;
}

function Fold({ title, children, id }: { title: React.ReactNode; children: React.ReactNode; id?: string }) {
    return (
        <details id={id} className="hair-t py-1.5 first:border-t-0 first:pt-0">
            <summary className="text-base">{title}</summary>
            <div className="mt-1.5 pb-1 pl-5 text-sm text-ink">{children}</div>
        </details>
    );
}

function portfolioStatus(p: Portfolio): string {
    if (p.status !== 'skipped') {
        return statusLabel({ status: p.status, gap: p.gap ?? null });
    }
    return p.status.replace(/_/g, ' ');
}

function Residuals({ s }: { s: Solution }) {
    const v = s.validation;
    if (!v) return <div className="mt-1.5 text-ink2">Audit: {MISSING}</div>;
    const residuals = Object.entries(v.max_residuals ?? {});
    return residuals.length > 0 ? (
        <div className="mt-1.5 text-ink3">
            Audit max residuals:{' '}
            {residuals.map(([k, r], i) => (
                <span key={k}>
                    {i > 0 && ', '}
                    {k} {orMissing(r, (x: number) => (x === 0 ? '0' : Math.abs(x) >= 0.01 ? x.toFixed(3) : x.toExponential(1)))}
                </span>
            ))}
        </div>
    ) : (
        <div className="mt-1.5 text-ink3">Audit max residuals: {MISSING}</div>
    );
}

function AuditBadge({ s }: { s: Solution }) {
    const v = s.validation;
    if (!v) return <span id="audit-result" className="text-base text-ink2">Audit: {MISSING}</span>;
    const failures = v.failures ?? [];
    if (v.passed && hasNoNetwork(s)) return <span id="audit-result" data-passed="true" className="text-base text-ink2">No network to audit</span>;
    return (
        <span
            id="audit-result"
            data-passed={v.passed ? 'true' : 'false'}
            title="Independent audit of the stored solution"
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-0.5 text-base font-semibold ${
                v.passed ? 'bg-blue-50 text-blue-800' : 'bg-orange-100 text-orange-900'
            }`}
        >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" className="shrink-0">
                {v.passed ? (
                    <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                    <path d="M8 3v6.5M8 12.5v.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                )}
            </svg>
            Audit {v.passed ? 'PASSED' : `FAILED (${failures.length})`}
        </span>
    );
}

interface Derived {
    H: number | undefined;
    capex: number | null;
    logistics: number | null;
    /** The solver's own objective over the horizon: what the MILP minimised. */
    horizonTotal: number | null;
    annual: AnnualCost;
    /** Organisers' basis: total annual cost, like for like with the baseline's. */
    total: number | null;
    baseTotal: number | null;
    saving: number | null;
}

function derive(s: Solution, baseline: Solution | null): Derived {
    const annual = annualCost(s);
    const total = finite(annual.total) ? annual.total : null;
    const bt = baseline ? annualCost(baseline).total : null;
    const baseTotal = finite(bt) ? bt : null;
    return {
        H: s.scenario?.horizon_years,
        capex: finite(s.capex_usd) ? s.capex_usd : null,
        logistics: finite(s.logistics_annual_usd) ? s.logistics_annual_usd : null,
        horizonTotal: finite(s.total_horizon_usd) ? s.total_horizon_usd : null,
        annual,
        total,
        baseTotal,
        saving: baseTotal !== null && total !== null ? baseTotal - total : null,
    };
}

const fin = (v: number | null | undefined) => (finite(v) ? v : null);
const ANNUAL_ROWS = (a: AnnualCost): [string, string, number | null][] => [
    ['annual-capex', `CapEx ÷ ${CAPEX_YEARS} yr`, fin(a.annualisedCapex)],
    ['annual-fixed-opex', `Fixed OpEx ${pct(FIXED_OPEX_SHARE, 0)}`, fin(a.fixedOpex)],
    ['annual-variable-opex', 'Variable OpEx', fin(a.variableOpex)],
    ['annual-transport', 'Transport', fin(a.transport)],
];

/** Always-visible summary: total annual cost (organisers' basis), solver status, audit and the baseline saving. */
export function CostSummary({ solution, baseline, hold = false }: { solution: Solution | null; baseline: Solution | null; hold?: boolean }) {
    if (!solution) return <div className="text-base text-ink2">No run selected: {MISSING}.</div>;
    const s = solution;
    const { H, capex, horizonTotal, annual, total, baseTotal, saving } = derive(s, baseline);
    const failures = s.validation?.failures ?? [];
    const refineries = (s.facilities ?? []).filter((f) => f.type === 'refinery').length;
    const depots = (s.facilities ?? []).filter((f) => f.type === 'depot').length;
    const preUpdate = preUpdateBasis(s);
    const noNetwork = hasNoNetwork(s);
    const reason = plainReason(s.status_reason);
    const explanation = explainInput(s, baseline);
    return (
        <div id="cost-summary" className="text-base leading-snug" data-run-id={s.run_id} data-annual-source={annual.fromSolver ? 'solver' : 'recomputed'}>
            <div className="grid grid-cols-2 gap-2">
                <div className="tile col-span-2" data-kpi="total">
                    <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand-emerald via-brand-teal to-[#22d3ee]" />
                    <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                            <span className="tile-icon bg-brand-mint text-accent" aria-hidden="true">
                                <Wallet size={16} strokeWidth={2.25} />
                            </span>
                            <span className="eyebrow">Total annual cost</span>
                        </span>
                        <span id="cost-status" className="badge bg-brand-ink text-white">
                            {statusLabel(s)}
                        </span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                        {noNetwork ? (
                            <span id="cost-total" className="figure-xl text-brand-ink">
                                No network
                            </span>
                        ) : (
                            <Tween id="cost-total" className="figure-xl text-brand-ink" value={total} format={usd} start={!hold} />
                        )}
                        {total !== null && !noNetwork && <span className="text-base text-ink2">/ yr</span>}
                    </div>
                    {noNetwork ? (
                        <div id="no-network-reason" className="mt-1 text-ink2">
                            {reason.charAt(0).toUpperCase() + reason.slice(1)}.
                        </div>
                    ) : (
                        <div id="annual-rows" className="mt-1 grid grid-cols-2 gap-x-5 gap-y-0.5">
                            {ANNUAL_ROWS(annual).map(([id, k, v]) => (
                                <div key={id} id={id} className="flex items-baseline justify-between gap-2">
                                    <span className="text-ink2">{k}</span>
                                    <Tween className="num font-medium" value={v} format={usd} start={!hold} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {noNetwork ? null : baseline && baseTotal !== null && total !== null ? (
                    <div id="baseline-compare" className="tile col-span-2 flex items-center justify-between gap-3 py-2" data-kpi="saving">
                        <span className="flex items-center gap-2 text-ink2">
                            <span
                                className={`tile-icon ${saving !== null && saving >= 0 ? 'bg-brand-mint text-accent' : 'bg-brand-sand text-[#b45309]'}`}
                                aria-hidden="true"
                            >
                                {saving !== null && saving >= 0 ? <TrendingDown size={16} strokeWidth={2.25} /> : <TrendingUp size={16} strokeWidth={2.25} />}
                            </span>
                            {saving !== null && saving >= 0 ? 'Saving vs greedy baseline' : 'Greedy baseline cheaper by'}
                        </span>
                        <span className="num font-semibold text-brand-ink">
                            <Tween value={saving !== null ? Math.abs(saving) : null} format={usd} start={!hold} />/yr (
                            {pct(saving !== null && baseTotal ? Math.abs(saving) / baseTotal : null, 1)})
                        </span>
                    </div>
                ) : (
                    <div id="baseline-compare" className="tile col-span-2 flex items-center gap-2 py-2 text-ink2" data-kpi="saving">
                        <span className="tile-icon bg-track text-ink3" aria-hidden="true">
                            <TrendingDown size={16} strokeWidth={2.25} />
                        </span>
                        {baseline ? 'Greedy baseline annual total: not in this run' : 'Greedy baseline not in this run'}
                    </div>
                )}
                <div className="tile flex items-center justify-between gap-2 py-2" data-kpi="audit">
                    <span className="tile-icon bg-[#e6eef7] text-brand-navy" aria-hidden="true">
                        <ShieldCheck size={16} strokeWidth={2.25} />
                    </span>
                    <AuditBadge s={s} />
                </div>
                <div className="tile flex items-center justify-between gap-2 py-2" data-kpi="network" title="Refineries and depots opened in this run">
                    <span className="tile-icon bg-brand-sand text-[#b45309]" aria-hidden="true">
                        <Factory size={16} strokeWidth={2.25} />
                    </span>
                    <span className="sr-only">Network</span>
                    <span id="network-size" className="num whitespace-nowrap font-semibold text-brand-ink">
                        {s.facilities ? `${refineries} ref · ${depots} depots` : MISSING}
                    </span>
                </div>
            </div>
            {!noNetwork && (
            <div className="mt-1.5 px-1 leading-tight text-ink2" id="objective-note">
                {preUpdate ? (
                    <span data-testid="pre-update-basis" title={`Stored run's scenario: ${preUpdate.full}.`}>
                        Network solved before the 12:45 update ({preUpdate.short}); costs recomputed on the organisers&apos; annual basis
                    </span>
                ) : (
                    <>
                        Organisers&apos; basis
                        {!annual.fromSolver && (
                            <span className="font-medium text-ink3" title="Recomputed in the browser from this run's facilities and costs (lib/annual.ts), like the arc trace.">
                                , recomputed from this run
                            </span>
                        )}
                    </>
                )}
                . One-off CapEx <span className="num">{usd(capex)}</span>; MILP objective <span className="num">{usd(horizonTotal)}</span> (H ={' '}
                {orMissing(H, (h: number) => `${h} yr`)}).
            </div>
            )}
            {failures.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-orange-900">
                    {failures.map((f) => (
                        <li key={f}>{f}</li>
                    ))}
                </ul>
            )}
            {explanation && <ExplainButton key={s.run_id} id="explain" input={explanation} fixedText={fixedText(explanation)} />}
        </div>
    );
}

/** Detail behind closed <details>: per-leg breakdown, solver state, portfolios. */
export default function CostPanel({ solution, baseline }: { solution: Solution | null; baseline: Solution | null }) {
    if (!solution) return <div className="text-base text-ink2">No run selected: {MISSING}.</div>;
    const s = solution;
    const { H, capex, logistics, horizonTotal, annual, total, baseTotal } = derive(s, baseline);
    const logisticsOverH = logistics !== null && finite(H) ? logistics * H : null;
    const recomputedTotal = capex !== null && logisticsOverH !== null ? capex + logisticsOverH : null;
    const totalMatches =
        horizonTotal !== null && recomputedTotal !== null
            ? Math.abs(horizonTotal - recomputedTotal) <= Math.max(1, 1e-9 * Math.abs(horizonTotal))
            : null;

    const facilities = s.facilities ?? [];
    const capexRef = sum(facilities.filter((f) => f.type === 'refinery').map((f) => f.capex_usd ?? 0));
    const capexDepot = sum(facilities.filter((f) => f.type === 'depot').map((f) => f.capex_usd ?? 0));
    const hasFacilityCapex = facilities.some((f) => finite(f.capex_usd));
    // The contract has no per-leg split: it is summed from the run's flows and checked against logistics / year.
    const byLeg = legSums(s);
    const legTotal = sum(LEGS.map((l) => byLeg[l]));
    const legsMatch = logistics !== null ? Math.abs(legTotal - logistics) <= Math.max(1, 1e-6 * Math.abs(logistics)) : null;
    const maxLeg = Math.max(1, ...LEGS.map((l) => byLeg[l]));
    const nLarge = facilities.filter((f) => f.type === 'refinery' && f.size === 'large').length;
    const nSmall = facilities.filter((f) => f.type === 'refinery' && f.size === 'small').length;

    return (
        <div id="cost-panel" data-run-id={s.run_id}>
            {!hasNoNetwork(s) && <Fold
                id="cost-breakdown"
                title={
                    <>
                        Annual {usd(total)}: CapEx ÷ {CAPEX_YEARS} + OpEx + transport
                    </>
                }
            >
                <Line k={`Annualised CapEx (÷ ${CAPEX_YEARS} yr, no interest)`} v={usd(fin(annual.annualisedCapex))} />
                <Line k={`Fixed OpEx (${pct(FIXED_OPEX_SHARE, 0)} of CapEx / yr)`} v={usd(fin(annual.fixedOpex))} />
                <Line k="Variable OpEx ($/t biomass in)" v={usd(fin(annual.variableOpex))} />
                <Line k="Transport / year" v={usd(logistics)} />
                {hasFacilityCapex && (
                    <div className="pl-3 text-ink2">
                        refineries {usd(capexRef)}, depots {usd(capexDepot)}
                    </div>
                )}
                {s.flows.length > 0 ? (
                    <div className="mb-1 space-y-1 pl-3">
                        {LEGS.map((l) => {
                            const v = byLeg[l];
                            return (
                                <div key={l}>
                                    <div className="flex justify-between gap-2">
                                        <span className="text-ink2">{LEG_LABEL[l]}</span>
                                        <span className="num" title={`Sum of ${l} flow costs`}>{usd(v)}</span>
                                    </div>
                                    <Bar frac={v / maxLeg} color={LEG_BAR[l]} label={LEG_LABEL[l]} />
                                </div>
                            );
                        })}
                        {legsMatch !== null && (
                            <div className={legsMatch ? 'text-blue-800' : 'font-semibold text-orange-800'}>
                                {legsMatch ? 'Σ flows = logistics / year' : `Σ flows ${usd(legTotal)} ≠ logistics / year`}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="pl-3 text-ink2">Per-leg breakdown: {MISSING}</div>
                )}
                <Line k="Total annual cost" v={usd(total)} strong />
                <div className="text-ink2">
                    {annual.fromSolver ? 'From the solver’s annual fields.' : 'Recomputed from this run’s facilities and costs.'}
                </div>
                <Sub>What the MILP minimised (this run&apos;s objective)</Sub>
                <Line k="CapEx (one-off)" v={usd(capex)} />
                <div className="text-ink3">
                    CapEx {usd(capex)} + {orMissing(H)} × {usd(logistics)} = {usd(recomputedTotal)}
                    {totalMatches === true && <span className="text-blue-800"> = stored total</span>}
                    {totalMatches === false && <span className="font-semibold text-orange-800"> ≠ stored total</span>}
                </div>
                {horizonTotal !== null && capex !== null && logisticsOverH !== null && horizonTotal > 0 && (
                    <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-track" title="CapEx vs H × logistics">
                        <div style={{ width: `${(capex / horizonTotal) * 100}%`, background: '#1d1d1f' }} />
                        <div style={{ width: `${(logisticsOverH / horizonTotal) * 100}%`, background: '#e5a00d' }} />
                    </div>
                )}
                <Residuals s={s} />
                {baseline && baseTotal !== null && total !== null && (
                    <>
                        <Sub>Against greedy baseline (annual, like for like)</Sub>
                        <Line k="Greedy baseline total" v={usd(baseTotal)} />
                        <Bar frac={baseTotal / Math.max(baseTotal, total)} color="#aeaeb2" label="greedy baseline" />
                        <Line k="This run" v={usd(total)} />
                        <Bar frac={total / Math.max(baseTotal, total)} color="#0071e3" label="this run" />
                        <div className="text-ink2">
                            baseline run {baseline.run_id}, {baseline.source}
                        </div>
                    </>
                )}
            </Fold>}

            <Fold
                id="solver-state"
                title={
                    <>
                        Solver: {statusLabel(s)}, {seconds(s.solve_seconds)}
                    </>
                }
            >
                <Line k="Status" v={statusLabel(s)} strong />
                <Line k="Primal (best total found)" v={usd(s.primal)} />
                <Line k="Bound" v={usd(s.bound)} />
                <Line k="MIP gap" v={pct(s.gap, 2)} />
                <Line k="Facility candidates" v={orMissing(s.n_candidates)} />
                <Line k="Solve time" v={seconds(s.solve_seconds)} />
                <Line k="Refineries built" v={`${nLarge} large, ${nSmall} small`} />
            </Fold>

            <Fold id="portfolios" title={<>Refinery portfolios ({s.portfolios?.length ?? MISSING})</>}>
                {s.portfolios && s.portfolios.length > 0 ? (
                    <div className="space-y-1.5">
                        {s.portfolios.map((p, i) => {
                            const chosen = p.n_large === nLarge && p.n_small === nSmall;
                            return (
                                <div
                                    key={i}
                                    className={`rounded-xl px-2.5 py-1 ${chosen ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-canvas'}`}
                                >
                                    <div className="flex justify-between gap-2">
                                        <span className="font-semibold">
                                            {p.n_large}L + {p.n_small}S{chosen ? ' (chosen)' : ''}
                                        </span>
                                        <span>{portfolioStatus(p)}</span>
                                    </div>
                                    {p.reason ? (
                                        <div className="text-ink2">{p.reason}</div>
                                    ) : (
                                        <div className="num text-ink3">
                                            Primal {usd(p.primal)} · bound {usd(p.bound)} · gap {pct(p.gap, 2)} · {seconds(p.solve_seconds)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-ink2">Portfolios: {MISSING}</div>
                )}
            </Fold>
        </div>
    );
}
