# Evidence and decisions

**For team review only, not slides.** Prototype results: the shortlist was built at road factor 1.4, and runs use 1.9.

## 1. Headline

Combined defaults (15%, H=1) give **one large refinery at KAL_SUP_28, Kotawaringin Barat, with 32 depots: $1,393.5M.** At H=5, the best of three tested is **three small refineries: $2,554.3M.**

The baseline now obeys the same 214 km haul limit as the MILP (26 depots, longest haul 211.3 km), and these figures come from that rerun. An earlier version broke the limit and overstated the saving at $102.1M.

| Comparison ($M) | Baseline | MILP | Saving |
|---|---|---|---|
| **H=1** | 1,457.5 | A 1,393.5 | **64.0 (4.39%)** |
| H=5, same mix (1 large) | 3,768.3 | D1 3,482.5 | 285.8 (7.58%) |
| H=5, three small | 3,768.3 | D3 2,554.3 | 1,214.0 (32.22%) |

The baseline is single-assignment; the MILP is split-flow. The baseline was not re-solved at H=5, so D3 rows are upper-end, fixed-baseline comparisons, not like-for-like savings. L+L, L+S+S and S+S+S+S were not run. Estimated fixed-network crossovers: L to L+S 2.08 years, L to S+S+S 2.10 years.

## 2. Results

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

## 3. What the combination changes

**Last 6.25 kt (B vs C):** forced collection costs **$248.3M** at H=1, about $39.7M per kt (up to $250.4M given C's gap). The extra CapEx repays in about 2.07 years on fixed networks. **Release valve:** C leaves all 6.25 kt at Bulungan (182.7 of 189 kt used), the risk the Geospatial proposal warned about.

**Demand vs production (E vs A):** not a saving. A asks where to process all biomass; E asks the cheapest way to serve a chosen demand. E moves to Ketapang, leaves 80.4% of biomass unused and takes none from Bulungan, at $2,626/t against $1,366/t (one-year cost). That answer follows D[a], which no source provides; 200 kt is illustrative.

## 4. Comparison PDF audit

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

## 5. Decisions

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

## 6. Merge risks, ranked

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
