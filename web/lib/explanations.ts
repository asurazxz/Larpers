// Stored paragraphs from solver/explain.py, statically imported so the build works on file:// with no fetch.
import rawExplanations from '../data/explanations.json';
import type { Solution } from './contract';

export interface Explanation {
    slug: string;
    run_id: string;
    data_hash: string;
    scenario_hash: string;
    text: string;
    model: string;
    generated_at: string;
}

const stored = (rawExplanations as unknown as { runs?: Record<string, Explanation> }).runs ?? {};

/** The paragraph for exactly this run, or null. A rerun changes the hashes, so a stale paragraph never shows. */
export function explanationFor(solution: Solution | null | undefined): Explanation | null {
    if (!solution) return null;
    return (
        Object.values(stored).find(
            (e) =>
                e.run_id === solution.run_id &&
                e.data_hash === solution.data_hash &&
                e.scenario_hash === solution.scenario_hash,
        ) ?? null
    );
}
