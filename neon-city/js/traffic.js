// ════════════════════════════════════════════════════════════════
// NEON CITY — traffic & transit
// Ground cars on right-hand lane loops, air "spinners" flying the
// street canyons in altitude bands, two boardable monorail ring
// lines with station dwell logic, Gagarin Spaceport departure /
// arrival choreography (uses Interstellar Slingshot GLB ships with
// procedural fallback), patrol drones, and a UFO cameo.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { C, NEON, NEON_LIST, mulberry32, pick, clamp, glowTexture } from './config.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _dummy = new THREE.Object3D();

// ── Arc-length polyline loop ──
class Loop {
  constructor(points) {
    this.pts = points;
    this.segs = [];
    this.total = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const len = a.distanceTo(b);
      if (len < 1e-4) continue;
      this.segs.push({ a, b, len, acc: this.total });
      this.total += len;
    }
  }
  at(s, outPos, outDir) {
    s = ((s % this.total) + this.total) % this.total;
    let seg = this.segs[this.segs.length - 1];
    for (let i = 0; i < this.segs.length; i++) {
      if (s < this.segs[i].acc + this.segs[i].len) { seg = this.segs[i]; break; }
    }
    const t = (s - seg.acc) / seg.len;
    outPos.lerpVectors(seg.a, seg.b, t);
    if (outDir) outDir.subVectors(seg.b, seg.a).normalize();
    return outPos;
  }
}

// Rectangle on road centerlines (road indices i0<i1, j0<j1), chamfered corners,
// offset shifts the whole rectangle (lane offset / rail offset).
function rectLoop(i0, j0, i1, j1, y, chamfer, inset) {
  const H = C.HALF;
  const rx = (i) => -H + i * C.CELL - C.ROAD / 2;
  const x0 = rx(i0) + inset, x1 = rx(i1) - inset;
  const z0 = rx(j0) + inset, z1 = rx(j1) - inset;
  const ch = Math.min(chamfer, (x1 - x0) / 2 - 1, (z1 - z0) / 2 - 1);
  const P = (x, z) => new THREE.Vector3(x, y, z);
  return new Loop([
    P(x0 + ch, z0), P(x1 - ch, z0), P(x1, z0 + ch),
    P(x1, z1 - ch), P(x1 - ch, z1), P(x0 + ch, z1),
    P(x0, z1 - ch), P(x0, z0 + ch),
  ]);
}

export function buildTraffic(scene, world, models) {
  const rnd = mulberry32(C.SEED + 777);
  const traffic = { updateFns: [], trains: [], carXZ: null, airXZ: null };
  traffic.update = (dt, t, playerPos) => { for (const f of traffic.updateFns) f(dt, t, playerPos); };

  // ════════════════ GROUND CARS ════════════════
  {
    const loops = [];
    for (let k = 0; k < 20; k++) {
      const i0 = 1 + ((rnd() * (C.GRID - 2)) | 0);
      const i1 = Math.min(C.GRID - 1, i0 + 1 + ((rnd() * 3) | 0));
      const j0 = 1 + ((rnd() * (C.GRID - 2)) | 0);
      const j1 = Math.min(C.GRID - 1, j0 + 1 + ((rnd() * 3) | 0));
      if (i1 <= i0 || j1 <= j0) { k--; continue; }
      loops.push(rectLoop(i0, j0, i1, j1, 0.55, 5, 3.6 * (rnd() < 0.5 ? 1 : -1)));
    }

    const N = C.CARS;
    const cars = [];
    for (let i = 0; i < N; i++) {
      const loop = loops[i % loops.length];
      cars.push({
        loop,
        s: rnd() * loop.total,
        v: 11 + rnd() * 7,
        baseV: 0,
        yaw: 0,
        long: rnd() < 0.22,
      });
      cars[i].baseV = cars[i].v;
    }

    // body
    const bodyGeo = new THREE.BoxGeometry(2.0, 0.95, 4.4);
    bodyGeo.translate(0, 0.62, 0);
    const cabGeo = new THREE.BoxGeometry(1.7, 0.62, 2.2);
    cabGeo.translate(0, 1.35, -0.25);
    const carGeo = BufferGeometryUtils.mergeGeometries([bodyGeo, cabGeo]);
    const carMat = new THREE.MeshStandardMaterial({ color: 0x10131d, roughness: 0.25, metalness: 0.85, envMapIntensity: 1.2 });
    const bodies = new THREE.InstancedMesh(carGeo, carMat, N);
    bodies.frustumCulled = false;
    scene.add(bodies);

    // lights — one geometry: head quads (white) + tail quads (red), vertex-colored
    function lightQuads() {
      const geoms = [];
      const mk = (w, h, x, y, z, ry, color) => {
        const g = new THREE.PlaneGeometry(w, h);
        g.rotateY(ry);
        g.translate(x, y, z);
        const cols = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < cols.length; i += 3) { cols[i] = color[0]; cols[i + 1] = color[1]; cols[i + 2] = color[2]; }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        geoms.push(g);
      };
      // car forward = -Z (lookAt convention)
      mk(0.85, 0.42, -0.58, 0.66, -2.21, Math.PI, [3.4, 3.4, 3.1]);
      mk(0.85, 0.42, 0.58, 0.66, -2.21, Math.PI, [3.4, 3.4, 3.1]);
      mk(0.9, 0.34, -0.56, 0.7, 2.21, 0, [3.6, 0.16, 0.28]);
      mk(0.9, 0.34, 0.56, 0.7, 2.21, 0, [3.6, 0.16, 0.28]);
      return BufferGeometryUtils.mergeGeometries(geoms);
    }
    const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const lights = new THREE.InstancedMesh(lightQuads(), lightMat, N);
    lights.frustumCulled = false;
    scene.add(lights);

    // underglow on a subset
    const uN = (N * 0.45) | 0;
    const uGeo = new THREE.PlaneGeometry(2.4, 4.6);
    uGeo.rotateX(-Math.PI / 2);
    uGeo.translate(0, 0.18, 0);
    const uMat = new THREE.MeshBasicMaterial({
      map: glowTexture(64, 'rgba(255,255,255,0.85)'), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const under = new THREE.InstancedMesh(uGeo, uMat, uN);
    under.frustumCulled = false;
    const ucol = new THREE.Color();
    for (let i = 0; i < uN; i++) under.setColorAt(i, ucol.setHex(pick(rnd, NEON_LIST)));
    under.instanceColor.needsUpdate = true;
    scene.add(under);

    traffic.carXZ = new Float32Array(N * 2);

    traffic.updateFns.push((dt) => {
      for (let i = 0; i < N; i++) {
        const car = cars[i];
        // crude spacing: slow if the car ahead on the same loop is close
        car.s += car.v * dt;
        car.loop.at(car.s, _v1, _v2);
        const targetYaw = Math.atan2(-_v2.x, -_v2.z) + Math.PI;
        let dy = targetYaw - car.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        car.yaw += dy * Math.min(1, dt * 7);
        _dummy.position.copy(_v1);
        _dummy.rotation.set(0, car.yaw, 0);
        _dummy.scale.set(1, 1, car.long ? 1.55 : 1);
        _dummy.updateMatrix();
        bodies.setMatrixAt(i, _dummy.matrix);
        lights.setMatrixAt(i, _dummy.matrix);
        if (i < uN) under.setMatrixAt(i, _dummy.matrix);
        traffic.carXZ[i * 2] = _v1.x;
        traffic.carXZ[i * 2 + 1] = _v1.z;
      }
      bodies.instanceMatrix.needsUpdate = true;
      lights.instanceMatrix.needsUpdate = true;
      under.instanceMatrix.needsUpdate = true;
    });
  }

  // ════════════════ AIR TRAFFIC (spinners) ════════════════
  {
    const loops = [];
    C.AIR_LANES.forEach((alt, li) => {
      for (let k = 0; k < 3; k++) {
        const i0 = 1 + ((rnd() * (C.GRID - 3)) | 0);
        const i1 = Math.min(C.GRID - 1, i0 + 2 + ((rnd() * 4) | 0));
        const j0 = 1 + ((rnd() * (C.GRID - 3)) | 0);
        const j1 = Math.min(C.GRID - 1, j0 + 2 + ((rnd() * 4) | 0));
        if (i1 <= i0 + 1 || j1 <= j0 + 1) { k--; continue; }
        loops.push(rectLoop(i0, j0, i1, j1, alt, 22, (rnd() - 0.5) * 4));
      }
    });

    const N = C.AIR_COUNT;
    const craft = [];
    for (let i = 0; i < N; i++) {
      const loop = loops[i % loops.length];
      craft.push({ loop, s: rnd() * loop.total, v: 20 + rnd() * 16, yaw: 0, roll: 0, bobP: rnd() * 9 });
    }

    // dart-shaped body
    const bodyGeo = new THREE.CylinderGeometry(0, 1.05, 4.6, 4);
    bodyGeo.rotateX(-Math.PI / 2);
    bodyGeo.scale(1.5, 0.5, 1);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x141826, roughness: 0.3, metalness: 0.8, envMapIntensity: 1.1 });
    const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, N);
    bodies.frustumCulled = false;
    scene.add(bodies);

    // lights: nose white + tail red strip + belly glow
    function airLights() {
      const geoms = [];
      const mk = (g, color) => {
        const cols = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < cols.length; i += 3) { cols[i] = color[0]; cols[i + 1] = color[1]; cols[i + 2] = color[2]; }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        geoms.push(g);
      };
      const nose = new THREE.PlaneGeometry(0.5, 0.3); nose.rotateY(Math.PI); nose.translate(0, 0, -2.32); mk(nose, [2.4, 2.4, 2.2]);
      const tail = new THREE.PlaneGeometry(1.5, 0.22); tail.translate(0, 0, 2.32); mk(tail, [2.8, 0.1, 0.25]);
      const belly = new THREE.PlaneGeometry(1.4, 3.2); belly.rotateX(Math.PI / 2); belly.translate(0, -0.4, 0); mk(belly, [0.1, 1.6, 2.0]);
      return BufferGeometryUtils.mergeGeometries(geoms);
    }
    const lights = new THREE.InstancedMesh(airLights(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), N);
    lights.frustumCulled = false;
    scene.add(lights);

    traffic.airXZ = new Float32Array(N * 2);

    traffic.updateFns.push((dt, t) => {
      for (let i = 0; i < N; i++) {
        const a = craft[i];
        a.s += a.v * dt;
        a.loop.at(a.s, _v1, _v2);
        _v1.y += Math.sin(t * 0.9 + a.bobP) * 1.4;
        const targetYaw = Math.atan2(-_v2.x, -_v2.z) + Math.PI;
        let dy = targetYaw - a.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        a.yaw += dy * Math.min(1, dt * 4);
        a.roll += (clamp(-dy * 14, -0.55, 0.55) - a.roll) * Math.min(1, dt * 5);
        _dummy.position.copy(_v1);
        _dummy.rotation.set(0, a.yaw, a.roll, 'YXZ');
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        bodies.setMatrixAt(i, _dummy.matrix);
        lights.setMatrixAt(i, _dummy.matrix);
        traffic.airXZ[i * 2] = _v1.x;
        traffic.airXZ[i * 2 + 1] = _v1.z;
      }
      bodies.instanceMatrix.needsUpdate = true;
      lights.instanceMatrix.needsUpdate = true;
    });
  }

  // ════════════════ MONORAIL ════════════════
  {
    const CTR = (C.GRID - 1) / 2; // 5 — rings use road indices around downtown
    const lineDefs = [
      {
        name: 'LINE A — KESSLER LOOP', color: NEON.cyan, h: 16,
        i0: 4, j0: 4, i1: 7, j1: 7, dir: 1, trains: 2,
        stations: ['AZIMUTH', 'PERIHELION', 'KESSLER CENTRAL', 'KUIPER'],
      },
      {
        name: 'LINE B — RIM CIRCLE', color: NEON.magenta, h: 23,
        i0: 2, j0: 2, i1: 9, j1: 9, dir: -1, trains: 2, gateNames: true,
        stations: ['HOHMANN', 'LAGRANGE', 'GAGARIN WEST', 'VULCAN GATE'],
      },
    ];

    const railOffset = C.ROAD / 2 + 1.2; // run the beam along the curb line, not mid-road

    for (const def of lineDefs) {
      const loop = rectLoop(def.i0, def.j0, def.i1, def.j1, def.h, 16, -railOffset);

      // ── track beam + glow strip (smooth curve from dense samples) ──
      const samples = [];
      const SN = 220;
      for (let i = 0; i < SN; i++) {
        loop.at((i / SN) * loop.total, _v1);
        samples.push(_v1.clone());
      }
      const curve = new THREE.CatmullRomCurve3(samples, true, 'catmullrom', 0.12);
      const beam = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 300, 0.62, 6, true),
        new THREE.MeshStandardMaterial({ color: 0x232a40, roughness: 0.35, metalness: 0.75, envMapIntensity: 0.8 })
      );
      beam.frustumCulled = false;
      scene.add(beam);
      const glowSamples = samples.map(p => p.clone().setY(p.y + 0.75));
      const glowCurve = new THREE.CatmullRomCurve3(glowSamples, true, 'catmullrom', 0.12);
      const glowStrip = new THREE.Mesh(
        new THREE.TubeGeometry(glowCurve, 300, 0.14, 4, true),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(0.95), toneMapped: false })
      );
      glowStrip.frustumCulled = false;
      scene.add(glowStrip);

      // ── pylons ──
      {
        const count = Math.floor(loop.total / 24);
        const geo = new THREE.BoxGeometry(1.1, 1, 1.1);
        geo.translate(0, 0.5, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0x1a1f30, roughness: 0.5, metalness: 0.6 });
        const pylons = new THREE.InstancedMesh(geo, mat, count);
        let pi = 0;
        for (let k = 0; k < count; k++) {
          loop.at((k / count) * loop.total, _v1);
          const inside = world.colliders.some(c => !c._deck && _v1.x > c.minX - 0.6 && _v1.x < c.maxX + 0.6 && _v1.z > c.minZ - 0.6 && _v1.z < c.maxZ + 0.6);
          if (inside) continue;
          _dummy.position.set(_v1.x, 0, _v1.z);
          _dummy.scale.set(1, def.h - 0.4, 1);
          _dummy.rotation.set(0, 0, 0);
          _dummy.updateMatrix();
          pylons.setMatrixAt(pi++, _dummy.matrix);
          world.colliders.push({ minX: _v1.x - 0.7, maxX: _v1.x + 0.7, minZ: _v1.z - 0.7, maxZ: _v1.z + 0.7 });
        }
        pylons.count = pi;
        pylons.frustumCulled = false;
        scene.add(pylons);
      }

      // ── stations at the four side midpoints ──
      const railTop = def.h + 0.62;
      const platY = railTop + 0.3;            // platform floor == car floor
      const H = C.HALF;
      const rx = (i) => -H + i * C.CELL - C.ROAD / 2;
      const xm = (rx(def.i0) + rx(def.i1)) / 2, zm = (rx(def.j0) + rx(def.j1)) / 2;
      const sideMid = [
        { x: xm, z: rx(def.j0) - railOffset, out: [0, -1] },   // north side, platform further north
        { x: rx(def.i1) + railOffset, z: zm, out: [1, 0] },
        { x: xm, z: rx(def.j1) + railOffset, out: [0, 1] },
        { x: rx(def.i0) - railOffset, z: zm, out: [-1, 0] },
      ];
      const stations = [];
      sideMid.forEach((sm, k) => {
        // arc position on loop nearest this point
        let bestS = 0, bestD = 1e9;
        for (let s = 0; s < loop.total; s += 2) {
          loop.at(s, _v1);
          const d = (_v1.x - sm.x) ** 2 + (_v1.z - sm.z) ** 2;
          if (d < bestD) { bestD = d; bestS = s; }
        }
        const ox = sm.out[0], oz = sm.out[1];
        const px = sm.x + ox * 4.2, pz = sm.z + oz * 4.2;   // platform center, outboard of beam
        const alongX = Math.abs(ox) < 0.5;                  // platform длина along track direction
        const L = 30, W = 5;
        const g = new THREE.Group();
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(alongX ? L : W, 0.5, alongX ? W : L),
          new THREE.MeshStandardMaterial({ color: 0x202637, roughness: 0.45, metalness: 0.5 })
        );
        slab.position.set(px, platY - 0.25, pz);
        g.add(slab);
        world.raycastTargets.push(slab);
        // glowing platform edge (track side)
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(alongX ? L : 0.25, 0.12, alongX ? 0.25 : L),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.amber).multiplyScalar(1.0), toneMapped: false })
        );
        edge.position.set(px - ox * (W / 2 - 0.2), platY + 0.08, pz - oz * (W / 2 - 0.2));
        g.add(edge);
        // canopy + supports
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(alongX ? L * 0.9 : W + 1.5, 0.3, alongX ? W + 1.5 : L * 0.9),
          new THREE.MeshStandardMaterial({ color: 0x141a2a, roughness: 0.5, metalness: 0.55, emissive: new THREE.Color(def.color), emissiveIntensity: 0.25 })
        );
        canopy.position.set(px, platY + 4.6, pz);
        g.add(canopy);
        for (const e of [-1, 1]) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 4.6, 6), slab.material);
          col.position.set(px + (alongX ? e * L * 0.38 : 0), platY + 2.3, pz + (alongX ? 0 : e * L * 0.38));
          g.add(col);
          // support columns to ground
          const sup = new THREE.Mesh(new THREE.BoxGeometry(1.4, platY, 1.4), slab.material);
          sup.position.set(px + (alongX ? e * L * 0.3 : 0), platY / 2, pz + (alongX ? 0 : e * L * 0.3));
          g.add(sup);
          world.colliders.push({ minX: sup.position.x - 0.8, maxX: sup.position.x + 0.8, minZ: sup.position.z - 0.8, maxZ: sup.position.z + 0.8 });
        }
        // station name holo sign — redrawable for the live arrival countdown
        const dName = (world.districtAt && def.gateNames) ? `${world.districtAt(px, pz).short} GATE` : null;
        const stName = dName || def.stations[k];
        const signKit = (() => {
          const cnv = document.createElement('canvas');
          cnv.width = 512; cnv.height = 128;
          const ctx = cnv.getContext('2d');
          const tex = new THREE.CanvasTexture(cnv);
          tex.colorSpace = THREE.SRGBColorSpace;
          const colorCss = `#${new THREE.Color(def.color).getHexString()}`;
          const draw = (line2) => {
            ctx.clearRect(0, 0, 512, 128);
            ctx.fillStyle = 'rgba(4,6,14,0.92)'; ctx.fillRect(0, 0, 512, 128);
            ctx.strokeStyle = colorCss;
            ctx.lineWidth = 4; ctx.strokeRect(4, 4, 504, 120);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = colorCss; ctx.shadowBlur = 16;
            ctx.font = 'bold 40px Orbitron, monospace';
            ctx.fillStyle = '#fff';
            ctx.fillText(`◊ ${stName}`, 256, 38);
            ctx.font = '30px "Share Tech Mono", monospace';
            ctx.fillStyle = colorCss;
            ctx.shadowBlur = 8;
            ctx.fillText(line2 || '', 256, 90);
            tex.needsUpdate = true;
          };
          draw('');
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
          sign.position.set(px, platY + 3.65, pz);
          if (!alongX) sign.rotation.y = Math.PI / 2;
          g.add(sign);
          return { draw, last: '' };
        })();
        scene.add(g);

        // walkable platform + stairs (two ramps from ground at both ends)
        const surf = alongX
          ? { minX: px - L / 2, maxX: px + L / 2, minZ: pz - W / 2, maxZ: pz + W / 2, y: platY }
          : { minX: px - W / 2, maxX: px + W / 2, minZ: pz - L / 2, maxZ: pz + L / 2, y: platY };
        world.surfaces.push(surf);

        const stairLen = 26, stairW = 3;
        for (const e of [-1, 1]) {
          // ramp descends outward from the platform end, doubling back along the outside
          const sx0 = px + (alongX ? e * L / 2 : ox * (W / 2 + stairW / 2 + 0.3));
          const sz0 = pz + (alongX ? oz * (W / 2 + stairW / 2 + 0.3) : e * L / 2);
          let ramp;
          if (alongX) {
            const xA = sx0, xB = sx0 + e * stairLen;
            ramp = {
              minX: Math.min(xA, xB), maxX: Math.max(xA, xB),
              minZ: sz0 - stairW / 2, maxZ: sz0 + stairW / 2,
              yFn: (x, z) => platY * clamp(1 - Math.abs(x - xA) / stairLen, 0, 1),
            };
          } else {
            const zA = sz0, zB = sz0 + e * stairLen;
            ramp = {
              minX: sx0 - stairW / 2, maxX: sx0 + stairW / 2,
              minZ: Math.min(zA, zB), maxZ: Math.max(zA, zB),
              yFn: (x, z) => platY * clamp(1 - Math.abs(z - zA) / stairLen, 0, 1),
            };
          }
          // walkable ramp: y as a function of position
          world.surfaces.push({
            minX: ramp.minX, maxX: ramp.maxX, minZ: ramp.minZ, maxZ: ramp.maxZ,
            y: ramp.yFn,
          });
          // visual ramp
          const rampLenActual = Math.hypot(stairLen, platY);
          const rampMesh = new THREE.Mesh(
            new THREE.BoxGeometry(alongX ? rampLenActual : stairW, 0.35, alongX ? stairW : rampLenActual),
            slab.material
          );
          const midX = alongX ? (sx0 + e * stairLen / 2) : sx0;
          const midZ = alongX ? sz0 : (sz0 + e * stairLen / 2);
          rampMesh.position.set(midX, platY / 2, midZ);
          const ang = Math.atan2(platY, stairLen);
          if (alongX) rampMesh.rotation.z = -e * ang; else rampMesh.rotation.x = e * ang;
          scene.add(rampMesh);
          world.raycastTargets.push(rampMesh);
          // glow handrail
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(alongX ? rampLenActual : 0.12, 0.12, alongX ? 0.12 : rampLenActual),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(0.8), toneMapped: false })
          );
          rail.position.set(midX + (alongX ? 0 : (ox * stairW * 0.55)), platY / 2 + 1.05, midZ + (alongX ? oz * stairW * 0.55 : 0));
          if (alongX) rail.rotation.z = -e * ang; else rail.rotation.x = e * ang;
          scene.add(rail);
        }

        const station = {
          name: stName, s: bestS, x: px, z: pz, platY, line: def.name,
          doorPoint: new THREE.Vector3(sm.x + ox * 2.0, platY, sm.z + oz * 2.0),
          bounds: surf, signKit,
        };
        stations.push(station);
        world.pois.push({ name: `STN ${stName}`, pos: new THREE.Vector3(px, platY, pz), desc: def.name, elevated: true });
      });
      stations.sort((a, b) => a.s - b.s);

      // ── trains ──
      const carBodies = makeTrainCarTemplate(def.color);
      const lineTrains = [];
      for (let tn = 0; tn < def.trains; tn++) {
        const cars = [];
        for (let k = 0; k < C.RAIL.cars; k++) {
          const g = carBodies.build(k === 0);
          scene.add(g);
          cars.push(g);
        }
        const train = {
          line: def.name, color: def.color, loop, stations,
          s: (tn / def.trains) * loop.total,
          v: 0, state: 'cruise', dwellT: 0, nextStation: null,
          dir: def.dir, cars, railTop, platY,
          headPos: new THREE.Vector3(),
        };
        // find next station ahead
        train.nextStation = nearestStationAhead(train);
        traffic.trains.push(train);
        lineTrains.push(train);
      }

      // live arrival countdown on the station holo signs (~3 Hz)
      {
        let acc = 0;
        traffic.updateFns.push((dt) => {
          acc += dt;
          if (acc < 0.35) return;
          acc = 0;
          for (const st of stations) {
            let text;
            const dwelling = lineTrains.find(tr => tr.state === 'dwell' && tr.nextStation === st);
            if (dwelling) {
              text = `BOARDING  0:${String(Math.max(0, dwelling.dwellT) | 0).padStart(2, '0')}`;
            } else {
              let eta = Infinity;
              for (const tr of lineTrains) {
                const L = tr.loop.total;
                let d = (st.s - ((tr.s % L) + L) % L) * tr.dir;
                d = ((d % L) + L) % L;
                let e = d / C.RAIL.speed;
                if (tr.state === 'dwell') e += Math.max(0, tr.dwellT);
                if (e < eta) eta = e;
              }
              text = eta < 4 ? 'ARRIVING' : `NEXT  ${(eta / 60) | 0}:${String((eta % 60) | 0).padStart(2, '0')}`;
            }
            if (text !== st.signKit.last) {
              st.signKit.last = text;
              st.signKit.draw(text);
            }
          }
        });
      }
    }

    function surfToCollider(s) {
      return { minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ };
    }

    function nearestStationAhead(train) {
      const sNow = ((train.s % train.loop.total) + train.loop.total) % train.loop.total;
      let best = null, bestDelta = Infinity;
      for (const st of train.stations) {
        let d = (st.s - sNow) * train.dir;
        d = ((d % train.loop.total) + train.loop.total) % train.loop.total;
        if (d < 3) d += train.loop.total; // just departed
        if (d < bestDelta) { bestDelta = d; best = st; }
      }
      return best;
    }
    traffic._nearestStationAhead = nearestStationAhead;

    traffic.updateFns.push((dt, t) => {
      for (const train of traffic.trains) {
        const L = train.loop.total;
        if (train.state === 'dwell') {
          train.dwellT -= dt;
          train.v = 0;
          if (train.dwellT <= 0) {
            train.state = 'cruise';
            train.justDeparted = train.nextStation;
            train.nextStation = nearestStationAhead(train);
            train.departed = true;
          }
        } else {
          // distance to next station along travel direction
          let d = (train.nextStation.s - ((train.s % L) + L) % L) * train.dir;
          d = ((d % L) + L) % L;
          const cruise = C.RAIL.speed;
          const target = d < 42 ? Math.max(2.2, cruise * (d / 42)) : cruise;
          train.v += clamp(target - train.v, -18 * dt, 9 * dt);
          train.s += train.v * train.dir * dt;
          if (d < 0.8) {
            train.state = 'dwell';
            train.dwellT = C.RAIL.dwell;
            train.v = 0;
            train.s = train.nextStation.s; // snap
            train.arrived = true;
          }
        }
        // place cars
        for (let k = 0; k < train.cars.length; k++) {
          const sk = train.s - train.dir * k * C.RAIL.carGap;
          train.loop.at(sk, _v1, _v2);
          const sAhead = sk + train.dir * 2.5;
          train.loop.at(sAhead, _v3);
          _v1.y = train.railTop + 1.7;
          _v3.y = _v1.y;
          const car = train.cars[k];
          car.position.copy(_v1);
          car.lookAt(_v3);
          if (k === 0) train.headPos.copy(_v1);
        }
      }
    });

    // template builder — merged geometries per car: solid, glass, glow
    function makeTrainCarTemplate(colorHex) {
      const cl = C.RAIL.carLen;
      const solidMat = new THREE.MeshStandardMaterial({ color: 0x1e2436, roughness: 0.3, metalness: 0.7, envMapIntensity: 1.0 });
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x9fd8ff, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.22,
        emissive: 0x3a86a8, emissiveIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false,
      });
      const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex).multiplyScalar(1.1), toneMapped: false });
      const interiorMat = new THREE.MeshBasicMaterial({ color: 0xfff2d8, toneMapped: false, transparent: true, opacity: 0.85 });

      function build(isLead) {
        const g = new THREE.Group();
        const solidGeos = [];
        const floor = new THREE.BoxGeometry(3.2, 0.3, cl); floor.translate(0, -1.55, 0); solidGeos.push(floor);
        const roof = new THREE.BoxGeometry(3.2, 0.25, cl); roof.translate(0, 1.62, 0); solidGeos.push(roof);
        for (const ex of [-1.45, 1.45]) for (const ez of [-cl / 2 + 0.5, cl / 2 - 0.5]) {
          const p = new THREE.BoxGeometry(0.22, 3.1, 0.22); p.translate(ex, 0, ez); solidGeos.push(p);
        }
        const skirt = new THREE.BoxGeometry(1.7, 1.1, cl * 0.96); skirt.translate(0, -2.2, 0); solidGeos.push(skirt);
        if (isLead) {
          // lookAt() makes -Z the travel direction — nose goes on the -Z end
          const nose = new THREE.ConeGeometry(1.45, 2.2, 4);
          nose.rotateX(-Math.PI / 2);
          nose.rotateY(Math.PI);
          nose.rotateZ(Math.PI / 4);
          nose.scale(1.1, 0.72, 1);
          nose.translate(0, -0.2, -(cl / 2 + 1.05));
          solidGeos.push(nose);
        }
        const solid = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(solidGeos), solidMat);
        g.add(solid);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(2.95, 2.9, cl * 0.97), glassMat);
        glass.position.y = 0.05;
        g.add(glass);
        // glow strips + interior ceiling light
        const glowGeos = [];
        for (const ey of [-1.62]) for (const ex of [-1.62, 1.62]) {
          const s = new THREE.BoxGeometry(0.1, 0.1, cl * 0.95); s.translate(ex, ey, 0); glowGeos.push(s);
        }
        if (isLead) {
          const head = new THREE.PlaneGeometry(1.6, 0.5);
          head.rotateY(Math.PI);
          head.translate(0, -0.7, -(cl / 2 + 2.12));
          glowGeos.push(head);
        }
        const glow = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(glowGeos), glowMat);
        g.add(glow);
        const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2.6, cl * 0.9), interiorMat);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.y = 1.45;
        g.add(ceil);
        return g;
      }
      return { build };
    }
  }

  // ════════════════ SPACEPORT OPERATIONS ════════════════
  {
    const SP = world.spaceport;
    const shipDefs = [
      { model: 'Freighter', len: 30 }, { model: 'Tanker', len: 28 },
      { model: 'Shuttle', len: 16 }, { model: 'Passenger', len: 17 },
      { model: 'Passenger2', len: 15 }, { model: 'Rescue', len: 14 },
    ];

    function proceduralShip(len) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a3148, roughness: 0.35, metalness: 0.75, envMapIntensity: 1.1 });
      const hull = new THREE.Mesh(new THREE.CapsuleGeometry(len * 0.13, len * 0.62, 4, 10), mat);
      hull.rotation.z = Math.PI / 2;
      g.add(hull);
      for (const e of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(len * 0.32, len * 0.04, len * 0.26), mat);
        fin.position.set(-len * 0.22, 0, e * len * 0.18);
        g.add(fin);
      }
      const cabin = new THREE.Mesh(new THREE.SphereGeometry(len * 0.1, 10, 8), new THREE.MeshStandardMaterial({ color: 0x73e8ff, roughness: 0.15, metalness: 0.4, emissive: 0x2a8aa8, emissiveIntensity: 0.8 }));
      cabin.position.set(len * 0.3, len * 0.06, 0);
      g.add(cabin);
      return g;
    }

    function prepModel(name, len) {
      const src = models && models[name];
      let obj;
      if (src) {
        obj = src.clone(true);
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const maxH = Math.max(size.x, size.z);
        const s = len / (maxH || 1);
        obj.scale.setScalar(s);
        // recenter on origin, sit on y=0 plane later
        const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
        obj.position.sub(c);
        if (size.z > size.x) obj.rotateY(Math.PI / 2); // longest axis → +X
        const wrapper = new THREE.Group();
        wrapper.add(obj);
        obj.traverse(m => {
          if (m.isMesh && m.material) {
            m.material.envMapIntensity = 1.0;
          }
        });
        return wrapper;
      }
      obj = proceduralShip(len);
      return obj;
    }

    const glowTex = glowTexture(96, 'rgba(140,210,255,1)');
    const ships = [];
    world.pads.forEach((pad, i) => {
      const def = pad.big ? shipDefs[i % 2] : shipDefs[2 + (i % 4)];
      const grp = new THREE.Group();
      const body = prepModel(def.model, def.len);
      grp.add(body);
      // engine glow sprites (under + rear)
      const engUnder = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8fd4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      engUnder.scale.set(def.len * 0.8, def.len * 0.4, 1);
      engUnder.position.y = -def.len * 0.12;
      grp.add(engUnder);
      const engRear = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fb4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      engRear.scale.set(def.len * 0.5, def.len * 0.5, 1);
      engRear.position.x = -def.len * 0.55;
      grp.add(engRear);
      const restY = def.len * 0.16 + 0.6;
      grp.position.set(pad.x, restY, pad.z);
      grp.rotation.y = rnd() * Math.PI * 2;
      scene.add(grp);
      ships.push({
        grp, engUnder, engRear, pad, restY, len: def.len,
        state: 'parked', t: rnd() * 18 + 6, phase: rnd() * 10,
        cruiseDir: new THREE.Vector3(0.82, 0.38, (rnd() - 0.5) * 0.6).normalize(),
        v: 0,
      });
    });

    traffic.ships = ships;
    traffic.updateFns.push((dt, t) => {
      for (const sh of ships) {
        switch (sh.state) {
          case 'parked':
            sh.t -= dt;
            sh.grp.position.y = sh.restY;
            if (sh.t <= 0) { sh.state = 'spool'; sh.t = 3.5; }
            break;
          case 'spool': {
            sh.t -= dt;
            const k = 1 - sh.t / 3.5;
            sh.engUnder.material.opacity = k * 0.85;
            sh.grp.position.y = sh.restY + Math.sin(t * 30) * 0.04 * k;
            if (sh.t <= 0) { sh.state = 'ascend'; sh.t = 0; }
            break;
          }
          case 'ascend': {
            sh.t += dt;
            const k = Math.min(1, sh.t / 9);
            const e = k * k * (3 - 2 * k);
            sh.grp.position.y = sh.restY + e * 72;
            sh.grp.rotation.y += dt * 0.15;
            sh.engUnder.material.opacity = 0.85;
            if (k >= 1) {
              sh.state = 'cruise'; sh.v = 6;
              // face cruise direction
              const yaw = Math.atan2(sh.cruiseDir.z, sh.cruiseDir.x);
              sh.grp.rotation.set(0, -yaw, 0);
            }
            break;
          }
          case 'cruise': {
            sh.v = Math.min(85, sh.v + dt * 22);
            sh.grp.position.addScaledVector(sh.cruiseDir, sh.v * dt);
            sh.grp.rotation.z = THREE.MathUtils.lerp(sh.grp.rotation.z, -0.22, dt);
            sh.engRear.material.opacity = 0.9;
            sh.engUnder.material.opacity = Math.max(0, sh.engUnder.material.opacity - dt * 0.5);
            if (sh.grp.position.y > 330 || sh.grp.position.length() > 1100) {
              sh.state = 'await'; sh.t = 8 + rnd() * 14;
              sh.engRear.material.opacity = 0;
            }
            break;
          }
          case 'await':
            sh.t -= dt;
            if (sh.t <= 0) {
              // arrival: spawn high above, descend
              sh.state = 'descend';
              sh.grp.position.set(sh.pad.x + 40, 230, sh.pad.z - 30);
              sh.grp.rotation.set(0, rnd() * Math.PI * 2, 0);
              sh.t = 0;
            }
            break;
          case 'descend': {
            sh.t += dt;
            const k = Math.min(1, sh.t / 11);
            const e = 1 - (1 - k) * (1 - k);
            _v1.set(sh.pad.x, sh.restY, sh.pad.z);
            _v2.set(sh.pad.x + 40 * (1 - e), sh.restY + (230 - sh.restY) * (1 - e), sh.pad.z - 30 * (1 - e));
            sh.grp.position.copy(_v2);
            sh.engUnder.material.opacity = 0.3 + 0.55 * e;
            sh.grp.rotation.y += dt * 0.2;
            if (k >= 1) {
              sh.state = 'parked';
              sh.t = 14 + rnd() * 22;
              sh.engUnder.material.opacity = 0;
            }
            break;
          }
        }
      }
    });

    // Atmospheric patrol jets — wide holding circuits over the port
    const jets = [];
    for (let j = 0; j < 2; j++) {
      const jet = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x1c2236, roughness: 0.4, metalness: 0.7 });
      const fus = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 5), mat);
      fus.rotation.x = Math.PI / 2;
      jet.add(fus);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.18, 2.2), mat);
      wing.position.z = 0.8;
      jet.add(wing);
      const burner = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa24d, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      burner.scale.set(2.4, 2.4, 1);
      burner.position.z = 3.8;
      jet.add(burner);
      scene.add(jet);
      jets.push({ jet, phase: j * Math.PI, r: 180 + j * 60, h: 52 + j * 22, w: 0.14 - j * 0.03 });
    }
    traffic.updateFns.push((dt, t) => {
      for (const J of jets) {
        const a = t * J.w + J.phase;
        const cx = SP.x0 + 130, cz = 0;
        J.jet.position.set(cx + Math.cos(a) * J.r, J.h + Math.sin(t * 0.7 + J.phase) * 4, cz + Math.sin(a) * J.r * 0.8);
        const ta = a + 0.06;
        _v1.set(cx + Math.cos(ta) * J.r, J.jet.position.y, cz + Math.sin(ta) * J.r * 0.8);
        J.jet.lookAt(_v1);
        J.jet.rotateZ(-0.35);
      }
    });

    // Runway + chasing approach lights
    {
      const rwX = SP.x0 + 150;
      const rw = new THREE.Mesh(
        new THREE.PlaneGeometry(26, 280),
        new THREE.MeshStandardMaterial({ color: 0x0c0d13, roughness: 0.3, metalness: 0.7, envMapIntensity: 0.9 })
      );
      rw.rotation.x = -Math.PI / 2;
      rw.position.set(rwX, 0.01, 0);
      scene.add(rw);
      const edgeGeo = new THREE.BoxGeometry(0.5, 0.22, 0.5);
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const nE = 2 * 15;
      const edges = new THREE.InstancedMesh(edgeGeo, edgeMat, nE);
      let ei = 0;
      const ecol = new THREE.Color();
      for (let k = 0; k < 15; k++) {
        for (const sx of [-12.4, 12.4]) {
          _dummy.position.set(rwX + sx, 0.12, -133 + k * 19);
          _dummy.rotation.set(0, 0, 0); _dummy.scale.setScalar(1);
          _dummy.updateMatrix();
          edges.setMatrixAt(ei, _dummy.matrix);
          edges.setColorAt(ei, ecol.setHex(0xfff2cf).multiplyScalar(1.1));
          ei++;
        }
      }
      edges.instanceColor.needsUpdate = true;
      edges.frustumCulled = false;
      scene.add(edges);
      // chasing strobes leading onto the runway
      const chaseN = 10;
      const chase = new THREE.InstancedMesh(edgeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), chaseN);
      for (let k = 0; k < chaseN; k++) {
        _dummy.position.set(rwX, 0.12, 160 + k * 9);
        _dummy.updateMatrix();
        chase.setMatrixAt(k, _dummy.matrix);
        chase.setColorAt(k, new THREE.Color(1.4, 1.4, 1.4));
      }
      chase.frustumCulled = false;
      scene.add(chase);
      const ccol = new THREE.Color();
      traffic.updateFns.push((dt, t) => {
        const head = (t * 9) % chaseN;
        for (let k = 0; k < chaseN; k++) {
          const lit = (chaseN - 1 - k + head) % chaseN < 1.6 ? 1.5 : 0.1;
          chase.setColorAt(k, ccol.setScalar(lit));
        }
        chase.instanceColor.needsUpdate = true;
      });
    }
  }

  // ════════════════ PATROL DRONES (searchlights) ════════════════
  {
    const drones = [];
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xaee6ff, transparent: true, opacity: 0.09,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.35, metalness: 0.8 })
      );
      g.add(body);
      const blinker = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.red).multiplyScalar(1.5), toneMapped: false }));
      blinker.position.y = 1.0;
      g.add(blinker);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 38, 12, 1, true), coneMat);
      cone.geometry.translate(0, -19, 0);
      g.add(cone);
      scene.add(g);
      drones.push({ g, blinker, cone, seed: rnd() * 100 });
    }
    traffic.updateFns.push((dt, t) => {
      for (const d of drones) {
        const s = d.seed;
        d.g.position.set(
          Math.sin(t * 0.071 + s) * 240 + Math.sin(t * 0.031 + s * 2) * 90,
          42 + Math.sin(t * 0.2 + s) * 6,
          Math.cos(t * 0.057 + s * 1.3) * 240 + Math.cos(t * 0.043 + s) * 70
        );
        d.cone.rotation.x = Math.sin(t * 0.4 + s) * 0.3;
        d.cone.rotation.z = Math.cos(t * 0.33 + s) * 0.3;
        d.blinker.visible = ((t + s) % 1.1) < 0.15;
      }
    });
  }

  // ════════════════ UFO CAMEO ════════════════
  {
    let ufoObj = null;
    if (models && models.UFO) {
      ufoObj = models.UFO.clone(true);
      const box = new THREE.Box3().setFromObject(ufoObj);
      const size = box.getSize(new THREE.Vector3());
      ufoObj.scale.setScalar(14 / Math.max(size.x, size.z));
    } else {
      ufoObj = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 8), new THREE.MeshStandardMaterial({ color: 0x2c3450, roughness: 0.3, metalness: 0.9 }));
      disc.scale.y = 0.25;
      ufoObj.add(disc);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7dffc8, transparent: true, opacity: 0.7, toneMapped: false }));
      dome.position.y = 1.2;
      ufoObj.add(dome);
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(7.4, 0.3, 6, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dffc8).multiplyScalar(1.3), toneMapped: false })
    );
    ring.rotation.x = Math.PI / 2;
    ufoObj.add(ring);
    ufoObj.visible = false;
    scene.add(ufoObj);
    let state = { active: false, t: 0, next: 40 + rnd() * 50, from: new THREE.Vector3(), to: new THREE.Vector3() };
    traffic.ufo = ufoObj;
    traffic.updateFns.push((dt, t) => {
      if (!state.active) {
        state.next -= dt;
        if (state.next <= 0) {
          state.active = true; state.t = 0;
          const a = rnd() * Math.PI * 2;
          state.from.set(Math.cos(a) * 800, 190 + rnd() * 80, Math.sin(a) * 800);
          state.to.set(-state.from.x + (rnd() - 0.5) * 400, 170 + rnd() * 90, -state.from.z + (rnd() - 0.5) * 400);
          ufoObj.visible = true;
        }
      } else {
        state.t += dt / 13;
        const k = state.t;
        ufoObj.position.lerpVectors(state.from, state.to, k);
        ufoObj.position.y += Math.sin(k * Math.PI * 5) * 9;
        ufoObj.position.x += Math.sin(k * Math.PI * 7.3) * 14;
        ufoObj.rotation.y += dt * 2.5;
        ring.scale.setScalar(1 + 0.12 * Math.sin(t * 9));
        if (k >= 1) { state.active = false; ufoObj.visible = false; state.next = 60 + rnd() * 70; }
      }
    });
  }

  // ── boarding helper for the player ──
  // Forgiving: anywhere on the station platform while a train dwells there
  // counts; you board the nearest car. (Old strict mode needed you within a
  // few units of a car door.)
  traffic.getBoardable = (playerPos, playerFeetY) => {
    for (const train of traffic.trains) {
      if (train.state !== 'dwell') continue;
      const st = train.nextStation;
      const b = st.bounds;
      const onPlatform = b &&
        playerPos.x > b.minX - 1.5 && playerPos.x < b.maxX + 1.5 &&
        playerPos.z > b.minZ - 1.5 && playerPos.z < b.maxZ + 1.5 &&
        Math.abs(st.platY - playerFeetY) < 2.4;
      let bestK = -1, bestD = onPlatform ? Infinity : 23;
      for (let k = 0; k < train.cars.length; k++) {
        const c = train.cars[k];
        const dx = c.position.x - playerPos.x, dz = c.position.z - playerPos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD && Math.abs((c.position.y - 1.4) - playerFeetY) < 2.6) { bestD = d; bestK = k; }
      }
      if (bestK >= 0) return { train, carIdx: bestK, station: st };
    }
    return null;
  };

  return traffic;
}
