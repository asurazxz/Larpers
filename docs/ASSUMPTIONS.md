# Assumptions ledger

One row per input. Status key:

- **official**: stated in the Airbus PDF (Challenge #3, pp. 3-4) or in `data/raw/`.
- **computed**: derived by our pipeline from official inputs.
- **assumed**: ours. Change it in the scenario and the network may change.

The Airbus PDF outranks `data/raw/`, which outranks the original brief.

> Biomass sites are organiser-supplied and treated as synthetic: the tonnages look generated, and 11 of 80 sites (966 kt, 14%) plot in the sea off Ketapang, so those are supply only, not facility candidates. Results show how the method behaves, not where to buy land. A real plan needs mill-level data. Airports are real (OpenFlights). Road checks use OpenStreetMap, which under-maps plantation tracks.

## Ledger

| Input | Value | Status | Source |
|---|---|---|---|
| Supply sites | 80 sites, 6,800.0 kt total | official | `data/raw/`; PDF |
| Site tonnage unit | Dry tonnes (moisture basis not stated) | assumed | Neither the PDF nor the CSV states a basis. Wet basis at 6% yield is a stored scenario |
| Feedstock type | Not stated; "palm residue" is not claimed | assumed | PDF says "agricultural and forestry residues"; the CSV has no crop column |
| Collection policy | Collect all biomass (6,800 kt) | assumed | The PDF never says all must be collected. Optional collection is a stored scenario |
| Facility candidates | 69 onshore sites | computed | `global_land_mask` on the 80 coordinates |
| Offshore sites | 11 Ketapang sites (03, 22, 31, 32, 37, 43, 50, 58, 62, 69, 80), supply only | computed | `global_land_mask`; checked against geoBoundaries. KAL_SUP_58 is borderline at 3.9 km |
| Airports | PNK, PKN, BPN, TRK, selected by IATA code | official | `data/raw/airports.dat` (OpenFlights) |
| Depot capacity | 150 kt (small), 300 kt (large), biomass in | official | PDF cost table. The "biomass in" reading is ours (moot at retention 1) |
| Depot CapEx | $2.25M (small), $4.5M (large) | official | PDF cost table |
| Refinery capacity | 500 kt (small), 1,087 kt (large) | official | PDF cost table |
| Refinery capacity meaning | SAF output, with a biomass-input toggle | assumed | PDF heading "Production Capacity" favours output. A mentor question is pending |
| Refinery CapEx | $480M (small), $765M (large) | official | PDF cost table |
| Rate supply to depot | 0.10 USD/t/km | official | PDF p. 3 |
| Rate depot to refinery | 0.12 USD/t/km | official | PDF p. 3 |
| Rate refinery to airport | 0.08 USD/t/km | official | PDF p. 3. The original brief said 0.15, which is wrong |
| Truck sizes | Small 3, 18, 16 t; large 9, 30, 32 t per leg | official | PDF p. 3. Used for trip counts only, not cost |
| OpEx | Not provided | official | The PDF objective names OpEx but gives no figures. We do not invent one |
| Yield (base) | 15% SAF per tonne of biomass | assumed | Reported as inside a 0.13 to 0.16 band from CRL Energy (2009), total Fischer-Tropsch liquids, not kerosene alone. Source not yet opened by us. Gives 1,020 kt, 6.2% under one large refinery |
| Yield (step case) | 16%, stored to show the capacity step | assumed | At 16%, 6,800 kt gives 1,088 kt, above 1,087 kt. Break-even is 0.15985 |
| Depot retention r | 1.0 (no mass loss at depots) | assumed | Team placeholder. Drying or preparation losses are not modelled in the base |
| Road factor | 1.9 (sweep 1.4, 1.9, 2.3) | computed | Median road to straight-line ratio on 1,954 pairs of 25 km or more, from the bundled OSRM table. OSM under-maps plantation tracks, so 1.9 may run high on short first-mile legs |
| Straight-line distance | Haversine, radius 6371.0088 km, rounded to 0.01 km | computed | `data/prepare.py` |
| Road distances | 84 x 84 OSRM table; sea-site road km include the OSRM snap distance | computed | Bundled in `data/reference/`, (c) OpenStreetMap contributors. Never called at runtime |
| Supply-leg haul limit | 214 km straight line (300 km / 1.4) | assumed | Stated farm-truck limit, set on straight-line distance so the arc set does not move with the road factor. |
| Depot to refinery limit | None | assumed | The original 600 km limit made single-refinery plans infeasible |
| Split flows | Allowed (a site may send to several depots) | assumed | Lets the MILP prove gap 0. The greedy baseline keeps one depot per site, so the saving includes this difference |
| Horizon H | 1 year (shown beside 5 years) | assumed | The PDF gives no horizon. CapEx is one-off and logistics recurs, so H changes the refinery count |
| Demand total | Production-derived: yield x retention x collected biomass | assumed | No official demand figure exists. Labelled ours: a gateway scenario, not forecast offtake |
| Demand split | BPN 55.8, PNK 31.7, TRK 7.5, PKN 5.0 %, editable per airport | assumed | Pre-COVID passenger share, all four airports from one era, a proxy for fuel uplift (BPN at 7.4M). Not fuel data |
| Airports as refinery sites | Allowed as refinery candidates, not depots | assumed | PDF asks for "optimal coordinates" and does not restrict them. Land availability is unverified |
| Sea transport, ports, barges | Not modelled | assumed | No port nodes and no barge rate. The Tarakan access leg is priced as a truck leg |
| Seasonality, moisture, storage | Not modelled | assumed | Annual totals only |
| Solver | PuLP 2.9.0 with HiGHS (highspy 1.15.1) | computed | Status, gap and bound are read from the HiGHS model, not from PuLP |
| "Optimal" wording | Only when HiGHS reports optimal and gap is 0 | computed | Otherwise "best found, gap X%" |
| Data hash | SHA-256 of raw files and arrays, stored as `data_hash` | computed | `data/processed/hashes.json` |

## Stress test

A fixed-seed set of 20 random scenarios plus one deliberately infeasible case, run through solve and audit.

| Measure | Result |
|---|---|
| Solved count | TBD (filled from the stress run) |
| Worst solve time | TBD (filled from the stress run) |
| Worst gap | TBD (filled from the stress run) |
