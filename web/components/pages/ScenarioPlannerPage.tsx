'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { liveEnabled } from '../../lib/api';
import { savePendingInputs, signInWithGoogle, useSession } from '../../lib/auth';
import { bundle, siteById, slugs } from '../../lib/bundle';
import { AIRPORTS, DEFAULT_SCENARIO } from '../../lib/contract';
import { useApp } from '../../lib/store';
import {
    buildScenarioFromForm,
    CANDIDATE_IDS,
    formFromScenario,
    getCurrentForm,
    isCandidate,
    setCurrentForm,
    storedSlugOf,
    TIME_LIMIT_S,
    useLiveRunner,
    viewForEntry,
    type ScenarioForm,
} from '../../lib/useLive';
import { PageHeader } from '../common/ui';

const STEPS = ['Demand & Supply', 'Conversion & Logistics', 'Facilities', 'Planning Settings', 'Review & Run'] as const;
const OFFICIAL_DEMAND = 300;
const OFFICIAL = { yield: 0.2, road: 1.3, horizon: 1 };

const sameNum = (s: string, n: number) => s.trim() !== '' && Math.abs(Number(s) - n) < 1e-9;

function Tag({ official }: { official: boolean }) {
    return (
        <span className={`chip ${official ? 'bg-green-50 text-success' : 'bg-amber-50 text-warning'}`}>
            {official ? 'Official' : 'Assumption'}
        </span>
    );
}

function Field({ label, hint, tag, error, children }: { label: string; hint?: string; tag?: boolean; error?: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="mb-1 flex items-center gap-2">
                <label className="text-sm font-medium text-deep">{label}</label>
                {tag !== undefined && <Tag official={tag} />}
            </div>
            {children}
            {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
            {error && <div className="mt-1 text-xs text-danger" role="alert">{error}</div>}
        </div>
    );
}

export default function ScenarioPlannerPage() {
    const { solution, selectView, solverHealth, isLive, onLiveRun, pickedNode, setDirty, go } = useApp();
    const session = useSession();

    const displayed = useMemo(() => formFromScenario(solution?.scenario), [solution]);
    const [form, setForm] = useState<ScenarioForm>(() => getCurrentForm() ?? displayed);
    const [step, setStep] = useState(0);
    const [search, setSearch] = useState('');
    const [signInError, setSignInError] = useState<string | null>(null);

    const runner = useLiveRunner((run) => {
        onLiveRun(run);
        go('results');
    });
    const st = runner.state;
    const running = st.phase === 'running';
    const liveMode = liveEnabled && (solverHealth.state === 'up' || running);

    const { scenario, errors } = useMemo(() => buildScenarioFromForm(form), [form]);
    const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(displayed), [form, displayed]);

    useEffect(() => {
        setCurrentForm(form);
        setDirty(dirty);
    }, [form, dirty, setDirty]);

    useEffect(() => {
        if (st.phase === 'auth') savePendingInputs(form);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [st.phase]);

    const lastSeq = useRef<number | null>(pickedNode?.seq ?? null);
    const [picked, setPicked] = useState<string | null>(null);
    useEffect(() => {
        if (!pickedNode || pickedNode.seq === lastSeq.current) return;
        lastSeq.current = pickedNode.seq;
        setPicked(isCandidate(pickedNode.id) ? pickedNode.id : null);
    }, [pickedNode]);

    const upd = (patch: Partial<ScenarioForm>) => setForm((f) => ({ ...f, ...patch }));
    const toggleExcluded = (id: string) =>
        setForm((f) => ({ ...f, excluded: f.excluded.includes(id) ? f.excluded.filter((x) => x !== id) : [...f.excluded, id] }));

    const chip = running
        ? { t: 'Solving', c: 'bg-blue-50 text-primary' }
        : st.phase === 'error' || st.phase === 'auth'
          ? { t: 'Failed', c: 'bg-red-50 text-danger' }
          : st.phase === 'infeasible'
            ? { t: 'Infeasible', c: 'bg-amber-50 text-warning' }
            : dirty
              ? { t: 'Unsaved changes', c: 'bg-amber-50 text-warning' }
              : st.phase === 'done'
                ? { t: 'Completed', c: 'bg-green-50 text-success' }
                : { t: 'Saved', c: 'bg-green-50 text-success' };

    const onRun = () => {
        if (!scenario) return;
        if (session.status === 'signed_out') {
            savePendingInputs(form);
            runner.promptSignIn('Sign in with Google to run the solver. Your inputs are kept.');
            return;
        }
        void runner.run(scenario);
    };
    const startSignIn = async () => {
        setSignInError(null);
        try {
            await signInWithGoogle(form);
        } catch (err) {
            setSignInError(err instanceof Error ? err.message : 'Sign-in failed.');
        }
    };
    const reset = () => {
        if (window.confirm('Discard your edits and reset the inputs to the displayed run?')) {
            setForm(displayed);
            runner.clear();
        }
    };

    const filteredIds = useMemo(() => {
        const q = search.trim().toLowerCase();
        return CANDIDATE_IDS.filter((id) => !q || id.toLowerCase().includes(q) || (siteById(id)?.label ?? '').toLowerCase().includes(q) || (siteById(id)?.province ?? '').toLowerCase().includes(q));
    }, [search]);

    const demandVals = AIRPORTS.map((a) => (form.demand[a].trim() === '' ? null : Number(form.demand[a])));
    const maxDemand = Math.max(OFFICIAL_DEMAND, ...demandVals.map((v) => (v !== null && Number.isFinite(v) ? v : 0)));
    const demandTotal = demandVals.reduce<number>((s, v) => s + (v !== null && Number.isFinite(v) ? v : 0), 0);

    const editBtn = (n: number) => (
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => setStep(n)}>Edit</button>
    );

    const demandLabel = (a: (typeof AIRPORTS)[number]) => (form.demand[a].trim() === '' ? 'preset (blank)' : `${form.demand[a]} kt/yr`);
    const reviewRows: { k: string; v: string; step: number }[] = [
        ...AIRPORTS.map((a) => ({ k: `Demand ${a}`, v: demandLabel(a), step: 0 })),
        { k: 'Collection policy', v: form.collection, step: 0 },
        { k: 'SAF yield', v: form.yieldValue, step: 1 },
        { k: 'Road factor', v: form.roadFactor, step: 1 },
        { k: 'Horizon', v: `${form.horizon} yr`, step: 1 },
        { k: 'Excluded sites', v: form.excluded.length ? form.excluded.join(', ') : 'none', step: 2 },
        { k: 'Capacity basis', v: form.capacityBasis, step: 3 },
        { k: 'Solver time limit', v: `${TIME_LIMIT_S} s`, step: 3 },
    ];

    const pickStored = (slug: string) => {
        const e = bundle[slug];
        const sol = e?.solution ?? (e as unknown as typeof solution);
        if (!e || !sol) return;
        selectView(viewForEntry(e), sol);
        const f = formFromScenario(sol.scenario);
        setForm(f);
        runner.clear();
    };
    const currentSlug = isLive ? undefined : storedSlugOf(solution);

    const solverNote = !liveEnabled
        ? 'No solver is configured on this URL (NEXT_PUBLIC_SOLVER_API_URL is unset), so inputs cannot be run live.'
        : solverHealth.state === 'checking'
          ? 'Checking the solver. Run is unavailable until it responds.'
          : 'The solver is offline. Run is unavailable; start it with uvicorn api.main:app --port 8000.';

    // ---------- step content ----------
    const content = [
        // 1
        <div key="s1" className="space-y-5">
            <div>
                <h3 className="text-base font-semibold text-deep">Airport demand, kt SAF per year</h3>
                <p className="mt-1 text-sm text-muted">Official (12:45 update): 300 kt per airport, 1,200 kt total. Leave all four blank to use the full-production preset.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                {AIRPORTS.map((a) => (
                    <Field key={a} label={a} tag={sameNum(form.demand[a], OFFICIAL_DEMAND)} hint="Official (12:45 update): 300">
                        <input
                            className="input num w-full"
                            inputMode="decimal"
                            placeholder="blank = preset"
                            value={form.demand[a]}
                            onChange={(e) => upd({ demand: { ...form.demand, [a]: e.target.value } })}
                        />
                    </Field>
                ))}
            </div>
            {errors.demand && <div className="text-sm text-danger" role="alert">{errors.demand}</div>}
            <div className="rounded-xl border border-line p-4">
                <div className="mb-2 flex justify-between text-sm"><span className="font-medium text-deep">Demand summary</span><span className="num text-muted">{demandTotal} kt total</span></div>
                <div className="space-y-2">
                    {AIRPORTS.map((a, i) => {
                        const v = demandVals[i];
                        const w = v !== null && Number.isFinite(v) ? Math.min(100, (v / maxDemand) * 100) : 0;
                        return (
                            <div key={a} className="flex items-center gap-3 text-sm">
                                <span className="w-10 font-medium text-deep">{a}</span>
                                <div className="h-2.5 flex-1 rounded bg-app"><div className="h-2.5 rounded bg-primary" style={{ width: `${w}%` }} /></div>
                                <span className="num w-20 text-right text-muted">{v === null ? 'preset' : `${v} kt`}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            <Field label="Biomass collection policy" hint="All: every supply site must be fully collected. Optional: the solver may leave biomass uncollected.">
                <select className="input w-full sm:w-64" value={form.collection} onChange={(e) => upd({ collection: e.target.value as ScenarioForm['collection'] })}>
                    <option value="all">All biomass collected</option>
                    <option value="optional">Collection optional</option>
                </select>
            </Field>
        </div>,
        // 2
        <div key="s2" className="space-y-5">
            <h3 className="text-base font-semibold text-deep">Conversion and logistics</h3>
            <Field label="SAF yield (fraction of biomass)" tag={sameNum(form.yieldValue, OFFICIAL.yield)} hint="Official: 0.20 (organisers' range 15-25%)." error={errors.yield}>
                <input className="input num w-full sm:w-64" inputMode="decimal" value={form.yieldValue} onChange={(e) => upd({ yieldValue: e.target.value })} />
            </Field>
            <Field label="Road factor (x great-circle distance)" tag={sameNum(form.roadFactor, OFFICIAL.road)} hint="Official: 1.3. 1.9 is our own OSM measurement, kept as a sensitivity." error={errors.road}>
                <input className="input num w-full sm:w-64" inputMode="decimal" value={form.roadFactor} onChange={(e) => upd({ roadFactor: e.target.value })} />
            </Field>
            <Field label="Planning horizon (years)" tag={sameNum(form.horizon, OFFICIAL.horizon)} hint="Official basis is one year; CapEx straight-line over 20 years." error={errors.horizon}>
                <input className="input num w-full sm:w-64" inputMode="numeric" value={form.horizon} onChange={(e) => upd({ horizon: e.target.value })} />
            </Field>
            <p className="text-xs text-muted">Default solver contract values: yield {DEFAULT_SCENARIO.yield}, road factor {DEFAULT_SCENARIO.road_factor}. Depots lose no mass (retention fixed at 1).</p>
        </div>,
        // 3
        <div key="s3" className="space-y-4">
            <div>
                <h3 className="text-base font-semibold text-deep">Facility candidates</h3>
                <p className="mt-1 text-sm text-muted">Tick a site to exclude it from hosting a depot or refinery. {form.excluded.length} of {CANDIDATE_IDS.length} excluded.</p>
            </div>
            {picked && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-deep">
                    <span>Selected on the map: <b>{picked}</b> {siteById(picked)?.label}</span>
                    <button type="button" className="btn-secondary" onClick={() => toggleExcluded(picked)}>
                        {form.excluded.includes(picked) ? `Include ${picked}` : `Exclude ${picked}`}
                    </button>
                </div>
            )}
            {errors.excluded && <div className="text-sm text-danger" role="alert">{errors.excluded}</div>}
            <div className="flex flex-wrap items-center gap-3">
                <input className="input w-full sm:w-72" placeholder="Search id, name or province" value={search} onChange={(e) => setSearch(e.target.value)} />
                {form.excluded.length > 0 && <button type="button" className="btn-secondary" onClick={() => upd({ excluded: [] })}>Clear exclusions</button>}
            </div>
            <div className="max-h-[360px] overflow-auto rounded-xl border border-line">
                {filteredIds.length === 0 && <div className="p-4 text-sm text-muted">No site matches.</div>}
                {filteredIds.map((id) => {
                    const s = siteById(id);
                    return (
                        <label key={id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-1.5 text-sm last:border-0 hover:bg-app">
                            <input type="checkbox" checked={form.excluded.includes(id)} onChange={() => toggleExcluded(id)} />
                            <span className="num w-24 font-medium text-deep">{id}</span>
                            <span className="flex-1 truncate text-muted">{s?.label}{s?.province ? `, ${s.province}` : ''}</span>
                        </label>
                    );
                })}
            </div>
        </div>,
        // 4
        <div key="s4" className="space-y-5">
            <h3 className="text-base font-semibold text-deep">Planning settings</h3>
            <Field label="Capacity basis" hint="Official: capacity is biomass intake for depots and refineries. SAF output is our earlier interpretation.">
                <select className="input w-full sm:w-64" value={form.capacityBasis} onChange={(e) => upd({ capacityBasis: e.target.value as ScenarioForm['capacityBasis'] })}>
                    <option value="biomass_input">Biomass input</option>
                    <option value="saf_output">SAF output</option>
                </select>
            </Field>
            <details className="rounded-xl border border-line p-4">
                <summary className="cursor-pointer text-sm font-medium text-deep">Advanced (fixed by the app)</summary>
                <dl className="mt-3 space-y-1 text-sm text-muted">
                    <div className="flex justify-between"><dt>Solver time limit</dt><dd className="num">{TIME_LIMIT_S} s</dd></div>
                    <div className="flex justify-between"><dt>Depot retention</dt><dd className="num">1</dd></div>
                </dl>
            </details>
        </div>,
        // 5
        <div key="s5" className="space-y-4">
            <h3 className="text-base font-semibold text-deep">Review and run</h3>
            <table className="tbl w-full text-sm">
                <thead><tr><th className="text-left">Input</th><th className="text-left">Value</th><th /></tr></thead>
                <tbody>
                    {reviewRows.map((r) => (
                        <tr key={r.k}><td>{r.k}</td><td className="num break-words">{r.v}</td><td className="text-right">{editBtn(r.step)}</td></tr>
                    ))}
                </tbody>
            </table>
            {Object.keys(errors).length > 0 && (
                <ul className="list-disc rounded-xl bg-red-50 px-6 py-2 text-sm text-danger" role="alert">
                    {Object.values(errors).map((e) => <li key={e}>{e}</li>)}
                </ul>
            )}
            {running && (
                <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm text-deep">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
                    Solving and running the baseline... <span className="num font-medium">{st.elapsedS.toFixed(1)} s</span>
                </div>
            )}
            {st.phase === 'done' && <div className="rounded-xl bg-green-50 px-3 py-2 text-sm text-deep">New run ID <span className="num font-semibold">{st.runId}</span> in {st.elapsedS.toFixed(1)} s.{st.message && <div className="text-danger">{st.message}</div>}</div>}
            {st.phase === 'infeasible' && <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-deep">The solver could not find a feasible network for these inputs (run ID <span className="num">{st.runId}</span>). This is a solver result, not an error.</div>}
            {st.phase === 'error' && <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{st.message}</div>}
            {st.phase === 'auth' && (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-deep">
                    <span className="font-medium">{st.message}</span>
                    {session.status === 'disabled' ? (
                        <span className="text-muted">Sign-in is not configured on this URL.</span>
                    ) : (
                        <button type="button" className="btn-primary" onClick={() => void startSignIn()}>Sign in with Google</button>
                    )}
                    {signInError && <span className="text-danger">{signInError}</span>}
                </div>
            )}
            {liveMode ? (
                <div className="flex flex-wrap items-center gap-3">
                    {!running ? (
                        <button type="button" className="btn-primary" disabled={!scenario} onClick={onRun}>Run solver</button>
                    ) : (
                        <button type="button" className="btn-secondary" onClick={runner.cancel}>Cancel</button>
                    )}
                    <button type="button" className="btn-secondary" disabled={running || !dirty} onClick={reset}>Reset to displayed run</button>
                    <span className="text-xs text-muted">r = 1, limit {TIME_LIMIT_S} s</span>
                </div>
            ) : (
                <div className="space-y-3 rounded-xl border border-line p-4">
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-deep">{solverNote} You can still view the stored runs below.</div>
                    <div className="text-sm font-medium text-deep">Stored runs</div>
                    <div className="max-h-[240px] space-y-1 overflow-auto">
                        {slugs().map((slug) => {
                            const e = bundle[slug];
                            return (
                                <label key={slug} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-app">
                                    <input type="radio" name="planner-stored" checked={currentSlug === slug} onChange={() => pickStored(slug)} />
                                    <span>{e.label ?? slug}</span>
                                    <span className="chip text-muted">{e.status}</span>
                                </label>
                            );
                        })}
                    </div>
                    <button type="button" className="btn-secondary" disabled={!dirty} onClick={reset}>Reset to displayed run</button>
                </div>
            )}
        </div>,
    ];

    return (
        <div className="p-6 lg:p-8">
            <PageHeader
                title="Scenario Planner"
                subtitle="Set the inputs step by step, then run the solver."
                actions={<span className={`chip ${chip.c}`} data-testid="planner-status">{chip.t}</span>}
            />
            <div className="flex flex-col gap-6 lg:flex-row">
                <nav aria-label="Planner steps" className="w-full shrink-0 lg:w-[260px]">
                    <ol className="space-y-1 rounded-xl border border-line bg-white p-2 shadow-sm">
                        {STEPS.map((label, i) => (
                            <li key={label}>
                                <button
                                    type="button"
                                    onClick={() => setStep(i)}
                                    aria-current={step === i ? 'step' : undefined}
                                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${step === i ? 'bg-blue-50 font-semibold text-primary' : 'text-navy hover:bg-app'}`}
                                >
                                    <span className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${step === i ? 'bg-primary text-white' : 'bg-app text-muted'}`}>{i + 1}</span>
                                    {label}
                                </button>
                            </li>
                        ))}
                    </ol>
                </nav>
                <section className="min-w-0 flex-1 rounded-xl border border-line bg-white p-5 shadow-sm">
                    <fieldset disabled={running} className="min-w-0">{content[step]}</fieldset>
                    <div className="mt-6 flex justify-between border-t border-line pt-4">
                        <button type="button" className="btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
                        {step < STEPS.length - 1 && <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>Next</button>}
                    </div>
                </section>
            </div>
        </div>
    );
}
