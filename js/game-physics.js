// Game Physics - Enhanced Movement, gravity, and physics systems
// SPECIFICATION COMPLIANT: Implements exact flight control system as specified
// DOUBLED WORLD SIZE: All distances and masses doubled while keeping player/enemy size the same
// FLIGHT CONTROLS: Direct camera.rotateX/Y/Z() calls for intuitive local space rotations
// COMPLETE: All original functionality preserved with specification-compliant controls

// =============================================================================
// ENHANCED FLIGHT CONTROL FUNCTIONS - SPECIFICATION COMPLIANT
// =============================================================================

// Initialize timing variables for auto-leveling system
let lastPitchInputTime = 0;
let lastRollInputTime = 0;

// Camera rotation tracking for auto-navigation compatibility
let cameraRotationTracking = { x: 0, y: 0, z: 0 };

// NEW: Rotational inertia system for space-like flight feel
let rotationalVelocity = { pitch: 0, yaw: 0, roll: 0 };
const rotationalInertia = {
    acceleration: 0.0020,       // How quickly rotation speeds up (slower for fine control)
    deceleration: 0.95,        // How quickly rotation slows down (0.92 = retain 92% per frame)
    maxSpeed: 0.014,           // Maximum rotation speed (reduced for finer control)
    bankingFactor: -2.5,        // How much to bank when turning at full speed (scaled by velocity)
    bankingSmoothing: 0.2     // How smoothly banking is applied
};

function orientTowardsTarget(target) {
    if (!target || typeof camera === 'undefined') return false;
    
    // Get direction to target
    const direction = new THREE.Vector3().subVectors(target.position, camera.position).normalize();
    
    // Get current camera forward direction
    const currentForward = new THREE.Vector3();
    camera.getWorldDirection(currentForward);
    
    // Calculate the angle between current direction and target direction
    const angle = currentForward.angleTo(direction);
    
    // If already oriented (within 5 degrees), return true
    const orientationThreshold = 0.087; // ~5 degrees
    if (angle < orientationThreshold) {
        return true;
    }
    
    // Calculate rotation axis using cross product
    const rotationAxis = new THREE.Vector3().crossVectors(currentForward, direction).normalize();
    
    // If vectors are parallel/anti-parallel, use world up as rotation axis
    if (rotationAxis.length() < 0.001) {
        rotationAxis.set(0, 1, 0);
    }
    
    // Create smooth rotation towards target
    const rotationSpeed = 0.03; // Smooth rotation speed
    const maxRotationPerFrame = 0.05; // Maximum rotation per frame to prevent flipping
    
    const rotationAmount = Math.min(angle * rotationSpeed, maxRotationPerFrame);
    
    // Create quaternion for the rotation
    const quaternion = new THREE.Quaternion().setFromAxisAngle(rotationAxis, rotationAmount);
    
    // Apply rotation to camera while preserving roll
    const currentQuaternion = camera.quaternion.clone();
    camera.quaternion.multiplyQuaternions(quaternion, currentQuaternion);
    
    // Update tracking for compatibility
    cameraRotationTracking.x = camera.rotation.x;
    cameraRotationTracking.y = camera.rotation.y;
    cameraRotationTracking.z = camera.rotation.z;
    
    // Update timing to prevent auto-level interference during auto-navigation
    const now = performance.now();
    lastPitchInputTime = now;
    lastRollInputTime = now;
    
    // Check if we're close enough to target direction
    camera.getWorldDirection(currentForward);
    const finalAngle = currentForward.angleTo(direction);
    
    return finalAngle < orientationThreshold;
}

// NEW: Apply rotational inertia for space-like flight controls
function applyRotationalInertia(keys, allowManualRotation) {
    // Apply acceleration when keys are pressed
    if (allowManualRotation) {
        // Pitch controls (up/down)
        if (keys.up) {
            rotationalVelocity.pitch += rotationalInertia.acceleration;
            lastPitchInputTime = performance.now();
        } else if (keys.down) {
            rotationalVelocity.pitch -= rotationalInertia.acceleration;
            lastPitchInputTime = performance.now();
        } else {
            // Apply deceleration when no input
            rotationalVelocity.pitch *= rotationalInertia.deceleration;
        }
        
        // Yaw controls (left/right arrows for turning)
        if (keys.left) {
            rotationalVelocity.yaw += rotationalInertia.acceleration;
            lastRollInputTime = performance.now();
        } else if (keys.right) {
            rotationalVelocity.yaw -= rotationalInertia.acceleration;
            lastRollInputTime = performance.now();
        } else {
            // Apply deceleration when no input
            rotationalVelocity.yaw *= rotationalInertia.deceleration;
        }
    }
    
    // Roll controls (Q/E keys for barrel roll) - always available
    if (keys.q) {
        rotationalVelocity.roll += rotationalInertia.acceleration;
        lastRollInputTime = performance.now();
    } else if (keys.e) {
        rotationalVelocity.roll -= rotationalInertia.acceleration;
        lastRollInputTime = performance.now();
    } else {
        // Apply deceleration when no input
        rotationalVelocity.roll *= rotationalInertia.deceleration;
    }
    
    // Clamp rotational velocities to max speed
    rotationalVelocity.pitch = Math.max(-rotationalInertia.maxSpeed, 
                                        Math.min(rotationalInertia.maxSpeed, rotationalVelocity.pitch));
    rotationalVelocity.yaw = Math.max(-rotationalInertia.maxSpeed, 
                                      Math.min(rotationalInertia.maxSpeed, rotationalVelocity.yaw));
    rotationalVelocity.roll = Math.max(-rotationalInertia.maxSpeed, 
                                       Math.min(rotationalInertia.maxSpeed, rotationalVelocity.roll));
    
    // Apply pitch (looking up/down) - this is always relative to current orientation
    if (Math.abs(rotationalVelocity.pitch) > 0.00001) {
        camera.rotateX(rotationalVelocity.pitch);
    }
    
    // Apply yaw (turning left/right) - this is always relative to current orientation
    if (Math.abs(rotationalVelocity.yaw) > 0.00001) {
        camera.rotateY(rotationalVelocity.yaw);
    }
    
    // Apply roll (barrel roll) with SPEED-DEPENDENT automatic banking from yaw
    // Banking increases with speed - slow = minimal banking, fast = aggressive banking
    const currentSpeed = typeof gameState !== 'undefined' && gameState.velocity ? gameState.velocity : 0;
    const minSpeed = 0.5;  // Minimum speed for banking
    const maxSpeed = 6.0;  // Speed at which banking reaches maximum
    
    // Calculate speed factor (0 to 1, where 0 = no banking, 1 = full banking)
    const speedFactor = Math.max(0, Math.min(1, (currentSpeed - minSpeed) / (maxSpeed - minSpeed)));
    
    // Apply banking proportional to both yaw velocity and current speed
    // SKIP banking during mobile touch input to prevent unwanted roll
    let bankingFromYaw = 0;
    if (!window.mobileTouchActive) {
        bankingFromYaw = -rotationalVelocity.yaw * rotationalInertia.bankingFactor * speedFactor;
    }
    const totalRoll = rotationalVelocity.roll + bankingFromYaw;
    
    if (Math.abs(totalRoll) > 0.00001) {
        camera.rotateZ(totalRoll);
    }
    
    // Update tracking for auto-navigation compatibility
    cameraRotationTracking.x = camera.rotation.x;
    cameraRotationTracking.y = camera.rotation.y;
    cameraRotationTracking.z = camera.rotation.z;
    
    // Stop very small rotations to prevent drift
    if (Math.abs(rotationalVelocity.pitch) < 0.00001) rotationalVelocity.pitch = 0;
    if (Math.abs(rotationalVelocity.yaw) < 0.00001) rotationalVelocity.yaw = 0;
    if (Math.abs(rotationalVelocity.roll) < 0.00001) rotationalVelocity.roll = 0;
}

// Initialize enhanced game state properties
function initializeEnhancedGameStateProperties() {
    console.log('🔧 Initializing enhanced gameState properties...');
    
    // Auto-leveling properties - OFF by default as requested
    if (typeof gameState.autoLevelingEnabled === 'undefined') {
        gameState.autoLevelingEnabled = false; // OFF by default
    }
    
    // Black hole warp properties
    if (!gameState.blackHoleWarp) {
        gameState.blackHoleWarp = {
            active: false,
            charging: false,
            chargeStart: 0,
            chargeDuration: 1500,
            targetBlackHole: null,
            orbitRadius: 200,
            orbitSpeed: 0.02,
            orbitAngle: 0
        };
    }

    // Emergency warp properties
    if (!gameState.emergencyWarp) {
    gameState.emergencyWarp = {
        available: 5,
        cooldown: 0,
        boostDuration: 8000,
        boostSpeed: 15.0,
        active: false,
        timeRemaining: 0,
        postWarp: false,  // NEW: Track momentum coasting phase
        inertiaDecay: 0.9999,
        lastRegenTime: 0
        };
    }

// Initialize momentum coasting system in gameState (add to initialization)
gameState.emergencyWarp = {
    available: 5,
    cooldown: 0,
    boostDuration: 8000,
    boostSpeed: 15.0,
    active: false,
    timeRemaining: 0,
    postWarp: false,  // NEW: Track post-warp coasting
    inertiaDecay: 0.9995  // NEW: Very gradual momentum decay
};

    // Event horizon warning system
    if (!gameState.eventHorizonWarning) {
        gameState.eventHorizonWarning = {
            active: false,
            blackHole: null,
            warningDistance: 300,
            criticalDistance: 120
        };
    }
    // Call this during game initialization
	if (typeof window !== 'undefined') {
    window.initializeFixedSystems = initializeFixedSystems;
	}
}

function initializeFixedSystems() {
    // Initialize distance tracking
    if (typeof gameState !== 'undefined') {
        if (typeof gameState.distance === 'undefined') {
            gameState.distance = 0;
        }
        
        // Initialize emergency warp regeneration
        if (!gameState.emergencyWarp.lastRegenTime) {
            gameState.emergencyWarp.lastRegenTime = Date.now();
        }
    }
}

// PRESERVED: Simple hyperspace effect for visual feedback
function createHyperspaceEffect() {
    for (let i = 0; i < 30; i++) {
        setTimeout(() => {
            const trail = document.createElement('div');
            trail.className = 'star-trail';
            
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const angle = (i / 30) * Math.PI * 2;
            const startRadius = 50;
            
            trail.style.left = (centerX + Math.cos(angle) * startRadius) + 'px';
            trail.style.top = (centerY + Math.sin(angle) * startRadius) + 'px';
            
            document.body.appendChild(trail);
            
            setTimeout(() => trail.remove(), 300);
        }, i * 15);
    }
}

// REMOVED: createEnhancedScreenDamageEffect - using directional version from game-controls.js

// COMPACT: All the cool effects but much smaller scale
function createAsteroidExplosion(position, radius = 1) {
    console.log('Creating compact asteroid explosion at position:', position, 'with radius:', radius);

    const explosionGroup = new THREE.Group();
    explosionGroup.position.copy(position);
    scene.add(explosionGroup);

    // MAIN EXPLOSION SPHERE - Small but visible
    const mainExplosionGeometry = new THREE.SphereGeometry(radius * 0.4, 12, 12);
    const mainExplosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.8
    });
    const mainExplosion = new THREE.Mesh(mainExplosionGeometry, mainExplosionMaterial);
    explosionGroup.add(mainExplosion);

    // PARTICLE DEBRIS - Much larger and more numerous
    const particleCount = 20;
    const particles = [];
    const particleVelocities = [];

    for (let i = 0; i < particleCount; i++) {
        const particleGeometry = new THREE.SphereGeometry(1 + Math.random() * 2, 6, 6);
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(0.1 + Math.random() * 0.15, 0.8, 0.5 + Math.random() * 0.3),
            transparent: true,
            opacity: 0.9
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);

        // Much larger velocity spread
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 25,
            (Math.random() - 0.5) * 25,
            (Math.random() - 0.5) * 25
        );

        explosionGroup.add(particle);
        particles.push({ mesh: particle, geometry: particleGeometry, material: particleMaterial, life: 1.0 });
        particleVelocities.push(velocity);
    }

    // SHOCKWAVE RING EFFECT - Smaller but still visible
    const shockwaveGeometry = new THREE.RingGeometry(radius * .6, radius * 1, 16);
    const shockwaveMaterial = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
    shockwave.rotation.x = Math.PI / 2;
    explosionGroup.add(shockwave);

    // Add to explosion manager
    let explosionScale = 1;
    let explosionOpacity = 0.8;
    let shockwaveScale = 1;
    let shockwaveOpacity = 0.5;
    let elapsedTime = 0;

    if (typeof explosionManager !== 'undefined') {
        explosionManager.addExplosion({
            update(deltaTime) {
                elapsedTime += deltaTime;

                // Update main explosion
                explosionScale += 1 * (deltaTime / 60);
                explosionOpacity -= 0.1 * (deltaTime / 60);
                mainExplosion.scale.set(explosionScale, explosionScale, explosionScale);
                mainExplosionMaterial.opacity = Math.max(0, explosionOpacity);

                // Update particles
                const deltaFactor = deltaTime / 50;
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];
                    if (p.life > 0) {
                        p.mesh.position.add(particleVelocities[i].clone().multiplyScalar(0.2 * deltaFactor));
                        p.life -= 0.08 * deltaFactor;
                        p.material.opacity = Math.max(0, p.life);
                        p.mesh.scale.set(p.life, p.life, p.life);
                    }
                }

                // Update shockwave
                shockwaveScale += 1.5 * (deltaTime / 50);
                shockwaveOpacity -= 0.05 * (deltaTime / 50);
                shockwave.scale.set(shockwaveScale, shockwaveScale, 1);
                shockwaveMaterial.opacity = Math.max(0, shockwaveOpacity);

                // Complete after 2 seconds
                return elapsedTime < 2000;
            },

            cleanup() {
                scene.remove(explosionGroup);
                mainExplosionGeometry.dispose();
                mainExplosionMaterial.dispose();
                particles.forEach(p => {
                    p.geometry.dispose();
                    p.material.dispose();
                });
                shockwaveGeometry.dispose();
                shockwaveMaterial.dispose();
            }
        });
    }
}

// DRAMATIC PLAYER EXPLOSION - Full screen with vaporizing effect
function createPlayerExplosion() {
    console.log('Creating dramatic player ship explosion!');

    const playerPos = camera.position.clone();
    const explosionGroup = new THREE.Group();
    explosionGroup.position.copy(playerPos);
    scene.add(explosionGroup);

    // MASSIVE MAIN EXPLOSION SPHERE
    const mainExplosionGeometry = new THREE.SphereGeometry(50, 32, 32);
    const mainExplosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xff3300,
        transparent: true,
        opacity: 1.0
    });
    const mainExplosion = new THREE.Mesh(mainExplosionGeometry, mainExplosionMaterial);
    explosionGroup.add(mainExplosion);

    // MASSIVE PARTICLE DEBRIS FIELD
    const particleCount = 100;
    const particles = [];
    const particleVelocities = [];

    for (let i = 0; i < particleCount; i++) {
        const particleGeometry = new THREE.SphereGeometry(2 + Math.random() * 5, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(0.05 + Math.random() * 0.15, 1.0, 0.5),
            transparent: true,
            opacity: 1.0
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);

        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 60,
            (Math.random() - 0.5) * 60,
            (Math.random() - 0.5) * 60
        );

        explosionGroup.add(particle);
        particles.push({ mesh: particle, geometry: particleGeometry, material: particleMaterial, life: 1.0 });
        particleVelocities.push(velocity);
    }

    // Add main explosion to manager
    let explosionScale = 1;
    let explosionOpacity = 1.0;

    if (typeof explosionManager !== 'undefined') {
        explosionManager.addExplosion({
            update(deltaTime) {
                // Update main explosion
                explosionScale += 5 * (deltaTime / 50);
                explosionOpacity -= 0.02 * (deltaTime / 50);
                mainExplosion.scale.set(explosionScale, explosionScale, explosionScale);
                mainExplosionMaterial.opacity = Math.max(0, explosionOpacity);

                // Update particles
                const deltaFactor = deltaTime / 50;
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];
                    if (p.life > 0) {
                        p.mesh.position.add(particleVelocities[i].clone().multiplyScalar(0.3 * deltaFactor));
                        p.life -= 0.02 * deltaFactor;
                        p.material.opacity = Math.max(0, p.life);
                        p.mesh.scale.set(p.life, p.life, p.life);
                    }
                }

                return explosionOpacity > 0;
            },

            cleanup() {
                explosionGroup.remove(mainExplosion);
                mainExplosionGeometry.dispose();
                mainExplosionMaterial.dispose();
                particles.forEach(p => {
                    explosionGroup.remove(p.mesh);
                    p.geometry.dispose();
                    p.material.dispose();
                });
            }
        });

        // MULTIPLE SHOCKWAVES
        for (let i = 0; i < 3; i++) {
            const waveDelay = i * 200;
            let waveCreated = false;
            let waveDelayElapsed = 0;

            explosionManager.addExplosion({
                update(deltaTime) {
                    waveDelayElapsed += deltaTime;

                    if (!waveCreated && waveDelayElapsed >= waveDelay) {
                        waveCreated = true;
                        const shockwaveGeometry = new THREE.RingGeometry(10, 15, 32);
                        const shockwaveMaterial = new THREE.MeshBasicMaterial({
                            color: 0xff6600,
                            transparent: true,
                            opacity: 0.8,
                            side: THREE.DoubleSide
                        });
                        const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
                        shockwave.rotation.x = Math.PI / 2;
                        explosionGroup.add(shockwave);

                        this.shockwave = shockwave;
                        this.shockwaveGeometry = shockwaveGeometry;
                        this.shockwaveMaterial = shockwaveMaterial;
                        this.shockwaveScale = 1;
                        this.shockwaveOpacity = 0.8;
                    }

                    if (waveCreated && this.shockwave) {
                        this.shockwaveScale += 8 * (deltaTime / 50);
                        this.shockwaveOpacity -= 0.04 * (deltaTime / 50);
                        this.shockwave.scale.set(this.shockwaveScale, this.shockwaveScale, 1);
                        this.shockwaveMaterial.opacity = Math.max(0, this.shockwaveOpacity);

                        return this.shockwaveOpacity > 0;
                    }

                    return true;
                },

                cleanup() {
                    if (this.shockwave) {
                        explosionGroup.remove(this.shockwave);
                        this.shockwaveGeometry.dispose();
                        this.shockwaveMaterial.dispose();
                    }
                }
            });
        }
    }

    // Play vaporizing sound effect
    if (typeof playSound !== 'undefined') {
        playSound('ship_vaporize');
    }

    // FULL-SCREEN VAPORIZING EXPLOSION OVERLAY
    const fullScreenOverlay = document.createElement('div');
    fullScreenOverlay.id = 'playerExplosionOverlay';
    fullScreenOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: radial-gradient(circle, rgba(255,100,0,0.9) 0%, rgba(255,50,0,0.7) 30%, rgba(200,0,0,0.5) 60%, transparent 100%);
        z-index: 5000;
        pointer-events: none;
        opacity: 0;
        animation: vaporizeExplosion 2s ease-out forwards;
    `;

    // Add keyframe animation
    if (!document.getElementById('vaporizeExplosionStyle')) {
        const style = document.createElement('style');
        style.id = 'vaporizeExplosionStyle';
        style.textContent = `
            @keyframes vaporizeExplosion {
                0% {
                    opacity: 0;
                    transform: scale(0.5);
                }
                20% {
                    opacity: 1;
                    transform: scale(1.2);
                }
                40% {
                    opacity: 0.8;
                    transform: scale(1.5);
                }
                100% {
                    opacity: 0;
                    transform: scale(3);
                }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(fullScreenOverlay);

    // Remove overlay after animation
    setTimeout(() => {
        if (fullScreenOverlay.parentNode) {
            fullScreenOverlay.parentNode.removeChild(fullScreenOverlay);
        }
    }, 2000);

    // Cleanup
    setTimeout(() => {
        if (explosionGroup.parent) {
            scene.remove(explosionGroup);
        }
        console.log('Player explosion cleanup complete');
    }, 5000);
}

// RESTORED: Asteroid destruction functions
function destroyAsteroid(asteroid) {
    scene.remove(asteroid);
    
    const planetIndex = planets.indexOf(asteroid);
    if (planetIndex > -1) planets.splice(planetIndex, 1);
    
    const activeIndex = activePlanets.indexOf(asteroid);
    if (activeIndex > -1) activePlanets.splice(activeIndex, 1);
    
    if (asteroid.userData.beltGroup) {
        asteroid.userData.beltGroup.remove(asteroid);
    }
    
    if (typeof asteroidBelts !== 'undefined') {
        asteroidBelts.forEach(belt => {
            if (belt.children) {
                const beltIndex = belt.children.indexOf(asteroid);
                if (beltIndex > -1) {
                    belt.remove(asteroid);
                }
            }
        });
    }
    
    if (typeof gameState !== 'undefined' && gameState.targetLock.target === asteroid) {
        gameState.targetLock.target = null;
    }
    if (typeof gameState !== 'undefined' && gameState.currentTarget === asteroid) {
        gameState.currentTarget = null;
    }
}

function destroyAsteroidByWeapon(asteroid, hitPosition = null) {
    console.log('destroyAsteroidByWeapon called for:', asteroid.userData.name);
    
    // FIXED: Account for asteroid scale when calculating radius
    const baseRadius = asteroid.geometry ? asteroid.geometry.parameters.radius : 1;
    const actualRadius = baseRadius * (asteroid.scale.x || 1); // Use scale to get actual size
    const hullRestoration = Math.min(15 + (actualRadius * 2), 25);
    
    gameState.hull = Math.min(gameState.maxHull, gameState.hull + hullRestoration);
    
    const explosionPosition = hitPosition ? hitPosition.clone() : asteroid.position.clone();
    
    // FIXED: Pass actual visual radius to explosion, not base radius
    createAsteroidExplosion(explosionPosition, actualRadius);
    
    if (typeof playSound !== 'undefined') {
        playSound('explosion');
    }
    
    destroyAsteroid(asteroid);
    console.log(`Asteroid destroyed by weapon fire: ${asteroid.userData.name} (+${hullRestoration} hull) - radius: ${actualRadius.toFixed(1)}`);
}

// Black hole warp invulnerability check
function isBlackHoleWarpInvulnerable() {
    if (typeof gameState === 'undefined' || !gameState.slingshot) return false;

    // Check if in black hole warp (active or coasting)
    const inBlackHoleWarp = (gameState.slingshot.active || gameState.slingshot.postSlingshot) &&
                            gameState.slingshot.fromBlackHole;

    if (!inBlackHoleWarp) return false;

    // Check if speed is >= 10,000 km/s
    const speedKmS = gameState.velocityVector.length() * 1000;
    return speedKmS >= 10000;
}

function destroyAsteroidByCollision(asteroid) {
    // Check black hole warp invulnerability
    if (!isBlackHoleWarpInvulnerable()) {
        // Apply damage with shield reduction
        const damage = 15;
        const shieldReduction = typeof getShieldDamageReduction === 'function' ?
                                getShieldDamageReduction() : 0;
        const actualDamage = damage * (1 - shieldReduction);

        gameState.hull = Math.max(0, gameState.hull - actualDamage);
    }
    
    // Create shield hit effect if shields are active
    if (typeof isShieldActive === 'function' && isShieldActive() && 
        typeof createShieldHitEffect === 'function') {
        createShieldHitEffect(asteroid.position);
    }
    
    createEnhancedScreenDamageEffect();
    
    if (typeof playSound !== 'undefined') {
        playSound('damage');
    }



    // FIXED: Account for scale in collision explosions too
    const baseRadius = asteroid.geometry ? asteroid.geometry.parameters.radius : 1;
    const actualRadius = baseRadius * (asteroid.scale.x || 1);
    createAsteroidExplosion(asteroid.position.clone(), actualRadius);
    
    destroyAsteroid(asteroid);
    console.log(`Asteroid destroyed by collision: ${asteroid.userData.name} (-15 hull) - radius: ${actualRadius.toFixed(1)}`);
}

// =============================================================================
// ENHANCED BLACK HOLE WARP FUNCTION - COMPLETE AND COMPREHENSIVE
// =============================================================================
// File: game-physics.js
// Location: After destroyAsteroidByCollision function, before isPositionTooClose helper

// FIXED: Enhanced transitionToRandomLocation function for doubled world scale
// Features:
// - Warp state management to prevent guardian spawning during transition
// - Distance-based resource loading (asteroids, enemies, guardians)
// - Proper cleanup of distant resources
// - Achievement suppression during warp
// - Galaxy discovery system integration
// - Safe positioning with collision avoidance

function transitionToRandomLocation(sourceBlackHole) {
    console.log('BLACK HOLE WARP INITIATED from:', sourceBlackHole);
    
    // ==========================================================================
    // PHASE 1: SET WARP STATE AND SUPPRESS SYSTEMS
    // ==========================================================================
    
    // SET WARP FLAGS - Critical to prevent guardian spawning during transition
    if (typeof gameState !== 'undefined') {
        gameState.isBlackHoleWarping = true;
        gameState.warping = true;
        gameState.suppressAchievements = true; // Suppress achievements during warp
        console.log('Warp state active - suspending guardian spawning and achievements');
    }
    
    // Clean up any active event horizon effects
    const eventHorizonWarning = document.getElementById('eventHorizonWarning');
    if (eventHorizonWarning) {
        eventHorizonWarning.classList.add('hidden');
    }
    
    const blackHoleWarningHUD = document.getElementById('blackHoleWarningHUD');
    if (blackHoleWarningHUD) {
        blackHoleWarningHUD.classList.add('hidden');
    }
    
    if (typeof gameState !== 'undefined') {
        if (gameState.eventHorizonWarning) {
            gameState.eventHorizonWarning.active = false;
            gameState.eventHorizonWarning.blackHole = null;
        }
    }
    
    const dangerOverlay = document.getElementById('dangerOverlay');
    if (dangerOverlay) {
        dangerOverlay.remove();
    }
    
    // ==========================================================================
    // PHASE 2: VISUAL AND AUDIO EFFECTS
    // ==========================================================================
    
    // Play black hole warp sound
    if (typeof playSound !== 'undefined') {
        playSound('blackhole_warp');
    }
    
    // Create bright white fade effect for warp
    const fadeOverlay = document.createElement('div');
    fadeOverlay.className = 'black-hole-warp-effect';
    fadeOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: radial-gradient(circle at center, 
            rgba(255,255,255,0) 0%, 
            rgba(255,255,255,0.3) 30%, 
            rgba(255,255,255,0.8) 70%, 
            rgba(255,255,255,1) 100%);
        z-index: 30;
        opacity: 0;
        transition: opacity 1.5s ease-in-out;
        pointer-events: none;
    `;
    document.body.appendChild(fadeOverlay);

    // Fade to bright white
    setTimeout(() => {
        fadeOverlay.style.opacity = '1';
        console.log('Warp fade effect: Screen fading to white');
    }, 100);

    // ==========================================================================
    // PHASE 3: WARP EXECUTION (after fade completes)
    // ==========================================================================
    
    setTimeout(() => {
        console.log('Executing warp transition...');
        
        // Find available black holes for warp destination (exclude current one)
        const blackHoles = (typeof planets !== 'undefined') ? 
            planets.filter(p => 
                p.userData.type === 'blackhole' && 
                p.userData.name !== sourceBlackHole
            ) : [];
        
        if (blackHoles.length === 0) {
            console.error('No black holes found for warp destination!');
            fadeOverlay.remove();
            
            // Clear warp flags even on error
            if (typeof gameState !== 'undefined') {
                gameState.isBlackHoleWarping = false;
                gameState.warping = false;
                gameState.suppressAchievements = false;
            }
            return;
        }
        
        // Select random destination black hole
        const targetBlackHole = blackHoles[Math.floor(Math.random() * blackHoles.length)];
        console.log('Warp destination:', targetBlackHole.userData.name);
        
        // Find nearby objects at destination (for context)
        const nearbyObjects = planets.filter(p => {
            const distance = p.position.distanceTo(targetBlackHole.position);
            return distance > 200 && distance < 1600 && p.userData.type !== 'blackhole';
        });
        
        // ==========================================================================
        // PHASE 4: CALCULATE SAFE POSITION
        // ==========================================================================
        
        // Calculate safe spawn position near destination black hole
        const warpDistance = 400 + Math.random() * 600; // Safe distance from black hole
        const warpAngle = Math.random() * Math.PI * 2;   // Random angle around black hole
        const warpHeight = (Math.random() - 0.5) * 200;  // Random height variation
        
        const safePosition = new THREE.Vector3(
            targetBlackHole.position.x + Math.cos(warpAngle) * warpDistance,
            targetBlackHole.position.y + warpHeight,
            targetBlackHole.position.z + Math.sin(warpAngle) * warpDistance
        );

        // Verify position isn't inside another object (collision avoidance)
        let attempts = 0;
        while (isPositionTooClose(safePosition, 100) && attempts < 10) {
            const adjustedDistance = warpDistance + attempts * 40;
            safePosition.set(
                targetBlackHole.position.x + Math.cos(warpAngle + attempts * 0.3) * adjustedDistance,
                targetBlackHole.position.y + (Math.random() - 0.5) * 200,
                targetBlackHole.position.z + Math.sin(warpAngle + attempts * 0.3) * adjustedDistance
            );
            attempts++;
        }
        
        if (attempts > 0) {
            console.log(`Position adjusted ${attempts} times to avoid collisions`);
        }
        
        // ==========================================================================
        // PHASE 5: DETERMINE ARRIVAL GALAXY
        // ==========================================================================
        
        // Determine galaxy location names (with faction)
        const galaxyDiscoveryNames = [
            'Spiral Galaxy - Federation Space',
            'Elliptical Galaxy - Klingon Empire',
            'Irregular Galaxy - Rebel Alliance',
            'Ring Galaxy - Romulan Star Empire',
            'Dwarf Galaxy - Galactic Empire',
            'Lenticular Galaxy - Cardassian Union',
            'Quasar Galaxy - Sith Empire',
            'Ancient Galaxy - Vulcan High Command'
        ];
        
        // Determine which galaxy we warped to based on proximity to DESTINATION (safePosition)
        let arrivedGalaxyId = -1;

        if (typeof getGalaxy3DPosition === 'function') {
            for (let g = 0; g < 8; g++) {
                const galaxyCenter = getGalaxy3DPosition(g);

                // FIXED: Check against safePosition (destination), not camera.position (old location)
                if (safePosition.distanceTo(galaxyCenter) < 15000) {
                    arrivedGalaxyId = g;
                    break;
                }
            }
        }

        // Use the specific discovery name for the arrived galaxy
        const locationName = arrivedGalaxyId >= 0 && arrivedGalaxyId < galaxyDiscoveryNames.length
            ? galaxyDiscoveryNames[arrivedGalaxyId]
            : `${targetBlackHole.userData.name || 'Deep Space'}`; // Fallback to black hole name
        
        // Move camera to new position
        if (typeof camera !== 'undefined') {
            camera.position.copy(safePosition);
        }
        
        // Update location in game state
        if (typeof gameState !== 'undefined') {
            gameState.location = locationName;
        }
        
        console.log(`Arrived at galaxy ID: ${arrivedGalaxyId} (${locationName})`);

        
        // ==========================================================================
        // PHASE 6: LOAD RESOURCES FOR DESTINATION GALAXY
        // ==========================================================================
        
        // Load asteroids for new galaxy (first priority - visual environment)
        if (arrivedGalaxyId >= 0 && typeof loadAsteroidsForGalaxy === 'function') {
            setTimeout(() => {
                console.log(`Loading asteroids for galaxy ${arrivedGalaxyId}...`);
                loadAsteroidsForGalaxy(arrivedGalaxyId);
            }, 500);
        }

        // Load enemies for new galaxy
if (arrivedGalaxyId >= 0 && typeof loadEnemiesForGalaxy === 'function') {
    setTimeout(() => {
        loadEnemiesForGalaxy(arrivedGalaxyId);
    }, 700); // Slight delay after asteroids
}

// NEW: Load guardians for new galaxy
if (arrivedGalaxyId >= 0 && typeof loadGuardiansForGalaxy === 'function') {
    setTimeout(() => {
        loadGuardiansForGalaxy(arrivedGalaxyId);
        console.log(`🛡️ Loading guardians for galaxy ${arrivedGalaxyId} after warp`);
    }, 900); // Load guardians before cleanup
}

// Cleanup distant asteroids
if (arrivedGalaxyId >= 0 && typeof cleanupDistantAsteroids === 'function') {
    setTimeout(() => {
        cleanupDistantAsteroids(arrivedGalaxyId);
    }, 1000);
}
        // ==========================================================================
        // PHASE 7: CLEAR WARP STATE AND LOAD GUARDIANS
        // ==========================================================================
        
        // Load guardians for new galaxy - ONLY after warp completes
        // This is delayed until after enemies load and warp state is cleared
        if (arrivedGalaxyId >= 0 && typeof loadGuardiansForGalaxy === 'function') {
            setTimeout(() => {
                // CLEAR WARP FLAGS before loading guardians (critical timing)
                if (typeof gameState !== 'undefined') {
                    gameState.isBlackHoleWarping = false;
                    gameState.warping = false;
                    console.log('Warp complete - resuming guardian spawning');
                }
                
                console.log(`Loading guardians for galaxy ${arrivedGalaxyId}...`);
                loadGuardiansForGalaxy(arrivedGalaxyId);
            }, 1200); // Load guardians AFTER enemies and warp state cleared
        } else {
            // Clear warp flags even if we didn't load guardians
            setTimeout(() => {
                if (typeof gameState !== 'undefined') {
                    gameState.isBlackHoleWarping = false;
                    gameState.warping = false;
                    console.log('Warp complete');
                }
            }, 1200);
        }

        // ==========================================================================
        // PHASE 8: CLEANUP DISTANT RESOURCES
        // ==========================================================================
        
        // Cleanup distant asteroids (performance optimization)
        if (arrivedGalaxyId >= 0 && typeof cleanupDistantAsteroids === 'function') {
            setTimeout(() => {
                console.log(`Cleaning up distant asteroids...`);
                cleanupDistantAsteroids(arrivedGalaxyId);
            }, 1000);
        }

        // Cleanup distant enemies (performance optimization)
        if (arrivedGalaxyId >= 0 && typeof cleanupDistantEnemies === 'function') {
            setTimeout(() => {
                console.log(`Cleaning up distant enemies...`);
                cleanupDistantEnemies(arrivedGalaxyId);
            }, 1500);
        }
        
        // ==========================================================================
        // PHASE 9: GALAXY DISCOVERY SYSTEM
        // ==========================================================================
        
        // Mark this as a new undiscovered galaxy location
        if (typeof gameState !== 'undefined') {
            gameState.pendingGalaxyDiscovery = {
                galaxyName: locationName,
                targetBlackHole: targetBlackHole.userData.name,
                discoveryTriggered: false,
                arrivalTime: Date.now()
            };
        }
        
        // RE-ENABLE ACHIEVEMENTS after 3 seconds (allow time to settle in new galaxy)
        setTimeout(() => {
            if (typeof gameState !== 'undefined') {
                gameState.suppressAchievements = false;
                console.log('Achievement system reactivated - ready for galaxy discovery');
            }
        }, 3000);
        
        // ==========================================================================
        // PHASE 10: RESET VELOCITY AND MOMENTUM
        // ==========================================================================
        
        // Reset velocity with some randomness away from black hole
        if (typeof gameState !== 'undefined' && typeof THREE !== 'undefined') {
            const awayDirection = new THREE.Vector3()
                .subVectors(safePosition, targetBlackHole.position)
                .normalize();
                
            const randomDirection = new THREE.Vector3(
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.3
            );
            
            gameState.velocityVector = awayDirection
                .add(randomDirection)
                .normalize()
                .multiplyScalar(gameState.minVelocity * (1 + Math.random() * 0.5));
                
            console.log('Velocity reset with random trajectory away from black hole');
        }

        // ==========================================================================
        // PHASE 11: FADE BACK FROM WHITE AND UPDATE UI
        // ==========================================================================
        
        // Fade back from bright white
        fadeOverlay.style.opacity = '0';
        setTimeout(() => {
            fadeOverlay.remove();
            console.log('Warp fade complete - screen visible');
        }, 1500);
        
        // Update UI and populate new targets
        if (typeof populateTargets === 'function') {
            populateTargets();
        }
        if (typeof updateUI === 'function') {
            updateUI();
        }
        
        // â­ NEW: Force galaxy map update after warp
        if (typeof updateGalaxyMap === 'function') {
            setTimeout(() => {
                updateGalaxyMap();
                console.log('🗺️ Galaxy map updated after warp');
            }, 500);
        }
        
        // ==========================================================================
        // PHASE 12: INCREASE DISTANCE TRAVELED
        // ==========================================================================
        
        // Increase distance traveled (represents the warp jump)
        if (typeof gameState !== 'undefined') {
            gameState.distance += 6000 + Math.random() * 8000;
        }
        
        // ==========================================================================
        // COMPLETION LOG
        // ==========================================================================
        
        console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
        console.log(`   BLACK HOLE WARP COMPLETE`);
        console.log(`   Origin: ${sourceBlackHole}`);
        console.log(`   Destination: ${targetBlackHole.userData.name}`);
        console.log(`   Location: ${locationName}`);
        console.log(`   Galaxy ID: ${arrivedGalaxyId}`);
        console.log(`   Nearby Objects: ${nearbyObjects.length}`);
        console.log(`   Position: (${safePosition.x.toFixed(0)}, ${safePosition.y.toFixed(0)}, ${safePosition.z.toFixed(0)})`);
        console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
        
    }, 1500); // Wait for full fade to white before executing warp
}

// =============================================================================
// HELPER FUNCTION - POSITION SAFETY CHECK
// =============================================================================

// Helper function to check if position is too close to other objects
function isPositionTooClose(position, minDistance) {
    if (typeof planets === 'undefined') return false;
    
    for (let planet of planets) {
        if (planet && planet.position) {
            const distance = position.distanceTo(planet.position);
            if (distance < minDistance) {
                return true;
            }
        }
    }
    return false;
}
// PRESERVED: Slingshot execution function
function executeSlingshot() {
    let nearestPlanet = null;
    let nearestDistance = Infinity;
    
    if (typeof activePlanets !== 'undefined') {
        activePlanets.forEach(planet => {
            const distance = camera.position.distanceTo(planet.position);
            if (distance < 60 && distance < nearestDistance) {
                nearestPlanet = planet;
                nearestDistance = distance;
            }
        });
    }
    
    if (nearestPlanet && gameState.energy >= 20 && !gameState.slingshot.active) {
        const planetMass = nearestPlanet.userData.mass || 1;
        const planetRadius = nearestPlanet.geometry ? nearestPlanet.geometry.parameters.radius : 5;

        // Use the direction the player is looking (camera forward direction)
        const lookDirection = new THREE.Vector3();
        camera.getWorldDirection(lookDirection);
        lookDirection.normalize();

        // Slingshot boosts in the direction the player is looking
        const slingshotDirection = lookDirection;
        
        // FIXED: Make slingshots MUCH MORE POWERFUL than emergency warps
        // Emergency warp: ~15,000 km/s
        // Slingshot base: 25,000 km/s, scaling up with planet mass
        const slinghotPower = (planetMass * planetRadius) / 2; // Doubled from /5 to /2
        const baseBoostSpeed = 25.0; // Much higher than emergency warp's 15.0
        const boostVelocity = Math.min(baseBoostSpeed + slinghotPower, 50.0); // Max 50,000 km/s
        
        gameState.velocityVector.copy(slingshotDirection).multiplyScalar(boostVelocity);
        gameState.energy = Math.max(5, gameState.energy - 20);

        gameState.slingshot.active = true;
        gameState.slingshot.timeRemaining = gameState.slingshot.duration;
        gameState.slingshot.fromBlackHole = (nearestPlanet.userData.type === 'blackhole');

        // Activate warp starfield (matching emergency warp behavior)
        if (typeof toggleWarpSpeedStarfield === 'function') {
            toggleWarpSpeedStarfield(true);
        }

        if (nearestPlanet.userData.type === 'blackhole') {
            if (typeof showAchievement === 'function') {
                showAchievement('Black Hole Slingshot', `EXTREME VELOCITY: ${(boostVelocity * 1000).toFixed(0)} km/s!`);
            }
            for (let i = 0; i < 8; i++) {
                setTimeout(() => createHyperspaceEffect(), i * 200);
            }
        } else if (nearestPlanet.userData.name === 'Jupiter' || planetRadius > 10) {
            if (typeof showAchievement === 'function') {
                showAchievement('Giant Planet Slingshot', `${nearestPlanet.userData.name}: ${(boostVelocity * 1000).toFixed(0)} km/s!`);
            }
            for (let i = 0; i < 4; i++) {
                setTimeout(() => createHyperspaceEffect(), i * 150);
            }
        } else {
            if (typeof showAchievement === 'function') {
                showAchievement('Gravitational Slingshot', `${nearestPlanet.userData.name}: ${(boostVelocity * 1000).toFixed(0)} km/s!`);
            }
            for (let i = 0; i < 2; i++) {
                setTimeout(() => createHyperspaceEffect(), i * 100);
            }
        }
        
        gameState.distance += slinghotPower * 10;
        if (typeof updateUI === 'function') {
            updateUI();
        }
    }
}

// =============================================================================
// MAIN ENHANCED PHYSICS UPDATE FUNCTION - SPECIFICATION COMPLIANT
// =============================================================================

function updateEnhancedPhysics() {
    // Pause-aware physics
    if (typeof gamePaused !== 'undefined' && gamePaused) {
        if (typeof renderer !== 'undefined' && renderer) {
            renderer.render(scene, camera);
        }
        return;
    }
    
    // One-time initialization of enhanced properties
    if (!gameState.enhancedPropertiesInitialized) {
        initializeEnhancedGameStateProperties();
        gameState.enhancedPropertiesInitialized = true;
    }

    // Get keys reference from game-controls.js
    const keys = window.keys || {
        w: false, a: false, s: false, d: false,
        q: false, e: false, o: false,
        shift: false, alt: false, space: false,
        up: false, down: false, left: false, right: false,
        x: false, b: false, l: false
    };

    // SPECIFICATION: Use consistent rotSpeed = 0.03 for all rotation inputs
    const rotSpeed = 0.02;
    const gravitationalConstant = 0.003; // TRIPLED for stronger gravity
    const assistRange = 60; // DOUBLED
    const collisionThreshold = 6; // DOUBLED
    
    // NEW: Inertia-based rotation system for space-like flight feel
    // Don't allow manual rotation when auto-navigation is orienting
    const allowManualRotation = !gameState.autoNavigating || !gameState.autoNavOrienting;

    if (allowManualRotation || keys.q || keys.e) {
        // Apply rotational inertia system
        applyRotationalInertia(keys, allowManualRotation);
    } else {
        // When auto-navigating, reset inertia and maintain orientation
        rotationalVelocity = { pitch: 0, yaw: 0, roll: 0 };
        // Don't force rotation.set as it can cause issues - let auto-nav handle it
    }
    
    // L key toggle for auto-leveling
    if (keys.l) {
        gameState.autoLevelingEnabled = !gameState.autoLevelingEnabled;
        keys.l = false; // Prevent multiple toggles
        if (typeof showAchievement === 'function') {
            showAchievement('Auto-Leveling', gameState.autoLevelingEnabled ? 'ENABLED' : 'DISABLED');
        }
        console.log('Auto-leveling toggled:', gameState.autoLevelingEnabled ? 'ON' : 'OFF');
    }
    
    // ENHANCED AUTO-LEVELING SYSTEM - ROLL ONLY, PRESERVES TRAJECTORY
if (gameState.autoLevelingEnabled) {
    const now = performance.now();
    const autoLevelingDelay = 0; // 1 seconds
    const autoLevelingSpeed = 0.005; // Slower, smoother leveling
    
    // CRITICAL: Don't auto-level during auto-navigation or when orienting
    const isAutoNavigating = gameState.autoNavigating || gameState.autoNavOrienting;
    
    // CRITICAL: Don't auto-level during emergency operations
    const isDuringEmergencyOperation = gameState.emergencyWarp?.active || 
                                       gameState.slingshot?.active ||
                                       gameState.blackHoleWarp?.active;
    
    // Track auto-navigation state changes to reset timing
    if (typeof gameState.wasAutoNavigating === 'undefined') {
        gameState.wasAutoNavigating = false;
    }
    
    // Detect when auto-navigation just ended
    if (gameState.wasAutoNavigating && !isAutoNavigating) {
        console.log('Auto-navigation ended - resetting auto-leveling timer');
        lastRollInputTime = now; // Reset roll timer for 6-second grace period
        gameState.autoNavEndTime = now;
    }
    
    // Update the tracking state
    gameState.wasAutoNavigating = isAutoNavigating;
    
    // Only auto-level when in manual flight mode
if (!isAutoNavigating && !isDuringEmergencyOperation) {
    
    // FIXED: Auto-level ONLY roll (Z-axis) - this is the "banking" angle
    // This preserves the ship's trajectory direction while leveling the wings
    if ((now - lastRollInputTime) > autoLevelingDelay) {
        const rollLerpFactor = autoLevelingSpeed;
        let currentRoll = camera.rotation.z;
        
        // CRITICAL FIX: Normalize angle to [-PI, PI] range
        while (currentRoll > Math.PI) currentRoll -= Math.PI * 2;
        while (currentRoll < -Math.PI) currentRoll += Math.PI * 2;
        
        // NEW: Accept BOTH upright (0°) and inverted (180°) as stable states
        // Level to whichever is closer
        let targetRoll;
        if (currentRoll > Math.PI / 2) {
            // Currently rolled past 90° → level to inverted (180°)
            targetRoll = Math.PI;
        } else if (currentRoll < -Math.PI / 2) {
            // Currently rolled past -90° → level to inverted (-180°)
            targetRoll = -Math.PI;
        } else {
            // Currently between -90° and +90° → level to upright (0°)
            targetRoll = 0;
        }
        
        const newRoll = THREE.MathUtils.lerp(currentRoll, targetRoll, rollLerpFactor);
        
        // Apply roll leveling only
        camera.rotation.z = newRoll;
        
        // Update tracking to stay synchronized
        cameraRotationTracking.z = newRoll;
        
        // Snap to target when very close
        if (Math.abs(newRoll - targetRoll) < 0.01) {
            camera.rotation.z = targetRoll;
            cameraRotationTracking.z = targetRoll;
        }
    }
        
        // REMOVED: Pitch auto-leveling - this was changing trajectory direction
        // The ship should maintain its pitch attitude for flight control
    }
}
    
    // SPECIFICATION: Directional Vectors - Always calculate movement relative to camera orientation
    const forwardDirection = new THREE.Vector3();
    camera.getWorldDirection(forwardDirection);
    const rightDirection = new THREE.Vector3();
    rightDirection.crossVectors(forwardDirection, camera.up).normalize();
    
    // SPECIFICATION: Constant Motion - Ship maintains minimum forward velocity
    const currentSpeed = gameState.velocityVector.length();
    if (currentSpeed < gameState.minVelocity) {
        const deficit = gameState.minVelocity - currentSpeed;
        gameState.velocityVector.addScaledVector(forwardDirection, deficit);
    }
    
    // FIXED: Continuous distance tracking during normal flight
if (!gameState.lastPosition) {
    gameState.lastPosition = camera.position.clone();
}

// Calculate distance traveled this frame
const frameDistance = camera.position.distanceTo(gameState.lastPosition);
if (frameDistance > 0.01) { // Only track significant movement
    // Convert to light years (rough space scale conversion)
    const frameDistanceLY = frameDistance / 1000; // Adjust scale as needed
    gameState.distance = (gameState.distance || 0) + frameDistanceLY;
    
    // Update last position
    gameState.lastPosition = camera.position.clone();
}
    
    // SPECIFICATION: Movement Controls (WASD) with exact energy consumption rates
    if (keys.w && gameState.energy > 0) {
        // W Key: Primary forward thrust (2x power multiplier) - consumes 0.12 energy per frame
        const wThrustPower = gameState.thrustPower * gameState.wThrustMultiplier;
        gameState.velocityVector.addScaledVector(forwardDirection, wThrustPower);
        gameState.energy = Math.max(0, gameState.energy - 0.12);
        if (Math.random() > 0.85) createHyperspaceEffect(); // Visual feedback
    }
    if (keys.s && gameState.energy > 0) {
        // S Key: Reverse thrust (50% power) - consumes 0.04 energy per frame
        gameState.velocityVector.addScaledVector(forwardDirection, -gameState.thrustPower * 0.5);
        gameState.energy = Math.max(0, gameState.energy - 0.04);
    }
    if (keys.a && gameState.energy > 0) {
        // A Key: Strafe left (70% power) - consumes 0.06 energy per frame
        gameState.velocityVector.addScaledVector(rightDirection, -gameState.thrustPower * 0.7);
        gameState.energy = Math.max(0, gameState.energy - 0.06);
    }
    if (keys.d && gameState.energy > 0) {
        // D Key: Strafe right (70% power) - consumes 0.06 energy per frame
        gameState.velocityVector.addScaledVector(rightDirection, gameState.thrustPower * 0.7);
        gameState.energy = Math.max(0, gameState.energy - 0.06);
    }
    
    // SPECIFICATION: Boost System
    if (keys.b && gameState.energy > 0) {
        // B Key: Space boost (1.8x thrust power, or 2.5x with Shift modifier)
        const boostPower = keys.shift ? gameState.thrustPower * 2.5 : gameState.thrustPower * 1.8;
        gameState.velocityVector.addScaledVector(forwardDirection, boostPower);
        // B + Shift: Enhanced boost with higher energy consumption (0.15 vs 0.12)
        gameState.energy = Math.max(0, gameState.energy - (keys.shift ? 0.15 : 0.12));
        
        if (Math.random() > 0.6) {
            createHyperspaceEffect();
        }
    }

     // SPECIFICATION: Emergency Systems - O Key: Emergency warp
// Check shield block FIRST before processing warp
if (keys.o && typeof isShieldActive === 'function' && isShieldActive()) {
    if (typeof showAchievement === 'function') {
        showAchievement('Warp Blocked', 'Cannot warp with shields active');
    }
    keys.o = false; // Clear the key immediately
}
// Now process warp with cooldown protection
else if (keys.o && gameState.emergencyWarp.available > 0 && !gameState.emergencyWarp.active && !gameState.emergencyWarp.transitioning) {
    // ✅ CRITICAL: Clear the key immediately to prevent retriggering
    keys.o = false;
    
    // ✅ Capture forward direction NOW before setTimeout (closure issue fix)
    const capturedForwardDirection = forwardDirection.clone();
    const capturedBoostSpeed = gameState.emergencyWarp.boostSpeed;
    
    // ✅ Decrement warp count IMMEDIATELY (not in setTimeout)
    gameState.emergencyWarp.available--;
    
    // Mark as transitioning to prevent re-triggers
    gameState.emergencyWarp.transitioning = true;
    
    console.log(`🚀 Emergency warp initiated! ${gameState.emergencyWarp.available} charges remaining`);
    
    // Step 1: Animate camera from current view to first-person
    if (typeof setCameraFirstPerson === 'function') {
        setCameraFirstPerson();
    }
    
    // Step 2: After camera transition completes (400ms), engage warp
    setTimeout(() => {
        gameState.emergencyWarp.active = true;
        gameState.emergencyWarp.transitioning = false;
        gameState.emergencyWarp.timeRemaining = gameState.emergencyWarp.boostDuration;
        gameState.velocityVector.copy(capturedForwardDirection).multiplyScalar(capturedBoostSpeed);
        
        // Activate visual effects
        for (let i = 0; i < 3; i++) {
            setTimeout(() => createHyperspaceEffect(), i * 200);
        }
        
        // Activate 3D warp starfield
        if (typeof toggleWarpSpeedStarfield === 'function') {
            toggleWarpSpeedStarfield(true);
        }
        
        if (typeof playSound !== 'undefined') {
            playSound('warp');
        }

        console.log(`🚀 Warp engaged!`);
        
        // Step 3: Pull back to 3rd person while warping (see ship in starfield)
        setTimeout(() => {
            if (typeof setCameraThirdPerson === 'function') {
                setCameraThirdPerson();
            }
        }, 300);  // Short delay, then pull back to 3rd person
    }, 400);  // Match camera transition duration
}

        // Enhanced Emergency warp timer with momentum coasting
if (gameState.emergencyWarp.active) {
    gameState.emergencyWarp.timeRemaining -= 16.67;
    if (gameState.emergencyWarp.timeRemaining <= 0) {
        gameState.emergencyWarp.active = false;
        gameState.emergencyWarp.postWarp = true;
        
        // Check speed and disable starfield if needed
        const currentSpeedKmS = gameState.velocityVector.length() * 1000;
        if (currentSpeedKmS < 10000 && typeof toggleWarpSpeedStarfield === 'function') {
            toggleWarpSpeedStarfield(false);
        }
        
        if (typeof showAchievement === 'function') {
            showAchievement('Emergency Warp Complete', 'Coasting on momentum - use X to brake');
        }
    }
} else if (gameState.emergencyWarp.postWarp) {
    // Coast on momentum until brakes are manually used
    const currentSpeedKmS = gameState.velocityVector.length() * 1000;
    
    // Auto-disable starfield when coasting below threshold
    if (currentSpeedKmS < 10000 && typeof toggleWarpSpeedStarfield === 'function') {
        if (window.warpStarfield && window.warpStarfield.lines && window.warpStarfield.lines.visible) {
            toggleWarpSpeedStarfield(false);
        }
    }
    
    // FIXED: Don't immediately end postWarp when braking - let velocity naturally decrease
    // Only end postWarp when velocity drops near minVelocity
    if (keys.x) {
        const minVelocity = gameState.minVelocity || 2.0;
        if (gameState.velocityVector.length() < minVelocity * 1.5) {
            // Only end postWarp when close to normal speed
            gameState.emergencyWarp.postWarp = false;
            if (typeof showAchievement === 'function') {
                showAchievement('Emergency Brake Applied', 'Momentum coasting ended');
            }
        }
        // Note: Braking is applied below in the main braking section (line ~1244)
    }
}

// Update shield system
if (typeof updateShieldSystem === 'function') {
    updateShieldSystem();
}
    
    // Emergency braking (X key) - GRADUAL DECELERATION
if (keys.x && gameState.energy > 0) {
    // Gradual braking: reduce velocity by 2% per frame instead of instant stop
    const brakingForce = 0.98; // 2% reduction per frame
    gameState.velocityVector.multiplyScalar(brakingForce);
    
    // NEW: Also apply braking to rotational velocity (dampen turning and rolling)
    const rotationalBrakingForce = 0.95; // 5% reduction per frame for rotation
    rotationalVelocity.pitch *= rotationalBrakingForce;
    rotationalVelocity.yaw *= rotationalBrakingForce;
    rotationalVelocity.roll *= rotationalBrakingForce;
    
    // Small energy cost for braking
    gameState.energy = Math.max(0, gameState.energy - 0.02);
    
    // Get current speed in km/s
    const currentSpeedKmS = gameState.velocityVector.length() * 1000;
    
    // Disable warp starfield when speed drops below 10,000 km/s
    if (currentSpeedKmS < 10000 && typeof toggleWarpSpeedStarfield === 'function') {
        if (window.warpStarfield && window.warpStarfield.lines && window.warpStarfield.lines.visible) {
            toggleWarpSpeedStarfield(false);
            console.log('⚡ Warp starfield disabled - speed below 10,000 km/s');
            
            // Return to third-person view when exiting warp speed
            if (typeof setCameraThirdPerson === 'function') {
                setCameraThirdPerson();
            }
        }
    }
    
    if (Math.random() > 0.92) {
        if (typeof createHyperspaceEffect === 'function') {
            createHyperspaceEffect();
        }
    }
}
    
    // PRESERVED: Complete gravitational effects system with asteroid collision
    let totalGravitationalForce = new THREE.Vector3(0, 0, 0);
    let nearestAssistPlanet = null;
    let nearestAssistDistance = Infinity;
    let gravityWellInRange = false;
    
    if (typeof activePlanets !== 'undefined') {
        activePlanets.forEach(planet => {
            const planetPosition = planet.position;
            const distance = camera.position.distanceTo(planetPosition);
            const planetMass = planet.userData.mass || 1;
            const planetRadius = planet.geometry ? planet.geometry.parameters.radius : 1;
            
            // ⭐ ASTEROID COLLISION - Apply damage and check for death
            if (planet.userData.type === 'asteroid' && distance < collisionThreshold) {
                destroyAsteroidByCollision(planet);

                if (gameState.hull <= 0) {
                    // Stop all player motion
                    gameState.velocityVector.set(0, 0, 0);

                    // Create massive player explosion
                    if (typeof createPlayerExplosion === 'function') {
                        createPlayerExplosion();
                    }

                    // Play explosion/vaporizing sound
                    if (typeof playSound === 'function') {
                        playSound('explosion');
                    }

                    // Show game over screen
                    if (typeof showGameOverScreen === 'function') {
                        showGameOverScreen('HULL BREACH', 'Ship destroyed by asteroid impact');
                    }

                    console.log('💀 PLAYER DESTROYED: Killed by asteroid collision');
                    return;
                }
            }

            // ⚡ DEADLY COLLISION DETECTION - Crashing into celestial bodies causes mission failure

// Black holes: Only collide with center core (10 units), not the surface
const blackHoleCoreCollision = planet.userData.type === 'blackhole' && distance < 10;

// Planets and stars: Collide with surface
const surfaceCollision = (planet.userData.type === 'planet' || planet.userData.type === 'star') &&
                         distance < planetRadius + 10; // 10 unit safety margin

if (blackHoleCoreCollision || surfaceCollision) {

    // ⚡ SUN COLLISION = INSTANT DEATH
    if (planet.userData.type === 'star') {
        gameState.hull = 0; // Instant complete hull failure
        gameState.velocityVector.set(0, 0, 0); // Stop all motion

        // Create massive explosion
        if (typeof createPlayerExplosion === 'function') {
            createPlayerExplosion();
        }

        // Trigger mission failed
        if (typeof showGameOverScreen === 'function') {
            showGameOverScreen('VAPORIZED BY STAR', `Ship destroyed by ${planet.userData.name} - hull integrity: 0%`);
        }

        // Explosion sound
        if (typeof playSound === 'function') {
            playSound('explosion');
        }

        console.log(`💀 INSTANT DEATH: Player collided with star ${planet.userData.name}`);
        return;
    }

    // ⚡ PLANET/BLACK HOLE COLLISION = EXPLOSION AND MISSION FAILURE
    if (planet.userData.type === 'planet' || planet.userData.type === 'blackhole') {
        // Complete hull destruction on direct collision
        gameState.hull = 0;
        gameState.velocityVector.set(0, 0, 0); // Stop all motion

        // Create explosion
        if (typeof createPlayerExplosion === 'function') {
            createPlayerExplosion();
        }

        // Trigger mission failed
        const impactType = planet.userData.type === 'blackhole' ? 'CRUSHED BY SINGULARITY' : 'PLANETARY IMPACT';
        if (typeof showGameOverScreen === 'function') {
            showGameOverScreen(impactType, `Ship destroyed by collision with ${planet.userData.name}`);
        }

        // Explosion sound
        if (typeof playSound === 'function') {
            playSound('explosion');
        }

        console.log(`💀 MISSION FAILED: Player collided with ${planet.userData.type} ${planet.userData.name}`);
        return;
    }
}
            
            if (planet.userData.type !== 'asteroid') {
                let gravityMultiplier = 1.0;

                // Stronger gravity for stars and planets
                if (planet.userData.type === 'star') {
                    gravityMultiplier = 2.0; // Stars have 2x gravity
                } else if (planet.userData.type === 'planet') {
                    gravityMultiplier = 1.5; // Planets have 1.5x gravity
                }

                const gravitationalForce = gravitationalConstant * gameState.shipMass * planetMass * gravityMultiplier / (distance * distance);
                const direction = new THREE.Vector3().subVectors(planetPosition, camera.position).normalize();
                const gravityVector = direction.clone().multiplyScalar(gravitationalForce);
                
                // Black hole effects
                if (planet.userData.type === 'blackhole') {
                    const warningDistance = gameState.eventHorizonWarning.warningDistance;
                    const criticalDistance = planet.userData.warpThreshold || gameState.eventHorizonWarning.criticalDistance;
                    
                    if (distance < warningDistance && distance > criticalDistance && !gameState.eventHorizonWarning.active) {
                        gameState.eventHorizonWarning.active = true;
                        gameState.eventHorizonWarning.blackHole = planet;
                        const eventHorizonEl = document.getElementById('eventHorizonWarning');
                        if (eventHorizonEl) {
                            eventHorizonEl.classList.remove('hidden');
                        }
                        if (typeof showAchievement === 'function') {
                            if (!shouldSuppressAchievement('Event Horizon Detected')) {
                                showAchievement('Event Horizon Detected', `Approaching ${planet.userData.name}`);
                            }
                        }
                    }
                    
                    if (distance > warningDistance && gameState.eventHorizonWarning.active && gameState.eventHorizonWarning.blackHole === planet) {
                        gameState.eventHorizonWarning.active = false;
                        gameState.eventHorizonWarning.blackHole = null;
                        const eventHorizonEl = document.getElementById('eventHorizonWarning');
                        if (eventHorizonEl) {
                            eventHorizonEl.classList.add('hidden');
                        }
                    }
                    
                    if (distance < criticalDistance) {
                        if (gameState.eventHorizonWarning.active) {
                            const eventHorizonEl = document.getElementById('eventHorizonWarning');
                            if (eventHorizonEl) {
                                eventHorizonEl.classList.add('hidden');
                            }
                            gameState.eventHorizonWarning.active = false;
                            gameState.eventHorizonWarning.blackHole = null;
                            
                            const flashOverlay = document.createElement('div');
                            flashOverlay.className = 'absolute inset-0 bg-yellow-400 z-50';
                            flashOverlay.style.opacity = '0.7';
                            document.body.appendChild(flashOverlay);
                            
                            setTimeout(() => {
                                flashOverlay.style.opacity = '0';
                                setTimeout(() => flashOverlay.remove(), 500);
                            }, 200);
                            
                            if (typeof showAchievement === 'function') {
                                if (!shouldSuppressAchievement('Event Horizon Crossed')) {
                                    showAchievement('Event Horizon Crossed', 'Reality warps around you...');
                                }
                            }
                        }
                        
                        if (typeof transitionToRandomLocation === 'function') {
                            // SUPPRESS ACHIEVEMENTS for the entire multi-galaxy flash sequence
                            gameState.suppressAchievements = true;
                            transitionToRandomLocation(planet.userData.name);
                        }
                        return;
                    }
                    
                    gravityVector.multiplyScalar(20);
                    
                    // Enhanced spiral effects
                    if (distance < 200) {
                        const spiralStrength = Math.pow((200 - distance) / 200, 2);
                        const spiralForce = new THREE.Vector3(
                            Math.sin(Date.now() * 0.001 * spiralStrength * 3),
                            0,
                            Math.cos(Date.now() * 0.001 * spiralStrength * 3)
                        ).multiplyScalar(spiralStrength * 0.2);
                        
                        gameState.velocityVector.add(spiralForce);
                        
                        if (distance < 160) {
                            camera.rotation.z += spiralStrength * 0.02 * Math.sin(Date.now() * 0.005);
                            
                            if (!document.getElementById('dangerOverlay')) {
                                const dangerOverlay = document.createElement('div');
                                dangerOverlay.id = 'dangerOverlay';
                                dangerOverlay.className = 'absolute inset-0 pointer-events-none z-20';
                                dangerOverlay.style.background = `radial-gradient(circle, transparent 0%, rgba(255,255,0,${spiralStrength * 0.4}) 100%)`;
                                dangerOverlay.style.animation = 'pulse 0.5s infinite';
                                document.body.appendChild(dangerOverlay);
                            }
                        } else {
                            const dangerOverlay = document.getElementById('dangerOverlay');
                            if (dangerOverlay) {
                                dangerOverlay.remove();
                            }
                        }
                    }
                }
                
                totalGravitationalForce.add(gravityVector);
                
                if (distance < assistRange && distance < nearestAssistDistance) {
                    nearestAssistPlanet = planet;
                    nearestAssistDistance = distance;
                    gravityWellInRange = true;
                }
            }
        });
    }

    // OUTER INTERSTELLAR SYSTEMS GRAVITY - Add gravity from all outer system objects
    if (typeof outerInterstellarSystems !== 'undefined') {
        outerInterstellarSystems.forEach(system => {
            if (!system.userData) return;

            // Center object gravity (star, supernova, plasma storm, solar storm)
            if (system.userData.centerObject) {
                const centerObj = system.userData.centerObject;
                const centerPos = new THREE.Vector3();
                centerObj.getWorldPosition(centerPos);
                const distance = camera.position.distanceTo(centerPos);
                const mass = centerObj.userData.mass || 1;

                if (distance > 0) {
                    const gravitationalForce = gravitationalConstant * gameState.shipMass * mass / (distance * distance);
                    const direction = new THREE.Vector3().subVectors(centerPos, camera.position).normalize();
                    const gravityVector = direction.clone().multiplyScalar(gravitationalForce);
                    totalGravitationalForce.add(gravityVector);

                    // Check for gravity assist range
                    if (distance < assistRange && distance < nearestAssistDistance) {
                        nearestAssistPlanet = centerObj;
                        nearestAssistDistance = distance;
                        gravityWellInRange = true;
                    }
                }
            }

            // Orbiter gravity (planets, brown dwarfs, pulsars, cosmic features)
            if (system.userData.orbiters) {
                system.userData.orbiters.forEach(orbiter => {
                    // Skip asteroids and BORG drones (no significant gravity)
                    if (orbiter.userData.type === 'outer_asteroid' || orbiter.userData.type === 'borg_drone') return;

                    const orbiterPos = new THREE.Vector3();
                    orbiter.getWorldPosition(orbiterPos);
                    const distance = camera.position.distanceTo(orbiterPos);
                    const mass = orbiter.userData.mass || 1;

                    if (distance > 0) {
                        const gravitationalForce = gravitationalConstant * gameState.shipMass * mass / (distance * distance);
                        const direction = new THREE.Vector3().subVectors(orbiterPos, camera.position).normalize();
                        const gravityVector = direction.clone().multiplyScalar(gravitationalForce);
                        totalGravitationalForce.add(gravityVector);

                        // Check for gravity assist range
                        if (distance < assistRange && distance < nearestAssistDistance) {
                            nearestAssistPlanet = orbiter;
                            nearestAssistDistance = distance;
                            gravityWellInRange = true;
                        }
                    }
                });
            }
        });
    }

    // Apply gravitational force
    gameState.velocityVector.add(totalGravitationalForce);
    
    // Enhanced title flashing for gravity well alert
    const gameTitle = document.getElementById('gameTitle');
    if (gravityWellInRange && !gameState.slingshot.active) {
        if (gameTitle && !gameTitle.classList.contains('title-flash')) {
            gameTitle.classList.add('title-flash');
        }
    } else {
        if (gameTitle && gameTitle.classList.contains('title-flash')) {
            gameTitle.classList.remove('title-flash');
        }
    }
    
    // Enhanced slingshot mechanics
    const warpBtn = document.getElementById('warpBtn');
    if (nearestAssistPlanet && gameState.energy >= 20 && !gameState.slingshot.active) {
        if (warpBtn) {
            warpBtn.disabled = false;
            warpBtn.classList.add('space-btn', 'pulse');
            warpBtn.innerHTML = `<i class="fas fa-rocket mr-2"></i>SLINGSHOT READY - Press ENTER (${nearestAssistPlanet.userData.name})`;
            
            const tutorialComplete = (typeof tutorialSystem === 'undefined' || tutorialSystem.completed);
            
            if (!warpBtn.classList.contains('assist-ready')) {
                warpBtn.classList.add('assist-ready');
                
                if (tutorialComplete) {
                    if (typeof showAchievement === 'function') {
                        showAchievement('Slingshot Ready', `Press ENTER near ${nearestAssistPlanet.userData.name} for 20,000 km/s boost!`);
                    }
                } else {
                    console.log(`Slingshot available near ${nearestAssistPlanet.userData.name} (tutorial mode - popup suppressed)`);
                }
            }
        }
    } else if (warpBtn) {
        warpBtn.disabled = true;
        warpBtn.classList.remove('pulse', 'assist-ready');
        if (nearestAssistPlanet && gameState.energy < 20) {
            warpBtn.innerHTML = '<i class="fas fa-battery-empty mr-2"></i>Insufficient Energy for Slingshot';
        } else if (gameState.slingshot.active) {
            warpBtn.innerHTML = `<i class="fas fa-clock mr-2"></i>Slingshot Active (${(gameState.slingshot.timeRemaining/1000).toFixed(1)}s)`;
        } else if (gameState.slingshot.postSlingshot) {
            warpBtn.innerHTML = `<i class="fas fa-wind mr-2"></i>Coasting on Inertia (${(gameState.velocity * 1000).toFixed(0)} km/s)`;
        } else if (gameState.emergencyWarp.active) {
            warpBtn.innerHTML = `<i class="fas fa-bolt mr-2"></i>Emergency Warp Active (${(gameState.emergencyWarp.timeRemaining/1000).toFixed(1)}s)`;
        } else {
            warpBtn.innerHTML = '<i class="fas fa-rocket mr-2"></i>No Gravity Well in Range';
        }
    }
    
    // Slingshot timer management (matching emergency warp behavior)
    if (gameState.slingshot.active) {
        gameState.slingshot.timeRemaining -= 16.67;

        if (gameState.slingshot.timeRemaining <= 0) {
            gameState.slingshot.active = false;
            gameState.slingshot.postSlingshot = true;
            gameState.slingshot.timeRemaining = 0;

            // Check speed and disable starfield if needed (matching emergency warp)
            const currentSpeedKmS = gameState.velocityVector.length() * 1000;
            if (currentSpeedKmS < 10000 && typeof toggleWarpSpeedStarfield === 'function') {
                toggleWarpSpeedStarfield(false);
            }

            if (typeof showAchievement === 'function') {
                showAchievement('Slingshot Complete', 'Coasting on momentum - use X to brake');
            }
        }
    } else if (gameState.slingshot.postSlingshot) {
        // Coast on momentum (matching emergency warp behavior)
        const currentSpeed = gameState.velocityVector.length();
        const currentSpeedKmS = currentSpeed * 1000;

        // Disable starfield if speed drops below threshold
        if (currentSpeedKmS < 10000 && typeof toggleWarpSpeedStarfield === 'function') {
            toggleWarpSpeedStarfield(false);
        }

        if (currentSpeed > gameState.maxVelocity) {
            gameState.velocityVector.multiplyScalar(gameState.slingshot.inertiaDecay);

            if (gameState.velocityVector.length() <= gameState.maxVelocity) {
                gameState.slingshot.postSlingshot = false;
                gameState.slingshot.fromBlackHole = false; // Reset black hole flag
                if (typeof showAchievement === 'function') {
                    showAchievement('Normal Velocity', 'Returned to standard propulsion limits');
                }
            }
        } else {
            gameState.slingshot.postSlingshot = false;
            gameState.slingshot.fromBlackHole = false; // Reset black hole flag
        }
    }

    // BORG DRONE COLLISION DETECTION - Prevent game freeze when hitting BORG
    if (typeof outerInterstellarSystems !== 'undefined') {
        outerInterstellarSystems.forEach(system => {
            if (!system.userData || !system.userData.drones) return;

            system.userData.drones.forEach(drone => {
                if (drone.userData.health <= 0) return;

                const droneDistance = camera.position.distanceTo(drone.position);
                const collisionDistance = 50; // BORG cube collision threshold

                if (droneDistance < collisionDistance) {
                    // Push player away from BORG cube
                    const pushDirection = new THREE.Vector3().subVectors(camera.position, drone.position).normalize();
                    const pushDistance = collisionDistance - droneDistance + 10;

                    camera.position.add(pushDirection.multiplyScalar(pushDistance));

                    // Reduce velocity significantly on collision
                    gameState.velocityVector.multiplyScalar(0.2); // Lose 80% of speed

                    // Heavy hull damage from BORG collision
                    const damage = 10;
                    const shieldReduction = typeof getShieldDamageReduction === 'function' ?
                                            getShieldDamageReduction() : 0;
                    const actualDamage = damage * (1 - shieldReduction);

                    gameState.hull = Math.max(0, gameState.hull - actualDamage);

                    // Create shield hit effect if shields are active
                    if (typeof isShieldActive === 'function' && isShieldActive() &&
                        typeof createShieldHitEffect === 'function') {
                        createShieldHitEffect(drone.position);
                    }

                    // Show collision warning
                    if (typeof showAchievement === 'function') {
                        showAchievement('BORG COLLISION!', `Collided with ${drone.userData.name} - Heavy damage!`);
                    }

                    // Sound effect
                    if (typeof playSound === 'function') {
                        playSound('hit');
                    }

                    // ⭐ Check for game over - enhanced with full death effects
                    if (gameState.hull <= 0) {
                        // Stop all player motion
                        gameState.velocityVector.set(0, 0, 0);

                        // Create massive player explosion
                        if (typeof createPlayerExplosion === 'function') {
                            createPlayerExplosion();
                        }

                        // Play explosion/vaporizing sound
                        if (typeof playSound === 'function') {
                            playSound('explosion');
                        }

                        // Show game over screen
                        if (typeof showGameOverScreen === 'function') {
                            showGameOverScreen('DESTROYED', `Annihilated by ${drone.userData.name}`);
                        }

                        console.log(`💀 PLAYER DESTROYED: Killed by ${drone.userData.name}`);
                        return;
                    }
                }
            });
        });
    }

    // INTERSTELLAR ASTEROID COLLISION DETECTION - Large roaming asteroids between galaxies
    if (typeof interstellarAsteroids !== 'undefined' && interstellarAsteroids.length > 0) {
        interstellarAsteroids.forEach(asteroid => {
            if (!asteroid || !asteroid.userData) return;

            const asteroidDistance = camera.position.distanceTo(asteroid.position);
            const collisionDistance = asteroid.userData.size + 10; // Size + safety margin

            if (asteroidDistance < collisionDistance) {
                // Push player away from asteroid
                const pushDirection = new THREE.Vector3().subVectors(camera.position, asteroid.position).normalize();
                const pushDistance = collisionDistance - asteroidDistance + 5;

                camera.position.add(pushDirection.multiplyScalar(pushDistance));

                // Reduce velocity on collision
                gameState.velocityVector.multiplyScalar(0.3); // Lose 70% of speed

                // Hull damage based on asteroid size
                const damage = Math.ceil(asteroid.userData.size / 5); // Larger = more damage
                const shieldReduction = typeof getShieldDamageReduction === 'function' ?
                                        getShieldDamageReduction() : 0;
                const actualDamage = damage * (1 - shieldReduction);

                gameState.hull = Math.max(0, gameState.hull - actualDamage);

                // Create shield hit effect if shields are active
                if (typeof isShieldActive === 'function' && isShieldActive() &&
                    typeof createShieldHitEffect === 'function') {
                    createShieldHitEffect(asteroid.position);
                }

                // Show collision warning
                if (typeof showAchievement === 'function') {
                    showAchievement('ASTEROID IMPACT!', `Collided with large asteroid - ${damage} hull damage!`);
                }

                // Sound effect
                if (typeof playSound === 'function') {
                    playSound('hit');
                }

                // Create screen damage effect
                if (typeof createEnhancedScreenDamageEffect === 'function') {
                    createEnhancedScreenDamageEffect();
                }

                // Check for game over
                if (gameState.hull <= 0) {
                    // Stop all player motion
                    gameState.velocityVector.set(0, 0, 0);

                    // Create massive player explosion
                    if (typeof createPlayerExplosion === 'function') {
                        createPlayerExplosion();
                    }

                    // Play explosion sound
                    if (typeof playSound === 'function') {
                        playSound('explosion');
                    }

                    // Show game over screen
                    if (typeof showGameOverScreen === 'function') {
                        showGameOverScreen('HULL BREACH', `Ship destroyed by collision with ${asteroid.userData.name}`);
                    }

                    console.log(`💀 PLAYER DESTROYED: Killed by interstellar asteroid collision`);
                    return;
                }
            }
        });
    }

    // Enhanced velocity limits
    const currentMaxVelocity = gameState.emergencyWarp.active ? gameState.emergencyWarp.boostSpeed :
                         gameState.emergencyWarp.postWarp ? gameState.emergencyWarp.boostSpeed :  // NEW LINE
                         (gameState.slingshot.active || gameState.slingshot.postSlingshot) ? 
                         gameState.slingshot.maxSpeed : gameState.maxVelocity;
    const currentVelocity = gameState.velocityVector.length();
    
    if (currentVelocity > currentMaxVelocity && 
    !gameState.slingshot.postSlingshot && 
    !gameState.emergencyWarp.active && 
    !gameState.emergencyWarp.postWarp) {  // NEW CONDITION
    gameState.velocityVector.normalize().multiplyScalar(currentMaxVelocity);
}
    
    // SPECIFICATION: Minimum velocity enforcement - MODIFIED for emergency braking
if (currentVelocity < gameState.minVelocity && 
    !gameState.slingshot.active && 
    !gameState.slingshot.postSlingshot && 
    !gameState.emergencyWarp.active &&
    !gameState.emergencyBraking) {  // <-- ADD THIS LINE
    if (currentVelocity > 0.001) {
        gameState.velocityVector.normalize().multiplyScalar(gameState.minVelocity);
    } else {
        gameState.velocityVector.copy(forwardDirection).multiplyScalar(gameState.minVelocity);
    }
}

// Reset emergency braking flag at the end of the frame
gameState.emergencyBraking = false;  // <-- ADD THIS LINE AT THE VERY END OF THE FUNCTION
    
    // Enhanced velocity damping - include emergency warp postWarp
const dampingFactor = gameState.slingshot.postSlingshot ? 0.9999 : 
                     gameState.emergencyWarp.active ? 0.9998 :
                     gameState.emergencyWarp.postWarp ? 0.9999 :  // NEW LINE
                     0.998;

const dampedVelocity = gameState.velocityVector.clone().multiplyScalar(dampingFactor);
if (dampedVelocity.length() >= gameState.minVelocity || 
    gameState.slingshot.active || 
    gameState.slingshot.postSlingshot || 
    gameState.emergencyWarp.active ||
    gameState.emergencyWarp.postWarp) {  // NEW CONDITION
    gameState.velocityVector.copy(dampedVelocity);
}
    
    // Apply velocity to position
    camera.position.add(gameState.velocityVector);
    
    // SPECIFICATION: Auto-Navigation - Automatically disengages when energy drops below 5
    if (gameState.autoNavigating && gameState.currentTarget && gameState.energy > 5) {
        if (gameState.autoNavOrienting) {
            const isOriented = orientTowardsTarget(gameState.currentTarget);
            if (isOriented) {
                gameState.autoNavOrienting = false;
                if (typeof showAchievement === 'function') {
                    showAchievement('Target Acquired', 'Orientation complete - beginning approach');
                }
            }
        } else {
            const targetDirection = new THREE.Vector3().subVectors(
                gameState.currentTarget.position, 
                camera.position
            ).normalize();
            
            gameState.velocityVector.addScaledVector(targetDirection, gameState.thrustPower * 0.4);
            gameState.energy = Math.max(0, gameState.energy - 0.03);
            
            const targetDistance = camera.position.distanceTo(gameState.currentTarget.position);
            if (targetDistance > 100) {
                orientTowardsTarget(gameState.currentTarget);
            }
        }
    } else if (gameState.autoNavigating && gameState.energy <= 5) {
        // SPECIFICATION: Automatically disengages when energy drops below 5
        gameState.autoNavigating = false;
        gameState.autoNavOrienting = false;
        if (typeof showAchievement === 'function') {
            showAchievement('Auto-Navigation Disengaged', 'Insufficient energy');
        }
    }
    
    // Update velocity for Ship Status panel
    gameState.velocity = gameState.velocityVector.length();

    // FIXED: Energy regeneration only when NOT actively thrusting
const isThrusting = (keys.w || keys.a || keys.s || keys.d || keys.b || keys.x) && gameState.energy > 0;

if (!isThrusting && gameState.energy < 100) {
    gameState.energy = Math.min(100, gameState.energy + 0.06); // Reduced regeneration rate
}
    
    // Update HUD
    if (typeof updateHUD === 'function') {
        updateHUD();
    }
    
    // FIXED: Emergency warp regeneration system (one per minute)
if (!gameState.emergencyWarp.lastRegenTime) {
    gameState.emergencyWarp.lastRegenTime = Date.now();
}

const timeSinceLastRegen = Date.now() - gameState.emergencyWarp.lastRegenTime;
const regenInterval = 60000; // 60 seconds = 1 minute

if (timeSinceLastRegen >= regenInterval && gameState.emergencyWarp.available < 5) {
    gameState.emergencyWarp.available++;
    gameState.emergencyWarp.lastRegenTime = Date.now();
    
    if (typeof showAchievement === 'function') {
        showAchievement('Emergency Warp Recharged', 
            `Emergency warp available: ${gameState.emergencyWarp.available}/5`);
    }
    
    console.log(`Emergency warp recharged: ${gameState.emergencyWarp.available}/5`);
}
    
    // Add this line near the end of updateEnhancedPhysics function
    checkForGalaxyDiscovery();
}

// =============================================================================
// GALAXY DISCOVERY SYSTEM
// =============================================================================

function checkForGalaxyDiscovery() {
    // Check if there's a pending galaxy discovery
    if (!gameState.pendingGalaxyDiscovery || gameState.pendingGalaxyDiscovery.discoveryTriggered) {
        return;
    }
    
    const discovery = gameState.pendingGalaxyDiscovery;
    const now = Date.now();
    const timeInGalaxy = now - discovery.arrivalTime;
    
    // Discovery triggers when player has either:
    // 1. Spent 4+ seconds in the galaxy (observing), OR
    // 2. Engaged with targets/enemies (interacting)
    
    const hasExplored = timeInGalaxy > 4000; // 4 seconds
    const hasEngaged = gameState.currentTarget !== null;
    
    // Trigger discovery
    if (hasExplored || hasEngaged) {
        discovery.discoveryTriggered = true;
        
        // Show the single discovery achievement
        if (typeof showAchievement === 'function') {
            showAchievement('Galaxy Discovery!', `Discovered ${discovery.galaxyName}!`);
        }
        
        console.log(`Galaxy discovered: ${discovery.galaxyName}`);
        
        // Clear the pending discovery
        gameState.pendingGalaxyDiscovery = null;
    }
}

// CRITICAL: Achievement suppression system
function shouldSuppressAchievement(title) {
    // Suppress ALL achievements during black hole warp transitions
    if (gameState.suppressAchievements) {
        console.log(`Achievement suppressed during warp: ${title}`);
        return true;
    }
    return false;
}

// Initialize the discovery system in gameState
function initializeGalaxyDiscoverySystem() {
    if (typeof gameState !== 'undefined') {
        gameState.pendingGalaxyDiscovery = null;
        gameState.suppressAchievements = false; // Initialize suppression flag
    }
}

// =============================================================================
// NEBULA DISCOVERY SYSTEM
// =============================================================================

// Nebula music state
let currentNebulaMusic = null;
let nebulaMusicGain = null;

function playNebulaMusic(nebulaIndex) {
    if (!audioContext || typeof musicGain === 'undefined') return;

    // Stop existing nebula music with fade
    if (currentNebulaMusic) {
        stopNebulaMusic();
    }

    // Create unique, magical music for this nebula
    // Use higher frequencies for more pleasant, ethereal sound
    const baseFreq = 220 + (nebulaIndex * 55); // A3 and up
    const melodyFreq = 440 + (nebulaIndex * 110); // A4 and up
    const harmonyFreq = 330 + (nebulaIndex * 82.5); // E4 and up
    const atmosphereFreq = 880 + (nebulaIndex * 220); // A5 and up

    // Create oscillators for layered magical sound
    const osc1 = audioContext.createOscillator(); // Base harmony
    const osc2 = audioContext.createOscillator(); // Melody
    const osc3 = audioContext.createOscillator(); // Harmony
    const osc4 = audioContext.createOscillator(); // High atmosphere

    // Create gain node for fade-in (softer volume)
    nebulaMusicGain = audioContext.createGain();
    nebulaMusicGain.gain.setValueAtTime(0, audioContext.currentTime);
    nebulaMusicGain.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + 4); // 4 second fade in, softer

    // Use only sine and triangle for softer, more magical sound
    osc1.type = 'sine';
    osc1.frequency.value = baseFreq;

    osc2.type = 'triangle';
    osc2.frequency.value = melodyFreq;

    osc3.type = 'sine';
    osc3.frequency.value = harmonyFreq;

    osc4.type = 'sine';
    osc4.frequency.value = atmosphereFreq;

    // Connect oscillators
    osc1.connect(nebulaMusicGain);
    osc2.connect(nebulaMusicGain);
    osc3.connect(nebulaMusicGain);
    osc4.connect(nebulaMusicGain);
    nebulaMusicGain.connect(musicGain || masterGain);

    // Start oscillators
    osc1.start();
    osc2.start();
    osc3.start();
    osc4.start();

    // Store reference
    currentNebulaMusic = {
        oscillator1: osc1,
        oscillator2: osc2,
        oscillator3: osc3,
        oscillator4: osc4,
        gainNode: nebulaMusicGain,
        nebulaIndex: nebulaIndex
    };

    // Add gentle frequency modulation for magical, shimmering sound
    const modulationInterval = setInterval(() => {
        if (currentNebulaMusic && audioContext && audioContext.state === 'running') {
            const time = audioContext.currentTime;
            const mod1 = Math.sin(time * 0.3) * 5; // Gentler modulation
            const mod2 = Math.cos(time * 0.2) * 8;
            const mod3 = Math.sin(time * 0.4) * 3;
            osc2.frequency.setValueAtTime(melodyFreq + mod1, time);
            osc3.frequency.setValueAtTime(harmonyFreq + mod2, time);
            osc4.frequency.setValueAtTime(atmosphereFreq + mod3, time);
        } else {
            clearInterval(modulationInterval);
        }
    }, 100);

    console.log(`Playing magical nebula music for nebula ${nebulaIndex}`);
}

function stopNebulaMusic() {
    if (currentNebulaMusic && nebulaMusicGain && audioContext) {
        // Fade out over 2 seconds
        nebulaMusicGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 2);

        setTimeout(() => {
            if (currentNebulaMusic) {
                try {
                    currentNebulaMusic.oscillator1.stop();
                    currentNebulaMusic.oscillator2.stop();
                    currentNebulaMusic.oscillator3.stop();
                    currentNebulaMusic.oscillator4.stop();
                } catch(e) {}
                currentNebulaMusic = null;
            }
        }, 2100);
    }
}

function getEnemyIntelligence(nebulaPosition) {
    if (typeof enemies === 'undefined' || typeof planets === 'undefined') {
        return { nearbyGalaxy: null, enemyCount: 0, blackHoleLocations: [], cosmicObjects: [] };
    }

    // Find nearest galaxy
    let nearestGalaxy = null;
    let nearestGalaxyDist = Infinity;

    if (typeof planets !== 'undefined') {
        planets.forEach(planet => {
            if (planet.userData.type === 'blackhole' && planet.userData.isGalacticCore && planet.userData.galaxyId !== undefined) {
                const dist = nebulaPosition.distanceTo(planet.position);
                if (dist < nearestGalaxyDist && dist < 10000) {
                    nearestGalaxyDist = dist;
                    nearestGalaxy = planet.userData.galaxyId;
                }
            }
        });
    }

    if (nearestGalaxy === null) return { nearbyGalaxy: null, enemyCount: 0, blackHoleLocations: [], cosmicObjects: [] };

    // Get enemies in that galaxy
    const galaxyEnemies = enemies.filter(e =>
        e.userData.galaxyId === nearestGalaxy && e.userData.health > 0
    );

    // Find where enemies are hiding
    const blackHoleLocations = [];
    const cosmicObjects = [];

    galaxyEnemies.forEach(enemy => {
        // Check if near black hole
        const nearbyBlackHoles = planets.filter(p =>
            p.userData.type === 'blackhole' &&
            p.position.distanceTo(enemy.position) < 500
        );

        if (nearbyBlackHoles.length > 0) {
            nearbyBlackHoles.forEach(bh => {
                const bhName = bh.userData.name || 'Unknown Black Hole';
                if (!blackHoleLocations.includes(bhName)) {
                    blackHoleLocations.push(bhName);
                }
            });
        }

        // Check if near other cosmic objects
        const nearbyObjects = planets.filter(p =>
            (p.userData.type === 'planet' || p.userData.type === 'pulsar' || p.userData.type === 'neutron_star') &&
            p.position.distanceTo(enemy.position) < 300
        );

        if (nearbyObjects.length > 0) {
            nearbyObjects.forEach(obj => {
                const objName = obj.userData.name || obj.userData.type;
                if (!cosmicObjects.includes(objName)) {
                    cosmicObjects.push(objName);
                }
            });
        }
    });

    return {
        nearbyGalaxy,
        enemyCount: galaxyEnemies.length,
        blackHoleLocations: blackHoleLocations.slice(0, 3), // Max 3
        cosmicObjects: cosmicObjects.slice(0, 3) // Max 3
    };
}

function checkForNebulaDiscovery() {
    if (typeof gameState === 'undefined' || typeof camera === 'undefined') return;
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) return;

    const discoveryRange = 3000; // Distance to trigger discovery
    const exitRange = 4000; // Distance to trigger music fade out

    let playerNearNebula = false;

    nebulaClouds.forEach((nebula, index) => {
        if (!nebula || !nebula.userData) return;

        const distance = camera.position.distanceTo(nebula.position);

        // Check if player is within any nebula
        if (distance < exitRange) {
            playerNearNebula = true;
        }

        // Discovery check
        if (!nebula.userData.discovered && distance < discoveryRange) {
            // Mark as discovered
            nebula.userData.discovered = true;

            // Restore energy
            if (gameState.energy < 100) {
                const energyRestored = 100 - gameState.energy;
                gameState.energy = 100;
                console.log(`Energy restored: +${energyRestored.toFixed(1)}%`);
            }

            // ⭐ NEW: Award warp for discovering nebula
            if (gameState.emergencyWarp && gameState.emergencyWarp.available < gameState.emergencyWarp.maxWarps) {
                gameState.emergencyWarp.available++;
                console.log(`⚡ Warp earned from nebula discovery! Total: ${gameState.emergencyWarp.available}/${gameState.emergencyWarp.maxWarps}`);
            }

            // Play unique nebula music (DISABLED)
            // playNebulaMusic(index);

            // Get enemy intelligence
            const intel = getEnemyIntelligence(nebula.position);

            // Show welcome notification with intelligence
            const nebulaName = nebula.userData.mythicalName || nebula.userData.name || 'Unknown Nebula';

            let welcomeMessage = `Welcome to the ${nebulaName} Nebula. Energy restored to 100%. +1 Warp Earned!`;

            if (intel.nearbyGalaxy !== null && typeof galaxyTypes !== 'undefined') {
                const galaxy = galaxyTypes[intel.nearbyGalaxy];
                welcomeMessage += `\n\nINTELLIGENCE REPORT: ${galaxy.name} Galaxy (${galaxy.faction}) under attack! `;
                welcomeMessage += `${intel.enemyCount} hostile ${galaxy.species} forces detected.`;

                if (intel.blackHoleLocations.length > 0) {
                    welcomeMessage += `\n\nEnemies near black holes: ${intel.blackHoleLocations.join(', ')}`;
                }

                if (intel.cosmicObjects.length > 0) {
                    welcomeMessage += `\n\nEnemies near cosmic objects: ${intel.cosmicObjects.join(', ')}`;
                }

                welcomeMessage += `\n\nEliminate all hostiles to liberate the galaxy!`;
            }

            if (typeof showAchievement === 'function') {
                showAchievement('Nebula Discovered!', welcomeMessage, true);
            }

            console.log(`Nebula discovered: ${nebulaName}`);
            console.log(`Intelligence:`, intel);
        }
    });

    // If player has left all nebulas, stop the music (DISABLED)
    // if (!playerNearNebula && currentNebulaMusic) {
    //     stopNebulaMusic();
    // }
}

// =============================================================================
// FUNCTION EXPORTS AND COMPATIBILITY
// =============================================================================

// Make all functions globally available
window.updateEnhancedPhysics = updateEnhancedPhysics;
window.createHyperspaceEffect = createHyperspaceEffect;
window.executeSlingshot = executeSlingshot;
window.isBlackHoleWarpInvulnerable = isBlackHoleWarpInvulnerable;
window.createPlayerExplosion = createPlayerExplosion;

// Add these to your existing window exports:
window.shouldSuppressAchievement = shouldSuppressAchievement;
window.checkForGalaxyDiscovery = checkForGalaxyDiscovery;
window.initializeGalaxyDiscoverySystem = initializeGalaxyDiscoverySystem;
window.stopNebulaMusic = stopNebulaMusic;

// All asteroid functions
window.destroyAsteroid = destroyAsteroid;
window.destroyAsteroidByWeapon = destroyAsteroidByWeapon;
window.destroyAsteroidByCollision = destroyAsteroidByCollision;
window.createAsteroidExplosion = createAsteroidExplosion;

// Export nebula functions
window.checkForNebulaDiscovery = checkForNebulaDiscovery;
window.playNebulaMusic = playNebulaMusic;
window.stopNebulaMusic = stopNebulaMusic;
window.getEnemyIntelligence = getEnemyIntelligence;

// =============================================================================
// NEBULA DEEP DISCOVERY SYSTEM - Hostile Race Pathways
// =============================================================================

// Track active discovery paths
let discoveryPaths = [];

// Faction lore database - backstory for each hostile species
const FACTION_LORE = {
    'Federation': {
        species: 'Human',
        color: 0x4488ff,
        greeting: 'INCOMING TRANSMISSION - STARFLEET INTELLIGENCE',
        lore: `Captain, our sensors detect Federation renegades in this sector. These former Starfleet officers turned to piracy after the Dominion War, stealing military-grade vessels and preying on civilian convoys. Their commander, Admiral Kane, believes the Federation abandoned the outer colonies. Approach with extreme caution - they fight with the precision of trained officers but none of the mercy.`,
        threat: 'TACTICAL ASSESSMENT: Coordinated strike formations. Shield modulation tactics. High weapons accuracy.'
    },
    'Klingon Empire': {
        species: 'Klingon',
        color: 0xff8844,
        greeting: 'INTELLIGENCE BRIEFING - KLINGON THREAT DETECTED',
        lore: `A rogue Klingon warband has claimed this nebula as their hunting ground. Led by General Koth of House Duras, these warriors were exiled for dishonorable combat against civilians. They seek glory through slaughter, caring nothing for the warrior\'s code. Their battle cry: "Today IS a good day for YOU to die!" They will not retreat, they will not surrender.`,
        threat: 'TACTICAL ASSESSMENT: Aggressive ramming tactics. Cloaking devices possible. Berserker combat style.'
    },
    'Rebel Alliance': {
        species: 'Mon Calamari',
        color: 0x88ff44,
        greeting: 'PRIORITY ALERT - REBEL CELL IDENTIFIED',
        lore: `Mon Calamari insurgents have established a hidden base near this nebula. Survivors of a brutal Imperial occupation, they now strike at any vessel they perceive as a threat. Their leader, Admiral Ackbar\'s former lieutenant, commands converted civilian cruisers armed with salvaged turbolasers. They fight for vengeance, not peace - and they see all outsiders as potential enemies.`,
        threat: 'TACTICAL ASSESSMENT: Ambush specialists. Superior sensors. "It\'s a trap!" formations.'
    },
    'Romulan Star Empire': {
        species: 'Romulan',
        color: 0xff4488,
        greeting: 'CLASSIFIED INTERCEPT - ROMULAN ACTIVITY',
        lore: `The Tal Shiar have deployed a covert operations fleet to this region. These shadow agents answer to no one - not even the Romulan Senate. Their mission: eliminate all witnesses to their activities in this sector. Commander T\'Vok leads the operation, a woman whose name is whispered in fear across a dozen star systems. Trust nothing you see - Romulan holographic deception is legendary.`,
        threat: 'TACTICAL ASSESSMENT: Cloaking technology. Plasma torpedoes. Psychological warfare specialists.'
    },
    'Galactic Empire': {
        species: 'Imperial',
        color: 0x44ffff,
        greeting: 'IMPERIAL REMNANT FORCES DETECTED',
        lore: `An Imperial Remnant fleet lurks within this nebula, still flying the banner of a fallen Empire. Moff Jerec commands this force of fanatics, seeking ancient artifacts they believe will restore Imperial glory. Their TIE squadrons are piloted by veterans of a hundred battles, and their Star Destroyer captains show no mercy. The Empire\'s shadow stretches even here.`,
        threat: 'TACTICAL ASSESSMENT: Overwhelming numbers. Fighter swarms. Heavy capital ship firepower.'
    },
    'Cardassian Union': {
        species: 'Cardassian',
        color: 0xff44ff,
        greeting: 'OBSIDIAN ORDER WARNING - CARDASSIAN PRESENCE',
        lore: `Cardassian forces have infiltrated this region, remnants of the Obsidian Order\'s darkest programs. Gul Madred, infamous for his interrogation techniques, leads a fleet of warships equipped with experimental weapons. The Cardassians lost everything in the Dominion War - now they take from others. They specialize in disabling ships and capturing crews for... processing.`,
        threat: 'TACTICAL ASSESSMENT: Disabling weapons priority. Tractor beam traps. Torture specialists aboard.'
    },
    'Sith Empire': {
        species: 'Sith',
        color: 0xff8888,
        greeting: 'DARK SIDE PRESENCE - SITH LORD DETECTED',
        lore: `The Force trembles with dark energy from this nebula. A Sith Lord, Darth Malachar, has gathered an army of dark acolytes and corrupted soldiers. They seek to drain the life force of entire worlds to fuel their master\'s immortality. Their ships run red with the blood of innocents, and their weapons fire burns with the hatred of the Dark Side itself. Fear is their greatest weapon.`,
        threat: 'TACTICAL ASSESSMENT: Force-enhanced pilots. Lightning weapons. Unpredictable aggression.'
    },
    'Vulcan High Command': {
        species: 'Vulcan',
        color: 0xffaa88,
        greeting: 'LOGIC PROTOCOL VIOLATION - VULCAN EXTREMISTS',
        lore: `Disturbing intelligence, Captain. A sect of Vulcan extremists called the "V\'tosh ka\'tur" - Vulcans without logic - have established operations here. Led by T\'Pol\'s distant ancestor, Administrator Soval, they believe emotion must be purged from the galaxy - by force. Their ships are crewed by the most brilliant tactical minds in the quadrant, now turned to genocide. Cold, calculating, merciless.`,
        threat: 'TACTICAL ASSESSMENT: Perfect tactical efficiency. No fear. No hesitation. No mercy.'
    }
};

// Create a dotted path line from nebula to galaxy core
function createDiscoveryPath(nebulaPosition, galaxyBlackHole, factionColor, factionName) {
    if (!scene || !THREE) return null;
    
    const startPos = nebulaPosition.clone();
    const endPos = galaxyBlackHole.position.clone();
    
    // Create points along the path
    const pathPoints = [];
    const segments = 100;
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Add slight curve for visual interest
        const curveHeight = Math.sin(t * Math.PI) * 500;
        pathPoints.push(new THREE.Vector3(
            startPos.x + (endPos.x - startPos.x) * t,
            startPos.y + (endPos.y - startPos.y) * t + curveHeight,
            startPos.z + (endPos.z - startPos.z) * t
        ));
    }
    
    // Create the path geometry
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
    
    // Create dashed line material
    const pathMaterial = new THREE.LineDashedMaterial({
        color: factionColor,
        dashSize: 100,
        gapSize: 50,
        linewidth: 2,
        transparent: true,
        opacity: 0.7
    });
    
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.computeLineDistances(); // Required for dashed lines
    
    pathLine.userData = {
        type: 'discovery_path',
        faction: factionName,
        startPosition: startPos.clone(),
        endPosition: endPos.clone(),
        createdAt: Date.now()
    };
    
    // Add glow particles along the path
    const glowParticles = createPathGlowParticles(pathPoints, factionColor);
    
    scene.add(pathLine);
    if (glowParticles) scene.add(glowParticles);
    
    discoveryPaths.push({ line: pathLine, particles: glowParticles, faction: factionName });
    
    console.log(`🛤️ Discovery path created to ${factionName} territory`);
    return pathLine;
}

// Create glowing particles along the discovery path
function createPathGlowParticles(pathPoints, color) {
    if (!THREE) return null;
    
    const particleCount = 50;
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
        const pointIndex = Math.floor((i / particleCount) * pathPoints.length);
        const point = pathPoints[Math.min(pointIndex, pathPoints.length - 1)];
        
        positions[i * 3] = point.x + (Math.random() - 0.5) * 50;
        positions[i * 3 + 1] = point.y + (Math.random() - 0.5) * 50;
        positions[i * 3 + 2] = point.z + (Math.random() - 0.5) * 50;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: color,
        size: 30,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });
    
    const particles = new THREE.Points(geometry, material);
    particles.userData = { type: 'discovery_path_particles' };
    
    return particles;
}

// Find the nearest galaxy core black hole to a position
function findNearestGalaxyCore(position) {
    if (typeof planets === 'undefined') return null;
    
    let nearestCore = null;
    let nearestDist = Infinity;
    
    planets.forEach(planet => {
        if (planet.userData.isGalacticCore && planet.userData.type === 'blackhole') {
            const dist = position.distanceTo(planet.position);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestCore = planet;
            }
        }
    });
    
    return nearestCore;
}

// Find a galaxy core by galaxy ID
function findGalaxyCoreById(galaxyId) {
    if (typeof planets === 'undefined') return null;
    
    for (const planet of planets) {
        if (planet.userData.isGalacticCore && 
            planet.userData.type === 'blackhole' && 
            planet.userData.galaxyId === galaxyId) {
            return planet;
        }
    }
    return null;
}

// Find cosmic features for a specific galaxy
function findCosmicFeaturesForGalaxy(galaxyId) {
    if (typeof cosmicFeatures === 'undefined') return [];
    
    const features = [];
    
    // Check all cosmic feature arrays
    const featureArrays = [
        { array: cosmicFeatures.pulsars, name: 'Pulsar' },
        { array: cosmicFeatures.supernovas, name: 'Supernova' },
        { array: cosmicFeatures.brownDwarfs, name: 'Brown Dwarf' },
        { array: cosmicFeatures.darkMatterNodes, name: 'Dark Matter Node' },
        { array: cosmicFeatures.dysonSpheres, name: 'Dyson Sphere' },
        { array: cosmicFeatures.ringworlds, name: 'Ringworld' },
        { array: cosmicFeatures.solarStorms, name: 'Solar Storm' },
        { array: cosmicFeatures.roguePlanets, name: 'Rogue Planet' },
        { array: cosmicFeatures.crystalFormations, name: 'Crystal Formation' }
    ];
    
    featureArrays.forEach(({ array, name }) => {
        if (array && array.length > 0) {
            array.forEach(feature => {
                if (feature.userData && feature.userData.galaxyId === galaxyId) {
                    features.push({
                        position: feature.position.clone(),
                        name: feature.userData.name || name,
                        type: name
                    });
                }
            });
        }
    });
    
    return features;
}

// Find patrol enemies near cosmic features for a galaxy (AWAY from black hole)
function findPatrolEnemiesNearCosmicFeatures(galaxyId) {
    if (typeof enemies === 'undefined') return null;
    
    // Get the black hole position to avoid it
    const galaxyCore = findGalaxyCoreById(galaxyId);
    const blackHolePos = galaxyCore ? galaxyCore.position : null;
    const minDistFromBlackHole = 2000; // Must be at least this far from black hole
    
    // First, get cosmic features for this galaxy that are AWAY from the black hole
    let cosmicFeats = findCosmicFeaturesForGalaxy(galaxyId);
    
    // Filter out cosmic features too close to the black hole
    if (blackHolePos) {
        cosmicFeats = cosmicFeats.filter(f => 
            f.position.distanceTo(blackHolePos) > minDistFromBlackHole
        );
    }
    
    // Get all enemies for this galaxy (alive, non-boss, AWAY from black hole)
    let galaxyEnemies = enemies.filter(e => 
        e.userData.galaxyId === galaxyId &&
        e.userData.health > 0 &&
        !e.userData.isBoss &&
        !e.userData.isBossSupport
    );
    
    // Filter out enemies too close to the black hole
    if (blackHolePos) {
        galaxyEnemies = galaxyEnemies.filter(e =>
            e.position.distanceTo(blackHolePos) > minDistFromBlackHole
        );
    }
    
    if (galaxyEnemies.length === 0) {
        console.log(`No patrol enemies found away from black hole for galaxy ${galaxyId}`);
        return null;
    }
    
    // If we have cosmic features away from the black hole, find enemies near them
    if (cosmicFeats.length > 0) {
        // Find the cosmic feature with the most enemies nearby
        let bestFeature = null;
        let bestEnemyCount = 0;
        let nearbyEnemies = [];
        
        cosmicFeats.forEach(feature => {
            const nearby = galaxyEnemies.filter(e => 
                e.position.distanceTo(feature.position) < 3000
            );
            if (nearby.length > bestEnemyCount) {
                bestEnemyCount = nearby.length;
                bestFeature = feature;
                nearbyEnemies = nearby;
            }
        });
        
        if (bestFeature && bestEnemyCount > 0) {
            // Return the COSMIC FEATURE position (not enemy centroid)
            // This ensures the path leads to the cosmic feature itself
            console.log(`Found ${bestEnemyCount} enemies near ${bestFeature.name} at distance ${blackHolePos ? bestFeature.position.distanceTo(blackHolePos).toFixed(0) : '?'} from black hole`);
            
            return {
                position: bestFeature.position.clone(),
                count: bestEnemyCount,
                cosmicFeature: bestFeature.name,
                cosmicFeatureType: bestFeature.type
            };
        }
    }
    
    // Fallback: find the enemy centroid that's furthest from the black hole
    if (galaxyEnemies.length > 0) {
        const centroid = new THREE.Vector3();
        galaxyEnemies.forEach(e => centroid.add(e.position));
        centroid.divideScalar(galaxyEnemies.length);
        
        console.log(`Fallback: ${galaxyEnemies.length} patrol enemies, centroid ${blackHolePos ? centroid.distanceTo(blackHolePos).toFixed(0) : '?'} from black hole`);
        
        return {
            position: centroid,
            count: galaxyEnemies.length,
            cosmicFeature: null,
            cosmicFeatureType: null
        };
    }
    
    return null;
}

// Create a path to a position (generalized version)
function createDiscoveryPathToPosition(nebulaPosition, targetPosition, factionColor, factionName, pathType) {
    if (!scene || !THREE) return null;
    
    const startPos = nebulaPosition.clone();
    const endPos = targetPosition.clone();
    
    // Create points along the path
    const pathPoints = [];
    const segments = 100;
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Add slight curve for visual interest
        const curveHeight = Math.sin(t * Math.PI) * 500;
        pathPoints.push(new THREE.Vector3(
            startPos.x + (endPos.x - startPos.x) * t,
            startPos.y + (endPos.y - startPos.y) * t + curveHeight,
            startPos.z + (endPos.z - startPos.z) * t
        ));
    }
    
    // Create the path geometry
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
    
    // Different dash patterns for core vs patrol
    const dashSize = pathType === 'core' ? 100 : 60;
    const gapSize = pathType === 'core' ? 50 : 40;
    
    // Create dashed line material
    const pathMaterial = new THREE.LineDashedMaterial({
        color: factionColor,
        dashSize: dashSize,
        gapSize: gapSize,
        linewidth: 2,
        transparent: true,
        opacity: 0.7
    });
    
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.computeLineDistances(); // Required for dashed lines
    
    pathLine.userData = {
        type: 'discovery_path',
        pathType: pathType, // 'core' or 'patrol'
        faction: factionName,
        startPosition: startPos.clone(),
        endPosition: endPos.clone(),
        createdAt: Date.now()
    };
    
    // Add glow particles along the path
    const glowParticles = createPathGlowParticles(pathPoints, factionColor);
    
    scene.add(pathLine);
    if (glowParticles) scene.add(glowParticles);
    
    discoveryPaths.push({ line: pathLine, particles: glowParticles, faction: factionName, pathType: pathType });
    
    console.log(`🛤️ Discovery path (${pathType}) created to ${factionName} territory`);
    return pathLine;
}

// =============================================================================
// NEBULA-TO-GALAXY MISSION MAPPINGS
// Every nebula discovery triggers faction lore and a path to enemy locations.
// Distant and Exotic nebulas fill in factions not covered by the clustered pairs.
// =============================================================================

// Distant nebulas: prioritize galaxies 4-7 (uncovered by clustered), then cycle
const DISTANT_NEBULA_GALAXY_MAP = {
    'Distant Nebula Alpha': 4,    // Galactic Empire
    'Distant Nebula Beta': 5,     // Cardassian Union
    'Distant Nebula Gamma': 6,    // Sith Empire
    'Distant Nebula Delta': 7,    // Vulcan High Command
    'Distant Nebula Epsilon': 0,  // Federation
    'Distant Nebula Zeta': 1      // Klingon Empire
};

// Exotic nebulas: fill remaining gaps, then cycle through all 8 factions
const EXOTIC_NEBULA_GALAXY_MAP = {
    'Frontier Nebula': 2,         // Rebel Alliance
    'Outer Veil Nebula': 3,       // Romulan Star Empire
    'Deep Space Nebula': 4,       // Galactic Empire
    'Void Nebula': 5,             // Cardassian Union
    'Boundary Nebula': 6,         // Sith Empire
    'Edge Nebula': 7,             // Vulcan High Command
    'Threshold Nebula': 0,        // Federation
    'Horizon Nebula': 1           // Klingon Empire
};

// Galaxy-formation nebulas: 1:1 mapping to their corresponding galaxy type
const GALAXY_FORMATION_NEBULA_MAP = {
    'Olympus Nebula': 0,          // Federation (Spiral)
    'Titan Nebula': 1,            // Klingon Empire (Elliptical)
    'Atlantis Nebula': 2,         // Rebel Alliance (Ring)
    'Prometheus Nebula': 3,       // Romulan Star Empire (Irregular)
    'Elysium Nebula': 4,          // Galactic Empire (Quasar)
    'Tartarus Nebula': 5,         // Cardassian Union (Lenticular)
    'Hyperion Nebula': 6,         // Sith Empire (Ancient)
    'Chronos Nebula': 7           // Vulcan High Command (Spiral)
};

// Faction color name lookup
const FACTION_COLOR_NAMES = {
    'Federation': 'blue',
    'Klingon Empire': 'orange',
    'Rebel Alliance': 'green',
    'Romulan Star Empire': 'pink',
    'Galactic Empire': 'cyan',
    'Cardassian Union': 'magenta',
    'Sith Empire': 'red',
    'Vulcan High Command': 'peach'
};

// Check if all enemies for a faction/galaxy have been eliminated
function isFactionDefeated(galaxyId) {
    if (typeof enemies === 'undefined') return false;
    const alive = enemies.filter(e =>
        e.userData &&
        e.userData.galaxyId === galaxyId &&
        e.userData.health > 0 &&
        !e.userData.isEliteGuardian
    );
    return alive.length === 0;
}

// Check if all enemies that initially spawned near a galaxy's black hole are cleared
function areBlackHoleEnemiesCleared(galaxyId) {
    if (typeof enemies === 'undefined') return false;
    const blackHoleEnemies = enemies.filter(e =>
        e.userData &&
        e.userData.galaxyId === galaxyId &&
        e.userData.placementType === 'black_hole'
    );
    // If no black hole enemies were ever spawned for this galaxy, consider it cleared
    if (blackHoleEnemies.length === 0) return true;
    const alive = blackHoleEnemies.filter(e => e.userData.health > 0);
    return alive.length === 0;
}

// Find remaining alive enemies for a galaxy to point a discovery path toward
function findRemainingEnemyTarget(galaxyId) {
    if (typeof enemies === 'undefined') return null;
    const alive = enemies.filter(e =>
        e.userData &&
        e.userData.galaxyId === galaxyId &&
        e.userData.health > 0 &&
        !e.userData.isEliteGuardian
    );
    if (alive.length === 0) return null;
    // Return the centroid of all remaining enemies
    const centroid = new THREE.Vector3();
    alive.forEach(e => centroid.add(e.position));
    centroid.divideScalar(alive.length);
    return { position: centroid, count: alive.length };
}

// Classify a nebula by its userData properties
function classifyNebula(nebula) {
    const ud = nebula.userData;
    if (ud.isDistant) return 'distant';
    if (ud.isExoticCore) return 'exotic';
    if (ud.shape) return 'galaxy_formation';
    return 'clustered';
}

// Resolve a nebula to its paired galaxy ID
function resolveNebulaGalaxyId(nebula, nebulaType, index) {
    const name = nebula.userData.name || '';
    switch (nebulaType) {
        case 'distant':
            return DISTANT_NEBULA_GALAXY_MAP[name] !== undefined ? DISTANT_NEBULA_GALAXY_MAP[name] : index % 8;
        case 'exotic':
            return EXOTIC_NEBULA_GALAXY_MAP[name] !== undefined ? EXOTIC_NEBULA_GALAXY_MAP[name] : index % 8;
        case 'galaxy_formation':
            return GALAXY_FORMATION_NEBULA_MAP[name] !== undefined ? GALAXY_FORMATION_NEBULA_MAP[name] : index % 8;
        case 'clustered':
        default: {
            // First 8 clustered nebulas use the original paired logic
            const pairIndex = Math.floor(index / 2);
            return pairIndex % 8;
        }
    }
}

// Deep discovery check - triggers based on nebula type
// CLUSTERED: Paired system (even=core path, odd=patrol path) - triggers on close approach
// GALAXY-FORMATION: Triggers ONLY after all black hole enemies for that galaxy are cleared
// DISTANT & EXOTIC: Each triggers its own faction lore and path to remaining enemies
// ALL TYPES: If faction already defeated, shows liberation gratitude instead
function checkForNebulaDeepDiscovery() {
    if (typeof gameState === 'undefined' || typeof camera === 'undefined') return;
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) return;
    if (typeof galaxyTypes === 'undefined') return;

    // Track first-8 clustered nebula count for paired index logic
    let clusteredCount = 0;

    nebulaClouds.forEach((nebula, index) => {
        if (!nebula || !nebula.userData) return;

        // Skip if already deep-discovered
        if (nebula.userData.deepDiscovered) return;

        // Classify nebula by userData flags
        const nebulaType = classifyNebula(nebula);
        const nebulaSize = nebula.userData.size || 2000;

        // Discovery range depends on nebula category
        let deepDiscoveryRange;
        if (nebulaType === 'clustered' || nebulaType === 'galaxy_formation') {
            deepDiscoveryRange = 100; // Close approach required
        } else {
            deepDiscoveryRange = nebulaSize; // Distant/exotic use their size
        }

        const distance = camera.position.distanceTo(nebula.position);

        // Debug: log when getting close
        if (distance < nebulaSize && gameState.frameCount % 60 === 0) {
            console.log(`🔍 Near ${nebulaType} nebula ${index}: ${distance.toFixed(0)} units (need < ${deepDiscoveryRange})`);
        }

        if (distance >= deepDiscoveryRange) return;

        // Resolve which galaxy/faction this nebula maps to
        const galaxyId = resolveNebulaGalaxyId(nebula, nebulaType, index);
        if (galaxyId === undefined) return;

        const galaxyCore = findGalaxyCoreById(galaxyId);
        if (!galaxyCore) {
            console.log(`No galaxy core found for galaxy ${galaxyId}`);
            return;
        }

        const galaxyType = galaxyTypes[galaxyId];
        if (!galaxyType) return;

        const factionName = galaxyType.faction;
        const loreData = FACTION_LORE[factionName];
        if (!loreData) return;

        const nebulaName = nebula.userData.mythicalName || nebula.userData.name || 'Unknown Nebula';
        const colorName = FACTION_COLOR_NAMES[factionName] || 'white';

        // GALAXY-FORMATION: Only trigger after all black hole enemies for this galaxy are eliminated
        if (nebulaType === 'galaxy_formation') {
            if (!areBlackHoleEnemiesCleared(galaxyId)) {
                // Not ready yet - don't mark as discovered, check again later
                if (gameState.frameCount % 120 === 0) {
                    console.log(`⏳ ${nebulaName}: ${factionName} black hole forces still active - discovery deferred`);
                }
                return;
            }
        }

        // Mark as deep discovered
        console.log(`✨ DEEP DISCOVERY TRIGGERED for ${nebulaType} nebula "${nebulaName}" at distance ${distance.toFixed(0)}`);
        nebula.userData.deepDiscovered = true;

        // CHECK: Is this faction already defeated?
        if (isFactionDefeated(galaxyId)) {
            // Liberation gratitude message
            playDeepDiscoverySound();

            const liberationText =
                `INCOMING TRANSMISSION - LIBERATED TERRITORY\n\n` +
                `Captain, welcome to the ${nebulaName}.\n\n` +
                `Thanks to your heroic efforts, the ${factionName} forces that once terrorized this region have been completely eliminated. ` +
                `The ${galaxyType.species} hostiles who controlled the ${galaxyType.name} Galaxy are no more.\n\n` +
                `The inhabitants of this nebula and surrounding systems wish to express their deepest gratitude. ` +
                `Civilian shipping lanes have been reopened, and reconstruction efforts are underway.\n\n` +
                `This sector is now safe, Captain. Your courage will not be forgotten.`;

            if (typeof showMissionCommandAlert === 'function') {
                showMissionCommandAlert('Mission Control - Liberated Sector', liberationText);
            }

            if (typeof showAchievement === 'function') {
                showAchievement(
                    'Liberated Nebula!',
                    `${nebulaName} is free from ${factionName} control. The ${galaxyType.species} threat has been eliminated.`,
                    true
                );
            }

            console.log(`🕊️ Liberation: ${nebulaName} - ${factionName} already defeated in galaxy ${galaxyId}`);
            return;
        }

        // FACTION STILL ACTIVE - Create path to enemy locations
        console.log(`🌌 ${nebulaType} nebula "${nebulaName}" → Galaxy ${galaxyId} (${factionName})`);

        if (nebulaType === 'clustered') {
            // CLUSTERED: Paired system - even index = core stronghold, odd = patrol routes
            const isCorePath = (index % 2 === 0);

            if (isCorePath) {
                // PATH TO BLACK HOLE CORE
                createDiscoveryPathToPosition(
                    nebula.position,
                    galaxyCore.position,
                    loreData.color,
                    factionName,
                    'core'
                );

                playDeepDiscoverySound();

                const transmissionText = `${loreData.greeting}\n\n` +
                    `${loreData.lore}\n\n` +
                    `${loreData.threat}\n\n` +
                    `STRONGHOLD DETECTED: The ${factionName} have fortified their position around the ${galaxyType.name} Galaxy black hole, ` +
                    `preventing interstellar travel through this region. Their command structure and elite forces are concentrated here.\n\n` +
                    `NAVIGATION: Follow the ${colorName} dotted line from ${nebulaName} to their stronghold.\n\n` +
                    `Strike at the heart of their operation, Captain.`;

                if (typeof showMissionCommandAlert === 'function') {
                    showMissionCommandAlert('Mission Control - Stronghold Located', transmissionText);
                }

                if (typeof showAchievement === 'function') {
                    showAchievement(
                        'Enemy Stronghold Located!',
                        `${factionName} command center at ${galaxyType.name} Galaxy Core. Path marked.`,
                        true
                    );
                }

                console.log(`🔮 Deep discovery (CORE): ${nebulaName} → ${factionName} stronghold at galaxy ${galaxyId}`);
            } else {
                // PATH TO PATROL ENEMIES NEAR COSMIC FEATURES
                const patrolData = findPatrolEnemiesNearCosmicFeatures(galaxyId);

                if (patrolData) {
                    createDiscoveryPathToPosition(
                        nebula.position,
                        patrolData.position,
                        loreData.color,
                        factionName,
                        'patrol'
                    );

                    playDeepDiscoverySound();

                    let locationInfo = '';
                    if (patrolData.cosmicFeature) {
                        locationInfo = `Our sensors have detected ${patrolData.count} ${factionName} patrol units ` +
                            `operating near the ${patrolData.cosmicFeature}. They're using the ${patrolData.cosmicFeatureType} ` +
                            `as a staging area for raids on civilian shipping.`;
                    } else {
                        locationInfo = `Our sensors have detected ${patrolData.count} ${factionName} patrol units ` +
                            `scattered throughout the ${galaxyType.name} Galaxy. They're conducting search-and-destroy missions ` +
                            `against civilian shipping lanes.`;
                    }

                    const transmissionText = `${loreData.greeting}\n\n` +
                        `PATROL FORCES DETECTED: ${locationInfo}\n\n` +
                        `${loreData.threat}\n\n` +
                        `NAVIGATION: Follow the ${colorName} dotted line from ${nebulaName} to intercept their patrol routes.\n\n` +
                        `Hunt them down before they find more victims, Captain.`;

                    if (typeof showMissionCommandAlert === 'function') {
                        showMissionCommandAlert('Mission Control - Patrol Routes Located', transmissionText);
                    }

                    const achievementText = patrolData.cosmicFeature
                        ? `${patrolData.count} ${factionName} units near ${patrolData.cosmicFeature}. Path marked.`
                        : `${patrolData.count} ${factionName} patrol units detected. Path marked.`;

                    if (typeof showAchievement === 'function') {
                        showAchievement('Enemy Patrols Located!', achievementText, true);
                    }

                    console.log(`🔮 Deep discovery (PATROL): ${nebulaName} → ${factionName} patrols (${patrolData.count} units, cosmic: ${patrolData.cosmicFeature || 'none'})`);
                } else {
                    console.log(`No patrol enemies found for ${factionName} in galaxy ${galaxyId}`);
                }
            }
        } else if (nebulaType === 'galaxy_formation') {
            // GALAXY-FORMATION: Black hole enemies are cleared - point to remaining scattered enemies
            const remainingTarget = findRemainingEnemyTarget(galaxyId);

            if (remainingTarget) {
                createDiscoveryPathToPosition(
                    nebula.position,
                    remainingTarget.position,
                    loreData.color,
                    factionName,
                    'patrol'
                );

                playDeepDiscoverySound();

                const transmissionText = `${loreData.greeting}\n\n` +
                    `${loreData.lore}\n\n` +
                    `STRONGHOLD FALLEN: Captain, the ${factionName} black hole stronghold in the ${galaxyType.name} Galaxy has been destroyed! ` +
                    `However, ${remainingTarget.count} ${galaxyType.species} survivors have scattered across the sector and remain dangerous.\n\n` +
                    `${loreData.threat}\n\n` +
                    `NAVIGATION: Follow the ${colorName} dotted line from the ${nebulaName} to intercept the remaining forces.\n\n` +
                    `Finish what you started, Captain. Leave no threat standing.`;

                if (typeof showMissionCommandAlert === 'function') {
                    showMissionCommandAlert('Mission Control - Remnant Forces Detected', transmissionText);
                }

                if (typeof showAchievement === 'function') {
                    showAchievement(
                        'Remnant Forces Located!',
                        `${remainingTarget.count} scattered ${factionName} survivors detected. Path marked from ${nebulaName}.`,
                        true
                    );
                }

                console.log(`🔮 Deep discovery (REMNANT): ${nebulaName} → ${remainingTarget.count} ${factionName} survivors in galaxy ${galaxyId}`);
            } else {
                console.log(`No remaining enemies for ${factionName} in galaxy ${galaxyId}`);
            }
        } else {
            // DISTANT & EXOTIC: Each triggers its own lore and path to remaining enemies
            // Try patrol enemies near cosmic features first, fall back to any remaining enemies
            const patrolData = findPatrolEnemiesNearCosmicFeatures(galaxyId);
            const targetData = patrolData || findRemainingEnemyTarget(galaxyId);

            if (targetData) {
                const pathType = patrolData ? 'patrol' : 'core';
                createDiscoveryPathToPosition(
                    nebula.position,
                    targetData.position,
                    loreData.color,
                    factionName,
                    pathType
                );

                playDeepDiscoverySound();

                let locationInfo = '';
                if (patrolData && patrolData.cosmicFeature) {
                    locationInfo = `ENEMY STAGING AREA: ${targetData.count} ${factionName} forces detected near the ${patrolData.cosmicFeature}. ` +
                        `They're using the ${patrolData.cosmicFeatureType} as a forward operating base deep in the ${galaxyType.name} Galaxy.`;
                } else {
                    locationInfo = `HOSTILE TERRITORY: ${targetData.count} ${factionName} forces detected in the ${galaxyType.name} Galaxy. ` +
                        `Their ${galaxyType.species} warriors control this region of space and threaten all who pass through.`;
                }

                const transmissionText = `${loreData.greeting}\n\n` +
                    `${loreData.lore}\n\n` +
                    `${locationInfo}\n\n` +
                    `${loreData.threat}\n\n` +
                    `NAVIGATION: Follow the ${colorName} dotted line from ${nebulaName} to engage.\n\n` +
                    `The universe is counting on you, Captain.`;

                if (typeof showMissionCommandAlert === 'function') {
                    showMissionCommandAlert('Mission Control - Hostile Forces Located', transmissionText);
                }

                if (typeof showAchievement === 'function') {
                    showAchievement(
                        `${factionName} Forces Located!`,
                        `${targetData.count} hostiles in the ${galaxyType.name} Galaxy. Path marked from ${nebulaName}.`,
                        true
                    );
                }

                console.log(`🔮 Deep discovery (${nebulaType.toUpperCase()}): ${nebulaName} → ${factionName} forces (${targetData.count} units) in galaxy ${galaxyId}`);
            } else {
                console.log(`No enemies found for ${factionName} in galaxy ${galaxyId} from ${nebulaName}`);
            }
        }
    });
}

// Play dramatic sound for deep discovery
function playDeepDiscoverySound() {
    if (!audioContext || typeof sfxGain === 'undefined') return;
    
    try {
        // Create ominous discovery tone
        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(110, audioContext.currentTime);
        osc1.frequency.linearRampToValueAtTime(220, audioContext.currentTime + 1);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(165, audioContext.currentTime);
        osc2.frequency.linearRampToValueAtTime(330, audioContext.currentTime + 1);
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.3);
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 2);
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(sfxGain || masterGain);
        
        osc1.start();
        osc2.start();
        osc1.stop(audioContext.currentTime + 2);
        osc2.stop(audioContext.currentTime + 2);
        
        console.log('🔊 Deep discovery sound played');
    } catch (e) {
        console.log('Could not play discovery sound:', e);
    }
}

// Animate discovery paths (pulsing effect)
function animateDiscoveryPaths() {
    const time = Date.now() * 0.001;
    
    discoveryPaths.forEach(path => {
        if (path.line && path.line.material) {
            // Pulse the opacity
            path.line.material.opacity = 0.5 + Math.sin(time * 2) * 0.2;
        }
        if (path.particles && path.particles.material) {
            // Pulse particles
            path.particles.material.opacity = 0.3 + Math.sin(time * 3) * 0.2;
        }
    });
}

// Export deep discovery functions
window.checkForNebulaDeepDiscovery = checkForNebulaDeepDiscovery;
window.createDiscoveryPath = createDiscoveryPath;
window.createDiscoveryPathToPosition = createDiscoveryPathToPosition;
window.findGalaxyCoreById = findGalaxyCoreById;
window.findCosmicFeaturesForGalaxy = findCosmicFeaturesForGalaxy;
window.findPatrolEnemiesNearCosmicFeatures = findPatrolEnemiesNearCosmicFeatures;
window.animateDiscoveryPaths = animateDiscoveryPaths;
window.FACTION_LORE = FACTION_LORE;
window.discoveryPaths = discoveryPaths;
window.isFactionDefeated = isFactionDefeated;
window.areBlackHoleEnemiesCleared = areBlackHoleEnemiesCleared;
window.findRemainingEnemyTarget = findRemainingEnemyTarget;
window.DISTANT_NEBULA_GALAXY_MAP = DISTANT_NEBULA_GALAXY_MAP;
window.EXOTIC_NEBULA_GALAXY_MAP = EXOTIC_NEBULA_GALAXY_MAP;
window.GALAXY_FORMATION_NEBULA_MAP = GALAXY_FORMATION_NEBULA_MAP;

// Automatic black hole warp function
window.transitionToRandomLocation = transitionToRandomLocation;

// Enhanced orientation function for auto-navigation
window.orientTowardsTarget = orientTowardsTarget;

console.log('SPECIFICATION COMPLIANT Game Physics loaded');
console.log('Flight Controls: Direct camera.rotateX/Y/Z() for intuitive local space feel');
console.log('Energy System: W(0.12), S(0.04), A/D(0.06), B(0.12), B+Shift(0.15)');
console.log('Asteroid Functions: All destruction and collision functions restored');
console.log('Auto-Leveling: OFF by default, toggle with L key');
console.log('Boost System: B(1.8x), B+Shift(2.5x), O(Emergency Warp)');
console.log('Black Hole Warp: (near black holes) - FIXED KEY CONFLICT');
console.log('Physics: Constant motion, velocity damping, camera-relative movement');
console.log('Auto-Navigation: Compatible with specification controls, auto-disengages at energy < 5');
