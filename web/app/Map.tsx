'use client';

// Client-only map. Load it with dynamic(() => import('./Map'), { ssr: false }).
// Every marker and line comes from the run data; nothing is hard-coded except site coordinates
// (sites.json, from data/raw) and the offline land layer (borneo.json).
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, Marker, Pane, Polyline, Popup, TileLayer } from 'react-leaflet';
import type { FeatureCollection } from 'geojson';
import borneo from '../data/borneo.json';
import type { Facility, Flow, Leg, Site, Solution } from '../lib/contract';
import { kt, km, LEG_LABEL, MISSING, orMissing, pct, usd, usdExact } from '../lib/format';
import { legMaxima, legWidth, sceneFromProgress, sceneFromSolution } from '../lib/scene';
import { isSolving, useSolveProgress, useSolving, type LiveNode, type SolveFeed } from '../lib/solveProgress';
import { BAND_COLOR, flowKey, type Band } from '../lib/view';
import FlowLayer from './FlowLayer';

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
    /** The solver's progress: during a live run the map draws what the solver has found so far. */
    feed: SolveFeed;
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
    supply_depot: '#2f9e4f',
    depot_refinery: '#e5a00d',
    refinery_airport: '#0ea5c6',
};
const SITE_GREEN = '#2f9e4f';
const DEPOT_AMBER = '#f0a30a';
const REFINERY_CYAN = '#0ea5c6';
const SEA = '#fbfbfd';
const LAND = '#e8e8ed';
/** If animation frames stop (hidden tab), the clickable layers still come back after this long. */
const SETTLE_LIMIT_MS = 2_000;

const AIRPORT_ICON = L.divIcon({
    className: 'saf-airport',
    html: '<div style="width:28px;height:28px;border-radius:50%;background:#fff;border:1.5px solid #1d1d1f;box-shadow:0 2px 6px rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;color:#1d1d1f">&#9992;</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
});

function refineryIcon(size: Facility['size'], dim: boolean): L.DivIcon {
    const px = size === 'large' ? 22 : 15;
    return L.divIcon({
        className: 'saf-refinery',
        html: `<div style="width:${px}px;height:${px}px;background:${REFINERY_CYAN};border:2px solid #075e70;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.2);opacity:${dim ? 0.35 : 1}"></div>`,
        iconSize: [px + 4, px + 4],
        iconAnchor: [(px + 4) / 2, (px + 4) / 2],
    });
}

const EXCLUDED_ICON = L.divIcon({
    className: 'saf-excluded',
    html: '<div style="width:22px;height:22px;border:2px solid #c0392b;border-radius:50%;background:rgba(255,255,255,0.9);box-shadow:0 1px 4px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;color:#c0392b;font-weight:700;font-size:15px;line-height:1">&#10005;</div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// Required wherever the imagery shows (CC BY-NC-SA 4.0). The year follows LAYER in scripts/make-site-images.mjs.
const SITE_IMAGE_CREDIT = 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)';

// Keeps tall image popups clear of the zoom control, which stacks above them.
const IMAGE_POPUP_PADDING: [number, number] = [56, 8];

// Fixed size so Leaflet places the popup correctly before the image loads. Relative src: the fallback runs from file://.
function SiteImage({ siteId }: { siteId: string }) {
    return (
        <figure style={{ margin: '0 0 8px', width: 280 }}>
            <div style={{ position: 'relative', height: 150, borderRadius: 8, overflow: 'hidden', background: '#e8e8ed' }}>
                <img src={`sites/${siteId}.jpg`} alt={`Satellite view centred on ${siteId}`} width={280} height={150} style={{ display: 'block' }} />
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: 14,
                        height: 14,
                        marginTop: -7,
                        marginLeft: -7,
                        border: '2px solid #ffffff',
                        borderRadius: '50%',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                    }}
                />
            </div>
            <figcaption style={{ marginTop: 4, fontSize: 12, lineHeight: 1.3, color: '#6e6e73' }}>
                Satellite view at the site&apos;s coordinates, 5.6 km wide. Not a site photo. {SITE_IMAGE_CREDIT}
            </figcaption>
        </figure>
    );
}

function PopupRows({ title, rows, imageSiteId }: { title: string; rows: [string, string][]; imageSiteId?: string }) {
    return (
        <div style={{ fontSize: 16, lineHeight: 1.4, minWidth: 230, color: '#1d1d1f' }}>
            <div style={{ fontWeight: 600, fontSize: 17, letterSpacing: '-0.01em', marginBottom: 6, paddingRight: 22 }}>{title}</div>
            {imageSiteId && <SiteImage siteId={imageSiteId} />}
            <table style={{ borderCollapse: 'collapse' }}>
                <tbody>
                    {rows.map(([k, v]) => (
                        <tr key={k}>
                            <td style={{ padding: '1px 12px 1px 0', color: '#6e6e73', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
                            <td style={{ padding: '1px 0', fontVariantNumeric: 'tabular-nums' }}>{v}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const NO_AIRPORTS: LiveNode[] = [];

/** The animated layer, on its own so the solver's events repaint this and not every marker. */
function LiveFlows({ feed, solution, sites, resting, highlight, onSettled }: {
    feed: SolveFeed;
    solution: Solution | null;
    sites: Site[];
    resting: boolean;
    highlight: ReadonlySet<string> | null;
    onSettled: (id: unknown) => void;
}) {
    const live = useSolveProgress(feed);
    const solving = isSolving(live);
    const scene = useMemo(() => {
        if (!solving || !live) return sceneFromSolution(solution);
        const at = new Map(sites.map((s) => [s.id, s]));
        return sceneFromProgress(live, (id) => at.get(id));
    }, [solving, live, solution, sites]);
    return <FlowLayer scene={scene} resting={resting} highlight={highlight} settleId={solving ? null : solution} onSettled={onSettled} colors={LEG_COLOR} />;
}

export default function SafMap({ solution, sites, highlight, onSelectFlow, onSelectNode, showTiles = false, bandFor, feed }: MapProps) {
    const renderer = useMemo(() => L.canvas({ padding: 0.5, tolerance: 6 }), []);
    const flows = useMemo(() => solution?.flows ?? [], [solution]);
    const facilities = useMemo(() => solution?.facilities ?? [], [solution]);
    const solving = useSolving(feed);
    const liveAirports = useSyncExternalStore(feed.subscribe, () => feed.get()?.airports ?? NO_AIRPORTS, () => NO_AIRPORTS);

    // The animated layer draws until it settles on this run; then the clickable Leaflet layers take over.
    const [settled, setSettled] = useState<unknown>(null);
    const resting = !solving && settled === solution;
    const onSettled = useCallback((id: unknown) => setSettled(id), []);
    useEffect(() => {
        if (solving) return undefined;
        const t = window.setTimeout(() => setSettled(solution), SETTLE_LIMIT_MS);
        return () => window.clearTimeout(t);
    }, [solving, solution]);
    const shownFlows = resting ? flows : [];
    const shownFacilities = resting ? facilities : [];
    // Refineries can sit at an airport, which has no site image.
    const siteIds = useMemo(() => new Set(sites.map((s) => s.id)), [sites]);
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

    const maxKt = useMemo(() => legMaxima(flows), [flows]);
    const widthOf = (f: Flow) => legWidth(f.leg, f.kt, maxKt[f.leg]);

    const facilityIds = new Set(facilities.map((f) => f.site_id));
    const excluded = solution?.scenario?.excluded_ids ?? [];
    const strandedIds = new Set((solution?.stranded ?? []).map((s) => s.site_id));
    const siteById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

    // Airports come from the run's refinery→airport flow ends: the contract has no airport list.
    // A live run names them up front, which covers a run that has no flows yet.
    const airports = useMemo(() => {
        const out = new Map<string, { id: string; label: string; lat: number; lon: number }>();
        for (const f of flows) {
            if (f.leg === 'refinery_airport' && !out.has(f.to)) {
                out.set(f.to, { id: f.to, label: f.to_label, lat: f.to_lat, lon: f.to_lon });
            }
        }
        for (const a of liveAirports) {
            if (!out.has(a.id)) out.set(a.id, a);
        }
        return [...out.values()];
    }, [flows, liveAirports]);

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
            style={{ height: '100%', width: '100%', background: SEA }}
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
                    style={{ color: '#c7c7cc', weight: 0.8, fillColor: LAND, fillOpacity: 1 }}
                    interactive={false}
                />
            </Pane>

            <LiveFlows feed={feed} solution={solution} sites={sites} resting={resting} highlight={resting ? hl : null} onSettled={onSettled} />

            {/* Flows, coloured by leg; 0 km co-located flows are kept in the data but not drawn. */}
            {shownFlows.map((f, i) => {
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
                            opacity: d ? 0.15 : 0.9,
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
                        radius={s.sea ? 4.5 : 3.5}
                        pathOptions={{
                            color: SITE_GREEN,
                            weight: s.sea ? 2.5 : 1,
                            fill: true,
                            fillColor: s.sea ? '#ffffff' : SITE_GREEN,
                            fillOpacity: s.sea ? (d ? 0.4 : 1) : d ? 0.25 : 0.9,
                            opacity: d ? 0.3 : 1,
                        }}
                        eventHandlers={{ click: () => onSelectNode?.(s.id) }}
                    >
                        <Popup autoPanPaddingTopLeft={IMAGE_POPUP_PADDING}>
                            <PopupRows
                                title={s.label}
                                imageSiteId={s.id}
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
                    pathOptions={{ color: '#c0392b', weight: 2, fill: false, dashArray: '3 3' }}
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
            {shownFacilities
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
                                color: '#8a5a00',
                                weight: 1.5,
                                fillColor: DEPOT_AMBER,
                                fillOpacity: d ? 0.3 : 0.95,
                                opacity: d ? 0.3 : 1,
                            }}
                            eventHandlers={{ click: () => onSelectNode?.(f.site_id) }}
                        >
                            <Popup autoPanPaddingTopLeft={IMAGE_POPUP_PADDING}>
                                <PopupRows
                                    title={`${f.size === 'large' ? 'Large' : 'Small'} depot`}
                                    imageSiteId={siteIds.has(f.site_id) ? f.site_id : undefined}
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
            {shownFacilities
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
                            <Popup autoPanPaddingTopLeft={IMAGE_POPUP_PADDING}>
                                <PopupRows
                                    title={`${f.size === 'large' ? 'Large' : 'Small'} refinery`}
                                    imageSiteId={siteIds.has(f.site_id) ? f.site_id : undefined}
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
                                    ['Demand', kt(demandOf(a.id), 1)],
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
