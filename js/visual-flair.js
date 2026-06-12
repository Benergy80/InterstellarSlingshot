// =============================================================================
// VISUAL FLAIR — self-contained effects layer (PewPew-inspired pass, 2026-06)
//   1. Player engine trail ribbon (speed-colored)
//   2. Ship spawn-in materialization (scale-in + flash)
//   3. Laser hit sparks
//   5. Civilian distress flares (rising SOS spark)
//   7. Gravity-whip trajectory preview (dotted capture arc + launch ray)
//   8. Warp tunnel (chromatic counter-rotating rings at speed)
//   9. Star lens flares (sprite, proximity + view-angle driven)
//  10. Boss intro beat (letterbox + name card)
//  11. Black-hole accretion spiral (inward-spiraling particles)
//  12. Planet rim-glow atmospheres (additive backside shells)
//  13. Floating kill text (screen-space, loot-colored for pirates)
// All effects are guarded, pooled, and throttled; updateVisualFlair() is the
// single per-frame entry point called from animate().
// =============================================================================

// ── Shared helpers ───────────────────────────────────────────────────────────

function _vfGlowTexture() {
    if (_vfGlowTexture._tex) return _vfGlowTexture._tex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    _vfGlowTexture._tex = new THREE.CanvasTexture(c);
    return _vfGlowTexture._tex;
}

// ── 1. PLAYER ENGINE TRAIL — REMOVED ────────────────────────────────────────
// (Flame-ribbon streamer tried 2026-06-11, cut same day per playtest: even
// with the near-camera fade it competed with the ship in chase view.)

// ── 2. SPAWN-IN MATERIALIZATION ─────────────────────────────────────────────
// Ships scale in from 12% with an eased pop + a one-shot flash glow.
function materializeShip(ship, durMs) {
    if (!ship || ship.userData._materializing) return;
    ship.userData._materializing = true;
    const dur = durMs || 650;
    const target = ship.scale.clone();
    ship.scale.copy(target).multiplyScalar(0.12);

    // Flash sprite at the spawn point
    try {
        const sm = new THREE.SpriteMaterial({
            map: _vfGlowTexture(), color: 0xbbeeff, transparent: true,
            opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const flash = new THREE.Sprite(sm);
        const wp = ship.getWorldPosition(new THREE.Vector3());
        flash.position.copy(wp);
        flash.scale.setScalar(40);
        scene.add(flash);
        const f0 = Date.now();
        const fiv = setInterval(() => {
            const t = (Date.now() - f0) / 500;
            sm.opacity = Math.max(0, 0.9 * (1 - t));
            flash.scale.setScalar(40 + t * 90);
            if (t >= 1) { clearInterval(fiv); scene.remove(flash); sm.dispose(); }
        }, 33);
    } catch (e) {}

    const t0 = Date.now();
    const iv = setInterval(() => {
        const t = Math.min(1, (Date.now() - t0) / dur);
        const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
        ship.scale.copy(target).multiplyScalar(0.12 + 0.88 * e);
        if (t >= 1) {
            ship.scale.copy(target);
            ship.userData._materializing = false;
            clearInterval(iv);
        }
    }, 33);
}

// ── 3. LASER HIT SPARKS ─────────────────────────────────────────────────────
function createHitSparks(position, colorHex) {
    if (!position || typeof explosionManager === 'undefined') return;
    const count = 6;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vels = [];
    for (let i = 0; i < count; i++) {
        pos[i * 3] = 0; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0;
        vels.push(new THREE.Vector3(
            (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)
        ).normalize().multiplyScalar(1.2 + Math.random() * 1.6));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: colorHex || 0xffcc66, size: 2.2, transparent: true,
        opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    pts.position.copy(position);
    scene.add(pts);
    let life = 1;
    explosionManager.addExplosion({
        update(dt) {
            life -= 0.07 * (dt / 16.67);
            const arr = geo.attributes.position.array;
            for (let i = 0; i < count; i++) {
                arr[i * 3] += vels[i].x; arr[i * 3 + 1] += vels[i].y; arr[i * 3 + 2] += vels[i].z;
            }
            geo.attributes.position.needsUpdate = true;
            mat.opacity = Math.max(0, life);
            return life > 0;
        },
        cleanup() { scene.remove(pts); geo.dispose(); mat.dispose(); }
    });
}

// ── 5. DISTRESS FLARE ───────────────────────────────────────────────────────
// A bright SOS flare rises off a distressed civilian and bursts.
function createDistressFlare(position) {
    if (!position || typeof explosionManager === 'undefined') return;
    const sm = new THREE.SpriteMaterial({
        map: _vfGlowTexture(), color: 0xffaa00, transparent: true,
        opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const flare = new THREE.Sprite(sm);
    flare.position.copy(position);
    flare.scale.setScalar(14);
    scene.add(flare);
    let t = 0;
    explosionManager.addExplosion({
        update(dt) {
            t += (dt / 16.67) / 150; // ~2.5s life
            flare.position.y += 0.9 * (dt / 16.67);
            if (t < 0.75) {
                sm.opacity = 0.95;
                flare.scale.setScalar(14 + Math.sin(t * 40) * 3); // sputter
            } else {
                // Burst at apex, then fade
                const ft = (t - 0.75) / 0.25;
                flare.scale.setScalar(14 + ft * 70);
                sm.opacity = Math.max(0, 0.95 * (1 - ft));
            }
            return t < 1;
        },
        cleanup() { scene.remove(flare); sm.dispose(); }
    });
}

// ── 7. GRAVITY-WHIP TRAJECTORY PREVIEW ──────────────────────────────────────
// While inside a body's slingshot range: dotted capture arc + launch ray
// toward the nav target (or look direction).
const _wpPreview = { line: null, mat: null };

function _updateWhipPreview(fc) {
    if (fc % 6 !== 0) return;
    let show = false;
    if (typeof findSlingshotTarget === 'function' &&
        !(gameState.slingshot && gameState.slingshot.active) &&
        !gameState.slingshotWhip &&
        Date.now() >= (gameState.slingshotCooldownUntil || 0)) {
        const body = findSlingshotTarget();
        if (body) {
            const bp = body.position;
            const cp = camera.position;
            const planetR = body.geometry && body.geometry.parameters ? body.geometry.parameters.radius : 5;
            const r = Math.max(cp.distanceTo(bp), Math.max(planetR * 1.8, 60));
            const theta0 = Math.atan2(cp.z - bp.z, cp.x - bp.x);
            const aim = new THREE.Vector3();
            const navT = gameState.currentTarget;
            if (navT && navT.position && navT !== body) aim.subVectors(navT.position, bp).normalize();
            else camera.getWorldDirection(aim).normalize();
            const tCCW = new THREE.Vector3(-Math.sin(theta0), 0, Math.cos(theta0));
            const sign = (tCCW.dot(aim) >= 0) ? 1 : -1;
            const y = cp.y;

            const pts = [];
            const ARC = 2.4; // ~140° preview arc
            for (let i = 0; i <= 22; i++) {
                const a = theta0 + sign * (i / 22) * ARC;
                pts.push(new THREE.Vector3(bp.x + Math.cos(a) * r, y, bp.z + Math.sin(a) * r));
            }
            // Launch ray from arc end toward the aim
            const end = pts[pts.length - 1];
            const exitTan = new THREE.Vector3(
                -Math.sin(theta0 + sign * ARC) * sign, 0, Math.cos(theta0 + sign * ARC) * sign);
            const launch = aim.clone().multiplyScalar(0.65).addScaledVector(exitTan, 0.35).normalize();
            pts.push(end.clone().addScaledVector(launch, 2600));

            if (!_wpPreview.line) {
                _wpPreview.mat = new THREE.LineDashedMaterial({
                    color: 0x66ffee, transparent: true, opacity: 0.38,
                    dashSize: 26, gapSize: 20, depthWrite: false
                });
                _wpPreview.line = new THREE.Line(new THREE.BufferGeometry(), _wpPreview.mat);
                _wpPreview.line.frustumCulled = false;
                _wpPreview.line.renderOrder = 50;
                scene.add(_wpPreview.line);
            }
            _wpPreview.line.geometry.setFromPoints(pts);
            _wpPreview.line.computeLineDistances();
            _wpPreview.line.visible = true;
            show = true;
        }
    }
    if (!show && _wpPreview.line) _wpPreview.line.visible = false;
}

// ── 8. WARP TUNNEL — REMOVED ────────────────────────────────────────────────
// (Chromatic ring tunnel tried 2026-06-11 and cut same day: even tuned as
// depth-staggered apertures the rings read as UI clutter over the existing
// warp starfield, which already sells the speed. Cut per playtest.)

// ── 9. STAR LENS FLARES ─────────────────────────────────────────────────────
const _lfPool = [];
const _lfTmp = new THREE.Vector3();
const _lfFwd = new THREE.Vector3();

function _updateLensFlares(fc) {
    if (fc % 4 !== 0) return;
    if (typeof activePlanets === 'undefined') return;
    // Nearest on-screen stars within 9000u, up to 3
    const stars = [];
    for (let i = 0; i < activePlanets.length; i++) {
        const p = activePlanets[i];
        if (!p || !p.userData) continue;
        if (p.userData.type !== 'star' && !p.userData.isLocalStar) continue;
        const d = camera.position.distanceTo(p.position);
        if (d < 9000) stars.push({ p, d });
    }
    stars.sort((a, b) => a.d - b.d);
    camera.getWorldDirection(_lfFwd);
    for (let i = 0; i < 3; i++) {
        let slot = _lfPool[i];
        if (!slot) {
            const sm = new THREE.SpriteMaterial({
                map: _vfGlowTexture(), color: 0xffeeaa, transparent: true,
                opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
            });
            const sp = new THREE.Sprite(sm);
            sp.renderOrder = 90;
            scene.add(sp);
            slot = { sp, sm };
            _lfPool.push(slot);
        }
        const entry = stars[i];
        if (!entry) { slot.sm.opacity = 0; continue; }
        const star = entry.p;
        _lfTmp.subVectors(star.position, camera.position).normalize();
        const facing = _lfTmp.dot(_lfFwd); // 1 = dead center
        if (facing < 0.3) { slot.sm.opacity = 0; continue; }
        const r = star.geometry && star.geometry.parameters ? star.geometry.parameters.radius : 30;
        slot.sp.position.copy(star.position);
        slot.sp.scale.setScalar(r * (3 + facing * 4));
        const col = (star.material && star.material.color) ? star.material.color : null;
        if (col) slot.sm.color.copy(col).lerp(new THREE.Color(0xffffff), 0.5);
        slot.sm.opacity = Math.min(0.55, (facing - 0.3) * 0.9 * Math.min(1, 3500 / entry.d));
    }
}

// ── 10. BOSS INTRO BEAT ─────────────────────────────────────────────────────
// Letterbox bars + name card for ~2.4s when a boss spawns.
function playBossIntro(bossName) {
    try {
        if (document.getElementById('bossIntroCard')) return; // one at a time
        if (!document.getElementById('bossIntroStyle')) {
            const st = document.createElement('style');
            st.id = 'bossIntroStyle';
            st.textContent =
                '.boss-bar{position:fixed;left:0;width:100%;height:0;background:#000;z-index:70;transition:height 0.45s ease;pointer-events:none}' +
                '@keyframes bossCardIn{0%{opacity:0;letter-spacing:18px}35%{opacity:1;letter-spacing:8px}80%{opacity:1}100%{opacity:0}}';
            document.head.appendChild(st);
        }
        const top = document.createElement('div');
        top.className = 'boss-bar'; top.style.top = '0';
        const bot = document.createElement('div');
        bot.className = 'boss-bar'; bot.style.bottom = '0';
        const card = document.createElement('div');
        card.id = 'bossIntroCard';
        card.style.cssText = 'position:fixed;left:50%;top:16%;transform:translateX(-50%);' +
            'z-index:71;color:#ff3333;font-family:Orbitron,monospace;font-weight:bold;' +
            'text-shadow:0 0 18px rgba(255,40,40,0.9);pointer-events:none;text-align:center;' +
            'max-width:72vw;animation:bossCardIn 2.4s ease forwards';
        // Two lines: warning label on top, the (long) boss name wraps below
        card.innerHTML =
            '<div style="font-size:16px;letter-spacing:6px;opacity:0.85;margin-bottom:6px">⚠ BOSS DETECTED ⚠</div>' +
            '<div style="font-size:26px;line-height:1.25">' + (bossName || 'UNKNOWN FLAGSHIP') + '</div>';
        document.body.appendChild(top); document.body.appendChild(bot); document.body.appendChild(card);
        requestAnimationFrame(() => { top.style.height = '7%'; bot.style.height = '7%'; });
        setTimeout(() => { top.style.height = '0'; bot.style.height = '0'; }, 1900);
        setTimeout(() => { top.remove(); bot.remove(); card.remove(); }, 2600);
    } catch (e) {}
}

// ── 11. BLACK-HOLE ACCRETION SPIRAL ─────────────────────────────────────────
// Particles spiral into the nearest black hole within 12,000u.
const _acc = { bh: null, pts: null, geo: null, mat: null, data: null };

function _updateAccretionSpiral(fc) {
    // Re-pick nearest BH every ~2s
    if (fc % 120 === 0 || !_acc.bh) {
        let best = null, bestD = 12000;
        if (typeof planets !== 'undefined') {
            for (let i = 0; i < planets.length; i++) {
                const p = planets[i];
                if (!p || !p.userData || p.userData.type !== 'blackhole') continue;
                const d = camera.position.distanceTo(p.position);
                if (d < bestD) { bestD = d; best = p; }
            }
        }
        if (best !== _acc.bh) {
            if (_acc.pts) { scene.remove(_acc.pts); _acc.geo.dispose(); _acc.mat.dispose(); _acc.pts = null; }
            _acc.bh = best;
            if (best) {
                const N = 220;
                const r0 = (best.geometry && best.geometry.parameters ? best.geometry.parameters.radius : 100);
                _acc.geo = new THREE.BufferGeometry();
                const pos = new Float32Array(N * 3);
                _acc.data = [];
                for (let i = 0; i < N; i++) {
                    _acc.data.push({
                        a: Math.random() * Math.PI * 2,
                        r: r0 * (1.5 + Math.random() * 4.5),
                        y: (Math.random() - 0.5) * r0 * 0.5,
                        s: 0.5 + Math.random()
                    });
                }
                _acc.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                _acc.mat = new THREE.PointsMaterial({
                    color: 0xbb88ff, size: Math.max(4, r0 * 0.06), transparent: true,
                    opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false
                });
                _acc.pts = new THREE.Points(_acc.geo, _acc.mat);
                _acc.pts.frustumCulled = false;
                scene.add(_acc.pts);
            }
        }
    }
    if (!_acc.bh || !_acc.pts) return;
    const r0 = (_acc.bh.geometry && _acc.bh.geometry.parameters ? _acc.bh.geometry.parameters.radius : 100);
    const arr = _acc.geo.attributes.position.array;
    const bp = _acc.bh.position;
    for (let i = 0; i < _acc.data.length; i++) {
        const d = _acc.data[i];
        d.a += (0.02 * d.s * r0 * 2) / d.r;  // faster spin closer in
        d.r -= 0.12 * d.s;                    // inward drift
        if (d.r < r0 * 1.1) {                 // crossed the horizon — respawn outside
            d.r = r0 * (4 + Math.random() * 2);
            d.a = Math.random() * Math.PI * 2;
            d.y = (Math.random() - 0.5) * r0 * 0.5;
        }
        arr[i * 3] = bp.x + Math.cos(d.a) * d.r;
        arr[i * 3 + 1] = bp.y + d.y * (d.r / (r0 * 6));
        arr[i * 3 + 2] = bp.z + Math.sin(d.a) * d.r;
    }
    _acc.geo.attributes.position.needsUpdate = true;
}

// ── 12. PLANET RIM-GLOW ATMOSPHERES ─────────────────────────────────────────
// Additive backside shells on the nearest few planets.
const _rimShells = new Map(); // planet.uuid -> { planet, shell, mat }

function _updateRimGlow(fc) {
    if (fc % 20 !== 0) return;
    if (typeof activePlanets === 'undefined') return;
    const RANGE = 4500, MAX_SHELLS = 6;
    const near = [];
    for (let i = 0; i < activePlanets.length; i++) {
        const p = activePlanets[i];
        if (!p || !p.userData) continue;
        const t = p.userData.type;
        if (t === 'star' || t === 'blackhole' || t === 'asteroid' || t === 'asteroidBelt') continue;
        const d = camera.position.distanceTo(p.position);
        if (d < RANGE) near.push({ p, d });
    }
    near.sort((a, b) => a.d - b.d);
    const keep = new Set();
    for (let i = 0; i < Math.min(MAX_SHELLS, near.length); i++) {
        const p = near[i].p;
        keep.add(p.uuid);
        if (!_rimShells.has(p.uuid)) {
            const r = p.geometry && p.geometry.parameters ? p.geometry.parameters.radius : 10;
            const col = (p.material && p.material.color) ? p.material.color.clone().lerp(new THREE.Color(0x88bbff), 0.5) : new THREE.Color(0x88bbff);
            const mat = new THREE.MeshBasicMaterial({
                color: col, transparent: true, opacity: 0.16, side: THREE.BackSide,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const shell = new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 24, 16), mat);
            shell.position.copy(p.position);
            scene.add(shell);
            _rimShells.set(p.uuid, { planet: p, shell, mat });
        }
    }
    _rimShells.forEach((entry, uuid) => {
        if (!keep.has(uuid)) {
            scene.remove(entry.shell);
            entry.shell.geometry.dispose(); entry.mat.dispose();
            _rimShells.delete(uuid);
        } else {
            entry.shell.position.copy(entry.planet.position); // follow orbits
        }
    });
}

// ── 13. FLOATING KILL TEXT ──────────────────────────────────────────────────
function spawnKillText(worldPos, text, cssColor) {
    try {
        if (!document.getElementById('killTextStyle')) {
            const st = document.createElement('style');
            st.id = 'killTextStyle';
            st.textContent = '@keyframes killTextFloat{0%{opacity:0;transform:translate(-50%,0)}15%{opacity:1}' +
                '100%{opacity:0;transform:translate(-50%,-70px)}}';
            document.head.appendChild(st);
        }
        const v = worldPos.clone().project(camera);
        if (v.z > 1 || v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) return; // off-screen
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;z-index:55;pointer-events:none;font-family:Orbitron,monospace;' +
            'font-weight:bold;font-size:15px;text-shadow:0 0 8px rgba(0,0,0,0.9);' +
            'animation:killTextFloat 1.4s ease-out forwards;' +
            'left:' + ((v.x + 1) / 2 * window.innerWidth).toFixed(0) + 'px;' +
            'top:' + ((1 - v.y) / 2 * window.innerHeight).toFixed(0) + 'px;' +
            'color:' + (cssColor || '#ffcc44');
        div.textContent = text;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 1500);
    } catch (e) {}
}

// ── 14. EVENT TEXT — cinematic center-screen announcements ─────────────────
// Bigger moment-marker than achievements: scales in, holds, fades. Used for
// Borg arrival, wingman deaths/recruits, caravan rescues, etc.
function flashEventText(title, cssColor, subtext) {
    try {
        if (!document.getElementById('eventTextStyle')) {
            const st = document.createElement('style');
            st.id = 'eventTextStyle';
            st.textContent = '@keyframes eventTextIn{0%{opacity:0;transform:translateX(-50%) scale(1.6)}' +
                '18%{opacity:1;transform:translateX(-50%) scale(1)}78%{opacity:1}' +
                '100%{opacity:0;transform:translateX(-50%) scale(0.96)}}';
            document.head.appendChild(st);
        }
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;left:50%;top:26%;transform:translateX(-50%);z-index:72;' +
            'pointer-events:none;text-align:center;font-family:Orbitron,monospace;font-weight:bold;' +
            'max-width:80vw;animation:eventTextIn 2s ease forwards;color:' + (cssColor || '#ffcc44') + ';' +
            'text-shadow:0 0 16px currentColor';
        div.innerHTML = '<div style="font-size:24px;letter-spacing:8px">' + title + '</div>' +
            (subtext ? '<div style="font-size:13px;letter-spacing:3px;opacity:0.85;margin-top:4px">' +
                subtext + '</div>' : '');
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 2100);
    } catch (e) {}
}

// ── 15. WINGMAN JUMP TRACERS ────────────────────────────────────────────────
// Short-lived additive streak behind a wingman during its tactical jump.
function wingmanTracerPush(ship, colorHex) {
    if (!ship || typeof scene === 'undefined') return;
    let tr = ship.userData._jumpTracer;
    if (!tr) {
        const mat = new THREE.LineBasicMaterial({
            color: colorHex || 0x88ffee, transparent: true, opacity: 0.8,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        tr = { points: [], line: new THREE.Line(new THREE.BufferGeometry(), mat), mat };
        tr.line.frustumCulled = false;
        scene.add(tr.line);
        ship.userData._jumpTracer = tr;
    }
    tr.points.push(ship.position.clone());
    if (tr.points.length > 24) tr.points.shift();
    tr.line.geometry.setFromPoints(tr.points);
}

function wingmanTracerFade(ship) {
    const tr = ship && ship.userData && ship.userData._jumpTracer;
    if (!tr) return;
    ship.userData._jumpTracer = null;
    const iv = setInterval(() => {
        tr.mat.opacity -= 0.06;
        if (tr.mat.opacity <= 0) {
            clearInterval(iv);
            scene.remove(tr.line);
            tr.line.geometry.dispose();
            tr.mat.dispose();
        }
    }, 45);
}

// ── 16. WINGMAN ENGINE RIBBONS — REMOVED (same playtest cut as the player
// streamer; the jump TRACERS in section 15 remain — those were requested
// and only appear during tactical dashes). ─────────────────────────────────

// ── 17. SPEED SCREEN FX ─────────────────────────────────────────────────────
// The streamer's replacement: speed feedback as a layered SCREEN effect
// (GPU-composited DOM, never occludes the ship). Three layers driven by a
// single eased intensity level (speed 5 → 30, warp forces ~max):
//   vignette  — edges darken as speed builds (tunnel vision)
//   streaks   — faint anamorphic spokes sweeping at the screen edge
//   chroma    — red/blue fringe at the rim during warp (lens stress)
const _sfx = { wrap: null, vig: null, streaks: null, chroma: null, level: 0 };

function _ensureScreenFX() {
    if (_sfx.wrap) return;
    const wrap = document.createElement('div');
    wrap.id = 'speedFxLayer';
    wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;display:none;';
    const vig = document.createElement('div');
    vig.style.cssText = 'position:absolute;inset:0;opacity:0;' +
        'background:radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(2,6,20,0.55) 78%, rgba(0,0,10,0.85) 100%)';
    const streaks = document.createElement('div');
    streaks.style.cssText = 'position:absolute;inset:-12%;opacity:0;' +
        'background:repeating-conic-gradient(from 0deg, rgba(150,200,255,0) 0deg 4deg, ' +
        'rgba(170,210,255,0.22) 4.6deg 5deg, rgba(150,200,255,0) 5.6deg 9deg);' +
        '-webkit-mask-image:radial-gradient(circle at center, transparent 40%, black 74%);' +
        'mask-image:radial-gradient(circle at center, transparent 40%, black 74%)';
    const chroma = document.createElement('div');
    chroma.style.cssText = 'position:absolute;inset:0;opacity:0;mix-blend-mode:screen;' +
        'background:radial-gradient(ellipse at 49.55% 50%, transparent 62%, rgba(255,0,60,0.16) 88%, transparent 100%),' +
        'radial-gradient(ellipse at 50.45% 50%, transparent 62%, rgba(0,120,255,0.16) 88%, transparent 100%)';
    wrap.appendChild(vig); wrap.appendChild(streaks); wrap.appendChild(chroma);
    document.body.appendChild(wrap);
    _sfx.wrap = wrap; _sfx.vig = vig; _sfx.streaks = streaks; _sfx.chroma = chroma;
}

function _updateScreenFX() {
    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
    const warping = !!((gameState.emergencyWarp && gameState.emergencyWarp.active) ||
        (gameState.slingshot && gameState.slingshot.active && !gameState.slingshotWhip));
    let target = Math.max(0, Math.min(1, (speed - 5) / 25));
    if (warping) target = Math.max(target, 0.85);
    _sfx.level += (target - _sfx.level) * 0.05;
    if (_sfx.level < 0.012) {
        if (_sfx.wrap) _sfx.wrap.style.display = 'none';
        return;
    }
    _ensureScreenFX();
    _sfx.wrap.style.display = 'block';
    const L = _sfx.level;
    const t = Date.now();
    _sfx.vig.style.opacity = (L * 0.8).toFixed(3);
    _sfx.streaks.style.opacity = (Math.max(0, L - 0.25) * 0.65).toFixed(3);
    // Slow sweep + breathing scale so the spokes feel like rushing light,
    // not a static stencil
    _sfx.streaks.style.transform =
        'rotate(' + ((t * (0.004 + L * 0.006)) % 360).toFixed(1) + 'deg) ' +
        'scale(' + (1 + L * 0.04 + Math.sin(t * 0.003) * 0.012).toFixed(3) + ')';
    _sfx.chroma.style.opacity = (Math.max(0, L - 0.45) * 0.9).toFixed(3);
}

// ── Per-frame entry point ───────────────────────────────────────────────────
function updateVisualFlair() {
    if (typeof gameState === 'undefined' || !gameState.gameStarted ||
        typeof camera === 'undefined' || typeof scene === 'undefined' ||
        typeof THREE === 'undefined') return;
    const fc = gameState.frameCount || 0;
    try { _updateScreenFX(); } catch (e) {}
    try { _updateWhipPreview(fc); } catch (e) {}
    try { _updateLensFlares(fc); } catch (e) {}
    try { _updateAccretionSpiral(fc); } catch (e) {}
    try { _updateRimGlow(fc); } catch (e) {}
}

// Exports
if (typeof window !== 'undefined') {
    window.updateVisualFlair = updateVisualFlair;
    window.materializeShip = materializeShip;
    window.createHitSparks = createHitSparks;
    window.createDistressFlare = createDistressFlare;
    window.playBossIntro = playBossIntro;
    window.spawnKillText = spawnKillText;
    window.flashEventText = flashEventText;
    window.wingmanTracerPush = wingmanTracerPush;
    window.wingmanTracerFade = wingmanTracerFade;
}
