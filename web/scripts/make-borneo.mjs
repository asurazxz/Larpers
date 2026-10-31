// Build-time: writes web/data/borneo.json, Natural Earth 1:50m land (world-atlas, public domain)
// clipped to Borneo and neighbouring coasts, so the map needs no tiles or network. Run: npm run data:land
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-50m.json'), 'utf8'));
const land = feature(topo, topo.objects.land);

// Bounding box around Borneo plus neighbouring coasts (Sumatra, Java, Sulawesi, Malay peninsula).
const BOX = { west: 104, east: 122, south: -7, north: 9 };

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

const round = (p) => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];
const polygons = [];
for (const f of land.features) {
    const geom = f.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const poly of polys) {
        const rings = poly.map(clipRing).filter((r) => r.length >= 4).map((r) => {
            const ring = r.map(round);
            const [a, b] = [ring[0], ring[ring.length - 1]];
            if (a[0] !== b[0] || a[1] !== b[1]) ring.push(a);
            return ring;
        });
        if (rings.length) polygons.push(rings);
    }
}

const out = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        properties: { source: 'Natural Earth 1:50m land via world-atlas@2.0.2 (public domain)', bbox: BOX },
        geometry: { type: 'MultiPolygon', coordinates: polygons },
    }],
};
const text = JSON.stringify(out);
writeFileSync(join(here, '..', 'data', 'borneo.json'), text + '\n');
const points = polygons.flat(2).length;
console.log(`borneo.json: ${polygons.length} polygons, ${points} points, ${(text.length / 1024).toFixed(0)} KB`);
