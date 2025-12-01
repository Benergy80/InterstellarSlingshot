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
    playerFlightRotation: new THREE.Euler()     // Store actual flight rotation
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

        console.log('📷 Switched to THIRD-PERSON view');
        console.log('   Player ship position:', cameraState.playerShipMesh.position);
        console.log('   Player ship visible:', cameraState.playerShipMesh.visible);

        // Log child mesh visibility
        let visibleMeshCount = 0;
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh && child.visible) visibleMeshCount++;
        });
        console.log('   Visible child meshes:', visibleMeshCount);

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

        console.log('📷 Switched to FIRST-PERSON view (cockpit)');

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

    if (cameraState.mode === 'first-person') {
        // FIRST-PERSON MODE (COCKPIT VIEW):
        // Camera IS the player position - enemies target this location
        // Position the ship model so the camera is at the cockpit/center of the ship
        // The ship model is just visual - the camera position is the "real" player position

        // Position ship for centered first-person cockpit view
        // X: positive = right, negative = left (in camera's local space)
        // Y: positive = up, negative = down
        // Z: positive = back, negative = forward
        const cockpitOffset = new THREE.Vector3(-1, -2, 3); // Left 1, down 2, back 3
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

        // Orient ship to match camera direction
        cameraState.playerShipMesh.rotation.copy(camera.rotation);

        // Rotate ship 180 degrees on Y axis to face forward
        cameraState.playerShipMesh.rotation.y += Math.PI;

        // Add dynamic banking based on rotational velocity
        if (typeof rotationalVelocity !== 'undefined') {
            const bankAmount = -rotationalVelocity.yaw * 15;
            cameraState.playerShipMesh.rotation.z += bankAmount;
            const pitchTilt = rotationalVelocity.pitch * 5;
            cameraState.playerShipMesh.rotation.x += pitchTilt;
        }

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

        // Position ship ahead of camera so we can see it from behind
        const chaseDistance = 8; // Distance behind ship
        const chaseHeight = 3;   // Height above ship

        // Calculate offset: behind (positive Z), above (positive Y), and left (negative X)
        const chaseOffset = new THREE.Vector3(-1, chaseHeight, chaseDistance); // Left 1 unit
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

        // Orient ship to match camera direction
        cameraState.playerShipMesh.rotation.copy(camera.rotation);

        // Rotate ship 180 degrees on Y axis to face forward
        cameraState.playerShipMesh.rotation.y += Math.PI;

        // Add dynamic banking based on rotational velocity
        if (typeof rotationalVelocity !== 'undefined') {
            const bankAmount = -rotationalVelocity.yaw * 15;
            cameraState.playerShipMesh.rotation.z += bankAmount;
            const pitchTilt = rotationalVelocity.pitch * 5;
            cameraState.playerShipMesh.rotation.x += pitchTilt;
        }

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
