'use client';

// Shared application shell: navy sidebar, top bar, and the active workspace page.
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useApp, type PageKey } from '../../lib/store';
import { runKind, runLabel, type RunKind } from '../../lib/runs';
import { useDismiss } from '../../lib/useDismiss';
import { getEntry, getSolution, slugs, solutionOf } from '../../lib/bundle';
import { storedSlugOf, viewForEntry } from '../../lib/useLive';
import { isProvenOptimal, pct, statusLabel } from '../../lib/format';
import { IconBell, IconBolt, IconChart, IconCheckCircle, IconChevronDown, IconCollapse, IconHelp, IconHome, IconMap, IconShield, IconSliders } from '../common/icons';

export const NAV: { key: PageKey; label: string; icon: ComponentType }[] = [
    { key: 'overview', label: 'Overview', icon: IconHome },
    { key: 'network', label: 'Network Explorer', icon: IconMap },
    { key: 'scenarios', label: 'Scenario Planner', icon: IconSliders },
    { key: 'results', label: 'Results & Comparison', icon: IconChart },
    { key: 'reliability', label: 'Reliability & Audit', icon: IconShield },
];

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
    const { page, tab, go } = useApp();
    // Hover is a faint tint; the active page gets a solid fill, bold text and a left accent bar.
    const item = (active: boolean) =>
        `relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${active ? 'bg-primary font-semibold text-white shadow-sm before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-r before:bg-green-400' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`;
    const dataTab = page === 'reliability' && tab === 'data';
    return (
        <nav aria-label="Primary" className={`relative flex shrink-0 flex-col bg-navy transition-[width] duration-150 ${collapsed ? 'w-[68px]' : 'w-[232px]'}`}>
            <a href="#overview" aria-label="Kalimantan SAF Network Planner, go to Overview" title="Overview" className="flex h-16 items-center gap-2.5 border-b border-white/10 px-4 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70">
                <svg viewBox="0 0 32 32" width={30} height={30} aria-hidden="true" className="shrink-0">
                    <path d="M6 24C6 12 14 6 27 5c-1 13-7 21-19 21" fill="#22c55e" />
                    <path d="M4 27c4-1 7-3 9-6" stroke="#2563eb" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                    <path d="M7 25c5-6 10-10 17-15" stroke="#fff" strokeWidth="1.6" fill="none" />
                </svg>
                {!collapsed && <span className="text-[14px] font-semibold leading-tight text-white">Kalimantan SAF<br />Network Planner</span>}
            </a>
            <ul className="mt-3 flex flex-1 flex-col gap-1 px-3">
                {NAV.map(({ key, label, icon: Icon }) => {
                    const active = page === key && !(key === 'reliability' && dataTab);
                    return (
                        <li key={key}>
                            <button type="button" onClick={() => go(key)} aria-label={label} aria-current={active ? 'page' : undefined} title={collapsed ? label : undefined} className={item(active)}>
                                <Icon />
                                {!collapsed && <span className="truncate">{label}</span>}
                            </button>
                        </li>
                    );
                })}
            </ul>
            <ul className="flex flex-col gap-1 px-3 pb-4">
                <li>
                    <button type="button" onClick={() => go('live')} aria-label="Live solve view" aria-current={page === 'live' ? 'page' : undefined} title="Stream a live solve and explain the result" className={item(page === 'live')}>
                        <IconBolt />
                        {!collapsed && 'Live solve view'}
                    </button>
                </li>
                <li>
                    <button type="button" onClick={() => go('reliability', 'data')} aria-label="Data and assumptions" aria-current={dataTab ? 'page' : undefined} title="Data, assumptions and limitations" className={item(dataTab)}>
                        <IconHelp />
                        {!collapsed && 'Data & assumptions'}
                    </button>
                </li>
                <li>
                    <button type="button" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : undefined} className={item(false)}>
                        <IconCollapse style={{ transform: collapsed ? 'rotate(180deg)' : undefined }} />
                        {!collapsed && 'Collapse'}
                    </button>
                </li>
            </ul>
        </nav>
    );
}

// Optimal and greedy come first: they are the comparison the page is built around.
const RUN_GROUPS: { label: string; kinds: RunKind[] }[] = [
    { label: 'Optimal vs greedy', kinds: ['base', 'baseline'] },
    { label: 'Comparison', kinds: ['earlier', 'sensitivity', 'other'] },
    { label: 'Disruptions', kinds: ['disruption'] },
];

/** Says "Optimal" only when the stored run proves it. */
function runOptionLabel(slug: string): string {
    const stored = getSolution(slug);
    return slug === 'base' && stored && isProvenOptimal(stored) ? 'Optimal network (base)' : runLabel(slug);
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
                className="w-full max-w-[300px] appearance-none truncate rounded-lg border border-line bg-white py-2 pl-3 pr-9 text-sm font-medium text-deep hover:bg-slate-50 focus:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            >
                {liveRun && <option value="__live">Live run {liveRun.solution.run_id.slice(0, 8)}</option>}
                {!isLive && slug === '' && <option value="">{solution ? 'Unsaved view' : 'No run'}</option>}
                {RUN_GROUPS.map((g) => {
                    const list = slugs().filter((s) => g.kinds.includes(runKind(s, false)));
                    return (
                        list.length > 0 && (
                            <optgroup key={g.label} label={`Stored runs: ${g.label}`}>
                                {list.map((s) => (
                                    <option key={s} value={s}>
                                        {runOptionLabel(s)}
                                    </option>
                                ))}
                            </optgroup>
                        )
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
        <span className={`chip min-w-0 ${cls}`} title={statusLabel(solution)}>
            <IconCheckCircle className="shrink-0" />
            <span className="truncate">{bad ? 'Infeasible' : optimal ? 'Proven optimal' : solution.status === 'heuristic' ? 'Greedy heuristic' : 'Best found'}</span>
            {!bad && solution.gap != null && <span className="num hidden xl:inline">· Gap {pct(solution.gap, 2)}</span>}
            {!bad && audited && <span className="hidden font-normal xl:inline">· audited</span>}
        </span>
    );
}

const SEEN_KEY = 'saf.seenNotifications';

function readSeen(): string[] {
    try {
        const v = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '[]');
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

interface PopoverProps {
    open: boolean;
    setOpen: (o: boolean) => void;
}

function Notifications({ open, setOpen }: PopoverProps) {
    const { dirty, solverHealth, solution, go } = useApp();
    const [seen, setSeen] = useState<string[]>(readSeen);
    const wrap = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    useDismiss(open, () => setOpen(false), [wrap], trigger);
    const items: { key: string; text: string; hint?: string; action?: () => void }[] = [];
    if (dirty) items.push({ key: 'dirty', text: 'Scenario inputs changed: the displayed results are outdated.', hint: 'Open Scenario Planner', action: () => go('scenarios') });
    if (solverHealth.state === 'down') items.push({ key: 'offline', text: `Solver API offline: ${solverHealth.error ?? 'health check failed'}. Showing stored runs.` });
    if (solution && solution.validation?.passed === false) items.push({ key: `audit:${solution.run_id}`, text: 'Independent audit reported failures for this run.', hint: 'View in Reliability & Audit', action: () => go('reliability', 'solver') });
    const n = solution?.stranded.length ?? 0;
    if (n > 0) items.push({ key: `stranded:${n}`, text: `${n} supply sites left uncollected (not needed for demand).`, hint: 'View in Results', action: () => go('results', 'demand') });
    const unseen = items.some((it) => !seen.includes(it.key));
    const toggle = () => {
        if (!open) {
            const next = [...new Set([...seen, ...items.map((it) => it.key)])];
            setSeen(next);
            try {
                window.localStorage.setItem(SEEN_KEY, JSON.stringify(next));
            } catch {
                // Storage can be blocked; the dot then clears for this session only.
            }
        }
        setOpen(!open);
    };
    return (
        <div className="relative" ref={wrap}>
            <button ref={trigger} type="button" onClick={toggle} aria-label={`Notifications (${items.length})`} aria-haspopup="dialog" aria-expanded={open} className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-slate-100 hover:text-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <IconBell />
                {unseen && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" aria-hidden="true" />}
            </button>
            {open && (
                <div role="dialog" aria-label="Notifications" className="absolute right-0 top-11 z-[1200] w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white p-2 shadow-lg">
                    <div className="px-2 py-1.5 text-[13px] font-semibold text-deep">Notifications</div>
                    {items.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-muted">Nothing needs attention.</div>
                    ) : (
                        items.map((it) => (
                            <button key={it.key} type="button" disabled={!it.action} onClick={() => { it.action?.(); setOpen(false); }} className="block w-full rounded-lg px-2 py-2 text-left text-sm text-deep hover:bg-slate-50 disabled:hover:bg-transparent">
                                {it.text}
                                {it.hint && <span className="mt-0.5 block text-[12px] font-medium text-primary">{it.hint}</span>}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function IconPerson() {
    return (
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
        </svg>
    );
}

function Profile({ open, setOpen }: PopoverProps) {
    const wrap = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    useDismiss(open, () => setOpen(false), [wrap], trigger);
    return (
        <div className="relative" ref={wrap}>
            <button ref={trigger} type="button" onClick={() => setOpen(!open)} aria-label="Account menu" aria-haspopup="dialog" aria-expanded={open} className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[13px] font-semibold text-muted"><IconPerson /></span>
                <span className="hidden text-left leading-tight md:block">
                    <span className="block max-w-[10rem] truncate text-[13px] font-semibold text-deep">Guest</span>
                    <span className="block text-[12px] text-muted">Stored runs only</span>
                </span>
                <IconChevronDown className="text-muted" />
            </button>
            {open && (
                <div role="dialog" aria-label="Account" className="legacy absolute right-0 top-12 z-[1200] w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white p-4 shadow-lg">
                    <div className="flex flex-wrap items-center gap-3 text-base text-ink">
                        <span className="text-base text-ink2">Stored runs only, no login</span>
                    </div>
                    <a href="#home" className="mt-3 block rounded-lg border border-line px-3 py-2 text-center text-sm font-medium text-deep hover:bg-slate-50">Back to front page</a>
                </div>
            )}
        </div>
    );
}

function TopBar() {
    const { dirty, solverHealth, page, tab } = useApp();
    const health = solverHealth.state;
    // Only one popover is open at a time, and navigating closes it.
    const [menu, setMenu] = useState<'notifications' | 'profile' | null>(null);
    useEffect(() => setMenu(null), [page, tab]);
    const healthText = health === 'up' ? 'online' : health === 'down' ? 'offline' : health === 'checking' ? 'checking…' : 'not configured';
    const healthTone = health === 'up' ? 'bg-green-50 text-success' : health === 'down' ? 'bg-red-50 text-danger' : 'bg-slate-100 text-muted';
    return (
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
                <RunSelect />
                <StatusChip />
                {dirty && (
                    <span className="chip hidden bg-amber-50 text-warning sm:inline-flex" title="Scenario inputs differ from the displayed run">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                        Unsaved changes
                    </span>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className={`chip ${healthTone}`} title={solverHealth.error ?? 'Whether the live solver on the presenter laptop can be reached'} aria-label={`Solver ${healthText}`}>
                    <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                    <span className="hidden lg:inline">Solver {healthText}</span>
                </span>
                <Notifications open={menu === 'notifications'} setOpen={(o) => setMenu(o ? 'notifications' : null)} />
                <Profile open={menu === 'profile'} setOpen={(o) => setMenu(o ? 'profile' : null)} />
            </div>
        </header>
    );
}

export default function AppShell({ pages }: { pages: Record<PageKey, ComponentType> }) {
    const { page } = useApp();
    // Remembered across reloads; narrow screens start collapsed until the user chooses otherwise.
    const [collapsed, setCollapsed] = useState(() => {
        try {
            const v = window.localStorage.getItem('saf.sidebarCollapsed');
            if (v === '1' || v === '0') return v === '1';
        } catch {
            // Storage can be blocked; fall through to the width default.
        }
        return window.innerWidth < 1024;
    });
    const toggleSidebar = () =>
        setCollapsed((c) => {
            try {
                window.localStorage.setItem('saf.sidebarCollapsed', c ? '0' : '1');
            } catch {
                // Not persisted; still toggles for this session.
            }
            return !c;
        });
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
            <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
            <div className="flex min-w-0 flex-1 flex-col">
                <TopBar />
                <main className="min-h-0 flex-1 overflow-y-auto" id="workspace">
                    <Page />
                </main>
            </div>
        </div>
    );
}
