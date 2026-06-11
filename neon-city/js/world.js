// ════════════════════════════════════════════════════════════════
// NEON CITY — world generation
// Procedural city: instanced buildings with fully-GPU window shader
// (3DWorld-style hashed window cells), neon signage, the Spire +
// glass elevator + observation deck, Gagarin Spaceport statics,
// sky dome + gas giant + skyline silhouette ring, streets with
// wet-asphalt env reflections. Also owns colliders, walkable
// surfaces, groundHeightAt() and POIs.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { C, NEON, NEON_LIST, mulberry32, pick, clamp, makeCanvas, canvasTexture, glowTexture, hexCss } from './config.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function buildWorld(scene, renderer) {
  const rnd = mulberry32(C.SEED);
  const world = {
    colliders: [],     // {minX,maxX,minZ,maxZ} — block XZ motion
    surfaces: [],      // {minX,maxX,minZ,maxZ,y} — walkable elevated floors (y may mutate)
    pois: [],          // {name, pos:Vector3, desc}
    interactables: [], // {label, pos, radius, action()}
    uTime: { value: 0 },
    flicker: { value: 1 },
    updateFns: [],
    raycastTargets: [],   // meshes lasers can hit
    update(dt, t) { for (const f of this.updateFns) f(dt, t); },
  };

  // Walkable height under (x,z) given current player y — picks the highest
  // surface at or below (py + step). Ground level 0 everywhere in-bounds.
  world.groundHeightAt = (x, z, py = 0) => {
    let h = 0;
    for (const s of world.surfaces) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
        const sy = (typeof s.y === 'function') ? s.y(x, z) : s.y;
        if (sy <= py + 1.1 && sy > h) h = sy;
      }
    }
    return h;
  };

  const addBox = (minX, maxX, minZ, maxZ) => world.colliders.push({ minX, maxX, minZ, maxZ });

  // ─────────────────────────── LIGHTING ───────────────────────────
  const hemi = new THREE.HemisphereLight(0x564397, 0x16102a, 0.92);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fb4ff, 0.5);
  moon.position.set(-300, 500, -200);
  scene.add(moon);
  world.hemi = hemi;

  // ─────────────────────────── SKY ───────────────────────────
  {
    const [c, ctx] = makeCanvas(16, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, '#02010a');
    g.addColorStop(0.42, '#0b0420');
    g.addColorStop(0.72, '#1b0a33');
    g.addColorStop(0.88, '#341043');
    g.addColorStop(1.0, '#4a1747');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256);
    const skyTex = canvasTexture(c);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1380, 24, 18),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    sky.renderOrder = -10;
    scene.add(sky);

    // Stars — upper hemisphere only
    const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, e = 0.12 + rnd() * 1.35, r = 1280;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
      const w = 0.5 + rnd() * 0.5, tint = rnd();
      col[i * 3] = w * (tint < 0.3 ? 0.8 : 1);
      col[i * 3 + 1] = w * 0.92;
      col[i * 3 + 2] = w;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false,
      transparent: true, opacity: 0.85, depthWrite: false,
    }));
    stars.renderOrder = -9;
    scene.add(stars);

    // Gas giant on the horizon — Interstellar Slingshot is up there somewhere.
    const [pc, pctx] = makeCanvas(256, 256);
    const pg = pctx.createLinearGradient(0, 30, 0, 226);
    pg.addColorStop(0, '#6b3d8f'); pg.addColorStop(0.3, '#9a4f9e');
    pg.addColorStop(0.5, '#c96a9a'); pg.addColorStop(0.65, '#8f4585');
    pg.addColorStop(1, '#3a1f55');
    pctx.fillStyle = pg; pctx.beginPath(); pctx.arc(128, 128, 98, 0, Math.PI * 2); pctx.fill();
    pctx.globalAlpha = 0.28; pctx.fillStyle = '#e9c9ff';
    for (let i = 0; i < 9; i++) pctx.fillRect(30, 52 + i * 18 + (rnd() * 6 | 0), 196, 3 + (rnd() * 4 | 0));
    pctx.globalAlpha = 1;
    const planetTex = canvasTexture(pc);
    const planet = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      new THREE.MeshBasicMaterial({ map: planetTex, transparent: true, fog: false, depthWrite: false, opacity: 0.92 })
    );
    planet.position.set(-880, 290, -940);
    planet.lookAt(0, 60, 0);
    planet.renderOrder = -8;
    scene.add(planet);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(118, 196, 48),
      new THREE.MeshBasicMaterial({ color: 0xc9a6e8, transparent: true, opacity: 0.25, side: THREE.DoubleSide, fog: false, depthWrite: false })
    );
    ring.position.copy(planet.position);
    ring.lookAt(0, 60, 0);
    ring.rotateX(1.18);
    ring.renderOrder = -8;
    scene.add(ring);
  }

  // ─────────────────────── ENVIRONMENT MAP (wet streets) ───────────────────────
  {
    const envScene = new THREE.Scene();
    const [ec, ectx] = makeCanvas(8, 64);
    const eg = ectx.createLinearGradient(0, 0, 0, 64);
    eg.addColorStop(0, '#2b1b52'); eg.addColorStop(0.55, '#100726'); eg.addColorStop(1, '#050214');
    ectx.fillStyle = eg; ectx.fillRect(0, 0, 8, 64);
    envScene.add(new THREE.Mesh(
      new THREE.SphereGeometry(60, 16, 12),
      new THREE.MeshBasicMaterial({ map: canvasTexture(ec), side: THREE.BackSide })
    ));
    // A few neon slabs so reflections smear pink/cyan on the asphalt.
    const slab = (color, x, y, z, w, h) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color }));
      m.position.set(x, y, z); m.lookAt(0, 8, 0); envScene.add(m);
    };
    slab(0x00f0ff, 30, 16, -22, 26, 30); slab(0xff2bd6, -34, 14, 10, 22, 26);
    slab(0x9d4cff, 8, 20, 38, 18, 34); slab(0xffb300, -16, 9, -36, 14, 12);
    slab(0x3d7bff, 42, 10, 24, 16, 14);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  }

  // ─────────────────────── GROUND + ROADS ───────────────────────
  const H = C.HALF;
  {
    // Sidewalk/concrete base across city + spaceport apron strip
    const [gc, gctx] = makeCanvas(256, 256);
    gctx.fillStyle = '#101018'; gctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      gctx.fillStyle = `rgba(${20 + rnd() * 26 | 0},${20 + rnd() * 26 | 0},${30 + rnd() * 30 | 0},0.5)`;
      gctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
    gctx.strokeStyle = 'rgba(0,0,0,0.5)'; gctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      gctx.beginPath(); gctx.moveTo(i * 64, 0); gctx.lineTo(i * 64, 256); gctx.stroke();
      gctx.beginPath(); gctx.moveTo(0, i * 64); gctx.lineTo(256, i * 64); gctx.stroke();
    }
    const baseTex = canvasTexture(gc, { repeat: [C.SPAN / 16, C.SPAN / 16] });
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(C.SPAN + 80, C.SPAN + 80),
      new THREE.MeshStandardMaterial({ map: baseTex, roughness: 0.62, metalness: 0.30, color: 0x9aa0b8 })
    );
    base.rotation.x = -Math.PI / 2; base.position.y = -0.02;
    scene.add(base);
    world.raycastTargets.push(base);

    // Wet asphalt roads — dark, glossy, env-reflective
    const [ac, actx] = makeCanvas(128, 128);
    actx.fillStyle = '#07070d'; actx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) {
      actx.fillStyle = `rgba(${10 + rnd() * 16 | 0},${10 + rnd() * 16 | 0},${16 + rnd() * 20 | 0},0.55)`;
      actx.fillRect(rnd() * 128, rnd() * 128, 2, 2);
    }
    const asphaltTex = canvasTexture(ac, { repeat: [3, C.SPAN / 24] });
    const roadMat = new THREE.MeshStandardMaterial({
      map: asphaltTex, color: 0x8d94ad, roughness: 0.2, metalness: 0.88,
      envMapIntensity: 1.15,
    });
    const roadGeoNS = new THREE.PlaneGeometry(C.ROAD, C.SPAN);
    const roadGeoEW = new THREE.PlaneGeometry(C.SPAN, C.ROAD);
    for (let i = 0; i <= C.GRID; i++) {
      const p = -H + i * C.CELL - C.ROAD / 2 + (i === 0 ? C.ROAD / 2 : 0);
      // skip outermost half-roads at exact edges; keep interior grid
      if (i === 0 || i === C.GRID) continue;
      const ns = new THREE.Mesh(roadGeoNS, roadMat);
      ns.rotation.x = -Math.PI / 2; ns.position.set(-H + i * C.CELL - C.ROAD / 2, 0.0, 0);
      scene.add(ns);
      const ew = new THREE.Mesh(roadGeoEW, roadMat);
      ew.rotation.x = -Math.PI / 2; ew.position.set(0, 0.001, -H + i * C.CELL - C.ROAD / 2);
      scene.add(ew);
    }

    // Neon curb strips along every block edge — the city's circuit-board glow
    const strip = new THREE.BoxGeometry(1, 0.12, 1);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const nBlocks = C.GRID * C.GRID;
    const curbs = new THREE.InstancedMesh(strip, stripMat, nBlocks * 4);
    const dummy = new THREE.Object3D();
    const cCyan = new THREE.Color(NEON.cyan).multiplyScalar(0.55);
    const cMag = new THREE.Color(NEON.magenta).multiplyScalar(0.5);
    const cPur = new THREE.Color(NEON.purple).multiplyScalar(0.5);
    let ci = 0;
    for (let bx = 0; bx < C.GRID; bx++) for (let bz = 0; bz < C.GRID; bz++) {
      const x0 = -H + bx * C.CELL + C.ROAD / 2, z0 = -H + bz * C.CELL + C.ROAD / 2;
      const col = [cCyan, cCyan, cMag, cPur][(bx + bz * 3) % 4];
      const edges = [
        [x0 + C.BLOCK / 2, z0, C.BLOCK, 0.3],
        [x0 + C.BLOCK / 2, z0 + C.BLOCK, C.BLOCK, 0.3],
        [x0, z0 + C.BLOCK / 2, 0.3, C.BLOCK],
        [x0 + C.BLOCK, z0 + C.BLOCK / 2, 0.3, C.BLOCK],
      ];
      for (const [ex, ez, sx, sz] of edges) {
        dummy.position.set(ex, 0.06, ez);
        dummy.scale.set(sx, 1, sz);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        curbs.setMatrixAt(ci, dummy.matrix);
        curbs.setColorAt(ci, col);
        ci++;
      }
    }
    curbs.count = ci;
    curbs.frustumCulled = false;
    scene.add(curbs);

    // Dashed lane centers
    const dashGeo = new THREE.BoxGeometry(0.35, 0.06, 3.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0x9097b8 });
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, 2400);
    let di = 0;
    for (let i = 1; i < C.GRID; i++) {
      const p = -H + i * C.CELL - C.ROAD / 2;
      for (let s = -H + 8; s < H - 8 && di < 2398; s += 9) {
        dummy.position.set(p, 0.03, s); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        dummy.updateMatrix(); dashes.setMatrixAt(di++, dummy.matrix);
        dummy.position.set(s, 0.031, p); dummy.rotation.set(0, Math.PI / 2, 0);
        dummy.updateMatrix(); dashes.setMatrixAt(di++, dummy.matrix);
      }
    }
    dashes.count = di;
    dashes.frustumCulled = false;
    scene.add(dashes);
  }

  // ─────────────────────── BUILDING SHADER (GPU windows) ───────────────────────
  // Unit cube instances; window cells computed in-shader from per-instance
  // scale so panes stay ~3u regardless of building size. Hash decides lit /
  // dark / color; a sparse subset flickers with uTime. Base floors darkened.
  function makeBuildingMaterial(litDensity, brightness) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x171a26, roughness: 0.48, metalness: 0.42, envMapIntensity: 0.5,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = world.uTime;
      shader.uniforms.uLitP = { value: litDensity };
      shader.uniforms.uBright = { value: brightness };
      shader.vertexShader = `
        attribute float aSeed;
        varying vec2 vBoxUv;
        varying float vSeed;
        varying float vSideMask;
        varying float vBH;
      ` + shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec3 iS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        float faceW = abs(normal.x) > 0.5 ? iS.z : iS.x;
        vBoxUv = vec2(uv.x * faceW, uv.y * iS.y);
        vSideMask = 1.0 - step(0.5, abs(normal.y));
        vSeed = aSeed;
        vBH = iS.y;
      `);
      shader.fragmentShader = `
        uniform float uTime;
        uniform float uLitP;
        uniform float uBright;
        varying vec2 vBoxUv;
        varying float vSeed;
        varying float vSideMask;
        varying float vBH;
        float nhash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
      ` + shader.fragmentShader
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          diffuseColor.rgb *= (0.42 + 0.58 * smoothstep(0.0, 16.0, vBoxUv.y));
          diffuseColor.rgb *= (0.90 + 0.10 * step(0.55, fract(vBoxUv.y / 7.4)));
        `)
        .replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          {
            vec2 cell = vec2(3.1, 3.7);
            vec2 cuv = vBoxUv / cell;
            vec2 id = floor(cuv);
            vec2 f = fract(cuv);
            float inWin = step(0.22, f.x) * step(f.x, 0.78) * step(0.30, f.y) * step(f.y, 0.74);
            float h = nhash(id + vSeed * 13.7);
            float lit = step(1.0 - uLitP, h);
            float hc = nhash(id * 1.7 + vSeed * 7.3);
            vec3 warm = vec3(1.0, 0.72, 0.38);
            vec3 cool = vec3(0.45, 0.83, 1.0);
            vec3 tealc = vec3(0.32, 1.0, 0.86);
            vec3 wcol = hc < 0.45 ? warm : (hc < 0.85 ? cool : tealc);
            float vary = 0.35 + 0.65 * nhash(id * 2.3 + vSeed * 3.1);  // per-window brightness spread
            float fl = nhash(id + floor(uTime * 1.7) + vSeed);
            float flicker = mix(1.0, step(0.22, fl), step(0.93, nhash(id * 3.1 + vSeed)));
            float ground = step(5.5, vBoxUv.y);
            float topFade = 1.0 - smoothstep(vBH - 2.0, vBH, vBoxUv.y);
            totalEmissiveRadiance += inWin * lit * vary * flicker * wcol * uBright * vSideMask * ground * topFade;
          }
        `);
    };
    return mat;
  }

  // ─────────────────────── CITY BLOCKS ───────────────────────
  const buildings = [];      // {x,z,w,d,h, district}
  const towerTrims = [];     // corner neon strips on selected towers
  const storefronts = [];    // ground-level emissive strips
  const signSpots = [];      // candidate wall mounts for neon signs {pos, rotY, h}
  const CENTER = (C.GRID - 1) / 2;

  for (let bx = 0; bx < C.GRID; bx++) for (let bz = 0; bz < C.GRID; bz++) {
    const x0 = -H + bx * C.CELL + C.ROAD / 2;
    const z0 = -H + bz * C.CELL + C.ROAD / 2;
    const cx = x0 + C.BLOCK / 2, cz = z0 + C.BLOCK / 2;
    const dist = Math.max(Math.abs(bx - CENTER), Math.abs(bz - CENTER));
    const isCenter = (bx === CENTER && bz === CENTER);
    const isArcade = (bz === C.GRID - 1 && bx >= 3 && bx <= 7);
    if (isCenter) continue;   // Spire + plaza handled separately

    let lots;
    if (dist <= 1) lots = 1 + (rnd() * 2 | 0);          // downtown: 1–2 big towers
    else if (dist <= 3) lots = 2 + (rnd() * 3 | 0);     // midtown
    else lots = 3 + (rnd() * 3 | 0);                    // outskirts: more, lower

    // subdivide block into lots (simple quadrant scatter)
    for (let l = 0; l < lots; l++) {
      const w = dist <= 1 ? 20 + rnd() * 24 : 12 + rnd() * 18;
      const d = dist <= 1 ? 20 + rnd() * 24 : 12 + rnd() * 18;
      const px = x0 + 4 + w / 2 + rnd() * (C.BLOCK - w - 8);
      const pz = z0 + 4 + d / 2 + rnd() * (C.BLOCK - d - 8);
      let h;
      if (dist <= 1) h = 85 + rnd() * 120;
      else if (dist === 2) h = 48 + rnd() * 75;
      else if (dist === 3) h = 30 + rnd() * 55;
      else h = 14 + rnd() * 38;
      if (isArcade) h = 12 + rnd() * 22;
      buildings.push({ x: px, z: pz, w, d, h, dist, arcade: isArcade });
    }
  }

  // Skyline silhouette ring (outside playable bounds, swallowed by fog)
  const skyline = [];
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    if (Math.abs(a) < 0.45 || Math.abs(a - Math.PI * 2) < 0.45) continue; // leave the spaceport's eastern sky open
    const r = 660 + rnd() * 240;
    skyline.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: 40 + rnd() * 70, d: 40 + rnd() * 70, h: 90 + rnd() * 260 });
  }

  // Instance everything (tiers for variety: tall buildings get a set-back top)
  {
    const items = [];
    for (const b of buildings) {
      items.push({ x: b.x, z: b.z, w: b.w, d: b.d, y0: 0, h: b.h, seed: rnd() * 100 });
      if (b.h > 70 && rnd() < 0.7) {
        const w2 = b.w * (0.5 + rnd() * 0.25), d2 = b.d * (0.5 + rnd() * 0.25), h2 = b.h * (0.25 + rnd() * 0.3);
        items.push({ x: b.x, z: b.z, w: w2, d: d2, y0: b.h, h: h2, seed: rnd() * 100 });
        if (rnd() < 0.5) towerTrims.push({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h });
      } else if (b.h > 110) {
        towerTrims.push({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h });
      }
      // colliders + roof surface (jump-on-able for low ones)
      world.colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
      // storefront strip + sign spots on faces toward roads
      if (!b.arcade && b.dist >= 2 && rnd() < 0.55) storefronts.push(b);
      if (b.arcade) storefronts.push(b);
      const nSigns = b.arcade ? 3 : (b.dist <= 1 ? 2 : (rnd() < 0.5 ? 1 : 0));
      for (let s = 0; s < nSigns; s++) {
        const side = (rnd() * 4) | 0;
        const sh = 6 + rnd() * Math.min(b.h - 10, 26);
        const off = (rnd() - 0.5) * 0.5;
        if (side === 0) signSpots.push({ x: b.x + b.w / 2 + 0.35, y: sh, z: b.z + off * b.d, rotY: Math.PI / 2, arcade: b.arcade });
        if (side === 1) signSpots.push({ x: b.x - b.w / 2 - 0.35, y: sh, z: b.z + off * b.d, rotY: -Math.PI / 2, arcade: b.arcade });
        if (side === 2) signSpots.push({ x: b.x + off * b.w, y: sh, z: b.z + b.d / 2 + 0.35, rotY: 0, arcade: b.arcade });
        if (side === 3) signSpots.push({ x: b.x + off * b.w, y: sh, z: b.z - b.d / 2 - 0.35, rotY: Math.PI, arcade: b.arcade });
      }
    }
    for (const s of skyline) items.push({ x: s.x, z: s.z, w: s.w, d: s.d, y0: 0, h: s.h, seed: rnd() * 100, far: true });

    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // origin at base
    const seeds = new Float32Array(items.length);
    items.forEach((it, i) => { seeds[i] = it.seed; });
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    const mat = makeBuildingMaterial(0.34, 0.95);
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const dummy = new THREE.Object3D();
    const tintA = new THREE.Color(0x232838), tintB = new THREE.Color(0x1a2030), tintC = new THREE.Color(0x262033);
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y0, it.z);
      dummy.scale.set(it.w, it.h, it.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const t = rnd();
      mesh.setColorAt(i, it.far ? new THREE.Color(0x0c0e18) : (t < 0.4 ? tintA : t < 0.8 ? tintB : tintC));
    });
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    world.raycastTargets.push(mesh);
  }

  // Tower corner trim — vertical neon edges on the downtown giants
  {
    const geo = new THREE.BoxGeometry(0.35, 1, 0.35);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, towerTrims.length * 4);
    const dummy = new THREE.Object3D();
    let i = 0;
    for (const tower of towerTrims) {
      const col = new THREE.Color(pick(rnd, [NEON.cyan, NEON.magenta, NEON.purple])).multiplyScalar(1.15);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        dummy.position.set(tower.x + sx * tower.w / 2, 0, tower.z + sz * tower.d / 2);
        dummy.scale.set(1, tower.h, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, col);
        i++;
      }
    }
    mesh.count = i;
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // Storefront glow strips at street level
  {
    const geo = new THREE.BoxGeometry(1, 0.5, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, storefronts.length * 2);
    const dummy = new THREE.Object3D();
    let i = 0;
    for (const b of storefronts) {
      const col = new THREE.Color(pick(rnd, NEON_LIST)).multiplyScalar(1.25);
      const faces = rnd() < 0.5
        ? [[b.x, b.z + b.d / 2 + 0.18, b.w * 0.9, 0.18], [b.x, b.z - b.d / 2 - 0.18, b.w * 0.9, 0.18]]
        : [[b.x + b.w / 2 + 0.18, b.z, 0.18, b.d * 0.9], [b.x - b.w / 2 - 0.18, b.z, 0.18, b.d * 0.9]];
      for (const [fx, fz, sx, sz] of faces) {
        dummy.position.set(fx, 3.3, fz);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, col);
        i++;
      }
    }
    mesh.count = i;
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // ─────────────────────── NEON SIGNS ───────────────────────
  function signCanvas(text, color, vertical, sub) {
    const w = vertical ? 96 : 384, h = vertical ? 384 : 96;
    const [c, ctx] = makeCanvas(w, h);
    ctx.fillStyle = '#05040c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hexCss(color, 0.9); ctx.lineWidth = 5;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.shadowColor = hexCss(color, 1); ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (vertical) {
      const chars = [...text];
      const step = (h - 60) / chars.length;
      ctx.font = `bold ${Math.min(54, step * 0.9)}px Orbitron, monospace`;
      chars.forEach((ch, i) => ctx.fillText(ch, w / 2, 38 + step * (i + 0.5)));
    } else {
      ctx.font = `bold ${sub ? 44 : 52}px Orbitron, monospace`;
      ctx.fillText(text, w / 2, sub ? h / 2 - 14 : h / 2);
      if (sub) {
        ctx.font = '24px Rajdhani, sans-serif';
        ctx.fillStyle = hexCss(color, 1);
        ctx.fillText(sub, w / 2, h / 2 + 26);
      }
    }
    return canvasTexture(c);
  }

  {
    const variants = [
      { text: 'ネオン', color: NEON.magenta, vertical: true },
      { text: 'RAMEN', color: NEON.amber, vertical: true },
      { text: 'HOTEL', color: NEON.cyan, vertical: true },
      { text: '拉麺横丁', color: NEON.red, vertical: true },
      { text: 'CYBER', color: NEON.purple, vertical: true },
      { text: 'オービタル', color: NEON.lime, vertical: true },
      { text: 'PRINTWIRE', color: NEON.cyan, vertical: false },
      { text: 'DMLS-3D', color: NEON.amber, vertical: false, sub: 'TITANIUM · DIRECT METAL' },
      { text: 'MAXCNC', color: NEON.magenta, vertical: false, sub: 'ROBOTIC FABRICATION' },
      { text: 'SLINGSHOT', color: NEON.blue, vertical: false, sub: 'TRANSIT AUTHORITY' },
      { text: 'ENERGY+', color: NEON.lime, vertical: false },
      { text: 'ホロ寿司', color: NEON.cyan, vertical: false },
    ];
    const spots = [...signSpots];
    // shuffle deterministically
    for (let i = spots.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0;[spots[i], spots[j]] = [spots[j], spots[i]]; }
    let cursor = 0;
    for (const v of variants) {
      const take = v.vertical ? 14 : 9;
      const mine = spots.slice(cursor, cursor + take);
      cursor += take;
      if (!mine.length) break;
      const tex = signCanvas(v.text, v.color, v.vertical, v.sub);
      const gw = v.vertical ? 2.6 : 10.5, gh = v.vertical ? 10.5 : 2.6;
      const geo = new THREE.PlaneGeometry(gw, gh);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
      const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
      const dummy = new THREE.Object3D();
      mine.forEach((s, i) => {
        dummy.position.set(s.x, Math.max(s.y, gh / 2 + 4.5), s.z);
        dummy.rotation.set(0, s.rotY, 0);
        dummy.scale.setScalar(s.arcade ? 0.62 : 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }

  // Hero billboards — big animated ads on downtown faces
  {
    const ads = [
      { main: 'OFF-WORLD', sub: 'COLONIES NOW BOARDING', color: NEON.cyan },
      { main: '新東京', sub: 'NEW CHIBA WELCOMES YOU', color: NEON.magenta },
      { main: 'PRINTWIRE', sub: '194 WORLDS · ONE NETWORK', color: NEON.amber },
      { main: 'INTERSTELLAR', sub: 'SLINGSHOT — PLAY TONIGHT', color: NEON.purple },
    ];
    const tall = buildings.filter(b => b.h > 100).sort((a, b) => b.h - a.h).slice(0, 8);
    ads.forEach((ad, k) => {
      const b = tall[k % tall.length];
      if (!b) return;
      const [c, ctx] = makeCanvas(512, 288);
      const g = ctx.createLinearGradient(0, 0, 0, 288);
      g.addColorStop(0, '#0a0518'); g.addColorStop(1, '#170a2e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 288);
      ctx.strokeStyle = hexCss(ad.color, 0.8); ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 272);
      ctx.shadowColor = hexCss(ad.color, 1); ctx.shadowBlur = 26;
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 64px Orbitron, monospace';
      ctx.fillText(ad.main, 256, 140);
      ctx.shadowBlur = 8;
      ctx.font = '30px Rajdhani, sans-serif';
      ctx.fillStyle = hexCss(ad.color, 1);
      ctx.fillText(ad.sub, 256, 198);
      const tex = canvasTexture(c);
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = world.uTime;
        shader.uniforms.uPhase = { value: k * 1.7 };
        shader.fragmentShader = 'uniform float uTime;\nuniform float uPhase;\n' + shader.fragmentShader
          .replace('#include <map_fragment>', `
            #include <map_fragment>
            float scan = 0.86 + 0.14 * step(0.5, fract(vMapUv.y * 90.0 - uTime * 7.0));
            float blink = step(0.06, fract(sin(floor(uTime * 2.0 + uPhase) * 91.7) * 43758.5));
            diffuseColor.rgb *= scan * mix(0.35, 1.0, blink) * 1.25;
          `);
      };
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 14.6), mat);
      const side = k % 4;
      const off = [[b.w / 2 + 0.6, 0, Math.PI / 2], [-b.w / 2 - 0.6, 0, -Math.PI / 2], [0, b.d / 2 + 0.6, 0], [0, -b.d / 2 - 0.6, Math.PI]][side];
      mesh.position.set(b.x + off[0], b.h * 0.62, b.z + off[1]);
      mesh.rotation.y = off[2];
      scene.add(mesh);
    });
  }

  // ─────────────────────── STREET LIGHTS ───────────────────────
  {
    const positions = [];
    for (let i = 1; i < C.GRID; i++) {
      const p = -H + i * C.CELL - C.ROAD / 2;
      for (let s = -H + C.CELL / 2; s < H; s += C.CELL) {
        positions.push({ x: p - C.ROAD / 2 + 0.8, z: s, rot: Math.PI / 2 });
        positions.push({ x: p + C.ROAD / 2 - 0.8, z: s + C.CELL / 2, rot: -Math.PI / 2 });
        positions.push({ x: s, z: p - C.ROAD / 2 + 0.8, rot: 0 });
        positions.push({ x: s + C.CELL / 2, z: p + C.ROAD / 2 - 0.8, rot: Math.PI });
      }
    }
    // pole + arm merged via simple group instancing (two instanced meshes share transforms)
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 9, 6);
    poleGeo.translate(0, 4.5, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x202433, roughness: 0.6, metalness: 0.5 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, positions.length);
    const headGeo = new THREE.BoxGeometry(0.7, 0.22, 2.6);
    headGeo.translate(0, 9, 1.1);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xd8ecff, toneMapped: false });
    const heads = new THREE.InstancedMesh(headGeo, headMat, positions.length);
    const dummy = new THREE.Object3D();
    const glowPts = [];
    positions.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      heads.setMatrixAt(i, dummy.matrix);
      const hx = p.x + Math.sin(p.rot) * 1.1, hz = p.z + Math.cos(p.rot) * 1.1;
      glowPts.push(hx, 9.05, hz);
      world.colliders.push({ minX: p.x - 0.3, maxX: p.x + 0.3, minZ: p.z - 0.3, maxZ: p.z + 0.3 });
    });
    poles.frustumCulled = heads.frustumCulled = false;
    scene.add(poles, heads);

    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(glowPts), 3));
    const glow = new THREE.Points(gGeo, new THREE.PointsMaterial({
      map: glowTexture(64, 'rgba(190,230,255,1)'), color: 0xbde4ff,
      size: 3.6, transparent: true, opacity: 0.85, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    glow.frustumCulled = false;
    scene.add(glow);

    // light pools on the asphalt
    const poolGeo = new THREE.PlaneGeometry(10, 10);
    const poolMat = new THREE.MeshBasicMaterial({
      map: glowTexture(64, 'rgba(150,200,255,0.5)'), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
    });
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, positions.length);
    positions.forEach((p, i) => {
      const hx = p.x + Math.sin(p.rot) * 1.1, hz = p.z + Math.cos(p.rot) * 1.1;
      dummy.position.set(hx, 0.04, hz);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      pools.setMatrixAt(i, dummy.matrix);
    });
    pools.frustumCulled = false;
    pools.renderOrder = 2;
    scene.add(pools);
  }

  // ─────────────────────── THE SPIRE (center landmark) ───────────────────────
  const spireBase = { x: 0, z: 0 };
  {
    const cx = 0, cz = 0;
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1f2a45, roughness: 0.22, metalness: 0.65, envMapIntensity: 1.1, emissive: 0x0d2c3f, emissiveIntensity: 0.85 });
    const tiers = [[30, 64], [24, 110], [17, 152], [10, 188]];
    for (const [w, top] of tiers) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, top, w), mat);
      m.position.set(cx, top / 2, cz);
      grp.add(m);
      world.raycastTargets.push(m);
    }
    // crown spike + beacon
    const spike = new THREE.Mesh(new THREE.ConeGeometry(2.2, 36, 6), mat);
    spike.position.set(cx, 188 + 18, cz);
    grp.add(spike);
    const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.magenta).multiplyScalar(1.6), toneMapped: false });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), beaconMat);
    beacon.position.set(cx, 207, cz);
    grp.add(beacon);
    world.updateFns.push((dt, t) => {
      const s = 0.75 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.4));
      beacon.scale.setScalar(s);
    });
    // vertical edge glows
    const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(1.05), toneMapped: false });
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.34, 188, 0.34), edgeMat);
      e.position.set(cx + sx * 15.2, 94, cz + sz * 15.2);
      grp.add(e);
    }
    // LED ticker band wrapping the tower
    {
      const [c, ctx] = makeCanvas(2048, 64);
      const headlines = [
        'VULCAN FLAGSHIP DOWN — BLACK-HOLE TRANSIT NETWORK REOPENS  ◇  ',
        'BORG SIGNALS AT GALACTIC RIM — ADVISORY LEVEL 3  ◇  ',
        'EIGHT GALAXIES TRADE ACCORD SIGNED AT SPIRE SUMMIT  ◇  ',
        'ACID RAIN UNTIL 04:00 — DRONES GROUNDED BELOW LANE 2  ◇  ',
      ];
      ctx.fillStyle = '#040209'; ctx.fillRect(0, 0, 2048, 64);
      ctx.font = 'bold 40px "Share Tech Mono", monospace';
      ctx.fillStyle = '#ff9d2b';
      ctx.shadowColor = '#ff9d2b'; ctx.shadowBlur = 12;
      ctx.fillText(headlines.join(''), 8, 45);
      const tex = canvasTexture(c, { repeat: [2.4, 1] });
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(15.8, 15.8, 3.4, 24, 1, true),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide })
      );
      band.position.set(cx, 58, cz);
      grp.add(band);
      world.updateFns.push((dt) => { tex.offset.x += dt * 0.045; });
    }
    scene.add(grp);
    world.colliders.push({ minX: cx - 15, maxX: cx + 15, minZ: cz - 15, maxZ: cz + 15 });

    // ── Observation deck at 110 (atop tier 2) ──
    const deckY = 110.6;
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(21, 23, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x232940, roughness: 0.4, metalness: 0.55 })
    );
    deck.position.set(cx, deckY - 0.6, cz);
    scene.add(deck);
    world.raycastTargets.push(deck);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(20.6, 0.1, 6, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(0.85), toneMapped: false })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(cx, deckY + 1.15, cz);
    scene.add(rim);
    // railing colliders (octagon approximated by 4 walls just inside radius 20)
    const R = 19.6;
    world.colliders.push(
      { minX: cx - R - 0.4, maxX: cx + R + 0.4, minZ: cz - R - 0.4, maxZ: cz - R + 0.1, minY: deckY - 1, maxY: deckY + 2.4 },
      { minX: cx - R - 0.4, maxX: cx + R + 0.4, minZ: cz + R - 0.1, maxZ: cz + R + 0.4, minY: deckY - 1, maxY: deckY + 2.4 },
      { minX: cx - R - 0.4, maxX: cx - R + 0.1, minZ: cz - R, maxZ: cz + R, minY: deckY - 1, maxY: deckY + 2.4 },
      { minX: cx + R - 0.1, maxX: cx + R + 0.4, minZ: cz - R, maxZ: cz + R, minY: deckY - 1, maxY: deckY + 2.4 },
    );
    world.surfaces.push({ minX: cx - 20.6, maxX: cx + 20.6, minZ: cz - 20.6, maxZ: cz + 20.6, y: deckY });

    // ── Glass elevator on south face ──
    const ELEV = { bottom: 0.6, top: deckY, y: 0.6, state: 'down', t: 0, speed: 14 };
    world.elevator = ELEV;
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x66f2ff, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.5,
      emissive: 0x0aa7c4, emissiveIntensity: 0.7,
    });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.3, 10), padMat);
    pad.position.set(cx, ELEV.y, cz + 19.5);
    scene.add(pad);
    const shaftMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(0.8), toneMapped: false, transparent: true, opacity: 0.35 });
    for (const dxz of [-2.9, 2.9]) {
      const rail1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, deckY + 2, 0.22), shaftMat);
      rail1.position.set(cx + dxz, (deckY + 2) / 2, cz + 19.5 + 2.4);
      scene.add(rail1);
      const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, deckY + 2, 0.22), shaftMat);
      rail2.position.set(cx + dxz, (deckY + 2) / 2, cz + 19.5 - 2.4);
      scene.add(rail2);
    }
    const padSurface = { minX: cx - 2.5, maxX: cx + 2.5, minZ: cz + 17.1, maxZ: cz + 21.9, y: () => ELEV.y + 0.18 };
    world.surfaces.push(padSurface);
    world.updateFns.push((dt) => {
      if (ELEV.state === 'up') {
        ELEV.y = Math.min(ELEV.top, ELEV.y + ELEV.speed * dt);
        if (ELEV.y >= ELEV.top) ELEV.state = 'topIdle';
      } else if (ELEV.state === 'downGo') {
        ELEV.y = Math.max(ELEV.bottom, ELEV.y - ELEV.speed * dt);
        if (ELEV.y <= ELEV.bottom) ELEV.state = 'down';
      }
      pad.position.y = ELEV.y;
    });
    world.interactables.push({
      label: () => (ELEV.state === 'down' ? 'RIDE SPIRE ELEVATOR ▲' : ELEV.state === 'topIdle' ? 'DESCEND ELEVATOR ▼' : null),
      pos: pad.position, radius: 4.2,
      action: () => {
        if (ELEV.state === 'down') ELEV.state = 'up';
        else if (ELEV.state === 'topIdle') ELEV.state = 'downGo';
      },
    });

    // Plaza dressing: holo-planet fountain
    const holoMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(NEON.cyan).multiplyScalar(1.5), wireframe: true,
      transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 1), holoMat);
    holo.position.set(cx + 0, 16, cz - 26);
    scene.add(holo);
    const holoRing = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.12, 6, 40), holoMat.clone());
    holoRing.position.copy(holo.position);
    holoRing.rotation.x = Math.PI / 2.4;
    scene.add(holoRing);
    const coneMat = new THREE.MeshBasicMaterial({
      color: NEON.cyan, transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7.5, 14, 24, 1, true), coneMat);
    cone.position.set(holo.position.x, 8, holo.position.z);
    scene.add(cone);
    const fount = new THREE.Mesh(
      new THREE.CylinderGeometry(9.5, 10.5, 1.1, 24),
      new THREE.MeshStandardMaterial({ color: 0x222a3e, roughness: 0.3, metalness: 0.6, emissive: 0x0a4a5e, emissiveIntensity: 0.6 })
    );
    fount.position.set(holo.position.x, 0.55, holo.position.z);
    scene.add(fount);
    world.colliders.push({ minX: holo.position.x - 10, maxX: holo.position.x + 10, minZ: holo.position.z - 10, maxZ: holo.position.z + 10 });
    world.updateFns.push((dt, t) => {
      holo.rotation.y += dt * 0.5;
      holoRing.rotation.z += dt * 0.3;
      holo.position.y = 16 + Math.sin(t * 0.8) * 1.2;
    });

    world.pois.push(
      { name: 'KESSLER PLAZA', pos: new THREE.Vector3(cx, 1, cz - 26), desc: 'Holo-fountain & Spire forecourt' },
      { name: 'SPIRE OBSERVATION DECK', pos: new THREE.Vector3(cx, deckY, cz + 19.5), desc: 'Elevator on the south face', elevated: true },
    );
  }

  // ─────────────────────── GAGARIN SPACEPORT ───────────────────────
  const SP = { x0: H + 6, x1: H + 268, z0: -158, z1: 158 };
  world.spaceport = SP;
  {
    // Apron
    const [c, ctx] = makeCanvas(256, 256);
    ctx.fillStyle = '#0d0e14'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${18 + rnd() * 22 | 0},${18 + rnd() * 22 | 0},${26 + rnd() * 26 | 0},0.5)`;
      ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
    ctx.strokeStyle = 'rgba(255,179,0,0.55)'; ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(20, 20, 216, 216);
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(SP.x1 - SP.x0, SP.z1 - SP.z0),
      new THREE.MeshStandardMaterial({ map: canvasTexture(c, { repeat: [5, 6] }), roughness: 0.22, metalness: 0.8, color: 0xaab0c8, envMapIntensity: 1.1 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set((SP.x0 + SP.x1) / 2, 0.005, 0);
    scene.add(apron);
    world.raycastTargets.push(apron);

    // Landing pads
    world.pads = [];
    const padDefs = [
      { x: SP.x0 + 52, z: -92, r: 17, big: true }, { x: SP.x0 + 52, z: 92, r: 17, big: true },
      { x: SP.x0 + 48, z: -32, r: 12 }, { x: SP.x0 + 48, z: 32, r: 12 },
      { x: SP.x0 + 116, z: -62, r: 12 }, { x: SP.x0 + 116, z: 62, r: 12 },
    ];
    const padGeo = new THREE.CylinderGeometry(1, 1, 0.5, 28);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x1a1e2c, roughness: 0.35, metalness: 0.7 });
    const padMesh = new THREE.InstancedMesh(padGeo, padMat, padDefs.length);
    const dummy = new THREE.Object3D();
    padDefs.forEach((p, i) => {
      dummy.position.set(p.x, 0.25, p.z);
      dummy.scale.set(p.r, 1, p.r);
      dummy.updateMatrix();
      padMesh.setMatrixAt(i, dummy.matrix);
      world.pads.push({ x: p.x, z: p.z, r: p.r, big: !!p.big });
    });
    padMesh.frustumCulled = false;
    scene.add(padMesh);
    // pad edge lights — pulsing ring of studs
    const studGeo = new THREE.BoxGeometry(0.55, 0.3, 0.55);
    const studMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const studs = new THREE.InstancedMesh(studGeo, studMat, padDefs.length * 18);
    let si = 0;
    const studCol = new THREE.Color();
    padDefs.forEach((p, pi) => {
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        dummy.position.set(p.x + Math.cos(a) * p.r * 0.94, 0.55, p.z + Math.sin(a) * p.r * 0.94);
        dummy.scale.setScalar(1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        studs.setMatrixAt(si, dummy.matrix);
        studs.setColorAt(si, studCol.setHex(p.big ? NEON.amber : NEON.cyan).multiplyScalar(2));
        si++;
      }
    });
    studs.instanceColor.needsUpdate = true;
    studs.frustumCulled = false;
    scene.add(studs);
    world.updateFns.push((dt, t) => {
      const k = 1.1 + Math.sin(t * 2.6) * 0.9;
      studMat.color.setScalar(k);
    });

    // Control tower
    const tx = SP.x0 + 150, tz = 0;
    const tower = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 6, 46, 10),
      new THREE.MeshStandardMaterial({ color: 0x1d2235, roughness: 0.4, metalness: 0.6 }));
    shaft.position.set(tx, 23, tz);
    tower.add(shaft);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(9, 7, 7, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a3148, roughness: 0.2, metalness: 0.5, emissive: 0x1a4a5a, emissiveIntensity: 0.8 }));
    cab.position.set(tx, 49, tz);
    tower.add(cab);
    const dishPivot = new THREE.Group();
    dishPivot.position.set(tx, 55, tz);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 3.4, 1.6, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x39415e, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }));
    dish.rotation.z = Math.PI / 2.4;
    dish.position.x = 1.4;
    dishPivot.add(dish);
    tower.add(dishPivot);
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.red).multiplyScalar(3), toneMapped: false }));
    strobe.position.set(tx, 57.5, tz);
    tower.add(strobe);
    scene.add(tower);
    world.colliders.push({ minX: tx - 6, maxX: tx + 6, minZ: tz - 6, maxZ: tz + 6 });
    world.updateFns.push((dt, t) => {
      dishPivot.rotation.y += dt * 0.9;
      strobe.visible = (t % 1.4) < 0.12;
    });

    // Searchlight beams sweeping the sky
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x9fdcff, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    for (let b = 0; b < 2; b++) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 230, 14, 1, true), beamMat);
      beam.geometry.translate(0, 115, 0);
      const pivot = new THREE.Group();
      pivot.position.set(tx + (b ? 18 : -18), 4, tz + (b ? -30 : 30));
      pivot.add(beam);
      scene.add(pivot);
      const ph = b * 2.1;
      world.updateFns.push((dt, t) => {
        pivot.rotation.z = Math.sin(t * 0.21 + ph) * 0.42;
        pivot.rotation.x = Math.cos(t * 0.17 + ph) * 0.42;
      });
    }

    // Hangars
    const hangarMat = new THREE.MeshStandardMaterial({ color: 0x2a3146, roughness: 0.45, metalness: 0.55, emissive: 0x0a1422, emissiveIntensity: 0.6 });
    const doorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.amber).multiplyScalar(1.4), toneMapped: false });
    for (let hgi = 0; hgi < 3; hgi++) {
      const hx = SP.x0 + 210, hz = -86 + hgi * 86;
      const box = new THREE.Mesh(new THREE.BoxGeometry(46, 18, 34), hangarMat);
      box.position.set(hx, 9, hz);
      scene.add(box);
      world.raycastTargets.push(box);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 46, 14, 1, false, 0, Math.PI), hangarMat);
      roof.rotation.z = Math.PI / 2;
      roof.position.set(hx, 18, hz);
      scene.add(roof);
      const doorStrip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 14, 30), doorMat);
      doorStrip.position.set(hx - 23.2, 8, hz);
      scene.add(doorStrip);
      world.colliders.push({ minX: hx - 23, maxX: hx + 23, minZ: hz - 17, maxZ: hz + 17 });
    }

    // Terminal connecting to the city
    const termX = SP.x0 + 9, termZ = 0;
    const term = new THREE.Mesh(new THREE.BoxGeometry(16, 12, 74),
      new THREE.MeshStandardMaterial({ color: 0x1b2136, roughness: 0.3, metalness: 0.5, emissive: 0x123a4a, emissiveIntensity: 0.7 }));
    term.position.set(termX, 6, termZ);
    scene.add(term);
    world.raycastTargets.push(term);
    world.colliders.push({ minX: termX - 8, maxX: termX + 8, minZ: termZ - 37, maxZ: termZ + 37 });
    const termSign = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 4.6),
      new THREE.MeshBasicMaterial({ map: signCanvas('GAGARIN ◇ SPACEPORT', NEON.amber, false) })
    );
    termSign.position.set(termX - 8.2, 14.6, termZ);
    termSign.rotation.y = -Math.PI / 2;
    scene.add(termSign);

    world.pois.push({ name: 'GAGARIN SPACEPORT', pos: new THREE.Vector3(SP.x0 + 30, 1, 0), desc: 'Orbital shuttles & atmospheric craft' });

    // perimeter walls (keep player on apron, gap to the city on the west)
    addBox(SP.x0 - 2, SP.x1, SP.z0 - 2, SP.z0);
    addBox(SP.x0 - 2, SP.x1, SP.z1, SP.z1 + 2);
    addBox(SP.x1, SP.x1 + 2, SP.z0, SP.z1);
  }

  // City boundary walls — east side leaves a gate to the spaceport
  addBox(-H - 2, -H, -H, H);
  addBox(-H, H, -H - 2, -H);
  addBox(-H, H, H, H + 2);
  addBox(H, H + 2, -H, SP.z0);
  addBox(H, H + 2, SP.z1, H);

  // ─────────────────────── ARCADE ALLEY + steam ───────────────────────
  {
    const z = H - C.CELL / 2 - C.ROAD / 2;
    world.pois.push({ name: 'ARCADE ALLEY', pos: new THREE.Vector3(0, 1, H - C.CELL - 4), desc: 'Noodle stalls & pachinko glow' });
    const steamTex = glowTexture(64, 'rgba(200,210,235,0.55)');
    world.steam = [];
    for (let i = 0; i < 8; i++) {
      const sx = -200 + rnd() * 400;
      const sz = (i < 5) ? (H - C.CELL - C.ROAD / 2 - 2) : (-H + (1 + (rnd() * 8 | 0)) * C.CELL - C.ROAD / 2);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: steamTex, transparent: true, opacity: 0.0, depthWrite: false, color: 0xb9c2dd,
      }));
      spr.position.set(sx, 1.5, sz);
      spr.scale.set(3, 4.5, 1);
      scene.add(spr);
      const phase = rnd() * 10;
      world.updateFns.push((dt, t) => {
        const k = (t * 0.35 + phase) % 1;
        spr.position.y = 1 + k * 7;
        spr.material.opacity = 0.34 * Math.sin(k * Math.PI);
        spr.scale.set(2.5 + k * 4, 3.5 + k * 5, 1);
      });
    }
  }

  // Vending machines / glow boxes in arcade district
  {
    const geo = new THREE.BoxGeometry(1.6, 2.4, 1.2);
    geo.translate(0, 1.2, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x10141f, roughness: 0.4, metalness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.0 });
    // emissive via instanced face glow strip instead (simpler): front panel
    const panelGeo = new THREE.PlaneGeometry(1.2, 1.9);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const N = 26;
    const boxes = new THREE.InstancedMesh(geo, mat, N);
    const panels = new THREE.InstancedMesh(panelGeo, panelMat, N);
    const dummy = new THREE.Object3D();
    const colr = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const bx = ((rnd() * C.GRID) | 0), bz = (rnd() < 0.5 ? C.GRID - 1 : (rnd() * C.GRID) | 0);
      const x0 = -H + bx * C.CELL + C.ROAD / 2, z0 = -H + bz * C.CELL + C.ROAD / 2;
      const x = x0 + 2 + rnd() * (C.BLOCK - 4), z = z0 - 1.1;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, Math.PI, 0);
      dummy.updateMatrix();
      boxes.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 1.35, z - 0.62);
      dummy.updateMatrix();
      panels.setMatrixAt(i, dummy.matrix);
      panels.setColorAt(i, colr.setHex(pick(rnd, NEON_LIST)).multiplyScalar(1.5));
      world.colliders.push({ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.7, maxZ: z + 0.7 });
    }
    panels.instanceColor.needsUpdate = true;
    boxes.frustumCulled = panels.frustumCulled = false;
    scene.add(boxes, panels);
  }

  return world;
}
