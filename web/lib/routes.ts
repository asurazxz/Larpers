// OSRM car routes (web/data/routes.json, display only), shared by the Leaflet flow lines and the animated layer.
// Keys "A|B" with A < B, geometry from A to B as an encoded polyline; reversed here for B -> A.
import rawRoutes from '../data/routes.json';
import { decodePolyline } from './polyline';
import { haversineKm } from './trace';

export type LatLon = [number, number];

const ROUTES = rawRoutes as Record<string, string>;
const decoded = new Map<string, LatLon[]>();
const SNAP_GAP_KM = 1;

function routeOf(key: string): LatLon[] | undefined {
    const enc = ROUTES[key];
    if (enc === undefined) return undefined;
    if (!decoded.has(key)) decoded.set(key, decodePolyline(enc));
    return decoded.get(key);
}

/**
 * Road geometry from `fromId` to `toId`, or null when none is stored or a leg touches TRK (a barge, drawn straight).
 * `snaps` are the gaps over 1 km between a node and the road it snapped to (offshore sites).
 */
export function roadPath(fromId: string, toId: string, from: LatLon, to: LatLon): { road: LatLon[]; snaps: LatLon[][] } | null {
    if (fromId === 'TRK' || toId === 'TRK') return null;
    const forward = fromId < toId;
    const route = routeOf(forward ? `${fromId}|${toId}` : `${toId}|${fromId}`);
    if (!route || route.length < 2) return null;
    const road = forward ? route : [...route].reverse();
    const gap = (a: LatLon, b: LatLon) => haversineKm(a[0], a[1], b[0], b[1]) > SNAP_GAP_KM;
    const snaps: LatLon[][] = [];
    if (gap(from, road[0])) snaps.push([from, road[0]]);
    if (gap(road[road.length - 1], to)) snaps.push([road[road.length - 1], to]);
    return { road, snaps };
}

/** The full line from node to node: snap gap, road, snap gap. Straight when no road is stored. */
export function fullPath(fromId: string, toId: string, from: LatLon, to: LatLon): LatLon[] {
    const r = roadPath(fromId, toId, from, to);
    return r ? [from, ...r.road, to] : [from, to];
}
