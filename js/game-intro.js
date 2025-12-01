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

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

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

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
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
        
        // Enable scene visuals now (but they'll fade in gradually)
        revealIntroScene();
        
        // Start gradual background fade from black to sky blue
        startBackgroundColorFade();
        
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
    
    // Fade in start button
    if (introSequence.startButton) {
        introSequence.startButton.style.opacity = '0';
        introSequence.startButton.style.transition = 'opacity 1s ease-in-out';
        
        // Trigger fade-in after a brief delay
        setTimeout(() => {
            introSequence.startButton.style.opacity = '1';
        }, 100);
    }
    
    // Fade in skip button
    if (introSequence.skipButton) {
        introSequence.skipButton.style.transition = 'opacity 1s ease-in-out';
        introSequence.skipButton.style.opacity = '0.7';
    }
    
    console.log('🚀 Start button and skip button faded in');
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

    // FIXED: iPad uses desktop transparent styling, iPhone uses mobile styling
    const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
    const isMobile = (window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024)) && isIPhone;

    if (isMobile) {
        // iPhone-specific mobile styling with solid background
        skipButton.style.cssText = `
            position: fixed !important;
            bottom: 16px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            width: auto !important;
            padding: 8px 16px !important;
            background: rgba(0, 0, 0, 0.7) !important;
            border: 1px solid rgba(0, 150, 255, 0.5) !important;
            border-radius: 4px !important;
            color: #00ff88 !important;
            font-family: 'Orbitron', monospace !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            opacity: 0;
            transition: all 0.2s ease !important;
            z-index: 10000 !important;
            box-shadow: 0 0 10px rgba(0, 150, 255, 0.3), inset 0 0 10px rgba(0, 150, 255, 0.1) !important;
            text-shadow: 0 0 8px rgba(0,255,136,0.6), 0 0 16px rgba(0,255,136,0.3) !important;
        `;

        skipButton.addEventListener('mouseenter', () => {
            skipButton.style.background = 'rgba(0, 255, 255, 0.2)';
            skipButton.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.5), inset 0 0 15px rgba(0, 255, 255, 0.2)';
        });

        skipButton.addEventListener('mouseleave', () => {
            skipButton.style.background = 'rgba(0, 0, 0, 0.7)';
            skipButton.style.boxShadow = '0 0 10px rgba(0, 255, 255, 0.3), inset 0 0 10px rgba(0, 255, 255, 0.1)';
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
    
    // Make skip button fully visible
    if (introSequence.skipButton) {
        introSequence.skipButton.style.opacity = '1';
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
    
    // Render the scene
    renderer.render(scene, camera);
    
    // Continue animation loop
    requestAnimationFrame(animateIntroSequence);
}

function animateStartPhase(elapsed) {
    // Just show the Earth surface view with gentle sway and wait for player input
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
        
        // Play countdown tick sound (very quiet)
        if (newCountdown > 0 && typeof playSound === 'function') {
            playSound('achievement', 800, 0.02);
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
    
    // Play launch preparation sound
    if (typeof playSound === 'function') {
        playSound('warp', 200, 0.5);
    }
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
            if (count > 0 && audioContext && audioContext.state !== 'suspended') {
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
                if (!audioContext || audioContext.state === 'suspended') return;
                
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
    
    // CREATE OUTER INTERSTELLAR SYSTEMS
    if (typeof createOuterInterstellarSystems === 'function') {
        createOuterInterstellarSystems();
        console.log('Outer interstellar systems created');
    }
    
    // Create nebulas
    if (typeof createNebulas === 'function') {
        createNebulas();
        console.log('☁️ Nebulas created');
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
    
    // Initialize game state for normal gameplay
    if (typeof gameState !== 'undefined') {
        gameState.gameStarted = true;
        if (!gameState.velocityVector) {
            gameState.velocityVector = new THREE.Vector3(0, 0, 0);
        }
    }


    // START THE GAME ANIMATION LOOP during black screen for seamless transition
    if (typeof animate === 'function') {
        console.log('🎬 Starting game animation during black screen for seamless transition');
        animate(); // Start the normal game loop now
    }
    
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
    // ADAPTED FOR SPHERICAL UNIVERSE
    // Reset camera to normal game position (matching createOptimizedPlanets)
    const localSystemOffset = { x: 2000, y: 0, z: 1200 }; // From createOptimizedPlanets
    camera.position.set(localSystemOffset.x + 160, localSystemOffset.y + 40, localSystemOffset.z);
    camera.lookAt(new THREE.Vector3(0, 0, 0)); // Face towards Sagittarius A*

    // Reset camera rotation
    if (typeof cameraRotation !== 'undefined') {
        cameraRotation = {
            x: camera.rotation.x,
            y: camera.rotation.y,
            z: camera.rotation.z
        };
    }

    // Set initial orbital velocity
    if (typeof gameState !== 'undefined' && gameState.velocityVector) {
        const sunPosition = new THREE.Vector3(localSystemOffset.x, localSystemOffset.y, localSystemOffset.z);
        const earthPosition = camera.position.clone();
        const earthToSun = new THREE.Vector3().subVectors(sunPosition, earthPosition).normalize();
        const orbitalDirection = new THREE.Vector3(-earthToSun.z, 0, earthToSun.x).normalize();
        gameState.velocityVector = orbitalDirection.multiplyScalar(gameState.minVelocity || 0.2);
    }

    console.log('📍 Camera reset to normal game position in spherical universe');
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
    
    const countdownOverlay = document.getElementById('introCountdownOverlay');
    if (countdownOverlay) {
        countdownOverlay.remove();
    }
    
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
    
    // Start tutorial after a brief delay to let everything settle
    if (typeof startTutorial === 'function') {
        setTimeout(startTutorial, 2000);
    }
    
    console.log('🎬 Normal gameplay fully active - 3D space should now be visible');
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
    rumbleGain.connect(audioContext.destination);
    
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
    blastGain.connect(audioContext.destination);
    
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
        gain.connect(audioContext.destination);
        
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
`;

document.head.appendChild(introStyles);

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
