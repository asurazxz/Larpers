'use client';

// Scenario / Run panel. Live mode (solver URL set and /api/health ok): editable scenario and Run,
// which calls solve and baseline in parallel and hands the result to the page's setSolution, the
// same path stored runs use. Stored mode: radio buttons over the stored bundle, no Run.
import { useEffect, useMemo, useRef, useState } from 'react';
import { liveEnabled } from '../lib/api';
import { restorePendingInputs, savePendingInputs, signInWithGoogle, useSession } from '../lib/auth';
import { bundle, getSolution, siteById, slugs } from '../lib/bundle';
import {
    AIRPORTS,
    DEFAULT_SCENARIO,
    type BundleEntry,
    type CapacityBasis,
    type CollectionPolicy,
    type Scenario,
    type Solution,
} from '../lib/contract';
import { runIndex } from '../lib/robustness';
import { MISSING, orMissing, statusLabel } from '../lib/format';
import Select from './Select';
import InfoTip, { INPUT_HELP } from './InfoTip';
import {
    asScenarioForm,
    buildScenarioFromForm,
    CANDIDATE_IDS,
    formFromScenario,
    HORIZON_OPTIONS,
    isCandidate,
    setCurrentForm,
    storedSlugOf,
    TIME_LIMIT_S,
    useLiveRunner,
    viewForEntry,
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

/** Organisers' base (challenge3_parameters.xlsx, 12:45 update): the form default when a run echoes no scenario. */
const ORGANISER_SCENARIO: Scenario = {
    ...DEFAULT_SCENARIO,
    demand_kt: { PNK: 300, PKN: 300, BPN: 300, TRK: 300 },
    yield: 0.2,
    road_factor: 1.3,
    horizon_years: 1,
    collection_policy: 'optional',
    capacity_basis: 'biomass_input',
};
/** Organisers' 15-25% yield range; stored runs' yields are added. */
const ORGANISER_YIELDS = [0.15, 0.2, 0.25];
/** 1.3 organisers' factor, 1.9 our measured OSM sensitivity. */
const ROAD_OPTIONS = [1.3, 1.9];

const formFor = (sc: Scenario | undefined | null): ScenarioForm => formFromScenario(sc ?? ORGANISER_SCENARIO);
/** Stored runs predate the 12:45 update, so the live form starts from the organisers' basis unless a live run is showing. */
const seedForm = (sol: Solution | null, live: boolean): ScenarioForm => formFor(live ? sol?.scenario : null);

function storedYields(): number[] {
    const out = [...ORGANISER_YIELDS];
    for (const r of runIndex().runs) {
        const y = r.params.yieldValue;
        if (y !== null && Number.isFinite(y) && !out.some((o) => Math.abs(o - y) < 1e-9)) out.push(y);
    }
    return out;
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
        <div className="flex justify-between gap-3 py-px">
            <span className="text-ink2">{k}</span>
            <span className="num text-right font-medium">{v}</span>
        </div>
    );
}

const fieldClass = 'field';
const labelClass = 'mb-0.5 block text-base font-medium text-ink2';

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
        <fieldset className="space-y-1.5" data-testid="stored-runs">
            {groups.map(([fam, entries]) => (
                <div key={fam}>
                    <div className="mb-1 text-base capitalize text-ink2">{fam}</div>
                    <div className="space-y-0.5 rounded-[12px] bg-track p-[3px]">
                        {entries.map((e) => {
                            const on = current === e.slug;
                            return (
                                <label
                                    key={e.slug}
                                    className={`flex cursor-pointer items-start gap-2.5 rounded-[9px] px-3 py-1 text-base leading-snug transition-colors duration-150 ${
                                        on ? 'bg-white shadow-thumb' : 'hover:bg-white/50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        className="mt-[5px] shrink-0"
                                        name={name}
                                        value={e.slug}
                                        checked={on}
                                        onChange={() => onPick(e.slug)}
                                    />
                                    <span className={on ? 'font-medium' : undefined}>
                                        {e.label ?? e.slug} <span className="font-normal text-ink2">(stored{e.status ? `, ${e.status}` : ''})</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            ))}
        </fieldset>
    );
}

export default function ScenarioPanel({ solution, health, isLive, setSolution, setView, onLiveRun, pickedNode }: ScenarioPanelProps) {
    const session = useSession();
    const [form, setForm] = useState<ScenarioForm>(() => seedForm(solution, isLive));
    const yieldOptions = useMemo(storedYields, []);
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

    // Re-seed the inputs whenever the displayed run changes: the live run's scenario, else the organisers' basis.
    useEffect(() => {
        const id = solution?.run_id ?? null;
        if (id === syncedRunId.current) return;
        syncedRunId.current = id;
        setForm(seedForm(solution, isLive));
    }, [solution, isLive]);

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

    // Run status, including the sign-in prompt. In live mode it sits right under the Run button.
    const statusBlock = (
        <div aria-live="polite" data-testid="run-status" className="empty:hidden">
            {running && (
                <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-1.5 text-blue-900">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
                    <span>
                        Solving and running the baseline… <span className="num font-medium">{st.elapsedS.toFixed(1)} s</span>
                    </span>
                </div>
            )}
            {st.phase === 'done' && (
                <div className="rounded-xl bg-canvas px-3 py-1.5">
                    New run ID <span className="num font-semibold">{st.runId}</span> in {st.elapsedS.toFixed(1)} s.
                    {st.message && <div className="text-red-700">{st.message}</div>}
                </div>
            )}
            {st.phase === 'infeasible' && (
                <div className="rounded-xl bg-canvas px-3 py-1.5">
                    No feasible network for these inputs (run ID <span className="num font-medium">{st.runId}</span>). This is a solver
                    result, not an error.
                    {st.message && <div className="text-red-700">{st.message}</div>}
                </div>
            )}
            {st.phase === 'error' && (
                <div role="alert" className="rounded-xl bg-red-50 px-3 py-1.5 text-red-800">
                    {st.message?.replace(/^Solver API error 422: /, 'Solver refused: ')}
                </div>
            )}
            {st.phase === 'auth' && (
                <div role="alert" data-testid="signin-prompt" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-blue-50 px-3 py-1.5 text-blue-900">
                    <div className="font-medium">{st.message}</div>
                    {session.status === 'disabled' ? (
                        <div className="text-ink3">Sign-in is not configured on this URL.</div>
                    ) : (
                        <button type="button" className="pill-primary py-0.5" onClick={() => void startSignIn()}>
                            Sign in with Google
                        </button>
                    )}
                    {signInError && <div className="text-red-700">{signInError}</div>}
                </div>
            )}
            {note && st.phase === 'idle' && <div className="text-ink3">{note}</div>}
        </div>
    );

    const showing = solution ? (
        <div>
            <Row k="Showing" v={isLive ? `live result, run ID ${solution.run_id}` : `stored run (${solution.source})`} />
            {!liveMode && (
                <Row
                    k="Scenario"
                    v={`yield ${orMissing(solution.scenario?.yield, (y: number) => pctLabel(y))}, road ${orMissing(
                        solution.scenario?.road_factor,
                    )}, H ${orMissing(solution.scenario?.horizon_years, (h: number) => `${h} yr`)}`}
                />
            )}
        </div>
    ) : (
        <div>{MISSING}</div>
    );

    return (
        <div className="space-y-2.5 text-base" data-mode={liveMode ? 'live' : 'stored'}>
            {/* The current control comes first (Run, or the stored-run choice); what is showing follows it. */}

            {!liveMode && statusBlock}

            {!liveMode && (
                <div className="space-y-2">
                    <div className="text-ink3">
                        {!liveEnabled
                            ? 'No solver on this URL: stored runs only.'
                            : health.state === 'checking'
                              ? 'Checking the solver…'
                              : 'Solver offline: stored runs only. Run is unavailable.'}
                    </div>
                    <StoredRuns solution={solution} isLive={isLive} onPick={pickStored} name="stored-run" />
                </div>
            )}

            {!liveMode && showing}

            {liveMode && (
                <form
                    className="space-y-2.5"
                    data-testid="live-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onRun();
                    }}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        {!running ? (
                            <button type="submit" data-testid="run-button" disabled={!scenario} className="pill-primary px-6">
                                Run
                            </button>
                        ) : (
                            <button type="button" onClick={runner.cancel} className="pill-secondary">
                                Cancel
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={running}
                            className="pill-link"
                            onClick={() => setForm(formFor(solution?.scenario))}
                        >
                            Reset to displayed run
                        </button>
                        <span className="ml-auto text-base text-ink2">r = 1, limit {TIME_LIMIT_S} s</span>
                    </div>
                    {statusBlock}
                    {showing}
                    <fieldset disabled={running} className="space-y-2.5">
                        <div>
                            <span className={labelClass}>
                                Demand, kt/yr (blank = solver default)
                                <InfoTip label="Airport demand">{INPUT_HELP.demand}</InfoTip>
                            </span>
                            <div className="grid grid-cols-4 gap-1.5">
                                {AIRPORTS.map((a) => (
                                    <label key={a} className="text-base text-ink2">
                                        <span className="font-semibold text-ink">{a}</span>
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
                            {errors.demand && <div className="text-sm text-red-700">{errors.demand}</div>}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <label>
                                <span className={labelClass}>
                                    Yield
                                    <InfoTip label="Yield">{INPUT_HELP.yield}</InfoTip>
                                </span>
                                <Select
                                    name="yield"
                                    ariaLabel="Yield"
                                    value={form.yieldValue}
                                    onValueChange={(v) => setForm((f) => ({ ...f, yieldValue: v }))}
                                    options={withCurrent(yieldOptions, form.yieldValue).map((v) => ({ value: String(v), label: pctLabel(v) }))}
                                />
                            </label>
                            <label>
                                <span className={labelClass}>
                                    Road factor
                                    <InfoTip label="Road factor">{INPUT_HELP.road}</InfoTip>
                                </span>
                                <Select
                                    name="road_factor"
                                    ariaLabel="Road factor"
                                    value={form.roadFactor}
                                    onValueChange={(v) => setForm((f) => ({ ...f, roadFactor: v }))}
                                    options={withCurrent(ROAD_OPTIONS, form.roadFactor).map((v) => ({ value: String(v), label: String(v) }))}
                                />
                            </label>
                            <label>
                                <span className={labelClass}>
                                    Horizon (yr)
                                    <InfoTip label="Horizon">{INPUT_HELP.horizon}</InfoTip>
                                </span>
                                <Select
                                    name="horizon"
                                    ariaLabel="Horizon (yr)"
                                    value={form.horizon}
                                    onValueChange={(v) => setForm((f) => ({ ...f, horizon: v }))}
                                    options={withCurrent(HORIZON_OPTIONS, form.horizon).map((v) => ({ value: String(v), label: `${v} yr` }))}
                                />
                            </label>
                        </div>
                        <div className="text-base text-ink2" data-testid="cost-basis">
                            Cost basis: per year (annualised)
                        </div>
                        {(errors.yield || errors.road || errors.horizon) && (
                            <div className="text-sm text-red-700">{[errors.yield, errors.road, errors.horizon].filter(Boolean).join(' ')}</div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <label>
                                <span className={labelClass}>
                                    Collection
                                    <InfoTip label="Collection">{INPUT_HELP.collection}</InfoTip>
                                </span>
                                <Select
                                    name="collection"
                                    ariaLabel="Collection"
                                    value={form.collection}
                                    onValueChange={(v) => setForm((f) => ({ ...f, collection: v as CollectionPolicy }))}
                                    options={[
                                        { value: 'all', label: 'all biomass' },
                                        { value: 'optional', label: 'optional' },
                                    ]}
                                />
                            </label>
                            <label>
                                <span className={labelClass}>
                                    Capacity basis
                                    <InfoTip label="Capacity basis">{INPUT_HELP.capacity}</InfoTip>
                                </span>
                                <Select
                                    name="capacity_basis"
                                    ariaLabel="Capacity basis"
                                    value={form.capacityBasis}
                                    onValueChange={(v) => setForm((f) => ({ ...f, capacityBasis: v as CapacityBasis }))}
                                    options={[
                                        { value: 'saf_output', label: 'SAF output' },
                                        { value: 'biomass_input', label: 'biomass input' },
                                    ]}
                                />
                            </label>
                        </div>

                        <div>
                            <span className={labelClass}>
                                Excluded facility sites (unavailable at design stage)
                                <InfoTip label="Excluded sites">{INPUT_HELP.excluded}</InfoTip>
                            </span>
                            <div className="flex flex-wrap gap-1.5" data-testid="excluded-list">
                                {form.excluded.length === 0 && <span className="text-base text-ink2">none</span>}
                                {form.excluded.map((id) => (
                                    <button
                                        key={id}
                                        type="button"
                                        className="rounded-full bg-track px-2.5 text-base text-ink hover:bg-gray-300"
                                        title={`${siteById(id)?.label ?? id}: click to remove`}
                                        onClick={() => setForm((f) => ({ ...f, excluded: f.excluded.filter((x) => x !== id) }))}
                                    >
                                        {id} ×
                                    </button>
                                ))}
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                                <Select
                                    name="exclude-add"
                                    ariaLabel="Exclude a site"
                                    value=""
                                    placeholder="Exclude a site…"
                                    onValueChange={(id) => {
                                        if (id) setForm((f) => (f.excluded.includes(id) ? f : { ...f, excluded: [...f.excluded, id] }));
                                    }}
                                    options={candidatesLeft.map((id) => ({ value: id, label: siteById(id)?.label ?? id }))}
                                />
                                <label className="flex shrink-0 items-center gap-1.5 text-base text-ink3">
                                    <input type="checkbox" checked={pickMode} onChange={(e) => setPickMode(e.target.checked)} />
                                    pick on map
                                </label>
                            </div>
                            {errors.excluded && <div className="text-sm text-red-700">{errors.excluded}</div>}
                        </div>
                    </fieldset>
                </form>
            )}

            {liveMode && (
                <details className="hair-t pt-2">
                    <summary className="text-base text-ink2">Stored runs ({slugs().length})</summary>
                    <div className="mt-1.5">
                        <StoredRuns solution={solution} isLive={isLive} onPick={pickStored} name="stored-run-live" />
                    </div>
                </details>
            )}
        </div>
    );
}
