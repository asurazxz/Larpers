'use client';

// Landing hero: the stored base network in three.js, as ground transport: flat road legs with trucks, a barge to Tarakan. Loaded with next/dynamic so the planner never ships three.
// No WebGL: a static SVG of the same network. Reduced motion: one still frame.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Leg } from '../lib/contract';
import { heroNetwork, LEG_GLOW, type HeroArc, type XY } from './heroNetwork';
import { reducedMotion } from './motion';

const LEGS: Leg[] = ['supply_depot', 'depot_refinery', 'refinery_airport'];
const ROAD_Z = 0.008;

function hasWebGL(): boolean {
    try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
        return false;
    }
}

function along(arc: HeroArc, t: number, out: THREE.Vector3): THREE.Vector3 {
    const [ax, ay] = arc.a;
    const [bx, by] = arc.b;
    return out.set(ax + (bx - ax) * t, ay + (by - ay) * t, ROAD_Z);
}

function dotTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

function points(xy: XY[], z: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(xy.flatMap(([x, y]) => [x, y, z]), 3));
    return g;
}

export default function HeroScene({ className = '' }: { className?: string }) {
    const host = useRef<HTMLDivElement>(null);
    const [fallback, setFallback] = useState(false);

    useEffect(() => {
        const el = host.current;
        if (!el) return;
        if (!hasWebGL()) {
            setFallback(true);
            return;
        }
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
        } catch {
            setFallback(true);
            return;
        }
        const still = reducedMotion();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        el.appendChild(renderer.domElement);
        renderer.domElement.style.display = 'block';

        const net = heroNetwork();
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
        const root = new THREE.Group();
        root.rotation.x = -Math.PI / 2 + 0.12;
        const spin = new THREE.Group();
        root.add(spin);
        scene.add(root);

        const disposables: { dispose(): void }[] = [];
        const own = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
        const sprite = own(dotTexture());

        // Land: faint fill plus a hairline coast.
        const landFill = own(new THREE.MeshBasicMaterial({ color: 0x1a1d24, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
        const coast = own(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
        for (const ring of net.land) {
            const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
            spin.add(new THREE.Mesh(own(new THREE.ShapeGeometry(shape)), landFill));
            const lg = own(new THREE.BufferGeometry().setFromPoints(ring.map(([x, y]) => new THREE.Vector3(x, y, 0.002))));
            spin.add(new THREE.LineLoop(lg, coast));
        }

        const dots = (xy: XY[], color: number, size: number, opacity: number, z = 0.01) => {
            const m = own(
                new THREE.PointsMaterial({ color, size, map: sprite, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
            );
            spin.add(new THREE.Points(own(points(xy, z)), m));
        };
        dots(net.sites, 0xffffff, 0.09, 0.35);
        dots(net.depots, 0xffffff, 0.16, 0.85);
        dots(net.refineries, 0x4da3ff, 0.32, 1);
        dots(net.airports, 0x22d3ee, 0.36, 1);

        // Straight road legs on the land plane (one LineSegments per leg); the Tarakan barge leg is dashed.
        // Trucks (and the barge) are small boxes moving along them, with a soft glow underneath.
        const tmp = new THREE.Vector3();
        const dummy = new THREE.Object3D();
        const flows: { arcs: HeroArc[]; phase: number[]; speed: number[]; attr: THREE.BufferAttribute; trucks: THREE.InstancedMesh }[] = [];
        for (const leg of LEGS) {
            const arcs = net.arcs.filter((a) => a.leg === leg);
            if (!arcs.length) continue;
            const color = new THREE.Color(LEG_GLOW[leg]);
            for (const sea of [false, true]) {
                const group = arcs.filter((a) => a.sea === sea);
                if (!group.length) continue;
                const seg = group.flatMap((a) => [a.a[0], a.a[1], ROAD_Z, a.b[0], a.b[1], ROAD_Z]);
                const lg = own(new THREE.BufferGeometry());
                lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
                const lm = own(
                    sea
                        ? new THREE.LineDashedMaterial({ color, dashSize: 0.09, gapSize: 0.07, transparent: true, opacity: 0.85, depthWrite: false })
                        : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
                );
                const line = new THREE.LineSegments(lg, lm);
                if (sea) line.computeLineDistances();
                spin.add(line);
            }

            const pArcs: HeroArc[] = [];
            const phase: number[] = [];
            const speed: number[] = [];
            arcs.forEach((arc, i) => {
                const n = Math.max(1, Math.min(3, Math.round(arc.kt / 120)));
                const len = Math.hypot(arc.b[0] - arc.a[0], arc.b[1] - arc.a[1]);
                for (let k = 0; k < n; k++) {
                    pArcs.push(arc);
                    phase.push((k / n + i * 0.137) % 1);
                    speed.push(0.12 / Math.max(0.35, len) + 0.05);
                }
            });
            const pg = own(new THREE.BufferGeometry());
            const attr = new THREE.BufferAttribute(new Float32Array(pArcs.length * 3), 3);
            attr.setUsage(THREE.DynamicDrawUsage);
            pg.setAttribute('position', attr);
            const pm = own(
                new THREE.PointsMaterial({ color, size: 0.2, map: sprite, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
            );
            spin.add(new THREE.Points(pg, pm));
            const box = own(new THREE.BoxGeometry(0.17, 0.075, 0.07));
            const bm = own(new THREE.MeshBasicMaterial({ color }));
            const trucks = new THREE.InstancedMesh(box, bm, pArcs.length);
            trucks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            spin.add(trucks);
            flows.push({ arcs: pArcs, phase, speed, attr, trucks });
        }

        const place = (t: number) => {
            for (const f of flows) {
                const arr = f.attr.array as Float32Array;
                for (let i = 0; i < f.arcs.length; i++) {
                    const arc = f.arcs[i];
                    along(arc, (f.phase[i] + t * f.speed[i]) % 1, tmp);
                    arr[i * 3] = tmp.x;
                    arr[i * 3 + 1] = tmp.y;
                    arr[i * 3 + 2] = tmp.z;
                    dummy.position.set(tmp.x, tmp.y, tmp.z + 0.04);
                    dummy.rotation.set(0, 0, Math.atan2(arc.b[1] - arc.a[1], arc.b[0] - arc.a[0]));
                    dummy.updateMatrix();
                    f.trucks.setMatrixAt(i, dummy.matrix);
                }
                f.attr.needsUpdate = true;
                f.trucks.instanceMatrix.needsUpdate = true;
            }
        };

        const size = () => {
            const w = el.clientWidth || 1;
            const h = el.clientHeight || 1;
            renderer.setSize(w, h, false);
            renderer.domElement.style.width = '100%';
            renderer.domElement.style.height = '100%';
            camera.aspect = w / h;
            // Keep the island in frame on narrow screens.
            const dist = w / h < 1 ? 26 : w / h < 1.5 ? 19 : 16;
            camera.position.set(0, dist * 0.62, dist * 0.78);
            camera.lookAt(0, 1.6, 0);
            camera.updateProjectionMatrix();
        };
        size();

        const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
        const onPointer = (e: PointerEvent) => {
            pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
            pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
        };

        let raf = 0;
        let visible = true;
        let last = performance.now();
        let t = 4;
        const frame = (now: number) => {
            raf = requestAnimationFrame(frame);
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            t += dt;
            pointer.x += (pointer.tx - pointer.x) * 0.04;
            pointer.y += (pointer.ty - pointer.y) * 0.04;
            spin.rotation.z = Math.sin(t * 0.09) * 0.22 + pointer.x * 0.12;
            root.rotation.x = -Math.PI / 2 + 0.12 + pointer.y * 0.05;
            place(t);
            renderer.render(scene, camera);
        };
        const run = () => {
            if (still || raf || !visible || document.hidden) return;
            last = performance.now();
            raf = requestAnimationFrame(frame);
        };
        const stop = () => {
            cancelAnimationFrame(raf);
            raf = 0;
        };
        const draw = () => {
            place(t);
            renderer.render(scene, camera);
        };

        const ro = new ResizeObserver(() => {
            size();
            if (!raf) draw();
        });
        ro.observe(el);
        const io = new IntersectionObserver(([e]) => {
            visible = e.isIntersecting;
            if (visible) run();
            else stop();
        });
        io.observe(el);
        const onVis = () => (document.hidden ? stop() : run());
        document.addEventListener('visibilitychange', onVis);
        if (!still) window.addEventListener('pointermove', onPointer, { passive: true });

        draw();
        run();
        el.dataset.ready = 'webgl';

        return () => {
            stop();
            ro.disconnect();
            io.disconnect();
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('pointermove', onPointer);
            for (const d of disposables) d.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
            renderer.domElement.remove();
        };
    }, []);

    return (
        <div ref={host} className={`relative ${className}`} aria-hidden="true">
            {fallback && <NetworkSvg />}
        </div>
    );
}

/** Static, styled fallback: the same projected network, no WebGL. */
export function NetworkSvg() {
    const net = heroNetwork();
    const all = net.land.flat();
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 0.3;
    const S = 100;
    const X = (x: number) => (x - x0 + pad) * S;
    const Y = (y: number) => (y1 - y + pad) * S;
    const w = (x1 - x0 + 2 * pad) * S;
    const h = (y1 - y0 + 2 * pad) * S;
    const path = (r: XY[]) => `M${r.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('L')}Z`;
    return (
        <svg
            data-ready="svg"
            viewBox={`0 0 ${w.toFixed(0)} ${h.toFixed(0)}`}
            preserveAspectRatio="xMidYMax meet"
            className="absolute inset-x-0 bottom-0 mx-auto h-[62%] w-full max-w-5xl"
        >
            {net.land.map((r, i) => (
                <path key={i} d={path(r)} fill="#1a1d24" stroke="rgba(255,255,255,0.22)" strokeWidth={2} />
            ))}
            {net.arcs.map((a, i) => (
                <line
                    key={i}
                    x1={X(a.a[0])}
                    y1={Y(a.a[1])}
                    x2={X(a.b[0])}
                    y2={Y(a.b[1])}
                    stroke={LEG_GLOW[a.leg]}
                    strokeOpacity={a.sea ? 0.9 : 0.6}
                    strokeWidth={2.5}
                    strokeDasharray={a.sea ? '10 8' : undefined}
                    strokeLinecap="round"
                />
            ))}
            {net.sites.map((p, i) => (
                <circle key={`s${i}`} cx={X(p[0])} cy={Y(p[1])} r={4} fill="rgba(255,255,255,0.4)" />
            ))}
            {net.depots.map((p, i) => (
                <circle key={`d${i}`} cx={X(p[0])} cy={Y(p[1])} r={7} fill="#fff" />
            ))}
            {net.refineries.map((p, i) => (
                <circle key={`r${i}`} cx={X(p[0])} cy={Y(p[1])} r={12} fill="#4da3ff" />
            ))}
            {net.airports.map((p, i) => (
                <circle key={`a${i}`} cx={X(p[0])} cy={Y(p[1])} r={13} fill="#22d3ee" />
            ))}
        </svg>
    );
}

