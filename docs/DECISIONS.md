# Decisions

One line per call, with the reason. Newest at the bottom.

| Time (SGT) | Decision | Reason |
|---|---|---|
| 11:30 | Airbus PDF outranks raw data, which outranks the brief | The brief mis-transcribed the PDF cost table; judges check against the PDF |
| 11:30 | Refinery→airport cost is 0.08 USD/t/km, not 0.15 | PDF p. 3, confirmed on the rendered page |
| 11:30 | Pin `pulp==2.9.0` + `highspy==1.15.1`, on Python 3.14.6 | Only Python here; tested solve works; PuLP 4.x removed the classic API |
| 11:30 | Each expert writes `docs/proposals/<role>.md`; orchestrator merges into `docs/PROPOSALS.md` | Five agents writing one file in parallel would overwrite each other |
| 11:32 | Do not lock `docs/BUILD_PLAN.md` at 11:50. Produce a proposal with visual mockups first; the build plan and build wait for team sign-off | Lead's instruction: the four-person team vets the proposal first |
| 11:39 | `web/` is not limited to a single page; it may be multi-page if necessary | Lead's instruction, amending the Full-Stack proposal |
| 11:56 | Combine JY's and Damien's solutions into one proposal, still subject to team sign-off | Lead's instruction |
| 11:57 | Login uses Google OAuth | Lead's instruction; overrides the comparison PDF's advice to keep auth off the critical path |
| 12:14 | All recommended settings in `docs/COMBINED_PROPOSAL.md` accepted | Lead's instruction |
| 12:14 | POST /api/baseline requires sign-in, like /api/solve; /api/validate stays public | Baseline uses solver compute; validation only checks a supplied result |
| 12:14 | Live "Run" solves refinery mixes in parallel with a 90 s budget; the UI timeout is 150 s | Prototype mixes took 24-54 s each, so the earlier 30 s target cannot hold |
| 12:24 | Each member installs a short skill set from `docs/prompts/`, sourced from the lead's Notion library and official repos | Lead's instruction; each skill's SKILL.md was read-only checked on GitHub, and no installer was run |
| 12:24 | `nk_excluded`, `nk_local_refinery` and `road_matrix` move to `docs/NEXT.md` | The approved `Scenario` has no field for them |
| 12:24 | 20 random scenarios plus one infeasible case are required evidence | The Judge's off-script test had no owner |
