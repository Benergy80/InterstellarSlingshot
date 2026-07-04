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
        _halo: null,       // gravity-capture glow shell around the body
        _tube: null,       // thick warp tube of light along the launch corridor
        _tubeGeomFrame: 0,
    };

    // ── candidate scoring ────────────────────────────────────────────────────
    const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
    const _tA = new THREE.Vector3(), _tB = new THREE.Vector3(), _tC = new THREE.Vector3(),
          _tD = new THREE.Vector3(), _tE = new THREE.Vector3();

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
    // Alignment colour: amber (poor) → CYAN (great). Deliberately not green —
    // green swirls read as orbit rings. Lerped straight amber→cyan in RGB.
    const _amber = new THREE.Color(1.0, 0.62, 0.12);
    const _cyan = new THREE.Color(0.2, 0.9, 1.0);
    function _qualityColor(align) {
        const t = Math.max(0, Math.min(1, (align - 0.5) * 2));
        return _amber.clone().lerp(_cyan, t);
    }

    // Flowing-light texture for the warp tube — bright bands scrolled along
    // the tube each frame to read as light rushing toward the destination.
    function _tubeTexture() {
        if (_tubeTexture._t) return _tubeTexture._t;
        const c = document.createElement('canvas');
        c.width = 128; c.height = 4;
        const ctx = c.getContext('2d');
        for (let x = 0; x < 128; x++) {
            const s = 0.5 + 0.5 * Math.sin((x / 128) * Math.PI * 4);
            const a = 0.12 + 0.88 * Math.pow(s, 4);   // sharp bright bands
            ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
            ctx.fillRect(x, 0, 1, 4);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(6, 1);
        _tubeTexture._t = tex;
        return tex;
    }

    function _ensureHalo() {
        if (sys._halo) return;
        // A glowing shell around the body marking the gravity-capture zone.
        // BackSide additive gives a soft volumetric rim-glow (atmosphere look);
        // it's a VOLUME, so it never reads as an orbit line or the tube.
        const mat = new THREE.MeshBasicMaterial({
            color: 0x44ddff, transparent: true, opacity: 0.3,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide
        });
        sys._halo = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat);
        sys._halo.frustumCulled = false;
        sys._halo.renderOrder = 56;
        scene.add(sys._halo);
    }

    function _ensureTube() {
        if (sys._tube) return;
        const mat = new THREE.MeshBasicMaterial({
            map: _tubeTexture(), color: 0x44ddff, transparent: true, opacity: 0.6,
            vertexColors: true,   // per-vertex NEAR-FADE so the tube never walls
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        sys._tube = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        sys._tube.frustumCulled = false;
        sys._tube.renderOrder = 55;
        scene.add(sys._tube);
    }

    function _hideVisuals() {
        if (sys._halo) sys._halo.visible = false;
        if (sys._tube) sys._tube.visible = false;
    }

    const TUBE_RADIUS = 35;    // 70-unit diameter (dialed down from 200 → 100 → 70)
    const TUBE_LEN = 5200;     // exit corridor length toward the destination

    function _updateVisuals(body, target) {
        _ensureHalo();
        _ensureTube();
        const bp = body.position, cp = camera.position;
        const bodyR = (body.geometry && body.geometry.parameters && body.geometry.parameters.radius)
            ? body.geometry.parameters.radius * ((body.scale && body.scale.x) || 1) : 40;
        const range = (typeof getSlingshotRange === 'function')
            ? Math.max(getSlingshotRange(body) * 0.85, 120) : 180;
        const col = _qualityColor(sys.alignment);
        const t = performance.now() * 0.001;

        // ── HALO GLOW SHELL: the gravity-capture zone; brightens + saturates
        // toward cyan as exit alignment improves, breathes gently, and hides
        // once the camera is inside it (avoids additive wash + you're already
        // whipping at that point).
        // The shell IS the slingshot zone: haloR = getSlingshotRange (the
        // radius where "SLINGSHOT READY" fires), so the glow literally marks
        // where you can whip — cross into it and the shell vanishes as the
        // READY prompt takes over. (Bigger for stars, tight for planets —
        // that's the real gravity-well reach.)
        const haloR = (typeof getSlingshotRange === 'function')
            ? getSlingshotRange(body) : Math.max(bodyR * 2.4, 140);
        const camDist = cp.distanceTo(bp);
        sys._halo.position.copy(bp);
        sys._halo.scale.setScalar(haloR * (1 + 0.03 * Math.sin(t * 2)));
        sys._halo.material.color.copy(col);
        sys._halo.material.opacity = (0.14 + 0.26 * sys.alignment) * (0.7 + 0.3 * Math.sin(t * 2.5));
        sys._halo.visible = camDist > haloR;   // hide once inside the zone (avoids wash + READY takes over)

        // ── Launch direction (whip release toward the destination) ─────────
        // Blend the destination bearing with the whip tangent for a slight arc.
        const toDestF = _tA.subVectors(target.position, bp).setY(0).normalize();
        const radial = _tB.subVectors(cp, bp).setY(0).normalize();
        const sign = (radial.x * toDestF.z - radial.z * toDestF.x) >= 0 ? 1 : -1;
        const tangent = _tC.set(-radial.z * sign, 0, radial.x * sign);
        const toDest = _tD.subVectors(target.position, bp).normalize();
        const launch = toDest.multiplyScalar(0.72).addScaledVector(tangent, 0.28).normalize();
        const exitPos = _tE.copy(bp).addScaledVector(launch, haloR * 1.02);   // tube emerges from the zone edge

        // ── WARP TUBE OF LIGHT down the launch corridor ────────────────────
        // Rebuild the tube geometry at ~12 Hz (cheap enough, avoids per-frame
        // churn); scroll its texture every frame for the flow.
        const frame = (typeof gameState !== 'undefined' && gameState.frameCount) || 0;
        if (frame - sys._tubeGeomFrame >= 5 || sys._tube.geometry.attributes.position === undefined) {
            sys._tubeGeomFrame = frame;
            const tubePts = [
                exitPos.clone(),
                exitPos.clone().addScaledVector(launch, TUBE_LEN * 0.5),
                exitPos.clone().addScaledVector(launch, TUBE_LEN)
            ];
            const tubeCurve = new THREE.CatmullRomCurve3(tubePts);
            const tubeGeo = new THREE.TubeGeometry(tubeCurve, 24, TUBE_RADIUS, 12, false);
            sys._tube.geometry.dispose();
            sys._tube.geometry = tubeGeo;
        }
        sys._tube.material.color.copy(col);
        sys._tube.material.map.offset.x = -(t * 0.9) % 1;   // flow toward destination
        sys._tube.material.opacity = 0.45 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2.2));
        sys._tube.visible = true;

        // NEAR-FADE: ramp the tube to nothing within ~700u of the camera so a
        // 200-diameter tube of light never walls off the view when you're right
        // on the body. Per-vertex greyscale under additive blending (black =
        // invisible); recomputed every frame from the live camera position.
        const posAttr = sys._tube.geometry.attributes.position;
        if (posAttr) {
            let colAttr = sys._tube.geometry.attributes.color;
            if (!colAttr || colAttr.count !== posAttr.count) {
                colAttr = new THREE.BufferAttribute(new Float32Array(posAttr.count * 3), 3);
                sys._tube.geometry.setAttribute('color', colAttr);
            }
            const NEAR_HIDE = 700, NEAR_FULL = 2600;
            for (let i = 0; i < posAttr.count; i++) {
                _v3.fromBufferAttribute(posAttr, i);
                let f = (_v3.distanceTo(cp) - NEAR_HIDE) / (NEAR_FULL - NEAR_HIDE);
                f = f < 0 ? 0 : f > 1 ? 1 : f;
                f = f * f * (3 - 2 * f);   // smoothstep
                colAttr.setXYZ(i, f, f, f);
            }
            colAttr.needsUpdate = true;
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
