"""Cover image: the stored base network on Borneo, drawn from web/data/bundle.json.

Writes docs/cover/cover.html; render it to PNG with a headless browser at 1920x1080.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "cover.html"

W, H = 1920, 1080
# Map viewport (lon/lat window) and where it sits on the canvas.
LON0, LON1, LAT0, LAT1 = 108.6, 119.4, -4.4, 4.6
MX0, MY0, MX1, MY1 = 800, 10, 1880, 1000
SCALE = min((MX1 - MX0) / (LON1 - LON0), (MY1 - MY0) / (LAT1 - LAT0))
OX = MX0 + ((MX1 - MX0) - SCALE * (LON1 - LON0)) / 2
OY = MY0 + ((MY1 - MY0) - SCALE * (LAT1 - LAT0)) / 2

LEG = {"supply_depot": "#34d399", "depot_refinery": "#fbbf24", "refinery_airport": "#22d3ee"}


def xy(lon, lat):
    return OX + (lon - LON0) * SCALE, OY + (LAT1 - lat) * SCALE


def land_path(geo):
    parts = []
    for feature in geo["features"]:
        for polygon in feature["geometry"]["coordinates"]:
            for ring in polygon:
                pts = [xy(lon, lat) for lon, lat in ring]
                parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
    return "".join(parts)


def arc(a, b, bend):
    (x1, y1), (x2, y2) = a, b
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    dx, dy = x2 - x1, y2 - y1
    return f"M{x1:.1f},{y1:.1f}Q{mx - dy * bend:.1f},{my + dx * bend:.1f} {x2:.1f},{y2:.1f}"


def main():
    bundle = json.loads((ROOT / "web/data/bundle.json").read_text(encoding="utf-8"))
    sites = json.loads((ROOT / "web/data/sites.json").read_text(encoding="utf-8"))
    geo = json.loads((ROOT / "web/data/borneo.json").read_text(encoding="utf-8"))
    s = bundle["runs"]["base"]["solution"]

    stranded = {r["site_id"] for r in s["stranded"]}
    svg = [f'<clipPath id="map"><rect x="560" y="0" width="{W - 560}" height="{H}"/></clipPath>',
           f'<path d="{land_path(geo)}" class="land" clip-path="url(#map)"/>']

    # Faint graticule over the map area.
    for lon in range(110, 120, 2):
        (x, _), (_, y0), (_, y1) = xy(lon, 0), xy(lon, LAT1), xy(lon, LAT0)
        svg.append(f'<line x1="{x:.1f}" y1="{y0:.1f}" x2="{x:.1f}" y2="{y1:.1f}" class="grat"/>')
    for lat in range(-4, 5, 2):
        (_, y), (x0, _), (x1, _) = xy(0, lat), xy(LON0 + 1.4, 0), xy(LON1, 0)
        svg.append(f'<line x1="{x0:.1f}" y1="{y:.1f}" x2="{x1:.1f}" y2="{y:.1f}" class="grat"/>')

    max_kt = max(f["kt"] for f in s["flows"])
    for leg, width, glow, bend in (("supply_depot", 2.2, 0, 0.0), ("depot_refinery", 3.4, 1, 0.12),
                                   ("refinery_airport", 4.2, 1, 0.16)):
        for f in s["flows"]:
            if f["leg"] != leg:
                continue
            a, b = xy(f["from_lon"], f["from_lat"]), xy(f["to_lon"], f["to_lat"])
            w = width * (0.55 + 0.9 * (f["kt"] / max_kt) ** 0.5)
            dash = ' stroke-dasharray="10 8"' if f["to"] == "TRK" and leg == "refinery_airport" else ""
            d = arc(a, b, bend)
            if glow:
                svg.append(f'<path d="{d}" stroke="{LEG[leg]}" stroke-width="{w * 3.2:.1f}" class="glow"{dash}/>')
            svg.append(f'<path d="{d}" stroke="{LEG[leg]}" stroke-width="{w:.1f}" class="flow"{dash}/>')

    for site in sites:
        x, y = xy(site["lon"], site["lat"])
        r = 2.6 + site["kt"] / 36
        cls = "site-off" if site["id"] in stranded else "site"
        svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" class="{cls}"/>')

    for f in s["facilities"]:
        x, y = xy(f["lon"], f["lat"])
        if f["type"] == "depot":
            r = 8 if f["size"] == "large" else 6
            svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" class="depot"/>')
        else:
            svg.append(f'<rect x="{x - 26:.1f}" y="{y - 26:.1f}" width="52" height="52" rx="12" class="ref-glow"/>')
            svg.append(f'<rect x="{x - 11:.1f}" y="{y - 11:.1f}" width="22" height="22" rx="5" class="refinery"/>')

    airports = {}
    for f in s["flows"]:
        if f["leg"] == "refinery_airport":
            airports[f["to"]] = (f["to_lon"], f["to_lat"])
    offsets = {"PNK": (-30, -22, "end"), "PKN": (-26, 46, "end"), "BPN": (30, 10, "start"), "TRK": (30, 10, "start")}
    for code, (lon, lat) in airports.items():
        x, y = xy(lon, lat)
        dx, dy, anchor = offsets.get(code, (24, 8, "start"))
        svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="26" class="ap-halo"/>')
        svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11" class="airport"/>')
        svg.append(f'<text x="{x + dx:.1f}" y="{y + dy:.1f}" text-anchor="{anchor}" class="ap-label">{code}</text>')

    n_ref = sum(f["type"] == "refinery" for f in s["facilities"])
    n_dep = sum(f["type"] == "depot" for f in s["facilities"])
    total_m = s["total_annual_usd"] / 1e6
    gap = s["gap"]

    # Greedy baseline on the organisers' annual basis, as web/lib/annual.ts recomputes it.
    bl = bundle["runs"]["baseline"]["solution"]
    var = {"depot": {"small": 5, "large": 4}, "refinery": {"small": 60, "large": 55}}
    bl_var = sum(f["throughput_kt"] * 1000 * var[f["type"]][f["size"]] for f in bl["facilities"])
    bl_total = bl["capex_usd"] / 20 + bl["capex_usd"] * 0.05 + bl_var + bl["logistics_annual_usd"]
    saving_pct = 100 * (bl_total - s["total_annual_usd"]) / bl_total
    assert gap == 0 and all(f["capacity_basis"] == "biomass_in" for f in bl["facilities"])

    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Larpers cover</title>
<style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:#06121d}}
body{{font-family:'Segoe UI Variable Display','Segoe UI',Inter,system-ui,sans-serif;color:#e8f1f8}}
.fade{{position:absolute;inset:0;background:linear-gradient(90deg,#06121d 0%,rgba(6,18,29,.9) 33%,rgba(6,18,29,0) 44%)}}
.bg{{position:absolute;inset:0;background:
  radial-gradient(900px 700px at 70% 62%,rgba(20,184,166,.16),transparent 70%),
  radial-gradient(700px 500px at 10% 100%,rgba(14,165,198,.12),transparent 70%),
  linear-gradient(135deg,#0f2a3d 0%,#071521 55%,#050e17 100%)}}
svg{{position:absolute;inset:0}}
.land{{fill:#123247;stroke:#2b5874;stroke-width:1.4;fill-rule:evenodd}}
.grat{{stroke:#9fd3ea;stroke-opacity:.06;stroke-width:1}}
.flow{{fill:none;stroke-linecap:round;stroke-opacity:.92}}
.glow{{fill:none;stroke-linecap:round;stroke-opacity:.14}}
.site{{fill:#a7f3d0;fill-opacity:.85}}
.site-off{{fill:none;stroke:#7d93a6;stroke-width:1.6;stroke-opacity:.7}}
.depot{{fill:#fbbf24;stroke:#071521;stroke-width:2.5}}
.refinery{{fill:#22d3ee;stroke:#071521;stroke-width:3}}
.ref-glow{{fill:#22d3ee;fill-opacity:.16}}
.airport{{fill:#ffffff;stroke:#071521;stroke-width:3}}
.ap-halo{{fill:none;stroke:#ffffff;stroke-opacity:.35;stroke-width:2}}
.ap-label{{fill:#ffffff;font-size:30px;font-weight:700;letter-spacing:.06em;paint-order:stroke;stroke:#071521;stroke-width:6px}}
.panel{{position:absolute;left:96px;top:88px;width:640px}}
.brand{{display:flex;align-items:center;gap:18px;font-size:30px;font-weight:700;letter-spacing:.02em}}
.brand svg{{position:static}}
.event{{margin-top:48px;font-size:22px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#5eead4}}
h1{{margin:18px 0 0;font-size:84px;line-height:1.02;font-weight:750;letter-spacing:-.025em}}
h1 span{{background:linear-gradient(90deg,#34d399,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}}
.lede{{margin-top:26px;font-size:28px;line-height:1.42;color:#b6c8d6}}
.stats{{margin-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:18px}}
.stat{{padding:20px 24px;border-radius:18px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)}}
.stat b{{display:block;font-size:44px;font-weight:700;letter-spacing:-.02em;color:#fff}}
.stat i{{font-style:normal;font-size:20px;color:#8fa6b8}}
.legend{{position:absolute;right:40px;bottom:30px;display:flex;align-items:center;gap:26px;font-size:19px;color:#a9bccb}}
.legend span{{display:flex;align-items:center;gap:10px}}
.legend em{{display:inline-block;width:34px;height:6px;border-radius:3px}}
</style></head><body>
<div class="bg"></div>
<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}">{''.join(svg)}</svg>
<div class="fade"></div>
<div class="panel">
  <div class="brand">
    <svg width="58" height="58" viewBox="0 0 64 64"><defs><linearGradient id="lf" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#2dd4bf"/></linearGradient></defs>
    <rect width="64" height="64" rx="15" fill="#0f2a3d" stroke="#2b5874"/><path d="M13 51C13 29 27 14 52 12C51 37 37 51 13 51Z" fill="url(#lf)"/>
    <path d="M17 47L27 37L37 33L47 18" fill="none" stroke="#071521" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="17" cy="47" r="4" fill="#fff"/><circle cx="32" cy="35" r="3.4" fill="#f59e0b" stroke="#071521" stroke-width="1.5"/>
    <rect x="43.5" y="14.5" width="7" height="7" rx="1.6" fill="#22d3ee" stroke="#071521" stroke-width="1.5"/></svg>
    Larpers
  </div>
  <div class="event">Autonomous SG 2026 · Airbus Challenge #3</div>
  <h1>Kalimantan<br><span>SAF network</span><br>planner</h1>
  <div class="lede">A mixed-integer solver picks which of 80 biomass sites to collect, where to build depots and refineries, and how fuel reaches four airports.</div>
  <div class="stats">
    <div class="stat"><b>1,200 kt</b><i>SAF a year, 300 kt per airport</i></div>
    <div class="stat"><b>{n_ref} + {n_dep}</b><i>refineries + depots chosen</i></div>
    <div class="stat"><b>${total_m:,.0f}M/yr</b><i>total cost, optimal (0% gap)</i></div>
    <div class="stat"><b>{saving_pct:.0f}% cheaper</b><i>than a greedy baseline</i></div>
  </div>
</div>
<div class="legend">
  <span><em style="background:{LEG['supply_depot']}"></em>Biomass to depot</span>
  <span><em style="background:{LEG['depot_refinery']}"></em>Depot to refinery</span>
  <span><em style="background:{LEG['refinery_airport']}"></em>SAF to airport</span>
  <span><em style="background:repeating-linear-gradient(90deg,{LEG['refinery_airport']} 0 8px,transparent 8px 13px)"></em>SAF to Tarakan (barge)</span>
  <span><em style="background:#fbbf24;width:14px;height:14px;border-radius:7px;margin:0 10px"></em>Depot</span>
  <span><em style="background:#22d3ee;width:18px;height:18px;border-radius:5px;margin:0 8px"></em>Refinery</span>
  <span><em style="border:1.6px solid #7d93a6;width:12px;height:12px;border-radius:7px;margin:0 10px;background:none"></em>Site not collected</span>
</div>
</body></html>
"""
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT}: {n_ref} refineries, {n_dep} depots, ${total_m:,.1f}M/yr, {saving_pct:.1f}% below baseline")


if __name__ == "__main__":
    main()
