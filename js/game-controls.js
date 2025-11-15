// Game Controls - Input handling, weapon systems, enemy behavior, sound, bosses, and tutorial
// ENHANCED: Advanced Combat System with Directional Damage, Enhanced Enemy AI, and Progressive Difficulty
// CLEANED: Removed stub functions, duplicate gameState, competing initialization
// RESTORED: Working audio system, UI buttons, mouse crosshair, tutorial from game-controls13.js

// Global key state
const keys = {
  w: false, a: false, s: false, d: false,
  q: false, e: false, o: false,
  shift: false, alt: false, space: false,
  up: false, down: false, left: false, right: false,
  x: false, b: false, z: false
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
// ENHANCED ENEMY AI BEHAVIORS
// =============================================================================

// UPDATED: Pursuit behavior
function updatePursuitBehavior(enemy, playerPos, speed, distance) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }
    
    try {
        if (distance > 100) {
            // Direct pursuit when far
            const direction = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize();
            enemy.position.add(direction.multiplyScalar(speed));
        } else {
            // Circle strafe when close
            const angle = Date.now() * 0.001 + (enemy.userData.circlePhase || 0);
            const targetX = playerPos.x + Math.cos(angle) * 80;
            const targetZ = playerPos.z + Math.sin(angle) * 80;
            const targetY = playerPos.y + Math.sin(angle * 0.5) * 20;
            
            const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
            const direction = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
            enemy.position.add(direction.multiplyScalar(speed * 0.8));
        }
    } catch (e) {
        // Ignore movement errors if positions are invalid
    }
}

// NEW: Swarm behavior
function updateSwarmBehavior(enemy, playerPos, speed, time) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }
    
    try {
        // Spiraling approach from multiple angles
        const swarmAngle = time * 0.5 + (enemy.userData.circlePhase || 0);
        const spiralRadius = 120 + Math.sin(time * 0.3) * 40;
        
        const targetX = playerPos.x + Math.cos(swarmAngle) * spiralRadius;
        const targetZ = playerPos.z + Math.sin(swarmAngle) * spiralRadius;
        const targetY = playerPos.y + Math.sin(time * 0.2) * 30;
        
        const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
        const direction = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
        enemy.position.add(direction.multiplyScalar(speed * 0.9));
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
        // Move perpendicular to player direction
        const direction = new THREE.Vector3().subVectors(enemy.position, playerPos).normalize();
        const perpendicular = new THREE.Vector3(-direction.z, direction.y, direction.x);
        
        // Add some randomness and oscillation
        const oscillation = Math.sin(time * 2 + (enemy.userData.circlePhase || 0)) * 0.5;
        const evasionVector = perpendicular.multiplyScalar(speed * (1 + oscillation));
        
        enemy.position.add(evasionVector);
    } catch (e) {
        // Ignore movement errors
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
        
        const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
        const direction = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
        enemy.position.add(direction.multiplyScalar(speed * 0.7));
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
        // Maintain optimal attack distance
        const optimalDistance = 100;
        const currentDistance = enemy.position.distanceTo(playerPos);
        
        if (currentDistance > optimalDistance + 20) {
            // Move closer
            const direction = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize();
            enemy.position.add(direction.multiplyScalar(speed));
        } else if (currentDistance < optimalDistance - 20) {
            // Move away
            const direction = new THREE.Vector3().subVectors(enemy.position, playerPos).normalize();
            enemy.position.add(direction.multiplyScalar(speed * 0.5));
        } else {
            // Maintain position with slight movement
            const angle = time * 0.5;
            const offset = new THREE.Vector3(Math.cos(angle) * 10, 0, Math.sin(angle) * 10);
            enemy.position.add(offset.multiplyScalar(speed * 0.3));
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
        
        const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
        const direction = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
        
        enemy.position.add(direction.multiplyScalar(speed * 0.3));
    } catch (e) {
        // Ignore movement errors
    }
}

// =============================================================================
// PROGRESSIVE DIFFICULTY SYSTEM
// =============================================================================

function calculateDifficultySettings() {
    const galaxiesCleared = (typeof gameState !== 'undefined' && gameState.galaxiesCleared) ? gameState.galaxiesCleared : 0;
    
    const baseSettings = {
        // Local galaxy settings (progressive difficulty) - MAX 3 HITS
        maxLocalAttackers: Math.min(3 + galaxiesCleared, 8), // Start with 3, +1 per galaxy cleared, max 8
        localSpeedMultiplier: 0.5 + (galaxiesCleared * 0.1), // Start slow, get faster
        localHealthMultiplier: galaxiesCleared === 0 ? 1 : Math.min(1 + galaxiesCleared * 0.25, 3), // MAX 3 hits
        localDetectionRange: 2000 + (galaxiesCleared * 200), // Larger detection as difficulty increases
        localFiringRange: 200 + (galaxiesCleared * 25),
        localAttackCooldown: Math.max(1000, 2000 - (galaxiesCleared * 100)), // Faster attacks as difficulty increases
        
        // Distant galaxy settings (always challenging) - MAX 3 HITS
        maxDistantAttackers: Math.min(5 + galaxiesCleared, 10),
        distantSpeedMultiplier: 0.8 + (galaxiesCleared * 0.05),
        distantHealthMultiplier: Math.min(2 + galaxiesCleared * 0.125, 3), // MAX 3 hits
        distantDetectionRange: 3000 + (galaxiesCleared * 150),
        distantFiringRange: 300 + (galaxiesCleared * 20),
        distantAttackCooldown: Math.max(800, 1200 - (galaxiesCleared * 50)),
        
        // General settings
        galaxiesCleared: galaxiesCleared,
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

const nearbyEnemies = enemies.filter(enemy => 
    enemy.userData.health > 0 && 
    camera.position.distanceTo(enemy.position) < 3000  // Only process nearby enemies
).sort((a, b) => {
    // Prioritize: 1) Bosses, 2) Active enemies, 3) Closest enemies
    if (a.userData.isBoss && !b.userData.isBoss) return -1;
    if (!a.userData.isBoss && b.userData.isBoss) return 1;
    if (a.userData.isActive && !b.userData.isActive) return -1;
    if (!a.userData.isActive && b.userData.isActive) return 1;
    return camera.position.distanceTo(a.position) - camera.position.distanceTo(b.position);
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
                enemy.position.add(direction.multiplyScalar((enemy.userData.speed || 0.5) * 0.1));
            }
        });
        return; // Exit early - don't process combat logic during tutorial
    }
    
    // TUTORIAL COMPLETE: Normal enemy behavior now active
    if (typeof tutorialSystem !== 'undefined' && tutorialSystem.completed) {
        // Log once when tutorial is complete and enemies should activate
        const now = Date.now();
        if (!tutorialSystem.enemiesActivatedLogTime || (now - tutorialSystem.enemiesActivatedLogTime) > 5000) {
            console.log('Tutorial completed - enemies now processing full AI behavior');
            tutorialSystem.enemiesActivatedLogTime = now;
        }
    }
    
    // PROGRESSIVE DIFFICULTY: Calculate based on galaxies cleared
    const galaxiesCleared = gameState.galaxiesCleared || 0;
    const difficultySettings = calculateDifficultySettings(galaxiesCleared);
    
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
    
    enemies.forEach(enemy => {
        if (enemy.userData.health <= 0) return;
        
        const distanceToPlayer = camera.position.distanceTo(enemy.position);
        const isLocal = isEnemyInLocalGalaxy(enemy);
        
        // ENHANCED: Larger detection ranges
        const detectionRange = isLocal ? 
            (difficultySettings.localDetectionRange || 2000) : 
            (enemy.userData.detectionRange || difficultySettings.distantDetectionRange || 3000);
        const firingRange = isLocal ? 
            (difficultySettings.localFiringRange || 200) : 
            (enemy.userData.firingRange || difficultySettings.distantFiringRange || 300);
        
        // Count nearby enemies
        if (distanceToPlayer < detectionRange) {
            nearbyEnemyCount++;
            if (distanceToPlayer < firingRange * 2) {
                inCombatRange = true;
            }
        }
        
        // PROGRESSIVE DIFFICULTY: Apply attacker limits
        const maxAttackers = isLocal ? difficultySettings.maxLocalAttackers : difficultySettings.maxDistantAttackers;
        const currentAttackers = isLocal ? localActiveAttackers : activeAttackers;
        
        if (distanceToPlayer < detectionRange && !enemy.userData.isActive && currentAttackers < maxAttackers) {
            enemy.userData.isActive = true;
            enemy.userData.detectedPlayer = true;
            enemy.userData.lastSeenPlayerPos = camera.position.clone();
            
            if (isLocal) localActiveAttackers++;
            else activeAttackers++;
            
            console.log(`Enemy activated: ${enemy.userData.name} (${isLocal ? 'local' : 'distant'}) - Active attackers: ${currentAttackers + 1}/${maxAttackers}`);
        } else if (enemy.userData.isActive && (distanceToPlayer > detectionRange * 1.5 || currentAttackers > maxAttackers)) {
            enemy.userData.isActive = false;
            enemy.userData.detectedPlayer = false;
            if (isLocal) localActiveAttackers--;
            else activeAttackers--;
        }
        
        if (enemy.userData.isActive) {
            // Apply difficulty-based speed modifiers
            const baseSpeed = enemy.userData.speed || 0.5;
            const adjustedSpeed = baseSpeed * (isLocal ? difficultySettings.localSpeedMultiplier : difficultySettings.distantSpeedMultiplier);
            
            if (isLocal) {
                updateLocalEnemyBehavior(enemy, distanceToPlayer, adjustedSpeed, difficultySettings);
            } else {
                if (enemy.userData.isBoss) {
                    updateBossBehavior(enemy, camera.position, adjustedSpeed);
                } else if (enemy.userData.isBossSupport) {
                    updateSupportBehavior(enemy, camera.position, adjustedSpeed);
                } else {
                    updateEnhancedEnemyBehavior(enemy, distanceToPlayer, adjustedSpeed, difficultySettings);
                }
            }
            
            // Enhanced enemy firing with progressive difficulty
            if (distanceToPlayer < firingRange) {
                const now = Date.now();
                const attackCooldown = isLocal ? 
                    (difficultySettings.localAttackCooldown || 2000) : 
                    (enemy.userData.isBoss ? 600 : difficultySettings.distantAttackCooldown || 1200);
                
                if (now - (enemy.userData.lastAttack || 0) > attackCooldown) {
                    fireEnemyWeapon(enemy, difficultySettings);
                    enemy.userData.lastAttack = now;
                }
            }
        } else {
            // Patrol behavior when not active
            updatePatrolBehavior(enemy, camera.position, 0.2, Date.now() * 0.001);
        }
        
    });
    
    // Update combat status for UI
    if (gameState.inCombat !== undefined) {
        gameState.inCombat = inCombatRange;
    }
}

// UPDATED: Local enemy behavior with enhanced AI
function updateLocalEnemyBehavior(enemy, distanceToPlayer, adjustedSpeed, difficultySettings) {
    // Safety checks
    if (!enemy || !enemy.userData || typeof camera === 'undefined' || typeof THREE === 'undefined') {
        return;
    }
    
    const time = Date.now() * 0.001;
    const playerPos = camera.position.clone();
    
    // Update last seen player position if player is visible
    if (distanceToPlayer < difficultySettings.localDetectionRange) {
        enemy.userData.lastSeenPlayerPos = playerPos.clone();
        enemy.userData.lastSeenTime = time;
    }
    
    // Ensure attack mode is set
    if (!enemy.userData.attackMode) {
        enemy.userData.attackMode = 'pursue';
    }
    
    switch (enemy.userData.attackMode) {
        case 'pursue':
            updatePursuitBehavior(enemy, playerPos, adjustedSpeed, distanceToPlayer);
            break;
        case 'swarm':
            updateSwarmBehavior(enemy, playerPos, adjustedSpeed, time);
            break;
        case 'evade':
            updateEvasionBehavior(enemy, playerPos, adjustedSpeed, time);
            break;
        case 'flank':
            updateFlankingBehavior(enemy, playerPos, adjustedSpeed, time);
            break;
        case 'engage':
            updateEngagementBehavior(enemy, playerPos, adjustedSpeed, time);
            break;
        default:
            updatePursuitBehavior(enemy, playerPos, adjustedSpeed, distanceToPlayer);
    }
    
    // Random behavior changes for dynamic combat
    if (Math.random() < 0.001) { // 0.1% chance per frame
        const behaviors = ['pursue', 'swarm', 'evade', 'flank', 'engage'];
        enemy.userData.attackMode = behaviors[Math.floor(Math.random() * behaviors.length)];
    }
    
    try {
        enemy.lookAt(playerPos);
    } catch (e) {
        // Ignore lookAt errors if position is invalid
    }
}

// ENHANCED: Enhanced enemy behavior for distant galaxies
function updateEnhancedEnemyBehavior(enemy, distanceToPlayer, adjustedSpeed, difficultySettings) {
    // Safety checks
    if (!enemy || !enemy.userData || typeof camera === 'undefined' || typeof THREE === 'undefined') {
        return;
    }
    
    const time = Date.now() * 0.001;
    const playerPos = camera.position.clone();
    
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
    
    try {
        enemy.lookAt(playerPos);
    } catch (e) {
        // Ignore lookAt errors
    }
}

// Boss behavior
function updateBossBehavior(enemy, playerPos, speed) {
    // Bosses use more complex movement patterns
    const time = Date.now() * 0.001;
    const distance = enemy.position.distanceTo(playerPos);
    
    if (distance > 150) {
        // Approach with weaving pattern
        const direction = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize();
        const weave = new THREE.Vector3(Math.sin(time * 2) * 20, Math.cos(time * 1.5) * 15, 0);
        direction.add(weave.multiplyScalar(0.1));
        enemy.position.add(direction.multiplyScalar(speed));
    } else {
        // Circle strafe at optimal distance
        const angle = time * 0.8;
        const targetX = playerPos.x + Math.cos(angle) * 120;
        const targetZ = playerPos.z + Math.sin(angle) * 120;
        const targetY = playerPos.y + Math.sin(angle * 0.3) * 30;
        
        const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
        const direction = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
        enemy.position.add(direction.multiplyScalar(speed * 0.6));
    }
}

// Support ship behavior
function updateSupportBehavior(enemy, playerPos, speed) {
    // Support ships try to stay at medium range
    const distance = enemy.position.distanceTo(playerPos);
    const optimalDistance = 180;
    
    if (distance > optimalDistance + 30) {
        const direction = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize();
        enemy.position.add(direction.multiplyScalar(speed * 0.8));
    } else if (distance < optimalDistance - 30) {
        const direction = new THREE.Vector3().subVectors(enemy.position, playerPos).normalize();
        enemy.position.add(direction.multiplyScalar(speed * 0.6));
    }
}

// Enhanced enemy weapon firing with directional damage and progressive difficulty
function fireEnemyWeapon(enemy, difficultySettings) {
    if (!enemy || !enemy.userData || enemy.userData.health <= 0) return;
    
    const isLocal = isEnemyInLocalGalaxy(enemy);
    const firingRange = isLocal ? difficultySettings.localFiringRange : difficultySettings.distantFiringRange;
    const distanceToPlayer = camera.position.distanceTo(enemy.position);
    
    if (distanceToPlayer <= firingRange) {
        // Create enemy laser beam (RESTORED from game-controls13.js)
        const laserColor = enemy.userData.isBoss ? '#ff4444' : '#ff8800';
        createLaserBeam(enemy.position, camera.position, laserColor, false);
        
        playSound('enemy_fire');
        
        // Enhanced damage calculation with progressive difficulty
        let damage = isLocal ? 
            (difficultySettings.galaxiesCleared === 0 ? 4 : 6 + difficultySettings.galaxiesCleared) : 
            (enemy.userData.isBoss ? 12 : enemy.userData.isBossSupport ? 8 : 6);
        
        // Cap damage to reasonable levels
        damage = Math.min(damage, 15);
        
        // Random chance to hit (makes combat more dynamic)
if (Math.random() < 0.7) { // 70% hit chance
    // Check black hole warp invulnerability
    const isInvulnerable = typeof isBlackHoleWarpInvulnerable === 'function' &&
                           isBlackHoleWarpInvulnerable();

    if (!isInvulnerable) {
        // Apply damage with shield reduction
        const shieldReduction = typeof getShieldDamageReduction === 'function' ?
                                getShieldDamageReduction() : 0;
        const actualDamage = damage * (1 - shieldReduction);

        if (typeof gameState !== 'undefined' && gameState.hull !== undefined) {
            gameState.hull = Math.max(0, gameState.hull - actualDamage);
        } else if (typeof gameState !== 'undefined' && gameState.health !== undefined) {
            gameState.health = Math.max(0, gameState.health - actualDamage);
        }
    }
    
    // Create shield hit effect if shields are active
    const shieldsActive = typeof isShieldActive === 'function' && isShieldActive();
    if (shieldsActive && typeof createShieldHitEffect === 'function') {
        createShieldHitEffect(enemy.position);
    }
    
    // ENHANCED: Directional damage effects with attacker position
    createEnhancedScreenDamageEffect(enemy.position);
    
    // ONLY play damage sound if shields are NOT active
    if (!shieldsActive) {
        playSound('damage');
    }
    
    if (enemy.userData.isBoss) {
        showAchievement('Boss Attack!', `${enemy.userData.name} hit for ${damage} damage!`, false);
    } else {
        showAchievement('Taking Fire!', `Enemy hit for ${damage} damage!`, false);
    }
    
    // Check for game over
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
    const distanceFromOrigin = enemy.position.length();
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
            text: "Captain Bo, this is Mission Command. You are going to need to use planetary gravitational forces in order to get out of this galaxy and into Interstellar space.",
            delay: 5000
        },
        {
            title: "Navigation Training",
            text: "Fly close to a planet and hit the Enter/Return key to engage the Gravitational Slingshot. Use WASD to thrust and arrow keys to look around.",
            delay: 15000
        },
        {
    		title: "Combat Systems",
    		text: "Your ship is equipped with energy weapons and hull repair systems. Destroying enemies will restore hull integrity. Press Tab to toggle shields (drains energy). Watch your energy levels during combat.",
    		delay: 25000
		},
        {
            title: "Primary Objective",
            text: "We need you to eliminate all the hostile forces in each galaxy including Sagittarius A. Use your weapons with left click or Option key. Hold Space for target lock.",
            delay: 35000
        },
        {
            title: "Emergency Systems",
            text: "You have 5 Emergency Warp charges that can help boost you into Hyperspace, but they alone are not enough to get you to the next Galaxy. Press O to activate Emergency Warp.",
            delay: 45000
        },
        {
            title: "Final Orders",
            text: "Navigate to distant galaxies, clear them of hostiles, and defeat the boss flagships. Use the galactic map to track your progress. Good luck, Captain!",
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

function showMissionCommandAlert(title, text, isVictoryMessage = false) {
    const alertElement = document.getElementById('missionCommandAlert');
    const titleElement = alertElement ? alertElement.querySelector('h2') : null;
    const textElement = document.getElementById('missionCommandText');
    
    if (!alertElement || !titleElement || !textElement) {
        console.warn('Tutorial elements not found');
        return;
    }
    
    titleElement.textContent = title;
    textElement.textContent = text;
    alertElement.classList.remove('hidden');
    
    // Get or create button container
    const buttonContainer = alertElement.querySelector('.text-center');
    if (!buttonContainer) return;
    
    // Clear existing buttons
    const existingButtons = buttonContainer.querySelectorAll('button');
    existingButtons.forEach(btn => btn.remove());
    
    // Determine if this is a tutorial message
    const isTutorialActive = tutorialSystem && tutorialSystem.active && !tutorialSystem.completed;
    
    // Check if this is the final tutorial message
    const isFinalTutorialMessage = title === "Final Orders";
    
    if (isTutorialActive && !isVictoryMessage) {
    // Create SKIP TUTORIAL button for tutorial messages
    const skipButton = document.createElement('button');
    skipButton.id = 'missionCommandSkip';
    skipButton.className = 'mt-4 space-btn rounded px-6 py-2';
    skipButton.innerHTML = '<i class="fas fa-forward mr-2"></i>SKIP TUTORIAL';
    skipButton.style.cssText = `
        background: linear-gradient(135deg, rgba(255, 150, 0, 0.8), rgba(200, 100, 0, 0.8));
        border-color: rgba(255, 200, 0, 0.6);
        pointer-events: auto;
        touch-action: manipulation;
        -webkit-tap-highlight-color: rgba(255, 150, 0, 0.3);
        cursor: pointer;
    `;
    buttonContainer.appendChild(skipButton);
    
    // SKIP TUTORIAL button immediately completes tutorial
    const handleSkip = () => {
        alertElement.classList.add('hidden');
        
        // Skip ALL remaining tutorial messages
        if (tutorialSystem.active) {
            tutorialSystem.active = false;
            completeTutorial();
            showAchievement('Tutorial Skipped', 'All hostile forces are now active!');
        }
    };
    
    skipButton.onclick = handleSkip;
    skipButton.ontouchend = (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleSkip();
    };
} else {
    // Create UNDERSTOOD button for victory messages and non-tutorial messages
    const understoodButton = document.createElement('button');
    understoodButton.id = 'missionCommandUnderstood';
    understoodButton.className = 'mt-4 space-btn rounded px-6 py-2';
    understoodButton.innerHTML = '<i class="fas fa-check mr-2"></i>UNDERSTOOD';
    understoodButton.style.cssText = `
        background: linear-gradient(135deg, rgba(0, 150, 255, 0.8), rgba(0, 100, 200, 0.8));
        border-color: rgba(0, 200, 255, 0.6);
        pointer-events: auto;
        touch-action: manipulation;
        -webkit-tap-highlight-color: rgba(0, 150, 255, 0.3);
        cursor: pointer;
    `;
    buttonContainer.appendChild(understoodButton);
    
    // UNDERSTOOD button dismisses the message
    const handleUnderstood = () => {
        alertElement.classList.add('hidden');
    };
    
    understoodButton.onclick = handleUnderstood;
    understoodButton.ontouchend = (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleUnderstood();
    };
}
    
    // Only play sound if not suppressed
if (typeof gameState === 'undefined' || !gameState.suppressAchievements) {
        playSound('achievement');
}
}

// =============================================================================
// ENHANCED AUDIO SYSTEM - RESTORED from game-controls13.js (WORKING VERSION)
// =============================================================================

function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
        masterGain.gain.value = 0.3;
        
        // Create separate gains for music and effects (RESTORED VALUES)
        musicGain = audioContext.createGain();
        effectsGain = audioContext.createGain();
        musicGain.connect(masterGain);
        effectsGain.connect(masterGain);
        
        musicGain.gain.value = 0.4;
        effectsGain.gain.value = 0.6; // RESTORED: Higher effects volume
        
        console.log('Enhanced audio system initialized (waiting for user interaction)');
    } catch (e) {
        console.warn('Audio not supported');
    }
}

function resumeAudioContext() {
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

function toggleMusic() {
    musicSystem.enabled = !musicSystem.enabled;
    const muteIcon = document.getElementById('muteIcon');
    const muteBtn = document.getElementById('muteBtn');
    
    console.log('🔊 toggleMusic called, enabled:', musicSystem.enabled);
    
    if (musicSystem.enabled) {
        if (muteIcon) muteIcon.className = 'fas fa-volume-up text-cyan-400';
        if (muteBtn) muteBtn.classList.remove('muted');
        if (musicGain && audioContext) {
            musicGain.gain.setValueAtTime(0.4, audioContext.currentTime);
        }
        
        // Restart appropriate music
        if (musicSystem.inBattle) {
            createBattleMusic();
        } else {
            startBackgroundMusic();
        }
        console.log('🎵 Music unmuted');
    } else {
        if (muteIcon) muteIcon.className = 'fas fa-volume-mute text-red-400';
        if (muteBtn) muteBtn.classList.add('muted');
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
        console.log('🔇 Music muted');
    }
}

// RESTORED: Working sound parameters from game-controls13.js
function playSound(type, frequency = 440, duration = 0.2) {
    console.log('🔊 playSound called with type:', type); // ADD THIS LINE AT THE TOP
    
    if (!audioContext || audioContext.state === 'suspended') {
        console.warn('⚠️ Audio context not available or suspended:', audioContext?.state);
        return;
    }
    
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    oscillator.connect(gain);
    gain.connect(effectsGain);
    
    switch (type) {
        case 'weapon':
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
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
// VISUAL EFFECTS SYSTEM
// =============================================================================

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
    
    const explosionGeometry = new THREE.SphereGeometry(2, 8, 8);
    const explosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true
    });
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    scene.add(explosion);
    
     // Animate explosion (FASTER)
    let scale = 1;
    let opacity = 1;
    // CHANGE TO (MUCH SLOWER):
const explosionInterval = setInterval(() => {
    scale += 0.5;  // Changed from 2.0 to 0.5 (4x slower growth)
    opacity -= 0.05;  // Changed from 0.2 to 0.05 (4x slower fade)
    explosion.scale.set(scale, scale, scale);
    explosionMaterial.opacity = opacity;
    
    if (opacity <= 0) {
        clearInterval(explosionInterval);
        scene.remove(explosion);
        explosionGeometry.dispose();
        explosionMaterial.dispose();
    }
}, 60);  // Changed from 30ms to 60ms (slower updates)
    
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
    
    // Animate particles
    let particleLife = 1.0;
    const particleInterval = setInterval(() => {
    particleLife -= 0.02;  // Changed from 0.05 to 0.02 (slower fade)
    particleMaterial.opacity = particleLife;
    
    if (particleLife <= 0) {
        clearInterval(particleInterval);
        scene.remove(particleSystem);
        particles.dispose();
        particleMaterial.dispose();
    }
}, 80);  // Changed from 50ms to 80ms (slower updates)
    
    // Play explosion sound
    playSound('explosion');
}

// =============================================================================
// MASSIVE BORG CUBE EXPLOSION - For 100 HP BORG destruction
// =============================================================================

function createMassiveBorgExplosion(position) {
    console.log('💥 MASSIVE BORG EXPLOSION at', position);

    // Create HUGE expanding sphere explosion
    const explosionGeo = new THREE.SphereGeometry(100, 32, 32);
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
    const explosionGeo2 = new THREE.SphereGeometry(80, 32, 32);
    const explosionMat2 = new THREE.MeshBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    const explosion2 = new THREE.Mesh(explosionGeo2, explosionMat2);
    explosion2.position.copy(position);
    scene.add(explosion2);

    // MASSIVE particle burst (500 particles!)
    const particleCount = 500;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities = [];

    for (let i = 0; i < particleCount; i++) {
        particlePositions[i * 3] = position.x;
        particlePositions[i * 3 + 1] = position.y;
        particlePositions[i * 3 + 2] = position.z;

        // Random velocity in all directions
        particleVelocities.push({
            x: (Math.random() - 0.5) * 50,
            y: (Math.random() - 0.5) * 50,
            z: (Math.random() - 0.5) * 50
        });
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMaterial = new THREE.PointsMaterial({
        color: 0x00ff00,
        size: 15,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // Animate MASSIVE explosion
    let scale = 1;
    let opacity1 = 0.9;
    let opacity2 = 0.8;
    let particleOpacity = 1.0;

    const explosionInterval = setInterval(() => {
        scale += 3.0; // MUCH faster expansion
        opacity1 -= 0.03;
        opacity2 -= 0.025;
        particleOpacity -= 0.04;

        explosion.scale.set(scale, scale, scale);
        explosion2.scale.set(scale * 1.2, scale * 1.2, scale * 1.2);
        explosionMat.opacity = Math.max(0, opacity1);
        explosionMat2.opacity = Math.max(0, opacity2);
        particleMaterial.opacity = Math.max(0, particleOpacity);

        // Update particle positions
        const positions = particleGeometry.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] += particleVelocities[i].x;
            positions[i * 3 + 1] += particleVelocities[i].y;
            positions[i * 3 + 2] += particleVelocities[i].z;
        }
        particleGeometry.attributes.position.needsUpdate = true;

        if (opacity1 <= 0) {
            clearInterval(explosionInterval);
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
    }, 50);

    // Create shockwave rings
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
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

            let ringScale = 1;
            let ringOpacity = 0.7;
            const ringInterval = setInterval(() => {
                ringScale += 2;
                ringOpacity -= 0.05;
                ring.scale.set(ringScale, ringScale, ringScale);
                ringMat.opacity = Math.max(0, ringOpacity);

                if (ringOpacity <= 0) {
                    clearInterval(ringInterval);
                    scene.remove(ring);
                    ringGeo.dispose();
                    ringMat.dispose();
                }
            }, 50);
        }, i * 200);
    }
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

// RESTORED: Working laser beam from game-controls13.js (FIXES POSITIONING)
function createLaserBeam(startPos, endPos, color = '#00ff96', isPlayer = true) {
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
        
        // Better positioning and orientation (RESTORED)
        laserBeam.position.copy(startPos);
        
        const up = new THREE.Vector3(0, 1, 0);
        const axis = new THREE.Vector3().crossVectors(up, direction.normalize());
        const angle = Math.acos(up.dot(direction.normalize()));
        
        if (axis.length() > 0.001) {
            axis.normalize();
            laserBeam.setRotationFromAxisAngle(axis, angle);
        } else if (direction.y < 0) {
            laserBeam.rotateX(Math.PI);
        }
        
        const offset = direction.clone().multiplyScalar(0.5);
        laserBeam.position.add(offset);
        
        // Add glow effect
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
        
        // Longer-lasting laser beams
let opacity = 0.8;
const fadeInterval = setInterval(() => {
    opacity -= 0.05;  // Much slower fade (was 0.05)
    laserMaterial.opacity = opacity;
    glowMaterial.opacity = opacity * 0.4;
    
    if (opacity <= 0) {
        clearInterval(fadeInterval);
        scene.remove(laserBeam);
        laserGeometry.dispose();
        laserMaterial.dispose();
        glowGeometry.dispose();
        glowMaterial.dispose();
    }
}, 50);  // Slower update interval (was 50ms)
        
    } catch (error) {
        console.warn('Failed to create laser beam:', error);
    }
}

// =============================================================================
// ENHANCED VISUAL FEEDBACK: ENEMY HIT COLOR CHANGES
// =============================================================================

// FIXED: Enemy hit flash that works with MeshBasicMaterial (no emissive properties)
function flashEnemyHit(enemy, damage = 1) {
    if (!enemy || !enemy.material) return;
    
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
        damageOverlay.className = 'absolute inset-0 bg-red-500 pointer-events-none z-30';
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
    
    // Project attacker position to screen coordinates
    const attackerScreen = attackerPosition.clone().project(camera);
    
    // Convert to screen space (-1 to 1) to (0 to 1)
    const screenX = (attackerScreen.x * 0.5 + 0.5);
    const screenY = -(attackerScreen.y * 0.5 - 0.5);
    
    // Determine primary direction
    let direction = 'center';
    
    if (attackerScreen.z > 1) {
        // Attacker is behind us
        direction = 'behind';
    } else {
        // Determine side based on screen position
        if (screenX < 0.3) {
            direction = 'left';
        } else if (screenX > 0.7) {
            direction = 'right';
        } else if (screenY < 0.3) {
            direction = 'top';
        } else if (screenY > 0.7) {
            direction = 'bottom';
        } else {
            direction = 'front';
        }
    }
    
    return {
        primary: direction,
        screenX: screenX,
        screenY: screenY,
        isVisible: attackerScreen.z < 1
    };
}

function createDirectionalDamageEffect(attackDirection) {
    const direction = attackDirection.primary;
    let overlayStyle = '';
    let pulseStyle = '';
    
    // Create directional gradient based on attack direction
    switch (direction) {
        case 'left':
            overlayStyle = 'background: linear-gradient(to right, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0.3) 30%, transparent 60%);';
            pulseStyle = 'left: 0; width: 40%; height: 100%; top: 0;';
            break;
        case 'right':
            overlayStyle = 'background: linear-gradient(to left, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0.3) 30%, transparent 60%);';
            pulseStyle = 'right: 0; width: 40%; height: 100%; top: 0;';
            break;
        case 'top':
            overlayStyle = 'background: linear-gradient(to bottom, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0.3) 30%, transparent 60%);';
            pulseStyle = 'top: 0; width: 100%; height: 40%; left: 0;';
            break;
        case 'bottom':
            overlayStyle = 'background: linear-gradient(to top, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0.3) 30%, transparent 60%);';
            pulseStyle = 'bottom: 0; width: 100%; height: 40%; left: 0;';
            break;
        case 'behind':
            overlayStyle = 'background: radial-gradient(circle at center, transparent 0%, rgba(255,0,0,0.4) 40%, rgba(255,0,0,0.8) 100%);';
            pulseStyle = 'inset: 0; border: 8px solid rgba(255,0,0,0.6);';
            break;
        case 'front':
        default:
            overlayStyle = 'background: radial-gradient(circle at center, rgba(255,0,0,0.6) 0%, rgba(255,0,0,0.3) 50%, transparent 80%);';
            pulseStyle = 'inset: 20%; border-radius: 50%;';
            break;
    }
    
    // Create the directional damage overlay
    const damageOverlay = document.createElement('div');
    damageOverlay.className = 'absolute pointer-events-none z-30';
    damageOverlay.style.cssText = overlayStyle + pulseStyle + 'opacity: 0; transition: opacity 0.1s ease-out;';
    document.body.appendChild(damageOverlay);
    
    // Animate the effect
    setTimeout(() => {
        damageOverlay.style.opacity = '1';
    }, 10);
    
    setTimeout(() => {
        damageOverlay.style.opacity = '0';
    }, 200);
    
    setTimeout(() => {
        damageOverlay.remove();
    }, 500);
    
    // Add directional damage indicator text
    if (direction !== 'center' && direction !== 'front') {
        createDamageDirectionIndicator(direction);
    }
}

function createDamageDirectionIndicator(direction) {
    const indicator = document.createElement('div');
    indicator.className = 'absolute pointer-events-none z-35 text-red-400 font-bold text-lg';
    indicator.style.fontFamily = "'Orbitron', monospace";
    indicator.style.textShadow = '0 0 10px rgba(255,0,0,0.8), 0 0 20px rgba(255,0,0,0.5)';
    indicator.style.opacity = '0';
    indicator.style.transition = 'all 0.3s ease-out';
    
    // Position and text based on direction (REMOVED EMOJIS)
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
            positionStyle = 'top: 20px; left: 50%; transform: translateX(-50%);';
            break;
        case 'bottom':
            text = 'v UNDER ATTACK';
            positionStyle = 'bottom: 20px; left: 50%; transform: translateX(-50%);';
            break;
        case 'behind':
            text = '!!! AMBUSH !!!';
            positionStyle = 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
            break;
    }
    
    indicator.textContent = text;
    indicator.style.cssText += positionStyle;
    document.body.appendChild(indicator);
    
    // Animate in
    setTimeout(() => {
        indicator.style.opacity = '1';
        indicator.style.transform += ' scale(1.1)';
    }, 50);
    
    // Animate out
    setTimeout(() => {
        indicator.style.opacity = '0';
        indicator.style.transform += ' scale(0.8)';
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
    if (controlButtonsInitialized) {
        console.log('Control buttons already initialized, skipping...');
        return;
    }
    
    console.log('Setting up control buttons...');
    
    // Setup mute button (remove any existing listeners first)
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        // Clone node to remove all existing listeners
        const newMuteBtn = muteBtn.cloneNode(true);
        muteBtn.parentNode.replaceChild(newMuteBtn, muteBtn);
        
        newMuteBtn.addEventListener('click', (e) => {
            console.log('Mute button clicked!');
            e.preventDefault();
            e.stopPropagation();
            if (typeof resumeAudioContext === 'function') resumeAudioContext();
            if (typeof toggleMusic === 'function') toggleMusic();
        });
        console.log('Mute button event listener attached');
    }

    // Setup pause button (remove any existing listeners first)
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        // Clone node to remove all existing listeners
        const newPauseBtn = pauseBtn.cloneNode(true);
        pauseBtn.parentNode.replaceChild(newPauseBtn, pauseBtn);
        
        newPauseBtn.addEventListener('click', (e) => {
            console.log('Pause button clicked!');
            e.preventDefault();
            e.stopPropagation();
            togglePause();
        });
        console.log('Pause button event listener attached');
    }
    
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
        
        if (gameState.paused) return;  // MAKE SURE THIS LINE EXISTS
        
        if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
        }
        
        const key = e.key.toLowerCase();
        if (key === 'w') keys.w = true;
        if (key === 'a') keys.a = true;
        if (key === 's') keys.s = true;
        if (key === 'd') keys.d = true;
        if (key === 'q') keys.q = true;
        if (key === 'e') keys.e = true;
        if (key === 'o') keys.o = true;
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
            // Fire weapon on Alt key press
            if (!gameState.gameOver && gameState.gameStarted) {
                resumeAudioContext();
                fireWeapon();
            }
        }
        if (e.key === 'Meta' || e.key === 'Command') {
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
        if (key === 'w') keys.w = false;
        if (key === 'a') keys.a = false;
        if (key === 's') keys.s = false;
        if (key === 'd') keys.d = false;
        if (key === 'q') keys.q = false;
        if (key === 'e') keys.e = false;
        if (key === 'o') keys.o = false;
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
document.addEventListener('mousemove', (e) => {
    if (!gameState.gameStarted || gameState.gameOver || gamePaused) return;

    // ALWAYS update actual mouse position for UI detection
    gameState.mouseX = e.clientX;
    gameState.mouseY = e.clientY;

    // Only update crosshair position if not in target lock mode
    // This keeps crosshair and mouse positions separate when target lock is active
    if (!gameState.targetLock.active) {
        gameState.crosshairX = e.clientX;
        gameState.crosshairY = e.clientY;
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

        // Use gameState mouse position for zoom calculation
        const mouseX = gameState.mouseX || window.innerWidth / 2;
        const mouseY = gameState.mouseY || window.innerHeight / 2;

        // Calculate source area on the renderer canvas
        const sourceWidth = 250 / zoomFactor;
        const sourceHeight = 250 / zoomFactor;
        const sourceX = mouseX - (sourceWidth / 2);
        const sourceY = mouseY - (sourceHeight / 2);

        // Clear canvas
        ctx.clearRect(0, 0, 250, 250);

        // Save context and create circular clipping path
        ctx.save();
        ctx.beginPath();
        ctx.arc(125, 125, 125, 0, Math.PI * 2);
        ctx.clip();

        // Draw magnified portion (now clipped to circle)
        try {
            ctx.drawImage(
                renderer.domElement,
                Math.max(0, sourceX),
                Math.max(0, sourceY),
                sourceWidth,
                sourceHeight,
                0,
                0,
                250,
                250
            );
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

function checkWeaponHits(targetPosition) {
    const hitRadius = 50;

    // Check BORG drone hits (from outer interstellar systems)
    if (typeof outerInterstellarSystems !== 'undefined') {
        outerInterstellarSystems.forEach(system => {
            if (!system.userData || !system.userData.drones) return;

            system.userData.drones.forEach((drone, droneIndex) => {
                if (drone.userData.health <= 0) return;

                const distance = drone.position.distanceTo(targetPosition);
                if (distance < hitRadius) { // Normal hit radius
                    const damage = 1;
                    drone.userData.health -= damage;

                    flashEnemyHit(drone, damage);
                    playSound('weapon');
                    showAchievement('BORG Hit!', `${drone.userData.name} damaged (${drone.userData.health}/100 HP)`);

                    if (drone.userData.health <= 0) {
                        // BORG cube destroyed - MASSIVE EXPLOSION!
                        createMassiveBorgExplosion(drone.position);
                        playSound('explosion');
                        showAchievement('BORG CUBE DESTROYED!', `${drone.userData.name} eliminated!`);

                        // Remove from scene and array
                        scene.remove(drone);
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

            const distance = enemy.position.distanceTo(targetPosition);
            if (distance < hitRadius) {
                const damage = 1; // Standard damage
                enemy.userData.health -= damage;
                
                // ENHANCED: Use improved hit effect with color changes
                flashEnemyHit(enemy, damage);
                playSound('weapon');
                showAchievement('Target Hit!', `Damaged ${enemy.userData.name} (${enemy.userData.health}/${enemy.userData.maxHealth} HP)`);
                
                // FIXED: Only explode and remove when enemy actually dies
if (enemy.userData.health <= 0) {
    // Check if this was a boss BEFORE removing it
    const wasBoss = enemy.userData.isBoss;
    const bossName = enemy.userData.name;
    
    // Enemy destroyed - NOW create explosion and remove
    createExplosionEffect(enemy.position, 0xff4444, 15);
    playSound('explosion');
    
    if (wasBoss) {
    showAchievement('BOSS DEFEATED!', `${bossName} destroyed!`);
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
}
    
    // Hull recovery from defeating enemies
    const hullRecovery = wasBoss ? 15 + Math.random() * 15 : 5 + Math.random() * 10; // More recovery for bosses
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
    
    // Check if we should spawn a boss
if (typeof checkAndSpawnBoss === 'function' && enemy.userData.galaxyId !== undefined) {
    checkAndSpawnBoss(enemy.userData.galaxyId);
}
                    
                    // Check if this was a boss that was defeated
					if (enemy.userData.isBoss) {
    				const wasVictory = checkBossVictory(enemy);
    				if (wasVictory) {
        			showAchievement('BOSS DEFEATED!', `${enemy.userData.name} destroyed!`);
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
    
    // Check asteroid hits (if they exist)
    if (typeof planets !== 'undefined') {
    planets.filter(p => p.userData.type === 'asteroid' && p.userData.health > 0).forEach(asteroid => {
        const distance = asteroid.position.distanceTo(targetPosition);
        if (distance < hitRadius) {
            createExplosionEffect(asteroid.position, 0xffaa00, 10);
            // No notification for asteroid hits - silent destruction
            playSound('hit');
        	}
    	});
	}
}

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
            !enemy.userData.isBossSupport &&
            !enemy.userData.isBlackHoleGuardian  // ⭐ EXCLUDE GUARDIANS
        );
        
        // Check if boss has been defeated for this galaxy
        const bossDefeated = (typeof bossSystem !== 'undefined' && bossSystem.galaxyBossDefeated[g]);
        
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
                    `Well done, Captain! The ${clearedGalaxyType.name} Galaxy boss has been destroyed. Now eliminate the black hole guardians to fully liberate this galaxy!`, 
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
// GUARDIAN VICTORY SYSTEM - Final galaxy liberation check
// =============================================================================

function checkGuardianVictory() {
    if (typeof enemies === 'undefined' || typeof gameState === 'undefined') return;
    
    if (!gameState.currentGalaxyEnemies) {
        gameState.currentGalaxyEnemies = {};
    }
    
    // Check each galaxy for remaining guardians
    for (let g = 0; g < 8; g++) {
        // Only check galaxies where boss was defeated
        if (typeof bossSystem !== 'undefined' && !bossSystem.galaxyBossDefeated[g]) {
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
            
            // Play galaxy victory music
            playGalaxyVictoryMusic();

            // Launch fireworks celebration
            if (typeof createFireworkCelebration === 'function') {
                createFireworkCelebration();
            }

            // Show FINAL liberation achievement
            showAchievement(`Galaxy Liberation Complete - ${galaxyType.name}`, `${galaxyType.name} Galaxy (${galaxyType.faction}) completely liberated!`);
            
            // Mission Control message
            const remainingGalaxies = 8 - gameState.galaxiesCleared;
            let missionControlMessage = '';
            
            if (remainingGalaxies > 0) {
                missionControlMessage = `Excellent work, Captain! The ${galaxyType.name} Galaxy controlled by the ${galaxyType.faction} has been completely liberated. ${remainingGalaxies} hostile ${remainingGalaxies === 1 ? 'galaxy remains' : 'galaxies remain'}. Continue the mission!`;
            } else {
                missionControlMessage = `Outstanding, Captain! All hostile forces have been eliminated. The universe is safe thanks to your heroic efforts. Mission accomplished!`;
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
            
            // Check for total victory
            if (gameState.galaxiesCleared >= 8) {
                showAchievement('Victory!', 'All galaxies liberated! Universe saved!');
                playVictoryMusic();
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

function checkBorgSpawn() {
    if (typeof gameState === 'undefined' || typeof camera === 'undefined') return;
    if (gameState.borg.spawned) return; // Already spawned

    // Check if player is beyond 70,000 units from origin
    const distanceFromOrigin = camera.position.length();

    if (distanceFromOrigin > 70000) {
        // 30% chance to spawn
        if (Math.random() < 0.3) {
            spawnBorgCube();
        } else {
            // Mark as checked so we don't spam the roll
            gameState.borg.spawned = true;
            setTimeout(() => {
                gameState.borg.spawned = false; // Allow another check later
            }, 60000); // Wait 60 seconds before checking again
        }
    }
}

function spawnBorgCube() {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || typeof camera === 'undefined') return;

    // Spawn ahead of player's current position
    const spawnDistance = 5000;
    const direction = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const spawnPosition = camera.position.clone().add(direction.multiplyScalar(spawnDistance));

    // Create the Borg cube - large black/green cube
    const cubeSize = 50; // Black hole size
    const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const cubeMaterial = new THREE.MeshBasicMaterial({
        color: 0x003300,
        wireframe: false,
        transparent: true,
        opacity: 0.9
    });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.copy(spawnPosition);

    // Add green glow effect
    const glowGeometry = new THREE.BoxGeometry(cubeSize * 1.2, cubeSize * 1.2, cubeSize * 1.2);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.3,
        wireframe: true
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    cube.add(glow);

    // Set cube properties
    cube.userData = {
        type: 'enemy',
        health: 100,
        maxHealth: 100,
        name: 'Borg Cube',
        isBorg: true,
        isBorgCube: true,
        speed: 2.0, // Slow but relentless
        damage: 5,
        detectionRange: 10000,
        firingRange: 500,
        lastAttack: 0,
        droneCount: 0,
        maxDrones: 8,
        galaxyId: -1 // Special: not tied to any galaxy
    };

    scene.add(cube);
    if (typeof enemies !== 'undefined') {
        enemies.push(cube);
    }

    // Mark as spawned
    gameState.borg.spawned = true;
    gameState.borg.active = true;
    gameState.borg.cube = cube;
    gameState.borg.drones = [];

    // Show dramatic spawn message
    showAchievement('⚠️ CRITICAL ALERT', 'Unknown massive vessel detected! Extreme threat level!', true);
    playSound('boss');

    // Spawn initial drones after 2 seconds
    setTimeout(() => {
        for (let i = 0; i < 8; i++) {
            spawnBorgDrone();
        }
    }, 2000);

    console.log('🎯 Borg Cube spawned! Resistance is futile!');
}

function spawnBorgDrone() {
    if (!gameState.borg.cube || !gameState.borg.active) return;
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;

    const cube = gameState.borg.cube;

    // Create small pyramid-shaped drone
    const droneGeometry = new THREE.ConeGeometry(2, 4, 4);
    const droneMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: false
    });
    const drone = new THREE.Mesh(droneGeometry, droneMaterial);

    // Spawn near cube with random offset
    const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 100
    );
    drone.position.copy(cube.position).add(offset);

    // Set drone properties
    drone.userData = {
        type: 'enemy',
        health: 2,
        maxHealth: 2,
        name: 'Borg Drone',
        isBorg: true,
        isBorgDrone: true,
        speed: 1.5,
        damage: 2,
        detectionRange: 5000,
        firingRange: 300,
        lastAttack: 0,
        circlePhase: Math.random() * Math.PI * 2,
        galaxyId: -1,
        parentCube: cube
    };

    scene.add(drone);
    if (typeof enemies !== 'undefined') {
        enemies.push(drone);
    }

    gameState.borg.drones.push(drone);
    cube.userData.droneCount++;

    console.log(`🤖 Borg Drone spawned (${cube.userData.droneCount}/∞)`);
}

function updateBorgBehavior() {
    if (!gameState.borg.active || !gameState.borg.cube) return;
    if (typeof camera === 'undefined' || typeof THREE === 'undefined') return;

    const cube = gameState.borg.cube;

    // Check if cube is destroyed
    if (cube.userData.health <= 0) {
        handleBorgCubeDestruction();
        return;
    }

    const playerPos = camera.position;
    const distance = cube.position.distanceTo(playerPos);

    // Relentless pursuit - always move towards player
    const direction = new THREE.Vector3().subVectors(playerPos, cube.position).normalize();
    cube.position.add(direction.multiplyScalar(cube.userData.speed));

    // Rotate cube for effect
    cube.rotation.x += 0.002;
    cube.rotation.y += 0.003;
    cube.rotation.z += 0.001;

    // Send communications when close
    if (distance < 5000) {
        sendBorgCommunication(distance);
    }

    // Spawn drones when player gets close (3500 units)
    if (distance < 3500 && cube.userData.droneCount < cube.userData.maxDrones) {
        spawnBorgDrone();
    }

    // Check for dead drones and replace them
    gameState.borg.drones = gameState.borg.drones.filter(drone => {
        if (!drone || drone.userData.health <= 0) {
            cube.userData.droneCount--;
            // Spawn replacement after short delay
            setTimeout(() => spawnBorgDrone(), 2000);
            return false;
        }
        return true;
    });

    // Update drone behavior - swarm around cube
    gameState.borg.drones.forEach((drone, index) => {
        if (!drone || drone.userData.health <= 0) return;

        const droneDistance = drone.position.distanceTo(playerPos);

        // If player is within 3500 units, drones attack
        if (droneDistance < 3500) {
            // Swarm attack behavior
            const swarmAngle = Date.now() * 0.001 + (index * Math.PI * 2 / 8);
            const spiralRadius = 80 + Math.sin(Date.now() * 0.0003) * 30;

            const targetX = playerPos.x + Math.cos(swarmAngle) * spiralRadius;
            const targetZ = playerPos.z + Math.sin(swarmAngle) * spiralRadius;
            const targetY = playerPos.y + Math.sin(swarmAngle * 0.5) * 20;

            const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
            const dir = new THREE.Vector3().subVectors(targetPos, drone.position).normalize();
            drone.position.add(dir.multiplyScalar(drone.userData.speed));
        } else {
            // Orbit cube when far from player
            const orbitAngle = Date.now() * 0.001 + (index * Math.PI * 2 / 8);
            const orbitRadius = 80;

            const targetX = cube.position.x + Math.cos(orbitAngle) * orbitRadius;
            const targetZ = cube.position.z + Math.sin(orbitAngle) * orbitRadius;
            const targetY = cube.position.y + Math.sin(orbitAngle * 0.5) * 30;

            const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
            const dir = new THREE.Vector3().subVectors(targetPos, drone.position).normalize();
            drone.position.add(dir.multiplyScalar(drone.userData.speed * 0.5));
        }

        // Drone attack
        if (droneDistance < drone.userData.firingRange) {
            const now = Date.now();
            if (now - (drone.userData.lastAttack || 0) > 1500) {
                fireEnemyWeapon(drone);
                drone.userData.lastAttack = now;
            }
        }
    });
}

function sendBorgCommunication(distance) {
    const now = Date.now();
    if (now - gameState.borg.lastCommunication < gameState.borg.communicationCooldown) return;

    gameState.borg.lastCommunication = now;

    const message = BORG_MESSAGES[Math.floor(Math.random() * BORG_MESSAGES.length)];
    const threat = distance < 2000 ? 'IMMINENT THREAT' : 'INCOMING THREAT';

    showAchievement(`⚠️ BORG TRANSMISSION [${threat}]`, message, true);
    playSound('boss');

    console.log(`📡 Borg: "${message}"`);
}

function handleBorgCubeDestruction() {
    if (!gameState.borg.cube) return;

    const cube = gameState.borg.cube;

    // Epic victory message
    showAchievement('🎉 LEGENDARY VICTORY!', 'Borg Cube destroyed! The pursuit is over. You are free!', true);
    playSound('achievement');
    setTimeout(() => playBossVictoryMusic(), 500);

    // Destroy all drones
    gameState.borg.drones.forEach(drone => {
        if (drone && scene) {
            scene.remove(drone);
        }
        const index = enemies.indexOf(drone);
        if (index > -1) enemies.splice(index, 1);
    });

    // Remove cube
    if (scene) scene.remove(cube);
    const cubeIndex = enemies.indexOf(cube);
    if (cubeIndex > -1) enemies.splice(cubeIndex, 1);

    // Reset Borg state
    gameState.borg.active = false;
    gameState.borg.cube = null;
    gameState.borg.drones = [];

    // Massive rewards
    gameState.missiles.capacity += 5;
    gameState.missiles.current = gameState.missiles.capacity;
    showAchievement('ULTIMATE REWARD', `+5 Missile Capacity! Total: ${gameState.missiles.capacity}`, true);

    console.log('🎊 Borg Cube defeated! Player is free!');
}

// =============================================================================
// MISSILE SYSTEM
// =============================================================================

// Missile System
function fireMissile() {
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

    createMissile(camera.position.clone(), targetPosition, targetObject);
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
        missile.userData.lifetime += 16.67;

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

    enemy.userData.health -= gameState.missiles.damage;
    flashEnemyHit(enemy, gameState.missiles.damage);
    createMissileExplosion(missile.position);
    playSound('missile_explosion');

    showAchievement('Missile Hit!',
        `Damaged ${enemy.userData.name} (${enemy.userData.health}/${enemy.userData.maxHealth} HP)`);

    if (enemy.userData.health <= 0) {
        const wasBoss = enemy.userData.isBoss;
        const bossName = enemy.userData.name;

        createExplosionEffect(enemy.position, 0xff4444, 15);
        playSound('explosion');

        if (wasBoss) {
            showAchievement('BOSS DEFEATED!', `${bossName} destroyed by missile!`);
            if (typeof checkBossVictory === 'function') checkBossVictory(enemy);
            if (typeof createFireworkCelebration === 'function') createFireworkCelebration();
            playBossVictoryMusic();

            // Boss defeated: +2 missile capacity
            gameState.missiles.capacity += 2;
            gameState.missiles.current = Math.min(gameState.missiles.capacity, gameState.missiles.current + 2);
            showAchievement('Missile Capacity Increased!',
                `Capacity now ${gameState.missiles.capacity} missiles`);
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
        if (typeof checkAndSpawnBoss === 'function' && enemy.userData.galaxyId !== undefined) {
            checkAndSpawnBoss(enemy.userData.galaxyId);
        }
    }
}

function handleCosmicFeatureDestruction(missile, feature, type) {
    scene.remove(missile);
    feature.userData.destroyed = true;

    // Create larger explosion
    createMissileExplosion(missile.position);
    playSound('missile_explosion');

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

    let scale = 1;
    let opacity = 0.9;
    const explosionInterval = setInterval(() => {
        scale += 0.8;
        opacity -= 0.08;
        explosion.scale.set(scale, scale, scale);
        explosionMaterial.opacity = opacity;

        if (opacity <= 0) {
            clearInterval(explosionInterval);
            scene.remove(explosion);
            explosionGeometry.dispose();
            explosionMaterial.dispose();
        }
    }, 50);

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

    let particleLife = 1.0;
    const particleInterval = setInterval(() => {
        particleLife -= 0.025;
        particleMaterial.opacity = particleLife;

        if (particleLife <= 0) {
            clearInterval(particleInterval);
            scene.remove(particleSystem);
            particles.dispose();
            particleMaterial.dispose();
        }
    }, 70);
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
    // Faster weapon cooldown (RESTORED)
    if (gameState.weapons.cooldown > 0 || gameState.weapons.energy < 10) return;
    
    gameState.weapons.cooldown = 200; // Even faster: 0.2 seconds
    gameState.weapons.energy = Math.max(0, gameState.weapons.energy - 10);
    
    // Enhanced targeting with doubled ranges
    let targetObject = null;
    let targetPosition;
    
    if (gameState.targetLock.active && gameState.targetLock.target) {
        // Auto-aim at locked target (excludes asteroids - they can't be auto-targeted)
        if (gameState.targetLock.target.userData.type !== 'asteroid') {
            targetPosition = gameState.targetLock.target.position.clone();
            targetObject = gameState.targetLock.target;
        } else {
            // Clear invalid asteroid target lock
            gameState.targetLock.active = false;
            gameState.targetLock.target = null;
        }
    }
    
    if (!targetObject) {
        // Manual aiming using crosshair position
        const mousePos = new THREE.Vector2(
            (gameState.crosshairX / window.innerWidth) * 2 - 1,
            -(gameState.crosshairY / window.innerHeight) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePos, camera);
        
        // Check for enemy hits first
        const enemyIntersects = raycaster.intersectObjects(enemies);
        if (enemyIntersects.length > 0) {
            targetPosition = enemyIntersects[0].point;
            targetObject = enemyIntersects[0].object;
            console.log('Hit detected: enemy', targetObject.userData.name);
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

            const borgIntersects = raycaster.intersectObjects(borgDrones);
            if (borgIntersects.length > 0) {
                targetPosition = borgIntersects[0].point;
                targetObject = borgIntersects[0].object.parent; // Parent is the drone group
                console.log('Hit detected: BORG drone', targetObject.userData.name);
            } else {
                // Check for asteroid hits (for manual aiming only)
                const asteroidTargets = planets.filter(p => p.userData.type === 'asteroid');
                const asteroidIntersects = raycaster.intersectObjects(asteroidTargets);
                if (asteroidIntersects.length > 0) {
                    targetPosition = asteroidIntersects[0].point;
                    targetObject = asteroidIntersects[0].object;
                    console.log('Hit detected: asteroid', targetObject.userData.name);
                    console.log('Asteroid hit confirmed, calling destroyAsteroidByWeapon');
                } else {
                    // Fire in the direction of the crosshair
                    const direction = raycaster.ray.direction.clone();
                    targetPosition = camera.position.clone().add(direction.multiplyScalar(1000));
                }
            }
        }
    }
    
    // Create weapon effect (RESTORED: Uses corrected laser beam)
    createLaserBeam(camera.position, targetPosition, '#00ff96', true);
    
    // Handle weapon hits based on target type
    if (targetObject) {
        if (targetObject.userData.type === 'asteroid') {
            // Asteroid hit - restore hull, pass actual hit position
            destroyAsteroidByWeapon(targetObject, targetPosition);
        } else {
            // Check for normal enemy/object hits
            checkWeaponHits(targetPosition);
        }
    } else {
        // No direct hit - still check for area hits
        checkWeaponHits(targetPosition);
    }
    
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
    
    // Create pause overlay if it doesn't exist
    let pauseOverlay = document.getElementById('pauseOverlay');
    if (!pauseOverlay) {
        pauseOverlay = document.createElement('div');
        pauseOverlay.id = 'pauseOverlay';
        pauseOverlay.className = 'absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 hidden';
        pauseOverlay.innerHTML = `
            <div class="text-center ui-panel rounded-lg p-8">
                <h2 class="text-3xl font-bold text-cyan-400 mb-4">GAME PAUSED</h2>
                <p class="text-gray-300 mb-6">Press P or click Resume to continue</p>
                <button onclick="togglePause()" class="space-btn rounded px-6 py-3">
                    <i class="fas fa-play mr-2"></i>Resume Game
                </button>
            </div>
        `;
        document.body.appendChild(pauseOverlay);
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
        popup.style.pointerEvents = 'auto'; // Enable interaction

        popup.classList.remove('hidden');

        // Add click handler for "Slingshot Ready" on mobile
        if (title === 'Slingshot Ready') {
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
                }
            };

            // Store handler reference for cleanup
            popup._slingshotClickHandler = slingshotHandler;

            // Add listeners
            popup.addEventListener('click', slingshotHandler);
            popup.addEventListener('touchstart', slingshotHandler, { passive: false });
        } else {
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

        // Longer display time for important achievements
        const displayTime = 4000;

        // Play sound if requested
        if (playAchievementSound && typeof playSound === 'function') {
            playSound('achievement');
        }

        // Auto-hide after display time
        setTimeout(() => {
            popup.classList.add('hidden');
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
    
    // Add comets
    if (typeof comets !== 'undefined') {
        const nearbyComets = comets.filter(c => camera.position.distanceTo(c.position) < 4000);
        allTargets.push(...nearbyComets);
    }
    
    // Add enemies
    if (typeof enemies !== 'undefined') {
        const aliveEnemies = enemies.filter(e => e.userData.health > 0 && camera.position.distanceTo(e.position) < 2000);
        allTargets.push(...aliveEnemies);
    }
    
    // ADD COSMIC FEATURES TO CYCLING - This is the main addition!
    if (typeof cosmicFeatures !== 'undefined') {
        // Add nearby cosmic features within cycling range
        allTargets.push(...cosmicFeatures.pulsars.filter(p => camera.position.distanceTo(p.position) < 2000));
        allTargets.push(...cosmicFeatures.supernovas.filter(s => camera.position.distanceTo(s.position) < 3000));
        allTargets.push(...cosmicFeatures.dysonSpheres.filter(d => camera.position.distanceTo(d.position) < 4000));
        allTargets.push(...cosmicFeatures.ringworlds.filter(r => camera.position.distanceTo(r.position) < 4000));
        allTargets.push(...cosmicFeatures.spaceWhales.filter(w => camera.position.distanceTo(w.position) < 2000));
        allTargets.push(...cosmicFeatures.brownDwarfs.filter(bd => camera.position.distanceTo(bd.position) < 1500));
        allTargets.push(...cosmicFeatures.solarStorms.filter(ss => camera.position.distanceTo(ss.position) < 2500));
        allTargets.push(...cosmicFeatures.crystalFormations.filter(cf => camera.position.distanceTo(cf.position) < 1800));
        allTargets.push(...cosmicFeatures.plasmaStorms.filter(ps => camera.position.distanceTo(ps.position) < 2200));
        allTargets.push(...cosmicFeatures.roguePlanets.filter(rp => camera.position.distanceTo(rp.position) < 1600));
        
        // Dark matter nodes only show when very close (they're hard to detect)
        allTargets.push(...cosmicFeatures.darkMatterNodes.filter(dm => camera.position.distanceTo(dm.position) < 400));
        
        // Dust clouds only show when inside or very close
        allTargets.push(...cosmicFeatures.dustClouds.filter(dc => camera.position.distanceTo(dc.position) < 250));
    }
    
    // Filter by distance and sort
    const nearbyObjects = allTargets.filter(obj => {
        const distance = camera.position.distanceTo(obj.position);
        return distance < 6000; // Doubled range
    }).sort((a, b) => {
        const distA = camera.position.distanceTo(a.position);
        const distB = camera.position.distanceTo(b.position);
        return distA - distB;
    });
    
    if (nearbyObjects.length === 0) {
        gameState.currentTarget = null;
        showAchievement('No Targets', 'No objects detected in range');
        return;
    }
    
    if (typeof nebulaGasClouds !== 'undefined') {
    allTargets.push(...nebulaGasClouds.filter(gc => camera.position.distanceTo(gc.position) < 3000));
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
    if (typeof gameOver !== 'undefined') {
        gameOver('Hull integrity critical - ship destroyed!');
    } else {
        showAchievement('GAME OVER', 'Ship destroyed - mission failed!');
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

    // Borg systems
    window.checkBorgSpawn = checkBorgSpawn;
    window.updateBorgBehavior = updateBorgBehavior;
    window.spawnBorgCube = spawnBorgCube;
    window.spawnBorgDrone = spawnBorgDrone;
    window.sendBorgCommunication = sendBorgCommunication;
    window.handleBorgCubeDestruction = handleBorgCubeDestruction;

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
