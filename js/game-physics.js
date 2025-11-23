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

// PRESERVED: Enhanced screen damage effect
function createEnhancedScreenDamageEffect() {
    const damageOverlay = document.createElement('div');
    damageOverlay.className = 'absolute inset-0 bg-red-500 pointer-events-none z-30';
    damageOverlay.style.opacity = '0';
    damageOverlay.style.animation = 'damageFlash 0.5s ease-out forwards';
    document.body.appendChild(damageOverlay);
    
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.style.animation = 'screenShake 0.8s ease-out';
        setTimeout(() => {
            if (gameContainer) {
                gameContainer.style.animation = '';
            }
        }, 800);
    }
    
    setTimeout(() => {
        damageOverlay.remove();
    }, 500);
}

// COMPACT: All the cool effects but much smaller scale
function createAsteroidExplosion(position, radius = 1) {
    console.log('Creating compact asteroid explosion at position:', position, 'with radius:', radius);
    
    const explosionGroup = new THREE.Group();
    explosionGroup.position.copy(position);
    scene.add(explosionGroup);
    
    // MAIN EXPLOSION SPHERE - Small but visible
    const mainExplosionGeometry = new THREE.SphereGeometry(radius * 0.4, 12, 12); // Much smaller
    const mainExplosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.8
    });
    const mainExplosion = new THREE.Mesh(mainExplosionGeometry, mainExplosionMaterial);
    explosionGroup.add(mainExplosion);
    
    // PARTICLE DEBRIS - Much larger and more numerous
    const particleCount = 20; // More particles
    for (let i = 0; i < particleCount; i++) {
        const particleGeometry = new THREE.SphereGeometry(1 + Math.random() * 2, 6, 6); // Much larger particles
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(0.1 + Math.random() * 0.15, 0.8, 0.5 + Math.random() * 0.3),
            transparent: true,
            opacity: 0.9
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        // Much larger velocity spread
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 25, // Increased from 6 to 25
            (Math.random() - 0.5) * 25,
            (Math.random() - 0.5) * 25
        );
        
        explosionGroup.add(particle);
        
        let particleLife = 1.0;
        const particleInterval = setInterval(() => {
            particle.position.add(velocity.clone().multiplyScalar(0.2)); // Faster movement
            particleLife -= 0.08; // Slower fade for longer visibility
            particleMaterial.opacity = particleLife;
            
            // Particles get smaller as they fade
            const scale = particleLife;
            particle.scale.set(scale, scale, scale);
            
            if (particleLife <= 0) {
                clearInterval(particleInterval);
                explosionGroup.remove(particle);
                particleGeometry.dispose();
                particleMaterial.dispose();
            }
        }, 50); // Slower update for smoother animation
    }
    
    // MAIN EXPLOSION ANIMATION - Compact growth
    let explosionScale = 1;
    let explosionOpacity = 0.8;
    const explosionInterval = setInterval(() => {
        explosionScale += 1; // Small growth
        explosionOpacity -= 0.1; // Quick fade
        
        mainExplosion.scale.set(explosionScale, explosionScale, explosionScale);
        mainExplosionMaterial.opacity = explosionOpacity;
        
        if (explosionOpacity <= 0) {
            clearInterval(explosionInterval);
            explosionGroup.remove(mainExplosion);
            mainExplosionGeometry.dispose();
            mainExplosionMaterial.dispose();
        }
    }, 60);
    
    // SHOCKWAVE RING EFFECT - Smaller but still visible
    const shockwaveGeometry = new THREE.RingGeometry(radius * .6, radius * 1, 16); // Reduced from 2x-3x to 1.2x-1.8x
    const shockwaveMaterial = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.5, // Slightly more subtle
        side: THREE.DoubleSide
    });
    const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
    shockwave.rotation.x = Math.PI / 2; // Horizontal ring
    explosionGroup.add(shockwave);
    
    // Animate shockwave - moderate expansion
    let shockwaveScale = 1;
    let shockwaveOpacity = 0.5;
    const shockwaveInterval = setInterval(() => {
        shockwaveScale += 1.5; // Reduced from 3 to 1.5
        shockwaveOpacity -= 0.05;
        
        shockwave.scale.set(shockwaveScale, shockwaveScale, 1);
        shockwaveMaterial.opacity = shockwaveOpacity;
        
        if (shockwaveOpacity <= 0) {
            clearInterval(shockwaveInterval);
            explosionGroup.remove(shockwave);
            shockwaveGeometry.dispose();
            shockwaveMaterial.dispose();
        }
    }, 50);
    
    // CLEANUP - Moderate duration
    setTimeout(() => {
        if (explosionGroup.parent) {
            scene.remove(explosionGroup);
        }
        // console.log('Balanced asteroid explosion cleanup complete');
    }, 2000); // Reduced from 3000ms to 2000ms
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

        let particleLife = 1.0;
        const particleInterval = setInterval(() => {
            particle.position.add(velocity.clone().multiplyScalar(0.3));
            particleLife -= 0.02;
            particleMaterial.opacity = particleLife;

            const scale = particleLife;
            particle.scale.set(scale, scale, scale);

            if (particleLife <= 0) {
                clearInterval(particleInterval);
                explosionGroup.remove(particle);
                particleGeometry.dispose();
                particleMaterial.dispose();
            }
        }, 50);
    }

    // MAIN EXPLOSION ANIMATION - Dramatic growth
    let explosionScale = 1;
    let explosionOpacity = 1.0;
    const explosionInterval = setInterval(() => {
        explosionScale += 5;
        explosionOpacity -= 0.02;

        mainExplosion.scale.set(explosionScale, explosionScale, explosionScale);
        mainExplosionMaterial.opacity = explosionOpacity;

        if (explosionOpacity <= 0) {
            clearInterval(explosionInterval);
            explosionGroup.remove(mainExplosion);
            mainExplosionGeometry.dispose();
            mainExplosionMaterial.dispose();
        }
    }, 50);

    // MULTIPLE SHOCKWAVES
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
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

            let shockwaveScale = 1;
            let shockwaveOpacity = 0.8;
            const shockwaveInterval = setInterval(() => {
                shockwaveScale += 8;
                shockwaveOpacity -= 0.04;

                shockwave.scale.set(shockwaveScale, shockwaveScale, 1);
                shockwaveMaterial.opacity = shockwaveOpacity;

                if (shockwaveOpacity <= 0) {
                    clearInterval(shockwaveInterval);
                    explosionGroup.remove(shockwave);
                    shockwaveGeometry.dispose();
                    shockwaveMaterial.dispose();
                }
            }, 50);
        }, i * 200);
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
        
        // Determine galaxy location names
        const galaxyDiscoveryNames = [
            'Spiral Galaxy',         // 0 - Federation Space
            'Elliptical Galaxy',     // 1 - Klingon Empire
            'Irregular Galaxy',      // 2 - Rebel Alliance
            'Ring Galaxy',           // 3 - Romulan Star Empire
            'Dwarf Galaxy',          // 4 - Galactic Empire
            'Lenticular Galaxy',     // 5 - Cardassian Union
            'Quasar Galaxy',         // 6 - Sith Empire
            'Sagittarius A'          // 7 - Vulcan High Command / Local
        ];
        
        // Determine which galaxy we warped to based on proximity
        let arrivedGalaxyId = -1;

        if (typeof getGalaxy3DPosition === 'function') {
            for (let g = 0; g < 8; g++) {
                const galaxyCenter = getGalaxy3DPosition(g);

                if (camera.position.distanceTo(galaxyCenter) < 15000) {
                    arrivedGalaxyId = g;
                    break;
                }
            }
        }

        // Use the specific discovery name for the arrived galaxy
        const locationName = arrivedGalaxyId >= 0 && arrivedGalaxyId < galaxyDiscoveryNames.length
            ? galaxyDiscoveryNames[arrivedGalaxyId]
            : 'Unknown Region';
        
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
else if (keys.o && gameState.emergencyWarp.available > 0 && !gameState.emergencyWarp.active) {
    gameState.emergencyWarp.available--;
    gameState.emergencyWarp.active = true;
    gameState.emergencyWarp.timeRemaining = gameState.emergencyWarp.boostDuration;
    gameState.velocityVector.copy(forwardDirection).multiplyScalar(gameState.emergencyWarp.boostSpeed);
    
    // âœ… CRITICAL: Clear the key immediately to prevent retriggering
    keys.o = false;
    
    // âœ… Activate BOTH visual effects
    for (let i = 0; i < 3; i++) {
        setTimeout(() => createHyperspaceEffect(), i * 200);
    }
    
    // âœ… NEW: Activate 3D warp starfield
    if (typeof toggleWarpSpeedStarfield === 'function') {
        toggleWarpSpeedStarfield(true);
    }
    
    if (typeof playSound !== 'undefined') {
        playSound('warp');
    }

    console.log(`🚀 Emergency warp activated! ${gameState.emergencyWarp.available} charges remaining`);
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
            console.log('âš¡ Warp starfield disabled - speed below 10,000 km/s');
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
window.createEnhancedScreenDamageEffect = createEnhancedScreenDamageEffect;
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
