// =============================================================================
// ASTEROID INSTANCER — draw-call collapse for the belt/scattered asteroids.
//
// The belt asteroids (userData.type === 'asteroid') were ~2,500 individual
// THREE.Mesh objects → ~2,500 draw calls, the dominant cost inside the dense
// Sol belt / galaxy cores. Each belt's asteroids now render from a handful of
// InstancedMeshes (one per geometry×material combo used in that belt), so a
// belt of ~100 asteroids costs ~3-9 draw calls instead of ~100.
//
// Meshes are grouped PER BELT so the old distance culling still applies: a
// belt's instanced meshes are hidden when the belt is beyond the cull range
// (exactly like the old beltGroup.visible toggle) — important both for real
// GPUs and for the headless software renderer used by the smoke test.
//
// Behaviour is preserved by keeping a lightweight PROXY per asteroid in the
// global `planets` array. The proxy mimics the Mesh interface the rest of the
// code reads (`.position` [world], `.userData`, `.scale.x`,
// `.geometry.parameters.radius`, `.getWorldPosition()`, `.visible`), so
// targeting, destruction, sizing, collision, mining and culling keep working
// with only the weapon + mining raycasts rewritten to hit the instanced
// meshes and map instanceId → proxy.
//
// Floating origin: the InstancedMeshes live under one root group. On a world
// rebase applyWorldShift subtracts the offset from the root's position; the
// shift handler resets the root to origin and forces a full rebake so
// instance matrices stay camera-relative (small).
// =============================================================================
(function () {
    const RENDER_DIST_SQ = 30000 * 30000;   // belt visibility cull (old beltGroup cull)
    const ANIM_DIST_SQ = 8000 * 8000;        // belt orbit/spin animation gate
    const CHUNK = 128;                        // instanced-mesh grow step

    const _m = new THREE.Matrix4();
    const _q = new THREE.Quaternion();
    const _e = new THREE.Euler();
    const _s = new THREE.Vector3();
    const _p = new THREE.Vector3();

    const sys = {
        root: null,
        belts: [],          // [{ group, combos:{'g_m':combo}, records:[] }]
        records: [],
        _dirty: false,
        _deadPending: false,
        _ready: false,
    };

    // GPU instancing is a big win on real hardware but a big LOSS on software
    // renderers (SwiftShader/llvmpipe rasterize instances serially, ~10× slower
    // than individual meshes). CI / the headless smoke test run on SwiftShader,
    // so detect it once (the renderer exists by first asteroid creation) and
    // fall back to real meshes there. Checked lazily — the module loads before
    // `renderer` exists.
    let _enabledChecked = false;
    sys.enabled = true;
    sys.isEnabled = function () {
        if (_enabledChecked) return sys.enabled;
        _enabledChecked = true;
        try {
            if (typeof renderer !== 'undefined' && renderer.getContext) {
                const gl = renderer.getContext();
                const ext = gl.getExtension('WEBGL_debug_renderer_info');
                const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
                if (/swiftshader|software|llvmpipe|microsoft basic/i.test(name)) {
                    sys.enabled = false;
                    console.warn('Asteroid instancer OFF on software renderer (' + name + ') — using mesh fallback');
                }
            }
        } catch (e) { /* keep instancing on any detection error */ }
        return sys.enabled;
    };

    function _ensureRoot() {
        if (sys.root) return;
        sys.root = new THREE.Group();
        sys.root.name = 'AsteroidInstanceRoot';
        sys.root.frustumCulled = false;
        scene.add(sys.root);
        sys._ready = true;
    }

    function _makeMesh(geometry, material, cap) {
        const mesh = new THREE.InstancedMesh(geometry, material, cap);
        // Per-belt meshes are spatially compact, so FRUSTUM CULLING pays off:
        // off-screen belts are skipped entirely. (Critical for the software
        // renderer in the smoke test — without it every on-distance belt is
        // rasterized even when the camera faces away.) computeBoundingSphere
        // is called after each placement so the cull volume is correct.
        mesh.frustumCulled = true;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        sys.root.add(mesh);
        return mesh;
    }

    function _beltEntry(group) {
        _ensureRoot();
        if (group.userData && group.userData._astBelt) return group.userData._astBelt;
        const entry = { group, combos: {}, records: [], visible: true };
        if (group.userData) group.userData._astBelt = entry;
        sys.belts.push(entry);
        return entry;
    }

    function _combo(belt, geomIdx, matIdx) {
        const key = geomIdx + '_' + matIdx;
        let c = belt.combos[key];
        if (!c) {
            const geom = asteroidResources.geometries[geomIdx];
            const mat = asteroidResources.materials[matIdx];
            c = { mesh: _makeMesh(geom, mat, CHUNK), cap: CHUNK, count: 0, records: [], key, belt };
            belt.combos[key] = c;
        }
        return c;
    }

    function _grow(c) {
        const newCap = c.cap + CHUNK;
        const old = c.mesh;
        const mesh = _makeMesh(old.geometry, old.material, newCap);
        for (let i = 0; i < c.count; i++) { old.getMatrixAt(i, _m); mesh.setMatrixAt(i, _m); }
        mesh.count = c.count;
        mesh.visible = old.visible;
        mesh.instanceMatrix.needsUpdate = true;
        sys.root.remove(old);
        old.dispose();
        c.mesh = mesh;
        c.cap = newCap;
    }

    function _writeMatrix(r) {
        const bg = r.userData.beltGroup;
        const bx = bg ? bg.position.x : 0, by = bg ? bg.position.y : 0, bz = bg ? bg.position.z : 0;
        _p.set(bx + Math.cos(r.orbitPhase) * r.orbitRadius, by + r.ringHeight, bz + Math.sin(r.orbitPhase) * r.orbitRadius);
        _e.set(r.rotX, r.rotY, r.rotZ);
        _q.setFromEuler(_e);
        _s.setScalar(r.scale);
        _m.compose(_p, _q, _s);
        r.combo.mesh.setMatrixAt(r.slot, _m);
        r.proxy.position.set(_p.x, _p.y, _p.z);
    }

    // ── public: create an instanced asteroid, return its proxy ───────────────
    sys.add = function (opts) {
        const belt = _beltEntry(opts.beltGroup);
        const c = _combo(belt, opts.geomIdx, opts.matIdx);
        if (c.count >= c.cap) _grow(c);
        const slot = c.count++;
        c.mesh.count = c.count;

        const geom = asteroidResources.geometries[opts.geomIdx];
        const proxy = {
            isAsteroidProxy: true,
            position: new THREE.Vector3(),
            scale: { x: opts.scale, y: opts.scale, z: opts.scale, setScalar() {} },
            geometry: geom,
            visible: true,
            userData: opts.userData,
            getWorldPosition(v) { return (v || new THREE.Vector3()).copy(this.position); },
        };
        const r = {
            proxy, combo: c, slot,
            orbitPhase: opts.orbitPhase, orbitRadius: opts.orbitRadius,
            orbitSpeed: opts.orbitSpeed, ringHeight: opts.ringHeight,
            rotX: (opts.rot && opts.rot.x) || 0, rotY: (opts.rot && opts.rot.y) || 0, rotZ: (opts.rot && opts.rot.z) || 0,
            rotSpeed: opts.rotSpeed, scale: opts.scale,
            userData: opts.userData, dead: false, placed: false,
        };
        proxy._instRef = r;
        c.records.push(r);
        belt.records.push(r);
        sys.records.push(r);
        _writeMatrix(r);
        c.mesh.instanceMatrix.needsUpdate = true;
        return proxy;
    };

    // ── public: free an instance (swap-remove within its combo) ──────────────
    sys.free = function (r) {
        if (!r || r.dead) return;
        const c = r.combo;
        const lastIdx = c.count - 1;
        const lastRec = c.records[lastIdx];
        if (lastRec && lastRec !== r) {
            c.mesh.getMatrixAt(lastIdx, _m);
            c.mesh.setMatrixAt(r.slot, _m);
            lastRec.slot = r.slot;
            c.records[r.slot] = lastRec;
        }
        c.records.pop();
        c.count--;
        c.mesh.count = c.count;
        c.mesh.instanceMatrix.needsUpdate = true;
        r.dead = true;
        sys._deadPending = true;
    };

    // ── public: per-frame update — cull distant belts, animate near ones ─────
    sys.update = function () {
        if (!sys._ready) return;
        const full = sys._dirty;
        const cam = camera.position;
        for (let b = 0; b < sys.belts.length; b++) {
            const belt = sys.belts[b];
            const g = belt.group;
            const dx = cam.x - g.position.x, dy = cam.y - g.position.y, dz = cam.z - g.position.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            const visible = d2 <= RENDER_DIST_SQ;
            const near = d2 <= ANIM_DIST_SQ;
            // toggle belt mesh visibility (matches the old beltGroup cull)
            if (visible !== belt.visible) {
                for (const k in belt.combos) belt.combos[k].mesh.visible = visible;
                belt.visible = visible;
            }
            // place every instance at least once (beltGroup.position is only
            // final after creation) and re-place on a rebake; animate near belts.
            if (!full && !near && belt._placed) continue;
            const touched = {};
            for (let i = 0; i < belt.records.length; i++) {
                const r = belt.records[i];
                if (r.dead) continue;
                if (near) {
                    if (r.orbitSpeed) r.orbitPhase += r.orbitSpeed;
                    if (r.rotSpeed) { r.rotY += r.rotSpeed; r.rotX += r.rotSpeed * 0.3; }
                }
                _writeMatrix(r);
                touched[r.combo.key] = r.combo;
            }
            for (const k in touched) {
                const c = touched[k];
                c.mesh.instanceMatrix.needsUpdate = true;
                // refresh the cull volume from the current instance matrices
                if (c.count > 0 && c.mesh.computeBoundingSphere) c.mesh.computeBoundingSphere();
            }
            belt._placed = true;
        }
        if (full) sys._dirty = false;
        if (sys._deadPending) {
            sys.records = sys.records.filter(r => !r.dead);
            sys._deadPending = false;
        }
    };

    // ── public: raycast the (visible) instanced meshes → {proxy, point} | null
    sys.raycast = function (raycaster) {
        if (!sys._ready) return null;
        let best = null, bestD = Infinity;
        for (let b = 0; b < sys.belts.length; b++) {
            const belt = sys.belts[b];
            if (!belt.visible) continue;
            for (const k in belt.combos) {
                const c = belt.combos[k];
                if (c.count === 0) continue;
                const hits = raycaster.intersectObject(c.mesh, false);
                for (let h = 0; h < hits.length; h++) {
                    const hit = hits[h];
                    if (hit.instanceId === undefined || hit.distance >= bestD) continue;
                    const rec = c.records[hit.instanceId];
                    if (rec && !rec.dead) { bestD = hit.distance; best = { proxy: rec.proxy, point: hit.point.clone() }; }
                }
            }
        }
        return best;
    };

    sys.count = function () { return sys.records.length; };

    if (typeof window !== 'undefined') {
        window.__worldShiftHandlers = window.__worldShiftHandlers || [];
        window.__worldShiftHandlers.push(function () {
            if (sys.root) sys.root.position.set(0, 0, 0);
            sys._dirty = true;
        });
        window.asteroidInstancer = sys;
    }
})();
