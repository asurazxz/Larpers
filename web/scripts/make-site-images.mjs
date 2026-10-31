// Build-time: writes web/public/sites/<site id>.jpg (80 images) from web/data/sites.json. Run: npm run data:site-images
// EOxCloudless mosaic, CC BY-NC-SA 4.0, non-commercial use only. Saved here because the map and the fallback run offline.
// The credit line is SITE_IMAGE_CREDIT in web/app/Map.tsx: keep the year there in step with LAYER.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const outDir = join(web, 'public', 'sites');

const LAYER = 's2cloudless-2025';
const WIDTH_PX = 560;
const HEIGHT_PX = 300;
// Sentinel-2 is 10 m per pixel, so this keeps the image at native resolution.
const WIDTH_KM = 5.6;
const KM_PER_DEG = 111.32;
const CONCURRENCY = 6;
const ATTEMPTS = 3;

function urlFor(site) {
    const halfLat = (WIDTH_KM * (HEIGHT_PX / WIDTH_PX)) / 2 / KM_PER_DEG;
    const halfLon = WIDTH_KM / 2 / (KM_PER_DEG * Math.cos((site.lat * Math.PI) / 180));
    const bbox = [site.lon - halfLon, site.lat - halfLat, site.lon + halfLon, site.lat + halfLat];
    const params = new URLSearchParams({
        service: 'WMS',
        request: 'GetMap',
        version: '1.1.1',
        layers: LAYER,
        styles: '',
        srs: 'EPSG:4326',
        bbox: bbox.map((v) => v.toFixed(6)).join(','),
        width: String(WIDTH_PX),
        height: String(HEIGHT_PX),
        format: 'image/jpeg',
    });
    return `https://tiles.maps.eox.at/wms?${params}`;
}

async function fetchImage(site) {
    let lastError;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
            const res = await fetch(urlFor(site), { signal: AbortSignal.timeout(30000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const bytes = Buffer.from(await res.arrayBuffer());
            // A WMS service can answer 200 with an XML error, so check for the JPEG header.
            if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('response is not a JPEG');
            return bytes;
        } catch (e) {
            lastError = e;
        }
    }
    throw new Error(`${site.id}: ${lastError.message}`);
}

const sites = JSON.parse(readFileSync(join(web, 'data', 'sites.json'), 'utf8'));
if (sites.length !== 80) throw new Error(`expected 80 sites, got ${sites.length}`);
mkdirSync(outDir, { recursive: true });

const queue = [...sites];
let total = 0;
await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length > 0) {
            const site = queue.shift();
            const bytes = await fetchImage(site);
            writeFileSync(join(outDir, `${site.id}.jpg`), bytes);
            total += bytes.length;
        }
    }),
);

console.log(`Wrote ${sites.length} images, ${(total / 1e6).toFixed(1)} MB, to ${outDir}`);
