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

// ── 1. PLAYER ENGINE TRAIL — FLAME RIBBON (restored from 86b9535) ───────────
// A camera-facing triangle strip behind the 3rd-person ship: tapers to
// nothing at the tail, vertex-colored with a time-shifting rainbow gradient
// (bright at the head, dark at the tail — under additive blending dark IS
// transparent, so it fades out like flame). Length breathes on two unsynced
// sines + speed. Near-camera fade keeps it from covering the ship.
const _PT_MAX = 64;
const _ptTrail = {
    points: [], mesh: null, geo: null, lastPush: null,
    pos: new Float32Array(_PT_MAX * 2 * 3),
    col: new Float32Array(_PT_MAX * 2 * 3)
};
const _ptDir = new THREE.Vector3();
const _ptView = new THREE.Vector3();
const _ptSide = new THREE.Vector3();
const _ptHSL = new THREE.Color();

function _ptEnsureMesh() {
    if (_ptTrail.mesh) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(_ptTrail.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(_ptTrail.col, 3));
    const idx = [];
    for (let i = 0; i < _PT_MAX - 1; i++) {
        const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
        idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    _ptTrail.mesh = new THREE.Mesh(geo, mat);
    _ptTrail.mesh.frustumCulled = false;
    _ptTrail.geo = geo;
    scene.add(_ptTrail.mesh);
}

function _updatePlayerTrail() {
    const cs = window.cameraState;
    const ship = cs && cs.playerShipMesh;
    const speed = (gameState.velocityVector) ? gameState.velocityVector.length() : 0;
    const visible = ship && ship.visible && speed > 0.8;
    const t = Date.now();

    if (visible) {
        const wp = ship.getWorldPosition(new THREE.Vector3());
        if (!_ptTrail.lastPush || wp.distanceTo(_ptTrail.lastPush) > Math.max(2, speed * 0.5)) {
            _ptTrail.points.push(wp.clone());
            _ptTrail.lastPush = wp.clone();
        }
    }
    const breathe = 0.7 + 0.18 * Math.sin(t * 0.0021) + 0.12 * Math.sin(t * 0.0047);
    const targetLen = visible
        ? Math.max(6, Math.floor(Math.min(_PT_MAX, 14 + speed * 4) * breathe))
        : 0;
    if (_ptTrail.points.length > targetLen) _ptTrail.points.shift();
    if (_ptTrail.points.length > targetLen) _ptTrail.points.shift();

    const N = _ptTrail.points.length;
    if (N > 2) {
        _ptEnsureMesh();
        _ptTrail.mesh.visible = true;
        const pts = _ptTrail.points;
        const headWidth = 0.9 + Math.min(2.2, speed * 0.10);
        for (let i = 0; i < N; i++) {
            const p = pts[i];
            _ptDir.subVectors(pts[Math.min(i + 1, N - 1)], pts[Math.max(i - 1, 0)]);
            if (_ptDir.lengthSq() < 1e-8) _ptDir.set(0, 1, 0);
            _ptDir.normalize();
            const distToCam = p.distanceTo(camera.position);
            _ptView.subVectors(p, camera.position).normalize();
            _ptSide.crossVectors(_ptDir, _ptView);
            if (_ptSide.lengthSq() < 1e-8) _ptSide.set(0, 1, 0);
            _ptSide.normalize();
            const nearFade = Math.max(0, Math.min(1, (distToCam - 26) / 46));
            const f = i / (N - 1);
            const width = (headWidth * Math.pow(f, 1.15) + 0.06) * (0.25 + 0.75 * nearFade);
            const o = i * 6;
            _ptTrail.pos[o]     = p.x + _ptSide.x * width;
            _ptTrail.pos[o + 1] = p.y + _ptSide.y * width;
            _ptTrail.pos[o + 2] = p.z + _ptSide.z * width;
            _ptTrail.pos[o + 3] = p.x - _ptSide.x * width;
            _ptTrail.pos[o + 4] = p.y - _ptSide.y * width;
            _ptTrail.pos[o + 5] = p.z - _ptSide.z * width;
            const hue = (f * 0.78 + t * 0.00013) % 1;
            const flick = 0.86 + 0.14 * Math.sin(t * 0.013 + i * 1.7);
            const bright = (0.06 + 0.38 * Math.pow(f, 1.4)) * flick * nearFade;
            _ptHSL.setHSL(hue, 1.0, Math.min(0.62, bright));
            _ptTrail.col[o]     = _ptHSL.r; _ptTrail.col[o + 1] = _ptHSL.g; _ptTrail.col[o + 2] = _ptHSL.b;
            _ptTrail.col[o + 3] = _ptHSL.r; _ptTrail.col[o + 4] = _ptHSL.g; _ptTrail.col[o + 5] = _ptHSL.b;
        }
        _ptTrail.geo.attributes.position.needsUpdate = true;
        _ptTrail.geo.attributes.color.needsUpdate = true;
        _ptTrail.geo.setDrawRange(0, (N - 1) * 6);
    } else if (_ptTrail.mesh) {
        _ptTrail.mesh.visible = false;
    }
}

// ── 1b. LASER CHARGE GLOW ───────────────────────────────────────────────────
// Two additive glows on the ship's wing/laser points that GROW + brighten
// (cyan→white) the longer the fire button is held (gameState._laserChargeStart),
// up to the 3s max. Shows for the player AND the demo (both set the timer).
const _chargeGlow = { sprites: null };
function _updateLaserCharge() {
    const ship = window.cameraState && window.cameraState.playerShipMesh;
    // CHARGE SPEED GATE: a charge in progress FIZZLES if the ship
    // accelerates past ~10,000 km/s (jump/warp mid-hold) — charging needs
    // a stable firing platform, and the glow can't credibly ride the wings
    // at warp speeds.
    if (typeof gameState !== 'undefined' && gameState._laserChargeStart > 0 &&
        gameState.velocityVector && gameState.velocityVector.length() > 10) {
        gameState._laserChargeStart = 0;
    }
    const charging = (typeof gameState !== 'undefined' && gameState._laserChargeStart > 0);
    if (!_chargeGlow.sprites) {
        if (!charging) return;
        _chargeGlow.sprites = [];
        for (let i = 0; i < 2; i++) {
            const sm = new THREE.SpriteMaterial({ map: _vfGlowTexture(), color: 0x66ccff,
                transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
                depthWrite: false, depthTest: false });
            const sp = new THREE.Sprite(sm); sp.renderOrder = 93; scene.add(sp);
            _chargeGlow.sprites.push(sp);
        }
    }
    const prog = (charging && ship && ship.visible)
        ? Math.max(0, Math.min(1, (Date.now() - gameState._laserChargeStart) / 2000)) : 0;
    if (prog <= 0.01) { _chargeGlow.sprites.forEach(s => { s.material.opacity = 0; s.scale.setScalar(0); }); return; }
    // Position the glows at the SAME wing guns the lasers fire from —
    // getPlayerWingGuns() is the shared ship-local anchor transform, so the
    // charge builds exactly at the beam origins in every view state (warp
    // framing, cinematic lag, banks, scale).
    let leftWing, rightWing;
    const _guns = (typeof window.getPlayerWingGuns === 'function') ? window.getPlayerWingGuns() : null;
    if (_guns) {
        leftWing = _guns.left;
        rightWing = _guns.right;
    } else {
        // legacy camera-space fallback (model not hydrated)
        const box = new THREE.Box3().setFromObject(ship);
        const size = box.getSize(new THREE.Vector3());
        const shipPos = ship.getWorldPosition(new THREE.Vector3());
        const cq = camera.quaternion;
        const wingSpread = size.x * 0.35, wingForward = -size.z * 0.15, wingUp = -2;
        leftWing = shipPos.clone().add(new THREE.Vector3(-wingSpread, wingUp, wingForward).applyQuaternion(cq));
        rightWing = shipPos.clone().add(new THREE.Vector3(wingSpread, wingUp, wingForward).applyQuaternion(cq));
    }
    // Expose for the blast origin (emit from the charge center).
    gameState._chargeWings = [leftWing, rightWing];
    gameState._chargeCenter = leftWing.clone().add(rightWing).multiplyScalar(0.5);
    // Glow size derives from the actual wing span (guns sit at ±0.35 of the
    // hull width, so span/0.7 ≈ ship width) — branch-independent. The old
    // `size.x` only existed in the fallback branch: with the wing-gun
    // helper active it threw a ReferenceError that the caller's try/catch
    // swallowed, silently killing the charge glow every frame.
    const _glowBase = Math.max(leftWing.distanceTo(rightWing) / 0.7, 8);
    const t = Date.now();
    const wings = [leftWing, rightWing];
    _chargeGlow.sprites.forEach((sp, i) => {
        sp.position.copy(wings[i]);
        const flick = 0.82 + 0.18 * Math.sin(t * 0.03 + i * 2);
        sp.scale.setScalar(_glowBase * (0.08 + prog * 0.34) * flick);
        sp.material.opacity = prog * 0.95;
        // YELLOW build (matches the yellow blast): gold → bright yellow-white
        sp.material.color.setHSL(0.13, 1, 0.5 + prog * 0.45);
    });
}

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
    // DISABLED — the dotted preview ray streaked across the foreground
    // whenever in slingshot range (constant near Sgr A*/Companion Core) and
    // read as a graphical glitch. The "SLINGSHOT READY" button already
    // signals readiness. Keep the line hidden if it was ever created.
    if (_wpPreview.line) _wpPreview.line.visible = false;
    return;
    /* eslint-disable no-unreachable */
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

// Immediately fade any live praise word (and its red/cyan anaglyph eye
// copies) so a spawn warning owns the screen. Exposed for boss/guardian
// spawn sites in other files.
function clearArcadePraise() {
    const els = [document.getElementById('arcadeText'),
                 ...document.querySelectorAll('.anaglyph-praise')];
    els.forEach(el => {
        if (!el) return;
        el.style.animation = 'none';
        el.style.transition = 'opacity 0.18s linear';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 200);
    });
}
if (typeof window !== 'undefined') window.clearArcadePraise = clearArcadePraise;

// ── 10. BOSS INTRO BEAT ─────────────────────────────────────────────────────
// Letterbox bars + name card for ~2.4s when a boss spawns.
function playBossIntro(bossName, faction, colorHex) {
    try {
        clearArcadePraise(); // the warning must be readable — kill praise now
        if (document.getElementById('bossIntroCard')) return; // one at a time
        // Strip any trailing internal "(placementType)" parenthetical so no
        // boss ever shows e.g. "Overlord (vulcanPatrol_boss)" — same for all.
        if (bossName) bossName = String(bossName).replace(/\s*\([^)]*\)\s*$/, '');
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

        // THREE lines:
        //   1) faction threat label  — "⚠ VULCAN HIGH COMMAND FLAGSHIP ⚠"
        //   2) the boss's name        — tinted to the faction color
        //   3) the player's directive — states the goal, ties to liberation
        const factionLabel = faction
            ? ('⚠ ' + String(faction).toUpperCase() + ' FLAGSHIP ⚠')
            : '⚠ ENEMY FLAGSHIP DETECTED ⚠';
        // faction color, lightened so the name reads against black bars
        let nameColor = '#ff5544';
        try {
            if (typeof colorHex === 'number' && typeof THREE !== 'undefined') {
                const c = new THREE.Color(colorHex).lerp(new THREE.Color(0xffffff), 0.45);
                nameColor = '#' + c.getHexString();
            }
        } catch (_) {}

        const card = document.createElement('div');
        card.id = 'bossIntroCard';
        card.style.cssText = 'position:fixed;left:50%;top:15%;transform:translateX(-50%);' +
            'z-index:71;font-family:Orbitron,monospace;font-weight:bold;' +
            'pointer-events:none;text-align:center;max-width:74vw;' +
            'animation:bossCardIn 2.6s ease forwards';
        card.innerHTML =
            '<div style="font-size:16px;letter-spacing:6px;color:#ff3333;text-shadow:0 0 14px rgba(255,40,40,.9);margin-bottom:8px">' + factionLabel + '</div>' +
            '<div style="font-size:30px;line-height:1.2;color:' + nameColor + ';text-shadow:0 0 20px ' + nameColor + '">' + (bossName || 'UNKNOWN FLAGSHIP') + '</div>' +
            '<div style="font-size:14px;letter-spacing:4px;color:#ffcc55;text-shadow:0 0 10px rgba(0,0,0,.9);margin-top:10px">ELIMINATE TO LIBERATE THE SECTOR</div>';
        document.body.appendChild(top); document.body.appendChild(bot); document.body.appendChild(card);
        requestAnimationFrame(() => { top.style.height = '8%'; bot.style.height = '8%'; });
        setTimeout(() => { top.style.height = '0'; bot.style.height = '0'; }, 2100);
        setTimeout(() => { top.remove(); bot.remove(); card.remove(); }, 2800);
    } catch (e) {}
}

// ── 11. BLACK-HOLE ACCRETION SPIRAL ─────────────────────────────────────────
// Small CHROMATIC particles spiral into EVERY black hole within range — so
// both twin cores (Sgr A* + Companion Core) get a disk when you're in the Sol
// region, plus any galaxy core you visit. One pooled Points system per hole.
const _accMap = new Map(); // bh.uuid -> { pts, geo, mat, data, r0, bh }
const _ACC_RANGE = 13000;
const _ACC_N = 150;

function _accMakeSpiral(bh) {
    const r0 = (bh.geometry && bh.geometry.parameters ? bh.geometry.parameters.radius : 100);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(_ACC_N * 3);
    const col = new Float32Array(_ACC_N * 3);
    const data = [];
    const c = new THREE.Color();
    for (let i = 0; i < _ACC_N; i++) {
        data.push({
            a: Math.random() * Math.PI * 2,
            r: r0 * (1.4 + Math.random() * 4.6),
            y: (Math.random() - 0.5) * r0 * 0.5,
            s: 0.5 + Math.random()
        });
        // Chromatic: rainbow hue spread around the disk, bright + saturated
        c.setHSL(i / _ACC_N, 0.95, 0.6);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
        size: Math.max(1.6, r0 * 0.022), // SMALLER (was r0*0.06)
        vertexColors: true, transparent: true,
        opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    return { pts, geo, mat, data, r0, bh };
}

function _updateAccretionSpiral(fc) {
    // Refresh which black holes are in range every ~2s
    if (fc % 120 === 0 || _accMap.size === 0) {
        const inRange = new Set();
        if (typeof planets !== 'undefined') {
            for (let i = 0; i < planets.length; i++) {
                const p = planets[i];
                if (!p || !p.userData || p.userData.type !== 'blackhole') continue;
                if (camera.position.distanceTo(p.position) > _ACC_RANGE) continue;
                inRange.add(p.uuid);
                if (!_accMap.has(p.uuid)) _accMap.set(p.uuid, _accMakeSpiral(p));
            }
        }
        // Dispose spirals whose hole left range
        _accMap.forEach((s, uuid) => {
            if (!inRange.has(uuid)) {
                scene.remove(s.pts); s.geo.dispose(); s.mat.dispose();
                _accMap.delete(uuid);
            }
        });
    }
    // Animate every active spiral
    _accMap.forEach((s) => {
        const r0 = s.r0, arr = s.geo.attributes.position.array, bp = s.bh.position;
        for (let i = 0; i < s.data.length; i++) {
            const d = s.data[i];
            d.a += (0.02 * d.s * r0 * 2) / d.r; // faster spin closer in
            d.r -= 0.12 * d.s;                   // inward drift
            if (d.r < r0 * 1.1) {                // crossed the horizon — respawn outside
                d.r = r0 * (4 + Math.random() * 2);
                d.a = Math.random() * Math.PI * 2;
                d.y = (Math.random() - 0.5) * r0 * 0.5;
            }
            arr[i * 3] = bp.x + Math.cos(d.a) * d.r;
            arr[i * 3 + 1] = bp.y + d.y * (d.r / (r0 * 6));
            arr[i * 3 + 2] = bp.z + Math.sin(d.a) * d.r;
        }
        s.geo.attributes.position.needsUpdate = true;
    });
}

// ── 12. PLANET RIM-GLOW ATMOSPHERES ─────────────────────────────────────────
// Additive backside shells on the nearest few planets.
const _rimShells = new Map(); // planet.uuid -> { planet, shell, mat }

function _updateRimGlow(fc) {
    // EVERY FRAME: keep each shell glued to its planet. Planets orbit/move
    // every frame; doing this only on the 20-frame rescan made the
    // atmosphere visibly lag behind the planet. Cheap (≤6 position copies).
    _rimShells.forEach((entry) => {
        if (entry.planet && entry.shell) entry.shell.position.copy(entry.planet.position);
    });

    // Throttle only the EXPENSIVE part — choosing which planets get a shell.
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
        }
        // (position-follow now happens every frame at the top of this fn)
    });
}

// ── 13. FLOATING KILL TEXT ──────────────────────────────────────────────────
// sizePx optional: caller passes a proximity-scaled size (closer hit = bigger
// word). Defaults to 15 if omitted.
function spawnKillText(worldPos, text, cssColor, sizePx) {
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
        const fs = Math.round(sizePx || 15);
        const topPx = ((1 - v.y) / 2 * window.innerHeight).toFixed(0);
        const mk = (leftPx, eyeFilter) => {
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;z-index:55;pointer-events:none;font-family:Orbitron,monospace;' +
                'font-weight:bold;font-size:' + fs + 'px;text-shadow:0 0 8px rgba(0,0,0,0.9);' +
                'animation:killTextFloat 1.4s ease-out forwards;' +
                'left:' + leftPx.toFixed(0) + 'px;top:' + topPx + 'px;' +
                'color:' + (cssColor || '#ffcc44') +
                (eyeFilter ? ';filter:url(#anaglyph-' + eyeFilter + '-eye)' : '');
            div.textContent = text;
            document.body.appendChild(div);
            setTimeout(() => div.remove(), 1500);
        };
        // In anaglyph 3D, place a red/cyan copy at each stereo eye's
        // projection so the text sits at the TARGET's scene depth instead
        // of flat at the screen plane.
        const eyes = (typeof anaglyphMode !== 'undefined') ? anaglyphMode.eyeProjectPx(worldPos) : null;
        if (eyes) {
            mk(eyes.leftX, 'left');
            mk(eyes.rightX, 'right');
        } else {
            mk((v.x + 1) / 2 * window.innerWidth, null);
        }
    } catch (e) {}
}

// Proximity → font size, TIGHT range so mid-distance matches the 15px
// pickup text (+MISSILE etc.): ~19px point-blank, 15px at mid, ~11px far.
function killTextSizeForDistance(dist) {
    const t = Math.max(0, Math.min(1, (dist - 250) / 3750)); // 0 near .. 1 far
    return Math.round(19 - t * 8); // 19 (near) .. 15 (mid) .. 11 (far)
}

// ── 14. EVENT TEXT — cinematic center-screen announcements ─────────────────
// Bigger moment-marker than achievements: scales in, holds, fades. Used for
// Borg arrival, wingman deaths/recruits, caravan rescues, etc.
// Event alert cards all render at the same top:26% slot, so they must play
// ONE AT A TIME. Same-title re-fires are dropped (the Borg alarm used to
// fire per frame — dozens of stacked cards smeared into an illegible glow
// blob); different titles triggered together (HOSTILES DETECTED + BOSS
// DETECTED) queue and play back-to-back.
const _eventTextQueue = [];

function flashEventText(title, cssColor, subtext) {
    try {
        const live = document.querySelector('.event-text-flash');
        if (live) {
            if (live.dataset.title === title) return;               // already showing
            if (_eventTextQueue.some(q => q.title === title)) return; // already queued
            if (_eventTextQueue.length < 3) {
                _eventTextQueue.push({ title, cssColor, subtext });
            }
            return;
        }
        // The alert owns the praise band (top:26% is inside the praise
        // swell zone): fade live praise now, and flashArcadeText blocks
        // new praise while any .event-text-flash card is up.
        clearArcadePraise();
        if (!document.getElementById('eventTextStyle')) {
            const st = document.createElement('style');
            st.id = 'eventTextStyle';
            st.textContent = '@keyframes eventTextIn{0%{opacity:0;transform:translateX(-50%) scale(1.6)}' +
                '18%{opacity:1;transform:translateX(-50%) scale(1)}78%{opacity:1}' +
                '100%{opacity:0;transform:translateX(-50%) scale(0.96)}}';
            document.head.appendChild(st);
        }
        const div = document.createElement('div');
        div.className = 'event-text-flash';
        div.dataset.title = title;
        div.style.cssText = 'position:fixed;left:50%;top:26%;transform:translateX(-50%);z-index:72;' +
            'pointer-events:none;text-align:center;font-family:Orbitron,monospace;font-weight:bold;' +
            'max-width:80vw;animation:eventTextIn 2s ease forwards;color:' + (cssColor || '#ffcc44') + ';' +
            'text-shadow:0 0 6px currentColor';
        div.innerHTML = '<div style="font-size:24px;letter-spacing:8px">' + title + '</div>' +
            (subtext ? '<div style="font-size:13px;letter-spacing:3px;opacity:0.85;margin-top:4px">' +
                subtext + '</div>' : '');
        document.body.appendChild(div);
        setTimeout(() => {
            div.remove();
            const next = _eventTextQueue.shift();
            if (next) flashEventText(next.title, next.cssColor, next.subtext);
        }, 2100);
    } catch (e) {}
}

// ── 14b. ARCADE PRAISE — big tiered words, upper-middle of the screen ───────
// Pops like HIT/CRIT but LARGER and screen-centered (not at the target).
// Tiered by rarity so the biggest words are reserved for the rarest moments;
// a kill-streak escalates the tier (rapid kills → bigger praise).
const _TIER_STYLE = {
    1: { size: 30, color: '#9fe8ff' },   // good
    2: { size: 38, color: '#ffe066' },   // better
    3: { size: 46, color: '#ff9a3c' },   // rare
    4: { size: 55, color: '#ff5db1' },   // very rare
    5: { size: 62, color: '#c08cff' },   // extremely rare
    6: { size: 72, color: '#ff3df0' },   // legendary
};
// Tier 1 is COLORFUL (no bland "good shot"): close kills get punchy
// destruction verbs, far kills get sniper flavor. Distance-split.
const _PRAISE1_FAR = ['SNIPED!', 'PICKED OFF!', 'LONG-RANGE KILL!', 'CLEAN SNIPE!', 'NAILED IT!', 'TAGGED FROM RANGE!'];
const _PRAISE1_NEAR = ['VAPORIZED!', 'BLASTED!', 'SHREDDED!', 'TORCHED!', 'WRECKED!', 'SMOKED!', 'OBLITERATED!', 'SCRAPPED!'];
const _PRAISE = {
    2: ['EXCELLENT!', 'PRECISION HIT!', 'BULLSEYE!', 'DEADLY ACCURACY!', 'OUTSTANDING!', 'LASER PERFECT!', 'DEAD CENTER!'],
    3: ['INCREDIBLE SHOT!', 'DEVASTATING HIT!', 'SPECTACULAR!', 'PERFECT SHOT!', 'PHENOMENAL!', 'BRUTAL!'],
    4: ['IMPOSSIBLE SHOT!', 'UNBELIEVABLE!', 'ASTONISHING!', 'ABSOLUTE DESTRUCTION!', 'CATACLYSMIC!'],
    5: ['ORBITAL PERFECTION!', 'COSMIC FORCE!', 'TRANSCENDENT!', 'GALACTIC ACE!', 'ANNIHILATION!'],
    6: ['REALITY BENT!', 'GODLIKE!', 'LEGENDARY!', 'STARBORN!', 'APOCALYPSE!'],
};
const _STREAK_WORD = { 2:'DOUBLE KILL!', 3:'TRIPLE KILL!', 4:'QUAD KILL!', 5:'MULTI-KILL!',
    7:'RAMPAGE!', 10:'UNSTOPPABLE!', 15:'DOMINATING!', 20:'GODLIKE!' };
const _arcade = { last: 0, streak: 0, lastKill: 0, lastWord: '' };
// Pick from a pool, avoiding an immediate repeat of the last word shown.
function _pick(a) {
    if (!a || !a.length) return '';
    let w = a[Math.floor(Math.random() * a.length)];
    if (a.length > 1 && w === _arcade.lastWord) w = a[(a.indexOf(w) + 1) % a.length];
    _arcade.lastWord = w;
    return w;
}

function flashArcadeText(text, tier, subtitle) {
    try {
        // Never cover the boss SPAWN announcement — it owns the same upper
        // band of the screen. Skip arcade praise while the boss intro card
        // is up (it's only on screen ~2.6s).
        if (document.getElementById('bossIntroCard')) return;
        // Same for event alert cards (HOSTILES DETECTED, THE BORG, …):
        // no new praise for the alert's ~2s lifetime.
        if (document.querySelector('.event-text-flash')) return;
        // Mobile: mission-control / comms messages own the screen — no
        // praise until they're gone (small screen, everything overlaps).
        const _mobPraise = ('ontouchstart' in window) || window.innerWidth <= 768;
        if (_mobPraise) {
            const _shown = (id) => {
                const el = document.getElementById(id);
                return el && !el.classList.contains('hidden') &&
                    getComputedStyle(el).display !== 'none';
            };
            if (_shown('missionCommandAlert') ||
                _shown('incomingTransmissionPrompt') ||
                _shown('incomingTransmission')) return;
        }
        const ts = _TIER_STYLE[tier] || _TIER_STYLE[1];
        if (!document.getElementById('arcadeTextStyle')) {
            const st = document.createElement('style');
            st.id = 'arcadeTextStyle';
            // Pop in big + transparent, two settle PULSES, then slowly GROW
            // while fading to transparent — feels alive and energetic.
            // More translucent overall (peak ~0.8) and a LARGER grow on the
            // fade-out — the word swells well past 2x as it dissolves.
            st.textContent = '@keyframes arcadePop{' +
                '0%{opacity:0;transform:translateX(-50%) scale(2.6)}' +
                '11%{opacity:0.82;transform:translateX(-50%) scale(0.86)}' +
                '20%{transform:translateX(-50%) scale(1.10)}' +              // pulse 1
                '29%{transform:translateX(-50%) scale(0.96)}' +
                '38%{opacity:0.8;transform:translateX(-50%) scale(1.06)}' +  // pulse 2
                '48%{opacity:0.72;transform:translateX(-50%) scale(1.05)}' +
                '64%{opacity:0.5;transform:translateX(-50%) scale(1.5)}' +   // grow + fade
                '100%{opacity:0;transform:translateX(-50%) scale(2.4)}}';    // big swell as it vanishes
            document.head.appendChild(st);
        }
        const old = document.getElementById('arcadeText'); if (old) old.remove();
        // On mobile the big tier words (up to 72px, nowrap) overflow narrow
        // screens. Scale the font to the viewport width and allow wrapping so
        // a long word never runs off the edge.
        const _isMobile = window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024);
        const fontPx = _isMobile ? Math.round(Math.min(ts.size, window.innerWidth * 0.085)) : ts.size;
        const wrap = _isMobile ? 'normal' : 'nowrap';
        const ls = _isMobile ? 2 : 3;
        const maxW = _isMobile ? 'max-width:92vw;' : '';
        const div = document.createElement('div');
        div.id = 'arcadeText';
        div.style.cssText = 'position:fixed;left:50%;top:19%;transform:translateX(-50%);z-index:73;' +
            'pointer-events:none;text-align:center;white-space:' + wrap + ';' + maxW + 'font-family:Orbitron,monospace;' +
            'font-weight:900;font-size:' + fontPx + 'px;letter-spacing:' + ls + 'px;color:' + ts.color + ';' +
            'text-shadow:0 0 22px ' + ts.color + ',0 0 44px ' + ts.color + ',0 0 12px rgba(0,0,0,0.8);' +
            'will-change:transform,opacity;animation:arcadePop 2s cubic-bezier(.2,.7,.3,1) forwards';
        // Optional subtitle names what was killed ("VULCAN HIGH COMMAND
        // ELIMINATED") under the praise word — smaller, dimmer, same color.
        if (subtitle) {
            div.innerHTML = '<div>' + text + '</div>' +
                '<div style="font-size:' + Math.round(fontPx * 0.34) + 'px;letter-spacing:' + ls + 'px;' +
                'opacity:0.7;margin-top:4px;font-weight:700">' + subtitle + '</div>';
        } else {
            div.textContent = text;
        }
        document.body.appendChild(div);
        setTimeout(() => { if (div.parentNode) div.remove(); }, 2050);
    } catch (e) {}
}

// Short faction/type label for a killed enemy, for the kill subtitle.
function _killLabel(ud) {
    if (!ud) return null;
    if (ud.isVulcanPatrol) return 'VULCAN HIGH COMMAND';
    if (ud.isMartianPirate) return 'MARTIAN PIRATES';
    if (typeof galaxyTypes !== 'undefined' && typeof ud.galaxyId === 'number' &&
        galaxyTypes[ud.galaxyId] && galaxyTypes[ud.galaxyId].faction) {
        return String(galaxyTypes[ud.galaxyId].faction).toUpperCase();
    }
    // Fall back to the name with any trailing number/role stripped
    if (ud.name) return String(ud.name).replace(/\s+(Hostile|Support|Patrol)?\s*\d+.*$/i, '').toUpperCase();
    return null;
}

// Called on each enemy kill. Manages the streak and picks a tier so the
// biggest words stay rare (most kills → tier 1; streaks + bosses escalate).
function arcadePraiseKill(isBoss, dist, killedUd) {
    const now = Date.now();
    if (now - (_arcade.lastKill || 0) > 3500) _arcade.streak = 0;
    _arcade.streak++; _arcade.lastKill = now;
    const sub = (killedUd ? _killLabel(killedUd) : null);
    const subEliminated = sub ? (sub + ' ELIMINATED') : null;

    if (_STREAK_WORD[_arcade.streak]) {
        flashArcadeText(_STREAK_WORD[_arcade.streak], Math.min(6, 2 + Math.floor(_arcade.streak / 3)), subEliminated);
        return;
    }
    // Don't praise EVERY kill — a constant word stream reads as noise. Show
    // praise on a minority of routine single kills (so it's a highlight),
    // biased toward the more colorful tiers. Streaks (handled above) and
    // bosses always show.
    let tier;
    const roll = Math.random();
    if (roll > 0.97) tier = 3;        // ~3%  rare, very colorful
    else if (roll > 0.74) tier = 2;   // ~23% colorful
    else if (roll > 0.52) tier = 1;   // ~22% colorful-common
    else if (_arcade.streak < 2) return; // ~52% of lone kills: stay quiet
    else tier = 1;
    tier += Math.floor(_arcade.streak / 4);          // streak escalates the praise
    if (isBoss) tier = Math.max(tier, 4);            // boss kills always feel huge
    tier = Math.max(1, Math.min(6, tier));
    if (tier === 1) {
        const far = (typeof dist === 'number') ? dist > 1600 : false;
        flashArcadeText(_pick(far ? _PRAISE1_FAR : _PRAISE1_NEAR), 1, subEliminated);
    } else {
        flashArcadeText(_pick(_PRAISE[tier]), tier, subEliminated);
    }
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
    // Tunnel-vision vignette — toned back down per playtest (was 0.78/0.97).
    vig.style.cssText = 'position:absolute;inset:0;opacity:0;' +
        'background:radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(2,6,20,0.5) 78%, rgba(0,0,10,0.78) 100%)';
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
    // TIME DILATION (gravity whip periapsis): the whip publishes a 0..1
    // dilation weight as it slows through closest approach. Borrow the speed
    // layers to sell it — the rim chroma stresses and the spokes stretch
    // while "time" drags, then snap back as the arc accelerates out.
    const dil = (typeof window !== 'undefined' && window.__whipDilation) || 0;
    if (dil > 0.01) target = Math.max(target, 0.55 + dil * 0.45);
    // SUSTAINED WARP TUNNEL (§20): while you are inside the shaft the frame
    // closes in. Held separately from `level` so the vignette can go deeper
    // than plain speed ever does without also cranking the spokes and chroma
    // — tunnel vision is the point, a strobing edge is not.
    const tun = (typeof window !== 'undefined' && window.__warpTunnelLevel) || 0;
    if (tun > 0.01) target = Math.max(target, 0.6 + tun * 0.4);
    // Faster attack while dilating so the effect lands inside the ~0.3s window.
    _sfx.level += (target - _sfx.level) * (dil > 0.05 ? 0.14 : 0.05);
    if (_sfx.level < 0.012) {
        if (_sfx.wrap) _sfx.wrap.style.display = 'none';
        return;
    }
    _ensureScreenFX();
    _sfx.wrap.style.display = 'block';
    const L = _sfx.level;
    const t = Date.now();
    _sfx.vig.style.opacity = Math.min(1, L * 0.8 + tun * tun * 0.34).toFixed(3);
    _sfx.streaks.style.opacity = (Math.max(0, L - 0.25) * 0.65).toFixed(3);
    // Slow sweep + breathing scale so the spokes feel like rushing light,
    // not a static stencil
    // Recentre the spokes on where the ship is actually GOING, so they agree
    // with the 3D streak field instead of always radiating from dead-centre.
    if (typeof _wsfVanishingShift === 'function') _wsfVanishingShift(_wsfShift);
    _sfx.streaks.style.transform =
        'translate(' + _wsfShift[0].toFixed(1) + '%,' + _wsfShift[1].toFixed(1) + '%) ' +
        'rotate(' + ((t * (0.004 + L * 0.006)) % 360).toFixed(1) + 'deg) ' +
        'scale(' + (1 + L * 0.04 + Math.sin(t * 0.003) * 0.012).toFixed(3) + ')';
    _sfx.chroma.style.opacity = (Math.max(0, L - 0.45) * 0.9).toFixed(3);
}

// ── 18. SLINGSHOT FEEL — charge, periapsis shake, launch punch ──────────────
// The gravity whip is the signature move of the game, so it gets its own
// feedback stack. Everything here is driven by wall-clock or the game's dt,
// pooled, and self-disposing:
//   a) whipScreenShake()  radial screen shake — a composited transform on
//      #gameCanvas ONLY, so the HUD never wobbles. Amplitude-accumulating:
//      overlapping calls fold into one envelope instead of cutting each
//      other short.
//   b) whipScreenPulse()  chromatic launch punch — neon bloom from center
//      plus an RGB-split iris that rips outward.
//   c) whipShockwave()    expanding rings + core flare at the body that
//      kicked you (one billboarded, one in the whip plane).
//   d) _updateWhipCharge() anticipation glow ON the body: a faint breathing
//      rim whenever a slingshot is READY, ramping to a hot halo + spinning
//      capture ring while the whip runs, then bursting outward at release.
// Overdraw budget: at most 3 additive surfaces on one body + 2 short-lived
// rings, i.e. cheaper than a single extra particle burst.

// Small driver so these effects ride the game's dt loop when available and
// still work (at 30Hz) if explosionManager hasn't loaded yet.
function _vfDrive(updateFn, cleanupFn) {
    if (typeof explosionManager !== 'undefined' && explosionManager && explosionManager.addExplosion) {
        explosionManager.addExplosion({ update: updateFn, cleanup: cleanupFn });
        return;
    }
    const iv = setInterval(() => {
        let alive = false;
        try { alive = updateFn(33); } catch (e) { alive = false; }
        if (!alive) { clearInterval(iv); try { cleanupFn(); } catch (e) {} }
    }, 33);
}

// ── 18a. RADIAL SCREEN SHAKE ────────────────────────────────────────────────
const _whipShake = { amp: 0, t0: 0, dur: 1, el: null, applied: false };

function whipScreenShake(amp, durMs) {
    const now = Date.now();
    const a = Math.max(0.5, amp || 4);
    const d = Math.max(80, durMs || 400);
    const left = Math.max(0, (_whipShake.t0 + _whipShake.dur) - now);
    // Fold the live envelope's REMAINING amplitude in, then take the max —
    // a periapsis rumble already fading can never clip the launch kick.
    const liveAmp = _whipShake.amp * (left / Math.max(1, _whipShake.dur));
    _whipShake.amp = Math.max(liveAmp, a);
    _whipShake.dur = Math.max(left, d);
    _whipShake.t0 = now;
}

function _updateWhipShakeFx() {
    const st = _whipShake;
    if (!st.el || !st.el.isConnected) st.el = document.getElementById('gameCanvas');
    const el = st.el;
    if (!el) return;
    const k = (st.amp > 0) ? 1 - (Date.now() - st.t0) / Math.max(1, st.dur) : 0;
    if (k <= 0) {
        if (st.applied) { el.style.transform = ''; el.style.willChange = ''; st.applied = false; }
        st.amp = 0;
        return;
    }
    if (!st.applied) el.style.willChange = 'transform';
    const now = Date.now();
    const a = st.amp * k * k;                       // ease-out quadratic
    const ang = now * 0.055;                        // fast-rotating radial kick
    const jx = Math.cos(ang) * a + (Math.random() - 0.5) * a * 0.55;
    const jy = Math.sin(ang * 1.27) * a + (Math.random() - 0.5) * a * 0.55;
    // The scale pump is what makes it read RADIAL rather than a flat rattle.
    el.style.transform = 'translate3d(' + jx.toFixed(2) + 'px,' + jy.toFixed(2) + 'px,0) ' +
        'scale(' + (1 + a * 0.0019).toFixed(4) + ')';
    st.applied = true;
}

// ── 18b. CHROMATIC LAUNCH PULSE ─────────────────────────────────────────────
function whipScreenPulse(colorHex, strength) {
    try {
        if (document.getElementById('whipPulseFx')) return;   // one at a time
        const s = Math.max(0.25, Math.min(1.6, strength || 1));
        let rgb = '90,205,255';
        try {
            if (typeof THREE !== 'undefined') {
                const c = new THREE.Color(typeof colorHex === 'number' ? colorHex : 0x33ccff);
                rgb = Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255);
            }
        } catch (e) {}
        if (!document.getElementById('whipPulseStyle')) {
            const st = document.createElement('style');
            st.id = 'whipPulseStyle';
            st.textContent =
                '@keyframes whipBloom{0%{opacity:0;transform:scale(.55)}7%{opacity:1;transform:scale(1)}' +
                '100%{opacity:0;transform:scale(2.15)}}' +
                '@keyframes whipIris{0%{opacity:0;transform:scale(.15)}9%{opacity:1}' +
                '100%{opacity:0;transform:scale(2.6)}}' +
                '@keyframes whipChroma{0%{opacity:0}8%{opacity:1}100%{opacity:0}}';
            document.head.appendChild(st);
        }
        const wrap = document.createElement('div');
        wrap.id = 'whipPulseFx';
        wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:44;' +
            'mix-blend-mode:screen;overflow:hidden';
        // Neon bloom out of the vanishing point
        const bloom = document.createElement('div');
        bloom.style.cssText = 'position:absolute;inset:-25%;will-change:transform,opacity;' +
            'animation:whipBloom ' + (620 * s).toFixed(0) + 'ms cubic-bezier(.1,.75,.25,1) forwards;' +
            'background:radial-gradient(circle at 50% 50%,' +
            'rgba(255,255,255,' + (0.85 * s).toFixed(2) + ') 0%,' +
            'rgba(' + rgb + ',' + (0.62 * s).toFixed(2) + ') 13%,' +
            'rgba(' + rgb + ',0.18) 34%,rgba(' + rgb + ',0) 62%)';
        // Expanding hot iris ring — the "shell" of the launch
        const iris = document.createElement('div');
        iris.style.cssText = 'position:absolute;inset:-25%;will-change:transform,opacity;' +
            'animation:whipIris ' + (700 * s).toFixed(0) + 'ms cubic-bezier(.08,.8,.2,1) forwards;' +
            'background:radial-gradient(circle at 50% 50%,rgba(' + rgb + ',0) 26%,' +
            'rgba(255,255,255,' + (0.5 * s).toFixed(2) + ') 33%,rgba(' + rgb + ',' + (0.42 * s).toFixed(2) + ') 37%,' +
            'rgba(' + rgb + ',0) 47%)';
        // Lens stress: red/blue split at the rim
        const chroma = document.createElement('div');
        chroma.style.cssText = 'position:absolute;inset:0;will-change:opacity;' +
            'animation:whipChroma ' + (560 * s).toFixed(0) + 'ms ease-out forwards;' +
            'background:radial-gradient(ellipse at 48.6% 50%,transparent 46%,rgba(255,0,80,' + (0.4 * s).toFixed(2) + ') 82%,transparent 100%),' +
            'radial-gradient(ellipse at 51.4% 50%,transparent 46%,rgba(0,140,255,' + (0.4 * s).toFixed(2) + ') 82%,transparent 100%)';
        wrap.appendChild(chroma); wrap.appendChild(bloom); wrap.appendChild(iris);
        document.body.appendChild(wrap);
        setTimeout(() => { if (wrap.parentNode) wrap.remove(); }, Math.round(760 * s));
    } catch (e) {}
}

// ── 18c. SHOCKWAVE RINGS AT THE BODY ────────────────────────────────────────
function whipShockwave(position, colorHex, baseRadius, strength) {
    if (!position || typeof scene === 'undefined' || typeof THREE === 'undefined') return;
    try {
        const R = Math.max(14, baseRadius || 40);
        const S = Math.max(0.4, Math.min(2.2, strength || 1));
        const base = new THREE.Color(typeof colorHex === 'number' ? colorHex : 0x33ccff);
        const hot = base.clone().lerp(new THREE.Color(0xffffff), 0.6);
        const parts = [];
        const mk = (inner, outer, color, opacity, billboard) => {
            const geo = new THREE.RingGeometry(inner, outer, 64);
            const mat = new THREE.MeshBasicMaterial({
                color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const m = new THREE.Mesh(geo, mat);
            m.position.copy(position);
            m.renderOrder = 60;
            m.frustumCulled = false;
            if (!billboard) m.rotation.x = Math.PI / 2;   // the whip plane
            scene.add(m);
            parts.push({ m: m, geo: geo, mat: mat, o: opacity, bb: billboard });
        };
        mk(R * 0.92, R * 1.0, hot, 0.95, true);    // face-on flash ring
        mk(R * 0.86, R * 0.95, base, 0.8, false);  // in-plane shock
        const sm = new THREE.SpriteMaterial({
            map: _vfGlowTexture(), color: hot, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const flare = new THREE.Sprite(sm);
        flare.position.copy(position);
        flare.scale.setScalar(R * 1.4);
        scene.add(flare);
        let t = 0;
        _vfDrive((dt) => {
            t += (dt || 16.67) / 640;
            const e = 1 - Math.pow(1 - Math.min(1, t), 3);
            for (let i = 0; i < parts.length; i++) {
                const p = parts[i];
                p.m.scale.setScalar(1 + e * (2.5 + i * 1.2) * S);
                p.mat.opacity = Math.max(0, p.o * (1 - t) * (1 - t));
                if (p.bb && typeof camera !== 'undefined') p.m.lookAt(camera.position);
            }
            flare.scale.setScalar(R * (1.4 + e * 2.4 * S));
            sm.opacity = Math.max(0, 0.9 * (1 - t * 1.7));
            return t < 1;
        }, () => {
            for (let i = 0; i < parts.length; i++) {
                scene.remove(parts[i].m); parts[i].geo.dispose(); parts[i].mat.dispose();
            }
            scene.remove(flare); sm.dispose();
        });
    } catch (e) {}
}

// ── 18d. ANTICIPATION CHARGE GLOW ON THE WHIPPED BODY ───────────────────────
const _whipCharge = {
    body: null, shell: null, shellMat: null, halo: null, haloMat: null,
    ring: null, ringMat: null, radius: 20,
    level: 0, want: 0, color: 0x33ccff, burst: 0, wasWhipping: false, scanAt: 0
};

function _whipChargeBuild(body, colorHex) {
    _whipChargeDispose();
    const r = (body.geometry && body.geometry.parameters && body.geometry.parameters.radius) || 20;
    const col = new THREE.Color(colorHex);
    _whipCharge.shellMat = new THREE.MeshBasicMaterial({
        color: col.clone().lerp(new THREE.Color(0xffffff), 0.25), transparent: true,
        opacity: 0, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    _whipCharge.shell = new THREE.Mesh(new THREE.SphereGeometry(r * 1.26, 24, 16), _whipCharge.shellMat);
    _whipCharge.shell.frustumCulled = false;
    scene.add(_whipCharge.shell);

    _whipCharge.haloMat = new THREE.SpriteMaterial({
        map: _vfGlowTexture(), color: col.clone(), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    _whipCharge.halo = new THREE.Sprite(_whipCharge.haloMat);
    scene.add(_whipCharge.halo);

    _whipCharge.ringMat = new THREE.MeshBasicMaterial({
        color: col.clone().lerp(new THREE.Color(0xffffff), 0.4), transparent: true,
        opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    _whipCharge.ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.55, r * 1.63, 64), _whipCharge.ringMat);
    _whipCharge.ring.rotation.x = Math.PI / 2;
    _whipCharge.ring.frustumCulled = false;
    scene.add(_whipCharge.ring);

    _whipCharge.body = body;
    _whipCharge.radius = r;
    _whipCharge.color = colorHex;
}

function _whipChargeDispose() {
    ['shell', 'ring'].forEach((k) => {
        const m = _whipCharge[k];
        if (m) { scene.remove(m); if (m.geometry) m.geometry.dispose(); }
        _whipCharge[k] = null;
    });
    if (_whipCharge.halo) { scene.remove(_whipCharge.halo); _whipCharge.halo = null; }
    ['shellMat', 'ringMat', 'haloMat'].forEach((k) => {
        if (_whipCharge[k]) { _whipCharge[k].dispose(); _whipCharge[k] = null; }
    });
    _whipCharge.body = null;
    _whipCharge.level = 0;
}

function _whipBodyColor(body) {
    const ud = body && body.userData;
    if (!ud) return 0x33ccff;
    if (ud.type === 'blackhole') return 0x9933ff;
    if (ud.type === 'star' || ud.isLocalStar) return 0xffcc44;
    return 0x33ccff;
}

function _updateWhipCharge(fc) {
    const gs = (typeof gameState !== 'undefined') ? gameState : null;
    if (!gs) return;
    const whip = gs.slingshotWhip;
    const now = Date.now();
    let target = null, want = 0, color = _whipCharge.color;

    if (whip && whip.body && whip.body.position) {
        // CAPTURED: the glow swells with the sweep and peaks at periapsis.
        target = whip.body;
        color = (typeof whip.color === 'number') ? whip.color : _whipBodyColor(target);
        const u = Math.max(0, Math.min(1, (now - whip.t0) / (whip.durMs || 1600)));
        // Ride the SAME 0→1→0 carve envelope the arc banks on (published by
        // the physics whip), so the body's charge peaks exactly when the turn
        // bites hardest instead of drifting against it. Now that the camera
        // leads into the corner, this glow is on screen for the whole arc —
        // it has to be a real build, not a faint rim.
        const wfc = (typeof window !== 'undefined' && window.__whipFrame &&
            window.__whipFrame.active && typeof window.__whipFrame.carve === 'number')
            ? window.__whipFrame.carve
            : Math.sin(Math.PI * Math.min(1, u * 1.08));
        want = 0.62 + 0.78 * wfc;
        _whipCharge.wasWhipping = true;
    } else {
        if (_whipCharge.wasWhipping) {
            // RELEASE: the charge blows outward instead of just fading.
            _whipCharge.wasWhipping = false;
            _whipCharge.burst = 1;
        }
        // READY: a faint breathing rim, gated exactly like the SLINGSHOT
        // READY prompt so it never lights a body you can't actually whip.
        if (now - _whipCharge.scanAt > 260) {
            _whipCharge.scanAt = now;
            _whipCharge._ready = null;
            if (typeof findSlingshotTarget === 'function' &&
                !(gs.slingshot && gs.slingshot.active) &&
                now >= (gs.slingshotCooldownUntil || 0)) {
                const quick = !!(gs.repTierUnlocks && gs.repTierUnlocks.quickSlingshot);
                if (quick || gs.energy >= 20) {
                    try { _whipCharge._ready = findSlingshotTarget(); } catch (e) {}
                }
            }
        }
        if (_whipCharge._ready && _whipCharge._ready.position) {
            target = _whipCharge._ready;
            color = _whipBodyColor(target);
            want = 0.15 + 0.05 * Math.sin(now * 0.004);   // slow breath, deliberately faint
        }
    }

    if (_whipCharge.burst > 0) _whipCharge.burst = Math.max(0, _whipCharge.burst - 0.055);

    if (!target) {
        if (_whipCharge.body && _whipCharge.level < 0.02 && _whipCharge.burst <= 0) {
            _whipChargeDispose();
            return;
        }
        if (!_whipCharge.body) return;
        target = _whipCharge.body;                       // let the glow fade out in place
    } else if (target !== _whipCharge.body || color !== _whipCharge.color) {
        const keepLevel = (target === _whipCharge.body) ? _whipCharge.level : 0;
        _whipChargeBuild(target, color);
        _whipCharge.level = keepLevel;
    }
    if (!_whipCharge.shell) return;

    // Ease toward the target level (fast up, slower down)
    const rate = (want > _whipCharge.level) ? 0.16 : 0.06;
    _whipCharge.level += (want - _whipCharge.level) * rate;
    const L = _whipCharge.level;
    const B = _whipCharge.burst;
    const r = _whipCharge.radius;
    const p = target.position;

    _whipCharge.shell.position.copy(p);
    _whipCharge.shell.scale.setScalar(1 + B * 0.85 + L * 0.08);
    _whipCharge.shellMat.opacity = Math.min(0.72, L * 0.38 + B * 0.5);

    _whipCharge.halo.position.copy(p);
    _whipCharge.halo.scale.setScalar(r * (3.0 + L * 3.8 + B * 3.4));
    _whipCharge.haloMat.opacity = Math.min(0.92, L * 0.5 + B * 0.45);

    // The capture ring winds UP as the charge builds — a visible spin-up on
    // the body that is about to throw you, so the release has something the
    // eye has been watching load.
    _whipCharge.ring.position.copy(p);
    _whipCharge.ring.rotation.z += 0.012 + L * 0.09;
    _whipCharge.ring.scale.setScalar(1 + B * 1.5 + 0.16 * Math.max(0, L - 0.6) +
        Math.sin(now * 0.006) * 0.02 * L);
    _whipCharge.ringMat.opacity = Math.min(0.88, L * 0.58 + B * 0.4);
}

// Exposed so the physics whip can drive the punchy beats at exact frames.
if (typeof window !== 'undefined') {
    window.whipScreenShake = whipScreenShake;
    window.whipScreenPulse = whipScreenPulse;
    window.whipShockwave = whipShockwave;
}

// ── 19. WARP STREAK FIELD — the thing that makes 79,000 km/s LOOK like it ────
// The whip's release used to be a number change: velocity snapped from ~24 to
// ~4800 u/s while the background stars stayed discrete stationary dots and the
// ship sat dead-centre. Two frames half a second apart differed by ~1.7%. This
// is the fix: a camera-anchored field of stretched star-streaks locked to the
// VELOCITY VECTOR (not the look vector), so every streak radiates out of the
// on-screen vanishing point of travel — turn the ship mid-boost and the whole
// field keeps pointing where you are actually going.
//
// Implementation notes that matter:
//   • ONE draw call. 1400 stars as camera-facing quads (2 tris each) with the
//     stretch done in the vertex shader — no per-frame geometry rebuilds, no
//     particle-count inflation. Streak WIDTH is computed in screen pixels so a
//     streak is a crisp 2-4px neon filament at any distance instead of an
//     aliased 1px GL line.
//   • Overdraw is the known killer here, so the quads are thin and the field
//     brightness is one uniform: at rest the mesh is invisible and skipped
//     entirely (zero cost when not boosting).
//   • The mesh's world matrix is written inside onBeforeRender from the RENDER
//     camera's matrix, which is the only place the interpolated/cinematic
//     camera transform is guaranteed final. Anchoring it in the update phase
//     lagged a frame — at 4800 u/s one frame is 80 world units of swim.
const _WSF_N = 1400;          // streaks — density target from the design brief
const _WSF_SPREAD = 430;      // field radius around the travel axis
const _WSF_RMIN = 16;         // hole at the vanishing point (nothing dead-centre)
const _WSF_DEPTH = 2900;      // how far ahead stars are seeded

const _wsf = {
    mesh: null, geo: null, mat: null, pos: null, posAttr: null,
    sx: null, sy: null, sz: null, sv: null,
    env: 0, kickT0: 0, kickMs: 1, kickAmp: 0, last: 0, roll: 0,
    frame: null, q: null, qRoll: null, m: null, dir: null,
    colA: null, colB: null
};

function _wsfSeed(i, spanZ) {
    const ang = Math.random() * Math.PI * 2;
    // sqrt() keeps the disc evenly covered instead of clumping at the axis
    const r = _WSF_RMIN + (_WSF_SPREAD - _WSF_RMIN) * Math.sqrt(Math.random());
    _wsf.sx[i] = Math.cos(ang) * r;
    _wsf.sy[i] = Math.sin(ang) * r;
    _wsf.sz[i] = spanZ ? -Math.random() * _WSF_DEPTH : -_WSF_DEPTH - Math.random() * 260;
    _wsf.sv[i] = 0.78 + Math.random() * 0.55;   // per-star flow rate
}

function _wsfBuild() {
    if (_wsf.mesh || typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    const N = _WSF_N;
    const pos = new Float32Array(N * 4 * 3);
    const aTail = new Float32Array(N * 4);
    const aSide = new Float32Array(N * 4);
    const aHue = new Float32Array(N * 4);
    const aLenJ = new Float32Array(N * 4);
    const aWid = new Float32Array(N * 4);
    const idx = new Uint16Array(N * 6);          // 5600 verts — Uint16 is safe

    _wsf.sx = new Float32Array(N); _wsf.sy = new Float32Array(N);
    _wsf.sz = new Float32Array(N); _wsf.sv = new Float32Array(N);

    for (let i = 0; i < N; i++) {
        _wsfSeed(i, true);
        const hue = Math.random();
        const lj = 0.55 + Math.random() * 0.95;
        const wj = 0.68 + Math.random() * 1.05;
        const v = i * 4;
        // 0,1 = head (tail=0) ; 2,3 = tail (tail=1) ; sides -1/+1
        aTail[v] = 0; aTail[v + 1] = 0; aTail[v + 2] = 1; aTail[v + 3] = 1;
        aSide[v] = -1; aSide[v + 1] = 1; aSide[v + 2] = 1; aSide[v + 3] = -1;
        for (let k = 0; k < 4; k++) { aHue[v + k] = hue; aLenJ[v + k] = lj; aWid[v + k] = wj; }
        const o = i * 6;
        idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
        idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aTail', new THREE.BufferAttribute(aTail, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
    geo.setAttribute('aHue', new THREE.BufferAttribute(aHue, 1));
    geo.setAttribute('aLenJ', new THREE.BufferAttribute(aLenJ, 1));
    geo.setAttribute('aWid', new THREE.BufferAttribute(aWid, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    // No bounding sphere maths — the mesh is never frustum culled.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uLen: { value: 0 },
            uWidth: { value: 2.4 },
            uRes: { value: new THREE.Vector2(1280, 720) },
            uOpacity: { value: 0 },
            uColA: { value: new THREE.Color(0x6be6ff) },
            uColB: { value: new THREE.Color(0xff5ccd) }
        },
        vertexShader: [
            'attribute float aTail;',
            'attribute float aSide;',
            'attribute float aHue;',
            'attribute float aLenJ;',
            'attribute float aWid;',
            'uniform float uLen;',
            'uniform float uWidth;',
            'uniform vec2 uRes;',
            'varying float vTail;',
            'varying float vSide;',
            'varying float vHue;',
            'varying float vFade;',
            'void main() {',
            '  vTail = aTail; vSide = aSide; vHue = aHue;',
            '  float L = uLen * aLenJ;',
            // Head = the star. Tail trails back toward -Z, which IS the travel
            // direction, so every streak points at the vanishing point.
            '  vec4 hC = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
            '  vec4 tC = projectionMatrix * modelViewMatrix * vec4(position - vec3(0.0, 0.0, L), 1.0);',
            '  if (hC.w <= 0.02) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }',
            '  vec4 clip = mix(hC, tC, aTail);',
            // Perpendicular in SCREEN pixels → constant apparent thickness.
            '  vec2 hs = (hC.xy / hC.w) * 0.5 * uRes;',
            '  vec2 ts = (tC.xy / max(0.02, tC.w)) * 0.5 * uRes;',
            '  vec2 d = hs - ts;',
            '  float dl = length(d);',
            '  vec2 nrm = (dl > 0.001) ? vec2(-d.y, d.x) / dl : vec2(1.0, 0.0);',
            // Streaks right ON the vanishing point barely move, so drawing them
            // at full strength piles a white blob over the crosshair. Fade by
            // the streak's own SCREEN length — the eye only reads speed from
            // the ones that actually travel.
            '  vFade = smoothstep(3.0, 34.0, dl);',
            '  clip.xy += (nrm * aSide * uWidth * aWid / uRes) * 2.0 * clip.w;',
            '  gl_Position = clip;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform vec3 uColA;',
            'uniform vec3 uColB;',
            'uniform float uOpacity;',
            'varying float vTail;',
            'varying float vSide;',
            'varying float vHue;',
            'varying float vFade;',
            'void main() {',
            '  float edge = 1.0 - abs(vSide);',
            '  edge = edge * edge * (3.0 - 2.0 * edge);',      // soft filament edges
            '  float head = pow(max(0.0, 1.0 - vTail), 1.7);', // hot head, dying tail
            '  vec3 c = mix(uColA, uColB, vHue);',
            '  c = mix(c, vec3(1.0), pow(max(0.0, 1.0 - vTail), 7.0) * 0.8);',
            '  float a = edge * head * vFade * uOpacity;',
            '  if (a < 0.004) discard;',
            '  gl_FragColor = vec4(c, a);',
            '}'
        ].join('\n'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 998;
    mesh.visible = false;
    // Never a target and never a raycast cost: any scene-wide picking pass
    // would otherwise walk 2800 throwaway triangles (and could "hit" them).
    mesh.raycast = function () {};
    mesh.userData.isWarpStreakFx = true;
    // Lock to the RENDER camera's final position, one instruction before draw.
    mesh.onBeforeRender = function (renderer, sc, cam) {
        if (!_wsf.frame) return;
        const e = _wsf.frame.elements, ce = cam.matrixWorld.elements;
        e[12] = ce[12]; e[13] = ce[13]; e[14] = ce[14];
        this.matrixWorld.copy(_wsf.frame);
        this.matrixWorldNeedsUpdate = false;
        try {
            const el = renderer.domElement;
            const w = el.clientWidth || el.width || 1280;
            const h = el.clientHeight || el.height || 720;
            mat.uniforms.uRes.value.set(w, h);
        } catch (err) {}
    };

    _wsf.pos = pos; _wsf.posAttr = geo.attributes.position;
    _wsf.geo = geo; _wsf.mat = mat; _wsf.mesh = mesh;
    _wsf.frame = new THREE.Matrix4();
    _wsf.q = new THREE.Quaternion();
    _wsf.qRoll = new THREE.Quaternion();
    _wsf.m = new THREE.Matrix4();
    _wsf.dir = new THREE.Vector3(0, 0, -1);
    scene.add(mesh);
}

// Public: fire the field. Called on whip release (and safe to call on any
// other boost). dir seeds the axis for frame 0; speed is units/SECOND.
function warpStreakBurst(dir, speed, colA, colB, strength) {
    try {
        _wsfBuild();
        if (!_wsf.mesh) return;
        _wsf.kickT0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        _wsf.kickMs = 1500;
        _wsf.kickAmp = Math.max(0.4, Math.min(1.35, strength || 1));
        if (colA !== undefined && colA !== null) _wsf.mat.uniforms.uColA.value.setHex(colA);
        if (colB !== undefined && colB !== null) _wsf.mat.uniforms.uColB.value.setHex(colB);
        if (dir && dir.lengthSq && dir.lengthSq() > 1e-6) _wsf.dir.copy(dir).normalize();
        // Re-seed across the whole depth so the field is FULL on frame one —
        // a field that fills in from the far plane reads as a fade, not a punch.
        for (let i = 0; i < _WSF_N; i++) _wsfSeed(i, true);
    } catch (e) {}
}

const _wsfUp = (typeof THREE !== 'undefined') ? new THREE.Vector3(0, 1, 0) : null;
const _wsfZero = (typeof THREE !== 'undefined') ? new THREE.Vector3(0, 0, 0) : null;
const _wsfAxisZ = (typeof THREE !== 'undefined') ? new THREE.Vector3(0, 0, 1) : null;
const _wsfTmpDir = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

function _updateWarpStreaks() {
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const dt = Math.max(0, Math.min(0.05, (now - (_wsf.last || now)) / 1000));
    _wsf.last = now;

    // Live speed in units/sec (velocityVector is per-60fps-frame).
    const spd = (gameState.velocityVector ? gameState.velocityVector.length() : 0) * 60;
    // Speed drives the field on its own, so emergency warp gets it too; the
    // release "kick" just guarantees the punch lands on the very first frame.
    let target = Math.max(0, Math.min(1, (spd - 260) / 2400));
    if (_wsf.kickAmp > 0) {
        const kt = (now - _wsf.kickT0) / _wsf.kickMs;
        if (kt >= 1) _wsf.kickAmp = 0;
        else target = Math.max(target, _wsf.kickAmp * Math.pow(1 - kt, 0.55));
    }
    if (target <= 0.001 && _wsf.env <= 0.004) {
        if (_wsf.mesh && _wsf.mesh.visible) _wsf.mesh.visible = false;
        _wsf.env = 0;
        return;
    }
    _wsfBuild();
    if (!_wsf.mesh) return;

    // Ramp in over ~250ms, decay with the boost over ~0.7s.
    const tau = (target > _wsf.env) ? 0.085 : 0.42;
    _wsf.env += (target - _wsf.env) * (1 - Math.exp(-dt / tau));
    const env = _wsf.env;
    if (env <= 0.004) { _wsf.mesh.visible = false; return; }
    _wsf.mesh.visible = true;

    // ── AXIS: the VELOCITY vector, not the look vector ──────────────────
    if (_wsfTmpDir) {
        if (spd > 1) _wsfTmpDir.copy(gameState.velocityVector).normalize();
        else camera.getWorldDirection(_wsfTmpDir);
        // Eased so a mid-boost turn sweeps the vanishing point instead of
        // snapping it.
        _wsf.dir.lerp(_wsfTmpDir, 1 - Math.exp(-dt / 0.06));
        if (_wsf.dir.lengthSq() < 1e-6) _wsf.dir.copy(_wsfTmpDir);
        _wsf.dir.normalize();
    }
    _wsf.roll += dt * 0.16;
    _wsf.m.lookAt(_wsfZero, _wsf.dir, _wsfUp);
    _wsf.q.setFromRotationMatrix(_wsf.m);
    _wsf.qRoll.setFromAxisAngle(_wsfAxisZ, _wsf.roll);
    _wsf.q.multiply(_wsf.qRoll);
    _wsf.frame.makeRotationFromQuaternion(_wsf.q);

    // ── FLOW + STRETCH ──────────────────────────────────────────────────
    const flow = Math.min(9500, Math.max(700, spd)) * (0.35 + 0.65 * env) * dt;
    const p = _wsf.pos, sx = _wsf.sx, sy = _wsf.sy, sz = _wsf.sz, sv = _wsf.sv;
    for (let i = 0; i < _WSF_N; i++) {
        let z = sz[i] + flow * sv[i];
        if (z > 90) { _wsfSeed(i, false); z = sz[i]; }
        else sz[i] = z;
        const x = sx[i], y = sy[i];
        const b = i * 12;
        p[b] = x; p[b + 1] = y; p[b + 2] = z;
        p[b + 3] = x; p[b + 4] = y; p[b + 5] = z;
        p[b + 6] = x; p[b + 7] = y; p[b + 8] = z;
        p[b + 9] = x; p[b + 10] = y; p[b + 11] = z;
    }
    _wsf.posAttr.needsUpdate = true;

    const u = _wsf.mat.uniforms;
    u.uLen.value = Math.max(28, Math.min(760, spd * 0.055)) * (0.45 + 0.55 * env);
    u.uWidth.value = 1.5 + 1.9 * env;
    u.uOpacity.value = 0.95 * env;
}

// ── 14. WARP DEBRIS FIELD — the world you actually fly THROUGH ──────────────
// The streak field above is CAMERA-ANCHORED: it rides with you, so it sells
// "fast" but never sells "moving". Playtest verdict on the boost was brutal
// and correct — over 3,400 world units of travel the backdrop was pixel-
// identical frame to frame, so the fastest moment in the game generated LESS
// on-screen motion than sitting still. Streaks stapled over a photograph.
//
// This is the other half: a field of real objects at real WORLD coordinates
// that the camera genuinely flies through. Every mote is nailed to a fixed
// point in space the instant it spawns and never moves again — all apparent
// motion is the camera closing on it. That buys the three things a decal can
// never fake:
//   • true perspective growth (a chunk doubles in size as you halve the range)
//   • true streaming — motes sweep OUT past the frame edges, they don't fade
//   • true depth ordering: a planet in front of a mote occludes it (depthTest)
//
// THREE DEPTH LAYERS, ONE DRAW CALL. The layering is the whole point: without
// a slow far layer to measure the fast near layer against, parallax has no
// reference and the field reads as noise.
//   L0  150–2,500u    ice chips / dust motes — whip past in a fifth of a second
//   L1  2,500–13,000u  tumbling debris chunks — grow visibly across a whip
//   L2  5,500–22,000u  drifting neon dust banks — the parallax yardstick
//
// Per-mote motion blur is computed in the vertex shader by re-projecting the
// mote one blur-step back along the camera's own velocity, so each streak
// points radially away from the true vanishing point of TRAVEL for free — no
// axis uniform, no special case when you look sideways out of the turn.
//
// Cost control (additive overdraw is the killer here):
//   • zero draw calls below ~500 u/s — the mesh is invisible and skipped
//   • geometry is only re-uploaded on frames where a mote actually recycled
//   • long streaks dim in proportion to their length (same energy, more pixels)
//   • the 28 big haze sprites carry ~0.24 alpha; they are backdrop, not bloom
//   • ~1.5k triangles total, index buffer stays Uint16, no per-frame allocation
const _WDF_LAYERS = [
    // z0/z1 = seed depth ahead of the camera. spread = lateral cone slope
    // (< tan(halfFov) so a mote seeds INSIDE the frame and sweeps outward).
    { n: 520, z0: 150,  z1: 2500,  s0: 3.0,  s1: 13.0, spread: 0.62, blur: 1.0, alpha: 1.00, soft: 0.0 },
    { n: 200, z0: 2500, z1: 13000, s0: 30,   s1: 170,  spread: 0.55, blur: 0.5, alpha: 0.95, soft: 0.35 },
    { n: 28,  z0: 5500, z1: 22000, s0: 900,  s1: 3400, spread: 0.50, blur: 0.0, alpha: 0.24, soft: 1.0 }
];
const _WDF_N = _WDF_LAYERS.reduce((a, l) => a + l.n, 0);

const _wdf = {
    mesh: null, geo: null, mat: null, pos: null, posAttr: null,
    layer: null, p: null, dirty: false,
    env: 0, last: 0, kickT0: 0, kickMs: 1, kickAmp: 0, seeded: false,
    ax: null, bu: null, bv: null, camL: null, tmp: null,
    blurWorld: null, invQ: null
};

function _wdfBasis() {
    const a = _wdf.ax, u = _wdf.bu, v = _wdf.bv;
    if (Math.abs(a.y) < 0.9) u.set(0, 1, 0); else u.set(1, 0, 0);
    v.crossVectors(a, u).normalize();
    u.crossVectors(v, a).normalize();
}

// Place mote i at a fresh WORLD point ahead of the camera. spanAll seeds it
// anywhere in its layer's depth band (used to fill the field on frame one);
// otherwise it lands near the far edge, which is where recycled motes belong.
function _wdfSeed(i, spanAll) {
    const L = _WDF_LAYERS[_wdf.layer[i]];
    const z = spanAll
        ? (L.z0 + Math.random() * (L.z1 - L.z0))
        : (L.z1 - Math.random() * (L.z1 - L.z0) * 0.30);
    const ang = Math.random() * Math.PI * 2;
    // Minimum lateral offset keeps anything from passing through the lens.
    const r = (L.z0 * 0.35 + 55) + Math.sqrt(Math.random()) * (z * L.spread);
    const cs = Math.cos(ang) * r, sn = Math.sin(ang) * r;
    const c = _wdf.camL, a = _wdf.ax, u = _wdf.bu, v = _wdf.bv;
    const x = c.x + a.x * z + u.x * cs + v.x * sn;
    const y = c.y + a.y * z + u.y * cs + v.y * sn;
    const zz = c.z + a.z * z + u.z * cs + v.z * sn;
    const b = i * 3;
    _wdf.p[b] = x; _wdf.p[b + 1] = y; _wdf.p[b + 2] = zz;
    const q = i * 12;
    const P = _wdf.pos;
    P[q] = x;     P[q + 1] = y;  P[q + 2] = zz;
    P[q + 3] = x; P[q + 4] = y;  P[q + 5] = zz;
    P[q + 6] = x; P[q + 7] = y;  P[q + 8] = zz;
    P[q + 9] = x; P[q + 10] = y; P[q + 11] = zz;
    _wdf.dirty = true;
}

function _wdfBuild() {
    if (_wdf.mesh || typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    const N = _WDF_N;
    const pos = new Float32Array(N * 4 * 3);
    const aCorner = new Float32Array(N * 4 * 2);
    const aSize = new Float32Array(N * 4);
    const aHue = new Float32Array(N * 4);
    const aAlpha = new Float32Array(N * 4);
    const aBlur = new Float32Array(N * 4);
    const aSoft = new Float32Array(N * 4);
    const idx = new Uint16Array(N * 6);           // 2144 verts — Uint16 safe

    _wdf.p = new Float32Array(N * 3);
    _wdf.layer = new Uint8Array(N);
    _wdf.pos = pos;

    const CX = [-1, 1, 1, -1], CY = [-1, -1, 1, 1];
    let i = 0;
    for (let li = 0; li < _WDF_LAYERS.length; li++) {
        const L = _WDF_LAYERS[li];
        for (let k = 0; k < L.n; k++, i++) {
            _wdf.layer[i] = li;
            const sz = L.s0 + Math.random() * (L.s1 - L.s0);
            const hue = Math.random();
            const v = i * 4;
            for (let c = 0; c < 4; c++) {
                aCorner[(v + c) * 2] = CX[c];
                aCorner[(v + c) * 2 + 1] = CY[c];
                aSize[v + c] = sz;
                aHue[v + c] = hue;
                aAlpha[v + c] = L.alpha;
                aBlur[v + c] = L.blur;
                aSoft[v + c] = L.soft;
            }
            const o = i * 6;
            idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
            idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(aCorner, 2));
    geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
    geo.setAttribute('aHue', new THREE.BufferAttribute(aHue, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));
    geo.setAttribute('aBlur', new THREE.BufferAttribute(aBlur, 1));
    geo.setAttribute('aSoft', new THREE.BufferAttribute(aSoft, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uRes: { value: new THREE.Vector2(1280, 720) },
            uVelView: { value: new THREE.Vector3() },
            uMinPx: { value: 1.6 },
            uStretchMax: { value: 6.0 },
            uOpacity: { value: 0 },
            uColA: { value: new THREE.Color(0x8ff0ff) },
            uColB: { value: new THREE.Color(0xff77d9) },
            uColHaze: { value: new THREE.Color(0xd15cff) }
        },
        vertexShader: [
            'attribute vec2 aCorner;',
            'attribute float aSize;',
            'attribute float aHue;',
            'attribute float aAlpha;',
            'attribute float aBlur;',
            'attribute float aSoft;',
            'uniform vec2 uRes;',
            'uniform vec3 uVelView;',
            'uniform float uMinPx;',
            'uniform float uStretchMax;',
            'varying vec2 vC;',
            'varying float vHue;',
            'varying float vA;',
            'varying float vSoft;',
            'varying float vE;',
            'void main() {',
            '  vC = aCorner; vHue = aHue; vSoft = aSoft;',
            '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
            '  vec4 clip = projectionMatrix * mv;',
            '  if (clip.w <= 0.05) { vA = 0.0; vE = 1.0; gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }',
            '  float dist = max(1.0, -mv.z);',
            // Radius in PIXELS: real perspective growth, with a floor so the
            // far end of a layer stays a faint speck instead of aliasing away.
            '  float pxPerWorld = 0.5 * uRes.y * projectionMatrix[1][1] / dist;',
            '  float rpx = max(aSize * pxPerWorld, uMinPx);',
            // Re-project one blur-step back along the CAMERA's velocity. The
            // screen delta is this mote's true motion vector, which already
            // points away from the vanishing point of travel.
            '  vec4 clip2 = projectionMatrix * vec4(mv.xyz - uVelView * aBlur, 1.0);',
            '  vec2 s0 = (clip.xy / clip.w) * 0.5 * uRes;',
            '  vec2 s1 = (clip2.xy / max(0.05, clip2.w)) * 0.5 * uRes;',
            '  vec2 mvec = s1 - s0;',
            '  float ml = length(mvec);',
            '  vec2 along = (ml > 0.001) ? mvec / ml : vec2(1.0, 0.0);',
            '  vec2 across = vec2(-along.y, along.x);',
            '  float hlen = rpx + min(ml * 0.5, rpx * uStretchMax);',
            '  vE = hlen / max(0.0001, rpx);',
            // Near fade: a chip passing through the lens must not detonate the
            // frame. Soft layers (dust banks) opt out — they are never close.
            '  vA = aAlpha * smoothstep(55.0, 300.0, dist * (1.0 + aSoft * 400.0));',
            // A long streak spreads the same light over more pixels.
            '  vA *= mix(1.0, 0.72, clamp((vE - 1.0) / 8.0, 0.0, 1.0));',
            // Motes sitting ON the vanishing point barely move, so at full
            // brightness they pile into a white blob over the crosshair. Dim
            // by screen travel — the eye reads speed off the ones that MOVE.
            '  vA *= mix(mix(0.32, 1.0, smoothstep(1.0, 20.0, ml)), 1.0, aSoft);',
            '  clip.xy += ((along * (aCorner.x * hlen) + across * (aCorner.y * rpx)) / uRes) * 2.0 * clip.w;',
            '  gl_Position = clip;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform vec3 uColA;',
            'uniform vec3 uColB;',
            'uniform vec3 uColHaze;',
            'uniform float uOpacity;',
            'varying vec2 vC;',
            'varying float vHue;',
            'varying float vA;',
            'varying float vSoft;',
            'varying float vE;',
            'void main() {',
            // Capsule: a disc of radius 1 swept along the stretch axis.
            '  float L = max(0.0, vE - 1.0);',
            '  vec2 p = vec2(abs(vC.x) * vE, vC.y);',
            '  p.x = max(0.0, p.x - L);',
            '  float d = length(p);',
            '  if (d > 1.0) discard;',
            '  float core = pow(max(0.0, 1.0 - d), 5.0);',
            '  float body = 1.0 - smoothstep(0.18, 1.0, d);',
            '  float cloud = pow(max(0.0, 1.0 - d), 2.3);',
            '  float shape = mix(body + core * 0.9, cloud, vSoft);',
            '  vec3 c = mix(uColA, uColB, vHue);',
            '  c = mix(c, uColHaze, vSoft * 0.75);',
            '  c = mix(c, vec3(1.0), core * (1.0 - vSoft) * 0.9);',
            '  float a = shape * vA * uOpacity;',
            '  if (a < 0.004) discard;',
            '  gl_FragColor = vec4(c, a);',
            '}'
        ].join('\n'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,          // a planet in front of a mote HIDES it
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;         // over the skyboxes, under the ship/HUD
    mesh.visible = false;
    mesh.raycast = function () {};
    mesh.userData.isWarpDebrisFx = true;
    // Resolution + the blur vector have to come off the RENDER camera: the
    // fixed-step interpolation means the update-phase transform is a frame
    // stale, and at 6,000 u/s a stale frame is 100 units of smear error.
    mesh.onBeforeRender = function (renderer, sc, cam) {
        try {
            const el = renderer.domElement;
            mat.uniforms.uRes.value.set(el.clientWidth || el.width || 1280,
                                        el.clientHeight || el.height || 720);
            _wdf.invQ.copy(cam.quaternion).conjugate();
            mat.uniforms.uVelView.value.copy(_wdf.blurWorld).applyQuaternion(_wdf.invQ);
        } catch (err) {}
    };

    _wdf.posAttr = geo.attributes.position;
    _wdf.geo = geo; _wdf.mat = mat; _wdf.mesh = mesh;
    _wdf.ax = new THREE.Vector3(0, 0, -1);
    _wdf.bu = new THREE.Vector3(0, 1, 0);
    _wdf.bv = new THREE.Vector3(1, 0, 0);
    _wdf.camL = new THREE.Vector3();
    _wdf.tmp = new THREE.Vector3();
    _wdf.blurWorld = new THREE.Vector3();
    _wdf.invQ = new THREE.Quaternion();
    scene.add(mesh);
}

// Fill the whole field ahead of the camera in one go.
function _wdfReseedAll() {
    if (!_wdf.mesh) return;
    // camL is the camera expressed in the mesh's frame. The mesh is a scene
    // ROOT, so the floating-origin rebase slides mesh.position for us and the
    // baked world coordinates stay valid — we just have to subtract it here.
    _wdf.camL.copy(camera.position).sub(_wdf.mesh.position);
    _wdfBasis();
    for (let i = 0; i < _WDF_N; i++) _wdfSeed(i, true);
    _wdf.seeded = true;
}

// Public: fire the field. dir = travel direction, speed = units/SECOND.
function warpDebrisBurst(dir, speed, colA, colB, strength) {
    try {
        _wdfBuild();
        if (!_wdf.mesh) return;
        _wdf.kickT0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        _wdf.kickMs = 1800;
        _wdf.kickAmp = Math.max(0.4, Math.min(1.3, strength || 1));
        if (colA !== undefined && colA !== null) _wdf.mat.uniforms.uColA.value.setHex(colA);
        if (colB !== undefined && colB !== null) _wdf.mat.uniforms.uColB.value.setHex(colB);
        if (dir && dir.lengthSq && dir.lengthSq() > 1e-6) _wdf.ax.copy(dir).normalize();
        _wdfReseedAll();
        // The backdrop parallax rides the same trigger — see below.
        _wbpArm(_wdf.ax);
    } catch (e) {}
}

function _updateWarpDebris() {
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const dt = Math.max(0, Math.min(0.05, (now - (_wdf.last || now)) / 1000));
    _wdf.last = now;

    const spd = (gameState.velocityVector ? gameState.velocityVector.length() : 0) * 60;
    // Slightly higher gate than the streak field: debris is a BOOST event, not
    // a thrust event, and it must cost exactly nothing while you are cruising.
    let target = Math.max(0, Math.min(1, (spd - 500) / 2600));
    if (_wdf.kickAmp > 0) {
        const kt = (now - _wdf.kickT0) / _wdf.kickMs;
        if (kt >= 1) _wdf.kickAmp = 0;
        else target = Math.max(target, _wdf.kickAmp * Math.pow(1 - kt, 0.6));
    }
    if (target <= 0.001 && _wdf.env <= 0.004) {
        if (_wdf.mesh && _wdf.mesh.visible) _wdf.mesh.visible = false;
        _wdf.env = 0;
        _wdf.seeded = false;
        return;
    }
    _wdfBuild();
    if (!_wdf.mesh) return;

    const tau = (target > _wdf.env) ? 0.07 : 0.5;
    _wdf.env += (target - _wdf.env) * (1 - Math.exp(-dt / tau));
    if (_wdf.env <= 0.004) { _wdf.mesh.visible = false; _wdf.seeded = false; return; }
    _wdf.mesh.visible = true;

    // Travel axis, eased so a mid-boost turn sweeps the seeding cone rather
    // than teleporting it.
    if (spd > 1) {
        _wdf.tmp.copy(gameState.velocityVector).normalize();
    } else {
        camera.getWorldDirection(_wdf.tmp);
    }
    _wdf.ax.lerp(_wdf.tmp, 1 - Math.exp(-dt / 0.09));
    if (_wdf.ax.lengthSq() < 1e-6) _wdf.ax.copy(_wdf.tmp);
    _wdf.ax.normalize();
    _wdfBasis();

    _wdf.camL.copy(camera.position).sub(_wdf.mesh.position);
    if (!_wdf.seeded) { _wdfReseedAll(); }

    // Per-mote motion-blur reference: ~0.8 of a 60fps step of camera travel.
    _wdf.blurWorld.copy(gameState.velocityVector || _wdf.tmp).multiplyScalar(0.8);

    // ── RECYCLE ────────────────────────────────────────────────────────────
    // Motes never move. The only per-frame work is asking which ones the
    // camera has already passed (or turned away from) and re-nailing those to
    // a fresh point ahead. Geometry uploads only on frames that recycled.
    _wdf.dirty = false;
    const p = _wdf.p, cx = _wdf.camL.x, cy = _wdf.camL.y, cz = _wdf.camL.z;
    const ax = _wdf.ax.x, ay = _wdf.ax.y, az = _wdf.ax.z;
    for (let i = 0; i < _WDF_N; i++) {
        const L = _WDF_LAYERS[_wdf.layer[i]];
        const b = i * 3;
        const dx = p[b] - cx, dy = p[b + 1] - cy, dz = p[b + 2] - cz;
        const axial = dx * ax + dy * ay + dz * az;
        if (axial < -260) { _wdfSeed(i, false); continue; }          // passed it
        if (axial > L.z1 * 1.8) { _wdfSeed(i, false); continue; }    // rebase / warp jump
        // Turned hard mid-boost: anything now far outside the travel cone is
        // dead weight, so recycle it into the new heading instead of waiting
        // for it to drift behind.
        const latSq = (dx * dx + dy * dy + dz * dz) - axial * axial;
        const lim = axial * 2.8 + 900;
        if (latSq > lim * lim) _wdfSeed(i, false);
    }
    if (_wdf.dirty) _wdf.posAttr.needsUpdate = true;

    const u = _wdf.mat.uniforms;
    u.uOpacity.value = 1.0 * _wdf.env;
    u.uStretchMax.value = 3.0 + 5.0 * _wdf.env;
}

// ── 15. BACKDROP PARALLAX UNLOCK ────────────────────────────────────────────
// The skydomes sit at radius 150k–195k. Honest geometry says 4,000 units of
// whip rotates them by about one degree, which is why the pink nebula bloom
// was pixel-identical across the entire boost. So during a boost — and ONLY
// during a boost — the domes are pushed backwards along the travel vector by
// a multiple of the distance actually covered. It is a cheat, but it is the
// cheat that makes a whip feel like it crossed something.
//
// Rebase-safe: we never cache an absolute base position (applyWorldShift would
// invalidate it). We remember only the offset WE applied and undo exactly that
// before applying the next one.
const _wbp = {
    objs: null, off: 0, target: 0, dir: null, cum: 0, active: false, last: 0
};

function _wbpArm(dir) {
    if (!_wbp.dir) _wbp.dir = new THREE.Vector3();
    if (dir) _wbp.dir.copy(dir).normalize();
    _wbp.cum = 0;
    _wbp.active = true;
}

function _wbpCollect() {
    // Not cached until at least one dome exists — the skydomes are built
    // asynchronously, and caching an empty list would disable this forever.
    if (_wbp.objs && _wbp.objs.length) return _wbp.objs;
    const out = [];
    const push = (o, k) => {
        if (!o || !o.isObject3D || !o.geometry) return;
        const r = (o.geometry.parameters && o.geometry.parameters.radius) || 150000;
        out.push({ o: o, r: r, k: k, applied: 0 });
    };
    push(window.nebulaSkybox, 1.0);
    push(window.cosmicSkybox, 0.72);
    push(window.hubbleSkybox2, 0.85);
    if (out.length) _wbp.objs = out;
    return out;
}

function _updateBackdropParallax() {
    if (typeof window === 'undefined' || typeof camera === 'undefined') return;
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const dt = Math.max(0, Math.min(0.05, (now - (_wbp.last || now)) / 1000));
    _wbp.last = now;
    const objs = _wbpCollect();
    if (!objs.length) return;

    if (!_wbp.dir) _wbp.dir = new THREE.Vector3(0, 0, -1);
    const spd = (gameState.velocityVector ? gameState.velocityVector.length() : 0) * 60;
    if (_wbp.active && spd < 420) _wbp.active = false;
    if (_wbp.active) {
        if (spd > 1 && _wbp.dir.lengthSq() < 1e-6) {
            _wbp.dir.copy(gameState.velocityVector).normalize();
        }
        _wbp.cum += spd * dt;
        // 7x amplification: the 3,400u the critic measured becomes ~24,000u of
        // dome travel — roughly 7 degrees of sweep, unmissable but not a spin.
        _wbp.target = Math.min(_wbp.cum * 7, 34000);
    } else {
        _wbp.target = 0;
    }
    // Snappy on the way out, slow and sub-perceptual on the way back.
    const tau = _wbp.active ? 0.14 : 3.2;
    _wbp.off += (_wbp.target - _wbp.off) * (1 - Math.exp(-dt / tau));
    if (_wbp.off < 1 && _wbp.target === 0) _wbp.off = 0;
    if (_wbp.dir.lengthSq() < 1e-6) return;

    for (let i = 0; i < objs.length; i++) {
        const e = objs[i];
        // Never push a dome so far that the camera can end up outside it. Room
        // is measured from the dome's UNOFFSET centre so the clamp can't chase
        // its own tail.
        _wbpTmp.copy(e.o.position).addScaledVector(_wbp.dir, -e.applied);
        const room = Math.max(0, e.r * 0.9 - camera.position.distanceTo(_wbpTmp));
        const want = -Math.min(_wbp.off * e.k, room * 0.5);
        if (want === e.applied) continue;
        e.o.position.addScaledVector(_wbp.dir, want - e.applied);
        e.applied = want;
    }
}
const _wbpTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

// Screen-space speed spokes are anchored on the VANISHING POINT of travel,
// not the middle of the screen — cheap (one composited transform) and it is
// what makes the DOM layer agree with the 3D streaks when the ship is not
// pointed exactly along its velocity.
function _wsfVanishingShift(outArr) {
    outArr[0] = 0; outArr[1] = 0;
    try {
        if (!_wsfTmpDir || !gameState.velocityVector) return;
        const spd = gameState.velocityVector.length();
        if (spd < 0.05) return;
        _wsfTmpDir.copy(gameState.velocityVector).multiplyScalar(1200 / spd)
            .add(camera.position).project(camera);
        if (_wsfTmpDir.z > 1) return;                       // behind the camera
        const fx = _wsfTmpDir.x * 0.5 + 0.5, fy = 0.5 - _wsfTmpDir.y * 0.5;
        outArr[0] = Math.max(-30, Math.min(30, (fx - 0.5) / 1.24 * 100));
        outArr[1] = Math.max(-30, Math.min(30, (fy - 0.5) / 1.24 * 100));
    } catch (e) {}
}
const _wsfShift = [0, 0];

// ── 20. WARP TUNNEL — the moment emergency warp never had ───────────────────
// O-warp and black-hole transit both moved the player at 6,000+ u/s while the
// screen showed… a white DOM fade. No tunnel, no threshold, no sense of having
// gone THROUGH anything. This is the missing beat, and it deliberately does
// NOT replace the slingshot streak field — the streaks (§19) and debris (§14)
// still run underneath and are what sell raw velocity. The tunnel is the thing
// they were missing: a WALL, an enclosure, something you are inside of.
//
// Two nested open cylinders anchored to the render camera and aimed down the
// travel axis:
//   outer — wide, sparse, slow: the far wall of the shaft
//   inner — tight, dense, fast: filaments ripping past your canopy
// Both are one draw call each, procedurally striped in the fragment shader
// (no textures, no particles), rendered BackSide so only the far wall of each
// tube is filled — one layer of overdraw per cylinder, not two — and
// depth-tested so the ship stays crisply INSIDE the tunnel instead of being
// painted over by it. Total cost: 2 draw calls, ~150 triangles.
//
// Entry and exit are detected here from live warp state, so every warp source
// (O-key, jump, black-hole transit) gets the full beat — FOV snap through
// camera-system's warpFovPulse, chromatic rim pulse, deepened vignette —
// without any caller having to remember to ask for it.
const _WTU_LEN = 3600;
const _wtu = {
    inner: null, outer: null, level: 0, was: false, roll: 0, last: 0,
    forceUntil: 0, forceAmp: 0, frame: null, q: null, qRoll: null,
    m: null, dir: null, tmp: null, bh: false
};

function _wtuMakeShell(radius, streaks, scroll, seg, colA, colB) {
    const geo = new THREE.CylinderGeometry(radius, radius, _WTU_LEN, seg, 1, true);
    geo.rotateX(Math.PI / 2);                 // axis along -Z = travel
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0 },
            uStreaks: { value: streaks },
            uScroll: { value: scroll },
            uColA: { value: new THREE.Color(colA) },
            uColB: { value: new THREE.Color(colB) }
        },
        vertexShader: [
            'varying vec2 vUv;',
            'void main() {',
            '  vUv = uv;',
            '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform float uTime;',
            'uniform float uOpacity;',
            'uniform float uStreaks;',
            'uniform float uScroll;',
            'uniform vec3 uColA;',
            'uniform vec3 uColB;',
            'varying vec2 vUv;',
            'float h(float n) { return fract(sin(n * 12.9898) * 43758.5453); }',
            'void main() {',
            // Lanes AROUND the tube — each one an independent filament with
            // its own width, colour mix and flow rate.
            '  float x = vUv.x * uStreaks;',
            '  float id = floor(x);',
            '  float f = fract(x) - 0.5;',
            '  float r = h(id);',
            '  float r2 = h(id + 31.7);',
            '  float w = 0.07 + 0.26 * r;',
            '  float across = smoothstep(w, 0.0, abs(f));',
            '  if (across < 0.01) discard;',
            // …and a bright pulse travelling ALONG it. This is the motion the
            // eye actually reads as "I am moving through a shaft".
            '  float y = vUv.y * (2.0 + 5.0 * r2) - uTime * uScroll * (0.7 + 1.1 * r);',
            '  float along = pow(fract(y), 4.0) * 0.85 + 0.15;',
            // Fade both mouths of the tube so it never shows a hard rim, and
            // hot-white the far end into a vanishing point.
            '  float e = abs(vUv.y - 0.5) * 2.0;',
            '  float ends = 1.0 - smoothstep(0.30, 1.0, e);',
            '  vec3 c = mix(uColA, uColB, r2);',
            '  c = mix(c, vec3(1.0), smoothstep(0.45, 0.95, e) * 0.65);',
            '  float a = across * along * ends * uOpacity;',
            '  if (a < 0.004) discard;',
            '  gl_FragColor = vec4(c, a);',
            '}'
        ].join('\n'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 990;
    mesh.visible = false;
    mesh.raycast = function () {};
    mesh.userData.isWarpTunnelFx = true;
    // Same lock as the streak field: the RENDER camera's final transform is
    // only guaranteed here, and at 6,000 u/s a one-frame lag is 100 units of
    // visible swim in the tunnel walls.
    mesh.onBeforeRender = function (renderer, sc, cam) {
        if (!_wtu.frame) return;
        const e = _wtu.frame.elements, ce = cam.matrixWorld.elements;
        e[12] = ce[12]; e[13] = ce[13]; e[14] = ce[14];
        this.matrixWorld.copy(_wtu.frame);
        this.matrixWorldNeedsUpdate = false;
    };
    scene.add(mesh);
    return { mesh: mesh, geo: geo, mat: mat };
}

function _wtuBuild() {
    if (_wtu.inner || typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    _wtu.outer = _wtuMakeShell(340, 26, 0.55, 40, 0x2a6bff, 0xff3fb0);
    _wtu.inner = _wtuMakeShell(140, 54, 1.35, 32, 0x6be6ff, 0xff5ccd);
    _wtu.frame = new THREE.Matrix4();
    _wtu.q = new THREE.Quaternion();
    _wtu.qRoll = new THREE.Quaternion();
    _wtu.m = new THREE.Matrix4();
    _wtu.dir = new THREE.Vector3(0, 0, -1);
    _wtu.tmp = new THREE.Vector3();
}

function _wtuPalette(bh) {
    if (!_wtu.inner) return;
    // Black-hole transit goes violet/cyan; ordinary warp keeps the game's
    // cyan/magenta synthwave pair.
    _wtu.outer.mat.uniforms.uColA.value.setHex(bh ? 0x7b2bff : 0x2a6bff);
    _wtu.outer.mat.uniforms.uColB.value.setHex(bh ? 0x35e6ff : 0xff3fb0);
    _wtu.inner.mat.uniforms.uColA.value.setHex(bh ? 0xc9a4ff : 0x6be6ff);
    _wtu.inner.mat.uniforms.uColB.value.setHex(bh ? 0x35e6ff : 0xff5ccd);
}

// Public: force the tunnel on for a window, e.g. the instant a warp fires,
// before velocity has actually ramped. strength 0..1.
function warpTunnelBurst(strength, durMs, blackHole) {
    try {
        _wtu.forceAmp = Math.max(0.2, Math.min(1, strength === undefined ? 1 : strength));
        _wtu.forceUntil = Date.now() + Math.max(200, durMs || 1200);
        if (blackHole !== undefined) _wtu.bh = !!blackHole;
    } catch (e) {}
}

function _wtuThreshold(entering, bh) {
    // The tunnel's own punctuation: lens snap + chromatic rim rip. Entry
    // tightens then blows open; exit is a single relieving flare.
    try {
        if (typeof window.warpFovPulse === 'function') {
            window.warpFovPulse(entering ? 15 : -11, entering ? 950 : 700);
        }
        if (typeof whipScreenPulse === 'function') {
            whipScreenPulse(bh ? 0xb26bff : 0x6be6ff, entering ? 0.85 : 0.6);
        }
        if (typeof whipScreenShake === 'function') {
            whipScreenShake(entering ? 8 : 5, entering ? 520 : 380);
        }
    } catch (e) {}
}

function _updateWarpTunnel() {
    const gs = (typeof gameState !== 'undefined') ? gameState : null;
    if (!gs) return;
    const now = Date.now();
    const dt = Math.max(0, Math.min(0.05, (now - (_wtu.last || now)) / 1000));
    _wtu.last = now;

    // ── WHO WANTS A TUNNEL ───────────────────────────────────────────────
    let target = 0, bh = false;
    const ew = gs.emergencyWarp;
    if (ew && ew.active) target = ew.isJump ? 0.5 : 1;
    if (gs.isBlackHoleWarping || gs.warping) { target = 1; bh = true; }
    if (_wtu.forceUntil > now) {
        target = Math.max(target, _wtu.forceAmp);
        bh = bh || _wtu.bh;
    }

    // Threshold beats on the way in and on the way out.
    const on = target > 0.35;
    if (on !== _wtu.was) {
        _wtu.was = on;
        _wtu.bh = bh;
        _wtuThreshold(on, bh);
    }

    // Ease: fast in (~0.18s) so entry is a THRESHOLD, slower out (~0.55s) so
    // exit is a release rather than a cut.
    const tau = (target > _wtu.level) ? 0.18 : 0.55;
    _wtu.level += (target - _wtu.level) * (1 - Math.exp(-dt / tau));
    if (typeof window !== 'undefined') {
        window.__warpTunnelLevel = _wtu.level > 0.01 ? _wtu.level : 0;
    }
    if (_wtu.level <= 0.012) {
        if (_wtu.inner) { _wtu.inner.mesh.visible = false; _wtu.outer.mesh.visible = false; }
        _wtu.level = 0;
        return;
    }
    _wtuBuild();
    if (!_wtu.inner) return;
    if (!_wtu.inner.mesh.visible) _wtuPalette(_wtu.bh);
    _wtu.inner.mesh.visible = true;
    _wtu.outer.mesh.visible = true;

    // ── AXIS: travel direction, eased, exactly like the streak field ─────
    if (_wtu.tmp) {
        const spd = gs.velocityVector ? gs.velocityVector.length() : 0;
        if (spd > 0.02) _wtu.tmp.copy(gs.velocityVector).normalize();
        else camera.getWorldDirection(_wtu.tmp);
        _wtu.dir.lerp(_wtu.tmp, 1 - Math.exp(-dt / 0.09));
        if (_wtu.dir.lengthSq() < 1e-6) _wtu.dir.copy(_wtu.tmp);
        _wtu.dir.normalize();
    }
    _wtu.roll += dt * (0.22 + 0.5 * _wtu.level);
    _wtu.m.lookAt(_wsfZero, _wtu.dir, _wsfUp);
    _wtu.q.setFromRotationMatrix(_wtu.m);
    _wtu.qRoll.setFromAxisAngle(_wsfAxisZ, _wtu.roll);
    _wtu.q.multiply(_wtu.qRoll);
    _wtu.frame.makeRotationFromQuaternion(_wtu.q);

    const t = now * 0.001;
    const L = _wtu.level;
    _wtu.outer.mat.uniforms.uTime.value = t;
    _wtu.inner.mat.uniforms.uTime.value = t;
    // Outer wall stays subtle (it is the biggest area on screen — that is
    // where overdraw brightness turns into mud); the inner shell carries the
    // punch. Both ramp super-linearly so a half-strength jump reads clearly
    // weaker than a full warp.
    _wtu.outer.mat.uniforms.uOpacity.value = 0.34 * L * L;
    _wtu.inner.mat.uniforms.uOpacity.value = 0.80 * L * L;
}

// ── 21. ENGINE NOZZLE BLOOM — the orange box, and what replaces it ──────────
// THE BUG, precisely: game-models.js `_createEngineBloomSprite()` builds a
// THREE.SpriteMaterial with a color, additive blending and NO `map`. A sprite
// material with no map is not "invisible until textured" — three.js samples
// nothing and shades the entire quad at the flat material color, so what got
// drawn was a hard-edged 8.6-unit orange RECTANGLE (0.18 local × the ship's
// 48x scale) welded to the hull, dead centre of frame, in every high-speed
// frame of the signature move. The whip's whole payoff is the ship visibly
// charging as gravity winds it up; instead the hull was behind a box.
//
// The fix is one property — `map` — but it has to be the right texture, and
// the file that builds the sprite is not ours. Both sprites are tagged
// `userData.isVelocityBloom`, so we adopt them from here: give them a real
// radial alpha falloff and let game-models keep driving their colour and
// scale (it already lerps 0x552200 → 0xffaa33 on speed, which is exactly
// right once there is an alpha ramp for it to live in). No ownership fight,
// no rAF ordering race — we set `map` once, it drives intensity forever.
//
// Then we add what the box was standing in for, on sprites game-models does
// NOT touch (untagged, so its once-only traverse skips them):
//   • a wide CORONA per nozzle that keeps building past the point where
//     game-models' 6.8-unit reference speed saturates, so a 115-unit whip
//     boost visibly out-burns a 7-unit cruise instead of looking identical
//   • a screen-horizontal ANAMORPHIC STREAK that only lights at real speed —
//     the synthwave lens signature, free (2 quads) because it is a texture
//     and not a particle system
// Both ride the SAME published curves the physics is flying: __whipFrame.carve
// while the arc bites, __whipLaunch.e through the 260ms crack. The glow and
// the acceleration are one event, not two effects that overlap.

// Tight hot core — steep falloff so the adopted sprite reads as a nozzle,
// not a fog bank, at its full 8.6-unit scale.
function _vfNozzleTexture() {
    if (_vfNozzleTexture._tex) return _vfNozzleTexture._tex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0.00, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.30, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.58, 'rgba(255,255,255,0.11)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    _vfNozzleTexture._tex = t;
    return t;
}

// Wide soft corona — the volume around the nozzle.
function _vfCoronaTexture() {
    if (_vfCoronaTexture._tex) return _vfCoronaTexture._tex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0.00, 'rgba(255,255,255,0.62)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.26)');
    g.addColorStop(0.70, 'rgba(255,255,255,0.07)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    _vfCoronaTexture._tex = t;
    return t;
}

// Anamorphic streak — bright thin horizontal bar, soft at both ends. Drawn
// into a wide canvas so the sprite can be stretched hard on X without the
// mip filtering smearing the core out.
function _vfStreakTexture() {
    if (_vfStreakTexture._tex) return _vfStreakTexture._tex;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 32;
    const ctx = c.getContext('2d');
    // Horizontal falloff
    const gx = ctx.createLinearGradient(0, 0, 256, 0);
    gx.addColorStop(0.00, 'rgba(255,255,255,0)');
    gx.addColorStop(0.30, 'rgba(255,255,255,0.42)');
    gx.addColorStop(0.50, 'rgba(255,255,255,1)');
    gx.addColorStop(0.70, 'rgba(255,255,255,0.42)');
    gx.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = gx;
    ctx.fillRect(0, 0, 256, 32);
    // …multiplied by a vertical falloff so the bar has soft edges, not a cut.
    ctx.globalCompositeOperation = 'destination-in';
    const gy = ctx.createLinearGradient(0, 0, 0, 32);
    gy.addColorStop(0.00, 'rgba(255,255,255,0)');
    gy.addColorStop(0.50, 'rgba(255,255,255,1)');
    gy.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = gy;
    ctx.fillRect(0, 0, 256, 32);
    ctx.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    _vfStreakTexture._tex = t;
    return t;
}

const _ebState = { mesh: null, adopted: [], nozzles: [], corona: [], streak: [], anchored: false };
const _ebWorld = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _ebColA = (typeof THREE !== 'undefined') ? new THREE.Color(0x2ad4ff) : null; // cool idle cyan
const _ebColB = (typeof THREE !== 'undefined') ? new THREE.Color(0xffc24a) : null; // engine gold
const _ebColC = (typeof THREE !== 'undefined') ? new THREE.Color(0xff3ad4) : null; // whip magenta
const _ebMix = (typeof THREE !== 'undefined') ? new THREE.Color() : null;
const _vfStreakHot = (typeof THREE !== 'undefined') ? new THREE.Color() : null;
const _vfWhite = (typeof THREE !== 'undefined') ? new THREE.Color(0xffffff) : null;

// Default nozzle positions, used only if the tagged sprites haven't been
// built yet (game-models attaches them from its own rAF loop, so on the first
// frames after the ship appears we may get here first).
const _EB_NOZZLES = [[-0.024, 0, -0.14], [0.024, 0, -0.14]];

function _ebMakeSprite(map, renderOrder) {
    const mat = new THREE.SpriteMaterial({
        map: map,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true
    });
    const s = new THREE.Sprite(mat);
    s.renderOrder = renderOrder;
    s.frustumCulled = false;
    return s;
}

// Removes only the sprites WE created. Adopted sprites belong to
// game-models.js — we never remove or dispose those, we only fixed their map.
function _ebTeardownOwn() {
    [_ebState.corona, _ebState.streak].forEach((arr) => {
        arr.forEach((s) => {
            if (s.parent) s.parent.remove(s);
            if (s.material) s.material.dispose();
        });
        arr.length = 0;
    });
}

// ADOPT + REPAIR. Any sprite on the player mesh with no map draws as a solid
// quad, so we repair by capability, not just by tag — a second untextured
// sprite added later gets fixed the same way. Records the tagged nozzle
// sprites (whether or not they needed repair) so the corona layer can anchor
// onto their real positions.
function _ebScan(mesh) {
    const nozzles = [];
    let repaired = 0;
    mesh.traverse((child) => {
        if (!child.isSprite || !child.material) return;
        if (_ebState.corona.indexOf(child) !== -1) return;   // ours
        if (_ebState.streak.indexOf(child) !== -1) return;   // ours
        if (child.userData.isVelocityBloom) nozzles.push(child);
        // DEFENSIVE REPAIR — a SpriteMaterial with no `map` shades its whole
        // quad at the flat material colour, i.e. draws a solid rectangle. If
        // the sprite already carries a map (game-models.js may ship its own
        // radial falloff) we leave it completely alone: this only ever fills
        // in a missing texture, it never overrides an existing one.
        if (!child.material.map) {
            child.material.map = _vfNozzleTexture();
            child.material.transparent = true;
            child.material.depthWrite = false;
            child.material.needsUpdate = true;   // rebuild the shader WITH the map
            child.frustumCulled = false;
            _ebState.adopted.push(child);
            repaired++;
        }
    });
    _ebState.nozzles = nozzles;
    return repaired;
}

function _ebBuild(mesh) {
    _ebTeardownOwn();
    // Nozzle anchors: the real bloom sprites if they exist, else the known
    // exhaust points (we can arrive before game-models has attached them).
    const anchors = _ebState.nozzles.length
        ? _ebState.nozzles.map((s) => [s.position.x, s.position.y, s.position.z])
        : _EB_NOZZLES;

    anchors.forEach((p) => {
        const corona = _ebMakeSprite(_vfCoronaTexture(), 99); // under the hot core
        corona.position.set(p[0], p[1], p[2] - 0.012);
        mesh.add(corona);
        _ebState.corona.push(corona);

        const streak = _ebMakeSprite(_vfStreakTexture(), 102); // over everything
        streak.position.set(p[0], p[1], p[2] - 0.004);
        mesh.add(streak);
        _ebState.streak.push(streak);
    });

    _ebState.anchored = _ebState.nozzles.length > 0;
    console.log('🔥 Engine bloom: ' + _ebState.nozzles.length + ' nozzle sprite(s), ' +
        _ebState.adopted.length + ' needed a radial alpha map; ' +
        _ebState.corona.length + ' corona + ' + _ebState.streak.length +
        ' anamorphic streak attached');
}

function _updateEngineBloom() {
    const cs = (typeof window !== 'undefined') ? window.cameraState : null;
    const mesh = cs && cs.playerShipMesh;
    if (!mesh) { _ebState.mesh = null; return; }

    // The ship mesh is rebuilt on respawn — rescan when identity changes.
    if (_ebState.mesh !== mesh) {
        _ebState.mesh = mesh;
        _ebState.adopted.length = 0;
        _ebState.anchored = false;
        _ebScan(mesh);
        _ebBuild(mesh);
    } else if (!_ebState.anchored && ((gameState.frameCount || 0) % 30 === 0)) {
        // game-models attaches its bloom sprites from its OWN rAF loop, so on
        // the first frames after the ship appears they may not exist yet and
        // we anchored on the fallback nozzle points. Keep looking, cheaply,
        // and re-anchor onto the real positions the moment they show up. Once
        // anchored this stops entirely — no permanent per-frame traversal.
        _ebScan(mesh);
        if (_ebState.nozzles.length) _ebBuild(mesh);
    }
    if (!_ebState.corona.length) return;

    const gs = gameState;
    const spd = (gs.velocityVector && gs.velocityVector.length) ? gs.velocityVector.length() : 0;
    const now = performance.now();

    // TWO heat channels. `heat` matches the hull rim's 6.8-unit reference so
    // the nozzles and the fresnel charge agree at cruise; `burn` is log-scaled
    // to the full 120-unit whip boost, so the glow keeps climbing in exactly
    // the range where the linear channel has already pinned at 1 — which is
    // the whole speed band the signature move lives in.
    const heat = Math.max(0, Math.min(1, spd / 6.8));
    const burn = Math.max(0, Math.min(1, Math.log(1 + spd / 6.8) / Math.log(1 + 120 / 6.8)));

    // Arc bite while captured, and the release crack, straight off physics.
    const wf = window.__whipFrame;
    const carve = (wf && wf.active && typeof wf.carve === 'number') ? wf.carve : 0;
    const wl = window.__whipLaunch;
    const crack = wl ? Math.max(0, Math.min(1, wl.e)) : 0;
    // A brief overbrightness at the very start of the crack — the flash of
    // the whip letting go, before the speed itself has arrived.
    const snap = wl ? Math.max(0, 1 - wl.p / 0.30) : 0;

    // Flicker: two unsynced sines so the engines never read as a static decal.
    const flick = 0.90 + 0.10 * Math.sin(now * 0.021) * Math.sin(now * 0.0073);

    // Colour: cool cyan at rest → gold under thrust → magenta as the whip
    // bites and cracks. Neon the whole way, never a muted ember.
    _ebMix.copy(_ebColA).lerp(_ebColB, Math.min(1, heat * 0.85 + burn * 0.5));
    _ebMix.lerp(_ebColC, Math.min(0.8, carve * 0.55 + crack * 0.7));

    const level = Math.min(1.15, 0.10 + 0.42 * heat + 0.46 * burn +
        0.30 * carve + 0.55 * crack + 0.45 * snap);

    for (let i = 0; i < _ebState.corona.length; i++) {
        const corona = _ebState.corona[i];
        const streak = _ebState.streak[i];

        // NEAR-CAMERA GUARD. In cockpit / zero-offset views the nozzles sit
        // essentially on the lens, where an additive quad becomes a full-frame
        // white-out. Fade them out over the last 16 units instead.
        corona.getWorldPosition(_ebWorld);
        const dCam = _ebWorld.distanceTo(camera.position);
        const prox = Math.max(0, Math.min(1, (dCam - 4) / 16));
        const vis = level * prox * flick;

        corona.material.color.copy(_ebMix);
        corona.material.opacity = Math.min(0.85, vis * 0.72);
        const cs2 = 0.030 + 0.052 * heat + 0.070 * burn + 0.055 * carve + 0.110 * crack;
        // Slight vertical squash: an exhaust bloom is wider than it is tall.
        corona.scale.set(cs2 * 1.30, cs2 * 0.92, 1);

        // The streak is a HIGH-SPEED signature only — off at cruise, so it
        // reads as an event rather than as permanent ship decoration.
        const sLevel = Math.max(0, (burn - 0.34) / 0.66);
        streak.visible = sLevel > 0.01;
        if (streak.visible) {
            _vfStreakHot.copy(_ebMix).lerp(_vfWhite, 0.45);
            streak.material.color.copy(_vfStreakHot);
            streak.material.opacity = Math.min(0.80,
                (sLevel * 0.55 + crack * 0.45 + snap * 0.35) * prox * flick);
            const w = 0.10 + 0.30 * sLevel + 0.34 * crack;
            streak.scale.set(w, w * 0.075, 1);
        }
    }
}

// ── Per-frame entry point ───────────────────────────────────────────────────
function updateVisualFlair() {
    if (typeof gameState === 'undefined' || !gameState.gameStarted ||
        typeof camera === 'undefined' || typeof scene === 'undefined' ||
        typeof THREE === 'undefined') return;
    const fc = gameState.frameCount || 0;
    // Player flame-ribbon streamer DISABLED per playtest (toggled off again).
    // Hide the mesh if it was ever created.
    if (_ptTrail.mesh) _ptTrail.mesh.visible = false;
    // try { _updatePlayerTrail(); } catch (e) {}
    try { _updateLaserCharge(); } catch (e) {}
    try { if (window.arcade) window.arcade.update(); } catch (e) {}
    try { _updateWarpStreaks(); } catch (e) {}
    try { _updateWarpTunnel(); } catch (e) {}
    try { _updateWarpDebris(); } catch (e) {}
    try { _updateBackdropParallax(); } catch (e) {}
    try { _updateScreenFX(); } catch (e) {}
    try { _updateWhipPreview(fc); } catch (e) {}
    try { _updateWhipShakeFx(); } catch (e) {}
    try { _updateWhipCharge(fc); } catch (e) {}
    try { _updateEngineBloom(); } catch (e) {}
    try { _updateLensFlares(fc); } catch (e) {}
    try { _updateAccretionSpiral(fc); } catch (e) {}
    try { _updateRimGlow(fc); } catch (e) {}
}

// Exports
if (typeof window !== 'undefined') {
    window.updateVisualFlair = updateVisualFlair;
    // Called again from animate() AFTER the render transforms (fixed-step
    // interpolation + cinematic re-anchor) so the charge glow rides the
    // RENDERED ship — placed only in the update phase it trails the ship
    // while thrusting (the "charge blast looks wrong under thrust" bug).
    window.__syncChargeGlow = _updateLaserCharge;
    window.materializeShip = materializeShip;
    window.createHitSparks = createHitSparks;
    window.createDistressFlare = createDistressFlare;
    window.playBossIntro = playBossIntro;
    window.spawnKillText = spawnKillText;
    window.killTextSizeForDistance = killTextSizeForDistance;
    window.flashArcadeText = flashArcadeText;
    window.arcadePraiseKill = arcadePraiseKill;
    window.flashEventText = flashEventText;
    window.wingmanTracerPush = wingmanTracerPush;
    window.wingmanTracerFade = wingmanTracerFade;
    window.warpStreakBurst = warpStreakBurst;
    window.warpDebrisBurst = warpDebrisBurst;
    window.warpTunnelBurst = warpTunnelBurst;
}
