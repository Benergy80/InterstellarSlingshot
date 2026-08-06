// =============================================================================
// PROCEDURAL GALAXY GENERATION — the endless-discovery far shell
// =============================================================================
// Generates 10-14 seeded star systems in the OUTER shell (80,000-140,000u),
// beyond every piece of hand-authored content (the exotic cores top out at
// 75k, the BORG patrols at 90k). Each system gets:
//
//   * a seeded, unique synthwave palette (magenta / cyan / violet / amber
//     families with per-system hue jitter — no two systems read the same)
//   * a generated name ("Vex-Karr Expanse", "Neon Maru Drift", ...)
//   * a central star, or a binary pair orbiting a barycentre, with a
//     churning plasma-surface shader + additive corona sprites
//   * 2-5 planets on slow tilted orbits, custom lit by a shader that fakes
//     the local star (ZERO extra scene lights — see PERF below)
//   * ring chance, derelict/station chance, a dust/nebula wisp
//   * a first-entry discovery moment (achievement toast + 50 rep)
//
// -----------------------------------------------------------------------------
// HOW THIS PLUGS INTO THE EXISTING WORLD (read before changing)
// -----------------------------------------------------------------------------
// Stars and planets ARE registered into the global `planets` array, because
// every consumer of that array turned out to be distance-gated and therefore
// safe — and registering buys real gameplay for free:
//
//   game-core   updateActivePlanets()   filters to <2000u  -> gravity/slingshot
//   game-objects updateDistanceCulling() hides beyond 30k  -> our LOD, free
//   game-physics gravity/collision loop  walks activePlanets only
//   game-ui      galaxy-map dots         radarRange 3000
//   autopilot    assist picker           <6000u, per-body proximity
//
// Two rules keep that registration safe, DO NOT BREAK THEM:
//   1. Registered bodies are direct children of `scene` holding WORLD-space
//      positions. Every consumer above reads `o.position` raw, so a body
//      parented into a translated Group would compute garbage distances.
//      Cosmetic-only content (corona, wisps, dust, station) lives in the
//      system Group and is free to use local space.
//   2. We never set `userData.orbitRadius` / `userData.systemCenter` — that
//      pair is the trigger for game-core's createOrbitLines() (which would
//      build 5km RingGeometries out here) and its updatePlanetOrbits() orbit
//      integrator. Our orbit state uses the `pgOrbit*` prefix instead, so the
//      core loop only ever applies the cheap `rotation.y` spin to us.
//
// nebulaClouds is deliberately NOT touched: that array drives faction lore,
// deep-discovery rewards and biome music selection, all of which expect
// authored galaxyId/faction metadata we have no business faking.
//
// -----------------------------------------------------------------------------
// FLOATING ORIGIN — the rule that makes this shell reachable at all
// -----------------------------------------------------------------------------
// game-core's applyWorldShift() re-centres the universe on the camera every
// time it drifts past 30,000u: it subtracts camera.position from every scene
// ROOT, snaps the camera to (0,0,0) and accumulates the delta into
// worldOriginOffset. Since this shell lives at 80k-140k, the player CANNOT
// reach it without triggering several rebases on the way.
//
// Every mesh we make is a direct child of `scene` (stars, planets, rings,
// beacons, the per-system Group), so the rebase moves all of them for free.
// The one thing it cannot see is `s.center` — a plain Vector3 held in this
// closure, outside the scene graph. And s.center is what the tick re-derives
// star/planet/ring positions from every frame. Leave it un-shifted and the
// tick drags the whole system back to pre-shift coordinates the instant it
// runs: the shell recedes from the player at exactly the speed they approach
// it, and standing "inside" a system shows empty space.
//
// So: ONE absolute cache (`s.center`), ONE handler in __worldShiftHandlers
// that subtracts the offset from it, and ONE resync that re-derives every
// mesh from it. Rules for anyone extending this file:
//   * Anything new that caches a WORLD position outside the scene graph must
//     be rebased in the handler, or derived from s.center in resyncSystem().
//   * localOffset / pgU / pgV / pgOrbitRadius are RELATIVE — never shift them.
//   * Never reuse the userData keys in game-core's _WSHIFT_UD_KEYS list
//     (systemCenter, targetPosition, ...) for relative data: the rebase
//     traverses the scene and subtracts from all of them.
//
// -----------------------------------------------------------------------------
// PERF
// -----------------------------------------------------------------------------
// * No PointLights. Each one costs a shader permutation + per-fragment work on
//   every MeshStandard material in the scene, and the authored outer systems
//   already add 28. Planets/stars use ShaderMaterial with a uSunDir uniform,
//   so lighting is one dot product and we get the synthwave terminator rim
//   for free.
// * Additive overdraw is the known killer, so the additive budget per system
//   is fixed and small: 2 corona sprites + 1 back-side fresnel shell + 1 dust
//   point cloud + optional ring. Nothing scales with particle count.
// * Distance gate at 60,000u: an inactive system costs one squared-distance
//   compare every 12 frames and nothing else.
// * The whole far shell is advertised from anywhere by ONE THREE.Points
//   object (`beacons`) — 12ish pixels, 1 draw call, so the player can see
//   there is more out there long before it renders.
// =============================================================================

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // TUNING
    // -------------------------------------------------------------------------
    var PG = {
        MIN_SYSTEMS: 10,
        MAX_SYSTEMS: 14,
        SHELL_INNER: 80000,
        SHELL_OUTER: 140000,
        VISIBLE_RANGE: 60000,   // system group renders inside this
        DETAIL_RANGE: 26000,    // station / dust detail inside this
        DISCOVER_RANGE: 6000,   // first entry fires the discovery moment
        COARSE_EVERY: 12,       // frames between visibility/discovery passes
        DISCOVERY_REP: 50
    };

    // -------------------------------------------------------------------------
    // SEEDED PRNG — mulberry32
    // -------------------------------------------------------------------------
    function mulberry32(a) {
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // -------------------------------------------------------------------------
    // NAME GENERATOR — syllable driven
    // -------------------------------------------------------------------------
    var SYL_A = ['Vex', 'Karr', 'Neon', 'Maru', 'Zyth', 'Ora', 'Lyx', 'Kade',
                 'Vyr', 'Nyx', 'Ith', 'Draa', 'Quil', 'Cyre', 'Ryn', 'Tarn',
                 'Vela', 'Mira', 'Zan', 'Kest', 'Pyre', 'Umbra', 'Yara', 'Sable',
                 'Lumen', 'Onyx', 'Halo', 'Ashen', 'Cobal', 'Ember'];
    var SYL_B = ['karr', 'thal', 'vos', 'mera', 'dris', 'lune', 'ryx', 'sara',
                 'nova', 'quen', 'zeth', 'vane', 'ollo', 'phex', 'tera', 'shai',
                 'dara', 'kyre', 'mora', 'sith'];
    var SUFFIX = ['Expanse', 'Drift', 'Reach', 'Verge', 'Sprawl', 'Cascade',
                  'Shoals', 'Marches', 'Threshold', 'Spiral', 'Basin', 'Halo',
                  'Corridor', 'Deep', 'Array', 'Bloom', 'Lattice', 'Furnace'];

    function pick(rand, arr) { return arr[Math.floor(rand() * arr.length) % arr.length]; }

    function generateName(rand, used) {
        for (var attempt = 0; attempt < 24; attempt++) {
            var a = pick(rand, SYL_A);
            var b = pick(rand, SYL_B);
            var s = pick(rand, SUFFIX);
            var form = rand();
            var name;
            if (form < 0.3)      name = a + '-' + (b.charAt(0).toUpperCase() + b.slice(1)) + ' ' + s;
            else if (form < 0.55) name = a + b + ' ' + s;
            else if (form < 0.75) name = 'The ' + a + ' ' + s;
            else if (form < 0.9)  name = a + ' ' + (b.charAt(0).toUpperCase() + b.slice(1)) + ' ' + s;
            else                  name = a + b + '-' + Math.floor(rand() * 899 + 100);
            if (!used[name]) { used[name] = true; return name; }
        }
        return 'Uncharted Sector ' + Math.floor(rand() * 9000 + 1000);
    }

    // -------------------------------------------------------------------------
    // PALETTES — synthwave families with per-system hue jitter, so every
    // system is unique but none of them can drift out of the identity.
    // -------------------------------------------------------------------------
    // `accents` are hand-picked contrast partners, NOT computed complements.
    // The mathematical complement of magenta is lime green, which is exactly
    // the colour this game must never produce — every accent here is drawn
    // from the same four-colour synthwave set as the families themselves.
    var FAMILIES = [
        { key: 'magenta', hue: 0.905, accents: [0.505, 0.545, 0.760], flavour: 'magenta-shift emissions' },
        { key: 'cyan',    hue: 0.515, accents: [0.900, 0.940, 0.075], flavour: 'cyan hydrogen bloom' },
        { key: 'violet',  hue: 0.755, accents: [0.520, 0.930, 0.070], flavour: 'violet ion haze' },
        { key: 'amber',   hue: 0.085, accents: [0.905, 0.770, 0.530], flavour: 'amber plasma tide' }
    ];

    function hsl(h, s, l) {
        var c = new THREE.Color();
        c.setHSL(((h % 1) + 1) % 1, s, l);
        return c;
    }

    function makePalette(rand, familyIndex) {
        var fam = FAMILIES[familyIndex % FAMILIES.length];
        var h = fam.hue + (rand() - 0.5) * 0.07;
        var accentH = fam.accents[Math.floor(rand() * fam.accents.length) % fam.accents.length]
                      + (rand() - 0.5) * 0.03;
        return {
            key: fam.key,
            flavour: fam.flavour,
            hue: h,
            star:      hsl(h, 0.95, 0.62),
            starCore:  hsl(h + 0.04, 1.0, 0.80),
            corona:    hsl(h - 0.02, 1.0, 0.58),
            accent:    hsl(accentH, 1.0, 0.60),
            day:       hsl(h + 0.03, 0.72, 0.52),
            night:     hsl(accentH, 1.0, 0.42),
            rim:       hsl(accentH - 0.06, 0.95, 0.68),
            dust:      hsl(h + 0.06, 0.90, 0.50),
            wisp:      hsl(accentH + 0.03, 0.95, 0.45)
        };
    }

    // -------------------------------------------------------------------------
    // SHARED GPU RESOURCES — built once, reused by every system.
    // -------------------------------------------------------------------------
    var SHARED = null;

    function radialTexture(stops) {
        var c = document.createElement('canvas');
        c.width = c.height = 128;
        var g = c.getContext('2d');
        var grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        for (var i = 0; i < stops.length; i++) grad.addColorStop(stops[i][0], stops[i][1]);
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        var t = new THREE.Texture(c);
        t.needsUpdate = true;
        return t;
    }

    function buildShared() {
        if (SHARED) return SHARED;
        SHARED = {
            coronaTex: radialTexture([
                [0.0, 'rgba(255,255,255,1)'],
                [0.18, 'rgba(255,255,255,0.72)'],
                [0.45, 'rgba(255,255,255,0.20)'],
                [1.0, 'rgba(255,255,255,0)']
            ]),
            dotTex: radialTexture([
                [0.0, 'rgba(255,255,255,1)'],
                [0.35, 'rgba(255,255,255,0.45)'],
                [1.0, 'rgba(255,255,255,0)']
            ]),
            // Unit ring (inner 1 -> outer 2), scaled per planet.
            ringGeo: new THREE.RingGeometry(1.0, 2.0, 72, 1),
            // Unit sphere shell for the nebula wisp.
            shellGeo: new THREE.IcosahedronGeometry(1, 3),
            // Station / derelict parts (unit sized, scaled per instance).
            hubGeo: new THREE.TorusGeometry(1, 0.16, 8, 22),
            spineGeo: new THREE.CylinderGeometry(0.16, 0.16, 2.6, 8),
            podGeo: new THREE.BoxGeometry(0.7, 0.7, 0.7),
            vaneGeo: new THREE.BoxGeometry(1.9, 0.06, 0.5)
        };
        return SHARED;
    }

    // -------------------------------------------------------------------------
    // SHADERS
    // -------------------------------------------------------------------------
    // Planet: one dot product of fake starlight, banded surface, neon night
    // side, fresnel rim and a terminator bloom in the system accent colour.
    var PLANET_VERT = [
        'varying vec3 vN;',
        'varying vec3 vWP;',
        'varying vec3 vObjN;',
        'void main() {',
        '  vObjN = normalize(normal);',
        '  vN = normalize(mat3(modelMatrix) * normal);',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vWP = wp.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
    ].join('\n');

    var PLANET_FRAG = [
        'uniform vec3 uDay;',
        'uniform vec3 uNight;',
        'uniform vec3 uRim;',
        'uniform vec3 uAccent;',
        'uniform vec3 uSunDir;',
        'uniform float uBands;',
        'uniform float uSeed;',
        'uniform float uNightGlow;',
        'varying vec3 vN;',
        'varying vec3 vWP;',
        'varying vec3 vObjN;',
        'void main() {',
        '  vec3 n = normalize(vN);',
        '  float lam = dot(n, uSunDir);',
        '  float day = smoothstep(-0.16, 0.38, lam);',
        // Latitude banding, warped along longitude so the stripes curve and
        // break instead of reading as a barcode. Three octaves: broad climate
        // zones carry most of the weight, fine bands ride on top.
        '  float lon = atan(vObjN.z, vObjN.x);',
        '  float warp = sin(lon * 3.0 + uSeed) * 0.13 + sin(lon * 7.0 - uSeed * 2.0) * 0.055;',
        '  float y = vObjN.y + warp;',
        '  float b1 = sin(y * uBands + uSeed) * 0.5 + 0.5;',
        '  float b2 = sin(y * uBands * 2.31 + uSeed * 3.1) * 0.5 + 0.5;',
        '  float b3 = sin(y * uBands * 0.37 - uSeed * 1.7) * 0.5 + 0.5;',
        '  float band = b3 * 0.55 + mix(b1, b2, 0.42) * 0.45;',
        '  band = smoothstep(0.16, 0.86, band);',
        // Bright bands drift toward the rim hue — a second colour in the
        // surface keeps it from reading as one tinted ball.
        '  vec3 surf = mix(uDay * 0.55, mix(uDay * 1.18, uRim * 0.92, 0.28), band);',
        // Night side: neon strips, the synthwave signature. Added on top of
        // the mix as well so the dark limb genuinely glows.
        '  float nightMask = pow(max(0.0, -lam), 1.3);',
        '  float strip = smoothstep(0.52, 0.96, fract(y * 9.0 + uSeed * 2.0));',
        '  vec3 nightCol = uNight * (0.12 + 1.35 * strip) * uNightGlow;',
        '  vec3 col = mix(nightCol * nightMask, surf, day);',
        '  col += uNight * strip * nightMask * uNightGlow * 0.7;',
        // Fresnel atmosphere.
        '  vec3 V = normalize(cameraPosition - vWP);',
        '  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.6);',
        '  col += uRim * fres * (0.30 + 0.70 * day);',
        // Terminator bloom.
        '  float term = 1.0 - abs(lam);',
        '  col += uAccent * pow(term, 6.0) * 0.75;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
    ].join('\n');

    // Star: churning plasma from stacked sines (cheap, no texture fetches)
    // plus limb brightening so it reads as a sphere of fire, not a disc.
    var STAR_VERT = PLANET_VERT;

    var STAR_FRAG = [
        'uniform vec3 uCore;',
        'uniform vec3 uEdge;',
        'uniform float uTime;',
        'uniform float uSeed;',
        'varying vec3 vN;',
        'varying vec3 vWP;',
        'varying vec3 vObjN;',
        'void main() {',
        '  vec3 p = vObjN * 3.4 + vec3(uSeed);',
        '  float t = uTime * 0.35;',
        '  float n = sin(p.x * 1.7 + sin(p.y * 2.3 + t)) * 0.5;',
        '  n += sin(p.y * 2.9 + sin(p.z * 1.9 - t * 0.7)) * 0.32;',
        '  n += sin(p.z * 4.3 + t * 1.1) * 0.18;',
        '  n = clamp(n * 0.5 + 0.5, 0.0, 1.0);',
        '  vec3 col = mix(uEdge, uCore, smoothstep(0.22, 0.88, n));',
        '  vec3 V = normalize(cameraPosition - vWP);',
        '  float limb = pow(1.0 - max(dot(normalize(vN), V), 0.0), 1.8);',
        '  col = mix(col, uEdge * 1.6, limb * 0.8);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
    ].join('\n');

    // Ring: banded neon annulus, additive, no depth write.
    var RING_VERT = [
        'varying vec3 vP;',
        'varying vec3 vWP;',
        'void main() {',
        '  vP = position;',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vWP = wp.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
    ].join('\n');

    var RING_FRAG = [
        'uniform vec3 uColorA;',
        'uniform vec3 uColorB;',
        'uniform float uSeed;',
        'uniform float uOpacity;',
        'varying vec3 vP;',
        'void main() {',
        '  float r = clamp((length(vP.xy) - 1.0), 0.0, 1.0);',
        '  float gaps = sin(r * 34.0 + uSeed * 6.0) * 0.5 + 0.5;',
        '  float fine = sin(r * 96.0 + uSeed) * 0.5 + 0.5;',
        '  float a = mix(gaps, fine, 0.35);',
        '  a *= smoothstep(0.0, 0.06, r) * (1.0 - smoothstep(0.72, 1.0, r));',
        '  vec3 col = mix(uColorA, uColorB, r);',
        '  gl_FragColor = vec4(col * (0.5 + a), a * uOpacity);',
        '}'
    ].join('\n');

    // Wisp shell: back-side fresnel volume — one additive layer, that's it.
    var WISP_VERT = PLANET_VERT;

    var WISP_FRAG = [
        'uniform vec3 uColor;',
        'uniform vec3 uColor2;',
        'uniform float uTime;',
        'uniform float uOpacity;',
        'varying vec3 vN;',
        'varying vec3 vWP;',
        'varying vec3 vObjN;',
        'void main() {',
        '  vec3 V = normalize(cameraPosition - vWP);',
        // Center-weighted, NOT fresnel. A rim-weighted falloff is brightest
        // exactly at the silhouette, which traces the icosahedron's polygon
        // outline as a hard edge against black. Peaking where the view ray
        // passes through the most gas hides the geometry completely and is
        // what a volume actually looks like.
        '  float f = pow(abs(dot(normalize(vN), V)), 1.6);',
        '  float churn = sin(vObjN.x * 4.0 + uTime * 0.2) * 0.5 +',
        '                sin(vObjN.y * 5.3 - uTime * 0.15) * 0.5;',
        '  churn = churn * 0.25 + 0.75;',
        '  vec3 col = mix(uColor, uColor2, clamp(vObjN.y * 0.5 + 0.5, 0.0, 1.0));',
        '  gl_FragColor = vec4(col * churn * 1.45, f * uOpacity * churn);',
        '}'
    ].join('\n');

    // -------------------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------------------
    var systems = [];
    var beacons = null;          // one Points object advertising the whole shell
    var beaconColors = null;     // Float32Array backing store
    var initialized = false;
    var frame = 0;
    var lastTickMs = 0;
    var lastExternalCall = 0;
    var rafHandle = 0;
    var forceCoarse = false;     // run the visibility/discovery pass next tick
    var shiftBound = false;      // __worldShiftHandlers registration guard

    var _v3 = null;              // scratch, allocated after THREE is known

    // -------------------------------------------------------------------------
    // COORDINATE FRAME HELPERS
    // -------------------------------------------------------------------------
    // s.center — like everything else in the scene — is a CURRENT-frame
    // coordinate. The TRUE (galactic-absolute) position is current +
    // worldOriginOffset. Use trueLength() for anything that must stay stable
    // across rebases: shell-radius logs, the debug listing, distance-from-Sgr-A*
    // rules. Never print s.center.length() — after two rebases it is fiction.
    function worldOffset() {
        return (typeof window !== 'undefined' && window.worldOriginOffset) || null;
    }

    function trueLength(v) {
        var woo = worldOffset();
        if (!woo) return v.length();
        var x = v.x + woo.x, y = v.y + woo.y, z = v.z + woo.z;
        return Math.sqrt(x * x + y * y + z * z);
    }

    function planetsArray() {
        if (typeof planets !== 'undefined' && planets) return planets;
        if (typeof window !== 'undefined' && window.planets) return window.planets;
        return null;
    }

    function activeScene() {
        if (typeof scene !== 'undefined' && scene) return scene;
        if (typeof window !== 'undefined' && window.scene) return window.scene;
        return null;
    }

    function activeCamera() {
        if (typeof camera !== 'undefined' && camera && camera.position) return camera;
        if (typeof window !== 'undefined' && window.camera && window.camera.position) return window.camera;
        return null;
    }

    // Register a body into the global `planets` array in the "already culled"
    // state, so game-objects' updateDistanceCulling() owns its visibility from
    // frame one and flips it on when the player is genuinely close.
    function registerBody(mesh) {
        mesh.visible = false;
        mesh.userData._distCulled = true;
        var arr = planetsArray();
        if (arr) arr.push(mesh);
    }

    // -------------------------------------------------------------------------
    // BUILDERS
    // -------------------------------------------------------------------------
    function buildStar(sys, rand, radius, localOffset) {
        var pal = sys.palette;
        var geo = new THREE.SphereGeometry(radius, 24, 16);
        var mat = new THREE.ShaderMaterial({
            uniforms: {
                uCore: { value: pal.starCore.clone() },
                uEdge: { value: pal.star.clone() },
                uTime: { value: 0 },
                uSeed: { value: rand() * 10 }
            },
            vertexShader: STAR_VERT,
            fragmentShader: STAR_FRAG
        });
        var star = new THREE.Mesh(geo, mat);
        star.frustumCulled = true;
        star.userData = {
            type: 'star',
            name: sys.name + ' Primary',
            systemName: sys.name,
            location: sys.name,
            size: radius,
            radius: radius,
            mass: 4.5 + rand() * 2.0,
            slingshotMultiplier: 4.0,
            rotationSpeed: 0.0015,
            isProcedural: true,
            procSystem: sys.id
        };
        star.position.copy(sys.center).add(localOffset);
        activeScene().add(star);
        registerBody(star);

        // Corona: exactly two additive sprites. This is the entire additive
        // budget for the star — resist adding a third.
        var coronaGroup = [];
        for (var i = 0; i < 2; i++) {
            var sm = new THREE.SpriteMaterial({
                map: SHARED.coronaTex,
                color: (i === 0 ? pal.corona : pal.accent).clone(),
                transparent: true,
                opacity: i === 0 ? 0.85 : 0.35,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            var sp = new THREE.Sprite(sm);
            var s = radius * (i === 0 ? 5.5 : 12.0);
            sp.scale.set(s, s, 1);
            sp.position.copy(localOffset);
            sp.userData.baseOpacity = sm.opacity;
            sp.userData.baseScale = s;
            sp.userData.pulse = 0.6 + rand() * 0.8;
            sp.userData.phase = rand() * 6.28;
            sys.group.add(sp);
            coronaGroup.push(sp);
        }

        return { mesh: star, coronas: coronaGroup, localOffset: localOffset.clone() };
    }

    function buildPlanet(sys, rand, index, orbitRadius) {
        var pal = sys.palette;
        var radius = 42 + rand() * 88;
        // Per-planet geometry at true radius: game-physics reads
        // geometry.parameters.radius for collision + slingshot thresholds, so
        // a shared unit sphere with a scale would silently break both.
        var geo = new THREE.SphereGeometry(radius, 16, 12);

        // Wide enough per-planet hue spread that no two worlds in a system
        // read as the same ball, narrow enough to stay inside the family.
        var hueShift = (rand() - 0.5) * 0.12;
        // Saturation floor of 0.72: below that an amber world desaturates to
        // olive/khaki, which is the one way this palette can go muddy.
        var day = hsl(pal.hue + 0.03 + hueShift, 0.72 + rand() * 0.26, 0.38 + rand() * 0.24);

        var mat = new THREE.ShaderMaterial({
            uniforms: {
                uDay: { value: day },
                uNight: { value: pal.night.clone() },
                uRim: { value: pal.rim.clone() },
                uAccent: { value: pal.accent.clone() },
                uSunDir: { value: new THREE.Vector3(1, 0, 0) },
                uBands: { value: 6.0 + rand() * 22.0 },
                uSeed: { value: rand() * 10.0 },
                uNightGlow: { value: 0.35 + rand() * 0.85 }
            },
            vertexShader: PLANET_VERT,
            fragmentShader: PLANET_FRAG
        });

        var mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = true;

        // Orbit basis: two orthonormal vectors spanning the (tilted) plane.
        var tilt = sys.tilt;
        var incl = (rand() - 0.5) * 0.30;
        var u = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
        var normal = new THREE.Vector3(0, 1, 0)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt.x + incl)
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt.z + incl * 0.5)
            .normalize();
        u.projectOnPlane(normal).normalize();
        if (!isFinite(u.x) || u.lengthSq() < 0.5) u.set(1, 0, 0).projectOnPlane(normal).normalize();
        var v = new THREE.Vector3().crossVectors(normal, u).normalize();

        mesh.userData = {
            type: 'planet',
            name: sys.name + ' ' + ['I', 'II', 'III', 'IV', 'V'][index % 5],
            systemName: sys.name,
            location: sys.name,
            size: radius,
            radius: radius,
            mass: 0.8 + (radius / 130) * 1.6,
            slingshotMultiplier: 2.2,
            rotationSpeed: 0.0025 + rand() * 0.006,
            isProcedural: true,
            procSystem: sys.id,
            // NOTE the pg* prefix — see the header. Using orbitRadius /
            // systemCenter here would hand this body to game-core's orbit
            // integrator and orbit-line builder.
            pgOrbitRadius: orbitRadius,
            pgOrbitSpeed: (0.11 + rand() * 0.16) / Math.sqrt(orbitRadius / 1200),
            pgOrbitAngle: rand() * 6.28,
            pgU: u,
            pgV: v
        };

        activeScene().add(mesh);
        registerBody(mesh);

        var ring = null;
        if (rand() < 0.34) {
            var rmat = new THREE.ShaderMaterial({
                uniforms: {
                    uColorA: { value: pal.accent.clone() },
                    uColorB: { value: pal.rim.clone() },
                    uSeed: { value: rand() * 10 },
                    uOpacity: { value: 0.55 }
                },
                vertexShader: RING_VERT,
                fragmentShader: RING_FRAG,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            ring = new THREE.Mesh(SHARED.ringGeo, rmat);
            var rs = radius * 1.45;
            ring.scale.set(rs, rs, rs);
            // Ring lives in world space alongside the planet rather than as a
            // child, because game-core's updatePlanetOrbits() spins every
            // registered planet on Y — a parented ring would wobble with it.
            ring.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5);
            ring.visible = false;
            ring.frustumCulled = true;
            activeScene().add(ring);
        }

        return { mesh: mesh, ring: ring };
    }

    function buildWisp(sys, rand, extent) {
        var pal = sys.palette;
        var mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: pal.wisp.clone() },
                uColor2: { value: pal.accent.clone() },
                uTime: { value: 0 },
                uOpacity: { value: 0.42 + rand() * 0.20 }   // driven by uBaseOpacity below
            },
            vertexShader: WISP_VERT,
            fragmentShader: WISP_FRAG,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.BackSide      // single additive layer, no double-fill
        });
        var shell = new THREE.Mesh(SHARED.shellGeo, mat);
        shell.scale.set(extent * (1.0 + rand() * 0.3),
                        extent * (0.45 + rand() * 0.3),
                        extent * (1.0 + rand() * 0.3));
        shell.rotation.set(rand() * 3.14, rand() * 3.14, rand() * 3.14);
        // The shell spans the whole system, so the player flies INSIDE it. An
        // interior view of a 0.5-alpha additive volume washes the entire frame
        // magenta and hides the planets — the tick fades uOpacity toward this
        // floor as the camera enters. Read as haze from outside, gone within.
        shell.userData.baseOpacity = shell.material.uniforms.uOpacity.value;
        sys.group.add(shell);
        return shell;
    }

    function buildDust(sys, rand, extent) {
        var count = 200 + Math.floor(rand() * 120);
        var pos = new Float32Array(count * 3);
        var col = new Float32Array(count * 3);
        var cA = sys.palette.dust, cB = sys.palette.accent;
        for (var i = 0; i < count; i++) {
            // Flattened disc so it reads as a galactic plane, not a ball.
            var ang = rand() * 6.28;
            var rad = extent * (0.25 + Math.pow(rand(), 0.6) * 0.95);
            pos[i * 3] = Math.cos(ang) * rad;
            pos[i * 3 + 1] = (rand() - 0.5) * extent * 0.30;
            pos[i * 3 + 2] = Math.sin(ang) * rad;
            var m = rand();
            col[i * 3] = cA.r * (1 - m) + cB.r * m;
            col[i * 3 + 1] = cA.g * (1 - m) + cB.g * m;
            col[i * 3 + 2] = cA.b * (1 - m) + cB.b * m;
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        // PointsMaterial (not a custom shader) on purpose: game-core's
        // _applyFillRateTier() scales `material.size` on every additive Points
        // in the scene, so this cloud thins itself on low-end hardware for free.
        var mat = new THREE.PointsMaterial({
            size: 70,
            map: SHARED.dotTex,
            vertexColors: true,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });
        var pts = new THREE.Points(geo, mat);
        pts.rotation.set((rand() - 0.5) * 0.7, rand() * 6.28, (rand() - 0.5) * 0.7);
        sys.group.add(pts);
        return pts;
    }

    function buildStation(sys, rand, orbitRadius) {
        var pal = sys.palette;
        var g = new THREE.Group();
        var scale = 40 + rand() * 60;
        var derelict = rand() < 0.5;

        var neon = new THREE.MeshBasicMaterial({ color: pal.accent.clone() });
        // Cool steel, deliberately NOT a desaturated system hue: desaturating
        // an amber system's hue lands on olive/khaki, the one colour that
        // reads as dirt rather than retro-future chrome.
        var chrome = new THREE.MeshBasicMaterial({
            color: hsl(0.58, 0.16, derelict ? 0.20 : 0.34)
        });

        var hub = new THREE.Mesh(SHARED.hubGeo, neon);
        hub.scale.setScalar(scale);
        g.add(hub);

        var spine = new THREE.Mesh(SHARED.spineGeo, chrome);
        spine.scale.setScalar(scale);
        g.add(spine);

        var pod = new THREE.Mesh(SHARED.podGeo, chrome);
        pod.scale.setScalar(scale);
        pod.position.y = scale * 1.3;
        g.add(pod);

        var vane = new THREE.Mesh(SHARED.vaneGeo, derelict ? chrome : neon);
        vane.scale.setScalar(scale);
        vane.position.y = -scale * 1.1;
        g.add(vane);

        if (derelict) {
            // Broken-backed silhouette reads as a wreck at a glance.
            g.rotation.set(rand() * 3.14, rand() * 3.14, rand() * 3.14);
            spine.rotation.z = 0.6;
            pod.rotation.set(0.5, 0.4, 0.3);
        }

        var ang = rand() * 6.28;
        var r = orbitRadius * (0.6 + rand() * 0.5);
        g.position.set(Math.cos(ang) * r, (rand() - 0.5) * orbitRadius * 0.2, Math.sin(ang) * r);
        g.userData = {
            spin: (rand() - 0.5) * (derelict ? 0.006 : 0.002),
            derelict: derelict,
            label: derelict ? 'Derelict' : 'Station'
        };
        g.visible = false;
        sys.group.add(g);
        return g;
    }

    // -------------------------------------------------------------------------
    // SYSTEM ASSEMBLY
    // -------------------------------------------------------------------------
    function buildSystem(rand, id, center, name, palette) {
        var sys = {
            id: id,
            name: name,
            palette: palette,
            center: center,
            group: new THREE.Group(),
            stars: [],
            planets: [],
            rings: [],
            station: null,
            wisp: null,
            dust: null,
            active: false,
            detail: false,
            discovered: false,
            binary: rand() < 0.28,
            tilt: { x: (rand() - 0.5) * 0.7, z: (rand() - 0.5) * 0.7 },
            time: rand() * 100
        };

        sys.group.position.copy(center);
        sys.group.visible = false;
        sys.group.frustumCulled = false;   // the group's own bounds are useless
        activeScene().add(sys.group);

        // --- star(s) ---
        if (sys.binary) {
            var sep = 900 + rand() * 700;
            sys.binarySeparation = sep;
            sys.binaryAngle = rand() * 6.28;
            sys.binarySpeed = 0.05 + rand() * 0.05;
            sys.stars.push(buildStar(sys, rand, 150 + rand() * 90, new THREE.Vector3(sep * 0.5, 0, 0)));
            sys.stars.push(buildStar(sys, rand, 120 + rand() * 70, new THREE.Vector3(-sep * 0.5, 0, 0)));
            sys.stars[1].mesh.userData.name = name + ' Secondary';
        } else {
            sys.stars.push(buildStar(sys, rand, 210 + rand() * 130, new THREE.Vector3(0, 0, 0)));
        }

        // --- planets ---
        var planetCount = 2 + Math.floor(rand() * 4);   // 2-5
        var orbit = 1400 + rand() * 900;
        var maxOrbit = orbit;
        for (var i = 0; i < planetCount; i++) {
            var built = buildPlanet(sys, rand, i, orbit);
            sys.planets.push(built.mesh);
            if (built.ring) sys.rings.push({ ring: built.ring, planet: built.mesh });
            maxOrbit = orbit;
            orbit += 900 + rand() * 1300;
        }
        sys.extent = maxOrbit;

        // --- ambience ---
        sys.wisp = buildWisp(sys, rand, maxOrbit * (1.5 + rand() * 0.9));
        sys.dust = buildDust(sys, rand, maxOrbit * 1.35);
        if (rand() < 0.55) sys.station = buildStation(sys, rand, maxOrbit);

        return sys;
    }

    // -------------------------------------------------------------------------
    // FAR BEACONS — the whole shell in one draw call, visible from anywhere.
    // -------------------------------------------------------------------------
    function buildBeacons() {
        var n = systems.length;
        var pos = new Float32Array(n * 3);
        beaconColors = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) {
            var s = systems[i];
            pos[i * 3] = s.center.x;
            pos[i * 3 + 1] = s.center.y;
            pos[i * 3 + 2] = s.center.z;
            var c = s.palette.star;
            beaconColors[i * 3] = c.r;
            beaconColors[i * 3 + 1] = c.g;
            beaconColors[i * 3 + 2] = c.b;
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(beaconColors, 3));
        var mat = new THREE.PointsMaterial({
            size: 7,
            map: SHARED.dotTex,
            vertexColors: true,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: false     // stays a "distant star" at any range
        });
        beacons = new THREE.Points(geo, mat);
        beacons.frustumCulled = false;
        beacons.renderOrder = -1;
        beacons.userData.type = 'proc_galaxy_beacons';
        activeScene().add(beacons);
    }

    // Re-derive the beacon vertex buffer from s.center after a world rebase.
    //
    // The rebase already moved this Points object as a scene root, which LOOKS
    // right — but it leaves the object at position -worldOriginOffset with
    // vertices still holding pre-shift coordinates. Two frames of that and the
    // beacons no longer agree with s.center, so anything that later rebuilds
    // them (or reads a vertex) is silently a full origin-offset out. Rewriting
    // the 10-14 vertices and zeroing the parent keeps s.center the only truth.
    function syncBeaconPositions() {
        if (!beacons) return;
        var attr = beacons.geometry.attributes.position;
        var arr = attr.array;
        for (var i = 0; i < systems.length; i++) {
            var c = systems[i].center;
            arr[i * 3] = c.x;
            arr[i * 3 + 1] = c.y;
            arr[i * 3 + 2] = c.z;
        }
        attr.needsUpdate = true;
        beacons.position.set(0, 0, 0);
    }

    function setBeaconLevel(index, level) {
        if (!beacons || !beaconColors) return;
        var s = systems[index];
        var c = s.palette.star;
        beaconColors[index * 3] = c.r * level;
        beaconColors[index * 3 + 1] = c.g * level;
        beaconColors[index * 3 + 2] = c.b * level;
        beacons.geometry.attributes.color.needsUpdate = true;
    }

    // -------------------------------------------------------------------------
    // DISCOVERY
    // -------------------------------------------------------------------------
    function fireDiscovery(sys) {
        sys.discovered = true;
        var bodies = sys.planets.length + sys.stars.length;
        var blurb = sys.name + ' — ' + sys.stars.length + (sys.binary ? ' suns' : ' sun') +
                    ', ' + sys.planets.length + ' worlds, ' + sys.palette.flavour +
                    (sys.station ? (sys.station.userData.derelict ? ', derelict contact' : ', station contact') : '');

        if (typeof showAchievement === 'function') {
            showAchievement('SYSTEM CHARTED', blurb, true);
        }
        if (typeof window !== 'undefined' && typeof window.flashEventText === 'function') {
            window.flashEventText(sys.name.toUpperCase(),
                '#' + sys.palette.accent.getHexString(),
                'Uncharted system logged — ' + bodies + ' bodies on the scan');
        }
        if (typeof awardReputation === 'function') {
            // Empty source: showAchievement above already carries the moment,
            // awardReputation would otherwise stack a second "+50 REP" banner.
            awardReputation(PG.DISCOVERY_REP, '');
        }
        console.log('PROC-GALAXY discovered: ' + sys.name +
                    ' (' + sys.palette.key + ') at ' + trueLength(sys.center).toFixed(0) + 'u');
    }

    // -------------------------------------------------------------------------
    // INIT
    // -------------------------------------------------------------------------
    function initProcGalaxies(seedOverride) {
        if (initialized) return systems.length;
        if (typeof THREE === 'undefined') return 0;
        var sc = activeScene();
        if (!sc) {
            console.warn('PROC-GALAXY: no scene yet, init skipped');
            return 0;
        }

        var seed = seedOverride;
        if (typeof seed !== 'number') {
            seed = (typeof window !== 'undefined' && typeof window.procUniverseSeed === 'number')
                ? window.procUniverseSeed
                : (Date.now() >>> 0);
        }
        seed = seed >>> 0;
        if (typeof window !== 'undefined') window.procUniverseSeed = seed;

        var rand = mulberry32(seed);
        buildShared();
        bindWorldShift();
        _v3 = new THREE.Vector3();
        var _woo = worldOffset();

        var count = PG.MIN_SYSTEMS + Math.floor(rand() * (PG.MAX_SYSTEMS - PG.MIN_SYSTEMS + 1));
        var used = {};

        // Walk the four families in a shuffled cycle rather than picking at
        // random — a random draw over 12 systems reliably produces 6 magentas
        // and zero violets, which throws away half the palette space.
        var famOrder = [0, 1, 2, 3];
        for (var f = famOrder.length - 1; f > 0; f--) {
            var j = Math.floor(rand() * (f + 1));
            var tmp = famOrder[f]; famOrder[f] = famOrder[j]; famOrder[j] = tmp;
        }

        // Fibonacci-sphere placement with jitter: even coverage of the shell,
        // so no matter which way the player leaves the core they find one.
        var golden = Math.PI * (3 - Math.sqrt(5));
        for (var i = 0; i < count; i++) {
            var y = 1 - (i / Math.max(1, count - 1)) * 2;
            y *= 0.72;                                    // bias toward the plane
            var rc = Math.sqrt(Math.max(0, 1 - y * y));
            var theta = golden * i + rand() * 0.5;
            var radius = PG.SHELL_INNER + rand() * (PG.SHELL_OUTER - PG.SHELL_INNER);
            // Normalize the (flattened) direction BEFORE scaling. Squashing y
            // on an already-scaled vector shortens it, which drops systems to
            // ~72k — on top of the authored BORG patrol shell at 75k-90k.
            var center = new THREE.Vector3(
                Math.cos(theta) * rc,
                y * (0.5 + rand() * 0.5),
                Math.sin(theta) * rc
            );
            if (center.lengthSq() < 1e-6) center.set(1, 0, 0);
            center.normalize().multiplyScalar(radius);
            // `radius` is a distance from the TRUE galactic origin (Sgr A*),
            // which is where the authored content is measured from. If init
            // runs after the world has already been rebased — a restart, or a
            // late init — the current frame is offset from that origin, so
            // convert before storing. Zero offset at a cold start, so a normal
            // run is unchanged.
            if (_woo) center.sub(_woo);
            var name = generateName(rand, used);
            var palette = makePalette(rand, famOrder[i % 4]);
            systems.push(buildSystem(rand, i, center, name, palette));
        }

        buildBeacons();
        initialized = true;
        lastTickMs = (typeof performance !== 'undefined') ? performance.now() : Date.now();

        if (typeof window !== 'undefined') {
            window.procGalaxySystems = systems;
        }
        console.log('PROC-GALAXY: ' + systems.length + ' procedural systems seeded (' +
                    PG.SHELL_INNER + '-' + PG.SHELL_OUTER + 'u), seed ' + seed);

        startSelfDrive();
        return systems.length;
    }

    // -------------------------------------------------------------------------
    // PLACEMENT — every mesh position in a system derives from s.center
    // -------------------------------------------------------------------------
    // Shared by the per-frame tick and by the world-shift resync, so the two
    // can never disagree about where a body is.
    function placeStar(s, st) {
        st.mesh.position.copy(s.center).add(st.localOffset);
    }

    function placePlanet(s, pl) {
        var ud = pl.userData;
        var ca = Math.cos(ud.pgOrbitAngle) * ud.pgOrbitRadius;
        var sa = Math.sin(ud.pgOrbitAngle) * ud.pgOrbitRadius;
        pl.position.set(
            s.center.x + ud.pgU.x * ca + ud.pgV.x * sa,
            s.center.y + ud.pgU.y * ca + ud.pgV.y * sa,
            s.center.z + ud.pgU.z * ca + ud.pgV.z * sa
        );
    }

    // Rebuild every world position in a system from s.center, without advancing
    // any simulation state (orbit angles, binary phase and star time are left
    // exactly as they are). Idempotent: calling it twice changes nothing.
    function resyncSystem(s) {
        s.group.position.copy(s.center);
        for (var k = 0; k < s.stars.length; k++) placeStar(s, s.stars[k]);
        for (var p = 0; p < s.planets.length; p++) placePlanet(s, s.planets[p]);
        for (var r = 0; r < s.rings.length; r++) {
            s.rings[r].ring.position.copy(s.rings[r].planet.position);
        }
    }

    // -------------------------------------------------------------------------
    // FLOATING ORIGIN — rebase this module's one absolute cache
    // -------------------------------------------------------------------------
    // Registered at load, not at init, so the handler is in place even if a
    // rebase somehow lands between script evaluation and initProcGalaxies().
    // The systems array is empty until then, which makes it a no-op.
    //
    // Only s.center is subtracted. The meshes were already moved by the rebase
    // itself (they are scene roots); resyncSystem re-derives them from the
    // corrected centre, which both removes the accumulated float drift of
    // repeated subtractions and guarantees the tick's next write agrees.
    function bindWorldShift() {
        if (shiftBound || typeof window === 'undefined') return;
        shiftBound = true;
        window.__worldShiftHandlers = window.__worldShiftHandlers || [];
        window.__worldShiftHandlers.push(function (offset) {
            if (!systems.length) return;
            for (var i = 0; i < systems.length; i++) {
                var s = systems[i];
                s.center.sub(offset);
                resyncSystem(s);
            }
            syncBeaconPositions();
            // Distances just changed by up to 30,000u — re-evaluate activation
            // and discovery on the very next tick instead of waiting out the
            // 12-frame coarse cadence.
            forceCoarse = true;
        });
    }

    // -------------------------------------------------------------------------
    // UPDATE
    // -------------------------------------------------------------------------
    function updateProcGalaxies(external) {
        if (!initialized) return;
        var cam = activeCamera();
        if (!cam) return;

        if (external) lastExternalCall = Date.now();

        var now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        var dt = Math.min(0.05, (now - lastTickMs) / 1000);
        if (dt <= 0) dt = 0.016;
        lastTickMs = now;
        frame++;

        var cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
        var coarse = forceCoarse || (frame % PG.COARSE_EVERY) === 0;
        forceCoarse = false;
        var visR2 = PG.VISIBLE_RANGE * PG.VISIBLE_RANGE;
        var detR2 = PG.DETAIL_RANGE * PG.DETAIL_RANGE;
        var discR2 = PG.DISCOVER_RANGE * PG.DISCOVER_RANGE;

        for (var i = 0; i < systems.length; i++) {
            var s = systems[i];

            if (coarse) {
                var dx = s.center.x - cx, dy = s.center.y - cy, dz = s.center.z - cz;
                var d2 = dx * dx + dy * dy + dz * dz;

                var wantActive = d2 < visR2;
                if (wantActive !== s.active) {
                    s.active = wantActive;
                    s.group.visible = wantActive;
                    // Beacon hands off to the real system as it fades in.
                    setBeaconLevel(i, wantActive ? 0 : 1);
                }
                var wantDetail = d2 < detR2;
                if (wantDetail !== s.detail) {
                    s.detail = wantDetail;
                    if (s.station) s.station.visible = wantDetail;
                    if (s.dust) s.dust.visible = wantDetail;
                }
                // Rings follow their planet's culled state (game-objects owns
                // the planet's .visible, we just mirror it).
                for (var r = 0; r < s.rings.length; r++) {
                    var rr = s.rings[r];
                    if (rr.ring.visible !== rr.planet.visible) rr.ring.visible = rr.planet.visible;
                }

                if (!s.discovered && d2 < discR2) fireDiscovery(s);
            }

            if (!s.active) continue;

            s.time += dt;

            // --- binary star dance ---
            if (s.binary && s.stars.length === 2) {
                s.binaryAngle += s.binarySpeed * dt;
                var ca = Math.cos(s.binaryAngle), sa = Math.sin(s.binaryAngle);
                var half = s.binarySeparation * 0.5;
                for (var b = 0; b < 2; b++) {
                    var sgn = b === 0 ? 1 : -1;
                    var st = s.stars[b];
                    // localOffset is RELATIVE to s.center — a world rebase must
                    // never touch it, only the centre it is added to.
                    st.localOffset.set(ca * half * sgn, 0, sa * half * sgn);
                    placeStar(s, st);
                    for (var c = 0; c < st.coronas.length; c++) {
                        st.coronas[c].position.copy(st.localOffset);
                    }
                }
            }

            // --- star surface + corona breathing ---
            for (var k = 0; k < s.stars.length; k++) {
                var star = s.stars[k];
                star.mesh.material.uniforms.uTime.value = s.time;
                for (var ci = 0; ci < star.coronas.length; ci++) {
                    var sp = star.coronas[ci];
                    var puls = 1 + Math.sin(s.time * sp.userData.pulse + sp.userData.phase) * 0.07;
                    var sz = sp.userData.baseScale * puls;
                    sp.scale.set(sz, sz, 1);
                    sp.material.opacity = sp.userData.baseOpacity * (0.82 + 0.18 * puls);
                }
            }

            // --- planet orbits (world space) + fake starlight direction ---
            var primary = s.stars[0].mesh.position;
            for (var p = 0; p < s.planets.length; p++) {
                var pl = s.planets[p];
                pl.userData.pgOrbitAngle += pl.userData.pgOrbitSpeed * dt;
                placePlanet(s, pl);
                _v3.subVectors(primary, pl.position).normalize();
                pl.material.uniforms.uSunDir.value.copy(_v3);
            }

            // --- rings ride along ---
            for (var ri = 0; ri < s.rings.length; ri++) {
                s.rings[ri].ring.position.copy(s.rings[ri].planet.position);
            }

            // --- ambience ---
            if (s.wisp) {
                s.wisp.material.uniforms.uTime.value = s.time;
                s.wisp.rotation.y += dt * 0.006;
                // Fade the haze out as the player enters the system.
                var wdx = s.center.x - cx, wdy = s.center.y - cy, wdz = s.center.z - cz;
                var wd = Math.sqrt(wdx * wdx + wdy * wdy + wdz * wdz);
                var t = (wd - s.extent * 1.1) / (s.extent * 1.7);
                t = t < 0 ? 0 : (t > 1 ? 1 : t);
                s.wisp.material.uniforms.uOpacity.value =
                    s.wisp.userData.baseOpacity * (0.06 + 0.94 * t);
            }
            if (s.dust && s.detail) s.dust.rotation.y += dt * 0.010;
            if (s.station && s.detail) {
                s.station.rotation.y += s.station.userData.spin;
                if (s.station.userData.derelict) s.station.rotation.x += s.station.userData.spin * 0.4;
            }
        }
    }

    // -------------------------------------------------------------------------
    // SELF-DRIVE
    // -------------------------------------------------------------------------
    // The feature ships with exactly one init hook in game-core, so it drives
    // its own tick from rAF. If an integrator later calls
    // window.updateProcGalaxies() from the main animate loop, this loop
    // detects the external call and stands down — no double integration.
    function startSelfDrive() {
        if (rafHandle) return;
        var loop = function () {
            rafHandle = requestAnimationFrame(loop);
            if (Date.now() - lastExternalCall < 1000) return;   // externally driven
            updateProcGalaxies(false);
        };
        rafHandle = requestAnimationFrame(loop);
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------
    // Register with the floating origin at load, before anything can shift.
    bindWorldShift();

    if (typeof window !== 'undefined') {
        window.initProcGalaxies = initProcGalaxies;
        window.updateProcGalaxies = function () { updateProcGalaxies(true); };
        window.procGalaxySystems = systems;
        // Console helpers for tuning/QA.
        window.procGalaxyDebug = {
            list: function () {
                return systems.map(function (s) {
                    return {
                        name: s.name,
                        palette: s.palette.key,
                        // TRUE distance from Sgr A*, stable across rebases —
                        // always inside SHELL_INNER..SHELL_OUTER.
                        dist: Math.round(trueLength(s.center)),
                        // ...and how far the player is from it right now.
                        range: (function () {
                            var cam = activeCamera();
                            return cam ? Math.round(s.center.distanceTo(cam.position)) : null;
                        })(),
                        planets: s.planets.length,
                        binary: s.binary,
                        discovered: s.discovered,
                        active: s.active
                    };
                });
            },
            warpTo: function (nameOrIndex) {
                var s = (typeof nameOrIndex === 'number')
                    ? systems[nameOrIndex]
                    : systems.filter(function (x) { return x.name === nameOrIndex; })[0];
                var cam = activeCamera();
                if (!s || !cam) return false;
                cam.position.set(s.center.x + s.extent * 1.1, s.center.y + s.extent * 0.3, s.center.z);
                cam.lookAt(s.center);
                // The camera is now ~100k from the origin, so animate() will
                // rebase the world on the next frame anyway. Do it here so the
                // state a QA session reads back immediately is already the
                // post-shift state, instead of a frame of pre-shift numbers
                // that look like the warp missed.
                if (typeof window.applyWorldShift === 'function') {
                    try { window.applyWorldShift(); } catch (e) {
                        console.warn('PROC-GALAXY warpTo: rebase failed', e);
                    }
                }
                // Skip the 12-frame coarse cadence: activate/discover NOW.
                forceCoarse = true;
                updateProcGalaxies(false);
                return s.name + ' @ ' + Math.round(s.center.distanceTo(cam.position)) + 'u';
            },
            config: PG
        };
    }
})();
