// The stored base run as plane geometry for the landing hero: real lat/lon, equirectangular around Kalimantan.
import borneo from '../data/borneo.json';
import type { Leg } from '../lib/contract';
import { baseEntry, sites, solutionOf } from '../lib/bundle';

const LON0 = 114;
const LAT0 = 0.3;
const K = Math.cos((LAT0 * Math.PI) / 180);

export type XY = [number, number];
export const project = (lat: number, lon: number): XY => [(lon - LON0) * K, lat - LAT0];

export const LEG_COLOR: Record<Leg, string> = {
    supply_depot: '#2f9e4f',
    depot_refinery: '#e5a00d',
    refinery_airport: '#0ea5c6',
};
/** Brighter leg colours for the dark hero (same hues as the map). */
export const LEG_GLOW: Record<Leg, string> = {
    supply_depot: '#3fd46b',
    depot_refinery: '#ffb81c',
    refinery_airport: '#22d3ee',
};

export interface HeroArc {
    leg: Leg;
    a: XY;
    b: XY;
    kt: number;
}

export interface HeroNetwork {
    land: XY[][];
    sites: XY[];
    depots: XY[];
    refineries: XY[];
    airports: XY[];
    arcs: HeroArc[];
}

type Geom = { type: string; coordinates: number[][][] | number[][][][] };

function rings(): XY[][] {
    const fc = borneo as unknown as { features: { geometry: Geom }[] };
    const out: XY[][] = [];
    for (const f of fc.features ?? []) {
        const g = f.geometry;
        const polys = g.type === 'Polygon' ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
        for (const p of polys) {
            if (p[0]?.length > 3) out.push(p[0].map(([lon, lat]) => project(lat, lon)));
        }
    }
    return out;
}

let cached: HeroNetwork | null = null;

export function heroNetwork(): HeroNetwork {
    if (cached) return cached;
    const s = solutionOf(baseEntry());
    const flows = s?.flows ?? [];
    const facilities = s?.facilities ?? [];
    const airports = new Map<string, XY>();
    for (const f of flows) if (f.leg === 'refinery_airport') airports.set(f.to, project(f.to_lat, f.to_lon));
    cached = {
        land: rings(),
        sites: sites.map((x) => project(x.lat, x.lon)),
        depots: facilities.filter((f) => f.type === 'depot').map((f) => project(f.lat, f.lon)),
        refineries: facilities.filter((f) => f.type === 'refinery').map((f) => project(f.lat, f.lon)),
        airports: [...airports.values()],
        arcs: flows.map((f) => ({ leg: f.leg, a: project(f.from_lat, f.from_lon), b: project(f.to_lat, f.to_lon), kt: f.kt })),
    };
    return cached;
}

/** Arc lift: longer legs arc higher. */
export const arcHeight = (a: XY, b: XY) => 0.12 + 0.22 * Math.hypot(b[0] - a[0], b[1] - a[1]);
