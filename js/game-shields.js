// =============================================================================
// ENERGY SHIELD SYSTEM
// Hexagonal energy shield with visual effects and game mechanics
// =============================================================================

const shieldSystem = {
    active: false,
    canvas: null,
    ctx: null,
    hexagons: [],
    hitEffects: [],
    pulseTime: 0,
    globalOpacityPulse: 0,
    energyDrainRate: 2.0,
    lastUpdateTime: 0,
    activationTime: 0,
    
    // Shield properties
    hexSize: 120,
    hexColor: 'rgba(0, 150, 255, 0.4)',
    hexGlowColor: 'rgba(0, 200, 255, 0.6)',
    damageReduction: 0.5,
    
    // Visual effects
    rippleEffect: null,
    flickerIntensity: 0,  // ENSURE THIS IS 0, NOT UNDEFINED
    
    // 3D Shield (buckyball for third-person view)
    mesh3D: null,
    glowMesh3D: null
};

// =============================================================================
// INITIALIZATION
// =============================================================================

function initShieldSystem() {
    shieldSystem.canvas = document.getElementById('shieldCanvas');
    
    if (!shieldSystem.canvas) {
        console.error('❌ Shield canvas not found! Cannot initialize shield system.');
        return false;
    }
    
    shieldSystem.ctx = shieldSystem.canvas.getContext('2d');
    
    if (!shieldSystem.ctx) {
        console.error('❌ Could not get 2D context for shield canvas!');
        return false;
    }
    
    // Set canvas size
    resizeShieldCanvas();
    window.addEventListener('resize', resizeShieldCanvas);
    
    // Generate hexagon grid
    generateHexagonGrid();
    
    console.log('🛡️ Shield system initialized successfully');
    return true;
}

function resizeShieldCanvas() {
    if (!shieldSystem.canvas) {
        console.warn('⚠️ Cannot resize shield canvas - canvas not found');
        return;
    }
    
    shieldSystem.canvas.width = window.innerWidth;
    shieldSystem.canvas.height = window.innerHeight;
    
    // Regenerate hexagons on resize
    if (shieldSystem.active) {
        generateHexagonGrid();
    }
}

// =============================================================================
// HEXAGON GRID GENERATION
// =============================================================================

function generateHexagonGrid() {
    shieldSystem.hexagons = [];
    
    const hexSize = shieldSystem.hexSize;
    const width = shieldSystem.canvas.width;
    const height = shieldSystem.canvas.height;
    
    // Proper hexagon spacing for perfect tiling (no overlap)
    const hexWidth = hexSize * Math.sqrt(3);  // Distance between hex centers horizontally
    const hexHeight = hexSize * 1.5;          // Distance between hex centers vertically
    
    // Calculate how many hexagons we need
    const cols = Math.ceil(width / hexWidth) + 2;
    const rows = Math.ceil(height / hexHeight) + 2;
    
    // Center point for spherical projection
    const centerX = width / 2;
    const centerY = height / 2;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
    
    for (let row = -2; row < rows; row++) {
        for (let col = -2; col < cols; col++) {
            // Offset every other row for hexagonal tiling
            const xOffset = (row % 2) * (hexWidth / 2);
            const x = col * hexWidth + xOffset;
            const y = row * hexHeight;
            
            // Calculate distance from center for spherical effect
            const dx = x - centerX;
            const dy = y - centerY;
            const distFromCenter = Math.sqrt(dx * dx + dy * dy);
            const normalizedDist = distFromCenter / maxDist;
            
            // Spherical projection: create depth illusion
            // Hexagons near edges are dimmer and slightly smaller
            const depthFactor = 1 - (normalizedDist * 0.5); // 0.5 to 1.0
            const curvature = Math.pow(depthFactor, 3); // Exponential falloff for sphere effect
            
            // Base opacity decreases towards edges
            const baseOpacity = 0.4 * curvature;
            
            shieldSystem.hexagons.push({
                x: x,
                y: y,
                baseOpacity: baseOpacity,
                currentOpacity: baseOpacity,
                pulse: Math.random() * Math.PI * 2,
                curvature: curvature,
                depthFactor: depthFactor,
                distFromCenter: normalizedDist
            });
        }
    }
    
    console.log(`🛡️ Generated ${shieldSystem.hexagons.length} hexagons for shield grid`);
}

// =============================================================================
// SHIELD ACTIVATION / DEACTIVATION
// =============================================================================

function toggleShields() {
    if (!gameState.gameStarted || gameState.gameOver) return;
    
    if (shieldSystem.active) {
        deactivateShields();
    } else {
        activateShields();
    }
}

function activateShields() {
    // Check if system is initialized
    if (!shieldSystem.canvas || !shieldSystem.ctx) {
        console.warn('⚠️ Shield system not initialized, attempting to initialize now...');
        const initialized = initShieldSystem();
        if (!initialized) {
            console.error('❌ Failed to initialize shield system');
            if (typeof showAchievement === 'function') {
                showAchievement('Shield System Error', 'Unable to activate shields');
            }
            return;
        }
    }
    
    // Check if we have enough energy to activate
    if (gameState.energy < 10) {
        if (typeof showAchievement === 'function') {
            showAchievement('Insufficient Energy', 'Need at least 10% energy to activate shields');
        }
        return;
    }
    
    shieldSystem.active = true;
    shieldSystem.activationTime = Date.now();
    shieldSystem.lastUpdateTime = Date.now();
    
    // Show overlay with fade-in
    const overlay = document.getElementById('shieldOverlay');
    if (overlay) {
        overlay.classList.add('active');
    }
    
    // Show indicator
    const indicator = document.getElementById('shieldIndicator');
    if (indicator) {
        indicator.classList.add('active');
        indicator.classList.remove('critical');
    }
    
    // Activation ripple effect (with safety check)
    if (shieldSystem.canvas && shieldSystem.canvas.width) {
        createShieldActivationRipple();
    }
    
    // Create 3D shield for third-person view
    create3DShield();
    
    // Play sound
    if (typeof playSound === 'function') {
        playSound('powerup', 600, 0.3);
    }
    
    if (typeof showAchievement === 'function') {
        showAchievement('🛡️ Shields Activated', 'Emergency warp and missiles disabled');
    }
    
    console.log('🛡️ Shields activated');
}

function deactivateShields(forced = false) {
    shieldSystem.active = false;
    
    // Hide overlay with fade-out
    const overlay = document.getElementById('shieldOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    
    // Hide indicator
    const indicator = document.getElementById('shieldIndicator');
    if (indicator) {
        indicator.classList.remove('active');
        indicator.classList.remove('critical');
    }
    
    // Clear canvas
    if (shieldSystem.ctx) {
        shieldSystem.ctx.clearRect(0, 0, shieldSystem.canvas.width, shieldSystem.canvas.height);
    }
    
    // Destroy 3D shield
    destroy3DShield();
    
    // Play sound
    if (typeof playSound === 'function') {
        playSound('warp', 400, 0.2);
    }
    
    if (typeof showAchievement === 'function') {
        const message = forced ? 'Shields depleted - energy exhausted' : 'Shields deactivated';
        showAchievement('🛡️ Shields Offline', message);
    }
    
    console.log('🛡️ Shields deactivated' + (forced ? ' (forced - no energy)' : ''));
}

// =============================================================================
// UPDATE & RENDER
// =============================================================================

function updateShieldSystem() {
    if (!shieldSystem.active) return;
    
    const now = Date.now();
    const deltaTime = (now - shieldSystem.lastUpdateTime) / 1000; // Convert to seconds
    shieldSystem.lastUpdateTime = now;
    
    // Drain energy
    const energyDrain = shieldSystem.energyDrainRate * deltaTime;
    gameState.energy = Math.max(0, gameState.energy - energyDrain);
    
    // Check if energy depleted
    if (gameState.energy <= 0) {
        createShieldFlickerEffect();
        setTimeout(() => deactivateShields(true), 500);
        return;
    }
    
    // Warning when energy is low
    const indicator = document.getElementById('shieldIndicator');
    if (gameState.energy < 15 && indicator) {
        indicator.classList.add('critical');
    } else if (indicator) {
        indicator.classList.remove('critical');
    }
    
    // Update status display
    updateShieldDisplay();
    
    // Update 3D shield position and effects
    update3DShield();
    
    // Show/hide appropriate shield based on camera mode
    const inThirdPerson = isThirdPersonView();
    
    // 3D shield visible only in third-person
    if (shieldSystem.mesh3D) {
        shieldSystem.mesh3D.visible = inThirdPerson;
        shieldSystem.glowMesh3D.visible = inThirdPerson;
    }
    
    // 2D overlay visible only in first-person
    const overlay = document.getElementById('shieldOverlay');
    if (overlay) {
        overlay.style.display = inThirdPerson ? 'none' : 'block';
    }
    
    // Render 2D shield (only processes if visible)
    if (!inThirdPerson) {
        renderShield();
    }
}

function updateShieldDisplay() {
    const statusEl = document.getElementById('shieldStatus');
    const drainEl = document.getElementById('shieldDrain');
    
    if (statusEl) {
        if (gameState.energy < 15) {
            statusEl.textContent = 'CRITICAL';
            statusEl.style.color = '#ff6600';
        } else {
            statusEl.textContent = 'ACTIVE';
            statusEl.style.color = '#00d4ff';
        }
    }
    
    if (drainEl) {
        drainEl.textContent = `${shieldSystem.energyDrainRate.toFixed(1)}%/s`;
    }
}

function renderShield() {
    if (!shieldSystem.ctx || !shieldSystem.canvas) return;
    
    const ctx = shieldSystem.ctx;
    const canvas = shieldSystem.canvas;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Safety check: ensure hexagons array exists FIRST
    if (!shieldSystem.hexagons || !Array.isArray(shieldSystem.hexagons) || shieldSystem.hexagons.length === 0) {
        console.warn('Shield hexagons not initialized, regenerating...');
        generateHexagonGrid();
        if (!shieldSystem.hexagons || shieldSystem.hexagons.length === 0) return;
    }
    
    // Update pulse animation (individual hexagons)
    shieldSystem.pulseTime += 0.02;
    
    // Update global opacity pulse (entire shield slowly pulses from 0.5 to 0.9)
shieldSystem.globalOpacityPulse += 0.008; // Slow pulse speed
const globalOpacity = 0.7 + Math.sin(shieldSystem.globalOpacityPulse) * 0.2; // Oscillates between 0.5 and 0.9
    
    // Ensure flickerIntensity is a valid number
    if (typeof shieldSystem.flickerIntensity !== 'number' || isNaN(shieldSystem.flickerIntensity)) {
        shieldSystem.flickerIntensity = 0;
    }
    
    // Draw hexagons
    shieldSystem.hexagons.forEach(hex => {
        // Skip invalid hexagons
        if (!hex || typeof hex !== 'object') return;
        
        // Validate hex properties
        if (typeof hex.baseOpacity !== 'number' || typeof hex.pulse !== 'number' || 
            typeof hex.curvature !== 'number') {
            return;
        }
        
        // Individual hexagon pulsing effect
        const pulse = Math.sin(shieldSystem.pulseTime + hex.pulse) * 0.1 + 0.9;
        
        // Apply global opacity pulse multiplier and flicker with safety
        hex.currentOpacity = hex.baseOpacity * pulse * globalOpacity * (1 - shieldSystem.flickerIntensity);
        
        // Final validation before drawing
        if (isNaN(hex.currentOpacity)) {
            hex.currentOpacity = 0;
            return;
        }
        
        drawHexagon(ctx, hex.x, hex.y, shieldSystem.hexSize, hex.currentOpacity, hex.curvature);
    });
    
    // Draw hit effects
    updateHitEffects(ctx);
    
    // Reduce flicker intensity
    shieldSystem.flickerIntensity *= 0.9;
}

function drawHexagon(ctx, x, y, size, opacity, curvature) {
    // Validate all inputs to prevent NaN errors
    if (!ctx || typeof x !== 'number' || typeof y !== 'number' || 
        typeof size !== 'number' || typeof opacity !== 'number' || 
        typeof curvature !== 'number') {
        return; // Skip invalid hexagons
    }
    
    // Skip if any value is NaN or invalid
    if (isNaN(x) || isNaN(y) || isNaN(size) || isNaN(opacity) || isNaN(curvature)) {
        return;
    }
    
    // Skip nearly invisible hexagons
    if (opacity <= 0.01) return;
    
    ctx.save();
    
    // Draw hexagon outline with proper vertices
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6; // Start from top vertex
        const hx = x + size * Math.cos(angle);
        const hy = y + size * Math.sin(angle);
        
        if (i === 0) {
            ctx.moveTo(hx, hy);
        } else {
            ctx.lineTo(hx, hy);
        }
    }
    ctx.closePath();
    
    // Spherical gradient fill - brighter in center, darker at edges
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
    
    // Calculate brightness with safety checks
    const centerBrightness = opacity * 0.4 * curvature;
    const edgeBrightness = opacity * 0.03 * curvature;
    
    // Final validation before adding color stops
    if (isNaN(centerBrightness) || isNaN(edgeBrightness)) {
        ctx.restore();
        return;
    }
    
    gradient.addColorStop(0, `rgba(100, 200, 255, ${centerBrightness})`);
    gradient.addColorStop(0.4, `rgba(50, 150, 255, ${edgeBrightness})`);
    gradient.addColorStop(1, `rgba(0, 100, 255, 0)`);
    
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Glowing outline - more prominent in center, subtle at edges
    const strokeOpacity = opacity * curvature * 0.8;
    
    // Validate stroke opacity
    if (!isNaN(strokeOpacity) && strokeOpacity > 0) {
        ctx.strokeStyle = `rgba(100, 200, 255, ${strokeOpacity})`;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10 * curvature;
        ctx.shadowColor = `rgba(100, 200, 255, ${strokeOpacity * 0.6})`;
        ctx.stroke();
    }
    
    ctx.restore();
}

// =============================================================================
// VISUAL EFFECTS
// =============================================================================

function createShieldActivationRipple() {
    shieldSystem.rippleEffect = {
        time: 0,
        duration: 1.0,
        maxRadius: Math.sqrt(
            shieldSystem.canvas.width * shieldSystem.canvas.width +
            shieldSystem.canvas.height * shieldSystem.canvas.height
        ) / 2
    };
    
    const animateRipple = () => {
        if (!shieldSystem.rippleEffect) return;
        
        shieldSystem.rippleEffect.time += 0.05;
        
        if (shieldSystem.rippleEffect.time >= shieldSystem.rippleEffect.duration) {
            shieldSystem.rippleEffect = null;
            return;
        }
        
        requestAnimationFrame(animateRipple);
    };
    
    animateRipple();
}

function createShieldHitEffect(hitPosition) {
    console.log('🛡️ createShieldHitEffect called', {
        active: shieldSystem.active,
        hitPosition: hitPosition
    });
    
    if (!shieldSystem.active) {
        console.log('⚠️ Shields not active, skipping hit effect');
        return;
    }
    
    // Convert 3D world position to 2D screen position
    const screenPos = worldToScreen(hitPosition);
    
    if (!screenPos) {
        console.log('⚠️ Could not convert world position to screen position');
        return;
    }
    
    console.log('✅ Screen position:', screenPos);
    
    // Add hit effect
    shieldSystem.hitEffects.push({
        x: screenPos.x,
        y: screenPos.y,
        radius: 20,
        maxRadius: 150,
        opacity: 1,
        time: 0
    });
    
    // Create stronger flicker on hit
    shieldSystem.flickerIntensity = Math.min(0.8, shieldSystem.flickerIntensity + 0.5);
    console.log('🔥 Flicker intensity set to:', shieldSystem.flickerIntensity);
    
    // Play shield absorption sound (energy deadening the impact)
    console.log('🔊 Attempting to play shield_hit sound...');
    if (typeof playSound === 'function') {
        playSound('shield_hit');
        console.log('✅ playSound called for shield_hit');
    } else {
        console.error('❌ playSound function not found!');
    }
}

function updateHitEffects(ctx) {
    shieldSystem.hitEffects = shieldSystem.hitEffects.filter(effect => {
        effect.time += 0.05;
        effect.radius += 5;
        effect.opacity -= 0.05;
        
        if (effect.opacity > 0) {
            // Draw expanding ring
            ctx.save();
            ctx.strokeStyle = `rgba(255, 200, 100, ${effect.opacity})`;
            ctx.lineWidth = 3;
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'rgba(255, 200, 100, 0.8)';
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            
            return true;
        }
        
        return false;
    });
}

function createShieldFlickerEffect() {
    shieldSystem.flickerIntensity = 1.0;
    
    let flickerCount = 0;
    const flickerInterval = setInterval(() => {
        shieldSystem.flickerIntensity = flickerCount % 2 === 0 ? 1.0 : 0.3;
        flickerCount++;
        
        if (flickerCount >= 6) {
            clearInterval(flickerInterval);
        }
    }, 100);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function worldToScreen(worldPosition) {
    if (!camera || !worldPosition) return null;
    
    const vector = worldPosition.clone();
    vector.project(camera);
    
    const x = (vector.x * 0.5 + 0.5) * shieldSystem.canvas.width;
    const y = (vector.y * -0.5 + 0.5) * shieldSystem.canvas.height;
    
    // Only return if in front of camera
    if (vector.z < 1) {
        return { x, y };
    }
    
    return null;
}

function isShieldActive() {
    return shieldSystem.active;
}

function getShieldDamageReduction() {
    return shieldSystem.active ? shieldSystem.damageReduction : 0;
}

// =============================================================================
// 3D SHIELD (BUCKYBALL) FOR THIRD-PERSON VIEW
// =============================================================================

function create3DShield() {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    
    // Remove existing if any
    destroy3DShield();
    
    // Create icosahedron geometry (buckyball/geodesic sphere base)
    const radius = 8;  // Size to surround ship (smaller, tighter fit)
    const detail = 1;   // Subdivision level for buckyball look
    const geometry = new THREE.IcosahedronGeometry(radius, detail);
    
    // Wireframe material for energy shield look
    const material = new THREE.MeshBasicMaterial({
        color: 0x00d4ff,
        wireframe: true,
        transparent: true,
        opacity: 0.6
    });
    
    shieldSystem.mesh3D = new THREE.Mesh(geometry, material);
    shieldSystem.mesh3D.renderOrder = 50;  // Render above most things
    
    // Add inner glow sphere
    const glowGeometry = new THREE.IcosahedronGeometry(radius * 0.95, detail);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x00d4ff,
        transparent: true,
        opacity: 0.15,
        side: THREE.BackSide
    });
    shieldSystem.glowMesh3D = new THREE.Mesh(glowGeometry, glowMaterial);
    shieldSystem.glowMesh3D.renderOrder = 49;
    
    scene.add(shieldSystem.mesh3D);
    scene.add(shieldSystem.glowMesh3D);
    
    console.log('🛡️ 3D buckyball shield created');
}

function destroy3DShield() {
    if (shieldSystem.mesh3D) {
        scene.remove(shieldSystem.mesh3D);
        shieldSystem.mesh3D.geometry.dispose();
        shieldSystem.mesh3D.material.dispose();
        shieldSystem.mesh3D = null;
    }
    if (shieldSystem.glowMesh3D) {
        scene.remove(shieldSystem.glowMesh3D);
        shieldSystem.glowMesh3D.geometry.dispose();
        shieldSystem.glowMesh3D.material.dispose();
        shieldSystem.glowMesh3D = null;
    }
}

function update3DShield() {
    if (!shieldSystem.mesh3D || !shieldSystem.active) return;
    
    // Get player ship position
    const playerPos = typeof getPlayerPosition === 'function' 
        ? getPlayerPosition() 
        : (window.cameraState?.playerShipMesh?.position || camera.position);
    
    // Position shield around player
    shieldSystem.mesh3D.position.copy(playerPos);
    shieldSystem.glowMesh3D.position.copy(playerPos);
    
    // Rotate slowly for visual effect
    shieldSystem.mesh3D.rotation.x += 0.005;
    shieldSystem.mesh3D.rotation.y += 0.008;
    shieldSystem.glowMesh3D.rotation.x += 0.003;
    shieldSystem.glowMesh3D.rotation.y += 0.005;
    
    // Pulse opacity based on energy level
    const pulse = Math.sin(Date.now() * 0.003) * 0.1;
    const energyFactor = gameState.energy / 100;
    shieldSystem.mesh3D.material.opacity = 0.5 + pulse + (energyFactor * 0.2);
    shieldSystem.glowMesh3D.material.opacity = 0.1 + (pulse * 0.5);
    
    // Change color when energy is low
    if (gameState.energy < 15) {
        shieldSystem.mesh3D.material.color.setHex(0xff6600);
        shieldSystem.glowMesh3D.material.color.setHex(0xff6600);
    } else {
        shieldSystem.mesh3D.material.color.setHex(0x00d4ff);
        shieldSystem.glowMesh3D.material.color.setHex(0x00d4ff);
    }
}

function isThirdPersonView() {
    return window.cameraState && window.cameraState.mode === 'third-person';
}

// =============================================================================
// EXPORTS
// =============================================================================

if (typeof window !== 'undefined') {
    window.shieldSystem = shieldSystem;
    window.initShieldSystem = initShieldSystem;
    window.toggleShields = toggleShields;
    window.updateShieldSystem = updateShieldSystem;
    window.createShieldHitEffect = createShieldHitEffect;
    window.isShieldActive = isShieldActive;
    window.getShieldDamageReduction = getShieldDamageReduction;
    window.create3DShield = create3DShield;
    window.destroy3DShield = destroy3DShield;
    window.update3DShield = update3DShield;
    
    console.log('🛡️ Shield system module loaded (with 3D buckyball shield)');
}