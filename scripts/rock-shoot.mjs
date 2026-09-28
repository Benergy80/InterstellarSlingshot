#!/usr/bin/env node
// =============================================================================
// ROCK-SHOOT — can the player shoot each kind of asteroid, by REAL input?
// (package M)
//
//   node scripts/rock-shoot.mjs --root <dir> --out <dir> [--name shoot]
//        [--hy k:v,...] [--kinds belt,sol,cluster,deep,roam,dense,outer]
//        [--shots 4] [--strip roam]
//
// Boots the build in PLAY mode, clicks SKIP TUTORIAL with the mouse, then for
// each kind of asteroid: places the ship a few rock-radii from a rock of that
// kind, facing it (staging only), and then plays it the way a player does —
// page.mouse.move puts the crosshair on the rock and page.mouse.click fires
// (the ORIGINAL's click-to-fire), then Alt fires once more on the next rock,
// Shift fires a missile, Space tries a target lock and CapsLock cycles
// targets. Nothing calls fireWeapon() or sets a target from script; a wrapper
// only COUNTS fireWeapon / fireMissile calls.
//
// Per kind: shots fired, rocks hit (destroyed, or split for the breakable
// kinds), fragments spawned, and what Space / CapsLock / Shift did.
// --strip <kind> writes before / hit / +300 ms / +1 s PNGs of one shot.
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
if (!PW) { console.error('rock-shoot: playwright-core not found'); process.exit(2); }
const { chromium } = await import(pathToFileURL(PW).href);

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = resolve(opt('root', HERE));
const OUT = resolve(opt('out', join(HERE, '.critic/rock-shoot')));
const NAME = opt('name', 'shoot');
const HY = opt('hy', null);
const KINDS = String(opt('kinds', 'belt,sol,cluster,deep,roam,dense,outer')).split(',');
const SHOTS = Number(opt('shots', 4));
const STRIP = opt('strip', null);
const W = 1280, H = 720;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json' };

const server = await new Promise((done) => {
    const s = http.createServer(async (req, res) => {
        try {
            let rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\.])+/, '');
            if (rel === '') rel = 'index.html';
            const data = await readFile(join(ROOT, rel));
            res.writeHead(200, { 'Content-Type': MIME[extname(rel).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(data);
        } catch { res.writeHead(404); res.end('nf'); }
    });
    s.listen(0, '127.0.0.1', () => done(s));
});
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const pageErrors = [];
if (opt('init', null)) await page.addInitScript(opt('init', null));   // e.g. a tuning global set before boot
page.on('pageerror', (e) => pageErrors.push((String(e.message || e) + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// In-page helpers: find a rock of a kind, stage the ship on it, read its state.
const HELPERS = () => {
    const ie = eval;
    const V = () => new THREE.Vector3();
    const R = window.__rs = { fire: 0, missile: 0 };
    const fw = ie('fireWeapon'); window.fireWeapon = function () { R.fire++; return fw.apply(this, arguments); };
    ie('fireWeapon = window.fireWeapon');
    const fm = ie('fireMissile'); window.fireMissile = function () { R.missile++; return fm.apply(this, arguments); };
    ie('fireMissile = window.fireMissile');
    const pl = () => ie('planets'), ia = () => (window.interstellarAsteroids || []);
    const outers = () => { const o = []; (window.outerInterstellarSystems || []).forEach((s) => (s.userData && s.userData.orbiters || []).forEach((r) => { if (r.userData && r.userData.type === 'outer_asteroid') o.push(r); })); return o; };
    const beltOf = (p) => p.userData && p.userData.beltGroup && p.userData.beltGroup.userData || {};
    R.list = (kind) => {
        if (kind === 'roam') return ia().filter((a) => !a.userData.denseField && !(a.userData.generation > 0));
        if (kind === 'dense') return ia().filter((a) => a.userData.denseField);
        if (kind === 'outer') return outers();
        return pl().filter((p) => {
            if (!p || !p.userData || p.userData.type !== 'asteroid') return false;
            const b = beltOf(p);
            if (kind === 'belt') return !b.isScatterCluster && b.galaxyId !== 7;
            if (kind === 'sol') return !b.isScatterCluster && b.galaxyId === 7;
            if (kind === 'cluster') return b.isScatterCluster && b.galaxyId >= 0;
            if (kind === 'deep') return b.isScatterCluster && b.galaxyId === -1;
            return false;
        });
    };
    R.pos = (r) => (r.getWorldPosition ? r.getWorldPosition(V()) : r.position.clone());
    R.rad = (r) => {
        const s = (r.scale && r.scale.x) || 1;
        if (r.userData.type === 'interstellar_asteroid') return r.userData.size * s;
        const g = r.geometry && r.geometry.parameters; return ((g && g.radius) || 1) * s;
    };
    R.alive = (r) => {
        const t = r.userData.type;
        if (t === 'interstellar_asteroid') return ia().indexOf(r) > -1;
        if (t === 'outer_asteroid') return outers().indexOf(r) > -1;
        return pl().indexOf(r) > -1;
    };
    // Pick the rock of this kind nearest the ship; stage the ship D in front of it.
    R.stage = (kind, skip, mult) => {
        const cam = ie('camera'), gs = ie('gameState');
        const L = R.list(kind);
        if (!L.length) return { none: true };
        const cp = cam.position;
        const sorted = L.map((r) => ({ r, d: R.pos(r).distanceToSquared(cp) })).sort((a, b) => a.d - b.d);
        const pick = sorted[Math.min(skip || 0, sorted.length - 1)].r;
        R.cur = pick; R.n0 = ia().length; R.before = new Set(ia()); R.p0 = R.pos(pick); R.r0 = R.rad(pick);
        const p = R.pos(pick), rad = R.rad(pick);
        const D = Math.max(60, rad * (mult || 14));
        const dir = V().subVectors(cp, p); if (dir.lengthSq() < 1) dir.set(0, 0, 1);
        dir.y = Math.abs(dir.y) * 0.2; dir.normalize();
        cam.position.copy(p).addScaledVector(dir, D);
        cam.lookAt(p);
        if (gs.velocityVector) gs.velocityVector.set(0, 0, 0);
        gs.targetLock.active = false; gs.targetLock.target = null; gs.currentTarget = null;
        gs.weapons.cooldown = 0; gs.weapons.energy = 100; gs.hull = gs.maxHull || 100;
        if (gs.missiles) { gs.missiles.cooldown = 0; if (gs.missiles.current !== undefined) gs.missiles.current = Math.max(gs.missiles.current, 5); }
        return { name: pick.userData.name, rad: +rad.toFixed(1), D: Math.round(D), n: L.length };
    };
    // Where is the current rock on screen (px)? Re-aims the camera first.
    R.aim = () => {
        const cam = ie('camera'), gs = ie('gameState'), r = R.cur;
        if (!r || !R.alive(r)) return null;
        const p = R.pos(r);
        const D = cam.position.distanceTo(p), want = Math.max(60, R.rad(r) * 14);
        if (Math.abs(D - want) > want * 0.5) cam.position.sub(p).setLength(want).add(p);
        cam.lookAt(p); cam.updateMatrixWorld();
        if (gs.velocityVector) gs.velocityVector.set(0, 0, 0);
        gs.weapons.cooldown = 0; gs.weapons.energy = 100;
        const s = p.clone().project(cam);
        return { x: (s.x * 0.5 + 0.5) * innerWidth, y: (-s.y * 0.5 + 0.5) * innerHeight, z: s.z };
    };
    // --debug: what did the shot's ray see? (wraps, never calls, the raycast)
    if (window.__rsDebug && window.asteroidInstancer) {
        const orc = window.asteroidInstancer.raycast;
        window.asteroidInstancer.raycast = function (rc) {
            const h = orc.apply(this, arguments);
            const r = R.cur; let ang = null, tgt = null;
            if (r) { const d = R.pos(r).sub(rc.ray.origin).normalize(); ang = +(d.angleTo(rc.ray.direction) * 180 / Math.PI).toFixed(2);
                tgt = +(Math.atan(R.rad(r) / R.pos(r).distanceTo(rc.ray.origin)) * 180 / Math.PI).toFixed(2); }
            (R.dbg = R.dbg || []).push({ hit: h ? (h.proxy === r ? 'THIS' : h.proxy.userData.name) : null, rayToRockDeg: ang, rockHalfDeg: tgt });
            return h;
        };
    }
    R.state = () => ({ dbg: (R.dbg || []).splice(0), fire: R.fire, missile: R.missile, alive: R.cur ? R.alive(R.cur) : null, n: R.before ? ia().filter((a) => !R.before.has(a) && a.position.distanceTo(R.p0) < R.r0 * 8 + 200).length : 0,
        lock: (() => { const t = ie('gameState').targetLock.target; return t ? (t.userData.type + ':' + (t === R.cur)) : null; })(),
        cur: (() => { const t = ie('gameState').currentTarget; return t && t.userData ? t.userData.type + ':' + (t === R.cur) : null; })() });
    return 'ok';
};

const result = { root: ROOT, hy: HY, kinds: {} };
let code = 0;
try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html${HY ? '?hy=' + encodeURIComponent(HY) : ''}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#introDemoBtn', { timeout: 120000 });
    result.build = await page.evaluate(() => window.BUILD_TAG);
    const btn = await page.$('#introStartBtn, #introLaunchBtn, #introPlayBtn');
    if (btn) await btn.click();
    else await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((q) => q.id !== 'introDemoBtn' && q.offsetParent && /launch|start|play/i.test(q.textContent)); if (x) x.click(); });
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.gameStarted && gameState.frameCount > 60, null, { timeout: 120000 });
    // SKIP TUTORIAL with the mouse, like a player.
    try {
        await page.waitForSelector('#missionCommandSkip', { state: 'visible', timeout: 15000 });
        await page.click('#missionCommandSkip');
        result.tutorial = 'skipped by click';
    } catch { result.tutorial = 'no skip button seen'; }
    await sleep(1500);
    await page.evaluate(`(${HELPERS.toString()})()`);
    result.counts = await page.evaluate(() => { const o = {}; ['belt', 'sol', 'cluster', 'deep', 'roam', 'dense', 'outer'].forEach((k) => { o[k] = window.__rs.list(k).length; }); return o; });

    const shootOnce = async (how, strip) => {
        const a = await page.evaluate(() => window.__rs.aim());
        if (!a || a.z >= 1) return { skipped: true };
        await page.mouse.move(a.x, a.y, { steps: 2 });
        if (strip) await page.screenshot({ path: join(OUT, `${NAME}-${strip}-0-before.png`) });
        const b = await page.evaluate(() => window.__rs.aim());   // re-aim after the move (the rock orbits)
        if (b) await page.mouse.move(b.x, b.y);
        if (how === 'click') await page.mouse.click(b ? b.x : a.x, b ? b.y : a.y);
        else if (how === 'alt') await page.keyboard.press('Alt');
        else if (how === 'shift') await page.keyboard.press('Shift');
        if (strip) {
            await sleep(40); await page.screenshot({ path: join(OUT, `${NAME}-${strip}-1-hit.png`) });
            await sleep(260); await page.screenshot({ path: join(OUT, `${NAME}-${strip}-2-explosion.png`) });
            await sleep(700); await page.screenshot({ path: join(OUT, `${NAME}-${strip}-3-after.png`) });
        } else await sleep(how === 'shift' ? 2500 : 350);
        return page.evaluate(() => window.__rs.state());
    };

    if (argv.includes('--gallery')) {
        // Canvas only, no ship in the way: hide the HUD and the player's hull.
        await page.evaluate(() => {
            window.__rsHidden = [];
            document.querySelectorAll('body *').forEach((el) => { if (el.tagName !== 'CANVAS' && !el.querySelector('canvas') && el.style.visibility !== 'hidden') { el.style.visibility = 'hidden'; window.__rsHidden.push(el); } });
            const sh = window.cameraState && window.cameraState.playerShipMesh; if (sh) { window.__rsShip = sh; sh.visible = false; }
        });
        // Look first: each kind at 14 and 90 rock radii, canvas only, no shooting.
        for (const kind of KINDS) for (const m of [14, 90]) {
            const st = await page.evaluate(({ kind, m }) => window.__rs.stage(kind, 0, m), { kind, m });
            if (st.none) continue;
            // Hold the rock still for the picture (staging only) and pitch the
            // view down a little so it sits above the ship, not behind it.
            await page.evaluate(() => { const r = window.__rs.cur; if (!r) return; const u = r.userData;
                if (r._instRef) r._instRef.orbitSpeed = 0; if (u.orbitSpeed) u.orbitSpeed = 0; if (u.velocity) u.velocity.set(0, 0, 0); });
            await sleep(450);
            await page.evaluate(() => { const r = window.__rs.cur, cam = eval('camera'); if (r) { cam.lookAt(window.__rs.pos(r)); cam.rotateX(-0.14); } });
            const c = await page.$('#gameCanvas') || await page.$('canvas');
            await page.evaluate(() => { if (window.__rsShip) window.__rsShip.visible = false; });
            await c.screenshot({ path: join(OUT, `${NAME}-gal-${kind}-${m}.png`) });
        }
        await page.evaluate(() => { (window.__rsHidden || []).forEach((el) => { el.style.visibility = ''; }); if (window.__rsShip) window.__rsShip.visible = true; });
    }
    for (const kind of (SHOTS > 0 ? KINDS : [])) {
        const K = result.kinds[kind] = { tries: 0, fired: 0, hit: 0, fragments: 0, rows: [] };
        const f0 = await page.evaluate(() => window.__rs.fire);
        for (let i = 0; i < SHOTS; i++) {
            const st = await page.evaluate(({ kind, i }) => window.__rs.stage(kind, i), { kind, i });
            if (st.none) { K.none = true; break; }
            await sleep(250);
            // A player keeps firing until the rock breaks: up to 3 shots a rock.
            const how = i % 2 === 0 ? 'click' : 'alt';
            let r = null, shots = 0; const dbg = [];
            for (let k = 0; k < 3; k++) {
                r = await shootOnce(how, (STRIP === kind && i === 0) ? `${kind}-a${k}` : null);   // the last attempt is the hit
                if (r && r.dbg && r.dbg.length) dbg.push(...r.dbg);
                if (r.skipped) break;
                shots++;
                if (r.alive === false) break;
                await sleep(120);
            }
            K.tries++;
            const hit = !r || r.skipped ? false : (r.alive === false);
            if (hit) K.hit++;
            if (r && r.n > 0) K.fragments += r.n;
            K.rows.push({ dbg: dbg.length ? dbg : undefined, how, rock: st.name, rad: st.rad, dist: st.D, shots, hit, fragments: r ? r.n : 0, skipped: !!(r && r.skipped) });
        }
        K.fired = (await page.evaluate(() => window.__rs.fire)) - f0;
        K.shots = K.rows.reduce((a, r) => a + r.shots, 0);
        // Space (target lock) and CapsLock (cycle) on a fresh rock of this kind.
        const st = await page.evaluate(({ kind, n }) => window.__rs.stage(kind, n), { kind, n: SHOTS });
        if (!st.none) {
            await page.evaluate(() => window.__rs.aim()); await sleep(200);
            await page.keyboard.press('Space'); await sleep(500);
            K.spaceLock = (await page.evaluate(() => window.__rs.state())).lock;
            await page.keyboard.press('Space');
            await page.keyboard.press('CapsLock'); await sleep(300);
            K.capsCycle = (await page.evaluate(() => window.__rs.state())).cur;
            await page.keyboard.press('CapsLock');
            const m0 = await page.evaluate(() => window.__rs.missile);
            const r = await shootOnce('shift');
            K.missile = { fired: r.missile - m0, rockGone: r.alive === false };
        }
        console.log('rock-shoot:', kind, JSON.stringify({ tries: K.tries, shots: K.shots, fired: K.fired, hit: K.hit, fragments: K.fragments, space: K.spaceLock, caps: K.capsCycle, missile: K.missile }));
    }
} catch (e) {
    console.error('rock-shoot: FAILED', e.message); code = 1;
} finally {
    result.pageErrors = pageErrors;
    await writeFile(join(OUT, `${NAME}.json`), JSON.stringify(result, null, 1));
    console.log('rock-shoot: counts', JSON.stringify(result.counts), 'tutorial:', result.tutorial, 'page errors', pageErrors.length, JSON.stringify(pageErrors.slice(0, 3)));
    await browser.close(); server.close();
}
process.exit(code);
