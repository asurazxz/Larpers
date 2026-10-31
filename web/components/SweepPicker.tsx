'use client';

// "Stored runs": segmented radio groups, one button per solved value. No sliders: we have no
// interpolation. A combination with no stored run is greyed "not pre-run", never mapped to the nearest.
import { useMemo } from 'react';
import type { Solution } from '../lib/contract';
import { BASE_SLUG, getSolution } from '../lib/bundle';
import { runIndex, sweepOptions, sweepSlug } from '../lib/robustness';
import { baseView, gridView, yieldLabel, type View } from '../lib/view';

export interface SweepPickerProps {
    view: View;
    /** Select a stored run. Clears any disruption (one View state). */
    onSelect: (view: View, solution: Solution) => void;
}

type Combo = { y: number; r: number; h: number };
type Group = 'y' | 'r' | 'h';

export default function SweepPicker({ view, onSelect }: SweepPickerProps) {
    const opts = useMemo(() => sweepOptions(), []);
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
    const nTotal = opts.yield.length * opts.road.length * opts.horizon.length;

    const pick = (c: Combo) => {
        const slug = sweepSlug(c.y, c.r, c.h);
        const sol = slug ? getSolution(slug) : undefined;
        if (!slug || !sol) return;
        onSelect(slug === BASE_SLUG ? baseView() : gridView(c.y, c.r, c.h, slug), sol);
    };

    const group = (g: Group, title: string, values: number[], fmt: (v: number) => string) => (
        <div className="mt-1" role="radiogroup" aria-label={title} data-group={g}>
            <div className="text-xs font-semibold text-gray-600">{title}</div>
            <div className="mt-0.5 flex flex-wrap gap-1">
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
                                'min-w-[3.5rem] rounded border px-2 py-0.5 text-center text-sm leading-tight ' +
                                (checked
                                    ? 'border-blue-800 bg-blue-700 font-bold text-white'
                                    : available
                                      ? 'border-gray-400 bg-white text-gray-900 hover:border-blue-700'
                                      : 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400')
                            }
                        >
                            {fmt(v)}
                            {!available && <span className="block text-[10px] leading-none">not pre-run</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div id="sweep-picker" className="text-sm">
            <div className="flex items-baseline justify-between">
                <span className="font-semibold">Stored runs</span>
                <span className="text-xs text-gray-600" data-testid="sweep-count">
                    {nStored} of {nTotal} combinations pre-run
                </span>
            </div>
            {group('y', 'Yield', opts.yield, yieldLabel)}
            {group('r', 'Road factor', opts.road, (v) => String(v))}
            {group('h', 'Horizon H (years)', opts.horizon, (v) => String(v))}
            <p className="mt-1 text-xs text-gray-600">
                Each button is a solved run; values in between were not solved. Greyed: not pre-run.
                {view.kind === 'disrupt' && ' A disruption is showing: picking a stored run clears it.'}
            </p>
        </div>
    );
}
