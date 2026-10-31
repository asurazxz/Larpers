'use client';

// Cost, solver state, audit and baseline comparison. Every value is read from the run; anything the run
// does not carry shows "not in this run". Bars are plain divs, no chart library.
import type { Leg, Portfolio, Solution } from '../lib/contract';
import { bundle, solutionOf } from '../lib/bundle';
import { LEG_LABEL, MISSING, orMissing, pct, seconds, statusLabel, usd } from '../lib/format';
import { legSums } from '../lib/trace';

const LEGS: Leg[] = ['supply_depot', 'depot_refinery', 'refinery_airport'];
const LEG_BAR: Record<Leg, string> = {
    supply_depot: '#2e9e44',
    depot_refinery: '#e0a100',
    refinery_airport: '#0aa5c2',
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
        <div className="flex justify-between gap-3" title={title}>
            <span className="text-gray-600">{k}</span>
            <span className={`text-right ${strong ? 'font-bold' : 'font-medium'}`}>{v}</span>
        </div>
    );
}

function Bar({ frac, color, label }: { frac: number; color: string; label?: string }) {
    const w = Math.max(0, Math.min(1, frac)) * 100;
    return (
        <div className="h-2 w-full rounded-sm bg-gray-200" aria-label={label} title={label}>
            <div className="h-2 rounded-sm" style={{ width: `${w}%`, background: color }} />
        </div>
    );
}

function Sub({ children }: { children: React.ReactNode }) {
    return <h3 className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">{children}</h3>;
}

function portfolioStatus(p: Portfolio): string {
    if (p.status !== 'skipped') {
        return statusLabel({ status: p.status, gap: p.gap ?? null });
    }
    return p.status.replace(/_/g, ' ');
}

function AuditBlock({ s }: { s: Solution }) {
    const v = s.validation;
    if (!v) return <div className="text-gray-600">Audit: {MISSING}</div>;
    const residuals = Object.entries(v.max_residuals ?? {});
    const failures = v.failures ?? [];
    return (
        <div
            id="audit-result"
            data-passed={v.passed ? 'true' : 'false'}
            className={`mt-1 rounded border px-2 py-1 ${v.passed ? 'border-blue-700 bg-blue-50' : 'border-orange-700 bg-orange-50'}`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="font-bold">Independent audit</span>
                <span className={`font-bold ${v.passed ? 'text-blue-800' : 'text-orange-800'}`}>
                    {v.passed ? 'PASSED' : `FAILED (${failures.length})`}
                </span>
            </div>
            {residuals.length > 0 ? (
                <div className="text-xs text-gray-700">
                    Max residuals:{' '}
                    {residuals.map(([k, r], i) => (
                        <span key={k}>
                            {i > 0 && ', '}
                            {k} {orMissing(r, (x: number) => (x === 0 ? '0' : Math.abs(x) >= 0.01 ? x.toFixed(3) : x.toExponential(1)))}
                        </span>
                    ))}
                </div>
            ) : (
                <div className="text-xs text-gray-700">Max residuals: {MISSING}</div>
            )}
            {failures.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-orange-900">
                    {failures.map((f) => (
                        <li key={f}>{f}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default function CostPanel({ solution, baseline }: { solution: Solution | null; baseline: Solution | null }) {
    if (!solution) return <div className="text-sm text-gray-600">No run selected: {MISSING}.</div>;
    const s = solution;
    const H = s.scenario?.horizon_years;
    const capex = finite(s.capex_usd) ? s.capex_usd : null;
    const logistics = finite(s.logistics_annual_usd) ? s.logistics_annual_usd : null;
    const total = finite(s.total_horizon_usd) ? s.total_horizon_usd : null;
    const logisticsOverH = logistics !== null && finite(H) ? logistics * H : null;
    const recomputedTotal = capex !== null && logisticsOverH !== null ? capex + logisticsOverH : null;
    const totalMatches =
        total !== null && recomputedTotal !== null ? Math.abs(total - recomputedTotal) <= Math.max(1, 1e-9 * Math.abs(total)) : null;

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

    const baseTotal = totalOf(baseline);
    const saving = baseTotal !== null && total !== null ? baseTotal - total : null;

    return (
        <div id="cost-panel" className="text-sm" data-run-id={s.run_id}>
            <Line k="CapEx (one-off)" v={usd(capex)} />
            {hasFacilityCapex && (
                <div className="pl-3 text-xs text-gray-600">
                    refineries {usd(capexRef)}, depots {usd(capexDepot)}
                </div>
            )}
            <Line k="Logistics / year" v={usd(logistics)} />
            {s.flows.length > 0 ? (
                <div className="mb-1 space-y-0.5 pl-3 text-xs">
                    {LEGS.map((l) => {
                        const v = byLeg[l];
                        return (
                            <div key={l}>
                                <div className="flex justify-between gap-2">
                                    <span className="text-gray-600">{LEG_LABEL[l]}</span>
                                    <span title={`Sum of ${l} flow costs`}>{usd(v)}</span>
                                </div>
                                <Bar frac={v / maxLeg} color={LEG_BAR[l]} label={LEG_LABEL[l]} />
                            </div>
                        );
                    })}
                    {legsMatch !== null && (
                        <div className={legsMatch ? 'text-blue-800' : 'font-bold text-orange-800'}>
                            {legsMatch ? 'Σ flows = logistics / year' : `Σ flows ${usd(legTotal)} ≠ logistics / year`}
                        </div>
                    )}
                </div>
            ) : (
                <div className="pl-3 text-xs text-gray-600">Per-leg breakdown: {MISSING}</div>
            )}
            <Line k="OpEx" v="not provided" title="The challenge gives no operating cost; it is not modelled." />
            <div className="mt-1 border-t border-gray-300 pt-1">
                <Line
                    k={<>Total over H = {orMissing(H, (h: number) => `${h} yr`)}</>}
                    v={<span id="cost-total">{usd(total)}</span>}
                    strong
                />
                <div className="text-xs text-gray-600">
                    CapEx {usd(capex)} + {orMissing(H)} × {usd(logistics)} = {usd(recomputedTotal)}
                    {totalMatches === true && <span className="text-blue-800"> = stored total</span>}
                    {totalMatches === false && <span className="font-bold text-orange-800"> ≠ stored total</span>}
                </div>
                {total !== null && capex !== null && logisticsOverH !== null && total > 0 && (
                    <div className="mt-1 flex h-2 w-full overflow-hidden rounded-sm bg-gray-200" title="CapEx vs H × logistics">
                        <div style={{ width: `${(capex / total) * 100}%`, background: '#0b4f5c' }} />
                        <div style={{ width: `${(logisticsOverH / total) * 100}%`, background: '#e0a100' }} />
                    </div>
                )}
                <AuditBlock s={s} />
            </div>

            <Sub>Against greedy baseline</Sub>
            {baseline && baseTotal !== null && total !== null ? (
                <div id="baseline-compare">
                    <Line k="Greedy baseline total" v={usd(baseTotal)} />
                    <Bar frac={baseTotal / Math.max(baseTotal, total)} color="#6b7280" label="greedy baseline" />
                    <Line k="This run" v={usd(total)} />
                    <Bar frac={total / Math.max(baseTotal, total)} color="#0b4f5c" label="this run" />
                    <Line
                        k={saving !== null && saving >= 0 ? 'Saving vs greedy baseline' : 'Greedy baseline is cheaper by'}
                        v={`${usd(saving !== null ? Math.abs(saving) : null)} (${pct(saving !== null && baseTotal ? Math.abs(saving) / baseTotal : null, 1)})`}
                        strong
                    />
                    <div className="text-xs text-gray-600">
                        baseline run {baseline.run_id}, {baseline.source}
                    </div>
                </div>
            ) : (
                <div id="baseline-compare" className="text-gray-600">
                    {baseline ? 'Greedy baseline total: not in this run' : 'Greedy baseline not in this run'}
                </div>
            )}

            <Sub>Solver state</Sub>
            <div id="solver-state">
                <Line k="Status" v={statusLabel(s)} strong />
                <Line k="Primal (best total found)" v={usd(s.primal)} />
                <Line k="Bound" v={usd(s.bound)} />
                <Line k="MIP gap" v={pct(s.gap, 2)} />
                <Line k="Facility candidates" v={orMissing(s.n_candidates)} />
                <Line k="Solve time" v={seconds(s.solve_seconds)} />
                <Line k="Refineries built" v={`${nLarge} large, ${nSmall} small`} />
            </div>
            {s.portfolios && s.portfolios.length > 0 ? (
                <div className="mt-1 space-y-1 text-xs">
                    <div className="text-gray-600">Refinery portfolios ({s.portfolios.length})</div>
                    {s.portfolios.map((p, i) => {
                        const chosen = p.n_large === nLarge && p.n_small === nSmall;
                        return (
                            <div
                                key={i}
                                className={`rounded border px-1.5 py-0.5 ${chosen ? 'border-gray-800 bg-gray-100' : 'border-gray-200'}`}
                            >
                                <div className="flex justify-between gap-2">
                                    <span className="font-bold">
                                        {p.n_large}L + {p.n_small}S{chosen ? ' (chosen)' : ''}
                                    </span>
                                    <span>{portfolioStatus(p)}</span>
                                </div>
                                {p.reason ? (
                                    <div className="text-gray-600">{p.reason}</div>
                                ) : (
                                    <div className="text-gray-700">
                                        Primal {usd(p.primal)} · bound {usd(p.bound)} · gap{' '}
                                        {pct(p.gap, 2)} · {seconds(p.solve_seconds)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-xs text-gray-600">Portfolios: {MISSING}</div>
            )}
        </div>
    );
}
