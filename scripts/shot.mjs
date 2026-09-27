#!/usr/bin/env node
// =============================================================================
// SHOT — boot a build of the game in headless Chrome (real GPU via ANGLE/Metal)
// and capture screenshots, so two builds can be compared side by side.
//
//   node scripts/shot.mjs --root <dir> --out <dir> [options]
//
//   --root <dir>     build to serve (default: this repo). Served no-store on an
//                    ephemeral port, so there is never a stale-cache question.
//   --out <dir>      where PNGs land (created if missing)
//   --name <prefix>  filename prefix (default: shot)
//   --mode demo|play demo = click DEMO MODE (autopilot), play = PRESS TO LAUNCH
//   --shots 8,20,45  seconds AFTER the game starts at which to capture
//   --eval <file>    JS file evaluated in the page before EACH capture (stage a
//                    scene: move the camera, spawn something, pause…). It runs as
//                    the body of an async function with `t` (seconds) in scope.
//   --settle <ms>    wait after --eval before capturing (default 400)
//   --canvas         capture the WebGL canvas only (no DOM HUD)
//   --size 1600x900  viewport (default 1600x900)
//   --hold <s>       keep the page alive this long after the last shot
//   --hy k:v,k:v     flip hybrid switches for this run (appends ?hy=…)
//
// Prints BUILD_TAG, console/page errors and window.__selftest failures.
// Exit code 1 if the page threw an uncaught error.
// =============================================================================
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const HERE = fileURLToPath(new URL('..', import.meta.url));

// playwright-core lives in node_modules of whichever checkout has it installed.
const PW_CANDIDATES = [
    join(HERE, 'node_modules/playwright-core/index.mjs'),
    '/Users/benstagl/InterstellarSlingshot/.claude/worktrees/hybrid/node_modules/playwright-core/index.mjs',
    '/Users/benstagl/InterstellarSlingshot/node_modules/playwright-core/index.mjs',
];
const pwPath = PW_CANDIDATES.find(existsSync);
if (!pwPath) { console.error('shot: playwright-core not found — run npm ci'); process.exit(2); }
const { chromium } = await import(pathToFileURL(pwPath).href);

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);

const ROOT = resolve(opt('root', HERE));
const OUT = resolve(opt('out', join(HERE, '.critic/shots')));
const NAME = opt('name', 'shot');
const MODE = opt('mode', 'demo');
const SHOTS = String(opt('shots', '10,25')).split(',').map(Number).filter((n) => n >= 0).sort((a, b) => a - b);
const EVAL = opt('eval', null);
const SETTLE = Number(opt('settle', 400));
const HOLD = Number(opt('hold', 0));
const HY = opt('hy', null);   // hybrid switches for this run, e.g. --hy explosions:original,shields:blend
const [W, H] = String(opt('size', '1600x900')).split('x').map(Number);
const CANVAS_ONLY = flag('canvas');

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.json': 'application/json',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const server = await new Promise((done) => {
    const s = http.createServer(async (req, res) => {
        try {
            const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            let rel = normalize(urlPath).replace(/^([/\\.])+/, '');
            if (rel === '') rel = 'index.html';
            const data = await readFile(join(ROOT, rel));
            res.writeHead(200, {
                'Content-Type': MIME[extname(rel).toLowerCase()] || 'application/octet-stream',
                'Cache-Control': 'no-store, max-age=0',
            });
            res.end(data);
        } catch {
            res.writeHead(404); res.end('not found');
        }
    });
    s.listen(0, '127.0.0.1', () => done(s));
});
const port = server.address().port;
await mkdir(OUT, { recursive: true });
console.log(`shot: serving ${ROOT} on :${port} → ${OUT}`);

const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));

let code = 0;
try {
    await page.goto(`http://127.0.0.1:${port}/index.html${HY ? '?hy=' + encodeURIComponent(HY) : ''}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const btnSel = MODE === 'play' ? '#introStartBtn, #introLaunchBtn, #introPlayBtn' : '#introDemoBtn';
    await page.waitForSelector('#introDemoBtn', { timeout: 120000 });
    console.log('shot: BUILD_TAG', await page.evaluate(() => window.BUILD_TAG));
    const btn = await page.$(btnSel);
    if (btn) await btn.click();
    else {
        // Fall back to the first visible launch-screen button that is not the demo button.
        const clicked = await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => x.id !== 'introDemoBtn' && x.offsetParent && /launch|start|play/i.test(x.textContent));
            if (b) { b.click(); return b.id || b.textContent.trim(); }
            return null;
        });
        console.log('shot: launch button fallback →', clicked);
    }
    await page.waitForFunction(
        () => typeof gameState !== 'undefined' && gameState.gameStarted && gameState.frameCount > 60,
        null, { timeout: 120000 },
    );
    const t0 = Date.now();
    const evalSrc = EVAL ? await readFile(resolve(EVAL), 'utf8') : null;
    for (const t of SHOTS) {
        const wait = t * 1000 - (Date.now() - t0);
        if (wait > 0) await page.waitForTimeout(wait);
        if (evalSrc) {
            const r = await page.evaluate(`(async (t) => { ${evalSrc}\n })(${t})`).catch((e) => 'EVAL ERROR ' + e.message);
            if (r !== undefined) console.log(`shot: eval@${t}s →`, typeof r === 'string' ? r : JSON.stringify(r));
            await page.waitForTimeout(SETTLE);
        }
        const file = join(OUT, `${NAME}-${String(t).padStart(3, '0')}s.png`);
        if (CANVAS_ONLY) {
            const c = await page.$('#gameCanvas') || await page.$('canvas');
            await c.screenshot({ path: file });
        } else {
            await page.screenshot({ path: file });
        }
        console.log('shot: wrote', file);
    }
    if (HOLD > 0) await page.waitForTimeout(HOLD * 1000);
    const st = await page.evaluate(() => {
        const out = { frame: gameState.frameCount, paused: !!gameState.paused };
        try { out.fails = window.__selftest ? window.__selftest.fails() : 'no probe'; } catch (e) { out.fails = 'probe error ' + e.message; }
        try { out.fps = window.__perf && window.__perf.fps ? Math.round(window.__perf.fps) : undefined; } catch (e) { /* perf meter optional */ }
        return out;
    });
    console.log('shot: state', JSON.stringify(st));
} catch (e) {
    console.error('shot: FAILED', e.message);
    code = 1;
} finally {
    console.log(`shot: console errors ${errs.length}`, JSON.stringify(errs.slice(0, 10)));
    console.log(`shot: page errors ${pageErrors.length}`, JSON.stringify(pageErrors.slice(0, 10)));
    if (pageErrors.length) code = 1;
    await browser.close();
    server.close();
}
process.exit(code);
