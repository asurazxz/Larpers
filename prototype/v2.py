"""Throwaway check of the updated suggestions on the real 80 sites. Not repo code."""
import argparse, json, math, sys, time
import pulp
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from m import hav, load

SEA = {f"KAL_SUP_{n}" for n in ("03", "22", "31", "32", "37", "43", "50", "58", "62", "69", "80")}
SHARE = {"BPN": .558, "PNK": .317, "TRK": .075, "PKN": .050}
SHORT = ["02", "06", "07", "13", "15", "16", "24", "25", "28", "33", "35", "38", "41", "42", "44", "45", "48", "49",
         "51", "54", "59", "64", "70", "71", "77"]
REFS = [f"KAL_SUP_{n}" for n in SHORT]
RATE = (.10, .12, .08)
HAUL_HAV_KM = 300 / 1.4


def solve(yld=.15, circ=1.9, H=1, portfolio=(1, 0), collect="all", demand=None, tl=80, threads=2):
    sites, air = load()
    S = [s[0] for s in sites]
    P = {s[0]: s[1] for s in sites}
    C = {s[0]: (s[2], s[3]) for s in sites}
    Dc = [i for i in S if i not in SEA]
    Rc = {k: C[k] for k in REFS}
    Rc.update({"AP_" + a: air[a] for a in air})
    A = list(air)
    h1 = {(i, j): hav(C[i], C[j]) for i in S for j in Dc}
    a1 = [e for e, v in h1.items() if v <= HAUL_HAV_KM]
    d1 = {e: h1[e] * circ for e in a1}
    d2 = {(j, k): hav(C[j], Rc[k]) * circ for j in Dc for k in Rc}
    d3 = {(k, a): hav(Rc[k], air[a]) * circ for k in Rc for a in A}
    p = pulp.LpProblem("saf", pulp.LpMinimize)
    x = {e: pulp.LpVariable(f"x_{e[0]}_{e[1]}", 0, 1) for e in a1}
    yd = {(j, s): pulp.LpVariable(f"yd_{j}_{s}", cat="Binary") for j in Dc for s in "SL"}
    yr = {(k, s): pulp.LpVariable(f"yr_{k}_{s}", cat="Binary") for k in Rc for s in "SL"}
    f = {e: pulp.LpVariable(f"f_{e[0]}_{e[1]}", 0) for e in d2}
    g = {e: pulp.LpVariable(f"g_{e[0]}_{e[1]}", 0) for e in d3}
    DC, DX = {"S": 150, "L": 300}, {"S": 2.25e6, "L": 4.5e6}
    RC, RX = {"S": 500, "L": 1087}, {"S": 480e6, "L": 765e6}
    capex = pulp.lpSum(DX[s] * v for (j, s), v in yd.items()) + pulp.lpSum(RX[s] * v for (k, s), v in yr.items())
    log1 = pulp.lpSum(1000 * RATE[0] * d1[e] * P[e[0]] * v for e, v in x.items())
    log2 = pulp.lpSum(1000 * RATE[1] * d2[e] * v for e, v in f.items())
    log3 = pulp.lpSum(1000 * RATE[2] * d3[e] * v for e, v in g.items())
    p += capex + H * (log1 + log2 + log3)
    for i in S:
        out = pulp.lpSum(v for e, v in x.items() if e[0] == i)
        p += (out == 1 if collect == "all" else out <= 1), f"col_{i}"
    for j in Dc:
        inflow = pulp.lpSum(P[e[0]] * v for e, v in x.items() if e[1] == j)
        p += inflow == pulp.lpSum(f[j, k] for k in Rc), f"bal_{j}"
        p += inflow <= pulp.lpSum(DC[s] * yd[j, s] for s in "SL"), f"cap_{j}"
        p += pulp.lpSum(yd[j, s] for s in "SL") <= 1, f"one_{j}"
    for e, v in x.items():
        p += v <= yd[e[1], "S"] + yd[e[1], "L"], f"t_{e[0]}_{e[1]}"
    for (j, k), v in f.items():
        p += v <= 300 * (yr[k, "S"] + yr[k, "L"]), f"fl_{j}_{k}"
    for k in Rc:
        out = pulp.lpSum(g[k, a] for a in A)
        p += yld * pulp.lpSum(f[j, k] for j in Dc) == out, f"yb_{k}"
        p += out <= pulp.lpSum(RC[s] * yr[k, s] for s in "SL"), f"rc_{k}"
        p += pulp.lpSum(yr[k, s] for s in "SL") <= 1, f"ro_{k}"
    total = demand if demand is not None else sum(P.values()) * yld
    for a in A:
        p += pulp.lpSum(g[k, a] for k in Rc) == SHARE[a] * total, f"dem_{a}"
    p += pulp.lpSum(yr[k, "L"] for k in Rc) == portfolio[0], "pL"
    p += pulp.lpSum(yr[k, "S"] for k in Rc) == portfolio[1], "pS"
    if collect == "all":
        p += pulp.lpSum(yd[j, "S"] + 2 * yd[j, "L"] for j in Dc) >= 46, "dcut"
    t = time.time()
    p.solve(pulp.HiGHS(msg=False, timeLimit=tl, gapRel=0.0, threads=threads))
    h = p.solverModel
    info = h.getInfo()
    status = h.modelStatusToString(h.getModelStatus())
    out = {"model_status": status, "sol_status": p.sol_status, "gap": info.mip_gap, "bound": info.mip_dual_bound,
           "wall": round(time.time() - t, 1)}
    if p.sol_status not in (1, 2):
        return out
    v = pulp.value
    used = {i: P[i] * sum(w.value() or 0 for e, w in x.items() if e[0] == i) for i in S}
    # Recompute from flows, independent of the objective expression
    cap = sum(DX[s] for (j, s), w in yd.items() if (w.value() or 0) > .5) + sum(RX[s] for (k, s), w in yr.items() if (w.value() or 0) > .5)
    l1 = sum(1000 * RATE[0] * d1[e] * P[e[0]] * (w.value() or 0) for e, w in x.items())
    l2 = sum(1000 * RATE[1] * d2[e] * (w.value() or 0) for e, w in f.items())
    l3 = sum(1000 * RATE[2] * d3[e] * (w.value() or 0) for e, w in g.items())
    saf = sum(w.value() or 0 for w in g.values())
    bio = sum(w.value() or 0 for w in f.values())
    ref = sorted((k, s, round(sum(g[k, a].value() or 0 for a in A), 1)) for (k, s), w in yr.items() if (w.value() or 0) > .5)
    dep = [(j, s) for (j, s), w in yd.items() if (w.value() or 0) > .5]
    prov = {s[0]: s[5] for s in sites}
    out.update(total_M=round((cap + H * (l1 + l2 + l3)) / 1e6, 1), obj_M=round(v(p.objective) / 1e6, 1),
               capex_M=round(cap / 1e6, 1), logistics_M=round((l1 + l2 + l3) / 1e6, 1),
               legs_M=[round(q / 1e6, 1) for q in (l1, l2, l3)], refineries=ref,
               districts=sorted({prov.get(k, k) for k, _, _ in ref}), depots=len(dep),
               biomass_used=round(sum(used.values()), 2), unused=round(sum(P.values()) - sum(used.values()), 2),
               saf=round(saf, 2), residual_yield=round(abs(saf - yld * bio), 6),
               bulungan_used=round(used["KAL_SUP_18"] + used["KAL_SUP_70"], 1))
    return out


def baseline(yld=.15, circ=1.9, H=1):
    """Greedy, feasible, same inputs: nearest depots, L at the site nearest the centroid."""
    sites, air = load()
    S = [s[0] for s in sites]
    P = {s[0]: s[1] for s in sites}
    C = {s[0]: (s[2], s[3]) for s in sites}
    tot = sum(P.values())
    cen = (sum(P[i] * C[i][0] for i in S) / tot, sum(P[i] * C[i][1] for i in S) / tot)
    onshore = [i for i in S if i not in SEA]
    near = min(onshore, key=lambda i: hav(C[i], cen))
    un, dep = set(S), {}
    for seed in sorted(onshore, key=lambda i: -P[i]):
        if seed not in un:
            continue
        mem, load_ = [seed], P[seed]
        un.remove(seed)
        for i in sorted(un, key=lambda i: hav(C[seed], C[i])):
            if hav(C[seed], C[i]) <= HAUL_HAV_KM and load_ + P[i] <= 300:
                mem.append(i)
                load_ += P[i]
                un.remove(i)
        dep[seed] = (mem, load_)
    for i in sorted(un):  # offshore leftovers join the nearest depot with room
        room = [j for j, (m, l) in dep.items() if l + P[i] <= 300 and hav(C[i], C[j]) <= HAUL_HAV_KM]
        if room:
            j = min(room, key=lambda j: hav(C[i], C[j]))
            dep[j][0].append(i)
            dep[j] = (dep[j][0], dep[j][1] + P[i])
        else:
            j = min((j for j in onshore if j not in dep), key=lambda j: hav(C[i], C[j]))
            dep[j] = ([i], P[i])
    l1 = sum(1000 * RATE[0] * P[i] * hav(C[i], C[j]) * circ for j, (m, _) in dep.items() for i in m)
    l2 = sum(1000 * RATE[1] * l * hav(C[j], C[near]) * circ for j, (_, l) in dep.items())
    l3 = sum(1000 * RATE[2] * SHARE[a] * tot * yld * hav(C[near], air[a]) * circ for a in air)
    cap = sum(2.25e6 if l <= 150 else 4.5e6 for _, l in dep.values()) + 765e6
    return {"refinery": near, "depots": len(dep), "capex_M": round(cap / 1e6, 1),
            "logistics_M": round((l1 + l2 + l3) / 1e6, 1), "total_M": round((cap + H * (l1 + l2 + l3)) / 1e6, 1)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag")
    ap.add_argument("--json", default="{}")
    a = ap.parse_args()
    print(json.dumps({"tag": a.tag, **solve(**json.loads(a.json))}, default=str))
