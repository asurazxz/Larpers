// Road geometry for the map. Display only: costs never read this file, they stay on straight-line km × road factor.
// Keys in routes.json are "A|B" with A < B, encoded polylines running from A to B (OSRM car routes over OpenStreetMap).
import table from '../data/routes.json';
import { decodePolyline } from './polyline';

export type LatLon = [number, number];

/**
 * road: a stored OSRM route. offroad: the hop between a site and the nearest mapped road.
 * barge: the water crossing to Tarakan. unrouted: no route stored, so the line is straight and says so.
 */
export type PieceKind = 'road' | 'offroad' | 'barge' | 'unrouted';

export interface RoutePiece {
    kind: PieceKind;
    points: LatLon[];
}

export interface Route {
    pieces: RoutePiece[];
    /** Every point from origin to destination, in order: what the animation runs along. */
    points: LatLon[];
}

const routes = table as Record<string, string>;
const TARAKAN = 'TRK';
/** Tanjung Selor, the mainland river port opposite Tarakan. Our choice for the drawing; it changes no cost. */
const TARAKAN_PORT = 'TJS';
const TARAKAN_PORT_AT: LatLon = [2.8375, 117.3653];
const OFFROAD_KM = 1;

function haversineKm(a: LatLon, b: LatLon): number {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function stored(a: string, b: string): LatLon[] | null {
    const encoded = routes[a < b ? `${a}|${b}` : `${b}|${a}`];
    if (!encoded) return null;
    const points = decodePolyline(encoded);
    return a < b ? points : points.reverse();
}

/** The road, with a dotted hop at either end that sits more than 1 km from it. */
function onRoad(road: LatLon[], from: LatLon, to: LatLon): RoutePiece[] {
    const pieces: RoutePiece[] = [];
    const start = road[0];
    const end = road[road.length - 1];
    if (haversineKm(from, start) > OFFROAD_KM) pieces.push({ kind: 'offroad', points: [from, start] });
    pieces.push({ kind: 'road', points: road });
    if (haversineKm(end, to) > OFFROAD_KM) pieces.push({ kind: 'offroad', points: [end, to] });
    return pieces;
}

function build(fromId: string, toId: string, from: LatLon, to: LatLon): RoutePiece[] {
    if (toId === TARAKAN) {
        const road = stored(fromId, TARAKAN_PORT);
        if (!road) return [{ kind: 'barge', points: [from, to] }];
        return [...onRoad(road, from, TARAKAN_PORT_AT), { kind: 'barge', points: [TARAKAN_PORT_AT, to] }];
    }
    const road = stored(fromId, toId);
    return road ? onRoad(road, from, to) : [{ kind: 'unrouted', points: [from, to] }];
}

const memo = new Map<string, Route>();

/** The line to draw for one flow, by node ids and their coordinates. Decoded once per pair. */
export function routeFor(fromId: string, toId: string, from: LatLon, to: LatLon): Route {
    const key = `${fromId}>${toId}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const pieces = build(fromId, toId, from, to);
    const points: LatLon[] = [];
    for (const piece of pieces) points.push(...(points.length ? piece.points.slice(1) : piece.points));
    const route = { pieces, points };
    memo.set(key, route);
    return route;
}
