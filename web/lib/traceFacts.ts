// Plain-language facts for one traced route, for the Explain button. Every value is display text from
// traceFlow, so Gemini only places them. The pass or fail sentence is written here, never by the model.
import type { Flow, Solution } from './contract';
import { pct, usd, usdExact } from './format';
import type { FlowTrace } from './trace';

const ROLE: Record<Flow['leg'], string> = {
    supply_depot: 'it brings plant material from a growing area to a depot',
    depot_refinery: 'it takes plant material from a depot to a refinery, which turns it into fuel',
    refinery_airport: 'it takes finished fuel from a refinery to an airport',
};

const n = (v: number, dp: number) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export function traceCheck(t: FlowTrace): string {
    const failed = [!t.kmOk && 'distance', !t.rateOk && 'rate', !t.costOk && 'cost'].filter(Boolean);
    return failed.length === 0
        ? "This page recalculated the distance, rate and cost from the map coordinates and the organisers' rates, and all three match the stored plan within the allowed margin."
        : `This page recalculated this route and the ${failed.join(' and ')} did not match the stored plan, so do not rely on its figures.`;
}

export function traceFacts(solution: Solution, flow: Flow, t: FlowTrace): Record<string, string> {
    const arriving = solution.flows.filter((f) => f.leg === flow.leg && f.to === flow.to).reduce((sum, f) => sum + f.kt, 0);
    return {
        amount_moved: `${n(t.kt * 1000, 0)} tonnes`,
        cargo: flow.commodity === 'saf' ? 'sustainable aviation fuel' : 'plant material',
        transport_mode: flow.leg === 'refinery_airport' && flow.to === 'TRK' ? 'barge' : 'truck',
        from_place: flow.from_label ?? flow.from,
        to_place: flow.to_label ?? flow.to,
        route_role: ROLE[flow.leg],
        straight_line_distance: `${n(t.havKm, 3)} km`,
        share_of_destination_supply: pct(arriving > 0 ? t.kt / arriving : null),
        plan_transport_cost: usd(solution.logistics_annual_usd),
        road_factor: String(t.roadFactor),
        route_distance: `${n(t.km, 3)} km`,
        rate_per_tonne_km: `$${t.rate}`,
        recalculated_cost: usdExact(t.cost),
        stored_cost: usdExact(t.storedCost),
        cost_difference: usdExact(Math.abs(t.dCost)),
        allowed_difference: usdExact(t.costTol),
        check_result: traceCheck(t),
    };
}

/** The same figures with no model, for the static fallback or when Gemini is unavailable. */
export function traceFallback(f: Record<string, string>): string {
    return (
        `This route moves ${f.amount_moved} of ${f.cargo} by ${f.transport_mode} a year from ${f.from_place} to ${f.to_place}: ${f.route_role}. ` +
        `That is ${f.share_of_destination_supply} of what reaches ${f.to_place}. ` +
        `The straight line between them is ${f.straight_line_distance}, and multiplying by ${f.road_factor} to allow for real routes gives ${f.route_distance}. ` +
        `At ${f.rate_per_tonne_km} per tonne for each km, that costs ${f.recalculated_cost} a year, against ${f.stored_cost} in the stored plan and ${f.plan_transport_cost} of transport across the whole plan. ` +
        `The ${f.cost_difference} gap is inside the ${f.allowed_difference} allowed. `.repeat(f.check_result.includes('did not match') ? 0 : 1) +
        f.check_result
    );
}
