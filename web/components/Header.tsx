'use client';

// Title, run label, solver badge and sign-in. /api/health decides the badge; a stored run is
// always labelled stored, even when the solver is up.
import { ArrowLeft } from 'lucide-react';
import AuthButton from './AuthButton';
import Logo from './Logo';
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

type BadgeKind = 'stored' | 'live' | 'checking' | 'offline';

const BADGE_STYLE: Record<BadgeKind, { pill: string; dot: string }> = {
    stored: { pill: 'bg-[#f1f3f5] text-ink ring-1 ring-[#d5dbe2]', dot: 'bg-[#6b7785]' },
    live: { pill: 'bg-[#e8f4f2] text-[#0b5a53] ring-1 ring-[#0f766e]/45', dot: 'bg-[#0f766e] animate-pulse' },
    checking: { pill: 'bg-[#f1f3f5] text-ink ring-1 ring-[#d5dbe2]', dot: 'bg-[#6b7785]' },
    offline: { pill: 'bg-[#fdf0f0] text-[#9b1c1c] ring-1 ring-[#e3a1a1]', dot: 'bg-[#c53030]' },
};

function badgeFor(health: SolverHealth, isLive: boolean): { text: string; kind: BadgeKind; title: string } {
    const n = storedRunCount();
    const stored = `STORED RUN: ${n} stored run${n === 1 ? '' : 's'}`;
    if (health.state === 'down') {
        return {
            text: isLive ? 'SOLVER OFFLINE: last live result shown' : 'SOLVER OFFLINE: showing stored runs',
            kind: 'offline',
            title: health.error ?? 'GET /api/health failed',
        };
    }
    if (isLive && health.state === 'up') {
        return { text: 'LIVE SOLVE', kind: 'live', title: 'Solved live by the MILP for this scenario' };
    }
    if (isLive) {
        // Live result on screen while the first health check is still pending.
        return { text: 'LIVE RESULT: checking solver…', kind: 'checking', title: '' };
    }
    return {
        text: stored,
        kind: 'stored',
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
    const style = BADGE_STYLE[badge.kind];
    const solverNote =
        health.state === 'up' && !isLive ? 'solver online' : health.state === 'checking' ? 'checking solver…' : null;

    return (
        <header
            id="header"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-white px-4 py-1.5 text-ink md:flex-nowrap"
        >
            <div className="flex min-w-0 items-center gap-3">
                <a href="#home" className="shrink-0 rounded-md" title="Larpers home">
                    <Logo size={30} />
                </a>
                <span aria-hidden="true" className="hidden h-8 w-px shrink-0 bg-line md:block" />
                <div className="min-w-0">
                <h1 className="flex items-baseline gap-3 text-[1.1rem] font-semibold leading-tight tracking-[-0.02em]">
                    <a
                        href="#home"
                        id="home-link"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md text-base font-medium text-accent hover:underline"
                        title="Back to the front page"
                    >
                        <ArrowLeft size={16} strokeWidth={2.5} aria-hidden="true" /> Home
                    </a>
                    <span>Kalimantan SAF Network Planner</span>
                </h1>
                {/* Status, solve time and run ID live in the provenance strip and the summary. */}
                <div
                    id="run-label"
                    className="truncate text-base leading-snug text-ink2"
                    title={solution ? `${runLabel} | ${statusLabel(solution)} | solve ${seconds(solution.solve_seconds)} | run ID ${solution.run_id}` : runLabel}
                >
                    Run: <span className="text-ink">{runLabel}</span>
                </div>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:shrink-0 md:flex-nowrap">
                <div className="flex flex-wrap items-center gap-2.5">
                    {solverNote && <span className="text-base text-ink2">{solverNote}</span>}
                    <div
                        id="header-badge"
                        data-badge={isLive && health.state === 'up' ? 'live' : health.state === 'down' ? 'offline' : 'stored'}
                        className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-base font-semibold tracking-[0.01em] transition-[background-color,color,box-shadow] duration-500 ease-out ${style.pill}`}
                        title={badge.title}
                        aria-live="polite"
                    >
                        <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full transition-colors duration-500 ${style.dot}`} />
                        {badge.text}
                    </div>
                </div>
                <div id="auth-slot">
                    <AuthButton getPendingInputs={getCurrentForm} />
                </div>
            </div>
        </header>
    );
}
