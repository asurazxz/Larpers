'use client';

// "Site unavailable at design stage": remove one open facility of the base run and show the stored
// re-solve, or re-solve live through excluded_ids when the solver API is up. Solved at base
// assumptions only. An infeasible result is a result, not an error.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Facility, Scenario, Solution } from '../lib/contract';
import { DEFAULT_SCENARIO } from '../lib/contract';
import { getSolution } from '../lib/bundle';
import { AuthRequiredError, health, liveEnabled, solve } from '../lib/api';
import { signInWithGoogle } from '../lib/auth';
import { pct, statusLabel, usd } from '../lib/format';
import { baseSolution, compareToBase, runIndex } from '../lib/robustness';
import { baseView, disruptView, liveDisruptSlug, type View } from '../lib/view';

export interface DisruptProps {
    view: View;
    /** The solution currently on the map (the disruption's, in disrupt view). */
    solution: Solution | null;
    /** Select a disruption (or base on reset). Clears any sweep selection (one View state). */
    onSelect: (view: View, solution: Solution | null) => void;
    /** Site clicked on the map; its row is focused in the list. */
    focusSiteId?: string | null;
}

const facilityName = (f: Pick<Facility, 'site_id' | 'label'>) => f.label ?? f.site_id;
const typeLabel = (f: Facility) => `${f.size === 'large' ? 'Large' : 'Small'} ${f.type}`;

function signedUsd(v: number | null): string {
    if (v === null) return usd(v);
    return v > 0 ? `+${usd(v)}` : usd(v);
}
function signedPct(v: number | null): string {
    if (v === null) return pct(v, 2);
    return v > 0 ? `+${pct(v, 2)}` : pct(v, 2);
}

export default function Disrupt({ view, solution, onSelect, focusSiteId }: DisruptProps) {
    const idx = runIndex();
    const base = baseSolution();
    const [liveOk, setLiveOk] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [authNeeded, setAuthNeeded] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const rowRefs = useRef(new Map<string, HTMLLIElement>());

    useEffect(() => {
        if (!liveEnabled) return;
        let alive = true;
        const check = () => health().then((h) => alive && setLiveOk(h.ok));
        check();
        const t = setInterval(check, 30_000);
        return () => {
            alive = false;
            clearInterval(t);
        };
    }, []);

    useEffect(() => {
        if (focusSiteId) rowRefs.current.get(focusSiteId)?.scrollIntoView({ block: 'nearest' });
    }, [focusSiteId]);

    // Open facilities of the base run: refineries first, then depots by throughput.
    const facilities = useMemo(
        () =>
            [...(base?.facilities ?? [])].sort(
                (a, b) =>
                    Number(b.type === 'refinery') - Number(a.type === 'refinery') ||
                    (b.throughput_kt ?? 0) - (a.throughput_kt ?? 0) ||
                    a.site_id.localeCompare(b.site_id),
            ),
        [base],
    );

    const removedNow = view.kind === 'disrupt' ? view.siteIds ?? idx.bySlug.get(view.slug)?.removed ?? [] : [];
    const activeSlug = view.kind === 'disrupt' ? view.slug : null;

    const showStored = (slug: string, siteIds: string[]) => {
        const s = getSolution(slug);
        if (!s) return;
        setError(null);
        onSelect(disruptView(slug, siteIds), s);
    };

    const resolveLive = async (siteId: string) => {
        if (!base) return;
        setBusy(siteId);
        setError(null);
        setAuthNeeded(false);
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const baseScenario: Scenario = { ...DEFAULT_SCENARIO, ...(base.scenario ?? {}) };
        const excluded_ids = [...new Set([...(baseScenario.excluded_ids ?? []), siteId])];
        try {
            const scenario = { ...baseScenario, excluded_ids };
            const s = await solve(scenario, { signal: ctrl.signal });
            onSelect(disruptView(liveDisruptSlug([siteId], s.run_id), [siteId], true), s.scenario ? s : { ...s, scenario });
        } catch (e) {
            if (e instanceof AuthRequiredError) {
                setAuthNeeded(true);
                setError(e.message);
            } else {
                setError(`Re-solve failed: ${e instanceof Error ? e.message : String(e)} Staying on the current run.`);
            }
        } finally {
            setBusy(null);
            abortRef.current = null;
        }
    };

    const reset = () => {
        abortRef.current?.abort();
        setError(null);
        onSelect(baseView(), base ?? null);
    };

    // ----- result -----
    let result: React.ReactNode = null;
    if (view.kind === 'disrupt' && solution) {
        const removedLabels = removedNow.map((id) => {
            const f = base?.facilities.find((x) => x.site_id === id);
            return f ? `${facilityName(f)} (${typeLabel(f).toLowerCase()})` : id;
        });
        const infeasible = solution.status === 'infeasible';
        const cmp = base && !infeasible ? compareToBase(base, solution) : null;
        result = (
            <div id="disrupt-result" className="mt-2 rounded border-2 border-blue-700 bg-blue-50 p-2" data-status={solution.status}>
                <div className="text-xs font-semibold uppercase text-gray-600">
                    {view.kind === 'disrupt' && view.live ? `Live re-solve, run ID ${solution.run_id}` : `Stored run ${activeSlug}`}
                </div>
                <div className="font-semibold">
                    Site unavailable at design stage: {removedLabels.join(', ') || activeSlug}
                </div>
                {infeasible ? (
                    <div data-testid="disrupt-infeasible" className="mt-1 text-base font-bold text-gray-900">
                        No feasible network under this disruption
                    </div>
                ) : cmp ? (
                    <div className="mt-1 space-y-0.5" data-testid="disrupt-delta">
                        <div className="flex justify-between gap-2">
                            <span className="text-gray-700">{cmp.costField === 'total_horizon_usd' ? 'Total horizon cost' : 'Objective'}</span>
                            <span>
                                {usd(cmp.base)} → {usd(cmp.disrupted)}
                            </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-gray-700">Change against base</span>
                            <span className="font-bold" data-testid="disrupt-delta-value">
                                {signedUsd(cmp.delta)} ({signedPct(cmp.deltaFraction)})
                            </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-gray-700">Supply sites moved</span>
                            <span data-testid="disrupt-moved">
                                {cmp.sitesMoved} of {cmp.sitesConsidered}
                            </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-gray-700">Facilities opened / closed</span>
                            <span>
                                {cmp.opened.length} / {cmp.closed.length}
                            </span>
                        </div>
                        {cmp.opened.length > 0 && (
                            <div className="text-xs text-gray-700">Opened: {cmp.opened.map((f) => `${facilityName(f)} (${typeLabel(f).toLowerCase()})`).join('; ')}</div>
                        )}
                        <div className="text-xs text-gray-600">{statusLabel(solution)}. Changed arcs are emphasised on the map, unchanged arcs dimmed.</div>
                    </div>
                ) : (
                    <div className="mt-1 text-gray-700">{statusLabel(solution)}</div>
                )}
                <button
                    type="button"
                    onClick={reset}
                    data-testid="disrupt-reset"
                    className="mt-2 rounded border border-gray-700 bg-white px-3 py-1 text-sm font-semibold hover:bg-gray-100"
                >
                    Reset to base
                </button>
            </div>
        );
    }

    const canLive = liveEnabled && liveOk;

    return (
        <div id="disrupt" className="text-sm">
            <p className="text-xs text-gray-700">
                Site unavailable at design stage: remove one open facility and re-plan the network.{' '}
                <strong>Disruptions are solved at base assumptions only.</strong>
                {view.kind === 'grid' && ' Picking a disruption clears the stored-run selection.'}
            </p>
            {result}
            {error && (
                <div role="alert" className="mt-2 rounded border border-orange-600 bg-orange-50 p-2 text-sm" data-testid="disrupt-error">
                    {error}
                    {authNeeded && (
                        <button
                            type="button"
                            onClick={() => void signInWithGoogle()}
                            className="ml-2 rounded border border-gray-700 bg-white px-2 py-0.5 font-semibold"
                        >
                            Sign in with Google
                        </button>
                    )}
                </div>
            )}
            {!base ? (
                <div className="mt-1 text-gray-600">No base run in the bundle.</div>
            ) : (
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1" data-testid="disrupt-list">
                    {facilities.map((f) => {
                        const slug = idx.disruptBySite.get(f.site_id);
                        const stored = slug ? idx.bySlug.get(slug) : undefined;
                        const active = removedNow.length === 1 && removedNow[0] === f.site_id;
                        const focused = focusSiteId === f.site_id;
                        return (
                            <li
                                key={`${f.type}-${f.site_id}`}
                                ref={(el) => {
                                    if (el) rowRefs.current.set(f.site_id, el);
                                    else rowRefs.current.delete(f.site_id);
                                }}
                                data-site={f.site_id}
                                data-prerun={slug ? 'yes' : 'no'}
                                className={
                                    'flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded border px-2 py-1 ' +
                                    (active ? 'border-blue-700 bg-blue-50 ' : 'border-gray-200 ') +
                                    (focused ? 'ring-2 ring-blue-600 ' : '') +
                                    (slug ? '' : 'bg-gray-50 text-gray-400')
                                }
                            >
                                <div className="min-w-[11rem] flex-1">
                                    <div className="truncate font-medium">{facilityName(f)}</div>
                                    <div className="text-xs">
                                        {typeLabel(f)}
                                        {stored?.solution
                                            ? stored.solution.status === 'infeasible'
                                                ? ' · stored: no feasible network'
                                                : ` · stored: ${signedUsd(base ? compareToBase(base, stored.solution).delta : null)}`
                                            : ' · not pre-run'}
                                    </div>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    {slug ? (
                                        <button
                                            type="button"
                                            onClick={() => showStored(slug, [f.site_id])}
                                            aria-pressed={activeSlug === slug}
                                            className="rounded border border-blue-700 bg-white px-2 py-0.5 text-xs font-semibold text-blue-800 hover:bg-blue-50"
                                        >
                                            Show stored result
                                        </button>
                                    ) : null}
                                    {canLive && (
                                        <button
                                            type="button"
                                            disabled={busy !== null}
                                            onClick={() => void resolveLive(f.site_id)}
                                            className="flex items-center gap-1 rounded border border-gray-700 bg-white px-2 py-0.5 text-xs font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                                        >
                                            {busy === f.site_id && (
                                                <span
                                                    aria-label="Solving"
                                                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-700 border-t-transparent"
                                                />
                                            )}
                                            {busy === f.site_id ? 'Solving…' : 'Re-solve without this site'}
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                    {idx.disruptMulti.map((r) => (
                        <li key={r.slug} data-site={r.removed.join('+')} data-prerun="yes" className="flex items-center justify-between gap-2 rounded border border-gray-200 px-2 py-1">
                            <div className="min-w-0">
                                <div className="truncate font-medium">{r.entry.label ?? r.slug}</div>
                                <div className="text-xs">
                                    {r.removed.length} sites unavailable
                                    {r.solution?.status === 'infeasible' ? ' · stored: no feasible network' : ''}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => showStored(r.slug, r.removed)}
                                aria-pressed={activeSlug === r.slug}
                                className="shrink-0 rounded border border-blue-700 bg-white px-2 py-0.5 text-xs font-semibold text-blue-800 hover:bg-blue-50"
                            >
                                Show stored result
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {busy && (
                <button type="button" onClick={() => abortRef.current?.abort()} className="mt-1 text-xs underline">
                    Cancel re-solve
                </button>
            )}
            {liveEnabled && !liveOk && <p className="mt-1 text-xs text-gray-600">Solver API not reachable: stored results only.</p>}
        </div>
    );
}
