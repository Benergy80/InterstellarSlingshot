// ════════════════════════════════════════════════════════════════
// VOLKARIS — combat FX + the ship + the blast-off ending
//
// Blaster bolts (pooled glowing tracers), impact sparks, enemy
// hit reactions, and the whole point of the level: the Captain's
// ship (the mothergame's Player.glb) parked at Port Meridian.
// Board it and the launch cinematic fires you back into space.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { C, NEON, clamp, lerp } from './config.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3();
const _q = new THREE.Quaternion();

export function createFX(scene, camera, planet, audio, models = {}) {
  const bolts = [];
  const BOLT_POOL = 48;
  const boltGeo = new THREE.CapsuleGeometry(0.05, 0.9, 3, 6);
  boltGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < BOLT_POOL; i++) {
    const m = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    m.visible = false;
    scene.add(m);
    bolts.push({ mesh: m, active: false, vel: new THREE.Vector3(), ttl: 0, friendly: true, damage: 0 });
  }

  // spark bursts (one pooled Points cloud)
  const SPARKS = 240;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = [];
  const sparkLife = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) { sparkVel.push(new THREE.Vector3()); sparkLife[i] = 0; sparkPos[i * 3 + 1] = -99999; }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffd9a0, size: 0.16, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkCursor = 0;

  function burst(pos, n = 10, spread = 6) {
    for (let i = 0; i < n; i++) {
      const k = sparkCursor = (sparkCursor + 1) % SPARKS;
      sparkPos[k * 3] = pos.x; sparkPos[k * 3 + 1] = pos.y; sparkPos[k * 3 + 2] = pos.z;
      sparkVel[k].set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * spread);
      sparkLife[k] = 0.5 + Math.random() * 0.3;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  // ── the ship, parked on the pad ──
  const shipGroup = new THREE.Group();
  {
    const f = planet.portInfo.shipFrame;
    if (models.Player) {
      const s = models.Player.clone();
      // Player.glb ships with a black/broken material — give it a proper
      // hero SKIN: brushed steel hull with a warm underglow, neon trim
      let idx = 0;
      s.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          const big = idx++ === 0 || o.geometry.boundingSphere?.radius > 0.05;
          o.material = new THREE.MeshStandardMaterial({
            color: big ? 0x8a97b8 : 0x5a3f7a,       // steel hull / violet panels
            metalness: 0.8, roughness: 0.38,
            emissive: new THREE.Color(NEON.cyan).multiplyScalar(0.04),
            envMapIntensity: 0.9,
          });
        }
      });
      // Player.glb is authored miniature (~0.2u) — normalize to hero size
      const sz = new THREE.Box3().setFromObject(s).getSize(new THREE.Vector3());
      s.scale.setScalar(7.5 / Math.max(sz.x, sz.y, sz.z, 1e-3));
      shipGroup.add(s);
    } else {
      // procedural fallback: sleek dart
      const hull = new THREE.Mesh(new THREE.ConeGeometry(1.4, 7, 8),
        new THREE.MeshStandardMaterial({ color: 0xb8c4dd, roughness: 0.3, metalness: 0.8 }));
      hull.rotation.x = Math.PI / 2;
      shipGroup.add(hull);
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 1.6),
          hull.material);
        wing.position.set(s * 1.6, -0.2, 1.2);
        wing.rotation.z = s * -0.18;
        shipGroup.add(wing);
      }
    }
    // engine glow (flares during launch)
    const eng = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.orange).multiplyScalar(1.3), toneMapped: false, transparent: true, opacity: 0.9 }));
    eng.position.set(0, 0.4, -3.4);
    eng.scale.set(1, 1, 1.6);
    shipGroup.add(eng);
    shipGroup.userData.engine = eng;

    // the GLB's pivot floats above its hull — measure and sit it ON the pad
    const pre = new THREE.Box3().setFromObject(shipGroup);
    const lift = -pre.min.y + 1.0;
    shipGroup.applyMatrix4(new THREE.Matrix4().makeTranslation(0, lift, 0).premultiply(f));
    scene.add(shipGroup);
    // landing legs light
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 6, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.lime).multiplyScalar(1.2), toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(planet.portInfo.padCenter).addScaledVector(planet.portInfo.dir, 0.15);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), planet.portInfo.dir);
    scene.add(ring);
  }

  // ── launch cinematic ──
  const launch = { active: false, t: 0, rig: null, state: null, done: false };
  const shipHome = shipGroup.position.clone();
  const shipQuatHome = shipGroup.quaternion.clone();

  function startLaunch(rig, state, cam) {
    launch.active = true;
    launch.t = 0;
    launch.rig = rig;
    launch.state = state;
    audio.sfx('doors');
    if (window.VK_HUD) window.VK_HUD.toast('BOARDING', 'Welcome back, Captain.');
  }

  function updateLaunch(dt) {
    if (!launch.active) return;
    // once the win screen is up, FREEZE the shot — otherwise the ship
    // keeps accelerating past the far clip plane and the background
    // flickers behind the overlay
    if (launch.done) return;
    launch.t += dt;
    const t = launch.t;
    const up = planet.portInfo.dir;
    const eng = shipGroup.userData.engine;

    if (t < 1.6) {
      // captain jogs to the ship and fades aboard
      const r = launch.rig;
      r.play('run');
      r.update(dt);
      const k = t / 1.6;
      r.group.position.lerp(shipHome, 1 - Math.pow(0.001, dt));
      r.group.traverse(o => { if (o.material && o.material.transparent !== undefined && k > 0.7) { o.material.transparent = true; o.material.opacity = Math.max(0, 1 - (k - 0.7) / 0.25); } });
    } else if (launch.rig) {
      launch.rig.group.visible = false;
    }
    if (t > 1.8 && t < 2.0 && !launch._warp) { launch._warp = true; audio.sfx('warp'); }

    // spool engines
    const spool = clamp((t - 1.4) / 1.4, 0, 1);
    eng.scale.setScalar(1 + spool * 2.2);
    eng.material.opacity = 0.5 + spool * 0.5;

    // lift, pitch to tangent, then burn out of atmosphere
    if (t > 2.6) {
      const rise = t - 2.6;
      const alt = rise < 2.2 ? rise * rise * 4 : (2.2 * 2.2 * 4) + (rise - 2.2) * 55 * (1 + (rise - 2.2) * 0.8);
      shipGroup.position.copy(shipHome).addScaledVector(up, alt);
      // gentle spin + pitch away
      const lean = clamp((rise - 1.4) / 2, 0, 0.9);
      shipGroup.quaternion.copy(shipQuatHome)
        .multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -lean * 0.9))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rise * 0.12));
      if (Math.random() < 0.5) burst(_v.copy(shipGroup.position).addScaledVector(up, -2), 3, 3);

      // camera: ground-side hero shot, tracking the ascent
      const camBase = _v.copy(planet.portInfo.padCenter).addScaledVector(up, 9.0);
      _v2.copy(shipGroup.position).sub(camBase).normalize();
      camera.position.lerp(_v.copy(camBase).addScaledVector(_v2, -13).addScaledVector(up, 7), 1 - Math.pow(0.001, dt));
      camera.up.copy(up);
      camera.lookAt(shipGroup.position);

      if (alt > 320 && !launch.done) {
        launch.done = true;
        if (window.VK_HUD) window.VK_HUD.showWin();
      }
    } else {
      // pre-lift orbit shot
      const a = t * 0.5;
      const f = planet.portInfo.shipFrame;
      const east = new THREE.Vector3().setFromMatrixColumn(f, 0);
      const north = new THREE.Vector3().setFromMatrixColumn(f, 2);
      camera.position.copy(shipHome)
        .addScaledVector(east, Math.cos(a) * 10)
        .addScaledVector(north, Math.sin(a) * 10)
        .addScaledVector(up, 5.5);
      camera.up.copy(up);
      camera.lookAt(shipHome);
    }
  }

  // ── combat interop (wired by main.js) ──
  let npcAPI = null, playerAPI = null;
  function spawnBolt(pos, dir, { friendly = true, color = NEON.cyan, speed = 120, damage = 20 } = {}) {
    const b = bolts.find(x => !x.active);
    if (!b) return;
    b.active = true;
    b.mesh.visible = true;
    b.mesh.position.copy(pos);
    b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    b.mesh.material.color.set(color).multiplyScalar(1.35);
    b.vel.copy(dir).multiplyScalar(speed);
    b.ttl = 1.8;
    b.friendly = friendly;
    b.damage = damage;
  }

  function update(dt, t) {
    // bolts
    for (const b of bolts) {
      if (!b.active) continue;
      b.ttl -= dt;
      if (b.ttl <= 0) { b.active = false; b.mesh.visible = false; continue; }
      const step = _v.copy(b.vel).multiplyScalar(dt);
      const stepLen = step.length();
      // static world hit
      const hit = planet.probe(b.mesh.position, _v2.copy(b.vel).normalize(), stepLen + 0.2);
      if (hit) {
        burst(hit.point, 8, 5);
        b.active = false; b.mesh.visible = false;
        continue;
      }
      b.mesh.position.add(step);
      // character hits
      if (b.friendly && npcAPI) {
        const victim = npcAPI.hitTest(b.mesh.position, 1.0);
        if (victim) {
          npcAPI.applyHit(victim, b.damage, b.mesh.position);
          burst(b.mesh.position, 10, 6);
          b.active = false; b.mesh.visible = false;
          continue;
        }
      }
      if (!b.friendly && playerAPI && playerAPI.state.mode !== 'ride') {
        // riding the elevated monorail = out of the firing line; the car
        // floor and the height keep ground troops from tagging you
        const p = playerAPI.state.pos;
        _up.copy(p).normalize();
        _v2.copy(p).addScaledVector(_up, 1.0);
        if (b.mesh.position.distanceToSquared(_v2) < 1.1) {
          playerAPI.damage(b.damage);
          burst(b.mesh.position, 8, 4);
          audio.sfx('glass');
          b.active = false; b.mesh.visible = false;
        }
      }
    }
    // sparks
    let dirty = false;
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i] <= 0) continue;
      sparkLife[i] -= dt;
      dirty = true;
      if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -99999; continue; }
      _up.set(sparkPos[i * 3], sparkPos[i * 3 + 1], sparkPos[i * 3 + 2]).normalize();
      sparkVel[i].addScaledVector(_up, -14 * dt);
      sparkPos[i * 3] += sparkVel[i].x * dt;
      sparkPos[i * 3 + 1] += sparkVel[i].y * dt;
      sparkPos[i * 3 + 2] += sparkVel[i].z * dt;
    }
    if (dirty) sparkGeo.attributes.position.needsUpdate = true;

    // idle ship shimmer
    if (!launch.active) {
      const eng = shipGroup.userData.engine;
      eng.material.opacity = 0.55 + Math.sin(t * 3.1) * 0.15;
    }
    updateLaunch(dt);
  }

  return {
    spawnBolt, burst, update, startLaunch, shipGroup,
    canBoard(pos) { return pos.distanceTo(planet.portInfo.padCenter) < 8; },
    bindCombat(npcs, player) { npcAPI = npcs; playerAPI = player; },
    launch,
  };
}
