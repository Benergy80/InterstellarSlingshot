// =============================================================================
// AUTOPILOT DEMO MODE - Interstellar Slingshot
// Showcases: sightseeing, combat, nebulas, warps, shields, Borg
// =============================================================================

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  const ap = {
    active: false,
    paused: false,          // true when player has taken over via T key
    phase: 'init',
    phaseStart: 0,
    subState: 0,

    // Navigation
    navTarget: null,      // { position: THREE.Vector3 } – where to fly
    orbitTarget: null,    // planet/object to orbit
    orbitRadius: 200,
    orbitAngle: 0,

    // Combat
    combatTarget: null,

    // Feature flags (so each showcase fires once per loop)
    shieldShown: false,
    emergencyWarpShown: false,
    fpvShown: false,
    missileShown: false,
    brakingAfterWarp: false,

    // Counters
    enemiesKilled: 0,
    nebulasVisited: 0,
    warpsUsed: 0,
    loopCount: 0,

    // Ambush detection — tracks hull between frames so we can pivot into
    // combat the moment something shoots at us, even mid-transit.
    _lastHullCheck: null,
    _ambushUntil: 0,
    _lastAttacker: null,

    // HUD
    hudEl: null,
    statusText: '',
  };

  // ─── Public API ───────────────────────────────────────────────────────────
  // NOTE: `active` stays true while paused so the game loop keeps calling
  // update() and the HUD keeps ticking.  Use `driving` to know whether the
  // autopilot is actually steering the ship.
  window.demoPilot = {
    start: start,
    stop: stop,
    toggleTakeover: toggleTakeover,
    get active() { return ap.active; },
    get driving() { return ap.active && !ap.paused; },
    get paused() { return ap.paused; }
  };

  // Per-frame enemy buffs + swarm — previously only applied while demo
  // mode was active.  The user wants the same enemy difficulty in normal
  // gameplay, so we expose a handle the game-core animate loop can call
  // every frame regardless of demo state.
  window.applyEnemyBuffs = function applyEnemyBuffs() {
    if (typeof gameState === 'undefined' || !gameState.gameStarted) return;
    if (gameState.gameOver || gameState.paused) return;
    // Respect demo throttles when the demo is driving so we don't double-work
    if (ap.active && !ap.paused) return;
    const fc = gameState.frameCount || 0;
    if (fc % 60 === 0) { buffEnemiesForDemo(); buffEnemySpeed(); }
    if (fc % 3 === 0)  { swarmEnemiesNearPlayer(); }
    // Periodic world cleanup (every ~30 s) — runs in all modes so the
    // scene doesn't balloon over time.  See worldCleanup for details.
    if (fc % 1800 === 0 && fc > 0) worldCleanup();
  };

  // World cleanup — runs every ~30 s during gameplay.  Disposes orphaned
  // THREE.js meshes that the game's own cleanup missed, so the renderer
  // cache doesn't balloon.  Safe to call any time; all operations are
  // defensive and guarded.
  window.worldCleanup = function worldCleanup() {
    if (typeof scene === 'undefined' || !scene.children) return;
    let removedMeshes = 0, removedLasers = 0, removedFlashes = 0, removedPaths = 0;

    // 1) Orphaned dead enemy meshes still in scene.children
    if (typeof enemies !== 'undefined' && Array.isArray(enemies)) {
      // Snapshot of LIVE enemy objects for quick lookup
      const liveSet = new Set(enemies);
      scene.children.slice().forEach(obj => {
        if (!obj || !obj.userData) return;
        if (obj.userData.type === 'enemy' && !liveSet.has(obj) && obj.userData.health <= 0) {
          scene.remove(obj);
          obj.traverse && obj.traverse(c => {
            if (c.geometry && c.geometry.dispose) c.geometry.dispose();
            if (c.material && c.material.dispose) c.material.dispose();
          });
          removedMeshes++;
        }
      });
    }

    // 2) Laser beams that have faded to opacity 0 but weren't spliced
    if (typeof activeLasers !== 'undefined' && Array.isArray(activeLasers)) {
      for (let i = activeLasers.length - 1; i >= 0; i--) {
        const ld = activeLasers[i];
        if (!ld || !ld.material ||
            (ld.material.opacity !== undefined && ld.material.opacity <= 0.01)) {
          if (ld && ld.beam) {
            try { scene.remove(ld.beam); } catch (_) {}
            try { if (ld.geometry) ld.geometry.dispose(); } catch (_) {}
            try { if (ld.material) ld.material.dispose(); } catch (_) {}
            try { if (ld.glowGeometry) ld.glowGeometry.dispose(); } catch (_) {}
            try { if (ld.glowMaterial) ld.glowMaterial.dispose(); } catch (_) {}
          }
          activeLasers.splice(i, 1);
          removedLasers++;
        }
      }
    }

    // 2b) Enemy laser beams with faded opacity — same treatment as player
    const eArr = (typeof window !== 'undefined' && window.activeEnemyLasers) ||
                 (typeof activeEnemyLasers !== 'undefined' ? activeEnemyLasers : null);
    let removedEnemyLasers = 0;
    if (eArr && Array.isArray(eArr)) {
      for (let i = eArr.length - 1; i >= 0; i--) {
        const ld = eArr[i];
        if (!ld || !ld.material ||
            (ld.material.opacity !== undefined && ld.material.opacity <= 0.01)) {
          if (ld && ld.beam) {
            try { scene.remove(ld.beam); } catch (_) {}
            try { if (ld.geometry) ld.geometry.dispose(); } catch (_) {}
            try { if (ld.material) ld.material.dispose(); } catch (_) {}
            try { if (ld.glowGeometry) ld.glowGeometry.dispose(); } catch (_) {}
            try { if (ld.glowMaterial) ld.glowMaterial.dispose(); } catch (_) {}
          }
          eArr.splice(i, 1);
          removedEnemyLasers++;
        }
      }
    }

    // 3) Same treatment for muzzle flashes
    const flashes = (typeof window !== 'undefined' && window.activeMuzzleFlashes) ||
                    (typeof activeMuzzleFlashes !== 'undefined' ? activeMuzzleFlashes : null);
    if (flashes && Array.isArray(flashes)) {
      for (let i = flashes.length - 1; i >= 0; i--) {
        const fd = flashes[i];
        if (!fd || !fd.material ||
            (fd.material.opacity !== undefined && fd.material.opacity <= 0.01)) {
          if (fd && fd.mesh) {
            try { scene.remove(fd.mesh); } catch (_) {}
            try { if (fd.geometry) fd.geometry.dispose(); } catch (_) {}
            try { if (fd.material) fd.material.dispose(); } catch (_) {}
          }
          flashes.splice(i, 1);
          removedFlashes++;
        }
      }
    }

    // 4) Discovery paths intentionally NOT cleaned up here — they're
    // persistent mission markers (see game-physics.js: animateDiscoveryPaths
    // flips them white on completion instead of deleting).

    // 5) Force-cleanup star-trail DOM elements older than 1 s (hyperspace
    // effect — fires on every W-thrust, each creating 30 .star-trail
    // divs.  They auto-remove after 300 ms but if a browser tab was
    // suspended they can leak).
    const staleTrails = document.querySelectorAll('.star-trail');
    const nowMs = Date.now();
    let removedTrails = 0;
    staleTrails.forEach(t => {
      if (!t._demoCreatedAt) t._demoCreatedAt = nowMs;
      if (nowMs - t._demoCreatedAt > 1000) {
        t.remove();
        removedTrails++;
      }
    });

    if (removedMeshes || removedLasers || removedEnemyLasers || removedFlashes || removedPaths || removedTrails) {
      console.log('🧹 worldCleanup:',
        'enemies=' + removedMeshes,
        'lasers=' + removedLasers,
        'eLasers=' + removedEnemyLasers,
        'flashes=' + removedFlashes,
        'paths=' + removedPaths,
        'trails=' + removedTrails);
    }
  };

  // ─── Start / Stop ─────────────────────────────────────────────────────────
  function start() {
    if (ap.active) return;
    console.log('🤖 DEMO AUTOPILOT engaged');
    ap.active = true;
    resetFlags();
    goPhase('init');
    buildHUD();
    ensureThirdPerson();

    // Wrap showAchievement so shield toggles don't pile up popup stack in
    // demo mode.  preemptiveShields flips shields on/off many times per
    // combat and each toggle was triggering a stuck notification.
    if (!ap._showAchievementOriginal && typeof window.showAchievement === 'function') {
      ap._showAchievementOriginal = window.showAchievement;
      window.showAchievement = function (title, desc, playSound) {
        if (!ap.active) {
          return ap._showAchievementOriginal.call(this, title, desc, playSound);
        }
        // Suppress these during demo — they're too noisy
        if (typeof title === 'string' && (
          title.indexOf('Shields Offline') !== -1 ||
          title.indexOf('Shields Activated') !== -1 ||
          title.indexOf('Insufficient Energy') !== -1 ||
          title.indexOf('Shield System Error') !== -1
        )) return;
        return ap._showAchievementOriginal.call(this, title, desc, playSound);
      };
    }

    // Demo defaults: mouse auto-aim ON, auto-leveling OFF so the ship
    // keeps whatever roll the phase logic applies (barrel rolls, banking).
    if (typeof gameState !== 'undefined') {
      gameState.autoLevelingEnabled = false;
      gameState.mouseAiming = true;
      if (gameState.targetLock) {
        gameState.targetLock.autoAim = true;
        // Start with lock OFF — phaseCombat turns it on when engaging
        gameState.targetLock.active = false;
        gameState.targetLock.target = null;
      }
      gameState.currentTarget = null;
      // Center the virtual crosshair so forward raycasts travel straight
      if (typeof window !== 'undefined') {
        gameState.crosshairX = window.innerWidth / 2;
        gameState.crosshairY = window.innerHeight / 2;
      }
    }

    // Disable the tutorial for demo mode — no tutorial popups or forced
    // pauses.  We mark it complete and hide any alert already on screen.
    if (typeof tutorialSystem !== 'undefined') {
      tutorialSystem.active = false;
      tutorialSystem.completed = true;
      tutorialSystem.completionTime = Date.now();
    }
    const alertEl = document.getElementById('missionCommandAlert');
    if (alertEl) alertEl.classList.add('hidden');

    document.addEventListener('keydown', onKeyDown);
    notify('🤖 DEMO MODE ACTIVE', 'Autopilot engaged — press ESC to exit');
  }

  function stop() {
    if (!ap.active) return;
    ap.active = false;
    releaseKeys();
    // Disengage auto-navigate so player has full manual control
    if (typeof gameState !== 'undefined') {
      gameState.autoNavigating = false;
      gameState.autoNavOrienting = false;
    }
    removeHUD();
    document.removeEventListener('keydown', onKeyDown);
    // Restore the original showAchievement
    if (ap._showAchievementOriginal) {
      window.showAchievement = ap._showAchievementOriginal;
      ap._showAchievementOriginal = null;
    }
    console.log('🤖 DEMO AUTOPILOT disengaged');
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { stop(); return; }

    // T (toggle takeover) is handled by the global T-key binding above so
    // it also works outside demo mode.
  }

  // Global O-key binding — ALWAYS active (registered once at module load, not
  // scoped to demo start) so the player can use it during demo, during
  // takeover, or during normal gameplay.  We dispatch a synthetic Enter
  // keydown/keyup so the game's own handler fires exactly as if the player
  // pressed Enter — including all the visual + audio logic that the
  // physics-only keys.enter bypass would miss.
  function handleGlobalOKey(e) {
    if (!e || e.repeat) return;
    if (e.key !== 'o' && e.key !== 'O') return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (typeof gameState === 'undefined' || !gameState.gameStarted) return;
    if (!gameState.emergencyWarp) return;
    if (gameState.emergencyWarp.available <= 0) return;
    if (gameState.emergencyWarp.active) return;
    if (gameState.emergencyWarp.transitioning) return;
    if (typeof shieldSystem !== 'undefined' && shieldSystem.active) return;

    // Dispatch a real Enter keystroke so the game's own keydown handler
    // processes it — this fires both keys.enter AND all Enter-specific
    // code paths (warp effects, sounds, etc.).
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
    }));
    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
      }));
    }, 350);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', handleGlobalOKey);
  }

  // Global T-key binding — ALWAYS active (registered once at module load).
  // Works during normal gameplay AND demo:
  //   • Not in demo → start the demo/autopilot
  //   • In demo + driving → toggle takeover (player takes control)
  //   • In demo + paused → toggle takeover (autopilot resumes)
  function handleGlobalTKey(e) {
    if (!e || e.repeat) return;
    if (e.key !== 't' && e.key !== 'T') return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (typeof gameState === 'undefined' || !gameState.gameStarted) return;

    if (!ap.active) {
      // Regular game → engage autopilot
      start();
    } else {
      // Already in demo → toggle player takeover (this is also bound by
      // onKeyDown inside demo mode, but this global binding ensures T
      // works before and after demo start without listener re-ordering).
      toggleTakeover();
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', handleGlobalTKey);
  }

  // Global M-key binding — desktop only.  Toggles the FLIGHT CONTROLS
  // (top-left), SHIP STATUS (bottom-left), and Map (bottom-right) UI
  // panels on/off.  Hiding them during intense combat cuts DOM layout
  // cost and can noticeably improve FPS.  Mobile is untouched (mobile
  // uses its own popup UI instead of these panels).
  function isDesktopViewport() {
    return window.innerWidth > 768 && !('ontouchstart' in window);
  }
  function handleGlobalMKey(e) {
    if (!e || e.repeat) return;
    if (e.key !== 'm' && e.key !== 'M') return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!isDesktopViewport()) return;

    const panels = document.querySelectorAll(
      '.ui-panel.top-left, .ui-panel.bottom-left, .ui-panel.bottom-right'
    );
    if (!panels.length) return;
    const hide = !document.body.classList.contains('demo-ui-hidden');
    document.body.classList.toggle('demo-ui-hidden', hide);
    panels.forEach(p => { p.style.display = hide ? 'none' : ''; });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', handleGlobalMKey);
  }

  function toggleTakeover() {
    if (!ap.active) return;
    ap.paused = !ap.paused;
    if (ap.paused) {
      console.log('🕹️ Player takeover — autopilot paused');
      // Hand controls back: release every key the autopilot was holding,
      // drop target locks, and turn off shields so the player starts clean.
      releaseKeys();
      if (gameState && gameState.targetLock) {
        gameState.targetLock.active = false;
        gameState.targetLock.target = null;
      }
      if (gameState) {
        gameState.currentTarget = null;
        gameState.autoNavigating = false;
        gameState.autoNavOrienting = false;
        // Always unpause on takeover so Tab/Shields/Space all work
        gameState.paused = false;
      }
      // Hide any auto-opened mission alert so it doesn't block input
      const alertEl = document.getElementById('missionCommandAlert');
      if (alertEl) alertEl.classList.add('hidden');
      if (typeof shieldSystem !== 'undefined' && shieldSystem.active && window.deactivateShields) {
        window.deactivateShields();
      }
      setStatus('PLAYER CONTROL — press T to resume demo');
      notify('🕹️ PLAYER TAKEOVER', 'Controls yours — press T to resume demo');
      updateHUDStyle(true);
    } else {
      console.log('🤖 Autopilot resumed');
      // Restart the current phase cleanly
      ap.phaseStart = Date.now();
      setStatus('Autopilot resumed');
      notify('🤖 AUTOPILOT RESUMED', 'Demo mode re-engaged — press T to take over');
      updateHUDStyle(false);
    }
  }

  // ─── Main update (called every frame from animate()) ──────────────────────
  function update() {
    if (!ap.active) return;
    // CRITICAL: ensure the game is NEVER left paused by the demo.  The
    // game's keydown handler early-returns on gameState.paused, which
    // would block Tab (shields) during player takeover.  We reset this
    // every single frame so the player always has keyboard input.
    if (typeof gameState !== 'undefined') gameState.paused = false;
    // Paused by player — still tick HUD but never drive the ship
    if (ap.paused) { tickHUD(); return; }
    if (typeof gameState === 'undefined' || !gameState.gameStarted) return;
    if (gameState.gameOver) { gameState.gameOver = false; return; }

    // Defensively keep the tutorial system disabled every frame
    if (typeof tutorialSystem !== 'undefined' && tutorialSystem.active) {
      tutorialSystem.active = false;
      tutorialSystem.completed = true;
    }
    // Defensively keep auto-leveling off — phases apply their own roll/banking
    if (gameState.autoLevelingEnabled) gameState.autoLevelingEnabled = false;

    // Keep ship alive so the demo never ends prematurely
    if (gameState.hull < 50)   gameState.hull   = Math.min(gameState.maxHull || 100, gameState.hull + 1);
    if (gameState.energy < 40) gameState.energy = Math.min(100, gameState.energy + 1);
    if (gameState.missiles && gameState.missiles.current === 0)
      gameState.missiles.current = gameState.missiles.capacity || 3;
    // NOTE: we intentionally do NOT top up emergencyWarp.available — the
    // demo earns warps by defeating enemies (same as normal gameplay).

    // Buff every enemy so they take at least 3 laser hits.  We do this lazily:
    // first time we see an enemy, multiply its health + maxHealth by 3 and
    // tag it so we don't buff again.  The Borg cube is already 100 HP so it
    // takes plenty of hits — skip the buff for Borg so the boss stays tuned.
    // ── Throttled per-frame helpers ─────────────────────────────────────────
    // Enemy buff loops only need to run once per second (enemies don't spawn
    // faster than that).  Shield/target scans run at 10 Hz — still responsive
    // but 6x cheaper.  frameCount drives all throttles consistently.
    const fc = gameState.frameCount || 0;
    if (fc % 60 === 0)  { buffEnemiesForDemo(); buffEnemySpeed(); }
    if (fc % 30 === 0)  { preemptiveShields(); }          // 2 Hz — fewer mesh toggles
    if (fc % 3 === 0)   { swarmEnemiesNearPlayer(); }     // 20 Hz — 3x cheaper, still snappy
    if (fc % 120 === 0) { sweepStaleDiscoveryPaths(); }   // every 2 s
    if (fc % 300 === 0) { sceneHealthCheck(); }           // every 5 s — console diagnostics
    autoReadAnyTransmission();
    hideStaleLasers();
    hideStaleEnemyLasers();
    hideStaleMuzzleFlashes();
    sweepOldExplosions();
    demoRollAndBoost(fc);

    // Ambush detection — runs BEFORE the phase dispatch so a new combat
    // target can be installed on this same frame.  Skipped only during
    // the opening 'init' (ship hasn't loaded yet).  During the intro
    // orbital survey, if something opens fire on the player we pivot
    // to combat and return to the orbit after.
    if (ap.phase !== 'init') {
      detectAmbushAndRespond();
    }

    // Clear movement keys each frame; we set what we need below
    releaseMovementKeys();

    // ── Crosshair auto-fire ─────────────────────────────────────────────
    // Whenever the game's targeting system has locked onto a live enemy
    // inside the forward mouse-aim cone, pull the laser trigger.  When the
    // lock disengages (enemy dead / moves out of cone / lock cleared) the
    // firing stops automatically.  Runs parallel to phase logic so combat,
    // pursuit and travel all benefit from it.
    // No weapons during init — ship isn't loaded yet.  Auto-fire IS allowed
    // during orbitLocalPlanet so an ambush can actually be answered.
    if (ap.phase !== 'init') {
      autoFireOnTargetLock();
      shootNearbyAsteroids();
    }

    // Dispatch
    switch (ap.phase) {
      case 'init':                     phaseInit();                   break;
      case 'orbitLocalPlanet':         phaseOrbitLocalPlanet();       break;
      case 'findLocalEnemies':         phaseFindLocalEnemies();       break;
      case 'combat':                   phaseCombat();                 break;
      case 'warpToNebulaCluster':      phaseWarpToNebulaCluster();    break;
      case 'coastToNebulaCluster':     phaseCoastToNebulaCluster();   break;
      case 'orbitNebulaPlanet':        phaseOrbitNebulaPlanet();      break;
      case 'followDiscoveryPath':      phaseFollowDiscoveryPath();    break;
      case 'gotoBlackHoleGalaxy':      phaseGotoBlackHoleGalaxy();    break;
      case 'blackHoleWarp':            phaseBlackHoleWarp();          break;
      case 'coastAfterWarp':           phaseCoastAfterWarp();         break;
      case 'approachBorg':             phaseApproachBorg();           break;
      case 'fightBorg':                phaseFightBorg();              break;
      default:                         goPhase('init');
    }

    tickHUD();
  }

  // ─── Phases ───────────────────────────────────────────────────────────────
  //
  // Goal order:
  //   1) findLocalEnemies → combat (repeats until 3+ ships destroyed)
  //   2) warpToNebulaCluster (emergency warp) → coastToNebulaCluster
  //   3) orbitNebulaPlanet → triggers deep discovery → followDiscoveryPath
  //   4) combat at revealed location (combat with returnPhase)
  //   5) gotoBlackHoleGalaxy → combat at galaxy → blackHoleWarp
  //   6) coastAfterWarp → combat loop in new galaxy (repeats a few times)
  //   7) approachBorg → fightBorg → reset & loop
  // ─────────────────────────────────────────────────────────────────────────

  function phaseInit() {
    // Keep the ship completely still until the scene has established.
    // Zero velocity each frame so physics drift and residual launch
    // momentum don't move the camera before the player sees the world.
    if (typeof gameState !== 'undefined' && gameState.velocityVector) {
      gameState.velocityVector.set(0, 0, 0);
      gameState.velocity = 0;
    }

    // Don't start the demo sequence until the ship has actually loaded
    // onto the screen.  The cinematic opening keeps the ship hidden for
    // ~2 s, then fades it in with a 2 s camera transition from 0-offset
    // to 3rd-person.  We wait for:
    //   1) playerShipMesh to exist and be visible, AND
    //   2) the camera transition to be finished, AND
    //   3) the intro sequence to have reached its 'complete' phase.
    // A safety timeout (8 s) ensures we don't hang forever if one of
    // those flags is never set in this build.
    const shipReady = (() => {
      if (typeof cameraState === 'undefined') return false;
      if (!cameraState.playerShipMesh) return false;
      if (!cameraState.playerShipMesh.visible) return false;
      if (cameraState.isTransitioning) return false;
      return true;
    })();
    const introDone = (typeof introSequence === 'undefined') ||
                      !introSequence.active ||
                      introSequence.phase === 'complete';
    const safetyElapsed = elapsed() > 8000;

    if ((shipReady && introDone) || safetyElapsed) {
      ensureThirdPerson();
      ap.segmentKills = 0;
      ap.returnPhase = 'findLocalEnemies';
      goPhase('orbitLocalPlanet');
    } else {
      setStatus('Awaiting scene ready…');
    }
  }

  // ─── 1a) Orbit a local planet for 30 s before hunting enemies ────────────
  function phaseOrbitLocalPlanet() {
    const t = elapsed();

    // Pick Earth on the very first frame — the demo should open orbiting
    // Earth with the Navigation System's auto-navigate already engaged.
    if (!ap.orbitTarget) {
      ap.orbitTarget = findEarth() || planetNear(camPos(), 3000) || pickPlanet();
      if (!ap.orbitTarget) { goPhase('findLocalEnemies'); return; }
      const nm = (ap.orbitTarget.userData && ap.orbitTarget.userData.name) || 'planet';
      setStatus('Nav lock: ' + nm + ' — orbital survey');
      gameState.currentTarget = ap.orbitTarget;
      gameState.autoNavigating = true;
      if (typeof populateTargets === 'function') populateTargets();
    }

    // Auto-nav handles both approach and orbital circularization
    const dist = camPos().distanceTo(ap.orbitTarget.position);
    if (dist > 600) {
      setStatus('Approaching ' + (ap.orbitTarget.userData.name || 'planet'));
      flyToward(ap.orbitTarget, 1.8);
    } else {
      setStatus('Orbiting ' + (ap.orbitTarget.userData.name || 'planet'));
      orbitAround(ap.orbitTarget);
    }

    // After ~30 s, hand off to enemy-hunt.  A longer intro orbit lets
    // the player take in the world — planets, star field, nebulas — at
    // a relaxed pace before combat kicks off.
    if (t > 30000) {
      ap.orbitTarget = null;
      gameState.currentTarget = null;
      goPhase('findLocalEnemies');
    }
  }

  // ─── 1) Hunt down local enemies ───────────────────────────────────────────
  function phaseFindLocalEnemies() {
    const t = elapsed();
    // Shields OFF while scanning — we're travelling
    ensureShieldsFor('travel');
    ensureThirdPerson();

    // Keep the game's Navigation System target list fresh (every ~5 s, heavy DOM)
    if (typeof populateTargets === 'function' && t > 0 &&
        Date.now() - (ap._lastPopulate || 0) > 5000) {
      ap._lastPopulate = Date.now();
      populateTargets();
    }

    // First preference: an enemy the Navigation System has locked on to.
    // But if we just killed someone, respect the 1 s cooldown so the
    // explosion reads before snapping to the next target.
    if (ap._killCooldownUntil && Date.now() < ap._killCooldownUntil) {
      setStatus('Kill confirmed — scanning…');
      // Coast forward gently during the pause
      keys().w = true;
      return;
    }
    const detected = navDetectedEnemy();
    if (detected) {
      const d = camPos().distanceTo(detected.position);
      setStatus('NAV target: ' + (detected.userData.name || 'hostile') + ' · ' + (d | 0));
      // Show on the nav panel (currentTarget) but do NOT activate targetLock
      // from long range — that would make any fireWeapon call auto-aim at
      // this distant enemy.  Lock gets set by phaseCombat once we're close.
      gameState.currentTarget = detected;
      // Fly toward it aggressively
      flyToward(detected, 2.5);
      // Once inside combat range, commit to the engagement
      if (d < 2200) {
        ap.combatTarget = detected;
        ap.combatMissileFired = false;
        // TACTICAL transmission only fires ONCE per game session
        if (!ap._tacticalMsgShown) {
          ap._tacticalMsgShown = true;
          transmit('TACTICAL', 'Nav system contact confirmed!\nHostile: ' + (detected.userData.name || 'Unknown') + '\nWeapon systems online.');
        }
        goPhase('combat');
      }
      return;
    }

    // Fallback: widest sweep in case a distant enemy is the only option
    const farEnemy = nearestAliveEnemy(15000);
    if (farEnemy) {
      setStatus('Long-range contact — intercepting');
      // Nav panel only — no targetLock at this range
      gameState.currentTarget = farEnemy;
      flyToward(farEnemy, 2.5);
      return;
    }

    // Nothing on sensors — lock on to a nearby planet or object instead
    cycleScanTarget();
    flyToward({ x: camPos().x + 200, y: camPos().y, z: camPos().z + 200 }, 1.0);

    // Emergency warp to a new sector is ONLY allowed after we've defeated
    // at least 3 enemies this run (canEmergencyWarp() enforces this).
    if (t > 4000 && Date.now() - (ap.lastNebulaWarp || 0) > 20000 && canEmergencyWarp()) {
      setStatus('Empty sector — emergency warp engaged');
      transmit('PROPULSION', 'Long-range scan mode.\nEmergency warp engaged for rapid sector survey.');
      if (triggerEmergencyWarp()) {
        ap.warpStartedAt = Date.now();
        ap.lastNebulaWarp = Date.now();
      }
    }

    // Advance to the nebula objective ONLY after the first 3 kills.  If
    // we still haven't defeated anyone, keep scanning indefinitely.
    if (t > 18000 && ap.enemiesKilled >= 3) {
      goPhase('warpToNebulaCluster');
    }
  }

  // ─── Reusable combat phase (returns to ap.returnPhase when target dead) ───
  function phaseCombat() {
    const t = elapsed();
    // Shields are reactive — they pop up only when hull takes a hit (see
    // reactiveShields in the main update loop).
    ensureThirdPerson();

    const enemy = ap.combatTarget;

    // No target on entry → bounce silently, no kill notification
    if (!enemy || !enemy.userData) {
      goPhase(ap.returnPhase || 'findLocalEnemies');
      return;
    }

    // Target killed — notify exactly once per actual kill
    if (enemy.userData.health <= 0) {
      ap.enemiesKilled++;
      ap.segmentKills = (ap.segmentKills || 0) + 1;
      ap.combatMissileFired = false;
      setStatus('Target eliminated (' + ap.segmentKills + ' this segment)');
      notify('Target Eliminated', 'Enemy destroyed — hull salvage collected');
      ap.combatTarget = null;
      ensureShieldsFor('travel');
      // Clear target lock so the nav panel shows the kill, not the next enemy
      if (gameState.targetLock) {
        gameState.targetLock.active = false;
        gameState.targetLock.target = null;
      }
      gameState.currentTarget = null;

      // 1-second breather before pursuing the next target — lets the
      // explosion + salvage animation read on screen instead of
      // snapping to the next enemy instantly.
      ap._killCooldownUntil = Date.now() + 1000;

      if (ap.returnPhase === 'findLocalEnemies' && ap.segmentKills >= 3) {
        ap.segmentKills = 0;
        setTimeout(() => { if (ap.active) goPhase('warpToNebulaCluster'); }, 1000);
      } else {
        setTimeout(() => { if (ap.active) goPhase(ap.returnPhase || 'findLocalEnemies'); }, 1000);
      }
      return;
    }

    const dist = camPos().distanceTo(enemy.position);
    // Use the enemy's own firing range — that's how close we need to be for
    // a proper dog-fight (enemy fires back at us, we fire at them).
    const engageRange = enemy.userData.firingRange || 500;

    if (dist > engageRange) {
      setStatus('Pursuing ' + (enemy.userData.name || 'hostile') + ' — ' + (dist | 0) + ' u');
      flyToward(enemy, 2.5);

      // Double-tap W Jump when pursuing: any target beyond 2000 u gets the
      // 2-second short warp to close fast.  10 s cooldown + 25 energy
      // floor keeps it from firing every frame.
      if (dist > 2000 &&
          gameState.energy > 25 &&
          Date.now() - (ap._lastJumpTap || 0) > 10000) {
        ap._lastJumpTap = Date.now();
        if (window.keys) {
          window.keys.wDoubleTap = true;
          setTimeout(() => { if (window.keys) window.keys.wDoubleTap = false; }, 120);
        }
      }
    } else {
      setStatus('Engaging ' + (enemy.userData.name || 'hostile') + ' — in weapons range');
      flyToward(enemy, 0.8);

      // Strategic brake: if we're closing too fast and about to overshoot
      // the enemy, tap the brakes to stay in weapons range.  Triggers when
      // our approach velocity along the enemy-ward axis is > 1.5 AND we're
      // already inside 2/3 of engageRange.
      const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
      if (dist < engageRange * 0.67 && speed > 1.5) {
        keys().x = true;
        setStatus('Holding range — braking');
      }

      // Also brake briefly if the enemy is sitting still/slow and we're
      // sprinting right at them (approach speed > 2.5 inside 500 u)
      if (dist < 500 && speed > 2.5) {
        keys().x = true;
      }
    }

    // Always orient toward the enemy so the ship visually tracks it
    const aimDummy = { position: enemy.position };
    if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);
    gameState.currentTarget = enemy;

    // ONLY activate targetLock when inside engage range.  When outside,
    // clear it — otherwise fireWeapon auto-aims at the far-off locked
    // target whenever any fire call happens (asteroid shots, etc.),
    // producing long-range laser bolts at things the crosshair isn't on.
    if (dist <= engageRange) {
      gameState.targetLock.active = true;
      gameState.targetLock.target = enemy;
    } else {
      gameState.targetLock.active = false;
      gameState.targetLock.target = null;
    }

    // Occasional missile fire — every ~7 s while inside engagement range.
    // No transmission; status-line only keeps the HUD quiet.
    if (dist <= engageRange && gameState.missiles.current > 0 &&
        Date.now() - (ap._lastMissileTime || 0) > 2500) {
      ap._lastMissileTime = Date.now();
      ap._missileFireLock = Date.now() + 500; // hold shields off for 500 ms
      if (shieldsActive() && window.deactivateShields) window.deactivateShields();
      setTimeout(() => {
        if (ap.active) fireMissileAt(enemy);
      }, 150);
    }

    // PURSUIT DOCTRINE: do NOT disengage on timeout.  The autopilot stays on
    // the target until its health hits zero.  If the enemy outruns us, the
    // phase will still be fine — we keep chasing.
  }

  // ─── 2) Slingshot off a planet toward a nebula cluster ──────────────────
  // Instead of just punching an emergency warp, the demo now finds a planet,
  // flies into slingshot range (< 55 u), aligns its camera with the nebula,
  // and calls executeSlingshot() for a 25,000+ km/s boost along the camera
  // forward axis — propelling the ship toward the nebula at high speed.
  // Falls back to emergency warp if no suitable planet is nearby.
  function phaseWarpToNebulaCluster() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();

    // Any hostile on the nav system — break off and engage
    const intruder = navDetectedEnemy();
    if (intruder && !gameState.emergencyWarp.active && !gameState.emergencyWarp.transitioning &&
        (!gameState.slingshot || !gameState.slingshot.active)) {
      ap.combatTarget = intruder;
      ap.combatMissileFired = false;
      ap.returnPhase = 'warpToNebulaCluster';
      goPhase('combat');
      return;
    }

    setStatus('Plotting course to nebula cluster…');

    // Target the nebula cluster first
    if (!ap.currentNebula) {
      const neb = nearestNebula();
      if (!neb) { goPhase('gotoBlackHoleGalaxy'); return; }
      ap.currentNebula = neb;
    }

    // Pick a planet to slingshot around — prefer one in the same general
    // direction as the nebula so the boost actually points the right way.
    if (!ap.slingshotPlanet) {
      ap.slingshotPlanet = pickSlingshotPlanet(ap.currentNebula.position);
      if (!ap.slingshotPlanet) {
        // No planet nearby — just emergency-warp directly if we can
        if (canEmergencyWarp()) {
          const dummy = { position: ap.currentNebula.position };
          if (window.orientTowardsTarget) window.orientTowardsTarget(dummy);
          keys().w = true;
          if (t > 1500 && triggerEmergencyWarp()) {
            ap.warpStartedAt = Date.now();
            ap.warpsUsed++;
            goPhase('coastToNebulaCluster');
          }
        }
        if (t > 8000) goPhase('coastToNebulaCluster');
        return;
      }
      gameState.currentTarget = ap.slingshotPlanet;
    }

    const planetPos = ap.slingshotPlanet.position;
    const distToPlanet = camPos().distanceTo(planetPos);
    const nebPos = ap.currentNebula.position;

    // Phase 2a: fly toward the planet until we're inside slingshot range (<55u)
    if (distToPlanet > 55) {
      setStatus('Approaching ' + (ap.slingshotPlanet.userData.name || 'planet') + ' — ' + (distToPlanet | 0) + ' u');
      flyToward(planetPos, 2.0);
      if (t > 20000) {
        // Safety — can't reach the planet, fall back to direct warp
        ap.slingshotPlanet = null;
      }
      return;
    }

    // Phase 2b: we're at the planet — point camera at the nebula
    const aimDummy = { position: nebPos };
    if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);

    // Check alignment
    let aligned = false;
    if (_coneVec && camera) {
      _coneVec.subVectors(nebPos, camera.position).normalize();
      camera.getWorldDirection(_coneFwd);
      const dot = _coneFwd.dot(_coneVec);
      aligned = dot > 0.985; // cos(~10°) — a bit looser than warp alignment
    }
    setStatus(aligned
      ? 'SLINGSHOT — releasing!'
      : 'Orbiting ' + (ap.slingshotPlanet.userData.name || 'planet') + ' — aligning to nebula');

    // Phase 2c: fire the slingshot when aligned and energy available
    if (aligned && gameState.energy >= 20 &&
        !(gameState.slingshot && gameState.slingshot.active) &&
        typeof executeSlingshot === 'function') {
      executeSlingshot();
      ap.warpStartedAt = Date.now();
      ap.warpsUsed++;
      goPhase('coastToNebulaCluster');
      return;
    }

    // Safety timeout — if slingshot never fires, fall back to emergency warp
    if (t > 15000) {
      if (canEmergencyWarp() && triggerEmergencyWarp()) {
        ap.warpStartedAt = Date.now();
      }
      goPhase('coastToNebulaCluster');
    }
  }

  // Pick the nearest non-asteroid planet that's roughly in the direction of
  // the nebula (within 90° cone) so the slingshot boost points the right way.
  // Falls back to the absolute nearest planet if nothing matches.
  function pickSlingshotPlanet(nebulaPos) {
    if (typeof planets === 'undefined' || !nebulaPos) return null;
    const cp = camPos();
    const toNebula = nebulaPos.clone().sub(cp).normalize();
    let bestAligned = null, bestAlignedDist = Infinity;
    let bestAny = null, bestAnyDist = Infinity;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      const ud = p && p.userData;
      if (!ud) continue;
      if (ud.type === 'asteroid' || ud.type === 'asteroidBelt') continue;
      if (ud.type === 'blackhole') continue; // black holes have their own phase
      if (ud.name === 'Earth') continue;
      const dist = cp.distanceTo(p.position);
      if (dist > 6000) continue; // too far
      if (dist < bestAnyDist) { bestAny = p; bestAnyDist = dist; }
      const toPlanet = p.position.clone().sub(cp).normalize();
      if (toPlanet.dot(toNebula) > 0 && dist < bestAlignedDist) {
        bestAligned = p;
        bestAlignedDist = dist;
      }
    }
    return bestAligned || bestAny;
  }

  function phaseCoastToNebulaCluster() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();

    // Coast is "hot" (no braking allowed) until the emergency warp's full
    // active cycle is finished.  Physics sets emergencyWarp.active while the
    // 15 s boost is running; after that it flips to postWarp momentum coast.
    const warpCycleActive =
      (gameState.emergencyWarp && (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning)) ||
      (gameState.slingshot && gameState.slingshot.active);
    const warpMinCoastMs = (gameState.emergencyWarp && gameState.emergencyWarp.boostDuration) || 15000;
    const coastLockUntil = (ap.warpStartedAt || 0) + warpMinCoastMs;
    const inLockedCoast = warpCycleActive || Date.now() < coastLockUntil;

    const speedNow = gameState.velocityVector ? gameState.velocityVector.length() : 0;

    // While the warp cycle is locked, keep firing planet-target demos to the
    // nav system and suppress all braking / intruder break-off.
    if (inLockedCoast) {
      setStatus('Warp coast — ' + Math.max(0, ((coastLockUntil - Date.now()) / 1000)).toFixed(0) + 's remaining');
      cycleScanTarget();
      return;
    }

    // Break off to engage any detected hostile after the coast is cleared
    if (speedNow < 3) {
      const intruder = navDetectedEnemy();
      if (intruder) {
        ap.combatTarget = intruder;
        ap.combatMissileFired = false;
        ap.returnPhase = 'coastToNebulaCluster';
        goPhase('combat');
        return;
      }
    }

    const speed = speedNow;

    if (!ap.currentNebula) {
      goPhase('gotoBlackHoleGalaxy');
      return;
    }

    const distToNebula = camPos().distanceTo(ap.currentNebula.position);
    setStatus('Coasting to nebula — ' + (distToNebula | 0) + ' units');

    // Only brake when VERY close to the nebula itself — within 4000 u of
    // the nebula center (approximately the orbital-survey distance).
    // Previously we were braking at the galaxy's asteroid belt perimeter
    // (3600 u from the belt center) which could start 10 000+ u from the
    // actual nebula, leaving the ship crawling for the rest of the trip.
    const NEBULA_BRAKE_RANGE = 4000;
    if (distToNebula < NEBULA_BRAKE_RANGE) {
      setStatus('Nebula cluster — braking');
      if (!ap.brakingAfterWarp) {
        ap.brakingAfterWarp = true;
        ensureThirdPerson();
      }
      keys().x = true;
    }

    // Close to nebula — move to orbit phase.  Threshold reduced from 3500
    // to 2500 so we actually reach the nebula before switching modes.
    if (distToNebula < 2500 && speed < 1.5) {
      ap.brakingAfterWarp = false;
      goPhase('orbitNebulaPlanet');
      return;
    }

    // Stall recovery
    if (speed < 0.2 && t > 5000 && distToNebula > 500) {
      const dummy = { position: ap.currentNebula.position };
      if (window.orientTowardsTarget) window.orientTowardsTarget(dummy);
      keys().w = true;
    }

    // Safety timeout
    if (t > 45000) {
      ap.brakingAfterWarp = false;
      goPhase('orbitNebulaPlanet');
    }
  }

  // ─── 3) Target a planet in the cluster, orbit, unlock discovery ──────────
  function phaseOrbitNebulaPlanet() {
    const t = elapsed();
    ensureShieldsFor('travel');
    // Stay in 3rd person throughout the demo
    ensureThirdPerson();

    // Break off to pursue any detected hostile
    const intruder = navDetectedEnemy();
    if (intruder) {
      ap.combatTarget = intruder;
      ap.combatMissileFired = false;
      ap.returnPhase = 'orbitNebulaPlanet';
      if (!ap._tacticalMsgShown) {
        ap._tacticalMsgShown = true;
        transmit('TACTICAL', 'Hostile contact during survey!\nEngaging intruder — orbit paused.');
      }
      goPhase('combat');
      return;
    }

    if (!ap.orbitTarget) {
      // Prefer a real planet near the nebula; fall back to the nebula itself
      ap.orbitTarget =
        (ap.currentNebula && planetNear(ap.currentNebula.position, 8000)) ||
        (ap.currentNebula ? { position: ap.currentNebula.position.clone(), userData: { name: ap.currentNebula.userData.name || 'Nebula Core', radius: 120 } } : pickPlanet());

      if (ap.orbitTarget) {
        const nm = ap.orbitTarget.userData ? ap.orbitTarget.userData.name : 'nebula planet';
        setStatus('Targeting ' + nm + ' for orbital survey');
        transmit('NAVIGATION SYSTEM', 'Target locked: ' + nm + '\nEstablishing orbital trajectory.\nPerforming science scans.');
        gameState.currentTarget = ap.orbitTarget;
      }
    }

    // Auto-nav handles approach and orbital circularization
    if (ap.orbitTarget) {
      const dist = camPos().distanceTo(ap.orbitTarget.position);
      if (dist > 600) {
        setStatus('Approaching ' + (ap.orbitTarget.userData.name || 'planet'));
        flyToward(ap.orbitTarget, 1.2);
      } else {
        setStatus('Slow orbit — ' + (ap.orbitTarget.userData.name || 'planet'));
        orbitAround(ap.orbitTarget);
      }
    }

    // Force discovery after we've been orbiting a while
    if (t > 12000 && typeof checkForNebulaDeepDiscovery === 'function') {
      checkForNebulaDeepDiscovery();
    }

    // Move on to follow the dotted line after 20 s of orbits
    if (t > 20000) {
      goPhase('followDiscoveryPath');
    }
  }

  // ─── 4) Follow dotted line → fight revealed enemies ─────────────────────
  function phaseFollowDiscoveryPath() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();
    const paths = window.discoveryPaths || [];
    const path = paths.length > 0 ? paths[paths.length - 1] : null;
    const endPos = path && path.line && path.line.userData && path.line.userData.endPosition;

    // Check for an enemy in front of us as we travel
    const enemyAhead = nearestAliveEnemy(3500);
    if (enemyAhead) {
      setStatus('Revealed hostile acquired');
      if (!ap._tacticalMsgShown) {
        ap._tacticalMsgShown = true;
        transmit('TACTICAL', 'Revealed enemy forces engaged!\nEliminating hostile.');
      }
      ap.combatTarget = enemyAhead;
      ap.returnPhase = 'followDiscoveryPath';
      goPhase('combat');
      return;
    }

    if (endPos) {
      const dist = camPos().distanceTo(endPos);
      setStatus('Following discovery path — ' + (dist | 0) + ' units');
      if (dist > 300) {
        flyToward(endPos, 2.0);
      } else {
        // At end of path — look for enemies
        const near = nearestAliveEnemy(5000);
        if (near) {
          ap.combatTarget = near;
          ap.returnPhase = 'followDiscoveryPath';
          goPhase('combat');
        } else {
          // Cleared — move to black hole galaxy phase
          ap.segmentKills = 0;
          goPhase('gotoBlackHoleGalaxy');
        }
        return;
      }
    } else {
      // No active path — just look for enemies or move on
      if (t > 3000) goPhase('gotoBlackHoleGalaxy');
    }

    // Safety timeout
    if (t > 60000) goPhase('gotoBlackHoleGalaxy');
  }

  // ─── 5) Travel to a black hole galaxy and fight enemies there ────────────
  function phaseGotoBlackHoleGalaxy() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();

    // Any detected hostile → engage first
    const intruder = navDetectedEnemy();
    if (intruder) {
      ap.combatTarget = intruder;
      ap.combatMissileFired = false;
      ap.returnPhase = 'gotoBlackHoleGalaxy';
      goPhase('combat');
      return;
    }

    setStatus('Plotting course to black hole galaxy…');

    if (!ap.currentBH) {
      ap.currentBH = nearestBlackHole();
      if (!ap.currentBH) { goPhase('approachBorg'); return; }
      transmit('NAVIGATION', 'Black hole galaxy targeted.\nCourse locked — approach in progress.');
    }

    const distToBH = camPos().distanceTo(ap.currentBH.position);

    // While approaching, fight any enemies we encounter
    const enemy = nearestAliveEnemy(2500);
    if (enemy && distToBH > 800) {
      ap.combatTarget = enemy;
      ap.returnPhase = 'gotoBlackHoleGalaxy';
      goPhase('combat');
      return;
    }

    if (distToBH > 500) {
      setStatus('Approaching ' + (ap.currentBH.userData.name || 'black hole') + ' — ' + (distToBH | 0));
      flyToward(ap.currentBH, 2.5);
    } else {
      // Close to event horizon — switch to warp phase (physics takes over)
      setStatus('Event horizon — initiating warp');
      goPhase('blackHoleWarp');
    }
  }

  // ─── 6) Black hole warp → coast → fight more enemies ─────────────────────
  // The physics owns the warp sequence once the player is near the event
  // horizon.  If the autopilot keeps setting keys.w and flyToward, the ship
  // fights the physics pull, overshoots, and glitches after the teleport.
  // Hands-off approach: only nudge toward the BH when clearly far away and
  // stop ALL input once the warp machinery has engaged.
  function phaseBlackHoleWarp() {
    const t = elapsed();
    ensureShieldsFor('travel');
    // Release any lingering movement keys so physics gets clean input
    releaseMovementKeys();

    // Detect that the warp has started: either event horizon proximity,
    // active slingshot/blackHoleWarp state, or very high velocity.
    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
    const warpEngaged =
      (gameState.eventHorizonWarning && gameState.eventHorizonWarning.active) ||
      (gameState.slingshot && gameState.slingshot.active) ||
      gameState.isBlackHoleWarping ||
      speed > 5;

    if (warpEngaged) {
      // Hands OFF — let the physics/warp code run.  No thrust, no orient,
      // no brake.  Just wait for the teleport to complete.
      setStatus('WARPING — hands off controls');
    } else if (ap.currentBH) {
      const dist = camPos().distanceTo(ap.currentBH.position);
      // Only nudge toward the BH if we're still clearly far away.  Inside
      // 400 u the physics gravitational pull does the rest; we just coast.
      if (dist > 400) {
        setStatus('Diving toward event horizon — ' + (dist | 0) + ' u');
        const dummy = { position: ap.currentBH.position };
        if (window.orientTowardsTarget) window.orientTowardsTarget(dummy);
        keys().w = true;
      } else {
        setStatus('Coasting into event horizon — ' + (dist | 0) + ' u');
      }
    }

    // Exit this phase when the warp has visibly completed: we either got
    // flung away at high speed, or 8 s have passed (safety).
    if (speed > 10 || t > 8000) {
      ap.currentBH = null;
      ap.brakingAfterWarp = false;
      ap.warpsUsed++;
      ap.warpStartedAt = Date.now();
      releaseMovementKeys();
      // Full target reset — we've teleported across the universe, so every
      // pre-warp target (combat, nebula, discovery path, nav lock, attacker)
      // is now thousands of units away.  Clearing them forces the post-warp
      // phases to rediscover hostiles local to the new galaxy instead of
      // trying to fly back to the old one.
      resetTargetsAfterWarp();
      goPhase('coastAfterWarp');
    }
  }

  function phaseCoastAfterWarp() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();

    // Reset post-warp evasion flag on first entry so a fresh arrival
    // always gets the short W-jump escape.
    if (ap.subState === 0) {
      ap._postBHEvasionDone = false;
      ap.subState = 1;
    }

    // Coast lock — same rule as emergency warp: don't brake while the warp's
    // active/transition/slingshot phase is running, and keep coasting until
    // at least the full boost duration has elapsed.
    const warpCycleActive =
      (gameState.emergencyWarp && (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning)) ||
      (gameState.slingshot && gameState.slingshot.active);
    const warpMinCoastMs = (gameState.emergencyWarp && gameState.emergencyWarp.boostDuration) || 15000;
    const coastLockUntil = (ap.warpStartedAt || 0) + warpMinCoastMs;
    const inLockedCoast = warpCycleActive || Date.now() < coastLockUntil;

    const speedNow = gameState.velocityVector ? gameState.velocityVector.length() : 0;

    // Lock onto the nearest enemy as soon as one is visible in the new
    // galaxy — this puts them on the nav panel during the coast so the
    // demo has a clear engagement target when the coast lock ends.
    if (!gameState.currentTarget || !gameState.currentTarget.userData ||
        gameState.currentTarget.userData.health <= 0) {
      const nearestE = nearestAliveEnemy(8000);
      if (nearestE) gameState.currentTarget = nearestE;
    }

    if (inLockedCoast) {
      setStatus('Warp coast — ' + Math.max(0, ((coastLockUntil - Date.now()) / 1000)).toFixed(0) + 's remaining');
      cycleScanTarget();
      return;
    }

    // Post-warp evasion — on first exit from the locked coast, fire a
    // double-tap W jump aimed away from any nearby black hole.  This
    // moves the ship clear of gravity wells that might be sitting at
    // the arrival point of the previous warp.
    if (!ap._postBHEvasionDone &&
        gameState.energy >= 25 &&
        !warpCycleActive) {
      ap._postBHEvasionDone = true;
      const bh = nearestBlackHole();
      if (bh && camPos().distanceTo(bh.position) < 8000) {
        // Orient away from the black hole so the short-warp boost carries
        // the ship safely clear of the gravity well.
        const awayPos = camPos().clone().multiplyScalar(2).sub(bh.position);
        const awayDummy = { position: awayPos };
        if (window.orientTowardsTarget) window.orientTowardsTarget(awayDummy);
      }
      if (window.keys) {
        window.keys.wDoubleTap = true;
        setTimeout(() => { if (window.keys) window.keys.wDoubleTap = false; }, 120);
      }
      setStatus('Post-warp evasion — short jump engaged');
      return;
    }

    // After warp coast is over, engage any hostile the nav system sees
    if (speedNow < 3) {
      const intruder = navDetectedEnemy();
      if (intruder) {
        ap.combatTarget = intruder;
        ap.combatMissileFired = false;
        ap.returnPhase = 'gotoBlackHoleGalaxy';
        goPhase('combat');
        return;
      }
    }

    const speed = speedNow;

    // Find nearest asteroid belt to current position
    const belt = nearestAsteroidBelt();

    if (belt) {
      const beltCenter = belt.userData.blackHolePosition || belt.position;
      const beltRadius = belt.userData.radius || 2000;
      const distToBelt = camPos().distanceTo(beltCenter);

      if (distToBelt < beltRadius * 1.5) {
        setStatus('Entering galaxy rings — braking');
        if (!ap.brakingAfterWarp) {
          ap.brakingAfterWarp = true;
          transmit('NAVIGATION', 'Galaxy approach confirmed!\nReducing velocity — entering asteroid belt perimeter.');
          ensureThirdPerson();
        }
        keys().x = true;

        if (speed < 0.6) {
          ap.brakingAfterWarp = false;
          setStatus('Velocity nominal — exploring new galaxy');
          notify('Galaxy Reached', 'Entered new system — hunting hostiles');
          ap.loopCount++;
          ap.segmentKills = 0;

          // Immediately lock onto the nearest enemy in this new galaxy so
          // the autopilot starts engaging right away instead of drifting
          // around looking for a target.
          const nearest = nearestAliveEnemy(15000);
          if (nearest) {
            // Nav panel only — phaseCombat handles the targetLock once close
            gameState.currentTarget = nearest;
            const distToNearest = camPos().distanceTo(nearest.position);
            if (distToNearest < 2500) {
              ap.combatTarget = nearest;
              ap.combatMissileFired = false;
              ap.returnPhase = 'gotoBlackHoleGalaxy';
              goPhase('combat');
              return;
            }
          }

          // After a couple of post-warp combat loops, go face the Borg
          if (ap.loopCount >= 2) {
            goPhase('approachBorg');
          } else {
            ap.returnPhase = 'gotoBlackHoleGalaxy';
            goPhase('findLocalEnemies');
          }
        }
        return;
      }
    }

    // Mid-coast: gently thrust if we've stalled
    if (speed < 0.3 && t > 5000) keys().w = true;

    if (t > 30000) {
      ap.brakingAfterWarp = false;
      ap.returnPhase = 'gotoBlackHoleGalaxy';
      goPhase('findLocalEnemies');
    }
  }

  // ─── 7) Outer reaches — Borg ─────────────────────────────────────────────
  function phaseApproachBorg() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();
    setStatus('Heading to outer reaches — Borg territory');
    if (t < 200) {
      transmit('LONG RANGE SENSORS', 'Massive unknown vessel detected at extreme range.\nWARNING: Borg Collective signature confirmed.\nAll hands to battle stations.');
    }

    const distFromOrigin = camPos().length();

    if (distFromOrigin < 70000) {
      if (canEmergencyWarp() && t > 3000) {
        // Face away from origin and punch it
        const outward = camPos().clone().multiplyScalar(2);
        const dummy = { position: outward };
        if (window.orientTowardsTarget) window.orientTowardsTarget(dummy);
        if (triggerEmergencyWarp()) {
          ap.warpStartedAt = Date.now();
        }
      } else {
        flyToward({ x: 80000, y: 0, z: 0 }, 3.0);
      }
    } else {
      if (!gameState.borg.spawned && window.spawnBorgCube) {
        window.spawnBorgCube();
      }
      setStatus('Borg detected!');
      goPhase('fightBorg');
    }

    if (t > 120000) goPhase('fightBorg');
  }

  function phaseFightBorg() {
    const t = elapsed();
    // Shields are reactive — they pop up on hull damage
    const borgCube = gameState.borg && gameState.borg.cube;
    const borgDrones = gameState.borg && gameState.borg.drones
      ? gameState.borg.drones.filter(d => d.userData && d.userData.health > 0)
      : [];

    let target = null;
    if (borgDrones.length > 0) {
      target = borgDrones.reduce((a, b) =>
        camPos().distanceTo(a.position) < camPos().distanceTo(b.position) ? a : b);
    } else if (borgCube && borgCube.userData && borgCube.userData.health > 0) {
      target = borgCube;
    }

    if (target) {
      ap.combatTarget = target;
      const dist = camPos().distanceTo(target.position);
      setStatus('ENGAGING BORG — ' + (dist | 0) + ' units');
      if (dist > 800) flyToward(target, 2.0);
      else            flyToward(target, 0.8);

      const engageRange = (target.userData && target.userData.firingRange) || 500;
      const aimDummy = { position: target.position };
      if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);
      gameState.targetLock.active = true;
      gameState.targetLock.target = target;
      gameState.currentTarget = target;

      // Occasional missile every ~7 s — no transmission
      if (dist <= engageRange && gameState.missiles.current > 0 &&
          Date.now() - (ap._lastMissileTime || 0) > 2500) {
        ap._lastMissileTime = Date.now();
        ap._missileFireLock = Date.now() + 500;
        if (shieldsActive() && window.deactivateShields) window.deactivateShields();
        setTimeout(() => { if (ap.active) fireMissileAt(target); }, 150);
      }
    } else {
      setStatus('Borg neutralized — VICTORY');
      transmit('MISSION CONTROL', 'Outstanding work, Captain!\nBorg threat eliminated.\nReturning to patrol route.');
      notify('BORG DEFEATED', 'Threat eliminated — restarting demo…');
      setTimeout(() => {
        if (ap.active) {
          resetFlags();
          ap.segmentKills = 0;
          ap.loopCount = 0;
          ap.returnPhase = 'findLocalEnemies';
          goPhase('findLocalEnemies');
        }
      }, 8000);
    }

    if (t > 180000) {
      resetFlags();
      ap.segmentKills = 0;
      ap.loopCount = 0;
      ap.returnPhase = 'findLocalEnemies';
      goPhase('findLocalEnemies');
    }
  }

  // ─── Navigation helpers ────────────────────────────────────────────────────

  // Reusable vectors to avoid per-frame allocation
  const _flyVec = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

  function flyToward(pos, speedMult) {
    if (typeof gameState === 'undefined') return;
    speedMult = speedMult || 1.0;

    // Build or reuse a target object that auto-nav can consume
    let targetObj;
    if (pos && pos.userData) {
      targetObj = pos;
    } else {
      if (!ap._navDummy) ap._navDummy = { position: new THREE.Vector3(), userData: {} };
      if (pos && pos.position) ap._navDummy.position.copy(pos.position);
      else if (pos && pos.isVector3) ap._navDummy.position.copy(pos);
      else ap._navDummy.position.set(pos.x || 0, pos.y || 0, pos.z || 0);
      targetObj = ap._navDummy;
    }

    // Delegate movement to the game's auto-navigate system.  We never
    // toggle autoNavOrienting here — the physics still orients the ship
    // passively during distant approach (see game-physics.js auto-nav
    // branch), so skipping the orienting flag keeps the "Target Acquired"
    // notification from spamming every time the demo switches targets.
    gameState.currentTarget = targetObj;
    gameState.autoNavigating = true;
    if (speedMult > 1.5) keys().b = true;
  }

  function orbitAround(centerObj) {
    // Auto-nav already handles orbital approach and circularization,
    // so just keep it pointed at the target.
    flyToward(centerObj, 1.0);
  }

  // Reusable vectors for isInFiringCone to avoid GC pressure
  const _coneVec = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  const _coneFwd = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

  // Returns true if target is within the ship's forward mouse-aim cone.
  // ~14° half-angle matches how a player lines up shots with the crosshair.
  function isInFiringCone(target, maxRangeOverride) {
    if (!target || typeof camera === 'undefined' || !_coneVec) return false;
    const pos = target.position || target;
    _coneVec.subVectors(pos, camera.position);
    const dist = _coneVec.length();
    const maxRange = maxRangeOverride || 2000;
    if (dist > maxRange || dist < 1) return false;
    _coneVec.normalize();
    camera.getWorldDirection(_coneFwd);
    const dot = _coneFwd.dot(_coneVec);
    return dot > 0.97; // cos(~14°) — tight forward cone
  }

  // Find any enemy OR asteroid inside the firing cone
  function findTargetInFiringCone(maxRange) {
    // Enemies first
    if (typeof enemies !== 'undefined') {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.userData || e.userData.health <= 0) continue;
        if (isInFiringCone(e, maxRange)) return e;
      }
    }
    // Then asteroids
    if (typeof planets !== 'undefined') {
      for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        if (!p.userData || p.userData.type !== 'asteroid') continue;
        if (p.userData.health <= 0) continue;
        if (isInFiringCone(p, maxRange)) return p;
      }
    }
    return null;
  }

  function aimAndFireLaserAt(target) {
    if (!target) return;
    const dummy = { position: target.position };
    if (window.orientTowardsTarget) window.orientTowardsTarget(dummy);

    // Set target lock for auto-aim (enemies + asteroids)
    gameState.targetLock.active = true;
    gameState.targetLock.target = target;
    gameState.currentTarget = target;

    // Only fire inside the enemy's own firing range AND when lined up
    const engageRange = (target.userData && target.userData.firingRange) || 500;
    const dist = camPos().distanceTo(target.position);
    if (dist > engageRange) return;
    if (!isInFiringCone(target, engageRange + 100)) return;

    const now = Date.now();
    if (now - ap.lastFire > 1000 && gameState.weapons.cooldown <= 0 && gameState.weapons.energy >= 10) {
      ap.lastFire = now;
      gameState.crosshairX = window.innerWidth / 2;
      gameState.crosshairY = window.innerHeight / 2;
      if (window.fireWeapon) window.fireWeapon();
    }
  }

  function fireMissileAt(target) {
    if (!target) return;
    gameState.currentTarget = target;
    if (window.fireMissile) window.fireMissile();
  }

  // Fire lasers ONLY when the game's auto mouse targeting has engaged on a
  // live enemy — i.e. the enemy is inside gameState.targetLock.range (the
  // game's auto-aim bubble).  Runs during combat and Borg fight phases.
  // Stops firing the instant the lock drops or the target moves out of
  // auto-aim range.
  function autoFireOnTargetLock() {
    if (ap.phase !== 'combat' && ap.phase !== 'fightBorg') return;
    if (!gameState || !gameState.targetLock || !gameState.targetLock.active) return;
    const tgt = gameState.targetLock.target;
    if (!tgt || !tgt.userData) return;
    // Only fire on enemies, never on asteroids/planets/etc.
    if (tgt.userData.type !== 'enemy' && !tgt.userData.isBorg) return;
    if (tgt.userData.health <= 0) return;

    // Only fire when inside the enemy's own firing range — the distance at
    // which the enemy shoots back at us, creating a proper dogfight.
    const engageRange = (tgt.userData && tgt.userData.firingRange) || 500;
    const dist = camPos().distanceTo(tgt.position);
    if (dist > engageRange) return;

    const now = Date.now();
    if (now - (ap.lastFire || 0) < 1000) return;
    if (gameState.weapons.cooldown > 0 || gameState.weapons.energy < 10) return;

    // Keep rotating toward the target for visual presentation, but do
    // NOT gate firing on alignment or firing-cone checks.  fireWeapon
    // auto-aims at targetLock's world position, so the laser bolt
    // already travels from the ship to the locked enemy regardless of
    // ship facing.  Previously the strict 5°/14° gates meant lasers
    // rarely fired while shields were up — shields imply combat, the
    // ship is banking/turning, alignment flips on and off — giving the
    // impression that lasers were disabled by shields.
    if (window.orientTowardsTarget) {
      window.orientTowardsTarget({ position: tgt.position });
    }

    ap.lastFire = now;
    gameState.crosshairX = window.innerWidth / 2;
    gameState.crosshairY = window.innerHeight / 2;
    if (window.fireWeapon) window.fireWeapon();
  }

  // Shoot asteroids that drift into targeting range.  Asteroids can't be
  // auto-aimed via targetLock (the game explicitly excludes them), so we
  // orient toward the asteroid and fire with the crosshair centered —
  // the raycast from center-screen hits the asteroid we're pointing at.
  // Uses a separate cooldown so it doesn't compete with enemy fire timing.
  function shootNearbyAsteroids() {
    if (ap._killCooldownUntil && Date.now() < ap._killCooldownUntil) return;
    if (!gameState || gameState.weapons.cooldown > 0 || gameState.weapons.energy < 10) return;

    const now = Date.now();
    if (now - (ap._lastAsteroidFire || 0) < 1600) return;

    if (typeof planets === 'undefined') return;
    const cp = camPos();
    let best = null, bestDist = 300;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      if (!p || !p.userData) continue;
      if (p.userData.type !== 'asteroid' || (p.userData.health !== undefined && p.userData.health <= 0)) continue;
      const d = cp.distanceTo(p.position);
      if (d < bestDist && isInFiringCone(p, 300)) {
        bestDist = d;
        best = p;
      }
    }
    if (!best) return;

    const dummy = { position: best.position };
    const aligned = window.orientTowardsTarget ? window.orientTowardsTarget(dummy) : false;
    if (!aligned) return;

    gameState.crosshairX = window.innerWidth / 2;
    gameState.crosshairY = window.innerHeight / 2;
    ap._lastAsteroidFire = now;
    if (window.fireWeapon) window.fireWeapon();
  }

  // Emergency warp is gated: the autopilot is NOT allowed to use its own
  // warp charges until at least 3 enemies have been defeated this demo run.
  // Returns true if the warp actually fired.
  function canEmergencyWarp() {
    if (!gameState.emergencyWarp) return false;
    if (ap.enemiesKilled < 3) return false;
    if (gameState.emergencyWarp.available <= 0) return false;
    if (gameState.emergencyWarp.active) return false;
    if (gameState.emergencyWarp.transitioning) return false;
    if (typeof shieldSystem !== 'undefined' && shieldSystem.active) return false;
    return true;
  }

  function triggerEmergencyWarp() {
    if (!canEmergencyWarp()) return false;
    keys().enter = true;
    setTimeout(() => { keys().enter = false; }, 100);
    return true;
  }

  // Hide lasers after 400 ms by setting .visible = false.  This does NOT
  // touch scene.remove() or material.dispose() — we leave ALL disposal to
  // the game's native fade setInterval so we never race with it.
  const DEMO_BEAM_HIDE_MS = 400;
  function hideStaleLasers() {
    if (typeof activeLasers === 'undefined') return;
    const now = Date.now();
    for (let i = 0; i < activeLasers.length; i++) {
      const ld = activeLasers[i];
      if (!ld || !ld.beam) continue;
      if (!ld._demoCreatedAt) ld._demoCreatedAt = now;
      if (now - ld._demoCreatedAt > DEMO_BEAM_HIDE_MS && ld.beam.visible) {
        ld.beam.visible = false;
        if (ld.material)     ld.material.opacity     = 0;
        if (ld.glowMaterial) ld.glowMaterial.opacity = 0;
      }
    }
  }

  // Discovery paths are created when the player deep-discovers a nebula and
  // never cleaned up by the game.  Over a long demo run they accumulate
  // LineSegments + Points meshes = growing GPU buffer and render cost.
  // Any path whose target galaxy has NO live enemies left is dead —
  // dispose it.
  // Discovery paths are now PERSISTENT mission markers — they stay in the
  // scene permanently, turn white when complete, and the path-animation
  // system in game-physics.js handles color updates.  This function is
  // kept as a no-op for the scheduled throttle call that references it.
  function sweepStaleDiscoveryPaths() { /* intentionally empty */ }

  // Diagnostic: log scene / array sizes every 5 s so we can spot leaks.
  function sceneHealthCheck() {
    if (!ap.active) return;
    const parts = [];
    if (typeof scene !== 'undefined') parts.push('scene=' + scene.children.length);
    if (typeof enemies !== 'undefined') parts.push('enemies=' + enemies.length);
    if (typeof activeLasers !== 'undefined') parts.push('lasers=' + activeLasers.length);
    if (typeof window !== 'undefined' && window.activeMuzzleFlashes) parts.push('flashes=' + window.activeMuzzleFlashes.length);
    if (typeof explosionManager !== 'undefined') parts.push('explosions=' + explosionManager.activeExplosions.length);
    if (typeof window !== 'undefined' && window.discoveryPaths) parts.push('paths=' + window.discoveryPaths.length);
    console.log('🤖 demo health:', parts.join(' '));
  }

  // Hide enemy lasers the same way we hide player lasers — after 400 ms
  // they become invisible via .visible = false and zeroed opacity.  The
  // game's fade setInterval continues to handle actual disposal.  Enemy
  // beams were previously untouched by any demo cleanup; if their
  // setInterval misfired (backgrounded tab, heavy frame drops, etc.)
  // they could linger indefinitely.
  function hideStaleEnemyLasers() {
    const arr = (typeof window !== 'undefined' && window.activeEnemyLasers) ||
                (typeof activeEnemyLasers !== 'undefined' ? activeEnemyLasers : null);
    if (!arr) return;
    const now = Date.now();
    for (let i = 0; i < arr.length; i++) {
      const ld = arr[i];
      if (!ld || !ld.beam) continue;
      if (!ld._demoMarkTime) ld._demoMarkTime = ld.createdAt || now;
      if (now - ld._demoMarkTime > DEMO_BEAM_HIDE_MS && ld.beam.visible) {
        ld.beam.visible = false;
        if (ld.material)     ld.material.opacity     = 0;
        if (ld.glowMaterial) ld.glowMaterial.opacity = 0;
      }
    }
  }

  // Hide muzzle flashes with the same timing as lasers.  These are the green
  // flashes at the ship's gun origin points — they use their own setInterval
  // fade, and like the lasers they can visually persist longer than
  // intended during heavy autopilot firing.  Same safe pattern: just toggle
  // .visible / zero opacity, never touch scene.remove / dispose.
  function hideStaleMuzzleFlashes() {
    const flashes = (typeof window !== 'undefined' && window.activeMuzzleFlashes) ||
                    (typeof activeMuzzleFlashes !== 'undefined' ? activeMuzzleFlashes : null);
    if (!flashes) return;
    const now = Date.now();
    for (let i = 0; i < flashes.length; i++) {
      const fd = flashes[i];
      if (!fd || !fd.mesh) continue;
      if (!fd._demoCreatedAt) fd._demoCreatedAt = now;
      if (now - fd._demoCreatedAt > DEMO_BEAM_HIDE_MS && fd.mesh.visible) {
        fd.mesh.visible = false;
        if (fd.material) fd.material.opacity = 0;
      }
    }
  }

  // Force-complete any explosion that's been running longer than 1.5 s.
  // Like hideStaleLasers, we don't fight the manager — we just set the
  // explosion's opacity/particleLife to 0 so its own update() returns false
  // on the next tick and the manager cleans it up naturally.
  function sweepOldExplosions() {
    if (typeof explosionManager === 'undefined') return;
    const exps = explosionManager.activeExplosions;
    if (!exps || !exps.length) return;
    const now = Date.now();
    for (let i = 0; i < exps.length; i++) {
      const ex = exps[i];
      if (!ex) continue;
      if (!ex._demoCreatedAt) ex._demoCreatedAt = now;
      if (now - ex._demoCreatedAt > 500) {
        // Zero the animation variables so the manager's next update()
        // returns false and runs cleanup().  We touch nothing else.
        if (ex.update) {
          // Patch the update to return false immediately
          ex.update = () => false;
        }
      }
    }
  }

  // Barrel rolls + banking + evasive snap-rolls + short W-tap boosts.
  // The roll strategy is context-aware:
  //   IN COMBAT (in weapons range):   full 360° barrel roll attack runs
  //   IN PURSUIT (out of range):      banking weaves (roll + yaw together)
  //   IN TRAVEL:                      gentle periodic barrel rolls
  //   ANY PHASE on hull damage:       one-shot snap-roll evasion (1 s)
  function demoRollAndBoost(fc) {
    const k = keys();
    const inCombatPhase = ap.phase === 'combat' || ap.phase === 'fightBorg';

    // ── Damage-triggered snap-roll (overrides other rolls) ────────────────
    // When hull drops, schedule 1 s of continuous Q roll (one full ~360°
    // barrel) and a short E strafe for evasion.  Runs until snapRollUntil
    // expires.  We detect damage by comparing current hull to ap._rollHull.
    const hull = (typeof gameState !== 'undefined' && gameState.hull) || 100;
    if (ap._rollHull === undefined) ap._rollHull = hull;
    if (hull < ap._rollHull - 0.5 && (!ap._snapRollUntil || Date.now() > ap._snapRollUntil)) {
      ap._snapRollUntil = Date.now() + 1000;
      ap._snapRollDir   = Math.random() < 0.5 ? 'q' : 'e';
      ap._snapStrafeDir = Math.random() < 0.5 ? 'a' : 'd';
    }
    ap._rollHull = hull;

    if (ap._snapRollUntil && Date.now() < ap._snapRollUntil) {
      if (ap._snapRollDir === 'q') k.q = true; else k.e = true;
      if (ap._snapStrafeDir === 'a') k.a = true; else k.d = true;
      return; // skip normal roll pattern while evading
    }

    if (inCombatPhase) {
      const enemy = ap.combatTarget;
      const engageRange = (enemy && enemy.userData && enemy.userData.firingRange) || 500;
      const dist = enemy && enemy.position ? camPos().distanceTo(enemy.position) : 99999;

      if (dist < engageRange + 100) {
        // IN WEAPONS RANGE — barrel-roll attack.  Full 360° rolls (~2 s of
        // sustained Q, then ~2 s of sustained E) keep the ship spinning
        // while auto-aim stays locked on (roll doesn't move pitch/yaw).
        const atkCycle = fc % 360;              // 6 s period
        if (atkCycle < 120)      { k.q = true; } // first 2 s: Q roll
        else if (atkCycle < 240) { /* idle 2 s */ }
        else if (atkCycle < 360) { k.e = true; } // last 2 s: E roll
      } else {
        // PURSUIT — banking weave: roll + yaw together for a dynamic
        // approach instead of straight flat flight.  4 s period.
        const wvCycle = fc % 240;
        if (wvCycle < 60)        { k.q = true; k.left = true; }   // bank left
        else if (wvCycle < 120)  { /* coast 1 s */ }
        else if (wvCycle < 180)  { k.e = true; k.right = true; }  // bank right
        else                     { /* coast 1 s */ }
      }
    } else {
      // TRAVEL — gentle barrel rolls every ~8 s, self-cancelling so the
      // ship stays roughly level.
      const rCycle = fc % 480;
      if (rCycle < 60)       { k.q = true; }
      else if (rCycle < 120) { k.e = true; }

      // Short 0.5 s boost pulse every 8 s
      if (rCycle < 30) k.b = true;
    }
  }

  // ─── World search helpers ──────────────────────────────────────────────────

  function nearestAliveEnemy(maxRange) {
    if (typeof enemies === 'undefined') return null;
    let best = null, bestDist = maxRange || Infinity;
    enemies.forEach(e => {
      if (!e.userData || e.userData.health <= 0) return;
      const d = camPos().distanceTo(e.position);
      if (d < bestDist) { bestDist = d; best = e; }
    });
    return best;
  }

  // "Navigation System detected" — matches game-ui.js populateTargets() ranges:
  //   regular enemies: 3000 units   (black-hole guardians: 10000 units)
  // Cached for ~15 frames to avoid scanning the full enemies array every frame.
  ap._navCache = null;
  ap._navCacheFrame = -99;
  function navDetectedEnemy() {
    const fc = (typeof gameState !== 'undefined' && gameState.frameCount) || 0;
    if (fc - ap._navCacheFrame < 15) return ap._navCache;
    ap._navCacheFrame = fc;

    if (typeof enemies === 'undefined') { ap._navCache = null; return null; }
    let best = null, bestDist = Infinity;
    const cp = camPos();
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.userData || e.userData.health <= 0) continue;
      const maxRange = e.userData.isBlackHoleGuardian ? 10000 : 3000;
      const d = cp.distanceTo(e.position);
      if (d < maxRange && d < bestDist) { bestDist = d; best = e; }
    }
    ap._navCache = best;
    return best;
  }

  function nearestAsteroid(maxRange) {
    if (typeof planets === 'undefined') return null;
    let best = null, bestDist = maxRange || 5000;
    planets.forEach(p => {
      if (p.userData && p.userData.type === 'asteroid' && p.userData.health > 0) {
        const d = camPos().distanceTo(p.position);
        if (d < bestDist) { bestDist = d; best = p; }
      }
    });
    return best;
  }

  function nearestNebula() {
    if (typeof nebulaClouds === 'undefined') return null;
    let best = null, bestDist = Infinity;
    nebulaClouds.forEach(n => {
      if (!n.userData || n.userData.deepDiscovered) return;
      const d = camPos().distanceTo(n.position);
      if (d < bestDist) { bestDist = d; best = n; }
    });
    return best;
  }

  function nearestBlackHole() {
    if (typeof planets === 'undefined') return null;
    let best = null, bestDist = Infinity;
    planets.forEach(p => {
      if (p.userData && p.userData.type === 'blackhole') {
        const d = camPos().distanceTo(p.position);
        if (d < bestDist) { bestDist = d; best = p; }
      }
    });
    return best;
  }

  function nearestAsteroidBelt() {
    if (typeof asteroidBelts === 'undefined' || !asteroidBelts.length) return null;
    let best = null, bestDist = Infinity;
    asteroidBelts.forEach(b => {
      const center = (b.userData && b.userData.blackHolePosition) || b.position;
      if (!center) return;
      const d = camPos().distanceTo(center);
      if (d < bestDist) { bestDist = d; best = b; }
    });
    return best;
  }

  function findEarth() {
    if (typeof planets === 'undefined') return null;
    for (let i = 0; i < planets.length; i++) {
      if (planets[i].userData && planets[i].userData.name === 'Earth') return planets[i];
    }
    return null;
  }

  function pickPlanet() {
    if (typeof planets === 'undefined') return null;
    const candidates = planets.filter(p => {
      const ud = p.userData;
      if (!ud) return false;
      if (ud.type === 'blackhole' || ud.type === 'asteroid' || ud.type === 'asteroidBelt') return false;
      if (ud.name === 'Earth') return false; // skip start planet
      return true;
    });
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // While scanning/coasting, cycle through nearby planets on the navigation
  // panel every 5 seconds.  Demonstrates planet targeting without
  // interrupting travel.  populateTargets() rebuilds DOM so we keep the
  // interval long.
  function cycleScanTarget() {
    const now = Date.now();
    if (now - (ap._lastScanCycle || 0) < 5000) return;
    ap._lastScanCycle = now;

    if (typeof planets === 'undefined') return;
    // Build candidate list (one-shot, not stored)
    const cp = camPos();
    let bestPlanet = null, bestDist = 8000;
    ap._scanIdx = ((ap._scanIdx || 0) + 1);
    let count = 0;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      const ud = p && p.userData;
      if (!ud) continue;
      if (ud.type === 'blackhole' || ud.type === 'asteroid' ||
          ud.type === 'asteroidBelt' || ud.type === 'moon') continue;
      const d = cp.distanceTo(p.position);
      if (d >= 8000) continue;
      count++;
      // Pick the Nth valid planet to cycle through them
      if (count % Math.max(1, ap._scanIdx) === 0) { bestPlanet = p; }
    }

    if (!bestPlanet) return;
    gameState.currentTarget = bestPlanet;
    if (typeof populateTargets === 'function') populateTargets();

    const nm = (bestPlanet.userData && bestPlanet.userData.name) || 'planet';
    setStatus('Scanning — nav target: ' + nm);
  }

  // Find a regular planet (not a star/black hole/asteroid) within maxRange of a point
  function planetNear(point, maxRange) {
    if (typeof planets === 'undefined' || !point) return null;
    let best = null, bestDist = maxRange || 5000;
    planets.forEach(p => {
      const ud = p.userData;
      if (!ud) return;
      if (ud.type === 'blackhole' || ud.type === 'asteroid' || ud.type === 'asteroidBelt' || ud.type === 'star') return;
      if (ud.name === 'Earth') return;
      const d = p.position.distanceTo(point);
      if (d < bestDist) { bestDist = d; best = p; }
    });
    return best;
  }

  // ─── Pre-emptive shields ───────────────────────────────────────────────────
  // Shields engage as soon as the player is inside ANY live enemy's firing
  // range — i.e. the moment they're "being fired upon."  They drop again
  // once the player leaves every enemy's firing range.
  // ensureShieldsFor('travel') still forces shields off while cruising.
  function ensureShieldsFor(mode) {
    if (typeof shieldSystem === 'undefined') return;
    // Don't drop shields while the ambush response is active — even in
    // travel mode we want to stay protected for the full ambush window.
    if (Date.now() < (ap._ambushUntil || 0)) return;
    if (mode === 'travel' && shieldSystem.active) {
      if (window.deactivateShields) window.deactivateShields();
    }
  }

  function preemptiveShields() {
    if (typeof shieldSystem === 'undefined') return;
    if (typeof enemies === 'undefined') return;

    // While a missile fire sequence is in-flight, do NOT re-raise shields
    // (fireMissile aborts if shields are up).
    if (ap._missileFireLock && Date.now() < ap._missileFireLock) return;
    // Mobile warp button sets this global lock so shields stay down long
    // enough for the physics warp path to fire.
    if (window._demoShieldLock && Date.now() < window._demoShieldLock) return;

    // During an active ambush response, force shields on and never drop them.
    const underAmbush = Date.now() < (ap._ambushUntil || 0);
    if (underAmbush) {
      if (!shieldSystem.active && gameState.energy > 15 && window.activateShields) {
        window.activateShields();
      }
      return;
    }

    let inFireRange = false;
    const camP = camPos();
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.userData || e.userData.health <= 0) continue;
      const range = (e.userData.firingRange || 500) + 50; // small buffer
      if (camP.distanceTo(e.position) < range) { inFireRange = true; break; }
    }

    if (inFireRange && !shieldSystem.active && gameState.energy > 15) {
      if (window.activateShields) window.activateShields();
    } else if (!inFireRange && shieldSystem.active) {
      if (window.deactivateShields) window.deactivateShields();
    }
  }

  // ─── Target reset after black hole warp ───────────────────────────────────
  // A black hole warp teleports the player thousands of units across the
  // universe.  Every pre-warp target (nebula, combat enemy, discovery path,
  // remembered attacker) is now irrelevant — chasing them would send the
  // ship back across the galaxy.  Wipe all tracked targets so the post-warp
  // phases rediscover hostiles, nebulas, and discovery paths in the new
  // local area.
  function resetTargetsAfterWarp() {
    ap.combatTarget = null;
    ap.combatMissileFired = false;
    ap.currentNebula = null;
    ap.discoveryPath = null;
    ap._lastAttacker = null;
    ap._navCache = null;
    ap._navCacheFrame = -999;       // force navDetectedEnemy to re-scan
    ap._ambushUntil = 0;            // stale attacker is no longer near us
    ap._tacticalMsgShown = false;

    if (typeof gameState !== 'undefined') {
      gameState.currentTarget = null;
      if (gameState.targetLock) {
        gameState.targetLock.active = false;
        gameState.targetLock.target = null;
      }
    }
  }

  // ─── Ambush detection ──────────────────────────────────────────────────────
  // Watches hull for sudden drops — that's the signal that something fired
  // on us.  Finds the most plausible shooter (closest live enemy within its
  // own firing range) and forces a combat pivot: shields up, face the
  // attacker, destroy it.  Respects warp phases — we don't yank the ship
  // out of an active black hole warp or slingshot.
  function detectAmbushAndRespond() {
    if (typeof gameState === 'undefined' || gameState.hull === undefined) return;
    if (typeof enemies === 'undefined') return;

    const hullNow = gameState.hull;
    const hullPrev = ap._lastHullCheck == null ? hullNow : ap._lastHullCheck;

    // Any meaningful hull drop — latch the ambush window
    if (hullNow < hullPrev - 0.5) {
      ap._ambushUntil = Date.now() + 6000;
      const shooter = findLikelyAttacker();
      if (shooter) ap._lastAttacker = shooter;
    }
    ap._lastHullCheck = hullNow;

    if (Date.now() >= (ap._ambushUntil || 0)) return;

    // Refresh attacker if the remembered one died / cleared
    let target = ap._lastAttacker;
    if (!target || !target.userData || target.userData.health <= 0) {
      target = findLikelyAttacker();
      ap._lastAttacker = target;
    }
    if (!target) return;

    // Never interrupt warp sequences — physics owns the ship then
    const warpLocked =
      ap.phase === 'blackHoleWarp' ||
      (gameState.slingshot && gameState.slingshot.active) ||
      (gameState.emergencyWarp && (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning));
    if (warpLocked) return;

    // Force shields on regardless of current travel state
    if (typeof shieldSystem !== 'undefined' && !shieldSystem.active &&
        gameState.energy > 15 && window.activateShields) {
      window.activateShields();
    }

    // Pivot to combat if we aren't already fighting this attacker
    const alreadyFighting = ap.phase === 'combat' && ap.combatTarget === target;
    if (!alreadyFighting) {
      ap.combatTarget = target;
      ap.combatMissileFired = false;
      // Remember where to return when the attacker is dead
      if (ap.phase !== 'combat') {
        ap.returnPhase = ap.returnPhase || ap.phase || 'findLocalEnemies';
      }
      transmit('TACTICAL', 'Under fire! Engaging attacker.');
      goPhase('combat');
    }

    // Return fire immediately — don't wait for the ship to finish
    // rotating to face the attacker.  We pin the target lock directly
    // onto the attacker so fireWeapon() auto-aims the laser bolt at
    // their world position, and we drop the normal alignment gate.
    // Also orient the ship so the dogfight still looks correct visually.
    if (gameState.targetLock) {
      gameState.targetLock.active = true;
      gameState.targetLock.target = target;
    }
    gameState.currentTarget = target;
    if (window.orientTowardsTarget) {
      window.orientTowardsTarget({ position: target.position });
    }

    const now = Date.now();
    const canFireLaser =
      gameState.weapons &&
      gameState.weapons.cooldown <= 0 &&
      gameState.weapons.energy >= 10 &&
      now - (ap._lastAmbushFire || 0) > 300;   // ~3 shots per second
    if (canFireLaser && window.fireWeapon) {
      ap._lastAmbushFire = now;
      ap.lastFire = now;                        // sync with autoFireOnTargetLock cooldown
      gameState.crosshairX = window.innerWidth / 2;
      gameState.crosshairY = window.innerHeight / 2;
      window.fireWeapon();
    }
  }

  function findLikelyAttacker() {
    if (typeof enemies === 'undefined') return null;
    const cp = camPos();
    let best = null, bestDist = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.userData || e.userData.health <= 0) continue;
      const range = (e.userData.firingRange || 500) + 100;
      const d = cp.distanceTo(e.position);
      if (d > range) continue;           // not plausibly firing on us
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  // ─── Misc helpers ──────────────────────────────────────────────────────────

  function camPos() {
    return (typeof camera !== 'undefined') ? camera.position : new THREE.Vector3();
  }

  function keys() {
    return window.keys || {};
  }

  function shieldsActive() {
    return typeof shieldSystem !== 'undefined' && shieldSystem.active;
  }

  // Intentional no-op: demo mode does NOT force any camera view.  Whatever
  // view the player has selected persists for the entire run.  Kept as a
  // function so existing call sites stay harmless.
  function ensureThirdPerson() {
    /* intentionally left blank — no auto view switching in demo mode */
  }

  // Multiply every enemy's health+maxHealth by 3 the first time we see it.
  // Ensures enemies take at least ~3 hits so combat reads on screen.  Runs
  // once per enemy via _demoBuffed tag.
  function buffEnemiesForDemo() {
    if (typeof enemies === 'undefined') return;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.userData) continue;
      if (e.userData._demoBuffed) continue;
      // Skip the Borg cube — it already has a tuned HP pool for the boss fight
      if (e.userData.isBorgCube) { e.userData._demoBuffed = true; continue; }
      const mh = e.userData.maxHealth || e.userData.health || 1;
      e.userData.maxHealth = mh * 3;
      e.userData.health = (e.userData.health || mh) * 3;
      e.userData._demoBuffed = true;
    }
  }

  // Double every enemy's movement speed so dog-fights feel fast.  Runs once
  // per enemy (tagged _demoSpeedBuffed) so we never double again.  The game
  // clamps native speed to a 0.2–1.0 range (game-controls.js:682), so the
  // real movement boost comes from swarmEnemiesNearPlayer() which directly
  // translates enemies toward the player every frame.
  function buffEnemySpeed() {
    if (typeof enemies === 'undefined') return;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.userData) continue;
      if (e.userData._demoSpeedBuffed) continue;
      if (e.userData.speed) e.userData.speed = Math.min(1.0, e.userData.speed * 2.0);
      if (e.userData.maxSpeed) e.userData.maxSpeed = e.userData.maxSpeed * 2.0;
      if (e.userData.chaseSpeed) e.userData.chaseSpeed = e.userData.chaseSpeed * 2.0;
      // Widen detection range so enemies engage from further out
      if (e.userData.detectionRange) {
        e.userData.detectionRange = e.userData.detectionRange * 1.5;
      }
      e.userData._demoSpeedBuffed = true;
    }
  }

  // Pull every nearby live enemy closer to the player each frame.  This
  // bypasses the game's native speed clamp (0.2–1.0) and produces a
  // visible "swarm" effect when multiple enemies are within 1500 u.  The
  // closer an enemy is, the harder it's pulled — creating urgency during
  // dogfights.  Reuses a shared THREE.Vector3 to avoid allocation.
  const _swarmVec = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  function swarmEnemiesNearPlayer() {
    if (typeof enemies === 'undefined' || !_swarmVec) return;
    const cp = camPos();
    const SWARM_RANGE = 1500;
    const CLOSE_RANGE = 600;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.userData || e.userData.health <= 0) continue;
      // Skip the Borg cube and boss support — they have custom movement
      if (e.userData.isBorgCube || e.userData.isBossSupport) continue;
      _swarmVec.subVectors(cp, e.position);
      const dist = _swarmVec.length();
      if (dist > SWARM_RANGE || dist < 50) continue;
      _swarmVec.normalize();
      // Pull strength: 0.8 u/frame at the edge of range, 2.0 in close range.
      // Martian Pirates get a 75 % boost to feel faster and more aggressive.
      let pull = dist < CLOSE_RANGE ? 2.0 : 0.8;
      if (e.userData.isMartianPirate) pull *= 1.75;
      e.position.addScaledVector(_swarmVec, pull);
    }
  }

  // ─── Auto-read ALL incoming transmissions ──────────────────────────────
  // The game has TWO transmission UIs:
  //   1) game-controls.js: #incomingTransmissionPrompt (READ/SKIP buttons)
  //   2) game-objects.js:  #incomingTransmission (auto-fade text, no buttons)
  // We handle BOTH: click READ on the first type, and the second auto-fades.
  ap._seenPrompt = null;
  ap._seenPromptTime = 0;
  function autoReadAnyTransmission() {
    // Type 1: READ/SKIP prompt from game-controls.js deep-discovery etc.
    const prompt = document.getElementById('incomingTransmissionPrompt');
    // Skip fast-dismiss prompts (TACTICAL/WEAPONS) — their own 1s timer
    // in transmit() handles dismissal, we must not click READ on them.
    if (prompt && prompt.dataset && prompt.dataset.demoFastDismiss === '1') return;
    if (prompt && ap._seenPrompt !== prompt) {
      ap._seenPrompt = prompt;
      ap._seenPromptTime = Date.now();
    }
    // 1 second after prompt appeared → click READ
    if (prompt && ap._seenPrompt === prompt &&
        Date.now() - ap._seenPromptTime > 1000) {
      const readBtn = document.getElementById('transmissionRead');
      if (readBtn) {
        readBtn.click();
        if (typeof gameState !== 'undefined') gameState.paused = false;
        if (typeof renderer !== 'undefined' && renderer && renderer.domElement) {
          renderer.domElement.style.cursor = 'none';
        }
        const alertEl = document.getElementById('missionCommandAlert');
        if (alertEl) alertEl.querySelectorAll('button').forEach(b => b.remove());
      }
      ap._seenPrompt = null;
      // Close the full alert 2 s after opening
      setTimeout(() => {
        const alertEl = document.getElementById('missionCommandAlert');
        if (alertEl) alertEl.classList.add('hidden');
        if (typeof gameState !== 'undefined') gameState.paused = false;
      }, 2000);
    }

    // Type 2: Auto-fade text from game-objects.js — nothing to do, it
    // handles its own timeout.  But hide it faster (1.5 s) in demo mode
    // so it doesn't obstruct the view too long.
    const textTx = document.getElementById('incomingTransmission');
    if (textTx && !textTx._demoShortenSet) {
      textTx._demoShortenSet = true;
      setTimeout(() => {
        if (textTx) textTx.style.opacity = '0';
      }, 1500);
    }
  }

  function elapsed() {
    return Date.now() - ap.phaseStart;
  }

  function goPhase(name) {
    console.log('🤖 autopilot →', name);
    ap.phase = name;
    ap.phaseStart = Date.now();
    ap.subState = 0;
    ap.navTarget = null;
    ap.lastFire = ap.lastFire || 0;
    // Do NOT clear combatTarget — each phase manages its own target lifecycle
    // and clearing it here wipes what findLocalEnemies just set when it
    // transitions into 'combat'.

    // If we are leaving combat (entering anything that isn't combat/fightBorg),
    // drop the game's auto-aim lock so it stops auto-firing at travel time.
    if (name !== 'combat' && name !== 'fightBorg') {
      if (gameState && gameState.targetLock) {
        gameState.targetLock.active = false;
        gameState.targetLock.target = null;
      }
      if (gameState) gameState.currentTarget = null;
      ap.combatTarget = null;
    }
    // Clear slingshot planet reference when leaving the nebula-approach phases
    if (name !== 'warpToNebulaCluster' && name !== 'coastToNebulaCluster') {
      ap.slingshotPlanet = null;
    }
  }

  function resetFlags() {
    ap.combatMissileFired = false;
    ap.brakingAfterWarp = false;
    ap.orbitTarget = null;
    ap.orbitAngle = 0;
    ap.subState = 0;
    ap.currentNebula = null;
    ap.currentBH = null;
    ap.slingshotPlanet = null;
    ap.lastNebulaWarp = 0;
  }

  function releaseKeys() {
    const k = keys();
    Object.keys(k).forEach(key => { k[key] = false; });
  }

  function releaseMovementKeys() {
    const k = keys();
    k.w = false; k.s = false; k.a = false; k.d = false;
    k.b = false; k.x = false; k.q = false; k.e = false;
    k.up = false; k.down = false; k.left = false; k.right = false;
    // don't clear k.enter here — triggerEmergencyWarp sets it and clears via timeout
  }

  function setStatus(msg) {
    ap.statusText = msg;
  }

  // ─── Notification coordination ────────────────────────────────────────────
  // Dedup per-title notifications for 6 s, and never overlap an achievement
  // toast with an incoming transmission (transmissions win, notifies wait).
  // Transmissions are rate-limited to one every 7 s so prompts don't clobber
  // each other mid-animation.
  const NOTIFY_COOLDOWN_MS = 6000;
  const TRANSMIT_COOLDOWN_MS = 7000;
  ap._lastNotify = {};
  ap._lastTransmit = 0;

  function notify(title, body) {
    const now = Date.now();
    const last = ap._lastNotify[title] || 0;
    if (now - last < NOTIFY_COOLDOWN_MS) return;
    // If a transmission popup is currently on screen, defer this toast so we
    // don't stack two large UI blocks on top of each other.
    if (document.getElementById('incomingTransmissionPrompt')) return;
    ap._lastNotify[title] = now;
    if (typeof showAchievement === 'function') showAchievement(title, body);
  }

  // transmit() is intentionally a no-op.  Demo mode used to emit its own
  // TACTICAL / PROPULSION / NAVIGATION / etc. transmissions to narrate the
  // phase transitions; that was judged redundant with the HUD status line
  // and the game-emitted Mission Control transmissions.  Kept as a
  // function so existing call sites stay valid.
  function transmit(/* from, msg */) { /* intentionally blank */ }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  function isMobileViewport() {
    return window.innerWidth <= 768 ||
           ('ontouchstart' in window && window.innerWidth <= 1024);
  }

  function buildHUD() {
    removeHUD();
    const el = document.createElement('div');
    el.id = 'demoPilotHUD';
    // Mobile: position at the TOP just below the NAV button.
    // Desktop: keep at the bottom (above the achievement popup bottom-80).
    const isMobile = isMobileViewport();
    const topOrBottom = isMobile ? 'top:110px' : 'bottom:10px';
    // Mobile: the panel becomes a tap target to toggle takeover, so
    // enable pointer-events.  Desktop: non-interactive overlay.
    const pe = isMobile ? 'pointer-events:auto' : 'pointer-events:none';
    const cursor = isMobile ? 'cursor:pointer' : 'cursor:default';
    el.style.cssText = [
      'position:fixed',
      topOrBottom,
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:500',
      'background:rgba(0,0,0,0.6)',
      'border:1px solid rgba(0,255,136,0.5)',
      'border-radius:8px',
      'padding:6px 18px',
      'font-family:Orbitron,monospace',
      'font-size:11px',
      'color:#00ff88',
      'text-align:center',
      pe,
      cursor,
      'text-shadow:0 0 8px rgba(0,255,136,0.8)',
      'box-shadow:0 0 20px rgba(0,255,136,0.3)',
      'letter-spacing:2px',
      'min-width:260px',
      'max-width:90vw',
      '-webkit-tap-highlight-color:transparent',
      'touch-action:manipulation',
    ].join(';');

    // Mobile: label-only panel, no target information.
    // Desktop: label + running status line (Pursuing X — 300 u, etc.).
    if (isMobile) {
      el.innerHTML = '<div id="demoPilotLabel" style="font-size:11px">🤖 DEMO AUTOPILOT · tap to take over</div>';
    } else {
      el.innerHTML = '<div id="demoPilotLabel" style="opacity:0.7;font-size:10px;margin-bottom:2px">🤖 DEMO AUTOPILOT · press T to take over</div><div id="demoPilotStatus">Initializing…</div>';
    }
    document.body.appendChild(el);
    ap.hudEl = el;

    // Mobile: tap the panel to toggle player takeover (same effect as T)
    if (isMobile) {
      const handler = (ev) => {
        if (ev && ev.preventDefault) ev.preventDefault();
        toggleTakeover();
      };
      el.addEventListener('click', handler);
      el.addEventListener('touchend', handler);
    }

    // Re-evaluate position on orientation / resize so a tablet rotated
    // into portrait picks the mobile layout and vice-versa.
    if (!ap._resizeBound) {
      ap._resizeBound = true;
      window.addEventListener('resize', () => {
        if (ap.active) buildHUD();
      });
    }
  }

  function tickHUD() {
    // Mobile HUD has no status line — skip target info updates.
    if (isMobileViewport()) return;
    const s = document.getElementById('demoPilotStatus');
    if (s) s.textContent = ap.statusText || ap.phase;
  }

  function updateHUDStyle(paused) {
    const el = document.getElementById('demoPilotHUD');
    const label = document.getElementById('demoPilotLabel');
    if (!el) return;
    const mobile = isMobileViewport();
    const takeText  = mobile ? 'tap to take over' : 'press T to take over';
    const resumeText = mobile ? 'tap to resume demo' : 'press T to resume demo';
    if (paused) {
      el.style.borderColor = 'rgba(255,200,0,0.7)';
      el.style.color = '#ffcc33';
      el.style.textShadow = '0 0 8px rgba(255,200,0,0.8)';
      el.style.boxShadow = '0 0 20px rgba(255,200,0,0.35)';
      if (label) label.textContent = '🕹️ PLAYER CONTROL · ' + resumeText;
    } else {
      el.style.borderColor = 'rgba(0,255,136,0.5)';
      el.style.color = '#00ff88';
      el.style.textShadow = '0 0 8px rgba(0,255,136,0.8)';
      el.style.boxShadow = '0 0 20px rgba(0,255,136,0.3)';
      if (label) label.textContent = '🤖 DEMO AUTOPILOT · ' + takeText;
    }
  }

  function removeHUD() {
    const el = document.getElementById('demoPilotHUD');
    if (el) el.remove();
    ap.hudEl = null;
  }

  // ─── Expose update to game loop ────────────────────────────────────────────
  window.demoPilot.update = update;

  console.log('🤖 autopilot.js loaded');
})();
