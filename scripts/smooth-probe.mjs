#!/usr/bin/env node
// =============================================================================
// SMOOTH-PROBE — package AF (smoothfps) measurements, headless on the real GPU.
//
//   node scripts/smooth-probe.mjs --root <dir> --out <dir> --job turn|fade|spots
//        [--name label] [--hy k:v,…] [--size 1280x720] [--spots start,fight,sgr,nebula]
//        [--secs 20]
//
//   turn   skip the intro (play mode), hold ArrowLeft 3 s, sample at every
//          gameRender() the ship's projected screen position and its roll
//          relative to the rendered camera; prints p50/p95/max of the
//          frame-to-frame SECOND difference (px, deg) and saves 3 canvas
//          frames mid-turn (<name>-turn-{1,2,3}.png).
//   fade   press PRESS TO LAUNCH and record, from the press until 8 s after the
//          fade-up has finished: long tasks (>50 ms), per-frame rAF times,
//          window.__perf, renderer.info calls / textures / programs every
//          500 ms, the fade overlay's opacity; prints the long-task list
//          relative to the transition (black screen) start and the first
//          second at which fps holds 55+ for 1 s.
//   spots  skip the intro (play mode); for each spot stage it, settle 3 s,
//          then sample --secs seconds: __perf, renderer.info, __perfSplit.
//          Spots: start (Earth orbit), fight (6 pirates ahead + the wingmen),
//          sgr (8 radii off Sgr A*), nebula (inside the nearest named nebula).
//
// One browser, closed at the end. Exit 1 on an uncaught page error.
// =============================================================================
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const PW_CANDIDATES = [
    join(HERE, 'node_modules/playwright-core/index.mjs'),
    '/Users/benstagl/InterstellarSlingshot/.claude/worktrees/hybrid/node_modules/playwright-core/index.mjs',
    '/Users/benstagl/InterstellarSlingshot/node_modules/playwright-core/index.mjs',
];
const pwPath = PW_CANDIDATES.find(existsSync);
if (!pwPath) { console.error('smooth-probe: playwright-core not found'); process.exit(2); }
const { chromium } = await import(pathToFileURL(pwPath).href);

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = resolve(opt('root', HERE));
const OUT = resolve(opt('out', join(HERE, '.critic/smoothfps')));
const NAME = opt('name', 'probe');
const JOB = opt('job', 'turn');
const HY = opt('hy', null);
const SECS = Number(opt('secs', 20));
const SPOTS = String(opt('spots', 'start,fight,sgr,nebula')).split(',');
const [W, H] = String(opt('size', '1280x720')).split('x').map(Number);

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
            res.writeHead(200, { 'Content-Type': MIME[extname(rel).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store, max-age=0' });
            res.end(data);
        } catch { res.writeHead(404); res.end('not found'); }
    });
    s.listen(0, '127.0.0.1', () => done(s));
});
const port = server.address().port;
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));

const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const r2 = (x) => (x == null ? x : Math.round(x * 100) / 100);
const result = { job: JOB, name: NAME, root: ROOT, hy: HY };
let code = 0;

// in-page recorders, installed before the launch press
const INSTALL = () => {
    const A = window.__af = { lt: [], fr: [], snaps: [], t0: performance.now() };
    try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) A.lt.push([Math.round(e.startTime), Math.round(e.duration)]); })
            .observe({ entryTypes: ['longtask'] });
    } catch (e) { A.ltErr = String(e); }
    let last = performance.now();
    const tick = (t) => {
        let ph = ''; try { ph = introSequence.phase || ''; } catch (e) {}
        A.fr.push([Math.round(t), +(t - last).toFixed(1), ph]);
        last = t; requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    A.iv = setInterval(() => {
        const s = { t: Math.round(performance.now()) };
        try { s.ph = introSequence.phase; } catch (e) {}
        try { const o = (introSequence.fadeOverlay || window.skipSceneFade); s.ov = o ? +(+o.style.opacity).toFixed(2) : null; } catch (e) {}
        try { const p = window.__perf; s.fps = p.fps; s.med = r2(p.medianMs); s.p95 = r2(p.p95Ms); s.scr = r2(p.scriptMs); } catch (e) {}
        try { const r = renderer; s.calls = r.info.render.calls; s.tex = r.info.memory.textures; s.geo = r.info.memory.geometries; s.prog = (r.info.programs || []).length; } catch (e) {}
        A.snaps.push(s);
    }, 500);
};

async function boot() {
    await page.goto(`http://127.0.0.1:${port}/index.html${HY ? '?hy=' + encodeURIComponent(HY) : ''}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#introDemoBtn', { timeout: 120000 });
    result.build = await page.evaluate(() => window.BUILD_TAG);
    await page.evaluate(INSTALL);
}
async function skipToPlay() {
    await page.evaluate(() => { window.skipIntroSequence(); });
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.gameStarted && gameState.frameCount > 60 && !window.skipSceneFade, null, { timeout: 120000 });
}
// keep the player alive and parked; optionally clear hostiles near the camera
const KEEP = (clearNear) => {
    const gs = gameState;
    if (window.__afKeep) clearInterval(window.__afKeep);
    window.__afKeep = setInterval(() => {
        gs.velocityVector.set(0, 0, 0);
        if (gs.hull !== undefined) gs.hull = gs.maxHull || 100;
        if (gs.shields !== undefined && gs.maxShields) gs.shields = gs.maxShields;
        if (clearNear) {
            const P = camera.position;
            for (const e of enemies) if (e && e.position && e.position.distanceTo(P) < 9000) {
                e.position.set(P.x + 150000, P.y + 40000, P.z + 150000);
                if (e.userData) { e.userData._interp = false; if (e.userData._iFrom) e.userData._iFrom.copy(e.position); if (e.userData._iTo) e.userData._iTo.copy(e.position); }
            }
        }
    }, 250);
};

try {
    await boot();
    if (JOB === 'fade') {
        const tPress = await page.evaluate(() => performance.now());
        const btn = await page.$('#introStartBtn');
        if (!btn) throw new Error('no #introStartBtn');
        await btn.click();
        await page.waitForFunction(() => { try { return introSequence.phase === 'transition'; } catch (e) { return false; } }, null, { timeout: 90000, polling: 50 });
        const tTrans = await page.evaluate(() => performance.now());
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.gameStartTime && !(introSequence.fadeOverlay), null, { timeout: 60000 });
        const tDone = await page.evaluate(() => performance.now());
        await page.waitForTimeout(8000);
        const A = await page.evaluate(() => ({ lt: __af.lt, fr: __af.fr, snaps: __af.snaps }));
        const T0 = tTrans;
        const lt = A.lt.filter((x) => x[0] >= tPress - 100).map(([s, d]) => [Math.round((s - T0)) / 1000, d]);
        // per-second fps from the transition start
        const fr = A.fr.filter((f) => f[0] >= T0);
        const perSec = [];
        for (let s = 0; s < Math.ceil((tDone - T0) / 1000) + 8; s++) {
            const fs = fr.filter((f) => f[0] >= T0 + s * 1000 && f[0] < T0 + (s + 1) * 1000);
            const dts = fs.map((f) => f[1]);
            perSec.push({ s, frames: fs.length, maxMs: dts.length ? Math.max(...dts) : null, p95Ms: r2(pct(dts, 0.95)) });
        }
        // first second (from T0, 0.1 s resolution) where the next 1 s holds >= 55 frames and no frame > 25 ms
        let hold55 = null;
        for (let t = 0; t < (fr.length ? (fr[fr.length - 1][0] - T0) / 1000 - 1 : 0); t += 0.1) {
            const fs = fr.filter((f) => f[0] >= T0 + t * 1000 && f[0] < T0 + t * 1000 + 1000);
            if (fs.length >= 55 && Math.max(...fs.map((f) => f[1])) <= 25) { hold55 = r2(t); break; }
        }
        const fadeFr = fr.filter((f) => f[0] >= T0 && f[0] <= tDone);
        result.fade = {
            pressToTransitionS: r2((tTrans - tPress) / 1000), transitionToRevealDoneS: r2((tDone - T0) / 1000),
            longTasksFromPress: lt, longTaskMsDuringTransition: lt.filter((x) => x[0] >= 0 && x[0] <= (tDone - T0) / 1000).reduce((s, x) => s + x[1], 0),
            framesDuringFade: fadeFr.length, fadeFps: r2(fadeFr.length / ((tDone - T0) / 1000)),
            fadeFrameP95: r2(pct(fadeFr.map((f) => f[1]), 0.95)), fadeFrameMax: fadeFr.length ? Math.max(...fadeFr.map((f) => f[1])) : null,
            framesOver50: fadeFr.filter((f) => f[1] > 50).length, framesOver100: fadeFr.filter((f) => f[1] > 100).length,
            firstSecondHolding55: hold55, perSecond: perSec,
            snaps: A.snaps.filter((s) => s.t >= T0 - 1000).map((s) => ({ ...s, t: r2((s.t - T0) / 1000) })),
        };
    } else if (JOB === 'turn') {
        await skipToPlay();
        await page.waitForTimeout(2000);
        await page.evaluate(KEEP, true);
        await page.waitForTimeout(1500);
        await page.evaluate(() => {
            const S = window.__afTurn = { rec: [], on: true };
            const v = new THREE.Vector3(), up = new THREE.Vector3(), qi = new THREE.Quaternion();
            const orig = window.gameRender;
            window.gameRender = function (s, c) {
                if (S.on && cameraState && cameraState.playerShipMesh) {
                    const sh = cameraState.playerShipMesh;
                    c.updateMatrixWorld();
                    v.copy(sh.position).project(c);
                    qi.copy(c.quaternion).invert();
                    up.set(0, 1, 0).applyQuaternion(sh.quaternion).applyQuaternion(qi);
                    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(sh.quaternion).applyQuaternion(qi);
                    S.rec.push([performance.now(), (v.x + 1) * 0.5 * innerWidth, (1 - v.y) * 0.5 * innerHeight,
                        Math.atan2(-up.x, up.y) * 57.2958, Math.atan2(fwd.x, -fwd.z) * 57.2958, gameState.frameCount, keys.left ? 1 : 0, rotationalVelocity.yaw]);
                }
                return orig.apply(this, arguments);
            };
        });
        await page.waitForTimeout(500);
        await page.keyboard.down('ArrowLeft');
        await page.waitForTimeout(1500);
        const c = await page.$('#gameCanvas') || await page.$('canvas');
        for (let i = 1; i <= 3; i++) await c.screenshot({ path: join(OUT, `${NAME}-turn-${i}.png`) });
        await page.waitForTimeout(400);
        await page.keyboard.up('ArrowLeft');
        await page.waitForTimeout(1500);
        const rec = await page.evaluate(() => { window.__afTurn.on = false; return window.__afTurn.rec; });
        const stats = (rows) => {
            const ax = [], ar = [], ay = [], dts = [];
            for (let i = 1; i < rows.length - 1; i++) {
                const [ , x0, y0, r0, w0] = rows[i - 1], [t1, x1, y1, r1, w1] = rows[i], [t2, x2, y2, r2_, w2] = rows[i + 1];
                ax.push(Math.hypot(x2 - 2 * x1 + x0, y2 - 2 * y1 + y0));
                ar.push(Math.abs(r2_ - 2 * r1 + r0));
                ay.push(Math.abs(w2 - 2 * w1 + w0));
                dts.push(t2 - t1);
            }
            return { frames: rows.length, fps: rows.length > 1 ? r2((rows.length - 1) / ((rows[rows.length - 1][0] - rows[0][0]) / 1000)) : null,
                px2: { p50: r2(pct(ax, 0.5)), p95: r2(pct(ax, 0.95)), max: r2(Math.max(...ax)) },
                rollDeg2: { p50: r2(pct(ar, 0.5)), p95: r2(pct(ar, 0.95)), max: r2(Math.max(...ar)) },
                yawDeg2: { p50: r2(pct(ay, 0.5)), p95: r2(pct(ay, 0.95)), max: r2(Math.max(...ay)) },
                dtMs: { p50: r2(pct(dts, 0.5)), p95: r2(pct(dts, 0.95)) },
                rollRange: [r2(Math.min(...rows.map((r) => r[3]))), r2(Math.max(...rows.map((r) => r[3])))],
                screenX: [r2(Math.min(...rows.map((r) => r[1]))), r2(Math.max(...rows.map((r) => r[1])))] };
        };
        const press = rec.findIndex((r) => r[6] === 1), rel = rec.findLastIndex((r) => r[6] === 1);
        const steadyFrom = rec.findIndex((r) => r[0] >= rec[press][0] + 700);
        result.turn = { whole: stats(rec), steadyTurn: stats(rec.slice(steadyFrom, rel)), onsetAndRelease: { onset: stats(rec.slice(press, steadyFrom)), release: stats(rec.slice(rel, rel + 60)) } };
        await writeFile(join(OUT, `${NAME}-turnrec.json`), JSON.stringify(rec));
    } else if (JOB === 'spots') {
        await skipToPlay();
        await page.waitForTimeout(1500);
        result.spots = {};
        for (const spot of SPOTS) {
            const staged = await page.evaluate(async (spot) => {
                const cam = camera, gs = gameState;
                const near = (arr, P) => { let b = null, bd = Infinity; for (const o of arr) { const p = o.getWorldPosition(new THREE.Vector3()); const d = p.distanceTo(P); if (d < bd) { bd = d; b = { o, p, d }; } } return b; };
                if (window.__afFight) { clearInterval(window.__afFight); window.__afFight = null; }
                if (spot === 'sgr') {
                    const core = planets.find((p) => p && p.userData && /Sagittarius A/i.test(p.userData.name || '') && (p.userData.type === 'blackhole' || p.userData.isGalacticCore));
                    if (!core) return { err: 'no Sgr A*' };
                    const P = core.getWorldPosition(new THREE.Vector3());
                    const R = (window.HY_BH && window.HY_BH.SIZE) || 900;
                    cam.position.copy(P).add(new THREE.Vector3(R * 6, R * 1.5, R * 5));
                    cam.lookAt(P);
                    return { spot, core: core.userData.name, dist: Math.round(cam.position.distanceTo(P)) };
                }
                if (spot === 'nebula') {
                    const sol = new THREE.Vector3(window.localSystemOffset.x, 0, window.localSystemOffset.z);
                    const b = near((nebulaClouds || []).filter((n) => n && n.userData && /Nebula/.test(n.userData.name || '')), sol);
                    if (!b) return { err: 'no nebula' };
                    cam.position.copy(b.p).add(new THREE.Vector3(2600, 300, 2600));
                    cam.lookAt(b.p);
                    return { spot, nebula: b.o.userData.name, fromSol: Math.round(b.d) };
                }
                if (spot === 'fight') {
                    const E = enemies, A = (typeof allyShips !== 'undefined' && allyShips) || [];
                    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
                    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
                    A.forEach((a, i) => { const u = a.userData; a.position.copy(cam.position).addScaledVector(right, (i - 1.5) * 160).add(new THREE.Vector3(0, 40 * (i % 2 ? 1 : -1), 0)); u._interp = false; if (u._iFrom) u._iFrom.copy(a.position); if (u._iTo) u._iTo.copy(a.position); });
                    const tick = () => {
                        const P = cam.position, fw = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
                        const alive = E.filter((e) => e && e.userData && e.userData.health > 0 && !e.userData.isBoss);
                        let n = alive.filter((e) => e.position.distanceTo(P) < 2200).length;
                        const far = alive.filter((e) => e.position.distanceTo(P) >= 2200).sort((a, b) => a.position.distanceTo(P) - b.position.distanceTo(P));
                        while (n < 6 && far.length) {
                            const e = far.shift();
                            const r = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5).normalize();
                            e.position.copy(P).addScaledVector(fw, 1000 + Math.random() * 400).addScaledVector(r, 400);
                            const u = e.userData; u._interp = false; if (u._iFrom) u._iFrom.copy(e.position); if (u._iTo) u._iTo.copy(e.position); u.isActive = true; n++;
                        }
                    };
                    tick(); window.__afFight = setInterval(tick, 500);
                    return { spot, allies: A.length, enemies: E.length };
                }
                return { spot };
            }, spot);
            await page.evaluate(KEEP, false);
            await page.waitForTimeout(3000);
            await page.evaluate(() => { window.__perfSplit && window.__perfSplit.start(); window.__afS = []; window.__afSI = setInterval(() => { const r = renderer.info.render; const p = window.__perf; window.__afS.push([r.calls, r.triangles, p.fps, p.medianMs, p.p95Ms, p.scriptMs, p.p95ScriptMs]); }, 500); });
            await page.waitForTimeout(SECS * 1000);
            const m = await page.evaluate(() => {
                clearInterval(window.__afSI);
                const S = window.__afS, avg = (k) => S.reduce((s, r) => s + r[k], 0) / Math.max(1, S.length);
                const split = window.__perfSplit ? window.__perfSplit.report(true) : null;
                if (window.__perfSplit) window.__perfSplit.stop();
                return { calls: Math.round(avg(0)), tris: Math.round(avg(1)), fps: +avg(2).toFixed(1), medianMs: +avg(3).toFixed(2), p95Ms: +avg(4).toFixed(2), scriptMs: +avg(5).toFixed(2), p95ScriptMs: +avg(6).toFixed(2),
                    split: split && { frames: split.frames, total: split.total, top: split.msPerFrame.slice(0, 14) } };
            });
            result.spots[spot] = { staged, ...m };
            console.log(`spot ${spot}:`, JSON.stringify({ staged, ...m, split: undefined }));
        }
    }
} catch (e) {
    console.error('smooth-probe: FAILED', e.message);
    result.failed = e.message;
    code = 1;
} finally {
    result.pageErrors = pageErrors;
    if (pageErrors.length) code = 1;
    await writeFile(join(OUT, `${NAME}-${JOB}.json`), JSON.stringify(result, null, 1));
    console.log(JSON.stringify(result, (k, v) => (k === 'perSecond' || k === 'snaps' ? undefined : v)));
    await browser.close();
    server.close();
}
process.exit(code);
