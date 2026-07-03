// ════════════════════════════════════════════════════════════════
// VOLKARIS — the Captain (player controller)
//
// CONTROLS: the Interstellar Slingshot scheme, exactly as NEON CITY
// adapted it planetside — with the Captain's acrobatics on top:
//
//   W/S walk · A/D strafe (banks) · W-W double-tap = jump ·
//   in the air W-W again = FRONT FLIP · B boost · X brake ·
//   ARROW-key look with the ship's rotational inertia (CapsLock =
//   precision) · MOUSE = free aiming crosshair · CLICK/SPACE fire ·
//   C combat roll · Q hover jets · E board/interact · V camera ·
//   P pause. Wall-running is automatic at speed along walls.
//
// Spherical gravity: up is the line from the planet's core through
// your boots; the movement basis re-orthonormalizes every frame.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { C, NEON, clamp, lerp } from './config.js';
import { makeCaptain } from './rig.js';

const P = C.PLAYER;
const _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _wish = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();

export function createPlayer({ scene, camera, planet, hud, audio, fx, transit }) {
  const rig = makeCaptain();
  scene.add(rig.group);
  // suit lamp — keeps the Captain readable through the deep night
  const suitLamp = new THREE.PointLight(0x66d9ff, 0.6, 10, 1.6);
  suitLamp.position.set(0, 0.2, 0.5);
  rig.bones.chest.add(suitLamp);

  // spawn: crash site
  const spawnDir = planet.districts[0].dir.clone();
  const state = {
    pos: planet.surfacePoint(spawnDir).addScaledVector(spawnDir, 0.2),
    vel: new THREE.Vector3(),
    heading: new THREE.Vector3(0, 0, 1),
    camPitch: -0.08,
    grounded: true,
    groundNormal: new THREE.Vector3(0, 1, 0),
    airJumps: 1,
    flip: 0,
    roll: 0,
    wall: null,
    wallTime: 0,
    hoverFuel: P.hoverMax,
    hp: P.hpMax,
    energy: P.energyMax,
    dead: 0,
    started: false,
    paused: false,
    boarding: false,
    lastGroundDistrict: planet.districts[0],
    camDist: 5.2,
    fireHeld: false,
    aimW: 0,
    capsPrecision: false,
    strafeDir: 0,
    mode: 'walk',        // walk | ride (monorail) | pilot (vehicle)
    vehicle: null,
  };
  {
    const up = state.pos.clone().normalize();
    state.heading.crossVectors(up, new THREE.Vector3(1, 0, 0)).normalize();
    if (!state.heading.lengthSq()) state.heading.set(0, 0, 1);
  }

  const keys = {};
  const rotVel = { yaw: 0, pitch: 0 };   // the ship's rotational inertia
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  let lastWTap = 0, wantJump = false;
  let lastFire = 0;

  // ── input (NEON CITY scheme) ──
  function onKeyDown(e) {
    if (!state.started) return;
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); state.paused = !state.paused; hud.showPause(state.paused); return; }
    if (state.paused || state.dead || state.boarding) return;
    if (e.key === 'CapsLock') e.preventDefault();
    if (e.getModifierState) state.capsPrecision = e.getModifierState('CapsLock');

    const k = e.key.toLowerCase();
    if (k === 'w') {
      if (!e.repeat) {
        const now = performance.now();
        if (now - lastWTap < P.doubleTapMs) wantJump = true;   // W-W hop / air flip
        lastWTap = now;
      }
      keys.w = true;
    }
    if (k === 'a') keys.a = true;
    if (k === 's') keys.s = true;
    if (k === 'd') keys.d = true;
    if (k === 'b') keys.b = true;
    if (k === 'x') keys.x = true;
    if (k === 'q') keys.q = true;
    if (k === 'c' && !e.repeat) tryRoll();
    if (k === 'v') { state.camDist = state.camDist > 6.5 ? 5.2 : 8.5; hud.toast('CAMERA', state.camDist > 6.5 ? 'Wide' : 'Close'); }
    if (k === 'e' || e.key === 'Enter') { e.preventDefault(); interact(); }
    if (e.key === ' ') { e.preventDefault(); state.fireHeld = true; audio.resume(); }
    if (e.key === 'ArrowUp') { keys.up = true; e.preventDefault(); }
    if (e.key === 'ArrowDown') { keys.down = true; e.preventDefault(); }
    if (e.key === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (e.getModifierState) state.capsPrecision = e.getModifierState('CapsLock');
    const k = e.key.toLowerCase();
    if (k === 'w') keys.w = false;
    if (k === 'a') keys.a = false;
    if (k === 's') keys.s = false;
    if (k === 'd') keys.d = false;
    if (k === 'b') keys.b = false;
    if (k === 'x') keys.x = false;
    if (k === 'q') keys.q = false;
    if (e.key === ' ') state.fireHeld = false;
    if (e.key === 'ArrowUp') keys.up = false;
    if (e.key === 'ArrowDown') keys.down = false;
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; state.fireHeld = false; });

  // mouse = free crosshair, click = fire (no pointer lock)
  document.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (state.started && !state.paused) hud.setCrosshair(e.clientX, e.clientY);
  });
  document.addEventListener('mousedown', (e) => {
    if (!state.started || state.paused || state.dead || state.boarding) return;
    if (e.button === 0) { state.fireHeld = true; audio.resume(); }
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) state.fireHeld = false; });

  // ── actions ──
  function tryJump() {
    if (state.roll > 0) return;
    _up.copy(state.pos).normalize();
    if (state.wall) {
      state.vel.addScaledVector(state.wall.normal, P.wallJumpKick).addScaledVector(_up, P.jumpVel * 0.85);
      state.wall = null;
      state.airJumps = 1;
      rig.play('jump', { restart: true });
      audio.sfx('jump');
      return;
    }
    if (state.grounded) {
      state.vel.addScaledVector(_up, P.jumpVel);
      state.grounded = false;
      rig.play('jump', { restart: true });
      audio.sfx('jump');
    } else if (state.airJumps > 0 && state.flip === 0) {
      state.airJumps--;
      const uv = state.vel.dot(_up);
      state.vel.addScaledVector(_up, P.flipVel - Math.max(0, uv) * 0.5);
      state.flip = 1e-4;
      rig.play('tuck', { fade: 0.08, restart: true });
      audio.sfx('jump');
    }
  }
  function tryRoll() {
    if (!state.grounded || state.roll > 0 || state.paused || state.dead || state.boarding) return;
    state.roll = 1e-4;
    state.vel.addScaledVector(state.heading, P.rollBoost);
    rig.play('tuck', { fade: 0.06, restart: true });
    audio.sfx('landSoft');
  }
  function interact() {
    if (state.mode === 'ride') {
      if (transit && transit.dwelling()) exitRide();
      else hud.toast('IN TRANSIT', 'Disembark at the next station stop');
      return;
    }
    if (state.mode === 'pilot') {
      tryLandVehicle();
      return;
    }
    if (fx.canBoard(state.pos)) {
      state.boarding = true;
      state.fireHeld = false;
      fx.startLaunch(rig, state, camera);
      return;
    }
    if (transit) {
      const v = transit.vehicleNear(state.pos);
      if (v) { enterVehicle(v); return; }
      const st = transit.boardableStation(state.pos);
      if (st) {
        state.mode = 'ride';
        rig.play('idle', { fade: 0.2 });
        hud.toast('BOARDED — ORBITAL LOOP', 'E to disembark at a station stop');
        audio.sfx('doors');
        return;
      }
    }
  }

  // ── monorail riding ──
  function exitRide() {
    state.mode = 'walk';
    const st = transit.stations[(transit.train.nextIdx + transit.stations.length - 1) % transit.stations.length];
    state.pos.copy(st.boardPos);
    state.vel.set(0, 0, 0);
    hud.toast('ARRIVED — ' + st.name, 'Mind the drop');
    audio.sfx('chime');
  }
  function updateRide(dt) {
    transit.carAnchor(state.pos);
    _up.copy(state.pos).normalize();
    transit.carForward(_fwd);
    _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize();
    state.heading.lerp(_fwd, 1 - Math.pow(0.001, dt)).normalize();
    _right.crossVectors(state.heading, _up).negate().normalize();
    _m.makeBasis(_right, _up, state.heading);
    rig.group.position.copy(state.pos);
    rig.group.quaternion.slerp(_q.setFromRotationMatrix(_m), 1 - Math.pow(0.001, dt));
    rig.play('idle');
  }

  // ── pilotable vehicles (the NC AV rules: thrust where you look) ──
  function enterVehicle(v) {
    state.mode = 'pilot';
    state.vehicle = v;
    v.occupied = true;
    rig.group.visible = false;
    state.vel.set(0, 0, 0);
    hud.toast(v.kind === 'av' ? 'AV ONLINE' : 'SPEEDER ONLINE',
      v.kind === 'av' ? 'W thrust where you look, no gravity. E to land.' : 'W throttle — hugs the deck. E to park.');
    audio.sfx('shieldUp');
  }
  function tryLandVehicle() {
    const v = state.vehicle;
    _up.copy(state.pos).normalize();
    const gh = planet.groundHit(state.pos, 2.5, 12);
    const height = gh ? state.pos.dot(_up) - gh.point.dot(_up) : 99;
    if (state.vel.length() > 6 || height > 4) {
      hud.toast('TOO FAST / TOO HIGH', 'Slow down near the deck to land');
      return;
    }
    v.grp.position.copy(gh ? gh.point.clone().addScaledVector(_up, 0.7) : state.pos);
    v.occupied = false;
    state.mode = 'walk';
    state.vehicle = null;
    state.pos.copy(v.grp.position).addScaledVector(_up, 0.4).addScaledVector(_right, 2.0);
    state.vel.set(0, 0, 0);
    rig.group.visible = true;
    hud.toast('PARKED', 'On foot');
    audio.sfx('shieldDown');
  }
  function updatePilot(dt) {
    const v = state.vehicle;
    _up.copy(state.pos).normalize();
    state.heading.addScaledVector(_up, -state.heading.dot(_up)).normalize();
    _right.crossVectors(state.heading, _up).negate().normalize();
    // look direction (heading pitched for AVs)
    const flying = v.kind === 'av';
    _fwd.copy(state.heading);
    // NB: boom pitch and view pitch have opposite signs — negate so
    // "camera looks up" means "thrust up" (this pinned AVs to the deck)
    if (flying) _fwd.applyQuaternion(_q.setFromAxisAngle(_right, -state.camPitch)).normalize();
    const thrust = keys.b ? 42 : 24;
    if (keys.w) state.vel.addScaledVector(_fwd, thrust * dt);
    if (keys.s) state.vel.addScaledVector(_fwd, -thrust * 0.6 * dt);
    if (keys.a) state.vel.addScaledVector(_right, -thrust * 0.5 * dt);
    if (keys.d) state.vel.addScaledVector(_right, thrust * 0.5 * dt);
    state.vel.multiplyScalar(Math.max(0, 1 - (keys.x ? 3.2 : 0.9) * dt));
    if (!flying) {
      // speeder: glued near the deck
      state.vel.addScaledVector(_up, -26 * dt);
    }
    // collision: probe along motion
    const sp = state.vel.length();
    if (sp > 0.5) {
      _v2.copy(state.vel).normalize();
      const hit = planet.probe(state.pos, _v2, sp * dt + 1.6);
      if (hit && hit.distance < sp * dt + 1.4) {
        const into = state.vel.dot(hit.face.normal);
        if (into < 0) state.vel.addScaledVector(hit.face.normal, -into);
      }
    }
    state.pos.addScaledVector(state.vel, dt);
    // altitude clamp
    const gh = planet.groundHit(state.pos, 3, 30);
    if (gh) {
      const h = state.pos.dot(_up) - gh.point.dot(_up);
      const minH = flying ? 1.2 : 1.0;
      if (h < minH) {
        state.pos.copy(gh.point).addScaledVector(_up, minH);
        const rv = state.vel.dot(_up);
        if (rv < 0) state.vel.addScaledVector(_up, -rv);
      }
      if (!flying && h > 2.4) {   // speeder can't climb walls of air
        state.pos.copy(gh.point).addScaledVector(_up, 2.4);
      }
    }
    // vehicle mesh = the avatar
    _m.makeBasis(_right, _up, state.heading);
    v.grp.position.copy(state.pos);
    const bank = clamp((keys.a ? 0.3 : 0) - (keys.d ? 0.3 : 0) + rotVel.yaw * 12, -0.5, 0.5);
    _q.setFromRotationMatrix(_m).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bank));
    v.grp.quaternion.slerp(_q, 1 - Math.pow(0.0001, dt));
    v.grp.userData.engine.material.opacity = 0.6 + Math.min(0.4, sp * 0.02);
  }

  function damage(amount) {
    if (state.dead || state.boarding || state.roll > 0) return;
    state.hp -= amount;
    hud.hitFlash();
    if (state.hp <= 0) {
      state.hp = 0;
      state.dead = 2.6;
      rig.play('die', { fade: 0.1, restart: true });
      audio.sfx('boom');
      hud.toast('SUIT INTEGRITY LOST', 'Recovering…');
    }
  }

  function respawn() {
    const d = state.lastGroundDistrict ?? planet.districts[0];
    state.pos.copy(planet.surfacePoint(d.dir)).addScaledVector(d.dir, 0.4);
    state.vel.set(0, 0, 0);
    state.hp = P.hpMax;
    state.energy = P.energyMax;
    state.dead = 0;
    state.flip = 0; state.roll = 0; state.wall = null;
    rig.play('idle', { restart: true });
  }

  // ── firing: bolts fly through the CROSSHAIR (free mouse aim) ──
  const _muzzleWorld = new THREE.Vector3();
  const aimDir = new THREE.Vector3(0, 0, 1);
  function computeAimDir() {
    _ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    // aim at whatever the crosshair ray meets (or far along it)
    const hit = planet.probe(_ray.ray.origin, _ray.ray.direction, 300);
    const target = hit ? hit.point : _v3.copy(_ray.ray.origin).addScaledVector(_ray.ray.direction, 120);
    rig.blaster.userData.muzzle.getWorldPosition(_muzzleWorld);
    aimDir.copy(target).sub(_muzzleWorld).normalize();
  }
  function updateFire(dt, t) {
    const wantAim = (state.fireHeld || t - lastFire < 0.6) && !state.dead && !state.boarding;
    state.aimW = lerp(state.aimW, wantAim ? 1 : 0, 1 - Math.pow(0.0001, dt));
    if (wantAim) {
      computeAimDir();
      _up.copy(state.pos).normalize();
      const pitch = Math.asin(clamp(aimDir.dot(_up), -1, 1));
      rig.setAim(pitch, state.aimW);
    } else {
      rig.setAim(0, state.aimW);
    }
    if (!state.fireHeld || state.dead || state.boarding) return;
    if (t - lastFire < 0.13) return;
    if (state.energy < P.boltCost) return;
    lastFire = t;
    state.energy -= P.boltCost;
    rig.kickRecoil();
    fx.spawnBolt(_muzzleWorld, aimDir, { friendly: true, color: NEON.cyan, speed: 130, damage: 26 });
    audio.sfx('laser');
  }

  // ── main update ──
  function update(dt, t) {
    if (!state.started || state.paused) return;
    if (state.dead > 0) {
      state.dead -= dt;
      rig.update(dt);
      if (state.dead <= 0) respawn();
      updateCamera(dt, true);
      return;
    }
    if (state.boarding) { rig.update(dt); return; }

    _up.copy(state.pos).normalize();
    state.heading.addScaledVector(_up, -state.heading.dot(_up)).normalize();
    _right.crossVectors(state.heading, _up).negate().normalize();

    // ── ARROW look with the ship's rotational inertia ──
    const rot = P.rot;
    const accel = state.capsPrecision ? rot.precAccel : rot.accel;
    const maxSp = state.capsPrecision ? rot.precMaxSpeed : rot.maxSpeed;
    const f60 = dt * 60;   // NC constants are per-frame at 60 fps
    if (keys.left) rotVel.yaw = clamp(rotVel.yaw + accel * f60, -maxSp, maxSp);
    if (keys.right) rotVel.yaw = clamp(rotVel.yaw - accel * f60, -maxSp, maxSp);
    if (keys.up) rotVel.pitch = clamp(rotVel.pitch + accel * f60, -maxSp, maxSp);
    if (keys.down) rotVel.pitch = clamp(rotVel.pitch - accel * f60, -maxSp, maxSp);
    const dec = Math.pow(rot.decel, f60);
    if (!keys.left && !keys.right) rotVel.yaw *= dec;
    if (!keys.up && !keys.down) rotVel.pitch *= dec;
    if (rotVel.yaw) {
      state.heading.applyQuaternion(_q.setFromAxisAngle(_up, rotVel.yaw * f60)).normalize();
      _right.crossVectors(state.heading, _up).negate().normalize();
    }
    state.camPitch = clamp(state.camPitch + rotVel.pitch * f60, -1.15, 1.25);

    // ── transit modes take over movement entirely ──
    if (state.mode === 'ride') {
      wantJump = false;
      updateRide(dt);
      rig.update(dt);
      updateCamera(dt, false);
      return;
    }
    if (state.mode === 'pilot') {
      wantJump = false;
      updatePilot(dt);
      updateCamera(dt, false);
      return;
    }

    // W-W jump request from the input handler
    if (wantJump) { wantJump = false; tryJump(); }

    // ── wish direction ──
    _wish.set(0, 0, 0);
    state.strafeDir = 0;
    if (keys.w) _wish.add(state.heading);
    if (keys.s) _wish.addScaledVector(state.heading, -1);
    if (keys.a) { _wish.addScaledVector(_right, -1); state.strafeDir = -1; }
    if (keys.d) { _wish.add(_right); state.strafeDir = 1; }
    const hasInput = _wish.lengthSq() > 0;
    if (hasInput) _wish.normalize();

    // B boost drains the cell; X brake stops hard
    const boosting = keys.b && state.energy > 1 && hasInput;
    if (boosting) state.energy = Math.max(0, state.energy - P.boostDrain * dt);
    const maxSpeed = state.roll > 0 ? P.boost + P.rollBoost : (boosting ? P.boost : P.walk);

    // ── flip / roll timers ──
    if (state.flip > 0) {
      state.flip += dt / 0.62;
      if (state.flip >= 1) { state.flip = 0; rig.play('fall', { fade: 0.14 }); }
    }
    if (state.roll > 0) {
      state.roll += dt / 0.5;
      if (state.roll >= 1) { state.roll = 0; rig.play(hasInput ? 'run' : 'idle', { fade: 0.12 }); }
    }

    // ── acceleration / damping ──
    const tangentVel = _v.copy(state.vel).addScaledVector(_up, -state.vel.dot(_up));
    const acc = state.grounded ? P.accel : P.airAccel;
    if (hasInput && state.roll === 0) tangentVel.addScaledVector(_wish, acc * dt);
    if (state.grounded) {
      const dampK = keys.x ? P.brakeDamping : P.damping;
      const damp = Math.max(0, 1 - dampK * dt * (hasInput && !keys.x ? 0.35 : 1));
      tangentVel.multiplyScalar(damp);
    }
    const ts0 = tangentVel.length();
    if (ts0 > maxSpeed) tangentVel.multiplyScalar(maxSpeed / ts0);
    const radial = state.vel.dot(_up);
    state.vel.copy(tangentVel).addScaledVector(_up, radial);

    // ── gravity / hover / wall-run ──
    let g = P.gravity;
    if (state.wall) g = P.wallRunGrav;
    if (keys.q && !state.grounded && state.hoverFuel > 0) {
      g -= P.hoverThrust;
      state.hoverFuel -= dt;
      if (rig.current() !== 'hover' && state.flip === 0) rig.play('hover', { fade: 0.15 });
    }
    if (state.grounded) state.hoverFuel = Math.min(P.hoverMax, state.hoverFuel + dt * 0.8);
    state.vel.addScaledVector(_up, -g * dt);

    // ── integrate ──
    state.pos.addScaledVector(state.vel, dt);

    // ── wall-run detection ──
    state.wall = null;
    const tSpeed = tangentVel.length();
    if (!state.grounded && tSpeed > 6.0) {
      for (const side of [-1, 1]) {
        _v2.copy(_right).multiplyScalar(side);
        const eye = _v3.copy(state.pos).addScaledVector(_up, 1.0);
        const hit = planet.probe(eye, _v2, P.radius + 0.75);
        if (hit) {
          state.wallTime += dt;
          if (state.wallTime < P.wallRunMax) {
            state.wall = { normal: hit.face.normal.clone(), side };
            state.vel.addScaledVector(_v2, 0.6 * dt * 10);
            const cur = state.vel.dot(state.heading);
            if (cur < P.wallRunSpeed) state.vel.addScaledVector(state.heading, (P.wallRunSpeed - cur) * 0.5);
            if (state.flip === 0 && state.roll === 0) rig.play(side < 0 ? 'wallrunL' : 'wallrunR', { fade: 0.12 });
          }
          break;
        }
      }
      if (!state.wall && state.wallTime > 0 && tSpeed < 6.0) state.wallTime = 0;
    } else {
      state.wallTime = 0;
    }

    // ── wall slide ──
    if (tSpeed > 0.5) {
      const eye = _v3.copy(state.pos).addScaledVector(_up, 0.9);
      _v2.copy(tangentVel).normalize();
      const hit = planet.probe(eye, _v2, P.radius + tSpeed * dt + 0.15);
      if (hit && hit.distance < P.radius + 0.2) {
        const n = hit.face.normal;
        const into = state.vel.dot(n);
        if (into < 0) state.vel.addScaledVector(n, -into);
        state.pos.addScaledVector(n, (P.radius + 0.2 - hit.distance) * 0.5);
      }
    }

    // ── ground snap ──
    const gh = planet.groundHit(state.pos, 2.4, 8);
    const wasGrounded = state.grounded;
    if (gh) {
      const height = state.pos.dot(_up) - gh.point.dot(_up);
      const falling = state.vel.dot(_up) <= 0.01;
      if (height <= 0.28 && falling) {
        state.pos.copy(gh.point);
        const rv = state.vel.dot(_up);
        state.vel.addScaledVector(_up, -rv);
        state.grounded = true;
        state.groundNormal.copy(gh.normal);
        state.airJumps = 1;
        if (!wasGrounded) {
          const impact = -rv;
          if (state.flip > 0) { state.flip = 0; tryRollOnLand(impact); }
          else if (impact > 16) { tryRollOnLand(impact); }
          else audio.sfx(impact > 8 ? 'land' : 'landSoft');
        }
        const d = planet.districtAt(state.pos);
        if (d) state.lastGroundDistrict = d;
      } else if (height > 0.34) {
        state.grounded = false;
      }
    } else {
      state.grounded = false;
    }
    const minR = planet.terrainHeight(_v2.copy(state.pos).normalize());
    if (state.pos.length() < minR - 1.5) {
      state.pos.setLength(minR + 0.1);
      state.vel.multiplyScalar(0.2);
      state.grounded = true;
    }

    function tryRollOnLand(impact) {
      state.roll = 1e-4;
      rig.play('tuck', { fade: 0.05, restart: true });
      audio.sfx('land');
      if (impact > 30) damage((impact - 30) * 2.5);
    }

    state.energy = Math.min(P.energyMax, state.energy + P.energyRegen * dt);

    // ── locomotion clip ──
    if (state.flip === 0 && state.roll === 0 && !state.wall) {
      if (state.grounded) {
        const sp = tangentVel.length();
        if (sp < 0.6) rig.play('idle', { fade: 0.22 });
        else if (boosting && sp > P.walk + 1) rig.play('sprint');
        else if (sp > P.walk * 0.55) rig.play('run');
        else rig.play('walk');
      } else if (rig.current() !== 'hover' || !keys.q) {
        if (state.vel.dot(_up) < -3) rig.play('fall', { fade: 0.2 });
      }
    }

    // ── rig transform (bank on strafe, spins on flip/roll) ──
    _fwd.copy(state.heading);
    _m.makeBasis(_right, _up, _fwd);
    _q.setFromRotationMatrix(_m);
    if (state.flip > 0 || state.roll > 0) {
      const a = (state.flip || state.roll) * Math.PI * 2;
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a));
      rig.group.position.copy(state.pos).addScaledVector(_up, 0.9);
      rig.group.quaternion.copy(_q);
      rig.group.translateY(-0.9);
    } else {
      if (state.wall) {
        _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), state.wall.side * -0.35));
      } else if (state.strafeDir && state.grounded) {
        _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -state.strafeDir * P.strafeBank));
      }
      rig.group.position.copy(state.pos);
      rig.group.quaternion.slerp(_q, 1 - Math.pow(0.00001, dt));
    }

    updateFire(dt, t);
    rig.update(dt);
    updateCamera(dt, false);
  }

  // ── chase camera ──
  const camPos = new THREE.Vector3();
  let camInit = false;
  function updateCamera(dt, deadCam) {
    _up.copy(state.pos).normalize();
    _right.crossVectors(state.heading, _up).negate().normalize();
    _fwd.copy(state.heading).applyQuaternion(_q.setFromAxisAngle(_right, state.camPitch * 0.85)).normalize();
    const dist = deadCam ? 7.5 : state.camDist;
    const want = _v.copy(state.pos)
      .addScaledVector(_up, 2.0 + state.camPitch * -1.2)
      .addScaledVector(_fwd, -dist);
    const eye = _v3.copy(state.pos).addScaledVector(_up, 1.55);
    const toCam = _v2.copy(want).sub(eye);
    const len = toCam.length();
    toCam.normalize();
    const hit = planet.probe(eye, toCam, len + 0.3);
    if (hit && hit.distance < len) want.copy(eye).addScaledVector(toCam, Math.max(0.6, hit.distance - 0.3));
    if (!camInit) { camPos.copy(want); camInit = true; }
    camPos.lerp(want, 1 - Math.pow(0.0001, dt));
    camera.position.copy(camPos);
    camera.up.copy(_up);
    camera.lookAt(_v.copy(state.pos).addScaledVector(_up, 1.55).addScaledVector(state.heading, 1.2));
  }

  return {
    state, rig, update, damage, suitLamp,
    start() {
      state.started = true;
      rig.play('idle');
      hud.setCrosshair(mouse.x, mouse.y);
      hud.toast('CAPTAIN ON THE GROUND', 'Find the spaceport. Your ship is waiting.');
    },
    setPaused(p) { state.paused = p; },
  };
}
