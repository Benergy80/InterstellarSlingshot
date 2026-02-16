// Game Core - Main initialization and game loop

console.log('Interstellar Slingshot starting...');

// =============================================================================
// CORE GAME STATE - SINGLE INITIALIZATION POINT
// =============================================================================

const gameState = {
    velocity: 0,
    distance: 0,
    energy: 100,
    hull: 100,
    maxHull: 100,
    location: 'Local Galaxy',
    paused: false, 
    muted: false,  
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
    warping: false,
    isBlackHoleWarping: false,
    maxEnergy: 100,
    solarStormBoostActive: false,
    solarStormBoostEndTime: 0,
    tenSecondWarningShown: false,
    plasmaStormBoostActive: false,          // â­ NEW
    plasmaStormBoostEndTime: 0,             // â­ NEW
    plasmaTenSecondWarningShown: false,     // â­ NEW
    shipMass: 2.0, // Doubled mass for doubled world
    baseSpeed: 0.2, // Doubled for doubled world
    thrustPower: 0.01, // Doubled for doubled world
    wThrustMultiplier: 2.0, // W key gets 2x thrust
    minVelocity: 0.2, // Doubled for doubled world
    maxVelocity: 2.0, // Doubled for doubled world
    mapMode: 'galactic',
    mapView: 'galactic', // 'galactic', 'universal'
    galaxiesCleared: 0,
    currentGalaxyEnemies: {}, // Initialize as empty object
    mouseAiming: true,  // Start with mouse aiming enabled
    mouseX: (typeof window !== 'undefined') ? window.innerWidth / 2 : 400,
    mouseY: (typeof window !== 'undefined') ? window.innerHeight / 2 : 300,
    crosshairX: (typeof window !== 'undefined') ? window.innerWidth / 2 : 400,
    crosshairY: (typeof window !== 'undefined') ? window.innerHeight / 2 : 300,
    targetLock: {
        active: false,
        target: null,
        range: 600, // Increased for better target acquisition
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
        duration: 24000, // 3x emergency warp duration (8000ms * 3)
        accelerationPhase: 10000,
        maintainPhase: 10000,
        postSlingshot: false,
        inertiaDecay: 0.9999, // Match emergency warp behavior (coast on momentum)
        fromBlackHole: false // Track if current slingshot is from black hole (for invulnerability)
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
        boostDuration: 15000,  // 15 seconds for debugging (was 8000)
        boostSpeed: 100.0,     // Much faster for debugging (was 30.0)
        active: false,
        timeRemaining: 0
    },
    weapons: {
        armed: true,
        energy: 100,
        cooldown: 0
    },
    missiles: {
        current: 3,
        capacity: 3,
        cooldown: 0,
        cooldownTime: 1000,
        damage: 3,
        speed: 5.0,
        selected: false
    },
    borg: {
        spawned: false,
        active: false,
        cube: null,
        drones: [],
        lastCommunication: 0,
        communicationCooldown: 15000 // 15 seconds between messages
    },
    frameCount: 0,
    lastUpdateTime: 0,
    audioSystem: null,
    // PERFORMANCE: Add performance tracking
    performanceMode: 'normal', // 'normal', 'optimized', 'minimal'
    lastPerformanceCheck: 0,
    averageFrameTime: 16.67, // Target 60 FPS
    frameTimeHistory: [],
    // Initialize velocity vector to prevent errors
    velocityVector: null // Will be set to THREE.Vector3 in startGame()
    
};

// =============================================================================
// PERFORMANCE DEBUG SYSTEM - Track lag near twin cores
// =============================================================================

const perfDebug = {
    enabled: true,
    logInterval: 60,        // Log every N frames
    frameCount: 0,
    lastLogTime: 0,
    
    // FPS tracking
    fps: 0,
    frameTimeMs: 0,
    worstFrameTime: 0,
    avgFrameTime: 0,
    frameHistory: [],
    
    // Position tracking
    distanceFromOrigin: 0,
    inTwinCoresZone: false,
    twinCoresThreshold: 2000,  // Distance where lag starts
    
    // Function timing (in ms)
    timings: {
        physics: 0,
        enemies: 0,
        nebulas: 0,
        orbits: 0,
        render: 0,
        total: 0
    },
    
    // Object counts
    counts: {
        enemies: 0,
        nebulas: 0,
        planets: 0,
        ships: 0,
        asteroids: 0,
        particles: 0
    },
    
    // Zone change tracking
    lastZone: 'unknown',
    zoneChangeTime: 0,
    
    // Start timing a section
    startTimer: function(section) {
        this._timers = this._timers || {};
        this._timers[section] = performance.now();
    },
    
    // End timing and record
    endTimer: function(section) {
        if (this._timers && this._timers[section]) {
            this.timings[section] = performance.now() - this._timers[section];
        }
    },
    
    // Update counts
    updateCounts: function() {
        this.counts.enemies = (typeof enemies !== 'undefined') ? enemies.filter(e => e && e.userData && e.userData.health > 0).length : 0;
        this.counts.nebulas = (typeof nebulaClouds !== 'undefined') ? nebulaClouds.length : 0;
        this.counts.planets = (typeof planets !== 'undefined') ? planets.length : 0;
        this.counts.ships = (typeof tradingShips !== 'undefined') ? tradingShips.length : 0;
        this.counts.asteroids = (typeof asteroidBelts !== 'undefined') ? 
            asteroidBelts.reduce((total, belt) => total + (belt.children ? belt.children.length : 0), 0) : 0;
    },
    
    // Main update function - call once per frame
    update: function(camera) {
        if (!this.enabled) return;
        
        const now = performance.now();
        this.frameCount++;
        
        // Calculate frame time
        if (this.lastLogTime > 0) {
            this.frameTimeMs = now - this.lastLogTime;
            this.frameHistory.push(this.frameTimeMs);
            if (this.frameHistory.length > 60) this.frameHistory.shift();
            
            // Track worst frame
            if (this.frameTimeMs > this.worstFrameTime) {
                this.worstFrameTime = this.frameTimeMs;
            }
        }
        
        // Calculate FPS and averages
        if (this.frameHistory.length > 0) {
            this.avgFrameTime = this.frameHistory.reduce((a, b) => a + b) / this.frameHistory.length;
            this.fps = 1000 / this.avgFrameTime;
        }
        
        // Track distance from origin (twin cores)
        if (camera && camera.position) {
            this.distanceFromOrigin = camera.position.length();
            const wasInZone = this.inTwinCoresZone;
            this.inTwinCoresZone = this.distanceFromOrigin < this.twinCoresThreshold;
            
            // Detect zone change
            const currentZone = this.inTwinCoresZone ? 'TWIN_CORES' : 'OUTER_SPACE';
            if (currentZone !== this.lastZone) {
                this.zoneChangeTime = now;
                console.log(`%c🚀 ZONE CHANGE: ${this.lastZone} → ${currentZone} at distance ${this.distanceFromOrigin.toFixed(0)}`, 
                    'color: yellow; font-weight: bold; font-size: 14px;');
                console.log(`   Position: (${camera.position.x.toFixed(0)}, ${camera.position.y.toFixed(0)}, ${camera.position.z.toFixed(0)})`);
                this.lastZone = currentZone;
                this.worstFrameTime = 0; // Reset worst frame on zone change
            }
        }
        
        this.lastLogTime = now;
        
        // Periodic detailed logging
        if (this.frameCount % this.logInterval === 0) {
            this.updateCounts();
            this.logStatus();
        }
    },
    
    // Log current status to console
    logStatus: function() {
        const zoneColor = this.inTwinCoresZone ? 'color: red; font-weight: bold;' : 'color: green;';
        const fpsColor = this.fps < 30 ? 'color: red; font-weight: bold;' : (this.fps < 50 ? 'color: orange;' : 'color: lime;');
        
        console.log(
            `%c📊 PERF [${this.inTwinCoresZone ? '⚠️ TWIN CORES' : '✅ OUTER SPACE'}] ` +
            `FPS: ${this.fps.toFixed(1)} | Frame: ${this.avgFrameTime.toFixed(1)}ms | Worst: ${this.worstFrameTime.toFixed(1)}ms | ` +
            `Distance: ${this.distanceFromOrigin.toFixed(0)}`,
            fpsColor
        );
        
        // Log object counts
        console.log(
            `   📦 Objects: Enemies=${this.counts.enemies} | Nebulas=${this.counts.nebulas} | ` +
            `Planets=${this.counts.planets} | Ships=${this.counts.ships} | Asteroids=${this.counts.asteroids}`
        );
        
        // Log function timings if any are slow
        const slowThreshold = 5; // ms
        const slowFuncs = Object.entries(this.timings).filter(([k, v]) => v > slowThreshold);
        if (slowFuncs.length > 0) {
            console.log(
                `%c   ⏱️ Slow functions: ${slowFuncs.map(([k, v]) => `${k}=${v.toFixed(1)}ms`).join(' | ')}`,
                'color: orange;'
            );
        }
        
        // Alert if FPS drops significantly in twin cores zone
        if (this.inTwinCoresZone && this.fps < 30) {
            console.log(
                `%c   🔴 LAG DETECTED in Twin Cores zone! FPS=${this.fps.toFixed(1)}`,
                'color: red; font-weight: bold; font-size: 12px;'
            );
        }
    },
    
    // Get detailed report (call from console: perfDebug.report())
    report: function() {
        console.log('%c═══════════════════════════════════════════════════════════', 'color: cyan;');
        console.log('%c   PERFORMANCE DEBUG REPORT', 'color: cyan; font-weight: bold; font-size: 16px;');
        console.log('%c═══════════════════════════════════════════════════════════', 'color: cyan;');
        console.log(`Zone: ${this.inTwinCoresZone ? '⚠️ TWIN CORES (< ' + this.twinCoresThreshold + ' units)' : '✅ OUTER SPACE'}`);
        console.log(`Distance from origin: ${this.distanceFromOrigin.toFixed(0)} units`);
        console.log(`Current FPS: ${this.fps.toFixed(1)}`);
        console.log(`Average frame time: ${this.avgFrameTime.toFixed(2)} ms`);
        console.log(`Worst frame time: ${this.worstFrameTime.toFixed(2)} ms`);
        console.log('');
        console.log('Object Counts:');
        Object.entries(this.counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
        console.log('');
        console.log('Function Timings (ms):');
        Object.entries(this.timings).forEach(([k, v]) => console.log(`  ${k}: ${v.toFixed(2)}`));
        console.log('%c═══════════════════════════════════════════════════════════', 'color: cyan;');
    }
};

// Export to window for console access
window.perfDebug = perfDebug;
console.log('%c🔧 Performance debugger loaded! Use perfDebug.report() for detailed info', 'color: cyan; font-weight: bold;');

// Three.js Setup and global arrays
let scene, camera, renderer, stars, blackHole;
let planets = [];
let activePlanets = [];
let wormholes = [];
let comets = [];
let asteroidBelts = [];
let nebulaClouds = [];
let nebulaGasClouds = []; 
let enemies = [];
let cameraRotation = { x: 0, y: 0, z: 0 }

// Game state for pause functionality
let gamePaused = false;

// Emergency Warp brake handler
let braking = false;
let targetSpeed = 80; // start at full speed

// Initialize orbit lines array
let orbitLines = [];

// Enhanced orbit lines state management
let orbitLinesVisible = true;
let orbitLinesInitialized = false;
let lastOrbitUpdate = 0;

// =============================================================================
// PERFORMANCE MONITORING AND OPTIMIZATION
// =============================================================================

// PERFORMANCE: Auto-adjust performance based on frame times
function adjustPerformance() {
    return; // DISABLED - causing performance issues
    
    const targetFrameTime = 16.67; // 60 FPS
    const slowFrameTime = 33.33;   // 30 FPS
    const verySlowFrameTime = 50;  // 20 FPS
    
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

// Add to game-core.js:
function checkCosmicDiscoveries() {
    if (!camera || !cosmicFeatures) return;
    
    const discoveryRange = 1000;
    
    // Check for rare megastructure discoveries
    [...cosmicFeatures.dysonSpheres, ...cosmicFeatures.ringworlds].forEach(structure => {
        const distance = camera.position.distanceTo(structure.position);
        if (distance < discoveryRange && !structure.userData.discovered) {
            structure.userData.discovered = true;
            
            if (typeof showAchievement === 'function') {
                const structureType = structure.userData.type === 'dyson_sphere' ? 'Dyson Sphere' : 'Ringworld';
                showAchievement('MAJOR DISCOVERY!', `Ancient ${structureType} detected!`);
                
                // Award bonus points/energy
                if (typeof gameState !== 'undefined') {
                    gameState.energy = Math.min(100, gameState.energy + 25);
                    gameState.score = (gameState.score || 0) + 10000;
                }
            }
            
            // Play special discovery sound
            if (typeof playSound === 'function') {
                playSound('discovery');
            }
        }
    });
    
    // Check for space whale encounters
    cosmicFeatures.spaceWhales.forEach(whale => {
        const distance = camera.position.distanceTo(whale.position);
        if (distance < 500 && !whale.userData.encountered) {
            whale.userData.encountered = true;
            
            if (typeof showAchievement === 'function') {
                showAchievement('INCREDIBLE!', 'Space Whale encountered!');
            }
            
            // Space whales provide energy and healing
            if (typeof gameState !== 'undefined') {
                gameState.energy = Math.min(100, gameState.energy + whale.userData.bioEnergy * 0.1);
                gameState.hull = Math.min(100, gameState.hull + 15);
            }
        }
    });
}

function updateActivePlanets() {
    // PERFORMANCE: Reduced active ranges for better performance
    const activeRange = gameState.performanceMode === 'minimal' ? 1000 :
                        gameState.performanceMode === 'optimized' ? 1500 : 2000;
    
    activePlanets = planets.filter(planet => {
        const distance = camera.position.distanceTo(planet.position);
        // Always include stars with tendrils for animation, regardless of distance
        if (planet.userData.tendrilGroup) {
            return true;
        }
        // CRITICAL: Always include moons and ensure they're visible
if (planet.userData.type === 'moon') {
    planet.visible = true;
    planet.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling for planets
    activePlanets.push(planet);
}
        // Include asteroids within range for orbital mechanics
        if (planet.userData.type === 'asteroid') {
            return distance < activeRange;
        }
        return distance < activeRange;
    });
    
    // Enhanced LOD for distant objects in doubled world (performance optimized)
    const lodDistance = gameState.performanceMode === 'minimal' ? 2000 :
                        gameState.performanceMode === 'optimized' ? 3000 : 4000;
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

function createOrbitLines() {
    console.log('Creating orbit lines...');
    
    // Clear existing orbit lines
    orbitLines.forEach(line => {
        if (line && line.parent) {
            line.parent.remove(line);
        } else if (scene) {
            scene.remove(line);
        }
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
    });
    orbitLines = [];
    
    // SIMPLIFIED: Create orbit lines for ALL planets with orbital data
    planets.forEach(planet => {
        // Check if planet has orbital data
        if (!planet.userData.orbitRadius || planet.userData.orbitRadius <= 0) return;
        if (!planet.userData.systemCenter) return;
        
        // Skip moon orbits (keep only planetary orbits)
        if (planet.userData.parentPlanet) return;
        
        const orbitRadius = planet.userData.orbitRadius;
        const systemCenter = planet.userData.systemCenter;
        
        // Create orbit geometry - simpler approach
        const orbitGeometry = new THREE.RingGeometry(
            orbitRadius - 2, // Inner radius
            orbitRadius + 2, // Outer radius
            32 // Segments
        );
        
        // Determine color based on galaxy type
        let orbitColor = 0x0096ff; // Default blue
        if (planet.userData.isLocal) {
            orbitColor = 0x00ff96; // Green for local system
        } else if (planet.userData.galaxyId !== undefined && typeof galaxyTypes !== 'undefined') {
            const galaxyType = galaxyTypes[planet.userData.galaxyId];
            if (galaxyType && galaxyType.color) {
                orbitColor = galaxyType.color;
            }
        }
        
        const orbitMaterial = new THREE.MeshBasicMaterial({
            color: orbitColor,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        const orbitLine = new THREE.Mesh(orbitGeometry, orbitMaterial);
        
        // Position the orbit at the system center
        orbitLine.position.set(systemCenter.x, systemCenter.y, systemCenter.z);
        orbitLine.rotation.x = Math.PI / 2; // Rotate to horizontal plane
        
        // Set visibility
        orbitLine.visible = orbitLinesVisible;
        
        // Add metadata
        orbitLine.userData = {
            planetName: planet.userData.name,
            orbitRadius: orbitRadius,
            isOrbitLine: true,
            galaxyId: planet.userData.galaxyId
        };
        
        scene.add(orbitLine);
        orbitLines.push(orbitLine);
    });
    
    console.log(`Created ${orbitLines.length} orbit lines - visible: ${orbitLinesVisible}`);
}

// Simpler toggle function
function toggleOrbitLines() {
    orbitLinesVisible = !orbitLinesVisible;
    console.log(`Toggling orbits: ${orbitLinesVisible ? 'ON' : 'OFF'}`);
    
    // If turning on and no orbit lines exist, create them
    if (orbitLinesVisible && (!orbitLines || orbitLines.length === 0)) {
        createOrbitLines();
    }
    
    // Update visibility of existing orbit lines
    if (orbitLines && orbitLines.length > 0) {
        orbitLines.forEach(line => {
            if (line && line.visible !== undefined) {
                line.visible = orbitLinesVisible;
            }
        });
    }
    
    return orbitLinesVisible;
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

// âœ… ENHANCED: Apply stored orbital tilt for local gateway systems
if (planet.userData.isLocalGateway && planet.userData.orbitalTilt) {
    orbitLine.rotation.y += planet.userData.orbitalTilt.z; // Z-tilt affects Y-rotation
    orbitLine.rotation.z += planet.userData.orbitalTilt.x; // X-tilt affects Z-rotation
} else if (!isLocal) {
    // Add small random tilt for distant galaxies
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
        "Loading 3D models...",
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

// SIMPLIFIED: Direct initialization without complex dependency checking
function startGame() {
    console.log('========================================');
    console.log('🚀 START GAME CALLED');
    console.log('========================================');
    console.log('Starting enhanced game initialization...');

    try {
        // Initialize Three.js
        scene = new THREE.Scene();
        
        // Add enhanced ambient light for doubled world
        const globalAmbientLight = new THREE.AmbientLight(0x333333, 0.4);
        scene.add(globalAmbientLight);
        
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 250000);

        // Add ship headlight - point light positioned forward to illuminate asteroids ahead
        const shipLight = new THREE.PointLight(0xffffff, 3.0, 800, 2);  // Increased intensity and range
        shipLight.position.set(0, 0, -50);  // Position forward from camera (negative Z is forward)
        camera.add(shipLight);
        scene.add(camera);  // Add camera to scene so the light works
        window.shipLight = shipLight;  // Store reference for potential adjustments

        // Store camera reference for player model attachment later
        window.gameCamera = camera;

        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000003);

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
        
        // Start animation first (most critical)
        animate();
        console.log('Animation started');

        // Initialize camera system with player ship
        console.log('========================================');
        console.log('🎥 CAMERA SYSTEM INITIALIZATION START');
        console.log('========================================');
        console.log('  - Camera ready:', !!window.gameCamera);
        console.log('  - Scene ready:', !!scene);
        console.log('  - initCameraSystem function available:', typeof initCameraSystem);
        console.log('  - areModelsLoaded function available:', typeof areModelsLoaded);
        console.log('  - getPlayerModel function available:', typeof getPlayerModel);

        if (typeof areModelsLoaded === 'function') {
            console.log('  - Models loaded status:', areModelsLoaded());
        }

        if (typeof getPlayerModel === 'function') {
            const testModel = getPlayerModel();
            console.log('  - Test getPlayerModel() result:', !!testModel);
        }

        // Initialize camera system now (models should be loaded from auto-load)
        if (typeof initCameraSystem === 'function' && window.gameCamera && scene) {
            console.log('✅ All prerequisites met, calling initCameraSystem...');
            initCameraSystem(window.gameCamera, scene);
            console.log('✅ initCameraSystem call completed');
            console.log('  - cameraState.initialized:', window.cameraState ? window.cameraState.initialized : 'cameraState not found');
            console.log('  - cameraState.playerShipMesh:', window.cameraState ? !!window.cameraState.playerShipMesh : 'cameraState not found');
        } else {
            console.error('❌ Cannot initialize camera system - missing prerequisites:');
            console.error('   - initCameraSystem function:', typeof initCameraSystem);
            console.error('   - window.gameCamera:', !!window.gameCamera);
            console.error('   - scene:', !!scene);
        }

        // If models aren't loaded yet, wait for them
        if (typeof areModelsLoaded === 'function' && !areModelsLoaded()) {
            console.log('⏳ Models not loaded yet at camera init time, setting up delayed initialization...');
            if (typeof loadAllModels === 'function') {
                loadAllModels().then(() => {
                    console.log('========================================');
                    console.log('🎥 DELAYED CAMERA INITIALIZATION (models just finished loading)');
                    console.log('========================================');
                    if (typeof initCameraSystem === 'function' && window.gameCamera && scene) {
                        initCameraSystem(window.gameCamera, scene);
                        console.log('✅ Delayed camera initialization complete');
                        console.log('  - cameraState.initialized:', window.cameraState ? window.cameraState.initialized : 'cameraState not found');
                        console.log('  - cameraState.playerShipMesh:', window.cameraState ? !!window.cameraState.playerShipMesh : 'cameraState not found');
                    }
                }).catch(err => {
                    console.warn('⚠️ Model loading error during delayed init:', err);
                });
            }
        } else {
            console.log('✅ Models already loaded, no delayed initialization needed');
        }
        console.log('========================================');
        console.log('🎥 CAMERA SYSTEM INITIALIZATION END');
        console.log('========================================');

        simulateLoading();
        console.log('Loading simulation started');

        // Add this during game initialization (in startGame function)
		initializeGalaxyDiscoverySystem();
        
        // Initialize game components (only call functions that should exist)
        setTimeout(() => {
            console.log('Initializing game components...');
            
            // These functions should be available from other files
            
            if (typeof createOptimizedPlanets3D === 'function') {
                createOptimizedPlanets3D();
                console.log('Optimized planets created');
            }
            
            setTimeout(() => {
    if (typeof createSpectacularClusteredNebulas === 'function') {
        console.log('Creating spectacular triple-layered clustered nebulas...');
        createSpectacularClusteredNebulas();
    }

    // Create boss battle skybox (starts transparent, pulses during boss battles)
    if (typeof createBossBattleSkybox === 'function') {
        createBossBattleSkybox();
    }
}, 1000);

// In your startGame() function, after calling createOptimizedPlanets3D():
setTimeout(() => {
    if (typeof createNebulas === 'function') {
        console.log('Creating first nebula layer...');
        createNebulas();
        
        // Second layer with slight delay for variety
        setTimeout(() => {
            console.log('Creating second nebula layer...');
            createNebulas();
        }, 500);
    }
}, 1000);

// â­ NEW: Create enhanced planet clusters AFTER all nebula layers
setTimeout(() => {
    if (typeof createEnhancedPlanetClustersInNebulas === 'function') {
        console.log('ðŸŒŸ Creating enhanced planet clusters within nebulas...');
        createEnhancedPlanetClustersInNebulas();
    } else {
        console.warn('âš ï¸ createEnhancedPlanetClustersInNebulas function not found!');
    }
}, 3000); // Wait 3 seconds for all nebula layers to complete

// ADD THIS NEW CODE RIGHT AFTER THE ABOVE:
setTimeout(() => {
    if (typeof createEnhancedPlanetClustersInNebulas === 'function') {
        console.log('ðŸŒŸ Creating enhanced planet clusters in nebulas...');
        createEnhancedPlanetClustersInNebulas();
    }
}, 2000); // Wait for nebulas to be fully created first

            // TEMPORARILY DISABLED: Asteroid creation on initial load
// Asteroids will only be created during the intro sequence for better FPS
/*
if (typeof createAsteroidBelts === 'function') {
    createAsteroidBelts();
    console.log('Asteroid belts created');
}
*/
console.log('INITIAL ASTEROID LOAD DISABLED - Will load during intro sequence only');

            if (typeof createEnhancedComets === 'function') {
                createEnhancedComets();
                console.log('Enhanced comets created');
            }
            
            // ADD HERE:
if (typeof createEnhancedWormholes === 'function') {
    createEnhancedWormholes();
    console.log('Enhanced wormholes created');
}

// Create enemies for ALL galaxies on game start - WAIT FOR MODELS TO LOAD FIRST
// This ensures that 3D GLB models are available when enemies are created
if (typeof areModelsLoaded === 'function' && areModelsLoaded()) {
    // Models are already loaded, create enemies immediately
    console.log('✅ Models loaded, creating enemies with 3D models...');
    if (typeof createEnemies === 'function') {
        createEnemies();
        console.log('Enemy ships created for all galaxies');
    }
    if (typeof spawnBlackHoleGuardians === 'function') {
        spawnBlackHoleGuardians();
        console.log('Black Hole Guardians spawned');
    }
    // Create enemies in distant/exotic nebula regions
    if (typeof createDistantExoticEnemies === 'function') {
        createDistantExoticEnemies();
        console.log('Deep space patrol enemies created');
    }
    // Initialize nebula intel system (links nebulas to enemy clusters)
    if (typeof initializeNebulaIntelSystem === 'function') {
        initializeNebulaIntelSystem();
        console.log('Nebula intel system initialized');
    }
    // Create trading ships in nebulas
    if (typeof createTradingShipsInNebulas === 'function') {
        createTradingShipsInNebulas();
        console.log('Trading ships created in nebulas');
    }
    // Create ships in distant and exotic nebulas with mining routes
    if (typeof createShipsInDistantExoticNebulas === 'function') {
        createShipsInDistantExoticNebulas();
        console.log('Ships created in distant/exotic nebulas');
    }
    // Update clustered nebula mining ships with routes to core systems
    if (typeof updateClusteredMiningRoutes === 'function') {
        updateClusteredMiningRoutes();
        console.log('Mining routes established for clustered nebula ships');
    }
    // Create civilian ships throughout the universe
    if (typeof createAllCivilianShips === 'function') {
        createAllCivilianShips();
        console.log('Civilian ships created throughout universe');
    }
    // Load UFO model and create UFOs in exotic systems
    if (typeof loadUFOModel === 'function') {
        loadUFOModel().then(() => {
            if (typeof createUFOsInExoticSystems === 'function') {
                createUFOsInExoticSystems();
            }
        });
    }
    // Load satellite models and create satellites near cosmic features
    if (typeof loadSatelliteModels === 'function') {
        loadSatelliteModels().then(() => {
            if (typeof createSatellitesNearCosmicFeatures === 'function') {
                createSatellitesNearCosmicFeatures();
            }
        });
    }
    // Initialize distress beacon system (needs outer systems to exist)
    if (typeof distressBeaconSystem !== 'undefined' && distressBeaconSystem.initialize) {
        distressBeaconSystem.initialize();
        console.log('Distress beacon system initialized');
    }
} else {
    // Models not loaded yet, wait for them
    console.log('⏳ Models not loaded yet, waiting before creating enemies...');
    if (typeof loadAllModels === 'function') {
        loadAllModels().then(() => {
            console.log('✅ Models finished loading, now creating enemies with 3D models...');
            if (typeof createEnemies === 'function') {
                createEnemies();
                console.log('Enemy ships created for all galaxies with GLB models');
            }
            if (typeof spawnBlackHoleGuardians === 'function') {
                spawnBlackHoleGuardians();
                console.log('Black Hole Guardians spawned with GLB models');
            }
            // Create enemies in distant/exotic nebula regions
            if (typeof createDistantExoticEnemies === 'function') {
                createDistantExoticEnemies();
            }
            // Create trading ships in nebulas
            if (typeof createTradingShipsInNebulas === 'function') {
                createTradingShipsInNebulas();
            }
            // Create ships in distant/exotic nebulas
            if (typeof createShipsInDistantExoticNebulas === 'function') {
                createShipsInDistantExoticNebulas();
            }
            // Update mining routes
            if (typeof updateClusteredMiningRoutes === 'function') {
                updateClusteredMiningRoutes();
            }
            // Initialize distress beacon system
            if (typeof distressBeaconSystem !== 'undefined' && distressBeaconSystem.initialize) {
                distressBeaconSystem.initialize();
            }
        }).catch(err => {
            console.warn('⚠️ Model loading error, creating enemies with fallback geometry:', err);
            // Even if models fail to load, still create enemies (they'll use fallback geometry)
            if (typeof createEnemies === 'function') {
                createEnemies();
                console.log('Enemy ships created with fallback geometry');
            }
            if (typeof spawnBlackHoleGuardians === 'function') {
                spawnBlackHoleGuardians();
                console.log('Black Hole Guardians spawned with fallback geometry');
            }
            // Create enemies in distant/exotic nebula regions
            if (typeof createDistantExoticEnemies === 'function') {
                createDistantExoticEnemies();
            }
            // Create trading ships in nebulas
            if (typeof createTradingShipsInNebulas === 'function') {
                createTradingShipsInNebulas();
            }
            // Create ships in distant/exotic nebulas
            if (typeof createShipsInDistantExoticNebulas === 'function') {
                createShipsInDistantExoticNebulas();
            }
            // Update mining routes
            if (typeof updateClusteredMiningRoutes === 'function') {
                updateClusteredMiningRoutes();
            }
            // Initialize distress beacon system
            if (typeof distressBeaconSystem !== 'undefined' && distressBeaconSystem.initialize) {
                distressBeaconSystem.initialize();
            }
        });
    } else {
        // If loadAllModels isn't available, just create enemies normally
        console.warn('⚠️ loadAllModels function not found, creating enemies immediately');
        if (typeof createEnemies === 'function') {
            createEnemies();
            console.log('Enemy ships created');
        }
        if (typeof spawnBlackHoleGuardians === 'function') {
            spawnBlackHoleGuardians();
            console.log('Black Hole Guardians spawned');
        }
    }
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
                
                // â­ NEW: Update galaxy map to show initial location
                setTimeout(() => {
                    if (typeof updateGalaxyMap === 'function') {
                        updateGalaxyMap();
                        console.log('ðŸ—ºï¸ Initial galaxy location set');
                    }
                }, 1000); // Wait 1 second for camera to be positioned
            }
            
            if (typeof initializeUISystem === 'function') {
    initializeUISystem();
    console.log('UI system initialized');
}

// Initialize shield system (with delay to ensure DOM is ready)
setTimeout(() => {
    if (typeof initShieldSystem === 'function') {
        const initialized = initShieldSystem();
        if (initialized) {
            console.log('ðŸ›¡ï¸ Shield system ready');
        } else {
            console.warn('âš ï¸ Shield system initialization failed - will retry on first activation');
        }
    }
}, 100);

if (typeof initializeCosmicFeatures === 'function') {
    initializeCosmicFeatures();
    console.log('Special cosmic features initialized');
}

// ADD OUTER SYSTEMS RIGHT HERE - AFTER COSMIC FEATURES:
if (typeof createOuterInterstellarSystems === 'function') {
    createOuterInterstellarSystems();
    console.log('🌌 Outer interstellar systems created');
}

// ADD THIS RIGHT HERE:
if (typeof createWarpSpeedStarfield === 'function') {
    createWarpSpeedStarfield();
    console.log('3D warp speed starfield created');
}
// Enhance cosmic features for collision and slingshot support
if (typeof enhanceCosmicFeaturesForGameplay === 'function') {
    setTimeout(() => {
        enhanceCosmicFeaturesForGameplay();
        console.log('Cosmic features enhanced for gameplay');
    }, 500); // Small delay to ensure all features are created
}

// Debug beacons removed - nebulas now have proper fade-in visibility
            // Create orbit lines after planets exist
            setTimeout(() => {
    createOrbitLines();
    console.log('Orbit lines created');
    
    // ADD THIS:
    if (typeof initializeBlackHoleParticles === 'function') {
        initializeBlackHoleParticles();
        console.log('Black hole particles initialized');
    }
    
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
        
    gameState.frameCount++;
    
    if (gameState.paused) {
        // Still render the scene when paused, just don't update game logic
        if (stars) {
            stars.rotation.x += 0.0001;
            stars.rotation.y += 0.0002;
        }
        renderer.render(scene, camera);
        return; // Skip all other game updates when paused
    }
    
    // PERFORMANCE: Monitor frame times and adjust quality
    const currentTime = performance.now();
    const frameTime = currentTime - gameState.lastUpdateTime;
    gameState.lastUpdateTime = currentTime;
    
    // Track frame time history for performance adjustment
    gameState.frameTimeHistory.push(frameTime);
    if (gameState.frameTimeHistory.length > 60) { // Keep last 60 frames
        gameState.frameTimeHistory.shift();
    }
    
    // Calculate average frame time
    if (gameState.frameTimeHistory.length >= 10) {
        gameState.averageFrameTime = gameState.frameTimeHistory.reduce((a, b) => a + b) / gameState.frameTimeHistory.length;
    }
    
    // Auto-adjust performance every 5 seconds
    if (currentTime - gameState.lastPerformanceCheck > 5000) {
        adjustPerformance();
        gameState.lastPerformanceCheck = currentTime;
    }

    // PERFORMANCE DEBUG: Update tracker
    if (typeof perfDebug !== 'undefined' && perfDebug.enabled) {
        perfDebug.update(camera);
        perfDebug.startTimer('total');
    }

    // CRITICAL: Update camera view ALWAYS (before gameStarted check)
    // This ensures player ship follows camera even during intro/before game starts
    if (typeof updateCameraView === 'function') {
        updateCameraView(camera);
    }
    
    // Update laser positions to track with ship movement
    if (typeof updateActiveLasers === 'function') {
        updateActiveLasers();
    }
    
    // Update thruster glow based on W key (forward thrust)
    if (typeof updateThrusterGlow === 'function' && typeof keys !== 'undefined') {
        const isThrusting = keys.w && gameState.energy > 0;
        updateThrusterGlow(isThrusting);
    }

    if (gameState.gameOver || !gameState.gameStarted) {
        if (stars) {
            stars.rotation.x += 0.0001;
            stars.rotation.y += 0.0002;
        }
        
        // CRITICAL: Keep explosion animations running during game over
        // so player can see their ship explode before game over screen
        if (typeof explosionManager !== 'undefined') {
            explosionManager.update(16.67);
        }
        
        renderer.render(scene, camera);
        return; // Stop all other game updates when game over
    }

    // Add this inside your animate() function
if (typeof animateNebulaBrownDwarfs !== 'undefined') {
    animateNebulaBrownDwarfs();
}
// PERFORMANCE DEBUG: Time nebula updates
if (typeof perfDebug !== 'undefined') perfDebug.startTimer('nebulas');

// Update distant/exotic nebula visibility based on player range
if (typeof updateNebulaVisibility === 'function') {
    updateNebulaVisibility();
}

// Update orbit line visibility based on proximity to nebulas/black holes
if (typeof updateOrbitLineVisibility === 'function') {
    updateOrbitLineVisibility();
}

if (typeof perfDebug !== 'undefined') perfDebug.endTimer('nebulas');

// Update trading ships in nebulas
if (typeof updateTradingShips === 'function') {
    updateTradingShips();
}

// Update freighter caravans traveling between nebulas
if (typeof updateFreighterCaravans === 'function') {
    updateFreighterCaravans();
}

// Update civilian ships throughout universe
if (typeof updateCivilianShips === 'function') {
    updateCivilianShips();
}

// Update UFO erratic movement
if (typeof updateUFOMovement === 'function') {
    updateUFOMovement();
}

// Update satellites
if (typeof updateSatellites === 'function') {
    updateSatellites();
}

// Update distress beacons (pulsing effect)
if (typeof distressBeaconSystem !== 'undefined' && distressBeaconSystem.updateBeacons) {
    distressBeaconSystem.updateBeacons();
}
    
    // â­ ENHANCED: Animate nebula gas clouds with individual pulsing per cloud
if (typeof nebulaGasClouds !== 'undefined' && nebulaGasClouds.length > 0) {
    // OPTIMIZATION: Cache Date.now() once per frame instead of per cloud
    const currentTime = Date.now();

    nebulaGasClouds.forEach(cloudCluster => {
        // Rotate entire cluster slowly
        if (cloudCluster.rotation) {
            cloudCluster.rotation.x += 0.0002;
            cloudCluster.rotation.y += 0.0003;
            cloudCluster.rotation.z += 0.0001;
        }

        // Animate each individual cloud in the cluster
        if (cloudCluster.children && cloudCluster.children.length > 0) {
            cloudCluster.children.forEach(cloud => {
                if (cloud.userData && cloud.userData.pulseSpeed) {
                    // Each cloud pulses at its own speed and phase (using cached time)
                    const pulseTime = currentTime * cloud.userData.pulseSpeed + cloud.userData.pulsePhase;
                    const scale = 1 + Math.sin(pulseTime) * 0.08;
                    cloud.scale.set(scale, scale, scale);

                    // Also pulse opacity for breathing effect
                    if (cloud.material && cloud.userData.baseOpacity) {
                        const opacityPulse = Math.sin(pulseTime * 0.5) * 0.05;
                        cloud.material.opacity = cloud.userData.baseOpacity + opacityPulse;
                    }
                }

                // Individual cloud rotation for wispy effect
                if (cloud.rotation) {
                    cloud.rotation.x += 0.0005;
                    cloud.rotation.y += 0.0003;
                }
            });
        }
    });
}

if (typeof asteroidBelts !== 'undefined' && asteroidBelts.length > 0) {
    asteroidBelts.forEach(belt => {
        // Update individual asteroids within each belt
        if (belt.children && belt.children.length > 0) {
            belt.children.forEach(asteroid => {
                if (!asteroid.userData || asteroid.userData.type !== 'asteroid') return;
                
                // 🌑 ORBITAL MOVEMENT: Update asteroid position based on orbitSpeed
                if (asteroid.userData.orbitSpeed && asteroid.userData.beltCenter) {
                    // Increment orbit phase
                    asteroid.userData.orbitPhase += asteroid.userData.orbitSpeed;
                    
                    // Calculate new orbital position
                    const orbitRadius = asteroid.userData.orbitRadius || 0;
                    const orbitPhase = asteroid.userData.orbitPhase || 0;
                    
                    // Maintain original height variation
                    const ringHeight = asteroid.position.y;
                    
                    // Update position in circular orbit
                    asteroid.position.x = Math.cos(orbitPhase) * orbitRadius;
                    asteroid.position.y = ringHeight; // Keep height constant
                    asteroid.position.z = Math.sin(orbitPhase) * orbitRadius;
                }
                
                // 🌀 INDIVIDUAL ROTATION: Make asteroids spin
                if (asteroid.userData.rotationSpeed) {
                    asteroid.rotation.y += asteroid.userData.rotationSpeed;
                    asteroid.rotation.x += asteroid.userData.rotationSpeed * 0.3; // Tumble effect
                }
            });
        }
    });
}

    // Update interstellar asteroid fields
    if (typeof updateInterstellarAsteroids === 'function') {
        updateInterstellarAsteroids();
    }

    // Check interstellar asteroid collisions
    if (typeof checkInterstellarAsteroidCollisions === 'function') {
        checkInterstellarAsteroidCollisions();
    }

    // Update outer systems
if (typeof updateOuterSystems === 'function') {
    updateOuterSystems();
}

    // Update BORG patrol drone combat behavior
    if (typeof updateBorgPatrolCombat === 'function') {
        updateBorgPatrolCombat();
    }

    // Check for outer system discoveries
if (gameState.frameCount % 60 === 0 && typeof outerInterstellarSystems !== 'undefined') {
    outerInterstellarSystems.forEach(system => {
        if (!system.userData.discovered) {
            const distance = camera.position.distanceTo(system.position);
            if (distance < 3000) {
                system.userData.discovered = true;
                if (typeof showAchievement === 'function') {
                    showAchievement(
                        `Discovered: ${system.userData.name}`,
                        'Unexplored Interstellar Space'
                    );
                }
                console.log(`🌌 Discovered outer system: ${system.userData.name}`);
            }
        }
    });
}
    
// Pulse enemy glow for visibility
// UPDATED: Handle both simple meshes and GLB model Groups
// FIXED: Never go completely dark - maintain minimum visibility
if (typeof enemies !== 'undefined' && enemies.length > 0 && gameState.frameCount % 2 === 0) {
    const pulseTime = Date.now() * 0.003; // Slightly faster pulse
    const pulseFactor = 0.5 + Math.sin(pulseTime) * 0.5; // 0.0 to 1.0
    
    // FIXED: Minimum values so enemies never disappear
    const minGlowOpacity = 0.35;  // Never go below 35% opacity
    const maxGlowOpacity = 0.85;  // Max 85% opacity
    const glowRange = maxGlowOpacity - minGlowOpacity;

    // Only pulse enemies within visual range (3000 units)
    const nearbyEnemies = enemies.filter(e =>
        e.userData.health > 0 &&
        camera.position.distanceTo(e.position) < 3000
    );

    nearbyEnemies.forEach(enemy => {
        // Handle both simple Mesh and GLB model Group structures
        // Check if this is a GLB model first (has children that are meshes)
        const isGLBModel = enemy.type === 'Group' || (enemy.children && enemy.children.length > 0 && enemy.children.some(c => c.isMesh));

        if (isGLBModel) {
            // GLB model Group - traverse all meshes and pulse their materials
            enemy.traverse((child) => {
                if (child.isMesh && child.material) {
                    // Check if this is a glow layer child mesh
                    const isGlowLayer = child.userData.isGlowLayer || false;

                    if (isGlowLayer) {
                        // GLOW LAYER - pulse opacity but NEVER go completely dark
                        if (child.material.opacity !== undefined) {
                            if (child.userData.baseOpacity === undefined) {
                                child.userData.baseOpacity = child.material.opacity;
                            }
                            // FIXED: Pulse from minGlowOpacity to maxGlowOpacity (never invisible)
                            child.material.opacity = minGlowOpacity + (pulseFactor * glowRange);
                        }
                    } else {
                        // BASE MATERIAL - keep solid, no opacity pulsing
                        // Only pulse emissive if it has one
                        if (child.material.emissiveIntensity !== undefined) {
                            if (child.userData.baseEmissive === undefined) {
                                child.userData.baseEmissive = child.material.emissiveIntensity;
                            }
                            child.material.emissiveIntensity = child.userData.baseEmissive * (1.0 + pulseFactor * 0.5);
                        }
                    }
                }
            });
        } else if (enemy.isMesh) {
            // Simple mesh (fallback geometry) - keep base solid
            // Base material doesn't pulse, only glow layer does

            // Pulse the glow mesh if it exists
            enemy.traverse((child) => {
                if (child.userData.isGlowLayer && child.material && child.material.opacity !== undefined) {
                    // FIXED: Pulse from minGlowOpacity to maxGlowOpacity (never invisible)
                    child.material.opacity = minGlowOpacity + (pulseFactor * glowRange);
                }
            });
        }
    });
}
    
    // Update target lock system
    updateTargetLock();
    
    // Update shield system
if (typeof updateShieldSystem === 'function') {
    updateShieldSystem();
}
    
    // PERFORMANCE: Update active planets less frequently based on performance mode
    const planetUpdateFrequency = gameState.performanceMode === 'minimal' ? 10 : 
                                   gameState.performanceMode === 'optimized' ? 7 : 5;
    if (gameState.frameCount % planetUpdateFrequency === 0) {
        updateActivePlanets();
    }
    
    // HIGH FREQUENCY: Update enemy detection every frame for responsive combat
    if (typeof detectEnemiesInRegion === 'function') {
        detectEnemiesInRegion();
    }
    
    // OPTIMIZED: Update galaxy map less frequently (every 180 frames = ~once every 3 seconds)
	if (gameState.frameCount % 60 === 0 && typeof updateGalaxyMap === 'function') {
    updateGalaxyMap();
	}
    
    // NEW: Check for nebula discoveries
    if (gameState.frameCount % 30 === 0 && typeof checkForNebulaDiscovery === 'function') {
        checkForNebulaDiscovery();
    }
    
    // DEEP DISCOVERY: Check for close approach to nebula centers (50 units)
    if (gameState.frameCount % 15 === 0 && typeof checkForNebulaDeepDiscovery === 'function') {
        checkForNebulaDeepDiscovery();
    }
    
    // ANIMATE: Pulse discovery path lines
    if (typeof animateDiscoveryPaths === 'function') {
        animateDiscoveryPaths();
    }
    
    // WEAPON ENERGY REGENERATION (ADD THIS)
    if (gameState.weapons.energy < 100) {
        gameState.weapons.energy = Math.min(100, gameState.weapons.energy + 0.5); // Regenerate 0.5 per frame (~30/sec)
    }
    
    // FIXED: Only update targets occasionally, not every frame (prevents scroll interference)
    // Update every 180 frames (~3 seconds at 60fps) instead of every 30 frames (0.5 seconds)
    // This allows players to scroll and select targets without constant refreshing
    if (gameState.frameCount % 180 === 0 && typeof populateTargets === 'function') {
        populateTargets();
    }
    
  // Rotate local galaxy stars around Sagittarius A*
if (typeof localGalaxyStars !== 'undefined' && localGalaxyStars) {
    localGalaxyStars.rotation.y += 0.0003; // Slow rotation around Y-axis
}
    
    // PERFORMANCE: Update orbit lines less frequently but more reliably
    const orbitUpdateFrequency = gameState.performanceMode === 'minimal' ? 300 : 
                                 gameState.performanceMode === 'optimized' ? 180 : 120;
    if (gameState.frameCount % orbitUpdateFrequency === 0) {
        // Force create orbit lines if they don't exist and we have planets
        if ((!orbitLines || orbitLines.length === 0) && planets.length > 0) {
            console.log('Orbit lines missing, force creating...');
            createOrbitLines();
        }
    }

    // FIXED: Call the enhanced orbital mechanics function
    updatePlanetOrbits();
  
  // NEW: Update warp speed starfield effect
    if (typeof updateWarpSpeedStarfield === 'function') {
        updateWarpSpeedStarfield();
    }
        
    // NEW: Update CMB opacity based on distance from Sagittarius A and nebula proximity
    if (typeof updateCMBOpacity === 'function') {
        updateCMBOpacity();
    }
    
    // Update Hubble skybox opacity based on distance traveled
    if (typeof updateHubbleSkyboxOpacity === 'function') {
        updateHubbleSkyboxOpacity();
    }

    // Update second Hubble skybox opacity (deeper space layer)
    if (typeof updateHubbleSkybox2Opacity === 'function') {
        updateHubbleSkybox2Opacity();
    }

    // Update boss battle skybox with heartbeat pulsing
    if (typeof updateBossSkyboxHeartbeat === 'function') {
        updateBossSkyboxHeartbeat();
    }
    
    // PERFORMANCE: Update only expensive effects for active planets (tendrils, glows, etc.)
    activePlanets.forEach((planet) => {
    // FIXED: Only rotate star particles, keep disk stable
if (planet.userData.type === 'blackhole' && planet.userData.rotationSpeed) {
    planet.children.forEach(child => {
        if (child.type === 'Points') { // Star particles
            child.rotation.y += planet.userData.rotationSpeed;
        }
        if (child.geometry && child.geometry.type === 'RingGeometry') { // Accretion disk
            child.rotation.x = Math.PI / 2; // Keep flat
            child.rotation.z = 0; // No tumbling
        }
    });
}
    
        // Asteroid orbital mechanics - update EVERY frame for smooth motion
        if (planet.userData.type === 'asteroid' && planet.userData.beltGroup) {
    // Update orbital position every frame (no skipping)
    const time = Date.now() * 0.001 * planet.userData.orbitSpeed;
    const orbitPhase = planet.userData.orbitPhase || 0;
    
    // FIXED: Use LOCAL coordinates since asteroids are children of positioned beltGroup
    const orbitX = Math.cos(time + orbitPhase) * planet.userData.orbitRadius;
    const orbitZ = Math.sin(time + orbitPhase) * planet.userData.orbitRadius;
    const orbitY = Math.sin(time * 0.5 + orbitPhase) * 10;
    
    // Set LOCAL position relative to parent beltGroup
    planet.position.set(orbitX, orbitY, orbitZ);
    
    // Keep asteroid rotation smooth - update every frame (cheap operation)
    if (planet.userData.rotationSpeed) {
        planet.rotation.x += planet.userData.rotationSpeed;
        planet.rotation.y += planet.userData.rotationSpeed * 0.7;
        planet.rotation.z += planet.userData.rotationSpeed * 0.4;
    }
}
        
        // PERFORMANCE: Optimized tendril animations for distant stars (active only)
        if (planet.userData.tendrilGroup && !planet.userData.isLocalStar && gameState.performanceMode !== 'minimal') {
            planet.userData.tendrilTime += 0.016;
            
            // Only update every few frames for performance
            if (gameState.frameCount % 3 === 0) {
                planet.userData.tendrilGroup.children.forEach((tendril, index) => {
                    if (tendril.userData) {
                        const time = planet.userData.tendrilTime;
                        const userData = tendril.userData;
                        
                        userData.age += 16.67;
                        
                        // Enhanced writhe animation for doubled world
                        const newPoints = userData.originalPoints.map((point, i) => {
                            const t = i / (userData.originalPoints.length - 1);
                            const writheTime = time * userData.writheSpeed + userData.animationOffset;
                            
                            return new THREE.Vector3(
                                point.x + Math.sin(writheTime + t * Math.PI * 2) * 4, // Doubled
                                point.y + Math.cos(writheTime * 1.3 + t * Math.PI * 3) * 6, // Doubled
                                point.z + Math.sin(writheTime * 0.8 + t * Math.PI * 4) * 4 // Doubled
                            );
                        });
                        
                        // Update curve and regenerate geometry
                        userData.curve = new THREE.CatmullRomCurve3(newPoints);
                        const newGeometry = new THREE.TubeGeometry(userData.curve, 20, 1.6, 8, false); // Doubled tube radius
                        tendril.geometry.dispose();
                        tendril.geometry = newGeometry;
                        
                        // Fade out effect
                        const fadeProgress = userData.age / userData.lifeTime;
                        if (fadeProgress < 1) {
                            tendril.material.opacity = 0.8 * (1 - fadeProgress);
                            tendril.material.emissiveIntensity = 1.0 * (1 - fadeProgress);
                        } else {
                            // Respawn tendril
                            userData.age = 0;
                            tendril.material.opacity = 0.8;
                            tendril.material.emissiveIntensity = 1.0;
                        }
                    }
                });
            }
        }

        // Update sun glow animation (performance optimized, active only)
        if (planet.userData.glowSphere && gameState.frameCount % 2 === 0) {
            const time = Date.now() * 0.001;
            const pulse = 0.2 + Math.sin(time * 1.5) * 0.1;
            planet.userData.glowSphere.material.opacity = pulse;
            planet.userData.glowSphere.rotation.y += 0.005;
        }
    });
    
    // Enhanced wormhole updates for doubled world (performance optimized)
    if (typeof wormholes !== 'undefined') {
        wormholes.forEach((wormhole, index) => {
            if (wormhole.userData.spiralSpeed) {
                wormhole.rotation.y += wormhole.userData.spiralSpeed;
                
                // Only update child rotations every few frames
                if (gameState.frameCount % 2 === 0) {
                    wormhole.children.forEach((child, childIndex) => {
                        if (child.geometry?.type === 'TorusGeometry') {
                            child.rotation.z += wormhole.userData.spiralSpeed * (1 + childIndex * 0.2);
                        }
                    });
                }
            }
            
            const pulseScale = 1 + Math.sin(Date.now() * 0.004) * 0.15;
            wormhole.scale.set(pulseScale, pulseScale, pulseScale);
            
            const distanceToPlayer = wormhole.position.distanceTo(camera.position);

if (distanceToPlayer < wormhole.userData.detectionRange && !wormhole.userData.detected) {
    wormhole.userData.detected = true;
    if (typeof showAchievement === 'function') {
        showAchievement('Spatial Anomaly Detected', `${wormhole.userData.name} discovered!`);
    }
}
            
            wormhole.userData.age += 16.67;
            if (wormhole.userData.age > wormhole.userData.lifeTime) {
                scene.remove(wormhole);
                wormholes.splice(index, 1);
            }
            
            if (distanceToPlayer < wormhole.userData.warpThreshold) {
                if (typeof showAchievement === 'function') {
                    showAchievement('Wormhole Transit', `Entering ${wormhole.userData.name}!`);
                }
                scene.remove(wormhole);
                wormholes.splice(index, 1);
                if (typeof transitionToRandomLocation === 'function') {
                    transitionToRandomLocation(wormhole.userData.name);
                }
                return;
            }
        });
    }
    
    // FIXED: Enhanced comet updates with proper trailing tails
if (typeof comets !== 'undefined') {
    comets.forEach((comet, index) => {
        if (comet.userData.velocity) {
            // Store previous position for tail tracking
            if (!comet.userData.previousPositions) {
                comet.userData.previousPositions = [];
                // Initialize with current position
                for (let i = 0; i < 50; i++) {
                    comet.userData.previousPositions.push(comet.position.clone());
                }
            }
            
            // Update comet position
            comet.position.add(comet.userData.velocity);
            
            // FIXED: Proper trailing tail system
            if (comet.userData.tail && gameState.frameCount % 2 === 0) { // Smoother updates
                // Add current position to history
                comet.userData.previousPositions.unshift(comet.position.clone());
                
                // Keep only the tail length we need
                if (comet.userData.previousPositions.length > 50) {
                    comet.userData.previousPositions.pop();
                }
                
                // Update tail geometry with actual trailing positions
                const tailPositions = comet.userData.tail.geometry.attributes.position.array;
                for (let i = 0; i < Math.min(50, comet.userData.previousPositions.length); i++) {
                    const pos = comet.userData.previousPositions[i];
                    const cometPos = comet.position;
                    
                    // Calculate relative position
                    tailPositions[i * 3] = pos.x - cometPos.x;
                    tailPositions[i * 3 + 1] = pos.y - cometPos.y;
                    tailPositions[i * 3 + 2] = pos.z - cometPos.z;
                }
                comet.userData.tail.geometry.attributes.position.needsUpdate = true;
            }
            
            const distanceToPlayer = comet.position.distanceTo(camera.position);
            const visibilityScale = Math.min(1, 2000 / Math.max(distanceToPlayer, 200));
            comet.scale.setScalar(visibilityScale * (1.5 + Math.sin(Date.now() * 0.003) * 0.3));
            
            // Enhanced tail visibility scaling
            if (comet.userData.tail) {
                const tailOpacity = Math.min(0.6, visibilityScale * 0.8);
                comet.userData.tail.material.opacity = tailOpacity;
            }
        }
    });
}

// =============================================================================
// COSMIC FEATURES AND NEBULA ANIMATION - COMPLETE SYSTEM
// =============================================================================

// Update cosmic features (pulsars, supernovas, plasma storms, etc.)
if (typeof updateCosmicFeatures === 'function') {
    updateCosmicFeatures();
}

// Animate nebula rotation
if (typeof nebulaClouds !== 'undefined' && nebulaClouds.length > 0) {
    nebulaClouds.forEach(nebula => {
        if (!nebula.userData) return;
        
        // Rotate entire nebula cloud
        if (nebula.userData.rotationSpeed) {
            nebula.rotation.y += nebula.userData.rotationSpeed;
        }
        
        // Animate brown dwarfs orbiting supernova cores
        nebula.children.forEach(child => {
            // Check if this is a brown dwarf
            if (child.userData && child.userData.type === 'brown_dwarf') {
                // Update orbit angle
                child.userData.orbitAngle += child.userData.orbitSpeed;
                
                // Calculate new orbital position around the supernova core (at 0,0,0 in nebula space)
                const x = Math.cos(child.userData.orbitAngle) * child.userData.orbitRadius;
                const z = Math.sin(child.userData.orbitAngle) * child.userData.orbitRadius;
                const y = Math.sin(child.userData.orbitAngle * 2) * 15; // Slight vertical oscillation
                
                // Apply new position
                child.position.set(x, y, z);
                
                // Rotate brown dwarf itself for realism
                child.rotation.y += 0.01;
                child.rotation.x += 0.005;
            }
            
            // Also check for supernova cores and make them pulse
            if (child.userData && child.userData.type === 'supernova' && child.userData.isCentralCore) {
                const pulseTime = Date.now() * 0.001;
                const pulse = Math.sin(pulseTime * 2) * 0.1;
                child.scale.setScalar(1 + pulse);
                
                // Pulse the glow child if it exists
                if (child.children[0] && child.children[0].material) {
                    child.children[0].material.opacity = 0.4 + pulse * 0.2;
                }
            }
        });
    });
}

// In your animate() function, add this with your other planet updates:
planets.forEach(planet => {
    if (planet.userData.type === 'blackhole' && planet.userData.starCluster) {
        // Get rotation speed from userData, or use default based on black hole type
        let rotationSpeed = planet.userData.rotationSpeed;
        
        // If no rotation speed set, assign based on type
        if (!rotationSpeed) {
            if (planet.userData.isGalacticCenter || planet.userData.isSagittariusA) {
                rotationSpeed = 0.025; // Sagittarius A* speed
            } else if (planet.userData.isGalacticCore) {
                rotationSpeed = 0.020; // Other galactic cores speed
            } else {
                rotationSpeed = 0.015; // Default for other black holes
            }
            planet.userData.rotationSpeed = rotationSpeed; // Store for future use
        }
        
        planet.userData.starCluster.rotation.y += rotationSpeed;
        
        // Slight wobble for dynamic effect
        planet.userData.starCluster.rotation.x = Math.sin(Date.now() * 0.0001) * 0.05;
    }
});

planets.forEach(planet => {
    if (planet.userData.type === 'blackhole' && planet.userData.rotationSpeed) {
        // Rotate star cluster (small dense stars near black hole)
        if (planet.userData.starCluster) {
            planet.userData.starCluster.rotation.y += planet.userData.rotationSpeed;
        }
        
        // Rotate main galaxy stars (the spiral/ring/elliptical structure)
        if (planet.userData.galaxyStars) {
            planet.userData.galaxyStars.rotation.y += planet.userData.rotationSpeed;
        }
    }
});

// Also add interaction checking:
if (typeof checkCosmicFeatureInteractions === 'function' && typeof camera !== 'undefined' && typeof gameState !== 'undefined') {
    checkCosmicFeatureInteractions(camera.position, gameState);
}
    
    // Enhanced enemy behavior update
    if (typeof perfDebug !== 'undefined') perfDebug.startTimer('enemies');
    if (gameState.frameCount % 2 === 0 && typeof updateEnemyBehavior === 'function') {
        updateEnemyBehavior();
    }
    if (typeof perfDebug !== 'undefined') perfDebug.endTimer('enemies');
    
    // Update civilian combat (enemies attacking civilians, distress calls)
    if (gameState.frameCount % 3 === 0 && typeof updateCivilianCombat === 'function') {
        updateCivilianCombat();
    }
    
    // Update civilian map display
    if (gameState.frameCount % 30 === 0 && typeof updateCivilianMapDisplay === 'function') {
        updateCivilianMapDisplay();
    }

    // Update missiles
    if (typeof updateMissiles === 'function') {
        updateMissiles();
    }

    // Update unstable wormholes
    if (typeof updateUnstableWormholes === 'function') {
        updateUnstableWormholes(16.67);
    }

    // Update ambient space debris
    if (typeof updateAmbientSpaceDebris === 'function') {
        updateAmbientSpaceDebris();
    }

    // Update missile cooldown
    if (gameState.missiles.cooldown > 0) {
        gameState.missiles.cooldown = Math.max(0, gameState.missiles.cooldown - 16.67);
    }

    // Update weapon cooldown
    if (gameState.weapons && gameState.weapons.cooldown > 0) {
        gameState.weapons.cooldown = Math.max(0, gameState.weapons.cooldown - 16.67);
    }

    // Update explosion animations (frame-based animation system)
    if (typeof explosionManager !== 'undefined') {
        explosionManager.update(16.67); // Pass frame time in ms
    }

    // Check for hull zero - mission fail
    if (gameState.hull <= 0 && !gameState.gameOver) {
        if (typeof createPlayerExplosion === 'function') {
            createPlayerExplosion();
        }
        if (typeof showGameOverScreen === 'function') {
            showGameOverScreen('HULL BREACH', 'Ship destroyed - structural integrity failure');
        }
    }

    // Check for Borg spawn (every 5 seconds)
    if (gameState.frameCount % 300 === 0 && typeof checkBorgSpawn === 'function') {
        checkBorgSpawn();
    }

    // Update Borg behavior
    if (typeof updateBorgBehavior === 'function') {
        updateBorgBehavior();
    }

    // Enhanced physics and controls for doubled world
    if (typeof perfDebug !== 'undefined') perfDebug.startTimer('physics');
    if (typeof updateEnhancedPhysics === 'function') {
        updateEnhancedPhysics();
    }
    if (typeof perfDebug !== 'undefined') perfDebug.endTimer('physics');
    
    // FORCE NORMAL PERFORMANCE MODE - disable auto-adjustment temporarily
    gameState.performanceMode = 'normal';
    gameState.averageFrameTime = 16.67; // Reset to good performance
    
    // Update UI every few frames
    if (gameState.frameCount % 2 === 0) {
        if (typeof updateUI === 'function') updateUI();
        if (typeof updateCompass === 'function') updateCompass();
        if (typeof updateGalaxyMap === 'function') updateGalaxyMap();
    }

    // Update crosshair less frequently to avoid interfering with UI clicks
    if (gameState.frameCount % 3 === 0 && typeof updateCrosshairTargeting === 'function') {
        updateCrosshairTargeting();
    }
    
    // DIAGNOSTIC: Disabled to reduce console spam
    // Uncomment below to debug performance issues
    /*
    if (gameState.frameCount % 60 === 0) {
        console.log('=== FRAME DIAGNOSTIC ===');
        console.log('Map View:', gameState.mapView);
        console.log('Planets array length:', planets ? planets.length : 0);
        console.log('Enemies array length:', enemies ? enemies.length : 0);
        console.log('Asteroid belts:', asteroidBelts ? asteroidBelts.length : 0);
        console.log('Local galaxy stars visible:', typeof localGalaxyStars !== 'undefined' && localGalaxyStars ? localGalaxyStars.visible : 'N/A');
        console.log('Scene children count:', scene ? scene.children.length : 0);
        console.log('Frame time:', frameTime.toFixed(2), 'ms');
        console.log('updateGalaxyMap called:', gameState.frameCount % 60 === 0 ? 'YES' : 'NO');
    }
    */

    // ATMOSPHERIC PERSPECTIVE: Update distance-based effects
    // Optimized with caching - update every 15 frames for performance
    if (gameState.frameCount % 15 === 0 && typeof updateAtmosphericPerspective === 'function') {
        updateAtmosphericPerspective(camera);
    }

    // Depth of field disabled for performance (was causing expensive scene traversals)

    // PERFORMANCE DEBUG: Time render call
    if (typeof perfDebug !== 'undefined') perfDebug.startTimer('render');
    renderer.render(scene, camera);
    if (typeof perfDebug !== 'undefined') {
        perfDebug.endTimer('render');
        perfDebug.endTimer('total');
    }
}

// FIXED: Enhanced orbital mechanics that work for ALL galaxies - ADJUSTED SPEEDS (75% slower)
function updatePlanetOrbits() {
    // Process ALL planets - no distance culling (was causing asteroids to pop in/out)
    const playerPos = camera.position;
    
    // PERF DEBUG: Log planet count every 300 frames
    if (gameState.frameCount % 300 === 0) {
        console.log(`📊 PERF: Processing all ${planets.length} planets (no cull distance)`);
    }
    
    planets.forEach((planet) => {
        // Skip if planet is destroyed or doesn't exist
        if (!planet || !planet.userData) return;
        
        // Basic planet rotation with diverse speeds based on type and location
if (planet.rotation && !planet.userData.isLocalStar) {
    // Use individual rotation speed if available, otherwise use default
    const rotationSpeed = planet.userData.rotationSpeed || 0.02;
    planet.rotation.y += rotationSpeed;
}
        
         // FIXED: Enhanced orbital mechanics for ALL planets with orbital data - ADJUSTED SPEEDS
        if (planet.userData.orbitRadius > 0 && planet.userData.systemCenter) {
            // ADJUSTED orbital speeds with MUCH higher multipliers for visibility
            let baseSpeed = planet.userData.orbitSpeed || 0.015;
            
            // FIXED: Apply MUCH higher speed multipliers for visible orbits
            if (planet.userData.isLocal) {
                baseSpeed *= 3.0; // INCREASED from 1.25
            } else if (planet.userData.isDistant) {
                baseSpeed *= 25.0; // CRITICAL: Distant planets need huge multiplier!
            } else {
                baseSpeed *= 5.0; // INCREASED from 1.5
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
            
            // CRITICAL FIX: Update matrix for planets with matrixAutoUpdate disabled!
            if (planet.matrixAutoUpdate === false) {
                planet.updateMatrix();
            }
        }
// Moon orbital mechanics (relative to parent planet) - LOCAL COORDINATES
else if (planet.userData.parentPlanet && planet.userData.orbitRadius > 0) {
    // Ensure moon is always visible
    planet.visible = true;
    planet.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling for planets
    
    // Check if moon is a child of its parent planet
    const isChildOfParent = planet.parent === planet.userData.parentPlanet;
    
    let moonSpeed = planet.userData.orbitSpeed || 0.1;
    
    // FIXED: Speed adjustments based on moon type with proper distant galaxy handling
    if (planet.userData.isLocal) {
        moonSpeed *= 5; // Local system moons orbit faster
    } else if (planet.userData.isLocalGateway) {
        moonSpeed *= 2.8; // Local gateway system moons
    } else if (planet.userData.nebulaId !== undefined) {
        moonSpeed *= 1.8; // Nebula moons orbit at medium speed
    } else if (planet.userData.isDistant) {
        moonSpeed *= 10.0; // CRITICAL: Distant galaxy moons need MUCH higher multiplier
    } else {
        moonSpeed *= 5.0; // Default moon speed (increased from 2.0)
    }
    
    const time = Date.now() * 0.001 * moonSpeed;
    const orbitPhase = planet.userData.orbitPhase || 0;
    const moonX = Math.cos(time + orbitPhase) * planet.userData.orbitRadius;
    const moonZ = Math.sin(time + orbitPhase) * planet.userData.orbitRadius;
    const moonY = Math.sin(time * 0.5 + orbitPhase) * 4;
    
    if (isChildOfParent) {
        // âœ… CORRECT: Moon is a child, use LOCAL coordinates
        planet.position.set(moonX, moonY, moonZ);
    } else {
        // âš ï¸ FALLBACK: Moon is not a child, use WORLD coordinates
        if (planet.userData.parentPlanet.position) {
            const parentPos = planet.userData.parentPlanet.position;
            planet.position.set(parentPos.x + moonX, parentPos.y + moonY, parentPos.z + moonZ);
        }
    }
}
    });
}

// NEW: Update galactic orbital mechanics - entire star systems orbit galaxy centers
function updateGalacticOrbits() {
    if (typeof planets === 'undefined' || typeof galaxyTypes === 'undefined') return;
    
    const time = Date.now() * 0.001;
    
    // Group planets by their star system
    const systems = {};
    
    planets.forEach(planet => {
        // Only process distant galaxy objects with systemCenter
        if (!planet.userData.systemCenter || planet.userData.isLocal) return;
        if (planet.userData.type === 'blackhole' && planet.userData.isGalacticCore) return; // Skip galaxy cores
        
        const galaxyId = planet.userData.galaxyId;
        if (galaxyId === undefined || galaxyId < 0 || galaxyId === 7) return; // Skip local galaxy
        
        const systemKey = `${galaxyId}-${planet.userData.systemCenter.x.toFixed(0)}-${planet.userData.systemCenter.z.toFixed(0)}`;
        
        if (!systems[systemKey]) {
            systems[systemKey] = {
                galaxyId: galaxyId,
                systemCenter: planet.userData.systemCenter,
                planets: []
            };
        }
        
        systems[systemKey].planets.push(planet);
    });
    
    // Update each system's orbit around its galactic core
    Object.values(systems).forEach(system => {
        const galaxyId = system.galaxyId;
        const galaxyType = galaxyTypes[galaxyId];
        if (!galaxyType) return;
        
        // Find the galactic core position
        const galacticCore = planets.find(p => 
            p.userData.type === 'blackhole' && 
            p.userData.isGalacticCore && 
            p.userData.galaxyId === galaxyId
        );
        
        if (!galacticCore) return;
        
        const corePosition = galacticCore.position;
        const systemCenter = system.systemCenter;
        
        // Calculate orbital parameters for this system
        const galacticOrbitRadius = Math.sqrt(
            Math.pow(systemCenter.x - corePosition.x, 2) +
            Math.pow(systemCenter.z - corePosition.z, 2)
        );
        
        // Very slow galactic orbit (systems take ages to orbit galaxy)
        const galacticOrbitSpeed = 0.00001 / (galacticOrbitRadius * 0.001); // Extremely slow
        const orbitPhase = (systemCenter.x + systemCenter.z) * 0.001; // Unique phase per system
        
        const galacticTime = time * galacticOrbitSpeed;
        
        // Calculate new system center position orbiting the galactic core
        const newSystemX = corePosition.x + Math.cos(galacticTime + orbitPhase) * galacticOrbitRadius;
        const newSystemZ = corePosition.z + Math.sin(galacticTime + orbitPhase) * galacticOrbitRadius;
        const newSystemY = systemCenter.y; // Keep same height
        
        // Calculate the offset from old to new position
        const offsetX = newSystemX - systemCenter.x;
        const offsetZ = newSystemZ - systemCenter.z;
        const offsetY = newSystemY - systemCenter.y;
        
        // Move all planets in this system by the offset
        system.planets.forEach(planet => {
            planet.position.x += offsetX;
            planet.position.z += offsetZ;
            planet.position.y += offsetY;
            
            // Update systemCenter for next frame
            planet.userData.systemCenter = {
                x: newSystemX,
                y: newSystemY,
                z: newSystemZ
            };
        });
    });
}
// =============================================================================
// DIAGNOSTIC AND DEBUG FUNCTIONS
// =============================================================================

// Add this function to game-core.js for debugging (optional):
function logBlackHoleRotationSpeeds() {
    console.log('Black Hole Rotation Speeds:');
    planets.forEach(planet => {
        if (planet.userData.type === 'blackhole' && planet.userData.rotationSpeed) {
            const speedRPM = (planet.userData.rotationSpeed * 60 * 60) / (2 * Math.PI); // Convert to rotations per minute
            console.log(`${planet.userData.name}: ${planet.userData.rotationSpeed.toFixed(4)} rad/frame (${speedRPM.toFixed(2)} RPM)`);
        }
    });
}

// Make functions globally available for debugging
if (typeof window !== 'undefined') {
    window.gameState = gameState;
    window.forceCreateOrbitLines = forceCreateOrbitLines;
    window.toggleOrbitLines = toggleOrbitLines;
    window.updatePlanetOrbits = updatePlanetOrbits;
    window.isPositionTooClose = isPositionTooClose;
    
   // ADD THESE ARRAY EXPORTS:
    window.asteroidBelts = asteroidBelts;
    window.planets = planets;
    window.enemies = enemies;
    window.comets = comets;
    window.wormholes = wormholes;
    window.nebulaClouds = nebulaClouds;
    window.nebulaGasClouds = nebulaGasClouds;
    window.orbitLines = orbitLines;
    
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
