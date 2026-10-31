# Assumptions ledger

One row per input. Status key:

- **official**: stated in the Airbus PDF (Challenge #3, pp. 3-4), in the organisers' update of 31 Oct 12:45 (`resource/Autonomous SG 2026_Summary of Updates.pdf`, p. 2; `data/raw/challenge3_parameters.xlsx`), or in `data/raw/`.
- **computed**: derived by our pipeline from official inputs.
- **assumed**: ours. Change it in the scenario and the network may change.

The 12:45 update outranks the original PDF where they differ. Both outrank the `data/raw/` site data, which outranks the original brief. The base scenario uses the official values. Our earlier assumptions are kept as one labelled sensitivity run, `earlier_assumptions`.

> Biomass sites are organiser-supplied and treated as synthetic: the tonnages look generated, and 11 of 80 sites (966 kt, 14%) plot in the sea off Ketapang, so those are supply only, not facility candidates. Results show how the method behaves, not where to buy land. A real plan needs mill-level data. Airports are real (OpenFlights). Road checks use OpenStreetMap, which under-maps plantation tracks.

## Ledger

"Update" means Summary of Updates, 31 Oct 12:45, and `data/raw/challenge3_parameters.xlsx`.

| Input | Value | Status | Source |
|---|---|---|---|
| Supply sites | 80 sites, 6,800.0 kt total | official | `data/raw/`; PDF |
| Collection policy | Optional. Not all 6,800 kt must be used; which sites to skip is part of the problem | official | update |
| Site tonnage unit | Dry tonnes (moisture basis not stated) | assumed | Neither the PDF nor the CSV states a basis. The organisers ignore moisture |
| Feedstock type | Not stated; "palm residue" is not claimed | assumed | PDF says "agricultural and forestry residues"; the CSV has no crop column |
| Facility sites | Anywhere on land in Kalimantan | official | update |
| Facility candidates | 69 onshore sites (our discrete set for that rule) | computed | `global_land_mask` on the 80 coordinates |
| Offshore sites | 11 Ketapang sites (03, 22, 31, 32, 37, 43, 50, 58, 62, 69, 80), supply only | computed | `global_land_mask`; checked against geoBoundaries. KAL_SUP_58 is borderline at 3.9 km |
| Airports | PNK, PKN, BPN, TRK, selected by IATA code | official | `data/raw/airports.dat` (OpenFlights) |
| Demand | 300 kt SAF per airport per year; 1,200 kt total; needs 6,000 kt biomass | official | update |
| Planning basis | One year | official | update |
| CapEx annualisation | CapEx / 20 years, no interest | official | update |
| Fixed OpEx | 5% of CapEx per year | official | update |
| Depot capacity | 150 kt (small), 300 kt (large), biomass in per year | official | update |
| Depot CapEx | $2.25M (small), $4.5M (large) | official | PDF cost table; update |
| Depot variable OpEx | $5 (small), $4 (large) per t of biomass in | official | update |
| Refinery capacity | 500 kt (small), 1,087 kt (large), biomass in per year | official | update. Capacity is biomass intake, not SAF output |
| Refinery CapEx | $480M (small), $765M (large) | official | PDF cost table; update |
| Refinery variable OpEx | $60 (small), $55 (large) per t of biomass in | official | update |
| Yield | 0.20 t SAF per t biomass | official | update: "inside the 15-25% range for biomass-to-jet routes" |
| Depot retention r | 1.0 (depots lose no mass) | official | update |
| Objective | Minimise annualised CapEx + fixed OpEx + variable OpEx + transport, meeting every airport's demand | official | update. A run includes the OpEx terms only when its `opex` field is not "not_provided" |
| Rate supply to depot | 0.10 USD/t/km | official | PDF p. 3; update |
| Rate depot to refinery | 0.12 USD/t/km | official | PDF p. 3; update |
| Rate refinery to airport | 0.08 USD/t/km | official | PDF p. 3; update. The original brief said 0.15, which is wrong |
| Truck sizes | Small 3, 18, 16 t; large 9, 30, 32 t per leg | official | PDF p. 3; update. Same rate for both sizes, so trip counts only, not cost |
| Road factor | 1.3 on great-circle distance | official | update |
| Tarakan (TRK) | Island. Last leg by barge at 0.08 USD/t/km, no extra fixed cost | official | update. No second source or ferry model needed |
| Your own numbers | Allowed if stated and justified | official | update |
| Straight-line distance | Haversine, radius 6371.0088 km, rounded to 0.01 km | computed | `data/prepare.py` |
| Road distances (reference) | 84 x 84 OSRM table; sea-site road km include the OSRM snap distance | computed | Bundled in `data/reference/`, (c) OpenStreetMap contributors. Reference check only, not the cost basis. Never called at runtime |
| Supply-leg haul limit | 214 km straight line (300 km / 1.4), if the solver keeps it | assumed | Stated farm-truck limit, set on straight-line distance so the arc set does not move with the road factor. Not in the update |
| Depot to refinery limit | None | assumed | The original 600 km limit made single-refinery plans infeasible |
| Refinery candidate shortlist | A subset of the 69 sites | assumed | Keeps the MILP small. "Optimal" holds among the shortlist only |
| Split flows | Allowed (a site may send to several depots) | assumed | Lets the MILP prove gap 0. The greedy baseline keeps one depot per site, so the saving includes this difference |
| Airports as refinery sites | Allowed as refinery candidates, not depots | assumed | Land availability is unverified |
| Seasonality, moisture, storage | Not modelled | assumed | Annual totals only |
| Solver | PuLP 2.9.0 with HiGHS (highspy 1.15.1) | computed | Status, gap and bound are read from the HiGHS model, not from PuLP |
| "Optimal" wording | Only when HiGHS reports optimal and gap is 0 | computed | Otherwise "best found, gap X%" |
| Data hash | SHA-256 of raw files and arrays, stored as `data_hash` | computed | `data/processed/hashes.json` |

## Our earlier assumptions (sensitivity run `earlier_assumptions`)

Before the 12:45 update we set these ourselves. They are stored as one labelled run, "our earlier assumptions", beside the official base. They are not the base.

| Input | Earlier value | Official value now |
|---|---|---|
| Yield | 15% (CRL Energy 2009 band 0.13 to 0.16, total Fischer-Tropsch liquids; source not opened by us) | 20% |
| Road factor | 1.9, measured on 1,954 OSRM pairs of 25 km or more | 1.3 |
| Demand | Production-derived: yield x collected biomass, split BPN 55.8, PNK 31.7, TRK 7.5, PKN 5.0 % (pre-COVID passenger share, a proxy) | 300 kt per airport |
| Collection | Collect all 6,800 kt | Optional |
| Capacity meaning | Refinery capacity as SAF output | Biomass intake |
| Objective | CapEx + H x logistics, H = 1 year; no OpEx | Annualised CapEx + fixed and variable OpEx + transport |
| Tarakan access | Priced as a truck leg | Barge at 0.08 USD/t/km |
| Depot retention | 1.0, a team placeholder | 1.0, official |

The run answers one question: how much did following the organisers' update change the network and the cost. Compare `[bundle:earlier_assumptions.total_horizon_usd]` with `[bundle:base.total_horizon_usd]`.

## Stress test

A fixed-seed set of 20 random scenarios around the official base, plus one deliberately infeasible case, run through solve and audit.

| Measure | Result |
|---|---|
| Solved count | TBD (filled from the stress run) |
| Worst solve time | TBD (filled from the stress run) |
| Worst gap | TBD (filled from the stress run) |
