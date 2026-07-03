// ════════════════════════════════════════════════════════════════
// VOLKARIS — the Captain (player controller)
//
// Spherical-gravity acrobatics: up is always the line from the
// planet's core through your boots (the Messenger trick — the
// character's up vector IS the surface normal). The movement basis
// re-orthonormalizes every frame as you walk around the ball, so
// running in a straight line quietly carries you around the world.
//
//   WASD move · MOUSE look/aim (click to lock) · LMB/F fire blaster
//   SHIFT sprint · SPACE jump (again mid-air = FLIP) · C roll
//   Q hover jets · E interact (board ship) · V camera distance
//
// Wall-running is automatic: leap alongside a wall with speed and
// the Captain sticks to it, feet hammering the neon.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { C, NEON, clamp, lerp } from './config.js';
import { makeCaptain } from './rig.js';

const P = C.PLAYER;
const _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _wish = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export function createPlayer({ scene, camera, planet, hud, audio, fx }) {
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
    heading: new THREE.Vector3(0, 0, 1),  // tangent unit vector (view yaw)
    camPitch: -0.12,
    grounded: true,
    groundNormal: new THREE.Vector3(0, 1, 0),
    airJumps: 1,
    flip: 0,           // 0..1 front-flip progress
    roll: 0,           // 0..1 ground-roll progress
    wall: null,        // { normal, side } while wall-running
    wallTime: 0,
    hoverFuel: P.hoverMax,
    hp: P.hpMax,
    energy: P.energyMax,
    dead: 0,
    started: false,
    paused: false,
    boarding: false,
    lastGroundDistrict: planet.districts[0],
    camDist: 5.4,
    fireHeld: false,
    aimW: 0,
  };
  // keep heading tangent at spawn
  {
    const up = state.pos.clone().normalize();
    state.heading.crossVectors(up, new THREE.Vector3(1, 0, 0)).normalize();
  }

  const keys = {};
  let sprintHeld = false, hoverHeld = false;
  let lastFire = 0;

  // ── input ──
  const canvas = document.getElementById('scene');
  function lockPointer() { if (!document.pointerLockElement) canvas.requestPointerLock?.(); }
  document.addEventListener('mousedown', (e) => {
    if (!state.started || state.paused || state.boarding) return;
    lockPointer();
    if (e.button === 0) state.fireHeld = true;
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) state.fireHeld = false; });
  document.addEventListener('mousemove', (e) => {
    if (!state.started || state.paused || !document.pointerLockElement) return;
    yawBy(-e.movementX * 0.0023);
    state.camPitch = clamp(state.camPitch - e.movementY * 0.0021, -1.15, 1.25);
  });
  function yawBy(a) {
    _up.copy(state.pos).normalize();
    state.heading.applyQuaternion(_q.setFromAxisAngle(_up, a)).normalize();
  }

  function onKeyDown(e) {
    if (!state.started) return;
    if (e.key === 'p' || e.key === 'P') { state.paused = !state.paused; hud.showPause(state.paused); return; }
    if (state.paused || state.dead || state.boarding) return;
    const k = e.key.toLowerCase();
    if (k === 'w') keys.w = true;
    if (k === 'a') keys.a = true;
    if (k === 's') keys.s = true;
    if (k === 'd') keys.d = true;
    if (k === 'shift') sprintHeld = true;
    if (k === 'q') hoverHeld = true;
    if (k === 'f') state.fireHeld = true;
    if (k === 'c' && !e.repeat) tryRoll();
    if (k === 'v') { state.camDist = state.camDist > 6.5 ? 5.4 : 8.5; hud.toast('CAMERA', state.camDist > 6.5 ? 'Wide' : 'Close'); }
    if (k === 'e' || e.key === 'Enter') interact();
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) tryJump(); }
    if (e.key === 'ArrowLeft') keys.left = true;
    if (e.key === 'ArrowRight') keys.right = true;
    if (e.key === 'ArrowUp') keys.up = true;
    if (e.key === 'ArrowDown') keys.down = true;
  }
  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'w') keys.w = false;
    if (k === 'a') keys.a = false;
    if (k === 's') keys.s = false;
    if (k === 'd') keys.d = false;
    if (k === 'shift') sprintHeld = false;
    if (k === 'q') hoverHeld = false;
    if (k === 'f') state.fireHeld = false;
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
    if (e.key === 'ArrowUp') keys.up = false;
    if (e.key === 'ArrowDown') keys.down = false;
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; sprintHeld = hoverHeld = false; state.fireHeld = false; });

  // ── actions ──
  function tryJump() {
    if (state.roll > 0) return;
    if (state.wall) {          // wall jump: kick away from the wall
      _up.copy(state.pos).normalize();
      state.vel.addScaledVector(state.wall.normal, P.wallJumpKick).addScaledVector(_up, P.jumpVel * 0.85);
      state.wall = null;
      state.airJumps = 1;
      rig.play('jump', { restart: true });
      audio.sfx('jump');
      return;
    }
    if (state.grounded) {
      _up.copy(state.pos).normalize();
      state.vel.addScaledVector(_up, P.jumpVel);
      state.grounded = false;
      rig.play('jump', { restart: true });
      audio.sfx('jump');
    } else if (state.airJumps > 0 && state.flip === 0) {
      // double jump = FRONT FLIP
      state.airJumps--;
      _up.copy(state.pos).normalize();
      const uv = state.vel.dot(_up);
      state.vel.addScaledVector(_up, P.flipVel - Math.max(0, uv) * 0.5);
      state.flip = 1e-4;
      rig.play('tuck', { fade: 0.08, restart: true });
      audio.sfx('jump');
    }
  }
  function tryRoll() {
    if (!state.grounded || state.roll > 0) return;
    state.roll = 1e-4;
    _up.copy(state.pos).normalize();
    _fwd.copy(state.heading);
    state.vel.addScaledVector(_fwd, P.rollBoost);
    rig.play('tuck', { fade: 0.06, restart: true });
    audio.sfx('landSoft');
  }
  function interact() {
    // board the ship at Port Meridian
    if (fx.canBoard(state.pos)) {
      state.boarding = true;
      state.fireHeld = false;
      document.exitPointerLock?.();
      fx.startLaunch(rig, state, camera);
    }
  }

  function damage(amount) {
    if (state.dead || state.boarding || state.roll > 0) return;   // rolling = i-frames
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

  // ── firing ──
  const _muzzleWorld = new THREE.Vector3();
  function updateFire(dt, t) {
    const wantAim = (state.fireHeld || t - lastFire < 0.6) && !state.dead && !state.boarding;
    state.aimW = lerp(state.aimW, wantAim ? 1 : 0, 1 - Math.pow(0.0001, dt));
    rig.setAim(state.camPitch, state.aimW);
    if (!state.fireHeld || state.dead || state.boarding) return;
    if (t - lastFire < 0.13) return;
    if (state.energy < P.boltCost) return;
    lastFire = t;
    state.energy -= P.boltCost;
    rig.kickRecoil();
    rig.blaster.userData.muzzle.getWorldPosition(_muzzleWorld);
    // aim: from eye along view (heading pitched by camPitch)
    _up.copy(state.pos).normalize();
    _right.crossVectors(state.heading, _up).negate().normalize();
    _fwd.copy(state.heading).applyQuaternion(_q.setFromAxisAngle(_right, state.camPitch)).normalize();
    fx.spawnBolt(_muzzleWorld, _fwd, { friendly: true, color: NEON.cyan, speed: 130, damage: 26 });
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
    if (state.boarding) { rig.update(dt); return; }   // fx drives the camera

    _up.copy(state.pos).normalize();
    // re-orthonormalize heading against current up (parallel transport)
    state.heading.addScaledVector(_up, -state.heading.dot(_up)).normalize();
    _right.crossVectors(state.heading, _up).negate().normalize();   // right = heading × up flipped → true right

    // arrow-key look
    if (keys.left) yawBy(2.4 * dt);
    if (keys.right) yawBy(-2.4 * dt);
    if (keys.up) state.camPitch = clamp(state.camPitch + 1.8 * dt, -1.15, 1.25);
    if (keys.down) state.camPitch = clamp(state.camPitch - 1.8 * dt, -1.15, 1.25);

    // wish direction in tangent plane
    _wish.set(0, 0, 0);
    if (keys.w) _wish.add(state.heading);
    if (keys.s) _wish.addScaledVector(state.heading, -1);
    if (keys.a) _wish.addScaledVector(_right, -1);
    if (keys.d) _wish.add(_right);
    const hasInput = _wish.lengthSq() > 0;
    if (hasInput) _wish.normalize();

    const sprinting = sprintHeld && state.grounded && keys.w;
    const maxSpeed = state.roll > 0 ? P.sprint + P.rollBoost : (sprinting ? P.sprint : P.walk);

    // ── flip / roll timers (root-motion driven spins) ──
    if (state.flip > 0) {
      state.flip += dt / 0.62;
      if (state.flip >= 1) { state.flip = 0; rig.play('fall', { fade: 0.14 }); }
    }
    if (state.roll > 0) {
      state.roll += dt / 0.5;
      if (state.roll >= 1) { state.roll = 0; rig.play(hasInput ? 'run' : 'idle', { fade: 0.12 }); }
    }

    // ── acceleration ──
    const tangentVel = _v.copy(state.vel).addScaledVector(_up, -state.vel.dot(_up));
    const accel = state.grounded ? P.accel : P.airAccel;
    if (hasInput && state.roll === 0) tangentVel.addScaledVector(_wish, accel * dt);
    // damping (ground only)
    if (state.grounded) {
      const damp = Math.max(0, 1 - P.damping * dt * (hasInput ? 0.35 : 1));
      tangentVel.multiplyScalar(damp);
    }
    // clamp tangent speed
    const ts = tangentVel.length();
    if (ts > maxSpeed) tangentVel.multiplyScalar(maxSpeed / ts);
    // recompose
    const radial = state.vel.dot(_up);
    state.vel.copy(tangentVel).addScaledVector(_up, radial);

    // ── gravity / hover / wall-run ──
    let g = P.gravity;
    if (state.wall) g = P.wallRunGrav;
    if (hoverHeld && !state.grounded && state.hoverFuel > 0) {
      g -= P.hoverThrust;
      state.hoverFuel -= dt;
      if (rig.current() !== 'hover' && state.flip === 0) rig.play('hover', { fade: 0.15 });
    }
    if (state.grounded) state.hoverFuel = Math.min(P.hoverMax, state.hoverFuel + dt * 0.8);
    state.vel.addScaledVector(_up, -g * dt);

    // ── integrate ──
    state.pos.addScaledVector(state.vel, dt);

    // ── wall detection / wall-run ──
    state.wall = null;
    const tSpeed = tangentVel.length();
    if (!state.grounded && tSpeed > 6.5) {
      for (const side of [-1, 1]) {
        _v2.copy(_right).multiplyScalar(side);
        const eye = _v3.copy(state.pos).addScaledVector(_up, 1.0);
        const hit = planet.probe(eye, _v2, P.radius + 0.75);
        if (hit) {
          state.wallTime += dt;
          if (state.wallTime < P.wallRunMax) {
            state.wall = { normal: hit.face.normal.clone(), side };
            // cling + keep speed along the wall
            state.vel.addScaledVector(_v2, 0.6 * dt * 10);
            const cur = state.vel.dot(state.heading);
            if (cur < P.wallRunSpeed) state.vel.addScaledVector(state.heading, (P.wallRunSpeed - cur) * 0.5);
            if (state.flip === 0 && state.roll === 0) rig.play(side < 0 ? 'wallrunL' : 'wallrunR', { fade: 0.12 });
          }
          break;
        }
      }
      if (!state.wall && state.wallTime > 0 && tSpeed < 6.5) state.wallTime = 0;
    } else {
      state.wallTime = 0;
    }

    // ── wall slide (horizontal collision) ──
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
    // never fall through the analytic terrain (BVH miss failsafe)
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

    // ── energy ──
    state.energy = Math.min(P.energyMax, state.energy + P.energyRegen * dt);

    // ── choose locomotion clip ──
    if (state.flip === 0 && state.roll === 0 && !state.wall) {
      if (state.grounded) {
        const sp = tangentVel.length();
        if (sp < 0.6) rig.play('idle', { fade: 0.22 });
        else if (sprinting && sp > P.walk + 1) rig.play('sprint');
        else if (sp > P.walk * 0.55) rig.play('run');
        else rig.play('walk');
      } else if (rig.current() !== 'hover' || !hoverHeld) {
        if (state.vel.dot(_up) < -3) rig.play('fall', { fade: 0.2 });
      }
    }

    // ── rig transform: feet at pos, up = surface up, face heading ──
    _fwd.copy(state.heading);
    // lean into strafes/sprints
    _m.makeBasis(_right, _up, _fwd);
    _q.setFromRotationMatrix(_m);
    if (state.flip > 0) {   // front flip: full pitch rotation around right axis
      const a = state.flip * Math.PI * 2;
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a));
    } else if (state.roll > 0) {
      const a = state.roll * Math.PI * 2;
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a));
    } else if (state.wall) {
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), state.wall.side * -0.35));
    }
    rig.group.position.copy(state.pos);
    if (state.flip > 0 || state.roll > 0) {
      // spin around the body centre, not the feet
      rig.group.position.addScaledVector(_up, 0.9);
      rig.group.quaternion.copy(_q);
      rig.group.position.addScaledVector(_v2.set(0, -0.9, 0).applyQuaternion(_q).normalize(), 0.0);
      rig.group.translateY(-0.9);
    } else {
      rig.group.quaternion.slerp(_q, 1 - Math.pow(0.00001, dt));
    }

    updateFire(dt, t);
    rig.update(dt);
    updateCamera(dt, false);
  }

  // ── chase camera (soft follow + collision) ──
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
    // camera collision: pull in if a wall blocks the boom
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
      hud.toast('CAPTAIN ON THE GROUND', 'Find the spaceport. Your ship is waiting.');
    },
    setPaused(p) { state.paused = p; },
  };
}
