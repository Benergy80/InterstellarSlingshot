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
    smoothing: 0.15           // Camera smoothing factor (lower = smoother)
};

/**
 * Initialize the camera system with the player ship model
 */
function initCameraSystem(camera, scene) {
    console.log('🎥 Initializing camera system...');

    // Try to get the player model
    if (typeof getPlayerModel === 'function') {
        const playerModel = getPlayerModel();

        if (playerModel) {
            // Don't attach to camera - keep it in the scene
            playerModel.scale.set(1, 1, 1);
            playerModel.position.set(0, 0, 0);

            // Make sure it's oriented correctly
            playerModel.rotation.y = Math.PI;  // Face forward

            scene.add(playerModel);
            cameraState.playerShipMesh = playerModel;

            // Start in first-person mode (ship hidden)
            playerModel.visible = false;

            console.log('✅ Player ship added to scene for third-person view');
        } else {
            console.log('⚠️ No player model available');
        }
    }

    // Export to window for global access
    window.cameraState = cameraState;
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
        // Update player ship position to match camera (inverse of normal)
        // The ship follows the camera's position
        cameraState.playerShipMesh.position.copy(camera.position);

        // Match camera rotation
        cameraState.playerShipMesh.rotation.copy(camera.rotation);

        // Offset the camera behind and above the ship
        const distance = cameraState.thirdPersonDistance;
        const height = cameraState.thirdPersonHeight;

        // Calculate offset in local space
        const offset = new THREE.Vector3(0, height, distance);

        // Transform offset by camera's rotation to get world space offset
        offset.applyQuaternion(camera.quaternion);

        // Target position is ship position plus offset
        const targetPosition = new THREE.Vector3()
            .copy(cameraState.playerShipMesh.position)
            .add(offset);

        // Smoothly interpolate camera to target position
        camera.position.lerp(targetPosition, cameraState.smoothing);

        // Camera looks at the ship
        const lookAtTarget = new THREE.Vector3()
            .copy(cameraState.playerShipMesh.position);

        camera.lookAt(lookAtTarget);
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
