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
  x: false, b: false
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

// AUTO-LEVELING SYSTEM VARIABLES - ENHANCED
let autoLevelingTimer = 0;
const autoLevelingDelay = 6000; // 6 seconds for both Q/E roll and UP/DOWN pitch
const autoLevelingSpeed = 0.005; // Much slower leveling speed
let lastRollInputTime = 0;
let lastPitchInputTime = 0;

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
    enemies.forEach(enemy => {
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
    
    // FIXED: Always check for boss spawning regardless of tutorial state
    if (typeof checkAndSpawnBoss === 'function') {
        for (let galaxyId = 0; galaxyId < 8; galaxyId++) {
            checkAndSpawnBoss(galaxyId);
        }
    }
    
    // Process only 5 enemies per frame for performance
    const enemiesPerFrame = 5;
    const startIndex = (gameState.frameCount * enemiesPerFrame) % enemies.length;
    
    for (let i = 0; i < enemiesPerFrame && i < enemies.length; i++) {
        const enemyIndex = (startIndex + i) % enemies.length;
        const enemy = enemies[enemyIndex];
        }

    // Don't activate enemies until tutorial is complete
    if (typeof tutorialSystem !== 'undefined' && tutorialSystem.active && !tutorialSystem.completed) {
        enemies.forEach(enemy => {
            if (enemy.userData.health <= 0) return;
            enemy.userData.isActive = false;
            enemy.userData.attackMode = 'patrol';
        });
        return; // Skip normal enemy behavior during tutorial
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
        
        // Visual health updates
        updateEnemyVisualHealth(enemy);
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
            if (typeof gameState !== 'undefined' && gameState.hull !== undefined) {
                gameState.hull = Math.max(0, gameState.hull - damage);
            } else if (typeof gameState !== 'undefined' && gameState.health !== undefined) {
                gameState.health = Math.max(0, gameState.health - damage);
            }
            
            // ENHANCED: Directional damage effects with attacker position
            createEnhancedScreenDamageEffect(enemy.position);
            playSound('damage');
            
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
    if (!enemy || !enemy.userData || !enemy.material) return;
    
    // Store original material properties if not already stored
    if (!enemy.userData.originalMaterial) {
        enemy.userData.originalMaterial = {
            color: enemy.material.color.clone(),
            emissive: enemy.material.emissive.clone(),
            emissiveIntensity: enemy.material.emissiveIntensity || 0
        };
    }
    
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
            text: "Your ship is equipped with energy weapons and hull repair systems. Destroying enemies will restore hull integrity. Watch your energy levels during combat.",
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

function showMissionCommandAlert(title, text) {
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
    
    // Create button container if it doesn't exist
    let buttonContainer = alertElement.querySelector('.button-container');
    if (!buttonContainer) {
        buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container flex gap-3 mt-4 justify-center';
        alertElement.querySelector('.text-center').appendChild(buttonContainer);
    }
    
    // Clear existing buttons
    buttonContainer.innerHTML = '';
    
    // Create Acknowledged button
    const okButton = document.createElement('button');
    okButton.className = 'space-btn rounded px-6 py-2';
    okButton.innerHTML = '<i class="fas fa-check mr-2"></i>Acknowledged';
    
    // Create Skip Tutorial button
    const skipButton = document.createElement('button');
    skipButton.className = 'space-btn rounded px-6 py-2 bg-yellow-600 hover:bg-yellow-500';
    skipButton.innerHTML = '<i class="fas fa-forward mr-2"></i>Skip Tutorial';
    
    buttonContainer.appendChild(okButton);
    buttonContainer.appendChild(skipButton);
    
    playSound('achievement');
    
    // Auto-dismiss after 15 seconds or manual click
    const timeoutId = setTimeout(() => {
        alertElement.classList.add('hidden');
        if (tutorialSystem.active && tutorialSystem.currentStep >= tutorialSystem.messages.length) {
            completeTutorial();
        }
    }, 15000);
    
    okButton.onclick = () => {
        clearTimeout(timeoutId);
        alertElement.classList.add('hidden');
        
        if (tutorialSystem.active && tutorialSystem.currentStep >= tutorialSystem.messages.length) {
            completeTutorial();
        }
    };
    
    skipButton.onclick = () => {
        clearTimeout(timeoutId);
        alertElement.classList.add('hidden');
        
        // Skip entire tutorial
        if (typeof completeTutorial === 'function') {
            completeTutorial();
        }
    };
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
        
        musicGain.gain.value = 0.6;
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
    
    // Mystery tone generator (RESTORED: Working random synth notes)
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
    
    // RESTORED: Working mystery tone scheduler
    function triggerMysteryTone() {
        if (!musicSystem.enabled || !musicSystem.backgroundMusic) return;
        
        const frequencies = [110, 146.83, 164.81, 220, 293.66, 329.63];
        const freq = frequencies[Math.floor(Math.random() * frequencies.length)];
        const now = audioContext.currentTime;
        
        mysteryOsc.frequency.setValueAtTime(freq, now);
        mysteryGain.gain.setValueAtTime(0, now);
        mysteryGain.gain.linearRampToValueAtTime(0.04, now + 2);
        mysteryGain.gain.linearRampToValueAtTime(0.001, now + 8);
        
        setTimeout(triggerMysteryTone, 8000 + Math.random() * 12000);
    }
    
    setTimeout(triggerMysteryTone, 5000);
    
    // Store references
    musicSystem.backgroundMusic = {
        stop: () => {
            bassOsc.stop();
            lfo1.stop();
            padOsc.stop();
            lfo2.stop();
            mysteryOsc.stop();
        }
    };
}

function createBattleMusic() {
    if (!audioContext || !musicSystem.enabled) return;
    
    // Faster, more intense battle music
    const drumOsc = audioContext.createOscillator();
    const drumGain = audioContext.createGain();
    const drumFilter = audioContext.createBiquadFilter();
    
    drumOsc.connect(drumFilter);
    drumFilter.connect(drumGain);
    drumGain.connect(musicGain);
    
    drumOsc.type = 'triangle';
    drumOsc.frequency.setValueAtTime(60, audioContext.currentTime);
    drumFilter.type = 'highpass';
    drumFilter.frequency.setValueAtTime(50, audioContext.currentTime);
    drumGain.gain.setValueAtTime(0.08, audioContext.currentTime);
    
    // Battle melody
    const melodyOsc = audioContext.createOscillator();
    const melodyGain = audioContext.createGain();
    melodyOsc.connect(melodyGain);
    melodyGain.connect(musicGain);
    
    melodyOsc.type = 'square';
    melodyOsc.frequency.setValueAtTime(440, audioContext.currentTime);
    melodyGain.gain.setValueAtTime(0.06, audioContext.currentTime);
    
    // Rapid sequence for tension
    function playBattleSequence() {
        if (!musicSystem.inBattle) return;
        
        const notes = [440, 523, 659, 523, 440, 370, 440, 523];
        const now = audioContext.currentTime;
        
        notes.forEach((freq, i) => {
            const time = now + i * 0.15;
            melodyOsc.frequency.setValueAtTime(freq, time);
        });
        
        setTimeout(playBattleSequence, 1200);
    }
    
    const startTime = audioContext.currentTime;
    drumOsc.start(startTime);
    melodyOsc.start(startTime);
    
    playBattleSequence();
    
    musicSystem.battleMusic = {
        stop: () => {
            drumOsc.stop();
            melodyOsc.stop();
        }
    };
}

function switchToBattleMusic() {
    if (musicSystem.inBattle || !musicSystem.enabled) return;
    
    musicSystem.inBattle = true;
    
    // Fade out ambient music
    if (musicSystem.backgroundMusic) {
        musicGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
        setTimeout(() => {
            if (musicSystem.backgroundMusic) {
                musicSystem.backgroundMusic.stop();
            }
            // Start battle music
            createBattleMusic();
            musicGain.gain.setValueAtTime(0.001, audioContext.currentTime);
            musicGain.gain.exponentialRampToValueAtTime(0.4, audioContext.currentTime + 0.5);
        }, 1000);
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
    const musicIcon = document.getElementById('musicIcon');
    const musicControl = document.getElementById('musicControl');
    
    if (musicSystem.enabled) {
        if (musicIcon) musicIcon.className = 'fas fa-volume-up text-cyan-400';
        if (musicControl) musicControl.classList.remove('muted');
        if (musicGain) musicGain.gain.setValueAtTime(0.4, audioContext.currentTime);
        
        // Restart appropriate music
        if (musicSystem.inBattle) {
            createBattleMusic();
        } else {
            startBackgroundMusic();
        }
    } else {
        if (musicIcon) musicIcon.className = 'fas fa-volume-mute text-red-400';
        if (musicControl) musicControl.classList.add('muted');
        if (musicGain) musicGain.gain.setValueAtTime(0, audioContext.currentTime);
        
        // Stop all music
        if (musicSystem.backgroundMusic) musicSystem.backgroundMusic.stop();
        if (musicSystem.battleMusic) musicSystem.battleMusic.stop();
    }
}

function createDeathExplosion(position) {
    // Play death explosion sound
    if (typeof playSound === 'function') {
        playSound('explosion', 150, 0.8); // Deep explosion sound
        setTimeout(() => playSound('explosion', 300, 0.6), 100); // Secondary blast
    }
    
    // Create large death explosion effect
    const explosionGeometry = new THREE.SphereGeometry(8, 16, 16); // Larger than normal
    const explosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xff3300,
        transparent: true,
        opacity: 0.9
    });
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    scene.add(explosion);
    
    // Animate large explosion
    let scale = 1;
    let opacity = 0.9;
    const explosionInterval = setInterval(() => {
        scale += 3.0;  // Much larger expansion
        opacity -= 0.15;  // Slower fade for dramatic effect
        explosion.scale.set(scale, scale, scale);
        explosionMaterial.opacity = opacity;
        
        if (opacity <= 0) {
            clearInterval(explosionInterval);
            scene.remove(explosion);
            explosionGeometry.dispose();
            explosionMaterial.dispose();
        }
    }, 40);  // Slightly slower for dramatic effect
    
    // Create large particle burst
    const particles = new THREE.BufferGeometry();
    const particleCount = 50; // More particles
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 40;     // Larger spread
        positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xff4400,
        size: 3, // Larger particles
        transparent: true
    });
    
    const particleSystem = new THREE.Points(particles, particleMaterial);
    particleSystem.position.copy(position);
    scene.add(particleSystem);
    
    // Animate particles
    let particleOpacity = 1;
    let particleScale = 1;
    const particleInterval = setInterval(() => {
        particleOpacity -= 0.1;
        particleScale += 0.3;
        particleMaterial.opacity = particleOpacity;
        particleSystem.scale.set(particleScale, particleScale, particleScale);
        
        if (particleOpacity <= 0) {
            clearInterval(particleInterval);
            scene.remove(particleSystem);
            particles.dispose();
            particleMaterial.dispose();
        }
    }, 50);
}

// Function to handle player death
function handlePlayerDeath() {
    createDeathExplosion(camera.position);
    gameState.gameOver = true;
    // Additional death handling code here
}

// RESTORED: Working sound parameters from game-controls13.js
function playSound(type, frequency = 440, duration = 0.2) {
    if (!audioContext || audioContext.state === 'suspended') return;
    
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
            // FIXED: Black hole warp sound
            oscillator.frequency.setValueAtTime(50, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(3000, audioContext.currentTime + 2.0);
            gain.gain.setValueAtTime(0.6, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 2.0);
            oscillator.type = 'sawtooth';
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
    const explosionInterval = setInterval(() => {
        scale += 2.0;  // Faster scale increase
        opacity -= 0.2;  // Faster fade
        explosion.scale.set(scale, scale, scale);
        explosionMaterial.opacity = opacity;
        
        if (opacity <= 0) {
            clearInterval(explosionInterval);
            scene.remove(explosion);
            explosionGeometry.dispose();
            explosionMaterial.dispose();
        }
    }, 30);  // Faster update rate
    
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
        particleLife -= 0.05;
        particleMaterial.opacity = particleLife;
        
        if (particleLife <= 0) {
            clearInterval(particleInterval);
            scene.remove(particleSystem);
            particles.dispose();
            particleMaterial.dispose();
        }
    }, 50);
    
    // Play explosion sound
    playSound('explosion');
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
        
        // Faster fade out
        let opacity = 0.8;
        const fadeInterval = setInterval(() => {
            opacity -= 0.25;
            laserMaterial.opacity = opacity;
            glowMaterial.opacity = opacity * 0.3;
            
            if (opacity <= 0) {
                clearInterval(fadeInterval);
                scene.remove(laserBeam);
                laserGeometry.dispose();
                laserMaterial.dispose();
                glowGeometry.dispose();
                glowMaterial.dispose();
            }
        }, 20);
        
    } catch (error) {
        console.warn('Failed to create laser beam:', error);
    }
}

// =============================================================================
// ENHANCED VISUAL FEEDBACK: ENEMY HIT COLOR CHANGES
// =============================================================================

// ENHANCED: Enemy hit flash with color changes based on health
function flashEnemyHit(enemy, damage = 1) {
    if (!enemy || !enemy.material) return;
    
    // Store original material if not already stored
    if (!enemy.userData.originalMaterial) {
        enemy.userData.originalMaterial = {
            color: enemy.material.color.clone(),
            emissive: enemy.material.emissive.clone(),
            emissiveIntensity: enemy.material.emissiveIntensity
        };
    }
    
    // Calculate health percentage
    const healthPercent = enemy.userData.health / enemy.userData.maxHealth;
    
    // Color based on health percentage and hit
    let hitColor, emissiveColor;
    if (healthPercent > 0.66) {
        // High health - bright red flash
        hitColor = new THREE.Color(1, 0.2, 0.2);
        emissiveColor = new THREE.Color(1, 0, 0);
    } else if (healthPercent > 0.33) {
        // Medium health - orange flash with more intensity
        hitColor = new THREE.Color(1, 0.5, 0);
        emissiveColor = new THREE.Color(1, 0.3, 0);
    } else {
        // Low health - yellow/white flash, very intense
        hitColor = new THREE.Color(1, 1, 0.2);
        emissiveColor = new THREE.Color(1, 0.8, 0);
    }
    
    // Apply hit effect
    enemy.material.color.copy(hitColor);
    enemy.material.emissive.copy(emissiveColor);
    enemy.material.emissiveIntensity = 0.8;
    
    // Clear any existing timeout
    if (enemy.userData.hitTimeout) {
        clearTimeout(enemy.userData.hitTimeout);
    }
    
    // Return to health-based color after delay
    enemy.userData.hitTimeout = setTimeout(() => {
        if (enemy && enemy.material && enemy.userData.originalMaterial) {
            // Set color based on current health
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
    
    // Music control - with DOM readiness check
function setupControlButtons() {
    const musicControl = document.getElementById('muteBtn');
    if (musicControl) {
        musicControl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleMusic();
        });
        console.log('Mute button event listener attached');
    } else {
        console.warn('Mute button not found, retrying in 100ms');
        setTimeout(setupControlButtons, 100);
        return;
    }

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePause();
        });
        console.log('Pause button event listener attached');
    } else {
        console.warn('Pause button not found');
    }
}

// Call the setup function
setupControlButtons();

    // Enhanced keyboard controls with pause key
    document.addEventListener('keydown', (e) => {
        // Add pause key handler
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            togglePause();
            return;
        }
        
        // Don't process other keys if paused
        if (gamePaused) return;
        
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
            if (e.key === ' ') {
            keys.space = true;
            // FIXED: Space bar only fires weapon, no warp sounds
            if (!gameState.gameOver && gameState.gameStarted) {
                resumeAudioContext();
                fireWeapon(); // Only weapon firing, no additional audio calls
            }
        }
        }
        if (e.key === 'Alt' || e.altKey) {
            keys.alt = true;
            // CHANGED: Alt/Option key now does target lock (was Space bar function)
            if (gameState.targetLock.active) {
                gameState.targetLock.active = false;
                gameState.targetLock.target = null;
                // Removed notification as requested
            } else {
                gameState.targetLock.active = true;
                // Removed notification and sound as requested
            }
        }
        if (key === 'x') keys.x = true;
        if (key === 'b') keys.b = true;
        
        if (e.key === 'ArrowUp') keys.up = true;
        if (e.key === 'ArrowDown') keys.down = true;
        if (e.key === 'ArrowLeft') keys.left = true;
        if (e.key === 'ArrowRight') keys.right = true;
        
        if (e.key === 'Tab') {
            e.preventDefault();
            cycleTargets();
        }
        
        if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Enter key pressed - checking for slingshot conditions');
    
    // First check if we're near a planet for slingshot
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
    
    console.log('Nearest planet:', nearestPlanet?.userData?.name, 'at distance:', nearestDistance);
    
    // Execute slingshot if conditions are met
    if (nearestPlanet && gameState.energy >= 20 && !gameState.slingshot.active) {
        console.log('Executing slingshot!');
        executeSlingshot();
    } 
    // If no planet nearby, try auto-navigation toggle
    else if (gameState.currentTarget) {
        console.log('Toggling auto-navigation');
        if (gameState.autoNavigating) {
            gameState.autoNavigating = false;
            gameState.autoNavOrienting = false;
            showAchievement('Auto-Nav Disengaged', 'Manual control resumed');
        } else {
            gameState.autoNavigating = true;
            gameState.autoNavOrienting = true;
            showAchievement('Auto-Nav Engaged', `Orienting towards ${gameState.currentTarget.userData.name}`);
        }
        updateUI();
    }
    // Show why slingshot isn't available
    else {
        if (!nearestPlanet) {
            showAchievement('No Planet in Range', 'Move within 60 units of a planet');
        } else if (gameState.energy < 20) {
            showAchievement('Insufficient Energy', 'Need 20 energy for slingshot');
        } else if (gameState.slingshot.active) {
            showAchievement('Slingshot Active', 'Already in slingshot maneuver');
        }
    }
}
        // ADD THIS: Auto-leveling toggle
if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    
    // Initialize auto-leveling state if it doesn't exist
    if (typeof gameState.autoLevelingEnabled === 'undefined') {
        gameState.autoLevelingEnabled = false; // Default to disabled
    }
    
    // Toggle the setting
    gameState.autoLevelingEnabled = !gameState.autoLevelingEnabled;
    
    // Show feedback
    if (typeof showAchievement === 'function') {
        showAchievement(
    gameState.autoLevelingEnabled ? 'Auto-Leveling ON' : 'Auto-Leveling OFF',
    gameState.autoLevelingEnabled ? 'Both roll and pitch level after 6 seconds' : 'Full manual flight control'
);
    }
    
    console.log('Auto-leveling toggled:', gameState.autoLevelingEnabled ? 'ON' : 'OFF');
}
    });
    
    document.addEventListener('keyup', (e) => {
        // Don't process if paused
        if (gamePaused) return;
        
        const key = e.key.toLowerCase();
        if (key === 'w') keys.w = false;
        if (key === 'a') keys.a = false;
        if (key === 's') keys.s = false;
        if (key === 'd') keys.d = false;
        if (key === 'q') keys.q = false;
        if (key === 'e') keys.e = false;
        if (key === 'o') keys.o = false;
       if (e.key === ' ') {
           keys.space = false;
           // Space bar now fires weapon - no additional keyup logic needed
       }
        if (e.key === 'Alt' || e.altKey) {
            keys.alt = false;
            // FIXED: Alt key up only affects target lock state, no weapon or navigation effects
        }
        if (e.key === 'Alt' || e.altKey) {
            keys.alt = false;
        }
        if (key === 'x') keys.x = false;
        if (key === 'b') keys.b = false;
        
        if (e.key === 'ArrowUp') keys.up = false;
        if (e.key === 'ArrowDown') keys.down = false;
        if (e.key === 'ArrowLeft') keys.left = false;
        if (e.key === 'ArrowRight') keys.right = false;
    });
    
    // Rest of the event listeners remain the same...
    // [Include the rest of your event listeners here]
    
    console.log('✅ Enhanced event listeners setup complete');
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
    
    // Allow planet card clicks to work properly
    const planetCard = e.target.closest('.planet-card');
    if (planetCard) {
        console.log('🎯 Planet card click detected in main handler!');
        return;
    }
    
    // ENHANCED: Mouse aiming for asteroids and enemies
    const rect = renderer.domElement.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
    
    // Check for asteroid hits first
    const asteroidTargets = activePlanets.filter(planet => 
        planet.userData.type === 'asteroid' && 
        camera.position.distanceTo(planet.position) < 200
    );
    
    const asteroidIntersects = raycaster.intersectObjects(asteroidTargets);
    
    if (asteroidIntersects.length > 0) {
    const asteroid = asteroidIntersects[0].object;
    console.log('🎯 Asteroid targeted with mouse!');
    
    // Fire weapon at asteroid with correct position
    fireWeaponAtTarget(asteroid.position.clone());
    
    // Destroy asteroid with explosion
    createExplosionEffect(asteroid.position.clone());
    
    // Properly destroy the asteroid - inline implementation
    scene.remove(asteroid);
    
    // Remove from planets array
    const planetIndex = planets.indexOf(asteroid);
    if (planetIndex > -1) planets.splice(planetIndex, 1);
    
    // Remove from active planets if present
    const activeIndex = activePlanets.indexOf(asteroid);
    if (activeIndex > -1) activePlanets.splice(activeIndex, 1);
    
    // Clear any target references
    if (gameState.targetLock.target === asteroid) {
        gameState.targetLock.target = null;
    }
    if (gameState.currentTarget === asteroid) {
        gameState.currentTarget = null;
    }
    
    // Play destroy sound
    if (typeof playSound === 'function') {
        playSound('explosion');
    }
    
    // Show achievement
    if (typeof showAchievement === 'function') {
        showAchievement('Asteroid Destroyed!', 'Direct hit!');
    }
    
    return;
}
    
    // Check for enemy hits
    const enemyIntersects = raycaster.intersectObjects(enemies);
    if (enemyIntersects.length > 0) {
        const enemy = enemyIntersects[0].object;
        console.log('🎯 Enemy targeted with mouse!');
        fireWeaponAtTarget(enemy.position);
        return;
    }
    
    // Regular weapon fire if no specific target
    fireWeapon();
});

// Enhanced weapon firing at specific targets
function fireWeaponAtTarget(targetPosition) {
    if (gameState.weapons.cooldown > 0) return;
    
    resumeAudioContext();
    createLaserBeam(camera.position, targetPosition, '#00ff00', true);
    
    if (typeof playSound === 'function') {
        playSound('weapon', 800, 0.1);
    }
    
    gameState.weapons.cooldown = 200; // 200ms cooldown
    gameState.energy = Math.max(0, gameState.energy - 2);
    
    setTimeout(() => {
        gameState.weapons.cooldown = 0;
    }, 200);
}
    
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
    
    console.log('✅ Enhanced event listeners setup complete');

function checkWeaponHits(targetPosition) {
    
    // Check asteroid hits (if they exist)
    if (typeof planets !== 'undefined') {
        for (let i = planets.length - 1; i >= 0; i--) {
            const asteroid = planets[i];
            if (asteroid.userData.type === 'asteroid' && asteroid.userData.health > 0) {
                const distance = asteroid.position.distanceTo(targetPosition);
                if (distance < hitRadius) {
                    asteroid.userData.health -= 1;
                    
                    createExplosionEffect(asteroid.position, 0xffaa00, 10);
                    showAchievement('Asteroid Hit!', `Damaged ${asteroid.userData.name}`);
                    playSound('hit');
                    
                    if (asteroid.userData.health <= 0) {
                        createExplosionEffect(asteroid.position.clone(), 0xff6600, 15);
                        showAchievement('Asteroid Destroyed!', `${asteroid.userData.name} eliminated`);
                        playSound('explosion');
                        
                        // Remove asteroid
                        scene.remove(asteroid);
                        planets.splice(i, 1);
                        
                        const activeIndex = activePlanets.indexOf(asteroid);
                        if (activeIndex > -1) {
                            activePlanets.splice(activeIndex, 1);
                        }
                        
                        if (asteroid.geometry) asteroid.geometry.dispose();
                        if (asteroid.material) asteroid.material.dispose();
                        
                        if (gameState.currentTarget === asteroid) {
                            gameState.currentTarget = null;
                        }
                    }
                }
            }
        }
    }
}
    
function checkGalaxyClear() {
    // Safety check for enemies array
    if (typeof enemies === 'undefined' || typeof gameState === 'undefined') return;
    
    // Ensure currentGalaxyEnemies array exists
    if (!gameState.currentGalaxyEnemies) {
        gameState.currentGalaxyEnemies = [0, 0, 0, 0, 0, 0, 0, 0];
    }
    
    // Count remaining enemies in current galaxy
    const nearbyEnemies = enemies.filter(enemy => 
        enemy.userData && enemy.userData.health > 0 && 
        camera.position.distanceTo(enemy.position) < 5000
    );
    
    if (nearbyEnemies.length === 0) {
        gameState.galaxiesCleared = (gameState.galaxiesCleared || 0) + 1;
        showAchievement('Galaxy Cleared!', `Galaxy ${gameState.galaxiesCleared} liberated!`);
        
        // ADDED: Fireworks effect when galaxy is cleared
        createFireworksEffect();
        for (let i = 0; i < 3; i++) {
            setTimeout(() => createFireworksEffect(), i * 500);
        }
        
        // Refresh difficulty for next galaxy
        if (typeof refreshEnemyDifficulty === 'function') {
            refreshEnemyDifficulty();
        }
        
        // Check for game completion
        if (gameState.galaxiesCleared >= 8) {
            showAchievement('Victory!', 'All galaxies cleared! Universe saved!');
            
            // ADDED: Extra fireworks for victory
            for (let i = 0; i < 10; i++) {
                setTimeout(() => createFireworksEffect(), i * 300);
            }
            
            if (typeof playVictoryMusic === 'function') {
                playVictoryMusic();
            }
            
            // Show victory screen after a delay
            setTimeout(() => {
                if (typeof showVictoryScreen === 'function') {
                    showVictoryScreen();
                }
            }, 3000);
        }
    }
}

// Add this new function right after checkGalaxyClear
function createFireworksEffect(position) {
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff, 0xff8800];
    const particleCount = 50;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'firework-particle';
        particle.style.cssText = `
            position: fixed !important;
            width: 4px;
            height: 4px;
            background: #${colors[Math.floor(Math.random() * colors.length)].toString(16).padStart(6, '0')};
            left: 50%;
            top: 50%;
            pointer-events: none !important;
            z-index: 1000 !important;
            border-radius: 50% !important;
            box-shadow: 0 0 6px currentColor;
        `;
        document.body.appendChild(particle);
        
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
        const velocity = 5 + Math.random() * 10;
        const vx = Math.cos(angle) * velocity;
        const vy = Math.sin(angle) * velocity;
        const gravity = 0.2;
        
        let x = 0, y = 0, velocityY = vy;
        let opacity = 1;
        let scale = 1;
        
        const animate = () => {
            x += vx;
            y += velocityY;
            velocityY += gravity; // Add gravity effect
            opacity -= 0.015;
            scale += 0.02;
            
            particle.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
            particle.style.opacity = opacity;
            
            if (opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                particle.remove();
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    // Add a bright flash effect
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: radial-gradient(circle at center, rgba(255,255,255,0.3), transparent 70%);
        pointer-events: none;
        z-index: 999;
        opacity: 0;
        animation: fireworkFlash 0.5s ease-out;
    `;
    document.body.appendChild(flash);
    
    // Add animation if not already present
    if (!document.getElementById('fireworkFlashStyle')) {
        const style = document.createElement('style');
        style.id = 'fireworkFlashStyle';
        style.textContent = `
            @keyframes fireworkFlash {
                0% { opacity: 0; }
                50% { opacity: 1; }
                100% { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    setTimeout(() => flash.remove(), 500);
    
    // Play celebration sound
    if (typeof playSound === 'function') {
        playSound('achievement');
    }
}
function fireWeapon() {
    // Faster weapon cooldown (RESTORED)
    if (gameState.weapons.cooldown > 0 || gameState.weapons.energy < 10) return;
    
    gameState.weapons.cooldown = 200; // Even faster: 0.2 seconds
    gameState.weapons.energy = Math.max(0, gameState.weapons.energy - 10);
    
    // Enhanced targeting with doubled ranges
    let targetObject = null;
    let targetPosition;
    
    if (gameState.targetLock.active && gameState.targetLock.target) {
        // Auto-aim at locked target
        targetPosition = gameState.targetLock.target.position.clone();
        targetObject = gameState.targetLock.target;
        
        // Apply damage if target is enemy or asteroid
        if (targetObject.userData.type === 'enemy' && targetObject.userData.health > 0) {
            targetObject.userData.health -= 1;
            updateEnemyVisualHealth(targetObject);
            
            if (targetObject.userData.health <= 0) {
                // Enemy destroyed
                createExplosionEffect(targetObject.position.clone());
                showAchievement('Enemy Destroyed!', `${targetObject.userData.name} eliminated!`);
                playSound('explosion');
                
                // Check for boss victory
                if (targetObject.userData.isBoss && typeof checkBossVictory === 'function') {
                    checkBossVictory(targetObject);
                }
                
                // Remove enemy
                scene.remove(targetObject);
                const index = enemies.indexOf(targetObject);
                if (index > -1) enemies.splice(index, 1);
                
                // Clear target lock
                gameState.targetLock.target = null;
                
                // Check for galaxy clear
                if (typeof checkGalaxyClear === 'function') {
                    checkGalaxyClear();
                }
             } else {
                    // Enemy damaged but not destroyed - NO EXPLOSION, just hit effects
                    flashEnemyHit(targetObject);
                    showAchievement('Target Hit!', `${targetObject.userData.name} damaged!`);
                    playSound('hit');
                }
        } else if (targetObject.userData.type === 'asteroid' && targetObject.userData.health > 0) {
            targetObject.userData.health -= 1;
            
            if (targetObject.userData.health <= 0) {
                // Asteroid destroyed
                createExplosionEffect(targetObject.position.clone(), 0xff6600, 15);
                showAchievement('Asteroid Destroyed!', `${targetObject.userData.name} eliminated`);
                playSound('explosion');
                
                // ADDED: Restore hull when asteroid destroyed
                gameState.hull = Math.min(gameState.maxHull, gameState.hull + 5);
                showAchievement('Hull Repaired', '+5 Hull from asteroid minerals');
                
               // Properly remove asteroid - inline implementation
                    scene.remove(targetObject);
                    
                    // Remove from planets array
                    const planetIndex = planets.indexOf(targetObject);
                    if (planetIndex > -1) planets.splice(planetIndex, 1);
                    
                    // Remove from active planets if present
                    const activeIndex = activePlanets.indexOf(targetObject);
                    if (activeIndex > -1) activePlanets.splice(activeIndex, 1);
                    
                    // Clear any target references
                    if (gameState.targetLock.target === targetObject) {
                        gameState.targetLock.target = null;
                    }
                    if (gameState.currentTarget === targetObject) {
                        gameState.currentTarget = null;
                    }
                
                // Clear target lock
                gameState.targetLock.target = null;
            } else {
                // Asteroid damaged but not destroyed
                createExplosionEffect(targetObject.position.clone(), 0xffaa00, 10);
                showAchievement('Asteroid Hit!', `Damaged ${targetObject.userData.name}`);
                playSound('hit');
            }
        }
    } else {
        // Manual aiming using crosshair position
        const mousePos = new THREE.Vector2(
            (gameState.crosshairX / window.innerWidth) * 2 - 1,
            -(gameState.crosshairY / window.innerHeight) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePos, camera);
        
        // FIXED: Check for asteroid hits with proper targeting
        let asteroidIntersects = [];
        if (typeof activePlanets !== 'undefined' && activePlanets.length > 0) {
            const nearbyAsteroids = activePlanets.filter(planet => 
                planet.userData.type === 'asteroid' && 
                planet.userData.health > 0 && 
                camera.position.distanceTo(planet.position) < 1000
            );
            
            if (nearbyAsteroids.length > 0) {
                asteroidIntersects = raycaster.intersectObjects(nearbyAsteroids);
            }
        }
        
        // Check for enemy hits
        let enemyIntersects = [];
        if (typeof enemies !== 'undefined' && enemies.length > 0) {
            const nearbyEnemies = enemies.filter(enemy => 
                enemy.userData.health > 0 && 
                camera.position.distanceTo(enemy.position) < 1000
            );
            
            if (nearbyEnemies.length > 0) {
                enemyIntersects = raycaster.intersectObjects(nearbyEnemies);
            }
        }

        // Prioritize enemies over asteroids, then by distance
        if (enemyIntersects.length > 0) {
            targetPosition = enemyIntersects[0].point;
            targetObject = enemyIntersects[0].object;
            console.log('🎯 Enemy targeted with raycaster!');
            
            // FIXED: Apply damage to enemy immediately
            if (targetObject.userData.health > 0) {
                targetObject.userData.health -= 1;
                updateEnemyVisualHealth(targetObject);
                
                if (targetObject.userData.health <= 0) {
                    // Enemy destroyed
                    createExplosionEffect(targetObject.position.clone());
                    showAchievement('Enemy Destroyed!', `${targetObject.userData.name} eliminated!`);
                    playSound('explosion');
                    
                    // Check for boss victory
                    if (targetObject.userData.isBoss && typeof checkBossVictory === 'function') {
                        checkBossVictory(targetObject);
                    }
                    
                    // Remove enemy
                    scene.remove(targetObject);
                    const index = enemies.indexOf(targetObject);
                    if (index > -1) enemies.splice(index, 1);
                    
                    // Check for galaxy clear
                    if (typeof checkGalaxyClear === 'function') {
                        checkGalaxyClear();
                    }
               } else {
                // Enemy damaged but not destroyed - NO EXPLOSION, just hit effects
                flashEnemyHit(targetObject);
                showAchievement('Target Hit!', `${targetObject.userData.name} damaged!`);
                playSound('hit');
            }
            }
            
        } else if (asteroidIntersects.length > 0) {
            targetPosition = asteroidIntersects[0].point;
            targetObject = asteroidIntersects[0].object;
            console.log('🎯 Asteroid targeted with raycaster!');
            
            // FIXED: Properly damage and destroy asteroid
            if (targetObject.userData.health > 0) {
                targetObject.userData.health -= 1;
                
                if (targetObject.userData.health <= 0) {
                    // Asteroid destroyed
                    createExplosionEffect(targetObject.position.clone(), 0xff6600, 15);
                    showAchievement('Asteroid Destroyed!', `${targetObject.userData.name} eliminated`);
                    playSound('explosion');
                    
                    // ADDED: Restore hull when asteroid destroyed
                    gameState.hull = Math.min(gameState.maxHull, gameState.hull + 5);
                    showAchievement('Hull Repaired', '+5 Hull from asteroid minerals');
                    
                    // Properly remove asteroid
                    if (typeof destroyAsteroid === 'function') {
                        destroyAsteroid(targetObject);
                    }
                } else {
                    // Asteroid damaged but not destroyed
                    createExplosionEffect(targetObject.position.clone(), 0xffaa00, 10);
                    showAchievement('Asteroid Hit!', `Damaged ${targetObject.userData.name}`);
                    playSound('hit');
                }
            }
            
        } else {
            // No target - fire in the direction of the crosshair
            const direction = raycaster.ray.direction.clone();
            targetPosition = camera.position.clone().add(direction.multiplyScalar(1000));
        }
    }
    
    // Create weapon effect (RESTORED: Uses corrected laser beam)
    createLaserBeam(camera.position, targetPosition, '#00ff96', true);
    
    // Start cooldown countdown
    const cooldownInterval = setInterval(() => {
        gameState.weapons.cooldown -= 50;
        if (gameState.weapons.cooldown <= 0) {
            gameState.weapons.cooldown = 0;
            clearInterval(cooldownInterval);
        }
        if (typeof updateUI === 'function') updateUI();
    }, 50);
    
    // Recharge weapon energy slowly
    if (gameState.weapons.energy < 100) {
        const rechargeInterval = setInterval(() => {
            if (gameState.weapons.energy < 100) {
                gameState.weapons.energy = Math.min(100, gameState.weapons.energy + 2);
                if (typeof updateUI === 'function') updateUI();
            } else {
                clearInterval(rechargeInterval);
            }
        }, 100);
    }
    
    if (typeof updateUI === 'function') updateUI();
    playSound('weapon');
}

// =============================================================================
// PAUSE SYSTEM
// =============================================================================

function togglePause() {
    gamePaused = !gamePaused;
    
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
    
    pauseOverlay.style.display = gamePaused ? 'flex' : 'none';
    
    // Update pause button
    const pauseBtn = document.getElementById('pauseBtn');
    const pauseIcon = document.getElementById('pauseIcon');
    if (pauseBtn) {
        if (gamePaused) {
            pauseBtn.classList.add('paused');
            if (pauseIcon) pauseIcon.className = 'fas fa-play mr-1';
        } else {
            pauseBtn.classList.remove('paused');
            if (pauseIcon) pauseIcon.className = 'fas fa-pause mr-1';
        }
    }
    
    console.log(gamePaused ? 'Game paused' : 'Game resumed');
}
// =============================================================================
// ACHIEVEMENT SYSTEM
// =============================================================================

function showAchievement(title, description, playAchievementSound = true) {
    // FIXED: Suppress achievements during black hole warp
    if (typeof gameState !== 'undefined' && gameState.isWarping) {
        console.log(`Achievement suppressed during warp: ${title} - ${description}`);
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
        'Victory!',
        'Enemy Destroyed!',
        'Hull Repaired',
        'Asteroid Destroyed!'
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
        
        // Ensure high z-index to appear above tutorial
        popup.style.zIndex = '999'; // Maximum priority
        popup.classList.remove('hidden');
        
        // Longer display time for boss victories and important achievements
        const isImportant = alwaysCritical.includes(title);
        const displayTime = isImportant ? 6000 : 4000; // 6 seconds for important, 4 for others
        
        // Auto-hide after appropriate time
        setTimeout(() => popup.classList.add('hidden'), displayTime);
        
        console.log(`Achievement: ${title} - ${description}`);
    }
    
    // Play achievement sound if not in tutorial or if it's critical
    if (playAchievementSound && (!tutorialActive || alwaysCritical.includes(title))) {
        playSound('achievement');
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
    
    // Get targetable objects
    const allTargets = [];
    
    // Add planets (excluding asteroids from navigation)
    if (typeof planets !== 'undefined') {
        const targetablePlanets = planets.filter(p => p.userData.name !== 'Earth' && p.userData.type !== 'asteroid');
        allTargets.push(targetablePlanets);
    }
    
    // Add wormholes
    if (typeof wormholes !== 'undefined') {
        const detectedWormholes = wormholes.filter(w => w.userData.detected);
        allTargets.push(detectedWormholes);
    }
    
    // Add comets
    if (typeof comets !== 'undefined') {
        const nearbyComets = comets.filter(c => camera.position.distanceTo(c.position) < 4000);
        allTargets.push(nearbyComets);
    }
    
    // Add enemies
    if (typeof enemies !== 'undefined') {
        const aliveEnemies = enemies.filter(e => e.userData.health > 0 && camera.position.distanceTo(e.position) < 2000);
        allTargets.push(aliveEnemies);
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

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function createDeathEffect() {
    // ADDED: Awesome cyberpunk explosion before game over
    createPlayerExplosion();
    
    // Delay game over screen to show explosion
    setTimeout(() => {
        if (typeof gameOver !== 'undefined') {
            gameOver('Hull integrity critical - ship destroyed!');
        } else {
            showAchievement('GAME OVER', 'Ship destroyed - mission failed!');
        }
    }, 2000);
}

function createPlayerExplosion() {
    // Play explosion sound
    if (typeof playSound === 'function') {
        playSound('explosion');
        setTimeout(() => playSound('damage'), 200);
        setTimeout(() => playSound('explosion'), 400);
    }
    
    // Create multiple explosion effects
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20
            );
            const explosionPos = camera.position.clone().add(offset);
            createExplosionEffect(explosionPos, 0xff0000, 30);
        }, i * 200);
    }
    
    // Screen flash effect
    const flashOverlay = document.createElement('div');
    flashOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: radial-gradient(circle, rgba(255,100,0,0.8), rgba(255,0,0,0.4));
        z-index: 100;
        pointer-events: none;
        animation: explosionFlash 2s ease-out forwards;
    `;
    document.body.appendChild(flashOverlay);
    
    // Add animation style
    const style = document.createElement('style');
    style.textContent = `
        @keyframes explosionFlash {
            0% { opacity: 0; }
            10% { opacity: 1; }
            100% { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => flashOverlay.remove(), 2000);
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
    console.log('🎮 initControls function called');
    
    try {
        if (typeof setupEnhancedEventListeners === 'function') {
            setupEnhancedEventListeners();
            console.log('✅ Event listeners initialized');
        } else {
            console.warn('⚠️ setupEnhancedEventListeners not found');
        }
        
        if (typeof initAudio === 'function') {
            initAudio();
            console.log('✅ Audio initialized');
        }
        
        setTimeout(() => {
            if (typeof startTutorial === 'function') {
                startTutorial();
                console.log('✅ Tutorial started');
            }
        }, 1000);
        
    } catch (error) {
        console.error('❌ Error in initControls:', error);
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
// TARGET ORIENTATION FUNCTIONS - RESTORED
// =============================================================================

function orientTowardsTarget(target) {
    if (!target || typeof camera === 'undefined' || typeof cameraRotation === 'undefined') return false;
    
    const direction = new THREE.Vector3().subVectors(target.position, camera.position).normalize();
    
    const targetRotationY = Math.atan2(-direction.x, -direction.z);
    const targetRotationX = Math.asin(direction.y);
    
    const rotLerpFactor = 0.05;
    const deltaY = targetRotationY - cameraRotation.y;
    const deltaX = targetRotationX - cameraRotation.x;
    
    let adjustedDeltaY = deltaY;
    if (Math.abs(deltaY) > Math.PI) {
        adjustedDeltaY = deltaY > 0 ? deltaY - 2 * Math.PI : deltaY + 2 * Math.PI;
    }
    
    cameraRotation.y += adjustedDeltaY * rotLerpFactor;
    cameraRotation.x += deltaX * rotLerpFactor;
    
    const orientationThreshold = 0.087; // About 5 degrees
    const isOriented = Math.abs(adjustedDeltaY) < orientationThreshold && Math.abs(deltaX) < orientationThreshold;
    
    return isOriented;
}

function executeSlingshot() {
    if (typeof gameState === 'undefined') return;
    
    let nearestPlanet = null;
    let nearestDistance = Infinity;
    
    // Check both activePlanets and planets arrays for better planet detection
    const planetsToCheck = [];
    if (typeof activePlanets !== 'undefined') {
        planetsToCheck.push(...activePlanets);
    }
    if (typeof planets !== 'undefined') {
        planetsToCheck.push(...planets.filter(p => !planetsToCheck.includes(p)));
    }
    
    planetsToCheck.forEach(planet => {
        // Skip asteroids and other non-planetary objects
        if (!planet.userData || planet.userData.type === 'asteroid') return;
        
        const distance = camera.position.distanceTo(planet.position);
        if (distance < 60 && distance < nearestDistance) { // DOUBLED from 30
            nearestPlanet = planet;
            nearestDistance = distance;
        }
    });
    
    if (nearestPlanet && gameState.energy >= 20 && !gameState.slingshot.active) {
        const planetMass = nearestPlanet.userData.mass || 1;
        const planetRadius = nearestPlanet.geometry ? 
            (nearestPlanet.geometry.parameters ? nearestPlanet.geometry.parameters.radius : 10) : 10;
        
        gameState.slingshot = {
            active: true,
            planet: nearestPlanet,
            entryVelocity: gameState.velocityVector.clone(),
            phase: 'approach',
            startTime: Date.now()
        };
        
        gameState.energy = Math.max(0, gameState.energy - 20);
        
        showAchievement('Gravitational Slingshot', `Engaging ${nearestPlanet.userData.name} gravity assist`);
        playSound('warp');
        
        if (typeof updateUI === 'function') updateUI();
    } else if (!nearestPlanet) {
        showAchievement('No Planet in Range', 'Move closer to a planet to execute slingshot');
    } else if (gameState.energy < 20) {
        showAchievement('Insufficient Energy', 'Need 20+ energy for gravitational slingshot');
    } else if (gameState.slingshot.active) {
        showAchievement('Slingshot Active', 'Already performing gravitational maneuver');
    }
}

// Add this function that was referenced but not defined
function updateCrosshairForAsteroids() {
    // This function updates crosshair when asteroids are targeted
    // It's called from the animation loop but was missing
    const crosshair = document.getElementById('crosshair');
    if (!crosshair || !gameState || !camera) return;
    
    // Check if we're aiming at an asteroid
    const mousePos = new THREE.Vector2(
        (gameState.crosshairX / window.innerWidth) * 2 - 1,
        -(gameState.crosshairY / window.innerHeight) * 2 + 1
    );
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mousePos, camera);
    
    // Check for asteroid intersections
    if (typeof activePlanets !== 'undefined') {
        const asteroids = activePlanets.filter(p => p.userData.type === 'asteroid');
        const intersects = raycaster.intersectObjects(asteroids);
        
        if (intersects.length > 0) {
            crosshair.classList.add('asteroid-targeted');
        } else {
            crosshair.classList.remove('asteroid-targeted');
        }
    }
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
    window.checkWeaponHits = checkWeaponHits; // ← ALREADY ADDED
    
    // Audio systems
    window.playSound = playSound;
    window.toggleMusic = toggleMusic;
    window.resumeAudioContext = resumeAudioContext;
    window.playVictoryMusic = playVictoryMusic;
    window.playBlackHoleWarpSound = playBlackHoleWarpSound;
    window.playEnhancedBlackHoleWarpSound = playEnhancedBlackHoleWarpSound;
    
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
    window.destroyAsteroid = destroyAsteroid;
    window.toggleAutoNavigate = toggleAutoNavigate;
    window.updateCrosshairForAsteroids = updateCrosshairForAsteroids;
    
    // TARGET ORIENTATION FUNCTIONS - ADD THESE
    window.orientTowardsTarget = orientTowardsTarget; // ← ADD THIS
    window.executeSlingshot = executeSlingshot; // ← ADD THIS
    
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
    
    console.log('✅ Enhanced Game Controls loaded - All functions exported');
}

console.log('🏁 Game Controls script completed successfully!');