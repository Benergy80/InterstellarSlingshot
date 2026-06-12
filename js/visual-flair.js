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

// ── 1. PLAYER ENGINE TRAIL — FLAME RIBBON ──────────────────────────────────
// A camera-facing triangle strip behind the 3rd-person ship: tapers to
// nothing at the tail, vertex-colored with a time-shifting rainbow gradient
// (bright at the head, dark at the tail — under additive blending dark IS
// transparent, so it fades out like flame). Length breathes on two unsynced
// sines + speed, so the streamer looks alive rather than mechanical.
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
    // Static strip index for the max point count
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
    // ALIVE LENGTH: target breathes on two unsynced sines around the
    // speed-driven base; the tail sheds toward it (and fully when hidden).
    const breathe = 0.7 + 0.18 * Math.sin(t * 0.0021) + 0.12 * Math.sin(t * 0.0047);
    const targetLen = visible
        ? Math.max(6, Math.floor(Math.min(_PT_MAX, 14 + speed * 4) * breathe))
        : 0;
    if (_ptTrail.points.length > targetLen) _ptTrail.points.shift();
    if (_ptTrail.points.length > targetLen) _ptTrail.points.shift(); // shed faster when over

    const N = _ptTrail.points.length;
    if (N > 2) {
        _ptEnsureMesh();
        _ptTrail.mesh.visible = true;
        const pts = _ptTrail.points;
        const headWidth = 1.4 + Math.min(3.2, speed * 0.18); // wider at speed
        for (let i = 0; i < N; i++) {
            const p = pts[i];
            // Segment direction (central difference)
            _ptDir.subVectors(pts[Math.min(i + 1, N - 1)], pts[Math.max(i - 1, 0)]);
            if (_ptDir.lengthSq() < 1e-8) _ptDir.set(0, 1, 0);
            _ptDir.normalize();
            _ptView.subVectors(p, camera.position).normalize();
            _ptSide.crossVectors(_ptDir, _ptView);
            if (_ptSide.lengthSq() < 1e-8) _ptSide.set(0, 1, 0);
            _ptSide.normalize();
            const f = i / (N - 1);               // 0 = tail … 1 = head
            const width = headWidth * Math.pow(f, 1.15) + 0.06; // taper to a point
            const o = i * 6;
            _ptTrail.pos[o]     = p.x + _ptSide.x * width;
            _ptTrail.pos[o + 1] = p.y + _ptSide.y * width;
            _ptTrail.pos[o + 2] = p.z + _ptSide.z * width;
            _ptTrail.pos[o + 3] = p.x - _ptSide.x * width;
            _ptTrail.pos[o + 4] = p.y - _ptSide.y * width;
            _ptTrail.pos[o + 5] = p.z - _ptSide.z * width;
            // RAINBOW FLAME: hue slides along the band and drifts with
            // time; brightness falls toward the tail (= additive fade),
            // with a per-segment flicker so the band shimmers.
            const hue = (f * 0.78 + t * 0.00013) % 1;
            const flick = 0.86 + 0.14 * Math.sin(t * 0.013 + i * 1.7);
            const bright = (0.08 + 0.5 * Math.pow(f, 1.4)) * flick;
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

// ── 16. WINGMAN ENGINE RIBBONS ──────────────────────────────────────────────
// Short persistent trails behind every live wingman (the player's ribbon's
// little siblings). Fade out and dispose when a wingman dies or despawns.
const _wingRibbons = [];

function _updateWingmanRibbons() {
    if (typeof allyShips === 'undefined') return;
    for (let i = 0; i < allyShips.length; i++) {
        const a = allyShips[i];
        if (!a || !a.userData || a.userData.health <= 0) continue;
        let tr = a.userData._engineRibbon;
        if (!tr) {
            const mat = new THREE.LineBasicMaterial({
                color: 0x66ddcc, transparent: true, opacity: 0.38,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            tr = { points: [], line: new THREE.Line(new THREE.BufferGeometry(), mat), mat, ally: a };
            tr.line.frustumCulled = false;
            scene.add(tr.line);
            a.userData._engineRibbon = tr;
            _wingRibbons.push(tr);
        }
        const last = tr.points[tr.points.length - 1];
        if (!last || last.distanceTo(a.position) > 4) {
            tr.points.push(a.position.clone());
            if (tr.points.length > 16) tr.points.shift();
            tr.line.geometry.setFromPoints(tr.points);
        }
    }
    // Fade + dispose ribbons whose wingman is gone
    for (let i = _wingRibbons.length - 1; i >= 0; i--) {
        const tr = _wingRibbons[i];
        const a = tr.ally;
        const gone = !a || !a.userData || a.userData.health <= 0 ||
            (typeof allyShips !== 'undefined' && allyShips.indexOf(a) === -1);
        if (gone) {
            tr.mat.opacity -= 0.05;
            if (tr.mat.opacity <= 0) {
                scene.remove(tr.line);
                tr.line.geometry.dispose();
                tr.mat.dispose();
                if (a && a.userData) a.userData._engineRibbon = null;
                _wingRibbons.splice(i, 1);
            }
        }
    }
}

// ── Per-frame entry point ───────────────────────────────────────────────────
function updateVisualFlair() {
    if (typeof gameState === 'undefined' || !gameState.gameStarted ||
        typeof camera === 'undefined' || typeof scene === 'undefined' ||
        typeof THREE === 'undefined') return;
    const fc = gameState.frameCount || 0;
    try { _updatePlayerTrail(); } catch (e) {}
    try { _updateWingmanRibbons(); } catch (e) {}
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
