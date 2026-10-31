'use client';

import { useState } from 'react';
import type { Facility, Flow, Leg, Solution } from '../../lib/contract';
import { LEG_LABEL, MISSING, pct, usd } from '../../lib/format';
import { runRoadFactor } from '../../lib/trace';
import { useApp } from '../../lib/store';
import { Card, EmptyState } from '../common/ui';
import { SearchBox, Th, sortRows, useDebouncedFilter, useSort } from './shared';

const f1 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

type FKey = 'id' | 'label' | 'type' | 'size' | 'lat' | 'lon' | 'cap' | 'thr' | 'util' | 'capex';

export function FacilitiesTable({ solution }: { solution: Solution }) {
    const { selectNode, go } = useApp();
    const [q, setQ] = useState('');
    const sort = useSort<FKey>('capex');
    const rows = useDebouncedFilter(solution.facilities, q, (f) => `${f.site_id} ${f.label} ${f.type} ${f.size}`);
    const get: Record<FKey, (f: Facility) => string | number> = {
        id: (f) => f.site_id, label: (f) => f.label, type: (f) => f.type, size: (f) => f.size, lat: (f) => f.lat, lon: (f) => f.lon,
        cap: (f) => f.capacity_kt, thr: (f) => f.throughput_kt, util: (f) => f.utilisation, capex: (f) => f.capex_usd,
    };
    const sorted = sortRows(rows, get[sort.key], sort.dir);
    return (
        <Card title={`Facilities (${sorted.length} of ${solution.facilities.length})`} aside={<SearchBox value={q} onChange={setQ} placeholder="Search id, label, type" />} bodyClass="p-0">
            {sorted.length === 0 ? <div className="p-5"><EmptyState title="No facilities match" /></div> : (
                <div className="overflow-x-auto">
                    <table className="tbl w-full">
                        <thead><tr>
                            <Th label="Site" k="id" sort={sort} /><Th label="Label" k="label" sort={sort} /><Th label="Type" k="type" sort={sort} /><Th label="Size" k="size" sort={sort} />
                            <Th label="Lat" k="lat" sort={sort} align="right" /><Th label="Lon" k="lon" sort={sort} align="right" />
                            <Th label="Capacity" k="cap" sort={sort} align="right" /><Th label="Throughput kt" k="thr" sort={sort} align="right" /><Th label="Util." k="util" sort={sort} align="right" />
                            <Th label="CapEx" k="capex" sort={sort} align="right" /><th />
                        </tr></thead>
                        <tbody>
                            {sorted.map((f) => (
                                <tr key={`${f.site_id}-${f.type}`}>
                                    <td className="num">{f.site_id}</td><td>{f.label}</td><td>{f.type}</td><td>{f.size}</td>
                                    <td className="num text-right">{f.lat.toFixed(3)}</td><td className="num text-right">{f.lon.toFixed(3)}</td>
                                    <td className="num text-right">{f1(f.capacity_kt)} kt <span className="text-muted">{f.capacity_basis === 'biomass_in' ? 'biomass in' : 'SAF out'}</span></td>
                                    <td className="num text-right">{f1(f.throughput_kt)}</td>
                                    <td className="num text-right">{pct(f.utilisation)}</td>
                                    <td className="num text-right">{usd(f.capex_usd)}</td>
                                    <td><button type="button" className="btn-secondary whitespace-nowrap" onClick={() => { selectNode(f.site_id); go('network'); }}>View on map</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

type WKey = 'from' | 'leg' | 'kt' | 'hav' | 'rf' | 'km' | 'road' | 'cost';
const PAGE = 100;

export function FlowsTable({ solution }: { solution: Solution }) {
    const { selectFlow, go } = useApp();
    const [q, setQ] = useState('');
    const [leg, setLeg] = useState<'all' | Leg>('all');
    const [shown, setShown] = useState(PAGE);
    const sort = useSort<WKey>('cost');
    const indexed = solution.flows.map((flow, index) => ({ flow, index }));
    const byLeg = leg === 'all' ? indexed : indexed.filter((r) => r.flow.leg === leg);
    const rows = useDebouncedFilter(byLeg, q, (r) => `${r.flow.from} ${r.flow.to} ${r.flow.from_label} ${r.flow.to_label}`);
    const rf = (f: Flow) => runRoadFactor(solution, f)?.value ?? f.road_factor;
    const get: Record<WKey, (r: { flow: Flow }) => string | number | null> = {
        from: (r) => r.flow.from, leg: (r) => r.flow.leg, kt: (r) => r.flow.kt, hav: (r) => r.flow.hav_km, rf: (r) => rf(r.flow), km: (r) => r.flow.km,
        road: (r) => r.flow.road_km ?? null, cost: (r) => r.flow.cost_usd,
    };
    const sorted = sortRows(rows, get[sort.key], sort.dir);
    return (
        <Card
            title={`Flows (${sorted.length} of ${solution.flows.length})`}
            aside={<div className="flex gap-2">
                <select className="input" aria-label="Leg filter" value={leg} onChange={(e) => { setLeg(e.target.value as 'all' | Leg); setShown(PAGE); }}>
                    <option value="all">All legs</option>
                    {(Object.keys(LEG_LABEL) as Leg[]).map((l) => <option key={l} value={l}>{LEG_LABEL[l]}</option>)}
                </select>
                <SearchBox value={q} onChange={(v) => { setQ(v); setShown(PAGE); }} placeholder="Search from / to" />
            </div>}
            bodyClass="p-0"
        >
            {sorted.length === 0 ? <div className="p-5"><EmptyState title="No flows match" /></div> : (
                <div className="overflow-x-auto">
                    <table className="tbl w-full">
                        <thead><tr>
                            <Th label="From → to" k="from" sort={sort} /><Th label="Leg" k="leg" sort={sort} /><Th label="kt" k="kt" sort={sort} align="right" />
                            <Th label="Hav km" k="hav" sort={sort} align="right" /><Th label="Road factor" k="rf" sort={sort} align="right" /><Th label="Costed km" k="km" sort={sort} align="right" />
                            <Th label="OSRM road km" k="road" sort={sort} align="right" /><Th label="Cost" k="cost" sort={sort} align="right" /><th>Method</th><th />
                        </tr></thead>
                        <tbody>
                            {sorted.slice(0, shown).map(({ flow, index }) => (
                                <tr key={index}>
                                    <td className="whitespace-nowrap">{flow.from} → {flow.to}</td>
                                    <td className="whitespace-nowrap">{LEG_LABEL[flow.leg]}</td>
                                    <td className="num text-right">{f1(flow.kt)}</td>
                                    <td className="num text-right">{f1(flow.hav_km)}</td>
                                    <td className="num text-right">{rf(flow).toFixed(2)}</td>
                                    <td className="num text-right">{f1(flow.km)}</td>
                                    <td className="num text-right">{flow.road_km != null ? f1(flow.road_km) : '–'}</td>
                                    <td className="num text-right">{usd(flow.cost_usd)}</td>
                                    <td className="whitespace-nowrap text-muted">Great-circle × factor (estimate)</td>
                                    <td><button type="button" className="btn-secondary whitespace-nowrap" onClick={() => { selectFlow({ flow, index }); go('network'); }}>Show on map</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {shown < sorted.length && (
                        <div className="border-t border-line p-3 text-center">
                            <button type="button" className="btn-secondary" onClick={() => setShown((n) => n + PAGE)}>Show more ({sorted.length - shown} remaining)</button>
                        </div>
                    )}
                </div>
            )}
            <span className="sr-only">{MISSING}</span>
        </Card>
    );
}
