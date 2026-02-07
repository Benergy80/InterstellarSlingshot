// =============================================================================
// SPATIAL OPTIMIZATION SYSTEM - Fast object culling without sqrt
// =============================================================================

console.log('🚀 Loading Spatial Optimization System...');

// =============================================================================
// SPATIAL PARTITIONING - Pre-sort objects by distance from origin
// =============================================================================

const spatialGrid = {
    // Pre-sorted arrays for fast access
    originObjects: [],      // Objects within 3000 units of origin (twin cores area)
    nearObjects: [],        // Objects 3000-15000 units from origin
    farObjects: [],         // Objects beyond 15000 units
    
    initialized: false,
    
    // Fast AABB check - no sqrt needed!
    isInRange: function(objPos, playerPos, range) {
        const dx = Math.abs(objPos.x - playerPos.x);
        if (dx > range) return false;
        const dy = Math.abs(objPos.y - playerPos.y);
        if (dy > range) return false;
        const dz = Math.abs(objPos.z - playerPos.z);
        if (dz > range) return false;
        return true;
    },
    
    // Sort all planets into distance-based arrays (call once after planets created)
    sortPlanetsByDistance: function() {
        if (typeof planets === 'undefined' || !planets.length) {
            console.warn('No planets to sort');
            return;
        }
        
        this.originObjects = [];
        this.nearObjects = [];
        this.farObjects = [];
        
        const ORIGIN_THRESHOLD = 3000;
        const NEAR_THRESHOLD = 15000;
        
        planets.forEach(planet => {
            if (!planet || !planet.position) return;
            
            const dist = planet.position.length(); // Distance from origin
            
            if (dist < ORIGIN_THRESHOLD) {
                this.originObjects.push(planet);
            } else if (dist < NEAR_THRESHOLD) {
                this.nearObjects.push(planet);
            } else {
                this.farObjects.push(planet);
            }
        });
        
        this.initialized = true;
        
        console.log(`📊 Spatial sort complete:`);
        console.log(`   🔴 Origin (<${ORIGIN_THRESHOLD}): ${this.originObjects.length} objects`);
        console.log(`   🟡 Near (${ORIGIN_THRESHOLD}-${NEAR_THRESHOLD}): ${this.nearObjects.length} objects`);
        console.log(`   🟢 Far (>${NEAR_THRESHOLD}): ${this.farObjects.length} objects`);
        console.log(`   Total: ${planets.length}`);
    },
    
    // Get objects that should be processed this frame (FAST!)
    getObjectsToProcess: function(playerPos, range) {
        if (!this.initialized) return planets; // Fallback to all planets
        
        const result = [];
        const playerDist = playerPos.length();
        
        // Determine which arrays to check based on player position
        const checkOrigin = playerDist < 6000;
        const checkNear = playerDist > 1000 && playerDist < 20000;
        const checkFar = playerDist > 10000;
        
        // Process only relevant arrays with fast AABB checks
        if (checkOrigin) {
            for (let i = 0; i < this.originObjects.length; i++) {
                const obj = this.originObjects[i];
                if (obj && obj.position && this.isInRange(obj.position, playerPos, range)) {
                    result.push(obj);
                }
            }
        }
        
        if (checkNear) {
            for (let i = 0; i < this.nearObjects.length; i++) {
                const obj = this.nearObjects[i];
                if (obj && obj.position && this.isInRange(obj.position, playerPos, range)) {
                    result.push(obj);
                }
            }
        }
        
        if (checkFar) {
            for (let i = 0; i < this.farObjects.length; i++) {
                const obj = this.farObjects[i];
                if (obj && obj.position && this.isInRange(obj.position, playerPos, range)) {
                    result.push(obj);
                }
            }
        }
        
        return result;
    }
};

// =============================================================================
// PATCH: Override expensive forEach in updatePlanetOrbits
// =============================================================================

function patchUpdatePlanetOrbits() {
    if (typeof updatePlanetOrbits === 'undefined') {
        console.log('   updatePlanetOrbits not found, retrying...');
        setTimeout(patchUpdatePlanetOrbits, 500);
        return;
    }
    
    // Store original function
    const originalUpdatePlanetOrbits = updatePlanetOrbits;
    
    // Create patched version
    window.updatePlanetOrbits = function() {
        if (!spatialGrid.initialized) {
            // Fallback to original if not initialized
            return originalUpdatePlanetOrbits();
        }
        
        if (typeof camera === 'undefined') return;
        
        const playerPos = camera.position;
        const CULL_DISTANCE = 2500;
        
        // Use spatial grid for fast object selection
        const objectsToProcess = spatialGrid.getObjectsToProcess(playerPos, CULL_DISTANCE);
        
        // PERF DEBUG: Log every 300 frames
        if (typeof gameState !== 'undefined' && gameState.frameCount % 300 === 0) {
            console.log(`📊 SPATIAL: Processing ${objectsToProcess.length}/${planets.length} planets (${((1 - objectsToProcess.length/planets.length) * 100).toFixed(0)}% culled)`);
        }
        
        // Process only the culled set
        objectsToProcess.forEach(planet => {
            if (!planet || !planet.userData) return;
            
            // Planet rotation
            if (planet.rotation && !planet.userData.isLocalStar) {
                const rotationSpeed = planet.userData.rotationSpeed || 0.02;
                planet.rotation.y += rotationSpeed;
            }
            
            // Orbital mechanics
            if (planet.userData.orbitRadius > 0 && planet.userData.systemCenter) {
                let baseSpeed = planet.userData.orbitSpeed || 0.015;
                
                if (planet.userData.isLocal) {
                    baseSpeed *= 3.0;
                } else if (planet.userData.isDistant) {
                    baseSpeed *= 25.0;
                } else {
                    baseSpeed *= 8.0;
                }
                
                planet.userData.orbitAngle = (planet.userData.orbitAngle || 0) + baseSpeed;
                
                const center = planet.userData.systemCenter;
                const radius = planet.userData.orbitRadius;
                const angle = planet.userData.orbitAngle;
                const inclination = planet.userData.orbitInclination || 0;
                
                planet.position.x = center.x + Math.cos(angle) * radius;
                planet.position.z = center.z + Math.sin(angle) * radius;
                planet.position.y = center.y + Math.sin(angle * 2) * inclination;
            }
        });
    };
    
    console.log('✅ Patched updatePlanetOrbits with spatial optimization');
}

// =============================================================================
// INITIALIZATION
// =============================================================================

function initializeSpatialOptimization() {
    console.log('🚀 Initializing spatial optimization...');
    
    // Wait for planets to be created
    if (typeof planets === 'undefined' || planets.length === 0) {
        console.log('   Waiting for planets...');
        setTimeout(initializeSpatialOptimization, 1000);
        return;
    }
    
    // Sort planets by distance
    spatialGrid.sortPlanetsByDistance();
    
    // Patch the update function
    patchUpdatePlanetOrbits();
    
    console.log('✅ Spatial optimization active!');
}

// Auto-initialize after scene loads
setTimeout(initializeSpatialOptimization, 3000);

// Export for debugging
window.spatialGrid = spatialGrid;
window.initializeSpatialOptimization = initializeSpatialOptimization;

console.log('✅ Spatial Optimization System loaded');
