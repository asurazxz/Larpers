// What the animated map layer draws: a flat list of arcs and facilities, built from a finished run
// or from the solver's live progress. Keys match flowKey, so an arc that survives from one network
// to the next stays on screen instead of being redrawn.
import type { Flow, Leg, Solution } from './contract';
import type { LiveArc, LiveFacility, LiveNetwork, SolveProgress } from './solveProgress';
import { fullPath } from './routes';
import { flowKey } from './view';

export type Tone = 'solid' | 'ghost' | 'greedy';

export interface SceneArc {
    key: string;
    id: string;
    leg: Leg;
    from: [number, number];
    to: [number, number];
    /** Node to node along the stored OSRM road (lib/routes.ts); just [from, to] when there is none. */
    path: [number, number][];
    width: number;
    tone: Tone;
}

export interface SceneNode {
    key: string;
    id: string;
    kind: 'depot' | 'refinery';
    large: boolean;
    lat: number;
    lon: number;
    tone: Tone;
}

export interface Scene {
    arcs: SceneArc[];
    nodes: SceneNode[];
    /** Refinery candidates still in play, shown only during a live solve. */
    candidates: { lat: number; lon: number }[];
}

export interface Coord {
    lat: number;
    lon: number;
}

/** Line width proportional to kt, scaled within each leg. */
export function legWidth(leg: Leg, kt: number, maxKt: number): number {
    const base = leg === 'supply_depot' ? 1.5 : leg === 'depot_refinery' ? 2 : 2.5;
    const span = leg === 'supply_depot' ? 3 : 6;
    return base + span * (kt / maxKt);
}

export function legMaxima(rows: { leg: Leg; kt: number }[]): Record<Leg, number> {
    const m: Record<Leg, number> = { supply_depot: 1, depot_refinery: 1, refinery_airport: 1 };
    for (const r of rows) m[r.leg] = Math.max(m[r.leg], r.kt);
    return m;
}

export function sceneFromSolution(solution: Solution | null): Scene {
    const flows: Flow[] = solution?.flows ?? [];
    const max = legMaxima(flows);
    const arcs: SceneArc[] = [];
    for (const f of flows) {
        if (!(f.km > 0) || (f.from_lat === f.to_lat && f.from_lon === f.to_lon)) continue;
        arcs.push({
            key: flowKey(f),
            id: flowKey(f),
            leg: f.leg,
            from: [f.from_lat, f.from_lon],
            to: [f.to_lat, f.to_lon],
            path: fullPath(f.from, f.to, [f.from_lat, f.from_lon], [f.to_lat, f.to_lon]),
            width: legWidth(f.leg, f.kt, max[f.leg]),
            tone: 'solid',
        });
    }
    const nodes: SceneNode[] = (solution?.facilities ?? []).map((f) => ({
        key: `${f.type}:${f.site_id}`,
        id: f.site_id,
        kind: f.type,
        large: f.size === 'large',
        lat: f.lat,
        lon: f.lon,
        tone: 'solid',
    }));
    return { arcs, nodes, candidates: [] };
}

function addNetwork(scene: Scene, net: LiveNetwork, tone: Tone, at: (id: string) => Coord | undefined): void {
    const max = legMaxima(net.arcs);
    const prefix = tone === 'solid' ? '' : `${tone}:`;
    const arc = (a: LiveArc) => {
        const p = at(a.from);
        const q = at(a.to);
        if (!p || !q || (p.lat === q.lat && p.lon === q.lon)) return;
        const key = flowKey(a);
        scene.arcs.push({
            key: prefix + key,
            id: key,
            leg: a.leg,
            from: [p.lat, p.lon],
            to: [q.lat, q.lon],
            path: fullPath(a.from, a.to, [p.lat, p.lon], [q.lat, q.lon]),
            width: tone === 'solid' ? legWidth(a.leg, a.kt, max[a.leg]) : 1.25,
            tone,
        });
    };
    net.arcs.forEach(arc);
    const node = (kind: SceneNode['kind']) => (f: LiveFacility) => {
        const p = at(f.id);
        if (p) scene.nodes.push({ key: `${prefix}${kind}:${f.id}`, id: f.id, kind, large: f.size === 'large', lat: p.lat, lon: p.lon, tone });
    };
    net.depots.forEach(node('depot'));
    net.refineries.forEach(node('refinery'));
}

export function sceneFromProgress(p: SolveProgress, siteAt: (id: string) => Coord | undefined): Scene {
    const airports = new Map(p.airports.map((a) => [a.id, a]));
    const at = (id: string) => airports.get(id) ?? siteAt(id);
    const scene: Scene = { arcs: [], nodes: [], candidates: [] };
    for (const id of p.candidates) {
        const c = at(id);
        if (c) scene.candidates.push(c);
    }
    if (p.greedy && (!p.best || p.best.primal >= p.greedy.primal)) addNetwork(scene, p.greedy, 'greedy', at);
    if (p.latest && p.latest !== p.best) addNetwork(scene, p.latest, 'ghost', at);
    if (p.best) addNetwork(scene, p.best, 'solid', at);
    return scene;
}
