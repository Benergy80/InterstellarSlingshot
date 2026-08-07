/**
 * Third-Person Camera System for Interstellar Slingshot
 * Allows toggling between first-person and third-person camera views
 */

// Camera state
const cameraState = {
    mode: 'first-person',
    playerShipMesh: null,
    _cachedChildMeshes: null,
    thirdPersonDistance: 1,
    thirdPersonHeight: 0.5,   // Height multiplier for third-person view
    smoothing: 0.15,          // Camera smoothing factor (lower = smoother)
    initialized: false,       // Flag to prevent double-initialization
    playerFlightPosition: new THREE.Vector3(),  // Store actual flight position
    playerFlightRotation: new THREE.Euler(),     // Store actual flight rotation

    // Camera transition animation
    isTransitioning: false,
    transitionStartTime: 0,
    transitionDuration: 800, // milliseconds - doubled for smoother visible transition
    transitionStartOffset: new THREE.Vector3(),
    transitionTargetOffset: new THREE.Vector3(),

    // All offsets use ADD: ship.position = camera.position + offset
    // Positive Z = ship in front of camera, Negative Z = ship behind camera
    // For third-person (camera behind ship), offset is NEGATIVE Z
    // Unified mobile/desktop offset — camera sits further back so the ship
    // is smaller on screen on any device.
    normalFirstPersonOffset: new THREE.Vector3(0.25, -2, 0.5),   // Cockpit: ship slightly forward/below
    normalThirdPersonOffset: new THREE.Vector3(0, -6, -22),      // Pulled-back chase cam
    
    // Thruster glow system
    thrusterGlows: [],      // Array of thruster glow meshes
    thrusterActive: false,  // Whether thrusters are firing
    thrusterIntensity: 0    // Current glow intensity (0-1)
};

/**
 * Initialize the camera system with the player ship model
 */
function initCameraSystem(camera, scene) {
    // Check if we need to re-add player to a new scene
    if (cameraState.initialized && cameraState.playerShipMesh) {
        // If the player model's parent doesn't match the provided scene, we need to move it
        if (cameraState.playerShipMesh.parent !== scene) {
            console.log('🎥 Camera system already initialized, but player ship is in wrong scene');
            console.log('  - Current parent:', cameraState.playerShipMesh.parent);
            console.log('  - Target scene:', scene);
            console.log('  - Re-adding player ship to new scene...');

            // Remove from old parent if it has one
            if (cameraState.playerShipMesh.parent) {
                cameraState.playerShipMesh.parent.remove(cameraState.playerShipMesh);
            }

            // Add to new scene
            scene.add(cameraState.playerShipMesh);
            console.log('✅ Player ship moved to new scene');
            console.log('  - New parent:', cameraState.playerShipMesh.parent);
            return;
        }

        console.log('🎥 Camera system already initialized and in correct scene, skipping...');
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
            
            // CENTER THE MODEL GEOMETRY FIRST (before scaling - fix off-center GLB exports)
            const box = new THREE.Box3().setFromObject(playerModel);
            const center = box.getCenter(new THREE.Vector3());
            playerModel.traverse((child) => {
                if (child.isMesh) {
                    child.position.sub(center);
                }
            });
            console.log('📐 Player model centered, offset was:', center);
            
            // NOW apply scale and position
            playerModel.scale.set(48, 48, 48);  // Reduced from 96 to 48 for better performance
            playerModel.position.set(0, 0, 0);

            // Don't rotate or offset the model during init
            // Let the update loop handle all positioning and rotation
            // This ensures the model's position exactly matches what we set in updateCameraView

            // Performance optimization: disable shadows and simplify rendering
            playerModel.castShadow = false;
            playerModel.receiveShadow = false;

            // CRITICAL: Make the entire model visible
            playerModel.visible = true;  // DEBUG: Start visible since we're in third-person mode
            playerModel.frustumCulled = false;

            // Apply optimized self-lit material to all meshes
            playerModel.traverse((child) => {
                if (child.isMesh) {
                    // CRITICAL: Make each mesh visible
                    child.visible = true;
                    child.frustumCulled = false;

                    // Optimized self-illuminated material - simpler for better performance
                    child.material = new THREE.MeshBasicMaterial({
                        color: 0x00ffff,  // Bright cyan
                        transparent: true,
                        opacity: 0.85,
                        side: THREE.FrontSide,  // Only render front faces for performance
                        depthWrite: true,
                        depthTest: true
                    });
                    
                    // CRITICAL: Render player ship ON TOP of warp effects (starfield, hyperspace)
                    // Higher renderOrder = rendered later = appears on top
                    child.renderOrder = 100;
                    
                    // Disable shadows for performance
                    child.castShadow = false;
                    child.receiveShadow = false;
                }
            });
            
            // Also set renderOrder on the parent model
            playerModel.renderOrder = 100;

            console.log('  - About to add player model to scene...');
            console.log('  - Scene object:', scene);
            console.log('  - Scene children count before add:', scene.children.length);
            console.log('  - Player model parent before add:', playerModel.parent);

            scene.add(playerModel);

            console.log('  - Scene children count after add:', scene.children.length);
            console.log('  - Player model parent after add:', playerModel.parent);
            console.log('  - Player model in scene?', scene.children.includes(playerModel));

            cameraState.playerShipMesh = playerModel;

            // Ship starts visible for both first-person (cockpit) and third-person views
            playerModel.visible = true;
            
            // Create thruster glow effects at rear of ship
            createThrusterGlows(playerModel);

            console.log('✅ Player ship added to scene (scale: 96x, cyan emissive)');
            console.log('  - cameraState.playerShipMesh parent:', cameraState.playerShipMesh.parent);
            cameraState.initialized = true;
        } else {
            console.warn('⚠️ getPlayerModel returned null/undefined - no player model available');
            // INIT-RACE FIX: re-run automatically once the model is cached
            // (previously this just hoped someone would call again — the
            // player ship silently never appeared if nobody did).
            if (window.Boot) {
                window.Boot.whenReady('playerModel', () => {
                    if (!cameraState.initialized) initCameraSystem(camera, scene);
                });
            }
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
        console.warn('⚠️ No player ship model available for third-person view');
        console.warn('   Camera state:', cameraState);
        console.warn('   Try re-initializing: initCameraSystem is', typeof initCameraSystem);

        // Show notification to user
        if (typeof showNotification === 'function') {
            showNotification('Player model not loaded yet', 2000);
        }
        return;
    }

    // If already transitioning, reverse the direction instead of starting new transition
    if (cameraState.isTransitioning) {
        // Reverse the transition by swapping start and target
        const temp = cameraState.transitionStartOffset.clone();
        cameraState.transitionStartOffset.copy(cameraState.transitionTargetOffset);
        cameraState.transitionTargetOffset.copy(temp);

        // Reverse the progress by resetting time based on current progress
        const elapsed = performance.now() - cameraState.transitionStartTime;
        const progress = Math.min(elapsed / cameraState.transitionDuration, 1);
        const remainingProgress = 1 - progress;
        cameraState.transitionStartTime = performance.now() - (remainingProgress * cameraState.transitionDuration);

        // Toggle mode
        cameraState.mode = (cameraState.mode === 'first-person') ? 'third-person' : 'first-person';

        console.log('📷 Reversing transition to', cameraState.mode.toUpperCase(), 'view');

        // Show notification
        if (typeof showNotification === 'function') {
            const msg = cameraState.mode === 'third-person' ? 'Third-Person Camera' : 'First-Person Camera (Cockpit View)';
            showNotification(msg, 2000);
        }

        return;
    }

    if (cameraState.mode === 'first-person') {
        // Switch to third-person
        cameraState.mode = 'third-person';
        cameraState.playerShipMesh.visible = true;

        // CRITICAL: Explicitly set all child meshes to visible
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
            }
        });

        // Start transition animation from first-person to third-person
        cameraState.isTransitioning = true;
        cameraState.transitionStartTime = performance.now();
        
        cameraState.transitionStartOffset.copy(cameraState.normalFirstPersonOffset);
        cameraState.transitionTargetOffset.copy(cameraState.normalThirdPersonOffset);

        console.log('📷 Transitioning to THIRD-PERSON view');

        // Show notification
        if (typeof showNotification === 'function') {
            showNotification('Third-Person Camera', 2000);
        }
    } else {
        // Switch to first-person (cockpit view)
        cameraState.mode = 'first-person';
        cameraState.playerShipMesh.visible = true; // Keep visible for cockpit view

        // Keep all child meshes visible for cockpit view
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
            }
        });

        // Start transition animation from third-person to first-person (reverse path)
        cameraState.isTransitioning = true;
        cameraState.transitionStartTime = performance.now();
        
        cameraState.transitionStartOffset.copy(cameraState.normalThirdPersonOffset);
        cameraState.transitionTargetOffset.copy(cameraState.normalFirstPersonOffset);

        console.log('📷 Transitioning to FIRST-PERSON view (cockpit)');

        // Show notification
        if (typeof showNotification === 'function') {
            showNotification('First-Person Camera (Cockpit View)', 2000);
        }
    }
}

/**
 * Update camera position for third-person view
 * Call this in the game loop
 */
function updateCameraView(camera) {
    // Camera position IS the player's actual flight position (controlled by game physics)
    // We just position the ship model to match, without modifying camera position

    // DEBUG: Track calls
    if (!window.updateCameraViewCallCount) window.updateCameraViewCallCount = 0;
    window.updateCameraViewCallCount++;

    if (!cameraState.playerShipMesh) {
        if (window.updateCameraViewCallCount % 120 === 0) {
            console.warn('⚠️ updateCameraView called but no playerShipMesh! Call count:', window.updateCameraViewCallCount);
        }
        return; // No ship model loaded yet
    }

    // Hide the ship the moment the death sequence begins, and KEEP it
    // hidden — triggerPlayerDeath flips this flag, but without a gate
    // here updateCameraView (which runs every frame) would just turn
    // the ship's mesh visible again on the very next tick and the
    // player would see the intact model floating inside their own
    // explosion. Same goes for the cached child meshes.
    if (typeof gameState !== 'undefined' && gameState.playerDying) {
        cameraState.playerShipMesh.visible = false;
        if (cameraState._cachedChildMeshes) {
            const cached = cameraState._cachedChildMeshes;
            for (let i = 0; i < cached.length; i++) cached[i].visible = false;
        } else {
            cameraState.playerShipMesh.traverse((child) => {
                if (child.isMesh) child.visible = false;
            });
        }
        return;
    }

    // CRITICAL: Hide ship during intro sequence
    if (typeof introSequence !== 'undefined' && introSequence.active) {
        if (window.updateCameraViewCallCount % 120 === 0) {
            console.log('  ⏸️ Intro active - hiding ship and returning early');
        }
        cameraState.playerShipMesh.visible = false;
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = false;
            }
        });
        return; // Don't update position during intro
    }
    
    // Hide the ship when it would visually cross through the camera.
    // This happens in two cases:
    //   a) Plain zero-offset mode (0 key), transition complete
    //   b) DURING a transition whose animated offset is very close to
    //      the camera origin — e.g. the intro cinematic from zero-offset
    //      (z=+3) to third-person (z=-22) passes through z=0, where the
    //      ship mesh would overlap the camera and clip through the view.
    let hideShip = false;
    if (cameraState.mode === 'zero-offset' && !cameraState.isTransitioning) {
        hideShip = true;
    } else if (cameraState.isTransitioning) {
        // Snapshot the animated offset to decide visibility.
        const elapsed0 = performance.now() - cameraState.transitionStartTime;
        const progress0 = Math.min(elapsed0 / cameraState.transitionDuration, 1);
        const ease0 = progress0 < 0.5
            ? 2 * progress0 * progress0
            : 1 - Math.pow(-2 * progress0 + 2, 2) / 2;
        const animZ = cameraState.transitionStartOffset.z +
                      (cameraState.transitionTargetOffset.z - cameraState.transitionStartOffset.z) * ease0;
        const animY = cameraState.transitionStartOffset.y +
                      (cameraState.transitionTargetOffset.y - cameraState.transitionStartOffset.y) * ease0;
        // If the ship is within 2 units of the camera in the Z axis AND
        // not far enough below/above it either, hide it for this frame.
        if (Math.abs(animZ) < 2 && Math.abs(animY) < 2) {
            hideShip = true;
        }
    }

    // Use cached child list instead of traverse() — traverse walks the entire
    // subtree every frame (3000+ visibility toggles/sec on a 50-child model).
    // Cache is populated on first access and invalidated only if the mesh changes.
    if (!cameraState._cachedChildMeshes || cameraState._cachedChildMeshes._parent !== cameraState.playerShipMesh) {
        cameraState._cachedChildMeshes = [];
        cameraState._cachedChildMeshes._parent = cameraState.playerShipMesh;
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) cameraState._cachedChildMeshes.push(child);
        });
    }
    const vis = !hideShip;
    cameraState.playerShipMesh.visible = vis;
    const cached = cameraState._cachedChildMeshes;
    for (let i = 0; i < cached.length; i++) cached[i].visible = vis;

    // Calculate offset (with animation if transitioning)
    let currentOffset;

    if (cameraState.isTransitioning) {
        // Animate between offsets
        const elapsed = performance.now() - cameraState.transitionStartTime;
        const progress = Math.min(elapsed / cameraState.transitionDuration, 1);

        // Smooth easing function (ease-in-out)
        const easedProgress = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        // Interpolate between start and target offset
        currentOffset = new THREE.Vector3();
        currentOffset.lerpVectors(
            cameraState.transitionStartOffset,
            cameraState.transitionTargetOffset,
            easedProgress
        );

        // End transition when complete
        if (progress >= 1) {
            cameraState.isTransitioning = false;
            
        }
    } else if (cameraState.mode === 'zero-offset') {
        // Zero offset - ship behind camera (matches transition target)
        currentOffset = new THREE.Vector3(0.25, -1, 3);
    } else if (cameraState.mode === 'first-person') {
        // First-person offset
        currentOffset = cameraState.normalFirstPersonOffset.clone();
    } else {
        // Third-person offset
        currentOffset = cameraState.normalThirdPersonOffset.clone();
    }

    // ── CINEMATIC WARP FRAMING ──────────────────────────────────────────
    // During warp / slingshot boosts the chase framing eases BACK (offset
    // ×1.55 so the ship strains ahead), the FOV widens with it, the frame
    // drifts gently, and ignition/exit get a ~0.5s micro-shake. Everything
    // is a per-frame ease off the LIVE warp state — the same lerp runs in
    // both directions, so entering and leaving warp is seamless (no
    // setTimeout snaps). Only the SHIP-IN-FRAME offset moves; the camera's
    // gameplay position is untouched.
    if (typeof gameState !== 'undefined' && gameState.gameStarted) {
        // WARP-EXIT SYNC: gameState._warpExitT (published by game-physics'
        // _applyWarpExitRamp, 0 at drop-out → 1 fully settled, null when no
        // ramp is running) is this frame's single source of truth for "how
        // far through the drop-out are we". _exitSettle is its complement —
        // 1 with no ramp running, sliding to 0 as the ramp completes — and
        // is applied directly to the PERSISTENT rig state below (_warpZoom,
        // _whipFov, _whipLean, _whipCrack, the fov pulse amplitude), not
        // just to the derived FOV number. Scaling only the derived number
        // was tried first and produced a pop: those state variables keep
        // decaying on their own flat per-frame lerps regardless, so the
        // instant the ~1s ramp ended and stopped suppressing the readout,
        // whatever those lerps hadn't caught up to erasing yet reappeared
        // in one frame (measured: FOV snapped 75.0 -> 80.3 the frame the
        // ramp handed off). Settling the state itself means there is
        // nothing left to rebound — by exitT=1 the rig is ACTUALLY at rest,
        // not just reading that way.
        const _exitT = (typeof gameState._warpExitT === 'number') ? gameState._warpExitT : null;
        const _exitSettle = (_exitT !== null) ? (1 - _exitT) : 1;
        // ── SUSTAINED SPEED, EASED ONCE PER FRAME ───────────────────────
        // _warpZoom below only moves for warp / slingshot, so the entire
        // reachable sub-warp range — 0 to 4,000 km/s, the whole "whip" — used
        // to be shot at a dead-constant 75° from a dead-constant chase
        // distance. The lens never breathed with the thing the player was
        // actually doing. This eases visual-flair's whip curve (the same 0→1
        // signal the streaks and debris ride, so the rig and the field can
        // never disagree) and both the framing and the FOV below hang off it.
        // Attack is roughly twice the release: speed grabs, settling drifts.
        if (cameraState._whipFov === undefined) cameraState._whipFov = 0;
        const _whipV = (typeof window !== 'undefined' && typeof window.speedWhipLevel === 'function')
            ? window.speedWhipLevel()
            : ((typeof window !== 'undefined' && window.__speedWhip) || 0);
        cameraState._whipFov += (_whipV - cameraState._whipFov) *
            (_whipV > cameraState._whipFov ? 0.10 : 0.05);
        // WARP-EXIT SYNC: drain toward the LIVE speed-driven target (_whipV),
        // not toward zero. _whipFov is the SUSTAINED cruise-speed term — the
        // ship is often still moving fast right after a slingshot exit, so
        // its rest value is whatever speedWhipLevel() reads THIS frame, not
        // silence. Draining to 0 (the old `*= _exitSettle`) produced the V:
        // FOV sagged toward 75 through the ramp, then this var's own lerp
        // above raced back up to _whipV the instant the ramp stopped
        // suppressing it — a dip-then-reinflate instead of one smooth
        // approach to the cruise value.
        if (_exitT !== null) cameraState._whipFov = _whipV + (cameraState._whipFov - _whipV) * _exitSettle;
        if (cameraState._warpZoom === undefined) { cameraState._warpZoom = 1; cameraState._wasWarping = false; }
        const _warpingNow = !!((gameState.emergencyWarp && gameState.emergencyWarp.active) ||
            (gameState.slingshot && gameState.slingshot.active && !gameState.slingshotWhip));
        if (_warpingNow !== cameraState._wasWarping) {
            cameraState._wasWarping = _warpingNow;
            cameraState._warpShakeUntil = performance.now() + 550; // ignition / exit thump
        }
        const _zTarget = (_warpingNow && cameraState.mode === 'third-person') ? 1.55 : 1.0;
        cameraState._warpZoom += (_zTarget - cameraState._warpZoom) * 0.04;
        if (_exitT !== null) cameraState._warpZoom = 1 + (cameraState._warpZoom - 1) * _exitSettle;
        const _zAmt = cameraState._warpZoom - 1;
        if (Math.abs(_zAmt) > 0.004) {
            currentOffset.multiplyScalar(cameraState._warpZoom);
            // Slow cinematic float while warped-out
            const _wt = performance.now();
            currentOffset.x += Math.sin(_wt * 0.0008) * 0.6 * _zAmt;
            currentOffset.y += Math.cos(_wt * 0.0006) * 0.4 * _zAmt;
        }
        if (cameraState._warpShakeUntil && performance.now() < cameraState._warpShakeUntil) {
            const _sAmp = 0.25 * ((cameraState._warpShakeUntil - performance.now()) / 550);
            currentOffset.x += (Math.random() - 0.5) * _sAmp;
            currentOffset.y += (Math.random() - 0.5) * _sAmp;
        }
        // ── WHIP FRAMING: BANK THE CHASE CAM INTO THE ARC ───────────────
        // The gravity whip already rolls the CAMERA (physics owns the arc
        // quaternion). What was missing is the chase rig reacting to it: the
        // ship sat dead-centre and perfectly rigid through a 40° banked turn.
        // Here the rig itself leans — the offset rolls around the view axis,
        // slides to the OUTSIDE of the turn (so the ship carves across frame
        // and the arc ribbon has somewhere to be), and dollies back as the
        // arc bites. Everything rides the signed 0→1→0 carve envelope the
        // physics whip publishes, and eases back to zero after release, so
        // this can never leave the camera stuck off-axis.
        const _wf = (typeof window !== 'undefined') ? window.__whipFrame : null;
        if (cameraState._whipLean === undefined) cameraState._whipLean = 0;
        const _leanT = (_wf && _wf.active) ? (_wf.sign || 1) * (_wf.carve || 0) : 0;
        // Faster in than out: gravity grabs, the release unwinds (~0.5s).
        cameraState._whipLean += (_leanT - cameraState._whipLean) *
            (Math.abs(_leanT) > Math.abs(cameraState._whipLean) ? 0.14 : 0.07);
        // WARP-EXIT SYNC: drain toward the LIVE target _leanT (normally 0
        // once the gravity whip has released, but not forced there — if a
        // warp exit lands mid-turn this settles into the turn's OWN lean
        // instead of yanking it flat).
        if (_exitT !== null) cameraState._whipLean = _leanT + (cameraState._whipLean - _leanT) * _exitSettle;
        const _lean = cameraState._whipLean;
        if (Math.abs(_lean) > 0.004) {
            const _la = Math.abs(_lean);
            // Roll the rig about the view axis — the horizon swings, the ship
            // banks with it, and the whole frame reads as "in the turn".
            const _c = Math.cos(-_lean * 0.42), _s = Math.sin(-_lean * 0.42);
            const _ox = currentOffset.x, _oy = currentOffset.y;
            currentOffset.x = _ox * _c - _oy * _s;
            currentOffset.y = _ox * _s + _oy * _c;
            // …then throw the ship to the outside of the arc and dolly back.
            currentOffset.x += _lean * 4.2;
            currentOffset.z *= 1 + 0.24 * _la;
            currentOffset.y -= 1.4 * _la;
        }

        // ── LAUNCH CRACK: THE RIG STRAINS AS THE SHIP TEARS AWAY ────────
        // The release used to be a single frame — velocity stepped from the
        // arc's speed to full boost in one tick — so the only thing the rig
        // could do about it was the instant _warpZoom impulse physics fires,
        // which reads as a lens pop rather than as acceleration. The whip now
        // RAMPS over ~260ms (game-physics updateSlingshotLaunchRamp) and
        // publishes its eased 0→1 curve as window.__whipLaunch.e, so the
        // chase rig can fall behind the ship on the exact curve the ship is
        // accelerating on: the camera loses ground, the nose lifts, and the
        // lens widens *with* the burn instead of ahead of it.
        // Attack tracks the ramp almost 1:1; release unwinds over ~0.3s so
        // the frame settles into the glide instead of snapping back.
        if (cameraState._whipCrack === undefined) cameraState._whipCrack = 0;
        const _wl = (typeof window !== 'undefined') ? window.__whipLaunch : null;
        const _crackT = (_wl && cameraState.mode === 'third-person')
            ? Math.max(0, Math.min(1, _wl.e || 0)) : 0;
        cameraState._whipCrack += (_crackT - cameraState._whipCrack) *
            (_crackT > cameraState._whipCrack ? 0.45 : 0.06);
        // WARP-EXIT SYNC: drain toward the LIVE target _crackT (normally 0
        // this far past launch) rather than forcing 0 directly.
        if (_exitT !== null) cameraState._whipCrack = _crackT + (cameraState._whipCrack - _crackT) * _exitSettle;
        if (cameraState._whipCrack > 0.004) {
            const _ck = cameraState._whipCrack;
            currentOffset.z *= 1 + 0.42 * _ck;   // camera drops back
            currentOffset.y += 0.9 * _ck;        // …and rises into a hero angle
        }

        // ── SUSTAINED SPEED FRAMING ─────────────────────────────────────
        // _whipCrack above is a ~260ms transient on the slingshot release.
        // This is the steady-state companion: while you HOLD speed the rig
        // sits further back and the airframe shivers, so cruising and running
        // flat out are framed differently even when no warp is involved. The
        // shiver is sub-pixel at cruise and only ~0.05u at top speed — engine
        // strain, not a rattle, and it never touches the HUD.
        if (cameraState._whipFov > 0.01 && cameraState.mode === 'third-person') {
            const _wk = cameraState._whipFov;
            currentOffset.z *= 1 + 0.17 * _wk;
            currentOffset.y += 0.30 * _wk;
            const _jit = 0.065 * _wk * _wk;
            currentOffset.x += (Math.random() - 0.5) * _jit;
            currentOffset.y += (Math.random() - 0.5) * _jit;
        }

        // FOV follows the zoom: 75 at rest → ~86 fully warped, eased both
        // ways. EXTENDED (not replaced) with two additive terms so the warp
        // tunnel and the whip can breathe the lens without ever fighting the
        // zoom ease for ownership of camera.fov:
        //   • a decaying one-shot impulse — warpFovPulse(), used for tunnel
        //     entry/exit snaps
        //   • the sustained tunnel level published by visual-flair
        if (camera.isPerspectiveCamera) {
            //   • the sustained sub-warp whip level, so the lens widens
            //     continuously with speed instead of only ever at warp
            let _fovT = 75 + _zAmt * 20 + Math.abs(cameraState._whipLean) * 5 +
                (cameraState._whipCrack || 0) * 6 +
                (cameraState._whipFov || 0) * 7.5;
            if (cameraState._fovPulseAmp) {
                if (_exitT !== null) cameraState._fovPulseAmp *= _exitSettle;
                const _pk = (performance.now() - cameraState._fovPulseT0) /
                    Math.max(1, cameraState._fovPulseMs);
                if (_pk >= 1) cameraState._fovPulseAmp = 0;
                // Fast attack, long tail — a lens SNAP that settles.
                else _fovT += cameraState._fovPulseAmp *
                    Math.sin(Math.PI * Math.pow(_pk, 0.32));
            }
            const _tl = (typeof window !== 'undefined' && window.__warpTunnelLevel) || 0;
            if (_tl > 0.01) _fovT += _tl * 8;
            // WARP-EXIT SYNC: _exitSettle (computed at the top of this block
            // from gameState._warpExitT — the physics exit ramp's own eased
            // 0..1 progress) already drained _warpZoom/_whipFov/_whipLean/
            // _whipCrack/_fovPulseAmp toward THEIR live per-frame targets
            // above, in place, so this final composite line only needs to
            // land on the SAME endpoint those targets imply — the FOV the
            // rig will actually want next frame at current speed — not the
            // flat at-rest constant 75. _cruiseFovT below is exactly the
            // formula above, evaluated at the live targets instead of the
            // still-settling state vars (_zAmt's live target is always 0
            // here: _warpingNow is false for this ramp's entire duration,
            // see _applyWarpExitRamp's call site in game-physics.js). Using
            // the SAME target for both the inner state drains and this
            // outer composite means they converge together — no V-dip
            // toward 75 and no re-inflation bump once the ramp hands off.
            // Composed, not replaced: outside a ramp _exitSettle is 1
            // (no-op) and _fovT passes through untouched.
            const _cruiseFovT = 75 + Math.abs(_leanT) * 5 + _crackT * 6 + _whipV * 7.5;
            _fovT = _cruiseFovT + (_fovT - _cruiseFovT) * _exitSettle;
            // WARP-EXIT SYNC (lens contraction, cubic target-ease): the drop-
            // out used to also carry a SIGNED warpFovPulse(-11, 700) impulse
            // riding on top of the drain above. That impulse's envelope
            // (sin(pi*pk^0.32) in warpFovPulse's consumer below) is by
            // construction full amplitude near pk~0.1 and back to ZERO by
            // pk=1 — a re-expansion for a negative amplitude, measured as
            // +8.3deg of upward force released over 0.44s: the lens
            // "springing back open" mid-drop. warpExitBeat() (visual-flair.js)
            // no longer fires that pulse; instead it stamps _exitFovFrom (the
            // FOV at the instant of drop-out) / _exitFovT0 / _exitFovMs here.
            // While that window is live, this OVERRIDES _fovT with a cubic
            // ease-out from _exitFovFrom toward _cruiseFovT — recomputed live
            // above from this frame's actual lean/crack/whip state, so it's
            // wherever cruise ACTUALLY is by the time the ease finishes, not
            // a stale guess. Math.pow(1-p,3) is strictly decreasing for a
            // tighten (from > cruise) by construction — there is no bottom
            // to spring back from, only a monotone approach to a moving
            // target — so no dip-then-reinflate is possible.
            if (cameraState._exitFovT0) {
                const _fp = (performance.now() - cameraState._exitFovT0) /
                    Math.max(1, cameraState._exitFovMs || 700);
                if (_fp < 1) {
                    _fovT = _cruiseFovT + (cameraState._exitFovFrom - _cruiseFovT) * Math.pow(1 - _fp, 3);
                } else {
                    cameraState._exitFovT0 = 0;
                }
            }
            _fovT = Math.max(55, Math.min(118, _fovT));
            if (Math.abs(camera.fov - _fovT) > 0.05) {
                camera.fov = _fovT;
                camera.updateProjectionMatrix();
            }
        }
    }

    if (cameraState.mode === 'first-person') {
        // FIRST-PERSON MODE (COCKPIT VIEW):
        // Camera IS the player position - enemies target this location
        // Position the ship model so the camera is at the cockpit/center of the ship
        // The ship model is just visual - the camera position is the "real" player position

        // Use animated offset during transitions
        const cockpitOffset = currentOffset.clone();
        cockpitOffset.applyQuaternion(camera.quaternion);

        cameraState.playerShipMesh.position.copy(camera.position);
        cameraState.playerShipMesh.position.add(cockpitOffset);

        // Orient ship to face AWAY from camera (direction of travel)
        // v2254: Build rotation matrix from camera vectors for proper alignment
        const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        
        // Ship faces opposite direction (away from camera)
        const shipForward = camForward.clone().negate();
        
        // Build rotation matrix from direction vectors
        const shipMatrix = new THREE.Matrix4();
        shipMatrix.lookAt(new THREE.Vector3(), shipForward, camUp);
        const shipQuaternion = new THREE.Quaternion().setFromRotationMatrix(shipMatrix);
        
        // Dynamic banking + counter-roll spring for realistic feel.
        // The ship leans into yaw turns and has a damped counter-roll
        // at the end of Q/E rolls, like inertia overshooting then settling.
        if (typeof rotationalVelocity !== 'undefined') {
            const demo = (typeof window !== 'undefined' && window.demoPilot && window.demoPilot.active);
            // SMOOTH the bank/pitch tilt. Previously the bank was raw
            // angular velocity × 15-45, applied every frame — so the noisy
            // per-frame yaw (inertia overshoot + the orient closed-form step)
            // mapped straight to a big roll that visibly jittered/shook the
            // ship during fast turns. Easing the applied angle removes it.
            const targetBank = -rotationalVelocity.yaw * (demo ? 38 : 14);
            const targetPitch = -rotationalVelocity.pitch * (demo ? 10 : 5);
            if (cameraState._smBank === undefined) cameraState._smBank = 0;
            if (cameraState._smPitch === undefined) cameraState._smPitch = 0;
            cameraState._smBank += (targetBank - cameraState._smBank) * 0.18;
            cameraState._smPitch += (targetPitch - cameraState._smPitch) * 0.18;
            // Counter-roll spring (for Q/E rolls), gentler multiplier (3→1.5).
            if (cameraState._smoothedRoll === undefined) cameraState._smoothedRoll = 0;
            const targetRoll = rotationalVelocity.roll * 8;
            cameraState._smoothedRoll += (targetRoll - cameraState._smoothedRoll) * 0.08;
            const counterRoll = (cameraState._smoothedRoll - targetRoll) * 1.5;
            const bankQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), cameraState._smBank + counterRoll);
            const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), cameraState._smPitch);
            shipQuaternion.multiply(bankQuat).multiply(pitchQuat);
        }

        cameraState.playerShipMesh.quaternion.copy(shipQuaternion);

        // Make ship visible but slightly transparent for cockpit view
        cameraState.playerShipMesh.visible = true;
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
                // Keep existing material transparency
            }
        });

    } else if (cameraState.mode === 'third-person') {
        // THIRD-PERSON MODE (CHASE CAMERA):
        // Camera is behind and above the ship looking at it
        // Ship positioned ahead of camera at a comfortable viewing distance

        // Use animated offset during transitions (same as first-person: ADD)
        const chaseOffset = currentOffset.clone();
        chaseOffset.applyQuaternion(camera.quaternion);

        // UNIFIED: Always ADD offset (third-person uses negative Z to put ship ahead)
        cameraState.playerShipMesh.position.copy(camera.position);
        cameraState.playerShipMesh.position.add(chaseOffset);

        // Orient ship to face AWAY from camera (direction of travel)
        // v2254: Build rotation matrix from camera vectors for proper alignment
        const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        
        // Ship faces opposite direction (away from camera, toward travel direction)
        const shipForward = camForward.clone().negate();
        
        // Build rotation matrix from direction vectors
        const shipMatrix = new THREE.Matrix4();
        shipMatrix.lookAt(new THREE.Vector3(), shipForward, camUp);
        const shipQuaternion = new THREE.Quaternion().setFromRotationMatrix(shipMatrix);
        
        // Add dynamic banking based on rotational velocity
        if (typeof rotationalVelocity !== 'undefined') {
            const demo = (typeof window !== 'undefined' && window.demoPilot && window.demoPilot.active);
            const bankAmount = -rotationalVelocity.yaw * (demo ? 45 : 15);
            const pitchTilt = -rotationalVelocity.pitch * (demo ? 12 : 5);
            const bankQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bankAmount);
            const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchTilt);
            shipQuaternion.multiply(bankQuat).multiply(pitchQuat);
        }

        cameraState.playerShipMesh.quaternion.copy(shipQuaternion);

        // Ensure the ship model is fully visible and opaque in third-person
        cameraState.playerShipMesh.visible = true;
        cameraState.playerShipMesh.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
            }
        });
    }
}

/**
 * Debug: Manually re-add player ship to scene if it was removed
 */
function readdPlayerShipToScene(scene) {
    if (!cameraState.playerShipMesh) {
        console.error('❌ No player ship mesh in cameraState');
        return false;
    }

    console.log('🔧 Attempting to re-add player ship to scene...');
    console.log('  - Current parent:', cameraState.playerShipMesh.parent);
    console.log('  - Scene provided:', !!scene);

    // Remove from current parent if it has one
    if (cameraState.playerShipMesh.parent) {
        cameraState.playerShipMesh.parent.remove(cameraState.playerShipMesh);
        console.log('  - Removed from current parent');
    }

    // Add to scene
    scene.add(cameraState.playerShipMesh);
    console.log('  - Added to scene');
    console.log('  - New parent:', cameraState.playerShipMesh.parent);
    console.log('  - In scene?', scene.children.includes(cameraState.playerShipMesh));

    return true;
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

/**
 * Set camera to first-person mode (1 key)
 */
// Compute a transition duration that scales with the actual 3D distance
// between start and target offsets.  The old 3rd-person offset (0,-4,-14)
// was ~14.6 u from 1st-person; the new pulled-back (0,-6,-22) is ~22.9 u.
// A fixed 400 ms duration means the pulled-back version is 57 % faster
// per unit travelled — feels rushed / janky during warps.  Scaling by
// distance keeps the visual pacing consistent regardless of offset:
//   14.6 u → ~410 ms, 22.9 u → ~640 ms, clamped to [400 ms, 800 ms].
function computeTransitionDuration(startOffset, targetOffset) {
    if (!startOffset || !targetOffset) return 400;
    const dx = targetOffset.x - startOffset.x;
    const dy = targetOffset.y - startOffset.y;
    const dz = targetOffset.z - startOffset.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    // ~28 ms per unit: matches the old pace (14.6 u / 400 ms ≈ 27.4 ms/u)
    return Math.max(400, Math.min(800, Math.round(dist * 28)));
}

function setCameraFirstPerson() {
    if (!cameraState.playerShipMesh) {
        console.warn('⚠️ No player ship model available');
        return;
    }
    
    if (cameraState.mode === 'first-person' && !cameraState.isTransitioning) {
        console.log('📷 Already in first-person mode');
        return;
    }
    
    console.log('📷 Setting FIRST-PERSON view');
    
    // Capture current offset for smooth transition from wherever we are
    const currentOffset = getCurrentOffset();
    
    cameraState.mode = 'first-person';
    cameraState.playerShipMesh.visible = true;
    cameraState.isTransitioning = true;
    cameraState.transitionStartTime = performance.now();
    cameraState.transitionStartOffset.copy(currentOffset);  // Start from current position
    cameraState.transitionTargetOffset.copy(cameraState.normalFirstPersonOffset);
    cameraState.transitionDuration = computeTransitionDuration(
        cameraState.transitionStartOffset, cameraState.transitionTargetOffset);

    if (typeof showNotification === 'function') {
        showNotification('First-Person Camera', 2000);
    }
}

/**
 * Set camera to third-person mode (3 key)
 */
function setCameraThirdPerson() {
    if (!cameraState.playerShipMesh) {
        console.warn('⚠️ No player ship model available');
        return;
    }

    if (cameraState.mode === 'third-person' && !cameraState.isTransitioning) {
        console.log('📷 Already in third-person mode');
        return;
    }

    console.log('📷 Setting THIRD-PERSON view');

    // Capture current offset for smooth transition from wherever we are
    const currentOffset = getCurrentOffset();

    cameraState.mode = 'third-person';
    cameraState.playerShipMesh.visible = true;
    cameraState.isTransitioning = true;
    cameraState.transitionStartTime = performance.now();
    cameraState.transitionStartOffset.copy(currentOffset);  // Start from current position
    cameraState.transitionTargetOffset.copy(cameraState.normalThirdPersonOffset);
    cameraState.transitionDuration = computeTransitionDuration(
        cameraState.transitionStartOffset, cameraState.transitionTargetOffset);
    
    if (typeof showNotification === 'function') {
        showNotification('Third-Person Camera', 2000);
    }
}

/**
 * No ship visible, camera at zero offset (0 key)
 * This is camera offset (0,0,0) - not world position
 */
function setCameraNoShip() {
    if (!cameraState.playerShipMesh) {
        console.warn('⚠️ No player ship model available');
        return;
    }
    
    if (cameraState.mode === 'zero-offset' && !cameraState.isTransitioning) {
        console.log('📷 Already in zero-offset mode');
        return;
    }
    
    console.log('📷 Setting zero offset (cycling through 1st person first)');
    
    // Keep ship visible during transitions
    cameraState.playerShipMesh.visible = true;
    
    // If coming from 3rd person, go to 1st person first (like warp does)
    if (cameraState.mode === 'third-person') {
        // Step 1: Animate to first-person
        const currentOffset = getCurrentOffset();
        cameraState.mode = 'first-person';
        cameraState.isTransitioning = true;
        cameraState.transitionStartTime = performance.now();
        cameraState.transitionStartOffset.copy(currentOffset);
        cameraState.transitionTargetOffset.copy(cameraState.normalFirstPersonOffset);
        cameraState.transitionDuration = computeTransitionDuration(
            cameraState.transitionStartOffset, cameraState.transitionTargetOffset);
        const step1Duration = cameraState.transitionDuration;

        // Step 2: After reaching 1st person, continue to zero-offset.
        // Use the dynamic duration so Step 2 kicks in right after Step 1.
        setTimeout(() => {
            const firstPersonOffset = getCurrentOffset();
            cameraState.mode = 'zero-offset';
            cameraState.isTransitioning = true;
            cameraState.transitionStartTime = performance.now();
            cameraState.transitionStartOffset.copy(firstPersonOffset);
            cameraState.transitionTargetOffset.set(0.25, -1, 3);
            cameraState.transitionDuration = computeTransitionDuration(
                cameraState.transitionStartOffset, cameraState.transitionTargetOffset);
        }, step1Duration + 20);
    } else {
        // Already in 1st person or other mode - go directly to zero-offset
        const currentOffset = getCurrentOffset();
        cameraState.mode = 'zero-offset';
        cameraState.isTransitioning = true;
        cameraState.transitionStartTime = performance.now();
        cameraState.transitionStartOffset.copy(currentOffset);
        cameraState.transitionTargetOffset.set(0.25, -1, 3);
        cameraState.transitionDuration = computeTransitionDuration(
            cameraState.transitionStartOffset, cameraState.transitionTargetOffset);
    }
    
    if (typeof showNotification === 'function') {
        showNotification('Zero Offset Camera', 2000);
    }
}

/**
 * Get player position based on camera mode
 * - 1st/3rd person: ship model position
 * - Zero offset: camera position (POV)
 */
function getPlayerPosition() {
    if (cameraState.mode === 'zero-offset') {
        // In zero-offset mode, player position IS the camera
        return window.camera ? window.camera.position.clone() : new THREE.Vector3();
    } else if (cameraState.playerShipMesh) {
        // In 1st/3rd person, player position is the ship model
        return cameraState.playerShipMesh.position.clone();
    } else {
        // Fallback to camera position
        return window.camera ? window.camera.position.clone() : new THREE.Vector3();
    }
}

/**
 * Helper: Get current interpolated offset
 */
function getCurrentOffset() {
    if (cameraState.isTransitioning) {
        const elapsed = performance.now() - cameraState.transitionStartTime;
        const progress = Math.min(elapsed / cameraState.transitionDuration, 1);
        return new THREE.Vector3().lerpVectors(
            cameraState.transitionStartOffset,
            cameraState.transitionTargetOffset,
            progress
        );
    } else if (cameraState.mode === 'first-person') {
        return cameraState.normalFirstPersonOffset.clone();
    } else if (cameraState.mode === 'third-person') {
        return cameraState.normalThirdPersonOffset.clone();
    } else if (cameraState.mode === 'zero-offset') {
        return new THREE.Vector3(0.25, -1, 3);  // Ship behind camera
    } else {
        return cameraState.normalFirstPersonOffset.clone();
    }
}

// Export functions to window
if (typeof window !== 'undefined') {
    window.initCameraSystem = initCameraSystem;
    window.toggleCameraView = toggleCameraView;
    window.updateCameraView = updateCameraView;
    window.setThirdPersonDistance = setThirdPersonDistance;
    window.setThirdPersonHeight = setThirdPersonHeight;
    window.readdPlayerShipToScene = readdPlayerShipToScene;
    window.setCameraFirstPerson = setCameraFirstPerson;
    window.setCameraThirdPerson = setCameraThirdPerson;
    window.setCameraNoShip = setCameraNoShip;
    window.getCurrentOffset = getCurrentOffset;
    window.getPlayerPosition = getPlayerPosition;
    window.cameraState = cameraState;
    window.createThrusterGlows = createThrusterGlows;
    window.updateThrusterGlow = updateThrusterGlow;
    window.createThrusterGlowsForModel = createThrusterGlowsForModel;
    window.updateThrusterGlowArray = updateThrusterGlowArray;
    window.warpFovPulse = warpFovPulse;

    console.log('✅ Camera system loaded (with thruster glow system)');
}

/**
 * One-shot additive FOV impulse, in degrees, layered ON TOP of the camera
 * system's own zoom ease (see updateCameraView). This is the supported way
 * for warp/tunnel effects to breathe the lens: camera-system still owns
 * camera.fov every frame, so anything that writes camera.fov directly is
 * overwritten the same frame — that is the bug this exists to prevent.
 *   warpFovPulse(14, 900)  → snap 14° wider, settle back over 900ms
 *   warpFovPulse(-9, 600)  → tighten (entry anticipation)
 * Overlapping calls take the LARGER remaining impulse so an exit snap can
 * never be swallowed by a decaying entry one.
 */
function warpFovPulse(deg, durMs) {
    const d = Math.max(-25, Math.min(25, deg || 0));
    const ms = Math.max(120, durMs || 700);
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const live = cameraState._fovPulseAmp || 0;
    const k = live ? (now - cameraState._fovPulseT0) / Math.max(1, cameraState._fovPulseMs) : 1;
    const remaining = (k >= 1) ? 0 : live * (1 - k);
    cameraState._fovPulseAmp = (Math.abs(d) >= Math.abs(remaining)) ? d : remaining;
    cameraState._fovPulseT0 = now;
    cameraState._fovPulseMs = ms;
}

// =============================================================================
// THRUSTER GLOW SYSTEM
// =============================================================================

/**
 * Create thruster glow effects at the rear of the ship
 */
function createThrusterGlows(playerModel) {
    if (!playerModel || typeof THREE === 'undefined') return;

    // Clear existing glows
    cameraState.thrusterGlows.forEach(glow => {
        if (glow.parent) glow.parent.remove(glow);
        if (glow.geometry) glow.geometry.dispose();
        if (glow.material) glow.material.dispose();
    });

    cameraState.thrusterGlows = createThrusterGlowsForModel(playerModel);

    console.log(`🔥 Created ${cameraState.thrusterGlows.length} thruster glow effects`);
}

/**
 * Reusable builder: attach the same engine-exhaust glow cones the player
 * ship uses to ANY ship model (e.g. wingmen, which are clones of the
 * player model at the same 96x scale, so the fixed local exhaust
 * positions line up exactly). Returns the array of glow meshes; does NOT
 * touch cameraState, so callers own the lifecycle.
 */
function createThrusterGlowsForModel(model) {
    if (!model || typeof THREE === 'undefined') return [];
    const glows = [];

    // Two thruster positions at rear engine exhausts (local model space,
    // small values — tuned to the player ship's exhaust points).
    const thrusterPositions = [
        new THREE.Vector3(-0.022, 0, -0.125),   // Left engine exhaust
        new THREE.Vector3(0.022, 0, -0.125)     // Right engine exhaust
    ];

    thrusterPositions.forEach((pos) => {
        // Inner glow cone for engine exhaust
        const glowGeometry = new THREE.ConeGeometry(0.01, 0.035, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa00,  // Orange-yellow
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.copy(pos);
        glow.rotation.x = -Math.PI / 2;  // Cone points outward from ship
        glow.renderOrder = 101;
        glow.frustumCulled = false;
        model.add(glow);
        glows.push(glow);

        // Outer, larger, dimmer glow
        const outerGlowGeometry = new THREE.ConeGeometry(0.015, 0.05, 8);
        const outerGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6600,  // Deeper orange
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending
        });
        const outerGlow = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
        outerGlow.position.copy(pos);
        outerGlow.position.z -= 0.008;  // Slightly further back
        outerGlow.rotation.x = -Math.PI / 2;
        outerGlow.renderOrder = 100;
        outerGlow.frustumCulled = false;
        model.add(outerGlow);
        glows.push(outerGlow);
    });

    return glows;
}

/**
 * Reusable updater for a glow array built by createThrusterGlowsForModel.
 * `state` is any object that holds the ramped `.intensity` (so each ship
 * keeps its own). Mirrors updateThrusterGlow exactly.
 */
function updateThrusterGlowArray(glows, state, isThrusting) {
    if (!glows || glows.length === 0 || !state) return;

    const targetIntensity = isThrusting ? 1.0 : 0.0;
    const transitionSpeed = isThrusting ? 0.2 : 0.15;
    const cur = state.intensity || 0;
    state.intensity = cur + (targetIntensity - cur) * transitionSpeed;

    const time = Date.now() * 0.01;
    for (let index = 0; index < glows.length; index++) {
        const glow = glows[index];
        if (!glow || !glow.material) continue;
        const flicker = isThrusting ? (0.8 + Math.sin(time + index) * 0.2) : 1.0;
        const baseOpacity = index % 2 === 0 ? 0.8 : 0.4;  // Inner glows brighter
        glow.material.opacity = state.intensity * baseOpacity * flicker;
        const scale = 0.5 + state.intensity * 0.5;
        glow.scale.set(scale, scale + state.intensity * 0.3, scale);
    }
}

/**
 * Update thruster glow based on input - call this each frame
 * @param {boolean} isThrusting - Whether W key (or other thrust) is active
 */
function updateThrusterGlow(isThrusting) {
    if (cameraState.thrusterGlows.length === 0) return;
    
    // Smooth intensity transition
    const targetIntensity = isThrusting ? 1.0 : 0.0;
    const transitionSpeed = isThrusting ? 0.2 : 0.15;  // Faster on, slower off
    
    cameraState.thrusterIntensity += (targetIntensity - cameraState.thrusterIntensity) * transitionSpeed;
    
    // Update each glow
    const time = Date.now() * 0.01;
    cameraState.thrusterGlows.forEach((glow, index) => {
        if (!glow.material) return;
        
        // Flicker effect when active
        const flicker = isThrusting ? (0.8 + Math.sin(time + index) * 0.2) : 1.0;
        const baseOpacity = index % 2 === 0 ? 0.8 : 0.4;  // Inner glows brighter
        
        glow.material.opacity = cameraState.thrusterIntensity * baseOpacity * flicker;
        
        // Scale glow with intensity
        const scale = 0.5 + cameraState.thrusterIntensity * 0.5;
        glow.scale.set(scale, scale + cameraState.thrusterIntensity * 0.3, scale);
    });
    
    cameraState.thrusterActive = isThrusting;
}
