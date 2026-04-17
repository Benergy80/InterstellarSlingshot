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

  // ─── Start / Stop ─────────────────────────────────────────────────────────
  function start() {
    if (ap.active) return;
    console.log('🤖 DEMO AUTOPILOT engaged');
    ap.active = true;
    resetFlags();
    goPhase('init');
    buildHUD();
    ensureThirdPerson();

    // Demo defaults: auto-leveling + mouse auto-aim ON
    if (typeof gameState !== 'undefined') {
      gameState.autoLevelingEnabled = true;
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
    removeHUD();
    document.removeEventListener('keydown', onKeyDown);
    console.log('🤖 DEMO AUTOPILOT disengaged');
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { stop(); return; }

    // Ignore shortcuts while typing into an input/textarea
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // T toggles player takeover (T again returns to autopilot)
    if (!e.repeat && (e.key === 't' || e.key === 'T')) {
      toggleTakeover();
      return;
    }
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
    if (fc % 60 === 0) { buffEnemiesForDemo(); buffEnemySpeed(); }
    if (fc % 6 === 0)  { preemptiveShields(); }
    autoReadAnyTransmission();
    hideStaleLasers();
    swarmEnemiesNearPlayer();

    // Clear movement keys each frame; we set what we need below
    releaseMovementKeys();

    // ── Crosshair auto-fire ─────────────────────────────────────────────
    // Whenever the game's targeting system has locked onto a live enemy
    // inside the forward mouse-aim cone, pull the laser trigger.  When the
    // lock disengages (enemy dead / moves out of cone / lock cleared) the
    // firing stops automatically.  Runs parallel to phase logic so combat,
    // pursuit and travel all benefit from it.
    autoFireOnTargetLock();

    // Dispatch
    switch (ap.phase) {
      case 'init':                     phaseInit();                   break;
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
    if (elapsed() > 3000) {
      ensureThirdPerson();
      ap.segmentKills = 0;
      ap.returnPhase = 'findLocalEnemies';
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

    // First preference: an enemy the Navigation System has locked on to
    const detected = navDetectedEnemy();
    if (detected) {
      const d = camPos().distanceTo(detected.position);
      setStatus('NAV target: ' + (detected.userData.name || 'hostile') + ' · ' + (d | 0));
      // Lock it on the navigation panel so viewers see the attraction
      gameState.currentTarget = detected;
      if (gameState.targetLock) {
        gameState.targetLock.active = true;
        gameState.targetLock.target = detected;
      }
      // Fly toward it aggressively
      flyToward(detected.position, 2.5);
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
      flyToward(farEnemy.position, 2.5);
      return;
    }

    // Nothing on sensors — drift forward and demonstrate planet targeting
    // by cycling nearby planets on the nav panel.
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
      // Clear the reference so we don't re-notify this same object if the
      // game hasn't spliced it out yet
      ap.combatTarget = null;
      // Drop shields as soon as the fight ends
      ensureShieldsFor('travel');

      // From first segment, advance to nebula warp once 3 kills logged
      if (ap.returnPhase === 'findLocalEnemies' && ap.segmentKills >= 3) {
        ap.segmentKills = 0;
        goPhase('warpToNebulaCluster');
      } else {
        goPhase(ap.returnPhase || 'findLocalEnemies');
      }
      return;
    }

    const dist = camPos().distanceTo(enemy.position);
    // Use the enemy's own firing range — that's how close we need to be for
    // a proper dog-fight (enemy fires back at us, we fire at them).
    const engageRange = enemy.userData.firingRange || 500;

    if (dist > engageRange) {
      setStatus('Pursuing ' + (enemy.userData.name || 'hostile') + ' — ' + (dist | 0) + ' u');
      flyToward(enemy.position, 2.5);
    } else {
      setStatus('Engaging ' + (enemy.userData.name || 'hostile') + ' — in weapons range');
      flyToward(enemy.position, 0.8);
    }

    // Orient + lock so auto-fire can engage when we're inside range
    const aimDummy = { position: enemy.position };
    if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);
    gameState.targetLock.active = true;
    gameState.targetLock.target = enemy;
    gameState.currentTarget = enemy;

    // Occasional missile fire — every ~7 s while inside engagement range.
    // No transmission; status-line only keeps the HUD quiet.
    if (dist <= engageRange && gameState.missiles.current > 0 &&
        Date.now() - (ap._lastMissileTime || 0) > 7000) {
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

  // ─── 2) Emergency warp toward a nebula cluster ────────────────────────────
  function phaseWarpToNebulaCluster() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();

    // Any hostile on the nav system — break off and engage
    const intruder = navDetectedEnemy();
    if (intruder && !gameState.emergencyWarp.active && !gameState.emergencyWarp.transitioning) {
      ap.combatTarget = intruder;
      ap.combatMissileFired = false;
      ap.returnPhase = 'warpToNebulaCluster';
      goPhase('combat');
      return;
    }

    setStatus('Plotting course to nebula cluster…');

    if (!ap.currentNebula) {
      const neb = nearestNebula();
      if (!neb) {
        // No nebula found — skip ahead
        goPhase('gotoBlackHoleGalaxy');
        return;
      }
      ap.currentNebula = neb;
      transmit('SCIENCE OFFICER', 'Nebula cluster detected — ' + (neb.userData.name || 'Unknown Nebula') +
        '\nEngaging emergency warp drive for rapid transit.');
    }

    // Showcase planet targeting while plotting the course — cycle through
    // nearby planets on the Navigation System so viewers see the target list
    cycleScanTarget();

    // Face the nebula, then punch emergency warp
    const dummy = { position: ap.currentNebula.position };
    if (window.orientTowardsTarget) window.orientTowardsTarget(dummy);
    keys().w = true;

    if (t > 1500 && canEmergencyWarp()) {
      setStatus('EMERGENCY WARP — ENGAGING');
      transmit('PROPULSION', 'Emergency warp drive engaged!\nBrace for hyperspace jump.');
      if (triggerEmergencyWarp()) {
        ap.warpsUsed++;
        ap.warpStartedAt = Date.now();
        goPhase('coastToNebulaCluster');
      }
    }

    // Safety: if warp somehow fails (or still gated), just fly there normally
    if (t > 6000) {
      goPhase('coastToNebulaCluster');
    }
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

    // As we enter the nebula cluster area, brake at the galaxy's asteroid belt if nearby
    const belt = nearestAsteroidBelt();
    if (belt) {
      const beltCenter = belt.userData.blackHolePosition || belt.position;
      const beltRadius = belt.userData.radius || 2000;
      const distToBelt = camPos().distanceTo(beltCenter);
      if (distToBelt < beltRadius * 1.8) {
        setStatus('Entering cluster perimeter — braking');
        if (!ap.brakingAfterWarp) {
          ap.brakingAfterWarp = true;
          transmit('NAVIGATION', 'Entering nebula cluster perimeter.\nReducing velocity for system operations.');
          ensureThirdPerson();
        }
        keys().x = true;
      }
    }

    // Close to nebula — move to orbit phase
    if (distToNebula < 3500 && speed < 1.5) {
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

    // Fly to target and orbit slowly
    if (ap.orbitTarget) {
      const dist = camPos().distanceTo(ap.orbitTarget.position);
      const radius = Math.max(((ap.orbitTarget.userData && ap.orbitTarget.userData.radius) || 20) * 6, 180);
      if (dist > radius * 2.2) {
        setStatus('Approaching ' + (ap.orbitTarget.userData.name || 'planet'));
        flyToward(ap.orbitTarget.position, 1.2);
      } else {
        setStatus('Slow orbit — ' + (ap.orbitTarget.userData.name || 'planet'));
        orbitAround(ap.orbitTarget.position, radius);
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
      flyToward(ap.currentBH.position, 2.5);
    } else {
      // Close to event horizon — switch to warp phase (physics takes over)
      setStatus('Event horizon — initiating warp');
      goPhase('blackHoleWarp');
    }
  }

  // ─── 6) Black hole warp → coast → fight more enemies ─────────────────────
  function phaseBlackHoleWarp() {
    const t = elapsed();
    ensureShieldsFor('travel');

    if (ap.currentBH) {
      const dist = camPos().distanceTo(ap.currentBH.position);
      if (dist > 120) {
        setStatus('Diving into event horizon');
        flyToward(ap.currentBH.position, 3.0);
      } else {
        setStatus('WARPING — destination unknown');
      }
    }

    // Physics runs the actual warp.  When we're suddenly very fast, we've warped.
    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
    if (speed > 3 || t > 6000) {
      ap.currentBH = null;
      ap.brakingAfterWarp = false;
      ap.warpsUsed++;
      ap.warpStartedAt = Date.now();
      goPhase('coastAfterWarp');
    }
  }

  function phaseCoastAfterWarp() {
    const t = elapsed();
    ensureShieldsFor('travel');
    ensureThirdPerson();

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

    if (inLockedCoast) {
      setStatus('Warp coast — ' + Math.max(0, ((coastLockUntil - Date.now()) / 1000)).toFixed(0) + 's remaining');
      cycleScanTarget();
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
      if (dist > 800) flyToward(target.position, 2.0);
      else            flyToward(target.position, 0.8);

      const engageRange = (target.userData && target.userData.firingRange) || 500;
      const aimDummy = { position: target.position };
      if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);
      gameState.targetLock.active = true;
      gameState.targetLock.target = target;
      gameState.currentTarget = target;

      // Occasional missile every ~7 s — no transmission
      if (dist <= engageRange && gameState.missiles.current > 0 &&
          Date.now() - (ap._lastMissileTime || 0) > 7000) {
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

  // Reusable vector to avoid per-frame allocation
  const _flyVec = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  const _flyDummy = { position: null };

  function flyToward(pos, speedMult) {
    speedMult = speedMult || 1.0;
    let target;
    if (pos && pos.position) { target = pos.position; }
    else if (pos && pos.isVector3) { target = pos; }
    else if (_flyVec) { target = _flyVec.set(pos.x || 0, pos.y || 0, pos.z || 0); }
    else { return; }
    _flyDummy.position = target;
    if (window.orientTowardsTarget) window.orientTowardsTarget(_flyDummy);
    const k = keys();
    k.w = true;
    if (speedMult > 1.5) k.b = true;
  }

  function orbitAround(centerPos, radius) {
    ap.orbitAngle += 0.005;
    const orbitPoint = new THREE.Vector3(
      centerPos.x + Math.cos(ap.orbitAngle) * radius,
      centerPos.y + Math.sin(ap.orbitAngle * 0.3) * (radius * 0.2),
      centerPos.z + Math.sin(ap.orbitAngle) * radius
    );
    flyToward(orbitPoint, 1.0);
    // Gentle strafe to maintain orbit feel
    const k = keys();
    k.d = (Math.sin(ap.orbitAngle) > 0);
    k.a = (Math.sin(ap.orbitAngle) <= 0);
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

    // Set target lock for auto-aim (enemies only — fireWeapon excludes asteroids from lock)
    if (target.userData && target.userData.type !== 'asteroid') {
      gameState.targetLock.active = true;
      gameState.targetLock.target = target;
      gameState.currentTarget = target;
    }

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

    if (!isInFiringCone(tgt, engageRange + 100)) return;

    const now = Date.now();
    if (now - (ap.lastFire || 0) < 1000) return;
    if (gameState.weapons.cooldown > 0 || gameState.weapons.energy < 10) return;

    ap.lastFire = now;
    gameState.crosshairX = window.innerWidth / 2;
    gameState.crosshairY = window.innerHeight / 2;
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

  // Hide lasers after 200 ms by setting .visible = false.  This does NOT
  // touch scene.remove() or material.dispose() — we leave ALL disposal to
  // the game's native fade setInterval so we never race with it.  Three.js
  // skips rendering any mesh with .visible = false, so visually the laser
  // is gone immediately; the native fade still completes its timer, marks
  // opacity <= 0, then calls scene.remove + dispose as usual.  This is the
  // key difference from the old sweepStaleLasers — no dispose/remove here.
  function hideStaleLasers() {
    if (typeof activeLasers === 'undefined') return;
    const now = Date.now();
    for (let i = 0; i < activeLasers.length; i++) {
      const ld = activeLasers[i];
      if (!ld || !ld.beam) continue;
      if (!ld._demoCreatedAt) ld._demoCreatedAt = now;
      if (now - ld._demoCreatedAt > 80 && ld.beam.visible) {
        ld.beam.visible = false;
        // Also zero the opacity defensively — some materials with
        // .visible=false may still contribute to the composite frame
        if (ld.material)     ld.material.opacity     = 0;
        if (ld.glowMaterial) ld.glowMaterial.opacity = 0;
      }
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
      // Pull strength: 0.8 u/frame at the edge of range, 2.0 in close range
      const pull = dist < CLOSE_RANGE ? 2.0 : 0.8;
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
  }

  function resetFlags() {
    ap.combatMissileFired = false;
    ap.brakingAfterWarp = false;
    ap.orbitTarget = null;
    ap.orbitAngle = 0;
    ap.subState = 0;
    ap.currentNebula = null;
    ap.currentBH = null;
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

  function transmit(from, msg) {
    const now = Date.now();
    if (now - ap._lastTransmit < TRANSMIT_COOLDOWN_MS) return;
    ap._lastTransmit = now;
    if (typeof showIncomingTransmission !== 'function') return;
    showIncomingTransmission(from, msg, 0x00ccff);
    // autoReadAnyTransmission() in the main update loop will pick up the
    // prompt and auto-open the full message 2 s later, then auto-close
    // after 5 s more.
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  function buildHUD() {
    removeHUD();
    const el = document.createElement('div');
    el.id = 'demoPilotHUD';
    // Mobile: position at the TOP just below the NAV button.
    // Desktop: keep at the bottom (above the achievement popup bottom-80).
    const isMobile = window.innerWidth <= 768 ||
                     ('ontouchstart' in window && window.innerWidth <= 1024);
    const topOrBottom = isMobile ? 'top:84px' : 'bottom:10px';
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
      'pointer-events:none',
      'text-shadow:0 0 8px rgba(0,255,136,0.8)',
      'box-shadow:0 0 20px rgba(0,255,136,0.3)',
      'letter-spacing:2px',
      'min-width:260px',
      'max-width:90vw',
    ].join(';');
    el.innerHTML = '<div id="demoPilotLabel" style="opacity:0.7;font-size:10px;margin-bottom:2px">🤖 DEMO AUTOPILOT · press T to take over</div><div id="demoPilotStatus">Initializing…</div>';
    document.body.appendChild(el);
    ap.hudEl = el;

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
    const s = document.getElementById('demoPilotStatus');
    if (s) s.textContent = ap.statusText || ap.phase;
  }

  function updateHUDStyle(paused) {
    const el = document.getElementById('demoPilotHUD');
    const label = document.getElementById('demoPilotLabel');
    if (!el) return;
    if (paused) {
      el.style.borderColor = 'rgba(255,200,0,0.7)';
      el.style.color = '#ffcc33';
      el.style.textShadow = '0 0 8px rgba(255,200,0,0.8)';
      el.style.boxShadow = '0 0 20px rgba(255,200,0,0.35)';
      if (label) label.textContent = '🕹️ PLAYER CONTROL · press T to resume demo';
    } else {
      el.style.borderColor = 'rgba(0,255,136,0.5)';
      el.style.color = '#00ff88';
      el.style.textShadow = '0 0 8px rgba(0,255,136,0.8)';
      el.style.boxShadow = '0 0 20px rgba(0,255,136,0.3)';
      if (label) label.textContent = '🤖 DEMO AUTOPILOT · press T to take over';
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
