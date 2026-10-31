// Build-time: writes web/data/routes.json, the road geometry the map draws. Display only: costs never read it.
// Keys are "A|B" with A < B, values are polylines at 1e5 precision running from A to B. A flow to Tarakan is
// drawn road-to-port then barge, so it is keyed "<node>|TJS" (Tanjung Selor) and no key ever names TRK.
//
// Covers every drawn pair in every stored run plus each stored refinery to every airport. Routes come from the
// public OSRM demo server (car profile, OpenStreetMap), at most one request a second, each response cached on
// disk so a rerun resumes. Routes it does not refetch are kept as they are in routes.json.
//
// Run: npm run data:routes
//   ROUTES_CACHE_DIR  where responses are cached (default: <tmp>/larpers-osrm)
//   ROUTES_FULL_JSON  optional earlier fetch, {"from|to": {g, km}}, reused instead of refetched
//   ROUTES_BUDGET_S   stop fetching after this many seconds and write what there is (default: no limit);
//                     a negative value fetches nothing and rebuilds from the cache
//   ROUTES_EXTRAS=0   fetch drawn pairs only, skipping the refinery to every airport extras
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', 'data');
const OUT = join(DATA, 'routes.json');
const CACHE = process.env.ROUTES_CACHE_DIR ?? join(tmpdir(), 'larpers-osrm');
const FULL = process.env.ROUTES_FULL_JSON;
const BUDGET_MS = Number(process.env.ROUTES_BUDGET_S ?? Infinity) * 1000;

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const USER_AGENT = 'larpers-saf-map/1.0 (Autonomous SG 2026 hackathon, display-only route geometry)';
const REQUEST_GAP_MS = 1100;
const TOLERANCE_DEG = 0.0003;
const MAX_BYTES = 1.5e6;
const AIRPORTS = ['BPN', 'PKN', 'PNK', 'TRK'];
const TARAKAN = 'TRK';
const PORT = 'TJS';
const PORT_AT = [2.8375, 117.3653];
const BOX = { west: 105, east: 122, south: -6, north: 8 };
const END_SLACK_KM = 5;

const keyOf = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
/** The stored key for a flow between two nodes; null when it has no drawable road. */
function pairKey(a, b) {
    const from = a === TARAKAN ? PORT : a;
    const to = b === TARAKAN ? PORT : b;
    return from === to ? null : keyOf(from, to);
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function decode(encoded) {
    const points = [];
    let index = 0;
    let lat = 0;
    let lon = 0;
    const next = () => {
        let shift = 0;
        let result = 0;
        let byte;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        return result & 1 ? ~(result >> 1) : result >> 1;
    };
    while (index < encoded.length) {
        lat += next();
        lon += next();
        points.push([lat / 1e5, lon / 1e5]);
    }
    return points;
}

function encode(points) {
    const put = (value) => {
        let v = value < 0 ? ~(value << 1) : value << 1;
        let text = '';
        while (v >= 0x20) {
            text += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
            v >>= 5;
        }
        return text + String.fromCharCode(v + 63);
    };
    let text = '';
    let lastLat = 0;
    let lastLon = 0;
    for (const [lat, lon] of points) {
        const y = Math.round(lat * 1e5);
        const x = Math.round(lon * 1e5);
        text += put(y - lastLat) + put(x - lastLon);
        lastLat = y;
        lastLon = x;
    }
    return text;
}

/** Douglas-Peucker in degrees, which is close enough to planar this near the equator. */
function simplify(points, tolerance) {
    if (points.length < 3) return points;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [first, last] = stack.pop();
        const [ay, ax] = points[first];
        const [by, bx] = points[last];
        const dx = bx - ax;
        const dy = by - ay;
        const span = dx * dx + dy * dy;
        let worst = 0;
        let at = -1;
        for (let i = first + 1; i < last; i++) {
            const [py, px] = points[i];
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

function haversineKm(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const inBox = ([lat, lon]) => lon >= BOX.west && lon <= BOX.east && lat >= BOX.south && lat <= BOX.north;

const bundle = JSON.parse(readFileSync(join(DATA, 'bundle.json'), 'utf8'));
const sites = JSON.parse(readFileSync(join(DATA, 'sites.json'), 'utf8'));
const runs = Object.entries(bundle.runs).filter(([, run]) => run.solution);

const nodes = new Map([[PORT, PORT_AT]]);
for (const site of sites) nodes.set(site.id, [site.lat, site.lon]);
for (const [, run] of runs) {
    for (const flow of run.solution.flows) {
        nodes.set(flow.from, [flow.from_lat, flow.from_lon]);
        nodes.set(flow.to, [flow.to_lat, flow.to_lon]);
    }
}

const drawnOf = (run) => run.solution.flows.filter((flow) => flow.km > 0);
const drawn = new Set();
const refineries = new Set();
for (const [, run] of runs) {
    for (const flow of drawnOf(run)) {
        const key = pairKey(flow.from, flow.to);
        if (key) drawn.add(key);
        if (AIRPORTS.includes(flow.to)) refineries.add(flow.from);
    }
    for (const facility of run.solution.facilities) {
        if (facility.type === 'refinery') refineries.add(facility.site_id);
    }
}
const likely = new Set();
for (const refinery of refineries) {
    for (const airport of AIRPORTS) {
        const key = pairKey(refinery, airport);
        if (key && !drawn.has(key)) likely.add(key);
    }
}

// Full-detail geometry by key, always running from A to B. Empty means this pair was asked for and has no road.
const detail = new Map();
if (FULL && existsSync(FULL)) {
    for (const [key, value] of Object.entries(JSON.parse(readFileSync(FULL, 'utf8')))) {
        const [from, to] = key.split('|');
        if (from === TARAKAN || to === TARAKAN) continue;
        const points = decode(value.g);
        detail.set(keyOf(from, to), from < to ? points : points.reverse());
    }
}
mkdirSync(CACHE, { recursive: true });
const cachePath = (key) => join(CACHE, `${key.replace('|', '__')}.json`);
const noRoad = new Map();
function remember(key, response) {
    if (response.g) detail.set(key, decode(response.g));
    else noRoad.set(key, response.code);
}
for (const name of readdirSync(CACHE)) {
    if (!name.endsWith('.json')) continue;
    const key = name.slice(0, -'.json'.length).replace('__', '|');
    remember(key, JSON.parse(readFileSync(join(CACHE, name), 'utf8')));
}

function ask(key) {
    const [a, b] = key.split('|');
    const [aLat, aLon] = nodes.get(a);
    const [bLat, bLon] = nodes.get(b);
    const url = `${OSRM}/${aLon},${aLat};${bLon},${bLat}?overview=full&geometries=polyline`;
    let body;
    try {
        body = execFileSync('curl', ['-sS', '-m', '30', '-A', USER_AGENT, url], { encoding: 'utf8', maxBuffer: 2 ** 26 });
        return JSON.parse(body);
    } catch (error) {
        return { code: 'Failed', message: String(error.message ?? error).slice(0, 120) };
    }
}

const started = Date.now();
let lastRequest = 0;
let fetched = 0;
let failures = 0;
let stopped = false;
async function fetchAll(keys) {
    for (const key of keys) {
        if (stopped || detail.has(key) || noRoad.has(key)) continue;
        if (Date.now() - started > BUDGET_MS || failures >= 3) {
            stopped = true;
            return;
        }
        if (!nodes.has(key.split('|')[0]) || !nodes.has(key.split('|')[1])) continue;
        await sleep(Math.max(0, lastRequest + REQUEST_GAP_MS - Date.now()));
        lastRequest = Date.now();
        const reply = ask(key);
        fetched += 1;
        if (reply.code === 'Ok' && reply.routes?.[0]?.geometry) {
            failures = 0;
            const response = { code: 'Ok', km: reply.routes[0].distance / 1000, g: reply.routes[0].geometry };
            writeFileSync(cachePath(key), JSON.stringify(response));
            remember(key, response);
        } else if (reply.code === 'NoRoute' || reply.code === 'NoSegment') {
            failures = 0;
            const response = { code: reply.code };
            writeFileSync(cachePath(key), JSON.stringify(response));
            remember(key, response);
        } else {
            failures += 1;
            console.log(`  ${key}: ${reply.code} ${reply.message ?? ''}`);
            await sleep(5000);
        }
        if (fetched % 20 === 0) console.log(`  fetched ${fetched}`);
    }
}

function build() {
    const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
    const kept = {};
    for (const [key, value] of Object.entries(previous)) {
        if (!key.split('|').includes(TARAKAN)) kept[key] = value;
    }
    const usable = [...detail].filter(([key, points]) => {
        const fine = points.length >= 2 && points.every(inBox);
        if (!fine) console.log(`  dropped ${key}: leaves the map box`);
        return fine;
    });
    let tolerance = TOLERANCE_DEG;
    for (;;) {
        const table = { ...kept };
        for (const [key, points] of usable) table[key] = encode(simplify(points, tolerance));
        const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : 1)));
        const text = `${JSON.stringify(sorted)}\n`;
        if (text.length <= MAX_BYTES) {
            const partial = `${OUT}.tmp`;
            writeFileSync(partial, text);
            renameSync(partial, OUT);
            console.log(`routes.json: ${Object.keys(sorted).length} routes, ${usable.length} full detail, `
                + `tolerance ${tolerance.toFixed(5)} deg, ${(text.length / 1024).toFixed(0)} KB`);
            return sorted;
        }
        tolerance *= 1.3;
    }
}

function coverage(table) {
    const count = (list) => {
        const flows = list.flatMap(([, run]) => drawnOf(run));
        const routed = flows.filter((flow) => table[pairKey(flow.from, flow.to)]).length;
        return { flows: flows.length, routed, missing: flows.length - routed };
    };
    const base = count(runs.filter(([slug]) => slug === 'base'));
    const all = count(runs);
    console.log(`coverage base: ${base.routed} of ${base.flows} drawn flows routed, ${base.missing} without`);
    console.log(`coverage all stored runs: ${all.routed} of ${all.flows} drawn flows routed, ${all.missing} without`);
    const absent = [...drawn].filter((key) => !table[key]);
    if (absent.length) console.log(`  pairs without a route: ${absent.join(' ')}`);
    const likelyAbsent = [...likely].filter((key) => !table[key]);
    console.log(`refinery to airport: ${likely.size - likelyAbsent.length} of ${likely.size} extra pairs routed`);
    if (likelyAbsent.length) console.log(`  absent: ${likelyAbsent.join(' ')}`);
}

function verify(table) {
    let outside = 0;
    const farEnds = [];
    for (const [key, encoded] of Object.entries(table)) {
        const points = decode(encoded);
        if (!points.every(inBox)) outside += 1;
        const [a, b] = key.split('|');
        for (const [id, end] of [[a, points[0]], [b, points[points.length - 1]]]) {
            const node = nodes.get(id);
            if (!node) continue;
            const km = haversineKm(node, end);
            if (km > END_SLACK_KM) farEnds.push(`${id}:${km.toFixed(0)}`);
        }
    }
    const worst = [...new Set(farEnds)].sort((p, q) => Number(q.split(':')[1]) - Number(p.split(':')[1])).slice(0, 12);
    console.log(`verify: ${Object.keys(table).length} routes decoded, ${outside} leave the box, `
        + `${farEnds.length} ends over ${END_SLACK_KM} km from their node`);
    if (worst.length) console.log(`  worst, node:km from the road: ${worst.join(' ')}`);
}

const needed = process.env.ROUTES_EXTRAS === '0' ? [...drawn] : [...drawn, ...likely];
const unrouted = (table) => needed.filter((key) => !table[key] && !detail.has(key));
const before = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const missing = unrouted(before);
const coarse = needed.filter((key) => before[key] && !detail.has(key));
console.log(`${needed.length} pairs wanted, ${detail.size} full detail on hand, ${noRoad.size} known roadless, `
    + `${missing.length} with no geometry, ${coarse.length} coarse`);

await fetchAll(missing);
if (fetched) build();
await fetchAll(coarse);

const table = build();
console.log(`fetched ${fetched} in ${((Date.now() - started) / 1000).toFixed(0)} s, `
    + `${needed.filter((key) => !detail.has(key) && !noRoad.has(key)).length} pairs not yet fetched at full detail`);
coverage(table);
verify(table);
