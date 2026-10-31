# Larpers: combined SAF solution

**Status: approved with the recommended settings below.** It combines JY's and Damien's solutions with the expert review. Task lists are in `docs/prompts/`.

Damien gives the product: a planner edits a scenario, presses Run, and gets a new audited network. JY gives the analysis: the MILP, baseline, disruption, sensitivity and "where this fails". The expert review gives the corrected data and a solver that proves its answer on the real 80 sites.

## Result so far

| At 15% yield, road factor 1.9 | Network | Total | Saving vs baseline |
|---|---|---|---|
| 1 year of logistics | 1 large refinery, Kotawaringin Barat, 32 depots | $1,393.5M | $64.0M (4.39%) |
| 5 years of logistics | 3 small refineries, best of three mixes tested | $2,554.3M | Not like for like yet |

These are prototype results for team review, not slide numbers. The candidate shortlist must be rebuilt at road factor 1.9 first. The saving also compares split flows with a one-depot-per-site baseline.

## What to sign off

Accepting this list locks the plan. Each item has a recommendation in Part B, section 5.

| # | Decision | Recommendation |
|---|---|---|
| 1 | Default settings | 15% yield, road factor 1.9, 1 year shown beside 5 years, all biomass collected |
| 2 | Refinery capacity meaning | SAF output, with a biomass-input toggle. Ask a mentor today |
| 3 | Live solve | On the presenter's laptop as P0, with stored runs as the labelled fallback |
| 4 | Login scope | Stored runs public, Google sign-in required for live solves |
| 5 | Supabase | Used for login. Solution data stays in a committed JSON bundle |
| 6 | Demand | Production-derived by default, editable per airport, labelled as ours |
| 7 | Web stack | Next.js 16.4.3 on one page |
| 8 | Failure case for the pitch | Tarakan ferry, once a second source confirms it |

**Team setup needed:** create the Google Cloud OAuth client and add it to Supabase (Part A, section 5). `DATABASE_URL` is no longer needed for the data path if decision 5 is accepted.

---

## Part A: The solution


**Proposal for team vetting.** Only Google login is confirmed. Prototype costs are provisional and not quoted. JY's six-site figures are not Kalimantan results and are not quoted either.

### 1. Combined solution

A planner edits a Kalimantan SAF scenario, presses Run, and gets a new network from a MILP solve on the official 80 sites, independently audited and compared with a greedy baseline. Damien supplies the product contract, JY the analysis and exhibits, and our expert work the corrected data and a formulation reaching gap 0 per refinery portfolio. Live solves run on the presenter's laptop behind Google sign-in, and anyone can open labelled stored runs without logging in.

### 2. What each contributes

Solver base: `v2.py` (PuLP 2.9 + HiGHS), throwaway code in a temp scratchpad, with its `m.py` import. JY's and Damien's originals are not accessible. If JY's code turns up, reuse its exhibits and tests only.

| Capability | Source | Status |
|---|---|---|
| Google login | Team, confirmed | To build |
| Run workflow, typed API, validator, negative tests, OpEx "not provided" | Damien | To build |
| Four independent D[a] | Damien | To build; prototype splits one total |
| Collection switch, H input, solver states | Damien | In prototype; UI to build |
| Map symbology | Damien | Comparison exhibits only |
| MILP core | JY | In prototype |
| Greedy baseline | JY | Partial: one large refinery only |
| Disruption, sensitivity grid, selection frequency, frozen replay, "where this fails", candidate disclaimer | JY | To build |
| Capacity discontinuity and pitch exhibits | JY | Regenerate on real data |
| Corrected rates, road factor 1.9, 11 sea sites as supply only, split flows, cuts plus per-portfolio solve, HiGHS proof status | Ours | In prototype |
| Flat JSON, arc-click trace | Ours | To build |
| No LLM in decisions | Ours | Rule |

### 3. Combined model

**Sets:** 80 sites i, 69 onshore depots j, N refinery candidates k (prototype 29, airports included), 4 airports a.

**Variables:** x_ij in [0,1], f_jk ≥ 0 biomass, g_ka ≥ 0 SAF, e_k ≥ 0 surplus SAF at the gate, zD and zR binary.

**Minimise** Σ CapEx · z + H · 1000 · [ 0.10 Σ d_ij P_i x_ij + 0.12 Σ d_jk f_jk + 0.08 Σ d_ka g_ka ]. OpEx shows as "not provided".

| Constraint | Form |
|---|---|
| Collection policy | Σ_j x_ij = 1 (all) or ≤ 1 (optional) |
| Depot balance, retention r | r · Σ_i P_i x_ij = Σ_k f_jk |
| Depot capacity | Σ_i P_i x_ij ≤ Σ_s C_D,s zD_j,s |
| Yield balance | y · Σ_j f_jk = Σ_a g_ka + e_k |
| Refinery capacity | SAF basis: Σ_a g_ka + e_k ≤ Σ_s C_R,s zR_k,s. Biomass basis: Σ_j f_jk ≤ same |
| Demand | Σ_k g_ka = D_a |
| Arcs | Supply leg haversine ≤ 214 km; no depot→refinery limit |
| Cuts | One size per site, x-link, f-link, depot cover (all only), Σ zL = nL, Σ zS = nS |

**Base case, all editable:** y 15%, road factor 1.9, H = 1 with 5 and 10 alongside, collection all, SAF basis, r = 1 (our placeholder). Demand preset D_a = s_a · y · r · ΣP gives BPN 569.2, PNK 323.3, TRK 76.5, PKN 51.0 kt, a gateway scenario, not forecast offtake.

**Not yet in prototype:** r, capacity basis, e_k. Without e_k, collection all with demand below production is infeasible.

**Proof rule:** "Optimal among N candidates" needs every feasible portfolio proven, or skipped because its CapEx alone exceeds the best total. At H = 5 the prototype ranks three small refineries first, so one proven portfolio proves nothing overall. The base case now meets this rule: one large and large + small are both proven, S and S + S cannot fit 1,020 kt, and every other mix costs more in CapEx alone. It holds only among the 29 shortlisted candidates, and that shortlist still needs rebuilding at road factor 1.9.

### 4. Product workflow

1. Open the link. A labelled stored run shows, with no login.
2. On the live laptop, sign in with Google and edit the scenario.
3. Press Run. Solver, validator and baseline return a new run ID.
4. Read the map, costs, saving, status, bound and gap. Click an arc to trace it.
5. Remove a facility, re-solve, and read the delta or "No feasible network".

### 5. Architecture and API

`data/raw → prepare → solver (FastAPI) → validator → flat JSON → static web`. Stored runs are a committed JSON bundle.

| Mode | Login | Solve | Badge |
|---|---|---|---|
| Laptop, Level 3 + FastAPI | Google | Live, P0 | LIVE SOLVE |
| Public URL, Level 2 | Google | Stretch, after ten consecutive successes | STORED RUN |
| `file://`, Level 4 | None; OAuth cannot work | None | STORED RUN, no login |

`/api/health` decides the badge. Stored runs stay labelled stored even when health is green.

| Access (proposed) | Endpoints |
|---|---|
| Public | GET /api/data, GET /api/health, POST /api/validate |
| Signed-in, else 401 | POST /api/solve |
| Team to decide | POST /api/baseline, which also uses compute |

**Input:** `demand_kt` (four airports), `yield`, `depot_retention`, `road_factor`, `horizon_years`, `collection_policy`, `capacity_basis`, `excluded_ids`, `time_limit_s`.

**Result:** `run_id`, `source`, `data_hash`, `scenario_hash`, `status`, `primal`, `bound`, `gap`, `n_candidates`, `solve_seconds`, `facilities[]`, `flows[]`, `stranded[]`, `surplus[]`, `capex_usd`, `logistics_annual_usd`, `opex`, `total_horizon_usd`, `validation`.

#### Login (confirmed requirement)

| Item | Position |
|---|---|
| Method | Supabase Auth, Google provider, client-side PKCE. A static export has no Next server, so NextAuth-style server routes do not fit |
| Supabase | Required for auth. Data stays in the committed bundle. **Team decision:** whether solution tables also live in Supabase |
| Access (team to confirm) | Stored runs need no login. POST /api/solve needs a signed-in user, and FastAPI verifies the Supabase JWT server-side. The judges' link survives a login failure |
| Fallbacks | Level 3 needs its localhost redirect URL registered. Level 4 runs stored runs without login, labelled as such |

**Team setup:** (1) create a Google Cloud OAuth client, whose redirect URI is the Supabase callback; (2) add its ID and secret to the Supabase provider settings; (3) register production and localhost redirect URLs in Supabase. Never put the client secret in `web/`.

**Risks:** sign-in needs network, so sign in before the pitch and check token lifetime. Until hosted solve passes, login unlocks nothing on the public URL, and the UI should say so.

### 6. Scope

| P0 | Acceptance test |
|---|---|
| Real data validated | 80 unique IDs, 6,800 kt, four airports by IATA, hashes; bad input rejected |
| MILP with D[a], collection switch | Zero-freight microcase gives $482.25M; D[a] delivered; excess demand infeasible with bound; zero demand under optional opens nothing |
| Validator | Recomputes nodes, capacities and costs without solver imports; corrupted result fails |
| Baseline | Same scenario hash and H; feasible; passes validator |
| Live re-solve and map | Changed input gives new run ID and flows; arcs match nonzero flows; displayed cost equals validator's; stopping the API flips the badge |
| Google login | Sign in and sign out work; unauthenticated solve returns 401; stored runs open signed out; secret key never in `web/` |

**P1:** disruption, labelled "site unavailable at design stage", not an outage; proof panel.

**P2 but required:** sensitivity sweep, stored and labelled.

**Off the critical path:** 3D maps, fleet dispatch, LLM layer, live external road routing.

### 7. Where we deliberately differ

| Source | Difference | Why |
|---|---|---|
| Damien | Collection all, yield 15%, not optional and 30% | PDF's 6,800 kt; review recommendation |
| JY | Split flows, road factor 1.9 | Gap 0; measured on 1,954 pairs |
| JY | `v2.py`, not SciPy code | JY's code is inaccessible |
| Comparison | Drops "no 80-site run", "reuse JY first" | Out of date |
| Comparison | Sweep kept | About 4 minutes of compute (estimate); the Judge needs it |
| Comparison | Auth is P0 | Confirmed team requirement |
| `CLAUDE.md` | Live solve P0; Supabase not the data path | Update the file if accepted |
| OR | No stranding penalty | D[a] with optional collection needs no invented price |
| Full-Stack | Editable when live; timeout above 30 s | Prototype portfolios took 24–54 s each |

---

## Part B: Evidence and decisions


**For team review only, not slides.** Prototype results: the shortlist was built at road factor 1.4, and runs use 1.9.

### 1. Headline

Combined defaults (15%, H=1) give **one large refinery at KAL_SUP_28, Kotawaringin Barat, with 32 depots: $1,393.5M.** At H=5, the best of three tested is **three small refineries: $2,554.3M.**

The baseline now obeys the same 214 km haul limit as the MILP (26 depots, longest haul 211.3 km), and these figures come from that rerun. An earlier version broke the limit and overstated the saving at $102.1M.

| Comparison ($M) | Baseline | MILP | Saving |
|---|---|---|---|
| **H=1** | 1,457.5 | A 1,393.5 | **64.0 (4.39%)** |
| H=5, same mix (1 large) | 3,768.3 | D1 3,482.5 | 285.8 (7.58%) |
| H=5, three small | 3,768.3 | D3 2,554.3 | 1,214.0 (32.22%) |

The baseline is single-assignment; the MILP is split-flow. The baseline was not re-solved at H=5, so D3 rows are upper-end, fixed-baseline comparisons, not like-for-like savings. L+L, L+S+S and S+S+S+S were not run. Estimated fixed-network crossovers: L to L+S 2.08 years, L to S+S+S 2.10 years.

### 2. Results

| Run | Case | Refineries (KAL_SUP) | Districts | CapEx | Logistics/yr | Total | Used / unused kt | Status |
|---|---|---|---|---|---|---|---|---|
| A | 15%, H=1 | L 28 | Kotawaringin Barat | 870.8 | 522.7 | 1,393.5 | 6,800 / 0 | Optimal among 29 candidates |
| F | 15%, H=1, L+S | L 15, S 54 | Ketapang, Kutai Kartanegara | 1,350.8 | 291.3 | 1,642.1 | 6,800 / 0 | Optimal among 29 candidates |
| B | 16%, H=1 | L 15, S 54 | Ketapang, Kutai Kartanegara | 1,350.8 | 295.0 | 1,645.7 | 6,800 / 0 | Optimal among 29 candidates |
| C | 16%, optional, 1,087 kt | L 28 | Kotawaringin Barat | 870.8 | 526.6 | 1,397.4 | 6,793.75 / 6.25 | Best found, gap 0.14% |
| D1 | 15%, H=5 | L 28 | Kotawaringin Barat | 873.0 | 521.9 | 3,482.5 | 6,800 / 0 | Optimal among 29 candidates |
| D2 | 15%, H=5 | L 15, S 54 | Ketapang, Kutai Kartanegara | 1,353.0 | 290.8 | 2,807.1 | 6,800 / 0 | Optimal among 29 candidates |
| D3 | 15%, H=5 | S 16, 48, 54 | Ketapang, Kotawaringin Timur, Kutai Kartanegara | 1,545.8 | 201.7 | 2,554.3 | 6,800 / 0 | Optimal among 29 candidates |
| E | 15%, optional, 200 kt | S 06 | Ketapang | 500.2 | 25.0 | 525.2 | 1,333.33 / 5,466.67 | Optimal among 29 candidates |

$M. Each proof holds only for that run's fixed refinery mix. Run A is the proven best at 15%, H=1: F is $248.6M dearer, S and S+S cannot fit 1,020 kt, and other mixes exceed $1,393.5M in CapEx alone. Arithmetic checked: total = CapEx + H × logistics (B and D2 differ by $0.1M from rounding); yield × biomass = SAF, all runs.

### 3. What the combination changes

**Last 6.25 kt (B vs C):** forced collection costs **$248.3M** at H=1, about $39.7M per kt (up to $250.4M given C's gap). The extra CapEx repays in about 2.07 years on fixed networks. **Release valve:** C leaves all 6.25 kt at Bulungan (182.7 of 189 kt used), the risk the Geospatial proposal warned about.

**Demand vs production (E vs A):** not a saving. A asks where to process all biomass; E asks the cheapest way to serve a chosen demand. E moves to Ketapang, leaves 80.4% of biomass unused and takes none from Bulungan, at $2,626/t against $1,366/t (one-year cost). That answer follows D[a], which no source provides; 200 kt is illustrative.

### 4. Comparison PDF audit

Its subjective scores are not used.

| Claim | Page | Verdict |
|---|---|---|
| 6,793.75 kt avoids the $480M step | 8 | Valid, run C |
| Time-limit incumbent is not proof | 12 | Valid, run C |
| Re-solve at the same H before quoting | 10 | Valid; baseline not re-solved |
| Demand has no official source | 13 | Valid |
| Official data missing, no 80-site run | 2, 13 | Overtaken: 80 sites solved |
| Reuse six-site code first | 21 | Overtaken: reuse its ideas only |
| 1.4 road default | 6 | Overtaken: 1.9 |
| Supabase off the critical path | 16 | Overtaken: Auth now required |
| Authentication off the critical path | 16 | **Overridden by the team** |
| Six-hour plan | 19 | Overtaken: about 3.5 hours left |
| D[a] with collection switch | 6–7 | Adopted, as a scenario |
| Live solve, run ID, independent verifier | 16–17 | Adopted, unbuilt |
| Show status, bound and gap | 12, 17 | Adopted |
| Honest replay label | 5 | Adopted |

### 5. Decisions

| # | Decision | Status | Recommendation |
|---|---|---|---|
| 1 | Horizon | Changed | Show H=1 and H=5; crossover about 2.1 years |
| 2 | Yield | Resolved | 15%, with 16% stored |
| 3 | Road factor | Resolved | 1.9; sweep 1.4 and 2.3 |
| 4 | Site splitting | Resolved | Allow |
| 5 | Capacity meaning | Open | SAF output; ask a mentor |
| 6 | Sea sites | Resolved | Supply only; 29 candidates |
| 7 | "Live" wording | Changed | "Solved" for live runs, "stored" for stored |
| 8 | Failure case | Open | Tarakan, after a second source |
| 9 | User | Resolved | Supply planner, labelled ours |
| 10 | Next.js | Open | 16.4.3 |
| 11 | Pages | Open | One page |
| 12 | Explanation LLM | Resolved | Skip |
| 13 | Google login | Resolved (lead) | Google OAuth through Supabase Auth |
| 14 | Supabase | Changed | Auth required; open only for solution data: keep the committed JSON bundle |
| 15 | What needs login | Open | Public stored runs; login for live solves |
| 16 | Laptop live solve as P0 | Open | Yes, with stored fallback |
| 17 | Collection default | Open | Full; optional as a labelled switch |
| 18 | Demand source | Open | Production-derived, labelled; D[a] editable, labelled ours |
| 19 | Baseline repair | Resolved | Limit enforced and rerun: $64.0M saving at H=1 |

### 6. Merge risks, ranked

| # | Risk | Mitigation |
|---|---|---|
| 1 | About 3.5 hours left; freeze at 14:00 | Protect solver, verifier and fallback first |
| 2 | Saving is split-flow MILP against one-depot-per-site greedy | State the difference; rerun on the final shortlist |
| 3 | Live solve takes 4.5 to 80 s on stage; C hit the limit | Open on a stored run; show status and gap |
| 4 | FastAPI path untested | Repeat-run test; stored fallback |
| 5 | Login fails on stage or for judges | Viewing stays usable without login; test sign-in from a second account |
| 6 | Redirect URLs differ, localhost vs production | Same second-account test on each |
| 7 | Judge lacks a usable Google account or is blocked at consent | Viewing path needs no login |
| 8 | Auth setup uses the remaining 3.5 hours | Timebox; viewing path ships first |
| 9 | Level 4 on `file://` has no login | Stored runs only, labelled |
| 10 | Shortlist built at 1.4 | Rebuild at 1.9 and rerun before any slide |
| 11 | Tarakan ferry has one source | Second source, else switch failure case |
| 12 | Unrun mixes; D3 not proven best | Say "best of three tested" |
