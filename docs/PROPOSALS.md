# Larpers: Challenge 3 proposals for team review

**Status: for team review. Nothing is built, and no build plan exists yet.** Part 1 is the summary and the decisions we need from you. Part 2 is the five expert proposals, unedited. Recommendations in Part 1 come from the orchestrator and are not final until the team agrees.

## Part 1: Summary

### The proposal in short

We build a solver that decides where to open depots and refineries in Kalimantan, how to route 6,800 kt of biomass through them, and how to deliver SAF to four airports at the lowest cost. A map shows the network, the saving against a simple baseline, what happens when a facility is removed, and which choices depend on unverified assumptions. A solver makes every decision. No LLM is involved.

The method is sound, but the brief cannot be followed as written. The Judge scores it **49/100** today and projects about 73 after three fixes; both figures are the Judge's estimates. Several experts found errors in the brief independently, so the plan needs the changes below.

### What the first solver runs show

These results come from a real prototype on the real data. **They are provisional and must not go on a slide.** They use road factor 1.4, an older airport split, and sites that may be dropped. All need rerunning.

| Case | Refineries | Total cost | Status |
|---|---|---|---|
| Yield 15.98%, 1 year of logistics | 1 large (Kotawaringin Barat) | $1,257.8M | Gap 0.01%, stopped at time limit |
| Yield 16%, 1 year of logistics | 1 large + 1 small (Ketapang, Kutai Kartanegara) | $1,562.8M | Gap 0, optimal among 27 refinery candidates |
| Greedy baseline at yield 16% | 1 large + 1 small | $1,685.7M Saving of $122.9M (7.3%) from the row above, or $109.3M like for like with one depot per site. A long arc still to cap will shrink it |

Three findings shape everything else:

- **Time horizon matters most.** CapEx is one-off, logistics recurs, and the PDF gives no horizon. A second refinery repays itself in about 2.75 years. At 5 years, the solver picked three small refineries.
- **1 kt flips the answer.** Above 15.985% yield, one large refinery no longer fits. That adds $480M of CapEx, or about $305M net of the logistics it saves in one year.
- **No refinery site survives across that step.** The brief's "green sites open in every run" is false for refineries. In every multi-refinery run under 1% gap, one refinery sat in Kutai Kartanegara and one in Ketapang, so the district is steadier than the exact site.

"Optimal" only holds among the 27 shortlisted refinery candidates. Across all 80, the best bound is $1,447M, 7.4% below our result. No run found a better plan, but none proved there isn't one.

### Decisions for the team

| # | Decision | Expert positions | Recommendation | Why it matters |
|---|---|---|---|---|
| 1 | **Logistics horizon** | OR and Domain: 1 year as base, plus a sensitivity. Judge: annualise CapEx (10%, 20 years), about 8.5 years of logistics | 1 year as the literal PDF reading, with 5 and 10 years shown beside it and named as the top assumption | Sets the refinery count more than any other input |
| 2 | **Default yield** | Domain: 15%, one large refinery, sourced and off the cliff. OR: 16%, large + small, no change from the brief | 15%, with 16% stored to show the cliff | The 16% evidence in the brief failed fact-checking. It decides the headline network |
| 3 | **Road factor** | Geospatial: 1.9, measured on 1,954 pairs. Judge: 1.4 contradicted. Domain: keep 1.4 as a slider | 1.9, sweeping 1.4, 1.9 and 2.3 | 1.4 understates logistics by about 26%. OSM misses plantation tracks, so 1.9 may run high on short legs |
| 4 | **Can a site split between depots?** | OR: allow it. It reaches gap 0, and one-depot-per-site costs at most 0.87% more. The brief says no | Allow it, and report the 0.87%. Do not credit Ng and Maravelias for either rule | Decides whether we can say "optimal" |
| 5 | **Refinery capacity meaning** | OR and Domain: SAF output, from the PDF heading. Domain: real-world costs favour biomass input, about $5.07B | SAF output, plus one named input scenario. Ask an Airbus mentor today, and ask whether 6,800 kt is per year | A sevenfold change in refinery count |
| 6 | **Sites in the sea** | Geospatial: 11 Ketapang sites plot offshore, so use them as supply only | Accept, leaving 69 candidates. Rerun OR's candidate list on that basis | Otherwise the map can show a refinery in the sea |
| 7 | **"Live" demo** | Judge: precomputed disrupt called "Live" risks "hard-coded". Full-Stack: rejects "Looks live, is not" | Say "solved", label it as stored, and commit to a command-line re-solve on a judge's input, tested on 20 random cases plus one infeasible one | Technical soundness carries the most weight |
| 8 | **Failure case for the pitch** | Judge: Tarakan ferry and road factor. Geospatial: Bulungan's scale mismatch. Domain: no export route | Lead with Tarakan, once the ferry is confirmed by a second source. Keep the others for Q&A | The brief's version is false |
| 9 | **Who the user is** | Judge and Domain: keep a supply planner, drop the race with Boeing, which no source supports | Accept. Say whose budget it is, and label the persona as ours | Problem realism is 20% |
| 10 | **Next.js version** | Full-Stack: 16.4.3, because `npm audit` rates 14.2.35 critical. Rollback takes a minute | Accept 16.4.3 | Small change from the brief, tested in a spike |
| 11 | **One page or several** | Full-Stack: one route, because the double-click fallback needs it. Lead: multi-page is allowed if needed | Keep one page for the demo, and add pages only for something that needs them. Test the fallback if we do | Links between pages are untested on `file://` |
| 12 | **Explanation LLM** | Judge: skip, about 0.08 points per minute | Skip | Adds demo risk and costs time better spent on fixes |

### What the experts already agree on

- **Remove the 600 km depot→refinery limit.** It makes one-refinery plans infeasible.
- **Treat the 300 km farm-truck limit as a stated assumption.** Define it on straight-line distance (214 km) so the arc set stays fixed across road factors. It adds about 0.40%.
- **Redo the baseline.** As written it is infeasible and sits at a location that is not a candidate site.
- **Collect all biomass in the base case.** Stranding is one named scenario, not a sweep input, because a penalty would quietly set the refinery count.
- **North Kalimantan is served, not stranded.** It is 2.8% of biomass, and the $21M to $39M cost depends on whether there is an East refinery. Cost figures hold the rest of the network fixed.
- **Add the four airports as refinery candidates.** Forcing the small refinery to Balikpapan airport costs only $3.0M more. Whether that land is usable is unverified.
- **Label the demand.** Full production is a "gateway scenario": the four airports could not burn 1,020 kt, the mandate gives them zero demand, and most SAF would need a sea route we do not model.
- **Use the corrected airport split:** BPN 55.8, PNK 31.7, TRK 7.5, PKN 5.0. It barely changes the network.
- **Show robustness as run counts** in three bands at district level, in blue and orange, rather than percentages.
- **Label the biomass data as synthetic.** The tonnages look generated.
- **Report gap from HiGHS directly.** PuLP 2.9 reports "Optimal" even on a run stopped at a 34% gap.
- **Pin Python 3.12 or newer** with the versions in the Geospatial proposal. The brief's 3.11 fails on them.

### Claims to drop from the pitch

| Claim | Problem |
|---|---|
| "$765M refinery" | The solver may open two or three |
| "Before Boeing's team does" | No source shows a race |
| "16% is how the designer built the table" | Unprovable, and 1,088 misses 1,087. The table also fits six-tenths scaling without any yield |
| "Routes 6,800 kt to four airports" | About 1 Mt of SAF reaches airports |
| "Every number traces to Airbus's cost table" | Yield, road factor, split, horizon and haul limit are ours |
| "760 km from everything" and "the model wants to strand it" | Both false |
| "Commit to green" | False for refineries, and it overclaims |
| "Every SEA SAF plant is HEFA" | Ethanol-to-jet plants are planned in Singapore |
| ATJ yield of 0.19 t/t | The source says about 1.1%, on a different feedstock |
| "Only published work" and "not Kalimantan" | Harahap 2020 optimises palm biorefineries on Sumatra and Kalimantan |

### Still open

- **Yield grid:** the experts proposed three different grids. Recommended: 13, 15, 15.98, 16, 17 and 19%, plus a single wet-basis run at 6%. The 19% value is a stress case with no valid source.
- **Conflicting fact-check:** the Judge could not find the Airbus-IPB 100 Mt claim, while Domain found it in one secondary source. Open that source before citing it.
- **Unverified:** the Tarakan ferry rests on one OSM route plus local reporting; `DATABASE_URL` has not been tested; and nothing is proven across all refinery candidates.
- **Not run yet:** the circuity sweep, disruption scenarios, and any run with the sea sites excluded.
- **Estimates:** Judge scores, score gains, and jet-fuel use at the four airports are judgement, not measurement.

---

## Part 2: Full expert proposals

These are unedited. Where one conflicts with Part 1, Part 1 explains why.

The Full-Stack proposal describes `web/` as a single-page app. The lead has since allowed multi-page if necessary (decision 11).


---

## Operations Research proposal (Section 5.1)

All numbers use the real data: 80 sites, haversine × 1.4, legs 0.10 / 0.12 / 0.08, airport shares BPN 44.5, PNK 39.8, TRK 9.5, PKN 6.2, HiGHS via PuLP 2.9.0. **[M]** = measured here, **[E]** = estimated or computed from measured points. Every solve had a limit of 60 s or less. Many ran alongside 7 to 8 other solves on 15 cores, so timings are pessimistic. Prototype: `/private/tmp/claude-501/-Users-jingyuan-Desktop-Larpers/58e8ad1b-1d53-476e-9bdc-33216b32c8f4/scratchpad/or/m.py`.

### Headlines

1. **The brief's plan does not reach gap 0.** Full 80×80, single-assignment, 300/600 km: 34% gap at 60 s. [M]
2. **The formulation below does.** Gap 0 in about 30 s, with $1,562.8M for L + S at y = 0.16. [M] The claim must be scoped: "optimal among 27 refinery candidates".
3. **The 600 km prune is invalid.** It makes every one-refinery plan infeasible. [M]
4. **The yield step costs $305M, not $480M**, because a second refinery saves $175M a year in logistics. [M]
5. **Horizon matters more than yield.** The PDF objective adds one-off CapEx to annual logistics. At about 3 years of logistics the one-refinery plan loses at any yield, and at 5 years the solver picks three small refineries. [M/E]
6. **The brief's "green sites" story fails as written.** No refinery site is used on both sides of the yield step. [M]

### Q1. Formulation

**Sets:** S = 80 supply sites. D = S (depot candidates). R = refinery candidates. A = 4 airports. Sizes = {small, large}.

**Parameters:** P_i kt. d = haversine × circuity. y = yield. C_D = 150/300 kt, $2.25M/$4.5M. C_R = 500/1,087 kt, $480M/$765M. H = logistics years (default 1, literal PDF). s_a = airport share.

**Variables:**
- x_ij in [0,1]: share of site i sent to depot j
- f_jk ≥ 0: biomass, kt
- g_ka ≥ 0: SAF, kt
- e_k ≥ 0: surplus SAF at the refinery gate (only when demand < production)
- u_i: stranded share (only in the soft scenario)
- zD_j,s and zR_k,s binary

**Minimise**

Σ CapEx · z + H · 1000 · [ 0.10 Σ d_ij P_i x_ij + 0.12 Σ d_jk f_jk + 0.08 Σ d_ka g_ka ] + π · 1000 · Σ P_i u_i

**Subject to:**

| Constraint | Form |
|---|---|
| Collection | Σ_j x_ij + u_i = 1 (u_i = 0 in the hard case) |
| Depot balance | Σ_i P_i x_ij = Σ_k f_jk |
| Depot capacity (biomass in) | Σ_i P_i x_ij ≤ Σ_s C_D,s zD_j,s |
| **Yield balance** | y · Σ_j f_jk = Σ_a g_ka + e_k |
| **Refinery capacity (SAF out)** | Σ_a g_ka + e_k ≤ Σ_s C_R,s zR_k,s |
| Demand | Σ_k g_ka = s_a · D, where D = y Σ_i P_i (1 − u_i) in the full-production case |
| One size per site | Σ_s z ≤ 1 at each candidate |

**Tightening cuts. Without them the solver stalls.** [M]
- **x-link:** x_ij ≤ Σ_s zD_j,s
- **f-link:** f_jk ≤ 300 · Σ_s zR_k,s
- **Depot cover:** Σ_j (zS_j + 2 zL_j) ≥ ⌈ΣP / 150⌉ = 46
- **Portfolio:** Σ_k zL_k = nL and Σ_k zS_k = nS, solved once per feasible portfolio. This takes the gap on full 80×80 from 34% to 5.9% at 60 s, because it stops the LP buying fractional refineries.

**Capacity reading:** SAF output, as the PDF column says "Production Capacity". If it meant biomass input, the cheapest cover is 6 L + 1 S at $5.07B. [E]

### Q2. Split flow: disagree with Ng and Maravelias here. Allow it.

I could not check the paper; I am relying on the brief's description. Measured on the same 12 refinery candidates with L + S, y = 0.16:

| | Split | Single (full 300 km arcs) | Single (8 nearest depots) |
|---|---|---|---|
| Binaries | 184 | 2,056 | 799 |
| Result in time limit | **Gap 0, 28 s** | Gap 1.95%, 50 s | Gap 0.13%, 50 s |
| Best cost | **$1,562.8M** | $1,587.0M | $1,576.4M |
| Refineries | SUP_15 + SUP_54 | SUP_35 + SUP_54 | SUP_15 + SUP_54 |

- Split is a valid lower bound, so single-assignment costs at most $13.6M (0.87%) on this candidate set. [M]
- 23 of 80 sites split. [M] A site averaging 85 kt is 28% of a large depot, so the packing is genuinely hard.
- **Single-assignment buys realism worth under 1% and costs the right to say "optimal".** The rubric pays for gap 0. A "site" is also an aggregated production figure, so two collection zones is a fair reading (my judgement; no source).
- Keep single-assignment as a flag and ship the one comparison line: "forcing one depot per site costs at most +0.87%".

### Q3. Demand below production

- Surplus goes to explicit surplus SAF, e_k, at the refinery gate. It earns no revenue and has no transport cost. It appears on the map as a labelled refinery-gate export.
- With hard collection, the objective still pays for collecting, trucking and refining the surplus. No revenue offsets that. The scenario therefore shows the cost of overbuilding, and the UI should say so.
- If collection is soft and demand is small, the model collects only the cheapest biomass, which is the correct answer to a different question.
- The default stays full production: D = y · collected. Then e_k = 0.

### Q4. Size and the plan if slow

| Configuration | Vars | Binaries | Cons | Result |
|---|---|---|---|---|
| Brief: 80 refineries, single, 300/600, x-link | 6,472 | 2,192 | 2,436 | Gap 34.2%, 60 s |
| Same, no x-link | 6,472 | 2,192 | 564 | Gap 38.0%, 60 s |
| Split, 80 refineries, 300/600, x-link | 6,472 | 320 | 2,436 | Gap 33.5%, 60 s |
| Single, portfolio + cuts | 6,472 | 2,192 | 6,399 | Gap 5.9%, 60 s |
| Split, portfolio + cuts | 6,472 | 320 | 6,399 | Gap 5.6%, 60 s |
| Split, 12 candidates | 3,064 | 184 | 3,195 | **Gap 0, 28 s** |
| Split, 20 candidates (k-means) | 3,752 | 200 | 3,859 | Gap 0, 29 s, $1,564.3M |
| **Split, 27 candidates (union of the above)** | **4,354** | **214** | **4,440** | **Gap 0, 30.7 s, $1,562.8M** |

**Ship the 27-candidate row:** split, portfolio fixed, cuts on, with depot candidates kept at all 80. Each scenario costs about 30 s per portfolio.

- **Caveat:** on all 80 refinery candidates with no pruning, the best bound reached is $1,447M at 60 s, 7.4% below our $1,562.8M. No run found a better plan, but none proved there is none. The claim is therefore "optimal among 27 refinery candidates". The candidate list came partly from earlier incumbents, so disclose it.
- **If slow:** first, cut to 12 candidates. Second, accept gap ≤ 0.5% and label it "best found". Third, use k = 8 nearest depots.
- **Sweep estimate:** 6 yields × 3 circuities × up to 2 portfolios is about 36 solves. At 30 s, with 5 in parallel, that is about 4 minutes. [E]

**Arc pruning: the brief's thresholds are not lossless.**
- **Depot→refinery 600 km: remove it.** y = 0.15 with one large refinery is infeasible in 0.12 s. [M] That plan needs a 1,162 km arc, and L + S uses 619 km. [M] The arcs are continuous and cheap, so no prune is needed.
- **Supply→depot 300 km: keep it, and disclose it.** It costs +$6.3M (0.40%) with the same refineries, both at gap 0 ($1,562.8M vs $1,556.5M). [M] Unpruned, a site ships 617 km on the supply leg.
- **No cost-table argument justifies any threshold.** Leg 1 (0.10) is cheaper than leg 2 (0.12), so biomass prefers the small truck and depots drift toward the refinery. This is a modelling choice: nobody hauls raw biomass 600 km in 3 to 9 t trucks.
- Define the prune as haversine ≤ 214 km (300 / 1.4). Otherwise the circuity sweep changes the arc set: 1,872 arcs at 1.4, 1,284 at 2.0. [M]

**Baseline: the brief's version is infeasible.** One large refinery at the centroid violates capacity by 1 kt at y = 0.16.
- Use L at the site nearest the centroid (SUP_45) and S at the site nearest BPN (SUP_77). Greedy depots: 25, at $110.3M. Total **$1,685.7M**. [M]
- Saving against the split optimum is **$122.9M (7.3%)**, all from logistics and depots: $330.4M vs $212.1M logistics. [M]
- The baseline is single-assignment. Against our single-assignment plan ($1,576.4M) the saving is $109.3M, so quote that one if we want like for like.
- CapEx for refineries is equal, so do not claim a CapEx saving.
- The greedy has a 1,016 km leftover arc. Member 2 should cap it, which will reduce the saving a little.

### Q5. What I refuse to model

**Mandate-scaled demand.** The brief lists it as a sensitivity case, but says itself that none of the four airports is in the mandate. Taken literally, demand is zero. Scaled nationally, it is about 60,000 kL, which needs no large refinery and has nothing to do with 6,800 kt. Showing it as a slider would imply a meaning it does not have. Use a demand-fraction slider (50%, 75%, 100%) labelled as a planner assumption, if at all.

I also refuse to use 1,088 ≈ 1,087 as evidence for 16%. It misses by 1 kt, and the model treats that as $305M.

### The 1,088 vs 1,087 step

**Measured ladder, H = 1:**

| y | Portfolio | Refineries | CapEx $M | Logistics $M | Total $M | Gap |
|---|---|---|---|---|---|---|
| 0.13 | L | SUP_28 | 875.2 | 378.9 | 1,254.2 | 0.53% (single) |
| 0.1598 | L | SUP_28 | 870.7 | 387.0 | **1,257.8** | 0.01% (split, time limit) |
| 0.16 | L, strand SUP_38 | SUP_28 | 875.2 | 387.0 | 1,267.0 incl. $4.7M penalty | 0.35% (single) |
| 0.16 | L + S | SUP_15, SUP_54 | 1,350.8 | 212.1 | **1,562.8** | **0** (split) |
| 0.19 | L + S | SUP_15, SUP_54 | 1,359.8 | 223.7 | 1,583.4 | 0.91% (single) |

The step is **+$305M** at y = 0.15985. Within either side, cost moves under $10M (single-assignment basis). The large refinery also moves about 187 km, from Kotawaringin Barat to Ketapang. [M/E]

**Which portfolios are feasible, by yield:** S + S up to 0.14706. L up to 0.15985. S + S + S up to 0.22059. L + S up to 0.23338.

**Horizon crossovers, computed from measured split points [E]:**
- L vs L + S: 480 / 175 = **2.75 years**
- L + S vs S + S + S: 195 / 66 = about 3.0 years
- H = 5 with free portfolio picks **S + S + S** (SUP_16, SUP_41, SUP_44), $2,278M, gap 0.09%, on the 12 candidates. [M]

Those crossovers hold each network fixed, and re-optimising can only pull them earlier. At y = 0.13 the L vs L + S crossover is about 3.0 years, on a run at 4.8% gap. [E]

**Recommendation:**
1. **No fudge.** Keep capacity at exactly 1,087 kt, with no tolerance and no rounded yield.
2. **Solve every feasible portfolio and store them all.** The UI shows the ladder, so the step is a visible result instead of a hidden flip.
3. **Default: y = 0.16, hard collection, H = 1, L + S.** Its $1.245B refinery cover can be checked from the cost table, and it survives the horizon test better than L does. It is not the long-run answer either: from about 3 years, S + S + S beats it.
4. **Show "L only, strand SUP_38 (23.62 kt, 0.35%)" beside it.** On the literal one-year objective it costs about $309M less (single-assignment basis). That is the brief's "state why some is stranded and show the cost". In split mode u_i could strand exactly 6.25 kt. [E]
5. **Say in the pitch:** "One kilotonne of rounding flips the one-year answer by $305M, but three years of trucking pays for the extra refinery anyway."
6. **Sweep yields** {0.13, 0.145, 0.1598, 0.16, 0.175, 0.19} so the step is bracketed, and add H in {1, 5, 10}.

**Robustness story:**
- Site-level selection frequency across the yield sweep mixes two regimes. Depots shared across the step: **9 of about 27**. Within a regime (0.16 vs 0.19): **20 of about 27**. [M] These are single-assignment runs at nonzero gap, so treat them as indicative. Refineries shared across the step: **none**. [M]
- The brief's "green sites open in every run" is therefore false for refineries.
- Report in two tiers: regime first, then frequency within regime, at district level for refineries. In every multi-refinery run at gap under 1%, one refinery sits in **Kutai Kartanegara** (SUP_54 or SUP_44) and one in **Ketapang** (SUP_15, SUP_41 or SUP_48). [M]
- Candidate-level ties are real: SUP_48 instead of SUP_15 costs only $1.5M more. That is another reason to colour districts, not points.
- The commit-now message becomes: "East Kalimantan needs its own refinery in Kutai Kartanegara; the size of the western plant depends on yield and horizon." The one exception measured is yield under 0.15985 with a horizon under about 3 years, where a single central refinery wins.

### Section 10, question 1: airports as refinery candidates

**Include all four as refinery candidates only. Do not add them as depots.**
- Adding them changes nothing: same $1,562.8M and same refineries, gap 0, 19 s. [M] Leg 3 is only $38M of $1,563M.
- The value is the answer to the Q&A. Forcing the small refinery to Balikpapan airport costs **+$3.0M (0.19%)**, gap 0, 4 s. [M]
- The line for the planner: "Next to Pertamina is $3M worse, which is effectively free." Whether that land and adjacency is real is unverified.

### Section 10, question 2: hard collection or penalty

**Hard collection in the base case and all sweeps. Stranding is one named alternative scenario, with π = $200 per tonne of biomass.**

Penalty sweep, y = 0.16, one large refinery, 8 nearest depots: [M]

| π ($/t) | Stranded | Status |
|---|---|---|
| 50 | 3,045 kt (45%) | Gap 0 |
| 100 | 1,825 kt (27%), including both North Kalimantan sites | Gap 0 |
| 200 | 23.62 kt, SUP_38 only (0.35%) | Gap 0.35% (full 300 km arcs) |
| 1,000 | 23.62 kt, SUP_38 only | Gap 0.13% |

- **Why $200:** it is the lowest tested value that strands only what the capacity forces. The result is the same up to $1,000, and the band should run to about $13,000/t, where stranding stops beating L + S. [E] $200/t biomass equals $1,250/t SAF at y = 0.16.
- This is a derived threshold, not a market price. I tested only these four values.
- **Why not penalty in sweeps:** at y = 0.19, L only would strand about 1,079 kt for about $216M, which undercuts the $480M small refinery. [E] The penalty would silently decide the refinery count.
- Under single-assignment, stranding is whole-site. The prototype's u_i is continuous but x_ij is binary, so u_i is effectively binary.
- **North Kalimantan is not stranded** at π ≥ $200 or under hard collection. In the one-refinery plan it hauls 1,162 km. Pitch step 6, "the model wants to strand it", is false and must change. Under the 300 km prune those two sites can reach only a depot at SUP_18 or SUP_70.

### Reading the MIP gap under PuLP 2.9 with HiGHS

**`LpStatus[prob.status]` cannot be trusted.** PuLP 2.9 maps HiGHS `kTimeLimit` to `LpStatusOptimal`. Measured: PuLP said "Optimal" on a run with a 34% gap.

```python
solver = pulp.HiGHS(msg=False, timeLimit=30, gapRel=0.0)   # gapRel=None leaves HiGHS at 1e-4
prob.solve(solver)
h = prob.solverModel                       # exists only with pulp.HiGHS, not HiGHS_CMD
info = h.getInfo()
status = h.modelStatusToString(h.getModelStatus())   # "Optimal" or "Time limit reached"
gap, bound, primal = info.mip_gap, info.mip_dual_bound, info.objective_function_value
proven = (status == "Optimal") and (gap <= 1e-9)
```

- `prob.sol_status` also separates them: 1 for proven, 2 for time limit with an incumbent. [M]
- HiGHS's default `mip_rel_gap` is 1e-4 [M]. Without `gapRel=0.0`, a run at 0.01% returns "Optimal" with up to about $150k slack. [E]
- `mip_gap` is `inf` when there is no incumbent.
- UI labels: "Optimal among N candidates" only if `proven`. Otherwise "Best found, within X%". Store `mip_gap`, `model_status` and `n_candidates` per solution.

### Open calls for the orchestrator

1. **Blocking: confirm H = 1 as default, with H shown as a top assumption.** It changes refinery count more than any other parameter.
2. **Confirm the changes to the brief:** split flow, 600 km prune removed, baseline with L + S, and "optimal among 27 candidates".
3. **Pitch must change:** steps 1 ("$765M refinery"), 5 (green sites), 6 (North Kalimantan).
4. **Not done:** full circuity sweep, disruption runs, and proof against all 80 refinery candidates.

---

## Geospatial Data Engineer proposal (brief Section 5.2)

Measured on our 80 sites and 4 airports at 11:40. Scripts and outputs are in the scratchpad. OSRM here means the public demo server, on OSM roads. Cost figures for North Kalimantan hold the rest of the network fixed, so the solver's numbers replace them once it runs.

### Changes to the plan, in priority order

1. **Default circuity should be 1.9, not 1.4.** On our own coordinates, 1.4 is below the 10th percentile of real road ratios. Logistics at 1.4 reads about 26% low.
2. **The 600 km depot→refinery prune breaks single-refinery plans.** On model km, no refinery candidate is reachable from all 80 sites. See Q3.
3. **11 Ketapang sites are in the sea** (966 kt, 14% of biomass). They must not be depot or refinery candidates, or the map will show a refinery offshore.
4. **Tarakan is an island.** Every tonne to TRK ends on a ferry, which the cost table does not price.
5. **Open blocker:** `CLAUDE.md` points to `docs/DECISIONS.md` for the 1,088 vs 1,087 kt resolution, and that entry does not exist. It decides whether North Kalimantan is served. See Q3.

### Q1. Haversine × circuity or road distance?

**Use haversine × circuity in the solver. Commit one OSRM table as an independent check.**

- The solver uses `km = hav_km × circuity`. A judge can reproduce it with a calculator, it responds to a slider, and it needs no network.
- One OSRM table call returned all 84 × 84 road distances, with no null cells. Commit it as `data/reference/osrm_table_84.json`, credit "© OpenStreetMap contributors", and never call it at runtime.
- Every flow carries `road_km` from that table, so the trace drawer shows model km beside road km.
- Add one stored scenario, `road_matrix`, that solves on OSRM km instead. "Does the network change on real roads?" is a strong honest-evaluation result for one matrix swap.

**Measured circuity** (64 nodes that snap within 5 km of a road, 1,954 pairs of 25 km or more):

| Haversine band | Pairs | Median | p10 | p90 |
|---|---:|---:|---:|---:|
| 25–100 km | 231 | 1.74 | 1.44 | 2.47 |
| 100–300 km | 450 | 1.87 | 1.65 | 2.20 |
| 300–600 km | 678 | 1.88 | 1.69 | 2.15 |
| 600+ km | 595 | 2.08 | 1.83 | 2.56 |
| **All** | **1,954** | **1.91** | **1.66** | **2.36** |

- The median across all 3,486 pairs, unfiltered, is 1.88.
- **Recommendation:** base 1.9, sweep {1.4, 1.9, 2.3}. Keep 1.4 only as the literature case. The brief's range of 1.2–2.0 sits mostly below what we measured.
- **Limit:** OSM under-maps plantation and logging tracks, so the ratio is biased high, most of all on short supply→depot legs. Treat 1.9 as fair for trunk legs and conservative for the first mile. The Domain expert should confirm this.

**With a day:** self-host OSRM on a Geofabrik extract with a truck profile, add plantation tracks, price river and coastal barge legs separately, and draw real route geometry.

**`distances.npz`** holds `node_ids` (84, fixed order: 80 sites then PNK, PKN, BPN, TRK), `hav_km` and `road_km`.

- Circuity is never baked in. Applied at load, it lets the slider work without a rebuild.
- Airports are in the matrix, so open question 10.1 needs no rebuild either way.
- Earth radius is 6371.0088 km. Round `hav_km` to 0.01 km and airport coordinates to 4 dp in `prepare.py`, so the solver and the browser's recomputation agree.

### Q2. Solution serialisation contract

This is a superset of the brief's fields, flat, with no join needed. It incorporates the full-stack proposal's requests (`slug`, `family`, `status`, `solved_at`, `stranded`, facility coordinates).

Coordinates use named `lat` and `lon`, never arrays, to avoid the GeoJSON `[lon, lat]` vs Leaflet `[lat, lon]` swap. Node ids are `KAL_SUP_nn`, an IATA code, or `CENTROID` for the baseline refinery, which is not a candidate site.

**`facilities[]`**
```json
{
    "site_id": "KAL_SUP_10",
    "label": "KAL_SUP_10, Kutai Kartanegara",
    "type": "refinery",
    "size": "small",
    "lat": -0.6682,
    "lon": 116.8524,
    "capacity_kt": 500,
    "capacity_basis": "saf_out",
    "throughput_kt": 277.1,
    "utilisation": 0.554,
    "capex_usd": 480000000
}
```
`capacity_basis` is `biomass_in` for depots and `saf_out` for refineries. Values are illustrative.

**`flows[]`**
```json
{
    "leg": "depot_refinery",
    "commodity": "biomass",
    "from": "KAL_SUP_18",
    "to": "KAL_SUP_10",
    "from_lat": 2.61,
    "from_lon": 117.2423,
    "to_lat": -0.6682,
    "to_lon": 116.8524,
    "from_label": "KAL_SUP_18, Bulungan",
    "to_label": "KAL_SUP_10, Kutai Kartanegara",
    "kt": 188.97,
    "hav_km": 367.09,
    "circuity": 1.9,
    "km": 697.471,
    "rate_usd_per_t_km": 0.12,
    "cost_usd": 15816131.38,
    "truck_t": 30,
    "trips": 6299,
    "road_km": 710.6
}
```
- `leg` is `supply_depot`, `depot_refinery` or `refinery_airport`. `commodity` is `biomass` or `saf`.
- `truck_t` is the PDF large truck for the leg: 9, 30 or 32 t.
- Keep 0 km co-located flows so mass adds up. The map skips drawing them.
- Each row above is checkable by hand: 188.97 × 1000 × 0.12 × (367.09 × 1.9) = 15,816,131.38.

**`stranded[]`** (new): `{site_id, label, lat, lon, kt, reason}`, drawn as hollow markers.

**Missing from the brief's 6.2, needed:**

| Table | Add | Why |
|---|---|---|
| `flows` JSON | `hav_km`, `circuity`, `rate_usd_per_t_km`, coordinates, labels, `commodity`, `road_km`, `truck_t`, `trips` | Yes, circuity and km basis were missing. Without them a cost cannot be retraced, and `kt` is ambiguous between biomass and SAF |
| `facilities` JSON | `lat`, `lon`, `label`, `capacity_kt`, `capacity_basis`, `capex_usd`, `utilisation` | No join, and CapEx traces per row |
| `solutions` | `status`, `solved_at`, `stranded jsonb`, `cost_by_leg jsonb`, `totals jsonb` (biomass kt, stranded kt, SAF kt, trips), `schema_version int`, `data_hash text` | "Optimal" only when status and gap support it. The hash ties a result to the input files |
| `scenarios` | `slug text unique not null`, `family text` | Stable UI key. Include `north_kalimantan` as a family |
| `sites` | `is_onshore boolean`, `is_candidate boolean`, `data_flag text` | See synthetic-data section |
| `robustness` | `lat`, `lon`, `label` | Airport candidates cannot foreign-key to `sites`, so denormalise |
| `solutions.scenario_id` FK | `on delete cascade` | Scenario re-runs stay idempotent |

Keep `airports.demand_share` as the display default only, and put the split actually used in `scenarios.params`, because sweeps vary it. Use the corrected split, not the brief's.

**`validate_solution()` runs before every write, and a failure blocks the load:**
- Each flow's `cost_usd` equals `kt × 1000 × rate × km`.
- `logistics_usd` is the sum of emitted `cost_usd`, within 1e-6 of the solver's value.
- `capex_usd` is the sum of facility `capex_usd`, and `objective_usd` is their total.
- Mass balances at each node, with yield at refineries, and throughput does not exceed capacity.
- Every id resolves, and every flow has coordinates.
- Biomass collected plus stranded equals 6,800 kt.

Round `kt` to 3 dp first, then compute cost from the rounded value, so displayed numbers reconcile exactly. Size is about 45 KB per solution, so fetch by slug.

**GeoJSON:** only for the static fallback, generated from these same records (`to_geojson(solution)`). It uses `LineString` in `[lon, lat]`, with properties copied. Arcs are straight lines, so label them "schematic, not road geometry".

**RLS:** I accept the SQL block in the full-stack proposal and will run it as part of the schema. Tables created over SQL have RLS off, so it must run before the publishable key ships.

### Q3. North Kalimantan: what the sites really are

**They are a tiny, self-contained supply pocket next to a customer, and far from any plant.** "Stranded" is the wrong word for the geography. The real issue is scale mismatch.

| Fact | Value |
|---|---|
| Sites | KAL_SUP_18 (92.89 kt), KAL_SUP_70 (96.08 kt), 32 km apart, 59 road km |
| To TRK | 88 and 57 km haversine |
| Nearest other supply | 304 km haversine, **689 road km** (circuity 2.27) |
| To BPN | 433 and 465 km haversine, 783 and 788 road km |
| SAF equivalent | 30.2 kt at 16%, 6% of a small refinery, 2.8% of output |

Three consequences:

- **189 kt exceeds a small depot.** It needs two small depots or one large, $4.5M either way. Two small depots at their own sites should win, because they avoid about $0.56M of supply→depot haul. That is a sanity test for the solver.
- **Biomass passes the airport it could have served.** It goes about 700+ km south, then SAF comes back north to TRK. Under full-production demand, TRK needs 82–103 kt at the `CLAUDE.md` splits, more than Bulungan's 30 kt, so that SAF has to travel anyway.
- **The 57 km to TRK is not truckable.** OSRM's 115 km route from KAL_SUP_70 includes a 63 km Ancam–Tarakan ferry, 12.6 h of a 13.5 h trip. Any flow to TRK has this leg. We price it at the 0.08 truck rate and must say so.

**Options, at circuity 1.9:**

| Option | Road km (model) | Cost | Result |
|---|---|---|---|
| Serve via central refinery (KAL_SUP_27) | 1,496 / 1,543 | $34.5M haul + $4.5M depots = **$39.0M**, $206/t biomass | OSRM says 1,917 / 1,922 km, $43.5M haul |
| Serve via East refinery (KAL_SUP_10) | 697 / 758 | $16.5M + $4.5M = **$21.0M**, $111/t biomass | OSRM agrees, $16.2M haul |
| Local small refinery | 0 | **$480M** at 6% utilisation | Saves $38M of haul and SAF hop against the central option. Payback 12.6 years if logistics recurs yearly |
| Strand both sites | n/a | Saves $21–39M, loses 30.2 kt SAF | Honest only if labelled |

The same pair of sites costs nearly twice as much without an East refinery. So Bulungan's fate follows the refinery decision. It is not a separate decision.

**Treatment:**

1. **Base case: serve them.** Hard collection, depots in Bulungan, no silent stranding. This matches the PDF's 6,800 kt.
2. **Protect their arcs from pruning (blocker for OR).** At 300 km, these sites reach only each other at any circuity, so a Bulungan depot is forced. At 600 km depot→refinery:
    - On haversine km, only 3 of 80 candidates are reachable by all sites (KAL_SUP_21, 52, 56, all labelled Paser). The central KAL_SUP_27 is cut at 787 and 812 km.
    - On ×1.4 or ×1.9 km, **none** are, so one refinery is infeasible under hard collection.
    - **Fix:** prune on `hav_km` only, so arcs do not change as the slider moves, and exempt all arcs from depots at sites 18 and 70. Tested for reachability only: 33 single-refinery candidates become reachable, including KAL_SUP_27.
3. **Add three stored scenarios (family `north_kalimantan`):** `nk_served` (base), `nk_excluded` (both sites removed, demand scaled), `nk_local_refinery` (small refinery forced at KAL_SUP_70). Their deltas are the failure case in solver numbers.
4. **Stranding penalty:** any penalty below roughly **$111–206/t biomass** makes the solver drop these sites. So do not run a penalty in the base case. Report the delta as the "price of Bulungan" instead.
5. **Interaction with the 1 kt overflow (needs the orchestrator):** at yield 0.16, one large refinery cannot take 6.25 kt of biomass. With single assignment the smallest possible strand is a whole site, 22.84 kt (KAL_SUP_40). If stranding is allowed, a Bulungan site is an obvious candidate to go, and a $480M second refinery is the alternative. Bulungan should not become the release valve by accident. Whichever way this is resolved, it needs logging first.

**Replace pitch beat 6:** "Bulungan's 189 kt sits beside Tarakan airport, but no refinery pays back on 30 kt of SAF. So it trucks 700-plus km past the airport it could serve, for $X M. That is what full collection costs here. Pertamina can tell us if a barge beats it."

### Parquet on Python 3.14

**pyarrow works; no alternative is needed.** All of these installed together in a clean venv on 3.14.6 (arm64). `pip check` passed, a parquet round trip worked, and a small MILP solved through `pulp.HiGHS`.

```text
pulp==2.9.0
highspy==1.15.1
numpy==2.5.4
pandas==3.1.0
pyarrow==26.0.0
psycopg[binary]==3.3.6
python-dotenv==1.2.4
pytest==9.2.0
global-land-mask==1.0.0
```

- `global-land-mask` is 2.5 MB, needs no network, and computes `is_onshore` in `prepare.py`.
- Wheels exist for Python 3.14 on Linux x86_64 and Windows, and for Python 3.12 on macOS arm64.
- **numpy 2.5.4 found no 3.11 wheel on macOS arm64**, while the same query succeeded for 3.12. The second machine must use Python 3.12 or newer, and any Render or Railway service should do the same. The brief's "Python 3.11" will fail on these pins.

### Python to Supabase

**Use a direct Postgres connection: `psycopg` with `DATABASE_URL`.**

- It can run DDL and RLS statements, which the REST client cannot.
- It loads a batch in one transaction, so a failed run cannot leave a half-populated scenario grid on stage.
- It avoids an extra client dependency. Use `psycopg.types.json.Jsonb` for the JSONB columns.

| Variable | Use |
|---|---|
| `DATABASE_URL` | Loader, schema and `scenarios.py` |
| `SUPABASE_DB_PASSWORD` | Not used in code; assumed to be already in the URL |
| `SUPABASE_SECRET_KEY` | Not used. Fallback only if Postgres is unreachable (REST upsert) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Web only, under `NEXT_PUBLIC_` names |

**Check at 12:00, not yet tested as instructed:** Supabase's direct host is IPv6-only by default, and I have not seen the URL's form. If `SELECT 1` fails on venue Wi-Fi, switch `DATABASE_URL` to the Session pooler URI. On the Transaction pooler (6543), set `prepare_threshold=None`. A password with special characters must be URL-encoded.

**Split the scripts.** `data/prepare.py` is offline and needs no secrets, so tests and cold start work without `.env`. A separate `data/load.py` writes to Supabase. The brief combines them.

**`tests/test_data.py` covers:**
- 80 rows, sum 6800.0 kt, unique ids, and `kt × 1000 == tonnes`.
- Four airports by IATA, each inside the Kalimantan bounding box. BTJ is absent, which catches the Sultan Iskandar Muda trap.
- `airports.dat` read with explicit column names, `dtype=str` for codes, `keep_default_na=False` and `\N` as null.
- North Kalimantan pinned at 681 and 706 km from the centroid, 88 and 57 km from TRK, 304+ km from other sites.
- Exactly 69 onshore sites.

### Is the data synthetic?

**Almost certainly generated, though we cannot prove it. Treat supply sites as synthetic.** Airports are real (OpenFlights), and all four snap within 0.6 km of a road.

| Evidence | Finding | Strength |
|---|---|---|
| Sites in the sea | **11 of 80 are off land on the GLOBE 1 km mask** and outside simplified admin polygons (geoBoundaries): 03, 22, 31, 32, 37, 43, 50, 58, 62, 69, 80. All Ketapang, 965.72 kt. Up to 32 km offshore, and OSRM snaps up to 47 km. KAL_SUP_58 is borderline at 3.9 km | Strong |
| Tonnage shape | Nothing between 35.94 and 87.72 kt. 70 sites fit uniform 87.72–99.90 (KS D 0.148, 5% critical value 0.163). 10 sites step almost evenly from 22.84 to 35.94 | Strong |
| Totals | Sum is exactly 6,800.00 and fits the PDF's "20–100 kt" | Moderate |
| Missing fields | No crop, year or source | Moderate |
| Districts | All 8 province–district pairs are valid and plausible. 58 of 80 fall in their labelled regency. 10 land sites fall 0.4–10.9 km into a neighbouring one, which may be polygon simplification | Weak |

So the district labels look real and the points look generated around them.

**How to handle it:**
- Keep given coordinates and tonnages, because the PDF outranks everything and all 6,800 kt counts as supply. Do not move points silently.
- Set `is_candidate = is_onshore`. That leaves 69 candidates, 10 of them in Ketapang.
- Draw offshore sites hollow. Offshore road km are understated by the snap distance, so `road_km` should add it.

**Label for the assumptions slide, UI footer and README:**

> Biomass sites are organiser-supplied and treated as synthetic: the tonnages look generated, and 11 of 80 sites (966 kt, 14%) plot in the sea off Ketapang, so those are supply only, not facility candidates. Results show how the method behaves, not where to buy land. A real plan needs mill-level data. Airports are real (OpenFlights). Road checks use OpenStreetMap, which under-maps plantation tracks.

### Needs from other roles

- **Orchestrator:** log the 1,087 kt resolution, and rule on circuity 1.9 and offshore candidate exclusion.
- **OR:** prune on `hav_km` with the Bulungan exemption, take candidates from `is_candidate`, and add the three North Kalimantan scenarios and `road_matrix`.
- **Domain:** confirm 1.9 and find a barge rate for the TRK and Bulungan limits. Check the ferry claim before citing it, since it rests on one OSM route.
- **Full-stack:** render `stranded` and `road_km`. Update the circuity buttons, because the proposal's 1.2 / 1.4 / 2.0 no longer matches. Keep a 0.01 km tolerance in the browser's check.

---

## Full-Stack Proposal (Section 5.3)

Spiked in the scratchpad at 11:35. "Verified" below means I built or ran it. Nothing touched Supabase or Vercel, so everything about them is untested.

### Core decision

`web/` is a client-only single-page app, built with `output: 'export'`. It has no server components fetching data, no API routes, no middleware and no `next/image`. It renders from one `Bundle` JSON object, loaded once at page load. After that every click is in-memory, so wifi can drop mid-demo with no effect.

Levels 2, 3 and 4 run the same code. They differ by one env var.

### Versions (exact, `--save-exact`, npm with lockfile)

| Package | Pin | Note |
|---|---|---|
| next | **16.4.3** | Deviation from the brief, see below |
| react, react-dom | 19.3.1 | |
| react-leaflet | 5.0.0 | v5 needs React 19; v4.2.1 needs React 18 |
| leaflet | 1.9.4 | |
| @supabase/supabase-js | 2.118.0 | |
| tailwindcss | 3.4.19 | v3 config, not v4 |
| postcss, autoprefixer | 8.5.32, 10.6.2 | |
| typescript | 5.9.3 | |
| @types/react, @types/node, @types/leaflet | 19.3.0, 22.20.5, 1.9.22 | |

Node 22 (`engines` and `.nvmrc`). Recharts dropped: two stacked bars are about 30 lines of divs, one less dependency.

**Why not Next 14.** `next@14.2.35` installs and builds, and it is the newest 14.x. `npm audit` reports it **critical**, with 25 advisories on `next`, fixed only in the 15.5 line or later. 16.4.3 reports **0 vulnerabilities**; 15.5.28 still reports 2 (postcss).

The honest case is narrow. Those advisories are server-side (Image Optimization, Server Actions, rewrites, middleware), and a static export runs no Next server in production, so they are not reachable. I still prefer 16 for two reasons: the repo is public and a judge may run `npm audit`, and I could not confirm whether Vercel refuses vulnerable Next versions at deploy time. The docs search was inconclusive, and finding out at 14:30 is the wrong time.

**Rollback costs about a minute.** The same spike code also built and rendered on `next@14.2.35` + React 18.3.1 + `react-leaflet@4.2.1`. Only pins change. If anything in 16 costs more than 15 minutes, revert.

Spike results:

| Check | Next 14.2.35 | Next 16.4.3 |
|---|---|---|
| `next build` with `output: 'export'` | pass | pass |
| Leaflet renders from `file://`, no server, no tiles | pass, screenshot checked | pass, DOM checked |
| Leaflet renders over http | pass | not run |
| Tailwind 3.4.19 CSS compiled | not run | pass (build only, not re-rendered) |

Fake bundle size: 25 scenarios × 2 kinds × 110 flows = 541 KB, imported straight into the JS.

### Q1. Map: react-leaflet + Leaflet canvas renderer

- **Why:** 80 sites + 4 airports + arcs is small. Arc count is about 110: 80 site arcs, at least 23 depot arcs (6,800 / 300), and a few airport arcs. deck.gl and MapLibre add WebGL and style-spec risk for no gain here. Leaflet with `preferCanvas` rendered this load in the spike.
- **SSR trap:** `app/page.tsx` is `'use client'` and imports the map through `dynamic(() => import('./Map'), { ssr: false })`. Use `CircleMarker` only, which avoids Leaflet's broken default-icon paths under bundlers.
- **Base layer needs no network.** Natural Earth 1:50m land from the `world-atlas` package (public domain), clipped to Borneo and neighbouring coasts, committed as `web/data/borneo.json`. Size 166 KB, 11,871 points. Airport and province labels are ours, drawn as Leaflet tooltips. The 1:10m file is 1.4 MB and not worth it.
- **Tiles are optional and off on stage.** A `B` key toggles CARTO `voyager_nolabels` for Q&A. No API key needed (HTTP 200 checked at 11:36), but attribution is required, and I have not read CARTO's usage terms. Half-loaded tiles on flaky wifi look worse than none, so the land layer is the default look.
- **If tiles fail:** nothing happens. Land sits in a custom pane below `tilePane`, so it shows through. Levels 2 to 4 look identical.
- Map is fixed to Kalimantan bounds. Arc width is proportional to kt, colour is by leg.

### Q2. Disrupt

**The state is one value, not independent controls:**

```ts
type View =
    | { kind: 'base' }
    | { kind: 'grid'; yieldValue: number; circuity: number }
    | { kind: 'disrupt'; slug: string };
```

Disruptions are solved only at base assumptions, and the grid has no disruptions. The cross-product does not exist, so selecting one clears the other, and the UI says "Disruptions are solved at base assumptions only".

**Precomputed mode.**
- Runs available: each open refinery removed, and the top 10 depots by throughput removed (Section 6.3).
- Click an open facility on the map or in the list. Depots with no stored run are greyed out with "not pre-run", never silently mapped to the nearest stored result.
- Result shows the removed facility as a hollow red ×, changed arcs highlighted, unchanged arcs dimmed, cost delta against the base optimal, and how many sites moved.
- Baseline comparison is hidden in disrupt mode. The comparison there is against the base optimal.
- An infeasible run shows "No feasible network under this disruption", as a result rather than an error.

**Demo risk for OR.** The 80 candidates are dense, so removing one refinery site may just open the site next door, giving a tiny delta and a dull map. Please add one or two "district lost" scenarios (for example, no refinery in Ketapang), and pick the demo disruption after looking at the stored results.

**Live mode (stretch).** A separate "Run live solve" button, shown only if `NEXT_PUBLIC_SOLVER_API_URL` is set and the ten-in-a-row gate passed. `POST /solve` returns the same `Solution` JSON into the same renderer. A real spinner shows, with a 30 s timeout. On failure it stays on the stored run and says so.

### Sliders: not sliders

A continuous slider implies interpolation we do not have. The control is **a segmented radio group with one button per solved value**, built from the distinct values in stored `params`, so a 2×2 fallback grid needs no code change. Example: `Yield: 13% | 16% | 19%`, `Circuity: 1.2 | 1.4 | 2.0`, titled "Stored runs".

Honest labelling, all always on screen:
- Header badge: `PRE-SOLVED: N stored runs, no solver running`. Flips to `LIVE SOLVE` only for a real live result, using the returned `solve_seconds`.
- Provenance strip: run slug, solve time, MIP gap, data source.
- No fake spinner, no "re-solving" text, no artificial delay. A short crossfade only.
- Status text comes from one function: `Optimal` only when the stored gap is 0 (tolerance 1e-9), otherwise `Best found, gap x%`. If HiGHS stops at its default gap, the label will say so.

**I reject Section 6.3's "Looks live, is not".** It contradicts honest labelling. Pitch beats 4 and 5 need rewording: "click a refinery off, network reroutes" becomes "here is the stored re-solve", and "slide yield" becomes "step through the solved yields".

### Q3. Single screen (designed for 1280×720, minimum 18 px text, light theme for a lit room)

```
+------------------------------------------------------------------------------------------------+
| Kalimantan SAF Network Planner              [ PRE-SOLVED: N stored runs, no solver running ]   |
| Run: base, yield 16%, circuity 1.4 | solved HH:MM, S.S s, gap 0 | Data: Supabase | Trace N/N ok |
+-------------------------------------------------------------+----------------------------------+
|                                                             | COST (USD)                       |
|  MAP, about 65% width, fixed to Kalimantan                  | Optimal   $X.XXB   Optimal, gap 0|
|                                                             | Baseline  $Y.YYB   greedy        |
|                              (!) N. Kalimantan   # TRK      | Saving    $Z.ZZM   N.N%          |
|      # PNK                                                  |  Opt  [RRRRRRRDDLLLl]            |
|         o--o                                                |  Base [RRRRRRRRDDLLLLl]          |
|          \  \===[depot]                                     |  refinery, depot, leg 1, 2, 3    |
|           \=====[REFINERY]==========\                       +----------------------------------+
|        o--[depot]====/               \===# BPN              | ASSUMPTIONS (stored runs)        |
|              \                                              | Yield     [13%] [16%] [19%]      |
|      # PKN    o                                             | Circuity  [1.2] [1.4] [2.0]      |
|                                                             +----------------------------------+
|  Legend: leg colours, arc width = kt, marker size = capacity| DISRUPT (at base assumptions)    |
|  Click an arc or facility: trace drawer opens over map      | [Refinery A] [Refinery B]        |
|  "kt x km x $/t/km = $, recomputed OK"                      | [Top 10 depots v]    [Reset]     |
|                                                             +----------------------------------+
|                                                             | ROBUSTNESS  [Off] [Depot] [Ref]  |
|                                                             | k of n runs: all / most / some   |
+-------------------------------------------------------------+----------------------------------+
| WHERE THIS FAILS (1) N. Kalimantan, 189 kt: ships N km at $/t vs mean $/t. Click to show.      |
| (2) Refinery count flips with yield: 1,087 kt cap, break-even 15.985%  (3) No OpEx, seasons, roads |
+------------------------------------------------------------------------------------------------+
```

Everything is on one screen with no tabs or scrolling, so nobody hunts for a control on stage. Pitch beats run top to bottom on the right panel, then the bottom band.

**Traceability.** Clicking any arc recomputes haversine × circuity from lat/lon in the browser and `kt × 1000 × km × rate`, using the PDF rates 0.10, 0.12, 0.08. It compares both with the stored `km` and `cost_usd`. The header shows how many arcs pass. Low cost, and it serves the 20% trust criterion directly.

**Robustness.** Show "9 of 9 runs", not "100%". Nine runs cannot support a continuous scale, so my answer to open question 5 is three bins (all / most / some) labelled with k of n. Use blue and orange rather than green and amber, for colour-blind viewers and washed-out projectors.

### Failure-case display (required, Section 9)

A permanent bottom band, never behind a click. Each row states the failure and how the user would know.

1. **North Kalimantan.** KAL_SUP_18 and KAL_SUP_70, 189 kt, 2.8% of biomass. They are 681 and 706 km from the centroid and 304+ km from any other supply site, yet 88 and 57 km from TRK. Do not use the brief's "760 km from everything". The row is computed from the selected run: where they ship, km, $/t against the network mean, or stranded kt if the model allows stranding. Clicking rings both sites and opens the trace. How you know: their $/t stands out in the run.
2. **Refinery capacity cliff.** 6,800 × yield passes 1,087 kt at 15.985%, so the default 16% sits just past the break-even. The row reports refinery count across stored yields, computed from data. How you know: the count changes as you step yield. Final wording waits on the resolution, which CLAUDE.md points to but `docs/DECISIONS.md` does not yet contain.
3. **Not modelled.** OpEx, seasonality, moisture, road network. Text must match `docs/ASSUMPTIONS.md`. How you know: orange sites are the ones that depend on unverified inputs.

Per-run states also show here: infeasible runs and any non-zero MIP gap.

### Supabase access

The frontend uses the publishable key only (`anon` role). Run once after the tables exist. Owned by Data, since it is part of the schema.

```sql
do $$
declare t text;
begin
    foreach t in array array['sites','airports','scenarios','solutions','robustness'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke all on public.%I from anon, authenticated', t);
        execute format('grant select on public.%I to anon, authenticated', t);
        execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    end loop;
end $$;
```

- The revoke matters. RLS alone makes a blocked delete return 0 rows silently; revoking gives a hard `42501` error, so the test below can tell the difference.
- Do not use `force row level security`. The loader connects through `DATABASE_URL` as owner or with the secret key, and needs to keep writing.
- Any table added later needs the same four lines.
- `web/scripts/check-rls.mjs` (run at 12:15): with the publishable key, select must return rows on all five tables, and insert, update and delete must each return `42501`.

**Env.** `web/` does not read the root `.env`. Generate the file without printing it, from the repo root:

```bash
{ grep '^SUPABASE_URL=' .env; grep '^SUPABASE_PUBLISHABLE_KEY=' .env; } | sed 's/^/NEXT_PUBLIC_/' > web/.env.local
```

| Variable | `web/.env.local` | Vercel (Production and Preview) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | yes |
| `NEXT_PUBLIC_DATA_SOURCE` | `supabase` | `supabase` |
| `NEXT_PUBLIC_SOLVER_API_URL` | stretch only | stretch only |

`SUPABASE_SECRET_KEY`, `DATABASE_URL` and `SUPABASE_DB_PASSWORD` never go in `web/` or Vercel. `NEXT_PUBLIC_` values are inlined at build, so a change needs a redeploy. Add `web/.env.example` with names only (`.gitignore` already allows it and already ignores `web/.env.local`). Add `out/` to `.gitignore`. Vercel: Root Directory `web`, Node 22.

### Fallback ladder: one code path

`web/scripts/snapshot.mjs` (`npm run snapshot`) reads the five tables with the publishable key, validates them, and writes `web/data/bundle.json`, which is committed. It aborts if a flow names an unknown node. The app imports that file statically, so there is no fetch and it works on `file://`.

```ts
export async function loadBundle(): Promise<Loaded> {
    if (process.env.NEXT_PUBLIC_DATA_SOURCE !== 'supabase') {
        return { bundle: snapshot, source: 'snapshot' };
    }
    try {
        const { fetchBundle } = await import('./supabase');
        return { bundle: await fetchBundle(AbortSignal.timeout(2500)), source: 'supabase' };
    } catch {
        return { bundle: snapshot, source: 'snapshot' };
    }
}
```

`fetchBundle` must throw on `error` and on any empty table. supabase-js returns `{ data: null, error }` instead of throwing (verified: aborted at 1,505 ms on an unreachable host), and a bad policy returns an empty list with no error. The source is decided once at load and never swaps mid-demo. The header states which one is in use.

| Level | How | Data source |
|---|---|---|
| 2. Vercel | deploy | Supabase, snapshot if unreachable |
| 3. Local | `npm run dev` | Same |
| 4. Static | `npm run build:static`, copied to `/fallback`, committed | Snapshot only, Supabase code not loaded |
| 1. Live | Level 2 plus solver URL | Same as 2, plus real solves |

Level 4 is `NEXT_PUBLIC_DATA_SOURCE=snapshot next build` with `assetPrefix: './'`. **The relative prefix is required:** the default absolute `/_next` paths rendered nothing on `file://`, while `./` rendered a working map. Use it in all builds, and keep the app to one route, because the relative path only holds at root.

Level 4 needs almost no extra work and exceeds the brief, since it carries every stored run, not just the base case and one disruption. Double-click `fallback/index.html`, about 3 MB, no npm and no server. Build it at 12:30 from the fixture so it exists early, and re-run after each solve. Keep one screenshot in the slides as a last resort.

### Needs from other roles

**Data (schema changes):**
- `scenarios.slug text unique not null` and `family text` (`base`, `grid`, `disrupt_refinery`, `disrupt_depot`). UUIDs give the UI no lookup key.
- `solutions.status text` (`optimal`, `feasible`, `infeasible`), `solved_at timestamptz`, `stranded jsonb`. Allow null costs for infeasible runs.
- A facility may need its own `lat` and `lon`, see below.

**OR:**
- Flow `km` is road km (haversine × circuity), and `cost_usd = kt × 1000 × km × rate`, with refinery→airport at 0.08.
- Node ids are site ids or IATA codes.
- Store the achieved MIP gap.
- The greedy baseline has one large refinery at the centroid. That is 1 kt over capacity at 16%, and the centroid is not a candidate site, so it needs a resolved rule and coordinates the map can draw.
- Do not hardcode refinery count, and the UI will not either.

**Orchestrator:** approve Next 16 or overrule to 14.2.35, and log it. The project folder is not a git repo yet, which Vercel Git deploys and the submission both need.

### Build order

| By | Done |
|---|---|
| 12:15 | Scaffold, `Bundle` type, hand-made fixture, land layer. UI work does not wait on the solver |
| 12:30 | Level 4 builds from the fixture |
| 13:15 | Base case from Supabase on localhost, cost panel, failure band |
| 14:00 | Disrupt, stepper, robustness, trace |
| 14:30 | Vercel live, checked in a private window, `/fallback` rebuilt on final data |

### Q4. Cut order if behind at 14:00

1. FastAPI live button
2. CARTO tile toggle
3. Truck trip counts
4. Facility click detail (keep arc trace)
5. Keyboard shortcuts and URL state
6. Runtime Supabase read: go snapshot-only and label it so

**Never cut:** the cost numbers, baseline comparison, provenance badge, failure band, disrupt, robustness, Level 4.

---

## SAF Domain Expert proposal (brief Section 5.4)

Status: 11:40 SGT. Proxy figures come from a rough script over `data/raw/`: no depots, all biomass at 0.12 USD/t/km, circuity 1.4. They show orders of magnitude only. They are not MILP results and must not go on a slide.

### Headline calls

| # | Call | Value |
|---|---|---|
| 1 | Default yield | **0.15**, end to end, on dry-tonne biomass. 6,800 × 0.15 = 1,020 kt, 93.8% of one large refinery. Not 0.16 |
| 2 | Pitch line "16% is how the designer built the table" | **Drop it.** Unprovable and circular. Say "above 15.985% yield the table forces a second refinery" |
| 3 | Refinery capacity basis | **SAF output** by default, because of the PDF heading. Add one named scenario for biomass input ($5.07B floor) |
| 4 | Demand default | **Full production through the four airports**, labelled "gateway scenario". They cannot burn it (Q3) |
| 5 | Depot mass loss | **Base r = 1.00.** Add the parameter and run r = 0.79 and r = 0.47, holding end-to-end yield fixed |
| 6 | Airport split | **BPN 55.8, PNK 31.7, TRK 7.5, PKN 5.0**, using BPN 7.4M. Same pre-COVID era as the other three. Second-order for cost |
| 7 | New decision for the orchestrator | **Time basis.** The PDF gives no "per year" and no horizon. The proxy suggests this flips one refinery vs two (Section 6) |

---

### 1. The four profile questions

#### Q1. Is 16% yield defensible for mixed palm residue?

Only with three qualifiers, and it is the wrong default.

- **Best source found:** CRL Energy (Williamson and McCurdy, 2009, for the NZ Parliamentary Commissioner for the Environment). Base case is 10,000 oven-dry t/day in, about 10,500 bbl/day of FT fuel out, and the report states an "84% reduction in mass", which implies about 0.16. The barrel figure gives about 0.13 at an assumed 0.8 t/m³. So **0.13 to 0.16 is total FT liquids per oven-dry tonne**. https://pce.parliament.nz/media/bgmkhiol/appendix-b.pdf (pp. 2, 12)
- **Qualifier 1, product:** that figure is all liquids. The same plant's kerosene cut is only 0.15 bbl per oven-dry tonne, about 0.02 t/t at 0.8 t/m³. The slate is diesel-heavy. We count all FT liquid as SAF and must say so. Hydrocracking would shift the slate, and Chireshe et al. 2025 report supplemental hydrogen raising SAF yield by up to 70%. https://ideas.repec.org/a/eee/rensus/v210y2025ics1364032124008839.html
- **Qualifier 2, basis:** dry only. Neither the PDF nor the CSV states a moisture basis. If the 6,800 kt is wet EFB at about 60% moisture, then 0.15 dry becomes 0.06 as-received: 408 kt, which fits **one small refinery**. Treat kt as dry tonnes and say so.
- **Qualifier 3, feedstock:** I found no EFB or palm-specific SAF yield. The PDF says "agricultural and forestry residues" and the CSV has no crop column. **"Palm residue" is our assumption, not a data fact.** Do not claim the 6,800 kt is palm on a slide.

Use 0.15. It sits inside the 0.13 to 0.16 band, is a number a judge can multiply in their head, and is off the cliff. 6.2% headroom is also more honest than a plant at 100% utilisation.

Sensitivity grid: **0.13, 0.15, 0.17**, plus two single runs:
- 0.16, to show the cliff.
- 0.06, to show the wet basis.

Keep 0.19 only as an unsourced stress value. Its cited source is wrong (Section 7).

#### Q2. Should depots model mass loss?

Yes as a parameter, no in the base case. See Section 3.

#### Q3. Which demand scenario should be the demo default?

Full production. See Section 3.

#### Q4. The one slide nobody has thought of

**"One kilotonne, $480M."** A staircase of minimum refinery CapEx against yield, computed from the PDF table alone:

| Yield | SAF kt | Cheapest refinery set | CapEx |
|---|---|---|---|
| up to 7.35% | up to 500 | 1 small | $480M |
| 7.35% to 15.985% | 500 to 1,087 | 1 large | $765M |
| 15.985% to 23.34% | 1,087 to 1,587 | 1 large + 1 small | $1,245M |
| above 23.34% | above 1,587 | 2 large | $1,530M |

It turns the brief's error into our strongest honesty point, needs no solver to check, and tells the planner which number to measure first. Our 0.13 to 0.19 sweep crosses a $480M step at a value nobody has measured.

---

### 2. Section 4.1 assumptions: verdict per row

| Row | Verdict | Change and reason |
|---|---|---|
| Yield 0.16 | **Change to 0.15**, keep slider | Source is CRL Energy 2009. Both of the brief's evidence items fail (Section 7). Range 0.13 to 0.17 plus cliff and wet runs |
| Circuity 1.4 | **Endorse, keep slider** 1.2 to 2.0 | Sultana and Kumar verified: 1 to 3.16, theoretical 1.27 (Alberta). Ballou's 1.12 to 2.10 is not verified, so do not quote it. No Indonesia value found. Limit: Tarakan airport is on an island, so a road factor does not cover the final leg to TRK. Check on the map |
| Airport split | **Change** | Transposed in the brief. Use 55.8 / 31.7 / 7.5 / 5.0 (Section 5). Sensitivity: equal split. **Delete "mandate-only"**: none of the four airports is in the mandate, so that split is undefined |
| Total demand | **Endorse full production**, relabel | "Gateway scenario", 1,020 kt at y = 0.15. The 60,000 kL figure is a 2024 estimate and predates the two-airport scope |
| Depot capacity meaning | **Endorse: biomass throughput in** | PDF heading is "Production Capacity", which for a depot could mean output. Moot at r = 1. Floor is 46 small-equivalents, $103.5M |
| Refinery capacity meaning | **Endorse SAF output, unknowable, add input scenario** | Replace the circular evidence "1087 ≈ 6800×0.16" with the PDF heading (Section 4). Ask the challenge owner if reachable |
| OpEx | **Unknowable, keep unmodelled** | PDF objective names OpEx but gives no figures. Say so on the slide. Logistics is modelled separately. Do not invent a number |
| Candidate sites | **Endorse 80 sites, add 4 airports as refinery candidates** | PDF asks for "optimal coordinates" and does not restrict them. BPN is the one with a real case: Pertamina's Balikpapan refinery upgrade was inaugurated in January 2026 at 360 kbpd. https://business-indonesia.org/news/prabowo-inaugurates-usd-7-4-bn-balikpapan-refinery-upgrade |

---

### 3. Brief Section 10, questions 3 and 4

#### Q3. Demand: full production as default

- **Why:** the PDF gives 6,800 kt of feedstock, asks us to meet demand at four airports, and gives no demand figure. Full production is the only reading that uses the whole table.
- **Why not mandate-scaled:** the 1% mandate covers CGK and DPS only, so demand at our four airports is **zero**, not "tiny". There is no network to design.
- **Say this on stage:** 1,020 kt is about 1.31M kL, roughly **22× the 60,000 kL** national estimate (47 kt at an assumed 0.78 kg/L).
- **Say this as a limit:** 1,020 kt is probably 4 to 8× all the jet fuel these four airports use. That is my rough estimate: 5 to 7M enplanements × 25 to 40 kg, or 135 to 270 kt. **It is not sourced, so it is not for a slide as fact.** At the 50% FT blend limit (IATA, Section 7), local use would absorb only about 7 to 13% of output.
- **Consequence:** the airports act as delivery gateways and most SAF would leave by sea. We have no port nodes. Name this as a stated failure case and put port nodes in `docs/NEXT.md`.
- **No intermediate scenario.** It adds runs and answers nothing the sentence above does not.

#### Q4. Depot mass loss: parameterise, base r = 1.00

- **Why not in the base:** the moisture basis is unknown, and a judge cannot check any factor against the cost table.
- **Formulation, one constant and no new variables:**
  - Depot: `outflow_d = r × inflow_d`, with capacity on inflow.
  - Refinery: `SAF_out = (y / r) × inflow_R`.
  - Result: end-to-end SAF stays `6,800 × y`, so r moves logistics only and does not touch the yield cliff. Without this rescale, r would silently cut yield.
- **Scenarios:**
  - **r = 0.79:** biomass preparation mass efficiency on a dry basis, CRL Energy Table 2, p. 9. That step sits inside the plant in the source and we are moving it to the depot. Label it as such.
  - **r = 0.47:** recomputable, wet EFB dried from 60% to 15% moisture (0.40 / 0.85). Moisture of about 60% is supported by an OCL journal paper, seen via search summary only. https://www.ocl-journal.org/articles/ocl/pdf/2026/01/ocl250017.pdf
- **Effect, proxy:** the depot→refinery leg is about $330M, so these cut roughly $70M and $175M. This matters to the second-refinery decision.

---

### 4. 6,800 × 0.16 = 1,088 kt against 1,087 kt

**Does "Production Capacity" support reading refinery capacity as SAF output?** Yes, but it is not conclusive. "Production" of a refinery naturally means product out. The PDF column is literally "Production Capacity" with "kilotonne", and it has no "/yr". The same column also covers depots, which produce no fuel, so the heading is not precise.

**What this does to "the designer built the table from 16%":** it falls from "almost certainly" to "cannot be determined".

- **New finding, the table has another explanation.** The refinery row fits the classic six-tenths scaling rule: ln(765/480) / ln(1087/500) = **0.6002**. So 480 × (1087/500)^0.6 = 764.9, and 500 × (765/480)^(1/0.6) = 1,087.3, which rounds to exactly 1,087. No yield is needed to reach that number.
- **The 16% story is not dead.** 1,087 / 0.16 = 6,794, which rounds to 6,800, so 6,800 may be the rounded figure. A near-match this close to a round yield is still suspicious.
- **The data cannot separate these.** The defensible claim is that the table is consistent with a yield near 16%.
- **It is circular either way.** A match to the designer's table says nothing about real-world yield, so it cannot be "evidence for the yield assumption".

**Default.** Options compared:

| Option | SAF kt | Refinery CapEx | Verdict |
|---|---|---|---|
| 0.16 | 1,088 | $1,245M | **Reject.** Solver buys a $480M plant to place 1 kt. An artefact, unless two plants win on logistics anyway |
| 0.16, strand 6.25 kt | 1,087 | $765M | Reject. Smallest site is 22.84 kt, so single assignment strands a whole site |
| 0.15985 | 1,087 | $765M | Fallback if the orchestrator wants table fidelity. Label "table-implied ceiling". 100% utilisation, no margin, false precision |
| **0.15** | **1,020** | **$765M** | **Recommended.** Inside the source band, 6.2% headroom, not on the cliff |

**Framing:** "15.985% is a threshold the table implies, not a yield anyone measured. We run 15% and show what happens above the threshold."

**The biomass-input reading.** Capacity as biomass in needs 6,800 / 1,087 = 6.26 plants. Cheapest cover is **6 large + 1 small = $5.07B** (7 large = $5.355B), about 6.6× the output-reading CapEx.

Do not dismiss it: it is the more realistic number.
- Output reading: $765M / 1,087 kt = **$704 per annual tonne**. That is below a HEFA plant reported at about $500M for 300 kt, or $1,667/t (single source, Section 7), and gasification-FT should cost more than HEFA.
- Input reading at y = 0.15: 163 kt SAF per large plant, or **about $4,700 per annual tonne**.
- A single plant taking 7,247 kt of biomass a year (the 1,087 kt limit at y = 0.15) is about 19,900 t/day, the top of CRL's 2,000 to 20,000 oven-dry t/day working range. Today's 6,800 kt is about 18,600 t/day.

So the heading favours output and real-world cost favours input. **Per CLAUDE.md the PDF wins, so output is the default.** Run input as one named scenario and put it on the assumptions slide. If an Airbus mentor is reachable, ask two questions: is refinery capacity SAF out or biomass in, and is 6,800 kt per year?

---

### 5. Airport split

**Use BPN 7.4M: BPN 55.8, PNK 31.7, TRK 7.5, PKN 5.0** (total 13.26M).

- The figures are about era, not accuracy. PNK 4.2M is a **2018** figure (detik, 8 Feb 2019, "tahun lalu"). https://finance.detik.com/infrastruktur/d-4419807/jemaah-haji-dan-umrah-bakal-bisa-terbang-dari-bandara-supadio
- BPN 4.7M could not be sourced. Pairing a recent BPN with a 2018 PNK mixes eras and understates BPN.
- Recent BPN is 5.1M for 2023 and 4,097,985 for Jan to Sep 2024, or about 5.5M annualised (my estimate). https://kaltim.antaranews.com/berita/225445/bandara-balikpapan-layani-4-juta-penumpang-hingga-september-2024
- I could not find recent full-year figures for PNK, TRK or PKN, so a consistent recent set is not available. The same-era set is the only one that is internally consistent.
- Slide label: "pre-COVID passenger share, all four airports same era, proxy for fuel uplift". Year mapping in the Wikipedia table is unclear for TRK, PKN and BPN, so say "pre-COVID", not a specific year.

**Is pax share the right driver?** Not really, but keep it.
- Fuel demand follows departures × sector fuel, and pax share misses aircraft type, sector length and transfer traffic. The right data is airport fuel uplift, which I could not find publicly. It is a data request for Pertamina.
- SAF also needs blending and certification, so a terminal is arguably the true delivery node, not an airport. Blending is covered by D7566 rules, but I did not confirm it must happen before the airport. Treat as a domain view.
- **It barely matters.** At full 1,087 kt, across six splits including the wrong brief split and equal, the best single refinery stays at **KAL_SUP_27** in every run. The SAF leg moves only $53.5M to $60.2M on about $390M of proxy logistics. The best two-refinery pair is also unchanged across the three splits tested.
- Do not spend build time here. Sensitivity: equal split only.

---

### 6. Decision needed: time basis (not in the brief)

The PDF says "6800kt" and "kilotonne" with no "/yr" and no horizon. The brief added "kt/yr", and its objective adds one-off CapEx to what is effectively one year of logistics.

Proxy at y = 0.15:

| | One refinery | Two refineries |
|---|---|---|
| Sites | KAL_SUP_27, Kotawaringin Barat | KAL_SUP_15, Ketapang (large) + KAL_SUP_10, Kutai Kartanegara (small) |
| Logistics per pass | about $388M | about $224M |
| Extra CapEx | | $480M |

- That is about **$164M saved per pass, repaying $480M in about 2.9 passes**.
- On a single pass the optimiser should pick one refinery. On any multi-year view it should pick two.
- This is the brief's open East Kalimantan question, and it turns on an unstated time basis.

**Recommend:** keep the literal PDF reading (CapEx + one pass) as the base, because it is checkable. Add a `horizon_years` multiplier on logistics with a sensitivity at 1, 5 and 20, undiscounted, and show the flip. OR to confirm with the real model.

---

### 7. Evidence pack fact-check

Anything marked NOT FOUND or WRONG must not go on a slide as fact. Where the brief's claim is partly right, each part has its own line.

| Claim | Verdict | Correct fact and source |
|---|---|---|
| Airbus/Pertamina MoU, Bali Air Show, Sept 2024 | **VERIFIED** | Announced at the show, reported 19 Sep 2024; one search summary gives 18 Sep. Scope: study of local feedstocks, logistics, commercial viability. It is a study, not a plant. https://www.safinvestor.com/?p=145963 |
| Boeing/Pertamina MoU, July 2026 | **VERIFIED** | Signed around 8 Jul 2026 at Indonesia Aero Summit. Non-binding. https://www.nst.com.my/amp/business/corporate/2026/07/1484051/indonesias-pertamina-boeing-sign-mou-sustainable-aviation-fuel |
| Boeing MoU "covering the same scope" | **WRONG** | Boeing's: feedstock sources, SAF technology, policy support. Airbus's: feedstock, logistics, commercial viability. They overlap, and only Airbus's covers logistics. Same NST source |
| "Competing", "before Boeing does" | **NOT FOUND** | Our framing. No source shows a race. Rubric asks for a credible user, so keep the planner and drop the race |
| 1% mandate, 2027, CGK and DPS only | **VERIFIED** | Transport Ministry official Sokhib Al Rokhman, reported 13 Jul 2026. No legal instrument named, so say "planned" or "ministry-stated". https://www.petromindo.com/news/article/indonesia-to-launch-1-saf-blend-on-international-flights-in-2027 |
| About 60,000 kL | **VERIFIED, with caveat** | Argus 2024 estimate for all international departures. Predates the two-airport scope, so do not present it as the CGK+DPS volume. https://www.argusmedia.com/en/news-and-insights/latest-market-news/2609725-indonesia-to-require-saf-for-flights-from-2027 |
| CET vol 125: ATJ 0.19 **t/t** | **WRONG** | Source says 0.19 t/**day** from 17.55 t/day of wet biomass, or **about 1.1%** (elsewhere 0.22 t, 1.25%). FT is 1.17 t/day, about 6.7%. Feedstock is Colombian market-square residue. Do not cite for 0.19. https://www.cetjournal.it/cet/26/125/096.pdf |
| RSC d4se00749b: FT about 0.13 | **NOT FOUND** | Paper exists: Ahire et al., Sustain. Energy Fuels 8:4602, 2024, forest residue FT, 90 Mg/day, $1.87/kg per search summary. RSC returned 403, so 0.13 is unconfirmed. https://pubs.rsc.org/en/content/articlelanding/2024/se/d4se00749b Cite CRL Energy instead |
| Ballou et al. 2002 citation | **VERIFIED** | Transportation Research Part A 36(9):843-848. https://trid.trb.org/view.aspx?id=726009 |
| Ballou range 1.12 to 2.10 | **NOT FOUND** | Table is paywalled. No Indonesia value seen |
| Sultana and Kumar 2014: 1 to 3.16, 1.27 | **VERIFIED** | Applied Energy 119:288-295, tortuosity factor, Alberta. https://ideas.repec.org/a/eee/appene/v119y2014icp288-295.html |
| Ng and Maravelias 2017 citation | **VERIFIED** | Renewable Energy 100:90-102, DOI 10.1016/j.renene.2016.05.009. https://ideas.repec.org/a/eee/renene/v100y2017icp90-102.html |
| Their "two simplifications" | **WRONG (annual), NOT FOUND (single assignment)** | Abstract-level sources describe a **multi-period** MILP with inventory and shipment planning, the opposite of "annual totals". Full text not read. Cite the paper for depot-and-refinery siting only. OR should not attribute either simplification to it. https://collaborate.princeton.edu/en/publications/design-of-biofuel-supply-chains-with-variable-regional-depot-and-/ |
| JATRA K-means paper exists, UCO and POME | **VERIFIED** | Dzikra, Kastaman, Januardi, JATRA 8(1), June 2026. https://jurnal.polibatam.ac.id/index.php/JATRA/article/view/13032 |
| "Not Kalimantan" / "only published work" | **WRONG** | JATRA recommends a **Central Kalimantan** facility, which is useful but on other feedstocks. Harahap et al. 2020 (BeWhere Indonesia) is spatially explicit optimisation of palm biorefineries on **Sumatra and Kalimantan**. https://ideas.repec.org/a/eee/appene/v278y2020ics0306261920312368.html |
| Novelty claim | **Change wording** | Say: "We could not find a SAF-specific depot-and-refinery MILP for Kalimantan with disruption re-planning." Harahap covers power, biodiesel and ethanol, not SAF. My search was short |
| Status quo "spreadsheets plus intuition" | **NOT FOUND** | Our assumption. Present as such |
| Airbus + IPB, up to 100 Mt/yr biomass | **VERIFIED** | Secondary source, 22 Aug 2025. Ignore the KPL report that gives 100 Mt as SAF output. https://www.bioenergy-news.com/news/airbus-eyes-indonesia-biomass-for-saf/ |
| SAF mainly from biomass by 2030 | **VERIFIED** | Same source, as an Airbus projection |
| "Because waste oils are capped" | **NOT FOUND** | Source wording: "output limitations due to competition with food supplies". Use that |
| "Every" SEA SAF plant is HEFA near Singapore/Johor | **WRONG** | Keppel/Aster ethanol-to-jet on Jurong Island: https://www.edb.gov.sg/en/about-edb/media-releases-publications/keppel-aster-to-build-saf-ethanol-to-jet-plant-on-jurong-island.html KBR, 100,000 tpy ETJ Singapore: https://hydrocarbonprocessing.com/news/2026/06/kbr-technology-selected-for-100-000-tpy-ethanol-to-jet-saf-plant-in-singapore/ KT Tech, 60,000 tpy North Sumatra: https://hydrocarbonprocessing.com/news/2026/04/kt-tech-awarded-early-engineering-works-contract-for-60-000-tpy-saf-plant-in-indonesia/ |
| Neste Singapore 1 Mt | **VERIFIED** | EDB: up to 1 Mt. https://www.edb.gov.sg/en/business-insights/insights/singapore-to-have-world-s-largest-sustainable-aviation-fuel-plant.html |
| Pengerang 650 kt | **VERIFIED, basis unclear** | Reported as annual capacity. "Feed" not confirmed. Start H2 2028. https://www.idnfinancials.com/news/58637/petronas-with-enilive-and-euglena-to-build-650-000-ton-bio-refinery |
| FatHopes Port Klang 300 kt | **VERIFIED, planned only** | HEFA. FID deferred to Q1 2027, start mid-2030. Not existing. https://www.argusmedia.com/news-and-insights/latest-market-news/2787896-malaysia-s-fathopes-defers-fid-on-biofuels-plant The $500M figure is single-source, so internal cross-check only |
| PLN "already pelletising" EFB in Sambas | **VERIFIED in part** | Oct 2023 MoU between PLN EPI and Elektrika Konstruksi Nusantara for the Bengkayang coal plant. Current operation not confirmed. Say "agreed in 2023". https://ekonomi.republika.co.id/berita/s2cama457/pln-manfaatkan-limbah-sawit-jadi-bahan-bakar-pltu |
| Central and West Kalimantan "lead" | **VERIFIED in part** | IJAS is the International Journal of Agriculture System 14(1), 2026. Lists Riau, Central and West Kalimantan as leading, order not confirmed. Say "among the leading provinces". https://pasca.unhas.ac.id/ojs/index.php/ijas/article/view/6720 |
| Pax: BPN about 7.4M, PNK 4.2M, TRK 1.0M, PKN 0.66M | **VERIFIED in values** | Wikipedia table holds these, years unclear for some. PNK is 2018. https://en.wikipedia.org/wiki/List_of_the_busiest_airports_in_Indonesia |
| BPN "recent about 4.7M" | **NOT FOUND** | 2023 was 5.1M |
| FT-SPK 50% blend limit (added) | **VERIFIED** | https://www.iata.org/contentassets/d13875e9ed784f75bac90f000760e998/saf-technical-certifications.pdf |
| Four airports are "international" | **NOT FOUND** except PNK | PNK lost status in 2024 and regained it under KM 30/2025. Use the PDF's names and do not assert status. https://m.antaranews.com/amp/berita/4878549/bandara-supadio-kembali-berstatus-internasional |

Not checked for lack of time: EFB gasification suitability, and whether Tarakan has any fixed road link.

---

## Judge proposal: scoring pass 0 (plan only, no code)

Scored against the Airbus PDF rubric (pp. 7-8), not the brief's paraphrase. The subject is brief Sections 5-9 as amended by CLAUDE.md, read literally and assumed built exactly as written.

**Verdict: 49/100. Do not lock the plan unchanged.** The method is right. The objective is under-specified, the default baseline is infeasible, the pruning rule is not neutral, the failure case is false, and the disrupt demo is a lookup table that the pitch calls "live". Most of this is cheap to fix now. Projected: about 73/100 after the top three fixes, about 77 if the user and status quo fix also lands.

### 0. Findings from checks I ran (these drive the scores)

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

### 1. Scores

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

### 2. Top three fixes, ranked by score gain per minute

Gains are my judgement, not a calculation. Minutes assume `resolve()` already exists, as the plan requires.

#### Fix 1: Correct the model specification before lock (about 15 min, about +7 points, 0.47 per min)

Orchestrator and OR. Technical 2→3, Impact 2→3. It only earns the points if all four land:

- **Horizon.** Add an explicit logistics multiplier, as a logged [ASSUMPTION]. Suggested default: annualise CapEx at 10% over 20 years (factor 0.1175, equivalent to 8.5 years of logistics). Show that the refinery count changes with it.
- **Baseline.** Make it feasible: snap the refinery to KAL_SUP_45 and give it enough capacity at the locked yield. Run it with the same distances as the MILP.
- **Pruning.** Replace the 300/600 km speed-up with one declared constraint on farm-truck haul, and apply no leg-2 cut that removes a feasible layout. Report the cost of that constraint (F5).
- **Yield.** Log the decision that CLAUDE.md says exists (F9).

#### Fix 2: Ship a measured, visible failure (about 20 min, about +8 points, 0.40 per min)

Data, Frontend, Pitch. Honest evaluation 2→4.

- Sample about 30 arcs on OSRM, stratified across legs and provinces. Publish the circuity median and range in the repo, then re-centre the default and the sweep on the measured result.
- Mark every TRK arc on the map: "63 km ferry, no road, cost understated".
- Rewrite pitch step 6 (Section 5).

This gives what the rubric asks for: test data, a metric, a visible failure, a reason, and a way for the user to know.

#### Fix 3: Make off-script input a commitment, with a test table (about 30 min, about +9 points, 0.30 per min)

OR and Member 2. Technical 3→4, Trust 3→4.

- Add a CLI entry to `resolve()` (Section 6), and label stored scenarios as precomputed.
- Run 20 random scenarios and publish: solved count, worst solve time, worst gap.
- Include at least one infeasible input and show a plain refusal, for example: "Infeasible: 1,292 kt SAF exceeds the one refinery you allowed."

**Next in line, if time remains:**

- Rename the user and fix the status quo (Section 5, about 10 min, Problem realism 3→4, uncertain).
- Add an arc-click trace showing `kt × rate × km = $` (about 20 min). This secures the Trust 4 from Fix 3.

### 3. Remaining profile questions

**Pitch opening line (10 words):**

> One kilotonne of Kalimantan SAF can cost a $480M refinery.

Count: One (1) kilotonne (2) of (3) Kalimantan (4) SAF (5) can (6) cost (7) a (8) $480M (9) refinery (10).

Any judge can check it against the PDF table with a calculator. It leads straight into the planner's decision and the honest section. If asked, the condition is: at 16% yield with every site collected, 1,088 kt exceeds the 1,087 kt capacity, and the cheapest extra capacity costs $480M.

**The one feature whose absence would cost the most points: a re-solve on an input the judge chooses.**

Without it, Technical soundness cannot pass 3 and may stay at 2. That is the highest-weighted criterion, and the rubric names "hard-coded demo" as Weak. Worst-case swing is 10 points (4 down to 2). It is also the item the plan drops first, because live solving is a stretch goal.

### 4. Brief Section 10 recommendations

#### Q5, robust threshold: use run counts, with "every run" as the only green

- **Do not use 80%.** With 9 runs the options are 7/9 (78%) or 8/9 (89%), so it is false precision. The runs are a grid, not a probability sample, so a percentage implies something untrue.
- **Do not use a continuous scale.** It reads badly on a projector and invites "what does 0.7 mean?".
- **Use three bands, labelled with the count:** green "opened in 12 of 12", amber "opened in some", grey "never opened".
- **Score at cluster level, for example within 50 km.** Neighbouring candidates are near-substitutes, so exact-site frequency will make solid regions look unstable.
- **Straddle the break-even.** Use yields of about 0.13, 0.155, 0.165 and 0.19 against three circuity values re-centred on the measured range, giving 12 runs. A grid of only 0.13, 0.16 and 0.19 hides where the flip happens.
- **Change the wording.** Replace "Commit to green" with "Green survived every case we tested; amber needs checking first". The rubric's Weak line includes a claim to replace expert judgement.

#### Q6, LLM explanation layer: skip it

| Option | Likely gain | Minutes | Points per min |
|---|---|---:|---:|
| Top three fixes above | 7-9 points each | 15-30 | 0.30-0.47 |
| LLM explanation | about 0.5 of a score on Technical, about 2.5 points | about 30 | about 0.08 |

- The rubric penalises LLM misuse. It does not require LLM use, and it says to "reward sound restraint".
- A live call adds a demo failure mode and a key to manage, and it can produce numbers that do not trace. That hurts Trust, which is worth twice Impact.
- Say this in Q&A: "A solver makes every decision. There is no LLM in the decision path."
- **One exception:** if every top fix is done and checkpoint 2 is green, a precomputed, labelled paragraph per scenario is acceptable. Every number in it must be machine-checked against the solution JSON. Never call it live on stage.

### 5. Claims we could not back in front of a judge

Status key: **False**, **Contradicted**, **Unverified**, **Partly true**, **Supported**. Searches were quick, so "Supported" means good enough to cite after opening the source.

#### Pitch skeleton (brief Section 8)

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

#### Evidence pack and data

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

#### Replacement failure case for step 6

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

### 6. The rubric read literally

#### Does a precomputed disrupt risk being judged a "polished interface over a hard-coded scenario"?

**Yes, as written.** The rubric's Technical Weak line says "a hard-coded demo", and the other page says "a polished interface over a hard-coded scenario". The results would be real solver outputs, so it is not strictly hard-coded. But a judge cannot tell that from the stage, and the plan says "Looks live, is not" while the pitch says "Live". That mismatch is the bigger problem: it costs Trust as well as Technical.

**Minimum change, about 5 minutes on top of existing work:**

- Change the pitch word from "Live" to "Solved".
- Show provenance on each result: solver, gap, solve time and timestamp, for example "Precomputed by HiGHS, gap 0.00%, 7.4 s".
- Precompute every open facility's removal, not only the top 10 depots, so any facility on the map can be clicked. Compute time only.

#### Does the plan satisfy "handles input beyond the demo script"?

**No.** The rubric also says "Test beyond a scripted demo". The plan offers a fixed list of about 20 runs, and the only off-list path is a stretch goal that can be dropped.

**Minimum change, about 15 minutes once `resolve()` exists:**

- Add a CLI as a committed deliverable, not a stretch goal, for example:

  ```bash
  python -m solver.model --exclude KAL_SUP_33 --yield 0.14 --capex-mult 1.2 --json
  ```

- In Q&A, ask the judge to name a site, then run it on the laptop. No hosting risk. Keep the ten-success gate for the public URL.
- Commit a test of 20 random scenarios plus one infeasible case. Publish the results in the README and on a slide.

If a Python service works locally by 14:00, wire it to a "custom scenario" control on the presenter's laptop. Do not chase hosted solving.

### Sources

- Boeing MoU: [New Straits Times](https://www.nst.com.my/amp/business/corporate/2026/07/1484051/indonesias-pertamina-boeing-sign-mou-sustainable-aviation-fuel), [Jakarta Post](https://www.thejakartapost.com/adv/2026/07/13/pertamina-boeing-explore-opportunities-to-develop-indonesias-saf-ecosystem)
- Airbus MoU: [Pertamina release](https://pertamina.com/en/news-room/news-release/Pertamina-and-Airbus-Explore-Collaboration-on-Sustainable-Aviation-Fuel-Development-in-Indonesia), [Detik, used cooking oil](https://finance.detik.com/energi/d-7964459/airbus-lirik-minyak-jelantah-ri-buat-pengganti-avtur/amp)
- Mandate: [Petromindo](https://www.petromindo.com/news/article/indonesia-to-launch-1-saf-blend-on-international-flights-in-2027), [Argus](https://argusmedia.com/en/news-and-insights/latest-market-news/2609725-indonesia-to-require-saf-for-flights-from-2027), [CAPA](https://centreforaviation.com/news/pertamina-and-boeing-to-develop-saf-in-indonesia-1365651)
- Tarakan access: [Tarakan city government](https://berita.tarakankota.go.id/2010/04/after-prolonged-operation-of-ferry.html) (2010), [Republika, fares](https://news.republika.co.id/berita/rhpzdn382/tarif-perahu-cepat-melonjak-imbas-kenaikan-harga-bbm)
- Road routes: public OSRM demo server, `router.project-osrm.org`, queried 31 Oct 2026
