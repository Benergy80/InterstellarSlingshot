// =============================================================================
// SYNTHWAVE POST — Interstellar Slingshot (branch claude/synthwave), Wave 2
//   1. One EffectComposer with HDR-THRESHOLD BLOOM: a half-float render target,
//      UnrealBloomPass threshold 1.0, and only the things we push above 1.0
//      (neon ×3: ship edge lines, lasers) glow. Textured planets stay ≤ 1.0 and
//      crisp. One scene render, no layer swap. (research/retrowave.md §3.2)
//   2. VECTOR SHIPS: EdgesGeometry → LineSegments2 glowing edge lines on the
//      player, the wingmen and the nearest enemies, in faction colours.
// Needs the r128 example scripts (index.html): postprocessing/{EffectComposer,
// RenderPass, ShaderPass, UnrealBloomPass}, shaders/{CopyShader,
// LuminosityHighPassShader}, lines/{LineSegmentsGeometry, LineMaterial,
// LineSegments2}. Switches: postFx ('bloom' | 'off'), vectorShips ('edges' | 'off').
// =============================================================================
(function () {
    'use strict';

    const SW_POST = {
        // Measured 20261012a: strength 0.8 / threshold 1.0 at half res bloomed the
        // whole additive star field (its overlaps sum past 1.0) and cost a full
        // frame (16.7 → 33 ms on the headless GPU). Softer, higher threshold,
        // quarter-res mips, and the composer only in the normal quality tier.
        STRENGTH: 0.5, RADIUS: 0.35, THRESHOLD: 1.35, BLOOM_DIV: 4,
        TIER_COOLDOWN_MS: 60000,
        HDR_K: 3.0,              // neon multiplier that lifts a colour over the threshold
        EDGE_ANGLE: 25,          // EdgesGeometry threshold angle (deg)
        EDGE_WIDTH: 1.6,         // px
        EDGE_OPACITY: 0.9,
        ENEMY_EDGE_RANGE: 2600,  // enemies closer than this get edges…
        ENEMY_EDGE_MAX: 24,      // …at most this many at once
        POLL_MS: 900,
        COL: { player: 0x19f0ff, wingman: 0x5dffb0, hostile: 0xff2bd6, boss: 0xff8c3a, support: 0xff5ccd }
    };
    if (typeof window !== 'undefined') window.SW_POST = SW_POST;

    const sw = (k, v) => !!(window.HYBRID && window.HYBRID.is(k, v));
    const tierName = () => { try { return (typeof _quality !== 'undefined' && _quality.TIERS[_quality.tier]) ? _quality.TIERS[_quality.tier].name : 'normal'; } catch (e) { return 'normal'; } };

    // ── 1. composer ─────────────────────────────────────────────────────────
    const P = { composer: null, renderPass: null, bloom: null, rt: null, failed: false, halfFloat: false, w: 0, h: 0, pr: 1, frames: 0 };
    function postLibsReady() {
        return !!(window.THREE && THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass && THREE.ShaderPass && THREE.CopyShader && THREE.LuminosityHighPassShader);
    }
    function buildComposer(scene, camera) {
        if (P.failed || typeof renderer === 'undefined' || !renderer) return null;
        try {
            const pr = renderer.getPixelRatio(), w = renderer.domElement.clientWidth || window.innerWidth, h = renderer.domElement.clientHeight || window.innerHeight;
            let rt = null;
            try {
                rt = new THREE.WebGLRenderTarget(Math.round(w * pr), Math.round(h * pr), { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
                // Render into the buffer with the renderer's OWN output encoding, so the
                // composed frame matches the plain render (otherwise the scene lands
                // linear and the copy to screen skips the gamma step).
                rt.texture.encoding = renderer.outputEncoding;
                P.halfFloat = true;
            } catch (e) { rt = null; P.halfFloat = false; }
            const composer = rt ? new THREE.EffectComposer(renderer, rt) : new THREE.EffectComposer(renderer);
            const renderPass = new THREE.RenderPass(scene, camera);
            const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(Math.max(1, w / SW_POST.BLOOM_DIV), Math.max(1, h / SW_POST.BLOOM_DIV)), SW_POST.STRENGTH, SW_POST.RADIUS, P.halfFloat ? SW_POST.THRESHOLD : 0.85);
            composer.addPass(renderPass); composer.addPass(bloom);
            composer.setSize(w, h);
            P.composer = composer; P.renderPass = renderPass; P.bloom = bloom; P.rt = rt; P.w = w; P.h = h; P.pr = pr;
            console.log('🌆 synthwave post: bloom composer ready (halfFloat ' + P.halfFloat + ', ' + w + 'x' + h + ' @' + pr + ')');
            return composer;
        } catch (e) { console.warn('synthwave post: composer failed, plain render', e); P.failed = true; return null; }
    }
    function resize() {
        if (!P.composer || typeof renderer === 'undefined') return;
        const pr = renderer.getPixelRatio(), w = renderer.domElement.clientWidth || window.innerWidth, h = renderer.domElement.clientHeight || window.innerHeight;
        if (w === P.w && h === P.h && pr === P.pr) return;
        P.w = w; P.h = h; P.pr = pr;
        P.composer.setSize(w, h);
        if (P.rt) P.rt.setSize(Math.round(w * pr), Math.round(h * pr));
        if (P.bloom && P.bloom.setSize) P.bloom.setSize(w / 2, h / 2);
        E.lineMats.forEach((m) => m.resolution.set(w, h));
    }
    window.addEventListener('resize', () => { try { resize(); } catch (e) {} });

    function postActive() {
        if (!sw('postFx', 'bloom') || P.failed || !postLibsReady() || (window.anaglyphMode && window.anaglyphMode.enabled)) return false;
        // Only in the normal quality tier; a drop below it switches the composer off
        // for TIER_COOLDOWN_MS so the ladder cannot oscillate on the composer's cost.
        const now = Date.now();
        if (tierName() !== 'normal') { P.cooldownUntil = now + SW_POST.TIER_COOLDOWN_MS; return false; }
        return !(P.cooldownUntil && now < P.cooldownUntil);
    }
    function install() {
        const orig = window.gameRender;
        if (typeof orig !== 'function' || orig._swWrapped) return false;
        const wrapped = function (scene, camera) {
            if (!postActive()) return orig(scene, camera);
            if (!P.composer && !buildComposer(scene, camera)) return orig(scene, camera);
            if (P.renderPass.scene !== scene) P.renderPass.scene = scene;
            if (P.renderPass.camera !== camera) P.renderPass.camera = camera;
            if ((P.frames++ & 63) === 0) resize();
            P.composer.render();
        };
        wrapped._swWrapped = true;
        window.gameRender = wrapped;
        return true;
    }

    // ── 2. vector ships: edge lines ─────────────────────────────────────────
    const E = { cache: new Map(), lineMats: [], enemyEdged: new Set(), lastPoll: 0 };
    function linesReady() { return !!(window.THREE && THREE.LineSegmentsGeometry && THREE.LineMaterial && THREE.LineSegments2 && THREE.EdgesGeometry); }
    function hdr(hex) { const c = new THREE.Color(hex); return c.multiplyScalar(SW_POST.HDR_K); }
    function edgeGeomFor(geometry) {
        const key = geometry.uuid;
        let g = E.cache.get(key);
        if (!g) {
            const eg = new THREE.EdgesGeometry(geometry, SW_POST.EDGE_ANGLE);
            g = new THREE.LineSegmentsGeometry().fromEdgesGeometry(eg);
            eg.dispose();
            E.cache.set(key, g);
        }
        return g;
    }
    function vectorize(root, hex, tag) {
        if (!root || !linesReady() || root.userData._swEdges) return 0;
        const mat = new THREE.LineMaterial({ color: 0xffffff, linewidth: SW_POST.EDGE_WIDTH, transparent: true, opacity: SW_POST.EDGE_OPACITY, depthWrite: false });
        mat.color.copy(hdr(hex));
        mat.resolution.set(window.innerWidth, window.innerHeight);
        E.lineMats.push(mat);
        let n = 0;
        root.traverse((o) => {
            if (!o.isMesh || !o.geometry || o.userData.isOrbitEdge || o.userData._swEdgeLine) return;
            if (o.geometry.attributes && o.geometry.attributes.position && o.geometry.attributes.position.count > 20000) return;   // not the big shells
            try {
                const line = new THREE.LineSegments2(edgeGeomFor(o.geometry), mat);
                line.userData._swEdgeLine = true; line.userData.__dbTris = Infinity;
                line.renderOrder = 3; line.frustumCulled = false;
                o.add(line); n++;
            } catch (e) { /* skip this mesh */ }
        });
        root.userData._swEdges = { mat: mat, n: n, tag: tag };
        return n;
    }
    function devectorize(root) {
        const r = root && root.userData._swEdges; if (!r) return;
        root.traverse((o) => { if (o.userData && o.userData._swEdgeLine && o.parent) o.parent.remove(o); });
        const i = E.lineMats.indexOf(r.mat); if (i >= 0) E.lineMats.splice(i, 1);
        r.mat.dispose(); root.userData._swEdges = null;
    }
    function colourFor(u) {
        if (!u) return SW_POST.COL.hostile;
        if (u.isBoss || u.isEliteGuardian || u.isBlackHoleGuardian) return SW_POST.COL.boss;
        if (u.isBossSupport) return SW_POST.COL.support;
        return SW_POST.COL.hostile;
    }
    function poll() {
        if (!sw('vectorShips', 'edges') || !linesReady() || typeof camera === 'undefined') return;
        const now = Date.now(); if (now - E.lastPoll < SW_POST.POLL_MS) return; E.lastPoll = now;
        // player
        const ship = window.cameraState && window.cameraState.playerShipMesh;
        if (ship && !ship.userData._swEdges) vectorize(ship, SW_POST.COL.player, 'player');
        // wingmen
        if (typeof allyShips !== 'undefined' && Array.isArray(allyShips)) allyShips.forEach((a) => { if (a && !a.userData._swEdges) vectorize(a, SW_POST.COL.wingman, 'wingman'); });
        // nearest enemies, bounded
        if (typeof enemies !== 'undefined' && Array.isArray(enemies)) {
            const cp = camera.position, r2 = SW_POST.ENEMY_EDGE_RANGE * SW_POST.ENEMY_EDGE_RANGE;
            const near = [];
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i]; if (!e || !e.userData || !e.position) continue;
                if (!(e.userData.health > 0) || !e.parent) { if (e.userData._swEdges) { devectorize(e); E.enemyEdged.delete(e); } continue; }
                const d2 = e.position.distanceToSquared(cp);
                if (d2 < r2) near.push([d2, e]); else if (e.userData._swEdges) { devectorize(e); E.enemyEdged.delete(e); }
            }
            near.sort((a, b) => a[0] - b[0]);
            for (let i = 0; i < near.length; i++) {
                const e = near[i][1];
                if (i < SW_POST.ENEMY_EDGE_MAX) { if (!e.userData._swEdges) { vectorize(e, colourFor(e.userData), 'enemy'); E.enemyEdged.add(e); } }
                else if (e.userData._swEdges) { devectorize(e); E.enemyEdged.delete(e); }
            }
        }
        // lasers: push their colour over the bloom threshold once
        if (typeof activeLasers !== 'undefined' && Array.isArray(activeLasers)) {
            for (let i = 0; i < activeLasers.length; i++) {
                const L = activeLasers[i];
                [L && L.material, L && L.glowMaterial, L && L.mesh && L.mesh.material].forEach((m) => {
                    if (m && m.color && !m.userData._swHdr) { m.userData._swHdr = true; m.color.multiplyScalar(SW_POST.HDR_K); }
                });
            }
        }
    }

    // ── boot ────────────────────────────────────────────────────────────────
    function tick() { try { if (!install()) { /* gameRender not yet defined */ } poll(); } catch (e) {} }
    setInterval(tick, 300);
    if (typeof window !== 'undefined') {
        window.__postFx = {
            get on() { return !!(P.composer && postActive()); }, get halfFloat() { return P.halfFloat; }, get failed() { return P.failed; },
            set: function (strength, radius, threshold) { if (P.bloom) { if (strength != null) P.bloom.strength = strength; if (radius != null) P.bloom.radius = radius; if (threshold != null) P.bloom.threshold = threshold; } },
            edges: function () { return { lineMaterials: E.lineMats.length, enemies: E.enemyEdged.size, cached: E.cache.size }; },
            resume: function () { P.cooldownUntil = 0; },   // clear the tier cool-down (probes / console)
            get cooldownMs() { return Math.max(0, (P.cooldownUntil || 0) - Date.now()); },
            vectorize: vectorize, devectorize: devectorize
        };
    }
})();
