// Civilian Combat System - Enemies attack civilians, distress calls, civilian destruction
// Created for gameplay improvements - enemies now attack trade ships and mining vessels

// Track active distress calls
const activeDistressCalls = [];
const DISTRESS_DETECTION_RANGE = 5000; // Distance player can detect distress
// Shared with the SOS screen indicator in game-ui.js — one source of truth
// for how far a distress signal carries.
if (typeof window !== 'undefined') window.DISTRESS_DETECTION_RANGE = DISTRESS_DETECTION_RANGE;
const CIVILIAN_DESTRUCTION_HITS = 8;
const MILITARY_DESTRUCTION_HITS = 14;  // patrol craft are tougher
const CIVILIAN_SHIELD_HP = 5;          // hits the cyan bubble absorbs before hull

// Player-as-attacker proxy: flee/return-fire logic only needs a live
// .position and a health check; camera.position is a live reference.
const _playerAttackerProxy = {
    isPlayerProxy: true,
    get position() { return (typeof camera !== 'undefined') ? camera.position : null; },
    userData: { health: 1 }
};

// Scratch vectors reused across the flee loop so a nebula full of
// fleeing civilians doesn't allocate two THREE.Vector3 per ship per
// frame (this runs at 20Hz over every trading ship).
const _fleeDir = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _fleeLookAt = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

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
        // Move away from the attacker at 1.5x normal speed with an EVASIVE
        // WEAVE — a sinusoidal perpendicular component (per-ship phase) so
        // retreating ships juke instead of flying a straight, easy line.
        _fleeDir.subVectors(ship.position, attacker.position).normalize();
        const weave = Math.sin(now * 0.004 + (ship.id || 0)) * 0.55;
        _fleeDir.x += -_fleeDir.z * weave;
        _fleeDir.z += _fleeDir.x * weave;
        _fleeDir.y += Math.sin(now * 0.0027 + (ship.id || 0) * 1.7) * 0.25;
        _fleeDir.normalize();
        const fleeSpeed = (ship.userData.speed || 0.4) * 1.5;
        ship.position.addScaledVector(_fleeDir, fleeSpeed);
        // Face the flee direction
        _fleeLookAt.copy(ship.position).add(_fleeDir);
        ship.lookAt(_fleeLookAt);
    }
}

// Update function to be called from main game loop
function updateCivilianCombat() {
    if (!tradingShips || !enemies) return;

    // Run flee behavior every frame for ships under attack
    _updateCivilianFleeing();

    // Shield bubble visuals + military return fire
    _updateCivilianShields();
    _updateMilitaryReturnFire();

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
        
        // Attack if close enough (laser range — the attack draws a beam now)
        const distToTarget = enemy.position.distanceTo(target.position);
        if (distToTarget < 500) {
            attackCivilian(enemy, target);
        }
    });
    
    // Update distress calls
    updateDistressCalls();
}

function attackCivilian(enemy, civilian) {
    // Check attack cooldown
    const now = Date.now();
    if (!enemy.userData.lastCivilianAttack) enemy.userData.lastCivilianAttack = 0;
    if (now - enemy.userData.lastCivilianAttack < 2000) return; // 2s cooldown
    enemy.userData.lastCivilianAttack = now;

    // Visible attack: the enemy fires an actual beam at the civilian
    if (typeof createLaserBeam === 'function') {
        try { createLaserBeam(enemy.position.clone(), civilian.position.clone(), '#ff8800', false); } catch (e) {}
    }

    damageCivilianShip(civilian, 1, enemy);
}

// ── SHARED DAMAGE ENTRY POINT ────────────────────────────────────────────
// Every hit on a civilian/military ship — from enemies OR the player —
// routes through here: shields absorb first (non-military), the ship
// flees with evasive weave, civilians raise a distress call (map + screen
// indicator), military ships mark the attacker for return fire.
function damageCivilianShip(ship, damage, attacker) {
    if (!ship || ship.userData === undefined) return;
    const ud = ship.userData;
    if (ud.destroyed || ud._destroyed) return;

    const isMilitary = ud.shipCategory === 'military';
    if (ud.health === undefined) {
        ud.health = isMilitary ? MILITARY_DESTRUCTION_HITS : CIVILIAN_DESTRUCTION_HITS;
    }

    // Flee + evade (military retreats too — but shoots over its shoulder)
    ud.fleeFrom = attacker || null;
    ud.fleeUntil = Date.now() + 8000;
    ud.showOnMap = true;

    // Mining vessels (civilianShips array) flee through their own AI
    // state machine rather than the trading-ship flee loop.
    if (typeof civilianShips !== 'undefined' && civilianShips.indexOf(ship) !== -1 &&
        attacker && attacker.position) {
        ud.aiState = 'fleeing';
        ud.fleeDirection = new THREE.Vector3()
            .subVectors(ship.position, attacker.position).normalize();
        ud.stateTimer = 0;
    }

    if (isMilitary) {
        // Patrol craft return fire while retreating
        ud._returnFireAt = attacker || null;
        ud._returnFireUntil = Date.now() + 12000;
    } else {
        // CIVILIAN SHIELD: cyan bubble absorbs the first hits
        _ensureCivilianShieldBubble(ship);
        if (ud._civShieldHP === undefined) ud._civShieldHP = CIVILIAN_SHIELD_HP;
        // Distress call: map dot pulses + screen indicator + rescue system
        if (!ud.distressActive) createDistressCall(ship);
        ud.distressActive = true;
        if (ud._civShieldHP > 0) {
            ud._civShieldHP -= damage;
            if (ud._shieldMeshCiv) {
                ud._shieldMeshCiv.material.opacity = 0.55; // flash; decays per-frame
            }
            return; // shield ate the hit
        }
    }

    ud.health -= damage;
    if (ud.health <= 0) {
        destroyCivilian(ship);
    }
}

// Cyan shield bubble sized from the ship's visible bounds (lazy, once).
function _ensureCivilianShieldBubble(ship) {
    if (!ship || ship.userData._shieldMeshCiv || typeof THREE === 'undefined' ||
        typeof scene === 'undefined') return;
    let r = 30;
    try {
        const box = new THREE.Box3().setFromObject(ship);
        const s = box.getSize(new THREE.Vector3());
        r = Math.max(15, Math.min(120, Math.max(s.x, s.y, s.z) * 0.62));
    } catch (e) {}
    const ws = new THREE.Vector3(1, 1, 1);
    try { ship.getWorldScale(ws); } catch (e) {}
    const sc = Math.max(0.0001, (Math.abs(ws.x) + Math.abs(ws.y) + Math.abs(ws.z)) / 3);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x66ddff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(r / sc, 16, 12), mat);
    bubble.userData.isGlowLayer = true; // skipped by bbox measurements
    ship.add(bubble);
    ship.userData._shieldMeshCiv = bubble;
}

// Per-frame shield visuals: flash decays toward an idle shimmer while the
// ship is in distress with shield charge left, 0 otherwise.
function _updateCivilianShields() {
    const pools = [];
    if (typeof tradingShips !== 'undefined') pools.push(tradingShips);
    if (typeof civilianShips !== 'undefined') pools.push(civilianShips);
    const now = Date.now();
    for (let p = 0; p < pools.length; p++) {
        const arr = pools[p];
        for (let i = 0; i < arr.length; i++) {
            const ship = arr[i];
            const ud = ship && ship.userData;
            if (!ud || !ud._shieldMeshCiv) continue;
            const idle = (ud.distressActive && (ud._civShieldHP || 0) > 0)
                ? 0.14 + Math.sin(now * 0.005 + i) * 0.05 : 0;
            const mat = ud._shieldMeshCiv.material;
            mat.opacity = Math.max(idle, mat.opacity * 0.93);
        }
    }
}

// ── MILITARY RETURN FIRE ─────────────────────────────────────────────────
// Patrol craft shoot back at their attacker while retreating, and answer
// nearby distress calls by engaging the civilian's attacker.
function _militaryKillEnemy(e) {
    if (!e || !e.userData) return;
    e.userData.health = 0;
    if (typeof createFactionExplosion === 'function' && typeof e.userData.galaxyId === 'number') {
        try { createFactionExplosion(e.position, e.userData.galaxyId, 0.6); } catch (err) {}
    } else if (typeof createExplosionEffect === 'function') {
        try { createExplosionEffect(e.position); } catch (err) {}
    }
    if (typeof scene !== 'undefined') scene.remove(e);
    if (typeof enemies !== 'undefined') {
        const idx = enemies.indexOf(e);
        if (idx > -1) enemies.splice(idx, 1);
    }
}

function _updateMilitaryReturnFire() {
    if (typeof tradingShips === 'undefined') return;
    const now = Date.now();
    for (let i = 0; i < tradingShips.length; i++) {
        const ship = tradingShips[i];
        const ud = ship && ship.userData;
        if (!ud || ud.destroyed || ud.shipCategory !== 'military') continue;

        // Answer nearby distress calls: target the civilian's attacker
        if (!ud._returnFireAt && activeDistressCalls.length &&
            (now - (ud._lastDistressScan || 0)) > 1500) {
            ud._lastDistressScan = now;
            for (let c = 0; c < activeDistressCalls.length; c++) {
                const call = activeDistressCalls[c];
                const civ = call.civilian;
                if (!civ || !civ.userData || !civ.userData.fleeFrom) continue;
                const atk = civ.userData.fleeFrom;
                if (atk.isPlayerProxy) continue; // don't posse up on the player from afar
                if (!atk.userData || atk.userData.health <= 0) continue;
                if (ship.position.distanceTo(civ.position) < 2500) {
                    ud._returnFireAt = atk;
                    ud._returnFireUntil = now + 15000;
                    break;
                }
            }
        }

        const tgt = ud._returnFireAt;
        if (!tgt) continue;
        if (now > (ud._returnFireUntil || 0)) { ud._returnFireAt = null; continue; }
        const tgtPos = tgt.position;
        if (!tgtPos) { ud._returnFireAt = null; continue; }
        if (!tgt.isPlayerProxy && (!tgt.userData || tgt.userData.health <= 0)) {
            ud._returnFireAt = null; continue;
        }
        const dist = ship.position.distanceTo(tgtPos);
        if (dist > 1500) continue;
        if (now - (ud._lastReturnFire || 0) < 1100) continue;
        ud._lastReturnFire = now;

        if (typeof createLaserBeam === 'function') {
            try { createLaserBeam(ship.position.clone(), tgtPos.clone(), '#44ff88', false); } catch (e) {}
        }
        if (Math.random() < 0.6) {
            if (tgt.isPlayerProxy) {
                // Shooting back at the player who attacked them
                const invuln = typeof isBlackHoleWarpInvulnerable === 'function' && isBlackHoleWarpInvulnerable();
                if (!invuln && typeof gameState !== 'undefined' && gameState.hull !== undefined) {
                    const red = typeof getShieldDamageReduction === 'function' ? getShieldDamageReduction() : 0;
                    gameState.hull = Math.max(0, gameState.hull - 2 * (1 - red));
                    if (typeof createEnhancedScreenDamageEffect === 'function') {
                        createEnhancedScreenDamageEffect(ship.position);
                    }
                }
            } else if (tgt.userData) {
                tgt.userData.health -= 2;
                if (typeof flashEnemyHit === 'function') { try { flashEnemyHit(tgt, 2); } catch (e) {} }
                if (tgt.userData.health <= 0) _militaryKillEnemy(tgt);
            }
        }
    }
}

function createDistressCall(civilian) {
    civilian.userData.distressActive = true;
    civilian.userData.distressTime = Date.now();

    // Visible SOS flare rising off the ship
    if (typeof createDistressFlare === 'function') {
        try { createDistressFlare(civilian.position.clone()); } catch (e) {}
    }
    
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
    civilian.userData._destroyed = true; // mining-vessel path checks this flag

    // Create explosion (createExplosion if present, else the standard effect)
    if (typeof createExplosion === 'function') {
        createExplosion(civilian.position, 'small');
    } else if (typeof createExplosionEffect === 'function') {
        try { createExplosionEffect(civilian.position); } catch (e) {}
    }
    if (typeof playSound === 'function') { try { playSound('explosion'); } catch (e) {} }
    
    // Remove from scene
    if (typeof scene !== 'undefined' && scene.remove) {
        scene.remove(civilian);
    }
    
    // Remove from tracking arrays (trading ships AND mining vessels)
    const shipIndex = tradingShips.indexOf(civilian);
    if (shipIndex !== -1) {
        tradingShips.splice(shipIndex, 1);
    }
    if (typeof civilianShips !== 'undefined') {
        const cvIndex = civilianShips.indexOf(civilian);
        if (cvIndex !== -1) civilianShips.splice(cvIndex, 1);
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

    // Notification banner + cinematic card
    if (typeof showAchievement === 'function') {
        showAchievement('🛡️ CARAVAN RESCUED',
            `${name} saved! Full resupply: hull, energy, missiles, warps`);
    }
    if (typeof flashEventText === 'function') {
        flashEventText('CARAVAN RESCUED', '#00ff88', name + ' · full resupply transferred');
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
if (typeof window !== 'undefined') {
    window.damageCivilianShip = damageCivilianShip;
    window._civilianPlayerProxy = _playerAttackerProxy;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        updateCivilianCombat,
        updateCivilianMapDisplay,
        activeDistressCalls
    };
}
