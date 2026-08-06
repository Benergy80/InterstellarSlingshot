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
    if (!scene.fog) return;

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const cyclePos = (now % atmosphericConfig.cycleMs) / atmosphericConfig.cycleMs;
    const mix = 0.5 + 0.5 * Math.sin(cyclePos * Math.PI * 2);

    _fogMixColor.copy(_fogColorA).lerp(_fogColorB, mix);
    scene.fog.color.copy(_fogMixColor);
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

    console.log('🌌 Atmospheric Perspective System loaded (fog-based synthwave horizon haze)');
}
