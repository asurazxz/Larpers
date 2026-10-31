// Build-time: writes web/data/roads.json from data/reference/osm_roads.json. Run: npm run data:roads
// Offline road layer for the map: Borneo motorway, trunk, primary and secondary roads from OpenStreetMap,
// encoded polylines at 1e5 grouped by class. Display only.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const CLASSES = ['motorway', 'trunk', 'primary', 'secondary'];

const src = JSON.parse(readFileSync(join(root, 'data', 'reference', 'osm_roads.json'), 'utf8'));
const roads = {};
for (const c of CLASSES) {
    if (!Array.isArray(src.roads[c])) throw new Error(`missing road class ${c}`);
    roads[c] = src.roads[c];
}
const text = JSON.stringify(roads) + '\n';
writeFileSync(join(here, '..', 'data', 'roads.json'), text);
console.log(`roads.json: ${CLASSES.map((c) => `${c} ${roads[c].length}`).join(', ')}; ${(text.length / 1024).toFixed(0)} KB (OSM ${src.osm_base})`);
