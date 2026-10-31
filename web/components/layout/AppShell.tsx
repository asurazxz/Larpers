'use client';

// Shared application shell: navy sidebar, top bar, and the active workspace page.
import { useState, type ComponentType } from 'react';
import AuthButton from '../AuthButton';
import { getCurrentForm } from '../../lib/useLive';
import { useApp, type PageKey } from '../../lib/store';
import { getEntry, storedRunCount } from '../../lib/bundle';
import { storedSlugOf } from '../../lib/useLive';
import { viewLabel } from '../../lib/view';
import { SolverChip } from '../common/ui';
import { IconChart, IconCollapse, IconHome, IconMap, IconShield, IconSliders } from '../common/icons';

export const NAV: { key: PageKey; label: string; icon: ComponentType }[] = [
    { key: 'overview', label: 'Overview', icon: IconHome },
    { key: 'network', label: 'Network Explorer', icon: IconMap },
    { key: 'planner', label: 'Scenario Planner', icon: IconSliders },
    { key: 'results', label: 'Results & Comparison', icon: IconChart },
    { key: 'reliability', label: 'Reliability & Audit', icon: IconShield },
];

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
    const { page, go } = useApp();
    return (
        <nav aria-label="Primary" className={`flex shrink-0 flex-col bg-navy text-slate-300 transition-[width] duration-150 ${collapsed ? 'w-[68px]' : 'w-[232px]'}`}>
            <div className="flex h-16 items-center gap-2.5 px-4">
                <svg viewBox="0 0 32 32" width={30} height={30} aria-hidden="true">
                    <path d="M6 24C6 12 14 6 27 5c-1 13-7 21-19 21" fill="#16a34a" />
                    <path d="M6 26c5-6 10-10 17-15" stroke="#fff" strokeWidth="1.6" fill="none" />
                </svg>
                {!collapsed && <span className="text-[14px] font-semibold leading-tight text-white">Kalimantan SAF<br />Network Planner</span>}
            </div>
            <ul className="mt-2 flex flex-1 flex-col gap-1 px-3">
                {NAV.map(({ key, label, icon: Icon }) => {
                    const active = page === key;
                    return (
                        <li key={key}>
                            <button
                                type="button"
                                onClick={() => go(key)}
                                aria-current={active ? 'page' : undefined}
                                title={collapsed ? label : undefined}
                                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] transition-colors ${active ? 'bg-primary text-white' : 'hover:bg-white/10 hover:text-white'}`}
                            >
                                <Icon />
                                {!collapsed && <span className="truncate">{label}</span>}
                            </button>
                        </li>
                    );
                })}
            </ul>
            <div className="px-3 pb-4">
                <button type="button" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] hover:bg-white/10 hover:text-white">
                    <IconCollapse style={{ transform: collapsed ? 'rotate(180deg)' : undefined }} />
                    {!collapsed && 'Collapse'}
                </button>
            </div>
        </nav>
    );
}

function TopBar() {
    const { solution, view, isLive, solverHealth, dirty } = useApp();
    const slug = isLive ? undefined : storedSlugOf(solution);
    const entry = slug ? getEntry(slug) : undefined;
    const runLabel = isLive ? `Live run ${solution?.run_id ?? ''}` : entry ? `${entry.label ?? entry.slug}` : solution ? viewLabel(view) : 'No run';
    const n = storedRunCount();
    const health = solverHealth.state;
    return (
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-6">
            <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0 rounded-lg border border-line px-3 py-1.5 text-sm">
                    <span className="text-muted">Run: </span>
                    <span className="font-medium text-deep">{runLabel}</span>
                    <span className="ml-1 text-muted">({isLive ? 'live solve' : `stored run, ${n} stored`})</span>
                </div>
                {dirty && <span className="chip bg-amber-50 text-warning" title="Scenario inputs differ from the displayed run">● Unsaved changes, results outdated</span>}
                <SolverChip solution={solution} />
            </div>
            <div className="flex shrink-0 items-center gap-3">
                <span
                    className={`chip ${health === 'up' ? 'bg-green-50 text-success' : health === 'down' ? 'bg-red-50 text-danger' : 'bg-slate-100 text-muted'}`}
                    title={solverHealth.error ?? 'GET /api/health'}
                >
                    Solver API: {health === 'up' ? 'online' : health === 'down' ? 'offline' : health === 'checking' ? 'checking…' : 'not configured'}
                </span>
                <AuthButton getPendingInputs={getCurrentForm} />
            </div>
        </header>
    );
}

export default function AppShell({ pages }: { pages: Record<PageKey, ComponentType> }) {
    const { page } = useApp();
    const [collapsed, setCollapsed] = useState(false);
    const Page = pages[page];
    return (
        <div className="flex h-screen overflow-hidden bg-app text-deep">
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
            <div className="flex min-w-0 flex-1 flex-col">
                <TopBar />
                <main className="min-h-0 flex-1 overflow-y-auto" id="workspace">
                    <Page />
                </main>
            </div>
        </div>
    );
}
