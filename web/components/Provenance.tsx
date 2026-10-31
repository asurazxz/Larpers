'use client';

// Provenance strip: which run is on screen, where it came from, and how many drawn arcs pass the
// in-browser trace. A stored run is always labelled stored.
import type { BundleEntry, Solution } from '../lib/contract';
import { bundle, solutionOf } from '../lib/bundle';
import { MISSING, pct, seconds } from '../lib/format';
import { traceAll } from '../lib/trace';

const short = (h: string | null | undefined) => (h ? (h.length > 10 ? `${h.slice(0, 8)}…` : h) : MISSING);

function Item({ k, v, title, id }: { k: string; v: React.ReactNode; title?: string; id?: string }) {
    return (
        <span id={id} title={title} className="whitespace-nowrap">
            <span className="text-gray-500">{k} </span>
            <span className="font-medium">{v}</span>
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
            <div id="provenance" className="border-b border-gray-300 bg-gray-50 px-4 py-0.5 text-xs text-gray-600">
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
            className="flex flex-wrap items-center gap-x-4 gap-y-0 border-b border-gray-300 bg-gray-50 px-4 py-0.5 text-xs"
            data-run-id={solution.run_id}
        >
            <span
                className={`rounded px-1.5 font-bold ${isLive ? 'bg-blue-800 text-white' : 'border border-gray-800 text-gray-900'}`}
                id="provenance-source"
            >
                {isLive ? 'LIVE' : 'STORED'}
            </span>
            <Item k="run" v={own ? `${own.slug} · ${solution.run_id}` : solution.run_id} />
            <Item k="source" v={solution.source} />
            <Item k="solved" v={solvedAt ?? MISSING} />
            <Item k="solve" v={seconds(solution.solve_seconds)} />
            <Item k="gap" v={pct(solution.gap, 2)} />
            <Item k="data" v={short(solution.data_hash)} title={solution.data_hash} />
            <Item k="scenario" v={short(solution.scenario_hash)} title={solution.scenario_hash} />
            <span
                id="provenance-trace"
                data-pass={tr.pass}
                data-total={tr.total}
                className={`whitespace-nowrap rounded px-1.5 font-bold ${allOk ? 'bg-blue-100 text-blue-900' : 'bg-orange-200 text-orange-900'}`}
                title={`Every drawn arc: haversine × road factor and kt × 1000 × km × PDF rate, recomputed in the browser. Co-located (0 km) flows: ${tr.hiddenPass}/${tr.hiddenTotal} ok.`}
            >
                Trace {tr.pass}/{tr.total} ok
                {tr.hiddenPass !== tr.hiddenTotal && `; ${tr.hiddenTotal - tr.hiddenPass} undrawn flow(s) fail`}
            </span>
        </div>
    );
}
