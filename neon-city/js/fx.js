// ════════════════════════════════════════════════════════════════
// NEON CITY — combat & weather FX
// Pooled laser bolts (raycast vs city), missiles with trails and
// shockwave explosions, spark bursts, scorch glows, camera-following
// rain (streak points), lightning flashes, jump rings, screen shake.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { NEON, glowTexture, streakTexture, mulberry32 } from './config.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
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
        if (b.travel >= b.max) {
          b.alive = false;
          b.m.visible = false;
          sparkBurst(b.end, 14, 0x9fe8ff);
          scorch(b.end);
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
      const R = rings[ringHead]; const F = flashes[ringHead];
      ringHead = (ringHead + 1) % rings.length;
      R.life = 0.8; R.r.visible = true; R.r.position.copy(at); R.r.scale.setScalar(0.6);
      R.r.rotation.x = Math.PI / 2;
      F.life = 0.5; F.f.visible = true; F.f.position.copy(at); F.f.scale.setScalar(0.8);
      fx.shake(0.6);
      audio.sfx('boom');
    }

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

  // ════════════════ LIGHTNING ════════════════
  {
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
        if (flashT <= 0) {
          world.hemi.intensity = baseHemi;
          if (scene.background && scene.background.isColor) scene.background.copy(baseBg);
        }
      } else {
        next -= dt;
        if (next <= 0 && fx.rainOn) {
          flashT = 0.34;
          next = 16 + rnd() * 26;
          setTimeout(() => audio.sfx('thunder'), 600 + rnd() * 1800);
        }
      }
    });
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
