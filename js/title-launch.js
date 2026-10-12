// =============================================================================
// THE LAUNCH TITLE — package AH (HYBRID switch `titleScreen: launch`).
// Ben, 2026-10-11, on package AG's three sketches: "maybe landscape-1280x720-4s
// but I think we can do better ... think about what a AAA game would do. I
// cannot even read the menu options. The game starts with blasting off from
// earth." + "landscape-390x844-7s is ok also".
//
// ONE direction, finished: the title IS the first shot of the launch.
//   scene   Earth at dawn from the pad — a real dawn sky (violet zenith, teal,
//           a gold band on the horizon, stars fading into the glow), thin cloud
//           bands drifting, the eclipsed sun rising over the first ~8 s, the
//           beat-line range (window.swLandscape, js/synthwave-fx.js) as the
//           terrain, and the player's XT-7 hovering low at the right third, live
//           in WebGL with its nav lights, strobe and an idle thruster glow.
//   logo    the landscape sketch's chrome logotype + the tagline in its rounded
//           box, slammed in once (one tear-bar glitch), then still.
//   menu    a thin vertical list on a dark glass plate, left-centre (bottom on
//           phones): PRESS TO LAUNCH / DEMO MODE / SKIP INTRO — the game's own
//           #introStartBtn, #introDemoBtn and #skipIntroBtn moved in, ids and
//           handlers intact. One focused item; arrows / W S / Tab move it,
//           Enter / Space activate, hover focuses, taps activate.
//   launch  no cut: the menu and logo slide away, the game's own countdown
//           (#introCountdownOverlay, its timing and text untouched) is drawn in
//           the quiet half of this scene, and the game's 12 s launch phase is
//           flown here — ignition, the ship pitches up and climbs out of frame,
//           the camera tilts after it, the range drops away and flattens, the
//           dawn darkens to space and the stars come up, the sun flares — and
//           this layer is black before the intro's own transition / fade /
//           setupNormalGameContent hand-off (HY_FADE) runs, unchanged.
//           DEMO: the same lift-off, compressed (DEMO_LIFTOFF_MS), then the
//           game's demo handler. SKIP: straight to black, the game's skip as is.
//   attract after ATTRACT_S without input the menu dims and the drift widens.
//
// Off unless titleScreen is 'launch' (this file returns at once otherwise).
// window.hyTitle = { mode, active, teardown, state, perf } for probes.
// Knobs: window.HY_TITLE.LAUNCH (below). Styles: css/synthwave.css (.hyl-*).
// =============================================================================
(function () {
    'use strict';

    const L = {
        FOV: 34,                 // vertical field of view shared by the 2-D layers and the ship camera (deg)
        HORIZON: 0.58,           // horizon height, fraction of the screen (the SW_LAND default)
        DRIFT_DEG: 2,            // idle camera pan amplitude (deg) ...
        DRIFT_S: 12,             // ... crossing from one side to the other in this many seconds
        ROLL_DEG: 0.35,          // idle camera roll amplitude (deg)
        PARALLAX: [1, 1.1, 1.25, 1.6],   // pan multipliers: sky, clouds, range, ship (near layers move more)
        ATTRACT_S: 30,           // seconds without input before the attract state
        ATTRACT_MENU: 0.4,       // menu opacity in the attract state
        ATTRACT_DRIFT_K: 2.2,    // drift amplitude multiplier in the attract state
        RESTORE_MS: 280,         // attract -> menu back (CSS transition)
        SUN_RISE_MS: 8000,       // the eclipse breaks the horizon over this long
        RANGE_SPEED: 0.06,       // beat-line rows per second toward the viewer (very slow)
        STARS: 900,              // stars in the dawn sky
        NIGHT_STARS: 2600,       // stars in the space layer the ascent reveals
        CLOUD_PX_S: 7,           // cloud drift, px/s
        LOGO_AT_MS: 300,         // logo slam (CSS swSlam 520 ms) + the one glitch
        SLIDE_MS: 560,           // menu + logo slide-out on activate (CSS)
        SHIP: {
            X: 0.745, Y: 0.615,          // desktop: hover point, fraction of the screen
            X_PHONE: 0.68, Y_PHONE: 0.592,
            WIDTH: 0.22,                 // projected hull length, fraction of the screen width
            WIDTH_PHONE: 0.34,
            YAW: -0.95,                  // rad: nose toward the camera's left (into the composition)
            ELEV_DEG: 8,                 // camera elevation over the ship
            BOB: 0.045, ROLL_DEG: 1.4,   // idle hover motion
            EMISSIVE: 0.05,              // texture self-light (the hull is white: keep it low)
            EXPOSURE: 0.9,
            PR_MAX: 1.5                  // ship canvas pixel-ratio cap
        },
        THROTTLE: { IDLE: 0.14, COUNT: 0.34, LAUNCH: 1.0 },
        PLUME_LEN: 1.25,         // plume length at full throttle, hull lengths
        LAUNCH: {                // choreography over the game's launch phase, p = 0..1 of its 12 s
            PITCH: [0.02, 0.20], PITCH_DEG: 72,   // the nose comes up
            RISE_K: 52, RISE_POW: 2.2, RISE_T0: 0.045, HOP: 0.28,   // world-unit climb: HOP early, then RISE_K * (p - T0)^POW
            RECEDE_K: 5,         // and away from the camera
            TILT: [0.06, 0.50], HORIZON_END: 0.90,   // the camera pitches up after it until the horizon sits this low (fraction of the screen)
            SQUASH: [0.05, 0.42], SQUASH_MIN: 0.38,   // the range foreshortens as we climb
            SKY: [0.08, 0.45],   // the dawn darkens to space
            STARS: [0.12, 0.50], // the stars come up
            CLOUDS: [0.06, 0.32],
            LIMB: [0.16, 0.42],  // the range gives way to the planet's curved limb, the atmosphere glowing on it
            FLARE: [0.10, 0.22, 0.62],   // the sun flares: rise, peak, decay
            BLACK: [0.66, 0.97]  // and this layer is black before the game's transition phase
        },
        COUNT_SHAKE_S: 3,        // the last seconds of the countdown rumble
        DEMO_LIFTOFF_MS: 2800,   // DEMO MODE: the lift-off, compressed, before the game's demo handler runs
        BLACK_MS: 1200,          // SKIP: to black over this long (the game's own skip fade is 1.2 s)
        HANDOFF_MS: 1400,        // demo / skip: tear down this long after the game's handler ran (its fade is black by then)
        TICK: { F: 1760, MS: 38, GAIN: 0.028 },
        CONFIRM: { F0: 520, F1: 1040, MS: 190, GAIN: 0.07 },
        DAWN: {                  // the beat-line range at dawn (swLandscape palette)
            sky: [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']],          // the sky is our own layer
            corona: [[0, 'rgba(255,214,140,0.78)'], [0.3, 'rgba(255,170,120,0.30)'], [0.62, 'rgba(120,80,255,0.10)'], [1, 'rgba(5,3,20,0)']],
            ring: 'rgba(255,246,222,0.98)', ringGlow: '#ffc96a',
            lines: ['#6a4bff', '#19f0ff', '#ffc27a'], cols: '#6a4bff',
            fill: 'rgba(6,4,20,0.97)', horizonLine: 'rgba(255,214,150,0.85)', horizonGlow: '#ffc27a'
        }
    };
    if (typeof window === 'undefined') return;
    window.HY_TITLE = window.HY_TITLE || {};
    window.HY_TITLE.LAUNCH = L;
    const TAGLINE = window.HY_TITLE.TAGLINE || 'A Gravitational Space Explorer';

    const mode = window.HYBRID && window.HYBRID.get('titleScreen');
    if (mode !== 'launch' || typeof document === 'undefined' || !document.body) return;

    // ── helpers ─────────────────────────────────────────────────────────────
    function rng(seed) {
        let a = seed >>> 0;
        return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    const clamp01 = (x) => x < 0 ? 0 : (x > 1 ? 1 : x);
    const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const timers = [];
    function later(fn, ms) { const id = setTimeout(fn, ms); timers.push(id); return id; }
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const phone = () => window.innerWidth < window.innerHeight || window.innerWidth <= 760;

    // ── build ───────────────────────────────────────────────────────────────
    const state = {
        mode: 'launch', active: true, raf: 0, stops: [], listeners: [], ship: null,
        ready: false, focus: 0, go: null, goT0: 0, lastInput: performance.now(), attract: false,
        passClick: false, gone: false, actx: null, cd: null, liftoffShown: false
    };
    const perf = { n: 0, sum: 0, max: 0, last: 0, avg: 0, draws: 0 };
    const root = document.createElement('div');
    root.id = 'hyTitle'; root.className = 'hyt hyt-launch' + (reduced ? ' hyl-reduced' : '');
    document.body.classList.add('hyt-on', 'hyt-on-launch');
    const item = (k, label, sub) => '<div class="hyl-slot" data-k="' + k + '"><div class="hyl-item hyl-ph"><span class="hyl-k">' + label + '</span>' +
        (sub ? '<span class="hyl-s">' + sub + '</span>' : '') + '</div></div>';
    root.innerHTML =
        '<div class="hyl-world">' +
            '<div class="hyl-skywrap"><canvas class="hyl-sky"></canvas><canvas class="hyl-night"></canvas></div>' +
            '<canvas class="hyl-clouds"></canvas>' +
            '<div class="hyl-landwrap"><canvas class="hyl-land"></canvas><div class="hyl-flare"><i class="hyl-flare-core"></i></div><div class="hyl-limb"></div></div>' +
            '<canvas class="hyl-ship"></canvas>' +
        '</div>' +
        '<div class="hyl-vig"></div>' +
        '<div class="sw-glitch">' + [14, 31, 47, 63, 79].map((p, i) => '<span style="top:' + p + '%;height:' + (4 + (i % 3) * 5) + 'px;animation-delay:' + (i * 23) + 'ms"></span>').join('') + '</div>' +
        '<header class="hyl-lockup"><h1 class="sw-title"><span>Interstellar</span><span>Slingshot</span></h1>' +
            '<div class="hyt-sub"><span>' + TAGLINE + '</span></div></header>' +
        '<nav class="hyl-menu" aria-label="Main menu"><div class="hyl-plate">' +
            '<div class="hyl-items">' + item('launch', 'PRESS TO LAUNCH', 'BEGIN MISSION') + item('demo', 'DEMO MODE', 'AUTOPILOT SHOWCASE') + item('skip', 'Skip Intro', null) + '</div>' +
            '<div class="hyl-prep" role="status"><span class="hyl-prep-bar"><i></i></span><span class="hyl-prep-t">Preparing launch systems…</span></div>' +
            '<div class="hyl-keys"><span>↑ ↓ Select</span><span>Enter Confirm</span></div>' +
        '</div></nav>' +
        '<div class="hyl-credit">ChiLab</div><div class="hyl-build">Build ' + String(window.BUILD_TAG || '') + '</div>' +
        '<div class="hyl-black"></div>';
    document.body.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const world = $('.hyl-world'), skyWrap = $('.hyl-skywrap'), skyC = $('.hyl-sky'), nightC = $('.hyl-night');
    const cloudC = $('.hyl-clouds'), landWrap = $('.hyl-landwrap'), landC = $('.hyl-land'), flare = $('.hyl-flare'), limb = $('.hyl-limb');
    const shipC = $('.hyl-ship'), black = $('.hyl-black');
    const prepBar = $('.hyl-prep-bar i'), prepT = $('.hyl-prep-t');

    // ── the sky: dawn (painted once per size) and the space it becomes ──────
    // Both canvases span 190% of the height (top -90%) so the ascent's tilt can
    // reveal the zenith; the horizon sits at (0.9 + HORIZON) / 1.9 of them.
    let skyKey = '';
    function paintSky() {
        const W = Math.round(skyWrap.clientWidth), H = Math.round(skyWrap.clientHeight);
        const key = W + 'x' + H;
        if (!W || !H || key === skyKey) return;
        skyKey = key;
        const hz = (0.9 + L.HORIZON) / 1.9;                 // horizon, fraction of the canvas height
        const top = 0.9 / 1.9;                              // the screen's top edge at rest
        // dawn
        skyC.width = W; skyC.height = H;
        let g = skyC.getContext('2d');
        let gr = g.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, '#000003'); gr.addColorStop(top * 0.55, '#02010a');
        gr.addColorStop(top, '#0a0626'); gr.addColorStop(top + (hz - top) * 0.42, '#1b0e4c');
        gr.addColorStop(top + (hz - top) * 0.70, '#2a1d6a'); gr.addColorStop(top + (hz - top) * 0.86, '#1d4f7a');
        gr.addColorStop(hz - 0.012, '#3f9a92'); gr.addColorStop(hz - 0.004, '#ffcf7a'); gr.addColorStop(hz, '#ffe2a8');
        gr.addColorStop(hz + 0.01, '#2a1236'); gr.addColorStop(1, '#07040f');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        // the dawn glow: wide gold-to-rose bloom on the horizon behind the sun
        const hy = H * hz, cx = W * 0.5;
        g.save(); g.translate(cx, hy); g.scale(3.2, 1);
        let rg = g.createRadialGradient(0, 0, 0, 0, 0, H * 0.22);
        rg.addColorStop(0, 'rgba(255,196,120,0.55)'); rg.addColorStop(0.35, 'rgba(255,120,140,0.20)'); rg.addColorStop(1, 'rgba(120,60,200,0)');
        g.fillStyle = rg; g.fillRect(-H * 0.22, -H * 0.22, H * 0.44, H * 0.44); g.restore();
        // stars, fading out toward the glow
        const R = rng(5150);
        for (let i = 0; i < L.STARS; i++) {
            const y = Math.pow(R(), 0.8) * hz * H, x = R() * W;
            const fade = 1 - smooth(top + (hz - top) * 0.35, hz - 0.02, y / H);
            const a = (0.25 + R() * 0.75) * fade;
            if (a < 0.03) continue;
            const s = 0.6 + Math.pow(R(), 4) * 1.6;
            g.fillStyle = (R() < 0.15 ? 'rgba(200,210,255,' : 'rgba(255,255,255,') + a.toFixed(3) + ')';
            g.fillRect(x, y, s, s);
        }
        // space: black, dense stars to the horizon, a faint galactic band
        nightC.width = W; nightC.height = H;
        g = nightC.getContext('2d');
        gr = g.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, '#000002'); gr.addColorStop(hz, '#04030c'); gr.addColorStop(1, '#020107');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.save(); g.translate(W * 0.5, H * (top + 0.06)); g.rotate(-0.42); g.scale(1, 0.12);
        rg = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.6);
        rg.addColorStop(0, 'rgba(150,140,255,0.16)'); rg.addColorStop(0.5, 'rgba(90,70,200,0.06)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.fillRect(-W * 0.6, -W * 0.6, W * 1.2, W * 1.2); g.restore();
        const R2 = rng(77);
        for (let i = 0; i < L.NIGHT_STARS; i++) {
            const a = 0.25 + R2() * 0.75, s = 0.6 + Math.pow(R2(), 5) * 2.2;
            g.fillStyle = (R2() < 0.2 ? 'rgba(190,205,255,' : 'rgba(255,255,255,') + a.toFixed(3) + ')';
            g.fillRect(R2() * W, R2() * H, s, s);
        }
    }

    // ── cloud bands (painted once per size, tiled twice so they can scroll) ─
    let cloudKey = '', cloudW = 0;
    function paintClouds() {
        const W = Math.round(window.innerWidth * 1.24), H = Math.round(window.innerHeight);
        const key = W + 'x' + H;
        if (!W || !H || key === cloudKey) return;
        cloudKey = key; cloudW = W;
        cloudC.width = W * 2; cloudC.height = H;
        cloudC.style.width = (W * 2) + 'px'; cloudC.style.height = H + 'px';
        const g = cloudC.getContext('2d'), R = rng(2026);
        const hy = H * L.HORIZON;
        const bands = phone() ? [[0.80, 0.010], [0.86, 0.008], [0.92, 0.007], [0.70, 0.006]] : [[0.78, 0.012], [0.86, 0.010], [0.92, 0.008], [0.66, 0.007], [0.55, 0.005]];
        bands.forEach((b, bi) => {
            const y0 = hy * b[0], th = H * b[1];
            for (let k = 0; k < 26; k++) {
                const x = R() * W, len = W * (0.10 + R() * 0.22), yy = y0 + (R() - 0.5) * th * 3;
                const glow = 1 - Math.abs(x + len / 2 - W / 2) / (W * 0.7);      // brighter near the sun
                for (let rep = 0; rep < 2; rep++) {                              // tile: the same strip twice
                    const ox = x + rep * W;
                    g.save(); g.translate(ox + len / 2, yy); g.scale(len / (th * 2), 1);
                    const rg = g.createRadialGradient(0, 0, 0, 0, 0, th);
                    rg.addColorStop(0, 'rgba(60,32,96,' + (0.42 - bi * 0.05).toFixed(2) + ')'); rg.addColorStop(1, 'rgba(40,20,80,0)');
                    g.fillStyle = rg; g.fillRect(-th, -th, th * 2, th * 2); g.restore();
                    // the sunlit underside
                    g.save(); g.translate(ox + len / 2, yy + th * 0.45); g.scale(len / (th * 2.4), 0.45);
                    const ug = g.createRadialGradient(0, 0, 0, 0, 0, th);
                    ug.addColorStop(0, 'rgba(255,170,120,' + (0.10 + 0.32 * Math.max(0, glow)).toFixed(2) + ')'); ug.addColorStop(1, 'rgba(255,140,120,0)');
                    g.fillStyle = ug; g.fillRect(-th, -th, th * 2, th * 2); g.restore();
                }
            }
        });
    }

    // ── the range (SW_LAND, driven from our tick) ───────────────────────────
    const view = { horizon: L.HORIZON, squash: 1, alpha: 1, ground: 1, sun: null };
    let land = null;
    if (typeof window.swLandscape === 'function') {
        land = window.swLandscape(landC, Object.assign({}, L.DAWN, {
            speed: L.RANGE_SPEED, manual: true, view: view,
            pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
            rise: { from: -1.3, to: 0.62, ms: reduced ? 1 : L.SUN_RISE_MS }
        }));
        state.stops.push(land);
    }

    // ── the ship: the XT-7 live in WebGL, nav lights, plume, pad glow ───────
    function glowTex(stops) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        stops.forEach((s) => rg.addColorStop(s[0], s[1])); g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
        const t = new THREE.CanvasTexture(c); return t;
    }
    function plumeTex() {
        const c = document.createElement('canvas'); c.width = 64; c.height = 256;
        const g = c.getContext('2d');
        for (let y = 0; y < 256; y++) {                       // top row = the nozzle
            const v = y / 255, a = Math.pow(1 - v, 1.6);
            const r = 255, gg = Math.round(255 - 150 * Math.min(1, v * 1.6)), b = Math.round(255 - 235 * Math.min(1, v * 2.4));
            const hg = g.createLinearGradient(0, 0, 64, 0);
            const w = 0.5 - 0.42 * (1 - v * 0.6);             // the core narrows toward the tail
            hg.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
            hg.addColorStop(Math.max(0.01, w), 'rgba(' + r + ',' + gg + ',' + b + ',' + (a * 0.35).toFixed(3) + ')');
            hg.addColorStop(0.5, 'rgba(' + r + ',' + gg + ',' + b + ',' + a.toFixed(3) + ')');
            hg.addColorStop(Math.min(0.99, 1 - w), 'rgba(' + r + ',' + gg + ',' + b + ',' + (a * 0.35).toFixed(3) + ')');
            hg.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
            g.fillStyle = hg; g.fillRect(0, y, 64, 1);
        }
        return new THREE.CanvasTexture(c);
    }
    function padTex() {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const g = c.getContext('2d');
        let rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        rg.addColorStop(0, 'rgba(255,190,110,1)'); rg.addColorStop(0.25, 'rgba(255,150,80,0.55)'); rg.addColorStop(0.6, 'rgba(255,110,90,0.14)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(120,255,230,0.55)'; g.lineWidth = 3;                    // the pad ring
        g.beginPath(); g.arc(128, 128, 92, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = 'rgba(120,255,230,0.25)'; g.lineWidth = 2; g.setLineDash([10, 14]);
        g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
        return new THREE.CanvasTexture(c);
    }
    function disposeTree(o3) {
        o3.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
            ms.forEach((m) => { ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach((k) => { if (m[k]) m[k].dispose(); }); m.dispose(); });
        });
    }
    function startShip() {
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return null;
        let renderer;
        try { renderer = new THREE.WebGLRenderer({ canvas: shipC, alpha: true, antialias: true, powerPreference: 'low-power' }); } catch (e) { return null; }
        renderer.setPixelRatio(Math.min(L.SHIP.PR_MAX, window.devicePixelRatio || 1));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = L.SHIP.EXPOSURE;
        renderer.setClearColor(0x000000, 0);
        const scene = new THREE.Scene();
        // the dawn rig: violet sky above, the range's dark below, a low gold sun
        // behind-left (where the eclipse sits on screen), a cool front fill
        scene.add(new THREE.HemisphereLight(0x8a7cff, 0x120a24, 0.45));
        const sun = new THREE.DirectionalLight(0xffb866, 3.2); sun.position.set(-3.5, 0.9, -5); scene.add(sun);
        const fill = new THREE.DirectionalLight(0x9fd8ff, 0.55); fill.position.set(-2, 2.5, 5); scene.add(fill);
        const key = new THREE.DirectionalLight(0xffffff, 0.45); key.position.set(4, 4, 3); scene.add(key);
        const under = new THREE.PointLight(0xffa060, 0, 4, 2); under.position.set(0, -0.9, 0); scene.add(under);
        const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
        const ship = { renderer, scene, cam, group: null, fx: null, plumes: [], lights: [], pad: null, under, w: 0, h: 0, half: null, len: 2, out: false };
        const name = (window.HYBRID && window.HYBRID.get('playerModel')) || 'XT-7small';
        const yawDeg = name === 'Player' ? 0 : (Number(window.HYBRID && window.HYBRID.get('playerModelYaw')) || 0);
        new THREE.GLTFLoader().load('models/' + name + '.glb?v=' + (window.BUILD_TAG || 'v1'), (gltf) => {
            if (!state.active) { disposeTree(gltf.scene); return; }
            const model = gltf.scene;
            model.rotation.y = yawDeg * Math.PI / 180;            // the game's bake: the XT-7's nose (raw -X) to +Z
            model.traverse((o) => {
                if (!o.isMesh || !o.material) return;
                (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
                    if (m.map && m.emissive) { m.emissiveMap = m.map; m.emissive.setHex(0xffffff); m.emissiveIntensity = L.SHIP.EMISSIVE; m.needsUpdate = true; }
                });
            });
            model.updateWorldMatrix(true, true);
            const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
            const k = 2 / (Math.max(s.x, s.y, s.z) || 1);
            const body = new THREE.Group(); model.position.sub(c); body.add(model); body.scale.setScalar(k);
            const group = new THREE.Group(); group.rotation.order = 'YXZ'; group.add(body);
            const half = s.clone().multiplyScalar(k / 2);            // the hull's half-extents in group space (nose +Z, port +X)
            ship.half = half; ship.len = s.z * k;
            const at = (p) => new THREE.Vector3(p.x * half.x, p.y * half.y, p.z * half.z);
            const pts = (window.HY_HULL_POINTS && (window.HY_HULL_POINTS[name] || window.HY_HULL_POINTS['XT-7small'])) || null;
            // plumes: two crossed additive planes per nozzle, along -Z
            const pt = plumeTex(), nozzles = (pts && pts.thrusters && pts.thrusters.length && pts.thrusters[0].x != null) ? pts.thrusters : [{ x: -0.2, y: 0.56, z: -0.95 }, { x: 0.2, y: 0.56, z: -0.95 }];
            const pmat = new THREE.MeshBasicMaterial({ map: pt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffffff });
            pmat.toneMapped = false;
            const pgeo = new THREE.PlaneGeometry(1, 1); pgeo.translate(0, -0.5, 0); pgeo.rotateX(Math.PI / 2);
            const pgeo2 = pgeo.clone(); pgeo2.rotateZ(Math.PI / 2);
            const coreTex = glowTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,220,170,0.75)'], [0.6, 'rgba(255,140,60,0.2)'], [1, 'rgba(0,0,0,0)']]);
            nozzles.forEach((n) => {
                const pg = new THREE.Group(); pg.position.copy(at(n));
                pg.add(new THREE.Mesh(pgeo, pmat)); pg.add(new THREE.Mesh(pgeo2, pmat));
                const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: coreTex, color: 0xffb070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
                core.material.toneMapped = false; core.position.copy(pg.position);
                group.add(pg); group.add(core);
                ship.plumes.push({ g: pg, core });
            });
            // nav lights (package AE's hull-light table and colours)
            const KC = { port: 0xff2a1a, starboard: 0x22ff55, strobe: 0xffffff, cockpit: 0xa8eeff, throat: 0xff8a2a, panel: 0xff4030 };
            const lt = glowTex([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.8)'], [0.5, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
            const list = (pts && pts.lights) || [];
            list.forEach((l, i) => {
                const m = new THREE.SpriteMaterial({ map: lt, color: l.color || KC[l.kind] || 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
                m.toneMapped = false;
                const sp = new THREE.Sprite(m);
                const p = at(l); p.add(p.clone().normalize().multiplyScalar(0.02));   // just proud of the skin
                sp.position.copy(p);
                const sz = (l.size || 0.1) * half.x * 2 * (l.kind === 'cockpit' ? 0.55 : 0.9); sp.scale.set(sz, sz, 1);
                sp.userData = { kind: l.kind, base: sz, i };
                group.add(sp); ship.lights.push(sp);
            });
            // the pad glow under the hover point (horizontal, drawn in perspective)
            const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: padTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 }));
            pad.material.toneMapped = false; pad.rotation.x = -Math.PI / 2; pad.position.y = -half.y - 0.42;
            scene.add(pad); ship.pad = pad;
            scene.add(group); ship.group = group;
            shipC.classList.add('on');
        }, undefined, () => { /* no ship: the title still stands */ });
        ship.dispose = function () {
            scene.traverse((o) => { if (o.material && o.material.map) o.material.map.dispose(); });
            disposeTree(scene);
            renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { /* ok */ }
        };
        return ship;
    }
    // per-frame ship pose + render. s = { throttle, pitch, rise, recede, tilt, pan, roll, shake, t }
    function shipFrame(s) {
        const ship = state.ship;
        if (!ship) return;
        const W = window.innerWidth, H = window.innerHeight;
        const r = ship.renderer, cam = ship.cam;
        if (W !== ship.w || H !== ship.h) {
            ship.w = W; ship.h = H; r.setSize(W, H, false);
            const tanF = 2 * Math.tan(L.FOV * Math.PI / 360);        // the full virtual frame is 2W x 2H around the hover point
            cam.fov = 2 * Math.atan(tanF) * 180 / Math.PI; cam.aspect = W / H;
        }
        if (!ship.group) { r.clear(); return; }
        if (ship.out) return;                                       // climbed out of the frame: nothing left to draw
        const ph = phone(), sx = ph ? L.SHIP.X_PHONE : L.SHIP.X, sy = ph ? L.SHIP.Y_PHONE : L.SHIP.Y;
        cam.setViewOffset(2 * W, 2 * H, W - sx * W, H - sy * H, W, H);
        const f = (H / 2) / Math.tan(L.FOV * Math.PI / 360);
        const wf = ph ? L.SHIP.WIDTH_PHONE : L.SHIP.WIDTH;
        const D = (ship.len * 0.95) * f / (wf * W);
        const el = L.SHIP.ELEV_DEG * Math.PI / 180;
        cam.position.set(-s.pan * D * 0.35, D * Math.sin(el), D * Math.cos(el));
        cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
        cam.rotateY(s.pan); cam.rotateX(s.tilt); cam.rotateZ(s.roll + (s.shake ? (Math.random() - 0.5) * 0.004 * s.shake : 0));
        cam.updateMatrixWorld();
        const g = ship.group, t = s.t;
        g.rotation.y = L.SHIP.YAW;
        g.rotation.x = -s.pitch + 0.03 * Math.sin(t * 0.7);
        g.rotation.z = (L.SHIP.ROLL_DEG * Math.PI / 180) * Math.sin(t * 0.55);
        g.position.set(0, L.SHIP.BOB * Math.sin(t * 0.9) * (1 - clamp01(s.rise)) + s.rise, -s.recede);
        // plume + throat glow follow the throttle (with a flicker)
        const thr = s.throttle * (1 + 0.08 * Math.sin(t * 37) + 0.05 * Math.sin(t * 61));
        const len = ship.len * L.PLUME_LEN * Math.max(0.05, thr), wid = ship.half.x * (0.13 + 0.10 * Math.min(1, thr));
        ship.plumes.forEach((p) => {
            p.g.scale.set(wid, wid, len); p.g.visible = thr > 0.02;
            const cs = ship.half.x * (0.22 + 0.55 * Math.min(1.2, thr)); p.core.scale.set(cs, cs, 1);
        });
        const nowMs = performance.now(), phs = (nowMs % 1000) / 1000;
        const strobe = (phs < 0.05 || (phs > 0.13 && phs < 0.18)) ? 1 : 0;
        ship.lights.forEach((sp) => {
            const k = sp.userData.kind; let a = 1;
            if (k === 'strobe') a = strobe * 1.2;
            else if (k === 'throat') a = 0.25 + 0.9 * Math.min(1, thr);
            else if (k === 'cockpit') a = 0.6;
            else if (k === 'panel') a = 0.6 + 0.15 * Math.sin(nowMs * 0.002 + sp.userData.i * 1.7);
            else a = (k === 'port' || k === 'starboard') ? (0.75 + 0.25 * (Math.sin(nowMs * 0.0042) > 0 ? 1 : 0)) : 1;   // nav lights: a slow blink
            sp.material.opacity = Math.min(1, a); sp.visible = a > 0.01;
        });
        // the pad lights up under the burn, then falls away with the ground
        ship.pad.material.opacity = Math.min(1, 0.32 + 0.9 * Math.min(1, thr)) * (1 - smooth(0.6, 3.0, s.rise));
        ship.under.intensity = 1.6 * Math.min(1, thr) * (1 - smooth(0.3, 2.0, s.rise));
        r.render(ship.scene, cam);
        perf.draws = r.info.render.calls;
        // out of frame? (the hull and its plume are above the top edge)
        if (s.rise > 3) {
            const v = new THREE.Vector3(0, s.rise - ship.len * 1.6, -s.recede).project(cam);
            if (v.y > 1.05) { ship.out = true; r.clear(); }
        }
    }

    // ── the menu: adopt the game's buttons (same ids, same handlers) ───────
    const KEYS = { launch: 'introStartBtn', demo: 'introDemoBtn', skip: 'skipIntroBtn' };
    const MARKUP = {
        launch: '<span class="hyl-k">PRESS TO LAUNCH</span><span class="hyl-s">BEGIN MISSION</span>',      // the game's own words, as it wrote them
        demo: '<span class="hyl-k">DEMO MODE</span><span class="hyl-s">AUTOPILOT SHOWCASE</span>',
        skip: '<span class="hyl-k">Skip Intro</span>'
    };
    const adopted = {};
    function adopt() {
        if (state.go) return;
        Object.keys(KEYS).forEach((k) => {
            const b = document.getElementById(KEYS[k]);
            if (!b || adopted[k] === b) return;
            const slot = root.querySelector('.hyl-slot[data-k="' + k + '"]');
            b.removeAttribute('style');                    // the game's inline layout (demo / phone skip carry !important rules)
            b.className = 'hyl-item hyl-btn';
            b.innerHTML = MARKUP[k];
            b.setAttribute('tabindex', '-1');              // focus is ours (one focused item, keyboard below)
            b.dataset.k = k;
            slot.innerHTML = ''; slot.appendChild(b);
            const enter = () => { if (state.ready && !state.go) setFocus(order().indexOf(b), true); };
            b.addEventListener('pointerenter', enter);
            adopted[k] = b;
        });
        const ready = !!(adopted.launch && adopted.demo && adopted.launch.isConnected && adopted.demo.isConnected);
        if (ready && !state.ready) {
            state.ready = true; root.classList.add('hyl-ready');
            setFocus(0, false);
        }
    }
    function order() { return ['launch', 'demo', 'skip'].map((k) => adopted[k]).filter((b) => b && b.isConnected); }
    function setFocus(i, sound) {
        const items = order();
        if (!items.length) return;
        i = ((i % items.length) + items.length) % items.length;
        const changed = i !== state.focus || !items[i].classList.contains('is-focus');
        state.focus = i;
        items.forEach((b, j) => { b.classList.toggle('is-focus', j === i); b.setAttribute('aria-current', j === i ? 'true' : 'false'); });
        if (changed && sound) tick();
    }
    function updatePrep() {
        if (state.ready) return;
        const bar = document.getElementById('loadingBar'), txt = document.getElementById('loadingText');
        const pct = bar ? parseFloat(bar.style.width) || 0 : 0;
        prepBar.style.width = Math.min(100, Math.max(4, pct)) + '%';
        if (txt && txt.textContent && pct < 100 && pct > 0) prepT.textContent = 'Preparing launch systems… ' + Math.round(pct) + '%';
        else prepT.textContent = 'Preparing launch systems…';
    }

    // ── sound: a soft tick on focus, a confirm on activate ──────────────────
    function audio(create) {
        if (state.actx || !create) return state.actx;
        try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) state.actx = new AC(); } catch (e) { state.actx = null; }
        return state.actx;
    }
    function tone(f0, f1, ms, gain, type) {
        const a = state.actx;
        if (!a) return;
        try {
            if (a.state === 'suspended') a.resume();
            const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
            o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t);
            if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + ms / 1000 * 0.6);
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
            o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (e) { /* ok */ } };
        } catch (e) { /* audio is decoration */ }
    }
    function tick() { tone(L.TICK.F, L.TICK.F, L.TICK.MS, L.TICK.GAIN, 'sine'); }
    function confirmSound() { tone(L.CONFIRM.F0, L.CONFIRM.F1, L.CONFIRM.MS, L.CONFIRM.GAIN, 'triangle'); }

    // ── activation ──────────────────────────────────────────────────────────
    function clickThrough(b) {
        if (!b || !b.isConnected) return;
        state.passClick = true;
        try { b.click(); } finally { state.passClick = false; }
    }
    function activate(k, viaKey, ev) {
        if (state.go || !state.ready) { if (ev) { ev.preventDefault(); ev.stopImmediatePropagation(); } return; }
        const b = adopted[k];
        state.go = k; state.goT0 = performance.now();
        root.classList.add('hyl-go', 'hyl-go-' + k); root.classList.remove('hyl-attract');
        confirmSound();
        if (k === 'launch') {
            if (viaKey) clickThrough(b);                 // pointer: the event carries on to the game's handler
        } else if (k === 'demo') {
            if (ev) { ev.preventDefault(); ev.stopImmediatePropagation(); }
            later(() => clickThrough(b), L.DEMO_LIFTOFF_MS);    // the game's demo handler, after the lift-off
            later(() => teardown('demo'), L.DEMO_LIFTOFF_MS + L.HANDOFF_MS);
        } else {
            if (viaKey) clickThrough(b);
            black.style.transition = 'opacity ' + L.BLACK_MS + 'ms ease-out';
            black.style.opacity = '1';
            later(() => teardown('skip'), L.HANDOFF_MS);
        }
    }
    function noteInput() {
        state.lastInput = performance.now();
        if (state.attract) { state.attract = false; root.classList.remove('hyl-attract'); }
    }
    function onKey(e) {
        if (!state.active) return;
        noteInput();
        audio(true);
        if (state.go) return;
        const k = e.key;
        let d = 0;
        if (k === 'ArrowDown' || k === 's' || k === 'S' || (k === 'Tab' && !e.shiftKey)) d = 1;
        else if (k === 'ArrowUp' || k === 'w' || k === 'W' || (k === 'Tab' && e.shiftKey)) d = -1;
        if (d) {
            e.preventDefault(); e.stopPropagation();
            if (state.ready) setFocus(state.focus + d, true);
            return;
        }
        if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
            e.preventDefault(); e.stopPropagation();
            if (!state.ready) return;
            const b = order()[state.focus];
            if (b) activate(b.dataset.k, true, null);
        }
    }
    function onClick(e) {
        if (!state.active || state.passClick) return;
        const t = e.target && e.target.closest ? e.target.closest('.hyl-btn') : null;
        if (!t || !root.contains(t)) return;
        activate(t.dataset.k, false, e);
    }
    function onAny() { if (state.active) { noteInput(); } }
    function onGesture() { if (state.active) { noteInput(); audio(true); } }
    const listen = (type, fn, cap) => { window.addEventListener(type, fn, cap); state.listeners.push([type, fn, cap]); };
    listen('keydown', onKey, true);
    listen('click', onClick, true);
    listen('pointermove', onAny, true);
    listen('wheel', onAny, true);
    listen('pointerdown', onGesture, true);
    listen('touchstart', onGesture, true);

    // the countdown: the game's overlay drawn into this scene (classes only — it stays where the game put it)
    function claimCountdown() {
        const o = document.getElementById('introCountdownOverlay');
        if (!o || state.cd === o) return;
        state.cd = o; o.classList.add('hyl-cdx', 'hyl-cd-top');
    }

    // ── per-frame ───────────────────────────────────────────────────────────
    let first = true, last = performance.now(), cloudX = 0, pan = 0, ampK = 1, liftT = -1;
    const T0 = performance.now();
    function frame(now) {
        if (!state.active) return;
        if (state.frozen) { state.raf = requestAnimationFrame(frame); return; }   // probes: hold the picture still to sample it
        const tStart = performance.now();
        if (first) {
            first = false; window.__hyTitleFirstPaint = Math.round(now);
            later(() => { if (state.active) state.ship = startShip(); }, 60);
            later(() => {                                   // the logo slam + the one glitch
                const t = $('.sw-title'), gl = $('.sw-glitch');
                t.classList.add('slam'); root.classList.add('hyl-logo-in');
                if (!reduced) gl.classList.add('on');
            }, L.LOGO_AT_MS);
        }
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const t = (now - T0) / 1000;
        paintSky(); paintClouds();
        if (!state.ready) { adopt(); updatePrep(); }
        else if (!state.go) adopt();
        // attract
        if (!state.go && state.ready && !state.attract && now - state.lastInput > L.ATTRACT_S * 1000) { state.attract = true; root.classList.add('hyl-attract'); }
        // where are we in the launch?
        const IS = (typeof introSequence !== 'undefined') ? introSequence : null;
        let cd = -1, lp = -1;
        if (state.go === 'launch' && IS) {
            claimCountdown();
            if (IS.phase === 'countdown') cd = clamp01((Date.now() - IS.phaseStartTime) / IS.duration.countdown);
            else if (IS.phase === 'launch') { cd = 1; lp = clamp01((Date.now() - IS.phaseStartTime) / IS.duration.launch); }
            else if (IS.phase === 'transition' || IS.phase === 'complete') { teardown('transition'); return; }
        } else if (state.go === 'demo') {
            cd = 1; lp = clamp01((now - state.goT0) / L.DEMO_LIFTOFF_MS);
        }
        if (typeof gameState !== 'undefined' && gameState && gameState.gameStarted && state.go !== 'demo' && state.go !== 'skip') { teardown('game started'); return; }
        // choreography
        const C = L.LAUNCH, H = window.innerHeight;
        const f = (H / 2) / Math.tan(L.FOV * Math.PI / 360);
        const launching = lp >= 0;
        if (launching && !state.liftoffShown) { state.liftoffShown = true; if (state.cd && !reduced) { state.cd.classList.add('hyl-liftoff'); later(() => state.cd && state.cd.classList.remove('hyl-liftoff'), 1400); } }
        const pitch = launching ? smooth(C.PITCH[0], C.PITCH[1], lp) * C.PITCH_DEG * Math.PI / 180 : 0;
        const rise = launching ? C.HOP * smooth(0, C.RISE_T0 + 0.02, lp) + C.RISE_K * Math.pow(Math.max(0, lp - C.RISE_T0), C.RISE_POW) : 0;
        const recede = launching ? C.RECEDE_K * Math.pow(Math.max(0, lp - C.RISE_T0), 1.5) : 0;
        const tiltMax = Math.atan((C.HORIZON_END - L.HORIZON) * H / f);
        const tilt = launching ? smooth(C.TILT[0], C.TILT[1], lp) * tiltMax : 0;
        const tiltPx = f * Math.tan(tilt);
        let throttle = L.THROTTLE.IDLE;
        if (cd >= 0 && !launching) throttle = L.THROTTLE.IDLE + (L.THROTTLE.COUNT - L.THROTTLE.IDLE) * cd * cd;
        if (launching) throttle = L.THROTTLE.LAUNCH * (0.6 + 0.4 * smooth(0, 0.04, lp)) * (1 + 0.25 * smooth(0, 0.05, lp) * (1 - smooth(0.05, 0.2, lp)));
        let shake = 0;
        if (!reduced) {
            if (cd >= 0 && !launching && IS) shake = 0.35 * smooth(1 - L.COUNT_SHAKE_S * 1000 / IS.duration.countdown, 1, cd);
            if (launching) shake = 1.0 - 0.75 * smooth(0.05, 0.5, lp);
        }
        // idle drift (pan + a hint of roll); wider in the attract state; none for reduced motion
        ampK += ((state.attract ? L.ATTRACT_DRIFT_K : 1) - ampK) * Math.min(1, dt * 0.6);
        const driftOn = reduced ? 0 : 1;
        pan = driftOn * ampK * (L.DRIFT_DEG * Math.PI / 180) * Math.sin(t * Math.PI / L.DRIFT_S);
        const roll = driftOn * ampK * (L.ROLL_DEG * Math.PI / 180) * Math.sin(t * 2 * Math.PI / 17 + 1.3);
        const panPx = f * Math.tan(pan);
        const jx = shake ? (Math.random() - 0.5) * 6 * shake : 0, jy = shake ? (Math.random() - 0.5) * 6 * shake : 0;
        world.style.transform = 'translate3d(' + jx.toFixed(1) + 'px,' + jy.toFixed(1) + 'px,0) rotate(' + (roll * 180 / Math.PI).toFixed(3) + 'deg)';
        skyWrap.style.transform = 'translate3d(' + (panPx * L.PARALLAX[0]).toFixed(1) + 'px,' + tiltPx.toFixed(1) + 'px,0)';
        const night = launching ? smooth(C.STARS[0], C.STARS[1], lp) : 0;
        const dawn = launching ? 1 - smooth(C.SKY[0], C.SKY[1], lp) : 1;
        skyC.style.opacity = dawn.toFixed(3); nightC.style.opacity = night.toFixed(3);
        // clouds drift; on the climb they rush down past us and thin out
        cloudX = (cloudX + (reduced ? 0 : L.CLOUD_PX_S) * dt) % (cloudW || 1);
        const cl = launching ? smooth(C.CLOUDS[0], C.CLOUDS[1], lp) : 0;
        cloudC.style.transform = 'translate3d(' + (panPx * L.PARALLAX[1] - cloudX).toFixed(1) + 'px,' + (tiltPx + cl * cl * H * 1.3).toFixed(1) + 'px,0)';
        cloudC.style.opacity = (1 - cl).toFixed(3);
        // the range: drops with the tilt, flattens with altitude
        view.squash = launching ? 1 - (1 - C.SQUASH_MIN) * smooth(C.SQUASH[0], C.SQUASH[1], lp) : 1;
        view.alpha = launching ? 1 - 0.5 * smooth(0.2, 0.6, lp) : 1;
        landWrap.style.transform = 'translate3d(' + (panPx * L.PARALLAX[2]).toFixed(1) + 'px,' + tiltPx.toFixed(1) + 'px,0)';
        const lb = launching ? smooth(C.LIMB[0], C.LIMB[1], lp) : 0;
        limb.style.opacity = lb.toFixed(3); view.ground = 1 - lb;   // the flat range gives way to the curved limb (the sun stays)
        if (land && land.frame && (!launching || tiltPx < H * 1.2)) land.frame(now);
        // the sun flare
        if (view.sun) {
            const fl = launching ? smooth(C.FLARE[0], C.FLARE[1], lp) * (1 - 0.7 * smooth(C.FLARE[1], C.FLARE[2], lp)) : 0;
            flare.style.transform = 'translate3d(' + view.sun[0].toFixed(1) + 'px,' + view.sun[1].toFixed(1) + 'px,0)';
            flare.style.setProperty('--r', (view.sun[2]).toFixed(1) + 'px');
            flare.style.opacity = fl.toFixed(3);            // only on the climb (at rest the range's own corona is the glow)
            flare.style.setProperty('--k', (1 + 1.6 * fl).toFixed(3));
        }
        // black before the game's transition phase
        if (launching && state.go !== 'skip') black.style.opacity = smooth(C.BLACK[0], C.BLACK[1], lp).toFixed(3);
        shipFrame({ throttle, pitch, rise, recede, tilt, pan, roll, shake, t });
        // perf (script time of this tick: range + ship + transforms)
        const ms = performance.now() - tStart;
        perf.n++; perf.sum += ms; perf.last = ms; if (ms > perf.max && perf.n > 30) perf.max = ms;
        if (perf.n % 60 === 0) { perf.avg = perf.sum / 60; perf.sum = 0; }
        state.raf = requestAnimationFrame(frame);
    }
    state.raf = requestAnimationFrame(frame);
    window.__hyTitlePerf = perf;

    function teardown(why) {
        if (!state.active) return;
        state.active = false; state.why = why;
        cancelAnimationFrame(state.raf);
        state.listeners.forEach((l) => window.removeEventListener(l[0], l[1], l[2])); state.listeners.length = 0;
        state.stops.forEach((s) => { try { s(); } catch (e) { /* ok */ } }); state.stops.length = 0;
        timers.forEach(clearTimeout); timers.length = 0;
        if (state.ship) { try { state.ship.dispose(); } catch (e) { /* ok */ } state.ship = null; }
        if (state.actx) { try { state.actx.close(); } catch (e) { /* ok */ } state.actx = null; }
        if (state.cd) { state.cd.classList.remove('hyl-cd-top', 'hyl-liftoff'); state.cd.classList.add('hyl-cd-gone'); }   // its last line has been read over the black; it must not sit on the cockpit as the HUD comes up
        // buttons the game has not removed yet go back to the body, hidden (the game removes them itself)
        ['launch', 'demo', 'skip'].forEach((k) => { const b = adopted[k]; if (b && b.isConnected && root.contains(b)) { b.style.display = 'none'; document.body.appendChild(b); } });
        [skyC, nightC, cloudC, landC].forEach((c) => { c.width = 0; c.height = 0; });
        root.remove();
        document.body.classList.remove('hyt-on', 'hyt-on-launch');
    }
    window.hyTitle = { mode: 'launch', get active() { return state.active; }, teardown: () => teardown('api'), state: state, perf: perf, knobs: L };
})();
