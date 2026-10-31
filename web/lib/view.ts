// One view state, not independent controls. Disruptions are solved at base assumptions only and the
// grid has no disruptions, so selecting one clears the other.

export type View =
    | { kind: 'base' }
    | {
          kind: 'grid';
          yieldValue: number;
          roadFactor: number;
          /** Horizon in years. Absent means the base horizon. */
          horizon?: number;
          /** Stored-run slug this combination resolved to, when known. */
          slug?: string;
      }
    | {
          kind: 'disrupt';
          slug: string;
          /** Sites made unavailable at design stage, beyond the base run's own exclusions. */
          siteIds?: string[];
          /** True for a live re-solve (not a stored run). */
          live?: boolean;
      };

export const DEFAULT_VIEW: View = { kind: 'base' };

/** Stable key for a flow, used in Map's `highlight` set: `${leg}:${from}->${to}`. */
export function flowKey(f: { leg: string; from: string; to: string }): string {
    return `${f.leg}:${f.from}->${f.to}`;
}

export const baseView = (): View => ({ kind: 'base' });

export const gridView = (yieldValue: number, roadFactor: number, horizon?: number, slug?: string): View => ({
    kind: 'grid',
    yieldValue,
    roadFactor,
    ...(horizon !== undefined ? { horizon } : {}),
    ...(slug !== undefined ? { slug } : {}),
});

export const disruptView = (slug: string, siteIds?: string[], live?: boolean): View => ({
    kind: 'disrupt',
    slug,
    ...(siteIds ? { siteIds } : {}),
    ...(live ? { live } : {}),
});

/** Slug used for a live "re-solve without this site" result. Never collides with a stored slug. */
export const liveDisruptSlug = (siteIds: string[], runId: string): string => `live:${siteIds.join('+')}:${runId}`;

export function isSameView(a: View, b: View): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'grid' && b.kind === 'grid') {
        return a.yieldValue === b.yieldValue && a.roadFactor === b.roadFactor && a.horizon === b.horizon;
    }
    if (a.kind === 'disrupt' && b.kind === 'disrupt') return a.slug === b.slug;
    return true;
}

/** 0.1598 -> "15.98%", 0.15 -> "15%". */
export function yieldLabel(y: number): string {
    return `${(y * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

/** Short human label for the header. */
export function viewLabel(v: View): string {
    switch (v.kind) {
        case 'base':
            return 'Base';
        case 'grid':
            return `Yield ${yieldLabel(v.yieldValue)}, road factor ${v.roadFactor}${v.horizon !== undefined ? `, H = ${v.horizon}` : ''}`;
        case 'disrupt':
            return v.live
                ? `Site unavailable at design stage (live re-solve): ${(v.siteIds ?? []).join(', ')}`
                : `Site unavailable at design stage: ${v.siteIds?.length ? v.siteIds.join(', ') : v.slug}`;
    }
}

/** Slug of the stored run for a view, under the convention base | grid slug | disrupt slug. */
export function viewSlug(v: View, gridSlug?: (yieldValue: number, roadFactor: number) => string): string {
    switch (v.kind) {
        case 'base':
            return 'base';
        case 'grid':
            if (v.slug) return v.slug;
            return gridSlug ? gridSlug(v.yieldValue, v.roadFactor) : `grid_y${v.yieldValue}_r${v.roadFactor}`;
        case 'disrupt':
            return v.slug;
    }
}

// Robustness bands: blue and orange only (colour-blind safe, projector safe), never green or amber.
export type Band = 'all' | 'most' | 'some';
export const BAND_COLOR: Record<Band, string> = {
    all: '#1d4ed8', // strong blue
    most: '#60a5fa', // light blue
    some: '#ea580c', // orange
};
