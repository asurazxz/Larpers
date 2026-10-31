'use client';

// Right-hand inspector for the Network Explorer: facility, site/airport or route details.
// Numbers come only from the displayed Solution (and sites.json for supply sites).
import { useState } from 'react';
import { useApp } from '../../lib/store';
import { siteById } from '../../lib/bundle';
import { LEG_LABEL, km, kt, orMissing, pct, usd, usdExact } from '../../lib/format';
import type { Facility, Flow } from '../../lib/contract';
import { Tabs } from '../common/ui';

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

function FacilityView({ fac }: { fac: Facility }) {
    const { solution, baseline } = useApp();
    const [tab, setTab] = useState<'overview' | 'flows' | 'costs' | 'why'>('overview');
    const flows = (solution?.flows ?? []).map((f, i) => ({ f, i }));
    const inb = flows.filter(({ f }) => f.to === fac.site_id);
    const out = flows.filter(({ f }) => f.from === fac.site_id);
    const inKt = inb.reduce((s, { f }) => s + f.kt, 0);
    const outKt = out.reduce((s, { f }) => s + f.kt, 0);
    const legCost = [...inb, ...out].reduce((s, { f }) => s + f.cost_usd, 0);
    const inBase = baseline ? baseline.facilities.some((b) => b.site_id === fac.site_id && b.type === fac.type) : null;
    return (
        <div>
            <Tabs
                tabs={[
                    { key: 'overview', label: 'Overview' },
                    { key: 'flows', label: 'Flows' },
                    { key: 'costs', label: 'Costs' },
                    { key: 'why', label: 'Why selected' },
                ]}
                active={tab}
                onChange={setTab}
            />
            <div className="p-4">
                {tab === 'overview' && (
                    <>
                        <Row k="Site ID" v={fac.site_id} />
                        <Row k="Label" v={fac.label} />
                        <Row k="Type" v={fac.type} />
                        <Row k="Size" v={fac.size} />
                        <Row k="Lat / lon" v={`${fac.lat.toFixed(4)}, ${fac.lon.toFixed(4)}`} />
                        <Row k={`Capacity (${CAP_BASIS[fac.capacity_basis]})`} v={kt(fac.capacity_kt)} />
                        <Row k="Throughput" v={kt(fac.throughput_kt)} />
                        <Row k="Utilisation" v={pct(fac.utilisation)} />
                        <div className="pb-2 pt-1">
                            <Bar value={fac.utilisation} />
                        </div>
                        <Row k="CapEx" v={usd(fac.capex_usd)} />
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
                {tab === 'costs' && (
                    <>
                        <Row k="CapEx (total)" v={usdExact(fac.capex_usd)} />
                        <Row k="Capacity" v={`${kt(fac.capacity_kt)} ${CAP_BASIS[fac.capacity_basis]}`} />
                        <Row k="Throughput" v={kt(fac.throughput_kt)} />
                        <Row k="Utilisation" v={pct(fac.utilisation)} />
                        <Row k="Transport cost on connected flows" v={usdExact(legCost)} />
                        <p className="mt-3 text-xs text-muted">Transport cost sums the costed flows touching this site (km = great-circle × road factor). Annualised CapEx and OpEx are reported for the whole network on the Results page, not per site.</p>
                    </>
                )}
                {tab === 'why' && (
                    <>
                        <p className="mb-2 text-xs font-medium text-muted">Facts from this run, not solver reasoning</p>
                        <Row k="Utilisation" v={pct(fac.utilisation)} />
                        <Row k="Throughput" v={kt(fac.throughput_kt)} />
                        <Row k="Inbound flows" v={`${inb.length} (${kt(inKt)})`} />
                        <Row k="Outbound flows" v={`${out.length} (${kt(outKt)})`} />
                        <Row k="CapEx" v={usd(fac.capex_usd)} />
                        <Row k="Also opened in greedy baseline" v={inBase === null ? 'baseline not available' : inBase ? 'yes' : 'no'} />
                    </>
                )}
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

export default function Inspector() {
    const { solution, selectedNode, selectedFlow, selectNode, selectFlow } = useApp();
    // A site can host one depot and one refinery; show a switch rather than silently picking one.
    const facs = selectedNode ? (solution?.facilities ?? []).filter((f) => f.site_id === selectedNode) : [];
    const [facType, setFacType] = useState<'refinery' | 'depot'>('refinery');
    const fac = facs.find((f) => f.type === facType) ?? facs[0];
    const has = !!selectedNode || !!selectedFlow;
    const title = selectedFlow ? 'Route' : fac ? fac.label : selectedNode ?? 'Inspector';
    const refs = (solution?.facilities ?? []).filter((f) => f.type === 'refinery');
    const deps = (solution?.facilities ?? []).filter((f) => f.type === 'depot');
    return (
        <div>
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <h2 className="min-w-0 truncate text-[15px] font-semibold text-deep">{title}</h2>
                {has && (
                    <button type="button" className="btn-secondary shrink-0" onClick={() => { selectNode(null); selectFlow(null); }}>
                        Clear selection
                    </button>
                )}
            </div>
            {selectedFlow ? (
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
                    <FacilityView key={`${fac.site_id}-${fac.type}`} fac={fac} />
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
