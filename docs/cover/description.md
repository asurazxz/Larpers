# Larpers: Kalimantan SAF network planner

**Tagline:** A solver picks which biomass to collect, where to build, and what it costs to fuel four Kalimantan airports with SAF.

## Description

Kalimantan has 6,800 kt of biomass residue at 80 sites. Four airports (PNK, PKN, BPN, TRK) each need 300 kt of sustainable aviation fuel a year. Larpers models this as a two-echelon capacitated facility location MILP, solved with HiGHS through PuLP. The model decides which sites to collect from, where to open small or large depots and refineries, and how biomass and fuel move between them. It minimises annualised CapEx, fixed and variable OpEx, and transport cost, using the organisers' official parameters: 20% yield, a 1.3 road factor, and a barge for the last leg to Tarakan.

In the base case the solver opens 6 refineries and 24 depots for $894M a year. That result is optimal among 20 refinery candidates (0% gap) and 39% cheaper than a greedy baseline on the same inputs. The solver leaves 800 kt of biomass it does not need uncollected, including the isolated Bulungan sites.

A separate audit recomputes every result. In the map UI, a planner can remove a site or change an assumption and re-solve live. Every number traces back to the cost table and a distance anyone can recompute. The solver makes every decision; a language model only explains the finished plan.
