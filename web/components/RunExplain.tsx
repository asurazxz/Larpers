'use client';

// The AI explanation of the run on screen, for the workspace pages. The solver decided everything; Gemini only words it.
import ExplainButton from './ExplainButton';
import { explainInput, fixedText } from '../lib/explain';
import { explanationFor } from '../lib/explanations';
import { useApp } from '../lib/store';

export default function RunExplain() {
    const { solution, baseline } = useApp();
    const input = solution ? explainInput(solution, baseline) : null;
    if (!solution || !input) return null;
    return (
        <section id="ai-explanation" className="rounded-xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-[15px] font-bold text-deep">AI explanation</h2>
            <p className="mt-0.5 mb-2 text-[13px] text-muted">Gemini explains this run in plain English. The solver made every decision.</p>
            <ExplainButton key={solution.run_id} id="explain" input={input} fixedText={fixedText(input)} stored={explanationFor(solution)} />
        </section>
    );
}
