// Build-time: writes web/data/sites.json (80 sites) from data/raw/. Run: npm run data:sites
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

// 11 Ketapang sites that plot in the sea (GLOBE 1 km mask), supply only.
// Source: docs/proposals/geospatial-data.md line 221 and docs/prompts/4-denzel.md line 103.
export const SEA_IDS = [3, 22, 31, 32, 37, 43, 50, 58, 62, 69, 80].map(
    (n) => `KAL_SUP_${String(n).padStart(2, '0')}`,
);

const csv = readFileSync(join(root, 'data', 'raw', 'kalimantan_80_locations_6800kt_full_range.csv'), 'utf8');
const lines = csv.trim().split(/\r?\n/);
const header = lines[0].split(',');
const col = (name) => header.indexOf(name);

const sites = lines.slice(1).map((line) => {
    const c = line.split(',');
    const id = c[col('location_id')];
    return {
        id,
        label: `${id}, ${c[col('district')]}`,
        province: c[col('province')],
        district: c[col('district')],
        lat: Number(c[col('latitude')]),
        lon: Number(c[col('longitude')]),
        kt: Number(c[col('production_kilotons')]),
        sea: SEA_IDS.includes(id),
    };
});

if (sites.length !== 80) throw new Error(`expected 80 sites, got ${sites.length}`);
const sea = sites.filter((s) => s.sea);
if (sea.length !== 11) throw new Error(`expected 11 sea sites, got ${sea.length}`);
if (sea.some((s) => s.district !== 'Ketapang')) throw new Error('a sea site is not in Ketapang');
const total = sites.reduce((a, s) => a + s.kt, 0);

writeFileSync(join(here, '..', 'data', 'sites.json'), JSON.stringify(sites, null, 1) + '\n');
console.log(`sites.json: ${sites.length} sites, ${total.toFixed(2)} kt, ${sea.length} sea (${sea.reduce((a, s) => a + s.kt, 0).toFixed(2)} kt)`);
