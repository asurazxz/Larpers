// Hand-written stub: regenerate from contracts/solution.schema.json when Damien's contract lands.
// Fields that may be absent are optional so the UI can show "not in this run".

export const AIRPORTS = ['PNK', 'PKN', 'BPN', 'TRK'] as const;
export type AirportCode = (typeof AIRPORTS)[number];

export type DemandKt = Record<AirportCode, number>;

export type CollectionPolicy = 'all' | 'optional';
export type CapacityBasis = 'saf_output' | 'biomass_input';

export interface Scenario {
    /** null = full-production preset (split BPN 55.8, PNK 31.7, TRK 7.5, PKN 5.0). */
    demand_kt: DemandKt | null;
    yield: number;
    depot_retention: number;
    road_factor: number;
    horizon_years: number;
    collection_policy: CollectionPolicy;
    capacity_basis: CapacityBasis;
    excluded_ids: string[];
    time_limit_s: number;
}

export const DEFAULT_SCENARIO: Scenario = {
    demand_kt: null,
    yield: 0.15,
    depot_retention: 1,
    road_factor: 1.9,
    horizon_years: 1,
    collection_policy: 'all',
    capacity_basis: 'saf_output',
    excluded_ids: [],
    time_limit_s: 90,
};

export type SolveStatus = 'optimal' | 'best_found' | 'infeasible' | 'heuristic';

export type FacilityType = 'depot' | 'refinery';
export type FacilitySize = 'small' | 'large';

export interface Facility {
    site_id: string;
    label?: string;
    type: FacilityType;
    size: FacilitySize;
    lat: number;
    lon: number;
    capacity_kt?: number;
    /** `biomass_in` for depots, `saf_out` for refineries (or `biomass_in` under the biomass-input basis). */
    capacity_basis?: 'biomass_in' | 'saf_out';
    throughput_kt?: number;
    utilisation?: number;
    capex_usd?: number;
}

export type Leg = 'supply_depot' | 'depot_refinery' | 'refinery_airport';
export type Commodity = 'biomass' | 'saf';

export interface Flow {
    leg: Leg;
    commodity?: Commodity;
    from: string;
    to: string;
    from_lat: number;
    from_lon: number;
    to_lat: number;
    to_lon: number;
    from_label?: string;
    to_label?: string;
    /** Unrounded: 3 dp rounding breaks the 1e-6 audit. */
    kt: number;
    hav_km: number;
    road_factor: number;
    /** hav_km × road_factor */
    km: number;
    rate_usd_per_t_km: number;
    /** kt × 1000 × km × rate */
    cost_usd: number;
    truck_t?: number;
    trips?: number;
    road_km?: number | null;
}

export interface Stranded {
    site_id: string;
    label?: string;
    lat: number;
    lon: number;
    kt: number;
    reason?: string;
}

/** Surplus SAF held at a refinery gate (e_k). */
export interface Surplus {
    site_id: string;
    label?: string;
    lat?: number;
    lon?: number;
    kt: number;
    reason?: string;
}

export interface Portfolio {
    n_large: number;
    n_small: number;
    /** e.g. optimal | best_found | infeasible | skipped_capacity | skipped_capex | timeout */
    status: string;
    capex_usd?: number | null;
    primal?: number | null;
    bound?: number | null;
    gap?: number | null;
    solve_seconds?: number | null;
    reason?: string;
}

export interface AuditReport {
    passed: boolean;
    max_residuals: Record<string, number | null>;
    failures: string[];
}

export interface AirportResult {
    id: AirportCode | string;
    label?: string;
    lat: number;
    lon: number;
    demand_kt?: number;
    delivered_kt?: number;
}

export interface Solution {
    run_id: string;
    /** e.g. live | stored | fixture | baseline */
    source: string;
    data_hash: string;
    scenario_hash: string;
    /** Echoed scenario, if the solver returns it. */
    scenario?: Scenario;
    status: SolveStatus;
    primal: number | null;
    bound: number | null;
    gap: number | null;
    n_candidates?: number;
    solve_seconds?: number;
    facilities: Facility[];
    flows: Flow[];
    stranded?: Stranded[];
    surplus?: Surplus[];
    capex_usd?: number | null;
    logistics_annual_usd?: number | null;
    logistics_by_leg_usd?: Partial<Record<Leg, number>>;
    opex: 'not_provided';
    total_horizon_usd?: number | null;
    portfolios?: Portfolio[];
    /** Airport demand and delivery; if absent, derive from flows. */
    airports?: AirportResult[];
    validation?: AuditReport;
}

/** One stored run in web/data/bundle.json, keyed by slug. Denzel's generator owns the format. */
export interface BundleEntry {
    slug: string;
    family: string;
    label?: string;
    status: SolveStatus;
    solved_at: string;
    data_hash: string;
    precomputed: boolean;
    /** The stored Solution. If absent, the entry itself is read as a Solution. */
    solution?: Solution;
    params?: Record<string, unknown>;
}

export type Bundle = Record<string, BundleEntry>;

/** One of the 80 supply sites, from web/data/sites.json. */
export interface Site {
    id: string;
    label: string;
    province: string;
    district: string;
    lat: number;
    lon: number;
    kt: number;
    /** Plots in the sea off Ketapang: supply only, not a facility candidate. */
    sea: boolean;
}
