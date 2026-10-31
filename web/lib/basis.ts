// Whether a stored run was solved on the organisers' 12:45 basis; if not, a short truthful label.
import type { Scenario, Solution } from './contract';
import { AIRPORTS } from './contract';

const near = (a: number | null | undefined, b: number) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) < 1e-9;
const trim = (v: number) => String(Number(v.toFixed(2)));

export function onOrganiserBasis(sc: Scenario): boolean {
    const d = sc.demand_kt;
    return (
        near(sc.yield, 0.2) &&
        near(sc.road_factor, 1.3) &&
        sc.capacity_basis === 'biomass_input' &&
        sc.collection_policy === 'optional' &&
        !!d &&
        AIRPORTS.every((a) => near(d[a], 300))
    );
}

/** Differences from the organisers' basis, e.g. "yield 15%, road ×1.9, …". */
export function basisDiffs(sc: Scenario): string[] {
    const out: string[] = [];
    if (Number.isFinite(sc.yield)) out.push(`yield ${trim(sc.yield * 100)}%`);
    if (Number.isFinite(sc.road_factor)) out.push(`road ×${trim(sc.road_factor)}`);
    const d = sc.demand_kt;
    if (!d) out.push('no demand target');
    else if (!AIRPORTS.every((a) => near(d[a], 300))) out.push(`demand ${trim(AIRPORTS.reduce((t, a) => t + (d[a] ?? 0), 0))} kt`);
    if (sc.collection_policy !== 'optional') out.push(`collection ${sc.collection_policy}`);
    if (sc.capacity_basis !== 'biomass_input') out.push(`capacity ${sc.capacity_basis}`);
    return out;
}

/** Null when the run is live, has no scenario, or matches the organisers' basis. */
export function preUpdateBasis(s: Solution | null | undefined): { short: string; full: string } | null {
    const sc = s?.scenario;
    if (!s || s.source === 'live' || !sc || onOrganiserBasis(sc)) return null;
    const diffs = basisDiffs(sc);
    return { short: diffs.slice(0, 2).join(', '), full: diffs.join(', ') };
}
