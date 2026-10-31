'use client';

// Right-hand inspector for the Network Explorer: facility, site/airport or route details.
// Numbers come only from the displayed Solution (and sites.json for supply sites).
import { useEffect, useState } from 'react';
import { useApp } from '../../lib/store';
import { siteById } from '../../lib/bundle';
import { LEG_LABEL, km, kt, orMissing, pct, usd, usdExact } from '../../lib/format';
import type { Facility, Flow } from '../../lib/contract';
import { Tabs } from '../common/ui';
import { IconClose, IconFactory } from '../common/icons';
import { FIXED_OPEX_SHARE, VARIABLE_OPEX_USD_PER_T } from '../../lib/annual';

function Row({ k, v }: { k: string; v: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 text-sm last:border-0">
            <span className="text-muted">{k}</span>
            <span className="num text-right text-deep">{v}</span>
        </div>
    );
}

function Bar({ value }: { value: number }) {
    const w = Math.max(0, Math.min(1, value)) * 100;
    return (
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Utilisation ${pct(value)}`}>
            <div className="h-full bg-primary" style={{ width: `${w}%` }} />
        </div>
    );
}

function FlowRow({ f, index, dir }: { f: Flow; index: number; dir: 'in' | 'out' }) {
    const { selectFlow } = useApp();
    return (
        <button type="button" onClick={() => selectFlow({ flow: f, index })} className="flex w-full items-center justify-between gap-2 border-b border-line/60 py-2 text-left text-sm last:border-0 hover:bg-app">
            <span className="min-w-0">
                <span className="block truncate text-deep">{dir === 'in' ? `from ${f.from_label}` : `to ${f.to_label}`}</span>
                <span className="text-xs text-muted">{LEG_LABEL[f.leg]}</span>
            </span>
            <span className="num shrink-0 text-right text-deep">
                {kt(f.kt)}
                <span className="block text-xs text-muted">{km(f.km, 0)}</span>
            </span>
        </button>
    );
}

const CAP_BASIS: Record<Facility['capacity_basis'], string> = { biomass_in: 'biomass intake', saf_out: 'SAF output' };

function coord(lat: number, lon: number): string {
    return `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`;
}

function Banner({ type }: { type: Facility['type'] }) {
    return (
        <svg viewBox="0 0 360 120" className="h-[120px] w-full rounded-lg" role="img" aria-label={`${type} illustration (not a photo)`} preserveAspectRatio="xMidYMid slice">
            <defs>
                <linearGradient id="bn-sky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#dbeafe" />
                    <stop offset="1" stopColor="#f1f5f9" />
                </linearGradient>
            </defs>
            <rect width="360" height="120" fill="url(#bn-sky)" />
            <rect y="96" width="360" height="24" fill="#cbd5e1" />
            {type === 'refinery' ? (
                <g fill="#64748b">
                    <rect x="60" y="48" width="50" height="48" />
                    <rect x="120" y="30" width="14" height="66" fill="#475569" />
                    <rect x="146" y="20" width="12" height="76" fill="#475569" />
                    <rect x="170" y="56" width="70" height="40" />
                    <circle cx="205" cy="56" r="14" />
                    <rect x="250" y="40" width="36" height="56" />
                    <rect x="294" y="62" width="30" height="34" fill="#94a3b8" />
                    <path d="M126 24c4-8 12-8 8-16M152 14c4-8 12-8 8-14" stroke="#94a3b8" strokeWidth="3" fill="none" strokeLinecap="round" />
                </g>
            ) : (
                <g fill="#94a3b8">
                    <path d="M70 96V62l40-22 40 22v34z" />
                    <path d="M170 96V70l34-18 34 18v26z" fill="#64748b" />
                    <rect x="262" y="58" width="60" height="38" fill="#64748b" />
                    <rect x="82" y="74" width="22" height="22" fill="#e5a00d" />
                </g>
            )}
        </svg>
    );
}

function FacilityView({ fac, goFlows }: { fac: Facility; goFlows: boolean }) {
    const { solution, baseline, go } = useApp();
    const [tab, setTab] = useState<'overview' | 'flows' | 'why'>(goFlows ? 'flows' : 'overview');
    const site = siteById(fac.site_id);
    const flows = (solution?.flows ?? []).map((f, i) => ({ f, i }));
    const inb = flows.filter(({ f }) => f.to === fac.site_id);
    const out = flows.filter(({ f }) => f.from === fac.site_id);
    const inKt = inb.reduce((s, { f }) => s + f.kt, 0);
    const outKt = out.reduce((s, { f }) => s + f.kt, 0);
    const legCost = [...inb, ...out].reduce((s, { f }) => s + f.cost_usd, 0);
    const inBase = baseline ? baseline.facilities.some((b) => b.site_id === fac.site_id && b.type === fac.type) : null;
    // Variable OpEx = biomass in x organisers' rate. SAF-output refineries need the run's yield to get biomass in.
    const yieldF = solution?.scenario?.yield;
    const biomassKt = fac.capacity_basis === 'biomass_in' ? fac.throughput_kt : yieldF ? fac.throughput_kt / yieldF : null;
    const varOpex = biomassKt == null ? null : biomassKt * 1000 * VARIABLE_OPEX_USD_PER_T[fac.type][fac.size];
    const fixedOpex = fac.capex_usd * FIXED_OPEX_SHARE;
    const isRef = fac.type === 'refinery';
    return (
        <div>
            <div className="px-4 pt-3">
                <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isRef ? 'bg-red-50 text-danger' : 'bg-amber-50 text-warning'}`}>
                        <IconFactory width={22} height={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-base font-bold capitalize text-deep">{fac.type}</span>
                            <span className="num text-sm text-deep">{fac.site_id}</span>
                            <span className="chip bg-green-50 text-success">Selected in plan</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                            {site ? `${site.district}, ${site.province}` : fac.label} <span className="num ml-1">{coord(fac.lat, fac.lon)}</span>
                        </p>
                    </div>
                </div>
                <div className="mt-3">
                    <Banner type={fac.type} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    <div>
                        <div className="text-[11px] text-muted">Design capacity</div>
                        <div className="num text-sm font-semibold text-deep">{kt(fac.capacity_kt, 0)}/yr</div>
                        <div className="text-[10px] text-muted">{CAP_BASIS[fac.capacity_basis]}</div>
                    </div>
                    <div>
                        <div className="text-[11px] text-muted">Utilisation</div>
                        <div className="flex items-center gap-1.5">
                            <span className="num text-sm font-semibold text-deep">{pct(fac.utilisation, 0)}</span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full bg-success" style={{ width: `${Math.max(0, Math.min(1, fac.utilisation)) * 100}%` }} />
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="text-[11px] text-muted">CapEx (one-off)</div>
                        <div className="num text-sm font-semibold text-deep">{usd(fac.capex_usd)}</div>
                    </div>
                </div>
            </div>
            <div className="mt-3">
                <Tabs
                    tabs={[
                        { key: 'overview', label: 'Overview' },
                        { key: 'flows', label: `Connected Flows (${inb.length + out.length})` },
                        { key: 'why', label: 'Why Selected' },
                    ]}
                    active={tab}
                    onChange={setTab}
                />
            </div>
            <div className="px-4 pb-2 pt-2">
                {tab === 'overview' && (
                    <>
                        <Row k="Type" v={`${fac.type === 'refinery' ? 'Refinery' : 'Depot'} (${fac.size === 'large' ? 'Large' : 'Small'})`} />
                        <Row k="Status" v={<span className="text-success">Selected in plan</span>} />
                        <Row k="Throughput" v={kt(fac.throughput_kt)} />
                        <Row k="Variable OpEx (annual)" v={varOpex == null ? '—' : usd(varOpex)} />
                        <Row k="Fixed OpEx (5% of CapEx)" v={usd(fixedOpex)} />
                        <Row k="Location rationale" v={<span className="text-xs font-normal">Facts only: {kt(inKt)} in, {kt(outKt)} out, {inb.length + out.length} flows, {usd(legCost)} transport on them.</span>} />
                    </>
                )}
                {tab === 'flows' && (
                    <>
                        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Inbound ({inb.length})</h3>
                        {inb.length === 0 && <p className="py-2 text-sm text-muted">None</p>}
                        {inb.map(({ f, i }) => <FlowRow key={i} f={f} index={i} dir="in" />)}
                        <h3 className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-muted">Outbound ({out.length})</h3>
                        {out.length === 0 && <p className="py-2 text-sm text-muted">None</p>}
                        {out.map(({ f, i }) => <FlowRow key={i} f={f} index={i} dir="out" />)}
                    </>
                )}
                {tab === 'why' && (
                    <>
                        <p className="mb-2 text-xs font-medium text-muted">Facts from this run, not solver reasoning</p>
                        <Row k="Utilisation" v={pct(fac.utilisation)} />
                        <Row k="Throughput" v={kt(fac.throughput_kt)} />
                        <Row k="Inbound flows" v={`${inb.length} (${kt(inKt)})`} />
                        <Row k="Outbound flows" v={`${out.length} (${kt(outKt)})`} />
                        <Row k="Transport cost on flows" v={usdExact(legCost)} />
                        <Row k="Also opened in greedy baseline" v={inBase === null ? 'baseline not available' : inBase ? 'yes' : 'no'} />
                    </>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 pb-4 pt-2">
                <button type="button" className="btn-secondary" onClick={() => go('results', 'facilities')}>View all facilities</button>
                <button type="button" className="btn-secondary" onClick={() => setTab('flows')}>Show connected flows</button>
            </div>
        </div>
    );
}

function SiteOrAirportView({ id }: { id: string }) {
    const { solution, selectFlow } = useApp();
    const site = siteById(id);
    const flows = (solution?.flows ?? []).map((f, i) => ({ f, i })).filter(({ f }) => f.from === id || f.to === id);
    const airportFlows = flows.filter(({ f }) => f.leg === 'refinery_airport' && f.to === id);
    const isAirport = airportFlows.length > 0 && !site;
    const label = site?.label ?? airportFlows[0]?.f.to_label ?? id;
    const inbound = airportFlows.reduce((s, { f }) => s + f.kt, 0);
    return (
        <div className="p-4">
            <Row k="ID" v={id} />
            <Row k="Label" v={label} />
            {site && (
                <>
                    <Row k="Role" v={site.sea ? 'Supply only (plots in the sea)' : 'Collection site'} />
                    <Row k="Biomass available" v={kt(site.kt)} />
                    <Row k="Province" v={site.province} />
                    <Row k="District" v={site.district} />
                    <Row k="Lat / lon" v={`${site.lat.toFixed(4)}, ${site.lon.toFixed(4)}`} />
                </>
            )}
            {isAirport && (
                <>
                    <Row k="Role" v="Airport" />
                    <Row k="Inbound SAF" v={kt(inbound)} />
                </>
            )}
            <h3 className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-muted">Connected flows ({flows.length})</h3>
            {flows.length === 0 && <p className="py-2 text-sm text-muted">No flows touch this node in this run.</p>}
            {flows.map(({ f, i }) => (
                <button key={i} type="button" onClick={() => selectFlow({ flow: f, index: i })} className="flex w-full items-center justify-between gap-2 border-b border-line/60 py-2 text-left text-sm hover:bg-app">
                    <span className="min-w-0 truncate text-deep">{f.from === id ? `to ${f.to_label}` : `from ${f.from_label}`}</span>
                    <span className="num shrink-0 text-deep">{kt(f.kt)}</span>
                </button>
            ))}
        </div>
    );
}

function RouteView({ flow, index }: { flow: Flow; index: number }) {
    return (
        <div className="p-4">
            <Row k="Origin" v={`${flow.from_label} (${flow.from})`} />
            <Row k="Destination" v={`${flow.to_label} (${flow.to})`} />
            <Row k="Leg" v={LEG_LABEL[flow.leg]} />
            <Row k="Commodity" v={flow.commodity} />
            <Row k="Flow" v={kt(flow.kt, 3)} />
            <Row k="Great-circle distance" v={km(flow.hav_km, 2)} />
            <Row k="Road factor" v={flow.road_factor} />
            <Row k="Costed distance" v={km(flow.km, 2)} />
            <Row k="Rate" v={`$${flow.rate_usd_per_t_km} / t·km`} />
            <Row k="Cost" v={usdExact(flow.cost_usd)} />
            <Row k="Truck size" v={`${flow.truck_t} t`} />
            <Row k="Trips" v={orMissing(flow.trips, (x: number) => x.toLocaleString('en-US'))} />
            <Row k="Flow index" v={index} />
            <p className="mt-3 text-sm text-deep">
                <span className="font-medium">Method:</span> Great-circle × road factor (costed estimate).
            </p>
            {flow.road_km != null && (
                <p className="mt-2 rounded-lg bg-app p-3 text-sm text-deep">
                    <span className="num font-medium">{km(flow.road_km, 1)}</span> OSRM road (car profile), reference only. It is not the costed distance.
                </p>
            )}
            {flow.to === 'TRK' && flow.leg === 'refinery_airport' && (
                <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-deep">Tarakan is an island: this last leg is a barge, so trucks do not reach it.</p>
            )}
        </div>
    );
}

export default function Inspector({ onClose }: { onClose?: () => void }) {
    const { solution, selectedNode, selectedFlow, selectNode, selectFlow } = useApp();
    // A flow selection shows its origin on the Facility tab; a node selection shows that node.
    const focusId = selectedNode ?? selectedFlow?.flow.from ?? null;
    // A site can host one depot and one refinery; show a switch rather than silently picking one.
    const facs = focusId ? (solution?.facilities ?? []).filter((f) => f.site_id === focusId) : [];
    const [facType, setFacType] = useState<'refinery' | 'depot'>('refinery');
    const fac = facs.find((f) => f.type === facType) ?? facs[0];
    const [top, setTop] = useState<'facility' | 'route'>('facility');
    // Follow the selection: picking a flow opens Route Details, picking a node opens Facility Details.
    useEffect(() => {
        setTop(selectedFlow ? 'route' : 'facility');
    }, [selectedFlow, selectedNode]);
    const showRoute = top === 'route' && !!selectedFlow;
    const refs = (solution?.facilities ?? []).filter((f) => f.type === 'refinery');
    const deps = (solution?.facilities ?? []).filter((f) => f.type === 'depot');
    const has = !!selectedNode || !!selectedFlow;
    const tabCls = (on: boolean, disabled = false) =>
        `border-b-2 px-1 pb-2 pt-3 text-sm font-medium ${on ? 'border-primary text-primary' : 'border-transparent text-muted'} ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:text-deep'}`;
    return (
        <div>
            <div className="flex items-center justify-between gap-2 border-b border-line px-4">
                <div className="flex gap-5" role="tablist">
                    <button type="button" role="tab" aria-selected={!showRoute} className={tabCls(!showRoute)} onClick={() => setTop('facility')}>Facility Details</button>
                    <button type="button" role="tab" aria-selected={showRoute} disabled={!selectedFlow} className={tabCls(showRoute, !selectedFlow)} onClick={() => setTop('route')}>Route Details</button>
                </div>
                <button
                    type="button"
                    aria-label={has ? 'Clear selection' : 'Collapse inspector'}
                    className="rounded p-1 text-muted hover:bg-app hover:text-deep"
                    onClick={() => {
                        if (has) {
                            selectNode(null);
                            selectFlow(null);
                        } else onClose?.();
                    }}
                >
                    <IconClose width={16} height={16} />
                </button>
            </div>
            {showRoute && selectedFlow ? (
                <RouteView flow={selectedFlow.flow} index={selectedFlow.index} />
            ) : fac ? (
                <>
                    {facs.length > 1 && (
                        <div className="flex gap-2 px-4 pt-3" role="group" aria-label="Facility at this site">
                            {facs.map((f) => (
                                <button
                                    key={f.type}
                                    type="button"
                                    aria-pressed={f.type === fac.type}
                                    onClick={() => setFacType(f.type)}
                                    className={`chip capitalize ${f.type === fac.type ? 'bg-primary text-white' : 'bg-slate-100 text-muted hover:text-deep'}`}
                                >
                                    {f.type} ({f.size})
                                </button>
                            ))}
                        </div>
                    )}
                    <FacilityView key={`${fac.site_id}-${fac.type}-${selectedFlow ? 'f' : 'n'}`} fac={fac} goFlows={false} />
                </>
            ) : selectedNode ? (
                <SiteOrAirportView id={selectedNode} />
            ) : (
                <div className="p-4">
                    <p className="mb-3 text-sm text-muted">Select a facility or route on the map</p>
                    {[{ name: 'Refineries', list: refs }, { name: 'Depots', list: deps }].map(({ name, list }) => (
                        <div key={name} className="mb-4">
                            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{name} ({list.length})</h3>
                            {list.map((f) => (
                                <button key={f.site_id} type="button" onClick={() => { setFacType(f.type); selectNode(f.site_id); }} className="flex w-full items-center justify-between gap-2 border-b border-line/60 py-1.5 text-left text-sm hover:bg-app">
                                    <span className="min-w-0 truncate text-deep">{f.label}</span>
                                    <span className="num shrink-0 text-xs text-muted">{f.size} · {pct(f.utilisation, 0)}</span>
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
