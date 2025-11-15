// =============================================================================
// MOBILE CONTROLS - Complete Mobile Functionality
// FIXED: IIFE removed to ensure functions are immediately available to HTML
// =============================================================================

'use strict';

// Mobile touch flag to prevent automatic banking during touch input
window.mobileTouchActive = false;

// Mobile settings - use window object to avoid declaration conflicts
window.mobileSettings = window.mobileSettings || {
    crosshairTargeting: true,
    targetMode: true,
    forwardThrust: false
};

// Initialize mobile settings
document.addEventListener('DOMContentLoaded', () => {
    if (window.innerWidth <= 768 || 'ontouchstart' in window) {
        console.log('📱 Mobile device detected - enabling crosshair targeting and target mode');
        window.mobileSettings.crosshairTargeting = true;
        window.mobileSettings.targetMode = true;
        
        // Set target mode when game starts
        setTimeout(() => {
            if (typeof gameState !== 'undefined') {
                gameState.targetLock = gameState.targetLock || {};
                gameState.targetLock.active = true;
                console.log('📱 Target mode activated for mobile');
                
                // Enable auto-leveling by default on mobile (prevents unwanted roll)
                gameState.autoLevelingEnabled = true;
                console.log('📱 Auto-leveling enabled for mobile');
            }
        }, 2000);

        setupMobileLaunchMusicTrigger();
    }
});

// Setup music trigger for mobile launch button
function setupMobileLaunchMusicTrigger() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && (node.classList?.contains('intro-start-btn') || node.textContent?.includes('LAUNCH'))) {
                    console.log('📱 Found launch button, adding music trigger');
                    const originalClick = node.onclick;
                    node.onclick = function(e) {
                        console.log('📱 Launch button clicked - starting music');
                        
                        // Initialize audio system FIRST (enables all sound effects)
                        if (typeof initAudio === 'function') {
                            initAudio();
                            console.log('🔊 Audio system initialized from mobile launch');
                        }
                        
                        // Resume audio context (required for browsers)
                        if (typeof resumeAudioContext === 'function') {
                            resumeAudioContext();
                        }
                        
                        // Start background music
                        if (typeof startBackgroundMusic === 'function') {
                            setTimeout(() => {
                                startBackgroundMusic();
                                console.log('🎵 Background music started from mobile launch');
                            }, 500);
                        }
                        
                        if (originalClick) {
                            originalClick.call(this, e);
                        }
                    };
                }
            });
        });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(() => {
        const existingLaunchBtn = document.querySelector('.intro-start-btn, [onclick*="launch"], [onclick*="LAUNCH"]');
        if (existingLaunchBtn && !existingLaunchBtn.dataset.musicTriggerAdded) {
            console.log('📱 Adding music trigger to existing launch button');
            const originalClick = existingLaunchBtn.onclick;
            existingLaunchBtn.onclick = function(e) {
                console.log('📱 Launch button clicked - starting music');
                
                // Initialize audio system FIRST (enables all sound effects)
                if (typeof initAudio === 'function') {
                    initAudio();
                    console.log('🔊 Audio system initialized from mobile launch');
                }
                
                // Resume audio context (required for browsers)
                if (typeof resumeAudioContext === 'function') {
                    resumeAudioContext();
                }
                
                // Start background music
                if (typeof startBackgroundMusic === 'function') {
                    setTimeout(() => {
                        startBackgroundMusic();
                        console.log('🎵 Background music started from mobile launch');
                    }, 500);
                }
                
                if (originalClick) {
                    originalClick.call(this, e);
                }
            };
            existingLaunchBtn.dataset.musicTriggerAdded = 'true';
        }
    }, 1000);
}

// Make functions globally accessible
window.startForwardThrust = function() {
    window.mobileSettings.forwardThrust = true;
    
    if (typeof keys !== 'undefined') {
        keys.w = true;
    }
    
    if (typeof playSound === 'function') {
        playSound('thrust', 400, 0.1);
    }
    
    console.log('📱 Forward thrust started');
};

window.stopForwardThrust = function() {
    window.mobileSettings.forwardThrust = false;
    
    if (typeof keys !== 'undefined') {
        keys.w = false;
    }
    
    console.log('📱 Forward thrust stopped');
};

window.showMobilePanel = function(panelName) {
    const popup = document.getElementById(panelName + 'Popup');
    if (popup) {
        if (panelName === 'status') {
            window.updateMobileStatus();
        }
        popup.classList.add('active');
        
        if (typeof playSound === 'function') {
            playSound('ui_click', 800, 0.1);
        }
    }
};

window.hideMobilePanel = function(panelName) {
    const popup = document.getElementById(panelName + 'Popup');
    if (popup) {
        popup.classList.remove('active');
    }
};

window.updateMobileStatus = function() {
    if (typeof gameState === 'undefined') return;
    
    const updates = {
        'mobileVelocity': gameState.velocity ? (gameState.velocity * 1000).toFixed(0) + ' km/s' : '0.0 km/s',
        'mobileDistance': gameState.distance ? gameState.distance.toFixed(1) + ' ly' : '0.0 ly',
        'mobileEnergy': gameState.energy ? Math.round(gameState.energy) + '%' : '100%',
        'mobileHull': gameState.hull ? Math.round(gameState.hull) + '%' : '100%',
        'mobileWarpCount': gameState.emergencyWarpCount || 5,
        'mobileLocation': gameState.location || 'Local Galaxy',
        'mobileTarget': gameState.currentTarget ? gameState.currentTarget.userData.name : 'None',
        'mobileGalaxies': (gameState.galaxiesCleared || 0) + '/8'
    };

    Object.entries(updates).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });
};

window.mobileFireWeapon = function() {
    if (typeof keys !== 'undefined') {
        keys.space = true;
        setTimeout(() => keys.space = false, 100);
    }

    if (typeof playSound === 'function') {
        playSound('weapon', 800, 0.2);
    }
};

window.mobileLaunchMissile = function() {
    if (typeof fireMissile === 'function') {
        fireMissile();
    }

    if (typeof playSound === 'function') {
        playSound('ui_click', 1100, 0.15);
    }
};

window.mobileBrakes = function() {
    if (typeof keys !== 'undefined') {
        keys.x = true;
        setTimeout(() => keys.x = false, 200);
    }
    
    if (typeof playSound === 'function') {
        playSound('ui_click', 600, 0.1);
    }
    
    if (typeof showAchievement === 'function') {
        showAchievement('Brakes Engaged', 'Emergency deceleration activated');
    }
};

window.mobileBrakesStart = function() {
    if (typeof keys !== 'undefined') {
        keys.x = true;
    }
    
    if (typeof playSound === 'function') {
        playSound('ui_click', 600, 0.1);
    }
    
    console.log('📱 Mobile brakes started (holding)');
};

window.mobileBrakesEnd = function() {
    if (typeof keys !== 'undefined') {
        keys.x = false;
    }
    
    console.log('📱 Mobile brakes released');
};

window.mobileAutoNavigate = function() {
    if (typeof toggleAutoNavigate === 'function') {
        toggleAutoNavigate();
    } else {
        const autoNavBtn = document.getElementById('autoNavigateBtn');
        if (autoNavBtn) {
            autoNavBtn.click();
        }
    }
    
    if (typeof playSound === 'function') {
        playSound('navigation', 1000, 0.15);
    }
    
    setTimeout(() => {
        window.hideNavPanel();
    }, 500);
};

window.mobileWarpAction = function() {
    if (typeof executeSlingshot === 'function') {
        executeSlingshot();
    } else {
        if (typeof keys !== 'undefined') {
            keys.Enter = true;
            setTimeout(() => keys.Enter = false, 100);
        }
    }
    
    window.hideNavPanel();
};

window.mobileEmergencyWarp = function() {
    console.log('📱 Mobile emergency warp button pressed');
    
    // Check if warp is available
    if (typeof gameState === 'undefined' || !gameState.emergencyWarp) {
        console.warn('⚠️ Emergency warp system not initialized');
        return;
    }
    
    // Check if shields are active
    if (typeof isShieldActive === 'function' && isShieldActive()) {
        if (typeof showAchievement === 'function') {
            showAchievement('Warp Blocked', 'Cannot warp with shields active');
        }
        return;
    }
    
    // Check if already warping
    if (gameState.emergencyWarp.active) {
        console.log('⚠️ Already warping - ignoring button press');
        return;
    }
    
    // Check if charges available
    if (gameState.emergencyWarp.available <= 0) {
        if (typeof showAchievement === 'function') {
            showAchievement('No Warp Charges', 'Emergency warp depleted');
        }
        return;
    }
    
    // Trigger warp by setting key (the physics handler will process it)
    if (typeof keys !== 'undefined') {
        keys.o = true;
        // Clear after a single frame to prevent loops
        setTimeout(() => {
            keys.o = false;
        }, 50);
    }
    
    console.log('✅ Mobile emergency warp triggered');
};

window.mobileToggleAutoLevel = function() {
    if (typeof gameState !== 'undefined') {
        gameState.autoLevelingEnabled = !gameState.autoLevelingEnabled;
        
        if (typeof showAchievement === 'function') {
            showAchievement(
                'Auto-Leveling', 
                gameState.autoLevelingEnabled ? 'ENABLED - Camera will level out' : 'DISABLED - Free rotation'
            );
        }
        
        if (typeof playSound === 'function') {
            playSound('ui_click', 800, 0.1);
        }
        
        console.log('📱 Auto-leveling toggled:', gameState.autoLevelingEnabled ? 'ON' : 'OFF');
    }
};

window.mobileToggleShields = function() {
    console.log('📱 Mobile shields button pressed');
    
    // Call the main shields toggle function
    if (typeof toggleShields === 'function') {
        toggleShields();
        console.log('✅ Shields toggled via toggleShields()');
    } else if (typeof keys !== 'undefined') {
        // Fallback: simulate shift key press
        keys.shift = true;
        setTimeout(() => keys.shift = false, 100);
        console.log('✅ Shields toggled via keys.shift');
    }
    
    if (typeof playSound === 'function') {
        playSound('ui_click', 1000, 0.15);
    }
};

window.handleMobileFire = function(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    console.log('📱 Mobile fire button pressed');
    
    // Ensure game is active
    if (typeof gameState === 'undefined' || !gameState.gameStarted || gameState.gameOver) {
        console.log('Fire blocked - game not active');
        return;
    }
    
    // Resume audio context if needed
    if (typeof resumeAudioContext === 'function') {
        resumeAudioContext();
    }
    
    // Call the main fire weapon function
    if (typeof fireWeapon === 'function') {
        fireWeapon();
        console.log('✅ Fire weapon called successfully');
    } else if (typeof keys !== 'undefined') {
        // Fallback: simulate spacebar press
        keys.space = true;
        setTimeout(() => keys.space = false, 100);
        console.log('✅ Fire weapon via keys.space');
    }
    
    // Visual feedback
    const fireBtn = document.querySelector('.mobile-btn.primary, .mobile-btn.fire');
    if (fireBtn) {
        fireBtn.style.transform = 'scale(0.85)';
        fireBtn.style.opacity = '0.8';
        setTimeout(() => {
            fireBtn.style.transform = 'scale(1)';
            // Keep button transparent after first use
        }, 150);
    }
};

window.showNavPanel = function() {
    const navPanel = document.getElementById('navPanelMobile');
    if (navPanel) {
        window.updateMobileNavigation();
        navPanel.classList.add('active');
        
        if (typeof playSound === 'function') {
            playSound('ui_open', 1200, 0.1);
        }
    }
};

window.hideNavPanel = function() {
    const navPanel = document.getElementById('navPanelMobile');
    if (navPanel) {
        navPanel.classList.remove('active');
    }
};

window.updateMobileNavigation = function() {
    const mobileTargetsContainer = document.getElementById('mobileAvailableTargets');
    if (!mobileTargetsContainer) return;

    mobileTargetsContainer.innerHTML = '';
    
    if (typeof populateTargets === 'function') {
        populateTargets();
    }
    
    const desktopTargets = document.getElementById('availableTargets');
    if (desktopTargets) {
        const targetCards = desktopTargets.querySelectorAll('.planet-card');
        targetCards.forEach(card => {
            const mobileCard = card.cloneNode(true);
            
            mobileCard.style.cssText += `
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.4), rgba(30, 41, 59, 0.4));
                backdrop-filter: blur(8px);
                border: 1px solid rgba(0, 150, 255, 0.5);
                margin-bottom: 8px;
                font-family: 'Orbitron', monospace;
                transform: perspective(600px) rotateX(-1deg) translateZ(2px);
            `;
            
            mobileCard.onclick = (e) => {
                card.click();
                
                setTimeout(() => {
                    window.hideNavPanel();
                }, 300);
                
                if (typeof playSound === 'function') {
                    playSound('navigation', 900, 0.1);
                }
            };
            
            mobileTargetsContainer.appendChild(mobileCard);
        });
    }
    
    // Update mobile buttons
    const mobileAutoNavBtn = document.getElementById('mobileAutoNavigateBtn');
    const desktopAutoNavBtn = document.getElementById('autoNavigateBtn');
    if (mobileAutoNavBtn && desktopAutoNavBtn) {
        mobileAutoNavBtn.innerHTML = desktopAutoNavBtn.innerHTML;
        mobileAutoNavBtn.disabled = desktopAutoNavBtn.disabled;
    }
    
    const mobileWarpBtn = document.getElementById('mobileWarpBtn');
    const desktopWarpBtn = document.getElementById('warpBtn');
    if (mobileWarpBtn && desktopWarpBtn) {
        mobileWarpBtn.innerHTML = desktopWarpBtn.innerHTML;
        mobileWarpBtn.disabled = desktopWarpBtn.disabled;
    }
    
    const mobileOrbitBtn = document.getElementById('mobileToggleOrbitsBtn');
    const desktopOrbitBtn = document.getElementById('toggleOrbitsBtn');
    if (mobileOrbitBtn && desktopOrbitBtn) {
        mobileOrbitBtn.innerHTML = desktopOrbitBtn.innerHTML;
        mobileOrbitBtn.onclick = () => desktopOrbitBtn.click();
    }
    
    const mobileBlackHoleWarning = document.getElementById('mobileBlackHoleWarningHUD');
    const desktopBlackHoleWarning = document.getElementById('blackHoleWarningHUD');
    if (mobileBlackHoleWarning && desktopBlackHoleWarning) {
        if (desktopBlackHoleWarning.classList.contains('hidden')) {
            mobileBlackHoleWarning.classList.add('hidden');
        } else {
            mobileBlackHoleWarning.classList.remove('hidden');
            const mobileDistance = document.getElementById('mobileBlackHoleDistanceHUD');
            const desktopDistance = document.getElementById('blackHoleDistanceHUD');
            if (mobileDistance && desktopDistance) {
                mobileDistance.textContent = desktopDistance.textContent;
            }
        }
    }
    
    if (mobileTargetsContainer.children.length === 0) {
        mobileTargetsContainer.innerHTML = '<div style="text-align: center; opacity: 0.7; font-family: Orbitron, monospace; padding: 20px;">No targets available</div>';
    }
};

window.mobileCycleTarget = function() {
    console.log('📱 Cycling target');
    
    const targets = document.querySelectorAll('.target-btn');
    if (targets.length > 0) {
        targets[0].click();
    }
};

// Touch controls - isolated scope with let variables
let touchStartX = 0;
let touchStartY = 0;
let isTouching = false;
let twoFingerTouchStartDistance = 0;
let twoFingerTouchStartRotation = 0;

document.addEventListener('touchstart', (e) => {
    // Only handle touches on game canvas, not on UI buttons
    if (e.target.closest('.mobile-btn') ||
        e.target.closest('.mobile-controls-container') ||
        e.target.closest('.mobile-controls') ||
        e.target.closest('.mobile-popup') ||
        e.target.closest('.nav-panel-mobile')) {
        return; // Let button handlers work
    }
    
    if (e.target.id === 'gameCanvas' || e.target.closest('#gameContainer')) {
        if (e.touches.length === 1) {
            // Single finger - look controls
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            isTouching = true;
            window.mobileTouchActive = true; // Prevent automatic banking during touch
        } else if (e.touches.length === 2) {
            // Two fingers - roll control
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            twoFingerTouchStartDistance = Math.sqrt(dx * dx + dy * dy);
            twoFingerTouchStartRotation = Math.atan2(dy, dx);
            isTouching = false; // Disable single touch when two fingers active
        }
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    // Only handle touches on game canvas, not on UI buttons
    if (e.target.closest('.mobile-btn') ||
        e.target.closest('.mobile-controls-container') ||
        e.target.closest('.mobile-controls') ||
        e.target.closest('.mobile-popup') ||
        e.target.closest('.nav-panel-mobile')) {
        return;
    }
    
    if (typeof camera !== 'undefined') {
        if (e.touches.length === 1 && isTouching) {
            // Single finger - pitch and yaw controls (LOCAL SPACE - PLAYER POV)
            const touch = e.touches[0];
            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;
            
            const sensitivity = 0.003;
            
            // CRITICAL: Use LOCAL-space rotations (like desktop arrow keys)
            // This ensures left is left, right is right, up is up, down is down
            // FROM THE PLAYER'S PERSPECTIVE, regardless of camera orientation
            
            // Apply rotation deltas to LOCAL axes (not world axes)
            // This matches desktop arrow key behavior exactly
            
            // YAW (turn left/right) - rotate around LOCAL Y axis
            if (Math.abs(deltaX) > 0.5) {
                camera.rotateY(-deltaX * sensitivity);
            }
            
            // PITCH (look up/down) - rotate around LOCAL X axis  
            if (Math.abs(deltaY) > 0.5) {
                camera.rotateX(-deltaY * sensitivity);
            }
            
            // Normalize all rotation angles to prevent gimbal lock
            // This keeps angles in valid range without extracting/rebuilding
            const euler = camera.rotation;
            
            // Normalize yaw
            while (euler.y > Math.PI) euler.y -= Math.PI * 2;
            while (euler.y < -Math.PI) euler.y += Math.PI * 2;
            
            // Normalize pitch  
            while (euler.x > Math.PI) euler.x -= Math.PI * 2;
            while (euler.x < -Math.PI) euler.x += Math.PI * 2;
            
            // Normalize roll (preserve from 2-finger gestures)
            while (euler.z > Math.PI) euler.z -= Math.PI * 2;
            while (euler.z < -Math.PI) euler.z += Math.PI * 2;
            
            // Reset velocities to prevent automatic banking during mobile touch
            if (typeof rotationalVelocity !== 'undefined') {
                rotationalVelocity.pitch = 0;
                rotationalVelocity.yaw = 0;
                rotationalVelocity.roll = 0;
            }
            if (typeof window.rotationalVelocity !== 'undefined') {
                window.rotationalVelocity.pitch = 0;
                window.rotationalVelocity.yaw = 0;
                window.rotationalVelocity.roll = 0;
            }
            
            // Update timing for auto-leveling system
            if (typeof lastRollInputTime !== 'undefined') {
                lastRollInputTime = performance.now();
            }
            if (typeof window.lastRollInputTime !== 'undefined') {
                window.lastRollInputTime = performance.now();
            }
            
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            
            // Reset velocities to prevent automatic banking during mobile touch
            if (typeof rotationalVelocity !== 'undefined') {
                rotationalVelocity.pitch = 0;
                rotationalVelocity.yaw = 0;
                rotationalVelocity.roll = 0;
            }
            if (typeof window.rotationalVelocity !== 'undefined') {
                window.rotationalVelocity.pitch = 0;
                window.rotationalVelocity.yaw = 0;
                window.rotationalVelocity.roll = 0;
            }
            
            // Update timing for auto-leveling system
            if (typeof lastRollInputTime !== 'undefined') {
                lastRollInputTime = performance.now();
            }
            if (typeof window.lastRollInputTime !== 'undefined') {
                window.lastRollInputTime = performance.now();
            }
            
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            e.preventDefault();
        } else if (e.touches.length === 2) {
            // Two fingers - roll control (barrel roll)
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            const currentRotation = Math.atan2(dy, dx);
            
            // Calculate rotation delta
            let rotationDelta = currentRotation - twoFingerTouchStartRotation;
            
            // Normalize to [-PI, PI]
            while (rotationDelta > Math.PI) rotationDelta -= Math.PI * 2;
            while (rotationDelta < -Math.PI) rotationDelta += Math.PI * 2;
            
            // Apply roll directly to Z rotation
            // REVERSED: Flip sign so counter-clockwise gesture = counter-clockwise roll
            const rollSensitivity = 0.3;
            camera.rotation.z += rotationDelta * rollSensitivity;  // Changed from -= to +=
            
            // CRITICAL: Normalize roll angle to prevent gimbal lock
            while (camera.rotation.z > Math.PI) camera.rotation.z -= Math.PI * 2;
            while (camera.rotation.z < -Math.PI) camera.rotation.z += Math.PI * 2;
            
            // Update timing for auto-leveling
            if (typeof lastRollInputTime !== 'undefined') {
                lastRollInputTime = performance.now();
            }
            if (typeof window.lastRollInputTime !== 'undefined') {
                window.lastRollInputTime = performance.now();
            }
            
            // Update start rotation for next frame
            twoFingerTouchStartRotation = currentRotation;
            e.preventDefault();
        }
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    isTouching = false;
    window.mobileTouchActive = false; // Re-enable banking after touch ends
    
    // Reset yaw velocity to prevent banking from accumulated velocity
    if (typeof rotationalVelocity !== 'undefined') {
        rotationalVelocity.yaw = 0;
    }
    // Also try window object
    if (typeof window.rotationalVelocity !== 'undefined') {
        window.rotationalVelocity.yaw = 0;
    }
});

// Swipe gesture - isolated scope
let swipeStartX = 0;
let isSwipeGesture = false;

document.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Only detect swipes from TOP RIGHT corner (right 60px, top 150px)
    if (touch.clientX > screenWidth - 60 && touch.clientY < 150) {
        swipeStartX = touch.clientX;
        isSwipeGesture = true;
    }
});

document.addEventListener('touchmove', (e) => {
    if (isSwipeGesture) {
        const touch = e.touches[0];
        const deltaX = swipeStartX - touch.clientX;
        
        if (deltaX > 60) {
            window.showNavPanel();
            isSwipeGesture = false;
        }
    }
});

document.addEventListener('touchend', () => {
    isSwipeGesture = false;
});

// Swipe-to-close detection for nav panel
let closeSwipeStartX = 0;
let isCloseSwipeGesture = false;

document.addEventListener('touchstart', (e) => {
    const navPanel = document.getElementById('navPanelMobile');
    if (navPanel && navPanel.classList.contains('active')) {
        const touch = e.touches[0];
        // Detect swipe starting from the left edge of the screen (within navigation panel)
        if (touch.clientX < 100) {
            closeSwipeStartX = touch.clientX;
            isCloseSwipeGesture = true;
        }
    }
});

document.addEventListener('touchmove', (e) => {
    if (isCloseSwipeGesture) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - closeSwipeStartX;

        // Swipe right to close (at least 80px movement)
        if (deltaX > 80) {
            window.hideNavPanel();
            isCloseSwipeGesture = false;
        }
    }
});

document.addEventListener('touchend', () => {
    isCloseSwipeGesture = false;
});

// Close mobile popups on outside click (but NOT nav panel)
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('mobile-popup')) {
        e.target.classList.remove('active');
    }
});

// Periodic updates with game over check
const mobileUpdateInterval = setInterval(() => {
    // CRITICAL: Stop interval if game is over
    if (typeof gameState !== 'undefined' && gameState.gameOver) {
        clearInterval(mobileUpdateInterval);
        console.log('📱 Mobile update interval stopped - game over');
        return;
    }
    
    const statusPopup = document.getElementById('statusPopup');
    if (statusPopup && statusPopup.classList.contains('active')) {
        window.updateMobileStatus();
    }
    
    const navPanel = document.getElementById('navPanelMobile');
    if (navPanel && navPanel.classList.contains('active')) {
        window.updateMobileNavigation();
    }
    
    // Update floating status indicators (hull, energy, warps)
    if (typeof updateMobileFloatingStatus === 'function') {
        updateMobileFloatingStatus();
    } else {
        // Fallback: update directly
        if (typeof gameState !== 'undefined') {
            const hullEl = document.getElementById('mobileFloatingHull');
            const energyEl = document.getElementById('mobileFloatingEnergy');
            const warpsEl = document.getElementById('mobileFloatingWarps');

            if (hullEl) hullEl.textContent = Math.round(gameState.hull) + '%';
            if (energyEl) energyEl.textContent = Math.round(gameState.energy) + '%';
            if (warpsEl) warpsEl.textContent = gameState.emergencyWarp?.available ?? 5;
        }
    }
}, 1000);

// Show mobile controls after intro
document.addEventListener('DOMContentLoaded', () => {
    let introCompleted = false;
    
    function showMobileControlsIfMobile() {
        function isMobileDevice() {
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            const isNarrowScreen = window.innerWidth <= 768;
            const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
            return isTouchDevice && (isNarrowScreen || isCoarsePointer);
        }
        
        if (isMobileDevice()) {
            const mobileControlsContainer = document.querySelector('.mobile-controls-container');
            const navPanelMobile = document.querySelector('.nav-panel-mobile');
            const floatingStatus = document.getElementById('mobileFloatingStatus');

            if (mobileControlsContainer) {
                mobileControlsContainer.style.display = 'flex';
                console.log('📱 Mobile controls container now visible');
            }
            if (navPanelMobile) {
                navPanelMobile.style.display = 'block';
            }
            if (floatingStatus) {
                floatingStatus.style.display = 'flex';
                console.log('📱 Mobile floating status now visible');
            } else {
                console.log('📱 Floating status not found, creating it...');
                if (typeof createMobileFloatingStatus === 'function') {
                    createMobileFloatingStatus();
                }
            }
        }
    }
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const body = document.body;
                if (!body.classList.contains('intro-active') && !introCompleted) {
                    introCompleted = true;
                    setTimeout(() => {
                        const loadingScreen = document.getElementById('loadingScreen');
                        if (!loadingScreen || loadingScreen.style.display === 'none') {
                            showMobileControlsIfMobile();
                        } else {
                            const loadingObserver = new MutationObserver(() => {
                                if (loadingScreen.style.display === 'none') {
                                    showMobileControlsIfMobile();
                                    loadingObserver.disconnect();
                                }
                            });
                            loadingObserver.observe(loadingScreen, { attributes: true, attributeFilter: ['style'] });
                        }
                    }, 1000);
                }
            }
        });
    });
    
    observer.observe(document.body, { attributes: true });
});

window.hideMobileFloatingStatusDuringIntro = function() {
    const floatingStatus = document.getElementById('mobileFloatingStatus');
    if (floatingStatus) {
        floatingStatus.style.display = 'none';
    }
};

window.showMobileFloatingStatusAfterIntro = function() {
    const floatingStatus = document.getElementById('mobileFloatingStatus');
    if (floatingStatus) {
        floatingStatus.style.display = 'flex';
    }
};

// Prevent accidental behaviors
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

window.addEventListener('beforeunload', () => {
    if (window.mobileSettings.forwardThrust) {
        window.stopForwardThrust();
    }
});

console.log('📱 Mobile controls system loaded successfully');
