'use client';

// Permanent failure band, never behind a click. Each cell states a failure and how you would know, computed
// from the selected run (and, for cross-run checks, the stored bundle). Missing values say "not in this run".
import type { Facility, Flow, Solution } from '../lib/contract';
import { bundle, sites, solutionOf } from '../lib/bundle';
import { km, kt, MISSING, pct, statusLabel } from '../lib/format';
import { annualCost, CAPEX_YEARS, FIXED_OPEX_SHARE } from '../lib/annual';
import { preUpdateBasis } from '../lib/basis';

/** Bulungan, North Kalimantan. Tarakan ferry row only once Denzel confirms a second source. */
const NORTH_KAL_IDS = ['KAL_SUP_18', 'KAL_SUP_70'];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const perT = (usdPerKt: number) => `$${(usdPerKt / 1000).toFixed(2)}/t`;

function storedSolutions(): Solution[] {
    const out: Solution[] = [];
    for (const e of Object.values(bundle)) {
        const s = solutionOf(e);
        if (s) out.push(s);
    }
    return out;
}

function mix(facilities: Facility[]): string {
    const r = facilities.filter((f) => f.type === 'refinery');
    const L = r.filter((f) => f.size === 'large').length;
    const S = r.filter((f) => f.size === 'small').length;
    return `${L}L + ${S}S`;
}

function Cell({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
    return (
        <div id={id} className="min-w-0 rounded-2xl bg-white px-3 py-1.5 shadow-card">
            <div className="font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</div>
            <div className="mt-0.5 text-ink3">{children}</div>
        </div>
    );
}

function How({ children }: { children: React.ReactNode }) {
    return <span className="text-ink2"> How you know: {children}</span>;
}

// ---------- (1) North Kalimantan ----------

interface SiteRoute {
    id: string;
    label: string;
    supplyKt: number | null;
    stranded: number | null;
    strandedReason?: string;
    depot?: string;
    refinery?: string;
    kmSupply?: number;
    kmOnward?: number;
    usdPerKt?: number;
    traceIndex?: number;
}

function northKal(s: Solution): { rows: SiteRoute[]; meanUsdPerKt: number | null } {
    const supply = s.flows.filter((f) => f.leg === 'supply_depot');
    const onward = s.flows.filter((f) => f.leg === 'depot_refinery');
    const supplyKt = sum(supply.map((f) => f.kt));
    const meanUsdPerKt = supplyKt > 0 ? (sum(supply.map((f) => f.cost_usd)) + sum(onward.map((f) => f.cost_usd))) / supplyKt : null;
    const outOf = (depot: string) => onward.filter((f) => f.from === depot);
    const idx = (f: Flow) => s.flows.indexOf(f);

    const rows = NORTH_KAL_IDS.map((id): SiteRoute => {
        const site = sites.find((x) => x.id === id);
        const label = site ? `${id}, ${site.district}` : id;
        const st = (s.stranded ?? []).filter((x) => x.site_id === id);
        const legs = supply.filter((f) => f.from === id);
        const shipped = sum(legs.map((f) => f.kt));
        if (legs.length === 0) {
            return {
                id,
                label,
                supplyKt: site?.kt ?? null,
                stranded: st.length ? sum(st.map((x) => x.kt)) : null,
                strandedReason: st[0]?.reason,
            };
        }
        // Site $/t to the refinery gate: its supply leg plus its depot's average onward cost per kt.
        let usdTotal = 0;
        let kmSup = 0;
        let kmOn = 0;
        let onKt = 0;
        let refinery: string | undefined;
        let traceFlow: Flow | undefined;
        for (const f of legs) {
            const outs = outOf(f.to);
            const outKt = sum(outs.map((o) => o.kt));
            const outUsdPerKt = outKt > 0 ? sum(outs.map((o) => o.cost_usd)) / outKt : 0;
            usdTotal += f.cost_usd + f.kt * outUsdPerKt;
            kmSup += f.km * f.kt;
            for (const o of outs) {
                kmOn += o.km * o.kt * (f.kt / outKt);
                onKt += o.kt * (f.kt / outKt);
            }
            const main = [...outs].sort((a, b) => b.kt - a.kt)[0];
            refinery = refinery ?? main?.to;
            traceFlow = traceFlow ?? (f.km > 0 ? f : main);
        }
        return {
            id,
            label,
            supplyKt: site?.kt ?? null,
            stranded: st.length ? sum(st.map((x) => x.kt)) : null,
            strandedReason: st[0]?.reason,
            depot: legs.map((f) => f.to).join(', '),
            refinery,
            kmSupply: kmSup / shipped,
            kmOnward: onKt > 0 ? kmOn / onKt : undefined,
            usdPerKt: usdTotal / shipped,
            traceIndex: traceFlow ? idx(traceFlow) : undefined,
        };
    });
    return { rows, meanUsdPerKt };
}

// ---------- (2) Refinery capacity ----------

/** Large-refinery biomass intake, kt/yr, from this run's facilities (else another stored run's). */
function largeRefineryIntake(s: Solution): { intake: number; from: string } | null {
    const intakeOf = (f: Facility, y: number | undefined): number | null => {
        if (!finite(f.capacity_kt)) return null;
        if (f.capacity_basis === 'biomass_in') return f.capacity_kt;
        return finite(y) && y > 0 ? f.capacity_kt / y : null;
    };
    const find = (x: Solution) => {
        for (const f of x.facilities) {
            if (f.type !== 'refinery' || f.size !== 'large') continue;
            const v = intakeOf(f, x.scenario?.yield);
            if (v !== null) return v;
        }
        return null;
    };
    const own = find(s);
    if (own !== null) return { intake: own, from: 'this run' };
    for (const o of storedSolutions()) {
        const v = find(o);
        if (v !== null) return { intake: v, from: `stored run ${o.run_id}` };
    }
    return null;
}

/** SAF required: the run's echoed demand, else the SAF it delivered. */
function safRequired(s: Solution): { kt: number; basis: 'demand' | 'delivered' } | null {
    const d = s.scenario?.demand_kt;
    if (d) {
        const vals = Object.values(d).filter(finite);
        if (vals.length > 0) return { kt: sum(vals), basis: 'demand' };
    }
    const delivered = sum(s.flows.filter((f) => f.leg === 'refinery_airport').map((f) => f.kt));
    return delivered > 0 ? { kt: delivered, basis: 'delivered' } : null;
}

// ---------- band ----------

export interface FailureBandProps {
    solution: Solution | null;
    /** Opens the trace on a flow (e.g. a North Kalimantan site's leg). */
    onSelectFlow?: (flow: Flow, index: number) => void;
}

export default function FailureBand({ solution, onSelectFlow }: FailureBandProps) {
    const s = solution;
    const stored = storedSolutions();
    const storedGap = stored.filter((x) => finite(x.gap) && Math.abs(x.gap) > 1e-9).length;
    const storedInfeasible = stored.filter((x) => x.status === 'infeasible').length;

    // Run state
    const strandedKt = s ? sum((s.stranded ?? []).map((x) => x.kt)) : null;
    const surplusKt = s ? sum((s.surplus ?? []).map((x) => x.kt)) : null;
    const nonZeroGap = s ? finite(s.gap) && Math.abs(s.gap) > 1e-9 : false;
    const portfolioGaps = s ? (s.portfolios ?? []).filter((p) => finite(p.gap) && Math.abs(p.gap as number) > 1e-9).length : 0;

    // (1)
    const nk = s ? northKal(s) : null;
    const totalBiomass = sum(sites.map((x) => x.kt));
    const nkKt = sum(sites.filter((x) => NORTH_KAL_IDS.includes(x.id)).map((x) => x.kt));

    // (2) refineries needed = biomass intake required / large refinery intake
    const y = s?.scenario?.yield;
    const saf = s ? safRequired(s) : null;
    const bioNeeded = saf && finite(y) && y > 0 ? saf.kt / y : null;
    const cap = s ? largeRefineryIntake(s) : null;
    const preUpdate = preUpdateBasis(s);
    const nNeeded = bioNeeded !== null && cap && cap.intake > 0 ? Math.ceil(bioNeeded / cap.intake - 1e-9) : null;

    // (3) annualisation, checked against this run
    const ac = s ? annualCost(s) : null;
    const impliedYears = s && ac && finite(s.capex_usd) && finite(ac.annualisedCapex) && ac.annualisedCapex > 0 ? s.capex_usd / ac.annualisedCapex : null;
    const impliedFixed = s && ac && finite(s.capex_usd) && s.capex_usd > 0 && finite(ac.fixedOpex) ? ac.fixedOpex / s.capex_usd : null;

    return (
        <div id="failure-band-content" className="text-base leading-tight">
            <div className="mb-1 flex flex-wrap items-baseline gap-x-3 px-1">
                <span className="font-semibold tracking-[-0.01em]">Where this fails</span>
                {s ? (
                    <span
                        className="text-ink2"
                        id="failure-run-state"
                        title={[nonZeroGap ? 'Not proven optimal.' : '', portfolioGaps > 0 ? `${portfolioGaps} portfolio(s) with non-zero gap.` : '']
                            .filter(Boolean)
                            .join(' ')}
                    >
                        This run:{' '}
                        <span className={`font-semibold ${s.status === 'infeasible' || nonZeroGap ? 'text-orange-800' : 'text-blue-800'}`}>
                            {s.status === 'infeasible' ? 'No feasible network: the solver could not find one under these inputs' : statusLabel(s)}
                        </span>
; stranded {kt(strandedKt, 1)}; surplus SAF {kt(surplusKt, 1)}.
                        Stored: {storedGap} of {stored.length} gap &gt; 0, {storedInfeasible} of {stored.length} infeasible.
                    </span>
                ) : (
                    <span>{MISSING}</span>
                )}
            </div>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[1.3fr_1.2fr_0.95fr_0.85fr]">
                <Cell id="fail-north-kal" title={`1. N. Kalimantan, ${kt(nkKt, 0)} (${pct(totalBiomass ? nkKt / totalBiomass : null, 1)})`}>
                    {nk ? (
                        <>
                            {nk.rows.map((r) => (
                                <div
                                    key={r.id}
                                    data-site={r.id}
                                    title={
                                        r.usdPerKt !== undefined
                                            ? `${r.label}${r.depot !== r.id ? ` → ${r.depot} (${km(r.kmSupply, 0)})` : ''} → ${r.refinery ?? MISSING} (${km(r.kmOnward, 0)})`
                                            : r.label
                                    }
                                >
                                    <span className="font-medium text-ink">{r.id}</span>
                                    {r.usdPerKt !== undefined ? (
                                        <>
                                            : <span className="num font-semibold text-ink">{perT(r.usdPerKt)}</span>
                                            {nk.meanUsdPerKt ? `, ${(r.usdPerKt / nk.meanUsdPerKt).toFixed(1)}× mean` : ''}
                                            {onSelectFlow && r.traceIndex !== undefined && s && (
                                                <button
                                                    type="button"
                                                    className="ml-1 rounded-full px-1 text-accent hover:bg-blue-50"
                                                    onClick={() => onSelectFlow(s.flows[r.traceIndex!], r.traceIndex!)}
                                                >
                                                    trace
                                                </button>
                                            )}
                                            {r.stranded !== null && `; stranded ${kt(r.stranded, 1)}`}
                                        </>
                                    ) : r.stranded !== null ? (
                                        <span className="font-semibold text-orange-800" title={r.strandedReason}>
                                            : stranded {kt(r.stranded, 1)}
                                        </span>
                                    ) : (
                                        <>: no flow, {MISSING}</>
                                    )}
                                </div>
                            ))}
                            <How>$/t vs mean {nk.meanUsdPerKt !== null ? perT(nk.meanUsdPerKt) : MISSING}.</How>
                        </>
                    ) : (
                        MISSING
                    )}
                </Cell>
                <Cell
                    id="fail-capacity-step"
                    title={nNeeded !== null ? `2. Capacity: ${nNeeded} large ${nNeeded === 1 ? 'refinery' : 'refineries'} needed` : '2. Refinery capacity'}
                >
                    {s && saf && bioNeeded !== null && cap ? (
                        <>
                            <span
                                id="refineries-needed"
                                data-value={nNeeded ?? undefined}
                                title={`${kt(bioNeeded, 0)} biomass / ${kt(cap.intake, 0)} intake per large refinery${cap.from !== 'this run' ? ` (capacity from ${cap.from})` : ''}`}
                            >
                                {kt(saf.kt, 0)} SAF{saf.basis === 'delivered' ? ' delivered' : ''} at {pct(y, 0)} needs {kt(bioNeeded, 0)} biomass
                                {totalBiomass > 0 && <> (of {kt(totalBiomass, 0)})</>}, {kt(cap.intake, 0)} per large refinery.
                            </span>{' '}
                            This run: <span className="font-semibold text-ink">{mix(s.facilities)}</span>.
                            {preUpdate && <span className="text-ink2" data-testid="pre-update-capacity" title={`Stored run's scenario: ${preUpdate.full}.`}> Solved before the 12:45 update.</span>}
                        </>
                    ) : (
                        <>
                            Refineries needed: {MISSING}
                            {s && !finite(y) ? ' (yield not in this run)' : ''}.
                        </>
                    )}
                </Cell>
                <Cell id="fail-annualisation" title="3. Annualisation">
                    CapEx ÷ {CAPEX_YEARS} years, no interest; fixed OpEx {pct(FIXED_OPEX_SHARE, 0)}/yr, per the organisers&apos; basis.{' '}
                    <span id="annualisation-check" className="text-ink2" title={ac ? (ac.fromSolver ? 'From the solver' : 'Recomputed from this run') : undefined}>
                        This run: ÷ {impliedYears !== null ? impliedYears.toFixed(1) : MISSING} yr, {pct(impliedFixed, 1)}.
                    </span>
                </Cell>
                <Cell id="fail-not-modelled" title="4. Not modelled">
                    <span title="Distances are straight-line km × road factor; CapEx is annualised without interest.">
                        Seasonality, moisture, road network, interest and financing.
                    </span>
                    <How>km are straight-line.</How>
                </Cell>
            </div>
        </div>
    );
}
