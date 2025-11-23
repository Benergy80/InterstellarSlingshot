/**
 * Third-Person Camera System for Interstellar Slingshot
 * Allows toggling between first-person and third-person camera views
 */

// Camera state
const cameraState = {
    mode: 'first-person',  // 'first-person' or 'third-person'
    playerShipMesh: null,  // Reference to the player ship 3D model
    thirdPersonDistance: 15,  // Distance behind ship
    thirdPersonHeight: 5,     // Height above ship
    smoothing: 0.15,          // Camera smoothing factor (lower = smoother)
    initialized: false        // Flag to prevent double-initialization
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
            playerModel.scale.set(80, 80, 80);  // Reduced by 20% (100 → 80)
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
            playerModel.visible = false;  // Start hidden (first-person mode)
            playerModel.frustumCulled = false;

            // Apply bright, self-lit material to all meshes
            playerModel.traverse((child) => {
                if (child.isMesh) {
                    // CRITICAL: Make each mesh visible
                    child.visible = true;
                    child.frustumCulled = false;

                    // Use MeshBasicMaterial - always visible, unaffected by lighting
                    child.material = new THREE.MeshBasicMaterial({
                        color: 0x00ffff,  // Bright cyan color for player ship
                        transparent: true,
                        opacity: 1.0,
                        side: THREE.DoubleSide,  // Ensure visible from all angles
                        depthWrite: true,
                        depthTest: true
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            scene.add(playerModel);
            cameraState.playerShipMesh = playerModel;

            // Start in first-person mode (ship hidden)
            playerModel.visible = false;

            console.log('✅ Player ship added to scene for third-person view (scale: 2x, glowing cyan)');
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
    if (cameraState.mode === 'third-person' && cameraState.playerShipMesh) {
        // In third-person mode, position ship at camera location
        // Camera view is from behind the ship

        // Position ship at camera location
        cameraState.playerShipMesh.position.copy(camera.position);

        // Calculate offset to place ship in front of camera view
        const forwardDistance = 50;  // Distance in front of camera for ship to be visible
        const downOffset = 10;  // Distance below camera center

        // Create offset vector (forward in camera space is negative Z)
        const offset = new THREE.Vector3(0, -downOffset, -forwardDistance);

        // Rotate offset by camera's orientation
        offset.applyQuaternion(camera.quaternion);

        // Apply offset to ship position
        cameraState.playerShipMesh.position.add(offset);

        // Orient ship to match camera facing direction
        cameraState.playerShipMesh.rotation.copy(camera.rotation);

        // Ensure the model and all children are visible
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
