'use client';

// District robustness across stored runs: in how many of n stored solved runs does a district get a
// depot (or refinery)? Three bins, labelled "k of n", never a percentage. Blue and orange only.
import { useMemo } from 'react';
import { BAND_RULE, robustness, type RobustKind } from '../lib/robustness';
import { BAND_COLOR, type Band } from '../lib/view';

export interface RobustnessProps {
    kind: RobustKind;
    onKindChange: (kind: RobustKind) => void;
}

const KINDS: { value: RobustKind; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'depot', label: 'Depot' },
    { value: 'refinery', label: 'Refinery' },
];

function Swatch({ band }: { band: Band }) {
    return (
        <span
            aria-hidden
            className="inline-block h-3 w-3 shrink-0 rounded-full"
            style={{
                background: band === 'most' ? 'transparent' : BAND_COLOR[band],
                border: `2px ${band === 'most' ? 'dashed' : 'solid'} ${BAND_COLOR[band]}`,
            }}
        />
    );
}

export default function Robustness({ kind, onKindChange }: RobustnessProps) {
    const res = useMemo(() => (kind === 'off' ? null : robustness(kind)), [kind]);

    return (
        <div id="robustness" className="text-sm">
            <div role="radiogroup" aria-label="Robustness overlay" className="flex gap-1">
                {KINDS.map((k) => (
                    <button
                        key={k.value}
                        type="button"
                        role="radio"
                        aria-checked={kind === k.value}
                        onClick={() => onKindChange(k.value)}
                        className={
                            'rounded border px-3 py-0.5 text-sm ' +
                            (kind === k.value
                                ? 'border-blue-800 bg-blue-700 font-bold text-white'
                                : 'border-gray-400 bg-white text-gray-900 hover:border-blue-700')
                        }
                    >
                        {k.label}
                    </button>
                ))}
            </div>

            {res && (
                <div className="mt-2" data-testid="robustness-result">
                    <p className="text-xs text-gray-700">
                        Districts with a {res.kind} in k of n = {res.n} stored solved run{res.n === 1 ? '' : 's'}
                        {res.skippedBaseline + res.skippedInfeasible > 0 &&
                            ` (not counted: ${[
                                res.skippedBaseline ? `${res.skippedBaseline} greedy baseline` : '',
                                res.skippedInfeasible ? `${res.skippedInfeasible} infeasible` : '',
                            ]
                                .filter(Boolean)
                                .join(', ')})`}
                        . Sites on the map are ringed by their district&apos;s band.
                    </p>
                    {res.n <= 1 && (
                        <p className="mt-1 text-xs font-semibold text-gray-800" data-testid="robustness-single">
                            Only {res.n} stored run so far, so every district reads {res.n} of {res.n} or nothing. More runs land with
                            bundle v1.
                        </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-700">
                        {(['all', 'most', 'some'] as Band[]).map((b) => (
                            <span key={b} className="flex items-center gap-1">
                                <Swatch band={b} /> {BAND_RULE[b]}
                            </span>
                        ))}
                    </div>
                    {res.districts.length === 0 ? (
                        <div className="mt-1 text-gray-600">No stored run opens a {res.kind}.</div>
                    ) : (
                        <table className="mt-1 w-full text-sm" data-testid="robustness-table">
                            <thead>
                                <tr className="text-left text-xs text-gray-600">
                                    <th className="font-semibold">District</th>
                                    <th className="text-right font-semibold">Runs with a {res.kind}</th>
                                    <th className="pl-2 font-semibold">Band</th>
                                </tr>
                            </thead>
                            <tbody>
                                {res.districts.map((d) => (
                                    <tr key={d.district} data-band={d.band ?? 'none'}>
                                        <td>{d.district}</td>
                                        <td className="text-right font-semibold tabular-nums" data-testid="k-of-n">
                                            {d.k} of {d.n}
                                        </td>
                                        <td className="pl-2">
                                            {d.band && (
                                                <span className="flex items-center gap-1">
                                                    <Swatch band={d.band} />
                                                    {d.band}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}
