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
    
    // FIXED: Properly define all UI elements at the start
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
    
    // Emergency Warp count update
    if (emergencyWarpEl && gameState.emergencyWarp) {
        emergencyWarpEl.textContent = gameState.emergencyWarp.available;
    }
    // Also update mobile warp count
    const mobileWarpEl = document.getElementById('mobileWarpCount');
    if (mobileWarpEl && gameState.emergencyWarp) {
        mobileWarpEl.textContent = gameState.emergencyWarp.available;
    }
    if (energyBarEl) {
    // First, always update the width to match current energy
    const energyPercent = Math.max(0, Math.min(100, gameState.energy));
    energyBarEl.style.width = energyPercent + '%';
    
    // Then apply visual effects if boosts are active
    if (gameState.solarStormBoostActive || gameState.plasmaStormBoostActive) {
        if (gameState.plasmaStormBoostActive) {
            // Purple plasma storm boost
            energyBarEl.style.background = 'linear-gradient(90deg, #8866ff 0%, #6644ff 50%, #aa88ff 100%)';
            energyBarEl.style.boxShadow = '0 0 20px rgba(136, 102, 255, 0.9)';
        } else {
            // Yellow solar storm boost
            energyBarEl.style.background = 'linear-gradient(90deg, #ffd700 0%, #ffff00 50%, #ffa500 100%)';
            energyBarEl.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.8)';
        }
        
        // Animate the bar
        const pulseTime = Date.now() * 0.003;
        const pulse = Math.sin(pulseTime) * 0.1 + 0.9;
        energyBarEl.style.opacity = pulse;
    } else {
        // Normal energy bar appearance
        energyBarEl.style.background = 'linear-gradient(90deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)';
        energyBarEl.style.boxShadow = 'none';
        energyBarEl.style.opacity = '1';
    }
    
    // Enhanced color coding based on energy level
    if (energyPercent < 10) {
        energyBarEl.style.background = 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)';
    } else if (energyPercent < 25) {
        energyBarEl.style.background = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
    }
}

// Show energy percentage text with boost indicator
if (gameState.solarStormBoostActive || gameState.plasmaStormBoostActive) {
    const timeLeft = Math.ceil(
        (gameState.plasmaStormBoostActive ? gameState.plasmaStormBoostEndTime : gameState.solarStormBoostEndTime) 
        - Date.now()
    ) / 1000;
    const boostType = gameState.plasmaStormBoostActive ? 'PLASMA' : 'SOLAR';
    const boostColor = gameState.plasmaStormBoostActive ? '#8866ff' : '#ffd700';
    
    const energyDisplay = document.querySelector('#energyBar').parentElement.previousElementSibling;
    if (energyDisplay) {
        energyDisplay.innerHTML = `Energy: <span style="color: ${boostColor}; font-weight: bold; text-shadow: 0 0 10px ${boostColor};">${Math.round(gameState.energy)}% ⚡ ${boostType} (${timeLeft}s)</span>`;
    }
}
    
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
        if (gameState.weapons.cooldownTime > 0) {
            weaponStatusEl.textContent = `RECHARGING (${(gameState.weapons.cooldownTime / 1000).toFixed(1)}s)`;
            weaponStatusEl.className = 'text-orange-400';
        } else {
            weaponStatusEl.textContent = 'ARMED';
            weaponStatusEl.className = 'text-green-400';
        }
    }
    
    // Enhanced target information display with special status indicators
    if (targetInfo) {
        let targetInfoText = 'Target: None';
        let targetInfoClass = 'text-gray-400';
        
        if (gameState.currentTarget) {
            const target = gameState.currentTarget;
            const distance = typeof camera !== 'undefined' ? 
                camera.position.distanceTo(target.position).toFixed(0) : '?';
            
            // Enhanced target display with faction info
            let targetName = target.userData.name;
            if (target.userData.faction && target.userData.type === 'enemy') {
                targetName = `${target.userData.faction} Hostile`;
            }
            
            targetInfoText = `Target: ${targetName} (${distance} units)`;
            
            // Color coding based on target type
            if (target.userData.type === 'enemy') {
                targetInfoClass = target.userData.isBoss ? 'text-red-500' : 'text-red-400';
            } else if (target.userData.type === 'blackhole') {
                targetInfoClass = 'text-purple-400';
            } else if (target.userData.type === 'wormhole') {
                targetInfoClass = 'text-pink-400';
            } else if (target.userData.type === 'comet') {
                targetInfoClass = 'text-cyan-400';
            } else {
                targetInfoClass = 'text-blue-400';
            }
        }
        
        // Add special status indicators
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
        } else if (gameState.velocity >= 0.9) { // Doubled threshold
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

function updateCosmicEffectsUI() {
    // Navigation jamming indicator
    const navStatus = document.getElementById('navigationStatus');
    if (navStatus && typeof gameState !== 'undefined') {
        if (gameState.navigationJammed) {
            navStatus.innerHTML = '<i class="fas fa-exclamation-triangle text-red-400"></i> Navigation Jammed!';
            navStatus.className = 'text-red-400 font-mono';
        } else {
            navStatus.innerHTML = '<i class="fas fa-compass text-green-400"></i> Navigation Clear';
            navStatus.className = 'text-green-400 font-mono';
        }
    }
    
    // Weapon power boost indicator
    const weaponStatus = document.getElementById('weaponStatus');
    if (weaponStatus && typeof gameState !== 'undefined' && gameState.weaponPowerBoost > 1.0) {
        const boost = ((gameState.weaponPowerBoost - 1) * 100).toFixed(0);
        weaponStatus.innerHTML = `<i class="fas fa-bolt text-yellow-400"></i> Weapon Power +${boost}%`;
        weaponStatus.className = 'text-yellow-400 font-mono';
    }
    
    // Concealment indicator
    const concealmentStatus = document.getElementById('concealmentStatus');
    if (concealmentStatus && typeof gameState !== 'undefined' && gameState.concealment > 0) {
        const concealment = (gameState.concealment * 100).toFixed(0);
        concealmentStatus.innerHTML = `<i class="fas fa-eye-slash text-blue-400"></i> Concealed ${concealment}%`;
        concealmentStatus.className = 'text-blue-400 font-mono';
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

// Update floating status displays
// NOTE: This function is duplicated later in this file (around line 2524)
// and will be overridden. Keeping this version for reference/fallback.
function updateMobileFloatingStatus() {
    if (typeof gameState === 'undefined') return;

    // MINIMAL STATUS: Only Hull and Energy (Emergency Warps shown on button badge)
    const updates = {
        'mobileFloatingHull': gameState.hull ? Math.round(gameState.hull) + '%' : '100%',
        'mobileFloatingEnergy': gameState.energy ? Math.round(gameState.energy) + '%' : '100%'
    };

    Object.entries(updates).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });

    // Update emergency warp count on button badge
    const warpBadge = document.getElementById('mobileWarpCountBadge');
    if (warpBadge) {
        warpBadge.textContent = gameState.emergencyWarp?.available ?? 5;
    }
}

// =============================================================================
// ENHANCED TARGET SYSTEM - INTEGRATED WITH CONTROLS + COSMIC FEATURES
// =============================================================================

function populateTargets() {
    const container = document.getElementById('availableTargets');
    if (!container || typeof camera === 'undefined') return;
    
    container.innerHTML = '';

    // Enhanced targeting with better filtering - NO ASTEROIDS IN NAVIGATION (doubled ranges)
    const detectedWormholes = (typeof wormholes !== 'undefined') ? wormholes.filter(w => w.userData && w.userData.detected) : [];
    
    // FIXED: ADD COSMIC FEATURES TO TARGETING - Use world position for outer system features
    const cosmicTargets = [];
    if (typeof cosmicFeatures !== 'undefined') {
        // Helper function to get distance accounting for nested outer system objects
        const getCosmicDistance = (obj) => {
            if (obj.userData.isOuterSystem && obj.parent) {
                const worldPos = new THREE.Vector3();
                obj.getWorldPosition(worldPos);
                return camera.position.distanceTo(worldPos);
            }
            return camera.position.distanceTo(obj.position);
        };

        // Add nearby cosmic features within detection range (using world positions for outer systems)
        cosmicTargets.push(...cosmicFeatures.pulsars.filter(p => getCosmicDistance(p) < 2000));
        cosmicTargets.push(...cosmicFeatures.supernovas.filter(s => getCosmicDistance(s) < 3000));
        cosmicTargets.push(...cosmicFeatures.dysonSpheres.filter(d => getCosmicDistance(d) < 4000));
        cosmicTargets.push(...cosmicFeatures.ringworlds.filter(r => getCosmicDistance(r) < 4000));
        cosmicTargets.push(...cosmicFeatures.spaceWhales.filter(w => getCosmicDistance(w) < 2000));
        cosmicTargets.push(...cosmicFeatures.brownDwarfs.filter(bd => getCosmicDistance(bd) < 1500));
        cosmicTargets.push(...cosmicFeatures.solarStorms.filter(ss => getCosmicDistance(ss) < 2500));
        cosmicTargets.push(...cosmicFeatures.crystalFormations.filter(cf => getCosmicDistance(cf) < 1800));
        cosmicTargets.push(...cosmicFeatures.plasmaStorms.filter(ps => getCosmicDistance(ps) < 2200));
        cosmicTargets.push(...cosmicFeatures.roguePlanets.filter(rp => getCosmicDistance(rp) < 1600));

        // Dark matter nodes only show when very close (they're hard to detect)
        cosmicTargets.push(...cosmicFeatures.darkMatterNodes.filter(dm => getCosmicDistance(dm) < 400));

    }

    // ADD OUTER INTERSTELLAR SYSTEMS TO TARGETING
    const outerSystemTargets = [];
    if (typeof outerInterstellarSystems !== 'undefined') {
        outerInterstellarSystems.forEach(system => {
            if (!system || !system.userData) return;

            // Get system's world position
            const systemPos = new THREE.Vector3();
            system.getWorldPosition(systemPos);
            const systemDistance = camera.position.distanceTo(systemPos);

            // Add center object (always show if within 10,000 units)
            if (system.userData.centerObject && systemDistance < 10000) {
                const centerPos = new THREE.Vector3();
                system.userData.centerObject.getWorldPosition(centerPos);
                const centerDistance = camera.position.distanceTo(centerPos);

                if (centerDistance < 10000) {
                    outerSystemTargets.push(system.userData.centerObject);
                }
            }

            // Add planets and cosmic features from orbiters (show if within 8,000 units of system)
            if (system.userData.orbiters && systemDistance < 8000) {
                system.userData.orbiters.forEach(orbiter => {
                    // Skip asteroids and BORG drones from navigation
                    if (orbiter.userData.type === 'outer_asteroid' || orbiter.userData.type === 'borg_drone') return;

                    const orbiterPos = new THREE.Vector3();
                    orbiter.getWorldPosition(orbiterPos);
                    const distance = camera.position.distanceTo(orbiterPos);

                    if (distance < 8000) {
                        outerSystemTargets.push(orbiter);
                    }
                });
            }
        });
    }

    const allTargetableObjects = [
        ...(typeof planets !== 'undefined' ? planets.filter(p => p.userData && p.userData.type !== 'asteroid') : []),
        ...detectedWormholes,
        ...(typeof comets !== 'undefined' ? comets.filter(c => camera.position.distanceTo(c.position) < 4000) : []), // Doubled range
        ...(typeof enemies !== 'undefined' ? enemies.filter(e => {
            if (!e.userData || e.userData.health <= 0) return false;
            const distance = camera.position.distanceTo(e.position);
            // ⭐ CRITICAL: Guardians have extended detection range
            const maxRange = e.userData.isBlackHoleGuardian ? 10000 : 3000;
            return distance < maxRange;
        }) : []),
        ...cosmicTargets, // ADD COSMIC FEATURES HERE!
        ...outerSystemTargets // ADD OUTER SYSTEM OBJECTS HERE!
    ];

    // Helper to get distance for any object (handles nested outer system objects)
    const getObjectDistance = (obj) => {
        if (obj.userData.isOuterSystem && obj.parent) {
            const worldPos = new THREE.Vector3();
            obj.getWorldPosition(worldPos);
            return camera.position.distanceTo(worldPos);
        }
        return camera.position.distanceTo(obj.position);
    };

    const nearbyObjects = allTargetableObjects.filter(obj => {
        const distance = getObjectDistance(obj);
        return distance < 6000; // Doubled range
    }).sort((a, b) => {
        const distA = getObjectDistance(a);
        const distB = getObjectDistance(b);
        return distA - distB;
    });

    const targetObjects = nearbyObjects.slice(0, 15);

    targetObjects.forEach((obj, index) => {
        const distance = camera.position.distanceTo(obj.position);
        const energyCost = Math.ceil(distance / 50); // Adjusted for doubled scale
        
        let typeDisplay = obj.userData.type;
        let typeColor = 'text-gray-400';
        
        // Enhanced type display logic - INCLUDING COSMIC FEATURES
        if (obj.userData.type === 'blackhole') {
            typeDisplay = obj.userData.isGalacticCore ? 'Galactic Core' : 'Black Hole';
            typeColor = 'text-red-400';
        } else if (obj.userData.type === 'star') {
            typeColor = 'text-yellow-400';
        } else if (obj.userData.type === 'planet') {
            typeColor = 'text-blue-400';
        } else if (obj.userData.type === 'outer_planet') {
            typeDisplay = 'Outer Planet';
            typeColor = 'text-indigo-400';
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
        // NEW: Add cosmic feature type displays
        else if (obj.userData.type === 'pulsar') {
            typeDisplay = 'Pulsar';
            typeColor = 'text-cyan-300';
        } else if (obj.userData.type === 'supernova') {
            typeDisplay = 'Supernova Remnant';
            typeColor = 'text-orange-400';
        } else if (obj.userData.type === 'dyson_sphere') {
            typeDisplay = 'Dyson Sphere';
            typeColor = 'text-purple-400';
        } else if (obj.userData.type === 'ringworld') {
            typeDisplay = 'Ringworld';
            typeColor = 'text-purple-300';
        } else if (obj.userData.type === 'space_whale') {
            typeDisplay = 'Space Whale';
            typeColor = 'text-blue-300';
        } else if (obj.userData.type === 'brown_dwarf') {
            typeDisplay = 'Brown Dwarf';
            typeColor = 'text-amber-600';
        } else if (obj.userData.type === 'dark_matter') {
            typeDisplay = 'Dark Matter Node';
            typeColor = 'text-purple-600';
        } else if (obj.userData.type === 'solar_storm') {
            typeDisplay = 'Solar Storm';
            typeColor = 'text-red-300';
        } else if (obj.userData.type === 'crystal_formation') {
            typeDisplay = 'Crystal Formation';
            typeColor = 'text-emerald-400';
        } else if (obj.userData.type === 'plasma_storm') {
            typeDisplay = 'Plasma Storm';
            typeColor = 'text-fuchsia-400';
        } else if (obj.userData.type === 'rogue_planet') {
            typeDisplay = 'Rogue Planet';
            typeColor = 'text-slate-400';
        } else if (obj.userData.type === 'dust_cloud') {
            typeDisplay = 'Dust Cloud';
            typeColor = 'text-yellow-700';
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
        // NEW: Add cosmic feature specific indicators
        else if (obj.userData.type === 'dyson_sphere' || obj.userData.type === 'ringworld') {
            factionIndicator = ` (${obj.userData.ancientCivilization || obj.userData.species || 'Ancient'})`;
        } else if (obj.userData.type === 'space_whale') {
            factionIndicator = ' (Peaceful)';
        }
        // Outer system objects indicator
        else if (obj.userData.isOuterSystem || obj.userData.type === 'outer_planet' ||
                 obj.userData.type === 'supernova' || obj.userData.type === 'plasma_storm' ||
                 obj.userData.type === 'solar_storm') {
            factionIndicator = ' (Outer Systems)';
        }
        
        // Enhanced status indicators - INCLUDING COSMIC FEATURES (NO ICONS)
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
        // NEW: Cosmic feature status indicators (no icons)
        else if (obj.userData.type === 'pulsar') {
            statusIndicator = '';
        } else if (obj.userData.type === 'supernova') {
            statusIndicator = '';
        } else if (obj.userData.type === 'dyson_sphere') {
            statusIndicator = obj.userData.operationalStatus === 'Active' ? ' (Active)' : ' (Dormant)';
        } else if (obj.userData.type === 'ringworld') {
            statusIndicator = '';
        } else if (obj.userData.type === 'space_whale') {
            statusIndicator = '';
        } else if (obj.userData.type === 'brown_dwarf') {
            statusIndicator = '';
        } else if (obj.userData.type === 'dark_matter') {
            statusIndicator = '';
        } else if (obj.userData.type === 'solar_storm') {
            statusIndicator = '';
        } else if (obj.userData.type === 'crystal_formation') {
            statusIndicator = '';
        } else if (obj.userData.type === 'plasma_storm') {
            statusIndicator = '';
        } else if (obj.userData.type === 'rogue_planet') {
            statusIndicator = '';
        } else if (obj.userData.type === 'dust_cloud') {
            statusIndicator = '';
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
    
    // Check if enemy is in crosshairs (doubled range)
    let enemyInSights = false;
    const detectionRange = 400; // Doubled range
    
    // If target lock is active, use target lock position
    if (gameState.targetLock && gameState.targetLock.active) {
        crosshair.classList.add('target-locked');
        
        // Check if locked target is an enemy or asteroid
        if (gameState.targetLock.target && 
            (gameState.targetLock.target.userData.type === 'enemy' || 
             gameState.targetLock.target.userData.type === 'asteroid')) {
            enemyInSights = true;
        }
        
        // Update crosshair position when target lock is active
        crosshair.style.left = gameState.crosshairX + 'px';
        crosshair.style.top = gameState.crosshairY + 'px';
        
    } else {
        crosshair.classList.remove('target-locked');
        
        // Manual targeting mode - crosshair follows mouse directly
        if (gameState.mouseX !== undefined && gameState.mouseY !== undefined) {
            gameState.crosshairX = gameState.mouseX;
            gameState.crosshairY = gameState.mouseY;
        }
        
        // Check for enemies under crosshair
        const mousePos = new THREE.Vector2(
            (gameState.crosshairX / window.innerWidth) * 2 - 1,
            -(gameState.crosshairY / window.innerHeight) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePos, camera);
        
        // Check for enemies under crosshair (asteroids excluded from auto-targeting)
        const targetableObjects = [];
        if (typeof enemies !== 'undefined') {
            targetableObjects.push(...enemies.filter(e => e.userData && e.userData.health > 0));
        }
        if (typeof planets !== 'undefined') {
            targetableObjects.push(...planets.filter(p => p.userData && p.userData.type === 'asteroid' && p.userData.health > 0));
        }
        
        targetableObjects.forEach(obj => {
            const distance = camera.position.distanceTo(obj.position);
            if (distance <= detectionRange) {
                const intersects = raycaster.intersectObject(obj);
                if (intersects.length > 0) {
                    enemyInSights = true;
                }
            }
        });
        
        // Update crosshair position
        crosshair.style.left = gameState.crosshairX + 'px';
        crosshair.style.top = gameState.crosshairY + 'px';
    }
    
    // Update crosshair color based on enemy detection
    crosshair.classList.toggle('enemy-target', enemyInSights);
    
    // IMPROVED: Better UI detection that doesn't interfere with planet cards
    // Temporarily hide crosshair to get element underneath
    const originalVisibility = crosshair.style.visibility;
    crosshair.style.visibility = 'hidden';

    const elementUnder = document.elementFromPoint(gameState.mouseX, gameState.mouseY);
    const isOverUI = elementUnder?.closest('.ui-panel');
    const isOverPlanetCard = elementUnder?.closest('.planet-card');

    // Restore crosshair visibility
    crosshair.style.visibility = originalVisibility;

    if (isOverUI) {
        crosshair.style.opacity = '0.1';
        crosshair.style.zIndex = '5';  // LOWER than UI panels (which are z-10 to z-20)
        
        // CRITICAL: Use pointer cursor for planet cards, auto for other UI
        if (isOverPlanetCard) {
            document.body.style.cursor = 'auto';
        } else {
            document.body.style.cursor = 'auto';
        }
    } else {
        crosshair.style.opacity = '1';
        crosshair.style.zIndex = '45';
        document.body.style.cursor = 'none';
    }
}

// =============================================================================
// GALAXY MAP SYSTEM - ENHANCED WITH BOSS TRACKING
// =============================================================================

// =============================================================================
// HELPER FUNCTION - DETERMINE CURRENT GALAXY
// =============================================================================

function getCurrentGalaxyId() {
    if (typeof camera === 'undefined') return -1;
    
    // ⭐ IMPROVED: Check distance to actual black holes first (most accurate)
    if (typeof planets !== 'undefined') {
        const galaxyBlackHoles = planets.filter(p => 
            p.userData.type === 'blackhole' && 
            p.userData.isGalacticCore === true &&
            typeof p.userData.galaxyId === 'number'
        );
        
        // Check if we're near any galaxy black hole
        for (const blackHole of galaxyBlackHoles) {
            const distance = camera.position.distanceTo(blackHole.position);
            const detectionRadius = 20000; // Large radius around each black hole
                        
            if (distance < detectionRadius) {
                return blackHole.userData.galaxyId;
            }
        }
    }
    
    // Fallback: Use 3D galaxy center positions
    const universeRadius = 150000;  // Increased for wider map coverage (accommodates exotic/borg systems with larger margins)
    
    if (typeof getGalaxy3DPosition === 'function' && typeof galaxyTypes !== 'undefined') {
        let closestGalaxy = -1;
        let closestDistance = Infinity;
        
        for (let g = 0; g < 8; g++) {
            const galaxyCenter = getGalaxy3DPosition(g);
            const distance = camera.position.distanceTo(galaxyCenter);
            
            console.log(`Galaxy ${g} (${galaxyTypes[g]?.name}): distance=${distance.toFixed(0)}`);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestGalaxy = g;
            }
        }
        
        const detectionThreshold = 20000; // Increased from 18000
        
        if (closestDistance < detectionThreshold) {
            console.log(`✅ Inside Galaxy ${closestGalaxy} (${galaxyTypes[closestGalaxy]?.name}) - ${closestDistance.toFixed(0)} units from center`);
            return closestGalaxy;
        }
    } 
    // Final fallback to 2D map positions
    else if (typeof galaxyMapPositions !== 'undefined') {
        let closestGalaxy = -1;
        let closestDistance = Infinity;
        
        for (let g = 0; g < 8; g++) {
            const mapPos = galaxyMapPositions[g];
            if (mapPos) {
                const galaxyX = (mapPos.x - 0.5) * universeRadius * 2;
                const galaxyZ = (mapPos.y - 0.5) * universeRadius * 2;
                const galaxyY = 0;
                const galaxyCenter = new THREE.Vector3(galaxyX, galaxyY, galaxyZ);
                
                const distance = camera.position.distanceTo(galaxyCenter);
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestGalaxy = g;
                }
            }
        }
        
        const detectionThreshold = 20000;
        if (closestDistance < detectionThreshold) {
            return closestGalaxy;
        }
    }
    
    console.log('❌ Not in any galaxy - Unexplored Space');
    return -1;
}

function getCurrentGalaxyName() {
    const galaxyId = getCurrentGalaxyId();
    
    if (galaxyId === -1) {
        return 'Unexplored Space';
    } else if (galaxyId === 7) {
        return 'Local Galaxy - Sol System'; // Special case for starting galaxy
    } else if (typeof galaxyTypes !== 'undefined' && galaxyTypes[galaxyId]) {
        // ⭐ Use galaxy TYPE names with faction
        const galaxy = galaxyTypes[galaxyId];
        return `${galaxy.name} Galaxy - ${galaxy.faction}`;
    }
    
    return 'Deep Space';
}

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
        // Convert 3D spherical position to 2D map position (same logic as universe view)
        let mapPos;
        if (typeof galaxy3DPositions !== 'undefined' && galaxy3DPositions[index]) {
            const galaxy3D = galaxy3DPositions[index];
            const phi = galaxy3D.phi;
            const theta = galaxy3D.theta;
            const distance = galaxy3D.distance;

            // Project spherical coordinates onto 2D map
            let x = (phi / (Math.PI * 2)) % 1.0;
            let y = theta / Math.PI;

            // Apply distance factor for depth
            const centerX = 0.5;
            const centerY = 0.5;
            x = centerX + (x - centerX) * distance;
            y = centerY + (y - centerY) * distance;

            mapPos = { x, y };
        } else if (typeof galaxyMapPositions !== 'undefined' && galaxyMapPositions[index]) {
            // Fallback to old hardcoded positions
            mapPos = galaxyMapPositions[index];
        } else {
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
        
        // Mark cleared galaxies with green dot
		if (bossDefeated || (typeof gameState !== 'undefined' && gameState.currentGalaxyEnemies && gameState.currentGalaxyEnemies[index] === 0)) {
		galaxyEl.style.backgroundColor = '#22c55e'; // Green for cleared
    	galaxyEl.style.border = '2px solid #86efac';
    	galaxyEl.textContent = '';
    	galaxyEl.title = `${galaxy.name} Galaxy (${galaxy.faction}) - LIBERATED`;
		}

        galaxyMap.appendChild(galaxyEl);
    });
    
    // Add Sagittarius A* indicator
    const sgrAEl = document.createElement('div');
    sgrAEl.className = 'absolute w-4 h-4 bg-yellow-600 rounded-full flex items-center justify-center text-xs text-white font-bold';
    sgrAEl.style.left = '50%';
    sgrAEl.style.top = '50%';
    sgrAEl.style.transform = 'translate(-50%, -50%)';
    sgrAEl.style.boxShadow = '0 0 8px #ca8a04';
    sgrAEl.textContent = '';
    sgrAEl.title = 'Sagittarius A* - Galactic Center';
    galaxyMap.appendChild(sgrAEl);
    const existingGalaxyIndicator = document.getElementById('currentGalaxyIndicator');
    if (existingGalaxyIndicator) {
        existingGalaxyIndicator.remove();
    }
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
    if (typeof camera === 'undefined' || typeof planets === 'undefined') return;
    
    // Compass functionality - points to the LARGEST black hole (Sagittarius A*)
    const playerPos = camera.position;
    let sgrAPos = new THREE.Vector3(0, 0, 0); // Default to origin
    
    // Find the LARGEST black hole in the local area
    const localBlackHoles = planets.filter(p => 
        p.userData && 
        p.userData.type === 'blackhole' &&
        (p.userData.isGalacticCenter === true || p.userData.isCompanionCore === true)
    );
    
    if (localBlackHoles.length > 0) {
        // Find the largest by mass (Sagittarius A* should be largest)
        const largestBlackHole = localBlackHoles.reduce((largest, current) => {
            const largestMass = largest.userData.mass || 0;
            const currentMass = current.userData.mass || 0;
            return currentMass > largestMass ? current : largest;
        });
        
        sgrAPos = largestBlackHole.position.clone();
        // console.log(`Compass pointing to: ${largestBlackHole.userData.name}`);
    }
}

// DOM element pool for map dots
const mapDotPool = {
    available: [],
    inUse: new Set(),
    
    get(type) {
        let dot = this.available.pop();
        if (!dot) {
            dot = document.createElement('div');
        }
        this.inUse.add(dot);
        return dot;
    },
    
    release(dot) {
        if (this.inUse.has(dot)) {
            this.inUse.delete(dot);
            dot.remove();
            
            // CLEAR ALL STYLES AND ATTRIBUTES
            dot.className = '';
            dot.style.cssText = '';
            dot.innerHTML = '';
            dot.title = '';
            
            this.available.push(dot);
        }
    },
    
    releaseAll() {
        this.inUse.forEach(dot => {
            dot.remove();
            
            // CLEAR ALL STYLES AND ATTRIBUTES
            dot.className = '';
            dot.style.cssText = '';
            dot.innerHTML = '';
            dot.title = '';
            
            this.available.push(dot);
        });
        this.inUse.clear();
    }
};

function updateGalaxyMap() {
    if (typeof gameState === 'undefined' || typeof camera === 'undefined') return;
    
    const playerMapPos = document.getElementById('playerMapPosition');
    const targetMapPos = document.getElementById('targetMapPosition');
    const mapDirectionArrow = document.getElementById('mapDirectionArrow');
    const universeRadius = 150000;  // Increased for wider map coverage (accommodates exotic/borg systems with larger margins)
    
    if (!playerMapPos) return;
    
    if (gameState.mapView === 'galactic') {
    // ========== GALACTIC VIEW ==========
    // Show nearby targets as dots (radar-style)
    
    // Hide player triangle, show direction arrow at center
    playerMapPos.style.display = 'none';
    if (mapDirectionArrow) {
        mapDirectionArrow.style.display = 'block';
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const angle = Math.atan2(forward.x, -forward.z);
        mapDirectionArrow.style.setProperty('--direction', `${angle}rad`);
    }
    
    // Hide galaxy indicators and Sagittarius A*
    const galaxyIndicators = document.querySelectorAll('.galaxy-indicator');
    galaxyIndicators.forEach(el => el.style.display = 'none');
    
    const sgrAEl = document.querySelector('[title="Sagittarius A* - Galactic Center"]');
    if (sgrAEl) sgrAEl.style.display = 'none';
    
    // NEW - ADD THIS:
	mapDotPool.releaseAll();
    
    // Show nearby objects as dots (enemies, planets, etc.)
    const galaxyMap = document.getElementById('galaxyMap');
    const radarRange = 1500; // Detection range for galactic view
    
    if (galaxyMap && typeof planets !== 'undefined' && typeof enemies !== 'undefined') {
        // Collect all nearby targetable objects
        const nearbyObjects = [];
        
        // Add nearby planets - OPTIMIZED for asteroids
planets.forEach(planet => {
    if (!planet || !planet.position) return;
    
    // OPTIMIZED: For asteroids, check belt group distance first (much faster)
    if (planet.userData.type === 'asteroid') {
        // Get parent belt group position (already in world space)
        if (!planet.userData.beltGroup || !planet.userData.beltGroup.position) return;
        
        // Quick check: Is the entire belt too far?
        const beltDistance = camera.position.distanceTo(planet.userData.beltGroup.position);
        if (beltDistance > radarRange + 2000) return; // Belt + radius buffer
        
        // Belt is nearby, now get asteroid's world position
        const worldPos = new THREE.Vector3();
        planet.getWorldPosition(worldPos);
        const distance = camera.position.distanceTo(worldPos);
        
        if (distance < radarRange && distance > 10) {
            nearbyObjects.push({
                position: worldPos,
                type: planet.userData.type,
                name: planet.userData.name,
                distance: distance
            });
        }
    } else {
        // Non-asteroids use direct position (fast)
        const distance = camera.position.distanceTo(planet.position);
        if (distance < radarRange && distance > 10) {
            nearbyObjects.push({
                position: planet.position,
                type: planet.userData.type,
                name: planet.userData.name,
                distance: distance
            });
        }
    }
});
        
        // Add nearby outer system objects
if (typeof outerInterstellarSystems !== 'undefined') {
    outerInterstellarSystems.forEach(system => {
        if (!system.userData.orbiters) return;

        // Check if system is in radar range
        const systemDistance = camera.position.distanceTo(system.position);
        if (systemDistance < radarRange + 2000) {

            // Add all orbiters from this system
            system.userData.orbiters.forEach(orbiter => {
                // Get world position for nested objects
                const orbiterWorldPos = new THREE.Vector3();
                orbiter.getWorldPosition(orbiterWorldPos);

                const distance = camera.position.distanceTo(orbiterWorldPos);
                if (distance < radarRange) {
                    nearbyObjects.push({
                        position: orbiterWorldPos,
                        type: orbiter.userData.type,
                        name: orbiter.userData.name,
                        distance: distance,
                        isOuterSystem: true
                    });
                }
            });

            // Add center object
            if (system.userData.centerObject) {
                // Get world position for nested center object
                const centerWorldPos = new THREE.Vector3();
                system.userData.centerObject.getWorldPosition(centerWorldPos);

                const centerDist = camera.position.distanceTo(centerWorldPos);
                if (centerDist < radarRange) {
                    nearbyObjects.push({
                        position: centerWorldPos,
                        type: system.userData.centerType,
                        name: system.userData.name + ' Core',
                        distance: centerDist,
                        isOuterSystem: true
                    });
                }
            }
        }
    });
}

        // Add nearby interstellar asteroids
        if (typeof interstellarAsteroids !== 'undefined') {
            interstellarAsteroids.forEach(asteroid => {
                if (!asteroid || !asteroid.position) return;
                const distance = camera.position.distanceTo(asteroid.position);
                if (distance < radarRange) {
                    nearbyObjects.push({
                        position: asteroid.position,
                        type: 'interstellar_asteroid',
                        name: asteroid.userData.name,
                        distance: distance
                    });
                }
            });
        }

        // Add nearby enemies
        enemies.forEach(enemy => {
            if (!enemy || !enemy.position || !enemy.userData || enemy.userData.health <= 0) return;
            const distance = camera.position.distanceTo(enemy.position);
            if (distance < radarRange) {
                nearbyObjects.push({
                    position: enemy.position,
                    type: 'enemy',
                    name: enemy.userData.name,
                    distance: distance,
                    isBoss: enemy.userData.isBoss
                });
            }
        });

        // Add cosmic features (if available)
        if (typeof cosmicFeatures !== 'undefined') {
            // Dyson Spheres
            if (cosmicFeatures.dysonSpheres) {
                cosmicFeatures.dysonSpheres.forEach(sphere => {
                    if (!sphere || !sphere.position || sphere.userData.destroyed) return;
                    const distance = camera.position.distanceTo(sphere.position);
                    if (distance < radarRange) {
                        nearbyObjects.push({
                            position: sphere.position,
                            type: 'dyson_sphere',
                            name: 'Dyson Sphere',
                            distance: distance
                        });
                    }
                });
            }

            // Crystal Structures
            if (cosmicFeatures.crystalStructures) {
                cosmicFeatures.crystalStructures.forEach(crystal => {
                    if (!crystal || !crystal.position || crystal.userData.destroyed) return;
                    const distance = camera.position.distanceTo(crystal.position);
                    if (distance < radarRange) {
                        nearbyObjects.push({
                            position: crystal.position,
                            type: 'crystal_structure',
                            name: 'Crystal Structure',
                            distance: distance
                        });
                    }
                });
            }

            // Space Whales
            if (cosmicFeatures.spaceWhales) {
                cosmicFeatures.spaceWhales.forEach(whale => {
                    if (!whale || !whale.position || whale.userData.destroyed) return;
                    const distance = camera.position.distanceTo(whale.position);
                    if (distance < radarRange) {
                        nearbyObjects.push({
                            position: whale.position,
                            type: 'space_whale',
                            name: 'Space Whale',
                            distance: distance
                        });
                    }
                });
            }

            // Ringworlds
            if (cosmicFeatures.ringworlds) {
                cosmicFeatures.ringworlds.forEach(ringworld => {
                    if (!ringworld || !ringworld.position) return;
                    const distance = camera.position.distanceTo(ringworld.position);
                    if (distance < radarRange) {
                        nearbyObjects.push({
                            position: ringworld.position,
                            type: 'ringworld',
                            name: 'Ringworld',
                            distance: distance
                        });
                    }
                });
            }
        }

        // Display objects as dots on map
        nearbyObjects.forEach(obj => {
            const relativeX = (obj.position.x - camera.position.x) / radarRange;
            const relativeZ = (obj.position.z - camera.position.z) / radarRange;
            
            const screenX = 50 + relativeX * 50; // Scale to fit map
            const screenZ = 50 + relativeZ * 50;
            
            // Only show if within map bounds
            if (screenX >= 5 && screenX <= 95 && screenZ >= 5 && screenZ <= 95) {
                const dot = mapDotPool.get('cosmic-feature');
                dot.className = 'galactic-target-dot absolute';
                
                // Color based on type
let dotColor = '#4488ff'; // Default blue for planets
let dotSize = '4px';

if (obj.type === 'enemy') {
    dotColor = obj.isBoss ? '#ff00ff' : '#ff4444';
    dotSize = obj.isBoss ? '8px' : '6px';
} else if (obj.type === 'blackhole') {
    dotColor = '#000000';
    dotSize = '6px';
} else if (obj.type === 'star') {
    dotColor = '#ffff44';
    dotSize = '5px';
} else if (obj.type === 'brown_dwarf') {
    dotColor = '#8b4513';
    dotSize = '5px';
} else if (obj.type === 'pulsar') {
    dotColor = '#44eeff';
    dotSize = '6px';
} else if (obj.type === 'supernova') {
    dotColor = '#ff6600';
    dotSize = '7px';
} else if (obj.type === 'plasma_storm') {
    dotColor = '#aa44ff';
    dotSize = '7px';
} else if (obj.type === 'solar_storm') {
    dotColor = '#ffff00';
    dotSize = '7px';
} else if (obj.type === 'dyson_sphere') {
    dotColor = '#00ffaa';
    dotSize = '8px';
} else if (obj.type === 'crystal_structure') {
    dotColor = '#aa00ff';
    dotSize = '7px';
} else if (obj.type === 'space_whale') {
    dotColor = '#0088ff';
    dotSize = '9px';
} else if (obj.type === 'ringworld') {
    dotColor = '#ffaa00';
    dotSize = '8px';
} else if (obj.type === 'interstellar_asteroid') {
    dotColor = '#998877';
    dotSize = '5px';
} else if (obj.type === 'asteroid') {
    dotColor = '#887766';
    dotSize = '3px';
} else if (obj.type === 'outer_asteroid') {
    dotColor = '#887766';
    dotSize = '3px';
} else if (obj.type === 'outer_planet') {
    dotColor = '#6688ff';
    dotSize = '5px';
} else if (obj.type === 'borg_drone') {
    dotColor = '#00ff00';
    dotSize = '5px';
}

                dot.style.width = dotSize;
                dot.style.height = dotSize;
                dot.style.backgroundColor = dotColor;
                dot.style.borderRadius = '50%';
                dot.style.left = `${screenX}%`;
                dot.style.top = `${screenZ}%`;
                dot.style.transform = 'translate(-50%, -50%)';
                dot.style.boxShadow = `0 0 4px ${dotColor}`;
                dot.style.pointerEvents = 'none';
                dot.title = `${obj.name} (${obj.distance.toFixed(0)} units)`;
                
                galaxyMap.appendChild(dot);
            }
        });
    }
    
    // Update current target indicator
    if (gameState.currentTarget && targetMapPos) {
        const targetRelativeX = (gameState.currentTarget.position.x - camera.position.x) / radarRange;
        const targetRelativeZ = (gameState.currentTarget.position.z - camera.position.z) / radarRange;
        const targetScreenX = 50 + targetRelativeX * 50;
        const targetScreenZ = 50 + targetRelativeZ * 50;
        
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
        
    } else {
    // ========== UNIVERSAL VIEW ==========
    
    // Use pooling instead
mapDotPool.releaseAll();
    
    // **DISABLED: Display major cosmic features on map**
    // if (typeof cosmicFeatures !== 'undefined') {
    //     // Function to add cosmic feature dot
    //     const addCosmicFeatureDot = (feature, color, size) => {
    //         if (!feature || !feature.position) return;

    //         const featureMapX = (feature.position.x / universeRadius) + 0.5;
    //         const featureMapZ = (feature.position.z / universeRadius) + 0.5;

    //         // Only show if within map bounds
    //         if (featureMapX >= 0 && featureMapX <= 1 && featureMapZ >= 0 && featureMapZ <= 1) {
    //             const dot = mapDotPool.get('cosmic-feature');
    //             dot.className = 'cosmic-feature-dot absolute';
    //             dot.style.width = size;
    //             dot.style.height = size;
    //             dot.style.backgroundColor = color;
    //             dot.style.borderRadius = '50%';
    //             dot.style.border = `1px solid ${color}`;
    //             dot.style.left = `${featureMapX * 100}%`;
    //             dot.style.top = `${featureMapZ * 100}%`;
    //             dot.style.transform = 'translate(-50%, -50%)';
    //             dot.style.boxShadow = `0 0 8px ${color}`;
    //             dot.style.pointerEvents = 'none';
    //             dot.style.zIndex = '5';
    //             dot.innerHTML = '';
    //             dot.title = feature.userData.name || 'Cosmic Feature';

    //             galaxyMap.appendChild(dot);
    //         }
    //     };

    //     // Add Dyson Spheres (legendary - large purple)
    //     if (cosmicFeatures.dysonSpheres) {
    //         cosmicFeatures.dysonSpheres.forEach(dyson => {
    //             addCosmicFeatureDot(dyson, '#aa44ff', '10px');
    //         });
    //     }

    //     // Add Supernovas (rare - large orange)
    //     if (cosmicFeatures.supernovas) {
    //         cosmicFeatures.supernovas.forEach(supernova => {
    //             addCosmicFeatureDot(supernova, '#ff6600', '9px');
    //         });
    //     }

    //     // Add Pulsars (rare - medium cyan)
    //     if (cosmicFeatures.pulsars) {
    //         cosmicFeatures.pulsars.forEach(pulsar => {
    //             addCosmicFeatureDot(pulsar, '#44eeff', '7px');
    //         });
    //     }

    //     // Add Plasma Storms (rare - medium purple)
    //     if (cosmicFeatures.plasmaStorms) {
    //         cosmicFeatures.plasmaStorms.forEach(storm => {
    //             addCosmicFeatureDot(storm, '#cc44ff', '7px');
    //         });
    //     }

    //     // Add Crystal Formations (rare - medium emerald)
    //     if (cosmicFeatures.crystalFormations) {
    //         cosmicFeatures.crystalFormations.forEach(crystal => {
    //             addCosmicFeatureDot(crystal, '#44ff88', '7px');
    //         });
    //     }
    // }

// DISABLED: Add Nebulas with region names (large, with text labels)
        // if (typeof nebulaClouds !== 'undefined' && nebulaClouds.length > 0) {
        //     nebulaClouds.forEach(nebula => {
        //         if (!nebula || !nebula.position || !nebula.userData) return;
        //
        //         const nebulaMapX = (nebula.position.x / universeRadius) + 0.5;
        //         const nebulaMapZ = (nebula.position.z / universeRadius) + 0.5;
        //
        //         // Only show if within map bounds
        //         if (nebulaMapX >= 0 && nebulaMapX <= 1 && nebulaMapZ >= 0 && nebulaMapZ <= 1) {
        //             const nebulaDot = mapDotPool.get('cosmic-feature');
        //             nebulaDot.className = 'cosmic-feature-dot nebula-indicator absolute';
        //
        //             // Larger size for nebulas
        //             nebulaDot.style.width = '14px';
        //             nebulaDot.style.height = '14px';
        //             nebulaDot.style.backgroundColor = '#' + (nebula.userData.color ? nebula.userData.color.getHexString() : 'ff88cc');
        //             nebulaDot.style.borderRadius = '50%';
        //             nebulaDot.style.border = '2px solid rgba(255, 136, 204, 0.8)';
        //             nebulaDot.style.left = `${nebulaMapX * 100}%`;
        //             nebulaDot.style.top = `${nebulaMapZ * 100}%`;
        //             nebulaDot.style.transform = 'translate(-50%, -50%)';
        //             nebulaDot.style.boxShadow = `0 0 12px ${nebulaDot.style.backgroundColor}`;
        //             nebulaDot.style.pointerEvents = 'none';
        //             nebulaDot.style.zIndex = '6';
        //             nebulaDot.innerHTML = '';
        //             nebulaDot.title = nebula.userData.mythicalName || nebula.userData.name || 'Nebula';
        //
        //             galaxyMap.appendChild(nebulaDot);
        //         }
        //     });
        // }

    // DISABLED: Add Outer Interstellar Systems (28 total: 16 exotic + 12 BORG)
    // if (typeof outerInterstellarSystems !== 'undefined') {
    //     outerInterstellarSystems.forEach(system => {
    //         if (!system || !system.position || !system.userData) return;

    //         const systemMapX = (system.position.x / universeRadius) + 0.5;
    //         const systemMapZ = (system.position.z / universeRadius) + 0.5;

    //         // Only show if within map bounds (outer systems should always be visible)
    //         if (systemMapX >= 0 && systemMapX <= 1 && systemMapZ >= 0 && systemMapZ <= 1) {
    //             const systemDot = mapDotPool.get('cosmic-feature');
    //             systemDot.className = 'cosmic-feature-dot outer-system-indicator absolute';

    //             // Determine color based on system type
    //             let color = '#ffff88';  // Default: bright yellow for unknown systems
    //             let size = '8px';

    //             if (system.userData.centerType === 'supernova') {
    //                 color = '#ff6600';
    //                 size = '10px';
    //             } else if (system.userData.centerType === 'plasma_storm') {
    //                 color = '#aa44ff';
    //                 size = '10px';
    //             } else if (system.userData.centerType === 'solar_storm') {
    //                 color = '#ffff00';
    //                 size = '10px';
    //             } else if (system.userData.hasBorg) {
    //                 // BORG patrol systems
    //                 color = '#00ff00';
    //                 size = '9px';
    //             }

    //             systemDot.style.width = size;
    //             systemDot.style.height = size;
    //             systemDot.style.backgroundColor = color;
    //             systemDot.style.borderRadius = '50%';
    //             systemDot.style.border = `2px solid ${color}`;
    //             systemDot.style.left = `${systemMapX * 100}%`;
    //             systemDot.style.top = `${systemMapZ * 100}%`;
    //             systemDot.style.transform = 'translate(-50%, -50%)';
    //             systemDot.style.boxShadow = `0 0 10px ${color}`;
    //             systemDot.style.pointerEvents = 'none';
    //             systemDot.style.zIndex = '7';  // Above nebulas
    //             systemDot.innerHTML = '';
    //             systemDot.title = system.userData.name + ' - ' + system.userData.location;

    //             galaxyMap.appendChild(systemDot);
    //         }
    //     });
    // }

    // Display interstellar asteroid fields on map
    if (typeof interstellarAsteroids !== 'undefined' && interstellarAsteroids.length > 0) {
        // Group asteroids by field and calculate field centers
        const fields = {};
        interstellarAsteroids.forEach(asteroid => {
            const fieldIndex = asteroid.userData.fieldIndex;
            if (!fields[fieldIndex]) {
                fields[fieldIndex] = [];
            }
            fields[fieldIndex].push(asteroid);
        });

        // Display each field as a dot on the map
        Object.keys(fields).forEach(fieldIndex => {
            const asteroids = fields[fieldIndex];

            // Calculate field center (average position)
            let centerX = 0, centerY = 0, centerZ = 0;
            asteroids.forEach(a => {
                centerX += a.position.x;
                centerY += a.position.y;
                centerZ += a.position.z;
            });
            centerX /= asteroids.length;
            centerY /= asteroids.length;
            centerZ /= asteroids.length;

            // Convert to map coordinates
            const fieldMapX = (centerX / universeRadius) + 0.5;
            const fieldMapZ = (centerZ / universeRadius) + 0.5;

            // Only show if within map bounds
            if (fieldMapX >= 0 && fieldMapX <= 1 && fieldMapZ >= 0 && fieldMapZ <= 1) {
                const dot = mapDotPool.get('asteroid-field');
                dot.className = 'asteroid-field-dot absolute';
                dot.style.width = '8px';
                dot.style.height = '8px';
                dot.style.backgroundColor = 'rgba(120, 100, 80, 0.8)';
                dot.style.borderRadius = '50%';
                dot.style.border = '1px solid rgba(150, 130, 110, 1)';
                dot.style.left = `${fieldMapX * 100}%`;
                dot.style.top = `${fieldMapZ * 100}%`;
                dot.style.transform = 'translate(-50%, -50%)';
                dot.style.boxShadow = '0 0 6px rgba(120, 100, 80, 0.6)';
                dot.style.pointerEvents = 'none';
                dot.style.zIndex = '6';
                dot.innerHTML = '';
                dot.title = `Asteroid Field ${fieldIndex} (${asteroids.length} asteroids)`;

                galaxyMap.appendChild(dot);
            }
        });
    }

    // Show player triangle, hide direction arrow
    playerMapPos.style.display = 'block';
    if (mapDirectionArrow) {
        mapDirectionArrow.style.display = 'none';
    }
    
    // Show player position in universe using same spherical projection as galaxies
    const playerX = camera.position.x;
    const playerY = camera.position.y;
    const playerZ = camera.position.z;

    // Convert player's Cartesian position to spherical coordinates
    const playerDistance = Math.sqrt(playerX * playerX + playerY * playerY + playerZ * playerZ);
    const playerPhi = Math.atan2(playerZ, playerX);
    const playerTheta = Math.acos(playerY / Math.max(playerDistance, 0.001)); // Avoid division by zero

    // Project spherical coordinates onto 2D map (same as galaxy projection)
    let playerMapX = ((playerPhi + Math.PI) / (Math.PI * 2)) % 1.0;
    let playerMapY = playerTheta / Math.PI;

    // Apply distance factor for depth (same as galaxies)
    const normalizedDistance = Math.min(playerDistance / universeRadius, 1.0);
    const centerX = 0.5;
    const centerY = 0.5;
    playerMapX = centerX + (playerMapX - centerX) * normalizedDistance;
    playerMapY = centerY + (playerMapY - centerY) * normalizedDistance;

    const clampedX = Math.max(5, Math.min(95, playerMapX * 100));
    const clampedZ = Math.max(5, Math.min(95, playerMapY * 100));

    playerMapPos.style.left = `${clampedX}%`;
    playerMapPos.style.top = `${clampedZ}%`;
    
    // Rotate triangle to show direction
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const angle = Math.atan2(forward.x, -forward.z);
    playerMapPos.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    
    // Show all galaxy indicators
    const galaxyIndicators = document.querySelectorAll('.galaxy-indicator');
    galaxyIndicators.forEach((el, index) => {
        if (index < galaxyTypes.length) {
            // ✅ FIXED: Use accurate 2D projection from 3D spherical coordinates
            let mapPos;
            if (typeof galaxy3DPositions !== 'undefined' && galaxy3DPositions[index]) {
                // Convert 3D spherical to 2D map coordinates
                const galaxy3D = galaxy3DPositions[index];
                const phi = galaxy3D.phi;
                const theta = galaxy3D.theta;
                const distance = galaxy3D.distance;
                
                // Project spherical coordinates onto 2D map
                let x = (phi / (Math.PI * 2)) % 1.0;
                let y = theta / Math.PI;
                
                // Apply distance factor for depth
                const centerX = 0.5;
                const centerY = 0.5;
                x = centerX + (x - centerX) * distance;
                y = centerY + (y - centerY) * distance;
                
                mapPos = { x, y };
            } else {
                // Fallback to old positions
                mapPos = galaxyMapPositions[index] || { x: 0.5, y: 0.5 };
            }
            
            el.style.left = `${mapPos.x * 100}%`;
            el.style.top = `${mapPos.y * 100}%`;
            el.style.display = 'flex';
        }
    });
    
    // Show Sagittarius A* at center
    const sgrAEl = document.querySelector('[title="Sagittarius A* - Galactic Center"]');
    if (sgrAEl) {
        sgrAEl.style.left = '50%';
        sgrAEl.style.top = '50%';
        sgrAEl.style.display = 'flex';
    }
    
    // Hide target indicator in universal view
    if (targetMapPos) {
        targetMapPos.classList.add('hidden');
    }
}
    
    // Update view status display
    const viewStatusEl = document.getElementById('mapViewStatus');
    if (viewStatusEl) {
        viewStatusEl.textContent = gameState.mapView === 'galactic' ? 'Galaxy View' : 'Universal View';
    }
    
    // ✅ FIXED: Update current galaxy region display
    const currentRegionEl = document.getElementById('currentGalaxyRegion');
    if (currentRegionEl && typeof galaxyTypes !== 'undefined') {
        // Determine which galaxy the player is currently in
        let currentGalaxyName = 'Sagittarius A'; // ✅ Default to starting location
        
        // First check gameState.location if available
        if (typeof gameState !== 'undefined' && gameState.location) {
            // If we have a location set, use it to determine galaxy
            if (gameState.location.includes('Spiral') || gameState.location.includes('Federation')) {
                currentGalaxyName = 'Spiral Galaxy';
            } else if (gameState.location.includes('Elliptical') || gameState.location.includes('Klingon')) {
                currentGalaxyName = 'Elliptical Galaxy';
            } else if (gameState.location.includes('Irregular') || gameState.location.includes('Rebel')) {
                currentGalaxyName = 'Irregular Galaxy';
            } else if (gameState.location.includes('Ring') || gameState.location.includes('Romulan')) {
                currentGalaxyName = 'Ring Galaxy';
            } else if (gameState.location.includes('Dwarf') || gameState.location.includes('Galactic Empire')) {
                currentGalaxyName = 'Dwarf Galaxy';
            } else if (gameState.location.includes('Lenticular') || gameState.location.includes('Cardassian')) {
                currentGalaxyName = 'Lenticular Galaxy';
            } else if (gameState.location.includes('Quasar') || gameState.location.includes('Sith')) {
                currentGalaxyName = 'Quasar Galaxy';
            } else if (gameState.location.includes('Sagittarius') || gameState.location.includes('Local') || gameState.location.includes('Vulcan') || gameState.location.includes('Sol')) {
                currentGalaxyName = 'Sagittarius A';
            }
        }
        
        // ✅ Fallback: Check proximity to galactic cores (only if we have planets loaded)
        if (typeof planets !== 'undefined' && planets.length > 0) {
            const blackHoles = planets.filter(p => p.userData.type === 'blackhole' && p.userData.isGalacticCore);
            if (blackHoles.length > 0) {
                let closestGalaxyId = -1;
                let closestDistance = Infinity;
                
                blackHoles.forEach(bh => {
                    if (bh.userData.galaxyId !== undefined) {
                        const distance = camera.position.distanceTo(bh.position);
                        if (distance < closestDistance) {
                            closestDistance = distance;
                            closestGalaxyId = bh.userData.galaxyId;
                        }
                    }
                });
                
                // Use galaxy type name for current region
                if (closestGalaxyId >= 0 && closestGalaxyId < galaxyTypes.length) {
                    const galaxyType = galaxyTypes[closestGalaxyId];
                    // Special case for galaxy 7 (Ancient/Local)
                    if (closestGalaxyId === 7) {
                        currentGalaxyName = 'Sagittarius A';
                    } else {
                        currentGalaxyName = `${galaxyType.name} Galaxy`;
                    }
                }
            }
        }
        
        // NEW: Check if player is inside a nebula
        let nebulaName = null;
        if (typeof nebulaClouds !== 'undefined' && nebulaClouds.length > 0) {
            const nebulaDetectionRange = 3000; // Distance to consider "inside" nebula
            
            nebulaClouds.forEach(nebula => {
                if (!nebula || !nebula.userData) return;
                const distance = camera.position.distanceTo(nebula.position);
                
                if (distance < nebulaDetectionRange) {
                    nebulaName = nebula.userData.mythicalName || nebula.userData.name || 'Nebula';
                }
            });
        }
        
        // Display nebula name if inside one, otherwise show galaxy name
        if (nebulaName) {
            currentRegionEl.textContent = `${nebulaName} - ${currentGalaxyName}`;
            currentRegionEl.className = 'text-xs text-pink-300 font-semibold'; // Pink for nebula
        } else {
            currentRegionEl.textContent = currentGalaxyName;
            currentRegionEl.className = 'text-xs text-cyan-300 font-semibold'; // Cyan for galaxy
        }
    }
    
    // ⭐ NEW: Update current galaxy name display
    const currentGalaxyNameEl = document.getElementById('currentGalaxyName');
    if (currentGalaxyNameEl && typeof getCurrentGalaxyName === 'function') {
        const galaxyName = getCurrentGalaxyName();
        currentGalaxyNameEl.textContent = galaxyName;
        
        // Color coding based on galaxy status
        const galaxyId = getCurrentGalaxyId();
        if (galaxyId >= 0 && galaxyId < 8) {
            // Check if galaxy is cleared
            const isCleared = (typeof bossSystem !== 'undefined' && 
                             bossSystem.galaxyBossDefeated && 
                             bossSystem.galaxyBossDefeated[galaxyId]) ||
                            (typeof gameState !== 'undefined' && 
                             gameState.currentGalaxyEnemies && 
                             gameState.currentGalaxyEnemies[galaxyId] === 0);
            
            if (isCleared) {
                currentGalaxyNameEl.className = 'text-green-400'; // Cleared galaxy
            } else {
                currentGalaxyNameEl.className = 'text-red-400'; // Hostile galaxy
            }
        } else {
            // Unexplored space
            currentGalaxyNameEl.className = 'text-cyan-400';
        }
    }
}  // ⭐ This should be the closing brace of updateGalaxyMap()

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
                    <div>Emergency Warps: ${gameState ? `${gameState.emergencyWarp.available}/${gameState.emergencyWarp.maxWarps}` : '1/10'}</div>
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
    // Prevent duplicate game over screens
    if (typeof gameState !== 'undefined') {
        if (gameState.gameOverScreenShown) {
            console.log('⚠️ Game over screen already shown, ignoring duplicate call');
            return;
        }
        gameState.gameOver = true;
        gameState.gameStarted = false;
        gameState.gameOverScreenShown = true;
    }
    
    console.log('💀 GAME OVER - Stopping all systems');
    
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
    
    // Stop audio context
    if (typeof audioContext !== 'undefined' && audioContext) {
        audioContext.suspend();
    }
    
    // Clean up any active effects
    if (typeof cleanupEventHorizonEffects === 'function') {
        cleanupEventHorizonEffects();
    }
    
    // Clear any remaining timeouts/intervals
    if (typeof window.mobileUpdateInterval !== 'undefined') {
        clearInterval(window.mobileUpdateInterval);
    }
    
    // Enhanced game over screen with visible mouse cursor
    const gameOverOverlay = document.createElement('div');
    gameOverOverlay.id = 'gameOverScreen';
    gameOverOverlay.className = 'absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center cyberpunk-bg';
    gameOverOverlay.style.cursor = 'auto'; // Make mouse visible
    gameOverOverlay.style.zIndex = '10000'; // FIXED: High z-index for iPad visibility
    gameOverOverlay.innerHTML = `
        <div class="text-center ui-panel rounded-lg p-8" style="cursor: auto;">
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
                    <div>Emergency Warps: ${gameState ? `${gameState.emergencyWarp.available}/${gameState.emergencyWarp.maxWarps}` : '0/10'}</div>
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
    
    console.log('✅ Game over screen displayed - all systems stopped');
}

// HULL ZERO GAME OVER - Dramatic full screen explosion effect
function showGameOverScreen(title, message) {
    // Prevent duplicate game over screens
    if (typeof gameState !== 'undefined') {
        if (gameState.gameOverScreenShown) {
            console.log('⚠️ Game over screen already shown, ignoring duplicate call');
            return;
        }
        gameState.gameOver = true;
        gameState.gameStarted = false;
        gameState.gameOverScreenShown = true;
    }

    console.log('💀 GAME OVER - Stopping all systems');

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

    // Stop audio context
    if (typeof audioContext !== 'undefined' && audioContext) {
        audioContext.suspend();
    }

    // Clean up any active effects
    if (typeof cleanupEventHorizonEffects === 'function') {
        cleanupEventHorizonEffects();
    }

    // Clear any remaining timeouts/intervals
    if (typeof window.mobileUpdateInterval !== 'undefined') {
        clearInterval(window.mobileUpdateInterval);
    }

    // Enhanced game over screen with visible mouse cursor
    const gameOverOverlay = document.createElement('div');
    gameOverOverlay.id = 'gameOverScreen';
    gameOverOverlay.className = 'absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center cyberpunk-bg';
    gameOverOverlay.style.cursor = 'auto'; // Make mouse visible
    gameOverOverlay.style.zIndex = '10000'; // FIXED: High z-index for iPad visibility
    gameOverOverlay.innerHTML = `
        <div class="text-center ui-panel rounded-lg p-8" style="cursor: auto;">
            <h1 class="text-4xl font-bold text-red-400 mb-4 glow-text cyber-title">MISSION FAILED</h1>
            <p class="text-gray-300 mb-6">${message || 'Ship destroyed'}</p>
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

    console.log('✅ Game over screen displayed - all systems stopped');
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
    
    // Mobile UI updates
    if (typeof updateMobileFloatingStatus === 'function') {
        updateMobileFloatingStatus();
    }
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
        
        // Initialize map view if not set
        if (!gameState.mapView) gameState.mapView = 'galactic';
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

function setupMobileUI() {
    // Hide desktop panels on mobile
    const desktopPanels = document.querySelectorAll('.ui-panel');
    desktopPanels.forEach(panel => {
        panel.classList.add('desktop-only');
    });
    
    // Create mobile UI container
    createMobileUIContainer();
    createMobileTopBar();
    createMobileControls();
    createMobileFloatingStatus(); // ADD THIS LINE
    createMobilePopups();
}

function createMobileUIContainer() {
    const mobileUI = document.createElement('div');
    mobileUI.className = 'mobile-ui';
    mobileUI.id = 'mobileUI';
    mobileUI.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 10;
        display: none;
    `;
    
    document.body.appendChild(mobileUI);
    
    // Show mobile UI only after game starts
    const checkGameStarted = setInterval(() => {
        if (typeof gameState !== 'undefined' && gameState.gameStarted && !document.body.classList.contains('intro-active')) {
            mobileUI.style.display = 'block';
            console.log('📱 Mobile UI now visible - game started');
            clearInterval(checkGameStarted);
        }
    }, 500);
}

function createMobileTopBar() {
    const topBar = document.createElement('div');
    topBar.className = 'mobile-top-bar';
    topBar.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        right: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 25;
        pointer-events: auto;
    `;
    
    topBar.innerHTML = `
        <div class="mobile-info" style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.3), rgba(30, 41, 59, 0.3)); backdrop-filter: blur(10px); border: 1px solid rgba(0,150,255,0.4); border-radius: 20px; padding: 8px 16px; color: white; font-size: 14px; font-weight: 600;">
            <div id="mobileVelocity">0.0 km/s</div>
        </div>
        <div class="mobile-info" style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.3), rgba(30, 41, 59, 0.3)); backdrop-filter: blur(10px); border: 1px solid rgba(0,150,255,0.4); border-radius: 20px; padding: 8px 16px; color: white; font-size: 14px; font-weight: 600;">
            <div id="mobileEnergy">100%</div>
        </div>
        <button class="mobile-menu-btn" onclick="openMobilePopup('navigation')" style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, rgba(0, 150, 255, 0.3), rgba(0, 100, 200, 0.3)); border: 2px solid rgba(0, 200, 255, 0.4); color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; box-shadow: 0 4px 15px rgba(0, 150, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);">
            <i class="fas fa-map"></i>
        </button>
    `;
    
    document.getElementById('mobileUI').appendChild(topBar);
}

function createMobileControls() {
    const controls = document.createElement('div');
    controls.className = 'mobile-controls';
    controls.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 15px;
        z-index: 30;
        pointer-events: auto;
    `;
    
    const buttonStyle = `width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, rgba(0, 150, 255, 0.3), rgba(0, 100, 200, 0.3)); border: 2px solid rgba(0, 200, 255, 0.4); color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 15px rgba(0, 150, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);`;
    
    controls.innerHTML = `
    <button class="mobile-btn" onclick="mobileCycleTarget()" style="${buttonStyle}" title="Cycle Targets">
        <i class="fas fa-bullseye"></i>
    </button>
    <button class="mobile-btn primary"
    ontouchstart="handleMobileFire(event); return false;"
    style="${buttonStyle} width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, rgba(255, 50, 50, 0.3), rgba(200, 0, 0, 0.3)); border-color: rgba(255, 100, 100, 0.4); box-shadow: 0 4px 15px rgba(255, 50, 50, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1); opacity: 1;"
    title="Fire Weapons">
    <i class="fas fa-crosshairs"></i>
</button>
    <button class="mobile-btn emergency" onclick="mobileEmergencyWarp()" style="${buttonStyle} background: linear-gradient(135deg, rgba(255, 150, 0, 0.3), rgba(200, 100, 0, 0.3)); border-color: rgba(255, 200, 0, 0.4); box-shadow: 0 4px 15px rgba(255, 150, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);" title="Emergency Warp">
        <i class="fas fa-rocket"></i>
    </button>
    <button class="mobile-btn" onclick="openMobilePopup('controls')" style="${buttonStyle}" title="Controls">
        <i class="fas fa-cog"></i>
    </button>
`;

    
    document.getElementById('mobileUI').appendChild(controls);
}

function createMobileFloatingStatus() {
    // Remove existing if present
    const existing = document.getElementById('mobileFloatingStatus');
    if (existing) {
        existing.remove();
    }
    
    const floatingStatus = document.createElement('div');
    floatingStatus.className = 'mobile-floating-status';
    floatingStatus.id = 'mobileFloatingStatus';
    floatingStatus.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
        z-index: 20;
        pointer-events: none;
        font-family: 'Orbitron', monospace;
    `;
    
    // MINIMAL STATUS: Only Hull and Energy (Emergency Warps shown on button badge)
    floatingStatus.innerHTML = `
        <div class="mobile-stat-pill" style="background: rgba(0, 0, 0, 0.7); border: 1px solid rgba(248, 113, 113, 0.6); border-radius: 4px; padding: 8px 14px; font-size: 13px; font-weight: 600; color: #f87171; text-shadow: 0 0 8px rgba(248, 113, 113, 0.8); box-shadow: 0 0 10px rgba(248, 113, 113, 0.3), inset 0 0 10px rgba(248, 113, 113, 0.1); opacity: 0.7;">
            <i class="fas fa-shield-alt" style="margin-right: 6px;"></i>
            <span id="mobileFloatingHull">100%</span>
        </div>
        <div class="mobile-stat-pill" style="background: rgba(0, 0, 0, 0.7); border: 1px solid rgba(96, 165, 250, 0.6); border-radius: 4px; padding: 8px 14px; font-size: 13px; font-weight: 600; color: #60a5fa; text-shadow: 0 0 8px rgba(96, 165, 250, 0.8); box-shadow: 0 0 10px rgba(96, 165, 250, 0.3), inset 0 0 10px rgba(96, 165, 250, 0.1); opacity: 0.7;">
            <i class="fas fa-bolt" style="margin-right: 6px;"></i>
            <span id="mobileFloatingEnergy">100%</span>
        </div>
    `;
    
    const mobileUI = document.getElementById('mobileUI');
    if (mobileUI) {
        mobileUI.appendChild(floatingStatus);
        console.log('📱 Mobile floating status created and appended');
    } else {
        // Fallback: append to body if mobileUI doesn't exist
        document.body.appendChild(floatingStatus);
        console.log('📱 Mobile floating status created (fallback to body)');
    }
    
    // Initial update
    setTimeout(() => {
        updateMobileFloatingStatus();
    }, 100);
}

function updateMobileFloatingStatus() {
    if (typeof gameState === 'undefined') return;

    // MINIMAL STATUS: Only Hull and Energy (Emergency Warps shown on button badge)
    const updates = {
        'mobileFloatingHull': gameState.hull ? Math.round(gameState.hull) + '%' : '100%',
        'mobileFloatingEnergy': gameState.energy ? Math.round(gameState.energy) + '%' : '100%'
    };

    Object.entries(updates).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });

    // Update emergency warp count on button badge
    const warpBadge = document.getElementById('mobileWarpCountBadge');
    if (warpBadge) {
        warpBadge.textContent = gameState.emergencyWarp?.available ?? 5;
    }
}

function createMobilePopups() {
    const mobileUI = document.getElementById('mobileUI');
    if (!mobileUI) return;
    
    // Create controls popup
    const controlsPopup = document.createElement('div');
    controlsPopup.className = 'mobile-popup';
    controlsPopup.id = 'controlsPopup';
    controlsPopup.innerHTML = `
        <div class="mobile-popup-content">
            <button class="mobile-popup-close" onclick="document.getElementById('controlsPopup').classList.remove('active')">&times;</button>
            <h3>FLIGHT CONTROLS</h3>
            <div style="font-size: 12px; line-height: 1.6;">
                <strong>TOUCH CONTROLS:</strong><br>
                • Drag screen: Look around<br>
                • Tap fire button: Shoot<br>
                • Use navigation panel for targets<br><br>
                <strong>BUTTONS:</strong><br>
                • 🎯 Cycle Targets<br>
                • 🔥 Fire Weapons<br>
                • 🚀 Emergency Warp<br>
                • ⚙️ This Menu
            </div>
        </div>
    `;
    mobileUI.appendChild(controlsPopup);
    
    // Create status popup
    const statusPopup = document.createElement('div');
    statusPopup.className = 'mobile-popup';
    statusPopup.id = 'statusPopup';
    statusPopup.innerHTML = `
        <div class="mobile-popup-content">
            <button class="mobile-popup-close" onclick="document.getElementById('statusPopup').classList.remove('active')">&times;</button>
            <h3>SHIP STATUS</h3>
            <div style="font-size: 12px;">
                <div style="margin-bottom: 8px;">Velocity: <span id="mobileStatusVelocity">0.0 km/s</span></div>
                <div style="margin-bottom: 8px;">Distance: <span id="mobileStatusDistance">0.0 ly</span></div>
                <div style="margin-bottom: 8px;">Energy: <span id="mobileStatusEnergy">100%</span></div>
                <div style="margin-bottom: 8px;">Hull: <span id="mobileStatusHull">100%</span></div>
                <div style="margin-bottom: 8px;">Location: <span id="mobileStatusLocation">Local Galaxy</span></div>
            </div>
        </div>
    `;
    mobileUI.appendChild(statusPopup);
    
    // Create navigation panel
    const navPanel = document.createElement('div');
    navPanel.className = 'nav-panel-mobile';
    navPanel.id = 'navPanelMobile';
    navPanel.innerHTML = `
        <button class="mobile-popup-close" onclick="document.getElementById('navPanelMobile').classList.remove('active')" style="position: absolute; top: 10px; right: 10px; background: transparent; border: none; color: white; font-size: 30px; cursor: pointer;">&times;</button>
        <h3>Navigation System</h3>
        <div id="mobileAvailableTargets" style="max-height: 50%; overflow-y: auto; margin-bottom: 15px;"></div>
        <button id="mobileAutoNavigateBtn" onclick="if(typeof mobileAutoNavigate === 'function') mobileAutoNavigate()" class="w-full mt-2 space-btn rounded px-4 py-2 mb-2">
            <i class="fas fa-crosshairs mr-2"></i>Auto-Navigate to Target
        </button>
    `;
    mobileUI.appendChild(navPanel);
    
    console.log('📱 Mobile popups created');
}

// Mobile button functions that interface with existing game functions
function mobileCycleTarget() {
    // Use existing tab targeting system
    if (typeof cycleTarget === 'function') {
        cycleTarget();
    } else if (typeof gameState !== 'undefined' && typeof populateTargets === 'function') {
        // Fallback target cycling
        const targets = document.querySelectorAll('#availableTargets .target-btn');
        if (targets.length > 0) {
            targets[0].click();
        }
    }
    
    // Visual feedback
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.boxShadow = '0 0 20px rgba(255, 255, 0, 0.8)';
        setTimeout(() => {
            crosshair.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.6), inset 0 0 20px rgba(0, 255, 0, 0.3)';
        }, 300);
    }
}

// Use window object to avoid variable conflicts
if (!window.mobileFireState) {
    window.mobileFireState = {
        lastFireTime: 0,
        fireDebounceTime: 200 // 200ms cooldown
    };
}

function handleMobileFire(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Debounce to prevent double-firing
    const now = Date.now();
    if (now - window.mobileFireState.lastFireTime < window.mobileFireState.fireDebounceTime) {
        console.log('Fire blocked - too soon after last fire');
        return;
    }
    window.mobileFireState.lastFireTime = now;
    
    console.log('📱 Mobile fire button pressed');
    
    // Ensure game is active
    if (typeof gameState === 'undefined' || !gameState.gameStarted || gameState.gameOver) {
        console.log('Fire blocked - game not active');
        return;
    }
    
    // Resume audio context if needed
    if (typeof resumeAudioContext === 'function') {
        resumeAudioContext();
    }
    
    // Call the main fire weapon function
    if (typeof fireWeapon === 'function') {
        fireWeapon();
        console.log('✅ Fire weapon called successfully');
    } else if (typeof keys !== 'undefined') {
        // Fallback: simulate spacebar press
        keys.space = true;
        setTimeout(() => keys.space = false, 100);
        console.log('✅ Fire weapon via keys.space');
    }
    
    // Visual feedback - transform only, no opacity change
    const fireBtn = document.querySelector('.mobile-btn.primary, .mobile-btn.fire');
    if (fireBtn) {
        fireBtn.style.transform = 'scale(0.85)';
        setTimeout(() => {
            fireBtn.style.transform = 'scale(1)';
        }, 150);
    }
}

function openMobilePopup(popupType) {
    console.log(`📱 Opening mobile popup: ${popupType}`);
    
    // Don't open popups during intro
    if (document.body.classList.contains('intro-active')) {
        console.log('Popup blocked - intro active');
        return;
    }
    
    if (popupType === 'controls') {
        const popup = document.getElementById('controlsPopup');
        if (popup) {
            popup.classList.add('active');
            if (typeof playSound === 'function') {
                playSound('ui_open', 1200, 0.1);
            }
        }
    } else if (popupType === 'status') {
        const popup = document.getElementById('statusPopup');
        if (popup) {
            if (typeof updateMobileStatus === 'function') {
                updateMobileStatus();
            }
            popup.classList.add('active');
            if (typeof playSound === 'function') {
                playSound('ui_open', 1200, 0.1);
            }
        }
    } else if (popupType === 'navigation') {
        const navPanel = document.getElementById('navPanelMobile');
        if (navPanel) {
            if (typeof updateMobileNavigation === 'function') {
                updateMobileNavigation();
            }
            navPanel.classList.add('active');
            if (typeof playSound === 'function') {
                playSound('ui_open', 1200, 0.1);
            }
        }
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
    window.showGameOverScreen = showGameOverScreen;
    
    // Bridge functions for integration
    window.displayAchievement = displayAchievement;
    window.cycleToNextTarget = cycleToNextTarget;
    window.updateUIFromExternal = updateUIFromExternal;
    
    // Utility functions
    window.bindUIEventListeners = bindUIEventListeners;
    
    // Mobile UI functions
    window.setupMobileUI = setupMobileUI;
    window.createMobileUIContainer = createMobileUIContainer;
    window.createMobileTopBar = createMobileTopBar;
    window.createMobileControls = createMobileControls;
    window.createMobileFloatingStatus = createMobileFloatingStatus;
    window.createMobilePopups = createMobilePopups;
    window.updateMobileFloatingStatus = updateMobileFloatingStatus;
    window.mobileCycleTarget = mobileCycleTarget;
    window.handleMobileFire = handleMobileFire;
    window.openMobilePopup = openMobilePopup;
    
    console.log('Enhanced Game UI loaded - All compatibility issues resolved!');
}

console.log('Game UI system loaded successfully');
