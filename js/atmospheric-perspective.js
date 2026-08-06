// =============================================================================
// ATMOSPHERIC PERSPECTIVE SYSTEM
// Synthwave depth cueing: distant objects blend toward a neon horizon-glow
// color the farther they sit from the camera, so the eye reads depth even in
// the featureless black of deep space.
//
// Implementation note: an earlier version of this system walked the scene
// graph every 15 frames, caching "far" objects and mutating each material's
// opacity/color by hand — a CPU traversal + per-object write on top of
// everything else animate() does, and it was disabled outright for tanking
// frame time. This version uses THREE.Fog instead. Fog is compiled straight
// into the standard material shaders (MeshBasicMaterial, MeshLambertMaterial,
// MeshStandardMaterial, PointsMaterial all pick it up automatically via each
// material's default `fog: true`), so the distance blend is a few extra ALU
// ops the GPU was already going to spend during the normal draw — zero CPU
// traversal, zero extra draw calls, zero per-object bookkeeping.
// =============================================================================

const atmosphericConfig = {
    // Linear fog range. Local-system content (a few thousand units) sits
    // well inside `fogNear` and reads perfectly clear. Distant nebulas and
    // galaxy cores (45,000-75,000u, see createDistantNebulas/
    // createExoticCoreNebulas/generateSphericalGalaxyPositions in
    // game-objects.js) fall inside the ramp and pick up a light haze without
    // losing their identity; only content beyond `fogFar` fully disappears
    // into the horizon color.
    fogNear: 55000,
    fogFar: 130000,

    // The horizon drifts slowly between these two synthwave hazes — deep
    // violet and a cooler neon blue — so the backdrop never reads as a flat,
    // static color. Custom-shader starfields/nebula point clouds opt out of
    // fog entirely (their `fog` material flag is left at the ShaderMaterial
    // default of unset/false, or explicitly set false), so this only tints
    // stock-material gameplay objects: planets, ships, asteroids, distant
    // galaxy cores.
    //
    // ⚠️ BACKDROP DOMES MUST SET `fog: false` ON THEIR MATERIAL.
    // Every skybox sphere in this game (nebula 195k, CMB 150k, Hubble 140k,
    // galaxy atmosphere 140k) has a radius PAST fogFar, and MeshBasicMaterial
    // defaults to fog: true. A fogged dome is not "slightly hazy" — it is
    // 100% fog colour on every fragment, i.e. a flat sheet of this violet
    // painted over the whole sky at whatever opacity the dome uses, with its
    // texture erased entirely. That is exactly what happened to
    // hubbleSkybox2 (see the fog:false note at its creation in
    // game-objects.js): it spent its whole life as an opaque violet wash
    // instead of the Hubble deep field, and it was the dominant luminance
    // floor in the game. Custom ShaderMaterials are immune (they never
    // include the fog chunk); stock materials are not.
    colorA: 0x2a0e4a,
    colorB: 0x0c1c4a,
    cycleMs: 70000,

    // Kept for compatibility with any external inspection code that reads
    // this config; unused by the fog-based implementation below.
    enabledCategories: {
        planets: true,
        stars: true,
        nebulas: true,
        cosmicFeatures: true,
        debris: true,
        galaxies: true,
        outerSystems: true
    }
};

// =============================================================================
// TONE MAPPING — the display transform the whole scene was missing.
// =============================================================================
// The renderer shipped with `toneMapping = NoToneMapping`, which means every
// shader's output was written to the framebuffer raw and hard-clipped at 1.0.
// In a scene whose whole subject is objects that are literally the brightest
// things in the universe, that is a real problem, and it showed up worst on
// the black holes: an accretion disk painted at 8-bit values peaked around
// 64% screen brightness while background star sprites — drawn at a flat 1.0 —
// clipped to pure white. The hierarchy was inverted, and no amount of pushing
// the disk's colours could fix it, because there was nowhere above 1.0 to go.
//
// ACESFilmic gives the scene a shoulder. Emissive materials can now carry
// over-range colours (the Gargantua disk/photon ring in game-objects.js run at
// 2.6x and 1.85x) and the curve rolls them smoothly into white instead of
// slamming into a clip, which is what reads on screen as bloom.
//
// EXPOSURE 1.2 is chosen, not default. ACES at exposure 1.0 crushes shadows
// and pulls pure white down to 0.76 — it would have muted the neon this game
// is built on. At 1.2 the deep-space floor stays essentially where it was
// (0.05 -> 0.043, still black), mid-tones lift ~1.4x so nebula and neon get
// RICHER rather than washed, white sits at 0.80 with real headroom above it,
// and an over-range 2.0 lands at 0.91 / 4.0 at 0.96 — a genuine highlight
// roll-off rather than a step.
//
// This lives here rather than in the renderer setup because that file belongs
// to another owner; switching it at first update is equivalent as long as we
// invalidate the materials that were already compiled without the tone-mapping
// chunk (the program cache key includes toneMapping, so anything built after
// the switch picks it up automatically).
const TONE_MAPPING_EXPOSURE = 1.2;

// NOT a one-shot boolean. The game builds THREE renderers more than once —
// game-intro.js creates its own for the launch sequence and then the main
// renderer replaces it on the same global — so a latched "already done" flag
// gets set on the intro's renderer and the real one never receives the tone
// curve. Instead we check the live renderer's state every call (a cheap
// integer compare, every 15 frames) and re-apply if it isn't ours.
function _ensureToneMapping() {
    if (typeof THREE === 'undefined' || typeof renderer === 'undefined' || !renderer) return;
    if (typeof THREE.ACESFilmicToneMapping === 'undefined') return;
    if (renderer.toneMapping === THREE.ACESFilmicToneMapping) {
        if (renderer.toneMappingExposure !== TONE_MAPPING_EXPOSURE) {
            renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
        }
        return;
    }

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;

    // One-time recompile sweep for everything already in the graph.
    if (typeof scene !== 'undefined' && scene && scene.traverse) {
        scene.traverse(function (obj) {
            const mat = obj.material;
            if (!mat) return;
            if (Array.isArray(mat)) {
                for (let i = 0; i < mat.length; i++) if (mat[i]) mat[i].needsUpdate = true;
            } else {
                mat.needsUpdate = true;
            }
        });
    }
    console.log('🎞️ ACESFilmic tone mapping engaged (exposure ' + TONE_MAPPING_EXPOSURE + ') — emissives can bloom past 1.0');
}

let _fogInitialized = false;
let _fogColorA = null;
let _fogColorB = null;
let _fogMixColor = null;

// Lazily create scene.fog the first time we're called with a live scene —
// atmospheric-perspective.js loads before game-core.js creates `scene`, so
// this can't happen at parse time.
function _ensureAtmosphericFog() {
    if (_fogInitialized) return;
    if (typeof scene === 'undefined' || !scene || typeof THREE === 'undefined') return;

    _fogColorA = new THREE.Color(atmosphericConfig.colorA);
    _fogColorB = new THREE.Color(atmosphericConfig.colorB);
    _fogMixColor = new THREE.Color();

    if (!scene.fog) {
        scene.fog = new THREE.Fog(atmosphericConfig.colorA, atmosphericConfig.fogNear, atmosphericConfig.fogFar);
    }
    _fogInitialized = true;
    console.log('🌌 Synthwave atmospheric fog engaged:', atmosphericConfig.fogNear, '→', atmosphericConfig.fogFar, 'units');
}

// =============================================================================
// PER-FRAME UPDATE (throttled to every 15 frames by the caller in
// game-core.js — plenty for a 70-second color drift)
// =============================================================================
function updateAtmosphericPerspective(camera) {
    if (!camera || !camera.position || typeof scene === 'undefined' || !scene) return;

    _ensureToneMapping();
    _ensureAtmosphericFog();

    // Near-field atmosphere: limb falloff + scatter shells on the bodies the
    // player is actually looking at. Runs BEFORE the fog early-out, because a
    // scene without fog still has planets in it.
    _updatePlanetaryAtmospheres(camera);

    if (!scene.fog) return;

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const cyclePos = (now % atmosphericConfig.cycleMs) / atmosphericConfig.cycleMs;
    const mix = 0.5 + 0.5 * Math.sin(cyclePos * Math.PI * 2);

    _fogMixColor.copy(_fogColorA).lerp(_fogColorB, mix);
    scene.fog.color.copy(_fogMixColor);
}

// =============================================================================
// NEAR-FIELD ATMOSPHERE — the fix for "planets are flat 2D stickers"
// =============================================================================
// Measured on the largest world in the game framed at 3 radii: mean luminance
// of the inner 40% of the disc was 104 and the 85–95% radius annulus was 108 —
// a limb ratio of 1.04. The edge of the ball was as bright as the sub-solar
// point, so the eye had nothing to integrate into a sphere and read a decal.
// And the silhouette ended at a hard polygon boundary: the pixel 2px outside
// the disc already matched the background 30px out. No scatter, no falloff.
//
// Two things fix that, and they are the two things every real
// planet-from-orbit shot is built on:
//
//   1. CENTRE-TO-LIMB FALLOFF. The body's own lit colour is multiplied by
//      (0.14 + 0.86 * pow(N·V, 0.72)) — a classic limb-darkening curve, not a
//      vignette: it lands the 85–95% annulus at ~0.60 of the sub-solar point
//      and holds 0.98 across the inner 40%, so the shading gradient is doing
//      the work a normal map would. Plus a blue Rayleigh in-scatter term that
//      does NOT go dark at the terminator, so the atmosphere still glows a
//      quarter of the way onto the night side.
//
//   2. A SCATTER SHELL. A back-faced sphere at 1.115 radii with an additive
//      profile that peaks exactly at the body's own limb and decays to zero at
//      its own silhouette — so there is no hard outer ring, the halo just
//      stops. It wraps the WHOLE silhouette including the night side (dimmer,
//      sun-weighted), which is what makes a lit crescent read as a ball with
//      air on it rather than as a lit shape.
//
// WHY IT LIVES HERE, AND NOT IN THE BODY BUILDER. Same reason the tone curve
// above does: js/proc-galaxies.js belongs to another owner. Both halves are
// applied to the bodies that file already built, from the update hook this
// file already owns, and both are strictly opt-out-safe: the shader patch is
// anchored to exact source lines and SKIPS any material whose shader has
// already grown a limb term (so if the builder ever ships its own, this stands
// down instead of double-darkening).
//
// COST. The limb half is free: it is the same shared program with three more
// ALU ops, and every patched material is handed the SAME patched source string
// by reference, so 3,533 bodies still link exactly one program and cost zero
// extra bytes. The shell half is bounded by construction — at most
// AP_ATMO.maxShells live shells, recycled by on-screen size — and it is the
// one piece of additive geometry added by this pass. Back faces + depthWrite
// off means the far hemisphere fails the depth test against the body itself
// everywhere except the thin annulus outside the silhouette, so the overdraw
// is the ring, not the disc. The shader also fades the whole shell out as the
// camera approaches (`away`), because the one way this becomes a full-screen
// additive quad is flying inside it.
// =============================================================================

const AP_ATMO = {
    // Shell radius as a multiple of the body radius. At a proper hero framing
    // (planet ~61% of frame height) this puts ~22px of glow outside a ~192px
    // disc — the 20–40px band the reference shots sit in.
    shellScale: 1.115,
    // Tuned against a screenshot, not a number: at 1.15 the halo read as a
    // neon outline drawn ON the planet — a sticker with a highlighter round
    // it. At 0.55 it reads as air.
    strength: 0.55,
    // Hard ceiling on live shells. A dense system shows ~6; the cap exists so
    // a pathological frame cannot turn this into an additive fill-rate bomb.
    maxShells: 40,
    // Below this angular radius (r / distance) a shell is sub-pixel and is not
    // worth a draw call: 0.008 ≈ a 5px radius at this FOV and canvas size.
    minAngular: 0.008,
    // Inside this many radii the shell would start wrapping the camera; the
    // shader fades it out and the scan stops handing it one.
    minRadii: 1.9,
    enabled: true
};

// Rayleigh push. Whatever hue a world's rim carries, its air leans blue —
// that shared blue across a magenta world and an amber one is exactly what
// makes both of them read as "planet with atmosphere" instead of "ball".
const _AP_RAYLEIGH = { r: 0.34, g: 0.56, b: 1.0 };

// ---------------------------------------------------------------- limb patch
// Anchored to two exact lines of the shared body shader. If either anchor is
// missing the patch stands down (logged once) rather than guessing.
const _AP_ANCHOR_FRES = '  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.6);';
const _AP_ANCHOR_OUT = '  gl_FragColor = vec4(col, 1.0);';

// The exponents below are not taste, they are a fit. Measured live on a hero
// gas giant framed at 3 radii (canvas 1120x630, ACES @ 1.2, LinearEncoding
// output), sampling the TRUE silhouette radius r/sqrt(1-(r/d)^2) rather than
// the projected equator — at 3 radii those differ by 6%, which is 8px of
// "disc" that is really sky. Annulus(85–95%) / centre(inner 40%) luminance:
//
//     unpatched .................................. 0.94   (the bug)
//     pow 1.35, rim adds at 0.28 ................. 0.51   (overshoots dark)
//     pow 1.10, rim adds at 0.28 ................. 0.60   <- shipped
//     pow 0.95, rim adds at 0.28 ................. 0.67
//
// The rim glow the old adds painted INSIDE the disc is not lost, it moved
// OUTSIDE it, where a real atmosphere puts it (the shell below).
const _AP_INJECT_FRES = [
    '  // AP-LIMB: centre-to-limb falloff. Applied to the LIT colour only —',
    '  // it runs before the fresnel/terminator adds below so the atmosphere',
    '  // still brightens the very edge instead of being darkened with it.',
    '  float ndv = max(dot(n, V), 0.0);',
    '  col *= (0.065 + 0.935 * pow(ndv, 1.10));',
    '  float fres = pow(1.0 - ndv, 3.4) * 0.28;'
].join('\n');

const _AP_INJECT_OUT = [
    '  // AP-LIMB: Rayleigh in-scatter. Deliberately NOT multiplied by `day`,',
    '  // so the air keeps glowing a quarter of the way past the terminator',
    '  // and hands off continuously to the scatter shell outside the disc.',
    '  float apScat = pow(1.0 - ndv, 2.2);',
    '  float apWrap = smoothstep(-0.80, 0.22, lam);',
    '  col += mix(uRim, vec3(0.34, 0.56, 1.0), 0.45) * apScat * 0.28 *',
    '         (0.16 + 0.52 * apWrap) * (0.30 + 0.70 * uAtmo);',
    '  gl_FragColor = vec4(col, 1.0);'
].join('\n');

// One source in, one source out — cached, so all 3,533 bodies share a single
// patched string (one program, no duplicated shader text).
let _apSrcIn = null;
let _apSrcOut = null;
let _apPatchWarned = false;
let _apPatched = 0;

function _apPatchBodyMaterial(mat) {
    if (!mat || !mat.uniforms) return false;
    const u = mat.uniforms;
    // Body signature: the shared planet/moon program. Stars (uCore/uTime),
    // rings, wisps and every stock material fail this and are left alone.
    if (!u.uDay || !u.uAtmo || !u.uNightGlow || !u.uRim) return false;
    if (!mat.userData) mat.userData = {};
    if (mat.userData.apLimb) return false;

    const src = mat.fragmentShader;
    if (typeof src !== 'string') return false;
    // Someone else already gave this shader a limb term — stand down.
    if (src.indexOf('AP-LIMB') >= 0 || src.indexOf('limb') >= 0) {
        mat.userData.apLimb = true;
        return false;
    }

    if (src !== _apSrcIn) {
        if (src.indexOf(_AP_ANCHOR_FRES) < 0 || src.indexOf(_AP_ANCHOR_OUT) < 0) {
            if (!_apPatchWarned) {
                _apPatchWarned = true;
                console.warn('🌍 limb patch stood down: body shader anchors not found (builder changed?)');
            }
            mat.userData.apLimb = true;   // don't retry every pass
            return false;
        }
        _apSrcIn = src;
        _apSrcOut = src.replace(_AP_ANCHOR_FRES, _AP_INJECT_FRES)
                       .replace(_AP_ANCHOR_OUT, _AP_INJECT_OUT);
    }

    mat.fragmentShader = _apSrcOut;       // shared reference, not a copy
    mat.needsUpdate = true;
    mat.userData.apLimb = true;
    _apPatched++;
    return true;
}

// ---------------------------------------------------------------- the shell
// The centre and the world radius are read straight off modelMatrix, so the
// shell needs no per-frame uniform writes at all: parent it to the body once
// and it tracks the orbit for free.
const _AP_SHELL_VERT = [
    'varying vec3 vWP;',
    'varying vec3 vC;',
    'varying float vR;',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWP = wp.xyz;',
    '  vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
    '  vC = c;',
    '  vR = length((modelMatrix * vec4(1.0, 0.0, 0.0, 1.0)).xyz - c);',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
].join('\n');

// The whole trick is `b`: the impact parameter of the view ray about the body
// centre, in units of the shell radius. That is an exact screen-space radius
// for this fragment, which lets the glow be profiled as a RING that peaks at
// the body's limb and reaches zero at the shell's own silhouette. A plain
// fresnel on a back-faced sphere does the opposite — it peaks at the outer
// edge, which is a hard bright hoop, the exact artefact that makes bolt-on
// atmospheres look like decals.
const _AP_SHELL_FRAG = [
    'uniform vec3 uTint;',
    'uniform vec3 uSunDir;',
    'uniform float uAtmo;',
    'uniform float uInner;',
    'uniform float uStrength;',
    'uniform float uSunLock;',
    'varying vec3 vWP;',
    'varying vec3 vC;',
    'varying float vR;',
    'void main() {',
    '  vec3 D = normalize(vWP - cameraPosition);',
    '  vec3 OC = vC - cameraPosition;',
    '  float tca = dot(OC, D);',
    '  float d2 = dot(OC, OC);',
    '  float rS = max(vR, 1e-4);',
    '  float b = sqrt(max(0.0, d2 - tca * tca)) / rS;',
    // Ring profile. `outer` dies at the shell silhouette, `inner` dies toward
    // the disc centre — the second one is depth-test insurance: the body
    // already occludes that region, and if depth precision ever fails to
    // resolve it at 100,000u the shell still has nothing to paint there.
    '  float outer = 1.0 - smoothstep(uInner, 1.0, b);',
    '  float inner = smoothstep(uInner * 0.55, uInner * 0.99, b);',
    '  float g = pow(outer, 1.3) * inner;',
    // Sun weighting around the ring: bright on the day limb, still present on
    // the night limb, which is what "wraps past the terminator" means.
    '  vec3 rn = normalize(vWP - vC);',
    '  float lam = dot(rn, uSunDir);',
    '  float lit = mix(1.0, smoothstep(-0.62, 0.28, lam), uSunLock);',
    // Fly inside the shell and every back face is suddenly in front of you.
    '  float away = smoothstep(1.02, 1.85, sqrt(d2) / rS);',
    '  float amt = g * uStrength * (0.20 + 0.80 * lit) * away * (0.42 + 0.58 * uAtmo);',
    '  gl_FragColor = vec4(uTint * amt, 1.0);',
    '}'
].join('\n');

let _apShellGeo = null;
const _apShells = [];
const _apCands = [];
let _apTintColor = null;
let _apRayleighColor = null;
let _apTmpVec = null;

function _apMakeShell() {
    if (!_apShellGeo) {
        // 32x20 is generous for a glow, but the outer edge fades to zero so
        // the polygon silhouette is never visible — this is about the INNER
        // edge sitting cleanly on the body's own limb at hero framing.
        _apShellGeo = new THREE.SphereGeometry(1, 32, 20);
    }
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTint: { value: new THREE.Color(0.55, 0.72, 1.0) },
            uSunDir: { value: new THREE.Vector3(1, 0, 0) },
            uAtmo: { value: 0.55 },
            uInner: { value: 1.0 / AP_ATMO.shellScale },
            uStrength: { value: AP_ATMO.strength },
            uSunLock: { value: 1.0 }
        },
        vertexShader: _AP_SHELL_VERT,
        fragmentShader: _AP_SHELL_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
        fog: false
    });
    const mesh = new THREE.Mesh(_apShellGeo, mat);
    mesh.name = 'apAtmoShell';
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    // Invisible to the targeting/crosshair raycasts that walk planets with
    // recursive = true.
    mesh.raycast = function () {};
    mesh.userData = { isAtmosphereShell: true, host: null };
    _apShells.push(mesh);
    return mesh;
}

function _apBindShell(shell, body, radius) {
    const prev = shell.userData.host;
    if (prev && prev !== body && prev.userData && prev.userData._apShell === shell) {
        prev.userData._apShell = null;
    }
    // A body gets exactly one shell. Without this, a body whose back-reference
    // went stale could end up wearing two of them — double-bright halo, and a
    // shell nobody can ever recycle.
    const sitting = body.userData._apShell;
    if (sitting && sitting !== shell && sitting.parent === body) {
        body.remove(sitting);
        sitting.userData.host = null;
    }
    if (shell.parent !== body) {
        if (shell.parent) shell.parent.remove(shell);
        body.add(shell);
    }
    shell.userData.host = body;
    body.userData._apShell = shell;

    const bm = body.material;
    const bu = (bm && bm.uniforms) ? bm.uniforms : null;
    const proc = !!(bu && bu.uRim && bu.uSunDir);
    const u = shell.material.uniforms;

    if (proc) _apTintColor.copy(bu.uRim.value);
    else if (bm && bm.color) _apTintColor.copy(bm.color);
    else _apTintColor.setRGB(0.55, 0.72, 1.0);
    _apTintColor.lerp(_apRayleighColor, 0.45);
    // Normalise brightness so a dim world's rim colour still produces a shell
    // you can see — the hue is the world's, the intensity is ours.
    const mx = Math.max(_apTintColor.r, _apTintColor.g, _apTintColor.b);
    if (mx > 0.001) _apTintColor.multiplyScalar(0.92 / mx);
    u.uTint.value.copy(_apTintColor);

    u.uAtmo.value = (proc && bu.uAtmo) ? bu.uAtmo.value : 0.55;
    // Share the body's OWN uSunDir uniform object by reference — proc-galaxies
    // rewrites its value every frame as the world orbits, so the halo's lit
    // side tracks the sun with no work on our side. Stock-material bodies have
    // no such uniform, so their shell is sun-agnostic (uSunLock = 0).
    u.uSunDir = proc ? bu.uSunDir : { value: new THREE.Vector3(1, 0, 0) };
    u.uSunLock.value = proc ? 1.0 : 0.0;
    u.uStrength.value = AP_ATMO.strength;
    u.uInner.value = 1.0 / AP_ATMO.shellScale;

    const s = radius * AP_ATMO.shellScale;
    shell.scale.set(s, s, s);
    shell.position.set(0, 0, 0);
    shell.updateMatrix();
    shell.visible = true;
    shell.userData.radius = radius;
}

// WORLD position, read straight out of matrixWorld. `object.position` is
// LOCAL, and a good half of this game's moons are parented to their planet —
// scoring those on their local offset made every 2-unit moon look like it was
// filling the screen and they took every shell in the pool.
function _apWorldPos(obj, out) {
    const e = obj.matrixWorld.elements;
    out.x = e[12]; out.y = e[13]; out.z = e[14];
    return out;
}

// Angular size of a shell's current host, or -1 if it has none / it is gone.
// Used to decide which shell to steal when the cap is reached.
function _apHostScore(shell, cp) {
    const h = shell.userData.host;
    if (!h || !h.parent || !h.visible) return -1;
    const r = shell.userData.radius || 0;
    if (r <= 0) return -1;
    _apWorldPos(h, _apTmpVec);
    const dx = _apTmpVec.x - cp.x, dy = _apTmpVec.y - cp.y, dz = _apTmpVec.z - cp.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return d > 1e-4 ? r / d : 1e6;
}

function _apAcquireShell(cp, wantAng) {
    if (_apShells.length < AP_ATMO.maxShells) return _apMakeShell();
    let worst = -1, worstScore = Infinity;
    for (let i = 0; i < _apShells.length; i++) {
        const sc = _apHostScore(_apShells[i], cp);
        if (sc < worstScore) { worstScore = sc; worst = i; }
    }
    if (worst < 0 || worstScore >= wantAng) return null;   // nothing worth stealing
    return _apShells[worst];
}

function _apAngDesc(a, b) { return b.ang - a.ang; }

function _updatePlanetaryAtmospheres(camera) {
    if (!AP_ATMO.enabled || typeof THREE === 'undefined') return;
    const arr = (typeof planets !== 'undefined' && planets) ? planets
              : ((typeof window !== 'undefined' && window.planets) ? window.planets : null);
    if (!arr || !arr.length) return;
    if (!_apTintColor) {
        _apTintColor = new THREE.Color();
        _apRayleighColor = new THREE.Color(_AP_RAYLEIGH.r, _AP_RAYLEIGH.g, _AP_RAYLEIGH.b);
        _apTmpVec = new THREE.Vector3();
    }

    const cp = camera.position;
    _apCands.length = 0;

    for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (!b || !b.material || !b.geometry || !b.userData) continue;
        const ud = b.userData;
        if (ud.type !== 'planet' && ud.type !== 'moon') continue;

        // The limb half is free and applies to every body in the galaxy,
        // visible or not — one O(1) flag check per body per 15 frames.
        _apPatchBodyMaterial(b.material);

        if (!b.visible || ud._distCulled) continue;
        const r = ud.radius || ud.size ||
                  (b.geometry.parameters ? b.geometry.parameters.radius : 0) || 0;
        if (r <= 0) continue;
        _apWorldPos(b, _apTmpVec);
        const dx = _apTmpVec.x - cp.x, dy = _apTmpVec.y - cp.y, dz = _apTmpVec.z - cp.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < r * AP_ATMO.minRadii) continue;
        const ang = r / d;
        if (ang < AP_ATMO.minAngular) continue;
        _apCands.push({ b: b, r: r, ang: ang });
    }

    if (!_apCands.length) return;
    _apCands.sort(_apAngDesc);

    const want = Math.min(_apCands.length, AP_ATMO.maxShells);
    for (let i = 0; i < want; i++) {
        const c = _apCands[i];
        const existing = c.b.userData._apShell;
        if (existing && existing.parent === c.b) {
            // Radius never changes for a built body, but LOD swaps geometry —
            // keep the scale honest anyway, it is two compares.
            if (existing.userData.radius !== c.r) _apBindShell(existing, c.b, c.r);
            continue;
        }
        const shell = _apAcquireShell(cp, c.ang);
        if (!shell) break;
        _apBindShell(shell, c.b, c.r);
    }
}

// QA hook: what the near-field atmosphere pass is actually doing right now.
function atmosphereDebug() {
    const live = _apShells.filter(function (s) {
        return s.userData.host && s.userData.host.visible;
    });
    return {
        limbPatchedMaterials: _apPatched,
        limbPatchActive: !!_apSrcOut,
        shellsAllocated: _apShells.length,
        shellsLive: live.length,
        shellScale: AP_ATMO.shellScale,
        hosts: live.map(function (s) {
            return (s.userData.host.userData.name || '?') +
                   ' r=' + Math.round(s.userData.radius);
        })
    };
}

// =============================================================================
// DEPTH OF FIELD — left disabled (full-scene traversal was too expensive for
// the gain); stubs kept so any external `typeof enableDepthOfField ===
// 'function'` checks keep working.
// =============================================================================
let depthOfFieldEnabled = false;

function enableDepthOfField() {
    depthOfFieldEnabled = true;
}

function disableDepthOfField() {
    depthOfFieldEnabled = false;
}

function updateDepthOfFieldEffect() {
    // Intentionally inert — see comment above.
}

// =============================================================================
// EXPORTS
// =============================================================================
if (typeof window !== 'undefined') {
    window.updateAtmosphericPerspective = updateAtmosphericPerspective;
    window.updateDepthOfFieldEffect = updateDepthOfFieldEffect;
    window.enableDepthOfField = enableDepthOfField;
    window.disableDepthOfField = disableDepthOfField;
    window.atmosphericConfig = atmosphericConfig;
    window.ensureToneMapping = _ensureToneMapping;
    // Near-field atmosphere (limb falloff + scatter shells). AP_ATMO is live:
    // strength / shellScale / maxShells can be nudged from the console and the
    // next pass picks them up, `enabled = false` stops handing out new shells.
    window.AP_ATMO = AP_ATMO;
    window.atmosphereDebug = atmosphereDebug;

    console.log('🌌 Atmospheric Perspective System loaded (fog + planetary limb/scatter shells)');
}
