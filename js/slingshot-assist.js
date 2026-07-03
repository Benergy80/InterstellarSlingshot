// =============================================================================
// SLINGSHOT ASSIST — opt-in trajectory guidance for far-off destinations.
//
// The player targets a distant system by name in the Navigation System and
// flips the ASSIST toggle. When the nav target is far away, the assist scans
// nearby slingshot-capable bodies, scores them by how well a gravity whip
// around them would fling the ship AT the destination, and visualizes the
// best candidate:
//   • GRAVITY COIL — an animated spiral winding around the body at its
//     slingshot radius, spinning in the whip direction, colored by quality
//     (amber → green as exit alignment improves).
//   • TRAJECTORY RIBBON — dashed curve: entry leg → capture arc around the
//     body → launch ray toward the destination, with a bright pulse dot
//     flowing along it to show the direction of propulsion.
//   • The toggle button doubles as a live readout (body name + % alignment).
//
// A trajectory preview existed once and was cut because it appeared with no
// intent (clutter whenever near any body). This one only exists behind the
// deliberate toggle + a far nav target, and dies with either.
// =============================================================================
(function () {
    const ACTIVATE_DIST = 6000;      // nav target must be at least this far
    const SCAN_RADIUS = 5500;        // candidate bodies within this range
    const RESCAN_FRAMES = 15;

    const sys = {
        enabled: false,
        candidate: null,
        alignment: 0,
        _coil: null,
        _ribbon: null,
        _pulse: null,
    };

    // ── candidate scoring ────────────────────────────────────────────────────
    const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

    function _slingable(p) {
        const t = p.userData && p.userData.type;
        return t === 'planet' || t === 'star' || t === 'moon' || t === 'blackhole';
    }

    function _pickCandidate(target) {
        if (typeof planets === 'undefined') return null;
        const cp = camera.position;
        _v3.subVectors(target.position, cp).normalize();   // bearing to destination
        let best = null, bestScore = 0.25;                 // quality floor
        for (let i = 0; i < planets.length; i++) {
            const p = planets[i];
            if (!p || !p.position || !p.userData || !_slingable(p)) continue;
            if (p === target) continue;
            const d = cp.distanceTo(p.position);
            if (d > SCAN_RADIUS || d < 120) continue;
            // Exit alignment: a whip flings you roughly along (body → target);
            // a good candidate sits so that vector agrees with your bearing.
            _v1.subVectors(target.position, p.position).normalize();
            const exitAlign = 0.5 + 0.5 * _v1.dot(_v3);
            // Detour: prefer bodies near your line to the destination
            _v2.subVectors(p.position, cp);
            const along = _v2.dot(_v3);
            if (along < 0) continue;                        // behind us
            const lateral = _v2.addScaledVector(_v3, -along).length();
            const detour = 1 / (1 + lateral / 1200);
            // Reach: nearer is better (less flying before the boost)
            const reach = 1 / (1 + d / 2500);
            // Mass class: stars & black holes whip harder
            const t = p.userData.type;
            const mass = t === 'blackhole' ? 1.25 : t === 'star' ? 1.15 : 1.0;
            const score = exitAlign * 0.55 + detour * 0.25 + reach * 0.2;
            const total = score * mass;
            if (total > bestScore) { bestScore = total; best = p; sys.alignment = exitAlign; }
        }
        return best;
    }

    // ── visuals ──────────────────────────────────────────────────────────────
    function _qualityColor(align) {
        // amber (poor) → green (great)
        const c = new THREE.Color();
        c.setHSL(0.09 + 0.24 * Math.max(0, Math.min(1, (align - 0.5) * 2)), 1.0, 0.55);
        return c;
    }

    function _ensureCoil() {
        if (sys._coil) return sys._coil;
        const COUNT = 96;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
        const mat = new THREE.PointsMaterial({
            color: 0xffcc44, size: 3.2, transparent: true, opacity: 0.85,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
        });
        sys._coil = new THREE.Points(geo, mat);
        sys._coil.frustumCulled = false;
        sys._coil.renderOrder = 55;
        scene.add(sys._coil);
        return sys._coil;
    }

    function _ensureRibbon() {
        if (sys._ribbon) return sys._ribbon;
        const mat = new THREE.LineDashedMaterial({
            color: 0xffcc44, transparent: true, opacity: 0.5,
            dashSize: 34, gapSize: 26, depthWrite: false
        });
        sys._ribbon = new THREE.Line(new THREE.BufferGeometry(), mat);
        sys._ribbon.frustumCulled = false;
        sys._ribbon.renderOrder = 54;
        scene.add(sys._ribbon);
        // traveling pulse dot — motion IS the "it flings you this way" cue
        const pm = new THREE.SpriteMaterial({
            map: (typeof _vfGlowTexture === 'function') ? _vfGlowTexture() : null,
            color: 0xffffff, transparent: true, opacity: 0.95,
            blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
        });
        sys._pulse = new THREE.Sprite(pm);
        sys._pulse.scale.setScalar(14);
        sys._pulse.renderOrder = 56;
        scene.add(sys._pulse);
        return sys._ribbon;
    }

    function _hideVisuals() {
        if (sys._coil) sys._coil.visible = false;
        if (sys._ribbon) sys._ribbon.visible = false;
        if (sys._pulse) sys._pulse.visible = false;
    }

    let _ribbonPts = [];

    function _updateVisuals(body, target) {
        const bp = body.position, cp = camera.position;
        const range = (typeof getSlingshotRange === 'function')
            ? Math.max(getSlingshotRange(body) * 0.8, 80) : 150;
        const col = _qualityColor(sys.alignment);
        const t = performance.now() * 0.001;

        // GRAVITY COIL: 3-loop spiral at the whip radius, spinning in the
        // whip direction, gently breathing.
        const coil = _ensureCoil();
        coil.visible = true;
        coil.material.color.copy(col);
        const arr = coil.geometry.attributes.position.array;
        const N = arr.length / 3;
        // whip direction: sign of the tangent that agrees with body→target
        _v1.subVectors(target.position, bp).setY(0).normalize();
        _v2.subVectors(cp, bp).setY(0).normalize();
        const sign = (_v2.x * _v1.z - _v2.z * _v1.x) >= 0 ? 1 : -1;
        for (let i = 0; i < N; i++) {
            const f = i / (N - 1);
            const ang = sign * (f * Math.PI * 6 + t * 1.6);   // 3 loops, spinning
            const r = range * (1 + 0.06 * Math.sin(t * 2 + f * 12));
            arr[i * 3] = bp.x + Math.cos(ang) * r;
            arr[i * 3 + 1] = bp.y + (f - 0.5) * range * 0.7;   // rises through the body
            arr[i * 3 + 2] = bp.z + Math.sin(ang) * r;
        }
        coil.geometry.attributes.position.needsUpdate = true;

        // TRAJECTORY RIBBON: entry leg → capture arc → launch ray
        const ribbon = _ensureRibbon();
        ribbon.visible = true;
        ribbon.material.color.copy(col);
        const theta0 = Math.atan2(cp.z - bp.z, cp.x - bp.x);
        const pts = [];
        // entry: player → arc start (the point on the whip circle nearest us)
        pts.push(cp.clone().addScaledVector(_v3.subVectors(bp, cp).normalize(), 40));
        const arcStart = new THREE.Vector3(
            bp.x + Math.cos(theta0) * range, cp.y, bp.z + Math.sin(theta0) * range);
        pts.push(arcStart);
        const ARC = 2.2;   // ~125° of capture arc
        for (let i = 1; i <= 18; i++) {
            const a = theta0 + sign * (i / 18) * ARC;
            pts.push(new THREE.Vector3(bp.x + Math.cos(a) * range, cp.y, bp.z + Math.sin(a) * range));
        }
        // launch ray: exit tangent blended toward the destination bearing
        const exitA = theta0 + sign * ARC;
        _v1.set(-Math.sin(exitA) * sign, 0, Math.cos(exitA) * sign);          // exit tangent
        _v2.subVectors(target.position, bp).normalize();                       // to destination
        const launch = _v2.multiplyScalar(0.7).addScaledVector(_v1, 0.3).normalize();
        const end = pts[pts.length - 1];
        pts.push(end.clone().addScaledVector(launch, 3200));
        ribbon.geometry.setFromPoints(pts);
        ribbon.computeLineDistances();
        _ribbonPts = pts;

        // PULSE DOT: flows along the whole path every ~2.4s
        if (sys._pulse) {
            sys._pulse.visible = true;
            sys._pulse.material.color.copy(col);
            const f = (t % 2.4) / 2.4;
            const idx = f * (pts.length - 1);
            const i0 = Math.floor(idx), i1 = Math.min(pts.length - 1, i0 + 1);
            sys._pulse.position.copy(pts[i0]).lerp(pts[i1], idx - i0);
        }
    }

    // ── toggle + button readout ──────────────────────────────────────────────
    sys.toggle = function () {
        sys.enabled = !sys.enabled;
        if (!sys.enabled) { sys.candidate = null; _hideVisuals(); }
        _updateButton();
    };

    function _updateButton() {
        const btn = document.getElementById('slingshotAssistBtn');
        if (!btn) return;
        if (!sys.enabled) {
            btn.innerHTML = '<i class="fas fa-hurricane mr-2"></i>Slingshot Assist: OFF';
            btn.classList.remove('assist-on');
        } else if (sys.candidate) {
            const nm = sys.candidate.userData.name || 'body';
            btn.innerHTML = '<i class="fas fa-hurricane mr-2"></i>ASSIST: ' + nm +
                ' · ' + Math.round(sys.alignment * 100) + '% exit alignment';
            btn.classList.add('assist-on');
        } else {
            btn.innerHTML = '<i class="fas fa-hurricane mr-2"></i>Assist: scanning for a gravity coil…';
            btn.classList.add('assist-on');
        }
    }

    // ── per-frame update (called from animate) ───────────────────────────────
    sys.update = function (fc) {
        if (!sys.enabled) return;
        if (typeof gameState === 'undefined' || !gameState.gameStarted || typeof camera === 'undefined') {
            _hideVisuals(); return;
        }
        const target = gameState.currentTarget;
        const busy = (gameState.slingshot && gameState.slingshot.active) || gameState.slingshotWhip ||
            (gameState.emergencyWarp && (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning));
        if (!target || !target.position || busy ||
            camera.position.distanceTo(target.position) < ACTIVATE_DIST) {
            if (sys.candidate) { sys.candidate = null; _updateButton(); }
            _hideVisuals();
            return;
        }
        if (fc % RESCAN_FRAMES === 0 || !sys.candidate) {
            const prev = sys.candidate;
            sys.candidate = _pickCandidate(target);
            if (sys.candidate !== prev) _updateButton();
        }
        if (sys.candidate) {
            _updateVisuals(sys.candidate, target);
            if (fc % 30 === 0) _updateButton();   // keep % readout fresh
        } else {
            _hideVisuals();
        }
    };

    // wire the nav-panel button
    function _wire() {
        const btn = document.getElementById('slingshotAssistBtn');
        if (btn && !btn._wired) {
            btn._wired = true;
            btn.addEventListener('click', sys.toggle);
            _updateButton();
        }
    }
    if (typeof window !== 'undefined') {
        if (window.Boot) window.Boot.whenReady('dom', _wire);
        else setTimeout(_wire, 1200);
        window.slingshotAssist = sys;
    }
})();
