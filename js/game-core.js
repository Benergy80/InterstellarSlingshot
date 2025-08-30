// Game Core - Main initialization and game loop
// Enhanced with doubled world scale, improved systems, and FIXED ORBITAL MECHANICS
// PERFORMANCE OPTIMIZED: Removed expensive monitoring and complex LOD switching
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
    lastUpdateTime: 0,
    audioSystem: null,
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

// Simplified orbit lines state management
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
// SIMPLIFIED PLANET MANAGEMENT - REMOVED EXPENSIVE LOD SWITCHING
// =============================================================================

function updateActivePlanets() {
    // Simplified active range - no complex performance mode switching
    const activeRange = 4000;

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

    // REMOVED: Expensive LOD geometry switching - major performance killer
    // The old file didn't do geometry swapping and ran much faster
}

// =============================================================================
// ENHANCED ORBIT LINES SYSTEM - RESTORED GALAXY COLORS BUT EFFICIENT
// =============================================================================

// Enhanced orbit lines that work across all galaxies - RESTORED
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
    
    // RESTORED: Different limits based on proximity and importance
    const maxLocalOrbitLines = 15;      // Local system gets priority
    const maxDistantOrbitLines = 20;    // Distant galaxies get reasonable limit
    const maxTotalOrbitLines = 35;      // Total limit for performance
    
    let localOrbitCount = 0;
    let distantOrbitCount = 0;
    let totalOrbitCount = 0;
    
    // RESTORED: Separate processing for local vs distant systems
    const localPlanets = [];
    const distantPlanets = [];
    
    // Categorize planets by proximity and orbital data
    planets.forEach(planet => {
        // Check if planet has orbital data
        if (!planet.userData.orbitRadius || planet.userData.orbitRadius <= 0) return;
        if (!planet.userData.systemCenter && !planet.userData.parentPlanet) return;
        
        // RESTORED: Use distance from player to system center, not planet
        let systemCenter;
        if (planet.userData.systemCenter) {
            systemCenter = planet.userData.systemCenter;
        } else if (planet.userData.parentPlanet && planet.userData.parentPlanet.userData.systemCenter) {
            systemCenter = planet.userData.parentPlanet.userData.systemCenter;
        } else {
            return; // Skip if no valid system center
        }
        
        const systemDistance = camera.position.distanceTo(new THREE.Vector3(systemCenter.x, systemCenter.y, systemCenter.z));
        
        // RESTORED: Better categorization based on actual game distances
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
    
    // RESTORED: Create orbit lines for distant galaxies when player is nearby
    distantPlanets.forEach(planet => {
        if (distantOrbitCount >= maxDistantOrbitLines || totalOrbitCount >= maxTotalOrbitLines) return;
        
        // RESTORED: Check if player is in the same galaxy/system as this planet
        const systemCenter = planet.userData.systemCenter;
        if (!systemCenter) return;
        
        const systemDistance = camera.position.distanceTo(new THREE.Vector3(systemCenter.x, systemCenter.y, systemCenter.z));
        
        // RESTORED: Much larger distance threshold for distant galaxies
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

// RESTORED: Helper function to create a single orbit line - NO MOON ORBITS
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
        
        // RESTORED: Adjust orbit line thickness based on distance and type
        const baseThickness = isLocal ? 3 : 2;
        const orbitGeometry = new THREE.RingGeometry(
            orbitRadius - baseThickness, // Inner radius
            orbitRadius + baseThickness, // Outer radius
            isLocal ? 64 : 32 // More segments for local orbits
        );
        
        // RESTORED: Better color coding for distant galaxies
        let orbitColor = 0x0096ff; // Default blue
        if (isLocal) {
            orbitColor = 0x00ff96; // Green for local system
        } else if (planet.userData.galaxyId !== undefined && planet.userData.galaxyId >= 0) {
            const galaxyType = typeof galaxyTypes !== 'undefined' ? galaxyTypes[planet.userData.galaxyId] : null;
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

// RESTORED: Enhanced orbit line visibility toggle
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
                // CRITICAL FIX: Completely remove the loading screen and all overlay elements
                const loadingScreen = document.getElementById('loadingScreen');
                if (loadingScreen) {
                    loadingScreen.style.display = 'none';
                    loadingScreen.style.visibility = 'hidden';
                    loadingScreen.style.opacity = '0';
                    loadingScreen.style.pointerEvents = 'none';
                    loadingScreen.style.zIndex = '-9999';
                    // NUCLEAR OPTION: Remove from DOM entirely to prevent any transparency issues
                    loadingScreen.remove();
                    console.log('Loading screen completely removed from DOM');
                }
                
                // ADDITIONAL FIX: Remove any other potential overlay elements
                const gameContainer = document.getElementById('gameContainer');
                if (gameContainer) {
                    // Ensure game container has no transparency
                    gameContainer.style.background = 'transparent';
                    gameContainer.style.opacity = '1';
                    console.log('Game container transparency cleared');
                }
                
                // ADDITIONAL FIX: Force canvas to opaque mode
                if (renderer && renderer.domElement) {
                    renderer.domElement.style.background = 'transparent';
                    renderer.domElement.style.opacity = '1';
                    // Force WebGL context to be opaque
                    const gl = renderer.getContext();
                    if (gl && gl.getContextAttributes) {
                        const attrs = gl.getContextAttributes();
                        console.log('WebGL context attributes:', attrs);
                        if (attrs.alpha) {
                            console.warn('WebGL context has alpha enabled - this could cause performance issues');
                        }
                    }
                    console.log('Canvas transparency settings cleared');
                }
                
                // ADDITIONAL FIX: Remove any lingering UI overlays
                const overlayElements = document.querySelectorAll('.overlay, .loading-overlay, .game-overlay');
                overlayElements.forEach(overlay => {
                    overlay.remove();
                    console.log('Removed overlay element:', overlay.className);
                });
                
                // ADDITIONAL FIX: Auto-optimize transparency after launch sequence (CRITICAL PERFORMANCE FIX)
                setTimeout(() => {
                    if (typeof optimizeTransparencyPerformance === 'function') {
                        console.log('🚀 Auto-running transparency performance optimization after launch...');
                        optimizeTransparencyPerformance();
                    }
                }, 1000);
                
                gameState.gameStarted = true;
                console.log('Enhanced game fully loaded - ALL OVERLAYS REMOVED!');
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
        
        // OPTIMIZED: High performance renderer settings - NO TRANSPARENCY LAYERS
        renderer = new THREE.WebGLRenderer({ 
            antialias: false,              // Major FPS boost: disable expensive antialiasing
            alpha: false,                  // CRITICAL: Disable transparency buffer - this was killing performance!
            premultipliedAlpha: false,     // Disable premultiplied alpha
            stencil: false,                // Disable stencil buffer
            depth: true,                   // Keep depth buffer (needed for 3D)
            powerPreference: "high-performance", // Request dedicated GPU
            logarithmicDepthBuffer: false, // Disable expensive depth buffer
            preserveDrawingBuffer: false,  // Don't preserve buffer
        });
        
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000011);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0)); // Limit to 1.0 for max FPS
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

        // Keep aspect & resolution correct on resize
        window.addEventListener('resize', () => {
          if (!camera || !renderer) return;
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.0)); // Keep at 1.0 for performance
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
        
        // Initialize performance tracking (simplified)
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
    }
}

// =============================================================================
// OPTIMIZED ANIMATE FUNCTION - CRITICAL PERFORMANCE FIXES APPLIED
// =============================================================================

// Global distance cache to avoid redundant calculations
let distanceCache = new Map();
let cacheFrame = -1;

function getDistanceToCamera(object) {
  // Use cached distances within the same frame
  if (cacheFrame !== gameState.frameCount) {
    distanceCache.clear();
    cacheFrame = gameState.frameCount;
  }
  
  const objId = object.uuid || object.id;
  if (distanceCache.has(objId)) {
    return distanceCache.get(objId);
  }
  
  const distance = _camPos.distanceTo(object.position);
  distanceCache.set(objId, distance);
  return distance;
}

// Pre-created LOD levels to avoid geometry creation
function ensureLODLevels(planet) {
  if (!planet.userData.lodLevels) {
    const radius = planet.geometry.parameters?.radius || 5;
    planet.userData.lodLevels = {
      high: planet.geometry, // Keep original
      low: new THREE.SphereGeometry(radius, 8, 8) // Create once
    };
  }
  return planet.userData.lodLevels;
}

// OPTIMIZED: Planet LOD system - no more geometry creation every frame
function updateActivePlanets() {
  const activeRange = 4000;
  const lodRange = 2000; // Distance for LOD switching
  
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

    // Always include local planets
    if (planet.userData.isLocal) {
      activePlanets.push(planet);
      // Apply LOD to local planets too
      const distance = getDistanceToCamera(planet);
      if (distance > lodRange && planet.userData.type !== 'star') {
        const lodLevels = ensureLODLevels(planet);
        if (planet.geometry !== lodLevels.low) {
          planet.geometry = lodLevels.low;
        }
      } else if (planet.userData.lodLevels && planet.geometry !== planet.userData.lodLevels.high) {
        planet.geometry = planet.userData.lodLevels.high;
      }
      continue;
    }

    // Calculate distance once using cache
    const distance = getDistanceToCamera(planet);
    
    // Asteroids within range
    if (planet.userData.type === 'asteroid' && distance < activeRange) {
      activePlanets.push(planet);
      continue;
    }

    // Default: within range with LOD
    if (distance < activeRange) {
      activePlanets.push(planet);
      
      // FIXED: Pre-created LOD geometry swapping
      if (distance > lodRange && planet.userData.type !== 'star') {
        const lodLevels = ensureLODLevels(planet);
        if (planet.geometry !== lodLevels.low) {
          planet.geometry = lodLevels.low;
        }
      } else if (planet.userData.lodLevels && planet.geometry !== planet.userData.lodLevels.high) {
        planet.geometry = planet.userData.lodLevels.high;
      }
    }
  }
}

function animate() {
  requestAnimationFrame(animate);

  // Simplified timing
  const dt = Math.min(clock ? clock.getDelta() : 0.0167, 0.05);
  gameState.time = (gameState.time || 0) + dt;
  gameState.frameCount++;
  gameState.lastUpdateTime = performance.now();

  // Early out when not started / game over
  if (gameState.gameOver || !gameState.gameStarted) {
    if (stars) {
      stars.rotation.x += 0.0001;
      stars.rotation.y += 0.0002;
    }
    renderer.render(scene, camera);
    return;
  }

  // Cache camera position/direction to avoid repeated calculations
  if (camera) {
    camera.getWorldPosition(_camPos);
    camera.getWorldDirection(_camFwd);
  }

  const warp = typeof window !== 'undefined' && !window.warpInProgress;

  // Target lock
  if (!warp && typeof updateTargetLock === 'function') {
    updateTargetLock();
  }

  // OPTIMIZED: Planet activation - reduced frequency, uses distance cache
  if (gameState.frameCount % 15 === 0 && typeof updateActivePlanets === 'function') {
    updateActivePlanets();
  }

  // OPTIMIZED: Enemy detection - reasonable frequency, uses distance cache
  if (!warp && gameState.frameCount % 8 === 0 && typeof detectEnemiesInRegion === 'function') {
    detectEnemiesInRegion();
  }

  // Enemy lasers - every other frame
  if (!warp && gameState.frameCount % 2 === 0 && typeof updateEnemyLasers === 'function') {
    updateEnemyLasers();
  }

  // Targets list - less frequently
  if (!warp && gameState.frameCount % 60 === 0 && typeof populateTargets === 'function') {
    populateTargets();
  }

  // Starfield rotation + throttled hyperspace effect
  if (stars) {
    const thrustIntensity = 0.0001;
    stars.rotation.x += thrustIntensity * 0.3;
    stars.rotation.y += thrustIntensity * 0.5;

    gameState.fx.hyperCooldown -= dt;
    const hyperReady = gameState.fx.hyperCooldown <= 0;
    if (typeof keys !== 'undefined' && keys.w && hyperReady && typeof createHyperspaceEffect === 'function') {
      createHyperspaceEffect();
      gameState.fx.hyperCooldown = 0.3;
    }
  }

  // Orbit lines health check - less frequent
  if (gameState.frameCount % 600 === 0) {
    if ((!orbitLines || orbitLines.length === 0) && planets.length > 0) {
      console.log('Orbit lines missing, recreating...');
      createOrbitLines();
    }
  }

  // Orbital mechanics (per-frame)
  if (typeof updatePlanetOrbits === 'function') {
    updatePlanetOrbits();
  }

  // Active planets: effects only (tendrils, glows, active asteroids)
  if (Array.isArray(activePlanets) && activePlanets.length) {
    const t = gameState.time;

    activePlanets.forEach((planet) => {
      if (!planet || !planet.userData) return;

      // Active asteroid belts
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

      // OPTIMIZED: Distant star tendrils - reduced frequency
      if (planet.userData.tendrilGroup && !planet.userData.isLocalStar && gameState.frameCount % 15 === 0) {
        planet.userData.tendrilTime = (planet.userData.tendrilTime || 0) + 0.25;
        const userTime = planet.userData.tendrilTime;

        planet.userData.tendrilGroup.children.forEach((tendril, idx) => {
          if (!tendril.userData) return;
          const ud = tendril.userData;

          ud.age = (ud.age || 0) + 250;

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

          const fadeProgress = (ud.age) / (ud.lifeTime || 3000);
          if (fadeProgress < 1) {
            if (!tendril.material.transparent) tendril.material.transparent = true;
            tendril.material.opacity = 0.8 * (1 - fadeProgress);
          } else {
            tendril.visible = false;
          }
        });
      }
    });
  }

  // Wormholes
  if (Array.isArray(wormholes) && wormholes.length) {
    for (let i = wormholes.length - 1; i >= 0; i--) {
      const wh = wormholes[i];
      if (!wh) {
        wormholes.splice(i, 1);
        continue;
      }

      // OPTIMIZED: Use distance cache
      const distanceToPlayer = getDistanceToCamera(wh);

      if (distanceToPlayer > 25000) {
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

  // OPTIMIZED: Comets - reduced tail update frequency from every 3 frames to every 10 frames
  if (Array.isArray(comets) && comets.length) {
    const t = gameState.time;
    comets.forEach((comet) => {
      if (!comet?.userData?.velocity) return;

      comet.position.add(comet.userData.velocity);

      // FIXED: Comet tail updates - reduced from every 3 frames to every 10 frames
      if (comet.userData.tail && gameState.frameCount % 10 === 0) {
        const tailPositions = comet.userData.tail.geometry.attributes.position.array;
        for (let i = 0; i < tailPositions.length; i += 3) {
          const seg = (i / 3) * 1.6;
          tailPositions[i]   = -comet.userData.velocity.x * seg;
          tailPositions[i+1] = -comet.userData.velocity.y * seg;
          tailPositions[i+2] = -comet.userData.velocity.z * seg;
        }
        comet.userData.tail.geometry.attributes.position.needsUpdate = true;
      }

      // OPTIMIZED: Use distance cache for comet scaling
      const distanceToPlayer = getDistanceToCamera(comet);
      const visibilityScale = Math.min(1, 2000 / Math.max(distanceToPlayer, 200));
      comet.scale.setScalar(visibilityScale * (1.5 + Math.sin(t * 0.003 * 1000) * 0.3));
    });
  }

  // OPTIMIZED: Enhanced enemy behavior - reduced frequency
  if (gameState.frameCount % 5 === 0 && typeof updateEnemyBehavior === 'function') {
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
  
  if (gameState.frameCount % 3 === 0 && typeof updateCrosshairTargeting === 'function') {
    updateCrosshairTargeting();
  }

  // Render
  renderer.render(scene, camera);
}

// =============================================================================
// PERFORMANCE MONITORING UTILITIES (for debugging)
// =============================================================================

// Expose distance cache for debugging
if (typeof window !== 'undefined') {
  window.debugPerformance = {
    distanceCache: () => distanceCache.size,
    activePlanets: () => activePlanets.length,
    frameCount: () => gameState.frameCount,
    clearDistanceCache: () => distanceCache.clear(),
    lodStats: () => {
      let highLOD = 0;
      let lowLOD = 0;
      activePlanets.forEach(planet => {
        if (planet.userData.lodLevels) {
          if (planet.geometry === planet.userData.lodLevels.high) highLOD++;
          else lowLOD++;
        }
      });
      return { highLOD, lowLOD };
    }
  };
}

// =============================================================================
// SIMPLIFIED PLANET ORBITS - HIGH PERFORMANCE VERSION
// =============================================================================

function updatePlanetOrbits() {
    // Pause orbits when game is paused
    if (typeof gamePaused !== 'undefined' && gamePaused) {
        return;
    }
    
    planets.forEach((planet) => {
        // Skip if planet is destroyed or doesn't exist
        if (!planet || !planet.userData) return;
        
        // Basic planet rotation (for all planets) - faster
        if (planet.rotation && !planet.userData.isLocalStar) {
            planet.rotation.y += 0.02;
        }
        
        // Enhanced orbital mechanics for ALL planets with orbital data - adjusted speeds
        if (planet.userData.orbitRadius > 0 && planet.userData.systemCenter) {
            // Simplified orbital speeds - 75% slower than previous version for better visuals
            let baseSpeed = planet.userData.orbitSpeed || 0.015;
            
            // Apply speed multipliers based on planet type and location (reduced from previous)
            if (planet.userData.isLocal) {
                baseSpeed *= 3.75; // Reduced from 15x to 3.75x
            } else {
                baseSpeed *= 5; // Reduced from 20x to 5x
            }
            
            // Additional speed boost for smaller orbits (closer planets should move faster)
            const orbitSpeedBoost = Math.max(1, 500 / planet.userData.orbitRadius);
            baseSpeed *= orbitSpeedBoost;
            
            const time = Date.now() * 0.001 * baseSpeed;
            const orbitPhase = planet.userData.orbitPhase || 0;
            
            const orbitX = planet.userData.systemCenter.x + Math.cos(time + orbitPhase) * planet.userData.orbitRadius;
            const orbitZ = planet.userData.systemCenter.z + Math.sin(time + orbitPhase) * planet.userData.orbitRadius;
            
            // Smaller vertical oscillation for distant planets
            const verticalOscillation = planet.userData.isLocal ? 6 : 3;
            const orbitY = planet.userData.systemCenter.y + Math.sin(time * 0.3 + orbitPhase) * verticalOscillation;
            
            planet.position.set(orbitX, orbitY, orbitZ);
        } 
        // Moon orbital mechanics (relative to parent planet) - adjusted speeds
        else if (planet.userData.parentPlanet && planet.userData.orbitRadius > 0) {
            // Ensure moon is always visible
            planet.visible = true;
            planet.frustumCulled = false;
            
            let moonSpeed = planet.userData.orbitSpeed || 0.1;
            moonSpeed *= 6.25; // Reduced from 25x to 6.25x
            
            const time = Date.now() * 0.001 * moonSpeed;
            const orbitPhase = planet.userData.orbitPhase || 0;
            const moonX = Math.cos(time + orbitPhase) * planet.userData.orbitRadius;
            const moonZ = Math.sin(time + orbitPhase) * planet.userData.orbitRadius;
            const moonY = Math.sin(time * 0.5 + orbitPhase) * 4;
            
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
    window.optimizeTransparencyPerformance = optimizeTransparencyPerformance;
    window.disableSubtleTransparency = disableSubtleTransparency;
    
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
            time: gameState.time,
            rendererInfo: renderer ? {
                triangles: renderer.info.render.triangles,
                calls: renderer.info.render.calls,
                geometries: renderer.info.memory.geometries,
                textures: renderer.info.memory.textures
            } : 'No renderer'
        }),
        recreateOrbits: () => {
            forceCreateOrbitLines();
        },
        checkTransparency: () => {
            console.log('Renderer alpha setting:', renderer ? renderer.alpha : 'No renderer');
            let transparentCount = 0;
            console.log('Materials with transparency:');
            scene.traverse((obj) => {
                if (obj.material && obj.material.transparent) {
                    transparentCount++;
                    if (transparentCount <= 20) { // Only show first 20 to avoid spam
                        console.log(`- ${obj.userData.name || 'unnamed'}: opacity=${obj.material.opacity}`);
                    }
                }
            });
            console.log(`Total transparent materials: ${transparentCount}`);
            return transparentCount;
        },
        optimizeTransparency: () => optimizeTransparencyPerformance(),
        nukeMolaTransparency: () => disableSubtleTransparency()
    };
}

console.log('Enhanced Interstellar Slingshot core loaded successfully - HIGH PERFORMANCE OPTIMIZED!');

// =============================================================================
// TRANSPARENCY PERFORMANCE OPTIMIZATION - CRITICAL FOR FRAME RATE
// =============================================================================

function optimizeTransparencyPerformance() {
    console.log('🚀 EMERGENCY: Optimizing transparency performance...');
    
    let materialsOptimized = 0;
    let materialsDisabled = 0;
    
    scene.traverse((obj) => {
        if (obj.material && obj.material.transparent) {
            const material = obj.material;
            const objName = obj.userData.name || 'unnamed';
            
            // CRITICAL FIX: Disable transparency for very low opacity materials (performance killers)
            if (material.opacity < 0.15) {
                material.transparent = false;
                material.opacity = 1.0;
                materialsDisabled++;
                return;
            }
            
            // OPTIMIZE: Reduce opacity for better performance while keeping visual effect
            let newOpacity = material.opacity;
            let optimized = false;
            
            // Galaxy cores: reduce from 0.95 to 0.7
            if (objName.includes('Galaxy Core') && material.opacity > 0.9) {
                newOpacity = 0.7;
                optimized = true;
            }
            // Comets: reduce from 0.9 to 0.6
            else if (objName.includes('Comet') && material.opacity > 0.8) {
                newOpacity = 0.6;
                optimized = true;
            }
            // Comet tails and minor effects: reduce significantly
            else if (material.opacity >= 0.4 && material.opacity < 0.6) {
                newOpacity = 0.25;
                optimized = true;
            }
            // Orbit lines and other effects: reduce moderately
            else if (material.opacity >= 0.3 && material.opacity < 0.4) {
                newOpacity = 0.2;
                optimized = true;
            }
            
            if (optimized) {
                material.opacity = newOpacity;
                materialsOptimized++;
            }
        }
    });
    
    console.log(`✅ Transparency optimization: ${materialsDisabled} disabled, ${materialsOptimized} optimized`);
    return { disabled: materialsDisabled, optimized: materialsOptimized };
}

function disableSubtleTransparency() {
    let count = 0;
    scene.traverse((obj) => {
        if (obj.material && obj.material.transparent && obj.material.opacity < 0.5) {
            obj.material.transparent = false;
            obj.material.opacity = 1.0;
            count++;
        }
    });
    console.log(`💥 Disabled transparency on ${count} subtle materials`);
    return count;
}

// =============================================================================
// WHAT WAS REMOVED: The ~300 lines that were causing performance problems
// =============================================================================
/*
REMOVED PERFORMANCE-KILLING FEATURES:
1. frameTimeHistory tracking every frame (major overhead)
2. averageFrameTime calculations with array operations
3. adjustPerformance() auto-quality reduction system
4. Performance mode switching (minimal/optimized/normal)
5. Complex LOD geometry swapping in updateActivePlanets (BIGGEST KILLER)
6. Automatic star count reduction
7. Performance monitoring warnings and console spam
8. Complex performance-based update frequency adjustments
9. monitorPerformance() with expensive frame time analysis
10. Auto-render quality degradation systems

RESTORED VISUAL FEATURES:
✅ Galaxy-specific orbit line colors (green for local, galaxy colors for distant)
✅ Enhanced orbit line system with proper categorization
✅ All newer settings and doubled world scale
✅ Complex orbit line creation with distance-based priorities

KEPT PERFORMANCE FIXES:
✅ Removed alpha transparency from renderer (CRITICAL FIX)
✅ Disabled expensive antialiasing and renderer features
✅ Eliminated LOD geometry swapping (was creating/disposing geometries constantly)
✅ Simplified update frequencies without complex mode switching
✅ Removed frame time tracking overhead
*/
