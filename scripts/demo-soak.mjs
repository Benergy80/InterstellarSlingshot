#!/usr/bin/env node
// =============================================================================
// DEMO-SOAK — fly the demo autopilot unattended and log every death and every
// close pass, in units of the body's own radius (package K, demo pilot safety).
//
//   node scripts/demo-soak.mjs --root <dir> --out <dir> [--runs 6] [--secs 180]
//                              [--hy k:v,…] [--name soak]
//
// Each run boots the build headless (real GPU), clicks DEMO MODE and samples
// every rendered frame: for every planet / star, distance / radius (radius as
// game-physics reads it — geometry.parameters.radius x world scale). Death
// kills the run, as it does in the game; the death record carries time, title,
// body, pilot phase, on-rails flags (warp / whip / launch ramp / jump), speed.
// Writes <out>/<name>.json and prints a summary + the closest-approach table.
// One browser at a time; runs are sequential.
// =============================================================================
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const PW = [join(HERE, 'node_modules/playwright-core/index.mjs'),
    '/Users/benstagl/InterstellarSlingshot/.claude/worktrees/hybrid/node_modules/playwright-core/index.mjs',
    '/Users/benstagl/InterstellarSlingshot/node_modules/playwright-core/index.mjs'].find(existsSync);
if (!PW) { console.error('soak: playwright-core not found'); process.exit(2); }
const { chromium } = await import(pathToFileURL(PW).href);

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = resolve(opt('root', HERE));
const OUT = resolve(opt('out', join(HERE, '.critic/soak')));
const RUNS = Number(opt('runs', 6));
const SECS = Number(opt('secs', 180));
const HY = opt('hy', null);
const NAME = opt('name', 'soak');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.json': 'application/json' };

const server = await new Promise((done) => {
    const s = http.createServer(async (req, res) => {
        try {
            let rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\.])+/, '');
            if (rel === '') rel = 'index.html';
            const data = await readFile(join(ROOT, rel));
            res.writeHead(200, { 'Content-Type': MIME[extname(rel).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(data);
        } catch { res.writeHead(404); res.end(); }
    });
    s.listen(0, '127.0.0.1', () => done(s));
});
const port = server.address().port;
await mkdir(OUT, { recursive: true });

// In-page probe: rAF sampler + death trap.
const PROBE = () => {
    const ie = eval;
    const S = window.__soak = { t0: performance.now(), deaths: [], near: {}, frames: 0, maxSpeed: 0, railsFrames: 0 };
    const rails = () => {
        const gs = ie('gameState');
        return {
            warp: !!(gs.emergencyWarp && gs.emergencyWarp.active),
            whip: !!gs.slingshotWhip, ramp: !!gs.slingshotLaunchRamp,
            jump: !!(gs.emergencyWarp && gs.emergencyWarp.isJump),
            sling: !!(gs.slingshot && gs.slingshot.active),
        };
    };
    const radiusOf = (p) => {
        const g = p.geometry && p.geometry.parameters;
        const r = g && g.radius ? g.radius : 1;
        return r;   // physics reads geometry radius only
    };
    const snap = () => {
        const gs = ie('gameState'), dp = window.demoPilot;
        const v = gs.velocityVector ? gs.velocityVector.length() : 0;
        return { t: +((performance.now() - S.t0) / 1000).toFixed(2), phase: dp ? dp.phase : '?',
            status: dp ? (dp.navStatus && dp.navStatus.text) || '' : '', rails: rails(), speed: Math.round(v),
            driving: dp ? dp.driving : false };
    };
    const orig = window.triggerPlayerDeath;
    window.triggerPlayerDeath = function (title, msg, d) {
        const cam = ie('camera');
        let body = null, dr = null;
        try {
            for (const p of ie('planets')) {
                if (!p || !p.position || !p.userData) continue;
                if (p.userData.type !== 'planet' && p.userData.type !== 'star') continue;
                const r = radiusOf(p); const q = cam.position.distanceTo(p.position) / r;
                if (dr === null || q < dr) { dr = q; body = p.userData.name; }
            }
        } catch (e) { /* diagnostic only */ }
        if (!ie('gameState').playerDying) S.deaths.push(Object.assign(snap(), { title, msg, nearest: body, dOverR: dr && +dr.toFixed(3) }));
        return orig.apply(this, arguments);
    };
    const tick = () => {
        try {
            const gs = ie('gameState'), cam = ie('camera');
            if (gs.gameStarted && !gs.playerDying) {
                S.frames++;
                const sp = gs.velocityVector ? gs.velocityVector.length() : 0;
                if (sp > S.maxSpeed) S.maxSpeed = sp;
                const rl = rails(); if (rl.warp || rl.whip || rl.ramp) S.railsFrames++;
                for (const p of ie('planets')) {
                    if (!p || !p.position || !p.userData) continue;
                    const ty = p.userData.type;
                    if (ty !== 'planet' && ty !== 'star') continue;
                    const r = radiusOf(p); const q = cam.position.distanceTo(p.position) / r;
                    if (q > 6) continue;
                    const k = p.userData.name || '?';
                    const e = S.near[k];
                    if (!e || q < e.dOverR) S.near[k] = Object.assign(snap(), { dOverR: +q.toFixed(3), r: Math.round(r), type: ty });
                }
            }
        } catch (e) { S.err = String(e.message || e); }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
};

const results = [];
for (let run = 1; run <= RUNS; run++) {
    const browser = await chromium.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
        args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 200)));
    let rec = { run, err: null };
    try {
        await page.goto(`http://127.0.0.1:${port}/index.html${HY ? '?hy=' + encodeURIComponent(HY) : ''}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('#introDemoBtn', { timeout: 120000 });
        await page.click('#introDemoBtn');
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.gameStarted && gameState.frameCount > 60, null, { timeout: 120000 });
        await page.evaluate(`(${PROBE.toString()})()`);
        const t0 = Date.now();
        while (Date.now() - t0 < SECS * 1000) {
            await page.waitForTimeout(2000);
            const dead = await page.evaluate(() => window.__soak.deaths.length > 0 || !!gameState.gameOver);
            if (dead) { await page.waitForTimeout(500); break; }
        }
        const S = await page.evaluate(() => {
            const dp = window.demoPilot;
            return Object.assign({}, window.__soak, { tEnd: +((performance.now() - window.__soak.t0) / 1000).toFixed(1),
                ks: window.__keepout || null,
                counters: dp ? { parks: dp.arrivalParks, ignitions: dp.ignitionCounts, corridorAborts: dp.corridorAborts,
                    jumpsRefused: dp.jumpsRefused, warpCorridorRefusals: dp.warpCorridorRefusals,
                    keepout: dp.keepout ? dp.keepout.counts : undefined } : null });
        });
        rec = Object.assign(rec, S, { pageErrors });
    } catch (e) { rec.err = e.message; rec.pageErrors = pageErrors; }
    await browser.close();
    results.push(rec);
    const d = rec.deaths && rec.deaths[0];
    console.log(`run ${run}: ${rec.err ? 'ERROR ' + rec.err : ''}flew ${rec.tEnd}s, frames ${rec.frames}, ` +
        (d ? `DIED @${d.t}s ${d.title} [${d.msg}] phase=${d.phase} rails=${JSON.stringify(d.rails)} speed=${d.speed} nearest=${d.nearest} d/R=${d.dOverR}` : 'no death') +
        (rec.counters ? ` parks=${rec.counters.parks} ignitions=${JSON.stringify(rec.counters.ignitions)}` + (rec.counters.keepout ? ` keepout=${JSON.stringify(rec.counters.keepout)}` : '') : '') + (rec.pageErrors && rec.pageErrors.length ? ` pageErrors=${rec.pageErrors.length}` : ''));
}
server.close();
await writeFile(join(OUT, NAME + '.json'), JSON.stringify(results, null, 1));

// Closest approach table: per body, min over runs.
const deaths = results.flatMap((r) => (r.deaths || []).map((d) => Object.assign({ run: r.run }, d)));
const coll = deaths.filter((d) => /IMPACT|VAPORIZED/.test(d.title));
console.log(`\nSUMMARY ${NAME}: ${results.length} runs, ${results.reduce((a, r) => a + (r.tEnd || 0), 0).toFixed(0)} s flown, deaths ${deaths.length}, by collision ${coll.length}`);
const rows = [];
for (const r of results) for (const [k, e] of Object.entries(r.near || {})) rows.push(Object.assign({ run: r.run, body: k }, e));
rows.sort((a, b) => a.dOverR - b.dOverR);
console.log('closest approaches (d/R < 6), nearest first:');
console.log('run  body                         R     d/R    t(s)  phase                     rails            speed');
for (const e of rows.slice(0, 30)) {
    const rl = Object.entries(e.rails).filter(([, v]) => v).map(([k]) => k).join('+') || '-';
    console.log(`${String(e.run).padEnd(4)} ${String(e.body).slice(0, 28).padEnd(28)} ${String(e.r).padStart(5)} ${e.dOverR.toFixed(2).padStart(6)} ${String(e.t).padStart(6)}  ${String(e.phase).padEnd(25)} ${rl.padEnd(16)} ${e.speed}`);
}
process.exit(0);
