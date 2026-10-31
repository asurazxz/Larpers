// Stored-run index (sweep combinations, disruptions) and district robustness, all computed from
// web/data/bundle.json. Nothing here is hard-coded except the amendment's sweep option list.
//
// What this expects of each bundle entry (Denzel's generator):
//   - family: 'baseline' marks the greedy baseline (also detected by status 'heuristic').
//     Disruptions are detected by content: excluded_ids beyond the base run's own exclusions.
//     A family containing 'disrupt', 'removed', 'lost' or 'outage' is also read as a disruption.
//   - parameters come from solution.scenario (UI-attached on live runs; not in the contract), falling back to entry.params with
//     keys yield (fraction), road_factor, horizon_years, excluded_ids, collection_policy, capacity_basis.
import type { BundleEntry, Facility, FacilityType, Solution } from './contract';
import { BASE_SLUG, bundle, getEntry, siteById, solutionOf } from './bundle';
import { flowKey, type Band } from './view';

// ---------- parameters ----------

export interface RunParams {
    yieldValue: number | null;
    roadFactor: number | null;
    horizon: number | null;
    excluded: string[];
    collection: string | null;
    capacityBasis: string | null;
}

const num = (v: unknown): number | null => {
    const x = typeof v === 'string' ? Number(v) : v;
    return typeof x === 'number' && Number.isFinite(x) ? x : null;
};

export function runParams(e: BundleEntry): RunParams {
    const sc = solutionOf(e)?.scenario as Record<string, unknown> | undefined;
    const p = (e.params ?? {}) as Record<string, unknown>;
    const pick = (...keys: string[]): unknown => {
        for (const src of [sc, p]) {
            if (!src) continue;
            for (const k of keys) if (src[k] !== undefined && src[k] !== null) return src[k];
        }
        return undefined;
    };
    let y = num(pick('yield', 'yield_value', 'yieldValue'));
    if (y !== null && y > 1) y = y / 100; // tolerate percent
    const ex = pick('excluded_ids', 'excluded');
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
        yieldValue: y,
        roadFactor: num(pick('road_factor', 'roadFactor', 'circuity')),
        horizon: num(pick('horizon_years', 'horizon', 'H')),
        excluded: Array.isArray(ex) ? ex.map(String) : [],
        collection: str(pick('collection_policy')),
        capacityBasis: str(pick('capacity_basis')),
    };
}

// ---------- classification ----------

export type RunKind = 'sweep' | 'disrupt' | 'baseline' | 'variant';

export interface IndexedRun {
    slug: string;
    entry: BundleEntry;
    solution: Solution | undefined;
    params: RunParams;
    kind: RunKind;
    /** For disruptions: sites removed beyond the base run's exclusions. */
    removed: string[];
}

const DISRUPT_FAMILY = /disrupt|removed|lost|outage/i;

function isBaselineRun(e: BundleEntry, s: Solution | undefined): boolean {
    return e.family === 'baseline' || e.status === 'heuristic' || s?.status === 'heuristic' || s?.source === 'baseline';
}

const r6 = (x: number | null) => (x === null ? 'null' : x.toFixed(6));
export const comboKey = (y: number | null, r: number | null, h: number | null) => `${r6(y)}|${r6(r)}|${r6(h)}`;

export interface RunIndex {
    base: IndexedRun | undefined;
    runs: IndexedRun[];
    /** comboKey(yield, road, H) -> slug, for sweep runs (base assumptions otherwise). */
    sweep: Map<string, string>;
    /** single removed site id -> slug */
    disruptBySite: Map<string, string>;
    /** disruptions that remove several sites (e.g. district lost) */
    disruptMulti: IndexedRun[];
    bySlug: Map<string, IndexedRun>;
}

function buildIndex(): RunIndex {
    const baseE = getEntry(BASE_SLUG) ?? Object.values(bundle)[0];
    const baseP = baseE ? runParams(baseE) : null;
    const baseEx = new Set(baseP?.excluded ?? []);
    const runs: IndexedRun[] = [];
    for (const [slug, entry] of Object.entries(bundle)) {
        const solution = solutionOf(entry);
        const params = runParams(entry);
        const removed = params.excluded.filter((id) => !baseEx.has(id));
        let kind: RunKind;
        if (isBaselineRun(entry, solution)) kind = 'baseline';
        else if (removed.length > 0 || DISRUPT_FAMILY.test(entry.family ?? '')) kind = 'disrupt';
        else if (
            baseP &&
            ((params.collection ?? baseP.collection) !== baseP.collection ||
                (params.capacityBasis ?? baseP.capacityBasis) !== baseP.capacityBasis)
        )
            kind = 'variant';
        else kind = 'sweep';
        runs.push({ slug, entry, solution, params, kind, removed });
    }
    const sweep = new Map<string, string>();
    // Base slug wins a tie, then the first stored entry.
    const ordered = [...runs].sort((a, b) => Number(b.slug === BASE_SLUG) - Number(a.slug === BASE_SLUG));
    for (const r of ordered) {
        if (r.kind !== 'sweep') continue;
        const k = comboKey(r.params.yieldValue, r.params.roadFactor, r.params.horizon);
        if (!sweep.has(k)) sweep.set(k, r.slug);
    }
    const disruptBySite = new Map<string, string>();
    const disruptMulti: IndexedRun[] = [];
    for (const r of runs) {
        if (r.kind !== 'disrupt') continue;
        if (r.removed.length === 1 && !disruptBySite.has(r.removed[0])) disruptBySite.set(r.removed[0], r.slug);
        else disruptMulti.push(r);
    }
    const bySlug = new Map(runs.map((r) => [r.slug, r]));
    return { base: baseE ? bySlug.get(baseE.slug ?? BASE_SLUG) ?? runs[0] : undefined, runs, sweep, disruptBySite, disruptMulti, bySlug };
}

let cached: RunIndex | null = null;
export function runIndex(): RunIndex {
    if (!cached) cached = buildIndex();
    return cached;
}

export function baseSolution(): Solution | undefined {
    return runIndex().base?.solution;
}

// ---------- sweep options ----------

/** Amendment "Sweep options". Stored values outside this list are added, never dropped. */
export const SWEEP_OPTIONS = {
    yield: [0.13, 0.15, 0.1598, 0.16, 0.17, 0.19],
    road: [1.4, 1.9, 2.3],
    horizon: [1, 5, 10],
} as const;

const EPS = 1e-6;
function unionSorted(list: readonly number[], present: (number | null)[]): number[] {
    const out = [...list];
    for (const v of present) if (v !== null && !out.some((x) => Math.abs(x - v) < EPS)) out.push(v);
    return out.sort((a, b) => a - b);
}

export function sweepOptions(): { yield: number[]; road: number[]; horizon: number[] } {
    const sw = runIndex().runs.filter((r) => r.kind === 'sweep');
    return {
        yield: unionSorted(SWEEP_OPTIONS.yield, sw.map((r) => r.params.yieldValue)),
        road: unionSorted(SWEEP_OPTIONS.road, sw.map((r) => r.params.roadFactor)),
        horizon: unionSorted(SWEEP_OPTIONS.horizon, sw.map((r) => r.params.horizon)),
    };
}

export function sweepSlug(y: number, r: number, h: number): string | undefined {
    return runIndex().sweep.get(comboKey(y, r, h));
}

// ---------- disruption comparison ----------

export interface DisruptCompare {
    costField: 'total_horizon_usd' | 'primal';
    base: number | null;
    disrupted: number | null;
    delta: number | null;
    deltaFraction: number | null;
    /** supply sites whose depot assignment changed (including newly stranded) */
    sitesMoved: number;
    sitesConsidered: number;
    opened: Facility[];
    closed: Facility[];
    changedFlowKeys: string[];
}

const costOf = (s: Solution, f: DisruptCompare['costField']) => num(f === 'total_horizon_usd' ? s.total_horizon_usd : s.primal);

export function compareToBase(base: Solution, d: Solution): DisruptCompare {
    const costField: DisruptCompare['costField'] =
        costOf(base, 'total_horizon_usd') !== null && costOf(d, 'total_horizon_usd') !== null ? 'total_horizon_usd' : 'primal';
    const b = costOf(base, costField);
    const x = d.status === 'infeasible' ? null : costOf(d, costField);
    const delta = b !== null && x !== null ? x - b : null;
    const dest = (s: Solution) => {
        const m = new Map<string, string>();
        const acc = new Map<string, string[]>();
        for (const f of s.flows) if (f.leg === 'supply_depot') acc.set(f.from, [...(acc.get(f.from) ?? []), f.to]);
        for (const [k, v] of acc) m.set(k, [...new Set(v)].sort().join(','));
        return m;
    };
    const db = dest(base);
    const dd = dest(d);
    const ids = new Set([...db.keys(), ...dd.keys()]);
    let moved = 0;
    for (const id of ids) if ((db.get(id) ?? '') !== (dd.get(id) ?? '')) moved++;
    const fkey = (f: Facility) => `${f.type}:${f.site_id}:${f.size}`;
    const bf = new Set(base.facilities.map(fkey));
    const df = new Set(d.facilities.map(fkey));
    const baseFlows = new Set(base.flows.map(flowKey));
    return {
        costField,
        base: b,
        disrupted: x,
        delta,
        deltaFraction: delta !== null && b ? delta / b : null,
        sitesMoved: moved,
        sitesConsidered: ids.size,
        opened: d.facilities.filter((f) => !bf.has(fkey(f))),
        closed: base.facilities.filter((f) => !df.has(fkey(f))),
        changedFlowKeys: d.flows.map(flowKey).filter((k) => !baseFlows.has(k)),
    };
}

/** Map highlight for a disruption: removed sites, changed arcs and their ends; unchanged arcs dim. */
export function disruptHighlight(base: Solution | undefined, d: Solution, removed: string[]): Set<string> {
    const out = new Set<string>(removed);
    if (!base) return out;
    const changed = new Set(compareToBase(base, d).changedFlowKeys);
    for (const f of d.flows) {
        if (changed.has(flowKey(f))) {
            out.add(flowKey(f));
            out.add(f.from);
            out.add(f.to);
        }
    }
    return out;
}

// ---------- robustness ----------

export type RobustKind = 'off' | FacilityType;

export function bandOf(k: number, n: number): Band | null {
    if (n <= 0 || k <= 0) return null;
    if (k === n) return 'all';
    if (k >= n / 2) return 'most';
    return 'some';
}

export const BAND_RULE: Record<Band, string> = {
    all: 'all (k = n)',
    most: 'most (k ≥ n/2)',
    some: 'some (k > 0)',
};

/** District of a site: sites.json district, else the text after the comma in a label. */
export function districtOf(siteId: string, label?: string): string | null {
    const s = siteById(siteId);
    if (s?.district) return s.district;
    const l = label ?? s?.label;
    if (l && l.includes(',')) return l.slice(l.indexOf(',') + 1).trim() || null;
    return null;
}

export interface DistrictRobustness {
    district: string;
    k: number;
    n: number;
    band: Band | null;
    /** sites of this type opened in this district in at least one counted run */
    siteIds: string[];
}

export interface RobustnessResult {
    kind: FacilityType;
    n: number;
    slugs: string[];
    skippedBaseline: number;
    skippedInfeasible: number;
    districts: DistrictRobustness[];
}

const robustCache = new Map<FacilityType, RobustnessResult>();

/** Across stored solved runs (n), how many open a facility of `kind` in each district (k). */
export function robustness(kind: FacilityType): RobustnessResult {
    const hit = robustCache.get(kind);
    if (hit) return hit;
    const runs = runIndex().runs;
    let skippedBaseline = 0;
    let skippedInfeasible = 0;
    const counted: IndexedRun[] = [];
    for (const r of runs) {
        if (r.kind === 'baseline') skippedBaseline++;
        else if (!r.solution || r.solution.status === 'infeasible') skippedInfeasible++;
        else counted.push(r);
    }
    const n = counted.length;
    const k = new Map<string, number>();
    const sitesIn = new Map<string, Set<string>>();
    for (const r of counted) {
        const seen = new Set<string>();
        for (const f of r.solution!.facilities) {
            if (f.type !== kind) continue;
            const d = districtOf(f.site_id, f.label) ?? 'Unknown district';
            seen.add(d);
            sitesIn.set(d, (sitesIn.get(d) ?? new Set()).add(f.site_id));
        }
        for (const d of seen) k.set(d, (k.get(d) ?? 0) + 1);
    }
    const districts = [...k.entries()]
        .map(([district, kk]) => ({ district, k: kk, n, band: bandOf(kk, n), siteIds: [...(sitesIn.get(district) ?? [])].sort() }))
        .sort((a, b) => b.k - a.k || a.district.localeCompare(b.district));
    const res: RobustnessResult = { kind, n, slugs: counted.map((r) => r.slug), skippedBaseline, skippedInfeasible, districts };
    robustCache.set(kind, res);
    return res;
}

/** Band of a site's district, for colouring the map. */
export function siteBandFn(res: RobustnessResult | null): ((siteId: string) => Band | null) | undefined {
    if (!res) return undefined;
    const byDistrict = new Map(res.districts.map((d) => [d.district, d.band]));
    return (siteId: string) => {
        const d = districtOf(siteId);
        return d ? byDistrict.get(d) ?? null : null;
    };
}
