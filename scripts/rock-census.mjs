#!/usr/bin/env node
// =============================================================================
// ROCK-CENSUS — how present are the asteroids? (package L)
//
//   node scripts/rock-census.mjs --root <dir> --out <dir> [--mode demo|flight]
//        [--secs 150] [--belt sol|core] [--hy k:v,...] [--name census] [--shots]
//
// demo:   clicks DEMO MODE and samples every 0.5 s for --secs.
// flight: clicks PRESS TO LAUNCH, freezes the ship and flies the camera on
//         rails from 30,000 out to inside the nearest belt (--belt core = the
//         nearest belt round a galaxy core, sol = Sol's belt), 30 s. With
//         --shots it writes far / mid / inside PNGs.
//
// Per kind (belt = rocks of belts round a hole or star, cluster = scatter
// clusters, roam = roaming interstellar rocks, dense = dense-field rocks):
//   n2k/n8k/n30k  rocks within 2,000 / 8,000 / 30,000 of the camera (mean)
//   drawn         rocks that will be submitted (visible chain + material.visible)
//   px3           drawn, in the frustum and >= 3 px across (mean, max)
//   nearest       closest rock (min over the run)
//   pass1k        distinct rocks that came within 1,000
// plus shots fired, rock hits by weapon, rocks destroyed, player-rock
// collisions, draw calls per frame and fps.
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
if (!PW) { console.error('census: playwright-core not found'); process.exit(2); }
const { chromium } = await import(pathToFileURL(PW).href);

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = resolve(opt('root', HERE));
const OUT = resolve(opt('out', join(HERE, '.critic/census')));
const MODE = opt('mode', 'demo');
const SECS = Number(opt('secs', MODE === 'demo' ? 150 : 33));
const BELT = opt('belt', 'core');
const HY = opt('hy', null);
const NAME = opt('name', 'census');
const SHOTS = argv.includes('--shots');
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

// ---------------------------------------------------------------- in-page probe
const PROBE = (mode, beltKind) => {
    const ie = eval;
    const cam = ie('camera'), THREE = window.THREE;
    const C = window.__census = { t0: performance.now(), samples: [], ev: { fire: 0, hitBelt: 0, hitRoam: 0,
        killBelt: 0, killRoam: 0, bumpBelt: 0, deaths: [] }, pass: {}, near: {}, calls: 0, frames: 0 };
    // --- event hooks (globals, so wrapping the window property rebinds callers)
    const wrap = (name, fn) => { const o = window[name]; if (typeof o !== 'function') return;
        window[name] = function () { try { fn.apply(this, arguments); } catch (e) { /* census only */ } return o.apply(this, arguments); }; };
    let inRockRock = false;
    const oHandle = window.handleAsteroidCollision;
    if (typeof oHandle === 'function') window.handleAsteroidCollision = function () { inRockRock = true; try { return oHandle.apply(this, arguments); } finally { inRockRock = false; } };
    wrap('fireWeapon', () => { C.ev.fire++; });
    wrap('destroyAsteroidByWeapon', () => { C.ev.hitBelt++; C.ev.killBelt++; });
    wrap('destroyAsteroidByCollision', () => { C.ev.bumpBelt++; });
    wrap('breakInterstellarAsteroid', (a) => { if (!inRockRock) C.ev.hitRoam++; });
    wrap('destroyInterstellarAsteroid', () => { if (!inRockRock) C.ev.killRoam++; });
    wrap('triggerPlayerDeath', (title, msg) => { C.ev.deaths.push({ t: +((performance.now() - C.t0) / 1000).toFixed(1), title, msg }); });
    // --- draw calls: sum every renderer.render of a frame
    const R = ie('renderer');
    if (R && !R.__censusWrapped) {
        const or = R.render.bind(R); R.__censusWrapped = true;
        R.render = function (s, c) { const r = or(s, c); C._fc = (C._fc || 0) + R.info.render.calls; return r; };
    }
    const rafTick = () => { if (C._fc !== undefined) { C.calls += C._fc; C.frames++; C._fc = 0; } requestAnimationFrame(rafTick); };
    requestAnimationFrame(rafTick);

    const kindOf = (o) => {
        const u = o.userData || {};
        if (u.type === 'interstellar_asteroid') return u.denseField ? 'dense' : 'roam';
        if (u.type === 'asteroid') return (u.beltGroup && u.beltGroup.userData && u.beltGroup.userData.isScatterCluster) ? 'cluster' : 'belt';
        return null;
    };
    const wp = new THREE.Vector3(), ndc = new THREE.Vector3();
    const radius = (o) => {
        if (o.isAsteroidProxy) return o.scale.x;   // instanced rock (asteroid-instancer.js): unit geometry x scale
        const g = o.geometry; if (!g) return 1;
        if (!g.boundingSphere) g.computeBoundingSphere();
        o.getWorldScale(ndc); return g.boundingSphere.radius * Math.max(ndc.x, ndc.y, ndc.z);
    };
    const drawn = (o) => {
        // Hybrid instanced rocks: the invisible logical mesh stands for an
        // instance drawn under its belt group.
        if (o.isAsteroidProxy) { const r = o._instRef; return !!(r && !r.dead && r.combo.mesh.visible && r.combo.mesh.parent); }
        if (o.userData && o.userData._hyIM) { if (o.userData._hyDead) return false; o = o.userData._hyIM; }
        if (o.material && o.material.visible === false) return false;
        for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p.isScene) return true; }
        return false;   // detached
    };
    C.sample = () => {
        const planets = ie('planets'), roam = (typeof window.interstellarAsteroids !== 'undefined') ? window.interstellarAsteroids : [];
        const H = window.innerHeight, pxPerAng = (H / 2) / Math.tan(cam.fov * Math.PI / 360);
        cam.updateMatrixWorld();
        const S = { t: +((performance.now() - C.t0) / 1000).toFixed(1), k: {} };
        const all = planets.concat(roam);
        for (const o of all) {
            const kind = kindOf(o); if (!kind) continue;
            const k = S.k[kind] || (S.k[kind] = { n: 0, n2k: 0, n8k: 0, n30k: 0, drawn: 0, px3: 0, nearest: Infinity });
            k.n++;
            o.getWorldPosition(wp);
            const d = wp.distanceTo(cam.position);
            if (d < 2000) k.n2k++; if (d < 8000) k.n8k++; if (d < 30000) k.n30k++;
            if (d < k.nearest) k.nearest = d;
            if (d < 1000) { const P = C.pass[kind] || (C.pass[kind] = new Set()); P.add(o.uuid || o._instRef || o); }
            const dr = drawn(o); if (dr) k.drawn++;
            if (dr) {
                ndc.copy(wp).project(cam);
                if (ndc.z < 1 && ndc.z > -1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1) {
                    const px = 2 * radius(o) * pxPerAng / Math.max(d, 1);
                    if (px >= 3) k.px3++;
                }
            }
        }
        Object.values(S.k).forEach((k) => { k.nearest = Math.round(k.nearest); });
        S.cam = [Math.round(cam.position.x), Math.round(cam.position.y), Math.round(cam.position.z)];
        S.fps = window.__perf && window.__perf.fps ? Math.round(window.__perf.fps) : null;
        S.calls = C.frames ? Math.round(C.calls / C.frames) : null; C.calls = 0; C.frames = 0;
        const dp = window.demoPilot; S.phase = dp ? dp.phase : '';
        C.samples.push(S);
        return S;
    };

    if (mode === 'flight') {
        // Pick the belt: nearest belt group round a hole (core) or Sol's (sol).
        const belts = (window.asteroidBelts || []).filter((b) => b.userData && !b.userData.isScatterCluster && b.children.length);
        const isSol = (b) => b.userData.galaxyId === 7;
        const pool = belts.filter((b) => beltKind === 'sol' ? isSol(b) : !isSol(b));
        let best = null, bd = Infinity;
        for (const b of pool) { const d = b.position.distanceTo(cam.position); if (d < bd) { bd = d; best = b; } }
        if (!best) return { err: 'no belt of kind ' + beltKind, belts: belts.length };
        // Ring radius = median child distance from the group origin.
        const kids = best.userData._hyRocks || best.children;
        const rr = kids.map((c) => { const L = c.userData._hyL || c.position; return Math.hypot(L.x, L.z); }).sort((a, b) => a - b);
        const ringR = rr[Math.floor(rr.length / 2)] * best.scale.x;
        const ctr = best.position;   // live: the floating origin rebases the world past 30,000 u
        const out = new THREE.Vector3(cam.position.x - ctr.x, 0, cam.position.z - ctr.z).normalize();
        if (!isFinite(out.x)) out.set(1, 0, 0);
        const ringPt = ctr.clone().addScaledVector(out, ringR);
        const tan = new THREE.Vector3(-out.z, 0, out.x);
        C.flight = { ctr, ringR, ringPt, out, tan, name: best.userData.name, rocks: kids.length, t0: performance.now(), T: 30000 };
        // Rail: from ringPt + out*30000 (+ a little height) to the ring, distance on a log scale.
        const place = () => {
            const F = C.flight; if (!F || F.frozen) return;
            const u = Math.min(1, (performance.now() - F.t0) / F.T);
            const dist = 30000 * (1 - u) * (1 - u);
            F.ringPt = F.ctr.clone().addScaledVector(F.out, F.ringR);
            const pos = F.ringPt.clone().addScaledVector(F.out, dist).add(new THREE.Vector3(0, Math.min(dist * 0.15, 3000), 0));
            cam.position.copy(pos);
            // Look at the ring point, then along the ring once inside it.
            const look = dist > 400 ? F.ringPt.clone() : F.ringPt.clone().addScaledVector(F.tan, 1000);
            cam.lookAt(look);
            const gs = ie('gameState'); if (gs.velocityVector) gs.velocityVector.set(0, 0, 0);
            gs.hull = gs.maxHull || 100;
            requestAnimationFrame(place);
        };
        requestAnimationFrame(place);
        return { belt: best.userData.name, ringR: Math.round(ringR), rocks: kids.length, dist0: Math.round(bd) };
    }
    return { ok: true };
};

const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 200)));
let result = null;
try {
    await page.goto(`http://127.0.0.1:${port}/index.html${HY ? '?hy=' + encodeURIComponent(HY) : ''}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#introDemoBtn', { timeout: 120000 });
    if (MODE === 'demo') await page.click('#introDemoBtn');
    else {
        const b = await page.$('#introStartBtn, #introLaunchBtn, #introPlayBtn');
        if (b) await b.click();
        else await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((q) => q.id !== 'introDemoBtn' && q.offsetParent && /launch|start|play/i.test(q.textContent)); if (x) x.click(); });
    }
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.gameStarted && gameState.frameCount > 60, null, { timeout: 120000 });
    if (MODE === 'flight') await page.waitForTimeout(6000);   // countdown / launch settle, dense fields spawn at +1.5 s
    const info = await page.evaluate(`(${PROBE.toString()})(${JSON.stringify(MODE)}, ${JSON.stringify(BELT)})`);
    console.log('census: start', JSON.stringify(info));
    const t0 = Date.now();
    const shotAt = MODE === 'flight' && SHOTS ? [{ s: 3, n: 'far' }, { s: 21, n: 'mid' }, { s: 32, n: 'inside' }] : [];
    while (Date.now() - t0 < SECS * 1000) {
        await page.waitForTimeout(500);
        const el = (Date.now() - t0) / 1000;
        await page.evaluate(() => window.__census.sample());
        const sh = shotAt.find((x) => !x.done && el >= x.s);
        if (sh) { sh.done = true; await page.screenshot({ path: join(OUT, `${NAME}-${sh.n}.png`) }); }
        if (MODE === 'demo') { const dead = await page.evaluate(() => window.__census.ev.deaths.length > 0); if (dead) break; }
    }
    if (MODE === 'flight' && SHOTS) {
        // Far: pull back to 3 ring radii above/out, looking at the centre.
        await page.evaluate(() => { const F = window.__census.flight; F.frozen = true; const cam = eval('camera');
            cam.position.copy(F.ctr).addScaledVector(F.out, F.ringR * 2.6).add(new window.THREE.Vector3(0, F.ringR * 1.1, 0)); cam.lookAt(F.ctr); });
        await page.waitForTimeout(600);
        await page.screenshot({ path: join(OUT, `${NAME}-overview.png`) });
    }
    result = await page.evaluate(() => { const C = window.__census; return { samples: C.samples, ev: C.ev,
        pass: Object.fromEntries(Object.entries(C.pass).map(([k, s]) => [k, s.size])), flight: C.flight ? { name: C.flight.name, ringR: C.flight.ringR, rocks: C.flight.rocks } : null }; });
} catch (e) { console.error('census: FAILED', e.message); }
await browser.close();
server.close();
if (!result) process.exit(1);
await writeFile(join(OUT, NAME + '.json'), JSON.stringify(Object.assign(result, { pageErrors }), null, 1));

// ---------------------------------------------------------------- summary
const kinds = ['belt', 'cluster', 'roam', 'dense'];
const S = result.samples;
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
console.log(`\nCENSUS ${NAME} (${MODE}${MODE === 'flight' ? ' → ' + (result.flight && result.flight.name) : ''}), ${S.length} samples over ${S.length ? S[S.length - 1].t : 0} s`);
console.log('kind     total  n2k   n8k   n30k   drawn  px3(mean/max)  nearest  pass1k');
for (const k of kinds) {
    const rows = S.map((s) => s.k[k]).filter(Boolean);
    if (!rows.length) { console.log(k.padEnd(8) + ' none'); continue; }
    const f = (key) => mean(rows.map((r) => r[key]));
    console.log(`${k.padEnd(8)} ${String(rows[rows.length - 1].n).padStart(5)} ${f('n2k').toFixed(1).padStart(5)} ${f('n8k').toFixed(0).padStart(5)} ${f('n30k').toFixed(0).padStart(6)} ${f('drawn').toFixed(0).padStart(7)}  ${(f('px3').toFixed(1) + '/' + Math.max(...rows.map((r) => r.px3))).padStart(12)}  ${String(Math.min(...rows.map((r) => r.nearest))).padStart(7)}  ${String(result.pass[k] || 0).padStart(6)}`);
}
const e = result.ev;
console.log(`events: shots fired ${e.fire}, belt/cluster rocks shot+destroyed ${e.hitBelt}, roaming rocks hit ${e.hitRoam} (removed ${e.killRoam}), player-rock collisions ${e.bumpBelt}, deaths ${e.deaths.length}${e.deaths.length ? ' ' + JSON.stringify(e.deaths) : ''}`);
const fps = S.map((s) => s.fps).filter((x) => x), calls = S.map((s) => s.calls).filter((x) => x);
console.log(`perf: fps mean ${mean(fps).toFixed(1)}, draw calls/frame mean ${mean(calls).toFixed(0)} max ${Math.max(0, ...calls)}; page errors ${pageErrors.length}${pageErrors.length ? ' ' + JSON.stringify(pageErrors.slice(0, 3)) : ''}`);
// Timeline every ~15 s: nearest rock of any kind and rocks within 8k.
console.log('timeline  t   n8k(all)  px3(all)  nearest(any)  phase');
for (let i = 0; i < S.length; i += 30) {
    const s = S[i]; const ks = Object.values(s.k);
    console.log(`        ${String(s.t).padStart(5)} ${String(ks.reduce((a, k) => a + k.n8k, 0)).padStart(8)} ${String(ks.reduce((a, k) => a + k.px3, 0)).padStart(9)} ${String(Math.min(...ks.map((k) => k.nearest))).padStart(13)}  ${s.phase}`);
}
process.exit(0);
