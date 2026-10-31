'use client';

// Search box and "Layers & legend" panel floating over the network map. Every control here works.
import { useMemo, useState } from 'react';
import { useApp } from '../../lib/store';
import { sites } from '../../lib/bundle';
import { BASEMAP_LABEL, type Basemap } from '../../lib/view';
import type { RobustKind } from '../../lib/robustness';
import { IconChevron, IconLayers, IconSearch } from '../common/icons';

const LEG_ROWS = [
    { color: '#2f9e4f', label: 'Collection site → depot' },
    { color: '#e5a00d', label: 'Depot → refinery' },
    { color: '#0ea5c6', label: 'Refinery → airport (TRK by barge)' },
];

const NODE_ROWS = [
    { color: '#0ea5c6', label: 'Refinery' },
    { color: '#f0a30a', label: 'Depot' },
    { color: '#2f9e4f', label: 'Collection site' },
    { color: '#94a3b8', label: 'Excluded / not used' },
    { color: '#0f172a', label: 'Airport' },
];

interface Hit {
    id: string;
    label: string;
    kind: string;
}

export function SearchBox() {
    const { solution, selectNode } = useApp();
    const [q, setQ] = useState('');
    const hits = useMemo<Hit[]>(() => {
        const term = q.trim().toLowerCase();
        if (!term) return [];
        const all = new Map<string, Hit>();
        for (const f of solution?.facilities ?? []) all.set(f.site_id, { id: f.site_id, label: f.label, kind: `${f.size} ${f.type}` });
        for (const fl of solution?.flows ?? []) {
            if (fl.leg === 'refinery_airport' && !all.has(fl.to)) all.set(fl.to, { id: fl.to, label: fl.to_label, kind: 'airport' });
        }
        for (const s of sites) if (!all.has(s.id)) all.set(s.id, { id: s.id, label: s.label, kind: 'collection site' });
        return [...all.values()].filter((h) => h.id.toLowerCase().includes(term) || h.label.toLowerCase().includes(term)).slice(0, 8);
    }, [q, solution]);

    return (
        <div className="relative w-72">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 shadow-sm">
                <IconSearch width={16} height={16} className="text-muted" />
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search facility, site or airport"
                    aria-label="Search the network"
                    className="min-w-0 flex-1 bg-transparent text-sm text-deep outline-none placeholder:text-muted"
                />
            </div>
            {q.trim() && (
                <ul className="absolute left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-md">
                    {hits.length === 0 && <li className="px-3 py-2 text-sm text-muted">No match</li>}
                    {hits.map((h) => (
                        <li key={h.id}>
                            <button
                                type="button"
                                onClick={() => {
                                    selectNode(h.id);
                                    setQ('');
                                }}
                                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-app"
                            >
                                <span className="min-w-0 truncate text-deep">{h.label}</span>
                                <span className="shrink-0 text-xs text-muted">{h.id} · {h.kind}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function LayersPanel() {
    const { basemap, setBasemap, robustKind, setRobustKind } = useApp();
    const [open, setOpen] = useState(true);
    return (
        <div className="w-72 rounded-lg border border-line bg-white shadow-sm">
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold text-deep">
                <IconLayers width={16} height={16} />
                <span className="flex-1 text-left">Layers &amp; legend</span>
                <IconChevron width={16} height={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>
            {open && (
                <div className="space-y-3 border-t border-line px-3 py-3 text-[13px]">
                    <div>
                        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Nodes</div>
                        <ul className="space-y-1">
                            {NODE_ROWS.map((r) => (
                                <li key={r.label} className="flex items-center gap-2 text-deep">
                                    <span className="h-3 w-3 rounded-full" style={{ background: r.color }} />
                                    {r.label}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Flows</div>
                        <ul className="space-y-1">
                            {LEG_ROWS.map((r) => (
                                <li key={r.label} className="flex items-center gap-2 text-deep">
                                    <span className="h-1 w-5 rounded" style={{ background: r.color }} />
                                    {r.label}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Basemap</div>
                        <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="Basemap">
                            {(Object.keys(BASEMAP_LABEL) as Basemap[]).map((b) => (
                                <button
                                    key={b}
                                    type="button"
                                    aria-pressed={basemap === b}
                                    onClick={() => setBasemap(b)}
                                    className={`flex-1 px-2 py-1 text-xs font-medium ${basemap === b ? 'bg-primary text-white' : 'bg-white text-deep hover:bg-app'}`}
                                >
                                    {BASEMAP_LABEL[b]}
                                </button>
                            ))}
                        </div>
                    </div>
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Robustness rings</span>
                        <select className="input w-full" value={robustKind} onChange={(e) => setRobustKind(e.target.value as RobustKind)}>
                            <option value="off">Off</option>
                            <option value="depot">Depots</option>
                            <option value="refinery">Refineries</option>
                        </select>
                    </label>
                </div>
            )}
        </div>
    );
}
