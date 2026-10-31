'use client';

// Permanent failure band, never behind a click. Each cell states a failure and how you would know, computed
// from the selected run (and, for cross-run checks, the stored bundle). Missing values say "not in this run".
import type { Facility, Flow, Solution } from '../lib/contract';
import { bundle, sites, solutionOf } from '../lib/bundle';
import { km, kt, MISSING, pct, statusLabel, usd } from '../lib/format';

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
        <div id={id} className="min-w-0 border-l border-gray-300 pl-2 first:border-l-0 first:pl-0">
            <div className="font-bold">{title}</div>
            <div className="text-gray-800">{children}</div>
        </div>
    );
}

function How({ children }: { children: React.ReactNode }) {
    return <span className="text-gray-500"> How you know: {children}</span>;
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

// ---------- (2) Refinery capacity step ----------

function largeRefineryCapacity(s: Solution): { cap: number; basis?: string; from: string } | null {
    const own = s.facilities.find((f) => f.type === 'refinery' && f.size === 'large' && finite(f.capacity_kt) && f.capacity_basis !== 'biomass_in');
    if (own) return { cap: own.capacity_kt as number, basis: own.capacity_basis, from: 'this run' };
    for (const o of storedSolutions()) {
        const f = o.facilities.find((x) => x.type === 'refinery' && x.size === 'large' && finite(x.capacity_kt) && x.capacity_basis !== 'biomass_in');
        if (f) return { cap: f.capacity_kt as number, basis: f.capacity_basis, from: `stored run ${o.run_id}` };
    }
    return null;
}

// ---------- (3) Horizon flip ----------

function sameExceptHorizon(s: Solution): string | null {
    const sc = s.scenario;
    if (!sc) return null;
    return JSON.stringify([
        sc.yield,
        sc.road_factor,
        sc.collection_policy,
        sc.capacity_basis,
        sc.depot_retention,
        [...(sc.excluded_ids ?? [])].sort(),
        sc.demand_kt,
    ]);
}

interface Flip {
    a: Solution;
    b: Solution;
    extraCapex: number;
    annualSaving: number;
    years: number | null;
}

function horizonFlip(current: Solution): Flip | null {
    const pool = [current, ...storedSolutions().filter((x) => x !== current)].filter(
        (x) => x.status !== 'infeasible' && x.status !== 'heuristic' && x.source !== 'baseline' && finite(x.scenario?.horizon_years),
    );
    const groups = new Map<string, Solution[]>();
    for (const x of pool) {
        const k = sameExceptHorizon(x);
        if (k) groups.set(k, [...(groups.get(k) ?? []), x]);
    }
    const ck = sameExceptHorizon(current);
    const ordered = [...(ck && groups.has(ck) ? [groups.get(ck)!] : []), ...[...groups.entries()].filter(([k]) => k !== ck).map(([, v]) => v)];
    for (const g of ordered) {
        const hs = [...new Set(g.map((x) => x.scenario!.horizon_years))].sort((p, q) => p - q);
        if (hs.length < 2) continue;
        const hA = hs.includes(1) ? 1 : hs[0];
        const hB = hs.includes(5) ? 5 : hs[hs.length - 1];
        const a = g.find((x) => x.scenario!.horizon_years === hA)!;
        const b = g.find((x) => x.scenario!.horizon_years === hB)!;
        if (!finite(a.capex_usd) || !finite(b.capex_usd) || !finite(a.logistics_annual_usd) || !finite(b.logistics_annual_usd)) continue;
        const extraCapex = b.capex_usd - a.capex_usd;
        const annualSaving = a.logistics_annual_usd - b.logistics_annual_usd;
        const years = extraCapex > 0 && annualSaving > 0 ? extraCapex / annualSaving : null;
        return { a, b, extraCapex, annualSaving, years };
    }
    return null;
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

    // (2)
    const cap = s ? largeRefineryCapacity(s) : null;
    const breakEven = cap && totalBiomass > 0 ? cap.cap / totalBiomass : null;
    const y = s?.scenario?.yield;
    const basis = s?.scenario?.capacity_basis;
    const byYield = new Map<number, string>();
    for (const x of [...stored, ...(s ? [s] : [])]) {
        const yy = x.scenario?.yield;
        if (finite(yy) && x.status !== 'infeasible' && x.source !== 'baseline' && x.status !== 'heuristic' && x.scenario?.road_factor === s?.scenario?.road_factor) {
            byYield.set(yy, mix(x.facilities));
        }
    }
    const yields = [...byYield.entries()].sort((p, q) => p[0] - q[0]);

    // (3)
    const flip = s ? horizonFlip(s) : null;

    return (
        <div id="failure-band-content" className="text-xs leading-snug">
            <div className="mb-0.5 flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm font-bold">Where this fails</span>
                {s ? (
                    <span id="failure-run-state">
                        This run:{' '}
                        <span className={`font-bold ${s.status === 'infeasible' || nonZeroGap ? 'text-orange-800' : 'text-blue-900'}`}>
                            {s.status === 'infeasible' ? 'No feasible network: the solver could not find one under these inputs' : statusLabel(s)}
                        </span>
                        {nonZeroGap && ' (not proven optimal)'}
                        {portfolioGaps > 0 && `; ${portfolioGaps} portfolio(s) with non-zero gap`}; stranded {kt(strandedKt, 1)}; surplus SAF{' '}
                        {kt(surplusKt, 1)}. Stored runs: {storedGap} of {stored.length} with non-zero gap, {storedInfeasible} of {stored.length}{' '}
                        infeasible.
                    </span>
                ) : (
                    <span>{MISSING}</span>
                )}
            </div>
            <div className="grid grid-cols-4 gap-3">
                <Cell id="fail-north-kal" title={`1. North Kalimantan, ${kt(nkKt, 0)} (${pct(totalBiomass ? nkKt / totalBiomass : null, 1)})`}>
                    {nk ? (
                        <>
                            {nk.rows.map((r) => (
                                <div key={r.id} data-site={r.id} title={r.label}>
                                    <span className="font-medium">{r.id}</span>
                                    {r.usdPerKt !== undefined ? (
                                        <>
                                            {r.depot !== r.id && ` → ${r.depot} (${km(r.kmSupply, 0)})`} → {r.refinery ?? MISSING} (
                                            {km(r.kmOnward, 0)}): <span className="font-bold">{perT(r.usdPerKt)}</span>
                                            {nk.meanUsdPerKt ? `, ${(r.usdPerKt / nk.meanUsdPerKt).toFixed(1)}× mean` : ''}
                                            {onSelectFlow && r.traceIndex !== undefined && s && (
                                                <button
                                                    type="button"
                                                    className="ml-1 underline"
                                                    onClick={() => onSelectFlow(s.flows[r.traceIndex!], r.traceIndex!)}
                                                >
                                                    trace
                                                </button>
                                            )}
                                            {r.stranded !== null && `; stranded ${kt(r.stranded, 1)}`}
                                        </>
                                    ) : r.stranded !== null ? (
                                        <span className="font-bold text-orange-800" title={r.strandedReason}>
                                            : stranded {kt(r.stranded, 1)}
                                        </span>
                                    ) : (
                                        <>: no flow, {MISSING}</>
                                    )}
                                </div>
                            ))}
                            <How>
                                $/t biomass to the refinery gate vs network mean{' '}
                                {nk.meanUsdPerKt !== null ? perT(nk.meanUsdPerKt) : MISSING}, or stranded kt.
                            </How>
                        </>
                    ) : (
                        MISSING
                    )}
                </Cell>
                <Cell
                    id="fail-capacity-step"
                    title={breakEven !== null ? `2. Refinery capacity step at ${pct(breakEven, 3)} yield` : '2. Refinery capacity step'}
                >
                    {s && cap && breakEven !== null ? (
                        <>
                            <span id="break-even-yield" data-value={breakEven}>
                                {kt(cap.cap, 0)} large refinery / {kt(totalBiomass, 0)} biomass
                            </span>
                            {cap.from !== 'this run' && <span className="text-gray-500"> (capacity from {cap.from})</span>}.{' '}
                            {basis === 'biomass_input' && <span className="text-orange-800">Biomass-input capacity basis. </span>}
                            This run: {pct(y, 2)}
                            {finite(y) && (y > breakEven ? ', past the step' : ', below the step')} →{' '}
                            <span className="font-bold">{mix(s.facilities)}</span>.{' '}
                            {yields.length > 1 ? (
                                <>Stored: {yields.map(([yy, m]) => `${pct(yy, 2)} → ${m}`).join('; ')}.</>
                            ) : (
                                <>Other yields: {MISSING}.</>
                            )}
                            <How>the refinery count changes as you step yield.</How>
                        </>
                    ) : (
                        <>Large refinery capacity: {MISSING}</>
                    )}
                </Cell>
                <Cell id="fail-horizon-flip" title="3. Horizon flip">
                    {flip ? (
                        <>
                            H = {flip.a.scenario!.horizon_years}: {mix(flip.a.facilities)}, CapEx {usd(flip.a.capex_usd)},{' '}
                            {usd(flip.a.logistics_annual_usd)}/yr. H = {flip.b.scenario!.horizon_years}: {mix(flip.b.facilities)}, CapEx{' '}
                            {usd(flip.b.capex_usd)}, {usd(flip.b.logistics_annual_usd)}/yr.{' '}
                            {flip.years !== null ? (
                                <>
                                    Payback {usd(flip.extraCapex)} / {usd(flip.annualSaving)}/yr ={' '}
                                    <span className="font-bold" id="horizon-flip-years">
                                        {flip.years.toFixed(1)} yr
                                    </span>
                                    .
                                </>
                            ) : (
                                <>No CapEx-for-logistics trade between these horizons.</>
                            )}
                            <How>the network changes when H crosses the payback.</How>
                        </>
                    ) : (
                        <>
                            Payback of the longer-horizon network: <span id="horizon-flip-years">{MISSING}</span> (needs stored runs at two
                            horizons).
                        </>
                    )}
                </Cell>
                <Cell id="fail-not-modelled" title="4. Not modelled">
                    OpEx (none given), seasonality, moisture, road network (straight-line × road factor).
                    <How>totals are transport plus CapEx only.</How>
                </Cell>
            </div>
        </div>
    );
}
