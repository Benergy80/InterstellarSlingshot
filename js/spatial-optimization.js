// =============================================================================
// SPATIAL OPTIMIZATION SYSTEM - Dramatically reduce per-frame object processing
// =============================================================================

console.log('🚀 Loading Spatial Optimization System...');

// =============================================================================
// SPATIAL PARTITIONING - Divide space into regions for fast culling
// =============================================================================

const spatialGrid = {
    // Grid configuration
    cellSize: 5000,  // Each cell is 5000x5000x5000 units
    cells: new Map(), // Map of "x,y,z" -> array of objects
    
    // Pre-sorted arrays for fast access
    originObjects: [],      // Objects within 3000 units of origin
    nearObjects: [],        // Objects 3000-10000 units from origin
    farObjects: [],         // Objects beyond 10000 units
    
    // Cache for quick lookups
    lastPlayerCell: null,
    lastUpdateFrame: 0,
    
    // Get cell key for a position
    getCellKey: function(pos) {
        const cx = Math.floor(pos.x / this.cellSize);
        const cy = Math.floor(pos.y / this.cellSize);
        const cz = Math.floor(pos.z / this.cellSize);
        return `${cx},${cy},${cz}`;
    },
    
    // Get distance from origin (fast approximation using max of abs values)
    fastDistanceFromOrigin: function(pos) {
        return Math.max(Math.abs(pos.x), Math.abs(pos.y), Math.abs(pos.z));
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
        const NEAR_THRESHOLD = 10000;
        
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
        
        console.log(`📊 Spatial sort complete:`);
        console.log(`   Origin (<${ORIGIN_THRESHOLD}): ${this.originObjects.length} objects`);
        console.log(`   Near (${ORIGIN_THRESHOLD}-${NEAR_THRESHOLD}): ${this.nearObjects.length} objects`);
        console.log(`   Far (>${NEAR_THRESHOLD}): ${this.farObjects.length} objects`);
    },
    
    // Fast check if object is potentially visible (AABB check, no sqrt)
    isInRange: function(objPos, playerPos, range) {
        const dx = Math.abs(objPos.x - playerPos.x);
        if (dx > range) return false;
        const dy = Math.abs(objPos.y - playerPos.y);
        if (dy > range) return false;
        const dz = Math.abs(objPos.z - playerPos.z);
        if (dz > range) return false;
        return true; // Within cubic range (fast approximation)
    },
    
    // Get objects that should be processed this frame
    getObjectsToProcess: function(playerPos, range) {
        const result = [];
        const playerDist = playerPos.length();
        
        // Always process origin objects if player is near origin
        if (playerDist < 5000) {
            // Player near origin - process origin objects
            this.originObjects.forEach(obj => {
                if (obj && obj.position && this.isInRange(obj.position, playerPos, range)) {
                    result.push(obj);
                }
            });
        }
        
        // Process near objects if player is in that range
        if (playerDist > 1000 && playerDist < 15000) {
            this.nearObjects.forEach(obj => {
                if (obj && obj.position && this.isInRange(obj.position, playerPos, range)) {
                    result.push(obj);
                }
            });
        }
        
        // Process far objects only if player is far from origin
        if (playerDist > 8000) {
            this.farObjects.forEach(obj => {
                if (obj && obj.position && this.isInRange(obj.position, playerPos, range)) {
                    result.push(obj);
                }
            });
        }
        
        return result;
    }
};

// =============================================================================
// OPTIMIZED PLANET ORBIT UPDATE - Replace the expensive forEach
// =============================================================================

function updatePlanetOrbitsOptimized() {
    if (typeof camera === 'undefined' || typeof planets === 'undefined') return;
    
    const playerPos = camera.position;
    const PROCESS_RANGE = 2500; // Slightly larger than visual range
    
    // Use spatial partitioning to get only relevant objects
    const objectsToProcess = spatialGrid.getObjectsToProcess(playerPos, PROCESS_RANGE);
    
    // PERF DEBUG: Log every 300 frames
    if (typeof gameState !== 'undefined' && gameState.frameCount % 300 === 0) {
        console.log(`📊 OPTIMIZED: Processing ${objectsToProcess.length}/${planets.length} planets`);
    }
    
    objectsToProcess.forEach(planet => {
        if (!planet || !planet.userData) return;
        
        // Basic planet rotation
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
            
            // Update orbit angle
            planet.userData.orbitAngle = (planet.userData.orbitAngle || 0) + baseSpeed;
            
            // Calculate new position
            const center = planet.userData.systemCenter;
            const radius = planet.userData.orbitRadius;
            const angle = planet.userData.orbitAngle;
            const inclination = planet.userData.orbitInclination || 0;
            
            planet.position.x = center.x + Math.cos(angle) * radius;
            planet.position.z = center.z + Math.sin(angle) * radius;
            planet.position.y = center.y + Math.sin(angle * 2) * inclination;
        }
    });
}

// =============================================================================
// INITIALIZATION - Sort objects after scene is created
// =============================================================================

function initializeSpatialOptimization() {
    console.log('🚀 Initializing spatial optimization...');
    
    // Wait for planets to be created
    if (typeof planets === 'undefined' || planets.length === 0) {
        console.log('   Waiting for planets to be created...');
        setTimeout(initializeSpatialOptimization, 1000);
        return;
    }
    
    // Sort planets by distance from origin
    spatialGrid.sortPlanetsByDistance();
    
    // Override the original updatePlanetOrbits function
    if (typeof window.updatePlanetOrbits !== 'undefined') {
        window._originalUpdatePlanetOrbits = window.updatePlanetOrbits;
        window.updatePlanetOrbits = updatePlanetOrbitsOptimized;
        console.log('✅ Replaced updatePlanetOrbits with optimized version');
    }
    
    console.log('✅ Spatial optimization initialized');
}

// Auto-initialize after a delay (to let scene load)
setTimeout(initializeSpatialOptimization, 3000);

// Export for debugging
window.spatialGrid = spatialGrid;
window.updatePlanetOrbitsOptimized = updatePlanetOrbitsOptimized;
window.initializeSpatialOptimization = initializeSpatialOptimization;

console.log('✅ Spatial Optimization System loaded');
