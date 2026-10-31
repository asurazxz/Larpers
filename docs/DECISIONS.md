# Decisions

One line per call, with the reason. Newest at the bottom.

| Time (SGT) | Decision | Reason |
|---|---|---|
| 11:30 | Airbus PDF outranks raw data, which outranks the brief | The brief mis-transcribed the PDF cost table; judges check against the PDF |
| 11:30 | Refinery→airport cost is 0.08 USD/t/km, not 0.15 | PDF p. 3, confirmed on the rendered page |
| 11:30 | Pin `pulp==2.9.0` + `highspy==1.15.1`, on Python 3.14.6 | Only Python here; tested solve works; PuLP 4.x removed the classic API |
| 11:30 | Each expert writes `docs/proposals/<role>.md`; orchestrator merges into `docs/PROPOSALS.md` | Five agents writing one file in parallel would overwrite each other |
| 11:32 | Do not lock `docs/BUILD_PLAN.md` at 11:50. Produce a proposal with visual mockups first; the build plan and build wait for team sign-off | Lead's instruction: the four-person team vets the proposal first |
| 11:39 | `web/` is not limited to a single page; it may be multi-page if necessary | Lead's instruction, amending the Full-Stack proposal |
| 11:56 | Combine JY's and Damien's solutions into one proposal, still subject to team sign-off | Lead's instruction |
| 11:57 | Login uses Google OAuth | Lead's instruction; overrides the comparison PDF's advice to keep auth off the critical path |
| 12:14 | All recommended settings in `docs/COMBINED_PROPOSAL.md` accepted | Lead's instruction |
| 12:14 | POST /api/baseline requires sign-in, like /api/solve; /api/validate stays public | Baseline uses solver compute; validation only checks a supplied result |
| 12:14 | Live "Run" solves refinery mixes in parallel with a 90 s budget; the UI timeout is 150 s | Prototype mixes took 24-54 s each, so the earlier 30 s target cannot hold |
| 12:24 | Each member installs a short skill set from `docs/prompts/`, sourced from the lead's Notion library and official repos | Lead's instruction; each skill's SKILL.md was read-only checked on GitHub, and no installer was run |
| 12:24 | `nk_excluded`, `nk_local_refinery` and `road_matrix` move to `docs/NEXT.md` | The approved `Scenario` has no field for them |
| 12:24 | 20 random scenarios plus one infeasible case are required evidence | The Judge's off-script test had no owner |
| 14:18 | The organisers' 12:45 update is the base case; it overrides the settings approved at 12:14 | The update says to follow it wherever it differs from the original |
| 14:18 | MILP splits throughput by size | Variable OpEx differs by size, so a large depot is no longer two small ones |
| 14:18 | Capacity basis is biomass intake; collection is optional; demand is 300 kt SAF per airport | Update and `challenge3_parameters.xlsx`: 1,200 kt SAF needs 6,000 kt of the 6,800 kt |
| 14:18 | TRK removed as a refinery candidate | Trucks cannot reach Tarakan |
| 14:18 | 214 km haul limit kept as a stated assumption | Removing it saved about $0.9M a year (indicative) and more than triples the arcs |
| 14:18 | One facility of each type per site kept as a stated assumption | Depots otherwise add no transport benefit under the official rates; indicative effect about $3M a year |
| 14:18 | Mix floor replaces raw CapEx in the skip test | Raw CapEx would have skipped mixes that can win and produced a false "Optimal" |
| 14:18 | Timeout without an incumbent is no longer reported as infeasible | A time limit proves nothing about feasibility: "could not find", not "does not exist" |
| 14:22 | Shortlist rebuilt for official parameters: 20 sites, excluding TRK. `resolve()` proves 6 large refineries at $894.46M a year, gap 0, 79.8 s, optimal among those 20 | The earlier shortlist was built on pre-update settings. $1,393.5M and $2,554.3M used a different objective and are not comparable |
| 14:18 | Lead approved changing `solver/contract.py` and `solver/audit.py` in the solver PR | Official solves could not pass audit otherwise. `solver/audit.py` keeps the old total for rows without `total_annual_usd` until the baseline is rewritten |
| 14:48 | Mentor question closed: capacity is biomass intake, on a one-year basis | The organisers' 12:45 update settles it, so no mentor answer is needed. The solver already uses both |
| 14:48 | Tarakan check closed: the last leg is a barge at 0.08 USD/t/km with no extra fixed cost | The organisers' 12:45 update settles it, so no second source is needed. The solver costs the leg this way; it is still reported as trucks |
| 14:58 | Haul limit, refinery and depot candidate lists, solve-time cap and solver cores are backend settings; organiser values stay fixed | None of the five comes from the organisers. Defaults reproduce the base case and keep stored-run hashes |
| 14:58 | One facility of each type per site stays fixed | It is ours too, but stacking depots changes the audit, the contract and the map too close to submission |
| 15:20 | Add `distance_basis` (`factor` default, `osrm`) and the stored run `road_matrix`; the base case stays on 1.3 | The update fixes 1.3 x great-circle, so OSRM km is a sensitivity only. Defaults keep stored-run hashes |
| 15:20 | Under `osrm`, leg km is never below haversine, and the TRK barge stays on the factor | OSRM snapping makes 16 pairs shorter than the straight line; the car table's TRK route is not a barge |
| 15:20 | OSRM is fetched once, offline, from the public demo server (car profile) and committed; the app never calls it | The presenter's laptop must work with no network. A self-hosted truck profile is in NEXT.md |
| 15:20 | Bundle not regenerated in this PR; `road_matrix` joins T1 for Denzel's next `solver.scenarios` run | Denzel owns `bundle.json`, and v3 is on his branch. The solver change bumps `solver_version`, so every stored run re-solves anyway |
