'use client';

// Shared enterprise UI primitives used by every workspace page.
import type { ReactNode } from 'react';
import type { Solution } from '../../lib/contract';
import { isProvenOptimal, pct, statusLabel } from '../../lib/format';

export function Card({ title, aside, children, className = '', bodyClass = 'p-5' }: { title?: ReactNode; aside?: ReactNode; children?: ReactNode; className?: string; bodyClass?: string }) {
    return (
        <section className={`rounded-xl border border-line bg-white shadow-sm ${className}`}>
            {title && (
                <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                    <h2 className="text-[15px] font-semibold text-deep">{title}</h2>
                    {aside && <div className="text-sm text-muted">{aside}</div>}
                </header>
            )}
            <div className={bodyClass}>{children}</div>
        </section>
    );
}

export function MetricCard({ label, value, sub, icon, tone = 'blue' }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
    const toneCls = { blue: 'bg-blue-50 text-primary', green: 'bg-green-50 text-success', amber: 'bg-amber-50 text-warning', red: 'bg-red-50 text-danger' }[tone];
    return (
        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
            {icon && <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneCls}`}>{icon}</div>}
            <div className="min-w-0">
                <div className="text-[13px] text-muted">{label}</div>
                <div className="num truncate text-[26px] font-semibold leading-tight text-deep">{value}</div>
                {sub && <div className="mt-0.5 text-[13px] text-muted">{sub}</div>}
            </div>
        </div>
    );
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string }[]; active: T; onChange: (k: T) => void }) {
    return (
        <div role="tablist" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
            {tabs.map((t) => (
                <button
                    key={t.key}
                    role="tab"
                    type="button"
                    aria-selected={active === t.key}
                    onClick={() => onChange(t.key)}
                    className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${active === t.key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-deep'}`}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center">
            <div className="text-[15px] font-semibold text-deep">{title}</div>
            {children && <div className="max-w-md text-sm text-muted">{children}</div>}
            {action}
        </div>
    );
}

/** Solver status chip. "Optimal" only at MIP gap 0 (format.isProvenOptimal). */
export function SolverChip({ solution }: { solution: Solution | null }) {
    if (!solution) return <span className="chip bg-slate-100 text-muted">No run</span>;
    const optimal = isProvenOptimal(solution);
    const bad = solution.status === 'infeasible';
    const cls = bad ? 'bg-red-50 text-danger' : optimal ? 'bg-green-50 text-success' : 'bg-amber-50 text-warning';
    return (
        <span className={`chip ${cls}`} title={statusLabel(solution)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {bad ? 'Infeasible' : optimal ? 'Proven optimal' : 'Best found'}
            {solution.gap != null && !bad && <span className="num">· gap {pct(solution.gap, 2)}</span>}
        </span>
    );
}

export function Check({ ok, children }: { ok: boolean | null; children: ReactNode }) {
    const cls = ok === null ? 'bg-slate-100 text-muted' : ok ? 'bg-green-50 text-success' : 'bg-red-50 text-danger';
    return (
        <li className="flex items-start gap-2.5 text-sm text-deep">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${cls}`} aria-hidden="true">
                {ok === null ? '–' : ok ? '✓' : '!'}
            </span>
            <span>{children}</span>
        </li>
    );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
                <h1 className="text-[24px] font-semibold tracking-tight text-deep">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
    );
}
