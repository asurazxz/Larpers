'use client';

// "Stored runs": segmented radio groups, one button per solved value. No sliders: we have no
// interpolation. A combination with no stored run is dashed "not pre-run", never mapped to the nearest.
import { useMemo } from 'react';
import type { Solution } from '../lib/contract';
import { BASE_SLUG, getSolution } from '../lib/bundle';
import { runIndex, sweepSlug } from '../lib/robustness';
import { baseView, gridView, yieldLabel, type View } from '../lib/view';

export interface SweepPickerProps {
    view: View;
    /** Select a stored run. Clears any disruption (one View state). */
    onSelect: (view: View, solution: Solution) => void;
}

type Combo = { y: number; r: number; h: number };

/** Organisers' 15-25% yields and road factors 1.3 (organisers) / 1.9 (measured OSM); stored values are added. */
const BASE_OPTIONS = { yield: [0.15, 0.2, 0.25], road: [1.3, 1.9] };

function union(list: readonly number[], present: (number | null)[]): number[] {
    const out = [...list];
    for (const v of present) if (v !== null && Number.isFinite(v) && !out.some((x) => Math.abs(x - v) < 1e-6)) out.push(v);
    return out.sort((a, b) => a - b);
}

/** Option lists from the stored runs. Horizon is a group only when stored runs differ in it. */
function pickerOptions(): { yield: number[]; road: number[]; horizon: number[] } {
    const idx = runIndex();
    const runs = [...idx.runs.filter((r) => r.kind === 'sweep'), ...(idx.base ? [idx.base] : [])];
    return {
        yield: union(BASE_OPTIONS.yield, runs.map((r) => r.params.yieldValue)),
        road: union(BASE_OPTIONS.road, runs.map((r) => r.params.roadFactor)),
        horizon: union([], runs.map((r) => r.params.horizon)),
    };
}
type Group = 'y' | 'r' | 'h';

export default function SweepPicker({ view, onSelect }: SweepPickerProps) {
    const opts = useMemo(pickerOptions, []);
    const idx = runIndex();
    const baseP = idx.base?.params;
    const baseCombo: Combo | null =
        baseP && baseP.yieldValue !== null && baseP.roadFactor !== null && baseP.horizon !== null
            ? { y: baseP.yieldValue, r: baseP.roadFactor, h: baseP.horizon }
            : null;

    // Current combination: the grid view's, the base run's in base view, none in disrupt view.
    const current: Combo | null =
        view.kind === 'grid'
            ? { y: view.yieldValue, r: view.roadFactor, h: view.horizon ?? baseCombo?.h ?? 1 }
            : view.kind === 'base'
              ? baseCombo
              : null;
    const anchor = current ?? baseCombo;

    const nStored = idx.sweep.size;
    const nTotal = opts.yield.length * opts.road.length * Math.max(1, opts.horizon.length);

    const pick = (c: Combo) => {
        const slug = sweepSlug(c.y, c.r, c.h);
        const sol = slug ? getSolution(slug) : undefined;
        if (!slug || !sol) return;
        onSelect(slug === BASE_SLUG ? baseView() : gridView(c.y, c.r, c.h, slug), sol);
    };

    const group = (g: Group, title: string, values: number[], fmt: (v: number) => string) => (
        <div className="mt-2.5" role="radiogroup" aria-label={title} data-group={g}>
            <div className="mb-1 text-base text-ink2">{title}</div>
            <div className="seg">
                {values.map((v) => {
                    const c: Combo | null = anchor ? { ...anchor, [g]: v } : null;
                    const slug = c ? sweepSlug(c.y, c.r, c.h) : undefined;
                    const checked = !!current && Math.abs(current[g] - v) < 1e-6;
                    const available = !!slug;
                    return (
                        <button
                            key={v}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            aria-disabled={!available}
                            disabled={!available}
                            data-value={v}
                            data-prerun={available ? 'yes' : 'no'}
                            title={available ? `Stored run ${slug}` : 'not pre-run: no stored run for this combination'}
                            onClick={() => c && pick(c)}
                            className={
                                'seg-btn num min-w-[3.25rem] text-center ' +
                                (available ? '' : 'cursor-not-allowed border border-dashed border-gray-400 text-ink3')
                            }
                        >
                            <span className={available ? undefined : 'line-through decoration-1'}>{fmt(v)}</span>
                            {!available && <span className="ml-1.5">not pre-run</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div id="sweep-picker" className="text-base">
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-ink2">Stored runs</span>
                <span className="num text-base text-ink2" data-testid="sweep-count">
                    {nStored} of {nTotal} combinations pre-run
                </span>
            </div>
            {group('y', 'Yield', opts.yield, yieldLabel)}
            {group('r', 'Road factor', opts.road, (v) => String(v))}
            {opts.horizon.length > 1 && group('h', 'Horizon (yr)', opts.horizon, (v) => String(v))}
            <p className="mt-2.5 text-sm text-ink2">
                Each button is a solved run; values in between were not solved. Dashed: not pre-run.
                {view.kind === 'disrupt' && ' A disruption is showing: picking a stored run clears it.'}
            </p>
        </div>
    );
}
