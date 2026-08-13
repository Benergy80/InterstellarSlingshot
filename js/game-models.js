// Game Models - GLB Model Loading and Management System
// Handles loading and caching of enemy, boss, and player 3D models

console.log('🎨 GAME MODELS SCRIPT LOADED 🎨');

// Check if GLTFLoader is already available from the script tag
if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined') {
    console.log('✅ GLTFLoader is available as THREE.GLTFLoader');
} else {
    console.warn('⚠️ GLTFLoader not yet available, will load dynamically');
}

console.log('🔄 Initializing game models system...');

// =============================================================================
// GLTF LOADER SETUP
// =============================================================================

// Import GLTFLoader from CDN
let GLTFLoader;

// Load GLTFLoader from CDN (fallback - should be loaded via script tag)
function loadGLTFLoader() {
    return new Promise((resolve, reject) => {
        // GLTFLoader should already be loaded via script tag in index.html
        if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined') {
            console.log('✅ Using existing THREE.GLTFLoader');
            resolve();
            return;
        }

        console.log('📥 Attempting to load GLTFLoader dynamically...');
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
        script.onload = () => {
            console.log('✅ GLTFLoader script loaded from CDN');
            if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined') {
                console.log('✅ THREE.GLTFLoader is now available');
                resolve();
            } else {
                console.error('❌ THREE.GLTFLoader not found after script load');
                reject(new Error('GLTFLoader not found after script load'));
            }
        };
        script.onerror = () => {
            console.error('❌ Failed to load GLTFLoader script from CDN');
            reject(new Error('Failed to load GLTFLoader'));
        };
        document.head.appendChild(script);
    });
}

// =============================================================================
// MODEL CACHE
// =============================================================================

const modelCache = {
    enemies: {},    // enemyModels[1-8] = loaded model
    bosses: {},     // bossModels[1-8] = loaded model
    player: null,   // player model
    loaded: false,  // flag to indicate all models are loaded
    loadingProgress: 0
};

// =============================================================================
// MODEL LOADING FUNCTIONS
// =============================================================================

// Load a single GLB model
function loadGLBModel(path) {
    return new Promise((resolve, reject) => {
        // Version GLB URLs by the build tag (not Date.now()). A per-load
        // timestamp gave every model a unique URL, so the browser re-downloaded
        // ~3-5MB of models on EVERY visit (incl. SpaceProbe 2MB, Satellite2 1.4MB).
        // Keying on BUILD_TAG lets returning visitors cache models and only
        // re-fetch when a new build ships.
        const cacheBustPath = `${path}?v=${window.BUILD_TAG || 'v1'}`;
        console.log(`📥 Attempting to load: ${cacheBustPath}`);

        try {
            const loader = new THREE.GLTFLoader();
            console.log(`🔧 GLTFLoader instantiated for: ${path}`);

            loader.load(
                cacheBustPath,
                (gltf) => {
                    console.log(`✅ Successfully loaded model: ${path}`);
                    console.log(`   - Scene children:`, gltf.scene.children.length);
                    resolve(gltf.scene);
                },
                (progress) => {
                    if (progress.total > 0) {
                        const percent = (progress.loaded / progress.total) * 100;
                        console.log(`⏳ Loading ${path}: ${percent.toFixed(1)}%`);
                    }
                },
                (error) => {
                    console.error(`❌ FAILED to load ${path}`);
                    console.error(`   - Error type:`, error.constructor.name);
                    console.error(`   - Error message:`, error.message);
                    console.error(`   - Full error:`, error);
                    reject(error);
                }
            );
        } catch (err) {
            console.error(`❌ Exception while setting up loader for ${path}:`, err);
            reject(err);
        }
    });
}

// Load all enemy models (Enemy1.glb through Enemy8.glb)
async function loadEnemyModels() {
    console.log('🎯 === LOADING ENEMY MODELS ===');
    const promises = [];

    for (let i = 1; i <= 8; i++) {
        const path = `models/Enemy${i}.glb`;
        console.log(`🎯 Queueing enemy ${i}: ${path}`);
        promises.push(
            loadGLBModel(path)
                .then(model => {
                    console.log(`✅ Enemy ${i} cached successfully`);
                    modelCache.enemies[i] = model;
                    modelCache.loadingProgress += (1 / 17) * 100; // 17 total models
                })
                .catch(err => {
                    console.warn(`⚠️ Failed to load ${path}, will use fallback geometry`);
                    console.warn(`   Error:`, err.message);
                    modelCache.enemies[i] = null;
                })
        );
    }

    console.log(`🎯 Waiting for ${promises.length} enemy models to load...`);
    await Promise.all(promises);
    console.log('✅ === ENEMY MODELS BATCH COMPLETE ===');

    // Log summary
    let successCount = 0;
    for (let i = 1; i <= 8; i++) {
        if (modelCache.enemies[i]) successCount++;
    }
    console.log(`📊 Enemy models: ${successCount}/8 loaded successfully`);
}

// Load all boss models (Boss1.glb through Boss8.glb)
async function loadBossModels() {
    console.log('👑 === LOADING BOSS MODELS ===');
    const promises = [];

    for (let i = 1; i <= 8; i++) {
        const path = `models/Boss${i}.glb`;
        console.log(`👑 Queueing boss ${i}: ${path}`);
        promises.push(
            loadGLBModel(path)
                .then(model => {
                    console.log(`✅ Boss ${i} cached successfully`);
                    modelCache.bosses[i] = model;
                    modelCache.loadingProgress += (1 / 17) * 100; // 17 total models
                })
                .catch(err => {
                    console.warn(`⚠️ Failed to load ${path}, will use fallback geometry`);
                    console.warn(`   Error:`, err.message);
                    modelCache.bosses[i] = null;
                })
        );
    }

    console.log(`👑 Waiting for ${promises.length} boss models to load...`);
    await Promise.all(promises);
    console.log('✅ === BOSS MODELS BATCH COMPLETE ===');

    // Log summary
    let successCount = 0;
    for (let i = 1; i <= 8; i++) {
        if (modelCache.bosses[i]) successCount++;
    }
    console.log(`📊 Boss models: ${successCount}/8 loaded successfully`);
}

// Load player model (Player.glb)
async function loadPlayerModel() {
    console.log('🚀 === LOADING PLAYER MODEL ===');
    const path = 'models/Player.glb';

    try {
        const model = await loadGLBModel(path);

        // Debug: Log what's in the model
        let meshCount = 0;
        let vertexCount = 0;
        model.traverse((child) => {
            if (child.isMesh) {
                meshCount++;
                if (child.geometry) {
                    const positions = child.geometry.attributes.position;
                    if (positions) {
                        vertexCount += positions.count;
                    }
                }
            }
        });
        console.log(`  Player model: ${meshCount} mesh(es), ~${vertexCount} vertices total`);

        modelCache.player = model;
        modelCache.loadingProgress += (1 / 17) * 100; // 17 total models
        console.log('✅ === PLAYER MODEL LOADED AND CACHED ===');
        if (window.Boot) window.Boot.signal('playerModel');
    } catch (err) {
        console.error('❌ Failed to load Player.glb, player will be camera-only');
        console.error(`   Error:`, err.message);
        console.error(`   Stack:`, err.stack);
        modelCache.player = null;
    }
}

// Main function to load all models
async function loadAllModels() {
    console.log('🚀 Starting model loading...');
    console.log('📍 Current location:', window.location.href);

    try {
        // First, ensure GLTFLoader is available
        if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
            console.log('📦 THREE.GLTFLoader not found, attempting to load...');
            await loadGLTFLoader();
        } else {
            console.log('✅ THREE.GLTFLoader already available');
        }

        console.log('🔄 About to load all models in parallel...');

        // Load all models in parallel with individual error handling
        const results = await Promise.allSettled([
            loadEnemyModels().catch(err => {
                console.error('❌ Enemy models batch failed:', err);
                throw err;
            }),
            loadBossModels().catch(err => {
                console.error('❌ Boss models batch failed:', err);
                throw err;
            }),
            loadPlayerModel().catch(err => {
                console.error('❌ Player model failed:', err);
                throw err;
            })
        ]);

        console.log('📊 Loading results:', results);

        // Check which ones succeeded
        results.forEach((result, index) => {
            const names = ['Enemy models', 'Boss models', 'Player model'];
            if (result.status === 'fulfilled') {
                console.log(`✅ ${names[index]} - SUCCESS`);
            } else {
                console.error(`❌ ${names[index]} - FAILED:`, result.reason);
            }
        });

        modelCache.loaded = true;
        modelCache.loadingProgress = 100;
        console.log('🎉 Model loading process completed!');
        if (window.Boot) window.Boot.signal('models');

        return true;
    } catch (error) {
        console.error('❌ Critical error in loadAllModels:', error);
        console.error('Stack trace:', error.stack);
        return false;
    }
}

// =============================================================================
// MODEL RETRIEVAL FUNCTIONS
// =============================================================================

// Get enemy model for a specific region (1-8)
function getEnemyModel(regionId) {
    const model = modelCache.enemies[regionId];
    // console.log(`🔍 getEnemyModel(${regionId}) - model in cache:`, !!model);
    if (model) {
        // Clone the model so we can have multiple instances
        const clone = model.clone();
        // console.log(`   Cloned model type:`, clone.type, `isGroup:`, clone.isGroup, `children:`, clone.children.length);
        return clone;
    }
    console.log(`   ❌ No model in cache for region ${regionId}, returning null`);
    return null;
}

// Get boss model for a specific region (1-8)
function getBossModel(regionId) {
    const model = modelCache.bosses[regionId];
    if (model) {
        // Clone the model so we can have multiple instances
        return model.clone();
    }
    return null;
}

// Get player model
function getPlayerModel() {
    console.log('🔍 getPlayerModel called');
    console.log('  - Player model in cache?', !!modelCache.player);
    if (modelCache.player) {
        console.log('  - Cloning player model...');
        const clone = modelCache.player.clone();
        console.log('  - Clone created successfully:', !!clone);
        return clone;
    }
    console.warn('⚠️ No player model in cache, returning null');
    return null;
}

// Check if all models are loaded
function areModelsLoaded() {
    return modelCache.loaded;
}

// Get loading progress (0-100)
function getModelLoadingProgress() {
    return modelCache.loadingProgress;
}

// =============================================================================
// HELPER FUNCTIONS FOR MODEL INTEGRATION
// =============================================================================

const _enemyModelScaleCorrection = {
    7: 0.25  // Sith Empire model is 4x oversized
};

// Models whose noses point +Z in the source GLB — opposite the game's
// -Z-forward flight convention — so they flew visually BACKWARDS and
// their thruster cones (mounted on the +Z "rear") sat on the bow.
// Verified live for both: cone-vs-movement dots showed the +Z face
// leading for Vulcans, and players saw pirate cones "on the front".
// Baking a 180° yaw makes them fly nose-first with cones at the rear.
const _enemyModelNoseFlip = {
    1: true, // Enemy1/Boss1 — Federation/Human ships (Martian Pirates fly these)
    8: true  // Enemy8/Boss8 — Vulcan ships
};

// Wrap all of a model's children in a 180°-yawed inner group. Applied
// AFTER centering so the flip is about the hull's own center; the outer
// group keeps identity rotation so flight code can drive it normally.
function _applyNoseFlip(model, regionId) {
    if (!_enemyModelNoseFlip[regionId]) return;
    const inner = new THREE.Group();
    inner.rotation.y = Math.PI;
    while (model.children.length) inner.add(model.children[0]);
    model.add(inner);
}

// =============================================================================
// MATERIAL RESPONSE — fresnel rim light + engine bloom
// =============================================================================
// Every hull (player, enemy, boss) was reading as a dead-flat color fill
// with no lighting response. These helpers add a cheap fresnel rim term
// on top of a real lit material (MeshStandardMaterial, which already
// picks up the scene's shipLight/ambient/star lights) via onBeforeCompile
// — leading edges pick up rim color, trailing faces stay dark from the
// base lighting falloff — plus small additive engine-glow attachments.

// One shared uniform object reused by EVERY rim-lit material so the
// per-frame update is O(1) regardless of how many enemies are alive,
// instead of an ever-growing registry of per-material uniforms leaking
// across a long play session.
const _sharedRimTime = { value: 0.0 };

// Inject a fresnel rim term into a MeshStandardMaterial's compiled
// shader. idle/boostA/boostB are hex colors; boostT (0-1) blends from
// the idle rim color to a shimmering boostA<->boostB mix and boosts the
// rim's strength — callers either hold boostT fixed (ambient faction
// glow on enemies/bosses) or drive it live per-frame (player boost).
// Returns the uniforms object so callers can mutate boostT later.
// opts.coreDarken (0-1): dims camera-facing (non-grazing) surfaces by an
// inverse-fresnel factor BEFORE lighting, so the additive rim term below
// reads brighter than the core instead of being outweighed by direct-light
// specular/diffuse response on facing panels (measured rim/core luminance
// ratio was 0.64 — silhouette DARKER than interior — with coreDarken=0).
//
// opts.panelDetail (bool): also multiplies the pre-lit albedo by a
// triplanar procedural panel-seam + greeble-speckle mask (object-space, so
// it's stable under the object's own transform and needs no UVs — the
// player GLB ships zero UV attributes at all). Breaks up the single flat
// fill into panel plates with dark seams and per-plate shade/speck
// variance, which is what actually moves per-pixel luminance std instead
// of just tinting the whole hull.
// opts.hullForm (bool): adds a cheap OBJECT-SPACE form pass — a top-lit
// value gradient plus a darker nose/canopy cap — multiplied into BOTH the
// albedo and the emissive floor. Untextured hulls carrying a single flat
// emissive value have no light direction at all, which is why enemy ships
// clipped to white crumpled-paper wads once they filled 70-100px: every
// facet returned the same number, so the eye had nothing to reconstruct a
// facing from. This is normal-only (no positions, no bbox uniforms), so it
// is scale- and model-independent:
//   formFloor/formTop  — value at the belly / at the spine (top-lit ramp)
//   formNoseSign       — +1 when the GLB's nose points +Z (the nose-flipped
//                        regions), -1 for the game's usual -Z-forward hulls
//   formNoseDark       — multiplier on faces pointing along the nose, which
//                        darkens the bow cap / canopy into an accent
//
// opts.battleDamage (bool, requires panelDetail): adds the DAMAGE TIER —
// the one hull cue this material had none of. A hull carried exactly the
// same pixels at 100% HP and at 3% HP, so "this one is nearly dead, finish
// it" was information that existed only in the HUD bracket, never on the
// ship. It is driven by a single `uDamage` uniform (0 = pristine, 1 =
// wreck) written per-ship by _syncHullDamage below, and it is a MECHANISM,
// not a per-class decal: it rides the same object-space triplanar field the
// panel detail already uses, so every faction, every boss and every fallback
// hull gets it from the one call site with no per-model authoring, and it
// costs no UVs (these GLBs ship POSITION + NORMAL only) and no extra draw.
//
// Two terms, because damage reads as a pair:
//   SCORCH — carbon blotches that eat the albedo. As uDamage rises the
//            threshold drops and more of the hull burns black.
//   EMBER  — a thin hot band on the EDGE of every scorch blotch, added to
//            emissive and flickering off uTime. Cooling carbon is dark;
//            what glows is the rim of the hole, which is why this is a band
//            around the blotch and not a fill of it.
// Both terms also do real work for the surface read: they are high-contrast
// and locally structured, so they raise per-pixel luminance spread on the
// isolated hull rather than just tinting it.
function _addFresnelRim(material, opts) {
    opts = opts || {};
    const panelDetail = !!opts.panelDetail;
    const hullForm = !!opts.hullForm;
    const battleDamage = panelDetail && (opts.battleDamage !== false);
    const hullSpec = !!opts.hullSpec;
    // opts.hullLightRig (bool): THE KEY/FILL/RIM RIG, AS SHADER MATH.
    //
    // Every hull in this game was authored against a three-point rig that has
    // never lit a single pixel. The rig was built as real THREE.DirectionalLights
    // parented to the camera (see _HULL_LIGHT_RIG below for what replaced it),
    // and three.js only collects lights it meets while traversing the RENDERED
    // SCENE — the camera in this game is not in the scene graph (camera.parent
    // === null), so those lights were never collected. Measured live:
    // lightsParentedToLiveCamera 4, directionalLightsInSceneGraph 0. What was
    // actually lighting a hostile hull was AmbientLight(0x333333, 0.4) plus, for
    // 3 of 9 classes, whichever unrelated decorative PointLight they happened to
    // be parked next to — zeroing all 62 PointLights in the scene changed hull
    // mean luminance by exactly 0.0 on the other six. A MeshStandardMaterial
    // with no map/normalMap/roughnessMap/aoMap/envMap and scene.environment ===
    // null, under ambient only, returns ONE number for every facet: the ships
    // read as glow-paint silhouettes because that is literally what they were.
    //
    // The fix is NOT to put the camera in the scene. Camera-parented lights are
    // scene-wide: three.js has no per-object light masking (light.layers is
    // tested against the CAMERA's layers in projectObject, not per object), so
    // switching them on would flood every planet, moon, station and asteroid in
    // the game with a viewer-locked key — flattening the sun-lit crescent that
    // the Sol system's whole look is built on. The rig is only ever wanted on
    // HULLS, so it belongs where the hull's other authored terms already live:
    // in this material's own shader.
    //
    // The directions are constants in VIEW space, which is exactly what the
    // camera-parented rig was: a light parented to the camera has a fixed
    // direction in view space by construction. So this is not an approximation
    // of the intended rig, it is the same rig evaluated per hull pixel — with
    // the bonus that it runs on `normal`, i.e. AFTER the panel bump inject, so
    // panel seams become grooves the key light actually shades.
    const hullLightRig = !!opts.hullLightRig;
    const needObjNormal = panelDetail || hullForm;
    const uniforms = {
        rimColorIdle: { value: new THREE.Color(opts.idle !== undefined ? opts.idle : 0x2ad4ff) },
        rimColorBoostA: { value: new THREE.Color(opts.boostA !== undefined ? opts.boostA : 0xffcc33) },
        rimColorBoostB: { value: new THREE.Color(opts.boostB !== undefined ? opts.boostB : 0xff2ad4) },
        boostT: { value: opts.boostT !== undefined ? opts.boostT : 0.0 },
        rimPower: { value: opts.power !== undefined ? opts.power : 2.2 },
        rimBaseStrength: { value: opts.baseStrength !== undefined ? opts.baseStrength : 1.0 },
        rimBoostStrength: { value: opts.boostStrength !== undefined ? opts.boostStrength : 1.0 },
        rimCoreDarken: { value: opts.coreDarken !== undefined ? opts.coreDarken : 0.0 },
        uTime: _sharedRimTime
    };
    if (panelDetail) {
        uniforms.uRimPanelCell = { value: opts.panelCellSize !== undefined ? opts.panelCellSize : 0.05 };
        // Strength of the FINE plating octave (0 = coarse plates only, i.e.
        // the single-lattice behaviour this replaced). Kept as a live uniform
        // rather than a compile-time branch so the two can be A/B'd on the
        // same hull in the same frame — which is the only honest way to
        // measure what the fine layer is worth, since which hostile the
        // harness happens to grab varies between page loads.
        uniforms.uRimPanelFine = { value: opts.panelFine !== undefined ? opts.panelFine : 1.0 };
        // How much of the panel mask reaches the EMISSIVE floor (0 = the old
        // albedo-only behaviour, 1 = the floor is fully panelled).
        uniforms.uPanelEmis = { value: opts.panelEmissive !== undefined ? opts.panelEmissive : 0.85 };
        // Strength of the NORMAL-PERTURBATION path (see the bump inject
        // after normal_fragment_maps below). This is what makes a panel
        // seam a groove the scene's real lights can shade, instead of a
        // value the eye can only read as printed-on. 0 = perturbation off.
        uniforms.uPanelBump = { value: opts.panelBump !== undefined ? opts.panelBump : 0.55 };
        // _rimPlateOctave calls fwidth(). On a WebGL2 context (which this
        // game gets — verified live: renderer.capabilities.isWebGL2 true)
        // derivatives are core and three.js emits no #extension line at all,
        // but on a WebGL1 fallback the shader will not compile without this
        // flag, and a hull that fails to compile is an invisible ship.
        material.extensions = material.extensions || {};
        material.extensions.derivatives = true;
    }
    if (hullSpec) {
        // Direction TO the key light, in VIEW space. This is not an arbitrary
        // number: it DEFAULTS TO THE KEY'S OWN DIRECTION (_HULL_LIGHT_RIG),
        // so the analytic highlight and the rig's diffuse terminator agree by
        // construction — a highlight that disagrees with the shading reads as
        // a decal. Fixed in view space, so one constant vec3 is correct for
        // every hull at every moment: no per-object work.
        uniforms.uSpecDir = {
            value: (opts.specDir ? opts.specDir.clone()
                : (opts.keyDir ? opts.keyDir.clone() : new THREE.Vector3(472, 756, 454))).normalize()
        };
        uniforms.uSpecColor = { value: new THREE.Color(opts.specColor !== undefined ? opts.specColor : 0xfff2d8) };
        uniforms.uSpecPower = { value: opts.specPower !== undefined ? opts.specPower : 28.0 };
        uniforms.uSpecStrength = { value: opts.specStrength !== undefined ? opts.specStrength : 2.2 };
        uniforms.uSkyUp = { value: new THREE.Color(opts.skyUp !== undefined ? opts.skyUp : 0xff2ad4) };
        uniforms.uSkyDown = { value: new THREE.Color(opts.skyDown !== undefined ? opts.skyDown : 0x00d4ff) };
        uniforms.uSkyStrength = { value: opts.skyStrength !== undefined ? opts.skyStrength : 0.10 };
    }
    if (hullLightRig) {
        // Directions are TO the light, in VIEW space (a light parented to the
        // camera has a fixed view-space direction, so this is the same rig,
        // just evaluated where it can run). The defaults here mirror
        // _HULL_LIGHT_RIG, which is where the numbers and the reasoning live;
        // every caller in this file passes them explicitly.
        uniforms.uKeyDir = {
            value: (opts.keyDir ? opts.keyDir.clone() : new THREE.Vector3(472, 756, 454)).normalize()
        };
        uniforms.uKeyColor = { value: new THREE.Color(opts.keyColor !== undefined ? opts.keyColor : 0xfff2d8) };
        uniforms.uKeyStrength = { value: opts.keyStrength !== undefined ? opts.keyStrength : 2.4 };
        uniforms.uFillDir = {
            value: (opts.fillDir ? opts.fillDir.clone() : new THREE.Vector3(-498, -797, 342)).normalize()
        };
        uniforms.uFillColor = { value: new THREE.Color(opts.fillColor !== undefined ? opts.fillColor : 0x5ec8ff) };
        uniforms.uFillStrength = { value: opts.fillStrength !== undefined ? opts.fillStrength : 0.12 };
        uniforms.uBackDir = {
            value: (opts.backDir ? opts.backDir.clone() : new THREE.Vector3(-40, 200, -650)).normalize()
        };
        uniforms.uBackColor = { value: new THREE.Color(opts.backColor !== undefined ? opts.backColor : 0xa0e8ff) };
        uniforms.uBackStrength = { value: opts.backStrength !== undefined ? opts.backStrength : 0.30 };
        // How much of the key/fill response is tinted by the hull's own albedo
        // vs left as the light's own colour. 1.0 = fully albedo-modulated,
        // which is what keeps the faction R-B signature alive: an untinted
        // white key on a saturated hull is the fastest way to wash a faction
        // colour to grey (the same trap the old 0.62 emissive floor fell into,
        // from the other direction).
        uniforms.uRigAlbedo = { value: opts.rigAlbedo !== undefined ? opts.rigAlbedo : 1.0 };
    }
    if (battleDamage) {
        uniforms.uDamage = { value: 0.0 };
        uniforms.uDamageEmber = {
            value: new THREE.Color(opts.emberColor !== undefined ? opts.emberColor : 0xff7a1e)
        };
    }
    if (hullForm) {
        uniforms.uFormFloor    = { value: opts.formFloor    !== undefined ? opts.formFloor    : 0.55 };
        uniforms.uFormTop      = { value: opts.formTop      !== undefined ? opts.formTop      : 1.45 };
        uniforms.uFormNoseSign = { value: opts.formNoseSign !== undefined ? opts.formNoseSign : -1.0 };
        uniforms.uFormNoseDark = { value: opts.formNoseDark !== undefined ? opts.formNoseDark : 0.45 };
    }

    material.onBeforeCompile = function (shader) {
        Object.assign(shader.uniforms, uniforms);

        let vertVaryings = '#include <common>\nvarying vec3 vRimNormalW;\nvarying vec3 vRimViewW;';
        let vertAssign = '#include <begin_vertex>\nvRimNormalW = normalize( normalMatrix * normal );\nvRimViewW = normalize( -( modelViewMatrix * vec4( transformed, 1.0 ) ).xyz );';
        if (needObjNormal) {
            vertVaryings += '\nvarying vec3 vRimNormalObj;';
            vertAssign += '\nvRimNormalObj = normal;';
        }
        if (panelDetail) {
            vertVaryings += '\nvarying vec3 vRimPosObj;';
            vertAssign += '\nvRimPosObj = transformed;';
        }

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', vertVaryings)
            .replace('#include <begin_vertex>', vertAssign);

        // BUG (fixed): this branch used to omit the hullForm uniform block
        // entirely, so any caller combining panelDetail:true with
        // hullForm:true (createFactionHullMaterial does both, by default,
        // for every enemy/boss hull once panelDetail was turned on below)
        // got a fragment shader that REFERENCED uFormFloor/uFormTop/
        // uFormNoseSign/uFormNoseDark in the color_fragment inject further
        // down without ever declaring them — a hard compile failure
        // (measured live: "ERROR: 'uFormFloor' : undeclared identifier",
        // fragment shader not compiled) on every single hull in the scene.
        // Only createPlayerHullMaterial exercised panelDetail before now,
        // and it never sets hullForm, so this was dormant until today.
        const fragCommon = panelDetail
            ? `#include <common>
varying vec3 vRimNormalW;
varying vec3 vRimViewW;
varying vec3 vRimNormalObj;
varying vec3 vRimPosObj;
uniform vec3 rimColorIdle;
uniform vec3 rimColorBoostA;
uniform vec3 rimColorBoostB;
uniform float boostT;
uniform float rimPower;
uniform float rimBaseStrength;
uniform float rimBoostStrength;
uniform float rimCoreDarken;
uniform float uRimPanelCell;
uniform float uRimPanelFine;
uniform float uPanelEmis;
uniform float uPanelBump;
${hullForm ? 'uniform float uFormFloor;\nuniform float uFormTop;\nuniform float uFormNoseSign;\nuniform float uFormNoseDark;' : ''}
${battleDamage ? 'uniform float uDamage;\nuniform vec3 uDamageEmber;' : ''}
uniform float uTime;

float _rimHash21( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 19.19 );
    return fract( ( p3.x + p3.y ) * p3.z );
}

// ONE OCTAVE of plating: seamed plates on a square lattice, with per-plate
// shade variance and (optionally) a finer greeble speckle.
//
// SCREEN-SPACE AWARE, which is the whole reason this is a function and not
// the inline block it used to be. px is how many lattice cells fall inside
// one screen pixel (fwidth of the cell-space coordinate). Everything about a
// procedural lattice's legibility is a function of that number:
//   px << 1  — a cell is many pixels wide. Draw it at full strength.
//   px ~ 1   — a cell is about one pixel. The lattice is at Nyquist: the GPU
//              point-samples it and the pattern turns into per-pixel hash
//              noise that crawls under the smallest rotation. This is the
//              exact failure the previous two waves kept trading against
//              (wave 2 made the cells fine and they dissolved at range; wave
//              3 made them coarse and the hull went back to flat clay).
//   px > 1   — pure aliasing, nothing but noise.
// So the octave fades ITSELF out (vis) as it approaches Nyquist, and its
// seam is never allowed to be thinner than ~1.5 screen pixels (sw). That
// makes the frequency question local and automatic instead of a single
// global constant that has to be wrong at one end of the range or the other,
// and it is what lets _rimPanelMask below stack a coarse and a fine octave:
// each one simply switches off at the distance where it stops being an image
// and starts being noise.
// norm divides the octave's own spatial mean back out, so an octave adds
// VARIANCE without changing average hull brightness — it is applied inside
// the vis blend, never outside it, or an octave that has faded out would
// still be scaling the hull (the far-range emissive floor that keeps tagged
// hostiles visible at 1500-3000u is exactly the thing that must not move).
float _rimPlateOctave( vec2 uv, float cell, float lineW, float shadeAmt, float speckAmt, float norm ) {
    vec2 cUv = uv / cell;
    vec2 w = fwidth( cUv );
    float px = max( max( w.x, w.y ), 1e-6 );
    float vis = 1.0 - smoothstep( 0.30, 0.85, px );
    if ( vis <= 0.002 ) return 1.0;
    vec2 cId = floor( cUv );
    vec2 cF = fract( cUv );
    // Distance to the nearest plate border, in cell units. Filtering the
    // seam on this signed distance (instead of the old product of four
    // smoothsteps) is what makes the AA width meaningful: the transition
    // is widened symmetrically about lineW, so softening the edge for a
    // distant hull does NOT also make the seam eat more of the plate and
    // darken the ship.
    float d = min( min( cF.x, 1.0 - cF.x ), min( cF.y, 1.0 - cF.y ) );
    float sw = max( px * 1.5, 0.02 );
    float seam = smoothstep( lineW - sw, lineW + sw, d );
    float plate = 1.0 - shadeAmt + 2.0 * shadeAmt * _rimHash21( cId );
    float mask = mix( 0.18, 1.0, seam ) * plate;
    if ( speckAmt > 0.0 ) {
        // Greeble/rivet speckle, 4.2x finer than the plates it sits on, with
        // its own independent Nyquist fade — at 900u the plates still read
        // while this grid (which would be ~0.2 px per cell) is switched off.
        vec2 gUv = cUv * ( 1.0 / 0.24 );
        vec2 gw = fwidth( gUv );
        float gvis = 1.0 - smoothstep( 0.30, 0.85, max( gw.x, gw.y ) );
        float speck = _rimHash21( floor( gUv ) + 11.0 );
        mask *= 1.0 + gvis * speckAmt * ( step( 0.90, speck ) - step( speck, 0.10 ) );
    }
    return mix( 1.0, mask * norm, vis );
}

// THREE OCTAVES, because a hostile is not seen at one size, and because a
// single lattice provably cannot serve both ends of the range. Measured on
// the live build: at 4 plates across the longest axis a hull carries a
// normalized mean |Laplacian| of 13.8 at a 150 px framing (flat clay in
// close); at 24 plates it carries 49.3 there but is already sub-pixel at
// combat framing, where a 0.4deg yaw repainted 32.5% of hull pixels —
// boiling noise, not plating.
//
//   COARSE (cell * 3 == maxDim/4) — the silhouette-scale value structure
//   that survives when a hostile is 40 px wide. Same absolute plate size,
//   same constants as the single lattice this replaced, so the far read
//   that was tuned against real engagement framing is preserved exactly.
//
//   MID (cell == maxDim/12) — the octave that has to carry the WHOLE brief,
//   because the measured median dogfight puts a hostile at ~50 px across.
//   12 plates over 50 px is ~4 px per plate: resolvable. 24 plates over the
//   same 50 px is ~2 px and its own Nyquist fade would (correctly) switch it
//   most of the way off, which is exactly what a single 24-cell lattice was
//   measured doing — nothing at all at the range the player actually fights.
//
//   FINE (cell / 3 == maxDim/36) — hull plating for the close pass, live
//   from roughly a 120 px framing up. Costs nothing at range because it
//   fades itself out there.
//
// Every octave carries a norm that divides its own spatial mean out, so the
// mask's average — the thing the emissive floor's /0.92 normalisation and
// every far-range legibility measurement depend on — is held where the
// single-layer version had it (measured mean 0.77) while per-pixel spread
// goes up.
float _rimPanelMask( vec2 uv, float cell ) {
    float mask = _rimPlateOctave( uv, cell * 3.0, 0.10, 0.275, 0.6, 1.07 );
    if ( uRimPanelFine <= 0.001 ) return mask;
    float mid = _rimPlateOctave( uv, cell, 0.09, 0.20, 0.0, 1.39 );
    float fine = _rimPlateOctave( uv, cell * 0.3333, 0.09, 0.16, 0.0, 1.37 );
    return mask * mix( 1.0, mid * fine, uRimPanelFine );
}

float _rimPanelDetail( vec3 posObj, vec3 normalObj, float cell ) {
    // Exponent was 4.0: too soft a winner-take-most on a 474-tri hull with
    // large oblique faces, so two of the three planar projections stayed
    // co-resident on the same panel and their two grids multiplied into a
    // diamond/fishnet cross-hatch (visible on the player wings and the UFO
    // saucer) instead of one clean set of seams. 12.0 makes the dominant
    // axis win almost alone on any face more than ~20deg off that axis,
    // which is every face on a low-poly hull except the handful that sit
    // near a perfect 45, so the seams read as ONE lattice per panel.
    vec3 blend = pow( abs( normalize( normalObj ) ), vec3( 12.0 ) );
    blend /= max( blend.x + blend.y + blend.z, 0.0001 );
    float mXY = _rimPanelMask( posObj.xy, cell );
    float mYZ = _rimPanelMask( posObj.yz, cell );
    float mXZ = _rimPanelMask( posObj.xz, cell );
    return mXY * blend.z + mYZ * blend.x + mXZ * blend.y;
}
${battleDamage ? `
// Smooth value field on a coarse cell lattice — bilinear over per-cell
// hashes so the scorch blotches are BLOBS with soft edges rather than the
// hard squares a raw per-cell hash gives (which would read as a checker,
// not as burn). One octave is enough: this is silhouette-scale damage seen
// at 30-90 px, not a texture study.
float _rimBlobField( vec2 uv, float cell ) {
    vec2 p = uv / cell;
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = _rimHash21( i + vec2( 0.0, 0.0 ) + 53.0 );
    float b = _rimHash21( i + vec2( 1.0, 0.0 ) + 53.0 );
    float c = _rimHash21( i + vec2( 0.0, 1.0 ) + 53.0 );
    float d = _rimHash21( i + vec2( 1.0, 1.0 ) + 53.0 );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}

float _rimDamageField( vec3 posObj, vec3 normalObj, float cell ) {
    vec3 blend = pow( abs( normalize( normalObj ) ), vec3( 4.0 ) );
    blend /= max( blend.x + blend.y + blend.z, 0.0001 );
    float fXY = _rimBlobField( posObj.xy, cell );
    float fYZ = _rimBlobField( posObj.yz, cell );
    float fXZ = _rimBlobField( posObj.xz, cell );
    return fXY * blend.z + fYZ * blend.x + fXZ * blend.y;
}` : ''}`
            : `#include <common>
varying vec3 vRimNormalW;
varying vec3 vRimViewW;
${needObjNormal ? 'varying vec3 vRimNormalObj;' : ''}
uniform vec3 rimColorIdle;
uniform vec3 rimColorBoostA;
uniform vec3 rimColorBoostB;
uniform float boostT;
uniform float rimPower;
uniform float rimBaseStrength;
uniform float rimBoostStrength;
uniform float rimCoreDarken;
${hullForm ? 'uniform float uFormFloor;\nuniform float uFormTop;\nuniform float uFormNoseSign;\nuniform float uFormNoseDark;' : ''}
uniform float uTime;`;

        // Declared once for both fragCommon branches — the specular block is
        // independent of whether panel detail is compiled in.
        const fragSpec = hullSpec
            ? '\nuniform vec3 uSpecDir;\nuniform vec3 uSpecColor;\nuniform float uSpecPower;\nuniform float uSpecStrength;\nuniform vec3 uSkyUp;\nuniform vec3 uSkyDown;\nuniform float uSkyStrength;'
            : '';

        // Same deal for the three-point rig: independent of the panel branch.
        const fragRig = hullLightRig
            ? '\nuniform vec3 uKeyDir;\nuniform vec3 uKeyColor;\nuniform float uKeyStrength;\nuniform vec3 uFillDir;\nuniform vec3 uFillColor;\nuniform float uFillStrength;\nuniform vec3 uBackDir;\nuniform vec3 uBackColor;\nuniform float uBackStrength;\nuniform float uRigAlbedo;'
            : '';

        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', fragCommon + fragSpec + fragRig);

        let colorInject = `#include <color_fragment>
    float _rimFresEarly = pow( 1.0 - clamp( dot( normalize( vRimNormalW ), normalize( vRimViewW ) ), 0.0, 1.0 ), rimPower );
    diffuseColor.rgb *= mix( 1.0 - rimCoreDarken, 1.0, _rimFresEarly );
`;
        if (panelDetail) {
            // Kept in a named local: the emissive inject further down main()
            // AND the bump inject after normal_fragment_maps below both need
            // the SAME mask (see uPanelEmis / uPanelBump).
            //
            // diffuseColor.rgb *= _panelM at full strength was the bug: an
            // UNLIT multiply applied before any lighting runs is a flat,
            // pre-lit stamp — it looks identical from every angle under
            // every light, which is exactly what "printed fabric" means as
            // opposed to "recessed plating". Cut to a partial mix (an unlit
            // floor still needed so the plates read even where the bump
            // term's specular has nothing to catch — nose-on or in deep
            // shadow) and hand the rest of the read to the bump inject
            // below, which perturbs the LIT normal instead, so the exact
            // same field now darkens grooves by real N.L falloff and puts a
            // moving specular catch-light on raised plate edges.
            colorInject += `    float _panelM = _rimPanelDetail( vRimPosObj, vRimNormalObj, uRimPanelCell );
    diffuseColor.rgb *= mix( 1.0, _panelM, 0.35 );
`;
        }
        if (battleDamage) {
            // Blotch cell is 1.6x the panel cell: burn damage crosses panel
            // seams (that is what makes it read as damage rather than as a
            // differently-painted plate), so it must NOT be on the same
            // lattice the panel lines are on.
            //
            // `_dmgEdge` is a narrow band around the scorch threshold, i.e.
            // the RIM of each blotch. The scorch fill darkens; only this
            // edge glows. `_dmgScorch`/`_dmgEdge` are declared here and
            // reused by the emissive inject further down main().
            // 4.8 == 3.0 (the coarse-octave multiplier in _rimPanelMask) x 1.6.
            // uRimPanelCell is now the FINE plate size, so the blotch lattice
            // has to be re-derived from the coarse one or scorch damage would
            // shrink 6x with it and stop reading as burn at combat range.
            colorInject += `    float _dmgF = _rimDamageField( vRimPosObj, vRimNormalObj, uRimPanelCell * 4.8 );
    float _dmgThr = 1.00 - 0.58 * uDamage;
    float _dmgScorch = smoothstep( _dmgThr, _dmgThr + 0.16, _dmgF ) * step( 0.02, uDamage );
    float _dmgEdge = _dmgScorch * ( 1.0 - smoothstep( _dmgThr + 0.05, _dmgThr + 0.20, _dmgF ) );
    diffuseColor.rgb *= mix( 1.0, 0.20, _dmgScorch );
`;
        }
        if (hullForm) {
            // Top-lit value ramp + darkened nose/canopy cap. Declared here so
            // the emissive inject below (which runs later in main()) can reuse
            // the same shade term — the floor has to be shaped too or the flat
            // emissive simply washes the gradient back out.
            colorInject += `    vec3 _formN = normalize( vRimNormalObj );
    float _formShade = mix( uFormFloor, uFormTop, clamp( _formN.y * 0.5 + 0.5, 0.0, 1.0 ) );
    _formShade *= mix( 1.0, uFormNoseDark, smoothstep( 0.55, 0.97, _formN.z * uFormNoseSign ) );
    diffuseColor.rgb *= _formShade;
`;
        }

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <color_fragment>', colorInject);

        if (panelDetail) {
            // BUMP: perturb the LIT normal with the SAME _panelM field that
            // shapes diffuseColor/emissive above, so panel seams get a real
            // light-direction response — a groove that darkens as N.L falls
            // off and a raised edge that can catch the GLINT specular lobe
            // as the hull turns — instead of only ever being a flat pre-lit
            // multiply that reads the same from every angle.
            //
            // This is three.js's own USE_BUMPMAP math (verified live against
            // this build's THREE.ShaderChunk.bumpmap_pars_fragment —
            // perturbNormalArb, r128), inlined instead of switched on via
            // the USE_BUMPMAP define because that path also compiles in a
            // bumpMap/bumpScale uniform pair and a UV-sampled dHdxy_fwd()
            // this hull has no use for (no TEXCOORD — see the player-hull
            // note above _rimPanelDetail). What's reused verbatim is the
            // tangent-frame reconstruction: surf_pos = -vViewPosition (the
            // same varying and the same sign three.js's own callers pass)
            // and surf_norm = normal (the view-space normal normal_fragment_
            // begin just wrote, and faceDirection is the local it already
            // computed) — the only thing swapped in is dHdxy, which here is
            // the screen-space gradient of _panelM itself (already computed
            // above, so this needs no second field evaluation) instead of a
            // texture height sample. No tangent/UV attribute required either
            // way: dFdx/dFdy of the view-space position reconstructs the
            // local tangent frame straight from whichever two screen-space
            // directions the triangle actually spans.
            const bumpBlock = `#include <normal_fragment_maps>
    {
        vec3 _pSurfPos = -vViewPosition;
        vec3 _pSigmaX = vec3( dFdx( _pSurfPos.x ), dFdx( _pSurfPos.y ), dFdx( _pSurfPos.z ) );
        vec3 _pSigmaY = vec3( dFdy( _pSurfPos.x ), dFdy( _pSurfPos.y ), dFdy( _pSurfPos.z ) );
        vec3 _pR1 = cross( _pSigmaY, normal );
        vec3 _pR2 = cross( normal, _pSigmaX );
        float _pDet = dot( _pSigmaX, _pR1 ) * faceDirection;
        vec2 _pDHdxy = vec2( dFdx( _panelM ), dFdy( _panelM ) ) * uPanelBump;
        vec3 _pGrad = sign( _pDet ) * ( _pDHdxy.x * _pR1 + _pDHdxy.y * _pR2 );
        normal = normalize( abs( _pDet ) * normal - _pGrad );
    }
`;
            shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', bumpBlock);
        }

        if (hullForm || battleDamage || panelDetail) {
            let emisInject = '#include <emissivemap_fragment>\n';
            // Order matters: the form ramp SHAPES the always-on floor, and
            // the ember is added AFTER it so a hole burning on the hull's
            // shadowed belly still glows. A wound is its own light source.
            if (hullForm) emisInject += '    totalEmissiveRadiance *= _formShade;\n';
            if (panelDetail) {
                // THE PANEL DETAIL HAS TO REACH THE EMISSIVE, or it is not
                // there at all. Measured on a paused, isolated frame, an 84u
                // and a 114u hull at 300u broadside had p90-p10 luminance of
                // 26.7 and 9.1 — a ship the size of a playing card with NINE
                // levels of tone across it. The panel/greeble mask was being
                // multiplied into diffuseColor only, and diffuseColor is only
                // visible through the LIT terms; this game's hulls are lit
                // almost entirely by their own emissive floor (the ambient is
                // 0.02-0.4, the star point lights fall off long before combat
                // range, and the camera-parented rig is not in the traversed
                // scene graph at all), so on the term that was actually
                // drawing the ship the surface had no detail whatsoever.
                // Feeding the same mask into the emissive puts the plates,
                // the seams and the greeble speckle onto the pixels the
                // player is really looking at, at any range and under any
                // lighting, which is what "reads as material" means.
                // Normalised by the mask's own mean so the 100/255 far-range
                // legibility floor is not spent on getting texture.
                emisInject += '    totalEmissiveRadiance *= mix( 1.0, _panelM / 0.92, uPanelEmis );\n';
            }
            if (battleDamage) {
                emisInject += `    totalEmissiveRadiance *= mix( 1.0, 0.30, _dmgScorch );
    float _dmgPulse = 0.62 + 0.38 * sin( uTime * 6.4 + _dmgF * 41.0 );
    totalEmissiveRadiance += uDamageEmber * _dmgEdge * _dmgPulse * ( 0.55 + 2.30 * uDamage );
`;
            }
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>', emisInject
            );
        }

        // SPECULAR: THE DIFFERENCE BETWEEN CLAY AND METAL.
        //
        // A hull that only ever gains BROAD terms — ambient, an emissive
        // floor, a fresnel rim — is by construction a shaded solid, because
        // every one of those terms is a smooth function of the surface
        // normal. Metal is recognised by the opposite thing: a small, hard,
        // view-dependent highlight that skates across the surface as the
        // object turns, and that is bright out of proportion to everything
        // around it. On a 392-triangle faceted GLB that highlight lands on a
        // couple of facets at a time, which is precisely the read wanted.
        //
        // This is deliberately NOT delivered through an envMap. A PMREM probe
        // was built and measured on the live build first: at roughness 0.42
        // and metalness 0.35 the probe arrives almost entirely as the
        // fully-blurred irradiance term, so on an isolated hull at 300u it
        // raised mean luminance 153->161 while p90-p10 spread FELL 172->167
        // and surface detail fell 23.6->22.0. Sweeping roughness 0.42/0.30/
        // /0.18 and metalness 0.35/0.75/0.95 never reversed the sign: every
        // configuration bought brightness by spending contrast, because this
        // hull's appearance is dominated by an emissive floor that a uniform
        // lift can only wash out. An analytic lobe spends nothing: it is
        // sparse by construction, so it adds highlight without adding fill.
        //
        // Two terms:
        //   GLINT — a tight Blinn-Phong lobe on the camera-parented key
        //           light's own direction (so the highlight always agrees
        //           with the light that is actually shading the hull),
        //           gated by a Schlick fresnel so it strengthens toward
        //           grazing facets the way a real specular does.
        //   SKY   — a two-tone reflection tint looked up by the reflection
        //           vector, magenta above / cyan below. It is what a hull
        //           reflecting this game's sky would pick up, and it makes
        //           adjacent facets differ in HUE as well as value, which
        //           flat-shaded clay never does. It is written ZERO-MEAN
        //           (the average of the two sky colours is subtracted) for
        //           the same reason the env probe was rejected: added as a
        //           plain sum it is just ambient, and measured that way it
        //           cost 15% of the hull's p90-p10 spread to buy 26/255 of
        //           brightness nobody asked for. Zero-mean, it moves hue
        //           per facet and moves average brightness by nothing.
        const specInject = hullSpec ? `
    vec3 _spN = normalize( vRimNormalW );
    vec3 _spV = normalize( vRimViewW );
    vec3 _spL = normalize( uSpecDir );
    vec3 _spH = normalize( _spL + _spV );
    float _spD = pow( max( dot( _spN, _spH ), 0.0 ), uSpecPower );
    float _spF = 0.04 + 0.96 * pow( 1.0 - max( dot( _spH, _spV ), 0.0 ), 5.0 );
    outgoingLight += uSpecColor * ( _spD * ( 0.35 + 0.65 * _spF ) * uSpecStrength );
    vec3 _spR = reflect( -_spV, _spN );
    outgoingLight += ( mix( uSkyDown, uSkyUp, _spR.y * 0.5 + 0.5 ) - 0.5 * ( uSkyUp + uSkyDown ) ) * uSkyStrength;
` : '';

        // THE RIM HAD NEVER RENDERED. This block used to be spliced in by
        // replacing '#include <output_fragment>', and that string DOES NOT
        // EXIST in this build's MeshStandardMaterial fragment shader —
        // verified live: THREE.ShaderChunk.output_fragment is undefined and
        // ShaderLib.standard.fragmentShader (=== ShaderLib.physical's, they
        // are the same source here) inlines the outgoing-light assignment
        // instead, because of the TRANSMISSION branch. String.replace with a
        // missing needle is a silent no-op, so every hull material in the
        // game compiled WITHOUT its fresnel rim: the term four consecutive
        // waves tuned — rimColorIdle/BoostA/BoostB, rimPower,
        // rimBaseStrength, rimBoostStrength — has been dead code on enemy,
        // boss, UFO and player hulls this whole time. Proof: setting
        // rimBaseStrength AND rimBoostStrength to 0 on a live hostile's own
        // material changed the isolated-hull readback by exactly 0 pixels.
        // That is a large part of why hulls kept measuring as flat shaded
        // solids no matter what the rim constants were set to.
        //
        // Anchor on the line that is actually there, and keep the old anchor
        // first so this still works if the engine is upgraded to a build that
        // has the chunk.
        // THE THREE-POINT RIG (see the hullLightRig note at the top of this
        // function for WHY it is shader math and not scene lights).
        //
        //   KEY  — a full Lambert term off the upper-right-forward. This is
        //          the one that manufactures a terminator: adjacent facets of
        //          a 392-tri hull return different N.L, which is the entire
        //          difference between "a lit object" and "a coloured
        //          silhouette". It runs on `normal`, the view-space normal
        //          AFTER the panel bump perturbation, so plate seams shade.
        //   FILL — dim, cool, from the opposite side, WRAPPED (the +0.30/1.30
        //          remap) so the shadow hemisphere lands on a dark blue rather
        //          than clipping to a black cutout under ACES. Wrap rather
        //          than raw N.L because a hard second Lambert lobe just draws
        //          a second terminator and cancels the first one's read.
        //   BACK — grazing backlight, gated by the view-fresnel so it only
        //          touches trailing edges. Separates the hull from the
        //          nebula it is crossing. This is the PBR half of the
        //          separation cue; the synthetic fresnel rim below is the
        //          faction-coloured half, and they are deliberately different
        //          terms — one is white starlight on an edge, the other is
        //          the ship's own identity colour.
        //
        // All three are modulated by diffuseColor.rgb (uRigAlbedo), which at
        // this point in main() already carries coreDarken, the panel/greeble
        // mask and the hullForm top-lit ramp — so the rig AMPLIFIES every
        // surface term this material draws instead of adding a flat wash over
        // them, and the faction hue survives into the lit response instead of
        // being replaced by the lamp's own colour.
        const rigBlock = hullLightRig ? `
    vec3 _lrN = normalize( normal );
    vec3 _lrV = normalize( vRimViewW );
    vec3 _lrAlb = mix( vec3( 1.0 ), diffuseColor.rgb, uRigAlbedo );
    float _lrKey = max( dot( _lrN, uKeyDir ), 0.0 );
    float _lrFill = max( ( dot( _lrN, uFillDir ) + 0.30 ) / 1.30, 0.0 );
    float _lrBack = max( dot( _lrN, uBackDir ), 0.0 );
    float _lrGraze = pow( 1.0 - clamp( dot( _lrN, _lrV ), 0.0, 1.0 ), 2.0 );
    outgoingLight += _lrAlb * ( uKeyColor * ( uKeyStrength * _lrKey )
        + uFillColor * ( uFillStrength * _lrFill )
        + uBackColor * ( uBackStrength * _lrBack * _lrGraze ) );
` : '';

        const rimBlock = rigBlock + `
    float _rimFres = pow( 1.0 - clamp( dot( normalize( vRimNormalW ), normalize( vRimViewW ) ), 0.0, 1.0 ), rimPower );
    vec3 _rimBoostShimmer = mix( rimColorBoostA, rimColorBoostB, 0.5 + 0.5 * sin( uTime * 2.6 ) );
    vec3 _rimColor = mix( rimColorIdle, _rimBoostShimmer, boostT );
    float _rimStrengthMix = mix( rimBaseStrength, rimBoostStrength, boostT );
    outgoingLight += _rimColor * _rimFres * _rimStrengthMix;
${specInject}`;
        const OUT_CHUNK = '#include <output_fragment>';
        const OUT_INLINE = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
        if (shader.fragmentShader.indexOf(OUT_CHUNK) >= 0) {
            shader.fragmentShader = shader.fragmentShader.replace(OUT_CHUNK, rimBlock + '    ' + OUT_CHUNK + '\n');
        } else if (shader.fragmentShader.indexOf(OUT_INLINE) >= 0) {
            shader.fragmentShader = shader.fragmentShader.replace(OUT_INLINE, rimBlock + '    ' + OUT_INLINE + '\n');
        } else if (typeof console !== 'undefined') {
            // Never fail silently again.
            console.warn('_addFresnelRim: no output anchor in fragment shader; rim/spec not injected');
        }
    };

    material.userData._rimUniforms = uniforms;
    return uniforms;
}

// Per-mesh panel-line cell size for the panelDetail shader path above.
// Enemy/boss GLBs are NOT authored at one common scale — raw hull
// geometry spans 2.03x to 900.67x across factions (see the UFO scale-
// correction note below) — so a single hardcoded cell size would either
// vanish into noise on the smallest hulls or smear into a handful of
// giant slabs on the largest. Deriving it from each mesh's own object-
// space bounding box keeps panel plates a roughly constant FRACTION of
// the hull (~9 plates across the longest axis) regardless of how the
// source asset was exported, with no dependency on UVs (these GLBs carry
// POSITION + NORMAL only, no TEXCOORD — see the player-hull note further
// down) since _rimPanelDetail samples object-space position, not uv.
//
// THIS IS NOW THE MID PLATE SIZE, and _rimPanelMask derives the coarse
// octave from it as cell * 3 and the fine octave as cell / 3 — so the old
// "4 plates across the longest axis" lattice is still drawn, unchanged, as
// the coarse octave, with 12 and 36 plate lattices layered over it.
//
// The divisor has been round-tripped 9 -> 4 -> 24 across three waves and
// the reason is worth writing down, because 24 on its own would be the
// wave-2 mistake again. Measured live on a Federation hostile, isolated
// hull, normalized mean |Laplacian| (surface detail) against the fraction
// of hull pixels that change by >=8/255 under a 0.4deg yaw (aliasing —
// a plate pattern that is really there does not repaint a third of the
// ship when it turns by less than half a degree):
//
//        90u                    300u
//   div  detail  alias     detail  alias
//    4    13.8   0.059      36.4   0.087     <- shipped: clean, but clay
//   12    29.4   0.172      85.1   0.222
//   24    49.3   0.288     115.8   0.325     <- critic's number, and 33%
//   48    84.1   0.404     134.4   0.443        of the hull boiling at 300u
//
// A hostile at combat range is ~50 px across, so 24 plates is ~2 px per
// plate: the detail column at div 24 is measuring hash noise, not plating,
// and confirming that, a 24-cell lattice measured live at the true combat
// framing raised surface detail by 0.0% because its own Nyquist fade had
// (correctly) switched it off. The fix is not to pick a compromise divisor
// — it is to make the frequency LOCAL and then stack octaves.
// _rimPlateOctave fades each octave out as its cells approach one screen
// pixel, so 4 / 12 / 36 plates can all be authored at once and the ship
// simply draws whichever of them its current on-screen size can resolve.
function _hullPanelCellSize(geometry) {
    if (!geometry) return 12;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    return Math.max(maxDim / 12, 0.0005);
}

// THE HULL LIGHT RIG — authored here, EVALUATED IN THE SHADER.
//
// What used to live here: a warm DirectionalLight parented to the camera,
// installed on the first animation frame, so that hull facets would pick up
// different N.L instead of all returning the same number. Directly below
// createPlayerHullMaterial there was a second copy of the same idea, a full
// KEY/FILL/RIM trio, also camera-parented.
//
// NEITHER OF THEM EVER LIT ANYTHING, and the reason has nothing to do with
// which camera object they latched onto (the previous note here blamed the
// intro camera, and re-homing them onto the live camera does not help either).
// three.js collects lights while traversing the scene it is about to render.
// This game never puts its camera IN that scene — camera.parent === null —
// so a light parented to the camera is not reachable from the render root and
// is never collected. Measured live, paused world, same-frame readback:
//     lightsParentedToLiveCamera   4
//     directionalLightsInSceneGraph 0
// leaving AmbientLight(0x333333, 0.4) as the entire lighting model for a
// MeshStandardMaterial carrying no map/normalMap/roughnessMap/aoMap/envMap
// against a scene.environment of null. Zeroing all 62 PointLights in the
// scene moved hull mean luminance by exactly 0.0 on 6 of 9 hostile classes
// (the other 3 only differ because they happen to be parked inside some
// unrelated decorative lamp's distance cutoff — the same ship class looked
// different depending on what scenery it flew past).
//
// WHY THIS IS NOT FIXED WITH scene.add(camera). Lights in three.js are
// scene-global: there is no per-object light mask (light.layers is tested
// against the CAMERA's layers in projectObject, not per object), so putting
// the camera in the scene switches these lamps on for EVERY lit object in the
// game at once — every planet, moon, ring, station and asteroid would gain a
// viewer-locked key light, which erases the sun-driven terminator the Sol
// system's whole look is built on. A rig that is only ever wanted on hulls
// belongs in the hull material, next to the panel, form, rim and glint terms
// it is supposed to be shading.
//
// So the rig is now evaluated per hull pixel by _addFresnelRim's hullLightRig
// block, from VIEW-SPACE constants. That is not an approximation of what was
// authored: a camera-parented light HAS a fixed view-space direction, so the
// constants below are the same three lamps, restated where they can actually
// run. Two things improve in the move: the rig sees `normal` after the panel
// bump perturbation (so seams shade), and it is modulated by the shaped
// albedo (so it amplifies panel/form/coreDarken instead of washing them out).
//
// INTENSITIES. The scene-light versions were authored at 1.6 (enemy key) and
// 2.4/0.5/1.1 (player key/fill/rim) — numbers tuned by eye against a rig that
// rendered nothing. When the rig is actually made live at those values, hull
// mean luminance overshoots to 139-223/255 and the UFO's luminance std FALLS
// (30.3 -> 27.0) because the lit side clips. The shipped strength is 2.4 for
// hostiles / 1.8 for the player hull (the strengths live on the call sites,
// not in this table, because the two hulls are read at different ranges).
// That is not the same 2.4: it multiplies an albedo-modulated Lambert term
// here rather than feeding three.js's punctual pipeline, where the same
// number arrives divided by PI and again by (1 - metalness). Measured on the
// live build, bare hull at 300u/yaw45 with the scenery lamps zeroed, the
// clipped fraction (luminance >= 248) of hull pixels at 2.4 is 0.16% on the
// Federation hull, 0.27% Sith, 0.94% UFO — i.e. the top end is being used,
// not thrown away.
//
// THE KEY WAS NOT OFF-AXIS. The lamp as authored sat at camera-local
// (160,220,30) aiming at (-60,-80,-600), i.e. view-space direction
// (220,300,630) — which is 30 degrees off the view axis. That is a FRONTAL
// light, and a frontal light is the one arrangement that cannot draw a
// terminator: every facet the camera can see is also facing the lamp, so
// N.L is nearly constant across the whole visible hull. It is the identical
// failure this file already documents for shipLight (a PointLight sitting at
// camera-local (0,0,-50), i.e. 0 degrees off-axis), just less extreme — and
// it is why the rig would have disappointed even if it HAD been in the scene
// graph. Measured live on this build with the rig running, key strength held
// fixed at 1.6, bare hull at 250u/yaw45, sweeping the key's angle off the
// view axis (luminance std):
//     off-axis     30deg   50deg   65deg   80deg
//     Federation   35.5    46.0    49.8    48.7
//     Rebel        48.7    55.2    52.9    47.7
//     Sith         38.1    46.5    53.2    58.3
// 63 degrees is the plateau: past ~65 the lit fraction of a nose-on hull gets
// small enough that the mean falls faster than the spread rises, and the
// classes disagree about which side of it they want.
//
// WHAT THE WHOLE CHANGE BOUGHT. Same-frame gl.readPixels off the default
// framebuffer, world paused, subject isolated (siblings hidden, LIGHTS LEFT
// ON — three.js skips invisible lights, so hiding them silently removes the
// scene ambient), FX children hidden, hull mask differenced against a
// subject-hidden render and eroded 2px. The 62 decorative PointLights are
// zeroed for the measurement: they are scenery, they reach only whichever
// classes happen to be parked next to them, and leaving them in makes the
// same ship class measure differently depending on what it flew past.
// Bare-hull luminance std, worst and best of 8 poses (250/400u x yaw
// 0/90/180/270), rig OFF (the shipped behaviour before this change) -> ON:
//     UFO         31.9-36.7  ->  61.1-63.5     bar >= 60   PASS
//     Federation  14.8-24.6  ->  58.5-63.9     bar >= 45   PASS
//     Klingon     27.0-54.7  ->  59.3-69.9                 PASS
//     Rebel        6.3-48.9  ->  49.2-69.5                 PASS
//     Romulan     24.8-60.1  ->  61.1-68.8                 PASS
//     Imperial     7.1-35.1  ->  46.4-65.3                 PASS
//     Cardassian  26.7-36.7  ->  50.1-69.0                 PASS
//     Sith        21.1-43.2  ->  49.3-74.1                 PASS
//     Vulcan      23.7-49.6  ->  53.6-69.7                 PASS
// At 300u/yaw45, p90-p10 contrast on the BARE hull (previously this bar was
// only ever cleared by additive FX against black sky): 36.2-122.4 -> 143-176,
// 9/9 over 100. Hull mean at 300u: 27.4-73.3 -> 91.4-162.6, and the worst
// mean over all 8 poses of any class is 59.5 — no class can go darker than
// the nebula behind it any more (measured against the live sky in the same
// crop: hull/sky mean ratio 1.24 -> 2.49 Federation, 1.92 -> 3.08 Sith).
const _HULL_LIGHT_RIG = {
    // KEY: warm, up-and-right, 63deg off the view axis.
    keyDir: [472, 756, 454],
    keyColor: 0xfff2d8,
    // FILL: cool, from the opposite quadrant (down-left), 70deg off-axis and
    // WRAPPED in the shader, so it opens the shadow side without drawing a
    // second terminator that cancels the key's.
    fillDir: [-498, -797, 342],
    fillColor: 0x5ec8ff,
    // BACK: grazing, from behind-and-above. = (-30,180,-650)-(10,-20,0).
    backDir: [-40, 200, -650],
    backColor: 0xa0e8ff
};

// Faction-tinted, rim-lit hull material for enemy/boss GLB meshes. Keeps
// MeshStandardMaterial's real lighting response (shipLight + ambient +
// system stars already light these ships) and adds a constant ambient
// rim so leading edges read against the starfield in a dogfight.
//
// THE PRESENCE FLOOR. Almost all of this game's space is unlit: the global
// ambient is AmbientLight(0x333333, 0.06) and the only reliable lamp is
// shipLight, a PointLight(distance 800, decay 2) parented to the camera. A
// hull's LIT response is therefore effectively zero past a few hundred units,
// and at 800/1500/3000u a purely lit material renders black — measured, tagged
// enemies sat inside their HUD brackets with no visible silhouette at all.
// Emissive is the fix because it is the one term MeshStandardMaterial adds
// independent of every light in the scene, so it gives each hull a guaranteed
// faction-colored floor at any range. The rim/panel/coreDarken work still
// shapes the close-up (coreDarken multiplies diffuseColor only — see
// _addFresnelRim — so it cannot eat this floor).
//
// VALUE, NOT HUE. The previous keying was a DARK albedo (base x 0.55 =
// #8c1c1c for a red faction) carrying a fully saturated emissive. Saturated
// red is a luminance trap: even a clipped 255-red pixel is only L=54 under
// Rec.709 weights, so a hostile at weapons range measured DIMMER than the
// white background stars it was flying across (measured: hull Lmax 63 vs
// star Lmax 101, and no red excess over the starfield at all). A hull can
// only out-read this game's very dense, very white starfield if it carries
// VALUE — which means the hull tone and the emissive floor both have to be
// pushed a long way toward white and the FACTION identity has to be carried
// by the rim and the engine glow instead of by a dark saturated body.
// That argument still stands, and it is the ALBEDO (hullHeat, below) that
// carries it — the albedo is a LIT term, so heating it buys value that still
// varies with the surface normal.
//
// WHERE THE VALUE MAY NOT COME FROM: THE EMISSIVE FLOOR.
// Emissive is added after every lighting term and is identical on every
// facet of the ship, so a large floor does not "give the hull presence" —
// it spends the hull's value range on a constant, which pins every surface
// to nearly the same number no matter which way it faces. That is exactly
// what the player hull was doing one round ago (floor ~0.48x base, measured
// bare-hull luminance std 34.0/255) and dropping it to 0.09x base in the
// hull's own cool accent — with the KEY/FILL/RIM rig left to do the work —
// took the same hull to std 70.0. The hostile roster shipped the same
// mistake at a larger scale: a floor of emissiveIntensity 0.62 on a
// heated-toward-white tint of the faction colour, i.e. a hull roughly 62%
// self-lit in its own hue, which cannot hold a form cue and cannot hold its
// own underneath eight additive FX nodes.
//
// The floor is therefore now DARK and COOL rather than a lighter tint of the
// base colour:
//   emissiveFloor — the floor as a fraction of the base colour (0.09, the
//                   value proven on the player hull). This is the whole
//                   floor: emissiveIntensity is a 1.0 multiplier on top,
//                   left at unity so the per-frame hooks that RIDE it
//                   (game-core's pulse, _setEnemyTelegraph's 1x->1.9x ramp,
//                   the range-deficit lift in game-controls) keep the same
//                   relative headroom they were tuned with.
//   emissiveCool  — how far that floor is pushed off the faction hue toward
//                   cold starlight. A floor is what an unlit facet returns,
//                   and an unlit facet in this game is looking at a cold
//                   sky, not at its own paint — a floor in the base hue
//                   reads as self-illumination and re-tints every shadow
//                   the key light draws.
// Faction identity does not live here any more: it lives in the albedo, in
// the fresnel rim (idle/boost colours are the saturated base) and in the
// panel accents, all of which are lit or view-dependent terms.
//   hullHeat     — how far the albedo is heated toward the hot-point
//   emissiveHeat — GONE, and deliberately not accepted as a no-op alias: the
//                  floor is not heated toward white at any strength any more,
//                  so a call site that still passes one should read as the
//                  dead option it is rather than silently doing nothing.
function createFactionHullMaterial(colorHex, opts) {
    opts = opts || {};
    const WHITE = new THREE.Color(0xffffff);
    const base = new THREE.Color(colorHex !== undefined ? colorHex : 0xff0000);
    // HEAT, NOT WHITE. Value has to come from somewhere, and where it comes
    // from decides whether the hull keeps its faction chroma.
    //  - Lerping to WHITE lifts R, G and B equally: luminance climbs but the
    //    colour excess collapses (measured: a white-lerped red hull carried
    //    ~29 mean red excess — it read pink-grey).
    //  - Lifting HSL lightness at fixed hue keeps the two minor channels
    //    LOCKED TOGETHER, and since Rec.709 luminance is 72% green, a red
    //    hull's luminance and its red excess then trade 1:1 — measured, you
    //    can have Lmed 105 with red excess 90, or Lmed 69 with red excess
    //    153, and nothing better.
    // Heating toward a warm (or, for cool hues, a cold) HOT-POINT breaks that
    // tie: it raises the MIDDLE channel much more than the lowest one, so a
    // red hull goes red -> red-orange -> white the way a hot object actually
    // does, buying luminance out of green while blue stays down and the red
    // excess stays high. Measured on the modal Hostile: Lmed 143 AND red
    // excess 138 at 500u, which neither of the other two curves can reach.
    const _hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(_hsl);
    const HOT_WARM = new THREE.Color(0xffd08a);   // ember white for warm hues
    const HOT_COOL = new THREE.Color(0xbdf0ff);   // arc white for cool hues
    const hotPoint = (_hsl.h < 0.17 || _hsl.h > 0.80) ? HOT_WARM : HOT_COOL;
    const hot = (heat) => base.clone().lerp(hotPoint, heat);
    // High-value hull body. Was 0.55 — with a real key light now landing
    // on these hulls (see _HULL_LIGHT_RIG above) that much heat plus
    // the old 0.70 emissive floor clipped 63-74% of hull pixels to white
    // (measured: ufo 73.8%, sith 63.2%). 0.35 keeps the body legible
    // against the starfield without doing all the work alone.
    const hullTone = hot(opts.hullHeat !== undefined ? opts.hullHeat : 0.35);
    // Always-on emissive floor — the term that survives at any range, and the
    // one term that survives it IDENTICALLY on every facet, which is why it is
    // now small and cold rather than a bright tint of the faction hue (see the
    // "WHERE THE VALUE MAY NOT COME FROM" note above). COLD_SKY is the game's
    // own night-sky blue: an unlit facet on a ship in this galaxy is facing a
    // cold sky, so that is what it should return.
    const COLD_SKY = new THREE.Color(0x3350ff);
    const emisCool = opts.emissiveCool !== undefined ? opts.emissiveCool : 0.55;
    const emisFloor = opts.emissiveFloor !== undefined ? opts.emissiveFloor : 0.09;
    const emisTone = base.clone().lerp(COLD_SKY, emisCool).multiplyScalar(emisFloor);
    // Rim + boost shimmer stay SATURATED: that's where faction identity lives
    // now that the body is high-value.
    const rimTone = base.clone().lerp(WHITE, 0.12);
    const rimHot = base.clone().lerp(WHITE, 0.62);

    const material = new THREE.MeshStandardMaterial({
        color: hullTone,
        emissive: emisTone,
        // UNITY, and it stays unity. The floor's SIZE is `emissiveFloor`
        // above (baked into the emissive colour); this multiplier is left at
        // 1.0 because it is not a tuning dial any more — it is the hook three
        // separate per-frame systems ride (game-core's hull pulse, the
        // 1x->1.9x attack telegraph in game-controls, and the range-deficit
        // brightness lift that pays for the capped hull-screen floor), each
        // of which multiplies whatever it finds here. Keeping it at 1.0 keeps
        // all three at the relative headroom they were measured against.
        emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1.0,
        roughness: opts.roughness !== undefined ? opts.roughness : 0.42,
        metalness: opts.metalness !== undefined ? opts.metalness : 0.35,
        // FrontSide: DoubleSide drew every interior face of these untextured
        // GLBs on top of the exterior, which is what crumpled a close-range
        // hull into a paper wad with no readable surface.
        side: THREE.FrontSide,
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        depthTest: true
    });

    _addFresnelRim(material, {
        idle: rimTone.getHex(),
        boostA: base.getHex(),
        boostB: rimHot.getHex(),
        boostT: opts.rimIntensity !== undefined ? opts.rimIntensity : 0.6,
        power: opts.rimPower !== undefined ? opts.rimPower : 2.4,
        // HALVED (0.9/1.7 -> 0.45/0.85) because these constants had never
        // actually been seen. The rim block was never spliced into the
        // fragment shader (see the anchor bug in _addFresnelRim), so every
        // rim number this material carries was tuned against a term that
        // rendered nothing. Now that it renders, the shipped values put
        // +13/255 of flat lift on the hull and cost 5% of its measured
        // surface detail; half strength keeps the leading-edge separation
        // the rim is for at +7/255 and 2.5%.
        baseStrength: opts.rimBaseStrength !== undefined ? opts.rimBaseStrength : 0.45,
        boostStrength: opts.rimBoostStrength !== undefined ? opts.rimBoostStrength : 0.85,
        coreDarken: opts.coreDarken !== undefined ? opts.coreDarken : 0.22,
        // PANEL/RIVET SURFACE DETAIL. These GLBs carry no TEXCOORD (see
        // the player-hull note further down), so a conventional
        // map/roughnessMap/normalMap is a no-op on them — silently
        // sampling an undefined vUv. _rimPanelDetail already solves this
        // for the player hull via object-space triplanar noise (no UVs
        // needed); it was just never turned on for enemy/boss hulls,
        // which is why 0 of 7,848 hull materials in the scene ever showed
        // panel lines, rivets or AO. On by default here for every caller
        // of createFactionHullMaterial (enemy, boss, fallback, UFO).
        panelDetail: opts.panelDetail !== false,
        panelCellSize: opts.panelCellSize !== undefined ? opts.panelCellSize : 12,
        // PANEL RELIEF, RAISED 0.55 -> 1.8. The bump inject perturbs the lit
        // normal with the panel field, so its whole effect is proportional to
        // how much DIRECTIONAL light lands on the hull — and until the rig
        // above went live, that was none: the perturbation was being applied
        // to a normal that only ever met a constant ambient, which is why the
        // panel plates only ever read as a printed pattern. Now that the key
        // actually shades them, relief is the cheapest surface variance in
        // this material. Measured on a Klingon hull at 400u tail-on (its
        // worst pose — a broad flat rear plate facing the camera, where a
        // smooth Lambert term has almost nothing to say), bare hull, world
        // paused, key held at 2.2: bump 0.55 -> std 39.3, bump 1.2 -> 49.5,
        // bump 2.0 -> 56.8. Every other class gains from it too, and it costs
        // brightness rather than buying it (grooves shade DOWN), so it is the
        // one term here that raises spread without raising the mean.
        panelBump: opts.panelBump !== undefined ? opts.panelBump : 1.8,
        // The hard specular that makes a hostile read as a lit metal object
        // rather than a shaded solid. On by default for every enemy, boss,
        // fallback and UFO hull — the mechanism is shared, there are no
        // per-class overrides.
        hullSpec: opts.hullSpec !== false,
        // 2.2 / 28 IS A WASH, NOT A HIGHLIGHT. The round-5 critic ablated this
        // term live and reported it net-NEGATIVE on the pale-hull factions —
        // spec OFF buying +43% high-frequency detail and +78% p90-p10 contrast
        // at 90u — on the argument that these are 392-tri GLBs with SMOOTHED
        // normals, so an N.H^28 lobe covers a huge swath of the ship and at
        // 2.2 in linear space that swath clips to white through ACES, erasing
        // the panel plates the detail injection just added.
        //
        // MEASURED AGAIN HERE (same-frame readback, world paused, subject
        // isolated, hull-only render, px at lum>40), the direction is theirs
        // but the magnitude is not — on this build the term barely renders at
        // all:
        //   91.5u hull @150u   spec 2.2/28  mean|Lap| 21.06  p90-p10 146
        //                      spec 0.5/90  mean|Lap| 21.19  p90-p10 146
        //                      spec OFF     mean|Lap| 21.19  p90-p10 146
        //   39.4u hull @300u   2.2/28 47.47 / 117   0.5/90 47.82 / 119
        //                      OFF    47.84 / 119
        // 0.5/90 is bit-for-bit indistinguishable from OFF (uSpecStrength 0.5
        // vs 50 at power 90 renders the SAME mean luminance to 0.1/255 — the
        // lobe is so tight it lands on no pixels of these hulls), and the old
        // 2.2/28 was itself only ~0.7% of detail away from OFF. The plumbing
        // is live, not dead: strength 50 at power 2 moves hull mean luminance
        // 140.8 -> 246.3, so the term does render, it just has nothing to bite
        // on at a sane exponent.
        //
        // Shipped at the critic's prescribed 0.5 / 90 because every measured
        // number moves the right way (detail +0.7%, contrast +2 on the small
        // hull) and because it removes the ACES-clipping failure mode on any
        // hull that IS flat-normalled enough for the wide lobe to land. What
        // it does NOT do is buy the +43%/+78% the ablation advertised, and the
        // honest read of these numbers is that hull material is being carried
        // by the panel/rim/form injections, not by this highlight.
        specStrength: opts.specStrength !== undefined ? opts.specStrength : 0.5,
        specPower: opts.specPower !== undefined ? opts.specPower : 90.0,
        skyStrength: opts.skyStrength !== undefined ? opts.skyStrength : 0.10,
        // THE RIG. On by default for every enemy, boss, fallback and UFO hull
        // — this is the term that turns a faction-coloured silhouette into a
        // lit object, and there are no per-class tiers here for the same
        // reason there are none anywhere else in this material.
        hullLightRig: opts.hullLightRig !== false,
        keyDir: new THREE.Vector3().fromArray(_HULL_LIGHT_RIG.keyDir),
        keyColor: opts.keyColor !== undefined ? opts.keyColor : _HULL_LIGHT_RIG.keyColor,
        keyStrength: opts.keyStrength !== undefined ? opts.keyStrength : 2.4,
        fillDir: new THREE.Vector3().fromArray(_HULL_LIGHT_RIG.fillDir),
        fillColor: opts.fillColor !== undefined ? opts.fillColor : _HULL_LIGHT_RIG.fillColor,
        fillStrength: opts.fillStrength !== undefined ? opts.fillStrength : 0.12,
        backDir: new THREE.Vector3().fromArray(_HULL_LIGHT_RIG.backDir),
        backColor: opts.backColor !== undefined ? opts.backColor : _HULL_LIGHT_RIG.backColor,
        backStrength: opts.backStrength !== undefined ? opts.backStrength : 0.30,
        hullForm: opts.hullForm !== false,
        formFloor: opts.formFloor !== undefined ? opts.formFloor : 0.66,
        formTop: opts.formTop !== undefined ? opts.formTop : 1.72,
        formNoseSign: opts.formNoseSign !== undefined ? opts.formNoseSign : -1.0,
        formNoseDark: opts.formNoseDark !== undefined ? opts.formNoseDark : 0.55
    });

    // LIVE A/B HOOK — same argument as uRimPanelFine being a uniform rather
    // than a compile-time branch. Which hostile a measurement pass happens to
    // grab varies between page loads, so the only honest way to compare two
    // floors is to rebuild the SAME hull at both in the SAME frame. That needs
    // the two things this call consumed and then threw away.
    material.userData._hullMatSpec = { base: base.getHex(), opts: opts };

    return material;
}

// ── DAMAGE TIER DRIVER ───────────────────────────────────────────────────
//
// Writes each ship's own `uDamage` from its own HP. This is safe to do on a
// per-material uniform — and NOT via an onBeforeRender write to a shared
// material — because createEnemyMeshWithModel / createBossMeshWithModel call
// createFactionHullMaterial once per hull mesh per SHIP (getEnemyModel hands
// back model.clone(), whose materials are then replaced wholesale), so a
// hull material instance belongs to exactly one hostile. An onBeforeRender
// write would in fact be WRONG here if materials ever were shared: three.js
// only re-uploads a material's uniforms when the bound material CHANGES, so
// twenty hostiles sharing one material would all render with whichever
// damage value the first of them wrote.
//
// TIERS, NOT A CONTINUUM. The brief is "at least one damage tier", and a
// tier is what a player can actually name: an undamaged ship must look
// undamaged (a permanent light dusting of scorch would just be texture), a
// hurt ship shows scarring, and a ship about to die is visibly burning. So
// this is flat 0 above 75% HP, then ramps, and it never quite reaches 1.0
// while the ship is alive — full 1.0 is what a wreck looks like, and a wreck
// is the explosion's job.
const _HULL_DMG_START = 0.75;   // HP fraction where scarring begins
const _HULL_DMG_FLOOR = 0.06;   // HP fraction that reads as fully wrecked
function _hullDamageFromHp(hp) {
    if (!(hp < _HULL_DMG_START)) return 0;
    const t = (_HULL_DMG_START - hp) / (_HULL_DMG_START - _HULL_DMG_FLOOR);
    // ^0.7, not linear. Measured across the tiers on three hulls, a linear
    // ramp put 0-0.3% of hull pixels under scorch at 60% HP and 35-74% at 5%
    // HP: the first half of the health bar showed the player nothing, and the
    // last sliver of it turned the ship into a black silhouette that had
    // stopped being a readable ship at all. Front-loading the curve spends
    // the range where the information is actually worth something.
    return Math.min(0.95, Math.pow(Math.max(0, t), 0.7));
}

function _syncHullDamage(ship) {
    if (!ship || !ship.userData) return;
    const maxHp = ship.userData.maxHealth;
    const hp = ship.userData.health;
    if (!(maxHp > 0) || typeof hp !== 'number') return;
    const dmg = _hullDamageFromHp(Math.max(0, hp) / maxHp);
    // Nothing to do while pristine and already pristine — this runs for every
    // hostile every frame, and the overwhelmingly common case is a healthy
    // ship, so the early-out is the point.
    if (dmg === 0 && ship.userData._hullDmg === 0) return;
    if (ship.userData._hullDmg === dmg) return;
    ship.userData._hullDmg = dmg;
    // Cache the uniform list on first write: traversing a GLB hull every
    // frame for every hostile is the kind of cost that only shows up in a
    // 30-ship brawl, which is exactly when ships are taking damage.
    let list = ship.userData._hullDmgUniforms;
    if (!list) {
        list = [];
        ship.traverse(n => {
            const m = n.material;
            if (!m || !m.userData || !m.userData._rimUniforms) return;
            if (m.userData._rimUniforms.uDamage) list.push(m.userData._rimUniforms.uDamage);
        });
        ship.userData._hullDmgUniforms = list;
    }
    for (let i = 0; i < list.length; i++) list[i].value = dmg;
}
if (typeof window !== 'undefined') {
    window._syncHullDamage = _syncHullDamage;
    window._hullDamageFromHp = _hullDamageFromHp;
}

// Attach small additive engine-glow spheres at the rear of a GLB hull
// (local -Z is forward per the game's flight convention, so +Z is the
// engine end). Called BEFORE _applyNoseFlip so nose-flipped models
// (region 1/8) carry their glow into the same rotated inner group as
// the rest of the hull and end up on the correct (rear) end either way.
// Tagged isGlowLayer so the existing enemy-glow pulse in game-core.js
// (updateOuterSystemDiscovery's neighbor pass) animates them for free.
// radiusFactor/radiusFloor let callers tighten the blob independently of
// hull scale — enemies pass a smaller pair (see createEnemyMeshWithModel)
// so the glow doesn't outdraw the hull at combat range; bosses keep the
// original defaults so their silhouette (already large) is unaffected.
// ENGINE QUADS. The old version was two additive SPHERES — isotropic blobs
// that looked identical from every angle, so they added brightness but zero
// facing information (and at close range they were most of what the eye
// actually resolved). Each nozzle is now a soft additive QUAD lying across
// the ship's forward axis plus a small white-hot core: seen from behind it
// is a bright faction-colored disc, seen from the side it collapses to a
// thin line, and seen head-on it disappears — which is exactly the read
// "that ship is pointing away from / across / at me".
// radiusFactor is a FRACTION OF THE HULL'S LARGEST DIMENSION. It used to be
// a fraction of the smallest dimension with an ABSOLUTE floor in model-local
// units (0.28 for fighters, 0.5 for bosses) — and on every GLB in the game
// that floor won by an order of magnitude, so the "small engine glow" was
// actually a pair of blobs LARGER than the hull they were bolted to. That is
// why the additive glow kept out-drawing the silhouette no matter how the
// hull material was tuned. Hull-relative sizing makes the nozzles scale with
// the ship instead of swamping it.
function _attachEngineGlow(model, colorHex, box, sizeScale, radiusFactor, radiusFloor) {
    sizeScale = sizeScale || 1.0;
    radiusFactor = radiusFactor !== undefined ? radiusFactor : 0.09;
    radiusFloor = radiusFloor !== undefined ? radiusFloor : 0.0;
    const size = box.getSize(new THREE.Vector3());
    if (!isFinite(size.x) || !isFinite(size.z) || (size.x === 0 && size.z === 0)) return;

    const base = new THREE.Color(colorHex !== undefined ? colorHex : 0xffaa33);
    // Multiplied down because the game-core pulse loop overwrites every
    // isGlowLayer opacity with its own 0.35-0.85 ramp — colour intensity is
    // the only handle left for keeping the nozzles from out-drawing the hull.
    const flareColor = base.clone().lerp(new THREE.Color(0xffffff), 0.42).multiplyScalar(0.62);
    const coreColor = base.clone().lerp(new THREE.Color(0xffffff), 0.78).multiplyScalar(0.78);

    const hullMax = Math.max(size.x, size.y || 0, size.z || 0);
    const radius = Math.max(radiusFloor, hullMax * radiusFactor) * sizeScale;
    const flareSize = radius * 3.4;
    const coreGeo = new THREE.SphereGeometry(radius * 0.62, 6, 6);
    const flareGeo = new THREE.PlaneGeometry(flareSize, flareSize);
    const rearZ = box.max.z - radius * 0.4;
    const lateral = size.x * 0.26;

    [-lateral, lateral].forEach((x) => {
        // Soft nozzle flare — faces along +Z (the engine end), DoubleSide so
        // it still reads when the hull banks past edge-on.
        const flareMat = new THREE.MeshBasicMaterial({
            map: (typeof _getEngineBloomTexture === 'function') ? _getEngineBloomTexture() : null,
            color: flareColor,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true
        });
        const flare = new THREE.Mesh(flareGeo, flareMat);
        flare.position.set(x, 0, rearZ + radius * 0.5);
        flare.userData.isGlowLayer = true;
        flare.renderOrder = 60;
        flare.frustumCulled = false;
        model.add(flare);

        // Small white-hot nozzle core so the engine still registers from any
        // angle (and gives the silhouette a couple of high-value pixels).
        const coreMat = new THREE.MeshBasicMaterial({
            color: coreColor,
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.set(x, 0, rearZ);
        core.userData.isGlowLayer = true;
        core.renderOrder = 61;
        core.frustumCulled = false;
        model.add(core);
    });
}

// SHARED HULL EMISSIVE-FLOOR MARGIN — applies to every hostile faction
// fighter hull (GLB path and fallback geometry alike), not just the two
// classes an earlier acceptance test happened to name.
//
// This used to be a per-class ternary (`_isVulcanHull ? 0.62 : 0.28`) that
// only lifted the Vulcan Patrol (and, on the fallback path, its
// not-yet-loaded placeholder) while every other faction — Martian Pirate,
// Sith, Cardassian, Klingon, Romulan, UFO, etc. — shipped the 0.28 shared
// default from createFactionHullMaterial. Same-frame readback at 900u
// showed that default sitting well under the 100/255 legibility bar for
// several of those factions (Martian Pirate 59.9, Sith 71.0, Cardassian
// 76.6), i.e. the exact "darker than empty space" failure the Vulcan/UFO
// fix was supposed to solve for the WHOLE roster, not for two named
// classes. The margin that cleared the bar for the Vulcan's unusually
// sparse, low-fill silhouette (see the "Region 8" note further down)
// clears it with room to spare for every denser fighter silhouette too,
// so there is no reason to keep two tiers — one shared constant, applied
// everywhere createEnemyMeshWithModel builds a hull material.
//
// WHAT THAT ARGUMENT MISSED, and why the numbers below are a tenth of what
// they were. Every reading quoted above is a MEDIAN LUMINANCE — "is this hull
// brighter than empty space" — and a flat self-lit plate is the cheapest
// possible way to win that test. It is also the most expensive possible way,
// because emissive is added after every lighting term and is identical on
// every facet: the roster bought its median with the one term that carries no
// form. Measured on this build, bare hull, world paused, subject isolated,
// stats over fully-covered mask pixels only: at emissiveIntensity 0.62 the
// UFO's per-pixel luminance std topped out at 53.9 across eight yaws (bar 60)
// while its MEAN sat at 132-183 — a bright, flat plate. Every faction showed
// the same shape, and at 900u where the floor is proportionally the largest
// share of the read, std collapsed to 12.8-25.6 on half the roster.
//
// So the floor stops being the answer to "can you see it" and goes back to
// being the answer to "is it black in genuinely unlit space". Same shape and
// the same 0.09x-base value proven on the player hull one round ago (which
// took that hull from std 34.0 to 70.0), and the same second half of that
// fix: with the floor no longer spending the value range, coreDarken can
// widen the facing/grazing split far enough for the rim to read as a rim.
// The key/fill/rim rig (_HULL_LIGHT_RIG) and the panel/greeble/spec
// injections were already live on every one of these hulls — they were just
// being drowned by a constant.
const _HULL_EMISSIVE_FLOOR = {
    // 1.0 — the floor's size is emissiveFloor now, not this. See the note on
    // emissiveIntensity in createFactionHullMaterial.
    emissiveIntensity: 1.0,
    emissiveFloor: 0.09,
    emissiveCool: 0.55,
    // Was the shared 0.22 default. The player hull runs 0.62 and measures
    // std 70; hostiles are read at 200-900u rather than 10-30u, so they take
    // slightly less of it — enough to open the core/rim split, not so much
    // that a nose-on contact at 900u loses its facing panels entirely.
    coreDarken: 0.52,
    // UNCHANGED. This is where the faction hue lives now, so it is the last
    // thing that should move: the rim's idle/boost colours are the saturated
    // base colour, and _setEnemyTelegraph swings boostT from here to 1.0 as
    // the attack winds up. Dropping it would cost both the faction read and
    // the telegraph's hue swing.
    rimIntensity: 0.85
};

// Create enemy mesh using GLB model or fallback geometry
function createEnemyMeshWithModel(regionId, fallbackGeometry, material, scaleOverride) {
    const model = getEnemyModel(regionId);

    if (model) {
        // Use the GLB model
        // console.log(`Using GLB model for Enemy ${regionId}`);

        // Debug: Log what's in the model
        let meshCount = 0;
        let vertexCount = 0;

        // CRITICAL: Set the entire model visible first
        model.visible = true;
        model.frustumCulled = false;  // Don't cull when slightly off-screen

        // STEP 1: Collect all base meshes and apply materials
        const baseMeshes = [];
        model.traverse((child) => {
            if (child.isMesh) {
                meshCount++;
                if (child.geometry) {
                    const positions = child.geometry.attributes.position;
                    if (positions) {
                        vertexCount += positions.count;
                    }
                }

                // Make visible
                child.visible = true;
                child.frustumCulled = false;

                // LIT, RIM-LIT, TOP-LIT hull — NOT a self-lit one. The body
                // is a high-value heated albedo and the faction identity
                // lives in the rim and the engine plume; the always-on
                // emissive term is a small cold floor (see
                // _HULL_EMISSIVE_FLOOR above) whose whole job is "not black
                // in genuinely unlit space", nothing more. Everything the
                // player reads as SURFACE — the key/fill/rim response, the
                // panel plates, the greeble speckle, the nose/spine form
                // ramp — is direction-dependent, and each of those terms is
                // only visible in proportion to how little of the value
                // range the constant floor has already spent.
                //
                // The whole roster takes ONE spec. There is no per-class
                // tier here any more and there should not be one: the
                // failure the old per-class Vulcan margin was chasing (a
                // sparse saucer-and-nacelles silhouette pooling low because
                // anti-aliased partial-coverage pixels are a large share of
                // its footprint) is a SAMPLING artefact of how it was
                // measured, not something the player sees, and paying for it
                // with a brighter constant flattened every dense hull in the
                // game to buy a better median on one sparse one.
                child.material = createFactionHullMaterial(material.color || 0xff0000, Object.assign({}, _HULL_EMISSIVE_FLOOR, {
                    panelCellSize: _hullPanelCellSize(child.geometry),
                    // Nose direction in MESH-LOCAL space: the nose-flipped
                    // regions are authored +Z-forward, everything else -Z.
                    formNoseSign: _enemyModelNoseFlip[regionId] ? 1.0 : -1.0
                }));

                child.castShadow = false;
                child.receiveShadow = false;

                baseMeshes.push(child);
            }
        });

        // STEP 2: Center the model BEFORE adding glow layers
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());

        model.traverse((child) => {
            if (child.isMesh) {
                child.position.sub(center);
            }
        });

        // STEP 2b (REMOVED): the small rear engine flares.
        //
        // Every hostile used to get four additive nozzle billboards here —
        // two soft flare quads facing +Z plus two white-hot cores. Measured
        // against the framebuffer they bought nothing: the flare quads are
        // axis-facing planes, so from the front they are invisible and from
        // any oblique angle they collapse to a line, and the cores are a
        // couple of pixels at combat range. "Zero engine glow at 100-150u"
        // was a real reading of a real hull, not a bug in the measurement.
        //
        // They are gone because the hostile engine signature is now ONE
        // thing, not two competing ones: _ensureShipThrusterCones in
        // game-controls.js attaches a persistent, camera-facing, faction-
        // coloured plume at exactly this spot on the hull. Leaving these
        // here would have stacked a second additive source on the same
        // nozzle, washing the plume's white-hot core into a flat blob —
        // the same "stack additive layers until the shading is gone"
        // mistake the duplicate hull shell (STEP 3, below) was deleted for.
        //
        // Net cost, measured live: 233 of 302 hostiles carried these, four
        // draw calls each. Dropping them roughly pays for the plume.
        // (_attachEngineGlow itself stays — the boss path still uses it,
        // and bosses are not guaranteed to be plume-bearing.)

        // STEP 3 (REMOVED): the full-hull additive DUPLICATE SHELL.
        // Every hull mesh used to carry a cloned copy of itself in an
        // additive MeshBasicMaterial whose opacity the game-core pulse loop
        // drove between 0.35 and 0.85. Stacked on top of an already-emissive
        // hull that shell is what clipped a close-range ship into a flat
        // white wad: it added a second, unshaded, full-coverage copy of the
        // silhouette, so every shading cue underneath it (rim, top-lit ramp,
        // nose accent) was washed out at exactly the range those cues matter.
        // The engine flares above are still tagged isGlowLayer, so the pulse
        // loop keeps a throbbing target — it now throbs on the ENGINES,
        // which is where a pulsing glow actually belongs.

        // Scale enemy models. ENEMY_SCALE_FACTOR sizes every enemy
        // (default-96 path AND explicit scaleOverride callers, e.g.
        // galaxy enemies passing 96.0, plus local Pirates/Vulcans) at
        // a single point. History: 0.5 (halved) -> 0.72 -> 2.02.
        // MEASURED: at 0.72 the modal Hostile's projected hull box was
        // 18.7 x 10.1 px at 500u — a smear, not a ship, and far below the
        // Overlord/boss footprint (~60 x 29 px at the same range) that the
        // combat read is tuned around. 2.02 (2.8x) puts the same hull at
        // ~52 x 28 px at 500u, clearing the >=45 x >=25 px target with
        // margin at the worst-case nose-on orientation while staying just
        // under the boss silhouette so rank still reads by size.
        // Gameplay interplay, re-verified after the change: enemy hitboxSize
        // is a bbox max-dimension capped at 200 (game-controls.js), so it
        // rises 46 -> ~130 and stays under the cap — the laser hit sphere
        // grows WITH the ship instead of decoupling from it. Enemy shields
        // (_ensureEnemyShield) size from the same hull bbox by ratio, so the
        // bubble keeps hugging the hull at 0.31x span. AI standoffs floor at
        // 350/470u, well above anything this changes.
        const ENEMY_SCALE_FACTOR = 2.02;
        const finalScale = (scaleOverride !== undefined ? scaleOverride : 96.0) * ENEMY_SCALE_FACTOR;
        const correction = _enemyModelScaleCorrection[regionId] || 1.0;
        model.scale.multiplyScalar(finalScale * correction);

        // Nose-flip models authored +Z-forward so they fly nose-first
        _applyNoseFlip(model, regionId);

        // VULCAN PATROL RANGE FLOOR (regionId 8 only). Measured (critic,
        // wave-5): at 900u the Vulcan Patrol's own hull footprint is a
        // 35x14px sliver — "no ship" — while its engine plume+glow covers
        // 6.92x that screen area. Every other class in this function
        // already clears the luminance bar without a geometric floor, so
        // this is scoped tight to regionId 8 rather than applied to the
        // shared path: growing a hull that already reads fine would just
        // blur it against its formation-mates for no readability gain.
        //
        // Wrapped in a fresh group rather than scaling `model` (or its
        // scale) directly: callers add a hitbox as a CHILD of whatever
        // this function returns (or, for the Vulcan Patrol's own local
        // spawner in game-objects.js, of an outer wrapper built around
        // this return value) — either way the hitbox never ends up nested
        // inside this new group, so the range floor's per-frame scale
        // changes never touch hit-detection size.
        if (regionId === 8 && typeof THREE !== 'undefined') {
            const vulcanHullGroup = new THREE.Group();
            model.children.slice().forEach((c) => vulcanHullGroup.add(c));
            model.add(vulcanHullGroup);
            _installHullScreenFloor(vulcanHullGroup, 60, 2.5);
        }

        return model;
    } else {
        // Fallback to procedural geometry — log loudly so it's visible
        // why the GLB didn't load.
        const cacheState = (typeof modelCache !== 'undefined') ? modelCache.enemies[regionId] : 'UNDEFINED';
        console.warn(`⚠️ Enemy${regionId}.glb fallback used. modelCache state: ${cacheState === null ? 'null (load failed)' : cacheState === undefined ? 'undefined (not loaded yet)' : 'unexpected ' + typeof cacheState}`);

        // Same high-value, rim-lit, top-lit keying as the GLB path so a
        // fallback ship reads with the same presence and the same facing
        // cues instead of being a dark saturated blob (see "VALUE, NOT HUE"
        // on createFactionHullMaterial). The additive duplicate shell that
        // used to sit on top of this is gone for the same reason it is gone
        // on the GLB path — it flattened the silhouette it was meant to sell.
        // Takes the identical spec to the GLB path above, from the same one
        // object, so a not-yet-loaded Enemy8.glb doesn't hand the player a
        // placeholder that visibly changes brightness once the real model
        // swaps in.
        const baseMaterial = createFactionHullMaterial(material.color || 0xff0000, Object.assign({}, _HULL_EMISSIVE_FLOOR, {
            roughness: 0.5,
            panelCellSize: _hullPanelCellSize(fallbackGeometry),
            formNoseSign: -1.0
        }));

        const baseMesh = new THREE.Mesh(fallbackGeometry, baseMaterial);
        return baseMesh;
    }
}

// Create boss mesh using GLB model or fallback geometry
function createBossMeshWithModel(regionId, fallbackGeometry, material) {
    const model = getBossModel(regionId);

    if (model) {
        // Use the GLB model
        console.log(`👑 Using GLB Boss${regionId}.glb model`);

        // CRITICAL: Set the entire model visible first
        model.visible = true;
        model.frustumCulled = false;

        // PRESERVE the GLB model's material but enhance it with game colors
        // DON'T replace it entirely - that makes models look like procedural geometry
        model.traverse((child) => {
            if (child.isMesh) {
                // CRITICAL: Make each mesh visible
                child.visible = true;
                child.frustumCulled = false;

                // Faction-tinted but bright enough to read clearly. The
                // previous 0.3x multiplier was so dim that bosses appeared
                // muddy/geometric — bumped to 0.7x and added emissive so
                // the model silhouette pops against starfield. Now rim-lit
                // (createFactionHullMaterial) so leading edges catch a
                // brighter faction-color fresnel highlight too.
                // A boss carried the DIMMEST emissive of any ship in the game
                // (0.35 x 0.9 = 0.315 effective, against 0.55 for a common
                // fighter), so the set-piece encounter was the hardest thing
                // in the scene to see. It now sits above the fighters, which
                // is the read a boss is supposed to have.
                // Same keying as the fighters (see "VALUE, NOT HUE" and the
                // floor note on _HULL_EMISSIVE_FLOOR), with the boss's
                // one-notch margin taken where it can still be SEEN: a
                // hotter ALBEDO and a stronger rim, both of which are lit /
                // view-dependent terms, rather than a bigger constant floor.
                // A boss that out-read its escorts by carrying more emissive
                // was out-reading them by being flatter than they are.
                child.material = createFactionHullMaterial(material.color || 0xff0000, Object.assign({}, _HULL_EMISSIVE_FLOOR, {
                    hullHeat: 0.40,
                    roughness: 0.4,
                    rimIntensity: 0.7,
                    rimBaseStrength: 1.1,
                    panelCellSize: _hullPanelCellSize(child.geometry),
                    formNoseSign: _enemyModelNoseFlip[regionId] ? 1.0 : -1.0
                }));

                child.castShadow = false;
                child.receiveShadow = false;
            }
        });

        // Center the model to fix position offset issues
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());

        // Offset all children to center the model at origin
        model.traverse((child) => {
            if (child.isMesh) {
                child.position.sub(center);
            }
        });

        // Small engine glows at the hull's rear — must run before
        // _applyNoseFlip (below) so nose-flipped bosses (1/8) carry the
        // glow into the rotated inner group with everything else.
        const centeredBossBox = new THREE.Box3().setFromObject(model);
        _attachEngineGlow(model, material.color || 0xffaa33, centeredBossBox, 1.0, 0.075, 0.0);

        // Bosses are larger than enemies. BOSS_SCALE_FACTOR=0.5 halves
        // every boss to match the enemy ship halving (144 -> 72 base).
        const BOSS_SCALE_FACTOR = 0.5;
        const bossCorrection = _enemyModelScaleCorrection[regionId] || 1.0;
        model.scale.multiplyScalar(144.0 * BOSS_SCALE_FACTOR * bossCorrection);

        // Boss1/Boss8 share the +Z-nose authoring of their fighter models
        _applyNoseFlip(model, regionId);

        return model;
    } else {
        // Fallback to procedural geometry — log loudly so we can diagnose
        // why the GLB didn't load. modelCache.bosses[regionId] === null
        // means either the file failed to load or spawn happened before
        // loadAllModels finished.
        const cacheState = (typeof modelCache !== 'undefined') ? modelCache.bosses[regionId] : 'UNDEFINED';
        console.warn(`⚠️ Boss${regionId}.glb fallback used. modelCache state: ${cacheState === null ? 'null (load failed)' : cacheState === undefined ? 'undefined (not loaded yet)' : 'unexpected ' + typeof cacheState}`);
        const mesh = new THREE.Mesh(fallbackGeometry, material);
        mesh.scale.multiplyScalar(2.5);
        return mesh;
    }
}

// Attach player model to camera
function attachPlayerModelToCamera(camera) {
    const playerModel = getPlayerModel();

    if (playerModel) {
        console.log('✅ Attaching player model to camera');

        // Scale and position the player model appropriately
        playerModel.scale.set(0.5, 0.5, 0.5);

        // Position it slightly forward and down from camera perspective
        // so player can see their own ship from behind
        playerModel.position.set(0, -2, 5); // Adjust as needed

        // Rotate it to face forward
        playerModel.rotation.y = Math.PI; // Face forward

        // Add to camera so it moves with the camera
        camera.add(playerModel);

        return playerModel;
    } else {
        console.log('⚠️ No player model available, using camera-only view');
        return null;
    }
}

// =============================================================================
// PLAYER HULL MATERIAL RESPONSE + ENGINE BLOOM
// =============================================================================
// camera-system.js builds the live player mesh from getPlayerModel() and
// immediately paints every mesh with a flat unlit MeshBasicMaterial
// (0x00ffff, opacity 0.85) — the hull reads as one dead-flat fill with
// no lighting response (#00E8ED, pixel std ~11/255). That material swap
// happens in a file this piece doesn't own, so instead of racing it,
// this watches the shared cameraState.playerShipMesh global and — once
// camera-system.js has finished building it — upgrades the hull to a
// rim-lit MeshStandardMaterial (real response to the scene's shipLight)
// plus additive engine-bloom sprites at the nozzles that scale with
// gameState.velocityVector. Runs its own rAF loop so the upgrade lands
// without editing camera-system.js.

const PLAYER_HULL_BASE_COLOR = 0x00e8ed;
// gameState.velocityVector is in raw sim units; the HUD displays
// velocityVector.length() * 1000 as "km/s" (see game-physics.js
// speedKmS), so 6800 "u/s" in the brief == 6.8 raw units — full boost.
const PLAYER_BOOST_REFERENCE_SPEED = 6.8;

// Player hull is ONE mesh authored with zero UVs (verified against the
// GLB: POSITION + NORMAL only, no TEXCOORD) so a conventional map/normalMap
// is out — the panel/greeble detail below is projected triplanar in the
// mesh's own OBJECT space (see _addFresnelRim's panelDetail path) instead,
// which needs no UVs and stays fixed to the hull under rotation. This is
// the MID cell; _rimPanelMask draws the coarse octave at cell * 3, so 0.015
// reproduces the previous 0.045 plate lattice (~6 plates across the
// ~0.28-unit hull length — the existing engine-bloom sprites are hand-placed
// at local Z=-0.14, i.e. half-length 0.14, in this same object-space frame)
// and layers 18- and 54-plate lattices over it, which the player's own ship,
// permanently ~10-30u from the third-person camera, is always close enough
// to resolve.
const PLAYER_HULL_PANEL_CELL = 0.015;

// THE PLAYER HULL TAKES THE SAME RIG. It used to carry its own copy — a
// second set of camera-parented KEY/FILL/RIM DirectionalLights declared right
// here — which was inert for exactly the same reason the hostile lamp above
// was (see the _HULL_LIGHT_RIG note: the camera is not in the scene graph, so
// nothing parented to it is ever collected). Both copies are now one shader
// rig evaluated in _addFresnelRim, so the player's hull and the fleet it is
// shooting at are lit by the same three lamps from the same three view-space
// directions — which is what makes them read as being in the same room.
// The player hull is closer, more central and metalness 0.65 rather than 0.35,
// so it takes the rig at its own strengths (below) rather than the hostiles'.

function createPlayerHullMaterial() {
    // Presence floor, in the ship's own accent cyan. This used to be the term
    // doing ALL the work (base*0.42 at intensity 1.15, effective ~0.48*base)
    // because nothing else was lighting the hull — emissive is added AFTER
    // coreDarken and is independent of every light in the scene, so a floor
    // that big pins every surface to nearly the same value regardless of its
    // normal, which is precisely why an isolated hull measured luminance std
    // 34.0/255 (target >55) despite carrying a real rim/panel/spec rig: the
    // floor was spending the entire value range before any of those terms
    // got a turn. Now that the shared shader rig (_HULL_LIGHT_RIG) gives this hull an
    // actual KEY/FILL/RIM response, the floor only has to do the ORIGINAL
    // job — keep the ship a legible cyan shape in genuinely unlit space —
    // not carry the whole presence read, so it drops to a fraction of base
    // small enough that the lit terms are what the eye actually reads.
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(PLAYER_HULL_BASE_COLOR),
        emissive: new THREE.Color(PLAYER_HULL_BASE_COLOR).multiplyScalar(0.09),
        emissiveIntensity: 1.0,
        metalness: 0.65,
        roughness: 0.32,
        side: THREE.FrontSide,
        transparent: false,
        depthWrite: true,
        depthTest: true
    });

    const uniforms = _addFresnelRim(material, {
        idle: 0x2ad4ff,      // cool cyan-blue at rest — reads as ambient environment light
        boostA: 0xffcc33,    // gold
        boostB: 0xff2ad4,    // magenta
        boostT: 0.0,
        power: 2.6,
        // Also cut (2.4/4.2 -> 1.0/1.8): same reason as the hostiles above.
        // These were raised twice against a rim term that was never in the
        // compiled shader, so the "measured rim/core ratio 0.64" they were
        // chasing was a measurement of no rim at all. At 2.4/4.2 a now-live
        // rim floods a hull whose emissive floor is now small (0.09*base)
        // but which now also carries a real KEY/FILL/RIM lit response —
        // stacking a strong shader rim on top of a strong PHYSICAL rim light
        // would double up the same visual role.
        baseStrength: 1.0,
        boostStrength: 1.8,
        coreDarken: 0.62,    // was 0.55 — dim facing panels so the rim reads brighter than the core instead of losing to it; raised further to widen core/rim luminance spread (measured hull-pixel std 41.5/255 during boost, target >55/255)
        panelDetail: true,
        panelCellSize: PLAYER_HULL_PANEL_CELL,
        // Same specular mechanism as the hostiles, in the player ship's own
        // cool key: this hull is metalness 0.65 and sits 10-30u from the
        // camera, so it is the surface with the most to gain from a real
        // highlight — and it is the reference the player's eye calibrates
        // "what a ship in this game is made of" against.
        hullSpec: true,
        specColor: 0xd8f4ff,
        specStrength: 2.6,
        specPower: 34.0,
        skyStrength: 0.07,
        // The same three lamps the fleet is lit by (see _HULL_LIGHT_RIG),
        // taken slightly hotter: this hull is metalness 0.65 against the
        // hostiles' 0.35 and sits 10-30u from the camera rather than 200-900u,
        // so it can carry a stronger terminator without the lit side clipping.
        hullLightRig: true,
        keyDir: new THREE.Vector3().fromArray(_HULL_LIGHT_RIG.keyDir),
        keyColor: _HULL_LIGHT_RIG.keyColor,
        keyStrength: 1.8,
        fillDir: new THREE.Vector3().fromArray(_HULL_LIGHT_RIG.fillDir),
        fillColor: _HULL_LIGHT_RIG.fillColor,
        fillStrength: 0.12,
        backDir: new THREE.Vector3().fromArray(_HULL_LIGHT_RIG.backDir),
        backColor: _HULL_LIGHT_RIG.backColor,
        backStrength: 0.30,
        // The damage tier is a HOSTILE-legibility cue ("that one is nearly
        // dead") and the player's own hull already has a HUD hull-integrity
        // bar six inches from the crosshair. Off here so the player ship does
        // not pay for a shader branch that would never be driven above zero.
        battleDamage: false,
        // Was half strength (0.45) to protect a big flat presence floor from
        // being panelled away. That floor is now 0.09*base (was ~0.48*base
        // effective) specifically so it stops being the dominant term, and
        // this hull gets the same real KEY/FILL/RIM lighting the enemy fleet
        // does — so it gets the enemies' own full-strength value too: the
        // panel/greeble structure should show up on the one always-on term
        // that survives regardless of viewing angle, same as everywhere else
        // in the game.
        panelEmissive: 0.85,
        // Feeds the same _panelM field into a normal perturbation (see the
        // bump inject in _addFresnelRim) instead of only a flat pre-lit
        // albedo multiply, so the panel seams this hull's rig draws are
        // grooves the new KEY light can actually shade — not a print.
        // Held well under the hostiles' 1.8: this hull's panel cell is
        // PLAYER_HULL_PANEL_CELL (0.015 of hull length, ~3x finer than a
        // hostile's) and it is viewed from 10-30u, so the same relief that
        // reads as plating on a 40px hostile reads as boiling noise here.
        panelBump: 0.9
    });

    return { material: material, uniforms: uniforms };
}

// Small canvas-baked radial gradient (opaque white core fading to fully
// transparent at the edge) shared by every engine-bloom sprite. Previously
// SpriteMaterial had NO map, so three.js drew it as a flat, hard-edged,
// fully-opaque unit quad — with additive blending and opacity/scale ramping
// up under boost that read as two screen-filling orange/yellow BOXES
// stamped over the hull instead of a soft nozzle halo.
let _engineBloomTexture = null;
function _getEngineBloomTexture() {
    if (_engineBloomTexture) return _engineBloomTexture;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    gradient.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.32)');
    gradient.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    _engineBloomTexture = new THREE.CanvasTexture(canvas);
    _engineBloomTexture.needsUpdate = true;
    return _engineBloomTexture;
}

function _createEngineBloomSprite() {
    const spriteMaterial = new THREE.SpriteMaterial({
        map: _getEngineBloomTexture(),  // soft alpha falloff to 0 at the edge — no more hard-edged quad
        color: new THREE.Color(0x552200),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    // The hull material is opaque (transparent:false) so it always renders
    // in three.js's opaque pass BEFORE this additive/transparent sprite
    // regardless of renderOrder — renderOrder here only orders this sprite
    // against other transparent draws. Keep it below the hull's 100 so it
    // never wins a tie against another transparent effect drawn over the ship.
    sprite.renderOrder = 99;
    sprite.userData.isVelocityBloom = true;
    return sprite;
}

const _bloomIdleColor = new THREE.Color(0x552200);
const _bloomBoostColor = new THREE.Color(0xffaa33);
const _bloomLerpColor = new THREE.Color();

// Self-driving loop: waits for camera-system.js to populate
// cameraState.playerShipMesh, upgrades its hull materials + attaches
// engine-bloom sprites exactly once, then every frame drives the boost
// blend (rim color + bloom intensity) from gameState.velocityVector.
function _runPlayerHullUpgradeLoop() {
    requestAnimationFrame(_runPlayerHullUpgradeLoop);

    _sharedRimTime.value = performance.now() * 0.001;

    const mesh = window.cameraState && window.cameraState.playerShipMesh;
    if (!mesh || typeof THREE === 'undefined') return;

    if (!mesh.userData._hullUpgraded) {
        const hullUniforms = [];
        const bloomSprites = [];

        mesh.traverse((child) => {
            if (child.isMesh && child.material && child.material.blending !== THREE.AdditiveBlending) {
                if (child.material.dispose) child.material.dispose();
                const built = createPlayerHullMaterial();
                child.material = built.material;
                if (!child.renderOrder) child.renderOrder = 100;
                hullUniforms.push(built.uniforms);
            }
        });

        if (hullUniforms.length > 0) {
            [
                new THREE.Vector3(-0.024, 0, -0.14),
                new THREE.Vector3(0.024, 0, -0.14)
            ].forEach((pos) => {
                const sprite = _createEngineBloomSprite();
                sprite.position.copy(pos);
                mesh.add(sprite);
                bloomSprites.push(sprite);
            });

            mesh.userData._hullUpgraded = true;
            mesh.userData._hullMaterials = hullUniforms;
            mesh.userData._bloomSprites = bloomSprites;
            console.log(`✅ Player hull upgraded: ${hullUniforms.length} rim-lit material(s), ${bloomSprites.length} engine-bloom sprite(s)`);
        }
    }

    if (!mesh.userData._hullUpgraded) return;

    const speed = (window.gameState && window.gameState.velocityVector)
        ? window.gameState.velocityVector.length() : 0;
    const t = Math.max(0, Math.min(1, speed / PLAYER_BOOST_REFERENCE_SPEED));

    mesh.userData._hullMaterials.forEach((u) => { u.boostT.value = t; });

    _bloomLerpColor.copy(_bloomIdleColor).lerp(_bloomBoostColor, t);
    mesh.userData._bloomSprites.forEach((sprite) => {
        sprite.material.color.copy(_bloomLerpColor);
        sprite.material.opacity = t * 0.75;
        // Clamped well below the hull's own half-length (~0.14, see the
        // sprite placement above) so full boost halos the nozzle instead
        // of ballooning into a screen-filling blob (was 0.03->0.18, i.e.
        // bigger than half the ship itself, at full boost).
        const s = 0.012 + t * 0.045;
        sprite.scale.set(s, s, 1);
    });
}

if (typeof window !== 'undefined' && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(_runPlayerHullUpgradeLoop);
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export functions to window for global access
if (typeof window !== 'undefined') {
    console.log('📦 Exporting model functions to window...');
    window.modelCache = modelCache;
    window.loadAllModels = loadAllModels;
    window.getEnemyModel = getEnemyModel;
    window.getBossModel = getBossModel;
    window.getPlayerModel = getPlayerModel;
    window.areModelsLoaded = areModelsLoaded;
    window.getModelLoadingProgress = getModelLoadingProgress;
    window.createEnemyMeshWithModel = createEnemyMeshWithModel;
    window.createBossMeshWithModel = createBossMeshWithModel;
    window.attachPlayerModelToCamera = attachPlayerModelToCamera;
    window.createPlayerHullMaterial = createPlayerHullMaterial;
    window.createFactionHullMaterial = createFactionHullMaterial;
    console.log('✅ Model functions exported successfully');
}

// =============================================================================
// SCREEN-SPACE HULL PRESENCE FLOOR
// =============================================================================
// Root-cause note (critic, wave-5 gap): js/game-controls.js already gives
// the engine PLUME an angular-size floor — _PLUME_MIN_PX / _plumePxPerUnit,
// widening the plume in world space whenever its natural screen width drops
// under 7px, capped at _PLUME_MAX_WIDEN (3.4x). Nothing analogous existed
// for the HULL, so as range grows the FX grows and the ship's own geometry
// keeps shrinking underneath it — measured at 900u the plume+glow covered
// 4.95x the UFO's hull screen-area (86.9% of hull pixels overpainted) and
// 6.92x the Vulcan Patrol's. Every readability lever anyone reached for was
// an additive OVERLAY; past ~300u a contact reads as a fireball with a
// label, not a ship.
//
// This is the missing symmetric floor, applied to the HULL GEOMETRY itself
// (never the plume — that stays exactly as sized elsewhere) so contrast at
// range comes back from the ship, not from another glow layer stacked on
// top of it. Scoped to the two classes that still need it (installed below
// on the UFO hull group and, in createEnemyMeshWithModel, on Vulcan
// Patrol/regionId 8 only) — every other class already clears the
// luminance bar without this, and inflating a hull that already reads fine
// would just blur it against its formation-mates for no readability gain.
//
// MECHANISM. A THREE.Group has no geometry/material of its own, so the
// renderer never calls onBeforeRender on a group directly — only on the
// renderable (Mesh) objects under it. Attaching the callback to every mesh
// inside `group` and having it drive `group.scale` gets a genuine per-frame,
// per-camera hook with ZERO extra work in the game's own update loop and
// zero touches to game-controls.js: it fires exactly when and however the
// scene is actually rendered (same rig the critic's own paused-world
// readback uses — a paused game still calls renderer.render() every frame).
//
// `renderer.info.render.frame` (an integer WebGLRenderer already bumps once
// per render() call) dedupes so a group with several mesh children only
// recomputes its scale once per real frame, not once per mesh.
//
// MEASURING APPARENT SIZE CORRECTLY — WHY NOT JUST "LENGTH x px-per-unit".
// A single world-space length (hull max dimension, or _plumeHullLen the way
// game-controls.js's own plume floor reads it) times a distance-only scalar
// is what the plume floor uses, and it is a fair approximation FOR THE
// PLUME because a billboard quad always faces the camera — it has no
// foreshortening to get wrong. A HULL does. Measured live: the Vulcan
// Patrol's true nose-to-tail world length projects to ~98px by that scalar
// math at 900u, but the critic's actual 3/4-attitude screen capture at the
// same range measured 35x14px — the ship's long axis was pointed enough
// toward the camera that its on-screen footprint was far smaller than its
// world length would suggest. A scalar floor keyed on world length would
// have stayed dormant in exactly the case it exists to catch.
//
// So this floor projects the hull's actual bounding-box CORNERS through the
// live camera each frame (Vector3.project) and measures the resulting 2-D
// screen bbox — foreshortening included, whichever attitude the ship is
// actually in — instead of inferring apparent size from world-space length
// and distance alone.
//
// The 8 corners are captured ONCE at install time, in `group.parent`'s
// local space (not the group's own) — every frame just re-transforms them
// through `group.parent.matrixWorld`. That sidesteps a chicken-and-egg
// problem: the corners have to represent the hull at boost=1 (baseScale),
// but `group.scale` is exactly what this function drives every frame, so
// measuring "the group's current world box" each frame would measure its
// own last-applied boost, not the true baseline, and the floor would never
// settle. Parent-relative corners captured before any boost is ever applied
// stay a fixed boost=1 baseline forever; only `group.scale` changes.
//
// The 60px target matches _PLUME_MIN_PX's own units (vertical FOV against
// the DRAWING BUFFER height, i.e. render-pixels, not CSS px) so it's read
// on the same ruler as the plume floor it's meant to counterbalance.
//
// Reparenting into `group` (see both call sites below) preserves each
// child's LOCAL transform (Object3D.add doesn't touch it), so wrapping is a
// pure "insert one more identity-transform node" op with no position/
// rotation/hitbox side effect — same pattern the UFO's static SCALE
// CORRECTION group already used one section down, just made distance- and
// attitude-aware.
function _installHullScreenFloor(group, minPx, maxBoost) {
    if (!group || !group.parent || typeof THREE === 'undefined') return;
    minPx = minPx !== undefined ? minPx : 60;
    maxBoost = maxBoost !== undefined ? maxBoost : 2.5;

    const baseScale = group.scale.x || 1;
    const parent = group.parent;
    let localCorners = null;
    try {
        parent.updateWorldMatrix(true, false);
        group.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(group);
        if (box.isEmpty()) return;
        const invParent = new THREE.Matrix4().copy(parent.matrixWorld).invert();
        localCorners = [];
        for (let i = 0; i < 8; i++) {
            const c = new THREE.Vector3(
                (i & 1) ? box.max.x : box.min.x,
                (i & 2) ? box.max.y : box.min.y,
                (i & 4) ? box.max.z : box.min.z
            );
            c.applyMatrix4(invParent); // -> parent-local, boost=1 baseline
            localCorners.push(c);
        }
    } catch (e) {
        return; // no measurable geometry yet — leave the group untouched
    }
    if (!localCorners) return;

    const _tmp = new THREE.Vector3();

    const applyFloor = function (renderer, scene, camera) {
        if (!renderer || !camera || !camera.isPerspectiveCamera) return;
        const frame = (renderer.info && renderer.info.render) ? renderer.info.render.frame : null;
        if (frame !== null) {
            if (group.userData._hullFloorFrame === frame) return;
            group.userData._hullFloorFrame = frame;
        }
        if (!group.parent) return; // detached (destroyed) since install

        let w = renderer.domElement ? (renderer.domElement.width || renderer.domElement.clientWidth) : 0;
        let h = renderer.domElement ? (renderer.domElement.height || renderer.domElement.clientHeight) : 0;
        if (!w || !h) return;

        group.parent.updateWorldMatrix(true, false);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let anyBehindCamera = false;
        for (let i = 0; i < localCorners.length; i++) {
            _tmp.copy(localCorners[i]).applyMatrix4(group.parent.matrixWorld);
            const camDist = _tmp.distanceTo(camera.position);
            _tmp.project(camera); // -> NDC [-1, 1], z<-1 behind camera near plane
            if (_tmp.z < -1 || _tmp.z > 1 || camDist <= 0) { anyBehindCamera = true; continue; }
            const sx = (_tmp.x * 0.5 + 0.5) * w;
            const sy = (1 - (_tmp.y * 0.5 + 0.5)) * h;
            if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
            if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
        }
        // If some corners project behind/outside the camera's near plane
        // (extreme close range — the camera is effectively inside the
        // hull), leave the floor alone: a partially-off-screen box is not
        // a "too small" reading, and boosting off an unreliable partial
        // bbox risks a runaway zoom right when the ship is already huge.
        if (anyBehindCamera || !isFinite(minX) || !isFinite(maxX)) {
            group.scale.setScalar(baseScale);
            return;
        }

        const rawPx = Math.max(maxX - minX, maxY - minY);
        let boost = 1;
        if (rawPx > 0 && rawPx < minPx) {
            boost = Math.min(maxBoost, minPx / rawPx);
        }
        group.scale.setScalar(baseScale * boost);
        group.updateMatrixWorld(true); // land the new scale before the
        // renderer reads THIS mesh's matrixWorld a moment later in the
        // same renderObject() call — updateMatrixWorld(true) also
        // refreshes every sibling mesh under `group`, so later mesh
        // children hit the frame-dedupe above with an already-correct
        // matrixWorld this frame.
    };

    group.traverse((child) => {
        if (child.isMesh) child.onBeforeRender = applyFloor;
    });
}

// =============================================================================
// UFO ("Unknown Craft") HULL PRESENCE FLOOR
// =============================================================================
// createUFOEnemy (game-objects.js) never went through createFactionHullMaterial
// — it builds its own inline material instead, and both of its branches carry
// no guaranteed emissive floor:
//   • the GLB-cached branch just nudges metalness/roughness/envMapIntensity
//     on whatever the model shipped with, plus a weak 0.5-intensity emissive
//     that only reads bright when the hull happens to reflect something
//     bright nearby — nothing guarantees that in open space.
//   • the createProceduralUFO() fallback saucer is a near-black albedo
//     (#3a2a2a) with a 0.6-intensity emissive that's itself near-black
//     (#220808) — the single largest surface on the model carries almost no
//     floor at all.
// Measured: 68/295 ships (23% of the roster) at median hull luminance 22.6
// overall, 4.6 at 900u, 79.4% of hull pixels darker than the empty-space
// background (13.8).
//
// game-models.js loads BEFORE game-objects.js (see index.html), so
// createUFOEnemy doesn't exist yet when this file's top-level code runs —
// the fix has to be a post-construction wrap, installed once
// game-objects.js has actually defined the function. DOMContentLoaded fires
// only after every synchronous <script> tag (this whole chain) has run, so
// by the time it fires window.createUFOEnemy is guaranteed to be the real
// function, not a stub.
//
// Only MeshStandardMaterial, fully-opaque children are re-keyed — that
// targets exactly the two dark hull surfaces above (the GLB hull mesh and
// the procedural saucer) while leaving every additive MeshBasicMaterial
// accent (aura shell, abduction-beam ring, rim lights) and the translucent
// StandardMaterial cockpit dome (already opacity 0.75 + emissiveIntensity
// 0.8 — plenty bright, and createFactionHullMaterial forces opaque
// FrontSide, which would flatten its glassy canopy look) untouched.
//
// Colour is a cold alien green (0x39ffa0), not another warm red/orange —
// every other hostile faction in the roster (Martian Pirates, Vulcans,
// Romulans, Klingons, ...) already sits in that same hot family, so a
// distinct hue is what keeps "Unknown Craft" reading as its own class once
// it's actually bright enough to read at all.
const UFO_HULL_COLOR = 0x39ffa0;

// =============================================================================
// UFO ADDITIVE ACCENT SUBORDINATION (aura shell / abduction-beam ring)
// =============================================================================
// createProceduralUFO (game-objects.js, not this file — the fix has to land
// here, post-construction, same reason the hull-presence floor above does)
// builds the saucer's "glow" out of two additive MeshBasicMaterial layers
// that are each SIZED OFF THE HULL BY CONSTRUCTION, not off any FX-area
// budget:
//   • the aura shell — CylinderGeometry(46, 58, 14) at opacity 0.35 — has a
//     LARGER radius than the saucer it wraps (CylinderGeometry(40, 50, 12)),
//     so its silhouette is strictly bigger than the hull's own at every
//     range and angle.
//   • the abduction-beam ring — RingGeometry(15, 45) at opacity 0.7 — sits
//     right under the saucer at almost the same radius.
// Measured (critic, this round), same-frame GPU readback, paused world,
// subject isolated, 4 yaws: the shell alone reads 1.08x the hull's own lit
// pixels at 300u and 0.98x at 900u; the ring another 0.35-0.38x at both
// ranges. Both ratios are essentially RANGE-INDEPENDENT, which is the
// tell that this is not a distance/floor problem the way the hull-readout
// lamp's is (see _HULL_LAMP_FAR_DAMP_LO in game-controls.js) — it is a
// STATIC one, because the shell and ring are concentric with the saucer and
// share its origin, so their screen-space size ratio to the hull is fixed
// by their world-space size ratio alone, at any camera distance. A single
// static scale-down therefore fixes both the 300u and the 900u case at
// once; no per-frame distance term is needed here.
//
// Fix is geometric, not opacity: shrink each mesh's own LOCAL scale about
// its shared origin (same technique as _PLUME_CORE_NEAR in game-controls.js
// — "read as a surface feature, not a billboard" means the geometry itself
// gets smaller, not just dimmer) so each becomes a minor accent instead of
// the dominant silhouette. First pass at 0.5/0.75 (area factors 0.25/0.56)
// landed shell/ring at ~0.20-0.26x hull, under the <=0.3x/<=0.25x budget on
// every yaw but one (300u dead-ahead, where the union of shell+ring+rig+rim
// still covered 51.6% of the hull's own pixels — just over the <50%
// coverage bar). Tightened once more to 0.45/0.65 (area factors 0.20/0.42):
// measured after, same protocol, 4 yaws x {300u, 900u}: shell 0.18-0.21x
// hull, ring 0.15-0.16x hull, combined FX/hull ratio 0.47-0.61 (bar <=1.0)
// and FX-cover 37.9-45.1% (bar <50%) at every sampled pose. The shell ends
// up smaller than the saucer it used to wrap (radii ~18/23 vs the saucer's
// 40/50) and mostly sits behind the opaque hull's own depth — that is the
// intended trade: the mint UFO_HULL_COLOR hull surface above is what
// carries "Unknown Craft"'s distinct silhouette and faction hue now, not a
// fireball glued to the outside of it.
const _UFO_SHELL_SCALE_K = 0.45;
const _UFO_RING_SCALE_K = 0.65;

function _subordinateUFOAdditiveAccents(ufo) {
    if (!ufo || typeof THREE === 'undefined') return;
    ufo.traverse((child) => {
        if (!child.isMesh || !child.geometry || !child.material) return;
        if (child.userData && (child.userData.isHitbox || child.userData._isHullRead)) return;
        const mat = child.material;
        if (!mat.transparent || mat.blending !== THREE.AdditiveBlending) return;
        const gt = child.geometry.type;
        if (gt === 'CylinderGeometry') child.scale.multiplyScalar(_UFO_SHELL_SCALE_K);
        else if (gt === 'RingGeometry') child.scale.multiplyScalar(_UFO_RING_SCALE_K);
    });
}

function _applyUFOHullPresenceFloor(ufo) {
    if (!ufo) return ufo;
    _subordinateUFOAdditiveAccents(ufo);
    ufo.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mat = child.material;
        if (!mat.isMeshStandardMaterial || mat.transparent === true) return;
        // models/UFO.glb's hull mesh ships with NO normal attribute at all
        // (verified live: geometry.attributes.normal is undefined even on
        // a fresh GLTFLoader parse) — every other enemy/boss GLB in the
        // roster carries real normals, so nothing else in this file ever
        // needed to guard for this. Without normals, MeshStandardMaterial
        // has no surface direction to light against: measured, even the
        // hull's completely untouched, un-re-keyed, out-of-the-box
        // material rendered flat black at every sampled pixel — this was
        // never actually a material-tuning problem for this one class, it
        // was a missing-attribute one that no floor/rim treatment could
        // paper over. computeVertexNormals() synthesizes faceted normals
        // from the triangle winding so the lighting/fresnel/hullForm math
        // below has something real to read.
        if (child.geometry && !child.geometry.attributes.normal) {
            child.geometry.computeVertexNormals();
        }
        const oldMap = mat.map || null;
        // TUNING HISTORY (kept short): every earlier pass here was a search
        // over how much FLOOR this hull needed — 0.30/0.64, then 0.52/0.58 —
        // and each one bought its median luminance with the same
        // direction-INDEPENDENT term, ending at a worst-of-8-yaw p5->p95
        // spread of 25.7 levels around a median of 239.6: a flat near-white
        // plate with the mint hue cooked out of it. The floor is no longer a
        // dial to search over (see _HULL_EMISSIVE_FLOOR), so this call now
        // takes the roster's one spec and keeps only what is genuinely
        // SPECIFIC to this hull.
        const newMat = createFactionHullMaterial(UFO_HULL_COLOR, Object.assign({}, _HULL_EMISSIVE_FLOOR, {
            // Saucer-specific form ramp: a flying disc has an enormous
            // belly-to-spine value range and almost no side, so its top-lit
            // ramp is much taller than a fighter's (0.66/1.72 default) —
            // this is the term that makes a saucer read as curved rather
            // than as a coloured ellipse.
            formFloor: 0.45,
            formTop: 2.10,
            rimIntensity: 0.78,
            roughness: 0.4,
            metalness: 0.35,
            panelCellSize: _hullPanelCellSize(child.geometry),
            hullForm: true
        }));
        if (oldMap) newMat.map = oldMap;
        child.material = newMat;
    });

    // SCALE CORRECTION. createUFOEnemy's GLB branch bakes a flat
    // scale.set(3,3,3) that assumed a much smaller source asset than the
    // models/UFO.glb actually on disk now — measured raw (unscaled) at
    // 424x108x424, so x3 lands at ~1273 units across: roughly 7x every
    // other enemy class's hull. That is big enough that this piece's own
    // 900u measurement distance puts the camera INSIDE the hull's
    // bounding sphere (half-diagonal ~908 > 900), so the readback saw the
    // model's interior/backfaces, not its lit exterior — no material floor
    // fixes that, because the camera isn't looking at the outside surface
    // at all. The author's own intended size is recoverable from the
    // hitbox createUFOEnemy sizes right after this call (95 world-unit
    // radius, i.e. ~190 across, independent of whatever scale the hull
    // carries) — rescale the HULL content to match that same target,
    // leaving the hitbox (already scale-independent by construction)
    // untouched. Reparenting via Object3D.add() preserves each child's
    // LOCAL transform while moving it under the new corrective group, so
    // this is a pure size fix with no position/rotation side effect.
    const TARGET_MAX_DIM = 190;
    const hullChildren = ufo.children.filter((c) => !(c.userData && c.userData.isHitbox));
    if (hullChildren.length) {
        const hullBox = new THREE.Box3();
        hullChildren.forEach((c) => hullBox.expandByObject(c));
        const hullSize = hullBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(hullSize.x, hullSize.y, hullSize.z);
        const needsResize = (maxDim > TARGET_MAX_DIM * 1.15 || maxDim < TARGET_MAX_DIM * 0.4);
        const correction = needsResize ? (TARGET_MAX_DIM / Math.max(1, maxDim)) : 1.0;
        // Always wrap, even when no static resize is needed: the range
        // floor below (_installHullScreenFloor) needs a group of its own
        // to drive — one that holds only hull content, never the hitbox
        // (which the caller in game-objects.js adds directly to `ufo`
        // AFTER this function returns, so it stays a sibling of this
        // group and is never touched by the scale this group carries).
        const hullGroup = new THREE.Group();
        hullChildren.forEach((c) => hullGroup.add(c));
        hullGroup.scale.setScalar(correction);
        ufo.add(hullGroup);

        // RANGE FLOOR. Measured (critic, wave-5): at 900u the UFO hull's
        // own screen footprint is 78x29px while the plume+glow FX around
        // it covers 4.95x that area — 86.9% of hull pixels overpainted.
        // 60px/2.5x mirrors the fix note's own numbers (same order as the
        // Vulcan Patrol floor below) so a distant "Unknown Craft" grows
        // back into a readable saucer instead of staying a fireball with
        // a text label.
        _installHullScreenFloor(hullGroup, 60, 2.5);
    }

    return ufo;
}

function _installUFOHullPresenceFix() {
    if (typeof window.createUFOEnemy !== 'function' || window.createUFOEnemy.__hullFloorPatched) {
        return false;
    }
    const _originalCreateUFOEnemy = window.createUFOEnemy;
    const _patchedCreateUFOEnemy = function () {
        const ufo = _originalCreateUFOEnemy.apply(this, arguments);
        return _applyUFOHullPresenceFloor(ufo);
    };
    _patchedCreateUFOEnemy.__hullFloorPatched = true;
    window.createUFOEnemy = _patchedCreateUFOEnemy;
    console.log('✅ UFO hull presence floor installed (createUFOEnemy patched)');
    return true;
}

// Poll rather than hook a single lifecycle event: this game's "restart"
// flow (observed live — calling startGame() again re-drives the whole
// boot sequence) does not reliably produce a fresh 'loading' readyState /
// DOMContentLoaded firing that this file's own top-level execution is
// still ahead of, so a one-shot readyState check was measured to land in
// its "already past loading" branch and silently never install the patch
// (window.createUFOEnemy did not exist yet at that instant either way).
// Polling for the real function to appear is robust to all of that: it
// costs nothing once installed (self-clearing) and nothing meaningful
// while waiting (a few hundred ms of an empty typeof check).
if (typeof window !== 'undefined') {
    let _ufoFixAttempts = 0;
    const _ufoFixPoll = setInterval(() => {
        _ufoFixAttempts++;
        if (_installUFOHullPresenceFix() || _ufoFixAttempts > 150) {
            clearInterval(_ufoFixPoll);
        }
    }, 200);
}

if (typeof window !== 'undefined') {
    window.applyUFOHullPresenceFloor = _applyUFOHullPresenceFloor;
}

console.log('✅ Game models system loaded and ready');

// =============================================================================
// CIVILIAN SHIP REGISTRY - Categories, models, and spawning behavior
// =============================================================================

const civilianShipRegistry = {
    // Ship category definitions
    categories: {
        freighter: {
            name: 'Freighter',
            modelFile: 'Freighter.glb',
            scale: 2.0,
            description: 'Heavy cargo hauler',
            spawnLocations: ['nebula', 'trade_route', 'station'],
            speed: { min: 0.3, max: 0.6 },
            colors: [0x888899, 0x667788, 0x998877]
        },
        tanker: {
            name: 'Tanker',
            modelFile: 'Tanker.glb',
            scale: 2.0,
            description: 'Fuel and gas transport',
            spawnLocations: ['star', 'refinery', 'gas_giant', 'nebula'],
            speed: { min: 0.2, max: 0.4 },
            colors: [0xcc6633, 0xdd8844, 0xbb5522]
        },
        passenger: {
            name: 'Passenger Liner',
            modelFile: 'Passenger.glb',
            modelVariants: ['Passenger.glb', 'Passenger2.glb', 'Passenger3.glb'],
            scale: 1.8,
            description: 'Luxury cruise vessel',
            spawnLocations: ['planet', 'station', 'scenic', 'nebula'],
            speed: { min: 0.4, max: 0.7 },
            colors: [0xffffff, 0xeeeeff, 0xffffee]
        },
        mining: {
            name: 'Mining Vessel',
            modelFile: 'Mining.glb',
            scale: 2.0,
            description: 'Asteroid mining ship',
            spawnLocations: ['asteroid_belt', 'asteroid', 'dwarf_planet'],
            speed: { min: 0.2, max: 0.5 },
            colors: [0xaaaa55, 0x999944, 0x888833]
        },
        science: {
            name: 'Research Vessel',
            modelFile: 'SpaceProbe.glb',
            scale: 1.5,
            description: 'Scientific research ship',
            spawnLocations: ['anomaly', 'nebula', 'pulsar', 'black_hole', 'cosmic_feature'],
            speed: { min: 0.3, max: 0.6 },
            colors: [0x4488ff, 0x3377ee, 0x5599ff]
        },
        shuttle: {
            name: 'Shuttle',
            modelFile: 'Shuttle.glb',
            scale: 1.2,
            description: 'Small transport craft',
            spawnLocations: ['anywhere', 'planet', 'station'],
            speed: { min: 0.5, max: 1.0 },
            colors: [0xcccccc, 0xbbbbbb, 0xdddddd]
        },
        rescue: {
            name: 'Rescue Ship',
            modelFile: 'Rescue.glb',
            scale: 1.8,
            description: 'Emergency response vessel',
            spawnLocations: ['distress', 'debris', 'wreck'],
            speed: { min: 0.8, max: 1.2 },
            colors: [0xff4444, 0xff6666, 0xee3333]
        },
        military: {
            name: 'Patrol Cruiser',
            modelFile: 'Military.glb',
            scale: 1.6,
            description: 'Armed escort vessel',
            spawnLocations: ['trade_route', 'border', 'station'],
            speed: { min: 0.6, max: 1.0 },
            colors: [0x336633, 0x445544, 0x224422]
        },
        satellite: {
            name: 'Satellite',
            modelFile: 'Satellite.glb',
            modelVariants: ['Satellite.glb', 'Satellite2.glb'],
            scale: 1.0,
            description: 'Orbital communications satellite',
            spawnLocations: ['planet', 'station', 'inhabited', 'cosmic_feature'],
            speed: { min: 0.1, max: 0.2 },
            isStationary: true,
            colors: [0xcccccc, 0xaaaaaa, 0xdddddd]
        },
        spaceprobe: {
            name: 'Space Probe',
            modelFile: 'SpaceProbe.glb',
            scale: 1.2,
            description: 'Deep space research probe',
            spawnLocations: ['cosmic_feature', 'anomaly', 'deep_space', 'exotic'],
            speed: { min: 0.05, max: 0.15 },
            isStationary: true,
            colors: [0x888888, 0x999999, 0x777777]
        }
    },
    
    // Model cache for civilian ships
    modelCache: {},
    modelsLoaded: false,
    
    // Load all civilian ship models (including variants)
    loadAllModels: async function() {
        console.log('🚢 Loading civilian ship models...');
        
        const categories = Object.keys(this.categories);
        let loaded = 0;
        let failed = 0;
        
        for (const catKey of categories) {
            const category = this.categories[catKey];
            
            // Load main model
            const mainPath = `models/${category.modelFile}`;
            try {
                const model = await this.loadModel(mainPath);
                if (model) {
                    this.modelCache[catKey] = model;
                    loaded++;
                    console.log(`  ✅ Loaded ${category.name} (${category.modelFile})`);
                } else {
                    failed++;
                    console.log(`  ⚠️ No model found for ${category.name}, will use procedural`);
                }
            } catch (err) {
                failed++;
                console.log(`  ⚠️ Failed to load ${category.name}: ${err.message}`);
            }
            
            // Load variants if they exist
            if (category.modelVariants && category.modelVariants.length > 1) {
                if (!this.modelCache[catKey + '_variants']) {
                    this.modelCache[catKey + '_variants'] = [];
                }
                
                for (let i = 0; i < category.modelVariants.length; i++) {
                    const variantPath = `models/${category.modelVariants[i]}`;
                    try {
                        const variantModel = await this.loadModel(variantPath);
                        if (variantModel) {
                            this.modelCache[catKey + '_variants'].push(variantModel);
                            console.log(`    ✅ Loaded variant: ${category.modelVariants[i]}`);
                        }
                    } catch (err) {
                        console.log(`    ⚠️ Failed to load variant: ${category.modelVariants[i]}`);
                    }
                }
            }
        }
        
        this.modelsLoaded = true;
        console.log(`🚢 Civilian ships: ${loaded} models loaded, ${failed} using procedural fallback`);
    },
    
    // Load a single model
    loadModel: function(path) {
        return new Promise((resolve, reject) => {
            if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
                resolve(null);
                return;
            }
            
            const loader = new THREE.GLTFLoader();
            loader.load(
                path,
                (gltf) => {
                    resolve(gltf.scene.clone());
                },
                undefined,
                (error) => {
                    resolve(null); // Resolve with null instead of rejecting
                }
            );
        });
    },
    
    // Get a ship model (or create procedural fallback)
    // useVariant: if true and variants exist, pick a random variant
    getShipMesh: function(categoryKey, customColor = null, useVariant = true) {
        const category = this.categories[categoryKey];
        if (!category) {
            console.warn(`Unknown ship category: ${categoryKey}`);
            return this.createProceduralShip('shuttle', customColor);
        }
        
        // Try to use cached model (with variants if available)
        let model = null;
        const variants = this.modelCache[categoryKey + '_variants'];
        
        if (useVariant && variants && variants.length > 0) {
            // Pick random variant
            const variantIndex = Math.floor(Math.random() * variants.length);
            model = variants[variantIndex].clone();
        } else if (this.modelCache[categoryKey]) {
            model = this.modelCache[categoryKey].clone();
        }
        
        if (model) {
            // Normalize model size using bounding box - target ~20 units
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDimension = Math.max(size.x, size.y, size.z);
            const targetSize = 20; // All ships normalized to ~20 units
            
            if (maxDimension > 0) {
                const normalizeScale = targetSize / maxDimension;
                model.scale.multiplyScalar(normalizeScale * category.scale);
                console.log(`  🚢 ${categoryKey}: normalized from ${maxDimension.toFixed(1)} to ${(targetSize * category.scale).toFixed(1)} units`);
            }
            
            // Apply visible materials - ships need to glow in dark space
            model.traverse((child) => {
                if (child.isMesh) {
                    // Replace material with bright, visible version
                    const oldColor = child.material && child.material.color ? child.material.color.getHex() : 0x888899;
                    child.material = new THREE.MeshStandardMaterial({
                        color: oldColor,
                        metalness: 0.5,
                        roughness: 0.4,
                        emissive: oldColor,
                        emissiveIntensity: 1.0
                    });
                }
            });
            
            // No point lights - using emissive materials instead
            return model;
        }
        
        // Fallback to procedural
        return this.createProceduralShip(categoryKey, customColor);
    },
    
    // Create procedural ship geometry (fallback when no GLB)
    createProceduralShip: function(categoryKey, customColor = null) {
        const category = this.categories[categoryKey] || this.categories.shuttle;
        const shipGroup = new THREE.Group();
        
        // Pick a color
        const color = customColor || category.colors[Math.floor(Math.random() * category.colors.length)];
        
        // Different procedural shapes based on category
        switch(categoryKey) {
            case 'freighter':
                this.buildFreighterGeometry(shipGroup, color);
                break;
            case 'tanker':
                this.buildTankerGeometry(shipGroup, color);
                break;
            case 'passenger':
                this.buildPassengerGeometry(shipGroup, color);
                break;
            case 'mining':
                this.buildMiningGeometry(shipGroup, color);
                break;
            case 'science':
                this.buildScienceGeometry(shipGroup, color);
                break;
            case 'rescue':
                this.buildRescueGeometry(shipGroup, color);
                break;
            case 'military':
                this.buildMilitaryGeometry(shipGroup, color);
                break;
            default:
                this.buildShuttleGeometry(shipGroup, color);
        }
        
        // Add engine glow to all ships
        this.addEngineGlow(shipGroup, categoryKey);
        
        // Make all procedural ships visible in dark space
        shipGroup.traverse((child) => {
            if (child.isMesh && child.material && child.material.isMeshStandardMaterial) {
                const col = child.material.color ? child.material.color.getHex() : 0x888899;
                child.material.emissive = new THREE.Color(col);
                child.material.emissiveIntensity = 2.0; // Strong glow
            }
        });
        
        // No point lights - using emissive materials instead
        return shipGroup;
    },
    
    // Procedural geometry builders
    buildFreighterGeometry: function(group, color) {
        // Main hull - long box
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(40, 15, 80),
            new THREE.MeshStandardMaterial({ color: color, metalness: 0.6, roughness: 0.4 })
        );
        group.add(hull);
        
        // Cargo containers on top
        const containerColors = [0x4488cc, 0xcc8844, 0x44cc88, 0xcc4488];
        for (let i = 0; i < 3; i++) {
            const container = new THREE.Mesh(
                new THREE.BoxGeometry(30, 20, 22),
                new THREE.MeshStandardMaterial({ 
                    color: containerColors[i % containerColors.length], 
                    metalness: 0.3, roughness: 0.6 
                })
            );
            container.position.set(0, 17, -25 + i * 25);
            group.add(container);
        }
    },
    
    buildTankerGeometry: function(group, color) {
        // Cylindrical tank body
        const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(20, 20, 90, 12),
            new THREE.MeshStandardMaterial({ color: color, metalness: 0.7, roughness: 0.3 })
        );
        tank.rotation.x = Math.PI / 2;
        group.add(tank);
        
        // End caps
        const capMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
        const frontCap = new THREE.Mesh(new THREE.SphereGeometry(20, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
        frontCap.rotation.x = -Math.PI / 2;
        frontCap.position.z = -45;
        group.add(frontCap);
        
        const rearCap = new THREE.Mesh(new THREE.SphereGeometry(20, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
        rearCap.rotation.x = Math.PI / 2;
        rearCap.position.z = 45;
        group.add(rearCap);
    },
    
    buildPassengerGeometry: function(group, color) {
        // Sleek elongated hull
        const hull = new THREE.Mesh(
            new THREE.CapsuleGeometry(15, 70, 8, 16),
            new THREE.MeshStandardMaterial({ color: color, metalness: 0.8, roughness: 0.2 })
        );
        hull.rotation.x = Math.PI / 2;
        group.add(hull);
        
        // Window strip
        const windows = new THREE.Mesh(
            new THREE.BoxGeometry(32, 5, 50),
            new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.7 })
        );
        windows.position.y = 5;
        group.add(windows);
        
        // Fins
        const finMat = new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.7, roughness: 0.3 });
        const finGeom = new THREE.BoxGeometry(2, 20, 30);
        const leftFin = new THREE.Mesh(finGeom, finMat);
        leftFin.position.set(-16, 5, 20);
        group.add(leftFin);
        const rightFin = new THREE.Mesh(finGeom, finMat);
        rightFin.position.set(16, 5, 20);
        group.add(rightFin);
    },
    
    buildMiningGeometry: function(group, color) {
        // Chunky industrial hull
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(35, 25, 50),
            new THREE.MeshStandardMaterial({ color: color, metalness: 0.5, roughness: 0.6 })
        );
        group.add(hull);
        
        // Mining arm/drill
        const arm = new THREE.Mesh(
            new THREE.CylinderGeometry(3, 6, 40, 8),
            new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.8, roughness: 0.3 })
        );
        arm.rotation.x = Math.PI / 2;
        arm.position.set(0, -5, -45);
        group.add(arm);
        
        // Ore containers
        for (let i = 0; i < 2; i++) {
            const ore = new THREE.Mesh(
                new THREE.BoxGeometry(12, 15, 20),
                new THREE.MeshStandardMaterial({ color: 0x553311, metalness: 0.3, roughness: 0.8 })
            );
            ore.position.set(i === 0 ? -15 : 15, 0, 20);
            group.add(ore);
        }
    },
    
    buildScienceGeometry: function(group, color) {
        // Saucer-like main section
        const saucer = new THREE.Mesh(
            new THREE.CylinderGeometry(30, 25, 10, 16),
            new THREE.MeshStandardMaterial({ color: color, metalness: 0.7, roughness: 0.3 })
        );
        group.add(saucer);
        
        // Sensor dome on top
        const dome = new THREE.Mesh(
            new THREE.SphereGeometry(12, 12, 8),
            new THREE.MeshStandardMaterial({ color: 0xaaddff, metalness: 0.9, roughness: 0.1 })
        );
        dome.position.y = 10;
        group.add(dome);
        
        // Sensor array
        const array = new THREE.Mesh(
            new THREE.ConeGeometry(5, 25, 8),
            new THREE.MeshStandardMaterial({ color: 0x444466, metalness: 0.8, roughness: 0.2 })
        );
        array.position.set(0, -5, -30);
        array.rotation.x = Math.PI / 2;
        group.add(array);
    },
    
    buildShuttleGeometry: function(group, color) {
        // Small, simple craft
        const body = new THREE.Mesh(
            new THREE.ConeGeometry(10, 40, 8),
            new THREE.MeshStandardMaterial({ color: color, metalness: 0.6, roughness: 0.4 })
        );
        body.rotation.x = Math.PI / 2;
        group.add(body);
        
        // Small wings
        const wingMat = new THREE.MeshStandardMaterial({ color: 0x666677, metalness: 0.7, roughness: 0.3 });
        const wingGeom = new THREE.BoxGeometry(25, 2, 15);
        const wings = new THREE.Mesh(wingGeom, wingMat);
        wings.position.z = 10;
        group.add(wings);
    },
    
    buildRescueGeometry: function(group, color) {
        // Compact, fast-looking hull
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(25, 15, 45),
            new THREE.MeshStandardMaterial({ color: color, metalness: 0.6, roughness: 0.4 })
        );
        group.add(hull);
        
        // Emergency lights (bright)
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        for (let i = 0; i < 3; i++) {
            const light = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), lightMat);
            light.position.set(0, 10, -15 + i * 15);
            group.add(light);
        }
        
        // Red cross marking
        const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 15), crossMat);
        crossV.position.set(0, 8, 0);
        group.add(crossV);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 4), crossMat);
        crossH.position.set(0, 8, 0);
        group.add(crossH);
    },
    
    buildMilitaryGeometry: function(group, color) {
        // Angular, aggressive hull
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(30, 12, 60),
            new THREE.MeshStandardMaterial({ color: color, metalness: 0.7, roughness: 0.4 })
        );
        group.add(hull);
        
        // Bridge/tower
        const bridge = new THREE.Mesh(
            new THREE.BoxGeometry(15, 10, 20),
            new THREE.MeshStandardMaterial({ color: 0x334433, metalness: 0.6, roughness: 0.5 })
        );
        bridge.position.set(0, 11, -10);
        group.add(bridge);
        
        // Weapon turrets
        const turretMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 });
        for (let i = 0; i < 2; i++) {
            const turret = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 6, 8), turretMat);
            turret.position.set(i === 0 ? -12 : 12, 8, 15);
            group.add(turret);
            
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 15, 6), turretMat);
            barrel.rotation.x = Math.PI / 2;
            barrel.position.set(i === 0 ? -12 : 12, 8, 5);
            group.add(barrel);
        }
    },
    
    // Add engine glow to ship
    addEngineGlow: function(group, categoryKey) {
        const category = this.categories[categoryKey] || this.categories.shuttle;
        const engineColor = 0x00aaff;
        const engineMat = new THREE.MeshBasicMaterial({
            color: engineColor,
            transparent: true,
            opacity: 0.8
        });
        
        // Engine count and size varies by ship type
        let engineCount = 2;
        let engineSize = 6;
        let engineSpacing = 12;
        let engineZ = 40;
        
        switch(categoryKey) {
            case 'freighter': engineCount = 2; engineSize = 10; engineSpacing = 15; engineZ = 45; break;
            case 'tanker': engineCount = 3; engineSize = 8; engineSpacing = 12; engineZ = 50; break;
            case 'passenger': engineCount = 4; engineSize = 6; engineSpacing = 10; engineZ = 45; break;
            case 'mining': engineCount = 2; engineSize = 8; engineSpacing = 14; engineZ = 30; break;
            case 'science': engineCount = 2; engineSize = 5; engineSpacing = 15; engineZ = 20; break;
            case 'rescue': engineCount = 3; engineSize = 5; engineSpacing = 8; engineZ = 25; break;
            case 'military': engineCount = 4; engineSize = 5; engineSpacing = 8; engineZ = 35; break;
            default: engineCount = 1; engineSize = 5; engineZ = 20; break;
        }
        
        const startX = -(engineCount - 1) * engineSpacing / 2;
        for (let i = 0; i < engineCount; i++) {
            const engine = new THREE.Mesh(
                new THREE.SphereGeometry(engineSize, 8, 8),
                engineMat
            );
            engine.position.set(startX + i * engineSpacing, 0, engineZ);
            group.add(engine);
        }
    },
    
    // Get random ship for a location type
    getRandomShipForLocation: function(locationType) {
        const validCategories = [];
        
        for (const [key, category] of Object.entries(this.categories)) {
            if (category.spawnLocations.includes(locationType) || 
                category.spawnLocations.includes('anywhere')) {
                validCategories.push(key);
            }
        }
        
        if (validCategories.length === 0) {
            return 'shuttle'; // Default fallback
        }
        
        return validCategories[Math.floor(Math.random() * validCategories.length)];
    },
    
    // Get speed for a ship category
    getShipSpeed: function(categoryKey) {
        const category = this.categories[categoryKey] || this.categories.shuttle;
        return category.speed.min + Math.random() * (category.speed.max - category.speed.min);
    }
};

// Export to window
window.civilianShipRegistry = civilianShipRegistry;

console.log('✅ Game models system loaded and ready');
console.log('🚢 Civilian ship registry initialized with', Object.keys(civilianShipRegistry.categories).length, 'categories');

// Auto-start model loading when script loads
console.log('🚀 Auto-starting model loading...');
loadAllModels().then(() => {
    console.log('✅ All combat models loaded and cached');
    
    // Also load civilian ship models
    return civilianShipRegistry.loadAllModels();
}).then(() => {
    console.log('✅ All models (combat + civilian) loaded');
    console.log('⏳ Camera system will be initialized when game starts');
}).catch(err => {
    console.error('❌ Model loading failed:', err);
});
