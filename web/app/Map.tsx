'use client';

// Client-only map. Load it with dynamic(() => import('./Map'), { ssr: false }).
// Every marker and line comes from the run data; nothing is hard-coded except site coordinates
// (sites.json, from data/raw) and the offline land layer (borneo.json).
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, Marker, Pane, Polyline, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import type { FeatureCollection } from 'geojson';
import borneo from '../data/borneo.json';
import type { Facility, Flow, Leg, Site, Solution } from '../lib/contract';
import { kt, km, LEG_LABEL, MISSING, orMissing, pct, usd } from '../lib/format';
import { roadPath, type LatLon } from '../lib/routes';
import { legMaxima, legWidth, sceneFromProgress, sceneFromSolution } from '../lib/scene';
import { isSolving, useSolveProgress, useSolving, type LiveNode, type SolveFeed } from '../lib/solveProgress';
import { isOsrmLeg } from '../lib/trace';
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
    /** Robustness band of a site's district; banded sites get a blue/orange ring. Absent = no rings. */
    bandFor?: (siteId: string) => Band | null;
    /** The solver's progress: during a live run the map draws what the solver has found so far. */
    feed: SolveFeed;
    /** Corner for the zoom +/- buttons. Default 'topleft' (Leaflet's own control). */
    zoomPosition?: L.ControlPosition;
    /** Space popups keep clear of at the top left, for overlays drawn over the map (e.g. the Explorer's layers panel). */
    popupPaddingTopLeft?: [number, number];
    /** Static thumbnail: no popups, no pan or zoom, no controls; any click calls onPreviewClick. */
    preview?: boolean;
    onPreviewClick?: () => void;
    /** Called when the empty map is clicked, so the app can drop its selection (and the dimming). */
    onClearSelection?: () => void;
}

const ESRI_ATTRIBUTION = 'Tiles &copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors';

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

/**
 * Line(s) to draw for one flow. With a stored OSRM route: the road geometry solid, plus dashed connectors where an
 * end snapped more than 1 km to the road (offshore sites). Without one, or for the TRK barge: one dashed straight line.
 */
function flowPaths(f: Flow): { solid: LatLon[] | null; dashed: LatLon[][] } {
    const from: LatLon = [f.from_lat, f.from_lon];
    const to: LatLon = [f.to_lat, f.to_lon];
    const r = roadPath(f.from, f.to, from, to);
    return r ? { solid: r.road, dashed: r.snaps } : { solid: null, dashed: [[from, to]] };
}

// Required wherever the imagery shows (CC BY-NC-SA 4.0). The year follows LAYER in scripts/make-site-images.mjs.
// The credit is kept to one line in the popup; the link goes to the full EOxCloudless attribution page.
const SITE_IMAGE_CREDIT = 'EOxCloudless 2025, EOX IT Services, contains modified Copernicus Sentinel data';

// Keeps popups clear of the zoom control, which stacks above them.
const IMAGE_POPUP_PADDING: [number, number] = [56, 8];

// Fixed size so Leaflet places the popup correctly before the image loads. Relative src: the fallback runs from file://.
function SiteImage({ siteId }: { siteId: string }) {
    return (
        <figure style={{ margin: '6px 0 0', width: 220 }}>
            <div style={{ position: 'relative', height: 110, borderRadius: 6, overflow: 'hidden', background: '#e8e8ed' }}>
                <img src={`sites/${siteId}.jpg`} alt={`Satellite view centred on ${siteId}`} width={220} height={110} style={{ display: 'block', objectFit: 'cover' }} />
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: 12,
                        height: 12,
                        marginTop: -6,
                        marginLeft: -6,
                        border: '2px solid #ffffff',
                        borderRadius: '50%',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                    }}
                />
            </div>
            <figcaption style={{ marginTop: 3, fontSize: 10.5, lineHeight: 1.3, color: '#6e6e73' }}>
                Satellite view, 5.6 km wide. Not a site photo.{' '}
                <a href="https://cloudless.eox.at" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                    {SITE_IMAGE_CREDIT}
                </a>
                .
            </figcaption>
        </figure>
    );
}

// Title and rows come first so they are visible in a small map; the image follows.
function PopupRows({ title, subtitle, rows, imageSiteId }: { title: string; subtitle?: string; rows: [string, ReactNode][]; imageSiteId?: string }) {
    return (
        <div style={{ fontSize: 13, lineHeight: 1.35, minWidth: 200, color: '#1d1d1f' }}>
            <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em', paddingRight: 20 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11.5, color: '#6e6e73', marginBottom: 4 }}>{subtitle}</div>}
            <table style={{ borderCollapse: 'collapse', marginTop: subtitle ? 0 : 4 }}>
                <tbody>
                    {rows.map(([k, v]) => (
                        <tr key={k}>
                            <td style={{ padding: '1px 10px 1px 0', color: '#6e6e73', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
                            <td style={{ padding: '1px 0', fontVariantNumeric: 'tabular-nums' }}>{v}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {imageSiteId && <SiteImage siteId={imageSiteId} />}
        </div>
    );
}

/** The preview click and the empty-map click, on the map itself. Closing a popup keeps the selection: the
 * Explorer's inspector shows it. Clicking empty map is the deliberate deselect. */
function MapEvents({ preview, onPreviewClick, onClearSelection }: { preview: boolean; onPreviewClick?: () => void; onClearSelection?: () => void }) {
    useMapEvents({
        click: () => (preview ? onPreviewClick?.() : onClearSelection?.()),
    });
    return null;
}

/** Reset-view button under the zoom buttons: auto-pan can leave the map displaced. */
function FitControl({ position }: { position: L.ControlPosition }) {
    const map = useMap();
    useEffect(() => {
        const Fit = L.Control.extend({
            onAdd() {
                const bar = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
                const a = L.DomUtil.create('a', '', bar) as HTMLAnchorElement;
                a.href = '#';
                a.title = 'Fit network';
                a.setAttribute('role', 'button');
                a.setAttribute('aria-label', 'Fit network');
                a.innerHTML = '&#8962;';
                L.DomEvent.disableClickPropagation(bar);
                L.DomEvent.on(a, 'click', (e) => {
                    L.DomEvent.preventDefault(e);
                    map.fitBounds(KALIMANTAN_BOUNDS);
                });
                return bar;
            },
        });
        const c = new Fit({ position });
        c.addTo(map);
        return () => {
            c.remove();
        };
    }, [map, position]);
    return null;
}

const NO_AIRPORTS: LiveNode[] = [];

const isBarge = (f: Flow) => f.from === 'TRK' || f.to === 'TRK';
const BARGE_MODE = 'Barge (Tarakan is an island; trucks cannot reach it)';

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

export default function SafMap({ solution, sites, highlight, onSelectFlow, onSelectNode, bandFor, feed, zoomPosition = 'topleft', popupPaddingTopLeft = IMAGE_POPUP_PADDING, preview = false, onPreviewClick, onClearSelection }: MapProps) {
    // Leaflet reads zoomControl once, at creation; each page passes a fixed corner, so that is enough.
    const defaultZoom = zoomPosition === 'topleft';
    const POPUP_PROPS = { maxWidth: 260, maxHeight: 260, autoPanPaddingTopLeft: popupPaddingTopLeft };
    const renderer = useMemo(() => L.canvas({ padding: 0.5, tolerance: 10 }), []);
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

    // Preview: nothing is interactive, so the map's own click event catches every click.
    const live = !preview;
    const maxKt = useMemo(() => legMaxima(flows), [flows]);
    const widthOf = (f: Flow) => legWidth(f.leg, f.kt, maxKt[f.leg]);

    const facilityIds = new Set(facilities.map((f) => f.site_id));
    const excluded = solution?.scenario?.excluded_ids ?? [];
    const strandedIds = new Set((solution?.stranded ?? []).map((s) => s.site_id));
    const strandedKt = new Map((solution?.stranded ?? []).map((s) => [s.site_id, s.kt]));
    const strandedWhy = new Map((solution?.stranded ?? []).map((s) => [s.site_id, s.reason]));
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
            maxZoom={13}
            zoomSnap={0.25}
            preferCanvas
            renderer={renderer}
            zoomControl={defaultZoom && !preview}
            className={preview ? 'saf-preview' : undefined}
            dragging={!preview}
            scrollWheelZoom={!preview}
            doubleClickZoom={!preview}
            boxZoom={!preview}
            keyboard={!preview}
            touchZoom={!preview}
            style={{ height: '100%', width: '100%', background: SEA }}
        >
            {!defaultZoom && !preview && <ZoomControl position={zoomPosition} />}
            {!preview && <FitControl position={zoomPosition} />}
            <MapEvents preview={preview} onPreviewClick={onPreviewClick} onClearSelection={onClearSelection} />
            {/* The only basemap: Esri World Street Map, free with roads built in, no API key. Attribution always shown. */}
            <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                attribution={ESRI_ATTRIBUTION}
                maxZoom={19}
            />
            {/* Land layer below tilePane (200): the tiles cover it, and it still shows land if they fail to load. */}
            <Pane name="land" style={{ zIndex: 150 }}>
                <GeoJSON
                    data={borneo as unknown as FeatureCollection}
                    style={{ color: '#c7c7cc', weight: 0.8, fillColor: LAND, fillOpacity: 1 }}
                    interactive={false}
                />
            </Pane>

            <LiveFlows feed={feed} solution={solution} sites={sites} resting={resting} highlight={resting ? hl : null} onSettled={onSettled} />

            {/* Flows, coloured by leg, along OSRM car routes where stored (display only; dashed = straight line, snap
                gap or TRK barge). 0 km co-located flows are kept in the data but not drawn. */}
            {shownFlows.map((f, i) => {
                if (!(f.km > 0) || (f.from_lat === f.to_lat && f.from_lon === f.to_lon)) return null;
                const key = flowKey(f);
                const d = dim(key);
                const { solid, dashed } = flowPaths(f);
                const weight = widthOf(f) + (hl && !d ? 2 : 0);
                return (
                    <Fragment key={`${key}#${i}`}>
                    {solid &&
                        dashed.map((p, j) => (
                            <Polyline
                                key={j}
                                positions={p}
                                interactive={false}
                                pathOptions={{ color: LEG_COLOR[f.leg], weight: Math.max(1, weight - 1), opacity: d ? 0.15 : 0.7, dashArray: '3 5' }}
                            />
                        ))}
                    <Polyline
                        positions={solid ?? dashed[0]}
                        pathOptions={{
                            color: LEG_COLOR[f.leg],
                            weight,
                            opacity: d ? 0.15 : 0.9,
                            lineCap: 'round',
                            lineJoin: 'round',
                            dashArray: solid ? undefined : isBarge(f) ? '2 6' : '6 6',
                        }}
                        interactive={live}
                        bubblingMouseEvents={false}
                        eventHandlers={{ click: () => onSelectFlow?.(f, i) }}
                    >
                        {live && (
                            <Popup {...POPUP_PROPS}>
                                <PopupRows
                                    title={`${LEG_LABEL[f.leg]}`}
                                    rows={[
                                        ...(isBarge(f) ? ([['Mode', BARGE_MODE]] as [string, string][]) : []),
                                        ['From', f.from_label ?? f.from],
                                        ['To', f.to_label ?? f.to],
                                        [f.commodity === 'saf' ? 'SAF kt/year' : 'kt/year', kt(f.kt, 1)],
                                        isOsrmLeg(f)
                                            ? ['Distance', `OSRM road (car) ${km(f.road_km ?? f.km)}, costed ${km(f.km)}`]
                                            : ['Distance', `${km(f.hav_km)} × ${f.road_factor} = ${km(f.km)}`],
                                        ...(!isOsrmLeg(f) && !isBarge(f) && typeof f.road_km === 'number'
                                            ? ([['OSRM road (car)', `${km(f.road_km)}, reference only`]] as [string, string][])
                                            : []),
                                        ['Rate', `$${f.rate_usd_per_t_km}/t/km`],
                                        ['Cost/year', <span title={`$${Math.round(f.cost_usd).toLocaleString('en-US')}`}>{usd(f.cost_usd)}</span>],
                                    ]}
                                />
                            </Popup>
                        )}
                    </Polyline>
                    </Fragment>
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
                        interactive={live}
                        bubblingMouseEvents={false}
                        eventHandlers={{ click: () => onSelectNode?.(s.id) }}
                    >
                        {live && (
                            <Popup {...POPUP_PROPS}>
                                <PopupRows
                                    title={s.label}
                                    subtitle={`Biomass supply site · ${s.id}`}
                                    imageSiteId={s.id}
                                    rows={[
                                        ['Availability', kt(s.kt, 1)],
                                        ['Quantity used', solution ? kt(used, 1) : MISSING],
                                        ...(strandedIds.has(s.id)
                                            ? ([['Stranded', `${kt(strandedKt.get(s.id), 1)} not collected${strandedWhy.get(s.id) ? `: ${strandedWhy.get(s.id)}` : ''}`]] as [string, string][])
                                            : []),
                                        ...(s.sea ? ([['Note', 'Offshore, not a facility candidate']] as [string, string][]) : []),
                                    ]}
                                />
                            </Popup>
                        )}
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

            {/* Stranded supply: hollow red ring. Not interactive, so it never covers the site marker's click;
                the site popup carries the stranded row. */}
            {(solution?.stranded ?? []).map((s) => (
                <CircleMarker
                    key={`stranded-${s.site_id}`}
                    center={[s.lat, s.lon]}
                    radius={9}
                    interactive={false}
                    pathOptions={{ color: '#c0392b', weight: 2, fill: false, dashArray: '3 3' }}
                />
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
                            interactive={live}
                            bubblingMouseEvents={false}
                            eventHandlers={{ click: () => onSelectNode?.(f.site_id) }}
                        >
                            {live && (
                                <Popup {...POPUP_PROPS}>
                                    <PopupRows
                                        title={f.label ?? f.site_id}
                                        subtitle={`${f.size === 'large' ? 'Large' : 'Small'} depot · ${f.site_id}`}
                                        imageSiteId={siteIds.has(f.site_id) ? f.site_id : undefined}
                                        rows={[
                                            ['Capacity', kt(f.capacity_kt, 1)],
                                            ['Throughput', kt(f.throughput_kt, 1)],
                                            ['Utilisation', pct(f.utilisation)],
                                            ['Inbound', `${kt(inKt, 1)} from ${(flowsIn.get(f.site_id) ?? []).filter((x) => x.leg === 'supply_depot').length} sites`],
                                            ['Outbound', outFlows.map((x) => `${kt(x.kt, 1)} to ${x.to_label ?? x.to}`).join('; ') || MISSING],
                                            ['CapEx', usd(f.capex_usd)],
                                        ]}
                                    />
                                </Popup>
                            )}
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
                            title={f.label ?? f.site_id}
                            alt={`${f.size} refinery ${f.label ?? f.site_id}`}
                            interactive={live}
                            zIndexOffset={1000}
                            eventHandlers={{ click: () => onSelectNode?.(f.site_id) }}
                        >
                            {live && (
                                <Popup {...POPUP_PROPS}>
                                    <PopupRows
                                        title={f.label ?? f.site_id}
                                        subtitle={`${f.size === 'large' ? 'Large' : 'Small'} refinery · ${f.site_id}`}
                                        imageSiteId={siteIds.has(f.site_id) ? f.site_id : undefined}
                                        rows={[
                                            ['SAF output', kt(sum(links.map((x) => x.kt)) + sum((solution?.surplus ?? []).filter((s) => s.site_id === f.site_id).map((s) => s.kt)), 1)],
                                            ['Capacity', `${kt(f.capacity_kt, 1)} (${orMissing(f.capacity_basis)})`],
                                            ['Utilisation', pct(f.utilisation)],
                                            ['Airport links', links.map((x) => `${x.to_label ?? x.to} ${kt(x.kt, 1)}`).join('; ') || MISSING],
                                            ['CapEx', usd(f.capex_usd)],
                                        ]}
                                    />
                                </Popup>
                            )}
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
                        title={a.label ?? a.id}
                        alt={`Airport ${a.label ?? a.id}`}
                        interactive={live}
                        eventHandlers={{ click: () => onSelectNode?.(a.id) }}
                    >
                        {live && (
                            <Popup {...POPUP_PROPS}>
                                <PopupRows
                                    title={a.label ?? a.id}
                                    subtitle={`Airport · ${a.id}`}
                                    rows={[
                                        ['Demand', kt(demandOf(a.id), 1)],
                                        ['Delivered', kt(sum(inbound.map((x) => x.kt)), 1)],
                                        ['From refineries', inbound.map((x) => x.from_label ?? x.from).join('; ') || MISSING],
                                    ]}
                                />
                            </Popup>
                        )}
                    </Marker>
                );
            })}

            {/* Excluded facilities: crossed-out marker. */}
            {excluded.map((id) => {
                const s = siteById.get(id);
                if (!s || facilityIds.has(id)) return null;
                return (
                    <Marker key={`excl-${id}`} position={[s.lat, s.lon]} icon={EXCLUDED_ICON} title={`Excluded: ${s.label}`} alt={`Excluded site ${s.label}`} interactive={live}>
                        {live && (
                            <Popup {...POPUP_PROPS}>
                                <PopupRows
                                    title={s.label}
                                    subtitle={`Excluded facility site · ${s.id}`}
                                    rows={[
                                        ['Why', 'Excluded in this scenario (excluded_ids): site unavailable at design stage'],
                                        ['Still supplies', kt(s.kt, 1)],
                                    ]}
                                />
                            </Popup>
                        )}
                    </Marker>
                );
            })}
        </MapContainer>
    );
}
