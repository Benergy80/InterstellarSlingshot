// =============================================================================
// AUTOPILOT DEMO MODE - Interstellar Slingshot
// Showcases: sightseeing, combat, nebulas, warps, shields, Borg
// =============================================================================

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  const ap = {
    active: false,
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
  window.demoPilot = {
    start: start,
    stop: stop,
    get active() { return ap.active; }
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
    if (e.key === 'Escape') stop();
  }

  // ─── Main update (called every frame from animate()) ──────────────────────
  function update() {
    if (!ap.active) return;
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
      case 'init':               phaseInit();             break;
      case 'sightseeing':        phaseSightseeing();      break;
      case 'findEnemy':          phaseFindEnemy();        break;
      case 'combat':             phaseCombat();           break;
      case 'visitNebula':        phaseVisitNebula();      break;
      case 'followPath':         phaseFollowPath();       break;
      case 'gotoBlackHole':      phaseGotoBlackHole();    break;
      case 'coastToGalaxy':      phaseCoastToGalaxy();    break;
      case 'approachBorg':       phaseApproachBorg();     break;
      case 'fightBorg':          phaseFightBorg();        break;
      default:                   goPhase('sightseeing');
    }

    tickHUD();
  }

  // ─── Phases ───────────────────────────────────────────────────────────────

  function phaseInit() {
    // Wait 3 s for scene to fully load, then switch to 3rd person and begin
    if (elapsed() > 3000) {
      ensureThirdPerson();
      goPhase('sightseeing');
    }
  }

  function phaseSightseeing() {
    const t = elapsed();

    // ── Camera showreel: FPV for 8 s then back to 3rd person ──────────────
    if (t > 10000 && !ap.fpvShown) {
      ap.fpvShown = true;
      setStatus('Switching to cockpit view…');
      if (window.setCameraFirstPerson) window.setCameraFirstPerson();
      ap.fpvTimer = Date.now();
    }
    if (ap.fpvTimer && Date.now() - ap.fpvTimer > 8000 && ap.fpvTimerDone !== true) {
      ap.fpvTimerDone = true;
      setStatus('Returning to chase cam');
      ensureThirdPerson();
    }

    // ── Pick an interesting planet to approach ────────────────────────────
    if (!ap.orbitTarget || t > 20000 * (ap.subState + 1)) {
      ap.orbitTarget = pickPlanet();
      ap.subState++;
      if (ap.orbitTarget) {
        setStatus('Targeting ' + (ap.orbitTarget.userData.name || 'planet') + ' for orbit');
        transmit('NAVIGATION SYSTEM', 'Plotting course to ' + (ap.orbitTarget.userData.name || 'nearby planet') + '\nEstimating orbital insertion…');
      }
    }

    // ── Orbit or approach chosen planet ───────────────────────────────────
    if (ap.orbitTarget) {
      const dist = camPos().distanceTo(ap.orbitTarget.position);
      const radius = Math.max((ap.orbitTarget.userData.radius || 20) * 6, 150);
      if (dist > radius * 2) {
        setStatus('Flying to ' + (ap.orbitTarget.userData.name || 'planet'));
        flyToward(ap.orbitTarget.position, 1.5);
      } else {
        setStatus('Orbiting ' + (ap.orbitTarget.userData.name || 'planet'));
        orbitAround(ap.orbitTarget.position, radius);
      }
    }

    // ── Opportunistic fire: only if something is already in the forward cone ──
    if (t > 5000) {
      const coneTarget = findTargetInFiringCone(2500);
      if (coneTarget) {
        if (coneTarget.userData && coneTarget.userData.type === 'asteroid') {
          setStatus('Asteroid in sights — hull salvage');
        } else {
          setStatus('Hostile in sights — engaging');
        }
        aimAndFireLaserAt(coneTarget);
      }
    }

    // ── Demonstrate shields briefly ────────────────────────────────────────
    if (t > 35000 && !ap.shieldShown && gameState.energy > 30) {
      ap.shieldShown = true;
      setStatus('Demonstrating energy shields');
      transmit('DEFENSE SYSTEM', 'Energy shields activated!\nHexagonal barrier at full strength.');
      if (window.activateShields) window.activateShields();
      setTimeout(() => { if (window.deactivateShields) window.deactivateShields(); }, 5000);
    }

    // ── Demonstrate emergency warp ─────────────────────────────────────────
    if (t > 50000 && !ap.emergencyWarpShown && !gameState.emergencyWarp.active) {
      ap.emergencyWarpShown = true;
      setStatus('Emergency warp — ENGAGING');
      transmit('PROPULSION', 'Emergency warp drive charging…\nBrace for hyperspace jump!');
      triggerEmergencyWarp();
      ap.postWarpPhase = 'sightseeing_resume';
      goPhase('coastToGalaxy');
      return;
    }

    // ── After 60 s move on to combat ──────────────────────────────────────
    if (t > 65000) {
      goPhase('findEnemy');
    }
  }

  function phaseFindEnemy() {
    setStatus('Scanning for hostiles…');
    const enemy = nearestAliveEnemy(8000);
    if (enemy) {
      ap.combatTarget = enemy;
      setStatus('Hostile acquired — engaging');
      transmit('TACTICAL', 'Hostile vessel detected!\nWeapon systems online. Engaging target.');
      goPhase('combat');
    } else {
      // No enemy nearby — go visit a nebula to unlock paths
      goPhase('visitNebula');
    }
  }

  function phaseCombat() {
    const t = elapsed();
    const enemy = ap.combatTarget;

    // Validate target still alive
    if (!enemy || !enemy.userData || enemy.userData.health <= 0) {
      ap.enemiesKilled++;
      setStatus('Target eliminated');
      notify('Target Eliminated', 'Enemy destroyed — hull salvage collected');
      // After a few kills, visit a nebula
      if (ap.enemiesKilled % 3 === 0) {
        goPhase('visitNebula');
      } else {
        goPhase('findEnemy');
      }
      return;
    }

    const dist = camPos().distanceTo(enemy.position);

    // Close in
    if (dist > 600) {
      setStatus('Closing on target…');
      flyToward(enemy.position, 2.0);
    } else {
      setStatus('Engaging hostile — ' + (enemy.userData.name || 'enemy'));
      flyToward(enemy.position, 0.8);
    }

    // Aim ship at enemy (orients), then fire only if they're actually lined up
    const aimDummy = { position: enemy.position };
    if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);
    // Keep the lock so missile/laser auto-aim work
    gameState.targetLock.active = true;
    gameState.targetLock.target = enemy;
    gameState.currentTarget = enemy;
    // Pull the trigger only when in the forward mouse-aim cone
    if (isInFiringCone(enemy, 3000)) {
      aimAndFireLaserAt(enemy);
    }

    // Fire a missile if we haven't recently — missile auto-tracks so no cone gate
    if (t > 8000 && !ap.missileShown && gameState.missiles.current > 0 && !shieldsActive()) {
      ap.missileShown = true;
      setStatus('Firing missile!');
      transmit('WEAPONS', 'Missile locked and loaded!\nFire torpedo — target acquired.');
      fireMissileAt(enemy);
    }

    // If we've been fighting too long, move on
    if (t > 40000) {
      goPhase('visitNebula');
    }
  }

  function phaseVisitNebula() {
    const t = elapsed();
    setStatus('Scanning for nebula…');

    if (!ap.navTarget) {
      const neb = nearestNebula();
      if (neb) {
        ap.navTarget = { position: neb.position.clone() };
        ap.currentNebula = neb;
        setStatus('Plotting course to ' + (neb.userData.name || 'nebula'));
        transmit('SCIENCE OFFICER', 'Nebula detected — ' + (neb.userData.name || 'Unknown Nebula') +
          '\nApproaching for deep scan.\nFaction intelligence may be unlocked.');
      } else {
        // No nebula found — skip to black hole
        goPhase('gotoBlackHole');
        return;
      }
    }

    const dist = camPos().distanceTo(ap.navTarget.position);

    if (dist > 80) {
      flyToward(ap.navTarget.position, 2.0);
    } else {
      // Inside nebula — trigger deep discovery
      if (typeof checkForNebulaDeepDiscovery === 'function') checkForNebulaDeepDiscovery();
      ap.nebulasVisited++;
      ap.navTarget = null;
      ap.currentNebula = null;
      setStatus('Nebula explored — intel unlocked');
      // Linger a moment then follow discovery path or fight
      setTimeout(() => {
        if (ap.active) goPhase('followPath');
      }, 4000);
    }

    // Timeout safety
    if (t > 60000) goPhase('followPath');
  }

  function phaseFollowPath() {
    const t = elapsed();
    // Follow any active discovery paths to find enemies
    const paths = window.discoveryPaths || [];
    if (paths.length > 0) {
      const path = paths[paths.length - 1];
      if (path && path.line && path.line.userData) {
        const endPos = path.line.userData.endPosition;
        if (endPos) {
          const dist = camPos().distanceTo(endPos);
          setStatus('Following discovery path to enemy territory…');
          if (dist > 200) {
            flyToward(endPos, 2.0);
          } else {
            goPhase('findEnemy');
            return;
          }
        }
      }
    } else {
      goPhase('findEnemy');
    }
    if (t > 60000) goPhase('gotoBlackHole');
  }

  function phaseGotoBlackHole() {
    const t = elapsed();
    setStatus('Locating black hole gateway…');

    if (!ap.navTarget) {
      const bh = nearestBlackHole();
      if (bh) {
        ap.navTarget = { position: bh.position.clone() };
        ap.currentBH = bh;
        setStatus('Approaching ' + (bh.userData.name || 'black hole'));
        transmit('NAVIGATION', 'Black hole gravitational gateway detected!\nPreparing slingshot maneuver.\nHold on — this is going to be rough.');
      } else {
        goPhase('findEnemy');
        return;
      }
    }

    const dist = camPos().distanceTo(ap.navTarget.position);
    if (dist > 500) {
      flyToward(ap.navTarget.position, 2.5);
    } else {
      // Close enough — physics auto-warps us
      setStatus('Event horizon reached — WARPING');
      ap.navTarget = null;
      ap.warpsUsed++;
      goPhase('coastToGalaxy');
    }

    if (t > 90000) { ap.navTarget = null; goPhase('findEnemy'); }
  }

  function phaseCoastToGalaxy() {
    // After warp/emergency warp: coast on momentum, then brake at galaxy asteroid belt
    const t = elapsed();
    const speed = gameState.velocityVector ? gameState.velocityVector.length() : 0;

    // Find nearest asteroid belt to current position
    const belt = nearestAsteroidBelt();

    if (belt) {
      const beltCenter = belt.userData.blackHolePosition || belt.position;
      const beltRadius = belt.userData.radius || 2000;
      const distToBelt = camPos().distanceTo(beltCenter);

      if (distToBelt < beltRadius * 1.5) {
        // We're entering the galaxy's outer rings — BRAKE
        setStatus('Entering galaxy rings — braking!');
        if (t < 500 || ap.brakingAfterWarp === false) {
          ap.brakingAfterWarp = true;
          transmit('NAVIGATION', 'Galaxy approach confirmed!\nReducing velocity — entering asteroid belt perimeter.\nPreparing for system operations.');
          ensureThirdPerson();
        }
        if (keys().x !== undefined) keys().x = true;  // Brake key

        if (speed < 0.5) {
          ap.brakingAfterWarp = false;
          setStatus('Velocity nominal — exploring new galaxy');
          notify('Galaxy Reached', 'Entered new system — exploring…');
          ap.loopCount++;
          // After a few loops, head for Borg
          if (ap.loopCount >= 3) {
            goPhase('approachBorg');
          } else {
            goPhase('findEnemy');
          }
        }
        return;
      }
    }

    // Still coasting — gently thrust toward destination if speed is low
    if (speed < 0.3 && t > 5000) {
      // We stalled out mid-journey — push forward
      if (keys().w !== undefined) keys().w = true;
    }

    // Safety exit
    if (t > 30000) { ap.brakingAfterWarp = false; goPhase('findEnemy'); }
  }

  function phaseApproachBorg() {
    const t = elapsed();
    setStatus('Heading to outer reaches — Borg territory');
    transmit('LONG RANGE SENSORS', 'Massive unknown vessel detected at extreme range.\nWARNING: Borg Collective signature confirmed.\nAll hands to battle stations.');

    // Fly far from origin to trigger Borg spawn (need >70,000 units)
    const distFromOrigin = camPos().length();

    if (distFromOrigin < 70000) {
      // Use emergency warp to cover ground fast
      if (!gameState.emergencyWarp.active && gameState.emergencyWarp.available > 0 && t > 3000) {
        triggerEmergencyWarp();
      } else {
        flyToward({ x: 80000, y: 0, z: 0 }, 3.0);
      }
    } else {
      // Far enough — force Borg spawn
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
    const borgCube = gameState.borg && gameState.borg.cube;
    const borgDrones = gameState.borg && gameState.borg.drones ? gameState.borg.drones.filter(d => d.userData && d.userData.health > 0) : [];

    // Pick best combat target
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
        flyToward(target.position, 2.0);
      } else {
        flyToward(target.position, 0.8);
      }
      // Orient toward the Borg target, then only fire if lined up
      const aimDummy = { position: target.position };
      if (window.orientTowardsTarget) window.orientTowardsTarget(aimDummy);
      gameState.targetLock.active = true;
      gameState.targetLock.target = target;
      gameState.currentTarget = target;
      if (isInFiringCone(target, 3500)) {
        aimAndFireLaserAt(target);
      }

      if (t % 10000 < 100 && gameState.missiles.current > 0 && !shieldsActive()) {
        fireMissileAt(target);
      }

      // Show shields during intense Borg combat
      if (t > 15000 && !shieldsActive() && gameState.energy > 50) {
        if (window.activateShields) window.activateShields();
        setTimeout(() => { if (window.deactivateShields) window.deactivateShields(); }, 6000);
      }
    } else {
      setStatus('Borg neutralized — VICTORY');
      transmit('MISSION CONTROL', 'Outstanding work, Captain!\nBorg threat eliminated.\nReturning to patrol route.');
      notify('BORG DEFEATED', 'Threat eliminated — restarting demo…');
      setTimeout(() => {
        if (ap.active) {
          resetFlags();
          goPhase('sightseeing');
        }
      }, 8000);
    }

    if (t > 180000) {
      resetFlags();
      goPhase('sightseeing');
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
    ap.brakingAfterWarp = false;
    ap.orbitTarget = null;
    ap.orbitAngle = 0;
    ap.subState = 0;
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
    el.innerHTML = '<div style="opacity:0.7;font-size:10px;margin-bottom:2px">🤖 DEMO AUTOPILOT</div><div id="demoPilotStatus">Initializing…</div>';
    document.body.appendChild(el);
    ap.hudEl = el;
  }

  function tickHUD() {
    const s = document.getElementById('demoPilotStatus');
    if (s) s.textContent = ap.statusText || ap.phase;
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
