'use client';

// Title, run label, solver badge and sign-in. /api/health decides the badge; a stored run is
// always labelled stored, even when the solver is up.
import AuthButton from './AuthButton';
import { getEntry, storedRunCount } from '../lib/bundle';
import type { Solution } from '../lib/contract';
import { MISSING, seconds, statusLabel } from '../lib/format';
import { getCurrentForm, storedSlugOf, type SolverHealth } from '../lib/useLive';
import { viewLabel, type View } from '../lib/view';

export interface HeaderProps {
    solution: Solution | null;
    view: View;
    health: SolverHealth;
    /** True only while the displayed solution is the live result. */
    isLive: boolean;
}

function badgeFor(health: SolverHealth, isLive: boolean): { text: string; className: string; title: string } {
    const stored = `STORED RUN: ${storedRunCount()} stored runs`;
    if (health.state === 'down') {
        return {
            text: isLive ? 'SOLVER OFFLINE: last live result shown' : 'SOLVER OFFLINE: showing stored runs',
            className: 'border-red-700 bg-red-50 text-red-800',
            title: health.error ?? 'GET /api/health failed',
        };
    }
    if (isLive && health.state === 'up') {
        return { text: 'LIVE SOLVE', className: 'border-sky-700 bg-sky-50 text-sky-900', title: 'Solved live by the MILP for this scenario' };
    }
    if (isLive) {
        // Live result on screen while the first health check is still pending.
        return { text: 'LIVE RESULT: checking solver…', className: 'border-sky-700 bg-white text-sky-900', title: '' };
    }
    return {
        text: stored,
        className: 'border-gray-800 bg-white text-gray-900',
        title: health.state === 'disabled' ? 'No solver on this URL' : 'Stored runs are always labelled stored',
    };
}

export default function Header({ solution, view, health, isLive }: HeaderProps) {
    const slug = isLive ? undefined : storedSlugOf(solution);
    const entry = slug ? getEntry(slug) : undefined;
    const runLabel = isLive
        ? `Live run ${solution?.run_id ?? MISSING}`
        : entry
          ? `${entry.label ?? entry.slug} (stored: ${entry.slug})`
          : solution
            ? `${viewLabel(view)} (${solution.source})`
            : MISSING;
    const badge = badgeFor(health, isLive);
    const solverNote =
        health.state === 'up' && !isLive ? 'solver online' : health.state === 'checking' ? 'checking solver…' : null;

    return (
        <header id="header" className="flex items-center justify-between gap-4 border-b border-gray-300 px-4 py-2">
            <div className="min-w-0">
                <h1 className="text-xl font-bold">Kalimantan SAF Network Planner</h1>
                <div id="run-label" className="truncate text-gray-700" title={runLabel}>
                    Run: {runLabel}
                    {solution && (
                        <>
                            {' '}| {statusLabel(solution)} | solve {seconds(solution.solve_seconds)} | run ID {solution.run_id}
                        </>
                    )}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                <div className="flex flex-col items-end">
                    <div
                        id="header-badge"
                        data-badge={isLive && health.state === 'up' ? 'live' : health.state === 'down' ? 'offline' : 'stored'}
                        className={`rounded border-2 px-3 py-1 font-bold ${badge.className}`}
                        title={badge.title}
                        aria-live="polite"
                    >
                        {badge.text}
                    </div>
                    {solverNote && <span className="text-xs text-gray-500">{solverNote}</span>}
                </div>
                <div id="auth-slot">
                    <AuthButton getPendingInputs={getCurrentForm} />
                </div>
            </div>
        </header>
    );
}
