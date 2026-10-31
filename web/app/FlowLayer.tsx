'use client';

// The moving part of the map: one canvas above the Leaflet layers. It draws a Scene and animates the
// difference from the last one: new arcs grow from source to destination, leg by leg, lost arcs fade,
// and opened facilities pop in. Dots run along every solid arc in the direction biomass and SAF move.
// Arcs follow their OSRM road (SceneArc.path) where one is stored, so the dots run along the same road as the line.
// At rest the Leaflet layers show the run and stay clickable; this layer only adds the dots.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { Leg } from '../lib/contract';
import type { Scene, SceneArc, SceneNode, Tone } from '../lib/scene';

export interface FlowLayerProps {
    scene: Scene;
    /** True when the Leaflet layers are showing this scene, so only the dots are drawn. */
    resting: boolean;
    /** Arc ids to keep running when something is selected. Empty = all. */
    highlight: ReadonlySet<string> | null;
    /** Called once when a new `settleId` has finished animating. */
    onSettled?: (id: unknown) => void;
    /** Identifies a scene that should settle; null during a live solve, which never does. */
    settleId: unknown;
    colors: Record<Leg, string>;
}

const PANE = 'flowFx';
const GROW_MS = 460;
const LEG_DELAY_MS: Record<Leg, number> = { supply_depot: 0, depot_refinery: 130, refinery_airport: 260 };
const FADE_MS = 240;
const POP_MS = 320;
const RIPPLE_MS = 700;
const DOT_SPACING_PX = 44;
const DOT_SPEED_PX_S = 38;
const ALPHA: Record<Tone, number> = { solid: 0.9, ghost: 0.2, greedy: 0.42 };
const NODE_ALPHA: Record<Tone, number> = { solid: 1, ghost: 0.28, greedy: 0.4 };
const GREEDY_GREY = '#86868b';
const DEPOT_FILL = '#f0a30a';
const DEPOT_LINE = '#8a5a00';
const REFINERY_FILL = '#0ea5c6';
const REFINERY_LINE = '#075e70';
const TONE_ORDER: Tone[] = ['greedy', 'ghost', 'solid'];

interface ArcState {
    arc: SceneArc;
    born: number;
    alpha: number;
    target: number;
    width: number;
    phase: number;
}

interface NodeState {
    node: SceneNode;
    born: number;
    alpha: number;
    target: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
function easeBack(t: number): number {
    const s = 1.9;
    const u = t - 1;
    return 1 + (s + 1) * u ** 3 + s * u ** 2;
}

function hash(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 9973;
    return h;
}

function roundedSquare(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, radius: number) {
    const half = size / 2;
    ctx.beginPath();
    ctx.roundRect(x - half, y - half, size, size, radius);
}

type Pt = { x: number; y: number };

/** Running pixel length at each vertex of a polyline. */
function cumulative(pts: Pt[]): number[] {
    const out = [0];
    for (let k = 1; k < pts.length; k++) out.push(out[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    return out;
}

/** The point `d` pixels along a polyline. */
function pointAt(pts: Pt[], cum: number[], d: number): Pt {
    let k = 1;
    while (k < pts.length - 1 && cum[k] < d) k++;
    const span = cum[k] - cum[k - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - cum[k - 1]) / span));
    return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * t, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * t };
}

export default function FlowLayer({ scene, resting, highlight, onSettled, settleId, colors }: FlowLayerProps) {
    const map = useMap();
    const arcs = useRef(new Map<string, ArcState>());
    const nodes = useRef(new Map<string, NodeState>());
    const latest = useRef({ scene, resting, highlight, onSettled, settleId, colors });
    latest.current = { scene, resting, highlight, onSettled, settleId, colors };
    const settled = useRef<unknown>(undefined);

    // Diff the scene into the running state.
    useEffect(() => {
        const now = performance.now();
        const seenArcs = new Set<string>();
        for (const arc of scene.arcs) {
            seenArcs.add(arc.key);
            const s = arcs.current.get(arc.key);
            if (s) {
                s.arc = arc;
                s.target = ALPHA[arc.tone];
            } else {
                arcs.current.set(arc.key, {
                    arc,
                    born: now + LEG_DELAY_MS[arc.leg],
                    alpha: ALPHA[arc.tone],
                    target: ALPHA[arc.tone],
                    width: arc.width,
                    phase: hash(arc.key),
                });
            }
        }
        for (const [key, s] of arcs.current) if (!seenArcs.has(key)) s.target = 0;
        const seenNodes = new Set<string>();
        for (const node of scene.nodes) {
            seenNodes.add(node.key);
            const s = nodes.current.get(node.key);
            if (s) {
                s.node = node;
                s.target = NODE_ALPHA[node.tone];
            } else {
                nodes.current.set(node.key, { node, born: now + LEG_DELAY_MS.depot_refinery, alpha: NODE_ALPHA[node.tone], target: NODE_ALPHA[node.tone] });
            }
        }
        for (const [key, s] of nodes.current) if (!seenNodes.has(key)) s.target = 0;
    }, [scene]);

    useEffect(() => {
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const pane = map.getPane(PANE) ?? map.createPane(PANE);
        pane.style.zIndex = '450';
        pane.style.pointerEvents = 'none';
        const canvas = L.DomUtil.create('canvas', 'flow-fx', pane);
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;
        const hide = () => canvas.classList.add('flow-fx-zooming');
        const show = () => canvas.classList.remove('flow-fx-zooming');
        map.on('zoomstart', hide);
        map.on('zoomend', show);
        const resized = new ResizeObserver(() => map.invalidateSize({ animate: false }));
        resized.observe(map.getContainer());

        let frame = 0;
        let previous = performance.now();

        const draw = (now: number) => {
            frame = window.requestAnimationFrame(draw);
            const dt = Math.min(now - previous, 100);
            previous = now;
            const { scene: current, resting: rest, highlight: hl, onSettled: settle, settleId: id, colors: palette } = latest.current;
            const size = map.getSize();
            const dpr = window.devicePixelRatio || 1;
            if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
                canvas.width = size.x * dpr;
                canvas.height = size.y * dpr;
                canvas.style.width = `${size.x}px`;
                canvas.style.height = `${size.y}px`;
            }
            L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, size.x, size.y);
            ctx.lineCap = 'round';

            const ease = 1 - Math.exp(-dt / (FADE_MS / 3));
            let busy = false;

            for (const tone of TONE_ORDER) {
                for (const [key, s] of arcs.current) {
                    if (s.arc.tone !== tone) continue;
                    s.alpha = still ? s.target : s.alpha + (s.target - s.alpha) * ease;
                    s.width = still ? s.arc.width : s.width + (s.arc.width - s.width) * ease;
                    if (s.target === 0 && s.alpha < 0.01) {
                        arcs.current.delete(key);
                        continue;
                    }
                    const grown = still ? 1 : clamp01((now - s.born) / GROW_MS);
                    if (grown < 1 || s.target === 0 || Math.abs(s.alpha - s.target) > 0.02) busy = true;
                    if (grown <= 0) continue;
                    // Along the OSRM road when one is stored (arc.path), else the straight from -> to.
                    const pts = s.arc.path.map((ll) => map.latLngToContainerPoint(ll));
                    const cum = cumulative(pts);
                    const length = cum[cum.length - 1];
                    const reach = easeOut(grown);
                    if (!rest) {
                        ctx.globalAlpha = s.alpha;
                        ctx.strokeStyle = tone === 'greedy' ? GREEDY_GREY : palette[s.arc.leg];
                        ctx.lineWidth = s.width;
                        ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(pts[0].x, pts[0].y);
                        const end = length * reach;
                        for (let k = 1; k < pts.length; k++) {
                            if (cum[k] >= end) {
                                const p = pointAt(pts, cum, end);
                                ctx.lineTo(p.x, p.y);
                                break;
                            }
                            ctx.lineTo(pts[k].x, pts[k].y);
                        }
                        ctx.stroke();
                    }
                    if (still || tone !== 'solid' || grown < 1 || s.target === 0) continue;
                    if (hl && !hl.has(s.arc.id)) continue;
                    if (length < 10) continue;
                    const radius = Math.min(3, Math.max(1.3, s.width * 0.42));
                    ctx.fillStyle = '#ffffff';
                    const start = ((now / 1000) * DOT_SPEED_PX_S + s.phase) % DOT_SPACING_PX;
                    for (let d = start; d < length; d += DOT_SPACING_PX) {
                        const p = pointAt(pts, cum, d);
                        ctx.globalAlpha = 0.9 * Math.min(1, d / 12, (length - d) / 12);
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            ctx.strokeStyle = REFINERY_FILL;
            ctx.lineWidth = 1.5;
            current.candidates.forEach((c, i) => {
                const p = map.latLngToContainerPoint([c.lat, c.lon]);
                ctx.globalAlpha = still ? 0.5 : 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(now / 420 + i * 1.7));
                roundedSquare(ctx, p.x, p.y, 10, 2);
                ctx.stroke();
            });

            for (const [key, s] of nodes.current) {
                s.alpha = still ? s.target : s.alpha + (s.target - s.alpha) * ease;
                if (s.target === 0 && s.alpha < 0.01) {
                    nodes.current.delete(key);
                    continue;
                }
                const age = now - s.born;
                if (!still && (age < POP_MS || s.target === 0 || Math.abs(s.alpha - s.target) > 0.02)) busy = true;
                if (rest || (!still && age <= 0)) continue;
                const p = map.latLngToContainerPoint([s.node.lat, s.node.lon]);
                const depot = s.node.kind === 'depot';
                const scale = still ? 1 : easeBack(clamp01(age / POP_MS));
                const fill = depot ? DEPOT_FILL : REFINERY_FILL;
                if (!still && age < RIPPLE_MS && s.node.tone === 'solid') {
                    const t = age / RIPPLE_MS;
                    ctx.globalAlpha = 0.5 * (1 - t);
                    ctx.strokeStyle = fill;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 8 + 22 * easeOut(t), 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.globalAlpha = s.alpha;
                ctx.fillStyle = fill;
                ctx.strokeStyle = depot ? DEPOT_LINE : REFINERY_LINE;
                if (depot) {
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, (s.node.large ? 9 : 6) * scale, 0, Math.PI * 2);
                } else {
                    ctx.lineWidth = 2;
                    roundedSquare(ctx, p.x, p.y, (s.node.large ? 22 : 15) * scale, 3);
                }
                ctx.fill();
                ctx.stroke();
            }

            ctx.globalAlpha = 1;

            if (!busy && id !== null && settled.current !== id) {
                settled.current = id;
                settle?.(id);
            }
        };

        frame = window.requestAnimationFrame(draw);
        return () => {
            window.cancelAnimationFrame(frame);
            map.off('zoomstart', hide);
            map.off('zoomend', show);
            resized.disconnect();
            canvas.remove();
        };
    }, [map]);

    return null;
}
