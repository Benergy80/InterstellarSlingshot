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
import { makeGLTFRig, ASTRO_MAP, SENTINEL_MAP } from './gltfrig.js';

const P = C.PLAYER;
const _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _wish = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();

export function createPlayer({ scene, camera, planet, hud, audio, fx, transit, models }) {
  // THE CAPTAIN: the gold Astronaut (Ben's pick for now — the Meshy
  // Silver Sentinel stays wired via SENTINEL_MAP, flip USE_SENTINEL
  // to bring him back), else the procedural rig
  const USE_SENTINEL = false;
  const rig = USE_SENTINEL && models?.kay?.Sentinel
    ? makeGLTFRig(models.kay.Sentinel, {
        scale: 1.12, withBlaster: true, clipMap: SENTINEL_MAP,
      })
    : models?.kay?.Astronaut
    ? makeGLTFRig(models.kay.Astronaut, {
        scale: 1.0, withBlaster: true, clipMap: ASTRO_MAP,
        tints: {
          SciFi_Main: { color: 0xd8a72c, metalness: 0.75, roughness: 0.3 },   // gold plates
          SciFi_MainDark: { color: 0x1c2244, metalness: 0.6, roughness: 0.45 }, // navy undersuit
          SciFi_Light: { color: 0xbfb391, metalness: 0.55, roughness: 0.4 },  // warm bone, no bloom
          SciFi_Light_Accent: { color: 0x1a9ec0, emissive: 0x00c8ee, emissiveIntensity: 0.3 },
          Grey: { color: 0x0a1a2a, emissive: 0x00e0ff, emissiveIntensity: 0.4 }, // visor glow
        },
      })
    : makeCaptain();
  // blaster barrel alignment: the Astronaut wrist bone's +Z points out the
  // side of the fist — this offset (measured in the raised shooting pose)
  // lays the barrel along the arm's line of fire
  if (rig.setGunRot) rig.setGunRot(-1.623, 0.166, 1.751);
  scene.add(rig.group);
  // suit lamp — keeps the Captain readable through the deep night
  const suitLamp = new THREE.PointLight(0x66d9ff, 0.6, 10, 1.6);
  suitLamp.position.set(0, 0.2, 0.5);
  rig.bones.chest.add(suitLamp);

  // jetpack — worn on the back (rig faces +Z), fixed to the group so
  // armature scale tracks can't distort it (the giant-blaster lesson)
  const jetpack = new THREE.Group();
  {
    const packMat = new THREE.MeshStandardMaterial({ color: 0x1c2244, metalness: 0.7, roughness: 0.35 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd8a72c, metalness: 0.8, roughness: 0.3 });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.24), packMat);
    jetpack.add(shell);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.66, 0.1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00c8ee).multiplyScalar(1.1), toneMapped: false }));
    spine.position.z = -0.1;
    jetpack.add(spine);
    jetpack.userData.flames = [];
    for (const s of [-1, 1]) {
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.105, 0.28, 6), goldMat);
      noz.position.set(s * 0.17, -0.42, 0);
      jetpack.add(noz);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0x66e6ff).multiplyScalar(1.3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      fl.rotation.x = Math.PI;
      fl.position.set(s * 0.17, -0.82, 0);
      fl.visible = false;
      jetpack.add(fl);
      jetpack.userData.flames.push(fl);
    }
    jetpack.scale.setScalar(0.4);            // sized to the suit, not the room
    jetpack.position.set(0, 1.28, -0.22);
    rig.group.add(jetpack);
  }

  // spawn: crash-site pad edge, looking down the road to the market
  // (offset so the camera boom never starts inside the wreck)
  const spawnDir = planet.districts[0].dir.clone();
  {
    const sd = spawnDir.clone().multiplyScalar(0.995).addScaledVector(new THREE.Vector3(0, 1, 0), 0.06).normalize();
    spawnDir.copy(sd);
  }
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
    camDist: 4.2,
    fireHeld: false,
    aimW: 0,
    melee: { kind: null, t: 0, hitDone: false, side: 0, cool: 0 },
    jetArmed: false,     // CapsLock master switch
    capsPrecision: false,
    strafeDir: 0,
    mode: 'walk',        // walk | ride (monorail) | pilot (vehicle)
    vehicle: null,
  };
  {
    const up = state.pos.clone().normalize();
    // face the first street (toward the market road waypoint)
    const target = planet.surfacePoint(new THREE.Vector3(
      Math.cos(10 * 0.01745) * Math.cos(14 * 0.01745),
      Math.sin(10 * 0.01745),
      Math.cos(10 * 0.01745) * Math.sin(14 * 0.01745)));
    state.heading.copy(target).sub(state.pos);
    state.heading.addScaledVector(up, -state.heading.dot(up)).normalize();
    if (!state.heading.lengthSq()) state.heading.set(0, 0, 1);
  }

  const keys = {};
  let npcsRef = null;          // wired by main via bindTargets()
  let lockTarget = null;       // soft-lock: the enemy we're confronting
  const rotVel = { yaw: 0, pitch: 0 };   // the ship's rotational inertia
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  let lastWTap = 0, wantJump = false, spaceHeld = false, runMode = true;
  let lastFire = 0;

  // ── input (NEON CITY scheme) ──
  function onKeyDown(e) {
    if (!state.started) return;
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); state.paused = !state.paused; hud.showPause(state.paused); return; }
    if (state.paused || state.dead || state.boarding) return;
    // CAPSLOCK = jetpack master switch: ON is on, OFF is off.
    // (macOS fires keydown only when engaging and keyup only when
    // releasing, so both handlers read the modifier state.)
    if (e.getModifierState) {
      const armed = e.getModifierState('CapsLock');
      if (armed !== state.jetArmed) {
        state.jetArmed = armed;
        hud.toast(armed ? 'JETPACK — ON' : 'JETPACK — OFF',
          armed ? 'CapsLock engaged — burn while it lasts' : 'CapsLock released');
        if (armed) audio.resume();
      }
    }

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
    if (k === 'v') { state.camDist = state.camDist > 6.5 ? 4.2 : 8.5; hud.toast('CAMERA', state.camDist > 6.5 ? 'Wide' : 'Close'); }
    if (k === 'e' || e.key === 'Enter') { e.preventDefault(); interact(); }
    // SPACE: tap on the ground toggles run/walk pace; held in the air
    // it fires the jetpack
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) {
        audio.resume();
        spaceHeld = true;
        if (state.grounded && state.mode === 'walk' && !state.dead && !state.boarding) {
          runMode = !runMode;
          hud.toast(runMode ? 'PACE — RUN' : 'PACE — WALK', runMode ? 'Double-tap W to jump' : 'Taking it slow');
        }
      }
    }
    // LEFT Shift = punch, RIGHT Shift = kick (e.location: 1=left, 2=right)
    if (e.key === 'Shift' && !e.repeat) { e.preventDefault(); tryMelee(e.location === 2 ? 'kick' : 'punch'); }
    if (e.key === 'ArrowUp') { keys.up = true; e.preventDefault(); }
    if (e.key === 'ArrowDown') { keys.down = true; e.preventDefault(); }
    if (e.key === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (e.getModifierState) {
      const armed = e.getModifierState('CapsLock');
      if (armed !== state.jetArmed) {
        state.jetArmed = armed;
        hud.toast(armed ? 'JETPACK — ON' : 'JETPACK — OFF',
          armed ? 'CapsLock engaged — burn while it lasts' : 'CapsLock released');
      }
    }
    const k = e.key.toLowerCase();
    if (k === 'w') keys.w = false;
    if (e.key === ' ') spaceHeld = false;
    if (k === 'a') keys.a = false;
    if (k === 's') keys.s = false;
    if (k === 'd') keys.d = false;
    if (k === 'b') keys.b = false;
    if (k === 'x') keys.x = false;
    if (k === 'q') keys.q = false;
    if (e.key === 'ArrowUp') keys.up = false;
    if (e.key === 'ArrowDown') keys.down = false;
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; state.fireHeld = false; spaceHeld = false; });

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
  function tryMelee(kind) {
    if (!state.started || state.paused || state.dead || state.boarding || state.mode !== 'walk') return;
    const m = state.melee;
    if (m.cool > 0 || state.roll > 0) return;
    m.kind = kind;
    m.t = 0;
    m.hitDone = false;
    m.side = 1 - m.side;   // alternate fists/feet for combos
    m.cool = kind === 'kick' ? 0.55 : 0.38;
    m.dur = kind === 'kick' ? 0.5 : 0.36;
    rig.play(kind === 'kick' ? (m.side ? 'kickR' : 'kickL') : (m.side ? 'punchR' : 'punchL'),
      { fade: 0.06, restart: true });
    audio.sfx('jump');   // swing whoosh
    // a short lunge toward the target sells the impact
    state.vel.addScaledVector(state.heading, kind === 'kick' ? 2.2 : 1.4);
  }
  function meleeStrike() {
    const m = state.melee;
    const range = m.kind === 'kick' ? 3.0 : 2.4;
    const dmg = m.kind === 'kick' ? 42 : 28;
    if (!npcsRef) return;
    let connected = false;
    for (const n of npcsRef.list) {
      if (n.state === 'dead') continue;
      _v.copy(n.pos).sub(state.pos);
      const d = _v.length();
      if (d > range + (n.radius ?? 0.5)) continue;
      _v.addScaledVector(_up, -_v.dot(_up));
      if (_v.lengthSq() > 1e-6 && _v.normalize().dot(state.heading) < 0.3) continue;
      npcsRef.applyHit(n, dmg, n.pos);
      if (n.rig && n.rig.play) n.rig.play('hit', { fade: 0.05, restart: true });
      connected = true;
    }
    if (connected) {
      audio.sfx('land');   // meaty impact thud
      window.VK?.details?.shake?.(0.35);
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
        transit.setRider(st);
        transit.carForward(state.heading);   // start facing down the line
        _up.copy(state.pos).normalize();
        state.heading.addScaledVector(_up, -state.heading.dot(_up)).normalize();
        rig.play('idle', { fade: 0.2 });
        hud.toast('BOARDED — ' + st.line.key, 'Arrows look around · E to disembark at a stop');
        audio.sfx('doors');
        return;
      }
    }
  }

  // ── monorail riding ──
  function exitRide() {
    state.mode = 'walk';
    const st = transit.riderStation();
    transit.setRider(null);
    if (st) {
      state.pos.copy(st.boardPos);
      hud.toast('ARRIVED — ' + st.name, 'Mind the drop');
    }
    state.vel.set(0, 0, 0);
    audio.sfx('chime');
  }
  function updateRide(dt) {
    // stand INSIDE the car; heading stays free — the arrow keys (already
    // processed above) let you turn and look all around while riding
    transit.carAnchor(state.pos);
    _up.copy(state.pos).normalize();
    state.heading.addScaledVector(_up, -state.heading.dot(_up)).normalize();
    // the rig faces down the line regardless of where you look
    transit.carForward(_fwd);
    _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize();
    _right.crossVectors(_fwd, _up).negate().normalize();
    _m.makeBasis(_right, _up, _fwd);
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
    if (keys.a) state.vel.addScaledVector(_right, thrust * 0.5 * dt);
    if (keys.d) state.vel.addScaledVector(_right, -thrust * 0.5 * dt);
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
    if (rig.blaster) rig.blaster.userData.muzzle.getWorldPosition(_muzzleWorld);
    else _muzzleWorld.copy(state.pos).addScaledVector(_up, 1.3);
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
    // Fortnite-style: up/down arrows tilt the camera while held, then it
    // springs smoothly back to the standard over-shoulder framing. Pilot
    // mode keeps manual pitch — there it IS the flight control.
    if (state.mode === 'walk' && !keys.up && !keys.down) {
      rotVel.pitch *= Math.pow(0.02, dt);   // shed look-inertia fast once released
      state.camPitch = lerp(state.camPitch, P.camPitchHome, 1 - Math.pow(0.08, dt));
    }

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
    // NB: _right is the RIG's +x (screen-left); strafe signs account for it
    if (keys.a) { _wish.add(_right); state.strafeDir = -1; }
    if (keys.d) { _wish.addScaledVector(_right, -1); state.strafeDir = 1; }
    const hasInput = _wish.lengthSq() > 0;
    if (hasInput) _wish.normalize();

    // B boost drains the cell; SPACE toggles run/walk pace; X brake stops hard
    const boosting = keys.b && state.energy > 1 && hasInput;
    if (boosting) state.energy = Math.max(0, state.energy - P.boostDrain * dt);
    const sprinting = boosting;
    const maxSpeed = state.roll > 0 ? P.boost + P.rollBoost
      : boosting ? P.boost
      : runMode ? P.walk
      : P.walkSlow;

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

    // ── gravity / jetpack / wall-run ──
    // Jetpack physics: thrust is a FORCE with an ignition spool, not an
    // anti-gravity switch. Momentum carries through release (ballistic
    // arcs), part of the thrust vectors into your WASD input for real
    // flight control, and climb speed terminates at jetMaxRise.
    let g = P.gravity;
    if (state.wall) g = P.wallRunGrav;
    // CapsLock (jetArmed) burns even from a standstill — it lifts you
    // off the deck; Space/Q are hold-to-thrust and only work airborne
    const wantJet = (state.jetArmed || ((spaceHeld || keys.q) && !state.grounded))
      && state.hoverFuel > 0 && state.flip === 0;
    const spoolWas = state.jetSpool ?? 0;
    state.jetSpool = clamp(spoolWas + (wantJet ? dt / P.jetSpool : -dt / 0.15), 0, 1);
    if (wantJet && spoolWas <= 0.01) {   // ignition
      audio.sfx('jump');
      state.vel.addScaledVector(_up, 1.4);
    }
    if (state.jetSpool > 0.01 && state.hoverFuel > 0) {
      const thrust = P.jetThrust * state.jetSpool;
      // radial lift, cut once at terminal climb speed
      if (state.vel.dot(_up) < P.jetMaxRise) g -= thrust;
      else g = 0;
      // thrust vectoring: lean the burn into the stick
      if (hasInput) state.vel.addScaledVector(_wish, thrust * P.jetVector * dt);
      state.hoverFuel -= dt * (0.45 + 0.65 * state.jetSpool);
      if (wantJet && rig.current() !== 'hover' && state.flip === 0) rig.play('hover', { fade: 0.15 });
    }
    // flames scale with spool + flicker
    for (const fl of jetpack.userData.flames) {
      fl.visible = state.jetSpool > 0.03;
      if (fl.visible) fl.scale.set(1, state.jetSpool * (0.7 + Math.random() * 0.5), 1);
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
            if (state.flip === 0 && state.roll === 0) rig.play(side < 0 ? 'wallrunR' : 'wallrunL', { fade: 0.12 });
          }
          break;
        }
      }
      if (!state.wall && state.wallTime > 0 && tSpeed < 6.0) state.wallTime = 0;
    } else {
      state.wallTime = 0;
    }

    // ── wall slide / anti-clip ──
    // Fan of probes (2 heights × 3 bearings) so corners, thin props and
    // diagonal approaches can't be tunnelled through the way a single
    // chest-height ray allowed.
    if (tSpeed > 0.5) {
      _v2.copy(tangentVel).normalize();
      const reach = P.radius + tSpeed * dt + 0.15;
      for (const hgt of [0.45, 1.25]) {
        for (const ang of [0, 0.55, -0.55]) {
          _v3.copy(_v2).applyAxisAngle(_up, ang);
          const eye = _v.copy(state.pos).addScaledVector(_up, hgt);
          const hit = planet.probe(eye, _v3, reach);
          if (hit && hit.distance < P.radius + 0.2) {
            const n = hit.face.normal;
            const into = state.vel.dot(n);
            if (into < 0) state.vel.addScaledVector(n, -into);
            state.pos.addScaledVector(n, (P.radius + 0.2 - hit.distance) * 0.6);
          }
        }
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
    // void failsafe — but ONLY when the BVH found nothing below us:
    // caves legitimately run beneath the terrain surface
    const minR = planet.terrainHeight(_v2.copy(state.pos).normalize());
    if (!gh && state.pos.length() < minR - 1.5) {
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

    // ── melee timing: strike lands mid-swing, clip owns the rig until done ──
    {
      const m = state.melee;
      m.cool = Math.max(0, m.cool - dt);
      if (m.kind) {
        m.t += dt;
        const impactAt = m.kind === 'kick' ? 0.22 : 0.14;
        if (!m.hitDone && m.t >= impactAt) { m.hitDone = true; meleeStrike(); }
        if (m.t >= m.dur) m.kind = null;
      }
    }

    // ── locomotion clip ──
    if (state.flip === 0 && state.roll === 0 && !state.wall && !state.melee.kind) {
      if (state.grounded) {
        const sp = tangentVel.length();
        const backing = keys.s && !keys.w;
        const strafing = state.strafeDir !== 0 && !keys.w && !keys.s;
        // no turn-in-place clip exists on this rig — a slow walk shuffle
        // sells pivoting when yawing hard while stationary
        if (sp < 0.6 && Math.abs(rotVel.yaw) > 0.006) rig.play('walk', { fade: 0.18, timeScale: 0.55 });
        else if (sp < 0.6) rig.play('idle', { fade: 0.22 });
        else if ((boosting || sprinting) && sp > P.walk + 1) rig.play('sprint');
        else if (backing) rig.play('runback');
        else if (strafing) rig.play(state.strafeDir < 0 ? 'strafeL' : 'strafeR');
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

    // ── soft target lock: frame the fight ──
    lockTarget = null;
    if (npcsRef) {
      let bd = 24 * 24;
      const eye = _v3.copy(state.pos).addScaledVector(_up, 1.5);
      for (const n of npcsRef.list) {
        if (n.state === 'dead') continue;
        const hostile = n.aggro || n.kind === 'vex' || n.kind === 'vultyr' || n.kind === 'brakkus';
        if (!hostile) continue;
        if (!(n.state === 'combat' || n.kind === 'vultyr' || n.pos.distanceToSquared(state.pos) < 18 * 18)) continue;
        const d2 = n.pos.distanceToSquared(state.pos);
        if (d2 >= bd) continue;
        const to = _v.copy(n.pos).addScaledVector(_v2.copy(n.pos).normalize(), 1.0).sub(eye);
        const dist = to.length();
        const blocked = planet.probe(eye, to.normalize(), dist - 1.2);
        if (blocked) continue;
        bd = d2;
        lockTarget = n;
      }
      // gentle aim assist: yaw toward the locked enemy unless steering
      if (lockTarget && !keys.left && !keys.right) {
        _v.copy(lockTarget.pos).sub(state.pos);
        _v.addScaledVector(_up, -_v.dot(_up)).normalize();
        const cross = _v2.crossVectors(state.heading, _v).dot(_up);
        const dot = clamp(state.heading.dot(_v), -1, 1);
        const ang = Math.atan2(cross, dot);
        const step = clamp(ang, -1, 1) * 2.2 * dt;
        state.heading.applyQuaternion(_q.setFromAxisAngle(_up, step)).normalize();
      }
    }
    hud.setLock(!!lockTarget, lockTarget ? lockTarget.name : null);

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
    const dist = deadCam ? 7.5 : state.mode === 'ride' ? 2.6 : state.camDist;
    const want = _v.copy(state.pos)
      .addScaledVector(_up, 1.85 + state.camPitch * -1.2)
      .addScaledVector(_fwd, -dist);
    const eye = _v3.copy(state.pos).addScaledVector(_up, 1.55);
    const toCam = _v2.copy(want).sub(eye);
    const len = toCam.length();
    toCam.normalize();
    // fight framing: when locked, boom out along player←enemy axis so
    // both stay in frame
    if (lockTarget && !deadCam) {
      _v2.copy(state.pos).sub(lockTarget.pos);
      _v2.addScaledVector(_up, -_v2.dot(_up));
      if (_v2.lengthSq() > 0.5) {
        _v2.normalize();
        want.copy(state.pos)
          .addScaledVector(_v2, dist * 0.85)
          .addScaledVector(_up, 2.4 + state.camPitch * -1.0);
      }
    }
    const hit = planet.probe(eye, toCam.copy(want).sub(eye).normalize(), want.distanceTo(eye) + 0.3);
    const len2 = want.distanceTo(eye);
    if (hit && hit.distance < len2) {
      const pulled = Math.max(1.3, hit.distance - 0.3);
      want.copy(eye).addScaledVector(toCam, pulled);
      // blocked hard → rise above the obstruction for an over-shoulder view
      const blocked = 1 - pulled / len2;
      want.addScaledVector(_up, blocked * 3.2);
      const hit2 = planet.probe(eye, _v2.copy(want).sub(eye).normalize(), len2 + 0.5);
      if (hit2 && hit2.distance < want.distanceTo(eye)) {
        want.copy(eye).addScaledVector(_v2, Math.max(1.1, hit2.distance - 0.25));
      }
    }
    if (!camInit) { camPos.copy(want); camInit = true; }
    // FIXED relationship: near-rigid follow (no floaty lag)
    camPos.lerp(want, 1 - Math.pow(0.0000001, dt));
    camera.position.copy(camPos);
    camera.up.copy(_up);
    // look at the player — biased toward the locked enemy mid-fight
    _v.copy(state.pos).addScaledVector(_up, 1.55).addScaledVector(state.heading, 1.2);
    if (lockTarget && !deadCam) _v.lerp(lockTarget.pos, 0.30);
    camera.lookAt(_v);
  }

  return {
    state, rig, update, damage, suitLamp,
    heal(amount) {
      state.hp = Math.min(P.hpMax, state.hp + amount);
      audio.sfx('shieldUp');
    },
    bindTargets(n) { npcsRef = n; },
    start() {
      state.started = true;
      rig.play('idle');
      hud.setCrosshair(mouse.x, mouse.y);
      hud.toast('CAPTAIN ON THE GROUND', 'Find the spaceport. Your ship is waiting.');
    },
    setPaused(p) { state.paused = p; },
  };
}
