'use client';

// Material flow of one run: supply sites and depots grouped by province, refineries and airports
// as themselves. Every width is a sum of the run's flows[].kt; biomass legs and SAF legs share one scale.
import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from 'd3-sankey';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Leg, Solution } from '../lib/contract';
import { sites } from '../lib/bundle';
import { kt } from '../lib/format';

const LEG_COLOR: Record<Leg, string> = {
    supply_depot: '#2f9e4f',
    depot_refinery: '#e5a00d',
    refinery_airport: '#0ea5c6',
};
const NODE_COLOR = { s: '#2f9e4f', d: '#c98b0a', r: '#0b8fab', a: '#0b1f33' } as const;

interface N {
    id: string;
    name: string;
    kind: keyof typeof NODE_COLOR;
}
interface L {
    source: string;
    target: string;
    value: number;
    leg: Leg;
}
type SN = SankeyNode<N, L>;
type SL = SankeyLink<N, L>;

const siteById = new Map(sites.map((s) => [s.id, s]));
const province = (id: string) => siteById.get(id)?.province ?? 'Other';
const shortProv = (p: string) => p.replace(/^(West|Central|South|East|North) /, (m) => `${m[0]}. `);

function buildGraph(s: Solution | null): { nodes: N[]; links: L[] } {
    const links = new Map<string, L>();
    const members = new Map<string, Set<string>>();
    const add = (a: string, b: string, leg: Leg, v: number, aMember?: string, bMember?: string) => {
        const k = `${a}|${b}`;
        const l = links.get(k) ?? { source: a, target: b, value: 0, leg };
        l.value += v;
        links.set(k, l);
        for (const [n, m] of [
            [a, aMember],
            [b, bMember],
        ] as const) {
            if (!m) continue;
            if (!members.has(n)) members.set(n, new Set());
            members.get(n)!.add(m);
        }
    };
    for (const f of s?.flows ?? []) {
        if (!(f.kt > 0)) continue;
        if (f.leg === 'supply_depot') add(`s:${province(f.from)}`, `d:${province(f.to)}`, f.leg, f.kt, f.from, f.to);
        else if (f.leg === 'depot_refinery') add(`d:${province(f.from)}`, `r:${f.to}`, f.leg, f.kt, f.from);
        else add(`r:${f.from}`, `a:${f.to}`, f.leg, f.kt);
    }
    const ids = new Set<string>();
    links.forEach((l) => (ids.add(l.source), ids.add(l.target)));
    const nodes: N[] = [...ids].map((id) => {
        const kind = id[0] as N['kind'];
        const key = id.slice(2);
        const n = members.get(id)?.size ?? 0;
        const name =
            kind === 's'
                ? `${shortProv(key)} (${n} site${n === 1 ? '' : 's'})`
                : kind === 'd'
                  ? `${shortProv(key)} depots (${n})`
                  : kind === 'r'
                    ? `Refinery ${siteById.get(key)?.district ?? key}`
                    : key;
        return { id, name, kind };
    });
    return { nodes, links: [...links.values()] };
}

function useSize<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, size] as const;
}

export default function FlowSankey({ solution, className = '' }: { solution: Solution | null; className?: string }) {
    const [ref, { w, h }] = useSize<HTMLDivElement>();
    const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);
    const [active, setActive] = useState<string | null>(null);
    const graph = useMemo(() => buildGraph(solution), [solution]);

    const layout = useMemo(() => {
        if (w < 200 || h < 160 || graph.links.length === 0) return null;
        const left = Math.min(240, w * 0.3);
        const right = Math.min(120, w * 0.14);
        const gen = sankey<N, L>()
            .nodeId((d) => d.id)
            .nodeWidth(10)
            .nodePadding(22)
            .nodeSort((a, b) => a.id.localeCompare(b.id))
            .extent([
                [left, 8],
                [w - right, h - 8],
            ]);
        return gen({ nodes: graph.nodes.map((n) => ({ ...n })), links: graph.links.map((l) => ({ ...l })) });
    }, [graph, w, h]);

    const nameOf = (n: SN | string | number) => (typeof n === 'object' ? n.name : String(n));
    const idOf = (n: SN | string | number) => (typeof n === 'object' ? n.id : String(n));
    const tip = (e: React.MouseEvent, text: string) => {
        const box = ref.current?.getBoundingClientRect();
        if (box) setHover({ text, x: e.clientX - box.left, y: e.clientY - box.top });
    };
    const linkOn = (l: SL) => !active || idOf(l.source) === active || idOf(l.target) === active;

    return (
        <div ref={ref} className={`relative h-full w-full ${className}`} data-testid="flow-sankey">
            {!layout && graph.links.length === 0 && (
                <div className="flex h-full items-center justify-center text-base text-ink2">No flows in this run.</div>
            )}
            {layout && (
                <svg width={w} height={h} role="img" aria-label="Material flow of this run, in kilotonnes" className="block">
                    <g fill="none">
                        {layout.links.map((l, i) => (
                            <path
                                key={i}
                                d={sankeyLinkHorizontal()(l) ?? undefined}
                                stroke={LEG_COLOR[l.leg]}
                                strokeOpacity={linkOn(l) ? 0.38 : 0.1}
                                strokeWidth={Math.max(1, l.width ?? 1)}
                                className="transition-[stroke-opacity] duration-150"
                                onMouseMove={(e) => tip(e, `${nameOf(l.source)} → ${nameOf(l.target)}: ${kt(l.value)}`)}
                                onMouseLeave={() => setHover(null)}
                            >
                                <title>{`${nameOf(l.source)} → ${nameOf(l.target)}: ${kt(l.value)}`}</title>
                            </path>
                        ))}
                    </g>
                    {layout.nodes.map((n) => {
                        const x0 = n.x0 ?? 0;
                        const x1 = n.x1 ?? 0;
                        const y0 = n.y0 ?? 0;
                        const y1 = n.y1 ?? 0;
                        const first = n.kind === 's';
                        const label = n.kind === 'a' ? `${n.name} ${kt(n.value, 0)}` : n.name;
                        return (
                            <g
                                key={n.id}
                                onMouseEnter={() => setActive(n.id)}
                                onMouseLeave={() => (setActive(null), setHover(null))}
                                onMouseMove={(e) => tip(e, `${n.name}: ${kt(n.value)}`)}
                            >
                                <rect x={x0} y={y0} width={x1 - x0} height={Math.max(2, y1 - y0)} fill={NODE_COLOR[n.kind]} rx={2}>
                                    <title>{`${n.name}: ${kt(n.value)}`}</title>
                                </rect>
                                <text
                                    x={first ? x0 - 8 : x1 + 8}
                                    y={(y0 + y1) / 2}
                                    dy="0.35em"
                                    textAnchor={first ? 'end' : 'start'}
                                    className="num fill-ink text-base"
                                    style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 4, strokeLinejoin: 'round' }}
                                >
                                    {label}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            )}
            {hover && (
                <div
                    className="num pointer-events-none absolute z-10 rounded-md border border-line bg-white px-2.5 py-1 text-base text-ink"
                    style={{ left: Math.max(4, Math.min(hover.x + 10, w - 444)), top: hover.y > h - 90 ? hover.y - 72 : hover.y + 16, maxWidth: 440 }}
                    role="status"
                >
                    {hover.text}
                </div>
            )}
        </div>
    );
}

/** "Map | Flows" segmented control over the map slot; Flows covers the map with this run's Sankey. */
export function FlowsOverlay({ solution }: { solution: Solution | null }) {
    const [mode, setMode] = useState<'map' | 'flows'>('map');
    return (
        <>
            <div className="absolute right-3 top-3 z-[1003]">
                <div className="seg bg-white" role="radiogroup" aria-label="Map or flow view">
                    {(['map', 'flows'] as const).map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={mode === m} className="seg-btn" data-mode-btn={m} onClick={() => setMode(m)}>
                            {m === 'map' ? 'Map' : 'Flows'}
                        </button>
                    ))}
                </div>
            </div>
            {mode === 'flows' && (
                <div className="absolute inset-0 z-[1002] flex flex-col bg-white px-4 pb-3 pt-4">
                    <div className="pr-40 text-base text-ink2">
                        <span className="font-semibold text-ink">Material flow, kt per year.</span> Biomass to the refineries, SAF to the airports; widths from this
                        run&apos;s flows.
                    </div>
                    <div className="min-h-0 flex-1 pt-2">
                        <FlowSankey solution={solution} />
                    </div>
                </div>
            )}
        </>
    );
}
