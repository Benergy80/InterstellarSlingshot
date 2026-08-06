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

    console.log('🌌 Atmospheric Perspective System loaded (fog-based synthwave horizon haze)');
}
