// Game UI - User interface updates, achievements, and map systems
// COMPREHENSIVE REWRITE: Fixed all compatibility issues with game-controls.js and game-physics.js
// Enhanced with doubled world scale and proper system integration
// FIXED: Removed duplicate functions, integrated with tutorial system, improved performance
// COMPLETE: All original functionality preserved with enhanced compatibility

// =============================================================================
// CORE UI UPDATE SYSTEM - ENHANCED INTEGRATION
// =============================================================================

function updateUI() {
    // Safety check for game state
    if (typeof gameState === 'undefined' || !gameState) return;
    
    const velocityEl = document.getElementById('velocity');
    const distanceEl = document.getElementById('distance');
    const energyBarEl = document.getElementById('energyBar');
    const hullBarEl = document.getElementById('hullBar');
    const locationEl = document.getElementById('location');
    const targetInfo = document.getElementById('targetInfo');
    const emergencyWarpEl = document.getElementById('emergencyWarpCount');
    const weaponStatusEl = document.getElementById('weaponStatus');
    const galaxiesClearedEl = document.getElementById('galaxiesCleared');
    const targetLockStatusEl = document.getElementById('targetLockStatus');
    
    // Basic stats updates
    if (velocityEl) velocityEl.textContent = (gameState.velocity * 1000).toFixed(0) + ' km/s';
    if (distanceEl) distanceEl.textContent = gameState.distance.toFixed(1) + ' ly';
    if (energyBarEl) energyBarEl.style.width = gameState.energy + '%';
    if (emergencyWarpEl) emergencyWarpEl.textContent = gameState.emergencyWarp.available.toString();
    if (galaxiesClearedEl) galaxiesClearedEl.textContent = gameState.galaxiesCleared.toString();
    if (locationEl) locationEl.textContent = gameState.location;
    
    // Enhanced hull display with dynamic color coding
if (hullBarEl) {
    const hullPercent = (gameState.hull / gameState.maxHull * 100);
    hullBarEl.style.width = hullPercent + '%';
    
    // Enhanced color coding for hull
    if (gameState.hull < 25) {
        hullBarEl.style.background = 'linear-gradient(90deg, #ff0066 0%, #ff3366 100%)';
    } else if (gameState.hull < 50) {
        hullBarEl.style.background = 'linear-gradient(90deg, #ff6600 0%, #ff9933 100%)';
    } else {
        hullBarEl.style.background = 'linear-gradient(90deg, #ff0066 0%, #ff6600 50%, #00ff66 100%)';
    }
    
    // ADDED: Cracked screen effect at 10% hull
    if (gameState.hull <= 10 && !document.getElementById('criticalDamageOverlay')) {
        const crackedOverlay = document.createElement('div');
        crackedOverlay.id = 'criticalDamageOverlay';
        crackedOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 35;
            background-image: 
                repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(0, 255, 0, 0.03) 2px,
                    rgba(0, 255, 0, 0.03) 4px
                ),
                repeating-linear-gradient(
                    90deg,
                    transparent,
                    transparent 2px,
                    rgba(255, 0, 0, 0.03) 2px,
                    rgba(255, 0, 0, 0.03) 4px
                ),
                radial-gradient(circle at 30% 40%, transparent 20%, rgba(255,0,0,0.1) 50%),
                radial-gradient(circle at 70% 60%, transparent 20%, rgba(255,0,0,0.1) 50%),
                linear-gradient(45deg, transparent 40%, rgba(255,0,0,0.05) 41%, transparent 42%),
                linear-gradient(-45deg, transparent 40%, rgba(255,0,0,0.05) 41%, transparent 42%);
            animation: crtFlicker 0.15s infinite;
        `;
        document.body.appendChild(crackedOverlay);
        
        // Add CSS animation
        if (!document.getElementById('crtFlickerStyle')) {
            const style = document.createElement('style');
            style.id = 'crtFlickerStyle';
            style.textContent = `
                @keyframes crtFlicker {
                    0% { opacity: 0.9; }
                    50% { opacity: 1; }
                    100% { opacity: 0.9; }
                }
            `;
            document.head.appendChild(style);
        }
    } else if (gameState.hull > 10) {
        // Remove cracked screen effect when hull is repaired
        const overlay = document.getElementById('criticalDamageOverlay');
        if (overlay) overlay.remove();
    }
}  // <-- THIS CLOSING BRACE WAS MISSING!
    
    // Enhanced Target Lock status with tutorial awareness
    if (targetLockStatusEl) {
        if (gameState.targetLock && gameState.targetLock.active) {
            if (gameState.targetLock.target) {
                targetLockStatusEl.textContent = 'LOCKED ON TARGET';
                targetLockStatusEl.className = 'text-yellow-400 pulse';
            } else {
                targetLockStatusEl.textContent = 'SEEKING TARGET';
                targetLockStatusEl.className = 'text-orange-400 pulse';
            }
        } else {
            targetLockStatusEl.textContent = 'INACTIVE';
            targetLockStatusEl.className = 'text-gray-400';
        }
    }
    
    // Enhanced weapon status with faster cooldown
    if (weaponStatusEl && gameState.weapons) {
        if (gameState.weapons.cooldown > 0) {
            weaponStatusEl.textContent = 'COOLING DOWN';
            weaponStatusEl.className = 'text-yellow-400';
            gameState.weapons.cooldown = Math.max(0, gameState.weapons.cooldown - 16.67);
        } else if (gameState.weapons.energy < 10) {
            weaponStatusEl.textContent = 'LOW ENERGY';
            weaponStatusEl.className = 'text-red-400';
        } else {
            weaponStatusEl.textContent = 'ARMED';
            weaponStatusEl.className = 'text-green-400';
        }
    }
    
    // Weapon energy regeneration
    if (gameState.weapons && gameState.weapons.energy < 100) {
        gameState.weapons.energy = Math.min(100, gameState.weapons.energy + 0.4); // Faster regeneration
    }
    
    // Enhanced target info with comprehensive status display
    if (targetInfo) {
        let targetInfoText = '';
        let targetInfoClass = 'text-orange-400';
        
        // Tutorial status display - HIGHEST PRIORITY
        if (typeof tutorialSystem !== 'undefined') {
            if (tutorialSystem.active && !tutorialSystem.completed) {
                const tutorialProgress = `TRAINING MODE (${tutorialSystem.currentStep}/${tutorialSystem.messages.length})`;
                targetInfoText = tutorialProgress;
                targetInfoClass = 'text-yellow-400';
            } else if (tutorialSystem.completed) {
                // Show enemies are now active (only for a few seconds after completion)
                const timeSinceCompletion = Date.now() - (tutorialSystem.completionTime || 0);
                if (timeSinceCompletion < 10000) { // Show for 10 seconds after completion
                    targetInfoText = 'HOSTILES NOW ACTIVE!';
                    targetInfoClass = 'text-red-400 pulse';
                }
            }
        }
        
        // Base target information
        if (gameState.currentTarget) {
            const distance = typeof camera !== 'undefined' ? 
                camera.position.distanceTo(gameState.currentTarget.position).toFixed(1) : '0';
            const baseTargetText = `Target: ${gameState.currentTarget.userData.name} (${distance} units)`;
            
            if (targetInfoText) {
                targetInfoText += ` | ${baseTargetText}`;
            } else {
                targetInfoText = baseTargetText;
                targetInfoClass = 'text-green-400';
            }
        } else if (!targetInfoText) {
            targetInfoText = 'Target: None';
            targetInfoClass = 'text-orange-400';
        }
        
        // Show target lock info
        if (gameState.targetLock && gameState.targetLock.active && gameState.targetLock.target && typeof camera !== 'undefined') {
            const lockDistance = camera.position.distanceTo(gameState.targetLock.target.position).toFixed(1);
            const lockText = `⚠ LOCKED: ${gameState.targetLock.target.userData.name} (${lockDistance} units)`;
            targetInfoText += ` | ${lockText}`;
            targetInfoClass = 'text-yellow-400 pulse';
        }
        
        // Show black hole proximity warning (doubled distances)
        if (gameState.eventHorizonWarning && gameState.eventHorizonWarning.active && 
            gameState.eventHorizonWarning.blackHole && typeof camera !== 'undefined') {
            const blackHoleDistance = camera.position.distanceTo(gameState.eventHorizonWarning.blackHole.position).toFixed(1);
            const warningText = `▲ BLACK HOLE: ${blackHoleDistance} units`;
            targetInfoText += ` | ${warningText}`;
            targetInfoClass = 'text-yellow-400 pulse';
        }
        
        // Enhanced status displays with doubled scale
        if (gameState.emergencyWarp && gameState.emergencyWarp.active) {
            const warpTime = (gameState.emergencyWarp.timeRemaining / 1000).toFixed(1);
            targetInfoText += ` | WARP: ${warpTime}s`;
            targetInfoClass = 'text-cyan-400 pulse';
        } else if (gameState.slingshot && gameState.slingshot.active) {
            const slingshotTime = (gameState.slingshot.timeRemaining / 1000).toFixed(1);
            targetInfoText += ` | SLINGSHOT: ${slingshotTime}s`;
            targetInfoClass = 'text-yellow-400 pulse';
        } else if (gameState.slingshot && gameState.slingshot.postSlingshot) {
            targetInfoText += ` | INERTIA: ${(gameState.velocity * 1000).toFixed(0)} km/s`;
            targetInfoClass = 'text-cyan-400';
        }
        
        // Apply the final text and class
        targetInfo.textContent = targetInfoText;
        targetInfo.className = targetInfoClass + ' curved-element';
    }
    
    // Update auto-navigate button with enhanced state tracking
    updateAutoNavigateButton();
    
    // Enhanced velocity color coding with doubled scale
    if (velocityEl) {
        if (gameState.emergencyWarp && gameState.emergencyWarp.active) {
            velocityEl.className = 'text-cyan-400 pulse font-mono';
        } else if (gameState.slingshot && gameState.slingshot.active) {
            velocityEl.className = 'text-yellow-400 pulse font-mono';
        } else if (gameState.slingshot && gameState.slingshot.postSlingshot) {
            velocityEl.className = 'text-cyan-400 font-mono';
        } else if (gameState.velocity >= 2.0) { // Interstellar speeds
            velocityEl.className = 'text-purple-400 font-mono pulse';
        } else if (gameState.velocity >= 1.0) { // High interstellar speeds
            velocityEl.className = 'text-red-400 font-mono';
        } else if (gameState.velocity >= 0.6) { // Doubled threshold
            velocityEl.className = 'text-yellow-400 font-mono';
        } else if (gameState.velocity >= 0.3) { // Doubled threshold
            velocityEl.className = 'text-green-400 font-mono';
        } else {
            velocityEl.className = 'text-blue-400 font-mono';
        }
    }
}

function updateAutoNavigateButton() {
    const autoNavBtn = document.getElementById('autoNavigateBtn');
    if (!autoNavBtn || typeof gameState === 'undefined') return;
    
    if (gameState.currentTarget && !gameState.gameOver && gameState.energy > 10) {
        autoNavBtn.disabled = false;
        if (gameState.autoNavigating) {
            if (gameState.autoNavOrienting) {
                autoNavBtn.innerHTML = '<i class="fas fa-crosshairs mr-2"></i>Orienting to Target...';
            } else {
                autoNavBtn.innerHTML = '<i class="fas fa-pause mr-2"></i>Stop Auto-Navigate';
            }
        } else {
            autoNavBtn.innerHTML = '<i class="fas fa-crosshairs mr-2"></i>Auto-Navigate to Target';
        }
    } else {
        autoNavBtn.disabled = true;
        if (gameState.energy <= 10) {
            autoNavBtn.innerHTML = '<i class="fas fa-battery-empty mr-2"></i>Insufficient Energy for Auto-Nav';
        } else {
            autoNavBtn.innerHTML = '<i class="fas fa-crosshairs mr-2"></i>Auto-Navigate to Target';
        }
    }
}

// =============================================================================
// ENHANCED TARGET SYSTEM - INTEGRATED WITH CONTROLS
// =============================================================================

function populateTargets() {
    const container = document.getElementById('availableTargets');
    if (!container || typeof camera === 'undefined') return;
    
    container.innerHTML = '';

    // Enhanced targeting with better filtering - NO ASTEROIDS IN NAVIGATION (doubled ranges)
    const detectedWormholes = (typeof wormholes !== 'undefined') ? wormholes.filter(w => w.userData && w.userData.detected) : [];
    const allTargetableObjects = [
        ...(typeof planets !== 'undefined' ? planets.filter(p => p.userData && p.userData.name !== 'Earth' && p.userData.type !== 'asteroid') : []),
        ...detectedWormholes,
        ...(typeof comets !== 'undefined' ? comets.filter(c => camera.position.distanceTo(c.position) < 4000) : []), // Doubled range
        ...(typeof enemies !== 'undefined' ? enemies.filter(e => e.userData && e.userData.health > 0 && camera.position.distanceTo(e.position) < 3000) : []) // Match enemy detector range
    ];

    const nearbyObjects = allTargetableObjects.filter(obj => {
        const distance = camera.position.distanceTo(obj.position);
        return distance < 6000; // Doubled range
    }).sort((a, b) => {
        const distA = camera.position.distanceTo(a.position);
        const distB = camera.position.distanceTo(b.position);
        return distA - distB;
    });

    const targetObjects = nearbyObjects.slice(0, 15);

    targetObjects.forEach((obj, index) => {
        const distance = camera.position.distanceTo(obj.position);
        const energyCost = Math.ceil(distance / 50); // Adjusted for doubled scale
        
        let typeDisplay = obj.userData.type;
        let typeColor = 'text-gray-400';
        
        // Enhanced type display logic
        if (obj.userData.type === 'blackhole') {
            typeDisplay = obj.userData.isGalacticCore ? 'Galactic Core' : 'Black Hole';
            typeColor = 'text-red-400';
        } else if (obj.userData.type === 'star') {
            typeColor = 'text-yellow-400';
        } else if (obj.userData.type === 'planet') {
            typeColor = 'text-blue-400';
        } else if (obj.userData.type === 'moon') {
            typeDisplay = 'Moon';
            typeColor = 'text-gray-300';
        } else if (obj.userData.type === 'enemy') {
            typeDisplay = `Hostile (${obj.userData.health}/${obj.userData.maxHealth} HP)`;
            typeColor = obj.userData.isBoss ? 'text-red-600' : 'text-red-500';
        } else if (obj.userData.type === 'comet') {
            typeDisplay = 'Comet';
            typeColor = 'text-cyan-400';
        } else if (obj.userData.type === 'wormhole') {
            typeDisplay = 'Spatial Whirlpool';
            typeColor = 'text-pink-400';
        } else if (obj.userData.type === 'asteroid') {
            typeDisplay = 'Asteroid';
            typeColor = 'text-yellow-600';
        }
        
        // Enhanced faction display
        let factionIndicator = '';
        if (obj.userData.faction) {
            factionIndicator = ` (${obj.userData.faction})`;
        } else if (obj.userData.galaxyId !== undefined && obj.userData.galaxyId >= 0 && typeof galaxyTypes !== 'undefined') {
            const galaxyType = galaxyTypes[obj.userData.galaxyId];
            factionIndicator = ` (${galaxyType ? galaxyType.faction : 'G' + (obj.userData.galaxyId + 1)})`;
        } else if (obj.userData.isLocal) {
            factionIndicator = ' (Sol System)';
        }
        
        // Enhanced status indicators
        let statusIndicator = '';
        if (obj.userData.type === 'wormhole' && obj.userData.isTemporary) {
            const timeLeft = ((obj.userData.lifeTime - obj.userData.age) / 1000).toFixed(0);
            statusIndicator = ` T-${timeLeft}s ◈`;
        } else if (obj.userData.type === 'enemy') {
            statusIndicator = obj.userData.isActive ? ' ◄' : ' ◄';
            if (obj.userData.isBoss) statusIndicator += ' 👑';
        } else if (obj.userData.type === 'comet') {
            statusIndicator = ' ◆';
        } else if (obj.userData.type === 'asteroid') {
            statusIndicator = ' ◇';
        }
        
        // Add target lock indicator
        if (gameState.targetLock && gameState.targetLock.target === obj) {
            statusIndicator += ' 🎯';
        }
        
        const div = document.createElement('div');
        div.className = 'planet-card rounded-lg p-3 cursor-auto transition-all duration-300';
        if (gameState.currentTarget === obj) {
            div.classList.add('selected');
        }
        
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-cyan-300 text-sm">${obj.userData.name}${factionIndicator}${statusIndicator}</h4>
                    <p class="text-xs ${typeColor}">${typeDisplay}</p>
                </div>
                <div class="text-right">
                    <div class="text-sm text-yellow-400">${distance.toFixed(0)} units</div>
                    <div class="text-xs text-gray-400">${energyCost} energy</div>
                </div>
            </div>
        `;

        // FIXED: Enhanced click handler with proper event handling
        div.addEventListener('click', (e) => {
            console.log('Planet card clicked:', obj.userData.name);
            
            // CRITICAL: Prevent event bubbling to global handler
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Ensure this element can receive focus
            div.style.cursor = 'auto';
            
            // Use the selectTarget function from game-controls.js if available
            if (typeof selectTarget === 'function') {
                console.log('Calling selectTarget with:', obj.userData.name);
                selectTarget(obj);
            } else {
                // Fallback implementation
                console.log('Using fallback selectTargetUI');
                selectTargetUI(obj);
            }
            
            console.log('After selection, currentTarget:', gameState.currentTarget?.userData?.name);
            
            // Force UI update
            if (typeof updateUI === 'function') {
    setTimeout(updateUI, 10);
}
if (typeof populateTargets === 'function') {
    setTimeout(populateTargets, 20); // Refresh the planet cards to show selection
}
        });
        
        container.appendChild(div);
    });
    
    if (targetObjects.length === 0) {
        const div = document.createElement('div');
        div.className = 'text-center text-gray-400 text-sm p-3';
        div.textContent = 'No nearby objects detected...';
        container.appendChild(div);
    }
}

// Local target selection for UI (fallback)
function selectTargetUI(obj) {
    document.querySelectorAll('.planet-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    if (typeof gameState !== 'undefined') {
        gameState.currentTarget = obj;
        updateUI();
        
        // Play sound if available
        if (typeof playSound === 'function') {
            playSound('navigation');
        }
    }
}

// =============================================================================
// ENEMY DETECTION SYSTEM - INTEGRATED WITH TUTORIAL
// =============================================================================

function detectEnemiesInRegion() {
    if (typeof camera === 'undefined' || typeof enemies === 'undefined') return;
    
    const detectionRange = 3000; // Doubled range
    const nearbyEnemies = enemies.filter(enemy => 
        enemy.userData && enemy.userData.health > 0 && 
        camera.position.distanceTo(enemy.position) < detectionRange
    );
    
    const enemyDetector = document.getElementById('enemyDetector');
    const enemyCount = document.getElementById('enemyCount');
    
    if (!enemyDetector || !enemyCount) return;
    
    if (nearbyEnemies.length > 0) {
        const galaxyIds = [...new Set(nearbyEnemies.map(e => e.userData.galaxyId))];
        
        // Check tutorial status
        const tutorialActive = (typeof tutorialSystem !== 'undefined' && !tutorialSystem.completed);
        
        // Only play hostile contact sound if detector was previously hidden (prevents spam)
        const wasHidden = enemyDetector.classList.contains('hidden');
        
        enemyDetector.classList.remove('hidden');
        enemyCount.textContent = nearbyEnemies.length;
        
        // Update the detector text based on tutorial status
        const detectorTextNode = enemyDetector.firstChild;
        if (detectorTextNode && detectorTextNode.nodeType === Node.TEXT_NODE) {
            if (tutorialActive) {
                detectorTextNode.textContent = 'Hostiles Detected (TRAINING MODE): ';
                // Change color to indicate they're not active
                enemyDetector.style.color = 'rgba(255, 255, 0, 0.8)'; // Yellow for training
                enemyDetector.style.background = 'linear-gradient(45deg, rgba(255,255,0,0.2), rgba(255,200,0,0.2))';
                enemyDetector.style.border = '2px solid rgba(255,255,0,0.5)';
            } else {
                // Enemies are now active - show normal hostile indicators
                enemyDetector.style.color = 'rgba(255, 100, 100, 0.95)'; // Red for active
                enemyDetector.style.background = ''; // Reset to default
                enemyDetector.style.border = ''; // Reset to default
                
                // Play hostile contact sound with cooldown only when enemies become active
                if (wasHidden && typeof playSound === 'function') {
                    playSound('hostileContact');
                }
                
                // Enhanced faction display (only when enemies are active)
                if (galaxyIds.length === 1 && galaxyIds[0] >= 0 && typeof galaxyTypes !== 'undefined') {
                    const galaxyType = galaxyTypes[galaxyIds[0]];
                    detectorTextNode.textContent = `${galaxyType.faction} Hostiles: `;
                } else if (galaxyIds.includes(-1)) {
                    detectorTextNode.textContent = 'Martian Pirates: ';
                } else {
                    detectorTextNode.textContent = 'Active Hostiles: ';
                }
            }
        }
        
        // Check for boss presence (only if enemies are active)
        if (!tutorialActive) {
            const bossPresent = nearbyEnemies.some(e => e.userData.isBoss);
            if (bossPresent) {
                enemyDetector.style.background = 'linear-gradient(45deg, rgba(255,0,0,0.3), rgba(255,100,0,0.3))';
                enemyDetector.style.border = '2px solid rgba(255,50,50,0.8)';
            }
        }
    } else {
        enemyDetector.classList.add('hidden');
    }
}

// =============================================================================
// CROSSHAIR AND TARGETING SYSTEM - ENHANCED INTEGRATION
// =============================================================================

function updateCrosshairTargeting() {
    const crosshair = document.getElementById('crosshair');
    if (!crosshair || typeof gameState === 'undefined' || typeof camera === 'undefined') return;
    
    // FIXED: Don't interfere with navigation system when Option key is not affecting target lock
    // Only handle crosshair positioning when target lock is actually active
    if (!gameState.targetLock || !gameState.targetLock.active) {
        crosshair.classList.remove('target-locked');
        
        // Manual targeting mode - crosshair follows mouse directly
        if (gameState.mouseX !== undefined && gameState.mouseY !== undefined) {
            gameState.crosshairX = gameState.mouseX;
            gameState.crosshairY = gameState.mouseY;
        }
        
        // Update crosshair position in manual mode
        crosshair.style.left = gameState.crosshairX + 'px';
        crosshair.style.top = gameState.crosshairY + 'px';
        
        // Check for enemies under crosshair (but don't affect navigation)
        const mousePos = new THREE.Vector2(
            (gameState.crosshairX / window.innerWidth) * 2 - 1,
            -(gameState.crosshairY / window.innerHeight) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePos, camera);
        
        // Check for enemies under crosshair (auto-targeting only targets enemies)
        const enemyTargets = [];
        if (typeof enemies !== 'undefined') {
            enemyTargets.push(...enemies.filter(e => e.userData && e.userData.health > 0));
        }
        
        // Separately check for asteroids when manually aiming (not auto-targeting)
        let asteroidTargets = [];
        if (typeof activePlanets !== 'undefined') {
            asteroidTargets = activePlanets.filter(p => p.userData && p.userData.type === 'asteroid' && p.userData.health > 0);
        }
        
        let enemyInSights = false;
        let asteroidInSights = false;
        const enemyDetectionRange = 400; // Doubled range for enemies
        const asteroidDetectionRange = 200; // Shorter range for asteroids
        
        // Check for enemies (for auto-targeting)
        enemyTargets.forEach(enemy => {
            const distance = camera.position.distanceTo(enemy.position);
            if (distance <= enemyDetectionRange) {
                const intersects = raycaster.intersectObject(enemy);
                if (intersects.length > 0) {
                    enemyInSights = true;
                }
            }
        });
        
        // Check for asteroids when manually aiming (NOT for auto-targeting)
        asteroidTargets.forEach(asteroid => {
            const distance = camera.position.distanceTo(asteroid.position);
            if (distance <= asteroidDetectionRange) {
                const intersects = raycaster.intersectObject(asteroid);
                if (intersects.length > 0) {
                    asteroidInSights = true;
                }
            }
        });
        
        // Update crosshair visual state based on target detection
        crosshair.classList.remove('enemy-targeted', 'asteroid-targeted');
        if (enemyInSights) {
            crosshair.classList.add('enemy-targeted');
        } else if (asteroidInSights) {
            crosshair.classList.add('asteroid-targeted');
        }
        
        return; // Exit early when not in target lock mode - NO NAVIGATION INTERFERENCE
    }
    
    // TARGET LOCK IS ACTIVE - Handle locked targeting mode
    crosshair.classList.add('target-locked');
    
    let enemyInSights = false;
    const detectionRange = 400; // Doubled range
    
    // Check if locked target is an enemy or asteroid
    if (gameState.targetLock.target && 
        (gameState.targetLock.target.userData.type === 'enemy' || 
         gameState.targetLock.target.userData.type === 'asteroid')) {
        enemyInSights = true;
    }
    
    // Update crosshair position when target lock is active
    crosshair.style.left = gameState.crosshairX + 'px';
    crosshair.style.top = gameState.crosshairY + 'px';
    
    // Update crosshair visual state for locked target
    if (enemyInSights) {
        crosshair.classList.add('enemy-targeted');
    } else {
        crosshair.classList.remove('enemy-targeted');
    }
}
// =============================================================================
// GALAXY MAP SYSTEM - ENHANCED WITH BOSS TRACKING
// =============================================================================

function setupGalaxyMap() {
    const galaxyMap = document.getElementById('galaxyMap');
    if (!galaxyMap || typeof galaxyTypes === 'undefined') return;
    
    // Create grid overlay
    createMapGrid();
    
    // Clear existing galaxy indicators
    const existingGalaxies = galaxyMap.querySelectorAll('.galaxy-indicator');
    existingGalaxies.forEach(el => el.remove());
    
    // Create enhanced galaxy indicators with boss system integration
    galaxyTypes.forEach((galaxy, index) => {
        // Guard missing map positions
        const mapPos = (typeof galaxyMapPositions !== 'undefined') ? galaxyMapPositions[index] : null;
        if (!mapPos) {
            console.warn(`No map position for galaxy index ${index} ("${galaxy.name}"), skipping.`);
            return;
        }

        // Compute enemy count safely
        let enemyCount = 0;
        if (typeof gameState !== 'undefined' && gameState.currentGalaxyEnemies) {
            enemyCount = gameState.currentGalaxyEnemies[index] || 0;
        }

        // Read boss flags safely from bossSystem in game-objects.js
        let bossDefeated = false;
        let bossSpawned = false;
        if (typeof bossSystem !== 'undefined') {
            bossDefeated = Array.isArray(bossSystem.galaxyBossDefeated) ? 
                !!bossSystem.galaxyBossDefeated[index] : false;
            bossSpawned = Array.isArray(bossSystem.galaxyBossSpawned) ? 
                !!bossSystem.galaxyBossSpawned[index] : false;
        }

        // Build the galaxy indicator
        const galaxyEl = document.createElement('div');
        galaxyEl.className = 'galaxy-indicator absolute w-3 h-3 rounded-full opacity-80 flex items-center justify-center text-xs text-white font-bold';
        galaxyEl.style.backgroundColor = `#${galaxy.color.toString(16).padStart(6, '0')}`;
        galaxyEl.style.left = `${mapPos.x * 100}%`;
        galaxyEl.style.top = `${mapPos.y * 100}%`;
        galaxyEl.style.transform = 'translate(-50%, -50%)';
        galaxyEl.textContent = (index + 1).toString();
        galaxyEl.title = `${galaxy.name} Galaxy (${galaxy.faction})`;

        // Enemy counter with enhanced boss status
        const enemyCounter = document.createElement('div');
        enemyCounter.className = 'enemy-counter';
        enemyCounter.id = `galaxy-${index}-enemies`;
        enemyCounter.textContent = enemyCount;

        // Enhanced color coding for status
        if (enemyCount === 0 && bossDefeated) {
            enemyCounter.style.backgroundColor = 'green';
            enemyCounter.textContent = '✓';
            enemyCounter.title = 'Galaxy Cleared';
        } else if (bossSpawned && !bossDefeated) {
            enemyCounter.style.backgroundColor = 'darkred';
            enemyCounter.style.color = 'yellow';
            enemyCounter.title = 'Boss Active';
        } else if (enemyCount > 0) {
            enemyCounter.style.backgroundColor = 'red';
            enemyCounter.title = `${enemyCount} hostiles remaining`;
        } else {
            enemyCounter.style.backgroundColor = 'gray';
            enemyCounter.title = 'No activity detected';
        }

        galaxyEl.appendChild(enemyCounter);
        galaxyMap.appendChild(galaxyEl);
    });
    
    // Add Sagittarius A* indicator
    const sgrAEl = document.createElement('div');
    sgrAEl.className = 'absolute w-4 h-4 bg-yellow-600 rounded-full flex items-center justify-center text-xs text-white font-bold';
    sgrAEl.style.left = '50%';
    sgrAEl.style.top = '50%';
    sgrAEl.style.transform = 'translate(-50%, -50%)';
    sgrAEl.style.boxShadow = '0 0 8px #ca8a04';
    sgrAEl.textContent = '✦';
    sgrAEl.title = 'Sagittarius A* - Galactic Center';
    galaxyMap.appendChild(sgrAEl);
}

function createMapGrid() {
    const mapGrid = document.getElementById('mapGrid');
    if (!mapGrid) return;
    
    // Clear existing grid
    mapGrid.innerHTML = '';
    
    // Create vertical lines
    for (let i = 1; i < 8; i++) {
        const line = document.createElement('div');
        line.className = 'map-grid-line vertical';
        line.style.left = `${(i / 8) * 100}%`;
        mapGrid.appendChild(line);
    }
    
    // Create horizontal lines
    for (let i = 1; i < 8; i++) {
        const line = document.createElement('div');
        line.className = 'map-grid-line horizontal';
        line.style.top = `${(i / 8) * 100}%`;
        mapGrid.appendChild(line);
    }
}

// =============================================================================
// NAVIGATION AND COMPASS SYSTEMS - ENHANCED
// =============================================================================

function updateCompass() {
    if (typeof camera === 'undefined') return;
    
    // Compass functionality for distant Sagittarius A*
    const playerPos = camera.position;
    const sgrAPos = new THREE.Vector3(0, 0, 0);
    const direction = new THREE.Vector3().subVectors(sgrAPos, playerPos);
    const distance = direction.length();
    
    // Show compass when Sagittarius A* is far away (doubled distance)
    const compassElement = document.querySelector('.compass-needle');
    if (compassElement) {
        if (distance > 10000) { // Doubled distance
            compassElement.classList.remove('hidden');
            
            // Convert to angle for CSS rotation
            const angle = Math.atan2(direction.x, direction.z);
            const degrees = (angle * 180 / Math.PI + 180) % 360;
            
            compassElement.style.setProperty('--rotation', `${degrees}deg`);
        } else {
            compassElement.classList.add('hidden');
        }
    }
}

function updateGalaxyMap() {
    if (typeof gameState === 'undefined' || typeof camera === 'undefined') return;
    
    const playerMapPos = document.getElementById('playerMapPosition');
    const targetMapPos = document.getElementById('targetMapPosition');
    const mapDirectionArrow = document.getElementById('mapDirectionArrow');
    const universeRadius = 40000; // Doubled
    
    if (!playerMapPos) return;
    
    // Different behavior based on map view (doubled scale considerations)
    if (gameState.mapView === 'galactic') {
        // In galactic view, show direction arrow at center and move galaxies relative to player
        if (playerMapPos) playerMapPos.style.display = 'none';
        if (mapDirectionArrow) {
            mapDirectionArrow.style.display = 'block';
            
            // Update direction arrow rotation
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            const angle = Math.atan2(forward.x, -forward.z);
            mapDirectionArrow.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
        }
        
        // Move all galaxy indicators relative to player position (doubled scale)
        const playerMapX = camera.position.x / universeRadius;
        const playerMapZ = camera.position.z / universeRadius;
        
        // Update galaxy positions relative to player
        if (typeof galaxyTypes !== 'undefined' && typeof galaxyMapPositions !== 'undefined') {
            galaxyTypes.forEach((galaxy, index) => {
                const galaxyEl = document.querySelector(`.galaxy-indicator:nth-child(${index + 2})`);
                if (!galaxyEl) return;
                
                const mapPos = galaxyMapPositions[index];
                if (!mapPos) return;
                
                const relativeX = mapPos.x - 0.5 - playerMapX;
                const relativeZ = mapPos.y - 0.5 - playerMapZ;
                
                const screenX = 50 + relativeX * 100;
                const screenZ = 50 + relativeZ * 100;
                
                if (screenX >= 0 && screenX <= 100 && screenZ >= 0 && screenZ <= 100) {
                    galaxyEl.style.left = `${screenX}%`;
                    galaxyEl.style.top = `${screenZ}%`;
                    galaxyEl.style.display = 'flex';
                } else {
                    galaxyEl.style.display = 'none';
                }
            });
        }
        
        // Update Sagittarius A* position
        const sgrAEl = document.querySelector('[title="Sagittarius A* - Galactic Center"]');
        if (sgrAEl) {
            const sgrARelativeX = -playerMapX;
            const sgrARelativeZ = -playerMapZ;
            const sgrAScreenX = 50 + sgrARelativeX * 100;
            const sgrAScreenZ = 50 + sgrARelativeZ * 100;
            
            if (sgrAScreenX >= 0 && sgrAScreenX <= 100 && sgrAScreenZ >= 0 && sgrAScreenZ <= 100) {
                sgrAEl.style.left = `${sgrAScreenX}%`;
                sgrAEl.style.top = `${sgrAScreenZ}%`;
                sgrAEl.style.display = 'flex';
            } else {
                sgrAEl.style.display = 'none';
            }
        }
    } else {
        // In universal view, show static galaxy positions and player arrow
        if (playerMapPos) playerMapPos.style.display = 'block';
        if (mapDirectionArrow) {
            mapDirectionArrow.style.display = 'none';
        }
        
        // Show player position relative to universe (doubled scale)
        const playerMapX = (camera.position.x / universeRadius) + 0.5;
        const playerMapZ = (camera.position.z / universeRadius) + 0.5;
        
        // Clamp player position to map bounds
        const clampedX = Math.max(5, Math.min(95, playerMapX * 100));
        const clampedZ = Math.max(5, Math.min(95, playerMapZ * 100));
        
        if (playerMapPos) {
            playerMapPos.style.left = `${clampedX}%`;
            playerMapPos.style.top = `${clampedZ}%`;
            
            // Rotate player arrow based on camera direction
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            const angle = Math.atan2(forward.x, -forward.z);
            playerMapPos.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
        }
        
        // Show all galaxies in fixed positions
        if (typeof galaxyTypes !== 'undefined' && typeof galaxyMapPositions !== 'undefined') {
            galaxyTypes.forEach((galaxy, index) => {
                const galaxyEl = document.querySelector(`.galaxy-indicator:nth-child(${index + 2})`);
                if (!galaxyEl) return;
                
                const mapPos = galaxyMapPositions[index];
                if (!mapPos) return;
                
                galaxyEl.style.left = `${mapPos.x * 100}%`;
                galaxyEl.style.top = `${mapPos.y * 100}%`;
                galaxyEl.style.display = 'flex';
            });
        }
        
        // Show Sagittarius A* in center
        const sgrAEl = document.querySelector('[title="Sagittarius A* - Galactic Center"]');
        if (sgrAEl) {
            sgrAEl.style.left = '50%';
            sgrAEl.style.top = '50%';
            sgrAEl.style.display = 'flex';
        }
    }
    
    // Update target indicator (works for both views, doubled scale)
    if (gameState.currentTarget && targetMapPos) {
        let targetScreenX, targetScreenZ;
        
        if (gameState.mapView === 'galactic') {
            const targetRelativeX = (gameState.currentTarget.position.x / universeRadius) - (camera.position.x / universeRadius);
            const targetRelativeZ = (gameState.currentTarget.position.z / universeRadius) - (camera.position.z / universeRadius);
            targetScreenX = 50 + targetRelativeX * 100;
            targetScreenZ = 50 + targetRelativeZ * 100;
        } else {
            // Universal view - show target position in universe
            const targetMapX = (gameState.currentTarget.position.x / universeRadius) + 0.5;
            const targetMapZ = (gameState.currentTarget.position.z / universeRadius) + 0.5;
            targetScreenX = targetMapX * 100;
            targetScreenZ = targetMapZ * 100;
        }
        
        if (targetScreenX >= 0 && targetScreenX <= 100 && targetScreenZ >= 0 && targetScreenZ <= 100) {
            targetMapPos.style.left = `${targetScreenX}%`;
            targetMapPos.style.top = `${targetScreenZ}%`;
            targetMapPos.classList.remove('hidden');
        } else {
            targetMapPos.classList.add('hidden');
        }
    } else if (targetMapPos) {
        targetMapPos.classList.add('hidden');
    }
    
    // Update view status display
    const viewStatusEl = document.getElementById('mapViewStatus');
    if (viewStatusEl) {
        viewStatusEl.textContent = gameState.mapView === 'galactic' ? 'Galaxy View' : 'Universal View';
    }
}

// =============================================================================
// ORBIT LINES VISIBILITY CONTROL - INTEGRATED WITH CORE SYSTEM
// =============================================================================

function updateOrbitLinesButton() {
    const toggleOrbitsBtn = document.getElementById('toggleOrbitsBtn');
    if (!toggleOrbitsBtn) return;
    
    // Get orbit lines visibility from the core system
    const orbitsVisible = (typeof orbitLinesVisible !== 'undefined') ? orbitLinesVisible : true;
    
    toggleOrbitsBtn.innerHTML = `<i class="fas fa-circle-notch mr-1"></i>Orbits ${orbitsVisible ? 'ON' : 'OFF'}`;
    toggleOrbitsBtn.classList.toggle('active', orbitsVisible);
    
    // Update button click handler to use the core system function
    toggleOrbitsBtn.onclick = () => {
        if (typeof toggleOrbitLines === 'function') {
            const newState = toggleOrbitLines();
            toggleOrbitsBtn.innerHTML = `<i class="fas fa-circle-notch mr-1"></i>Orbits ${newState ? 'ON' : 'OFF'}`;
            toggleOrbitsBtn.classList.toggle('active', newState);
        }
    };
}

// =============================================================================
// WARP STATUS AND SLINGSHOT SYSTEM - UI INTEGRATION
// =============================================================================

function updateWarpButton() {
    const warpBtn = document.getElementById('warpBtn');
    if (!warpBtn || typeof gameState === 'undefined') return;
    
    // Check for nearby planets for slingshot availability
    let nearestAssistPlanet = null;
    let nearestAssistDistance = Infinity;
    const assistRange = 60; // Doubled
    
    if (typeof activePlanets !== 'undefined' && typeof camera !== 'undefined') {
        activePlanets.forEach(planet => {
            const distance = camera.position.distanceTo(planet.position);
            if (distance < assistRange && distance < nearestAssistDistance) {
                nearestAssistPlanet = planet;
                nearestAssistDistance = distance;
            }
        });
    }
    
    // Update warp button based on slingshot availability
    if (nearestAssistPlanet && gameState.energy >= 20 && (!gameState.slingshot || !gameState.slingshot.active)) {
        warpBtn.disabled = false;
        warpBtn.classList.add('space-btn', 'pulse');
        warpBtn.innerHTML = `<i class="fas fa-rocket mr-2"></i>SLINGSHOT READY - Press ENTER (${nearestAssistPlanet.userData.name})`;
        
        if (!warpBtn.classList.contains('assist-ready')) {
            warpBtn.classList.add('assist-ready');
        }
    } else {
        warpBtn.disabled = true;
        warpBtn.classList.remove('space-btn', 'pulse', 'assist-ready');
        if (gameState.slingshot && gameState.slingshot.active) {
            const timeLeft = (gameState.slingshot.timeRemaining / 1000).toFixed(1);
            warpBtn.innerHTML = `<i class="fas fa-rocket mr-2"></i>SLINGSHOT ACTIVE - ${timeLeft}s`;
        } else {
            warpBtn.innerHTML = `<i class="fas fa-search mr-2"></i>Searching for gravitational assist...`;
        }
    }
}

// =============================================================================
// EVENT HORIZON AND BLACK HOLE WARNING SYSTEM
// =============================================================================

function updateEventHorizonWarnings() {
    const eventHorizonWarning = document.getElementById('eventHorizonWarning');
    const blackHoleWarningHUD = document.getElementById('blackHoleWarningHUD');
    const blackHoleDistanceHUD = document.getElementById('blackHoleDistanceHUD');
    const gameTitle = document.getElementById('gameTitle');
    
    if (typeof gameState === 'undefined' || !gameState.eventHorizonWarning) return;
    
    // Handle event horizon warnings
    if (gameState.eventHorizonWarning.active && gameState.eventHorizonWarning.blackHole) {
        const blackHole = gameState.eventHorizonWarning.blackHole;
        
        if (eventHorizonWarning) {
            eventHorizonWarning.classList.remove('hidden');
        }
        
        if (blackHoleWarningHUD && blackHoleDistanceHUD && typeof camera !== 'undefined') {
            blackHoleWarningHUD.classList.remove('hidden');
            const distance = camera.position.distanceTo(blackHole.position);
            blackHoleDistanceHUD.textContent = `Distance: ${distance.toFixed(1)} units`;
        }
        
        // Add title flashing effect
        if (gameTitle) {
            gameTitle.classList.add('title-flash');
        }
    } else {
        // Hide warnings
        if (eventHorizonWarning) {
            eventHorizonWarning.classList.add('hidden');
        }
        
        if (blackHoleWarningHUD) {
            blackHoleWarningHUD.classList.add('hidden');
        }
        
        // Remove title flashing effect
        if (gameTitle) {
            gameTitle.classList.remove('title-flash');
        }
    }
}

// =============================================================================
// GAME STATE AND VICTORY CONDITIONS
// =============================================================================

function checkVictoryCondition() {
    if (typeof gameState === 'undefined' || typeof galaxyTypes === 'undefined') return false;
    
    // Check if all galaxies are cleared
    if (gameState.galaxiesCleared >= 8) {
        showVictoryScreen();
        return true;
    }
    
    return false;
}

function showVictoryScreen() {
    if (typeof gameState !== 'undefined') {
        gameState.gameOver = true;
        gameState.gameStarted = false;
    }
    
    // Stop all music
    if (typeof musicSystem !== 'undefined') {
        if (musicSystem.backgroundMusic) {
            musicSystem.backgroundMusic.stop();
            musicSystem.backgroundMusic = null;
        }
        if (musicSystem.battleMusic) {
            musicSystem.battleMusic.stop();
            musicSystem.battleMusic = null;
        }
    }
    
    // Create victory overlay
    const victoryOverlay = document.createElement('div');
    victoryOverlay.className = 'absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 cyberpunk-bg';
    victoryOverlay.style.cursor = 'auto';
    victoryOverlay.innerHTML = `
        <div class="text-center ui-panel rounded-lg p-8" style="cursor: auto;">
            <div class="text-6xl mb-4">🏆</div>
            <h1 class="text-4xl font-bold text-green-400 mb-4 glow-text cyber-title">VICTORY!</h1>
            <p class="text-gray-300 mb-6">All hostile forces have been eliminated! The universe is safe!</p>
            <div class="space-y-4">
                <div class="text-lg text-cyan-400 glow-text">Mission Complete Statistics:</div>
                <div class="text-sm text-gray-300 space-y-1">
                    <div>Distance Traveled: ${gameState ? gameState.distance.toFixed(1) : '0'} light years</div>
                    <div>Final Velocity: ${gameState ? (gameState.velocity * 1000).toFixed(0) : '0'} km/s</div>
                    <div>Energy Remaining: ${gameState ? gameState.energy.toFixed(0) : '100'}%</div>
                    <div>Hull Integrity: ${gameState ? gameState.hull.toFixed(0) : '100'}%</div>
                    <div>All Galaxies Liberated: 8/8</div>
                    <div>Emergency Warps Remaining: ${gameState ? gameState.emergencyWarp.available : '5'}</div>
                </div>
                <button onclick="location.reload()" class="mt-6 space-btn rounded px-6 py-3" style="cursor: pointer;">
                    <i class="fas fa-redo mr-2"></i>New Mission
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(victoryOverlay);
    
    // Make mouse visible
    document.body.style.cursor = 'auto';
    victoryOverlay.style.pointerEvents = 'all';
    
    // Play victory music
    if (typeof playVictoryMusic === 'function') {
        playVictoryMusic();
    }
}

function gameOver(reason) {
    // Add white fade effect first (from old version)
    const whiteFlash = document.createElement('div');
    whiteFlash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: white;
        z-index: 49;
        opacity: 0;
        pointer-events: none;
    `;
    document.body.appendChild(whiteFlash);
    
    // Animate to white
    setTimeout(() => {
        whiteFlash.style.transition = 'opacity 0.5s ease-in';
        whiteFlash.style.opacity = '1';
    }, 10);
    
    // After white flash, show game over screen
    setTimeout(() => {
        gameState.gameOver = true;
        gameState.velocityVector.set(0, 0, 0);
        gameState.slingshot.active = false;
        gameState.slingshot.postSlingshot = false;
        gameState.emergencyWarp.active = false;
        gameState.targetLock.active = false;
        gameState.targetLock.target = null;
        
        cleanupEventHorizonEffects();
        
        // Fade out white
        whiteFlash.style.transition = 'opacity 1s ease-out';
        whiteFlash.style.opacity = '0';
        setTimeout(() => whiteFlash.remove(), 1000);
        
        const gameOverOverlay = document.createElement('div');
        gameOverOverlay.className = 'absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 cyberpunk-bg';
        gameOverOverlay.style.cursor = 'auto'; // Make mouse visible
        gameOverOverlay.innerHTML = `
            <div class="text-center ui-panel rounded-lg p-8" style="cursor: auto;">
                <div class="text-6xl mb-4">◇</div>
                <h1 class="text-4xl font-bold text-red-400 mb-4 glow-text cyber-title">MISSION FAILED</h1>
                <p class="text-gray-300 mb-6">${reason}</p>
                <div class="space-y-4">
                    <div class="text-lg text-cyan-400 glow-text">Final Stats:</div>
                    <div class="text-sm text-gray-300 space-y-1">
                        <div>Distance Traveled: ${gameState.distance.toFixed(1)} light years</div>
                        <div>Final Velocity: ${(gameState.velocity * 1000).toFixed(0)} km/s</div>
                        <div>Energy Remaining: ${gameState.energy.toFixed(0)}%</div>
                        <div>Hull Integrity: ${gameState.hull.toFixed(0)}%</div>
                        <div>Enemies Destroyed: ${120 - enemies.length}</div>
                        <div>Galaxies Cleared: ${gameState.galaxiesCleared}/8</div>
                        <div>Emergency Warps Used: ${5 - gameState.emergencyWarp.available}</div>
                    </div>
                    <button onclick="location.reload()" class="mt-6 space-btn rounded px-6 py-3" style="cursor: pointer;">
                        <i class="fas fa-redo mr-2"></i>Restart Mission
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(gameOverOverlay);
        
        // Ensure mouse is visible and working
        document.body.style.cursor = 'auto';
        gameOverOverlay.style.pointerEvents = 'all';
    }, 600); // Delay for white flash
    
    // Stop all music
    if (typeof musicSystem !== 'undefined') {
        if (musicSystem.backgroundMusic) {
            musicSystem.backgroundMusic.stop();
            musicSystem.backgroundMusic = null;
        }
        if (musicSystem.battleMusic) {
            musicSystem.battleMusic.stop();
            musicSystem.battleMusic = null;
        }
    }
    
    // Clean up any active effects
    if (typeof cleanupEventHorizonEffects === 'function') {
        cleanupEventHorizonEffects();
    }
    
    // Enhanced game over screen with visible mouse cursor
    const gameOverOverlay = document.createElement('div');
    gameOverOverlay.className = 'absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 cyberpunk-bg';
    gameOverOverlay.style.cursor = 'auto'; // Make mouse visible
    gameOverOverlay.innerHTML = `
        <div class="text-center ui-panel rounded-lg p-8" style="cursor: auto;">
            <div class="text-6xl mb-4">◇</div>
            <h1 class="text-4xl font-bold text-red-400 mb-4 glow-text cyber-title">MISSION FAILED</h1>
            <p class="text-gray-300 mb-6">${reason}</p>
            <div class="space-y-4">
                <div class="text-lg text-cyan-400 glow-text">Final Stats:</div>
                <div class="text-sm text-gray-300 space-y-1">
                    <div>Distance Traveled: ${gameState ? gameState.distance.toFixed(1) : '0'} light years</div>
                    <div>Final Velocity: ${gameState ? (gameState.velocity * 1000).toFixed(0) : '0'} km/s</div>
                    <div>Energy Remaining: ${gameState ? gameState.energy.toFixed(0) : '0'}%</div>
                    <div>Hull Integrity: ${gameState ? gameState.hull.toFixed(0) : '0'}%</div>
                    <div>Galaxies Cleared: ${gameState ? gameState.galaxiesCleared : 0}/8</div>
                    <div>Emergency Warps Remaining: ${gameState ? gameState.emergencyWarp.available : '0'}</div>
                </div>
                <button onclick="location.reload()" class="mt-6 space-btn rounded px-6 py-3" style="cursor: pointer;">
                    <i class="fas fa-redo mr-2"></i>Restart Mission
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(gameOverOverlay);
    
    // Ensure mouse is visible and working
    document.body.style.cursor = 'auto';
    gameOverOverlay.style.pointerEvents = 'all';
}

// =============================================================================
// INTEGRATED UPDATE LOOP FOR UI SYSTEMS
// =============================================================================

function updateAllUISystems() {
    // Core UI updates
    updateUI();
    
    // Navigation and targeting systems
    populateTargets();
    updateCrosshairTargeting();
    detectEnemiesInRegion();
    
    // Map and navigation systems
    updateCompass();
    updateGalaxyMap();
    
    // Control button states
    updateOrbitLinesButton();
    updateWarpButton();
    
    // Warning systems
    updateEventHorizonWarnings();
    
    // Victory condition check
    checkVictoryCondition();
}

// =============================================================================
// INITIALIZATION AND COMPATIBILITY FUNCTIONS
// =============================================================================

function initializeUISystem() {
    console.log('🖥️ Initializing enhanced UI system...');
    
    // Setup galaxy map
    setupGalaxyMap();
    
    // Initialize orbit lines button
    updateOrbitLinesButton();
    
    // Set up initial UI state
    if (typeof gameState !== 'undefined') {
        // Ensure mouse and crosshair positions are synchronized
        gameState.mouseX = gameState.mouseX || window.innerWidth / 2;
        gameState.mouseY = gameState.mouseY || window.innerHeight / 2;
        gameState.crosshairX = gameState.mouseX;
        gameState.crosshairY = gameState.mouseY;
        
        // FIXED: Initialize map view and button text correctly
        gameState.mapView = 'galactic';
        const mapViewToggle = document.getElementById('mapViewToggle');
        if (mapViewToggle) {
            mapViewToggle.textContent = 'Galactic View';
        }
    }
    // Bind event listeners for UI elements that aren't handled by game-controls.js
    bindUIEventListeners();
    
    console.log('UI system initialized successfully');
}

function bindUIEventListeners() {
    // Map view toggle button
    const mapViewToggle = document.getElementById('mapViewToggle');
    if (mapViewToggle) {
        mapViewToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof toggleMapView === 'function') {
                toggleMapView();
            } else {
                // Fallback implementation
                if (typeof gameState !== 'undefined') {
                    gameState.mapView = gameState.mapView === 'galactic' ? 'universal' : 'galactic';
                    mapViewToggle.textContent = gameState.mapView === 'galactic' ? 'Universal View' : 'Galactic View';
                }
            }
        });
    }
    
    // Auto-navigate button - fixed implementation
const autoNavigateBtn = document.getElementById('autoNavigateBtn');
if (autoNavigateBtn) {
    autoNavigateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (gameState.currentTarget) {
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
        
        // FIXED: Remove focus from button so space bar doesn't accidentally trigger it
        autoNavigateBtn.blur();
    });
}
    
    // Warp button for slingshot execution
    const warpBtn = document.getElementById('warpBtn');
    if (warpBtn && typeof executeSlingshot === 'function') {
        warpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            executeSlingshot();
        });
    }
}

// =============================================================================
// COMPATIBILITY BRIDGE FUNCTIONS - FOR INTEGRATION WITH OTHER SYSTEMS
// =============================================================================

// Bridge function to show achievements (integrates with game-controls.js)
function displayAchievement(title, description, playSound = true) {
    // Use the enhanced achievement system from game-controls.js if available
    if (typeof showAchievement === 'function') {
        showAchievement(title, description, playSound);
    } else {
        // Fallback UI-only achievement display
        const popup = document.getElementById('achievementPopup');
        const text = document.getElementById('achievementText');
        const titleEl = popup && popup.querySelector('h4');
        
        if (popup && text && titleEl) {
            titleEl.textContent = title;
            text.textContent = description;
            popup.classList.remove('hidden');
            
            // Auto-hide after 4 seconds
            setTimeout(() => popup.classList.add('hidden'), 4000);
        }
    }
}

// Bridge function for target cycling (integrates with game-controls.js)
function cycleToNextTarget() {
    if (typeof cycleTargets === 'function') {
        cycleTargets();
    } else {
        // Fallback implementation
        console.warn('cycleTargets function not available - using fallback');
        // Implement basic target cycling here if needed
    }
}

// Bridge function for UI updates from other systems
function updateUIFromExternal(updateType, data) {
    switch (updateType) {
        case 'enemy_defeated':
            if (data && data.enemy) {
                // Update galaxy enemy counts
                const galaxyId = data.enemy.userData && data.enemy.userData.galaxyId;
                if (typeof gameState !== 'undefined' && gameState.currentGalaxyEnemies && galaxyId >= 0) {
                    gameState.currentGalaxyEnemies[galaxyId] = Math.max(0, (gameState.currentGalaxyEnemies[galaxyId] || 0) - 1);
                    setupGalaxyMap(); // Refresh galaxy map
                }
            }
            break;
            
        case 'boss_spawned':
            if (data && data.galaxyId >= 0) {
                setupGalaxyMap(); // Refresh galaxy map to show boss status
            }
            break;
            
        case 'galaxy_cleared':
            if (data && data.galaxyId >= 0) {
                setupGalaxyMap(); // Refresh galaxy map to show cleared status
                if (typeof gameState !== 'undefined') {
                    gameState.galaxiesCleared++;
                }
            }
            break;
            
        case 'tutorial_completed':
            // Update UI to reflect that enemies are now active
            detectEnemiesInRegion();
            break;
            
        default:
            console.warn('Unknown UI update type:', updateType);
            break;
    }
}

// =============================================================================
// EXPORT FUNCTIONS FOR GLOBAL ACCESS
// =============================================================================

if (typeof window !== 'undefined') {
    // Core UI functions
    window.updateUI = updateUI;
    window.updateAllUISystems = updateAllUISystems;
    window.initializeUISystem = initializeUISystem;
    
    // Target and navigation systems
    window.populateTargets = populateTargets;
    window.selectTargetUI = selectTargetUI;
    window.detectEnemiesInRegion = detectEnemiesInRegion;
    window.updateCrosshairTargeting = updateCrosshairTargeting;
    
    // Map and compass systems
    window.setupGalaxyMap = setupGalaxyMap;
    window.createMapGrid = createMapGrid;
    window.updateCompass = updateCompass;
    window.updateGalaxyMap = updateGalaxyMap;
    
    // Control and status systems
    window.updateAutoNavigateButton = updateAutoNavigateButton;
    window.updateOrbitLinesButton = updateOrbitLinesButton;
    window.updateWarpButton = updateWarpButton;
    window.updateEventHorizonWarnings = updateEventHorizonWarnings;
    
    // Game state functions
    window.checkVictoryCondition = checkVictoryCondition;
    window.showVictoryScreen = showVictoryScreen;
    window.gameOver = gameOver;
    
    // Bridge functions for integration
    window.displayAchievement = displayAchievement;
    window.cycleToNextTarget = cycleToNextTarget;
    window.updateUIFromExternal = updateUIFromExternal;
    
    // Utility functions
    window.bindUIEventListeners = bindUIEventListeners;
    
    console.log('Enhanced Game UI loaded - All compatibility issues resolved!');
}

console.log('Game UI system loaded successfully - COMPREHENSIVE REWRITE COMPLETE!');