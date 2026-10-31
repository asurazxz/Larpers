// Aligned with contracts/solution.schema.json and solver/contract.py at 919bcf0
// (origin/damien/contract-audit-api). Regenerate when the schema changes.

export const AIRPORTS = ['PNK', 'PKN', 'BPN', 'TRK'] as const;
export type AirportCode = (typeof AIRPORTS)[number];

/** KAL_SUP_01..KAL_SUP_80 or an airport code (schema pattern). */
export type NodeId = string;

/** Exactly the four airports. */
export type DemandKt = Record<AirportCode, number>;

export type CollectionPolicy = 'all' | 'optional';
export type CapacityBasis = 'saf_output' | 'biomass_input';

export type DistanceBasis = 'factor' | 'osrm';

/** The solve request. Not part of the Solution: the solver does not echo it. */
export interface Scenario {
    /** null = full-production preset (split BPN 55.8, PNK 31.7, TRK 7.5, PKN 5.0). */
    demand_kt: DemandKt | null;
    /** Wire alias of yield_fraction; (0, 1]. */
    yield: number;
    /** (0, 1] */
    depot_retention: number;
    /** >= 1 */
    road_factor: number;
    /** 'factor' (official): hav × road_factor. 'osrm': OSRM car road km, never below hav; TRK barge stays on factor. */
    distance_basis?: DistanceBasis;
    /** >= 1 */
    horizon_years: number;
    collection_policy: CollectionPolicy;
    capacity_basis: CapacityBasis;
    /** Deduplicated and sorted by the solver. */
    excluded_ids: NodeId[];
    /** > 0 */
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
export type PortfolioStatus = SolveStatus | 'skipped';
export type SolutionSource = 'live' | 'stored' | 'fixture' | 'baseline';

export type FacilityType = 'depot' | 'refinery';
export type FacilitySize = 'small' | 'large';

export interface Facility {
    site_id: NodeId;
    label: string;
    type: FacilityType;
    size: FacilitySize;
    lat: number;
    lon: number;
    capacity_kt: number;
    /** `biomass_in` for depots, `saf_out` for refineries (or `biomass_in` under the biomass-input basis). */
    capacity_basis: 'biomass_in' | 'saf_out';
    throughput_kt: number;
    utilisation: number;
    capex_usd: number;
}

export type Leg = 'supply_depot' | 'depot_refinery' | 'refinery_airport';
export type Commodity = 'biomass' | 'saf';

export interface Flow {
    leg: Leg;
    commodity: Commodity;
    /** Wire alias of from_id. */
    from: NodeId;
    to: NodeId;
    from_lat: number;
    from_lon: number;
    to_lat: number;
    to_lon: number;
    from_label: string;
    to_label: string;
    /** Unrounded: 3 dp rounding breaks the 1e-6 audit. */
    kt: number;
    hav_km: number;
    road_factor: number;
    /** hav_km × road_factor, or max(road_km, hav_km) when distance_basis is 'osrm' */
    km: number;
    rate_usd_per_t_km: number;
    /** kt × 1000 × km × rate */
    cost_usd: number;
    truck_t: 9 | 30 | 32;
    trips: number;
    /** OSRM car road km from the 84×84 table, offshore snap included. Costed only when distance_basis is 'osrm'. */
    road_km?: number | null;
    /** Absent on runs stored before the field existed: read as 'factor'. */
    distance_basis?: DistanceBasis;
}

export interface Stranded {
    site_id: NodeId;
    label: string;
    lat: number;
    lon: number;
    kt: number;
    reason: string;
}

/** Surplus SAF held at a refinery gate (e_k). */
export interface Surplus {
    site_id: NodeId;
    kt: number;
}

export interface Portfolio {
    n_large: number;
    n_small: number;
    status: PortfolioStatus;
    primal?: number | null;
    bound?: number | null;
    gap?: number | null;
    /** Defaults to 0. */
    solve_seconds?: number;
    reason?: string | null;
    capex_usd?: number | null;
}

/** All fields have solver defaults (passed false, failures ["Not audited"]). */
export interface AuditReport {
    passed?: boolean;
    max_residuals?: Record<string, number>;
    failures?: string[];
}

export interface Solution {
    schema_version?: 1;
    run_id: string;
    source: SolutionSource;
    data_hash: string;
    scenario_hash: string;
    status: SolveStatus;
    status_reason?: string | null;
    primal: number | null;
    bound: number | null;
    gap: number | null;
    n_candidates: number;
    solve_seconds: number;
    facilities: Facility[];
    flows: Flow[];
    stranded: Stranded[];
    surplus: Surplus[];
    capex_usd: number;
    logistics_annual_usd: number;
    opex?: 'not_provided';
    total_horizon_usd: number;
    /** Organisers' annual cost basis (12:45 update): proposed fields, absent from older runs. */
    annualised_capex_usd?: number | null;
    fixed_opex_usd?: number | null;
    variable_opex_usd?: number | null;
    total_annual_usd?: number | null;
    validation: AuditReport;
    portfolios?: Portfolio[];
    /** Not in the contract: the UI attaches the Scenario it posted to a live result. Absent on stored runs. */
    scenario?: Scenario;
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
