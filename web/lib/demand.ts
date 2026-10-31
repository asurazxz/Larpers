// Airport demand the run was solved for, or null when the run does not echo it. Today's solver reads a
// null demand_kt as 300 kt per airport (12:45 update), but older stored runs used the passenger-share
// split, so a null here is never filled in: the UI says "not echoed" rather than guess.
import { AIRPORTS, type AirportCode, type Solution } from './contract';
import { getEntry } from './bundle';
import { storedSlugOf } from './useLive';

export const OFFICIAL_DEMAND_KT = 300;

export function demandOf(solution: Solution | null | undefined): Record<AirportCode, number> | null {
    const entry = getEntry(storedSlugOf(solution) ?? '') as { scenario?: { demand_kt?: Record<AirportCode, number> | null } } | undefined;
    const d = solution?.scenario?.demand_kt ?? entry?.scenario?.demand_kt ?? null;
    return d ? (Object.fromEntries(AIRPORTS.map((a) => [a, d[a]])) as Record<AirportCode, number>) : null;
}

/** SAF delivered to each airport: sum of refinery_airport flow kt into it. */
export function deliveredOf(solution: Solution | null | undefined): Record<AirportCode, number> {
    const out = Object.fromEntries(AIRPORTS.map((a) => [a, 0])) as Record<AirportCode, number>;
    for (const f of solution?.flows ?? []) {
        if (f.leg === 'refinery_airport' && (AIRPORTS as readonly string[]).includes(f.to)) out[f.to as AirportCode] += f.kt;
    }
    return out;
}
