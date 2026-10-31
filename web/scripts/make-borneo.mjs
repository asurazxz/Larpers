// Build-time: writes web/data/borneo.json, Natural Earth 1:10m land (world-atlas, public domain) clipped to
// Borneo and the coasts around it, so the map needs no tiles or network. Detail is spent where the network is:
// Borneo keeps the finest coast, everything further out is coarser. Run: npm run data:land
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-10m.json'), 'utf8'));
const land = feature(topo, topo.objects.land);

// Bounding box around Borneo plus neighbouring coasts (Sumatra, Java, Sulawesi, Malay peninsula).
const BOX = { west: 100, east: 128, south: -12, north: 12 };
// The network sits in here, so polygons touching it take the fine tolerance.
const FOCUS = { west: 106, east: 121, south: -6, north: 9 };
const MAX_BYTES = 490 * 1024;
// Tolerances in degrees: near the network, then outside it. Multiplied up until the file fits.
const NEAR_DEG = 0.0008;
const FAR_DEG = 0.003;
// Islands smaller than this are dropped outside the focus box, in square degrees of their bounding box.
const FAR_MIN_AREA = 0.0005;

// Sutherland-Hodgman clip of one ring against the axis-aligned box.
function clipRing(ring) {
    const edges = [
        (p) => p[0] >= BOX.west, (p) => p[0] <= BOX.east,
        (p) => p[1] >= BOX.south, (p) => p[1] <= BOX.north,
    ];
    const cut = [
        (a, b) => lerpAt(a, b, 0, BOX.west), (a, b) => lerpAt(a, b, 0, BOX.east),
        (a, b) => lerpAt(a, b, 1, BOX.south), (a, b) => lerpAt(a, b, 1, BOX.north),
    ];
    let out = ring;
    for (let e = 0; e < 4; e++) {
        const input = out;
        out = [];
        if (!input.length) break;
        for (let i = 0; i < input.length; i++) {
            const cur = input[i];
            const prev = input[(i + input.length - 1) % input.length];
            const curIn = edges[e](cur);
            const prevIn = edges[e](prev);
            if (curIn) {
                if (!prevIn) out.push(cut[e](prev, cur));
                out.push(cur);
            } else if (prevIn) {
                out.push(cut[e](prev, cur));
            }
        }
    }
    return out;
}
function lerpAt(a, b, axis, v) {
    const t = (v - a[axis]) / (b[axis] - a[axis]);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

function boundsOf(ring) {
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    for (const [x, y] of ring) {
        west = Math.min(west, x);
        east = Math.max(east, x);
        south = Math.min(south, y);
        north = Math.max(north, y);
    }
    return { west, east, south, north };
}
const overlaps = (a, b) => a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;

/** Douglas-Peucker over an open line. */
function simplifyLine(points, tolerance) {
    if (points.length < 3) return points;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [first, last] = stack.pop();
        const [ax, ay] = points[first];
        const [bx, by] = points[last];
        const dx = bx - ax;
        const dy = by - ay;
        const span = dx * dx + dy * dy;
        let worst = 0;
        let at = -1;
        for (let i = first + 1; i < last; i++) {
            const [px, py] = points[i];
            const t = span ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / span)) : 0;
            const ex = px - (ax + t * dx);
            const ey = py - (ay + t * dy);
            const gap = ex * ex + ey * ey;
            if (gap > worst) {
                worst = gap;
                at = i;
            }
        }
        if (at >= 0 && worst > tolerance * tolerance) {
            keep[at] = 1;
            stack.push([first, at], [at, last]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

/** A closed ring cannot go through Douglas-Peucker whole, so split it at the vertex furthest from its start. */
function simplifyRing(ring, tolerance) {
    const [x0, y0] = ring[0];
    let far = 0;
    let best = -1;
    for (let i = 1; i < ring.length - 1; i++) {
        const gap = (ring[i][0] - x0) ** 2 + (ring[i][1] - y0) ** 2;
        if (gap > best) {
            best = gap;
            far = i;
        }
    }
    const one = simplifyLine(ring.slice(0, far + 1), tolerance);
    const two = simplifyLine(ring.slice(far), tolerance);
    return [...one.slice(0, -1), ...two];
}

const round = (p) => [Math.round(p[0] * 1e3) / 1e3, Math.round(p[1] * 1e3) / 1e3];

function cleanRing(ring, tolerance) {
    const closed = [...ring];
    const [a, b] = [closed[0], closed[closed.length - 1]];
    if (a[0] !== b[0] || a[1] !== b[1]) closed.push(a);
    const out = [];
    for (const point of simplifyRing(closed, tolerance).map(round)) {
        const last = out[out.length - 1];
        if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
    }
    const [first, end] = [out[0], out[out.length - 1]];
    if (first[0] !== end[0] || first[1] !== end[1]) out.push(first);
    return out.length >= 4 ? out : null;
}

// Clip once, then only the tolerances change between tries.
const clipped = [];
for (const f of land.features) {
    const geom = f.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const poly of polys) {
        const rings = poly.map(clipRing).filter((r) => r.length >= 4);
        if (!rings.length) continue;
        const bounds = boundsOf(rings[0]);
        clipped.push({ rings, bounds, near: overlaps(bounds, FOCUS) });
    }
}

function assemble(scale) {
    const polygons = [];
    for (const { rings, bounds, near } of clipped) {
        const area = (bounds.east - bounds.west) * (bounds.north - bounds.south);
        if (!near && area < FAR_MIN_AREA * scale) continue;
        const tolerance = (near ? NEAR_DEG : FAR_DEG) * scale;
        const cleaned = rings.map((ring) => cleanRing(ring, tolerance));
        if (!cleaned[0]) continue;
        polygons.push(cleaned.filter(Boolean));
    }
    return polygons;
}

let scale = 1;
let polygons = assemble(scale);
let text = '';
for (;;) {
    text = JSON.stringify({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { source: 'Natural Earth 1:10m land via world-atlas@2.0.2 (public domain)', bbox: BOX },
            geometry: { type: 'MultiPolygon', coordinates: polygons },
        }],
    });
    if (text.length <= MAX_BYTES) break;
    scale *= 1.15;
    polygons = assemble(scale);
}
writeFileSync(join(here, '..', 'data', 'borneo.json'), text + '\n');
const points = polygons.flat(2).length;
console.log(`borneo.json: ${polygons.length} polygons, ${points} points, ${(text.length / 1024).toFixed(0)} KB, `
    + `tolerance ${(NEAR_DEG * scale).toFixed(4)} deg near the network, ${(FAR_DEG * scale).toFixed(4)} deg further out`);
