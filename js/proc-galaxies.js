// =============================================================================
// PROCEDURAL GALAXY GENERATION — the endless-discovery far shell
// =============================================================================
// Generates 10-14 seeded star systems in the OUTER shell (80,000-140,000u),
// beyond every piece of hand-authored content (the exotic cores top out at
// 75k, the BORG patrols at 90k). Each system gets:
//
//   * a seeded palette sampled anywhere on a continuous synthwave hue wheel,
//     walked by a golden-ratio recurrence so neighbours never rhyme and
//     nothing repeats on any period (see the PALETTES section)
//   * a generated name ("Vex-Karr Expanse", "Neon Maru Drift", ...)
//   * a central star, or a binary pair orbiting a barycentre, with a
//     churning plasma-surface shader + additive corona sprites
//   * 3-5 planets on slow tilted orbits, each rolled from SIX archetypes —
//     gas giant / ice / molten / barren rock / ocean / banded terrestrial —
//     with archetype odds weighted by orbital zone, so a system reads as a
//     system (scorched rock inside, giants and ice past the frost line)
//   * 0-3 moons on the larger bodies, on their own tilted orbits
//   * distance LOD on every sphere (16 -> 32 -> 64 segments), built lazily
//   * ring chance (near-certain on gas giants), derelict/station chance,
//     a dust/nebula wisp
//   * a first-entry discovery moment (achievement toast + 50 rep)
//
// The size ladder is deliberate and is most of the "scale drama":
//   star 380-600u > gas giant 255-470u > ocean/ice 72-164u > rock 34-96u
//   > moonlet 12-74u — roughly 50x end to end.
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
//   3. Moons carry `userData.type = 'planet'` with `bodyClass = 'moon'`, NOT
//      type 'moon'. game-core's updateActivePlanets() force-sets
//      `visible = true` on every type-'moon' entry of the planets array on
//      every frame, which would strand our moonlets drawn from 100,000u with
//      no parent world rendered anywhere near them. Same reason we avoid
//      `parentPlanet` + `orbitRadius`: that pair is the core's moon
//      integrator, and it would fight placeMoon() for the position.
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
//   * localOffset / pgU / pgV / pgOrbitRadius / pgMoonRadius are RELATIVE —
//     never shift them. Moons are relative to their PARENT, so resyncSystem
//     must always place them after the planets, never before.
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
// * Six archetypes, ONE shader program. uType is a uniform, so the branch in
//   PLANET_FRAG is coherent across the whole draw and only one arm executes;
//   six #define'd materials would have linked six programs and stalled on
//   first sight of each new world. The noise hash is fract-based, not
//   sin-based, because a single fbm3() takes 24 lattice corners.
// * LOD geometries are built ON DEMAND. A body you never fly to never
//   allocates past its 16-segment tier, so the galaxy-wide vertex cost is
//   unchanged from before until you actually go somewhere.
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
    // PALETTES — one continuous synthwave hue wheel, sampled per system.
    // -------------------------------------------------------------------------
    // This used to be four fixed families walked on `i % 4`, which meant
    // systems 0/4/8 were literally the same colour family and a player could
    // read the loop off the fourth system they visited. There is no family
    // table any more: `t` is a free parameter in 0..1 and maps onto ONE
    // continuous arc of the hue circle —
    //
    //   t=0.00  cyan .. azure .. sapphire .. indigo .. violet .. orchid ..
    //   ..magenta .. rose .. red .. ember .. amber  t=1.00
    //
    // — which is 69% of the wheel. The 31% left out (hue 0.145 -> 0.455) is
    // yellow / lime / green / olive: the exact band that turns this identity
    // into mud, and the reason the old table refused to compute complements.
    // Excising it ONCE, here, means every hue calculation downstream (accents,
    // per-planet jitter, moon tints) is free to roam the whole parameter range
    // and still cannot produce a colour this game must never show.
    // Measured, not guessed: hue 0.455 at s=0.7 renders as spring green, and a
    // planet's mid-band landed on jade in a live capture. 0.478 is the first
    // hue that is unambiguously cyan, and the span is trimmed to match so the
    // far end stops at amber (0.14) instead of running into yellow.
    var HUE_START = 0.478;   // cyan
    var HUE_SPAN  = 0.662;   // ...all the way round to amber at 1.140 == 0.140

    // t (any real) -> hue on the safe arc. Wraps cyan<->amber at the ends.
    function arcHue(t) {
        t = t - Math.floor(t);
        return (HUE_START + t * HUE_SPAN) % 1;
    }

    // Small in-family moves REFLECT off the ends of the arc instead of
    // wrapping. Wrapping would give an amber star a cyan core (a hue jump of
    // half the wheel from a "+0.05 warmer" request); reflecting walks it back
    // toward rose, which is what "slightly different, same family" means.
    function hueNudge(t, d) {
        var n = t + d;
        if (n > 1) n = 2 - n;
        if (n < 0) n = -n;
        return arcHue(n);
    }

    // Readable name for the arc position — feeds the discovery blurb and the
    // debug listing, so QA can see at a glance that neighbours differ.
    var HUE_NAMES = [
        [0.05, 'cyan'], [0.14, 'azure'], [0.26, 'sapphire'], [0.38, 'indigo'],
        [0.50, 'violet'], [0.61, 'orchid'], [0.72, 'magenta'], [0.81, 'rose'],
        [0.90, 'ember'], [1.01, 'amber']
    ];

    function hueName(t) {
        t = t - Math.floor(t);
        for (var i = 0; i < HUE_NAMES.length; i++) {
            if (t < HUE_NAMES[i][0]) return HUE_NAMES[i][1];
        }
        return 'amber';
    }

    var FLAVOUR_NOUN = ['plasma tide', 'hydrogen bloom', 'ion haze', 'shift emissions',
                        'aurora drift', 'photon surf', 'ember wash', 'spectral bloom',
                        'coronal veil', 'particle rain'];

    function hsl(h, s, l) {
        var c = new THREE.Color();
        c.setHSL(((h % 1) + 1) % 1, s, l);
        return c;
    }

    // `t` is the system's position on the safe arc, handed down from init so
    // the whole shell can be stratified. Nothing here is family-indexed.
    function makePalette(rand, t) {
        t = t - Math.floor(t);
        // Accent sits a third to a half of the arc away: far enough to read as
        // a genuinely second colour at any exposure, still inside the identity.
        var at = t + (0.30 + rand() * 0.22) * (rand() < 0.5 ? -1 : 1);
        at = at - Math.floor(at);
        var key = hueName(t);
        return {
            key: key,
            t: t,
            accentT: at,
            flavour: key + ' ' + pick(rand, FLAVOUR_NOUN),
            hue: arcHue(t),
            accentHue: arcHue(at),
            star:      hsl(arcHue(t), 0.95, 0.62),
            starCore:  hsl(hueNudge(t, 0.055), 1.00, 0.80),
            corona:    hsl(hueNudge(t, -0.030), 1.00, 0.58),
            accent:    hsl(arcHue(at), 1.00, 0.60),
            day:       hsl(hueNudge(t, 0.045), 0.72, 0.52),
            night:     hsl(arcHue(at), 1.00, 0.42),
            rim:       hsl(hueNudge(at, -0.085), 0.95, 0.68),
            dust:      hsl(hueNudge(t, 0.085), 0.90, 0.50),
            wisp:      hsl(hueNudge(at, 0.045), 0.95, 0.45)
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

    // ONE program, six worlds. uType is a uniform, so the branch below is
    // perfectly coherent across every fragment of a given draw — the GPU only
    // ever walks one arm. Six separate ShaderMaterials with #defines would
    // have compiled six programs and thrashed the shader cache on approach;
    // this way Three.js's program cache sees identical source for every body
    // in the galaxy and links exactly once.
    //
    //   0 GAS GIANT — turbulence-warped bands + a storm oval
    //   1 ICE       — pale sheets, glowing fracture cracks, polar caps
    //   2 MOLTEN    — near-black crust with lava veins that burn on the dark side
    //   3 BARREN    — cratered regolith, almost no night glow (scale drama)
    //   4 OCEAN     — sea with a real specular sun glint, continents, city lights
    //   5 TERRA     — the original banded world, kept intact
    var PLANET_FRAG = [
        'uniform vec3 uDay;',
        'uniform vec3 uNight;',
        'uniform vec3 uRim;',
        'uniform vec3 uAccent;',
        'uniform vec3 uSunDir;',
        'uniform float uBands;',
        'uniform float uSeed;',
        'uniform float uNightGlow;',
        'uniform float uType;',
        'uniform float uAtmo;',
        'varying vec3 vN;',
        'varying vec3 vWP;',
        'varying vec3 vObjN;',
        // IQ-style integer-ish hash: three fracts and two multiplies. A
        // sin()-based hash costs a transcendental per lattice corner and this
        // shader takes up to eight corners per noise lookup.
        'float h31(vec3 p) {',
        '  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));',
        '  p *= 17.0;',
        '  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));',
        '}',
        // Value noise on the OBJECT-space normal, never on lat/lon: a lon/lat
        // parameterisation seams down the anti-meridian and pinches at both
        // poles, which is exactly where a planet's silhouette is.
        'float vnoise(vec3 x) {',
        '  vec3 i = floor(x); vec3 f = fract(x);',
        '  f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(mix(h31(i), h31(i + vec3(1.0,0.0,0.0)), f.x),',
        '                 mix(h31(i + vec3(0.0,1.0,0.0)), h31(i + vec3(1.0,1.0,0.0)), f.x), f.y),',
        '             mix(mix(h31(i + vec3(0.0,0.0,1.0)), h31(i + vec3(1.0,0.0,1.0)), f.x),',
        '                 mix(h31(i + vec3(0.0,1.0,1.0)), h31(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);',
        '}',
        'float fbm2(vec3 p) { return vnoise(p) * 0.63 + vnoise(p * 2.17 + 9.1) * 0.37; }',
        'float fbm3(vec3 p) { return vnoise(p) * 0.52 + vnoise(p * 2.17 + 9.1) * 0.31 + vnoise(p * 4.41 + 23.7) * 0.17; }',
        // Ridged noise — the |2n-1| fold turns smooth blobs into creases, which
        // is what cracks, lava channels and mountain chains all are.
        'float ridge(vec3 p) { float n = fbm2(p); n = 1.0 - abs(n * 2.0 - 1.0); return n * n; }',
        'void main() {',
        '  vec3 n = normalize(vN);',
        '  vec3 o = normalize(vObjN);',
        '  vec3 V = normalize(cameraPosition - vWP);',
        '  float lam = dot(n, uSunDir);',
        '  float day = smoothstep(-0.16, 0.38, lam);',
        '  float lat = o.y;',
        '  vec3 sp = o + vec3(uSeed);',
        '  vec3 surf = uDay;',
        '  vec3 emissive = vec3(0.0);',   // self-lit: survives the night side
        '  float glossy = 0.0;',
        '  float stripAmt = 1.0;',
        '  float t = uType;',

        // ---------------------------------------------------------------- GAS
        '  if (t < 0.5) {',
        // TWO warp octaves, not one. A single warp makes every band bend the
        // same way and the planet still reads as a barcode wrapped on a
        // sphere; the fine second octave shears the band edges so they pinch,
        // fork and drift the way real jet streams do.
        '    float w1 = (fbm3(vec3(o.x, o.y * 0.28, o.z) * 2.6 + uSeed) - 0.5) * 0.30;',
        '    float w2 = (fbm2(vec3(o.x, o.y * 0.35, o.z) * 7.5 - uSeed) - 0.5) * 0.09;',
        '    float y = lat + w1 + w2;',
        '    float b1 = sin(y * uBands + uSeed) * 0.5 + 0.5;',
        '    float b2 = sin(y * uBands * 2.63 - uSeed * 1.7) * 0.5 + 0.5;',
        '    float b3 = sin(y * uBands * 0.41 + uSeed * 0.7) * 0.5 + 0.5;',   // broad climate zones
        '    float band = smoothstep(0.05, 0.95, b3 * 0.42 + (b1 * 0.62 + b2 * 0.38) * 0.58);',
        // Dark end lifted off black: bands that bottom out at 0.38 of the day
        // colour read as painted-on stripes, not as depth in an atmosphere.
        '    surf = mix(uDay * 0.52, mix(uDay * 1.32, uRim * 1.08, 0.36), band);',
        // One great spot, latitude-squashed into an oval, in the accent hue.
        '    vec3 sc = normalize(vec3(cos(uSeed * 2.1), 0.34 * sin(uSeed * 1.7), sin(uSeed * 2.1)));',
        '    float sd = distance(o * vec3(1.0, 2.6, 1.0), sc * vec3(1.0, 2.6, 1.0));',
        '    float storm = 1.0 - smoothstep(0.07, 0.31, sd);',
        '    surf = mix(surf, uAccent * 1.35, storm * 0.92);',
        '    emissive += uAccent * storm * 0.16;',
        // Polar hoods — the bands running straight off the top of the sphere
        // is the giveaway that this is a cylinder map.
        '    surf *= mix(1.0, 0.68, smoothstep(0.68, 1.0, abs(lat)));',
        '    stripAmt = 0.55;',

        // ---------------------------------------------------------------- ICE
        '  } else if (t < 1.5) {',
        '    float sheet = fbm2(sp * 3.1);',
        '    vec3 base = mix(uDay, vec3(0.84, 0.93, 1.0), 0.58);',
        '    surf = base * (0.74 + 0.46 * sheet);',
        // Thin, high-threshold cracks. ridge() peaks often, so a 0.55 floor
        // covered half the globe and the world read as a brain, not as ice.
        '    float crack = smoothstep(0.66, 0.97, ridge(sp * 6.8));',
        '    surf = mix(surf, uRim * 1.45, crack * 0.48);',
        '    emissive += uRim * crack * 0.26 * uNightGlow;',
        '    float cap = smoothstep(0.58, 0.86, abs(lat));',
        '    surf = mix(surf, vec3(0.94, 0.98, 1.0), cap * 0.80);',
        '    glossy = 0.55;',
        '    stripAmt = 0.25;',

        // ------------------------------------------------------------- MOLTEN
        '  } else if (t < 2.5) {',
        '    float veins = ridge(sp * 4.0);',
        '    float flow = fbm2(sp * 9.0);',
        // Threshold high and narrow. A low threshold floods 60% of the surface
        // with emissive and the body clips to a white ball — the archetype has
        // to be mostly CRUST for the fire to read as cracks in something.
        '    float lava = smoothstep(0.60, 0.93, veins * 0.80 + flow * 0.28);',
        '    vec3 crust = mix(uDay * 0.07, uDay * 0.26, fbm2(sp * 12.0));',
        '    vec3 hot = mix(uAccent, uRim, 0.22);',
        '    surf = mix(crust, hot * 1.10, lava * 0.50);',
        // The reason this archetype exists: a near-black world laced with fire
        // that does NOT go dark when it turns away from its sun.
        '    emissive += hot * pow(lava, 1.4) * 1.55;',
        '    stripAmt = 0.0;',

        // ------------------------------------------------------------- BARREN
        '  } else if (t < 3.5) {',
        '    float cn1 = vnoise(sp * 6.5);',
        '    float cn2 = vnoise(sp * 15.0 + 4.0);',
        // Thin shells around an iso-surface of the noise read as crater rims —
        // three smoothsteps, no cellular/Worley loop.
        '    float rim1 = smoothstep(0.42, 0.50, cn1) * (1.0 - smoothstep(0.50, 0.60, cn1));',
        '    float rim2 = smoothstep(0.44, 0.50, cn2) * (1.0 - smoothstep(0.50, 0.58, cn2));',
        '    float pit = 1.0 - smoothstep(0.28, 0.50, cn1);',
        '    vec3 base = mix(uDay * 0.34, uDay * 0.82, fbm2(sp * 3.4));',
        '    surf = base * (1.0 - pit * 0.38) + uRim * (rim1 * 0.60 + rim2 * 0.32) * 0.55;',
        '    stripAmt = 0.0;',

        // -------------------------------------------------------------- OCEAN
        '  } else if (t < 4.5) {',
        '    float land = fbm3(sp * 2.3);',
        '    float landMask = smoothstep(0.50, 0.60, land);',
        '    vec3 sea = uDay * mix(0.30, 0.95, fbm2(sp * 6.0));',
        '    vec3 landCol = mix(uRim * 0.50, uAccent * 0.46, land);',
        '    surf = mix(sea, landCol, landMask);',
        '    glossy = 1.0 - landMask;',
        '    float cloud = smoothstep(0.54, 0.80, fbm2(vec3(o.x, o.y * 0.6, o.z) * 3.6 + uSeed * 2.0));',
        '    surf = mix(surf, vec3(0.92, 0.96, 1.0), cloud * 0.52);',
        // City lights on the continents only — the synthwave payoff shot.
        '    emissive += uNight * landMask * smoothstep(0.55, 0.85, fbm2(sp * 14.0)) * uNightGlow * 1.3;',
        // Low: an ocean world's dark side should be city lights on continents,
        // not generic bands over the sea.
        '    stripAmt = 0.16;',

        // -------------------------------------------------------------- TERRA
        '  } else {',
        '    float lon = atan(o.z, o.x);',
        '    float warp = sin(lon * 3.0 + uSeed) * 0.13 + sin(lon * 7.0 - uSeed * 2.0) * 0.055;',
        '    float y = lat + warp;',
        '    float b1 = sin(y * uBands + uSeed) * 0.5 + 0.5;',
        '    float b2 = sin(y * uBands * 2.31 + uSeed * 3.1) * 0.5 + 0.5;',
        '    float b3 = sin(y * uBands * 0.37 - uSeed * 1.7) * 0.5 + 0.5;',
        '    float band = smoothstep(0.16, 0.86, b3 * 0.55 + mix(b1, b2, 0.42) * 0.45);',
        '    surf = mix(uDay * 0.55, mix(uDay * 1.18, uRim * 0.92, 0.28), band);',
        '  }',

        // ------------------------------------------------------- COMMON LIGHT
        // Night side: neon strips, the synthwave signature. stripAmt lets a
        // barren rock stay genuinely black while a gas giant still glows, and
        // the branch is uniform-coherent so an airless rock never pays for it.
        //
        // The strips are WARPED by the same noise field the surface uses. A
        // raw fract(lat * 9.0) sawtooth is a perfect stack of parallel rings,
        // which on a sphere reads as venetian blinds rather than as light on a
        // world; a ±0.24 latitude warp makes them wander and break.
        '  float nightMask = pow(max(0.0, -lam), 1.3);',
        '  float strip = 0.0;',
        '  if (stripAmt > 0.001) {',
        '    float sw = (fbm2(vec3(o.x, o.y * 0.4, o.z) * 2.2 + uSeed) - 0.5) * 0.24;',
        '    strip = smoothstep(0.50, 0.97, fract((lat + sw) * 9.0 + uSeed * 2.0)) * stripAmt;',
        '  }',
        // The `surf * 0.055` term keeps a sliver of the world's own albedo on
        // the dark side, so an ocean world and a gas giant do not turn into
        // the same anonymous strip of neon the moment they rotate away.
        '  vec3 nightCol = uNight * (0.10 + 1.30 * strip) * uNightGlow + surf * 0.055;',
        '  vec3 col = mix(nightCol * nightMask, surf, day);',
        '  col += uNight * strip * nightMask * uNightGlow * 0.7;',
        '  col += emissive * (1.0 + 0.85 * nightMask);',
        // Specular glint — ice and open water only, and only where the sun is.
        '  if (glossy > 0.001) {',
        '    vec3 H = normalize(uSunDir + V);',
        '    float spec = pow(max(dot(n, H), 0.0), 84.0);',
        '    col += mix(vec3(1.0), uRim, 0.45) * spec * glossy * 2.4 * day;',
        '  }',
        // Fresnel atmosphere, scaled per archetype: thick on a gas giant,
        // hairline on an airless rock.
        '  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.6);',
        '  col += uRim * fres * (0.30 + 0.70 * day) * uAtmo;',
        // Terminator bloom.
        '  float term = 1.0 - abs(lam);',
        '  col += uAccent * pow(term, 6.0) * 0.75 * uAtmo;',
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
        var geo = new THREE.SphereGeometry(radius, STAR_LOD_SEGS[0][0], STAR_LOD_SEGS[0][1]);
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
            procSystem: sys.id,
            pgLodSegs: STAR_LOD_SEGS,
            pgLodGeo: [geo, null, null],
            pgLodTier: 0
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

    // -------------------------------------------------------------------------
    // ARCHETYPES
    // -------------------------------------------------------------------------
    // `id` MUST match the uType branch order in PLANET_FRAG. Every numeric
    // field is [min, range] and is rolled per body, so two gas giants in the
    // same system are still not the same gas giant.
    //
    // The radius column is the point of the whole table: 34 → 470 is a 13.8x
    // span, so a moonlet next to a gas giant reads as two different KINDS of
    // object rather than two sizes of the same ball. Keep the top end under
    // ~480: the innermost orbit sits at 1400u and stars run to 340u.
    var ARCHETYPES = [
        // atmo caps at 1.32: the fresnel term is additive, and a gas giant at
        // 1.7 blew its own limb out to white in a live capture.
        { id: 0, key: 'gas giant', radius: [255, 215], bands: [6, 9],   nightGlow: [0.30, 0.30], atmo: [1.00, 0.32],
          ringChance: 0.88, ringSpan: [1.30, 1.15], ringOpacity: 0.62, moons: [1, 3], moonChance: 0.95,
          mass: [3.2, 2.4], sling: 3.4, spin: [0.0022, 0.004], sat: [0.68, 0.24], lum: [0.40, 0.16] },
        { id: 1, key: 'ice world', radius: [72, 82],   bands: [4, 8],   nightGlow: [0.45, 0.55], atmo: [0.75, 0.45],
          ringChance: 0.18, ringSpan: [1.45, 0.6],  ringOpacity: 0.42, moons: [0, 2], moonChance: 0.35,
          mass: [0.7, 0.9], sling: 1.9, spin: [0.0015, 0.004], sat: [0.55, 0.28], lum: [0.52, 0.18] },
        { id: 2, key: 'molten world', radius: [55, 62], bands: [8, 14], nightGlow: [0.0, 0.0],  atmo: [0.85, 0.55],
          ringChance: 0.08, ringSpan: [1.5, 0.5],   ringOpacity: 0.40, moons: [0, 1], moonChance: 0.15,
          mass: [0.8, 1.0], sling: 2.1, spin: [0.0035, 0.008], sat: [0.85, 0.15], lum: [0.44, 0.14] },
        { id: 3, key: 'barren rock', radius: [34, 62], bands: [4, 8],  nightGlow: [0.0, 0.10], atmo: [0.32, 0.26],
          ringChance: 0.06, ringSpan: [1.6, 0.5],   ringOpacity: 0.35, moons: [0, 1], moonChance: 0.20,
          mass: [0.5, 0.7], sling: 1.7, spin: [0.0012, 0.005], sat: [0.62, 0.26], lum: [0.44, 0.16] },
        { id: 4, key: 'ocean world', radius: [86, 78], bands: [5, 9],  nightGlow: [0.60, 0.70], atmo: [1.05, 0.40],
          ringChance: 0.14, ringSpan: [1.5, 0.5],   ringOpacity: 0.45, moons: [0, 2], moonChance: 0.55,
          mass: [0.9, 1.1], sling: 2.3, spin: [0.0020, 0.005], sat: [0.78, 0.20], lum: [0.34, 0.14] },
        { id: 5, key: 'banded terrestrial', radius: [58, 78], bands: [8, 20], nightGlow: [0.35, 0.85], atmo: [0.95, 0.45],
          ringChance: 0.22, ringSpan: [1.4, 0.55],  ringOpacity: 0.55, moons: [0, 2], moonChance: 0.45,
          mass: [0.8, 1.0], sling: 2.2, spin: [0.0025, 0.006], sat: [0.72, 0.26], lum: [0.38, 0.24] }
    ];

    // Archetype odds by orbital zone. A system should READ as a system —
    // scorched rock close in, gas giants and ice past the frost line — rather
    // than a shuffled bag, and it means the same archetype in two systems
    // still lands in a different place in the flyby.
    //                     gas   ice  molten barren ocean terra
    var ARCH_WEIGHTS = [
        /* inner */ [0.02, 0.02, 0.34, 0.28, 0.10, 0.24],
        /* mid   */ [0.14, 0.10, 0.08, 0.18, 0.24, 0.26],
        /* outer */ [0.34, 0.28, 0.02, 0.20, 0.04, 0.12]
    ];

    function rollArchetype(rand, zone) {
        var w = ARCH_WEIGHTS[zone];
        var total = 0, i;
        for (i = 0; i < w.length; i++) total += w[i];
        var r = rand() * total;
        for (i = 0; i < w.length; i++) {
            r -= w[i];
            if (r <= 0) return ARCHETYPES[i];
        }
        return ARCHETYPES[ARCHETYPES.length - 1];
    }

    function span(rand, pair) { return pair[0] + rand() * pair[1]; }

    // -------------------------------------------------------------------------
    // DISTANCE LOD
    // -------------------------------------------------------------------------
    // A 16-segment sphere facets its own limb into a visible polygon by the
    // time you are three radii out, which is exactly where a player parks to
    // look at a world. Three tiers, built LAZILY: a body you never approach
    // never allocates anything past tier 0, so the galaxy-wide cost of this is
    // unchanged until you actually fly somewhere.
    //
    // Every tier is a SphereGeometry at the body's TRUE radius, so
    // geometry.parameters.radius — which game-physics reads for collision and
    // slingshot thresholds — is identical whichever tier is mounted.
    var LOD_SEGS = [[16, 12], [32, 22], [64, 40]];
    // Stars are up to 600u and are looked at from close range far more often
    // than a rock is, so they start where planets end.
    var STAR_LOD_SEGS = [[24, 16], [44, 30], [80, 52]];

    function lodGeometry(mesh, tier) {
        var ud = mesh.userData;
        var cache = ud.pgLodGeo;
        if (!cache[tier]) {
            var seg = (ud.pgLodSegs || LOD_SEGS)[tier];
            cache[tier] = new THREE.SphereGeometry(ud.radius, seg[0], seg[1]);
        }
        return cache[tier];
    }

    function updateBodyLod(mesh, d2) {
        var ud = mesh.userData;
        if (!ud.pgLodGeo) return;
        var r = ud.radius;
        var d = Math.sqrt(d2);
        var tier = (d < r * 11) ? 2 : (d < r * 46) ? 1 : 0;
        // Hysteresis: only DROP a tier once you are 20% past the boundary, so
        // hovering on a threshold cannot strobe the geometry.
        var cur = ud.pgLodTier;
        if (tier < cur) {
            if (cur === 2 && d < r * 13.2) tier = 2;
            else if (cur >= 1 && tier === 0 && d < r * 55.0) tier = 1;
        }
        if (tier === cur) return;
        ud.pgLodTier = tier;
        mesh.geometry = lodGeometry(mesh, tier);
    }

    // -------------------------------------------------------------------------
    // BODY MATERIAL — one shared program, per-body uniforms
    // -------------------------------------------------------------------------
    function makeBodyMaterial(sys, rand, arch, tShift) {
        var pal = sys.palette;
        // Hue jitter happens in ARC space (see the palette header), so even a
        // ±0.08 swing on an amber world walks toward rose instead of stepping
        // off the end of the wheel into olive. Saturation floors live in the
        // archetype table for the same reason: a desaturated amber is khaki.
        var dayHue = hueNudge(pal.t, tShift + (rand() - 0.5) * 0.16);
        return new THREE.ShaderMaterial({
            uniforms: {
                uDay: { value: hsl(dayHue, span(rand, arch.sat), span(rand, arch.lum)) },
                uNight: { value: pal.night.clone() },
                uRim: { value: pal.rim.clone() },
                uAccent: { value: pal.accent.clone() },
                uSunDir: { value: new THREE.Vector3(1, 0, 0) },
                uBands: { value: span(rand, arch.bands) },
                uSeed: { value: rand() * 10.0 },
                uNightGlow: { value: span(rand, arch.nightGlow) },
                uType: { value: arch.id },
                uAtmo: { value: span(rand, arch.atmo) }
            },
            vertexShader: PLANET_VERT,
            fragmentShader: PLANET_FRAG
        });
    }

    // Two orthonormal vectors spanning a (tilted) orbital plane.
    function orbitBasis(rand, tilt, spread) {
        var incl = (rand() - 0.5) * spread;
        var u = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
        var normal = new THREE.Vector3(0, 1, 0)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt.x + incl)
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt.z + incl * 0.5)
            .normalize();
        u.projectOnPlane(normal).normalize();
        if (!isFinite(u.x) || u.lengthSq() < 0.5) u.set(1, 0, 0).projectOnPlane(normal).normalize();
        var v = new THREE.Vector3().crossVectors(normal, u).normalize();
        return { u: u, v: v };
    }

    function buildRing(sys, rand, radius, arch) {
        var pal = sys.palette;
        var rmat = new THREE.ShaderMaterial({
            uniforms: {
                uColorA: { value: pal.accent.clone() },
                uColorB: { value: pal.rim.clone() },
                uSeed: { value: rand() * 10 },
                uOpacity: { value: arch.ringOpacity }
            },
            vertexShader: RING_VERT,
            fragmentShader: RING_FRAG,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        var ring = new THREE.Mesh(SHARED.ringGeo, rmat);
        var rs = radius * span(rand, arch.ringSpan);
        ring.scale.set(rs, rs, rs);
        // Ring lives in world space alongside the planet rather than as a
        // child, because game-core's updatePlanetOrbits() spins every
        // registered planet on Y — a parented ring would wobble with it.
        ring.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5);
        ring.visible = false;
        ring.frustumCulled = true;
        activeScene().add(ring);
        return ring;
    }

    // Moons are ICE or BARREN only — a moon that reads as a gas giant reads as
    // a bug — and they are always a small fraction of the parent, which is
    // what actually sells the parent's size.
    var MOON_LETTERS = ['a', 'b', 'c'];

    function buildMoon(sys, rand, parent, index) {
        var arch = ARCHETYPES[rand() < 0.42 ? 1 : 3];
        var pr = parent.userData.radius;
        var radius = Math.max(12, Math.min(74, pr * (0.09 + rand() * 0.15)));
        var mat = makeBodyMaterial(sys, rand, arch, (rand() - 0.5) * 0.12);
        var geo = new THREE.SphereGeometry(radius, LOD_SEGS[0][0], LOD_SEGS[0][1]);
        var mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = true;

        var basis = orbitBasis(rand, sys.tilt, 0.9);
        var orbit = pr * (2.4 + rand() * 3.0) + radius * 2.0;

        mesh.userData = {
            // Deliberately 'planet', NOT 'moon': game-core's
            // updateActivePlanets() force-sets `visible = true` on every
            // userData.type === 'moon' in the planets array every frame, which
            // would strand these dots visible from 100,000u with no parent
            // drawn. `bodyClass` carries the truth for anything that cares.
            type: 'planet',
            bodyClass: 'moon',
            archetype: arch.key,
            name: parent.userData.name + ' ' + MOON_LETTERS[index % 3],
            systemName: sys.name,
            location: sys.name,
            size: radius,
            radius: radius,
            mass: 0.20 + (radius / 74) * 0.35,
            slingshotMultiplier: 1.5,
            rotationSpeed: 0.001 + rand() * 0.004,
            isProcedural: true,
            procSystem: sys.id,
            // pgMoon* — see the header. `parentPlanet` + `orbitRadius` would
            // hand this body straight to game-core's moon integrator.
            pgParent: parent,
            pgMoonRadius: orbit,
            pgMoonSpeed: (0.55 + rand() * 0.9) / Math.sqrt(orbit / 300),
            pgMoonAngle: rand() * 6.28,
            pgU: basis.u,
            pgV: basis.v,
            pgLodGeo: [geo, null, null],
            pgLodTier: 0
        };

        activeScene().add(mesh);
        registerBody(mesh);
        return mesh;
    }

    function buildPlanet(sys, rand, index, orbitRadius, zone) {
        var arch = rollArchetype(rand, zone);
        var radius = span(rand, arch.radius);
        // A gas giant must never out-size the sun it orbits.
        if (arch.id === 0 && sys.primaryRadius) {
            radius = Math.min(radius, sys.primaryRadius * 0.86);
        }
        // Per-planet geometry at true radius: game-physics reads
        // geometry.parameters.radius for collision + slingshot thresholds, so
        // a shared unit sphere with a scale would silently break both.
        var geo = new THREE.SphereGeometry(radius, LOD_SEGS[0][0], LOD_SEGS[0][1]);
        var mat = makeBodyMaterial(sys, rand, arch, 0.045);

        var mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = true;

        var basis = orbitBasis(rand, sys.tilt, 0.30);

        mesh.userData = {
            type: 'planet',
            bodyClass: arch.key,
            archetype: arch.key,
            name: sys.name + ' ' + ['I', 'II', 'III', 'IV', 'V'][index % 5],
            systemName: sys.name,
            location: sys.name,
            size: radius,
            radius: radius,
            mass: span(rand, arch.mass),
            slingshotMultiplier: arch.sling,
            rotationSpeed: span(rand, arch.spin),
            isProcedural: true,
            procSystem: sys.id,
            // NOTE the pg* prefix — see the header. Using orbitRadius /
            // systemCenter here would hand this body to game-core's orbit
            // integrator and orbit-line builder.
            pgOrbitRadius: orbitRadius,
            pgOrbitSpeed: (0.11 + rand() * 0.16) / Math.sqrt(orbitRadius / 1200),
            pgOrbitAngle: rand() * 6.28,
            pgU: basis.u,
            pgV: basis.v,
            pgLodGeo: [geo, null, null],
            pgLodTier: 0
        };

        activeScene().add(mesh);
        registerBody(mesh);

        var ring = (rand() < arch.ringChance) ? buildRing(sys, rand, radius, arch) : null;

        // Moons: rolled from the archetype, and only ever on a body big enough
        // for the size contrast to land.
        var moons = [];
        if (radius > 78 && rand() < arch.moonChance) {
            var mn = arch.moons[0] + Math.floor(rand() * (arch.moons[1] - arch.moons[0] + 1));
            for (var m = 0; m < mn; m++) moons.push(buildMoon(sys, rand, mesh, m));
        }

        return { mesh: mesh, ring: ring, moons: moons, radius: radius, archetype: arch };
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
            // Moons live in their OWN list, not in sys.planets: every QA probe
            // and the world-shift verifier assume every entry of sys.planets
            // sits at exactly pgOrbitRadius from sys.center, and a moon is
            // anchored to its parent instead.
            moons: [],
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
        // Stars grew with the archetype table. The old 210-340u primary was
        // SMALLER than the new gas giants, which would have read as a planet
        // orbiting a marble; the size ladder now runs
        // star 380-600 > gas giant 255-470 > ocean 86-164 > rock 34-96 > moon 12-74,
        // a ~50x span the player can actually feel from the cockpit.
        if (sys.binary) {
            var sep = 1100 + rand() * 800;
            sys.binarySeparation = sep;
            sys.binaryAngle = rand() * 6.28;
            sys.binarySpeed = 0.05 + rand() * 0.05;
            sys.primaryRadius = 280 + rand() * 140;
            sys.stars.push(buildStar(sys, rand, sys.primaryRadius, new THREE.Vector3(sep * 0.5, 0, 0)));
            sys.stars.push(buildStar(sys, rand, 220 + rand() * 120, new THREE.Vector3(-sep * 0.5, 0, 0)));
            sys.stars[1].mesh.userData.name = name + ' Secondary';
        } else {
            sys.primaryRadius = 380 + rand() * 220;
            sys.stars.push(buildStar(sys, rand, sys.primaryRadius, new THREE.Vector3(0, 0, 0)));
        }

        // --- planets ---
        var planetCount = 3 + Math.floor(rand() * 3);   // 3-5
        // Innermost orbit clears the (now much larger) primary by 3x its
        // radius, so a molten world hugging a 600u sun still has sky under it.
        var orbit = Math.max(1400, sys.primaryRadius * 3.2) + rand() * 900;
        var maxOrbit = orbit;
        var prevRadius = 0;
        for (var i = 0; i < planetCount; i++) {
            // Zone drives the archetype odds — see ARCH_WEIGHTS. Two-planet
            // systems still get an inner and an outer, never two "mids".
            var f = planetCount > 1 ? (i / (planetCount - 1)) : 0.5;
            var zone = f < 0.34 ? 0 : (f < 0.72 ? 1 : 2);
            var built = buildPlanet(sys, rand, i, orbit, zone);
            sys.planets.push(built.mesh);
            for (var mi = 0; mi < built.moons.length; mi++) sys.moons.push(built.moons[mi]);
            if (built.ring) sys.rings.push({ ring: built.ring, planet: built.mesh });
            maxOrbit = orbit;
            // Spacing now scales with the bodies it has to separate: a pair of
            // 470u gas giants on the old flat 900u minimum gap would have
            // intersected each other on every conjunction.
            orbit += 900 + rand() * 1300 + (prevRadius + built.radius) * 1.6;
            prevRadius = built.radius;
        }
        sys.extent = maxOrbit;
        // Discovery radius scales with the system. Orbit spacing now grows
        // with body radius, so a giant-heavy system's outermost world can sit
        // 17,000u out — on a flat 6,000u trigger the player would fly past
        // three planets before the game admitted they had found anything.
        var discR = Math.max(PG.DISCOVER_RANGE, maxOrbit * 0.8);
        sys.discoverR2 = discR * discR;

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
        var bodies = sys.planets.length + sys.stars.length + sys.moons.length;
        // Headline the rarest thing in the system rather than a body count —
        // "1 gas giant" is a reason to fly there, "4 worlds" never was.
        var headline = '';
        for (var hi = 0; hi < sys.planets.length; hi++) {
            var ak = sys.planets[hi].userData.archetype;
            if (ak === 'gas giant') { headline = ', gas giant'; break; }
            if (ak === 'ocean world' && !headline) headline = ', ocean world';
            else if (ak === 'molten world' && !headline) headline = ', molten world';
        }
        var blurb = sys.name + ' — ' + sys.stars.length + (sys.binary ? ' suns' : ' sun') +
                    ', ' + sys.planets.length + ' worlds' +
                    (sys.moons.length ? ' / ' + sys.moons.length + ' moons' : '') +
                    headline + ', ' + sys.palette.flavour +
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

        // COLOUR ASSIGNMENT — additive golden-ratio recurrence.
        //
        //     t_{i+1} = frac(t_i + 0.6180339887)
        //
        // This is the classic low-discrepancy sequence. Three properties, all
        // of which the old `i % 4` family rotation failed:
        //   * consecutive systems land ~62% of the arc apart, so no two
        //     neighbours can read as the same colour;
        //   * for ANY prefix length the points are near-optimally spread, so
        //     a 10-system seed covers the wheel as evenly as a 14-system one
        //     (a plain random draw clumps: six near-magentas and no cyan);
        //   * the step is irrational, so the series has no period at all.
        //
        // A slot-stride scheme (slot = i * k mod count) looks equivalent and
        // is not — measured live at count=13, k=5, every +5 in index moved
        // exactly one slot, putting systems 0/5/10 in adjacent hues. That is
        // the original "I can read the loop" complaint with a longer period.
        var PHI_STEP = 0.6180339887498949;
        var hueT = rand();             // whole sequence rotates per seed

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
            var palette = makePalette(rand, hueT + (rand() - 0.5) * 0.04);
            hueT += PHI_STEP;
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

    // Moons are anchored to their PARENT's current position, not to s.center,
    // so this must always run after placePlanet for the same frame.
    function placeMoon(m) {
        var ud = m.userData;
        var p = ud.pgParent.position;
        var ca = Math.cos(ud.pgMoonAngle) * ud.pgMoonRadius;
        var sa = Math.sin(ud.pgMoonAngle) * ud.pgMoonRadius;
        m.position.set(
            p.x + ud.pgU.x * ca + ud.pgV.x * sa,
            p.y + ud.pgU.y * ca + ud.pgV.y * sa,
            p.z + ud.pgU.z * ca + ud.pgV.z * sa
        );
    }

    // Rebuild every world position in a system from s.center, without advancing
    // any simulation state (orbit angles, binary phase and star time are left
    // exactly as they are). Idempotent: calling it twice changes nothing.
    function resyncSystem(s) {
        s.group.position.copy(s.center);
        for (var k = 0; k < s.stars.length; k++) placeStar(s, s.stars[k]);
        for (var p = 0; p < s.planets.length; p++) placePlanet(s, s.planets[p]);
        for (var m = 0; m < s.moons.length; m++) placeMoon(s.moons[m]);
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
        // LOD runs 3x more often than the visibility pass: at cruise speed the
        // 12-frame coarse cadence is a fifth of a second, long enough to watch
        // a limb un-facet itself after you have already arrived.
        var lodPass = coarse || (frame % 4) === 0;
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

                if (!s.discovered && d2 < (s.discoverR2 || discR2)) fireDiscovery(s);
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
                if (lodPass && star.mesh.visible) {
                    var sdx = star.mesh.position.x - cx,
                        sdy = star.mesh.position.y - cy,
                        sdz = star.mesh.position.z - cz;
                    updateBodyLod(star.mesh, sdx * sdx + sdy * sdy + sdz * sdz);
                }
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
                if (lodPass && pl.visible) {
                    var pdx = pl.position.x - cx, pdy = pl.position.y - cy, pdz = pl.position.z - cz;
                    updateBodyLod(pl, pdx * pdx + pdy * pdy + pdz * pdz);
                }
            }

            // --- moons (anchored to the parent, so strictly after the above) ---
            for (var mo = 0; mo < s.moons.length; mo++) {
                var mn = s.moons[mo];
                mn.userData.pgMoonAngle += mn.userData.pgMoonSpeed * dt;
                placeMoon(mn);
                _v3.subVectors(primary, mn.position).normalize();
                mn.material.uniforms.uSunDir.value.copy(_v3);
                if (lodPass && mn.visible) {
                    var mdx = mn.position.x - cx, mdy = mn.position.y - cy, mdz = mn.position.z - cz;
                    updateBodyLod(mn, mdx * mdx + mdy * mdy + mdz * mdz);
                }
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
                        // Arc position 0..1 — neighbouring rows should differ
                        // by roughly a third of the wheel, never repeat on a
                        // fixed period.
                        hueT: Math.round(s.palette.t * 1000) / 1000,
                        planets: s.planets.length,
                        moons: s.moons.length,
                        archetypes: s.planets.map(function (p) { return p.userData.archetype; }),
                        radii: s.planets.map(function (p) { return Math.round(p.userData.radius); }),
                        binary: s.binary,
                        discovered: s.discovered,
                        active: s.active
                    };
                });
            },
            // Distribution check for QA: archetype histogram + radius span
            // across the whole shell, in one line.
            census: function () {
                var byArch = {}, min = Infinity, max = 0, n = 0, moons = 0;
                for (var i = 0; i < systems.length; i++) {
                    moons += systems[i].moons.length;
                    for (var p = 0; p < systems[i].planets.length; p++) {
                        var ud = systems[i].planets[p].userData;
                        byArch[ud.archetype] = (byArch[ud.archetype] || 0) + 1;
                        if (ud.radius < min) min = ud.radius;
                        if (ud.radius > max) max = ud.radius;
                        n++;
                    }
                }
                return {
                    systems: systems.length, planets: n, moons: moons,
                    archetypes: byArch,
                    radius: { min: Math.round(min), max: Math.round(max),
                              spread: Math.round(max / Math.max(1, min) * 10) / 10 },
                    hues: systems.map(function (s) { return s.palette.key; })
                };
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
