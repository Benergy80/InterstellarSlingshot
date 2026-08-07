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
function _addFresnelRim(material, opts) {
    opts = opts || {};
    const panelDetail = !!opts.panelDetail;
    const hullForm = !!opts.hullForm;
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
uniform float uTime;

float _rimHash21( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 19.19 );
    return fract( ( p3.x + p3.y ) * p3.z );
}

float _rimPanelMask( vec2 uv, float cell ) {
    vec2 cUv = uv / cell;
    vec2 cId = floor( cUv );
    vec2 cF = fract( cUv );
    // lineW/seam-floor/panelShade widened — measured hull-pixel luminance
    // std during boost was 41.5/255 against a >55/255 target: thin, shallow
    // seams plus a narrow 0.8-1.16 per-plate shade range weren't moving
    // per-pixel variance enough once the boost rim brightened everything.
    float lineW = 0.07;
    float seam = smoothstep( 0.0, lineW, cF.x ) * smoothstep( 0.0, lineW, 1.0 - cF.x )
               * smoothstep( 0.0, lineW, cF.y ) * smoothstep( 0.0, lineW, 1.0 - cF.y );
    float panelShade = 0.7 + 0.55 * _rimHash21( cId );
    float mask = mix( 0.18, 1.0, seam ) * panelShade;

    vec2 gUv = uv / ( cell * 0.24 );
    float speck = _rimHash21( floor( gUv ) + 11.0 );
    mask *= 1.0 + step( 0.90, speck ) * 0.6 - step( speck, 0.10 ) * 0.6;
    return mask;
}

float _rimPanelDetail( vec3 posObj, vec3 normalObj, float cell ) {
    vec3 blend = pow( abs( normalize( normalObj ) ), vec3( 4.0 ) );
    blend /= max( blend.x + blend.y + blend.z, 0.0001 );
    float mXY = _rimPanelMask( posObj.xy, cell );
    float mYZ = _rimPanelMask( posObj.yz, cell );
    float mXZ = _rimPanelMask( posObj.xz, cell );
    return mXY * blend.z + mYZ * blend.x + mXZ * blend.y;
}`
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

        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', fragCommon);

        let colorInject = `#include <color_fragment>
    float _rimFresEarly = pow( 1.0 - clamp( dot( normalize( vRimNormalW ), normalize( vRimViewW ) ), 0.0, 1.0 ), rimPower );
    diffuseColor.rgb *= mix( 1.0 - rimCoreDarken, 1.0, _rimFresEarly );
`;
        if (panelDetail) {
            colorInject += '    diffuseColor.rgb *= _rimPanelDetail( vRimPosObj, vRimNormalObj, uRimPanelCell );\n';
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

        if (hullForm) {
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                '#include <emissivemap_fragment>\n    totalEmissiveRadiance *= _formShade;\n'
            );
        }

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <output_fragment>',
                `
    float _rimFres = pow( 1.0 - clamp( dot( normalize( vRimNormalW ), normalize( vRimViewW ) ), 0.0, 1.0 ), rimPower );
    vec3 _rimBoostShimmer = mix( rimColorBoostA, rimColorBoostB, 0.5 + 0.5 * sin( uTime * 2.6 ) );
    vec3 _rimColor = mix( rimColorIdle, _rimBoostShimmer, boostT );
    float _rimStrengthMix = mix( rimBaseStrength, rimBoostStrength, boostT );
    outgoingLight += _rimColor * _rimFres * _rimStrengthMix;
    #include <output_fragment>
`
            );
    };

    material.userData._rimUniforms = uniforms;
    return uniforms;
}

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
//   hullHeat     — how far the albedo is heated toward the hot-point
//   emissiveHeat — how far the always-on emissive floor is heated
//   emissiveIntensity — kept LOW (0.5-0.7) so the attack telegraph, which
//                       multiplies it 1x->3.4x, still has somewhere to go
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
    // High-value hull body.
    const hullTone = hot(opts.hullHeat !== undefined ? opts.hullHeat : 0.55);
    // Always-on emissive floor — the term that survives at any range.
    const emisTone = hot(opts.emissiveHeat !== undefined ? opts.emissiveHeat : 0.38);
    // Rim + boost shimmer stay SATURATED: that's where faction identity lives
    // now that the body is high-value.
    const rimTone = base.clone().lerp(WHITE, 0.12);
    const rimHot = base.clone().lerp(WHITE, 0.62);

    const material = new THREE.MeshStandardMaterial({
        color: hullTone,
        emissive: emisTone,
        emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 0.70,
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
        baseStrength: opts.rimBaseStrength !== undefined ? opts.rimBaseStrength : 0.9,
        boostStrength: opts.rimBoostStrength !== undefined ? opts.rimBoostStrength : 1.7,
        coreDarken: opts.coreDarken !== undefined ? opts.coreDarken : 0.22,
        hullForm: opts.hullForm !== false,
        formFloor: opts.formFloor !== undefined ? opts.formFloor : 0.66,
        formTop: opts.formTop !== undefined ? opts.formTop : 1.72,
        formNoseSign: opts.formNoseSign !== undefined ? opts.formNoseSign : -1.0,
        formNoseDark: opts.formNoseDark !== undefined ? opts.formNoseDark : 0.55
    });

    return material;
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

                // HIGH-VALUE, RIM-LIT, TOP-LIT hull. See the "VALUE, NOT HUE"
                // note on createFactionHullMaterial: the old dark-albedo +
                // saturated-emissive keying (#8c1c1c body, emissiveIntensity
                // 1.4) measured DIMMER than the background starfield at
                // weapons range, and at close range its flat 1.4 emissive on
                // a DoubleSide untextured mesh clipped to a white crumpled
                // wad with no readable facing. The body is now bright and
                // desaturated, faction identity moved to the rim and the
                // engine flares, and the emissive floor is LOW (0.62) so the
                // 1x->3.4x attack telegraph has real headroom above it.
                child.material = createFactionHullMaterial(material.color || 0xff0000, {
                    emissiveIntensity: 0.70,
                    rimIntensity: 0.62,
                    // Nose direction in MESH-LOCAL space: the nose-flipped
                    // regions are authored +Z-forward, everything else -Z.
                    formNoseSign: _enemyModelNoseFlip[regionId] ? 1.0 : -1.0
                });

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

        // Small engine glows at the hull's rear — must run before
        // _applyNoseFlip (below) so nose-flipped ships carry the glow
        // into the rotated inner group along with everything else.
        const centeredEnemyBox = new THREE.Box3().setFromObject(model);
        // 0.085 of the hull's largest dimension per nozzle core (the flare
        // quad is 4.2x that) — nozzles that read as engines on a fighter,
        // not as a second ship made of light.
        _attachEngineGlow(model, material.color || 0xffaa33, centeredEnemyBox, 1.0, 0.085, 0.0);

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
        const baseMaterial = createFactionHullMaterial(material.color || 0xff0000, {
            emissiveIntensity: 0.70,
            rimIntensity: 0.62,
            roughness: 0.5,
            formNoseSign: -1.0
        });

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
                // Same high-value re-key as the fighters (see "VALUE, NOT
                // HUE") but kept one notch hotter on every axis so a boss
                // still out-reads the fighters it flies with now that they
                // are bright too.
                child.material = createFactionHullMaterial(material.color || 0xff0000, {
                    hullHeat: 0.62,
                    emissiveHeat: 0.46,
                    emissiveIntensity: 0.80,
                    roughness: 0.4,
                    rimIntensity: 0.7,
                    rimBaseStrength: 1.1,
                    formNoseSign: _enemyModelNoseFlip[regionId] ? 1.0 : -1.0
                });

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
// which needs no UVs and stays fixed to the hull under rotation. cell
// ~0.045 gives roughly 6 plates across the ~0.28-unit hull length (the
// existing engine-bloom sprites are hand-placed at local Z=-0.14, i.e.
// half-length 0.14, in this same object-space frame).
const PLAYER_HULL_PANEL_CELL = 0.045;

function createPlayerHullMaterial() {
    // Presence floor, in the ship's own accent cyan. 0.18 x 0.7 = 0.126
    // effective was tuned against the shipLight sitting 50u in front of the
    // camera, but coreDarken (0.62) knocks the diffuse back down again and the
    // rest of space contributes essentially nothing — so in third person the
    // hull read as a near-black cut-out at exactly the moment the background
    // got brighter. Emissive is added after coreDarken and independent of every
    // light in the scene, so this is the term that guarantees the ship is
    // always a legible cyan silhouette; the rim/panel work still owns the
    // close-up shading and the boost color shift.
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(PLAYER_HULL_BASE_COLOR),
        emissive: new THREE.Color(PLAYER_HULL_BASE_COLOR).multiplyScalar(0.42),
        emissiveIntensity: 1.15,
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
        baseStrength: 2.4,   // was 1.3 — too weak to beat direct-light response on facing panels (measured rim/core ratio 0.64, i.e. rim READ DARKER than core)
        boostStrength: 4.2,  // was 2.8
        coreDarken: 0.62,    // was 0.55 — dim facing panels so the rim reads brighter than the core instead of losing to it; raised further to widen core/rim luminance spread (measured hull-pixel std 41.5/255 during boost, target >55/255)
        panelDetail: true,
        panelCellSize: PLAYER_HULL_PANEL_CELL
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
