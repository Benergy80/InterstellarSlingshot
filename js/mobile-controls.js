// =============================================================================
// MOBILE CONTROLS - Complete Mobile Functionality
// =============================================================================

// Mobile settings - with safety check to prevent duplicate declarations
if (typeof mobileSettings === 'undefined') {
    var mobileSettings = {
        crosshairTargeting: true,
        targetMode: true,
        forwardThrust: false
    };
} else {
    console.log('📱 mobileSettings already declared, skipping initialization');
}

// Initialize mobile settings
document.addEventListener('DOMContentLoaded', () => {
    if (window.innerWidth <= 768 || 'ontouchstart' in window) {
        console.log('📱 Mobile device detected - enabling crosshair targeting and target mode');
        mobileSettings.crosshairTargeting = true;
        mobileSettings.targetMode = true;
        
        // Set target mode when game starts
        setTimeout(() => {
            if (typeof gameState !== 'undefined') {
                gameState.targetLock = gameState.targetLock || {};
                gameState.targetLock.active = true;
                console.log('📱 Target mode activated for mobile');
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
                        
                        if (typeof startBackgroundMusic === 'function') {
                            setTimeout(() => {
                                startBackgroundMusic();
                                console.log('🎵 Background music started from mobile launch');
                            }, 500);
                        }
                        
                        if (typeof resumeAudioContext === 'function') {
                            resumeAudioContext();
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
                
                if (typeof startBackgroundMusic === 'function') {
                    setTimeout(() => {
                        startBackgroundMusic();
                        console.log('🎵 Background music started from mobile launch');
                    }, 500);
                }
                
                if (typeof resumeAudioContext === 'function') {
                    resumeAudioContext();
                }
                
                if (originalClick) {
                    originalClick.call(this, e);
                }
            };
            existingLaunchBtn.dataset.musicTriggerAdded = 'true';
        }
    }, 1000);
}

// =============================================================================
// FORWARD THRUST FUNCTIONS
// =============================================================================

function startForwardThrust() {
    mobileSettings.forwardThrust = true;
    
    if (typeof keys !== 'undefined') {
        keys.w = true;
    }
    
    if (typeof playSound === 'function') {
        playSound('thrust', 400, 0.1);
    }
    
    console.log('📱 Forward thrust started');
}

function stopForwardThrust() {
    mobileSettings.forwardThrust = false;
    
    if (typeof keys !== 'undefined') {
        keys.w = false;
    }
    
    console.log('📱 Forward thrust stopped');
}

// =============================================================================
// MOBILE PANEL MANAGEMENT
// =============================================================================

function showMobilePanel(panelName) {
    const popup = document.getElementById(panelName + 'Popup');
    if (popup) {
        if (panelName === 'status') {
            updateMobileStatus();
        }
        popup.classList.add('active');
        
        if (typeof playSound === 'function') {
            playSound('ui_click', 800, 0.1);
        }
    }
}

function hideMobilePanel(panelName) {
    const popup = document.getElementById(panelName + 'Popup');
    if (popup) {
        popup.classList.remove('active');
    }
}

function updateMobileStatus() {
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
}

// =============================================================================
// MOBILE WEAPON CONTROLS
// =============================================================================

function mobileFireWeapon() {
    if (typeof keys !== 'undefined') {
        keys.space = true;
        setTimeout(() => keys.space = false, 100);
    }
    
    if (typeof playSound === 'function') {
        playSound('weapon', 800, 0.2);
    }
}

function mobileBrakes() {
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
}

function mobileBrakesStart() {
    if (typeof keys !== 'undefined') {
        keys.x = true;
    }
    
    if (typeof playSound === 'function') {
        playSound('ui_click', 600, 0.1);
    }
    
    console.log('📱 Mobile brakes started (holding)');
}

function mobileBrakesEnd() {
    if (typeof keys !== 'undefined') {
        keys.x = false;
    }
    
    console.log('📱 Mobile brakes released');
}

function mobileAutoNavigate() {
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
        hideNavPanel();
    }, 500);
}

function mobileWarpAction() {
    if (typeof executeSlingshot === 'function') {
        executeSlingshot();
    } else {
        if (typeof keys !== 'undefined') {
            keys.Enter = true;
            setTimeout(() => keys.Enter = false, 100);
        }
    }
    
    hideNavPanel();
}

function mobileEmergencyWarp() {
    if (typeof keys !== 'undefined') {
        keys.o = true;
        setTimeout(() => keys.o = false, 100);
    }
    
    if (typeof playSound === 'function') {
        playSound('warp', 400, 0.3);
    }
    
    console.log('📱 Mobile emergency warp triggered');
}

// Mobile fire handler - proper implementation
function handleMobileFire(event) {
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
            fireBtn.style.opacity = '1';
        }, 150);
    }
}

// =============================================================================
// NAVIGATION PANEL MANAGEMENT
// =============================================================================

function showNavPanel() {
    const navPanel = document.getElementById('navPanelMobile');
    if (navPanel) {
        updateMobileNavigation();
        navPanel.classList.add('active');
        
        if (typeof playSound === 'function') {
            playSound('ui_open', 1200, 0.1);
        }
    }
}

function hideNavPanel() {
    const navPanel = document.getElementById('navPanelMobile');
    if (navPanel) {
        navPanel.classList.remove('active');
    }
}

function updateMobileNavigation() {
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
                    hideNavPanel();
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
}

// =============================================================================
// ENHANCED TOUCH CONTROLS - CAMERA LOOK ONLY
// =============================================================================

let touchStartX = 0;
let touchStartY = 0;
let isTouching = false;

document.addEventListener('touchstart', (e) => {
    // Only handle touches on game canvas, not on UI buttons
    if (e.target.closest('.mobile-btn') || 
        e.target.closest('.mobile-controls') ||
        e.target.closest('.mobile-popup') ||
        e.target.closest('.nav-panel-mobile')) {
        return; // Let button handlers work
    }
    
    if (e.target.id === 'gameCanvas' || e.target.closest('#gameContainer')) {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        isTouching = true;
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    // Only handle touches on game canvas, not on UI buttons
    if (e.target.closest('.mobile-btn') || 
        e.target.closest('.mobile-controls') ||
        e.target.closest('.mobile-popup') ||
        e.target.closest('.nav-panel-mobile')) {
        return;
    }
    
    if (isTouching && typeof camera !== 'undefined') {
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        
        // Apply camera rotation
        camera.rotation.y -= deltaX * 0.005;
        camera.rotation.x -= deltaY * 0.005;
        camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
        
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    isTouching = false;
});

// =============================================================================
// SWIPE GESTURE FOR NAVIGATION
// =============================================================================

let swipeStartX = 0;
let isSwipeGesture = false;

document.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const screenWidth = window.innerWidth;
    
    if (touch.clientX > screenWidth - 40) {
        swipeStartX = touch.clientX;
        isSwipeGesture = true;
    }
});

document.addEventListener('touchmove', (e) => {
    if (isSwipeGesture) {
        const touch = e.touches[0];
        const deltaX = swipeStartX - touch.clientX;
        
        if (deltaX > 60) {
            showNavPanel();
            isSwipeGesture = false;
        }
    }
});

document.addEventListener('touchend', () => {
    isSwipeGesture = false;
});

// =============================================================================
// CLOSE PANELS ON OUTSIDE CLICK
// =============================================================================

document.addEventListener('click', (e) => {
    const navPanel = document.getElementById('navPanelMobile');
    if (navPanel && navPanel.classList.contains('active') && !navPanel.contains(e.target)) {
        hideNavPanel();
    }
    
    if (e.target.classList.contains('mobile-popup')) {
        e.target.classList.remove('active');
    }
});

// =============================================================================
// PERIODIC UPDATES
// =============================================================================

setInterval(() => {
    const statusPopup = document.getElementById('statusPopup');
    if (statusPopup && statusPopup.classList.contains('active')) {
        updateMobileStatus();
    }
    
    const navPanel = document.getElementById('navPanelMobile');
    if (navPanel && navPanel.classList.contains('active')) {
        updateMobileNavigation();
    }
    
    // Check for game over
    if (typeof gameState !== 'undefined' && gameState.gameOver) {
        setTimeout(() => {
            const gameOverScreen = document.getElementById('gameOverScreen');
            if (!gameOverScreen && typeof gameOver === 'function') {
                console.log('📱 Creating mobile mission failed screen');
                gameOver('Hull integrity critical - ship destroyed!');
            }
        }, 500);
    }
}, 1000);

// =============================================================================
// SHOW MOBILE CONTROLS AFTER INTRO
// =============================================================================

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
        const mobileControls = document.querySelector('.mobile-controls');
        const navPanelMobile = document.querySelector('.nav-panel-mobile');
        const floatingStatus = document.getElementById('mobileFloatingStatus');
        
        if (mobileControls) {
            mobileControls.style.display = 'flex';
            console.log('📱 Mobile controls now visible');
        }
        if (navPanelMobile) {
            navPanelMobile.style.display = 'block';
        }
        if (floatingStatus) {
            floatingStatus.style.display = 'flex';
            console.log('📱 Mobile floating status now visible');
        } else {
            // If floating status doesn't exist, create it
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

// Hide mobile floating status during intro
function hideMobileFloatingStatusDuringIntro() {
    const floatingStatus = document.getElementById('mobileFloatingStatus');
    if (floatingStatus) {
        floatingStatus.style.display = 'none';
    }
}

// Show mobile floating status after intro
function showMobileFloatingStatusAfterIntro() {
    const floatingStatus = document.getElementById('mobileFloatingStatus');
    if (floatingStatus) {
        floatingStatus.style.display = 'flex';
    }
}

// =============================================================================
// PREVENT ACCIDENTAL BEHAVIORS
// =============================================================================

document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

window.addEventListener('beforeunload', () => {
    if (mobileSettings.forwardThrust) {
        stopForwardThrust();
    }
});

console.log('📱 Mobile controls system loaded successfully');
