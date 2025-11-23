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
        const loader = new THREE.GLTFLoader();

        loader.load(
            path,
            (gltf) => {
                console.log(`✅ Loaded model: ${path}`);
                resolve(gltf.scene);
            },
            (progress) => {
                const percent = (progress.loaded / progress.total) * 100;
                console.log(`Loading ${path}: ${percent.toFixed(1)}%`);
            },
            (error) => {
                console.error(`❌ Error loading ${path}:`, error);
                reject(error);
            }
        );
    });
}

// Load all enemy models (Enemy1.glb through Enemy8.glb)
async function loadEnemyModels() {
    console.log('Loading enemy models...');
    const promises = [];

    for (let i = 1; i <= 8; i++) {
        const path = `models/Enemy${i}.glb`;
        promises.push(
            loadGLBModel(path)
                .then(model => {
                    modelCache.enemies[i] = model;
                    modelCache.loadingProgress += (1 / 17) * 100; // 17 total models
                })
                .catch(err => {
                    console.warn(`Failed to load ${path}, will use fallback geometry`);
                    modelCache.enemies[i] = null;
                })
        );
    }

    await Promise.all(promises);
    console.log('✅ Enemy models loaded');
}

// Load all boss models (Boss1.glb through Boss8.glb)
async function loadBossModels() {
    console.log('Loading boss models...');
    const promises = [];

    for (let i = 1; i <= 8; i++) {
        const path = `models/Boss${i}.glb`;
        promises.push(
            loadGLBModel(path)
                .then(model => {
                    modelCache.bosses[i] = model;
                    modelCache.loadingProgress += (1 / 17) * 100; // 17 total models
                })
                .catch(err => {
                    console.warn(`Failed to load ${path}, will use fallback geometry`);
                    modelCache.bosses[i] = null;
                })
        );
    }

    await Promise.all(promises);
    console.log('✅ Boss models loaded');
}

// Load player model (Player.glb)
async function loadPlayerModel() {
    console.log('Loading player model...');
    const path = 'models/Player.glb';

    try {
        const model = await loadGLBModel(path);
        modelCache.player = model;
        modelCache.loadingProgress += (1 / 17) * 100; // 17 total models
        console.log('✅ Player model loaded');
    } catch (err) {
        console.warn('Failed to load Player.glb, player will be camera-only');
        modelCache.player = null;
    }
}

// Main function to load all models
async function loadAllModels() {
    console.log('🚀 Starting model loading...');

    try {
        // First, ensure GLTFLoader is available
        if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
            console.log('📦 THREE.GLTFLoader not found, attempting to load...');
            await loadGLTFLoader();
        } else {
            console.log('✅ THREE.GLTFLoader already available');
        }

        // Load all models in parallel
        await Promise.all([
            loadEnemyModels(),
            loadBossModels(),
            loadPlayerModel()
        ]);

        modelCache.loaded = true;
        modelCache.loadingProgress = 100;
        console.log('🎉 All models loaded successfully!');

        return true;
    } catch (error) {
        console.error('❌ Error loading models:', error);
        return false;
    }
}

// =============================================================================
// MODEL RETRIEVAL FUNCTIONS
// =============================================================================

// Get enemy model for a specific region (1-8)
function getEnemyModel(regionId) {
    const model = modelCache.enemies[regionId];
    if (model) {
        // Clone the model so we can have multiple instances
        return model.clone();
    }
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
    if (modelCache.player) {
        return modelCache.player.clone();
    }
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
function createEnemyMeshWithModel(regionId, fallbackGeometry, material) {
    const model = getEnemyModel(regionId);

    if (model) {
        // Use the GLB model
        console.log(`Using GLB model for Enemy ${regionId}`);

        // Apply the game's material to all meshes in the model
        model.traverse((child) => {
            if (child.isMesh) {
                child.material = material;
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        return model;
    } else {
        // Fallback to procedural geometry
        console.log(`Using fallback geometry for Enemy ${regionId}`);
        return new THREE.Mesh(fallbackGeometry, material);
    }
}

// Create boss mesh using GLB model or fallback geometry
function createBossMeshWithModel(regionId, fallbackGeometry, material) {
    const model = getBossModel(regionId);

    if (model) {
        // Use the GLB model
        console.log(`Using GLB model for Boss ${regionId}`);

        // Apply the game's material to all meshes in the model
        model.traverse((child) => {
            if (child.isMesh) {
                child.material = material;
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Bosses are larger
        model.scale.multiplyScalar(2.5);

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
}).catch(err => {
    console.error('❌ Model loading failed:', err);
});
