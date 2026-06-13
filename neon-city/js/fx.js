// ════════════════════════════════════════════════════════════════
// NEON CITY — combat & weather FX
// Pooled laser bolts (raycast vs city), missiles with trails and
// shockwave explosions, spark bursts, scorch glows, camera-following
// rain (streak points), lightning flashes, jump rings, screen shake.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { NEON, glowTexture, streakTexture, mulberry32 } from './config.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _cloudTint = new THREE.Color();
const _ray = new THREE.Raycaster();
_ray.far = 600;

export function createFX(scene, camera, world, audio) {
  const rnd = mulberry32(99);
  const fx = { updateFns: [], rainOn: true };
  fx.update = (dt, t) => { for (const f of fx.updateFns) f(dt, t); };

  const glowTex = glowTexture(96, 'rgba(160,235,255,1)');
  const glowTexWarm = glowTexture(96, 'rgba(255,190,120,1)');

  // ════════════════ LASERS ════════════════
  {
    const POOL = 22;
    const geo = new THREE.BoxGeometry(0.09, 0.09, 3.0);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(NEON.cyan).multiplyScalar(1.7), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const matAlt = mat.clone();
    matAlt.color = new THREE.Color(NEON.magenta).multiplyScalar(1.6);
    const bolts = [];
    for (let i = 0; i < POOL; i++) {
      const m = new THREE.Mesh(geo, i % 2 ? matAlt : mat);
      m.visible = false;
      scene.add(m);
      bolts.push({ m, alive: false, vel: new THREE.Vector3(), end: new THREE.Vector3(), travel: 0, max: 0 });
    }
    let cursor = 0;

    fx.fireLaser = (origin, dir) => {
      const b = bolts[cursor];
      cursor = (cursor + 1) % POOL;
      _ray.set(origin, dir);
      const hits = _ray.intersectObjects(world.raycastTargets, false);
      const dist = hits.length ? hits[0].distance : 320;
      b.alive = true;
      b.m.visible = true;
      b.m.position.copy(origin);
      b.m.lookAt(_v.copy(origin).add(dir));
      b.vel.copy(dir).multiplyScalar(260);
      b.travel = 0;
      b.max = dist;
      b.end.copy(origin).addScaledVector(dir, dist);
      b.hit = hits.length ? hits[0] : null;
    };

    fx.updateFns.push((dt) => {
      for (const b of bolts) {
        if (!b.alive) continue;
        const step = b.vel.length() * dt;
        b.travel += step;
        b.m.position.addScaledVector(b.vel, dt);
        if (fx.testEnemyHit && fx.testEnemyHit(b.m.position)) {
          b.alive = false;
          b.m.visible = false;
          continue;
        }
        // car hit mid-flight → explode it
        if (fx._traffic) {
          const ci = fx._traffic.testCarHit(b.m.position, 2.4);
          if (ci >= 0) {
            const cp = fx._traffic.killCar(ci);
            if (cp) fx.explodeCar(cp);
            b.alive = false;
            b.m.visible = false;
            continue;
          }
        }
        if (b.travel >= b.max) {
          b.alive = false;
          b.m.visible = false;
          if (b.hit && b.hit.object === world.buildingMesh && b.end.y > 5.5) {
            fx.breakWindow(b.end);        // shatter the pane
          } else {
            sparkBurst(b.end, 14, 0x9fe8ff);
            scorch(b.end);
          }
        }
      }
    });
  }

  // ════════════════ SPARKS (pooled points) ════════════════
  let sparkBurst;
  {
    const MAX = 420;
    const pos = new Float32Array(MAX * 3);
    const col = new Float32Array(MAX * 3);
    const vel = new Float32Array(MAX * 3);
    const life = new Float32Array(MAX);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      map: glowTex, size: 0.6, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    let head = 0;
    const tint = new THREE.Color();

    sparkBurst = (at, n, color, power = 9) => {
      tint.setHex(color);
      for (let k = 0; k < n; k++) {
        const i = head; head = (head + 1) % MAX;
        pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
        const a = rnd() * Math.PI * 2, e = (rnd() - 0.3) * Math.PI;
        const s = power * (0.3 + rnd() * 0.8);
        vel[i * 3] = Math.cos(a) * Math.cos(e) * s;
        vel[i * 3 + 1] = Math.sin(e) * s + 3;
        vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
        col[i * 3] = tint.r * 2; col[i * 3 + 1] = tint.g * 2; col[i * 3 + 2] = tint.b * 2;
        life[i] = 0.7 + rnd() * 0.5;
      }
    };
    fx.sparkBurst = sparkBurst;

    fx.updateFns.push((dt) => {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) { col[i * 3] *= 0.8; col[i * 3 + 1] *= 0.8; col[i * 3 + 2] *= 0.8; continue; }
        life[i] -= dt;
        vel[i * 3 + 1] -= 16 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.05) { pos[i * 3 + 1] = 0.05; vel[i * 3 + 1] *= -0.4; }
        const f = Math.min(1, life[i] / 0.5);
        col[i * 3] *= (0.92 + f * 0.08); col[i * 3 + 1] *= (0.92 + f * 0.08); col[i * 3 + 2] *= (0.92 + f * 0.08);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    });
  }

  // ════════════════ SCORCH GLOWS ════════════════
  let scorch;
  {
    const POOL = 14;
    const items = [];
    for (let i = 0; i < POOL; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0x66d8ff, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      s.scale.setScalar(1.6);
      scene.add(s);
      items.push({ s, life: 0 });
    }
    let head = 0;
    scorch = (at) => {
      const it = items[head]; head = (head + 1) % POOL;
      it.s.position.copy(at);
      it.life = 2.6;
    };
    fx.updateFns.push((dt) => {
      for (const it of items) {
        if (it.life <= 0) { it.s.material.opacity = 0; continue; }
        it.life -= dt;
        it.s.material.opacity = Math.min(0.75, it.life * 0.45);
      }
    });
  }

  // ════════════════ MISSILES ════════════════
  {
    const POOL = 4;
    const items = [];
    const bodyGeo = new THREE.ConeGeometry(0.16, 0.9, 6);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0xfff1cf, toneMapped: false });
    for (let i = 0; i < POOL; i++) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(bodyGeo, bodyMat);
      g.add(m);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexWarm, color: 0xffa64d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.scale.setScalar(1.4);
      flame.position.z = 0.8;
      g.add(flame);
      g.visible = false;
      scene.add(g);
      items.push({ g, alive: false, vel: new THREE.Vector3(), life: 0, trailT: 0 });
    }
    // shockwave rings
    const ringGeo = new THREE.TorusGeometry(1, 0.12, 8, 32);
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      }));
      r.visible = false;
      scene.add(r);
      rings.push({ r, life: 0 });
    }
    const flashes = [];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({
        color: new THREE.Color(3.2, 2.2, 1.2), transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      f.visible = false;
      scene.add(f);
      flashes.push({ f, life: 0 });
    }
    let head = 0, ringHead = 0;

    function explode(at) {
      sparkBurst(at, 60, 0xffc46b, 16);
      sparkBurst(at, 30, 0xff5a3c, 11);
      if (fx._traffic) {
        for (let k = 0; k < 4; k++) {   // chain anything parked in the blast
          const ci = fx._traffic.testCarHit(at, 7);
          if (ci < 0) break;
          const cp = fx._traffic.killCar(ci);
          if (cp) fx.debrisBurst(cp);
        }
      }
      const R = rings[ringHead]; const F = flashes[ringHead];
      ringHead = (ringHead + 1) % rings.length;
      R.life = 0.8; R.r.visible = true; R.r.position.copy(at); R.r.scale.setScalar(0.6);
      R.r.rotation.x = Math.PI / 2;
      F.life = 0.5; F.f.visible = true; F.f.position.copy(at); F.f.scale.setScalar(0.8);
      fx.shake(0.6);
      audio.sfx('boom');
    }

    fx._boomAt = explode;
    fx.fireMissile = (origin, dir) => {
      const it = items[head]; head = (head + 1) % POOL;
      it.alive = true;
      it.g.visible = true;
      it.g.position.copy(origin);
      it.vel.copy(dir).multiplyScalar(64);
      it.g.lookAt(_v.copy(origin).add(dir));
      it.life = 7;
      it.trailT = 0;
    };

    fx.updateFns.push((dt, t) => {
      for (const it of items) {
        if (!it.alive) continue;
        it.life -= dt;
        it.vel.multiplyScalar(1 + dt * 0.9); // accelerate
        it.g.position.addScaledVector(it.vel, dt);
        it.trailT -= dt;
        if (it.trailT <= 0) { sparkBurst(it.g.position, 2, 0xffa64d, 1.5); it.trailT = 0.05; }
        // hit test: ground or buildings (cheap point checks)
        const p = it.g.position;
        let boom = p.y < 0.2 || it.life <= 0;
        if (!boom) {
          for (const c of world.colliders) {
            if (c.minY !== undefined) continue;
            if (p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ && p.y < 240) { boom = true; break; }
          }
        }
        if (boom) {
          it.alive = false;
          it.g.visible = false;
          explode(p);
        }
      }
      for (const R of rings) {
        if (R.life <= 0) { R.r.visible = false; continue; }
        R.life -= dt;
        R.r.scale.addScalar(dt * 38);
        R.r.material.opacity = Math.min(0.85, R.life * 1.4);
      }
      for (const F of flashes) {
        if (F.life <= 0) { F.f.visible = false; continue; }
        F.life -= dt;
        F.f.scale.addScalar(dt * 26);
        F.f.material.opacity = Math.min(0.9, F.life * 2.2);
      }
    });
  }

  // ════════════════ JUMP RING ════════════════
  {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.06, 6, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    let life = 0;
    fx.jumpRing = (x, y, z) => { ring.position.set(x, y, z); life = 0.5; ring.scale.setScalar(1); };
    fx.updateFns.push((dt) => {
      if (life <= 0) { ring.material.opacity = 0; return; }
      life -= dt;
      ring.scale.addScalar(dt * 9);
      ring.material.opacity = life * 1.4;
    });
  }

  // ════════════════ RAIN ════════════════
  {
    const N = 2400, R = 46, HGT = 56;
    const pos = new Float32Array(N * 3);
    const spd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rnd() * HGT;
      pos[i * 3 + 2] = Math.sin(a) * r;
      spd[i] = 34 + rnd() * 22;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: world.uTime, uTex: { value: streakTexture() }, uOpacity: { value: 0.5 } },
      vertexShader: `
        attribute float aSpeed;
        uniform float uTime;
        void main() {
          vec3 p = position;
          p.y = mod(position.y - uTime * aSpeed, ${HGT.toFixed(1)});
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 110.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex;
        uniform float uOpacity;
        void main() {
          vec4 c = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(0.62, 0.78, 0.95, c.a * uOpacity);
        }
      `,
    });
    const rain = new THREE.Points(geo, mat);
    rain.frustumCulled = false;
    scene.add(rain);
    fx.rainMesh = rain;
    fx.toggleRain = () => {
      fx.rainOn = !fx.rainOn;
      rain.visible = fx.rainOn;
      audio.setRain(fx.rainOn);
      return fx.rainOn;
    };
    fx.updateFns.push(() => {
      rain.position.set(camera.position.x, camera.position.y - HGT / 2 + 6, camera.position.z);
    });
  }

  // ════════════════ LIGHTNING + STORM CLOUDS ════════════════
  {
    // forked lightning — the mothergame's _fxLightning style (additive tapered
    // cylinder segments) arranged into a jagged sky-to-ground bolt with branches
    const boltMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 2.3, 2.6), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const SEG = 18;
    const segGeo = new THREE.CylinderGeometry(0.6, 0.1, 1, 5);
    const segs = [];
    for (let i = 0; i < SEG; i++) { const m = new THREE.Mesh(segGeo, boltMat); m.visible = false; m.frustumCulled = false; scene.add(m); segs.push(m); }
    const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _axis = new THREE.Vector3();
    const placeSeg = (m, ax, ay, az, bx, by, bz) => {
      _dir.set(bx - ax, by - ay, bz - az); const len = _dir.length();
      if (len < 0.001) { m.visible = false; return; }
      _dir.divideScalar(len);
      m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      _axis.crossVectors(_up, _dir);
      if (_axis.length() > 0.001) { _axis.normalize(); m.quaternion.setFromAxisAngle(_axis, Math.acos(Math.max(-1, Math.min(1, _up.dot(_dir))))); }
      else m.quaternion.identity();
      m.scale.set(1, len, 1); m.visible = true;
    };
    const strike = () => {
      for (const m of segs) m.visible = false;
      let si = 0;
      let x = camera.position.x + (rnd() - 0.5) * 700, y = 430, z = camera.position.z + (rnd() - 0.5) * 700;
      const nodes = [[x, y, z]], trunk = 11;
      for (let i = 1; i <= trunk; i++) { x += (rnd() - 0.5) * 34; z += (rnd() - 0.5) * 34; y = 430 - (i / trunk) * 410; nodes.push([x, y, z]); }
      for (let i = 0; i < nodes.length - 1 && si < SEG; i++) placeSeg(segs[si++], ...nodes[i], ...nodes[i + 1]);
      for (let br = 0; br < 2 && si < SEG; br++) {
        const n = nodes[2 + ((rnd() * (nodes.length - 4)) | 0)];
        let bx = n[0], by = n[1], bz = n[2];
        for (let j = 0; j < 3 && si < SEG; j++) {
          const nx = bx + (rnd() - 0.5) * 60, ny = by - 30 - rnd() * 40, nz = bz + (rnd() - 0.5) * 60;
          placeSeg(segs[si++], bx, by, bz, nx, ny, nz); bx = nx; by = ny; bz = nz;
        }
      }
    };
    // cloud cover drifts in and out while it rains
    let cloudTimer = 20 + rnd() * 30, cloudy = false, cloudK = 0;
    fx.updateFns.push((dt) => {
      cloudTimer -= dt;
      if (cloudTimer <= 0) {
        cloudy = !cloudy && fx.rainOn;
        cloudTimer = cloudy ? 28 + rnd() * 28 : 35 + rnd() * 55;
      }
      // Mothergame galaxy-core/boss dome behavior (createBossBattleSkybox +
      // updateBossSkyboxHeartbeat): a color dome that follows the player and
      // FADES IN AS YOU APPROACH THE CORE, eased += (target−o)·0.1/frame.
      // Here the core is the Spire; the tint is the complement of the
      // district you're standing in.
      let want = 0;
      if (fx.rainOn) {   // clouds exist only while it rains
        const coreD = Math.hypot(camera.position.x, camera.position.z);
        want = coreD < 120 ? 0.5 : coreD > 650 ? 0.18 : Math.max(0.18, 0.5 * (1 - (coreD - 120) / 530));
      }
      cloudK += (want - cloudK) * Math.min(1, dt * 0.7);   // slow crossfade as weather rolls in/out
      if (world.cloudPuffs) world.cloudPuffs.opacity = cloudK * 0.62;   // game nebulas run 0.65 additive
      // Hubble deep field goes soft + dim under storm cover, sharpens when it lifts
      if (world.skyBlurMat) world.skyBlurMat.opacity = cloudK * 0.6;
      if (world.skyMat) world.skyMat.opacity = (world.skyBaseOpacity || 0.15) * (1 - cloudK * 0.55);
      if (world.cloudMat) {
        world.cloudMat.opacity = cloudK * 0.5;   // dome becomes a faint backwash behind the puffs
        if (world.districtAt) {
          const D = world.districtAt(camera.position.x, camera.position.z);
          if (D.curb) {
            _cloudTint.setHex(D.curb);
            const hsl = {};
            _cloudTint.getHSL(hsl);
            _cloudTint.setHSL((hsl.h + 0.5) % 1, hsl.s * 0.55, 0.72);  // complementary, soft
            world.cloudMat.color.lerp(_cloudTint, Math.min(1, dt * 1.2));
            if (world.cloudPuffs) world.cloudPuffs.color.lerp(_cloudTint, Math.min(1, dt * 1.2));
          }
        }
      }
    });
    const clamp2 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let next = 14 + rnd() * 20, flashT = 0;
    const baseHemi = world.hemi.intensity;
    const baseBg = new THREE.Color(0x0a0618);
    const flashBg = new THREE.Color(0x2c2450);
    fx.updateFns.push((dt) => {
      if (flashT > 0) {
        flashT -= dt;
        const k = Math.max(0, flashT) * 6;
        const burst = (Math.sin(flashT * 42) > -0.2 ? 1 : 0.25) * Math.min(1, k);
        world.hemi.intensity = baseHemi + burst * 2.0;
        if (scene.background && scene.background.isColor) scene.background.lerpColors(baseBg, flashBg, burst * 0.8);
        boltMat.opacity = burst * 0.9;
        if (flashT <= 0) {
          world.hemi.intensity = baseHemi;
          boltMat.opacity = 0;
          if (scene.background && scene.background.isColor) scene.background.copy(baseBg);
        }
      } else {
        next -= dt;
        if (next <= 0 && fx.rainOn) {
          strike();
          flashT = 0.34;
          next = 16 + rnd() * 26;
          setTimeout(() => audio.sfx('thunder'), 600 + rnd() * 1800);
        }
      }
    });
  }

  // ════════════════ BREAKABLE WINDOWS ════════════════
  {
    let hitHead = 0;
    // crack decal sprites
    const crackTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const ctx = c.getContext('2d');
      ctx.strokeStyle = 'rgba(210,235,255,0.85)';
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + rnd() * 0.4;
        ctx.beginPath();
        ctx.moveTo(48, 48);
        ctx.lineTo(48 + Math.cos(a) * (22 + rnd() * 22), 48 + Math.sin(a) * (22 + rnd() * 22));
        ctx.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      return t;
    })();
    const cracks = [];
    for (let i = 0; i < 16; i++) {
      const s2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false }));
      s2.scale.setScalar(2.6);
      scene.add(s2);
      cracks.push(s2);
    }
    fx.breakWindow = (at) => {
      world.windowHitVecs[hitHead % 16].copy(at);
      const cr = cracks[hitHead % 16];
      cr.position.copy(at);
      cr.material.opacity = 0.9;
      hitHead++;
      sparkBurst(at, 22, 0xbfe8ff, 7);   // glass shards
      audio.sfx('glass');
    };
    fx.updateFns.push((dt) => {
      for (const cr of cracks) if (cr.material.opacity > 0) cr.material.opacity = Math.max(0, cr.material.opacity - dt * 0.05);
    });
  }

  // ════════════════ CAR EXPLOSIONS — burning debris left behind ════════════════
  {
    const D_MAX = 30, F_MAX = 12;
    const dGeo = new THREE.BoxGeometry(0.55, 0.3, 0.7);
    const dMat = new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.5, metalness: 0.7, emissive: 0xff5a22, emissiveIntensity: 0.55 });
    const debris = new THREE.InstancedMesh(dGeo, dMat, D_MAX);
    debris.frustumCulled = false;
    scene.add(debris);
    const dS = [];
    for (let i = 0; i < D_MAX; i++) dS.push({ p: new THREE.Vector3(0, -60, 0), v: new THREE.Vector3(), rot: 0, spin: 0, life: 0 });
    const dDummy = new THREE.Object3D();

    const fireTexW = glowTexture(96, 'rgba(255,170,70,1)');
    const fires = [];
    for (let i = 0; i < F_MAX; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTexW, color: 0xffa040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      scene.add(sp);
      fires.push({ sp, life: 0, ph: rnd() * 9 });
    }
    let dHead = 0, fHead = 0;

    fx.debrisBurst = (at) => {
      for (let k = 0; k < 9; k++) {
        const d = dS[dHead]; dHead = (dHead + 1) % D_MAX;
        d.p.set(at.x, Math.max(0.6, at.y), at.z);
        const a = rnd() * Math.PI * 2;
        d.v.set(Math.cos(a) * (3 + rnd() * 7), 5 + rnd() * 8, Math.sin(a) * (3 + rnd() * 7));
        d.spin = (rnd() - 0.5) * 9;
        d.rot = rnd() * Math.PI;
        d.life = 22;
      }
      for (let k = 0; k < 3; k++) {
        const f = fires[fHead]; fHead = (fHead + 1) % F_MAX;
        f.sp.position.set(at.x + (rnd() - 0.5) * 2.4, 1.0, at.z + (rnd() - 0.5) * 2.4);
        f.life = 19 + rnd() * 4;
      }
    };
    fx.explodeCar = (at) => {
      fx._boomAt(at);
      fx.debrisBurst(at);
    };
    fx.updateFns.push((dt, t) => {
      for (let i = 0; i < D_MAX; i++) {
        const d = dS[i];
        if (d.life <= 0) continue;
        d.life -= dt;
        if (d.p.y > 0.2 || d.v.y > 0) {
          d.v.y -= 22 * dt;
          d.p.addScaledVector(d.v, dt);
          d.rot += d.spin * dt;
          if (d.p.y < 0.18) { d.p.y = 0.18; d.v.set(0, 0, 0); d.spin = 0; }
        }
        dDummy.position.copy(d.p);
        dDummy.rotation.set(d.rot, d.rot * 1.7, 0);
        dDummy.scale.setScalar(d.life > 1 ? 1 : Math.max(0.01, d.life));
        dDummy.updateMatrix();
        debris.setMatrixAt(i, dDummy.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
      for (const f of fires) {
        if (f.life <= 0) { f.sp.material.opacity = 0; continue; }
        f.life -= dt;
        const flick = 0.75 + 0.25 * Math.sin(t * 17 + f.ph) * Math.sin(t * 7.3 + f.ph * 2);
        f.sp.material.opacity = Math.min(0.85, f.life * 0.3) * flick;
        f.sp.scale.set(2.2 + flick * 1.3, 3.0 + flick * 1.8, 1);
      }
    });
  }

  // ════════════════ WEATHER CYCLE — rain 40% of the time ════════════════
  {
    let wxTimer = 50 + rnd() * 40;
    fx.updateFns.push((dt) => {
      wxTimer -= dt;
      if (wxTimer > 0) return;
      wxTimer = 70 + rnd() * 60;
      const shouldRain = rnd() < 0.4;
      if (shouldRain !== fx.rainOn) {
        fx.toggleRain();
        if (fx._hud) {
          fx._hud.setWeather(fx.rainOn);
          fx._hud.toast(fx.rainOn ? 'ACID RAIN MOVING IN' : 'SKIES CLEARING', 'New Chicago weather service');
        }
      }
    });
  }

  // ════════════════ SPOTLIGHT AMBUSH — the boss-skybox event ════════════════
  // Step into a zeppelin searchlight pool → the mothergame's crimson
  // heartbeat dome (createBossBattleSkybox) + hunter drones for 30 s.
  // Hide inside a building (they hold fire) or shoot them down.
  {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(118000, 32, 20),
      new THREE.MeshBasicMaterial({ color: 0xdd2222, side: THREE.BackSide, transparent: true, opacity: 0, fog: false, depthWrite: false })
    );
    dome.renderOrder = 1;
    dome.frustumCulled = false;
    scene.add(dome);
    const EV = { active: false, t: 0, cooldown: 0, beat: 0, op: 0, enemies: [] };
    fx.bossEvent = EV;
    const eGeo = new THREE.SphereGeometry(1.1, 10, 8);
    const eMat = new THREE.MeshStandardMaterial({ color: 0x1a1020, roughness: 0.35, metalness: 0.8 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.2, 0.25), toneMapped: false });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(eGeo, eMat));
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), eyeMat);
      eye.position.z = -0.95;
      g.add(eye);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 6, 18), eyeMat);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      g.visible = false;
      scene.add(g);
      EV.enemies.push({ g, alive: false, fireT: 0, ph: i * 1.7 });
    }
    // hostile bolts
    const hb = [];
    const hbGeo = new THREE.BoxGeometry(0.12, 0.12, 2.2);
    const hbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.2, 0.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(hbGeo, hbMat);
      m.visible = false;
      scene.add(m);
      hb.push({ m, alive: false, vel: new THREE.Vector3(), life: 0 });
    }
    let hbHead = 0;

    fx.startBossEvent = (at) => {
      if (EV.active || EV.cooldown > 0) return;
      EV.active = true;
      EV.t = 30;
      EV.beat = 0;
      for (const e of EV.enemies) {
        e.alive = true;
        e.g.visible = true;
        e.g.position.set(at.x + (rnd() - 0.5) * 40, 16 + rnd() * 14, at.z + (rnd() - 0.5) * 40);
        e.fireT = 1 + rnd();
      }
      audio.sfx('alarm');
      if (fx._hud) {
        fx._hud.toast('⚠ SPOTTED — HUNTERS INBOUND', 'Hide indoors or fight — 30 seconds');
        fx._hud.setMode('THREAT — HUNTED');
      }
    };

    fx.updateFns.push((dt, t) => {
      EV.cooldown = Math.max(0, EV.cooldown - dt);
      // trigger: standing in a searchlight pool
      const P = fx._player;
      if (!EV.active && EV.cooldown <= 0 && P && world.spotlights && P.state.mode !== 'demo') {
        for (const sp of world.spotlights) {
          const dx = P.state.pos.x - sp.x, dz = P.state.pos.z - sp.z;
          if (dx * dx + dz * dz < 56 && P.state.pos.y < 12) { fx.startBossEvent(P.state.pos); break; }
        }
      }
      if (!EV.active) {
        EV.op += (0 - EV.op) * 0.05;
        dome.material.opacity = EV.op;
        return;
      }
      dome.position.copy(camera.position);
      // the game's double-beat heartbeat (updateBossSkyboxHeartbeat)
      EV.beat += 0.08;
      const beat1 = Math.sin(EV.beat * 2) * 0.5 + 0.5;
      const beat2 = Math.sin((EV.beat - 0.3) * 2) * 0.5 + 0.5;
      const pause = Math.sin(EV.beat) * 0.5 + 0.5;
      const heartbeat = Math.max(beat1 * 0.6, beat2 * 0.4) * pause;
      EV.op += ((0.5 + heartbeat * 0.5) * 0.55 - EV.op) * 0.1;   // scaled for the city night
      dome.material.opacity = EV.op;
      EV.t -= dt;
      const hidden = !!world.activeInterior;
      let aliveCount = 0;
      for (const e of EV.enemies) {
        if (!e.alive) continue;
        aliveCount++;
        if (P) {
          _v.copy(P.state.pos);
          _v.y += 4 + Math.sin(t * 1.3 + e.ph) * 2.5;
          _v.x += Math.cos(t * 0.7 + e.ph) * 9;
          _v.z += Math.sin(t * 0.8 + e.ph) * 9;
          e.g.position.lerp(_v, Math.min(1, dt * (hidden ? 0.25 : 0.9)));
          e.g.lookAt(P.state.pos);
          e.fireT -= dt;
          const d2 = e.g.position.distanceToSquared(P.state.pos);
          if (!hidden && e.fireT <= 0 && d2 < 8100) {
            e.fireT = 1.4 + rnd() * 0.7;
            const b = hb[hbHead]; hbHead = (hbHead + 1) % hb.length;
            b.alive = true; b.m.visible = true;
            b.m.position.copy(e.g.position);
            b.vel.copy(P.state.pos).sub(e.g.position).normalize().multiplyScalar(56);
            b.m.lookAt(_v.copy(e.g.position).add(b.vel));
            b.life = 2.4;
            audio.sfx('laser');
          }
        }
      }
      for (const b of hb) {
        if (!b.alive) continue;
        b.life -= dt;
        b.m.position.addScaledVector(b.vel, dt);
        if (P && b.m.position.distanceToSquared(P.state.pos) < 2.6) {
          b.alive = false; b.m.visible = false;
          if (P.state.shield) P.state.energy = Math.max(0, P.state.energy - 12);
          else P.state.hull = Math.max(3, P.state.hull - 5);
          fx.shake(0.45);
          audio.sfx('land');
          if (fx._hud && P.state.hull <= 20) fx._hud.toast('HULL CRITICAL', 'Find cover!');
        } else if (b.life <= 0) { b.alive = false; b.m.visible = false; }
      }
      if (EV.t <= 0 || aliveCount === 0) {
        EV.active = false;
        EV.cooldown = 45;
        for (const e of EV.enemies) { e.alive = false; e.g.visible = false; }
        for (const b of hb) { b.alive = false; b.m.visible = false; }
        if (fx._hud) {
          fx._hud.toast(aliveCount === 0 ? 'THREAT NEUTRALIZED' : 'ZONE CLEAR', 'They lost your trail');
          fx._hud.setMode('SURFACE MODE');
        }
      }
    });
    // player lasers can kill hunters
    fx.testEnemyHit = (p) => {
      if (!EV.active) return false;
      for (const e of EV.enemies) {
        if (e.alive && e.g.position.distanceToSquared(p) < 4.8) {
          e.alive = false; e.g.visible = false;
          fx.sparkBurst(e.g.position, 30, 0xff4455, 12);
          audio.sfx('boom');
          return true;
        }
      }
      return false;
    };
  }

  // ════════════════ SCREEN SHAKE ════════════════
  {
    let trauma = 0;
    fx.shake = (amt) => { trauma = Math.min(1, trauma + amt); };
    fx.applyShake = (cam) => {
      if (trauma <= 0.001) return;
      const s = trauma * trauma;
      cam.position.x += (rnd() - 0.5) * s * 0.5;
      cam.position.y += (rnd() - 0.5) * s * 0.4;
      cam.rotation.z += (rnd() - 0.5) * s * 0.02;
    };
    fx.updateFns.push((dt) => { trauma = Math.max(0, trauma - dt * 1.6); });
  }

  return fx;
}
