'use client';

// Plain-language explanation of a finished live run (POST /api/explain). The API builds the facts
// from the run, Gemini writes text citing them, and the API withholds any number it cannot verify.
import { useEffect, useState } from 'react';
import { ApiError, explain, type Explanation as Result, type ExplainFact } from '../lib/api';
import type { LiveRun } from '../lib/useLive';

const FOOTER =
    "Explained by Gemini from this run's numbers. Every number was checked against the run; the solver made every decision.";

type State =
    | { runId: string; status: 'loading' }
    | { runId: string; status: 'done'; result: Result }
    | { runId: string; status: 'unavailable'; reason: string };

// One request per run_id for the page's lifetime, shared across remounts.
const requests = new Map<string, Promise<State>>();

function reasonFor(err: unknown): string {
    if (err instanceof ApiError) {
        if (err.kind === 'timeout') return 'Explanation unavailable: no answer within 30 s.';
        if (err.status === 404) return 'Explanations unavailable on this solver API.';
        if (err.status === 503 || err.status === 502) return err.message;
        return `Explanation unavailable: ${err.message}`;
    }
    return 'Explanation unavailable.';
}

function request(run: LiveRun): Promise<State> {
    const runId = run.solution.run_id;
    let req = requests.get(runId);
    if (!req) {
        req = explain(run.scenario, run.solution, run.baseline).then(
            (result): State => ({ runId, status: 'done', result }),
            (err): State => ({ runId, status: 'unavailable', reason: reasonFor(err) }),
        );
        requests.set(runId, req);
    }
    return req;
}

function Chip({ fact }: { fact: ExplainFact }) {
    return (
        <span className="inline-flex items-baseline gap-1.5 rounded-full bg-track px-2.5 py-[1px] text-sm leading-snug" title={fact.id}>
            <span className="text-ink2">{fact.label}</span>
            <span className="num font-medium text-ink">{fact.value}</span>
        </span>
    );
}

export default function Explanation({ run }: { run: LiveRun }) {
    const runId = run.solution.run_id;
    const [state, setState] = useState<State>({ runId, status: 'loading' });

    useEffect(() => {
        let alive = true;
        setState({ runId, status: 'loading' });
        void request(run).then((s) => {
            if (alive) setState(s);
        });
        return () => {
            alive = false;
        };
        // One request per run_id; the run object for a given run_id never changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runId]);

    if (state.status !== 'done' || !state.result.available) {
        const line =
            state.status === 'loading'
                ? 'Writing an explanation of this run…'
                : state.status === 'unavailable'
                  ? state.reason
                  : (state.result as { reason: string }).reason;
        return (
            <section id="panel-explanation" className="card px-5 py-2.5 text-base leading-snug text-ink2" data-state={state.status} aria-live="polite">
                {line}
            </section>
        );
    }

    const r = state.result;
    const byId = new Map(r.facts.map((f) => [f.id, f]));
    return (
        <section id="panel-explanation" className="card px-5 py-3.5" data-state="done" data-model={r.model} aria-live="polite">
            <h2 className="flex items-baseline justify-between gap-3">
                <span className="card-title">What this run shows</span>
                <span className="text-base text-ink2">Checked</span>
            </h2>
            <p className="mt-1.5 text-base font-semibold leading-snug text-ink">{r.headline}</p>
            <ul className="mt-2 space-y-2.5">
                {r.points.map((p, i) => (
                    <li key={i}>
                        <p className="text-base leading-snug text-ink">{p.text}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                            {p.fact_ids.map((id) => {
                                const fact = byId.get(id);
                                return fact ? <Chip key={id} fact={fact} /> : null;
                            })}
                        </div>
                    </li>
                ))}
            </ul>
            {r.caveat && <p className="mt-2 text-base leading-snug text-ink2">{r.caveat}</p>}
            <p className="hair-t mt-2 pt-1.5 text-sm leading-snug text-ink2">{FOOTER}</p>
        </section>
    );
}
