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
      }
      // Center the virtual crosshair so forward raycasts travel straight
      if (typeof window !== 'undefined') {
        gameState.crosshairX = window.innerWidth / 2;
        gameState.crosshairY = window.innerHeight / 2;
      }
    }

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
    // T toggles player takeover (T again returns to autopilot)
    if (!e.repeat && (e.key === 't' || e.key === 'T')) {
      // Ignore if the user is typing into a text input
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      toggleTakeover();
    }
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
      if (gameState) gameState.currentTarget = null;
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
    // Paused by player — still tick HUD but never drive the ship
    if (ap.paused) { tickHUD(); return; }
    if (typeof gameState === 'undefined' || !gameState.gameStarted) return;
    if (gameState.gameOver) { gameState.gameOver = false; return; }

    // Keep ship alive so the demo never ends prematurely
    if (gameState.hull < 50)   gameState.hull   = Math.min(gameState.maxHull || 100, gameState.hull + 1);
    if (gameState.energy < 40) gameState.energy = Math.min(100, gameState.energy + 1);
    if (gameState.missiles && gameState.missiles.current === 0)
      gameState.missiles.current = gameState.missiles.capacity || 3;
    if (gameState.emergencyWarp && gameState.emergencyWarp.available === 0)
      gameState.emergencyWarp.available = 1;

    // Clear movement keys each frame; we set what we need below
    releaseMovementKeys();

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

    // Keep the game's Navigation System target list fresh
    if (typeof populateTargets === 'function' && (t % 1500) < 100) {
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
        transmit('TACTICAL', 'Nav system contact confirmed!\nHostile: ' + (detected.userData.name || 'Unknown') + '\nWeapon systems online.');
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

    // Nothing on sensors — drift forward, and if we've been empty for a while,
    // punch an emergency warp to leapfrog to new territory
    setStatus('Scanning sector — no contacts');
    flyToward({ x: camPos().x + 200, y: camPos().y, z: camPos().z + 200 }, 1.0);

    if (t > 4000 && Date.now() - (ap.lastNebulaWarp || 0) > 20000 &&
        gameState.emergencyWarp.available > 0 &&
        !gameState.emergencyWarp.active && !gameState.emergencyWarp.transitioning) {
      setStatus('Empty sector — emergency warp engaged');
      transmit('PROPULSION', 'Long-range scan mode.\nEmergency warp engaged for rapid sector survey.');
      triggerEmergencyWarp();
      ap.lastNebulaWarp = Date.now();
    }

    // Safety: after 18 s with no kills, advance to the nebula objective
    if (t > 18000) {
      ap.segmentKills = Math.max(ap.segmentKills, 3); // force progression
      goPhase('warpToNebulaCluster');
    }
  }

  // ─── Reusable combat phase (returns to ap.returnPhase when target dead) ───
  function phaseCombat() {
    const t = elapsed();
    // Shields ON while fighting
    ensureShieldsFor('combat');

    const enemy = ap.combatTarget;

    if (!enemy || !enemy.userData || enemy.userData.health <= 0) {
      ap.enemiesKilled++;
      ap.segmentKills = (ap.segmentKills || 0) + 1;
      ap.combatMissileFired = false;
      setStatus('Target eliminated (' + ap.segmentKills + ' this segment)');
      notify('Target Eliminated', 'Enemy destroyed — hull salvage collected');
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

    if (dist > 600) {
      setStatus('Closing on target…');
      flyToward(enemy.position, 2.0);
    } else {
      setStatus('Engaging ' + (enemy.userData.name || 'hostile'));
      flyToward(enemy.position, 0.8);
    }

    // Orient + lock
    const aimDummy = { position: enemy.position };
    if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);
    gameState.targetLock.active = true;
    gameState.targetLock.target = enemy;
    gameState.currentTarget = enemy;

    if (isInFiringCone(enemy, 3000)) {
      aimAndFireLaserAt(enemy);
    }

    // One missile per combat encounter — missiles require shields down, so we
    // briefly drop them to fire the torpedo then bring them back next frame
    if (t > 6000 && !ap.combatMissileFired && gameState.missiles.current > 0) {
      ap.combatMissileFired = true;
      setStatus('Firing missile!');
      transmit('WEAPONS', 'Missile locked and loaded!\nDropping shields — firing torpedo!');
      if (shieldsActive() && window.deactivateShields) window.deactivateShields();
      setTimeout(() => {
        if (ap.active) fireMissileAt(enemy);
      }, 150);
    }

    // Combat stall timeout — enemy running away?  Abandon it.
    if (t > 35000) {
      setStatus('Target evaded — disengaging');
      ensureShieldsFor('travel');
      goPhase(ap.returnPhase || 'findLocalEnemies');
    }
  }

  // ─── 2) Emergency warp toward a nebula cluster ────────────────────────────
  function phaseWarpToNebulaCluster() {
    const t = elapsed();
    ensureShieldsFor('travel');
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

    // Face the nebula, then punch emergency warp
    const dummy = { position: ap.currentNebula.position };
    if (window.orientTowardsTarget) window.orientTowardsTarget(dummy);
    keys().w = true;

    if (t > 1500 && !gameState.emergencyWarp.active && !gameState.emergencyWarp.transitioning) {
      setStatus('EMERGENCY WARP — ENGAGING');
      transmit('PROPULSION', 'Emergency warp drive engaged!\nBrace for hyperspace jump.');
      triggerEmergencyWarp();
      ap.warpsUsed++;
      goPhase('coastToNebulaCluster');
    }

    // Safety: if warp somehow fails, just fly there normally
    if (t > 6000) {
      goPhase('coastToNebulaCluster');
    }
  }

  function phaseCoastToNebulaCluster() {
    const t = elapsed();
    ensureShieldsFor('travel');
    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;

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
    if (t > 30000) {
      ap.brakingAfterWarp = false;
      goPhase('orbitNebulaPlanet');
    }
  }

  // ─── 3) Target a planet in the cluster, orbit, unlock discovery ──────────
  function phaseOrbitNebulaPlanet() {
    const t = elapsed();
    ensureShieldsFor('travel');

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

    // Brief FPV showcase while orbiting
    if (t > 4000 && !ap.fpvShown) {
      ap.fpvShown = true;
      setStatus('Switching to cockpit view');
      if (window.setCameraFirstPerson) window.setCameraFirstPerson();
      ap.fpvTimer = Date.now();
    }
    if (ap.fpvTimer && Date.now() - ap.fpvTimer > 6000 && !ap.fpvTimerDone) {
      ap.fpvTimerDone = true;
      setStatus('Returning to chase cam');
      ensureThirdPerson();
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
    const paths = window.discoveryPaths || [];
    const path = paths.length > 0 ? paths[paths.length - 1] : null;
    const endPos = path && path.line && path.line.userData && path.line.userData.endPosition;

    // Check for an enemy in front of us as we travel
    const enemyAhead = nearestAliveEnemy(3500);
    if (enemyAhead) {
      setStatus('Revealed hostile acquired');
      transmit('TACTICAL', 'Revealed enemy forces engaged!\nEliminating hostile.');
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

    if (t > 90000) { ap.currentBH = null; goPhase('approachBorg'); }
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
      goPhase('coastAfterWarp');
    }
  }

  function phaseCoastAfterWarp() {
    const t = elapsed();
    ensureShieldsFor('travel');
    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;

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
    setStatus('Heading to outer reaches — Borg territory');
    if (t < 200) {
      transmit('LONG RANGE SENSORS', 'Massive unknown vessel detected at extreme range.\nWARNING: Borg Collective signature confirmed.\nAll hands to battle stations.');
    }

    const distFromOrigin = camPos().length();

    if (distFromOrigin < 70000) {
      if (!gameState.emergencyWarp.active && gameState.emergencyWarp.available > 0 && t > 3000) {
        // Face away from origin and punch it
        const outward = camPos().clone().multiplyScalar(2);
        const dummy = { position: outward };
        if (window.orientTowardsTarget) window.orientTowardsTarget(dummy);
        triggerEmergencyWarp();
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
    // Shields up for Borg encounter
    ensureShieldsFor('combat');
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

      const aimDummy = { position: target.position };
      if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);
      gameState.targetLock.active = true;
      gameState.targetLock.target = target;
      gameState.currentTarget = target;
      if (isInFiringCone(target, 3500)) {
        aimAndFireLaserAt(target);
      }

      // Periodically drop shields and fire a missile, then shields back up
      if (t % 10000 < 100 && gameState.missiles.current > 0) {
        if (shieldsActive() && window.deactivateShields) window.deactivateShields();
        setTimeout(() => { if (ap.active) fireMissileAt(target); }, 150);
      }
    } else {
      setStatus('Borg neutralized — VICTORY');
      ensureShieldsFor('travel');
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

  function flyToward(pos, speedMult) {
    speedMult = speedMult || 1.0;
    const target = pos && pos.position ? pos.position : (pos.isVector3 ? pos : new THREE.Vector3(pos.x || 0, pos.y || 0, pos.z || 0));
    const dummy = { position: target };
    if (window.orientTowardsTarget) window.orientTowardsTarget(dummy);
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

  // Returns true if target is within the ship's forward mouse-aim cone.
  // ~14° half-angle matches how a player lines up shots with the crosshair.
  function isInFiringCone(target, maxRangeOverride) {
    if (!target || typeof camera === 'undefined') return false;
    const pos = target.position || target;
    const toTarget = new THREE.Vector3().subVectors(pos, camera.position);
    const dist = toTarget.length();
    const maxRange = maxRangeOverride || 2000;
    if (dist > maxRange || dist < 1) return false;
    toTarget.normalize();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const dot = forward.dot(toTarget);
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

    // Only pull the trigger if the target is actually in the forward mouse-aim cone
    if (!isInFiringCone(target, 2500)) return;

    const now = Date.now();
    // Slower cadence: ~1 shot per 900 ms
    if (now - ap.lastFire > 900 && gameState.weapons.cooldown <= 0 && gameState.weapons.energy >= 10) {
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

  function triggerEmergencyWarp() {
    if (!gameState.emergencyWarp) return;
    if (gameState.emergencyWarp.available > 0 &&
        !gameState.emergencyWarp.active &&
        !gameState.emergencyWarp.transitioning) {
      keys().enter = true;
      setTimeout(() => { keys().enter = false; }, 100);
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
  // Returns the nearest enemy the player's onboard nav panel can currently see.
  function navDetectedEnemy() {
    if (typeof enemies === 'undefined') return null;
    let best = null, bestDist = Infinity;
    enemies.forEach(e => {
      if (!e.userData || e.userData.health <= 0) return;
      const maxRange = e.userData.isBlackHoleGuardian ? 10000 : 3000;
      const d = camPos().distanceTo(e.position);
      if (d < maxRange && d < bestDist) { bestDist = d; best = e; }
    });
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

  // ─── Shield helpers ───────────────────────────────────────────────────────
  // Enforce shield-on while fighting, shield-off while traveling.
  function ensureShieldsFor(mode) {
    if (typeof shieldSystem === 'undefined') return;
    const want = (mode === 'combat');
    if (want && !shieldSystem.active && gameState.energy > 20) {
      if (window.activateShields) window.activateShields();
    } else if (!want && shieldSystem.active) {
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

  function ensureThirdPerson() {
    if (window.cameraState && window.cameraState.mode !== 'third-person') {
      if (window.setCameraThirdPerson) window.setCameraThirdPerson();
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
    ap.combatTarget = null;
    ap.lastFire = ap.lastFire || 0;
  }

  function resetFlags() {
    ap.shieldShown = false;
    ap.emergencyWarpShown = false;
    ap.fpvShown = false;
    ap.fpvTimerDone = false;
    ap.fpvTimer = null;
    ap.missileShown = false;
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

  function notify(title, body) {
    if (typeof showAchievement === 'function') showAchievement(title, body);
  }

  function transmit(from, msg) {
    if (typeof showIncomingTransmission === 'function') {
      showIncomingTransmission(from, msg, 0x00ccff);
    }
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  function buildHUD() {
    removeHUD();
    const el = document.createElement('div');
    el.id = 'demoPilotHUD';
    // NOTE: Achievement popup sits at bottom-20 (80px). Keep demo HUD BELOW it
    // so demo status never blocks standard achievement toasts.
    el.style.cssText = [
      'position:fixed',
      'bottom:10px',
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
    ].join(';');
    el.innerHTML = '<div id="demoPilotLabel" style="opacity:0.7;font-size:10px;margin-bottom:2px">🤖 DEMO AUTOPILOT · press T to take over</div><div id="demoPilotStatus">Initializing…</div>';
    document.body.appendChild(el);
    ap.hudEl = el;
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
