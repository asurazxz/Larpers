# Judge Q&A

Short answers. Where a claim needs a source we have not opened, the answer says so. The base scenario uses the organisers' 12:45 update. Our earlier assumptions are one stored run, `earlier_assumptions`.

## Why not HEFA?

The challenge gives us a cost table for a lignocellulosic residue route: biomass depots, then a refinery, then airports. We took that route as given and did not compare technologies.

HEFA runs on fats and oils, and the data here is agricultural and forestry residue. Residues are not a HEFA feedstock. One source we read says waste-oil supply is limited by competition with food, but we have not tested that against Kalimantan, so we do not claim it as a finding.

We do not claim that no one else is working on this. Ethanol-to-jet plants are planned in Singapore and North Sumatra, and published work exists on palm biorefinery siting in Sumatra and Kalimantan. We could not find a SAF-specific depot-and-refinery MILP for Kalimantan with facility-removal re-planning, but our search was short.

## Why 20%?

Because the organisers set it. The 12:45 update gives 0.20 t SAF per t biomass and calls it inside the 15-25% range for biomass-to-jet routes. We follow it in the base.

- Before the update we used 15%, from CRL Energy (2009), who report 0.13 to 0.16 t of Fischer-Tropsch liquid per oven-dry tonne. That is all liquids, not kerosene alone. We did not open the source ourselves.
- We store the 15% case, with our other earlier assumptions, as the sensitivity run `earlier_assumptions`.
- The yield sweep covers 15%, 17.5%, 20%, 22.5% and 25%. We found no palm-specific or empty-fruit-bunch yield, so the sweep is there for that reason.

## Who pays?

We do not know, and the brief does not say. The objective is the organisers': annualised CapEx (CapEx over 20 years, no interest), fixed OpEx at 5% of CapEx per year, variable OpEx per tonne of biomass in, and transport, on a one-year basis.

Our user is a supply planner comparing network options. That persona is ours, not a named customer. We did not find a source for how this decision is made today, so we make no claim about spreadsheets or status quo cost.

Who funds the plants is outside the model. The 20-year, no-interest annualisation is the organisers' simplification. A real financing cost would raise the refinery share of the bill.

## Moisture and seasonality?

Neither is modelled.

- **Moisture:** the organisers ignore it, and depots lose no mass (r = 1). We treat the 6,800 kt as dry tonnes and say so. Real empty-fruit-bunch can be wet, and that would change the effective yield. We have no sourced figure, so we give none.
- **Seasonality:** the model uses annual totals. Harvest peaks, storage and inventory are not in it. A multi-period model would be the next step.

## Why would Pertamina trust this?

It should not trust it yet, and we do not ask it to. The tonnages look generated and eleven sites plot in the sea, so results show how the method behaves, not where to buy land.

What we offer instead is checkability:

- A solver makes every decision. No language model is in the decision path.
- A separate audit recomputes every result and does not import the solver.
- Each flow shows its distance, rate and cost, so a judge can multiply them.
- Status, bound and gap come from HiGHS directly. We say "optimal" only at gap 0 and only among the N candidates searched.
- Stored runs are labelled stored. Assumptions are in `docs/ASSUMPTIONS.md`.

What Pertamina would need to supply: mill-level tonnage and moisture, real road and river distances, and real barge rates.

## Where does it break?

Five places, in order of how much they matter:

1. **Mix size and solve time.** Demand is 1,200 kt of SAF, so 6,000 kt of biomass must go in. One large refinery takes 1,087 kt in, so that needs at least six large refineries. The mix space is larger than before, and solves are slower. The old yield step at 15.985% is no longer the story.
2. **Optional collection.** Which sites to skip is now a decision. Demand needs 6,000 kt of the 6,800 kt, so up to 800 kt can be left out. The solver picks it, and the stored run shows which sites it skips and what that saves.
3. **Bulungan (KAL_SUP_18 and KAL_SUP_70).** These two sites sit next to Tarakan airport and far from any other supply site. The solver either serves them or skips them. The stored run shows whether. Tarakan is an island, and the organisers price the last leg as a barge at 0.08 USD/t/km with no extra fixed cost, so we follow that.
4. **Road factor.** 1.3 is the organisers' value. Our own check on OpenStreetMap measured about 1.9, but OSM under-maps plantation tracks. We sweep 1.3, 1.6 and 1.9, and the OSRM table stays a reference check only.
5. **Candidate set.** "Optimal among N candidates" is not a proof over all sites. A better plan outside the refinery shortlist is not ruled out. We re-run the shortlist under the official objective after the freeze.

## Why is one depot per site not used?

Because it costs us the ability to say "optimal", and it buys little.

- A site is an aggregated production figure, so sending it to two depots is a fair reading of two collection zones. That is our judgement, not a sourced fact.
- In prototype testing, split flows closed the gap to 0 and one depot per site did not within a similar time. Those were prototype runs on an older shortlist, so we do not quote their figures.
- The greedy baseline uses one depot per site. So the saving we show compares split flows with a stricter rule, and we say so on the slide.
- We could not open the paper the original brief attributed this simplification to, so we do not credit it for either rule.
