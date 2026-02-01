/**
 * Third-Person Camera System for Interstellar Slingshot
 * Allows toggling between first-person and third-person camera views
 */

// Camera state
const cameraState = {
    mode: 'first-person',  // Start in first-person (cockpit view)
    playerShipMesh: null,  // Reference to the player ship 3D model
    thirdPersonDistance: 1,   // Distance multiplier for third-person view
    thirdPersonHeight: 0.5,   // Height multiplier for third-person view
    smoothing: 0.15,          // Camera smoothing factor (lower = smoother)
    initialized: false,       // Flag to prevent double-initialization
    playerFlightPosition: new THREE.Vector3(),  // Store actual flight position
    playerFlightRotation: new THREE.Euler(),     // Store actual flight rotation

    // Camera transition animation
    isTransitioning: false,
    transitionStartTime: 0,
    transitionDuration: 800, // milliseconds - doubled for smoother visible transition
    transitionStartOffset: new THREE.Vector3(),
    transitionTargetOffset: new THREE.Vector3(),
    
    // All offsets use ADD: ship.position = camera.position + offset
    // Positive Z = ship in front of camera, Negative Z = ship behind camera
    // For third-person (camera behind ship), offset is NEGATIVE Z
    normalFirstPersonOffset: new THREE.Vector3(0.25, -2, 0.5),   // Cockpit: ship slightly forward/below
    normalThirdPersonOffset: new THREE.Vector3(0, -4, -14),      // Chase cam: ship ahead (negative = in front)
    
    // Thruster glow system
    thrusterGlows: [],      // Array of thruster glow meshes
    thrusterActive: false,  // Whether thrusters are firing
    thrusterIntensity: 0    // Current glow intensity (0-1)
};

/**
 * Initialize the camera system with the player ship model
 */
function initCameraSystem(camera, scene) {
    // Check if we need to re-add player to a new scene
    if (cameraState.initialized && cameraState.playerShipMesh) {
        // If the player model's parent doesn't match the provided scene, we need to move it
        if (cameraState.playerShipMesh.parent !== scene) {
            console.log('🎥 Camera system already initialized, but player ship is in wrong scene');
            console.log('  - Current parent:', cameraState.playerShipMesh.parent);
            console.log('  - Target scene:', scene);
            console.log('  - Re-adding player ship to new scene...');

            // Remove from old parent if it has one
            if (cameraState.playerShipMesh.parent) {
                cameraState.playerShipMesh.parent.remove(cameraState.playerShipMesh);
            }

            // Add to new scene
            scene.add(cameraState.playerShipMesh);
            console.log('✅ Player ship moved to new scene');
            console.log('  - New parent:', cameraState.playerShipMesh.parent);
            return;
        }

        console.log('🎥 Camera system already initialized and in correct scene, skipping...');
        return;
    }

    console.log('🎥 Initializing camera system...');
    console.log('  - Camera provided:', !!camera);
    console.log('  - Scene provided:', !!scene);

    // Try to get the player model
    if (typeof getPlayerModel === 'function') {
        console.log('  - getPlayerModel function found, calling it...');
        const playerModel = getPlayerModel();
        console.log('  - getPlayerModel returned:', !!playerModel);

        if (playerModel) {
            // Don't attach to camera - keep it in the scene
            
            // CENTER THE MODEL GEOMETRY FIRST (before scaling - fix off-center GLB exports)
            const box = new THREE.Box3().setFromObject(playerModel);
            const center = box.getCenter(new THREE.Vector3());
            playerModel.traverse((child) => {
                if (child.isMesh) {
                    child.position.sub(center);
                }
            });
            console.log('📐 Player model centered, offset was:', center);
            
            // NOW apply scale and position
            playerModel.scale.set(48, 48, 48);  // Reduced from 96 to 48 for better performance
            playerModel.position.set(0, 0, 0);

            // Don't rotate or offset the model during init
            // Let the update loop handle all positioning and rotation
            // This ensures the model's position exactly matches what we set in updateCameraView

            // Performance optimization: disable shadows and simplify rendering
            playerModel.castShadow = false;
            playerModel.receiveShadow = false;

            // CRITICAL: Make the entire model visible
            playerModel.visible = true;  // DEBUG: Start visible since we're in third-person mode
            playerModel.frustumCulled = false;

            // Apply optimized self-lit material to all meshes
            playerModel.traverse((child) => {
                if (child.isMesh) {
                    // CRITICAL: Make each mesh visible
                    child.visible = true;
                    child.frustumCulled = false;

                    // Optimized self-illuminated material - simpler for better performance
                    child.material = new THREE.MeshBasicMaterial({
                        color: 0x00ffff,  // Bright cyan
                        transparent: true,
                        opacity: 0.85,
                        side: THREE.FrontSide,  // Only render front faces for performance
                        depthWrite: true,
                        depthTest: true
                    });
                    
                    // CRITICAL: Render player ship ON TOP of warp effects (starfield, hyperspace)
                    // Higher renderOrder = rendered later = appears on top
                    child.renderOrder = 100;
                    
                    // Disable shadows for performance
                    child.castShadow = false;
                    child.receiveShadow = false;
                }
            });
            
            // Also set renderOrder on the parent model
            playerModel.renderOrder = 100;

            console.log('  - About to add player model to scene...');
            console.log('  - Scene object:', scene);
            console.log('  - Scene children count before add:', scene.children.length);
            console.log('  - Player model parent before add:', playerModel.parent);

            scene.add(playerModel);

            console.log('  - Scene children count after add:', scene.children.length);
            console.log('  - Player model parent after add:', playerModel.parent);
            console.log('  - Player model in scene?', scene.children.includes(playerModel));

            cameraState.playerShipMesh = playerModel;

            // Ship starts visible for both first-person (cockpit) and third-person views
            playerModel.visible = true;
            
            // Create thruster glow effects at rear of ship
            createThrusterGlows(playerModel);

            console.log('✅ Player ship added to scene (scale: 96x, cyan emissive)');
            console.log('  - cameraState.playerShipMesh parent:', cameraState.playerShipMesh.parent);
            cameraState.initialized = true;
        } else {
            console.warn('⚠️ getPlayerModel returned null/undefined - no player model available');
            console.warn('   Models may not be loaded yet. Try calling initCameraSystem again after models load.');
        }
    } else {
        console.error('❌ getPlayerModel function not found');
    }

    // Export to window for global access
    window.cameraState = cameraState;
    console.log('🎥 Camera system initialization complete (initialized:', cameraState.initialized, ')');
}

/**
 * Toggle between first-person and third-person camera views
 */
function toggleCameraView() {
    if (!cameraState.playerShipMesh) {
        console.warn('⚠️ No player ship model available for third-person view');
        console.warn('   Camera state:', cameraState);
        console.warn('   Try re-initializing: initCameraSystem is', typeof initCameraSystem);

        // Show notification to user
        if (typeof showNotification === 'function') {
            showNotification('Player model not loaded yet', 2000);
        }
        return;
    }

    // If already transitioning, reverse the direction instead of starting new transition
    if (cameraState.isTransitioning) {
        // Reverse the transition by swapping start and target
        const temp = cameraState.transitionStartOffset.clone();
        cameraState.transitionStartOffset.copy(cameraState.transitionTargetOffset);
        cameraState.transitionTargetOffset.copy(temp);

        // Reverse the progress by resetting time based on current progress
        const elapsed = performance.now() - cameraState.transitionStartTime;
        const progress = Math.min(elapsed / cameraState.transitionDuration, 1);
        const remainingProgress = 1 - progress;
        cameraState.transitionStartTime = performance.now() - (remainingProgress * cameraState.transitionDuration);

        // Toggle mode
        cameraState.mode = (cameraState.mode === 'first-person') ? 'third-person' : 'first-person';

        console.log('📷 Reversing transition to', cameraState.mode.toUpperCase(), 'view');

        // Show notification
        if (typeof showNotification === 'function') {
            const msg = cameraState.mode === 'third-person' ? 'Third-Person Camera' : 'First-Person Camera (Cockpit View)';
            showNotification(msg, 2000);
        }

        return;
    }

    if (cameraState.mode === 'first-person') {
        // Switch to third-person
        cameraState.mode = 'third-person';
        cameraState.playerShipMesh.visible = true;

        // CRITICAL: Explicitly set all child meshes to visible
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
            }
        });

        // Start transition animation from first-person to third-person
        cameraState.isTransitioning = true;
        cameraState.transitionStartTime = performance.now();
        
        cameraState.transitionStartOffset.copy(cameraState.normalFirstPersonOffset);
        cameraState.transitionTargetOffset.copy(cameraState.normalThirdPersonOffset);

        console.log('📷 Transitioning to THIRD-PERSON view');

        // Show notification
        if (typeof showNotification === 'function') {
            showNotification('Third-Person Camera', 2000);
        }
    } else {
        // Switch to first-person (cockpit view)
        cameraState.mode = 'first-person';
        cameraState.playerShipMesh.visible = true; // Keep visible for cockpit view

        // Keep all child meshes visible for cockpit view
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
            }
        });

        // Start transition animation from third-person to first-person (reverse path)
        cameraState.isTransitioning = true;
        cameraState.transitionStartTime = performance.now();
        
        cameraState.transitionStartOffset.copy(cameraState.normalThirdPersonOffset);
        cameraState.transitionTargetOffset.copy(cameraState.normalFirstPersonOffset);

        console.log('📷 Transitioning to FIRST-PERSON view (cockpit)');

        // Show notification
        if (typeof showNotification === 'function') {
            showNotification('First-Person Camera (Cockpit View)', 2000);
        }
    }
}

/**
 * Update camera position for third-person view
 * Call this in the game loop
 */
function updateCameraView(camera) {
    // Camera position IS the player's actual flight position (controlled by game physics)
    // We just position the ship model to match, without modifying camera position

    // DEBUG: Track calls
    if (!window.updateCameraViewCallCount) window.updateCameraViewCallCount = 0;
    window.updateCameraViewCallCount++;

    if (!cameraState.playerShipMesh) {
        if (window.updateCameraViewCallCount % 120 === 0) {
            console.warn('⚠️ updateCameraView called but no playerShipMesh! Call count:', window.updateCameraViewCallCount);
        }
        return; // No ship model loaded yet
    }

    // CRITICAL: Hide ship during intro sequence
    if (typeof introSequence !== 'undefined' && introSequence.active) {
        if (window.updateCameraViewCallCount % 120 === 0) {
            console.log('  ⏸️ Intro active - hiding ship and returning early');
        }
        cameraState.playerShipMesh.visible = false;
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = false;
            }
        });
        return; // Don't update position during intro
    }
    
    // CRITICAL: Keep ship hidden if in 'zero-offset' mode (0 key) AND transition complete
    if (cameraState.mode === 'zero-offset' && !cameraState.isTransitioning) {
        cameraState.playerShipMesh.visible = false;
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = false;
            }
        });
        // Don't return - let position update run with zero offset
    } else {
        // Make ship visible when game is active (not in zero-offset mode)
        cameraState.playerShipMesh.visible = true;
        
        // CRITICAL: Force ALL child meshes visible (fixes warp disappearing issue)
        // During warp, the ship must remain visible on screen
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
            }
        });
    }

    // Calculate offset (with animation if transitioning)
    let currentOffset;

    if (cameraState.isTransitioning) {
        // Animate between offsets
        const elapsed = performance.now() - cameraState.transitionStartTime;
        const progress = Math.min(elapsed / cameraState.transitionDuration, 1);

        // Smooth easing function (ease-in-out)
        const easedProgress = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        // Interpolate between start and target offset
        currentOffset = new THREE.Vector3();
        currentOffset.lerpVectors(
            cameraState.transitionStartOffset,
            cameraState.transitionTargetOffset,
            easedProgress
        );

        // End transition when complete
        if (progress >= 1) {
            cameraState.isTransitioning = false;
            
        }
    } else if (cameraState.mode === 'zero-offset') {
        // Zero offset - ship behind camera (matches transition target)
        currentOffset = new THREE.Vector3(0.25, -1, 3);
    } else if (cameraState.mode === 'first-person') {
        // First-person offset
        currentOffset = cameraState.normalFirstPersonOffset.clone();
    } else {
        // Third-person offset
        currentOffset = cameraState.normalThirdPersonOffset.clone();
    }

    if (cameraState.mode === 'first-person') {
        // FIRST-PERSON MODE (COCKPIT VIEW):
        // Camera IS the player position - enemies target this location
        // Position the ship model so the camera is at the cockpit/center of the ship
        // The ship model is just visual - the camera position is the "real" player position

        // Use animated offset during transitions
        const cockpitOffset = currentOffset.clone();
        cockpitOffset.applyQuaternion(camera.quaternion);

        cameraState.playerShipMesh.position.copy(camera.position);
        cameraState.playerShipMesh.position.add(cockpitOffset);

        // Orient ship to face AWAY from camera (direction of travel)
        // v2254: Build rotation matrix from camera vectors for proper alignment
        const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        
        // Ship faces opposite direction (away from camera)
        const shipForward = camForward.clone().negate();
        
        // Build rotation matrix from direction vectors
        const shipMatrix = new THREE.Matrix4();
        shipMatrix.lookAt(new THREE.Vector3(), shipForward, camUp);
        const shipQuaternion = new THREE.Quaternion().setFromRotationMatrix(shipMatrix);
        
        // Add dynamic banking based on rotational velocity
        if (typeof rotationalVelocity !== 'undefined') {
            const bankAmount = -rotationalVelocity.yaw * 15;
            const pitchTilt = -rotationalVelocity.pitch * 5;
            const bankQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bankAmount);
            const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchTilt);
            shipQuaternion.multiply(bankQuat).multiply(pitchQuat);
        }
        
        cameraState.playerShipMesh.quaternion.copy(shipQuaternion);

        // Make ship visible but slightly transparent for cockpit view
        cameraState.playerShipMesh.visible = true;
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
                // Keep existing material transparency
            }
        });

    } else if (cameraState.mode === 'third-person') {
        // THIRD-PERSON MODE (CHASE CAMERA):
        // Camera is behind and above the ship looking at it
        // Ship positioned ahead of camera at a comfortable viewing distance

        // Use animated offset during transitions (same as first-person: ADD)
        const chaseOffset = currentOffset.clone();
        chaseOffset.applyQuaternion(camera.quaternion);

        // UNIFIED: Always ADD offset (third-person uses negative Z to put ship ahead)
        cameraState.playerShipMesh.position.copy(camera.position);
        cameraState.playerShipMesh.position.add(chaseOffset);

        // Orient ship to face AWAY from camera (direction of travel)
        // v2254: Build rotation matrix from camera vectors for proper alignment
        const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        
        // Ship faces opposite direction (away from camera, toward travel direction)
        const shipForward = camForward.clone().negate();
        
        // Build rotation matrix from direction vectors
        const shipMatrix = new THREE.Matrix4();
        shipMatrix.lookAt(new THREE.Vector3(), shipForward, camUp);
        const shipQuaternion = new THREE.Quaternion().setFromRotationMatrix(shipMatrix);
        
        // Add dynamic banking based on rotational velocity
        if (typeof rotationalVelocity !== 'undefined') {
            const bankAmount = -rotationalVelocity.yaw * 15;
            const pitchTilt = -rotationalVelocity.pitch * 5;
            const bankQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bankAmount);
            const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchTilt);
            shipQuaternion.multiply(bankQuat).multiply(pitchQuat);
        }
        
        cameraState.playerShipMesh.quaternion.copy(shipQuaternion);

        // Ensure the ship model is fully visible and opaque in third-person
        cameraState.playerShipMesh.visible = true;
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
            }
        });
    }
}

/**
 * Debug: Manually re-add player ship to scene if it was removed
 */
function readdPlayerShipToScene(scene) {
    if (!cameraState.playerShipMesh) {
        console.error('❌ No player ship mesh in cameraState');
        return false;
    }

    console.log('🔧 Attempting to re-add player ship to scene...');
    console.log('  - Current parent:', cameraState.playerShipMesh.parent);
    console.log('  - Scene provided:', !!scene);

    // Remove from current parent if it has one
    if (cameraState.playerShipMesh.parent) {
        cameraState.playerShipMesh.parent.remove(cameraState.playerShipMesh);
        console.log('  - Removed from current parent');
    }

    // Add to scene
    scene.add(cameraState.playerShipMesh);
    console.log('  - Added to scene');
    console.log('  - New parent:', cameraState.playerShipMesh.parent);
    console.log('  - In scene?', scene.children.includes(cameraState.playerShipMesh));

    return true;
}

/**
 * Adjust third-person camera distance
 */
function setThirdPersonDistance(distance) {
    cameraState.thirdPersonDistance = Math.max(5, Math.min(50, distance));
    console.log(`📷 Third-person distance: ${cameraState.thirdPersonDistance}`);
}

/**
 * Adjust third-person camera height
 */
function setThirdPersonHeight(height) {
    cameraState.thirdPersonHeight = Math.max(-10, Math.min(20, height));
    console.log(`📷 Third-person height: ${cameraState.thirdPersonHeight}`);
}

/**
 * Set camera to first-person mode (1 key)
 */
function setCameraFirstPerson() {
    if (!cameraState.playerShipMesh) {
        console.warn('⚠️ No player ship model available');
        return;
    }
    
    if (cameraState.mode === 'first-person' && !cameraState.isTransitioning) {
        console.log('📷 Already in first-person mode');
        return;
    }
    
    console.log('📷 Setting FIRST-PERSON view');
    
    // Capture current offset for smooth transition from wherever we are
    const currentOffset = getCurrentOffset();
    
    cameraState.mode = 'first-person';
    cameraState.playerShipMesh.visible = true;
    cameraState.isTransitioning = true;
    cameraState.transitionStartTime = performance.now();
    cameraState.transitionDuration = 400;
    cameraState.transitionStartOffset.copy(currentOffset);  // Start from current position
    cameraState.transitionTargetOffset.copy(cameraState.normalFirstPersonOffset);
    
    if (typeof showNotification === 'function') {
        showNotification('First-Person Camera', 2000);
    }
}

/**
 * Set camera to third-person mode (3 key)
 */
function setCameraThirdPerson() {
    if (!cameraState.playerShipMesh) {
        console.warn('⚠️ No player ship model available');
        return;
    }
    
    if (cameraState.mode === 'third-person' && !cameraState.isTransitioning) {
        console.log('📷 Already in third-person mode');
        return;
    }
    
    console.log('📷 Setting THIRD-PERSON view');
    
    // Capture current offset for smooth transition from wherever we are
    const currentOffset = getCurrentOffset();
    
    cameraState.mode = 'third-person';
    cameraState.playerShipMesh.visible = true;
    cameraState.isTransitioning = true;
    cameraState.transitionStartTime = performance.now();
    cameraState.transitionDuration = 400;
    cameraState.transitionStartOffset.copy(currentOffset);  // Start from current position
    cameraState.transitionTargetOffset.copy(cameraState.normalThirdPersonOffset);
    
    if (typeof showNotification === 'function') {
        showNotification('Third-Person Camera', 2000);
    }
}

/**
 * No ship visible, camera at zero offset (0 key)
 * This is camera offset (0,0,0) - not world position
 */
function setCameraNoShip() {
    if (!cameraState.playerShipMesh) {
        console.warn('⚠️ No player ship model available');
        return;
    }
    
    if (cameraState.mode === 'zero-offset' && !cameraState.isTransitioning) {
        console.log('📷 Already in zero-offset mode');
        return;
    }
    
    console.log('📷 Setting zero offset (cycling through 1st person first)');
    
    // Keep ship visible during transitions
    cameraState.playerShipMesh.visible = true;
    
    // If coming from 3rd person, go to 1st person first (like warp does)
    if (cameraState.mode === 'third-person') {
        // Step 1: Animate to first-person
        const currentOffset = getCurrentOffset();
        cameraState.mode = 'first-person';
        cameraState.isTransitioning = true;
        cameraState.transitionStartTime = performance.now();
        cameraState.transitionDuration = 400;
        cameraState.transitionStartOffset.copy(currentOffset);
        cameraState.transitionTargetOffset.copy(cameraState.normalFirstPersonOffset);
        
        // Step 2: After reaching 1st person, continue to zero-offset
        setTimeout(() => {
            const firstPersonOffset = getCurrentOffset();
            cameraState.mode = 'zero-offset';
            cameraState.isTransitioning = true;
            cameraState.transitionStartTime = performance.now();
            cameraState.transitionDuration = 400;
            cameraState.transitionStartOffset.copy(firstPersonOffset);
            cameraState.transitionTargetOffset.set(0.25, -1, 3);
        }, 420);  // Slightly after 1st transition completes
    } else {
        // Already in 1st person or other mode - go directly to zero-offset
        const currentOffset = getCurrentOffset();
        cameraState.mode = 'zero-offset';
        cameraState.isTransitioning = true;
        cameraState.transitionStartTime = performance.now();
        cameraState.transitionDuration = 400;
        cameraState.transitionStartOffset.copy(currentOffset);
        cameraState.transitionTargetOffset.set(0.25, -1, 3);
    }
    
    if (typeof showNotification === 'function') {
        showNotification('Zero Offset Camera', 2000);
    }
}

/**
 * Get player position based on camera mode
 * - 1st/3rd person: ship model position
 * - Zero offset: camera position (POV)
 */
function getPlayerPosition() {
    if (cameraState.mode === 'zero-offset') {
        // In zero-offset mode, player position IS the camera
        return window.camera ? window.camera.position.clone() : new THREE.Vector3();
    } else if (cameraState.playerShipMesh) {
        // In 1st/3rd person, player position is the ship model
        return cameraState.playerShipMesh.position.clone();
    } else {
        // Fallback to camera position
        return window.camera ? window.camera.position.clone() : new THREE.Vector3();
    }
}

/**
 * Helper: Get current interpolated offset
 */
function getCurrentOffset() {
    if (cameraState.isTransitioning) {
        const elapsed = performance.now() - cameraState.transitionStartTime;
        const progress = Math.min(elapsed / cameraState.transitionDuration, 1);
        return new THREE.Vector3().lerpVectors(
            cameraState.transitionStartOffset,
            cameraState.transitionTargetOffset,
            progress
        );
    } else if (cameraState.mode === 'first-person') {
        return cameraState.normalFirstPersonOffset.clone();
    } else if (cameraState.mode === 'third-person') {
        return cameraState.normalThirdPersonOffset.clone();
    } else if (cameraState.mode === 'zero-offset') {
        return new THREE.Vector3(0.25, -1, 3);  // Ship behind camera
    } else {
        return cameraState.normalFirstPersonOffset.clone();
    }
}

// Export functions to window
if (typeof window !== 'undefined') {
    window.initCameraSystem = initCameraSystem;
    window.toggleCameraView = toggleCameraView;
    window.updateCameraView = updateCameraView;
    window.setThirdPersonDistance = setThirdPersonDistance;
    window.setThirdPersonHeight = setThirdPersonHeight;
    window.readdPlayerShipToScene = readdPlayerShipToScene;
    window.setCameraFirstPerson = setCameraFirstPerson;
    window.setCameraThirdPerson = setCameraThirdPerson;
    window.setCameraNoShip = setCameraNoShip;
    window.getCurrentOffset = getCurrentOffset;
    window.getPlayerPosition = getPlayerPosition;
    window.cameraState = cameraState;
    window.createThrusterGlows = createThrusterGlows;
    window.updateThrusterGlow = updateThrusterGlow;

    console.log('✅ Camera system loaded (with thruster glow system)');
}

// =============================================================================
// THRUSTER GLOW SYSTEM
// =============================================================================

/**
 * Create thruster glow effects at the rear of the ship
 */
function createThrusterGlows(playerModel) {
    if (!playerModel || typeof THREE === 'undefined') return;
    
    // Clear existing glows
    cameraState.thrusterGlows.forEach(glow => {
        if (glow.parent) glow.parent.remove(glow);
        if (glow.geometry) glow.geometry.dispose();
        if (glow.material) glow.material.dispose();
    });
    cameraState.thrusterGlows = [];
    
    // Two thruster positions at rear engine exhausts (in local model space, small values)
    // Aligned with the 2 downward-facing points at back of ship
    const thrusterPositions = [
        new THREE.Vector3(-0.022, 0, -0.125),   // Left engine exhaust
        new THREE.Vector3(0.022, 0, -0.125)     // Right engine exhaust
    ];
    
    thrusterPositions.forEach((pos, index) => {
        // Create glow cone for engine exhaust
        const glowGeometry = new THREE.ConeGeometry(0.01, 0.035, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa00,  // Orange-yellow
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending
        });
        
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.copy(pos);
        glow.rotation.x = -Math.PI / 2;  // Cone points outward from ship
        glow.renderOrder = 101;  // Render on top of ship
        
        playerModel.add(glow);
        cameraState.thrusterGlows.push(glow);
        
        // Add a second larger, dimmer glow for effect
        const outerGlowGeometry = new THREE.ConeGeometry(0.015, 0.05, 8);
        const outerGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6600,  // Deeper orange
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending
        });
        
        const outerGlow = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
        outerGlow.position.copy(pos);
        outerGlow.position.z -= 0.008;  // Slightly further back (more negative Z)
        outerGlow.rotation.x = -Math.PI / 2;  // Cone points outward from ship
        outerGlow.renderOrder = 100;
        
        playerModel.add(outerGlow);
        cameraState.thrusterGlows.push(outerGlow);
    });
    
    console.log(`🔥 Created ${cameraState.thrusterGlows.length} thruster glow effects`);
}

/**
 * Update thruster glow based on input - call this each frame
 * @param {boolean} isThrusting - Whether W key (or other thrust) is active
 */
function updateThrusterGlow(isThrusting) {
    if (cameraState.thrusterGlows.length === 0) return;
    
    // Smooth intensity transition
    const targetIntensity = isThrusting ? 1.0 : 0.0;
    const transitionSpeed = isThrusting ? 0.2 : 0.15;  // Faster on, slower off
    
    cameraState.thrusterIntensity += (targetIntensity - cameraState.thrusterIntensity) * transitionSpeed;
    
    // Update each glow
    const time = Date.now() * 0.01;
    cameraState.thrusterGlows.forEach((glow, index) => {
        if (!glow.material) return;
        
        // Flicker effect when active
        const flicker = isThrusting ? (0.8 + Math.sin(time + index) * 0.2) : 1.0;
        const baseOpacity = index % 2 === 0 ? 0.8 : 0.4;  // Inner glows brighter
        
        glow.material.opacity = cameraState.thrusterIntensity * baseOpacity * flicker;
        
        // Scale glow with intensity
        const scale = 0.5 + cameraState.thrusterIntensity * 0.5;
        glow.scale.set(scale, scale + cameraState.thrusterIntensity * 0.3, scale);
    });
    
    cameraState.thrusterActive = isThrusting;
}
