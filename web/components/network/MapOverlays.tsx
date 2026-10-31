'use client';

// Search box and "Layers & legend" panel floating over the network map. Every control here works.
import { useMemo, useState } from 'react';
import { useApp } from '../../lib/store';
import { sites } from '../../lib/bundle';
import { BASEMAP_LABEL, type Basemap } from '../../lib/view';
import type { RobustKind } from '../../lib/robustness';
import { IconChevron, IconClose, IconFactory, IconPlane, IconSearch } from '../common/icons';
import type { MapLayers } from '../map/NetworkMap';
import type { Leg } from '../../lib/contract';

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
        <div className="relative w-[440px] max-w-[60vw]">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2.5 shadow-md">
                <IconSearch width={16} height={16} className="text-muted" />
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search location, facility or route…"
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

const LEG_ROWS: { leg: Leg; color: string; label: string }[] = [
    { leg: 'supply_depot', color: '#2f9e4f', label: 'Site → Depot' },
    { leg: 'depot_refinery', color: '#e5a00d', label: 'Depot → Refinery' },
    { leg: 'refinery_airport', color: '#0ea5c6', label: 'Refinery → Airport' },
];

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
    return (
        <label className="flex cursor-pointer items-center gap-2 py-1 text-[13px] text-deep">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            {children}
        </label>
    );
}

export interface LayerCounts {
    airports: number;
    refineries: number;
    depots: number;
    sitesUsed: number;
}

export function LayersPanel({ layers, onChange, counts, onClose }: { layers: MapLayers; onChange: (l: MapLayers) => void; counts: LayerCounts; onClose: () => void }) {
    const { robustKind, setRobustKind } = useApp();
    const [more, setMore] = useState(false);
    const set = (patch: Partial<MapLayers>) => onChange({ ...layers, ...patch });
    // Airports are drawn from refinery to airport flows, so the two switches are one.
    const setAirports = (v: boolean) => onChange({ ...layers, airports: v, legs: { ...layers.legs, refinery_airport: v } });
    return (
        <div className="w-60 rounded-lg border border-line bg-white shadow-md">
            <div className="flex items-center justify-between px-3 pt-2.5">
                <h2 className="text-sm font-semibold text-deep">Layers</h2>
                <button type="button" onClick={onClose} aria-label="Close layers" className="rounded p-0.5 text-muted hover:bg-app hover:text-deep">
                    <IconClose width={14} height={14} />
                </button>
            </div>
            <div className="px-3 pb-2 pt-1">
                <Check checked={layers.airports} onChange={setAirports}>
                    <IconPlane width={14} height={14} className="text-primary" />
                    <span>Airports <span className="num text-muted">({counts.airports})</span></span>
                </Check>
                <Check checked={layers.refineries} onChange={(v) => set({ refineries: v })}>
                    <IconFactory width={14} height={14} className="text-danger" />
                    <span>Refineries <span className="num text-muted">({counts.refineries})</span></span>
                </Check>
                <Check checked={layers.depots} onChange={(v) => set({ depots: v })}>
                    <span className="inline-block h-3 w-3 rounded-full border border-[#8a5a00] bg-[#f0a30a]" />
                    <span>Depots <span className="num text-muted">({counts.depots})</span></span>
                </Check>
                <Check checked={layers.sites} onChange={(v) => set({ sites: v })}>
                    <span className="inline-block h-3 w-3 rounded-full bg-[#2f9e4f]" />
                    <span>Collection sites <span className="num text-muted">({counts.sitesUsed} used)</span></span>
                </Check>
                <div className="mb-1 mt-2 border-t border-line pt-2 text-[13px] font-semibold text-deep">Transport routes</div>
                {LEG_ROWS.map((r) => (
                    <Check
                        key={r.leg}
                        checked={r.leg === 'refinery_airport' ? layers.airports && layers.legs.refinery_airport : layers.legs[r.leg]}
                        onChange={(v) => (r.leg === 'refinery_airport' ? setAirports(v) : set({ legs: { ...layers.legs, [r.leg]: v } }))}
                    >
                        <span className="inline-block h-[3px] w-6 rounded" style={{ background: r.color }} />
                        {r.label}
                    </Check>
                ))}
                <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="mt-2 flex w-full items-center gap-1 border-t border-line pt-2 text-xs font-medium text-muted hover:text-deep">
                    <IconChevron width={12} height={12} className={`transition-transform ${more ? 'rotate-90' : ''}`} />
                    Robustness rings
                </button>
                {more && (
                    <select className="input mt-1 w-full" aria-label="Robustness rings" value={robustKind} onChange={(e) => setRobustKind(e.target.value as RobustKind)}>
                        <option value="off">Off</option>
                        <option value="depot">Depots</option>
                        <option value="refinery">Refineries</option>
                    </select>
                )}
            </div>
        </div>
    );
}

export function BasemapPill() {
    const { basemap, setBasemap } = useApp();
    return (
        <div className="flex overflow-hidden rounded-md border border-line bg-white shadow-md" role="group" aria-label="Basemap">
            {(Object.keys(BASEMAP_LABEL) as Basemap[]).map((b) => (
                <button
                    key={b}
                    type="button"
                    aria-pressed={basemap === b}
                    onClick={() => setBasemap(b)}
                    className={`px-3 py-1.5 text-xs font-medium ${basemap === b ? 'bg-navy text-white' : 'bg-white text-deep hover:bg-app'}`}
                >
                    {BASEMAP_LABEL[b]}
                </button>
            ))}
        </div>
    );
}
