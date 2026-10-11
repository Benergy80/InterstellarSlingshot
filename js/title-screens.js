// =============================================================================
// TITLE SCREENS — package AG (HYBRID switch `titleScreen`), an exploration.
// Ben, 2026-10-11: "It would be interesting to explore title screens in the
// spirit of the game over screen" + the Captain Power (1987) poster material.
//
//   titleScreen: original   today's launch screen, untouched (this file returns at once)
//                chrome     a chrome-bevelled extruded italic logotype over an
//                           airbrushed blue-violet starfield with a rim-lit planet
//                landscape  the MISSION FAILED beat-line range (SW_LAND) at dawn,
//                           the eclipse rising, the logo slammed in like the death title
//                poster     a composed poster: logo, the XT-7 live in WebGL, the
//                           eight boss hulls as a cast strip along the foot
//
// The overlay is pure decoration over the ORIGINAL launch flow: the game still
// builds #introStartBtn / #introDemoBtn / #skipIntroBtn with their own handlers
// (js/game-intro.js) when its intro is ready; this file only adopts the two
// menu buttons into its layout and restyles them. It is built at script load
// (before world generation) and torn down completely on the first launch —
// rAF cancelled, timers cleared, listeners removed, WebGL contexts released,
// DOM removed. window.hyTitle exposes { mode, active, teardown } for probes.
// Palette and fonts: css/synthwave.css (--sw-*, .hyt-*).
// =============================================================================
(function () {
    'use strict';

    const HY_TITLE = {
        FADE_MS: 480,            // overlay fade-out on launch
        DRIFT_STARS: 170,        // stars that drift (chrome / poster)
        STATIC_STARS: 760,       // stars painted once into the backdrop
        DRIFT_PX_S: 7,           // drift speed of the nearest stars, px/s
        GLITCH_MIN_S: 11,        // landscape: rare tear bursts after the slam
        GLITCH_MAX_S: 19,
        SHIP_MODEL: 'models/XT-7small.glb',
        SHIP_YAW0: -0.75,        // poster: start angle (rad), nose toward the camera's right
        SHIP_SPIN: 0.22,         // poster: rad/s
        SHIP_EMISSIVE: 0.08,     // poster: texture self-light (the hull is white: keep it low or it blows out)
        CAST_W: 200, CAST_H: 120,
        TAGLINE: 'A Gravitational Space Explorer',   // the game's own line (index.html loading screen)
        DAWN: {                  // landscape palette handed to swLandscape (js/synthwave-fx.js)
            sky: [[0, 'rgba(5,3,20,0)'], [0.5, 'rgba(26,12,72,0.40)'], [0.86, 'rgba(70,36,150,0.55)'], [1, 'rgba(110,255,220,0.42)']],
            corona: [[0, 'rgba(255,226,150,0.70)'], [0.28, 'rgba(110,255,220,0.26)'], [0.62, 'rgba(90,60,255,0.12)'], [1, 'rgba(5,3,20,0)']],
            ring: 'rgba(255,246,222,0.98)', ringGlow: '#ffd27a',
            lines: ['#6a4bff', '#19f0ff', '#ffd08a'], cols: '#6a4bff',
            fill: 'rgba(6,4,22,0.97)', horizonLine: 'rgba(170,255,232,0.80)', horizonGlow: '#7bffe0',
            speed: 0.10,
            rise: { from: -1.3, to: 0.62, ms: 6500 }
        }
    };
    if (typeof window !== 'undefined') window.HY_TITLE = HY_TITLE;

    const MODES = ['chrome', 'landscape', 'poster'];
    const mode = (typeof window !== 'undefined' && window.HYBRID && window.HYBRID.get('titleScreen')) || 'original';
    if (MODES.indexOf(mode) < 0 || typeof document === 'undefined' || !document.body) return;

    // ── small helpers ───────────────────────────────────────────────────────
    function rng(seed) {                       // mulberry32: the same sky every load
        let a = seed >>> 0;
        return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
    const timers = [];
    function later(fn, ms) { const id = setTimeout(fn, ms); timers.push(id); return id; }

    // ── the chrome logotype (SVG) ───────────────────────────────────────────
    // Captain Power's logo language: extended italic capitals, a chrome face
    // with a hard horizon line through it (white sky, blue-violet ground), a
    // white bevel stroke, a dark outline and a stepped dark extrusion below,
    // hard highlight / cut lines across the letters, a thin coloured underline.
    let _uid = 0;
    function logoSVG() {
        const id = 'hyl' + (++_uid);
        const L = [{ t: 'INTERSTELLAR', y: 112, size: 98 }, { t: 'SLINGSHOT', y: 262, size: 150 }];
        const txt = (l, a) => '<text x="40" y="' + l.y + '" font-size="' + l.size + '" textLength="920" lengthAdjust="spacingAndGlyphs"' + (a || '') + '>' + l.t + '</text>';
        const both = (a) => txt(L[0], a) + txt(L[1], a);
        const face = (l, i) => '<linearGradient id="' + id + 'f' + i + '" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="' + (l.y - l.size * 0.74) + '" y2="' + l.y + '">' +
            '<stop offset="0" stop-color="#ffffff"/><stop offset="0.34" stop-color="#eef1ff"/><stop offset="0.47" stop-color="#a3afff"/>' +
            '<stop offset="0.50" stop-color="#160b4a"/><stop offset="0.56" stop-color="#26168c"/><stop offset="0.76" stop-color="#5636d8"/>' +
            '<stop offset="0.92" stop-color="#a68fff"/><stop offset="1" stop-color="#ece6ff"/></linearGradient>';
        let ext = '';
        for (let i = 11; i >= 1; i--) ext += '<g transform="translate(' + (i * 0.55).toFixed(2) + ',' + (i * 1.05).toFixed(2) + ')" fill="' + (i > 9 ? '#010208' : 'url(#' + id + 'e)') + '">' + both() + '</g>';
        const cut = (l) => '<rect x="0" y="' + (l.y - l.size * 0.62).toFixed(1) + '" width="1100" height="' + (l.size * 0.028).toFixed(1) + '" fill="#ffffff" opacity="0.85"/>' +
            '<rect x="0" y="' + (l.y - l.size * 0.24).toFixed(1) + '" width="1100" height="' + (l.size * 0.05).toFixed(1) + '" fill="#0b0630" opacity="0.92"/>' +
            '<rect x="0" y="' + (l.y - l.size * 0.13).toFixed(1) + '" width="1100" height="' + (l.size * 0.03).toFixed(1) + '" fill="#0b0630" opacity="0.8"/>';
        return '<svg class="hyt-logo" viewBox="0 0 1060 300" preserveAspectRatio="xMidYMid meet" aria-label="Interstellar Slingshot" role="img">' +
            '<defs>' + face(L[0], 0) + face(L[1], 1) +
            '<linearGradient id="' + id + 'e" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1a1650"/><stop offset="1" stop-color="#05040f"/></linearGradient>' +
            '<linearGradient id="' + id + 'r" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#c9d2ff"/><stop offset="1" stop-color="#7d6bff"/></linearGradient>' +
            '<linearGradient id="' + id + 'u" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#19f0ff" stop-opacity="0"/><stop offset="0.12" stop-color="#19f0ff"/><stop offset="0.55" stop-color="#7b2bff"/><stop offset="0.9" stop-color="#ff2bd6"/><stop offset="1" stop-color="#ff2bd6" stop-opacity="0"/></linearGradient>' +
            '<linearGradient id="' + id + 'g" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>' +
            '<clipPath id="' + id + 'c">' + both() + '</clipPath>' +
            '</defs>' +
            '<g transform="translate(62,0) skewX(-13)" font-family="Orbitron, Audiowide, sans-serif" font-weight="900">' +
            ext +
            '<g fill="#04051a" stroke="#04051a" stroke-width="11" stroke-linejoin="round">' + both() + '</g>' +
            '<g fill="url(#' + id + 'f0)">' + txt(L[0]) + '</g><g fill="url(#' + id + 'f1)">' + txt(L[1]) + '</g>' +
            '<g clip-path="url(#' + id + 'c)">' + cut(L[0]) + cut(L[1]) + '<rect class="hyt-flare" x="-260" y="-20" width="190" height="340" fill="url(#' + id + 'g)"/></g>' +
            '<g fill="none" stroke="url(#' + id + 'r)" stroke-width="2.6" stroke-linejoin="round">' + both() + '</g>' +
            '<rect x="46" y="284" width="930" height="5" fill="url(#' + id + 'u)" class="hyt-uline"/>' +
            '</g>' +
            '<g transform="translate(1000,34)"><g class="hyt-glint"><path d="M0-26 L4-4 L26 0 L4 4 L0 26 L-4 4 L-26 0 L-4-4Z" fill="#ffffff"/><circle r="5" fill="#ffffff"/></g></g>' +
            '</svg>';
    }

    // ── airbrushed backdrop (painted once per size) + drifting stars ───────
    function paintAirbrush(w, h, comp) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'), R = rng(7349), M = Math.max(w, h);
        const base = g.createLinearGradient(0, 0, 0, h);
        base.addColorStop(0, '#01020a'); base.addColorStop(0.42, '#050a2a'); base.addColorStop(0.78, '#110a3a'); base.addColorStop(1, '#1a0b40');
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        const blob = (x, y, r, rgb, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
        blob(w * 0.18, h * 0.22, M * 0.62, '40,70,255', 0.20);
        blob(w * 0.80, h * 0.30, M * 0.55, '123,43,255', 0.20);
        blob(w * 0.55, h * 0.62, M * 0.30, '25,240,255', 0.05);
        (comp.blobs || []).forEach((b) => blob(w * b[0], h * b[1], M * b[2], b[3], b[4]));
        // an airbrushed light shaft from the top right
        g.save(); g.translate(w * 0.86, -h * 0.05); g.rotate(0.62);
        const shaft = g.createLinearGradient(-M * 0.12, 0, M * 0.12, 0);
        shaft.addColorStop(0, 'rgba(140,160,255,0)'); shaft.addColorStop(0.5, 'rgba(160,180,255,0.07)'); shaft.addColorStop(1, 'rgba(140,160,255,0)');
        g.fillStyle = shaft; g.fillRect(-M * 0.12, 0, M * 0.24, M * 1.6); g.restore();
        // static stars
        for (let i = 0; i < HY_TITLE.STATIC_STARS; i++) {
            const x = R() * w, y = R() * h, s = 0.35 + Math.pow(R(), 3) * 1.4, a = 0.25 + R() * 0.75;
            g.fillStyle = R() < 0.18 ? 'rgba(190,200,255,' + a + ')' : 'rgba(255,255,255,' + a + ')';
            g.fillRect(x, y, s, s);
        }
        for (let i = 0; i < 9; i++) {                     // a few bright stars with cross glints
            const x = R() * w, y = R() * h * 0.8, L = 6 + R() * 14;
            g.save(); g.globalAlpha = 0.75; g.strokeStyle = '#dfe6ff'; g.lineWidth = 1;
            g.beginPath(); g.moveTo(x - L, y); g.lineTo(x + L, y); g.moveTo(x, y - L); g.lineTo(x, y + L); g.stroke();
            blob(x, y, L * 0.8, '200,215,255', 0.55); g.restore();
        }
        // the planet: a dark disc with a hard rim light toward the light source
        const P = comp.planet;
        if (P) {
            const px = w * P.x, py = h * P.y, pr = Math.min(w, h) * P.r;
            const lx = P.light[0], ly = P.light[1];
            g.save(); g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2);
            const body = g.createRadialGradient(px + lx * pr * 0.5, py + ly * pr * 0.5, pr * 0.1, px, py, pr);
            body.addColorStop(0, '#111a48'); body.addColorStop(0.7, '#070a26'); body.addColorStop(1, '#03040f');
            g.fillStyle = body; g.fill(); g.restore();
            const rim = document.createElement('canvas'); rim.width = w; rim.height = h;
            const q = rim.getContext('2d');
            const ring = q.createRadialGradient(px, py, pr * 0.84, px, py, pr * 1.16);
            ring.addColorStop(0, 'rgba(120,170,255,0)'); ring.addColorStop(0.36, 'rgba(130,190,255,0.35)');
            ring.addColorStop(0.47, 'rgba(255,255,255,0.98)'); ring.addColorStop(0.53, 'rgba(160,140,255,0.55)'); ring.addColorStop(1, 'rgba(123,43,255,0)');
            q.fillStyle = ring; q.fillRect(0, 0, w, h);
            q.globalCompositeOperation = 'destination-in';     // only the limb that faces the light
            const dir = q.createLinearGradient(px + lx * pr, py + ly * pr, px - lx * pr * 0.35, py - ly * pr * 0.35);
            dir.addColorStop(0, 'rgba(0,0,0,1)'); dir.addColorStop(0.55, 'rgba(0,0,0,0.35)'); dir.addColorStop(1, 'rgba(0,0,0,0)');
            q.fillStyle = dir; q.fillRect(0, 0, w, h);
            g.drawImage(rim, 0, 0);
        }
        return c;
    }
    function makeDrift(w, h) {
        const R = rng(911), s = [];
        for (let i = 0; i < HY_TITLE.DRIFT_STARS; i++) s.push({ x: R() * w, y: R() * h, z: 0.2 + R() * 0.8, p: R() * 6.28 });
        return s;
    }
    function drawDrift(g, stars, w, h, dt, t, pr, disc) {
        const v = HY_TITLE.DRIFT_PX_S * pr * dt;
        for (let i = 0; i < stars.length; i++) {
            const s = stars[i];
            s.x -= v * s.z; s.y += v * s.z * 0.22;
            if (s.x < -2) s.x += w + 4; if (s.y > h + 2) s.y -= h + 4;
            if (disc) { const dx = s.x - disc[0], dy = s.y - disc[1]; if (dx * dx + dy * dy < disc[2]) continue; }   // never in front of the planet
            const a = (0.35 + 0.65 * s.z) * (0.7 + 0.3 * Math.sin(t * (1 + s.z * 2) + s.p));
            g.fillStyle = 'rgba(225,232,255,' + a.toFixed(3) + ')';
            const sz = (0.6 + s.z * 1.3) * pr; g.fillRect(s.x, s.y, sz, sz);
        }
    }

    // ── poster: the XT-7 live, and the boss cast rendered once ─────────────
    // the turnarounds' three-point rig (tools/ortho-render.html), dimmer, with a hard coloured rim from behind
    function rimRig(scene, rimColor, k) {
        k = k || 1;
        scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1030, 0.42 * k));
        const key = new THREE.DirectionalLight(0xffffff, 0.95 * k); key.position.set(3, 5, 4); scene.add(key);
        const fill = new THREE.DirectionalLight(0x8fd3ff, 0.35 * k); fill.position.set(-4, 2, 3); scene.add(fill);
        const rim = new THREE.DirectionalLight(rimColor, 2.2); rim.position.set(-1.5, 2.5, -6); scene.add(rim);
        const rim2 = new THREE.DirectionalLight(rimColor, 1.2); rim2.position.set(5, 0.5, -3); scene.add(rim2);
        const under = new THREE.DirectionalLight(0xff2bd6, 0.35); under.position.set(0, -3, -5); scene.add(under);
    }
    function disposeTree(root) {
        root.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
            ms.forEach((m) => { ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach((k) => { if (m[k]) m[k].dispose(); }); m.dispose(); });
        });
    }
    function fitModel(root) {
        root.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
        const k = 2 / (Math.max(s.x, s.y, s.z) || 1);
        const pivot = new THREE.Group(); root.position.sub(c); pivot.add(root); pivot.scale.setScalar(k);
        return pivot;
    }
    function startShip(canvas, state) {
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return null;
        let renderer;
        try { renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true }); } catch (e) { return null; }
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
        renderer.setClearColor(0x000000, 0);
        const scene = new THREE.Scene(); rimRig(scene, 0x8a7bff);
        const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
        const ship = { renderer: renderer, scene: scene, cam: cam, pivot: null, root: null, t0: 0, w: 0, h: 0 };
        new THREE.GLTFLoader().load(HY_TITLE.SHIP_MODEL, (gltf) => {
            if (!state.active) { disposeTree(gltf.scene); return; }
            const root = gltf.scene;
            root.rotation.y = Math.PI / 2;                // the XT-7's nose is its raw -X; +90 deg puts it on +Z (as in play)
            root.traverse((o) => {
                if (!o.isMesh || !o.material) return;
                (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
                    if (m.map && m.emissive) { m.emissiveMap = m.map; m.emissive.setHex(0xffffff); m.emissiveIntensity = HY_TITLE.SHIP_EMISSIVE; m.needsUpdate = true; }
                });
            });
            ship.root = root; ship.pivot = fitModel(root); scene.add(ship.pivot); ship.t0 = performance.now();
            canvas.classList.add('on');
        }, undefined, () => { /* no ship: the poster still stands */ });
        ship.frame = function (now) {
            const w = canvas.clientWidth, h = canvas.clientHeight;
            if (!w || !h) return;
            if (w !== ship.w || h !== ship.h) { ship.w = w; ship.h = h; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
            const fit = 0.92 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.min(1, cam.aspect * 0.8);
            cam.position.set(0, fit * 0.17, fit); cam.lookAt(0, 0.02, 0);
            if (ship.pivot) {
                const t = (now - ship.t0) / 1000;
                ship.pivot.rotation.set(0.10 + 0.04 * Math.sin(t * 0.6), HY_TITLE.SHIP_YAW0 + t * HY_TITLE.SHIP_SPIN, -0.05 * Math.sin(t * 0.45));
                ship.pivot.position.y = 0.05 * Math.sin(t * 0.8);
            }
            renderer.render(scene, cam);
        };
        ship.dispose = function () {
            if (ship.pivot) { scene.remove(ship.pivot); disposeTree(ship.pivot); }
            renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { /* ok */ }
        };
        return ship;
    }
    const CAST_NAMES = ['Spiral', 'Elliptical', 'Irregular', 'Ring', 'Dwarf', 'Lenticular', 'Quasar', 'Ancient'];
    const CAST_COLORS = [0x4488ff, 0xff8844, 0x88ff44, 0xff4488, 0x44ffff, 0xff44ff, 0xff8888, 0xffaa88];
    function castInfo(i) {                     // the game's own faction table when it is loaded
        try { if (typeof galaxyTypes !== 'undefined' && galaxyTypes[i]) return { name: galaxyTypes[i].name, color: galaxyTypes[i].color }; } catch (e) { /* fallback */ }
        return { name: CAST_NAMES[i], color: CAST_COLORS[i] };
    }
    function renderCast(cards, state) {
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return;
        const W = HY_TITLE.CAST_W, H = HY_TITLE.CAST_H;
        const off = document.createElement('canvas'); off.width = W; off.height = H;
        let r;
        try { r = new THREE.WebGLRenderer({ canvas: off, alpha: true, antialias: true, preserveDrawingBuffer: true }); } catch (e) { return; }
        r.setPixelRatio(1); r.setSize(W, H, false); r.setClearColor(0x000000, 0);
        r.outputEncoding = THREE.sRGBEncoding;
        state.castRenderer = r;
        const loader = new THREE.GLTFLoader();
        let i = 0;
        const done = () => { if (state.castRenderer === r) { r.dispose(); try { r.forceContextLoss(); } catch (e) { /* ok */ } state.castRenderer = null; } };
        const next = () => {
            if (!state.active || i >= cards.length) { done(); return; }
            const idx = i++, info = castInfo(idx), col = new THREE.Color(info.color);
            loader.load('models/Boss' + (idx + 1) + '.glb', (gltf) => {
                if (!state.active) { disposeTree(gltf.scene); done(); return; }
                const scene = new THREE.Scene(); rimRig(scene, info.color, 0.8);
                const root = gltf.scene;
                root.traverse((o) => {          // the game's flat faction look (as the ortho turnarounds' "flat" style)
                    if (!o.isMesh || !o.material) return;
                    const old = o.material; (Array.isArray(old) ? old : [old]).forEach((m) => m.dispose());
                    o.material = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.10, metalness: 0.25, roughness: 0.55, side: THREE.DoubleSide, flatShading: true });
                    try { o.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 22), new THREE.LineBasicMaterial({ color: 0x06080f, transparent: true, opacity: 0.8 }))); } catch (e) { /* edges optional */ }
                });
                const pivot = fitModel(root); scene.add(pivot);
                const noseZ = (idx === 0 || idx === 7) ? 1 : -1;      // Boss1 / Boss8 nose +Z, the rest -Z
                const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
                cam.position.set(3.0, 1.7, 3.7 * noseZ); cam.lookAt(0, 0, 0);
                r.clear(); r.render(scene, cam);
                const g = cards[idx].getContext('2d'); g.clearRect(0, 0, W, H); g.drawImage(off, 0, 0);
                disposeTree(pivot);
                next();
            }, undefined, () => next());
        };
        next();
    }

    // ── build ───────────────────────────────────────────────────────────────
    const state = { mode: mode, active: true, raf: 0, stops: [], listeners: [], ship: null, castRenderer: null, adopted: false, gone: false };
    const root = el('div', 'hyt hyt-' + mode); root.id = 'hyTitle';
    document.body.classList.add('hyt-on', 'hyt-on-' + mode);
    const sub = '<div class="hyt-sub"><span>' + HY_TITLE.TAGLINE + '</span></div>';
    const menu = '<div class="hyt-menu"><div class="hyt-wait"><span class="hyt-wait-k">Pre-flight</span><span class="hyt-wait-bar"><i></i></span><span class="hyt-wait-v"></span></div></div>';
    if (mode === 'chrome') {
        root.innerHTML = '<canvas class="hyt-sky"></canvas><div class="hyt-vig"></div>' +
            '<div class="hyt-stage"><div class="hyt-lockup">' + logoSVG() + sub + '</div>' + menu + '</div>' +
            '<div class="hyt-credit">ChiLab</div>';
    } else if (mode === 'landscape') {
        root.innerHTML = '<canvas class="hyt-stars"></canvas><canvas class="hyt-land"></canvas>' +
            '<div class="sw-vignette"></div><div class="sw-scan"></div>' +
            '<div class="sw-glitch">' + [14, 31, 47, 63, 79].map((p, i) => '<span style="top:' + p + '%;height:' + (4 + (i % 3) * 5) + 'px;animation-delay:' + (i * 23) + 'ms"></span>').join('') + '</div>' +
            '<div class="hyt-stage"><div class="hyt-lockup"><h1 class="sw-title"><span>Interstellar</span><span>Slingshot</span></h1>' +
            '<div class="sw-sub">' + HY_TITLE.TAGLINE + '</div></div>' + menu + '<div class="sw-hint">enter · click · tap</div></div>';
    } else {
        let cast = '';
        for (let i = 0; i < 8; i++) {
            const info = castInfo(i), hex = '#' + ('000000' + info.color.toString(16)).slice(-6);
            cast += '<figure class="hyt-card" style="--c:' + hex + '"><canvas width="' + HY_TITLE.CAST_W + '" height="' + HY_TITLE.CAST_H + '"></canvas><figcaption>' + info.name + '</figcaption></figure>';
        }
        root.innerHTML = '<canvas class="hyt-sky"></canvas><div class="hyt-vig"></div>' +
            '<div class="hyt-poster">' +
            '<header class="hyt-lockup">' + logoSVG() + sub + '</header>' +
            '<div class="hyt-hero"><div class="hyt-halo"></div><canvas class="hyt-ship"></canvas><div class="hyt-ship-tag"><b>XT-7</b> Slingshot interceptor</div></div>' +
            '<aside class="hyt-side">' + menu + '</aside>' +
            '<footer class="hyt-cast"><div class="hyt-cast-k">The warlords of the eight galaxies</div><div class="hyt-cast-row">' + cast + '</div></footer>' +
            '</div>';
    }
    document.body.appendChild(root);
    const menuEl = root.querySelector('.hyt-menu'), waitEl = root.querySelector('.hyt-wait');

    // backdrop
    let sky = null, skyG = null, bg = null, drift = null, bgKey = '', disc = null;
    const COMP = {
        chrome: { planet: { x: 0.10, y: 1.10, r: 0.66, light: [0.62, -0.78] }, blobs: [[0.22, 0.86, 0.35, '255,43,214', 0.07]] },
        poster: { planet: { x: 0.40, y: 1.62, r: 1.05, light: [0.15, -0.99] }, blobs: [[0.40, 0.55, 0.30, '110,90,255', 0.18]] }
    };
    const COMP_MOBILE = {
        chrome: { planet: { x: 0.62, y: 1.16, r: 1.42, light: [-0.30, -0.95] }, blobs: [[0.3, 0.55, 0.4, '255,43,214', 0.08]] },
        poster: { planet: { x: 0.5, y: 1.05, r: 0.95, light: [0.1, -0.99] }, blobs: [[0.5, 0.38, 0.45, '110,90,255', 0.16]] }
    };
    function ensureBackdrop(pr) {
        const w = Math.round(sky.clientWidth * pr), h = Math.round(sky.clientHeight * pr);
        const key = w + 'x' + h;
        if (key === bgKey || !w || !h) return;
        bgKey = key; sky.width = w; sky.height = h;
        const portrait = sky.clientWidth < sky.clientHeight;
        const comp = (portrait ? COMP_MOBILE : COMP)[mode];
        bg = paintAirbrush(w, h, comp);
        drift = makeDrift(w, h);
        const P = comp.planet, rr = Math.min(w, h) * P.r * 1.01;
        disc = [w * P.x, h * P.y, rr * rr];
    }
    if (mode !== 'landscape') { sky = root.querySelector('.hyt-sky'); skyG = sky.getContext('2d'); }

    if (mode === 'landscape') {
        const stars = root.querySelector('.hyt-stars');
        const paintStars = () => {
            const pr = window.devicePixelRatio || 1, w = Math.round(stars.clientWidth * pr), h = Math.round(stars.clientHeight * pr);
            if (!w || !h || (stars.width === w && stars.height === h)) return;
            stars.width = w; stars.height = h;
            const g = stars.getContext('2d'), R = rng(4242);
            for (let i = 0; i < 520; i++) { const y = Math.pow(R(), 1.6) * h * 0.6, a = (0.2 + R() * 0.8) * (1 - y / (h * 0.62)); g.fillStyle = 'rgba(230,236,255,' + a.toFixed(3) + ')'; const s = (0.5 + Math.pow(R(), 4) * 1.6) * pr; g.fillRect(R() * w, y, s, s); }
        };
        paintStars();
        const onResize = () => paintStars();
        window.addEventListener('resize', onResize); state.listeners.push(['resize', onResize, false]);
        if (typeof window.swLandscape === 'function') state.stops.push(window.swLandscape(root.querySelector('.hyt-land'), HY_TITLE.DAWN));
        // the chrome slam lands a beat in, the tear bars with it; then rarely
        const glitch = root.querySelector('.sw-glitch'), title = root.querySelector('.sw-title');
        title.style.visibility = 'hidden';
        later(() => { title.style.visibility = 'visible'; title.classList.add('slam'); glitch.classList.add('on'); }, 380);
        const rare = () => {
            later(() => { glitch.classList.remove('on'); void glitch.offsetWidth; glitch.classList.add('on'); rare(); },
                (HY_TITLE.GLITCH_MIN_S + Math.random() * (HY_TITLE.GLITCH_MAX_S - HY_TITLE.GLITCH_MIN_S)) * 1000);
        };
        rare();
    }
    // poster: the WebGL work starts after the first painted frame, so context creation and
    // shader compiles never hold up first paint
    function startPoster() {
        if (!state.active) return;
        state.ship = startShip(root.querySelector('.hyt-ship'), state);
        renderCast([].slice.call(root.querySelectorAll('.hyt-card canvas')), state);
    }

    // ── the menu: adopt the game's own buttons (same ids, same handlers) ───
    function adopt() {
        const start = document.getElementById('introStartBtn'), demo = document.getElementById('introDemoBtn');
        if (!start || !demo) return false;
        if (start.parentNode !== menuEl) menuEl.appendChild(start);
        if (demo.parentNode !== menuEl) menuEl.appendChild(demo);
        if (waitEl && waitEl.parentNode) waitEl.remove();
        state.adopted = true;
        return true;
    }
    function updateWait() {
        if (!waitEl) return;
        const bar = document.getElementById('loadingBar'), txt = document.getElementById('loadingText');
        const pct = bar ? parseFloat(bar.style.width) || 0 : 0;
        waitEl.querySelector('i').style.width = Math.min(100, pct) + '%';
        waitEl.querySelector('.hyt-wait-v').textContent = pct >= 100 ? 'Stand by' : (txt && txt.textContent ? txt.textContent.replace(/\.+$/, '') : '');
    }

    // ── per-frame (title only) ──────────────────────────────────────────────
    let last = performance.now(), first = true;
    function frame(now) {
        if (!state.active) return;
        if (first) { first = false; window.__hyTitleFirstPaint = Math.round(now); if (mode === 'poster') later(startPoster, 60); }
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const t = now / 1000;
        if (sky) {
            const pr = Math.min(2, window.devicePixelRatio || 1);
            ensureBackdrop(pr);
            if (bg) { skyG.drawImage(bg, 0, 0); drawDrift(skyG, drift, sky.width, sky.height, dt, t, pr, disc); }
        }
        if (state.ship) state.ship.frame(now);
        if (!state.adopted) { if (!adopt()) updateWait(); }
        else if (!document.getElementById('introStartBtn') && !document.getElementById('introDemoBtn')) { teardown('buttons gone'); return; }
        if (typeof gameState !== 'undefined' && gameState && gameState.gameStarted) { teardown('game started'); return; }
        state.raf = requestAnimationFrame(frame);
    }
    state.raf = requestAnimationFrame(frame);

    // any exit from the menu starts the fade (the game's own handlers run as before)
    function onPress(e) {
        const t = e.target;
        if (t && t.closest && t.closest('#introStartBtn, #introDemoBtn, #skipIntroBtn')) teardown(e.type);
    }
    function onKey(e) {
        if ((e.key === 'Enter' || e.key === ' ') && document.getElementById('introStartBtn')) teardown('key');
    }
    window.addEventListener('click', onPress, true); state.listeners.push(['click', onPress, true]);
    window.addEventListener('touchend', onPress, true); state.listeners.push(['touchend', onPress, true]);
    window.addEventListener('keydown', onKey, true); state.listeners.push(['keydown', onKey, true]);

    function teardown(why) {
        if (!state.active) return;
        state.active = false; state.why = why;
        cancelAnimationFrame(state.raf);
        state.listeners.forEach((l) => window.removeEventListener(l[0], l[1], l[2])); state.listeners.length = 0;
        root.classList.add('hyt-out');
        // keep the buttons where they are while the game fades them; the overlay goes with them
        const finish = () => {
            if (state.gone) return; state.gone = true;
            state.stops.forEach((s) => { try { s(); } catch (e) { /* ok */ } }); state.stops.length = 0;
            timers.forEach(clearTimeout); timers.length = 0;
            if (state.ship) { state.ship.dispose(); state.ship = null; }
            if (state.castRenderer) { state.castRenderer.dispose(); try { state.castRenderer.forceContextLoss(); } catch (e) { /* ok */ } state.castRenderer = null; }
            [].slice.call(root.querySelectorAll('#introStartBtn, #introDemoBtn')).forEach((b) => { b.style.display = 'none'; document.body.appendChild(b); });
            root.remove(); bg = null; drift = null;
            document.body.classList.remove('hyt-on', 'hyt-on-' + mode);
        };
        setTimeout(finish, HY_TITLE.FADE_MS);
    }
    window.hyTitle = { mode: mode, get active() { return state.active; }, teardown: () => teardown('api'), state: state };
})();
