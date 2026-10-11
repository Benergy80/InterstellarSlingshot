// =============================================================================
// BLACK-HOLE WARP EXIT CHECK — for `scripts/shot.mjs --eval` (package Q).
//   node scripts/shot.mjs --root . --out .critic/bhplace --name warp --mode play \
//        --shots 4,9,14,19,24,29,34 --size 1280x720 --eval scripts/bh-warp-check.js
// Each capture first reports where the previous black-hole warp landed (which
// hole, how many of its radii out, the closest any OTHER hole / star / planet
// is in its own radii, the name the game gave the galaxy, enemies loaded near
// it), then fires the next warp with the progression gate open.
// Also, once: 400 simulated exits per hole through the game's own exit rule.
// =============================================================================
const ie = eval;
const P = ie('planets'), V = THREE.Vector3, cam = ie('camera');
const R = (o) => (typeof _hyBodyR === 'function') ? _hyBodyR(o) : o.geometry.parameters.radius;
const holes = P.filter((p) => p && p.userData && p.userData.type === 'blackhole');
const out = {};
if (window.__bhw && window.__bhw.fired) {
    const pos = cam.position;
    let near = null;
    holes.forEach((h) => { const d = pos.distanceTo(h.position) / R(h); if (!near || d < near[1]) near = [h.userData.name.slice(0, 18), Math.round(d * 10) / 10]; });
    let worst = null;
    P.forEach((p) => {
        const u = p && p.userData; if (!u || u.type === 'asteroid' || u.isAsteroid) return;
        if (!(u.type === 'star' || u.type === 'planet' || u.type === 'moon' || u.type === 'blackhole')) return;
        const r = R(p); if (!(r > 0)) return;
        const wp = p.getWorldPosition(new V());
        const k = pos.distanceTo(wp) / r;
        if (u.type === 'blackhole' && u.name.slice(0, 18) === near[0]) return;
        if (!worst || k < worst[1]) worst = [(u.name || u.type).slice(0, 18), Math.round(k * 10) / 10];
    });
    const en = (ie('typeof enemies!=="undefined"?enemies:[]')).filter((e) => e && e.position && e.position.distanceTo(pos) < 40000).length;
    out.landed = { at: near, closestOther: worst, location: gameState.location, galaxyId: (typeof getCurrentGalaxyId === 'function') ? (() => { const l = console.log; console.log = () => {}; const g = getCurrentGalaxyId(); console.log = l; return g; })() : null, enemiesIn40k: en };
}
if (!window.__bhw && typeof window._hyBHArrivalBlocked !== 'function') window.__bhw = { fired: 0 };
if (!window.__bhw) {
    // simulated exits through the game's own rule (radius-aware block check)
    const A = window.HY_BH.ARRIVE_RADII, sim = {};
    holes.forEach((h) => {
        const r = R(h), crit = Math.max(r * 2.5, 50);
        let bad = 0, minOther = Infinity;
        for (let i = 0; i < 400; i++) {
            const wd = crit + r * (A[0] + Math.random() * (A[1] - A[0]));
            const ang = Math.random() * Math.PI * 2;
            const p = new V(h.position.x + Math.cos(ang) * wd, h.position.y + (Math.random() - 0.5) * 200, h.position.z + Math.sin(ang) * wd);
            let a = 0;
            while (window._hyBHArrivalBlocked(p, h) && a < 24) {
                const ad = wd + a * r * 0.6;
                p.set(h.position.x + Math.cos(ang + a * 0.3) * ad, h.position.y + (Math.random() - 0.5) * 200, h.position.z + Math.sin(ang + a * 0.3) * ad);
                a++;
            }
            if (window._hyBHArrivalBlocked(p, h)) bad++;
            holes.forEach((o) => { if (o !== h) minOther = Math.min(minOther, p.distanceTo(o.position) / R(o)); });
        }
        sim[h.userData.name.slice(0, 18)] = { blocked: bad, minOtherHoleRadii: Math.round(minOther * 10) / 10 };
    });
    out.sim = sim;
    window.__bhw = { fired: 0 };
}
// open the progression gate and fire the next warp
window.isSolSystemLiberated = () => true;
try { ie('isSolSystemLiberated = () => true'); } catch (e) { /* not reassignable */ }
gameState.paused = false;
transitionToRandomLocation('__test__', 'blackhole');
window.__bhw.fired++;
return out;
