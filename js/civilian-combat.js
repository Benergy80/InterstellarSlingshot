// Civilian Combat System - Enemies attack civilians, distress calls, civilian destruction
// Created for gameplay improvements - enemies now attack trade ships and mining vessels

// Track active distress calls
const activeDistressCalls = [];
const DISTRESS_DETECTION_RANGE = 5000; // Distance player can detect distress
const CIVILIAN_DESTRUCTION_HITS = 8;

// Make distressed civilians flee from their attackers
function _updateCivilianFleeing() {
    if (typeof tradingShips === 'undefined' || typeof THREE === 'undefined') return;
    const now = Date.now();
    for (let i = 0; i < tradingShips.length; i++) {
        const ship = tradingShips[i];
        if (!ship || !ship.userData || ship.userData.destroyed) continue;
        if (!ship.userData.fleeFrom || !ship.userData.fleeUntil) continue;
        if (now > ship.userData.fleeUntil) {
            // Flee timer expired — clear state
            ship.userData.fleeFrom = null;
            ship.userData.fleeUntil = 0;
            ship.userData.distressActive = false;
            continue;
        }
        const attacker = ship.userData.fleeFrom;
        if (!attacker || !attacker.position || (attacker.userData && attacker.userData.health <= 0)) {
            ship.userData.fleeFrom = null;
            continue;
        }
        // Move directly away from attacker at 1.5x normal speed
        const fleeDir = new THREE.Vector3()
            .subVectors(ship.position, attacker.position)
            .normalize();
        const fleeSpeed = (ship.userData.speed || 0.4) * 1.5;
        ship.position.addScaledVector(fleeDir, fleeSpeed);
        // Face the flee direction
        const lookAt = ship.position.clone().add(fleeDir);
        ship.lookAt(lookAt);
    }
}

// Update function to be called from main game loop
function updateCivilianCombat() {
    if (!tradingShips || !enemies) return;

    // Run flee behavior every frame for ships under attack
    _updateCivilianFleeing();

    // Check each enemy for civilian targets
    enemies.forEach(enemy => {
        if (!enemy.userData || enemy.userData.isDead) return;
        
        // 20% chance each frame to consider civilian targets
        if (Math.random() > 0.2) return;
        
        // Find nearby civilians
        const nearbyCivilians = tradingShips.filter(ship => {
            if (!ship || !ship.userData || ship.userData.destroyed) return false;
            const dist = enemy.position.distanceTo(ship.position);
            return dist < 1000; // Within 1000 units
        });
        
        if (nearbyCivilians.length === 0) return;
        
        // Pick random nearby civilian to attack
        const target = nearbyCivilians[Math.floor(Math.random() * nearbyCivilians.length)];
        
        // Attack if close enough
        const distToTarget = enemy.position.distanceTo(target.position);
        if (distToTarget < 200) {
            attackCivilian(enemy, target);
        }
    });
    
    // Update distress calls
    updateDistressCalls();
}

function attackCivilian(enemy, civilian) {
    if (!civilian.userData) civilian.userData = {};

    // Initialize health if not set
    if (civilian.userData.health === undefined) {
        civilian.userData.health = CIVILIAN_DESTRUCTION_HITS;
    }

    // Mark this enemy as a known attacker for flee logic
    civilian.userData.fleeFrom = enemy;
    civilian.userData.fleeUntil = Date.now() + 8000; // Flee for 8s after last attack
    civilian.userData.distressActive = true;
    civilian.userData.showOnMap = true; // Force onto galactic radar

    // Check attack cooldown
    const now = Date.now();
    if (!enemy.userData.lastCivilianAttack) enemy.userData.lastCivilianAttack = 0;
    if (now - enemy.userData.lastCivilianAttack < 2000) return; // 2s cooldown

    enemy.userData.lastCivilianAttack = now;

    // Damage civilian
    civilian.userData.health--;
    
    // Create distress call if not already active
    if (!civilian.userData.distressActive) {
        createDistressCall(civilian);
    }
    
    // Destroy if health depleted
    if (civilian.userData.health <= 0) {
        destroyCivilian(civilian);
    }
}

function createDistressCall(civilian) {
    civilian.userData.distressActive = true;
    civilian.userData.distressTime = Date.now();
    
    const distressCall = {
        civilian: civilian,
        position: civilian.position.clone(),
        startTime: Date.now(),
        name: civilian.userData.name || 'Civilian Vessel'
    };
    
    activeDistressCalls.push(distressCall);
    
    // Check if player is in range
    if (typeof camera !== 'undefined') {
        const distToPlayer = civilian.position.distanceTo(camera.position);
        if (distToPlayer < DISTRESS_DETECTION_RANGE) {
            if (typeof showAchievement === 'function') {
                showAchievement('DISTRESS CALL DETECTED', 
                    `${distressCall.name} under attack! Distance: ${(distToPlayer/1000).toFixed(1)}Mm`);
            }
        }
    }
}

function destroyCivilian(civilian) {
    civilian.userData.destroyed = true;
    
    // Create explosion
    if (typeof createExplosion === 'function') {
        createExplosion(civilian.position, 'small');
    }
    
    // Remove from scene
    if (typeof scene !== 'undefined' && scene.remove) {
        scene.remove(civilian);
    }
    
    // Remove from tracking arrays
    const shipIndex = tradingShips.indexOf(civilian);
    if (shipIndex !== -1) {
        tradingShips.splice(shipIndex, 1);
    }
    
    // Alert player if nearby
    if (typeof camera !== 'undefined') {
        const distToPlayer = civilian.position.distanceTo(camera.position);
        if (distToPlayer < 2000) {
            if (typeof showAchievement === 'function') {
                showAchievement('CIVILIAN DESTROYED', 
                    `${civilian.userData.name || 'Civilian vessel'} has been destroyed`);
            }
        }
    }
    
    // Remove distress call
    const callIndex = activeDistressCalls.findIndex(call => call.civilian === civilian);
    if (callIndex !== -1) {
        activeDistressCalls.splice(callIndex, 1);
    }
}

function updateDistressCalls() {
    if (typeof camera === 'undefined') return;

    const now = Date.now();

    // Check each distress call
    for (let i = activeDistressCalls.length - 1; i >= 0; i--) {
        const call = activeDistressCalls[i];

        // Remove if civilian destroyed or call too old (5 minutes)
        if (!call.civilian || call.civilian.userData.destroyed ||
            (now - call.startTime) > 300000) {
            activeDistressCalls.splice(i, 1);
            continue;
        }

        // Check if player enters range
        const distToPlayer = call.civilian.position.distanceTo(camera.position);
        if (distToPlayer < DISTRESS_DETECTION_RANGE && !call.playerNotified) {
            call.playerNotified = true;
            if (typeof showAchievement === 'function') {
                showAchievement('DISTRESS CALL DETECTED',
                    `${call.name} under attack! Distance: ${(distToPlayer/1000).toFixed(1)}Mm`);
            }
        }

        // ── Rescue check ─────────────────────────────────────────────────
        // If the caravan has already called for help AND no live enemy is
        // threatening it anymore (everyone within 600 u cleared), the
        // player has successfully rescued the caravan.  Trigger the
        // thank-you transmission + full resupply ONCE per distress call.
        if (call.playerNotified && !call.rescueTriggered) {
            const threatRange = 600; // generous — threats beyond this aren't "attacking"
            let threatPresent = false;
            if (typeof enemies !== 'undefined') {
                for (let j = 0; j < enemies.length; j++) {
                    const e = enemies[j];
                    if (!e || !e.userData || e.userData.health <= 0) continue;
                    if (call.civilian.position.distanceTo(e.position) < threatRange) {
                        threatPresent = true;
                        break;
                    }
                }
            }
            // Player must also be reasonably close — they earned the rescue
            if (!threatPresent && distToPlayer < DISTRESS_DETECTION_RANGE) {
                call.rescueTriggered = true;
                triggerCaravanRescue(call);
            }
        }
    }
}

// Player defended the caravan — thank-you transmission + full resupply.
function triggerCaravanRescue(call) {
    const name = call.name || 'Civilian vessel';

    // Full resupply: hull, energy, missiles, and emergency warps maxed
    if (typeof gameState !== 'undefined') {
        if (gameState.maxHull) gameState.hull = gameState.maxHull;
        else                   gameState.hull = 100;
        gameState.energy = 100;
        if (gameState.weapons) gameState.weapons.energy = 100;
        if (gameState.missiles) gameState.missiles.current = gameState.missiles.capacity || 3;
        if (gameState.emergencyWarp) {
            gameState.emergencyWarp.available = gameState.emergencyWarp.maxWarps || 5;
        }
    }

    // Notification banner
    if (typeof showAchievement === 'function') {
        showAchievement('🛡️ CARAVAN RESCUED',
            `${name} saved! Full resupply: hull, energy, missiles, warps`);
    }

    // Thank-you transmission from the caravan
    if (typeof showIncomingTransmission === 'function') {
        const message =
            `Thank you, Captain! You saved our lives!\n\n` +
            `We will transfer supplies to you immediately.\n` +
            `Hull, shields, missiles and emergency warp drives have all been fully restored.\n\n` +
            `Safe travels, and may fortune favor you.`;
        // Use 3-arg form so it matches the game-objects.js transmission UI
        try {
            showIncomingTransmission(`${name} — RESCUED`, message, 0x00ff88);
        } catch (_) {
            // Fallback to 2-arg form if the game-objects version is active
            try { showIncomingTransmission(`${name}`, message); } catch (__) {}
        }
    }

    if (typeof playSound === 'function') {
        try { playSound('achievement', 900, 0.25); } catch (_) {}
    }
}

// Add civilians to map when nearby
function updateCivilianMapDisplay() {
    if (typeof camera === 'undefined' || !tradingShips) return;
    
    tradingShips.forEach(ship => {
        if (!ship || !ship.userData || ship.userData.destroyed) return;
        
        const distToPlayer = ship.position.distanceTo(camera.position);
        
        // Show on map if within 3000 units
        if (distToPlayer < 3000) {
            ship.userData.showOnMap = true;
        } else {
            ship.userData.showOnMap = false;
        }
    });
}

// Export for use in main game loop
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        updateCivilianCombat,
        updateCivilianMapDisplay,
        activeDistressCalls
    };
}
