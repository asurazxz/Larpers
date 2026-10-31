'use client';

// Arc-click trace: recomputes the selected flow's km and cost in the browser from lat/lon, the run's road
// factor and the PDF rates, and compares them with the stored values. A corrupted cost visibly fails.
import { useEffect } from 'react';
import type { Flow, Solution } from '../lib/contract';
import { LEG_LABEL, MISSING, usdExact } from '../lib/format';
import { EARTH_RADIUS_KM, KM_TOL, runRoadFactor, traceFlow } from '../lib/trace';

const n = (v: number, dp: number) =>
    Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : MISSING;

function Verdict({ ok }: { ok: boolean }) {
    return (
        <span className={`ml-1 rounded-full px-2 font-sans text-[16px] font-semibold ${ok ? 'bg-blue-50 text-blue-800' : 'bg-orange-100 text-orange-900'}`}>
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
    const open = !!solution && !!selected;
    useEffect(() => {
        if (!open || !onClose) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        // Capture phase: Leaflet stops Escape at the map when a popup is open.
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, onClose]);
    if (!solution || !selected) return null;
    const { flow, index } = selected;
    // A selection from another run is stale: the road factor would come from the wrong run.
    if (solution.flows[index] !== flow) return null;
    const rf = runRoadFactor(solution, flow);
    const box =
        'pointer-events-auto w-[36rem] max-w-[calc(100vw-3rem)] rounded-[18px] md:max-w-[calc(60vw-2rem)] border bg-white/90 px-4 py-3 text-base shadow-float backdrop-blur-xl backdrop-saturate-150';

    if (!rf) {
        return (
            <div id="trace-panel" data-pass="false" className={`${box} border-orange-300`}>
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
            className={`${box} ${t.pass ? 'border-black/[0.06]' : 'border-orange-300'}`}
            role="region"
            aria-label="Flow trace"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="font-semibold tracking-[-0.01em]">
                        Trace: {LEG_LABEL[flow.leg]} {commodity && <span className="font-normal text-ink2">({commodity})</span>}
                    </div>
                    <div className="truncate text-[16px] text-ink2">
                        {flow.from_label ?? flow.from} → {flow.to_label ?? flow.to}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <span
                        id="trace-verdict"
                        className={`rounded-full px-3 py-0.5 text-base font-semibold tracking-[0.04em] ${
                            t.pass ? 'bg-accent text-white' : 'bg-orange-700 text-white'
                        }`}
                    >
                        {t.pass ? 'PASS' : 'FAIL'}
                    </span>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-track text-lg leading-none text-ink2 hover:bg-gray-300"
                            aria-label="Close trace (Escape)"
                            title="Close (Esc)"
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>
            <div className="num hair-t mt-2 space-y-0.5 pt-2 font-mono text-[16px] leading-snug text-ink">
                <div>
                    hav = {n(t.havKm, 3)} km{' '}
                    <span className="text-ink2">
                        (R = {EARTH_RADIUS_KM}, stored {n(t.storedHavKm, 3)})
                    </span>
                </div>
                {t.roadKm !== null ? (
                    <div>
                        km = max(OSRM road {n(t.roadKm, 3)}, hav {n(t.havKm, 3)}) = {n(t.km, 3)} km{' '}
                        <span className="text-ink2">(car profile, not the official 1.3 factor)</span>
                    </div>
                ) : (
                    <div>
                        km = {n(t.havKm, 3)} × {t.roadFactor} = {n(t.km, 3)} km
                        {t.roadFactorSource === 'flow' && <span className="text-orange-800"> (flow&apos;s road factor: run has none)</span>}
                    </div>
                )}
                <div>
                    stored {n(t.storedKm, 3)} km, Δ {n(t.dKm, 3)} (tol {KM_TOL}) <Verdict ok={t.kmOk} />
                </div>
                <div>
                    rate = ${t.rate}/t·km <span className="text-ink2">(PDF p. 3)</span>, flow says ${t.storedRate}
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
