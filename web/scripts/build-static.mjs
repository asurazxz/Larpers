// Double-click fallback (Level 4): build with the solver URL blank, then copy out/ to ../fallback/.
// Stored runs only, no login, no live solve. Cross-platform: no shell-specific syntax. Run: npm run build:static
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const out = join(web, 'out');
const fallback = join(web, '..', 'fallback');

// An empty string in process.env takes precedence over web/.env.local, so the bundle carries no solver URL.
const env = {
    ...process.env,
    NEXT_PUBLIC_SOLVER_API_URL: '',
};

const nextBin = join(web, 'node_modules', 'next', 'dist', 'bin', 'next');
const res = spawnSync(process.execPath, [nextBin, 'build'], { cwd: web, env, stdio: 'inherit' });
if (res.status !== 0) {
    console.error(`next build failed (exit ${res.status})`);
    process.exit(res.status ?? 1);
}
if (!existsSync(join(out, 'index.html'))) {
    console.error('out/index.html missing after build');
    process.exit(1);
}

rmSync(fallback, { recursive: true, force: true });
cpSync(out, fallback, { recursive: true });
console.log(`Copied ${out} -> ${fallback}. Open fallback/index.html by double-click.`);
