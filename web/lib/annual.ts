// Organisers' annual cost basis (12:45 update, data/raw/challenge3_parameters.xlsx), recomputed in the
// browser from the run's own facilities and costs, like trace.ts recomputes arc costs.
import type { Facility, Solution } from './contract';

export const CAPEX_YEARS = 20;
export const FIXED_OPEX_SHARE = 0.05;
/** Variable OpEx, USD per tonne of biomass in. */
export const VARIABLE_OPEX_USD_PER_T: Record<Facility['type'], Record<Facility['size'], number>> = {
    depot: { small: 5, large: 4 },
    refinery: { small: 60, large: 55 },
};

export interface AnnualCost {
    annualisedCapex: number;
    fixedOpex: number;
    variableOpex: number | null;
    transport: number;
    total: number | null;
    /** True when the solver supplied the figures; false when recomputed here from the run. */
    fromSolver: boolean;
}

function biomassInKt(f: Facility, yieldFraction: number | undefined): number | null {
    if (f.capacity_basis === 'biomass_in') return f.throughput_kt;
    return yieldFraction ? f.throughput_kt / yieldFraction : null;
}

export function annualCost(s: Solution): AnnualCost {
    if (s.total_annual_usd != null) {
        return {
            annualisedCapex: s.annualised_capex_usd ?? s.capex_usd / CAPEX_YEARS,
            fixedOpex: s.fixed_opex_usd ?? s.capex_usd * FIXED_OPEX_SHARE,
            variableOpex: s.variable_opex_usd ?? null,
            transport: s.logistics_annual_usd,
            total: s.total_annual_usd,
            fromSolver: true,
        };
    }
    const y = s.scenario?.yield;
    let variable: number | null = 0;
    for (const f of s.facilities) {
        const kt = biomassInKt(f, y);
        if (kt == null || variable == null) {
            variable = null;
            continue;
        }
        variable += kt * 1000 * VARIABLE_OPEX_USD_PER_T[f.type][f.size];
    }
    const annualisedCapex = s.capex_usd / CAPEX_YEARS;
    const fixedOpex = s.capex_usd * FIXED_OPEX_SHARE;
    const transport = s.logistics_annual_usd;
    return {
        annualisedCapex,
        fixedOpex,
        variableOpex: variable,
        transport,
        total: variable == null ? null : annualisedCapex + fixedOpex + variable + transport,
        fromSolver: false,
    };
}
