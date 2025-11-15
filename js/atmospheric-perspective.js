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
// APPLY ATMOSPHERIC EFFECTS TO SCENE OBJECTS
// =============================================================================

function updateAtmosphericPerspective(camera) {
    if (!camera || !camera.position || !scene) return;

    const playerPos = camera.position;

    // Process all scene objects
    scene.traverse((object) => {
        if (!object.visible || !object.position) return;

        // Calculate distance from camera
        const distance = playerPos.distanceTo(object.position);

        // Determine if this object should have atmospheric effects
        let shouldApplyEffects = false;

        if (object.userData) {
            const type = object.userData.type;

            // Check object categories
            if (atmosphericConfig.enabledCategories.planets &&
                (type === 'planet' || type === 'moon')) {
                shouldApplyEffects = true;
            }
            if (atmosphericConfig.enabledCategories.stars &&
                (type === 'star' || type === 'pulsar' || type === 'supernova' || type === 'brown_dwarf')) {
                shouldApplyEffects = true;
            }
            if (atmosphericConfig.enabledCategories.nebulas && type === 'nebula') {
                shouldApplyEffects = true;
            }
            if (atmosphericConfig.enabledCategories.cosmicFeatures &&
                (type === 'dyson_sphere' || type === 'space_whale' || type === 'crystal_formation' ||
                 type === 'plasma_storm' || type === 'dark_matter_node' || type === 'ringworld')) {
                shouldApplyEffects = true;
            }
            if (atmosphericConfig.enabledCategories.debris &&
                (type === 'asteroid' || type === 'debris' || type === 'outer_asteroid')) {
                shouldApplyEffects = true;
            }
            if (atmosphericConfig.enabledCategories.galaxies && type === 'galaxy') {
                shouldApplyEffects = true;
            }
            if (atmosphericConfig.enabledCategories.outerSystems &&
                (object.userData.systemType === 'exotic_core' || object.userData.systemType === 'borg_patrol')) {
                shouldApplyEffects = true;
            }
        }

        // Apply effects if applicable
        if (shouldApplyEffects && object.material) {
            applyDistanceBasedOpacity(object, distance);
            applyAtmosphericScattering(object, distance);
        }
    });

    // Special handling for particle systems
    if (typeof nebulaClouds !== 'undefined' && nebulaClouds.length > 0) {
        nebulaClouds.forEach(nebula => {
            if (!nebula || !nebula.position) return;
            const distance = playerPos.distanceTo(nebula.position);

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

// Auto-enable depth of field on load
setTimeout(() => {
    enableDepthOfField();
}, 1000);

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
