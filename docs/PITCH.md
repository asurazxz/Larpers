# Pitch script: 3 minutes

Every `[bundle:...]` tag is a placeholder. The lead replaces each one with the value in the final stored bundle. Do not say a number that is not in the bundle.

Word rules: "solved" for a run the solver produced. "Stored" for a run read from the bundle. "Live" only for a real solve on the laptop during the demo. Persona and demand are ours, not Airbus's.

| Time | Beat | On screen |
|---|---|---|
| 0:00-0:20 | The user and the decision | Map, base run, labelled stored |
| 0:20-0:45 | What we built | Map and cost panel |
| 0:45-1:15 | The result and the baseline | Base vs baseline |
| 1:15-1:35 | The step in the table | Yield 15% vs 16% |
| 1:35-2:10 | Real solve on a new input | Laptop, run button |
| 2:10-2:40 | Where it fails: Bulungan | Bulungan arcs |
| 2:40-3:00 | What is ours and what is next | Assumptions slide |

## 0:00-0:20 The user and the decision

> A supply planner in Kalimantan has 6,800 kilotonnes of residue at 80 sites and four airports to supply. The decision: where to put depots and refineries, and what the trucking will cost. Open a refinery in the wrong place and the money is spent before the first litre moves. This is our persona, not a named Airbus customer.

## 0:20-0:45 What we built

> A solver chooses the network. It is a mixed-integer model on all 80 official sites, with 69 onshore candidates for plants. Eleven sites plot in the sea off Ketapang, so they supply but never host a plant. A separate audit recomputes every result. No language model decides anything. The run on screen is stored, and labelled stored.

## 0:45-1:15 The result and the baseline

> At 15% yield and a road factor of 1.9, one year of logistics, the solver returns [bundle:base.n_refineries] refineries and [bundle:base.n_depots] depots. Total cost: [bundle:base.total_horizon_usd]. The status reads: [bundle:base.status_reason].
>
> A greedy baseline, using the same haul limit and distances, costs [bundle:baseline.total_horizon_usd]. The saving is [bundle:base.saving_vs_baseline_usd]. One caveat: our solver may split a site between depots and the baseline may not. That difference is in the saving.
>
> Five years of logistics shown beside it: [bundle:h5.total_horizon_usd], with [bundle:h5.n_refineries] refineries. The horizon changes the answer, and the Airbus brief does not set one.

## 1:15-1:35 The step in the table

> Check this on a phone. Six thousand eight hundred times 16% is 1,088. The large refinery holds 1,087. One kilotonne over, and the table forces a second plant that costs $480M. We run 15%, which has headroom, and store the 16% run so you can see the step. The solved 16% network costs [bundle:yield16.total_horizon_usd].

## 1:35-2:10 Real solve on a new input

Only say "live" if the API is up and the solve really runs on this laptop. If not, use the fallback line.

> Now a live solve on this laptop. Judge, name a site to remove, or a yield. [Run the scenario.] Read the solve time and status off the screen as they appear, and say whether the audit passed. If it cannot find a network, it says so plainly. We tested 20 random scenarios and one infeasible case: [bundle:stress.solved_count] solved, worst time [bundle:stress.worst_solve_seconds] seconds, worst gap [bundle:stress.worst_gap].

Fallback line, if the API is down:

> The laptop solver is not up, so what you see is stored, and the badge says stored. The command-line solve still runs on any input you name.

## 2:10-2:40 Where it fails: Bulungan

> Here is where we are wrong. Two supply sites in Bulungan hold 189 kilotonnes. They sit 88 and 57 kilometres from Tarakan airport. The next supply site is more than 300 kilometres away. So the network trucks that biomass about [bundle:base.bulungan_haul_km] kilometres south, at a cost of [bundle:base.bulungan_cost_usd], past the airport it could serve. We have no barge rate and no port, so we cannot test the better answer. Pertamina can tell us whether a barge beats the truck.
>
> Also missing: OpEx, moisture, seasonality. Those are not modelled, and we say so.

## 2:40-3:00 What is ours and what is next

> Every cost on the map comes from the Airbus table and a distance you can recompute. Yield, road factor, demand split, horizon and haul limit are our assumptions, and the ledger lists each one. The tonnages are treated as synthetic, so results show how the method behaves, not where to buy land. Next: mill-level data and real river routes. Thank you.

## Delivery notes

- Say "Optimal among N candidates" only if the bundle status reads that way: [bundle:base.status_label]. Otherwise read the bundle's wording.
- Do not quote the older six-site prototype figures. They come from a different, smaller problem.
- If a placeholder is still unfilled at 15:00, cut the sentence. Do not estimate.
- Q&A answers are in `docs/QA.md`.
