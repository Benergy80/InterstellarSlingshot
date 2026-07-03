// ════════════════════════════════════════════════════════════════
// VOLKARIS — DEMO PILOT (press T, same as the mothership game)
//
// An autopilot that PLAYS the game for playtesting: tours every
// district, jumps, flips, rolls, wall-runs, jetpacks, fights the
// garrison, loots power cores, rides the Orbital Loop, flies an AV,
// crawls a cave and walks the lake shore — on repeat, forever.
//
// It drives the REAL input path (synthetic keyboard/mouse events on
// document) so a demo run exercises the same handlers a human does;
// only the heading is steered directly (arrow-key inertia is not a
// navigation system).
//
// Everything it struggles with is recorded: stuck spots, navigation
// failures (teleport rescues), deaths, task timeouts, sustained low
// FPS, uncaught errors. VK.demo.report() returns the log — the
// debugging loop reads it, patches the game, and runs again.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { C, sphDir, clamp } from './config.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _up = new THREE.Vector3();

export function createDemo({ player, planet, transit, npcs, fx, hud, camera }) {
  const st = player.state;
  const log = [];
  const stats = { loops: 0, tasksDone: 0, teleports: 0, deaths: 0, jumps: 0, wallRuns: 0 };
  let active = false;
  let taskIdx = 0, taskT = 0, taskPhase = 0, taskData = null;
  let held = new Set();      // synthetic keys currently down
  let mouseDown = false;
  let stuckT = 0, stuckRungs = 0, lastPos = new THREE.Vector3(), moveCheck = 0;
  let lowFpsT = 0, fpsEMA = 60, defending = false, lastHp = null;

  // ── trouble log ──
  function trouble(type, detail) {
    const e = {
      t: +performance.now().toFixed(0), type,
      task: TASKS[taskIdx]?.name, phase: taskPhase,
      pos: [+st.pos.x.toFixed(1), +st.pos.y.toFixed(1), +st.pos.z.toFixed(1)],
      detail,
    };
    log.push(e);
    console.warn('[DEMO]', type, e.task, JSON.stringify(detail ?? ''));
    if (log.length > 400) log.shift();
  }
  addEventListener('error', (e) => { if (active) trouble('js-error', String(e.message).slice(0, 200)); });

  // ── synthetic input (the real handlers do the work) ──
  function key(code, down) {
    const k = code === 'ShiftL' ? 'Shift' : code === 'ShiftR' ? 'Shift' : code;
    if (down && held.has(code)) return;
    if (!down && !held.has(code)) return;
    if (down) held.add(code); else held.delete(code);
    document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
      key: k, location: code === 'ShiftR' ? 2 : code === 'ShiftL' ? 1 : 0, bubbles: true, cancelable: true,
    }));
  }
  function tapKey(code) { key(code, true); key(code, false); }
  // W-W double-tap that works even mid-run (a held W must be released
  // first or the synthetic keydown no-ops and the tap never registers)
  function jumpGesture() {
    const wasW = held.has('w');
    key('w', false);
    key('w', true); key('w', false);
    key('w', true);
    if (!wasW) key('w', false);
    stats.jumps++;
  }
  function releaseAll() {
    for (const k of [...held]) key(k, false);
    if (mouseDown) fire(false);
  }
  // jump then jetpack — the Space press must wait until AIRBORNE or the
  // grounded-Space handler toggles run/walk pace instead of thrusting
  function jetBurst(ms = 1400) {
    jumpGesture();
    setTimeout(() => { if (active && !st.grounded) key(' ', true); }, 200);
    setTimeout(() => { if (active) key(' ', false); }, 200 + ms);
  }
  function mouseTo(x, y) {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
  }
  function fire(down) {
    if (down === mouseDown) return;
    mouseDown = down;
    document.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', {
      button: 0, clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true,
    }));
  }
  // aim the free crosshair at a world point
  function aimAt(worldPos) {
    _v3.copy(worldPos).project(camera);
    const x = clamp((_v3.x * 0.5 + 0.5) * innerWidth, 8, innerWidth - 8);
    const y = clamp((-_v3.y * 0.5 + 0.5) * innerHeight, 8, innerHeight - 8);
    mouseTo(x, y);
  }

  // ── spherical navigation: wall avoidance + street sense + MEMORY ──
  // The pilot LEARNS. Every spot that defeated it (jetpack rescue or
  // teleport) is remembered in localStorage and penalized on all
  // future runs — the Captain gets smarter every session.
  let troubleMap = [];
  try { troubleMap = JSON.parse(localStorage.getItem('vk_demo_trouble') ?? '[]'); } catch { troubleMap = []; }
  const _tv = new THREE.Vector3();
  function rememberTrouble() {
    _tv.copy(st.pos).normalize();
    for (const t2 of troubleMap) {
      const d2 = (_tv.x - t2[0]) ** 2 + (_tv.y - t2[1]) ** 2 + (_tv.z - t2[2]) ** 2;
      if (d2 < 0.0004) return;   // already known (~1.2u)
    }
    troubleMap.push([+_tv.x.toFixed(3), +_tv.y.toFixed(3), +_tv.z.toFixed(3)]);
    if (troubleMap.length > 240) troubleMap.shift();
    try { localStorage.setItem('vk_demo_trouble', JSON.stringify(troubleMap)); } catch { /* ok */ }
  }
  function troublePenalty(pos) {
    _tv.copy(pos).normalize();
    let p = 0;
    for (const t2 of troubleMap) {
      const d2 = (_tv.x - t2[0]) ** 2 + (_tv.y - t2[1]) ** 2 + (_tv.z - t2[2]) ** 2;
      if (d2 < 0.006) p += 1 - d2 / 0.006;   // within ~4.6u of a bad memory
    }
    return p;
  }

  // wall avoidance with clearance SCORING and detour hysteresis —
  // first-clear picking dithered left/right and ground into corners
  let detourSign = 0, detourT = 0;
  const _cb = new THREE.Vector3(), _cbe = new THREE.Vector3(), _cbest = new THREE.Vector3();
  function clearBearing(bearing, dt) {
    _cbe.copy(st.pos).addScaledVector(_up, 1.0);
    if (!planet.probe(_cbe, bearing, 4.0)) {
      detourT -= dt;
      if (detourT <= 0) detourSign = 0;
      return bearing;
    }
    let bs = -Infinity, bestAng = 0;
    for (const ang of [0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4]) {
      _cb.copy(bearing).applyAxisAngle(_up, ang);
      const hit = planet.probe(_cbe, _cb, 5.5);
      const clear = hit ? hit.distance : 5.5;
      const score = clear
        + (detourSign && Math.sign(ang) === detourSign ? 1.4 : 0)   // stay committed
        - Math.abs(ang) * 0.3;
      if (score > bs) { bs = score; bestAng = ang; }
    }
    detourSign = Math.sign(bestAng);
    detourT = 0.7;
    return _cbest.copy(bearing).applyAxisAngle(_up, bestAng);
  }
  function steerToward(targetPos, dt) {
    _up.copy(st.pos).normalize();
    _v.copy(targetPos).sub(st.pos);
    _v.addScaledVector(_up, -_v.dot(_up));
    const d = _v.length();
    if (d < 0.001) return 0;
    _v.normalize();
    const bearing = clearBearing(_v, dt);
    const dot = clamp(st.heading.dot(bearing), -1, 1);
    const ang = Math.acos(dot);
    if (ang > 0.001) {
      const maxTurn = 3.2 * dt;
      const k = Math.min(1, maxTurn / ang);
      st.heading.lerp(bearing, k).addScaledVector(_up, -st.heading.dot(_up)).normalize();
    }
    return d;
  }
  function surfaceTarget(dir) {
    return planet.surfacePoint(dir.clone().normalize());
  }
  function distTo(p) { return st.pos.distanceTo(p); }

  // street sense: when the target is far, hop along the road network
  // (streets are carved flat and actually CONNECT places — beelining
  // into the warrens was the main source of wall-grinding)
  let streetPts = null, hopT = 0, hopActive = false;
  const hopWp = new THREE.Vector3();
  function walkTo(p, dt, { run = true } = {}) {
    if (!streetPts) streetPts = planet.pathSamples.map(d => planet.surfacePoint(d));
    const dDirect = distTo(p);
    let target = p;
    if (dDirect > 24) {
      hopT -= dt;
      if (hopT <= 0) {
        hopT = 1.2;
        // nearest street point that meaningfully cuts the remaining
        // distance and isn't a remembered trouble spot
        let bs2 = dDirect - 2;
        hopActive = false;
        for (const sp2 of streetPts) {
          if (sp2.distanceTo(st.pos) > 15) continue;
          const score = sp2.distanceTo(p) + troublePenalty(sp2) * 6;
          if (score < bs2) { bs2 = score; hopWp.copy(sp2); hopActive = true; }
        }
      }
      if (hopActive && st.pos.distanceTo(hopWp) > 2.2) target = hopWp;
    } else hopActive = false;
    steerToward(target, dt);
    key('w', true);
    if (run) key('b', dDirect > 18 && st.energy > 30);
    else key('b', false);
    // parkour flair: the Captain MOVES like the Captain — periodic W-W
    // jumps, double-jump flips and rolls mid-transit. Jumping at speed
    // beside warren walls also kicks off wall-runs organically.
    parkourT -= dt;
    if (parkourT <= 0 && st.grounded && st.mode === 'walk' && dDirect > 9) {
      parkourT = 2.8 + Math.random() * 3;
      const pick2 = Math.random();
      if (pick2 < 0.5) jumpGesture();
      else if (pick2 < 0.85) {
        jumpGesture();   // then flip at the apex
        setTimeout(() => { if (active && !st.grounded) jumpGesture(); }, 380);
      } else tapKey('c');
    }
    return dDirect;
  }
  let parkourT = 2;
  function stopWalking() { key('w', false); key('b', false); }

  // ── stuck detection + recovery ladder ──
  // Progress-based: "stuck" means the distance to the CURRENT nav target
  // has not improved — raw displacement lies (a recovery jump moves you
  // half a meter and used to reset the ladder, so it never escalated).
  let bestDist = Infinity;
  function resetStuck() { stuckT = 0; stuckRungs = 0; bestDist = Infinity; }
  function checkStuck(dt, wantsMove) {
    const tgt = taskData?.navTarget;
    if (!wantsMove || st.mode !== 'walk' || !tgt) { resetStuck(); return; }
    const d = distTo(tgt);
    if (d < bestDist - 0.45) { bestDist = d; stuckT = 0; stuckRungs = 0; return; }
    stuckT += dt;
    if (stuckRungs === 0 && stuckT > 3) {
      stuckRungs = 1;
      trouble('stuck-jump', { rung: 1, dist: +d.toFixed(1) });
      jumpGesture();
    } else if (stuckRungs === 1 && stuckT > 6.5) {
      stuckRungs = 2;
      trouble('stuck-jetpack', { rung: 2, dist: +d.toFixed(1) });
      rememberTrouble();   // learn: this spot beats simple jumping
      jetBurst(1500);
    } else if (stuckRungs === 2 && stuckT > 12) {
      // navigation failure — rescue and RECORD it; these entries are
      // exactly what the debugging loop is for
      trouble('nav-fail-teleport', { target: [+tgt.x.toFixed(1), +tgt.y.toFixed(1), +tgt.z.toFixed(1)] });
      rememberTrouble();   // learn: never route through here again
      stats.teleports++;
      const up2 = tgt.clone().normalize();
      st.pos.copy(planet.surfacePoint(up2)).addScaledVector(up2, 0.4);
      st.vel.set(0, 0, 0);
      resetStuck();
    }
  }

  // ── the mission script ──
  // Each task: { name, timeout, start(), run(dt) -> true when done }
  const districtKeys = () => planet.districts.map(d => d.key);
  function navTaskTo(dirVec, arriveDist = 4) {
    taskData.navTarget = surfaceTarget(dirVec);
    resetStuck();               // new leg = fresh progress reference
    return (dt) => {
      const d = walkTo(taskData.navTarget, dt);
      checkStuck(dt, true);
      return d < arriveDist;
    };
  }

  const riddenLines = new Set();

  const TASKS = [
    {
      name: 'tour-districts', timeout: 300,
      start() { taskData.idx = 0; taskData.step = null; },
      run(dt) {
        const ds = planet.districts;
        if (!taskData.step) {
          if (taskData.idx >= ds.length) return true;
          taskData.step = navTaskTo(ds[taskData.idx].dir, 5);
          hud.toast?.('DEMO PILOT', `Touring ${ds[taskData.idx].name}`);
        }
        // survival: a district center inside the garrison isn't worth
        // dying for — log the hot zone and move on (only while under
        // actual fire; hp doesn't regen, so a bare hp check would
        // cascade-skip the rest of the tour)
        if (st.hp < 45) {
          const foe = nearestHostile();
          if (foe && distTo(foe.pos) < 22) {
            trouble('tour-hot-zone-skip', { district: ds[taskData.idx]?.key, hp: Math.round(st.hp) });
            taskData.idx++; taskData.step = null; stopWalking();
            return false;
          }
        }
        if (taskData.step(dt)) { taskData.idx++; taskData.step = null; stopWalking(); }
        return false;
      },
    },
    {
      name: 'acrobatics', timeout: 30,
      start() { taskData.seq = 0; taskData.wait = 0; },
      run(dt) {
        // don't do gymnastics in a firefight — the tour may have ended
        // inside the garrison
        const foe = nearestHostile();
        if (foe && distTo(foe.pos) < 18) {
          trouble('acrobatics-deferred', { hp: Math.round(st.hp) });
          return true;
        }
        taskData.wait -= dt;
        if (taskData.wait > 0) { checkStuck(dt, false); return false; }
        const s = taskData.seq++;
        if (s === 0) { key('w', true); taskData.wait = 0.8; }
        else if (s === 1) { jumpGesture(); taskData.wait = 0.5; }      // jump
        else if (s === 2) { jumpGesture(); taskData.wait = 1.6; }      // air flip
        else if (s === 3) { tapKey('c'); taskData.wait = 1.2; }                   // combat roll
        else if (s === 4) { tapKey(' '); taskData.wait = 0.4; }                   // pace toggle
        else if (s === 5) { tapKey(' '); taskData.wait = 0.4; }                   // and back
        else { stopWalking(); return true; }
        return false;
      },
    },
    {
      name: 'jetpack-climb', timeout: 25,
      start() { taskData.ph = 0; taskData.h0 = 0; },
      run(dt) {
        if (taskData.ph === 0) {
          _up.copy(st.pos).normalize();
          taskData.h0 = st.pos.length();
          taskData.tries = (taskData.tries ?? 0) + 1;
          jetBurst(2600);
          taskData.ph = 1;
          taskData.launched = 0;
        } else if (taskData.ph === 1) {
          taskData.launched += dt;
          if (taskData.launched < 0.5) return false;
          const gain = st.pos.length() - taskData.h0;
          // launch didn't take (still on the deck, no altitude) → retry
          if (taskData.launched > 2.2 && st.grounded && gain < 1) {
            if (taskData.tries >= 3) { trouble('jetpack-launch-failed', { tries: taskData.tries }); return true; }
            taskData.ph = 0;
            return false;
          }
          if (gain > 6 || st.hoverFuel <= 0.1) {
            key(' ', false);
            if (gain < 2.5) trouble('jetpack-weak', { gained: +gain.toFixed(1) });
            taskData.ph = 2;
          }
        } else if (st.grounded) return true;
        return false;
      },
    },
    {
      name: 'combat', timeout: 90,
      start() {
        taskData.target = isolatedHostile();
        taskData.melee = 0;
        taskData.strafeT = 0;
        if (!taskData.target) trouble('no-hostiles-found', null);
        else taskData.navTarget = taskData.target.pos.clone();
      },
      run(dt) {
        const tgt = taskData.target;
        if (!tgt || tgt.state === 'dead') {
          fire(false); stopWalking();
          // loot: find the nearest power core and walk into it
          return true;
        }
        taskData.navTarget.copy(tgt.pos);
        const d = distTo(tgt.pos);
        if (d > 16) { walkTo(tgt.pos, dt); fire(false); checkStuck(dt, true); }
        else if (d > 3.2 || taskData.melee > 2) {
          // Z-lock the duel (exercises the targeting system every loop)
          taskData.zT = (taskData.zT ?? 0) + dt;
          if (!taskData.zTried && taskData.zT > 0.8) { taskData.zTried = true; tapKey('z'); }
          else if (taskData.zTried && !taskData.zChecked && taskData.zT > 1.8) {
            taskData.zChecked = true;
            if (!st.zTarget) trouble('zlock-failed', null);
          }
          // blaster range: keep moving — strafe around the target while
          // firing (standing still traded HP one-for-one)
          key('b', false);
          steerToward(tgt.pos, dt);
          _v2.copy(tgt.pos).addScaledVector(_up.copy(tgt.pos).normalize(), 1.2);
          aimAt(_v2);
          fire(true);
          taskData.strafeT += dt;
          const side = Math.floor(taskData.strafeT / 1.6) % 2 ? 'a' : 'd';
          key(side === 'a' ? 'd' : 'a', false);
          key(side, true);
          key('w', d > 8);
          checkStuck(dt, d > 8);
        } else {
          // melee range: alternate punch and kick
          fire(false); stopWalking();
          key('a', false); key('d', false);
          steerToward(tgt.pos, dt);
          taskData.meleeCd = (taskData.meleeCd ?? 0) - dt;
          if (taskData.meleeCd <= 0) {
            taskData.meleeCd = 0.7;
            taskData.melee++;
            tapKey(taskData.melee % 2 ? 'ShiftL' : 'ShiftR');
          }
        }
        return false;
      },
    },
    {
      name: 'loot-core', timeout: 25,
      start() {
        const hpBefore = st.hp;
        taskData.hp0 = hpBefore;
        taskData.core = nearestCore();
        if (!taskData.core) trouble('no-core-dropped', null);
        else taskData.navTarget = taskData.core.clone();
      },
      run(dt) {
        if (!taskData.core) return true;
        const d = walkTo(taskData.core, dt, { run: false });
        checkStuck(dt, true);
        if (d < 1.2) {
          stopWalking();
          if (st.hp <= taskData.hp0 && st.hp < C.PLAYER.hpMax - 1) trouble('core-no-heal', { hp: st.hp });
          return true;
        }
        return false;
      },
    },
    {
      name: 'ride-loop', timeout: 260,
      start() {
        // nearest station on a line we HAVEN'T ridden yet — over loops
        // the pilot covers AZURE, MAGENTA and AMBER all three
        let best = null, bd = 1e9;
        for (const s of transit.stations) {
          if (riddenLines.size < 3 && riddenLines.has(s.line?.key)) continue;
          const d = distTo(s.boardPos);
          if (d < bd) { bd = d; best = s; }
        }
        if (!best) for (const s of transit.stations) {
          const d = distTo(s.boardPos);
          if (d < bd) { bd = d; best = s; }
        }
        taskData.station = best;
        // two legs: street-level ramp foot first, then up to the platform
        taskData.leg = best.rampFoot ? 0 : 1;
        taskData.navTarget = (best.rampFoot ?? best.boardPos).clone();
        taskData.ph = 0; taskData.rode = 0;
      },
      run(dt) {
        if (taskData.ph === 0) {
          const d = walkTo(taskData.navTarget, dt, { run: taskData.leg === 0 });
          checkStuck(dt, true);
          if (taskData.leg === 0 && d < 3) {
            taskData.leg = 1;
            taskData.navTarget.copy(taskData.station.boardPos);
            resetStuck();
          }
          // on the ramp leg, jetpack-assist only if genuinely stuck below
          taskData.jetCd = (taskData.jetCd ?? 0) - dt;
          if (taskData.leg === 1 && d < 12 && st.grounded && stuckT > 2
              && st.pos.length() < taskData.navTarget.length() - 2 && taskData.jetCd <= 0) {
            taskData.jetCd = 4;
            jetBurst(1800);
          }
          if (taskData.leg === 1 && d < 4) { stopWalking(); key(' ', false); taskData.ph = 1; taskData.waited = 0; }
        } else if (taskData.ph === 1) {
          taskData.waited += dt;
          if (transit.boardableStation(st.pos)) { tapKey('e'); taskData.ph = 2; taskData.waited = 0; }
          // full circuit ≈ 2min — anything past that means the schedule broke
          else if (taskData.waited > 135) { trouble('train-never-boardable', { station: taskData.station.key }); return true; }
        } else if (taskData.ph === 2) {
          taskData.waited += dt;
          if (st.mode === 'ride') { taskData.ph = 3; taskData.rode = 0; }
          else if (taskData.waited > 3) { trouble('board-failed', { station: taskData.station.key }); return true; }
        } else if (taskData.ph === 3) {
          taskData.rode += dt;
          if (taskData.rode > 12 && transit.dwelling()) { tapKey('e'); taskData.ph = 4; taskData.waited = 0; }
          if (taskData.rode > 90) { trouble('ride-never-dwelled', null); tapKey('e'); taskData.ph = 4; taskData.waited = 0; }
        } else {
          taskData.waited += dt;
          if (st.mode === 'walk') {
            if (taskData.station?.line) riddenLines.add(taskData.station.line.key);
            return true;
          }
          if (taskData.waited > 4) { trouble('disembark-failed', null); return true; }
        }
        return false;
      },
    },
    {
      name: 'spire-lift', timeout: 170,
      start() {
        const els = planet.elevators ?? [];
        taskData.el = els[2] ?? els[0] ?? null;   // spire pair registers after the port pair
        if (!taskData.el) { trouble('no-elevators', null); taskData.skip = true; return; }
        taskData.ph = 0;
        taskData.navTarget = planet.surfacePoint(taskData.el.pos.clone().normalize());
      },
      run(dt) {
        if (taskData.skip) return true;
        if (taskData.ph === 0) {
          const d = walkTo(taskData.navTarget, dt);
          checkStuck(dt, true);
          if (d < 1.7) {
            stopWalking();
            taskData.ph = 1; taskData.waited = 0;
            taskData.r0 = st.pos.length();
          }
        } else {
          // stand under the lift column — the platform scoops us up
          taskData.waited += dt;
          const gain = st.pos.length() - taskData.r0;
          if (gain > 15) {
            hud.toast?.('DEMO PILOT', 'Rode the Spire lift to the deck');
            return true;
          }
          if (taskData.waited > 100) { trouble('elevator-never-carried', { gain: +gain.toFixed(1) }); return true; }
        }
        return false;
      },
    },
    {
      name: 'fly-av', timeout: 90,
      start() {
        let best = null, bd = 1e9;
        for (const v of transit.vehicles) {
          if (v.occupied) continue;
          const d = distTo(v.grp.position);
          if (d < bd) { bd = d; best = v; }
        }
        taskData.v = best;
        if (best) taskData.navTarget = best.grp.position.clone();
        taskData.ph = 0; taskData.flyT = 0;
      },
      run(dt) {
        if (!taskData.v) { trouble('no-vehicle-free', null); return true; }
        if (taskData.ph === 0) {
          const d = walkTo(taskData.navTarget, dt);
          checkStuck(dt, true);
          if (d < 3.5) {
            stopWalking(); tapKey('e'); taskData.ph = 1; taskData.waited = 0;
          }
        } else if (taskData.ph === 1) {
          taskData.waited = (taskData.waited ?? 0) + dt;
          if (st.mode === 'pilot') { taskData.ph = 2; taskData.flyT = 0; }
          else if (taskData.waited > 3) { trouble('vehicle-board-failed', { kind: taskData.v.kind }); return true; }
        } else if (taskData.ph === 2) {
          taskData.flyT += dt;
          key('w', true);
          key('b', taskData.flyT > 2 && taskData.flyT < 5);
          if (taskData.flyT > 9) { stopWalking(); tapKey('e'); taskData.ph = 3; taskData.waited = 0; }
        } else {
          taskData.waited += dt;
          if (st.mode === 'walk') return true;
          tapKey('e');
          if (taskData.waited > 12) { trouble('vehicle-land-failed', null); return true; }
        }
        return false;
      },
    },
    {
      name: 'palace-flight', timeout: 160,
      start() {
        let best = null, bd = 1e9;
        for (const v of transit.vehicles) {
          if (v.occupied) continue;
          const d = distTo(v.grp.position);
          if (d < bd) { bd = d; best = v; }
        }
        taskData.v = best;
        taskData.ph = 0;
        if (best) taskData.navTarget = best.grp.position.clone();
        else trouble('no-vehicle-free', null);
      },
      run(dt) {
        if (!taskData.v) return true;
        const ivory = planet.ivoryInfo;
        if (!ivory) { trouble('no-palace', null); return true; }
        if (taskData.ph === 0) {
          const d = walkTo(taskData.navTarget, dt);
          checkStuck(dt, true);
          if (d < 3.5) { stopWalking(); tapKey('e'); taskData.ph = 1; taskData.waited = 0; }
        } else if (taskData.ph === 1) {
          taskData.waited = (taskData.waited ?? 0) + dt;
          if (st.mode === 'pilot') { taskData.ph = 2; taskData.flyT = 0; }
          else if (taskData.waited > 3) { trouble('vehicle-board-failed', null); return true; }
        } else if (taskData.ph === 2) {
          // fly UP to the floating Ivory Palace: heading steers, pitch
          // follows the altitude gap (AV thrusts where you look)
          taskData.flyT += dt;
          const tgt = ivory.center;
          steerToward(tgt, dt);
          _up.copy(st.pos).normalize();
          _v.copy(tgt).sub(st.pos);
          const rise = _v.dot(_up);
          _v.addScaledVector(_up, -rise);
          const dh = _v.length();
          st.camPitch = clamp(Math.atan2(rise, Math.max(dh, 1)), -1.1, 1.25);
          key('w', true);
          key('b', dh > 25);
          const d3 = distTo(tgt);
          if (d3 < 9) { key('w', false); key('b', false); taskData.ph = 3; taskData.waited = 0; }
          else if (taskData.flyT > 110) {
            trouble('palace-unreached', { d: +d3.toFixed(0) });
            taskData.ph = 3; taskData.waited = 0;
          }
        } else {
          taskData.waited += dt;
          tapKey('e');   // land / park
          if (st.mode === 'walk') {
            if (st.pos.length() > 88) hud.toast?.('DEMO PILOT', 'Ivory Palace reached');
            else trouble('palace-landing-missed', { r: +st.pos.length().toFixed(1) });
            return true;
          }
          if (taskData.waited > 25) { trouble('vehicle-land-failed', null); return true; }
        }
        return false;
      },
    },
    {
      name: 'cave-run', timeout: 120,
      start() {
        // the crash→market shortcut bore under Mt. Kessler — mouth to
        // mouth only: the midpoint's surface height is the PEAK, not
        // the tunnel floor, and sent the pilot up the mountain
        taskData.wps = [sphDir(16, 20), sphDir(27, 32)];
        taskData.i = 0;
        taskData.step = null;
      },
      run(dt) {
        if (!taskData.step) {
          if (taskData.i >= taskData.wps.length) return true;
          taskData.step = navTaskTo(taskData.wps[taskData.i], 4.5);
        }
        if (taskData.step(dt)) { taskData.i++; taskData.step = null; }
        return false;
      },
    },
    {
      name: 'lake-shore', timeout: 90,
      start() { taskData.step = navTaskTo(sphDir(20, 129), 5); },
      run(dt) { return taskData.step(dt); },
    },
    {
      name: 'visit-port', timeout: 150,
      start() { taskData.step = navTaskTo(planet.portInfo?.dir ?? sphDir(45, 185), 8); },
      run(dt) {
        if (taskData.step(dt)) {
          stopWalking();
          if (!fx.canBoard || !fx.canBoard(st.pos)) {
            // not at the ship exactly — fine, the port pad is the goal
          }
          return true;
        }
        return false;
      },
    },
  ];

  function nearestHostile() {
    let best = null, bd = 1e9;
    for (const n of npcs.list) {
      if (n.state === 'dead' || !n.aggro || n.fly) continue;
      const d = distTo(n.pos);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  // combat target: prefer ISOLATED hostiles — walking into the pyramid
  // garrison 1-v-5 was a suicide loop (playtest deaths 5/run)
  function isolatedHostile() {
    let best = null, bs = 1e9;
    for (const n of npcs.list) {
      if (n.state === 'dead' || !n.aggro || n.fly) continue;
      if (n.kind !== 'trooper') continue;   // bosses are not a playtest loop
      let buddies = 0;
      for (const m of npcs.list) {
        if (m === n || m.state === 'dead' || !m.aggro || m.fly) continue;
        if (m.pos.distanceTo(n.pos) < 20) buddies++;
      }
      const score = distTo(n.pos) + buddies * 45;
      if (score < bs) { bs = score; best = n; }
    }
    return best ?? nearestHostile();
  }
  function nearestCore() {
    // power cores are tracked inside npcs — find via scene glow meshes is
    // brittle; instead re-scan for the closest drop through npcs.drops if
    // exposed, else give up gracefully
    if (npcs.drops) {
      let best = null, bd = 1e9;
      for (const d of npcs.drops) {
        const dd = distTo(d.base);
        if (dd < bd) { bd = dd; best = d.base; }
      }
      return best;
    }
    return null;
  }

  // ── HUD chip ──
  const chip = document.createElement('div');
  chip.id = 'demo-chip';
  chip.style.cssText = 'position:fixed;top:56px;right:22px;z-index:12;display:none;' +
    'font-family:"Share Tech Mono",monospace;font-size:12px;letter-spacing:0.18em;' +
    'color:#06030f;background:linear-gradient(90deg,#ffc400,#ff7a1a);padding:6px 14px;' +
    'clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%);';
  chip.textContent = 'DEMO PILOT — T TO TAKE OVER';
  document.body.appendChild(chip);

  // ── sequencer ──
  function nextTask() {
    stats.tasksDone++;
    releaseAll();
    taskIdx = (taskIdx + 1) % TASKS.length;
    if (taskIdx === 0) {
      stats.loops++;
      console.log('%c[DEMO] LOOP ' + stats.loops + ' COMPLETE — issues so far: ' + log.length,
        'color:#ffc400;font-weight:bold');
    }
    startTask();
  }
  function startTask() {
    taskT = 0; taskPhase = 0; taskData = {};
    resetStuck(); lastPos.copy(st.pos);
    const t = TASKS[taskIdx];
    chip.textContent = `DEMO PILOT · ${t.name} — T TO TAKE OVER`;
    t.start?.();
  }

  function start() {
    if (active) return;
    active = true;
    chip.style.display = 'block';
    hud.toast?.('DEMO PILOT ENGAGED', 'Watching the Captain play — press T to take over');
    taskIdx = 0;
    startTask();
  }
  function stop() {
    if (!active) return;
    active = false;
    releaseAll();
    chip.style.display = 'none';
    hud.toast?.('MANUAL CONTROL', 'The Captain is yours');
  }

  // T toggles, Escape stops — mirrors the mothership autopilot
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if ((e.key === 't' || e.key === 'T') && st.started && !st.boarding) {
      if (active) stop(); else start();
    }
    if (e.key === 'Escape' && active) stop();
  });

  let deadLogged = false, wallWas = false;
  return {
    get active() { return active; },
    start, stop, log, stats,
    report() {
      const byType = {};
      for (const e of log) byType[e.type] = (byType[e.type] ?? 0) + 1;
      return {
        active, stats: { ...stats }, byType, issues: [...log],
        learned: troubleMap.length,             // remembered trouble spots (persists)
        riddenLines: [...riddenLines],
      };
    },
    update(dt, t, fps) {
      if (!active) return;
      fpsEMA = fps ?? fpsEMA;
      if (fpsEMA < 25) { lowFpsT += dt; if (lowFpsT > 5) { trouble('low-fps', { fps: +fpsEMA.toFixed(0) }); lowFpsT = -20; } }
      else lowFpsT = Math.max(0, lowFpsT - dt);
      // wall-run bookkeeping (playtest coverage metric)
      if (st.wall && !wallWas) stats.wallRuns++;
      wallWas = !!st.wall;
      if (st.dead > 0) {
        if (!deadLogged) { deadLogged = true; stats.deaths++; trouble('player-died', { hp: 0 }); releaseAll(); }
        return;
      }
      deadLogged = false;
      if (st.paused || st.boarding || !st.started) return;
      const task = TASKS[taskIdx];
      taskT += dt;
      if (taskT > task.timeout) {
        trouble('task-timeout', { after: task.timeout });
        nextTask();
        return;
      }
      // self-preservation overlay: any task, any place — if the garrison
      // opens up nearby, shoot back (the tour was dying to troopers it
      // politely ignored)
      if (task.name !== 'combat' && st.mode === 'walk') {
        const foe = nearestHostile();
        if (foe && distTo(foe.pos) < 16 && st.hp < 95) {
          _v2.copy(foe.pos).addScaledVector(_up.copy(foe.pos).normalize(), 1.2);
          aimAt(_v2);
          fire(true);
          defending = true;
        } else if (defending) { fire(false); defending = false; }
        // evasive roll when the suit is taking hits mid-transit
        lastHp = lastHp ?? st.hp;
        if (st.hp < lastHp - 4) tapKey('c');
        lastHp = st.hp;
      }

      let done = false;
      try {
        done = task.run(dt);
      } catch (err) {
        trouble('task-crash', String(err).slice(0, 200));
        done = true;
      }
      if (done) nextTask();
    },
  };
}
