// =====================================================================
// MOBILE INTEGRATION FOR 3D SPACE GAME
// Add this to your existing JavaScript files
// =====================================================================

// 1. ADD TO game-controls.js or create new mobile-controls.js
// =====================================================================

// Mobile Detection and Setup
let isMobileDevice = false;
let touchControls = {
    active: false,
    lastTouch: { x: 0, y: 0 },
    sensitivity: 0.002,
    fireRadius: 80
};

function initializeMobileSystem() {
    // Detect mobile devices
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || 
                     window.innerWidth <= 768 || 
                     ('ontouchstart' in window);
    
    if (isMobileDevice) {
        console.log('🔥 Mobile device detected - activating mobile mode');
        document.body.classList.add('mobile-mode');
        setupMobileUI();
        setupMobileControls();
        enableAutoCrosshairTargeting();
        enableAutoThrust();
    }
    
    return isMobileDevice;
}

function setupMobileControls() {
    // Remove existing desktop event listeners for mobile
    if (isMobileDevice) {
        // Create touch overlay
        createTouchOverlay();
        
        // Modify existing crosshair for mobile
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
            crosshair.classList.add('mobile-crosshair');
            crosshair.style.width = '48px';
            crosshair.style.height = '48px';
            crosshair.style.borderWidth = '3px';
        }
        
        touchControls.active = true;
    }
}

function createTouchOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'mobileOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 5;
        background: transparent;
        touch-action: none;
    `;
    
    document.body.appendChild(overlay);
    
    // Touch event handlers
    let isPointerDown = false;
    let lastPointerPos = { x: 0, y: 0 };
    
    overlay.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        isPointerDown = true;
        lastPointerPos = { x: e.clientX, y: e.clientY };
        
        // Tap to fire near center
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const tapDistance = Math.sqrt(
            Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2)
        );
        
        if (tapDistance < touchControls.fireRadius) {
            handleMobileFire();
        }
    });
    
    overlay.addEventListener('pointermove', (e) => {
        e.preventDefault();
        
        if (isPointerDown) {
            const deltaX = e.clientX - lastPointerPos.x;
            const deltaY = e.clientY - lastPointerPos.y;
            
            // Apply camera rotation
            handleMobileLook(deltaX, deltaY);
            
            lastPointerPos = { x: e.clientX, y: e.clientY };
        }
        
        // Update crosshair position
        if (gameState.crosshairTargeting) {
            updateMobileCrosshair(e.clientX, e.clientY);
        }
    });
    
    overlay.addEventListener('pointerup', (e) => {
        e.preventDefault();
        isPointerDown = false;
    });
    
    // Prevent default touch behaviors
    overlay.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    overlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    overlay.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
}

// Integrate with existing camera controls
function handleMobileLook(deltaX, deltaY) {
    if (typeof camera !== 'undefined' && typeof gameState !== 'undefined') {
        // Apply rotation to existing camera system
        gameState.mouseMovementX = deltaX * touchControls.sensitivity;
        gameState.mouseMovementY = deltaY * touchControls.sensitivity;
        
        // Use existing camera rotation logic
        camera.rotation.y -= gameState.mouseMovementX;
        camera.rotation.x -= gameState.mouseMovementY;
        
        // Clamp vertical rotation
        camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
    }
}

function handleMobileFire() {
    // Use existing fire function if available
    if (typeof fireWeapon === 'function') {
        fireWeapon();
    } else {
        console.log('🔫 Mobile fire triggered');
        // Add your existing weapon firing logic here
    }
}

function updateMobileCrosshair(x, y) {
    const crosshair = document.getElementById('crosshair');
    if (crosshair && gameState) {
        gameState.crosshairX = x;
        gameState.crosshairY = y;
        crosshair.style.left = x + 'px';
        crosshair.style.top = y + 'px';
    }
}

function enableAutoCrosshairTargeting() {
    if (typeof gameState !== 'undefined') {
        gameState.crosshairTargeting = true;
        gameState.autoTargeting = true;
        console.log('📱 Auto-crosshair targeting enabled for mobile');
    }
}

function enableAutoThrust() {
    if (typeof gameState !== 'undefined') {
        gameState.autoThrust = true;
        gameState.thrustActive = true;
        console.log('🚀 Auto-thrust enabled for mobile');
    }
}

// =====================================================================
// 2. ADD TO game-ui.js - Mobile UI System
// =====================================================================

function setupMobileUI() {
    // Hide desktop panels on mobile
    const desktopPanels = document.querySelectorAll('.ui-panel');
    desktopPanels.forEach(panel => {
        panel.classList.add('desktop-only');
    });
    
    // Create mobile UI container
    createMobileUIContainer();
    createMobileTopBar();
    createMobileControls();
    createMobilePopups();
}

function createMobileUIContainer() {
    const mobileUI = document.createElement('div');
    mobileUI.className = 'mobile-ui';
    mobileUI.id = 'mobileUI';
    mobileUI.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 10;
    `;
    
    document.body.appendChild(mobileUI);
}

function createMobileTopBar() {
    const topBar = document.createElement('div');
    topBar.className = 'mobile-top-bar';
    topBar.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        right: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 25;
        pointer-events: auto;
    `;
    
    topBar.innerHTML = `
        <div class="mobile-info" style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.9)); backdrop-filter: blur(10px); border: 1px solid rgba(0,150,255,0.5); border-radius: 20px; padding: 8px 16px; color: white; font-size: 14px; font-weight: 600;">
            <div id="mobileVelocity">0.0 km/s</div>
        </div>
        <div class="mobile-info" style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.9)); backdrop-filter: blur(10px); border: 1px solid rgba(0,150,255,0.5); border-radius: 20px; padding: 8px 16px; color: white; font-size: 14px; font-weight: 600;">
            <div id="mobileEnergy">100%</div>
        </div>
        <button class="mobile-menu-btn" onclick="openMobilePopup('navigation')" style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, rgba(0, 150, 255, 0.8), rgba(0, 100, 200, 0.8)); border: 2px solid rgba(0, 200, 255, 0.6); color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer;">
            <i class="fas fa-map"></i>
        </button>
    `;
    
    document.getElementById('mobileUI').appendChild(topBar);
}

function createMobileControls() {
    const controls = document.createElement('div');
    controls.className = 'mobile-controls';
    controls.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 15px;
        z-index: 30;
        pointer-events: auto;
    `;
    
    const buttonStyle = `width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, rgba(0, 150, 255, 0.8), rgba(0, 100, 200, 0.8)); border: 2px solid rgba(0, 200, 255, 0.6); color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 15px rgba(0, 150, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);`;
    
    controls.innerHTML = `
        <button class="mobile-btn" onclick="openMobilePopup('status')" style="${buttonStyle}" title="Ship Status">
            <i class="fas fa-tachometer-alt"></i>
        </button>
        <button class="mobile-btn" onclick="mobileCycleTarget()" style="${buttonStyle}" title="Cycle Targets">
            <i class="fas fa-bullseye"></i>
        </button>
        <button class="mobile-btn primary" onclick="handleMobileFire()" style="${buttonStyle} width: 80px; height: 80px; background: linear-gradient(135deg, rgba(255, 50, 50, 0.8), rgba(200, 0, 0, 0.8)); border-color: rgba(255, 100, 100, 0.6);" title="Fire Weapons">
            <i class="fas fa-crosshairs"></i>
        </button>
        <button class="mobile-btn emergency" onclick="mobileEmergencyWarp()" style="${buttonStyle} background: linear-gradient(135deg, rgba(255, 150, 0, 0.8), rgba(200, 100, 0, 0.8)); border-color: rgba(255, 200, 0, 0.6);" title="Emergency Warp">
            <i class="fas fa-rocket"></i>
        </button>
        <button class="mobile-btn" onclick="openMobilePopup('controls')" style="${buttonStyle}" title="Controls">
            <i class="fas fa-cog"></i>
        </button>
    `;
    
    document.getElementById('mobileUI').appendChild(controls);
}

// Mobile button functions that interface with existing game functions
function mobileCycleTarget() {
    // Use existing tab targeting system
    if (typeof cycleTarget === 'function') {
        cycleTarget();
    } else if (typeof gameState !== 'undefined' && typeof populateTargets === 'function') {
        // Fallback target cycling
        const targets = document.querySelectorAll('#availableTargets .target-btn');
        if (targets.length > 0) {
            targets[0].click();
        }
    }
    
    // Visual feedback
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.boxShadow = '0 0 20px rgba(255, 255, 0, 0.8)';
        setTimeout(() => {
            crosshair.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.6), inset 0 0 20px rgba(0, 255, 0, 0.3)';
        }, 300);
    }
}

function mobileEmergencyWarp() {
    // Interface with existing emergency warp system
    if (typeof gameState !== 'undefined' && gameState.emergencyWarp && gameState.emergencyWarp.available > 0) {
        // Use existing warp function
        if (typeof triggerEmergencyWarp === 'function') {
            triggerEmergencyWarp();
        } else {
            // Fallback warp
            gameState.emergencyWarp.available--;
            gameState.emergencyWarp.active = true;
            if (typeof showAchievement === 'function') {
                showAchievement('Emergency Warp', 'Warp drive engaged!');
            }
        }
        
        // Visual feedback
        document.body.style.filter = 'brightness(2) blur(2px)';
        setTimeout(() => {
            document.body.style.filter = 'none';
        }, 500);
    }
}

// =====================================================================
// 3. ADD TO styles.css - Mobile Styles
// =====================================================================

const mobileStyles = `
/* Mobile Mode Override */
body.mobile-mode {
    cursor: auto !important;
    touch-action: manipulation;
}

body.mobile-mode .ui-panel.desktop-only {
    display: none !important;
}

/* Enhanced mobile crosshair */
.crosshair.mobile-crosshair {
    width: 48px !important;
    height: 48px !important;
    border-width: 3px !important;
    border-color: rgba(0, 255, 0, 1) !important;
}

.crosshair.mobile-crosshair::before {
    left: -16px !important;
    right: -16px !important;
    height: 3px !important;
}

.crosshair.mobile-crosshair::after {
    top: -16px !important;
    bottom: -16px !important;
    width: 3px !important;
}

/* Mobile UI visibility */
.mobile-ui {
    display: none;
}

body.mobile-mode .mobile-ui {
    display: block !important;
}

/* Thrust always-on indicator */
.thrust-indicator {
    position: fixed;
    top: 50%;
    right: 20px;
    transform: translateY(-50%);
    width: 8px;
    height: 120px;
    background: rgba(50, 50, 50, 0.8);
    border-radius: 4px;
    border: 1px solid rgba(0, 150, 255, 0.5);
    z-index: 25;
}

.thrust-fill {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, #ff4500, #ffff00, #00ff00);
    border-radius: 3px;
    height: 100%;
    transition: height 0.1s ease;
}

/* Mobile popup styles */
.mobile-popup {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    z-index: 50;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
}

.mobile-popup.active {
    display: flex !important;
}

.popup-content {
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
    border: 2px solid rgba(0, 150, 255, 0.6);
    border-radius: 20px;
    padding: 24px;
    color: white;
    max-width: 90vw;
    max-height: 80vh;
    overflow-y: auto;
}

@media (max-width: 768px) {
    .mobile-btn {
        width: 56px !important;
        height: 56px !important;
        font-size: 20px !important;
    }
    
    .mobile-btn.primary {
        width: 72px !important;
        height: 72px !important;
    }
}
`;

// =====================================================================
// 4. INTEGRATION FUNCTIONS - Add to your main game initialization
// =====================================================================

function integrateAutoThrust() {
    // Modify existing physics update to include auto-thrust on mobile
    if (isMobileDevice && gameState.autoThrust) {
        // Apply constant forward thrust
        const forwardDirection = new THREE.Vector3(0, 0, -1);
        camera.getWorldDirection(forwardDirection);
        
        const thrustForce = gameState.thrustPower * 0.3; // Reduced for mobile
        gameState.velocityVector.addScaledVector(forwardDirection, thrustForce);
        
        // Show thrust indicator
        updateThrustIndicator(1.0); // 100% thrust
    }
}

function updateThrustIndicator(thrustLevel) {
    const thrustFill = document.getElementById('thrustFill');
    if (thrustFill) {
        thrustFill.style.height = (thrustLevel * 100) + '%';
    }
}

// Update existing UI update function to include mobile elements
function updateMobileUI() {
    if (!isMobileDevice) return;
    
    const mobileVelocity = document.getElementById('mobileVelocity');
    const mobileEnergy = document.getElementById('mobileEnergy');
    
    if (mobileVelocity && gameState) {
        mobileVelocity.textContent = \`\${(gameState.velocity * 1000).toFixed(1)} km/s\`;
    }
    
    if (mobileEnergy && gameState) {
        mobileEnergy.textContent = \`\${gameState.energy.toFixed(0)}%\`;
    }
    
    updateThrustIndicator(gameState.autoThrust ? 1.0 : 0);
}

// Popup management functions
function openMobilePopup(popupType) {
    const popup = document.getElementById(popupType + 'Popup');
    if (popup) {
        popup.classList.add('active');
    }
}

function closeMobilePopup(popupType) {
    const popup = document.getElementById(popupType + 'Popup');
    if (popup) {
        popup.classList.remove('active');
    }
}

// =====================================================================
// 5. INITIALIZATION - Add to your main game init function
// =====================================================================

// Call this in your main initialization function
function initializeGame() {
    // ... your existing init code ...
    
    // Add mobile initialization
    initializeMobileSystem();
    
    // Inject mobile styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = mobileStyles;
    document.head.appendChild(styleSheet);
    
    // ... rest of your init code ...
}

// Modify your existing animation loop to include mobile updates
function animate() {
    // ... your existing animation code ...
    
    // Add mobile-specific updates
    if (isMobileDevice) {
        integrateAutoThrust();
        updateMobileUI();
    }
    
    requestAnimationFrame(animate);
}

// =====================================================================
// 6. EXAMPLE MOBILE POPUP HTML - Add to your index.html
// =====================================================================

const mobilePopupHTML = \`
<!-- Add these popup divs to your HTML body -->
<div class="mobile-popup" id="navigationPopup">
    <div class="popup-content">
        <div class="popup-header">
            <h3 class="popup-title">NAVIGATION</h3>
            <button class="popup-close" onclick="closeMobilePopup('navigation')">&times;</button>
        </div>
        <div id="availableTargetsMobile">
            <!-- This will be populated by your existing populateTargets function -->
        </div>
        <button onclick="mobileAutoNavigate()" class="mobile-btn" style="width: 100%; height: 48px; border-radius: 12px; margin-top: 15px;">
            <i class="fas fa-route"></i> Auto-Navigate
        </button>
    </div>
</div>

<div class="mobile-popup" id="statusPopup">
    <div class="popup-content">
        <div class="popup-header">
            <h3 class="popup-title">SHIP STATUS</h3>
            <button class="popup-close" onclick="closeMobilePopup('status')">&times;</button>
        </div>
        <div>
            <div>Energy: <span id="statusEnergy">100%</span></div>
            <div>Hull: <span id="statusHull">100%</span></div>
            <div>Velocity: <span id="statusVelocity">0.0 km/s</span></div>
            <div>Emergency Warps: <span id="statusWarps">5</span></div>
        </div>
    </div>
</div>

<div class="mobile-popup" id="controlsPopup">
    <div class="popup-content">
        <div class="popup-header">
            <h3 class="popup-title">TOUCH CONTROLS</h3>
            <button class="popup-close" onclick="closeMobilePopup('controls')">&times;</button>
        </div>
        <div>
            <h4>Touch Gestures:</h4>
            <p>• Swipe/Drag: Look around space</p>
            <p>• Tap Screen: Fire weapons at crosshair</p>
            <p>• Thrust: Always active (automatic)</p>
            
            <h4>Settings:</h4>
            <label>
                <input type="checkbox" id="crosshairMode" checked onchange="toggleCrosshairMode()">
                Crosshair Targeting
            </label>
            <br>
            <label>
                <input type="checkbox" id="autoThrust" checked onchange="toggleAutoThrust()">
                Automatic Thrust
            </label>
        </div>
    </div>
</div>
\`;

// Add thrust indicator HTML
const thrustIndicatorHTML = \`
<div class="thrust-indicator" id="thrustIndicator">
    <div class="thrust-fill" id="thrustFill" style="height: 100%;"></div>
</div>
\`;

console.log('📱 Mobile integration code loaded - ready for implementation!');
