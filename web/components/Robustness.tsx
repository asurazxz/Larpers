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
        <div id="robustness" className="text-base">
            <div role="radiogroup" aria-label="Robustness overlay" className="seg">
                {KINDS.map((k) => (
                    <button
                        key={k.value}
                        type="button"
                        role="radio"
                        aria-checked={kind === k.value}
                        onClick={() => onKindChange(k.value)}
                        className="seg-btn min-w-[5.5rem]"
                    >
                        {k.label}
                    </button>
                ))}
            </div>

            {res && (
                <div className="mt-2.5" data-testid="robustness-result">
                    <p className="text-sm text-ink2">
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
                        <p className="mt-1 text-sm font-medium text-ink3" data-testid="robustness-single">
                            Only {res.n} stored run so far, so every district reads {res.n} of {res.n} or nothing. More runs land with
                            bundle v1.
                        </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-ink3">
                        {(['all', 'most', 'some'] as Band[]).map((b) => (
                            <span key={b} className="flex items-center gap-1">
                                <Swatch band={b} /> {BAND_RULE[b]}
                            </span>
                        ))}
                    </div>
                    {res.districts.length === 0 ? (
                        <div className="mt-1.5 text-ink2">No stored run opens a {res.kind}.</div>
                    ) : (
                        <table className="mt-2 w-full text-base leading-snug" data-testid="robustness-table">
                            <thead>
                                <tr className="hair-b text-left text-sm text-ink2">
                                    <th className="pb-1 font-medium">District</th>
                                    <th className="pb-1 text-right font-medium">Runs with a {res.kind}</th>
                                    <th className="pb-1 pl-3 font-medium">Band</th>
                                </tr>
                            </thead>
                            <tbody>
                                {res.districts.map((d) => (
                                    <tr key={d.district} data-band={d.band ?? 'none'} className="hair-b last:border-b-0">
                                        <td className="py-0.5">{d.district}</td>
                                        <td className="text-right font-semibold tabular-nums" data-testid="k-of-n">
                                            {d.k} of {d.n}
                                        </td>
                                        <td className="pl-3 text-ink3">
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
