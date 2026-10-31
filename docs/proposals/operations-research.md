# Operations Research proposal (Section 5.1)

All numbers use the real data: 80 sites, haversine × 1.4, legs 0.10 / 0.12 / 0.08, airport shares BPN 44.5, PNK 39.8, TRK 9.5, PKN 6.2, HiGHS via PuLP 2.9.0. **[M]** = measured here, **[E]** = estimated or computed from measured points. Every solve had a limit of 60 s or less. Many ran alongside 7 to 8 other solves on 15 cores, so timings are pessimistic. Prototype: `/private/tmp/claude-501/-Users-jingyuan-Desktop-Larpers/58e8ad1b-1d53-476e-9bdc-33216b32c8f4/scratchpad/or/m.py`.

## Headlines

1. **The brief's plan does not reach gap 0.** Full 80×80, single-assignment, 300/600 km: 34% gap at 60 s. [M]
2. **The formulation below does.** Gap 0 in about 30 s, with $1,562.8M for L + S at y = 0.16. [M] The claim must be scoped: "optimal among 27 refinery candidates".
3. **The 600 km prune is invalid.** It makes every one-refinery plan infeasible. [M]
4. **The yield step costs $305M, not $480M**, because a second refinery saves $175M a year in logistics. [M]
5. **Horizon matters more than yield.** The PDF objective adds one-off CapEx to annual logistics. At about 3 years of logistics the one-refinery plan loses at any yield, and at 5 years the solver picks three small refineries. [M/E]
6. **The brief's "green sites" story fails as written.** No refinery site is used on both sides of the yield step. [M]

## Q1. Formulation

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

## Q2. Split flow: disagree with Ng and Maravelias here. Allow it.

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

## Q3. Demand below production

- Surplus goes to explicit surplus SAF, e_k, at the refinery gate. It earns no revenue and has no transport cost. It appears on the map as a labelled refinery-gate export.
- With hard collection, the objective still pays for collecting, trucking and refining the surplus. No revenue offsets that. The scenario therefore shows the cost of overbuilding, and the UI should say so.
- If collection is soft and demand is small, the model collects only the cheapest biomass, which is the correct answer to a different question.
- The default stays full production: D = y · collected. Then e_k = 0.

## Q4. Size and the plan if slow

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

## Q5. What I refuse to model

**Mandate-scaled demand.** The brief lists it as a sensitivity case, but says itself that none of the four airports is in the mandate. Taken literally, demand is zero. Scaled nationally, it is about 60,000 kL, which needs no large refinery and has nothing to do with 6,800 kt. Showing it as a slider would imply a meaning it does not have. Use a demand-fraction slider (50%, 75%, 100%) labelled as a planner assumption, if at all.

I also refuse to use 1,088 ≈ 1,087 as evidence for 16%. It misses by 1 kt, and the model treats that as $305M.

## The 1,088 vs 1,087 step

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

## Section 10, question 1: airports as refinery candidates

**Include all four as refinery candidates only. Do not add them as depots.**
- Adding them changes nothing: same $1,562.8M and same refineries, gap 0, 19 s. [M] Leg 3 is only $38M of $1,563M.
- The value is the answer to the Q&A. Forcing the small refinery to Balikpapan airport costs **+$3.0M (0.19%)**, gap 0, 4 s. [M]
- The line for the planner: "Next to Pertamina is $3M worse, which is effectively free." Whether that land and adjacency is real is unverified.

## Section 10, question 2: hard collection or penalty

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

## Reading the MIP gap under PuLP 2.9 with HiGHS

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

## Open calls for the orchestrator

1. **Blocking: confirm H = 1 as default, with H shown as a top assumption.** It changes refinery count more than any other parameter.
2. **Confirm the changes to the brief:** split flow, 600 km prune removed, baseline with L + S, and "optimal among 27 candidates".
3. **Pitch must change:** steps 1 ("$765M refinery"), 5 (green sites), 6 (North Kalimantan).
4. **Not done:** full circuity sweep, disruption runs, and proof against all 80 refinery candidates.
