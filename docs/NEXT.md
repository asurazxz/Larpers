# Next: ideas after the 14:00 freeze

None of these are in the build. One line each, with the reason.

## Scenarios the contract cannot express yet

| Idea | Field needed | Reason |
|---|---|---|
| `nk_excluded`: remove Bulungan and scale demand | A way to drop supply sites while keeping them out of the 6,800 kt total, plus a demand-scaling rule | Shows the price of serving Bulungan |
| `nk_local_refinery`: force a small refinery at KAL_SUP_70 | `forced_open_ids` (or `forced_refinery_ids`) | Tests a local plant against hauling 700+ km |
| District lost without losing depots | `excluded_refinery_ids` | "District lost" runs now exclude every site in the district, depots too, because there is no refinery-only exclusion |

## Model and data

- Re-run the refinery shortlist under the official objective. The shortlist was chosen before the 12:45 update, so a better refinery site outside it is not ruled out.
- Real barge rates and a port model for Tarakan and Bulungan. The organisers set the barge at the truck rate, which a real barge may not match.
- Port nodes and a sea export leg. Most SAF would leave by sea, and we have none.
- Mill-level tonnage, crop and moisture data. The sites are organiser-supplied and treated as synthetic.
- OSRM on a self-hosted truck profile, with plantation tracks added. OSM under-maps them. Today `distance_basis: osrm` and the map routes use the public demo server's car profile.
- A live-solve control for `distance_basis` in the scenario panel. The API accepts it today; the panel does not send it.
- Multi-period model with harvest seasons and inventory. Annual totals hide peaks.
- Proof over all refinery sites. Today's "optimal" holds among the shortlisted candidates only.
- Re-solve the baseline under each scenario's own settings, not a fixed baseline.
- Run the unrun refinery mixes. The official intake need of 6,000 kt makes the mix space larger.
- Financing cost beyond the organisers' 20-year, no-interest annualisation.

## Product

- Hosted solve on a public URL, after ten consecutive successful runs on the laptop.
- Precomputed, machine-checked explanation paragraph per stored run. Every number checked against the solution JSON.
- Per-run PDF export of the assumptions ledger.
- Return 503, not 401, when the API cannot fetch Supabase's signing keys. Today a network or certificate failure tells a signed-in user their session expired.
