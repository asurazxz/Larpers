"""Prototype 2-echelon CFLP. Throwaway. Usage: see argparse."""
import argparse, csv, json, math, sys, time
import pulp

RAW = str(__import__("pathlib").Path(__file__).resolve().parents[1] / "data" / "raw") + "/"
AP = {"PNK": None, "PKN": None, "BPN": None, "TRK": None}
SHARE = {"BPN": .445, "PNK": .398, "TRK": .095, "PKN": .062}


def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def load():
    sites = []
    for r in csv.DictReader(open(RAW + "kalimantan_80_locations_6800kt_full_range.csv")):
        sites.append((r["location_id"], float(r["production_kilotons"]), float(r["latitude"]), float(r["longitude"]), r["province"], r["district"]))
    air = {}
    for r in csv.reader(open(RAW + "airports.dat", encoding="utf-8")):
        if r[4] in AP:
            air[r[4]] = (float(r[6]), float(r[7]))
    return sites, air


def solve(yld=.16, circ=1.4, s2d=300, d2r=600, split=False, tl=60, airports_as_ref=False, strand_pen=None,
          ref_excl=(), horizon=1.0, msg=False, refs=None, gap=0.0, leg=(.10, .12, .08), tight=True, cap_in=False,
          threads=None, demand_total=None, portfolio=None, depot_cut=False, flink=False, k_near=None):
    sites, air = load()
    S = [s[0] for s in sites]
    P = {s[0]: s[1] for s in sites}
    C = {s[0]: (s[2], s[3]) for s in sites}
    A = list(air)
    Rc = dict(C)
    if airports_as_ref:
        for a in A:
            Rc["AP_" + a] = air[a]
    if refs:
        Rc = {k: v for k, v in Rc.items() if k in refs}
    for k in ref_excl:
        Rc.pop(k, None)
    d1 = {(i, j): hav(C[i], C[j]) * circ for i in S for j in S}
    d2 = {(j, k): hav(C[j], Rc[k]) * circ for j in S for k in Rc}
    d3 = {(k, a): hav(Rc[k], air[a]) * circ for k in Rc for a in A}
    a1 = [(i, j) for (i, j), v in d1.items() if v <= s2d]
    if k_near:
        keep = set()
        for i in S:
            for j in sorted(S, key=lambda j: d1[i, j])[:k_near]:
                keep.add((i, j))
        a1 = [e for e in a1 if e in keep]
    a2 = [(j, k) for (j, k), v in d2.items() if v <= d2r]
    p = pulp.LpProblem("saf", pulp.LpMinimize)
    cat = "Continuous" if split else "Binary"
    x = {e: pulp.LpVariable(f"x_{e[0]}_{e[1]}", 0, 1, cat) for e in a1}
    yd = {(j, s): pulp.LpVariable(f"yd_{j}_{s}", cat="Binary") for j in S for s in "SL"}
    yr = {(k, s): pulp.LpVariable(f"yr_{k}_{s}", cat="Binary") for k in Rc for s in "SL"}
    f = {e: pulp.LpVariable(f"f_{e[0]}_{e[1]}", 0) for e in a2}
    g = {e: pulp.LpVariable(f"g_{e[0]}_{e[1]}", 0) for e in d3}
    u = {}
    if strand_pen is not None:
        u = {i: pulp.LpVariable(f"u_{i}", 0, 1) for i in S}
    DC = {"S": 150, "L": 300}
    DX = {"S": 2.25e6, "L": 4.5e6}
    RC = {"S": 500, "L": 1087}
    RX = {"S": 480e6, "L": 765e6}
    capex = pulp.lpSum(DX[s] * v for (j, s), v in yd.items()) + pulp.lpSum(RX[s] * v for (k, s), v in yr.items())
    log1 = pulp.lpSum(1000 * leg[0] * d1[e] * P[e[0]] * v for e, v in x.items())
    log2 = pulp.lpSum(1000 * leg[1] * d2[e] * v for e, v in f.items())
    log3 = pulp.lpSum(1000 * leg[2] * d3[e] * v for e, v in g.items())
    obj = capex + horizon * (log1 + log2 + log3)
    if u:
        obj += pulp.lpSum(1000 * strand_pen * P[i] * u[i] for i in S)
    p += obj
    in_i = {i: [] for i in S}
    in_j = {j: [] for j in S}
    for (i, j), v in x.items():
        in_i[i].append(v)
        in_j[j].append((i, v))
    for i in S:
        p += pulp.lpSum(in_i[i]) + (u[i] if u else 0) == 1, f"as_{i}"
    out_j = {j: [] for j in S}
    in_k = {k: [] for k in Rc}
    for (j, k), v in f.items():
        out_j[j].append(v)
        in_k[k].append(v)
    for j in S:
        p += pulp.lpSum(P[i] * v for i, v in in_j[j]) == pulp.lpSum(out_j[j]), f"bal_{j}"
        p += pulp.lpSum(P[i] * v for i, v in in_j[j]) <= pulp.lpSum(DC[s] * yd[j, s] for s in "SL"), f"cap_{j}"
        p += pulp.lpSum(yd[j, s] for s in "SL") <= 1, f"one_{j}"
    if tight:
        for (i, j), v in x.items():
            p += v <= yd[j, "S"] + yd[j, "L"], f"t_{i}_{j}"
    out_k = {k: [] for k in Rc}
    in_a = {a: [] for a in A}
    for (k, a), v in g.items():
        out_k[k].append(v)
        in_a[a].append(v)
    for k in Rc:
        p += yld * pulp.lpSum(in_k[k]) == pulp.lpSum(out_k[k]), f"yb_{k}"
        cap_expr = pulp.lpSum(in_k[k]) if cap_in else pulp.lpSum(out_k[k])
        p += cap_expr <= pulp.lpSum(RC[s] * yr[k, s] for s in "SL"), f"rc_{k}"
        p += pulp.lpSum(yr[k, s] for s in "SL") <= 1, f"ro_{k}"
    tot = sum(P.values()) * yld
    if portfolio:
        p += pulp.lpSum(yr[k, "L"] for k in Rc) == portfolio[0], "pL"
        p += pulp.lpSum(yr[k, "S"] for k in Rc) == portfolio[1], "pS"
    if depot_cut:
        p += pulp.lpSum(yd[j, "S"] + 2 * yd[j, "L"] for j in S) >= math.ceil(sum(P.values()) / 150 - 1e-9), "dcut"
    if flink:
        for (j, k), v in f.items():
            p += v <= 300 * (yr[k, "S"] + yr[k, "L"]), f"fl_{j}_{k}"
    if u:
        # demand is what collected biomass makes; shares as fractions of collected SAF
        col = pulp.lpSum(yld * P[i] * (1 - u[i]) for i in S)
        for a in A:
            p += pulp.lpSum(in_a[a]) == SHARE[a] * col, f"dem_{a}"
    elif demand_total is not None:
        for a in A:
            p += pulp.lpSum(in_a[a]) == SHARE[a] * demand_total, f"dem_{a}"
    else:
        for a in A:
            p += pulp.lpSum(in_a[a]) == SHARE[a] * tot, f"dem_{a}"
    nv, nc = p.numVariables(), p.numConstraints()
    nb = len(yd) + len(yr) + (0 if split else len(x))
    sol = pulp.HiGHS(msg=msg, timeLimit=tl, gapRel=gap, threads=threads)
    t = time.time()
    st = p.solve(sol)
    wall = time.time() - t
    h = p.solverModel
    info = h.getInfo()
    ms = h.modelStatusToString(h.getModelStatus())
    out = {"status_pulp": pulp.LpStatus[st], "sol_status": getattr(p, "sol_status", None), "model_status": ms,
           "mip_gap": info.mip_gap, "dual_bound": info.mip_dual_bound, "primal": info.objective_function_value,
           "nodes": info.mip_node_count, "wall": round(wall, 2), "vars": nv, "cons": nc, "bin": nb,
           "a1": len(a1), "a2": len(a2)}
    try:
        val = lambda e: pulp.value(e)
        cx = val(capex)
        L = (val(log1), val(log2), val(log3))
        out.update(obj=val(p.objective), capex=cx, log=L)
        out["ref"] = sorted((k, s, round(sum((v.value() or 0) for v in out_k[k]), 1)) for (k, s), v in yr.items() if (v.value() or 0) > .5)
        dep = sorted((j, s, round(sum(P[i] * (v.value() or 0) for i, v in in_j[j]), 1)) for (j, s), v in yd.items() if (v.value() or 0) > .5)
        out["n_dep"] = len(dep)
        out["n_depL"] = sum(1 for d in dep if d[1] == "L")
        out["dep"] = dep
        splits = 0
        for i in S:
            if sum(1 for v in in_i[i] if 0.001 < (v.value() or 0) < .999) > 0:
                splits += 1
        out["sites_split"] = splits
        if u:
            out["stranded_kt"] = sum(P[i] * (u[i].value() or 0) for i in S)
            out["stranded"] = {i: round(u[i].value(), 3) for i in S if (u[i].value() or 0) > 1e-6}
        ml = max([d1[e] for e, v in x.items() if (v.value() or 0) > .001])
        out["max_leg1"] = ml
        out["mean_leg1"] = sum(d1[e] * P[e[0]] * (v.value() or 0) for e, v in x.items()) / sum(P.values())
        ml2 = [d2[e] for e, v in f.items() if (v.value() or 0) > .001]
        out["max_leg2"] = max(ml2) if ml2 else 0
        out["k2_arcs_used"] = len(ml2)
        out["g"] = sorted((e[0], e[1], round(v.value(), 1)) for e, v in g.items() if (v.value() or 0) > .01)
    except Exception as ex:
        out["err"] = repr(ex)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default="{}")
    ap.add_argument("--tag", default="run")
    a = ap.parse_args()
    kw = json.loads(a.json)
    r = solve(**kw)
    print(json.dumps({"tag": a.tag, "kw": kw, **r}, default=str))
