// Game Controls - Input handling, weapon systems, enemy behavior, sound, bosses, and tutorial
// ENHANCED: Advanced Combat System with Directional Damage, Enhanced Enemy AI, and Progressive Difficulty
// CLEANED: Removed stub functions, duplicate gameState, competing initialization
// RESTORED: Working audio system, UI buttons, mouse crosshair, tutorial from game-controls13.js

// Active lasers array - tracks beams that move with the ship.
// Hard-capped at 30 entries; oldest are evicted when full so the
// array can't grow unbounded during long demo sessions.
const activeLasers = [];
const LASER_ARRAY_CAP = 30;

// Pooled vectors for per-frame enemy behaviour — avoids 1000s of
// throwaway Vector3 allocations per second with 100+ enemies.
const _ebV1 = new THREE.Vector3();
const _ebV2 = new THREE.Vector3();
const _ebV3 = new THREE.Vector3();

// Global key state
const keys = {
  w: false, a: false, s: false, d: false,
  q: false, e: false, enter: false, o: false,
  shift: false, alt: false, space: false, capsLock: false,
  up: false, down: false, left: false, right: false,
  x: false, b: false, z: false
};

// Double-tap detection for W key (short energy-based boost)
const doubleTapState = {
  lastWTap: 0,
  doubleTapThreshold: 300 // ms
};

// Enhanced Audio System with Eerie Space Music (RESTORED from game-controls13.js)
let audioContext;
let masterGain;
let musicGain;
let effectsGain;

// Music system (RESTORED)
const musicSystem = {
    enabled: true,
    backgroundMusic: null,
    battleMusic: null,
    inBattle: false,
    fadeInterval: null
};

// Audio cooldown system to prevent spam
const audioCooldowns = {
    hostileContact: 0,
    targetAcquired: 0,
    achievement: 0,
    boss: 0
};

// FIX 1: Add the missing adjustMinimumSpeed function HERE
function adjustMinimumSpeed(speed) {
    if (typeof gameState !== 'undefined' && gameState.minVelocity !== undefined) {
        gameState.minVelocity = speed;
        console.log('Minimum speed adjusted to:', speed);
    }
}

// =============================================================================
// EXPLOSION MANAGER - Centralized explosion animation system
// =============================================================================
// Replaces setInterval-based explosions with game-loop integrated animations
// Fixes memory leaks, performance issues, and timing inconsistencies

const explosionManager = {
    activeExplosions: [],

    // Add a new explosion to be animated
    addExplosion(explosionData) {
        this.activeExplosions.push(explosionData);
    },

    // Update all active explosions (called from game loop)
    update(deltaTime = 16.67) {
        for (let i = this.activeExplosions.length - 1; i >= 0; i--) {
            const explosion = this.activeExplosions[i];

            // Update explosion based on type
            if (explosion.update) {
                const stillActive = explosion.update(deltaTime);

                // Remove completed explosions
                if (!stillActive) {
                    if (explosion.cleanup) {
                        explosion.cleanup();
                    }
                    this.activeExplosions.splice(i, 1);
                }
            }
        }
    },

    // Clear all explosions (for cleanup or game reset)
    clearAll() {
        this.activeExplosions.forEach(explosion => {
            if (explosion.cleanup) {
                explosion.cleanup();
            }
        });
        this.activeExplosions = [];
    }
};

// =============================================================================
// ENHANCED ENEMY AI BEHAVIORS
// =============================================================================

// UPDATED: Pursuit behavior
// Helper: Add smooth rotation to enemy based on movement trajectory
// (Enemy barrel-roll system removed — it was making distant hostiles
// scramble too often and was less important than just having them
// swarm the player. applyEnemyRotation now only banks/pitches with
// the flight path; no Z-spin overlay.)

// =============================================================================
// SHIP THRUSTER GLOW (enemies + wingmen)
// Attaches two additive-blended cones to the rear of a ship the first
// time it thrusts, then fades them in/out per-frame based on whether
// the ship is currently accelerating. Mirrors the player's exhaust look
// (orange-yellow inner + deeper orange outer) so combat reads as a
// proper ballet of thruster trails.
// =============================================================================
function _ensureShipThrusterCones(ship, color) {
    if (!ship || ship.userData._thrusters) return;
    if (typeof THREE === 'undefined') return;
    // Don't measure mid-materialization (hull is at 12% scale; cones baked
    // now would be permanently undersized). Retried every tick.
    if (ship.userData._materializing) return;

    // Cone size & placement are derived from the model's ACTUAL visible
    // world bounding box, NOT from scale buckets — those broke the
    // moment enemy/boss scale changed (e.g. halving 96→48). This is
    // fully scale-agnostic: it works at any ship scale (48, 72, 96, 1
    // wingmen, the Vulcan wrapper, etc.).
    //
    // The box is built MANUALLY over real hull meshes only, skipping
    // the invisible 40u collision-hitbox sphere, the additive glow
    // layers, and any previously-attached cones — Box3.setFromObject
    // would otherwise be dominated by the giant hitbox and place the
    // cones far off the model.
    const worldScale = new THREE.Vector3();
    try { ship.getWorldScale(worldScale); } catch (e) { worldScale.set(1,1,1); }
    const sx = Math.max(0.001, Math.abs(worldScale.x || 1));
    const sz = Math.max(0.001, Math.abs(worldScale.z || 1));

    let coneLen = null, coneRad = null, localBack = null;
    try {
        ship.updateWorldMatrix(true, true);
        const _box = new THREE.Box3();
        _box.makeEmpty();
        const _mb = new THREE.Box3();
        let any = false;
        ship.traverse(node => {
            if (!node.isMesh || !node.geometry) return;
            const ud = node.userData || {};
            if (ud.isHitbox || ud.isGlowLayer || ud._isThrusterCone) return;
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            if (!node.geometry.boundingBox) return;
            _mb.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
            _box.union(_mb);
            any = true;
        });
        if (any && isFinite(_box.min.x) && _box.max.x > _box.min.x) {
            const size = _box.getSize(new THREE.Vector3());
            const worldLen = Math.max(size.x, size.y, size.z);
            // Guard against the not-yet-loaded case: _makeWingman (and the
            // enemy builders) fall back to a tiny ~16u placeholder mesh when
            // the GLB isn't cached yet. Measuring that bakes permanent
            // micro-cones (invisible). The old guard required >40u, but the
            // 50%-enemy-scale change left REAL GLB hulls at ~12-16u world
            // (Enemy*.glb natives are ~0.3u × scale 48), so the guard
            // rejected every standard enemy and cones silently vanished.
            // GLB ships are Groups / multi-child, placeholders are a single
            // Mesh + glow child — use structure + a lower floor instead.
            const _isGLBStruct = ship.isGroup || (ship.children && ship.children.length > 1);
            if (worldLen > 40 || (_isGLBStruct && worldLen > 8)) {
                const wpos = ship.getWorldPosition(new THREE.Vector3());
                // Rear of the hull behind ship centre, WORLD units →
                // converted to the ship's LOCAL frame (cone is a child).
                // +Z-nosed models (Enemy1/Enemy8) are now corrected at
                // model build time (_applyNoseFlip in game-models.js), so
                // the uniform +Z rear mount is right for every ship again.
                ship.userData._thrusterApexSign = 1;
                localBack = (_box.max.z - wpos.z) / sz;
                // Cone ≈ 22% of the visible ship length, base ≈ 6% — with
                // absolute floors (5u / 1.4u world) so the small 12-16u
                // hulls still get a readable plume instead of a 3u speck.
                coneLen = Math.max(worldLen * 0.22, 5) / sx;
                coneRad = Math.max(worldLen * 0.06, 1.4) / sx;
            }
        }
    } catch (e) {}
    // Not hydrated yet (no hull meshes / too small) — bail; this runs every
    // frame so it retries next tick. The _thrusters early-out means once
    // attached we never re-measure, so we must wait for a real size first.
    if (coneLen === null || localBack === null ||
        !isFinite(localBack) || !isFinite(coneLen)) return;

    const innerCol = color || 0xffaa00;
    const outerCol = (color === 0x00ff88) ? 0x00aa55
                  : (color === 0x88aaff) ? 0x4466cc
                  : 0xff5500;

    function _makeCone(rad, len, col, zOff) {
        const geo = new THREE.ConeGeometry(rad, len, 10);
        const mat = new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const cone = new THREE.Mesh(geo, mat);
        // Cone's default apex is +Y. Rotate so apex points along the
        // ship's rear axis (+Z for the standard -Z-forward models,
        // -Z for the flipped Vulcan Enemy8.glb — see _thrusterApexSign).
        cone.rotation.x = (ship.userData._thrusterApexSign || 1) * Math.PI / 2;
        cone.position.set(0, 0, zOff);
        // Frustum-cull cones: when the ship is off-screen the cones are
        // invisible anyway, so skip the additive overdraw. (Was false —
        // pure cost for off-screen enemies in big battles.)
        cone.frustumCulled = true;
        cone.renderOrder = 80;
        cone.userData._isThrusterCone = true; // excluded from hull box
        return { mesh: cone, mat: mat, geo: geo };
    }

    // Two side-by-side engine plumes. Anchor the cone BASE at the
    // model's actual rear edge (localBack), then push it forward by
    // coneLen/2 so the center sits at the base + apex protrudes
    // behind. The cone is now glued to the ship instead of floating
    // off the assumed half-length back.
    const _apex = ship.userData._thrusterApexSign || 1;
    const back = localBack + _apex * coneLen * 0.5;
    const cones = [];
    const sideOff = coneRad * 1.2;
    [-sideOff, sideOff].forEach(xOff => {
        const inner = _makeCone(coneRad * 0.55, coneLen,        innerCol, back);
        inner.mesh.position.x = xOff;
        ship.add(inner.mesh);
        cones.push(inner);
        const outer = _makeCone(coneRad * 0.85, coneLen * 1.3,  outerCol, back + _apex * coneLen * 0.15);
        outer.mesh.position.x = xOff;
        ship.add(outer.mesh);
        cones.push(outer);
    });
    ship.userData._thrusters = cones;
    ship.userData._thrusterIntensity = 0;
}

function _updateShipThrusterCones(ship, thrusting) {
    if (!ship || !ship.userData || !ship.userData._thrusters) return;
    const target = thrusting ? 1.0 : 0.0;
    const cur = ship.userData._thrusterIntensity || 0;
    const speed = thrusting ? 0.22 : 0.15;
    const next = cur + (target - cur) * speed;
    ship.userData._thrusterIntensity = next;
    const flicker = thrusting ? (0.85 + Math.sin(Date.now() * 0.04 + (ship.id || 0)) * 0.15) : 1.0;
    const cones = ship.userData._thrusters;
    for (let i = 0; i < cones.length; i++) {
        const c = cones[i];
        // Inner core (i even) and outer halo (i odd). 0.85 / 0.45 so the
        // plume clearly reads on the smaller wingmen and far enemies.
        // Additive blending still keeps formation-stacked cones from
        // saturating to white — each cone tops out under 1.0 alpha.
        const base = (i % 2 === 0) ? 0.85 : 0.45;
        c.mat.opacity = next * base * flicker;
        // Almost no bloom — keep cones a tight engine flame.
        const sX = 0.9 + next * 0.15;
        const sY = 0.8 + next * 0.35;
        const sZ = 0.9 + next * 0.15;
        c.mesh.scale.set(sX, sY, sZ);
    }
}
function applyEnemyRotation(enemy, direction, speed) {    if (!enemy || !direction) return;

    try {
        // Skip if not moving enough
        const movementMagnitude = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
        if (movementMagnitude < 0.01) return;  // Increased threshold to reduce twitching

        // Initialize rotation tracking if not exists
        if (!enemy.userData.targetRotation) {
            enemy.userData.targetRotation = {x: 0, y: 0, z: 0};
        }
        if (!enemy.userData.tumbleRate) {
            enemy.userData.tumbleRate = (Math.random() - 0.5) * 0.05;  // Reduced tumble (was 0.1)
        }

        // Calculate target rotation to face movement direction (trajectory)
        const lateralSpeed = Math.sqrt(direction.x * direction.x + direction.z * direction.z);

        if (lateralSpeed > 0.01) {  // Only update yaw if moving laterally
            // Yaw: Face the direction of horizontal movement
            const targetYaw = Math.atan2(direction.x, direction.z);

            // Store previous target for smoothing
            if (!enemy.userData.prevTargetYaw) {
                enemy.userData.prevTargetYaw = targetYaw;
            }

            // Smooth the target yaw to reduce twitching
            enemy.userData.prevTargetYaw = THREE.MathUtils.lerp(enemy.userData.prevTargetYaw, targetYaw, 0.1);
            enemy.userData.targetRotation.y = enemy.userData.prevTargetYaw;
        }

        // ENHANCED: Pitch based on vertical movement AND turns (more dynamic)
        if (lateralSpeed > 0.01) {
            // Base pitch from vertical movement
            const verticalPitch = -Math.atan2(direction.y, lateralSpeed) * 0.3;  // Increased from 0.15 to 0.3

            // Additional pitch during turns for more dynamic movement
            const currentYaw = enemy.rotation.y || 0;
            const yawDelta = enemy.userData.targetRotation.y - currentYaw;
            const normalizedYawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
            const turnPitch = Math.abs(normalizedYawDelta) * 0.4;  // Pitch up during sharp turns

            enemy.userData.targetRotation.x = verticalPitch + turnPitch;
        }

        // Bank: Roll into turns based on change in yaw (more pronounced)
        const currentYaw = enemy.rotation.y || 0;
        const yawDelta = enemy.userData.targetRotation.y - currentYaw;
        const normalizedYawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
        enemy.userData.targetRotation.z = normalizedYawDelta * 0.25;  // Increased from 0.1 to 0.25 for more visible banking

        // Add very slow tumble for variety
        enemy.userData.targetRotation.z += Math.sin(Date.now() * 0.00005 + (enemy.userData.tumbleSeed || 0)) * enemy.userData.tumbleRate;

        // ENHANCED: Track angular velocity (turn rate) for accuracy reduction
        // Calculate how fast the enemy is turning (radians per frame)
        const previousYaw = enemy.userData.previousYaw || currentYaw;
        const actualYawDelta = currentYaw - previousYaw;
        const turnRate = Math.abs(actualYawDelta);  // Radians per frame

        // Store for next frame and for firing accuracy calculation
        enemy.userData.previousYaw = currentYaw;
        enemy.userData.turnRate = turnRate;

        // Cap maximum turn rate (0.15 radians/frame ≈ 8.6 degrees/frame ≈ 516 degrees/second at 60fps)
        const maxTurnRate = 0.15;  // Radians per frame
        let lerpFactor = 0.03;  // Base lerp speed

        // If turning too fast, reduce lerp to cap turn rate
        if (Math.abs(normalizedYawDelta) > maxTurnRate) {
            lerpFactor = maxTurnRate / Math.abs(normalizedYawDelta);
        }

        // SMOOTH interpolation to target rotation with turn rate limiting
        if (!enemy.rotation) enemy.rotation = new THREE.Euler();

        enemy.rotation.x = THREE.MathUtils.lerp(enemy.rotation.x || 0, enemy.userData.targetRotation.x, lerpFactor);
        enemy.rotation.y = THREE.MathUtils.lerp(enemy.rotation.y || 0, enemy.userData.targetRotation.y, lerpFactor);
        enemy.rotation.z = THREE.MathUtils.lerp(enemy.rotation.z || 0, enemy.userData.targetRotation.z, lerpFactor);
    } catch (e) {
        // Ignore rotation errors
    }
}

function updatePursuitBehavior(enemy, playerPos, speed, distance) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }

    try {
        // Initialize velocity if not present (inertia-based movement)
        if (!enemy.userData.velocity) {
            enemy.userData.velocity = new THREE.Vector3(0, 0, 0);
        }
        if (!enemy.userData.facing) {
            enemy.userData.facing = new THREE.Vector3(0, 0, 1);
        }
        
        // Physics constants — aggressive forward thrust profile. Pursuit
        // ships used to plod; now they reach top speed quickly and turn
        // crisply so dogfights have real motion. Barrel rolls (when they
        // happen) layer on top of this without replacing forward thrust.
        const maxSpeed = speed * 4.0;       // was 3.0
        const acceleration = speed * 0.20;  // was 0.14
        const turnRate = 0.05;
        const drag = 0.99;                  // lighter drag — bumps land
        
        _ebV1.subVectors(playerPos, enemy.position).normalize();

        const angleDiff = enemy.userData.facing.angleTo(_ebV1);
        
        if (angleDiff > 0.01) {
            const turnAmount = Math.min(turnRate, angleDiff);
            enemy.userData.facing.lerp(_ebV1, turnAmount / angleDiff);
            enemy.userData.facing.normalize();
        }
        
        // Acceleration bursts
        if (enemy.userData.nextAccelBurst === undefined) {
            enemy.userData.nextAccelBurst = Date.now() + 2000 + Math.random() * 3000;
        }
        const now = Date.now();
        if (now > enemy.userData.nextAccelBurst && !enemy.userData.accelBurstActive) {
            enemy.userData.accelBurstActive = true;
            enemy.userData.accelBurstEnd = now + 800 + Math.random() * 700;
            enemy.userData.nextAccelBurst = now + 3000 + Math.random() * 4000;
        }
        
        let thrustPower = acceleration;
        if (enemy.userData.accelBurstActive) {
            thrustPower *= 1.8;
            if (now > enemy.userData.accelBurstEnd) {
                enemy.userData.accelBurstActive = false;
            }
        }
        
        _ebV2.copy(enemy.userData.facing).multiplyScalar(thrustPower);
        enemy.userData.velocity.add(_ebV2);

        // (Side-thrust evasion was removed with the barrel-roll system —
        // enemies now focus on tracking/swarming instead.)

        // Clamp to max speed
        if (enemy.userData.velocity.length() > maxSpeed) {
            enemy.userData.velocity.setLength(maxSpeed);
        }

        // Apply drag
        enemy.userData.velocity.multiplyScalar(drag);

        // Update position based on velocity
        enemy.position.add(enemy.userData.velocity);

        // Rotate enemy to face direction of travel (not instant)
        applyEnemyRotation(enemy, enemy.userData.facing, speed);

        if (distance < 150) {
            const orbitAngle = Date.now() * 0.0015 + (enemy.userData.circlePhase || 0);
            _ebV1.set(
                Math.cos(orbitAngle) * 100,
                Math.sin(orbitAngle * 0.5) * 30,
                Math.sin(orbitAngle) * 100
            );
            _ebV2.copy(playerPos).add(_ebV1);
            _ebV3.subVectors(_ebV2, enemy.position).normalize();
            enemy.userData.facing.lerp(_ebV3, turnRate * 2);
            enemy.userData.facing.normalize();
        }
    } catch (e) {
        // Ignore movement errors if positions are invalid
    }
}

// Swarm behavior with inertia physics
function updateSwarmBehavior(enemy, playerPos, speed, time) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }
    
    try {
        // Initialize velocity if not present
        if (!enemy.userData.velocity) {
            enemy.userData.velocity = new THREE.Vector3(0, 0, 0);
        }
        if (!enemy.userData.facing) {
            enemy.userData.facing = new THREE.Vector3(0, 0, 1);
        }
        
        const maxSpeed = speed * 3.5;        // was 2.6
        const acceleration = speed * 0.18;   // was 0.12
        const turnRate = 0.06;
        const drag = 0.985;                  // was 0.98

        // Spiraling approach from multiple angles
        const swarmAngle = time * 0.5 + (enemy.userData.circlePhase || 0);
        const spiralRadius = 120 + Math.sin(time * 0.3) * 40;

        const targetX = playerPos.x + Math.cos(swarmAngle) * spiralRadius;
        const targetZ = playerPos.z + Math.sin(swarmAngle) * spiralRadius;
        const targetY = playerPos.y + Math.sin(time * 0.2) * 30;

        _ebV1.set(targetX, targetY, targetZ);
        _ebV2.subVectors(_ebV1, enemy.position).normalize();

        enemy.userData.facing.lerp(_ebV2, turnRate);
        enemy.userData.facing.normalize();

        _ebV3.copy(enemy.userData.facing).multiplyScalar(acceleration);
        enemy.userData.velocity.add(_ebV3);

        // Clamp and drag
        if (enemy.userData.velocity.length() > maxSpeed) {
            enemy.userData.velocity.setLength(maxSpeed);
        }
        enemy.userData.velocity.multiplyScalar(drag);

        // Apply velocity
        enemy.position.add(enemy.userData.velocity);
        applyEnemyRotation(enemy, enemy.userData.facing, speed);
    } catch (e) {
        // Ignore movement errors
    }
}

// NEW: Evasion behavior
function updateEvasionBehavior(enemy, playerPos, speed, time) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }

    try {
        _ebV1.subVectors(enemy.position, playerPos).normalize();
        _ebV2.set(-_ebV1.z, _ebV1.y, _ebV1.x);

        // Boosted side-strafe + a sinusoid wobble so the evade mode
        // actually rips sideways at speed rather than oscillating
        // in place.
        const oscillation = Math.sin(time * 2 + (enemy.userData.circlePhase || 0)) * 0.5;
        _ebV2.multiplyScalar(speed * 1.6 * (1 + oscillation));

        enemy.position.add(_ebV2);
        // Dedicated 'evade' mode now just steers sideways relative to the
        // player — the barrel-roll system that used to layer on top of
        // this has been removed in favour of letting low-HP enemies
        // commit to evading or swarming without spinning out.
        applyEnemyRotation(enemy, _ebV2, speed);
    } catch (e) {
        // Ignore movement errors
    }
}

// FORMATION PATROL — used for inactive local hostiles (Martian Pirates,
// Vulcan Patrols). Two effects:
//   • Each ship's patrolCenter drifts slowly through space, so the
//     whole group is always moving forward rather than camped on a
//     fixed point. The drift direction is shared by every ship that
//     started life in the same group (matching patrolCenter values
//     coming out of createEnemies3D), so the formation stays together.
//   • Each ship orbits its (drifting) patrolCenter at a tight radius,
//     turning to face the direction of travel so jet cones light up
//     out the back.
function _updateLocalFormationPatrol(enemy) {
    if (!enemy || !enemy.userData || typeof THREE === 'undefined') return;
    const ud = enemy.userData;
    if (!ud.patrolCenter) ud.patrolCenter = enemy.position.clone();

    // Lazy-init a stable drift heading per group. Hashing the rounded
    // patrolCenter coordinates means every ship in the same starting
    // group derives the same heading, so they fly the same way without
    // needing an explicit group id.
    if (!ud.formationHeading) {
        const key = Math.round(ud.patrolCenter.x / 50) + ':' +
                    Math.round(ud.patrolCenter.y / 50) + ':' +
                    Math.round(ud.patrolCenter.z / 50);
        let h = 0;
        for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
        const ang = (h % 1000) / 1000 * Math.PI * 2;
        const vy  = (((h >> 10) % 1000) / 1000 - 0.5) * 0.25;
        ud.formationHeading = new THREE.Vector3(Math.cos(ang), vy, Math.sin(ang)).normalize();
        ud.formationSpeed = 0.35 + (((h >> 20) % 100) / 100) * 0.25; // 0.35-0.60 u/frame
    }

    // Drift the patrol center along the formation heading. We also
    // add a slow sine wave so the route bends rather than running in
    // a perfectly straight line.
    const t = Date.now() * 0.0003;
    const heading = ud.formationHeading;
    ud.patrolCenter.x += heading.x * ud.formationSpeed;
    ud.patrolCenter.y += heading.y * ud.formationSpeed + Math.sin(t * 0.7) * 0.2;
    ud.patrolCenter.z += heading.z * ud.formationSpeed;

    // Orbit the (moving) patrol center at a small radius so wingmates
    // stay tight to one another. circlePhase distributes them around
    // the ring.
    const phase = ud.circlePhase || 0;
    const r = 80;
    const angle = t * 4 + phase;
    const targetX = ud.patrolCenter.x + Math.cos(angle) * r + heading.x * 60;
    const targetY = ud.patrolCenter.y + Math.sin(angle * 0.6) * 12;
    const targetZ = ud.patrolCenter.z + Math.sin(angle) * r + heading.z * 60;

    // Velocity-based motion so the thruster check (which reads
    // userData.velocity) lights up the cones.
    if (!ud.velocity) ud.velocity = new THREE.Vector3();
    const desired = new THREE.Vector3(
        targetX - enemy.position.x,
        targetY - enemy.position.y,
        targetZ - enemy.position.z
    );
    const dlen = desired.length();
    if (dlen > 0.001) desired.divideScalar(dlen);
    ud.velocity.lerp(desired.multiplyScalar(0.6), 0.18);
    enemy.position.add(ud.velocity);

    if (typeof applyEnemyRotation === 'function') {
        applyEnemyRotation(enemy, ud.velocity, ud.velocity.length());
    }
}

// NEW: Flanking behavior
function updateFlankingBehavior(enemy, playerPos, speed, time) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }

    try {
        // Try to get behind or to the side of the player
        const flankAngle = (enemy.userData.circlePhase || 0) + Math.PI;
        const flankRadius = 150;

        const targetX = playerPos.x + Math.cos(flankAngle) * flankRadius;
        const targetZ = playerPos.z + Math.sin(flankAngle) * flankRadius;
        const targetY = playerPos.y;

        _ebV1.set(targetX, targetY, targetZ);
        _ebV2.subVectors(_ebV1, enemy.position).normalize();
        enemy.position.add(_ebV2.multiplyScalar(speed * 0.7));
        applyEnemyRotation(enemy, _ebV2, speed * 0.7);  // Add rotation
    } catch (e) {
        // Ignore movement errors
    }
}

// NEW: Engagement behavior
function updateEngagementBehavior(enemy, playerPos, speed, time) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }

    try {
        // Maintain optimal attack distance. Per-frame position deltas
        // here used to be tiny (raw speed, no inertia, no multiplier) so
        // precision-style factions (Vulcans) appeared to crawl. Bumped
        // approach/back-off/orbit speeds 3-4x so they actually keep up
        // with the player while holding the engagement bracket.
        const optimalDistance = 100;
        const currentDistance = enemy.position.distanceTo(playerPos);

        if (currentDistance > optimalDistance + 20) {
            _ebV1.subVectors(playerPos, enemy.position).normalize();
            enemy.position.add(_ebV1.multiplyScalar(speed * 4.0));
            applyEnemyRotation(enemy, _ebV1, speed * 4.0);
        } else if (currentDistance < optimalDistance - 20) {
            _ebV1.subVectors(enemy.position, playerPos).normalize();
            enemy.position.add(_ebV1.multiplyScalar(speed * 2.0));
            applyEnemyRotation(enemy, _ebV1, speed * 2.0);
        } else {
            const angle = time * 0.5;
            _ebV1.set(Math.cos(angle) * 10, 0, Math.sin(angle) * 10);
            enemy.position.add(_ebV1.multiplyScalar(speed * 1.2));
            applyEnemyRotation(enemy, _ebV1, speed * 1.2);
        }
    } catch (e) {
        // Ignore movement errors
    }
}

// NEW: Enhanced patrol behavior for enemies
function updatePatrolBehavior(enemy, playerPos, speed, time) {
    // Safety checks
    if (!enemy || !enemy.userData || typeof THREE === 'undefined') {
        return;
    }
    
    try {
        if (!enemy.userData.patrolCenter) {
            enemy.userData.patrolCenter = enemy.position.clone();
            enemy.userData.patrolRadius = 200 + Math.random() * 300;
        }
        
        const angle = time * 0.2 + (enemy.userData.circlePhase || 0);
        const targetX = enemy.userData.patrolCenter.x + Math.cos(angle) * enemy.userData.patrolRadius;
        const targetZ = enemy.userData.patrolCenter.z + Math.sin(angle) * enemy.userData.patrolRadius;
        const targetY = enemy.userData.patrolCenter.y + Math.sin(angle * 0.3) * 50;
        
        _ebV1.set(targetX, targetY, targetZ);
        _ebV2.subVectors(_ebV1, enemy.position).normalize();

        enemy.position.add(_ebV2.multiplyScalar(speed * 0.6));
        applyEnemyRotation(enemy, direction, speed * 0.6);  // Add rotation
    } catch (e) {
        // Ignore movement errors
    }
}

// =============================================================================
// PROGRESSIVE DIFFICULTY SYSTEM
// =============================================================================

function calculateDifficultySettings() {
    const galaxiesCleared = (typeof gameState !== 'undefined' && gameState.galaxiesCleared) ? gameState.galaxiesCleared : 0;

    // Scale active enemy count with the player's wingmen count so the fight
    // stays meaningful as allies are recruited. Each living wingman adds
    // 2 active local attackers and 2 active distant attackers.
    let aliveWingmen = 0;
    if (typeof allyShips !== 'undefined') {
        aliveWingmen = allyShips.filter(a => a && a.userData && a.userData.health > 0).length;
    }
    const wingmanLocalBonus = aliveWingmen * 2;
    const wingmanDistantBonus = aliveWingmen * 2;

    const baseSettings = {
        // Local galaxy settings (progressive difficulty)
        // 4 base + 2 per wingman → 8 active at game start with 2 wingmen
        // (matches the 4 Martian + 4 Vulcan opening scenario the player wanted)
        maxLocalAttackers: Math.min(4 + galaxiesCleared + wingmanLocalBonus, 16),
        localSpeedMultiplier: 1.0 + (galaxiesCleared * 0.05), // Full speed from the start
        localHealthMultiplier: galaxiesCleared === 0 ? 1 : Math.min(1 + galaxiesCleared * 0.25, 3),
        localDetectionRange: 3500 + (galaxiesCleared * 300),
        localFiringRange: 350 + (galaxiesCleared * 25),  // Was 150 — far too close, enemies couldn't fire
        localAttackCooldown: Math.max(600, 1200 - (galaxiesCleared * 100)),

        // Distant galaxy settings (always challenging) - MAX 3 HITS
        // 8 base + galaxiesCleared + 2 per wingman, capped at 22 (fights stay
        // tractable but feel proportionate to the player's fleet size).
        maxDistantAttackers: Math.min(8 + galaxiesCleared + wingmanDistantBonus, 22),
        distantSpeedMultiplier: 1.0 + (galaxiesCleared * 0.08),  // Faster enemies
        distantHealthMultiplier: Math.min(2 + galaxiesCleared * 0.125, 3), // MAX 3 hits
        distantDetectionRange: 5000 + (galaxiesCleared * 200),  // Long detection for pursuit
        distantFiringRange: 200 + (galaxiesCleared * 30),  // Must get close to fire
        distantAttackCooldown: Math.max(800, 1200 - (galaxiesCleared * 50)),

        // General settings
        galaxiesCleared: galaxiesCleared,
        aliveWingmen: aliveWingmen,
        difficultyLevel: Math.min(Math.floor(galaxiesCleared / 2), 4) // 0-4 difficulty levels
    };

    return baseSettings;
}

function getEnemyHealthForDifficulty(isLocal, isBoss, isBossSupport) {
    const galaxiesCleared = (typeof gameState !== 'undefined' && gameState.galaxiesCleared) ? gameState.galaxiesCleared : 0;
    
    if (isBoss) {
        // Boss health: 3 hits maximum
        return 3;
    } else if (isBossSupport) {
        // Boss support health: 2-3 hits
        return Math.min(2 + Math.floor(galaxiesCleared / 3), 3);
    } else if (isLocal) {
        // Local enemy health: 1-3 hits
        if (galaxiesCleared === 0) return 1; // Tutorial level
        return Math.min(1 + Math.floor(galaxiesCleared / 3), 3);
    } else {
        // Distant enemy health: 2-3 hits
        return Math.min(2 + Math.floor(galaxiesCleared / 4), 3);
    }
}

function refreshEnemyDifficulty() {
    // Safety check for enemies array
    if (typeof enemies === 'undefined') return;
    
    const difficultySettings = calculateDifficultySettings();
    
    // Update all existing enemies
    // PERFORMANCE: Limit active enemies based on distance and performance mode
const maxActiveEnemies = gameState.performanceMode === 'minimal' ? 3 :
                         gameState.performanceMode === 'optimized' ? 5 : 8;

// OPTIMIZED: Filter using squared distance (no sqrt), then cache distances for sorting
const camPos = camera.position;
const maxDistSquared = 3000 * 3000;
const enemyDistances = new Map();

const nearbyEnemiesUnsorted = enemies.filter(enemy => {
    if (enemy.userData.health <= 0) return false;

    // Calculate squared distance (avoids expensive sqrt)
    const dx = enemy.position.x - camPos.x;
    const dy = enemy.position.y - camPos.y;
    const dz = enemy.position.z - camPos.z;
    const distSq = dx*dx + dy*dy + dz*dz;

    if (distSq < maxDistSquared) {
        // Cache the actual distance for sorting (only calculate sqrt once per enemy)
        enemyDistances.set(enemy, Math.sqrt(distSq));
        return true;
    }
    return false;
});

const nearbyEnemies = nearbyEnemiesUnsorted.sort((a, b) => {
    // Prioritize: 1) Bosses, 2) Active enemies, 3) Closest enemies
    if (a.userData.isBoss && !b.userData.isBoss) return -1;
    if (!a.userData.isBoss && b.userData.isBoss) return 1;
    if (a.userData.isActive && !b.userData.isActive) return -1;
    if (!a.userData.isActive && b.userData.isActive) return 1;
    // Use cached distances instead of recalculating
    return enemyDistances.get(a) - enemyDistances.get(b);
}).slice(0, maxActiveEnemies);

// Process only the limited set of nearby enemies
nearbyEnemies.forEach(enemy => {
        if (!enemy.userData) return;
        
        const isLocal = enemy.userData.isLocal || false;
        const isBoss = enemy.userData.isBoss || false;
        const isBossSupport = enemy.userData.isBossSupport || false;
        
        // Update health but don't heal damaged enemies
        const newMaxHealth = getEnemyHealthForDifficulty(isLocal, isBoss, isBossSupport);
        const healthPercentage = enemy.userData.health / (enemy.userData.maxHealth || 1);
        
        enemy.userData.maxHealth = newMaxHealth;
        enemy.userData.health = Math.max(enemy.userData.health, newMaxHealth * healthPercentage);
    });
    
    console.log(`Difficulty refreshed: Galaxies cleared: ${(typeof gameState !== 'undefined' && gameState.galaxiesCleared) ? gameState.galaxiesCleared : 0}`);
}

// =============================================================================
// ENHANCED ENEMY BEHAVIOR SYSTEM
// =============================================================================

// ENHANCED: Enemy Behavior System with Progressive Difficulty and Tutorial Safety
// Per-target attacker cap. Up to 3 enemies may engage the player at a
// time, and up to 3 may engage each living wingman. Beyond that, the
// extras fall back to whichever target is closest — they still chase,
// they just don't push the per-target count above 3 if room exists
// elsewhere. Called once per frame from updateEnemyBehavior.
const _ENEMY_ATTACKERS_PER_TARGET = 3;

// Resolve a stored engagedTarget tag into a concrete position-bearing
// object. Player is stored as the string 'player' so the assignment is
// stable across frames (camera position is a single Vector3 that
// updates in place, not a reusable wrapper).
function _resolveEngagedTarget(tag) {
    if (!tag) return null;
    if (tag === 'player') {
        return (typeof camera !== 'undefined') ? camera : null;
    }
    // Wingman object — must still be alive
    if (tag.userData && tag.userData.health > 0) return tag;
    return null;
}

function _assignEngagementTargets() {
    if (typeof enemies === 'undefined') return;
    // Build target list: player first, then living wingmen.
    const targets = ['player'];
    if (typeof allyShips !== 'undefined') {
        for (let i = 0; i < allyShips.length; i++) {
            const w = allyShips[i];
            if (!w || !w.userData || w.userData.health <= 0) continue;
            targets.push(w);
        }
    }
    const counts = new Map();
    for (let i = 0; i < targets.length; i++) counts.set(targets[i], 0);

    // First pass: validate existing assignments and tally them.
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.userData || e.userData.health <= 0) continue;
        const tag = e.userData.engagedTarget;
        if (tag && counts.has(tag) && _resolveEngagedTarget(tag)) {
            const c = counts.get(tag);
            if (c < _ENEMY_ATTACKERS_PER_TARGET) {
                counts.set(tag, c + 1);
                continue; // keep this assignment
            }
        }
        // Existing target invalid / capped / gone — clear it.
        e.userData.engagedTarget = null;
    }

    // Second pass: any active enemy without a target picks the closest
    // under-capped target. If everyone's capped, fall back to closest.
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.userData || e.userData.health <= 0) continue;
        if (!e.userData.isActive) continue;
        if (e.userData.engagedTarget) continue;
        let best = null, bestDist = Infinity;
        for (let j = 0; j < targets.length; j++) {
            const t = targets[j];
            if ((counts.get(t) || 0) >= _ENEMY_ATTACKERS_PER_TARGET) continue;
            const tObj = _resolveEngagedTarget(t);
            if (!tObj || !tObj.position) continue;
            const d = e.position.distanceTo(tObj.position);
            if (d < bestDist) { bestDist = d; best = t; }
        }
        if (!best) {
            // All capped — fall back to absolute closest target.
            for (let j = 0; j < targets.length; j++) {
                const t = targets[j];
                const tObj = _resolveEngagedTarget(t);
                if (!tObj || !tObj.position) continue;
                const d = e.position.distanceTo(tObj.position);
                if (d < bestDist) { bestDist = d; best = t; }
            }
        }
        if (best) {
            e.userData.engagedTarget = best;
            counts.set(best, (counts.get(best) || 0) + 1);
        }
    }
}

// Resolve an enemy's current engagement target position. Falls back to
// the player when no assignment exists (e.g. enemy not yet active).
function _engagedTargetPos(enemy) {
    if (!enemy || !enemy.userData) {
        return (typeof camera !== 'undefined') ? camera.position : null;
    }
    const obj = _resolveEngagedTarget(enemy.userData.engagedTarget);
    if (obj && obj.position) return obj.position;
    return (typeof camera !== 'undefined') ? camera.position : null;
}

// Reusable temp vectors for enemy flight-hygiene (no per-frame GC).
const _fhA = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _fhB = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _fhC = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _fhD = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

// Hard keep-out from black-hole event-horizon warp zones, applied to
// enemies (and UFOs). The player warps when within criticalDistance =
// max(radius*2.5, 50) of a hole; enemies are clamped to that + a
// combat-range buffer so chasing a hostile toward a hole never pulls
// the player across the threshold. Position is projected back to the
// keep-out sphere and inward velocity is bled off.
const _bhAvoid = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
// Cached black-hole list (+ precomputed keep-out radius) so the
// avoidance check doesn't re-scan the whole planets array for every
// enemy every frame. Rebuilt at most every 2s — black holes are static.
let _bhCache = null, _bhCacheStamp = 0;
function _getBlackHoleAvoidList() {
    const now = Date.now();
    if (_bhCache && (now - _bhCacheStamp) < 2000) return _bhCache;
    _bhCache = [];
    if (typeof planets !== 'undefined') {
        for (let i = 0; i < planets.length; i++) {
            const p = planets[i];
            if (!p || !p.userData || p.userData.type !== 'blackhole' || !p.position) continue;
            const radius = (p.geometry && p.geometry.parameters && p.geometry.parameters.radius) || 50;
            _bhCache.push({ pos: p.position, keepOut: Math.max(radius * 2.5, 50) + 600 });
        }
    }
    _bhCacheStamp = now;
    return _bhCache;
}
function _enemyAvoidBlackHoles(enemy) {
    if (!_bhAvoid || !enemy || !enemy.position) return;
    const list = _getBlackHoleAvoidList();
    for (let i = 0; i < list.length; i++) {
        const bh = list[i];
        const keepOut = bh.keepOut;
        _bhAvoid.subVectors(enemy.position, bh.pos);
        const d = _bhAvoid.length();
        if (d > 0.001 && d < keepOut) {
            _bhAvoid.multiplyScalar(keepOut / d);              // out to the boundary
            enemy.position.copy(bh.pos).add(_bhAvoid);
            const ud = enemy.userData;
            if (ud && ud.velocity && ud.velocity.dot) {
                _bhAvoid.normalize();
                const inward = ud.velocity.dot(_bhAvoid);      // <0 means heading inward
                if (inward < 0) ud.velocity.addScaledVector(_bhAvoid, -inward);
            }
        }
    }
}
if (typeof window !== 'undefined') window._enemyAvoidBlackHoles = _enemyAvoidBlackHoles;

// Per-frame post-behavior pass for ACTIVE enemies. Two jobs:
//   1) Anti-cluster / always-in-flight: if the enemy barely moved this
//      frame (engage/hold modes park them on the player and they pile
//      up), glide it along its heading — or, lacking one, drift it
//      outward from the player — so it always reads as a ship in
//      motion instead of a hovering blob.
//   2) Camera-line clearance: keep the enemy out of the thin corridor
//      between the camera and the player's ship so hostiles don't
//      occlude the player model during 3rd-person combat.
function _enemyFlightHygiene(enemy, shipPos, camPos, playerPos, isLocal) {
    if (!enemy || !enemy.userData || !_fhA) return;
    const ud = enemy.userData;
    const pos = enemy.position;

    // ---- 1) Minimum flight speed ----
    if (!ud._prevPos) ud._prevPos = pos.clone();
    const moved = pos.distanceTo(ud._prevPos);
    // ~400 km/s local, ~520 km/s distant — enough to always look like
    // they're flying, not loitering.
    const MIN_STEP = isLocal ? 0.40 : 0.52;
    if (moved < MIN_STEP) {
        let haveDir = false;
        if (ud.velocity && ud.velocity.lengthSq() > 1e-5) {
            _fhA.copy(ud.velocity).normalize();
            haveDir = true;
        } else if (ud.facing && ud.facing.lengthSq && ud.facing.lengthSq() > 1e-5) {
            _fhA.copy(ud.facing).normalize();
            haveDir = true;
        }
        if (!haveDir) {
            // No heading — drift away from the player so the enemy
            // doesn't sit on top of the camera/ship.
            _fhA.subVectors(pos, playerPos);
            if (_fhA.lengthSq() < 1e-5) _fhA.set(1, 0, 0);
            _fhA.normalize();
        }
        pos.addScaledVector(_fhA, MIN_STEP - moved);
    }

    // ---- 2) Camera→ship sightline clearance ----
    if (camPos && shipPos) {
        _fhB.subVectors(shipPos, camPos);           // A=cam, B=ship, AB
        const abLen2 = _fhB.lengthSq();
        if (abLen2 > 1e-3) {
            _fhC.subVectors(pos, camPos);           // AP
            let t = _fhC.dot(_fhB) / abLen2;
            if (t > 0.04 && t < 1.20) {             // roughly in front of cam, near/just past ship
                t = Math.max(0, Math.min(1, t));
                _fhD.copy(camPos).addScaledVector(_fhB, t); // closest point on segment
                _fhA.subVectors(pos, _fhD);
                const d = _fhA.length();
                const CORRIDOR = 160;               // keep this clear of the ship sightline
                if (d < CORRIDOR) {
                    if (d < 0.001) {
                        // Dead on the line — shove sideways using world up × AB.
                        _fhA.set(0, 1, 0).cross(_fhB);
                        if (_fhA.lengthSq() < 1e-5) _fhA.set(1, 0, 0);
                    }
                    _fhA.normalize();
                    // Persistent but smooth: clear ~40% of the intrusion
                    // per frame so it slides off the sightline in a few
                    // frames without snapping.
                    pos.addScaledVector(_fhA, (CORRIDOR - d) * 0.4);
                }
            }
        }
    }

    ud._prevPos.copy(pos);
}

function updateEnemyBehavior() {
    // Safety checks
    if (typeof enemies === 'undefined' || typeof gameState === 'undefined' || typeof camera === 'undefined') {
        return;
    }

    if (gamePaused || !gameState.gameStarted || gameState.gameOver) {
        return;
    }
    
    // PERFORMANCE: Only process enemies every other frame
    if (gameState.frameCount % 2 !== 0) {
        return;
    }
    
    // NEW: Don't activate enemies until tutorial is complete (IMPROVED DETECTION)
    if (typeof tutorialSystem !== 'undefined' && tutorialSystem.active && !tutorialSystem.completed) {
        // Tutorial is still active - enemies should be passive
        enemies.forEach(enemy => {
            if (enemy.userData.health <= 0) return;
            enemy.userData.isActive = false;
            enemy.userData.attackMode = 'patrol';
            
            // Optional: Make enemies slowly patrol during tutorial
            if (enemy.userData.patrolCenter) {
                const time = Date.now() * 0.001;
                const patrolRadius = (enemy.userData.patrolRadius || 200) * 0.3;
                const angle = time * 0.1 + (enemy.userData.circlePhase || 0);
                
                const targetX = enemy.userData.patrolCenter.x + Math.cos(angle) * patrolRadius;
                const targetZ = enemy.userData.patrolCenter.z + Math.sin(angle) * patrolRadius;
                const targetY = enemy.userData.patrolCenter.y + Math.sin(angle * 0.5) * 20;
                
                const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
                const direction = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
                const tutorialSpeed = Math.max(0.2, (enemy.userData.speed || 0.5) * 0.5);  // Min 200 km/s even in tutorial
                enemy.position.add(direction.multiplyScalar(tutorialSpeed));
                applyEnemyRotation(enemy, direction, tutorialSpeed);  // Make ship face movement direction
            }
        });
        return; // Exit early - don't process combat logic during tutorial
    }
    
    // TUTORIAL COMPLETE: Normal enemy behavior now active
    if (typeof tutorialSystem !== 'undefined' && tutorialSystem.completed) {
        // Log once when tutorial is complete and enemies should activate
        const now = Date.now();
        if (!tutorialSystem.enemiesActivatedLogTime) {
            // Was: re-logged every 5s — silenced for console cleanliness.
            tutorialSystem.enemiesActivatedLogTime = now;
        }
    }
    
    // PROGRESSIVE DIFFICULTY: Calculate based on galaxies cleared
    const galaxiesCleared = gameState.galaxiesCleared || 0;
    const difficultySettings = calculateDifficultySettings(galaxiesCleared);

    // Up-to-3-attackers-per-target assignment runs once before per-enemy
    // behavior so each enemy can read enemy.userData.engagedTarget below.
    _assignEngagementTargets();

    // Boss homing missiles fly every behavior pass (30 Hz)
    if (typeof _updateBossMissiles === 'function') _updateBossMissiles();

    let nearbyEnemyCount = 0;
    let inCombatRange = false;
    let activeAttackers = 0;
    let localActiveAttackers = 0;

    // Count current active attackers
    enemies.forEach(enemy => {
        if (enemy.userData.health <= 0) return;
        if (enemy.userData.isActive) {
            activeAttackers++;
            if (isEnemyInLocalGalaxy(enemy)) {
                localActiveAttackers++;
            }
        }
    });

    // Precompute camera + player-ship world positions once for the
    // flight-hygiene pass. shipPos is only set when the 3rd-person
    // ship mesh is actually visible (so corridor clearance is skipped
    // in zero-offset / no-ship views where there's nothing to occlude).
    const _fhCam = (typeof camera !== 'undefined') ? camera.position : null;
    let _fhShip = null;
    try {
        const _cs = window.cameraState;
        const _ship = _cs && _cs.playerShipMesh;
        if (_ship && _ship.visible) {
            _fhShip = _ship.getWorldPosition(new THREE.Vector3());
            if (!isFinite(_fhShip.x)) _fhShip = null;
        }
    } catch (e) { _fhShip = null; }

    enemies.forEach(enemy => {
        if (enemy.userData.health <= 0) return;

        const playerPos = camera.position.clone();
        const distanceToPlayer = playerPos.distanceTo(enemy.position);
        const isLocal = isEnemyInLocalGalaxy(enemy);

        const detectionRange = isLocal ?
            (difficultySettings.localDetectionRange || 2000) :
            (enemy.userData.detectionRange || difficultySettings.distantDetectionRange || 3000);
        // Use the HIGHER of difficulty setting or enemy's own firingRange
        const firingRange = isLocal ?
            Math.max(difficultySettings.localFiringRange || 200, enemy.userData.firingRange || 0) :
            Math.max(enemy.userData.firingRange || 0, difficultySettings.distantFiringRange || 300);

        // Count nearby enemies
        if (distanceToPlayer < detectionRange) {
            nearbyEnemyCount++;
            if (distanceToPlayer < firingRange * 2) {
                inCombatRange = true;
            }
        }

        // PROGRESSIVE DIFFICULTY: Apply attacker limits — only N enemies
        // are active at once, the rest stay dormant.
        const maxAttackers = isLocal ? difficultySettings.maxLocalAttackers : difficultySettings.maxDistantAttackers;
        const currentAttackers = isLocal ? localActiveAttackers : activeAttackers;

        if (distanceToPlayer < detectionRange && !enemy.userData.isActive && currentAttackers < maxAttackers) {
            enemy.userData.isActive = true;
            enemy.userData.detectedPlayer = true;
            enemy.userData.lastSeenPlayerPos = playerPos.clone();
            // Stagger the opening shot. Warping into a distant black-hole
            // galaxy activates a whole batch of enemies on the SAME frame,
            // so spread their first shots across a wide ~1.6s window
            // instead of letting them all fire on frame one.
            enemy.userData.lastAttack = Date.now() - Math.random() * 1200;
            enemy.userData.nextFire = Date.now() + Math.random() * 1600;

            if (isLocal) localActiveAttackers++;
            else activeAttackers++;
        } else if (enemy.userData.isActive &&
                   (distanceToPlayer > detectionRange * 1.5 || currentAttackers > maxAttackers)) {
            enemy.userData.isActive = false;
            enemy.userData.detectedPlayer = false;
            if (isLocal) localActiveAttackers--;
            else activeAttackers--;
        }
        
        if (enemy.userData.isActive) {
            // FIXED: Enemy speeds 200-1000 km/s (0.2-1.0 game units, multiply by 1000 for km/s display)
            const baseSpeed = enemy.userData.speed || 0.5;
            const speedMultiplier = isLocal ? difficultySettings.localSpeedMultiplier : difficultySettings.distantSpeedMultiplier;
            const adjustedSpeed = Math.min(2.0, Math.max(0.2, baseSpeed * speedMultiplier));  // Clamp to 0.2-2.0 (200-2000 km/s)

            if (isLocal) {
                updateLocalEnemyBehavior(enemy, distanceToPlayer, adjustedSpeed, difficultySettings);
            } else {
                if (enemy.userData.isBoss) {
                    updateBossBehavior(enemy, playerPos, adjustedSpeed);
                } else if (enemy.userData.isBossSupport) {
                    updateSupportBehavior(enemy, playerPos, adjustedSpeed);
                } else {
                    updateEnhancedEnemyBehavior(enemy, distanceToPlayer, adjustedSpeed, difficultySettings);
                }
            }
        } else if (isLocal && (enemy.userData.isMartianPirate || enemy.userData.isVulcanPatrol)) {
            // Idle Pirates / Vulcans should ALWAYS be moving, not loitering.
            // Run a formation-flight patrol that slowly drifts the whole
            // group's patrol centre through space so they read as ships
            // on a route. Faster than the old tutorial-only patrol.
            _updateLocalFormationPatrol(enemy);
        }

        // Orange combat shield: only raised while the enemy is actively
        // engaging (isActive — it has detected and is targeting the
        // player or a wingman). Drops when it disengages.
        if (typeof _setEnemyShieldEngaged === 'function') {
            _setEnemyShieldEngaged(enemy, !!enemy.userData.isActive);
        }

        // Post-behavior flight hygiene for ACTIVE combatants: enforce a
        // minimum drift so they don't park/cluster on the player, and
        // keep them out of the camera→ship sightline so they don't
        // block the player's view of their own ship during combat.
        if (enemy.userData.isActive && typeof _enemyFlightHygiene === 'function') {
            _enemyFlightHygiene(enemy, _fhShip, _fhCam, playerPos, isLocal);
        }

        // Keep enemies OUT of every black hole's event-horizon warp zone
        // (with a combat-range buffer) so the player can't be lured into
        // a warp by chasing a hostile that dives toward the hole.
        if (typeof _enemyAvoidBlackHoles === 'function') {
            _enemyAvoidBlackHoles(enemy);
        }

        // Thruster cones: ensure they exist, then fade them in/out based
        // on whether the ship is moving meaningfully this frame. Applies
        // to every enemy so distant fighters AND local pirates/Vulcans
        // visibly fire their engines.
        // Each enemy's cones are 4 additive-blended, frustumCulled=false
        // meshes that draw every frame even off-screen. With many enemies
        // that's pure fill-rate overdraw — the kind of cost mobile GPUs
        // handle worst. Skip the whole enemy-cone system on mobile; the
        // player's own thruster glow (separate, single-ship) is untouched.
        if (!window.__isMobileGPU && typeof _ensureShipThrusterCones === 'function') {
            _ensureShipThrusterCones(enemy, enemy.userData.galaxyColor || 0xff5522);
            const _v = enemy.userData.velocity;
            const _speedNow = _v ? _v.length() : (enemy.userData.isActive ? 0.5 : 0.2);
            _updateShipThrusterCones(enemy, _speedNow > 0.08);
        }

        if (enemy.userData.isActive) {
            
            // Enhanced enemy firing with progressive difficulty.
            // Compute distance to nearest TARGET (player OR any alive wingman)
            // so enemies near wingmen still fire even when the player is far.
            let nearestTargetDist = distanceToPlayer;
            if (typeof allyShips !== 'undefined') {
                for (let _ai = 0; _ai < allyShips.length; _ai++) {
                    const _w = allyShips[_ai];
                    if (!_w || !_w.userData || _w.userData.health <= 0) continue;
                    const _wd = _w.position.distanceTo(enemy.position);
                    if (_wd < nearestTargetDist) nearestTargetDist = _wd;
                }
            }
            // Standard firing — only `maxAttackers` are active so the rate
            // is naturally capped at the original 2-day-ago levels.
            if (nearestTargetDist < firingRange) {
                const now = Date.now();
                const attackCooldown = isLocal ?
                    (difficultySettings.localAttackCooldown || 2000) :
                    (enemy.userData.isBoss ? 600 : difficultySettings.distantAttackCooldown || 1200);

                // Per-enemy JITTERED schedule rather than a shared fixed
                // cooldown. Jitter only ever ADDS delay (1.0-1.7x), so no
                // enemy ever fires faster than the original fixed rate —
                // this keeps the demo player from being baited into
                // constant return fire — while the random per-ship period
                // still breaks the synchronized distant-galaxy volley.
                if (now >= (enemy.userData.nextFire || 0)) {
                    fireEnemyWeapon(enemy, difficultySettings);
                    enemy.userData.lastAttack = now;
                    enemy.userData.nextFire = now + attackCooldown * (1.0 + Math.random() * 0.7);
                }
            }
        } else {
            // FIXED: Patrol behavior - enemies always thrust forward at min 200 km/s
            const baseSpeed = enemy.userData.speed || 0.5;
            const patrolSpeed = Math.min(1.0, Math.max(0.2, baseSpeed * 0.8));  // Patrol at 80% speed, clamped to 0.2-1.0 (200-1000 km/s)
            updatePatrolBehavior(enemy, playerPos, patrolSpeed, Date.now() * 0.001);
        }
        
    });
    
    // Update combat status for UI
    if (gameState.inCombat !== undefined) {
        gameState.inCombat = inCombatRange;
    }
}

// =============================================================================
// FACTION-SPECIFIC ATTACK PATTERNS
// Each faction has a unique combat style!
// =============================================================================

const factionBehaviors = {
    // Galaxy 0: FEDERATION - Tactical coordination, stay at optimal range
    0: {
        name: 'Federation',
        style: 'tactical',
        primaryBehavior: 'engage',      // Maintain optimal distance
        secondaryBehavior: 'flank',     // Coordinated flanking
        aggressionMultiplier: 0.8,      // Moderate aggression
        preferredRange: 200,            // Medium range fighters
        behaviorChangeChance: 0.0005,   // Rarely change tactics
        speedBonus: 1.0
    },
    // Galaxy 1: KLINGON - Aggressive head-on charges, honorable combat
    1: {
        name: 'Klingon',
        style: 'berserker',
        primaryBehavior: 'pursue',      // Direct charge!
        secondaryBehavior: 'pursue',    // Always charging
        aggressionMultiplier: 1.5,      // Very aggressive
        preferredRange: 80,             // Close range warriors
        behaviorChangeChance: 0.0002,   // Stay committed to the charge
        speedBonus: 1.3                 // Fast and furious
    },
    // Galaxy 2: REBEL - Hit and run, guerrilla tactics
    2: {
        name: 'Rebel',
        style: 'guerrilla',
        primaryBehavior: 'evade',       // Hit and run
        secondaryBehavior: 'flank',     // Attack from angles
        aggressionMultiplier: 0.7,      // Cautious
        preferredRange: 250,            // Keep distance
        behaviorChangeChance: 0.003,    // Frequently reposition
        speedBonus: 1.2                 // Quick escapes
    },
    // Galaxy 3: ROMULAN - Ambush predators, patience then strike
    3: {
        name: 'Romulan',
        style: 'ambush',
        primaryBehavior: 'flank',       // Circle for position
        secondaryBehavior: 'pursue',    // Then strike hard
        aggressionMultiplier: 1.2,      // Deadly when attacking
        preferredRange: 150,            // Mid-range
        behaviorChangeChance: 0.001,    // Patient
        speedBonus: 1.1
    },
    // Galaxy 4: IMPERIAL - Overwhelming swarm tactics
    4: {
        name: 'Imperial',
        style: 'swarm',
        primaryBehavior: 'swarm',       // Surround target
        secondaryBehavior: 'engage',    // Press the attack
        aggressionMultiplier: 1.0,      // Standard aggression
        preferredRange: 120,            // Close swarm
        behaviorChangeChance: 0.0008,   // Coordinated
        speedBonus: 0.9                 // Slower but numerous
    },
    // Galaxy 5: CARDASSIAN - Strategic encirclement
    5: {
        name: 'Cardassian',
        style: 'encircle',
        primaryBehavior: 'flank',       // Surround first
        secondaryBehavior: 'swarm',     // Then close in
        aggressionMultiplier: 0.9,      // Calculated
        preferredRange: 180,            // Medium range
        behaviorChangeChance: 0.0015,   // Adaptive
        speedBonus: 1.0
    },
    // Galaxy 6: SITH - Relentless pursuit, no mercy
    6: {
        name: 'Sith',
        style: 'relentless',
        primaryBehavior: 'pursue',      // Hunt them down
        secondaryBehavior: 'engage',    // Aggressive engagement
        aggressionMultiplier: 1.4,      // Very aggressive
        preferredRange: 100,            // Get close for the kill
        behaviorChangeChance: 0.0003,   // Focused
        speedBonus: 1.25                // Dark side speed boost
    },
    // Galaxy 7: VULCAN - Logical, precise calculated attacks
    7: {
        name: 'Vulcan',
        style: 'precision',
        // Vulcans used to default to 'engage' which only applies tiny
        // per-frame position deltas — they crept while pirates ripped.
        // Switched to 'pursue' for primary (velocity-based, fast) and
        // kept 'engage' as the secondary tactical-hold mode.
        primaryBehavior: 'pursue',
        secondaryBehavior: 'engage',
        aggressionMultiplier: 1.0,      // bumped from 0.85
        preferredRange: 200,            // a bit wider so engage doesn't lock them in place
        behaviorChangeChance: 0.008,
        speedBonus: 1.1                 // a touch faster than baseline
    }
};

// Force-activate an enemy when it takes damage. Without this, enemies
// outside the maxAttackers cap stay in patrol mode and don't fight back
// or evade when the player (or wingmen) shoot them — they just orbit
// their patrolCenter looking broken.
function _activateOnDamage(enemy) {
    if (!enemy || !enemy.userData) return;
    if (enemy.userData.isActive) return; // already active
    enemy.userData.isActive = true;
    enemy.userData.detectedPlayer = true;
    enemy.userData.lastSeenPlayerPos = (typeof camera !== 'undefined') ? camera.position.clone() : null;
    // Low-HP enemies evade immediately; others engage
    const hp = enemy.userData.health / (enemy.userData.maxHealth || 1);
    enemy.userData.attackMode = hp < 0.5 ? 'evade' : 'engage';
}

// Get faction behavior for an enemy
function getFactionBehavior(enemy) {
    const galaxyId = enemy.userData.galaxyId;
    if (galaxyId !== undefined && factionBehaviors[galaxyId]) {
        return factionBehaviors[galaxyId];
    }
    // Default to Federation-style if unknown
    return factionBehaviors[0];
}

// UPDATED: Local enemy behavior with FACTION-SPECIFIC AI + wingman targeting
function updateLocalEnemyBehavior(enemy, distanceToPlayer, adjustedSpeed, difficultySettings) {
    if (!enemy || !enemy.userData || typeof camera === 'undefined' || typeof THREE === 'undefined') {
        return;
    }

    const time = Date.now() * 0.001;
    let playerPos = camera.position.clone();
    const faction = getFactionBehavior(enemy);
    const factionSpeed = adjustedSpeed * faction.speedBonus;

    // ── Target selection: honor the per-frame engagement assignment so
    // at most 3 enemies pile on the player and at most 3 on each wingman.
    // _assignEngagementTargets sets enemy.userData.engagedTarget; we
    // resolve it here to a concrete position.
    let targetPos = playerPos;
    let targetDist = distanceToPlayer;
    const _assigned = _engagedTargetPos(enemy);
    if (_assigned) {
        targetPos = _assigned.clone();
        targetDist = enemy.position.distanceTo(_assigned);
    }

    if (distanceToPlayer < difficultySettings.localDetectionRange) {
        enemy.userData.lastSeenPlayerPos = playerPos.clone();
        enemy.userData.lastSeenTime = time;
    }

    if (!enemy.userData.attackMode) {
        enemy.userData.attackMode = faction.primaryBehavior;
    }

    // Mode-switch dwell: these RANDOM attackMode rolls each fire per-frame (a
    // faction primary/secondary flip, a low-HP evade roll, and a 10% swarm
    // roll). Re-rolling several times a second flips the enemy between modes
    // that move in opposite directions (pursue=toward, evade=away,
    // swarm=converge), so its motion reverses frame-to-frame — that is the
    // "enemies move jittery" vibration. Commit to a chosen maneuver for ~0.9s
    // before another RANDOM switch may fire. Distance-based overrides below are
    // deterministic and stay instant.
    const _now = Date.now();
    const _modeLocked = (_now - (enemy.userData._lastModeChange || 0)) < 900;

    // Faction-specific behavior changes (more frequent for active dogfighting)
    const changeChance = (faction.behaviorChangeChance || 0.002) * 3;
    if (!_modeLocked && Math.random() < changeChance) {
        if (enemy.userData.attackMode === faction.primaryBehavior) {
            enemy.userData.attackMode = faction.secondaryBehavior;
        } else {
            enemy.userData.attackMode = faction.primaryBehavior;
        }
        enemy.userData._lastModeChange = _now;
    }

    // Health-triggered evasion: low-HP enemies bias toward evade
    const healthFraction = enemy.userData.health / (enemy.userData.maxHealth || 1);
    if (!_modeLocked && healthFraction < 0.5 && Math.random() < 0.04) {
        enemy.userData.attackMode = 'evade';
        enemy.userData._lastModeChange = _now;
    }

    // Multi-enemy swarming: if 2+ enemies are within 1200u of the target,
    // bias toward swarm so they converge instead of fighting individually.
    // Check chance bumped 0.02 -> 0.10 (5x) and radius widened 800 -> 1200
    // so groups commit to a swarm much more often than they did before —
    // user feedback was that enemies needed to swarm the player better.
    if (!_modeLocked && Math.random() < 0.10 && typeof enemies !== 'undefined') {
        let nearbyAllies = 0;
        for (let j = 0; j < enemies.length; j++) {
            const e = enemies[j];
            if (!e || e === enemy || !e.userData || e.userData.health <= 0) continue;
            if (e.position.distanceTo(targetPos) < 1200) nearbyAllies++;
            if (nearbyAllies >= 2) break;
        }
        if (nearbyAllies >= 2) {
            enemy.userData.attackMode = 'swarm';
            enemy.userData._lastModeChange = _now;
        }
    }

    // Distance-based overrides
    if (faction.style === 'berserker' && targetDist > 300) {
        enemy.userData.attackMode = 'pursue';
    } else if (faction.style === 'guerrilla' && targetDist < 100) {
        enemy.userData.attackMode = 'evade';
    } else if (faction.style === 'ambush' && targetDist < faction.preferredRange) {
        enemy.userData.attackMode = 'pursue';
    }

    // Override playerPos with the nearest target so all behaviors steer toward
    // either the player OR a wingman, whichever is closer.
    playerPos.copy(targetPos);
    distanceToPlayer = targetDist;
    
    switch (enemy.userData.attackMode) {
        case 'pursue':
            updatePursuitBehavior(enemy, playerPos, factionSpeed * faction.aggressionMultiplier, distanceToPlayer);
            break;
        case 'swarm':
            updateSwarmBehavior(enemy, playerPos, factionSpeed, time);
            break;
        case 'evade':
            updateEvasionBehavior(enemy, playerPos, factionSpeed, time);
            break;
        case 'flank':
            updateFlankingBehavior(enemy, playerPos, factionSpeed, time);
            break;
        case 'engage':
            updateEngagementBehavior(enemy, playerPos, factionSpeed, time);
            break;
        default:
            updatePursuitBehavior(enemy, playerPos, factionSpeed, distanceToPlayer);
    }
    
    // Smooth quaternion slerp instead of instant lookAt — keeps the
    // turning motion fluid like wingmen instead of snapping the
    // orientation each frame when the target moves.
    // Snappier slerp than wingmen so "enemy turns to face you" reads
    // as deliberate combat orientation. Still smooth enough to avoid
    // the rigid lookAt snap.
    _smoothEnemyLookAt(enemy, playerPos, 0.20);
}

// Smoothly rotate an enemy to face `targetPos` over multiple frames.
// rate is the slerp factor per frame: 0.06 = wingman smooth, 0.12 = a bit
// snappier (enemies actively dogfighting), 0.2 = very responsive.
const _enemyLookMat = new THREE.Matrix4();
const _enemyLookQuat = new THREE.Quaternion();
const _enemyUp = new THREE.Vector3(0, 1, 0);
function _smoothEnemyLookAt(enemy, targetPos, rate) {
    if (!enemy || !targetPos) return;
    try {
        // setFromUnitVectors-style approach using lookAt matrix.
        // The trick: pass (eye, target, up) — eye is the enemy, target is
        // where it should be looking. matrix.lookAt then composes the
        // rotation. Negate the direction (eye - target) to face forward.
        const pos = enemy.position;
        _enemyLookMat.lookAt(pos, targetPos, _enemyUp);
        _enemyLookQuat.setFromRotationMatrix(_enemyLookMat);
        enemy.quaternion.slerp(_enemyLookQuat, rate);
    } catch (e) {
        // Ignore — position/target may be invalid mid-cleanup
    }
}

// ENHANCED: Enhanced enemy behavior for distant galaxies
function updateEnhancedEnemyBehavior(enemy, distanceToPlayer, adjustedSpeed, difficultySettings) {
    // Safety checks
    if (!enemy || !enemy.userData || typeof camera === 'undefined' || typeof THREE === 'undefined') {
        return;
    }

    const time = Date.now() * 0.001;
    // Honor the engagement assignment so distant enemies steer toward
    // the player OR a wingman (whichever the cap put them on) instead
    // of always tracking the camera.
    const _assignedPos = _engagedTargetPos(enemy);
    const playerPos = _assignedPos ? _assignedPos.clone() : camera.position.clone();
    distanceToPlayer = enemy.position.distanceTo(playerPos);
    
    // Enhanced AI state machine
    if (!enemy.userData.behaviorState) {
        enemy.userData.behaviorState = 'patrol';
        enemy.userData.behaviorTimer = 0;
    }
    
    enemy.userData.behaviorTimer += 0.016; // Roughly 60fps
    
    switch (enemy.userData.behaviorState) {
        case 'patrol':
            if (distanceToPlayer < difficultySettings.distantDetectionRange * 0.7) {
                enemy.userData.behaviorState = 'pursue';
                enemy.userData.behaviorTimer = 0;
            }
            updatePatrolBehavior(enemy, playerPos, adjustedSpeed, time);
            break;
            
        case 'pursue':
            if (distanceToPlayer > difficultySettings.distantDetectionRange) {
                enemy.userData.behaviorState = 'patrol';
            } else if (distanceToPlayer < 150 && enemy.userData.behaviorTimer > 2) {
                enemy.userData.behaviorState = Math.random() < 0.5 ? 'strafe' : 'retreat';
                enemy.userData.behaviorTimer = 0;
            }
            updatePursuitBehavior(enemy, playerPos, adjustedSpeed, distanceToPlayer);
            break;
            
        case 'strafe':
            if (enemy.userData.behaviorTimer > 3 || distanceToPlayer > 200) {
                enemy.userData.behaviorState = 'pursue';
                enemy.userData.behaviorTimer = 0;
            }
            updateSwarmBehavior(enemy, playerPos, adjustedSpeed, time);
            break;
            
        case 'retreat':
            if (enemy.userData.behaviorTimer > 2 || distanceToPlayer > 300) {
                enemy.userData.behaviorState = 'pursue';
                enemy.userData.behaviorTimer = 0;
            }
            updateEvasionBehavior(enemy, playerPos, adjustedSpeed, time);
            break;
    }
    
    // Smooth quaternion slerp instead of instant lookAt
    // Snappier slerp than wingmen so "enemy turns to face you" reads
    // as deliberate combat orientation. Still smooth enough to avoid
    // the rigid lookAt snap.
    _smoothEnemyLookAt(enemy, playerPos, 0.20);
}

// Boss behavior
function updateBossBehavior(enemy, playerPos, speed) {
    // Bosses use more complex movement patterns
    const time = Date.now() * 0.001;
    const distance = enemy.position.distanceTo(playerPos);

    // Standoff scales with the (now 2×) hull so the boss circles OUTSIDE
    // the player's personal space instead of parking inside it at 120u.
    const standoff = Math.max(350, (enemy.userData.hitboxSize || 288) * 0.9);

    if (distance > standoff * 1.6) {
        // Approach with weaving pattern
        const direction = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize();
        const weave = new THREE.Vector3(Math.sin(time * 2) * 20, Math.cos(time * 1.5) * 15, 0);
        direction.add(weave.multiplyScalar(0.1));
        enemy.position.add(direction.multiplyScalar(speed));
    } else {
        // Circle strafe at optimal distance
        const angle = time * 0.8;
        const targetX = playerPos.x + Math.cos(angle) * standoff;
        const targetZ = playerPos.z + Math.sin(angle) * standoff;
        const targetY = playerPos.y + Math.sin(angle * 0.3) * standoff * 0.25;

        const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
        const direction = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
        enemy.position.add(direction.multiplyScalar(speed * 0.6));
    }

    // Special attacks: missile volleys + spinning laser sweeps
    if (typeof _updateBossSpecials === 'function') {
        _updateBossSpecials(enemy, playerPos, distance);
    }
}

// =============================================================================
// BOSS SPECIAL ATTACKS — missile volleys and spinning laser sweeps. Both
// punish camping: the volley reaches far (so the player keeps moving) and
// the sweep punishes sitting close to the hull (so the player keeps range).
// =============================================================================
const _bossMissiles = [];
const _BOSS_MISSILE_CAP = 24;

function _bossPlayerAimPos() {
    try {
        const cs = window.cameraState;
        const ship = cs && cs.playerShipMesh;
        if (ship && ship.visible) {
            const wp = new THREE.Vector3();
            ship.getWorldPosition(wp);
            if (isFinite(wp.x)) return wp;
        }
    } catch (e) {}
    return camera.position.clone();
}

function _spawnBossMissile(boss) {
    if (!boss || !boss.userData || boss.userData.health <= 0) return;
    if (_bossMissiles.length >= _BOSS_MISSILE_CAP) return;
    const geo = new THREE.ConeGeometry(3, 14, 6);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xff3322, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(boss.position);
    // Launch in a fanned direction toward the player
    const aim = _bossPlayerAimPos();
    const dir = aim.sub(boss.position).normalize();
    dir.x += (Math.random() - 0.5) * 0.5;
    dir.y += (Math.random() - 0.5) * 0.3;
    dir.z += (Math.random() - 0.5) * 0.5;
    dir.normalize();
    scene.add(m);
    _bossMissiles.push({ mesh: m, vel: dir.multiplyScalar(2.2), born: Date.now() });
}

// Called once per behavior pass (30 Hz) from updateEnemyBehavior.
function _updateBossMissiles() {
    if (!_bossMissiles.length) return;
    const aim = _bossPlayerAimPos();
    for (let i = _bossMissiles.length - 1; i >= 0; i--) {
        const bm = _bossMissiles[i];
        const age = Date.now() - bm.born;
        // Homing: bend velocity toward the player, capped turn per tick
        const want = aim.clone().sub(bm.mesh.position).normalize().multiplyScalar(2.2);
        bm.vel.lerp(want, 0.045).setLength(2.2);
        bm.mesh.position.add(bm.vel);
        bm.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bm.vel.clone().normalize());

        const dist = bm.mesh.position.distanceTo(camera.position);
        let done = false;
        if (dist < 40) {
            // Impact: damage + knockback + screen shake
            const isInvuln = typeof isBlackHoleWarpInvulnerable === 'function' && isBlackHoleWarpInvulnerable();
            if (!isInvuln && typeof gameState !== 'undefined' && gameState.hull !== undefined) {
                const red = typeof getShieldDamageReduction === 'function' ? getShieldDamageReduction() : 0;
                gameState.hull = Math.max(0, gameState.hull - 6 * (1 - red));
                if (gameState.velocityVector) {
                    gameState.velocityVector.addScaledVector(bm.vel.clone().normalize(), 0.35);
                }
                if (typeof createEnhancedScreenDamageEffect === 'function') {
                    createEnhancedScreenDamageEffect(bm.mesh.position);
                }
            }
            if (typeof createExplosionEffect === 'function') createExplosionEffect(bm.mesh.position);
            done = true;
        } else if (age > 9000) {
            done = true;
        }
        if (done) {
            scene.remove(bm.mesh);
            bm.mesh.geometry.dispose(); bm.mesh.material.dispose();
            _bossMissiles.splice(i, 1);
        }
    }
}
if (typeof window !== 'undefined') window._updateBossMissiles = _updateBossMissiles;

function _updateBossSpecials(boss, playerPos, distance) {
    const ud = boss.userData;
    const now = Date.now();
    if (!ud._nextVolleyAt) ud._nextVolleyAt = now + 6000 + Math.random() * 4000;
    if (!ud._nextSweepAt) ud._nextSweepAt = now + 12000 + Math.random() * 5000;

    // MISSILE VOLLEY — 5 homing bolts, staggered, every 11-16 s
    if (now >= ud._nextVolleyAt && distance > 250 && distance < 3500) {
        ud._nextVolleyAt = now + 11000 + Math.random() * 5000;
        for (let i = 0; i < 5; i++) {
            setTimeout(() => _spawnBossMissile(boss), i * 170);
        }
        if (typeof showAchievement === 'function') {
            showAchievement('⚠ MISSILE VOLLEY', (ud.name || 'Boss') + ' launched a homing volley — evade!', true);
        }
    }

    // SPINNING LASER SWEEP — 3 beams rotating around the boss for 3.5 s,
    // every 14-19 s, only triggers (and only hurts) at close range
    if (now >= ud._nextSweepAt && distance < 1600) {
        ud._nextSweepAt = now + 14000 + Math.random() * 5000;
        ud._sweepUntil = now + 3500;
        ud._sweepAngle = Math.random() * Math.PI * 2;
        if (typeof showAchievement === 'function') {
            showAchievement('⚠ LASER SWEEP', (ud.name || 'Boss') + ' is spinning up rotating beams — keep your distance!', true);
        }
    }
    if (ud._sweepUntil && now < ud._sweepUntil) {
        ud._sweepAngle += 0.062; // ~1.9 rad/s at 30 Hz
        const SWEEP_LEN = 1200;
        const drawThisTick = (typeof gameState !== 'undefined') ? (gameState.frameCount % 4 === 0) : true;
        for (let k = 0; k < 3; k++) {
            const a = ud._sweepAngle + k * (Math.PI * 2 / 3);
            const end = new THREE.Vector3(
                boss.position.x + Math.cos(a) * SWEEP_LEN,
                boss.position.y + Math.sin(a * 0.5) * 80,
                boss.position.z + Math.sin(a) * SWEEP_LEN
            );
            if (drawThisTick && typeof createLaserBeam === 'function') {
                createLaserBeam(boss.position.clone(), end, '#ff2222', false);
            }
        }
        // Damage check: player inside sweep radius AND angularly near a beam
        const toPlayer = camera.position.clone().sub(boss.position);
        const distXZ = Math.sqrt(toPlayer.x * toPlayer.x + toPlayer.z * toPlayer.z);
        if (distXZ < SWEEP_LEN && Math.abs(toPlayer.y) < 250 &&
            now - (ud._lastSweepHit || 0) > 450) {
            const playerAngle = Math.atan2(toPlayer.z, toPlayer.x);
            for (let k = 0; k < 3; k++) {
                let diff = (playerAngle - (ud._sweepAngle + k * (Math.PI * 2 / 3))) % (Math.PI * 2);
                if (diff > Math.PI) diff -= Math.PI * 2;
                if (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) < 0.13) {
                    ud._lastSweepHit = now;
                    const isInvuln = typeof isBlackHoleWarpInvulnerable === 'function' && isBlackHoleWarpInvulnerable();
                    if (!isInvuln && typeof gameState !== 'undefined' && gameState.hull !== undefined) {
                        const red = typeof getShieldDamageReduction === 'function' ? getShieldDamageReduction() : 0;
                        gameState.hull = Math.max(0, gameState.hull - 4 * (1 - red));
                        // Knock outward, away from the sweep
                        if (gameState.velocityVector && distXZ > 1) {
                            gameState.velocityVector.x += (toPlayer.x / distXZ) * 0.3;
                            gameState.velocityVector.z += (toPlayer.z / distXZ) * 0.3;
                        }
                        if (typeof createEnhancedScreenDamageEffect === 'function') {
                            createEnhancedScreenDamageEffect(boss.position);
                        }
                    }
                    break;
                }
            }
        }
    }
}

// Support ship behavior
// BOSS-SUPPORT SWARM: each escort is assigned one of four attack patterns on
// first update (round-robin, so a wing always mixes roles), giving the boss
// fight diverse, coordinated-looking pressure instead of a static ring:
//   orbiter — circles the player on its own radius/direction/phase
//   flanker — holds a pulsing position off the player's flank
//   diver   — repeated attack runs: dive to point-blank, break away, re-run
//   screen  — bodyguard: keeps itself between the boss and the player, weaving
// A light separation impulse keeps the swarm from stacking into one blob.
let _supportRoleCounter = 0;
const _supTmpA = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _supTmpB = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _supUp = (typeof THREE !== 'undefined') ? new THREE.Vector3(0, 1, 0) : null;

function updateSupportBehavior(enemy, playerPos, speed) {
    const ud = enemy.userData;
    if (!ud._supportRole) {
        const roles = ['orbiter', 'diver', 'flanker', 'screen'];
        ud._supportRole = roles[_supportRoleCounter++ % roles.length];
        ud._orbitDir = Math.random() < 0.5 ? 1 : -1;
        ud._orbitRadius = 150 + Math.random() * 130;
        ud._phase = Math.random() * Math.PI * 2;
        ud._diveState = 'approach';
    }
    const now = performance.now() * 0.001;
    const distance = enemy.position.distanceTo(playerPos);

    switch (ud._supportRole) {
        case 'orbiter': {
            // Tangential strafe around the player + radial correction onto
            // this ship's own ring, with a gentle vertical bob.
            _supTmpA.subVectors(enemy.position, playerPos);
            const d = _supTmpA.length() || 1;
            _supTmpA.divideScalar(d);
            _supTmpB.crossVectors(_supTmpA, _supUp).normalize().multiplyScalar(ud._orbitDir);
            enemy.position.addScaledVector(_supTmpB, speed);
            const radialErr = d - ud._orbitRadius;
            if (Math.abs(radialErr) > 20) {
                enemy.position.addScaledVector(_supTmpA, (radialErr > 0 ? -1 : 1) * speed * 0.5);
            }
            enemy.position.y += Math.sin(now * 1.7 + ud._phase) * speed * 0.25;
            break;
        }
        case 'flanker': {
            // Hold a pulsing standoff point off the player's flank (side
            // chosen by orbit direction), sliding in and out for pressure.
            const flankDist = 200 + Math.sin(now * 0.9 + ud._phase) * 90;
            _supTmpA.set(0, 0, -1);
            if (typeof camera !== 'undefined') _supTmpA.applyQuaternion(camera.quaternion);
            _supTmpB.crossVectors(_supTmpA, _supUp).normalize()
                .multiplyScalar(ud._orbitDir * flankDist);
            _supTmpB.add(playerPos).sub(enemy.position);
            const gap = _supTmpB.length();
            if (gap > 15) enemy.position.addScaledVector(_supTmpB.divideScalar(gap), Math.min(speed, gap));
            break;
        }
        case 'diver': {
            // Attack runs: dive straight at the player, break off at close
            // range along a lateral escape vector, re-engage from distance.
            if (ud._diveState === 'approach') {
                _supTmpA.subVectors(playerPos, enemy.position).normalize();
                enemy.position.addScaledVector(_supTmpA, speed * 1.35);
                if (distance < 110) {
                    ud._diveState = 'break';
                    _supTmpB.crossVectors(_supTmpA, _supUp).normalize()
                        .multiplyScalar(ud._orbitDir)
                        .addScaledVector(_supUp, (Math.random() - 0.5) * 0.8)
                        .normalize();
                    ud._breakDir = { x: _supTmpB.x, y: _supTmpB.y, z: _supTmpB.z };
                }
            } else {
                _supTmpA.set(ud._breakDir.x, ud._breakDir.y, ud._breakDir.z);
                enemy.position.addScaledVector(_supTmpA, speed * 1.1);
                if (distance > 420) ud._diveState = 'approach';
            }
            break;
        }
        case 'screen':
        default: {
            // Bodyguard: park on the boss→player line (closer to the boss)
            // and weave laterally so it isn't a stationary target.
            let boss = null, bossDist = Infinity;
            if (typeof enemies !== 'undefined') {
                for (let i = 0; i < enemies.length; i++) {
                    const e = enemies[i];
                    if (!e || !e.userData || !e.userData.isBoss || e.userData.health <= 0) continue;
                    const bd = e.position.distanceTo(enemy.position);
                    if (bd < bossDist && bd < 3000) { bossDist = bd; boss = e; }
                }
            }
            if (boss) {
                _supTmpA.subVectors(playerPos, boss.position);
                const toPlayer = _supTmpA.length() || 1;
                _supTmpA.divideScalar(toPlayer);
                _supTmpB.crossVectors(_supTmpA, _supUp).normalize()
                    .multiplyScalar(Math.sin(now * 1.3 + ud._phase) * 90);
                _supTmpB.add(boss.position)
                    .addScaledVector(_supTmpA, Math.min(toPlayer * 0.35, 350))
                    .sub(enemy.position);
                const gap2 = _supTmpB.length();
                if (gap2 > 10) enemy.position.addScaledVector(_supTmpB.divideScalar(gap2), Math.min(speed, gap2));
            } else {
                // Boss down — fall back to orbiting pressure
                ud._supportRole = 'orbiter';
            }
            break;
        }
    }

    // SWARM SEPARATION: gently repel from other nearby supports so patterns
    // interleave instead of collapsing into a single blob.
    if (typeof enemies !== 'undefined') {
        for (let i = 0; i < enemies.length; i++) {
            const other = enemies[i];
            if (!other || other === enemy || !other.userData ||
                !other.userData.isBossSupport || other.userData.health <= 0) continue;
            _supTmpA.subVectors(enemy.position, other.position);
            const sd = _supTmpA.length();
            if (sd > 0.01 && sd < 45) {
                enemy.position.addScaledVector(_supTmpA.divideScalar(sd), speed * 0.5);
            }
        }
    }
}

// Enhanced enemy weapon firing with directional damage and progressive difficulty
const _enemyWorldPos = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

function fireEnemyWeapon(enemy, difficultySettings) {
    if (!enemy || !enemy.userData || enemy.userData.health <= 0) return;

    // No enemy fires until 5 seconds after game start
    if (!gameState.gameStartTime || (Date.now() - gameState.gameStartTime < 5000)) return;

    const isLocal = isEnemyInLocalGalaxy(enemy);
    const firingRange = isLocal ? difficultySettings?.localFiringRange || 500 : difficultySettings?.distantFiringRange || 600;

    // Use world position for entities that are children of groups
    const enemyPos = (enemy.parent && enemy.parent.isGroup) ? enemy.getWorldPosition(_enemyWorldPos).clone() : enemy.position;

    // Aim at the player's SHIP, not the camera. In 3rd-person the ship
    // mesh is offset well in front of/below the camera, so beams aimed
    // at camera.position visibly streak past the ship. When the ship
    // mesh is present and visible (3rd-person / cockpit), use its world
    // position; otherwise (zero-offset / no-ship POV) fall back to the
    // camera.
    function _playerAimPos() {
        try {
            const cs = window.cameraState;
            const ship = cs && cs.playerShipMesh;
            if (ship && ship.visible) {
                const wp = new THREE.Vector3();
                ship.getWorldPosition(wp);
                if (isFinite(wp.x)) return wp;
            }
        } catch (e) {}
        return camera.position.clone();
    }

    // Pick the nearest target between player and wingmen
    const playerPos = _playerAimPos();
    let targetPos = playerPos;
    let targetWingman = null;
    let nearestDist = playerPos.distanceTo(enemyPos);

    if (typeof allyShips !== 'undefined') {
        for (let i = 0; i < allyShips.length; i++) {
            const ally = allyShips[i];
            if (!ally || !ally.userData || ally.userData.health <= 0) continue;
            const d = ally.position.distanceTo(enemyPos);
            if (d < nearestDist) {
                nearestDist = d;
                targetPos = ally.position.clone();
                targetWingman = ally;
            }
        }
    }

    // Opportunistic: a mining vessel that's the CLOSEST target also
    // draws fire. Active hostiles don't divert to hunt them — they just
    // shoot whatever (player / wingman / mining ship) is nearest & in
    // range. Undefended, the vessel is whittled down and destroyed.
    let targetMining = null;
    if (typeof civilianShips !== 'undefined') {
        for (let i = 0; i < civilianShips.length; i++) {
            const cv = civilianShips[i];
            if (!cv || !cv.userData || cv.userData._destroyed) continue;
            if (cv.userData.shipCategory !== 'mining') continue;
            const d = cv.position.distanceTo(enemyPos);
            if (d < nearestDist) {
                nearestDist = d;
                targetPos = cv.position.clone();
                targetMining = cv;
                targetWingman = null; // mining vessel is the nearer target
            }
        }
    }

    if (nearestDist <= firingRange) {
        const laserColor = enemy.userData.isBoss ? '#ff4444' : (enemy.userData.isBorgCube || enemy.userData.type === 'borg_drone') ? '#00ff00' : '#ff8800';

        // Reduced damage so combat is survivable while still threatening.
        // Local enemies do 2 dmg base, distant 3-6 dmg. With 4 attackers
        // firing every 1.2s at 60% hit chance: ~4 dmg/sec → 25s to die.
        let damage = isLocal ?
            (difficultySettings.galaxiesCleared === 0 ? 2 : 3 + difficultySettings.galaxiesCleared) :
            (enemy.userData.isBoss ? 8 : enemy.userData.isBossSupport ? 5 : 3);
        damage = Math.min(damage, 10);

        let hitChance = 0.6;
        const turnRate = enemy.userData.turnRate || 0;
        if (turnRate > 0.01) {
            const accuracyPenalty = Math.min(turnRate * 3.33, 0.5);
            hitChance = Math.max(0.2, hitChance - accuracyPenalty);
        }

        const isHit = Math.random() < hitChance;

        // Draw the bolt. A HIT terminates at the target; a MISS is nudged to
        // the side and extended well past the target so it streaks on by for a
        // longer distance instead of stopping dead at the player.
        let beamEnd = targetPos;
        if (!isHit && typeof THREE !== 'undefined') {
            const _aim = targetPos.clone().sub(enemyPos);
            const _distToTarget = _aim.length() || 1;
            _aim.normalize();
            let _perp = new THREE.Vector3().crossVectors(_aim, new THREE.Vector3(0, 1, 0));
            if (_perp.lengthSq() < 1e-4) _perp.set(1, 0, 0);
            _perp.normalize();
            const _side = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 160);
            const _vert = (Math.random() - 0.5) * 180;
            const _overshoot = 4000 + Math.random() * 4500;   // continue well past
            beamEnd = enemyPos.clone()
                .addScaledVector(_aim, _distToTarget + _overshoot)
                .addScaledVector(_perp, _side)
                .addScaledVector(new THREE.Vector3(0, 1, 0), _vert);
        }
        createLaserBeam(enemyPos, beamEnd, laserColor, false);

        playEnemyLaserSound(enemy);

        if (isHit) {
            // If firing at a wingman, damage the wingman and exit
            if (targetWingman && targetWingman.userData) {
                const wasAlive = targetWingman.userData.health > 0;
                targetWingman.userData.health = Math.max(0, targetWingman.userData.health - damage);
                if (typeof flashEnemyHit === 'function') flashEnemyHit(targetWingman, damage);

                // Wingman destroyed — large explosion + notification
                if (wasAlive && targetWingman.userData.health <= 0) {
                    if (typeof createWingmanExplosion === 'function') {
                        createWingmanExplosion(targetWingman);
                    }
                    if (typeof showAchievement === 'function') {
                        showAchievement(
                            (targetWingman.userData.name || 'Wingman') + ' DESTROYED!',
                            'Ally ship lost in combat',
                            true
                        );
                    }
                    if (typeof flashEventText === 'function') {
                        flashEventText('WINGMAN DOWN', '#ff5555',
                            (targetWingman.userData.name || 'Ally ship') + ' lost in combat');
                    }
                    if (typeof playSound === 'function') {
                        playSound('explosion');
                    }
                }
                return;
            }

            // Mining vessel hit — distress call on the first strike, then
            // destroyed (explosion) if the player doesn't drive the
            // attackers off in time. Tough hull (~10 hits @3 dmg).
            if (targetMining && targetMining.userData && !targetMining.userData._destroyed) {
                const mv = targetMining;
                if (typeof mv.userData.maxHealth !== 'number') {
                    mv.userData.maxHealth = 30;
                    mv.userData.health = 30;
                }
                if (!mv.userData._distressSent) {
                    mv.userData._distressSent = true;
                    if (typeof showIncomingTransmission === 'function') {
                        showIncomingTransmission(
                            mv.userData.name || 'Mining Vessel',
                            'Mayday! We are under hostile fire with no escort — requesting immediate assistance!',
                            true);
                    }
                }
                if (typeof flashEnemyHit === 'function') flashEnemyHit(mv, damage);
                if (typeof damageCivilianShip === 'function') {
                    // Shared civilian-combat entry point: shield bubble,
                    // evasive flee via the mining AI, distress on the map,
                    // and destruction handling.
                    damageCivilianShip(mv, damage, enemy);
                    return;
                }
                mv.userData.health = Math.max(0, (mv.userData.health || 30) - damage);

                if (mv.userData.health <= 0) {
                    mv.userData._destroyed = true;
                    if (typeof createWingmanExplosion === 'function') createWingmanExplosion(mv);
                    if (typeof showAchievement === 'function') {
                        showAchievement((mv.userData.name || 'Mining Vessel') + ' LOST',
                            'A mining vessel was destroyed by hostiles', true);
                    }
                    if (typeof playSound === 'function') playSound('explosion');
                    if (typeof scene !== 'undefined') scene.remove(mv);
                    if (typeof civilianShips !== 'undefined') {
                        const ci = civilianShips.indexOf(mv);
                        if (ci > -1) civilianShips.splice(ci, 1);
                    }
                }
                return;
            }

            const isInvulnerable = typeof isBlackHoleWarpInvulnerable === 'function' &&
                                   isBlackHoleWarpInvulnerable();
            const shieldsActive = typeof isShieldActive === 'function' && isShieldActive();

            if (!isInvulnerable) {
                const shieldReduction = typeof getShieldDamageReduction === 'function' ?
                                        getShieldDamageReduction() : 0;
                const actualDamage = damage * (1 - shieldReduction);

                if (typeof gameState !== 'undefined' && gameState.hull !== undefined) {
                    const _before = gameState.hull;
                    gameState.hull = Math.max(0, gameState.hull - actualDamage);
                } else if (typeof gameState !== 'undefined' && gameState.health !== undefined) {
                    gameState.health = Math.max(0, gameState.health - actualDamage);
                }

                // Knockback: enemy blasts shove the ship along the shot
                // line (softened while shields are up). ~10% of max
                // velocity per hit (doubled from 5% per playtest).
                if (typeof camera !== 'undefined' && gameState.velocityVector && enemy && enemy.position) {
                    const _kb = camera.position.clone().sub(enemy.position).normalize();
                    gameState.velocityVector.addScaledVector(_kb, shieldsActive ? 0.10 : 0.22);
                }
            }

            if (shieldsActive && typeof createShieldHitEffect === 'function') {
                // Pass the beam's actual line (origin → aim point) and color
                // so the deflection sparks land where the laser visually
                // strikes the bubble, tinted like the laser that caused them.
                createShieldHitEffect(enemyPos || enemy.position, laserColor, targetPos);
            }

            if (!isInvulnerable) {
                createEnhancedScreenDamageEffect(enemy.position);
                if (!shieldsActive) {
                    // Direct hull hit — flash the ship red (3rd person).
                    if (typeof flashPlayerShipHit === 'function') flashPlayerShipHit();
                    playSound('damage');
                    if (enemy.userData.isBoss) {
                        showAchievement('Boss Attack!', `${enemy.userData.name} hit for ${damage} damage!`, false);
                    } else {
                        showAchievement('Taking Fire!', `Enemy hit for ${damage} damage!`, false);
                    }
                }
            }

            const currentHealth = gameState.hull || gameState.health || 0;
            if (currentHealth <= 0) {
                createDeathEffect();
            }
        } else {
            showAchievement('Missed!', 'Enemy shot missed!', false);
        }
    }
}

function isEnemyInLocalGalaxy(enemy) {
    if (!enemy || !enemy.userData) return false;
    
    // Check if enemy is explicitly marked as local
    if (enemy.userData.isLocal !== undefined) {
        return enemy.userData.isLocal;
    }
    
    // Fallback: check position relative to origin (local galaxy center)
    const distanceFromOrigin = (window.trueDistanceFromOrigin) ? window.trueDistanceFromOrigin(enemy.position) : enemy.position.length();
    return distanceFromOrigin < 5000; // Local galaxy radius
}

function updateEnemyVisualHealth(enemy) {
    // MeshBasicMaterial doesn't need health-based visual changes
    // The translucent glowing appearance is enough
    // This function is kept for compatibility but does nothing
    return;

    
    // Calculate health percentage
    const currentHealthPercent = enemy.userData.health / enemy.userData.maxHealth;
    
    if (currentHealthPercent > 0.66) {
        // High health - original color
        enemy.material.color.copy(enemy.userData.originalMaterial.color);
        enemy.material.emissive.copy(enemy.userData.originalMaterial.emissive);
        enemy.material.emissiveIntensity = enemy.userData.originalMaterial.emissiveIntensity;
    } else if (currentHealthPercent > 0.33) {
        // Medium health - slightly damaged (darker, orange tint)
        enemy.material.color.copy(enemy.userData.originalMaterial.color).multiplyScalar(0.8);
        enemy.material.color.r = Math.min(1, enemy.material.color.r + 0.2);
        enemy.material.emissive.set(0.1, 0.05, 0);
        enemy.material.emissiveIntensity = 0.3;
    } else {
        // Low health - heavily damaged (much darker, red glow)
        enemy.material.color.copy(enemy.userData.originalMaterial.color).multiplyScalar(0.5);
        enemy.material.color.r = Math.min(1, enemy.material.color.r + 0.3);
        enemy.material.emissive.set(0.2, 0, 0);
        enemy.material.emissiveIntensity = 0.5;
    }
}

// =============================================================================
// TUTORIAL SYSTEM - RESTORED from game-controls13.js (WORKING VERSION)
// =============================================================================

const tutorialSystem = {
    active: true,
    completed: false,
    currentStep: 0,
    messages: [
        {
            title: "Mission Command",
            text: "Captain Bo, you'll need gravitational slingshots to leave this galaxy.",
            delay: 5000
        },
        {
            title: "Navigation Training",
            text: "Approach any planet and press Enter to slingshot. WASD thrusts; arrow keys look.",
            delay: 15000
        },
        {
            title: "Combat Systems",
            text: "Kills restore hull. Tab toggles shields (drains energy). Watch your levels.",
            delay: 25000
        },
        {
            title: "Primary Objective",
            text: "Clear every galaxy of hostiles, including Sagittarius A*. Left-click or Option fires; hold Space to lock.",
            delay: 35000
        },
        {
            title: "Emergency Systems",
            text: "5 Emergency Warp charges (Enter) boost you to hyperspace — handy, but you'll still need slingshots between galaxies.",
            delay: 45000
        },
        {
            title: "Final Orders",
            text: "Hunt the boss flagship in each galaxy. Galactic map tracks progress. Good luck, Captain.",
            delay: 55000
        }
    ]
};

function startTutorial() {
    if (!tutorialSystem.active) return;
    
    tutorialSystem.messages.forEach((message, index) => {
        setTimeout(() => {
            if (tutorialSystem.active && tutorialSystem.currentStep === index) {
                showMissionCommandAlert(message.title, message.text);
                tutorialSystem.currentStep++;
                
                // Add completion check for the last message:
                if (index === tutorialSystem.messages.length - 1) {
                    setTimeout(() => {
                        completeTutorial();
                    }, 15000); // Complete after 15 seconds or manual dismiss
                }
            }
        }, message.delay);
    });
}

// ⭐ NEW: Function to immediately advance to next tutorial message
function showNextTutorialMessage() {
    if (!tutorialSystem.active || tutorialSystem.currentStep >= tutorialSystem.messages.length) {
        // No more messages, complete tutorial
        completeTutorial();
        return;
    }

    const nextMessage = tutorialSystem.messages[tutorialSystem.currentStep];
    if (nextMessage) {
        showMissionCommandAlert(nextMessage.title, nextMessage.text);
        tutorialSystem.currentStep++;

        // Check if this was the last message
        if (tutorialSystem.currentStep >= tutorialSystem.messages.length) {
            setTimeout(() => {
                completeTutorial();
            }, 15000); // Complete after 15 seconds or manual dismiss
        }
    } else {
        completeTutorial();
    }
}

// Add this new function:
function completeTutorial() {
    console.log('Completing tutorial...');

    tutorialSystem.completed = true;
    tutorialSystem.active = false;
    tutorialSystem.completionTime = Date.now();
    
    // Force hide the mission command alert
    const alertElement = document.getElementById('missionCommandAlert');
    if (alertElement) {
        alertElement.classList.add('hidden');
    }
    
    showAchievement('Training Complete', 'All hostile forces are now active - good luck, Captain!');
    
    // Ensure enemies are activated
    if (typeof enemies !== 'undefined') {
        enemies.forEach(enemy => {
            if (enemy.userData) {
                // Mark enemies as ready for activation (they'll activate when player gets close)
                enemy.userData.tutorialComplete = true;
            }
        });
    }
    
    // Update enemy behavior to activate
    if (typeof refreshEnemyDifficulty === 'function') {
        refreshEnemyDifficulty();
    }
    
    // Force UI update to reflect enemy activation
    if (typeof detectEnemiesInRegion === 'function') {
        detectEnemiesInRegion();
    }
    
    console.log('Tutorial completed - enemies now active');
}

// Typewriter reveal for comms text (Mission Command + incoming transmissions)
// — types in with a soft blip and a blinking block cursor. The timer is stored
// per-element (el._mcTimer) so independent channels can type simultaneously.
function _mcBlip() {
    if (typeof audioContext === 'undefined' || !audioContext || audioContext.state !== 'running') return;
    const o = audioContext.createOscillator(), g = audioContext.createGain();
    o.type = 'square';
    o.frequency.value = 1150 + Math.random() * 500;
    g.gain.value = 0.012;
    o.connect(g); g.connect(audioContext.destination);
    const t = audioContext.currentTime;
    o.start(t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.stop(t + 0.05);
}
function _typewriterReveal(el, text, onDone) {
    if (el._mcTimer) { clearInterval(el._mcTimer); el._mcTimer = null; }
    const full = String(text == null ? '' : text);
    el.textContent = '';
    el.scrollTop = 0;
    // Very long lore: skip the effect so reads aren't slow (onDone gets true =
    // "shown instantly" so the caller knows to auto-scroll instead of relying
    // on the typewriter's follow to have revealed it).
    if (full.length > 600) { el.textContent = full; if (onDone) onDone(true); return; }
    let i = 0;
    // Reveal speed: short lore types char-by-char for feel; medium/long step
    // faster so reads don't drag (and to absorb timer throttling under load).
    const step = full.length > 240 ? 3 : (full.length > 110 ? 2 : 1);
    el.classList.add('mc-typing');
    const flush = () => {
        if (el._mcTimer) { clearInterval(el._mcTimer); el._mcTimer = null; }
        el.textContent = full;
        el.classList.remove('mc-typing');
        if (onDone) onDone(false);
    };
    el._mcFlush = flush;
    el._mcTimer = setInterval(() => {
        i += step;
        el.textContent = full.slice(0, i);
        el.scrollTop = el.scrollHeight;   // follow the latest line as it types
        if (i % 6 < step) { try { _mcBlip(); } catch (e) {} }   // soft blip ~every 6 chars
        if (i >= full.length) flush();
    }, 16);
}

// Shared dismiss for the comms panel: hide, restore the gameplay cursor, flush
// any deferred achievements, and resume the game if it was paused for a message.
let _mcDismissTimer = null, _mcScrollRAF = null;
function _dismissMissionAlert() {
    if (_mcDismissTimer) { clearTimeout(_mcDismissTimer); _mcDismissTimer = null; }
    if (_mcScrollRAF) { cancelAnimationFrame(_mcScrollRAF); _mcScrollRAF = null; }
    const alertElement = document.getElementById('missionCommandAlert');
    if (alertElement) alertElement.classList.add('hidden');
    document.body.style.cursor = 'none';
    if (typeof renderer !== 'undefined' && renderer.domElement) renderer.domElement.style.cursor = 'none';
    if (window._deferredAchievements && window._deferredAchievements.length) {
        const queue = window._deferredAchievements.slice();
        window._deferredAchievements = [];
        queue.forEach((a, i) => setTimeout(() => showAchievement(a.title, a.description, a.playAchievementSound), 400 * i));
    }
    if (typeof gameState !== 'undefined' && gameState.paused) {
        gameState.paused = false;
        const pauseBtn = document.getElementById('pauseBtn');
        const pauseIcon = document.getElementById('pauseIcon');
        if (pauseBtn) pauseBtn.classList.remove('paused');
        if (pauseIcon) pauseIcon.className = 'fas fa-pause mr-1';
    }
}

// Smoothly scroll a comms element from top to its bottom over `ms`.
function _mcSmoothScroll(el, distance, ms) {
    if (_mcScrollRAF) { cancelAnimationFrame(_mcScrollRAF); _mcScrollRAF = null; }
    let start = null;
    const step = (now) => {
        if (start === null) start = now;
        const t = Math.min(1, (now - start) / ms);
        el.scrollTop = distance * t;
        if (t < 1) _mcScrollRAF = requestAnimationFrame(step);
    };
    _mcScrollRAF = requestAnimationFrame(step);
}

// After a message finishes revealing: if it overflows the 2-line window, wait
// ~1s then slowly auto-scroll to the bottom so the whole message displays
// without the player touching the mouse. NO auto-dismiss — messages persist
// until SKIP (or, for tutorial, until the next scheduled step replaces them).
function _scheduleCommsAutoScroll(textEl) {
    if (_mcScrollRAF) { cancelAnimationFrame(_mcScrollRAF); _mcScrollRAF = null; }
    const overflow = Math.max(0, textEl.scrollHeight - textEl.clientHeight);
    if (overflow <= 2) return;
    textEl.scrollTop = 0;
    const scrollMs = Math.min(16000, Math.max(2600, overflow * 28));
    setTimeout(() => _mcSmoothScroll(textEl, overflow, scrollMs), 1000);
}

// Auto-dismiss a (non-tutorial) message once it's been read: a long message
// that auto-scrolls is held until the scroll finishes + a beat; a short one
// gets a read beat scaled to its length. No button — it just disappears.
function _scheduleCommsAutoDismiss(textEl, overflowed) {
    if (_mcDismissTimer) { clearTimeout(_mcDismissTimer); _mcDismissTimer = null; }
    let delay;
    if (overflowed) {
        const overflow = Math.max(0, textEl.scrollHeight - textEl.clientHeight);
        const scrollMs = Math.min(16000, Math.max(2600, overflow * 28));
        delay = 1000 + scrollMs + 2600;   // 1s pre-scroll pause + scroll + read beat
    } else {
        delay = Math.max(5000, (textEl.textContent || '').length * 55);
    }
    _mcDismissTimer = setTimeout(_dismissMissionAlert, delay);
}
// Expose for other modules (e.g. showIncomingTransmission in game-objects.js).
if (typeof window !== 'undefined') window.__commsTypewriter = _typewriterReveal;

function showMissionCommandAlert(title, text, isVictoryMessage = false, channelColor = null) {
    const alertElement = document.getElementById('missionCommandAlert');
    const titleElement = alertElement ? alertElement.querySelector('h2') : null;
    const textElement = document.getElementById('missionCommandText');
    
    if (!alertElement || !titleElement || !textElement) {
        console.warn('Tutorial elements not found');
        return;
    }
    
    // Show cursor so player can click UNDERSTOOD button
    document.body.style.cursor = 'auto';
    if (typeof renderer !== 'undefined' && renderer.domElement) {
        renderer.domElement.style.cursor = 'auto';
    }
    
    titleElement.textContent = title;
    // Channel colour: default is mission-control green (from CSS). A transmission
    // can pass a colour (cyan lore / yellow distress / orange ship-to-ship) and
    // we override the title + body inline (caret inherits via currentColor).
    if (channelColor) {
        const glow = `0 0 8px ${channelColor}, 0 0 16px ${channelColor}88, 0 2px 5px rgba(0,0,0,0.95)`;
        titleElement.style.setProperty('color', channelColor, 'important');
        titleElement.style.setProperty('text-shadow', glow, 'important');
        textElement.style.setProperty('color', channelColor, 'important');
        textElement.style.setProperty('text-shadow', glow, 'important');
    } else {
        // Reset to the green default so a prior coloured message doesn't linger.
        titleElement.style.removeProperty('color');
        titleElement.style.removeProperty('text-shadow');
        textElement.style.removeProperty('color');
        textElement.style.removeProperty('text-shadow');
    }
    if (_mcScrollRAF) { cancelAnimationFrame(_mcScrollRAF); _mcScrollRAF = null; }
    if (_mcDismissTimer) { clearTimeout(_mcDismissTimer); _mcDismissTimer = null; }
    alertElement.classList.remove('hidden');
    // Reveal style by length: a message that fits the 2-line window types in
    // with the block cursor; a longer one appears at once then, after ~1s,
    // slowly auto-scrolls so the whole thing displays hands-free. (Measuring is
    // synchronous here — set full text, read scrollHeight, decide — so there's
    // no visible flash before the typewriter clears it.)
    textElement.classList.remove('mc-typing');
    textElement.textContent = (text == null ? '' : String(text));
    textElement.scrollTop = 0;
    const commsOverflow = textElement.scrollHeight > textElement.clientHeight + 2;
    if (commsOverflow) {
        _scheduleCommsAutoScroll(textElement);
    } else {
        _typewriterReveal(textElement, text);
    }
    
    // Get or create button container
    const buttonContainer = alertElement.querySelector('.text-center');
    if (!buttonContainer) return;
    
    // Clear previous button ROWS entirely — not just the <button>s. The
    // wrapper divs (each with its own margin-top) were accumulating on every
    // message, pushing the buttons down and the text up. Remove the rows too.
    buttonContainer.querySelectorAll('.mc-btnrow').forEach(row => row.remove());
    buttonContainer.querySelectorAll('button').forEach(btn => btn.remove());
    
    // Determine if this is a tutorial message
    const isTutorialActive = tutorialSystem && tutorialSystem.active && !tutorialSystem.completed;
    
    // Check if this is the final tutorial message
    const isFinalTutorialMessage = title === "Final Orders";
    
    if (isTutorialActive && !isVictoryMessage) {
        // Tutorial: a single SKIP TUTORIAL button (no UNDERSTOOD — the tutorial
        // auto-advances on its own ~10s schedule; the message just persists
        // until the next step replaces it).
        const row = document.createElement('div');
        row.className = 'mc-btnrow';
        row.style.cssText = 'display:flex;justify-content:center;margin-top:1rem;width:100%;';

        const skipButton = document.createElement('button');
        skipButton.id = 'missionCommandSkip';
        skipButton.className = 'space-btn rounded px-6 py-2';
        skipButton.innerHTML = '<i class="fas fa-forward mr-2"></i>SKIP TUTORIAL';
        skipButton.style.cssText = `
            background: linear-gradient(135deg, rgba(255, 150, 0, 0.5), rgba(200, 100, 0, 0.5));
            border-color: rgba(255, 200, 0, 0.6);
            pointer-events: auto;
            touch-action: manipulation;
            -webkit-tap-highlight-color: rgba(255, 150, 0, 0.3);
            cursor: pointer;
            white-space: nowrap;
            min-width: 140px;
        `;
        row.appendChild(skipButton);

        const handleSkip = () => {
            _dismissMissionAlert();
            if (tutorialSystem.active) {
                tutorialSystem.active = false;
                completeTutorial();
                showAchievement('Tutorial Skipped', 'All hostile forces are now active!');
            }
        };
        skipButton.onclick = handleSkip;
        skipButton.ontouchend = (e) => { e.preventDefault(); e.stopPropagation(); handleSkip(); };

        buttonContainer.appendChild(row);
    } else {
        // Lore / transmission / victory: no button — these messages reveal
        // (typing or slow auto-scroll), then disappear on their own after a
        // read beat, like a normal transmission.
        _scheduleCommsAutoDismiss(textElement, commsOverflow);
    }

    // Only play sound if not suppressed
if (typeof gameState === 'undefined' || !gameState.suppressAchievements) {
        playSound('achievement');
}
}

// =============================================================================
// INCOMING TRANSMISSION — delivers a discovery/comms message straight to the
// chrome-less comms panel (no separate READ/SKIP prompt). The discovery path
// opens on its own when the area is found; here the lore just scrolls in below,
// colour-coded by channel, and stays up until the player clicks SKIP.
// =============================================================================

function showIncomingTransmission(title, text, factionColor) {
    // Classify the comms channel -> colour. distress=yellow, lore=cyan,
    // ship-to-ship=orange. (Direct command briefings stay mission-control green.)
    let channel;
    if (factionColor === true || /distress|mayday|under\s*(attack|fire)/i.test(String(title))) channel = 'distress';
    else if (/mission control/i.test(String(title))) channel = 'lore';
    else channel = 'ship';
    const colorHex = { distress: '#ffd633', lore: '#00e5ff', ship: '#ff9a33' }[channel];

    // Short comm-link beep, then deliver straight to the comms panel.
    if (typeof playSound === 'function') playSound('achievement');
    showMissionCommandAlert(title, text, false, colorHex);
}

// =============================================================================
// ENHANCED AUDIO SYSTEM - RESTORED from game-controls13.js (WORKING VERSION)
// =============================================================================

function initAudio() {
    // Guard: only create the AudioContext once. initAudio is called from 5+
    // places (intro ENTER, mobile touch, event setup, etc). Without this
    // guard each call created a NEW AudioContext with new gain nodes — the
    // old context kept running at default gain (1.0) alongside the new one,
    // causing a loud burst on the first few sounds until the old context's
    // oscillators expired.
    if (audioContext) return;

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
        // Use setValueAtTime instead of .value = to guarantee the gain is
        // active on the AudioContext timeline BEFORE any oscillator starts.
        // Direct .value assignment on a brand-new context can race with the
        // first scheduled sounds, causing a loud initial burst.
        masterGain.gain.setValueAtTime(0.35, 0);

        // Create separate gains for music and effects
        musicGain = audioContext.createGain();
        effectsGain = audioContext.createGain();
        musicGain.connect(masterGain);
        effectsGain.connect(masterGain);

        musicGain.gain.setValueAtTime(0.4, 0);
        // effectsGain at unity — per-sound gain values (0.3 weapon, 0.4
        // explosion, etc) are the real volume controls. masterGain alone
        // sets the overall level. The old 0.2 × 0.2 = 0.04 chain made
        // weapon peaks inaudible at 0.012 once the duplicate-AudioContext
        // bug was fixed.
        effectsGain.gain.setValueAtTime(1.0, 0);
        
        console.log('Enhanced audio system initialized (waiting for user interaction)');
        // Preload MP3 soundtrack alongside synth audio
        if (typeof soundtrack !== 'undefined' && soundtrack.preload) {
            soundtrack.preload();
        }
    } catch (e) {
        console.warn('Audio not supported');
    }
}

function resumeAudioContext() {
    // While the GAME is paused, the context is suspended on purpose — a
    // stray keypress must not bring the audio back mid-pause. togglePause
    // resumes it explicitly.
    if (typeof gameState !== 'undefined' && gameState.paused) return;
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('AudioContext resumed after user interaction');
            // Start background music after user interaction
            if (musicSystem.enabled && !musicSystem.backgroundMusic) {
                startBackgroundMusic();
            }
        });
    }
}

function startBackgroundMusic() {
    if (!audioContext || !musicSystem.enabled || audioContext.state === 'suspended') {
        return;
    }

    // Create eerie ambient space music
    createAmbientSpaceMusic();
}

// RESTORED: Working ambient music from game-controls13.js
function createAmbientSpaceMusic() {
    if (!audioContext) return;
    
    // Low frequency ambient drone
    const bassOsc = audioContext.createOscillator();
    const bassGain = audioContext.createGain();
    bassOsc.connect(bassGain);
    bassGain.connect(musicGain);
    
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(40, audioContext.currentTime);
    bassGain.gain.setValueAtTime(0.1, audioContext.currentTime);
    
    // Slow frequency modulation for eerie effect
    const lfo1 = audioContext.createOscillator();
    const lfo1Gain = audioContext.createGain();
    lfo1.connect(lfo1Gain);
    lfo1Gain.connect(bassOsc.frequency);
    lfo1.type = 'sine';
    lfo1.frequency.setValueAtTime(0.05, audioContext.currentTime);
    lfo1Gain.gain.setValueAtTime(5, audioContext.currentTime);
    
    // High frequency pad
    const padOsc = audioContext.createOscillator();
    const padGain = audioContext.createGain();
    const padFilter = audioContext.createBiquadFilter();
    
    padOsc.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(musicGain);
    
    padOsc.type = 'sawtooth';
    padOsc.frequency.setValueAtTime(110, audioContext.currentTime);
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(400, audioContext.currentTime);
    padGain.gain.setValueAtTime(0.03, audioContext.currentTime);
    
    // Slow LFO for pad filter
    const lfo2 = audioContext.createOscillator();
    const lfo2Gain = audioContext.createGain();
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(padFilter.frequency);
    lfo2.type = 'sine';
    lfo2.frequency.setValueAtTime(0.1, audioContext.currentTime);
    lfo2Gain.gain.setValueAtTime(200, audioContext.currentTime);
    
    // Mystery tone generator (RESTORED from game-controlsX2.js)
    const mysteryOsc = audioContext.createOscillator();
    const mysteryGain = audioContext.createGain();
    const mysteryFilter = audioContext.createBiquadFilter();
    
    mysteryOsc.connect(mysteryFilter);
    mysteryFilter.connect(mysteryGain);
    mysteryGain.connect(musicGain);
    
    mysteryOsc.type = 'triangle';
    mysteryOsc.frequency.setValueAtTime(220, audioContext.currentTime);
    mysteryFilter.type = 'lowpass';
    mysteryFilter.frequency.setValueAtTime(800, audioContext.currentTime);
    mysteryGain.gain.setValueAtTime(0, audioContext.currentTime);
    
    // Start all oscillators
    const startTime = audioContext.currentTime;
    bassOsc.start(startTime);
    lfo1.start(startTime);
    padOsc.start(startTime);
    lfo2.start(startTime);
    mysteryOsc.start(startTime);
    
    // IMPROVED: Mystery tone scheduler with better cleanup to prevent stuck sounds
    let mysteryTimeoutId = null;
    function triggerMysteryTone() {
        // Clear any previous timeout
        if (mysteryTimeoutId) {
            clearTimeout(mysteryTimeoutId);
            mysteryTimeoutId = null;
        }

        // Check if music is still enabled and context is valid
        if (!musicSystem.enabled || !musicSystem.backgroundMusic) return;
        if (!audioContext || audioContext.state === 'closed') return;

        const frequencies = [110, 146.83, 164.81, 220, 293.66, 329.63];
        const freq = frequencies[Math.floor(Math.random() * frequencies.length)];
        const now = audioContext.currentTime;

        // Ensure we start from 0 to prevent stuck sounds
        mysteryGain.gain.cancelScheduledValues(now);
        mysteryGain.gain.setValueAtTime(0, now);
        mysteryGain.gain.linearRampToValueAtTime(0.04, now + 2); // Fade in
        mysteryGain.gain.linearRampToValueAtTime(0.001, now + 8); // Fade out completely

        mysteryOsc.frequency.setValueAtTime(freq, now);

        // Schedule next tone with stored timeout ID
        mysteryTimeoutId = setTimeout(triggerMysteryTone, 8000 + Math.random() * 12000);
    }

    setTimeout(triggerMysteryTone, 5000);

    // Store timeout ID for cleanup
    if (!musicSystem.mysteryTimeout) {
        musicSystem.mysteryTimeout = mysteryTimeoutId;
    }
    
    // Store references
    musicSystem.backgroundMusic = {
        stop: () => {
            try {
                bassOsc.stop();
                lfo1.stop();
                padOsc.stop();
                lfo2.stop();
                mysteryOsc.stop();
            } catch(e) {
                // Oscillators already stopped, ignore error
            }
        }
    };
}

function createBattleMusic() {
    if (!audioContext || !musicSystem.enabled) return;

    // Old synthesized battle-music layer RETIRED. switchToBattleMusic() already
    // plays Boss Fight.mp3 via soundtrack.forceTrack('bossFight'); this synth
    // (menacing sawtooth bass/pad/lead) used to play SIMULTANEOUSLY behind it —
    // the "boss sound effect heard behind Boss Fight.mp3" we were asked to
    // disable. It's raw Web Audio (bypasses playSound), which is why the
    // playSound('boss') guard didn't silence it. Return before creating any
    // oscillators; remove this `return` to bring the synth layer back. A
    // harmless stub is set so switchToAmbientMusic()'s cleanup still runs
    // (fades the ambient layer back in + restores music gain after the fight) —
    // it just has nothing real to stop.
    musicSystem.battleMusic = { stop() {} };
    return;

    // MENACING SYNTH-WAVE BOSS MUSIC
    
    // Deep, ominous bass synth
    const bassOsc = audioContext.createOscillator();
    const bassGain = audioContext.createGain();
    const bassFilter = audioContext.createBiquadFilter();
    
    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(musicGain);
    
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.setValueAtTime(55, audioContext.currentTime); // Low A
    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(200, audioContext.currentTime);
    bassGain.gain.setValueAtTime(0.15, audioContext.currentTime);
    
    // Dark atmospheric pad
    const padOsc = audioContext.createOscillator();
    const padGain = audioContext.createGain();
    const padFilter = audioContext.createBiquadFilter();
    
    padOsc.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(musicGain);
    
    padOsc.type = 'sawtooth';
    padOsc.frequency.setValueAtTime(110, audioContext.currentTime); // Low A octave
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(800, audioContext.currentTime);
    padGain.gain.setValueAtTime(0.08, audioContext.currentTime);
    
    // Menacing lead synth
    const leadOsc = audioContext.createOscillator();
    const leadGain = audioContext.createGain();
    const leadFilter = audioContext.createBiquadFilter();
    
    leadOsc.connect(leadFilter);
    leadFilter.connect(leadGain);
    leadGain.connect(musicGain);
    
    leadOsc.type = 'square';
    leadOsc.frequency.setValueAtTime(220, audioContext.currentTime);
    leadFilter.type = 'lowpass';
    leadFilter.frequency.setValueAtTime(1200, audioContext.currentTime);
    leadGain.gain.setValueAtTime(0.06, audioContext.currentTime);
    
    // Epic chord progression and melody
    function playEpicSequence() {
        if (!musicSystem.inBattle) return;
        
        // Menacing minor chord progression: Am - F - C - G
        const chordProgression = [
            [220, 264, 330], // A minor
            [175, 220, 264], // F major (lower)
            [264, 330, 396], // C major
            [196, 247, 294]  // G major
        ];
        
        // Dark melody over chords
        const melody = [220, 247, 264, 294, 330, 294, 264, 220];
        const now = audioContext.currentTime;
        
        chordProgression.forEach((chord, chordIndex) => {
            const chordTime = now + chordIndex * 2; // 2 seconds per chord
            
            // Bass note
            bassOsc.frequency.setValueAtTime(chord[0] * 0.5, chordTime);
            
            // Pad chord
            padOsc.frequency.setValueAtTime(chord[1], chordTime);
            
            // Lead melody (2 notes per chord)
            const melodyNote1 = melody[chordIndex * 2];
            const melodyNote2 = melody[chordIndex * 2 + 1];
            
            leadOsc.frequency.setValueAtTime(melodyNote1, chordTime);
            leadOsc.frequency.setValueAtTime(melodyNote2, chordTime + 1);
        });
        
        setTimeout(playEpicSequence, 8000); // Repeat every 8 seconds
    }
    
    const startTime = audioContext.currentTime;
    bassOsc.start(startTime);
    padOsc.start(startTime);
    leadOsc.start(startTime);
    
    playEpicSequence();
    
    musicSystem.battleMusic = {
        stop: () => {
            try {
                bassOsc.stop();
                padOsc.stop();
                leadOsc.stop();
            } catch(e) {
                // Oscillators already stopped, ignore error
            }
        }
    };
}

function switchToBattleMusic() {
    if (musicSystem.inBattle || !musicSystem.enabled) return;

    // Resume audio context if suspended (critical for boss music)
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('AudioContext resumed for boss battle music');
        });
    }

    musicSystem.inBattle = true;

    // Also have the MP3 soundtrack switch to its boss-fight track —
    // both layers play simultaneously, like sound effects layering
    // over background music.
    if (typeof soundtrack !== 'undefined' && soundtrack.enabled) {
        soundtrack.forceTrack('bossFight');
    }
    
    // Fade out ambient music
    if (musicSystem.backgroundMusic) {
        musicGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
        setTimeout(() => {
            if (musicSystem.backgroundMusic) {
                musicSystem.backgroundMusic.stop();
                musicSystem.backgroundMusic = null;
            }
            // Start battle music
            createBattleMusic();
            musicGain.gain.setValueAtTime(0.001, audioContext.currentTime);
            musicGain.gain.exponentialRampToValueAtTime(0.4, audioContext.currentTime + 0.5);
            console.log('🎵 Boss battle music started!');
        }, 1000);
    } else {
        // No background music playing, start battle music immediately
        createBattleMusic();
        musicGain.gain.setValueAtTime(0.001, audioContext.currentTime);
        musicGain.gain.exponentialRampToValueAtTime(0.4, audioContext.currentTime + 0.5);
        console.log('🎵 Boss battle music started immediately!');
    }
}

function switchToAmbientMusic() {
    if (!musicSystem.inBattle || !musicSystem.enabled) return;

    musicSystem.inBattle = false;
    
    // Fade out battle music
    if (musicSystem.battleMusic) {
        musicGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
        setTimeout(() => {
            if (musicSystem.battleMusic) {
                musicSystem.battleMusic.stop();
            }
            // Restart ambient music
            createAmbientSpaceMusic();
            musicGain.gain.setValueAtTime(0.001, audioContext.currentTime);
            musicGain.gain.exponentialRampToValueAtTime(0.4, audioContext.currentTime + 1);
        }, 500);
    }
}

// SFX MUTE: silences every synthesized effect (weapons, hits, explosions,
// enemy lasers — everything routed through effectsGain) without touching
// the music. Wired to the SFX button next to Music.
function toggleSfx() {
    window._sfxMuted = !window._sfxMuted;
    if (typeof effectsGain !== 'undefined' && effectsGain && audioContext) {
        const v = window._sfxMuted ? 0 : 1;
        effectsGain.gain.value = v;   // immediate
        effectsGain.gain.setValueAtTime(v, audioContext.currentTime);  // cancel-proof
    }
    const icon = document.getElementById('sfxIcon');
    const btn = document.getElementById('sfxBtn');
    if (icon) icon.className = window._sfxMuted
        ? 'fas fa-volume-mute text-red-400 mr-1'
        : 'fas fa-bullhorn text-cyan-400 mr-1';
    if (btn) btn.classList.toggle('muted', !!window._sfxMuted);
    console.log('🔊 SFX ' + (window._sfxMuted ? 'muted' : 'unmuted'));
}
if (typeof window !== 'undefined') {
    window.toggleSfx = toggleSfx;
    const _wireSfxBtn = () => {
        const btn = document.getElementById('sfxBtn');
        if (btn && !btn._wired) { btn._wired = true; btn.addEventListener('click', toggleSfx); }
    };
    if (window.Boot) window.Boot.whenReady('dom', _wireSfxBtn);
    else setTimeout(_wireSfxBtn, 1000);
}

function toggleMusic() {
    musicSystem.enabled = !musicSystem.enabled;
    const muteIcon = document.getElementById('muteIcon');
    const muteBtn = document.getElementById('muteBtn');
    const mobileIcon = document.getElementById('mobileMusicIcon');
    const mobileBtn = document.getElementById('mobileMusicBtn');

    console.log('🔊 toggleMusic called, enabled:', musicSystem.enabled);

    if (musicSystem.enabled) {
        if (muteIcon) muteIcon.className = 'fas fa-volume-up text-cyan-400 mr-1';
        if (muteBtn) muteBtn.classList.remove('muted');
        if (mobileIcon) mobileIcon.className = 'fas fa-volume-up';
        if (mobileBtn) mobileBtn.classList.remove('muted');
        if (musicGain && audioContext) {
            musicGain.gain.setValueAtTime(0.4, audioContext.currentTime);
        }
        
        // Restart appropriate music
        if (musicSystem.inBattle) {
            createBattleMusic();
        } else {
            startBackgroundMusic();
        }
        // Note: MP3 soundtrack mute is handled by the delegation handler
        // in game-music.js (single source of truth — avoids double toggle).
        console.log('🎵 Music unmuted');
    } else {
        if (muteIcon) muteIcon.className = 'fas fa-volume-mute text-red-400 mr-1';
        if (muteBtn) muteBtn.classList.add('muted');
        if (mobileIcon) mobileIcon.className = 'fas fa-volume-mute';
        if (mobileBtn) mobileBtn.classList.add('muted');
        if (musicGain && audioContext) {
            musicGain.gain.setValueAtTime(0, audioContext.currentTime);
        }
        
        // Stop all music
        if (musicSystem.backgroundMusic) {
            musicSystem.backgroundMusic.stop();
            musicSystem.backgroundMusic = null;
        }
        if (musicSystem.battleMusic) {
            musicSystem.battleMusic.stop();
            musicSystem.battleMusic = null;
        }
        // Note: MP3 soundtrack mute is handled by the delegation handler
        // in game-music.js (single source of truth — avoids double toggle).
        console.log('🔇 Music muted');
    }
}

// RESTORED: Working sound parameters from game-controls13.js
function playSound(type, frequency = 440, duration = 0.2) {
    if (!audioContext || audioContext.state === 'suspended') {
        return;
    }

    // Boss SFX retired: the Boss Fight.mp3 music track now covers boss
    // appearances, so the old synthesized 'boss' stinger is disabled. (Called
    // from game-objects.js x2 and outer-systems.js; guarded here centrally.)
    if (type === 'boss') return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.connect(gain);
    // Battle SFX trim (player feedback): weapons, hits, damage and
    // explosions ride 20% quieter; ambient/UI sounds are unchanged. The
    // trim is a separate node so each case's scheduled gain ramps stay
    // exactly as tuned.
    const _COMBAT_SFX = {
        weapon: 1, shield_hit: 1, damage: 1, explosion: 1, enemy_fire: 1,
        missile_explosion: 1, missile_launch: 1, death_boom: 1,
        death_rumble: 1, ship_vaporize: 1
    };
    if (_COMBAT_SFX[type]) {
        const _trim = audioContext.createGain();
        _trim.gain.value = 0.8;
        gain.connect(_trim);
        _trim.connect(effectsGain);
    } else {
        gain.connect(effectsGain);
    }

    switch (type) {
        case 'weapon':
            // Per-shot pitch jitter so rapid fire doesn't feel
            // monotonous. ~±4% around the base 800→400Hz sweep.
            {
                const j = 1 + (Math.random() - 0.5) * 0.08;
                oscillator.frequency.setValueAtTime(800 * j, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(400 * j, audioContext.currentTime + 0.1);
            }
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            oscillator.type = 'square';
            duration = 0.1;
            break;
            
        case 'shield_hit':
            console.log('🎵 Playing shield_hit sound - CASE REACHED'); // ADD THIS
            // Energy absorption sound - swoops down like impact being deadened
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.15);
            gain.gain.setValueAtTime(0.25, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
            oscillator.type = 'sine'; // Smooth, muffled sound
            duration = 0.15;
            break;
            
        case 'explosion':
            oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.4);
            gain.gain.setValueAtTime(0.4, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
            oscillator.type = 'sawtooth';
            duration = 0.4;
            break;
        case 'death_boom':
            // Deep, sustained game-over rumble. Longer envelope and
            // lower frequency floor than 'explosion' so the layered
            // death sequence reads as a finishing blow rather than a
            // generic hit.
            oscillator.frequency.setValueAtTime(120, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(28, audioContext.currentTime + 1.5);
            gain.gain.setValueAtTime(0.7, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.6);
            oscillator.type = 'sawtooth';
            duration = 1.6;
            break;
        case 'death_rumble':
            // Sub-bass tail that sits under the booms for body.
            oscillator.frequency.setValueAtTime(48, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(22, audioContext.currentTime + 2.2);
            gain.gain.setValueAtTime(0.55, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 2.2);
            oscillator.type = 'sine';
            duration = 2.2;
            break;
        case 'damage':
            oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
            gain.gain.setValueAtTime(0.5, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            oscillator.type = 'square';
            duration = 0.3;
            break;
        case 'achievement':
            oscillator.frequency.setValueAtTime(523, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2);
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
            oscillator.type = 'sine';
            duration = 0.4;
            break;
        case 'warp':
            oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(2000, audioContext.currentTime + 1.2);
            gain.gain.setValueAtTime(0.4, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.2);
            oscillator.type = 'sine';
            duration = 1.2;
            break;
        case 'blackhole_warp':
    // FIXED: Softer black hole warp sound with less rumble
    oscillator.frequency.setValueAtTime(100, audioContext.currentTime); // Higher frequency = less rumble
    oscillator.frequency.exponentialRampToValueAtTime(2500, audioContext.currentTime + 2.0);
    gain.gain.setValueAtTime(0.3, audioContext.currentTime); // Much quieter start
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 2.0);
    oscillator.type = 'sine'; // Smoother wave = less harsh
    duration = 2.0;
    break;
        case 'wormhole_warp':
    // Shimmering, otherworldly sweep — distinct from the deep
    // black-hole rumble. A high triangle tone that wobbles UP then
    // resolves, evoking spatial folding rather than gravitational
    // collapse.
    oscillator.frequency.setValueAtTime(420, audioContext.currentTime);
    oscillator.frequency.linearRampToValueAtTime(1700, audioContext.currentTime + 0.5);
    oscillator.frequency.linearRampToValueAtTime(700, audioContext.currentTime + 1.0);
    oscillator.frequency.exponentialRampToValueAtTime(2600, audioContext.currentTime + 1.8);
    gain.gain.setValueAtTime(0.28, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.8);
    oscillator.type = 'triangle';
    duration = 1.8;
    break;
        case 'enemy_fire':
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(300, audioContext.currentTime + 0.2);
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            oscillator.type = 'sawtooth';
            duration = 0.2;
            break;
		case 'shield_hit':
    // Energy absorption sound - swoops down like impact being deadened
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    oscillator.type = 'sine'; // Smooth, muffled sound
    duration = 0.15;
    break;
		case 'boss':
    		// Deep, menacing boss sound
    		oscillator.frequency.setValueAtTime(80, audioContext.currentTime);
   			oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.5);
   			oscillator.frequency.exponentialRampToValueAtTime(60, audioContext.currentTime + 1.0);
    		gain.gain.setValueAtTime(0.6, audioContext.currentTime);
    		gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.2);
    		oscillator.type = 'sawtooth';
    		duration = 1.2;
    		break;
        case 'missile_launch':
            oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.3);
            gain.gain.setValueAtTime(0.4, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            oscillator.type = 'sawtooth';
            duration = 0.3;
            break;

        case 'missile_explosion':
            oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.6);
            gain.gain.setValueAtTime(0.5, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
            oscillator.type = 'sawtooth';
            duration = 0.6;
            break;

        case 'ship_vaporize':
            // Dramatic vaporizing sound - starts high and sweeps down
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(20, audioContext.currentTime + 1.5);
            gain.gain.setValueAtTime(0.7, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);
            oscillator.type = 'sawtooth';
            duration = 1.5;
            break;
        default:
            oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
            gain.gain.setValueAtTime(0.2, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
            oscillator.type = 'sine';
    }
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
}

// =============================================================================
// FACTION-FLAVOURED LASER SOUNDS
//
// Each hostile faction (and the special set: bosses, guardians, Borg, UFOs,
// Martian Pirates) gets its own oscillator profile so a busy fight reads
// as distinct voices instead of one generic blaster loop. Bossy / heavy
// shooters get a second layered oscillator for body. Every shot gets a
// ~±4% pitch jitter so rapid fire feels alive, not metronomic.
// =============================================================================
const ENEMY_LASER_PROFILES = {
    // 8 canonical hostile factions
    'Federation':            { type: 'square',   f0:  720, f1:  480, dur: 0.13, gain: 0.28 },
    'Klingon Empire':        { type: 'sawtooth', f0:  380, f1:  200, dur: 0.20, gain: 0.32,
                               layer: { type: 'sine',     f0:   95, f1:   60, dur: 0.20, gain: 0.18 } },
    'Rebel Alliance':        { type: 'square',   f0:  850, f1:  520, dur: 0.13, gain: 0.28 },
    'Romulan Star Empire':   { type: 'sine',     f0:  500, f1:  200, dur: 0.22, gain: 0.30,
                               layer: { type: 'triangle', f0: 1100, f1:  700, dur: 0.22, gain: 0.16 } },
    'Galactic Empire':       { type: 'sawtooth', f0: 1100, f1:  600, dur: 0.09, gain: 0.30 },
    'Cardassian Union':      { type: 'triangle', f0:  480, f1:  240, dur: 0.18, gain: 0.30 },
    'Sith Empire':           { type: 'square',   f0: 1500, f1:  180, dur: 0.16, gain: 0.32 },
    'Vulcan High Command':   { type: 'sine',     f0:  720, f1:  480, dur: 0.13, gain: 0.28 },
    // Special enemy categories
    'pirate':                { type: 'sawtooth', f0:  700, f1:  350, dur: 0.18, gain: 0.30 },
    'borg':                  { type: 'square',   f0:  220, f1:  110, dur: 0.25, gain: 0.32,
                               layer: { type: 'sine',     f0:   65, f1:   50, dur: 0.25, gain: 0.20 } },
    'ufo':                   { type: 'sine',     f0: 1800, f1: 1500, dur: 0.22, gain: 0.26,
                               layer: { type: 'triangle', f0: 2400, f1: 2100, dur: 0.22, gain: 0.14 } },
    'boss':                  { type: 'sawtooth', f0:  280, f1:  140, dur: 0.30, gain: 0.42,
                               layer: { type: 'square',   f0:   90, f1:   55, dur: 0.30, gain: 0.22 } },
    'guardian':              { type: 'sawtooth', f0:  320, f1:  180, dur: 0.22, gain: 0.38,
                               layer: { type: 'sine',     f0:  100, f1:   60, dur: 0.22, gain: 0.20 } },
    'default':               { type: 'sawtooth', f0:  600, f1:  300, dur: 0.20, gain: 0.30 }
};

// Resolve an enemy object → profile key. Type-based wins (boss/guardian/
// Borg/UFO/pirate) override faction so a Klingon BOSS sounds like a boss,
// not a Klingon fighter.
function _enemyFactionKey(enemy) {
    if (!enemy || !enemy.userData) return 'default';
    const ud = enemy.userData;
    if (ud.isBoss) return 'boss';
    if (ud.isBlackHoleGuardian || ud.isEliteGuardian) return 'guardian';
    if (ud.isBorgCube || ud.isBorg || ud.type === 'borg_drone' || ud.type === 'borg_cube') return 'borg';
    if (ud.isUFO) return 'ufo';
    if (ud.isMartianPirate) return 'pirate';
    if (typeof ud.galaxyId === 'number' &&
        typeof galaxyTypes !== 'undefined' && galaxyTypes[ud.galaxyId]) {
        const f = galaxyTypes[ud.galaxyId].faction;
        if (f && ENEMY_LASER_PROFILES[f]) return f;
    }
    if (ud.faction && ENEMY_LASER_PROFILES[ud.faction]) return ud.faction;
    return 'default';
}

// One oscillator burst with pitch jitter. Used by playFactionLaserSound
// for both the base shot and (if present) the layered overtone.
function _fireLaserOsc(p, jitter) {
    if (!audioContext || audioContext.state === 'suspended') return;
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const g = audioContext.createGain();
    osc.connect(g);
    g.connect(typeof effectsGain !== 'undefined' ? effectsGain : audioContext.destination);
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.f0 * jitter, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.f1 * jitter), t + p.dur);
    // Battle SFX trim: lasers ride 20% quieter (player feedback)
    g.gain.setValueAtTime(p.gain * 0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
    osc.start(t);
    osc.stop(t + p.dur);
}

function playFactionLaserSound(factionKey) {
    const prof = ENEMY_LASER_PROFILES[factionKey] || ENEMY_LASER_PROFILES.default;
    const jitter = 1 + (Math.random() - 0.5) * 0.08;  // ±4 %
    _fireLaserOsc(prof, jitter);
    if (prof.layer) _fireLaserOsc(prof.layer, jitter);
}

function playEnemyLaserSound(enemy) {
    playFactionLaserSound(_enemyFactionKey(enemy));
}

if (typeof window !== 'undefined') {
    window.playFactionLaserSound = playFactionLaserSound;
    window.playEnemyLaserSound = playEnemyLaserSound;
}

// =============================================================================
// VISUAL EFFECTS SYSTEM
// =============================================================================

// Martian Pirate explosion variants — same skeleton as createExplosionEffect
// but color/density parameterized, with a delayed secondary pop. The variant
// doubles as the LOOT TELL (PewPew-style color discipline): the explosion
// color announces what the kill drops.
//   ember  (red/orange) → bonus hull salvage   (common)
//   flare  (gold)       → +20 energy cells     (uncommon)
//   plasma (cyan)       → +1 missile           (rare)
const PIRATE_EXPLOSION_VARIANTS = {
    ember:  { core: 0xff4422, particles: 0xff8833, count: 30, secondary: 0xff6600 },
    flare:  { core: 0xffcc33, particles: 0xffee88, count: 38, secondary: 0xffaa00 },
    plasma: { core: 0x33ddff, particles: 0x88eeff, count: 24, secondary: 0x00aaff }
};
function createPirateExplosionVariant(position, variant) {
    const cfg = PIRATE_EXPLOSION_VARIANTS[variant] || PIRATE_EXPLOSION_VARIANTS.ember;
    const explosionGeometry = new THREE.SphereGeometry(2, 8, 8);
    const explosionMaterial = new THREE.MeshBasicMaterial({ color: cfg.core, transparent: true });
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    scene.add(explosion);

    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(cfg.count * 3);
    for (let i = 0; i < cfg.count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 22;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 22;
    }
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
        color: cfg.particles, size: 1.1, transparent: true, opacity: 1
    });
    const particleSystem = new THREE.Points(particles, particleMaterial);
    particleSystem.position.copy(position);
    scene.add(particleSystem);

    // IMPORTANT: scene removal/disposal must live in cleanup(), not inline
    // in update() — explosionManager.clearAll() drops entries by calling
    // cleanup(), so an entry without one gets orphaned in the scene,
    // frozen mid-fade (that was the "explosions not cleaning up" bug).
    let scale = 1, opacity = 1;
    explosionManager.addExplosion({
        update(deltaTime) {
            scale += 0.5 * (deltaTime / 60);
            opacity -= 0.05 * (deltaTime / 60);
            explosion.scale.set(scale, scale, scale);
            explosionMaterial.opacity = Math.max(0, opacity);
            particleSystem.scale.set(scale * 1.2, scale * 1.2, scale * 1.2);
            particleMaterial.opacity = Math.max(0, opacity);
            return opacity > 0;
        },
        cleanup() {
            scene.remove(explosion); scene.remove(particleSystem);
            explosionGeometry.dispose(); explosionMaterial.dispose();
            particles.dispose(); particleMaterial.dispose();
        }
    });

    // Delayed secondary pop — small offset burst so each variant reads as
    // a two-beat detonation rather than a single flash.
    const offset = position.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10));
    setTimeout(() => {
        if (typeof createExplosionEffect === 'function') createExplosionEffect(offset);
    }, variant === 'plasma' ? 200 : 130);
}
window.createPirateExplosionVariant = createPirateExplosionVariant;

function createExplosionEffect(targetObject) {
    // Support both object with position property and direct position vector
    let position;
    if (targetObject && targetObject.position) {
        position = targetObject.position;
    } else if (targetObject && typeof targetObject.x !== 'undefined') {
        position = targetObject;
    } else {
        console.warn('Invalid target object for explosion');
        return;
    }

    // Create explosion sphere
    const explosionGeometry = new THREE.SphereGeometry(2, 8, 8);
    const explosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true
    });
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    scene.add(explosion);

    // Create particle burst
    const particles = new THREE.BufferGeometry();
    const particleCount = 30;
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 20;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }

    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xff8800,
        size: 1.0,
        transparent: true,
        opacity: 1
    });
    const particleSystem = new THREE.Points(particles, particleMaterial);
    particleSystem.position.copy(position);
    scene.add(particleSystem);

    // Add to explosion manager for frame-based animation
    let scale = 1;
    let opacity = 1;
    let particleLife = 1.0;
    let elapsed = 0;

    explosionManager.addExplosion({
        update(deltaTime) {
            elapsed += deltaTime;

            // Update explosion sphere (slower growth and fade)
            scale += 0.5 * (deltaTime / 60);  // Normalized to 60fps
            opacity -= 0.05 * (deltaTime / 60);
            explosion.scale.set(scale, scale, scale);
            explosionMaterial.opacity = Math.max(0, opacity);

            // Update particles
            particleLife -= 0.02 * (deltaTime / 60);
            particleMaterial.opacity = Math.max(0, particleLife);

            // Return false when animation is complete
            return opacity > 0 || particleLife > 0;
        },

        cleanup() {
            scene.remove(explosion);
            scene.remove(particleSystem);
            explosionGeometry.dispose();
            explosionMaterial.dispose();
            particles.dispose();
            particleMaterial.dispose();
        }
    });

    // Play explosion sound
    playSound('explosion');
}

// =============================================================================
// FACTION-UNIQUE EXPLOSIONS
// Each of the 8 factions gets a visually distinct death effect so the
// player can tell at a glance who they just killed. All effects run
// through explosionManager and use additive blending. Reusable
// primitive builders keep each faction recipe short.
// =============================================================================
const FACTION_EXPLOSION = {
    0: { name: 'Federation',  style: 'electric',   core: 0xffffff, accent: 0x33ddff, spark: 0x66ccff },
    1: { name: 'Klingon',     style: 'shrapnel',   core: 0xffcc44, accent: 0xff3300, spark: 0xff6600 },
    2: { name: 'Rebel',       style: 'ionbloom',   core: 0xccffaa, accent: 0x66ff33, spark: 0x99ff44 },
    3: { name: 'Romulan',     style: 'singularity',core: 0xffffff, accent: 0x33ff88, spark: 0x00ffaa },
    4: { name: 'Imperial',    style: 'tieblast',   core: 0xffffff, accent: 0x66ff66, spark: 0xaaffaa },
    5: { name: 'Cardassian',  style: 'spiral',     core: 0xffdd66, accent: 0xff9922, spark: 0xffbb44 },
    6: { name: 'Sith',        style: 'darkenergy', core: 0xff2222, accent: 0xaa00ff, spark: 0xff0044 },
    7: { name: 'Vulcan',      style: 'goldrings',  core: 0xfff0cc, accent: 0xffcc66, spark: 0xffd699 }
};

function _fxSphere(center, radius, color, opacity, life, growth) {
    const geo = new THREE.SphereGeometry(radius, 16, 12);
    const mat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: opacity,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(center);
    m.frustumCulled = false;
    scene.add(m);
    let s = 1, op = opacity;
    explosionManager.addExplosion({
        update(dt) {
            s += growth * (dt / 50);
            op -= (opacity / life) * (dt / 50);
            m.scale.set(s, s, s);
            mat.opacity = Math.max(0, op);
            return op > 0;
        },
        cleanup() { scene.remove(m); geo.dispose(); mat.dispose(); }
    });
}

function _fxRing(center, radius, color, growth, life, opacity) {
    const geo = new THREE.RingGeometry(radius, radius * 1.18, 40);
    const mat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: opacity || 0.85,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(center);
    if (typeof camera !== 'undefined') ring.lookAt(camera.position);
    ring.frustumCulled = false;
    scene.add(ring);
    let s = 1, op = (opacity || 0.85);
    explosionManager.addExplosion({
        update(dt) {
            s += growth * (dt / 50);
            op -= ((opacity || 0.85) / life) * (dt / 50);
            ring.scale.set(s, s, 1);
            mat.opacity = Math.max(0, op);
            return op > 0;
        },
        cleanup() { scene.remove(ring); geo.dispose(); mat.dispose(); }
    });
}

// Flying angular SHARDS — tetrahedra / octahedra that burst outward
// and tumble. Gives factions a sharp, non-circular signature.
function _fxShards(center, count, color, size, speed, life, kind) {
    const shards = [];
    for (let i = 0; i < count; i++) {
        const s = size * (0.6 + Math.random() * 0.8);
        let g;
        if (kind === 'octa')      g = new THREE.OctahedronGeometry(s, 0);
        else if (kind === 'tetra')g = new THREE.TetrahedronGeometry(s, 0);
        else                      g = new THREE.TetrahedronGeometry(s, 0);
        const m = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.copy(center);
        mesh.frustumCulled = false;
        scene.add(mesh);
        shards.push({
            mesh: mesh, geo: g, mat: m,
            vel: new THREE.Vector3(
                Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
            ).normalize().multiplyScalar(speed * (0.5 + Math.random())),
            spin: new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5)
        });
    }
    let l = 1.0;
    explosionManager.addExplosion({
        update(dt) {
            l -= (1 / life) * (dt / 50);
            const f = dt / 50;
            for (let i = 0; i < shards.length; i++) {
                const c = shards[i];
                c.mesh.position.addScaledVector(c.vel, f);
                c.mesh.rotation.x += c.spin.x * f;
                c.mesh.rotation.y += c.spin.y * f;
                c.mesh.rotation.z += c.spin.z * f;
                c.mat.opacity = Math.max(0, l);
            }
            return l > 0;
        },
        cleanup() {
            for (let i = 0; i < shards.length; i++) {
                scene.remove(shards[i].mesh);
                shards[i].geo.dispose();
                shards[i].mat.dispose();
            }
        }
    });
}

// Low-segment ring = a polygon outline (3 = triangle, 5 = pentagon,
// 6 = hexagon). A crisp geometric alternative to the round shockwave.
function _fxPolyRing(center, radius, color, sides, growth, life, opacity) {
    const geo = new THREE.RingGeometry(radius, radius * 1.22, Math.max(3, sides), 1);
    const mat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: opacity || 0.85,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(center);
    if (typeof camera !== 'undefined') ring.lookAt(camera.position);
    ring.rotation.z = Math.random() * Math.PI;
    ring.frustumCulled = false;
    scene.add(ring);
    let s = 1, op = (opacity || 0.85);
    explosionManager.addExplosion({
        update(dt) {
            s += growth * (dt / 50);
            op -= ((opacity || 0.85) / life) * (dt / 50);
            ring.scale.set(s, s, 1);
            ring.rotation.z += 0.03 * (dt / 50);
            mat.opacity = Math.max(0, op);
            return op > 0;
        },
        cleanup() { scene.remove(ring); geo.dispose(); mat.dispose(); }
    });
}

function _fxParticles(center, count, color, size, speed, life, swirl) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
        pos[i*3] = center.x; pos[i*3+1] = center.y; pos[i*3+2] = center.z;
        const dir = new THREE.Vector3(
            (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)
        ).normalize().multiplyScalar(speed * (0.5 + Math.random()));
        if (swirl) {
            // Add a tangential component for a spiral look
            const tang = new THREE.Vector3(-dir.z, dir.y * 0.3, dir.x).multiplyScalar(swirl);
            dir.add(tang);
        }
        vel.push(dir);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: color, size: size, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    let l = 1.0;
    explosionManager.addExplosion({
        update(dt) {
            l -= (1 / life) * (dt / 50);
            mat.opacity = Math.max(0, l);
            const arr = geo.attributes.position.array;
            const f = dt / 50;
            for (let i = 0; i < count; i++) {
                arr[i*3]   += vel[i].x * f;
                arr[i*3+1] += vel[i].y * f;
                arr[i*3+2] += vel[i].z * f;
            }
            geo.attributes.position.needsUpdate = true;
            return l > 0;
        },
        cleanup() { scene.remove(pts); geo.dispose(); mat.dispose(); }
    });
}

function _fxLightning(center, count, color, len) {
    for (let i = 0; i < count; i++) {
        const geo = new THREE.CylinderGeometry(0.6, 0.1, len, 5);
        const mat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const bolt = new THREE.Mesh(geo, mat);
        bolt.position.copy(center);
        const dir = new THREE.Vector3(
            Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const axis = new THREE.Vector3().crossVectors(up, dir);
        if (axis.length() > 0.001) {
            axis.normalize();
            bolt.setRotationFromAxisAngle(axis, Math.acos(up.dot(dir)));
        }
        bolt.position.add(dir.clone().multiplyScalar(len * 0.5));
        bolt.frustumCulled = false;
        scene.add(bolt);
        let op = 0.9;
        explosionManager.addExplosion({
            update(dt) {
                op -= 0.12 * (dt / 50);
                mat.opacity = Math.max(0, op);
                return op > 0;
            },
            cleanup() { scene.remove(bolt); geo.dispose(); mat.dispose(); }
        });
    }
}

// Public: faction-flavored regular-kill explosion. galaxyId picks the
// recipe; scale multiplies all sizes (defaults to 1).
function createFactionExplosion(position, galaxyId, scale) {
    if (!position || typeof scene === 'undefined' || typeof THREE === 'undefined') return;
    const center = position.clone ? position.clone()
                 : new THREE.Vector3(position.x, position.y, position.z);
    const S = scale || 1;
    const cfg = FACTION_EXPLOSION[galaxyId] || FACTION_EXPLOSION[0];

    switch (cfg.style) {
        case 'electric': // Federation — white core + crisp TRIANGULAR ring + blue sparks
            _fxSphere(center, 7 * S, cfg.core, 1.0, 14, 2.6);
            _fxPolyRing(center, 5 * S, cfg.accent, 3, 7, 14, 0.9);  // triangle
            _fxParticles(center, 26, cfg.spark, 2.4 * S, 7 * S, 16, 0);
            break;
        case 'shrapnel': // Klingon — jagged TETRAHEDRON shrapnel double-burst
            _fxSphere(center, 8 * S, cfg.core, 0.95, 12, 2.2);
            _fxShards(center, 26, cfg.spark, 4 * S, 12 * S, 16, 'tetra');
            setTimeout(() => {
                _fxSphere(center, 11 * S, cfg.accent, 0.8, 14, 2.8);
                _fxShards(center, 18, cfg.core, 3 * S, 9 * S, 14, 'tetra');
            }, 140);
            break;
        case 'ionbloom': // Rebel — slow green bloom + lingering haze
            _fxSphere(center, 9 * S, cfg.accent, 0.75, 26, 1.6);
            _fxSphere(center, 5 * S, cfg.core, 0.9, 18, 2.0);
            _fxParticles(center, 30, cfg.spark, 3.0 * S, 4 * S, 28, 0);
            break;
        case 'singularity': // Romulan — implode then green outward flash
            _fxParticles(center, 30, cfg.accent, 2.4 * S, -6 * S, 10, 0); // inward
            setTimeout(() => {
                _fxSphere(center, 6 * S, cfg.core, 1.0, 12, 3.4);
                _fxRing(center, 4 * S, cfg.spark, 9, 14, 0.85);
            }, 220);
            break;
        case 'tieblast': // Imperial — white flash + HEXAGONAL twin rings
            _fxSphere(center, 9 * S, cfg.core, 1.0, 9, 3.0);
            _fxPolyRing(center, 6 * S, cfg.accent, 6, 11, 16, 0.8);  // hexagon
            _fxPolyRing(center, 6 * S, cfg.spark, 6, 6, 16, 0.5);
            break;
        case 'spiral': // Cardassian — swirling orange particles + spinning shards
            _fxSphere(center, 6 * S, cfg.core, 0.9, 14, 2.2);
            _fxParticles(center, 36, cfg.accent, 2.6 * S, 6 * S, 22, 3.2);
            _fxShards(center, 12, cfg.spark, 3 * S, 5 * S, 20, 'tetra');
            break;
        case 'darkenergy': // Sith — red core + OCTAHEDRON shards + lightning + smoke
            _fxSphere(center, 7 * S, cfg.core, 1.0, 14, 2.4);
            _fxLightning(center, 8, cfg.spark, 80 * S);
            _fxShards(center, 16, cfg.accent, 4 * S, 8 * S, 18, 'octa');
            _fxSphere(center, 12 * S, cfg.accent, 0.45, 30, 2.0);
            break;
        case 'goldrings': // Vulcan — small concentric CIRCULAR gold rings
            // Halved per request: Vulcan kills are a compact pop, not a
            // big bloom. Initial radius AND expansion growth both x0.5.
            _fxSphere(center, 1.75 * S, cfg.core, 0.9, 14, 0.8);
            _fxRing(center, 1.5 * S, cfg.accent, 2, 16, 0.75);
            setTimeout(() => _fxRing(center, 1.5 * S, cfg.spark, 2.5, 16, 0.6), 130);
            setTimeout(() => _fxRing(center, 1.5 * S, cfg.accent, 3, 16, 0.5), 280);
            break;
        default:
            _fxSphere(center, 7 * S, cfg.core, 1.0, 14, 2.5);
            _fxParticles(center, 24, cfg.spark, 2.4 * S, 7 * S, 14, 0);
    }
    try { playSound('explosion'); } catch (e) {}
}
if (typeof window !== 'undefined') window.createFactionExplosion = createFactionExplosion;

// =============================================================================
// HIT SPARKS — small impact burst when a laser/missile strikes a hostile
// that SURVIVES the hit (the destruction explosion is separate). Kept
// cheap because sustained fire calls this many times per second.
// =============================================================================
function createHitSparks(worldPos, tint, scale) {
    if (!worldPos || typeof scene === 'undefined' || typeof THREE === 'undefined') return;
    const center = worldPos.clone ? worldPos.clone()
                 : new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    // Match the hit ship's size (regular enemies are halved via
    // ENEMY_SCALE_FACTOR; bosses pass 1). Defaults to 1 if unspecified.
    const S = (typeof scale === 'number' && scale > 0) ? scale : 1;

    // Bright short-lived flash at the impact point.
    const flashGeo = new THREE.SphereGeometry(3 * S, 8, 6);
    const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffffcc, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(center);
    flash.frustumCulled = false;
    scene.add(flash);
    let fs = 1, fop = 0.95;
    explosionManager.addExplosion({
        update(dt) {
            fs += 0.9 * (dt / 50);
            fop -= 0.18 * (dt / 50);
            flash.scale.set(fs, fs, fs);
            flashMat.opacity = Math.max(0, fop);
            return fop > 0;
        },
        cleanup() { scene.remove(flash); flashGeo.dispose(); flashMat.dispose(); }
    });

    // ~12 spark points spraying outward, faction-tinted.
    const N = 12;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const vel = [];
    for (let i = 0; i < N; i++) {
        pos[i*3] = center.x; pos[i*3+1] = center.y; pos[i*3+2] = center.z;
        vel.push(new THREE.Vector3(
            Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
        ).normalize().multiplyScalar((3 + Math.random() * 5) * S));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: tint || 0xffaa33, size: 2.4 * S, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    let life = 1.0;
    explosionManager.addExplosion({
        update(dt) {
            life -= 0.10 * (dt / 50);
            mat.opacity = Math.max(0, life);
            const arr = geo.attributes.position.array;
            const f = dt / 50;
            for (let i = 0; i < N; i++) {
                arr[i*3]   += vel[i].x * f;
                arr[i*3+1] += vel[i].y * f;
                arr[i*3+2] += vel[i].z * f;
            }
            geo.attributes.position.needsUpdate = true;
            return life > 0;
        },
        cleanup() { scene.remove(pts); geo.dispose(); mat.dispose(); }
    });
}
if (typeof window !== 'undefined') window.createHitSparks = createHitSparks;

// =============================================================================
// BOSS / GUARDIAN EXPLOSION
// A larger, multi-stage detonation reserved for boss and elite-guardian
// kills. Three escalating waves:
//   t=0     - core fireball + faction-colored shockwave ring
//   t=200ms - secondary detonation, ~50% larger
//   t=450ms - massive expanding plasma bubble + 250-particle burst
// The whole sequence lasts ~2.5s and uses additive blending so it
// reads brightly against any backdrop.
// =============================================================================
function createBossExplosion(position, options) {
    if (!position || typeof scene === 'undefined') return;
    options = options || {};
    const factionColor = options.color || 0xff5522;
    const scaleMul = options.scale || 1.0;
    const center = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y, position.z);

    function _addAdditiveSphere(radius, color, opacity, life, growth) {
        const geo = new THREE.SphereGeometry(radius, 24, 16);
        const mat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: opacity,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(center);
        mesh.frustumCulled = false;
        scene.add(mesh);
        let scl = 1;
        let op = opacity;
        explosionManager.addExplosion({
            update(dt) {
                scl += growth * (dt / 50);
                op  -= (opacity / life) * (dt / 50);
                mesh.scale.set(scl, scl, scl);
                mat.opacity = Math.max(0, op);
                return op > 0;
            },
            cleanup() {
                scene.remove(mesh);
                geo.dispose();
                mat.dispose();
            }
        });
    }

    function _addShockRing(color, radius, growth, life) {
        const geo = new THREE.RingGeometry(radius, radius * 1.15, 48);
        const mat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.85,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.position.copy(center);
        if (typeof camera !== 'undefined') ring.lookAt(camera.position);
        ring.frustumCulled = false;
        scene.add(ring);
        let scl = 1;
        let op = 0.85;
        explosionManager.addExplosion({
            update(dt) {
                scl += growth * (dt / 50);
                op  -= (0.85 / life) * (dt / 50);
                ring.scale.set(scl, scl, 1);
                mat.opacity = Math.max(0, op);
                return op > 0;
            },
            cleanup() {
                scene.remove(ring);
                geo.dispose();
                mat.dispose();
            }
        });
    }

    // Tumbling debris chunks — small lit boxes that fly out and spin,
    // for a "the ship is coming apart" read on top of the particle haze.
    function _addDebrisChunks(count, color, speed, life) {
        const chunks = [];
        for (let i = 0; i < count; i++) {
            const sz = (3 + Math.random() * 5) * scaleMul;
            const geo = new THREE.BoxGeometry(sz, sz * (0.5 + Math.random()), sz * (0.4 + Math.random()));
            const mat = new THREE.MeshBasicMaterial({
                color: color, transparent: true, opacity: 1,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const m = new THREE.Mesh(geo, mat);
            m.position.copy(center);
            m.frustumCulled = false;
            scene.add(m);
            chunks.push({
                mesh: m, geo: geo, mat: mat,
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * speed,
                    (Math.random() - 0.5) * speed,
                    (Math.random() - 0.5) * speed),
                spin: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.4,
                    (Math.random() - 0.5) * 0.4,
                    (Math.random() - 0.5) * 0.4)
            });
        }
        let l = 1.0;
        explosionManager.addExplosion({
            update(dt) {
                l -= (1 / life) * (dt / 50);
                const f = dt / 50;
                for (let i = 0; i < chunks.length; i++) {
                    const c = chunks[i];
                    c.mesh.position.addScaledVector(c.vel, f);
                    c.mesh.rotation.x += c.spin.x * f;
                    c.mesh.rotation.y += c.spin.y * f;
                    c.mesh.rotation.z += c.spin.z * f;
                    c.mat.opacity = Math.max(0, l);
                }
                return l > 0;
            },
            cleanup() {
                for (let i = 0; i < chunks.length; i++) {
                    scene.remove(chunks[i].mesh);
                    chunks[i].geo.dispose();
                    chunks[i].mat.dispose();
                }
            }
        });
    }

    // ── WAVE 0 (t=0): blinding white flash ───────────────────────────
    // A huge, very brief white sphere that whites out the immediate
    // area — sells the "detonation" before the fireball blooms.
    _addAdditiveSphere(180 * scaleMul, 0xffffff, 1.0, 7, 1.4);

    // ── WAVE 1 (t=0): core fireball + triple shockwave + lightning ──
    _addAdditiveSphere(70 * scaleMul, 0xffeecc, 1.0, 18, 3.6);   // white-hot core
    _addAdditiveSphere(95 * scaleMul, 0xff7733, 0.95, 22, 3.0);  // orange shell
    _addShockRing(0xffffff,    26 * scaleMul, 9, 14);
    _addShockRing(factionColor, 34 * scaleMul, 6, 18);
    _addShockRing(0xffaa55,    20 * scaleMul, 12, 22);
    if (typeof _fxLightning === 'function') {
        _fxLightning(center, 10, factionColor, 120 * scaleMul);
    }
    _addDebrisChunks(22, 0xffcc88, 9 * scaleMul, 34);

    // ── WAVE 2 (t=180ms): secondary detonation, bigger ──────────────
    setTimeout(() => {
        _addAdditiveSphere(120 * scaleMul, factionColor, 0.85, 24, 3.4);
        _addAdditiveSphere(60 * scaleMul, 0xffffff, 0.9, 12, 3.0);
        _addShockRing(0xffaa55, 56 * scaleMul, 9, 22);
        _addShockRing(factionColor, 44 * scaleMul, 13, 24);
        if (typeof _fxLightning === 'function') {
            _fxLightning(center, 8, 0xffffff, 150 * scaleMul);
        }
        if (typeof playSound === 'function') {
            try { playSound('explosion'); } catch (e) {}
            try { playSound('death_boom'); } catch (e) {}
        }
    }, 180);

    // ── WAVE 3 (t=420ms): massive plasma bubble + 360-particle burst
    setTimeout(() => {
        _addAdditiveSphere(170 * scaleMul, 0xaa44ff, 0.55, 32, 4.2);
        _addAdditiveSphere(120 * scaleMul, factionColor, 0.4, 30, 4.6);

        const partCount = 360;
        const partGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(partCount * 3);
        const velocities = [];
        for (let i = 0; i < partCount; i++) {
            positions[i*3] = center.x;
            positions[i*3+1] = center.y;
            positions[i*3+2] = center.z;
            const d = new THREE.Vector3(
                Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
            ).normalize().multiplyScalar((4 + Math.random() * 9) * scaleMul);
            velocities.push(d);
        }
        partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const partMat = new THREE.PointsMaterial({
            color: 0xffcc66, size: 7 * scaleMul, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const particles = new THREE.Points(partGeo, partMat);
        particles.frustumCulled = false;
        scene.add(particles);
        _addDebrisChunks(18, factionColor, 7 * scaleMul, 40);

        let life = 1.0;
        explosionManager.addExplosion({
            update(dt) {
                life -= 0.02 * (dt / 50);
                partMat.opacity = Math.max(0, life);
                const arr = partGeo.attributes.position.array;
                const f = dt / 50;
                for (let i = 0; i < partCount; i++) {
                    arr[i*3]   += velocities[i].x * f;
                    arr[i*3+1] += velocities[i].y * f;
                    arr[i*3+2] += velocities[i].z * f;
                }
                partGeo.attributes.position.needsUpdate = true;
                return life > 0;
            },
            cleanup() {
                scene.remove(particles);
                partGeo.dispose();
                partMat.dispose();
            }
        });

        if (typeof playSound === 'function') {
            try { playSound('death_boom'); } catch (e) {}
            try { playSound('death_rumble'); } catch (e) {}
        }
    }, 420);

    // ── WAVE 4 (t=750ms): final expanding faction ring + afterglow ──
    setTimeout(() => {
        _addShockRing(factionColor, 70 * scaleMul, 16, 26);
        _addAdditiveSphere(220 * scaleMul, factionColor, 0.3, 34, 3.4);
        if (typeof playSound === 'function') {
            try { playSound('explosion'); } catch (e) {}
        }
    }, 750);

    // Layered launch audio
    if (typeof playSound === 'function') {
        try { playSound('explosion'); } catch (e) {}
        try { playSound('damage');    } catch (e) {}
        try { playSound('death_boom'); } catch (e) {}
    }
}

// =============================================================================
// MASSIVE BORG CUBE EXPLOSION - For 100 HP BORG destruction
// =============================================================================

function createMassiveBorgExplosion(position, cubeSize = 30) {
    console.log(`💥 MASSIVE BORG EXPLOSION at ${position}, cube size: ${cubeSize}`);

    // Scale explosion to cube size - MUCH LARGER explosions
    const explosionScale = cubeSize / 30; // Scale factor relative to standard drone
    const baseExplosionSize = 300 * explosionScale;  // 3x larger base
    const secondaryExplosionSize = 250 * explosionScale;  // 3x larger secondary

    // Create HUGE expanding sphere explosion
    const explosionGeo = new THREE.SphereGeometry(baseExplosionSize, 32, 32);
    const explosionMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00, // Green BORG color
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
    });
    const explosion = new THREE.Mesh(explosionGeo, explosionMat);
    explosion.position.copy(position);
    scene.add(explosion);

    // Secondary orange/red explosion sphere
    const explosionGeo2 = new THREE.SphereGeometry(secondaryExplosionSize, 32, 32);
    const explosionMat2 = new THREE.MeshBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    const explosion2 = new THREE.Mesh(explosionGeo2, explosionMat2);
    explosion2.position.copy(position);
    scene.add(explosion2);

    // MASSIVE particle burst (1000 particles scaled by cube size)
    const particleCount = Math.floor(1000 * explosionScale);
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities = [];

    const particleSpeed = 100 * explosionScale;  // Faster particles
    for (let i = 0; i < particleCount; i++) {
        particlePositions[i * 3] = position.x;
        particlePositions[i * 3 + 1] = position.y;
        particlePositions[i * 3 + 2] = position.z;

        // Random velocity in all directions (scaled)
        particleVelocities.push({
            x: (Math.random() - 0.5) * particleSpeed,
            y: (Math.random() - 0.5) * particleSpeed,
            z: (Math.random() - 0.5) * particleSpeed
        });
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMaterial = new THREE.PointsMaterial({
        color: 0x00ff00,
        size: 15 * explosionScale,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // Add main explosion to manager
    let scale = 1;
    let opacity1 = 0.9;
    let opacity2 = 0.8;
    let particleOpacity = 1.0;

    explosionManager.addExplosion({
        update(deltaTime) {
            // Update scales and opacities
            scale += 3.0 * (deltaTime / 50);
            opacity1 -= 0.03 * (deltaTime / 50);
            opacity2 -= 0.025 * (deltaTime / 50);
            particleOpacity -= 0.04 * (deltaTime / 50);

            explosion.scale.set(scale, scale, scale);
            explosion2.scale.set(scale * 1.2, scale * 1.2, scale * 1.2);
            explosionMat.opacity = Math.max(0, opacity1);
            explosionMat2.opacity = Math.max(0, opacity2);
            particleMaterial.opacity = Math.max(0, particleOpacity);

            // Update particle positions
            const positions = particleGeometry.attributes.position.array;
            const deltaFactor = deltaTime / 50;
            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] += particleVelocities[i].x * deltaFactor;
                positions[i * 3 + 1] += particleVelocities[i].y * deltaFactor;
                positions[i * 3 + 2] += particleVelocities[i].z * deltaFactor;
            }
            particleGeometry.attributes.position.needsUpdate = true;

            return opacity1 > 0;
        },

        cleanup() {
            scene.remove(explosion);
            scene.remove(explosion2);
            scene.remove(particles);
            explosionGeo.dispose();
            explosionGeo2.dispose();
            explosionMat.dispose();
            explosionMat2.dispose();
            particleGeometry.dispose();
            particleMaterial.dispose();
        }
    });

    // Create shockwave rings with staggered timing
    for (let i = 0; i < 5; i++) {
        const ringDelay = i * 200;
        let ringCreated = false;
        let ringDelayElapsed = 0;

        explosionManager.addExplosion({
            update(deltaTime) {
                ringDelayElapsed += deltaTime;

                // Wait for delay before creating ring
                if (!ringCreated && ringDelayElapsed >= ringDelay) {
                    ringCreated = true;
                    const ringGeo = new THREE.TorusGeometry(100, 5, 16, 32);
                    const ringMat = new THREE.MeshBasicMaterial({
                        color: 0x00ff00,
                        transparent: true,
                        opacity: 0.7,
                        blending: THREE.AdditiveBlending
                    });
                    const ring = new THREE.Mesh(ringGeo, ringMat);
                    ring.position.copy(position);
                    ring.rotation.x = Math.random() * Math.PI;
                    ring.rotation.y = Math.random() * Math.PI;
                    scene.add(ring);

                    // Store ring data for animation
                    this.ring = ring;
                    this.ringGeo = ringGeo;
                    this.ringMat = ringMat;
                    this.ringScale = 1;
                    this.ringOpacity = 0.7;
                }

                // Animate ring
                if (ringCreated && this.ring) {
                    this.ringScale += 2 * (deltaTime / 50);
                    this.ringOpacity -= 0.05 * (deltaTime / 50);
                    this.ring.scale.set(this.ringScale, this.ringScale, this.ringScale);
                    this.ringMat.opacity = Math.max(0, this.ringOpacity);

                    return this.ringOpacity > 0;
                }

                return true; // Keep alive until ring is created
            },

            cleanup() {
                if (this.ring) {
                    scene.remove(this.ring);
                    this.ringGeo.dispose();
                    this.ringMat.dispose();
                }
            }
        });
    }

    playSound('explosion');
}

// =============================================================================
// FIREWORK CELEBRATION SYSTEM - Add this to game-controls.js
// =============================================================================

function createFireworkCelebration() {
    console.log('ðŸŽ† Boss defeated! Creating firework celebration!');
    
    // Create multiple firework bursts with delay
    for (let burst = 0; burst < 5; burst++) {
        setTimeout(() => {
            createFireworkBurst();
        }, burst * 300); // Stagger bursts every 300ms
    }
}

function createFireworkBurst() {
    const colors = [
        '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
        '#dda0dd', '#ffa500', '#ff69b4', '#00ced1', '#32cd32'
    ];
    
    // Random position for this burst (not too close to edges)
    const burstX = Math.random() * (window.innerWidth * 0.6) + (window.innerWidth * 0.2);
    const burstY = Math.random() * (window.innerHeight * 0.5) + (window.innerHeight * 0.2);
    
    // Create 15-25 particles per burst
    const particleCount = 15 + Math.floor(Math.random() * 10);
    
    for (let i = 0; i < particleCount; i++) {
        createFireworkParticle(burstX, burstY, colors[Math.floor(Math.random() * colors.length)]);
    }
}

function createFireworkParticle(startX, startY, color) {
    const particle = document.createElement('div');
    particle.className = 'firework-particle';
    
    // Random size between 4-8px
    const size = 4 + Math.random() * 4;
    
    // Random direction and speed
    const angle = Math.random() * Math.PI * 2;
    const speed = 100 + Math.random() * 150; // pixels to travel
    const duration = 1000 + Math.random() * 500; // animation duration
    
    // Calculate end position
    const endX = startX + Math.cos(angle) * speed;
    const endY = startY + Math.sin(angle) * speed;
    
    // Style the particle
    particle.style.cssText = `
        position: fixed !important;
        left: ${startX}px;
        top: ${startY}px;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border-radius: 50% !important;
        pointer-events: none !important;
        z-index: 1000 !important;
        box-shadow: 0 0 ${size * 2}px ${color};
        opacity: 1;
        transform: scale(1);
    `;
    
    document.body.appendChild(particle);
    
    // Animate the particle
    let startTime = null;
    function animateParticle(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = (timestamp - startTime) / duration;
        
        if (progress >= 1) {
            // Animation complete, remove particle
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
            return;
        }
        
        // Easing function for natural deceleration
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        // Update position
        const currentX = startX + (endX - startX) * easeOut;
        const currentY = startY + (endY - startY) * easeOut + (progress * progress * 50); // Add gravity
        
        // Update opacity and scale (fade and shrink over time)
        const opacity = 1 - progress;
        const scale = 1 - (progress * 0.3);
        
        particle.style.left = currentX + 'px';
        particle.style.top = currentY + 'px';
        particle.style.opacity = opacity;
        particle.style.transform = `scale(${scale})`;
        
        requestAnimationFrame(animateParticle);
    }
    
    requestAnimationFrame(animateParticle);
}

// Enhanced version with sound effect (if you want audio)
function createFireworkCelebrationWithSound() {
    // Play celebration sound if available
    if (typeof playSound === 'function') {
        playSound('achievement'); // or create a special 'celebration' sound
    }
    
    createFireworkCelebration();
}

// Shared fading-beam registry. Laser beams register here and fade on
// the main rAF loop (updateFadingBeams) instead of each spawning its
// own setInterval — in sustained combat the per-beam timers were the
// dominant off-frame cost. ~0.22 opacity/frame ≈ 75 ms at 60 fps.
const _fadingBeams = [];
function _registerFadingBeam(d) {
    if (d.opacity === undefined) d.opacity = (d.material && d.material.opacity) || 1.0;
    _fadingBeams.push(d);
}
function updateFadingBeams() {
    if (!_fadingBeams.length) return;
    for (let k = _fadingBeams.length - 1; k >= 0; k--) {
        const d = _fadingBeams[k];
        d.opacity -= 0.22;
        const o = Math.max(0, d.opacity);
        if (d.material) d.material.opacity = o;
        if (d.glowMaterial) d.glowMaterial.opacity = o * (d.glowFactor || 0.4);
        if (d.laserData) d.laserData.opacity = d.opacity;
        if (d.enemyLaserData) d.enemyLaserData.opacity = d.opacity;
        if (d.opacity <= 0) {
            if (d.enemyLaserData && typeof activeEnemyLasers !== 'undefined') {
                const i = activeEnemyLasers.indexOf(d.enemyLaserData);
                if (i > -1) activeEnemyLasers.splice(i, 1);
            }
            if (d.laserData && typeof activeLasers !== 'undefined') {
                const i = activeLasers.indexOf(d.laserData);
                if (i > -1) activeLasers.splice(i, 1);
            }
            if (d.beam) scene.remove(d.beam);
            if (d.extra) d.extra.forEach(m => scene.remove(m));
            if (d.geometry && d.geometry.dispose) d.geometry.dispose();
            if (d.material && d.material.dispose) d.material.dispose();
            if (d.glowGeometry && d.glowGeometry.dispose) d.glowGeometry.dispose();
            if (d.glowMaterial && d.glowMaterial.dispose) d.glowMaterial.dispose();
            if (d.disposeExtra) d.disposeExtra();
            _fadingBeams.splice(k, 1);
        }
    }
}
if (typeof window !== 'undefined') window.updateFadingBeams = updateFadingBeams;

// RESTORED: Working laser beam from game-controls13.js (FIXES POSITIONING)
// NOW TRACKS WITH SHIP for player lasers (1st person / cockpit view)
function createLaserBeam(startPos, endPos, color = '#00ff96', isPlayer = true) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;

    try {
        const direction = new THREE.Vector3().subVectors(endPos, startPos);
        const length = direction.length();

        // Enemy lasers get the same thick/bright treatment as wingman lasers
        // for visibility. Player lasers stay slim so they don't block the view.
        // Enemy beams slimmed toward the player's beam profile — still
        // a touch thicker so incoming fire reads, but no longer the
        // heavy 0.9/2.6 tube.
        const coreRadius = isPlayer ? 0.2 : 0.32;
        const glowRadius = isPlayer ? 0.4 : 0.85;
        const coreOpacity = isPlayer ? 0.8 : 1.0;
        const glowOpacity = isPlayer ? 0.3 : 0.5;

        const laserGeometry = new THREE.CylinderGeometry(coreRadius, coreRadius, length, 8);
        const laserMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: coreOpacity
        });

        const laserBeam = new THREE.Mesh(laserGeometry, laserMaterial);
        // Render enemy lasers in front of background nebulae / asteroid
        // belts / CMB starfields so beams from BH-galaxy hostiles aren't
        // hidden behind whatever cosmic feature happens to lie along the
        // line of sight. Player lasers render normally.
        if (!isPlayer) {
            laserBeam.renderOrder = 70;
            laserBeam.frustumCulled = false;
        }

        // Better positioning and orientation (RESTORED)
        laserBeam.position.copy(startPos);

        // BUGFIX: clone `direction` before normalizing. The old code
        // called direction.normalize() which mutates the vector to
        // unit length, so the later `direction.clone().multiplyScalar(
        // 0.5)` offset was only 0.5 units instead of half the beam
        // length. The cylinder (length = full start→end distance) then
        // sat centered on the enemy and extended HALF ITS LENGTH IN
        // BOTH DIRECTIONS — i.e. the beam appeared to fire backwards
        // out of the enemy too. _fireWingmanLaser does it correctly
        // with a clone; mirror that here so enemy beams travel only
        // from the enemy toward the target.
        const dirNorm = direction.clone().normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const axis = new THREE.Vector3().crossVectors(up, dirNorm);
        const angle = Math.acos(up.dot(dirNorm));

        if (axis.length() > 0.001) {
            axis.normalize();
            laserBeam.setRotationFromAxisAngle(axis, angle);
        } else if (direction.y < 0) {
            laserBeam.rotateX(Math.PI);
        }

        // Offset by HALF the full-length direction so the cylinder's
        // center lands at the midpoint between start and end.
        const offset = direction.clone().multiplyScalar(0.5);
        laserBeam.position.add(offset);

        // Add glow effect
        const glowGeometry = new THREE.CylinderGeometry(glowRadius, glowRadius, length, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: glowOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        laserBeam.add(glow);
        
        scene.add(laserBeam);
        
        // Track lasers.  Player beams go into activeLasers (they follow
        // ship movement), enemy beams go into activeEnemyLasers (just for
        // cleanup visibility tracking).
        let laserData = null;
        let enemyLaserData = null;
        if (isPlayer && typeof camera !== 'undefined') {
            laserData = {
                beam: laserBeam,
                geometry: laserGeometry,
                material: laserMaterial,
                glowGeometry: glowGeometry,
                glowMaterial: glowMaterial,
                lastCameraPos: camera.position.clone(),
                opacity: 0.8
            };
            if (activeLasers.length >= LASER_ARRAY_CAP) {
                const old = activeLasers.shift();
                if (old && old.beam) { old.beam.visible = false; }
            }
            activeLasers.push(laserData);
        } else {
            enemyLaserData = {
                beam: laserBeam,
                geometry: laserGeometry,
                material: laserMaterial,
                glowGeometry: glowGeometry,
                glowMaterial: glowMaterial,
                opacity: 0.8,
                createdAt: Date.now()
            };
            if (activeEnemyLasers.length >= LASER_ARRAY_CAP) {
                const old = activeEnemyLasers.shift();
                if (old && old.beam) { old.beam.visible = false; }
            }
            activeEnemyLasers.push(enemyLaserData);
        }

        // Fade. Both player AND enemy beams vanish fast (~75 ms) — just
        // a muzzle flash. Driven by the shared rAF updater
        // (updateFadingBeams) instead of a per-beam setInterval — every
        // shot used to spawn its own timer, which stacked up badly in
        // sustained combat.
        const startOpacity = isPlayer ? 0.8 : 1.0;
        laserMaterial.opacity = startOpacity;
        glowMaterial.opacity = startOpacity * (isPlayer ? 0.4 : 0.55);
        _registerFadingBeam({
            beam: laserBeam, geometry: laserGeometry, material: laserMaterial,
            glowGeometry: glowGeometry, glowMaterial: glowMaterial,
            glowFactor: isPlayer ? 0.4 : 0.55,
            laserData: laserData, enemyLaserData: enemyLaserData,
            opacity: startOpacity
        });

    } catch (error) {
        console.warn('Failed to create laser beam:', error);
    }
}

// 3RD PERSON LASER: Fire from ship wing tips with full-length beam to target
// WING GUNS — canonical ship-local weapon anchor points, transformed through
// the ship's RENDERED transform (position, model attitude, scale). One source
// of truth for laser origins, muzzle flashes and the charge glow, so they all
// stay glued to the wings across every view state: cinematic camera lag,
// fixed-step interpolation, warp framing pull-back (ship drawn smaller), and
// any model scale. Local offsets are derived ONCE from the model's local
// bounds; +Z is the model's nose.
function getPlayerWingGuns() {
    const ship = window.cameraState && window.cameraState.playerShipMesh;
    if (!ship || typeof THREE === 'undefined') return null;
    const ud = ship.userData;
    if (!ud._wingGunsLocal) {
        const box = new THREE.Box3().setFromObject(ship);
        const size = box.getSize(new THREE.Vector3());
        const s = ship.scale.x || 1;
        if (!(size.x > 0.001)) return null;   // model not hydrated yet
        ud._wingGunsLocal = {
            spread: (size.x * 0.35) / s,      // ± along local X (wingtips)
            up: -2 / s,                       // slightly under the hull
            fwd: (size.z * 0.15) / s,         // toward the +Z nose
        };
    }
    // Rendered transform when fresh (≤1 frame old), live mesh otherwise
    const fresh = typeof window.__renderedShipFrame === 'number' &&
        (gameState.frameCount - window.__renderedShipFrame) <= 1 && window.__renderedShipPos;
    const pos = fresh ? window.__renderedShipPos : ship.position;
    const att = fresh ? window.__renderedShipAtt : ship.quaternion;
    const s = (fresh && window.__renderedShipScale) ? window.__renderedShipScale : (ship.scale.x || 1);
    const g = ud._wingGunsLocal;
    const mk = (side) => new THREE.Vector3(side * g.spread * s, g.up * s, g.fwd * s)
        .applyQuaternion(att).add(pos);
    return { left: mk(-1), right: mk(1) };
}
if (typeof window !== 'undefined') window.getPlayerWingGuns = getPlayerWingGuns;

function createThirdPersonLasers(playerShip, targetPosition) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    
    try {
        // Beam origins come from the canonical ship-local WING GUNS,
        // transformed through the ship's RENDERED transform (position,
        // model attitude, scale) — see getPlayerWingGuns(). This keeps the
        // beams on the drawn wingtips through cinematic camera lag, the
        // warp framing pull-back (ship rendered smaller/farther), banks,
        // and any model scale — instead of view-space constants that only
        // matched the default chase framing.
        const guns = getPlayerWingGuns();
        let leftWing, rightWing;
        if (guns) {
            leftWing = guns.left;
            rightWing = guns.right;
        } else {
            // Model not hydrated yet — legacy camera-space fallback
            const camQuat = camera.quaternion;
            const liveOffset = (typeof cameraState !== 'undefined' &&
                                cameraState.normalThirdPersonOffset)
                ? cameraState.normalThirdPersonOffset
                : new THREE.Vector3(0, -4, -14);
            const shipPos = camera.position.clone().add(liveOffset.clone().applyQuaternion(camQuat));
            leftWing = shipPos.clone().add(new THREE.Vector3(-5, -2, -2).applyQuaternion(camQuat));
            rightWing = shipPos.clone().add(new THREE.Vector3(5, -2, -2).applyQuaternion(camQuat));
        }
        
        // Create muzzle flash at wing tips
        createMuzzleFlash(leftWing.clone());
        createMuzzleFlash(rightWing.clone());

        // Charged blast = YELLOW beams from the wings + bright bolts from the
        // CHARGE CENTER (between the two wing glows), scaled by charge power.
        const _charged = (typeof gameState !== 'undefined' && gameState._chargedShot);
        const _beamCol = _charged ? '#ffdd33' : '#00ff96';
        createThirdPersonBeam(leftWing, targetPosition, _beamCol);
        createThirdPersonBeam(rightWing, targetPosition, _beamCol);
        if (_charged) {
            const _center = leftWing.clone().add(rightWing).multiplyScalar(0.5);
            createMuzzleFlash(_center.clone());
            const _bolts = 1 + Math.round((gameState._chargedPower || 0.5) * 3);
            for (let _b = 0; _b < _bolts; _b++) createThirdPersonBeam(_center, targetPosition, '#ffee66');
        }
        
    } catch (error) {
        console.warn('Failed to create third-person lasers:', error);
    }
}

// Full-length laser beam for 3rd person - NOW TRACKS WITH SHIP MOVEMENT
function createThirdPersonBeam(startPos, endPos, color) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    
    try {
        const direction = new THREE.Vector3().subVectors(endPos, startPos);
        const length = direction.length();
        
        const laserGeometry = new THREE.CylinderGeometry(0.2, 0.2, length, 8);
        const laserMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8
        });
        
        const laserBeam = new THREE.Mesh(laserGeometry, laserMaterial);
        
        // Position at start
        laserBeam.position.copy(startPos);
        
        // Orient along direction
        const up = new THREE.Vector3(0, 1, 0);
        const dir = direction.clone().normalize();
        const axis = new THREE.Vector3().crossVectors(up, dir);
        const angle = Math.acos(up.dot(dir));
        
        if (axis.length() > 0.001) {
            axis.normalize();
            laserBeam.setRotationFromAxisAngle(axis, angle);
        } else if (dir.y < 0) {
            laserBeam.rotateX(Math.PI);
        }
        
        // Center along length
        const offset = direction.clone().multiplyScalar(0.5);
        laserBeam.position.add(offset);
        
        // Add glow
        const glowGeometry = new THREE.CylinderGeometry(0.4, 0.4, length, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        laserBeam.add(glow);
        
        scene.add(laserBeam);
        
        // Store camera position at creation time for tracking
        const creationCameraPos = camera.position.clone();
        
        // Track this laser for position updates
        const laserData = {
            beam: laserBeam,
            geometry: laserGeometry,
            material: laserMaterial,
            glowGeometry: glowGeometry,
            glowMaterial: glowMaterial,
            lastCameraPos: creationCameraPos,
            opacity: 0.9
        };
        if (activeLasers.length >= LASER_ARRAY_CAP) {
            const old = activeLasers.shift();
            if (old && old.beam) { old.beam.visible = false; }
        }
        activeLasers.push(laserData);

        // 50 ms fade — 0.9 / 0.45 per 25 ms = 2 ticks.
        const fadeInterval = setInterval(() => {
            laserData.opacity -= 0.45;
            laserMaterial.opacity = laserData.opacity;
            glowMaterial.opacity = laserData.opacity * 0.4;
            
            if (laserData.opacity <= 0) {
                clearInterval(fadeInterval);
                // Remove from active lasers array
                const idx = activeLasers.indexOf(laserData);
                if (idx > -1) activeLasers.splice(idx, 1);
                // Cleanup
                scene.remove(laserBeam);
                laserGeometry.dispose();
                laserMaterial.dispose();
                glowGeometry.dispose();
                glowMaterial.dispose();
            }
        }, 25);
        
    } catch (error) {
        console.warn('Failed to create third-person beam:', error);
    }
}

// Reusable delta vector — avoids `new THREE.Vector3()` every frame in
// updateActiveLasers + updateMuzzleFlashes (was creating 60+ objects/sec).
const _laserDelta = new THREE.Vector3();

function updateActiveLasers() {
    if (typeof camera === 'undefined') return;
    const currentCameraPos = camera.position;
    for (let i = 0; i < activeLasers.length; i++) {
        const ld = activeLasers[i];
        _laserDelta.subVectors(currentCameraPos, ld.lastCameraPos);
        ld.beam.position.add(_laserDelta);
        ld.lastCameraPos.copy(currentCameraPos);
    }
    updateMuzzleFlashes();
}

// Active muzzle flashes - track with ship like lasers
const activeMuzzleFlashes = [];
if (typeof window !== 'undefined') window.activeMuzzleFlashes = activeMuzzleFlashes;

// Active ENEMY laser beams — tracked separately from player lasers so the
// demo/cleanup code can hide them on a timer too.  Player lasers go into
// activeLasers; enemy beams never did (and sometimes linger if their
// setInterval fade misfires).
const activeEnemyLasers = [];
if (typeof window !== 'undefined') window.activeEnemyLasers = activeEnemyLasers;

// Muzzle flash effect at wing tip (brief bright sphere) - NOW TRACKS WITH SHIP
function createMuzzleFlash(position) {
    // Unified flash size that matches the pulled-back 3rd-person camera
    // (0, -6, -22) on both desktop and mobile — keeps wing-tip flashes
    // looking attached to the ship instead of floating as big blobs.
    const flashGeometry = new THREE.SphereGeometry(0.45, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({
        color: '#00ff96',
        transparent: true,
        opacity: 1.0
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(position);
    scene.add(flash);
    
    const flashData = {
        mesh: flash,
        geometry: flashGeometry,
        material: flashMaterial,
        lastCameraPos: new THREE.Vector3().copy(camera.position),
        opacity: 1.0
    };
    if (activeMuzzleFlashes.length >= 20) {
        const old = activeMuzzleFlashes.shift();
        if (old && old.mesh) {
            scene.remove(old.mesh);
            if (old.geometry) old.geometry.dispose();
            if (old.material) old.material.dispose();
        }
    }
    activeMuzzleFlashes.push(flashData);

    // 50 ms fade out
    const fadeInterval = setInterval(() => {
        flashData.opacity -= 0.5;
        flashMaterial.opacity = flashData.opacity;
        if (flashData.opacity <= 0) {
            clearInterval(fadeInterval);
            // Remove from tracking array
            const idx = activeMuzzleFlashes.indexOf(flashData);
            if (idx > -1) activeMuzzleFlashes.splice(idx, 1);
            scene.remove(flash);
            flashGeometry.dispose();
            flashMaterial.dispose();
        }
    }, 25);
}

// Update muzzle flashes to track with ship - called from updateActiveLasers
function updateMuzzleFlashes() {
    if (typeof camera === 'undefined' || activeMuzzleFlashes.length === 0) return;
    const currentCameraPos = camera.position;
    for (let i = 0; i < activeMuzzleFlashes.length; i++) {
        const fd = activeMuzzleFlashes[i];
        _laserDelta.subVectors(currentCameraPos, fd.lastCameraPos);
        fd.mesh.position.add(_laserDelta);
        fd.lastCameraPos.copy(currentCameraPos);
    }
}

// Animated tracer projectile that travels from start to target
function createTracerProjectile(startPos, endPos, color) {
    const direction = new THREE.Vector3().subVectors(endPos, startPos);
    const totalLength = direction.length();
    const tracerLength = Math.min(50, totalLength * 0.1); // Short tracer
    
    // Create tracer geometry (short cylinder)
    const tracerGeometry = new THREE.CylinderGeometry(0.3, 0.3, tracerLength, 6);
    const tracerMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.9
    });
    const tracer = new THREE.Mesh(tracerGeometry, tracerMaterial);
    
    // Orient tracer along direction
    const up = new THREE.Vector3(0, 1, 0);
    const dir = direction.clone().normalize();
    const axis = new THREE.Vector3().crossVectors(up, dir);
    const angle = Math.acos(up.dot(dir));
    
    if (axis.length() > 0.001) {
        axis.normalize();
        tracer.setRotationFromAxisAngle(axis, angle);
    }
    
    // Add glow
    const glowGeometry = new THREE.CylinderGeometry(0.6, 0.6, tracerLength, 6);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    tracer.add(glow);
    
    tracer.position.copy(startPos);
    scene.add(tracer);
    
    // Animate tracer moving toward target
    const speed = totalLength / 8; // Reach target in ~8 frames
    let progress = 0;
    
    const animateInterval = setInterval(() => {
        progress += speed;
        
        if (progress >= totalLength) {
            // Reached target - remove tracer
            clearInterval(animateInterval);
            scene.remove(tracer);
            tracerGeometry.dispose();
            tracerMaterial.dispose();
            glowGeometry.dispose();
            glowMaterial.dispose();
        } else {
            // Move tracer along path
            const t = progress / totalLength;
            tracer.position.lerpVectors(startPos, endPos, t);
            
            // Fade as it travels
            tracerMaterial.opacity = 0.9 * (1 - t * 0.5);
            glowMaterial.opacity = 0.4 * (1 - t * 0.5);
        }
    }, 16); // ~60fps
}

// =============================================================================
// ENHANCED VISUAL FEEDBACK: ENEMY HIT COLOR CHANGES
// =============================================================================

// Flash the player's ship mesh RED on a direct (unshielded) hit so
// 3rd-person players get clear feedback that they took hull damage.
// The GLB is a Group of meshes; we tint every child material's color
// red, caching the original once per material on the material itself
// (mat.userData._origHitColor) so rapid hits never bake red in — they
// just re-extend the red window.
let _playerShipFlashTimers = [];
function flashPlayerShipHit() {
    try {
        const cs = window.cameraState;
        const ship = cs && cs.playerShipMesh;
        if (!ship) return;

        // Impact sparks on the player ship too. Enemy fire on wingmen
        // and enemies already sparks via flashEnemyHit -> createHitSparks;
        // the player was the only combatant that just blinked red with
        // no spark. Same burst + same 120ms rate-limit as flashEnemyHit
        // so sustained fire doesn't spawn a particle system every tick.
        try {
            if (typeof createHitSparks === 'function' && typeof THREE !== 'undefined') {
                const _now = Date.now();
                if (!window._lastPlayerHitSparkTime ||
                    (_now - window._lastPlayerHitSparkTime) > 120) {
                    window._lastPlayerHitSparkTime = _now;
                    const _wp = new THREE.Vector3();
                    ship.getWorldPosition(_wp);
                    createHitSparks(_wp, 0xffaa33, 1.0);
                }
            }
        } catch (e) {}

        const mats = [];
        ship.traverse(node => {
            if (node && node.isMesh && node.material) {
                const list = Array.isArray(node.material) ? node.material : [node.material];
                list.forEach(mat => {
                    if (!mat || !mat.color) return;
                    if (!mat.userData) mat.userData = {};
                    if (mat.userData._origHitColor === undefined) {
                        mat.userData._origHitColor = mat.color.getHex();
                    }
                    mats.push(mat);
                });
            }
        });
        if (!mats.length) return;

        const setRed = () => mats.forEach(m => { if (m && m.color) m.color.setHex(0xff2233); });
        const setOrig = () => mats.forEach(m => {
            if (m && m.color && m.userData && m.userData._origHitColor !== undefined) {
                m.color.setHex(m.userData._origHitColor);
            }
        });

        // Cancel any in-flight blink sequence so overlapping hits
        // restart cleanly (and never leave the ship stuck red).
        _playerShipFlashTimers.forEach(t => clearTimeout(t));
        _playerShipFlashTimers = [];

        // Exactly 3 rapid red blinks within 0.5s. Phases (100ms each):
        //   0ms red, 100 off, 200 red, 300 off, 400 red, 500 off.
        // 3 reds total, guaranteed to end on the original colour.
        const STEP = 100;
        setRed(); // phase 0 (now)
        for (let i = 1; i <= 5; i++) {
            const red = (i % 2 === 0); // i=2,4 → red ; i=1,3,5 → original
            _playerShipFlashTimers.push(setTimeout(
                red ? setRed : setOrig, i * STEP));
        }
    } catch (e) {}
}
if (typeof window !== 'undefined') window.flashPlayerShipHit = flashPlayerShipHit;

// =============================================================================
// ENEMY ORANGE COMBAT SHIELD
// Raised only while a hostile is actively engaging the player/wingman.
// Absorbs 2 laser hits (flashing red on each) or 1 missile hit, then
// shatters into flying shards. Borg cubes/drones and UFOs are excluded
// (they have their own hit mechanics).
// =============================================================================
function _ensureEnemyShield(enemy) {
    if (!enemy || !enemy.userData || enemy.userData._shieldMesh ||
        enemy.userData.shieldBroken || typeof THREE === 'undefined') return;

    // MATERIALIZATION RACE GUARD: spawn-in shrinks the ship to 12% scale
    // for ~0.8s. A shield created in that window is sized against the tiny
    // hull and parent scale, then inflates 8x when the ship scales back up
    // — the "giant shield" bug on discovery-path bosses. Wait it out; this
    // is retried every behavior tick.
    if (enemy.userData._materializing) return;

    // Size from the VISIBLE hull bounding box in WORLD units (skip the
    // oversized invisible hitbox sphere, glow + cone layers), exactly
    // like _ensureShipThrusterCones — enemy GLB models are scaled ~48×,
    // so the raw hitboxSize is hugely inflated. Then convert that world
    // radius into the enemy's LOCAL frame (the shield is a child).
    let worldR = 90;
    try {
        enemy.updateWorldMatrix(true, true);
        const box = new THREE.Box3(); box.makeEmpty();
        const mb = new THREE.Box3();
        let any = false;
        enemy.traverse(node => {
            if (!node.isMesh || !node.geometry) return;
            const u = node.userData || {};
            if (u.isHitbox || u.isGlowLayer || u._isThrusterCone || u.isEnemyShield) return;
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            if (!node.geometry.boundingBox) return;
            mb.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
            box.union(mb); any = true;
        });
        // Bubble hugs the hull for normal fighters (0.31); bosses,
        // boss-support, elite + black-hole guardians keep the larger
        // bubble (0.62) so their bigger silhouette reads correctly.
        const _ud0 = enemy.userData || {};
        const _bigShield = _ud0.isBoss || _ud0.isBossSupport ||
                           _ud0.isEliteGuardian || _ud0.isBlackHoleGuardian;
        if (any && isFinite(box.min.x) && box.max.x > box.min.x) {
            const sz = box.getSize(new THREE.Vector3());
            worldR = Math.max(sz.x, sz.y, sz.z) * (_bigShield ? 0.62 : 0.31);
        }
    } catch (e) {}
    {
        const _ud1 = enemy.userData || {};
        const _bigShield = _ud1.isBoss || _ud1.isBossSupport ||
                           _ud1.isEliteGuardian || _ud1.isBlackHoleGuardian;
        // Big-shield ceiling 360 (was briefly 640 for the 2×-boss
        // experiment; with boss scale reverted, 640 left guardians inside
        // screen-filling orange spheres whenever the player got close).
        const minR = _bigShield ? 45 : 22;
        const maxR = _bigShield ? 360 : 140;
        worldR = Math.max(minR, Math.min(worldR, maxR));
    }

    const ws = new THREE.Vector3();
    try { enemy.getWorldScale(ws); } catch (e) { ws.set(1, 1, 1); }
    const s = Math.max(0.0001, (Math.abs(ws.x) + Math.abs(ws.y) + Math.abs(ws.z)) / 3);
    const localR = worldR / s;

    const mat = new THREE.MeshBasicMaterial({
        color: 0xff8800, transparent: true, opacity: 0.0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const shield = new THREE.Mesh(new THREE.SphereGeometry(localR, 18, 14), mat);
    shield.frustumCulled = true;   // off-screen enemies skip the shield draw
    shield.userData.isEnemyShield = true;
    shield.userData.isGlowLayer = true;   // skipped by thruster-cone bbox
    enemy.add(shield);
    enemy.userData._shieldMesh = shield;
    enemy.userData._shieldRadius = worldR;   // WORLD units, for shard sizing
    enemy.userData.shieldHits = 0;
    enemy.userData.shieldActive = false;
}

function _setEnemyShieldEngaged(enemy, engaged) {
    const ud = enemy && enemy.userData;
    if (!ud || ud.shieldBroken) return;
    if (ud.isBorgCube || ud.type === 'borg_drone' || ud.isUFO) return; // own mechanics
    // Show the shield bubble briefly even when not "engaged" so a hit on
    // the hull still flashes the shield red — matches the player's
    // shield reaction. We lazy-create the mesh for the flash window.
    const flashing = ud._shieldFlashUntil && Date.now() < ud._shieldFlashUntil;
    if ((engaged || flashing) && !ud._shieldMesh) _ensureEnemyShield(enemy);
    const sm = ud._shieldMesh;
    if (!sm) return;
    ud.shieldActive = !!engaged;
    // Camera INSIDE the bubble → hide it. A DoubleSide additive sphere
    // viewed from within washes the whole screen orange (seen at close
    // boss standoff); the shield still works, it just doesn't render.
    if (typeof camera !== 'undefined' &&
        camera.position.distanceTo(enemy.position) < (ud._shieldRadius || 100) * 1.1) {
        sm.material.opacity = 0;
        return;
    }
    if (flashing) {
        sm.material.color.setHex(0xff2200);
        sm.material.opacity = 0.6;
        return;
    }
    if (!engaged) { sm.material.opacity = 0; return; }
    // Gentle orange pulse while engaged and not flashing.
    sm.material.color.setHex(0xff8800);
    sm.material.opacity = 0.16 + Math.sin(Date.now() * 0.006 + (enemy.id || 0)) * 0.05;
}

// Returns true if the shield absorbed the hit (caller skips health
// damage + kill check). isMissile=true shatters in one hit.
function _enemyShieldAbsorbHit(enemy, isMissile) {
    const ud = enemy && enemy.userData;
    if (!ud || !ud.shieldActive || ud.shieldBroken || !ud._shieldMesh) return false;
    ud.shieldHits = (ud.shieldHits || 0) + 1;
    const breakNow = isMissile || ud.shieldHits >= 2;
    // Red flash on every shield hit (matches the hit-flash window
    // used by flashEnemyHit so a shield-then-hull combo doesn't
    // visually flicker between two flash lengths).
    ud._shieldFlashUntil = Date.now() + 350;
    ud._shieldMesh.material.color.setHex(0xff2200);
    ud._shieldMesh.material.opacity = 0.6;
    if (typeof playSound === 'function') playSound('weapon');
    if (breakNow) _shatterEnemyShield(enemy);
    return true;
}

// Shield shatter FX. One InstancedMesh per shatter (1 draw call for all
// shards instead of 14 separate meshes) animated on the main rAF loop
// via updateShieldShatterFX() — no per-effect setInterval (those ran
// off-frame and stacked GC/timer pressure when several shields broke at
// once). Geometry is shared across every shatter; only a tiny material
// is allocated per burst so overlapping shatters fade independently.
const _shieldShardGeo = (typeof THREE !== 'undefined') ? new THREE.TetrahedronGeometry(1, 0) : null;
const _shatterDummy = (typeof THREE !== 'undefined') ? new THREE.Object3D() : null;
const _shieldShatterFX = [];

function _shatterEnemyShield(enemy) {
    const ud = enemy && enemy.userData;
    if (!ud || !ud._shieldMesh) return;
    const sm = ud._shieldMesh;
    const wp = sm.getWorldPosition(new THREE.Vector3());
    const r = ud._shieldRadius || 60;

    const COUNT = 12;
    const shardSize = r * 0.18;
    const mat = new THREE.MeshBasicMaterial({
        color: 0xff8800, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const inst = new THREE.InstancedMesh(_shieldShardGeo, mat, COUNT);
    inst.frustumCulled = false;
    inst.renderOrder = 55;

    const pos = [], vel = [], rot = [], spin = [];
    for (let i = 0; i < COUNT; i++) {
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        pos.push(wp.clone());
        vel.push(dir.multiplyScalar(r * (0.045 + Math.random() * 0.05)));
        rot.push({ x: Math.random() * 6.28, y: Math.random() * 6.28, z: Math.random() * 6.28 });
        spin.push({ x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.4, z: (Math.random() - 0.5) * 0.4 });
        _shatterDummy.position.copy(wp);
        _shatterDummy.rotation.set(rot[i].x, rot[i].y, rot[i].z);
        _shatterDummy.scale.setScalar(shardSize);
        _shatterDummy.updateMatrix();
        inst.setMatrixAt(i, _shatterDummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
    _shieldShatterFX.push({ inst, mat, pos, vel, rot, spin, shardSize, life: 1.0 });

    if (sm.parent) sm.parent.remove(sm);
    sm.geometry.dispose(); sm.material.dispose();
    ud._shieldMesh = null;
    ud.shieldActive = false;
    ud.shieldBroken = true;   // gone for good — hull is now exposed
    if (typeof playSound === 'function') playSound('explosion');
}

// Advance all active shield-shatter bursts. Called once per frame from
// the animate loop. Frame-rate-independent decay keeps the look stable.
function updateShieldShatterFX() {
    if (!_shieldShatterFX.length || !_shatterDummy) return;
    for (let k = _shieldShatterFX.length - 1; k >= 0; k--) {
        const fx = _shieldShatterFX[k];
        fx.life -= 0.06;
        if (fx.life <= 0) {
            scene.remove(fx.inst);
            if (fx.inst.dispose) fx.inst.dispose();
            fx.mat.dispose();
            _shieldShatterFX.splice(k, 1);
            continue;
        }
        fx.mat.opacity = 0.9 * fx.life;
        for (let i = 0; i < fx.pos.length; i++) {
            fx.pos[i].add(fx.vel[i]);
            const ro = fx.rot[i], sp = fx.spin[i];
            ro.x += sp.x; ro.y += sp.y; ro.z += sp.z;
            _shatterDummy.position.copy(fx.pos[i]);
            _shatterDummy.rotation.set(ro.x, ro.y, ro.z);
            _shatterDummy.scale.setScalar(fx.shardSize);
            _shatterDummy.updateMatrix();
            fx.inst.setMatrixAt(i, _shatterDummy.matrix);
        }
        fx.inst.instanceMatrix.needsUpdate = true;
    }
}
if (typeof window !== 'undefined') window.updateShieldShatterFX = updateShieldShatterFX;

// BORG cube hit pulse. The cube is a THREE.Group of children (cube body
// with MeshStandardMaterial emissive 0x00ff00, wireframe glow box,
// edges, core sphere); none of the standard hit-flash paths touched
// them, so hits felt silent. Briefly punches up the emissive + wireframe
// opacity for ~140 ms, then eases back — restores the "I clearly hit
// the cube" feedback from early builds. Rate-limited per cube.
const _borgHitTimers = new WeakMap();
function flashBorgCubeOnHit(cube) {
    if (!cube || typeof cube.traverse !== 'function') return;
    const prev = _borgHitTimers.get(cube);
    if (prev) prev.forEach(t => clearTimeout(t));

    const restore = [];
    cube.traverse(node => {
        if (!node || node.userData && node.userData.isHitbox) return;
        const m = node.material;
        if (!m) return;
        if (typeof m.emissiveIntensity === 'number') {
            restore.push({ m, key: 'emissiveIntensity', orig: m.emissiveIntensity });
            m.emissiveIntensity = Math.min(2.5, m.emissiveIntensity + 1.4);
        }
        if (m.wireframe && typeof m.opacity === 'number') {
            restore.push({ m, key: 'opacity', orig: m.opacity });
            m.opacity = Math.min(1.0, m.opacity + 0.6);
        }
    });
    const t = setTimeout(() => {
        restore.forEach(r => { r.m[r.key] = r.orig; });
    }, 140);
    _borgHitTimers.set(cube, [t]);
}
if (typeof window !== 'undefined') window.flashBorgCubeOnHit = flashBorgCubeOnHit;

// FIXED: Enemy hit flash that works with MeshBasicMaterial (no emissive properties)
function flashEnemyHit(enemy, damage = 1) {
    if (!enemy) return;

    // Shield flash on EVERY hit — hull or shield, enemy or wingman.
    // The per-frame _setEnemyShieldEngaged / _updateAllyShield pickers
    // honour _shieldFlashUntil and lazy-create the bubble mesh if
    // needed, then fade it back out when the window expires. Matches
    // the player's first-person hex-shield reaction. ~350ms window so
    // the flash actually reads across the spark + screen-shake noise.
    if (enemy.userData && enemy.userData.health > 0) {
        enemy.userData._shieldFlashUntil = Date.now() + 350;
    }

    // Impact sparks — fire for EVERY surviving hit, regardless of
    // whether the model has a top-level .material (GLB enemies are
    // Groups and don't, so the color-flash below is skipped for them;
    // the sparks are what the player actually sees on those). Use the
    // world position so it lands on the ship even when the enemy is a
    // child of a system group (e.g. Borg drones).
    // Rate-limited to one burst per target per 120ms. Sustained
    // autopilot/wingman fire calls flashEnemyHit many times a second;
    // without this each tick spawned a fresh particle system +
    // explosionManager entry, which was a measurable jitter source.
    if (enemy.userData && enemy.userData.health > 0 &&
        typeof createHitSparks === 'function' && typeof THREE !== 'undefined') {
        const _now = Date.now();
        if (!enemy.userData._lastSparkTime || (_now - enemy.userData._lastSparkTime) > 120) {
            enemy.userData._lastSparkTime = _now;
            const wp = new THREE.Vector3();
            if (enemy.getWorldPosition) enemy.getWorldPosition(wp);
            else if (enemy.position) wp.copy(enemy.position);
            const tint = (enemy.userData && enemy.userData.galaxyColor) || 0xffaa33;
            // Regular enemies are 50% scale (ENEMY_SCALE_FACTOR); bosses /
            // guardians / BORG cubes keep full size so their sparks read
            // at the long engagement ranges those set-pieces sit at.
            const _ud = enemy.userData || {};
            const _isBigTarget = _ud.isBoss || _ud.isEliteGuardian ||
                                 _ud.isBlackHoleGuardian || _ud.isBorgCube ||
                                 _ud.type === 'borg_cube';
            const sparkScale = _isBigTarget ? 1.0 : 0.5;
            createHitSparks(wp, tint, sparkScale);
        }
    }

    // BORG cubes are Groups with no top-level material, so the colour
    // flash below would early-return and the player had no hit cue
    // beyond the small sparks. Pulse the cube's emissive + wireframe
    // glow on the children directly instead.
    if (enemy.userData && (enemy.userData.isBorgCube ||
                           enemy.userData.type === 'borg_cube')) {
        flashBorgCubeOnHit(enemy);
    }

    if (!enemy.material) return;

    // Store original material if not already stored
    if (!enemy.userData.originalMaterial) {
        enemy.userData.originalMaterial = {
            color: enemy.material.color.clone(),
            opacity: enemy.material.opacity || 1.0
        };
    }
    
    // Calculate health percentage
    const healthPercent = enemy.userData.health / enemy.userData.maxHealth;
    
    // Simple color flash based on health
    let hitColor;
    if (healthPercent > 0.66) {
        // High health - bright red flash
        hitColor = new THREE.Color(1, 0.2, 0.2);
    } else if (healthPercent > 0.33) {
        // Medium health - orange flash
        hitColor = new THREE.Color(1, 0.5, 0);
    } else {
        // Low health - yellow/white flash
        hitColor = new THREE.Color(1, 1, 0.2);
    }
    
    // Apply hit effect - just change color, keep opacity
    const originalOpacity = enemy.material.opacity;
    enemy.material.color.copy(hitColor);
    enemy.material.opacity = 0.9; // Slightly more opaque during hit
    
    // Clear any existing timeout
    if (enemy.userData.hitTimeout) {
        clearTimeout(enemy.userData.hitTimeout);
    }
    
    // Return to original color after delay
    enemy.userData.hitTimeout = setTimeout(() => {
        if (enemy && enemy.material && enemy.userData.originalMaterial) {
            // Always return to original color and opacity
            enemy.material.color.copy(enemy.userData.originalMaterial.color);
            enemy.material.opacity = enemy.userData.originalMaterial.opacity;
        }
    }, 150);
}
// =============================================================================
// ENHANCED DIRECTIONAL DAMAGE EFFECTS FROM ADVANCED VERSION
// =============================================================================

// ENHANCED: Directional damage effect system with attacker position
function createScreenDamageEffect(attackerPosition = null) {
    if (!attackerPosition) {
        // Fallback to old full-screen effect if no attacker position provided
        const damageOverlay = document.createElement('div');
        damageOverlay.className = 'absolute inset-0 bg-red-500 pointer-events-none z-30 combat-damage-fx';
        damageOverlay.style.opacity = '0';
        damageOverlay.style.animation = 'damageFlash 0.5s ease-out forwards';
        document.body.appendChild(damageOverlay);
        
        setTimeout(() => damageOverlay.remove(), 500);
        return;
    }
    
    // NEW: Directional damage effect based on attacker position
    const attackDirection = getAttackDirection(attackerPosition);
    createDirectionalDamageEffect(attackDirection);
    
    // Enhanced screen shake effect
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.style.animation = 'screenShake 0.8s ease-out';
        setTimeout(() => {
            if (gameContainer) {
                gameContainer.style.animation = '';
            }
        }, 800);
    }
}

function getAttackDirection(attackerPosition) {
    if (typeof camera === 'undefined') {
        return { primary: 'center', screenX: 0.5, screenY: 0.5, isVisible: true };
    }

    // Transform the attacker into camera-local space so we can classify
    // the incoming-fire direction reliably.  Three.js camera convention:
    //   +X = right, -X = left
    //   +Y = up,    -Y = down
    //   -Z = into the scene (front), +Z = behind the camera
    // We deliberately avoid .project() here — NDC coordinates are
    // unreliable for points at or behind the camera plane, which made
    // below/behind hits mis-classify as radial-from-center.
    const local = camera.worldToLocal(attackerPosition.clone());
    const absX = Math.abs(local.x);
    const absY = Math.abs(local.y);
    const absZ = Math.abs(local.z);

    // Pick the dominant off-axis direction.  If the lateral/vertical
    // offset is negligible compared to Z, fall back to 'front' (ahead)
    // or 'behind' (straight rear) — the radial flash then makes sense.
    let direction = 'front';
    if (absX > absY) {
        if (absX > absZ * 0.3) {
            direction = local.x > 0 ? 'right' : 'left';
        } else if (local.z > 0) {
            direction = 'behind';
        }
    } else {
        if (absY > absZ * 0.3) {
            direction = local.y > 0 ? 'top' : 'bottom';
        } else if (local.z > 0) {
            direction = 'behind';
        }
    }

    // Screen coords are still useful for the indicator label; safe to
    // compute even though we don't rely on them for direction.
    const projected = attackerPosition.clone().project(camera);
    const screenX = projected.x * 0.5 + 0.5;
    const screenY = -projected.y * 0.5 + 0.5;

    return {
        primary: direction,
        screenX: screenX,
        screenY: screenY,
        isVisible: projected.z < 1
    };
}

function createDirectionalDamageEffect(attackDirection) {
    const direction = attackDirection.primary;
    let overlayStyle = '';
    let extraStyle = '';

    // Each direction just uses a full-viewport gradient; the gradient
    // itself fades to transparent so the colored band only shows on the
    // correct side.  We deliberately do NOT restrict the element to a
    // partial area — combining `top:0;bottom:0` from the base with
    // `height:40%` was over-constrained and browsers resolved it by
    // placing the "bottom" flash at the top of the screen (and "right"
    // on the left).
    switch (direction) {
        case 'left':
            overlayStyle = 'background: linear-gradient(to right, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0.3) 30%, transparent 60%);';
            break;
        case 'right':
            overlayStyle = 'background: linear-gradient(to left, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0.3) 30%, transparent 60%);';
            break;
        case 'top':
            overlayStyle = 'background: linear-gradient(to bottom, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0.3) 30%, transparent 60%);';
            break;
        case 'bottom':
            overlayStyle = 'background: linear-gradient(to top, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0.3) 30%, transparent 60%);';
            break;
        case 'behind':
            overlayStyle = 'background: radial-gradient(circle at center, transparent 0%, rgba(255,0,0,0.4) 40%, rgba(255,0,0,0.8) 100%);';
            extraStyle = 'box-shadow: inset 0 0 0 8px rgba(255,0,0,0.6);';
            break;
        case 'front':
        default:
            overlayStyle = 'background: radial-gradient(circle at center, rgba(255,0,0,0.6) 0%, rgba(255,0,0,0.3) 50%, transparent 80%);';
            break;
    }

    // Z-index sits ABOVE the mission command alert (z-50) and incoming-
    // transmission prompt (1000) so the player always sees incoming-fire
    // warnings even during a transmission.
    const damageOverlay = document.createElement('div');
    damageOverlay.className = 'fixed pointer-events-none combat-damage-fx';
    damageOverlay.style.cssText =
        'top:0;left:0;right:0;bottom:0;' +   // full viewport, always
        overlayStyle + extraStyle +
        'opacity: 0; transition: opacity 0.15s ease-out; z-index: 2000;';
    document.body.appendChild(damageOverlay);

    // Extended visibility so the flash actually registers during fast
    // combat — appears in 15 ms, holds for 500 ms, fades out over 250 ms.
    setTimeout(() => { damageOverlay.style.opacity = '1'; }, 15);
    setTimeout(() => { damageOverlay.style.opacity = '0'; }, 500);
    setTimeout(() => { damageOverlay.remove(); }, 800);

    // Add directional damage indicator text for every non-center
    // direction (including FRONT — previously suppressed, but the
    // player deserves a "FRONT" warning when an enemy ahead of them
    // lands a hit).
    if (direction !== 'center') {
        createDamageDirectionIndicator(direction);
    }
}

function createDamageDirectionIndicator(direction) {
    const indicator = document.createElement('div');
    indicator.className = 'fixed pointer-events-none text-red-400 font-bold text-lg combat-damage-fx';
    // Above mission alert (z-50) and transmission prompt (1000) so the
    // directional arrows always read even during a transmission.
    indicator.style.zIndex = '2001';
    indicator.style.fontFamily = "'Orbitron', monospace";
    indicator.style.textShadow = '0 0 10px rgba(255,0,0,0.8), 0 0 20px rgba(255,0,0,0.5)';
    indicator.style.opacity = '0';
    indicator.style.transition = 'all 0.3s ease-out';
    
    // Position and text based on direction (REMOVED EMOJIS).
    // On desktop the top center is occupied by the title panel and the
    // bottom center by the DEMO AUTOPILOT pill, so we push the top and
    // bottom indicators clear of those. Mobile keeps the tight 20px
    // offsets — the title is smaller and the demo HUD is at the top.
    const _isMobileViewport = (typeof window !== 'undefined') &&
        (('ontouchstart' in window) || window.innerWidth < 768);
    const _topOffset    = _isMobileViewport ? 20 : 110;  // below title panel
    const _bottomOffset = _isMobileViewport ? 20 : 80;   // above demo pill
    let text = '';
    let positionStyle = '';

    switch (direction) {
        case 'left':
            text = '< UNDER ATTACK';
            positionStyle = 'left: 20px; top: 50%; transform: translateY(-50%);';
            break;
        case 'right':
            text = 'UNDER ATTACK >';
            positionStyle = 'right: 20px; top: 50%; transform: translateY(-50%);';
            break;
        case 'top':
            text = '^ UNDER ATTACK';
            positionStyle = 'top: ' + _topOffset + 'px; left: 50%; transform: translateX(-50%);';
            break;
        case 'bottom':
            text = 'v UNDER ATTACK';
            positionStyle = 'bottom: ' + _bottomOffset + 'px; left: 50%; transform: translateX(-50%);';
            break;
        case 'behind':
            text = '!!! AMBUSH !!!';
            positionStyle = 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
            break;
    }
    
    indicator.textContent = text;
    indicator.style.cssText += positionStyle;
    document.body.appendChild(indicator);

    // Store the base transform for proper animation
    const baseTransform = indicator.style.transform || '';

    // Animate in
    setTimeout(() => {
        indicator.style.opacity = '1';
        indicator.style.transform = baseTransform + ' scale(1.1)';
    }, 50);

    // Animate out
    setTimeout(() => {
        indicator.style.opacity = '0';
        indicator.style.transform = baseTransform + ' scale(0.8)';
    }, 800);
    
    // Remove
    setTimeout(() => {
        indicator.remove();
    }, 1100);
}

// ENHANCED: Enhanced damage effects wrapper
function createEnhancedScreenDamageEffect(attackerPosition = null) {
    // Use the new directional system
    createScreenDamageEffect(attackerPosition);
}

// =============================================================================
// WORKING KEYBOARD CONTROLS - RESTORED from game-controls13.js
// =============================================================================

function setupEnhancedEventListeners() {
    // Initialize audio first
    initAudio();
    
    // Start tutorial after a short delay
    setTimeout(startTutorial, 1000);
    
   // FIXED: Prevent duplicate event listeners
let controlButtonsInitialized = false;

function setupControlButtons() {
    // Flight Controls buttons (Music / Skip / Pause) now use inline onclick
    // attributes in index.html that call the globals directly. That's the
    // most reliable setup — survives DOM changes, doesn't depend on listener
    // registration timing, and works even if this function never runs.
    // This function is left as a no-op for backwards compatibility with any
    // callers that still reference it.
    controlButtonsInitialized = true;
}

// SINGLE initialization call
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupControlButtons);
} else {
    setupControlButtons();
}

// SIMPLIFIED: Single initialization call
function initializeControlButtons() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupControlButtons);
    } else {
        setupControlButtons();
    }
}

    document.addEventListener('keydown', (e) => {
        // Add pause key handler
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            togglePause();
            return;
        }

        // Camera view controls: 1 = first-person, 3 = third-person, 0 = no ship, V = toggle
        if (e.key === '1') {
            e.preventDefault();
            if (typeof setCameraFirstPerson === 'function') {
                setCameraFirstPerson();
            }
            return;
        }
        if (e.key === '3') {
            e.preventDefault();
            if (typeof setCameraThirdPerson === 'function') {
                setCameraThirdPerson();
            }
            return;
        }
        if (e.key === '0') {
            e.preventDefault();
            if (typeof setCameraNoShip === 'function') {
                setCameraNoShip();
            }
            return;
        }
        if (e.key === 'v' || e.key === 'V') {
            e.preventDefault();
            if (typeof toggleCameraView === 'function') {
                console.log('🎥 Toggling camera view...');
                toggleCameraView();
            } else {
                console.warn('⚠️ toggleCameraView function not available');
            }
            return;
        }

        if (gameState.paused) return;  // MAKE SURE THIS LINE EXISTS
        
        if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
        }
        
        const key = e.key.toLowerCase();
        
        // W key with double-tap detection for Jump
        if (key === 'w') {
            // Ignore repeat keydown events from holding the key
            if (e.repeat) {
                // Key is being held - just set normal W thrust
                keys.w = true;
            } else {
                // Fresh key press - check for double-tap
                const now = Date.now();
                if (now - doubleTapState.lastWTap < doubleTapState.doubleTapThreshold) {
                    // Double-tap detected - Jump!
                    keys.wDoubleTap = true;
                    keys.w = false; // Don't also thrust
                } else {
                    // Single tap - normal thrust
                    keys.w = true;
                }
                doubleTapState.lastWTap = now;
            }
        }
        
        if (key === 'a') keys.a = true;
        if (key === 's') keys.s = true;
        if (key === 'd') keys.d = true;
        if (key === 'q') keys.q = true;
        if (key === 'e') keys.e = true;
        if (e.key === 'Enter') keys.enter = true;
        
        // O key for emergency warp with double-tap detection
        if (key === 'o') {
            const now = Date.now();
            if (now - doubleTapState.lastOTap < doubleTapState.doubleTapThreshold) {
                // Double-tap detected - 2-second warp
                keys.oDoubleTap = true;
            } else {
                // Single tap - full emergency warp
                keys.o = true;
            }
            doubleTapState.lastOTap = now;
        }
        
        // CAPS LOCK detection for fast turning
        if (e.getModifierState && e.getModifierState('CapsLock')) {
            keys.capsLock = true;
        }
        
        if (e.key === 'Shift') keys.shift = true;
        if (e.key === ' ') {
    keys.space = true;
    if (!gameState.targetLock.active) {
        gameState.targetLock.active = true;
        resumeAudioContext();
    }
}
        if (e.key === 'Alt' || e.altKey) {
            keys.alt = true;
            // HOLD-TO-CHARGE: the first press fires one tap shot and starts
            // the charge timer; key-repeat while held does NOT rapid-fire —
            // it builds the charge (a glow grows on the wings) released on
            // keyup as a blast scaled by hold time (max 3s).
            if (!e.repeat) {
                // CHARGE SPEED GATE: charging needs a stable firing platform —
                // above ~8,000 km/s the charge won't start (the tap shot still
                // fires). Keeps the wing glow readable and avoids the charge
                // visuals fighting warp-speed motion.
                const _chSpeed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
                gameState._laserChargeStart = _chSpeed <= 8 ? Date.now() : 0;
                if (!gameState.gameOver && gameState.gameStarted) {
                    resumeAudioContext();
                    fireWeapon();
                }
            }
        }
        if (e.key === 'Shift') {
            e.preventDefault();
            fireMissile();
        }
        if (key === 'x') {
            keys.x = true;
            
            // NEW: Stop warp speed starfield when braking
            if (typeof toggleWarpSpeedStarfield === 'function') {
                toggleWarpSpeedStarfield(false);
            }
        }
        if (key === 'b') keys.b = true;
        if (key === 'z') {
            keys.z = true;
            // Activate missile zoom scope (hold to zoom)
            if (!gameState.missiles.selected) {
                gameState.missiles.selected = true;
                // No notification - silent activation
            }
        }

        if (e.key === 'ArrowUp') keys.up = true;
        if (e.key === 'ArrowDown') keys.down = true;
        if (e.key === 'ArrowLeft') keys.left = true;
        if (e.key === 'ArrowRight') keys.right = true;
        
        if (e.key === 'CapsLock') {
            e.preventDefault();
            cycleTargets();
        }

        // Shift+R toggles realistic vs arcade slingshot physics.
        if ((e.key === 'R' || e.key === 'r') && e.shiftKey) {
            e.preventDefault();
            gameState.realisticSlingshot = !gameState.realisticSlingshot;
            if (typeof showAchievement === 'function') {
                showAchievement(
                    gameState.realisticSlingshot ? 'Realistic slingshots ON' : 'Arcade slingshots ON',
                    gameState.realisticSlingshot
                        ? 'Boost vector = body orbit + ≤30° aim. Periapsis matters.'
                        : 'Boost vector = look direction. Mass-scaled magnitude.',
                    true
                );
            }
        }
        
        // Shield toggle - Caps Lock
if (e.key === 'Tab') {
    e.preventDefault();
    if (typeof toggleShields === 'function') {
        toggleShields();
    }
}
        
        if (key === 'l') keys.l = true;
        
        if (e.key === 'Enter') {
            e.preventDefault();

            // Slingshot eligibility now lives entirely inside
            // executeSlingshot (range, cooldown, energy, tier unlocks).
            // Use findSlingshotTarget so the "no target → toggle nav"
            // fallback below still works.
            const nearestPlanet = (typeof findSlingshotTarget === 'function')
                ? findSlingshotTarget()
                : null;

            if (nearestPlanet && !gameState.slingshot.active) {
                if (typeof executeSlingshot === 'function') {
                    executeSlingshot();
                }
            } else if (gameState.currentTarget && !nearestPlanet) {
                if (gameState.autoNavigating) {
                    gameState.autoNavigating = false;
                    gameState.autoNavOrienting = false;
                    showAchievement('Auto-Nav Disengaged', 'Manual control resumed');
                } else {
                    gameState.autoNavigating = true;
                    gameState.autoNavOrienting = true;
                    showAchievement('Auto-Nav Engaged', `Orienting towards ${gameState.currentTarget.userData.name}`);
                }
                if (typeof updateUI === 'function') updateUI();
            }
        }
    });
    
    document.addEventListener('keyup', (e) => {
        // Don't process if paused
        if (gameState.paused) return;  // CORRECT VARIABLE
        
        const key = e.key.toLowerCase();
        if (key === 'w') {
            keys.w = false;
            keys.wDoubleTap = false;
        }
        if (key === 'a') keys.a = false;
        if (key === 's') keys.s = false;
        if (key === 'd') keys.d = false;
        if (key === 'q') keys.q = false;
        if (key === 'e') keys.e = false;
        if (e.key === 'Enter') keys.enter = false;
        if (key === 'o') {
            keys.o = false;
            keys.oDoubleTap = false;
        }
        
        // Update CAPS LOCK state
        if (e.getModifierState) {
            keys.capsLock = e.getModifierState('CapsLock');
        }
        
        if (e.key === 'Shift') keys.shift = false;
        if (e.key === ' ') {
            keys.space = false;
            if (gameState.targetLock.active) {
                gameState.targetLock.active = false;
                gameState.targetLock.target = null;
            }
        }
        if (e.key === 'Alt' || e.altKey) {
            keys.alt = false;
            // Release → charged blast scaled by hold time (300ms..2s → 0..1).
            const _held = Date.now() - (gameState._laserChargeStart || Date.now());
            gameState._laserChargeStart = 0;
            if (_held >= 300 && typeof fireChargedBlast === 'function') {
                fireChargedBlast(Math.min(1, _held / 2000));
            }
        }
        if (key === 'x') keys.x = false;
        if (key === 'b') keys.b = false;
        if (key === 'z') {
            keys.z = false;
            // Deactivate missile zoom scope when key released
            gameState.missiles.selected = false;
        }
        if (key === 'l') keys.l = false;
        
        if (e.key === 'ArrowUp') keys.up = false;
        if (e.key === 'ArrowDown') keys.down = false;
        if (e.key === 'ArrowLeft') keys.left = false;
        if (e.key === 'ArrowRight') keys.right = false;
    });
    
    // Rest of the event listeners remain the same...
    // [Include the rest of your event listeners here]
    
    console.log('âœ… Enhanced event listeners setup complete');
}
    
// TEMPORARY: Mouse click for weapons with UI panel blocking disabled for testing
document.addEventListener('click', (e) => {
    if (!gameState.gameStarted || gameState.gameOver || gamePaused) {
        return;
    }
    
    // Block clicks on modal overlays completely
    if (e.target.closest('#missionCommandAlert') ||
        e.target.closest('#achievementPopup') ||
        e.target.closest('#loadingScreen') ||
        e.target.closest('#pauseOverlay') ||
        e.target.closest('#tutorialOverlay') ||
        e.target.closest('#bossWarning') ||
        e.target.closest('#eventHorizonWarning')) {
        return; 
    }
    
    // CRITICAL FIX: Allow planet card clicks to work properly
    const planetCard = e.target.closest('.planet-card');
    if (planetCard) {
        console.log('ðŸŽ¯ Planet card click detected in main handler!', planetCard);
        // Planet card click detected - let its own handler run, don't fire weapon
        return;
    }
    
    // Block other specific UI elements
    if (e.target.tagName === 'BUTTON' ||
        e.target.closest('button') ||
        e.target.closest('.space-btn') ||
        e.target.classList.contains('small-control-btn') ||
        e.target.classList.contains('galaxy-indicator') ||
        e.target.closest('.map-toggle-btn') ||
        e.target.id === 'muteBtn' ||
        e.target.id === 'pauseBtn' ||
        e.target.id === 'autoNavigateBtn') {
        return;
    }

    // TEMPORARILY DISABLED: Block other UI panel clicks for testing
    // if (e.target.closest('.ui-panel')) {
    //     return;
    // }
    
    // For everything else (game area), fire weapon
    console.log('ðŸ”« Firing weapon - click on game area');
    resumeAudioContext();
    fireWeapon();
});
    
    // Mouse movement tracking for crosshair - FIXED POSITION TRACKING
let _crosshairEl = null;  // cached #crosshair element for native-rate tracking
document.addEventListener('mousemove', (e) => {
    if (typeof gameState === 'undefined' || !gameState.gameStarted || gameState.gameOver || typeof gamePaused !== 'undefined' && gamePaused) return;

    // ALWAYS update actual mouse position for UI detection
    gameState.mouseX = e.clientX;
    gameState.mouseY = e.clientY;

    // Only update crosshair position if not in target lock mode
    // This keeps crosshair and mouse positions separate when target lock is active
    if (!gameState.targetLock.active) {
        gameState.crosshairX = e.clientX;
        gameState.crosshairY = e.clientY;
        // Move the crosshair DOM element HERE, at native mouse rate, so it
        // tracks the cursor 1:1 instead of stepping at the 20Hz rate of
        // updateCrosshairTargeting(). Cache the element lookup.
        if (!_crosshairEl) _crosshairEl = document.getElementById('crosshair');
        if (_crosshairEl) {
            _crosshairEl.style.left = e.clientX + 'px';
            _crosshairEl.style.top = e.clientY + 'px';
        }
    }
    // Note: When target lock is active, crosshair position is controlled by updateTargetLock()
    // but we still track real mouse position for UI interaction
});

// Add zoom scope crosshair after initial setup
setTimeout(() => {
    const zoomScope = document.createElement('div');
    zoomScope.id = 'zoomScope';
    zoomScope.style.cssText = `
        position: fixed;
        width: 250px;
        height: 250px;
        border: 3px solid rgba(255, 51, 0, 0.3);
        border-radius: 50%;
        pointer-events: none;
        z-index: 999;
        display: none;
        overflow: hidden;
        box-shadow: 0 0 20px rgba(255, 51, 0, 0.4), inset 0 0 20px rgba(255, 51, 0, 0.2);
        background: rgba(0, 0, 0, 0.2);
    `;

    const scopeCanvas = document.createElement('canvas');
    scopeCanvas.width = 250;
    scopeCanvas.height = 250;
    scopeCanvas.style.cssText = 'width: 100%; height: 100%; border-radius: 50%;';
    zoomScope.appendChild(scopeCanvas);
    document.body.appendChild(zoomScope);

    let animationFrameId = null;
    let scopeTargetX = 0;
    let scopeTargetY = 0;
    let scopeCurrentX = 0;
    let scopeCurrentY = 0;
    const scopeSmoothing = 0.15; // Smooth following like crosshair
    let lastMissileSelectedState = false;

    function updateZoomScope() {
        if (!gameState.missiles.selected || !renderer || !renderer.domElement) {
            zoomScope.style.display = 'none';
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            return;
        }

        const ctx = scopeCanvas.getContext('2d');
        const zoomFactor = 2.5;

        // Smooth scope position (lerp towards target)
        scopeCurrentX += (scopeTargetX - scopeCurrentX) * scopeSmoothing;
        scopeCurrentY += (scopeTargetY - scopeCurrentY) * scopeSmoothing;

        // Update scope visual position
        zoomScope.style.left = scopeCurrentX + 'px';
        zoomScope.style.top = scopeCurrentY + 'px';

        // Sample the in-tick frame snapshot taken by the main render
        // loop. renderer.domElement itself is an empty buffer here
        // (preserveDrawingBuffer:false), so reading it directly is what
        // made the scope blank — use the snapshot, fall back only if it
        // hasn't been produced yet this session.
        const scopeSource = (typeof window !== 'undefined' && window.__zoomFrameCanvas)
            ? window.__zoomFrameCanvas
            : renderer.domElement;

        // Centre the magnified region on the scope's OWN on-screen
        // centre (it follows the real mouse via scopeTarget = clientX).
        // The old code used gameState.crosshairX/Y, which aim-assist /
        // target-lock continuously pulls away from the cursor — that's
        // why the loupe didn't zoom where the mouse was.
        const scopeCenterX = scopeCurrentX + 125;
        const scopeCenterY = scopeCurrentY + 125;

        // The snapshot canvas is sized in DEVICE pixels
        // (innerWidth × devicePixelRatio); mouse/scope coords are CSS
        // pixels. Without converting, on any HiDPI display the sample
        // is offset toward the top-left and over-magnified.
        const srcCanvasW = scopeSource.width || window.innerWidth;
        const srcCanvasH = scopeSource.height || window.innerHeight;
        const dpScaleX = srcCanvasW / window.innerWidth;
        const dpScaleY = srcCanvasH / window.innerHeight;

        const regionCssW = 250 / zoomFactor;   // CSS px sampled around centre
        const regionCssH = 250 / zoomFactor;
        const sw = regionCssW * dpScaleX;       // → device px
        const sh = regionCssH * dpScaleY;
        let sx = (scopeCenterX - regionCssW / 2) * dpScaleX;
        let sy = (scopeCenterY - regionCssH / 2) * dpScaleY;
        // Keep the sampled rect fully inside the source by shifting its
        // origin (never shrinking it — shrinking would distort zoom).
        sx = Math.max(0, Math.min(sx, srcCanvasW - sw));
        sy = Math.max(0, Math.min(sy, srcCanvasH - sh));

        // Clear canvas
        ctx.clearRect(0, 0, 250, 250);

        // Save context and create circular clipping path
        ctx.save();
        ctx.beginPath();
        ctx.arc(125, 125, 125, 0, Math.PI * 2);
        ctx.clip();

        // Draw magnified portion (now clipped to circle)
        try {
            ctx.drawImage(scopeSource, sx, sy, sw, sh, 0, 0, 250, 250);
        } catch (err) {
            console.warn('Zoom scope render error:', err);
        }

        // Restore context to draw crosshairs over the clipped image
        ctx.restore();

        // Draw crosshair overlay in GREEN to match mouse aiming cursor
        ctx.strokeStyle = 'rgba(0, 255, 150, 0.8)'; // Green like aiming cursor
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(125, 0);
        ctx.lineTo(125, 250);
        ctx.moveTo(0, 125);
        ctx.lineTo(250, 125);
        ctx.stroke();

        // Draw center circle
        ctx.beginPath();
        ctx.arc(125, 125, 20, 0, Math.PI * 2);
        ctx.stroke();

        // Continue animation
        animationFrameId = requestAnimationFrame(updateZoomScope);
    }

    // Function to activate/deactivate scope without requiring mouse movement
    function toggleZoomScope() {
        if (gameState.missiles.selected && !animationFrameId) {
            // Activate scope immediately
            const mouseX = gameState.crosshairX || gameState.mouseX || window.innerWidth / 2;
            const mouseY = gameState.crosshairY || gameState.mouseY || window.innerHeight / 2;
            scopeTargetX = mouseX - 125;
            scopeTargetY = mouseY - 125;
            scopeCurrentX = scopeTargetX;
            scopeCurrentY = scopeTargetY;
            zoomScope.style.display = 'block';
            updateZoomScope();
        } else if (!gameState.missiles.selected) {
            // Deactivate scope immediately
            zoomScope.style.display = 'none';
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        }
    }

    // Check for state changes in animation loop
    function checkZoomScopeState() {
        if (gameState.missiles.selected !== lastMissileSelectedState) {
            lastMissileSelectedState = gameState.missiles.selected;
            toggleZoomScope();
        }
        requestAnimationFrame(checkZoomScopeState);
    }
    checkZoomScopeState();

    // Update scope position on mouse movement
    document.addEventListener('mousemove', (e) => {
        // Update target position for smooth following
        scopeTargetX = e.clientX - 125;
        scopeTargetY = e.clientY - 125;
    });
}, 1000);

    // RESTORED: Enhanced button handlers
    const autoNavBtn = document.getElementById('autoNavigateBtn');
    if (autoNavBtn) {
        autoNavBtn.addEventListener('click', () => {
            if (gameState.currentTarget) {
                if (gameState.autoNavigating) {
                    gameState.autoNavigating = false;
                    gameState.autoNavOrienting = false;
                    showAchievement('Auto-Nav Disengaged', 'Manual control resumed');
                } else {
                    gameState.autoNavigating = true;
                    gameState.autoNavOrienting = true;
                    showAchievement('Auto-Nav Engaged', `Orienting towards ${gameState.currentTarget.userData.name}`);
                }
                if (typeof updateUI === 'function') updateUI();
            }
        });
    }

    // RESTORED: Orbit lines toggle
    const toggleOrbitsBtn = document.getElementById('toggleOrbitsBtn');
    if (toggleOrbitsBtn) {
        let orbitsVisible = true;
        toggleOrbitsBtn.addEventListener('click', () => {
            orbitsVisible = !orbitsVisible;
            if (typeof orbitLines !== 'undefined') {
                orbitLines.forEach(line => line.visible = orbitsVisible);
            }
            toggleOrbitsBtn.innerHTML = `<i class="fas fa-circle-notch mr-1"></i>Orbits ${orbitsVisible ? 'ON' : 'OFF'}`;
            toggleOrbitsBtn.classList.toggle('bg-green-900', orbitsVisible);
            toggleOrbitsBtn.classList.toggle('bg-red-900', !orbitsVisible);
        });
    }

    const warpBtn = document.getElementById('warpBtn');
    if (warpBtn) {
        warpBtn.addEventListener('click', () => {
            if (!warpBtn.disabled && !gameState.gameOver) {
                showAchievement('Slingshot Info', 'Press ENTER key while near a planet to execute slingshot!');
            }
        });
    }
    
    // RESTORED: Map view toggle button
    const mapViewToggle = document.getElementById('mapViewToggle');
    if (mapViewToggle) {
        mapViewToggle.addEventListener('click', () => {
            if (gameState.mapView === 'galactic') {
                gameState.mapView = 'universal';
                mapViewToggle.textContent = 'Universal View';
            } else {
                gameState.mapView = 'galactic';
                mapViewToggle.textContent = 'Galactic View';
            }
            if (typeof updateGalaxyMap === 'function') updateGalaxyMap();
        });
    }
    
    // RESTORED: Window resize handler
    window.addEventListener('resize', () => {
        if (typeof camera !== 'undefined') {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }
        if (typeof renderer !== 'undefined') {
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        
        gameState.crosshairX = window.innerWidth / 2;
        gameState.crosshairY = window.innerHeight / 2;
    });
    
    console.log('âœ… Enhanced event listeners setup complete');

// CHARGED BLAST: hold Alt to charge (glow builds on the wings), release for a
// blast whose damage/energy/beam scale with the charge `power` (0..1 = up to
// 3s held). Reuses all of fireWeapon's targeting via the _chargedShot flag.
function fireChargedBlast(power) {
    if (typeof gameState === 'undefined' || gameState.gameOver || !gameState.gameStarted) return;
    power = Math.max(0, Math.min(1, (typeof power === 'number') ? power : 1));
    const cost = Math.round(12 + power * 28); // 12 (light) .. 40 (max)
    if (!gameState.weapons || gameState.weapons.energy < cost) return;
    gameState._chargedShot = true;
    gameState._chargedPower = power;
    gameState.weapons.cooldown = 0; // the blast fires even mid-cooldown
    if (typeof playSound === 'function') { try { playSound('weapon'); } catch (e) {} }
    if (window.arcade) window.arcade.flash('rgba(255,220,60,' + (0.4 + power * 0.5) + ')', 0.3 + power * 0.5);
    fireWeapon(); // reads + clears _chargedShot / _chargedPower
    if (typeof flashArcadeText === 'function') {
        flashArcadeText(power > 0.8 ? 'MAX CHARGE BLAST!' : 'CHARGED BLAST!', power > 0.8 ? 5 : (power > 0.5 ? 4 : 3));
    }
}
if (typeof window !== 'undefined') window.fireChargedBlast = fireChargedBlast;

function checkWeaponHits(targetPosition) {
    const hitRadius = 300;  // Increased from 150 to 300 for better mouse aiming hit detection (2x larger hitboxes)

    // Check BORG drone hits (from outer interstellar systems)
    if (typeof outerInterstellarSystems !== 'undefined') {
        const droneWorldPos = new THREE.Vector3();
        outerInterstellarSystems.forEach(system => {
            if (!system.userData || !system.userData.drones) return;

            system.userData.drones.forEach((drone, droneIndex) => {
                if (drone.userData.health <= 0) return;

                // FIXED: Use world position for hit detection (drones are children of system group)
                drone.getWorldPosition(droneWorldPos);
                const distance = droneWorldPos.distanceTo(targetPosition);
                if (distance < hitRadius) { // Normal hit radius
                    const damage = (typeof gameState !== 'undefined' && gameState._chargedShot) ? Math.round(2 + (gameState._chargedPower || 0.5) * 6) : 1;
                    drone.userData.health -= damage;

                    flashEnemyHit(drone, damage);
                    // Borg fights happen at long range — float a HIT confirm
                    // (kill-text style) so distant shots visibly land.
                    if (typeof spawnKillText === 'function' &&
                        Date.now() - (drone.userData._lastHitTextAt || 0) > 400) {
                        drone.userData._lastHitTextAt = Date.now();
                        spawnKillText(droneWorldPos, 'HIT', '#88ff88');
                    }
                    if (typeof createHitSparks === 'function') {
                        createHitSparks(droneWorldPos, 0x88ff88);
                    }
                    playSound('weapon');
                    const maxHp = drone.userData.maxHealth || 100;
                    showAchievement('BORG Hit!', `${drone.userData.name} damaged (${drone.userData.health}/${maxHp} HP)`);

                    if (drone.userData.health <= 0) {
                        const cubeSize = drone.userData.cubeSize || 30;
                        drone.getWorldPosition(droneWorldPos);
                        createMassiveBorgExplosion(droneWorldPos, cubeSize);
                        playSound('explosion');

                        if (drone.userData.isBorgCube) {
                            // Full cube destroyed — clean up swarm drones
                            showAchievement('🎉 LEGENDARY VICTORY!', `BORG Cube destroyed! The threat is neutralized!`, true);
                            if (typeof stopBorgAlarm === 'function') stopBorgAlarm();
                            if (typeof playBossVictoryMusic === 'function') setTimeout(() => playBossVictoryMusic(), 500);
                            if (drone.userData.drones) {
                                drone.userData.drones.forEach(d => {
                                    if (d && d.parent) d.parent.remove(d);
                                    const oi = system.userData.orbiters.indexOf(d);
                                    if (oi > -1) system.userData.orbiters.splice(oi, 1);
                                });
                            }
                            // Reward: refill missiles
                            if (gameState.missiles) {
                                gameState.missiles.current = gameState.missiles.capacity || 10;
                                showAchievement('ULTIMATE REWARD', `Missiles fully restored! (${gameState.missiles.current})`, true);
                            }
                        } else {
                            showAchievement('BORG DRONE DESTROYED!', `${drone.userData.name} eliminated!`);
                        }

                        // Remove from scene and arrays
                        if (drone.parent) drone.parent.remove(drone);
                        system.userData.drones.splice(droneIndex, 1);
                        const orbiterIndex = system.userData.orbiters.indexOf(drone);
                        if (orbiterIndex > -1) {
                            system.userData.orbiters.splice(orbiterIndex, 1);
                        }
                    }
                }
            });
        });
    }

    // Check enemy hits
    if (typeof enemies !== 'undefined') {
        enemies.forEach((enemy, enemyIndex) => {
            if (enemy.userData.health <= 0) return;

            // FIXED: Use hitbox size matching scaled model (like asteroids)
            // Calculate hitbox if not already stored (should be set at creation time)
            if (enemy.userData.hitboxSize === undefined) {
                try {
                    const box = new THREE.Box3().setFromObject(enemy);
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    // Store largest dimension as hitbox size (diameter)
                    enemy.userData.hitboxSize = Math.max(size.x, size.y, size.z);
                } catch (e) {
                    // Fallback: use reasonable default for 96x scaled model
                    enemy.userData.hitboxSize = 96; // Approximate size of scaled model
                }
            }

            // Hitbox detection with safety margin. CRITICAL: cap the hitbox
            // size at 200u — many enemies have a 40u invisible hitbox sphere
            // added as a child of a 96x-scaled GLB model, which makes the
            // bounding box ~3840u in world space. Without the cap, the
            // proximity check fired weapon sounds for 20-30 enemies at once
            // on every shot — the actual cause of the "loud-then-fades"
            // pattern, not browser limiter behavior.
            const safetyMargin = 20;
            const sanitizedHitbox = Math.min(enemy.userData.hitboxSize || 96, 200);
            const collisionDistance = sanitizedHitbox / 2 + safetyMargin;
            const distance = enemy.position.distanceTo(targetPosition);

            if (distance < collisionDistance) {
                // Orange combat shield intercepts laser fire first — 1st
                // hit flashes red & holds, 2nd hit shatters it. Either way
                // no health damage passes while the shield is up.
                if (typeof _enemyShieldAbsorbHit === 'function' &&
                    _enemyShieldAbsorbHit(enemy, false)) {
                    _activateOnDamage(enemy);
                    return; // shield ate the shot
                }
                const damage = (typeof gameState !== 'undefined' && gameState._chargedShot) ? Math.round(2 + (gameState._chargedPower || 0.5) * 6) : 1; // charged blast = 4x
                enemy.userData.health -= damage;
                enemy.userData.lastHitTime = Date.now();
                _activateOnDamage(enemy);

                // Knockback: laser hits shove the target along the shot
                // line (doubled per playtest). The position nudge survives
                // the AI's render interpolation (behaviors continue from
                // the moved spot), which smooths it into a visible recoil.
                if (typeof camera !== 'undefined' && enemy.position) {
                    const _kb = enemy.position.clone().sub(camera.position).normalize();
                    enemy.position.addScaledVector(_kb, 6);
                    if (enemy.userData.velocity && enemy.userData.velocity.addScaledVector) {
                        enemy.userData.velocity.addScaledVector(_kb, 0.15);
                    }
                }

                // ENHANCED: Use improved hit effect with color changes
                flashEnemyHit(enemy, damage);
                // Impact sparks at the hit point (pairs with the knockback)
                if (typeof createHitSparks === 'function') {
                    createHitSparks(targetPosition || enemy.position, enemy.userData.galaxyColor || 0xffcc66);
                }
                // Floating HIT marker on EVERY hit (kill-text style), with a
                // per-enemy throttle so rapid auto-fire on one target can't
                // stack text. Was gated to >700u; players liked it, so it now
                // pops at all ranges. Occasional "CRIT!" for variety/punch.
                if (typeof spawnKillText === 'function' &&
                    Date.now() - (enemy.userData._lastHitTextAt || 0) > 300) {
                    enemy.userData._lastHitTextAt = Date.now();
                    const crit = Math.random() < 0.18;
                    // Size scales with proximity — a close hit reads big.
                    const _hd = camera.position.distanceTo(enemy.position);
                    const _hs = (typeof killTextSizeForDistance === 'function') ? killTextSizeForDistance(_hd) : 15;
                    // HIT and CRIT share the size (matches +MISSILE at mid range);
                    // CRIT is distinguished by its word + orange color, not size.
                    spawnKillText(enemy.position, crit ? 'CRIT!' : 'HIT',
                        crit ? '#ff8844' : '#ffee88', _hs);
                }
                playSound('weapon');
                showAchievement('Target Hit!', `Damaged ${enemy.userData.name} (${enemy.userData.health}/${enemy.userData.maxHealth} HP)`);
                
                // FIXED: Only explode and remove when enemy actually dies
if (enemy.userData.health <= 0) {
    // Check if this was a boss BEFORE removing it
    const wasBoss = enemy.userData.isBoss;
    const bossName = enemy.userData.name;

    // Reputation + small energy refund for the kill (handles boss
    // bonuses internally: max-energy refill + warp charge).
    if (typeof awardKillReward === 'function') awardKillReward(enemy);

    // Record the kill position for elite guardian spawning
    if (typeof recordEnemyKillPosition === 'function') {
        recordEnemyKillPosition(enemy);
    }
    
    // Update nebula intel system - check if cluster is cleared, turn line white
    if (typeof updateClusterStatus === 'function') {
        updateClusterStatus(enemy);
    }
    
    // Track area clearing for Mission Command notifications
    if (typeof areaClearTracker !== 'undefined' && areaClearTracker.onEnemyDestroyed) {
        areaClearTracker.onEnemyDestroyed(enemy);
    }
    
    // Check for species elimination - triggers distress beacon and boss spawn
    if (typeof distressBeaconSystem !== 'undefined' && distressBeaconSystem.onEnemyDestroyed) {
        distressBeaconSystem.onEnemyDestroyed(enemy);
    }
    
    // Enemy destroyed - NOW create explosion and remove. Bosses and
    // elite/black-hole guardians get the larger multi-stage detonation
    // so the player feels the weight of the kill; regulars use the
    // standard puff.
    const _enemyUD = enemy.userData || {};
    const _bigKill = _enemyUD.isBoss || _enemyUD.isEliteGuardian || _enemyUD.isBlackHoleGuardian;
    const _isBorg = _enemyUD.isBorgCube || _enemyUD.type === 'borg_drone' || _enemyUD.isBorg;
    // Martian Pirates (but NOT Vulcan Patrols — they share galaxyId 7)
    // keep the original simple explosion the player is used to.
    const _isPirate = _enemyUD.isMartianPirate && !_enemyUD.isVulcanPatrol;
    if (_isBorg && typeof createMassiveBorgExplosion === 'function') {
        createMassiveBorgExplosion(enemy.position, _enemyUD.cubeSize || 30);
        playSound('explosion');
    } else if (_bigKill && typeof createBossExplosion === 'function') {
        const _color = _enemyUD.galaxyColor || 0xff5522;
        createBossExplosion(enemy.position, {
            color: _color,
            scale: _enemyUD.isBoss ? 1.8 : 1.3
        });
    } else if (_isPirate) {
        // Martian Pirate kills roll one of three explosion variants; the
        // explosion color IS the loot tell (see PIRATE_EXPLOSION_VARIANTS):
        // red ember → hull, gold flare → energy, cyan plasma → missile.
        const _roll = Math.random();
        const _variant = _roll < 0.55 ? 'ember' : (_roll < 0.85 ? 'flare' : 'plasma');
        _enemyUD._pirateLootVariant = _variant;
        if (typeof createPirateExplosionVariant === 'function') {
            createPirateExplosionVariant(enemy.position, _variant);
        } else {
            createExplosionEffect(enemy.position, 0xff4444, 15);
        }
        playSound('explosion');
    } else if (typeof createFactionExplosion === 'function' &&
               typeof _enemyUD.galaxyId === 'number') {
        // Regular hostile: faction-flavoured death effect. Hostiles in
        // the black-hole (distant, non-local) galaxies detonate at half
        // diameter; the local-galaxy fights keep full size.
        createFactionExplosion(enemy.position, _enemyUD.galaxyId,
            isEnemyInLocalGalaxy(enemy) ? 1.0 : 0.5);
    } else {
        createExplosionEffect(enemy.position, 0xff4444, 15);
        playSound('explosion');
    }
    
    // UFOs always drop missiles when destroyed
    if (enemy.userData.isUFO || enemy.userData.alwaysDropMissile) {
        // Spawn a missile pickup at the UFO's position
        if (typeof spawnMissilePickup === 'function') {
            spawnMissilePickup(enemy.position.clone());
            console.log('🛸 UFO destroyed - missile dropped!');
        } else {
            // Fallback: just add a missile directly. gameState.missiles is
            // an object ({current, capacity, ...}) — earlier code here
            // overwrote it with a number, which made the HUD read
            // "Missiles: undefined/undefined" from that point on.
            if (typeof gameState !== 'undefined' && gameState.missiles &&
                typeof gameState.missiles.current === 'number') {
                const cap = gameState.missiles.capacity || 10;
                gameState.missiles.current = Math.min(cap, gameState.missiles.current + 1);
                showAchievement('MISSILE ACQUIRED!',
                    `Alien technology salvaged! (${gameState.missiles.current}/${cap})`);
            }
        }
    }
    
    if (wasBoss) {
    showAchievement('BOSS DEFEATED!', `${bossName} destroyed!`);
    // Flagship kill: full-screen flash + bullet-time slow-mo as it dies.
    if (window.arcade) {
        window.arcade.flash('rgba(255,200,80,0.9)', 0.85);
        window.arcade.slowmo(700);
    }
    // Top-tier arcade praise for a flagship kill, naming the faction
    if (typeof flashArcadeText === 'function') {
        const _bw = ['TARGET ELIMINATED!', 'THREAT NEUTRALIZED!', 'FLAGSHIP DOWN!', 'REALITY BENT!'];
        let _bsub = null;
        try {
            const _f = (enemy.userData.isVulcanPatrol) ? 'VULCAN HIGH COMMAND'
                : (enemy.userData.isMartianPirate) ? 'MARTIAN PIRATES'
                : (typeof galaxyTypes !== 'undefined' && galaxyTypes[enemy.userData.galaxyId] ? String(galaxyTypes[enemy.userData.galaxyId].faction).toUpperCase() : null);
            if (_f) _bsub = _f + ' FLAGSHIP DESTROYED';
        } catch (_) {}
        flashArcadeText(_bw[Math.floor(Math.random() * _bw.length)], 6, _bsub);
    }
    // Call boss victory check and fireworks
    if (typeof checkBossVictory === 'function') {
        checkBossVictory(enemy);
    }
    // FIREWORKS CELEBRATION!
    if (typeof createFireworkCelebration === 'function') {
        createFireworkCelebration();
    }
    // BOSS CELEBRATION MUSIC!
    playBossVictoryMusic();
    // When boss is defeated, switch back to ambient music (after celebration)
    setTimeout(() => {
        if (typeof switchToAmbientMusic === 'function') {
            switchToAmbientMusic();
        }
    }, 800); // Wait for celebration music to finish
} else {
    showAchievement('Enemy Destroyed!', `${enemy.userData.name} eliminated`);

    // Floating kill text at the kill position — loot-colored for pirates
    // (matches the explosion variant), gold rep text otherwise.
    if (typeof spawnKillText === 'function') {
        const _kv = enemy.userData._pirateLootVariant;
        if (_kv === 'flare') spawnKillText(enemy.position, '+ENERGY', '#ffcc33');
        else if (_kv === 'plasma') spawnKillText(enemy.position, '+MISSILE', '#33ddff');
        else if (_kv === 'ember') spawnKillText(enemy.position, '+HULL', '#ff6644');
        else spawnKillText(enemy.position, '+REP', '#ffcc44');
    }
    // Big tiered arcade praise, upper-middle of the screen (streak-aware).
    // Distance gates the basic words to far kills; the killed enemy's
    // userData drives the "<FACTION> ELIMINATED" subtitle.
    if (typeof arcadePraiseKill === 'function') {
        arcadePraiseKill(false, (typeof camera !== 'undefined') ? camera.position.distanceTo(enemy.position) : 0, enemy.userData);
    }
    // Arcade: score + combo + floating number, and a meaty hitstop.
    if (window.arcade) {
        window.arcade.addKill(enemy.userData, enemy.position, !!enemy.userData.isBoss);
        window.arcade.hitstop(enemy.userData.isBoss ? 90 : 45);
    }

    const _lootVariant = enemy.userData._pirateLootVariant;
    if (_lootVariant === 'flare') {
        // Gold flare explosion → energy cells
        gameState.energy = Math.min(gameState.maxEnergy || 100, (gameState.energy || 0) + 20);
        showAchievement('Energy Cells Recovered!', '+20 energy salvaged from the golden flare');
    } else if (_lootVariant === 'plasma' &&
               gameState.missiles.current < gameState.missiles.capacity) {
        // Cyan plasma explosion → guaranteed missile
        gameState.missiles.current++;
        showAchievement('Missile Recovered!',
            `Plasma-burst salvage (${gameState.missiles.current}/${gameState.missiles.capacity})`);
    } else if (!_lootVariant &&
               Math.random() < 0.3 && gameState.missiles.current < gameState.missiles.capacity) {
        // Non-pirate kills keep the original 30% missile chance
        gameState.missiles.current++;
        showAchievement('Missile Recovered!',
            `+1 missile from debris (${gameState.missiles.current}/${gameState.missiles.capacity})`);
    }
    // ('ember' variant pays out through the hull-recovery bonus below.)
}

    // Hull recovery from defeating enemies. Red-ember pirate kills add a
    // +8 salvage bonus — that's their loot identity.
    const _emberBonus = (enemy.userData._pirateLootVariant === 'ember') ? 8 : 0;
    const hullRecovery = wasBoss ? 15 + Math.random() * 15 : 5 + Math.random() * 10 + _emberBonus; // More recovery for bosses
    if (typeof gameState !== 'undefined' && gameState.hull !== undefined) {
        gameState.hull = Math.min(gameState.maxHull || 100, gameState.hull + hullRecovery);
        showAchievement('Hull Repaired', `+${hullRecovery.toFixed(1)} hull integrity from salvage`);
    }
    
    // Clear target lock if this was the target
    if (gameState.targetLock.target === enemy) {
        gameState.targetLock.target = null;
    }
    if (gameState.currentTarget === enemy) {
        gameState.currentTarget = null;
    }
    
    // FIXED: Remove enemy from scene and array
    scene.remove(enemy);
    enemies.splice(enemyIndex, 1);
    
    // FIXED: Trigger immediate navigation update
    if (typeof populateTargets === 'function') {
        setTimeout(populateTargets, 100); // Update targets quickly
    }
    
    // Check for galaxy clear
    checkGalaxyClear();
    
    // 🏆 VICTORY SYSTEM: Check if guardians defeated → galaxy liberated
    checkGuardianVictory();

    // ENHANCED: Check if we should spawn area bosses, galaxy bosses, or elite guardians
    if (typeof checkAndSpawnAreaBosses === 'function') {
        checkAndSpawnAreaBosses();
    }
    if (typeof checkGalaxyBossSpawn === 'function') {
        checkGalaxyBossSpawn();
    }
    if (typeof checkSpeciesBossSpawn === 'function') {
        checkSpeciesBossSpawn();
    }
    if (typeof checkAndSpawnEliteGuardians === 'function') {
        checkAndSpawnEliteGuardians();
    }
                    
                    // Check if this was a boss that was defeated
					if (enemy.userData.isBoss || enemy.userData.isEliteGuardian) {
    				const wasVictory = checkBossVictory(enemy);
    				if (wasVictory) {
        			// ⭐ NEW: Award warp for defeating boss
        			if (gameState.emergencyWarp && gameState.emergencyWarp.available < gameState.emergencyWarp.maxWarps) {
            			gameState.emergencyWarp.available++;
            			showAchievement('BOSS DEFEATED!', `${enemy.userData.name} destroyed! +1 Warp Earned (${gameState.emergencyWarp.available}/${gameState.emergencyWarp.maxWarps})`);
        			} else {
            			showAchievement('BOSS DEFEATED!', `${enemy.userData.name} destroyed!`);
        			}
        			// Call firework celebration here
        			if (typeof createFireworkCelebration === 'function') {
            		createFireworkCelebration();
        }
    }
}
                }
                
                playSound('hit');
            }
        });
    }
    
    // REMOVED: Asteroid checks - asteroids should only be hit by direct raycasting
    // The fallback checkWeaponHits() is for enemies that are near the aim line,
    // not for asteroids. Asteroids require precise aim with direct raycast hits.
}

// =============================================================================
// 🎯 MISSION PROGRESSION - PHASE 2: BOSS BATTLE CHECK
// =============================================================================
// Called after every enemy death to detect when all regular enemies + boss defeated
// Triggers: Guardian spawn, Mission Command alert, boss victory music
// Does NOT increment galaxiesCleared - that happens in checkGuardianVictory()
// See: PROGRESSION_SYSTEM.md for full mission flow
// =============================================================================

function checkGalaxyClear() {
    if (typeof enemies === 'undefined' || typeof gameState === 'undefined') return;
    
    if (!gameState.currentGalaxyEnemies) {
        gameState.currentGalaxyEnemies = {};
    }
    
    // Find which galaxy was just cleared by checking enemy positions
    let clearedGalaxyId = -1;
    let clearedGalaxyType = null;
    
    // Check each galaxy for remaining REGULAR enemies (excluding guardians and bosses)
    for (let g = 0; g < 8; g++) {
        // Count only regular enemies (not guardians, not bosses, not boss support)
        const regularEnemies = enemies.filter(enemy => 
            enemy.userData &&
            enemy.userData.health > 0 &&
            enemy.userData.galaxyId === g &&
            !enemy.userData.isBoss &&
            !enemy.userData.isBossSupport
            // Black-hole guardians COUNT toward the clear (campaign design:
            // the galaxy is liberated only when its faction's forces AND
            // all 3 core guardians are down). They spawn with the third
            // discovery path, so they exist before any clear can happen.
        );
        
        // Check if boss has been defeated for this galaxy
        const bossDefeated = (typeof bossSystem !== 'undefined' && bossSystem.galaxyBossDefeated && bossSystem.galaxyBossDefeated[g]);
        
        // Galaxy is only "cleared" when:
        // 1. All regular enemies are defeated
        // 2. Boss has been defeated
        // 3. We haven't already marked it as cleared
        if (regularEnemies.length === 0 && bossDefeated && gameState.currentGalaxyEnemies[g] > 0) {
            clearedGalaxyId = g;
            clearedGalaxyType = galaxyTypes[g];
            gameState.currentGalaxyEnemies[g] = 0;
            break;
        }
    }
    
    // If we found a cleared galaxy (regular enemies + boss defeated)
    if (clearedGalaxyId >= 0 && clearedGalaxyType) {
        // DO NOT increment galaxiesCleared yet - that happens after guardians
        
        // Mark boss as defeated
        if (typeof bossSystem !== 'undefined') {
            bossSystem.galaxyBossDefeated[clearedGalaxyId] = true;
        }
        
        // Play victory music
        playBossVictoryMusic();
        
        // Show intermediate achievement
        showAchievement('Boss Defeated!', `${clearedGalaxyType.name} Galaxy boss eliminated! Guardians remain...`);
        
        // Mission Control message about guardians
        setTimeout(() => {
            if (typeof showMissionCommandAlert === 'function') {
                showMissionCommandAlert('Mission Control',
                    `Boss down, Captain. ${clearedGalaxyType.name} Galaxy still has guardians — clear them to liberate the sector.`,
                    true);
            }
        }, 2000);
        
        // Refresh galaxy map
        if (typeof setupGalaxyMap === 'function') {
            setupGalaxyMap();
        }
        
        refreshEnemyDifficulty();
    }
}

// =============================================================================
// =============================================================================
// 🏆 MISSION PROGRESSION - PHASE 3: GUARDIAN VICTORY CHECK
// =============================================================================
// Called after every enemy death to detect when all guardians defeated
// THIS is where galaxiesCleared increments (0 → 1 → 2 → ... → 8)
// Triggers: "Galaxy Liberation Complete" message, victory music, fireworks
// At 8/8 galaxies: Campaign victory screen appears
// See: PROGRESSION_SYSTEM.md for full mission flow
// =============================================================================

function checkGuardianVictory() {
    if (typeof enemies === 'undefined' || typeof gameState === 'undefined') return;
    
    if (!gameState.currentGalaxyEnemies) {
        gameState.currentGalaxyEnemies = {};
    }
    
    // Check each galaxy for remaining guardians
    for (let g = 0; g < 8; g++) {
        // Only check galaxies where boss was defeated.  Guard against
        // galaxyBossDefeated being undefined (sister checks already do this).
        if (typeof bossSystem === 'undefined' ||
            !bossSystem.galaxyBossDefeated ||
            !bossSystem.galaxyBossDefeated[g]) {
            continue;
        }
        
        // Check if guardians have been cleared
        if (typeof bossSystem !== 'undefined' && bossSystem.galaxyGuardiansDefeated && bossSystem.galaxyGuardiansDefeated[g]) {
            continue; // Already liberated
        }
        
        // Count remaining guardians for this galaxy
        const remainingGuardians = enemies.filter(enemy => 
            enemy.userData && 
            enemy.userData.health > 0 && 
            enemy.userData.galaxyId === g &&
            enemy.userData.isBlackHoleGuardian === true
        );
        
        // If all guardians defeated, galaxy is truly liberated!
        if (remainingGuardians.length === 0) {
            const galaxyType = galaxyTypes[g];
            
            // Mark guardians as defeated
            if (typeof bossSystem !== 'undefined') {
                if (!bossSystem.galaxyGuardiansDefeated) {
                    bossSystem.galaxyGuardiansDefeated = {};
                }
                bossSystem.galaxyGuardiansDefeated[g] = true;
            }
            
            // NOW increment galaxy clear count
            gameState.galaxiesCleared = (gameState.galaxiesCleared || 0) + 1;

            // Arcade: RANK stamp on sector clear (grade by hull remaining).
            if (window.arcade) {
                const _hp = (gameState.maxHull ? (gameState.hull / gameState.maxHull) : 1);
                const _rank = _hp > 0.85 ? 'S' : _hp > 0.6 ? 'A' : _hp > 0.35 ? 'B' : 'C';
                window.arcade.grade(_rank, 'SECTOR LIBERATED');
                window.arcade.flash('rgba(120,255,160,0.7)', 0.6);
            }

            // Play galaxy victory music
            playGalaxyVictoryMusic();

            // Launch fireworks celebration
            if (typeof createFireworkCelebration === 'function') {
                createFireworkCelebration();
            }

            // Show FINAL liberation achievement
            showAchievement(`Galaxy Liberation Complete - ${galaxyType.name}`, `${galaxyType.name} Galaxy (${galaxyType.faction}) completely liberated!`);

            // Victory-replay highlight: liberations anchor the montage
            if (typeof window !== 'undefined' && window.replaySystem) {
                window.replaySystem.record('Liberated the ' + galaxyType.name + ' Galaxy', 4);
            }

            // OPTIONAL DEEP-SPACE EXPEDITION: a path opens from this freed
            // core out toward UFO/Borg territory. Explicitly optional — the
            // directive below steers the player to the next nebula instead.
            if (typeof createDiscoveryPathToPosition === 'function' &&
                typeof findGalaxyCoreById === 'function') {
                const _core = findGalaxyCoreById(g);
                if (_core) {
                    const _woo = (typeof window !== 'undefined' && window.worldOriginOffset) || { x: 0, y: 0, z: 0 };
                    const _deep = new THREE.Vector3(78000 - _woo.x, 2000 - _woo.y, 8000 - _woo.z);
                    // galaxyId -1: no mission-enemy snapshot/relocation — this
                    // line is an invitation, not a tracked mission.
                    createDiscoveryPathToPosition(_core.position.clone(), _deep, 0x00ff66, 'Deep Space', 'deepspace', -1);
                    setTimeout(() => {
                        if (typeof showIncomingTransmission === 'function') {
                            showIncomingTransmission('Mission Control - Optional Expedition',
                                'With this sector free, long-range sensors reach the deep field: UFO anomalies and BORG signatures beyond the rim.\n\n' +
                                'The green line marks an OPTIONAL expedition — dangerous, no reinforcements.\n\n' +
                                'Priority remains the campaign: make for the next twin nebula and keep liberating, Captain.', 0x00ff66);
                        }
                    }, 6000);
                }
            }
            
            // Mission Control message
            const remainingGalaxies = 8 - gameState.galaxiesCleared;
            let missionControlMessage = '';
            
            if (remainingGalaxies > 0) {
                missionControlMessage = `${galaxyType.name} Galaxy liberated — ${galaxyType.faction} purged. ${remainingGalaxies} ${remainingGalaxies === 1 ? 'galaxy remains' : 'galaxies remain'}.`;
            } else {
                missionControlMessage = `All hostiles eliminated. The universe is safe — well done, Captain.`;
            }
            
            setTimeout(() => {
                if (typeof showMissionCommandAlert === 'function') {
                    showMissionCommandAlert('Mission Control', missionControlMessage, true);
                }
            }, 2000);
            
            // Refresh galaxy map to show liberated status
            if (typeof setupGalaxyMap === 'function') {
                setupGalaxyMap();
            }
            
            // Check for total victory — the campaign win: fireworks land,
            // then the BEST-MOMENTS SPECTATOR REPLAY rolls (victory-replay.js).
            if (gameState.galaxiesCleared >= 8) {
                showAchievement('Victory!', 'All galaxies liberated! Universe saved!');
                playVictoryMusic();
                if (typeof window !== 'undefined' && window.replaySystem) {
                    setTimeout(() => { try { window.replaySystem.start(); } catch (e) {} }, 4000);
                }
            }
            
            break; // Only process one galaxy per check
        }
    }
}


// =============================================================================
// BORG CUBE ENCOUNTER SYSTEM
// =============================================================================

const BORG_MESSAGES = [
    "Resistance is futile.",
    "You will be assimilated.",
    "Your biological and technological distinctiveness will be added to our own.",
    "We are the Borg. Lower your shields and surrender your ships.",
    "Freedom is irrelevant. Self-determination is irrelevant.",
    "You will adapt to service us.",
    "Strength is irrelevant. Resistance is futile.",
    "We are Borg. Existence as you know it is over."
];

// Borg ominous alarm system
let borgAlarmOscillator = null;
let borgAlarmGain = null;
let borgAlarmActive = false;

function startBorgAlarm() {
    if (borgAlarmActive || !audioContext || audioContext.state === 'suspended') return;

    // Cinematic arrival card alongside the alarm
    if (typeof flashEventText === 'function') {
        flashEventText('⬢ THE BORG ⬢', '#33ff55', 'RESISTANCE IS FUTILE');
    }
    
    try {
        borgAlarmOscillator = audioContext.createOscillator();
        borgAlarmGain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        
        borgAlarmOscillator.connect(filter);
        filter.connect(borgAlarmGain);
        borgAlarmGain.connect(audioContext.destination);
        
        // Low ominous drone
        borgAlarmOscillator.type = 'sawtooth';
        borgAlarmOscillator.frequency.setValueAtTime(55, audioContext.currentTime);  // Very low A
        
        // Pulsing effect via LFO on gain
        const lfo = audioContext.createOscillator();
        const lfoGain = audioContext.createGain();
        lfo.connect(lfoGain);
        lfoGain.connect(borgAlarmGain.gain);
        
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.5, audioContext.currentTime);  // Slow pulse
        lfoGain.gain.setValueAtTime(0.08, audioContext.currentTime);
        
        // Low pass filter for ominous rumble
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, audioContext.currentTime);
        filter.Q.setValueAtTime(2, audioContext.currentTime);
        
        // Base gain
        borgAlarmGain.gain.setValueAtTime(0.15, audioContext.currentTime);
        
        borgAlarmOscillator.start();
        lfo.start();
        borgAlarmActive = true;
        
        console.log('🔊 Borg alarm started');
    } catch (e) {
        console.warn('Failed to start Borg alarm:', e);
    }
}

function stopBorgAlarm() {
    if (!borgAlarmActive) return;
    
    try {
        if (borgAlarmGain) {
            borgAlarmGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
        }
        setTimeout(() => {
            if (borgAlarmOscillator) {
                borgAlarmOscillator.stop();
                borgAlarmOscillator = null;
            }
            borgAlarmGain = null;
            borgAlarmActive = false;
            console.log('🔇 Borg alarm stopped');
        }, 600);
    } catch (e) {
        borgAlarmActive = false;
    }
}

// Borg cubes now live in BORG patrol systems (outer-systems.js).
// checkBorgSpawn / spawnBorgCube / spawnBorgDrone / updateBorgBehavior removed.
// Combat behavior handled by updateBorgPatrolCombat in outer-systems.js.
function checkBorgSpawn() {}
function updateBorgBehavior() {}

// =============================================================================
// MISSILE SYSTEM
// =============================================================================

// Missile System
function fireMissile() {
    // Resume audio context on user interaction to fix suspended state warning
    resumeAudioContext();

    if (typeof shieldSystem !== 'undefined' && shieldSystem.active) {
        showAchievement('Missiles Disabled', 'Shields must be deactivated first');
        return;
    }

    if (gameState.missiles.cooldown > 0 || gameState.missiles.current <= 0) {
        if (gameState.missiles.current <= 0) {
            showAchievement('No Missiles', 'Missiles depleted - defeat enemies for resupply');
        }
        return;
    }

    gameState.missiles.current--;
    gameState.missiles.cooldown = gameState.missiles.cooldownTime;

    let targetObject = null;
    let targetPosition;

    // Missiles can use navigation panel targets from distance
    if (gameState.currentTarget) {
        targetPosition = gameState.currentTarget.position.clone();
        targetObject = gameState.currentTarget;
    } else if (gameState.targetLock.active && gameState.targetLock.target) {
        targetPosition = gameState.targetLock.target.position.clone();
        targetObject = gameState.targetLock.target;
    } else {
        const mousePos = new THREE.Vector2(
            (gameState.crosshairX / window.innerWidth) * 2 - 1,
            -(gameState.crosshairY / window.innerHeight) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePos, camera);
        const enemyIntersects = raycaster.intersectObjects(enemies);

        if (enemyIntersects.length > 0) {
            targetPosition = enemyIntersects[0].point;
            targetObject = enemyIntersects[0].object;
        } else {
            const direction = raycaster.ray.direction.clone();
            targetPosition = camera.position.clone().add(direction.multiplyScalar(1000));
        }
    }

    // Use ship model position if available, otherwise camera position
    const missileOrigin = (window.cameraState && window.cameraState.playerShipMesh) 
        ? window.cameraState.playerShipMesh.position.clone()
        : camera.position.clone();
    createMissile(missileOrigin, targetPosition, targetObject);
    playSound('missile_launch');
    updateMissileUI();
}

function createMissile(startPos, targetPos, targetObject) {
    const missileGeometry = new THREE.CylinderGeometry(0.3, 0.5, 2, 8);
    const missileMaterial = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    const missile = new THREE.Mesh(missileGeometry, missileMaterial);

    missile.position.copy(startPos);
    const direction = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(up, direction);
    const angle = Math.acos(up.dot(direction));
    if (axis.length() > 0.001) {
        missile.setRotationFromAxisAngle(axis.normalize(), angle);
    }

    // Glow effect
    const glowGeometry = new THREE.CylinderGeometry(0.5, 0.7, 2.5, 8);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    missile.add(glow);

    // Smoke trail
    const trailGeometry = new THREE.CylinderGeometry(0.2, 0.4, 1, 6);
    const trailMaterial = new THREE.MeshBasicMaterial({
        color: 0x666666,
        transparent: true,
        opacity: 0.6
    });
    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    trail.position.y = -1.5;
    missile.add(trail);

    scene.add(missile);

    missile.userData = {
        velocity: direction.clone().multiplyScalar(gameState.missiles.speed),
        target: targetObject,
        lifetime: 0,
        maxLifetime: 5000,
        type: 'missile'
    };

    if (!window.activeMissiles) window.activeMissiles = [];
    window.activeMissiles.push(missile);
}

function updateMissiles() {
    if (!window.activeMissiles) return;

    window.activeMissiles = window.activeMissiles.filter(missile => {
        missile.userData.lifetime += (typeof gameState !== 'undefined' && gameState.dtMs) || 16.67;

        if (missile.userData.lifetime > missile.userData.maxLifetime) {
            scene.remove(missile);
            return false;
        }

        // Tracking
        if (missile.userData.target && missile.userData.target.userData.health > 0) {
            const targetDir = new THREE.Vector3()
                .subVectors(missile.userData.target.position, missile.position)
                .normalize();
            missile.userData.velocity.lerp(
                targetDir.multiplyScalar(gameState.missiles.speed),
                0.05
            );
        }

        missile.position.add(missile.userData.velocity);

        const up = new THREE.Vector3(0, 1, 0);
        const axis = new THREE.Vector3().crossVectors(up, missile.userData.velocity.clone().normalize());
        const angle = Math.acos(up.dot(missile.userData.velocity.clone().normalize()));
        if (axis.length() > 0.001) {
            missile.setRotationFromAxisAngle(axis.normalize(), angle);
        }

        // Hit detection
        if (typeof enemies !== 'undefined') {
            for (let enemy of enemies) {
                if (enemy.userData.health <= 0) continue;
                if (missile.position.distanceTo(enemy.position) < 15) {
                    handleMissileHit(missile, enemy);
                    return false;
                }
            }
        }

        // Cosmic feature destruction
        if (typeof cosmicFeatures !== 'undefined') {
            // Check Dyson Spheres
            if (cosmicFeatures.dysonSpheres) {
                for (let sphere of cosmicFeatures.dysonSpheres) {
                    if (sphere.userData.destroyed) continue;
                    const distance = missile.position.distanceTo(sphere.position);
                    if (distance < 100) {
                        handleCosmicFeatureDestruction(missile, sphere, 'dyson');
                        return false;
                    }
                }
            }

            // Check Crystal structures
            if (cosmicFeatures.crystalStructures) {
                for (let crystal of cosmicFeatures.crystalStructures) {
                    if (crystal.userData.destroyed) continue;
                    const distance = missile.position.distanceTo(crystal.position);
                    if (distance < 50) {
                        handleCosmicFeatureDestruction(missile, crystal, 'crystal');
                        return false;
                    }
                }
            }

            // Check Space Whales
            if (cosmicFeatures.spaceWhales) {
                for (let whale of cosmicFeatures.spaceWhales) {
                    if (whale.userData.destroyed) continue;
                    const distance = missile.position.distanceTo(whale.position);
                    if (distance < 80) {
                        handleCosmicFeatureDestruction(missile, whale, 'whale');
                        return false;
                    }
                }
            }
        }

        return true;
    });
}

function handleMissileHit(missile, enemy) {
    scene.remove(missile);

    // A missile shatters an active orange shield in one hit. The shield
    // consumes the missile (no health damage that strike); subsequent
    // fire hits the now-exposed hull.
    if (typeof _enemyShieldAbsorbHit === 'function' &&
        _enemyShieldAbsorbHit(enemy, true)) {
        _activateOnDamage(enemy);
        createMissileExplosion(missile.position);
        if (typeof playSound === 'function') playSound('missile_explosion');
        return;
    }

    enemy.userData.health -= gameState.missiles.damage;
    enemy.userData.lastHitTime = Date.now();
    _activateOnDamage(enemy);
    flashEnemyHit(enemy, gameState.missiles.damage);
    createMissileExplosion(missile.position);
    playSound('missile_explosion');

    // Arcade praise on a player missile IMPACT (a kill below overrides it
    // with the bigger kill praise).
    if (enemy.userData.health > 0 && typeof flashArcadeText === 'function') {
        flashArcadeText('MISSILE STRIKE!', 2);
    }

    showAchievement('Missile Hit!',
        `Damaged ${enemy.userData.name} (${enemy.userData.health}/${enemy.userData.maxHealth} HP)`);

    if (enemy.userData.health <= 0) {
        // Big tiered kill praise (streak-aware) for missile finishes too.
        if (typeof arcadePraiseKill === 'function') {
            arcadePraiseKill(!!enemy.userData.isBoss,
                (typeof camera !== 'undefined') ? camera.position.distanceTo(enemy.position) : 0,
                enemy.userData);
        }
        if (window.arcade) {
            window.arcade.addKill(enemy.userData, enemy.position, !!enemy.userData.isBoss);
            window.arcade.hitstop(enemy.userData.isBoss ? 90 : 45);
        }
        const wasBoss = enemy.userData.isBoss;
        const bossName = enemy.userData.name;

        // Reputation + small energy refund for the missile kill.
        if (typeof awardKillReward === 'function') awardKillReward(enemy);

        // Same big-kill upgrade for missile finishes.
        const _missUD = enemy.userData || {};
        const _missBig = _missUD.isBoss || _missUD.isEliteGuardian || _missUD.isBlackHoleGuardian;
        const _missBorg = _missUD.isBorgCube || _missUD.type === 'borg_drone' || _missUD.isBorg;
        const _missPirate = _missUD.isMartianPirate && !_missUD.isVulcanPatrol;
        if (_missBorg && typeof createMassiveBorgExplosion === 'function') {
            createMassiveBorgExplosion(enemy.position, _missUD.cubeSize || 30);
            playSound('explosion');
        } else if (_missBig && typeof createBossExplosion === 'function') {
            const _color = _missUD.galaxyColor || 0xff5522;
            createBossExplosion(enemy.position, {
                color: _color,
                scale: _missUD.isBoss ? 1.8 : 1.3
            });
        } else if (_missPirate) {
            createExplosionEffect(enemy.position, 0xff4444, 15);
            playSound('explosion');
        } else if (typeof createFactionExplosion === 'function' &&
                   typeof _missUD.galaxyId === 'number') {
            // Half diameter for black-hole (distant) galaxy hostiles.
            createFactionExplosion(enemy.position, _missUD.galaxyId,
                isEnemyInLocalGalaxy(enemy) ? 1.0 : 0.5);
        } else {
            createExplosionEffect(enemy.position, 0xff4444, 15);
            playSound('explosion');
        }

        if (wasBoss) {
            showAchievement('BOSS DEFEATED!', `${bossName} destroyed by missile!`);
            if (typeof checkBossVictory === 'function') checkBossVictory(enemy);
            if (typeof createFireworkCelebration === 'function') createFireworkCelebration();
            playBossVictoryMusic();

            // Boss defeated: refill missiles (max cap 10)
            gameState.missiles.capacity = Math.min(10, gameState.missiles.capacity);
            gameState.missiles.current = gameState.missiles.capacity;
            showAchievement('Missiles Restored!',
                `Full loadout: ${gameState.missiles.current}/${gameState.missiles.capacity}`);
        } else {
            showAchievement('Enemy Destroyed!', `${enemy.userData.name} eliminated by missile`);

            // 20% chance for missile drop
            if (Math.random() < 0.2) {
                gameState.missiles.current = Math.min(gameState.missiles.capacity, gameState.missiles.current + 1);
                showAchievement('Missile Recovered!',
                    `+1 missile from debris (${gameState.missiles.current}/${gameState.missiles.capacity})`);
            }
        }

        const hullRecovery = wasBoss ? 15 + Math.random() * 15 : 5 + Math.random() * 10;
        gameState.hull = Math.min(gameState.maxHull || 100, gameState.hull + hullRecovery);
        showAchievement('Hull Repaired', `+${hullRecovery.toFixed(1)} hull integrity from salvage`);

        if (gameState.targetLock.target === enemy) gameState.targetLock.target = null;
        if (gameState.currentTarget === enemy) gameState.currentTarget = null;

        scene.remove(enemy);
        enemies.splice(enemies.indexOf(enemy), 1);

        if (typeof populateTargets === 'function') setTimeout(populateTargets, 100);
        checkGalaxyClear();

        // 🏆 VICTORY SYSTEM: Check if guardians defeated → galaxy liberated
        checkGuardianVictory();

        // ENHANCED: Check if we should spawn area bosses, galaxy bosses,
        // species bosses, or elite guardians.
        // PREVIOUSLY: missile kills only ran area boss + elite guardian
        // checks, missing checkGalaxyBossSpawn / checkSpeciesBossSpawn —
        // so killing the LAST regular enemy of a galaxy/species with a
        // missile would silently skip the boss spawn forever.
        if (typeof checkAndSpawnAreaBosses === 'function') {
            checkAndSpawnAreaBosses();
        }
        if (typeof checkGalaxyBossSpawn === 'function') {
            checkGalaxyBossSpawn();
        }
        if (typeof checkSpeciesBossSpawn === 'function') {
            checkSpeciesBossSpawn();
        }
        if (typeof checkAndSpawnEliteGuardians === 'function') {
            checkAndSpawnEliteGuardians();
        }
    }
}

function handleCosmicFeatureDestruction(missile, feature, type) {
    scene.remove(missile);
    feature.userData.destroyed = true;

    // Create larger explosion
    createMissileExplosion(missile.position);
    playSound('missile_explosion');

    // ⭐ NEW: Award warp for destroying cosmic feature
    if (gameState.emergencyWarp && gameState.emergencyWarp.available < gameState.emergencyWarp.maxWarps) {
        gameState.emergencyWarp.available++;
        console.log(`⚡ Warp earned from cosmic feature destruction! Total: ${gameState.emergencyWarp.available}/${gameState.emergencyWarp.maxWarps}`);
    }

    // Apply effects based on type
    switch(type) {
        case 'dyson':
            // Dyson Sphere: +25% energy max
            const energyBoost = 25;
            gameState.maxEnergy = (gameState.maxEnergy || 100) + energyBoost;
            gameState.energy = Math.min(gameState.maxEnergy, gameState.energy + energyBoost);
            showAchievement('DYSON SPHERE DESTROYED!',
                `Maximum energy capacity increased to ${gameState.maxEnergy}%!`, true);
            break;

        case 'crystal':
            // Crystal Structure: 2x attack damage
            if (!gameState.weaponDamageMultiplier) gameState.weaponDamageMultiplier = 1;
            gameState.weaponDamageMultiplier *= 2;
            showAchievement('CRYSTAL STRUCTURE DESTROYED!',
                `Weapon damage multiplier: x${gameState.weaponDamageMultiplier}!`, true);
            break;

        case 'whale':
            // Space Whale: -50% hull curse
            const hullPenalty = gameState.hull * 0.5;
            gameState.hull = Math.max(1, gameState.hull - hullPenalty);
            showAchievement('SPACE WHALE DESTROYED!',
                `Ancient curse applied: -${hullPenalty.toFixed(0)}% hull integrity!`, true);
            break;
    }

    // Visual destruction effect
    if (feature.material) {
        feature.material.transparent = true;
        let opacity = 1.0;
        const fadeInterval = setInterval(() => {
            opacity -= 0.05;
            if (feature.material) {
                feature.material.opacity = opacity;
            }
            if (opacity <= 0) {
                clearInterval(fadeInterval);
                scene.remove(feature);
            }
        }, 50);
    } else {
        scene.remove(feature);
    }
}

function createMissileExplosion(position) {
    const explosionGeometry = new THREE.SphereGeometry(8, 16, 16);
    const explosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xff3300,
        transparent: true,
        opacity: 0.9
    });
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    scene.add(explosion);

    // Particles
    const particles = new THREE.BufferGeometry();
    const particleCount = 40;
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 25;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 25;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 25;
    }

    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xff6600,
        size: 1.5,
        transparent: true,
        opacity: 1
    });
    const particleSystem = new THREE.Points(particles, particleMaterial);
    particleSystem.position.copy(position);
    scene.add(particleSystem);

    // Add to explosion manager
    let scale = 1;
    let opacity = 0.9;
    let particleLife = 1.0;

    explosionManager.addExplosion({
        update(deltaTime) {
            // Update explosion sphere
            scale += 0.8 * (deltaTime / 50);
            opacity -= 0.08 * (deltaTime / 50);
            explosion.scale.set(scale, scale, scale);
            explosionMaterial.opacity = Math.max(0, opacity);

            // Update particles
            particleLife -= 0.025 * (deltaTime / 70);
            particleMaterial.opacity = Math.max(0, particleLife);

            return opacity > 0 || particleLife > 0;
        },

        cleanup() {
            scene.remove(explosion);
            scene.remove(particleSystem);
            explosionGeometry.dispose();
            explosionMaterial.dispose();
            particles.dispose();
            particleMaterial.dispose();
        }
    });

    playSound('missile_explosion');
}

function updateMissileUI() {
    const missileCount = document.getElementById('missileCount');
    if (missileCount) {
        missileCount.textContent = `${gameState.missiles.current}/${gameState.missiles.capacity}`;
    }

    const mobileMissileCount = document.getElementById('mobileMissileCountBadge');
    if (mobileMissileCount) {
        mobileMissileCount.textContent = gameState.missiles.current;
    }
}

// =============================================================================
// WEAPON SYSTEM
// =============================================================================

// RESTORED: Working weapon system with asteroid targeting
function fireWeapon() {
    // Once the player is dying / game over, stop all player weapon fire
    // so the demo (or a held trigger) can't keep shooting lasers
    // through the death-explosion sequence.
    if (typeof gameState !== 'undefined' &&
        (gameState.playerDying || gameState.gameOver || gameState.gameOverScreenShown)) {
        return;
    }
    // Resume audio context on user interaction to fix suspended state warning
    resumeAudioContext();

    // Faster weapon cooldown (RESTORED)
    if (gameState.weapons.cooldown > 0 || gameState.weapons.energy < 10) return;
    
    // OVERDRIVE power-up halves the cooldown for rapid fire.
    gameState.weapons.cooldown = (window.arcade && window.arcade.hasPowerup && window.arcade.hasPowerup('overdrive')) ? 90 : 200;
    gameState.weapons.energy = Math.max(0, gameState.weapons.energy - (gameState._chargedShot ? Math.round(12 + (gameState._chargedPower || 0.5) * 28) : 10));
    
    // Enhanced targeting with doubled ranges
    let targetObject = null;
    let targetPosition;
    
    if (gameState.targetLock.active && gameState.targetLock.target) {
        // Auto-aim at locked target (including asteroids)
        targetPosition = gameState.targetLock.target.position.clone();
        targetObject = gameState.targetLock.target;
    }
    
    if (!targetObject) {
        // Manual aiming using crosshair position
        const mousePos = new THREE.Vector2(
            (gameState.crosshairX / window.innerWidth) * 2 - 1,
            -(gameState.crosshairY / window.innerHeight) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePos, camera);
        
        // Check for enemy hits first (recursive: true for GLB model Groups)
        const enemyIntersects = raycaster.intersectObjects(enemies, true);
        if (enemyIntersects.length > 0) {
            targetPosition = enemyIntersects[0].point;
            // Get the root enemy object (may be a parent Group)
            targetObject = enemyIntersects[0].object;
            while (targetObject.parent && targetObject.parent.userData && targetObject.parent.userData.type === 'enemy') {
                targetObject = targetObject.parent;
            }
        } else {
            // Check for BORG drone hits (from outer interstellar systems)
            let borgDrones = [];
            if (typeof outerInterstellarSystems !== 'undefined') {
                outerInterstellarSystems.forEach(system => {
                    if (system.userData && system.userData.drones) {
                        system.userData.drones.forEach(drone => {
                            if (drone.userData.health > 0) {
                                // Add all children of the drone group for raycasting
                                borgDrones.push(...drone.children);
                            }
                        });
                    }
                });
            }

            // Civilian / military ships are full combat participants:
            // player lasers hit them (hitscan), they shield up / flee /
            // call distress (civilians) or return fire (military).
            if (typeof damageCivilianShip === 'function') {
                const _civPool = [];
                if (typeof tradingShips !== 'undefined') {
                    for (let _ci = 0; _ci < tradingShips.length; _ci++) {
                        const s = tradingShips[_ci];
                        if (s && (!s.userData || !s.userData.destroyed)) _civPool.push(s);
                    }
                }
                if (typeof civilianShips !== 'undefined') {
                    for (let _ci = 0; _ci < civilianShips.length; _ci++) {
                        const s = civilianShips[_ci];
                        if (s && (!s.userData || !s.userData._destroyed)) _civPool.push(s);
                    }
                }
                if (_civPool.length) {
                    const civIntersects = raycaster.intersectObjects(_civPool, true);
                    if (civIntersects.length > 0) {
                        targetPosition = civIntersects[0].point;
                        let _root = civIntersects[0].object;
                        while (_root.parent && _civPool.indexOf(_root) === -1) _root = _root.parent;
                        if (_civPool.indexOf(_root) !== -1) {
                            targetObject = _root;
                            if (typeof createHitSparks === 'function') {
                                createHitSparks(civIntersects[0].point, 0x66ddff);
                            }
                            damageCivilianShip(_root, 1,
                                (typeof _civilianPlayerProxy !== 'undefined') ? _civilianPlayerProxy
                                    : { position: camera.position, isPlayerProxy: true, userData: { health: 1 } });
                            // Firing on unarmed civilians costs reputation;
                            // military patrol craft shoot back instead.
                            if (_root.userData && _root.userData.shipCategory !== 'military' &&
                                typeof awardReputation === 'function') {
                                awardReputation(-2, 'Civilian vessel fired upon');
                            }
                        }
                    }
                }
            }

            const borgIntersects = (!targetObject) ? raycaster.intersectObjects(borgDrones) : [];
            if (borgIntersects.length > 0) {
                targetObject = borgIntersects[0].object.parent; // Parent is the drone group
                // Use the cube's world center as target so the proximity
                // check in checkWeaponHits (300u radius) reliably matches.
                // The raycast point can be up to 300u away on the hitbox
                // sphere surface, which would be on the boundary of the test.
                const _borgCenter = new THREE.Vector3();
                targetObject.getWorldPosition(_borgCenter);
                targetPosition = _borgCenter;
                // Hit log silenced (per-shot spam)
            } else {
                // Check for asteroid hits (for manual aiming only; skip if
                // a civilian ship already took this shot)
                const asteroidTargets = targetObject ? [] : planets.filter(p => p.userData.type === 'asteroid');
                const asteroidIntersects = raycaster.intersectObjects(asteroidTargets);
                if (asteroidIntersects.length > 0) {
                    targetPosition = asteroidIntersects[0].point;
                    targetObject = asteroidIntersects[0].object;
                } else {
                    // Check for interstellar asteroid hits
                    if (typeof interstellarAsteroids !== 'undefined' && interstellarAsteroids.length > 0) {
                        const interstellarIntersects = raycaster.intersectObjects(interstellarAsteroids);
                        if (interstellarIntersects.length > 0) {
                            targetPosition = interstellarIntersects[0].point;
                            targetObject = interstellarIntersects[0].object;
                            targetObject.userData.isInterstellarAsteroid = true;  // Flag for special handling
                            // Hit log silenced
                        }
                    }

                    // Check for outer system asteroids (exotic core + BORG systems)
                    if (!targetObject && typeof outerInterstellarSystems !== 'undefined') {
                        let outerAsteroids = [];
                        outerInterstellarSystems.forEach(system => {
                            if (system.userData && system.userData.orbiters) {
                                system.userData.orbiters.forEach(orbiter => {
                                    if (orbiter.userData && orbiter.userData.type === 'outer_asteroid') {
                                        outerAsteroids.push(orbiter);
                                    }
                                });
                            }
                        });

                        if (outerAsteroids.length > 0) {
                            const outerAsteroidIntersects = raycaster.intersectObjects(outerAsteroids);
                            if (outerAsteroidIntersects.length > 0) {
                                targetPosition = outerAsteroidIntersects[0].point;
                                targetObject = outerAsteroidIntersects[0].object;
                                // Hit log silenced
                            }
                        }
                    }

                    if (!targetObject) {
                        // Fire in the direction of the crosshair
                        const direction = raycaster.ray.direction.clone();
                        targetPosition = camera.position.clone().add(direction.multiplyScalar(1000));
                    }
                }
            }
        }
    }
    
    // Create weapon effect - different approach for 1st vs 3rd person
    const mode = window.cameraState?.mode || 'first-person';
    const playerShip = window.cameraState?.playerShipMesh;
    
    if (mode === 'third-person' && playerShip && playerShip.visible) {
        // 3RD PERSON: Create tracer effect from wing tips
        createThirdPersonLasers(playerShip, targetPosition);
    } else {
        // 1ST PERSON: Fire from camera position
        const leftOffset = new THREE.Vector3(-3, -2, 0).applyQuaternion(camera.quaternion);
        const rightOffset = new THREE.Vector3(3, -2, 0).applyQuaternion(camera.quaternion);
        
        const _beamCol = gameState._chargedShot ? '#ffdd33' : '#00ff96'; // charged = yellow
        createLaserBeam(camera.position.clone().add(leftOffset), targetPosition, _beamCol, true);
        createLaserBeam(camera.position.clone().add(rightOffset), targetPosition, _beamCol, true);
        // SPREAD SHOT power-up: two extra fanned beams.
        if (window.arcade && window.arcade.hasPowerup && window.arcade.hasPowerup('spread')) {
            const _fwd = new THREE.Vector3(); camera.getWorldDirection(_fwd);
            const _up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
            [-0.12, 0.12].forEach(ang => {
                const _d = _fwd.clone().applyAxisAngle(_up, ang);
                const _end = camera.position.clone().addScaledVector(_d, 6000);
                createLaserBeam(camera.position.clone(), _end, '#99ff66', true);
            });
        }
        if (gameState._chargedShot) {
            // Charged blast: yellow bolts from the CHARGE CENTER (the glow
            // midpoint), more bolts with higher charge.
            const _origin = gameState._chargeCenter ? gameState._chargeCenter.clone() : camera.position.clone();
            const _bolts = 1 + Math.round((gameState._chargedPower || 0.5) * 3); // 1-4
            for (let _b = 0; _b < _bolts; _b++) {
                const _j = new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0).applyQuaternion(camera.quaternion);
                createLaserBeam(_origin.clone().add(_j), targetPosition, '#ffee66', true);
            }
        }
    }
    
    // Handle weapon hits based on target type
    if (targetObject) {
        if (targetObject.userData.type === 'asteroid' || targetObject.userData.type === 'outer_asteroid') {
            // Asteroid hit - restore hull, pass actual hit position
            destroyAsteroidByWeapon(targetObject, targetPosition);
        } else if (targetObject.userData.type === 'interstellar_asteroid') {
            // Interstellar asteroid hit - break into pieces
            if (typeof breakInterstellarAsteroid === 'function') {
                const hitNormal = new THREE.Vector3().subVectors(targetPosition, targetObject.position).normalize();
                breakInterstellarAsteroid(targetObject, targetPosition, hitNormal);
                // Small hull restoration for shooting large asteroids
                if (typeof gameState !== 'undefined') {
                    gameState.hull = Math.min(gameState.maxHull, gameState.hull + 5);
                }
                // Play asteroid hit sound
                if (typeof playSound === 'function') {
                    playSound('explosion');
                }
                console.log('Interstellar asteroid broken into fragments (+5 hull)');
            }
        } else {
            // Check for normal enemy/object hits
            checkWeaponHits(targetPosition);
        }
    } else {
        // FIXED: Still check for hits near the ray path even without direct raycast hit
        // This allows hits on enemies that are close to the crosshair aim line
        // targetPosition is already set to a point along the ray direction (line 4022)
        checkWeaponHits(targetPosition);
    }
    
    // Charged blast consumed — clear the flags now that targeting/damage ran.
    if (typeof gameState !== 'undefined') { gameState._chargedShot = false; gameState._chargedPower = 0; }

    // Apply weapon power boost from solar storms
    if (typeof gameState !== 'undefined' && gameState.weaponPowerBoost > 1.0) {
        // Increase damage or effect based on boost
        weaponDamage *= gameState.weaponPowerBoost;
        
        // Show enhanced weapon effect
        if (typeof showAchievement === 'function') {
            showAchievement('Enhanced Weapons!', 'Solar storm energy boosting firepower');
        }
    }
    
    // Check for pulsar interference
    if (typeof gameState !== 'undefined' && gameState.navigationJammed) {
        // Reduce accuracy or add random deviation
        const interference = Math.random() * 0.3; // 30% interference
        // Apply interference to targeting...
    }
    
    // Start cooldown countdown
    const cooldownInterval = setInterval(() => {
        gameState.weapons.cooldown -= 50;
        if (gameState.weapons.cooldown <= 0) {
            gameState.weapons.cooldown = 0;
            clearInterval(cooldownInterval);
        }
        if (typeof updateUI === 'function') updateUI();
    }, 50);
    
    if (typeof updateUI === 'function') updateUI();
    playSound('weapon');
}

// =============================================================================
// PAUSE SYSTEM
// =============================================================================

// =============================================================================
// PAUSE SYSTEM - FIXED
// =============================================================================

function togglePause() {
    // Use consistent state variable
    if (typeof gameState === 'undefined') {
        console.error('gameState not defined, cannot toggle pause');
        return;
    }
    
    gameState.paused = !gameState.paused;

    // AUDIO FOLLOWS PAUSE: suspend the WebAudio graph (synth music + SFX
    // freeze in place) and pause the MP3 soundtrack (keeps its position);
    // both resume exactly where they left off on unpause.
    try {
        if (gameState.paused) {
            if (typeof audioContext !== 'undefined' && audioContext && audioContext.state === 'running') {
                audioContext.suspend();
            }
            if (typeof window !== 'undefined' && window.soundtrack && window.soundtrack.pauseAll) {
                window.soundtrack.pauseAll();
            }
        } else {
            if (typeof audioContext !== 'undefined' && audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
            if (typeof window !== 'undefined' && window.soundtrack && window.soundtrack.resumeAll) {
                window.soundtrack.resumeAll();
            }
        }
    } catch (e) {}

    // Create pause overlay if it doesn't exist
    let pauseOverlay = document.getElementById('pauseOverlay');
    if (!pauseOverlay) {
        pauseOverlay = document.createElement('div');
        pauseOverlay.id = 'pauseOverlay';
        pauseOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;' +
            'background:rgba(0,0,0,0.75);display:none;align-items:center;' +
            'justify-content:center;z-index:9999;';
        pauseOverlay.innerHTML = `
            <div class="text-center ui-panel rounded-lg p-8">
                <h2 class="text-3xl font-bold text-cyan-400 mb-4">GAME PAUSED</h2>
                <p class="text-gray-300 mb-6">Press P or click Resume to continue</p>
                <button id="pauseResumeBtn" class="space-btn rounded px-6 py-3">
                    <i class="fas fa-play mr-2"></i>Resume Game
                </button>
            </div>
        `;
        document.body.appendChild(pauseOverlay);
        // Attach Resume click via addEventListener (inline onclick can fail)
        const resumeBtn = document.getElementById('pauseResumeBtn');
        if (resumeBtn) {
            resumeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePause();
            });
        }
    }

    pauseOverlay.style.display = gameState.paused ? 'flex' : 'none';
    
    // Update pause button
    const pauseBtn = document.getElementById('pauseBtn');
    const pauseIcon = document.getElementById('pauseIcon');
    if (pauseBtn) {
        if (gameState.paused) {
            pauseBtn.classList.add('paused');
            if (pauseIcon) pauseIcon.className = 'fas fa-play mr-1';
        } else {
            pauseBtn.classList.remove('paused');
            if (pauseIcon) pauseIcon.className = 'fas fa-pause mr-1';
        }
    }
    
    console.log(gameState.paused ? 'Game paused' : 'Game resumed');
}
// =============================================================================
// ACHIEVEMENT SYSTEM
// =============================================================================

function showAchievement(title, description, playAchievementSound = true) {
    // Defer achievements while an incoming transmission popup is on screen
    // so they don't visually overlap. Re-fires when the transmission closes.
    if (document.getElementById('incomingTransmissionPrompt') ||
        document.getElementById('missionCommandAlert')) {
        if (!window._deferredAchievements) window._deferredAchievements = [];
        // Avoid queueing duplicates
        const dup = window._deferredAchievements.some(a => a.title === title && a.description === description);
        if (!dup) {
            window._deferredAchievements.push({ title, description, playAchievementSound });
        }
        return;
    }

    // Check if tutorial is active and suppress non-critical achievements
    const tutorialActive = (typeof tutorialSystem !== 'undefined' && tutorialSystem.active && !tutorialSystem.completed);
    
    // List of achievements that should be suppressed during tutorial
    const suppressDuringTutorial = [
        'Slingshot Ready',
        'Target Acquired', 
        'Target Cycled',
        'Asteroid Hit!',
        'Target Hit!',
        'Gravitational Slingshot'
    ];
    
    // List of critical achievements that should ALWAYS show (even during tutorial)
    const alwaysCritical = [
        'Training Complete',
        'BOSS DEFEATED!',
        'Galaxy Cleared!',
        'Galaxy Liberated!',  // ⭐ Added
        'Victory!',
        'Enemy Destroyed!',
        'Galaxy Discovery!',  // ⭐ Added
    ];
    
    // If tutorial is active and this achievement should be suppressed, just log it
    if (tutorialActive && suppressDuringTutorial.includes(title) && !alwaysCritical.includes(title)) {
        console.log(`Achievement suppressed during tutorial: ${title} - ${description}`);
        return;
    }
    
    // Display achievement
    const popup = document.getElementById('achievementPopup');
    const achievementText = document.getElementById('achievementText');
    const titleElement = popup && popup.querySelector('h4');
    
    if (popup && achievementText && titleElement) {
        achievementText.textContent = description;
        titleElement.textContent = title;

        // ⭐ CRITICAL: Force clear any inline styles that might block visibility
        popup.style.display = '';  // Clear inline display style
        popup.style.visibility = ''; // Clear inline visibility style
        popup.style.opacity = '';   // Clear inline opacity style
        popup.style.zIndex = '999'; // Maximum priority
        popup.style.position = 'fixed'; // Ensure it's always fixed

        // ⭐ BORG STYLING: Apply green ORBITRON font for BORG messages
        if (title.includes('BORG')) {
            popup.classList.add('borg-message');
            titleElement.style.fontFamily = "'Orbitron', monospace";
            titleElement.style.color = '#00ff00';
            titleElement.style.textShadow = '0 0 10px rgba(0, 255, 0, 0.8)';
            achievementText.style.fontFamily = "'Orbitron', monospace";
            achievementText.style.color = '#00ff00';
            achievementText.style.textShadow = '0 0 8px rgba(0, 255, 0, 0.6)';
        } else {
            popup.classList.remove('borg-message');
            titleElement.style.fontFamily = '';
            titleElement.style.color = '';
            titleElement.style.textShadow = '';
            achievementText.style.fontFamily = '';
            achievementText.style.color = '';
            achievementText.style.textShadow = '';
        }

        popup.classList.remove('hidden');

        // Add click handler for "Slingshot Ready" on mobile
        if (title === 'Slingshot Ready') {
            popup.classList.add('interactive'); // Enable pointer events
            popup.style.cursor = 'pointer';

            // Remove any existing handlers to prevent duplicates
            const oldHandler = popup._slingshotClickHandler;
            if (oldHandler) {
                popup.removeEventListener('click', oldHandler);
                popup.removeEventListener('touchstart', oldHandler);
            }

            // Create new handler
            const slingshotHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('📱 Slingshot Ready notification tapped');

                if (typeof executeSlingshot === 'function') {
                    executeSlingshot();
                    popup.classList.add('hidden');
                    popup.classList.remove('interactive');
                }
            };

            // Store handler reference for cleanup
            popup._slingshotClickHandler = slingshotHandler;

            // Add listeners
            popup.addEventListener('click', slingshotHandler);
            popup.addEventListener('touchstart', slingshotHandler, { passive: false });
        } else {
            popup.classList.remove('interactive'); // Disable pointer events
            popup.style.cursor = 'default';

            // Remove slingshot handler if exists
            const oldHandler = popup._slingshotClickHandler;
            if (oldHandler) {
                popup.removeEventListener('click', oldHandler);
                popup.removeEventListener('touchstart', oldHandler);
                popup._slingshotClickHandler = null;
            }
        }

        console.log(`✨ Achievement displaying: ${title}`);

        // Longer display time for important achievements.
        // 3x the old 4s — congratulations/victory toasts need time
        // to be read and savoured.
        const displayTime = 12000;

        // Play sound if requested
        if (playAchievementSound && typeof playSound === 'function') {
            playSound('achievement');
        }

        // Auto-hide after display time
        setTimeout(() => {
            popup.classList.add('hidden');
            popup.classList.remove('interactive'); // Remove pointer events when hidden
            console.log(`✅ Achievement hidden: ${title}`);
        }, displayTime);
    } else {
        console.warn('Achievement popup elements not found:', { popup, achievementText, titleElement });
    }
}

// =============================================================================
// TARGET LOCK AND CYCLING SYSTEM
// =============================================================================

function targetNearestEnemy() {
    // Safety check for enemies array
    if (typeof enemies === 'undefined' || typeof camera === 'undefined' || typeof gameState === 'undefined') return;
    
    const nearbyEnemies = enemies.filter(enemy => 
        enemy.userData.health > 0 && 
        camera.position.distanceTo(enemy.position) < 2000
    ).sort((a, b) => {
        const distA = camera.position.distanceTo(a.position);
        const distB = camera.position.distanceTo(b.position);
        return distA - distB;
    });
    
    if (nearbyEnemies.length > 0) {
        gameState.currentTarget = nearbyEnemies[0];
        gameState.targetLock.target = nearbyEnemies[0];
        if (typeof updateUI === 'function') updateUI();
        if (typeof populateTargets === 'function') populateTargets();
    }
}

function cycleTargets() {
    if (typeof gameState === 'undefined' || typeof camera === 'undefined') return;
    
    // Get all targetable objects including cosmic features
    const allTargets = [];
    
    // Add planets (excluding asteroids from navigation)
    if (typeof planets !== 'undefined') {
        const targetablePlanets = planets.filter(p => p.userData.name !== 'Earth' && p.userData.type !== 'asteroid');
        allTargets.push(...targetablePlanets);
    }
    
    // Add wormholes
    if (typeof wormholes !== 'undefined') {
        const detectedWormholes = wormholes.filter(w => w.userData.detected);
        allTargets.push(...detectedWormholes);
    }
    
    // OPTIMIZED: Helper function to filter by squared distance (avoids expensive sqrt)
    const filterBySquaredDist = (items, maxDistSquared) => {
        const camPos = camera.position;
        return items.filter(obj => {
            const dx = obj.position.x - camPos.x;
            const dy = obj.position.y - camPos.y;
            const dz = obj.position.z - camPos.z;
            return (dx*dx + dy*dy + dz*dz) < maxDistSquared;
        });
    };

    // Add comets
    if (typeof comets !== 'undefined') {
        allTargets.push(...filterBySquaredDist(comets, 4000*4000));
    }

    // Add enemies
    if (typeof enemies !== 'undefined') {
        const aliveEnemies = enemies.filter(e => e.userData.health > 0);
        allTargets.push(...filterBySquaredDist(aliveEnemies, 2000*2000));
    }

    // ADD COSMIC FEATURES TO CYCLING - OPTIMIZED with pre-calculated squared distances
    if (typeof cosmicFeatures !== 'undefined') {
        allTargets.push(...filterBySquaredDist(cosmicFeatures.pulsars, 2000*2000));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.supernovas, 3000*3000));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.dysonSpheres, 4000*4000));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.ringworlds, 4000*4000));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.spaceWhales, 2000*2000));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.brownDwarfs, 1500*1500));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.solarStorms, 2500*2500));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.crystalFormations, 1800*1800));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.plasmaStorms, 2200*2200));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.roguePlanets, 1600*1600));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.darkMatterNodes, 400*400));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.dustClouds, 250*250));
    }

    // Add nebula gas clouds
    if (typeof nebulaGasClouds !== 'undefined') {
        allTargets.push(...filterBySquaredDist(nebulaGasClouds, 3000*3000));
    }

    // Add ally wingmen so the nav system detects them
    if (typeof allyShips !== 'undefined') {
        const aliveAllies = allyShips.filter(a => a && a.userData && a.userData.health > 0);
        allTargets.push(...filterBySquaredDist(aliveAllies, 6000*6000));
    }

    // OPTIMIZED: Cache distances in a Map to avoid recalculating during sort
    const distanceCache = new Map();
    const getDistance = (obj) => {
        if (!distanceCache.has(obj)) {
            distanceCache.set(obj, camera.position.distanceTo(obj.position));
        }
        return distanceCache.get(obj);
    };

    // Filter by distance and sort using cached distances
    const nearbyObjects = allTargets.filter(obj => getDistance(obj) < 6000)
        .sort((a, b) => getDistance(a) - getDistance(b));

    if (nearbyObjects.length === 0) {
        gameState.currentTarget = null;
        showAchievement('No Targets', 'No objects detected in range');
        return;
    }

    let currentIndex = -1;
    if (gameState.currentTarget) {
        currentIndex = nearbyObjects.findIndex(target => target === gameState.currentTarget);
    }
    
    const nextIndex = (currentIndex + 1) % nearbyObjects.length;
    const newTarget = nearbyObjects[nextIndex];
    
    selectTarget(newTarget);
}

function selectTarget(target) {
    if (typeof gameState === 'undefined') return;
    
    gameState.currentTarget = target;
    
    // REMOVED: Don't automatically link navigation targeting to crosshair targeting
    // These systems should be independent
    // if (gameState.targetLock.active) {
    //     gameState.targetLock.target = target;
    // }
    
    if (typeof updateUI === 'function') updateUI();
    if (typeof populateTargets === 'function') populateTargets();
    
    const distance = camera.position.distanceTo(target.position);
    showAchievement('Target Cycled', `${target.userData.name} (${distance.toFixed(0)} units)`);
    playSound('navigation');
}

// Mobile Detection and Setup
let isMobileDevice = false;
let touchControls = {
    active: false,
    lastTouch: { x: 0, y: 0 },
    sensitivity: 0.002,
    fireRadius: 80
};

function initializeMobileSystem() {
    // Detect mobile devices
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || 
                     window.innerWidth <= 768 || 
                     ('ontouchstart' in window);
    
    if (isMobileDevice) {
        console.log('🔥 Mobile device detected - activating mobile mode');
        document.body.classList.add('mobile-mode');
        setupMobileUI();
        setupMobileControls();
        enableAutoCrosshairTargeting();
        enableAutoThrust();
    }
    
    return isMobileDevice;
}

function setupMobileControls() {
    // Remove existing desktop event listeners for mobile
    if (isMobileDevice) {
        // Create touch overlay
        createTouchOverlay();
        
        // Modify existing crosshair for mobile
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
            crosshair.classList.add('mobile-crosshair');
            crosshair.style.width = '48px';
            crosshair.style.height = '48px';
            crosshair.style.borderWidth = '3px';
        }
        
        touchControls.active = true;
    }
}

function createTouchOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'mobileOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 5;
        background: transparent;
        touch-action: none;
    `;
    
    document.body.appendChild(overlay);
    
    // Touch event handlers - ONLY for camera look, NO tap-to-fire
    let isPointerDown = false;
    let lastPointerPos = { x: 0, y: 0 };
    let hasMoved = false;
    
    overlay.addEventListener('pointerdown', (e) => {
        // CRITICAL: Don't interfere with mobile UI buttons
        if (e.target.closest('.mobile-btn') || 
            e.target.closest('.mobile-controls') ||
            e.target.closest('.mobile-popup') ||
            e.target.closest('.nav-panel-mobile')) {
            return; // Let button handlers take over
        }
        
        e.preventDefault();
        isPointerDown = true;
        hasMoved = false;
        lastPointerPos = { x: e.clientX, y: e.clientY };
    });
    
    overlay.addEventListener('pointermove', (e) => {
        // CRITICAL: Don't interfere with mobile UI buttons
        if (e.target.closest('.mobile-btn') || 
            e.target.closest('.mobile-controls') ||
            e.target.closest('.mobile-popup') ||
            e.target.closest('.nav-panel-mobile')) {
            return;
        }
        
        e.preventDefault();
        
        if (isPointerDown) {
            const deltaX = e.clientX - lastPointerPos.x;
            const deltaY = e.clientY - lastPointerPos.y;
            
            // Track movement
            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
                hasMoved = true;
            }
            
            // Apply camera rotation
            handleMobileLook(deltaX, deltaY);
            
            lastPointerPos = { x: e.clientX, y: e.clientY };
        }
        
        // Update crosshair position
        if (gameState.crosshairTargeting) {
            updateMobileCrosshair(e.clientX, e.clientY);
        }
    });
    
    overlay.addEventListener('pointerup', (e) => {
        // CRITICAL: Don't interfere with mobile UI buttons
        if (e.target.closest('.mobile-btn') || 
            e.target.closest('.mobile-controls') ||
            e.target.closest('.mobile-popup') ||
            e.target.closest('.nav-panel-mobile')) {
            return;
        }
        
        e.preventDefault();
        isPointerDown = false;
        hasMoved = false;
    });
    
    // Prevent default touch behaviors
    overlay.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    overlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    overlay.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
}

// Integrate with existing camera controls
function handleMobileLook(deltaX, deltaY) {
    if (typeof camera !== 'undefined' && typeof gameState !== 'undefined') {
        // Apply rotation to existing camera system
        gameState.mouseMovementX = deltaX * touchControls.sensitivity;
        gameState.mouseMovementY = deltaY * touchControls.sensitivity;
        
        // Use existing camera rotation logic
        camera.rotation.y -= gameState.mouseMovementX;
        camera.rotation.x -= gameState.mouseMovementY;
        
        // Clamp vertical rotation
        camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
    }
}

function handleMobileFire() {
    // Use existing fire function if available
    if (typeof fireWeapon === 'function') {
        fireWeapon();
    } else {
        console.log('🔫 Mobile fire triggered');
        // Add your existing weapon firing logic here
    }
}

function updateMobileCrosshair(x, y) {
    const crosshair = document.getElementById('crosshair');
    if (crosshair && gameState) {
        gameState.crosshairX = x;
        gameState.crosshairY = y;
        crosshair.style.left = x + 'px';
        crosshair.style.top = y + 'px';
    }
}

function enableAutoCrosshairTargeting() {
    if (typeof gameState !== 'undefined') {
        gameState.crosshairTargeting = true;
        gameState.autoTargeting = true;
        console.log('📱 Auto-crosshair targeting enabled for mobile');
    }
}

function enableAutoThrust() {
    if (typeof gameState !== 'undefined') {
        gameState.autoThrust = true;
        gameState.thrustActive = true;
        console.log('🚀 Auto-thrust enabled for mobile');
    }
}


// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function createDeathEffect() {
    // Route through the shared triggerPlayerDeath helper so the
    // explosion plays out (visuals + layered sound) before the
    // MISSION FAILED screen takes over. Without this hop, enemy
    // weapon fire at hull=0 popped the game-over screen instantly,
    // hiding the explosion entirely.
    if (typeof triggerPlayerDeath === 'function') {
        triggerPlayerDeath('HULL BREACH',
            'Ship destroyed by enemy fire - hull integrity: 0%');
        return;
    }
    // Last-resort fallback if the helper isn't loaded for some
    // reason (e.g. early in the boot before game-physics.js runs).
    if (typeof gameState !== 'undefined' && gameState.velocityVector) {
        gameState.velocityVector.set(0, 0, 0);
    }
    if (typeof createPlayerExplosion === 'function') createPlayerExplosion();
    if (typeof playSound === 'function') playSound('explosion');
    if (typeof showGameOverScreen === 'function') {
        showGameOverScreen('HULL BREACH', 'Ship destroyed by enemy fire - hull integrity: 0%');
    }
}

function playVictoryMusic() {
    if (!audioContext) return;
    
    // Play victory fanfare
    const notes = [523, 659, 783, 1046]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
        setTimeout(() => {
            playSound('achievement', freq, 0.4, false);
        }, index * 200);
    });
}

function playBossVictoryMusic() {
    // Short celebratory tune for boss defeats
    const celebrationNotes = [440, 554, 659, 880]; // A4, C#5, E5, A5
    celebrationNotes.forEach((freq, index) => {
        setTimeout(() => {
            playSound('achievement', freq, 0.3, false);
        }, index * 150);
    });
}

function playGalaxyVictoryMusic() {
    if (!audioContext) return;
    
    // Triumphant galaxy liberation fanfare
    const victoryChord = [523, 659, 784, 1047]; // C major chord (C5, E5, G5, C6)
    
    // Play ascending victory chord
    victoryChord.forEach((freq, index) => {
        setTimeout(() => {
            playSound('achievement', freq, 0.5, false);
        }, index * 100);
    });
    
    // Add a final triumphant high note
    setTimeout(() => {
        playSound('achievement', 1047, 0.8, false); // High C
    }, 600);
}

// FIXED: Black hole warp sound function
function playBlackHoleWarpSound() {
    playSound('blackhole_warp');
}

function playEnhancedBlackHoleWarpSound() {
    // Enhanced version with multiple layers
    playSound('blackhole_warp');
    setTimeout(() => playSound('warp'), 500);
}

// FIXED: Utility function to adjust minimum ship speed
function initControls() {
    console.log('ðŸŽ® initControls function called');
    
    try {
        if (typeof setupEnhancedEventListeners === 'function') {
            setupEnhancedEventListeners();
            console.log('âœ… Event listeners initialized');
        } else {
            console.warn('âš ï¸ setupEnhancedEventListeners not found');
        }
        
        if (typeof initAudio === 'function') {
            initAudio();
            console.log('âœ… Audio initialized');
        }
        
        setTimeout(() => {
            if (typeof startTutorial === 'function') {
                startTutorial();
                console.log('âœ… Tutorial started');
            }
        }, 1000);
        
    } catch (error) {
        console.error('âŒ Error in initControls:', error);
    }
}

// Auto-navigation toggle function for UI compatibility
function toggleAutoNavigate() {
    if (!gameState.currentTarget) {
        if (typeof showAchievement === 'function') {
            showAchievement('No Target', 'Select a target first');
        }
        return;
    }
    
    if (gameState.autoNavigating) {
        gameState.autoNavigating = false;
        gameState.autoNavOrienting = false;
        if (typeof showAchievement === 'function') {
            showAchievement('Auto-Nav Disengaged', 'Manual control resumed');
        }
    } else {
        gameState.autoNavigating = true;
        gameState.autoNavOrienting = true;
        if (typeof showAchievement === 'function') {
            showAchievement('Auto-Nav Engaged', `Orienting towards ${gameState.currentTarget.userData.name}`);
        }
    }
    
    if (typeof updateUI === 'function') updateUI();
}

// =============================================================================
// WINDOW EXPORTS - SINGLE CLEAN EXPORT SECTION
// =============================================================================

if (typeof window !== 'undefined') {
    // INITIALIZATION FUNCTIONS
    window.initControls = initControls;
    
    // Core systems
    window.initAudio = initAudio;
    window.setupEnhancedEventListeners = setupEnhancedEventListeners;
    window.adjustMinimumSpeed = adjustMinimumSpeed;
    
    // Combat systems
    window.updateEnemyBehavior = updateEnemyBehavior;
    window.fireWeapon = fireWeapon;
    window.flashEnemyHit = flashEnemyHit;

    // Missile systems
    window.fireMissile = fireMissile;
    window.updateMissiles = updateMissiles;
    window.updateMissileUI = updateMissileUI;

    // Borg systems (spawnBorgCube/spawnBorgDrone moved to outer-systems.js)
    window.checkBorgSpawn = checkBorgSpawn;
    window.updateBorgBehavior = updateBorgBehavior;

    // Audio systems
    window.playSound = playSound;
    window.toggleMusic = toggleMusic;
    window.resumeAudioContext = resumeAudioContext;
    window.playVictoryMusic = playVictoryMusic;
    window.playBlackHoleWarpSound = playBlackHoleWarpSound;
    window.playEnhancedBlackHoleWarpSound = playEnhancedBlackHoleWarpSound;
    // Add these to your existing window exports:
	window.playGalaxyVictoryMusic = playGalaxyVictoryMusic;
	window.playBossVictoryMusic = playBossVictoryMusic;
        
    // Visual effects
    window.createExplosionEffect = createExplosionEffect;
    window.createLaserBeam = createLaserBeam;
    
    // Damage effects
    window.createScreenDamageEffect = createScreenDamageEffect;
    window.createEnhancedScreenDamageEffect = createEnhancedScreenDamageEffect;
    window.createDirectionalDamageEffect = createDirectionalDamageEffect;
    
    // Progressive difficulty system
    window.calculateDifficultySettings = calculateDifficultySettings;
    window.getEnemyHealthForDifficulty = getEnemyHealthForDifficulty;
    window.refreshEnemyDifficulty = refreshEnemyDifficulty;
    
    // Tutorial system
    window.tutorialSystem = tutorialSystem;
    window.startTutorial = startTutorial;
    window.showMissionCommandAlert = showMissionCommandAlert;
    window.showIncomingTransmission = showIncomingTransmission;
    window.completeTutorial = completeTutorial;
    
    // UI systems
    window.showAchievement = showAchievement;
    window.selectTarget = selectTarget;
    window.cycleTargets = cycleTargets;
    
    // Target lock system
    window.targetNearestEnemy = targetNearestEnemy;
    
    // Game control
    window.togglePause = togglePause;
    
    // Utility functions
    window.isEnemyInLocalGalaxy = isEnemyInLocalGalaxy;
    window.createDeathEffect = createDeathEffect;
    window.checkGalaxyClear = checkGalaxyClear;
    window.checkGuardianVictory = checkGuardianVictory;
    
    // Combat behavior functions
    window.updatePursuitBehavior = updatePursuitBehavior;
    window.updateSwarmBehavior = updateSwarmBehavior;
    window.updateEvasionBehavior = updateEvasionBehavior;
    window.updateFlankingBehavior = updateFlankingBehavior;
    window.updateEngagementBehavior = updateEngagementBehavior;
    window.updatePatrolBehavior = updatePatrolBehavior;
    window.updateLocalEnemyBehavior = updateLocalEnemyBehavior;
    window.updateEnhancedEnemyBehavior = updateEnhancedEnemyBehavior;
    window.updateBossBehavior = updateBossBehavior;
    window.updateSupportBehavior = updateSupportBehavior;
    window.fireEnemyWeapon = fireEnemyWeapon;
    
    // Make keys available globally for game-physics.js
    window.keys = keys;
    
    // Make music system available
    window.musicSystem = musicSystem;
    
    console.log('âœ… Enhanced Game Controls loaded - All functions exported');
}

console.log('ðŸ Game Controls script completed successfully!');

// =============================================================================
// NEBULA SOUND DEBUG MENU - DISABLED
// Will be re-enabled when proper sound testing panel is implemented
// =============================================================================

// DISABLED: Debug menu and T key listener commented out
/*
window.nebulaDebugState = {
    mysteryFreq: 220,
    fadeInTime: 2,
    fadeOutTime: 8,
    interval: 14,
    volume: 0.04,
    bassEnabled: true,
    padEnabled: true,
    lastTrigger: null
};

window.toggleNebulaDebug = function() {
    const debugMenu = document.getElementById('nebulaSoundDebug');
    if (debugMenu) {
        debugMenu.classList.toggle('hidden');
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 't' || e.key === 'T') {
        if (typeof gameState !== 'undefined' && gameState.gameStarted && !gameState.paused) {
            e.preventDefault();
            toggleNebulaDebug();
        }
    }
});
*/

// DISABLED: All debug functions commented out
/*
window.updateMysteryFreq = function(value) {
    window.nebulaDebugState.mysteryFreq = parseFloat(value);
    document.getElementById('mysteryFreqValue').textContent = value + ' Hz';
};

// Update fade in time
window.updateFadeIn = function(value) {
    window.nebulaDebugState.fadeInTime = parseFloat(value);
    document.getElementById('fadeInValue').textContent = value + 's';
};

// Update fade out time
window.updateFadeOut = function(value) {
    window.nebulaDebugState.fadeOutTime = parseFloat(value);
    document.getElementById('fadeOutValue').textContent = value + 's';
};

// Update interval
window.updateInterval = function(value) {
    window.nebulaDebugState.interval = parseFloat(value);
    document.getElementById('intervalValue').textContent = value + 's';
};

// Update volume
window.updateVolume = function(value) {
    window.nebulaDebugState.volume = parseFloat(value);
    document.getElementById('volumeValue').textContent = value;
};

// Manual trigger mystery tone with debug settings
window.triggerDebugMysteryTone = function() {
    if (typeof audioContext === 'undefined' || !audioContext || typeof mysteryGain === 'undefined' || !mysteryGain || typeof mysteryOsc === 'undefined' || !mysteryOsc) {
        console.log('❌ Audio context not initialized');
        alert('Nebula sounds not initialized yet. Enter a nebula first!');
        return;
    }

    const now = audioContext.currentTime;
    const state = window.nebulaDebugState;

    // Use debug frequency
    const freqOptions = [state.mysteryFreq * 0.9, state.mysteryFreq, state.mysteryFreq * 1.1];
    const freq = freqOptions[Math.floor(Math.random() * freqOptions.length)];

    // Apply debug settings
    mysteryGain.gain.cancelScheduledValues(now);
    mysteryGain.gain.setValueAtTime(0, now);
    mysteryGain.gain.linearRampToValueAtTime(state.volume, now + state.fadeInTime);
    mysteryGain.gain.linearRampToValueAtTime(0.001, now + state.fadeInTime + state.fadeOutTime);

    mysteryOsc.frequency.setValueAtTime(freq, now);

    // Update debug display
    window.nebulaDebugState.lastTrigger = new Date().toLocaleTimeString();
    updateDebugState();

    console.log(`🎵 Debug mystery tone triggered: ${freq.toFixed(1)} Hz`);
};

// Toggle bass layer
window.toggleDebugBass = function() {
    if (typeof audioContext === 'undefined' || !audioContext) {
        alert('Audio context not initialized yet. Enter a nebula first!');
        return;
    }

    window.nebulaDebugState.bassEnabled = !window.nebulaDebugState.bassEnabled;
    const btn = document.getElementById('toggleBassBtn');
    if (btn) {
        btn.textContent = `Toggle Bass (${window.nebulaDebugState.bassEnabled ? 'ON' : 'OFF'})`;
    }

    if (typeof bassGain !== 'undefined' && bassGain) {
        const now = audioContext.currentTime;
        bassGain.gain.cancelScheduledValues(now);
        bassGain.gain.linearRampToValueAtTime(
            window.nebulaDebugState.bassEnabled ? 0.025 : 0,
            now + 0.5
        );
    }
};

// Toggle pad layer
window.toggleDebugPad = function() {
    if (typeof audioContext === 'undefined' || !audioContext) {
        alert('Audio context not initialized yet. Enter a nebula first!');
        return;
    }

    window.nebulaDebugState.padEnabled = !window.nebulaDebugState.padEnabled;
    const btn = document.getElementById('togglePadBtn');
    if (btn) {
        btn.textContent = `Toggle Pad (${window.nebulaDebugState.padEnabled ? 'ON' : 'OFF'})`;
    }

    if (typeof padGain !== 'undefined' && padGain) {
        const now = audioContext.currentTime;
        padGain.gain.cancelScheduledValues(now);
        padGain.gain.linearRampToValueAtTime(
            window.nebulaDebugState.padEnabled ? 0.015 : 0,
            now + 0.5
        );
    }
};

// Stop all nebula sounds
window.stopAllNebulaSounds = function() {
    if (musicSystem.backgroundMusic && musicSystem.backgroundMusic.stop) {
        musicSystem.backgroundMusic.stop();
        console.log('🛑 All nebula sounds stopped');
    }
};

// Update debug state display
function updateDebugState() {
    const stateDiv = document.getElementById('debugState');
    if (!stateDiv) return;

    const contextState = (typeof audioContext !== 'undefined' && audioContext) ? audioContext.state : 'not initialized';
    const lastTrigger = window.nebulaDebugState.lastTrigger || 'Never';

    stateDiv.innerHTML = `
        <div>Audio Context: <span class="text-green-400">${contextState}</span></div>
        <div>Mystery Tone Active: <span class="${(typeof audioContext !== 'undefined' && audioContext && audioContext.state === 'running') ? 'text-green-400' : 'text-gray-400'}">
            ${(typeof audioContext !== 'undefined' && audioContext && audioContext.state === 'running') ? 'Yes' : 'No'}
        </span></div>
        <div>Last Trigger: <span class="text-yellow-400">${lastTrigger}</span></div>
    `;
}

// Initialize debug menu buttons
document.addEventListener('DOMContentLoaded', () => {
    const triggerBtn = document.getElementById('triggerMysteryBtn');
    if (triggerBtn) {
        triggerBtn.addEventListener('click', window.triggerDebugMysteryTone);
    }

    const stopBtn = document.getElementById('stopAllSoundsBtn');
    if (stopBtn) {
        stopBtn.addEventListener('click', window.stopAllNebulaSounds);
    }

    const toggleBassBtn = document.getElementById('toggleBassBtn');
    if (toggleBassBtn) {
        toggleBassBtn.addEventListener('click', window.toggleDebugBass);
    }

    const togglePadBtn = document.getElementById('togglePadBtn');
    if (togglePadBtn) {
        togglePadBtn.addEventListener('click', window.toggleDebugPad);
    }

    // Update debug state every second
    setInterval(updateDebugState, 1000);
});

console.log('🎵 Nebula Sound Debug Menu DISABLED (awaiting proper sound testing panel)');
*/

// =============================================================================
// NEBULA VISIBILITY TOGGLE COMMANDS
// =============================================================================

window.showNebulas = function() {
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.log('⚠️ No nebulas found in scene');
        return;
    }

    nebulaClouds.forEach(nebula => {
        if (nebula) {
            nebula.visible = true;
        }
    });

    console.log(`✅ All ${nebulaClouds.length} nebulas are now visible`);
};

window.hideNebulas = function() {
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.log('⚠️ No nebulas found in scene');
        return;
    }

    nebulaClouds.forEach(nebula => {
        if (nebula) {
            nebula.visible = false;
        }
    });

    console.log(`🙈 All ${nebulaClouds.length} nebulas are now hidden`);
};

window.toggleNebulas = function() {
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.log('⚠️ No nebulas found in scene');
        return;
    }

    // Check current state of first nebula
    const currentlyVisible = nebulaClouds[0] && nebulaClouds[0].visible;

    nebulaClouds.forEach(nebula => {
        if (nebula) {
            nebula.visible = !currentlyVisible;
        }
    });

    console.log(`🔄 All ${nebulaClouds.length} nebulas toggled to ${!currentlyVisible ? 'visible' : 'hidden'}`);
};

console.log('🌫️ Nebula visibility commands loaded: showNebulas(), hideNebulas(), toggleNebulas()');

// =============================================================================
// ALLY NPC SHIPS — 2 independent wingmen patrolling the Sol system
// =============================================================================

const allyShips = [];

// ── Wingman role profiles ────────────────────────────────────────────────
// Each wingman is assigned a role that varies stat multipliers and target
// preference, so a squad of 4+ wingmen feels like distinct personalities
// without forking the AI state machine. Role mults are applied at use-time.
const WINGMAN_ROLES = {
    aggressor: {
        label: 'Aggressor',
        cruiseMult: 1.0, combatMult: 1.30, firingRangeMult: 1.5, detectionMult: 1.0,
        missilesMax: 8, missileCooldownMs: 6000, patrolDwellMs: 3000,
        // Closest enemy first
        pickTarget: (ally, candidates) => candidates[0] || null
    },
    sniper: {
        label: 'Sniper',
        cruiseMult: 0.85, combatMult: 0.95, firingRangeMult: 3.0, detectionMult: 1.2,
        missilesMax: 5, missileCooldownMs: 8000, patrolDwellMs: 6000,
        // Prefer boss, then highest-HP target
        pickTarget: (ally, candidates) => {
            if (!candidates.length) return null;
            const boss = candidates.find(c => c.userData && c.userData.isBoss);
            if (boss) return boss;
            return candidates.reduce((best, c) =>
                (!best || (c.userData.health || 0) > (best.userData.health || 0)) ? c : best, null);
        }
    },
    defender: {
        label: 'Defender',
        cruiseMult: 1.0, combatMult: 1.10, firingRangeMult: 1.0, detectionMult: 1.0,
        missilesMax: 6, missileCooldownMs: 4000, patrolDwellMs: 4000,
        // Prefer enemy nearest to the player (intercept role)
        pickTarget: (ally, candidates) => {
            if (!candidates.length) return null;
            if (typeof camera === 'undefined') return candidates[0];
            const playerPos = camera.position;
            let best = null, bestDist = Infinity;
            for (const c of candidates) {
                const d = c.position.distanceTo(playerPos);
                if (d < bestDist) { bestDist = d; best = c; }
            }
            return best;
        }
    },
    scout: {
        label: 'Scout',
        cruiseMult: 1.20, combatMult: 1.10, firingRangeMult: 1.0, detectionMult: 1.5,
        missilesMax: 5, missileCooldownMs: 8000, patrolDwellMs: 2500,
        // Closest enemy (but with longer detection range)
        pickTarget: (ally, candidates) => candidates[0] || null
    }
};
const _ROLE_ORDER = ['aggressor', 'defender', 'sniper', 'scout'];
function _roleFor(ally) {
    const k = ally && ally.userData && ally.userData.role;
    return WINGMAN_ROLES[k] || WINGMAN_ROLES.aggressor;
}
const _allyDir = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _allyTarget = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

// Build a wingman group + mesh + userData. Returns the group ready to
// be positioned and added to the scene. Used for both the Sol-start
// Alpha and the rescue-Beta parked near Sagittarius A*.
function _makeWingman(roleKey, name, primaryColor) {
    const group = new THREE.Group();

    // Build the real-model mesh (null if the GLB isn't cached yet).
    // Factored out so the placeholder fallback below can UPGRADE itself
    // when the model finishes loading, instead of a cone forever.
    function _buildRealWingmanMesh() {
        if (typeof getPlayerModel !== 'function') return null;
        const model = getPlayerModel();
        if (!model) return null;
        const mesh = model.clone();
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        mesh.traverse(child => {
            if (child.isMesh) {
                child.position.sub(center);
                child.material = new THREE.MeshBasicMaterial({
                    color: primaryColor,
                    transparent: true,
                    opacity: 0.85,
                    side: THREE.FrontSide
                });
                child.visible = true;
                child.frustumCulled = false;
            }
        });
        mesh.scale.set(96, 96, 96);
        return mesh;
    }

    let shipMesh = _buildRealWingmanMesh();
    let usedRealModel = !!shipMesh;
    if (!shipMesh) {
        const geo = new THREE.ConeGeometry(6, 16, 6);
        const mat = new THREE.MeshBasicMaterial({ color: primaryColor });
        shipMesh = new THREE.Mesh(geo, mat);
    }
    group.add(shipMesh);

    // Engine thruster glows — the SAME system the player ship uses
    // (createThrusterGlowsForModel), attached to the wingman's cloned
    // model at the identical local exhaust points. Only when the real
    // model was used (the fallback placeholder has no matching exhausts).
    let _wmThrusterGlows = [];
    if (usedRealModel && typeof createThrusterGlowsForModel === 'function') {
        _wmThrusterGlows = createThrusterGlowsForModel(shipMesh);
    }

    // INIT-RACE FIX: if this wingman was created before Player.glb finished
    // loading (the "permanent placeholder cone" bug), swap the real model
    // in as soon as it's cached. Boot.whenReady fires immediately if the
    // model is already there, later if not — creation order stops mattering.
    if (!usedRealModel && window.Boot) {
        window.Boot.whenReady('playerModel', () => {
            const real = _buildRealWingmanMesh();
            if (!real || group.userData.health <= 0) return;
            group.remove(shipMesh);
            if (shipMesh.geometry) shipMesh.geometry.dispose();
            if (shipMesh.material) shipMesh.material.dispose();
            group.add(real);
            if (typeof createThrusterGlowsForModel === 'function') {
                group.userData._thrusterGlows = createThrusterGlowsForModel(real);
            }
            console.log(`✅ ${name}: placeholder upgraded to real player model`);
        });
    }

    const profile = WINGMAN_ROLES[roleKey];
    group.userData = {
        type: 'ally',
        name: name,
        _thrusterGlows: _wmThrusterGlows,
        _thrusterGlowState: { intensity: 0 },
        role: roleKey,
        health: 50,
        maxHealth: 50,
        cruiseSpeed: 4.5,
        combatSpeed: 6.5,
        firingRange: 350,
        detectionRange: 3000,
        systemRadius: 100000,
        lastAttack: 0,
        currentTarget: null,
        isAlly: true,
        missilesRemaining: profile.missilesMax,
        missilesMax: profile.missilesMax,
        lastMissile: 0,
        missileCooldownMs: profile.missileCooldownMs,
        aiState: 'patrol',
        patrolTarget: null,
        patrolArriveTime: 0,
        patrolDwellMs: profile.patrolDwellMs,
        engageTarget: null,
        velocity: new THREE.Vector3(),
    };
    group.frustumCulled = false;
    return group;
}

function createAllyShips() {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || typeof camera === 'undefined') return;

    const sol = (typeof window !== 'undefined' && window.localSystemOffset)
        ? window.localSystemOffset
        : { x: 8000, y: 0, z: 4800 };

    // Alpha (Aggressor) starts WITH the player in the Sol system, just
    // off Earth's spawn position so the player has an immediate
    // wingman from frame 1.
    const alpha = _makeWingman('aggressor', 'Wingman Alpha', 0x00ff88);
    alpha.position.set(sol.x + 720, sol.y + 20, sol.z + 80);
    scene.add(alpha);
    allyShips.push(alpha);

    // Beta (Defender) + Gamma (Aggressor) deploy at Sagittarius A*
    // (world origin), ALREADY in the fight against the Vulcan patrols
    // there — active from frame 1, on opposite sides ~1500u out (just
    // beyond the black-hole keep-out, right in the Vulcan ring). The
    // wingman AI's _scanForEnemy picks up the nearby Vulcans and they
    // engage; while the player is far away in Sol they hold the line
    // here (patrol→engage, or stranded→engage between waves).
    const beta = _makeWingman('defender', 'Wingman Beta', 0x88aaff);
    beta.userData.colorNum = 0x88aaff;
    beta.position.set(1500, 80, 400);
    scene.add(beta);
    allyShips.push(beta);

    const gamma = _makeWingman('aggressor', 'Wingman Gamma', 0xffcc44);
    gamma.userData.colorNum = 0xffcc44;  // amber — read by thruster/radar tint
    gamma.position.set(-1400, -60, -500);
    scene.add(gamma);
    allyShips.push(gamma);

    console.log('🛡️ 3 wingmen deployed: Alpha at Sol, Beta + Gamma battling Vulcans at Sgr A*');
}

// ── Nebula wingman recruitment ───────────────────────────────────────────
// Greek alphabet names + matching colors for additional wingmen unlocked
// when the player discovers nebulas.
const NEBULA_WINGMAN_ROSTER = [
    { name: 'Wingman Gamma',   colorStr: '#ffaa44', colorNum: 0xffaa44 },
    { name: 'Wingman Delta',   colorStr: '#ff44aa', colorNum: 0xff44aa },
    { name: 'Wingman Epsilon', colorStr: '#44ffff', colorNum: 0x44ffff },
    { name: 'Wingman Zeta',    colorStr: '#aaff44', colorNum: 0xaaff44 },
    { name: 'Wingman Eta',     colorStr: '#ff8866', colorNum: 0xff8866 },
    { name: 'Wingman Theta',   colorStr: '#cc88ff', colorNum: 0xcc88ff },
    { name: 'Wingman Iota',    colorStr: '#88ff88', colorNum: 0x88ff88 },
    { name: 'Wingman Kappa',   colorStr: '#ff6699', colorNum: 0xff6699 }
];
let _nextNebulaWingmanIdx = 0;

function recruitNebulaWingman(nebulaName, spawnPos) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || typeof camera === 'undefined') return null;
    if (_nextNebulaWingmanIdx >= NEBULA_WINGMAN_ROSTER.length) return null; // roster exhausted

    const recruit = NEBULA_WINGMAN_ROSTER[_nextNebulaWingmanIdx++];
    const group = new THREE.Group();

    let shipMesh;
    if (typeof getPlayerModel === 'function') {
        const model = getPlayerModel();
        if (model) {
            shipMesh = model.clone();
            const box = new THREE.Box3().setFromObject(shipMesh);
            const center = box.getCenter(new THREE.Vector3());
            shipMesh.traverse(child => {
                if (child.isMesh) {
                    child.position.sub(center);
                    child.material = new THREE.MeshBasicMaterial({
                        color: recruit.colorNum,
                        transparent: true,
                        opacity: 0.85,
                        side: THREE.FrontSide
                    });
                    child.visible = true;
                    child.frustumCulled = false;
                }
            });
            shipMesh.scale.set(96, 96, 96);
        }
    }
    if (!shipMesh) {
        const geo = new THREE.ConeGeometry(6, 16, 6);
        const mat = new THREE.MeshBasicMaterial({ color: recruit.colorNum });
        shipMesh = new THREE.Mesh(geo, mat);
    }
    group.add(shipMesh);

    // Spawn beside the player, slightly offset to avoid overlap
    const playerPos = camera.position.clone();
    const angle = Math.random() * Math.PI * 2;
    const offset = 250 + Math.random() * 150;
    if (spawnPos) {
        group.position.copy(spawnPos);
    } else {
        group.position.set(
            playerPos.x + Math.cos(angle) * offset,
            playerPos.y + (Math.random() - 0.5) * 60,
            playerPos.z + Math.sin(angle) * offset
        );
    }

    // Cycle through specialist roles (sniper, scout, aggressor, defender, …)
    // so each recruit feels distinct from Alpha/Beta and from the previous
    // recruits.  Alpha=aggressor, Beta=defender, then sniper → scout → repeat.
    const _recruitRoleOrder = ['sniper', 'scout', 'aggressor', 'defender'];
    const role = _recruitRoleOrder[(_nextNebulaWingmanIdx - 1) % _recruitRoleOrder.length];
    const profile = WINGMAN_ROLES[role] || WINGMAN_ROLES.aggressor;

    group.userData = {
        type: 'ally',
        name: recruit.name,
        colorStr: recruit.colorStr,
        recruitedFrom: nebulaName || 'unknown nebula',
        role: role,
        health: 50,
        maxHealth: 50,
        cruiseSpeed: 4.5,
        combatSpeed: 6.5,
        firingRange: 350,
        detectionRange: 3000,
        systemRadius: 100000,
        lastAttack: 0,
        currentTarget: null,
        isAlly: true,
        missilesRemaining: profile.missilesMax,
        missilesMax: profile.missilesMax,
        lastMissile: 0,
        missileCooldownMs: profile.missileCooldownMs,
        aiState: 'patrol',
        patrolTarget: null,
        patrolArriveTime: 0,
        patrolDwellMs: profile.patrolDwellMs,
        engageTarget: null,
        velocity: new THREE.Vector3(),
    };

    group.frustumCulled = false;
    scene.add(group);
    allyShips.push(group);

    // Hail the player — include the recruit's role so the squad composition
    // is visible at a glance (Aggressor/Defender/Sniper/Scout)
    if (typeof showAchievement === 'function') {
        showAchievement(
            recruit.name + ' (' + profile.label + ') has joined!',
            'Hailing from ' + (nebulaName || 'the nebula') + '. Welcome to the squadron.',
            true
        );
    }
    if (typeof flashEventText === 'function') {
        flashEventText('WINGMAN ACQUIRED', '#66ffcc',
            recruit.name + ' · ' + profile.label);
    }
    if (typeof playSound === 'function') {
        playSound('achievement', 880, 0.4);
    }
    console.log('🛡️ Recruited ' + recruit.name + ' from ' + (nebulaName || 'nebula'));

    return group;
}

// Pick a patrol waypoint.  When the player is in a home system, bias
// the waypoint toward the player so wingmen swarm within ~500 u.
function _pickPatrolWaypoint(excludePos, attractPos) {
    // If we have a player position to attract toward, pick a random
    // offset within 150-400 u of that position for tight cover.
    if (attractPos) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 150 + Math.random() * 250;
        return new THREE.Vector3(
            attractPos.x + Math.cos(angle) * dist,
            attractPos.y + (Math.random() - 0.5) * 40,
            attractPos.z + Math.sin(angle) * dist
        );
    }

    if (typeof planets === 'undefined') return new THREE.Vector3(Math.random() * 4000 - 2000, 0, Math.random() * 4000 - 2000);
    const candidates = [];
    for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        if (!p || !p.userData) continue;
        if (p.userData.type === 'asteroid' || p.userData.type === 'asteroidBelt') continue;
        if (p.userData.type === 'blackhole') continue;
        if (!p.userData.isLocal) continue;
        if (p.userData.isLocalStar) continue;
        candidates.push(p);
    }
    if (!candidates.length) return new THREE.Vector3(1000, 0, 1000);
    if (excludePos) {
        candidates.sort((a, b) => b.position.distanceTo(excludePos) - a.position.distanceTo(excludePos));
        const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, Math.ceil(candidates.length / 2)))];
        return pick.position.clone();
    }
    return candidates[Math.floor(Math.random() * candidates.length)].position.clone();
}

// Scan for the nearest alive hostile within detection range of this ally
function _scanForEnemy(ally) {
    const ud = ally.userData;
    const role = _roleFor(ally);
    const range = ud.detectionRange * (role.detectionMult || 1.0);

    // Collect candidates within range, sorted by distance to the wingman.
    // Role.pickTarget then picks based on the wingman's specialty (closest,
    // boss/highest-HP for snipers, closest-to-player for defenders, etc).
    const candidates = [];
    if (typeof enemies !== 'undefined') {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e || !e.userData || e.userData.health <= 0) continue;
            const d = ally.position.distanceTo(e.position);
            if (d < range) candidates.push({ ent: e, d });
        }
    }
    if (typeof outerInterstellarSystems !== 'undefined') {
        const wp = new THREE.Vector3();
        outerInterstellarSystems.forEach(sys => {
            if (!sys.userData || !sys.userData.drones) return;
            sys.userData.drones.forEach(drone => {
                if (!drone || !drone.userData || drone.userData.health <= 0) return;
                drone.getWorldPosition(wp);
                const d = ally.position.distanceTo(wp);
                if (d < range) candidates.push({ ent: drone, d });
            });
        });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.d - b.d);
    const ents = candidates.map(c => c.ent);
    return role.pickTarget(ally, ents) || ents[0];
}

function _isPlayerInHomeSystem() {
    if (typeof camera === 'undefined') return false;
    const cp = camera.position;
    // Sol system: within ~7000u of origin
    if (cp.length() < 7000) return true;
    // Sagittarius A: check for nearby galactic-center black hole
    if (typeof planets !== 'undefined') {
        for (let i = 0; i < planets.length; i++) {
            const p = planets[i];
            if (p && p.userData && (p.userData.isSagittariusA || p.userData.isGalacticCenter)) {
                if (cp.distanceTo(p.position) < 7000) return true;
            }
        }
    }
    return false;
}

// Boss-victory wingman celebration. When an area boss (or mission
// boss) dies, every living wingman drops what it's doing and orbits
// the player tightly for a few seconds — a "we won" fly-by — before
// resuming patrol. triggerWingmanCelebration just stamps a global
// deadline; updateAllyShips reads it and switches state.
let _wingmanCelebrateUntil = 0;
function triggerWingmanCelebration(durationMs) {
    _wingmanCelebrateUntil = Date.now() + (durationMs || 5500);
    if (typeof showAchievement === 'function') {
        showAchievement('Squadron Victory Roll', 'Your wingmen rally around you to celebrate the kill!', false);
    }
}
if (typeof window !== 'undefined') window.triggerWingmanCelebration = triggerWingmanCelebration;

function updateAllyShips() {
    if (typeof camera === 'undefined' || typeof THREE === 'undefined') return;
    if (!gameState || !gameState.gameStarted || gameState.gameOver) return;

    if (!allyShips.length) return;

    const now = Date.now();
    const playerPos = camera.position;
    const playerWarping = _isPlayerWarping();
    const celebrating = now < _wingmanCelebrateUntil;

    allyShips.forEach(ally => {
        if (!ally || ally.userData.health <= 0) return;

        const ud = ally.userData;
        const pos = ally.position;
        const distFromOrigin = pos.length();
        const distToPlayer = pos.distanceTo(playerPos);

        // Wingman engine thrusters — driven exactly like the player ship's
        // (model-attached exhaust glows via updateThrusterGlowArray), not
        // the procedural enemy cone system. Lit when speeding up, warping,
        // or under any meaningful thrust.
        if (typeof updateThrusterGlowArray === 'function' && ud._thrusterGlows) {
            const vmag = ud.velocity ? ud.velocity.length() : 0;
            const prevSpeed = (typeof ud._prevGlowSpeed === 'number') ? ud._prevGlowSpeed : vmag;
            const accelerating = vmag > prevSpeed + 0.0006;
            const underPower = vmag > 0.05;
            const thrusting = ud._wasWarping || accelerating || underPower;
            updateThrusterGlowArray(ud._thrusterGlows, ud._thrusterGlowState, thrusting);
            ud._prevGlowSpeed = vmag;
        }

        // ── FTL anchor: warp ended this frame and a wingman in follow
        // state is still far from the player — pull them in via a small
        // hyperjump near the player rather than stranding them. Keeps the
        // squad together when emergency warp covers tens of thousands of
        // units of interstellar space.
        if (!playerWarping && ud._wasWarping && ud.aiState === 'follow' && distToPlayer > 1500) {
            _ftlAnchorWingman(ally, playerPos);
            ud._wasWarping = false;
        }
        // Track warping flag transition (used by the FTL anchor above)
        ud._wasWarping = playerWarping;

        // ── Enemy scan (every call, ~30 Hz) ──────────────────────────────
        const threat = _scanForEnemy(ally);

        // ── State transitions ────────────────────────────────────────────
        // Boss-victory celebration takes priority over everything except
        // an active warp (we never want wingmen stranded). They abandon
        // combat/patrol and rally into a tight orbit around the player.
        if (celebrating && !playerWarping) {
            if (ud.aiState !== 'celebrate') {
                _wingmanTacticalMessage(ud, 'kill');
                // Give each wingman a distinct orbit phase + radius so
                // they form a ring rather than stacking on one point.
                const idx = allyShips.indexOf(ally);
                ud._celebPhase = idx * (Math.PI * 2 / Math.max(1, allyShips.length));
                ud._celebRadius = 130 + (idx % 3) * 55;
                ud._celebHeight = (idx % 2 === 0 ? 1 : -1) * (30 + (idx % 3) * 20);
            }
            ud.aiState = 'celebrate';
            ud.engageTarget = null;
            ud.patrolTarget = null;
        } else if (!celebrating && ud.aiState === 'celebrate') {
            // Party's over — drop back to patrol (which biases toward
            // following the player, then on to the nebula).
            ud.aiState = 'patrol';
            ud.patrolTarget = null;
        }

        // Player is warping (slingshot/emergency/BH) — drop everything and follow
        if (playerWarping && ud.aiState !== 'engage') {
            if (ud.aiState !== 'follow') _wingmanTacticalMessage(ud, 'follow');
            ud.aiState = 'follow';
            ud.patrolTarget = null;
        }

        if (ud.aiState === 'patrol') {
            if (threat) {
                ud.aiState = 'engage';
                ud.engageTarget = threat;
                _wingmanTacticalMessage(ud, 'engage');
            } else if (distToPlayer > 4000) {
                // Separated by >4000u — stranded, orbit local planets here
                ud.aiState = 'stranded';
                _wingmanTacticalMessage(ud, 'stranded');
                ud.patrolTarget = null;
            } else if (distToPlayer > 400) {
                // Drifted past swarm radius — re-pick a waypoint near player
                ud.patrolTarget = null;
            }
        } else if (ud.aiState === 'follow') {
            // Stay in follow until player stops warping AND is reasonably close
            if (!playerWarping) {
                if (distToPlayer < 600) {
                    ud.aiState = 'patrol';
                    ud.patrolTarget = null;
                    _wingmanTacticalMessage(ud, 'tether');
                } else if (distToPlayer > 4000) {
                    ud.aiState = 'stranded';
                    ud.patrolTarget = null;
                    _wingmanTacticalMessage(ud, 'stranded');
                }
                // else stay in follow until close enough or fully stranded
            }
            if (threat && !playerWarping) {
                ud.aiState = 'engage';
                ud.engageTarget = threat;
            }
        } else if (ud.aiState === 'stranded') {
            // Reunion: player came back close enough — resume swarming
            if (distToPlayer < 1000) {
                ud.aiState = 'patrol';
                ud.patrolTarget = null;
                _wingmanTacticalMessage(ud, 'tether');
            }
            if (threat) {
                ud.aiState = 'engage';
                ud.engageTarget = threat;
            }
        } else if (ud.aiState === 'engage') {
            const et = ud.engageTarget;
            if (!et || !et.userData || et.userData.health <= 0 || !et.parent) {
                ud.engageTarget = null;
                ud.aiState = threat ? 'engage' : 'patrol';
                if (threat) ud.engageTarget = threat;
            } else {
                const engageDist = pos.distanceTo(et.position);
                if (engageDist > ud.detectionRange * 1.5) {
                    ud.aiState = 'patrol';
                    ud.engageTarget = null;
                }
            }
        } else if (ud.aiState === 'return') {
            if (distFromOrigin < ud.systemRadius * 0.7) {
                ud.aiState = 'patrol';
            }
            if (threat) {
                ud.aiState = 'engage';
                ud.engageTarget = threat;
            }
        }

        // ── Execute current state ────────────────────────────────────────
        if (ud.aiState === 'celebrate') {
            _executeCelebrate(ally, ud, now, playerPos);
        } else if (ud.aiState === 'engage' && ud.engageTarget) {
            _executeEngage(ally, ud, now);
        } else if (ud.aiState === 'follow') {
            _executeFollow(ally, ud, playerPos);
        } else if (ud.aiState === 'stranded') {
            _executeStranded(ally, ud, now);
        } else if (ud.aiState === 'return') {
            _executeReturn(ally, ud);
        } else {
            // Always swarm the player when within 4000u (any galaxy)
            _executePatrol(ally, ud, now, distToPlayer < 4000 ? playerPos : null);
        }

        // ── Tactical short-jump (the wingman's double-tap-W) ─────────────
        // When far from the objective — catching up to the player or
        // closing on an engaged target — wingmen burst-dash with a glowing
        // tracer streak, like the player's W×2 jump.
        {
            const _objective = (ud.aiState === 'engage' && ud.engageTarget && ud.engageTarget.position)
                ? ud.engageTarget.position
                : (distToPlayer > 1200 ? playerPos : null);
            if (!ud._jumpUntil && _objective &&
                pos.distanceTo(_objective) > 1200 &&
                now - (ud._lastJumpAt || 0) > 7000 + ((ally.id || 0) % 4000)) {
                ud._lastJumpAt = now;
                ud._jumpUntil = now + 850;
            }
            if (ud._jumpUntil) {
                if (now > ud._jumpUntil || !_objective) {
                    ud._jumpUntil = 0;
                } else {
                    if (!updateAllyShips._jumpVec) updateAllyShips._jumpVec = new THREE.Vector3();
                    const jv = updateAllyShips._jumpVec.subVectors(_objective, pos);
                    const jd = jv.length();
                    const step = Math.min(jd * 0.08, 14); // burst, easing on approach
                    jv.normalize();
                    ally.position.addScaledVector(jv, step);
                    // Face the JUMP direction — otherwise the facing block
                    // below uses the stale _allyDir from the state-execute
                    // (e.g. a patrol waypoint behind us), making the wingman
                    // fly backwards during the dash.
                    _allyDir.copy(jv);
                    // (Jump TRACER streaks removed — they read as glitchy
                    // lines off the wingmen's backs. The dash still happens.)
                }
            }
        }

        // ── Shield bubble: visible during combat engagement ──────────────
        _updateAllyShield(ally, ud.aiState === 'engage' && ud.engageTarget);

        // ── Idle asteroid target practice ────────────────────────────────
        // When not engaging an enemy, wingmen occasionally blast a nearby
        // asteroid — keeps the squadron looking active. ~5-9s per wingman.
        // THROTTLE THE SCAN ITSELF (not just the fire): the scan iterates
        // every planet (~3,500) at ~1ms. The old gate only updated its
        // timestamp on a successful fire, so in deep space with no asteroid
        // in range it re-scanned EVERY FRAME × every wingman — ~3ms/frame of
        // pure waste, the cause of the discovery-path chop. Stamp on every
        // scan attempt so it runs at most once per 5-9s per wingman.
        if (ud.aiState !== 'engage' && typeof _wingmanNearestAsteroid === 'function' &&
            now - (ud._lastAstScan || 0) > 5000 + ((ally.id || 0) % 4000)) {
            ud._lastAstScan = now;
            const ast = _wingmanNearestAsteroid(ally.position, 1400);
            if (ast) {
                const _ap = new THREE.Vector3();
                if (ast.getWorldPosition) ast.getWorldPosition(_ap); else _ap.copy(ast.position);
                const color = ud.name === 'Wingman Alpha' ? '#00ff88' : '#88aaff';
                _fireWingmanLaser(ally.position.clone(), _ap, color);
                if (typeof createHitSparks === 'function') createHitSparks(_ap, 0xffcc66);
            }
        }

        // ── Face movement direction ──────────────────────────────────────
        // lookAt points -Z toward the target; negate so the ship's +Z
        // (model forward) faces the travel direction.
        if (_allyDir.lengthSq() > 0.001) {
            const lookMat = new THREE.Matrix4().lookAt(
                pos, pos.clone().sub(_allyDir), new THREE.Vector3(0, 1, 0));
            const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMat);
            ally.quaternion.slerp(targetQuat, 0.06);
        }

        // ── Passive health regen ─────────────────────────────────────────
        if (ud.health < ud.maxHealth && now % 3000 < 50) {
            ud.health = Math.min(ud.maxHealth, ud.health + 1);
        }
    });
}

// ── Patrol: cruise between waypoints (biased toward player in home systems)
function _executePatrol(ally, ud, now, attractPos) {
    if (!ud.patrolTarget) {
        ud.patrolTarget = _pickPatrolWaypoint(ally.position, attractPos);
        ud.patrolArriveTime = 0;
    }

    _allyDir.subVectors(ud.patrolTarget, ally.position);
    const dist = _allyDir.length();

    if (dist < 120) {
        // Arrived at waypoint — dwell briefly, then pick a new one
        if (!ud.patrolArriveTime) ud.patrolArriveTime = now;
        // Drift gently while dwelling
        ud.velocity.multiplyScalar(0.92);
        ally.position.add(ud.velocity);
        if (now - ud.patrolArriveTime > ud.patrolDwellMs) {
            ud.patrolTarget = _pickPatrolWaypoint(ally.position, attractPos);
            ud.patrolArriveTime = 0;
        }
    } else {
        // Cruise toward waypoint with proportional speed control
        _allyDir.normalize();
        const role = _roleFor(ally);
        const cruise = ud.cruiseSpeed * (role.cruiseMult || 1.0);
        const targetSpeed = Math.min(cruise, dist * 0.02);
        ud.velocity.lerp(_allyDir.clone().multiplyScalar(targetSpeed), 0.04);
        ally.position.add(ud.velocity);
    }
}

// ── Engage: pursue and fire at hostile ───────────────────────────────────
function _executeEngage(ally, ud, now) {
    const et = ud.engageTarget;
    const enemyPos = et.position ? et.position.clone() : new THREE.Vector3();
    // For drones parented to outer-system groups, use world position
    if (et.parent && et.parent.type === 'Group' && et.parent.parent) {
        et.getWorldPosition(enemyPos);
    }

    const role = _roleFor(ally);
    const combatSpeed = ud.combatSpeed * (role.combatMult || 1.0);
    const firingRange = ud.firingRange * (role.firingRangeMult || 1.0);

    _allyDir.subVectors(enemyPos, ally.position);
    const dist = _allyDir.length();
    _allyDir.normalize();

    if (dist > firingRange) {
        // Close the distance — pursuit speed
        const chaseSpeed = Math.min(combatSpeed, dist * 0.03);
        ud.velocity.lerp(_allyDir.clone().multiplyScalar(chaseSpeed), 0.08);
    } else if (dist < 60) {
        // Too close — pull away slightly
        ud.velocity.lerp(_allyDir.clone().multiplyScalar(-1.0), 0.06);
    } else {
        // Strafing range — orbit the enemy at combat distance
        const tangent = new THREE.Vector3(-_allyDir.z, 0, _allyDir.x);
        ud.velocity.lerp(tangent.multiplyScalar(combatSpeed * 0.6), 0.05);
    }
    ally.position.add(ud.velocity);

    // Fire bright lasers when in range — wingmen do NO damage, just visuals
    // Wingmen don't fire for first 5 seconds, laser cooldown 1000ms
    const _gameAge = (gameState && gameState.gameStartTime) ? (Date.now() - gameState.gameStartTime) : 0;
    if (_gameAge < 5000) return;

    // ── Missile fire: cooldown + capacity scale with role ─────────
    if (dist < firingRange * 1.5 &&
        (ud.missilesRemaining || 0) > 0 &&
        now - (ud.lastMissile || 0) > (ud.missileCooldownMs || 8000)) {
        ud.lastMissile = now;
        ud.missilesRemaining = (ud.missilesRemaining || 0) - 1;
        _wingmanTacticalMessage(ud, 'missile');
        if (typeof _fireWingmanMissile === 'function') {
            _fireWingmanMissile(ally, et, enemyPos, ud);
        }
    }

    // ── Laser fire: 1000ms cooldown ────────────────────────────────
    if (dist < firingRange && now - ud.lastAttack > 1000) {
        ud.lastAttack = now;
        const color = ud.name === 'Wingman Alpha' ? '#00ff88' : '#88aaff';
        _fireWingmanLaser(ally.position.clone(), enemyPos, color);

        // Apply 10% laser damage
        if (et.userData) {
            // Wingman fire is also intercepted by the orange shield
            // (counts toward its 2-laser-hit break).
            if (typeof _enemyShieldAbsorbHit === 'function' &&
                _enemyShieldAbsorbHit(et, false)) {
                _activateOnDamage(et);
                return;
            }
            const wasAlive = et.userData.health > 0;
            et.userData.health -= 0.1;
            _activateOnDamage(et);
            if (typeof flashEnemyHit === 'function') flashEnemyHit(et, 0.1);

            // Kill notification + cleanup (remove from scene, run boss checks)
            if (wasAlive && et.userData.health <= 0) {
                _wingmanTacticalMessage(ud, 'kill');
                _handleWingmanKill(et);
            }
        }
    }
}

// ── Fire a wingman missile (visual + tracking + damage) ──────────────────
// Remove a wingman-killed enemy from the scene + array, run boss-spawn checks.
// Call when an enemy's health drops to 0 from wingman fire. Mirrors the
// essential cleanup that fireWeapon() does for player kills.
function _handleWingmanKill(enemy) {
    if (!enemy || !enemy.userData || enemy.userData._removedByWingman) return;
    enemy.userData._removedByWingman = true;

    // Visual + sound
    if (typeof createExplosionEffect === 'function') {
        createExplosionEffect(enemy.position);
    }
    if (typeof playSound === 'function') {
        playSound('explosion');
    }

    // Cluster + intel updates (some games track per-cluster kills)
    if (typeof updateClusterStatus === 'function') {
        try { updateClusterStatus(enemy); } catch (e) {}
    }
    if (typeof recordEnemyKillPosition === 'function') {
        try { recordEnemyKillPosition(enemy); } catch (e) {}
    }

    // Clear nav lock if this was the player's target
    if (gameState && gameState.targetLock && gameState.targetLock.target === enemy) {
        gameState.targetLock.target = null;
        gameState.targetLock.active = false;
    }
    if (gameState && gameState.currentTarget === enemy) {
        gameState.currentTarget = null;
    }

    // Remove from scene + enemies array
    if (typeof scene !== 'undefined' && scene.remove) scene.remove(enemy);
    if (typeof enemies !== 'undefined') {
        const idx = enemies.indexOf(enemy);
        if (idx !== -1) enemies.splice(idx, 1);
    }

    // Boss spawn checks
    if (typeof checkAndSpawnAreaBosses === 'function') checkAndSpawnAreaBosses();
    if (typeof checkGalaxyBossSpawn === 'function') checkGalaxyBossSpawn();
    if (typeof checkSpeciesBossSpawn === 'function') checkSpeciesBossSpawn();
    if (typeof checkAndSpawnEliteGuardians === 'function') checkAndSpawnEliteGuardians();
    if (typeof checkGalaxyClear === 'function') checkGalaxyClear();
}

function _fireWingmanMissile(ally, target, targetPos, ud) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || !target) return;
    try {
        const startPos = ally.position.clone();
        const color = ud.name === 'Wingman Alpha' ? 0x00ff88 : 0x88aaff;

        const missileGeo = new THREE.CylinderGeometry(0.4, 0.7, 3, 8);
        const missileMat = new THREE.MeshBasicMaterial({ color: color });
        const missile = new THREE.Mesh(missileGeo, missileMat);
        missile.position.copy(startPos);

        // Glow
        const glowGeo = new THREE.CylinderGeometry(0.8, 1.2, 4, 8);
        const glowMat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.45,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        missile.add(glow);

        const direction = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const axis = new THREE.Vector3().crossVectors(up, direction);
        const angle = Math.acos(up.dot(direction));
        if (axis.length() > 0.001) missile.setRotationFromAxisAngle(axis.normalize(), angle);

        scene.add(missile);

        // Wingman missile damage = 25% of player missile (3 → 0.75)
        const wingmanMissileDmg = (gameState && gameState.missiles ? gameState.missiles.damage : 3) * 0.25;
        const speed = 5.0;
        const velocity = direction.clone().multiplyScalar(speed);

        // Animate missile toward target
        const start = Date.now();
        const maxLife = 4000;
        const step = () => {
            const elapsed = Date.now() - start;
            if (elapsed > maxLife || !target.userData || target.userData.health <= 0) {
                scene.remove(missile);
                missile.geometry.dispose(); missile.material.dispose();
                glow.geometry.dispose(); glow.material.dispose();
                return;
            }
            // Track target
            const newDir = new THREE.Vector3().subVectors(target.position, missile.position).normalize();
            velocity.lerp(newDir.clone().multiplyScalar(speed), 0.1);
            missile.position.add(velocity);

            // Hit detection
            if (missile.position.distanceTo(target.position) < 30) {
                const wasAlive = target.userData.health > 0;
                target.userData.health -= wingmanMissileDmg;
                _activateOnDamage(target);
                if (typeof flashEnemyHit === 'function') flashEnemyHit(target, wingmanMissileDmg);
                if (typeof createExplosionEffect === 'function') createExplosionEffect(missile.position);
                if (wasAlive && target.userData.health <= 0) {
                    _wingmanTacticalMessage(ud, 'kill');
                    _handleWingmanKill(target);
                }
                scene.remove(missile);
                missile.geometry.dispose(); missile.material.dispose();
                glow.geometry.dispose(); glow.material.dispose();
                return;
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    } catch (e) {}
}

// ── Fire a thick bright laser from a wingman (no damage, visual only) ────
// Nearest asteroid to a position (world-space, handles belt-parented rocks).
const _wnaTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
function _wingmanNearestAsteroid(pos, range) {
    if (!_wnaTmp) return null;
    let best = null, bestD2 = (range || 1400) * (range || 1400); // squared — no sqrt
    if (typeof planets !== 'undefined') {
        for (let i = 0; i < planets.length; i++) {
            const p = planets[i];
            if (!p || !p.userData || p.userData.type !== 'asteroid') continue;
            if (p.getWorldPosition) p.getWorldPosition(_wnaTmp); else _wnaTmp.copy(p.position);
            const d2 = pos.distanceToSquared(_wnaTmp);
            if (d2 < bestD2) { bestD2 = d2; best = p; }
        }
    }
    // Interstellar / dense-galaxy-field asteroids (breakable rocks)
    if (typeof interstellarAsteroids !== 'undefined') {
        for (let i = 0; i < interstellarAsteroids.length; i++) {
            const a = interstellarAsteroids[i];
            if (!a || !a.userData || (a.userData.health !== undefined && a.userData.health <= 0)) continue;
            const d2 = pos.distanceToSquared(a.position);
            if (d2 < bestD2) { bestD2 = d2; best = a; }
        }
    }
    return best;
}

function _fireWingmanLaser(startPos, endPos, color) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    try {
        const direction = new THREE.Vector3().subVectors(endPos, startPos);
        const length = direction.length();

        // CORE — thick, fully opaque
        const coreGeo = new THREE.CylinderGeometry(0.8, 0.8, length, 12);
        const coreMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1.0 });
        const core = new THREE.Mesh(coreGeo, coreMat);
        // OUTER GLOW — much wider, additive blend
        const glowGeo = new THREE.CylinderGeometry(2.2, 2.2, length, 12);
        const glowMat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.45,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);

        const up = new THREE.Vector3(0, 1, 0);
        const dirNorm = direction.clone().normalize();
        const axis = new THREE.Vector3().crossVectors(up, dirNorm);
        const angle = Math.acos(up.dot(dirNorm));
        const orient = (mesh) => {
            mesh.position.copy(startPos);
            if (axis.length() > 0.001) {
                axis.normalize();
                mesh.setRotationFromAxisAngle(axis, angle);
            } else if (direction.y < 0) {
                mesh.rotateX(Math.PI);
            }
            mesh.position.add(direction.clone().multiplyScalar(0.5));
            mesh.renderOrder = 50;
        };
        orient(core);
        orient(glow);
        scene.add(core);
        scene.add(glow);

        // Fade out fast — same quick muzzle-flash fade as the player's
        // lasers (was a hard 250 ms hold then instant removal).
        let wlOpacity = 1.0;
        const wlFade = setInterval(() => {
            wlOpacity -= 0.4;
            coreMat.opacity = Math.max(0, wlOpacity);
            glowMat.opacity = Math.max(0, wlOpacity) * 0.45;
            if (wlOpacity <= 0) {
                clearInterval(wlFade);
                scene.remove(core); core.geometry.dispose(); core.material.dispose();
                scene.remove(glow); glow.geometry.dispose(); glow.material.dispose();
            }
        }, 25);
    } catch (e) {}
}

// ── Wingman tactical comms ──────────────────────────────────────────────
// Tactical chatter from wingmen during combat. Auto-displays a brief HUD
// transmission. Throttled per-wingman to once every 8s so they don't spam.
const WINGMAN_TACTICAL_LINES = {
    engage: [
        'Engaging hostile, Captain!',
        'Target acquired — moving in!',
        'I\'ve got eyes on the bandit!',
        'Locking on — covering you!',
        'Bogey in my sights!'
    ],
    kill: [
        'Splash one!',
        'Target eliminated, Captain.',
        'Got him!',
        'Hostile down!',
        'Scratch one bandit!'
    ],
    missile: [
        'Fox three! Missile away!',
        'Vampire away — track it!',
        'Missile inbound on target!'
    ],
    stranded: [
        'Captain, I\'ve lost contact — rendezvous when able.',
        'I\'ve fallen behind — orbiting local planets, awaiting your return.',
        'I can\'t keep up — falling out of range. I\'ll regroup at the nearest system.'
    ],
    follow: [
        'On your six, Captain!',
        'Forming up on your wing!',
        'Following you in.'
    ],
    // Wingman has just joined the formation (first deploy or rejoining
    // after being stranded). Distinct from 'follow' which fires whenever
    // the player triggers a warp event.
    tether: [
        'Tethered to your wing, Captain — ready to fly.',
        'Back on station, Captain. Good to see you.',
        'Squadron formation locked. Where to next?',
        'Reconnected — I\'ve got your six again.'
    ]
};

// ── Global wingman comms queue ───────────────────────────────────────────
// Multiple wingmen often hit the same state transition in the same frame
// (e.g. all fall stranded when the player warps far). Without serializing
// the popups they overlap and clip each other. The queue dispatches one
// every COMMS_INTERVAL_MS so the player can read each message in turn.
// Wingman comms serialize through this interval. Kept in step with the
// achievement display time (now 12s) so consecutive popups don't overlap.
const WINGMAN_COMMS_INTERVAL_MS = 12000;
const _wingmanCommsQueue = [];
let _wingmanCommsLastDispatch = 0;
let _wingmanCommsTimer = null;

function _drainWingmanComms() {
    _wingmanCommsTimer = null;
    if (!_wingmanCommsQueue.length) return;
    const now = Date.now();
    const wait = (_wingmanCommsLastDispatch + WINGMAN_COMMS_INTERVAL_MS) - now;
    if (wait > 0) {
        _wingmanCommsTimer = setTimeout(_drainWingmanComms, wait);
        return;
    }
    const msg = _wingmanCommsQueue.shift();
    _wingmanCommsLastDispatch = now;
    if (typeof showAchievement === 'function') {
        showAchievement(msg.title, msg.text, false);
    }
    if (_wingmanCommsQueue.length) {
        _wingmanCommsTimer = setTimeout(_drainWingmanComms, WINGMAN_COMMS_INTERVAL_MS);
    }
}

function _enqueueWingmanComms(title, text) {
    // De-dup identical messages already pending so a frame full of duplicate
    // events (every wingman becomes stranded simultaneously) only shows one.
    if (_wingmanCommsQueue.some(m => m.title === title && m.text === text)) return;
    _wingmanCommsQueue.push({ title, text });
    if (!_wingmanCommsTimer) _drainWingmanComms();
}

function _wingmanTacticalMessage(ud, kind) {
    if (!ud) return;
    const now = Date.now();
    if (!ud._lastTacticalMsg) ud._lastTacticalMsg = {};
    if (now - (ud._lastTacticalMsg[kind] || 0) < 8000) return; // 8s per-kind throttle
    ud._lastTacticalMsg[kind] = now;
    const lines = WINGMAN_TACTICAL_LINES[kind];
    if (!lines || !lines.length) return;
    const text = lines[Math.floor(Math.random() * lines.length)];
    _enqueueWingmanComms(ud.name + ' (Comms)', text);
}

// ── Large multi-stage explosion when a wingman is destroyed ─────────────
function createWingmanExplosion(ally) {
    if (!ally || !ally.position || typeof scene === 'undefined') return;
    const center = ally.position.clone();
    const baseColor = ally.userData && ally.userData.name === 'Wingman Alpha' ? 0x00ff88 : 0x88aaff;

    // Hide the ship mesh — it's gone
    ally.visible = false;

    // Wingman deaths get a unique two-stage signature so the player
    // notices immediately and from a distance:
    //   1) An "implosion flash" — a small white-hot core that briefly
    //      contracts (scales from 1.4 -> 0.4) before the main blast.
    //   2) Eight radiating energy beams in the wingman's faction colour,
    //      shooting out from the center as the fireball blooms.
    // Plus the classic fireball + shockwave + drifting particles below.

    // 1) Implosion flash
    const implGeo = new THREE.SphereGeometry(80, 16, 12);
    const implMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1.0,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const impl = new THREE.Mesh(implGeo, implMat);
    impl.position.copy(center);
    impl.renderOrder = 61;
    scene.add(impl);

    // 2) Eight radiating energy beams (cylinders pointing outward).
    // Stored on a group so we can scale/fade them together.
    const beamGroup = new THREE.Group();
    beamGroup.position.copy(center);
    const beams = [];
    for (let i = 0; i < 8; i++) {
        const beamGeo = new THREE.CylinderGeometry(2, 6, 200, 6);
        const beamMat = new THREE.MeshBasicMaterial({
            color: baseColor, transparent: true, opacity: 0.0,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        // Move pivot to base so the beam extends outward along +Y when scaled
        beam.position.set(0, 100, 0);
        const pivot = new THREE.Group();
        pivot.add(beam);
        // Distribute around the sphere using Fibonacci-ish polar coords
        const polar = Math.acos(1 - 2 * (i + 0.5) / 8);
        const az    = Math.PI * (3 - Math.sqrt(5)) * i;
        pivot.rotation.x = polar - Math.PI / 2;
        pivot.rotation.y = az;
        beamGroup.add(pivot);
        beams.push({ pivot, mesh: beam, mat: beamMat });
    }
    beamGroup.renderOrder = 62;
    scene.add(beamGroup);

    // 3) Large fireball
    const fireballGeo = new THREE.SphereGeometry(60, 20, 16);
    const fireballMat = new THREE.MeshBasicMaterial({
        color: 0xffcc44, transparent: true, opacity: 1.0,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const fireball = new THREE.Mesh(fireballGeo, fireballMat);
    fireball.position.copy(center);
    fireball.renderOrder = 60;
    scene.add(fireball);

    // 4) Faction-colored shockwave ring
    const shockGeo = new THREE.RingGeometry(20, 40, 32);
    const shockMat = new THREE.MeshBasicMaterial({
        color: baseColor, transparent: true, opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const shock = new THREE.Mesh(shockGeo, shockMat);
    shock.position.copy(center);
    if (typeof camera !== 'undefined') shock.lookAt(camera.position);
    shock.renderOrder = 60;
    scene.add(shock);

    // 5) Particle burst (count bumped from 80 to 140)
    const partCount = 140;
    const partGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(partCount * 3);
    const velocities = [];
    for (let i = 0; i < partCount; i++) {
        positions[i*3] = 0; positions[i*3+1] = 0; positions[i*3+2] = 0;
        velocities.push(new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4
        ));
    }
    partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const partMat = new THREE.PointsMaterial({
        color: 0xffaa44, size: 4, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const particles = new THREE.Points(partGeo, partMat);
    particles.position.copy(center);
    scene.add(particles);

    // Animate over 1.8s — longer than before to give the implosion +
    // beams + fireball + drift time to read distinctly.
    const start = Date.now();
    const duration = 1800;
    const step = () => {
        const elapsed = Date.now() - start;
        const t = Math.min(1, elapsed / duration);

        // Implosion flash: scales DOWN over the first 250ms, white-hot,
        // then disappears. Reads as the wingman's ship being yanked
        // inward right before the burst.
        const implPhase = Math.min(1, elapsed / 250);
        const implScale = 1.4 - implPhase * 1.0;       // 1.4 -> 0.4
        impl.scale.set(implScale, implScale, implScale);
        impl.material.opacity = Math.max(0, 1 - implPhase);

        // Energy beams: extend over the first 700ms (held visible),
        // then fade. They scale along +Y, the cylinder's long axis.
        const beamPhase = Math.min(1, elapsed / 700);
        const beamScale = 0.2 + beamPhase * 1.6;       // grows to 1.8x length
        for (let i = 0; i < beams.length; i++) {
            beams[i].mesh.scale.set(1, beamScale, 1);
            // Fade in fast, fade out after the 700ms mark.
            const beamOp = elapsed < 700
                ? Math.min(1, elapsed / 100)
                : Math.max(0, 1 - (elapsed - 700) / 700);
            beams[i].mat.opacity = beamOp;
        }

        // Fireball: expand fast then fade
        const fbScale = 1 + t * 3;
        fireball.scale.set(fbScale, fbScale, fbScale);
        fireball.material.opacity = Math.max(0, 1 - t * 1.2);

        // Shockwave: expand wider, fade
        const sScale = 1 + t * 8;
        shock.scale.set(sScale, sScale, sScale);
        shock.material.opacity = Math.max(0, 0.9 - t);

        // Particles drift outward
        const arr = partGeo.attributes.position.array;
        for (let i = 0; i < partCount; i++) {
            arr[i*3]   += velocities[i].x;
            arr[i*3+1] += velocities[i].y;
            arr[i*3+2] += velocities[i].z;
        }
        partGeo.attributes.position.needsUpdate = true;
        partMat.opacity = Math.max(0, 1 - t);

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            scene.remove(impl); impl.geometry.dispose(); impl.material.dispose();
            scene.remove(beamGroup);
            for (let i = 0; i < beams.length; i++) {
                beams[i].mesh.geometry.dispose();
                beams[i].mat.dispose();
            }
            scene.remove(fireball); fireball.geometry.dispose(); fireball.material.dispose();
            scene.remove(shock); shock.geometry.dispose(); shock.material.dispose();
            scene.remove(particles); particles.geometry.dispose(); particles.material.dispose();
        }
    };
    requestAnimationFrame(step);

    // Layered wingman-death audio: two booms + a damage tone (distinct
    // from the player's death stack, but unmistakable as "we lost one").
    if (typeof playSound === 'function') {
        try { playSound('explosion'); } catch (e) {}
        try { playSound('damage');    } catch (e) {}
        setTimeout(() => { try { playSound('explosion'); } catch (e) {} }, 260);
    }
}

// ── Update or create a shield bubble around an ally ──────────────────────
function _updateAllyShield(ally, active) {
    if (typeof THREE === 'undefined') return;
    const ud = ally.userData;
    // Brief red flash when the wingman is hit — even when they're not
    // engaging — matches the player's shield reaction. The flash flag
    // is set by flashEnemyHit; we lazy-create the mesh just for the
    // flash window if no engagement shield is currently up.
    const flashing = ud._shieldFlashUntil && Date.now() < ud._shieldFlashUntil;
    if (!active && !flashing) {
        if (ud.shieldMesh) {
            ally.remove(ud.shieldMesh);
            ud.shieldMesh.geometry.dispose();
            ud.shieldMesh.material.dispose();
            ud.shieldMesh = null;
        }
        return;
    }
    if (!ud.shieldMesh) {
        const color = ud.name === 'Wingman Alpha' ? 0x00ff88 : 0x88aaff;
        const geo = new THREE.SphereGeometry(30, 16, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.18,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            depthWrite: false, wireframe: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 49;
        ally.add(mesh);
        ud.shieldMesh = mesh;
        ud._shieldBaseColor = color;
    }
    const mat = ud.shieldMesh.material;
    if (flashing) {
        mat.color.setHex(0xff2200);
        mat.opacity = 0.6;
    } else {
        if (ud._shieldBaseColor) mat.color.setHex(ud._shieldBaseColor);
        mat.opacity = 0.15 + 0.08 * Math.sin(Date.now() * 0.005);
    }
}

// ── Player warp detection ────────────────────────────────────────────────
// Returns true during dedicated warp events OR whenever the player is
// cruising at 4 units/frame (4000 km/s) or faster — wingmen need to drop
// patrol behavior and lock onto the player's vector to keep up.
// ── FTL anchor: rejoin a wingman to the player after a long warp ────────
// Teleports the wingman to a flanking position near the player and zeros
// their velocity. Plays a brief warp-in flash so the rejoin reads as
// intentional FTL micro-jump, not a glitch. Used when warp ends and a
// wingman is still hopelessly far behind despite full speed-matching.
function _ftlAnchorWingman(ally, playerPos) {
    if (!ally || !playerPos) return;
    // Flank offset so multiple anchored wingmen don't stack on top of each
    // other or the player.
    const idx = (typeof allyShips !== 'undefined') ? allyShips.indexOf(ally) : 0;
    const ang = idx * (Math.PI * 2 / 5);
    const r = 220 + (idx % 3) * 60;
    const offset = new THREE.Vector3(Math.cos(ang) * r, (idx % 2 === 0 ? 30 : -30), Math.sin(ang) * r);
    ally.position.copy(playerPos).add(offset);
    if (ally.userData) {
        ally.userData.velocity = new THREE.Vector3();
        ally.userData.aiState = 'patrol';
        ally.userData.patrolTarget = null;
    }
    _wingmanTacticalMessage(ally.userData, 'tether');

    // Brief warp-in flash so the rejoin reads as an intentional FTL jump
    if (typeof THREE !== 'undefined' && typeof scene !== 'undefined') {
        const c = (ally.userData && ally.userData.colorStr) || '#88ccff';
        const flashGeo = new THREE.SphereGeometry(80, 12, 8);
        const flashMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(c), transparent: true, opacity: 0.85,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const flash = new THREE.Mesh(flashGeo, flashMat);
        flash.position.copy(ally.position);
        scene.add(flash);
        let t = 0;
        const animate = () => {
            t += 1;
            flash.scale.multiplyScalar(0.92);
            flash.material.opacity *= 0.88;
            if (t < 24) requestAnimationFrame(animate);
            else { scene.remove(flash); flash.geometry.dispose(); flash.material.dispose(); }
        };
        requestAnimationFrame(animate);
    }
}

function _isPlayerWarping() {
    if (typeof gameState === 'undefined') return false;
    if (gameState.slingshot && gameState.slingshot.active) return true;
    if (gameState.emergencyWarp && (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning)) return true;
    if (gameState.blackHoleWarp && gameState.blackHoleWarp.active) return true;
    if (gameState.velocityVector && gameState.velocityVector.length() >= 4.0) return true;
    return false;
}

// ── Follow: player is warping or flying fast — match velocity, fly ahead ─
// Each wingman gets a unique position in the formation: staggered forward
// distance, alternating Y-height offsets, and left/right lateral spread so
// the squadron reads as a natural V-shape from the player's POV instead of
// a jittering cluster all at the same depth.
function _executeFollow(ally, ud, playerPos) {
    if (!gameState || !gameState.velocityVector) return;
    const playerVel = gameState.velocityVector.clone();
    const playerSpeed = playerVel.length();

    let aheadDir;
    if (playerSpeed > 0.1) {
        aheadDir = playerVel.clone().normalize();
    } else if (typeof camera !== 'undefined') {
        aheadDir = new THREE.Vector3();
        camera.getWorldDirection(aheadDir);
    } else {
        aheadDir = new THREE.Vector3(0, 0, -1);
    }
    const right = new THREE.Vector3().crossVectors(aheadDir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, aheadDir).normalize();

    const idx = (typeof allyShips !== 'undefined') ? allyShips.indexOf(ally) : 0;

    // Staggered forward distance — first wingman closest (200u), each
    // subsequent wingman 60u further back, so they fan out in depth
    const forwardDist = 200 + idx * 60;

    // Alternating lateral offset (left / right, growing wider with rank)
    const side = ((idx % 2 === 0) ? -1 : 1) * (50 + Math.floor(idx / 2) * 40);

    // Per-wingman Y-height variation so they're not on the same plane.
    // Small consistent offset per index + a gentle sine wobble keyed to
    // time and index, so the formation breathes a little but never jitters.
    const baseY = ((idx % 3) - 1) * 35; // -35, 0, +35 cycling
    const wobbleY = Math.sin(Date.now() * 0.0006 + idx * 1.8) * 12;
    const heightOffset = baseY + wobbleY;

    const target = playerPos.clone()
        .addScaledVector(aheadDir, forwardDist)
        .addScaledVector(right, side)
        .addScaledVector(up, heightOffset);

    // Match the player's speed (or +20% so we keep the lead). No upper cap —
    // wingmen need to track up to 15+ units/frame (15000 km/s) when the
    // player is sustained-cruising or warping, well past the patrol cap.
    const targetSpeed = Math.max(playerSpeed * 1.2, ud.cruiseSpeed);
    _allyDir.subVectors(target, ally.position);
    const dist = _allyDir.length();
    if (dist > 1) {
        _allyDir.normalize();
        // Stronger lerp factor so they accelerate hard when far behind —
        // the 0.18 was too slow to close gaps at warp speeds.
        const lerpRate = playerSpeed > 6 ? 0.32 : 0.18;
        ud.velocity.lerp(_allyDir.clone().multiplyScalar(targetSpeed), lerpRate);
    }
    ally.position.add(ud.velocity);
}

// ── Stranded: separated from player. Orbit local planets here ────────────
function _executeStranded(ally, ud, now) {
    // Pick a local planet to orbit (at the wingman's current location, not Sol)
    if (!ud.patrolTarget || (ud.patrolArriveTime && now - ud.patrolArriveTime > 6000)) {
        ud.patrolTarget = _pickStrandedWaypoint(ally.position);
        ud.patrolArriveTime = 0;
    }

    _allyDir.subVectors(ud.patrolTarget, ally.position);
    const dist = _allyDir.length();
    if (dist < 200) {
        if (!ud.patrolArriveTime) ud.patrolArriveTime = now;
        ud.velocity.multiplyScalar(0.92);
    } else {
        _allyDir.normalize();
        const targetSpeed = Math.min(ud.cruiseSpeed, dist * 0.02);
        ud.velocity.lerp(_allyDir.clone().multiplyScalar(targetSpeed), 0.04);
    }
    ally.position.add(ud.velocity);
}

// Pick the nearest non-asteroid planet to a position (for stranded wingmen)
function _pickStrandedWaypoint(fromPos) {
    if (typeof planets === 'undefined') {
        return new THREE.Vector3(fromPos.x + 500, fromPos.y, fromPos.z + 500);
    }
    let best = null, bestDist = 8000;
    for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        if (!p || !p.userData) continue;
        if (p.userData.type === 'asteroid' || p.userData.type === 'asteroidBelt') continue;
        if (p.userData.type === 'blackhole') continue;
        const d = fromPos.distanceTo(p.position);
        if (d < bestDist && d > 100) { best = p; bestDist = d; }
    }
    if (best) {
        // Orbit at radius around the planet
        const angle = Math.random() * Math.PI * 2;
        const r = 250 + Math.random() * 150;
        return new THREE.Vector3(
            best.position.x + Math.cos(angle) * r,
            best.position.y + (Math.random() - 0.5) * 40,
            best.position.z + Math.sin(angle) * r
        );
    }
    return new THREE.Vector3(fromPos.x + 400, fromPos.y, fromPos.z + 400);
}

// ── Return: head back toward system center ───────────────────────────────
function _executeReturn(ally, ud) {
    const center = new THREE.Vector3(0, 0, 0);
    _allyDir.subVectors(center, ally.position).normalize();
    ud.velocity.lerp(_allyDir.clone().multiplyScalar(ud.cruiseSpeed * 1.5), 0.06);
    ally.position.add(ud.velocity);
}

// ── Celebrate: tight victory orbit around the player ─────────────────────
// Each wingman spirals into its assigned ring slot around the player
// and circles fast. The per-wingman phase/radius/height (set on entry
// to the state) keeps them spaced into a proper encircling formation
// rather than dogpiling one point.
function _executeCelebrate(ally, ud, now, playerPos) {
    const t = now * 0.004; // orbital speed
    const phase = ud._celebPhase || 0;
    const r = ud._celebRadius || 150;
    const h = ud._celebHeight || 0;
    const target = new THREE.Vector3(
        playerPos.x + Math.cos(t + phase) * r,
        playerPos.y + h + Math.sin(t * 1.5 + phase) * 25,
        playerPos.z + Math.sin(t + phase) * r
    );
    _allyDir.subVectors(target, ally.position);
    const dist = _allyDir.length();
    _allyDir.normalize();
    // Snappy chase so the ring forms quickly and circles with energy.
    const spd = Math.min((ud.combatSpeed || ud.cruiseSpeed || 4) * 1.4, Math.max(2, dist * 0.06));
    ud.velocity.lerp(_allyDir.clone().multiplyScalar(spd), 0.14);
    ally.position.add(ud.velocity);
}

function isAllyShip(obj) {
    return obj && obj.userData && obj.userData.isAlly;
}

if (typeof window !== 'undefined') {
    window.allyShips = allyShips;
    window.createAllyShips = createAllyShips;
    window.updateAllyShips = updateAllyShips;
    window.isAllyShip = isAllyShip;
    window.createWingmanExplosion = createWingmanExplosion;
    window.recruitNebulaWingman = recruitNebulaWingman;
}
