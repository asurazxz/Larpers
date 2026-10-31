// Build-time: writes web/data/fixture_solution.json and the placeholder web/data/bundle.json.
// A hand-made, internally consistent Solution on REAL site ids, coordinates and tonnages
// (greedy construction, not a solver result). Run after make-sites.mjs: npm run data:fixture
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const sites = JSON.parse(readFileSync(join(here, '..', 'data', 'sites.json'), 'utf8'));

// Airports by IATA code only (column 5 of airports.dat), never by name.
const IATA = ['PNK', 'PKN', 'BPN', 'TRK'];
function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === ',' && !quoted) {
            out.push(cur);
            cur = '';
        } else cur += ch;
    }
    out.push(cur);
    return out;
}
const airports = {};
for (const line of readFileSync(join(root, 'data', 'raw', 'airports.dat'), 'utf8').split(/\r?\n/)) {
    const c = parseCsvLine(line);
    if (c.length > 7 && IATA.includes(c[4])) {
        airports[c[4]] = { id: c[4], label: `${c[4]}, ${c[1]}`, lat: Number(c[6]), lon: Number(c[7]) };
    }
}
if (Object.keys(airports).length !== 4) throw new Error('missing airport');

const RATE = { supply_depot: 0.10, depot_refinery: 0.12, refinery_airport: 0.08 };
const TRUCK = { supply_depot: 9, depot_refinery: 30, refinery_airport: 32 };
const COMMODITY = { supply_depot: 'biomass', depot_refinery: 'biomass', refinery_airport: 'saf' };
const ROAD = 1.9;
const YIELD = 0.15;
const HAUL_KM = 214;
const DEPOT = { small: { cap: 150, capex: 2.25e6 }, large: { cap: 300, capex: 4.5e6 } };
const REF = { small: { cap: 500, capex: 480e6 }, large: { cap: 1087, capex: 765e6 } };
const EXCLUDED = ['KAL_SUP_41'];
const STRANDED = ['KAL_SUP_70'];
const DEMAND = { PNK: 320, PKN: 50, BPN: 560, TRK: 70 };

// Haversine, mean Earth radius 6371.0088 km. The browser trace must use the same radius.
function hav(a, b) {
    const R = 6371.0088;
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

const byId = Object.fromEntries(sites.map((s) => [s.id, s]));
const flows = [];
function flow(leg, from, to, kt) {
    const hav_km = hav(from, to);
    const km = hav_km * ROAD;
    flows.push({
        leg,
        commodity: COMMODITY[leg],
        from: from.id,
        to: to.id,
        from_lat: from.lat,
        from_lon: from.lon,
        to_lat: to.lat,
        to_lon: to.lon,
        from_label: from.label,
        to_label: to.label,
        kt,
        hav_km,
        road_factor: ROAD,
        km,
        rate_usd_per_t_km: RATE[leg],
        cost_usd: kt * 1000 * km * RATE[leg],
        truck_t: TRUCK[leg],
        trips: Math.ceil((kt * 1000) / TRUCK[leg]),
    });
}

// Leg 1: greedy depots. Largest sites first; join an open depot within the haul limit, else open one
// at the nearest onshore, non-excluded site (a site can host its own depot: a 0 km flow).
const candidate = (s) => !s.sea && !EXCLUDED.includes(s.id);
const depots = new Map();
const supply = sites.filter((s) => !STRANDED.includes(s.id)).sort((a, b) => b.kt - a.kt);
for (const s of supply) {
    let best = null;
    for (const d of depots.values()) {
        const dist = hav(s, byId[d.id]);
        if (dist <= HAUL_KM && d.load + s.kt <= DEPOT.large.cap && (!best || dist < best.dist)) best = { d, dist };
    }
    let d = best?.d;
    if (!d) {
        const host = sites
            .filter((c) => candidate(c) && !depots.has(c.id) && hav(s, c) <= HAUL_KM)
            .sort((a, b) => hav(s, a) - hav(s, b))[0];
        if (!host) throw new Error(`no depot host for ${s.id}`);
        d = { id: host.id, load: 0 };
        depots.set(host.id, d);
    }
    d.load += s.kt;
    flow('supply_depot', s, byId[d.id], s.kt);
}

// Leg 2: each depot to its nearest refinery, respecting refinery SAF capacity.
const refineries = [
    { id: 'KAL_SUP_15', size: 'large', inKt: 0 },
    { id: 'KAL_SUP_54', size: 'small', inKt: 0 },
];
const depotList = [...depots.values()].sort((a, b) => {
    const gap = (d) => Math.abs(hav(byId[d.id], byId[refineries[0].id]) - hav(byId[d.id], byId[refineries[1].id]));
    return gap(b) - gap(a);
});
for (const d of depotList) {
    const order = [...refineries].sort((a, b) => hav(byId[d.id], byId[a.id]) - hav(byId[d.id], byId[b.id]));
    const r = order.find((x) => (x.inKt + d.load) * YIELD <= REF[x.size].cap);
    r.inKt += d.load;
    flow('depot_refinery', byId[d.id], byId[r.id], d.load);
}

// Leg 3: fill each airport's demand from the nearest refinery with SAF left; the rest is surplus.
for (const r of refineries) {
    r.saf = r.inKt * YIELD;
    r.left = r.saf;
}
// TRK before BPN so the nearby small refinery serves Tarakan first.
for (const code of ['PNK', 'PKN', 'TRK', 'BPN']) {
    let need = DEMAND[code];
    const a = airports[code];
    for (const r of [...refineries].sort((x, y) => hav(byId[x.id], a) - hav(byId[y.id], a))) {
        const q = Math.min(need, r.left);
        if (q <= 0) continue;
        r.left -= q;
        need -= q;
        flow('refinery_airport', byId[r.id], a, q);
    }
    if (need > 1e-9) throw new Error(`demand short at ${code}`);
}

const facilities = [];
for (const d of depots.values()) {
    const size = d.load > DEPOT.small.cap ? 'large' : 'small';
    const s = byId[d.id];
    facilities.push({
        site_id: s.id, label: s.label, type: 'depot', size, lat: s.lat, lon: s.lon,
        capacity_kt: DEPOT[size].cap, capacity_basis: 'biomass_in', throughput_kt: d.load,
        utilisation: d.load / DEPOT[size].cap, capex_usd: DEPOT[size].capex,
    });
}
for (const r of refineries) {
    const s = byId[r.id];
    facilities.push({
        site_id: s.id, label: s.label, type: 'refinery', size: r.size, lat: s.lat, lon: s.lon,
        capacity_kt: REF[r.size].cap, capacity_basis: 'saf_out', throughput_kt: r.saf,
        utilisation: r.saf / REF[r.size].cap, capex_usd: REF[r.size].capex,
    });
}

const stranded = STRANDED.map((id) => {
    const s = byId[id];
    return { site_id: id, label: s.label, lat: s.lat, lon: s.lon, kt: s.kt, reason: 'Not collected under optional collection' };
});
const surplus = refineries.filter((r) => r.left > 1e-9).map((r) => {
    const s = byId[r.id];
    return { site_id: r.id, label: s.label, lat: s.lat, lon: s.lon, kt: r.left, reason: 'SAF above airport demand, held at the refinery gate' };
});

const capex = facilities.reduce((a, f) => a + f.capex_usd, 0);
const logistics = flows.reduce((a, f) => a + f.cost_usd, 0);
const H = 1;
const total = capex + H * logistics;
const gap = 0.0042;
const bound = total * (1 - gap);
const legSum = (leg) => flows.filter((f) => f.leg === leg).reduce((a, f) => a + f.cost_usd, 0);

const scenario = {
    demand_kt: DEMAND,
    yield: YIELD,
    depot_retention: 1,
    road_factor: ROAD,
    horizon_years: H,
    collection_policy: 'optional',
    capacity_basis: 'saf_output',
    excluded_ids: EXCLUDED,
    time_limit_s: 90,
};

const solution = {
    run_id: 'fixture-0001',
    source: 'fixture',
    data_hash: 'fixture-not-a-real-hash',
    scenario_hash: 'fixture-not-a-real-hash',
    scenario,
    status: 'best_found',
    primal: total,
    bound,
    gap,
    n_candidates: 69,
    solve_seconds: 42.7,
    facilities,
    flows,
    stranded,
    surplus,
    capex_usd: capex,
    logistics_annual_usd: logistics,
    logistics_by_leg_usd: {
        supply_depot: legSum('supply_depot'),
        depot_refinery: legSum('depot_refinery'),
        refinery_airport: legSum('refinery_airport'),
    },
    opex: 'not_provided',
    total_horizon_usd: total,
    portfolios: [
        { n_large: 0, n_small: 0, status: 'skipped_capacity', reason: 'No refinery capacity' },
        { n_large: 0, n_small: 1, status: 'skipped_capacity', reason: '500 kt SAF is below required output' },
        { n_large: 1, n_small: 0, status: 'best_found', capex_usd: 765e6, primal: total * 1.003, bound: total * 0.992, gap: 0.011, solve_seconds: 30.1 },
        { n_large: 0, n_small: 2, status: 'skipped_capex', reason: 'CapEx plus depot floor exceeds best total' },
        { n_large: 1, n_small: 1, status: 'best_found', capex_usd: 1245e6, primal: total, bound, gap, solve_seconds: 42.7 },
    ],
    airports: IATA.map((code) => ({
        ...airports[code],
        demand_kt: DEMAND[code],
        delivered_kt: flows.filter((f) => f.to === code).reduce((a, f) => a + f.kt, 0),
    })),
    validation: { passed: true, max_residuals: { mass_kt: 0, cost_usd: 0, capacity_kt: 0, demand_kt: 0 }, failures: [] },
};

writeFileSync(join(here, '..', 'data', 'fixture_solution.json'), JSON.stringify(solution, null, 1) + '\n');

const bundle = {
    base: {
        slug: 'base',
        family: 'base',
        label: 'Fixture (placeholder until stored bundle v1)',
        status: solution.status,
        solved_at: '2026-10-31T12:45:00+08:00',
        data_hash: solution.data_hash,
        precomputed: true,
        solution,
    },
};
writeFileSync(join(here, '..', 'data', 'bundle.json'), JSON.stringify(bundle, null, 1) + '\n');

const supplied = flows.filter((f) => f.leg === 'supply_depot').reduce((a, f) => a + f.kt, 0);
console.log(`fixture: ${depots.size} depots, ${flows.length} flows, supplied ${supplied.toFixed(2)} kt, ` +
    `SAF ${refineries.map((r) => `${r.id} ${r.saf.toFixed(1)}`).join(' / ')}, surplus ${surplus.map((s) => s.kt.toFixed(2)).join(',')}, ` +
    `capex ${(capex / 1e6).toFixed(1)}M, logistics ${(logistics / 1e6).toFixed(1)}M`);
