# Judge proposal: scoring pass 0 (plan only, no code)

Scored against the Airbus PDF rubric (pp. 7-8), not the brief's paraphrase. The subject is brief Sections 5-9 as amended by CLAUDE.md, read literally and assumed built exactly as written.

**Verdict: 49/100. Do not lock the plan unchanged.** The method is right. The objective is under-specified, the default baseline is infeasible, the pruning rule is not neutral, the failure case is false, and the disrupt demo is a lookup table that the pitch calls "live". Most of this is cheap to fix now. Projected: about 73/100 after the top three fixes, about 77 if the user and status quo fix also lands.

## 0. Findings from checks I ran (these drive the scores)

Run on `data/raw/` and the PDF table. These are quick checks by the judge, not the team's model. F5 and F6 come from `/private/tmp/claude-501/-Users-jingyuan-Desktop-Larpers/58e8ad1b-1d53-476e-9bdc-33216b32c8f4/scratchpad/judge_check.py` (arguments: prune km, leg-1 rate, leg-2 rate). The rest came from one-off inline runs, so OR should reproduce them before any of these numbers reach a slide.

| # | Finding | Evidence | Why it matters |
|---|---|---|---|
| F1 | **Circuity 1.4 is contradicted by every arc I sampled.** | OSRM on 7 arcs: 1.81, 1.92, 2.01, 2.02, 2.03, 2.39, 2.41 (median 2.02). 5 of 7 exceed 2.0, the top of the brief's sensitivity range. Small, non-random sample, and OSM coverage in Kalimantan may inflate long routes. | At the median, road km are about 44% above the model's. All logistics dollars are understated, and the default sits outside the measured range. |
| F2 | **The road route to TRK includes a 63 km ferry.** Juwata Airport is on Tarakan Island. | OSRM from KAL_SUP_70, 18 and 27 to TRK: 63 km in `ferry` mode on all three. Local reporting describes access by sea or air. | The model prices a truck leg with no road. Visible on the map. This is the replacement failure case. |
| F3 | **CapEx (one-off) plus logistics (per year) has no horizon.** The PDF gives none. | Rough estimate at circuity 1.4, all tonnage at the $0.12 rate: one refinery $332M/yr, two refineries $183M/yr. A second refinery adds $480M, so it pays back in about 3.2 years (about 3.9 at $0.10). Not a MILP result. It ignores leg 3 and assumes a yield of 0.15, where both layouts fit capacity. | A 1-year objective would likely pick one refinery; about 4 years or more would likely pick two. The headline network is decided by a number nobody has chosen. An OR judge asks this first. |
| F4 | **The brief's arc pruning makes one refinery impossible at circuity 1.4.** | The most central candidate (KAL_SUP_21) is still 964 road km from its farthest site. Prune limit is 300 + 600 = 900 km. Road km obey the triangle inequality, so no depot routing fixes it. At 1.0 the figure is 688 km; at 2.0 it is 1,377 km. No candidate is within 600 km of all sites at any circuity tested. | If the thresholds apply to road km, the model silently forces two or more refineries, and the circuity sweep changes the feasible set. Robustness colours would partly show pruning artefacts. |
| F5 | **The 300 km leg-1 prune changes the optimum.** The brief expects the opposite. | MILP, refinery fixed at KAL_SUP_27, circuity 1.4, split flows, gap at most 0.5%. Leg 1 + leg 2 + depot CapEx: unpruned $431.2M, 300 km $440.5M (+2.2%), 100 km $448.8M (+4.1%). | It is a modelling assumption ("maximum farm-truck haul"), not a speed trick. Declare it as one. |
| F6 | **The cost table rewards long hauls on the smallest trucks.** Leg 1 is $0.10, leg 2 is $0.12, and depots have no scale economy. | Same MILP, unpruned: mean leg 1 is 116 km. With the two rates swapped it is 36 km. | Depots drift toward the refinery, which defeats the point of a depot. A domain judge will spot it on the map. Have the answer ready. |
| F7 | **The baseline is infeasible at the default yield, and is not at a candidate site.** | 6,800 × 0.16 = 1,088 > 1,087. The centroid is 83 km from the nearest site, KAL_SUP_45, breaking the brief's own candidate rule. | The headline number has no valid comparator yet. |
| F8 | **Yield is a step function: $480M for 1 kt.** Break-even is 1087/6800 = 0.15985. | Above it, collecting everything requires a second refinery. At 16%, stranding only KAL_SUP_40 (22.84 kt) restores one large refinery: 6,777.16 × 0.16 = 1,084 kt. | This is the real stranded-biomass trade-off, not North Kalimantan. The PDF never says all 6,800 kt must be collected. |
| F9 | **The DECISIONS.md "resolution" does not exist.** | CLAUDE.md points to it for the 1,088 v 1,087 issue. DECISIONS.md has four rows and none of them cover it. | The default yield is unresolved. It must be decided before lock. |
| F10 | **Plan contradiction on run count.** | Section 7 lets the grid shrink to 2×2 (4 runs). Section 9 requires at least 9 runs. | Decide now. I recommend keeping at least 9. |

## 1. Scores

Scale from the PDF: 1 weak, 2 limited, 3 credible, 4 strong, 5 exceptional evidence. Weighted total = sum of (score / 5 × weight).

| Criterion | Weight | Score | Points | The sentence a judge would write |
|---|---:|---:|---:|---|
| Problem realism | 20 | 3 | 12.0 | Named role and a tight decision, but the status quo is asserted without evidence, no cost of today's process is given, and 1,088 kt to four regional airports is not a real demand. |
| Technical soundness | 25 | 2 | 10.0 | Right method and a clean solver/UI split, but the objective mixes one-off and annual dollars, the pruning is not neutral, and the demo cannot take input outside a pre-run list. |
| Honest evaluation | 20 | 2 | 8.0 | A baseline and a sweep are planned, but the baseline is infeasible by default, the failure case is factually wrong, and no test set or metric is stated. |
| Trust and traceability | 20 | 3 | 12.0 | The design stores km and cost on every flow and shows uncertainty on the map, but the central distance assumption fails a basic check and the system has no refusal state. |
| Impact | 10 | 2 | 4.0 | The saving is against a comparator the team invented and that cannot run as specified, with no adoption constraints and no estimate-versus-measured label. |
| Time discipline | 5 | 3 | 3.0 | 170 seconds fits with rehearsal scheduled, but 15:30 is only 30 minutes before the deadline and the 40-second demo beats are untimed. |
| **Weighted total** | **100** | | **49.0** | |

Check: 12 + 10 + 8 + 12 + 4 + 3 = 49.

**Where it loses the most:** Technical soundness (15 points left on the table) and Honest evaluation (12). Technical drops to 2, not 3, because one Strong line fails and one Weak line is at risk (Section 6).

## 2. Top three fixes, ranked by score gain per minute

Gains are my judgement, not a calculation. Minutes assume `resolve()` already exists, as the plan requires.

### Fix 1: Correct the model specification before lock (about 15 min, about +7 points, 0.47 per min)

Orchestrator and OR. Technical 2→3, Impact 2→3. It only earns the points if all four land:

- **Horizon.** Add an explicit logistics multiplier, as a logged [ASSUMPTION]. Suggested default: annualise CapEx at 10% over 20 years (factor 0.1175, equivalent to 8.5 years of logistics). Show that the refinery count changes with it.
- **Baseline.** Make it feasible: snap the refinery to KAL_SUP_45 and give it enough capacity at the locked yield. Run it with the same distances as the MILP.
- **Pruning.** Replace the 300/600 km speed-up with one declared constraint on farm-truck haul, and apply no leg-2 cut that removes a feasible layout. Report the cost of that constraint (F5).
- **Yield.** Log the decision that CLAUDE.md says exists (F9).

### Fix 2: Ship a measured, visible failure (about 20 min, about +8 points, 0.40 per min)

Data, Frontend, Pitch. Honest evaluation 2→4.

- Sample about 30 arcs on OSRM, stratified across legs and provinces. Publish the circuity median and range in the repo, then re-centre the default and the sweep on the measured result.
- Mark every TRK arc on the map: "63 km ferry, no road, cost understated".
- Rewrite pitch step 6 (Section 5).

This gives what the rubric asks for: test data, a metric, a visible failure, a reason, and a way for the user to know.

### Fix 3: Make off-script input a commitment, with a test table (about 30 min, about +9 points, 0.30 per min)

OR and Member 2. Technical 3→4, Trust 3→4.

- Add a CLI entry to `resolve()` (Section 6), and label stored scenarios as precomputed.
- Run 20 random scenarios and publish: solved count, worst solve time, worst gap.
- Include at least one infeasible input and show a plain refusal, for example: "Infeasible: 1,292 kt SAF exceeds the one refinery you allowed."

**Next in line, if time remains:**

- Rename the user and fix the status quo (Section 5, about 10 min, Problem realism 3→4, uncertain).
- Add an arc-click trace showing `kt × rate × km = $` (about 20 min). This secures the Trust 4 from Fix 3.

## 3. Remaining profile questions

**Pitch opening line (10 words):**

> One kilotonne of Kalimantan SAF can cost a $480M refinery.

Count: One (1) kilotonne (2) of (3) Kalimantan (4) SAF (5) can (6) cost (7) a (8) $480M (9) refinery (10).

Any judge can check it against the PDF table with a calculator. It leads straight into the planner's decision and the honest section. If asked, the condition is: at 16% yield with every site collected, 1,088 kt exceeds the 1,087 kt capacity, and the cheapest extra capacity costs $480M.

**The one feature whose absence would cost the most points: a re-solve on an input the judge chooses.**

Without it, Technical soundness cannot pass 3 and may stay at 2. That is the highest-weighted criterion, and the rubric names "hard-coded demo" as Weak. Worst-case swing is 10 points (4 down to 2). It is also the item the plan drops first, because live solving is a stretch goal.

## 4. Brief Section 10 recommendations

### Q5, robust threshold: use run counts, with "every run" as the only green

- **Do not use 80%.** With 9 runs the options are 7/9 (78%) or 8/9 (89%), so it is false precision. The runs are a grid, not a probability sample, so a percentage implies something untrue.
- **Do not use a continuous scale.** It reads badly on a projector and invites "what does 0.7 mean?".
- **Use three bands, labelled with the count:** green "opened in 12 of 12", amber "opened in some", grey "never opened".
- **Score at cluster level, for example within 50 km.** Neighbouring candidates are near-substitutes, so exact-site frequency will make solid regions look unstable.
- **Straddle the break-even.** Use yields of about 0.13, 0.155, 0.165 and 0.19 against three circuity values re-centred on the measured range, giving 12 runs. A grid of only 0.13, 0.16 and 0.19 hides where the flip happens.
- **Change the wording.** Replace "Commit to green" with "Green survived every case we tested; amber needs checking first". The rubric's Weak line includes a claim to replace expert judgement.

### Q6, LLM explanation layer: skip it

| Option | Likely gain | Minutes | Points per min |
|---|---|---:|---:|
| Top three fixes above | 7-9 points each | 15-30 | 0.30-0.47 |
| LLM explanation | about 0.5 of a score on Technical, about 2.5 points | about 30 | about 0.08 |

- The rubric penalises LLM misuse. It does not require LLM use, and it says to "reward sound restraint".
- A live call adds a demo failure mode and a key to manage, and it can produce numbers that do not trace. That hurts Trust, which is worth twice Impact.
- Say this in Q&A: "A solver makes every decision. There is no LLM in the decision path."
- **One exception:** if every top fix is done and checkpoint 2 is green, a precomputed, labelled paragraph per scenario is acceptable. Every number in it must be machine-checked against the solution JSON. Never call it live on stage.

## 5. Claims we could not back in front of a judge

Status key: **False**, **Contradicted**, **Unverified**, **Partly true**, **Supported**. Searches were quick, so "Supported" means good enough to cite after opening the source.

### Pitch skeleton (brief Section 8)

| Step | Claim | Status | Do this instead |
|---|---|---|---|
| 1 | "Airbus SAF supply planner" | Unverified, and inconsistent with brief Section 1 ("fuel offtaker"). Airbus does not obviously fund or own refineries. | Name a supply planner working on the Pertamina feasibility study, and state whose budget it is. The Domain expert decides. |
| 1 | "a $765M refinery" | Contradicted at 16% yield and at multi-year horizons (F3, F8). The model may open two. | Quote the number the solver returns. |
| 1 | "before Boeing's team does" | Partly true. The July 2026 MoU exists, but it is exploratory and I found no Kalimantan link. The race is our framing. | Cut it. It earns nothing, and Airbus-adjacent judges will test it. |
| 1 | "Today that is a spreadsheet" | Unverified. No source. | State it as an assumption, or ask a mentor today. Add a cost of today's process. |
| 2 | "routes 6,800 kt ... to four airports" | False as worded. About 1,088 kt of SAF reaches airports; the rest is conversion loss. | "6,800 kt of residue into about 1 Mt of SAF." |
| 2 | "minimum CapEx plus trucking cost" | Partly true. The PDF objective includes OpEx, which is omitted. | Say so first. If OpEx is per tonne and uniform, throughput is fixed, so it is a constant and does not move the network. Fixed or size-dependent OpEx could. |
| 2 | "Every number traces to Airbus's cost table" | False as worded. Yield, circuity, demand split, horizon and haul limit are ours. | "Every cost traces to Airbus's table; our five assumptions are listed." |
| 3 | "Optimal" | Only if the gap is 0. HiGHS's default relative gap is, from memory, 0.01%, which is real money on this objective (OR to confirm). | Set the gap and report it, or say "within X%". |
| 3 | "$X vs $Y", "sensible-planner baseline" | Contradicted. Infeasible as specified (F7), and "sensible planner" is our invention. | Label it a modelled estimate against a stated heuristic. |
| 4 | "Live: disrupt" | False under the default bridge. The brief says "Looks live, is not." | Label it "precomputed". Add a real off-script solve. If `resource/` is committed, judges can read that line. |
| 4 | "the question a planner gets asked in every review" | Unverified. | Cut it. |
| 5 | "Slide yield from 13% to 19%" | Contradicted by the plan. A 3×3 grid gives three stops. | Use discrete stops and say so. |
| 5 | "Green sites open in every run" | True only for those runs. | Show the count: "12 of 12". |
| 5 | "Commit to green" | Overclaim on a nine-figure decision. | See Q5 wording. |
| 6 | "760 km from everything" | **False.** KAL_SUP_18 and 70 are 681 and 706 km from the centroid, 88 and 57 km from TRK. | Replace, see below. |
| 6 | "the model wants to strand it" | **False** under a hard collection constraint, and no solve shows it. The real stranding trade-off is F8. | Replace, see below. |
| 6 | "No OpEx, no seasonality, no road network" | Supported, but incomplete: also no horizon in the PDF, no water transport. | Keep and extend. |
| 7 | "early submission" | 15:30 is only 30 minutes early. | Say the time only if it is impressive. |

### Evidence pack and data

| Claim | Status | Note |
|---|---|---|
| Circuity 1.4, range 1.2-2.0 | **Contradicted** | F1. The literature range is also unchecked. Replace with a measured sample. |
| "Almost certainly how the challenge designer built the table" | Unverified, and the arithmetic does not close | 1,088 > 1,087. Say "close to", as supporting evidence only. |
| "A single large refinery ... will almost certainly win" | Contradicted | F3, F8. |
| Yield sources (RSC 2024, CET vol 125) and range 0.13-0.19 | Unverified | Domain expert must open them. |
| Airport pax and resulting split | Unverified | Wikipedia, and BPN's figure has two values. Transposition fixed in CLAUDE.md. |
| 1,088 kt as an "export scenario" | Not credible as framed | My rough estimate: the four airports' total jet uplift is about 0.1-0.2 Mt/yr, so 5-10 times too much. That is an unsourced estimate, so Domain should check it. The network also has no port, so nothing is exported. |
| 1% SAF mandate from 2027 at CGK and DPS | Supported | Scope is reported consistently. Later ramp-up figures conflict, so do not quote them. |
| "~60,000 kL nationally" | Unverified | Not found in my search. |
| Airbus-Pertamina MoU, Bali, Sept 2024 | Supported | Signed 18 Sept 2024. **Risk:** reporting says follow-up work moved toward used cooking oil, which undercuts a residue story. One report says the study covers feedstock, logistics and commercial viability, which would be our best user hook. Check it first. |
| Airbus-IPB, "up to 100 Mt/yr" | Unverified | Not found in one search, and a very large number. Cut unless sourced. |
| "SAF mainly from biomass by 2030" | Unverified | Not checked. Cut unless sourced. |
| Boeing-Pertamina MoU "same scope" | Partly true | Signed about 8-9 July 2026, covering feedstock, technology and policy. No binding targets reported. |
| "Only published ... work is a K-means paper" | Unverified universal | Use "the closest we found". |
| "Every SEA SAF plant is HEFA", "Nobody is doing lignocellulosic" | Unverified universals | Cut, or use "we could not find". |
| Plant capacities (Neste, Pengerang, FatHopes) | Unverified | Not needed for points. Cut. |
| PLN pelletising in Sambas, IJAS 14(1) | Unverified | Domain to check, or cut. |
| Novelty claim | Unverified, no logged search | Worth no rubric points. Cut from the pitch. |
| Ng and Maravelias (2017), and its single-assignment simplification | Unverified by me | Open the paper before attributing the simplification to it. |
| Site tonnages | Hidden data limit | The rubric asks to label synthetic data. 50 of 80 sites sit at 90 kt or above. We do not know the file's provenance, so say "challenge-supplied, unvalidated, treated as synthetic". |
| Candidate sites as a "constraint" | Self-imposed | The PDF asks for "optimal coordinates" and supplies no candidate list. State this as our simplification. |

### Replacement failure case for step 6

**Primary: the road distance is wrong, and the airport at Tarakan has no road.**

- **Where it fails:** Juwata Airport is on an island, and the model charges a truck rate across water.
- **Wider failure:** on 7 sampled arcs the real road factor was 1.81-2.41, against the model's 1.4, so logistics cost is understated.
- **How a judge verifies it:** zoom the basemap on Tarakan, or open any routing site for KAL_SUP_70 to TRK. OSRM returns 115 km including 63 km of ferry, against the model's 80 km (57 km × 1.4).
- **How the user knows:** the TRK arc shows a red "ferry, cost understated" flag, and the UI shows the measured circuity range beside the total.
- **What would fix it:** a barge rate from Pertamina, a port node, and a real road and river distance matrix.

**Proposed step 6 script (about 20 s):**

> "Here's where we're wrong. Juwata Airport is on an island. We price a truck where the real route has 63 kilometres of ferry. We checked road routes: real distances ran 1.8 to 2.4 times straight-line, not our original 1.4. So that arc is flagged red on the map. To fix it we need Pertamina's barge rates. We also have no OpEx and no seasonality."

Adjust the numbers once the 30-arc sample is done, and only say "original 1.4" if the default has moved.

**Backup for Q&A: the yield flip (F8).** It is checkable on a phone from the PDF table, and it already belongs in step 5.

**Correct wording on North Kalimantan, if asked:** the two sites are close to TRK but 304 km or more from any other supply site, so they are expensive to bring to a central refinery. Stranding them is a choice with a price, and the tool can show it.

## 6. The rubric read literally

### Does a precomputed disrupt risk being judged a "polished interface over a hard-coded scenario"?

**Yes, as written.** The rubric's Technical Weak line says "a hard-coded demo", and the other page says "a polished interface over a hard-coded scenario". The results would be real solver outputs, so it is not strictly hard-coded. But a judge cannot tell that from the stage, and the plan says "Looks live, is not" while the pitch says "Live". That mismatch is the bigger problem: it costs Trust as well as Technical.

**Minimum change, about 5 minutes on top of existing work:**

- Change the pitch word from "Live" to "Solved".
- Show provenance on each result: solver, gap, solve time and timestamp, for example "Precomputed by HiGHS, gap 0.00%, 7.4 s".
- Precompute every open facility's removal, not only the top 10 depots, so any facility on the map can be clicked. Compute time only.

### Does the plan satisfy "handles input beyond the demo script"?

**No.** The rubric also says "Test beyond a scripted demo". The plan offers a fixed list of about 20 runs, and the only off-list path is a stretch goal that can be dropped.

**Minimum change, about 15 minutes once `resolve()` exists:**

- Add a CLI as a committed deliverable, not a stretch goal, for example:

  ```bash
  python -m solver.model --exclude KAL_SUP_33 --yield 0.14 --capex-mult 1.2 --json
  ```

- In Q&A, ask the judge to name a site, then run it on the laptop. No hosting risk. Keep the ten-success gate for the public URL.
- Commit a test of 20 random scenarios plus one infeasible case. Publish the results in the README and on a slide.

If a Python service works locally by 14:00, wire it to a "custom scenario" control on the presenter's laptop. Do not chase hosted solving.

## Sources

- Boeing MoU: [New Straits Times](https://www.nst.com.my/amp/business/corporate/2026/07/1484051/indonesias-pertamina-boeing-sign-mou-sustainable-aviation-fuel), [Jakarta Post](https://www.thejakartapost.com/adv/2026/07/13/pertamina-boeing-explore-opportunities-to-develop-indonesias-saf-ecosystem)
- Airbus MoU: [Pertamina release](https://pertamina.com/en/news-room/news-release/Pertamina-and-Airbus-Explore-Collaboration-on-Sustainable-Aviation-Fuel-Development-in-Indonesia), [Detik, used cooking oil](https://finance.detik.com/energi/d-7964459/airbus-lirik-minyak-jelantah-ri-buat-pengganti-avtur/amp)
- Mandate: [Petromindo](https://www.petromindo.com/news/article/indonesia-to-launch-1-saf-blend-on-international-flights-in-2027), [Argus](https://argusmedia.com/en/news-and-insights/latest-market-news/2609725-indonesia-to-require-saf-for-flights-from-2027), [CAPA](https://centreforaviation.com/news/pertamina-and-boeing-to-develop-saf-in-indonesia-1365651)
- Tarakan access: [Tarakan city government](https://berita.tarakankota.go.id/2010/04/after-prolonged-operation-of-ferry.html) (2010), [Republika, fares](https://news.republika.co.id/berita/rhpzdn382/tarif-perahu-cepat-melonjak-imbas-kenaikan-harga-bbm)
- Road routes: public OSRM demo server, `router.project-osrm.org`, queried 31 Oct 2026
