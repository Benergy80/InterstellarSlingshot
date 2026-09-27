#!/usr/bin/env node
// =============================================================================
// KEEP-CHECK — automated guard for the overhaul features Ben chose to KEEP.
//
// The hybrid restores ORIGINAL craft/enemies/effects/HUD/intro onto the
// OVERHAUL (see HYBRID-BRIEF.md). This script boots a build headless on the
// real GPU, stages each KEEP feature deterministically with the game's own
// functions, measures it, and compares against scripts/keep-baseline.json
// (measured on build 8b44894, the hybrid base).
//
// RUN
//   node scripts/keep-check.mjs --root <build dir> --out <dir>
//     --root <dir>     build to serve (default: this repo), served no-store
//     --out <dir>      JSON of all measurements + one PNG per staged moment
//                      (default: .critic/keepcheck)
//     --baseline <f>   baseline to compare against (default scripts/keep-baseline.json)
//     --hy k:v,k:v     append ?hy=… to flip hybrid switches for this run
//     --rebaseline     write the current run as the new baseline (see below)
//   Prints one PASS / FAIL / KNOWN line per check, exits 1 on any FAIL,
//   2 if the build never booted. Whole run ~2-3 minutes.
//
// CHECKS (Ben's words in quotes)
//   1 slingshot  "the new gravitational slingshot": staged next to a non-Sol
//                planet, executeSlingshot() → whip arc captures, releases,
//                delivers the boost (entry / peak / +1s exit speed), FOV kick,
//                whip trail + gravity-well rings in the scene.
//   2 warp       "the warp animations": O-key warp in open space → tunnel +
//                warp starfield live, FOV widens then settles back, and the
//                warp ENDS with an exit beat (exit ramp / warpExitBeat).
//   3 park       "the demo player warps towards a planet and then stops when it
//                is big and right in front": the demo pilot flies its own
//                warpToNebulaCluster leg (enemies stashed so it isn't pulled
//                into a dogfight); after the arrival park → speed, off-centre
//                angle, angular size of the subject.
//   4 steering   "control of steering during an emergency warp or slingshot":
//                yaw / pitch held during a warp, yaw after slingshot release,
//                each measured against a no-input control run. NOTE: in 8b44894
//                a slingshot glide turns the VIEW (~9°/s) but not the velocity
//                (0°) — the guard holds the view turn; velocity is recorded.
//   5 enemyAI    "the advanced enemy behaviors": 8 nearest hostiles pulled in
//                around the ship for a 12 s combat soak; records which of the
//                overhaul-added states were entered (see ADVANCED below) and
//                shots fired.
//   6 thrusters  "the thruster animations": additive plume objects on the
//                player ship; energy (opacity x scale) at idle / thrust / boost.
//                Judged on RESPONSE (ratios), not on the ship's look.
//   7 scale      "the big beautiful scale of the planets ... new lighting":
//                non-local planets / moons / stars — count, median + p90
//                world radius, shader-material share — and scene lights.
//                Sol and the other local-system bodies are RECORDED only
//                (another package enlarges Sol on purpose).
//   8 health     uncaught page errors, window.__selftest.fails() (fps
//                warnings ignored), median fps over an unstaged demo window.
//   9 enemyFlight Ben (2026-09-27): "enemy movement is a little too erratic
//                ... emulate the physics of space flight so maneuvers should be
//                effected by momentum and ship nose direction and thrust". Same
//                8-fighter dogfight staging as check 5, one sample per fighter
//                per AI tick for 12 s: velocity swings >60° in one tick (per
//                s), nose turn-rate p95, acceleration p95 vs the flight table
//                (window.ENEMY_FLIGHT), ticks that jumped further than max speed
//                allows, nose-to-velocity angle when cruising. Fails under
//                ?hy=enemyFlight:overhaul (swings ~3/s, turn p95 ~280°/s).
//
// VERDICTS  Each check is a list of criteria. A criterion that also failed in
//   the baseline is KNOWN (the overhaul never met it) and does not fail the run
//   — the guard catches things getting WORSE. Relative criteria (vs baseline)
//   use loose tolerances because planet radii, enemy spawns and demo timing
//   are randomised per load.
//
// RE-BASELINE  after an intentional change to a KEEP feature:
//   node scripts/keep-check.mjs --root . --out .critic/keepcheck --rebaseline
//   then commit scripts/keep-baseline.json. Run it twice first and make sure
//   the numbers are stable; a criterion failing at re-baseline becomes KNOWN.
//
// SANITY  run against the ORIGINAL (main-baseline) it FAILs warp, park,
//   steering, enemyAI and scale (and slingshot launchRamp/fx, thruster plume
//   count) — i.e. it notices when a KEEP feature is reverted.
//
// Does NOT depend on: ship/enemy model internals, explosions, sound, HUD DOM,
// the intro beyond #introDemoBtn, Sol planet sizes, or the start position.
// Optional internals (_wtu, _whipTrail, _ebState, warpExitBeat,
// window.__warpdiag) are read defensively; a missing one shows up in the
// numbers rather than crashing the run.
// =============================================================================
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const PW_CANDIDATES = [
    join(HERE, 'node_modules/playwright-core/index.mjs'),
    '/Users/benstagl/InterstellarSlingshot/.claude/worktrees/hybrid/node_modules/playwright-core/index.mjs',
    '/Users/benstagl/InterstellarSlingshot/node_modules/playwright-core/index.mjs',
];
const pwPath = PW_CANDIDATES.find(existsSync);
if (!pwPath) { console.error('keep-check: playwright-core not found — run npm ci'); process.exit(2); }
const { chromium } = await import(pathToFileURL(pwPath).href);

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
const ROOT = resolve(opt('root', HERE));
const OUT = resolve(opt('out', join(HERE, '.critic/keepcheck')));
const BASE_FILE = resolve(opt('baseline', join(HERE, 'scripts/keep-baseline.json')));
const HY = opt('hy', '');
const REBASE = flag('rebaseline');
const T_START = Date.now();

// Overhaul-added enemy behaviour states (diff of the behaviour functions in
// js/game-controls.js, ORIGINAL → 8b44894):
//   _patternAttackMode → attackMode 'evade' / 'flank' overrides, driven by the
//     faction fire clock (_attackPhase: setup → aim → burst → break);
//   _updateEnemyFireCycle → telegraphed shots (ud._telegraphing);
//   _updateEnemyCombatFeel → evasive manoeuvres (ud._evade.type: barrel,
//     corkscrew, splitS, …); updateEnhancedEnemyBehavior maps modes onto
//     behaviorState pursue / strafe / retreat.
const ADVANCED = (k) => /^(telegraph|phase:(aim|burst|break)|evade:|attackMode:(evade|flank)|behaviorState:(strafe|retreat))/.test(k);

// ── serve the build ──────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.ogg': 'audio/ogg', '.json': 'application/json', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = await new Promise((done) => {
    const s = http.createServer(async (req, res) => {
        try {
            let rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\.])+/, '');
            if (rel === '') rel = 'index.html';
            const data = await readFile(join(ROOT, rel));
            res.writeHead(200, { 'Content-Type': MIME[extname(rel).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store, max-age=0' });
            res.end(data);
        } catch { res.writeHead(404); res.end('not found'); }
    });
    s.listen(0, '127.0.0.1', () => done(s));
});
await mkdir(OUT, { recursive: true });
const baseline = (!REBASE && existsSync(BASE_FILE)) ? JSON.parse(readFileSync(BASE_FILE, 'utf8')) : null;

const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message || e).slice(0, 400)));
// window.__warpdiag (autopilot.js) exposes goPhase / unlockWarp — only armed under this flag.
await page.addInitScript(`try{localStorage.setItem('warpdiag','1');localStorage.removeItem('warpdiag_legs');}catch(e){}`);

const results = { build: null, root: ROOT, hy: HY || null, at: new Date().toISOString(), checks: {} };
const saveJson = () => writeFile(join(OUT, 'keep-check.json'), JSON.stringify(results, null, 2));
const shot = async (name) => { try { await page.screenshot({ path: join(OUT, `keep-${name}.png`) }); } catch (e) { /* evidence only */ } };

// ── page-side helpers, installed once ────────────────────────────────────────
const HELPERS = `(() => {
  const ie = eval;
  const K = window.__kc = {};
  K.ie = ie;
  K.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  K.deg = (a, b) => +(Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI).toFixed(2);
  K.nebPlanets = () => ie('planets').filter((p) => p.userData && p.userData.nebulaId !== undefined && p.userData.type === 'planet');
  K.stashEnemies = () => { const E = ie('enemies'); if (!K.stash) K.stash = []; K.stash.push(...E.splice(0, E.length)); };
  K.restoreEnemies = () => { if (K.stash) { ie('enemies').push(...K.stash); K.stash = null; } };
  K.reset = () => {
    const gs = ie('gameState'), keys = ie('keys');
    Object.keys(keys).forEach((k) => { if (keys[k] === true) keys[k] = false; });
    if (gs.slingshot) Object.assign(gs.slingshot, { active: false, postSlingshot: false, timeRemaining: 0, exitRamp: null });
    gs.slingshotWhip = null; gs.slingshotLaunchRamp = null; gs.slingshotCooldownUntil = 0;
    Object.assign(gs.emergencyWarp, { active: false, transitioning: false, postWarp: false, exitRamp: null, isJump: false, autoBraking: false });
    gs.emergencyWarp.available = Math.max(5, gs.emergencyWarp.available || 0);
    gs.energy = 100; gs.hull = gs.maxHull || 100; gs.gameOver = false;
    // Shields left up by the demo's last fight eat the O key ("Warp Blocked").
    try { if (window.deactivateShields && ie('shieldSystem').active) window.deactivateShields(); } catch (e) { /* optional */ }
  };
  // open space: 12000u outward of the first nebula planet, facing outward
  // (hybrid solScale:big spreads systems over the 40-90k shell, so the first
  // guess can land inside one: step outward until nothing is within 8,000 u of
  // its surface — "open space" is the point of the staging)
  K.isOpen = (p) => !ie('planets').some((b) => b && b.userData && b.userData.type !== 'asteroid' && b.geometry &&
      b.geometry.parameters && b.getWorldPosition(new THREE.Vector3()).distanceTo(p) - (b.geometry.parameters.radius || 0) < 8000) &&
      !(K.stash || []).concat(ie('enemies')).some((e) => e && e.position && e.userData && e.userData.health > 0 && e.position.distanceTo(p) < 6000);
  K.openSpace = () => {
    const cam = ie('camera'); const a = K.nebPlanets()[0].getWorldPosition(new THREE.Vector3());
    const dir = a.clone().normalize();
    let far = 12000;
    for (let i = 0; i < 20 && !K.isOpen(a.clone().addScaledVector(dir, far)); i++) far += 4000;
    cam.position.copy(a).addScaledVector(dir, far + Math.random() * 50);
    cam.lookAt(cam.position.clone().addScaledVector(dir, 1000));
    ie('gameState').velocityVector.copy(dir).multiplyScalar(1);
    return dir;
  };
  K.additiveVisible = () => { let n = 0; ie('scene').traverse((o) => { if (o.visible && o.material && o.material.blending === THREE.AdditiveBlending) n++; }); return n; };
  // per-frame FOV watcher: short kicks fall between setTimeout samples
  K.fov = { max: 0, min: 999 }; K.fovReset = () => { K.fov.max = 0; K.fov.min = 999; };
  (function tick() { try { const f = ie('camera').fov; if (f > K.fov.max) K.fov.max = f; if (f < K.fov.min) K.fov.min = f; } catch (e) {} requestAnimationFrame(tick); })();
  return 'ok';
})()`;

// ── the checks (each runs in the page) ───────────────────────────────────────
const CHECKS = [];
const check = (name, fn, arg) => CHECKS.push({ name, fn, arg });

check('health_pre', async () => {
    const K = window.__kc, sleep = K.sleep; const fps = [];
    for (let i = 0; i < 16; i++) { await sleep(500); if (window.__perf && window.__perf.fps) fps.push(window.__perf.fps); }
    fps.sort((a, b) => a - b);
    let fails = null;
    try { fails = window.__selftest ? window.__selftest.fails() : null; } catch (e) { fails = [{ check: 'probe error', detail: String(e) }]; }
    const real = (fails || []).filter((f) => !/fps|frame/i.test(f.check + ' ' + (f.detail || '')));
    return { fpsMedian: fps.length ? +fps[Math.floor(fps.length / 2)].toFixed(1) : null, fpsSamples: fps.length,
        selftest: fails ? real.map((f) => f.check) : 'no probe', selftestFails: fails ? real.length : null };
});

check('enemyAI', async () => {
    const K = window.__kc, ie = K.ie, sleep = K.sleep; const cam = ie('camera'), gs = ie('gameState');
    const E = ie('enemies');
    const live = E.filter((e) => e.userData && e.userData.health > 0 && !e.userData.isBoss && e.position);
    live.sort((a, b) => a.position.distanceTo(cam.position) - b.position.distanceTo(cam.position));
    const pick = live.slice(0, 8);
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    pick.forEach((e, i) => { const a = i / 8 * Math.PI * 2;
        e.position.copy(cam.position).addScaledVector(fwd, 350).add(new THREE.Vector3(Math.cos(a) * 250, Math.sin(a) * 80, Math.sin(a) * 250)); });
    let shots = 0; const of = window.fireEnemyWeapon;
    if (typeof of === 'function') window.fireEnemyWeapon = function () { shots++; return of.apply(this, arguments); };
    const seen = {}; const t0 = Date.now();
    try {
        while (Date.now() - t0 < 12000) {
            await sleep(250); gs.hull = gs.maxHull || 100;
            pick.forEach((e) => { const u = e.userData; const add = (k) => { seen[k] = (seen[k] || 0) + 1; };
                if (u.attackMode) add('attackMode:' + u.attackMode);
                if (u.behaviorState) add('behaviorState:' + u.behaviorState);
                if (u._evade) add('evade:' + (u._evade.type || '?'));
                if (u._telegraphing) add('telegraph');
                if (typeof window._attackPhase === 'function') { try { add('phase:' + window._attackPhase(e)); } catch (x) { /* optional */ } }
            });
        }
    } finally { if (typeof of === 'function') window.fireEnemyWeapon = of; }
    return { enemies: E.length, soaked: pick.length, shots, seen };
});

check('enemyFlight', async () => {
    const K = window.__kc, ie = K.ie, sleep = K.sleep; const cam = ie('camera'), gs = ie('gameState');
    const E = ie('enemies');
    const live = E.filter((e) => e.userData && e.userData.health > 0 && !e.userData.isBoss && !e.userData.isUFO && e.position);
    live.sort((a, b) => a.position.distanceTo(cam.position) - b.position.distanceTo(cam.position));
    const pick = live.slice(0, 8);
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    pick.forEach((e, i) => { const a = i / 8 * Math.PI * 2;
        e.position.copy(cam.position).addScaledVector(fwd, 350).add(new THREE.Vector3(Math.cos(a) * 250, Math.sin(a) * 80, Math.sin(a) * 250));
        if (e.userData._iFrom) { e.userData._iFrom.copy(e.position); e.userData._iTo.copy(e.position); } });
    // one sample per fighter per AI tick: true position (floating origin undone), nose, active
    const S = pick.map(() => []); const Z = new THREE.Vector3(); const t0 = performance.now();
    const ou = window.updateEnemyBehavior;
    window.updateEnemyBehavior = function () {
        const r = ou.apply(this, arguments); const t = (performance.now() - t0) / 1000; const o = window.worldOriginOffset || { x: 0, y: 0, z: 0 };
        pick.forEach((e, i) => { if (!e.userData || e.userData.health <= 0) return; Z.set(0, 0, -1).applyQuaternion(e.quaternion);
            S[i].push([t, e.position.x + o.x, e.position.y + o.y, e.position.z + o.z, Z.x, Z.y, Z.z, e.userData.isActive ? 1 : 0]); });
        return r;
    };
    try { while (performance.now() - t0 < 12000) { await sleep(250); gs.hull = gs.maxHull || 100; } }
    finally { window.updateEnemyBehavior = ou; }
    const R2D = 180 / Math.PI; const len = (a) => Math.hypot(a[0], a[1], a[2]);
    const ang = (a, b) => { const la = len(a), lb = len(b); return (la < 1e-9 || lb < 1e-9) ? NaN : Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb)))) * R2D; };
    const T = window.ENEMY_FLIGHT && window.ENEMY_FLIGHT.fighter;
    const vmax = T ? T.maxSpeed : null; const amax = T ? T.mainThrust + T.manThrust : null;
    const M = { speed: [], accel: [], turn: [], slipCruise: [] }; let swings = 0, secs = 0, ticks = 0, overspeed = 0;
    S.forEach((s0) => { const s = s0.filter((x) => x[0] > 0.6 && x[7] === 1); let pv = null;
        for (let k = 1; k < s.length; k++) { const a = s[k - 1], b = s[k], dt = b[0] - a[0];
            if (!(dt > 0.005 && dt < 0.2)) { pv = null; continue; }
            const d = [b[1] - a[1], b[2] - a[2], b[3] - a[3]]; const j = len(d); if (j > 1500) { pv = null; continue; }
            const v = d.map((x) => x / dt), sp = len(v); ticks++; secs += dt; M.speed.push(sp);
            if (vmax && j > vmax * dt * 1.1 + 1) overspeed++;
            const w = ang(a.slice(4, 7), b.slice(4, 7)) / dt; M.turn.push(w);
            if (pv) { M.accel.push(len([v[0] - pv[0], v[1] - pv[1], v[2] - pv[2]]) / dt); if (ang(pv, v) > 60) swings++; }
            if (sp > 20 && w < 30) M.slipCruise.push(ang(b.slice(4, 7), v));
            pv = v; } });
    const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.floor(f * (s.length - 1))].toFixed(1); };
    return { flight: window.HYBRID ? window.HYBRID.get('enemyFlight') : null, soaked: pick.length, fighterSeconds: +secs.toFixed(1), ticks,
        speedMed: q(M.speed, 0.5), speedP95: q(M.speed, 0.95), accelMed: q(M.accel, 0.5), accelP95: q(M.accel, 0.95), accelMax: q(M.accel, 1),
        turnMed: q(M.turn, 0.5), turnP95: q(M.turn, 0.95), slipCruiseMed: q(M.slipCruise, 0.5),
        swingsPerSec: +(swings / Math.max(1e-6, secs)).toFixed(2), overspeedTicks: overspeed, tableMaxSpeed: vmax, tableMaxAccel: amax };
});

check('scale', async () => {
    const K = window.__kc, ie = K.ie; const scn = ie('scene');
    const SOL = /^(Sol|Mercury|Venus|Earth|Luna|Mars|Phobos|Deimos|Jupiter|Io|Europa|Ganymede|Callisto|Saturn|Titan|Enceladus|Uranus|Titania|Neptune|Triton)$/;
    const ws = new THREE.Vector3();
    const R = (p) => { const g = p.geometry; if (!g) return 0; if (!g.boundingSphere && g.computeBoundingSphere) g.computeBoundingSphere();
        p.getWorldScale(ws); return (g.boundingSphere ? g.boundingSphere.radius : 0) * Math.max(ws.x, ws.y, ws.z); };
    const groups = {}; const sol = {};
    ie('planets').forEach((p) => {
        const u = p.userData || {};
        if (SOL.test(u.name || '')) { sol[u.name] = { R: +R(p).toFixed(1), mat: p.material && p.material.type }; return; }
        if (u.isLocal || u.isLocalStar) return;
        if (!/^(planet|moon|star)$/.test(u.type)) return;
        const k = u.type + (u.nebulaId !== undefined ? '@nebula' : '@system');
        (groups[k] = groups[k] || []).push({ R: R(p), shader: !!(p.material && (p.material.isShaderMaterial || p.material.type === 'ShaderMaterial')), mat: p.material && p.material.type });
    });
    const q = (a, f) => a.length ? a[Math.floor(f * (a.length - 1))] : 0;
    const out = { groups: {}, sol };
    Object.keys(groups).sort().forEach((k) => { const g = groups[k]; const rs = g.map((x) => x.R).sort((a, b) => a - b);
        const mats = {}; g.forEach((x) => { mats[x.mat] = (mats[x.mat] || 0) + 1; });
        out.groups[k] = { n: g.length, medR: +q(rs, 0.5).toFixed(1), p90R: +q(rs, 0.9).toFixed(1), maxR: +q(rs, 1).toFixed(1),
            shaderFrac: +(g.filter((x) => x.shader).length / g.length).toFixed(3), mats }; });
    const L = {}; let pointI = 0;
    scn.traverse((o) => { if (o.isLight) { L[o.type] = (L[o.type] || 0) + 1; if (o.isPointLight) pointI += o.intensity || 0; } });
    out.lights = L; out.lightTotal = Object.values(L).reduce((a, b) => a + b, 0); out.pointIntensity = +pointI.toFixed(1);
    return out;
});

check('park', async () => {
    const K = window.__kc, ie = K.ie, sleep = K.sleep; const cam = ie('camera'), gs = ie('gameState');
    const D = window.__warpdiag, dp = window.demoPilot;
    if (!dp || !dp.active) return { err: 'demo pilot not active' };
    if (!D || !D.goPhase) return { err: 'window.__warpdiag missing (autopilot.js warpdiag hooks)' };
    K.stashEnemies(); K.reset();
    K.openSpace(); gs.velocityVector.set(0, 0, 0);
    const parks0 = dp.arrivalParks; D.unlockWarp(); D.goPhase('warpToNebulaCluster');
    const t0 = Date.now(); let warped = false;
    const trace = [];
    // Nebulae sit 28-60k out since the scale package, so the leg is long: allow 90 s.
    while (Date.now() - t0 < 90000) {
        await sleep(250); if (gs.emergencyWarp.active) warped = true; if (dp.arrivalParks > parks0) break;
        if (!trace.length || trace[trace.length - 1][1] !== dp.phase) trace.push([Math.round((Date.now() - t0) / 100) / 10, dp.phase, ie('enemies').length]);
        // Moving to open space can cross into another galaxy's range, and the
        // game then loads that galaxy's enemies — 200-odd of them, which drag the
        // pilot into a fight. This check is about the PARK, so keep them stashed.
        if (ie('enemies').length) K.stashEnemies();
        // A post-kill timer from the demo's last fight (mine / findLocalEnemies)
        // can overwrite the staged phase a beat later; hold the leg until it warps.
        if (!warped && Date.now() - t0 < 15000 && dp.phase !== 'warpToNebulaCluster' && dp.phase !== 'coastToNebulaCluster') D.goPhase('warpToNebulaCluster');
    }
    const parkMs = dp.arrivalParks > parks0 ? Date.now() - t0 : null;
    await sleep(600);   // let the park settle a beat, as a viewer would see it
    const out = { parked: parkMs !== null, parkMs, warped, park: dp.lastArrivalPark, phase: dp.phase, trace: trace.slice(0, 20) };
    const as = gs._arrivalSubject;
    if (as && as.obj) {
        const wp = as.obj.getWorldPosition(new THREE.Vector3()); const fwd = cam.getWorldDirection(new THREE.Vector3());
        const to = wp.clone().sub(cam.position); const d = to.length();
        const g = as.obj.geometry; if (g && !g.boundingSphere && g.computeBoundingSphere) g.computeBoundingSphere();
        const Rw = g && g.boundingSphere ? g.boundingSphere.radius * as.obj.getWorldScale(new THREE.Vector3()).x : (as.radius || 0);
        Object.assign(out, { subject: as.obj.userData && as.obj.userData.name, dist: Math.round(d), radius: +Rw.toFixed(1),
            offDeg: K.deg(to.normalize(), fwd), angDeg: +(2 * Math.atan(Rw / d) * 180 / Math.PI).toFixed(2),
            speed: +gs.velocityVector.length().toFixed(3), fov: +cam.fov.toFixed(1) });
    }
    return out;
});

check('thrusters', async () => {
    const K = window.__kc, ie = K.ie, sleep = K.sleep; const gs = ie('gameState'), keys = ie('keys');
    if (window.demoPilot && window.demoPilot.active) window.demoPilot.stop();
    K.stashEnemies(); K.reset();
    const dir = K.openSpace();
    if (typeof window.setCameraThirdPerson === 'function') window.setCameraThirdPerson();
    await sleep(900);
    const plume = () => {
        const ship = window.cameraState && window.cameraState.playerShipMesh; if (!ship) return { err: 'no playerShipMesh' };
        const seen = new Set(); let n = 0, nv = 0, e = 0; const ws = new THREE.Vector3();
        const add = (o) => { if (!o || seen.has(o)) return; seen.add(o); const m = o.material;
            if (!m || m.blending !== THREE.AdditiveBlending) return; n++;
            for (let q = o; q; q = q.parent) if (!q.visible) return; nv++;
            o.getWorldScale(ws); const op = m.uniforms && m.uniforms.uOpacity ? m.uniforms.uOpacity.value : (m.opacity !== undefined ? m.opacity : 1);
            e += op * (Math.abs(ws.x) + Math.abs(ws.y) + Math.abs(ws.z)) / 3; };
        ship.traverse(add);
        try { const eb = ie('_ebState'); ['adopted', 'nozzles', 'corona', 'streak'].forEach((k) => (eb[k] || []).forEach(add)); } catch (x) { /* optional */ }
        return { n, visible: nv, energy: +e.toFixed(3) };
    };
    const out = { shipVisible: !!(window.cameraState && window.cameraState.playerShipMesh && window.cameraState.playerShipMesh.visible) };
    gs.velocityVector.copy(dir).multiplyScalar(gs.minVelocity || 0.4); await sleep(1200); out.idle = plume();
    keys.w = true; await sleep(1500); out.thrust = plume(); out.thrustSpeed = +gs.velocityVector.length().toFixed(2);
    keys.wDoubleTap = true; await sleep(900); out.boost = plume(); out.boostSpeed = +gs.velocityVector.length().toFixed(2);
    keys.w = false; keys.wDoubleTap = false;
    return out;
});

check('slingshot', async () => {
    const K = window.__kc, ie = K.ie, sleep = K.sleep; const cam = ie('camera'), gs = ie('gameState'), keys = ie('keys');
    if (window.demoPilot && window.demoPilot.active) window.demoPilot.stop();
    K.stashEnemies();
    const body = K.nebPlanets().filter((p) => p.geometry && p.geometry.parameters && p.geometry.parameters.radius > 25 && p.geometry.parameters.radius < 140)[0];
    if (!body) return { err: 'no staging planet' };
    const range = ie('getSlingshotRange')(body);
    const run = async (steer) => {
        K.reset();
        const bp = body.getWorldPosition(new THREE.Vector3());
        cam.position.copy(bp).add(new THREE.Vector3(range * 0.6, 20, 0));
        cam.lookAt(bp.clone().add(new THREE.Vector3(0, 0, 3000)));
        gs.velocityVector.copy(cam.getWorldDirection(new THREE.Vector3())).multiplyScalar(2);
        const r = {};
        for (let i = 0; i < 30 && ie('findSlingshotTarget')() !== body; i++) await sleep(100);
        r.inRange = ie('findSlingshotTarget')() === body;
        const a0 = K.additiveVisible(), fov0 = cam.fov, v0 = gs.velocityVector.length(); K.fovReset();
        ie('executeSlingshot')();
        Object.assign(r, { entry: +v0.toFixed(2), captured: !!gs.slingshot.active, fov0: +fov0.toFixed(1) });
        const t0 = Date.now(); let rel = null, relV = null, relC = null, peak = 0, fmax = 0, amax = 0, trail = false, ramp = false, whip = false;
        while (Date.now() - t0 < 7000) {
            await sleep(100); gs.hull = gs.maxHull || 100;
            const v = gs.velocityVector.length(); peak = Math.max(peak, v); fmax = Math.max(fmax, cam.fov); amax = Math.max(amax, K.additiveVisible());
            try { if (ie('_whipTrail')) trail = true; } catch (x) { /* optional */ }
            if (gs.slingshotWhip) whip = true; if (gs.slingshotLaunchRamp) ramp = true;
            if (rel === null && whip && !gs.slingshotWhip) { rel = Date.now() - t0; relV = gs.velocityVector.clone().normalize();
                relC = cam.getWorldDirection(new THREE.Vector3()); if (steer) keys.left = true; }
            if (rel !== null && Date.now() - t0 > rel + 1000) break;
        }
        keys.left = false;
        Object.assign(r, { whip, releaseMs: rel, peak: +peak.toFixed(1), exit: +gs.velocityVector.length().toFixed(2),
            fovKick: +(Math.max(fmax, K.fov.max) - fov0).toFixed(1), addedFx: amax - a0, trail, ramp, stillActive: !!gs.slingshot.active });
        if (relV) { r.velTurn = K.deg(relV, gs.velocityVector.clone().normalize()); r.camTurn = K.deg(relC, cam.getWorldDirection(new THREE.Vector3())); }
        return r;
    };
    const control = await run(false);
    const steered = await run(true);
    K.reset();
    return { body: body.userData.name, bodyR: +body.geometry.parameters.radius.toFixed(1), range: Math.round(range), control, steered };
});

check('warp', async () => {
    const K = window.__kc, ie = K.ie, sleep = K.sleep; const cam = ie('camera'), gs = ie('gameState'), keys = ie('keys');
    if (window.demoPilot && window.demoPilot.active) window.demoPilot.stop();
    K.stashEnemies();
    let beats = 0; const oeb = window.warpExitBeat;
    if (typeof oeb === 'function') window.warpExitBeat = function () { beats++; return oeb.apply(this, arguments); };
    const run = async (steerKey) => {
        K.reset(); K.openSpace(); await sleep(600);
        const b0 = beats, fov0 = cam.fov; const r = { fov0: +fov0.toFixed(1) }; K.fovReset();
        keys.o = true;
        const t0 = Date.now(); let eng = null, end = null, engV = null, steerAt = null, fmax = 0, tun = 0, sf = false, peak = 0, ramp = false;
        while (Date.now() - t0 < 14000) {
            await sleep(100); gs.hull = gs.maxHull || 100;
            const ew = gs.emergencyWarp; peak = Math.max(peak, gs.velocityVector.length()); fmax = Math.max(fmax, cam.fov);
            try { tun = Math.max(tun, ie('_wtu').level || 0); } catch (x) { /* optional */ }
            if (window.warpStarfield && window.warpStarfield.lines && window.warpStarfield.lines.visible) sf = true;
            if (ew.exitRamp && ew.exitRamp.active) ramp = true;
            if (eng === null && ew.active) eng = Date.now() - t0;
            if (eng !== null && !engV && Date.now() - t0 > eng + 400) { engV = gs.velocityVector.clone().normalize(); steerAt = Date.now() - t0; if (steerKey) keys[steerKey] = true; }
            if (engV && r.turn === undefined && Date.now() - t0 > steerAt + 1500) { if (steerKey) keys[steerKey] = false; r.turn = K.deg(engV, gs.velocityVector.clone().normalize()); }
            if (eng !== null && end === null && !ew.active) end = Date.now() - t0;
            if (end !== null && Date.now() - t0 > end + 1800) break;
        }
        if (steerKey) keys[steerKey] = false;
        Object.assign(r, { engageMs: eng, endMs: end, peak: +peak.toFixed(1), after: +gs.velocityVector.length().toFixed(2),
            fovKick: +(Math.max(fmax, K.fov.max) - fov0).toFixed(1), fovSettle: +(cam.fov - fov0).toFixed(1), tunnel: +tun.toFixed(2),
            starfield: sf, exitRamp: ramp, exitBeats: beats - b0 });
        return r;
    };
    try {
        const control = await run(null);
        const yaw = await run('left');
        const pitch = await run('up');
        return { control, yaw, pitch };
    } finally { if (typeof oeb === 'function') window.warpExitBeat = oeb; K.reset(); }
});

// Screenshot moments: taken right after the named check finishes.
const SHOT_AFTER = { park: 'park', thrusters: 'thrusters' };

// ── verdicts ─────────────────────────────────────────────────────────────────
// Each returns [{ id, ok, msg }]. `b` is the baseline's metrics (or null).
const n = (x) => (typeof x === 'number' && isFinite(x) ? x : NaN);
const rel = (b, f) => (b ? f(b) : true);
const JUDGE = {
    slingshot: (m, b) => { const c = m.control || {}; const bc = b && b.control;
        return [
            { id: 'captured', ok: !!(c.captured && c.whip), msg: `captured=${!!c.captured} whip=${!!c.whip}` },
            { id: 'released', ok: c.releaseMs !== null && n(c.releaseMs) <= 4000, msg: `release ${c.releaseMs}ms` },
            { id: 'boost', ok: n(c.peak) >= 20 && rel(bc, (x) => c.peak >= 0.7 * x.peak), msg: `entry ${c.entry} → peak ${c.peak}${bc ? ` (base ${bc.peak})` : ''} → +1s ${c.exit} u/f` },
            { id: 'exit', ok: n(c.exit) >= 3 * Math.max(0.5, n(c.entry)), msg: `+1s exit ${c.exit} vs entry ${c.entry}` },
            { id: 'fovKick', ok: n(c.fovKick) >= 3, msg: `FOV +${c.fovKick}°` },
            { id: 'visuals', ok: !!c.trail && n(c.addedFx) >= 10, msg: `trail=${!!c.trail} +${c.addedFx} additive fx` },
            { id: 'launchRamp', ok: !!c.ramp, msg: `launch ramp=${!!c.ramp}` },
        ]; },
    warp: (m, b) => { const c = m.control || {}; const bc = b && b.control;
        return [
            { id: 'engaged', ok: c.engageMs !== null, msg: `engaged @${c.engageMs}ms peak ${c.peak} u/f` },
            { id: 'visuals', ok: n(c.tunnel) >= 0.5 && !!c.starfield, msg: `tunnel ${c.tunnel} starfield=${!!c.starfield}` },
            { id: 'fovWiden', ok: n(c.fovKick) >= 10 && rel(bc, (x) => c.fovKick >= 0.5 * x.fovKick), msg: `FOV +${c.fovKick}°` },
            { id: 'fovSettle', ok: Math.abs(n(c.fovSettle)) <= 6, msg: `FOV ${c.fovSettle >= 0 ? '+' : ''}${c.fovSettle}° from start after exit` },
            { id: 'ends', ok: c.endMs !== null && n(c.endMs) <= 12000, msg: `ended @${c.endMs}ms` },
            { id: 'exitBeat', ok: (!!c.exitRamp || n(c.exitBeats) >= 1) && n(c.after) <= 0.5 * n(c.peak), msg: `exitRamp=${!!c.exitRamp} beats=${c.exitBeats} speed after ${c.after}` },
        ]; },
    park: (m, b) => [
        { id: 'parked', ok: !!m.parked, msg: m.err ? m.err : `parked=${!!m.parked} in ${m.parkMs}ms on ${m.subject || '-'}` },
        { id: 'stopped', ok: n(m.speed) <= 1.0, msg: `speed ${m.speed} u/f` },
        { id: 'centred', ok: n(m.offDeg) <= 5, msg: `${m.offDeg}° off centre` },
        { id: 'big', ok: n(m.angDeg) >= 15 && rel(b, (x) => m.angDeg >= 0.5 * x.angDeg), msg: `${m.angDeg}° across (d=${m.dist} R=${m.radius})` },
    ],
    steering: (m, b) => { const w = m.warp || {}, s = m.slingshot || {};
        const wYaw = n(w.yaw && w.yaw.turn) - n(w.control && w.control.turn);
        const wPitch = n(w.pitch && w.pitch.turn) - n(w.control && w.control.turn);
        const sCam = n(s.steered && s.steered.camTurn) - n(s.control && s.control.camTurn);
        const sVel = n(s.steered && s.steered.velTurn) - n(s.control && s.control.velTurn);
        const bw = b && b.warp, bs = b && b.slingshot;
        const bYaw = bw ? n(bw.yaw && bw.yaw.turn) - n(bw.control && bw.control.turn) : null;
        const bSCam = bs ? n(bs.steered && bs.steered.camTurn) - n(bs.control && bs.control.camTurn) : null;
        return [
            { id: 'warpYaw', ok: wYaw >= 15 && (bYaw === null || wYaw >= 0.4 * bYaw), msg: `warp yaw bends heading +${wYaw.toFixed(1)}° vs control${bYaw !== null ? ` (base +${bYaw.toFixed(1)})` : ''}` },
            { id: 'warpPitch', ok: wPitch >= 1, msg: `warp pitch +${wPitch.toFixed(1)}°` },
            { id: 'slingCam', ok: sCam >= 1.5 && (bSCam === null || sCam >= 0.4 * bSCam), msg: `slingshot glide yaw turns view +${sCam.toFixed(1)}° (velocity +${sVel.toFixed(1)}°)` },
        ]; },
    enemyAI: (m, b) => { const adv = Object.keys(m.seen || {}).filter(ADVANCED);
        const badv = b ? Object.keys(b.seen || {}).filter(ADVANCED).length : null;
        return [
            { id: 'soak', ok: n(m.soaked) >= 4, msg: `${m.soaked} of ${m.enemies} enemies soaked, ${m.shots} shots` },
            { id: 'advanced', ok: adv.length >= 3 && (badv === null || adv.length >= Math.ceil(0.5 * badv)), msg: `${adv.length} advanced states entered${badv !== null ? ` (base ${badv})` : ''}: ${adv.join(' ')}` },
            { id: 'firing', ok: n(m.shots) >= 1, msg: `${m.shots} shots` },
        ]; },
    // Ben: "emulate the physics of space flight ... momentum and ship nose
    // direction and thrust". Absolute bounds (the flight model's own promise)
    // plus a loose no-worse-than-baseline on direction swings.
    enemyFlight: (m, b) => { const amax = n(m.tableMaxAccel) || 630;
        return [
            { id: 'soak', ok: n(m.fighterSeconds) >= 20, msg: `${m.soaked} fighters, ${m.fighterSeconds} fighter-s logged (flight=${m.flight})` },
            { id: 'swings', ok: n(m.swingsPerSec) <= 0.3 && (!b || n(m.swingsPerSec) <= Math.max(0.3, 2 * n(b.swingsPerSec))), msg: `${m.swingsPerSec}/s velocity swings >60° in one tick${b ? ` (base ${b.swingsPerSec})` : ''}` },
            { id: 'turnRate', ok: n(m.turnP95) <= 140, msg: `nose turn p95 ${m.turnP95}°/s (med ${m.turnMed})` },
            { id: 'accel', ok: n(m.accelP95) <= 1.15 * amax, msg: `accel p95 ${m.accelP95} u/s² (med ${m.accelMed}, max ${m.accelMax}; table ${amax})` },
            { id: 'momentum', ok: n(m.overspeedTicks) <= Math.max(1, 0.01 * n(m.ticks)), msg: `${m.overspeedTicks} of ${m.ticks} ticks jumped further than max speed allows (speed med ${m.speedMed}, p95 ${m.speedP95})` },
            { id: 'noseLeads', ok: n(m.slipCruiseMed) <= 15, msg: `nose-to-velocity ${m.slipCruiseMed}° median when cruising` },
        ]; },
    thrusters: (m, b) => { const i = m.idle || {}, t = m.thrust || {}, bo = m.boost || {}; const bt = b && b.thrust;
        return [
            { id: 'plume', ok: n(t.visible) >= 1 && (!bt || n(t.visible) >= 0.75 * bt.visible), msg: `${t.visible}/${t.n} plume objects visible under thrust${bt ? ` (base ${bt.visible})` : ''}` },
            { id: 'thrustResp', ok: n(t.energy) >= 3 * n(i.energy) + 0.5, msg: `energy idle ${i.energy} → thrust ${t.energy}` },
            { id: 'boostResp', ok: n(bo.energy) >= Math.max(0.95 * n(t.energy), 3 * n(i.energy) + 0.5), msg: `thrust ${t.energy} → boost ${bo.energy} (speed ${m.boostSpeed})` },
        ]; },
    scale: (m, b) => { const out = [];
        Object.keys((b && b.groups) || m.groups || {}).forEach((k) => { const g = (m.groups || {})[k] || { n: 0, medR: 0, p90R: 0, shaderFrac: 0 }; const bg = b && b.groups[k];
            // @system groups mix randomly-typed galaxy systems per load (measured planet medR 5.9-9.7, star medR 12-32, shader 0.22-0.36
            // across 5 runs of 8b44894), so they get loose bounds; @nebula groups are stable and tight.
            const L = /@system/.test(k) ? { n: 0.6, med: 0.3, p90: 0.7, sh: 0.2 } : { n: 0.7, med: 0.85, p90: 0.85, sh: 0.1 };
            out.push({ id: k, ok: g.n > 0 && (!bg || (g.n >= L.n * bg.n && g.medR >= L.med * bg.medR && g.p90R >= L.p90 * bg.p90R && g.shaderFrac >= bg.shaderFrac - L.sh)),
                msg: `${k}: n=${g.n} medR=${g.medR} p90R=${g.p90R} shader=${g.shaderFrac}${bg ? ` (base ${bg.n}/${bg.medR}/${bg.p90R}/${bg.shaderFrac})` : ''}` }); });
        out.push({ id: 'lights', ok: n(m.lightTotal) >= 1 && rel(b, (x) => m.lightTotal >= 0.8 * x.lightTotal && (m.lights.PointLight || 0) >= 0.8 * (x.lights.PointLight || 0)),
            msg: `lights ${JSON.stringify(m.lights)}${b ? ` (base ${JSON.stringify(b.lights)})` : ''}` });
        return out; },
    health: (m, b) => [
        { id: 'pageErrors', ok: m.pageErrors === 0, msg: `${m.pageErrors} uncaught page errors` },
        { id: 'selftest', ok: m.selftestFails === 0 || (b && typeof b.selftestFails === 'number' && m.selftestFails <= b.selftestFails), msg: `selftest non-fps fails: ${JSON.stringify(m.selftest)}` },
        { id: 'fps', ok: n(m.fpsMedian) > 0 && rel(b, (x) => !x.fpsMedian || m.fpsMedian >= 0.5 * x.fpsMedian), msg: `median fps ${m.fpsMedian}${b ? ` (base ${b.fpsMedian})` : ''}` },
    ],
};

// ── run ──────────────────────────────────────────────────────────────────────
let booted = false;
try {
    const q = HY ? `?hy=${encodeURIComponent(HY)}` : '';
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html${q}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#introDemoBtn', { timeout: 90000 });
    results.build = await page.evaluate(() => window.BUILD_TAG);
    await page.click('#introDemoBtn');
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.gameStarted && gameState.frameCount > 60, null, { timeout: 120000 });
    await page.evaluate(HELPERS);
    // Name the culprit: when a draw call throws, record WHICH object and material
    // (three.min.js stack traces alone say nothing). First 6 distinct offenders.
    await page.evaluate(() => {
        const r = (0, eval)('typeof renderer !== "undefined" ? renderer : null');
        if (!r || r.__kcWrapped) return;
        r.__kcWrapped = true;
        window.__kcBadDraws = [];
        const orig = r.renderBufferDirect;
        r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
            try { return orig.call(this, camera, scene, geometry, material, object, group); } catch (e) {
                const seen = window.__kcBadDraws;
                if (seen.length < 6 && !seen.some((s) => s.matUuid === material.uuid)) {
                    const chain = []; let p = object; while (p && chain.length < 5) { chain.push(`${p.type}:${p.name || ''}`); p = p.parent; }
                    seen.push({
                        msg: String(e.message).slice(0, 120), frame: window.gameState && gameState.frameCount,
                        matUuid: material.uuid, matType: material.type, matName: material.name,
                        flags: { basic: !!material.isMeshBasicMaterial, shader: !!material.isShaderMaterial, sprite: !!material.isSpriteMaterial,
                            points: !!material.isPointsMaterial, toneMapped: material.toneMapped, fog: material.fog, transparent: material.transparent },
                        uniforms: material.uniforms ? Object.keys(material.uniforms).slice(0, 12) : null,
                        chain, userData: Object.keys(object.userData || {}).slice(0, 12),
                    });
                }
                throw e;
            }
        };
    });
    booted = true;
    console.log(`keep-check: ${ROOT}  BUILD_TAG ${results.build}${HY ? '  hy=' + HY : ''}  (booted in ${((Date.now() - T_START) / 1000).toFixed(0)}s)`);
} catch (e) {
    console.error('keep-check: BOOT FAILED', e.message);
}

const raw = {};
if (booted) {
    for (const c of CHECKS) {
        const t = Date.now();
        try {
            if (page.isClosed()) throw new Error('page closed');
            raw[c.name] = await page.evaluate(c.fn, c.arg);
        } catch (e) {
            raw[c.name] = { err: 'check threw: ' + String(e.message || e).slice(0, 300) };
        }
        raw[c.name]._ms = Date.now() - t;
        if (SHOT_AFTER[c.name]) await shot(SHOT_AFTER[c.name]);
        results.raw = raw; await saveJson();
    }
    try { results.badDraws = await page.evaluate(() => window.__kcBadDraws || []); } catch (e) { /* page may be gone */ }
    if (results.badDraws && results.badDraws.length) console.log('keep-check: draw calls that threw →', JSON.stringify(results.badDraws, null, 1));
    try { await page.evaluate(() => { window.__kc.restoreEnemies(); window.__kc.reset(); }); } catch (e) { /* page may be gone */ }
}

// Assemble the 9 reported checks from the raw measurements.
const metrics = {
    slingshot: raw.slingshot,
    warp: raw.warp,
    park: raw.park,
    steering: raw.slingshot && raw.warp ? { slingshot: raw.slingshot, warp: raw.warp } : { err: 'needs slingshot + warp' },
    enemyAI: raw.enemyAI,
    enemyFlight: raw.enemyFlight,
    thrusters: raw.thrusters,
    scale: raw.scale,
    health: Object.assign({}, raw.health_pre || {}, { pageErrors: pageErrors.length, pageErrorSamples: pageErrors.slice(0, 5) }),
};
const LABEL = { slingshot: '1 slingshot', warp: '2 warp', park: '3 park', steering: '4 steering', enemyAI: '5 enemyAI',
    thrusters: '6 thrusters', scale: '7 scale', health: '8 health', enemyFlight: '9 enemyFlight' };
let anyFail = !booted;
results.checks = {};
for (const k of Object.keys(LABEL)) {
    const m = metrics[k] || { err: 'not run' };
    const bEntry = baseline && baseline.checks && baseline.checks[k];
    const known = new Set((bEntry && bEntry.knownFail) || []);
    let crit;
    try { crit = (m.err && !['park', 'health'].includes(k)) ? [{ id: 'ran', ok: false, msg: m.err }] : JUDGE[k](m, bEntry ? bEntry.metrics : null); }
    catch (e) { crit = [{ id: 'judge', ok: false, msg: 'judge threw: ' + e.message }]; }
    const failing = crit.filter((c) => !c.ok);
    const hard = failing.filter((c) => !known.has(c.id));
    const status = hard.length ? 'FAIL' : failing.length ? 'KNOWN' : 'PASS';
    if (status === 'FAIL' && !REBASE) anyFail = true;
    results.checks[k] = { status, criteria: crit, knownFail: failing.map((c) => c.id), metrics: m };
    const shown = (hard.length ? hard : failing.length ? failing : crit).map((c) => `${c.ok ? '' : (known.has(c.id) ? '[known] ' : '[FAIL] ')}${c.msg}`);
    console.log(`${status.padEnd(5)} ${LABEL[k].padEnd(12)} ${shown.join(' | ')}`);
}
results.pageErrors = pageErrors;
results.seconds = Math.round((Date.now() - T_START) / 1000);
await saveJson();

if (REBASE && booted) {
    const out = { note: 'keep-check baseline — measured by scripts/keep-check.mjs --rebaseline. knownFail = criteria the build already failed; they do not fail later runs.',
        build: results.build, root: ROOT, at: results.at, checks: {} };
    for (const [k, v] of Object.entries(results.checks)) out.checks[k] = { status: v.status === 'PASS' ? 'PASS' : 'KNOWN-FAIL', knownFail: v.knownFail, metrics: v.metrics };
    await writeFile(BASE_FILE, JSON.stringify(out, null, 2) + '\n');
    console.log('keep-check: baseline written →', BASE_FILE);
}
console.log(`keep-check: ${anyFail ? 'FAIL' : 'OK'} in ${results.seconds}s → ${join(OUT, 'keep-check.json')}`);
try { await browser.close(); } catch (e) { /* already gone */ }
server.close();
process.exit(booted ? (anyFail ? 1 : 0) : 2);
