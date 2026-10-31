# Next: ideas after the 14:00 freeze

None of these are in the build. One line each, with the reason.

## Scenarios the contract cannot express yet

| Idea | Field needed | Reason |
|---|---|---|
| `nk_excluded`: remove Bulungan and scale demand | A way to drop supply sites while keeping them out of the 6,800 kt total, plus a demand-scaling rule | Shows the price of serving Bulungan |
| `nk_local_refinery`: force a small refinery at KAL_SUP_70 | `forced_open_ids` (or `forced_refinery_ids`) | Tests a local plant against hauling 700+ km |
| `road_matrix`: solve on OSRM road km instead of haversine x factor | A `distance_basis` field (`factor` or `osrm`) | Answers whether the network changes on real roads |
| District lost without losing depots | `excluded_refinery_ids` | "District lost" runs now exclude every site in the district, depots too, because there is no refinery-only exclusion |

## Model and data

- Barge or ferry rate for Tarakan and Bulungan. The OSRM route to TRK includes a water crossing that we price at the truck rate.
- Port nodes and a sea export leg. Most SAF would leave by sea, and we have none.
- Mill-level tonnage, crop and moisture data. The sites are organiser-supplied and treated as synthetic.
- Depot retention runs below r = 1 (drying or handling losses). The base uses r = 1, and no r < 1 run is stored.
- Real OSRM routes on a self-hosted truck profile, with plantation tracks added. OSM under-maps them.
- Second source for the Tarakan ferry. Until then Bulungan is the failure case.
- Multi-period model with harvest seasons and inventory. Annual totals hide peaks.
- OpEx once Airbus supplies figures. The PDF names it and gives none.
- Fuel-uplift data for the four airports from Pertamina. Passenger share is only a proxy.
- Proof over all refinery sites. Today's "optimal" holds among the shortlisted candidates only.
- Re-solve the baseline at each horizon. The H = 5 comparison used a fixed baseline.
- Run the unrun refinery mixes (two large, large plus two small, four small).

## Product

- Hosted solve on a public URL, after ten consecutive successful runs on the laptop.
- Precomputed, machine-checked explanation paragraph per stored run. Every number checked against the solution JSON.
- Per-run PDF export of the assumptions ledger.
