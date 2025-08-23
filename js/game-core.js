// Game Core - Main initialization and game loop
// Enhanced with doubled world scale, improved systems, and FIXED ORBITAL MECHANICS
// CLEANED: Removed stub functions, simplified initialization, eliminated conflicts
// STREAMLINED: Single initialization path, no competing systems

console.log('Enhanced Interstellar Slingshot starting...');

// =============================================================================
// CORE GAME STATE - SINGLE INITIALIZATION POINT
// =============================================================================

// Enhanced Game State with doubled world scale - SINGLE SOURCE OF TRUTH
const gameState = {
    velocity: 0,
    distance: 0,
    energy: 100,
    hull: 100,
    maxHull: 100,
    location: 'Local Galaxy',
    currentSystem: 0,
    maxSystems: 8,
    achievements: [],
    particles: [],
    blackHoleProximity: 0,
    currentTarget: null,
    targetIndex: 0,
    autoNavigating: false,
    autoNavOrienting: false,
    gameOver: false,
    gameStarted: false,
    autoLevelingEnabled: false, // Auto-leveling is OFF by default, press L to enable
    warping: false,
    isWarping: false, // Track black hole warp state to suppress achievements
    shipMass: 1.0, // Doubled mass for doubled world
    baseSpeed: 0.2, // Doubled for doubled world
    thrustPower: 0.01, // Doubled for doubled world
    wThrustMultiplier: 2.0, // W key gets 2x thrust
    minVelocity: 0.2, // Doubled for doubled world
    maxVelocity: 1.0, // Initial limit: 1000km/s, upgraded to 2500km/s after first interstellar slingshot
    hasInterstellarExperience: false, // Unlocks higher speeds after first interstellar slingshot: 1.0, // Doubled for doubled world
    mapMode: 'galactic',
    mapView: 'galactic', // 'galactic', 'universal'
    galaxiesCleared: 0,
    currentGalaxyEnemies: {}, // Initialize as empty object
    mouseAiming: false,
    mouseX: (typeof window !== 'undefined') ? window.innerWidth / 2 : 400,
    mouseY: (typeof window !== 'undefined') ? window.innerHeight / 2 : 300,
    crosshairX: (typeof window !== 'undefined') ? window.innerWidth / 2 : 400,
    crosshairY: (typeof window !== 'undefined') ? window.innerHeight / 2 : 300,
    targetLock: {
        active: false,
        target: null,
        range: 400, // Doubled range
        autoAim: true,
        smoothing: 0.25
    },
    boostThrust: {
        active: false,
        timeRemaining: 0,
        duration: 20000
    },
    slingshot: {
        active: false,
        timeRemaining: 0,
        maxSpeed: 20.0, // Doubled for doubled world
        duration: 20000,
        accelerationPhase: 10000,
        maintainPhase: 10000,
        postSlingshot: false,
        inertiaDecay: 0.9995
    },
    eventHorizonWarning: {
        active: false,
        blackHole: null,
        warningDistance: 400, // Doubled for doubled world
        criticalDistance: 160 // Doubled for doubled world
    },
     emergencyWarp: {
        available: 5,
        cooldown: 0,
        regenerationTimer: 0,
        regenerationInterval: 60000, // Regenerate every 1 minute
        boostDuration: 8000,
        boostSpeed: 30.0, // This will be limited by maxVelocity
        active: false,
        timeRemaining: 0
    },
    weapons: {
        armed: true,
        energy: 100,
        cooldown: 0
    },
    frameCount: 0,
    performanceOptimized: false,
    lastUpdateTime: 0,
    audioSystem: null,
    performanceMode: 'normal',
	lastPerformanceCheck: 0,
	averageFrameTime: 16.67, // Target 60 FPS like older version
    frameTimeHistory: [],
    velocityVector: null // Will be set to THREE.Vector3 in startGame()
};

// Three.js Setup and global arrays
let scene, camera, renderer, stars, blackHole;
let planets = [];
let activePlanets = [];
let wormholes = [];
let comets = [];
let asteroidBelts = [];
let nebulaClouds = [];
let enemies = [];
let cameraRotation = { x: 0, y: 0, z: 0 }

// Game state for pause functionality
let gamePaused = false;

// Initialize orbit lines array
let orbitLines = [];

// Enhanced orbit lines state management
let orbitLinesVisible = true;
let orbitLinesInitialized = false;
let lastOrbitUpdate = 0;

// --- timing & temp vectors ---
let clock;
const _camPos = new THREE.Vector3();
const _camFwd = new THREE.Vector3();

// simple GPU-safe removal helper
function removeFromScene(obj) {
  if (!obj) return;
  obj.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) {
      if (Array.isArray(n.material)) n.material.forEach(m => m.dispose());
      else n.material.dispose();
    }
  });
  if (obj.parent) obj.parent.remove(obj);
}

// fx state
gameState.fx = { hyperCooldown: 0 };

// =============================================================================
// PERFORMANCE MONITORING AND OPTIMIZATION
// =============================================================================

// PERFORMANCE: Auto-adjust performance based on frame times
function adjustPerformance() {
    // Re-enabled with proper thresholds
    const targetFrameTime = 16.67; // 60 FPS
    const slowFrameTime = 33.33;   // 30 FPS
    const verySlowFrameTime = 50;  // 20 FPS
    
    // Only adjust after enough samples
    if (gameState.frameTimeHistory.length < 30) return;
    
    if (gameState.averageFrameTime > verySlowFrameTime && gameState.performanceMode !== 'minimal') {
        gameState.performanceMode = 'minimal';
        console.log('Performance: Switching to minimal mode');
        optimizeForMinimalMode();
    } else if (gameState.averageFrameTime > slowFrameTime && gameState.performanceMode === 'normal') {
        gameState.performanceMode = 'optimized';
        console.log('Performance: Switching to optimized mode');
    } else if (gameState.averageFrameTime < targetFrameTime * 1.5 && gameState.performanceMode !== 'normal') {
        gameState.performanceMode = 'normal';
        console.log('Performance: Back to normal mode');
    }
    
    if (gameState.averageFrameTime > verySlowFrameTime && gameState.performanceMode !== 'minimal') {
        gameState.performanceMode = 'minimal';
        console.log('Performance: Switching to minimal mode (avg frame time:', gameState.averageFrameTime.toFixed(1), 'ms)');
        
        // Reduce star count
        if (stars && stars.geometry) {
            const positions = stars.geometry.attributes.position.array;
            const reducedPositions = new Float32Array(positions.length * 0.5); // 50% reduction
            for (let i = 0; i < reducedPositions.length; i++) {
                reducedPositions[i] = positions[i];
            }
            stars.geometry.setAttribute('position', new THREE.Float32BufferAttribute(reducedPositions, 3));
        }
        
    } else if (gameState.averageFrameTime > slowFrameTime && gameState.performanceMode === 'normal') {
        gameState.performanceMode = 'optimized';
        console.log('Performance: Switching to optimized mode (avg frame time:', gameState.averageFrameTime.toFixed(1), 'ms)');
        
    } else if (gameState.averageFrameTime < targetFrameTime * 1.2 && gameState.performanceMode !== 'normal') {
        // Only switch back to normal if performance is good for a while
        gameState.performanceMode = 'normal';
        console.log('Performance: Switching to normal mode (avg frame time:', gameState.averageFrameTime.toFixed(1), 'ms)');
    }
}

function updateActivePlanets() {
    // PERFORMANCE: Adjust active range based on performance mode
    const activeRange = gameState.performanceMode === 'minimal' ? 2000 :
                        gameState.performanceMode === 'optimized' ? 3000 : 4000;

    // Build active list (always include tendril stars & moons)
activePlanets = [];
const cameraPos = camera.position;

for (let i = 0; i < planets.length; i++) {
    const planet = planets[i];
    
    // Always include stars with tendrils for animation
    if (planet.userData.tendrilGroup) {
        activePlanets.push(planet);
        continue;
    }

    // CRITICAL: Always include moons and ensure they're visible
    if (planet.userData.type === 'moon') {
        planet.visible = true;
        planet.frustumCulled = false;
        activePlanets.push(planet);
        continue;
    }

    // Always include local planets and their moons
    if (planet.userData.isLocal) {
        activePlanets.push(planet);
        continue;
    }

    // Only calculate distance for remaining objects
    const distance = cameraPos.distanceTo(planet.position);
    
    // Asteroids within range
    if (planet.userData.type === 'asteroid' && distance < activeRange) {
        activePlanets.push(planet);
        continue;
    }

    // Default: within range
    if (distance < activeRange) {
        activePlanets.push(planet);
    }
}


    // Enhanced LOD for distant objects (never simplify moons)
    const lodDistance = gameState.performanceMode === 'minimal' ? 2000 :
                        gameState.performanceMode === 'optimized' ? 3000 : 4000;

    planets.forEach(planet => {
        const distance = camera.position.distanceTo(planet.position);

        // ✅ Ensure moons are always visible/active and never simplified
        if (planet.userData.type === 'moon') {
            planet.visible = true;
            planet.frustumCulled = false;
            if (planet.userData.isSimplified && planet.userData.originalGeometry) {
                planet.geometry = planet.userData.originalGeometry;
                planet.userData.isSimplified = false;
            }
            return; // Skip simplification rules for moons
        }

        // LOD simplify for distant non-asteroid, non-moon bodies
        if (planet.geometry && distance > lodDistance && planet.userData.type !== 'asteroid') {
            if (!planet.userData.isSimplified) {
                const originalGeometry = planet.geometry;
                const simplifiedGeometry = new THREE.SphereGeometry(
                    originalGeometry.parameters?.radius || 5,
                    8, 8
                );
                planet.geometry = simplifiedGeometry;
                planet.userData.isSimplified = true;
                planet.userData.originalGeometry = originalGeometry;
            }
        } else if (planet.userData.isSimplified && distance <= lodDistance) {
            if (planet.userData.originalGeometry) {
                planet.geometry = planet.userData.originalGeometry;
                planet.userData.isSimplified = false;
            }
        }
    });
}

function monitorPerformance() {
    const now = performance.now();
    const delta = now - gameState.lastUpdateTime;
    
    // Only warn about performance if it's consistently bad
    if (delta > 50 && gameState.frameCount > 100) { // Less than 20 FPS
        console.warn(`Performance warning: Frame time ${delta.toFixed(1)}ms (doubled world scale)`);
    }
    
    // PERFORMANCE: Provide helpful suggestions
    if (delta > 100 && gameState.frameCount % 600 === 0) { // Less than 10 FPS consistently
        console.log('Performance tip: Consider reducing graphics quality or closing other browser tabs');
        
        // Auto-reduce quality if performance is really bad
        if (gameState.performanceMode !== 'minimal') {
            adjustPerformance();
        }
    }
}

// DISABLED: Performance monitoring for doubled world - causing issues
// setInterval(monitorPerformance, 2000); // Check every 2 seconds

// =============================================================================
// ORBIT LINES SYSTEM - FIXED AND ENHANCED
// =============================================================================

// FIXED: Enhanced orbit lines that work across all galaxies
function createOrbitLines() {
    // Only recreate orbit lines if enough time has passed or they haven't been initialized
    const now = Date.now();
    if (orbitLinesInitialized && (now - lastOrbitUpdate) < 5000) {
        return; // Don't recreate too frequently
    }
    
    console.log('Creating/updating orbit lines...');
    
    // Clear existing orbit lines only if we're going to recreate them
    orbitLines.forEach(line => {
        if (line && line.parent) {
            line.parent.remove(line);
        } else if (scene) {
            scene.remove(line);
        }
        // Dispose of geometry and material
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
    });
    orbitLines = [];
    
    // FIXED: Different limits based on proximity and importance
    const maxLocalOrbitLines = 15;      // Local system gets priority
    const maxDistantOrbitLines = 20;    // Distant galaxies get reasonable limit
    const maxTotalOrbitLines = 35;      // Total limit for performance
    
    let localOrbitCount = 0;
    let distantOrbitCount = 0;
    let totalOrbitCount = 0;
    
    // FIXED: Separate processing for local vs distant systems
    const localPlanets = [];
    const distantPlanets = [];
    
    // Categorize planets by proximity and orbital data
    planets.forEach(planet => {
        // Check if planet has orbital data
        if (!planet.userData.orbitRadius || planet.userData.orbitRadius <= 0) return;
        if (!planet.userData.systemCenter && !planet.userData.parentPlanet) return;
        
        // FIXED: Use distance from player to system center, not planet
        let systemCenter;
        if (planet.userData.systemCenter) {
            systemCenter = planet.userData.systemCenter;
        } else if (planet.userData.parentPlanet && planet.userData.parentPlanet.userData.systemCenter) {
            systemCenter = planet.userData.parentPlanet.userData.systemCenter;
        } else {
            return; // Skip if no valid system center
        }
        
        const systemDistance = camera.position.distanceTo(new THREE.Vector3(systemCenter.x, systemCenter.y, systemCenter.z));
        
        // FIXED: Better categorization based on actual game distances
        if (planet.userData.isLocal || systemDistance < 5000) {
            localPlanets.push(planet);
        } else {
            distantPlanets.push(planet);
        }
    });
    
    // Sort by priority and distance
    localPlanets.sort((a, b) => {
        const distA = camera.position.distanceTo(a.position);
        const distB = camera.position.distanceTo(b.position);
        return distA - distB;
    });
    
    distantPlanets.sort((a, b) => {
        const systemCenterA = a.userData.systemCenter;
        const systemCenterB = b.userData.systemCenter;
        if (!systemCenterA || !systemCenterB) return 0;
        
        const distA = camera.position.distanceTo(new THREE.Vector3(systemCenterA.x, systemCenterA.y, systemCenterA.z));
        const distB = camera.position.distanceTo(new THREE.Vector3(systemCenterB.x, systemCenterB.y, systemCenterB.z));
        return distA - distB;
    });
    
    console.log(`Found ${localPlanets.length} local planets and ${distantPlanets.length} distant planets with orbits`);
    
    // Create orbit lines for local planets first
    localPlanets.forEach(planet => {
        if (localOrbitCount >= maxLocalOrbitLines || totalOrbitCount >= maxTotalOrbitLines) return;
        
        if (createSingleOrbitLine(planet, true)) {
            localOrbitCount++;
            totalOrbitCount++;
        }
    });
    
    // FIXED: Create orbit lines for distant galaxies when player is nearby
    distantPlanets.forEach(planet => {
        if (distantOrbitCount >= maxDistantOrbitLines || totalOrbitCount >= maxTotalOrbitLines) return;
        
        // FIXED: Check if player is in the same galaxy/system as this planet
        const systemCenter = planet.userData.systemCenter;
        if (!systemCenter) return;
        
        const systemDistance = camera.position.distanceTo(new THREE.Vector3(systemCenter.x, systemCenter.y, systemCenter.z));
        
        // FIXED: Much larger distance threshold for distant galaxies
        const maxDistantSystemDistance = 15000; // Show orbits when in or near the galaxy
        
        if (systemDistance < maxDistantSystemDistance) {
            if (createSingleOrbitLine(planet, false)) {
                distantOrbitCount++;
                totalOrbitCount++;
            }
        }
    });
    
    orbitLinesInitialized = true;
    lastOrbitUpdate = now;
    
    console.log(`Successfully created ${totalOrbitCount} orbit lines (${localOrbitCount} local, ${distantOrbitCount} distant) - visible: ${orbitLinesVisible}`);
}

// FIXED: Helper function to create a single orbit line - NO MOON ORBITS
function createSingleOrbitLine(planet, isLocal) {
    try {
        const orbitRadius = planet.userData.orbitRadius;
        let systemCenter;
        
        // Handle planet orbits but SKIP moon orbits (user doesn't want moon orbit lines)
        if (planet.userData.systemCenter) {
            systemCenter = planet.userData.systemCenter;
        } else if (planet.userData.parentPlanet) {
            // SKIP: Don't create orbit lines for moons
            return false;
        } else {
            return false; // Skip if no valid center
        }
        
        // FIXED: Adjust orbit line thickness based on distance and type
        const baseThickness = isLocal ? 3 : 2;
        const orbitGeometry = new THREE.RingGeometry(
            orbitRadius - baseThickness, // Inner radius
            orbitRadius + baseThickness, // Outer radius
            isLocal ? 64 : 32 // More segments for local orbits
        );
        
        // FIXED: Better color coding for distant galaxies
        let orbitColor = 0x0096ff; // Default blue
        if (isLocal) {
            orbitColor = 0x00ff96; // Green for local system
        } else if (planet.userData.galaxyId !== undefined && planet.userData.galaxyId >= 0) {
            const galaxyType = galaxyTypes[planet.userData.galaxyId];
            if (galaxyType) {
                orbitColor = galaxyType.color;
            }
        }
        
        const orbitMaterial = new THREE.MeshBasicMaterial({
            color: orbitColor,
            transparent: true,
            opacity: isLocal ? 0.4 : 0.3, // MORE TRANSPARENT: Local orbits 0.4, distant 0.3
            side: THREE.DoubleSide,
            depthWrite: false // Prevent z-fighting
        });
        
        const orbitLine = new THREE.Mesh(orbitGeometry, orbitMaterial);
        
        // Position the orbit at the system center
        orbitLine.position.set(systemCenter.x, systemCenter.y, systemCenter.z);
        orbitLine.rotation.x = Math.PI / 2; // Rotate to horizontal plane
        
        // Add small random tilt for visual variety
        if (!isLocal) {
            orbitLine.rotation.y += (Math.random() - 0.5) * 0.2;
            orbitLine.rotation.z += (Math.random() - 0.5) * 0.2;
        }
        
        // Set visibility
        orbitLine.visible = orbitLinesVisible;
        
        // Add metadata
        orbitLine.userData = {
            planetName: planet.userData.name,
            orbitRadius: orbitRadius,
            isOrbitLine: true,
            isLocal: isLocal,
            galaxyId: planet.userData.galaxyId,
            isPlanetOrbit: true // Flag to distinguish from moon orbits
        };
        
        scene.add(orbitLine);
        orbitLines.push(orbitLine);
        
        console.log(`Created ${isLocal ? 'local' : 'distant'} orbit line for ${planet.userData.name} at radius ${orbitRadius}`);
        return true;
        
    } catch (error) {
        console.error('Error creating orbit line for', planet.userData.name, ':', error);
        return false;
    }
}

// Force orbit lines creation function
function forceCreateOrbitLines() {
    console.log('Force recreating orbit lines...');
    orbitLinesInitialized = false;
    lastOrbitUpdate = 0;
    createOrbitLines();
}

// FIXED: Enhanced orbit line visibility toggle
function toggleOrbitLines() {
    orbitLinesVisible = !orbitLinesVisible;
    console.log(`Toggling orbits: ${orbitLinesVisible ? 'ON' : 'OFF'}`);
    
    // If turning on and no orbit lines exist, force create them
    if (orbitLinesVisible && (!orbitLines || orbitLines.length === 0)) {
        console.log('No orbit lines found, force creating...');
        forceCreateOrbitLines();
    }
    
    // Update visibility of existing orbit lines
    if (orbitLines && orbitLines.length > 0) {
        let visibleCount = 0;
        orbitLines.forEach((line, index) => {
            if (line && line.visible !== undefined) {
                line.visible = orbitLinesVisible;
                if (orbitLinesVisible) visibleCount++;
                console.log(`Orbit line ${index}: ${line.userData?.planetName || 'unknown'} - visible = ${line.visible}`);
            }
        });
        console.log(`Updated visibility for ${visibleCount} orbit lines`);
    } else {
        console.warn('No orbit lines array found! orbitLines:', orbitLines);
        
        // Try to create orbit lines if they don't exist
        if (orbitLinesVisible) {
            setTimeout(() => {
                console.log('Attempting to force create orbit lines after delay...');
                forceCreateOrbitLines();
            }, 100);
        }
    }
    
    return orbitLinesVisible;
}

// =============================================================================
// GAME INITIALIZATION AND STARTUP
// =============================================================================

function simulateLoading() {
    let progress = 0;
    const loadingTexts = [
        "Starting enhanced systems...",
        "Loading cosmic data (doubled scale)...",
        "Calculating orbital mechanics...",
        "Initializing gravitational assist systems...",
        "Preparing cyberpunk 3D environment...",
        "Loading enhanced weapon systems...",
        "Setting up eerie space audio...",
        "Optimizing performance for doubled world...",
        "Ready for enhanced launch!"
    ];
    
    const interval = setInterval(() => {
        progress += 6 + Math.random() * 10;
        progress = Math.min(progress, 100);
        
        const loadingBar = document.getElementById('loadingBar');
        const loadingText = document.getElementById('loadingText');
        
        if (loadingBar) loadingBar.style.width = progress + '%';
        
        const textIndex = Math.floor(progress / 11.1); // Adjusted for 9 messages
        if (loadingText && textIndex < loadingTexts.length) {
            loadingText.textContent = loadingTexts[textIndex];
        }
        
        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                const loadingScreen = document.getElementById('loadingScreen');
                if (loadingScreen) loadingScreen.style.display = 'none';
                gameState.gameStarted = true;
                console.log('Enhanced game fully loaded and started with doubled world scale!');
            }, 500);
        }
    }, 180);
}

// Enhanced functions for doubled world compatibility
function isPositionTooClose(position, minDistance) {
    for (let planet of planets) {
        if (position.distanceTo(planet.position) < minDistance) {
            return true;
        }
    }
    return false;
}

// REMOVED: Duplicate initialization - game is started from index.html
// document.addEventListener('DOMContentLoaded', function() {
//     console.log('DOM loaded, starting initialization...');
//     
//     // Simple, direct initialization
//     setTimeout(() => {
//         startGame();
//     }, 100);
// });

// SIMPLIFIED: Direct initialization without complex dependency checking
function startGame() {
    console.log('Starting enhanced game initialization...');
    
    try {
        // Initialize Three.js
        scene = new THREE.Scene();
        
        // Add enhanced ambient light for doubled world
        const ambientLight = new THREE.AmbientLight(0x333333, 0.2);
        scene.add(ambientLight);
        
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 30000);
        renderer = new THREE.WebGLRenderer({ 
    antialias: false,          // MAJOR FPS BOOST: Disable expensive antialiasing
    alpha: false,              // Disable transparency buffer
    premultipliedAlpha: false, // Disable premultiplied alpha
    stencil: false,            // Disable stencil buffer
    depth: true,               // Keep depth buffer (needed for 3D)
    powerPreference: "high-performance", // Request dedicated GPU
    logarithmicDepthBuffer: false,  // Disable expensive depth buffer
    preserveDrawingBuffer: false,   // Don't preserve buffer
    failIfMajorPerformanceCaveat: true // Fail on slow hardware
});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000011);
        // CRITICAL PERFORMANCE FIXES:
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0)); // Limit to 1.0 for max FPS
        renderer.autoClear = true;
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000011);
    // PERFORMANCE: Optimize renderer settings for maximum FPS
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap pixel ratio for performance
		renderer.shadowMap.enabled = false; // Disable shadows completely
		renderer.autoClear = true;
		renderer.sortObjects = false; // Disable expensive object sorting
        const gameContainer = document.getElementById('gameContainer');
        if (!gameContainer) {
            throw new Error('Game container not found');
        }
        
        gameContainer.appendChild(renderer.domElement);
        renderer.domElement.id = 'gameCanvas';
        renderer.domElement.style.cursor = 'none';
        
        // Initialize velocity vector and camera rotation with doubled scale
        gameState.velocityVector = new THREE.Vector3(0, 0, 0);
        cameraRotation = { x: 0, y: 0, z: 0 };
        
        console.log('Three.js initialized successfully with doubled world scale');
        
        clock = new THREE.Clock();

// keep aspect & resolution correct on resize
window.addEventListener('resize', () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
});
        
        // Start animation first (most critical)
        animate();
        console.log('Animation started');
        
        simulateLoading();
        console.log('Loading simulation started');
        
        // Initialize game components (only call functions that should exist)
        setTimeout(() => {
            console.log('Initializing game components...');
            
            // These functions should be available from other files
            if (typeof createEnhancedStarfield === 'function') {
                createEnhancedStarfield();
                console.log('Enhanced starfield created');
            }
            
            if (typeof createOptimizedPlanets === 'function') {
                createOptimizedPlanets();
                console.log('Optimized planets created');
            }
            
            if (typeof createEnhancedComets === 'function') {
                createEnhancedComets();
                console.log('Enhanced comets created');
            }
            
            if (typeof createEnemies === 'function') {
                createEnemies();
                console.log('Enemy ships created');
            }
            
            // Initialize UI and controls
            if (typeof setupEnhancedEventListeners === 'function') {
                setupEnhancedEventListeners();
                console.log('Enhanced event listeners setup');
            }
            
            if (typeof updateUI === 'function') {
                updateUI();
            }
            
            if (typeof populateTargets === 'function') {
                populateTargets();
            }
            
            if (typeof setupGalaxyMap === 'function') {
                setupGalaxyMap();
            }
            
            // Create orbit lines after planets exist
            setTimeout(() => {
                createOrbitLines();
                console.log('Orbit lines created');
            }, 1000);
            
        }, 500);
        
        // PERFORMANCE: Initialize performance monitoring
        gameState.lastUpdateTime = performance.now();
        
    } catch (error) {
        console.error('Error in startGame:', error);
        const loadingText = document.getElementById('loadingText');
        if (loadingText) {
            loadingText.textContent = 'Error: ' + error.message;
        }
    }
}

// =============================================================================
// TARGET LOCK AND GAME MECHANICS
// =============================================================================

function updateTargetLock() {
    if (!gameState.targetLock.active) {
        gameState.targetLock.target = null;
        return;
    }
    
    // Find nearest enemy or asteroid in range for target lock (doubled range)
    let nearestTarget = null;
    let nearestDistance = gameState.targetLock.range;
    
    // Check enemies first (if they exist)
    if (typeof enemies !== 'undefined') {
        enemies.forEach(enemy => {
            if (enemy.userData.health <= 0) return;
            
            const distance = camera.position.distanceTo(enemy.position);
            if (distance < nearestDistance) {
                // Check if enemy is roughly in front of player
                const direction = new THREE.Vector3().subVectors(enemy.position, camera.position).normalize();
                const forward = new THREE.Vector3();
                camera.getWorldDirection(forward);
                const angle = direction.angleTo(forward);
                
                // Wider lock-on arc for doubled world
                if (angle < 1.0) { // ~57 degree lock-on arc (increased from 45)
                    nearestTarget = enemy;
                    nearestDistance = distance;
                }
            }
        });
    }
    
    // REMOVED: Asteroids from auto-targeting - players prefer manual aiming for asteroids
    // Crosshair will only auto-target enemies, not asteroids
    
    gameState.targetLock.target = nearestTarget;
    
    // Enhanced crosshair following when target locked (doubled world considerations)
    if (nearestTarget) {
        // Project target position to screen coordinates
        const targetScreen = nearestTarget.position.clone().project(camera);
        
        // Check if target is visible on screen
        if (targetScreen.z < 1) { // Target is in front of camera
            const targetScreenX = (targetScreen.x * 0.5 + 0.5) * window.innerWidth;
            const targetScreenY = -(targetScreen.y * 0.5 - 0.5) * window.innerHeight;
            
            // Enhanced crosshair movement with improved interpolation for doubled world
            const lerpFactor = gameState.targetLock.smoothing * 2.5; // Faster response for larger world
            gameState.crosshairX = gameState.crosshairX + (targetScreenX - gameState.crosshairX) * lerpFactor;
            gameState.crosshairY = gameState.crosshairY + (targetScreenY - gameState.crosshairY) * lerpFactor;
            
            // Clamp crosshair to screen bounds with margin
            gameState.crosshairX = Math.max(30, Math.min(window.innerWidth - 30, gameState.crosshairX));
            gameState.crosshairY = Math.max(30, Math.min(window.innerHeight - 30, gameState.crosshairY));
        }
    } else {
        // No target found - only return to center if target lock was previously active
        if (gameState.targetLock.active) {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const returnSpeed = 0.05;
            
            gameState.crosshairX = gameState.crosshairX + (centerX - gameState.crosshairX) * returnSpeed;
            gameState.crosshairY = gameState.crosshairY + (centerY - gameState.crosshairY) * returnSpeed;
        }
        // In manual mode, crosshair position is handled by mouse movement
    }
}

// =============================================================================
// MAIN ANIMATION LOOP - SIMPLIFIED AND OPTIMIZED
// =============================================================================

function animate() {
  requestAnimationFrame(animate);

  // ---- time & perf tracking ----
  const dt = Math.min(clock ? clock.getDelta() : 0.0167, 0.05); // clamp at 50ms
  gameState.time = (gameState.time || 0) + dt;

  gameState.frameCount++;
  const currentTime = performance.now();
  const frameTime = currentTime - gameState.lastUpdateTime;
  gameState.lastUpdateTime = currentTime;

  // perf history
  // In animate() function, comment out or remove these lines around line 620-630:
// gameState.frameTimeHistory.push(frameTime);
// if (gameState.frameTimeHistory.length > 60) gameState.frameTimeHistory.shift();
// if (gameState.frameTimeHistory.length >= 10) {
//     gameState.averageFrameTime = 
//         gameState.frameTimeHistory.reduce((a, b) => a + b) / gameState.frameTimeHistory.length;
// }
  if (currentTime - gameState.lastPerformanceCheck > 10000) {
    // adjustPerformanceBasedOnFrameTime(); // optional; currently disabled in your file
    gameState.lastPerformanceCheck = currentTime;
  }

  // early out when not started / game over
  if (gameState.gameOver || !gameState.gameStarted) {
    if (stars) {
      stars.rotation.x += 0.0001;
      stars.rotation.y += 0.0002;
    }
    renderer.render(scene, camera);
    return;
  }

  // ---- camera caches (avoid repeated getters) ----
  if (camera) {
    camera.getWorldPosition(_camPos);
    camera.getWorldDirection(_camFwd);
  }

  // ---- systems & cadence ----
  const warp = typeof window !== 'undefined' && !!window.warpInProgress;

  // target lock
  if (!warp && typeof updateTargetLock === 'function') {
    updateTargetLock();
  }

  // planets activation/LOD less frequently
  const planetUpdateFrequency = 5;  // Change from 30 back to 5
if (gameState.frameCount % 10 === 0 && typeof detectEnemiesInRegion === 'function') {
    detectEnemiesInRegion();
}

  // enemy detection cadence
  const enemyUpdateFrequency =
    gameState.performanceMode === 'minimal' ? 5 :
    gameState.performanceMode === 'optimized' ? 3 : 2;
  if (!warp &&
      gameState.frameCount % enemyUpdateFrequency === 0 &&
      typeof detectEnemiesInRegion === 'function') {
    detectEnemiesInRegion();
  }

  // enemy lasers every other frame
  if (!warp &&
      gameState.frameCount % 2 === 0 &&
      typeof updateEnemyLasers === 'function') {
    updateEnemyLasers();
  }

  // targets list occasionally
  if (!warp &&
      gameState.frameCount % 30 === 0 &&
      typeof populateTargets === 'function') {
    populateTargets();
  }

  // starfield rotation + throttled hyperspace effect
  if (stars) {
    const thrustIntensity = 0.0001;
    stars.rotation.x += thrustIntensity * 0.3;
    stars.rotation.y += thrustIntensity * 0.5;

    gameState.fx.hyperCooldown -= dt;
    const hyperReady = gameState.fx.hyperCooldown <= 0;
    if (typeof keys !== 'undefined' && keys.w && hyperReady && typeof createHyperspaceEffect === 'function') {
      createHyperspaceEffect();
      gameState.fx.hyperCooldown = gameState.performanceMode === 'minimal' ? 0.6 : 0.3; // seconds
    }
  }

  // orbit lines health check (don’t spam recreate)
  const orbitUpdateFrequency =
    gameState.performanceMode === 'minimal' ? 300 :
    gameState.performanceMode === 'optimized' ? 180 : 120;
  if (gameState.frameCount % orbitUpdateFrequency === 0) {
    if ((!orbitLines || orbitLines.length === 0) && planets.length > 0 && typeof createOrbitLines === 'function') {
      console.log('Orbit lines missing, force creating...');
      createOrbitLines();
    }
  }

  // ---- orbital mechanics (per-frame) ----
  if (typeof updatePlanetOrbits === 'function') {
    updatePlanetOrbits(); // uses gameState.time internally
  }

  // ---- active planets: effects only (tendrils, glows, active asteroids) ----
  if (Array.isArray(activePlanets) && activePlanets.length) {
    const t = gameState.time;

    activePlanets.forEach((planet) => {
      if (!planet || !planet.userData) return;

      // Active asteroid belts (use timebase instead of Date.now)
      if (planet.userData.type === 'asteroid' && planet.userData.beltCenter) {
        const timeScaled = t * (planet.userData.orbitSpeed || 1);
        const phase = planet.userData.orbitPhase || 0;
        const cx = planet.userData.beltCenter.x;
        const cy = planet.userData.beltCenter.y;
        const cz = planet.userData.beltCenter.z;

        const orbitX = cx + Math.cos(timeScaled + phase) * planet.userData.orbitRadius;
        const orbitZ = cz + Math.sin(timeScaled + phase) * planet.userData.orbitRadius;
        const orbitY = cy + Math.sin(timeScaled * 0.5 + phase) * 10;

        planet.position.set(orbitX, orbitY, orbitZ);

        if (planet.userData.rotationSpeed) {
          planet.rotation.x += planet.userData.rotationSpeed;
          planet.rotation.y += planet.userData.rotationSpeed * 0.7;
          planet.rotation.z += planet.userData.rotationSpeed * 0.4;
        }
      }

      // Distant star tendrils (throttled)
      if (planet.userData.tendrilGroup && !planet.userData.isLocalStar && gameState.frameCount % 10 === 0) {
        planet.userData.tendrilTime = (planet.userData.tendrilTime || 0) + 0.16; // compensate for skip
        const userTime = planet.userData.tendrilTime;

        planet.userData.tendrilGroup.children.forEach((tendril, idx) => {
          if (!tendril.userData) return;
          const ud = tendril.userData;

          ud.age = (ud.age || 0) + 167; // ~10 frames @ 60fps

          const newPoints = ud.originalPoints.map((p, i) => {
            const segT = i / (ud.originalPoints.length - 1);
            const wtime = userTime * ud.writheSpeed + ud.animationOffset;
            return new THREE.Vector3(
              p.x + Math.sin(wtime + segT * Math.PI * 2) * 4,
              p.y + Math.cos(wtime * 1.3 + segT * Math.PI * 3) * 6,
              p.z + Math.sin(wtime * 0.8 + segT * Math.PI * 4) * 4
            );
          });

          ud.curve = new THREE.CatmullRomCurve3(newPoints);
          const newGeometry = new THREE.TubeGeometry(ud.curve, 20, 1.6, 8, false);
          tendril.geometry.dispose();
          tendril.geometry = newGeometry;

          const fadeProgress = (ud.age) / (ud.lifeTime || 2000);
          if (fadeProgress < 1) {
            if (!tendril.material.transparent) tendril.material.transparent = true;
            tendril.material.opacity = 0.8 * (1 - fadeProgress);
            if ('emissiveIntensity' in tendril.material) {
              tendril.material.emissiveIntensity = 1.0 * (1 - fadeProgress);
            }
          } else {
            ud.age = 0;
            if (!tendril.material.transparent) tendril.material.transparent = true;
            tendril.material.opacity = 0.8;
            if ('emissiveIntensity' in tendril.material) {
              tendril.material.emissiveIntensity = 1.0;
            }
          }
        });
      }

      // Sun glow pulse (ensure transparency)
      if (planet.userData.glowSphere && gameState.frameCount % 2 === 0) {
        const m = planet.userData.glowSphere.material;
        if (m && !m.transparent) m.transparent = true;
        const pulse = 0.2 + Math.sin(t * 1.5) * 0.1;
        planet.userData.glowSphere.material.opacity = pulse;
        planet.userData.glowSphere.rotation.y += 0.005;
      }
    });
  }

  // ---- wormholes (safe reverse loop; uses timebase) ----
  if (Array.isArray(wormholes) && wormholes.length) {
    for (let i = wormholes.length - 1; i >= 0; i--) {
      const wh = wormholes[i];
      if (!wh || !wh.userData) { wormholes.splice(i, 1); continue; }

      if (wh.userData.spiralSpeed) {
        wh.rotation.y += wh.userData.spiralSpeed;
        if (gameState.frameCount % 2 === 0) {
          wh.children.forEach((child, idx) => {
            if (child.geometry?.type === 'TorusGeometry') {
              child.rotation.z += wh.userData.spiralSpeed * (1 + idx * 0.2);
            }
          });
        }
      }

      const pulseScale = 1 + Math.sin(gameState.time * 0.004 * 1000) * 0.15; // keep same feel
      wh.scale.set(pulseScale, pulseScale, pulseScale);

      const distanceToPlayer = wh.position.distanceTo(_camPos);

      if (distanceToPlayer < (wh.userData.detectionRange || 0) && !wh.userData.detected) {
        wh.userData.detected = true;
        if (typeof showAchievement === 'function') {
          showAchievement('Spatial Anomaly Detected', `${wh.userData.name} discovered!`);
        }
      }

      wh.userData.age = (wh.userData.age || 0) + (dt * 1000);
      if (wh.userData.lifeTime && wh.userData.age > wh.userData.lifeTime) {
        removeFromScene(wh);
        wormholes.splice(i, 1);
        continue;
      }

      if (distanceToPlayer < (wh.userData.warpThreshold || 0)) {
        if (typeof showAchievement === 'function') {
          showAchievement('Wormhole Transit', `Entering ${wh.userData.name}!`);
        }
        removeFromScene(wh);
        wormholes.splice(i, 1);
        if (typeof transitionToRandomLocation === 'function') {
          transitionToRandomLocation(wh.userData.name);
        }
      }
    }
  }

  // ---- comets (timebase + tail updates) ----
  if (Array.isArray(comets) && comets.length) {
    const t = gameState.time;
    comets.forEach((comet) => {
      if (!comet?.userData?.velocity) return;

      comet.position.add(comet.userData.velocity);

      if (comet.userData.tail && gameState.frameCount % 3 === 0) {
        const tailPositions = comet.userData.tail.geometry.attributes.position.array;
        for (let i = 0; i < tailPositions.length; i += 3) {
          const seg = (i / 3) * 1.6;
          tailPositions[i]   = -comet.userData.velocity.x * seg;
          tailPositions[i+1] = -comet.userData.velocity.y * seg;
          tailPositions[i+2] = -comet.userData.velocity.z * seg;
        }
        comet.userData.tail.geometry.attributes.position.needsUpdate = true;
      }

      const distanceToPlayer = comet.position.distanceTo(_camPos);
      const visibilityScale = Math.min(1, 2000 / Math.max(distanceToPlayer, 200));
      comet.scale.setScalar(visibilityScale * (1.5 + Math.sin(t * 0.003 * 1000) * 0.3));
    });
  }

  // ---- enemies, physics ----
  if (typeof updateEnemyBehavior === 'function') updateEnemyBehavior();
  if (typeof updateEnhancedPhysics === 'function') updateEnhancedPhysics();

  // ---- UI ----
  if (gameState.frameCount % 2 === 0) {
    if (typeof updateUI === 'function') updateUI();
    if (typeof updateCompass === 'function') updateCompass();
    if (typeof updateGalaxyMap === 'function') updateGalaxyMap();
  }
  if (gameState.frameCount % 3 === 0 && typeof updateCrosshairTargeting === 'function') {
    updateCrosshairTargeting();
  }

  // ---- render ----
  renderer.render(scene, camera);
}
     
    // Enhanced enemy behavior update
    if (typeof updateEnemyBehavior === 'function') {
        updateEnemyBehavior();
    }
    
    // Enhanced physics and controls for doubled world
    if (typeof updateEnhancedPhysics === 'function') {
        updateEnhancedPhysics();
    }
    
    // Update UI every few frames
    if (gameState.frameCount % 2 === 0) {
        if (typeof updateUI === 'function') updateUI();
        if (typeof updateCompass === 'function') updateCompass();
        if (typeof updateGalaxyMap === 'function') updateGalaxyMap();
    }

// Performance monitoring and auto-adjustment
function adjustPerformanceBasedOnFrameTime() {
    if (gameState.frameTimeHistory.length < 30) return; // Need enough samples
    
    const avgFrameTime = gameState.averageFrameTime;
    
    // FIXED: Much more reasonable thresholds - only warn at truly bad performance
    if (avgFrameTime > 50) { // Worse than 20 FPS
        console.warn(`Performance warning: ${avgFrameTime.toFixed(1)}ms frame time. Reducing quality...`);
        
        // Disable expensive visual effects
        activePlanets.forEach(planet => {
            if (planet.userData.tendrilGroup) {
                planet.userData.tendrilGroup.visible = false;
            }
        });
        
        // Reduce comet count
        if (typeof comets !== 'undefined' && comets.length > 10) {
            const cometsToRemove = comets.splice(10);
            cometsToRemove.forEach(comet => scene.remove(comet));
        }
        
        // Reduce star count
        if (stars && stars.geometry) {
            const currentCount = stars.geometry.attributes.position.count;
            if (currentCount > 5000) {
                const newPositions = new Float32Array(5000 * 3);
                const oldPositions = stars.geometry.attributes.position.array;
                for (let i = 0; i < newPositions.length; i++) {
                    newPositions[i] = oldPositions[i];
                }
                stars.geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
                console.log('Reduced star count for performance');
            }
        }
        
        gameState.performanceOptimized = true;
    }
}

function updatePlanetOrbits() {
    // Pause orbits when game is paused
    if (typeof gamePaused !== 'undefined' && gamePaused) {
        return;
    }
    
    planets.forEach((planet) => {
        // Skip if planet is destroyed or doesn't exist
        if (!planet || !planet.userData) return;
        
        // Basic planet rotation (for all planets) - FASTER
        if (planet.rotation && !planet.userData.isLocalStar) {
            planet.rotation.y += 0.02; // Increased from 0.01 to 0.02
        }
        
        // FIXED: Enhanced orbital mechanics for ALL planets with orbital data - ADJUSTED SPEEDS
        if (planet.userData.orbitRadius > 0 && planet.userData.systemCenter) {
            // ADJUSTED orbital speeds - 75% slower than previous version
            let baseSpeed = planet.userData.orbitSpeed || 0.015;
            
            // Apply speed multipliers based on planet type and location (reduced from previous)
            if (planet.userData.isLocal) {
                baseSpeed *= 3.75; // Reduced from 15x to 3.75x (75% slower)
            } else {
                baseSpeed *= 5; // Reduced from 20x to 5x (75% slower)
            }
            
            // Additional speed boost for smaller orbits (closer planets should move faster)
            const orbitSpeedBoost = Math.max(1, 500 / planet.userData.orbitRadius);
            baseSpeed *= orbitSpeedBoost;
            
            const time = Date.now() * 0.001 * baseSpeed;
            const orbitPhase = planet.userData.orbitPhase || 0;
            
            const orbitX = planet.userData.systemCenter.x + Math.cos(time + orbitPhase) * planet.userData.orbitRadius;
            const orbitZ = planet.userData.systemCenter.z + Math.sin(time + orbitPhase) * planet.userData.orbitRadius;
            
            // FIXED: Smaller vertical oscillation for distant planets
            const verticalOscillation = planet.userData.isLocal ? 6 : 3;
            const orbitY = planet.userData.systemCenter.y + Math.sin(time * 0.3 + orbitPhase) * verticalOscillation;
            
            planet.position.set(orbitX, orbitY, orbitZ);
            
            // Debug logging for verification (only for first few frames and when close)
            const distanceToPlayer = camera.position.distanceTo(planet.position);
            if (gameState.frameCount < 100 && gameState.frameCount % 30 === 0 && distanceToPlayer < 2000) {
                console.log(`Adjusted orbit update: ${planet.userData.name} at speed ${baseSpeed.toFixed(4)}`);
            }
        } 
        // FIXED: Moon orbital mechanics (relative to parent planet) - ADJUSTED SPEEDS
else if (planet.userData.parentPlanet && planet.userData.orbitRadius > 0) {
    // Ensure moon is always visible
    planet.visible = true;
    planet.frustumCulled = false;
    
    let moonSpeed = planet.userData.orbitSpeed || 0.1;
    moonSpeed *= 6.25; // Reduced from 25x to 6.25x (75% slower)
    
    const time = Date.now() * 0.001 * moonSpeed;
    const orbitPhase = planet.userData.orbitPhase || 0;
    const moonX = Math.cos(time + orbitPhase) * planet.userData.orbitRadius;
    const moonZ = Math.sin(time + orbitPhase) * planet.userData.orbitRadius;
    const moonY = Math.sin(time * 0.5 + orbitPhase) * 4; // Doubled
    
    // Position relative to parent planet's current position
    if (planet.userData.parentPlanet.position) {
        const parentPos = planet.userData.parentPlanet.position;
        planet.position.set(parentPos.x + moonX, parentPos.y + moonY, parentPos.z + moonZ);
    }
}
    });
}

// =============================================================================
// DIAGNOSTIC AND DEBUG FUNCTIONS
// =============================================================================

// Make functions globally available for debugging
if (typeof window !== 'undefined') {
    window.gameState = gameState;
    window.forceCreateOrbitLines = forceCreateOrbitLines;
    window.toggleOrbitLines = toggleOrbitLines;
    window.updatePlanetOrbits = updatePlanetOrbits;
    window.isPositionTooClose = isPositionTooClose;
    
    window.debugInfo = {
        planets: () => planets.length,
        activePlanets: () => activePlanets.length,
        enemies: () => typeof enemies !== 'undefined' ? enemies.length : 0,
        comets: () => typeof comets !== 'undefined' ? comets.length : 0,
        wormholes: () => typeof wormholes !== 'undefined' ? wormholes.length : 0,
        orbitLines: () => orbitLines.length,
        orbitLinesVisible: () => orbitLinesVisible,
        performance: () => ({
            frameCount: gameState.frameCount,
            velocity: gameState.velocity,
            worldScale: 'DOUBLED',
            performanceMode: gameState.performanceMode,
            averageFrameTime: gameState.averageFrameTime.toFixed(1) + 'ms'
        }),
        setPerformanceMode: (mode) => {
            if (['normal', 'optimized', 'minimal'].includes(mode)) {
                gameState.performanceMode = mode;
                console.log('Performance mode set to:', mode);
            }
        },
        recreateOrbits: () => {
            forceCreateOrbitLines();
        }
    };
}

console.log('Enhanced Interstellar Slingshot core loaded successfully - CLEANED AND OPTIMIZED!');