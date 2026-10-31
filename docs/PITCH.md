# Pitch script: 3 minutes

Every `[bundle:...]` tag is a placeholder. The lead replaces each one with the value in the final stored bundle. Do not say a number that is not in the bundle, or in the organisers' update (6,800 kt, 300 kt per airport, 1,200 kt, 6,000 kt, 20% yield, road factor 1.3).

Word rules: "solved" for a run the solver produced. "Stored" for a run read from the bundle. "Live" only for a real solve on the laptop during the demo. Persona is ours, not Airbus's.

| Time | Beat | On screen |
|---|---|---|
| 0:00-0:20 | The user and the decision | Map, base run, labelled stored |
| 0:20-0:45 | What we built | Map and cost panel |
| 0:45-1:15 | The result and the baseline | Base vs baseline |
| 1:15-1:35 | The organisers' update vs our earlier assumptions | Base vs earlier assumptions |
| 1:35-2:10 | Real solve on a new input | Laptop, run button |
| 2:10-2:40 | Where it fails: Bulungan | Bulungan arcs |
| 2:40-3:00 | What is ours and what is next | Assumptions slide |

## 0:00-0:20 The user and the decision

> A supply planner in Kalimantan has 6,800 kilotonnes of residue at 80 sites and four airports to supply, 300 kilotonnes of fuel each. They do not have to collect everything. The decision: which sites to use, where to put depots and refineries, and what the trucking will cost. Open a refinery in the wrong place and the money is spent before the first litre moves. This is our persona, not a named Airbus customer.

## 0:20-0:45 What we built

> A solver chooses the network. It is a mixed-integer model on all 80 official sites, with only the onshore sites as candidates for plants. The sites that plot in the sea off Ketapang supply but never host a plant. A separate audit recomputes every result. No language model decides anything. The run on screen is stored, and labelled stored.

## 0:45-1:15 The result and the baseline

> We use the organisers' own update: 20% yield, road factor 1.3, capacity counted in biomass going in, and one year of annualised cost, including operating cost. The solver returns [bundle:base.n_refineries] refineries and [bundle:base.n_depots] depots. Total annual cost: [bundle:base.total_horizon_usd]. The status reads: [bundle:base.status_reason].
>
> A greedy baseline, using the same haul limit and distances, costs [bundle:baseline.total_horizon_usd]. The saving is [bundle:base.saving_vs_baseline_usd]. One caveat: our solver may split a site between depots and the baseline may not. That difference is in the saving.

## 1:15-1:35 The organisers' update vs our earlier assumptions

> Before the update we chose our own numbers: lower yield, a heavier road factor, demand derived from production. We kept that as one stored run, labelled our earlier assumptions. It costs [bundle:earlier_assumptions.total_horizon_usd] on its own basis. The official base costs [bundle:base.total_horizon_usd]. The two are not the same problem, so the gap is not a saving. It shows how much the answer moves when the inputs move.

## 1:35-2:10 Real solve on a new input

Only say "live" if the API is up and the solve really runs on this laptop. If not, use the fallback line.

> Now a live solve on this laptop. Judge, name a site to remove, or a yield. [Run the scenario.] Read the solve time and status off the screen as they appear, and say whether the audit passed. If it cannot find a network, it says so plainly. We tested 20 random scenarios and one infeasible case: [bundle:stress.solved_count] solved, worst time [bundle:stress.worst_solve_seconds] seconds, worst gap [bundle:stress.worst_gap].

Fallback line, if the API is down:

> The laptop solver is not up, so what you see is stored, and the badge says stored. The command-line solve still runs on any input you name.

## 2:10-2:40 Where it fails: Bulungan

> Here is where we are least sure. Two supply sites in Bulungan sit right next to Tarakan airport and far from every other supply site. The solver either serves them at [bundle:bulungan.logistics_annual_usd] a year or skips them. The stored run shows which. Tarakan is an island, and the organisers price the last leg as a barge at the same rate as a truck, so we follow that. Pertamina can tell us whether a real barge costs that much.
>
> Also missing: moisture, seasonality, and any financing cost beyond the organisers' simple annualisation. Those are not modelled, and we say so.

## 2:40-3:00 What is ours and what is next

> The cost table and the update's rates come from Airbus, and every distance is one you can recompute. What is ours is the haul limit, the refinery shortlist, split flows and the factors in our earlier run, and the ledger lists each one. The tonnages are treated as synthetic, so results show how the method behaves, not where to buy land. Next: mill-level data and real river routes. Thank you.

## Delivery notes

- Say "Optimal among N candidates" only if the bundle status reads that way: [bundle:base.status_label]. Otherwise read the bundle's wording.
- Do not quote the older six-site prototype figures. They come from a different, smaller problem.
- Say the objective includes operating cost only once [bundle:base.opex] is filled in the stored bundle. If it is not, cut that clause.
- If a placeholder is still unfilled at 15:00, cut the sentence. Do not estimate.
- Q&A answers are in `docs/QA.md`.
