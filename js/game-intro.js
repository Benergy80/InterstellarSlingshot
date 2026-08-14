// Game Intro - Cinematic Launch Sequence from Earth
// Adapted for Spherical Universe System
// Creates an immersive first-person launch experience before normal gameplay begins
// FIXED: Proper fade to black and fade in timing, cyberpunk mission command text

// =============================================================================
// INTRO SEQUENCE STATE MANAGEMENT
// =============================================================================

const introSequence = {
    active: false,
    phase: 'start', // 'start', 'surface', 'countdown', 'launch', 'transition', 'complete'
    startTime: 0,
    phaseStartTime: 0,
    duration: {
        start: Infinity,    // Wait for player input
        surface: 3000,      // 3 seconds to show Earth surface
        countdown: 10000,   // 10 second countdown
        launch: 12000,      // 12 seconds of launch acceleration (no fade during this phase)
        transition: 10000   // 10 seconds for fade transitions (all fade logic happens here)
    },
    
    // Visual elements
    skyDome: null,
    cloudLayers: [],
    exhaustParticles: [],
    atmosphereGlow: null,
    fadeOverlay: null,
    startButton: null,
    
    // Animation state
    cameraOriginal: { position: null, rotation: null },
    cameraTarget: { position: null, rotation: null },
    shakeIntensity: 0,
    gameSetupStarted: false,
    orbitsCreated: false,
    tutorialStarted: false,
    asteroidsCleanedUp: false,
    
    // UI state
    countdownValue: 10,
    skipButton: null,
    
    // Audio state
    countdownAudio: null,
    launched: false,
    startKeyHandler: null
};

// One-time intro system
const introPlayedKey = 'interstellarSlingshot_introPlayed';

function hasIntroBeenPlayed() {
    // TEMPORARILY DISABLED - always show intro for testing
    return false;
    
    /*
    try {
        return localStorage.getItem(introPlayedKey) === 'true';
    } catch (e) {
        return false; // If localStorage not available, always show intro
    }
    */
}

function markIntroAsPlayed() {
    try {
        localStorage.setItem(introPlayedKey, 'true');
        console.log('🏁 Intro marked as played');
    } catch (e) {
        console.warn('Could not save intro played state');
    }
}

function resetIntroState() {
    try {
        localStorage.removeItem(introPlayedKey);
        console.log('🔄 Intro state reset - will play again on next load');
    } catch (e) {
        console.warn('Could not reset intro state');
    }
}

// =============================================================================
// INTRO SEQUENCE INITIALIZATION
// =============================================================================

function startGameWithIntro() {
    console.log('🚀 Starting game with cinematic intro sequence...');
    
    try {
        // Check if this is a restart (mission restart bypasses intro)
        const isRestart = sessionStorage.getItem('gameRestart') === 'true';
        
        // Check if intro has already been played OR if this is a restart
        if (hasIntroBeenPlayed() || isRestart) {
            if (isRestart) {
                console.log('🔄 Game restart detected, skipping intro');
                sessionStorage.removeItem('gameRestart'); // Clear restart flag
            } else {
                console.log('⏭️ Intro already played, starting normal game');
            }
            
            // Show loading screen briefly, then start normal game
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.style.display = 'flex';
                startLoadingAnimation(); // Show loading animation
            }
            
            // Initialize minimal Three.js during loading
            setTimeout(() => {
                initializeMinimalThreeJS();
                
                // Fade loading screen to black instead of hiding abruptly
                if (loadingScreen) {
                    loadingScreen.style.transition = 'opacity 1s ease-out';
                    loadingScreen.style.opacity = '0';
                    
                    // Remove loading screen after fade completes
                    setTimeout(() => {
                        loadingScreen.style.display = 'none';
                        
                        // Start controlled fade-in sequence
                        startControlledFadeSequence();
                    }, 1000);
                } else {
                    startControlledFadeSequence();
                }
            }, 3000); // 3 second loading delay (FAST)
            return;
        }
        
        // Show loading screen for 3 seconds first
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
            console.log('Loading screen shown for 3 seconds (FAST mode)');
        }

        // ADD THIS LINE HERE - Start loading animation immediately
        startLoadingAnimation();
        
        // Setup intro content BEFORE Three.js init
        setupIntroContentFirst();
        
        // Initialize Three.js during loading
        setTimeout(() => {
            initializeThreeJSForIntro();
            
            // Fade loading screen to black instead of hiding abruptly
            if (loadingScreen) {
                loadingScreen.style.transition = 'opacity 1s ease-out';
                loadingScreen.style.opacity = '0';
                
                // Remove loading screen after fade completes
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                    
                    // Start controlled fade-in sequence
                    startControlledFadeSequence();
                }, 1000);
            } else {
                startControlledFadeSequence();
            }
        }, 3000); // 3 second loading delay (FAST) - CHANGED FROM 6000
        
    } catch (error) {
        console.error('❌ Error starting intro sequence:', error);
        // Don't start normal game during intro - just show loading and retry
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen && loadingScreen.style.display === 'none') {
            loadingScreen.style.display = 'flex';
            setTimeout(() => {
                if (typeof startGame === 'function') {
                    startGame();
                }
            }, 1000);
        }
    }
}

function initializeThreeJSForIntro() {
    // Initialize basic Three.js components
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 250000);

    // Store camera reference for player model attachment
    window.gameCamera = camera;

    if (typeof window.__isMobileGPU === 'undefined') {
        window.__isMobileGPU = (window.innerWidth <= 768) ||
            ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    }
    renderer = new THREE.WebGLRenderer({
        antialias: !window.__isMobileGPU,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.__isMobileGPU ? 1 : 1.5));

    // Keep background black - no automatic fade
    renderer.setClearColor(0x000000);
    
    const gameContainer = document.getElementById('gameContainer');
    if (!gameContainer) {
        throw new Error('Game container not found');
    }
    
    gameContainer.appendChild(renderer.domElement);
    renderer.domElement.id = 'gameCanvas';
    renderer.domElement.style.cursor = 'auto';
    
    // Initialize global arrays if they don't exist
    if (typeof planets === 'undefined') window.planets = [];
    if (typeof activePlanets === 'undefined') window.activePlanets = [];
    if (typeof enemies === 'undefined') window.enemies = [];
    if (typeof wormholes === 'undefined') window.wormholes = [];
    if (typeof comets === 'undefined') window.comets = [];
    if (typeof cameraRotation === 'undefined') window.cameraRotation = { x: 0, y: 0, z: 0 };
    
    // Initialize basic gameState for intro if it doesn't exist
    if (typeof gameState === 'undefined') {
        window.gameState = {
            velocity: 0,
            distance: 0,
            energy: 100,
            hull: 100,
            maxHull: 100,
            location: 'Earth Surface - Launch Pad',
            gameStarted: false,
            gameOver: false,
            emergencyWarp: { available: 5 },
            weapons: { armed: true },
            currentTarget: null,
            targetLock: { active: false, target: null },
            velocityVector: new THREE.Vector3(0, 0, 0)
        };
    } else {
        // Update existing gameState for intro
        gameState.gameStarted = false;
        gameState.location = 'Earth Surface - Launch Pad';
        if (!gameState.velocityVector) {
            gameState.velocityVector = new THREE.Vector3(0, 0, 0);
        }
    }
    
    // Add basic lighting for intro
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(0, 1000, 500);
    scene.add(sunLight);
    
    console.log('Three.js initialized for intro sequence');
    
    // Create Earth atmosphere immediately after Three.js init
    createEarthAtmosphere();
    setupEarthSurfaceView();
    window.atmosphereCreated = true;
    console.log('🌤️ Earth atmosphere created (will be revealed during fade)');

    // The launch-pad sky is built and kept for the launch sequence, but the
    // PRE-LAUNCH menu now sits in front of the hero vista instead of it.
    buildIntroVista();
    
    // IMMEDIATELY create black overlay to prevent flash
    const blackOverlay = document.createElement('div');
    blackOverlay.id = 'atmosphereFadeOverlay';
    blackOverlay.className = 'absolute inset-0 bg-black pointer-events-none';
    blackOverlay.style.opacity = '1';
    blackOverlay.style.zIndex = '30'; // Above scene, below UI
    document.body.appendChild(blackOverlay);

    console.log('⚫ Black overlay created immediately to prevent flash');

    // Initialize camera system with player ship
    console.log('========================================');
    console.log('🎥 CAMERA SYSTEM INITIALIZATION (INTRO MODE)');
    console.log('========================================');
    console.log('  - Camera ready:', !!window.gameCamera);
    console.log('  - Scene ready:', !!scene);
    console.log('  - initCameraSystem function available:', typeof initCameraSystem);

    if (typeof initCameraSystem === 'function' && window.gameCamera && scene) {
        console.log('✅ Calling initCameraSystem...');
        initCameraSystem(window.gameCamera, scene);
        console.log('✅ Camera system initialized in intro mode');
    } else {
        console.warn('⚠️ Camera system initialization deferred - will retry after models load');
    }
}

function initializeMinimalThreeJS() {
    // Initialize basic Three.js components for intro-skipped version
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 250000);

    // Store camera reference for player model attachment
    window.gameCamera = camera;

    if (typeof window.__isMobileGPU === 'undefined') {
        window.__isMobileGPU = (window.innerWidth <= 768) ||
            ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    }
    renderer = new THREE.WebGLRenderer({
        antialias: !window.__isMobileGPU,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.__isMobileGPU ? 1 : 1.5));
    renderer.setClearColor(0x000003); // dark blue not black
    
    const gameContainer = document.getElementById('gameContainer');
    if (!gameContainer) {
        throw new Error('Game container not found');
    }
    
    gameContainer.appendChild(renderer.domElement);
    renderer.domElement.id = 'gameCanvas';
    renderer.domElement.style.cursor = 'auto'; // Ensure no crosshair
    
    // Initialize minimal gameState for intro
    if (typeof gameState === 'undefined') {
        window.gameState = {
            velocity: 0,
            distance: 0,
            energy: 100,
            hull: 100,
            maxHull: 100,
            location: 'Earth Surface - Launch Pad',
            gameStarted: false,
            gameOver: false,
            emergencyWarp: { available: 5 },
            weapons: { armed: true },
            currentTarget: null,
            targetLock: { active: false, target: null },
            velocityVector: new THREE.Vector3(0, 0, 0)
        };
    } else {
        // Update existing gameState for intro
        gameState.gameStarted = false;
        gameState.location = 'Earth Surface - Launch Pad';
        if (!gameState.velocityVector) {
            gameState.velocityVector = new THREE.Vector3(0, 0, 0);
        }
    }

    console.log('Minimal Three.js initialized for intro sequence');

    // Initialize camera system with player ship
    console.log('========================================');
    console.log('🎥 CAMERA SYSTEM INITIALIZATION (MINIMAL/SKIP INTRO MODE)');
    console.log('========================================');
    console.log('  - Camera ready:', !!window.gameCamera);
    console.log('  - Scene ready:', !!scene);
    console.log('  - initCameraSystem function available:', typeof initCameraSystem);

    if (typeof initCameraSystem === 'function' && window.gameCamera && scene) {
        console.log('✅ Calling initCameraSystem...');
        initCameraSystem(window.gameCamera, scene);
        console.log('✅ Camera system initialized in minimal mode');
    } else {
        console.warn('⚠️ Camera system initialization deferred - will retry after models load');
    }
}

// =============================================================================
// LOADING ANIMATION AND CONTROLLED FADE SEQUENCE
// =============================================================================

function startLoadingAnimation() {
    let progress = 0;
    const loadingTexts = [
        "Starting flight systems...",
        "Loading cosmic data...", 
        "Scanning galaxy coordinates...",
        "Calculating orbital mechanics...",
        "Calibrating navigation sensors...",
        "Initializing gravitational assist systems...",
        "Preparing 3D environment...",
        "Loading cyber weapon systems...",
        "Optimizing neural interface...",
        "Setting up synth audio...",
        "Synchronizing quantum drives...",
        "Ready for launch!"
    ];
    
    const interval = setInterval(() => {
        progress += 1.5 + Math.random() * 2.0; // FAST - takes ~3 seconds
        progress = Math.min(progress, 100);
        
        const loadingBar = document.getElementById('loadingBar');
        const loadingText = document.getElementById('loadingText');
        
        if (loadingBar) {
            loadingBar.style.width = progress + '%';
        }
        
        // Update loading text based on progress
        const textIndex = Math.floor(progress / 8.3); // 12 messages over 100% progress
        if (loadingText && textIndex < loadingTexts.length) {
            loadingText.textContent = loadingTexts[textIndex];
            console.log(`📊 Loading: ${progress.toFixed(0)}% - ${loadingTexts[textIndex]}`);
        }
        
        if (progress >= 100) {
            clearInterval(interval);
            if (loadingText) {
                loadingText.textContent = "Ready for launch!";
            }
            console.log('🚀 Loading animation completed in ~3 seconds');
        }
    }, 60); // Update every 60ms - fast updates
    
    console.log('🚀 Loading bar animation started with FAST progress');
}

function startIntroSequence() {
    // This function now only handles the post-fade intro logic
    // Visual setup is handled by the controlled fade sequence
    console.log('🎬 Intro sequence - post-fade setup');
}

function startControlledFadeSequence() {
    console.log('🎬 Starting controlled fade-in sequence...');
    // NEW TIMELINE (FAST mode):
    // T+0.0s: Loading starts (3 seconds)
    // T+3.0s: Loading complete, screen fades to black (1 second)
    // T+4.0s: Black screen, intro initializes
    // T+4.5s: Background starts fading from black to sky (2.5 seconds)
    // T+5.6s: Buttons appear (1 second after sky starts fading)
    // T+7.0s: Sky fully revealed, ready for player input
    
    // Initialize intro with UI already visible (faded in during loading)
    initializeIntroWithVisibleUI();
    
    // Set renderer background to black initially
    renderer.setClearColor(0x000000);
    
    // Wait 0.5 seconds after loading screen disappears, then start background fade
    setTimeout(() => {
        console.log('🌅 Starting background fade 0.5s after loading screen disappeared...');

        // ORDER MATTERS. revealIntroScene() calls animateIntroSequence()
        // synchronously, and that first frame is where every shader in the
        // scene compiles and every texture uploads — measured at 1.3 s on the
        // bare launch-pad sky and 2.8 s with the hero vista. Arming the
        // overlay-fade and button timers BEFORE that stall (instead of after
        // it) means PRESS TO LAUNCH lands with the first drawn frame rather
        // than 1.1 s behind it; on the reference box it pulled the button in
        // from 11.1 s to 9.6 s. Nothing else about the sequence changes.
        startBackgroundColorFade();

        // Enable scene visuals now (they fade up behind the black overlay)
        revealIntroScene();

        // Buttons will now show automatically when sky transition completes
        // No additional delay needed
        console.log('✨ Fade sequence initiated, buttons will appear when sky transition finishes');
        
    }, 500); // T+0.5 seconds: Background fade starts 0.5s after loading screen disappears (total elapsed: 4.5s from start)
}

function setupIntroContentFirst() {
    console.log('📋 Setting up intro content before Three.js...');
    
    // Hide crosshair immediately
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.display = 'none';
        crosshair.style.opacity = '0';
        crosshair.style.visibility = 'hidden';
    }
    
    // HIDE all UI panels during loading (including title)
    const allUIPanels = document.querySelectorAll('.ui-panel');
    allUIPanels.forEach(panel => {
        panel.style.display = 'none';
        panel.style.opacity = '0';
        panel.style.visibility = 'hidden';
        // Clear any existing transitions to prevent conflicts
        panel.style.transition = 'none';
    });
    
    // Update status panels BEFORE Three.js initialization
    updateIntroStatusPanels();
    hideNonIntroElements();
    createCountdownOverlay();
    
    // Fade in ALL UI elements with IDENTICAL timing after 1 second
    setTimeout(() => {
        console.log('📋 Fading in ALL UI elements with identical timing...');
        
        allUIPanels.forEach(panel => {
            // Set identical transition for ALL panels
            panel.style.transition = 'opacity 1s ease-in-out';
            panel.style.display = 'block';
            panel.style.visibility = 'visible';
            
            // Use setTimeout to ensure transition applies after display change
            setTimeout(() => {
                panel.style.opacity = '1';
            }, 10);
            
            // Set z-index after visibility
            if (panel.classList.contains('title-header')) {
                panel.style.zIndex = '600';
            } else {
                panel.style.zIndex = '600';
            }
        });
    }, 1000);
    
    console.log('📋 Intro content setup complete, ready for Three.js init');
}

function ensureBasicUIPanelsExist() {
    // Make sure basic UI elements exist before updating them
    if (!document.getElementById('velocity')) {
        console.log('📋 Creating basic UI panels for intro');
        // Trigger basic UI creation if it doesn't exist
        if (typeof createBasicUI === 'function') {
            createBasicUI();
        }
    }
}

function startBackgroundColorFade() {
    console.log('🎨 Starting black overlay fade to reveal atmosphere');
    
    // Find the existing black overlay (created during Three.js init)
    const blackOverlay = document.getElementById('atmosphereFadeOverlay');
    
    if (!blackOverlay) {
        console.error('Black overlay not found - was it created during init?');
        return;
    }
    
    // Fade the black overlay to transparent over 2.5 seconds
    setTimeout(() => {
        blackOverlay.style.transition = 'opacity 2.5s ease-out';
        blackOverlay.style.opacity = '0';
        
        // Remove overlay after fade completes
        setTimeout(() => {
            blackOverlay.remove();
            console.log('🎨 Black overlay fade complete - atmosphere revealed');
        }, 2500);
    }, 100); // Small delay to ensure transition is applied
    
    // ADD THIS: Show buttons 1 second after sky transition starts
    setTimeout(() => {
        showStartButton();
        console.log('🚀 Buttons fading in 1 second after sky transition started');
    }, 1100); // 100ms (initial delay) + 1000ms = 1.1 seconds after sky transition starts
}

function initializeIntroWithVisibleUI() {
    // Initialize intro sequence but keep scene black initially
    introSequence.active = true;
    introSequence.phase = 'start';
    introSequence.startTime = Date.now();
    introSequence.phaseStartTime = Date.now();
    
    // Set up camera positioning
    setupEarthSurfaceView();
    
    // Set up UI panels with intro content and keep them visible
    setupIntroUIContent();
    
    // Create skip button but hide it initially
    createSkipButton();
    if (introSequence.skipButton) {
        introSequence.skipButton.style.opacity = '0';
    }
    
    // Make mouse cursor visible everywhere during intro
    document.body.classList.add('intro-active');
    document.body.style.cursor = 'auto !important';
    
    console.log('🎬 Intro initialized with black scene and VISIBLE UI');
}

function setupIntroUIContent() {
    // FIRST: Force hide crosshairs immediately and permanently
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.display = 'none';
        crosshair.style.opacity = '0';
        crosshair.style.visibility = 'hidden';
    }
    
    // SECOND: Set up intro UI content 
    updateIntroStatusPanels();
    hideNonIntroElements();
    createCountdownOverlay();
    
    // THIRD: Ensure ALL UI panels (including title) are visible at SAME TIME
    const allUIPanels = document.querySelectorAll('.ui-panel'); // Includes title-header
    allUIPanels.forEach(panel => {
        panel.style.display = 'block';
        panel.style.visibility = 'visible';
        panel.style.opacity = '1'; // Same timing for ALL panels
        
        // Preserve z-index hierarchy
        if (panel.classList.contains('title-header')) {
            panel.style.zIndex = '600';
        } else {
            panel.style.zIndex = '600';
        }
    });
    
    console.log(`📋 Intro UI content setup complete: ${allUIPanels.length} panels visible simultaneously`);
}

function setupIntroUIWithoutShowing() {
    // FIRST: Force hide crosshairs immediately and permanently
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.display = 'none';
        crosshair.style.opacity = '0';
        crosshair.style.visibility = 'hidden';
    }
    
    // SECOND: Set up intro UI content BEFORE hiding panels
    updateIntroStatusPanels(); // This sets intro-specific content
    hideNonIntroElements();
    createCountdownOverlay();
    
    // THIRD: Hide all UI panels initially for controlled fade-in
    const uiPanels = document.querySelectorAll('.ui-panel');
    uiPanels.forEach(panel => {
        panel.style.opacity = '0';
        panel.style.display = 'block'; // Ensure they exist in DOM
        panel.style.visibility = 'visible'; // But make sure they're not hidden
    });
    
    console.log('📋 Intro UI setup complete but hidden for fade-in');
}

function revealIntroScene() {
    // DON'T hide atmosphere - let it exist normally
    // The black overlay will handle the reveal
    
    // Make mouse cursor visible everywhere during intro
    document.body.classList.add('intro-active');
    document.body.style.cursor = 'auto !important';
    
    // Hide crosshair during intro
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.display = 'none';
    }
    
    // Start intro animation loop
    animateIntroSequence();
    
    console.log('🌅 Intro scene revealed with persistent UI');
}

function showStartButton() {
    // Create and show the start button with fade-in
    createStartButton();
    createDemoButton();

    // Fade in start button
    if (introSequence.startButton) {
        introSequence.startButton.style.opacity = '0';
        introSequence.startButton.style.transition = 'opacity 1s ease-in-out';

        // Trigger fade-in after a brief delay
        setTimeout(() => {
            if (introSequence.startButton) introSequence.startButton.style.opacity = '1';
        }, 100);
    }

    // Fade in demo button
    if (introSequence.demoButton) {
        introSequence.demoButton.style.opacity = '0';
        introSequence.demoButton.style.transition = 'opacity 1s ease-in-out';
        setTimeout(() => {
            if (introSequence.demoButton) introSequence.demoButton.style.opacity = '1';
        }, 300);
    }

    // Fade in skip button
    if (introSequence.skipButton) {
        introSequence.skipButton.style.transition = 'opacity 1s ease-in-out';
        introSequence.skipButton.style.opacity = '0.7';
    }

    console.log('🚀 Start button, demo button, and skip button faded in');
}

function createDemoButton() {
    const demoButton = document.createElement('button');
    demoButton.id = 'introDemoBtn';
    // Mobile: place at the TOP of the launch screen so it doesn't overlap
    // the main PRESS TO LAUNCH button in the middle of the view.
    // Desktop: keep just below the main launch button as before.
    const isMobile = window.innerWidth <= 768 ||
                     ('ontouchstart' in window && window.innerWidth <= 1024);
    const topPos = isMobile ? 'top: 70px' : 'top: calc(50% + 110px)';
    demoButton.style.cssText = `
        position: fixed;
        ${topPos};
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        background: linear-gradient(135deg, rgba(0,100,255,0.2), rgba(0,50,200,0.3));
        border: 2px solid rgba(0,150,255,0.7);
        border-radius: 12px;
        padding: 12px 32px;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 0 20px rgba(0,150,255,0.4), inset 0 0 15px rgba(0,150,255,0.1);
        font-family: 'Orbitron', monospace;
    `;
    demoButton.innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:0.95rem;font-weight:bold;color:#ffe066;
                        text-shadow:0 0 8px rgba(255,224,102,1),
                                    0 0 16px rgba(255,200,40,0.9),
                                    0 0 28px rgba(255,180,0,0.7);
                        letter-spacing:3px;">
                DEMO MODE
            </div>
            <div style="font-size:0.7rem;margin-top:3px;letter-spacing:1px;
                        color:#fff1a8;
                        text-shadow:0 0 6px rgba(255,224,102,0.9),
                                    0 0 12px rgba(255,200,40,0.6);">
                AUTOPILOT SHOWCASE
            </div>
        </div>
    `;

    demoButton.addEventListener('mouseenter', () => {
        demoButton.style.background = 'linear-gradient(135deg, rgba(0,150,255,0.35), rgba(0,100,200,0.4))';
        demoButton.style.boxShadow = '0 0 30px rgba(0,150,255,0.7), inset 0 0 20px rgba(0,150,255,0.2)';
        demoButton.style.transform = 'translateX(-50%) scale(1.05)';
    });
    demoButton.addEventListener('mouseleave', () => {
        demoButton.style.background = 'linear-gradient(135deg, rgba(0,100,255,0.2), rgba(0,50,200,0.3))';
        demoButton.style.boxShadow = '0 0 20px rgba(0,150,255,0.4), inset 0 0 15px rgba(0,150,255,0.1)';
        demoButton.style.transform = 'translateX(-50%) scale(1)';
    });

    demoButton.addEventListener('click', () => {
        window.demoModeRequested = true;
        console.log('🤖 Demo mode requested — skipping intro');

        // Suppress Intro.mp3 and jump straight to the starting gameplay
        // track so the demo begins with the Sol System theme, not the
        // intro cinematic score.
        if (typeof soundtrack !== 'undefined') {
            soundtrack.setSuppressIntro(true);
            soundtrack.forceTrack('galaxy7');  // Sol System / Local Group
        }

        // Hide both buttons immediately
        if (introSequence.startButton) {
            introSequence.startButton.style.opacity = '0';
            setTimeout(() => { if (introSequence.startButton) { introSequence.startButton.remove(); introSequence.startButton = null; } }, 500);
        }
        demoButton.style.opacity = '0';
        setTimeout(() => demoButton.remove(), 500);
        // Skip intro and go straight to game
        if (typeof skipIntroSequence === 'function') {
            skipIntroSequence();
        }
    });

    document.body.appendChild(demoButton);
    introSequence.demoButton = demoButton;
}

// =============================================================================
// EARTH SURFACE AND ATMOSPHERE CREATION
// =============================================================================

function setupEarthSurfaceView() {
    // Position camera on Earth's surface (slightly above ground)
    camera.position.set(0, 10, 0);
    
    // Look up at the sky at a slight angle
    camera.rotation.set(-Math.PI * 0.3, 0, 0); // 54 degrees up
    
    // Store original position for later restoration
    introSequence.cameraOriginal.position = camera.position.clone();
    introSequence.cameraOriginal.rotation = { 
        x: camera.rotation.x, 
        y: camera.rotation.y, 
        z: camera.rotation.z 
    };
    
    // Set target position in space for launch sequence
    introSequence.cameraTarget.position = new THREE.Vector3(0, 50000, 0);
    introSequence.cameraTarget.rotation = { x: 0, y: 0, z: 0 };
}
// =============================================================================
// PRE-LAUNCH HERO VISTA
// -----------------------------------------------------------------------------
// The launch screen used to be a flat pale-blue sky dome — no sun, no planet,
// no stars, a frame with almost no luminance variance in it — and the frame the
// game is actually FOR (huge Sol disc + corona, a world hanging beside it,
// nebula behind) only ever appeared by accident, once the attract flythrough
// happened to aim at the star. This module makes that frame the BOOT frame.
//
// Deliberately self-contained: one THREE.Group, a painted equirect sky, and the
// game's own addStarCorona() / createPlanetPresenceMaterial() for the star and
// the worlds — so the vista is the same art gameplay uses, at the same scale,
// without registering a single object into planets[] / activePlanets[] and
// without touching any celestial size. Nothing here consumes scene lights, so
// the intro's ambient/directional rig is left exactly as it was.
//
// Framing is done in SCREEN SPACE, not by hand-placed world coordinates: the
// camera is solved so the star lands at a chosen fraction of the frame and the
// hero world is then placed to land at another. That keeps the composition — and
// the menu's clear centre column — identical on any aspect ratio.
//
// PRESS TO LAUNCH cuts back to the launch-pad camera behind a short veil, which
// is the only thing the launch path sees change: countdown still starts from
// camera (0,10,0) under the sky dome, so countdown → launch → transition, plus
// skip and demo, all run exactly as before.
// =============================================================================

const introVista = {
    active: false,
    group: null,
    backdrop: null,
    sun: null,
    planet: null,
    farPlanet: null,
    t0: 0,
    hidden: []          // intro sky objects we hid; restored on the cut
};

// Sol's real coordinate, so anything reasoning about window.localSystemOffset
// agrees with what is on screen.
const IV_SUN = { x: 8000, y: 0, z: 4800 };
const IV_SUN_R = 80;              // identical to the gameplay Sol radius
const IV_CAM_DIST = 340;          // 4.25 solar radii — the star fills the frame
const IV_CAM_DIR = { x: 0.02, y: 0.16, z: 0.987 };   // where the camera sits, from Sol

// Screen fractions of the half-frame. x: -1 = left edge, +1 = right edge.
// y: positive = BELOW centre. The star is pushed down-left and the hero world
// out to the right on purpose, so the middle column — PRESS TO LAUNCH / DEMO
// MODE / Skip Intro — stays over quiet space.
const IV_SUN_FX = -0.46, IV_SUN_FY = 0.16;
const IV_PLANET_FX = 0.46, IV_PLANET_FY = -0.02;
const IV_PLANET_DIST = 330, IV_PLANET_R = 104;
const IV_FAR_FX = -0.88, IV_FAR_FY = -0.52;
const IV_FAR_DIST = 1500, IV_FAR_R = 150;

// Drift is an OSCILLATION, not a one-way orbit: the vista breathes but never
// wanders off its mark, so every boot shows the same frame at the same second.
const IV_DRIFT_DEG = 3.2;         // +/- yaw about Sol
const IV_DRIFT_HZ = 0.055;

// ---------------------------------------------------------------------------
// Painted deep-space sky. A shader doing 5-octave 3D noise over a full frame
// cost ~2.5 s of compile+first-draw on boot — measured, and it pushed the menu
// buttons from t=5.6 s out to t=10.5 s. A canvas painted once is free.
// ---------------------------------------------------------------------------
function _ivSkyTexture() {
    // 2048x1024, not 1024x512. This canvas is stretched over a 60000u shell that
    // fills the frame, so texture resolution IS screen resolution here: at
    // 1024x512 one texel magnified to ~4.7 screen px and the bilinear seams
    // between them read as a visible mesh over the whole sky (measured: a
    // regular 7.5 px / 16 px lattice, 6.4 LSB peak-to-peak, edge to edge).
    // Doubling drops the texel to ~2.4 px; the grain pass at the bottom of this
    // function kills what is left of the lattice.
    const W = 2048, H = 1024;
    // The gas itself is computed at half that. Nebula has no detail worth 2M
    // pixels, and the two things that DO need the full resolution — the stars
    // and the grain — are painted at 2048 afterwards.
    const NW = 1024, NH = 512;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');

    // Deterministic: same sky on every boot. Three independent streams, so that
    // retuning the gas does not reshuffle the star field or the composition.
    const mkRnd = (s0) => { let s = s0; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; };
    const rnd = mkRnd(20260814);    // stars, grain
    const rMask = mkRnd(6180339);   // composition
    const rNoise = mkRnd(2718281);  // the noise fields

    // ---- screen -> canvas ---------------------------------------------------
    // The shell is an equirectangular sphere centred on Sol with no rotation, so
    // a direction d lands at canvas (W*atan2(dz,-dx)/2pi, H*acos(dy)/pi) — that
    // is exactly SphereGeometry's uv through a flipY CanvasTexture. Knowing the
    // mapping means the nebula can be COMPOSED against the star and the worlds
    // rather than scattered and hoped for: mass where the frame is empty, dust
    // down the column where PRESS TO LAUNCH sits. (fx: -1 = left edge, +1 =
    // right; fy: + = below centre — the convention IV_SUN_FX/IV_PLANET_FX use.)
    let toCanvas = null, SPX = 0.38;
    try {
        const pose = ivCameraPose(0);
        const SC = new THREE.Vector3(IV_SUN.x, IV_SUN.y, IV_SUN.z);
        toCanvas = (fx, fy) => {
            const d = ivPlaceAt(pose, fx, fy, 60000).sub(SC).normalize();
            let u = Math.atan2(d.z, -d.x) / (Math.PI * 2);
            u -= Math.floor(u);
            return { x: u * W, y: (Math.acos(Math.max(-1, Math.min(1, d.y))) / Math.PI) * H };
        };
        const a = toCanvas(-0.25, 0), b = toCanvas(0.25, 0);
        let dx = Math.abs(b.x - a.x); if (dx > W / 2) dx = W - dx;
        SPX = dx / (0.25 * (window.innerWidth || 1600));
        if (!(SPX > 0.05 && SPX < 4)) SPX = 0.38;
    } catch (e) { toCanvas = null; }
    // If the framing solver is unavailable the sky still gets painted — it just
    // stops being aimed. Never fall back to the flat launch-pad dome.
    const at = (fx, fy) => (toCanvas ? toCanvas(fx, fy)
                                     : { x: (0.5 + fx * 0.15) * W, y: (0.42 + fy * 0.22) * H });
    const px = (screenPx) => screenPx * SPX;

    // ---- value noise --------------------------------------------------------
    // Wraps in x (the sphere seam is at u=0), clamps in y.
    const grid = (w, h) => {
        const a = new Float32Array(w * h);
        for (let i = 0; i < a.length; i++) a[i] = rNoise();
        return { w: w, h: h, a: a };
    };
    const smp = (q, x, y) => {
        const fx = x * q.w, fy = y * q.h;
        let x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const x1 = (((x0 + 1) % q.w) + q.w) % q.w; x0 = ((x0 % q.w) + q.w) % q.w;
        let y1 = y0 + 1;
        if (y0 < 0) y0 = 0; else if (y0 > q.h - 1) y0 = q.h - 1;
        if (y1 < 0) y1 = 0; else if (y1 > q.h - 1) y1 = q.h - 1;
        const r0 = y0 * q.w, r1 = y1 * q.w;
        const u = q.a[r0 + x0] + (q.a[r0 + x1] - q.a[r0 + x0]) * sx;
        const v = q.a[r1 + x0] + (q.a[r1 + x1] - q.a[r1 + x0]) * sx;
        return u + (v - u) * sy;
    };
    const stack = (n, w0) => { const s = []; for (let i = 0; i < n; i++) s.push(grid(w0 << i, Math.max(2, (w0 << i) >> 1))); return s; };
    const fbm = (s, x, y, oct, ridged) => {
        let sum = 0, amp = 1, norm = 0;
        for (let i = 0; i < oct; i++) {
            let n = smp(s[i], x, y);
            if (ridged) { n = 1 - Math.abs(n * 2 - 1); n *= n; }
            sum += n * amp; norm += amp; amp *= 0.55;
        }
        return sum / norm;
    };
    const S_DENS = stack(4, 14);   // 14..112 cells: clumping inside the mass
    const S_DET  = stack(6, 24);   // 24..768 cells: filaments
    const S_DUST = stack(5, 16);   // 16..256 cells: the lanes that cut them
    const S_HUE  = stack(4, 5);    //  4..16  cells: slow colour drift

    // ---- composition mask ---------------------------------------------------
    // Painted, not noised, because this is the art direction: a band of gas
    // sweeping across the TOP of the frame between the star and the hero world,
    // a second body draping down the right, and a hole punched down the middle
    // column where the menu lives. The old sky had 20 blobs scattered at 3-8%
    // alpha over near-black and measured std 7.4 on a pure-sky patch against
    // the reference art's 36.3 — it wasn't a nebula, it was a tint.
    const MW = 256, MH = 128;
    const mcv = document.createElement('canvas');
    mcv.width = MW; mcv.height = MH;
    const mg = mcv.getContext('2d');
    mg.fillStyle = '#000'; mg.fillRect(0, 0, MW, MH);
    const mblob = (cx, cy, r, a, aspect, rot, op) => {
        const x = cx * MW / W, y = cy * MH / H, rr = Math.max(1, r * MW / W);
        // An erase has to actually erase: a soft gradient at 45% of its radius
        // only removes half the gas, and half of a bright filament is still a
        // bright filament under the button. Additive masses stay soft.
        const cut = (op === 'destination-out');
        for (let k = -1; k <= 1; k++) {
            mg.save();
            mg.globalCompositeOperation = op || 'lighter';
            mg.translate(x + k * MW, y);
            if (rot) mg.rotate(rot);
            if (aspect && aspect !== 1) mg.scale(1, aspect);
            const grd = mg.createRadialGradient(0, 0, 0, 0, 0, rr);
            grd.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
            grd.addColorStop(cut ? 0.62 : 0.45, 'rgba(255,255,255,' + (a * (cut ? 0.94 : 0.55)).toFixed(3) + ')');
            if (cut) grd.addColorStop(0.85, 'rgba(255,255,255,' + (a * 0.42).toFixed(3) + ')');
            grd.addColorStop(1, 'rgba(255,255,255,0)');
            mg.fillStyle = grd;
            mg.fillRect(-rr, -rr, rr * 2, rr * 2);
            mg.restore();
        }
    };
    // the band, plus the right-hand drape and a left-hand shoulder
    [[-1.75, -0.98, 520, 0.40], [-1.30, -0.86, 520, 0.44], [-0.86, -0.76, 540, 0.50],
     [-0.42, -0.70, 540, 0.56], [ 0.02, -0.68, 540, 0.60], [ 0.46, -0.73, 520, 0.62],
     [ 0.90, -0.82, 520, 0.60], [ 1.34, -0.92, 520, 0.56], [ 1.75, -1.02, 500, 0.48],
     [ 0.62, -0.62, 380, 0.50], [ 1.00, -0.56, 360, 0.44],
     [ 1.62,  0.02, 520, 0.40], [ 1.80,  0.60, 520, 0.32],
     [-1.85, -0.20, 480, 0.34], [-1.70,  0.55, 460, 0.26],
     [-1.25,  0.92, 440, 0.30], [ 1.30,  1.00, 440, 0.28]
    ].forEach((b) => { const p = at(b[0], b[1]); mblob(p.x, p.y, px(b[2]), b[3], 0.55, 0.12); });
    // knots of denser gas inside the band, so it is not a smooth ramp
    for (let i = 0; i < 26; i++) {
        const p = at(-1.9 + rMask() * 3.6, -1.15 + rMask() * 0.75);
        mblob(p.x, p.y, px(150 + rMask() * 260), 0.16 + rMask() * 0.22, 0.4 + rMask() * 0.5, rMask() * 3.14);
    }
    // the rest of the sphere — 250 degrees the camera never looks at, kept lit
    // so nothing goes black if the drift is ever widened
    for (let i = 0; i < 14; i++) {
        mblob(rMask() * W, 0.18 * H + rMask() * 0.64 * H, px(300 + rMask() * 400),
              0.12 + rMask() * 0.16, 0.4 + rMask() * 0.5, rMask() * 3.14);
    }
    // and the hole: PRESS TO LAUNCH / DEMO MODE / Skip Intro sit in the middle
    // column, so the gas is erased there. White text over a mean sky luminance
    // under ~55/255 stays legible; this is what keeps it there while the rest
    // of the frame gets brighter, not dimmer.
    // Wide and shallow on purpose: the hole has to clear the buttons (frame
    // rows 400-890) without eating the gas above them (rows 130-340), so the
    // erase is an ellipse ~3x wider than it is tall.
    [[-0.06, 0.08, 430, 0.34], [-0.02, 0.42, 440, 0.34], [0.02, 0.78, 450, 0.34],
     [0.00, 1.14, 470, 0.36], [0.02, 1.52, 500, 0.38]]
        .forEach((q) => { const p = at(q[0], q[1]); mblob(p.x, p.y, px(q[2]), 0.99, q[3], 0.06, 'destination-out'); });
    // Fold the two channels into one map before sampling. The additive pass
    // runs over an OPAQUE black fill, so 'lighter' leaves alpha pinned at 255
    // and writes the gas into RGB; 'destination-out' does the reverse — it only
    // ever touches alpha (verified: a white 0.6 fill then a 0.9 erase reads back
    // [153,153,153,25], the red channel untouched). So RGB alone is the gas with
    // the hole missing, and alpha alone is the hole. The mask is their product.
    const mimg = mg.getImageData(0, 0, MW, MH).data;
    const mask = new Float32Array(MW * MH);
    for (let i = 0; i < mask.length; i++) mask[i] = (mimg[i * 4] / 255) * (mimg[i * 4 + 3] / 255);
    const maskAt = (x, y) => {   // x,y in [0,1)
        const fx = x * MW, fy = y * MH;
        let x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const x1 = (((x0 + 1) % MW) + MW) % MW; x0 = ((x0 % MW) + MW) % MW;
        let y1 = y0 + 1;
        if (y0 < 0) y0 = 0; else if (y0 > MH - 1) y0 = MH - 1;
        if (y1 < 0) y1 = 0; else if (y1 > MH - 1) y1 = MH - 1;
        const a0 = mask[y0 * MW + x0], b0 = mask[y0 * MW + x1];
        const a1 = mask[y1 * MW + x0], b1 = mask[y1 * MW + x1];
        const u = a0 + (b0 - a0) * tx, v = a1 + (b1 - a1) * tx;
        return u + (v - u) * ty;
    };

    // ---- the gas ------------------------------------------------------------
    const GAIN = 2.45;
    const ncv = document.createElement('canvas');
    ncv.width = NW; ncv.height = NH;
    const ng = ncv.getContext('2d');
    const nimg = ng.createImageData(NW, NH);
    const nd = nimg.data;
    for (let y = 0; y < NH; y++) {
        const v = (y + 0.5) / NH;
        for (let x = 0; x < NW; x++) {
            const u = (x + 0.5) / NW;
            const m = maskAt(u, v);
            const i = (y * NW + x) * 4;
            if (m <= 0.004) { nd[i] = 0; nd[i + 1] = 0; nd[i + 2] = 0; nd[i + 3] = 255; continue; }
            // density: the mask says where, the low fbm says how clumpy
            let dens = m * (0.55 + 0.62 * fbm(S_DENS, u, v, 4, false));
            // filaments: ridged noise is what makes gas look like sheets seen
            // edge-on instead of fog
            const fil = fbm(S_DET, u, v, 6, true);
            // lanes: opaque dust in front of the emission
            const dust = fbm(S_DUST, u, v, 5, false);
            const lane = 0.16 + 0.84 * Math.max(0, Math.min(1, (dust - 0.34) * 3.1));
            // Tone: a hard gamma, because a nebula is not a fog bank. The
            // reference art's sky patch is mean 59 with only 22% of its pixels
            // above L=60 — mostly dark, with a small very bright fraction —
            // and a linear field cannot produce that shape at any gain.
            let e = Math.pow(Math.max(0, dens * (0.15 + 1.60 * fil) * lane), 2.0) * GAIN;
            e = Math.max(0, Math.min(1.5, e));
            // colour drifts slowly across the field: violet -> magenta -> teal
            // fbm of several octaves piles up around 0.5; stretch it or the
            // whole sky comes out one colour.
            const hn = Math.max(0, Math.min(1, (fbm(S_HUE, u, v, 4, false) - 0.5) * 2.4 + 0.5));
            let r, gg, b;
            if (hn < 0.5) { const t = hn * 2; r = 108 + (222 - 108) * t; gg = 54 + (76 - 54) * t; b = 208 + (146 - 208) * t; }
            else { const t = (hn - 0.5) * 2; r = 222 + (44 - 222) * t; gg = 76 + (176 - 76) * t; b = 146 + (214 - 146) * t; }
            // hot cores burn out toward white
            const hot = Math.max(0, e - 0.74) * 1.6;
            nd[i]     = Math.min(255, r * e * 0.92 + hot * 150);
            nd[i + 1] = Math.min(255, gg * e * 0.92 + hot * 150);
            nd[i + 2] = Math.min(255, b * e * 0.92 + hot * 150);
            nd[i + 3] = 255;
        }
    }
    ng.putImageData(nimg, 0, 0);

    g.fillStyle = '#04030c';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = true;
    g.drawImage(ncv, 0, 0, W, H);

    // ---- stars --------------------------------------------------------------
    for (let i = 0; i < 3400; i++) {
        const x = rnd() * W, y = rnd() * H;
        const b = rnd();
        const s = (b > 0.985 ? 2.6 : (b > 0.9 ? 1.7 : 1.1));
        const a = 0.16 + b * 0.62;
        const hue = rnd();
        const col = hue > 0.86 ? '255,206,224' : (hue > 0.7 ? '188,226,255' : '255,255,255');
        g.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
        g.fillRect(x, y, s, s);
        if (b > 0.991) {
            const grd = g.createRadialGradient(x, y, 0, x, y, 16);
            grd.addColorStop(0, 'rgba(' + col + ',0.22)');
            grd.addColorStop(1, 'rgba(' + col + ',0)');
            g.fillStyle = grd;
            g.fillRect(x - 16, y - 16, 32, 32);
        }
    }
    g.globalCompositeOperation = 'source-over';

    // ---- film grain ---------------------------------------------------------
    // +/-1.5 LSB of per-texel noise. This is the one thing that actually
    // destroys the magnified-texel lattice — it decorrelates the bilinear seams
    // — and it is the grain every hand-painted space sky carries.
    try {
        const img = g.getImageData(0, 0, W, H);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const n = (rnd() - 0.5) * 3.0;
            d[i] += n; d[i + 1] += n; d[i + 2] += n;
        }
        g.putImageData(img, 0, 0);
    } catch (e) { /* never break the boot over grain */ }

    const tex = new THREE.CanvasTexture(cv);
    // No mipmap chain: this shell is only ever seen at one scale, and building
    // one is pure boot latency on a texture this size.
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.userData = { ivOwned: true };
    tex.needsUpdate = true;
    return tex;
}

function _ivWorld(radius, color, opts) {
    const o = opts || {};
    const sun = new THREE.Vector3(IV_SUN.x, IV_SUN.y, IV_SUN.z);
    let mat;
    if (typeof window.createPlanetPresenceMaterial === 'function') {
        mat = window.createPlanetPresenceMaterial({
            color: color,
            nightColor: o.nightColor === undefined ? 0xffc169 : o.nightColor,
            rimColor: o.rimColor === undefined ? 0x54a8ff : o.rimColor,
            rim: o.rim === undefined ? 0.95 : o.rim,
            city: o.city === undefined ? 1.0 : o.city,
            cloud: o.cloud === undefined ? 0.9 : o.cloud,
            seed: o.seed === undefined ? 3.7 : o.seed,
            sun: sun
        });
    } else {
        mat = new THREE.MeshBasicMaterial({ color: color });
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
    mesh.frustumCulled = false;
    return mesh;
}

// Extra additive shells for the vista star ONLY. The gameplay corona is tuned
// for a sun you fly past at a few thousand units; parked at 4 solar radii with
// the menu on top of it, the same art measured a dim ember. These two sprites
// are the difference between "there is a star over there" and the frame the
// user screengrabbed. They are children of the vista sun and die with it, so
// no gameplay star is touched.
function _ivStarGlowTexture(stops) {
    const size = 256, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const c = size / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    stops.forEach((s) => grd.addColorStop(s[0], s[1]));
    grd.addColorStop(1.00, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(cv);
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.userData = { ivOwned: true };
    t.needsUpdate = true;
    return t;
}

function _ivBlazeStar(sun, radius) {
    const add = (tex, worldSize, opacity, order) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, color: 0xffffff, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false,
            // depthTest OFF is the whole point. A sprite centred on the star's
            // centre sits one radius BEHIND its own lit surface, so with depth
            // testing on it is clipped away exactly where the star is — which
            // is why the gameplay corona leaves the disc reading as a matte
            // marble when you park this close. These two draw over it.
            depthTest: false,
            opacity: opacity
        }));
        s.scale.set(worldSize, worldSize, 1);
        s.frustumCulled = false;
        s.renderOrder = order;
        sun.add(s);
        return s;
    };
    // Wide warm halo — the "corona filling the frame" the order asks for.
    add(_ivStarGlowTexture([
        [0.00, 'rgba(255,242,214,0.50)'],
        [0.13, 'rgba(255,196,116,0.24)'],
        [0.42, 'rgba(255,124,48,0.07)']
    ]), radius * 6.4, 0.72, 68);
    // Blown-out core. Sized so the star's own limb sits at ~0.59 of this
    // sprite's radius: the disc reads overexposed all the way out, the
    // photosphere's granulation survives only as texture through the falloff,
    // and the hard chromosphere hoop stops reading as a marble's rim.
    add(_ivStarGlowTexture([
        [0.00, 'rgba(255,255,253,1.00)'],
        [0.30, 'rgba(255,250,232,0.92)'],
        [0.50, 'rgba(255,228,168,0.62)'],
        [0.72, 'rgba(255,168,74,0.22)']
    ]), radius * 3.4, 0.95, 69);
}

// ---------------------------------------------------------------------------
// Framing solver.
//   ivCameraPose(t)  -> { pos, fwd, right, up }  camera that puts Sol at
//                       (IV_SUN_FX, IV_SUN_FY) of the frame.
//   ivPlaceAt(pose, fx, fy, d) -> world point that lands at (fx, fy).
// ---------------------------------------------------------------------------
function _ivTans() {
    const fovY = (camera && camera.fov ? camera.fov : 75) * Math.PI / 360;
    const ty = Math.tan(fovY);
    const aspect = (camera && camera.aspect) ? camera.aspect : (window.innerWidth / window.innerHeight);
    return { tx: ty * aspect, ty: ty };
}

function ivCameraPose(t) {
    const S = new THREE.Vector3(IV_SUN.x, IV_SUN.y, IV_SUN.z);
    const yaw = Math.sin(t * IV_DRIFT_HZ) * IV_DRIFT_DEG * Math.PI / 180;
    const dist = IV_CAM_DIST + Math.sin(t * 0.037) * 14;

    const off = new THREE.Vector3(IV_CAM_DIR.x, IV_CAM_DIR.y, IV_CAM_DIR.z)
        .normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(dist);
    off.y += Math.sin(t * 0.16) * 8;
    const pos = S.clone().add(off);

    const toSun = S.clone().sub(pos).normalize();
    const T = _ivTans();
    const WORLD_UP = new THREE.Vector3(0, 1, 0);

    // Solve for the forward vector that lands the star on its mark. The camera
    // basis depends on forward, so iterate — two passes is well inside a pixel.
    // A direction d lands at (fx, fy) when d / (d·F) = F + R*(fx*tx) - U*(fy*ty),
    // so F = d/(d·F) - R*(fx*tx) + U*(fy*ty). The 1/(d·F) term is why a single
    // pass overshoots — measured, it put the star at -0.70 of the frame instead
    // of -0.46 — so run it to a fixed point.
    let fwd = toSun.clone();
    let right = new THREE.Vector3(), up = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
        right.crossVectors(fwd, WORLD_UP).normalize();
        up.crossVectors(right, fwd).normalize();
        const c = Math.max(0.25, toSun.dot(fwd));
        fwd = toSun.clone().multiplyScalar(1 / c)
            .addScaledVector(right, -IV_SUN_FX * T.tx)
            .addScaledVector(up, IV_SUN_FY * T.ty)
            .normalize();
    }
    right.crossVectors(fwd, WORLD_UP).normalize();
    up.crossVectors(right, fwd).normalize();
    return { pos: pos, fwd: fwd, right: right, up: up };
}

function ivPlaceAt(pose, fx, fy, dist) {
    const T = _ivTans();
    return pose.pos.clone().addScaledVector(
        pose.fwd.clone()
            .addScaledVector(pose.right, fx * T.tx)
            .addScaledVector(pose.up, -fy * T.ty)
            .normalize(),
        dist
    );
}

function buildIntroVista() {
    try {
        if (introVista.active || typeof THREE === 'undefined' || !scene || !camera) return;

        // Hide the launch-pad sky so space is actually visible. Kept, not
        // destroyed — the launch sequence flies through it verbatim.
        introVista.hidden = [];
        const hide = (obj) => {
            if (!obj) return;
            introVista.hidden.push({ obj: obj, was: obj.visible });
            obj.visible = false;
        };
        hide(introSequence.skyDome);
        hide(introSequence.atmosphereGlow);
        (introSequence.cloudLayers || []).forEach(hide);

        const g = new THREE.Group();
        g.name = 'introHeroVista';

        // --- painted sky ----------------------------------------------------
        const t0 = performance.now();
        const backdrop = new THREE.Mesh(
            new THREE.SphereGeometry(60000, 28, 18),
            new THREE.MeshBasicMaterial({ map: _ivSkyTexture(), side: THREE.BackSide, depthWrite: false, fog: false })
        );
        backdrop.position.set(IV_SUN.x, IV_SUN.y, IV_SUN.z);
        backdrop.frustumCulled = false;
        backdrop.renderOrder = -1000;
        g.add(backdrop);
        introVista.backdrop = backdrop;

        // --- the star -------------------------------------------------------
        const sun = new THREE.Mesh(
            new THREE.SphereGeometry(IV_SUN_R, 48, 36),
            new THREE.MeshBasicMaterial({ color: 0xffff44 })
        );
        sun.position.set(IV_SUN.x, IV_SUN.y, IV_SUN.z);
        sun.frustumCulled = false;
        g.add(sun);
        // The same call the gameplay Sol makes: identical photosphere,
        // corona, chromosphere, bloom and diffraction spikes.
        if (typeof window.addStarCorona === 'function') {
            window.addStarCorona(sun, IV_SUN_R, 0xff8833);
        }
        // Pin the photosphere seed: it is random per star in gameplay, and a
        // starspot landing dead centre made the boot frame's disc read dull on
        // some loads (measured 84/255 at the disc centre). Same star every boot.
        if (sun.userData && sun.userData._photosphere) {
            sun.userData._photosphere.uniforms.uSeed.value = 7.0;
        }
        if (sun.material && sun.material.color) {
            sun.material.color.lerp(new THREE.Color(0xfff6dd), 0.42);
        }
        // The diffraction-spike cross is sized radius*7 and the halo radius*3.2.
        // Those are lens artefacts tuned for a star you pass at thousands of
        // units; at 4 solar radii the spike sprite alone is ~1930 px across and
        // lifted the ENTIRE frame — corners included — into a violet wash that
        // buried the nebula and the menu. updateStarCoronas() rewrites their
        // opacity every frame but never their tint, so dimming the tint is the
        // one lever that survives the ticker. Sizes are untouched.
        const _cd = sun.userData || {};
        if (_cd._coronaSpikes) _cd._coronaSpikes.material.color.setScalar(0.34);
        if (_cd._coronaSprite) _cd._coronaSprite.material.color.setScalar(0.72);
        if (_cd._coronaChromo) _cd._coronaChromo.color.multiplyScalar(0.55);
        _ivBlazeStar(sun, IV_SUN_R);
        introVista.sun = sun;

        // Composition pass: place the worlds where the solved camera will see
        // them, rather than guessing world coordinates.
        const pose0 = ivCameraPose(0);

        // --- hero world, right of frame -------------------------------------
        const planet = _ivWorld(IV_PLANET_R, 0x2f63d8, { seed: 3.7, cloud: 0.92, city: 1.0 });
        planet.position.copy(ivPlaceAt(pose0, IV_PLANET_FX, IV_PLANET_FY, IV_PLANET_DIST));
        g.add(planet);
        introVista.planet = planet;

        // --- second, ringed world far upper-left, for depth ------------------
        const far = _ivWorld(IV_FAR_R, 0xd8a05a, {
            seed: 11.3, cloud: 0.35, city: 0.3,
            rimColor: 0xffc98a, rim: 0.6, nightColor: 0xffd9a0
        });
        far.position.copy(ivPlaceAt(pose0, IV_FAR_FX, IV_FAR_FY, IV_FAR_DIST));
        if (typeof window.addPlanetRings === 'function') {
            // tilt 0 on purpose: addPlanetRings only registers a ring into its
            // global de-spin list when the plane is leant, and this vista must
            // leave nothing behind in gameplay state.
            window.addPlanetRings(far, IV_FAR_R, 0xd8a05a, {
                outerK: 2.5, tilt: 0, opacity: 0.8, segments: 64
            });
        }
        g.add(far);
        introVista.farPlanet = far;

        scene.add(g);
        introVista.group = g;
        introVista.t0 = performance.now();
        introVista.active = true;

        applyIntroVistaCamera(0);

        console.log('🌞 Pre-launch hero vista built in ' + Math.round(performance.now() - t0) +
                    'ms — Sol at ' + IV_CAM_DIST + 'u, 2 worlds, painted sky');
    } catch (e) {
        console.warn('Intro hero vista failed to build, falling back to sky dome:', e);
        restoreIntroSkyObjects();
        introVista.active = false;
    }
}

function restoreIntroSkyObjects() {
    (introVista.hidden || []).forEach((h) => { if (h.obj) h.obj.visible = h.was; });
    introVista.hidden = [];
}

function applyIntroVistaCamera(tSec) {
    if (!camera) return;
    const pose = ivCameraPose(tSec);
    camera.position.copy(pose.pos);

    // Roll via the up-vector so lookAt() produces the sway, instead of us
    // stomping rotation.z after the fact.
    const roll = Math.sin(tSec * 0.21) * 0.012;
    camera.up.copy(pose.up).applyAxisAngle(pose.fwd, roll);
    camera.lookAt(pose.pos.clone().addScaledVector(pose.fwd, 1000));

    if (typeof cameraRotation !== 'undefined' && cameraRotation) {
        cameraRotation.x = camera.rotation.x;
        cameraRotation.y = camera.rotation.y;
        cameraRotation.z = camera.rotation.z;
    }
}

function updateIntroVista() {
    if (!introVista.active) return;
    const t = (performance.now() - introVista.t0) * 0.001;
    applyIntroVistaCamera(t);
    if (introVista.planet) introVista.planet.rotation.y = t * 0.012;
    if (introVista.farPlanet) introVista.farPlanet.rotation.y = -t * 0.02;
    if (typeof window.updateStarCoronas === 'function') window.updateStarCoronas();
    if (typeof window.updateStarPhotospheres === 'function') window.updateStarPhotospheres(0.016);
}

// Torn down when the player commits: LAUNCH cuts to the pad, SKIP/DEMO wipe the
// whole scene anyway. Idempotent so both paths can call it.
function disposeIntroVista() {
    if (!introVista.group) { introVista.active = false; return; }
    introVista.active = false;

    // Un-register the vista star from the shared corona ticker, so nothing
    // detached keeps being animated once the scene is cleared.
    try {
        const list = window.starCoronas;
        if (list && introVista.sun) {
            const i = list.indexOf(introVista.sun);
            if (i !== -1) list.splice(i, 1);
        }
    } catch (e) {}

    try {
        if (scene) scene.remove(introVista.group);
        introVista.group.traverse((o) => {
            if (o.geometry && o.geometry.dispose) o.geometry.dispose();
            if (o.material) {
                const ms = Array.isArray(o.material) ? o.material : [o.material];
                ms.forEach((m) => {
                    // Only free textures this module minted. The corona / flare
                    // / ring canvases come out of game-objects' colour-keyed
                    // caches and are SHARED with the gameplay Sol — disposing
                    // one here would blank out the real star's halo later.
                    if (m.map && m.map.userData && m.map.userData.ivOwned && m.map.dispose) m.map.dispose();
                    if (m.dispose) m.dispose();
                });
            }
        });
    } catch (e) {}

    introVista.group = null;
    introVista.backdrop = null;
    introVista.sun = null;
    introVista.planet = null;
    introVista.farPlanet = null;
    if (camera && camera.up) camera.up.set(0, 1, 0);
}

// Short black veil, so the jump from "hanging off Sol" to "standing on the pad"
// reads as a deliberate cinematic cut rather than a teleport glitch.
function introVistaCutToLaunchPad() {
    if (!introVista.active) return;

    const swap = () => {
        disposeIntroVista();
        restoreIntroSkyObjects();
        if (camera && introSequence.cameraOriginal.position) {
            camera.up.set(0, 1, 0);
            camera.position.copy(introSequence.cameraOriginal.position);
            const r = introSequence.cameraOriginal.rotation;
            camera.rotation.set(r.x, r.y, r.z);
        }
    };

    let veil = null;
    try {
        veil = document.createElement('div');
        veil.id = 'introVistaCut';
        veil.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;' +
            'pointer-events:none;z-index:26;transition:opacity 0.28s ease-in;';
        document.body.appendChild(veil);
        requestAnimationFrame(() => { veil.style.opacity = '1'; });
    } catch (e) { veil = null; }

    if (!veil) { swap(); return; }

    setTimeout(() => {
        swap();
        veil.style.transition = 'opacity 0.9s ease-out';
        veil.style.opacity = '0';
        setTimeout(() => { if (veil && veil.parentNode) veil.remove(); }, 950);
    }, 300);
}

function createEarthAtmosphere() {
    // Create sky dome
    const skyGeometry = new THREE.SphereGeometry(80000, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            sunPosition: { value: new THREE.Vector3(0, 1000, 500) }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 sunPosition;
            varying vec3 vWorldPosition;
            
            void main() {
                vec3 direction = normalize(vWorldPosition);
                
                // Sky gradient from horizon to zenith
                float horizon = abs(direction.y);
                vec3 skyColor = mix(
                    vec3(0.5, 0.7, 1.0),  // Blue sky
                    vec3(0.8, 0.9, 1.0),  // Lighter near horizon
                    1.0 - horizon
                );
                
                // Add some atmospheric scattering effect
                float sunFactor = max(0.0, dot(direction, normalize(sunPosition)));
                skyColor += vec3(1.0, 0.8, 0.4) * pow(sunFactor, 8.0) * 0.3;
                
                gl_FragColor = vec4(skyColor, 1.0);
            }
        `,
        side: THREE.BackSide
    });
    
    introSequence.skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(introSequence.skyDome);
    
    // Create cloud layers
    createCloudLayers();
    
    // Create atmosphere glow effect
    createAtmosphereGlow();
    
    console.log('🌤️ Earth atmosphere created');
}

function createCloudLayers() {
    // Create multiple cloud layers for depth
    for (let layer = 0; layer < 3; layer++) {
        const cloudGeometry = new THREE.PlaneGeometry(60000, 60000, 64, 64);
        const cloudMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                opacity: { value: 0.3 - layer * 0.08 },
                scale: { value: 1.0 + layer * 0.5 }
            },
            vertexShader: `
                uniform float time;
                uniform float scale;
                varying vec2 vUv;
                varying float vElevation;
                
                void main() {
                    vUv = uv;
                    
                    // Add some wave motion to clouds
                    vec3 pos = position;
                    pos.z += sin(pos.x * 0.0001 + time * 0.0005) * 200.0 * scale;
                    pos.z += cos(pos.y * 0.0001 + time * 0.0003) * 150.0 * scale;
                    
                    vElevation = pos.z;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float opacity;
                varying vec2 vUv;
                varying float vElevation;
                
                // Simple noise function
                float noise(vec2 p) {
                    return sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453;
                }
                
                float fbm(vec2 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    for(int i = 0; i < 4; i++) {
                        value += amplitude * sin(noise(p));
                        p *= 2.0;
                        amplitude *= 0.5;
                    }
                    return value;
                }
                
                void main() {
                    vec2 cloudUv = vUv * 3.0 + time * 0.0001;
                    float cloudPattern = fbm(cloudUv);
                    
                    // Create cloud shapes
                    float clouds = smoothstep(0.1, 0.9, cloudPattern);
                    
                    // Add some transparency variation
                    clouds *= opacity;
                    
                    // Fade based on elevation changes
                    clouds *= smoothstep(-100.0, 100.0, vElevation);
                    
                    gl_FragColor = vec4(1.0, 1.0, 1.0, clouds);
                }
            `,
            transparent: true,
            depthWrite: false
        });
        
        const cloudLayer = new THREE.Mesh(cloudGeometry, cloudMaterial);
        cloudLayer.position.y = 2000 + layer * 1000; // Stack clouds at different heights
        cloudLayer.rotation.x = -Math.PI / 2;
        
        scene.add(cloudLayer);
        introSequence.cloudLayers.push(cloudLayer);
    }
}

function createAtmosphereGlow() {
    // Create a subtle atmospheric glow around Earth's horizon
    const glowGeometry = new THREE.RingGeometry(70000, 85000, 64);
    const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            varying vec2 vUv;
            
            void main() {
                float distance = length(vUv - 0.5) * 2.0;
                float glow = 1.0 - smoothstep(0.8, 1.0, distance);
                
                // Subtle blue atmospheric glow
                vec3 glowColor = vec3(0.4, 0.6, 1.0);
                float alpha = glow * 0.3;
                
                gl_FragColor = vec4(glowColor, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    
    introSequence.atmosphereGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    introSequence.atmosphereGlow.rotation.x = -Math.PI / 2;
    introSequence.atmosphereGlow.position.y = -1000;
    
    scene.add(introSequence.atmosphereGlow);
}

// =============================================================================
// INTRO UI SETUP
// =============================================================================

function updateIntroStatusPanels() {
    // Update ship status with pre-launch values
    const velocityEl = document.getElementById('velocity');
    const distanceEl = document.getElementById('distance');
    const energyBarEl = document.getElementById('energyBar');
    const hullBarEl = document.getElementById('hullBar');
    const locationEl = document.getElementById('location');
    const weaponStatusEl = document.getElementById('weaponStatus');
    const emergencyWarpEl = document.getElementById('emergencyWarpCount');
    
    if (velocityEl) velocityEl.textContent = '0.0 km/s';
    if (distanceEl) distanceEl.textContent = '0.0 ly';
    if (energyBarEl) energyBarEl.style.width = '100%';
    if (hullBarEl) hullBarEl.style.width = '100%';
    if (locationEl) locationEl.textContent = 'Earth Surface - Launch Pad';
    if (weaponStatusEl) weaponStatusEl.textContent = 'STANDBY';
    if (emergencyWarpEl) emergencyWarpEl.textContent = '5';
    
    // Update navigation panel
    const targetInfo = document.getElementById('targetInfo');
    if (targetInfo) {
        targetInfo.textContent = 'Target: Low Earth Orbit';
        targetInfo.className = 'text-cyan-400 curved-element';
    }
    
    // Update available targets with launch mission info
    const container = document.getElementById('availableTargets');
    if (container) {
        container.innerHTML = `
            <div class="planet-card rounded-lg p-3 bg-blue-900 bg-opacity-30">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-cyan-300 text-sm">Launch Mission</h4>
                        <p class="text-xs text-blue-400">Earth Orbital Insertion</p>
                    </div>
                    <div class="text-right">
                        <div class="text-sm text-yellow-400">400 km</div>
                        <div class="text-xs text-gray-400">Awaiting Launch</div>
                    </div>
                </div>
            </div>
            <div class="planet-card rounded-lg p-3 bg-gray-800 bg-opacity-30 mt-2">
                <div class="text-center text-gray-400 text-sm">
                    <i class="fas fa-rocket mr-2"></i>Pre-flight checks complete
                </div>
            </div>
        `;
    }
}

function hideNonIntroElements() {
    // Hide achievement popup during intro
    const achievementPopup = document.getElementById('achievementPopup');
if (achievementPopup) {
    achievementPopup.style.display = '';  // ⭐ Clear inline style instead of setting to 'block'
    achievementPopup.style.visibility = '';
    achievementPopup.style.opacity = '';
    achievementPopup.classList.add('hidden');  // Start hidden, let showAchievement control it
}
    
    // Hide tutorial alerts during intro
    const missionCommandAlert = document.getElementById('missionCommandAlert');
    if (missionCommandAlert) {
        missionCommandAlert.classList.add('hidden');
    }
    
    // Hide any event horizon warnings
    const eventHorizonWarning = document.getElementById('eventHorizonWarning');
    if (eventHorizonWarning) {
        eventHorizonWarning.classList.add('hidden');
    }
    
    // Hide boss warnings
    const bossWarning = document.getElementById('bossWarning');
    if (bossWarning) {
        bossWarning.classList.add('hidden');
    }
    
    // Disable warp button during intro
    const warpBtn = document.getElementById('warpBtn');
    if (warpBtn) {
        warpBtn.disabled = true;
        warpBtn.innerHTML = '<i class="fas fa-clock mr-2"></i>Launch Sequence Active';
    }
    
    // Disable auto-navigate button
    const autoNavBtn = document.getElementById('autoNavigateBtn');
    if (autoNavBtn) {
        autoNavBtn.disabled = true;
        autoNavBtn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Preparing for Launch';
    }
    
    // Temporarily disable tutorial system if it exists
    if (typeof tutorialSystem !== 'undefined') {
        tutorialSystem.introActive = true; // Flag to prevent tutorial during intro
    }
}

function createCountdownOverlay() {
    // Idempotent: three separate intro setup paths call this
    // (setupIntroUI / setupIntroUIContent / setupIntroUIWithoutShowing) and
    // more than one runs per boot. Without this guard each call appended a
    // *new* #introCountdownOverlay, so the DOM carried duplicate ids: every
    // getElementById('introCountdownOverlay') / getElementById('countdownTimer')
    // in the countdown + teardown code then addressed only the FIRST copy,
    // leaving orphan overlays (each with its own live countdown text) stacked
    // at z-index 9999 over the game. Reuse the existing node instead.
    const existing = document.getElementById('introCountdownOverlay');
    if (existing) {
        // Drop any extra copies a previous boot path may already have added.
        document.querySelectorAll('#introCountdownOverlay').forEach((el) => {
            if (el !== existing) el.remove();
        });
        return;
    }

    const countdownOverlay = document.createElement('div');
    countdownOverlay.id = 'introCountdownOverlay';
    countdownOverlay.className = 'absolute inset-0 pointer-events-none hidden';
    countdownOverlay.style.zIndex = '9999'; // Much higher than z-60
    countdownOverlay.style.position = 'fixed';
    countdownOverlay.innerHTML = `
        <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center" style="z-index: 10000;">
            <div id="countdownTimer" class="text-8xl font-bold text-cyan-400 glow-text cyber-title mb-4" style="font-family: 'Orbitron', monospace; text-shadow: 0 0 20px rgba(0,255,255,0.8), 0 0 40px rgba(0,255,255,0.5);">10</div>
            <div id="countdownStatus" class="text-xl text-cyan-300 mb-8" style="font-family: 'Orbitron', monospace; text-shadow: 0 0 10px rgba(0,255,255,0.6);">LAUNCH SEQUENCE INITIATED</div>
            <div class="text-sm text-yellow-400" style="font-family: 'Share Tech Mono', monospace;">
                <div id="missionControl" class="mb-2 text-green-400" style="text-shadow: 0 0 8px rgba(0,255,0,0.6);">MISSION CONTROL: All systems nominal</div>
                <div id="systemStatus" class="text-cyan-400" style="text-shadow: 0 0 8px rgba(0,255,255,0.6);">â—‹ Engine Ignition Ready</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(countdownOverlay);
}
function createSkipButton() {
    const skipButton = document.createElement('button');
    skipButton.id = 'skipIntroBtn';
    skipButton.className = 'absolute bottom-4 left-1/2 transform -translate-x-1/2 space-btn rounded px-4 py-2 text-sm';
    skipButton.innerHTML = '<i class="fas fa-forward mr-2"></i>Skip Intro';
    skipButton.addEventListener('click', skipIntroSequence);

    // Apply the visible mobile styling to ALL mobile devices (iPhone,
    // Android, iPad).  Previously only iPhone got this treatment and
    // Android / iPad fell back to the transparent space-btn class which
    // rendered invisible on the black intro background.
    const isMobile = window.innerWidth <= 768 ||
                     ('ontouchstart' in window && window.innerWidth <= 1024);

    if (isMobile) {
        // Match the desktop space-btn glassmorphism look — blue/cyan
        // gradient, not a heavy dark background.  Just enforce positioning
        // + tappable sizing so the button sits above the intro video.
        skipButton.style.cssText = `
            position: fixed !important;
            bottom: 16px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            padding: 10px 22px !important;
            background: linear-gradient(135deg, rgba(0,150,255,0.2), rgba(0,100,200,0.3)) !important;
            border: 1px solid rgba(0,150,255,0.55) !important;
            border-radius: 8px !important;
            color: rgba(0,255,255,0.95) !important;
            font-family: 'Orbitron', monospace !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            letter-spacing: 1px !important;
            cursor: pointer !important;
            opacity: 0;
            transition: all 0.25s ease !important;
            z-index: 10000 !important;
            backdrop-filter: blur(5px) !important;
            -webkit-backdrop-filter: blur(5px) !important;
            box-shadow: 0 4px 15px rgba(0,150,255,0.2), inset 0 1px 0 rgba(0,150,255,0.3) !important;
            text-shadow: 0 0 6px rgba(0,255,255,0.6) !important;
            -webkit-tap-highlight-color: rgba(0,200,255,0.3) !important;
            touch-action: manipulation !important;
        `;

        skipButton.addEventListener('mouseenter', () => {
            skipButton.style.background = 'linear-gradient(135deg, rgba(0,200,255,0.3), rgba(0,150,255,0.4))';
            skipButton.style.boxShadow = '0 0 20px rgba(0,255,255,0.4), 0 6px 20px rgba(0,150,255,0.3), inset 0 1px 0 rgba(0,255,255,0.4)';
        });

        skipButton.addEventListener('mouseleave', () => {
            skipButton.style.background = 'linear-gradient(135deg, rgba(0,150,255,0.2), rgba(0,100,200,0.3))';
            skipButton.style.boxShadow = '0 4px 15px rgba(0,150,255,0.2), inset 0 1px 0 rgba(0,150,255,0.3)';
        });
    } else {
        // Desktop AND iPad: transparent glassmorphism style from space-btn class
        skipButton.style.opacity = '0';
        skipButton.style.zIndex = '10000';
    }

    document.body.appendChild(skipButton);
    introSequence.skipButton = skipButton;
}

function createStartButton() {
    const startButton = document.createElement('button');
    startButton.id = 'introStartBtn';
    startButton.className = 'absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 intro-start-btn';
    startButton.innerHTML = `
        <div class="start-btn-content">
            <div class="start-btn-text">PRESS TO LAUNCH</div>
            <div class="start-btn-subtext">BEGIN MISSION</div>
        </div>
    `;
    
    // Add click handler
    startButton.addEventListener('click', beginLaunchSequence);
    
    // FIXED: Add keyboard handler for Enter/Space (no warp sound)
    const keyHandler = (e) => {
        // Only respond to Enter or Space if start button is still visible
        if ((e.key === 'Enter' || e.key === ' ') && document.getElementById('introStartBtn')) {
            e.preventDefault();
            e.stopPropagation();
            beginLaunchSequence();
            // Remove this specific handler after use
            document.removeEventListener('keydown', keyHandler, true);
        }
    };
    
    // Use capture phase to intercept before other handlers
    document.addEventListener('keydown', keyHandler, true);
    
    // Store reference to remove handler later if needed
    introSequence.startKeyHandler = keyHandler;
    
    document.body.appendChild(startButton);
    introSequence.startButton = startButton;
}

// Also add this cleanup function to remove the handler when intro ends
function cleanupIntroHandlers() {
    // Remove the start button keyboard handler if it still exists
    if (introSequence.startKeyHandler) {
        document.removeEventListener('keydown', introSequence.startKeyHandler, true);
        introSequence.startKeyHandler = null;
    }
}

// Make sure to call cleanupIntroHandlers in your beginLaunchSequence function
function beginLaunchSequence() {
    console.log('🚀 Player initiated launch sequence');

    // Cut from the hero vista back to the launch pad behind a short veil, so
    // the countdown starts from exactly the camera/sky state it always had.
    introVistaCutToLaunchPad();

    // Start Launch Screen soundtrack now that the user has explicitly
    // clicked Start (satisfies browser autoplay gating).  Intro.mp3 is
    // skipped — the launch track fades straight into the galaxy track.
    if (typeof soundtrack !== 'undefined') {
        soundtrack.setSuppressIntro(true);
        if (soundtrack.startLaunchScreen) soundtrack.startLaunchScreen();
    }

    // Clean up intro handlers immediately
    cleanupIntroHandlers();
    
    // Hide the start button with fade effect
    if (introSequence.startButton) {
        introSequence.startButton.style.transition = 'opacity 0.5s ease-out';
        introSequence.startButton.style.opacity = '0';
        setTimeout(() => {
            if (introSequence.startButton) {
                introSequence.startButton.remove();
                introSequence.startButton = null;
            }
        }, 500);
    }
    
    // Hide skip button if it exists
    if (introSequence.skipButton) {
        introSequence.skipButton.style.transition = 'opacity 0.3s ease-out';
        introSequence.skipButton.style.opacity = '0';
        setTimeout(() => {
            if (introSequence.skipButton) {
                introSequence.skipButton.remove();
                introSequence.skipButton = null;
            }
        }, 300);
    }

    // Hide demo button on launch
    if (introSequence.demoButton) {
        introSequence.demoButton.style.transition = 'opacity 0.3s ease-out';
        introSequence.demoButton.style.opacity = '0';
        setTimeout(() => {
            if (introSequence.demoButton) {
                introSequence.demoButton.remove();
                introSequence.demoButton = null;
            }
        }, 300);
    }
    const demoBtnEl = document.getElementById('introDemoBtn');
    if (demoBtnEl) { demoBtnEl.style.opacity = '0'; setTimeout(() => demoBtnEl.remove(), 300); }

    // Mark intro as active
    introSequence.active = true;
    introSequence.phase = 'countdown';
    introSequence.phaseStartTime = Date.now();
    
    // Initialize audio context on user interaction
    if (typeof initAudio === 'function') {
        initAudio();
    }
    
    if (typeof resumeAudioContext === 'function') {
        resumeAudioContext();
    }
    
    // Start countdown
    console.log('⏱️ Starting countdown...');
    
    // INITIALIZE AUDIO SYSTEM ON FIRST USER INTERACTION
    if (typeof initAudio === 'function') {
        initAudio();
        console.log('🔊 Audio system initialized on user interaction');
    }
    
    // RESUME AUDIO CONTEXT (required for browsers)
    if (typeof resumeAudioContext === 'function') {
        resumeAudioContext();
        console.log('🔊 Audio context resumed - all sound enabled');
    }
    
    // Play button sound (existing code - keep this)
    if (typeof playSound === 'function') {
        playSound('achievement', 800, 0.2); // Button press sound
    }
    
    // ADD THIS: Start background music for the intro sequence
    if (typeof startBackgroundMusic === 'function') {
        setTimeout(() => {
            startBackgroundMusic();
            console.log('🎵 Background music started during intro');
        }, 500);
    }
    
    // CREATE ATMOSPHERE NOW - needed for liftoff animation (existing code - keep this)
    if (!window.atmosphereCreated) {
        console.log('🌤️ Creating atmosphere for liftoff animation...');
        createEarthAtmosphere();
        window.atmosphereCreated = true;
    }
    
    // Make skip button semi-transparent and visible
    if (introSequence.skipButton) {
        introSequence.skipButton.style.opacity = '0.7';
    }
    
    // Skip surface phase, go directly to countdown
    transitionToCountdown();
}

function startTitleFlashing() {
    const gameTitle = document.getElementById('gameTitle');
    if (gameTitle) {
        gameTitle.classList.add('title-flash');
        console.log('🎯 Title flashing started during intro');
    }
}

function stopTitleFlashing() {
    const gameTitle = document.getElementById('gameTitle');
    if (gameTitle) {
        gameTitle.classList.remove('title-flash');
        console.log('🎯 Title flashing stopped');
    }
}

// =============================================================================
// ANIMATION AND PHASE MANAGEMENT
// =============================================================================

function animateIntroSequence() {
    if (!introSequence.active) return;
    
    const currentTime = Date.now();
    const phaseElapsed = currentTime - introSequence.phaseStartTime;
    const totalElapsed = currentTime - introSequence.startTime;
    
    // Update visual effects
    updateVisualEffects(totalElapsed);
    
    // Handle phase transitions and animations
    switch (introSequence.phase) {
        case 'start':
            animateStartPhase(phaseElapsed);
            break;
        case 'surface':
            animateSurfacePhase(phaseElapsed);
            break;
        case 'countdown':
            animateCountdownPhase(phaseElapsed);
            break;
        case 'launch':
            animateLaunchPhase(phaseElapsed);
            break;
        case 'transition':
            animateTransitionPhase(phaseElapsed);
            break;
        case 'complete':
            completeIntroSequence();
            return;
    }
    
    // Apply camera shake if active
    if (introSequence.shakeIntensity > 0) {
        applyCameraShake();
    }

    // Update player ship position to follow camera
    if (typeof updateCameraView === 'function' && camera) {
        updateCameraView(camera);
    }

    // Render the scene
    gameRender(scene, camera);

    // Continue animation loop
    requestAnimationFrame(animateIntroSequence);
}

function animateStartPhase(elapsed) {
    // Hero vista: slow cinematic drift around Sol while the menu waits.
    if (introVista.active) {
        updateIntroVista();
        return;
    }

    // Fallback (vista failed to build): original launch-pad sky sway.
    const sway = Math.sin(elapsed * 0.0008) * 0.003; // Slower, more gentle sway
    camera.rotation.z = sway;

    // No automatic transition - waiting for player input
}

function animateSurfacePhase(elapsed) {
    // Just show the Earth surface view, gentle camera sway
    const sway = Math.sin(elapsed * 0.001) * 0.002;
    camera.rotation.z = sway;
    
    // Check for phase transition
    if (elapsed >= introSequence.duration.surface) {
        transitionToCountdown();
    }
}

function animateCountdownPhase(elapsed) {
    const progress = elapsed / introSequence.duration.countdown;
    
    // Show countdown overlay WITH WIPE-DOWN EFFECT
    const overlay = document.getElementById('introCountdownOverlay');
    if (overlay && overlay.classList.contains('hidden')) {
        overlay.classList.remove('hidden');
        
        // Trigger wipe-down animation from top to bottom
        requestAnimationFrame(() => {
            overlay.style.clipPath = 'inset(0 0 0 0)'; // Reveal full overlay
        });
        
        console.log('🕐 Countdown overlay wiping down from top');
        
        // FORCE lower z-index immediately
        overlay.style.zIndex = '25';
        overlay.style.pointerEvents = 'none';
    }
    
    // Update countdown timer
    const newCountdown = Math.max(0, Math.ceil(10 - (elapsed / 1000)));
    if (newCountdown !== introSequence.countdownValue) {
        introSequence.countdownValue = newCountdown;
        updateCountdownDisplay(newCountdown);
        
        // Play custom countdown beep - NASA-style tone
        if (newCountdown > 0) {
            playCountdownTone(newCountdown);
        }
    }
    
    // Increase camera shake as countdown progresses
    introSequence.shakeIntensity = progress * 0.5;
    
    // Check for phase transition
    if (elapsed >= introSequence.duration.countdown || newCountdown <= 0) {
        transitionToLaunch();
    }
}

function animateLaunchPhase(elapsed) {
    const progress = elapsed / introSequence.duration.launch;
    const easeProgress = easeOutQuart(progress);
    
    // Trigger launch effects on first frame
    if (!introSequence.launched) {
        triggerLaunchEffects();
        introSequence.launched = true;
    }
    
    // Extended camera movement - go much higher to make Earth disappear completely
    const startPos = introSequence.cameraOriginal.position;
    const extendedTargetPos = new THREE.Vector3(0, 80000, 0);
    
    camera.position.lerpVectors(startPos, extendedTargetPos, easeProgress);
    
    // Gradually look more forward as we ascend
    const startRotX = introSequence.cameraOriginal.rotation.x;
    const targetRotX = 0;
    camera.rotation.x = THREE.MathUtils.lerp(startRotX, targetRotX, easeProgress);
    
    // Intense camera shake during launch
    introSequence.shakeIntensity = 1.0 - (progress * 0.7);
    
    // Apply UI shake and glitch effects during launch
    applyUIShakeAndGlitch(progress);
    
    // Transition sky from blue to black
    transitionSkyToSpace(progress);
    
    // Update UI to show increasing altitude and speed
    updateLaunchUI(progress);
    
    // START FADE TO BLACK HALFWAY THROUGH LAUNCH (at 50% progress = 6 seconds)
    if (progress >= 0.5) {
        const fadeProgress = (progress - 0.5) / 0.5; // 0 to 1 over the second half
        createFadeToBlackDuringLaunch(fadeProgress);
    }
    
    // Check for phase transition
    if (elapsed >= introSequence.duration.launch) {
        transitionToTransition();
    }
}

function animateTransitionPhase(elapsed) {
    const progress = elapsed / introSequence.duration.transition;
    
    // Fade camera shake to zero quickly
    introSequence.shakeIntensity = Math.max(0, 1.0 - progress * 3);
    
    if (progress < 0.1) {
        // Brief pause in black (first 10% - 1 second)
        if (!introSequence.gameSetupStarted) {
            setupNormalGameContent();
            introSequence.gameSetupStarted = true;
        }
    } else if (progress < 0.3) {
        // Continue game setup (next 20% - 2 seconds)
        if (!introSequence.orbitsCreated) {
            if (typeof createOrbitLines === 'function') {
                createOrbitLines();
            }
            introSequence.orbitsCreated = true;
            console.log('🌅 Orbit lines created during black screen');
        }
    } else {
        // Slow fade in from black (remaining time)
        const fadeInProgress = (progress - 0.3) / 0.7;
        
        createFadeFromBlack(fadeInProgress);
    }
    
    // Fade out intro elements after game appears
    if (progress < 0.8) {
        fadeOutIntroElements(progress / 0.8);
    }

    // Start tutorial once fade is mostly complete
    const fadeInProgress = (progress - 0.6) / 0.8;
    if (fadeInProgress > 0.8 && typeof startTutorial === 'function') {
        // Tutorial will handle the final countdown text cleanup
        setTimeout(startTutorial, 1000);
    }
    
    // Check for completion
    if (elapsed >= introSequence.duration.transition) {
        console.log('🎬 Transition phase complete');
        introSequence.phase = 'complete';
    }
}

// =============================================================================
// PHASE TRANSITION FUNCTIONS
// =============================================================================

function transitionToCountdown() {
    introSequence.phase = 'countdown';
    introSequence.phaseStartTime = Date.now();
    console.log('⏱️ Intro phase: Countdown started');
}

function transitionToLaunch() {
    introSequence.phase = 'launch';
    introSequence.phaseStartTime = Date.now();
    console.log('🚀 Intro phase: Launch initiated');
    
    // Update countdown display to show "LAUNCH"
    updateCountdownDisplay(0);
}

function transitionToTransition() {
    introSequence.phase = 'transition';
    introSequence.phaseStartTime = Date.now();
    console.log('🌅 Intro phase: Transition to space - screen will stay black for 3 seconds during setup');
    
    // Ensure fade overlay exists and is fully black
    if (!introSequence.fadeOverlay) {
        introSequence.fadeOverlay = document.createElement('div');
        introSequence.fadeOverlay.id = 'introFadeOverlay';
        introSequence.fadeOverlay.className = 'absolute inset-0 bg-black pointer-events-none';
        introSequence.fadeOverlay.style.position = 'fixed';
        introSequence.fadeOverlay.style.zIndex = '60';
        introSequence.fadeOverlay.style.opacity = '1';
        document.body.appendChild(introSequence.fadeOverlay);
        console.log('🖤 Fade overlay created at transition start - fully black');
    } else {
        // Make sure it's fully opaque
        introSequence.fadeOverlay.style.opacity = '1';
        console.log('🖤 Fade overlay already exists - ensuring fully black');
    }
}

function completeIntroSequence() {
    console.log('✅ Intro sequence complete - starting normal game');
    
    // Clear intro UI protection flags
    if (typeof window !== 'undefined') {
        window.introUIActive = false;
        window.skipUIUpdates = false;
    }
    
    // Remove intro UI locks
    const lockedElements = document.querySelectorAll('[data-intro-locked]');
    lockedElements.forEach(el => {
        el.removeAttribute('data-intro-locked');
    });
    
    // Mark intro as played
    markIntroAsPlayed();
    
    // Remove intro active class
    document.body.classList.remove('intro-active');
    
    // Ensure any remaining fade overlay is removed
    if (introSequence.fadeOverlay) {
        console.log('🧹 Force removing remaining fade overlay');
        introSequence.fadeOverlay.remove();
        introSequence.fadeOverlay = null;
    }
    
    // Clean up intro elements
    cleanupIntroElements();
    
    // Start the actual game
    startNormalGameplay();
}

// =============================================================================
// VISUAL EFFECTS AND UPDATES
// =============================================================================

function updateVisualEffects(totalElapsed) {
    const time = totalElapsed * 0.001;
    
    // Update sky dome shader
    if (introSequence.skyDome && introSequence.skyDome.material.uniforms) {
        introSequence.skyDome.material.uniforms.time.value = time;
    }
    
    // Update cloud layers
    introSequence.cloudLayers.forEach((cloudLayer, index) => {
        if (cloudLayer.material.uniforms) {
            cloudLayer.material.uniforms.time.value = time;
        }
        
        // Drift clouds slightly
        cloudLayer.rotation.z += 0.0001 * (index + 1);
    });
    
    // Update atmosphere glow
    if (introSequence.atmosphereGlow && introSequence.atmosphereGlow.material.uniforms) {
        introSequence.atmosphereGlow.material.uniforms.time.value = time;
    }
}

function updateCountdownDisplay(count) {
    const timer = document.getElementById('countdownTimer');
    const status = document.getElementById('countdownStatus');
    const missionControlEl = document.getElementById('missionControl');
    const systemStatusEl = document.getElementById('systemStatus');
    
    if (timer) {
        if (count > 0) {
            timer.textContent = count;
            timer.className = 'text-8xl font-bold text-cyan-400 glow-text cyber-title mb-4';
            
            // Play NASA-style countdown beep
            if (count > 0 && audioContext) {
                if (audioContext.state === 'suspended') audioContext.resume();
                const oscillator = audioContext.createOscillator();
                const gain = audioContext.createGain();
                
                oscillator.connect(gain);
                gain.connect(audioContext.destination);
                
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                oscillator.type = 'sine';
                
                gain.gain.setValueAtTime(0, audioContext.currentTime);
                gain.gain.linearRampToValueAtTime(0.03, audioContext.currentTime + 0.02); // MUCH QUIETER: was 0.06
                gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.4);
            }
            
            // Add a subtle echo for "mission control" feel
            setTimeout(() => {
                if (!audioContext) return;
                if (audioContext.state === 'suspended') audioContext.resume();
                
                const echoOsc = audioContext.createOscillator();
                const echoGain = audioContext.createGain();
                
                echoOsc.connect(echoGain);
                echoGain.connect(audioContext.destination);
                
                echoOsc.frequency.setValueAtTime(800, audioContext.currentTime);
                echoOsc.type = 'sine';
                
                echoGain.gain.setValueAtTime(0, audioContext.currentTime);
                echoGain.gain.linearRampToValueAtTime(0.015, audioContext.currentTime + 0.01); // MUCH QUIETER: was 0.04
                echoGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
                
                const echoStart = audioContext.currentTime;
                echoOsc.start(echoStart);
                echoOsc.stop(echoStart + 0.2);
            }, 150); // 150ms delay for echo
        } else {
            timer.textContent = 'LIFTOFF';
            timer.className = 'text-6xl font-bold text-orange-400 glow-text cyber-title mb-4';
            
            // Play launch sound
            if (typeof playSound === 'function') {
                playSound('warp', 80, 1.5);
            }
        }
        timer.style.fontFamily = "'Orbitron', monospace";
        timer.style.textShadow = count > 0 ? 
            '0 0 20px rgba(0,255,255,0.8), 0 0 40px rgba(0,255,255,0.5)' : 
            '0 0 20px rgba(255,165,0,0.8), 0 0 40px rgba(255,165,0,0.5)';
    }
    
    if (status) {
        if (count > 3) {
            status.textContent = 'LAUNCH SEQUENCE INITIATED';
            status.style.opacity = '1';
        } else if (count > 0) {
            status.textContent = 'ENGINE IGNITION IMMINENT';
            status.style.opacity = '1';
        } else {
            status.textContent = 'LIFTOFF!';
            status.style.opacity = '1';
        }
        status.style.fontFamily = "'Orbitron', monospace";
        status.style.textShadow = '0 0 10px rgba(0,255,255,0.6)';
        status.style.transition = 'opacity 0.5s ease';
    }
    
    // Enhanced cyberpunk mission control messages with Share Tech Mono font
    if (missionControlEl && count > 0) {
        const messages = [
            'MISSION CONTROL: All systems nominal',
            'MISSION CONTROL: Engine pre-ignition started', 
            'MISSION CONTROL: Final systems check complete',
            'MISSION CONTROL: We have ignition!'
        ];
        
        let messageIndex;
        if (count >= 8) messageIndex = 0;
        else if (count >= 5) messageIndex = 1;  
        else if (count >= 2) messageIndex = 2;
        else messageIndex = 3;
        
        missionControlEl.textContent = messages[messageIndex];
        missionControlEl.style.fontFamily = "'Share Tech Mono', monospace";
        missionControlEl.style.color = '#00ff88';
        missionControlEl.style.textShadow = '0 0 8px rgba(0,255,136,0.6), 0 0 16px rgba(0,255,136,0.3)';
    }
    
    if (systemStatusEl && count > 0) {
        systemStatusEl.textContent = count > 3 ? '▸ Engine Ignition Ready' : '▹ Engine Ignition Active';
        systemStatusEl.className = count > 3 ? 'text-cyan-400' : 'text-yellow-400';
        systemStatusEl.style.fontFamily = "'Share Tech Mono', monospace";
        systemStatusEl.style.textShadow = count > 3 ? '0 0 8px rgba(0,255,255,0.6)' : '0 0 8px rgba(255,255,0,0.6)';
    }
}

function updateLaunchUI(progress) {
    const timer = document.getElementById('countdownTimer');
    const status = document.getElementById('countdownStatus');
    
    // Update velocity display
    const velocityEl = document.getElementById('velocity');
    if (velocityEl) {
        const speed = progress * 11200;
        velocityEl.textContent = speed.toFixed(0) + ' km/s';
    }
    
    // Update location with much higher altitudes
    const locationEl = document.getElementById('location');
    if (locationEl) {
        const altitude = progress * 800;
        if (altitude < 100) {
            locationEl.textContent = `Ascending - ${altitude.toFixed(0)} km altitude`;
        } else if (altitude < 400) {
            locationEl.textContent = `Low Earth Orbit - ${altitude.toFixed(0)} km`;
        } else {
            locationEl.textContent = `High Earth Orbit - ${altitude.toFixed(0)} km`;
        }
    }
    
    // EXTENDED: Longer ascent phase, much later orbital message
    if (timer && status) {
        if (progress < 0.2) {
            // Shorter liftoff phase (0-20%)
            timer.textContent = 'LIFTOFF';
            timer.style.opacity = '1';
            status.textContent = 'ASCENDING TO ORBIT';
            status.style.opacity = '1';
        } else if (progress < 0.85) {
            // MUCH LONGER ascent phase (20-85%)
            timer.textContent = 'ASCENDING';
            timer.style.opacity = '1';
            status.textContent = 'GAINING ALTITUDE';
            status.style.opacity = '1';
        } else {
            // ORBITING phase appears much later (85%+)
            timer.textContent = 'ORBITING EARTH';
            timer.className = 'text-6xl font-bold text-cyan-400 glow-text cyber-title mb-4';
            timer.style.opacity = '1'; // Always visible
            status.textContent = 'ATMOSPHERIC ESCAPE SUCCESSFUL';
            status.style.opacity = '1'; // Always visible
        }
    }
    
    // Update target info
    const targetInfo = document.getElementById('targetInfo');
    if (targetInfo) {
        if (progress < 0.3) {
            targetInfo.textContent = 'Status: Engine Burn Active';
            targetInfo.className = 'text-orange-400 curved-element pulse';
        } else if (progress < 0.7) {
            targetInfo.textContent = 'Status: Orbital Mechanics Active';
            targetInfo.className = 'text-cyan-400 curved-element';
        } else {
            targetInfo.textContent = 'Status: Earth Departure Trajectory';
            targetInfo.className = 'text-purple-400 curved-element';
        }
    }
}

function applyCameraShake() {
    const shakeX = (Math.random() - 0.5) * introSequence.shakeIntensity * 0.02;
    const shakeY = (Math.random() - 0.5) * introSequence.shakeIntensity * 0.02;
    const shakeZ = (Math.random() - 0.5) * introSequence.shakeIntensity * 0.02;
    
    camera.position.add(new THREE.Vector3(shakeX, shakeY, shakeZ));
}

function triggerLaunchEffects() {
    // Update countdown display for launch
    updateCountdownDisplay(0);
    
    // RESTORE: Your original launch sounds that you like
    if (typeof playSound === 'function') {
        playSound('warp', 80, 1.5);  // Low rumble
        setTimeout(() => {
            if (typeof playSound === 'function') {
                playSound('achievement', 200, 1.0); // Engine ignition
            }
        }, 200);
        setTimeout(() => {
            if (typeof playSound === 'function') {
                playSound('warp', 120, 2.0); // Full power
            }
        }, 500);
    }
    
    // ADD: Just the new cyberpunk rumble as an additional layer
    setTimeout(() => {
        playLaunchRumbleSound(); // This adds richness to your existing sounds
    }, 400);
    
    // Keep your screen rumble effect
    createLaunchRumble();
    
    console.log('🚀 Launch effects triggered with enhanced rumble');
}

function transitionSkyToSpace(progress) {
    // Transition sky color from blue to black
    if (introSequence.skyDome) {
        const startColor = new THREE.Color(0x87CEEB); // Sky blue
        const endColor = new THREE.Color(0x000003);   // Space black
        
        const currentColor = startColor.clone().lerp(endColor, progress);
        renderer.setClearColor(currentColor);
    }
    
    // Fade out clouds as we get higher
    introSequence.cloudLayers.forEach(cloudLayer => {
        if (cloudLayer.material.uniforms) {
            const baseOpacity = 0.3;
            cloudLayer.material.uniforms.opacity.value = baseOpacity * (1 - progress);
        }
    });
    
    // Fade out atmosphere glow
    if (introSequence.atmosphereGlow) {
        introSequence.atmosphereGlow.material.opacity = 0.3 * (1 - progress);
    }
}

function applyUIShakeAndGlitch(launchProgress) {
    // Get ALL UI panels INCLUDING the title panel
    const allPanels = document.querySelectorAll('.ui-panel, .title-header');
    const shakeIntensity = Math.min(0.5, launchProgress * 1.0);
    
    allPanels.forEach((panel, index) => {
        // Store original computed transform ONCE
        if (!panel.dataset.originalTransform) {
            const computedStyle = getComputedStyle(panel);
            panel.dataset.originalBackdrop = computedStyle.backdropFilter || 'blur(10px)';
            panel.dataset.originalTransform = computedStyle.transform || 'none';
        }
        
        // Store original z-index to preserve layering
        const originalZIndex = panel.style.zIndex || getComputedStyle(panel).zIndex;
        
        // Apply shake
        const shakeX = (Math.random() - 0.5) * shakeIntensity * 4;
        const shakeY = (Math.random() - 0.5) * shakeIntensity * 3;
        const rotation = (Math.random() - 0.5) * shakeIntensity * 1;
        
        // Apply shake to ALL panels using their stored transforms
        const baseTransform = panel.dataset.originalTransform;
        if (baseTransform && baseTransform !== 'none') {
            panel.style.transform = `${baseTransform} translate(${shakeX}px, ${shakeY}px) rotate(${rotation}deg)`;
        } else {
            panel.style.transform = `translate(${shakeX}px, ${shakeY}px) rotate(${rotation}deg)`;
        }
        
        panel.style.zIndex = originalZIndex;
        panel.style.transformOrigin = 'center center';
        panel.style.backdropFilter = panel.dataset.originalBackdrop;
    });
    
    // Reset transforms after shake but keep effects
    setTimeout(() => {
        allPanels.forEach(panel => {
            const originalZIndex = panel.style.zIndex || getComputedStyle(panel).zIndex;
            const residualShakeX = (Math.random() - 0.5) * shakeIntensity * 1;
            const residualShakeY = (Math.random() - 0.5) * shakeIntensity * 0.75;
            
            // Restore base transform with residual shake
            const baseTransform = panel.dataset.originalTransform;
            if (baseTransform && baseTransform !== 'none') {
                panel.style.transform = `${baseTransform} translate(${residualShakeX}px, ${residualShakeY}px)`;
            } else {
                panel.style.transform = `translate(${residualShakeX}px, ${residualShakeY}px)`;
            }
            
            panel.style.zIndex = originalZIndex;
            panel.style.backdropFilter = panel.dataset.originalBackdrop;
        });
    }, 16);
}

function createLaunchRumble() {
    // Apply rumble to CANVAS ONLY, not the container that holds UI
    const gameCanvas = document.getElementById('gameCanvas') || renderer.domElement;
    if (gameCanvas) {
        gameCanvas.style.animation = 'launchRumble 3s ease-out';
        
        // Clear animation after it completes
        setTimeout(() => {
            if (gameCanvas) {
                gameCanvas.style.animation = '';
            }
        }, 3000);
        
        console.log('🎬 Launch rumble applied to canvas only (preserving UI z-index)');
    }
}

// =============================================================================
// FADE TRANSITION EFFECTS - FIXED TIMING
// =============================================================================

function createFadeToBlackDuringLaunch(fadeProgress) {
    // Create or update fade overlay during launch
    if (!introSequence.fadeOverlay) {
        introSequence.fadeOverlay = document.createElement('div');
        introSequence.fadeOverlay.id = 'introFadeOverlay';
        introSequence.fadeOverlay.className = 'absolute inset-0 bg-black pointer-events-none';
        introSequence.fadeOverlay.style.position = 'fixed';
        introSequence.fadeOverlay.style.top = '0';
        introSequence.fadeOverlay.style.left = '0';
        introSequence.fadeOverlay.style.width = '100%';
        introSequence.fadeOverlay.style.height = '100%';
        introSequence.fadeOverlay.style.zIndex = '60'; // Above everything except countdown (z-65)
        introSequence.fadeOverlay.style.opacity = '0';
        introSequence.fadeOverlay.style.backgroundColor = '#000000';
        document.body.appendChild(introSequence.fadeOverlay);
        console.log('🖤 Fade overlay created during launch at 50% progress');
    }
    
    // Fade to black over the second half of launch
    const opacity = Math.min(1, fadeProgress);
    introSequence.fadeOverlay.style.opacity = opacity.toString();
    
    if (fadeProgress >= 0.99) {
        console.log(`🖤 Fade to black complete: ${(opacity * 100).toFixed(0)}% - screen now fully black`);
    }
}

function createFadeFromBlack(progress) {
    // Fade from black to reveal the game
    if (!introSequence.fadeOverlay) {
        console.warn('⚠️ Fade overlay missing during fade from black!');
        return;
    }
    
    const opacity = Math.max(0, 1 - progress);
    introSequence.fadeOverlay.style.opacity = opacity.toString();
    
    // Log at key milestones
    if (progress === 0) {
        console.log('🌟 Starting fade from black (100% opacity)');
    } else if (progress >= 0.25 && progress < 0.26) {
        console.log('🌟 Fade from black: 25% - stars becoming visible');
    } else if (progress >= 0.5 && progress < 0.51) {
        console.log('🌟 Fade from black: 50% - game half visible');
    } else if (progress >= 0.75 && progress < 0.76) {
        console.log('🌟 Fade from black: 75% - almost complete');
    }
    
    // Remove overlay when fully faded in
    if (progress >= 1 && opacity <= 0) {
        console.log('🌟 Fade from black COMPLETE - removing overlay, game fully visible');
        introSequence.fadeOverlay.remove();
        introSequence.fadeOverlay = null;
    }
}

function setupNormalGameContent() {
    console.log('🌅 Setting up normal game content during fade...');

    // Drop the hero vista (and un-register its star from the corona ticker)
    // before the scene is wiped — otherwise scene.clear() detaches it while
    // updateStarCoronas() keeps animating it forever. Covers SKIP and DEMO,
    // which come straight here without going through the launch cut.
    disposeIntroVista();
    restoreIntroSkyObjects();

    // Clear the intro scene
    scene.clear();

    // Re-add basic lighting
    const ambientLight = new THREE.AmbientLight(0x333333, 0.4);
    scene.add(ambientLight);

    // CRITICAL: Re-add player ship after scene.clear() removed it
    if (typeof initCameraSystem === 'function' && window.gameCamera) {
        console.log('🚀 Re-initializing camera system after scene.clear()...');
        initCameraSystem(window.gameCamera, scene);
        console.log('✅ Player ship re-added to cleared scene');
        
        // CRITICAL: Start in zero-offset mode (ship hidden) for cinematic fade-in
        if (typeof cameraState !== 'undefined' && cameraState.playerShipMesh) {
            cameraState.mode = 'zero-offset';
            cameraState.playerShipMesh.visible = false;
            console.log('📷 Camera set to 0-person for cinematic opening');
        }
    }

    // Create normal game content - ADAPTED FOR SPHERICAL UNIVERSE
    if (typeof createOptimizedPlanets3D === 'function') {
        createOptimizedPlanets3D();
    }

    resetCameraToGamePosition();
    console.log('📍 Camera reset to game position');
    
    // CRITICAL: Initialize cosmic features
    if (typeof initializeCosmicFeatures === 'function') {
        initializeCosmicFeatures();
        console.log('🌌 Cosmic features initialized');
    }
    
    // ✅ ADD THIS RIGHT HERE:
    if (typeof createWarpSpeedStarfield === 'function') {
        createWarpSpeedStarfield();
        console.log('🚀 3D warp speed starfield created');
    }

    // Boss battle skybox (blood-red heartbeat dome, starts transparent).
    // Previously only created in the legacy startGame() fallback path, so
    // on every normal (intro) launch bossSkybox stayed null and the dome
    // never appeared during boss fights — same class of bug as the
    // exotic-system UFOs note below.
    if (typeof createBossBattleSkybox === 'function') {
        createBossBattleSkybox();
        console.log('🩸 Boss battle skybox created');
    }
    
    // CREATE OUTER INTERSTELLAR SYSTEMS
    if (typeof createOuterInterstellarSystems === 'function') {
        createOuterInterstellarSystems();
        console.log('Outer interstellar systems created');
        // Spawn UFOs in the exotic systems (this intro path never did
        // before, so exotic-system UFOs were absent on normal starts).
        if (typeof createUFOsInExoticSystems === 'function') {
            createUFOsInExoticSystems();
        }
        if (typeof loadUFOModel === 'function') { try { loadUFOModel(); } catch (e) {} }
    }

    // PROCEDURAL GALAXIES — seeded far-shell systems (80k-140k), generated
    // after the authored outer systems so it can register into `planets`
    // safely. The twin hook in game-core.js startGame() only covers the
    // legacy fallback path; this intro path is what a normal/demo launch
    // actually runs, so without this the feature never initialized.
    if (typeof initProcGalaxies === 'function') {
        try { initProcGalaxies(); } catch (e) { console.warn('Procedural galaxies init failed:', e); }
    }

    // Create nebulas (all 3 types)
    if (typeof createNebulas === 'function') {
        createNebulas();
        console.log('☁️ Nebulas created (8 galaxy-formation nebulas)');
    }
    
    // Create distant nebulas (50,000-75,000 units from origin)
    if (typeof createDistantNebulas === 'function') {
        createDistantNebulas();
        console.log('☁️ Distant nebulas created (6 nebulas at 50k-75k units)');
    }
    
    // Create exotic core nebulas (45,000-65,000 units from origin)
    if (typeof createExoticCoreNebulas === 'function') {
        createExoticCoreNebulas();
        console.log('☁️ Exotic core nebulas created (8 nebulas at 45k-65k units)');
    }
    
    // ⭐ ADD THIS NEW SECTION RIGHT HERE:
    // Create enhanced planet clusters in nebulas (with delay to ensure nebulas exist)
    setTimeout(() => {
        if (typeof createEnhancedPlanetClustersInNebulas === 'function') {
            console.log('🌟 Creating enhanced planet clusters within nebulas...');
            createEnhancedPlanetClustersInNebulas();
        } else {
            console.warn('⚠️ createEnhancedPlanetClustersInNebulas not found');
        }
    }, 1000);
    
    // Create asteroid belts
    if (typeof createAsteroidBelts === 'function') {
        createAsteroidBelts();
        console.log('☄️ Asteroid belts created');
    }

    if (typeof createInterstellarAsteroidFields === 'function') {
        createInterstellarAsteroidFields();
        console.log('🌌 Interstellar asteroid fields created');
    }

    // Giant dense breakable fields around a few galaxy cores (navigation
    // challenge during boss fights). Deferred so galaxy cores exist.
    if (typeof createDenseGalaxyAsteroidFields === 'function') {
        setTimeout(() => { try { createDenseGalaxyAsteroidFields(); } catch (e) {} }, 1500);
    }

    if (typeof createEnhancedComets === 'function') {
        createEnhancedComets();
        console.log('☄️ Comets created');
    }
    
    if (typeof createEnhancedWormholes === 'function') {
        createEnhancedWormholes();
        console.log('🌀 Wormholes created');
    }

    if (typeof createAmbientSpaceDebris === 'function') {
        createAmbientSpaceDebris();
        console.log('💫 Space debris created');
    }

    if (typeof createEnemies === 'function') {
        createEnemies();
        console.log('👾 Enemies created');
    }
    
	if (typeof spawnBlackHoleGuardians === 'function') {
        spawnBlackHoleGuardians();
        console.log('🛡️ Black Hole Guardians spawned');
	}
    
    // Initialize nebula intel system (links nebulas to enemy clusters)
    if (typeof initializeNebulaIntelSystem === 'function') {
        initializeNebulaIntelSystem();
        console.log('📡 Nebula intel system initialized');
    }
    
    // Create trading ships in nebulas
    if (typeof createTradingShipsInNebulas === 'function') {
        createTradingShipsInNebulas();
        console.log('🚀 Trading ships created in nebulas');
    }
    
    // Create ships in distant and exotic nebulas with mining routes
    if (typeof createShipsInDistantExoticNebulas === 'function') {
        createShipsInDistantExoticNebulas();
        console.log('🌌 Ships created in distant/exotic nebulas');
    }
    
    // Update clustered nebula mining ships with routes to core systems
    if (typeof updateClusteredMiningRoutes === 'function') {
        updateClusteredMiningRoutes();
        console.log('⛏️ Mining routes established for clustered nebula ships');
    }
    
    // Create civilian ships throughout the universe
    if (typeof createAllCivilianShips === 'function') {
        createAllCivilianShips();
        console.log('🌍 Civilian ships created throughout universe');
    }

    // Deploy ally wingmen
    if (typeof createAllyShips === 'function') {
        createAllyShips();
    }

    // Initialize game state for normal gameplay
    if (typeof gameState !== 'undefined') {
        gameState.gameStarted = true;
        // gameStartTime is NOT set here — it's set in startNormalGameplay()
        // after the cinematic transition completes so the 5-second combat
        // delay starts from when the player actually sees the ship.
        if (!gameState.velocityVector) {
            gameState.velocityVector = new THREE.Vector3(0, 0, 0);
        }
        // The intro set location to "Earth Surface - Launch Pad" for
        // the countdown. By the time we're here the player is in orbit
        // around Earth in the local Sol system — update the string so
        // the SHIP STATUS panel doesn't lie about it.
        gameState.location = 'Sol System — Sagittarius A Galaxy';
    }


    // START THE GAME ANIMATION LOOP during black screen for seamless transition
    if (typeof animate === 'function') {
        console.log('🎬 Starting game animation during black screen for seamless transition');
        animate(); // Start the normal game loop now
    }

    // AUTO-START DEMO AUTOPILOT if requested from launch screen.
    //
    // This used to fire on a bare 2 s timer from here — but here is still
    // deep inside the black-screen transition: the reveal fade doesn't even
    // BEGIN until ~1.5 s later and runs for a further 4 s, and on a loaded
    // scene the whole chain drifts to ~11 s. The autopilot therefore flew
    // its entire opening beat (undock, orient, first burn) behind a black
    // curtain, and the player's first sight of the demo was a ship already
    // mid-manoeuvre somewhere else.
    //
    // Instead we only ARM it here and let startNormalGameplay() — which runs
    // when the fade has actually finished — pull the trigger. The 2 s timer
    // survives as a safety net in case that path is ever skipped.
    if (window.demoModeRequested) {
        window.demoModeRequested = false;
        window.demoAutostartPending = true;
        setTimeout(() => {
            if (window.demoAutostartPending) {
                console.warn('🤖 Demo autostart fallback fired — reveal never completed');
                startDemoAutopilotNow();
            }
        }, 15000); // Safety net only; the reveal normally beats this easily.
    }

    // Debug beacons removed - nebulas now have proper fade-in visibility

    console.log('✨ Normal game content setup complete with ALL features including cosmic phenomena');
}
function fadeCountdownTextForGameTransition() {
    // Don't fade immediately - wait for game to be visible first
    setTimeout(() => {
        const timer = document.getElementById('countdownTimer');
        const status = document.getElementById('countdownStatus');
        const missionControl = document.getElementById('missionControl');
        const systemStatus = document.getElementById('systemStatus');
        
        if (timer && status) {
            timer.style.transition = 'opacity 3s ease';
            status.style.transition = 'opacity 3s ease';
            timer.style.opacity = '0';
            status.style.opacity = '0';
            
            console.log('🌅 Fading out "Orbiting Earth" text after game is visible');
        }
        
        // Also fade the mission control and system status text
        if (missionControl) {
            missionControl.style.transition = 'opacity 3s ease';
            missionControl.style.opacity = '0';
        }
        
        if (systemStatus) {
            systemStatus.style.transition = 'opacity 3s ease';
            systemStatus.style.opacity = '0';
        }
    }, 2000); // Wait 2 seconds after game fades in
}

function resetCameraToGamePosition() {
    // Position the player near Earth, looking at it, with an orbital
    // velocity so the game opens with a slow orbit around the home planet.
    const localSystemOffset = { x: 8000, y: 0, z: 4800 }; // 4x further from Sgr A* (origin) — keep in sync with game-objects.js
    if (typeof window !== 'undefined' && !window.localSystemOffset) window.localSystemOffset = localSystemOffset;
    const earthDistance = 640;    // Earth's orbit radius from sun (4x scaled)
    const earthOrbitOffset = 80;  // camera offset from Earth for a close fly-by
    // Earth starts at (sun.x + 640, sun.y, sun.z). Place camera just
    // behind Earth, 4x offset on Z so the orbital plane is easier to read.
    const earthX = localSystemOffset.x + earthDistance;
    const earthY = localSystemOffset.y;
    const earthZ = localSystemOffset.z;
    camera.position.set(earthX + earthOrbitOffset, earthY + 120, earthZ + earthOrbitOffset);
    // Open the game facing Sagittarius A* (galactic center at the origin)
    // so the player's first view is the heart of the Milky Way — Earth
    // and Sol still sit just behind/below the camera and are easy to
    // pivot back to. Looks more cinematic than staring at our home world.
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    // Reset camera rotation tracking
    if (typeof cameraRotation !== 'undefined') {
        cameraRotation = {
            x: camera.rotation.x,
            y: camera.rotation.y,
            z: camera.rotation.z
        };
    }

    // Give the ship a gentle orbital velocity tangent to Earth, so
    // the demo/player starts with a slow arc around the planet.
    if (typeof gameState !== 'undefined' && gameState.velocityVector) {
        const earthPos = new THREE.Vector3(earthX, earthY, earthZ);
        const toEarth = new THREE.Vector3().subVectors(earthPos, camera.position).normalize();
        const orbitalDir = new THREE.Vector3(-toEarth.z, 0, toEarth.x).normalize();
        gameState.velocityVector = orbitalDir.multiplyScalar(gameState.minVelocity || 0.2);
    }

    // Start the player with an empty Navigation target so they make
    // their own first targeting choice rather than auto-flying back to
    // Earth. Just refresh the target list so the panel is ready.
    if (typeof gameState !== 'undefined') {
        gameState.currentTarget = null;
        gameState.autoNavigating = false;
        gameState.autoNavOrienting = false;
        if (typeof populateTargets === 'function') populateTargets();
        if (typeof updateUI === 'function') updateUI();
    }

    console.log('📍 Camera set to orbit Earth in Sol System (no auto-nav target)');
}

function fadeOutIntroElements(progress) {
    // Fade out countdown overlay
    const overlay = document.getElementById('introCountdownOverlay');
    if (overlay) {
        overlay.style.opacity = (1 - progress).toString();
    }
}

// =============================================================================
// CLEANUP AND GAME START
// =============================================================================

function skipIntroSequence() {
    console.log('⏭️ Skipping intro sequence with proper game transition');

    // IMMEDIATELY remove skip button to prevent double-clicks/glitches
    if (introSequence.skipButton) {
        introSequence.skipButton.remove();
        introSequence.skipButton = null;
        console.log('🗑️ Skip button removed immediately to prevent glitches');
    }

    // IMMEDIATELY remove demo button too
    if (introSequence.demoButton) {
        introSequence.demoButton.remove();
        introSequence.demoButton = null;
        console.log('🗑️ Demo button removed on skip');
    }
    // Also check by ID in case the reference was lost
    const demoEl = document.getElementById('introDemoBtn');
    if (demoEl) demoEl.remove();
    
    // DON'T remove start button yet - let it fade with the black overlay
    // It will be removed when the black overlay covers it
    
    // Stop intro animation loop immediately
    introSequence.active = false;
    
    // Initialize audio systems (since we're skipping user interaction)
    if (typeof initAudio === 'function') {
        initAudio();
        console.log('🔊 Audio system initialized during skip');
    }
    
    if (typeof resumeAudioContext === 'function') {
        resumeAudioContext();
        console.log('🔊 Audio context resumed during skip');
    }
    
    // START BACKGROUND MUSIC (FIXED: was missing!)
    if (typeof startBackgroundMusic === 'function') {
        setTimeout(() => {
            startBackgroundMusic();
            console.log('🎵 Background music started after skip intro');
        }, 500);
    }
    
    // Create black overlay that fades to black over 1.2s
    createSkipSceneFade();
    
    // WAIT for fade to black to complete (1.2s) BEFORE setting up 3D scene
    setTimeout(() => {
        console.log('⚫ Fade to black complete - NOW setting up 3D scene');
        
        // Fade out launch button slowly before removing it
        if (introSequence.startButton) {
            introSequence.startButton.style.transition = 'opacity 1.5s ease-out';
            introSequence.startButton.style.opacity = '0';
            setTimeout(() => {
                if (introSequence.startButton) {
                    introSequence.startButton.remove();
                    introSequence.startButton = null;
                    console.log('🗑️ Launch button removed during black screen');
                }
            }, 1500);
        }
        
        // NOW set up game content while screen is black
        setupNormalGameContent();
        console.log('🌌 Game content setup complete, animation running during black screen');
        
        // Create orbit lines while screen is still black
        if (typeof createOrbitLines === 'function') {
            createOrbitLines();
            console.log('🛸 Orbit lines created during black screen');
        }
        
        // Wait for game to fully initialize, then fade in the 3D scene
        setTimeout(() => {
            revealGameScene();
        }, 1500); // Give game content time to settle
        
    }, 1300); // Wait 1300ms (slightly longer than 1.2s fade) before starting setup
}

function createSkipSceneFade() {
    // Create fade overlay that covers ONLY the 3D scene, not UI
    const sceneFadeOverlay = document.createElement('div');
    sceneFadeOverlay.id = 'skipSceneFade';
    sceneFadeOverlay.className = 'absolute inset-0 bg-black pointer-events-none';
    sceneFadeOverlay.style.zIndex = '25'; // Above 3D scene (z-20) but below UI (z-50+)
    sceneFadeOverlay.style.opacity = '0';
    sceneFadeOverlay.style.transition = 'opacity 1.2s ease-out';
    document.body.appendChild(sceneFadeOverlay);
    
    // Trigger fade to black immediately
    requestAnimationFrame(() => {
        sceneFadeOverlay.style.opacity = '1';
        console.log('⚫ Skip intro: Scene fading to black (1.2s)');
    });
    
    // Store reference for later removal
    window.skipSceneFade = sceneFadeOverlay;
}

function revealGameScene() {
    const sceneFadeOverlay = window.skipSceneFade;
    if (!sceneFadeOverlay) {
        console.error('Skip scene fade overlay not found');
        completeSkipTransition();
        return;
    }
    
    // Wait longer before starting fade up to ensure everything is ready
    setTimeout(() => {
        // Start slower fade from black to reveal the running game with orbit lines
        sceneFadeOverlay.style.transition = 'opacity 4.0s ease-in'; // Even slower fade up
        sceneFadeOverlay.style.opacity = '0';
        
        console.log('🌟 Skip intro: Slowly revealing running 3D environment with orbit lines (Launch button already gone)');
        
        // Remove overlay after fade completes
        setTimeout(() => {
            sceneFadeOverlay.remove();
            window.skipSceneFade = null;
            completeSkipTransition();
        }, 4000); // Match the longer fade duration
    }, 800); // Longer delay before starting fade up
}

function completeSkipTransition() {
    console.log('✅ Skip intro transition complete - 3D environment running');
    
    // Clean up intro elements (but preserve game content)
    cleanupIntroElementsOnly();
    
    // Mark intro as played
    markIntroAsPlayed();
    
    // Remove intro active class
    document.body.classList.remove('intro-active');
    
    // Finalize normal gameplay
    startNormalGameplay();
}

function cleanupIntroElementsOnly() {
    // Remove intro-specific visual elements from scene
    if (introSequence.skyDome) {
        scene.remove(introSequence.skyDome);
        introSequence.skyDome.material.dispose();
        introSequence.skyDome.geometry.dispose();
        introSequence.skyDome = null;
    }
    
    // Remove intro overlays but preserve game content
    const fadeOverlay = document.getElementById('introFadeOverlay');
    if (fadeOverlay) {
        fadeOverlay.remove();
    }
    
    // querySelectorAll, not getElementById: older boots could leave more than
    // one overlay behind, and a survivor keeps a 9999-z-index sheet (with live
    // "LAUNCH SEQUENCE INITIATED" text) parked on top of the running game.
    document.querySelectorAll('#introCountdownOverlay').forEach((el) => el.remove());
    
    const atmosphereFade = document.getElementById('atmosphereFadeOverlay');
    if (atmosphereFade) {
        atmosphereFade.remove();
    }
    
    // Remove intro buttons (if not already removed)
    if (introSequence.startButton) {
        introSequence.startButton.remove();
        introSequence.startButton = null;
    }

    if (introSequence.skipButton) {
        introSequence.skipButton.remove();
        introSequence.skipButton = null;
    }
    // Note: Skip button should already be removed in skipIntroSequence()
    
    // Reset intro sequence state
    introSequence.active = false;
    introSequence.phase = 'complete';
    introSequence.gameSetupStarted = false;
    introSequence.launched = false;
    
    // Stop title flashing
    stopTitleFlashing();
    
    console.log('🧹 Intro-only elements cleaned up (game content preserved)');
}

function cleanupIntroElements() {
    // Remove skip scene fade overlay if it exists
    const skipSceneFade = document.getElementById('skipSceneFade');
    if (skipSceneFade) {
        skipSceneFade.remove();
    }
    // Remove intro-specific visual elements
    if (introSequence.skyDome) {
        scene.remove(introSequence.skyDome);
        introSequence.skyDome.material.dispose();
        introSequence.skyDome.geometry.dispose();
        introSequence.skyDome = null;
    }
    
    // Force remove fade overlay if it still exists
    if (introSequence.fadeOverlay) {
        console.log('🧹 Force removing fade overlay during cleanup');
        introSequence.fadeOverlay.remove();
        introSequence.fadeOverlay = null;
    }
    
    // Remove any remaining intro overlays by ID
    const fadeOverlay = document.getElementById('introFadeOverlay');
    if (fadeOverlay) {
        console.log('🧹 Removing fade overlay by ID');
        fadeOverlay.remove();
    }
    
    // Also reset all text elements to clear any text scrambling
    const allTextElements = document.querySelectorAll('.ui-panel div, .ui-panel span, .ui-panel p');
    allTextElements.forEach(el => {
        // Clear any lingering text effects
        el.style.filter = '';
        el.style.animation = '';
    });
    
    introSequence.cloudLayers.forEach(cloud => {
        scene.remove(cloud);
        if (cloud.material) cloud.material.dispose();
        if (cloud.geometry) cloud.geometry.dispose();
    });
    introSequence.cloudLayers = [];
    
    if (introSequence.atmosphereGlow) {
        scene.remove(introSequence.atmosphereGlow);
        introSequence.atmosphereGlow.material.dispose();
        introSequence.atmosphereGlow.geometry.dispose();
        introSequence.atmosphereGlow = null;
    }
    
    // Remove UI overlays
    const overlay = document.getElementById('introCountdownOverlay');
    if (overlay) {
        console.log('🧹 Removing countdown overlay');
        overlay.remove();
    }
    
    if (introSequence.skipButton) {
        introSequence.skipButton.remove();
    }
    
    // Remove start button if it still exists
    if (introSequence.startButton) {
        introSequence.startButton.remove();
    }
    
    // Show crosshair for normal gameplay
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        console.log('🎯 Showing crosshair for normal gameplay');
        crosshair.style.display = 'block';
        crosshair.style.opacity = '1';
    }
    
    // Restore UI blur effects
    restoreUIBlurEffects();
    
    // ⭐ CRITICAL FIX: Restore achievement popup WITHOUT inline display style
    const achievementPopup = document.getElementById('achievementPopup');
    if (achievementPopup) {
        // Clear ALL inline styles that could interfere
        achievementPopup.style.display = '';  // ⭐ Clear inline style completely
        achievementPopup.style.visibility = '';
        achievementPopup.style.opacity = '';
        // Start hidden, let showAchievement() control visibility via class
        achievementPopup.classList.add('hidden');
        console.log('✅ Achievement popup restored and ready for display');
    }
    
    // Re-enable tutorial system
    if (typeof tutorialSystem !== 'undefined') {
        tutorialSystem.introActive = false;
    }
    
    // Reset renderer clear color
    renderer.setClearColor(0x000003); //dark blue used to be (0x000011)
    
    // Reset intro state
    introSequence.active = false;
    introSequence.gameSetupStarted = false;
    introSequence.launched = false;
    
    // ADD THIS: Stop title flashing when intro ends
    stopTitleFlashing();
    
    console.log('🧹 Intro elements cleaned up');
}

function restoreUIBlurEffects() {
    // Restore backdrop blur to UI panels after intro, but NOT the title-header
    const uiPanels = document.querySelectorAll('.ui-panel');
    uiPanels.forEach(panel => {
        panel.style.backdropFilter = 'blur(2px)';
        panel.style.background = 'linear-gradient(135deg, rgba(15, 23, 42, 0.3) 0%, rgba(30, 41, 59, 0.3) 100%)';
    });
}

function startNormalGameplay() {
    console.log('🎬 Finalizing normal gameplay start...');

    // Reset gameStartTime here — the player can now actually see and
    // control the ship. Combat starts 5s from THIS moment, not from
    // when the cinematic transition began.
    if (typeof gameState !== 'undefined') {
        gameState.gameStartTime = Date.now();
        console.log('⏱️ gameStartTime reset to NOW — combat begins in 5s');
    }

    // Show crosshair for normal gameplay
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        console.log('🎯 Making crosshair visible for gameplay');
        crosshair.style.display = 'block';
        crosshair.style.opacity = '1';
        crosshair.style.visibility = 'visible';
    }
    
    // Ensure any remaining fade overlays are gone
    const remainingOverlay = document.getElementById('introFadeOverlay');
    if (remainingOverlay) {
        console.log('🧹 Removing remaining fade overlay in startNormalGameplay');
        remainingOverlay.remove();
    }
    
    // Game content is already set up during transition phase
    // Just need to initialize controls and UI systems
    
    // Initialize controls and UI
    if (typeof setupEnhancedEventListeners === 'function') {
        setupEnhancedEventListeners();
    }
    
    if (typeof updateUI === 'function') {
        updateUI();
    }
    
    if (typeof populateTargets === 'function') {
        populateTargets();
    }
    
    if (typeof setupGalaxyMap === 'function') {
        setupGalaxyMap();
    }
    
    // ⭐ NEW: Update galaxy map to show initial location
    if (typeof updateGalaxyMap === 'function') {
        setTimeout(() => {
            updateGalaxyMap();
            console.log('🗺️ Initial galaxy location updated');
        }, 500); // Small delay to ensure camera position is set
    }
    
    // Start normal animation loop if not already running
    if (typeof animate === 'function') {
        animate();
    }
    
    // DEMO MODE: the screen is now genuinely visible, so this is the moment
    // the autopilot showcase should begin — not back during the black screen.
    // Fire it before the cinematic opening below, which we then skip: the
    // 0-person beat hides the ship, and the autopilot immediately forces
    // third-person, so running both made the ship blink out and snap back a
    // few seconds into the demo.
    if (window.demoAutostartPending) {
        // Put the camera where the autopilot expects it, in one step, rather
        // than letting it discover a hidden ship on its first frame.
        if (typeof cameraState !== 'undefined' && cameraState.playerShipMesh) {
            cameraState.playerShipMesh.visible = true;
            cameraState.mode = 'third-person';
            cameraState.isTransitioning = false;
        }
        startDemoAutopilotNow();
        console.log('🎬 Demo mode — skipping the 0-person cinematic opening and tutorial');
        return;
    }

    // ✨ CINEMATIC OPENING: Start in 0-person, transition to 3rd person, then tutorial
    console.log('🎬 Starting cinematic opening sequence...');

    // Step 1: Start in zero-offset (0-person) view - no ship visible
    if (typeof cameraState !== 'undefined' && cameraState.playerShipMesh) {
        cameraState.mode = 'zero-offset';
        cameraState.playerShipMesh.visible = false;
        console.log('📷 Starting in 0-person POV');
    }

    // Step 2: After 2 seconds, do slow cinematic transition to 3rd person
    setTimeout(() => {
        console.log('📷 Beginning cinematic transition to 3rd person...');
        if (typeof cameraState !== 'undefined' && cameraState.playerShipMesh) {
            // Show ship and start slow transition
            cameraState.playerShipMesh.visible = true;
            cameraState.mode = 'third-person';
            cameraState.isTransitioning = true;
            cameraState.transitionStartTime = performance.now();
            cameraState.transitionDuration = 2000;  // Slow 2-second cinematic transition
            cameraState.transitionStartOffset = new THREE.Vector3(0.25, -1, 3);  // From behind camera
            cameraState.transitionTargetOffset = cameraState.normalThirdPersonOffset.clone();
        }
    }, 2000);

    // Step 3: Start tutorial after cinematic transition completes
    if (typeof startTutorial === 'function') {
        setTimeout(startTutorial, 4500);  // 2s wait + 2s transition + 0.5s settle
    }

    console.log('🎬 Normal gameplay fully active - cinematic opening in progress');
}

// Single entry point for kicking the demo autopilot off, so the reveal-driven
// path and the safety-net timer can't both start it.
function startDemoAutopilotNow() {
    if (!window.demoAutostartPending) return;
    window.demoAutostartPending = false;
    if (window.demoPilot && typeof window.demoPilot.start === 'function') {
        console.log('🤖 Auto-starting demo autopilot (scene fully revealed)');
        window.demoPilot.start();
    }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Easing functions for smooth animations
function easeOutQuart(x) {
    return 1 - Math.pow(1 - x, 4);
}

function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// =============================================================================
// CYBERPUNK SYNTH-WAVE INTRO SOUNDS
// =============================================================================

// Shared gain node for countdown tones — created once and reused.
// Oscillators must still be new each call (Web Audio spec: can't restart
// a stopped oscillator), but the gain+destination wiring is pre-built.
let _countdownGain = null;
function _getCountdownGain() {
    if (_countdownGain && _countdownGain.context.state !== 'closed') return _countdownGain;
    _countdownGain = audioContext.createGain();
    _countdownGain.connect(audioContext.destination);
    return _countdownGain;
}

// Custom countdown tone - clean futuristic beep
function playCountdownTone(number) {
    if (!audioContext || audioContext.state === 'suspended') return;

    try {
        const gain = _getCountdownGain();
        const oscillator = audioContext.createOscillator();
        oscillator.connect(gain);

        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
        oscillator.type = 'sine';

        const beepDuration = 0.1;
        gain.gain.setValueAtTime(0.15, audioContext.currentTime);
        gain.gain.setValueAtTime(0.15, audioContext.currentTime + beepDuration - 0.01);
        gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + beepDuration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + beepDuration);
    } catch (e) {
        console.warn('Countdown tone error:', e);
    }
}

function playCountdownBeep(number) {
    if (!audioContext || audioContext.state === 'suspended') return;
    
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    // Higher pitch for lower numbers (building tension)
    const frequency = 400 + (10 - number) * 100; // 400Hz to 1300Hz
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    
    // Cyberpunk filter sweep
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency * 4, audioContext.currentTime);
    filter.Q.setValueAtTime(5, audioContext.currentTime);
    
    // Sharp attack, quick decay - QUIETER
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.01); // QUIETER: was 0.3
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
    
    oscillator.type = 'sawtooth'; // Classic synth-wave sound
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

function playBlastOffSound() {
    if (!audioContext || audioContext.state === 'suspended') return;
    
    // Low frequency rumble
    const rumbleOsc = audioContext.createOscillator();
    const rumbleGain = audioContext.createGain();
    rumbleOsc.connect(rumbleGain);
    rumbleGain.connect(typeof masterGain !== 'undefined' && masterGain ? masterGain : audioContext.destination);
    
    rumbleOsc.type = 'sawtooth';
    rumbleOsc.frequency.setValueAtTime(40, audioContext.currentTime);
    rumbleOsc.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 2);
    
    rumbleGain.gain.setValueAtTime(0, audioContext.currentTime);
    rumbleGain.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.1);
    rumbleGain.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 3);
    
    // High frequency synth blast
    const blastOsc = audioContext.createOscillator();
    const blastGain = audioContext.createGain();
    const blastFilter = audioContext.createBiquadFilter();
    
    blastOsc.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(typeof masterGain !== 'undefined' && masterGain ? masterGain : audioContext.destination);

    blastOsc.type = 'square';
    blastOsc.frequency.setValueAtTime(1200, audioContext.currentTime);
    blastOsc.frequency.exponentialRampToValueAtTime(2400, audioContext.currentTime + 0.5);
    blastOsc.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 2);
    
    blastFilter.type = 'bandpass';
    blastFilter.frequency.setValueAtTime(1200, audioContext.currentTime);
    blastFilter.Q.setValueAtTime(8, audioContext.currentTime);
    
    blastGain.gain.setValueAtTime(0, audioContext.currentTime);
    blastGain.gain.linearRampToValueAtTime(0.25, audioContext.currentTime + 0.05);
    blastGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 2);
    
    const startTime = audioContext.currentTime;
    rumbleOsc.start(startTime);
    blastOsc.start(startTime);
    rumbleOsc.stop(startTime + 3);
    blastOsc.stop(startTime + 2);
}

function playLaunchRumbleSound() {
    if (!audioContext || audioContext.state === 'suspended') return;
    
    // Create multiple oscillators for rich rumble with longer duration
    for (let i = 0; i < 3; i++) {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(typeof masterGain !== 'undefined' && masterGain ? masterGain : audioContext.destination);

        // Different frequencies for each layer
        const baseFreq = 30 + i * 15; // 30Hz, 45Hz, 60Hz
        osc.frequency.setValueAtTime(baseFreq, audioContext.currentTime);
        
        // Random modulation for rumble effect over longer duration
        osc.frequency.linearRampToValueAtTime(baseFreq * (1 + Math.random() * 0.5), audioContext.currentTime + 1);
        osc.frequency.linearRampToValueAtTime(baseFreq * (1 + Math.random() * 0.3), audioContext.currentTime + 3);
        osc.frequency.linearRampToValueAtTime(baseFreq * (1 + Math.random() * 0.2), audioContext.currentTime + 5);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(baseFreq * 4, audioContext.currentTime);
        
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(0, audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(0.20 - i * 0.03, audioContext.currentTime + 0.1); // QUIETER: was 0.35
        gain.gain.linearRampToValueAtTime(0.15 - i * 0.025, audioContext.currentTime + 2); // QUIETER: was 0.25
        gain.gain.linearRampToValueAtTime(0.10 - i * 0.02, audioContext.currentTime + 4); // QUIETER: was 0.15
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 6);
        
        const startTime = audioContext.currentTime;
        osc.start(startTime);
        osc.stop(startTime + 6); // Extended to 6 seconds
    }
}

function playCyberpunkAtmosphereSound() {
    if (!audioContext || audioContext.state === 'suspended') return;
    
    // Ambient atmospheric pad
    const padOsc = audioContext.createOscillator();
    const padGain = audioContext.createGain();
    const padFilter = audioContext.createBiquadFilter();
    
    padOsc.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(audioContext.destination);
    
    padOsc.type = 'triangle';
    padOsc.frequency.setValueAtTime(110, audioContext.currentTime); // Low A
    
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(800, audioContext.currentTime);
    padFilter.Q.setValueAtTime(3, audioContext.currentTime);
    
    // Slow filter sweep
    padFilter.frequency.linearRampToValueAtTime(400, audioContext.currentTime + 5);
    padFilter.frequency.linearRampToValueAtTime(1200, audioContext.currentTime + 10);
    
    padGain.gain.setValueAtTime(0, audioContext.currentTime);
    padGain.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + 2);
    padGain.gain.linearRampToValueAtTime(0.05, audioContext.currentTime + 8);
    padGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 10);
    
    const startTime = audioContext.currentTime;
    padOsc.start(startTime);
    padOsc.stop(startTime + 10);
}

// =============================================================================
// CSS STYLES
// =============================================================================

const introStyles = document.createElement('style');
introStyles.textContent = `
    /* =============================================================================
       Z-INDEX HIERARCHY - CRITICAL for proper layering
       ============================================================================= */
    .ui-panel {
        z-index: 600 !important;
    }
    
    .title-header {
        position: fixed !important;
    backdrop-filter: blur(2px);
    left: 50% !important;
    top: 1rem !important;
    transform-origin: center center;
	transform: translateX(-50%) perspective(1000px) rotateX(2deg) translateZ(8px);
    border-radius: 25px;
    box-shadow: 
        0 20px 60px rgba(0, 150, 255, 0.5),
        inset 0 2px 15px rgba(0,150,255,0.3),
        inset 0 -2px 15px rgba(0,150,255,0.2);
    min-width: 300px;
    z-index: 900 !important;
    transform-style: preserve-3d;
    }
    
    body.intro-active .title-header {
    transform-origin: center center;
	transform: translateX(-50%) perspective(1000px) rotateX(2deg) translateZ(8px);
    }
    
    /* Mobile-only styling for Skip Intro button */
    @media (max-width: 768px), (max-width: 1024px) and (hover: none) {
        #skipIntroBtn {
            z-index: 80 !important;
            background: rgba(0, 0, 0, 0.7) !important;
            border: 1px solid rgba(0, 255, 255, 0.4) !important;
            border-radius: 4px !important;
            color: #00ffff !important;
            font-family: 'Orbitron', monospace !important;
            font-weight: 600 !important;
            transition: all 0.2s ease !important;
            transform: translateX(-50%) !important;
            box-shadow: 0 0 10px rgba(0, 255, 255, 0.3), inset 0 0 10px rgba(0, 255, 255, 0.1) !important;
        }

        #skipIntroBtn:hover,
        #skipIntroBtn:active {
            background: rgba(0, 255, 255, 0.2) !important;
            box-shadow: 0 0 15px rgba(0, 255, 255, 0.5), inset 0 0 15px rgba(0, 255, 255, 0.2) !important;
            transform: translateX(-50%) scale(1.05) !important;
        }
    }
    
    /* Overlays - Higher z-index than fade overlay */
    #introCountdownOverlay {
        z-index: 65 !important;
        background: radial-gradient(ellipse at center, rgba(0,20,40,0.3) 0%, rgba(0,0,0,0.7) 100%);
    }
    
    #atmosphereFadeOverlay {
        z-index: 20 !important;
    }
    
    #introFadeOverlay {
        z-index: 30 !important;
    }
    
    /* =============================================================================
       LAUNCH RUMBLE FIX - Force UI above animated gameContainer
       ============================================================================= */
    
    /* CRITICAL: When gameContainer animates, force UI above it */
    #gameContainer[style*="animation"] .ui-panel {
        position: fixed 
        z-index: 9999 !important;
    }
    
    #gameContainer[style*="animation"] .title-header {
        position: fixed 
        left: 50% !important;
        transform-origin: center center;
		transform: translateX(-50%) perspective(1000px) rotateX(2deg) translateZ(8px);
        z-index: 9999 !important;
    }
    
    /* Alternative: Move UI outside gameContainer during rumble */
    body.intro-active.launch-phase .ui-panel {
        position: fixed 
        z-index: 9999 !important;
    }
    
    body.intro-active.launch-phase .title-header {
    position: fixed;
    left: 50% !important;
    transform-origin: center center;
	transform: translateX(-50%) perspective(1000px) rotateX(2deg) translateZ(8px);
    z-index: 9999 !important;
}
    
    /* =============================================================================
       CURSOR CONTROL
       ============================================================================= */
    body.intro-active {
        cursor: auto !important;
    }
    
    body.intro-active * {
        cursor: auto !important;
    }
    
    body.intro-active #gameCanvas {
        cursor: auto !important;
    }
    
    /* =============================================================================
       START BUTTON STYLING
       ============================================================================= */
    .intro-start-btn {
        background: linear-gradient(135deg, rgba(0,255,150,0.2), rgba(0,200,255,0.3));
        border: 3px solid rgba(0,255,150,0.8);
        border-radius: 15px;
        padding: 20px 40px;
        cursor: auto;
        transition: all 0.3s ease;
        animation: startButtonFlash 1.5s ease-in-out infinite;
        box-shadow: 
            0 0 30px rgba(0,255,150,0.5),
            inset 0 0 20px rgba(0,255,150,0.1);
    }
    
    .intro-start-btn:hover {
        transform: translate(-50%, -50%) scale(1.05);
        border-color: rgba(0,255,200,1);
        box-shadow: 
            0 0 50px rgba(0,255,150,0.8),
            inset 0 0 30px rgba(0,255,150,0.2);
        animation-duration: 0.8s;
    }
    
    .start-btn-content {
        text-align: center;
        color: white;
        font-family: 'Orbitron', monospace;
    }
    
    .start-btn-icon {
        font-size: 2.5rem;
        margin-bottom: 10px;
        animation: rocketPulse 2s ease-in-out infinite;
        text-shadow: 0 0 10px rgba(255,255,255,0.8);
    }
    
    .start-btn-text {
        font-size: 1.2rem;
        font-weight: bold;
        text-shadow: 0 0 10px rgba(0,255,150,0.8);
        margin-bottom: 5px;
    }
    
    .start-btn-subtext {
        font-size: 0.8rem;
        opacity: 0.8;
        text-shadow: 0 0 5px rgba(0,255,150,0.6);
    }
    
    /* =============================================================================
       MISSION CONTROL TEXT EFFECTS
       ============================================================================= */
    #missionControl {
        font-family: 'Share Tech Mono', monospace !important;
        color: #00ff88 !important;
        text-shadow: 0 0 8px rgba(0,255,136,0.6), 0 0 16px rgba(0,255,136,0.3) !important;
        animation: textFlicker 3s ease-in-out infinite;
    }
    
    #systemStatus {
        font-family: 'Share Tech Mono', monospace !important;
        animation: statusPulse 2s ease-in-out infinite;
    }
    
    /* =============================================================================
       ANIMATIONS
       ============================================================================= */
    @keyframes launchFlare {
        0% { 
            opacity: 0.8;
            transform: translateX(-50%) scaleY(1);
        }
        50% {
            opacity: 1;
            transform: translateX(-50%) scaleY(2);
        }
        100% { 
            opacity: 0;
            transform: translateX(-50%) scaleY(0.5);
        }
    }
    
    @keyframes startButtonFlash {
        0%, 50% { 
            border-color: rgba(0,255,150,0.8);
            box-shadow: 
                0 0 30px rgba(0,255,150,0.5),
                inset 0 0 20px rgba(0,255,150,0.1);
        }
        75%, 100% { 
            border-color: rgba(0,255,200,1);
            box-shadow: 
                0 0 40px rgba(0,255,150,0.8),
                inset 0 0 25px rgba(0,255,150,0.2);
        }
    }
    
    @keyframes launchRumble {
        0% { transform: translate(0); }
        5% { transform: translate(-2px, -2px); }
        10% { transform: translate(2px, -2px); }
        15% { transform: translate(-2px, 2px); }
        20% { transform: translate(2px, 2px); }
        25% { transform: translate(-1px, -1px); }
        30% { transform: translate(1px, -1px); }
        35% { transform: translate(-1px, 1px); }
        40% { transform: translate(1px, 1px); }
        45% { transform: translate(-0.5px, -0.5px); }
        50% { transform: translate(0.5px, -0.5px); }
        55% { transform: translate(-0.5px, 0.5px); }
        60% { transform: translate(0.5px, 0.5px); }
        65% { transform: translate(-0.2px, -0.2px); }
        70% { transform: translate(0.2px, -0.2px); }
        75% { transform: translate(-0.2px, 0.2px); }
        80% { transform: translate(0.2px, 0.2px); }
        85% { transform: translate(-0.1px, -0.1px); }
        90% { transform: translate(0.1px, -0.1px); }
        95% { transform: translate(-0.1px, 0.1px); }
        100% { transform: translate(0); }
    }
    
    @keyframes textFlicker {
        0%, 98% { opacity: 1; }
        99% { opacity: 0.8; }
        100% { opacity: 1; }
    }
    
    @keyframes statusPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
    }

    /* =============================================================================
       TITLE-CARD RETIREMENT — the intro's branding must not outlive the intro.
       The "INTERSTELLAR SLINGSHOT / A Gravitational Space Explorer by ChiLab"
       header (index.html .ui-panel.title-header) is a launch-screen title card,
       but nothing ever took it down: it stayed pinned dead-centre-top through
       Sol combat, the nebula run, warps and boss fights. Worse, during a
       slingshot/emergency-warp the geometric HUD yield pins EVERY .ui-panel to
       opacity: 1 !important (css/styles.css :root.hud-geo-yield) while
       collapsing their content — so every readout politely shrank out of the
       money shot and the one panel with nothing to collapse, the title card,
       became the single brightest thing on screen during the spectacle.

       body.gameplay-live (stamped by the watcher below once the player is
       actually flying) fades it out for good. Two knock-on wins: an
       opacity-0 panel is skipped by arcade.js _liveHudRects() call-out
       fitter, so the top-centre praise corridor opens back up; and the
       specificity here (0,3,1) beats :root.hud-geo-yield .ui-panel (0,3,0),
       so the spectacle yield can no longer resurrect it.
       ============================================================================= */
    .ui-panel.title-header {
        transition: opacity 1.6s ease;
    }
    body.gameplay-live .ui-panel.title-header {
        opacity: 0 !important;
        pointer-events: none !important;
    }

    /* The collapsed flight-controls stub ("? for controls", injected by
       game-ui.js _updateFlightControlsCollapse) is reference chrome, not a
       live readout — once the player is flying it should recede to a ghost
       and only come back when they actually go looking for it. The top-left
       panel keeps its Music/SFX/Skip/3D/Pause row, so there is always a
       hover target in that corner; hovering (or focusing) restores the hint
       to full strength and it stays clickable throughout, which is the only
       way back to the key list. */
    body.gameplay-live .ui-panel.top-left.controls-collapsed .hud-controls-hint {
        opacity: 0.12;
        transition: opacity 0.45s ease;
    }
    body.gameplay-live .ui-panel.top-left.controls-collapsed:hover .hud-controls-hint,
    body.gameplay-live .ui-panel.top-left.controls-collapsed:focus-within .hud-controls-hint,
    body.gameplay-live .ui-panel.top-left.controls-collapsed .hud-controls-hint:hover {
        opacity: 1;
    }
`;

document.head.appendChild(introStyles);

// =============================================================================
// GAMEPLAY-LIVE WATCHER
// =============================================================================
// One job: decide when "the intro is over and the player is flying", and
// stamp/clear `body.gameplay-live` so the CSS above can retire the intro's
// leftover chrome. gameStartTime is the honest marker — startNormalGameplay()
// (above) sets it at the exact moment the cinematic fade ends and the ship
// becomes controllable, and game-core.js's fallback path sets it the same
// way. The 5s grace matches the game's own combat-start delay, so the title
// card gets a last beat over the revealed starfield and is gone by the time
// the first hostile is live — the branding exits on the cut into combat
// instead of sitting through it.
(function _watchGameplayLive() {
    const RETIRE_DELAY_MS = 5000;

    function tick() {
        try {
            if (typeof document === 'undefined' || !document.body) return;
            const body = document.body;

            // A genuine return to the launch screen is the ONLY thing that
            // brings the title card back — the intro re-adds `intro-active`
            // before it re-shows the header, and a restart drops
            // gameStartTime. Deliberately NOT keyed on gameState.gameStarted:
            // showGameOverScreen()/showVictoryScreen() (js/game-ui.js:3380,
            // :3446) clear that flag, and fading the branding back in behind
            // a MISSION FAILED card just puts the clutter back at the worst
            // possible moment.
            if (body.classList.contains('intro-active') ||
                typeof gameState === 'undefined' || !gameState.gameStartTime) {
                body.classList.remove('gameplay-live');
                return;
            }
            // Latch on once the player has actually been flying for the
            // grace period; nothing mid-run un-latches it.
            if (gameState.gameStarted &&
                (Date.now() - gameState.gameStartTime) >= RETIRE_DELAY_MS) {
                body.classList.add('gameplay-live');
            }
        } catch (e) { /* never let HUD chrome break the frame */ }
    }

    if (typeof window !== 'undefined') {
        window._updateGameplayLiveChrome = tick;
        setInterval(tick, 400);
    }
})();

// =============================================================================
// WINDOW EXPORTS
// =============================================================================

if (typeof window !== 'undefined') {
    window.startGameWithIntro = startGameWithIntro;
    window.skipIntroSequence = skipIntroSequence;
    window.introSequence = introSequence;
    window.resetIntroState = resetIntroState;
    
    console.log('🚀 Game intro system loaded - Spherical Universe Edition');
}

console.log('Game intro sequence system loaded successfully!')
