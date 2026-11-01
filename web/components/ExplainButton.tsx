'use client';

// One button that says what the numbers beside it mean in everyday words. Gemini words it when it can, and the
// fixed wording shows otherwise, so a click always gets an answer. The solver made every decision.
import { useEffect, useRef, useState } from 'react';
import { liveEnabled, plainEnglish, PLAIN_ENGLISH_TIMEOUT_MS } from '../lib/api';
import type { ExplainInput } from '../lib/explain';
import type { Explanation } from '../lib/explanations';

interface Shown {
    text: string;
    note: string;
}

async function wordingFor(input: ExplainInput, fixedText: string, signal: AbortSignal): Promise<Shown> {
    const fixed = (note: string): Shown => ({ text: fixedText, note });
    if (!liveEnabled) return fixed('Standard wording. Gemini is not available on this page.');
    // A backstop in case the request's own timeout never fires, so the click always gets an answer.
    const limit = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('timed out')), PLAIN_ENGLISH_TIMEOUT_MS + 2_000);
    });
    try {
        const { text, model } = await Promise.race([plainEnglish(input, { signal }), limit]);
        if (text) return { text, note: `Worded by ${model}. The solver made every decision, and every figure comes from this run.` };
        return fixed('Standard wording. Gemini did not answer in time.');
    } catch {
        return fixed('Standard wording. Gemini could not be reached.');
    }
}

export interface ExplainButtonProps {
    /** Element id, and the prefix of the ids inside it. */
    id: string;
    input: ExplainInput;
    /** The same figures in fixed words, shown when Gemini gives nothing. */
    fixedText: string;
    /** A checked paragraph stored for this run, shown instead of calling Gemini. */
    stored?: Explanation | null;
}

export default function ExplainButton({ id, input, fixedText, stored }: ExplainButtonProps) {
    const [busy, setBusy] = useState(false);
    const [shown, setShown] = useState<Shown | null>(null);
    const controller = useRef<AbortController | null>(null);
    const result = useRef<HTMLDivElement | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    useEffect(() => {
        if (shown) result.current?.scrollIntoView({ block: 'nearest' });
    }, [shown]);

    const press = async () => {
        if (shown) {
            setShown(null);
            return;
        }
        if (stored) {
            setShown({ text: stored.text, note: `Stored text worded by ${stored.model}. The solver made every decision, and every figure comes from this run.` });
            return;
        }
        const ctl = new AbortController();
        controller.current = ctl;
        setBusy(true);
        const wording = await wordingFor(input, fixedText, ctl.signal);
        if (ctl.signal.aborted) return;
        setShown(wording);
        setBusy(false);
    };

    return (
        <div id={id} className="hair-t mt-1.5 pt-2">
            <button type="button" id={`${id}-button`} className="pill-secondary w-full font-sans" disabled={busy} aria-expanded={!!shown} onClick={() => void press()}>
                {busy ? 'Explaining…' : shown ? 'Hide explanation' : 'Explain in plain English'}
            </button>
            <div aria-live="polite">
                {shown && (
                    <div id={`${id}-result`} ref={result} className="mt-2">
                        <p id={`${id}-text`} className="leading-snug text-ink">
                            {shown.text}
                        </p>
                        <p id={`${id}-note`} className="mt-1 text-sm leading-tight text-ink3">
                            {shown.note}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
