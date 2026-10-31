'use client';

// Scenario / Run panel. Live mode (solver URL set and /api/health ok): editable scenario and Run,
// which calls solve and baseline in parallel and hands the result to the page's setSolution, the
// same path stored runs use. Stored mode: radio buttons over the stored bundle, no Run.
import { useEffect, useMemo, useRef, useState } from 'react';
import { liveEnabled } from '../lib/api';
import { restorePendingInputs, savePendingInputs, signInWithGoogle, useSession } from '../lib/auth';
import { bundle, getSolution, siteById, slugs } from '../lib/bundle';
import { AIRPORTS, type BundleEntry, type CapacityBasis, type CollectionPolicy, type Solution } from '../lib/contract';
import { MISSING, orMissing, statusLabel } from '../lib/format';
import {
    asScenarioForm,
    buildScenarioFromForm,
    CANDIDATE_IDS,
    formFromScenario,
    HORIZON_OPTIONS,
    isCandidate,
    ROAD_FACTOR_OPTIONS,
    setCurrentForm,
    storedSlugOf,
    TIME_LIMIT_S,
    useLiveRunner,
    viewForEntry,
    YIELD_OPTIONS,
    type LiveRun,
    type ScenarioForm,
    type SolverHealth,
} from '../lib/useLive';
import type { View } from '../lib/view';

export interface ScenarioPanelProps {
    solution: Solution | null;
    health: SolverHealth;
    /** True only while the displayed solution is the live result. */
    isLive: boolean;
    setSolution: (s: Solution) => void;
    setView: (v: View) => void;
    /** Called with a finished live run; the page stores it and displays run.solution. */
    onLiveRun: (run: LiveRun) => void;
    /** Last map click (site id) with a counter, so clicking the same site twice toggles twice. */
    pickedNode?: { id: string; seq: number } | null;
}

const pctLabel = (v: number) => `${(v * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

function withCurrent(options: readonly number[], current: string): number[] {
    const c = Number(current);
    const list = [...options];
    if (current.trim() !== '' && Number.isFinite(c) && !list.some((o) => Math.abs(o - c) < 1e-12)) list.push(c);
    return list.sort((a, b) => a - b);
}

function Row({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-gray-600">{k}</span>
            <span className="text-right font-medium">{v}</span>
        </div>
    );
}

const fieldClass = 'w-full rounded border border-gray-400 bg-white px-2 py-1 text-sm';
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-600';

function StoredRuns({ solution, isLive, onPick, name }: { solution: Solution | null; isLive: boolean; onPick: (slug: string) => void; name: string }) {
    const current = isLive ? undefined : storedSlugOf(solution);
    const groups = useMemo(() => {
        const m = new Map<string, BundleEntry[]>();
        for (const slug of slugs()) {
            const e = bundle[slug];
            const fam = e.family ?? 'other';
            if (!m.has(fam)) m.set(fam, []);
            m.get(fam)!.push(e);
        }
        return [...m.entries()];
    }, []);
    if (groups.length === 0) return <div className="text-sm">No stored run in the bundle.</div>;
    return (
        <fieldset className="space-y-1" data-testid="stored-runs">
            {groups.map(([fam, entries]) => (
                <div key={fam}>
                    <div className="text-xs font-semibold uppercase text-gray-500">{fam}</div>
                    {entries.map((e) => (
                        <label key={e.slug} className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                                type="radio"
                                name={name}
                                value={e.slug}
                                checked={current === e.slug}
                                onChange={() => onPick(e.slug)}
                            />
                            <span>
                                {e.label ?? e.slug} <span className="text-gray-500">(stored{e.status ? `, ${e.status}` : ''})</span>
                            </span>
                        </label>
                    ))}
                </div>
            ))}
        </fieldset>
    );
}

export default function ScenarioPanel({ solution, health, isLive, setSolution, setView, onLiveRun, pickedNode }: ScenarioPanelProps) {
    const session = useSession();
    const [form, setForm] = useState<ScenarioForm>(() => formFromScenario(solution?.scenario));
    const [note, setNote] = useState<string | null>(null);
    const [pickMode, setPickMode] = useState(false);
    const [signInError, setSignInError] = useState<string | null>(null);
    const syncedRunId = useRef<string | null>(solution?.run_id ?? null);

    const runner = useLiveRunner(onLiveRun);
    const running = runner.state.phase === 'running';
    const liveMode = liveEnabled && (health.state === 'up' || running);

    // Inputs kept across the Google round trip.
    useEffect(() => {
        const pending = asScenarioForm(restorePendingInputs<unknown>());
        if (pending) {
            setForm(pending);
            setNote('Inputs restored after sign-in. Press Run.');
        }
    }, []);

    // Default the inputs to the displayed run's echoed scenario whenever the displayed run changes.
    useEffect(() => {
        const id = solution?.run_id ?? null;
        if (id === syncedRunId.current) return;
        syncedRunId.current = id;
        setForm(formFromScenario(solution?.scenario));
    }, [solution]);

    useEffect(() => {
        setCurrentForm(form);
    }, [form]);

    // Map click toggles a facility exclusion while pick mode is on.
    const lastSeq = useRef<number | null>(pickedNode?.seq ?? null);
    useEffect(() => {
        if (!pickedNode || pickedNode.seq === lastSeq.current) return;
        lastSeq.current = pickedNode.seq;
        if (!pickMode || !liveMode || running || !isCandidate(pickedNode.id)) return;
        const id = pickedNode.id;
        setForm((f) => ({
            ...f,
            excluded: f.excluded.includes(id) ? f.excluded.filter((x) => x !== id) : [...f.excluded, id],
        }));
    }, [pickedNode, pickMode, liveMode, running]);

    const { scenario, errors } = useMemo(() => buildScenarioFromForm(form), [form]);

    const pickStored = (slug: string) => {
        const s = getSolution(slug);
        if (!s) return;
        setSolution(s);
        setView(viewForEntry(bundle[slug]));
        runner.clear();
    };

    const startSignIn = async () => {
        setSignInError(null);
        try {
            await signInWithGoogle(form);
        } catch (err) {
            setSignInError(err instanceof Error ? err.message : 'Sign-in failed.');
        }
    };

    const onRun = () => {
        setNote(null);
        if (!scenario) return;
        if (session.status === 'signed_out') {
            savePendingInputs(form);
            runner.promptSignIn('Sign in with Google to run the solver. Your inputs are kept.');
            return;
        }
        void runner.run(scenario);
    };

    // Keep inputs if the API refused the session.
    useEffect(() => {
        if (runner.state.phase === 'auth') savePendingInputs(form);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runner.state.phase]);

    const setDemand = (a: (typeof AIRPORTS)[number], v: string) => setForm((f) => ({ ...f, demand: { ...f.demand, [a]: v } }));
    const candidatesLeft = CANDIDATE_IDS.filter((id) => !form.excluded.includes(id));
    const st = runner.state;

    return (
        <div className="space-y-2 text-sm" data-mode={liveMode ? 'live' : 'stored'}>
            {solution ? (
                <div>
                    <Row k="Showing" v={isLive ? `live result, run ID ${solution.run_id}` : `stored run (${solution.source})`} />
                    <Row k="Status" v={statusLabel(solution)} />
                    {!liveMode && (
                        <>
                            <Row k="Yield" v={orMissing(solution.scenario?.yield, (y: number) => pctLabel(y))} />
                            <Row k="Road factor" v={orMissing(solution.scenario?.road_factor)} />
                            <Row k="Horizon" v={orMissing(solution.scenario?.horizon_years, (h: number) => `${h} yr`)} />
                        </>
                    )}
                </div>
            ) : (
                <div>{MISSING}</div>
            )}

            {!liveMode && (
                <div className="space-y-1">
                    <div className="text-xs text-gray-600">
                        {!liveEnabled
                            ? 'No solver on this URL: stored runs only.'
                            : health.state === 'checking'
                              ? 'Checking the solver…'
                              : 'Solver offline: stored runs only. Run is unavailable.'}
                    </div>
                    <StoredRuns solution={solution} isLive={isLive} onPick={pickStored} name="stored-run" />
                </div>
            )}

            {liveMode && (
                <form
                    className="space-y-2"
                    data-testid="live-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onRun();
                    }}
                >
                    <fieldset disabled={running} className="space-y-2">
                        <div>
                            <span className={labelClass}>Demand, kt/yr (blank = full-production preset)</span>
                            <div className="mt-1 grid grid-cols-4 gap-1">
                                {AIRPORTS.map((a) => (
                                    <label key={a} className="text-xs">
                                        <span className="font-semibold">{a}</span>
                                        <input
                                            className={fieldClass}
                                            name={`demand-${a}`}
                                            inputMode="decimal"
                                            placeholder="preset"
                                            value={form.demand[a]}
                                            onChange={(e) => setDemand(a, e.target.value)}
                                        />
                                    </label>
                                ))}
                            </div>
                            {errors.demand && <div className="text-xs text-red-700">{errors.demand}</div>}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <label>
                                <span className={labelClass}>Yield</span>
                                <select className={fieldClass} name="yield" value={form.yieldValue} onChange={(e) => setForm((f) => ({ ...f, yieldValue: e.target.value }))}>
                                    {withCurrent(YIELD_OPTIONS, form.yieldValue).map((v) => (
                                        <option key={v} value={String(v)}>
                                            {pctLabel(v)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span className={labelClass}>Road factor</span>
                                <select className={fieldClass} name="road_factor" value={form.roadFactor} onChange={(e) => setForm((f) => ({ ...f, roadFactor: e.target.value }))}>
                                    {withCurrent(ROAD_FACTOR_OPTIONS, form.roadFactor).map((v) => (
                                        <option key={v} value={String(v)}>
                                            {v}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span className={labelClass}>Horizon</span>
                                <select className={fieldClass} name="horizon" value={form.horizon} onChange={(e) => setForm((f) => ({ ...f, horizon: e.target.value }))}>
                                    {withCurrent(HORIZON_OPTIONS, form.horizon).map((v) => (
                                        <option key={v} value={String(v)}>
                                            {v} yr
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        {(errors.yield || errors.road || errors.horizon) && (
                            <div className="text-xs text-red-700">{[errors.yield, errors.road, errors.horizon].filter(Boolean).join(' ')}</div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <label>
                                <span className={labelClass}>Collection</span>
                                <select
                                    className={fieldClass}
                                    name="collection"
                                    value={form.collection}
                                    onChange={(e) => setForm((f) => ({ ...f, collection: e.target.value as CollectionPolicy }))}
                                >
                                    <option value="all">all biomass</option>
                                    <option value="optional">optional</option>
                                </select>
                            </label>
                            <label>
                                <span className={labelClass}>Capacity basis</span>
                                <select
                                    className={fieldClass}
                                    name="capacity_basis"
                                    value={form.capacityBasis}
                                    onChange={(e) => setForm((f) => ({ ...f, capacityBasis: e.target.value as CapacityBasis }))}
                                >
                                    <option value="saf_output">SAF output</option>
                                    <option value="biomass_input">biomass input</option>
                                </select>
                            </label>
                        </div>

                        <div>
                            <span className={labelClass}>Excluded facility sites (unavailable at design stage)</span>
                            <div className="mt-1 flex flex-wrap gap-1" data-testid="excluded-list">
                                {form.excluded.length === 0 && <span className="text-xs text-gray-500">none</span>}
                                {form.excluded.map((id) => (
                                    <button
                                        key={id}
                                        type="button"
                                        className="rounded border border-gray-500 px-1 text-xs hover:bg-gray-100"
                                        title={`${siteById(id)?.label ?? id}: click to remove`}
                                        onClick={() => setForm((f) => ({ ...f, excluded: f.excluded.filter((x) => x !== id) }))}
                                    >
                                        {id} ×
                                    </button>
                                ))}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                                <select
                                    className={fieldClass}
                                    name="exclude-add"
                                    value=""
                                    onChange={(e) => {
                                        const id = e.target.value;
                                        if (id) setForm((f) => (f.excluded.includes(id) ? f : { ...f, excluded: [...f.excluded, id] }));
                                    }}
                                >
                                    <option value="">Exclude a site…</option>
                                    {candidatesLeft.map((id) => (
                                        <option key={id} value={id}>
                                            {siteById(id)?.label ?? id}
                                        </option>
                                    ))}
                                </select>
                                <label className="flex shrink-0 items-center gap-1 text-xs">
                                    <input type="checkbox" checked={pickMode} onChange={(e) => setPickMode(e.target.checked)} />
                                    pick on map
                                </label>
                            </div>
                            {errors.excluded && <div className="text-xs text-red-700">{errors.excluded}</div>}
                        </div>
                    </fieldset>

                    <div className="flex items-center gap-2">
                        {!running ? (
                            <button
                                type="submit"
                                data-testid="run-button"
                                disabled={!scenario}
                                className="rounded bg-sky-800 px-4 py-1.5 font-semibold text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Run
                            </button>
                        ) : (
                            <button type="button" onClick={runner.cancel} className="rounded border border-gray-500 px-3 py-1.5">
                                Cancel
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={running}
                            className="text-xs text-gray-600 underline disabled:opacity-50"
                            onClick={() => setForm(formFromScenario(solution?.scenario))}
                        >
                            reset to displayed run
                        </button>
                        <span className="ml-auto text-xs text-gray-500">r = 1, limit {TIME_LIMIT_S} s</span>
                    </div>
                </form>
            )}

            <div aria-live="polite" data-testid="run-status">
                {running && (
                    <div className="flex items-center gap-2 rounded border border-sky-700 bg-sky-50 px-2 py-1">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-800 border-t-transparent" aria-hidden="true" />
                        <span>
                            Solving and running the baseline… <span className="font-mono">{st.elapsedS.toFixed(1)} s</span>
                        </span>
                    </div>
                )}
                {st.phase === 'done' && (
                    <div className="rounded border border-gray-400 px-2 py-1">
                        New run ID <span className="font-mono font-semibold">{st.runId}</span> in {st.elapsedS.toFixed(1)} s.
                        {st.message && <div className="text-red-700">{st.message}</div>}
                    </div>
                )}
                {st.phase === 'infeasible' && (
                    <div className="rounded border border-gray-800 px-2 py-1">
                        No feasible network for these inputs (run ID <span className="font-mono">{st.runId}</span>). This is a solver
                        result, not an error.
                        {st.message && <div className="text-red-700">{st.message}</div>}
                    </div>
                )}
                {st.phase === 'error' && (
                    <div role="alert" className="rounded border border-red-700 bg-red-50 px-2 py-1 text-red-800">
                        {st.message}
                    </div>
                )}
                {st.phase === 'auth' && (
                    <div role="alert" data-testid="signin-prompt" className="space-y-1 rounded border border-gray-800 px-2 py-1">
                        <div>{st.message}</div>
                        {session.status === 'disabled' ? (
                            <div className="text-xs text-gray-600">Sign-in is not configured on this URL.</div>
                        ) : (
                            <button type="button" className="rounded border border-gray-500 px-3 py-1" onClick={() => void startSignIn()}>
                                Sign in with Google
                            </button>
                        )}
                        {signInError && <div className="text-red-700">{signInError}</div>}
                    </div>
                )}
                {note && st.phase === 'idle' && <div className="text-xs text-gray-700">{note}</div>}
            </div>

            {liveMode && (
                <details className="text-sm">
                    <summary className="cursor-pointer text-xs font-semibold uppercase text-gray-600">Stored runs ({slugs().length})</summary>
                    <StoredRuns solution={solution} isLive={isLive} onPick={pickStored} name="stored-run-live" />
                </details>
            )}
        </div>
    );
}
