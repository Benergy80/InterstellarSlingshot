// =============================================================================
// PLAYTEST PROBE — automated regression sensor for the continuous-improvement
// loop. Passive, always-on, ~0.5 Hz. Encodes every bug CLASS found in
// development as an invariant the loop can poll via window.__selftest, so the
// same family of regression is caught automatically instead of by eye.
//
// Read by the loop with:
//   window.__selftest.report()   → compact one-line-per-check string
//   window.__selftest.fails()    → array of currently-failing checks only
//   window.__selftest.fps        → self-measured FPS
//
// Never mutates game state. Every check is independently try-guarded so a
// single bad read can't take the probe (or the game) down.
// =============================================================================
(function () {
    const PROBE = {
        intervalMs: 2000,
        fps: 0,
        checks: {},          // name -> { pass, level, detail, since }
        lastRun: 0,
        _errors: [],
        _hist: {},
    };
    if (typeof window !== 'undefined') window.__selftest = PROBE;

    // ── Passive error capture (the "no console errors" invariant) ────────────
    if (typeof window !== 'undefined') {
        window.addEventListener('error', (e) => {
            PROBE._errors.push({ t: Date.now(), msg: String(e.message || e.error || 'error') });
            if (PROBE._errors.length > 60) PROBE._errors.shift();
        });
        window.addEventListener('unhandledrejection', (e) => {
            PROBE._errors.push({ t: Date.now(), msg: 'promise: ' + String(e.reason).slice(0, 160) });
            if (PROBE._errors.length > 60) PROBE._errors.shift();
        });
        const _origErr = console.error;
        console.error = function (...a) {
            try { PROBE._errors.push({ t: Date.now(), msg: a.map(String).join(' ').slice(0, 200) }); } catch (_) {}
            if (PROBE._errors.length > 60) PROBE._errors.shift();
            return _origErr.apply(console, a);
        };
    }

    // ── Self-measured FPS (decoupled from the game's own perf monitor) ───────
    let _frames = 0, _fpsT0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    function _tickFps() {
        _frames++;
        const now = performance.now();
        if (now - _fpsT0 >= 1000) { PROBE.fps = Math.round(_frames * 1000 / (now - _fpsT0)); _frames = 0; _fpsT0 = now; }
        requestAnimationFrame(_tickFps);
    }
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(_tickFps);

    const finite = (v) => typeof v === 'number' && isFinite(v);
    const posOK = (o) => o && o.position && finite(o.position.x) && finite(o.position.y) && finite(o.position.z);

    function set(name, pass, detail, level) {
        const prev = PROBE.checks[name];
        const since = (prev && prev.pass === pass) ? prev.since : Date.now();
        PROBE.checks[name] = { pass: !!pass, level: level || (pass ? 'pass' : 'fail'), detail: detail || '', since };
    }

    // Known intentional giant spheres — excluded from the oversized-bubble scan
    const _SKYBOX_RE = /skybox|atmosphere|dome|cmb|hubble|nebula|warpstar/i;

    function run() {
        if (typeof gameState === 'undefined' || !gameState || !gameState.gameStarted) return;
        if (typeof scene === 'undefined' || typeof camera === 'undefined') return;
        const now = Date.now();

        // 1. NO CONSOLE ERRORS (class: any uncaught/logged error)
        try {
            const recent = PROBE._errors.filter(e => now - e.t < 6000);
            set('noErrors', recent.length === 0,
                recent.length ? (recent.length + ' err, last: ' + recent[recent.length - 1].msg) : 'clean');
        } catch (e) {}

        // 2. FINITE POSITIONS (class: NaN position — crystals, mining ships)
        try {
            let bad = 0, badName = '';
            if (!posOK(camera)) { bad++; badName = 'camera'; }
            const pools = [
                ['enemies', typeof enemies !== 'undefined' ? enemies : null],
                ['allyShips', typeof allyShips !== 'undefined' ? allyShips : null],
                ['tradingShips', typeof tradingShips !== 'undefined' ? tradingShips : null],
            ];
            pools.forEach(([nm, arr]) => {
                if (!arr) return;
                for (let i = 0; i < arr.length; i++) {
                    if (arr[i] && !posOK(arr[i])) { bad++; if (!badName) badName = nm + '[' + i + ']'; }
                }
            });
            set('finitePositions', bad === 0, bad ? (bad + ' NaN, first ' + badName) : 'all finite');
        } catch (e) {}

        // 3. FPS (class: dense-core / effect-leak slowdown) — warn, not fail
        try {
            set('fps', PROBE.fps >= 25 || PROBE.fps === 0,
                PROBE.fps + ' fps', PROBE.fps && PROBE.fps < 25 ? 'warn' : 'pass');
        } catch (e) {}

        // 4. NO OVERSIZED BUBBLES (class: giant shield / orange-wash)
        // Additive transparent spheres that aren't the known huge skyboxes,
        // with a world radius > 900 = an inflated shield (legit cap ~640).
        try {
            let worst = 0, worstObj = null;
            const _ws = new THREE.Vector3();
            scene.traverse((o) => {
                if (!o.isMesh || !o.geometry || o.geometry.type !== 'SphereGeometry') return;
                if (!o.material || !o.material.transparent) return;
                if (_SKYBOX_RE.test(o.name || '')) return;
                const r = (o.geometry.parameters && o.geometry.parameters.radius) || 0;
                if (r >= 50000) return; // a skybox by size
                o.getWorldScale(_ws);
                const worldR = r * Math.max(Math.abs(_ws.x), Math.abs(_ws.y), Math.abs(_ws.z));
                if (worldR > worst) { worst = worldR; worstObj = o; }
            });
            // Capture full identity of any offender so the bug is diagnosable
            // without a human watching (the "strengthen the sensor" step).
            if (worst > 900 && worstObj) {
                const p = worstObj.parent;
                const flags = (p && p.userData) ? ['isBoss', 'isEliteGuardian', 'isBlackHoleGuardian', 'isBossSupport']
                    .filter(f => p.userData[f]).join(',') : '';
                PROBE._lastGiant = {
                    t: now, worldR: Math.round(worst),
                    geomR: (worstObj.geometry.parameters && worstObj.geometry.parameters.radius) || 0,
                    name: worstObj.name || '(none)',
                    isEnemyShield: !!(worstObj.userData && worstObj.userData.isEnemyShield),
                    isGlowLayer: !!(worstObj.userData && worstObj.userData.isGlowLayer),
                    parentName: (p && p.userData && p.userData.name) || '(none)',
                    parentFlags: flags,
                };
            }
            // PERSISTENCE GATE: a boss/guardian DEATH throws a legit
            // additive flash sphere (createBossExplosion, 1300-1700u) that
            // grows then fades within a sample — desirable VFX, not a bug.
            // The real defect (an inflated SHIELD washing the screen) stays
            // up for the whole engagement. So only FAIL when an oversized
            // bubble persists across >=2 consecutive runs (~4s); a one-shot
            // spike is reported but passes.
            PROBE._giantStreak = (worst > 900) ? (PROBE._giantStreak || 0) + 1 : 0;
            const persistent = PROBE._giantStreak >= 2;
            const nm = worstObj ? ((worstObj.parent && worstObj.parent.userData && worstObj.parent.userData.name) || worstObj.name || '?') : '?';
            set('noGiantBubbles', !persistent,
                persistent ? ('persistent bubble ' + Math.round(worst) + 'u on ' + nm)
                    : (worst > 900 ? ('transient ' + Math.round(worst) + 'u flash (ok)') : ('max ' + Math.round(worst) + 'u')));
        } catch (e) {}

        // 5. NO STUCK MATERIALIZATION (class: spawn-in race leaves ship at 12%)
        try {
            let stuck = 0, stuckName = '';
            const arr = (typeof enemies !== 'undefined') ? enemies : [];
            for (let i = 0; i < arr.length; i++) {
                const e = arr[i];
                if (!e || !e.userData || !e.userData._materializing) { if (e && e.uuid) delete PROBE._hist['mat_' + e.uuid]; continue; }
                const k = 'mat_' + e.uuid;
                if (!PROBE._hist[k]) PROBE._hist[k] = now;
                if (now - PROBE._hist[k] > 4000) { stuck++; if (!stuckName) stuckName = e.userData.name || '?'; }
            }
            set('noStuckSpawnIn', stuck === 0, stuck ? (stuck + ' stuck, ' + stuckName) : 'ok');
        } catch (e) {}

        // 6. NOT RECEDING FROM A LIVE TARGET (class: demo flies away from boss)
        try {
            const tgt = gameState.currentTarget;
            const isEnemyTgt = tgt && tgt.userData && tgt.userData.health > 0 &&
                (tgt.userData.type === 'enemy' || tgt.userData.isBoss || tgt.userData.isEliteGuardian);
            const warping = (gameState.emergencyWarp && (gameState.emergencyWarp.active || gameState.emergencyWarp.postWarp)) ||
                (gameState.slingshot && gameState.slingshot.active);
            // Below ~10 fps the dt clamp runs the sim in deliberate slow
            // motion — our 14s wall-clock window is then only ~2s of game
            // time, and evasive enemies can legitimately out-drift the
            // pursuit. The check is only meaningful at playable frame rates.
            if (PROBE.fps > 0 && PROBE.fps < 10) {
                PROBE._hist.recede = { tgt: null, samples: [] };
                set('notRecedingFromTarget', true, 'n/a below 10fps (slow-mo)');
            } else if (isEnemyTgt && !warping) {
                const d = camera.position.distanceTo(tgt.position);
                const h = PROBE._hist.recede || (PROBE._hist.recede = { tgt: null, samples: [] });
                if (h.tgt !== tgt) { h.tgt = tgt; h.samples = []; }
                h.samples.push(d);
                if (h.samples.length > 7) h.samples.shift();
                // Failing only if it's been growing across the whole ~14s window
                let growing = h.samples.length >= 6;
                for (let i = 1; i < h.samples.length && growing; i++) if (h.samples[i] <= h.samples[i - 1] + 1) growing = false;
                set('notRecedingFromTarget', !growing,
                    growing ? ('receding from ' + (tgt.userData.name || 'target') + ' → ' + Math.round(d) + 'u') : Math.round(d) + 'u');
            } else {
                PROBE._hist.recede = { tgt: null, samples: [] };
                set('notRecedingFromTarget', true, 'no live enemy target');
            }
        } catch (e) {}

        // 7. DEMO LIVENESS (class: autopilot frozen / stuck phase) — warn
        try {
            const driving = window.demoPilot && window.demoPilot.driving;
            if (driving) {
                const h = PROBE._hist.live || (PROBE._hist.live = { pos: null, stillSince: now });
                const p = camera.position;
                if (h.pos && p.distanceTo(h.pos) < 1) {
                    // not moving
                } else { h.stillSince = now; }
                h.pos = p.clone();
                const frozen = (now - h.stillSince) > 14000 && !gameState.paused;
                set('demoLive', !frozen, frozen ? 'demo not moving 14s' : 'moving', frozen ? 'warn' : 'pass');
            } else {
                PROBE._hist.live = { pos: camera.position.clone(), stillSince: now };
                set('demoLive', true, 'demo not driving');
            }
        } catch (e) {}

        // 8. EFFECT-OBJECT BUDGET (class: explosions/effects not cleaning up)
        try {
            let pts = 0, sprites = 0;
            const kids = scene.children;
            for (let i = 0; i < kids.length; i++) {
                const c = kids[i];
                if (c.isPoints) pts++;
                else if (c.isSprite) sprites++;
            }
            const total = pts + sprites;
            set('effectBudget', total <= 220, 'points+sprites=' + total, total > 220 ? 'warn' : 'pass');
        } catch (e) {}

        // 9b. DISCOVERY-PATH APPROACH GOVERNOR (class: demo overshoots the
        // stronghold at warp speed). The endpoint has 7+ anchored hostiles;
        // navigateTo's approach governor must bring speed under ~10,000 km/s
        // (10 u/frame) inside the engagement zone. Checked at < 2500u so the
        // 3500u governor has had braking room; warp-locked frames exempt.
        try {
            const dp = window.demoPilot;
            const tgt = gameState.currentTarget;
            if (dp && dp.driving && dp.phase === 'followDiscoveryPath' &&
                tgt && tgt.userData && tgt.userData.name === 'Discovery endpoint') {
                const d = camera.position.distanceTo(tgt.position);
                const sp = gameState.velocityVector ? gameState.velocityVector.length() : 0;
                const warpBusy = gameState.emergencyWarp &&
                    (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning);
                if (d < 2500 && !warpBusy) {
                    set('pathApproachSpeed', sp <= 11,
                        ((sp * 1000) | 0) + ' km/s @ ' + (d | 0) + 'u from endpoint');
                } else {
                    set('pathApproachSpeed', true, 'outside governed band (' + (d | 0) + 'u)');
                }
            } else {
                set('pathApproachSpeed', true, 'not on discovery approach');
            }
        } catch (e) {}

        // 9c. ENEMY MOTION GLIDE (class: render-interpolation disabled →
        // jerky enemies; regressed when the AI interval hit 1). Each run
        // kicks off a ~20-frame rAF sampler on the nearest live interpolated
        // enemy: if it moved overall but >40% of frames showed zero movement
        // (the move-freeze-jump signature), the glide is broken.
        try {
            if (!PROBE._glideSampling && typeof enemies !== 'undefined') {
                let tgt = null, best = Infinity;
                for (let i = 0; i < enemies.length; i++) {
                    const e = enemies[i];
                    if (!e || !e.userData || e.userData.health <= 0 || !e.userData._interp) continue;
                    const d = camera.position.distanceTo(e.position);
                    if (d < best) { best = d; tgt = e; }
                }
                if (tgt && best < 5000) {
                    PROBE._glideSampling = true;
                    const prev = tgt.position.clone();
                    let frames = 0, zero = 0, total = 0;
                    const step = () => {
                        try {
                            const d = tgt.position.distanceTo(prev);
                            prev.copy(tgt.position);
                            if (frames > 0) { total += d; if (d < 0.001) zero++; }
                            if (++frames < 21 && tgt.userData && tgt.userData.health > 0) {
                                requestAnimationFrame(step);
                            } else {
                                PROBE._glideSampling = false;
                                if (total > 1) { // enemy actually moved
                                    const ratio = zero / (frames - 1);
                                    set('enemyMotionGlide', ratio <= 0.4,
                                        (ratio * 100 | 0) + '% stalled frames (' +
                                        (tgt.userData.name || '?') + ')');
                                } else {
                                    set('enemyMotionGlide', true, 'enemy stationary — n/a');
                                }
                            }
                        } catch (e) { PROBE._glideSampling = false; }
                    };
                    requestAnimationFrame(step);
                } else {
                    set('enemyMotionGlide', true, 'no interpolated enemy in range');
                }
            }
        } catch (e) { PROBE._glideSampling = false; }

        // 9. WINGMEN FACE FORWARD (class: backwards ships) — warn
        try {
            const arr = (typeof allyShips !== 'undefined') ? allyShips : [];
            let n = 0, sum = 0;
            const _f = new THREE.Vector3();
            for (let i = 0; i < arr.length; i++) {
                const a = arr[i];
                if (!a || !a.userData || a.userData.health <= 0) continue;
                const v = a.userData.velocity;
                if (!v || v.lengthSq() < 0.25) continue;
                _f.set(0, 0, 1).applyQuaternion(a.quaternion).normalize(); // player model +Z nose
                sum += _f.dot(v.clone().normalize());
                n++;
            }
            if (n > 0) {
                const avg = sum / n;
                set('wingmenForward', avg > -0.15, 'avg facing·move=' + avg.toFixed(2), avg <= -0.15 ? 'warn' : 'pass');
            } else set('wingmenForward', true, 'no moving wingmen');
        } catch (e) {}

        PROBE.lastRun = now;
    }

    // ── Loop-facing reporters (compact, token-cheap — headroom-friendly) ─────
    PROBE.fails = function () {
        return Object.keys(PROBE.checks)
            .filter(k => !PROBE.checks[k].pass)
            .map(k => ({ check: k, level: PROBE.checks[k].level, detail: PROBE.checks[k].detail }));
    };
    PROBE.report = function () {
        const ks = Object.keys(PROBE.checks);
        if (!ks.length) return 'probe: no data yet (start the game/demo)';
        return ks.map(k => {
            const c = PROBE.checks[k];
            const mark = c.pass ? 'PASS' : (c.level === 'warn' ? 'WARN' : 'FAIL');
            return mark + ' ' + k + (c.detail ? ' (' + c.detail + ')' : '');
        }).join('\n') + '\nfps=' + PROBE.fps;
    };

    if (typeof setInterval !== 'undefined') {
        setInterval(() => { try { run(); } catch (e) {} }, PROBE.intervalMs);
    }
})();
