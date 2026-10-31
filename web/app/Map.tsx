'use client';

// Client-only map. Load it with dynamic(() => import('./Map'), { ssr: false }).
// Every marker and line comes from the run data; nothing is hard-coded except site coordinates
// (sites.json, from data/raw) and the offline land layer (borneo.json).
import { useMemo } from 'react';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, Marker, Pane, Polyline, Popup, TileLayer } from 'react-leaflet';
import type { FeatureCollection } from 'geojson';
import borneo from '../data/borneo.json';
import type { Facility, Flow, Leg, Site, Solution } from '../lib/contract';
import { kt, km, LEG_LABEL, MISSING, orMissing, pct, usd, usdExact } from '../lib/format';
import { BAND_COLOR, flowKey, type Band } from '../lib/view';

export interface MapProps {
    /** The run to draw. null draws sites only. */
    solution: Solution | null;
    /** All 80 supply sites (web/data/sites.json). */
    sites: Site[];
    /** Node ids (site ids, IATA codes) and flow keys (flowKey(flow)) to emphasise; others dim. Empty = no dimming. */
    highlight?: ReadonlySet<string>;
    /** Called when a flow line is clicked, with its index in solution.flows. */
    onSelectFlow?: (flow: Flow, index: number) => void;
    /** Called when a facility, site or airport marker is clicked. */
    onSelectNode?: (id: string) => void;
    /** Optional CARTO tiles under the land layer. Off by default and on stage. */
    showTiles?: boolean;
    /** Robustness band of a site's district; banded sites get a blue/orange ring. Absent = no rings. */
    bandFor?: (siteId: string) => Band | null;
}

export const KALIMANTAN_BOUNDS: L.LatLngBoundsExpression = [
    [-4.4, 108.5],
    [4.6, 119.4],
];
const MAX_BOUNDS: L.LatLngBoundsExpression = [
    [-9, 103],
    [10, 125],
];

export const LEG_COLOR: Record<Leg, string> = {
    supply_depot: '#2e9e44',
    depot_refinery: '#e0a100',
    refinery_airport: '#0aa5c2',
};
const SITE_GREEN = '#2e9e44';
const DEPOT_AMBER = '#e0a100';
const REFINERY_CYAN = '#0aa5c2';

const AIRPORT_ICON = L.divIcon({
    className: 'saf-airport',
    html: '<div style="width:26px;height:26px;border-radius:50%;background:#fff;border:2px solid #1f2937;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;color:#1f2937">&#9992;</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
});

function refineryIcon(size: Facility['size'], dim: boolean): L.DivIcon {
    const px = size === 'large' ? 22 : 15;
    return L.divIcon({
        className: 'saf-refinery',
        html: `<div style="width:${px}px;height:${px}px;background:${REFINERY_CYAN};border:2px solid #0b4f5c;opacity:${dim ? 0.35 : 1}"></div>`,
        iconSize: [px + 4, px + 4],
        iconAnchor: [(px + 4) / 2, (px + 4) / 2],
    });
}

const EXCLUDED_ICON = L.divIcon({
    className: 'saf-excluded',
    html: '<div style="width:22px;height:22px;border:2px solid #c62828;border-radius:50%;background:rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;color:#c62828;font-weight:700;font-size:16px;line-height:1">&#10005;</div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function PopupRows({ title, rows }: { title: string; rows: [string, string][] }) {
    return (
        <div style={{ fontSize: 15, lineHeight: 1.35, minWidth: 220 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
            <table>
                <tbody>
                    {rows.map(([k, v]) => (
                        <tr key={k}>
                            <td style={{ paddingRight: 8, color: '#4b5563', verticalAlign: 'top' }}>{k}</td>
                            <td>{v}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function SafMap({ solution, sites, highlight, onSelectFlow, onSelectNode, showTiles = false, bandFor }: MapProps) {
    const renderer = useMemo(() => L.canvas({ padding: 0.5, tolerance: 6 }), []);
    const flows = useMemo(() => solution?.flows ?? [], [solution]);
    const facilities = useMemo(() => solution?.facilities ?? [], [solution]);
    const hl = highlight && highlight.size > 0 ? highlight : null;
    const dim = (id: string) => (hl ? !hl.has(id) : false);

    const flowsOut = useMemo(() => {
        const m = new Map<string, Flow[]>();
        for (const f of flows) m.set(f.from, [...(m.get(f.from) ?? []), f]);
        return m;
    }, [flows]);
    const flowsIn = useMemo(() => {
        const m = new Map<string, Flow[]>();
        for (const f of flows) m.set(f.to, [...(m.get(f.to) ?? []), f]);
        return m;
    }, [flows]);

    // Width proportional to kt, scaled within each leg.
    const maxKt = useMemo(() => {
        const m: Record<Leg, number> = { supply_depot: 1, depot_refinery: 1, refinery_airport: 1 };
        for (const f of flows) m[f.leg] = Math.max(m[f.leg], f.kt);
        return m;
    }, [flows]);
    const widthOf = (f: Flow) => {
        const base = f.leg === 'supply_depot' ? 1.5 : f.leg === 'depot_refinery' ? 2 : 2.5;
        const span = f.leg === 'supply_depot' ? 3 : 6;
        return base + span * (f.kt / maxKt[f.leg]);
    };

    const facilityIds = new Set(facilities.map((f) => f.site_id));
    const excluded = solution?.scenario?.excluded_ids ?? [];
    const strandedIds = new Set((solution?.stranded ?? []).map((s) => s.site_id));
    const siteById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

    // Airports come from the run: solution.airports if present, else the refinery→airport flow ends.
    const airports = useMemo(() => {
        const out = new Map<string, { id: string; label?: string; lat: number; lon: number; demand_kt?: number }>();
        for (const a of solution?.airports ?? []) out.set(String(a.id), { ...a, id: String(a.id) });
        for (const f of flows) {
            if (f.leg === 'refinery_airport' && !out.has(f.to)) {
                out.set(f.to, { id: f.to, label: f.to_label, lat: f.to_lat, lon: f.to_lon });
            }
        }
        return [...out.values()];
    }, [solution, flows]);

    const demandOf = (id: string): number | undefined => {
        const d = solution?.scenario?.demand_kt;
        return d ? (d as Record<string, number>)[id] : undefined;
    };

    return (
        <MapContainer
            bounds={KALIMANTAN_BOUNDS}
            maxBounds={MAX_BOUNDS}
            maxBoundsViscosity={1}
            minZoom={5}
            maxZoom={11}
            zoomSnap={0.25}
            preferCanvas
            renderer={renderer}
            attributionControl={showTiles}
            style={{ height: '100%', width: '100%', background: '#d9ecf4' }}
        >
            {showTiles && (
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
                    attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                />
            )}
            {/* Offline land layer, below tilePane (200) so tiles, if on and loaded, cover it. */}
            <Pane name="land" style={{ zIndex: 150 }}>
                <GeoJSON
                    data={borneo as unknown as FeatureCollection}
                    style={{ color: '#9ca3af', weight: 0.8, fillColor: '#f3efe6', fillOpacity: 1 }}
                    interactive={false}
                />
            </Pane>

            {/* Flows, coloured by leg; 0 km co-located flows are kept in the data but not drawn. */}
            {flows.map((f, i) => {
                if (!(f.km > 0) || (f.from_lat === f.to_lat && f.from_lon === f.to_lon)) return null;
                const key = flowKey(f);
                const d = dim(key);
                return (
                    <Polyline
                        key={`${key}#${i}`}
                        positions={[
                            [f.from_lat, f.from_lon],
                            [f.to_lat, f.to_lon],
                        ]}
                        pathOptions={{
                            color: LEG_COLOR[f.leg],
                            weight: widthOf(f) + (hl && !d ? 2 : 0),
                            opacity: d ? 0.15 : 0.85,
                            lineCap: 'round',
                        }}
                        eventHandlers={{ click: () => onSelectFlow?.(f, i) }}
                    >
                        <Popup>
                            <PopupRows
                                title={`${LEG_LABEL[f.leg]}`}
                                rows={[
                                    ['From', f.from_label ?? f.from],
                                    ['To', f.to_label ?? f.to],
                                    [f.commodity === 'saf' ? 'SAF kt/year' : 'kt/year', kt(f.kt, 2)],
                                    ['Distance', `${km(f.hav_km)} × ${f.road_factor} = ${km(f.km)}`],
                                    ['Rate', `$${f.rate_usd_per_t_km}/t/km`],
                                    ['Cost/year', usdExact(f.cost_usd)],
                                ]}
                            />
                        </Popup>
                    </Polyline>
                );
            })}

            {/* Biomass supply sites: small green; sea sites hollow (supply only). */}
            {sites.map((s) => {
                const used = sum((flowsOut.get(s.id) ?? []).filter((f) => f.leg === 'supply_depot').map((f) => f.kt));
                const d = dim(s.id);
                return (
                    <CircleMarker
                        key={s.id}
                        center={[s.lat, s.lon]}
                        radius={s.sea ? 4 : 3.5}
                        pathOptions={{
                            color: SITE_GREEN,
                            weight: s.sea ? 1.5 : 1,
                            fill: !s.sea,
                            fillColor: SITE_GREEN,
                            fillOpacity: d ? 0.25 : 0.9,
                            opacity: d ? 0.3 : 1,
                        }}
                        eventHandlers={{ click: () => onSelectNode?.(s.id) }}
                    >
                        <Popup>
                            <PopupRows
                                title={s.label}
                                rows={[
                                    ['Site ID', s.id],
                                    ['Availability', kt(s.kt, 2)],
                                    ['Quantity used', solution ? kt(used, 2) : MISSING],
                                    ...(strandedIds.has(s.id) ? ([['Stranded', 'Not collected in this run']] as [string, string][]) : []),
                                    ...(s.sea ? ([['Note', 'Offshore, not a facility candidate']] as [string, string][]) : []),
                                ]}
                            />
                        </Popup>
                    </CircleMarker>
                );
            })}

            {/* Robustness bands (district level): blue = all / most (dashed), orange = some. Not clickable. */}
            {bandFor &&
                sites.map((s) => {
                    const b = bandFor(s.id);
                    if (!b) return null;
                    return (
                        <CircleMarker
                            key={`band-${s.id}`}
                            center={[s.lat, s.lon]}
                            radius={8}
                            interactive={false}
                            pathOptions={{ color: BAND_COLOR[b], weight: b === 'all' ? 3 : 2.5, fill: false, dashArray: b === 'most' ? '4 3' : undefined }}
                        />
                    );
                })}

            {/* Stranded supply: hollow red ring. */}
            {(solution?.stranded ?? []).map((s) => (
                <CircleMarker
                    key={`stranded-${s.site_id}`}
                    center={[s.lat, s.lon]}
                    radius={9}
                    pathOptions={{ color: '#c62828', weight: 2, fill: false, dashArray: '3 3' }}
                    eventHandlers={{ click: () => onSelectNode?.(s.site_id) }}
                >
                    <Popup>
                        <PopupRows
                            title={s.label ?? s.site_id}
                            rows={[
                                ['Stranded', kt(s.kt, 2)],
                                ['Reason', orMissing(s.reason)],
                            ]}
                        />
                    </Popup>
                </CircleMarker>
            ))}

            {/* Depots: amber circle, larger when large. */}
            {facilities
                .filter((f) => f.type === 'depot')
                .map((f) => {
                    const inKt = sum((flowsIn.get(f.site_id) ?? []).filter((x) => x.leg === 'supply_depot').map((x) => x.kt));
                    const outFlows = (flowsOut.get(f.site_id) ?? []).filter((x) => x.leg === 'depot_refinery');
                    const d = dim(f.site_id);
                    return (
                        <CircleMarker
                            key={`depot-${f.site_id}`}
                            center={[f.lat, f.lon]}
                            radius={f.size === 'large' ? 9 : 6}
                            pathOptions={{
                                color: '#7a5600',
                                weight: 1.5,
                                fillColor: DEPOT_AMBER,
                                fillOpacity: d ? 0.3 : 0.95,
                                opacity: d ? 0.3 : 1,
                            }}
                            eventHandlers={{ click: () => onSelectNode?.(f.site_id) }}
                        >
                            <Popup>
                                <PopupRows
                                    title={`${f.size === 'large' ? 'Large' : 'Small'} depot`}
                                    rows={[
                                        ['Site', f.label ?? f.site_id],
                                        ['Capacity', kt(f.capacity_kt, 0)],
                                        ['Throughput', kt(f.throughput_kt, 2)],
                                        ['Utilisation', pct(f.utilisation)],
                                        ['Inbound', `${kt(inKt, 2)} from ${(flowsIn.get(f.site_id) ?? []).filter((x) => x.leg === 'supply_depot').length} sites`],
                                        ['Outbound', outFlows.map((x) => `${kt(x.kt, 2)} to ${x.to}`).join('; ') || MISSING],
                                        ['CapEx', usd(f.capex_usd)],
                                    ]}
                                />
                            </Popup>
                        </CircleMarker>
                    );
                })}

            {/* Refineries: cyan square, larger when large. */}
            {facilities
                .filter((f) => f.type === 'refinery')
                .map((f) => {
                    const links = (flowsOut.get(f.site_id) ?? []).filter((x) => x.leg === 'refinery_airport');
                    return (
                        <Marker
                            key={`ref-${f.site_id}`}
                            position={[f.lat, f.lon]}
                            icon={refineryIcon(f.size, dim(f.site_id))}
                            eventHandlers={{ click: () => onSelectNode?.(f.site_id) }}
                        >
                            <Popup>
                                <PopupRows
                                    title={`${f.size === 'large' ? 'Large' : 'Small'} refinery`}
                                    rows={[
                                        ['Site', f.label ?? f.site_id],
                                        ['SAF output', kt(sum(links.map((x) => x.kt)) + sum((solution?.surplus ?? []).filter((s) => s.site_id === f.site_id).map((s) => s.kt)), 2)],
                                        ['Capacity', `${kt(f.capacity_kt, 0)} (${orMissing(f.capacity_basis)})`],
                                        ['Utilisation', pct(f.utilisation)],
                                        ['Airport links', links.map((x) => `${x.to} ${kt(x.kt, 1)}`).join('; ') || MISSING],
                                        ['CapEx', usd(f.capex_usd)],
                                    ]}
                                />
                            </Popup>
                        </Marker>
                    );
                })}

            {/* Airports: white aircraft marker. */}
            {airports.map((a) => {
                const inbound = (flowsIn.get(a.id) ?? []).filter((x) => x.leg === 'refinery_airport');
                return (
                    <Marker
                        key={`apt-${a.id}`}
                        position={[a.lat, a.lon]}
                        icon={AIRPORT_ICON}
                        eventHandlers={{ click: () => onSelectNode?.(a.id) }}
                    >
                        <Popup>
                            <PopupRows
                                title={a.label ?? a.id}
                                rows={[
                                    ['Demand', kt(a.demand_kt ?? demandOf(a.id), 1)],
                                    ['Delivered', kt(sum(inbound.map((x) => x.kt)), 2)],
                                    ['From refineries', inbound.map((x) => x.from_label ?? x.from).join('; ') || MISSING],
                                ]}
                            />
                        </Popup>
                    </Marker>
                );
            })}

            {/* Excluded facilities: crossed-out marker. */}
            {excluded.map((id) => {
                const s = siteById.get(id);
                if (!s || facilityIds.has(id)) return null;
                return (
                    <Marker key={`excl-${id}`} position={[s.lat, s.lon]} icon={EXCLUDED_ICON}>
                        <Popup>
                            <PopupRows
                                title={`Excluded: ${s.label}`}
                                rows={[
                                    ['Why', 'Excluded in this scenario (excluded_ids): site unavailable at design stage'],
                                    ['Still supplies', kt(s.kt, 2)],
                                ]}
                            />
                        </Popup>
                    </Marker>
                );
            })}
        </MapContainer>
    );
}
