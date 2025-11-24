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
        // Add cache-busting parameter to force reload
        const cacheBustPath = `${path}?v=${Date.now()}`;
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

                // Apply base material
                const baseColor = new THREE.Color(material.color || 0xff0000);
                baseColor.multiplyScalar(0.4);

                child.material = new THREE.MeshStandardMaterial({
                    color: baseColor,
                    transparent: false,
                    opacity: 1.0,
                    roughness: 0.6,
                    metalness: 0.7,
                    side: THREE.DoubleSide,
                    depthWrite: true,
                    depthTest: true
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

        // STEP 3: NOW add glow layers (after centering)
        baseMeshes.forEach((child) => {
            const glowGeometry = child.geometry.clone();
            const glowColor = new THREE.Color(material.color || 0xff0000);
            glowColor.multiplyScalar(1.2);

            const glowMaterial = new THREE.MeshBasicMaterial({
                color: glowColor,
                transparent: true,
                opacity: 0.3,  // Less opaque - will pulse from 0.0 to 0.6
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: true
            });

            const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
            // Don't scale - keep exact same size as base for perfect alignment
            glowMesh.scale.set(1.0, 1.0, 1.0);
            glowMesh.position.set(0, 0, 0);
            glowMesh.rotation.set(0, 0, 0);
            glowMesh.userData.isGlowLayer = true;
            child.add(glowMesh);
        });

        // Scale enemy models (default 120x, but can be overridden)
        const finalScale = scaleOverride !== undefined ? scaleOverride : 120.0;
        model.scale.multiplyScalar(finalScale);

        return model;
    } else {
        // Fallback to procedural geometry
        console.log(`Using fallback geometry for Enemy ${regionId}`);

        // Create base mesh with darker, more defined material
        const baseColor = new THREE.Color(material.color || 0xff0000);
        baseColor.multiplyScalar(0.4);  // Darker base for contrast

        const baseMaterial = new THREE.MeshStandardMaterial({
            color: baseColor,
            transparent: false,
            opacity: 1.0,
            roughness: 0.6,
            metalness: 0.7,
            side: THREE.DoubleSide
        });

        const baseMesh = new THREE.Mesh(fallbackGeometry, baseMaterial);

        // Add glow layer
        const glowColor = new THREE.Color(material.color || 0xff0000);
        glowColor.multiplyScalar(1.2);

        const glowMaterial = new THREE.MeshBasicMaterial({
            color: glowColor,
            transparent: true,
            opacity: 0.3,  // Less opaque - will pulse from 0.0 to 0.6
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        });

        const glowMesh = new THREE.Mesh(fallbackGeometry.clone(), glowMaterial);
        // Don't scale - keep exact same size as base for perfect alignment
        glowMesh.scale.set(1.0, 1.0, 1.0);
        glowMesh.position.set(0, 0, 0);  // Position at parent's origin
        glowMesh.rotation.set(0, 0, 0);  // No rotation offset
        glowMesh.userData.isGlowLayer = true;
        baseMesh.add(glowMesh);

        return baseMesh;
    }
}

// Create boss mesh using GLB model or fallback geometry
function createBossMeshWithModel(regionId, fallbackGeometry, material) {
    const model = getBossModel(regionId);

    if (model) {
        // Use the GLB model
        // console.log(`Using GLB model for Boss ${regionId}`);

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

                // More defined material - much dimmer colors to show shape better
                const dimmedColor = new THREE.Color(material.color || 0xff0000);
                dimmedColor.multiplyScalar(0.3);  // Reduce brightness by 70% to see shape clearly

                child.material = new THREE.MeshBasicMaterial({
                    color: dimmedColor,
                    transparent: true,
                    opacity: 0.85,  // More opaque for better surface definition
                    blending: THREE.NormalBlending,
                    depthWrite: true,
                    depthTest: true,
                    side: THREE.DoubleSide,
                    wireframe: false
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

        // Bosses are MUCH larger than enemies (reduced by 20% from 225x to 180x)
        model.scale.multiplyScalar(180.0);

        return model;
    } else {
        // Fallback to procedural geometry
        console.log(`Using fallback geometry for Boss ${regionId}`);
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
    console.log('✅ Model functions exported successfully');
}

console.log('✅ Game models system loaded and ready');

// Auto-start model loading when script loads
console.log('🚀 Auto-starting model loading...');
loadAllModels().then(() => {
    console.log('✅ All models loaded and cached');
    console.log('⏳ Camera system will be initialized when game starts');
}).catch(err => {
    console.error('❌ Model loading failed:', err);
});
