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
                opacity: 0.2,  // Base opacity - will pulse from 0.0 to 0.7
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

        // Scale enemy models (default 96x = 80% of original 120x, but can be overridden)
        const finalScale = scaleOverride !== undefined ? scaleOverride : 96.0;
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
            opacity: 0.2,  // Base opacity - will pulse from 0.0 to 0.7
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

        // Bosses are larger than enemies (144x = 80% of original 180x)
        model.scale.multiplyScalar(144.0);

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

// =============================================================================
// CIVILIAN SHIP REGISTRY - Categories, models, and spawning behavior
// =============================================================================

const civilianShipRegistry = {
    // Ship category definitions
    categories: {
        freighter: {
            name: 'Freighter',
            modelFile: 'Freighter.glb',
            scale: 1.0,
            description: 'Heavy cargo hauler',
            spawnLocations: ['nebula', 'trade_route', 'station'],
            speed: { min: 0.3, max: 0.6 },
            colors: [0x888899, 0x667788, 0x998877]
        },
        tanker: {
            name: 'Tanker',
            modelFile: 'Tanker.glb',
            scale: 1.2,
            description: 'Fuel and gas transport',
            spawnLocations: ['star', 'refinery', 'gas_giant'],
            speed: { min: 0.2, max: 0.4 },
            colors: [0xcc6633, 0xdd8844, 0xbb5522]
        },
        passenger: {
            name: 'Passenger Liner',
            modelFile: 'Passenger.glb',
            scale: 1.5,
            description: 'Luxury cruise vessel',
            spawnLocations: ['planet', 'station', 'scenic'],
            speed: { min: 0.4, max: 0.7 },
            colors: [0xffffff, 0xeeeeff, 0xffffee]
        },
        mining: {
            name: 'Mining Vessel',
            modelFile: 'Mining.glb',
            scale: 0.9,
            description: 'Asteroid mining ship',
            spawnLocations: ['asteroid_belt', 'asteroid', 'dwarf_planet'],
            speed: { min: 0.2, max: 0.5 },
            colors: [0xaaaa55, 0x999944, 0x888833]
        },
        science: {
            name: 'Research Vessel',
            modelFile: 'Science.glb',
            scale: 0.8,
            description: 'Scientific research ship',
            spawnLocations: ['anomaly', 'nebula', 'pulsar', 'black_hole'],
            speed: { min: 0.3, max: 0.6 },
            colors: [0x4488ff, 0x3377ee, 0x5599ff]
        },
        shuttle: {
            name: 'Shuttle',
            modelFile: 'Shuttle.glb',
            scale: 0.5,
            description: 'Small transport craft',
            spawnLocations: ['anywhere', 'planet', 'station'],
            speed: { min: 0.5, max: 1.0 },
            colors: [0xcccccc, 0xbbbbbb, 0xdddddd]
        },
        rescue: {
            name: 'Rescue Ship',
            modelFile: 'Rescue.glb',
            scale: 0.7,
            description: 'Emergency response vessel',
            spawnLocations: ['distress', 'debris', 'wreck'],
            speed: { min: 0.8, max: 1.2 },
            colors: [0xff4444, 0xff6666, 0xee3333]
        },
        military: {
            name: 'Patrol Cruiser',
            modelFile: 'Military.glb',
            scale: 1.1,
            description: 'Armed escort vessel',
            spawnLocations: ['trade_route', 'border', 'station'],
            speed: { min: 0.6, max: 1.0 },
            colors: [0x336633, 0x445544, 0x224422]
        }
    },
    
    // Model cache for civilian ships
    modelCache: {},
    modelsLoaded: false,
    
    // Load all civilian ship models
    loadAllModels: async function() {
        console.log('🚢 Loading civilian ship models...');
        
        const categories = Object.keys(this.categories);
        let loaded = 0;
        let failed = 0;
        
        for (const catKey of categories) {
            const category = this.categories[catKey];
            const path = `models/${category.modelFile}`;
            
            try {
                const model = await this.loadModel(path);
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
    getShipMesh: function(categoryKey, customColor = null) {
        const category = this.categories[categoryKey];
        if (!category) {
            console.warn(`Unknown ship category: ${categoryKey}`);
            return this.createProceduralShip('shuttle', customColor);
        }
        
        // Try to use cached model
        if (this.modelCache[categoryKey]) {
            const model = this.modelCache[categoryKey].clone();
            model.scale.multiplyScalar(category.scale * 50); // Base scale
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
