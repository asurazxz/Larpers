'use client';

// Shared application shell: navy sidebar, top bar, and the active workspace page.
import { useEffect, useState, type ComponentType } from 'react';
import AuthButton from '../AuthButton';
import { getCurrentForm } from '../../lib/useLive';
import { useApp, type PageKey } from '../../lib/store';
import { getEntry, slugs, solutionOf } from '../../lib/bundle';
import { storedSlugOf, viewForEntry } from '../../lib/useLive';
import { BASEMAP_LABEL, type Basemap } from '../../lib/view';
import { useSession } from '../../lib/auth';
import { isProvenOptimal, pct, statusLabel } from '../../lib/format';
import { IconBell, IconChart, IconCheckCircle, IconChevronDown, IconCollapse, IconGear, IconHelp, IconHome, IconMap, IconShield, IconSliders } from '../common/icons';

export const NAV: { key: PageKey; label: string; icon: ComponentType }[] = [
    { key: 'overview', label: 'Overview', icon: IconHome },
    { key: 'network', label: 'Network Explorer', icon: IconMap },
    { key: 'scenarios', label: 'Scenario Planner', icon: IconSliders },
    { key: 'results', label: 'Results & Comparison', icon: IconChart },
    { key: 'reliability', label: 'Reliability & Audit', icon: IconShield },
];

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
    const { page, go, basemap, setBasemap } = useApp();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const item = (active: boolean) =>
        `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] transition-colors ${active ? 'bg-primary text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`;
    return (
        <nav aria-label="Primary" className={`relative flex shrink-0 flex-col bg-navy transition-[width] duration-150 ${collapsed ? 'w-[68px]' : 'w-[232px]'}`}>
            <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-4">
                <svg viewBox="0 0 32 32" width={30} height={30} aria-hidden="true" className="shrink-0">
                    <path d="M6 24C6 12 14 6 27 5c-1 13-7 21-19 21" fill="#22c55e" />
                    <path d="M4 27c4-1 7-3 9-6" stroke="#2563eb" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                    <path d="M7 25c5-6 10-10 17-15" stroke="#fff" strokeWidth="1.6" fill="none" />
                </svg>
                {!collapsed && <span className="text-[14px] font-semibold leading-tight text-white">Kalimantan SAF<br />Network Planner</span>}
            </div>
            <ul className="mt-3 flex flex-1 flex-col gap-1 px-3">
                {NAV.map(({ key, label, icon: Icon }) => (
                    <li key={key}>
                        <button type="button" onClick={() => go(key)} aria-current={page === key ? 'page' : undefined} title={collapsed ? label : undefined} className={item(page === key)}>
                            <Icon />
                            {!collapsed && <span className="truncate">{label}</span>}
                        </button>
                    </li>
                ))}
            </ul>
            <ul className="flex flex-col gap-1 px-3 pb-4">
                <li>
                    <button type="button" onClick={() => go('reliability', 'data')} title="Data, assumptions and limitations" className={item(false)}>
                        <IconHelp />
                        {!collapsed && 'Help'}
                    </button>
                </li>
                <li className="relative">
                    <button type="button" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen} className={item(settingsOpen)}>
                        <IconGear />
                        {!collapsed && 'Settings'}
                    </button>
                    {settingsOpen && (
                        <div className="absolute bottom-0 left-full z-[1200] ml-2 w-64 rounded-xl border border-line bg-white p-4 text-deep shadow-lg">
                            <div className="mb-2 text-[13px] font-medium text-muted">Map basemap</div>
                            <div className="mb-4 flex overflow-hidden rounded-lg border border-line text-sm">
                                {(Object.keys(BASEMAP_LABEL) as Basemap[]).map((b) => (
                                    <button key={b} type="button" aria-pressed={basemap === b} onClick={() => setBasemap(b)} className={`flex-1 px-2 py-1.5 ${basemap === b ? 'bg-primary text-white' : 'hover:bg-slate-50'}`}>
                                        {BASEMAP_LABEL[b]}
                                    </button>
                                ))}
                            </div>
                            <p className="mb-3 text-[12px] text-muted">Offline needs no network. OSM and CARTO load map tiles.</p>
                            <button type="button" className="btn-secondary w-full" onClick={() => { onToggle(); setSettingsOpen(false); }}>
                                {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            </button>
                        </div>
                    )}
                </li>
                <li>
                    <button type="button" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={item(false)}>
                        <IconCollapse style={{ transform: collapsed ? 'rotate(180deg)' : undefined }} />
                        {!collapsed && 'Collapse'}
                    </button>
                </li>
            </ul>
        </nav>
    );
}

function RunSelect() {
    const { solution, isLive, liveRun, selectView, setSolution } = useApp();
    const slug = isLive ? '__live' : (storedSlugOf(solution) ?? '');
    return (
        <label className="relative flex min-w-0 items-center">
            <span className="sr-only">Displayed run</span>
            <select
                value={slug}
                onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__live' && liveRun) return setSolution(liveRun.solution);
                    const entry = getEntry(v);
                    if (entry) selectView(viewForEntry(entry), solutionOf(entry) ?? null);
                }}
                className="max-w-[300px] appearance-none truncate rounded-lg border border-line bg-white py-2 pl-3 pr-9 text-sm font-medium text-deep hover:bg-slate-50 focus:border-primary focus:outline-none"
            >
                {liveRun && <option value="__live">Live run {liveRun.solution.run_id.slice(0, 8)}</option>}
                {!isLive && slug === '' && <option value="">{solution ? 'Unsaved view' : 'No run'}</option>}
                {slugs().map((s) => {
                    const e = getEntry(s)!;
                    return (
                        <option key={s} value={s}>
                            {(e.label ?? (s === 'base' ? 'Base Scenario' : s)) + ' (stored run)'}
                        </option>
                    );
                })}
            </select>
            <IconChevronDown className="pointer-events-none absolute right-3 text-muted" />
        </label>
    );
}

function StatusChip() {
    const { solution } = useApp();
    if (!solution) return null;
    const bad = solution.status === 'infeasible';
    const optimal = isProvenOptimal(solution);
    const audited = solution.validation?.passed === true;
    const cls = bad ? 'bg-red-50 text-danger' : 'bg-green-50 text-success';
    return (
        <span className={`chip ${cls}`} title={statusLabel(solution)}>
            <IconCheckCircle />
            {bad ? 'Infeasible' : optimal ? 'Proven optimal' : 'Best found'}
            {!bad && solution.gap != null && <span className="num">· Gap {pct(solution.gap, 2)}</span>}
            {!bad && audited && <span className="font-normal">· audited</span>}
        </span>
    );
}

function Notifications() {
    const { dirty, solverHealth, solution, go } = useApp();
    const [open, setOpen] = useState(false);
    const items: { text: string; action?: () => void }[] = [];
    if (dirty) items.push({ text: 'Scenario inputs changed: the displayed results are outdated.', action: () => go('scenarios') });
    if (solverHealth.state === 'down') items.push({ text: `Solver API offline: ${solverHealth.error ?? 'health check failed'}. Showing stored runs.` });
    if (solution && solution.validation?.passed === false) items.push({ text: 'Independent audit reported failures for this run.', action: () => go('reliability', 'solver') });
    if ((solution?.stranded.length ?? 0) > 0) items.push({ text: `${solution!.stranded.length} supply sites have stranded biomass.`, action: () => go('results', 'demand') });
    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notifications (${items.length})`} aria-expanded={open} className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-slate-100 hover:text-deep">
                <IconBell />
                {items.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" aria-hidden="true" />}
            </button>
            {open && (
                <div className="absolute right-0 top-11 z-[1200] w-80 rounded-xl border border-line bg-white p-2 shadow-lg">
                    <div className="px-2 py-1.5 text-[13px] font-semibold text-deep">Notifications</div>
                    {items.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-muted">Nothing needs attention.</div>
                    ) : (
                        items.map((it, i) => (
                            <button key={i} type="button" disabled={!it.action} onClick={() => { it.action?.(); setOpen(false); }} className="block w-full rounded-lg px-2 py-2 text-left text-sm text-deep hover:bg-slate-50 disabled:hover:bg-transparent">
                                {it.text}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function Profile() {
    const { status, user } = useSession();
    const [open, setOpen] = useState(false);
    const name = user?.name ?? user?.email ?? (status === 'disabled' ? 'Guest' : 'Not signed in');
    const initials = (user?.name ?? user?.email ?? 'G').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
    const role = status === 'signed_in' ? 'Planner' : status === 'disabled' ? 'Stored runs only' : 'Sign in to solve live';
    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-slate-100">
                {user?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full" />
                ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-white">{initials}</span>
                )}
                <span className="hidden text-left leading-tight md:block">
                    <span className="block max-w-[10rem] truncate text-[13px] font-semibold text-deep">{name}</span>
                    <span className="block text-[12px] text-muted">{role}</span>
                </span>
                <IconChevronDown className="text-muted" />
            </button>
            {open && (
                <div className="legacy absolute right-0 top-12 z-[1200] w-80 rounded-xl border border-line bg-white p-4 shadow-lg">
                    <AuthButton getPendingInputs={getCurrentForm} />
                </div>
            )}
        </div>
    );
}

function TopBar() {
    const { dirty, solverHealth } = useApp();
    const health = solverHealth.state;
    return (
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-6">
            <div className="flex min-w-0 items-center gap-3">
                <RunSelect />
                <StatusChip />
                {dirty && (
                    <span className="chip bg-amber-50 text-warning" title="Scenario inputs differ from the displayed run">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                        Unsaved changes
                    </span>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span
                    className={`chip hidden lg:inline-flex ${health === 'up' ? 'bg-green-50 text-success' : health === 'down' ? 'bg-red-50 text-danger' : 'bg-slate-100 text-muted'}`}
                    title={solverHealth.error ?? 'GET /api/health'}
                >
                    Solver {health === 'up' ? 'online' : health === 'down' ? 'offline' : health === 'checking' ? 'checking…' : 'not configured'}
                </span>
                <Notifications />
                <Profile />
            </div>
        </header>
    );
}

export default function AppShell({ pages }: { pages: Record<PageKey, ComponentType> }) {
    const { page } = useApp();
    const [collapsed, setCollapsed] = useState(false);
    const Page = pages[page];
    // globals.css sizes the root for the landing and #planner projector screens (18-20px); the
    // workspace is designed at a 16px root, so set it while mounted and restore it on the way out.
    useEffect(() => {
        const root = document.documentElement;
        const prev = root.style.fontSize;
        root.style.fontSize = '16px';
        return () => {
            root.style.fontSize = prev;
        };
    }, []);
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
