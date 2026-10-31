// Stored runs, statically imported so the build works on file:// with no fetch.
// solver/scenarios.py writes { schema_version, label, ..., runs: { slug: { ...meta, scenario, solution } },
// stress, robustness, bulungan }. A flat { slug: entry } map is also accepted.
import rawBundle from '../data/bundle.json';
import rawSites from '../data/sites.json';
import type { Bundle, BundleEntry, Scenario, Site, Solution } from './contract';

type RawEntry = BundleEntry & { scenario?: Scenario };
type RawBundle = { runs?: Record<string, RawEntry> } & Record<string, unknown>;

const raw = rawBundle as unknown as RawBundle;
const rawRuns = (raw.runs ?? raw) as Record<string, RawEntry>;

// Normalised once at load so every caller sees the same Solution objects (identity marks stored vs live).
// The contract's Solution has no scenario echo; the entry's scenario is attached as the UI-only field.
export const bundle: Bundle = Object.fromEntries(
    Object.entries(rawRuns)
        .filter(([, e]) => e && typeof e === 'object' && typeof e.slug === 'string')
        .map(([slug, e]) => {
            const solution = e.solution ?? (Array.isArray((e as unknown as Solution).flows) ? (e as unknown as Solution) : undefined);
            const withScenario = solution && !solution.scenario && e.scenario ? { ...solution, scenario: e.scenario } : solution;
            return [slug, { ...e, solution: withScenario }];
        }),
);

/** Bundle-level extras from scenarios.py (stress summary, robustness, bulungan), if present. */
export const bundleMeta = raw.runs ? (raw as Record<string, unknown>) : {};

export const sites = rawSites as Site[];

export const BASE_SLUG = 'base';

export function slugs(): string[] {
    return Object.keys(bundle);
}

export function getEntry(slug: string): BundleEntry | undefined {
    return bundle[slug];
}

export function solutionOf(entry: BundleEntry | undefined): Solution | undefined {
    return entry?.solution;
}

export function getSolution(slug: string): Solution | undefined {
    return solutionOf(getEntry(slug));
}

/** The base stored run, or the first entry if there is no `base` slug. */
export function baseEntry(): BundleEntry | undefined {
    return bundle[BASE_SLUG] ?? bundle[slugs()[0]];
}

export function entriesByFamily(family: string): BundleEntry[] {
    return Object.values(bundle).filter((e) => e.family === family);
}

export function storedRunCount(): number {
    return slugs().length;
}

export function siteById(id: string): Site | undefined {
    return sites.find((s) => s.id === id);
}
