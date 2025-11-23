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
            playerModel.scale.set(2, 2, 2);  // Make player ship visible and prominent
            playerModel.position.set(0, 0, 0);

            // Make sure it's oriented correctly
            playerModel.rotation.y = Math.PI;  // Face forward

            // Apply bright, self-lit material to all meshes
            playerModel.traverse((child) => {
                if (child.isMesh) {
                    // Create bright, glowing material for player ship
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x00ffff,  // Cyan color for player ship
                        emissive: 0x00ffff,
                        emissiveIntensity: 1.5,  // Bright glow
                        metalness: 0.8,
                        roughness: 0.2,
                        transparent: false
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
        console.log('⚠️ No player ship model available for third-person view');
        return;
    }

    if (cameraState.mode === 'first-person') {
        // Switch to third-person
        cameraState.mode = 'third-person';
        cameraState.playerShipMesh.visible = true;
        console.log('📷 Switched to THIRD-PERSON view');

        // Show notification
        if (typeof showNotification === 'function') {
            showNotification('Third-Person Camera', 2000);
        }
    } else {
        // Switch to first-person
        cameraState.mode = 'first-person';
        cameraState.playerShipMesh.visible = false;
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
        // In third-person mode, position the ship model ahead and below camera
        // so it's visible in the lower part of the screen

        // Start with camera position
        cameraState.playerShipMesh.position.copy(camera.position);

        // Calculate forward and down offset in camera's local space
        const forwardDistance = 50;  // Distance ahead of camera
        const downOffset = 15;  // Distance below camera center

        // Create offset vector (forward in camera space is negative Z)
        const offset = new THREE.Vector3(0, -downOffset, -forwardDistance);

        // Rotate offset by camera's orientation
        offset.applyQuaternion(camera.quaternion);

        // Apply offset to ship position
        cameraState.playerShipMesh.position.add(offset);

        // Orient ship to match camera facing direction
        cameraState.playerShipMesh.rotation.copy(camera.rotation);
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
