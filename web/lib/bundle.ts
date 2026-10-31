// Stored runs, statically imported so the build works on file:// with no fetch.
// Denzel's solver/scenarios.py overwrites web/data/bundle.json; the accessors tolerate either
// { slug: { ...meta, solution } } or { slug: { ...meta, ...Solution } }.
import rawBundle from '../data/bundle.json';
import rawSites from '../data/sites.json';
import type { Bundle, BundleEntry, Site, Solution } from './contract';

export const bundle = rawBundle as unknown as Bundle;
export const sites = rawSites as Site[];

export const BASE_SLUG = 'base';

export function slugs(): string[] {
    return Object.keys(bundle);
}

export function getEntry(slug: string): BundleEntry | undefined {
    return bundle[slug];
}

export function solutionOf(entry: BundleEntry | undefined): Solution | undefined {
    if (!entry) return undefined;
    if (entry.solution) return entry.solution;
    const maybe = entry as unknown as Partial<Solution>;
    return Array.isArray(maybe.flows) && Array.isArray(maybe.facilities) ? (maybe as Solution) : undefined;
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
