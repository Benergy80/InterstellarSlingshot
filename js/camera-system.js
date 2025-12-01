/**
 * Third-Person Camera System for Interstellar Slingshot
 * Allows toggling between first-person and third-person camera views
 */

// Camera state
const cameraState = {
    mode: 'third-person',  // Cockpit view mode (camera inside model)
    playerShipMesh: null,  // Reference to the player ship 3D model
    thirdPersonDistance: 1,   // Not used in cockpit view
    thirdPersonHeight: 0.5,   // Not used in cockpit view
    smoothing: 0.15,          // Camera smoothing factor (lower = smoother)
    initialized: false,       // Flag to prevent double-initialization
    playerFlightPosition: new THREE.Vector3(),  // Store actual flight position
    playerFlightRotation: new THREE.Euler()     // Store actual flight rotation
};

/**
 * Initialize the camera system with the player ship model
 */
function initCameraSystem(camera, scene) {
    // Prevent double-initialization
    if (cameraState.initialized && cameraState.playerShipMesh) {
        console.log('🎥 Camera system already initialized, skipping...');
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
            playerModel.scale.set(4000, 4000, 4000);  // DEBUG: 50x bigger for visibility (80 → 4000)
            playerModel.position.set(0, 0, 0);

            // Center the model to fix position offset issues
            const box = new THREE.Box3().setFromObject(playerModel);
            const center = box.getCenter(new THREE.Vector3());

            // Offset all children to center the model at origin
            playerModel.traverse((child) => {
                if (child.isMesh) {
                    child.position.sub(center);
                }
            });

            // Make sure it's oriented correctly
            playerModel.rotation.y = Math.PI;  // Face forward

            // CRITICAL: Make the entire model visible
            playerModel.visible = true;  // DEBUG: Start visible since we're in third-person mode
            playerModel.frustumCulled = false;

            // Apply bright, self-lit material to all meshes
            playerModel.traverse((child) => {
                if (child.isMesh) {
                    // CRITICAL: Make each mesh visible
                    child.visible = true;
                    child.frustumCulled = false;

                    // DEBUG: Use wireframe mode to see through the giant model
                    child.material = new THREE.MeshBasicMaterial({
                        color: 0x00ffff,  // Bright cyan color for player ship
                        wireframe: true,   // DEBUG: Wireframe so we can see through it
                        transparent: true,
                        opacity: 0.8,      // Semi-transparent
                        side: THREE.DoubleSide,
                        depthWrite: false, // Don't write to depth buffer (allow seeing through)
                        depthTest: true
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            scene.add(playerModel);
            cameraState.playerShipMesh = playerModel;

            // DEBUG: Start in third-person mode (ship visible)
            playerModel.visible = true;

            console.log('✅ Player ship added to scene for third-person view (scale: 4000x, glowing cyan)');
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
        // Switch to first-person
        cameraState.mode = 'first-person';
        cameraState.playerShipMesh.visible = false;

        // Hide all child meshes too
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = false;
            }
        });

        console.log('📷 Switched to FIRST-PERSON view');

        // Show notification
        if (typeof showNotification === 'function') {
            showNotification('First-Person Camera', 2000);
        }
    }
}

/**
 * Update camera position for third-person view
 * Call this in the game loop
 */
function updateCameraView(camera) {
    // Store current camera position as the player's actual flight position
    cameraState.playerFlightPosition.copy(camera.position);
    cameraState.playerFlightRotation.copy(camera.rotation);

    if (cameraState.mode === 'first-person') {
        // FIRST-PERSON MODE (COCKPIT VIEW):
        // Camera stays at flight position (inside cockpit)
        // Ship model is hidden (camera is inside it)
        // Camera IS the perspective center
        // Flight controls directly move/rotate the camera

        // Ensure ship model is hidden in first-person
        if (cameraState.playerShipMesh) {
            cameraState.playerShipMesh.visible = false;
            cameraState.playerShipMesh.traverse((child) => {
                if (child.isMesh) {
                    child.visible = false;
                }
            });
        }

    } else if (cameraState.mode === 'third-person' && cameraState.playerShipMesh) {
        // THIRD-PERSON MODE:
        // Ship model positioned at flight position (player's actual location)
        // Camera positioned 1 unit behind and 0.5 units above the ship
        // Ship model IS the perspective center, camera follows behind

        // Position ship model at the player's actual flight position
        cameraState.playerShipMesh.position.copy(cameraState.playerFlightPosition);

        // Orient ship to match flight direction
        cameraState.playerShipMesh.rotation.copy(cameraState.playerFlightRotation);

        // Add dynamic banking based on rotational velocity
        if (typeof rotationalVelocity !== 'undefined') {
            // Apply roll (banking) based on yaw velocity
            const bankAmount = -rotationalVelocity.yaw * 15;
            cameraState.playerShipMesh.rotation.z += bankAmount;

            // Apply pitch tilt based on pitch velocity
            const pitchTilt = rotationalVelocity.pitch * 5;
            cameraState.playerShipMesh.rotation.x += pitchTilt;
        }

        // COCKPIT VIEW: Position camera inside the ship model
        // For 4000x scale model, cockpit is deep inside the model
        // In local ship space: -Z is forward, +Y is up, +X is right
        const cameraOffset = new THREE.Vector3(
            0,          // Centered (no left/right offset)
            150,        // Slightly up (cockpit height at 4000x scale)
            -1800       // Far forward inside the model (negative = forward)
        );

        // Rotate offset by ship's orientation
        cameraOffset.applyQuaternion(cameraState.playerShipMesh.quaternion);

        // Position camera inside the cockpit
        camera.position.copy(cameraState.playerShipMesh.position).add(cameraOffset);

        // CRITICAL: Camera rotation must match ship rotation so controls feel natural
        // Player controls the ship, camera follows with same orientation
        camera.rotation.copy(cameraState.playerShipMesh.rotation);

        // Ensure the ship model and all children are visible
        cameraState.playerShipMesh.visible = true;
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
            }
        });
    }
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
    window.cameraState = cameraState;

    console.log('✅ Camera system loaded');
}
