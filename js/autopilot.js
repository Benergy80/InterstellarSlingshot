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
    slingshotMisses: 0,

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
    get paused() { return ap.paused; },
    get navStatus() { return ap._navStatus || null; },
    get phase() { return ap.phase; },
    // Last executed warp arrival cut-off, and how many have fired this run.
    // Read-only proof that the cut path RUNS (it logged zero executions across
    // 17 ramped exits before the guidance fix) — the same record the
    // "🎯 WARP ARRIVAL CUT" console line is built from, in machine-readable
    // form so instrumentation doesn't have to scrape the console.
    get lastArrivalCut() { return ap._lastArrivalCut || null; },
    get arrivalCuts() { return ap._arrivalCuts || 0; },
    // The other two members of the arrival triad, exposed on the same terms.
    // Together these three answer the only questions that matter about a warp
    // leg: which terminator ended the burn (cut vs. extension — they tile the
    // along-track axis, so on a leg with a subject one of them always did),
    // and did the ship actually END PARKED afterwards.
    get lastArrivalExt() { return ap._lastArrivalExt || null; },
    get arrivalExts() { return ap._arrivalExts || 0; },
    get lastArrivalPark() { return ap._lastArrivalPark || null; },
    get arrivalParks() { return ap._arrivalParks || 0; },
    // How many times a new leg (warp / slingshot) was DEFERRED because a park
    // still owned the beat — the interlock that makes a park survivable at
    // all, in machine-readable form. See _parkOwnsBeat.
    get arrivalParkDefers() { return ap._parkDefers || 0; }
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

  // O-key emergency warp is handled natively by the game engine:
  // game-controls.js sets keys.o = true on O-keydown, and
  // game-physics.js processes it as a full 15 s emergency warp.
  // No synthetic keypress dispatch needed from the autopilot.

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

  // Reused per-frame scratch vectors for the arrival cut-off's forward-cone
  // test (see below) — module-scope so the hot per-frame path never
  // allocates.
  const _arriveFwdTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  const _arriveToTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  // Scratch for the arrival park's station-keeping (see "ARRIVAL PARK" in
  // update()): the component of the residual drift ACROSS the line of sight,
  // and the ship's own right vector used to pick which strafe grows it.
  const _parkTanTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  const _parkRightTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

  // ─── Main update (called every frame from animate()) ──────────────────────
  function update() {
    if (!ap.active) return;
    // CRITICAL: ensure the game is NEVER left paused by the demo.  The
    // game's keydown handler early-returns on gameState.paused, which
    // would block Tab (shields) during player takeover.  We reset this
    // every single frame so the player always has keyboard input.
    if (typeof gameState !== 'undefined') gameState.paused = false;
    // Paused by player — still tick HUD but never drive the ship.
    // ...but DO hand the stock warp back first. The demo writes both
    // boostDuration and boostSpeed per leg (see _armWarpBurn), and the
    // hand-back that undoes that lives further down update() — behind this
    // early return. A player who takes over with T mid-leg would otherwise
    // inherit that leg's numbers (up to 100 u/frame) on their own next O.
    if (ap.paused) {
      const _ewP = (typeof gameState !== 'undefined' && gameState.emergencyWarp) || null;
      if (_ewP && !_ewP.active && !_ewP.transitioning) _disarmWarpBurn();
      tickHUD();
      return;
    }
    if (typeof gameState === 'undefined' || !gameState.gameStarted) return;
    if (gameState.gameOver) { gameState.gameOver = false; return; }
    // Player death sequence started — freeze the demo immediately so it
    // can't keep flying or auto-firing lasers through the explosion.
    // (playerDying is set ~2.5s before the game-over screen appears.)
    if (gameState.playerDying || gameState.gameOverScreenShown) {
        if (typeof releaseMovementKeys === 'function') releaseMovementKeys();
        if (gameState.targetLock) gameState.targetLock.active = false;
        tickHUD();
        return;
    }

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

    // ── Planet collision avoidance ──────────────────────────────────────
    // Runs at 10 Hz (every 6 frames) at cruise; every other frame above
    // 8u/frame — at post-warp coast speed the ship covers ~90u between
    // 10 Hz checks, which is most of a small planet's danger zone. The
    // evasion hold makes the throttle safe — once triggered the keys stay
    // held across frames.
    {
      const _acSpeed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
      if (fc % (_acSpeed > 8 ? 2 : 6) === 0) avoidPlanetCollisions();
    }

    // ── Crosshair auto-fire ─────────────────────────────────────────────
    // Whenever the game's targeting system has locked onto a live enemy
    // inside the forward mouse-aim cone, pull the laser trigger.  When the
    // lock disengages (enemy dead / moves out of cone / lock cleared) the
    // firing stops automatically.  Runs parallel to phase logic so combat,
    // pursuit and travel all benefit from it.
    // No weapons during init or active warps (black hole, slingshot, emergency).
    const _warpActive =
      (gameState.blackHoleWarp && gameState.blackHoleWarp.active) ||
      (gameState.slingshot && gameState.slingshot.active) ||
      (gameState.emergencyWarp && (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning));
    if (ap.phase !== 'init' && !_warpActive) {
      autoFireOnTargetLock();
      shootNearbyAsteroids();
    }

    // ── Surprise black-hole warp recovery ──────────────────────────────
    // If the player gets caught by a black hole's gravity well during a
    // non-BH phase (e.g. while orbiting a nebula center near a BH, or
    // while pursuing an enemy that drifted toward one), the physics will
    // teleport us into another galaxy. Detect that, then push the demo
    // into post-warp recovery so it (a) jumps away from the BH instead
    // of falling back in and (b) clears the new galaxy's local enemies
    // before continuing the canonical loop.
    const _bhExpected = (ap.phase === 'blackHoleWarp' ||
                         ap.phase === 'gotoBlackHoleGalaxy');
    if (gameState.isBlackHoleWarping && !_bhExpected) {
      ap.surpriseBHWarp = true;
      setStatus('Caught by black hole — riding warp out');
    }
    if (ap.surpriseBHWarp && !gameState.isBlackHoleWarping &&
        (!gameState.eventHorizonWarning || !gameState.eventHorizonWarning.active)) {
      // Warp completed unexpectedly — recover.
      ap.surpriseBHWarp = false;
      ap.warpsUsed = (ap.warpsUsed || 0) + 1;
      ap.warpStartedAt = Date.now();
      ap._postBHEvasionDone = false;  // re-arm the away-from-BH jump
      ap.combatTarget = null;
      ap.currentNebula = null;
      ap.currentBH = null;
      ap.returnPhase = 'findLocalEnemies';
      resetTargetsAfterWarp();
      setStatus('Survived unexpected BH transit — recovering');
      goPhase('coastAfterWarp');
    }

    // ── Universe leash ─────────────────────────────────────────────────
    // The demo player must never sit more than 140,000u from the galactic
    // origin (Sagittarius A*). If something — a runaway warp, a bad
    // pursuit, a black-hole overshoot — has put us past that, override
    // the phase this frame: brake if we're still drifting outward, then
    // thrust back toward the origin. The phase logic resumes once we're
    // back inside the boundary.
    if (ap.phase !== 'init') {
      const _cp = camPos();
      // FLOATING ORIGIN: "distance from the galactic origin" must use TRUE
      // coordinates — after a world rebase the origin is no longer at (0,0,0)
      // in the current frame. true = current + worldOriginOffset.
      const _woo = window.worldOriginOffset;
      const _tx = _cp.x + (_woo ? _woo.x : 0);
      const _ty = _cp.y + (_woo ? _woo.y : 0);
      const _tz = _cp.z + (_woo ? _woo.z : 0);
      const _distFromOrigin = Math.sqrt(_tx * _tx + _ty * _ty + _tz * _tz);
      if (_distFromOrigin > 140000) {
        if (!ap._originDummy) ap._originDummy = { position: new THREE.Vector3(0, 0, 0), userData: { name: 'Galactic Center' } };
        // The galactic center's CURRENT-frame position is -worldOriginOffset.
        ap._originDummy.position.set(_woo ? -_woo.x : 0, _woo ? -_woo.y : 0, _woo ? -_woo.z : 0);
        if (window.orientTowardsTarget) window.orientTowardsTarget(ap._originDummy);
        // If velocity still has an outward component, brake. Otherwise
        // thrust inward toward the origin.
        const vv = gameState.velocityVector;
        let outward = false;
        if (vv && vv.lengthSq() > 0.01) {
          // outward = velocity · (true position from origin) > 0
          outward = (vv.x * _tx + vv.y * _ty + vv.z * _tz) > 0;
        }
        if (outward) {
          keys().x = true;
          setStatus('Universe boundary — braking (' + (_distFromOrigin | 0) + ' u)');
        } else {
          keys().w = true;
          setStatus('Recalling to galactic center (' + (_distFromOrigin | 0) + ' u)');
        }
        tickHUD();
        return;
      }
    }

    // ── Global nav-detected combat pivot ───────────────────────────────
    // Any enemy inside the player's nav-scanner range (3,000u, or
    // 10,000u for black-hole guardians) interrupts whatever the demo
    // was doing and drops it into a fight — the demo should never
    // cruise past hostiles. Excluded phases either ARE combat,
    // can't break out (warp lock), or are pre-game.
    // followDiscoveryPath is also excluded: the path leads SPECIFICALLY
    // to the revealed hostile sector at its endpoint, and the phase has
    // its own enemyAhead pivot for combat at the destination. Letting
    // the global pivot fire on every ambient enemy along the way kept
    // yanking the demo off the path before it could arrive.
    if (ap.phase !== 'init' &&
        ap.phase !== 'combat' &&
        ap.phase !== 'fightBorg' &&
        ap.phase !== 'blackHoleWarp' &&
        ap.phase !== 'followDiscoveryPath') {
      const _navHostile = navDetectedEnemy();
      // Don't interrupt the locked warp cycle — physics owns velocity
      // and braking is futile. coastToNebulaCluster already breaks off
      // on its own once the lock ends.
      const _warpLocked = (ap.phase === 'coastToNebulaCluster') &&
          ((gameState.emergencyWarp && (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning)) ||
           (gameState.slingshot && gameState.slingshot.active));
      if (_navHostile && !_warpLocked && _navHostile !== ap.combatTarget) {
        ap.combatTarget = _navHostile;
        ap.combatMissileFired = false;
        ap.returnPhase = ap.phase;
        setStatus('Hostile on nav — engaging ' + (_navHostile.userData.name || 'target'));
        goPhase('combat');
      }
    }

    // BOSS APPEARED: spawnBossForArea sets gameState._pendingBossEngage the
    // moment a boss spawns. Divert to engage immediately, regardless of range
    // (the proximity magnet below only reaches 25k). Keep the flag through
    // warp-locked transits (physics owns the velocity then) and consume it
    // silently if we're already fighting.
    if (typeof gameState !== 'undefined' && gameState._pendingBossEngage) {
      if (ap.phase === 'bossEngage' || ap.phase === 'combat' || ap.phase === 'fightBorg') {
        gameState._pendingBossEngage = false;
      } else if (ap.phase !== 'init' && ap.phase !== 'blackHoleWarp' &&
                 ap.phase !== 'warpToNebulaCluster' && ap.phase !== 'coastToNebulaCluster') {
        gameState._pendingBossEngage = false;
        setStatus('Boss signature detected — diverting to engage');
        transmit('TACTICAL', 'Boss-class signature detected!\nDiverting to engage.');
        goPhase('bossEngage');
      }
    }

    // BOSS MAGNET: a live boss-tier enemy within 15,000u pulls the demo
    // into the set-piece fight from any explore/travel phase. Excluded:
    // phases that ARE the fight, warp-locked transits (physics owns the
    // velocity), and pre-game. Throttled — it's a full enemies scan.
    if (fc % 30 === 0 &&
        ap.phase !== 'init' && ap.phase !== 'combat' &&
        ap.phase !== 'bossEngage' && ap.phase !== 'fightBorg' &&
        ap.phase !== 'blackHoleWarp' &&
        ap.phase !== 'warpToNebulaCluster' && ap.phase !== 'coastToNebulaCluster' &&
        typeof enemies !== 'undefined') {
      const _cp = camPos();
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.userData || e.userData.health <= 0) continue;
        if (!e.userData.isBoss && !e.userData.isEliteGuardian) continue;
        // 25k reach (was 15k): a combat overshoot can strand the demo
        // 16k+ from a wounded boss — the magnet must still pull it back.
        if (_cp.distanceTo(e.position) > 25000) continue;
        setStatus('Boss signature detected — diverting to engage');
        transmit('TACTICAL', 'Boss-class signature detected!\nDiverting to engage.');
        goPhase('bossEngage');
        break;
      }
    }

    // ── THE PARK HOLDS THE SHOT — AND IT HAS TO HOLD IT FIRST ────────────────
    // Parking the ship and holding the shot are two different jobs, and with
    // the interlock keeping the park alive for its whole beat the second one
    // became measurable for the first time. Measured, three orientTowardsTarget
    // calls land in one demo frame while a park runs — the PHASE's (at its own
    // cruise target), the arrival framing hold's, and the park's own — and the
    // budget is not shared evenly between them: orientTowardsTarget slices its
    // turn from wall-clock delta since the LAST call, so the first caller in a
    // frame gets the whole ~16.7 ms and everyone after it gets the 4 ms floor.
    // The park's hold sits LAST (its block runs after the dispatch below, so it
    // can overrule the phase's keys), which made it structurally the weakest
    // steering authority in the frame. Measured per frame on a live park:
    // call 1 (the phase) +2.20 deg AWAY from the destination, call 2 -0.62,
    // call 3 (the park) -0.22 — net +1.36 deg/frame of drift, and the
    // destination walked 23 deg -> 41 deg -> 90 deg off the nose over one 12 s
    // park, ending behind the camera with the standoff itself rock solid.
    //
    // So take the frame's turn budget BEFORE the phase can spend it, at the
    // rate the burn-window hold already borrows for the same reason (see the
    // ap.paused toggle in the arrival framing hold below — same trick, same
    // justification: while an arrival owns the ship, where the arrival is
    // pointing outranks where the phase was cruising). With the park first the
    // arithmetic inverts: 0.113 x angle per frame toward the destination
    // against ~0.22 deg/frame of leftover pull, i.e. a standing error of ~4
    // deg instead of 90.
    if (typeof gameState !== 'undefined' && window.orientTowardsTarget && _parkOwnsBeat()) {
      const _pkHold = gameState._arrivalSubject;
      const _pkHoldEw = gameState.emergencyWarp;
      if (_pkHold.obj && _pkHold.obj.position && !gameState.slingshotWhip &&
          !(_pkHoldEw && (_pkHoldEw.active || _pkHoldEw.transitioning))) {
        const _prevPaused = ap.paused;
        ap.paused = true;
        window.orientTowardsTarget(_pkHold.obj);
        ap.paused = _prevPaused;
      }
    }

    // Dispatch
    switch (ap.phase) {
      case 'init':                     phaseInit();                   break;
      case 'findLocalEnemies':         phaseFindLocalEnemies();       break;
      case 'combat':                   phaseCombat();                 break;
      case 'bossEngage':               phaseBossEngage();             break;
      case 'warpToNebulaCluster':      phaseWarpToNebulaCluster();    break;
      case 'coastToNebulaCluster':     phaseCoastToNebulaCluster();   break;
      case 'orbitNebulaPlanet':        phaseOrbitNebulaPlanet();      break;
      case 'followDiscoveryPath':      phaseFollowDiscoveryPath();    break;
      case 'gotoBlackHoleGalaxy':      phaseGotoBlackHoleGalaxy();    break;
      case 'blackHoleWarp':            phaseBlackHoleWarp();          break;
      case 'coastAfterWarp':           phaseCoastAfterWarp();         break;
      case 'approachBorg':             phaseApproachBorg();           break;
      case 'fightBorg':                phaseFightBorg();              break;
      case 'mineAsteroids':            phaseMineAsteroids();          break;
      default:                         goPhase('init');
    }

    // FIX 1 — ARRIVAL FRAMING HOLD: phase-agnostic, runs regardless of which
    // phase is driving this frame. Phase code only calls orientTowardsTarget
    // in its own distance/state bands (e.g. phaseCoastToNebulaCluster's
    // inLockedCoast branch stops re-aiming the instant the boost ends), which
    // leaves gaps in exactly the ~0.5-1s window the exit-ramp beat plays in.
    // Whenever a warp/jump cycle is live (boosting OR draining out of it) AND
    // an arrival subject has been staged (see triggerOKeyWarp/triggerSlingshot
    // and navigateTo's jump branch above), keep the nose on it every single
    // frame of that window — so the destination is already converged on, not
    // still catching up, the moment the tunnel finishes collapsing.
    if (typeof gameState !== 'undefined' && gameState._arrivalSubject &&
        gameState._arrivalSubject.obj && gameState._arrivalSubject.obj.position &&
        _arrivalSubjectFresh(gameState._arrivalSubject) &&
        window.orientTowardsTarget) {
      const _ew = gameState.emergencyWarp;
      const _sl = gameState.slingshot;
      const _inCycle = !!(_ew && (_ew.active || _ew.transitioning)) ||
        !!(_sl && _sl.active) ||
        (typeof gameState._warpExitT === 'number');
      if (_inCycle && !(gameState.slingshot && gameState.slingshotWhip)) {
        // FIX 3 (arrival off-boresight): orientTowardsTarget caps the demo
        // pilot's turn rate at 0.016 rad/frame (~55 deg/s, see
        // game-physics.js) for cinematic smoothness everywhere else — but
        // that budget can't close a 100+ degree arrival-subject error
        // inside the ~1s exit ramp. While the ramp is actually live
        // (gameState._warpExitT is a number), borrow the player auto-nav's
        // faster 0.045 rad/frame (~155 deg/s) cap for just this call.
        // orientTowardsTarget picks its rate from window.demoPilot.driving,
        // which is a GETTER-ONLY accessor (`ap.active && !ap.paused` —
        // see window.demoPilot above); assigning to it directly throws in
        // this file's strict mode. Toggle the underlying `ap.paused` field
        // instead (update() runs inside the same closure as `ap`, so this
        // is a plain, synchronous property write, not an accessor call) —
        // driving reads false for the one nested call, then true again the
        // instant it's restored, with no other code able to observe the
        // flip since JS never yields mid-expression. This file may not
        // edit game-physics.js, so this is the in-bounds way to get the
        // faster rate without a `fast` parameter it doesn't accept.
        //
        // THE FAST RATE NOW COVERS THE WHOLE BURN, not just the ramp. Measured
        // reason: the phase driving the leg (phaseCoastToNebulaCluster) also
        // calls orientTowardsTarget every frame, at the nebula CENTRE — a
        // different point from the staged body. Two exponential pulls at the
        // same 0.016 rad/frame cap settle at a weighted midpoint, so the nose
        // never actually reached the subject, and since warp guidance
        // (game-physics.js) steers the burn toward the NOSE, the trajectory
        // inherited that error: the lateral miss to the subject sat dead
        // constant at ~2,430 u for the entire boost instead of converging,
        // and the arrival cut-off's framing test could not pass. Running this
        // call at the auto-nav rate (0.045, ~3x the phase's) makes the staged
        // subject the decisive authority for as long as the boost owns the
        // ship — which is exactly the window in which "where the warp is
        // going" should outrank "where the phase was cruising".
        const _wantFastOrient = ((typeof gameState._warpExitT === 'number') ||
            !!(_ew && _ew.active && !_ew.isJump)) &&
          typeof window !== 'undefined' && window.demoPilot && window.demoPilot.driving;
        if (_wantFastOrient) {
          const _prevPaused = ap.paused;
          ap.paused = true;
          window.orientTowardsTarget(gameState._arrivalSubject.obj);
          ap.paused = _prevPaused;
        } else {
          window.orientTowardsTarget(gameState._arrivalSubject.obj);
        }
      }
    }

    // ARRIVAL CUT-OFF — ARRIVAL IS THE TERMINATOR, THE STOPWATCH IS THE
    // FALLBACK. Physics ends the O-warp boost on `timeRemaining <= 0` and
    // nothing else, so left alone every burn flies its full fixed distance
    // (boostSpeed 100 u/frame x 60 x 15 s = ~90,000 u) and fires the exit
    // beat wherever that lands. This block ends the burn at the reveal
    // instead: physics already treats timeRemaining = 0 as "stop now" from
    // any source, so writing it here makes arrival primary while the 15 s
    // timer stays underneath as the fallback for legs with no subject.
    //
    // ROUND-3 ROOT CAUSE, MEASURED: the round-2 version of this cut logged
    // ZERO executions across 17 ramped exits, and the reason was not this
    // predicate's guard — it was that the burn was BALLISTIC (velocity frozen
    // at ignition; see _applyWarpGuidance in game-physics.js). A cut-off can
    // only stop a burn, never bend one, so the staged body simply never
    // entered any forward cone and the boost always ran out its stopwatch.
    // With guidance in place the ray now converges on the subject and this
    // predicate is reachable — but its own geometry had to change too:
    //
    //   * the lateral tolerance was `arriveDist * 0.35`, an ABSOLUTE distance
    //     (~48 u for a mid-size planet) that had to hold at a cut range of
    //     ~2,200 u — a 1.2 deg corridor, i.e. a near-collision course. It is
    //     now `<= arriveDist`, which is the tolerance that actually matters:
    //     `_off` is the PERPENDICULAR MISS of a straight burn, so it is also
    //     (near enough) the final distance's lateral leg, and holding it at
    //     or under the standoff keeps the subject at >= ~20 deg of angular
    //     size when the streaks finish.
    //   * the stop distance was a magic `0.35 * speed * 60`. It is now
    //     integrated from the exit ramp's OWN curve: _applyWarpExitRamp eases
    //     ease-out-cubic from the boost speed to the cruise target over 1 s,
    //     and the mean of 1-(1-t)^3 is 0.75, so the ground covered is
    //     (0.25*boost + 0.75*cruise) * 60, plus a couple of frames of
    //     trigger latency at boost speed.
    //   * the ship now aims to stop at `stand` (_arrivalStandoff) rather than
    //     exactly on arriveDist. arriveDist is a 40 deg full-angle standoff —
    //     beautiful, but for a typical body that is under two radii of
    //     clearance, and the post-ramp coast is still ~240 u/s. `stand` backs
    //     off to 1.25x, which keeps the reveal well over the 15 deg bar
    //     (measured 19.6-28.3 deg on live arrivals, growing as the coast
    //     closes) while leaving the demo room to brake.
    //
    // The second clause is a pure anti-overshoot fail-safe: once the subject
    // is within one stopping distance of being ABEAM (or already behind),
    // this burn is out of runway and must end this frame whatever the cone
    // says — sailing past is the one outcome that can never be recovered.
    if (typeof gameState !== 'undefined' && gameState._arrivalSubject &&
        gameState._arrivalSubject.obj && gameState._arrivalSubject.obj.position &&
        gameState.emergencyWarp && gameState.emergencyWarp.active &&
        !gameState.emergencyWarp.isJump &&
        _arrivalSubjectFresh(gameState._arrivalSubject)) {
      const _as = gameState._arrivalSubject;
      const _cp = camPos();
      const _speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
      // Ground the exit ramp will still eat after the cut (ease-out cubic,
      // 1 s, boost -> cruise) plus ~2 frames of trigger latency.
      const _cruise = Math.min(_speed, (gameState.maxVelocity || 4));
      const _stop = (0.25 * _speed + 0.75 * _cruise) * 60 + _speed * 2;
      // Standoff computed when the subject was staged (_arrivalStandoff):
      // 1.25x the 40-degree arriveDist, clamped so the body still subtends
      // >= 17 deg and never inside its own danger radius.
      const _stand = _as.stand || (_as.arriveDist * 1.25);
      // DECOMPOSE ALONG THE FLIGHT PATH, NOT THE BORESIGHT. The round-2 test
      // projected onto camera.getWorldDirection() — but the ship does not
      // travel along its boresight during a warp, it travels along
      // velocityVector, and the demo's framing hold is simultaneously holding
      // the boresight ON the subject. That makes the boresight decomposition
      // degenerate: `off` reads ~0 and `along` reads ~range no matter how
      // badly the actual trajectory misses, so the cone test measures the
      // pilot's aim rather than where the burn is going. Projecting onto the
      // velocity direction measures the thing that decides the arrival: how
      // much runway is left before the subject is abeam (`_along`) and what
      // the closest approach of this burn will be (`_off`, the perpendicular
      // miss — invariant along a straight path, and the lateral leg of the
      // final standoff). Warp guidance is what drives `_off` down; this is
      // what reads it. Boresight is still the right frame for ON-SCREEN
      // centring, and that is already owned by the framing hold above and the
      // camera nudge in camera-system.js.
      if (typeof camera !== 'undefined' && _arriveFwdTmp && _arriveToTmp) {
        if (_speed > 1e-3) {
          _arriveFwdTmp.copy(gameState.velocityVector).normalize();
        } else {
          camera.getWorldDirection(_arriveFwdTmp);
        }
        _arriveToTmp.subVectors(_as.obj.position, _cp);
        const _along = _arriveToTmp.dot(_arriveFwdTmp);
        const _offSq = Math.max(0, _arriveToTmp.lengthSq() - _along * _along);
        const _off = Math.sqrt(_offSq);
        const _maxOff = _as.maxOff || (_stand * 0.45);
        const _framed = _along > 0 && _along <= _stand + _stop && _off <= _maxOff;
        // ── THE FAIL-SAFE MUST NOT FIRE BEFORE THE BURN HAS TURNED ──────────
        // `_along <= _stop` alone reads "the subject is abeam or behind us, we
        // are out of runway, end the burn NOW". That is the right call at the
        // END of a burn and catastrophically wrong at the START of one, and it
        // could not tell the two apart: `_along` is measured on the VELOCITY
        // axis, and at ignition the velocity is still the PRE-WARP velocity —
        // whatever heading combat or a previous coast left the ship on. The
        // nose is on the destination (the phase's warp gate needs facing >
        // 0.97, and the framing hold keeps it there), but the momentum is not,
        // so a leg that ignites while drifting away from its own destination
        // reads `_along` NEGATIVE on frame 1 and kills itself instantly.
        //
        // MEASURED, this build, the demo's only destination-bearing leg:
        // armed 20,918 ms for Olympus Nebula Prime at 18,926 u — terminated
        // after 28 ms (ONE active frame) by this clause with along = -13,283,
        // off = 13,482. Staging worked, arming worked, the cut executed and
        // logged; it executed on the first frame and threw the whole burn
        // away. Every round since the arming fix has been measuring the
        // wreckage of that one frame: the settle read 19,325 u / 3.68 deg, and
        // the "warp doesn't arrive" symptom is that the warp never RAN.
        //
        // Two conditions make the fail-safe mean what it says:
        //   * RANGE — "out of runway" is only meaningful in the terminal
        //     neighbourhood. If the subject is 18,926 u away, a negative
        //     `_along` means "guidance has not turned us yet", not "we flew
        //     past it". Believe the clause only once the ship is actually
        //     within the standoff plus its stopping distance.
        //   * TIME — give guidance the measured time it needs to null the
        //     entry heading before any geometric test on the velocity axis is
        //     trusted at all. The convergence trace in this file's own notes
        //     (lateral 4,816 u at ignition -> 732 u at +250 ms -> 77 u at
        //     +540 ms) settles inside ~600 ms; 750 ms is that with margin, and
        //     costs at most 750 ms x 15 u/frame x 60 = 675 u of travel — well
        //     inside the 2,000 ms floor `_armWarpBurn` clamps short legs to.
        // Elapsed comes free from the clock physics already runs: it sets
        // `timeRemaining = boostDuration` at ignition and counts it down, and
        // nothing re-arms `boostDuration` mid-burn.
        const _range = _arriveToTmp.length();
        const _elapsed = (gameState.emergencyWarp.boostDuration || 0) -
                         (gameState.emergencyWarp.timeRemaining || 0);
        const _converged = _elapsed >= ARRIVAL_CUT_GRACE_MS;
        // The neighbourhood the fail-safe is allowed to speak about. It has to
        // cover a WIDE pass, not just a head-on one: a burn that goes abeam
        // 3,000 u off-axis has genuinely blown its arrival and must still end,
        // so the radius is the standoff plus the full lateral budget (the
        // widest miss the subject was ever claimable at) plus the ramp's own
        // stopping ground. Anything beyond that is not an overshoot, it is a
        // burn that has not arrived yet.
        const _nearRadius = _stand + _stop + _maxOff;
        const _outOfRunway = _along <= _stop && _range <= _nearRadius;
        // ── AND THE WIDE FLY-PAST, WHICH TILES THE LAST OF THE GAP ──────────
        // `_framed` and `_outOfRunway` between them still left a hole, because
        // both of them ALSO test the lateral axis (`_off <= _maxOff`,
        // `_range <= _nearRadius`) while the extension below tests only the
        // along-track one. A burn that misses WIDE therefore satisfies none of
        // the three and falls back to the stopwatch again.
        //
        // MEASURED, this build, 21,000 u leg to Titan Nebula Prime (stand
        // 2,129, stop ~900, maxOff 3,560): the burn never converged — the
        // perpendicular miss GREW from 7,464 u to 12,555 u while the range
        // closed to 13,703 u — and at the clock's expiry it read along
        // = -12,843, off = 5,528, range = 13,982. Along was deep inside the
        // cut's window (so the extension could not fire) but off was 1,968 u
        // outside the framing budget and the range 7,393 u outside the
        // fail-safe's neighbourhood (so neither cut clause could either). The
        // stopwatch ended it, the ship coasted on, and the destination
        // finished BEHIND the camera at 5.0 deg.
        //
        // The honest complement of the extension is simply "the subject is no
        // longer far enough ahead to be worth flying at" — `_along <= _stand +
        // _stop` — with no lateral term at all, so the two predicates tile the
        // whole plane and one of them always owns the frame. What that costs
        // is a burn that is merely still TURNING (velocity has not swung onto
        // the nose yet, so `_along` reads small or negative) being mistaken
        // for a blown one — the exact frame-1 catastrophe the `_converged`
        // grace exists to prevent. So this clause, and only this clause, waits
        // out a full turn budget rather than the convergence grace: guidance
        // is capped at 0.07 rad/frame (game-physics.js), i.e. a 180 deg swing
        // takes ~45 frames — 750 ms at 60 fps, ~1.2 s on the 36 fps rig this
        // was measured on. 2,500 ms is that with better than 2x margin, and it
        // is still 8x shorter than the burns it rescues.
        //
        // ...and it must not count a COORDINATE JUMP as flying. The world
        // rebases around the ship (worldOriginOffset / __worldShiftHandlers)
        // and culls distant systems, so a subject's position can move by tens
        // of thousands of units between two frames without anything having
        // flown anywhere. Measured, Olympus Nebula Prime: range 7,542 u on one
        // sample and 51,389 u on the next, 267 ms later, with the ship at 13
        // u/frame — 44,000 u of "travel" in a quarter second. On that frame
        // `_along` reads -34,493 and the wide-miss clause would end a burn
        // that was, in the frame it was flying in, 7,542 u from a clean
        // arrival. So: if the range moves further than the ship could possibly
        // have carried it, that is a rebase, and the turn budget starts again
        // from there rather than the burn being judged on it.
        const _nowMs = Date.now();
        if (!_as._turnT0) _as._turnT0 = _nowMs;
        if (_as._cutPrevR != null && _as._cutPrevT) {
          const _dtS = Math.max(0.001, (_nowMs - _as._cutPrevT) / 1000);
          const _couldFly = _speed * 60 * _dtS + 500;
          if (Math.abs(_range - _as._cutPrevR) > _couldFly * 3) _as._turnT0 = _nowMs;
        }
        _as._cutPrevR = _range; _as._cutPrevT = _nowMs;
        const _turned = _elapsed >= ARRIVAL_TURN_BUDGET_MS &&
                        (_nowMs - _as._turnT0) >= ARRIVAL_TURN_BUDGET_MS;
        // ...and it must never PRE-EMPT a good arrival. Inside the cut's
        // along-track window with the miss still inside the lateral budget is
        // the definition of framed, not blown — `_framed` owns that frame. So
        // this clause claims only what is genuinely unrecoverable: the miss is
        // already wider than the budget the subject was ever claimable at, or
        // the subject is behind us on the velocity axis. Together with
        // `_framed` that is every point of `_along <= _stand + _stop`, which
        // is exactly the complement of the extension's gate — the three tile
        // the plane with no gap and no overlap that matters.
        const _blown = _turned && _along <= _stand + _stop &&
                       (_off > _maxOff || _along <= 0);
        // This leg has genuinely FLOWN a burn (as opposed to being a subject
        // staged for a burn that has not ignited yet). The arrival park below
        // gates on this so it can never brake into an armed-but-unlit warp.
        _as._flown = true;
        if (_converged && (_framed || _outOfRunway || _blown)) {
          gameState.emergencyWarp.timeRemaining = 0;
          // LOG PROOF that this path executed — one line per burn (latched on
          // the staged subject so a multi-frame cut can't spam the console),
          // plus a machine-readable record for instrumentation.
          if (!_as._cutLogged) {
            _as._cutLogged = true;
            ap._lastArrivalCut = {
              at: Date.now(), reason: _framed ? 'framed' : (_outOfRunway ? 'outOfRunway' : 'blown'),
              along: Math.round(_along), off: Math.round(_off),
              stand: Math.round(_stand), stop: Math.round(_stop),
              arriveDist: Math.round(_as.arriveDist),
              // Proof the burn actually FLEW before the cut claimed it: how
              // far the subject was and how long the burn had been running.
              range: Math.round(_range), elapsed: Math.round(_elapsed),
              subject: (_as.obj.userData && (_as.obj.userData.name || _as.obj.userData.type)) || 'body'
            };
            ap._arrivalCuts = (ap._arrivalCuts || 0) + 1;
            // ARRIVE AND STAY is NOT this block's job any more. It used to be:
            // `ap._arrivalBrakeUntil = Date.now() + 2600` was assigned right
            // here, and that put the ONLY brake in the file inside the cut's
            // one-shot — so a leg whose cut never fired (measured: leg 7, Void
            // Nebula Prime) arrived with nothing braking it at all and flew
            // into its own destination. The brake now lives OUTSIDE this block,
            // as a closed loop that every destination-bearing leg gets whether
            // or not the cut fired. See "ARRIVAL PARK" in update().
            console.log('🎯 WARP ARRIVAL CUT (' + ap._lastArrivalCut.reason + ') → ' +
              ap._lastArrivalCut.subject + '  along=' + ap._lastArrivalCut.along +
              'u off=' + ap._lastArrivalCut.off + 'u (stand=' + ap._lastArrivalCut.stand +
              ' stop=' + ap._lastArrivalCut.stop + ')');
          }
        } else if (_converged &&
                   gameState.emergencyWarp.timeRemaining <= BURN_EXTEND_STEP_MS &&
                   _along > _stand + _stop &&
                   (_as._burnExtMs || 0) < _burnExtendBudget()) {
          // ── ARRIVAL IS THE TERMINATOR; THE STOPWATCH IS THE FALLBACK ───────
          // The burn is sized in MILLISECONDS but travel is integrated PER
          // FRAME, so the two only agree at a healthy frame rate. Measured on
          // this instrumented machine (~13 fps, three WebGL contexts): a burn
          // armed 3,731 ms for a subject 3,409 u out covered 2,363 u before the
          // clock ran out and left the reveal at 1,046 u / 13.09 deg — dead
          // centre of frame, just under the 15 deg bar, purely because the
          // clock is wall-time and the ship is not. Rather than trust the
          // clock, keep the burn alive in short beats for as long as the
          // arrival genuinely has not happened yet, and let the geometric cut
          // above end it. The budget is bounded so a burn that cannot converge
          // still ends: at most BURN_EXTEND_MAX_MS beyond its armed length,
          // charged to the staged subject so it cannot be inherited by the next
          // leg. On a machine that holds 60 fps this never fires — the cut
          // arrives first.
          //
          // ── THE DEAD BAND, AND WHY THE GATE IS NOW THE CUT'S COMPLEMENT ────
          // This clause used to be gated on `_along > 0 && _range >
          // _nearRadius`, and the cut above is gated on `_along <= _stand +
          // _stop`. Those two are NOT complements, and the space between them
          // is a hole exactly `_maxOff` wide that neither predicate can act in.
          // Measured live for Void Nebula Prime: stand = 2,129, stop = 480,
          // maxOff = 3,560 — so the cut needed along <= 2,609 while the
          // extension needed range > 6,169. Leg 7 ran its clock out at
          // along = 3,426 / range = 3,575: 817 u past the cut's window and
          // 2,594 u short of the extension's, i.e. dead inside a 3,560 u band
          // where the stopwatch wins by default. That is the leg that arrived
          // at 19.86 deg dead centre and then flew into the planet.
          //
          // Gating on `_along > _stand + _stop` makes the two predicates TILE
          // the along-track axis with no gap: either the subject is inside the
          // cut's window (the cut owns the frame) or it is beyond it (the
          // extension owns the frame). `_range` never enters it, so the
          // lateral budget can no longer open a hole in the along-track test.
          // ── CHARGE WHAT WAS ACTUALLY GRANTED, NOT A FLAT BEAT PER FRAME ────
          // The clause holds for as long as the clock sits under one beat, so
          // it runs EVERY FRAME while it is open — it tops `timeRemaining` back
          // up to 900 ms each time, which after the first frame is a top-up of
          // only the ~28 ms the frame just consumed. Billing a flat 900 ms for
          // each of those overcharged the budget by the frame rate: measured at
          // 36 fps the 12,000 ms ceiling was spent in 14 frames, so the
          // "extension" bought the burn 0.4 s, not 12 s. Both legs that hit the
          // ceiling in a 12-leg sample read extMs 12,600 with a burn only
          // 416 ms longer than the duration it was armed for, and both ended
          // 11,634 u and 7,944 u short of their subject at 3.2 and 6.2 deg.
          // Charging the top-up itself makes the budget mean the wall-clock
          // seconds it says.
          const _topUp = Math.max(0, BURN_EXTEND_STEP_MS -
            Math.max(0, gameState.emergencyWarp.timeRemaining || 0));
          _as._burnExtMs = (_as._burnExtMs || 0) + _topUp;
          gameState.emergencyWarp.timeRemaining = BURN_EXTEND_STEP_MS;
          // A SUBJECT MUST OUTLIVE ITS OWN BURN. `liveMs` is sized at staging
          // from the duration the burn was ARMED for (max(19 s, burn + 8 s)) —
          // which was airtight while the clock was the only terminator, and
          // stopped being true the moment the extension could add real seconds
          // to a leg. Measured with the accounting above fixed: a 10,266 ms
          // leg extended to 19,195 ms of burn, i.e. the subject went stale 200
          // ms BEFORE its own boost ended, so the cut could no longer fire on
          // it and the arrival park (which needs a fresh subject to start)
          // never ran a frame — the ship left the burn at 14.5 u/frame and
          // cruised on. Every millisecond granted to the burn is granted to
          // the subject too, so the two windows can never come apart again.
          _as.liveMs = (_as.liveMs || 19000) + _topUp;
          if (!_as._extLogged) {
            _as._extLogged = true;
            ap._arrivalExts = (ap._arrivalExts || 0) + 1;
            ap._lastArrivalExt = {
              at: Date.now(), along: Math.round(_along), range: Math.round(_range),
              stand: Math.round(_stand), stop: Math.round(_stop),
              maxOff: Math.round(_maxOff), nearRadius: Math.round(_nearRadius),
              // The old gate's verdict on this same frame. `true` here is proof
              // this frame fell in the dead band the old code could not act in.
              wasDeadBand: !(_range > _nearRadius),
              subject: (_as.obj.userData && (_as.obj.userData.name || _as.obj.userData.type)) || 'body'
            };
            console.log('⏱️ WARP BURN EXTENDED → ' + ap._lastArrivalExt.subject +
              '  along=' + ap._lastArrivalExt.along + 'u range=' + ap._lastArrivalExt.range +
              'u (cut window <=' + (ap._lastArrivalExt.stand + ap._lastArrivalExt.stop) +
              ', old gate needed range>' + ap._lastArrivalExt.nearRadius +
              (ap._lastArrivalExt.wasDeadBand ? ' → OLD DEAD BAND' : '') + ')');
          }
        }
      }
    }

    // ── SIZE THE BURN AT IGNITION, NOT AT THE KEY PRESS ─────────────────────
    // triggerOKeyWarp arms the burn from the range it measures when it presses
    // O, but physics does not light the engine until the camera has finished
    // its first-person transition — 300-700 ms later — and it reads
    // boostDuration exactly once, at that moment. Whatever the ship covered in
    // between is error the arrival never gets back. Measured, this build: a leg
    // armed for Horizon Nebula Prime at 14,292 u ignited with the subject
    // 16,750 u away (the demo was still manoeuvring away from it in combat),
    // so the burn was 2,458 u short, the cut never came into range, the
    // stopwatch ended the leg, and the reveal landed 5,164 u out — dead centre
    // of frame but 13.69 deg, under the 15 deg bar it would otherwise have
    // cleared. Re-arming every frame of the transition window costs nothing
    // (one distance and one divide) and makes the number physics reads the
    // range that is actually true when the burn starts.
    if (typeof gameState !== 'undefined' && gameState.emergencyWarp &&
        gameState.emergencyWarp.transitioning && !gameState.emergencyWarp.active &&
        !gameState.emergencyWarp.isJump &&
        gameState.emergencyWarp._burnArmedAt != null &&
        gameState._arrivalSubject && gameState._arrivalSubject.obj &&
        gameState._arrivalSubject.obj.position &&
        _arrivalSubjectFresh(gameState._arrivalSubject)) {
      const _asI = gameState._arrivalSubject;
      _armWarpBurn(camPos().distanceTo(_asI.obj.position), _asI.stand);
      // The subject's live-window was sized from the duration armed at the key
      // press; a longer re-arm must not outlive the subject it is aimed at.
      _asI.liveMs = Math.max(_asI.liveMs || 0, _arrivalSubjectLiveMs());
    }

    // HAND THE STOCK BURN LENGTH BACK once the cycle is completely over.
    // The autopilot now writes emergencyWarp.boostDuration per leg (see
    // _armWarpBurn) — that is this fix's whole mechanism — but boostDuration
    // is shared state, and a human who takes over with T and presses O should
    // get the game's own 8 s warp, not whatever length the demo's last leg
    // happened to need. triggerOKeyWarp re-arms from the stock value every
    // time, so this is belt-and-braces for the player-control path.
    //
    // ...BUT NOT WHILE A BURN IS WAITING TO IGNITE. `!active && !transitioning`
    // is ALSO true for the whole hand-off window between arming a leg and
    // physics picking the O key up, and that is where every armed length was
    // dying (see the arm latch in _armWarpBurn for the measurement). Honour the
    // latch: a leg armed less than ARM_LATCH_MS ago owns boostDuration.
    const _ewD = (typeof gameState !== 'undefined' && gameState.emergencyWarp) || null;
    if (_ewD && _ewD._baseBoostDuration != null &&
        !_ewD.active && !_ewD.transitioning &&
        typeof gameState._warpExitT !== 'number' &&
        (_ewD._burnArmedAt == null || Date.now() - _ewD._burnArmedAt > ARM_LATCH_MS)) {
      _disarmWarpBurn();
    }

    // WARP INTEGRITY: a full O-key emergency warp must run its whole 15 s
    // boost. Phase logic was pressing X mid-boost — flyToward's distance
    // brake (speed×35 = 3,500 u at warp speed!), combat's overshoot brake,
    // the runaway guard — and physics honors X during an active warp
    // (×0.99/frame), so the boost bled off in ~2-3 s and the starfield cut
    // out: the "demo always stops its warps too soon" bug. Clear X while a
    // non-jump warp boost is active. Exception: an active planet-collision
    // evade keeps its brake (dumping warp speed is correct there).
    // coastToNebulaCluster already had its own version of this lock; this
    // covers the combat / followDiscoveryPath warps too.
    if (typeof gameState !== 'undefined' && gameState.emergencyWarp &&
        gameState.emergencyWarp.active && !gameState.emergencyWarp.isJump &&
        !(ap._evadeUntil && Date.now() < ap._evadeUntil)) {
      keys().x = false;
    }

    // ── ARRIVAL PARK — THE WARP ENDS PARKED ─────────────────────────────────
    // WHAT THE PLAYER SAW BEFORE THIS: the streaks trimmed, the destination
    // sat dead centre... and then it kept growing, and growing, and then it
    // was behind the camera or it killed you. Measured, leg 7, Void Nebula
    // Prime: a perfect exit — 19.86 deg, dead centre, d = 3,446 — followed by
    // 3446 → 2946 → 2245 → 1527 → 1060 → 849 → 646 and "MISSION FAILED — Ship
    // destroyed by collision". The warp trimmed the STREAKS but never the
    // SHIP.
    //
    // The old brake could not have prevented it, for two independent reasons:
    //   * IT ONLY EXISTED INSIDE THE CUT. `ap._arrivalBrakeUntil = Date.now()
    //     + 2600` was assigned inside the cut's `if (!_as._cutLogged)`
    //     one-shot, so a leg whose cut never fired — which, before the dead
    //     band above was closed, was most long legs — got no brake at all.
    //   * IT WAS OPEN LOOP. 2,600 ms of X is ~156 frames at 0.99/frame, which
    //     sheds 21% of cruise. Legs that DID get it were still doing
    //     3.9 u/frame thirteen seconds later. A timer cannot null a speed it
    //     never measures.
    //
    // This is the closed loop. It runs OUTSIDE the cut, on the plain fact that
    // a burn just ended with a fresh destination in front of the ship, and it
    // reads range and speed every frame. Two stages:
    //   FLARE — while the ship is still carrying cruise, hold the brake. The
    //     release condition is measured, not timed: it lets go when physics
    //     itself will not let the ship go slower.
    //   STATION-KEEP — the ship cannot actually stop (see the floor note
    //     below), so the last thing the park does is take the drift OFF the
    //     bearing to the destination: reverse thrust to null the approach, a
    //     matching strafe so the engine's mandatory 0.4 u/frame is spent
    //     sliding ACROSS the arrival instead of into it. The standoff then
    //     holds to within a few units per second and the destination sits
    //     still in frame — which is what "parked" has to mean in a ship with a
    //     velocity floor.
    //
    // Four details that are load-bearing:
    //   * THRUST IS CUT TOO. This block runs after the phase dispatch, and the
    //     phase that resumes mid-drain (flyToward, the combat re-acquire, the
    //     cruise fallback) sets keys().w — braking with one hand while the
    //     phase thrusts with the other is how the reveal used to slide out of
    //     frame even on the legs that did brake.
    //   * THE FLARE BORROWS THE GAME'S OWN POST-JUMP BRAKE. X alone is
    //     0.99/frame: 3.8 s to bring 4 u/frame down to the engine's floor,
    //     which does not fit inside the arrival beat. `emergencyWarp
    //     .autoBraking` is physics' own "a jump ends parked" deceleration
    //     (0.985/frame, game-physics.js) and stacks with X for ~0.975/frame —
    //     1.5 s to the floor, and it self-clears the moment it gets there. It
    //     is the same brake a Jump already uses; this just asks for it after a
    //     warp arrival too, which is precisely the Star-Citizen-drop feel the
    //     piece is after.
    //   * IT CANNOT NULL THE SPEED, ONLY THE CLOSING RATE. `minVelocity` is
    //     0.4 u/frame (game-core.js) and physics re-normalises velocity up to
    //     it every step — DIRECTION-PRESERVING, which is the whole reason the
    //     station-keep needs a strafe and not just a reverse thrust: reverse
    //     thrust alone shrinks the radial component and the floor immediately
    //     scales the same direction back up to 0.4, so the closing rate never
    //     moves. Grow the across-track component at the same time and the
    //     floor is spent on a direction that does not eat the standoff.
    //   * THE NOSE IS HELD THROUGH THE PARK. The framing hold at the top of
    //     update() and the camera assist in camera-system.js both switch off
    //     when `gameState._warpExitT` goes null, i.e. the moment the ramp
    //     finishes — which is exactly when the park starts. Without a hold of
    //     its own the destination would drift off-centre during the settle,
    //     and the reverse thrust (which acts along the NOSE) would stop being
    //     anti-radial.
    const _pkEw = (typeof gameState !== 'undefined' && gameState.emergencyWarp) || null;
    const _pk = (typeof gameState !== 'undefined' && gameState._arrivalSubject) || null;
    //   * THE PARK OUTLIVES THE STAGING CLOCK, AND THE SLINGSHOT GLIDE.
    //     Two guards used to switch it off in the middle of its own beat:
    //
    //     — `_arrivalSubjectFresh` bounds how long a STAGED subject may bias
    //       aim (max(19 s, burn + 8 s) from staging). That window is sized for
    //       the burn, so on a long leg it expires while the park is still
    //       settling: measured 24 of 57 post-arrival samples fresh on a
    //       23.5 s leg, i.e. the park lost authority ~6 s in, the phase
    //       resumed, and the destination was thrust back out of frame
    //       (10,962 u -> 12,898 u, ending behind the camera). Freshness gates
    //       whether the park may START; once started, the park's OWN clock
    //       (PARK_MAX_MS / PARK_SETTLE_MS) is what ends it.
    //
    //     — `slingshot.active` reads true for 25.6 s from CAPTURE, and a warp
    //       arrival at a big body is exactly what trips a capture: the
    //       framable radius that makes a body worth arriving at is the same
    //       radius that gives it a gravity well. Measured across one sample of
    //       7 destination legs, 3 arrived inside a live glide, and on every
    //       one of them the park never ran a single frame — the ship coasted
    //       in at 0.78, 0.54 and 0.78 u/frame of closing with the destination
    //       framed at 19-29 deg, walking the standoff down (2,404 -> 1,753 u
    //       over 15 s) with nothing braking it. That is the piece's own
    //       failure, arriving by a different door. The thing that genuinely
    //       owns the ship is the 1.6 s WHIP ARC (`gameState.slingshotWhip`),
    //       which drives position on a rail and ignores keys; the glide after
    //       it is ordinary flight with a different velocity cap, and braking
    //       works normally through it (game-physics.js applies X and thrust
    //       unconditionally). So stand down for the arc, not for the glide.
    const _pkWhip = !!(typeof gameState !== 'undefined' && gameState.slingshotWhip);
    if (_pk && _pk.obj && _pk.obj.position && _pk._flown &&
        (_pk._parkT0 || _arrivalSubjectFresh(_pk)) && _pkEw &&
        !_pkEw.active && !_pkEw.transitioning && !_pkEw.isJump && !_pkWhip &&
        gameState.velocityVector && _arriveToTmp) {
      if (!_pk._parkT0) {
        _pk._parkT0 = Date.now();
        _pk._parkFrom = Math.round(camPos().distanceTo(_pk.obj.position));
      }
      const _pkSpd = gameState.velocityVector.length();
      _arriveToTmp.subVectors(_pk.obj.position, camPos());
      const _pkRange = _arriveToTmp.length();
      const _pkStand = _pk.stand || (_pk.arriveDist * 1.25);
      // Closing rate on the bearing to the subject: >0 means the standoff is
      // still shrinking. This, not |v|, is what decides whether the arrival
      // holds.
      //
      // MEASURE THE RANGE, NOT ONLY OUR HALF OF IT. Projecting the ship's own
      // velocity onto the bearing answers "am I flying at it", which is the
      // right question only for a subject that stands still. Nebula primes do;
      // ordinary system planets are on orbits, and one of them (Tarn Tera
      // Sprawl IV) was measured receding at ~250 u/s while this projection
      // read +0.9 u/frame of CLOSING — the park was thrusting to stop an
      // approach that was not happening while the standoff ran away from
      // 10,316 u to 11,918 u. What the arrival actually needs held is the
      // RANGE, so difference the range itself and fall back to the projection
      // only on the first frame, when there is no previous sample yet.
      const _pkNow = Date.now();
      const _pkProj = _pkRange > 1e-3 ?
        gameState.velocityVector.dot(_arriveToTmp) / _pkRange : 0;
      let _pkClose = _pkProj;
      if (_pk._pkPrevT && _pkNow > _pk._pkPrevT) {
        // Range rate per 60 fps frame, sign-flipped so ">0 means closing" is
        // still what it says. Lightly smoothed — a raw one-frame difference at
        // 4-10 u/frame of orbital motion is noisy enough to chatter the
        // station-keep between reverse thrust and forward thrust.
        const _frames = Math.max(0.25, (_pkNow - _pk._pkPrevT) / (1000 / 60));
        const _rate = (_pk._pkPrevRange - _pkRange) / _frames;
        _pkClose = _pk._pkCloseS == null ? _rate : (_pk._pkCloseS * 0.6 + _rate * 0.4);
      }
      _pk._pkCloseS = _pkClose;
      _pk._pkPrevRange = _pkRange;
      _pk._pkPrevT = _pkNow;
      const _pkMargin = _pkRange - _pkStand;
      // THE TEST, and why it is a state and not a clock. `_pkStopped` is the
      // literal definition of arrived-and-staying: the ship is off cruise AND
      // the range is neither shrinking nor growing faster than the bar. Both
      // halves are measured this frame, so a leg cannot "finish braking" while
      // still doing 3.9 u/frame the way the 2,600 ms timer let it.
      //
      // It is stricter than the obvious release rule ("let go once one more
      // second of travel fits in the ground left to the standoff",
      // `speed * 60 <= range - stand`). That rule permits the ship to keep
      // CRUISING at 4 u/frame until it is one second out — a 5 s run-in on a
      // leg that ends 1,446 u wide of its standoff, i.e. the arrival is still
      // moving long after the beat the player is watching. At the floor this
      // test's own release point puts `speed * 60` at 24 u, which fits inside
      // any real standoff margin, so it never lets go EARLIER than that rule
      // would — it just refuses to let go at cruise speed.
      //
      // Stopping WHERE THE BURN LEFT US, rather than coasting the rest of the
      // way in to `stand`, is provably well framed: `maxOff` is derived (see
      // _arrivalStandoff) as sqrt(maxRange² - stand²), so any range the framed
      // cut can fire at, sqrt(along² + off²), is at most `maxRange` — the
      // distance at which the subject still subtends 17 deg. Flaring on the
      // spot cannot drop a framed arrival under the 15 deg bar.
      //
      // THE SIGN OF THE ERROR PICKS THE INPUT; THE SPEED ONLY PICKS HOW HARD.
      // The first cut of this ran the stages off |v| alone — brake while fast,
      // station-keep once slow — and that is wrong in both directions once the
      // subject can move. Measured both ways:
      //   * Kadetera-720 III, a system planet on its orbit, receded at ~550
      //     u/s while the ship read 1.11 u/frame. |v| said "still fast, keep
      //     braking", which is the one input that makes falling behind worse:
      //     the standoff opened 4,117 -> 6,886 u in five seconds.
      //   * Gating the flare on the ship's RADIAL speed instead fixed that and
      //     broke the opposite case: a blown burn coasting away at 26 u/frame
      //     has a negative radial term, so it fell through to the station-keep
      //     and got FORWARD THRUST at 26 u/frame (measured: Chronos, ended
      //     6,176 u out, 11.1 deg, behind the camera).
      // So: the RANGE RATE decides which way to push, and speed only decides
      // whether pushing is safe at all — above cruise nothing but the brake
      // makes sense, because no station-keeping input is meaningful while the
      // ship is still travelling.
      const _pkCruising = _pkSpd > PARK_CRUISE_MAX;
      const _pkFast = _pkCruising || _pkProj > PARK_FLARE_SPEED;
      // ── "PARKED" IS A PLACE, NOT ONLY A SPEED ────────────────────────────
      // The range-rate test alone says "nothing is changing", which is also
      // true of a ship stalled in deep space with its destination a speck
      // behind it. Measured, previous round: the one leg that ever reached
      // this latch logged `PARKED → Titan Nebula d=36,291u (stand=16,527)` —
      // 19,764 u outside its own standoff, subject BEHIND the camera, ship
      // still moving 2.96 u/frame. Nothing about that is an arrival, and
      // latching it ended the park (the settle hold starts here) at the exact
      // moment the park was the only thing that could still recover the leg.
      //
      // So the latch additionally asks the two questions the acceptance test
      // asks: am I actually AT the standoff the burn bought (2.5x is generous
      // — a framed cut fires inside stand+stop and the ramp eats most of the
      // rest), and is the destination in FRONT of me. When either is false the
      // park keeps the stick and keeps working — the station-keep below
      // chases an opening range — until PARK_MAX_MS hands the leg back. The
      // difference the player sees: a leg that ends short no longer freezes
      // and calls itself arrived, it closes the gap.
      const _pkAtStandoff = _pkRange <= _pkStand * 2.5;
      let _pkAhead = true;
      if (typeof camera !== 'undefined' && _arriveFwdTmp) {
        camera.getWorldDirection(_arriveFwdTmp);
        _pkAhead = _arriveToTmp.dot(_arriveFwdTmp) > 0;
      }
      const _pkStopped = Math.abs(_pkClose) <= PARK_CLOSE_MAX && !_pkCruising &&
                         _pkAtStandoff && _pkAhead;
      // ── THE STANDOFF IS A FLOOR, NOT A ONE-SHOT ──────────────────────────
      // PARK_MAX_MS bounds how long the arrival BEAT may hold the stick. It
      // was also, accidentally, the only thing keeping the ship off the body:
      // when it expired the phases took over and every one of them thrusts
      // toward something on the far side of the arrival, so the ship resumed
      // eating the standoff it had just bought — at 1.16-3.4 u/frame, all the
      // way to the surface. Three "MISSION FAILED — PLANETARY IMPACT" in two
      // instrumented sessions, each with the body the demo had itself chosen
      // as the destination: Tartarus, Chronos and Void Nebula Prime, dying
      // 12-40 s AFTER a textbook 30-degree parked arrival.
      //
      // The beat is over; the geometry is not. Re-arm the park whenever the
      // ship has drifted back inside the standoff and is still closing. This
      // is not a longer beat — the framing hold and settle have already been
      // served — it is the station-keep re-asserting the one number the whole
      // arrival is built on. It ends as soon as the closing rate is nulled,
      // and it cannot deadlock the demo: `_parkOwnsBeat` defers the next leg
      // rather than cancelling it, and a ship that is not closing never
      // triggers this at all.
      //
      // WELL INSIDE, NOT MERELY AT. Re-arming on any drift under the standoff
      // made the demo live at its own boundary: measured, the ship held
      // 2,027-2,128 u off Tartarus Nebula Prime (stand 2,129) for FOUR MINUTES,
      // re-arming 16 times and deferring 16 legs, because sitting exactly on
      // the line means every ±0.3 u/frame wobble trips the guard. 0.9x is
      // still ~3x the body's own radius and comfortably outside anything the
      // measured deaths came near (they were at 1,500 u and closing), while
      // leaving the demo a whole standoff-tenth of ordinary drift to live in.
      if (Date.now() - _pk._parkT0 >= PARK_MAX_MS &&
          _pkRange < _pkStand * 0.9 && _pkClose > PARK_CLOSE_MAX) {
        _pk._parkT0 = Date.now();
        _pk._parkedAt = null;
        _pk._parkFrom = Math.round(_pkRange);
        // ...and it is a SAFETY HOLD, not the arrival beat: `_parkOwnsBeat`
        // ignores it, so the demo's next leg is never deferred by the guard
        // that is only there to stop the ship falling into the body.
        _pk._keepOut = true;
        ap._arrivalReparks = (ap._arrivalReparks || 0) + 1;
        console.log('🅿️ ARRIVAL KEEP-OUT re-armed → ' +
          ((_pk.obj.userData && _pk.obj.userData.name) || 'body') + ' d=' +
          Math.round(_pkRange) + 'u (stand=' + Math.round(_pkStand) +
          ') closing=' + _pkClose.toFixed(2) + ' u/f');
      }
      const _pkAge = Date.now() - _pk._parkT0;
      if (_pkAge < PARK_MAX_MS && (!_pkStopped ||
          (_pk._parkedAt && Date.now() - _pk._parkedAt < PARK_SETTLE_MS))) {
        // The park owns the stick for this frame. Whatever the phase asked for
        // is overruled — it is running its cruise logic on a ship that is in
        // the middle of an arrival beat.
        const _k = keys();
        // ...including BOOST. The travel phases hold B on a long straight, and
        // B is a thrust multiplier, not a separate key the brake can outrun.
        _k.w = false; _k.s = false; _k.a = false; _k.d = false; _k.b = false;
        // ...INCLUDING THE ONE INPUT THAT IS NOT A KEY HELD DOWN. The combat
        // and approach jumps (four sites) set `keys.wDoubleTap` plus
        // `gameState._pendingJumpMs` as a one-shot latch that physics consumes
        // on its own; clearing w/s/a/d does not touch it, and the jump it
        // fires sets emergencyWarp.isJump — the exact flag this park stands
        // down for. Swallow the latch while the arrival is being looked at.
        _k.wDoubleTap = false;
        // Hold the destination on the nose: the framing hold and the camera
        // assist have both just expired with the ramp, and the reverse thrust
        // below acts along the nose.
        //
        // AT THE AUTO-NAV RATE, FOR THE SAME REASON THE FRAMING HOLD USES IT.
        // The phase underneath is calling orientTowardsTarget every frame too,
        // at the same 0.016 rad/frame demo cap, aimed at ITS destination (the
        // next nebula, tens of thousands of units away in another direction).
        // Two equal exponential pulls settle at a weighted midpoint, so the
        // nose never actually reaches the subject — and every input this block
        // has except the brake acts along the NOSE. That is why the park could
        // press reverse for fifteen straight seconds and hold a dead-constant
        // 0.88-0.93 u/frame of closing: measured, Hyperion Nebula Prime, range
        // walked 1,501 -> 617 u and "PLANETARY IMPACT" while the park was
        // running the whole way down. Borrowing the player auto-nav's 0.045
        // rad/frame (via the same ap.paused toggle the framing hold documents
        // above) makes the arrival the decisive authority on the nose, which
        // is what makes reverse thrust anti-radial rather than diagonal.
        if (window.orientTowardsTarget) {
          const _pkPrevPaused = ap.paused;
          ap.paused = true;
          window.orientTowardsTarget(_pk.obj);
          ap.paused = _pkPrevPaused;
        }
        if (_pkFast) {
          // STAGE 1 — FLARE. Brake, plus physics' own post-jump deceleration
          // while anything is still closing, which is what brings this inside
          // the arrival beat instead of ~4 s after it. This also catches the
          // blown-arrival case (`cut:blown` above): the ship is coasting away
          // at travel speed, and the first thing it needs is to stop, whatever
          // the geometry ends up being.
          _k.x = true;
          if (_pkClose > PARK_CLOSE_MAX) _pkEw.autoBraking = true;
          // ...AND A DECAY CANNOT NULL A VELOCITY SOMETHING KEEPS RE-ADDING.
          // The brake is a multiplier (x0.975/frame), so against any sustained
          // input it settles at an equilibrium rather than at zero. Measured on
          // the fatal leg of run B (Olympus Nebula Prime): the phase underneath
          // was commanding a 1.6 u/frame approach, the park braked, and the two
          // balanced at a dead-constant 0.90-0.93 u/frame of closing for the
          // WHOLE 12,000 ms — never once under the 0.3 latch, and never under
          // PARK_FLARE_SPEED either, so the station-keep below (the one stage
          // that pushes BACK instead of just bleeding) was never reached. So
          // while the range is still shrinking and the ship is not actually
          // travelling, spend the engine as well as the brake: reverse thrust
          // acts along the nose, which the hold above keeps on the subject, so
          // it is anti-radial.
          if (!_pkCruising && _pkClose > PARK_CLOSE_MAX) _k.s = true;
        } else {
          // STAGE 2 — STATION-KEEP. Below the flare threshold the ship is at
          // the engine's floor and only its DIRECTION is still negotiable.
          _pkEw.autoBraking = false;
          // THE DEAD BAND IS NOT SYMMETRIC ONCE WE ARE AT THE STANDOFF. A
          // residual of +0.3 u/frame is 18 u/s of INWARD drift, which is
          // invisible across the arrival beat and lethal if the ship is left
          // sitting there: measured, a leg that parked correctly at 2,275 u
          // (stand 2,129, closing 0.27) was still drifting in when the harness
          // left it idle, and five minutes later read "MISSION FAILED — Ship
          // destroyed by collision with Distant Nebula Epsilon Prime". Outward
          // drift has no such consequence — it only ever loses framing, slowly
          // — so inside the standoff the inward half of the band closes to
          // zero and any approach at all gets answered.
          const _pkCloseBar = (_pkRange <= _pkStand * 1.05) ? 0 : PARK_CLOSE_MAX;
          if (_pkClose > _pkCloseBar) {
            _k.s = true;   // reverse thrust: take the approach out of the drift
          } else if (_pkClose < -PARK_CLOSE_MAX) {
            // The standoff is OPENING — either the park over-corrected, or the
            // subject is a planet on its orbit walking away from us (measured
            // up to ~550 u/s). Same input either way: chase, so the standoff
            // the burn bought is the one the player keeps looking at.
            _k.w = true;
          } else {
            _k.x = true;   // in the deadband: bleed anything that builds up
          }
          // ...and put the floor somewhere harmless. The across-track part of
          // the drift is what the min-velocity clamp should be spending itself
          // on; grow it in whichever direction the burn already had, so the
          // residual reads as a slow lateral slide past the arrival rather
          // than a fight.
          // Only while we are the ones closing: when the standoff is opening
          // the floor is already pointed somewhere useful (at the subject),
          // and spending it sideways would just widen the gap we are chasing.
          if (_pkClose > PARK_CLOSE_MAX && _parkTanTmp && _parkRightTmp &&
              typeof camera !== 'undefined') {
            // Our OWN across-track velocity, so this uses the projection of
            // the ship's velocity (`_pkProj`), not the range rate above — the
            // subject's orbital motion is not something the min-velocity floor
            // can be spent on.
            _parkTanTmp.copy(gameState.velocityVector)
              .addScaledVector(_arriveToTmp, -_pkProj / Math.max(1e-6, _pkRange));
            if (_parkTanTmp.length() < PARK_TANGENTIAL_MIN) {
              _parkRightTmp.set(1, 0, 0).applyQuaternion(camera.quaternion);
              if (_parkTanTmp.dot(_parkRightTmp) >= 0) _k.d = true; else _k.a = true;
            }
          }
        }
      }
      if (_pkStopped && !_pk._parkedAt) {
        _pk._parkedAt = Date.now();
        _pkEw.autoBraking = false;
        // A keep-out re-latching is not a new arrival — count and announce
        // only the real ones, or the telemetry reads 33 "arrivals" for one leg.
        if (_pk._keepOut) {
          ap._keepOutHolds = (ap._keepOutHolds || 0) + 1;
        } else {
          ap._arrivalParks = (ap._arrivalParks || 0) + 1;
          ap._lastArrivalPark = {
            at: _pk._parkedAt,
            // Which terminator actually ended this leg's burn — the proof that
            // the cut/extension pair tiles the space with no dead band.
            path: _pk._cutLogged ? ('cut:' + ((ap._lastArrivalCut && ap._lastArrivalCut.reason) || '?')) :
                  (_pk._burnExtMs ? 'extended' : 'stopwatch'),
            extMs: _pk._burnExtMs || 0,
            ms: _pkAge,
            fromRange: _pk._parkFrom, range: Math.round(_pkRange),
            stand: Math.round(_pkStand), margin: Math.round(_pkMargin),
            speed: Math.round(_pkSpd * 100) / 100,
            closing: Math.round(_pkClose * 100) / 100,
            subject: (_pk.obj.userData && (_pk.obj.userData.name || _pk.obj.userData.type)) || 'body'
          };
          console.log('🛑 WARP ARRIVAL PARKED → ' + ap._lastArrivalPark.subject +
            '  d=' + ap._lastArrivalPark.range + 'u (stand=' + ap._lastArrivalPark.stand +
            ') closing=' + ap._lastArrivalPark.closing + ' u/f speed=' +
            ap._lastArrivalPark.speed + ' u/f in ' + ap._lastArrivalPark.ms +
            'ms via ' + ap._lastArrivalPark.path);
        }
      }
    } else if (_pkEw && _pkEw.autoBraking && !_pkEw.isJump && !_pkEw.active) {
      // The park borrowed physics' jump brake; hand it straight back the
      // instant the park is no longer the thing driving (no subject staged, a
      // new burn armed, a slingshot WHIP ARC took the ship). A real Jump owns
      // this flag on its own and is excluded by `!isJump`.
      _pkEw.autoBraking = false;
    }

    // ── AND THE SAME RULE FOR THE JUMP KEY ──────────────────────────────────
    // `keys.wDoubleTap` is a one-shot latch physics consumes on its own tick,
    // set directly at five sites (combat pursuit, boss approach, post-warp
    // evasion, navigateTo, the re-aim jump) — none of which consults the
    // arrival. triggerOKeyWarp has asked `_departureBlocked` before firing
    // since round 4; this makes the jump answer to it too, at the one place
    // every site funnels through. Cheap: the latch is re-set by whichever
    // caller wanted it as soon as the heading is clear.
    const _dj = keys();
    if (_dj.wDoubleTap && _departureBlocked()) {
      _dj.wDoubleTap = false;
      ap._jumpsBlockedByArrival = (ap._jumpsBlockedByArrival || 0) + 1;
    }

    // NAV SYSTEM REFLECTS THE DEMO'S TARGET: the demo sets
    // gameState.currentTarget directly, but the Navigation panel only
    // re-highlights on a populateTargets() call. Refresh it whenever the
    // demo's target changes (throttled) so the panel visibly tracks what
    // the autopilot is engaging — the demo "uses" the nav system.
    if (typeof populateTargets === 'function' && typeof gameState !== 'undefined') {
      const _ct = gameState.currentTarget;
      if (_ct !== ap._lastNavTarget && Date.now() - (ap._lastNavRefresh || 0) > 400) {
        ap._lastNavTarget = _ct;
        ap._lastNavRefresh = Date.now();
        populateTargets();
      }
    }

    tickHUD();
  }

  // ─── Phases ───────────────────────────────────────────────────────────────
  //
  // Goal order:
  //   1) findLocalEnemies → combat (repeats until all local enemies cleared)
  //   2) warpToNebulaCluster (slingshot or emergency warp) → coastToNebulaCluster
  //   3) orbitNebulaPlanet → triggers deep discovery → followDiscoveryPath
  //   4) combat at revealed location (combat with returnPhase)
  //   5) loop: warpToNebulaCluster → explore → combat
  //   6) approachBorg → fightBorg → reset & loop
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
      // Skip the Earth-orbit beat — the demo opens straight into hunting
      // hostiles so the player learns combat/nav-locking right away
      // (instead of watching the ship orbit Earth for 5 seconds).
      goPhase('findLocalEnemies');
    } else {
      setStatus('Awaiting scene ready…');
    }
  }

  // ─── 1) Hunt down local enemies ───────────────────────────────────────────
  function phaseFindLocalEnemies() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();

    // Force the nav panel to refresh immediately on first entry and every 3s
    if (typeof populateTargets === 'function' &&
        Date.now() - (ap._lastPopulate || 0) > 3000) {
      ap._lastPopulate = Date.now();
      populateTargets();
    }

    // Kill cooldown — coast gently for 1s after a kill
    if (ap._killCooldownUntil && Date.now() < ap._killCooldownUntil) {
      setStatus('Kill confirmed — scanning…');
      keys().w = true;
      return;
    }

    const firstLeg = (ap.warpsUsed || 0) === 0;
    // Only engage genuinely-nearby hostiles. The old 10,000u reach let
    // the demo lock a target half a system away and fly off toward it
    // forever — THAT was the "flying into infinity", not the jump. Local
    // pirates sit ~2.8-4.4k out, so 5,500 covers a real local fight while
    // anything farther waits for a nebula-discovery path / warp.
    const MAX_TARGET_RANGE = 5500;

    // First leg (in Sol): ALWAYS prefer local enemies (Martian Pirates +
    // Vulcan Patrols around Sagittarius A*).  Deep-space hostiles are
    // gated behind nebula discovery and should never be engaged here.
    if (firstLeg) {
      const localEnemy = _nearestLocalEnemy();
      if (localEnemy) {
        const ld = camPos().distanceTo(localEnemy.position);
        if (ld <= MAX_TARGET_RANGE) {
          setStatus('Intercepting ' + (localEnemy.userData.name || 'hostile') + ' — ' + (ld | 0) + ' u');
          gameState.currentTarget = localEnemy;
          flyToward(localEnemy, 2.5);
          pursuitFlightStyle('pursuit');
          if (ld < 2200) {
            ap.combatTarget = localEnemy;
            ap.combatMissileFired = false;
            ap.returnPhase = 'findLocalEnemies';
            goPhase('combat');
          }
          return;
        }
      }
    }

    // Priority 2: nearest detected enemy on nav, capped at 10000u.
    // Beyond 10000u, the demo waits for a nebula-discovery path to
    // unlock that group — never engages "hidden" deep-space hostiles.
    const detected = navDetectedEnemy();
    if (detected) {
      const d = camPos().distanceTo(detected.position);
      if (d <= MAX_TARGET_RANGE) {
        setStatus('NAV target: ' + (detected.userData.name || 'hostile') + ' · ' + (d | 0));
        gameState.currentTarget = detected;
        flyToward(detected, 2.5);
        pursuitFlightStyle('pursuit');
        if (d < 2200) {
          ap.combatTarget = detected;
          ap.combatMissileFired = false;
          ap.returnPhase = 'findLocalEnemies';
          goPhase('combat');
        }
        return;
      }
    }

    // All enemies cleared — move to interstellar phase
    // First leg: must have zero local enemies remaining
    if (ap.enemiesKilled >= 3 && (!firstLeg || _countLocalEnemies() === 0)) {
      goPhase('warpToNebulaCluster');
    } else {
      // Not enough kills yet and no enemy in engage range. DON'T
      // blind-thrust forward (keys().w) — that flew the demo straight
      // out of bounds, especially now that the tighter engage range
      // drops us here more often. Instead steer toward something real:
      // nearest hostile (local-only on the first leg), else a nebula,
      // else the Sol core. flyToward brakes on arrival, and if we're
      // already sitting on the anchor with nothing to do we coast/brake
      // rather than fly off.
      cycleScanTarget();
      let cruiseTo = firstLeg ? _nearestLocalEnemy() : nearestAliveEnemy(100000);
      if (!cruiseTo && typeof nearestTwinNebula === 'function') cruiseTo = nearestTwinNebula();
      if (!cruiseTo) {
        const sol = (typeof window !== 'undefined' && window.localSystemOffset) || { x: 8000, y: 0, z: 4800 };
        if (!ap._solDummy) ap._solDummy = { position: new THREE.Vector3(), userData: {} };
        ap._solDummy.position.set(sol.x, sol.y, sol.z);
        cruiseTo = ap._solDummy;
      }
      if (cruiseTo && cruiseTo.position && camPos().distanceTo(cruiseTo.position) > 300) {
        // Reorient FIRST. flyToward only sets thrusters — without an
        // active reorient the ship can keep adding thrust along its old
        // heading (e.g. residual outward velocity after a jump overshoot),
        // which is how the demo ends up "lost" in interstellar space.
        if (window.orientTowardsTarget) window.orientTowardsTarget(cruiseTo);
        // Detect outward drift: velocity pointing away from cruise target
        // means thrusters would just accelerate the wrong direction. Brake
        // hard instead until either velocity drops or we've rotated back.
        const vv = gameState.velocityVector;
        if (vv && vv.lengthSq() > 4) { // speed > 2
          const _to = cruiseTo.position.clone().sub(camPos()).normalize();
          const _vn = vv.clone().normalize();
          if (_vn.dot(_to) < 0.3) {
            keys().x = true;
            setStatus('Drift recovery — braking back toward ' + ((cruiseTo.userData && cruiseTo.userData.name) || 'objective'));
            return;
          }
        }
        flyToward(cruiseTo, 1.6);
      } else if (gameState.velocityVector && gameState.velocityVector.length() > 0.5) {
        keys().x = true; // arrived at anchor, nothing to do → brake, don't drift off
      }
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

    // Abort pursuit if the target runs beyond 6500u — but only when the
    // ship isn't already trying to crash through that gap via residual
    // jump velocity. A 5s tactical W-jump can dump us 8k+ past a target;
    // if we bail on bare distance the cruise fallback then carries the
    // overshoot outward forever. Give the overshoot a brake-and-reacquire
    // window first.
    const dist = camPos().distanceTo(enemy.position);
    if (dist > 6500) {
      const _speedNow = gameState.velocityVector ? gameState.velocityVector.length() : 0;
      if (_speedNow > 2 && gameState.velocityVector) {
        // Brake and aim back at the target. Stay in combat — we'll either
        // re-enter engage range as we decelerate, or speed will drop and
        // the abort below will fire on the next frame.
        if (window.orientTowardsTarget) window.orientTowardsTarget({ position: enemy.position });
        keys().x = true;
        setStatus('Overshoot — braking to re-acquire (' + (dist | 0) + ' u)');
        return;
      }
      ap.combatTarget = null;
      goPhase('findLocalEnemies');
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
      // Invalidate nav cache so the next scan finds fresh targets
      ap._navCacheFrame = -99;

      ap._killCooldownUntil = Date.now() + 1000;

      // Resume the prior phase if it was a deliberate mission step
      // (following a path, engaging a boss, approaching a nebula).
      // Otherwise: stay and fight nearby locals; or if local space is
      // clear, give the boss-spawn machinery a beat and look for a boss.
      //
      // The previous code unconditionally forced returnPhase to
      // 'findLocalEnemies' whenever any local enemy was alive, which
      // hijacked followDiscoveryPath (combat→kill→back to Vulcans near
      // the nebula instead of resuming the path to the revealed sector).
      const MISSION_RETURN_PHASES = new Set([
        'followDiscoveryPath',
        'bossEngage',
        'coastToNebulaCluster',
        'orbitNebulaPlanet',
        'warpToNebulaCluster',
        'gotoBlackHoleGalaxy',
        'approachBorg',
        'fightBorg'
      ]);
      const localAlive = _countLocalEnemies();
      let nextPhaseAfterKill;
      if (ap.returnPhase && MISSION_RETURN_PHASES.has(ap.returnPhase)) {
        // Mission step — resume it.
        nextPhaseAfterKill = ap.returnPhase;
      } else if (localAlive > 0) {
        nextPhaseAfterKill = 'findLocalEnemies';
        ap.returnPhase = 'findLocalEnemies';
      } else {
        ap.segmentKills = 0;
        // After the last local kill, give the boss-spawn machinery a
        // beat to react, then check for an active boss.  If one
        // exists (or appears within the timeout), the demo engages
        // it BEFORE warping out so the player sees the blood-red
        // skybox heartbeat and the boss-tier fight.
        nextPhaseAfterKill = 'bossEngage';
      }

      // 70% chance (was 40) to detour to an asteroid showcase before
      // resuming, with a wider search; otherwise route directly to the
      // next phase. The next-phase decision is committed via _mineReturnPhase.
      if (Math.random() < 0.70 && _findNearestAsteroid(1600)) {
        ap._mineReturnPhase = nextPhaseAfterKill;
        ap._mineShotsLeft = 4;
        setTimeout(() => { if (ap.active) goPhase('mineAsteroids'); }, 1000);
      } else {
        setTimeout(() => { if (ap.active) goPhase(nextPhaseAfterKill); }, 1000);
      }
      return;
    }

    // PROACTIVE RECOVERY: if the gap to the target keeps GROWING past 1,500u
    // for more than 3 s, reorient and W-jump back toward it (don't let the
    // demo slowly drift away). Brakes the outward drift while turning, then
    // dashes back once the bow is on the target.
    if (ap._recTgt !== enemy) { ap._recTgt = enemy; ap._recSince = 0; ap._recPrev = dist; ap._recJump = false; }
    const _recGrowing = dist > (ap._recPrev || dist) + 0.5;
    ap._recPrev = dist;
    if (dist > 1500 && _recGrowing) { if (!ap._recSince) ap._recSince = Date.now(); }
    else { ap._recSince = 0; }
    const _recWarpBusy = gameState.emergencyWarp &&
        (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning);
    if (ap._recSince && Date.now() - ap._recSince > 3000) { ap._recJump = true; ap._recSince = 0; }
    if (ap._recJump && !_recWarpBusy) {
      if (window.orientTowardsTarget) window.orientTowardsTarget({ position: enemy.position });
      keys().x = true; // kill the outward drift while turning back
      let _recF = 1;
      if (_coneVec && camera) {
        _coneVec.subVectors(enemy.position, camera.position).normalize();
        camera.getWorldDirection(_coneFwd);
        _recF = _coneFwd.dot(_coneVec);
      }
      if (_recF > 0.9 && gameState.energy > 25) {
        ap._recJump = false;
        gameState._pendingJumpSpeed = 45;
        gameState._pendingJumpMs = Math.min(6000, Math.max(700, (dist * 0.8 - 45 * 65) / 45 * 16.67));
        if (window.keys) {
          window.keys.wDoubleTap = true;
          setTimeout(() => { if (window.keys) window.keys.wDoubleTap = false; }, 120);
        }
        setStatus('Reorient + warp back to target (' + (dist | 0) + ' u)');
      } else {
        setStatus('Reorienting on target (' + (dist | 0) + ' u)');
      }
      return; // hold this frame for the recovery maneuver
    }

    // Use the enemy's own firing range — that's how close we need to be for
    // a proper dog-fight (enemy fires back at us, we fire at them).
    // BOSS TIER: hold a standoff — bosses have missile volleys (long
    // reach) and spinning laser sweeps that punish point-blank camping.
    // Halved from the original 1,400u floor per playtest: the demo now
    // fights from ~700u, inside the sweep radius occasionally (drama)
    // but with the back-off below still preventing hull-scraping.
    const _bossTier = enemy.userData.isBoss || enemy.userData.isEliteGuardian ||
                      enemy.userData.isBlackHoleGuardian;
    const engageRange = _bossTier
      ? Math.max((enemy.userData.firingRange || 500) * 0.67, (enemy.userData.hitboxSize || 288) * 0.5, 470)
      : (enemy.userData.firingRange || 500);

    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;

    if (dist > engageRange) {
      // ── PURSUIT: close distance to weapons range ──────────────────
      setStatus('Pursuing ' + (enemy.userData.name || 'hostile') + ' — ' + (dist | 0) + ' u');
      flyToward(enemy, 2.5);
      pursuitFlightStyle('pursuit');

      // Orient toward the target FIRST (so the jump/warp below never fires
      // along a stale heading at game start). Compute how aligned the bow is.
      if (window.orientTowardsTarget) window.orientTowardsTarget({ position: enemy.position });
      let _facingEnemy = 1;
      if (_coneVec && camera) {
        _coneVec.subVectors(enemy.position, camera.position).normalize();
        camera.getWorldDirection(_coneFwd);
        _facingEnemy = _coneFwd.dot(_coneVec);
      }

      // LONG INTERCEPT: beyond 5,000u, close with the O-key EMERGENCY WARP
      // (not the W-jump). Then let it run its course / thrust forward without
      // braking until the ~500u braking zone.
      const _warpBusyNow = gameState.emergencyWarp &&
          (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning);
      const _canOWarp = !_warpBusyNow && canEmergencyWarp() &&
          Date.now() - (ap._lastBHWarp || 0) > 20000;
      if (dist > 5000 && _canOWarp && _facingEnemy > 0.9) {
        if (triggerOKeyWarp(enemy)) {
          ap._lastBHWarp = Date.now();
          ap._pirateNoBrake = true;
          setStatus('Emergency warp → ' + (enemy.userData.name || 'hostile') + ' (' + (dist | 0) + ' u)');
          return;
        }
      }
      // Clear the no-brake flag once we're close enough to engage.
      if (dist <= 500) ap._pirateNoBrake = false;

      // EMERGENCY-WARP BRAKE-IN: the long intercept must not carry the ship
      // past the target. Within 500u, CUT the boost (the physics ends it on
      // timeRemaining <= 0 and hands velocity back) and brake — the global
      // warp-integrity guard suppresses X only while the boost is active,
      // so without the cut the ship sails through the engagement at ~15u/f.
      //
      // ONLY FOR A BURN THAT IS ACTUALLY FLYING AT THIS ENEMY. Unqualified,
      // this clause killed ANY active non-jump warp the moment ANY hostile
      // came within 500 u — and combat runs off swarmEnemiesNearPlayer at
      // 20 Hz, so during a 30,000 u interstellar leg there is almost always
      // one. Measured, it is what produced the 134 / 228 / 424 / 482 ms burns
      // that died with 7,700-24,933 ms still on the clock: the destination
      // leg was executed as a stutter and ended in vacuum. A leg carrying a
      // live arrival subject somewhere else is not this dogfight's to cut —
      // its own arrival cut-off owns its ending. (A subject staged within
      // 1,500 u of the hostile IS this engagement, so the brake still fires.)
      const _asBI = (typeof gameState !== 'undefined') && gameState._arrivalSubject;
      const _warpBoundElsewhere = !!(_asBI && _asBI.obj && _asBI.obj.position &&
          _arrivalSubjectFresh(_asBI) && _asBI.obj !== enemy &&
          _asBI.obj.position.distanceTo(enemy.position) > 1500);
      if (dist <= 500 && !_warpBoundElsewhere &&
          gameState.emergencyWarp && gameState.emergencyWarp.active &&
          !gameState.emergencyWarp.isJump) {
        gameState.emergencyWarp.timeRemaining = 0;
        keys().x = true;
        setStatus('On target — cutting warp, braking');
      }
      // Arriving hot from a warp/jump coast: kill speed inside 500u.
      if (dist <= 500 && speed > 8) {
        keys().x = true;
      }

      // Tactical jumps (double-tap W) to shift momentum toward a target.
      // Fires for intercepts beyond 1,000u — short dashes are a great way
      // to change direction faster than coasting. The post-jump
      // deceleration is gentle (physics auto-brake 0.985) so a dash
      // carries momentum, and the overshoot brake below stops it if it
      // sails past. 4s cooldown, 25+ energy, not while a warp is in
      // flight, not when a missile is in flight at the target.
      const JUMP_MIN_DIST = 1000;
      const _warpBusy = gameState.emergencyWarp &&
          (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning);
      // How aligned our MOMENTUM (not the bow) is with the target.
      let _closing = 1;
      if (speed > 0.5 && gameState.velocityVector && _coneVec && camera) {
        _coneVec.subVectors(enemy.position, camera.position).normalize();
        _closing = gameState.velocityVector.clone().normalize().dot(_coneVec);
      }
      // Tactical W-jump: dash toward the target. Fires from cruise (speed < 12,
      // which the old "speed < 4" gate never hit since pursuit cruise sits at
      // ~4u, so the demo just crawled at far targets) OR at ANY speed when our
      // momentum isn't already pointed at the hostile (_closing < 0.5) — once
      // the bow is on target a double-tap W slings that momentum straight onto
      // it, turning on a dime (works best at high speed). The jump owns the
      // frame (returns), so the overshoot/runaway brakes below only run when a
      // jump isn't available (cooldown / misaligned / low energy).
      // Capped at <=5000u: farther than that the O-key warp above handles the
      // intercept (use W-jumps only inside 5k, or as a fallback when no warp
      // is available).
      if (dist > JUMP_MIN_DIST && (dist <= 5000 || !_canOWarp) &&
          (speed < 12 || _closing < 0.5) && !_warpBusy &&
          _facingEnemy > 0.9 &&
          gameState.energy > 25 &&
          !_isMissileInFlightAt(enemy) &&
          Date.now() - (ap._lastJumpTap || 0) > 4000) {
        ap._lastJumpTap = Date.now();
        if (window.keys) {
          if (typeof gameState !== 'undefined') {
            // Size the jump to land near the target in one tap. At
            // boostSpeed 15 (~0.9 u/ms) plus the gentle coast tail it
            // travels a bit past 0.9*t, so aim for (dist - 700) and let
            // the overshoot brake settle the last bit. 700-6000ms.
            gameState._pendingJumpMs = Math.min(6000, Math.max(700, (dist - 700) * 1.0));
          }
          window.keys.wDoubleTap = true;
          setTimeout(() => { if (window.keys) window.keys.wDoubleTap = false; }, 120);
        }
        setStatus('Tactical jump — closing on hostile');
        return;
      }

      // Brake if the jump overshoots past the target — detect by
      // checking if we're moving AWAY from the enemy. (Suppressed during a
      // Martian-pirate emergency-warp intercept until within 500u.)
      if (!ap._pirateNoBrake && speed > 2 && gameState.velocityVector) {
        _coneVec.subVectors(enemy.position, camera.position).normalize();
        camera.getWorldDirection(_coneFwd);
        const closing = gameState.velocityVector.clone().normalize().dot(_coneVec);
        if (closing < 0.3) {
          keys().x = true;
          setStatus('Overshoot — braking');
        }
      }

      // RUNAWAY GUARD: beyond 800u with the gap GROWING → brake now.
      // Before this, the only hard distance turnaround was the 6,500u
      // pursuit abort, so a bad jump/warp exit could carry the demo
      // 5,000+ units past a target (nose locked on it the whole way,
      // momentum pointing elsewhere) before anything corrected.
      if (ap._prevCombatTarget !== enemy) {
        ap._prevCombatTarget = enemy;
        ap._prevCombatDist = undefined;
      }
      const _prevCD = ap._prevCombatDist;
      ap._prevCombatDist = dist;
      if (!ap._pirateNoBrake && dist > 800 && typeof _prevCD === 'number' &&
          dist > _prevCD + 0.5 && speed > 1) {
        keys().x = true;
        // RE-ORIENT & RESUME: the bow is already re-aimed every frame (the
        // orient call at the top of pursuit) — also clear the jump cooldown
        // once per runaway episode so the corrective dash fires the moment
        // the heading is back on the enemy (facing > 0.9), instead of
        // coasting away for up to 4 more seconds.
        if (Date.now() - (ap._lastRunawayReset || 0) > 4000) {
          ap._lastRunawayReset = Date.now();
          ap._lastJumpTap = 0;
        }
        setStatus('Receding — braking, re-orienting to resume pursuit (' + (dist | 0) + ' u)');
      }

      // NO long warps in combat. The 15s O-warp used to fire for any
      // pursuit > 2000u — and once warp-integrity stopped mid-boost
      // braking, that warp sailed tens of thousands of units past the
      // target (seen live: demo stranded 16k from a 9-HP boss). The
      // range-scaled W-jump above already covers combat gap-closing.
    } else {
      // ── ENGAGE: inside weapons range ──────────────────────────────
      setStatus('Engaging ' + (enemy.userData.name || 'hostile') + ' — in weapons range');
      flyToward(enemy, 0.8);
      pursuitFlightStyle('engage');

      // Boss standoff: too close to a boss means eating the laser sweep.
      // Back away until we're outside half the engage range again.
      if (_bossTier && dist < engageRange * 0.55) {
        keys().s = true;
        keys().x = true;
        setStatus('Boss standoff — backing away (' + (dist | 0) + ' u)');
      }

      // Brake if overshooting: closing too fast inside 2/3 of range
      if (dist < engageRange * 0.67 && speed > 1.5) {
        keys().x = true;
        setStatus('Holding range — braking');
      }

      // Brake if sprinting at a slow/stationary target
      if (dist < 500 && speed > 2.5) {
        keys().x = true;
      }
    }

    // ── Demo charged-blast showcase ───────────────────────────────────────
    // The demo regularly HOLDS the charge (the wing glow builds for ~1-2s)
    // then releases a power-scaled blast — a signature move, not a rarity:
    // ~every 6-10s of sustained engagement (was 2% roll + 14s cooldown,
    // which viewers could miss entirely). One at a time; also allowed on
    // the approach edge of weapons range so charges land as it closes.
    if (typeof gameState !== 'undefined') {
      if (!ap._demoChargeUntil && dist <= engageRange * 1.25 && speed < 4 &&
          Date.now() - (ap._lastDemoCharge || 0) > 6000 && Math.random() < 0.08) {
        const _dur = 1000 + Math.random() * 1000;
        gameState._laserChargeStart = Date.now(); // drives the wing glow
        ap._demoChargeUntil = Date.now() + _dur;
        ap._lastDemoCharge = Date.now();
        setStatus('Charging blast…');
      }
      if (ap._demoChargeUntil) {
        if (Date.now() >= ap._demoChargeUntil) {
          const _pw = Math.min(1, (Date.now() - (gameState._laserChargeStart || Date.now())) / 2000);
          gameState._laserChargeStart = 0;
          ap._demoChargeUntil = 0;
          if (typeof window.fireChargedBlast === 'function') window.fireChargedBlast(_pw);
        }
      }
    }

    // Always orient toward the enemy so the ship visually tracks it
    const aimDummy = { position: enemy.position };
    if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);
    gameState.currentTarget = enemy;

    // Missile in flight at this target → lock onto it: cancel any active
    // pursuit-flair roll, hold the bow on the target until the missile
    // resolves (impact, miss, or expiry).
    if (_isMissileInFlightAt(enemy)) {
      if (ap._flightStyleKey) {
        keys()[ap._flightStyleKey] = false;
      }
      ap._flightStyleKey = null;
      ap._flightStyleUntil = 0;
      ap._nextFlightStyleAt = Date.now() + 2000;
      setStatus('Missile away — holding bow on ' + (enemy.userData.name || 'target'));
    }

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

    // One missile per target, only when inside (auto-aim + 100u) range
    // and only while shields are down.  2.5 s global cooldown keeps us
    // from burning the whole rack on a single engagement.
    if (shouldFireMissileAt(enemy, dist)) {
      ap._lastMissileTime = Date.now();
      markMissileFiredAt(enemy);
      setTimeout(() => {
        if (ap.active) fireMissileAt(enemy);
      }, 150);
    }

    // PURSUIT DOCTRINE: do NOT disengage on timeout.  The autopilot stays on
    // the target until its health hits zero.  If the enemy outruns us, the
    // phase will still be fine — we keep chasing.
  }

  // ─── Boss engagement — after clearing local hostiles, hunt the area boss
  // the game spawned (bossSystem.activeBoss or any enemy with isBoss). Falls
  // through to warpToNebulaCluster when no boss is around within 12 s, so
  // legs that don't trigger a boss-spawn still progress to the next nebula.
  function phaseBossEngage() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();

    let boss = null;
    if (typeof bossSystem !== 'undefined' && bossSystem.activeBoss &&
        bossSystem.activeBoss.userData && bossSystem.activeBoss.userData.health > 0) {
      boss = bossSystem.activeBoss;
    }
    if (!boss && typeof enemies !== 'undefined') {
      const cp = camPos();
      let bestD = 18000;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.userData) continue;
        if (!e.userData.isBoss) continue;
        if (e.userData.health <= 0) continue;
        const d = cp.distanceTo(e.position);
        if (d < bestD) { bestD = d; boss = e; }
      }
    }

    // No boss yet — wait up to 12 s for spawn machinery to catch up,
    // then move on. The blood-red skybox heartbeat only triggers when a
    // boss exists, so a "no boss this leg" outcome is fine.
    if (!boss) {
      setStatus('Scanning for boss signature…');
      if (t > 12000) {
        const firstLeg = (ap.warpsUsed || 0) === 0;
        goPhase('warpToNebulaCluster');
      }
      return;
    }

    const dist = camPos().distanceTo(boss.position);
    setStatus('BOSS ENGAGEMENT — ' + (boss.userData.name || 'enemy') + ' · ' + (dist | 0) + ' u');
    gameState.currentTarget = boss;
    if (dist < 5000) {
      // ESCORTS FIRST: strip the boss's support wing before the flagship.
      // The wing's swarm patterns (orbiters/flankers/divers/screen) ARE the
      // interesting part of the fight — diving straight at the boss skipped
      // them and read flat. Each combat loop returns here, so the demo
      // works through the wing nearest-first and finishes on the boss.
      let engageTarget = boss;
      if (typeof enemies !== 'undefined') {
        let bestD = Infinity;
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (!e || !e.userData || e.userData.health <= 0 || !e.userData.isBossSupport) continue;
          if (e.position.distanceTo(boss.position) > 6000) continue;   // this boss's wing
          const d = camPos().distanceTo(e.position);
          if (d < bestD) { bestD = d; engageTarget = e; }
        }
      }
      if (engageTarget !== boss) {
        setStatus('Clearing boss escort — ' + (engageTarget.userData.name || 'escort'));
        gameState.currentTarget = engageTarget;
      }
      ap.combatTarget = engageTarget;
      ap.combatMissileFired = false;
      // Returning to bossEngage keeps the demo looping until the boss
      // (and any escort that spawned alongside) is gone, then we fall
      // through to warpToNebulaCluster on the next entry with no boss
      // present.
      ap.returnPhase = 'bossEngage';
      goPhase('combat');
      return;
    }

    // ORIENT FIRST, every frame. Without this the phase only set thrusters
    // (flyToward doesn't steer) and fired W-jumps along the ship's CURRENT
    // heading — which, after any overshoot, points AWAY from the boss. That
    // was the demo "flying away from the boss it's targeting": each jump
    // flung it further out. Now the bow tracks the boss before anything.
    if (window.orientTowardsTarget) window.orientTowardsTarget({ position: boss.position });

    // Are we actually pointed at the boss yet? (don't thrust/jump until so)
    let facing = 1;
    if (_coneVec && camera) {
      _coneVec.subVectors(boss.position, camera.position).normalize();
      camera.getWorldDirection(_coneFwd);
      facing = _coneFwd.dot(_coneVec);
    }

    const _beSpeed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
    const _beWarpBusy = gameState.emergencyWarp &&
        (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning);

    // Drifting AWAY from the boss (residual velocity from a prior overshoot)
    // → brake and keep turning, don't add thrust along a bad heading.
    if (_beSpeed > 2 && facing < 0.2) {
      keys().x = true;
      setStatus('Reorienting on boss — braking (' + (dist | 0) + ' u)');
      return;
    }

    // Tactical W-jump to close big gaps fast — ONLY when pointed at the
    // boss. Uses a gentle boost speed (45 vs the 100 emergency boost) sized
    // to land ~80% of the way, so it closes distance without the 10k+
    // overshoot the full boost produced.
    if (dist > 3500 && facing > 0.92 && _beSpeed < 4 && !_beWarpBusy &&
        gameState.energy > 25 &&
        Date.now() - (ap._lastJumpTap || 0) > 5000) {
      ap._lastJumpTap = Date.now();
      const S = 45;                    // matches _pendingJumpSpeed below
      const coast = S * 65;            // ~auto-brake coast distance
      gameState._pendingJumpSpeed = S;
      gameState._pendingJumpMs = Math.min(5000, Math.max(450, (dist * 0.8 - coast) / S * 16.67));
      if (window.keys) {
        window.keys.wDoubleTap = true;
        setTimeout(() => { if (window.keys) window.keys.wDoubleTap = false; }, 120);
      }
      setStatus('Tactical jump → boss (' + (dist | 0) + ' u)');
      return;
    }

    flyToward(boss, 2.5);
    pursuitFlightStyle('pursuit');
  }

  // ─── Asteroid mining: orient → shoot 2-3 asteroids for hull ─────────────
  function phaseMineAsteroids() {
    const t = elapsed();
    ensureThirdPerson();

    // Any hostile detected — abort mining, go fight
    const intruder = navDetectedEnemy();
    if (intruder) {
      ap.combatTarget = intruder;
      ap.combatMissileFired = false;
      ap.returnPhase = ap._mineReturnPhase || 'findLocalEnemies';
      goPhase('combat');
      return;
    }

    // Showcase mode: shoot until shots-left runs out or 8 s elapses.
    // The hull-threshold gate has been dropped so the demo always
    // visually destroys a few asteroids regardless of hull state.
    if ((ap._mineShotsLeft || 0) <= 0 || t > 8000) {
      goPhase(ap._mineReturnPhase || 'findLocalEnemies');
      return;
    }

    // Look further out for asteroids (up to 1800u) so the demo doesn't
    // bail just because nothing is within point-blank range. Orient and
    // thrust toward the asteroid so the player sees a deliberate strafe.
    const asteroid = _findNearestAsteroid(1800);
    if (!asteroid) {
      // No asteroids in range — move on
      goPhase(ap._mineReturnPhase || 'findLocalEnemies');
      return;
    }

    // Orient toward the asteroid
    const tgtPos = asteroid.position.clone();
    if (asteroid.parent && asteroid.parent.type === 'Group' && asteroid.parent.parent) {
      asteroid.getWorldPosition(tgtPos);
    }
    if (window.orientTowardsTarget) {
      window.orientTowardsTarget({ position: tgtPos });
    }
    setStatus('Strafing asteroid (' + (ap._mineShotsLeft || 0) + ' shots left)');

    // Thrust toward the asteroid when it's far, brake when close so the
    // ship comes to a clean firing solution rather than overflying.
    const cp = camPos();
    const distToAsteroid = cp.distanceTo(tgtPos);
    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
    if (distToAsteroid > 400) {
      keys().w = true;
    } else if (speed > 0.5) {
      keys().x = true;
    }

    // Only fire once on screen and confirmed by raycast
    if (!_isOnScreen(tgtPos)) return;

    const now = Date.now();
    if (now - (ap._lastAsteroidFire || 0) < 1200) return;
    if (gameState.weapons.cooldown > 0 || gameState.weapons.energy < 10) return;

    if (!shootNearbyAsteroids._ray) shootNearbyAsteroids._ray = new THREE.Raycaster();
    if (!shootNearbyAsteroids._origin) shootNearbyAsteroids._origin = new THREE.Vector2(0, 0);
    const ray = shootNearbyAsteroids._ray;
    ray.setFromCamera(shootNearbyAsteroids._origin, camera);
    const hits = ray.intersectObjects([asteroid], true);
    if (!hits.length) return;

    gameState.crosshairX = window.innerWidth / 2;
    gameState.crosshairY = window.innerHeight / 2;
    ap._lastAsteroidFire = now;
    ap._mineShotsLeft = (ap._mineShotsLeft || 0) - 1;
    if (window.fireWeapon) window.fireWeapon();
  }

  // ─── 2) Emergency-warp toward a nearby twin (clustered) nebula ─────────
  // The demo orients on the center between a paired clustered nebulas and
  // punches an emergency warp directly — no planetary slingshot.  Falls
  // back to any nebula and finally a plain warp if no twin pair is found.
  function phaseWarpToNebulaCluster() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();

    // Lock in the destination on first entry — prefer a twin (clustered)
    // pair; fall back to nearest nebula if no twin cluster exists.
    // A DESTINATION WE HAVE ALREADY REACHED IS NOT THIS LEG'S DESTINATION.
    // `ap.currentNebula` survives between phases, and the coast phase
    // deliberately re-routes it to any nebula that turns out closer mid-flight
    // — so by the time the demo is back here asking for a warp, the "target"
    // is routinely the cloud the ship is now parked inside. Measured: the leg
    // that broke this round fired at Prometheus Nebula 1,759 u away. Drop it
    // and pick a real leg (the fallbacks below still allow a short one when
    // there is genuinely nothing further out).
    if (ap.currentNebula && ap.currentNebula.position &&
        camPos().distanceTo(ap.currentNebula.position) < TRAVEL_LEG_MIN_DIST) {
      ap.currentNebula = null;
      ap.orbitTarget = null;
    }
    if (!ap.currentNebula) {
      // A REAL LEG FIRST (see TRAVEL_LEG_MIN_DIST): prefer the nearest twin
      // cluster / nebula that is actually somewhere else, and only fall back
      // to the plain nearest when the ship has nowhere further to go — in
      // which case the leg will be short, the warp will (correctly) refuse to
      // ignite with nothing to arrive at, and the phase's own 8 s fallback
      // hands it to a cruise.
      ap.currentNebula = nearestTwinNebula(TRAVEL_LEG_MIN_DIST) ||
                         nearestNebula(TRAVEL_LEG_MIN_DIST) ||
                         nearestTwinNebula() || nearestNebula();
      if (!ap.currentNebula) { setStatus('No nebula in range — waiting'); return; }
    }

    const target = ap.currentNebula;
    const targetPos = target.position;

    const targetName = (target.userData && target.userData.isTwinCluster)
      ? 'twin nebula center'
      : ((target.userData && target.userData.name) || 'nebula');

    // ── GRAVITY-WHIP FIRST ────────────────────────────────────────────
    // The slingshot is the renewable interstellar engine (warp charges
    // are scarce now). If a usable body is within reach, fly into its
    // gravity well, lock the nebula as the nav target, and whip. O-key
    // warp is the fallback when no body is near or the approach stalls.
    if (!ap._slingshotTried && !(gameState.slingshot && gameState.slingshot.active)) {
      if (!ap.slingshotPlanet) {
        ap.slingshotPlanet = pickSlingshotPlanet(targetPos) || null;
        if (!ap.slingshotPlanet) ap._slingshotTried = true;
      }
      const sp = ap.slingshotPlanet;
      if (sp && gameState.energy > 25) {
        const spDist = camPos().distanceTo(sp.position);
        const range = (typeof window.getSlingshotRange === 'function')
          ? window.getSlingshotRange(sp) * 0.8 : 150;
        if (spDist > 6500 || t > 14000) {
          // Body drifted away or approach stalled — fall back to warp
          ap._slingshotTried = true;
        } else if (spDist > range) {
          setStatus('Gravity-whip approach → ' + (sp.userData.name || 'body') +
                    ' (' + (spDist | 0) + ' u)');
          // Aim target = the nebula, so the whip launches toward it
          gameState.currentTarget = target;
          if (window.orientTowardsTarget) window.orientTowardsTarget(sp);
          flyToward(sp, 2.0);
          return;
        } else {
          gameState.currentTarget = target;
          if (typeof triggerSlingshot === 'function' && triggerSlingshot()) {
            setStatus('GRAVITY WHIP → ' + targetName);
            transmit('NAVIGATION', 'Gravity whip engaged!\nSlinging around ' +
                     (sp.userData.name || 'the body') + ' → ' + targetName);
            ap.warpStartedAt = Date.now();
            ap.warpsUsed++;
            goPhase('coastToNebulaCluster');
            return;
          }
          ap._slingshotTried = true; // cooldown/energy refused — warp instead
        }
      }
    }

    const aimDummy = { position: targetPos };
    if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);

    let warpAligned = false;
    if (_coneVec && camera) {
      _coneVec.subVectors(targetPos, camera.position).normalize();
      camera.getWorldDirection(_coneFwd);
      // 0.97 (~14 deg) — was 0.85, which is a 31.8 deg cone. Warp guidance
      // can bend a burn back onto its destination, but every degree of
      // ignition error is distance spent curving instead of arriving, and on
      // a short leg a 30 deg start can eat the whole burn. 14 deg closes well
      // inside the first second of a 15 s boost. This does not risk stalling
      // the phase: the hard fallback below still punches the warp at t > 8 s
      // whatever the alignment.
      warpAligned = _coneFwd.dot(_coneVec) > 0.97;
    }

    setStatus(warpAligned
      ? ('EMERGENCY WARP → ' + targetName)
      : ('Aligning for warp → ' + targetName));

    keys().w = true;
    // `target` (the nebula / twin-cluster centre) is handed to the warp so
    // this leg is DESTINATION-BEARING: triggerOKeyWarp resolves a real body
    // at that centre as the arrival subject, which is what the per-frame
    // arrival cut-off and the exit framing converge on. Previously this — the
    // demo's main long-haul leg — fired with no argument at all, so it fell
    // through to the heading-estimate staging and usually claimed nothing.
    if (warpAligned && t > 1200 && canEmergencyWarp() && triggerOKeyWarp(target)) {
      ap.warpStartedAt = Date.now();
      ap.warpsUsed++;
      goPhase('coastToNebulaCluster');
      return;
    }

    // Hard fallback — punch the warp even if alignment never settles
    // (extended window when a slingshot approach was in progress)
    if (t > (ap.slingshotPlanet ? 16000 : 8000)) {
      if (canEmergencyWarp() && triggerOKeyWarp(target)) {
        ap.warpStartedAt = Date.now();
        ap.warpsUsed++;
        goPhase('coastToNebulaCluster');
        return;
      }
      // FIX 2 — DEMO PLAYS THE BEAT: O-warp is the scarce mechanic (kill-
      // gated, limited charges) and can be tapped out here even though this
      // IS a major nebula-to-nebula leg. The slingshot check above only ran
      // once, early in this phase — a body can have drifted into range
      // since. One more opportunistic look before conceding this leg to a
      // flat, beat-less cruise: if something is ALREADY within whip range
      // right now, take it instead of silently skipping the ramped path.
      const _fallbackSp = pickSlingshotPlanet(targetPos);
      if (_fallbackSp && gameState.energy > 25) {
        const _fbRange = (typeof window.getSlingshotRange === 'function')
          ? window.getSlingshotRange(_fallbackSp) * 0.8 : 150;
        if (camPos().distanceTo(_fallbackSp.position) <= _fbRange) {
          gameState.currentTarget = target;
          if (triggerSlingshot()) {
            setStatus('GRAVITY WHIP → ' + targetName);
            ap.warpStartedAt = Date.now();
            ap.warpsUsed++;
            goPhase('coastToNebulaCluster');
            return;
          }
        }
      }
      ap.warpStartedAt = Date.now();
      goPhase('coastToNebulaCluster');
    }
  }

  // Pick the best slingshot body. Stars are STRONGLY preferred (their
  // gravity launches the player furthest), then large planets (Jupiter,
  // Saturn). Body must be roughly in the direction of the nebula so the
  // slingshot boost actually heads the right way.
  function pickSlingshotPlanet(nebulaPos) {
    if (typeof planets === 'undefined' || !nebulaPos) return null;
    const cp = camPos();
    const toNebula = nebulaPos.clone().sub(cp).normalize();

    // Pass 1: prefer STARS in the nebula direction within 6000u
    let bestStar = null, bestStarScore = -Infinity;
    let bestPlanet = null, bestPlanetScore = -Infinity;
    let bestAny = null, bestAnyDist = Infinity;

    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      const ud = p && p.userData;
      if (!ud) continue;
      if (ud.type === 'asteroid' || ud.type === 'asteroidBelt') continue;
      if (ud.type === 'blackhole') continue;
      if (ud.name === 'Earth') continue;
      const dist = cp.distanceTo(p.position);
      if (dist > 6000) continue;
      if (dist < bestAnyDist) { bestAny = p; bestAnyDist = dist; }

      const toPlanet = p.position.clone().sub(cp).normalize();
      const dirAlign = toPlanet.dot(toNebula); // -1 to 1
      if (dirAlign < 0) continue; // skip bodies behind us relative to nebula

      const radius = (p.geometry && p.geometry.parameters.radius) || ud.size || 10;
      // Score = direction alignment + body mass bonus - distance penalty
      // Mass proxy: radius. Stars rated 5x for gravity strength.
      const score = dirAlign * 100 + radius * 2 - dist * 0.05;

      if (ud.type === 'star') {
        if (score > bestStarScore) { bestStar = p; bestStarScore = score; }
      } else {
        if (score > bestPlanetScore) { bestPlanet = p; bestPlanetScore = score; }
      }
    }

    // Strong preference: stars > large planets > any nearby body
    return bestStar || bestPlanet || bestAny;
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

    // While the warp cycle is locked, keep firing planet-target demos to
    // the nav system. Braking and intruder break-off remain suppressed
    // (the warp boost owns the velocity), but the ship is allowed to
    // steer so it can keep its nose on the destination — and retarget
    // if a different nebula passes closer than the original.
    if (inLockedCoast) {
      const _dstName = (ap.currentNebula && ap.currentNebula.userData && ap.currentNebula.userData.name) || 'destination';
      const _dstDist = ap.currentNebula ? (camPos().distanceTo(ap.currentNebula.position) | 0) : null;
      setStatus(_dstDist !== null
        ? 'Warp transit → ' + _dstName + ' · ' + _dstDist + ' u'
        : 'Warp transit → ' + _dstName);
      {
        // ── A LIT BURN IS COMMITTED ────────────────────────────────────────
        // Everything below steers: it re-routes the destination to any nebula
        // that turns out closer, and it holds the nose on that destination
        // every frame. Both are right for a coast and catastrophic during a
        // burn, because warp guidance (game-physics.js) rotates VELOCITY onto
        // the nose — so a re-route mid-boost does not merely change the plan,
        // it bends the burn away from the arrival it was armed for.
        //
        // MEASURED, this build, three legs in a row: burn armed 13.8 s for a
        // subject 76,741 u ahead (11.2 deg off the bow), the phase's own
        // destination re-routed to a nebula 1,759 u away, the nose swung onto
        // that, and velocity followed it — subject 11 deg -> 47 -> 91 -> 138
        // deg in 2.5 s, range never dropped below 73,600 u, and the cut ended
        // the leg on its `blown` clause after 2.7 s of a 13 s burn.
        //
        // So while a fresh arrival subject is being flown, the burn owns the
        // nose (the framing hold at the top of update() is already pointing it
        // at the subject, three times faster than this call could) and the
        // destination is frozen. The re-route resumes the moment the boost
        // ends, which is the beat it was written for.
        if (!_burnCommitted()) {
          cycleScanTarget();
          if (ap.currentNebula) {
            // Don't pass by nebulas: if another nebula is meaningfully nearer
            // mid-warp, switch target so we coast into the closer one instead.
            // (Suppressed while returning to a nebula of origin for a second
            // discovery path — that trip has a specific destination.)
            const nearer = ap._originReturnActive ? null : nearestNebula();
            if (nearer && nearer !== ap.currentNebula) {
              const dCur  = camPos().distanceTo(ap.currentNebula.position);
              const dAlt  = camPos().distanceTo(nearer.position);
              if (dAlt < dCur * 0.75) {
                ap.currentNebula = nearer;
                ap.orbitTarget = null;
                setStatus('Re-routing to closer nebula: ' + (nearer.userData.name || 'nebula'));
              }
            }
            // Don't fight the gravity whip's on-rails camera while it's
            // carrying the ship around the body.
            if (window.orientTowardsTarget && !(gameState.slingshotWhip)) {
              window.orientTowardsTarget({ position: ap.currentNebula.position });
            }
          }
        }
      }
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
      goPhase('warpToNebulaCluster');
      return;
    }

    // ── THE BURN ALREADY ARRIVED: STOP COASTING AT THE THING WE ARE AT ───────
    // This phase measures its progress against the nebula CLOUD CENTRE, and
    // the body the warp parked at sits between the ship and that centre — so
    // once the park's clock runs out, the "keep thrusters active while
    // coasting" rule below points the ship at the centre and drives it
    // straight through its own destination.
    //
    // MEASURED, this build, twice in one session: parked clean at 2,286 u off
    // Tartarus Nebula Prime (30.4 deg, dead centre, closing 0.35 u/f), park
    // ceiling expired 12 s later, this phase thrust at 3.4 u/frame and walked
    // the range 2,018 -> 1,422 -> 871 -> 646 u — "PLANETARY IMPACT — Ship
    // destroyed by collision with Tartarus Nebula Prime". Same ending 8
    // minutes later with Chronos Nebula Prime.
    //
    // The arrival IS the arrival: when the leg's staged body is a body of this
    // nebula and the ship is standing at its standoff, the coast is over. Hand
    // to orbitNebulaPlanet, which already sizes its lap from that same standoff
    // (see the ORBIT_RADIUS derivation there) and therefore laps around the
    // body instead of into it.
    const _cAs = gameState._arrivalSubject;
    if (_cAs && _cAs.obj && _cAs.obj.position && _cAs._flown &&
        _cAs.obj.position.distanceTo(ap.currentNebula.position) < 8000 &&
        camPos().distanceTo(_cAs.obj.position) < (_cAs.stand || 0) * 1.6) {
      ap.brakingAfterWarp = false;
      ap._prevNebDist = undefined;
      setStatus('Arrived — ' + ((_cAs.obj.userData && _cAs.obj.userData.name) || 'destination'));
      goPhase('orbitNebulaPlanet');
      return;
    }

    // Don't pass by nebulas: if a closer nebula appears post-warp, switch
    // to it instead of overshooting toward the original target.
    // (Suppressed while returning to a nebula of origin for a second path.)
    const _altNeb = ap._originReturnActive ? null : nearestNebula();
    if (_altNeb && _altNeb !== ap.currentNebula) {
      const dCur = camPos().distanceTo(ap.currentNebula.position);
      const dAlt = camPos().distanceTo(_altNeb.position);
      if (dAlt < dCur * 0.75) {
        ap.currentNebula = _altNeb;
        ap.orbitTarget = null;
        setStatus('Re-routing to closer nebula: ' + (_altNeb.userData.name || 'nebula'));
      }
    }

    const distToNebula = camPos().distanceTo(ap.currentNebula.position);
    setStatus('Coasting to nebula — ' + (distToNebula | 0) + ' units');

    // Long interstellar tail: once the warp coast is over, don't crawl the
    // rest of the way on thrusters (the demo was seen cruising ~4000 km/s for
    // many ly). If we're still far out and no warp is active, re-warp — reset
    // the slingshot/whip trial so warpToNebulaCluster picks a fresh body or
    // falls back to an O-key emergency warp.
    const REWARP_RANGE = 10000;
    const _warpActiveNow =
      (gameState.emergencyWarp && (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning)) ||
      (gameState.slingshot && gameState.slingshot.active);
    if (!_warpActiveNow && distToNebula > REWARP_RANGE) {
      ap._slingshotTried = false;
      ap.slingshotPlanet = null;
      ap._prevNebDist = undefined;
      ap.brakingAfterWarp = false;
      setStatus('Still ' + (distToNebula | 0) + ' u out — re-warping');
      goPhase('warpToNebulaCluster');
      return;
    }

    // If distance to the destination is growing (moving away), brake and
    // reorient toward it instead of continuing on the bad heading.
    const _prevDist = ap._prevNebDist;
    ap._prevNebDist = distToNebula;
    const _drifting = (typeof _prevDist === 'number') && (distToNebula > _prevDist + 0.5);
    if (_drifting) {
      if (window.orientTowardsTarget) {
        window.orientTowardsTarget({ position: ap.currentNebula.position });
      }
      // OVERSHOOT → O-KEY EMERGENCY WARP: if we sailed past the destination,
      // warp to change trajectory back toward it (once the bow is on it)
      // instead of braking and crawling back. Brake is the fallback when no
      // warp charge is available or we're not yet aligned.
      let _ovFacing = 1;
      if (_coneVec && camera) {
        _coneVec.subVectors(ap.currentNebula.position, camera.position).normalize();
        camera.getWorldDirection(_coneFwd);
        _ovFacing = _coneFwd.dot(_coneVec);
      }
      const _ovWarpBusy = gameState.emergencyWarp &&
        (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning);
      if (distToNebula > 2500 && !_ovWarpBusy && _ovFacing > 0.9 &&
          canEmergencyWarp() && Date.now() - (ap._lastBHWarp || 0) > 8000) {
        if (triggerOKeyWarp(ap.currentNebula)) {
          ap._lastBHWarp = Date.now();
          setStatus('Overshot — emergency warp to re-aim (' + (distToNebula | 0) + ' u)');
          return;
        }
      }
      keys().x = true;
      setStatus('Drifting away — braking and reorienting (' + (distToNebula | 0) + ' u)');
    }

    // NEBULA APPROACH GOVERNOR: never enter the cloud hot. Within 4,500u
    // of the center, brake until under ~9,500 km/s (same cap as the
    // discovery-path approach) — a post-warp coast arrives at ~15u/frame
    // and the old 2,000u brake band alone couldn't shed that before the
    // ship plowed through the cluster (and its planets).
    const NEBULA_APPROACH_RANGE = 4500;
    const NEBULA_APPROACH_SPEED = 9.5;
    if (distToNebula < NEBULA_APPROACH_RANGE && speed > NEBULA_APPROACH_SPEED) {
      keys().b = false;
      keys().x = true;
      setStatus('Nebula approach — slowing (' + (distToNebula | 0) + ' u)');
    }

    // Brake within 2000 u of the nebula center, orient toward it
    const NEBULA_BRAKE_RANGE = 2000;
    if (distToNebula < NEBULA_BRAKE_RANGE) {
      setStatus('Nebula cluster — braking (' + (distToNebula | 0) + ' u)');
      if (window.orientTowardsTarget) {
        window.orientTowardsTarget({ position: ap.currentNebula.position });
      }
      if (!ap.brakingAfterWarp) {
        ap.brakingAfterWarp = true;
        ensureThirdPerson();
      }
      keys().x = true;
    }

    // Close to nebula — move to explore center phase
    if (distToNebula < 800 && speed < 1.5) {
      ap.brakingAfterWarp = false;
      ap._prevNebDist = undefined;
      goPhase('orbitNebulaPlanet');
      return;
    }

    // Keep thrusters active while coasting toward the nebula — the ship
    // should look purposeful, not drifting.  Only thrust when NOT braking
    // and not already drifting away (drift case brakes above).
    if (!_drifting && distToNebula >= NEBULA_BRAKE_RANGE && speed < 3) {
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

  // ─── 3) Fly to the nebula center, wait for dotted-line discovery path ────
  function phaseOrbitNebulaPlanet() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();

    // Break off to pursue any detected hostile
    const intruder = navDetectedEnemy();
    if (intruder) {
      ap.combatTarget = intruder;
      ap.combatMissileFired = false;
      ap.returnPhase = 'orbitNebulaPlanet';
      goPhase('combat');
      return;
    }

    // Movement target = nebula center; nav-lock = a planet inside the
    // nebula (HUD reads as "tracking <planet>") so the viewer sees a
    // proper navigation cue while the ship laps the cloud.
    if (!ap.orbitTarget && ap.currentNebula) {
      ap.orbitTarget = {
        position: ap.currentNebula.position.clone(),
        userData: { name: ap.currentNebula.userData.name || 'Nebula Core', radius: 120 }
      };
      const nm = ap.orbitTarget.userData.name;
      setStatus('Navigating to ' + nm + ' center');
      transmit('NAVIGATION SYSTEM', 'Target locked: ' + nm + '\nProceeding to nebula center.\nAwaiting intel transmission.');
      // Find a planet inside the nebula to nav-lock for the HUD
      ap._orbitNavPlanet = _findPlanetNearNebula(ap.currentNebula) || null;
    }
    // Refresh planet nav-lock periodically (planets orbit; the chosen one
    // may have rotated to the far side of the nebula). Cheap scan.
    if (!ap._orbitNavPlanet ||
        (ap._orbitNavPlanet.userData && ap._orbitNavPlanet.userData.health !== undefined && ap._orbitNavPlanet.userData.health <= 0)) {
      ap._orbitNavPlanet = _findPlanetNearNebula(ap.currentNebula);
    }
    if (ap._orbitNavPlanet) {
      gameState.currentTarget = ap._orbitNavPlanet;
      if (gameState.targetLock) {
        gameState.targetLock.active = true;
        gameState.targetLock.target = ap._orbitNavPlanet;
      }
    } else {
      gameState.currentTarget = ap.orbitTarget;
    }

    const nebCenter = ap.orbitTarget ? ap.orbitTarget.position : (ap.currentNebula ? ap.currentNebula.position : null);
    if (!nebCenter) { goPhase('warpToNebulaCluster'); return; }

    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;

    // Approach the nebula, then orbit at a radius that CLEARS WHAT IS AT THE
    // CENTRE. A flat 500 u lap is a hull-scraping radius at a nebula whose
    // prime body is 550 u across — and that is the same body the warp just
    // arrived at, so the demo flies its lap straight through its own
    // destination. Measured twice, once per instrumented run: the arrival
    // parked cleanly at 2,400-2,600 u, the park's clock ran out, this phase
    // took the stick and flew the ship 1,987 -> 650 u at a commanded 1.6 u/f
    // until "PLANETARY IMPACT — Ship destroyed by collision with Atlantis
    // Nebula Prime" (and, in the other run, with Olympus Nebula Prime). The
    // arrival already knows the right number: the standoff it was framed at.
    // Cached per nebula — the candidate search walks the body list, which is
    // not a per-frame cost.
    // Recomputed when the nebula changes OR when a new arrival subject lands —
    // the phase can be entered before the leg has staged one, and the first
    // answer would otherwise stick at the unsafe default. Both keys change at
    // most once per leg, so the body search below is never a per-frame cost.
    const _oAsObj = (gameState._arrivalSubject && gameState._arrivalSubject.obj) || null;
    if (ap._orbitRadiusFor !== ap.currentNebula || ap._orbitRadiusAs !== _oAsObj) {
      ap._orbitRadiusFor = ap.currentNebula;
      ap._orbitRadiusAs = _oAsObj;
      ap._orbitRadius = 500;
      // The body the warp just arrived at IS the body at this centre — it is
      // the one the staging rules picked for exactly that reason — so ask it
      // first and only fall back to a search. (Searching alone missed Olympus
      // Nebula Prime, whose centre offset is wider than the search window, and
      // the demo flew the 500 u lap straight into it: measured 2,855 -> 851 u
      // at a flat 4 u/frame, "PLANETARY IMPACT".)
      let _oObj = null, _oRad = 0;
      const _oAs = gameState._arrivalSubject;
      if (_oAs && _oAs.obj && _oAs.obj.position &&
          _oAs.obj.position.distanceTo(nebCenter) < 6000) {
        _oObj = _oAs.obj; _oRad = _oAs.radius;
      } else {
        const _oCand = _findArrivalSubject(nebCenter, 3000);
        if (_oCand && _oCand.obj) { _oObj = _oCand.obj; _oRad = _oCand.radius; }
      }
      ap._orbitBody = _oObj || null;
      if (_oObj) {
        const _oSo = _arrivalStandoff(_oRad, _arrivalDangerR(_oObj));
        // ── LAP THE BODY, NOT THE CLOUD ────────────────────────────────────
        // Sizing the radius from the centre and then adding the body's offset
        // only clears the body on the one bearing where the offset points AT
        // the ship. The lap sweeps a circle about the CENTRE while the hazard
        // sits somewhere off it (and off the lap's plane — the dummy holds
        // nebCenter.y), so on the far side of the sweep that same radius walks
        // the ship straight in. Measured, this build, with the previous
        // radius rule live: parked clean at 2,408 u off Void Nebula Prime,
        // then lapped 1,765 -> 1,362 -> 995 -> 660 u at a steady 1.16 u/frame,
        // the body swelling 38.7 deg -> 86.4 deg in frame, until "PLANETARY
        // IMPACT — Ship destroyed by collision with Void Nebula Prime".
        //
        // The circle has to be centred on the thing it is meant to clear. Lap
        // the ARRIVAL BODY at its own standoff (+15 % of margin) — which is
        // also the better shot: the demo circles the world it just arrived at,
        // held at the distance the burn framed it from, instead of circling an
        // empty point in the gas with the world drifting through the lap.
        ap._orbitRadius = Math.max(500, Math.round(_oSo.stand * 1.15));
      }
    }
    const ORBIT_RADIUS = ap._orbitRadius || 500;
    // The lap is about the arrival body when there is one, and about the cloud
    // centre only when there is nothing at it to clear.
    const lapCenter = (ap._orbitBody && ap._orbitBody.position) ? ap._orbitBody.position : nebCenter;
    const lapDist = camPos().distanceTo(lapCenter);
    if (lapDist > ORBIT_RADIUS + 200) {
      setStatus('Approaching nebula center — ' + (lapDist | 0) + ' u');
      flyToward(ap.orbitTarget, 1.6);
    } else {
      // Orbit: aim at a slowly-rotating offset point ORBIT_RADIUS from the
      // center. Thrusting toward a moving point produces a stable lap.
      if (!ap._orbitAngle) ap._orbitAngle = Math.random() * Math.PI * 2;
      ap._orbitAngle += 0.012; // ~0.7 rad/s at 60fps — slow, photogenic
      if (!ap._lapDummy) ap._lapDummy = { position: new THREE.Vector3(), userData: { name: 'Nebula Orbit' } };
      ap._lapDummy.position.set(
        lapCenter.x + Math.cos(ap._orbitAngle) * ORBIT_RADIUS,
        lapCenter.y,
        lapCenter.z + Math.sin(ap._orbitAngle) * ORBIT_RADIUS
      );
      setStatus(ap._orbitBody
        ? ('Holding station — ' + ((ap._orbitBody.userData && ap._orbitBody.userData.name) || 'arrival') +
           ' (' + (lapDist | 0) + ' u)')
        : 'Orbiting nebula center — scanning for discovery path');
      if (window.orientTowardsTarget) window.orientTowardsTarget(ap._lapDummy);
      // Gentle thrust to maintain lap speed; brake if we're sprinting...
      // ...and NEVER thrust while the lap is already inside its own radius:
      // the lap point is a moving target, so W aimed at it while the ship sits
      // inside the circle still has an inward component, which is the slow
      // 1.16 u/frame walk that killed two runs. Brake instead and let the
      // engine's floor carry the ship back out across the circle.
      if (speed > 1.6 || lapDist < ORBIT_RADIUS * 0.92) keys().x = true;
      else keys().w = true;
    }

    // The game's physics calls checkForNebulaDeepDiscovery() every 15
    // frames, but nudge it if we've been at the center for a while
    if (t > 6000 && typeof checkForNebulaDeepDiscovery === 'function') {
      checkForNebulaDeepDiscovery();
    }

    // Follow any open path that ORIGINATES at this nebula cluster and
    // hasn't been followed yet. The old count-snapshot ("did a path
    // appear since phase entry?") missed paths created during the
    // approach/coast — discovery often fires BEFORE this phase starts,
    // so the demo lapped next to a freshly-drawn line for 25 s and then
    // warped away without ever following it. A twin pair can open two
    // paths at once: take the one with the closer endpoint first; the
    // other is picked up when the demo returns to this nebula after
    // clearing the first (see phaseFollowDiscoveryPath).
    const candidates = eligibleDiscoveryPathsFrom(nebCenter, 8000);
    if (candidates.length) {
      ap._followingPath = candidates[0];
      transmit('NAVIGATION', 'Dotted-line path detected!\nFollowing discovery route.');
      goPhase('followDiscoveryPath');
      return;
    }

    // Safety timeout — no discovery path materialised. Don't fall through
    // to followDiscoveryPath (it would pick a stale path); warp to a new
    // nebula and try discovery again there.
    if (t > 25000) {
      goPhase('warpToNebulaCluster');
    }
  }

  // ─── 4) Follow dotted line → fight revealed enemies ─────────────────────
  function phaseFollowDiscoveryPath() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();
    // Only ever follow the snapshot taken when this transition was
    // triggered. The old code fell back to discoveryPaths[length-1] — and
    // since that list is never pruned, the fallback could hand us a path
    // from a different galaxy created mid-flight. It then leaned on a flat
    // 50,000 u endpoint cap to catch that, but EVERY real path in the game
    // is longer than 50,000 u (measured: 62k-142k), so the cap fired on the
    // vetted paths too and bounced this phase back to warpToNebulaCluster
    // on its very first frame, every time — which is why the demo never
    // once followed a dotted line, and never reached the black hole, the
    // Borg, or the outer systems beyond them.
    //
    // The snapshot from eligibleDiscoveryPathsFrom is ours by construction
    // (it starts at the nebula we just orbited), so drop the fallback and
    // keep distance only as an absurd-value backstop.
    const path = ap._followingPath;
    const ud = path && path.line && path.line.userData;
    const endPos = ud && ud.endPosition;
    if (!endPos || camPos().distanceTo(endPos) > MAX_PATH_ENDPOINT) {
      ap._followingPath = null;
      goPhase('warpToNebulaCluster');
      return;
    }

    // Remember how long the trip is so the safety timeout below can scale
    // to it: a 78,000 u transit cannot possibly finish inside a flat 60 s.
    if (endPos && !ap._followPathBudgetMs) {
      const _d0 = camPos().distanceTo(endPos);
      ap._followPathBudgetMs = Math.min(240000, Math.max(60000, _d0 * 1.2));
    }

    // From the moment a path is acquired, the nav target is the path's
    // DESTINATION end (where the revealed hostiles are hiding), not the
    // nebula end we just came from. Steering toward it is owned by
    // navigateTo() below — orienting here too would double the turn rate.
    if (endPos) {
      if (!ap._followPathAimDummy) ap._followPathAimDummy = { position: new THREE.Vector3(), userData: { name: 'Discovery endpoint' } };
      ap._followPathAimDummy.position.copy(endPos);
      gameState.currentTarget = ap._followPathAimDummy;
    }

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

      // CLOSED-LOOP TRANSIT: navigateTo owns orient/warp/jump/brake for the
      // whole approach (this block used to be four hand-tuned key-poking
      // branches — the recurring overshoot/returnPhase bug source). The
      // one-shot emergency warp is preserved by only granting allowWarp
      // until the first warp fires.
      if (dist > 300) {
        // approachRange 3500: the mission system anchors 7+ hostiles within
        // ~3000u of the endpoint — enter that zone below 9,500 km/s so the
        // demo arrives fighting instead of overshooting the stronghold.
        const st = navigateTo(endPos, {
          arriveRadius: 300,
          arriveSpeed: 1.0,
          boost: true,
          allowJump: true,
          allowWarp: !ap._followPathWarpFired,
          approachRange: 3500,
          approachSpeed: 9.5,
        });
        if (st === 'warping') {
          ap._followPathWarpFired = true;
          setStatus('Emergency warp → revealed hostile sector');
        } else if (st === 'jumping') {
          setStatus('Tactical jump → discovery endpoint (' + (dist | 0) + ' u)');
        } else if (st === 'braking') {
          setStatus('Approaching revealed hostiles — braking (' + (dist | 0) + ' u)');
        } else {
          setStatus('Following discovery path → ' + (dist | 0) + ' units');
        }
      } else {
        // At end of path — look for enemies
        const near = nearestAliveEnemy(5000);
        if (near) {
          ap.combatTarget = near;
          ap.returnPhase = 'followDiscoveryPath';
          goPhase('combat');
        } else {
          // Cleared — never re-follow this path.
          if (!ap._followedPathLines) ap._followedPathLines = [];
          if (path && path.line && ap._followedPathLines.indexOf(path.line) < 0) {
            ap._followedPathLines.push(path.line);
          }
          // A twin pair opens TWO paths (core + patrol). If the other
          // one is still waiting back at the nebula cluster we came
          // from, return to the nebula of origin — the orbit phase's
          // path scan will pick it up and follow it. Otherwise head
          // for the nearest black hole and warp to the next galaxy.
          const sp = path && path.line && path.line.userData && path.line.userData.startPosition;
          const remaining = sp ? eligibleDiscoveryPathsFrom(sp, 8000) : [];
          if (remaining.length) {
            ap.currentNebula = _nebulaNearPosition(sp, 6000) ||
              { position: sp.clone(), userData: { name: 'Nebula of Origin' } };
            ap.orbitTarget = null;
            ap._originReturnActive = true; // suppress mid-flight nebula re-routing
            transmit('NAVIGATION', 'Second discovery route waiting!\nReturning to nebula of origin.');
            setStatus('Returning to nebula of origin — second path waiting');
            goPhase('coastToNebulaCluster');
          } else {
            ap.segmentKills = 0;
            ap.currentBH = null;
            goPhase('gotoBlackHoleGalaxy');
          }
        }
        return;
      }
    } else {
      // No active path — drift back to nebula warp behavior
      if (t > 3000) goPhase('warpToNebulaCluster');
    }

    // Safety timeout — scaled to the length of the trip we committed to
    // (set on entry above), so a legitimate long-haul discovery transit
    // isn't guillotined mid-flight and bounced back to a nebula warp.
    if (t > (ap._followPathBudgetMs || 60000)) goPhase('warpToNebulaCluster');
  }

  // ─── 5) Fly directly to the nearest black hole and warp through it ───────
  function phaseGotoBlackHoleGalaxy() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();

    if (!ap.currentBH) {
      ap.currentBH = nearestBlackHole();
      if (!ap.currentBH) { goPhase('approachBorg'); return; }
    }

    const distToBH = camPos().distanceTo(ap.currentBH.position);
    setStatus('Course to ' + (ap.currentBH.userData.name || 'black hole') + ' — ' + (distToBH | 0) + ' u');

    // Close enough — let the physics auto-warp handle it
    if (distToBH <= 500) {
      setStatus('Event horizon — initiating warp');
      goPhase('blackHoleWarp');
      return;
    }

    // Closed-loop approach. arriveRadius 0: we WANT to cross the event
    // horizon — the 500u check above hands off to blackHoleWarp first.
    // jumpMaxDist 2500 keeps jumps to the final gap-closing (the old
    // 800-2000u window); long approaches boost-cruise as before.
    navigateTo(ap.currentBH, {
      arriveRadius: 0,
      boost: true,
      allowJump: true,
      jumpMaxDist: 2500,
    });
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
      if (dist > 500) {
        setStatus('Diving toward event horizon — ' + (dist | 0) + ' u');
        flyToward(ap.currentBH, 2.0);
      } else {
        releaseMovementKeys();
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
    // Black-hole warp coast is no longer a thing: don't hold the ship in
    // an idle timed coast after a BH warp. We still avoid braking while
    // the warp's own slingshot/emergency-warp cycle is physically running
    // (so we don't fight the teleport animation), but the instant that
    // cycle ends the demo drops straight into evasion + engagement.
    const inLockedCoast = warpCycleActive;

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
      setStatus('Warp transit…');
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

    // After warp coast is over, engage any hostile the nav system sees.
    // Use findLocalEnemies as the return phase so the 3-kill post-warp
    // rule in phaseCombat routes us to the nearest nebula via slingshot.
    if (speedNow < 3) {
      const intruder = navDetectedEnemy();
      if (intruder) {
        ap.combatTarget = intruder;
        ap.combatMissileFired = false;
        ap.returnPhase = 'findLocalEnemies';
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
          // around looking for a target.  returnPhase=findLocalEnemies so
          // phaseCombat's 3-kill post-warp rule pushes us to the nearest
          // nebula via interstellar slingshot when the leg finishes.
          const nearest = nearestAliveEnemy(15000);
          if (nearest) {
            // Nav panel only — phaseCombat handles the targetLock once close
            gameState.currentTarget = nearest;
            const distToNearest = camPos().distanceTo(nearest.position);
            if (distToNearest < 2500) {
              ap.combatTarget = nearest;
              ap.combatMissileFired = false;
              ap.returnPhase = 'findLocalEnemies';
              goPhase('combat');
              return;
            }
          }

          // After a couple of post-warp combat loops, go face the Borg
          if (ap.loopCount >= 2) {
            goPhase('approachBorg');
          } else {
            ap.returnPhase = 'findLocalEnemies';
            goPhase('findLocalEnemies');
          }
        }
        return;
      }
    }

    // Keep thrusters active while coasting — the ship should look
    // purposeful, not drifting passively.
    if (speedNow < 3 && t > 5000) keys().w = true;

    if (t > 30000) {
      ap.brakingAfterWarp = false;
      ap.returnPhase = 'warpToNebulaCluster';
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

    // FLOATING ORIGIN: origin-relative math in TRUE coordinates
    const _wooB = window.worldOriginOffset;
    const _trueCp = camPos().clone();
    if (_wooB) _trueCp.add(_wooB);
    const distFromOrigin = _trueCp.length();

    if (distFromOrigin < 70000) {
      if (canEmergencyWarp() && t > 3000) {
        // Face away from origin and punch it (outward in TRUE coords,
        // expressed back in the current frame)
        const outward = _trueCp.clone().multiplyScalar(2);
        if (_wooB) outward.sub(_wooB);
        const dummy = { position: outward };
        if (window.orientTowardsTarget) window.orientTowardsTarget(dummy);
        if (triggerEmergencyWarp()) {
          ap.warpStartedAt = Date.now();
        }
      } else {
        // Closed-loop cruise outward (the old flyToward never set thrust,
        // so with no warp charges this phase crawled at min velocity).
        navigateTo({
          x: 80000 - (_wooB ? _wooB.x : 0),
          y: 0 - (_wooB ? _wooB.y : 0),
          z: 0 - (_wooB ? _wooB.z : 0),
        }, { arriveRadius: 0, boost: true, allowJump: false });
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
      if (dist > 800) {
        flyToward(target, 2.0);
        pursuitFlightStyle('pursuit');
      } else {
        flyToward(target, 0.8);
        pursuitFlightStyle('engage');
      }

      const engageRange = (target.userData && target.userData.firingRange) || 500;
      const aimDummy = { position: target.position };
      if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);
      gameState.targetLock.active = true;
      gameState.targetLock.target = target;
      gameState.currentTarget = target;

      // Occasional missile — one per Borg target, only when shields are
      // down and the target is within (auto-aim + 100u) range.
      if (shouldFireMissileAt(target, dist)) {
        ap._lastMissileTime = Date.now();
        markMissileFiredAt(target);
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

    gameState.currentTarget = targetObj;
    // Do NOT set autoNavigating — the autopilot steers via orientTowardsTarget
    // and key inputs. The physics auto-nav orbital approach would fight our
    // direct steering and send the ship toward distant targets.

    // Distance-aware speed control: brake when approaching target
    const dist = camPos().distanceTo(targetObj.position);
    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
    const brakingDist = speed * 35;

    const k = keys();
    if (dist < brakingDist && speed > 0.3) {
      k.b = false;
      k.x = true;
    } else if (speedMult > 1.5) {
      k.b = true;
    }
  }

  // ─── ARRIVAL SUBJECT — "warp must arrive somewhere" ────────────────────────
  // A warp/jump used to aim at a bare coordinate (a nebula's center point, a
  // discovery path's endPosition) — a place, not a THING. The lens contraction
  // on exit was mechanically clean but resolved onto whatever happened to be
  // floating there, which was often nothing: a lens move in a vacuum. This
  // resolves the actual navigation target to a concrete nearby BODY (planet/
  // star, never an asteroid) worth revealing, and computes how far from it
  // the ship should be standing when the tunnel finishes collapsing so the
  // body reads as an arrival, not a speck: angular size >= 40 degrees full,
  // and outside the body's own collision/gravity danger radius.
  // (Was 15deg — the paused-world GPU readback at exactly that standoff
  // measured only 15.9% of the central-third frame filled vs a live
  // reference's 95.3%; 15deg technically clears "on screen" but reads as a
  // speck, not an arrival.)
  // gameState._arrivalSubject is the single shared handle: set here (only
  // when a real body is found — no candidate means no reveal is claimed),
  // read by camera-system.js's exit-framing assist and by the phase-agnostic
  // orientation hold below. It stores a LIVE object reference (never a
  // cloned position) so it stays correct through a worldOriginOffset rebase
  // for free — the same reason planets/enemies do.
  const _DEG2RAD = Math.PI / 180;

  function _arrivalDangerR(p) {
    const ud = (p && p.userData) || {};
    const sz = ud.size || 20;
    if (ud.type === 'blackhole') return (ud.warpThreshold || 600) + 1200;
    if (ud.type === 'star') return Math.max(sz * 4, 200);
    return Math.max(sz * 2, 80);
  }

  // Distance at which a body of this radius subtends exactly a 40-degree
  // full angle, floored just outside its own danger radius (never ask the
  // ship to stand somewhere that reads as "arrived" but is also "in the
  // grave").
  function _idealArriveDist(radius, dangerR) {
    const thresh = radius / Math.tan(20 * _DEG2RAD);
    return Math.max(thresh, dangerR * 1.15);
  }

  // Best real body within maxDist of pos — biggest AND closest wins (a tiny
  // distant rock at the edge of range technically qualifies but is an
  // unsatisfying "arrival", so size is weighted heavily).
  function _findArrivalSubject(pos, maxDist) {
    if (typeof planets === 'undefined' || !pos) return null;
    let best = null, bestRadius = 0, bestScore = -Infinity;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      const ud = p && p.userData;
      if (!p || !p.position || !ud) continue;
      if (ud.type === 'asteroid' || ud.type === 'asteroidBelt') continue;
      const d = pos.distanceTo(p.position);
      if (d > maxDist) continue;
      const radius = (p.geometry && p.geometry.parameters && p.geometry.parameters.radius) || ud.size || 20;
      const score = radius * 3 - d * 0.02;
      if (score > bestScore) { bestScore = score; best = p; bestRadius = radius; }
    }
    return best ? { obj: best, radius: bestRadius } : null;
  }

  // THE DISTANCE THE BURN ACTUALLY AIMS TO STOP AT, and whether this body can
  // be framed as an arrival at all.
  //
  // arriveDist is the beautiful number (40 deg full angle) but it is only two
  // to three radii of clearance, and the ship is still coasting at ~cruise
  // when the ramp finishes — so stopping exactly there leaves the demo about
  // a second from the body's own danger radius. `stand` backs off to 1.8x,
  // which still reads as a real arrival (~22 deg) and leaves room to brake.
  //
  // `maxForAngle` is the far limit that still clears a 19 deg full angle. The
  // margin over the 15 deg bar is deliberate: the cut also tolerates a lateral
  // miss up to 0.45x the standoff, which stretches the final range by up to
  // ~10%, so the worst framed arrival still lands around 17 deg.
  // Small bodies whose danger radius floor pushes arriveDist past that
  // limit CANNOT be revealed as an arrival (they would read as a speck no
  // matter where the burn stops), so they are rejected as subjects outright
  // rather than being claimed and then under-delivered.
  function _arrivalStandoff(radius, dangerR) {
    const arriveDist = _idealArriveDist(radius, dangerR);
    // Furthest the ship may end up and still show this body at >= 17 deg full
    // angle (the 15 deg bar plus margin).
    const maxRange = radius / Math.tan(8.5 * _DEG2RAD);
    // 1.25x, not 1.8x. The standoff and the lateral budget trade against each
    // other on the same hypotenuse: every unit of extra standoff is a unit
    // taken out of maxOff. Measured in the demo's actual operating region, the
    // bodies within a 7,200 u burn are mostly moons of 30-40 u radius, and at
    // 1.8x their whole lateral budget was ~150 u — under what a turn-rate
    // limited burn can hit, so they were all rejected and four consecutive
    // legs staged nothing. 1.25x still lands a ~32 degree head-on reveal (the
    // 40 degree arriveDist backed off just enough to clear the danger radius
    // and leave braking room) while nearly doubling the corridor the burn is
    // allowed to arrive through.
    const stand = Math.max(dangerR * 1.25, Math.min(arriveDist * 1.25, maxRange * 0.75));
    // THE LATERAL BUDGET, DERIVED RATHER THAN GUESSED. A straight burn's
    // closest approach is `stand` along-track and `off` across it, so the
    // final range is the hypotenuse. Round 2 capped `off` at a flat fraction
    // of the standoff, which is either far too strict (it was arriveDist*0.35
    // — a 1.2 deg corridor at cut range, hence zero executions) or arbitrary.
    // Solve the hypotenuse instead: this is exactly how far off-axis the burn
    // may pass and still deliver the >= 17 deg reveal. Measured on a live
    // arrival: stand 3,066 u with a 2,430 u miss reads at 18.0 deg — inside
    // this budget, and a flat 0.45x rule would have rejected it.
    const maxOff = Math.sqrt(Math.max(0, maxRange * maxRange - stand * stand));
    // DELIVERABILITY FLOOR. maxOff is what the geometry ALLOWS; this is what
    // the ship can actually HIT. Warp guidance is turn-rate limited, so its
    // achievable miss distance bottoms out near 0.7x the implied turn radius —
    // ~230 u at boost speed with the proportional rate in game-physics.js.
    // Claiming a subject whose whole lateral budget is under that is claiming
    // an arrival the burn cannot deliver: measured, a 33 u moon (budget 150 u)
    // was staged, the burn passed 951 u wide, and the "arrival" resolved at
    // 4.0 degrees. The threshold is not guessed — it is where the measured
    // arrivals separate cleanly:
    //     budget 1,106 / 2,883 / 3,560 u  ->  19.6 / 20.7 / 28.3 deg, centred
    //     budget   150 /   189 /   452 u  ->   4.0 /  6.9 /  3.7 deg, missed
    // Every body above ~1,000 u of budget was delivered; every body below it
    // was flown past.
    //
    // ROUND-4 CORRECTION, MEASURED: that read of the data blamed the wrong
    // variable. A 1,000 u budget solves to a MINIMUM BODY RADIUS of 175 u
    // (maxOff works out to 5.74 x radius), and a census of the live world at
    // the demo's own position says that class does not exist inside a burn:
    // of the 42 non-asteroid bodies within one 7,200 u boost, ZERO were
    // framable at 1,000 — largest radius 120 u, median 7 u. So the floor was
    // not selecting good arrivals over bad ones, it was rejecting ALL of
    // them, which is precisely why `_setArrivalSubject` never ran and the
    // cut-off logged zero executions across 24 exits.
    //
    // What actually separated those measured hits from those misses was the
    // BURN LENGTH, not the budget: the missed cases were fixed 7,200 u
    // stopwatch burns that ended wherever they ended, while the delivered
    // cases happened to end near their subject. With the burn now sized to
    // the subject (see _armWarpBurn) and the nose held on it through
    // ignition, the achievable miss was measured directly on a live burn:
    // lateral offset 4,816 u at ignition -> 732 u (+250 ms) -> 77 u (+540 ms)
    // -> 8 u at cut range. The turn-rate limit is ~150 u of terminal miss,
    // not the ~1,000 u this constant assumed. 250 u is that measured floor
    // with margin, and it admits the 44 u-and-up class the world actually
    // contains: 5 framable bodies inside one burn, 25 inside the derivable
    // maximum, instead of none.
    const ARRIVAL_MIN_LATERAL_BUDGET = 250;
    return {
      arriveDist: arriveDist, stand: stand, maxOff: maxOff,
      framable: stand < maxRange && maxOff > dangerR &&
        maxOff >= ARRIVAL_MIN_LATERAL_BUDGET
    };
  }

  // ─── THE PARK INTERLOCK ────────────────────────────────────────────────────
  // IS AN ARRIVAL STILL BEING LOOKED AT RIGHT NOW? Every piece of park state
  // (`_parkT0`, `_parkedAt`, the closing-rate filter) lives as a property of
  // `gameState._arrivalSubject`, so replacing or nulling that object does not
  // stop the park — it DELETES it, mid-beat, with the ship still travelling
  // and no record that an arrival was ever in progress. Measured, this build:
  // leg 1 (Atlantis Nebula Prime) cut clean, decelerated 12.09 -> 1.14 u/frame
  // and was 2.4 s into its 12 s park when the next leg fired and overwrote the
  // subject — the arrival was abandoned at 3,409 u against a 2,129 u standoff
  // (+60 %), still closing at 63 u/s, framed in the top-right corner at NDC
  // (0.795, 0.823). The replacement leg then flew 2,655 -> 1,423 -> 690 ->
  // 149 u, inside its own 436 u standoff, and killed the ship. Across a
  // 12m25s instrumented session `demoPilot.arrivalParks` was 0: not a tuning
  // miss, a structurally unreachable success state — the park's own latch sits
  // downstream of an object anybody could swap out from under it.
  //
  // So the park owns the beat while its clocks say it does: from `_parkT0`
  // until PARK_MAX_MS, and (once it has latched "stopped") until its
  // PARK_SETTLE_MS hold expires. Inside that window every staging path — a new
  // O-warp, a slingshot, a tactical jump's subject swap, even a plain clear —
  // is refused and reports false, which is what the phases at :2318, :2328 and
  // :2534 already read as "not this frame, try the next one". The leg is not
  // cancelled, only deferred by at most PARK_MAX_MS, and the ship spends that
  // deferral parked at a destination instead of stutter-hopping through it.
  // ─── THE BURN INTERLOCK ────────────────────────────────────────────────────
  // IS A WARP BURN CURRENTLY FLYING TO A STAGED ARRIVAL? The park interlock
  // below protects the beat AFTER a leg; this protects the leg itself.
  //
  // It matters because of one property of this game's warp: guidance rotates
  // VELOCITY onto the NOSE (game-physics.js), so during a burn the nose is not
  // a camera decision, it is the trajectory. Anything that swings the ship —
  // a combat break-off, a phase re-routing to a closer nebula — therefore
  // steers the burn, and every measured instance of it ended the leg on the
  // cut's `blown` clause tens of thousands of units short. While this returns
  // true, the arrival framing hold in update() is the only authority on the
  // nose, and the destination the burn was armed for is frozen.
  function _burnCommitted() {
    if (typeof gameState === 'undefined') return false;
    const as = gameState._arrivalSubject, ew = gameState.emergencyWarp;
    if (!as || !as.obj || !ew || ew.isJump) return false;
    if (!(ew.active || ew.transitioning)) return false;
    return _arrivalSubjectFresh(as);
  }

  function _parkOwnsBeat() {
    const _prev = (typeof gameState !== 'undefined' && gameState._arrivalSubject) || null;
    if (!_prev || !_prev._parkT0) return false;
    // A KEEP-OUT IS NOT A BEAT. Once the arrival's own beat has been served,
    // the park can re-arm purely to stop the ship drifting into the body it
    // parked at (see "THE STANDOFF IS A FLOOR" above). That hold must not also
    // hold the DEMO: measured, it deferred 16 consecutive legs and pinned the
    // ship at one nebula for four minutes. Staging a new leg is exactly the
    // right way to leave a body you are too close to, and `_departureBlocked`
    // already refuses a heading that goes through it.
    if (_prev._keepOut) return false;
    const _now = Date.now();
    // Hard ceiling first: a pathological park always hands the leg back.
    if (_now - _prev._parkT0 >= PARK_MAX_MS) return false;
    // Latched parks additionally release once the settle hold is served.
    if (_prev._parkedAt && _now - _prev._parkedAt >= PARK_SETTLE_MS) return false;
    return true;
  }

  // Record a deferral so the interlock is provable from telemetry rather than
  // inferred from the absence of a crash. One console line per park (latched
  // on the subject) plus a counter; always returns false so refusal sites can
  // `return _parkDefer(...)`.
  function _parkDefer(what) {
    ap._parkDefers = (ap._parkDefers || 0) + 1;
    const _pk = gameState._arrivalSubject;
    if (_pk && !_pk._deferLogged) {
      _pk._deferLogged = true;
      console.log('⏸ PARK HOLDS THE BEAT → deferred ' + what + ' → ' +
        ((_pk.obj && _pk.obj.userData && (_pk.obj.userData.name || _pk.obj.userData.type)) || 'body') +
        ' park age=' + (Date.now() - _pk._parkT0) + 'ms' +
        (_pk._parkedAt ? ' (latched, settling)' : ' (still braking)'));
    }
    return false;
  }

  function _setArrivalSubject(obj, radius) {
    if (typeof gameState === 'undefined') return false;
    // A park in progress outranks any new claim (see _parkOwnsBeat).
    if (_parkOwnsBeat()) return false;
    const dangerR = _arrivalDangerR(obj);
    const _so = _arrivalStandoff(radius, dangerR);
    gameState._arrivalSubject = {
      obj: obj,
      radius: radius,
      dangerR: dangerR,
      // Where the arrival cut-off aims to leave the ship, and how far off-axis
      // the burn may pass and still deliver the reveal (see _arrivalStandoff).
      stand: _so.stand,
      maxOff: _so.maxOff,
      framable: _so.framable,
      arriveDist: _so.arriveDist,
      // Bounds how long a staged subject stays "live" for the framing hold
      // / camera nudge (see the two consumers below and in camera-system.js)
      // — this jump/warp's own boost+drain is always well under this, so it
      // never expires mid-beat. Without a bound, a stale subject from a
      // nebula leg could otherwise keep gently biasing aim on a LATER,
      // unrelated combat jump (those fire wDoubleTap directly and never
      // stage or clear a subject of their own).
      stagedAt: Date.now(),
      // Captured, not read live, so this subject keeps the window that its
      // OWN burn was armed for (see _arrivalSubjectLiveMs). Callers arm the
      // burn before staging, so boostDuration is already this burn's.
      liveMs: _arrivalSubjectLiveMs()
    };
    return true;
  }

  function _clearArrivalSubject() {
    if (typeof gameState === 'undefined') return false;
    // Nulling the subject mid-park destroys the park exactly as thoroughly as
    // replacing it does — the staging paths that "claim nothing" (:3763,
    // :3952, :4580) have to respect the beat too.
    if (_parkOwnsBeat()) return false;
    gameState._arrivalSubject = null;
    return true;
  }

  const _owarpFwdTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  const _owarpToTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

  // How far THIS boost can actually carry the ship. Measured live rather than
  // assumed: boostSpeed is 15 u/frame and boostDuration 8,000 ms once the game
  // has initialised (the pre-init defaults are 100/15,000), so the real reach
  // is ~7,200 u — two orders of magnitude short of the 30-90k interstellar
  // legs the demo flies. Every arrival decision has to be made against this
  // number; the round-2 staging never consulted it on the destination path,
  // which is why a nebula 37,000 u away was staged as the arrival subject of a
  // 7,200 u burn. The burn then could not possibly reach it, the cut-off never
  // came into range, and the stopwatch ended the leg mid-flight — measured:
  // subject still 30,510 u out (2.3 deg) when the streaks finished.
  function _oWarpBoostDist() {
    const ew = (typeof gameState !== 'undefined' && gameState.emergencyWarp) || {};
    return (ew.boostSpeed || 15) * 60 * ((ew.boostDuration || 8000) / 1000);
  }

  // ── THE BURN IS SIZED TO THE ARRIVAL, NOT THE OTHER WAY ROUND ────────────
  // Rounds 2-4 all took `boostDuration` as a constant of nature and tried to
  // make a cut-off predicate trip somewhere inside the fixed 7,200 u it buys.
  // It never tripped, because whether a fixed-length burn happens to end next
  // to something is luck, and the census says the odds are zero: 42 bodies
  // inside a burn, none of them framable, while the demo's real destinations
  // sit at 20,000-90,000 u.
  //
  // `boostDuration` is not a constant — physics reads it exactly once per
  // burn, at ignition (`timeRemaining = boostDuration`, game-physics.js), so
  // whatever is in it when the O key lands IS this burn's length. Setting it
  // from the range to the subject turns the arrival into arithmetic: the
  // stopwatch now expires AT the destination instead of somewhere short of
  // it, and the geometric cut-off at the top of update() finally becomes what
  // the brief asked for — the primary terminator, with the clock as backstop.
  //
  // The 12% margin is what makes that ordering real rather than nominal: a
  // guided burn flies a slightly longer path than the straight-line range it
  // was sized from (measured: the ray bends over the first ~500 ms while
  // guidance nulls the lateral offset), so a stopwatch sized on the exact
  // range would keep beating the cut to the punch by a few frames. Sized 12%
  // long, the cut fires first on every converging burn and the clock only
  // wins when the geometry genuinely failed. Overshoot is not the risk it
  // sounds like: the cut's second clause (`_along <= _stop`) ends the burn
  // the instant the subject goes abeam, whatever the clock says.
  //
  // MIN exists so a close destination still gets a real warp beat instead of
  // a stutter; MAX bounds the tunnel's screen time.
  const EW_BURN_MS_MIN = 2000;
  const EW_BURN_MS_MAX = 25000;
  const EW_BURN_MARGIN = 1.12;

  // ── THE DRIVE RUNS UNTIL THE MARKER: SPEED IS SIZED TO THE LEG TOO ────────
  // A duration alone could only ever buy 25 s x 15 u/frame x 60 = 22,500 u,
  // and that ceiling was the single reason the whole arrival machinery above
  // was unreachable code. Measured on this build, at the instant each leg
  // ignited (D.census over the live world, 6 consecutive forced legs, 4 min):
  //
  //     framable bodies in the world : 284      reachable by a 22,500 u burn : 0
  //     every one of them classified : 'tooFar'
  //     nearest framable body        : beyond 22,224 u on EVERY leg
  //
  // With nothing stageable, `_burnFits` was false everywhere, `_stageAndArm`
  // never ran, and 8 of 8 (then 6 of 6) O-warps flew a subject-less ~8,000 ms
  // stopwatch into empty space — arrivalCuts 0, arrivalExts 0, arrivalParks 0.
  // The park, the cut, the extension and the dead-band tiling were all correct
  // and all dead, because no leg could ever nominate a destination.
  //
  // A Star Citizen quantum drive does not stop at 45 % of the way and let go:
  // it SPOOLS TO THE DISTANCE. So does this. `boostSpeed` is read by physics
  // exactly once per burn — captured at the O-key press
  // (`capturedBoostSpeed`, game-physics.js) and used as the velocity clamp for
  // as long as the burn is active — which makes it as much an output of the
  // arrival arithmetic as `boostDuration` is. Sizing both together lets one
  // charge reach anything the world actually contains while the tunnel still
  // lasts a watchable ~12 s instead of a minute.
  //
  // The ceiling is not invented: 100 u/frame is the emergency-warp speed this
  // game's own gameState literal ships (game-core.js), and game-physics.js's
  // guidance notes are written against "boostSpeed 100 u/frame for 15,000 ms".
  // It costs nothing visually — speedWhipLevel() (visual-flair.js) saturates
  // at 16 u/frame, so every streak/FOV/lens curve is already pinned at full
  // long before this — and nothing physically: the exit ramp eases from
  // whatever the boost speed was down to the ship's pre-warp cruise over its
  // own 1 s, so the arrival park still starts from cruise no matter how fast
  // the leg was flown.
  const EW_BOOST_SPEED_MAX = 100;
  // The length the tunnel WANTS to be. Speed is chosen to make the leg fit in
  // this; only when the leg cannot fit even at EW_BOOST_SPEED_MAX does the
  // duration stretch toward EW_BURN_MS_MAX. Legs under the stock reach keep
  // the stock 15 u/frame and behave exactly as before — this only ever adds
  // speed to a leg that would otherwise have been refused as unreachable.
  const EW_BURN_MS_NOMINAL = 12000;
  // ...and what a burn ACTUALLY delivers per wall-clock second, as a fraction
  // of the 60 fps arithmetic above. The burn is armed in MILLISECONDS but
  // travel is integrated PER FRAME with a clamped delta, so on anything under
  // 60 fps the clock runs out before the distance does. Measured on this
  // instrumented rig (20-40 fps, four legs): 12,527 u delivered against 14,952
  // nominal (0.84), 55,360/78,078 (0.71), 34,261/49,036 (0.70), 58,971/112,530
  // (0.52). Taking 0.6 makes the armed clock long enough for the geometric cut
  // to be what ends the burn on a slow machine — which is the ordering this
  // whole file is built on ("arrival is the terminator, the stopwatch is the
  // fallback") — and on a 60 fps machine simply means the cut fires with clock
  // to spare. It also keeps `_burnFits` honest: reach is 90,000 u of DELIVERED
  // distance, so a leg that cannot actually be closed is refused and the
  // corridor search picks a body on the way instead of a 20 s burn that ends
  // 26,913 u short of its subject at 2.6 degrees (measured, delivery 0.52).
  const EW_BURN_DELIVERY = 0.6;

  // How long after ignition the arrival cut-off keeps its hands off the burn.
  // The cut decomposes on the VELOCITY axis, and for the first few hundred ms
  // the velocity is still the pre-warp heading — see the fail-safe in update()
  // for the measurement that made this necessary (a 20,918 ms burn terminated
  // on frame 1). Guidance nulls the entry heading inside ~600 ms; this is that
  // with margin, and always less than EW_BURN_MS_MIN so even the shortest
  // armed burn still gets a live cut-off window.
  const ARRIVAL_CUT_GRACE_MS = 750;

  // ...and how long the WIDE-MISS clause of the same fail-safe waits (see
  // `_blown` in update()). That clause has no lateral term at all, so it is
  // the one predicate that cannot tell "this burn missed" from "this burn has
  // not finished turning yet" by geometry alone — it has to wait out the turn.
  // Guidance is capped at 0.07 rad/frame, so a 180 deg swing takes ~45 frames:
  // 750 ms at 60 fps, ~1.2 s at the 36 fps this was measured at. 2,500 ms is
  // that with better than 2x margin.
  const ARRIVAL_TURN_BUDGET_MS = 2500;

  // How the burn is kept alive when its clock expires before its geometry
  // arrives (see the extension clause in update()). One beat is ~15 frames at
  // 60 fps, so the extension is granular enough that the cut still decides the
  // exact end; the ceiling bounds a leg that cannot converge at 10 extra
  // seconds — inside the 25 s the burn was already allowed to run, so a warp
  // can never become unbounded.
  // The step is deliberately LONGER than one starved frame: the demo is
  // instrumented at ~13 fps here, where physics decrements timeRemaining by a
  // clamped 100-250 ms per tick, so a 250 ms window could be stepped straight
  // over and the burn ended before the top-up ever saw it (measured: a leg that
  // should have extended ran only 1.9 s long and finished 7,646 u out / 9.27
  // deg). 900 ms cannot be skipped by any frame the sim will accept.
  const BURN_EXTEND_STEP_MS = 900;
  // FLAT 12,000 ms WAS NOT A BUDGET, IT WAS A COIN FLIP. The shortfall this
  // rescues is PROPORTIONAL — a burn armed in wall-clock milliseconds under-
  // flies by roughly (60/fps - 1) of its own length — so a fixed ceiling
  // covers a short leg twice over and a long one not at all. Measured on this
  // 36 fps rig: an 11,016 ms leg needed 900 ms of top-up and arrived (Chronos
  // Nebula Prime, cut framed at 29.9 deg); a 15,345 ms leg and a 10,000 ms leg
  // both burned the whole 12,600 ms ceiling and still ended 11,634 u and
  // 7,944 u short, at 3.2 and 6.2 deg. Scale it with the burn instead, keeping
  // the old value as the floor for short legs, and cap the total so a warp
  // still cannot become unbounded: worst case is 25 s armed + 25 s extension.
  const BURN_EXTEND_MAX_MS = 12000;
  function _burnExtendBudget() {
    const ew = (typeof gameState !== 'undefined' && gameState.emergencyWarp) || {};
    return Math.min(EW_BURN_MS_MAX,
      Math.max(BURN_EXTEND_MAX_MS, (ew.boostDuration || 0) * 1.0));
  }

  // ── THE ARRIVAL PARK'S OWN NUMBERS ────────────────────────────────────────
  // See the park block in update() for the measurement that made it a closed
  // loop instead of a 2,600 ms timer.
  //
  // PARK_CLOSE_MAX is a CLOSING RATE along the line of sight, not a speed:
  // what decides whether the destination the burn just framed stays framed is
  // how fast the range is still shrinking, and that is the component of
  // velocity on the bearing to the subject. It is deliberately just under the
  // engine's own floor: `gameState.minVelocity` is 0.4 u/frame (game-core.js)
  // and physics re-normalises velocity back up to it every step unless a warp
  // or a slingshot is live, so 0.4 u/frame of drift is the slowest this ship
  // is allowed to be. The park therefore cannot null the SPEED — it nulls the
  // part of it that is pointed at the destination, which is the part that
  // actually eats the standoff.
  const PARK_CLOSE_MAX = 0.3;
  // Speed above which the ship is still "carrying cruise" and the flare (brake
  // + physics' post-jump deceleration) owns the frame. Set well clear of the
  // 0.4 floor AND of PARK_TANGENTIAL_MIN below, so the flare can never fight
  // the across-track drift the station-keep is deliberately building.
  const PARK_FLARE_SPEED = 0.9;
  // ...and the speed above which NO station-keeping input is meaningful, so
  // the brake is the only thing the park may press. `gameState.maxVelocity` is
  // 4 u/frame, so this sits just under ordinary cruise: the park can never
  // hand the phase back a ship still travelling, and it still leaves ~7x the
  // 0.4 u/frame floor of room for the chase below to match a body on an orbit.
  const PARK_CRUISE_MAX = 3.0;
  // How much ACROSS-track drift the station-keep aims for. The floor forces
  // 0.4 u/frame of motion in whatever direction velocity points, so the only
  // way to hold the closing rate under PARK_CLOSE_MAX is to point it across
  // the line of sight: with the radial part at 0.3 and this much across it,
  // the floored drift resolves to ~0.23 u/frame of closing — under the bar
  // with margin, and it costs 0.42 u/frame (25 u/s) of lateral slide, which
  // over a 5 s hold is 4 degrees of arc and about 5 u of range change at a
  // 2,100 u standoff.
  const PARK_TANGENTIAL_MIN = 0.42;
  // How long the park keeps station AFTER it has stopped the ship, so the
  // phase that resumes (flyToward, the combat re-acquire, the cruise fallback)
  // cannot immediately thrust the arrival back out of frame. This is the beat
  // the player is looking at: the destination held still, at the standoff the
  // burn bought.
  // 5,000 ms was measured too short by exactly the beat it was meant to hold:
  // the park latches "stopped" ~1.5 s after the burn ends, so a 5 s settle
  // expired 5.4 s after the streaks finished — and the moment it did, the
  // phase took the stick back and swung the nose. Measured on Hyperion Nebula
  // Prime: the STANDOFF stayed rock solid (2,226 -> 2,221 u, 0.8 % over the
  // whole window) and the destination still ended up behind the camera at
  // +8.0 s, because parking the ship and holding the shot are two different
  // jobs and only the first one was still running. Hold for the whole beat the
  // arrival is being looked at — the settle read plus the five seconds the
  // standoff has to survive — and still finish inside PARK_MAX_MS.
  const PARK_SETTLE_MS = 9000;
  // Hard ceiling on the whole park so a pathological leg (subject on a fast
  // orbit, ship wedged in a gravity well) always hands control back.
  const PARK_MAX_MS = 12000;

  // Furthest a burn can be armed to reach — the reachability test every
  // staging path is gated on. This replaces `_oWarpBoostDist()` in those
  // tests: what matters is not how far the CURRENT duration would carry the
  // ship, but how far a duration we are about to CHOOSE can.
  //
  // It is measured against the FASTEST burn that can be armed, not the speed
  // sitting in gameState right now: speed is an output of _armWarpBurn (see
  // EW_BOOST_SPEED_MAX above), so asking "how far does the CURRENT boostSpeed
  // reach" is the same category error as asking "how far does the CURRENT
  // boostDuration reach" was. 100 u/frame x 60 x 25 s = 150,000 u, which
  // covers the whole framable population the census found stranded outside the
  // old 22,500 u horizon.
  function _oWarpMaxBoostDist() {
    return EW_BOOST_SPEED_MAX * 60 * (EW_BURN_MS_MAX / 1000) * EW_BURN_DELIVERY;
  }

  // CAN A BURN BE BUILT THAT ACTUALLY CLOSES THIS? — the reachability test the
  // staging clauses gate on. Not "is the straight-line distance under the
  // maximum reach": _armWarpBurn sizes the burn as (range - stand) x
  // EW_BURN_MARGIN and then CLAMPS at EW_BURN_MS_MAX, so a subject sitting at
  // the edge of the maximum is armed to a duration that has had its arc
  // allowance silently clipped off — and the burn flies an arc (measured
  // lateral offset ~2,000 u on a 20,000 u leg), so it ends short. Measured,
  // this build: a subject staged at 23,106 u with a straight-line limit of
  // 23,203 u armed the 25,000 ms ceiling, ran the full stopwatch, and left the
  // ship 5,099 u away — a 1.97 degree speck, the exact "arrives nowhere"
  // symptom. Requiring the UNCLAMPED size to fit means every staged subject is
  // one the burn can reach with its margin intact.
  //
  // ...and it asks it of the burn that CAN be built (EW_BOOST_SPEED_MAX), not
  // of the one currently loaded. Same distance either way — the margin is
  // applied to the ground, and the ground is what _oWarpMaxBoostDist bounds.
  function _burnFits(range, stand) {
    return Math.max(0, range - stand) * EW_BURN_MARGIN <= _oWarpMaxBoostDist();
  }

  // Size the next burn so it expires at `stand` from a subject at `range` —
  // SPEED FIRST, then the clock. Returns the armed duration in ms. Both
  // pre-existing values are stashed once so a burn with no subject (and any
  // warp a human player fires later) still gets the stock 8 s / 15 u-frame
  // boost — see _disarmWarpBurn.
  function _armWarpBurn(range, stand) {
    if (typeof gameState === 'undefined' || !gameState.emergencyWarp) return 0;
    const ew = gameState.emergencyWarp;
    if (ew._baseBoostDuration == null) ew._baseBoostDuration = ew.boostDuration || 8000;
    if (ew._baseBoostSpeed == null) ew._baseBoostSpeed = ew.boostSpeed || 15;
    const ground = Math.max(0, range - stand) * EW_BURN_MARGIN;
    // ── SPEED IS PICKED ONCE PER LEG, AND ONLY UPWARD ────────────────────────
    // Once, because physics captures `boostSpeed` at the KEY PRESS
    // (`const capturedBoostSpeed = ...` in game-physics.js) and writes
    // `velocityVector = forward * capturedBoostSpeed` at ignition, while the
    // velocity CLAMP it applies for the rest of the burn reads the live value.
    // Re-picking a lower speed during the pre-ignition re-arm below would
    // therefore clamp the ship under the speed the burn's own duration was
    // sized for and land it short; latching it makes the two agree by
    // construction. Only upward, because a leg the stock 15 u/frame can
    // already reach must fly exactly as it did before this change — the whole
    // point is to stop REFUSING far destinations, not to re-tune near ones.
    if (ew._burnBoostSpeed == null) {
      ew._burnBoostSpeed = Math.max(ew._baseBoostSpeed,
        Math.min(EW_BOOST_SPEED_MAX,
          ground / (60 * EW_BURN_DELIVERY * (EW_BURN_MS_NOMINAL / 1000))));
      ew.boostSpeed = ew._burnBoostSpeed;
    }
    // Delivered ground per wall-clock second (see EW_BURN_DELIVERY) — the
    // clock has to be long enough for the geometry to arrive under it.
    const perSec = ew._burnBoostSpeed * 60 * EW_BURN_DELIVERY;
    const ms = Math.max(EW_BURN_MS_MIN, Math.min(EW_BURN_MS_MAX, (ground / perSec) * 1000));
    ew.boostDuration = ms;
    // ── THE ARM LATCH ────────────────────────────────────────────────────────
    // Sizing the burn to the arrival is this whole mechanism, and until this
    // latch existed the size was ERASED 23-30 ms later, BEFORE the burn ever
    // ignited. Measured, twice verbatim (Olympus leg 8000 -> 25000 -> 8000;
    // Titan leg 8000 -> 3853 -> 8000): the "hand the stock length back" guard
    // in update() disarms on `!active && !transitioning`, and physics does not
    // raise `transitioning` until ITS next tick — so every leg that did not
    // reach ignition inside a single frame (all of them: triggerOKeyWarp only
    // presses the O key) was stripped back to the stock 8,000 ms. 11 of 12
    // instrumented legs ignited with 8,000 ms = ~7,200 u of reach while their
    // staged subject sat 10,527-24,950 u away, so the burn could not physically
    // reach the thing it had staged and the geometric cut-off starved.
    //
    // The latch records WHEN this leg was armed. The disarm guard now refuses
    // to run inside ARM_LATCH_MS of it, which covers the whole hand-off window
    // (key press -> physics tick -> camera transition -> ignition, ~300-700 ms
    // measured) with margin, while still returning the stock 8 s warp to a
    // human who takes over. `_disarmWarpBurn` clears it, so the very act of
    // handing the length back also re-opens the guard.
    ew._burnArmedAt = Date.now();
    return ms;
  }

  // How long an armed burn is protected from the stock-length hand-back in
  // update(). Must exceed the worst press-to-ignition latency (setCameraFirstPerson
  // transition + the setTimeout in game-physics.js, ~700 ms measured) and stay
  // under the shortest possible full cycle (EW_BURN_MS_MIN 2,000 + 1 s exit
  // ramp) so a real burn's own completion always clears the latch on time.
  const ARM_LATCH_MS = 3000;

  function _disarmWarpBurn() {
    if (typeof gameState === 'undefined' || !gameState.emergencyWarp) return;
    const ew = gameState.emergencyWarp;
    if (ew._baseBoostDuration != null) ew.boostDuration = ew._baseBoostDuration;
    // ...and the SPEED with it, so an interstellar leg's 60-100 u/frame can
    // never be inherited by the next leg (or by a human who takes over with T
    // and presses O). Clearing the latch is also what re-opens the per-leg
    // speed choice in _armWarpBurn.
    if (ew._baseBoostSpeed != null) ew.boostSpeed = ew._baseBoostSpeed;
    ew._burnBoostSpeed = null;
    ew._burnArmedAt = null;
  }

  // How long a staged subject stays authoritative for the framing hold, the
  // camera nudge and the cut-off. Was a flat 19,000 ms, which silently became
  // a THIRD way for the cut to be dead once burns could run to 25 s: the
  // subject would expire mid-boost and every consumer would drop it while the
  // tunnel was still flying. Derive it from the burn actually armed, plus the
  // exit ramp and a margin for the pre-ignition camera transition.
  function _arrivalSubjectLiveMs() {
    const ew = (typeof gameState !== 'undefined' && gameState.emergencyWarp) || {};
    return Math.max(19000, (ew.boostDuration || 8000) + 8000);
  }

  // Is this staged subject still live? Prefers the window captured at staging
  // time (so a burn keeps its own subject even if boostDuration is re-armed
  // by a later leg) and falls back to the flat legacy window.
  function _arrivalSubjectFresh(as) {
    if (!as) return false;
    return Date.now() - (as.stagedAt || 0) < (as.liveMs || 19000);
  }

  // Ground the exit ramp eats after the cut fires — see the arrival cut-off in
  // update() for the derivation (ease-out-cubic mean of 0.75 over 1 s, plus a
  // couple of frames of trigger latency).
  function _oWarpStopDist() {
    const ew = (typeof gameState !== 'undefined' && gameState.emergencyWarp) || {};
    const boost = ew.boostSpeed || 15;
    const cruise = Math.min(boost, (gameState.maxVelocity || 4));
    return (0.25 * boost + 0.75 * cruise) * 60 + boost * 2;
  }

  // BEST BODY THIS BURN CAN ACTUALLY ARRIVE AT, searched along the ray it is
  // about to fly. Replaces the old "guess the landing point, then look for
  // something near it" staging, which reasoned about a POINT when the thing
  // that decides an arrival is a SEGMENT: everything between here and the end
  // of the burn is reachable, not just the far tip.
  //
  // A candidate qualifies when the burn can both REACH it and STOP at it:
  //   * its RANGE (not its projection) is inside boostDist plus its own
  //     stopping allowance. Range, because a guided burn flies an arc, not the
  //     ray — and the cut fires when the remaining along-track distance is
  //     stand+stop, so a body out at that limit is still caught with the
  //     boost's last frames. That is what lets a leg keep nearly its full
  //     ~7,200 u of progress AND still arrive.
  //   * it is not already on top of us (range > 1.3x its standoff) — that is
  //     a place we are at, not one to fly to.
  //   * it lies inside a 30 deg cone about the intended direction. A cone,
  //     because warp guidance (game-physics.js) bends the burn toward the nose
  //     at 0.012 rad/frame — at 15 u/frame that is a ~1,250 u turn radius, and
  //     measured live an 8,647 u lateral miss collapsed to 1,648 u inside
  //     600 ms. The first version of this search used a narrow perpendicular
  //     corridor and found nothing at all on real legs (measured: four
  //     consecutive O-warps staged no subject), because it was testing a
  //     ballistic ray the ship no longer flies. 30 deg still keeps the leg
  //     genuinely pointed at where the phase is going.
  //   * it is framable at all (see _arrivalStandoff) — a pebble whose danger
  //     radius forces a standoff where it reads as a speck is not an arrival.
  // Score prefers big bodies far down the burn, well centred: a bigger reveal,
  // more of the leg's distance actually flown, less curving to get there.
  const _ARRIVAL_CONE_COS = Math.cos(30 * Math.PI / 180);
  // Turn radius the burn needs to swing onto a subject: boost speed divided by
  // guidance's ceiling rate (15 u/frame / 0.07 rad/frame ~= 215 u), rounded up
  // to leave the manoeuvre room rather than exactly none.
  const _ARRIVAL_TURN_RADIUS = 400;
  // `boostDist` is retained for the callers' sake (and for the comment above);
  // reachability itself is now decided by _burnFits, which asks the stricter
  // question — can a burn be SIZED for this without its margin being clamped.
  function _findArrivalSubjectAlongRay(from, dir, boostDist) {
    if (typeof planets === 'undefined' || !from || !dir || !_owarpToTmp) return null;
    let best = null, bestRadius = 0, bestScore = -Infinity;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      const ud = p && p.userData;
      if (!p || !p.position || !ud) continue;
      if (ud.type === 'asteroid' || ud.type === 'asteroidBelt') continue;
      const radius = (p.geometry && p.geometry.parameters && p.geometry.parameters.radius) || ud.size || 20;
      const so = _arrivalStandoff(radius, _arrivalDangerR(p));
      if (!so.framable) continue;
      _owarpToTmp.subVectors(p.position, from);
      const range = _owarpToTmp.length();
      if (range <= so.stand * 1.3) continue;
      if (!_burnFits(range, so.stand)) continue;
      // ── "ON THE WAY" MEANS ON THE WAY, NOT PAST IT ────────────────────────
      // `boostDist` used to be documentation only — the function took it and
      // never read it, leaving reachability entirely to _burnFits. That was
      // harmless while a burn could only fly 22,500 u and every real leg was
      // longer. The moment the reach became 150,000 u it turned into a
      // measured catastrophe: a leg whose destination was a nebula 1,759 u
      // away staged Tartarus Nebula Prime — 76,741 u out, in the same 30 deg
      // cone — armed a 13.8 s / 100 u-frame burn for it, and then the phase
      // (still flying to its own 1,759 u destination) swung the nose onto
      // THAT, guidance followed the nose, and the staged subject went from
      // 11.2 deg off the bow to 138 deg behind in 2.5 s. Three legs in a row,
      // each ended by the cut's `blown` clause at ~2.7 s of a 13 s burn.
      // A body further away than the place we are going is not on the way to
      // it, so the caller's segment length is now enforced, not annotated.
      if (boostDist && range > boostDist) continue;
      const cosA = _owarpToTmp.dot(dir) / Math.max(1e-6, range);
      if (cosA < _ARRIVAL_CONE_COS) continue;
      // WILL THE BURN ACTUALLY GET INSIDE THIS BODY'S CORRIDOR?
      //
      // The old rule here — reject unless the starting lateral offset is
      // within 2x the reveal's budget — came from the claim that "guidance
      // removes roughly half of the standing offset over a burn". Measured
      // directly on a live guided burn, that is wrong by an order of
      // magnitude, and wrong in the SAFE direction: with the nose held on the
      // subject through ignition, the offset went 4,816 u -> 732 u (+250 ms)
      // -> 77 u (+540 ms) -> 8 u at cut range. Guidance is proportional-rate
      // pure pursuit of a stationary point (game-physics.js), so it converges
      // outright rather than plateauing; the terminal miss is set by the turn
      // rate (~150 u), not by where the burn started. The old evidence for
      // "half" was collected on burns that were still ballistic or still
      // fixed-length, i.e. burns that ended before convergence finished.
      //
      // What the offset actually costs is TIME — the burn spends its first
      // half-second turning rather than closing — so the real constraint is
      // that the turn has to fit inside the burn. Charge the offset against
      // the runway instead of rejecting on it: require the along-track
      // distance to exceed the lateral offset, which is just "the subject is
      // more ahead of us than beside us" (a 45 deg limit, inside the 30 deg
      // cone anyway) plus enough room for the turn radius at boost speed.
      const offNow = range * Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const alongNow = range * cosA;
      if (alongNow < offNow + _ARRIVAL_TURN_RADIUS) continue;
      // Radius dominates: a big body is both a better reveal and a far more
      // forgiving target (its lateral budget scales with it), so prefer one
      // decisively over a nearer moon. Then distance flown, then centring.
      const score = radius * 8 + range * 0.25 - (1 - cosA) * range;
      if (score > bestScore) { bestScore = score; best = p; bestRadius = radius; }
    }
    return best ? { obj: best, radius: bestRadius } : null;
  }

  // Fallback staging for a warp with no destination in hand: search along the
  // current heading. A hop that lands in open space between clusters honestly
  // has no arrival subject — better to claim nothing (and let the stopwatch
  // end the leg) than to bias the camera at emptiness.
  function _stageOWarpArrivalSubject() {
    if (typeof camera === 'undefined' || !_owarpFwdTmp || typeof gameState === 'undefined') return false;
    camera.getWorldDirection(_owarpFwdTmp);
    // Searched against the FURTHEST a burn can be armed to fly, not the
    // current duration's reach — the duration is an output of this search now,
    // not an input to it.
    const cand = _findArrivalSubjectAlongRay(camPos(), _owarpFwdTmp, _oWarpMaxBoostDist());
    if (cand) { _stageAndArm(cand.obj, cand.radius); return true; }
    _clearArrivalSubject();
    _disarmWarpBurn();
    return false;
  }

  // Arm this burn to expire at the subject, THEN stage it. Order matters:
  // _setArrivalSubject captures its live-window from the armed duration.
  function _stageAndArm(obj, radius) {
    // Ask BEFORE arming: _armWarpBurn writes this leg's duration into
    // gameState.emergencyWarp, so staging that is going to be refused must not
    // leave a re-armed burn behind for the park's own subject to inherit.
    if (_parkOwnsBeat()) return false;
    const so = _arrivalStandoff(radius, _arrivalDangerR(obj));
    _armWarpBurn(camPos().distanceTo(obj.position), so.stand);
    return _setArrivalSubject(obj, radius);
  }

  // ─── navigateTo: closed-loop travel controller ─────────────────────────────
  // The autopilot used to puppet raw key presses from each phase (orient here,
  // wDoubleTap there, brake band somewhere else), fighting physics state it
  // couldn't see — every jump-tuning fix broke a different phase. This owns
  // the whole loop: call it EVERY FRAME with a destination and it observes
  // dist/speed/facing/warp-locks and decides orient/thrust/jump/warp/brake
  // internally. Phases express intent ("go there, arrive slow"), not inputs.
  //
  //   navigateTo(pos, {
  //     arriveRadius: 300,   // "arrived" inside this distance
  //     arriveSpeed:  1.5,   // ...and below this speed
  //     boost:        false, // hold B on long straights
  //     allowJump:    true,  // may fire tactical W-jumps (dist > 1200)
  //     jumpMaxDist:  Infinity, // only jump when closer than this
  //     allowWarp:    false, // may burn an emergency-warp charge (dist > 8000)
  //     approachRange: 0,    // speed-governed combat-approach zone: inside
  //     approachSpeed: 9.5,  //   this range no jumps/warps fire and speed is
  //                          //   braked below approachSpeed (u/frame; ×1000
  //                          //   = the HUD's km/s) so arrivals don't overshoot
  //   }) -> 'locked' | 'orienting' | 'cruising' | 'jumping' | 'warping'
  //        | 'braking' | 'arrived'
  //
  // Invariants it enforces (each was a hand-fixed demo bug at least once):
  //   - orient BEFORE thrust; never jump on a stale heading (facing > 0.9)
  //   - hands off while the plant owns velocity (warp/slingshot/BH transit)
  //   - never brake during an active warp boost
  //   - stopping-distance braking (speed*35 ≈ X-brake coast length) instead
  //     of fixed brake bands, so it neither overshoots nor crawls.
  const _navDir = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  const _navFwd = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  const _navVel = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  function navigateTo(pos, opts) {
    if (typeof gameState === 'undefined' || !_navDir) return 'locked';
    opts = opts || {};
    const arriveRadius = opts.arriveRadius != null ? opts.arriveRadius : 300;
    const arriveSpeed = opts.arriveSpeed != null ? opts.arriveSpeed : 1.5;
    let allowJump = opts.allowJump !== false;
    const jumpMaxDist = opts.jumpMaxDist != null ? opts.jumpMaxDist : Infinity;
    let allowWarp = !!opts.allowWarp;
    let boost = !!opts.boost;
    const approachRange = opts.approachRange || 0;
    const approachSpeed = opts.approachSpeed != null ? opts.approachSpeed : 9.5;

    // Resolve a target object auto-nav/orient can consume (reuse the dummy)
    let targetObj;
    if (pos && pos.userData && pos.position) {
      targetObj = pos;
    } else {
      if (!ap._navDummy) ap._navDummy = { position: new THREE.Vector3(), userData: {} };
      if (pos && pos.position) ap._navDummy.position.copy(pos.position);
      else if (pos && pos.isVector3) ap._navDummy.position.copy(pos);
      else ap._navDummy.position.set(pos.x || 0, pos.y || 0, pos.z || 0);
      targetObj = ap._navDummy;
    }
    gameState.currentTarget = targetObj;

    const cp = camPos();
    const dist = cp.distanceTo(targetObj.position);
    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
    const w = gameState.emergencyWarp || {};
    const slinging = !!(gameState.slingshot && gameState.slingshot.active);

    // 1) Plant owns the velocity — hands off (still steer during a straight
    //    warp boost so the post-warp heading is right; never during a
    //    slingshot whip, where gravity owns the camera too).
    if (w.active || w.transitioning || slinging || gameState.isBlackHoleWarping) {
      if (!slinging && window.orientTowardsTarget) window.orientTowardsTarget(targetObj);
      ap._navStatus = 'locked';
      return 'locked';
    }

    // 2) Steer first, and measure how aligned we actually are — thrust and
    //    jumps only fire along a verified heading.
    let facing = 1;
    if (window.orientTowardsTarget && typeof camera !== 'undefined') {
      window.orientTowardsTarget(targetObj);
      camera.getWorldDirection(_navFwd);
      _navDir.subVectors(targetObj.position, cp).normalize();
      facing = _navFwd.dot(_navDir);
    }

    const k = keys();

    // 2b) RECEDING GUARD — the overshoot killer. If the velocity points
    //    AWAY from the target while we're still moving, braking beats
    //    turning: without this, an overshot ship coasted away at full
    //    speed in 'orienting' (no brake) until the jump/warp logic fired
    //    again from twice the distance. Brake first, then turn.
    if (_navVel && gameState.velocityVector && speed > Math.max(1, arriveSpeed) &&
        dist > arriveRadius) {
      _navVel.copy(gameState.velocityVector).normalize();
      _navDir.subVectors(targetObj.position, cp).normalize();
      if (_navVel.dot(_navDir) < -0.1) {
        k.b = false;
        k.x = true;
        ap._navStatus = 'braking';
        return 'braking';
      }
    }

    // 3) Arrival: inside the radius, kill residual speed then hold.
    if (dist < arriveRadius) {
      if (speed > arriveSpeed) { k.b = false; k.x = true; ap._navStatus = 'braking'; return 'braking'; }
      ap._navStatus = 'arrived';
      return 'arrived';
    }

    // 3b) COMBAT-APPROACH GOVERNOR: inside approachRange the destination is
    // an engagement zone (e.g. the hostiles waiting at a discovery-path
    // endpoint) — never jump/warp INTO it, kill boost, and brake until
    // speed is below approachSpeed so the ship arrives fighting, not
    // overshooting. Braking continues each frame the cap is exceeded.
    if (approachRange && dist < approachRange) {
      allowJump = false;
      allowWarp = false;
      boost = false;
      if (speed > approachSpeed) {
        k.b = false;
        k.x = true;
        ap._navStatus = 'braking';
        return 'braking';
      }
    }

    // 4) Stopping-distance control: the X-brake coast (0.975/frame) needs
    //    ≈40·v units to fully decay; 45·v adds reaction-latency margin so
    //    braking starts BEFORE continuing would overshoot the radius
    //    (35·v consistently started a few frames late at warp speeds).
    const stopDist = arriveRadius + speed * 45;
    if (dist < stopDist && speed > Math.max(0.3, arriveSpeed)) {
      k.b = false;
      k.x = true;
      ap._navStatus = 'braking';
      return 'braking';
    }

    // 5) Long haul: burn an emergency-warp charge (shared 20s cooldown).
    //    An O-warp covers ~7200u of boost plus a long coast, and the
    //    controller is hands-off while it's active — with an approach zone
    //    set, require enough runway that the boost ends well outside it.
    // 15000 floor (was 8000): an O-warp is ~7200u of hands-off boost plus
    // a long high-speed coast — from 8000u out, boost+coast routinely
    // carried past the target before the controller regained authority.
    const _warpMinDist = Math.max(15000, approachRange ? approachRange + 12000 : 0);
    if (allowWarp && dist > _warpMinDist && facing > 0.9 && canEmergencyWarp() &&
        Date.now() - (ap._lastBHWarp || 0) > 20000) {
      if (triggerOKeyWarp(targetObj)) {
        ap._lastBHWarp = Date.now();
        ap.warpStartedAt = Date.now();
        ap._navStatus = 'warping';
        return 'warping';
      }
    }

    // 6) Tactical W-jump. Without an approach zone it's sized to land near
    //    the target (default boost speed 15 → (dist-700) ms puts the coast
    //    tail on the doorstep). WITH an approach zone it's sized to land at
    //    the zone EDGE — the ship is hands-off during the boost, so a jump
    //    aimed at the target itself would carry warp speed into the fight.
    //
    // FIX 1 — ARRIVAL SUBJECT: a flat 700u standoff was sized for nothing in
    // particular — a tiny asteroid and a whole star got the same tail, so
    // landing distance had no relationship to what was actually there to
    // see. When this jump has a real destination (no approachRange — that
    // path is a combat engagement, not an arrival) and a body worth
    // revealing sits near the target, land at ITS ideal reveal distance
    // instead: close enough for >=15 deg angular size, never inside its own
    // danger radius. No candidate body → no subject staged, and the flat
    // 700u tail is unchanged (nothing claimed, nothing to frame).
    let _jumpTail = 700;
    if (!approachRange) {
      const _arrivalCand = _findArrivalSubject(targetObj.position, Math.max(1500, Math.min(dist, 4000)));
      // Size the tail from what the setter ACCEPTED, not from whatever is in
      // gameState afterwards: under the park interlock the set can be refused,
      // and reading the live subject then would size this jump's landing from
      // a DIFFERENT body — the one currently parked at.
      if (_arrivalCand && _setArrivalSubject(_arrivalCand.obj, _arrivalCand.radius)) {
        _jumpTail = Math.min(gameState._arrivalSubject.arriveDist, dist * 0.6, 4500);
      } else if (!_arrivalCand) {
        _clearArrivalSubject();
      }
    }
    const _jumpGap = approachRange ? (dist - approachRange) : (dist - _jumpTail);
    // A tactical jump sets emergencyWarp.isJump, which the park explicitly
    // stands down for — so an unguarded jump does not merely disturb the
    // arrival, it silently switches the park off and boosts away from it.
    if (allowJump && !_parkOwnsBeat() &&
        dist > 1200 && _jumpGap > 500 && dist < jumpMaxDist && speed < 4 &&
        facing > 0.9 && gameState.energy > 25 &&
        Date.now() - (ap._lastJumpTap || 0) > 5000) {
      ap._lastJumpTap = Date.now();
      // Jump distance ≈ 0.9u/ms of boost PLUS a ~500u auto-brake tail, so
      // size the boost for (gap - tail). gap·1.0 overshot short hops by
      // ~30% (gap 1000 → ~1310u traveled) and pushed warp speed into the
      // approach zone.
      gameState._pendingJumpMs = Math.min(6000, Math.max(700, _jumpGap - 500));
      if (window.keys) {
        window.keys.wDoubleTap = true;
        setTimeout(() => { if (window.keys) window.keys.wDoubleTap = false; }, 120);
      }
      ap._navStatus = 'jumping';
      return 'jumping';
    }

    // 7) Cruise — thrust only once the bow is roughly on target.
    if (facing > 0.5) {
      k.w = true;
      if (boost && dist > stopDist * 2) k.b = true;
      ap._navStatus = 'cruising';
      return 'cruising';
    }
    ap._navStatus = 'orienting';
    return 'orienting';
  }

  function orbitAround(centerObj) {
    if (!centerObj || typeof camera === 'undefined') return;
    const cp = camPos();
    const targetPos = centerObj.position;
    const dist = cp.distanceTo(targetPos);

    // Desired orbit radius — close enough to feel immersive (150 u by
    // default, scaled up slightly for very large bodies).
    const bodySize = (centerObj.userData && centerObj.userData.size) || 20;
    const orbitR = Math.max(bodySize * 2.5, 150);

    // Radial direction (planet → ship)
    const radial = cp.clone().sub(targetPos).normalize();
    // Tangential direction (perpendicular to radial, in XZ plane)
    const tangent = new THREE.Vector3(-radial.z, 0, radial.x);

    if (dist > orbitR * 1.3) {
      // Still too far — approach the orbit shell
      flyToward(centerObj, 1.2);
    } else if (dist < orbitR * 0.7) {
      // Inside the orbit shell — push outward gently
      const outPoint = cp.clone().add(radial.clone().multiplyScalar(50));
      flyToward({ position: outPoint }, 0.8);
    } else {
      // On the orbit ring — thrust tangentially
      const orbitPoint = cp.clone().add(tangent.clone().multiplyScalar(80));
      flyToward({ position: orbitPoint }, 0.8);
      // Keep the planet in view
      if (window.orientTowardsTarget) {
        window.orientTowardsTarget({ position: targetPos });
      }
    }
  }

  const _evadeRadial = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  const _evadeRight = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  const _evadeFwd = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  function avoidPlanetCollisions() {
    if (typeof planets === 'undefined' || typeof camera === 'undefined') return;
    const now = Date.now();
    if (ap._evadeUntil && now < ap._evadeUntil) {
      const k = keys();
      if (ap._evadeKey) k[ap._evadeKey] = true;
      k.x = true;
      return;
    }
    const cp = camPos();
    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
    // The demo is "headed for" a black hole during these phases only.
    // Outside them, treat BHs as a much larger danger zone so we don't
    // get accidentally sucked back in after a surprise warp.
    const _bhIntended = (ap.phase === 'blackHoleWarp' ||
                         ap.phase === 'gotoBlackHoleGalaxy');
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      if (!p || !p.position) continue;
      if (p.userData && p.userData.type === 'asteroid') continue;
      const sz = (p.userData && p.userData.size) || 20;
      const isStar = p.userData && p.userData.type === 'star';
      const isBlackHole = p.userData && p.userData.type === 'blackhole';
      // Black holes get the biggest danger zone — unless the demo is in
      // a phase that deliberately wants to dive into one.  Stars and
      // planets keep their existing margins.
      let dangerR;
      if (isBlackHole && !_bhIntended) {
        const warpThresh = (p.userData && p.userData.warpThreshold) || 600;
        dangerR = warpThresh + 1200;
      } else if (isBlackHole) {
        dangerR = 200; // intended dive — just don't grind the boundary
      } else if (isStar) {
        dangerR = Math.max(sz * 4, 200);
      } else {
        dangerR = Math.max(sz * 2, 80);
      }
      // Extra care while working a nebula cluster: the twin nebulas are
      // dense with planets and the demo weaves between them hunting the
      // center — widen every non-BH margin by 50% there.
      if (!isBlackHole && (ap.phase === 'coastToNebulaCluster' ||
          ap.phase === 'orbitNebulaPlanet' || ap.phase === 'warpToNebulaCluster')) {
        dangerR *= 1.5;
      }
      // At high speed, extend the danger zone proportionally. speed*35
      // matches the X-brake stopping distance (was speed*15 ≈ a quarter
      // second of warning at post-warp coast speed — far too late).
      const effectiveR = dangerR + speed * 35;
      const dist = cp.distanceTo(p.position);
      if (dist < effectiveR) {
        // Only evade if we're actually heading toward the body
        if (gameState.velocityVector && speed > 0.2) {
          _evadeRadial.subVectors(p.position, cp).normalize();
          const approach = gameState.velocityVector.clone().normalize().dot(_evadeRadial);
          if (approach < 0.1) continue; // moving away — no danger
        }
        _evadeRadial.subVectors(cp, p.position).normalize();
        _evadeRight.set(-_evadeRadial.z, 0, _evadeRadial.x);
        camera.getWorldDirection(_evadeFwd);
        ap._evadeKey = _evadeFwd.dot(_evadeRight) > 0 ? 'a' : 'd';
        ap._evadeUntil = now + 1000;
        const k = keys();
        k[ap._evadeKey] = true;
        k.x = true;
        return;
      }
    }
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
    const engageRange = (target.userData && target.userData.firingRange) || 400;
    const dist = camPos().distanceTo(target.position);
    if (dist > engageRange) return;
    if (!isInFiringCone(target, engageRange + 100)) return;
    // Never fire at something that isn't actually visible onscreen.
    if (!_isOnScreen(target.position)) return;

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
    // Never launch while shields are up — the game's fireMissile also
    // blocks this, but we check here so the demo doesn't burn its
    // per-target allowance on a shot that the engine will reject.
    if (shieldsActive()) return;
    gameState.currentTarget = target;
    if (window.fireMissile) window.fireMissile();
  }

  // One-shot pursuit flair: occasional single-direction roll on long chases
  // ('pursuit' mode) or occasional bank while orbiting an opponent ('engage'
  // mode).  Nudges are ~200–360 ms each and spaced 5–13 s apart, with a
  // 30% chance to do nothing at all when the next window fires — keeps
  // the flight calm instead of rhythmic.
  function pursuitFlightStyle(mode) {
    const now = Date.now();
    const k = keys();

    if (ap._flightStyleUntil && now < ap._flightStyleUntil) {
      if (ap._flightStyleKey) k[ap._flightStyleKey] = true;
      return;
    }
    if (ap._flightStyleUntil && now >= ap._flightStyleUntil) {
      if (ap._flightStyleKey) k[ap._flightStyleKey] = false;
      ap._flightStyleKey = null;
      ap._flightStyleUntil = 0;
      ap._nextFlightStyleAt = now + 5000 + Math.random() * 8000;
      return;
    }
    if (!ap._nextFlightStyleAt) {
      ap._nextFlightStyleAt = now + 5000 + Math.random() * 8000;
      return;
    }
    if (now < ap._nextFlightStyleAt) return;

    // Skip ~30% of windows so the nudges don't feel rhythmic
    if (Math.random() < 0.3) {
      ap._nextFlightStyleAt = now + 5000 + Math.random() * 8000;
      return;
    }

    if (mode === 'engage') {
      ap._flightStyleKey = Math.random() < 0.5 ? 'left' : 'right';
    } else {
      ap._flightStyleKey = Math.random() < 0.5 ? 'q' : 'e';
    }
    ap._flightStyleUntil = now + 200 + Math.random() * 160;
    k[ap._flightStyleKey] = true;
  }

  // Demo missile engagement bubble: a fixed 500 u lock + 100 u buffer
  // = 600 u. Deliberately decoupled from gameState.targetLock.range
  // (now 400 u for the laser auto-aim) so missiles reach a bit further
  // than the close-range laser dogfight without chasing forever.
  const MISSILE_RANGE_BUFFER = 100;
  function missileMaxRange() {
    return 500 + MISSILE_RANGE_BUFFER;
  }

  // Track which enemies already had a missile fired at them this run
  // so the demo doesn't waste its payload on re-firing at the same
  // target.  Cleared on phase reset (resetFlags).
  function hasMissileBeenFiredAt(target) {
    return !!(target && target.userData && target.userData._demoMissileFired);
  }
  function markMissileFiredAt(target) {
    if (target && target.userData) target.userData._demoMissileFired = true;
  }

  // True while a launched missile is still tracking `target` in the
  // active-missiles list. Used by combat to (a) suppress laser fire at the
  // missile's victim until impact and (b) hold the ship square-on to the
  // target regardless of the missile's curved path.
  function _isMissileInFlightAt(target) {
    if (!target || !window.activeMissiles) return false;
    const list = window.activeMissiles;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m && m.userData && m.userData.target === target) return true;
    }
    return false;
  }

  // Returns true if the demo should fire a missile at `target` right
  // now — combines range, shield, payload, and once-per-target rules.
  function shouldFireMissileAt(target, dist) {
    if (!target || !target.userData) return false;
    if (shieldsActive()) return false;
    if (!gameState.missiles || gameState.missiles.current <= 0) return false;
    // Boss-tier targets are engaged from the long standoff — skip the
    // close-range gate for them (their own cap is applied below).
    const _bossRangeTier = target.userData.isBoss ||
                           target.userData.isEliteGuardian ||
                           target.userData.isBlackHoleGuardian;
    if (!_bossRangeTier && dist > missileMaxRange()) return false;
    // Bosses / elite guardians / black-hole guardians have NO once-per-
    // target limit — the demo may keep missiling these big targets
    // (still rate-limited by the 1.5 s pacing below).
    const _bigTarget = target.userData.isBoss ||
                       target.userData.isEliteGuardian ||
                       target.userData.isBlackHoleGuardian;
    // Big targets are fought from the 1,400u+ standoff — let missiles
    // reach them from there instead of demanding point-blank range.
    if (_bigTarget && dist > 2000) return false;
    if (!_bigTarget && hasMissileBeenFiredAt(target)) return false;
    if (Date.now() - (ap._lastMissileTime || 0) <= 1500) return false;
    return true;
  }

  // Fire lasers ONLY when the game's auto mouse targeting has engaged on a
  // live enemy — i.e. the enemy is inside gameState.targetLock.range (the
  // game's auto-aim bubble).  Runs during combat and Borg fight phases.
  // Stops firing the instant the lock drops or the target moves out of
  // auto-aim range.
  // Returns true if the world-position is in the camera's forward hemisphere
  // True only when worldPos is actually inside the viewport. The old
  // version was a 146°-wide cone (dot > 0.3) that let the demo fire at
  // things well off-screen. Now: must be in front of the camera AND
  // project inside the screen (slight inset so it never fires at a
  // target hugging / just past the edge).
  function _isOnScreen(worldPos) {
    if (!camera || !worldPos || typeof THREE === 'undefined') return false;
    camera.getWorldDirection(_coneFwd);
    _coneVec.subVectors(worldPos, camera.position);
    if (_coneFwd.dot(_coneVec) <= 0) return false; // behind camera
    if (!_isOnScreen._v) _isOnScreen._v = new THREE.Vector3();
    const v = _isOnScreen._v.set(worldPos.x, worldPos.y, worldPos.z).project(camera);
    return v.z < 1 &&
           v.x >= -0.95 && v.x <= 0.95 &&
           v.y >= -0.95 && v.y <= 0.95;
  }

  function autoFireOnTargetLock() {
    if (ap.phase !== 'combat' && ap.phase !== 'fightBorg') return;
    if (!gameState || !gameState.targetLock || !gameState.targetLock.active) return;
    const tgt = gameState.targetLock.target;
    if (!tgt || !tgt.userData) return;
    if (tgt.userData.type !== 'enemy' && !tgt.userData.isBorg) return;
    if (tgt.userData.health <= 0) return;
    // While a missile is en route to this target, hold lasers — the demo
    // commits to the missile resolution and resumes lasers post-impact.
    if (_isMissileInFlightAt(tgt)) return;

    // Demo player only fires when within 400u — keep dogfights close-range.
    // Boss-tier targets are engaged from the 1,400u+ standoff, so lasers
    // get the reach to match.
    const _bossTgt = tgt.userData.isBoss || tgt.userData.isEliteGuardian ||
                     tgt.userData.isBlackHoleGuardian;
    const engageRange = _bossTgt
      ? 1800
      : Math.min(400, (tgt.userData && tgt.userData.firingRange) || 400);
    const dist = camPos().distanceTo(tgt.position);
    if (dist > engageRange) return;

    // Never fire at something offscreen
    if (!_isOnScreen(tgt.position)) return;

    const now = Date.now();
    if (now - (ap.lastFire || 0) < 1000) return;
    if (gameState.weapons.cooldown > 0 || gameState.weapons.energy < 10) return;

    if (window.orientTowardsTarget) {
      window.orientTowardsTarget({ position: tgt.position });
    }

    ap.lastFire = now;
    gameState.crosshairX = window.innerWidth / 2;
    gameState.crosshairY = window.innerHeight / 2;
    if (window.fireWeapon) window.fireWeapon();
  }

  // Pick a planet near a nebula center to use as the orbit phase's
  // nav-lock target. Prefers the largest planet inside ~6000u so the HUD
  // reads with a notable body name. Falls back to nearest planet of any
  // kind within that range, then null.
  function _findPlanetNearNebula(nebula) {
    if (!nebula || typeof planets === 'undefined') return null;
    if (!_findPlanetNearNebula._tmp) _findPlanetNearNebula._tmp = new THREE.Vector3();
    const center = nebula.position;
    const MAX = 6000;
    let bestBig = null, bestBigScore = -1;
    let bestAny = null, bestAnyDist = MAX;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      if (!p || !p.userData) continue;
      if (p.userData.type !== 'planet') continue;
      if (p.userData.health !== undefined && p.userData.health <= 0) continue;
      const d = center.distanceTo(p.position);
      if (d > MAX) continue;
      // Prefer larger bodies — radius proxy: userData.radius if present
      const r = (p.userData.radius || p.scale && p.scale.x) || 1;
      const score = r - d * 0.0002;
      if (score > bestBigScore) { bestBigScore = score; bestBig = p; }
      if (d < bestAnyDist) { bestAnyDist = d; bestAny = p; }
    }
    return bestBig || bestAny;
  }

  // Find the nearest asteroid within range
  function _findNearestAsteroid(maxRange) {
    if (typeof camera === 'undefined') return null;
    const cp = camPos();
    if (!_findNearestAsteroid._tmp) _findNearestAsteroid._tmp = new THREE.Vector3();
    const tmp = _findNearestAsteroid._tmp;
    let best = null, bestDist = maxRange;

    if (typeof planets !== 'undefined') {
      for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        if (!p || !p.userData || p.userData.type !== 'asteroid') continue;
        if (p.userData.health !== undefined && p.userData.health <= 0) continue;
        const d = cp.distanceTo(p.position);
        if (d < bestDist) { best = p; bestDist = d; }
      }
    }
    // Interstellar / dense-galaxy-field asteroids (the breakable ones).
    if (typeof interstellarAsteroids !== 'undefined') {
      for (let i = 0; i < interstellarAsteroids.length; i++) {
        const a = interstellarAsteroids[i];
        if (!a || !a.userData || (a.userData.health !== undefined && a.userData.health <= 0)) continue;
        const d = cp.distanceTo(a.position);
        if (d < bestDist) { best = a; bestDist = d; }
      }
    }
    if (typeof outerInterstellarSystems !== 'undefined') {
      for (let i = 0; i < outerInterstellarSystems.length; i++) {
        const sys = outerInterstellarSystems[i];
        if (!sys || !sys.userData || !sys.userData.orbiters) continue;
        for (let j = 0; j < sys.userData.orbiters.length; j++) {
          const o = sys.userData.orbiters[j];
          if (!o || !o.userData) continue;
          if (o.userData.type !== 'outer_asteroid') continue;
          if (o.userData.health !== undefined && o.userData.health <= 0) continue;
          o.getWorldPosition(tmp);
          const d = cp.distanceTo(tmp);
          if (d < bestDist) { best = o; bestDist = d; }
        }
      }
    }
    return best;
  }

  // Shoot nearby asteroids that are already on screen for hull recovery.
  // Does NOT steer the camera — only fires when an asteroid happens to
  // sit under the crosshair.  Active steering is done by phaseMineAsteroids.
  function shootNearbyAsteroids() {
    if (ap._killCooldownUntil && Date.now() < ap._killCooldownUntil) return;
    if (!gameState || gameState.weapons.cooldown > 0 || gameState.weapons.energy < 10) return;
    if (typeof camera === 'undefined') return;

    // Skip if an enemy/Borg is target-locked — combat owns the trigger
    if (gameState.targetLock && gameState.targetLock.active && gameState.targetLock.target) {
      const ud = gameState.targetLock.target.userData;
      if (ud && (ud.type === 'enemy' || ud.isBorg)) return;
    }

    const now = Date.now();
    if (now - (ap._lastAsteroidFire || 0) < 1200) return;

    const maxRange = 500;
    const target = _findNearestAsteroid(maxRange);
    if (!target) return;

    // Only shoot if the asteroid is already in front of the camera
    const tgtPos = target.position.clone();
    if (target.parent && target.parent.type === 'Group' && target.parent.parent) {
      target.getWorldPosition(tgtPos);
    }
    if (!_isOnScreen(tgtPos)) return;

    // Raycast confirm — crosshair must be ON the asteroid
    if (!shootNearbyAsteroids._ray) shootNearbyAsteroids._ray = new THREE.Raycaster();
    if (!shootNearbyAsteroids._origin) shootNearbyAsteroids._origin = new THREE.Vector2(0, 0);
    const ray = shootNearbyAsteroids._ray;
    ray.setFromCamera(shootNearbyAsteroids._origin, camera);
    const hits = ray.intersectObjects([target], true);
    if (!hits.length) return;

    gameState.crosshairX = window.innerWidth / 2;
    gameState.crosshairY = window.innerHeight / 2;
    ap._lastAsteroidFire = now;
    if (window.fireWeapon) window.fireWeapon();
  }

  // ─── DO NOT WARP THROUGH THE THING WE JUST ARRIVED AT ──────────────────────
  // A burn is hands-off from ignition: physics owns the ship, nothing steers
  // around anything, and the arrival standoff deliberately parks the demo a
  // couple of thousand units off a body big enough to be worth looking at. Fire
  // the next leg on a heading that still has that body in front of the nose and
  // the burn drives straight through it. Measured, run D: parked and lapping
  // 2,570-2,660 u off Atlantis Nebula Prime, the phase warped toward Nebula-4
  // and 2.5 s into the boost — "PLANETARY IMPACT — Ship destroyed by collision
  // with Atlantis Nebula Prime". Only the body we are actually standing next to
  // is tested (the staged subject), because that is the only one the standoff
  // rules put us close enough to hit before the burn has any spread.
  const _depTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  const _depFwd = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  function _departureBlocked() {
    if (typeof gameState === 'undefined' || typeof camera === 'undefined') return false;
    if (!_depTmp || !_depFwd) return false;
    const as = gameState._arrivalSubject;
    if (!as || !as.obj || !as.obj.position) return false;
    camera.getWorldDirection(_depFwd);
    _depTmp.subVectors(as.obj.position, camPos());
    const along = _depTmp.dot(_depFwd);
    // Behind us, or further than a burn can carry: not in the way.
    if (along <= 0 || along > _oWarpMaxBoostDist()) return false;
    const off = Math.sqrt(Math.max(0, _depTmp.lengthSq() - along * along));
    // Clear it by its own danger radius plus a ship-length of margin. Refusing
    // is cheap: the caller retries next frame and the demo is always moving, so
    // a blocked heading opens within a second or two of lap.
    //
    // ...AND BY AN ANGLE, NOT ONLY A DISTANCE, WHILE WE ARE STANDING AT IT.
    // At the arrival standoff the destination is a 30-degree object: a heading
    // that clears its danger radius by 300 u can still be pointed squarely at
    // its face. `off < 0.45 x range` is a ~24 degree cone, comfortably wider
    // than the ~30 degree body it is protecting, and it only applies inside 3x
    // the standoff — beyond that the burn has room to bend and the old
    // distance rule is the right one.
    //
    // MEASURED, this build: parked 1,947 u off Hyperion Nebula Prime, 34
    // degrees, dead centre, holding station — then followDiscoveryPath fired a
    // tactical W-jump straight down the boresight: 1,947 -> 1,455 -> 643 u in
    // two seconds at 14.9 u/frame, "PLANETARY IMPACT". The O-warp path was
    // already guarded here; the jump path was not, and it is the same mistake
    // with a different key.
    const _depNear = as._flown && as.stand && camPos().distanceTo(as.obj.position) < as.stand * 3;
    const _depClear = _depNear
      ? Math.max((as.dangerR || 0) + 300, _depTmp.length() * 0.45)
      : (as.dangerR || 0) + 300;
    return off < _depClear;
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

  // O-key emergency warp — full 15 s warp boost.  Uses a charge.
  // Preferred for crossing interstellar distances when no slingshot
  // planet is within reach.
  // `dest` (optional) is THIS leg's actual destination — the body or point
  // the phase decided to fly to. Every caller in this file has one in hand,
  // so pass it: a warp that knows where it is going can end ON its
  // destination (see the arrival cut-off in update()), while one that does
  // not can only run its stopwatch out into whatever happens to be ahead.
  function triggerOKeyWarp(dest) {
    if (!canEmergencyWarp()) return false;
    // NOT WHILE AN ARRIVAL IS STILL BEING LOOKED AT (see _parkOwnsBeat). This
    // has to be the FIRST thing the trigger does, ahead of _disarmWarpBurn()
    // below and the O key press at the bottom: a refusal that happened further
    // down would still have reset the live park's burn arming and still have
    // fired the warp. Returning false here is the whole leg deferred, which
    // every caller retries on the next frame.
    if (_parkOwnsBeat()) return _parkDefer('O-warp');
    // ...and not straight through the body we are parked next to (see
    // _departureBlocked). Same contract: false means "not this frame".
    if (_departureBlocked()) return false;
    // ARRIVAL SUBJECT: stage what this boost will actually reveal BEFORE
    // firing, so camera-system's exit framing, the orientation hold, and the
    // arrival cut-off all have a real body to converge on the instant the
    // tunnel starts collapsing.
    //
    // A DESTINATION IS A DIRECTION, NOT ALWAYS A LANDING SITE. The leg knows
    // where it is ultimately going, so that is the direction to search — but
    // ONE burn only covers ~7,200 u (see _oWarpBoostDist) while the demo's
    // nebula legs are 30,000-90,000 u. Round 2 staged the destination itself
    // unconditionally, which is why a subject 37,619 u away was claimed by a
    // burn that could carry the ship 7,200 u: the cut-off never came into
    // range, the stopwatch ended the leg in deep space, and the "arrival"
    // resolved on a 2.3-degree speck 30,510 u out (measured, this build).
    //
    // So resolve in two steps:
    //   1) if the burn can actually reach and stop at the destination's body,
    //      that body IS the arrival;
    //   2) otherwise take the best real body ON THE WAY that this burn can
    //      stop at — the leg still spends nearly its whole boost closing on
    //      the nebula, and it still ends ON something instead of nowhere.
    // Only when neither exists does the leg go subject-less and let the
    // stopwatch end it, which is the honest outcome for a hop across genuinely
    // empty space.
    let staged = false;
    // Every reachability test below is against the LONGEST burn that can be
    // armed, not the duration currently sitting in gameState. Round 3 asked
    // "can the fixed 7,200 u boost reach this?", which is the wrong question
    // and answered no for every destination the demo actually flies to: the
    // nebula primaries it aims at sit 20,000-90,000 u out, so the destination
    // clause rejected 100% of legs and the corridor clause searched a segment
    // containing (measured) 42 bodies and zero framable ones. The question
    // that decides an arrival is "can a burn be BUILT that reaches this?".
    const _boostDist = _oWarpMaxBoostDist();
    // Start from the stock duration each time so a leg that stages nothing
    // inherits nothing from the previous leg's arming.
    _disarmWarpBurn();
    if (dest) {
      const dp = dest.position || (dest.isVector3 ? dest : null);
      if (dp && _owarpFwdTmp && _owarpToTmp) {
        // Prefer a real renderable body at/near the destination (a waypoint
        // vector or a nebula centre is not itself something to look at); fall
        // back to the destination object itself when IT is the body.
        let cand = _findArrivalSubject(dp, 6000);
        if (!cand && (dest.geometry || (dest.userData && dest.userData.type))) {
          cand = {
            obj: dest,
            radius: (dest.geometry && dest.geometry.parameters && dest.geometry.parameters.radius) ||
              (dest.userData && dest.userData.size) || 20
          };
        }
        if (cand && cand.obj && cand.obj.position) {
          const so = _arrivalStandoff(cand.radius, _arrivalDangerR(cand.obj));
          const range = camPos().distanceTo(cand.obj.position);
          // No off-axis gate here, unlike the corridor search below: this is
          // the leg's OWN destination and the phase has already aimed at it
          // (the warp gate needs facing > 0.97) — adding a heading test here
          // only rejected legs whose destination was genuinely reachable,
          // measured as 14 consecutive legs staging nothing.
          // ...but a PLACE WE ARE ALREADY AT is not an arrival. The corridor
          // search below has always rejected candidates inside 1.3x their own
          // standoff; this clause did not, and measured it produced a whole
          // class of non-arrival: parked 929 u from a nebula prime whose
          // standoff is 2,129 u, the leg staged that prime, armed the 2,000 ms
          // floor, and the cut fired on the first frames with the subject
          // BEHIND the camera (ndc y = 0.985, behind: true, 56 deg). Five such
          // stutter-warps in one sampling run. If the destination is somewhere
          // we are already standing, fall through to the corridor search — it
          // may find a real body further down the leg, and if it does not the
          // leg goes honestly subject-less instead of claiming an arrival it
          // delivered before the burn started.
          if (so.framable && range > so.stand * 1.3 && _burnFits(range, so.stand)) {
            // THE BURN IS BUILT TO END HERE. _stageAndArm sets this warp's
            // boostDuration from the range so the stopwatch expires at the
            // standoff instead of somewhere short of it — which is what makes
            // the geometric cut-off in update() the primary terminator rather
            // than dead code the clock always beats.
            _stageAndArm(cand.obj, cand.radius);
            staged = true;
          }
        }
        if (!staged) {
          // Genuinely beyond even a maximum burn (the 30-90k legs) — search
          // the corridor toward it for the best body ON THE WAY that a burn
          // CAN be built to arrive at. The leg still spends its whole boost
          // closing on the destination, and it still ends ON something.
          _owarpFwdTmp.subVectors(dp, camPos());
          const _destRange = _owarpFwdTmp.length();
          if (_owarpFwdTmp.lengthSq() > 1e-6) {
            _owarpFwdTmp.normalize();
            // The segment searched is HERE → THE DESTINATION (plus 10 % so a
            // body just beyond the marker still counts as arriving at it), and
            // never further than one burn. See the range cap inside
            // _findArrivalSubjectAlongRay for what happened when it was
            // unbounded.
            const way = _findArrivalSubjectAlongRay(camPos(), _owarpFwdTmp,
              Math.min(_boostDist, _destRange * 1.1));
            if (way) { _stageAndArm(way.obj, way.radius); staged = true; }
          }
        }
      }
    }
    // No destination handed in AT ALL — fall back to the current heading,
    // which still refuses to claim a reveal in open space.
    //
    // Only when none was handed in. A leg that HAS a destination and could not
    // stage anything on the way to it must not go looking down the boresight
    // instead: the heading search is bounded only by the maximum burn, so on a
    // short leg it happily claims a body tens of thousands of units past the
    // place we are actually going — the same "not on the way" failure the
    // range cap in _findArrivalSubjectAlongRay fixes, arriving through the
    // back door. Such a leg has nowhere to arrive, and the refusal below is
    // the correct answer.
    if (!staged && !dest) staged = _stageOWarpArrivalSubject();

    // ── NO DESTINATION, NO IGNITION ──────────────────────────────────────────
    // This is the line that makes every clause above matter. Until it existed,
    // failing to stage anything did not stop the warp — it just fired one
    // without a subject, and a subject-less burn is a stopwatch pointed at
    // empty space: the arrival cut-off's guard (update(), :825) needs
    // `gameState._arrivalSubject`, so with none the cut, the extension, the
    // dead-band tiling and the arrival park are ALL unreachable and the leg can
    // only end by the clock running out, wherever that happens to be.
    //
    // MEASURED, this build, before this line: 8 of 8 and then 6 of 6 forced
    // O-warp legs staged nothing, ran a mean 8.5 s raw stopwatch, and logged
    // arrivalCuts 0 / arrivalExts 0 / arrivalParks 0. Those are not arrivals
    // with bad framing, they are burns with nowhere to arrive.
    //
    // Refusing is cheap and is NOT a stall: every caller (:1851, :2377, :2387,
    // :2596, :4092) reads false as "not this frame" and retries, and the travel
    // phase's own t > 8 s fallback hands the leg to a plain cruise rather than
    // waiting forever. What the refusal buys is that a warp charge is only ever
    // spent on a leg that has somewhere to end.
    // A LEFTOVER SUBJECT IS NOT A DESTINATION EITHER — the test is a subject
    // staged for THIS leg, or one still inside its own live window; anything
    // older is the previous arrival's handle and flying on it would aim this
    // burn at a place we already left.
    const _liveSubj = !!(gameState._arrivalSubject && gameState._arrivalSubject.obj &&
                         _arrivalSubjectFresh(gameState._arrivalSubject));
    if (!staged && !_liveSubj) {
      ap._warpNoSubjectRefusals = (ap._warpNoSubjectRefusals || 0) + 1;
      if (!ap._warpRefuseLoggedAt || Date.now() - ap._warpRefuseLoggedAt > 4000) {
        ap._warpRefuseLoggedAt = Date.now();
        console.log('🚫 WARP REFUSED — nothing stageable to arrive at (' +
          ap._warpNoSubjectRefusals + ' this run)');
      }
      _disarmWarpBurn();
      _clearArrivalSubject();   // no-op while a park owns the beat
      return false;
    }
    keys().o = true;
    setTimeout(() => { keys().o = false; }, 100);
    return true;
  }

  // Gravitational slingshot — simulate pressing Enter so the game's own
  // "SLINGSHOT READY" handler fires, then fall back to a direct call.
  function triggerSlingshot() {
    if (gameState.energy < 20) return false;
    if (gameState.slingshot && gameState.slingshot.active) return false;
    // The whip arc drives position on a rail and ignores keys, so firing one
    // during a park does not just replace the subject — it physically throws
    // the ship off the standoff the burn just bought. Defer (see
    // _parkOwnsBeat); callers already retry.
    if (_parkOwnsBeat()) return _parkDefer('slingshot');
    // FIX 1 — ARRIVAL SUBJECT: the slingshot is explicitly launched TOWARD
    // gameState.currentTarget (callers set it just before triggering, e.g.
    // "Aim target = the nebula" above) — resolve a real body near that aim
    // point so the whip's glide has a staged reveal too, same as the O-warp.
    if (gameState.currentTarget && gameState.currentTarget.position) {
      const _slCand = _findArrivalSubject(gameState.currentTarget.position, 3500);
      if (_slCand) _setArrivalSubject(_slCand.obj, _slCand.radius);
      else _clearArrivalSubject();
    }
    // Simulate Enter key press (same input a human player uses)
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
    }));
    // If the event handler fired, slingshot is now active
    if (gameState.slingshot && gameState.slingshot.active) return true;
    // Fallback: call executeSlingshot directly
    if (typeof executeSlingshot === 'function') {
      executeSlingshot();
      return !!(gameState.slingshot && gameState.slingshot.active);
    }
    return false;
  }

  // Legacy alias — callers that just need "any warp" can use this.
  // Prefers slingshot (if near planet), falls back to O-key warp.
  function triggerEmergencyWarp(dest) {
    if (!canEmergencyWarp()) return false;
    return triggerOKeyWarp(dest);
  }

  // Hide lasers after 400 ms by setting .visible = false.  This does NOT
  // touch scene.remove() or material.dispose() — we leave ALL disposal to
  // the game's native fade setInterval so we never race with it.
  const DEMO_BEAM_HIDE_MS = 200;
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

  // Count alive local-galaxy enemies (non-boss, non-guardian)
  function _countLocalEnemies() {
    if (typeof enemies === 'undefined') return 0;
    let count = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.userData || e.userData.health <= 0) continue;
      if (e.userData.isBoss || e.userData.isBossSupport || e.userData.isBlackHoleGuardian) continue;
      if (!e.userData.isLocal) continue;
      count++;
    }
    return count;
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

  function _nearestLocalEnemy() {
    if (typeof enemies === 'undefined') return null;
    const cp = camPos();
    let best = null, bestDist = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.userData || e.userData.health <= 0) continue;
      if (!e.userData.isLocal) continue;
      if (e.userData.isBoss || e.userData.isBossSupport || e.userData.isBlackHoleGuardian) continue;
      const d = cp.distanceTo(e.position);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  // ── DISCOVERY PATH ELIGIBILITY ────────────────────────────────────────
  // The old gate rejected any path whose endpoint sat more than 50,000 u
  // away. Real discovery paths in this world are 62k-142k units long
  // (measured live: 62,204 / 78,410 / 103,233 / 142,104), so that cap
  // rejected EVERY path the game has ever drawn — followDiscoveryPath
  // could never run, and since it is the ONLY route into
  // gotoBlackHoleGalaxy, the entire second act (black-hole warp, the Borg
  // set piece, the proc-gen outer systems) was unreachable in the demo.
  // The demo just looped nebula → orbit → 25 s timeout → warp forever.
  //
  // NOTE: do NOT re-gate this on galaxy. A path's userData.galaxyId is the
  // galaxy of the enemies it LEADS TO (createDiscoveryPathToPosition is
  // called with the target's galaxyId), not the one the player is standing
  // in — leading you to another galaxy's remnant forces is the entire point
  // of the mechanic ("Follow the amber line from Chronos Nebula. Finish
  // it."). Matching it against getCurrentGalaxyId() would reject every
  // genuine mission, which is the same dead end by another route.
  //
  // The precise guard is the ORIGIN test that's already here: a path is
  // ours when it starts at the nebula we're orbiting. Distance is kept only
  // as an absurd-value backstop.
  const MAX_PATH_ENDPOINT = 250000;

  // Discovery paths that ORIGINATE within originRadius of originPos and
  // still need following: not already followed by the demo, mission not
  // complete, endpoint not absurd.
  // Sorted by endpoint distance from the player, closest first.
  function eligibleDiscoveryPathsFrom(originPos, originRadius) {
    const out = [];
    const paths = (typeof window !== 'undefined' && window.discoveryPaths) || [];
    if (!ap._followedPathLines) ap._followedPathLines = [];
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      const ud = p && p.line && p.line.userData;
      if (!ud || !ud.startPosition || !ud.endPosition) continue;
      if (ud.missionComplete) continue;
      if (ap._followedPathLines.indexOf(p.line) >= 0) continue;
      if (originPos && ud.startPosition.distanceTo(originPos) > originRadius) continue;
      if (camPos().distanceTo(ud.endPosition) > MAX_PATH_ENDPOINT) continue;
      out.push(p);
    }
    out.sort((a, b) =>
      camPos().distanceTo(a.line.userData.endPosition) -
      camPos().distanceTo(b.line.userData.endPosition));
    return out;
  }

  // The actual nebula object closest to a position (any discovery state —
  // unlike nearestNebula(), which skips deep-discovered nebulas and so can
  // never find a nebula we already opened paths from).
  function _nebulaNearPosition(pos, radius) {
    if (typeof nebulaClouds === 'undefined' || !pos) return null;
    let best = null, bestD = radius || 6000;
    for (let i = 0; i < nebulaClouds.length; i++) {
      const n = nebulaClouds[i];
      if (!n || !n.userData) continue;
      const d = n.position.distanceTo(pos);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  // ── A LEG HAS TO GO SOMEWHERE ─────────────────────────────────────────────
  // `minDist` (optional) rejects candidates the ship is effectively already
  // at. 10,000 u is not a new number: it is the coast phase's own REWARP_RANGE
  // — the distance at which that phase declares "too far to cruise, warp" —
  // so anything INSIDE it is, by the demo's own definition, somewhere to fly
  // to on thrusters rather than to spend a warp charge on.
  //
  // WHY THIS EXISTS. Measured on this build, 6 consecutive forced O-warp legs:
  // the destination handed to the warp was 20, 396, 1,364, 1,536, 1,856 and
  // 2,685 u away — the demo was firing an interstellar warp at a nebula centre
  // it was ALREADY STANDING IN, because nearestNebula() is happy to return the
  // cloud the ship is inside. Nothing can be staged for such a leg (the
  // destination clause rejects candidates inside 1.3x their own standoff — a
  // place we are at is not an arrival), so every one of those legs went
  // subject-less, which is the state in which none of the arrival machinery
  // can run. The reach fix (EW_BOOST_SPEED_MAX) makes far destinations
  // reachable; this makes the demo actually PICK one.
  const TRAVEL_LEG_MIN_DIST = 10000;
  function nearestNebula(minDist) {
    if (typeof nebulaClouds === 'undefined') return null;
    const _min = minDist || 0;
    let best = null, bestDist = Infinity;
    nebulaClouds.forEach(n => {
      if (!n.userData || n.userData.deepDiscovered) return;
      const d = camPos().distanceTo(n.position);
      if (d < _min) return;
      if (d < bestDist) { bestDist = d; best = n; }
    });
    return best;
  }

  // Twin/clustered nebulas — the paired ones (not distant/exotic).
  // Each cluster index holds two nebulas; pick the cluster center
  // (average of the pair) as the warp destination so the boost
  // delivers the player into the middle of a twin formation.
  function nearestTwinNebula(minDist) {
    if (typeof nebulaClouds === 'undefined' || !nebulaClouds.length) return null;
    const _min = minDist || 0;
    const cp = camPos();
    // Group by cluster index
    const clusters = {};
    for (let i = 0; i < nebulaClouds.length; i++) {
      const n = nebulaClouds[i];
      if (!n || !n.userData) continue;
      if (n.userData.isDistant || n.userData.isExoticCore) continue;
      if (n.userData.deepDiscovered) continue;
      const ci = n.userData.cluster;
      if (ci === undefined || ci === null) continue;
      if (!clusters[ci]) clusters[ci] = [];
      clusters[ci].push(n);
    }
    let bestCenter = null, bestPair = null, bestDist = Infinity;
    for (const ci in clusters) {
      const pair = clusters[ci];
      if (pair.length < 2) continue; // Only true twins
      const center = new THREE.Vector3();
      pair.forEach(n => center.add(n.position));
      center.divideScalar(pair.length);
      const d = cp.distanceTo(center);
      if (d < _min) continue;   // a cluster we are already inside is not a leg
      if (d < bestDist) { bestDist = d; bestCenter = center; bestPair = pair; }
    }
    if (!bestCenter) return null;
    // Synthesize a target object the rest of the autopilot can consume.
    return {
      position: bestCenter,
      userData: {
        name: 'Twin Nebula (' + (bestPair[0].userData.name || '?') + ' / ' +
              (bestPair[1].userData.name || '?') + ')',
        isTwinCluster: true,
        pair: bestPair
      }
    };
  }

  function nearestBlackHole() {
    if (typeof planets === 'undefined') return null;
    // Prefer the local gateway for the first warp — it's the Sol system
    // exit.  After that, pick the nearest black hole from current position.
    const cp = camPos();
    let gateway = null, best = null, bestDist = Infinity;
    planets.forEach(p => {
      if (!p.userData || p.userData.type !== 'blackhole') return;
      if (p.userData.isLocalGateway) gateway = p;
      const d = cp.distanceTo(p.position);
      if (d < bestDist) { bestDist = d; best = p; }
    });
    const firstLeg = (ap.warpsUsed || 0) === 0;
    return (firstLeg && gateway) ? gateway : best;
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
    ap._originReturnActive = false; // warp invalidates any return trip
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

    // Shields + brake immediately on incoming fire
    if (typeof shieldSystem !== 'undefined' && !shieldSystem.active &&
        gameState.energy > 15 && window.activateShields) {
      window.activateShields();
    }
    keys().x = true;

    // Pivot to combat if we aren't already fighting this attacker
    const alreadyFighting = ap.phase === 'combat' && ap.combatTarget === target;
    if (!alreadyFighting) {
      ap.combatTarget = target;
      ap.combatMissileFired = false;
      if (ap.phase !== 'combat') {
        ap.returnPhase = ap.returnPhase || ap.phase || 'findLocalEnemies';
      }
      transmit('TACTICAL', 'Under fire! Shields up — engaging attacker.');
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
      _isOnScreen(target.position) &&          // never fire at off-screen attackers
      now - (ap._lastAmbushFire || 0) > 500;   // ~2 shots per second
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
      // If this enemy is render-interpolated (see game-core enemy block), shift
      // BOTH lerp endpoints by the same pull so the swarm motion rides along the
      // glide instead of being overwritten by interpolation next frame.
      if (e.userData._interp && e.userData._iFrom && e.userData._iTo) {
        e.userData._iFrom.addScaledVector(_swarmVec, pull);
        e.userData._iTo.addScaledVector(_swarmVec, pull);
      }
    }
  }

  // ─── Auto-read ALL incoming transmissions ──────────────────────────────
  // The game has TWO transmission UIs:
  //   1) game-controls.js: #incomingTransmissionPrompt (READ/SKIP buttons)
  //   2) game-objects.js:  #incomingTransmission (auto-fade text, no buttons)
  // We handle BOTH: click READ on the first type, and the second auto-fades.
  ap._seenPrompt = null;
  ap._seenPromptTime = 0;
  ap._seenUnderstood = null;
  ap._seenUnderstoodTime = 0;
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
      // Close the full alert 6 s after opening (was 2 s; tripled so
      // the viewer can actually read the lore the demo just opened).
      setTimeout(() => {
        const alertEl = document.getElementById('missionCommandAlert');
        if (alertEl) alertEl.classList.add('hidden');
        if (typeof gameState !== 'undefined') gameState.paused = false;
      }, 6000);
    }

    // Type 2: Auto-fade text from game-objects.js handles its own
    // timeout. Demo used to slam it to 1.5s; now 4.5s (3x) so demo
    // viewers can read it.
    const textTx = document.getElementById('incomingTransmission');
    if (textTx && !textTx._demoShortenSet) {
      textTx._demoShortenSet = true;
      setTimeout(() => {
        if (textTx) textTx.style.opacity = '0';
      }, 4500);
    }

    // Type 3: Mission Control galaxy-cleared alert ("N hostile galaxies
    // remain") with an UNDERSTOOD button. The demo clicks it 2 s after
    // it appears so the campaign progresses without a human.
    const understoodBtn = document.getElementById('missionCommandUnderstood');
    if (understoodBtn) {
      if (ap._seenUnderstood !== understoodBtn) {
        ap._seenUnderstood = understoodBtn;
        ap._seenUnderstoodTime = Date.now();
      } else if (Date.now() - ap._seenUnderstoodTime > 2000) {
        understoodBtn.click();
        ap._seenUnderstood = null;
        if (typeof gameState !== 'undefined') gameState.paused = false;
        if (typeof renderer !== 'undefined' && renderer && renderer.domElement) {
          renderer.domElement.style.cursor = 'none';
        }
      }
    } else {
      ap._seenUnderstood = null;
    }
  }

  function elapsed() {
    return Date.now() - ap.phaseStart;
  }

  function goPhase(name) {
    // ── A LIT BURN IS COMMITTED (see _burnCommitted) ─────────────────────────
    // Break-offs to combat are written for a ship that is flying: "a hostile
    // appeared, go fight it". During a warp burn the ship is doing 60-100
    // u/frame inside a tunnel and cannot fight anything — but the combat phase
    // still takes the stick and swings the nose onto the hostile, and warp
    // guidance (game-physics.js) rotates VELOCITY onto the nose, so the
    // break-off does not pause the leg, it destroys it.
    //
    // MEASURED, this build: a leg armed 13.4 s for Distant Nebula Zeta Prime
    // was converging perfectly — 73,460 u out, miss angle 11 deg -> 5.7 deg,
    // 12,000 u flown — when an intruder pulled the demo into 'combat' at
    // +1.7 s. The nose went 15 -> 40 -> 62 -> 88 deg off the subject, velocity
    // followed it, and the cut ended the burn on `blown` with the destination
    // still 61,475 u away at 1.16 deg. The hostile was never engaged either:
    // the phase flipped back the moment the burn ended.
    //
    // The leg is not cancelled, only deferred — every caller re-detects the
    // intruder on the next frame, and the burn is at most ~25 s long.
    if ((name === 'combat' || name === 'bossEngage') && _burnCommitted()) return;
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
    // Drop auto-aim lock and clear stale targets when leaving combat
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
    // Drop the discovery-path snapshot the moment we leave the follow
    // phase so a stale reference can't be reused on a later trigger.
    if (name !== 'followDiscoveryPath') {
      ap._followingPath = null;
    }
    // Re-arm the single emergency-warp shot each time the demo enters
    // the follow phase, so every new dotted-line mission gets one.
    if (name === 'followDiscoveryPath') {
      ap._followPathWarpFired = false;
      ap._tacticalMsgShown = false;
      // Re-measure the trip budget for THIS path (see phaseFollowDiscoveryPath).
      ap._followPathBudgetMs = 0;
    }
    // The origin-return trip is over once we're following the second
    // path — or abandoned if we picked a brand-new warp destination.
    if (name === 'followDiscoveryPath' || name === 'warpToNebulaCluster') {
      ap._originReturnActive = false;
    }
    // Fresh interstellar leg → re-evaluate the gravity-whip option
    if (name === 'warpToNebulaCluster') {
      ap._slingshotTried = false;
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
    ap.slingshotMisses = 0;
    ap.lastNebulaWarp = 0;
    ap._flightStyleKey = null;
    ap._flightStyleUntil = 0;
    ap._nextFlightStyleAt = 0;
    ap._bhSlingshotPlanet = null;
    ap._lastBHWarp = 0;
    ap._evadeUntil = 0;
    ap._evadeKey = null;
    ap._followingPath = null;
    ap._followedPathLines = [];
    ap._originReturnActive = false;
    ap._prevCombatTarget = null;
    ap._prevCombatDist = undefined;
    ap._followPathWarpFired = false;
    ap._tacticalMsgShown = false;
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
    // don't clear k.enter or k.o here — warp functions set them and clear via timeout
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
    // Suppress during any active warp — no toast/sound spam while warping
    if ((gameState.blackHoleWarp && gameState.blackHoleWarp.active) ||
        (gameState.slingshot && gameState.slingshot.active) ||
        (gameState.emergencyWarp && (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning))) return;
    const now = Date.now();
    const last = ap._lastNotify[title] || 0;
    if (now - last < NOTIFY_COOLDOWN_MS) return;
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
    // Mobile: bottom center, just above the fire button (action row is
    // bottom:20px + 64px tall → top edge 84px; 8px breathing room) —
    // clear of the top praise/notification band entirely. Desktop: bottom.
    const topOrBottom = isMobile ? 'bottom:92px' : 'bottom:10px';
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
      isMobile ? 'padding:5px 10px' : 'padding:6px 18px',
      'font-family:Orbitron,monospace',
      isMobile ? 'font-size:9px' : 'font-size:11px',
      'color:#00ff88',
      'text-align:center',
      pe,
      cursor,
      'text-shadow:0 0 8px rgba(0,255,136,0.8)',
      'box-shadow:0 0 20px rgba(0,255,136,0.3)',
      isMobile ? 'letter-spacing:1px' : 'letter-spacing:2px',
      isMobile ? 'min-width:0' : 'min-width:260px',
      isMobile ? 'max-width:56vw' : 'max-width:90vw',
      isMobile ? 'height:38px' : '',
      isMobile ? 'box-sizing:border-box' : '',
      isMobile ? 'display:flex' : '',
      isMobile ? 'align-items:center' : '',
      isMobile ? 'justify-content:center' : '',
      '-webkit-tap-highlight-color:transparent',
      'touch-action:manipulation',
    ].join(';');

    // Mobile: label-only panel, no target information.
    // Desktop: label + running status line (Pursuing X — 300 u, etc.).
    if (isMobile) {
      el.innerHTML = '<div id="demoPilotLabel" style="font-size:9px">DEMO · tap to take over</div>';
    } else {
      el.innerHTML = '<div id="demoPilotLabel" style="opacity:0.7;font-size:10px;margin-bottom:2px">DEMO AUTOPILOT · press T to take over</div><div id="demoPilotStatus">Initializing…</div>';
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

  // Lower-centre overlays that OWN the screen while they're up. The mission
  // command alert is anchored at top:78% and grows downward with its content,
  // so a long transmission runs straight over the demo HUD sitting at
  // bottom:10px (measured: 472x29 px of overlap, and the alert paints on top
  // at z-index 850 vs 500 — it swallowed "press T to take over" mid-beat).
  // The demo badge is persistent chrome and the transmission is a story beat,
  // so the badge yields for the couple of seconds the beat is on screen.
  const HUD_YIELD_TO = ['missionCommandAlert', 'incomingTransmission',
                        'incomingTransmissionPrompt'];

  function _hudBlockerVisible() {
    for (let i = 0; i < HUD_YIELD_TO.length; i++) {
      const el = document.getElementById(HUD_YIELD_TO[i]);
      if (!el || el.classList.contains('hidden')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (parseFloat(cs.opacity) < 0.05) continue;
      // Only yield if it actually reaches the badge.
      const hud = ap.hudEl;
      if (!hud) return true;
      const a = el.getBoundingClientRect(), b = hud.getBoundingClientRect();
      if (a.bottom > b.top - 8 && a.top < b.bottom && a.right > b.left && a.left < b.right) return true;
    }
    return false;
  }

  function tickHUD() {
    // Yield the lower-centre lane to comms/mission beats (both layouts).
    const hud = ap.hudEl || document.getElementById('demoPilotHUD');
    if (hud) {
      const yield_ = _hudBlockerVisible();
      if (yield_ !== ap._hudYielding) {
        ap._hudYielding = yield_;
        hud.style.transition = 'opacity .25s ease';
        hud.style.opacity = yield_ ? '0' : '1';
        // Keep the mobile tap-to-take-over target from swallowing taps
        // meant for the transmission's buttons while it's invisible.
        if (isMobileViewport()) hud.style.pointerEvents = yield_ ? 'none' : 'auto';
      }
    }
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
      if (label) label.textContent = (mobile ? 'PLAYER · ' : 'PLAYER CONTROL · ') + resumeText;
    } else {
      el.style.borderColor = 'rgba(0,255,136,0.5)';
      el.style.color = '#00ff88';
      el.style.textShadow = '0 0 8px rgba(0,255,136,0.8)';
      el.style.boxShadow = '0 0 20px rgba(0,255,136,0.3)';
      if (label) label.textContent = (mobile ? 'DEMO · ' : 'DEMO AUTOPILOT · ') + takeText;
    }
  }

  function removeHUD() {
    const el = document.getElementById('demoPilotHUD');
    if (el) el.remove();
    ap.hudEl = null;
    // A rebuilt badge starts fully visible — forget any yield we had
    // latched against the element we just destroyed.
    ap._hudYielding = undefined;
  }

  // ─── Expose update to game loop ────────────────────────────────────────────
  window.demoPilot.update = update;

  // ─── TEMP WARP DIAGNOSTIC (localStorage.warpdiag === '1') ─────────────────
  // Survives page reloads so a long demo run can be sampled across them.
  // Records every warp/jump cycle and, per frame of an active burn, which
  // clause of the arrival cut-off predicate holds. Zero cost when off.
  if (typeof window !== 'undefined' && window.localStorage &&
      localStorage.getItem('warpdiag') === '1') {
    const D = window.__warpdiag = { legs: [], triggers: [], cur: null, fs: null,
      prevTrans: false, prevAct: false, prevTR: null };
    // Instrumentation hooks, live only under the same flag. `unlockWarp` opens
    // the demo's own >=3-kill warp gate so a measurement session reaches the
    // interstellar legs without waiting out a dogfight at instrumented frame
    // rates; `warpTo` calls the production trigger directly so a specific
    // destination can be exercised. Neither changes how a warp behaves once
    // fired — the whole staging/arming/cut path is the shipping one.
    D.unlockWarp = function () { ap.enemiesKilled = Math.max(ap.enemiesKilled, 3); return ap.enemiesKilled; };
    D.warpTo = function (dest) { return triggerOKeyWarp(dest); };
    // Reach the interstellar legs without grinding out the FIRST-LEG dogfight.
    // findLocalEnemies only releases the demo to warpToNebulaCluster once the
    // Sol pocket is empty AND `warpsUsed > 0`; at instrumented frame rates that
    // is 15+ minutes of pirates before the first measurable warp. These skip
    // straight to the phase the demo would have reached on its own — the phase
    // then chooses its own destination, fires its own trigger and flies its own
    // leg, so what gets measured is the shipping path, only sooner.
    D.goPhase = function (p) { goPhase(p); return ap.phase; };
    D.ap = ap;
    // WHY DID THIS LEG STAGE NOTHING? Runs the staging rules over every body
    // in front of the ship and reports the first rule each one failed, using
    // the shipping helpers so the answer is the code's own, not a replica.
    D.census = function (destPos) {
      const from = camPos();
      const dir = destPos ? destPos.clone().sub(from).normalize() : (function () {
        const f = new THREE.Vector3(); camera.getWorldDirection(f); return f;
      })();
      const boostDist = _oWarpMaxBoostDist(), stopD = _oWarpStopDist();
      const rows = [];
      for (let i = 0; i < planets.length; i++) {
        const p = planets[i], ud = p && p.userData;
        if (!p || !p.position || !ud) continue;
        if (ud.type === 'asteroid' || ud.type === 'asteroidBelt') continue;
        const radius = (p.geometry && p.geometry.parameters && p.geometry.parameters.radius) || ud.size || 20;
        const to = p.position.clone().sub(from);
        const range = to.length();
        const cosA = to.dot(dir) / Math.max(1e-6, range);
        const so = _arrivalStandoff(radius, _arrivalDangerR(p));
        const off = range * Math.sqrt(Math.max(0, 1 - cosA * cosA)), along = range * cosA;
        let why = 'PASS';
        if (!so.framable) why = 'notFramable';
        else if (range <= so.stand * 1.3) why = 'tooClose';
        else if (!_burnFits(range, so.stand)) why = 'tooFar';
        else if (cosA < _ARRIVAL_CONE_COS) why = 'outOfCone';
        else if (along < off + _ARRIVAL_TURN_RADIUS) why = 'turnDoesNotFit';
        rows.push({ n: ud.name || ud.type, r: Math.round(radius), range: Math.round(range),
          deg: +(Math.acos(Math.max(-1, Math.min(1, cosA))) * 180 / Math.PI).toFixed(1),
          stand: Math.round(so.stand), maxOff: Math.round(so.maxOff), dangerR: Math.round(_arrivalDangerR(p)),
          framable: so.framable, why: why });
      }
      rows.sort((a, b) => a.range - b.range);
      const tally = {};
      rows.forEach(r => { tally[r.why] = (tally[r.why] || 0) + 1; });
      // `reach` is the set the DESTINATION clause of triggerOKeyWarp would
      // accept — framable and inside a buildable burn — with no heading test,
      // because that clause has none (the phase aims first).
      const reach = rows.filter(r => r.framable && r.why !== 'tooClose' && r.why !== 'tooFar')
                        .sort((a, b) => b.r - a.r).slice(0, 8);
      return { boostDist: Math.round(boostDist), tally: tally,
        pass: rows.filter(r => r.why === 'PASS').slice(0, 8),
        reach: reach,
        // The nearest bodies that could be arrivals AT ALL, whatever the burn
        // can do — the set whose distances decide how far a burn has to be
        // able to fly. Their being 22,224 u+ out on every measured leg is what
        // proved the reach ceiling (not the cone, not the framing rules) was
        // the thing starving the whole arrival path.
        framNear: rows.filter(r => r.framable).slice(0, 8),
        nearest: rows.slice(0, 12) };
    };
    D.state = function () {
      const ew = gameState.emergencyWarp, as = gameState._arrivalSubject;
      return { phase: ap.phase, kills: ap.enemiesKilled, cuts: ap._arrivalCuts || 0,
        boostDuration: Math.round(ew.boostDuration), base: ew._baseBoostDuration,
        subject: _nm(as && as.obj), available: ew.available };
    };
    const _v = () => new THREE.Vector3();
    const _nm = (o) => o ? ((o.userData && (o.userData.name || o.userData.type)) || o.name || 'unnamed') : null;
    function _pred() {
      const ew = gameState.emergencyWarp, as = gameState._arrivalSubject;
      const c = { hasSubject: !!(as && as.obj && as.obj.position), active: !!(ew && ew.active),
        notJump: !!(ew && !ew.isJump), fresh: _arrivalSubjectFresh(as) };
      c.guardPass = c.hasSubject && c.active && c.notJump && c.fresh;
      if (c.hasSubject) {
        const f = _v(); camera.getWorldDirection(f);
        const to = _v().subVectors(as.obj.position, camera.position);
        c.along = to.dot(f);
        c.off = Math.sqrt(Math.max(0, to.lengthSq() - c.along * c.along));
        const sp = gameState.velocityVector ? gameState.velocityVector.length() : 0;
        c.lead = 0.35 * sp * 60;
        c.rangePass = c.along > 0 && c.along <= as.arriveDist + c.lead;
        c.conePass = c.off <= as.arriveDist * 0.35;
      }
      return c;
    }
    // Legs accumulate in localStorage so a run can be sampled ACROSS the
    // page reloads a long demo session goes through.
    try { D.legs = JSON.parse(localStorage.getItem('warpdiag_legs') || '[]'); } catch (e) { D.legs = []; }
    D.save = function () {
      try { localStorage.setItem('warpdiag_legs', JSON.stringify(D.legs.slice(-40))); } catch (e) {}
    };
    const _D2R = Math.PI / 180;
    // What the acceptance test actually asks: is this body inside the central
    // third of frame, and how many degrees does it subtend?
    function _frameRead(obj, radius) {
      if (!obj || !obj.position) return null;
      const n = obj.position.clone().project(camera);
      const dist = camera.position.distanceTo(obj.position);
      return { dist: Math.round(dist),
        ndc: { x: +n.x.toFixed(3), y: +n.y.toFixed(3) },
        behind: n.z > 1,
        central: n.z <= 1 && Math.abs(n.x) <= 1 / 3 && Math.abs(n.y) <= 1 / 3,
        deg: +(2 * Math.atan((radius || 20) / Math.max(1, dist)) / _D2R).toFixed(2) };
    }
    D.frame = function () {
      try {
        if (typeof gameState !== 'undefined' && gameState.emergencyWarp && typeof camera !== 'undefined') {
          const ew = gameState.emergencyWarp, as = gameState._arrivalSubject;
          const trans = !!ew.transitioning, act = !!ew.active;
          if (trans && !D.prevTrans) {
            D.triggers.push({ kind: ew.isJump ? 'JUMP' : 'OWARP', at: Date.now(),
              subjectAtTrigger: !!(as && as.obj), subjName: _nm(as && as.obj) });
          }
          if (act && !D.prevAct) {
            const L = D.triggers[D.triggers.length - 1];
            if (L) { L.burn = true; L.isJumpAtBurn = !!ew.isJump; L.subjectAtBurn = !!(as && as.obj); }
            D.cur = { startedAt: Date.now(), isJump: !!ew.isJump,
              // The burn this leg was ARMED for, and the subject it was armed
              // to arrive at — the two things round 3 never had.
              armedMs: Math.round(ew.boostDuration),
              subj: _nm(as && as.obj), subjRadius: as ? as.radius : null,
              subjStand: as ? Math.round(as.stand) : null,
              subjMaxOff: as ? Math.round(as.maxOff) : null,
              range0: (as && as.obj) ? Math.round(camera.position.distanceTo(as.obj.position)) : null,
              cuts0: ap._arrivalCuts || 0, off: [], ramp: [] };
            D.fs = { frames: 0, hasSubject: 0, notJump: 0, fresh: 0, guardPass: 0 };
          }
          if (act) {
            const c = _pred(), s = D.fs;
            if (s) { s.frames++;
              if (c.hasSubject) s.hasSubject++;
              if (c.notJump) s.notJump++;
              if (c.fresh) s.fresh++;
              if (c.guardPass) s.guardPass++; }
            // Convergence trace at ~4 Hz: the perpendicular miss of the burn.
            if (D.cur && as && as.obj && gameState.velocityVector) {
              const now = Date.now();
              if (!D.cur._lastOff || now - D.cur._lastOff > 250) {
                D.cur._lastOff = now;
                const v = gameState.velocityVector, sp = v.length();
                if (sp > 1e-3) {
                  const d = _v().copy(v).normalize();
                  const to = _v().subVectors(as.obj.position, camera.position);
                  const al = to.dot(d);
                  D.cur.off.push({ dt: now - D.cur.startedAt, tr: Math.round(ew.timeRemaining),
                    along: Math.round(al), off: Math.round(Math.sqrt(Math.max(0, to.lengthSq() - al * al))) });
                }
              }
            }
          }
          if (!act && D.prevAct && D.cur) {
            const c = _pred(), L = D.cur;
            L.endedAt = Date.now(); L.durMs = L.endedAt - L.startedAt; L.fs = D.fs;
            L.exitAlong = c.along != null ? Math.round(c.along) : null;
            L.exitOff = c.off != null ? Math.round(c.off) : null;
            L.exitSubj = _nm(as && as.obj);
            // AUTHORITATIVE cut proof: the counter the cut itself increments,
            // not an inference from the clock.
            L.cutFired = (ap._arrivalCuts || 0) > (L.cuts0 || 0);
            L.cutRecord = ap._lastArrivalCut || null;
            L.trBeforeExit = D.prevTR != null ? Math.round(D.prevTR) : null;
            L.exitFrame = as ? _frameRead(as.obj, as.radius) : null;
            D.cur = null; D.fs = null;
            // Ramp monotonicity + the settle read 2.5 s later, when the
            // streaks have finished and the player is looking at the arrival.
            const _as2 = as, t0 = Date.now();
            let k = 0;
            (function ramp() {
              let env = null, tun = null;
              try { const vv = (window.__vfDebug && window.__vfDebug()) || {};
                env = vv.streakEnv != null ? +vv.streakEnv.toFixed(4) : null;
                tun = vv.tunnel != null ? +vv.tunnel.toFixed(4) : null; } catch (e) {}
              L.ramp.push({ dt: Date.now() - t0, env: env, tun: tun,
                fov: +camera.fov.toFixed(2),
                sp: +(gameState.velocityVector ? gameState.velocityVector.length() : 0).toFixed(2),
                // The acceptance clause is "in the central third at >= 15 deg
                // WHEN THE STREAKS COMPLETE", so the framing has to be sampled
                // along the drain, not only at the cut and 3 s later.
                fr: _as2 ? _frameRead(_as2.obj, _as2.radius) : null });
              if (++k < 12) setTimeout(ramp, 250);
              else {
                L.settle = _as2 ? _frameRead(_as2.obj, _as2.radius) : null;
                D.legs.push(L); D.save();
              }
            })();
          }
          D.prevTrans = trans; D.prevAct = act; D.prevTR = ew.timeRemaining;
        }
      } catch (e) { D.err = String(e); }
      requestAnimationFrame(D.frame);
    };
    requestAnimationFrame(D.frame);
    console.log('🔬 warpdiag armed (' + D.legs.length + ' legs carried over)');
  }

  console.log('🤖 autopilot.js loaded');
})();
