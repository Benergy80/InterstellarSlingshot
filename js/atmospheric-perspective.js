// =============================================================================
// ATMOSPHERIC PERSPECTIVE SYSTEM
// Adds depth perception through distance-based opacity, color shift, and atmospheric scattering
// =============================================================================

// Atmospheric perspective configuration
const atmosphericConfig = {
    // General opacity fade
    fadeStart: 70000,          // Objects start fading at this distance
    fadeEnd: 100000,           // Objects fully transparent at this distance
    minOpacity: 0.1,           // Minimum opacity (don't make completely invisible)

    // Color desaturation and atmospheric scattering
    colorShiftStart: 50000,    // Start shifting colors toward atmospheric color
    colorShiftEnd: 100000,     // Full atmospheric color at this distance
    atmosphericColor: new THREE.Color(0x0a0a1a), // Deep space blue-black
    scatteringIntensity: 0.4,  // How much to blend with atmospheric color (0-1)

    // Object categories to apply effects to
    enabledCategories: {
        planets: true,
        stars: true,
        nebulas: true,
        cosmicFeatures: true,
        debris: true,
        galaxies: true,
        outerSystems: true
    }
};

// Store original material properties for restoration
const originalMaterialProps = new WeakMap();

// =============================================================================
// OPACITY-BASED DISTANCE FADE (#3)
// =============================================================================

function applyDistanceBasedOpacity(object, distance) {
    // DISABLED FOR FPS TESTING
    return;

    if (!object || !object.material) return;

    const { fadeStart, fadeEnd, minOpacity } = atmosphericConfig;

    // No fade if within fade start distance
    if (distance < fadeStart) {
        if (object.material.transparent && object.userData.atmosphericFaded) {
            // Restore original opacity
            const originalProps = originalMaterialProps.get(object.material);
            if (originalProps) {
                object.material.opacity = originalProps.opacity;
            }
            object.userData.atmosphericFaded = false;
        }
        return;
    }

    // Calculate fade amount
    const fadeRange = fadeEnd - fadeStart;
    const fadeProgress = Math.min((distance - fadeStart) / fadeRange, 1.0);
    const targetOpacity = Math.max(1.0 - fadeProgress, minOpacity);

    // Store original opacity if not already stored
    if (!originalMaterialProps.has(object.material)) {
        originalMaterialProps.set(object.material, {
            opacity: object.material.opacity || 1.0,
            transparent: object.material.transparent || false,
            color: object.material.color ? object.material.color.clone() : null
        });
    }

    // Apply opacity fade
    const originalProps = originalMaterialProps.get(object.material);
    const baseOpacity = originalProps.opacity;

    object.material.transparent = true;
    object.material.opacity = baseOpacity * targetOpacity;
    object.userData.atmosphericFaded = true;
}

// =============================================================================
// SHADER-BASED ATMOSPHERIC SCATTERING (#6)
// =============================================================================

function applyAtmosphericScattering(object, distance) {
    // DISABLED FOR FPS TESTING
    return;

    if (!object || !object.material || !object.material.color) return;

    const { colorShiftStart, colorShiftEnd, atmosphericColor, scatteringIntensity } = atmosphericConfig;

    // No scattering if within start distance
    if (distance < colorShiftStart) {
        if (object.userData.atmosphericScattered) {
            // Restore original color
            const originalProps = originalMaterialProps.get(object.material);
            if (originalProps && originalProps.color) {
                object.material.color.copy(originalProps.color);
            }
            object.userData.atmosphericScattered = false;
        }
        return;
    }

    // Store original color if not already stored
    if (!originalMaterialProps.has(object.material)) {
        originalMaterialProps.set(object.material, {
            opacity: object.material.opacity || 1.0,
            transparent: object.material.transparent || false,
            color: object.material.color.clone()
        });
    }

    // Calculate scattering amount
    const scatterRange = colorShiftEnd - colorShiftStart;
    const scatterProgress = Math.min((distance - colorShiftStart) / scatterRange, 1.0);
    const scatterAmount = scatterProgress * scatteringIntensity;

    // Apply atmospheric color blending
    const originalProps = originalMaterialProps.get(object.material);
    if (originalProps.color) {
        const blendedColor = originalProps.color.clone();
        blendedColor.lerp(atmosphericColor, scatterAmount);
        object.material.color.copy(blendedColor);
        object.userData.atmosphericScattered = true;
    }
}

// =============================================================================
// APPLY ATMOSPHERIC EFFECTS TO SCENE OBJECTS - OPTIMIZED
// =============================================================================

// Cache for performance - only update when player moves significantly
let cachedPlayerPosition = new THREE.Vector3();
let cachedObjects = [];
let cacheUpdateDistance = 10000; // Re-cache when player moves this far

function updateAtmosphericPerspective(camera) {
    // DISABLED FOR FPS TESTING
    return;

    if (!camera || !camera.position || !scene) return;

    const playerPos = camera.position;

    // Only rebuild cache if player has moved significantly
    if (cachedPlayerPosition.distanceTo(playerPos) > cacheUpdateDistance || cachedObjects.length === 0) {
        cachedObjects = [];
        cachedPlayerPosition.copy(playerPos);

        // Build cache of relevant objects only
        scene.traverse((object) => {
            if (!object.visible || !object.position || !object.material) return;

            const distance = playerPos.distanceTo(object.position);

            // Skip objects too close or too far to need effects
            if (distance < 45000 || distance > 110000) return;

            if (object.userData) {
                const type = object.userData.type;

                // Check if object needs atmospheric effects
                if ((atmosphericConfig.enabledCategories.planets && (type === 'planet' || type === 'moon')) ||
                    (atmosphericConfig.enabledCategories.stars && (type === 'star' || type === 'pulsar' || type === 'supernova' || type === 'brown_dwarf')) ||
                    (atmosphericConfig.enabledCategories.nebulas && type === 'nebula') ||
                    (atmosphericConfig.enabledCategories.cosmicFeatures && (type === 'dyson_sphere' || type === 'space_whale' || type === 'crystal_formation' || type === 'plasma_storm' || type === 'dark_matter_node' || type === 'ringworld')) ||
                    (atmosphericConfig.enabledCategories.galaxies && type === 'galaxy') ||
                    (atmosphericConfig.enabledCategories.outerSystems && (object.userData.systemType === 'exotic_core' || object.userData.systemType === 'borg_patrol'))) {
                    cachedObjects.push(object);
                }
            }
        });
    }

    // Apply effects only to cached objects
    cachedObjects.forEach(object => {
        const distance = playerPos.distanceTo(object.position);
        applyDistanceBasedOpacity(object, distance);
        applyAtmosphericScattering(object, distance);
    });

    // Special handling for nebula particles - but only those in range
    if (typeof nebulaClouds !== 'undefined' && nebulaClouds.length > 0) {
        nebulaClouds.forEach(nebula => {
            if (!nebula || !nebula.position) return;
            const distance = playerPos.distanceTo(nebula.position);

            // Skip nebulas that are too far or too close
            if (distance < 45000 || distance > 110000) return;

            // Apply to nebula particles
            nebula.children.forEach(child => {
                if (child.type === 'Points' || child.type === 'Sprite') {
                    applyDistanceBasedOpacity(child, distance);
                }
            });
        });
    }
}

// =============================================================================
// POST-PROCESSING DEPTH OF FIELD (#5)
// Simulated without EffectComposer for compatibility
// =============================================================================

let depthOfFieldEnabled = false;

function enableDepthOfField() {
    depthOfFieldEnabled = true;
    console.log('✨ Depth of field simulation enabled');
}

function disableDepthOfField() {
    depthOfFieldEnabled = false;
    console.log('❌ Depth of field simulation disabled');
}

function updateDepthOfFieldEffect(camera) {
    // DISABLED FOR FPS TESTING
    return;

    if (!depthOfFieldEnabled || !camera || !camera.position || !scene) return;

    const playerPos = camera.position;
    const focusDistance = 5000;  // Objects at this distance are in perfect focus
    const blurStart = 15000;     // Start blurring beyond this distance
    const maxBlur = 50000;       // Maximum blur at this distance

    scene.traverse((object) => {
        if (!object.visible || !object.position || !object.material) return;

        const distance = playerPos.distanceTo(object.position);

        // Calculate blur amount based on distance from focus
        const distanceFromFocus = Math.abs(distance - focusDistance);

        if (distanceFromFocus > blurStart) {
            const blurRange = maxBlur - blurStart;
            const blurProgress = Math.min((distanceFromFocus - blurStart) / blurRange, 1.0);

            // Simulate blur by slightly reducing material detail
            // This is a simplified approach - full DoF would require post-processing
            if (object.material.metalness !== undefined) {
                object.material.roughness = Math.min(1.0, 0.5 + blurProgress * 0.5);
            }

            // Mark as blurred for tracking
            object.userData.depthBlurred = true;
        } else {
            // Restore original roughness if needed
            if (object.userData.depthBlurred && object.material.roughness !== undefined) {
                object.material.roughness = 0.5; // Default value
                object.userData.depthBlurred = false;
            }
        }
    });
}

// =============================================================================
// INITIALIZATION AND EXPORTS
// =============================================================================

// Depth of field disabled by default for performance
// It causes another full scene traversal which is too expensive
// setTimeout(() => {
//     enableDepthOfField();
// }, 1000);

// Export functions to global scope
if (typeof window !== 'undefined') {
    window.updateAtmosphericPerspective = updateAtmosphericPerspective;
    window.updateDepthOfFieldEffect = updateDepthOfFieldEffect;
    window.enableDepthOfField = enableDepthOfField;
    window.disableDepthOfField = disableDepthOfField;
    window.atmosphericConfig = atmosphericConfig;

    console.log('🌌 Atmospheric Perspective System loaded');
    console.log('  - Distance-based opacity fade: 70,000-100,000 units');
    console.log('  - Atmospheric color scattering: 50,000-100,000 units');
    console.log('  - Simulated depth of field enabled');
}
