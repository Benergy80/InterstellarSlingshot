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
    get phase() { return ap.phase; }
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
        if (triggerOKeyWarp()) {
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
      if (dist <= 500 && gameState.emergencyWarp && gameState.emergencyWarp.active &&
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

    // Lock in the destination on first entry. Right after Sol/Sag A is
    // liberated, follow the WHITE path to the game's designated FIRST twin
    // set (firstTwinNebulaTarget); otherwise prefer the nearest twin
    // (clustered) pair, falling back to the nearest single nebula.
    if (!ap.currentNebula) {
      const twin = firstTwinNebulaTarget() || nearestTwinNebula();
      ap.currentNebula = twin || nearestNebula();
      if (!ap.currentNebula) { setStatus('No nebula in range — waiting'); return; }
      if (ap.currentNebula.userData && ap.currentNebula.userData._whitePathTarget) {
        transmit('NAVIGATION', 'Following the white path to the first twin nebula set.');
      }
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
      warpAligned = _coneFwd.dot(_coneVec) > 0.85;
    }

    setStatus(warpAligned
      ? ('EMERGENCY WARP → ' + targetName)
      : ('Aligning for warp → ' + targetName));

    keys().w = true;
    if (warpAligned && t > 1200 && canEmergencyWarp() && triggerOKeyWarp()) {
      ap.warpStartedAt = Date.now();
      ap.warpsUsed++;
      goPhase('coastToNebulaCluster');
      return;
    }

    // Hard fallback — punch the warp even if alignment never settles
    // (extended window when a slingshot approach was in progress)
    if (t > (ap.slingshotPlanet ? 16000 : 8000)) {
      if (canEmergencyWarp()) triggerOKeyWarp();
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
        if (triggerOKeyWarp()) {
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

    const dist = camPos().distanceTo(nebCenter);
    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;

    // Approach the nebula, then orbit at a fixed radius around the center.
    const ORBIT_RADIUS = 500;
    if (dist > ORBIT_RADIUS + 200) {
      setStatus('Approaching nebula center — ' + (dist | 0) + ' u');
      flyToward(ap.orbitTarget, 1.6);
    } else {
      // Orbit: aim at a slowly-rotating offset point ORBIT_RADIUS from the
      // center. Thrusting toward a moving point produces a stable lap.
      if (!ap._orbitAngle) ap._orbitAngle = Math.random() * Math.PI * 2;
      ap._orbitAngle += 0.012; // ~0.7 rad/s at 60fps — slow, photogenic
      if (!ap._lapDummy) ap._lapDummy = { position: new THREE.Vector3(), userData: { name: 'Nebula Orbit' } };
      ap._lapDummy.position.set(
        nebCenter.x + Math.cos(ap._orbitAngle) * ORBIT_RADIUS,
        nebCenter.y,
        nebCenter.z + Math.sin(ap._orbitAngle) * ORBIT_RADIUS
      );
      setStatus('Orbiting nebula center — scanning for discovery path');
      if (window.orientTowardsTarget) window.orientTowardsTarget(ap._lapDummy);
      // Gentle thrust to maintain lap speed; brake if we're sprinting
      if (speed > 1.6) keys().x = true;
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
    // Prefer the path snapshot taken when this transition was triggered.
    // discoveryPaths is never pruned, so [length-1] can drift to a path
    // from a different galaxy that was created mid-flight.
    let path = ap._followingPath || null;
    if (!path || !path.line || !path.line.userData) {
      const paths = window.discoveryPaths || [];
      path = paths.length > 0 ? paths[paths.length - 1] : null;
    }
    const endPos = path && path.line && path.line.userData && path.line.userData.endPosition;

    // Guard against runaway chases: if the snapshotted path's endpoint is
    // unreasonably far (stale path slipped through, or the snapshot got
    // cleared and we fell back to a foreign [length-1]), abort to a fresh
    // nebula warp instead of flying to the edge of the universe.
    if (endPos && camPos().distanceTo(endPos) > 50000) {
      ap._followingPath = null;
      goPhase('warpToNebulaCluster');
      return;
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

    // Safety timeout
    if (t > 60000) goPhase('warpToNebulaCluster');
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

    // 4) Stopping-distance control: speed*35 is the ~X-brake coast length
    //    (0.975/frame combined brake from speed v needs ≈35·v units), so
    //    braking starts exactly when continuing would overshoot the radius.
    const stopDist = arriveRadius + speed * 35;
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
    const _warpMinDist = approachRange ? approachRange + 12000 : 8000;
    if (allowWarp && dist > _warpMinDist && facing > 0.9 && canEmergencyWarp() &&
        Date.now() - (ap._lastBHWarp || 0) > 20000) {
      if (triggerOKeyWarp()) {
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
    const _jumpGap = approachRange ? (dist - approachRange) : (dist - 700);
    if (allowJump && dist > 1200 && _jumpGap > 500 && dist < jumpMaxDist && speed < 4 &&
        facing > 0.9 && gameState.energy > 25 &&
        Date.now() - (ap._lastJumpTap || 0) > 5000) {
      ap._lastJumpTap = Date.now();
      gameState._pendingJumpMs = Math.min(6000, Math.max(700, _jumpGap * 1.0));
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
    if (now - ap.lastFire > _demoFireCooldownMs(1000) && gameState.weapons.cooldown <= 0 && gameState.weapons.energy >= 10) {
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

  // Demo rate-of-fire ramps up with campaign progress: each galaxy the
  // player liberates shaves the laser cooldown a little, so after all 8
  // the demo fires much more rapidly than at game start — but not insanely.
  // 0 cleared → 1.00× cooldown (base); 8 cleared → 0.9^8 ≈ 0.43× (≈2.3×
  // the starting fire rate), in eight small ~10% steps.
  function _demoFireCooldownMs(baseMs) {
    const cleared = Math.max(0, Math.min(8,
      (typeof gameState !== 'undefined' && gameState.galaxiesCleared) || 0));
    return baseMs * Math.pow(0.9, cleared);
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
    if (now - (ap.lastFire || 0) < _demoFireCooldownMs(1000)) return;
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
    // Belt asteroids are instanced — the proxy isn't a raycastable mesh, so
    // confirm the crosshair is on an asteroid via the instancer raycast
    // (fire on any belt asteroid under the crosshair; fireWeapon re-resolves
    // the exact one). Fall back to a mesh raycast for non-instanced ones.
    let onTarget;
    if (target.isAsteroidProxy && typeof window !== 'undefined' && window.asteroidInstancer) {
      onTarget = !!window.asteroidInstancer.raycast(ray);
    } else {
      onTarget = ray.intersectObjects([target], true).length > 0;
    }
    if (!onTarget) return;

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

  // O-key emergency warp — full 15 s warp boost.  Uses a charge.
  // Preferred for crossing interstellar distances when no slingshot
  // planet is within reach.
  function triggerOKeyWarp() {
    if (!canEmergencyWarp()) return false;
    keys().o = true;
    setTimeout(() => { keys().o = false; }, 100);
    return true;
  }

  // Gravitational slingshot — simulate pressing Enter so the game's own
  // "SLINGSHOT READY" handler fires, then fall back to a direct call.
  function triggerSlingshot() {
    if (gameState.energy < 20) return false;
    if (gameState.slingshot && gameState.slingshot.active) return false;
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
  function triggerEmergencyWarp() {
    if (!canEmergencyWarp()) return false;
    return triggerOKeyWarp();
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

  // Discovery paths that ORIGINATE within originRadius of originPos and
  // still need following: not already followed by the demo, mission not
  // complete, endpoint within sane reach (50k — beyond that the path is
  // stale or points at a galaxy we should reach by black hole instead).
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
      if (camPos().distanceTo(ud.endPosition) > 50000) continue;
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

  // Twin/clustered nebulas — the paired ones (not distant/exotic).
  // Each cluster index holds two nebulas; pick the cluster center
  // (average of the pair) as the warp destination so the boost
  // delivers the player into the middle of a twin formation.
  // After Sol/Sag A liberation the game draws a WHITE path from Sag A to the
  // nearest twin-nebula pair (findNearestTwinNebulaCenter measured from the
  // origin). The demo should FOLLOW that white path to that specific first
  // set — not wander to whichever twin is closest to its own position.
  // Returns a synthetic twin-cluster target at the white path's destination
  // while that pair is still uncharted; null once it's discovered or before
  // liberation, so the demo then picks up the nearest twin normally.
  function firstTwinNebulaTarget() {
    if (typeof window === 'undefined' || !window.liberationNebulaPath) return null; // Sag A not clear yet
    if (typeof nebulaClouds === 'undefined' || !nebulaClouds.length) return null;
    const origin = new THREE.Vector3(0, 0, 0); // Sagittarius A*
    const clusters = {};
    for (let i = 0; i < nebulaClouds.length; i++) {
      const n = nebulaClouds[i];
      if (!n || !n.userData) continue;
      if (n.userData.isDistant || n.userData.isExoticCore) continue;
      const ci = n.userData.cluster;
      if (ci === undefined || ci === null) continue;
      (clusters[ci] = clusters[ci] || []).push(n);
    }
    let bestPair = null, bestCenter = null, bestDist = Infinity;
    for (const ci in clusters) {
      const pair = clusters[ci];
      if (pair.length < 2) continue;
      const center = new THREE.Vector3();
      pair.forEach(n => center.add(n.position));
      center.divideScalar(pair.length);
      const d = origin.distanceTo(center);
      if (d < bestDist) { bestDist = d; bestCenter = center; bestPair = pair; }
    }
    if (!bestPair) return null;
    // First set fully charted → stop overriding; move on to the next twin.
    if (bestPair.every(n => n.userData.deepDiscovered)) return null;
    return {
      position: bestCenter,
      userData: {
        name: 'First Twin Nebula (' + (bestPair[0].userData.name || '?') + ' / ' +
              (bestPair[1].userData.name || '?') + ')',
        isTwinCluster: true, pair: bestPair, _whitePathTarget: true
      }
    };
  }

  function nearestTwinNebula() {
    if (typeof nebulaClouds === 'undefined' || !nebulaClouds.length) return null;
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
      now - (ap._lastAmbushFire || 0) > _demoFireCooldownMs(500);   // ~2 shots/s, faster per liberation
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
