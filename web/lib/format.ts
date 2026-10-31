import type { Solution } from './contract';

export const MISSING = 'not in this run';
const GAP_TOL = 1e-9;

export function orMissing(v: unknown, fmt?: (x: never) => string): string {
    if (v === null || v === undefined) return MISSING;
    if (typeof v === 'number' && !Number.isFinite(v)) return MISSING;
    return fmt ? fmt(v as never) : String(v);
}

export function isProvenOptimal(s: Pick<Solution, 'status' | 'gap'>): boolean {
    return s.status === 'optimal' && s.gap !== null && s.gap !== undefined && Math.abs(s.gap) <= GAP_TOL;
}

/** The only place status text is made. "Optimal" only when proven: status optimal and gap 0. */
export function statusLabel(s: Pick<Solution, 'status' | 'gap'> & { n_candidates?: number | null }): string {
    switch (s.status) {
        case 'infeasible':
            return 'No feasible network';
        case 'no_solution':
            return 'No network found in time';
        case 'heuristic':
            return 'Heuristic baseline';
        case 'no_solution':
            return 'Could not find a network within the time limit';
        case 'optimal':
        case 'best_found':
            if (isProvenOptimal(s)) {
                return s.n_candidates !== undefined && s.n_candidates !== null
                    ? `Optimal among ${s.n_candidates} candidates`
                    : 'Optimal';
            }
            return s.gap === null || s.gap === undefined ? 'Best found, gap unknown' : `Best found, gap ${pct(s.gap, 2)}`;
        default:
            return String(s.status);
    }
}

export function pct(fraction: number | null | undefined, dp = 1): string {
    if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return MISSING;
    return `${(fraction * 100).toFixed(dp)}%`;
}

const num = (v: number, dp: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** $1.64B, $348.7M, $12.3k, $950 */
export function usd(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
    const a = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (a >= 1e9) return `${sign}$${num(a / 1e9, 2)}B`;
    if (a >= 1e6) return `${sign}$${num(a / 1e6, 1)}M`;
    if (a >= 1e3) return `${sign}$${num(a / 1e3, 1)}k`;
    return `${sign}$${num(a, 0)}`;
}

/** Full-precision USD, for traces: $15,816,131.38 */
export function usdExact(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
    return `${v < 0 ? '-' : ''}$${num(Math.abs(v), 2)}`;
}

export function kt(v: number | null | undefined, dp = 1): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
    return `${num(v, dp)} kt`;
}

export function km(v: number | null | undefined, dp = 1): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
    return `${num(v, dp)} km`;
}

export function seconds(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
    return `${v.toFixed(1)} s`;
}

export const LEG_LABEL = {
    supply_depot: 'Site → depot',
    depot_refinery: 'Depot → refinery',
    refinery_airport: 'Refinery → airport',
} as const;
