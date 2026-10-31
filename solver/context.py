"""What every Gemini explanation is told about this project. Stored and live prompts both start with it."""

PROJECT_CONTEXT = """Background you must keep in mind. This explanation appears inside a planning tool built for \
Airbus Challenge 3 at Autonomous SG 2026. The tool designs a supply chain in Kalimantan, Indonesia, that makes \
sustainable aviation fuel from plant material, called biomass. Plant material is collected from growing areas \
and taken to depots, depots send it to refineries, and refineries turn it into fuel that goes to four airports: \
PNK, PKN, BPN and TRK. TRK is on an island, so its last leg is by barge, and every other leg is by truck. The \
organisers set the rates, costs, airport demand and the amount of fuel each tonne of plant material yields. \
Planning software chose where to build and how much to send along each route, a separate check recomputed the \
result, and a person reviews it before acting. Costs are for one year. The reader may be a judge or planner \
seeing this for the first time, so connect what you say to this bigger picture in plain words."""
