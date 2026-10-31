# Judge Q&A

Short answers. Where a claim needs a source we have not opened, the answer says so.

## Why not HEFA?

The challenge gives us a cost table for a lignocellulosic residue route: biomass depots, then a refinery, then airports. We took that route as given and did not compare technologies.

HEFA runs on fats and oils, and the data here is agricultural and forestry residue. Residues are not a HEFA feedstock. One source we read says waste-oil supply is limited by competition with food, but we have not tested that against Kalimantan, so we do not claim it as a finding.

We do not claim that no one else is working on this. Ethanol-to-jet plants are planned in Singapore and North Sumatra, and published work exists on palm biorefinery siting in Sumatra and Kalimantan. We could not find a SAF-specific depot-and-refinery MILP for Kalimantan with facility-removal re-planning, but our search was short.

## Why 15%?

Because it is a number we can defend and it sits off the capacity step.

- The best source we found (CRL Energy, 2009) gives 0.13 to 0.16 tonnes of Fischer-Tropsch liquid per oven-dry tonne. That is all liquids, not kerosene alone, and we count all of it as SAF.
- At 15%, 6,800 kt gives 1,020 kt, which is 93.8% of one large refinery (1,087 kt).
- At 16% the same biomass gives 1,088 kt. That is 1 kt over capacity, and it forces a second refinery that costs $480M. The break-even is 15.985%.
- We store a 16% run so the step is visible. We do not claim the table was built from 16%. The refinery row also fits a standard six-tenths scaling rule, so the data cannot tell the two apart.
- We found no palm-specific or empty-fruit-bunch yield. 15% is an assumption, and the yield sweep is there for that reason.

## Who pays?

We do not know, and the PDF does not say. The objective adds one-off CapEx to logistics cost, and OpEx is "not provided".

Our user is a supply planner comparing network options. That persona is ours, not a named customer. We did not find a source for how this decision is made today, so we make no claim about spreadsheets or status quo cost.

The horizon matters here. The PDF gives no horizon, so the base case counts one year of logistics against full CapEx and shows five years beside it. A longer horizon favours more, smaller refineries. Who funds the plants is outside the model.

## Moisture and seasonality?

Neither is modelled.

- **Moisture:** neither the PDF nor the CSV states a basis. We treat the 6,800 kt as dry tonnes and say so. If it were wet empty-fruit-bunch at about 60% moisture, 15% dry would become about 6% as received. We store a 6% run to show that. The 60% figure comes from a journal paper we saw only through a search summary, so we do not cite it as fact.
- **Depot losses:** retention is 1.0 in the base. It is a parameter. No run below 1.0 is stored.
- **Seasonality:** the model uses annual totals. Harvest peaks, storage and inventory are not in it. A multi-period model would be the next step.

## Why would Pertamina trust this?

It should not trust it yet, and we do not ask it to. The tonnages look generated and eleven sites plot in the sea, so results show how the method behaves, not where to buy land.

What we offer instead is checkability:

- A solver makes every decision. No language model is in the decision path.
- A separate audit recomputes every result and does not import the solver.
- Each flow shows its distance, rate and cost, so a judge can multiply them.
- Status, bound and gap come from HiGHS directly. We say "optimal" only at gap 0 and only among the N candidates searched.
- Stored runs are labelled stored. Assumptions are in `docs/ASSUMPTIONS.md`.

What Pertamina would need to supply: mill-level tonnage and moisture, real road and river distances, barge rates, and OpEx.

## Where does it break?

Five places, in order of how much they matter:

1. **Bulungan (KAL_SUP_18 and KAL_SUP_70).** 189 kt sits 88 and 57 km from Tarakan airport. The nearest other supply site is 304 km away in a straight line. The network trucks it a long way south, then ships SAF back. We price a truck leg where the real access to Tarakan includes a ferry, and one source for that ferry is not yet confirmed by a second.
2. **The capacity step.** 1 kt of yield flips the answer by $480M of CapEx. The step is real in the table and not a yield anyone has measured.
3. **Road factor.** 1.9 is measured on OpenStreetMap, which under-maps plantation tracks. It may run high on short legs. We sweep 1.4, 1.9 and 2.3.
4. **Demand.** Full production is about 1 Mt of SAF, which is probably several times what four regional airports use. We label it a gateway scenario. We have no ports, so we do not model export.
5. **Candidate set.** "Optimal among N candidates" is not a proof over all 80 sites. A better plan outside the refinery shortlist is not ruled out, and we have not yet bounded the gap on the final shortlist.

## Why is one depot per site not used?

Because it costs us the ability to say "optimal", and it buys little.

- A site is an aggregated production figure, so sending it to two depots is a fair reading of two collection zones. That is our judgement, not a sourced fact.
- In prototype testing, split flows closed the gap to 0 and one depot per site did not within a similar time. Those were prototype runs on an older shortlist, so we do not quote their figures.
- The greedy baseline uses one depot per site. So the saving we show compares split flows with a stricter rule, and we say so on the slide.
- We could not open the paper the original brief attributed this simplification to, so we do not credit it for either rule.
