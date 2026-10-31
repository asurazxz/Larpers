'use client';

// "Site unavailable at design stage": remove one open facility of the base run and show the stored
// re-solve, or re-solve live through excluded_ids when the solver API is up. Solved at base
// assumptions only. An infeasible result is a result, not an error.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Facility, Scenario, Solution } from '../lib/contract';
import { DEFAULT_SCENARIO } from '../lib/contract';
import { getSolution } from '../lib/bundle';
import { AuthRequiredError, health, liveEnabled, solveStream } from '../lib/api';
import { signInWithGoogle } from '../lib/auth';
import { pct, statusLabel, usd } from '../lib/format';
import { baseSolution, compareToBase, runIndex } from '../lib/robustness';
import type { SolveFeed } from '../lib/solveProgress';
import { RESULT_LINGER_MS } from '../lib/useLive';
import { baseView, disruptView, liveDisruptSlug, type View } from '../lib/view';

export interface DisruptProps {
    view: View;
    /** The solution currently on the map (the disruption's, in disrupt view). */
    solution: Solution | null;
    /** Select a disruption (or base on reset). Clears any sweep selection (one View state). */
    onSelect: (view: View, solution: Solution | null) => void;
    /** Site clicked on the map; its row is focused in the list. */
    focusSiteId?: string | null;
    /** Receives the solver's progress during a live re-solve. */
    feed: SolveFeed;
}

/** Rows shown before the "more" fold. */
const VISIBLE_ROWS = 5;

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

export default function Disrupt({ view, solution, onSelect, focusSiteId, feed }: DisruptProps) {
    const idx = runIndex();
    const base = baseSolution();
    const [liveOk, setLiveOk] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [authNeeded, setAuthNeeded] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const rowRefs = useRef(new Map<string, HTMLLIElement>());
    const [moreOpen, setMoreOpen] = useState(false);

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

    // Rows with a stored re-solve first, so the visible rows are the ones that answer instantly.
    const ordered = useMemo(
        () => [...facilities].sort((a, b) => Number(idx.disruptBySite.has(b.site_id)) - Number(idx.disruptBySite.has(a.site_id))),
        [facilities, idx],
    );
    const nVisibleSingles = Math.max(0, VISIBLE_ROWS - idx.disruptMulti.length);
    const hiddenSites = useMemo(() => new Set(ordered.slice(nVisibleSingles).map((f) => f.site_id)), [ordered, nVisibleSingles]);

    useEffect(() => {
        if (!focusSiteId) return;
        if (hiddenSites.has(focusSiteId)) setMoreOpen(true);
        requestAnimationFrame(() => rowRefs.current.get(focusSiteId)?.scrollIntoView({ block: 'nearest' }));
    }, [focusSiteId, hiddenSites]);

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
        feed.begin();
        try {
            const scenario = { ...baseScenario, excluded_ids };
            const s = await solveStream(scenario, { signal: ctrl.signal, onEvent: feed.push });
            feed.end(RESULT_LINGER_MS);
            onSelect(disruptView(liveDisruptSlug([siteId], s.run_id), [siteId], true), s.scenario ? s : { ...s, scenario });
        } catch (e) {
            feed.end();
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
            <div id="disrupt-result" className="mt-2.5 rounded-2xl bg-blue-50 px-4 py-3" data-status={solution.status}>
                <div className="text-sm font-medium text-blue-800">
                    {view.kind === 'disrupt' && view.live ? `Live re-solve, run ID ${solution.run_id}` : `Stored run ${activeSlug}`}
                </div>
                <div className="mt-0.5 font-semibold">
                    Site unavailable at design stage: {removedLabels.join(', ') || activeSlug}
                </div>
                {infeasible ? (
                    <div data-testid="disrupt-infeasible" className="mt-1.5 text-base font-semibold text-orange-800">
                        No feasible network under this disruption
                    </div>
                ) : cmp ? (
                    <div className="mt-1.5 space-y-0.5" data-testid="disrupt-delta">
                        <div className="flex justify-between gap-2">
                            <span className="text-ink2">{cmp.costField === 'total_horizon_usd' ? 'Total horizon cost' : 'Objective'}</span>
                            <span className="num">
                                {usd(cmp.base)} → {usd(cmp.disrupted)}
                            </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-ink2">Change against base</span>
                            <span className={`num font-semibold ${cmp.delta !== null && cmp.delta > 0 ? 'text-orange-800' : 'text-blue-800'}`} data-testid="disrupt-delta-value">
                                {signedUsd(cmp.delta)} ({signedPct(cmp.deltaFraction)})
                            </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-ink2">Supply sites moved</span>
                            <span className="num" data-testid="disrupt-moved">
                                {cmp.sitesMoved} of {cmp.sitesConsidered}
                            </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-ink2">Facilities opened / closed</span>
                            <span>
                                {cmp.opened.length} / {cmp.closed.length}
                            </span>
                        </div>
                        {cmp.opened.length > 0 && (
                            <div className="text-sm text-ink3">Opened: {cmp.opened.map((f) => `${facilityName(f)} (${typeLabel(f).toLowerCase()})`).join('; ')}</div>
                        )}
                        <div className="text-sm text-ink3">{statusLabel(solution)}. Changed arcs are emphasised on the map, unchanged arcs dimmed.</div>
                    </div>
                ) : (
                    <div className="mt-1 text-ink3">{statusLabel(solution)}</div>
                )}
                <button
                    type="button"
                    onClick={reset}
                    data-testid="disrupt-reset"
                    className="pill mt-2.5 bg-white text-ink shadow-thumb hover:bg-gray-50"
                >
                    Reset to base
                </button>
            </div>
        );
    }

    const canLive = liveEnabled && liveOk;

    const singleRow = (f: Facility) => {
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
                    'flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-1.5 leading-snug transition-colors duration-150 ' +
                    (active ? 'bg-blue-50 ' : 'bg-white ') +
                    (focused ? 'ring-2 ring-inset ring-accent ' : '') +
                    (slug ? '' : 'text-ink3')
                }
            >
                <div className="min-w-[11rem] flex-1">
                    <div className="truncate font-medium">{facilityName(f)}</div>
                    <div className={`num text-base ${slug ? 'text-ink2' : 'text-ink3'}`}>
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
                            className="pill-link py-0.5 aria-pressed:bg-blue-50"
                        >
                            Show stored result
                        </button>
                    ) : null}
                    {canLive && (
                        <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void resolveLive(f.site_id)}
                            className="pill-secondary py-0.5"
                        >
                            {busy === f.site_id && (
                                <span
                                    aria-label="Solving"
                                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent"
                                />
                            )}
                            {busy === f.site_id ? 'Solving…' : 'Re-solve without this site'}
                        </button>
                    )}
                </div>
            </li>
        );
    };

    const multiRow = (r: (typeof idx.disruptMulti)[number]) => (

        <li key={r.slug} data-site={r.removed.join('+')} data-prerun="yes" className="flex items-center justify-between gap-3 bg-white px-3 py-1.5 leading-snug">
            <div className="min-w-0">
                <div className="truncate font-medium">{r.entry.label ?? r.slug}</div>
                <div className="text-base text-ink2">
                    {r.removed.length} sites unavailable
                    {r.solution?.status === 'infeasible' ? ' · stored: no feasible network' : ''}
                </div>
            </div>
            <button
                type="button"
                onClick={() => showStored(r.slug, r.removed)}
                aria-pressed={activeSlug === r.slug}
                className="pill-link shrink-0 py-0.5 aria-pressed:bg-blue-50"
            >
                Show stored result
            </button>
        </li>
    );

    return (
        <div id="disrupt" className="text-base">
            <p className="text-sm text-ink2">
                Site unavailable at design stage: remove one open facility and re-plan.{' '}
                <span className="font-medium text-ink3">Solved at base assumptions only.</span>
                {view.kind === 'grid' && ' Picking a disruption clears the stored-run selection.'}
            </p>
            {result}
            {error && (
                <div role="alert" className="mt-2.5 rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-900" data-testid="disrupt-error">
                    {error}
                    {authNeeded && (
                        <button
                            type="button"
                            onClick={() => void signInWithGoogle()}
                            className="pill-primary ml-2 py-0.5 text-sm"
                        >
                            Sign in with Google
                        </button>
                    )}
                </div>
            )}
            {!base ? (
                <div className="mt-1.5 text-ink2">No base run in the bundle.</div>
            ) : (
                <div className="mt-2.5" data-testid="disrupt-list">
                    <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.08]">
                        {idx.disruptMulti.map(multiRow)}
                        {ordered.slice(0, nVisibleSingles).map(singleRow)}
                    </ul>
                    {ordered.length > nVisibleSingles && (
                        <details className="mt-2" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
                            <summary className="text-base text-accent">
                                {ordered.length - nVisibleSingles} more open facilities
                            </summary>
                            <ul className="mt-1.5 divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.08]">{ordered.slice(nVisibleSingles).map(singleRow)}</ul>
                        </details>
                    )}
                </div>
            )}
            {busy && (
                <button type="button" onClick={() => abortRef.current?.abort()} className="pill-link mt-1.5 text-sm">
                    Cancel re-solve
                </button>
            )}
            {liveEnabled && !liveOk && <p className="mt-1.5 text-sm text-ink2">Solver API not reachable: stored results only.</p>}
        </div>
    );
}
