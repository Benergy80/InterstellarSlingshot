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
            playerModel.scale.set(96, 96, 96);  // Same size as regular enemies in local galaxy
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

                    // Self-illuminated material compatible with game lighting
                    const playerColor = new THREE.Color(0x00ffff);
                    child.material = new THREE.MeshStandardMaterial({
                        color: playerColor.multiplyScalar(0.4),  // Darker base color
                        emissive: 0x00ffff,  // Bright cyan emissive (self-lit)
                        emissiveIntensity: 0.8,  // Strong self-illumination
                        roughness: 0.6,
                        metalness: 0.7,
                        transparent: true,
                        opacity: 0.85,  // Slightly transparent to see through in cockpit
                        side: THREE.DoubleSide,
                        depthWrite: true,
                        depthTest: true
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            scene.add(playerModel);
            cameraState.playerShipMesh = playerModel;

            // Ship starts visible for both first-person (cockpit) and third-person views
            playerModel.visible = true;

            console.log('✅ Player ship added to scene (scale: 96x, cyan emissive)');
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
    // Camera position IS the player's actual flight position (controlled by game physics)
    // We just position the ship model to match, without modifying camera position

    if (cameraState.mode === 'first-person' && cameraState.playerShipMesh) {
        // FIRST-PERSON MODE:
        // Ship model positioned at camera (player's actual position)
        // Camera stays at same position (no offset to avoid drift bug)
        // Ship visible around the view

        // Position ship model at camera position
        cameraState.playerShipMesh.position.copy(camera.position);

        // Orient ship to match camera direction
        cameraState.playerShipMesh.rotation.copy(camera.rotation);

        // Add dynamic banking based on rotational velocity
        if (typeof rotationalVelocity !== 'undefined') {
            const bankAmount = -rotationalVelocity.yaw * 15;
            cameraState.playerShipMesh.rotation.z += bankAmount;
            const pitchTilt = rotationalVelocity.pitch * 5;
            cameraState.playerShipMesh.rotation.x += pitchTilt;
        }

        // IMPORTANT: Camera position is NOT modified - stays at player position
        // This prevents the drift bug

        // Ensure the ship model is visible
        cameraState.playerShipMesh.visible = true;
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
            }
        });

    } else if (cameraState.mode === 'third-person' && cameraState.playerShipMesh) {
        // THIRD-PERSON MODE:
        // Ship model positioned at camera (player's actual position)
        // Camera stays at same position (no offset to avoid drift bug)
        // Ship visible at camera location

        // Position ship model at camera position
        cameraState.playerShipMesh.position.copy(camera.position);

        // Orient ship to match camera direction
        cameraState.playerShipMesh.rotation.copy(camera.rotation);

        // Add dynamic banking based on rotational velocity
        if (typeof rotationalVelocity !== 'undefined') {
            const bankAmount = -rotationalVelocity.yaw * 15;
            cameraState.playerShipMesh.rotation.z += bankAmount;
            const pitchTilt = rotationalVelocity.pitch * 5;
            cameraState.playerShipMesh.rotation.x += pitchTilt;
        }

        // IMPORTANT: Camera position is NOT modified - stays at player position
        // This prevents the drift bug

        // Ensure the ship model is visible
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
