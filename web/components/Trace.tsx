'use client';

// Arc-click trace: recomputes the selected flow's km and cost in the browser from lat/lon, the run's road
// factor and the PDF rates, and compares them with the stored values. A corrupted cost visibly fails.
import type { Flow, Solution } from '../lib/contract';
import { LEG_LABEL, MISSING, usdExact } from '../lib/format';
import { EARTH_RADIUS_KM, KM_TOL, runRoadFactor, traceFlow } from '../lib/trace';

const n = (v: number, dp: number) =>
    Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : MISSING;

function Verdict({ ok }: { ok: boolean }) {
    return (
        <span className={`ml-1 rounded px-1 font-bold ${ok ? 'bg-blue-100 text-blue-900' : 'bg-orange-200 text-orange-900'}`}>
            {ok ? 'ok' : 'FAIL'}
        </span>
    );
}

export interface TraceProps {
    solution: Solution | null;
    selected: { flow: Flow; index: number } | null;
    onClose?: () => void;
}

export default function Trace({ solution, selected, onClose }: TraceProps) {
    if (!solution || !selected) return null;
    const { flow, index } = selected;
    // A selection from another run is stale: the road factor would come from the wrong run.
    if (solution.flows[index] !== flow) return null;
    const rf = runRoadFactor(solution, flow);
    const box = 'pointer-events-auto w-[30rem] max-w-[calc(100vw-2rem)] rounded border-2 bg-white/95 p-2 text-sm shadow-lg';

    if (!rf) {
        return (
            <div id="trace-panel" data-pass="false" className={`${box} border-orange-700`}>
                Trace: road factor {MISSING}.
            </div>
        );
    }
    const t = traceFlow(flow, rf);
    const commodity = flow.commodity === 'saf' ? 'SAF' : flow.commodity === 'biomass' ? 'biomass' : '';

    return (
        <div
            id="trace-panel"
            data-pass={t.pass ? 'true' : 'false'}
            className={`${box} ${t.pass ? 'border-blue-800' : 'border-orange-700'}`}
            role="region"
            aria-label="Flow trace"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="font-bold">
                        Trace: {LEG_LABEL[flow.leg]} {commodity && <span className="font-normal text-gray-600">({commodity})</span>}
                    </div>
                    <div className="truncate text-xs text-gray-700">
                        {flow.from_label ?? flow.from} → {flow.to_label ?? flow.to}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <span
                        id="trace-verdict"
                        className={`rounded px-2 py-0.5 text-base font-black tracking-wide ${
                            t.pass ? 'bg-blue-800 text-white' : 'bg-orange-600 text-white'
                        }`}
                    >
                        {t.pass ? 'PASS' : 'FAIL'}
                    </span>
                    {onClose && (
                        <button type="button" onClick={onClose} className="px-1 text-lg leading-none text-gray-600" aria-label="Close trace">
                            ×
                        </button>
                    )}
                </div>
            </div>
            <div className="mt-1 space-y-0.5 font-mono text-xs leading-snug">
                <div>
                    hav = {n(t.havKm, 3)} km{' '}
                    <span className="text-gray-500">
                        (haversine R = {EARTH_RADIUS_KM}, stored {n(t.storedHavKm, 3)})
                    </span>
                </div>
                <div>
                    km = {n(t.havKm, 3)} × {t.roadFactor} = {n(t.km, 3)} km
                    {t.roadFactorSource === 'flow' && <span className="text-orange-800"> (flow&apos;s road factor: run has none)</span>}
                </div>
                <div>
                    stored {n(t.storedKm, 3)} km, Δ {n(t.dKm, 3)} (tol {KM_TOL}) <Verdict ok={t.kmOk} />
                </div>
                <div>
                    rate = ${t.rate}/t·km <span className="text-gray-500">(PDF p. 3)</span>, flow says ${t.storedRate}
                    <Verdict ok={t.rateOk} />
                </div>
                <div>
                    cost = {n(t.kt, 3)} kt × 1000 × {n(t.km, 3)} km × ${t.rate} = {usdExact(t.cost)}
                </div>
                <div>
                    stored {usdExact(t.storedCost)}, Δ {usdExact(t.dCost)} (tol {usdExact(t.costTol)}) <Verdict ok={t.costOk} />
                </div>
            </div>
        </div>
    );
}
