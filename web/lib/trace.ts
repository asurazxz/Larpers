// Pure recomputation for the arc-click trace and the provenance count. No React, no imports from the
// solver: every stored km and cost is rebuilt from lat/lon, the run's road factor and the PDF rates.
import type { Flow, Leg, Solution } from './contract';

/** Mean Earth radius, the same constant as data/prepare.py and scripts/make-fixture.mjs. */
export const EARTH_RADIUS_KM = 6371.0088;

/** Airbus PDF p. 3, USD per tonne-km. Used instead of the flow's own rate so a wrong stored rate shows up. */
export const PDF_RATE: Record<Leg, number> = {
    supply_depot: 0.1,
    depot_refinery: 0.12,
    refinery_airport: 0.08,
};

/** Stored km must be within this of haversine × road factor (hav_km is stored at 2 dp). */
export const KM_TOL = 0.5;
/** Cost tolerance: the larger of $1 and 1e-6 relative, plus the cost effect of the observed km difference. */
export const COST_ABS_TOL = 1;
export const COST_REL_TOL = 1e-6;
const RATE_TOL = 1e-12;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export interface RoadFactor {
    value: number;
    /** `run` = solution.scenario.road_factor; `flow` = the flow's own field, used only when the run has none. */
    source: 'run' | 'flow';
}

/** The run's road factor. Falls back to the flow's own value only when the run does not echo its scenario. */
export function runRoadFactor(solution: Solution | null | undefined, flow?: Flow): RoadFactor | null {
    const rf = solution?.scenario?.road_factor;
    if (typeof rf === 'number' && Number.isFinite(rf)) return { value: rf, source: 'run' };
    if (flow && Number.isFinite(flow.road_factor)) return { value: flow.road_factor, source: 'flow' };
    return null;
}

export interface FlowTrace {
    leg: Leg;
    kt: number;
    havKm: number;
    roadFactor: number;
    roadFactorSource: RoadFactor['source'];
    km: number;
    rate: number;
    cost: number;
    storedHavKm: number;
    storedKm: number;
    storedRate: number;
    storedCost: number;
    dKm: number;
    dCost: number;
    costTol: number;
    kmOk: boolean;
    costOk: boolean;
    rateOk: boolean;
    pass: boolean;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Recompute one flow: haversine × road factor → km; kt × 1000 × km × PDF rate → cost. */
export function traceFlow(flow: Flow, roadFactor: RoadFactor): FlowTrace {
    const havKm = haversineKm(flow.from_lat, flow.from_lon, flow.to_lat, flow.to_lon);
    const km = havKm * roadFactor.value;
    const rate = PDF_RATE[flow.leg];
    const cost = flow.kt * 1000 * km * rate;
    const storedKm = flow.km;
    const storedCost = flow.cost_usd;
    const dKm = km - storedKm;
    const dCost = cost - storedCost;
    const costTol =
        Math.max(COST_ABS_TOL, COST_REL_TOL * Math.abs(finite(storedCost) ? storedCost : 0)) +
        Math.abs(flow.kt * 1000 * rate * (finite(dKm) ? dKm : 0));
    const kmOk = finite(storedKm) && Math.abs(dKm) <= KM_TOL;
    const costOk = finite(storedCost) && finite(cost) && Math.abs(dCost) <= costTol;
    const rateOk = rate !== undefined && finite(flow.rate_usd_per_t_km) && Math.abs(flow.rate_usd_per_t_km - rate) <= RATE_TOL;
    return {
        leg: flow.leg,
        kt: flow.kt,
        havKm,
        roadFactor: roadFactor.value,
        roadFactorSource: roadFactor.source,
        km,
        rate,
        cost,
        storedHavKm: flow.hav_km,
        storedKm,
        storedRate: flow.rate_usd_per_t_km,
        storedCost,
        dKm,
        dCost,
        costTol,
        kmOk,
        costOk,
        rateOk,
        pass: kmOk && costOk && rateOk,
    };
}

/** The same rule Map.tsx uses: 0 km co-located flows are kept in the data but not drawn. */
export function isDrawn(f: Flow): boolean {
    return f.km > 0 && !(f.from_lat === f.to_lat && f.from_lon === f.to_lon);
}

export interface TraceSummary {
    /** Drawn arcs that pass, and how many are drawn. */
    pass: number;
    total: number;
    /** Indices into solution.flows of every failing flow, drawn or not. */
    failing: number[];
    /** Co-located (undrawn) flows: checked too, so a corrupted 0 km cost still shows. */
    hiddenPass: number;
    hiddenTotal: number;
}

export function traceAll(solution: Solution | null | undefined): TraceSummary {
    const out: TraceSummary = { pass: 0, total: 0, failing: [], hiddenPass: 0, hiddenTotal: 0 };
    if (!solution) return out;
    solution.flows.forEach((f, i) => {
        const rf = runRoadFactor(solution, f);
        const ok = rf ? traceFlow(f, rf).pass : false;
        if (isDrawn(f)) {
            out.total += 1;
            if (ok) out.pass += 1;
        } else {
            out.hiddenTotal += 1;
            if (ok) out.hiddenPass += 1;
        }
        if (!ok) out.failing.push(i);
    });
    return out;
}

/** Sum of flow costs by leg (the contract has no per-leg split). */
export function legSums(solution: Solution): Record<Leg, number> {
    const out: Record<Leg, number> = { supply_depot: 0, depot_refinery: 0, refinery_airport: 0 };
    for (const f of solution.flows) out[f.leg] += f.cost_usd;
    return out;
}
