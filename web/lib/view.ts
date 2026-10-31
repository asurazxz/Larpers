// One view state, not independent controls. Disruptions are solved at base assumptions only and the
// grid has no disruptions, so selecting one clears the other.

export type View =
    | { kind: 'base' }
    | { kind: 'grid'; yieldValue: number; roadFactor: number }
    | { kind: 'disrupt'; slug: string };

export const DEFAULT_VIEW: View = { kind: 'base' };

/** Stable key for a flow, used in Map's `highlight` set: `${leg}:${from}->${to}`. */
export function flowKey(f: { leg: string; from: string; to: string }): string {
    return `${f.leg}:${f.from}->${f.to}`;
}

export const baseView = (): View => ({ kind: 'base' });

export const gridView = (yieldValue: number, roadFactor: number): View => ({ kind: 'grid', yieldValue, roadFactor });

export const disruptView = (slug: string): View => ({ kind: 'disrupt', slug });

export function isSameView(a: View, b: View): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'grid' && b.kind === 'grid') {
        return a.yieldValue === b.yieldValue && a.roadFactor === b.roadFactor;
    }
    if (a.kind === 'disrupt' && b.kind === 'disrupt') return a.slug === b.slug;
    return true;
}

/** Short human label for the header. */
export function viewLabel(v: View): string {
    switch (v.kind) {
        case 'base':
            return 'Base';
        case 'grid':
            return `Yield ${(v.yieldValue * 100).toFixed(2).replace(/\.?0+$/, '')}%, road factor ${v.roadFactor}`;
        case 'disrupt':
            return `Disruption: ${v.slug}`;
    }
}

/** Slug of the stored run for a view, under the convention base | grid slug | disrupt slug. */
export function viewSlug(v: View, gridSlug?: (yieldValue: number, roadFactor: number) => string): string {
    switch (v.kind) {
        case 'base':
            return 'base';
        case 'grid':
            return gridSlug ? gridSlug(v.yieldValue, v.roadFactor) : `grid_y${v.yieldValue}_r${v.roadFactor}`;
        case 'disrupt':
            return v.slug;
    }
}
