// Game Physics - Movement, gravity, and physics systems
// DOUBLED WORLD SIZE: All distances and masses doubled while keeping player/enemy size the same
// FIXED: Restored working black hole warp mechanism from Document 2 + Document 11 enhancements
// SIMPLIFIED: Removed complex radial hyperspace effect, using simple effect for emergency warp

function updateEnhancedPhysics() {
    // CRITICAL SAFETY CHECK: Don't run if core objects aren't initialized
    if (typeof camera === 'undefined' || camera === null || 
        typeof gameState === 'undefined' || gameState === null ||
        typeof cameraRotation === 'undefined' || cameraRotation === null ||
        !gameState.velocityVector) {
        // Objects not ready yet, skip this frame
        return;
    }
    
    // ADDITIONAL SAFETY CHECKS: Ensure all gameState properties exist
    if (!gameState.targetLock) {
        gameState.targetLock = {
            active: false,
            target: null,
            strength: 0,
            maxDistance: 4000,
            smoothing: 0.08
        };
    }
    
    if (!gameState.emergencyWarp) {
        gameState.emergencyWarp = {
            active: false,
            available: 5,
            cooldown: 0,
            maxCooldown: 30000,
            timeRemaining: 0
        };
    }
    
    if (!gameState.slingshot) {
        gameState.slingshot = {
            active: false,
            postSlingshot: false,
            timeRemaining: 0
        };
    }
    
    if (!gameState.weapons) {
        gameState.weapons = {
            armed: true,
            lastFireTime: 0,
            fireRate: 300,
            damage: 25,
            range: 2000,
            cooldown: 0
        };
    }
    
    if (!gameState.eventHorizonWarning) {
        gameState.eventHorizonWarning = {
            active: false,
            blackHole: null
        };
    }
    
    // Additional safety check for camera.rotation specifically
    if (!camera.rotation) {
        console.warn('Camera exists but rotation is undefined');
        return;
    }
    
    // NEW: Pause-aware physics
    if (typeof gamePaused !== 'undefined' && gamePaused) {
        if (typeof renderer !== 'undefined' && renderer) {
            renderer.render(scene, camera);
        }
        return;
    }
    
    const rotSpeed = 0.03;
    const gravitationalConstant = 0.002; // DOUBLED for doubled masses
    const assistRange = 60; // DOUBLED
    const collisionThreshold = 6; // DOUBLED
    
    // FIXED: Local space flight controls that respect auto-navigation
    // Don't allow manual rotation when auto-navigation is orienting
    const allowManualRotation = !gameState.autoNavigating || !gameState.autoNavOrienting;
    
    if (allowManualRotation) {
        // Fixed flight controls - using local camera space (RESTORED)
        if (keys.up) {
            camera.rotateX(rotSpeed); // UP looks up
            lastPitchInputTime = performance.now();
        }
        if (keys.down) {
            camera.rotateX(-rotSpeed); // DOWN looks down
            lastPitchInputTime = performance.now();
        }
        if (keys.left) {
            camera.rotateY(rotSpeed);
        }
        if (keys.right) {
            camera.rotateY(-rotSpeed); // Negative for correct direction
        }
        
        // Update cameraRotation tracking for auto-leveling
        cameraRotation.x = camera.rotation.x;
        cameraRotation.y = camera.rotation.y;
        cameraRotation.z = camera.rotation.z;
    }
    
    // Roll controls always work (Q/E) - using world space for auto-leveling compatibility
    if (keys.q) {
        camera.rotateZ(rotSpeed);
        cameraRotation.z = camera.rotation.z;
        lastRollInputTime = performance.now();
    }
    if (keys.e) {
        camera.rotateZ(-rotSpeed);
        cameraRotation.z = camera.rotation.z;
        lastRollInputTime = performance.now();
    }
    
    // → REMOVED: cameraRotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, cameraRotation.x));
    camera.rotation.set(cameraRotation.x, cameraRotation.y, cameraRotation.z);
    
    // Get ship direction vectors
    const forwardDirection = new THREE.Vector3();
    camera.getWorldDirection(forwardDirection);
    const rightDirection = new THREE.Vector3();
    rightDirection.crossVectors(forwardDirection, camera.up).normalize();
    
    // Constant forward motion
    const currentSpeed = gameState.velocityVector.length();
    if (currentSpeed < gameState.minVelocity) {
        const deficit = gameState.minVelocity - currentSpeed;
        gameState.velocityVector.addScaledVector(forwardDirection, deficit);
    }
    
    // Enhanced thrust controls - WASD for movement with W getting 2x thrust
    if (keys.w && gameState.energy > 0) {
        const wThrustPower = gameState.thrustPower * gameState.wThrustMultiplier;
        gameState.velocityVector.addScaledVector(forwardDirection, wThrustPower);
        gameState.energy = Math.max(0, gameState.energy - 0.12); // Higher energy cost for 2x thrust
        if (Math.random() > 0.85) createHyperspaceEffect();
    }
    if (keys.s && gameState.energy > 0) {
        gameState.velocityVector.addScaledVector(forwardDirection, -gameState.thrustPower * 0.5);
        gameState.energy = Math.max(0, gameState.energy - 0.04);
    }
    if (keys.a && gameState.energy > 0) {
        gameState.velocityVector.addScaledVector(rightDirection, -gameState.thrustPower * 0.7);
        gameState.energy = Math.max(0, gameState.energy - 0.06);
    }
    if (keys.d && gameState.energy > 0) {
        gameState.velocityVector.addScaledVector(rightDirection, gameState.thrustPower * 0.7);
        gameState.energy = Math.max(0, gameState.energy - 0.06);
    }
    
    // Space bar - target lock only (no thrust boost)
    // Target lock functionality is handled in updateTargetLock() function
    
    // Enhanced space boost (B key)
    if (keys.b && gameState.energy > 0) {
        const boostPower = keys.shift ? gameState.thrustPower * 2.5 : gameState.thrustPower * 1.8;
        gameState.velocityVector.addScaledVector(forwardDirection, boostPower);
        gameState.energy = Math.max(0, gameState.energy - (keys.shift ? 0.15 : 0.12));
        
        if (Math.random() > 0.6) {
            createHyperspaceEffect();
        }
    }
    
    // Emergency warp - RESTORED: Immediate maximum acceleration like older version
    if (keys.o && gameState.emergencyWarp.available > 0 && !gameState.emergencyWarp.active) {
        gameState.emergencyWarp.available--;
        gameState.emergencyWarp.active = true;
        gameState.emergencyWarp.timeRemaining = gameState.emergencyWarp.boostDuration;
        
        // Get current forward direction
        const forwardDirection = new THREE.Vector3();
        camera.getWorldDirection(forwardDirection);
        
        // FIXED: Define warpSpeed properly
        const warpSpeed = gameState.emergencyWarp.boostSpeed;
        
        // RESTORED: Immediate velocity application like older version
        gameState.velocityVector.copy(forwardDirection).multiplyScalar(warpSpeed);
        
        const speedKmh = (warpSpeed * 1000).toFixed(0);
        showAchievement('Emergency Warp Activated!', `${speedKmh} km/s for ${gameState.emergencyWarp.boostDuration/1000}s`);
        
        // Mark as interstellar if high enough velocity
        if (warpSpeed >= 1.0) {
            gameState.hasInterstellarExperience = true;
            gameState.maxVelocity = 2.5; // Unlock higher speeds
        }
        
        // SIMPLE: Use basic hyperspace effect instead of complex radial effect
        createHyperspaceEffect();
        
        // RESTORED: Audio integration for emergency warp
        if (typeof playSound !== 'undefined') {
            playSound('warp');
        }
        
        console.log(`⚡ EMERGENCY WARP: ${speedKmh} km/s forward`);
        console.log(`⚡ Velocity vector:`, gameState.velocityVector);
        console.log(`⚡ Forward direction:`, forwardDirection);
    }
    
    // Emergency warp timer
    if (gameState.emergencyWarp.active) {
        gameState.emergencyWarp.timeRemaining -= 16.67;
        if (gameState.emergencyWarp.timeRemaining <= 0) {
            gameState.emergencyWarp.active = false;
            showAchievement('Emergency Warp Complete', 'Returning to normal propulsion');
        }
    }
    
    // Emergency warp regeneration (1 per minute)
    if (gameState.emergencyWarp.available < 5) {
        gameState.emergencyWarp.regenerationTimer += 16.67;
        
        if (gameState.emergencyWarp.regenerationTimer >= gameState.emergencyWarp.regenerationInterval) {
            gameState.emergencyWarp.available++;
            gameState.emergencyWarp.regenerationTimer = 0;
            showAchievement('Emergency Warp Recharged', `${gameState.emergencyWarp.available}/5 charges available`);
            playSound('achievement');
        }
    }
    
    // Enhanced emergency braking - loses momentum from slingshot/warp
    if (keys.x && gameState.energy > 0) {
        const currentSpeed = gameState.velocityVector.length();
        if (currentSpeed > gameState.minVelocity) {
            // Stronger braking if at high speed
            const brakePower = currentSpeed > 1.0 ? 0.85 : 0.95; // Stronger braking at interstellar speeds
            const newVelocity = gameState.velocityVector.clone().multiplyScalar(brakePower);
            
            if (newVelocity.length() >= gameState.minVelocity) {
                gameState.velocityVector.copy(newVelocity);
            } else {
                gameState.velocityVector.normalize().multiplyScalar(gameState.minVelocity);
            }
            
            // End slingshot/warp state if braking
            if (gameState.slingshot.active || gameState.slingshot.postSlingshot) {
                gameState.slingshot.active = false;
                gameState.slingshot.postSlingshot = false;
                showAchievement('Momentum Lost', 'Interstellar velocity cancelled by braking');
            }
            
            gameState.energy = Math.max(0, gameState.energy - 0.12); // Higher energy cost
        }
    }
    
    // ========================================================================
    // PERFORMANCE OPTIMIZED: Enhanced gravitational effects with LIMITED calculations
    // ========================================================================
    let totalGravitationalForce = new THREE.Vector3(0, 0, 0);
    let nearestAssistPlanet = null;
    let nearestAssistDistance = Infinity;
    let gravityWellInRange = false; // NEW: For title flashing
    
    // PERFORMANCE FIX 3: Sort activePlanets by distance and only process nearest 10 for gravity
    const playerPosition = camera.position;
    const planetsWithDistance = activePlanets.map(planet => ({
        planet: planet,
        distance: playerPosition.distanceTo(planet.position)
    })).sort((a, b) => a.distance - b.distance);
    
    // Process only the nearest 10 planets for gravity calculations (MASSIVE PERFORMANCE BOOST)
    const nearestPlanetsForGravity = planetsWithDistance.slice(0, 10);
    
    // But check ALL active planets for collisions (safety first)
    planetsWithDistance.forEach(({ planet, distance }) => {
        const planetPosition = planet.position;
        const planetMass = planet.userData.mass || 1;
        const planetRadius = planet.geometry ? planet.geometry.parameters.radius : 5;
        
        // Collision detection (DOUBLED) - CHECK ALL PLANETS for safety
        const collisionDistance = planetRadius + collisionThreshold;
        if (distance < collisionDistance) {
            if (planet.userData.type === 'asteroid') {
                // Asteroid collision - damage player and destroy asteroid
                gameState.hull = Math.max(0, gameState.hull - 15);
                showAchievement('Asteroid Impact!', `Collision with ${planet.userData.name} - Hull damaged!`);
                
                // NEW: Enhanced screen damage effect
                createEnhancedScreenDamageEffect();
                
                // RESTORED: Audio feedback for asteroid collisions
                if (typeof playSound !== 'undefined') {
                    playSound('damage');
                }
                
                // NEW: Proper asteroid cleanup
                destroyAsteroid(planet);
                
                // Check for game over
                if (gameState.hull <= 0) {
                    gameOver('Ship destroyed by asteroid impact!');
                    return;
                }
            } else {
                gameOver(`Crashed into ${planet.userData.name}!`);
                return;
            }
        }
    });
    
    // PERFORMANCE: Only calculate gravity for nearest 10 planets
    nearestPlanetsForGravity.forEach(({ planet, distance }) => {
        const planetPosition = planet.position;
        const planetMass = planet.userData.mass || 1;
        
        // Enhanced gravitational force (DOUBLED for doubled masses) - ONLY FOR NEAREST PLANETS
        if (planet.userData.type !== 'asteroid') {
            const gravitationalForce = gravitationalConstant * gameState.shipMass * planetMass / (distance * distance);
            const direction = new THREE.Vector3().subVectors(planetPosition, camera.position).normalize();
            const gravityVector = direction.clone().multiplyScalar(gravitationalForce);
            
            // RESTORED: Working black hole effects from Document 2 (with doubled distances)
            if (planet.userData.type === 'blackhole') {
                const warningDistance = gameState.eventHorizonWarning.warningDistance; // 400 (doubled)
                const criticalDistance = planet.userData.warpThreshold || gameState.eventHorizonWarning.criticalDistance; // 160 (doubled)
                
                if (distance < warningDistance && distance > criticalDistance && !gameState.eventHorizonWarning.active) {
                    gameState.eventHorizonWarning.active = true;
                    gameState.eventHorizonWarning.blackHole = planet;
                    document.getElementById('eventHorizonWarning').classList.remove('hidden');
                    showAchievement('Event Horizon Detected', `Approaching ${planet.userData.name}`);
                }
                
                if (distance > warningDistance && gameState.eventHorizonWarning.active && gameState.eventHorizonWarning.blackHole === planet) {
                    gameState.eventHorizonWarning.active = false;
                    gameState.eventHorizonWarning.blackHole = null;
                    document.getElementById('eventHorizonWarning').classList.add('hidden');
                }
                
                // Enhanced spiral effect for black holes
                if (distance < warningDistance) {
                    const spiralStrength = Math.max(0, (warningDistance - distance) / warningDistance);
                    const spiralForce = new THREE.Vector3(
                        Math.sin(Date.now() * 0.01) * spiralStrength * 0.001,
                        0,
                        Math.cos(Date.now() * 0.01) * spiralStrength * 0.001
                    );
                    
                    gameState.velocityVector.add(spiralForce);
                    
                    if (distance < 160) { // DOUBLED from 80
                        camera.rotation.z += spiralStrength * 0.02 * Math.sin(Date.now() * 0.005);
                        
                        // Yellow pulsing overlay for extreme danger
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
            
            // Gravitational assist detection (DOUBLED)
            if (distance < assistRange && distance < nearestAssistDistance) {
                nearestAssistPlanet = planet;
                nearestAssistDistance = distance;
                gravityWellInRange = true; // NEW: Track for title flashing
            }
        }
    });
    
    // Apply gravitational force
    gameState.velocityVector.add(totalGravitationalForce);
    
    // NEW: Enhanced title flashing for gravity well alert
    const gameTitle = document.getElementById('gameTitle');
    if (gravityWellInRange && gameTitle) {
        gameTitle.classList.add('title-flash');
    } else if (gameTitle) {
        gameTitle.classList.remove('title-flash');
    }
    
    // Enhanced auto-leveling system (RESTORED from older version)
    const currentTime = performance.now();
    autoLevelingTimer += 16.67;
    
    if (gameState.autoLevelingEnabled) {
        // Auto-level roll (Q/E) if no input for set time
        if ((currentTime - lastRollInputTime) > autoLevelingDelay) {
            const rollCorrection = -cameraRotation.z * autoLevelingSpeed;
            if (Math.abs(rollCorrection) > 0.001) {
                cameraRotation.z += rollCorrection;
                camera.rotation.z = cameraRotation.z;
            }
        }
        
        // Auto-level pitch (UP/DOWN) if no input for set time
        if ((currentTime - lastPitchInputTime) > autoLevelingDelay) {
            const pitchCorrection = -cameraRotation.x * autoLevelingSpeed;
            if (Math.abs(pitchCorrection) > 0.001) {
                cameraRotation.x += pitchCorrection;
                camera.rotation.x = cameraRotation.x;
            }
        }
    }
    
    // Warp button UI update
    const warpBtn = document.getElementById('warpBtn');
    if (warpBtn && nearestAssistPlanet) {
        if (gameState.autoNavigating) {
            warpBtn.innerHTML = `<i class="fas fa-pause mr-2"></i>Cancel Slingshot`;
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
    
    // Slingshot timer management
    if (gameState.slingshot.active) {
        gameState.slingshot.timeRemaining -= 16.67;
        
        if (gameState.slingshot.timeRemaining <= 0) {
            gameState.slingshot.active = false;
            gameState.slingshot.postSlingshot = true;
            gameState.slingshot.timeRemaining = 0;
            showAchievement('Slingshot Complete', 'Coasting on inertia - friction will gradually slow you down');
        }
    } else if (gameState.slingshot.postSlingshot) {
        const currentSpeed = gameState.velocityVector.length();
        if (currentSpeed > gameState.maxVelocity) {
            gameState.velocityVector.multiplyScalar(gameState.slingshot.inertiaDecay);
            
            if (gameState.velocityVector.length() <= gameState.maxVelocity) {
                gameState.slingshot.postSlingshot = false;
                showAchievement('Normal Velocity', 'Returned to standard propulsion limits');
            }
        } else {
            gameState.slingshot.postSlingshot = false;
        }
    }
    
    // Enhanced velocity limits (DOUBLED speeds)
    const currentMaxVelocity = gameState.emergencyWarp.active ? gameState.emergencyWarp.boostSpeed :
                             (gameState.slingshot.active || gameState.slingshot.postSlingshot) ? 
                             gameState.slingshot.maxSpeed : gameState.maxVelocity;
    const currentVelocity = gameState.velocityVector.length();
    
    if (currentVelocity > currentMaxVelocity && !gameState.slingshot.postSlingshot && !gameState.emergencyWarp.active) {
        gameState.velocityVector.normalize().multiplyScalar(currentMaxVelocity);
    } else if (currentVelocity < gameState.minVelocity && !gameState.slingshot.active && !gameState.slingshot.postSlingshot && !gameState.emergencyWarp.active) {
        if (currentVelocity > 0.001) {
            gameState.velocityVector.normalize().multiplyScalar(gameState.minVelocity);
        } else {
            gameState.velocityVector.copy(forwardDirection).multiplyScalar(gameState.minVelocity);
        }
    }
    
    // Enhanced velocity damping
    const dampingFactor = gameState.slingshot.postSlingshot ? 0.9995 : 
                        gameState.emergencyWarp.active ? 0.9998 : 0.992;  // Changed from 0.998 to 0.992
    const dampedVelocity = gameState.velocityVector.clone().multiplyScalar(dampingFactor);
    if (dampedVelocity.length() >= gameState.minVelocity || gameState.slingshot.active || gameState.slingshot.postSlingshot || gameState.emergencyWarp.active) {
        gameState.velocityVector.copy(dampedVelocity);
    }
    
    // Apply velocity to position
    camera.position.add(gameState.velocityVector);
    
    // Enhanced auto-navigation (DOUBLED distances)
    if (gameState.autoNavigating && gameState.currentTarget && gameState.energy > 5) {
        if (gameState.autoNavOrienting) {
            const isOriented = orientTowardsTarget(gameState.currentTarget);
            if (isOriented) {
                gameState.autoNavOrienting = false;
                showAchievement('Target Acquired', 'Orientation complete - beginning approach');
            }
        } else {
            // Apply stronger forward thrust when not orienting
            const targetDirection = new THREE.Vector3().subVectors(
                gameState.currentTarget.position, 
                camera.position
            ).normalize();
            
            // Increased thrust power for auto-navigation
            gameState.velocityVector.addScaledVector(targetDirection, gameState.thrustPower * 0.8);
            gameState.energy = Math.max(0, gameState.energy - 0.06);
            
            const targetDistance = camera.position.distanceTo(gameState.currentTarget.position);
            
            // Only re-orient if significantly off course (more than 15 degrees)
            if (targetDistance > 100) {
                const forwardDirection = new THREE.Vector3();
                camera.getWorldDirection(forwardDirection);
                const angle = forwardDirection.angleTo(targetDirection);
                
                if (angle > 0.26) { // ~15 degrees in radians
                    orientTowardsTarget(gameState.currentTarget);
                }
            }
        }
    } else if (gameState.autoNavigating && gameState.energy <= 5) {
        gameState.autoNavigating = false;
        gameState.autoNavOrienting = false;
        showAchievement('Energy Critical', 'Auto-navigation disabled - insufficient energy');
    }
    
    // Enhanced energy regeneration
    if (gameState.energy < 100) {
        gameState.energy = Math.min(100, gameState.energy + 0.06);
    }
    
    // Update game state (DOUBLED scale)
    gameState.velocity = gameState.velocityVector.length();
    gameState.distance += gameState.velocity * 0.002; // DOUBLED from 0.001
}

// NEW: Proper asteroid cleanup function
function destroyAsteroid(asteroid) {
    // Remove from scene
    scene.remove(asteroid);
    
    // Remove from planets array
    const planetIndex = planets.indexOf(asteroid);
    if (planetIndex > -1) planets.splice(planetIndex, 1);
    
    // Remove from active planets if present
    const activeIndex = activePlanets.indexOf(asteroid);
    if (activeIndex > -1) activePlanets.splice(activeIndex, 1);
    
    // Remove from parent belt group if it exists
    if (asteroid.userData.beltGroup) {
        asteroid.userData.beltGroup.remove(asteroid);
    }
    
    // Remove from asteroid belts if it's part of one
    asteroidBelts.forEach(belt => {
        if (belt.children) {
            const beltIndex = belt.children.indexOf(asteroid);
            if (beltIndex > -1) {
                belt.remove(asteroid);
            }
        }
    });
    
    // Force clear any lingering references
    if (typeof gameState !== 'undefined' && gameState.targetLock.target === asteroid) {
        gameState.targetLock.target = null;
    }
    if (typeof gameState !== 'undefined' && gameState.currentTarget === asteroid) {
        gameState.currentTarget = null;
    }
}

function orientTowardsTarget(target) {
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
    
    const orientationThreshold = 0.087;
    const isOriented = Math.abs(adjustedDeltaY) < orientationThreshold && Math.abs(deltaX) < orientationThreshold;
    
    return isOriented;
}

function executeSlingshot() {
    let nearestPlanet = null;
    let nearestDistance = Infinity;
    
    activePlanets.forEach(planet => {
        const distance = camera.position.distanceTo(planet.position);
        if (distance < 60 && distance < nearestDistance) { // DOUBLED from 30
            nearestPlanet = planet;
            nearestDistance = distance;
        }
    });
    
    if (nearestPlanet && gameState.energy >= 20 && !gameState.slingshot.active) {
        const planetMass = nearestPlanet.userData.mass || 1;
        const planetRadius = nearestPlanet.geometry ? nearestPlanet.geometry.parameters.radius : 5;
        
        const forwardDirection = new THREE.Vector3();
        camera.getWorldDirection(forwardDirection);
        
        const planetDirection = new THREE.Vector3().subVectors(
            nearestPlanet.position, 
            camera.position
        ).normalize();
        
        const slingDirection = new THREE.Vector3().crossVectors(planetDirection, camera.up).normalize();
        const slingshotDirection = forwardDirection.clone().add(slingDirection).normalize();
        
        // FIXED: Increased power significantly
        const slinghotPower = (planetMass * planetRadius) / 5;  // Changed from /10
        const boostVelocity = Math.min(10.0 + slinghotPower, gameState.slingshot.maxSpeed);  // Changed from 3.0
        
        gameState.velocityVector.copy(slingshotDirection).multiplyScalar(boostVelocity);
        gameState.energy = Math.max(5, gameState.energy - 20);
        
        gameState.slingshot.active = true;
        gameState.slingshot.timeRemaining = gameState.slingshot.duration;
        
        // Enhanced effects based on planet type
        if (nearestPlanet.userData.type === 'blackhole') {
            showAchievement('Black Hole Slingshot', `EXTREME VELOCITY: ${(boostVelocity * 1000).toFixed(0)} km/s!`);
            for (let i = 0; i < 8; i++) {
                setTimeout(() => createHyperspaceEffect(), i * 200);
            }
        } else if (nearestPlanet.userData.name === 'Jupiter' || planetRadius > 10) {
            showAchievement('Giant Planet Slingshot', `${nearestPlanet.userData.name}: ${(boostVelocity * 1000).toFixed(0)} km/s!`);
            for (let i = 0; i < 4; i++) {
                setTimeout(() => createHyperspaceEffect(), i * 150);
            }
        } else {
            showAchievement('Gravitational Slingshot', `${nearestPlanet.userData.name}: ${(boostVelocity * 1000).toFixed(0)} km/s!`);
            for (let i = 0; i < 2; i++) {
                setTimeout(() => createHyperspaceEffect(), i * 100);
            }
        }
        
        gameState.distance += slinghotPower * 5;
        updateUI();
    }
}

// =============================================================================
// INTERSTELLAR NAVIGATION SYSTEM
// =============================================================================

function findNearbyDistantGalaxy() {
    // Galaxy positions based on galaxyMapPositions
    const galaxyPositions = [
        { x: (0.3 - 0.5) * 80000, z: (0.2 - 0.5) * 80000, name: 'Spiral Galaxy' },      // 1
        { x: (0.7 - 0.5) * 80000, z: (0.15 - 0.5) * 80000, name: 'Elliptical Galaxy' }, // 2
        { x: (0.85 - 0.5) * 80000, z: (0.4 - 0.5) * 80000, name: 'Irregular Galaxy' },  // 3
        { x: (0.75 - 0.5) * 80000, z: (0.6 - 0.5) * 80000, name: 'Ring Galaxy' },       // 4
        { x: (0.6 - 0.5) * 80000, z: (0.8 - 0.5) * 80000, name: 'Dwarf Galaxy' },       // 5
        { x: (0.25 - 0.5) * 80000, z: (0.85 - 0.5) * 80000, name: 'Lenticular Galaxy' }, // 6
        { x: (0.1 - 0.5) * 80000, z: (0.7 - 0.5) * 80000, name: 'Quasar Galaxy' },      // 7
        { x: 0, z: 0, name: 'Sagittarius A* (Galactic Center)' }                         // 8 (center)
    ];
    
    // Find all galaxies that are distant but reachable
    const candidateGalaxies = [];
    
    galaxyPositions.forEach(galaxy => {
        const distance = Math.sqrt(
            Math.pow(camera.position.x - galaxy.x, 2) + 
            Math.pow(camera.position.z - galaxy.z, 2)
        );
        
        // Include galaxies that are far enough away but not too far
        if (distance > 15000 && distance < 100000) {
            candidateGalaxies.push({ galaxy, distance });
        }
    });
    
    // Sort by distance and pick from top 3 closest candidates randomly
    candidateGalaxies.sort((a, b) => a.distance - b.distance);
    const topCandidates = candidateGalaxies.slice(0, 3);
    
    if (topCandidates.length === 0) {
        return null;
    }
    
    // Randomly pick from top candidates
    const selectedCandidate = topCandidates[Math.floor(Math.random() * topCandidates.length)];
    return selectedCandidate.galaxy;
}

function getDirectionToGalaxy(galaxy) {
    const direction = new THREE.Vector3(
        galaxy.x - camera.position.x,
        0, // Keep on same Y plane for now
        galaxy.z - camera.position.z
    );
    return direction.normalize();
}

function executeInterstellarSlingshot(planet) {
    const targetGalaxy = findNearbyDistantGalaxy(); // Updated function name
    if (!targetGalaxy) {
        console.warn('No distant galaxy found for interstellar slingshot');
        return false;
    }
    
    const planetMass = planet.userData.mass || 1;
    const planetRadius = planet.geometry ? planet.geometry.parameters.radius : 5;
    
    // Calculate direction to nearest distant galaxy
    const galaxyDirection = getDirectionToGalaxy(targetGalaxy);
    
    // Enhanced slingshot power calculation
    const slinghotPower = (planetMass * planetRadius) / 5;
    const baseVelocity = 6.0 + slinghotPower;
    
    // Determine max speed based on interstellar experience
    const maxSpeed = gameState.hasInterstellarExperience ? 2.5 : 1.0; // 2500km/s or 1000km/s
    const boostVelocity = Math.min(baseVelocity, maxSpeed);
    
    // Apply velocity toward distant galaxy
    gameState.velocityVector.copy(galaxyDirection).multiplyScalar(boostVelocity);
    gameState.energy = Math.max(5, gameState.energy - 20);
    
    gameState.slingshot.active = true;
    gameState.slingshot.timeRemaining = gameState.slingshot.duration;
    
    // Mark as interstellar if high enough velocity
    if (boostVelocity >= 1.0) {
        gameState.hasInterstellarExperience = true;
        gameState.maxVelocity = 2.5; // Unlock higher speeds
    }
    
    // Enhanced achievement messages
    const speedKmh = (boostVelocity * 1000).toFixed(0);
    showAchievement('Interstellar Slingshot!', `${speedKmh} km/s towards ${targetGalaxy.name}!`);
    
    console.log(`🚀 INTERSTELLAR SLINGSHOT: ${speedKmh} km/s towards ${targetGalaxy.name}`);
    console.log(`🚀 Direction:`, galaxyDirection);
    console.log(`🚀 Velocity vector:`, gameState.velocityVector);
    
    return true;
}

function executeInterstellarEmergencyWarp() {
    const targetGalaxy = findNearestDistantGalaxy();
    if (!targetGalaxy) {
        console.warn('No distant galaxy found for emergency warp');
        return false;
    }
    
    // Calculate direction to nearest distant galaxy
    const galaxyDirection = getDirectionToGalaxy(targetGalaxy);
    
    // Determine max speed based on interstellar experience
    const maxSpeed = gameState.hasInterstellarExperience ? 2.5 : 1.0; // 2500km/s or 1000km/s
    const warpSpeed = Math.min(gameState.emergencyWarp.boostSpeed, maxSpeed);
    
    // Apply velocity toward distant galaxy
    gameState.velocityVector.copy(galaxyDirection).multiplyScalar(warpSpeed);
    
    // Mark as interstellar if high enough velocity
    if (warpSpeed >= 1.0) {
        gameState.hasInterstellarExperience = true;
        gameState.maxVelocity = 2.5; // Unlock higher speeds
    }
    
    const speedKmh = (warpSpeed * 1000).toFixed(0);
    showAchievement('Emergency Warp to Galaxy!', `${speedKmh} km/s towards ${targetGalaxy.name}!`);
    
    console.log(`⚡ EMERGENCY WARP: ${speedKmh} km/s towards ${targetGalaxy.name}`);
    
    return true;
}

// NEW: Enhanced screen damage effect
function createEnhancedScreenDamageEffect() {
    // Create red flash overlay for damage
    const damageOverlay = document.createElement('div');
    damageOverlay.className = 'absolute inset-0 bg-red-500 pointer-events-none z-30';
    damageOverlay.style.opacity = '0';
    damageOverlay.style.animation = 'damageFlash 0.5s ease-out forwards';
    document.body.appendChild(damageOverlay);
    
    // Create enhanced screen shake effect
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.style.animation = 'screenShake 0.8s ease-out'; // Longer shake
        setTimeout(() => {
            if (gameContainer) {
                gameContainer.style.animation = '';
            }
        }, 800);
    }
    
    // Remove overlay after animation
    setTimeout(() => {
        damageOverlay.remove();
    }, 500);
}

// Simple hyperspace effect for other uses
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

function cleanupEventHorizonEffects() {
    // FIXED: Clear warp state during cleanup
    if (typeof gameState !== 'undefined') {
        gameState.isWarping = false;
    }
    
    const eventHorizonWarning = document.getElementById('eventHorizonWarning');
    if (eventHorizonWarning) {
        eventHorizonWarning.classList.add('hidden');
    }
    
    const blackHoleWarningHUD = document.getElementById('blackHoleWarningHUD');
    if (blackHoleWarningHUD) {
        blackHoleWarningHUD.classList.add('hidden');
    }
    
    gameState.eventHorizonWarning.active = false;
    gameState.eventHorizonWarning.blackHole = null;
    
    const dangerOverlay = document.getElementById('dangerOverlay');
    if (dangerOverlay) {
        dangerOverlay.remove();
    }
}

function transitionToRandomLocation(sourceBlackHole) {
    // FIXED: Set warp state to suppress achievements
    gameState.isWarping = true;
    
    cleanupEventHorizonEffects();
    
    // Enhanced bright white fade effect
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
        z-index: 45;
        opacity: 0;
        transition: opacity 1.5s ease-in-out;
        pointer-events: none;
    `;
    document.body.appendChild(fadeOverlay);

    // Fade to bright white
    setTimeout(() => fadeOverlay.style.opacity = '1', 100);

    setTimeout(() => {
        const blackHoles = planets.filter(p => p.userData.type === 'blackhole' && p.userData.name !== sourceBlackHole);
        
        if (blackHoles.length === 0) {
            console.error('No black holes found for warp destination!');
            // FIXED: Clear warp state if warp fails
            gameState.isWarping = false;
            return;
        }
        
        const targetBlackHole = blackHoles[Math.floor(Math.random() * blackHoles.length)];
        
        const nearbyObjects = planets.filter(p => {
            const distance = p.position.distanceTo(targetBlackHole.position);
            return distance > 100 && distance < 800 && p.userData.type !== 'blackhole';
        });
        
        // Ensure safe warp distance (minimum 200 units)
        const warpDistance = 200 + Math.random() * 300;
        const warpAngle = Math.random() * Math.PI * 2;
        const warpHeight = (Math.random() - 0.5) * 100;
        
        const safePosition = new THREE.Vector3(
            targetBlackHole.position.x + Math.cos(warpAngle) * warpDistance,
            targetBlackHole.position.y + warpHeight,
            targetBlackHole.position.z + Math.sin(warpAngle) * warpDistance
        );

        // Verify position isn't inside another object
        let attempts = 0;
        while (isPositionTooClose(safePosition, 50) && attempts < 10) {
            safePosition.set(
                targetBlackHole.position.x + Math.cos(warpAngle + attempts * 0.3) * (warpDistance + attempts * 20),
                targetBlackHole.position.y + (Math.random() - 0.5) * 100,
                targetBlackHole.position.z + Math.sin(warpAngle + attempts * 0.3) * (warpDistance + attempts * 20)
            );
            attempts++;
        }
        
        // Reset enhanced game state
        gameState.velocity = gameState.minVelocity;
        gameState.energy = Math.min(100, gameState.energy + 30);
        gameState.hull = Math.min(gameState.maxHull, gameState.hull + 20); // Restore some hull
        gameState.currentTarget = null;
        gameState.autoNavigating = false;
        gameState.autoNavOrienting = false;
        gameState.gameOver = false;
        gameState.slingshot.active = false;
        gameState.slingshot.postSlingshot = false;
        gameState.slingshot.timeRemaining = 0;
        gameState.emergencyWarp.active = false;
        gameState.emergencyWarp.timeRemaining = 0;
        gameState.targetLock.active = false;
        gameState.targetLock.target = null;
        
        // Determine location name
        let locationName = 'Unknown Space';
        if (targetBlackHole.userData.galaxyType) {
            locationName = `${targetBlackHole.userData.galaxyType.name} Galaxy (${targetBlackHole.userData.faction})`;
        } else if (targetBlackHole.userData.isGalacticCenter) {
            locationName = 'Galactic Core Region';
        } else if (targetBlackHole.userData.isLocal) {
            locationName = 'Local Galaxy Region';
        } else {
            locationName = `Galaxy ${targetBlackHole.userData.galaxyId + 1} Region`;
        }
        
        gameState.location = locationName;
        
        camera.position.copy(safePosition);
        cameraRotation = { x: 0, y: 0, z: 0 };
        
        // Set velocity away from black hole with some randomness
        const awayDirection = new THREE.Vector3().subVectors(safePosition, targetBlackHole.position).normalize();
        const randomDirection = new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3
        );
        
        gameState.velocityVector = awayDirection.add(randomDirection).normalize()
            .multiplyScalar(gameState.minVelocity * (1 + Math.random() * 0.5));

        // Fade back from bright white
        fadeOverlay.style.opacity = '0';
        setTimeout(() => fadeOverlay.remove(), 1500);
        
        populateTargets();
        updateUI();
        
        const nearbyCount = nearbyObjects.length;
        showAchievement('Strategic Warp', `Warped from ${sourceBlackHole} to ${targetBlackHole.userData.name}!`);
        
        if (nearbyCount > 5) {
            showAchievement('Rich System', `Found ${nearbyCount} nearby objects - perfect for exploration!`);
        } else if (nearbyCount > 0) {
            showAchievement('Tactical Position', `${nearbyCount} objects nearby - plan your next slingshot!`);
        } else {
            showAchievement('Deep Space', 'Sparse region - conserve energy and seek distant targets');
        }
        
        gameState.distance += 3000 + Math.random() * 4000;
        
        // FIXED: Clear warp state to re-enable achievements
        gameState.isWarping = false;
        
        console.log(`Enhanced warp: ${sourceBlackHole} → ${targetBlackHole.userData.name} in ${locationName}`);
        
    }, 1500); // Wait for full fade to white
}


// ENHANCED: More aggressive cleanup function
function forceCleanupEventHorizonEffects() {
    console.log('Force cleaning up event horizon effects...');
    
    const eventHorizonWarning = document.getElementById('eventHorizonWarning');
    if (eventHorizonWarning) {
        eventHorizonWarning.classList.add('hidden');
        eventHorizonWarning.style.display = 'none'; // Force hide
    }
    
    const blackHoleWarningHUD = document.getElementById('blackHoleWarningHUD');
    if (blackHoleWarningHUD) {
        blackHoleWarningHUD.classList.add('hidden');
        blackHoleWarningHUD.style.display = 'none'; // Force hide
    }
    
    gameState.eventHorizonWarning.active = false;
    gameState.eventHorizonWarning.blackHole = null;
    
    const dangerOverlay = document.getElementById('dangerOverlay');
    if (dangerOverlay) {
        dangerOverlay.remove();
    }
    
    // Remove title flashing
    const gameTitle = document.getElementById('gameTitle');
    if (gameTitle) {
        gameTitle.classList.remove('title-flash');
    }
    
    // Clean up any remaining danger overlays
    const allDangerOverlays = document.querySelectorAll('[id*="danger"], [class*="danger"]');
    allDangerOverlays.forEach(overlay => {
        if (overlay.id !== 'dangerOverlay') return; // Only remove danger overlays
        overlay.remove();
    });
}

function cleanupEventHorizonEffects() {
    // Keep the original function but also call the force cleanup
    forceCleanupEventHorizonEffects();
}

// =============================================================================
// WINDOW EXPORTS - Add missing function exports
// =============================================================================

if (typeof window !== 'undefined') {
    // Export the destroyAsteroid function so other files can use it
    window.destroyAsteroid = destroyAsteroid;
    window.orientTowardsTarget = orientTowardsTarget;
    window.executeSlingshot = executeSlingshot;
    window.updateEnhancedPhysics = updateEnhancedPhysics;
    
    // Export new interstellar functions
    window.findNearbyDistantGalaxy = findNearbyDistantGalaxy;
    window.getDirectionToGalaxy = getDirectionToGalaxy;
    window.executeInterstellarSlingshot = executeInterstellarSlingshot;
    window.executeInterstellarEmergencyWarp = executeInterstellarEmergencyWarp;
    
    console.log('✅ Game physics functions exported to window');
}