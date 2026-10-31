// Human labels and groups for stored run slugs (solver/scenarios.py names them; the UI never shows raw slugs).
import { siteById } from './bundle';

export type RunKind = 'base' | 'baseline' | 'earlier' | 'disruption' | 'sensitivity' | 'live' | 'other';

export function runKind(slug: string | null, isLive: boolean): RunKind {
    if (isLive) return 'live';
    if (!slug) return 'other';
    if (slug === 'base') return 'base';
    if (slug === 'baseline') return 'baseline';
    if (slug === 'earlier_assumptions') return 'earlier';
    if (/^(no_refinery_|no_depot_|district_lost_)/.test(slug)) return 'disruption';
    if (/^sweep_/.test(slug) || slug === 'road_matrix' || slug === 'collect_all' || slug === 'saf_output') return 'sensitivity';
    return 'other';
}

function district(siteId: string): string {
    return siteById(siteId)?.district ?? '';
}

/** "district_lost_east_kutai" → "East Kutai". */
function titleCase(s: string): string {
    return s.split(/[_\s]+/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
}

export function runLabel(slug: string): string {
    if (slug === 'base') return 'Recommended network (base)';
    if (slug === 'baseline') return 'Greedy baseline';
    if (slug === 'earlier_assumptions') return 'Earlier assumptions';
    if (slug === 'road_matrix') return 'OSRM road distances';
    if (slug === 'collect_all') return 'Collect all biomass';
    if (slug === 'saf_output') return 'Capacity on SAF output';
    let m = /^no_refinery_(.+)$/.exec(slug);
    if (m) {
        const d = district(m[1]!);
        return `Without refinery at ${m[1]}${d ? ` (${d})` : ''}`;
    }
    m = /^no_depot_(.+)$/.exec(slug);
    if (m) {
        const d = district(m[1]!);
        return `Without depot at ${m[1]}${d ? ` (${d})` : ''}`;
    }
    m = /^district_lost_(.+)$/.exec(slug);
    if (m) return `District lost: ${titleCase(m[1]!)}`;
    // sweep_y0200_rf13 → yield 0.200, road factor 1.3
    m = /^sweep_y(\d+)_rf(\d+)$/.exec(slug);
    if (m) {
        const y = Number(m[1]) / 1000;
        const rf = Number(m[2]) / 10;
        return `Yield ${Math.round(y * 1000) / 10}%, road factor ${rf}`;
    }
    return titleCase(slug);
}
