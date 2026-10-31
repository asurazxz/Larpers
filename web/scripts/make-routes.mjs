// Build-time: writes web/data/routes.json from data/reference/osrm_routes.json. Run: npm run data:routes
// Display only: the map draws flows along these OSRM car routes; costs never read this file.
// Keys are "A|B" with A < B, the geometry runs from A to B; the map reverses it for B -> A flows.
// Values are Google encoded polylines at 1e5 (about 1 m), decoded by web/lib/polyline.ts: a quarter the size of JSON.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
// Borneo, not just Kalimantan: northern routes may run through Sabah, Sarawak or Brunei.
const BBOX = { minLat: -5, maxLat: 7.5, minLon: 108, maxLon: 120 };

/** Google encoded polyline at 1e6 precision (OSRM geometries=polyline6). */
export function decodePolyline6(str) {
    return decode(str, 1e6);
}

function decode(str, factor) {
    const out = [];
    let i = 0;
    let lat = 0;
    let lon = 0;
    const next = () => {
        let shift = 0;
        let result = 0;
        let b;
        do {
            b = str.charCodeAt(i++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        return result & 1 ? ~(result >> 1) : result >> 1;
    };
    while (i < str.length) {
        lat += next();
        lon += next();
        out.push([lat / factor, lon / factor]);
    }
    return out;
}

// Douglas-Peucker in degrees: 0.002 deg is about 220 m, finer than a pixel at the map's max zoom of 11.
const TOLERANCE_DEG = 0.002;

function simplify(pts, tol = TOLERANCE_DEG) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
        const [s, e] = stack.pop();
        const [ay, ax] = pts[s];
        const [by, bx] = pts[e];
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1e-12;
        let worst = -1;
        let at = -1;
        for (let k = s + 1; k < e; k++) {
            const [py, px] = pts[k];
            const dist = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
            if (dist > worst) {
                worst = dist;
                at = k;
            }
        }
        if (worst > tol) {
            keep[at] = 1;
            stack.push([s, at], [at, e]);
        }
    }
    return pts.filter((_, k) => keep[k]);
}

function encode5(pts) {
    let out = '';
    let pLat = 0;
    let pLon = 0;
    const put = (v) => {
        let n = v < 0 ? ~(v << 1) : v << 1;
        while (n >= 0x20) {
            out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
            n >>= 5;
        }
        out += String.fromCharCode(n + 63);
    };
    for (const [la, lo] of pts) {
        const lat = Math.round(la * 1e5);
        const lon = Math.round(lo * 1e5);
        put(lat - pLat);
        put(lon - pLon);
        pLat = lat;
        pLon = lon;
    }
    return out;
}

const src = JSON.parse(readFileSync(join(root, 'data', 'reference', 'osrm_routes.json'), 'utf8'));
const routes = {};
let points = 0;
for (const [key, r] of Object.entries(src.routes)) {
    const [a, b] = key.split('|');
    if (!(a < b)) throw new Error(`key ${key} is not ordered A < B`);
    const pts = simplify(decodePolyline6(r.polyline6));
    for (const [la, lo] of pts) {
        if (la < BBOX.minLat || la > BBOX.maxLat || lo < BBOX.minLon || lo > BBOX.maxLon) {
            throw new Error(`${key}: point ${la},${lo} outside Borneo`);
        }
    }
    const encoded = encode5(pts);
    const back = decode(encoded, 1e5);
    if (back.length !== pts.length || back.some(([la, lo], k) => Math.abs(la - pts[k][0]) > 1e-5 || Math.abs(lo - pts[k][1]) > 1e-5)) {
        throw new Error(`${key}: polyline round trip failed`);
    }
    routes[key] = encoded;
    points += pts.length;
}

const text = JSON.stringify(routes) + '\n';
writeFileSync(join(here, '..', 'data', 'routes.json'), text);
console.log(`routes.json: ${Object.keys(routes).length} routes, ${points} points, ${(text.length / 1024).toFixed(0)} KB (${src.profile}, ${src.osrm_url})`);
