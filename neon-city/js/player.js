// ════════════════════════════════════════════════════════════════
// NEON CITY — player controller
// The Interstellar Slingshot control scheme, adapted planetside:
//   W/S walk · A/D strafe (banks like the ship) · W-W double-tap =
//   tactical hop (jump) · B boost · X brake · ARROW-key look with
//   the ship's exact rotational inertia (CapsLock = precision mode)
//   · mouse moves a free aiming crosshair · click/SPACE lasers ·
//   Z missile · TAB shields · V 1st/3rd person · C cycle nav target
//   · ENTER context interact (board monorail / elevator / auto-nav)
//   · T demo autopilot tour · gravity keeps you tethered.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { C, NEON, clamp, lerp } from './config.js';

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _wish = new THREE.Vector3();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();

export function createPlayer({ camera, scene, world, traffic, fx, hud, audio, onPauseToggle }) {
  const P = C.PLAYER;

  const state = {
    pos: new THREE.Vector3(-44, P.eye + 0.1, 148), // street canyon south of Kessler Plaza
    vel: new THREE.Vector3(),
    yaw: 0,                  // looking down the avenue toward the Spire
    pitch: 0,
    rollVis: 0,
    lean: 0,
    grounded: true,
    mode: 'walk',            // walk | ride | demo
    ride: null,
    autoNav: false,
    energy: P.energyMax,
    hull: 100,
    shield: false,
    targetIdx: -1,
    vehicle: null,
    speed: 0,
    paused: false,
    started: false,
    capsPrecision: false,
  };

  const rotVel = { yaw: 0, pitch: 0 };
  const keys = {};
  let lastWTap = 0;
  let wantJump = false;
  let fireHeld = false;
  let lastFire = 0, lastMissile = 0;
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  let camMode = 'fp'; // fp | tp
  let tpCam = new THREE.Vector3();
  let tpInit = false;

  // ── third-person avatar ──
  const avatar = new THREE.Group();
  {
    const suit = new THREE.MeshStandardMaterial({ color: 0x161a28, roughness: 0.45, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.85, 4, 10), suit);
    body.position.y = 1.0;
    avatar.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), suit);
    head.position.y = 1.72;
    avatar.add(head);
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 12, 8, -0.7, 1.4, 0.9, 1.1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(1.3), toneMapped: false })
    );
    visor.position.y = 1.74;
    avatar.add(visor);
    const packMat = new THREE.MeshStandardMaterial({ color: 0x232a40, roughness: 0.4, metalness: 0.7 });
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.2), packMat);
    pack.position.set(0, 1.18, 0.3);
    avatar.add(pack);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.22),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.magenta).multiplyScalar(1.2), toneMapped: false }));
    trim.position.set(0, 1.45, 0.3);
    avatar.add(trim);
    avatar.visible = false;
    scene.add(avatar);
  }

  // shield bubble (visible in 3rd person)
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 18, 14),
    new THREE.MeshBasicMaterial({
      color: NEON.purple, transparent: true, opacity: 0.14, wireframe: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
  );
  bubble.visible = false;
  scene.add(bubble);

  // ════════════════ INPUT ════════════════
  function onKeyDown(e) {
    if (!state.started) return;
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); onPauseToggle(); return; }
    if (state.paused) return;

    if (e.key === 'Tab') { e.preventDefault(); toggleShield(); return; }
    if (e.key === 'CapsLock') e.preventDefault();
    if (e.getModifierState) state.capsPrecision = e.getModifierState('CapsLock');

    const k = e.key.toLowerCase();
    if (k === 'w') {
      if (!e.repeat) {
        const now = performance.now();
        if (now - lastWTap < P.doubleTapMs) {
          wantJump = true;            // W-W tactical hop — the game's "jump"
        }
        lastWTap = now;
      }
      keys.w = true;
    }
    if (k === 'a') keys.a = true;
    if (k === 's') keys.s = true;
    if (k === 'd') keys.d = true;
    if (k === 'q') keys.q = true;
    if (k === 'e') keys.e = true;
    if (k === 'b') keys.b = true;
    if (k === 'x') keys.x = true;
    if (k === 'z') { keys.z = true; tryMissile(); }
    if (e.key === ' ') { e.preventDefault(); fireHeld = true; audio.resume(); }
    if (e.key === 'ArrowUp') { keys.up = true; e.preventDefault(); }
    if (e.key === 'ArrowDown') { keys.down = true; e.preventDefault(); }
    if (e.key === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
    if (k === 'v') toggleCamera();
    if (k === 'c') cycleTarget();
    if (k === 't' && state.mode !== 'demo') startDemo();
    if (e.key === 'Escape' && state.mode === 'demo') stopDemo();
    if (e.key === 'Enter') { e.preventDefault(); interact(); }
    if (k === 'm') audio.toggleMute();
    if (k === 'n') { const r = hud.cycleMapZoom(); hud.toast('MAP RANGE', `${r} u across`); audio.sfx('ui'); }
    if (k === 'r') hud.setWeather(fx.toggleRain());
  }
  function onKeyUp(e) {
    if (e.getModifierState) state.capsPrecision = e.getModifierState('CapsLock');
    const k = e.key.toLowerCase();
    if (k === 'w') keys.w = false;
    if (k === 'a') keys.a = false;
    if (k === 's') keys.s = false;
    if (k === 'd') keys.d = false;
    if (k === 'q') keys.q = false;
    if (k === 'e') keys.e = false;
    if (k === 'b') keys.b = false;
    if (k === 'x') keys.x = false;
    if (k === 'z') keys.z = false;
    if (e.key === ' ') fireHeld = false;
    if (e.key === 'ArrowUp') keys.up = false;
    if (e.key === 'ArrowDown') keys.down = false;
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; fireHeld = false; });

  document.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (state.started && !state.paused) hud.setCrosshair(e.clientX, e.clientY);
  });
  document.addEventListener('mousedown', (e) => {
    if (!state.started || state.paused || state.mode === 'demo') return;
    if (e.button === 0) { fireHeld = true; audio.resume(); }
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) fireHeld = false; });

  // ════════════════ ACTIONS ════════════════
  function toggleShield() {
    state.shield = !state.shield;
    hud.setShield(state.shield);
    audio.sfx(state.shield ? 'shieldUp' : 'shieldDown');
    bubble.visible = state.shield && camMode === 'tp';
    hud.toast(state.shield ? 'SHIELDS UP' : 'SHIELDS DOWN', state.shield ? 'Energy drain active' : 'Reserves recovering');
  }

  function toggleCamera() {
    camMode = camMode === 'fp' ? 'tp' : 'fp';
    avatar.visible = camMode === 'tp';
    bubble.visible = state.shield && camMode === 'tp';
    tpInit = false;
    hud.toast(camMode === 'tp' ? 'THIRD PERSON' : 'FIRST PERSON', 'V to toggle view');
    audio.sfx('ui');
  }

  function cycleTarget() {
    state.targetIdx = (state.targetIdx + 1) % world.pois.length;
    const poi = world.pois[state.targetIdx];
    hud.setTarget(poi);
    audio.sfx('ui');
  }

  function interact() {
    audio.resume();
    // 0 — flying car: land & exit, or board one nearby
    if (state.mode === 'fly' && state.vehicle) {
      const vehY = state.pos.y - 0.9;
      const gh = world.groundHeightAt(state.pos.x, state.pos.z, vehY - 0.5);
      if (state.speed < 6 && vehY - gh < 2.6) {
        const v = state.vehicle;
        v.grp.position.set(state.pos.x, gh + 0.85, state.pos.z);
        v.grp.rotation.set(0, state.yaw + Math.PI, 0);
        v.occupied = false;
        state.vehicle = null;
        state.mode = 'walk';
        state.vel.set(0, 0, 0);
        _right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
        state.pos.set(v.grp.position.x + _right.x * 3, gh + P.eye, v.grp.position.z + _right.z * 3);
        avatar.visible = camMode === 'tp';
        hud.toast('AV PARKED', 'On foot');
        hud.setMode('SURFACE MODE');
        audio.sfx('doors');
      } else {
        hud.toast('TOO FAST / TOO HIGH', 'Slow down near the ground to land');
      }
      return;
    }
    if (state.mode === 'walk' && traffic.getVehicleNear) {
      const v = traffic.getVehicleNear(state.pos);
      if (v) {
        v.occupied = true;
        state.vehicle = v;
        state.mode = 'fly';
        state.autoNav = false;
        state.vel.set(0, 0, 0);
        state.pos.set(v.grp.position.x, v.grp.position.y + 0.9, v.grp.position.z);
        avatar.visible = false;
        bubble.visible = false;
        hud.toast('AV ONLINE', 'Ship rules — W thrust where you look, no gravity. ENTER to land.');
        hud.setMode('AV FLIGHT');
        audio.sfx('warp');
        return;
      }
    }
    // 1 — disembark while dwelling
    if (state.ride) {
      const { train } = state.ride;
      if (train.state === 'dwell') {
        const st = train.nextStation;
        state.ride = null;
        state.mode = 'walk';
        state.pos.set(st.doorPoint.x, st.platY + P.eye, st.doorPoint.z);
        state.vel.set(0, 0, 0);
        hud.toast(`ARRIVED — ${st.name}`, train.line);
        hud.setMode('SURFACE MODE');
        audio.sfx('doors');
      } else {
        hud.toast('IN TRANSIT', 'Disembark at the next station stop');
      }
      return;
    }
    // 2 — board a dwelling train
    const feetY = state.pos.y - P.eye;
    const b = traffic.getBoardable(state.pos, feetY);
    if (b) {
      state.ride = b;
      state.mode = 'ride';
      state.vel.set(0, 0, 0);
      hud.toast(`BOARDED — ${b.train.line}`, `Departing ${b.station.name}`);
      hud.setMode(`RIDING ${b.train.line}`);
      audio.sfx('doors');
      return;
    }
    // 3 — world interactables (elevator)
    for (const it of world.interactables) {
      const label = typeof it.label === 'function' ? it.label() : it.label;
      if (!label) continue;
      const d = it.horizontal
        ? Math.hypot(state.pos.x - it.pos.x, state.pos.z - it.pos.z)
        : state.pos.distanceTo(it.pos);
      if (d < it.radius + 1.5) {
        it.action();
        audio.sfx('ui');
        return;
      }
    }
    // 4 — auto-nav to current target (the game's Enter auto-nav, on foot)
    if (state.targetIdx >= 0) {
      state.autoNav = !state.autoNav;
      hud.toast(state.autoNav ? 'AUTO-NAV ENGAGED' : 'AUTO-NAV DISENGAGED',
        state.autoNav ? `Walking to ${world.pois[state.targetIdx].name}` : 'Manual control resumed');
      hud.setMode(state.autoNav ? 'AUTO-NAV' : 'SURFACE MODE');
      audio.sfx('ui');
    }
  }

  function aimDir() {
    _ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    return _ray.ray.direction.clone();
  }

  function tryFire() {
    const now = performance.now();
    if (now - lastFire < 145 || state.energy < P.laserCost) return;
    lastFire = now;
    state.energy -= P.laserCost;
    const dir = aimDir();
    _v.copy(state.pos).addScaledVector(dir, 1.2);
    _v.y -= 0.25;
    fx.fireLaser(_v, dir);
    audio.sfx('laser');
  }

  function tryMissile() {
    const now = performance.now();
    if (now - lastMissile < 1400 || state.energy < P.missileCost || state.mode === 'demo') return;
    lastMissile = now;
    state.energy -= P.missileCost;
    const dir = aimDir();
    _v.copy(state.pos).addScaledVector(dir, 1.4);
    _v.y -= 0.4;
    fx.fireMissile(_v, dir);
    audio.sfx('missile');
  }

  // ════════════════ DEMO AUTOPILOT (T) ════════════════
  const demo = { shots: [], idx: 0, t: 0, saved: null };
  function demoShots() {
    const spire = new THREE.Vector3(0, 70, 0);
    const H = C.HALF;
    const poi = (name) => {
      const p = world.pois.find(q => q.name === name);
      return p ? p.pos : spire;
    };
    const oldT = poi('OLD TOWN'), plaza = poi('CORPORATE PLAZA'), stacks = poi('RESIDENTIAL STACKS');
    return [
      { dur: 12, pos: (k) => _v.set(Math.cos(k * 1.9 + 2.2) * 52, 6 + k * 26, Math.sin(k * 1.9 + 2.2) * 52), look: () => _v2.set(0, 40, -10) },
      { dur: 10, pos: (k) => _v.set(lerp(-160, 120, k), 3.2, H - C.CELL - 9), look: (k) => _v2.set(lerp(-60, 220, k), 6, H - C.CELL - 9) },
      { dur: 9, pos: (k) => _v.set(oldT.x + Math.cos(k * 1.6 + 0.6) * 44, 6.5, oldT.z + Math.sin(k * 1.6 + 0.6) * 44), look: () => _v2.set(oldT.x, 10, oldT.z) },
      { dur: 9, pos: (k) => _v.set(plaza.x - 50 + k * 30, lerp(9, 64, k), plaza.z + 40 - k * 20), look: () => _v2.set(plaza.x, 36, plaza.z) },
      { dur: 8, pos: (k) => _v.set(stacks.x + lerp(-55, 55, k), 24, stacks.z + 28), look: (k) => _v2.set(stacks.x + lerp(-25, 25, k), 20, stacks.z - 20) },
      { dur: 10, pos: (k) => _v.set(34, lerp(4, 126, k), 34), look: (k) => _v2.copy(spire).setY(lerp(30, 116, k)) },
      {
        dur: 13,
        pos: () => { const tr = traffic.trains[0]; return _v.set(tr.headPos.x + 10, tr.headPos.y + 4.5, tr.headPos.z + 10); },
        look: () => { const tr = traffic.trains[0]; return _v2.copy(tr.headPos); },
      },
      { dur: 12, pos: (k) => _v.set(lerp(-240, 200, k), C.AIR_LANES[1] + 4, lerp(-60, 40, k) + Math.sin(k * 9) * 10), look: (k) => _v2.set(lerp(-160, 320, k), C.AIR_LANES[1], lerp(-40, 60, k)) },
      { dur: 14, pos: (k) => _v.set(H + 30 + k * 60, 14 + k * 10, lerp(-120, 90, k)), look: () => _v2.set(H + 150, 30, 0) },
      { dur: 11, pos: (k) => _v.set(Math.cos(k * 0.9) * (300 - k * 40), 150 + k * 60, Math.sin(k * 0.9) * (300 - k * 40)), look: () => _v2.set(0, 60, 0) },
    ];
  }
  function startDemo() {
    demo.saved = { pos: state.pos.clone(), yaw: state.yaw, pitch: state.pitch };
    demo.shots = demoShots();
    demo.idx = 0; demo.t = 0; demo.cut = true;
    state.mode = 'demo';
    state.autoNav = false;
    hud.setDemo(true);
    hud.setMode('DEMO — AUTOPILOT');
    avatar.visible = false;
    audio.sfx('warp');
  }
  function stopDemo() {
    if (demo.saved) {
      state.pos.copy(demo.saved.pos);
      state.yaw = demo.saved.yaw;
      state.pitch = demo.saved.pitch;
    }
    state.vel.set(0, 0, 0);
    state.mode = 'walk';
    hud.setDemo(false);
    hud.setMode('SURFACE MODE');
    avatar.visible = camMode === 'tp';
    hud.toast('MANUAL CONTROL RESUMED', 'Welcome back, pilot');
  }

  // ════════════════ COLLISION ════════════════
  function collideList(list, r, feetY) {
    for (const c of list) {
      if (c.enabled !== undefined && !(typeof c.enabled === 'function' ? c.enabled() : c.enabled)) continue;
      if (c.minY !== undefined && (feetY + 1.8 < c.minY || feetY > c.maxY)) continue;
      if (state.pos.x > c.minX - r && state.pos.x < c.maxX + r &&
          state.pos.z > c.minZ - r && state.pos.z < c.maxZ + r) {
        const dxMin = state.pos.x - (c.minX - r), dxMax = (c.maxX + r) - state.pos.x;
        const dzMin = state.pos.z - (c.minZ - r), dzMax = (c.maxZ + r) - state.pos.z;
        const m = Math.min(dxMin, dxMax, dzMin, dzMax);
        if (m === dxMin) { state.pos.x = c.minX - r; state.vel.x = Math.min(0, state.vel.x); }
        else if (m === dxMax) { state.pos.x = c.maxX + r; state.vel.x = Math.max(0, state.vel.x); }
        else if (m === dzMin) { state.pos.z = c.minZ - r; state.vel.z = Math.min(0, state.vel.z); }
        else { state.pos.z = c.maxZ + r; state.vel.z = Math.max(0, state.vel.z); }
      }
    }
  }
  function collide() {
    const r = P.radius;
    const feetY = state.pos.y - P.eye;
    collideList(world.colliders, r, feetY);
    if (world.activeInterior) collideList(world.activeInterior.colliders, r, feetY);
  }

  // ════════════════ UPDATE ════════════════
  function update(dt, t) {
    if (!state.started || state.paused) return;

    // hull knits itself back together outside combat
    if (!(fx.bossEvent && fx.bossEvent.active) && state.hull < 100) {
      state.hull = Math.min(100, state.hull + 0.6 * dt);
    }
    // energy
    let drain = 0;
    if (state.shield) drain += P.shieldDrain;
    state.energy = clamp(state.energy + (P.energyRegen - drain) * dt, 0, P.energyMax);
    if (state.shield && state.energy <= 0.5) toggleShield();

    // ── DEMO MODE: cinematic shots with hard cuts between them ──
    if (state.mode === 'demo') {
      const shot = demo.shots[demo.idx];
      demo.t += dt;
      const k = clamp(demo.t / shot.dur, 0, 1);
      const e = k * k * (3 - 2 * k);
      const p = shot.pos(e).clone();
      const l = shot.look(e).clone();
      if (demo.cut) {
        camera.position.copy(p);   // hard cut on shot change
        demo.cut = false;
      } else {
        camera.position.lerp(p, 1 - Math.exp(-dt * 9));
      }
      _v.copy(l);
      camera.lookAt(_v);
      if (k >= 1) { demo.idx = (demo.idx + 1) % demo.shots.length; demo.t = 0; demo.cut = true; }
      state.pos.copy(camera.position); // keep audio/minimap anchored
      if (fireHeld) fireHeld = false;
      hud.setBars(state);
      return;
    }

    // ── ARROW-KEY LOOK — the ship's rotational inertia, planetside ──
    {
      const R = P.rot;
      const accel = state.capsPrecision ? R.precAccel : R.accel;
      const maxS = state.capsPrecision ? R.precMaxSpeed : R.maxSpeed;
      const frameScale = dt * 60; // constants are per-frame at 60fps, like the game
      if (keys.up) rotVel.pitch += accel * frameScale;
      else if (keys.down) rotVel.pitch -= accel * frameScale;
      else rotVel.pitch *= Math.pow(R.decel, frameScale);
      if (keys.left) rotVel.yaw += accel * frameScale;
      else if (keys.right) rotVel.yaw -= accel * frameScale;
      else rotVel.yaw *= Math.pow(R.decel, frameScale);
      rotVel.pitch = clamp(rotVel.pitch, -maxS, maxS);
      rotVel.yaw = clamp(rotVel.yaw, -maxS, maxS);
      state.yaw += rotVel.yaw * frameScale;
      state.pitch = clamp(state.pitch + rotVel.pitch * frameScale, -1.45, 1.45);
    }

    // ── AV FLIGHT: the ship's flight model, no gravity ──
    if (state.mode === 'fly' && state.vehicle) {
      const boosting = keys.b && state.energy > 1;
      if (boosting) state.energy = Math.max(0, state.energy - P.boostDrain * 0.7 * dt);
      const acc = boosting ? 46 : 27;
      const cap = boosting ? 100 : 55;
      _fwd.set(
        -Math.sin(state.yaw) * Math.cos(state.pitch),
        Math.sin(state.pitch),
        -Math.cos(state.yaw) * Math.cos(state.pitch)
      );
      _right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
      if (keys.w) state.vel.addScaledVector(_fwd, acc * dt);
      if (keys.s) state.vel.addScaledVector(_fwd, -acc * 0.6 * dt);
      if (keys.d) state.vel.addScaledVector(_right, acc * 0.7 * dt);
      if (keys.a) state.vel.addScaledVector(_right, -acc * 0.7 * dt);
      const damp = keys.x ? 3.0 : 0.5;
      state.vel.multiplyScalar(Math.max(0, 1 - damp * dt));
      if (state.vel.length() > cap) state.vel.setLength(cap);
      state.pos.addScaledVector(state.vel, dt);
      collide();
      const vehY = state.pos.y - 0.9;
      const gh = world.groundHeightAt(state.pos.x, state.pos.z, vehY - 0.5);
      if (vehY - 0.55 < gh) { state.pos.y = gh + 1.45; if (state.vel.y < 0) state.vel.y = 0; }
      if (state.pos.y > 290) { state.pos.y = 290; state.vel.y = Math.min(0, state.vel.y); }
      state.speed = state.vel.length();
      // vehicle follows
      const g = state.vehicle.grp;
      g.position.set(state.pos.x, state.pos.y - 0.9, state.pos.z);
      g.rotation.set(-state.pitch * 0.5, state.yaw + Math.PI, state.rollVis * 2.2, 'YXZ');
      if (fireHeld) tryFire();
      const exitOK = state.speed < 6 && vehY - gh < 2.6;
      hud.setPrompt(exitOK ? 'ENTER — LAND & EXIT' : null);
      applyCamera(dt, t);
      hud.setBars(state);
      return;
    }

    // ── RIDING THE MONORAIL ──
    if (state.mode === 'ride' && state.ride) {
      const { train, carIdx } = state.ride;
      const car = train.cars[carIdx];
      state.pos.set(car.position.x, car.position.y + 0.35, car.position.z);
      state.vel.set(0, 0, 0);
      // the view turns with the track — add the car's yaw delta to ours
      _v.set(0, 0, -1).applyQuaternion(car.quaternion);
      const carYaw = Math.atan2(-_v.x, -_v.z);
      if (state.ride.prevCarYaw === undefined) state.ride.prevCarYaw = carYaw;
      let dyaw = carYaw - state.ride.prevCarYaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      state.yaw += dyaw;
      state.ride.prevCarYaw = carYaw;
      if (train.arrived) {
        train.arrived = false;
        hud.toast(`◊ ${train.nextStation.name}`, 'ENTER to disembark');
        audio.sfx('chime');
      }
      if (train.departed) {
        train.departed = false;
        if (train.nextStation) hud.toast('DEPARTING', `Next stop — ${train.nextStation.name}`);
        audio.sfx('chime');
      }
      hud.setPrompt(train.state === 'dwell' ? 'ENTER — DISEMBARK' : null);
      applyCamera(dt, t);
      hud.setBars(state);
      if (fireHeld) tryFire();
      return;
    }

    // ── AUTO-NAV (Enter): walk toward target like the ship's auto-nav ──
    if (state.autoNav && state.targetIdx >= 0) {
      if (keys.w || keys.s || keys.a || keys.d) {
        state.autoNav = false;
        hud.toast('AUTO-NAV DISENGAGED', 'Manual control resumed');
        hud.setMode('SURFACE MODE');
      } else {
        const poi = world.pois[state.targetIdx];
        const ty = Math.atan2(-(poi.pos.x - state.pos.x), -(poi.pos.z - state.pos.z));
        let dy = ty - state.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        state.yaw += dy * Math.min(1, dt * 2.2);
        keys.w = Math.abs(dy) < 1.1; // walk when roughly facing
        _v.copy(poi.pos); _v.y = state.pos.y;
        if (state.pos.distanceTo(_v) < 7) {
          state.autoNav = false;
          keys.w = false;
          hud.toast('ARRIVED', poi.name);
          hud.setMode('SURFACE MODE');
        }
      }
    }

    // ── MOVEMENT ──
    const boosting = keys.b && state.energy > 1;
    if (boosting) state.energy = Math.max(0, state.energy - P.boostDrain * dt);
    const speedCap = boosting ? P.boost : P.walk;

    _fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    _wish.set(0, 0, 0);
    if (keys.w) _wish.add(_fwd);
    if (keys.s) _wish.sub(_fwd);
    if (keys.d) _wish.add(_right);
    if (keys.a) _wish.sub(_right);
    const hasInput = _wish.lengthSq() > 0;
    if (hasInput) _wish.normalize();

    const accel = state.grounded ? P.accel : P.airAccel;
    state.vel.x += _wish.x * accel * dt;
    state.vel.z += _wish.z * accel * dt;

    // damping (mothergame pattern: vel -= vel * k * dt), brake = much stronger
    const damp = keys.x ? P.brakeDamping : (hasInput ? 4.5 : P.damping);
    const groundFactor = state.grounded ? 1 : 0.12;
    state.vel.x -= state.vel.x * Math.min(0.95, damp * groundFactor * dt);
    state.vel.z -= state.vel.z * Math.min(0.95, damp * groundFactor * dt);

    // clamp horizontal speed
    const hs = Math.hypot(state.vel.x, state.vel.z);
    if (hs > speedCap) {
      const f = speedCap / hs;
      state.vel.x *= f; state.vel.z *= f;
    }

    // gravity + tactical hop
    state.vel.y -= P.gravity * dt;
    if (wantJump) {
      if (state.grounded) {
        state.vel.y = P.jumpVel;
        state.grounded = false;
        audio.sfx('jump');
        fx.jumpRing(state.pos.x, state.pos.y - P.eye + 0.2, state.pos.z);
      }
      wantJump = false;
    }

    state.pos.addScaledVector(state.vel, dt);
    collide();

    // ground stick / landing
    const feetY = state.pos.y - P.eye;
    const gH = world.groundHeightAt(state.pos.x, state.pos.z, feetY);
    if (feetY <= gH + 0.02 && state.vel.y <= 0) {
      if (!state.grounded && state.vel.y < -13) {
        const impact = -state.vel.y;
        audio.sfx('land');
        fx.shake(Math.min(0.5, impact * 0.02));
        if (impact > 19) {
          state.hull = Math.max(0, state.hull - (impact - 19) * 1.6);
          hud.toast('HARD LANDING', `Hull at ${state.hull | 0}%`);
        }
      } else if (!state.grounded) {
        audio.sfx('landSoft');
      }
      state.grounded = true;
      state.vel.y = 0;
      state.pos.y = gH + P.eye;
    } else if (feetY > gH + 0.05) {
      state.grounded = false;
    }

    state.speed = Math.hypot(state.vel.x, state.vel.z);

    // firing
    if (fireHeld) tryFire();

    // prompts (boarding / interactables)
    let prompt = null;
    const veh = traffic.getVehicleNear && traffic.getVehicleNear(state.pos);
    if (veh) prompt = 'ENTER — BOARD AV';
    const b = prompt ? null : traffic.getBoardable(state.pos, state.pos.y - P.eye);
    if (b) prompt = `ENTER — BOARD ${b.train.line.split('—')[0].trim()}`;
    if (!prompt) {
      for (const it of world.interactables) {
        const label = typeof it.label === 'function' ? it.label() : it.label;
        if (!label) continue;
        const d = it.horizontal
          ? Math.hypot(state.pos.x - it.pos.x, state.pos.z - it.pos.z)
          : state.pos.distanceTo(it.pos);
        if (d < it.radius) { prompt = `ENTER — ${label}`; break; }
      }
    }
    hud.setPrompt(prompt);
    hud.setCrosshairInteract(!!prompt);

    applyCamera(dt, t);

    // avatar follows feet
    if (camMode === 'tp') {
      avatar.position.set(state.pos.x, state.pos.y - P.eye, state.pos.z);
      avatar.rotation.y = state.yaw + Math.PI;
      const bob = state.grounded ? Math.sin(t * 11) * Math.min(1, state.speed / P.walk) * 0.05 : 0;
      avatar.position.y += bob;
      avatar.rotation.z = state.rollVis * 1.6;
      bubble.position.set(state.pos.x, state.pos.y - 0.5, state.pos.z);
      const pulse = 1 + Math.sin(t * 3.2) * 0.04;
      bubble.scale.setScalar(pulse);
    }

    hud.setBars(state);
  }

  // ── camera rig: 1st person eye / 3rd person chase boom ──
  function applyCamera(dt, t) {
    // banking lean: A/D strafing banks like the ship; Q/E manual lean on top
    const speedF = clamp(state.speed / P.boost, 0, 1);
    let targetRoll = 0;
    if (keys.a) targetRoll = P.strafeBank * (0.35 + 0.65 * speedF);
    else if (keys.d) targetRoll = -P.strafeBank * (0.35 + 0.65 * speedF);
    targetRoll += -rotVel.yaw * 2.4 * speedF;   // banking from yaw rate at speed
    let leanT = 0;
    if (keys.q) leanT = P.leanAngle;
    else if (keys.e) leanT = -P.leanAngle;
    state.lean += (leanT - state.lean) * Math.min(1, dt * 8);
    state.rollVis += (targetRoll - state.rollVis) * Math.min(1, dt * 6);
    const roll = state.rollVis + state.lean;

    // head bob (subtle, grounded, moving)
    let bobY = 0, bobX = 0;
    if (state.grounded && state.speed > 0.4 && state.mode === 'walk') {
      const f = state.speed / P.walk;
      bobY = Math.sin(t * 11) * 0.045 * f;
      bobX = Math.cos(t * 5.5) * 0.03 * f;
    }

    if (camMode === 'fp') {
      camera.position.set(
        state.pos.x + bobX * Math.cos(state.yaw),
        state.pos.y + bobY,
        state.pos.z + bobX * -Math.sin(state.yaw)
      );
      camera.rotation.set(state.pitch, state.yaw, roll, 'YXZ');
      // Q/E lean shifts the head sideways a touch
      if (Math.abs(state.lean) > 0.01) {
        _right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
        camera.position.addScaledVector(_right, -state.lean * 1.6);
      }
    } else {
      _fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
      const boom = state.mode === 'fly' ? 12.5 : 6.8;
      const lift = state.mode === 'fly' ? 3.4 : 2.0;
      _v.copy(state.pos)
        .addScaledVector(_fwd, -boom)
        .add(_v2.set(0, lift - state.pitch * 3.4, 0));
      // keep boom out of buildings: nudge up if inside a collider
      if (!tpInit) { tpCam.copy(_v); tpInit = true; }
      tpCam.lerp(_v, 1 - Math.exp(-dt * 7));
      camera.position.copy(tpCam);
      _v2.copy(state.pos).addScaledVector(_fwd, 6).setY(state.pos.y + 0.4 - state.pitch * 6);
      camera.lookAt(_v2);
      camera.rotation.z += roll * 0.5;
    }
    fx.applyShake(camera);
  }

  const player = {
    state, keys, avatar, update,
    startDemo, stopDemo,
    start(demoMode) {
      state.started = true;
      hud.setCrosshair(mouse.x, mouse.y);
      if (demoMode) startDemo();
      else hud.toast('SURFACE PROTOCOL ACTIVE', 'Same controls, planetside — W-W to jump');
    },
    setPaused(p) { state.paused = p; },
    get camMode() { return camMode; },
    get _demo() { return demo; },
  };
  return player;
}
