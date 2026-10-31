'use client';

// Provenance strip: which run is on screen, where it came from, and how many drawn arcs pass the
// in-browser trace. A stored run is always labelled stored.
import type { BundleEntry, Solution } from '../lib/contract';
import { bundle, solutionOf } from '../lib/bundle';
import { MISSING, pct, seconds } from '../lib/format';
import { traceAll } from '../lib/trace';

// Client time a live result was first shown, by run ID (the API does not echo solved_at).
const liveSeen = new Map<string, string>();
const liveSeenAt = (runId: string) => {
    if (!liveSeen.has(runId)) liveSeen.set(runId, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    return liveSeen.get(runId) as string;
};

const short = (h: string | null | undefined) => (h ? (h.length > 10 ? `${h.slice(0, 8)}…` : h) : MISSING);

function Item({
    k,
    v,
    title,
    id,
    minor,
    fixed,
    wide,
}: {
    k: string;
    v: React.ReactNode;
    title?: string;
    id?: string;
    minor?: boolean;
    fixed?: boolean;
    /** Shown on wide screens only; the same value is on screen elsewhere at 1280. */
    wide?: boolean;
}) {
    return (
        <span
            id={id}
            title={title ?? (typeof v === 'string' ? `${k} ${v}` : undefined)}
            className={`min-w-0 truncate whitespace-nowrap ${minor ? 'text-sm' : 'text-base'} ${!minor || fixed ? 'shrink-0' : ''} ${wide ? 'hidden 2xl:inline' : ''}`}
        >
            <span className="text-ink2">{k} </span>
            <span className={`num font-medium ${minor ? 'text-ink3' : 'text-ink'}`}>{v}</span>
        </span>
    );
}

export interface ProvenanceProps {
    solution: Solution | null;
    /** The bundle entry the run came from, if any. Ignored unless it holds this exact solution. */
    entry?: BundleEntry;
    /** Overrides the stored/live inference when the caller knows (e.g. a live API response). */
    live?: boolean;
}

export default function Provenance({ solution, entry, live }: ProvenanceProps) {
    if (!solution) {
        return (
            <div id="provenance" className="px-5 pb-2 text-base text-ink2">
                Provenance: {MISSING}
            </div>
        );
    }
    const own =
        entry && solutionOf(entry) === solution ? entry : Object.values(bundle).find((e) => solutionOf(e) === solution);
    const isLive = live ?? (solution.source === 'live' || (own ? own.precomputed === false : false));
    const solvedAt = own?.solved_at ?? (solution as { solved_at?: string }).solved_at;
    const tr = traceAll(solution);
    const allOk = tr.pass === tr.total && tr.hiddenPass === tr.hiddenTotal;

    return (
        <div
            id="provenance"
            className="flex flex-wrap items-center gap-x-3.5 gap-y-1 overflow-hidden px-5 pb-2 text-base leading-snug md:flex-nowrap"
            data-run-id={solution.run_id}
        >
            <span
                className={`shrink-0 rounded-full px-2.5 text-base font-semibold tracking-[0.02em] ${isLive ? 'bg-accent text-white' : 'bg-track text-ink'}`}
                id="provenance-source"
            >
                {isLive ? 'LIVE' : 'STORED'}
            </span>
            <span className="min-w-[9rem] max-w-[15rem] shrink truncate 2xl:max-w-none whitespace-nowrap text-base" title={`run ${solution.run_id}`}>
                <span className="text-ink2">run </span>
                <span className="num font-medium">{own ? `${own.slug} · ${solution.run_id}` : solution.run_id}</span>
            </span>
            <Item id="provenance-gap" k="gap" v={pct(solution.gap, 2)} />
            <Item k="source" v={solution.source} minor fixed wide />
            <Item
                k="solved"
                v={solvedAt ? solvedAt.slice(0, 16).replace('T', ' ') : isLive ? `live, ${liveSeenAt(solution.run_id)}` : MISSING}
                title={solvedAt ?? (isLive ? 'Live result: local time it arrived in this browser' : undefined)}
                minor
            />
            <Item k="solve" v={seconds(solution.solve_seconds)} minor fixed />
            <Item k="data" v={short(solution.data_hash)} title={solution.data_hash} minor />
            <Item k="scenario" v={short(solution.scenario_hash)} title={solution.scenario_hash} minor />
            <span
                id="provenance-trace"
                data-pass={tr.pass}
                data-total={tr.total}
                className={`num ml-auto shrink-0 whitespace-nowrap rounded-full px-2.5 text-base font-semibold ${allOk ? 'bg-blue-50 text-blue-800' : 'bg-orange-100 text-orange-900'}`}
                title={`Every drawn arc: haversine × road factor and kt × 1000 × km × PDF rate, recomputed in the browser. Co-located (0 km) flows: ${tr.hiddenPass}/${tr.hiddenTotal} ok.`}
            >
                Trace {tr.pass}/{tr.total} ok
                {tr.hiddenPass !== tr.hiddenTotal && `; ${tr.hiddenTotal - tr.hiddenPass} undrawn flow(s) fail`}
            </span>
        </div>
    );
}
