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
    transitionDuration: 400, // milliseconds
    transitionStartOffset: new THREE.Vector3(),
    transitionTargetOffset: new THREE.Vector3(),
    
    // Warp state tracking
    wasWarping: false,
    warpOffsetActive: false,
    // Normal offsets for reference
    normalFirstPersonOffset: new THREE.Vector3(0.25, -2, 0.5),
    normalThirdPersonOffset: new THREE.Vector3(0, 5, 20),  // Further back so ship appears smaller
    // Warp END offsets (where ship ends up after camera overtakes it)
    // Large positive Z = ship way in front, then it falls below frame
    warpFirstPersonOffset: new THREE.Vector3(0, 8, 40),    // Ship far ahead and above, falls out bottom
    warpThirdPersonOffset: new THREE.Vector3(0, 12, 50),   // Ship even further in third-person
    
    // Track if this is a warp transition (for custom easing)
    isWarpTransition: false
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
                    // Disable shadows for performance
                    child.castShadow = false;
                    child.receiveShadow = false;
                }
            });

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
        cameraState.isWarpTransition = false;  // Not a warp transition
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
        cameraState.isWarpTransition = false;  // Not a warp transition
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

    // Make ship visible when game is active
    cameraState.playerShipMesh.visible = true;

    // =========================================================================
    // WARP TRANSITION DETECTION
    // =========================================================================
    const isWarping = typeof gameState !== 'undefined' && 
                      gameState.emergencyWarp && 
                      gameState.emergencyWarp.active;
    
    // Detect warp START - trigger transition to warp offset (camera overtakes ship)
    if (isWarping && !cameraState.wasWarping) {
        console.log('🚀 WARP START - camera accelerating past ship');
        
        // Capture the CURRENT offset value (might be mid-transition)
        let currentOffset;
        if (cameraState.isTransitioning) {
            // If already transitioning, calculate current interpolated offset
            const elapsed = performance.now() - cameraState.transitionStartTime;
            const progress = Math.min(elapsed / cameraState.transitionDuration, 1);
            currentOffset = new THREE.Vector3().lerpVectors(
                cameraState.transitionStartOffset,
                cameraState.transitionTargetOffset,
                progress
            );
        } else {
            // Use current mode's normal offset
            currentOffset = cameraState.mode === 'first-person' 
                ? cameraState.normalFirstPersonOffset.clone()
                : cameraState.normalThirdPersonOffset.clone();
        }
        
        cameraState.isTransitioning = true;
        cameraState.transitionStartTime = performance.now();
        cameraState.transitionDuration = 1500;  // Longer duration - camera gradually overtakes
        
        // Start from EXACTLY where we are now
        cameraState.transitionStartOffset.copy(currentOffset);
        
        // Target: ship pushed far ahead (will fall out of frame below)
        if (cameraState.mode === 'first-person') {
            cameraState.transitionTargetOffset.copy(cameraState.warpFirstPersonOffset);
        } else {
            cameraState.transitionTargetOffset.copy(cameraState.warpThirdPersonOffset);
        }
        cameraState.warpOffsetActive = true;
        cameraState.isWarpTransition = 'out';  // Mark as warp-out for custom easing
    }
    
    // Detect warp END - trigger transition back to normal (ship catches up)
    if (!isWarping && cameraState.wasWarping) {
        console.log('🚀 WARP END - ship catching up to camera');
        
        // Capture current offset (might be mid-warp transition)
        let currentOffset;
        if (cameraState.isTransitioning) {
            const elapsed = performance.now() - cameraState.transitionStartTime;
            const progress = Math.min(elapsed / cameraState.transitionDuration, 1);
            currentOffset = new THREE.Vector3().lerpVectors(
                cameraState.transitionStartOffset,
                cameraState.transitionTargetOffset,
                progress
            );
        } else {
            currentOffset = cameraState.mode === 'first-person' 
                ? cameraState.warpFirstPersonOffset.clone()
                : cameraState.warpThirdPersonOffset.clone();
        }
        
        cameraState.isTransitioning = true;
        cameraState.transitionStartTime = performance.now();
        cameraState.transitionDuration = 1200;  // Graceful return
        cameraState.isWarpTransition = 'in';  // Mark as warp-in for custom easing
        
        // Start from where we are now
        cameraState.transitionStartOffset.copy(currentOffset);
        
        // Target: back to normal position
        if (cameraState.mode === 'first-person') {
            cameraState.transitionTargetOffset.copy(cameraState.normalFirstPersonOffset);
        } else {
            cameraState.transitionTargetOffset.copy(cameraState.normalThirdPersonOffset);
        }
        cameraState.warpOffsetActive = false;
    }
    
    cameraState.wasWarping = isWarping;
    // =========================================================================

    if (window.updateCameraViewCallCount % 120 === 0) {
        console.log('  ▶️ Game active - updating ship position');
    }

    // DEBUG: Log positions every 120 frames (every 2 seconds)
    if (!window.cameraDebugFrameCount) window.cameraDebugFrameCount = 0;
    window.cameraDebugFrameCount++;

    const shouldLog = (window.cameraDebugFrameCount % 120 === 0);

    if (shouldLog) {
        console.log('🔍 DEBUG BLOCK START - Frame:', window.cameraDebugFrameCount);
        console.log('📍 Camera position:', camera.position);
        console.log('🚢 Ship LOCAL position:', cameraState.playerShipMesh.position);
        console.log('🚢 Ship WORLD position:', cameraState.playerShipMesh.getWorldPosition(new THREE.Vector3()));
        console.log('📏 Ship scale:', cameraState.playerShipMesh.scale);
        console.log('🔄 Ship rotation:', cameraState.playerShipMesh.rotation);
        console.log('🎥 Camera mode:', cameraState.mode);
        console.log('🔍 Ship parent:', cameraState.playerShipMesh.parent);
        console.log('🔍 Ship visible:', cameraState.playerShipMesh.visible);
        console.log('🔍 DEBUG BLOCK END');
    }

    // Calculate offset (with animation if transitioning)
    let currentOffset;

    if (cameraState.isTransitioning) {
        // Animate between offsets
        const elapsed = performance.now() - cameraState.transitionStartTime;
        const progress = Math.min(elapsed / cameraState.transitionDuration, 1);

        // Custom easing based on transition type
        let easedProgress;
        if (cameraState.isWarpTransition === 'out') {
            // Warp OUT: ease-in (gradual acceleration - slow start, fast end)
            easedProgress = progress * progress * progress;  // Cubic ease-in
        } else if (cameraState.isWarpTransition === 'in') {
            // Warp IN: ease-out (gradual deceleration - fast start, slow end)
            easedProgress = 1 - Math.pow(1 - progress, 3);  // Cubic ease-out
        } else {
            // Normal transition: ease-in-out
            easedProgress = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        }

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
            cameraState.isWarpTransition = false;  // Clear warp transition flag
        }
    } else if (cameraState.mode === 'first-person') {
        // First-person offset (use warp offset if warping)
        currentOffset = cameraState.warpOffsetActive 
            ? cameraState.warpFirstPersonOffset.clone()
            : cameraState.normalFirstPersonOffset.clone();
    } else {
        // Third-person offset (use warp offset if warping)
        currentOffset = cameraState.warpOffsetActive 
            ? cameraState.warpThirdPersonOffset.clone()
            : cameraState.normalThirdPersonOffset.clone();
    }

    if (cameraState.mode === 'first-person') {
        // FIRST-PERSON MODE (COCKPIT VIEW):
        // Camera IS the player position - enemies target this location
        // Position the ship model so the camera is at the cockpit/center of the ship
        // The ship model is just visual - the camera position is the "real" player position

        // Use animated offset during transitions
        const cockpitOffset = currentOffset.clone();
        cockpitOffset.applyQuaternion(camera.quaternion);

        // DEBUG: Log before position update
        if (shouldLog) {
            console.log('  [1ST PERSON] BEFORE - Ship local pos:', cameraState.playerShipMesh.position.clone());
            console.log('  [1ST PERSON] Camera pos:', camera.position);
            console.log('  [1ST PERSON] Cockpit offset:', cockpitOffset);
        }

        cameraState.playerShipMesh.position.copy(camera.position);
        cameraState.playerShipMesh.position.add(cockpitOffset);

        // DEBUG: Log after position update
        if (shouldLog) {
            console.log('  [1ST PERSON] AFTER - Ship local pos:', cameraState.playerShipMesh.position.clone());
            console.log('  [1ST PERSON] AFTER - Ship world pos:', cameraState.playerShipMesh.getWorldPosition(new THREE.Vector3()));
        }

        // Orient ship to match camera direction using QUATERNIONS (avoids gimbal lock)
        const flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        const shipQuaternion = camera.quaternion.clone().multiply(flipY);
        
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

        // Use animated offset during transitions
        const chaseOffset = currentOffset.clone();
        chaseOffset.applyQuaternion(camera.quaternion);

        // DEBUG: Log before position update
        if (shouldLog) {
            console.log('  [3RD PERSON] BEFORE - Ship local pos:', cameraState.playerShipMesh.position.clone());
            console.log('  [3RD PERSON] Camera pos:', camera.position);
            console.log('  [3RD PERSON] Chase offset:', chaseOffset);
        }

        // CRITICAL: Copy camera position FIRST, then subtract offset
        cameraState.playerShipMesh.position.copy(camera.position);
        cameraState.playerShipMesh.position.sub(chaseOffset);

        // DEBUG: Log after position update
        if (shouldLog) {
            console.log('  [3RD PERSON] AFTER - Ship local pos:', cameraState.playerShipMesh.position.clone());
            console.log('  [3RD PERSON] AFTER - Ship world pos:', cameraState.playerShipMesh.getWorldPosition(new THREE.Vector3()));
        }

        // Orient ship to match camera direction using QUATERNIONS (avoids gimbal lock)
        // Create a 180° Y rotation quaternion to face the ship forward
        const flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        const shipQuaternion = camera.quaternion.clone().multiply(flipY);
        
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

// Export functions to window
if (typeof window !== 'undefined') {
    window.initCameraSystem = initCameraSystem;
    window.toggleCameraView = toggleCameraView;
    window.updateCameraView = updateCameraView;
    window.setThirdPersonDistance = setThirdPersonDistance;
    window.setThirdPersonHeight = setThirdPersonHeight;
    window.readdPlayerShipToScene = readdPlayerShipToScene;
    window.cameraState = cameraState;

    console.log('✅ Camera system loaded');
}
