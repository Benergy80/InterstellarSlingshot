// Game Physics - Enhanced Movement, gravity, and physics systems
// SPECIFICATION COMPLIANT: Implements exact flight control system as specified
// DOUBLED WORLD SIZE: All distances and masses doubled while keeping player/enemy size the same
// FLIGHT CONTROLS: Direct camera.rotateX/Y/Z() calls for intuitive local space rotations
// COMPLETE: All original functionality preserved with specification-compliant controls

// =============================================================================
// ENHANCED FLIGHT CONTROL FUNCTIONS - SPECIFICATION COMPLIANT
// =============================================================================

// =============================================================================
// SHIP UPGRADE PROGRESSION — earned by deep-discovering nebulas
// =============================================================================
// Each nebula deep-discovered grants a permanent upgrade to the ship:
//   • Energy consumption efficiency: -3% per nebula (cumulative, cap 60%)
//   • Thruster top speed:           +0.5 per nebula (cumulative, cap +11.0)
// At 22 nebulas (the full game count) the player reaches the ceiling:
//   maxVelocity 4.0 → 15.0 (matches wingman max-tracking speed of 15000 km/s)
//   energyEfficiency 1.0 → 0.40 (consumption reduced 60%)

const ENERGY_EFFICIENCY_PER_NEBULA = 0.03;
const ENERGY_EFFICIENCY_FLOOR      = 0.40; // never go below 40% (60% reduction cap)
const SPEED_BOOST_PER_NEBULA       = 0.5;
const SPEED_BOOST_MAX              = 11.0; // 4.0 base + 11.0 = 15.0 ceiling

// Apply the per-frame energy multiplier so consumption scales with upgrades.
function _consumeEnergy(amount) {
    if (typeof gameState === 'undefined') return;
    const eff = (typeof gameState.energyEfficiency === 'number') ? gameState.energyEfficiency : 1.0;
    gameState.energy = Math.max(0, gameState.energy - amount * eff);
}

// Called once per nebula deep-discovery. Bumps the player's stats and
// shows an achievement summarizing the new ceiling.
function applyNebulaShipUpgrade(nebulaName) {
    if (typeof gameState === 'undefined') return;
    gameState.nebulasDeepDiscovered = (gameState.nebulasDeepDiscovered || 0) + 1;

    // Energy efficiency: each upgrade subtracts 3% from consumption multiplier
    const newEff = Math.max(ENERGY_EFFICIENCY_FLOOR,
        (gameState.energyEfficiency || 1.0) - ENERGY_EFFICIENCY_PER_NEBULA);
    gameState.energyEfficiency = newEff;

    // Top speed: cumulative additive boost up to the cap
    if (typeof gameState.baseMaxVelocity !== 'number') gameState.baseMaxVelocity = 4.0;
    const totalBoost = Math.min(SPEED_BOOST_MAX,
        gameState.nebulasDeepDiscovered * SPEED_BOOST_PER_NEBULA);
    gameState.maxVelocity = gameState.baseMaxVelocity + totalBoost;

    const efficiencyPct = Math.round((1 - newEff) * 100);
    const topSpeedKmS = Math.round(gameState.maxVelocity * 1000);
    const title = '🛠 Ship Upgrade — ' + (nebulaName || 'Unknown Nebula');
    const desc = `Energy efficiency +${efficiencyPct}% · Top speed ${topSpeedKmS} km/s` +
                 ` (nebulas charted: ${gameState.nebulasDeepDiscovered})`;
    if (typeof showAchievement === 'function') {
        showAchievement(title, desc, true);
    }
    console.log(`🛠 Ship upgrade applied — eff ${newEff.toFixed(2)}, maxV ${gameState.maxVelocity.toFixed(1)}`);
}

// =============================================================================
// REPUTATION / TIER UNLOCKS
// Every meaningful action calls awardReputation(amount, source) which credits
// gameState.reputation. Crossing 50 / 200 / 500 / 1000 rep grants a permanent
// tier unlock that changes how thrust, energy, and slingshots behave.
// =============================================================================
const REP_TIERS = [
    { threshold:   50, key: 'coasting',         name: 'Inertial Coasting',
      blurb: 'Cruising at top speed costs no energy — only acceleration burns fuel.' },
    { threshold:  200, key: 'capacitor',        name: 'Capacitor Cells',
      blurb: 'Max energy +50, regen +66%.' },
    { threshold:  500, key: 'quickSlingshot',   name: 'Quick-Charge Slingshot',
      blurb: 'Slingshots cost zero energy and cool down in 5 seconds.' },
    { threshold: 1000, key: 'trajectorySolver', name: 'Trajectory Solver',
      blurb: 'Optimal slingshot exit vector is auto-aimed when you enter a gravity well.' }
];

function awardReputation(amount, source) {
    if (typeof gameState === 'undefined') return;
    if (!amount) return;
    gameState.reputation = (gameState.reputation || 0) + amount;
    if (typeof source === 'string' && source.length &&
        typeof showAchievement === 'function' && amount >= 25) {
        showAchievement('+' + amount + ' REP', source);
    }
    // Apply any newly-crossed tier thresholds.
    let tier = gameState.repTier || 0;
    while (tier < REP_TIERS.length && gameState.reputation >= REP_TIERS[tier].threshold) {
        applyRepTier(tier);
        tier++;
    }
    gameState.repTier = tier;
}

function applyRepTier(tierIndex) {
    if (typeof gameState === 'undefined') return;
    const t = REP_TIERS[tierIndex];
    if (!t) return;
    if (!gameState.repTierUnlocks) gameState.repTierUnlocks = {};
    gameState.repTierUnlocks[t.key] = true;
    // Tier-2 capacitor: bump max + current energy ceiling.
    if (t.key === 'capacitor') {
        gameState.maxEnergy = Math.max(gameState.maxEnergy || 100, 150);
        gameState.energy = Math.min(gameState.maxEnergy, (gameState.energy || 0) + 50);
    }
    if (typeof showAchievement === 'function') {
        showAchievement('UNLOCK · ' + t.name, t.blurb, true);
    }
    console.log('🎖 Reputation tier ' + (tierIndex + 1) + ' unlocked: ' + t.name);
}

// Reward hook for any enemy kill. Returns the rep amount awarded so the
// caller can fold it into a single notification (rather than triggering
// two banners on top of the "Enemy Destroyed!" toast).
function awardKillReward(enemy) {
    if (typeof gameState === 'undefined' || !enemy || !enemy.userData) return 0;
    const ud = enemy.userData;
    let amount;
    let label;
    if (ud.isBoss) {
        amount = 50;
        label  = 'Boss defeated: ' + (ud.name || 'enemy');
        // Boss kill: top off energy and grant a warp charge.
        gameState.energy = Math.min(gameState.maxEnergy || 100,
            (gameState.energy || 0) + (gameState.maxEnergy || 100));
        if (gameState.emergencyWarp) {
            gameState.emergencyWarp.available = Math.min(10,
                (gameState.emergencyWarp.available || 0) + 1);
        }
    } else if (ud.isBlackHoleGuardian || ud.isEliteGuardian) {
        amount = 15;
        label  = 'Elite kill';
        gameState.energy = Math.min(gameState.maxEnergy || 100,
            (gameState.energy || 0) + 15);
    } else {
        amount = 5;
        label  = ''; // small kill, suppress banner
        gameState.energy = Math.min(gameState.maxEnergy || 100,
            (gameState.energy || 0) + 5);
    }
    awardReputation(amount, label);
    return amount;
}

if (typeof window !== 'undefined') {
    window._consumeEnergy = _consumeEnergy;
    window.applyNebulaShipUpgrade = applyNebulaShipUpgrade;
    window.awardReputation = awardReputation;
    window.awardKillReward = awardKillReward;
    window.REP_TIERS = REP_TIERS;
}

// Initialize timing variables for auto-leveling system
let lastPitchInputTime = 0;
let lastRollInputTime = 0;

// Camera rotation tracking for auto-navigation compatibility
let cameraRotationTracking = { x: 0, y: 0, z: 0 };

// NEW: Rotational inertia system for space-like flight feel
let rotationalVelocity = { pitch: 0, yaw: 0, roll: 0 };
const rotationalInertia = {
    // Default slower turning (original values restored)
    acceleration: 0.0020,       // Slower turn response (default)
    deceleration: 0.93,        // Slightly faster slowdown for snappier control
    maxSpeed: 0.015,           // Slower max turn speed (default)
    bankingFactor: -2.5,        // How much to bank when turning at full speed (scaled by velocity)
    bankingSmoothing: 0.2,     // How smoothly banking is applied
    
    // Fast turning values (activated with CAPS LOCK)
    fastAcceleration: 0.0030,   // Faster turn response
    fastMaxSpeed: 0.022         // Faster max turn speed
};

// Pooled vectors for orientTowardsTarget — called every frame, was creating
// 3+ Vector3s + 1 Quaternion per call = 240+ allocations/sec at 60 fps.
const _ortDir = new THREE.Vector3();
const _ortFwd = new THREE.Vector3();
const _ortAxis = new THREE.Vector3();
const _explVel = new THREE.Vector3();

function orientTowardsTarget(target) {
    if (!target || typeof camera === 'undefined') return false;

    // Delta-time: compute ms since last call. Clamped to [4, 100] so a
    // first-call (no _lastTime) or a frame-rate hiccup doesn't produce
    // a huge instantaneous jump. The whole turn budget for this frame is
    // sliced into sub-steps below so even a long delta turns smoothly.
    const _nowMs = performance.now();
    if (!orientTowardsTarget._lastTime) orientTowardsTarget._lastTime = _nowMs - 16.67;
    const _rawDelta = _nowMs - orientTowardsTarget._lastTime;
    orientTowardsTarget._lastTime = _nowMs;
    const _deltaMs = Math.max(4, Math.min(100, _rawDelta));

    _ortDir.subVectors(target.position, camera.position).normalize();
    camera.getWorldDirection(_ortFwd);
    const angle = _ortFwd.angleTo(_ortDir);

    // Tight "aligned" threshold (~0.9°). The old 5° dead-zone made the
    // demo jerk: it would snap to within 5° of a moving target, STOP
    // dead, let the target drift back past 5°, then lurch to catch up —
    // a continuous start/stop stutter. A small threshold keeps the ship
    // tracking almost continuously instead.
    const orientationThreshold = 0.016;
    if (angle < orientationThreshold) {
        return true;
    }

    _ortAxis.crossVectors(_ortFwd, _ortDir).normalize();

    if (_ortAxis.length() < 0.001) {
        _ortAxis.set(0, 1, 0);
    }

    // Time-based proportional turn. Rates are EXPRESSED PER 16.67ms (one
    // 60fps frame) so the old hand-tuned 0.12 / 0.055 numbers still apply
    // at 60fps — but on a 120Hz display or a stuttering frame the actual
    // amount scales with real elapsed time, so the turn rate is consistent
    // regardless of FPS.
    const rotationSpeedPerFrame = 0.12;
    const maxRotationPerFrame = 0.045;  // max turn speed cap: was 0.055 (~189°/s) -> 0.045 (~155°/s)
    const FRAME_MS = 16.67;
    const frames = _deltaMs / FRAME_MS;

    // Closed-form exponential smoothing — the N->infinity limit of the old
    // sub-step loop. Rotating a fraction (1 - e^(-rate*frames)) of the REMAINING
    // angle toward the target each frame is mathematically equivalent to
    // infinitely many tiny eased sub-steps, so it's maximally smooth AND
    // frame-rate-independent, for the cost of ONE rotation (no sub-step count to
    // tune). The fraction matches the old rate: 1-e^(-0.12) ≈ 0.113/frame vs the
    // old 3-substep 0.115/frame. Same per-frame cap as before.
    if (!orientTowardsTarget._quat) orientTowardsTarget._quat = new THREE.Quaternion();
    let totalRotation = 0;
    camera.getWorldDirection(_ortFwd);
    const curAngle = _ortFwd.angleTo(_ortDir);
    if (curAngle >= orientationThreshold) {
        _ortAxis.crossVectors(_ortFwd, _ortDir).normalize();
        if (_ortAxis.length() < 0.001) _ortAxis.set(0, 1, 0);
        const t = 1 - Math.exp(-rotationSpeedPerFrame * frames);          // exact eased fraction
        const rot = Math.min(curAngle * t, maxRotationPerFrame * frames); // same cap as before
        orientTowardsTarget._quat.setFromAxisAngle(_ortAxis, rot);
        camera.quaternion.premultiply(orientTowardsTarget._quat);
        totalRotation = rot;
    }

    // Feed the yaw component into rotationalVelocity so the ship-bank
    // effect fires during auto-orient (same visual as arrow-key steering).
    // Use the cumulative rotation so the bank intensity matches actual turn.
    if (typeof rotationalVelocity !== 'undefined') {
        const yawComponent = _ortAxis.y * totalRotation;
        rotationalVelocity.yaw += (yawComponent - rotationalVelocity.yaw) * 0.15;
    }

    // Update tracking for compatibility
    cameraRotationTracking.x = camera.rotation.x;
    cameraRotationTracking.y = camera.rotation.y;
    cameraRotationTracking.z = camera.rotation.z;

    // Update timing to prevent auto-level interference during auto-navigation
    const now = performance.now();
    lastPitchInputTime = now;
    lastRollInputTime = now;

    // Check if we're close enough to target direction (re-sample after rotation)
    camera.getWorldDirection(_ortFwd);
    const finalAngle = _ortFwd.angleTo(_ortDir);

    return finalAngle < orientationThreshold;
}

// NEW: Apply rotational inertia for space-like flight controls
function applyRotationalInertia(keys, allowManualRotation) {
    // Choose turning speed based on CAPS LOCK state
    // 🔄 INVERTED: Default = fast turning, CAPS LOCK = slow/precision mode
    const currentAcceleration = keys.capsLock ? rotationalInertia.acceleration : rotationalInertia.fastAcceleration;
    const currentMaxSpeed = keys.capsLock ? rotationalInertia.maxSpeed : rotationalInertia.fastMaxSpeed;
    
    // Apply acceleration when keys are pressed
    if (allowManualRotation) {
        // Pitch controls (up/down)
        if (keys.up) {
            rotationalVelocity.pitch += currentAcceleration;
            lastPitchInputTime = performance.now();
        } else if (keys.down) {
            rotationalVelocity.pitch -= currentAcceleration;
            lastPitchInputTime = performance.now();
        } else {
            // Apply deceleration when no input
            rotationalVelocity.pitch *= rotationalInertia.deceleration;
        }
        
        // Yaw controls (left/right arrows for turning)
        if (keys.left) {
            rotationalVelocity.yaw += currentAcceleration;
            lastRollInputTime = performance.now();
        } else if (keys.right) {
            rotationalVelocity.yaw -= currentAcceleration;
            lastRollInputTime = performance.now();
        } else {
            // Apply deceleration when no input
            rotationalVelocity.yaw *= rotationalInertia.deceleration;
        }
    }
    
    // Roll controls (Q/E keys for barrel roll) - always available
    if (keys.q) {
        rotationalVelocity.roll += currentAcceleration;
        lastRollInputTime = performance.now();
    } else if (keys.e) {
        rotationalVelocity.roll -= currentAcceleration;
        lastRollInputTime = performance.now();
    } else {
        // Apply deceleration when no input
        rotationalVelocity.roll *= rotationalInertia.deceleration;
    }
    
    // Clamp rotational velocities to max speed (using current max based on CAPS LOCK)
    rotationalVelocity.pitch = Math.max(-currentMaxSpeed, 
                                        Math.min(currentMaxSpeed, rotationalVelocity.pitch));
    rotationalVelocity.yaw = Math.max(-currentMaxSpeed, 
                                      Math.min(currentMaxSpeed, rotationalVelocity.yaw));
    rotationalVelocity.roll = Math.max(-currentMaxSpeed, 
                                       Math.min(currentMaxSpeed, rotationalVelocity.roll));
    
    // Apply pitch (looking up/down) - this is always relative to current orientation
    if (Math.abs(rotationalVelocity.pitch) > 0.00001) {
        camera.rotateX(rotationalVelocity.pitch);
    }
    
    // Apply yaw (turning left/right) - this is always relative to current orientation
    if (Math.abs(rotationalVelocity.yaw) > 0.00001) {
        camera.rotateY(rotationalVelocity.yaw);
    }
    
    // 🛩️ STRAFE YAW + BANKING: Turn nose OPPOSITE to strafe direction + bank wings
    // Like a helicopter: strafe left → lean right, strafe right → lean left
    // Applied AFTER pitch/yaw so it works correctly regardless of orientation
    if (typeof keys !== 'undefined' && typeof gameState !== 'undefined') {
        const currentSpeed = gameState.velocity || 0;
        const minSpeed = 0.5;
        const maxSpeed = 6.0;
        const speedFactor = Math.max(0, Math.min(1, (currentSpeed - minSpeed) / (maxSpeed - minSpeed)));
        const strafeYawFactor = 0.015; // Subtle nose turn for strafe
        const strafeBankFactor = 0.02; // Banking/roll for strafe
        
        // Get the strafe direction in camera's right vector
        const forwardDirection = new THREE.Vector3();
        camera.getWorldDirection(forwardDirection);
        const rightDirection = new THREE.Vector3();
        rightDirection.crossVectors(forwardDirection, camera.up).normalize();
        
        let strafeYawAmount = 0;
        let strafeBankAmount = 0;
        
        if (keys.a && gameState.energy > 0) {
            // Strafe left (A) → Turn nose RIGHT + Roll right wing down
            strafeYawAmount = -strafeYawFactor * speedFactor; // Negative = right turn
            strafeBankAmount = -strafeBankFactor * speedFactor; // Negative = right roll
        } else if (keys.d && gameState.energy > 0) {
            // Strafe right (D) → Turn nose LEFT + Roll left wing down
            strafeYawAmount = strafeYawFactor * speedFactor; // Positive = left turn
            strafeBankAmount = strafeBankFactor * speedFactor; // Positive = left roll
        }
        
        if (strafeYawAmount !== 0) {
            // Apply yaw rotation around the up axis (opposite to strafe direction)
            const rotationAxis = camera.up.clone().normalize();
            camera.rotateOnWorldAxis(rotationAxis, strafeYawAmount);
            
            // Apply banking/roll around forward axis (wings dip)
            camera.rotateZ(strafeBankAmount);
        }
    }
    
    // Apply roll (barrel roll) with SPEED-DEPENDENT automatic banking from yaw
    // Banking increases with speed up to 1400 km/s, then caps
    const currentSpeed = typeof gameState !== 'undefined' && gameState.velocity ? gameState.velocity : 0;
    const minSpeed = 0.5;
    const maxSpeed = 6.0;
    const cappedSpeed = Math.min(currentSpeed, 1.4); // Cap at 1400 km/s

    const speedFactor = Math.max(0, Math.min(1, (cappedSpeed - minSpeed) / (maxSpeed - minSpeed)));
    
    // Apply banking proportional to both yaw velocity and current speed
    // Demo mode adds extra camera roll for a cinematic powerslide feel
    // SKIP banking during mobile touch input to prevent unwanted roll
    let bankingFromYaw = 0;
    if (!window.mobileTouchActive) {
        const demoBoost = (window.demoPilot && window.demoPilot.active) ? 2.5 : 1.0;
        bankingFromYaw = -rotationalVelocity.yaw * rotationalInertia.bankingFactor * speedFactor * demoBoost;
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
            warningDistance: 200,
            criticalDistance: 50
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
    // Per-asteroid log silenced

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
                        p.mesh.position.add(_explVel.copy(particleVelocities[i]).multiplyScalar(0.2 * deltaFactor));
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
                        p.mesh.position.add(_explVel.copy(particleVelocities[i]).multiplyScalar(0.3 * deltaFactor));
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

// Trigger the full player-death sequence: explosion visual, layered
// explosion audio, ship-mesh hide, then MISSION FAILED screen after a
// short delay so the player actually sees and hears the destruction.
// Idempotent — guarded by gameState.playerDying so repeated collision
// events don't stack multiple explosions or game-over screens.
function triggerPlayerDeath(title, message, delayMs) {
    if (typeof gameState === 'undefined') return;
    if (gameState.playerDying || gameState.gameOverScreenShown) return;
    gameState.playerDying = true;
    gameState.hull = 0;
    if (gameState.velocityVector && gameState.velocityVector.set) {
        gameState.velocityVector.set(0, 0, 0);
    }

    // Hide the third-person player ship mesh so its silhouette doesn't
    // sit untouched inside the explosion fireball.
    try {
        const ship = window.cameraState && window.cameraState.playerShipMesh;
        if (ship) ship.visible = false;
    } catch (e) {}

    // Clear EVERY screen overlay so the death explosion plays on a
    // clean screen. New ones can't reappear because playerDying is set
    // and the fire / collision / shield handlers bail on it.
    try {
        // Transient combat damage flashes + "UNDER ATTACK" indicators.
        document.querySelectorAll('.combat-damage-fx').forEach(el => el.remove());
        // Black-hole danger vignette + its proximity flash.
        const danger = document.getElementById('dangerOverlay');
        if (danger) { danger.remove(); window._cachedDangerOverlay = null; }
        // CRT-flicker "heavy damage" cracked-screen overlay (created by
        // updateUI when hull <= 10; hull is 0 on death so it'd persist).
        const crit = document.getElementById('criticalDamageOverlay');
        if (crit) crit.remove();
        // First-person shield bubble overlay — force it off and drop the
        // shield system so the blue hex render doesn't sit over the
        // fireball.
        const shieldOv = document.getElementById('shieldOverlay');
        if (shieldOv) {
            shieldOv.classList.remove('active');
            shieldOv.style.display = 'none';
        }
        if (typeof window.shieldSystem !== 'undefined' && window.shieldSystem) {
            window.shieldSystem.active = false;
        }
        if (typeof gameState !== 'undefined' && gameState.shields) {
            gameState.shields.active = false;
        }
        // Event-horizon / warp HUD warnings.
        ['eventHorizonWarning', 'blackHoleWarningHUD'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
    } catch (e) {}

    // Visual: existing dramatic explosion (sphere + 100 particles + 3 shockwaves)
    if (typeof createPlayerExplosion === 'function') {
        createPlayerExplosion();
    }

    // Audio: full death-sequence stack. A deep sub-bass rumble anchors
    // the moment while four layered booms hit on top, then a final
    // long boom + rumble closes it out. About 2.5s of escalating
    // intensity — meant to read as a finishing blow / "game over"
    // beat, not a generic enemy explosion.
    if (typeof playSound === 'function') {
        try { playSound('death_rumble'); } catch (e) {}
        try { playSound('death_boom'); } catch (e) {}
        try { playSound('explosion'); } catch (e) {}
        try { playSound('damage'); } catch (e) {}
        setTimeout(() => { try { playSound('explosion'); } catch (e) {} }, 160);
        setTimeout(() => { try { playSound('explosion'); } catch (e) {} }, 360);
        setTimeout(() => { try { playSound('death_boom'); } catch (e) {} }, 600);
        setTimeout(() => { try { playSound('damage'); } catch (e) {} }, 820);
        setTimeout(() => { try { playSound('explosion'); } catch (e) {} }, 1100);
        setTimeout(() => { try { playSound('death_rumble'); } catch (e) {} }, 1300);
    }

    // Give the explosion time to play out before the mission-failed
    // overlay covers the screen. 2.5s lets the shockwaves expand and
    // the layered booms finish.
    const wait = (typeof delayMs === 'number') ? delayMs : 2500;
    setTimeout(() => {
        if (typeof showGameOverScreen === 'function') {
            showGameOverScreen(title || 'MISSION FAILED', message || 'Ship destroyed');
        }
    }, wait);

    console.log(`💀 PLAYER DEATH SEQUENCE: ${title || 'MISSION FAILED'} — ${message || ''}`);
}

window.triggerPlayerDeath = triggerPlayerDeath;

// RESTORED: Asteroid destruction functions
function destroyAsteroid(asteroid) {
    scene.remove(asteroid);

    // Small reward for destruction so phase-5 strafing pays out.
    if (typeof awardReputation === 'function') awardReputation(1, '');
    if (typeof gameState !== 'undefined' && gameState.hull !== undefined) {
        gameState.hull = Math.min(gameState.maxHull || 100, gameState.hull + 0.5);
    }

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

    // Outer-system asteroids live inside a systemGroup, not the planets array.
    if (asteroid.userData.type === 'outer_asteroid' && asteroid.parent) {
        const group = asteroid.parent;
        if (group.userData && group.userData.orbiters) {
            const idx = group.userData.orbiters.indexOf(asteroid);
            if (idx > -1) group.userData.orbiters.splice(idx, 1);
        }
        group.remove(asteroid);
    }

    if (typeof gameState !== 'undefined' && gameState.targetLock.target === asteroid) {
        gameState.targetLock.target = null;
    }
    if (typeof gameState !== 'undefined' && gameState.currentTarget === asteroid) {
        gameState.currentTarget = null;
    }
}

function destroyAsteroidByWeapon(asteroid, hitPosition = null) {
    // Per-asteroid call log silenced
    
    // FIXED: Account for asteroid scale when calculating radius
    const baseRadius = asteroid.geometry ? asteroid.geometry.parameters.radius : 1;
    const actualRadius = baseRadius * (asteroid.scale.x || 1); // Use scale to get actual size
    const hullRestoration = Math.min(15 + (actualRadius * 2), 25);
    
    gameState.hull = Math.min(gameState.maxHull, gameState.hull + hullRestoration);
    
    // Belt asteroids are children of a positioned beltGroup, so
    // asteroid.position is LOCAL. Use the world position for the
    // explosion when there's no raycast hit point.
    const explosionPosition = hitPosition ? hitPosition.clone()
        : asteroid.getWorldPosition(new THREE.Vector3());
    
    // FIXED: Pass actual visual radius to explosion, not base radius
    createAsteroidExplosion(explosionPosition, actualRadius);
    
    if (typeof playSound !== 'undefined') {
        playSound('explosion');
    }
    
    destroyAsteroid(asteroid);
    if (window.GAME_DEBUG_VERBOSE) console.log(`Asteroid destroyed by weapon fire: ${asteroid.userData.name} (+${hullRestoration} hull) - radius: ${actualRadius.toFixed(1)}`);
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
    // Skip during 7-second startup grace period
    const _inStartupGrace = typeof gameState !== 'undefined' &&
                            gameState.gameStartTime &&
                            (Date.now() - gameState.gameStartTime < 7000);
    // Check black hole warp invulnerability OR startup grace
    if (!isBlackHoleWarpInvulnerable() && !_inStartupGrace) {
        // Apply damage with shield reduction
        const damage = 15;
        const shieldReduction = typeof getShieldDamageReduction === 'function' ?
                                getShieldDamageReduction() : 0;
        const actualDamage = damage * (1 - shieldReduction);

        gameState.hull = Math.max(0, gameState.hull - actualDamage);
    }
    
    if (typeof isShieldActive === 'function' && isShieldActive() &&
        typeof createShieldHitEffect === 'function') {
        createShieldHitEffect(asteroid.getWorldPosition(new THREE.Vector3()));
    }

    if (!isBlackHoleWarpInvulnerable() &&
        typeof createEnhancedScreenDamageEffect === 'function') {
        createEnhancedScreenDamageEffect();
    }
    
    if (typeof playSound !== 'undefined') {
        playSound('damage');
    }



    // FIXED: Account for scale in collision explosions too
    const baseRadius = asteroid.geometry ? asteroid.geometry.parameters.radius : 1;
    const actualRadius = baseRadius * (asteroid.scale.x || 1);
    createAsteroidExplosion(asteroid.getWorldPosition(new THREE.Vector3()), actualRadius);
    
    destroyAsteroid(asteroid);
    if (window.GAME_DEBUG_VERBOSE) console.log(`Asteroid destroyed by collision: ${asteroid.userData.name} (-15 hull) - radius: ${actualRadius.toFixed(1)}`);
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

function transitionToRandomLocation(sourceBlackHole, transitType) {
    const _isWormhole = (transitType === 'wormhole');
    console.log((_isWormhole ? 'WORMHOLE' : 'BLACK HOLE') + ' WARP INITIATED from:', sourceBlackHole);
    
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
    
    // Warp sound — wormholes get their own shimmering sweep.
    if (typeof playSound !== 'undefined') {
        playSound(_isWormhole ? 'wormhole_warp' : 'blackhole_warp');
    }

    const fadeOverlay = document.createElement('div');

    if (_isWormhole) {
        // ── UNIQUE WORMHOLE ANIMATION ────────────────────────────────
        // A spinning violet vortex tunnel that zooms toward the camera,
        // rather than the black hole's flat white-out. Built from a
        // conic gradient (the "swirl") layered over a radial throat,
        // animated via a one-shot keyframe so it reads as folding
        // space, not gravitational collapse.
        if (!document.getElementById('wormholeWarpKeyframes')) {
            const st = document.createElement('style');
            st.id = 'wormholeWarpKeyframes';
            st.textContent =
                '@keyframes wormholeVortex {' +
                '0% { opacity:0; transform:scale(0.2) rotate(0deg); }' +
                '25% { opacity:0.85; }' +
                '70% { opacity:1; }' +
                '100% { opacity:1; transform:scale(3.4) rotate(900deg); } }';
            document.head.appendChild(st);
        }
        fadeOverlay.className = 'wormhole-warp-effect';
        fadeOverlay.style.cssText = [
            'position:fixed', 'top:50%', 'left:50%',
            'width:240vmax', 'height:240vmax',
            'margin-left:-120vmax', 'margin-top:-120vmax',
            'border-radius:50%',
            'background:' +
              'radial-gradient(circle at center,' +
                ' rgba(255,255,255,1) 0%,' +
                ' rgba(200,120,255,0.9) 8%,' +
                ' rgba(120,40,220,0.55) 22%,' +
                ' rgba(60,10,120,0.25) 45%,' +
                ' rgba(10,0,30,0) 70%),' +
              'conic-gradient(from 0deg,' +
                ' rgba(170,68,255,0.0) 0deg,' +
                ' rgba(200,120,255,0.55) 40deg,' +
                ' rgba(120,40,220,0.0) 80deg,' +
                ' rgba(220,150,255,0.55) 130deg,' +
                ' rgba(120,40,220,0.0) 180deg,' +
                ' rgba(200,120,255,0.55) 250deg,' +
                ' rgba(120,40,220,0.0) 300deg,' +
                ' rgba(220,150,255,0.55) 360deg)',
            'z-index:30', 'opacity:0', 'pointer-events:none',
            'will-change:transform,opacity',
            'animation:wormholeVortex 1.5s ease-in forwards'
        ].join(';');
        document.body.appendChild(fadeOverlay);
    } else {
        // Black-hole warp: original bright white radial collapse.
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
    }

    // ==========================================================================
    // PHASE 3: WARP EXECUTION (after fade completes)
    // ==========================================================================
    
    setTimeout(() => {
        console.log('Executing warp transition...');
        
        // Find available black holes for warp destination (exclude current one)
        let blackHoles = (typeof planets !== 'undefined') ?
            planets.filter(p =>
                p.userData.type === 'blackhole' &&
                p.userData.name !== sourceBlackHole
            ) : [];

        // PROGRESSION GATE: until the Sol / Sagittarius A* system is
        // liberated (Martian Pirate boss + Vulcan boss both defeated),
        // black-hole warps only shuttle the player between the two LOCAL
        // galactic cores — Sgr A* and the Companion Core. Liberation
        // unlocks galaxy-wide warping (full black-hole list).
        const _liberated = (typeof isSolSystemLiberated === 'function')
            ? isSolSystemLiberated()
            : (typeof window !== 'undefined' && typeof window.isSolSystemLiberated === 'function'
                ? window.isSolSystemLiberated() : true);
        if (!_liberated) {
            const localCores = blackHoles.filter(p => p.userData &&
                (p.userData.isSagittariusA || p.userData.isGalacticCenter || p.userData.isCompanionCore));
            if (localCores.length > 0) {
                blackHoles = localCores;
                console.log('Warp gated to local cores (Sol system not yet liberated)');
            }
        }

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
        
        // Calculate safe spawn position near destination black hole.
        // Must land OUTSIDE the destination's event-horizon warp zone —
        // the player re-warps within criticalDistance = max(radius*2.5,
        // 50). Sgr A* (r=280 → 700) and the Companion Core (r=180 → 450)
        // are big enough now that the old fixed 400-1000u landed inside,
        // re-triggering a warp on arrival. Anchor the landing to the
        // destination's own critical radius + a clear buffer.
        const _destRadius = (targetBlackHole.geometry && targetBlackHole.geometry.parameters &&
            targetBlackHole.geometry.parameters.radius) || 50;
        const _destCritical = Math.max(_destRadius * 2.5, 50);
        const warpDistance = _destCritical + 650 + Math.random() * 600;
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
                    if (window.GAME_DEBUG_VERBOSE) console.log('Warp complete - resuming guardian spawning');
                }
                
                console.log(`Loading guardians for galaxy ${arrivedGalaxyId}...`);
                loadGuardiansForGalaxy(arrivedGalaxyId);
                // BH transit reward: rep + full energy refill so the
                // player arrives in the new galaxy ready to fight.
                if (typeof awardReputation === 'function') {
                    awardReputation(10, 'Black-hole transit');
                }
                if (typeof gameState !== 'undefined') {
                    gameState.energy = gameState.maxEnergy || 100;
                }
            }, 1200); // Load guardians AFTER enemies and warp state cleared
        } else {
            // Clear warp flags even if we didn't load guardians
            setTimeout(() => {
                if (typeof gameState !== 'undefined') {
                    gameState.isBlackHoleWarping = false;
                    gameState.warping = false;
                    if (window.GAME_DEBUG_VERBOSE) console.log('Warp complete');
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
                if (window.GAME_DEBUG_VERBOSE) console.log('Achievement system reactivated');
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
        
        // Fade back out. The wormhole overlay uses a CSS animation with
        // fill:forwards (holds opacity:1), so a plain style.opacity='0'
        // wouldn't visually fade it — cancel the animation and apply a
        // transition instead. The black-hole overlay already uses a
        // transition, so the simple assignment works for it.
        if (_isWormhole) {
            fadeOverlay.style.animation = 'none';
            fadeOverlay.style.transition = 'opacity 1.2s ease-out';
            // Force reflow so the transition picks up the new baseline.
            void fadeOverlay.offsetWidth;
            fadeOverlay.style.opacity = '0';
        } else {
            fadeOverlay.style.opacity = '0';
        }
        setTimeout(() => {
            fadeOverlay.remove();
            if (window.GAME_DEBUG_VERBOSE) console.log('Warp fade complete');
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
// Helper: compute the slingshot activation radius for a body. Used both
// by the "SLINGSHOT READY" UI prompt and by executeSlingshot itself so the
// two never disagree. Bumped from the original (radius*6 / radius*2.5+30)
// to give players more reaction time at warp speed.
function getSlingshotRange(body) {
    const radius = body && body.geometry ? body.geometry.parameters.radius : 5;
    const isStarBody = body && body.userData &&
        (body.userData.type === 'star' || body.userData.isLocalStar);
    const isBH = body && body.userData && body.userData.type === 'blackhole';
    if (isBH) return Math.max(120, radius * 5 + (body.userData.warpThreshold || 0));
    if (isStarBody) return Math.max(120, radius * 8);
    return Math.max(120, radius * 4 + 60);
}

// Helper: find best slingshot target near the camera.
function findSlingshotTarget() {
    if (typeof activePlanets === 'undefined' || typeof camera === 'undefined') return null;
    let best = null;
    let bestDistance = Infinity;
    activePlanets.forEach(planet => {
        const dist = camera.position.distanceTo(planet.position);
        if (dist < getSlingshotRange(planet) && dist < bestDistance) {
            best = planet;
            bestDistance = dist;
        }
    });
    return best;
}

// Compute the optimal exit direction for a slingshot off `body` — the
// body's orbital-tangent velocity vector if we know it (realistic mode),
// otherwise the player's look direction (arcade mode). Returns a unit
// Vector3. In realistic mode the player's look direction is allowed to
// deflect the result by up to 30°; beyond that we hold the orbital
// tangent and ignore aim error so a misaligned launch can't dump the
// ship in a bad direction.
function getSlingshotExitDirection(body) {
    const look = new THREE.Vector3();
    camera.getWorldDirection(look).normalize();
    const arcade = !(typeof gameState !== 'undefined' && gameState.realisticSlingshot);
    if (arcade) return look;

    // Realistic: build the tangent to the body's orbit around its system
    // center. If we don't know the orbit, fall back to look.
    const ud = body && body.userData;
    if (!ud || !ud.systemCenter || !ud.orbitRadius) return look;
    const radial = new THREE.Vector3(
        body.position.x - ud.systemCenter.x,
        0,
        body.position.z - ud.systemCenter.z
    );
    if (radial.lengthSq() < 1e-6) return look;
    const tangent = new THREE.Vector3(-radial.z, 0, radial.x).normalize();
    // Sign so it matches the body's orbital direction (CCW vs CW)
    const orbitSpeed = ud.orbitSpeed || 0;
    if (orbitSpeed < 0) tangent.multiplyScalar(-1);
    // Limit look-deflection to ±30°: blend toward the look direction up
    // to the cap.
    const dot = tangent.dot(look);
    if (dot >= Math.cos(Math.PI / 6)) return look; // within cone — honor aim
    // Build a deflection at 30° from tangent toward look
    const blend = look.clone().sub(tangent.clone().multiplyScalar(dot));
    if (blend.lengthSq() < 1e-6) return tangent;
    blend.normalize();
    const cap = Math.cos(Math.PI / 6); // 30° cap
    const sin = Math.sin(Math.PI / 6);
    return tangent.clone().multiplyScalar(cap).addScaledVector(blend, sin).normalize();
}

// Expose target/range/exit helpers so UI and autopilot can read them.
if (typeof window !== 'undefined') {
    window.getSlingshotRange = getSlingshotRange;
    window.findSlingshotTarget = findSlingshotTarget;
    window.getSlingshotExitDirection = getSlingshotExitDirection;
}

function executeSlingshot() {
    if (typeof gameState === 'undefined') return;
    // 5-second cooldown after a slingshot fires (Quick-Charge tier
    // replaces the energy cost with this CD; arcade mode also honors it
    // so chained accidental triggers can't ping-pong the player).
    if (Date.now() < (gameState.slingshotCooldownUntil || 0)) return;

    const nearestPlanet = findSlingshotTarget();
    if (!nearestPlanet || gameState.slingshot.active) return;

    // Energy gate: Quick-Charge tier eliminates the 20-energy cost.
    const quick = !!(gameState.repTierUnlocks && gameState.repTierUnlocks.quickSlingshot);
    if (!quick && gameState.energy < 20) return;
    {
        const planetMass = nearestPlanet.userData.mass || 1;
        const planetRadius = nearestPlanet.geometry ? nearestPlanet.geometry.parameters.radius : 5;

        // Direction: arcade = look, realistic = orbital tangent (±30° aim deflection)
        const slingshotDirection = getSlingshotExitDirection(nearestPlanet);

        // Magnitude — two formulas:
        //   Arcade (existing):   25 + mass*radius/2, capped 50
        //   Realistic:           2 * orbitSpeed * orbitRadius, plus a
        //                        periapsis bonus that maxes the boost
        //                        when the player skims the body.
        let boostVelocity;
        const realistic = !!(gameState.realisticSlingshot);
        if (realistic) {
            const ud = nearestPlanet.userData || {};
            const orbitSpeed = Math.abs(ud.orbitSpeed || 0);
            const orbitRadius = ud.orbitRadius || planetRadius;
            const orbitalBoost = 2 * orbitSpeed * orbitRadius;
            // Periapsis bonus: distance / activation-range → 0..1. Closer
            // pass = bigger multiplier (up to ×3 at the rim).
            const dist = camera.position.distanceTo(nearestPlanet.position);
            const range = getSlingshotRange(nearestPlanet);
            const periapsis = Math.max(0.33, Math.min(1, dist / range));
            const periapsisMul = 1 + (1 - periapsis) * 2; // 1.0 .. 3.0
            // Stars/non-orbiting bodies contribute only via deflection
            // (orbitalBoost is zero); keep them useful with a small base
            // so a star pass still gives ~10,000 km/s when grazed.
            const base = orbitalBoost > 0.01 ? 0 : 10;
            boostVelocity = Math.min(60, (base + orbitalBoost) * periapsisMul);
        } else {
            const slinghotPower = (planetMass * planetRadius) / 2;
            boostVelocity = Math.min(25.0 + slinghotPower, 50.0);
        }

        gameState.velocityVector.copy(slingshotDirection).multiplyScalar(boostVelocity);
        if (!quick) {
            gameState.energy = Math.max(5, gameState.energy - 20);
        }
        gameState.slingshotCooldownUntil = Date.now() + 5000;
        if (typeof awardReputation === 'function') {
            awardReputation(3, '');
        }

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
        
        gameState.distance += boostVelocity * 10;
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
        // INERTIAL COASTING (rep tier 1): at >= 90% of max velocity holding
        // W counts as "maintain cruise" — no acceleration applied (the ship
        // is already at the cap) and no energy consumed. Without this, the
        // player burns fuel just to stay at top speed even though space has
        // no drag. Below the cruise band, normal acceleration and cost
        // apply.
        // EXCEPTION: during emergency warp / slingshot, the player IS
        // way above maxVelocity (warp speed ~100 vs cap ~4), so coasting
        // would silently swallow the W key. We disable coasting in
        // those phases and amplify the thrust so holding W actually
        // helps accelerate the warp, as requested.
        const _speed = gameState.velocityVector.length();
        const _warpAccel = !!(gameState.emergencyWarp &&
                              (gameState.emergencyWarp.active ||
                               gameState.emergencyWarp.transitioning ||
                               gameState.emergencyWarp.postWarp)) ||
                           !!(gameState.slingshot && gameState.slingshot.active);
        const _coasting = !_warpAccel &&
                          !!(gameState.repTierUnlocks && gameState.repTierUnlocks.coasting) &&
                          _speed >= (gameState.maxVelocity || 4.0) * 0.9;
        if (!_coasting) {
            // Boost the thrust during warp so it visibly accelerates
            // the player (the warp baseline is ~100u/frame; without
            // this multiplier the standard 0.02 contribution is
            // imperceptible against the warp drift).
            const warpMul = _warpAccel ? 12 : 1;
            const wThrustPower = gameState.thrustPower * gameState.wThrustMultiplier * warpMul;
            gameState.velocityVector.addScaledVector(forwardDirection, wThrustPower);
            // Energy cost halved during warp — the warp already burns
            // capacitor charge implicitly, no need to double-tax.
            _consumeEnergy(_warpAccel ? 0.06 : 0.12);
        }
        // Visual feedback — rate-limited to at most one effect every
        // 500 ms so holding W doesn't spawn 30 DOM star-trails multiple
        // times per second (each one hangs 300 ms and hurts long-run FPS).
        if (Math.random() > 0.97) {
            if (!gameState._lastHyperspaceFx || (Date.now() - gameState._lastHyperspaceFx) > 500) {
                gameState._lastHyperspaceFx = Date.now();
                createHyperspaceEffect();
            }
        }
    }
    if (keys.s && gameState.energy > 0) {
        // S Key: Reverse thrust (50% power) - consumes 0.04 energy per frame
        gameState.velocityVector.addScaledVector(forwardDirection, -gameState.thrustPower * 0.5);
        _consumeEnergy(0.04);
    }
    if (keys.a && gameState.energy > 0) {
        // A Key: Strafe left (70% power) - consumes 0.06 energy per frame
        gameState.velocityVector.addScaledVector(rightDirection, -gameState.thrustPower * 0.7);
        _consumeEnergy(0.06);
    }
    if (keys.d && gameState.energy > 0) {
        // D Key: Strafe right (70% power) - consumes 0.06 energy per frame
        gameState.velocityVector.addScaledVector(rightDirection, gameState.thrustPower * 0.7);
        _consumeEnergy(0.06);
    }

    // SPECIFICATION: Boost System
    if (keys.b && gameState.energy > 0) {
        // B Key: Space boost (1.8x thrust power, or 2.5x with Shift modifier)
        const boostPower = keys.shift ? gameState.thrustPower * 2.5 : gameState.thrustPower * 1.8;
        gameState.velocityVector.addScaledVector(forwardDirection, boostPower);
        // B + Shift: Enhanced boost with higher energy consumption (0.15 vs 0.12)
        _consumeEnergy(keys.shift ? 0.15 : 0.12);

        if (Math.random() > 0.97) {
            if (!gameState._lastBoostFx || (Date.now() - gameState._lastBoostFx) > 500) {
                gameState._lastBoostFx = Date.now();
                createHyperspaceEffect();
            }
        }
    }
    
    // Double-tap W for JUMP - short tactical boost (uses 25% energy, no warp charge)
    // Natural braking after 1 second
    if (keys.wDoubleTap && gameState.energy >= 25 && !gameState.emergencyWarp.active) {
        keys.wDoubleTap = false;
        
        const capturedForwardDirection = forwardDirection.clone();
        const capturedBoostSpeed = gameState.emergencyWarp.boostSpeed;
        
        // Use 25% energy instead of warp charge
        gameState.energy = Math.max(0, gameState.energy - 25);
        gameState.emergencyWarp.transitioning = true;
        gameState.emergencyWarp.isJump = true; // Flag this as a Jump (not emergency warp)
        
        console.log(`⚡ Jump initiated! ${gameState.energy.toFixed(1)} energy remaining`);
        
        if (typeof setCameraFirstPerson === 'function') {
            setCameraFirstPerson();
        }
        // Sync to the actual FPV transition duration (scaled by distance)
        const jumpStep1 = (typeof cameraState !== 'undefined' && cameraState.transitionDuration)
            ? cameraState.transitionDuration : 400;

        setTimeout(() => {
            gameState.emergencyWarp.active = true;
            gameState.emergencyWarp.transitioning = false;
            // 2s default for manual player jumps. The demo autopilot can
            // request a range-scaled hold via gameState._pendingJumpMs
            // (sized to land just short of the target); 8s ceiling.
            const _jumpMs = (typeof gameState._pendingJumpMs === 'number' && gameState._pendingJumpMs > 0)
                ? Math.min(8000, gameState._pendingJumpMs) : 2000;
            gameState._pendingJumpMs = null;
            gameState.emergencyWarp.timeRemaining = _jumpMs;
            gameState.velocityVector.copy(capturedForwardDirection).multiplyScalar(capturedBoostSpeed);

            for (let i = 0; i < 2; i++) {
                setTimeout(() => createHyperspaceEffect(), i * 200);
            }

            if (typeof toggleWarpSpeedStarfield === 'function') {
                toggleWarpSpeedStarfield(true);
            }

            if (typeof playSound !== 'undefined') {
                playSound('warp');
            }

            // No achievement notification for Jump (silent tactical boost)

            setTimeout(() => {
                if (typeof setCameraThirdPerson === 'function') {
                    setCameraThirdPerson();
                }
            }, 200);
        }, jumpStep1);
    }

     // SPECIFICATION: Emergency Systems - O Key: Emergency warp
// Check shield block FIRST before processing warp (O key for emergency warp)
if (keys.o && typeof isShieldActive === 'function' && isShieldActive()) {
    if (typeof showAchievement === 'function') {
        showAchievement('Warp Blocked', 'Cannot warp with shields active');
    }
    keys.o = false; // Clear the key immediately
}
// Now process full emergency warp with cooldown protection (O key)
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
    // Read the ACTUAL duration picked by setCameraFirstPerson — the
    // camera system now scales it with offset distance so a pulled-back
    // 3rd-person camera can take 600+ ms to reach 1st-person.  A fixed
    // 400 ms warp delay would fire before the camera arrived, producing
    // visual jank.
    const step1Duration = (typeof cameraState !== 'undefined' && cameraState.transitionDuration)
        ? cameraState.transitionDuration : 400;

    // Step 2: After camera transition completes, engage warp
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

        // Step 3: Pull back to 3rd person while warping (see ship in starfield).
        // Short 200 ms pause after Step 2 lets the starfield establish first.
        setTimeout(() => {
            if (typeof setCameraThirdPerson === 'function') {
                setCameraThirdPerson();
            }
        }, 200);
    }, step1Duration);
}

        // Enhanced Emergency warp timer with momentum coasting
if (gameState.emergencyWarp.active) {
    gameState.emergencyWarp.timeRemaining -= 16.67;
    if (gameState.emergencyWarp.timeRemaining <= 0) {
        gameState.emergencyWarp.active = false;
        
        // 🎯 JUMP vs EMERGENCY WARP: Different end behaviors
        if (gameState.emergencyWarp.isJump) {
            // JUMP: Auto-brake naturally to minimum speed
            gameState.emergencyWarp.autoBraking = true;
            gameState.emergencyWarp.postWarp = false; // No coasting for Jump
            console.log(`⚡ Jump complete - natural auto-braking engaged`);
            
            // No notification for Jump end (silent)
            
        } else {
            // EMERGENCY WARP: Coast on momentum
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

// 🎯 JUMP AUTO-BRAKE - Natural braking after 1 second
if (gameState.emergencyWarp.autoBraking) {
    const currentSpeed = gameState.velocityVector.length();
    const minVelocity = gameState.minVelocity || 2.0;
    
    // Gentle natural deceleration after a jump — 1.5%/frame (was 3%).
    // Softened so a short warp-dash CARRIES momentum and coasts toward
    // the target instead of slamming to a stop the instant the boost
    // ends. Overshoots are corrected by braking (X) — which is now
    // permitted during auto-braking (see the manual-brake block below).
    const brakingForce = 0.985; // 1.5% reduction per frame
    gameState.velocityVector.multiplyScalar(brakingForce);
    
    // Also apply rotational braking for smooth camera transitions
    const rotationalBrakingForce = 0.95;
    rotationalVelocity.pitch *= rotationalBrakingForce;
    rotationalVelocity.yaw *= rotationalBrakingForce;
    rotationalVelocity.roll *= rotationalBrakingForce;
    
    // When speed drops to minimum, stop auto-braking and release control
    if (currentSpeed <= minVelocity * 1.2) {
        // Clean up jump flags and release control
        gameState.emergencyWarp.autoBraking = false;
        gameState.emergencyWarp.isJump = false;
        console.log('✅ Jump auto-brake complete - natural deceleration finished');
        
        // Disable starfield
        if (typeof toggleWarpSpeedStarfield === 'function') {
            toggleWarpSpeedStarfield(false);
        }
        
        // Return to third-person camera
        if (typeof setCameraThirdPerson === 'function') {
            setCameraThirdPerson();
        }
    }
    
    // Disable starfield when speed drops below threshold during auto-brake
    const currentSpeedKmS = currentSpeed * 1000;
    if (currentSpeedKmS < 10000 && typeof toggleWarpSpeedStarfield === 'function') {
        if (window.warpStarfield && window.warpStarfield.lines && window.warpStarfield.lines.visible) {
            toggleWarpSpeedStarfield(false);
        }
    }
}

// Update shield system
if (typeof updateShieldSystem === 'function') {
    updateShieldSystem();
}
    
    // Emergency braking (X key) - GRADUAL DECELERATION.
    // Now ALSO allowed during the jump auto-brake: the gentle auto-brake
    // lets a dash carry momentum, and pressing X (e.g. the demo's
    // overshoot brake) adds firmer deceleration to stop on the target.
    // Combined with the 0.985 auto-brake this is ~0.975/frame when both
    // are active, vs the gentle 0.985 coast when X is released.
if (keys.x) {
    // Gradual braking: reduce velocity by 1% per frame (smoother deceleration)
    const _preBrakeSpeed = gameState.velocityVector.length();
    const brakingForce = 0.99; // 1% reduction per frame (was 0.98 = 2%)
    gameState.velocityVector.multiplyScalar(brakingForce);

    // NEW: Also apply braking to rotational velocity (dampen turning and rolling)
    const rotationalBrakingForce = 0.95; // 5% reduction per frame for rotation
    rotationalVelocity.pitch *= rotationalBrakingForce;
    rotationalVelocity.yaw *= rotationalBrakingForce;
    rotationalVelocity.roll *= rotationalBrakingForce;

    // KINETIC ENERGY HARVEST: braking from high speed dumps the
    // kinetic flywheel back into the capacitor. Above 5 km/s (game-
    // units 5.0) recover 0.15/frame; below that, do nothing. This
    // replaces the old "brakes cost energy" penalty, which created the
    // wrong incentive (don't slow down even when you should).
    if (_preBrakeSpeed > 5.0) {
        gameState.energy = Math.min(gameState.maxEnergy || 100,
            (gameState.energy || 0) + 0.15);
    }
    
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
    
    if (Math.random() > 0.97) {
        if (typeof createHyperspaceEffect === 'function') {
            if (!gameState._lastBrakeFx || (Date.now() - gameState._lastBrakeFx) > 500) {
                gameState._lastBrakeFx = Date.now();
                createHyperspaceEffect();
            }
        }
    }
}
    
    // PRESERVED: Complete gravitational effects system with asteroid collision
    let totalGravitationalForce = new THREE.Vector3(0, 0, 0);
    const _gravDir = new THREE.Vector3();
    const _gravVec = new THREE.Vector3();
    const _gravSpiralForce = new THREE.Vector3();
    const _outerPos = new THREE.Vector3();
    let nearestAssistPlanet = null;
    let nearestAssistDistance = Infinity;
    let gravityWellInRange = false;
    
    // PERF: Distance culling constant
    const GRAVITY_CULL_DISTANCE = 2000;
    
    if (typeof activePlanets !== 'undefined') {
        activePlanets.forEach(planet => {
            const planetPosition = planet.position;
            const distance = camera.position.distanceTo(planetPosition);
            
            // PERF: Skip objects beyond cull distance (except black holes which have long-range gravity)
            if (distance > GRAVITY_CULL_DISTANCE && planet.userData.type !== 'blackhole') {
                return;
            }
            
            const planetMass = planet.userData.mass || 1;
            const planetRadius = planet.geometry ? planet.geometry.parameters.radius : 1;
            
            // ⭐ ASTEROID COLLISION - Apply damage and check for death
            if (planet.userData.type === 'asteroid' && distance < collisionThreshold) {
                destroyAsteroidByCollision(planet);

                if (gameState.hull <= 0) {
                    triggerPlayerDeath('HULL BREACH', 'Ship destroyed by asteroid impact');
                    return;
                }
            }

            // ⚡ DEADLY COLLISION DETECTION - Crashing into celestial bodies causes mission failure

// Black holes NEVER crash — always warp (handled below in the black hole warp section)

// Planets and stars: Collide with surface — proportional margin (5% of radius)
// Skip during 7-second startup grace period
const _inStartupGrace = typeof gameState !== 'undefined' &&
                        gameState.gameStartTime &&
                        (Date.now() - gameState.gameStartTime < 7000);
const surfaceCollision = !_inStartupGrace &&
                         (planet.userData.type === 'planet' || planet.userData.type === 'star') &&
                         distance < planetRadius * 1.05;

if (surfaceCollision) {

    // ⚡ SUN COLLISION = INSTANT DEATH
    if (planet.userData.type === 'star') {
        triggerPlayerDeath('VAPORIZED BY STAR',
            `Ship destroyed by ${planet.userData.name} - hull integrity: 0%`);
        return;
    }

    // ⚡ PLANET COLLISION = EXPLOSION AND MISSION FAILURE
    if (planet.userData.type === 'planet') {
        triggerPlayerDeath('PLANETARY IMPACT',
            `Ship destroyed by collision with ${planet.userData.name}`);
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
                _gravDir.subVectors(planetPosition, camera.position).normalize();
                _gravVec.copy(_gravDir).multiplyScalar(gravitationalForce);
                
                // Black hole effects
                if (planet.userData.type === 'blackhole') {
                    // Warp threshold relative to visual size so all BHs warp at
                    // a consistent visual distance from their surface
                    const criticalDistance = Math.max(planetRadius * 2.5, 50);
                    const warningDistance = Math.max(criticalDistance + 50, gameState.eventHorizonWarning.warningDistance);
                    
                    if (distance < warningDistance && distance > criticalDistance && !gameState.eventHorizonWarning.active) {
                        gameState.eventHorizonWarning.active = true;
                        gameState.eventHorizonWarning.blackHole = planet;
                        const eventHorizonEl = window._cachedEventHorizonEl || (window._cachedEventHorizonEl = document.getElementById('eventHorizonWarning'));
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
                        const eventHorizonEl = window._cachedEventHorizonEl || (window._cachedEventHorizonEl = document.getElementById('eventHorizonWarning'));
                        if (eventHorizonEl) {
                            eventHorizonEl.classList.add('hidden');
                        }
                    }
                    
                    if (distance < criticalDistance) {
                        if (gameState.eventHorizonWarning.active) {
                            const eventHorizonEl = window._cachedEventHorizonEl || (window._cachedEventHorizonEl = document.getElementById('eventHorizonWarning'));
                            if (eventHorizonEl) {
                                eventHorizonEl.classList.add('hidden');
                            }
                            gameState.eventHorizonWarning.active = false;
                            gameState.eventHorizonWarning.blackHole = null;
                            
                            const flashOverlay = document.createElement('div');
                            flashOverlay.className = 'absolute inset-0 bg-yellow-400 z-50 combat-damage-fx';
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
                    
                    _gravVec.multiplyScalar(20);
                    
                    // Enhanced spiral effects - OPTIMIZED: reduced DOM operations
                    if (distance < 200) {
                        const spiralStrength = Math.pow((200 - distance) / 200, 2);
                        // Cache time once instead of calling Date.now() multiple times
                        const now = performance.now() * 0.001;
                        _gravSpiralForce.set(
                            Math.sin(now * spiralStrength * 3),
                            0,
                            Math.cos(now * spiralStrength * 3)
                        ).multiplyScalar(spiralStrength * 0.2);

                        gameState.velocityVector.add(_gravSpiralForce);
                        
                        if (distance < 160) {
                            camera.rotation.z += spiralStrength * 0.02 * Math.sin(now * 5);

                            if (!window._cachedDangerOverlay) {
                                window._cachedDangerOverlay = document.getElementById('dangerOverlay');
                            }
                            if (!window._cachedDangerOverlay) {
                                const dangerOverlay = document.createElement('div');
                                dangerOverlay.id = 'dangerOverlay';
                                dangerOverlay.className = 'absolute inset-0 pointer-events-none z-20';
                                dangerOverlay.style.animation = 'pulse 0.5s infinite';
                                document.body.appendChild(dangerOverlay);
                                window._cachedDangerOverlay = dangerOverlay;
                            }
                            const _dangerAlpha = (spiralStrength * 0.4).toFixed(2);
                            if (window._cachedDangerOverlay._lastAlpha !== _dangerAlpha) {
                                window._cachedDangerOverlay._lastAlpha = _dangerAlpha;
                                window._cachedDangerOverlay.style.background = `radial-gradient(circle, transparent 0%, rgba(255,255,0,${_dangerAlpha}) 100%)`;
                            }
                        } else if (window._cachedDangerOverlay) {
                            window._cachedDangerOverlay.remove();
                            window._cachedDangerOverlay = null;
                        }
                    }
                }
                
                totalGravitationalForce.add(_gravVec);

                // Slingshot activation range — bumped vs the original
                // (radius*6 / radius*2.5+30) so the prompt fires earlier
                // at warp speed. Use the shared helper so the UI prompt
                // and executeSlingshot never disagree.
                const _objAssistRange = Math.max(assistRange,
                    (typeof getSlingshotRange === 'function')
                        ? getSlingshotRange(planet)
                        : 60);

                if (distance < _objAssistRange && distance < nearestAssistDistance) {
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
                centerObj.getWorldPosition(_outerPos);
                const distance = camera.position.distanceTo(_outerPos);
                const mass = centerObj.userData.mass || 1;

                if (distance > 0) {
                    const gravitationalForce = gravitationalConstant * gameState.shipMass * mass / (distance * distance);
                    _gravDir.subVectors(_outerPos, camera.position).normalize().multiplyScalar(gravitationalForce);
                    totalGravitationalForce.add(_gravDir);

                    const _crRange = Math.max(assistRange,
                        (typeof getSlingshotRange === 'function')
                            ? getSlingshotRange(centerObj)
                            : 60);
                    if (distance < _crRange && distance < nearestAssistDistance) {
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

                    orbiter.getWorldPosition(_outerPos);
                    const distance = camera.position.distanceTo(_outerPos);
                    const mass = orbiter.userData.mass || 1;

                    if (distance > 0) {
                        const gravitationalForce = gravitationalConstant * gameState.shipMass * mass / (distance * distance);
                        _gravDir.subVectors(_outerPos, camera.position).normalize().multiplyScalar(gravitationalForce);
                        totalGravitationalForce.add(_gravDir);

                        const _orRange = Math.max(assistRange,
                            (typeof getSlingshotRange === 'function')
                                ? getSlingshotRange(orbiter)
                                : 60);
                        if (distance < _orRange && distance < nearestAssistDistance) {
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
    // TRAJECTORY SOLVER (rep tier 4): auto-fires the slingshot ~1s after
    // entering a gravity well, along the optimal exit vector. The
    // cooldown inside executeSlingshot prevents rapid re-triggers; the
    // slingshot.active gate prevents firing during an active boost.
    if (gravityWellInRange && nearestAssistPlanet &&
        gameState.repTierUnlocks && gameState.repTierUnlocks.trajectorySolver &&
        !gameState.slingshot.active &&
        Date.now() >= (gameState.slingshotCooldownUntil || 0)) {
        if (gameState.slingshotChargeTarget !== nearestAssistPlanet) {
            gameState.slingshotChargeTarget = nearestAssistPlanet;
            gameState.slingshotChargeStart = Date.now();
        }
        if (Date.now() - (gameState.slingshotChargeStart || 0) > 900) {
            executeSlingshot();
            gameState.slingshotChargeTarget = null;
        }
    } else if (!gravityWellInRange) {
        gameState.slingshotChargeTarget = null;
    }

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
    const warpBtn = window._cachedWarpBtn || (window._cachedWarpBtn = document.getElementById('warpBtn'));
    if (nearestAssistPlanet && gameState.energy >= 20 && !gameState.slingshot.active) {
        // Detect mobile so the prompt and notification offer a tap action
        // instead of telling the player to press ENTER (no keyboard).
        const _isMobile = (typeof window !== 'undefined') && (
            window.matchMedia && window.matchMedia('(pointer: coarse)').matches ||
            ('ontouchstart' in window) ||
            (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
        );
        const _activateLabel = _isMobile ? 'TAP HERE' : 'Press ENTER';

        if (warpBtn) {
            warpBtn.disabled = false;
            warpBtn.classList.add('space-btn', 'pulse');
            const _warpText = `<i class="fas fa-rocket mr-2"></i>SLINGSHOT READY - ${_activateLabel} (${nearestAssistPlanet.userData.name})`;
            if (warpBtn._lastHtml !== _warpText) { warpBtn.innerHTML = _warpText; warpBtn._lastHtml = _warpText; }

            const tutorialComplete = (typeof tutorialSystem === 'undefined' || tutorialSystem.completed);

            // First entry: mark assist-ready and fire the initial notification.
            if (!warpBtn.classList.contains('assist-ready')) {
                warpBtn.classList.add('assist-ready');
                gameState._lastSlingshotPrompt = 0; // reset the re-prompt timer
            }

            // Re-fire the tappable "Slingshot Ready" notification every 5s
            // while the slingshot is still available. Without this it shows
            // once for 4s and then disappears — mobile players who looked
            // away briefly had no tap target left and couldn't trigger it.
            const _now = Date.now();
            const _last = gameState._lastSlingshotPrompt || 0;
            if (tutorialComplete && _now - _last > 5000) {
                gameState._lastSlingshotPrompt = _now;
                if (typeof showAchievement === 'function') {
                    showAchievement(
                        'Slingshot Ready',
                        `${_activateLabel} near ${nearestAssistPlanet.userData.name} for 20,000 km/s boost!`
                    );
                }
            }
        }
    } else if (warpBtn) {
        // Slingshot no longer available — clear the re-prompt timer so the
        // next entry into a gravity well fires a fresh notification.
        gameState._lastSlingshotPrompt = 0;
        warpBtn.disabled = true;
        warpBtn.classList.remove('pulse', 'assist-ready');
        let _wt;
        if (nearestAssistPlanet && gameState.energy < 20) {
            _wt = '<i class="fas fa-battery-empty mr-2"></i>Insufficient Energy for Slingshot';
        } else if (gameState.slingshot.active) {
            _wt = `<i class="fas fa-clock mr-2"></i>Slingshot Active (${(gameState.slingshot.timeRemaining/1000).toFixed(1)}s)`;
        } else if (gameState.slingshot.postSlingshot) {
            _wt = `<i class="fas fa-wind mr-2"></i>Coasting on Inertia (${(gameState.velocity * 1000).toFixed(0)} km/s)`;
        } else if (gameState.emergencyWarp.active) {
            _wt = `<i class="fas fa-bolt mr-2"></i>Emergency Warp Active (${(gameState.emergencyWarp.timeRemaining/1000).toFixed(1)}s)`;
        } else {
            _wt = '<i class="fas fa-rocket mr-2"></i>No Gravity Well in Range';
        }
        if (warpBtn._lastHtml !== _wt) { warpBtn.innerHTML = _wt; warpBtn._lastHtml = _wt; }
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

                    // Heavy hull damage from BORG collision (skip during grace)
                    const _gracePeriod = gameState.gameStartTime &&
                                        (Date.now() - gameState.gameStartTime < 7000);
                    const damage = 10;
                    const shieldReduction = typeof getShieldDamageReduction === 'function' ?
                                            getShieldDamageReduction() : 0;
                    const actualDamage = _gracePeriod ? 0 : damage * (1 - shieldReduction);

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

                // Hull damage based on asteroid size (skip during grace)
                const _gracePeriod2 = gameState.gameStartTime &&
                                     (Date.now() - gameState.gameStartTime < 7000);
                const damage = Math.ceil(asteroid.userData.size / 5); // Larger = more damage
                const shieldReduction = typeof getShieldDamageReduction === 'function' ?
                                        getShieldDamageReduction() : 0;
                const actualDamage = _gracePeriod2 ? 0 : damage * (1 - shieldReduction);

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
                         gameState.emergencyWarp.autoBraking ? gameState.emergencyWarp.boostSpeed :  // NEW: Allow high speed during Jump brake
                         gameState.emergencyWarp.postWarp ? gameState.emergencyWarp.boostSpeed :
                         (gameState.slingshot.active || gameState.slingshot.postSlingshot) ? 
                         gameState.slingshot.maxSpeed : gameState.maxVelocity;
    const currentVelocity = gameState.velocityVector.length();
    
    if (currentVelocity > currentMaxVelocity && 
    !gameState.slingshot.postSlingshot && 
    !gameState.emergencyWarp.active && 
    !gameState.emergencyWarp.autoBraking &&  // NEW: Don't cap velocity during Jump brake
    !gameState.emergencyWarp.postWarp) {
    gameState.velocityVector.normalize().multiplyScalar(currentMaxVelocity);
}
    
    // SPECIFICATION: Minimum velocity enforcement - MODIFIED for emergency braking AND Jump auto-brake
if (currentVelocity < gameState.minVelocity && 
    !gameState.slingshot.active && 
    !gameState.slingshot.postSlingshot && 
    !gameState.emergencyWarp.active &&
    !gameState.emergencyWarp.autoBraking &&  // NEW: Don't enforce min velocity during Jump auto-brake
    !gameState.emergencyBraking) {
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
    gameState.emergencyWarp.autoBraking ||  // NEW: Allow damping during Jump auto-brake
    gameState.emergencyWarp.postWarp) {
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
            // 🛰️ ORBITAL APPROACH: Aim for near-orbit intercept, not direct collision
            const targetPos = gameState.currentTarget.position;
            const targetDistance = camera.position.distanceTo(targetPos);
            
            // Calculate orbital approach point (offset perpendicular to approach vector)
            const toTarget = new THREE.Vector3().subVectors(targetPos, camera.position);
            const approachDistance = toTarget.length();
            
            // Determine the approach standoff. For slingshot-capable
            // bodies (planets / black holes) aim to PASS WITHIN the
            // body's slingshot activation range — getSlingshotRange() is
            // the same range findSlingshotTarget() / the "SLINGSHOT
            // READY" prompt use — so an auto-nav route always brings the
            // ship close enough to trigger an Interstellar Slingshot at
            // closest approach. 0.7× keeps it comfortably inside range
            // with margin. Enemies keep a fixed combat-range approach.
            let orbitRadius = 500; // Default
            const _navUD = gameState.currentTarget.userData || {};
            const _slingable = _navUD.type === 'planet' || _navUD.type === 'blackhole' ||
                               _navUD.type === 'star' || _navUD.type === 'moon';
            if (_slingable && typeof getSlingshotRange === 'function') {
                orbitRadius = Math.max(120, getSlingshotRange(gameState.currentTarget) * 0.7);
            } else if (_navUD.type === 'planet') {
                orbitRadius = (_navUD.size || 100) * 3;
            } else if (_navUD.type === 'blackhole') {
                orbitRadius = (_navUD.size || 200) * 2;
            } else if (_navUD.isEnemy) {
                orbitRadius = 300; // Close approach for enemies (combat range)
            }
            
            let targetDirection;
            
            // When far away: aim for tangential intercept point (orbital approach)
            if (approachDistance > orbitRadius * 2) {
                // Create tangent point perpendicular to approach vector
                const perpendicular = new THREE.Vector3(-toTarget.z, 0, toTarget.x).normalize();
                const orbitPoint = targetPos.clone().add(perpendicular.multiplyScalar(orbitRadius));
                targetDirection = new THREE.Vector3().subVectors(orbitPoint, camera.position).normalize();
            } else {
                // When close: circularize into orbit
                const currentVelocity = gameState.velocityVector.clone().normalize();
                const radialDirection = toTarget.clone().normalize();
                
                // Calculate tangential direction (perpendicular to radial)
                const tangentialDirection = new THREE.Vector3().crossVectors(radialDirection, new THREE.Vector3(0, 1, 0)).normalize();
                
                // Blend between current velocity and tangential (smooth transition into orbit)
                targetDirection = currentVelocity.lerp(tangentialDirection, 0.3);
            }
            
            gameState.velocityVector.addScaledVector(targetDirection, gameState.thrustPower * 0.4);
            _consumeEnergy(0.03);
            
            // Re-orient ONLY during distant approach (not during orbital insertion)
            // This prevents camera shake when trying to orbit close to target
            if (approachDistance > orbitRadius * 2) {
                // Far away: orient towards tangent intercept point
                orientTowardsTarget(gameState.currentTarget);
            }
            // When close (<2x orbit): let natural velocity vector guide orientation
            // Camera will naturally point where ship is going (tangential)
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

    // ENERGY REGEN — two-rate system instead of "regen iff idle":
    //   • Idle:    fast recharge.
    //   • Thrusting: slow trickle so a sustained burn still recovers
    //     a little, keeping the pool out of permanent zero.
    //   • Capacitor (rep tier 2) gives a +66% multiplier on both rates.
    // Brake (X) is excluded from "thrusting" — it's a regen source now
    // via kinetic harvest above.
const isThrusting = (keys.w || keys.a || keys.s || keys.d || keys.b) && gameState.energy > 0;
const _maxE = gameState.maxEnergy || 100;
if (gameState.energy < _maxE) {
    const _capBoost = (gameState.repTierUnlocks && gameState.repTierUnlocks.capacitor) ? 1.66 : 1.0;
    const _rate = (isThrusting ? 0.025 : 0.10) * _capBoost;
    gameState.energy = Math.min(_maxE, gameState.energy + _rate);
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
    const modulationInterval = trackInterval(setInterval(() => {
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
    }, 100));

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

    const exitRange = 4000; // Distance to trigger music fade out

    let playerNearNebula = false;

    nebulaClouds.forEach((nebula, index) => {
        if (!nebula || !nebula.userData) return;

        const distance = camera.position.distanceTo(nebula.position);
        
        // Use smaller discovery range for clustered nebulas (they come in pairs)
        // Distant and exotic nebulas can use larger range since they're more spread out
        const isClusteredNebula = !nebula.userData.isDistant && !nebula.userData.isExoticCore;
        const discoveryRange = isClusteredNebula ? 200 : 3000;

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
                gameState.energy = 100;
            }

            // Repair hull by 25%
            if (gameState.hull < (gameState.maxHull || 100)) {
                gameState.hull = Math.min(gameState.maxHull || 100, gameState.hull + 25);
            }

            // Speed boost for 10 seconds
            if (gameState.velocityVector) {
                const boostMagnitude = 3.0;
                const dir = (typeof camera !== 'undefined')
                    ? camera.getWorldDirection(new THREE.Vector3()) : new THREE.Vector3(0, 0, -1);
                gameState.velocityVector.addScaledVector(dir, boostMagnitude);
            }

            // +1 missile
            if (gameState.missiles && gameState.missiles.current < gameState.missiles.capacity) {
                gameState.missiles.current++;
            }

            // Award warp charge
            if (gameState.emergencyWarp && gameState.emergencyWarp.available < gameState.emergencyWarp.maxWarps) {
                gameState.emergencyWarp.available++;
            }

            // Play unique nebula music (DISABLED)
            // playNebulaMusic(index);

            // Get enemy intelligence
            const intel = getEnemyIntelligence(nebula.position);

            // Show welcome notification with intelligence
            const nebulaName = nebula.userData.mythicalName || nebula.userData.name || 'Unknown Nebula';

            let welcomeMessage = `Welcome to the ${nebulaName} Nebula. Energy 100%, hull +25%, speed boost, +1 missile, +1 warp!`;

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
        greeting: 'STARFLEET INTELLIGENCE',
        lore: `Federation renegades, Captain — former Starfleet officers turned pirate after the Dominion War. Admiral Kane believes the colonies were abandoned, and he fights with trained precision and no mercy.`,
        threat: 'TACTICAL: Strike formations. Shield modulation. High accuracy.'
    },
    'Klingon Empire': {
        species: 'Klingon',
        color: 0xff8844,
        greeting: 'KLINGON THREAT DETECTED',
        lore: `General Koth of House Duras has claimed this nebula as his hunting ground. Exiled for dishonor against civilians, his warband seeks glory through slaughter and will not retreat.`,
        threat: 'TACTICAL: Ramming tactics. Possible cloaks. Berserker combat.'
    },
    'Rebel Alliance': {
        species: 'Mon Calamari',
        color: 0x88ff44,
        greeting: 'REBEL CELL IDENTIFIED',
        lore: `Mon Calamari insurgents — survivors of Imperial occupation now striking any vessel they don't trust. Tessek's converted cruisers run on vengeance, and outsiders are enemies first.`,
        threat: 'TACTICAL: Ambush specialists. Superior sensors. "It\'s a trap!"'
    },
    'Romulan Star Empire': {
        species: 'Romulan',
        color: 0xff4488,
        greeting: 'ROMULAN ACTIVITY',
        lore: `A Tal Shiar covert fleet under Commander T\'Vok answers to no one. Their orders: eliminate every witness. Trust nothing you see — Romulan deception is legendary.`,
        threat: 'TACTICAL: Cloaks. Plasma torpedoes. Psyops.'
    },
    'Galactic Empire': {
        species: 'Imperial',
        color: 0x44ffff,
        greeting: 'IMPERIAL REMNANT',
        lore: `Moff Jerec's Imperial Remnant fleet hides here, hunting relics they believe will restore Imperial glory. TIE squadrons crewed by veterans; capital captains show no mercy.`,
        threat: 'TACTICAL: Overwhelming numbers. Fighter swarms. Heavy capital firepower.'
    },
    'Cardassian Union': {
        species: 'Cardassian',
        color: 0xff44ff,
        greeting: 'CARDASSIAN PRESENCE',
        lore: `Obsidian Order remnants under Gul Madred operate in this region — infamous interrogator, experimental weapons. They prefer to disable ships and take crews alive for processing.`,
        threat: 'TACTICAL: Disabling weapons. Tractor traps. Torturers aboard.'
    },
    'Sith Empire': {
        species: 'Sith',
        color: 0xff8888,
        greeting: 'SITH LORD DETECTED',
        lore: `Darth Malachar's acolytes drain the life of whole worlds to feed his immortality. Their weapons burn with the Dark Side, and fear is their finest blade.`,
        threat: 'TACTICAL: Force-enhanced pilots. Lightning weapons. Unpredictable aggression.'
    },
    'Vulcan High Command': {
        species: 'Vulcan',
        color: 0xffaa88,
        greeting: 'VULCAN EXTREMISTS',
        lore: `The V\'tosh ka\'tur — Vulcans without logic — under Administrator Soval believe emotion must be purged by force. Brilliant tactical minds turned to genocide.`,
        threat: 'TACTICAL: Perfect efficiency. No fear. No hesitation. No mercy.'
    }
};

// =============================================================================
// NEBULA-SPECIFIC LORE DATABASE
// Each of the 22 nebulas has unique backstory explaining its connection to hostiles
// =============================================================================

const NEBULA_LORE = {
    // =========================================================================
    // GALAXY-FORMATION NEBULAS (8) - Named after mythology, tied to galaxy types
    // =========================================================================
    
    'Olympus Nebula': {
        galaxyId: 0,
        faction: 'Federation',
        species: 'Human',
        greeting: 'OLYMPUS SECTOR INTEL',
        backstory: `Olympus was Starfleet's premier deep-space academy until the Dominion War ended and it was decommissioned. Admiral Kane and his followers refused the recall order and stayed.`,
        connection: `Kane has turned the academy into a fortress for his "New Olympians." The nebula's sensor scramble makes them ghosts.`,
        threat: 'TACTICAL: Academy-trained pilots ambushing from the gas clouds.'
    },

    'Titan Nebula': {
        galaxyId: 1,
        faction: 'Klingon Empire',
        species: 'Klingon',
        greeting: 'TITAN NEBULA INCURSION',
        backstory: `Klingons hold Titan sacred — legend says Kahless slew Molor's fleet here. Warriors come to die well.`,
        connection: `General Koth's exiled warband believes a death in Titan opens the gates of Sto-vo-kor. They'll happily take you with them.`,
        threat: 'TACTICAL: Berserker tactics. Ramming-rigged hulls. Retreat is unthinkable.'
    },

    'Atlantis Nebula': {
        galaxyId: 2,
        faction: 'Rebel Alliance',
        species: 'Mon Calamari',
        greeting: 'ATLANTIS NEBULA SITUATION',
        backstory: `Atlantis suspends pockets of liquid matter — Mon Calamari refugees found it during their Imperial exodus and called it home.`,
        connection: `Commander Tessek's survivors are paranoid now. Any inbound vessel is a hunter unless proven otherwise.`,
        threat: 'TACTICAL: Adapted sensors, liquid-pocket ambushes. "It\'s a trap!" is literal here.'
    },

    'Prometheus Nebula': {
        galaxyId: 3,
        faction: 'Romulan Star Empire',
        species: 'Romulan',
        greeting: 'PROMETHEUS SECTOR INTERCEPT',
        backstory: `Prometheus burns around a proto-star in perpetual ignition — unlimited power for anyone who can tame it. The Romulans got there first.`,
        connection: `Commander T'Vok runs Project Prometheus inside a station crewed by agents declared officially dead. Witnesses don't leave.`,
        threat: 'TACTICAL: Experimental plasma. Holo decoys. Cloaks that hold inside the nebula.'
    },

    'Elysium Nebula': {
        galaxyId: 4,
        faction: 'Galactic Empire',
        species: 'Imperial',
        greeting: 'ELYSIUM SECTOR — IMPERIAL REMNANT',
        backstory: `Elysium was a luxury-cruise destination until the Empire fell. Then the liners became warships and the tourists became hostages.`,
        connection: `Moff Jerec's fanatics mine the nebula with slave labor, broadcasting that Elysium will be the capital of a New Empire.`,
        threat: 'TACTICAL: Massive fighter numbers, salvaged Imperial weapons, hostages on every hull.'
    },

    'Tartarus Nebula': {
        galaxyId: 5,
        faction: 'Cardassian Union',
        species: 'Cardassian',
        greeting: 'TARTARUS SECTOR — OBSIDIAN ORDER',
        backstory: `Tartarus is so dense it swallows light. Old spacers called it the abyss and steered clear.`,
        connection: `Gul Madred runs the Order's most classified interrogation site inside it. The darkness is half the cell. "There are FIVE lights," Captain.`,
        threat: 'TACTICAL: Disablers, tractor nets, sensor blinds. The dark itself is a weapon.'
    },

    'Hyperion Nebula': {
        galaxyId: 6,
        faction: 'Sith Empire',
        species: 'Sith',
        greeting: 'HYPERION SECTOR — DARK SIDE CONVERGENCE',
        backstory: `A binary star at Hyperion's heart hides a wound in the Force where the Dark Side bleeds through.`,
        connection: `Darth Malachar's temple at the wound draws the life force of whole crews. The light you see is the glow of consumed souls.`,
        threat: 'TACTICAL: Force-enhanced pilots, shield-bypassing lightning, no fear of death.'
    },

    'Chronos Nebula': {
        galaxyId: 7,
        faction: 'Vulcan High Command',
        species: 'Vulcan',
        greeting: 'CHRONOS SECTOR — TEMPORAL ANOMALY',
        backstory: `Chronos warps the flow of time. Minutes become hours, or seconds.`,
        connection: `The V'tosh ka'tur under Administrator Soval ride those distortions, striking from moments you haven't experienced yet. Your death is simply logical.`,
        threat: 'TACTICAL: Temporal ambushes. Perfect coordination. Zero emotion.'
    },
    
    // =========================================================================
    // DISTANT NEBULAS (6) - Greek letter designations, far from origin
    // =========================================================================
    
    'Distant Nebula Alpha': {
        galaxyId: 4,
        faction: 'Galactic Empire',
        species: 'Imperial',
        greeting: 'DISTANT ALPHA — LONG-RANGE SCAN',
        backstory: `Alpha holds hypermatter deposits enough to power a thousand Star Destroyers. Thrawn left contingency orders to build a shipyard here.`,
        connection: `Captain Pellaeon followed those orders to the letter — an Imperial armada is growing in the depths, crewed by survivors loyal to a dead Empire.`,
        threat: 'TACTICAL: State-of-the-art hulls. Veteran crews. A commander Thrawn trusted.'
    },

    'Distant Nebula Beta': {
        galaxyId: 5,
        faction: 'Cardassian Union',
        species: 'Cardassian',
        greeting: 'DISTANT BETA — DEEP-SPACE INTERCEPT',
        backstory: `Beta hides ruins predating every known species. The Cardassian survey team that found them lost half their minds.`,
        connection: `Gul Revok is trying to weaponize the alien tech that survives. Ships that go in either don't come back, or come back wrong.`,
        threat: 'TACTICAL: Cardassian doctrine plus alien tech. Crews report hallucinations near the sector.'
    },

    'Distant Nebula Gamma': {
        galaxyId: 6,
        faction: 'Sith Empire',
        species: 'Sith',
        greeting: 'DISTANT GAMMA — FORCE DISTURBANCE',
        backstory: `Gamma pulses with energy the Jedi Council forbade approaching. Force-sensitives feel a slow, hungry heartbeat inside it.`,
        connection: `Darth Nihira went in to commune with whatever lives there. She hasn't returned — but her followers have, gathering sacrifices for "the Awakening."`,
        threat: 'TACTICAL: Cultists with impossible Force abilities. Ships that mend damage. An enemy possibly not entirely physical.'
    },

    'Distant Nebula Delta': {
        galaxyId: 7,
        faction: 'Vulcan High Command',
        species: 'Vulcan',
        greeting: 'DISTANT DELTA — LOGIC BREACH',
        backstory: `Delta houses a Vulcan wormhole experiment that opened on a parallel universe where Vulcans never embraced logic. The project was classified and buried.`,
        connection: `The V'tosh ka'tur reopened it. They're smuggling ships, weapons and warriors across. Soval's forces grow with every crossing.`,
        threat: 'TACTICAL: Vulcan intellect plus emotional ruthlessness. Telepathic attacks. Physics-defying tech.'
    },

    'Distant Nebula Epsilon': {
        galaxyId: 0,
        faction: 'Federation',
        species: 'Human',
        greeting: 'DISTANT EPSILON — FEDERATION ALERT',
        backstory: `The colony of New Eden flourished for decades, then went silent. By the time relief arrived, the colonists had become something else.`,
        connection: `Kane's New Olympians found kindred spirits in those survivors and recruited them as shock troops — humans who've forgotten how to be human.`,
        threat: 'TACTICAL: Starfleet training plus frontier savagery. No surrender, theirs or yours.'
    },

    'Distant Nebula Zeta': {
        galaxyId: 1,
        faction: 'Klingon Empire',
        species: 'Klingon',
        greeting: 'DISTANT ZETA — WARRIOR ALERT',
        backstory: `Klingons call Zeta "Gre'thor's Shadow" — the dishonored are said to wander it forever, denied either Sto-vo-kor or Gre'thor.`,
        connection: `Koth exiles his most dangerous warriors here as "punishment." They're really an army of the damned with nothing to lose.`,
        threat: 'TACTICAL: No retreat, no surrender, no sanity. Ships held together by rage.'
    },
    
    // =========================================================================
    // EXOTIC CORE NEBULAS (8) - Named for their frontier nature
    // =========================================================================
    
    'Frontier Nebula': {
        galaxyId: 2,
        faction: 'Rebel Alliance',
        species: 'Mon Calamari',
        greeting: 'FRONTIER ALERT — UNCHARTED',
        backstory: `Where the star charts end. Smugglers and refugees have used Frontier as a waypoint for generations.`,
        connection: `Tessek's "Last Tide" hide a salvaged fleet here. Any approaching ship is presumed an Imperial hunter.`,
        threat: 'TACTICAL: Desperate defenders. Improvised weapons. Home turf they know cold.'
    },

    'Outer Veil Nebula': {
        galaxyId: 3,
        faction: 'Romulan Star Empire',
        species: 'Romulan',
        greeting: 'OUTER VEIL INTEL — CLASSIFIED',
        backstory: `An ionized shell around the Veil blocks every signal in or out — a cosmic-scale cloak.`,
        connection: `Inside, the Tal Shiar keep their highest-value prisoners. T'Vok personally runs the interrogations. Enter the Veil and you join the collection.`,
        threat: 'TACTICAL: No comms inside. Prisoners used as bait. Capture specialists.'
    },

    'Deep Space Nebula': {
        galaxyId: 4,
        faction: 'Galactic Empire',
        species: 'Imperial',
        greeting: 'DEEP SPACE SECTOR — IMPERIAL PRESENCE',
        backstory: `Deep Space is further from any star than any nebula on record. Weeks from civilization at max warp — the perfect hiding place.`,
        connection: `Moff Jerec runs his command from inside, using it as a loyalty-test proving ground for his elite officers.`,
        threat: 'TACTICAL: Elite Imperial crews. No backup coming — for either side.'
    },

    'Void Nebula': {
        galaxyId: 5,
        faction: 'Cardassian Union',
        species: 'Cardassian',
        greeting: 'VOID SECTOR — EXTREME CAUTION',
        backstory: `The Void doesn't just absorb light, it absorbs energy. Ships that enter report failures, whispers, and ghosts.`,
        connection: `Madred uses it as a tool: prisoners drift in the dark until the whispers break them. His guards wear shield devices that can be cut remotely.`,
        threat: 'TACTICAL: Environmental hazards off the charts. Crews adapted to conditions that drive others mad. Your sensors may lie.'
    },

    'Boundary Nebula': {
        galaxyId: 6,
        faction: 'Sith Empire',
        species: 'Sith',
        greeting: 'BOUNDARY SECTOR — FORCE NEXUS',
        backstory: `A "thin place" where the walls between dimensions weaken. Jedi ringed it with warning beacons; the Sith built temples inside.`,
        connection: `Malachar's inner circle perform rituals here that reach across life and death, summoning dead Sith Lords. Those spirits are always dangerous.`,
        threat: 'TACTICAL: Forbidden Sith sorcery. Enemies that may not be entirely alive. Weapons that strike the soul.'
    },

    'Edge Nebula': {
        galaxyId: 7,
        faction: 'Vulcan High Command',
        species: 'Vulcan',
        greeting: 'EDGE SECTOR — LOGIC EXTREMITY',
        backstory: `Edge sits at the rim of the galaxy where stars thin out. People who spend time here come back seeing things differently.`,
        connection: `Soval brought the V'tosh ka'tur here on purpose — to view civilization as a single inefficient organism that must be cured. Your death is one step in a centuries-long equation.`,
        threat: 'TACTICAL: Perfect long-term planning. Traps set years in advance. Your responses already calculated.'
    },

    'Threshold Nebula': {
        galaxyId: 0,
        faction: 'Federation',
        species: 'Human',
        greeting: 'THRESHOLD — CRITICAL SECTOR',
        backstory: `Threshold marks the end of Federation space and the start of lawless territory — a haven for smugglers and the wanted.`,
        connection: `Kane's New Olympians run their recruitment center here. Crossing the Threshold is treated as dying to your old life — and as defection if you try to go back.`,
        threat: 'TACTICAL: Defectors and pirates mixed. Federation discipline with frontier brutality. No records.'
    },

    'Horizon Nebula': {
        galaxyId: 1,
        faction: 'Klingon Empire',
        species: 'Klingon',
        greeting: 'HORIZON SECTOR — WARRIOR WARNING',
        backstory: `A thousand dying stars give Horizon a permanent sunset glow — "the edge of today" in Klingon poetry, the last light before eternal night.`,
        connection: `Koth runs gladiatorial combat here, broadcasting the kills for morale. Winners get a quick death; losers don't.`,
        threat: 'TACTICAL: Arena-hardened warriors. Bloodthirsty spectators who join in. A commander who fights for sport.'
    }
};

// Helper function to get nebula-specific lore
function getNebulaLore(nebulaName) {
    return NEBULA_LORE[nebulaName] || null;
}

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

    // 20 particles per path — enough for a glowing effect without
    // ballooning Points count when many paths persist.
    const particleCount = 20;
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

// Find or relocate enemies to an EXOTIC outer system so discovery paths
// can lead to enemies "hiding" out there.  Picks a random exotic_core
// system, moves up to 4 faction enemies to positions near it (if fewer
// are already nearby), and returns the system's position.
// Returns null if no exotic systems exist or no enemies available.
function findEnemiesNearExoticSystem(galaxyId) {
    if (typeof enemies === 'undefined' ||
        typeof outerInterstellarSystems === 'undefined') return null;

    const exoticSystems = outerInterstellarSystems.filter(s =>
        s && s.userData && s.userData.systemType === 'exotic_core');
    if (exoticSystems.length === 0) return null;

    const system = exoticSystems[Math.floor(Math.random() * exoticSystems.length)];
    const sysPos = system.position.clone();
    const HIDE_RADIUS = 2500;

    // Who's already hiding there?
    const alreadyThere = enemies.filter(e =>
        e && e.userData && e.userData.galaxyId === galaxyId &&
        e.userData.health > 0 && !e.userData.isBoss && !e.userData.isBossSupport &&
        e.position.distanceTo(sysPos) < HIDE_RADIUS);

    // Need at least 3 enemies near the system for a real mission.  If we're
    // short, relocate some from the galaxy to hide at the exotic system.
    // Don't pull black-hole defenders or already-anchored mission enemies
    // — those guard locations the player expects hostiles at.
    const needed = Math.max(0, 3 - alreadyThere.length);
    if (needed > 0) {
        const candidates = enemies.filter(e =>
            e && e.userData && e.userData.galaxyId === galaxyId &&
            e.userData.health > 0 && !e.userData.isBoss && !e.userData.isBossSupport &&
            e.userData.placementType !== 'black_hole' &&
            !e.userData.missionAnchored &&
            e.position.distanceTo(sysPos) >= HIDE_RADIUS);
        for (let i = 0; i < needed && i < candidates.length; i++) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            if (pick && pick.position) {
                const off = new THREE.Vector3(
                    (Math.random() - 0.5) * 1500,
                    (Math.random() - 0.5) * 800,
                    (Math.random() - 0.5) * 1500);
                pick.position.copy(sysPos).add(off);
                alreadyThere.push(pick);
            }
        }
    }

    if (alreadyThere.length === 0) return null;

    return {
        position: sysPos,
        count: alreadyThere.length,
        cosmicFeature: system.userData.name,
        cosmicFeatureType: 'Exotic System (' + (system.userData.centerType || 'core') + ')'
    };
}

// Find patrol enemies near cosmic features for a galaxy (AWAY from black hole)
function findPatrolEnemiesNearCosmicFeatures(galaxyId) {
    if (typeof enemies === 'undefined') return null;

    // 35% chance the mission points to an exotic outer system instead
    // of an in-galaxy cosmic feature.  Enemies are relocated to hide
    // there so the dotted line leads to real hostiles.
    if (Math.random() < 0.35) {
        const exoticData = findEnemiesNearExoticSystem(galaxyId);
        if (exoticData) return exoticData;
    }

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
function createDiscoveryPathToPosition(nebulaPosition, targetPosition, factionColor, factionName, pathType, galaxyId) {
    if (!scene || !THREE) return null;

    const startPos = nebulaPosition.clone();
    const endPos = targetPosition.clone();

    // Snapshot live enemies near the mission ENDPOINT — not all galaxy
    // enemies.  The path leads to a specific cluster (at a cosmic feature
    // or exotic system), so completion should require clearing only those,
    // not every enemy across the entire galaxy.
    //
    // If fewer than MIN_MISSION_ENEMIES are within range, relocate galaxy
    // enemies to the endpoint so the dotted line always leads to real
    // hostiles.  Tracked enemies are then anchored (patrolCenter +
    // smaller patrolRadius) to the endpoint so they don't wander out of
    // the mission area before the player arrives.
    const missionEnemies = [];
    const MISSION_RADIUS = 3000;
    const MIN_MISSION_ENEMIES = 7;
    const ANCHOR_RADIUS = 1200;
    if (typeof enemies !== 'undefined' && galaxyId >= 0) {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e || !e.userData || e.userData.health <= 0) continue;
            if (e.userData.isBoss || e.userData.isBossSupport) continue;
            if (e.userData.galaxyId === galaxyId &&
                e.position.distanceTo(endPos) < MISSION_RADIUS) {
                missionEnemies.push(e);
            }
        }

        // Relocate enemies to the endpoint if the area is sparse.
        if (missionEnemies.length < MIN_MISSION_ENEMIES) {
            const candidates = enemies.filter(e =>
                e && e.userData &&
                e.userData.galaxyId === galaxyId &&
                e.userData.health > 0 &&
                !e.userData.isBoss && !e.userData.isBossSupport &&
                !e.userData.isEliteGuardian &&
                e.userData.placementType !== 'black_hole' &&
                !e.userData.missionAnchored &&
                missionEnemies.indexOf(e) === -1
            );
            const needed = MIN_MISSION_ENEMIES - missionEnemies.length;
            for (let k = 0; k < needed && candidates.length > 0; k++) {
                const idx = Math.floor(Math.random() * candidates.length);
                const pick = candidates.splice(idx, 1)[0];
                if (!pick || !pick.position) continue;
                const off = new THREE.Vector3(
                    (Math.random() - 0.5) * 1500,
                    (Math.random() - 0.5) * 600,
                    (Math.random() - 0.5) * 1500
                );
                pick.position.copy(endPos).add(off);
                missionEnemies.push(pick);
            }
        }

        // Still short?  Spawn fresh enemies at the endpoint.  Galaxies
        // with tight enemy budgets (or several active missions) can
        // exhaust the relocation pool — the dotted line should still
        // lead to a real group of 7+ hostiles, so we top up.
        if (missionEnemies.length < MIN_MISSION_ENEMIES &&
            typeof spawnMissionEnemyAt === 'function') {
            const needed = MIN_MISSION_ENEMIES - missionEnemies.length;
            for (let k = 0; k < needed; k++) {
                const fresh = spawnMissionEnemyAt(galaxyId, endPos);
                if (fresh) missionEnemies.push(fresh);
            }
        }

        // Anchor tracked enemies to the endpoint so they stay near the
        // dotted line's destination during patrol behavior.
        for (let m = 0; m < missionEnemies.length; m++) {
            const e = missionEnemies[m];
            if (!e || !e.userData) continue;
            if (e.userData.patrolCenter && e.userData.patrolCenter.copy) {
                e.userData.patrolCenter.copy(endPos);
            } else {
                e.userData.patrolCenter = endPos.clone();
            }
            e.userData.patrolRadius = ANCHOR_RADIUS;
            e.userData.missionAnchored = true;
        }
    }

    // Create points along the path.  40 segments is plenty for a smooth
    // curved line — was 100, which meant ~100 dashed segments per path.
    // Dashed-line rendering is expensive on GPU, so fewer segments keeps
    // frame times low when many mission paths are active.
    const pathPoints = [];
    const segments = 40;

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
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
        pathType: pathType,
        faction: factionName,
        galaxyId: galaxyId !== undefined ? galaxyId : -1,
        startPosition: startPos.clone(),
        endPosition: endPos.clone(),
        createdAt: Date.now(),
        originalColor: factionColor,
        missionComplete: false
    };

    // Add glow particles along the path
    const glowParticles = createPathGlowParticles(pathPoints, factionColor);

    scene.add(pathLine);
    if (glowParticles) scene.add(glowParticles);

    discoveryPaths.push({
        line: pathLine,
        particles: glowParticles,
        faction: factionName,
        pathType: pathType,
        originalColor: factionColor,
        galaxyId: galaxyId !== undefined ? galaxyId : -1,
        missionEnemies: missionEnemies
    });

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
        if (nebulaType === 'clustered') {
            deepDiscoveryRange = 100; // Close approach required
        } else {
            // Galaxy-formation, distant, and exotic all use nebula size as range.
            // Galaxy-formation triggers while the player is fighting near the black hole
            // inside the nebula boundary, so close approach isn't practical.
            deepDiscoveryRange = nebulaSize;
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
        
        // Get nebula-specific lore (unique backstory for each nebula)
        const nebulaLore = getNebulaLore(nebulaName);
        const hasNebulaLore = nebulaLore !== null;
        
        // Use nebula-specific greeting if available, else use faction default
        const greeting = hasNebulaLore ? nebulaLore.greeting : loreData.greeting;
        
        // Combine BOTH faction lore AND nebula-specific lore for maximum story content
        const factionBackstory = loreData.lore;  // General faction backstory (always shown)
        const nebulaBackstory = hasNebulaLore ? nebulaLore.backstory : '';  // Nebula's unique history
        const nebulaConnection = hasNebulaLore ? nebulaLore.connection : '';  // Why this nebula connects to faction
        
        // Combine threat assessments - show both if nebula has unique threat
        const factionThreat = loreData.threat;
        const nebulaThreat = hasNebulaLore ? nebulaLore.threat : '';
        const combinedThreat = nebulaThreat && nebulaThreat !== factionThreat 
            ? `${factionThreat}\n\nLOCAL THREAT: ${nebulaThreat}`
            : factionThreat;

        // GALAXY-FORMATION: Trigger on approach (same as other nebulas)
        // Previously required clearing black hole enemies first, but this was too restrictive
        // Now triggers immediately so player gets lore and navigation when entering the nebula

        // Mark as deep discovered
        console.log(`✨ DEEP DISCOVERY TRIGGERED for ${nebulaType} nebula "${nebulaName}" at distance ${distance.toFixed(0)}`);
        nebula.userData.deepDiscovered = true;

        // Reward: ship upgrade (energy efficiency + top speed). Fires once
        // per nebula. Delay slightly so the upgrade achievement appears
        // after any incoming transmission popup that this discovery triggers.
        if (typeof applyNebulaShipUpgrade === 'function') {
            setTimeout(() => applyNebulaShipUpgrade(nebulaName), 2500);
        }
        // Reward player for the discovery itself (separate from the
        // ship upgrade which arrives a beat later).
        if (typeof awardReputation === 'function') {
            awardReputation(30, 'Nebula charted: ' + (nebulaName || 'unknown'));
        }

        // CHECK: Is this faction already defeated?
        if (isFactionDefeated(galaxyId)) {
            // Liberation gratitude message
            playDeepDiscoverySound();

            const liberationText =
                `LIBERATED TERRITORY\n\n` +
                `Welcome to the ${nebulaName}, Captain. The ${factionName} in the ${galaxyType.name} Galaxy are gone.\n\n` +
                `Shipping lanes are reopen, reconstruction underway. This sector is yours.`;

            if (typeof showIncomingTransmission === 'function') {
                showIncomingTransmission('Mission Control - Liberated Sector', liberationText, loreData.color);
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
            // ALL paths lead to enemy clusters near cosmic features.
            // Even index = "stronghold" (larger cluster), odd = "patrol"
            // (smaller cluster at a different feature).
            const isCorePath = (index % 2 === 0);
            const patrolData = findPatrolEnemiesNearCosmicFeatures(galaxyId);

            if (patrolData) {
                createDiscoveryPathToPosition(
                    nebula.position,
                    patrolData.position,
                    loreData.color,
                    factionName,
                    isCorePath ? 'core' : 'patrol',
                    galaxyId
                );

                playDeepDiscoverySound();

                // Recruit a new wingman from this nebula (Greek-named)
                if (typeof recruitNebulaWingman === 'function') {
                    setTimeout(() => recruitNebulaWingman(nebulaName), 1500);
                }

                let locationInfo = '';
                if (patrolData.cosmicFeature) {
                    locationInfo = `${patrolData.count} ${factionName} forces near the ${patrolData.cosmicFeature} — ` +
                        `${isCorePath ? 'command stronghold' : 'staging area'} in the ${galaxyType.name} Galaxy.`;
                } else {
                    locationInfo = `${patrolData.count} ${factionName} forces hitting shipping lanes in the ${galaxyType.name} Galaxy.`;
                }

                let transmissionText = `${greeting}\n\n${factionBackstory}\n\n`;
                if (nebulaBackstory) transmissionText += `${nebulaBackstory}\n\n`;
                if (nebulaConnection) transmissionText += `${nebulaConnection}\n\n`;
                transmissionText += `FORCES: ${locationInfo}\n\n${combinedThreat}\n\n`;
                transmissionText += `Follow the ${colorName} line from ${nebulaName}. Clear them and the boss surfaces.`;

                if (typeof showIncomingTransmission === 'function') {
                    showIncomingTransmission(
                        isCorePath ? 'Mission Control - Stronghold Located' : 'Mission Control - Patrol Routes Located',
                        transmissionText, loreData.color
                    );
                }

                const achievementText = patrolData.cosmicFeature
                    ? `${patrolData.count} ${factionName} units near ${patrolData.cosmicFeature}. Path marked.`
                    : `${patrolData.count} ${factionName} units detected. Path marked.`;
                if (typeof showAchievement === 'function') {
                    showAchievement(isCorePath ? 'Enemy Stronghold Located!' : 'Enemy Patrols Located!', achievementText, true);
                }

                console.log(`🔮 Deep discovery (${isCorePath ? 'CORE' : 'PATROL'}): ${nebulaName} → ${factionName} (${patrolData.count} units, cosmic: ${patrolData.cosmicFeature || 'none'})`);
            } else {
                console.log(`No enemies found near cosmic features for ${factionName} in galaxy ${galaxyId}`);
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
                    'patrol',
                    galaxyId
                );

                playDeepDiscoverySound();

                // Recruit a new wingman from this nebula
                if (typeof recruitNebulaWingman === 'function') {
                    setTimeout(() => recruitNebulaWingman(nebulaName), 1500);
                }

                let transmissionText = `${greeting}\n\n${factionBackstory}\n\n`;
                if (nebulaBackstory) transmissionText += `${nebulaBackstory}\n\n`;
                if (nebulaConnection) transmissionText += `${nebulaConnection}\n\n`;
                transmissionText += `STRONGHOLD DOWN: ${remainingTarget.count} ${galaxyType.species} survivors are scattered and still dangerous.\n\n`;
                transmissionText += `${combinedThreat}\n\n`;
                transmissionText += `Follow the ${colorName} line from ${nebulaName}. Finish it.`;

                if (typeof showIncomingTransmission === 'function') {
                    showIncomingTransmission('Mission Control - Remnant Forces Detected', transmissionText, loreData.color);
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
                    pathType,
                    galaxyId
                );

                playDeepDiscoverySound();

                // Recruit a new wingman from this nebula (Greek-named)
                if (typeof recruitNebulaWingman === 'function') {
                    setTimeout(() => recruitNebulaWingman(nebulaName), 1500);
                }

                let locationInfo = '';
                if (patrolData && patrolData.cosmicFeature) {
                    locationInfo = `STAGING: ${targetData.count} ${factionName} forces near the ${patrolData.cosmicFeature} — forward base in the ${galaxyType.name} Galaxy.`;
                } else {
                    locationInfo = `HOSTILE: ${targetData.count} ${factionName} forces hold this region of the ${galaxyType.name} Galaxy.`;
                }

                let transmissionText = `${greeting}\n\n${factionBackstory}\n\n`;
                if (nebulaBackstory) transmissionText += `${nebulaBackstory}\n\n`;
                if (nebulaConnection) transmissionText += `${nebulaConnection}\n\n`;
                transmissionText += `${locationInfo}\n\n${combinedThreat}\n\n`;
                transmissionText += `Follow the ${colorName} line from ${nebulaName}.`;

                if (typeof showIncomingTransmission === 'function') {
                    showIncomingTransmission('Mission Control - Hostile Forces Located', transmissionText, loreData.color);
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

function _disposeDiscoveryPath(path) {
    if (path.line) {
        if (path.line.parent) path.line.parent.remove(path.line);
        if (path.line.geometry) path.line.geometry.dispose();
        if (path.line.material) path.line.material.dispose();
    }
    if (path.particles) {
        if (path.particles.parent) path.particles.parent.remove(path.particles);
        if (path.particles.geometry) path.particles.geometry.dispose();
        if (path.particles.material) path.particles.material.dispose();
    }
}

// Mission radius: an enemy within this distance of the path endpoint
// counts as "belonging to" the mission.  When none remain, the path
// turns white to signal completion.
const DISCOVERY_MISSION_RADIUS = 3500;

function _guessGalaxyFromFaction(factionName) {
    const map = { 'Federation': 0, 'Klingon': 1, 'Rebel': 2, 'Romulan': 3,
                  'Galactic Empire': 4, 'Imperial': 4, 'Cardassian': 5,
                  'Sith': 6, 'Sith Empire': 6, 'Vulcan': 7 };
    for (const [key, id] of Object.entries(map)) {
        if (factionName && factionName.indexOf(key) !== -1) return id;
    }
    return -1;
}
const MISSION_COMPLETE_COLOR = new THREE.Color(0xffffff);
let _missionCheckFrame = 0;

function animateDiscoveryPaths() {
    // Paths are NEVER removed automatically — they persist as mission
    // markers so the player always knows where their objectives are.

    // Throttle the opacity pulse: update every 4 frames (~15 Hz) instead
    // of every frame.  The pulse is slow (sin at 2 Hz) so users can't
    // perceive the difference, and we save material uniform writes.
    _missionCheckFrame = (_missionCheckFrame + 1) % 30;
    const doMissionCheck = _missionCheckFrame === 0;
    const doPulse = (_missionCheckFrame % 4) === 0;
    if (!doPulse && !doMissionCheck) return;

    const time = Date.now() * 0.001;
    const pulse1 = 0.5 + Math.sin(time * 2) * 0.2;
    const pulse2 = 0.3 + Math.sin(time * 3) * 0.2;

    for (let i = 0; i < discoveryPaths.length; i++) {
        const path = discoveryPaths[i];
        if (!path.line) continue;
        const mat = path.line.material;
        if (!mat) continue;

        if (doPulse) {
            mat.opacity = pulse1;
            if (path.particles && path.particles.material) {
                path.particles.material.opacity = pulse2;
            }
        }

        // Mission-status check — based on the specific enemies that were
        // alive when this path was created, not a radius check (which
        // failed because galaxy enemies can be spread far from any one
        // endpoint).  30-second grace period so new paths don't flip
        // white before the player has a chance to follow them.
        if (doMissionCheck) {
            const createdAt = path.line.userData.createdAt || 0;
            if (Date.now() - createdAt < 30000) continue;   // grace period

            const tracked = path.missionEnemies;
            let alive = false;
            if (tracked && tracked.length > 0) {
                for (let j = 0; j < tracked.length; j++) {
                    const e = tracked[j];
                    if (e && e.userData && e.userData.health > 0) {
                        alive = true;
                        break;
                    }
                }
            } else {
                // Legacy / sparse paths with no captured snapshot: fall
                // back to a radius check around the endpoint so the
                // mission can still complete rather than hanging open
                // forever.
                const gId = path.galaxyId !== undefined ? path.galaxyId
                    : (path.line && path.line.userData && path.line.userData.galaxyId);
                const endPos = path.line && path.line.userData && path.line.userData.endPosition;
                if (typeof enemies !== 'undefined' && gId !== undefined && gId >= 0 && endPos) {
                    const MISSION_RADIUS = 3000;
                    for (let j = 0; j < enemies.length; j++) {
                        const e = enemies[j];
                        if (!e || !e.userData || e.userData.health <= 0) continue;
                        if (e.userData.isBoss || e.userData.isBossSupport) continue;
                        if (e.userData.galaxyId === gId &&
                            e.position.distanceTo(endPos) < MISSION_RADIUS) {
                            alive = true;
                            break;
                        }
                    }
                }
            }

            const ud = path.line.userData;
            const wasComplete = ud.missionComplete;

            // PHASE 1 — tracked hostiles cleared: spawn the boss and
            // enter "boss phase". The mission is NOT complete yet; the
            // line stays its faction colour and no reward fires. We
            // only announce the boss arrival here.
            if (!alive && !wasComplete && !ud.bossPhase) {
                const gId = path.galaxyId !== undefined ? path.galaxyId
                    : (ud.galaxyId !== undefined ? ud.galaxyId : -1);
                if (gId >= 0 && typeof spawnBossForArea === 'function') {
                    const areaKey = gId + '-mission_' + i;
                    if (!bossSystem || !bossSystem.areaBosses || !bossSystem.areaBosses[areaKey]) {
                        const endPos = path.endPosition ||
                            (ud && ud.endPosition) || null;
                        spawnBossForArea(gId, 'cosmic_feature', areaKey, endPos);
                        if (typeof showAchievement === 'function') {
                            showAchievement('Boss Incoming!', 'All hostiles cleared — a boss has appeared! Destroy it to complete the mission.', true);
                        }
                        ud.bossPhase = true;
                        ud.bossAreaKey = areaKey;
                    } else {
                        // A boss already exists for this area (e.g. from
                        // the area-cleared system) — adopt it.
                        ud.bossPhase = true;
                        ud.bossAreaKey = areaKey;
                    }
                } else {
                    // No galaxy / no boss system — fall back to the old
                    // behaviour so the path can still complete.
                    ud.missionComplete = true;
                    mat.color.copy(MISSION_COMPLETE_COLOR);
                    if (path.particles && path.particles.material) {
                        path.particles.material.color.copy(MISSION_COMPLETE_COLOR);
                    }
                }
            }
            // PHASE 2 — boss phase: wait for THAT boss to be destroyed.
            // Only then mark the mission complete, recolour the line,
            // and pay out the reward + notification.
            else if (ud.bossPhase && !wasComplete) {
                const ab = (typeof bossSystem !== 'undefined' && bossSystem.areaBosses)
                    ? bossSystem.areaBosses[ud.bossAreaKey] : null;
                const bossDead = ab && ab.spawned && ab.defeated;
                if (bossDead) {
                    ud.missionComplete = true;
                    ud.bossPhase = false;
                    mat.color.copy(MISSION_COMPLETE_COLOR);
                    if (path.particles && path.particles.material) {
                        path.particles.material.color.copy(MISSION_COMPLETE_COLOR);
                    }
                    if (typeof showAchievement === 'function') {
                        showAchievement('Mission Complete!', 'Boss eliminated — the dotted-line objective is cleared.', true);
                    }
                    if (typeof awardReputation === 'function') {
                        awardReputation(25, 'Dotted-line mission cleared');
                    }
                    if (typeof gameState !== 'undefined') {
                        gameState.maxEnergy = (gameState.maxEnergy || 100) + 5;
                        gameState.energy = Math.min(gameState.maxEnergy, (gameState.energy || 0) + 25);
                    }
                    // Trigger the wingman victory celebration swarm.
                    if (typeof triggerWingmanCelebration === 'function') {
                        triggerWingmanCelebration();
                    }
                }
            } else if (alive && wasComplete) {
                ud.missionComplete = false;
                const orig = path.originalColor || ud.originalColor;
                if (orig !== undefined) {
                    mat.color.set(orig);
                    if (path.particles && path.particles.material) {
                        path.particles.material.color.set(orig);
                    }
                }
            }
        }
    }
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
