import type { ScenarioForm } from '../../lib/useLive';

const KEY = 'larpers.planner.saved';
export interface SavedScenario { name: string; form: ScenarioForm; at: string }

export function listSaved(): SavedScenario[] {
    try {
        const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

export function saveScenario(name: string, form: ScenarioForm): SavedScenario[] {
    const next = [...listSaved().filter((s) => s.name !== name), { name, form, at: new Date().toISOString() }];
    try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        /* storage unavailable */
    }
    return next;
}
