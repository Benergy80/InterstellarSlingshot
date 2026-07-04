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
        _arc: null,        // directional whip arc around the body
        _arcHead: null,    // arrowhead at the arc's leading (exit) end
        _tube: null,       // thick warp tube of light along the launch corridor
        _tubeGeomFrame: 0,
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

    function _ensureArc() {
        if (sys._arc) return;
        // The whip arc is a glowing tube (radius ~45) wrapping the body; geometry
        // is rebuilt each update from the current sweep.
        const mat = new THREE.MeshBasicMaterial({
            color: 0x44ddff, transparent: true, opacity: 0.85,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        sys._arc = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        sys._arc.frustumCulled = false;
        sys._arc.renderOrder = 56;
        scene.add(sys._arc);
        // arrowhead cone at the leading (exit) end, points along the sweep
        const headMat = new THREE.MeshBasicMaterial({
            color: 0x44ddff, transparent: true, opacity: 0.95,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        sys._arcHead = new THREE.Mesh(new THREE.ConeGeometry(120, 320, 12), headMat);
        sys._arcHead.frustumCulled = false;
        sys._arcHead.renderOrder = 57;
        scene.add(sys._arcHead);
    }

    function _ensureTube() {
        if (sys._tube) return;
        const mat = new THREE.MeshBasicMaterial({
            map: _tubeTexture(), color: 0x44ddff, transparent: true, opacity: 0.6,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        sys._tube = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        sys._tube.frustumCulled = false;
        sys._tube.renderOrder = 55;
        scene.add(sys._tube);
    }

    function _hideVisuals() {
        if (sys._arc) sys._arc.visible = false;
        if (sys._arcHead) sys._arcHead.visible = false;
        if (sys._tube) sys._tube.visible = false;
    }

    const TUBE_RADIUS = 100;   // 200-unit diameter (per design)
    const TUBE_LEN = 5200;     // exit corridor length toward the destination

    function _updateVisuals(body, target) {
        _ensureArc();
        _ensureTube();
        const bp = body.position, cp = camera.position;
        const range = (typeof getSlingshotRange === 'function')
            ? Math.max(getSlingshotRange(body) * 0.85, 120) : 180;
        const col = _qualityColor(sys.alignment);
        const t = performance.now() * 0.001;

        // Whip direction: the tangent sign whose sweep agrees with body→target.
        _v1.subVectors(target.position, bp).setY(0).normalize();
        _v2.subVectors(cp, bp).setY(0).normalize();
        const sign = (_v2.x * _v1.z - _v2.z * _v1.x) >= 0 ? 1 : -1;
        const theta0 = Math.atan2(cp.z - bp.z, cp.x - bp.x);   // start facing the player
        const y = cp.y;

        // ── DIRECTIONAL WHIP ARC around the body (~240°) ───────────────────
        const ARC = 4.2;                       // ~240° of sweep
        const arcPts = [];
        const AN = 24;
        for (let i = 0; i <= AN; i++) {
            const a = theta0 + sign * (i / AN) * ARC;
            arcPts.push(new THREE.Vector3(bp.x + Math.cos(a) * range, y, bp.z + Math.sin(a) * range));
        }
        const arcCurve = new THREE.CatmullRomCurve3(arcPts);
        const arcGeo = new THREE.TubeGeometry(arcCurve, 32, 45, 8, false);
        sys._arc.geometry.dispose();
        sys._arc.geometry = arcGeo;
        sys._arc.material.color.copy(col);
        sys._arc.material.opacity = 0.6 + 0.25 * (0.5 + 0.5 * Math.sin(t * 3));
        sys._arc.visible = true;

        // arrowhead at the arc's leading end, pointing along the exit tangent
        const exitA = theta0 + sign * ARC;
        const exitPos = new THREE.Vector3(bp.x + Math.cos(exitA) * range, y, bp.z + Math.sin(exitA) * range);
        const exitTan = new THREE.Vector3(-Math.sin(exitA) * sign, 0, Math.cos(exitA) * sign).normalize();
        sys._arcHead.position.copy(exitPos);
        sys._arcHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), exitTan);
        sys._arcHead.material.color.copy(col);
        sys._arcHead.visible = true;

        // ── WARP TUBE OF LIGHT down the launch corridor ────────────────────
        // From the arc's exit, blend the exit tangent toward the destination
        // bearing and run a heavy glowing tube along it.
        _v2.subVectors(target.position, bp).normalize();
        const launch = _v2.multiplyScalar(0.72).addScaledVector(exitTan, 0.28).normalize();
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
