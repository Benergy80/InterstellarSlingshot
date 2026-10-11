// Orthographic turnarounds of every GLB in models/ → a folder (default ~/Desktop/InterstellarSlingshot-models).
//   node scripts/ortho-models.mjs [--out <dir>] [--size 1024] [--models Player,Enemy1,…] [--views front,back,left,right,top,bottom,iso]
// Serves the repo on an ephemeral port, drives headless Chrome (playwright-core, like scripts/shot.mjs) through
// tools/ortho-render.html for each model × view, and writes <out>/<Model>/<Model>-<view>.png plus a README.
import http from 'node:http';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { extname, join, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = resolve(opt('--out', join(os.homedir(), 'Desktop', 'InterstellarSlingshot-models')));
const SIZE = +opt('--size', '1024');
const VIEWS = opt('--views', 'front,back,left,right,top,bottom,iso').split(',');
let MODELS = opt('--models', '').split(',').filter(Boolean);
if (!MODELS.length) MODELS = (await readdir(join(ROOT, 'models'))).filter((f) => f.endsWith('.glb')).map((f) => basename(f, '.glb')).sort();

const pwPath = '/Users/benstagl/InterstellarSlingshot/.claude/worktrees/hybrid/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(pwPath).href);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json' };
const server = await new Promise((done) => {
    const s = http.createServer(async (req, res) => {
        try {
            const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            const f = resolve(ROOT, '.' + p);
            if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
            const data = await readFile(f);
            res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(data);
        } catch (e) { res.writeHead(404); res.end(); }
    });
    s.listen(0, '127.0.0.1', () => done(s));
});
const port = server.address().port;
await mkdir(OUT, { recursive: true });
console.log(`ortho: ${MODELS.length} models × ${VIEWS.length} views at ${SIZE}px → ${OUT}`);

const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-angle=metal', '--mute-audio', `--window-size=${SIZE},${SIZE}`]
});
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
const readme = ['Interstellar Slingshot — orthographic model turnarounds', `rendered ${new Date().toISOString()} from models/*.glb at ${SIZE}px, three.js r128, model materials, three-point light`,
    'View names say where the camera sits: front = camera on -Z looking +Z, back = camera on +Z, left = -X, right = +X, top, bottom, iso = (+X,+Y,+Z).',
    'Nose axes in the game: standard enemies -Z (front = head-on); the player ship, wingmen, Enemy1/Boss1 and Enemy8/Boss8 +Z (back = head-on).', ''];
let ok = 0, failed = 0;
for (const m of MODELS) {
    const dir = join(OUT, m); await mkdir(dir, { recursive: true });
    for (const v of VIEWS) {
        const url = `http://127.0.0.1:${port}/tools/ortho-render.html?model=${encodeURIComponent(m)}&view=${v}&size=${SIZE}`;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForFunction(() => window.__done === true, null, { timeout: 60000 });
            const err = await page.evaluate(() => window.__error || null);
            if (err) { failed++; console.log(`  ✗ ${m} ${v}: ${err}`); continue; }
            await page.screenshot({ path: join(dir, `${m}-${v}.png`), clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
            ok++;
            if (v === VIEWS[0]) { const info = await page.evaluate(() => window.__info); readme.push(`${m}: ${info.meshes} mesh(es), size ${info.size.map((x) => x.toFixed(3)).join(' × ')} (model units)`); }
        } catch (e) { failed++; console.log(`  ✗ ${m} ${v}: ${e.message}`); }
    }
    console.log(`  ✓ ${m}`);
}
await writeFile(join(OUT, 'README.txt'), readme.join('\n') + '\n');
await browser.close(); server.close();
console.log(`ortho: wrote ${ok} images, ${failed} failed → ${OUT}`);
