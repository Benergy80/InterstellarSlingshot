// ════════════════════════════════════════════════════════════════
// NEW CHICAGO — landmarks & lakefront
// Lake Michigan (animated water, esplanade, beach), Neon Pier with
// a working Ferris wheel, marina + boats, Soldier Field 2287, a
// container port with cranes, Grant Park, lakefront suburb homes,
// Holy Name Cathedral (gothic), City Hall, the Yards fusion plant,
// rooftop water towers, The Bean, statues, telecom lattice towers.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { C, NEON, NEON_LIST, mulberry32, pick, clamp, makeCanvas, canvasTexture, glowTexture, hexCss, humanoidGeo } from './config.js';

export function buildLandmarks(scene, world) {
  const rnd = mulberry32(C.SEED + 1871);   // Great Fire remix
  const treeSpots = [];
  const H = C.HALF;
  const dummy = new THREE.Object3D();
  const solid = (c, r = 0.45, m = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const glow = (c, k = 1.1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
  const addCol = (minX, maxX, minZ, maxZ, minY, maxY) => world.colliders.push(
    maxY === undefined ? { minX, maxX, minZ, maxZ } : { minX, maxX, minZ, maxZ, minY, maxY });

  // ════════════════ LAKE MICHIGAN ════════════════
  const SHORE = -H - 26;          // esplanade edge; water beyond
  {
    // water — big plane with gentle shader swell, env-reflective
    const wmat = new THREE.MeshStandardMaterial({
      color: 0x0c1626, roughness: 0.08, metalness: 0.92, envMapIntensity: 1.6,
    });
    wmat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = world.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        transformed.z += sin(position.x * 0.04 + uTime * 0.8) * 0.35
                       + cos(position.y * 0.055 + uTime * 0.6) * 0.3;
      `);
    };
    const water = new THREE.Mesh(new THREE.PlaneGeometry(900, C.SPAN + 700, 96, 96), wmat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(SHORE - 450, -0.5, 0);
    scene.add(water);
    world.raycastTargets.push(water);

    // esplanade strip with glowing rail + lamps; beach at the north end
    const esp = new THREE.Mesh(
      new THREE.BoxGeometry(26, 0.7, C.SPAN),
      solid(0x232a3c, 0.5, 0.45)
    );
    esp.position.set(-H - 13, -0.35, 0);
    scene.add(esp);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, C.SPAN), glow(NEON.cyan, 0.8));
    rail.position.set(SHORE + 0.4, 1.1, 0);
    scene.add(rail);
    // shoreline guard (gaps at the pier and the south land mass)
    addCol(SHORE - 0.4, SHORE + 0.1, -H, -52, -1, 2.4);
    addCol(SHORE - 0.4, SHORE + 0.1, -24, 150, -1, 2.4);
    // beach — pale sand wedge north
    const beach = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 150), solid(0x59513e, 0.9, 0.05));
    beach.position.set(-H - 15, -0.42, -H + 95);
    scene.add(beach);
    world.pois.push({ name: 'NORTH AVE BEACH', pos: new THREE.Vector3(-H - 10, 0, -H + 100), desc: 'Lake Michigan sands' });

    // palms→trees along the esplanade
    treeRow(-H - 6, -H + 30, H - 30, 14, 'z');
  }

  // ════════════════ NEON PIER (Navy Pier remix) + FERRIS WHEEL ════════════════
  {
    const pz = -38, pierLen = 86, deckW = 14;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(pierLen, 1.0, deckW), solid(0x2a3145, 0.5, 0.5));
    deck.position.set(SHORE - pierLen / 2 + 2, -0.2, pz);
    scene.add(deck);
    world.surfaces.push({ minX: SHORE - pierLen + 2, maxX: SHORE + 2, minZ: pz - deckW / 2, maxZ: pz + deckW / 2, y: 0.3 });
    // side rails
    for (const e of [-1, 1]) {
      addCol(SHORE - pierLen + 2, SHORE + 2, pz + e * (deckW / 2) - 0.2, pz + e * (deckW / 2) + 0.2, -1, 2.2);
      const r = new THREE.Mesh(new THREE.BoxGeometry(pierLen, 0.1, 0.14), glow(NEON.magenta, 0.85));
      r.position.set(SHORE - pierLen / 2 + 2, 1.35, pz + e * (deckW / 2 - 0.1));
      scene.add(r);
    }
    addCol(SHORE - pierLen + 1.6, SHORE - pierLen + 2.2, pz - deckW / 2, pz + deckW / 2, -1, 2.2); // end rail
    // pylons
    for (let k = 0; k < 6; k++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 4, 6), solid(0x1a2030));
      p.position.set(SHORE - 8 - k * 14, -2, pz + (k % 2 ? 5 : -5));
      scene.add(p);
    }
    // Ferris wheel at the pier end
    const wx = SHORE - pierLen + 10, wy = 16, wr = 13;
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(wr, 0.3, 8, 36), solid(0x232c44, 0.4, 0.7));
    wheel.add(rim);
    const rimGlow = new THREE.Mesh(new THREE.TorusGeometry(wr, 0.1, 6, 36), glow(NEON.magenta, 1.0));
    wheel.add(rimGlow);
    for (let k = 0; k < 8; k++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, wr * 2, 5), solid(0x39415e));
      sp.rotation.z = (k / 8) * Math.PI;
      wheel.add(sp);
    }
    const cabins = [];
    const cabGeo = new THREE.BoxGeometry(1.7, 1.5, 1.4);
    for (let k = 0; k < 10; k++) {
      const cab = new THREE.Mesh(cabGeo, solid(0x141a2c, 0.4, 0.5));
      const lit = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 1.45), glow(pick(rnd, NEON_LIST), 1.1));
      cab.add(lit);
      scene.add(cab);
      cabins.push({ cab, a0: (k / 10) * Math.PI * 2 });
    }
    wheel.position.set(wx, wy, pz);
    wheel.rotation.y = Math.PI / 2;
    scene.add(wheel);
    for (const e of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, wy + 1, 6), solid(0x1a2030));
      leg.position.set(wx, wy / 2, pz + e * 4);
      leg.rotation.x = e * 0.22;
      scene.add(leg);
    }
    addCol(wx - 2, wx + 2, pz - 4.5, pz + 4.5, 0, 4);
    world.updateFns.push((dt, t) => {
      wheel.rotation.x += dt * 0.12;
      for (const c of cabins) {
        const a = c.a0 + wheel.rotation.x;
        c.cab.position.set(wx, wy - Math.cos(a) * wr, pz + Math.sin(a) * wr);
      }
    });
    world.pois.push({ name: 'NEON PIER', pos: new THREE.Vector3(SHORE - 30, 0.4, pz), desc: 'Ferris wheel over Lake Michigan' });

    // marina — moored boats bobbing + one night cruiser
    const mkBoat = (len) => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, len * 0.32), solid(0x1c2438, 0.4, 0.5));
      hull.scale.y = 0.8;
      g.add(hull);
      const cabB = new THREE.Mesh(new THREE.BoxGeometry(len * 0.4, 0.9, len * 0.24), solid(0x2a3148, 0.35, 0.5));
      cabB.position.set(-len * 0.1, 0.9, 0);
      g.add(cabB);
      const nav = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), glow(0x7dffc8, 1.4));
      nav.position.set(len / 2 - 0.2, 0.9, 0);
      g.add(nav);
      scene.add(g);
      return g;
    };
    const moored = [];
    for (let k = 0; k < 4; k++) {
      const b = mkBoat(6 + rnd() * 4);
      b.position.set(SHORE - 7 - rnd() * 9, -0.2, pz + 12 + k * 9);
      b.rotation.y = rnd() * 0.7;
      moored.push({ g: b, ph: rnd() * 9 });
    }
    const cruiser = mkBoat(13);
    world.updateFns.push((dt, t) => {
      for (const m of moored) {
        m.g.position.y = -0.2 + Math.sin(t * 0.8 + m.ph) * 0.12;
        m.g.rotation.z = Math.sin(t * 0.6 + m.ph) * 0.025;
      }
      const a = t * 0.05;
      cruiser.position.set(SHORE - 130 + Math.cos(a) * 70, -0.15 + Math.sin(t) * 0.1, 40 + Math.sin(a) * 160);
      cruiser.rotation.y = -a + Math.PI / 2;
    });
  }

  // ════════════════ SOUTH LAND: SOLDIER FIELD 2287 + CONTAINER PORT ════════════════
  {
    const apron = new THREE.Mesh(new THREE.BoxGeometry(120, 0.7, 210), solid(0x1c2230, 0.55, 0.4));
    apron.position.set(SHORE - 60 + 26, -0.35, 255);
    scene.add(apron);
    world.surfaces.push({ minX: SHORE - 94, maxX: SHORE + 26, minZ: 150, maxZ: 360, y: 0 });
    // perimeter rails (water sides)
    addCol(SHORE - 94.4, SHORE - 94, 150, 360, -1, 2.2);
    addCol(SHORE - 94, SHORE + 26, 359.6, 360.4, -1, 2.2);
    addCol(SHORE - 94, SHORE + 26, 149.6, 150.2, -1, 2.2);

    // stadium bowl — SOLDIER FIELD 2287
    const sx = SHORE - 52, sz = 198;
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(34, 40, 16, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x252e48, roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide })
    );
    bowl.position.set(sx, 8, sz);
    bowl.scale.z = 0.78;
    scene.add(bowl);
    world.raycastTargets.push(bowl);
    const fieldGlow = new THREE.Mesh(new THREE.CircleGeometry(26, 24), glow(0x2eff7b, 0.32));
    fieldGlow.rotation.x = -Math.PI / 2;
    fieldGlow.position.set(sx, 0.4, sz);
    fieldGlow.scale.z = 0.78;
    scene.add(fieldGlow);
    const colonnade = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.8, 0.8, 14, 6), solid(0x39415e, 0.5, 0.4), 14);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      dummy.position.set(sx + Math.cos(a) * 43, 7, sz + Math.sin(a) * 33.5);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
      dummy.updateMatrix();
      colonnade.setMatrixAt(k, dummy.matrix);
    }
    colonnade.frustumCulled = false;
    scene.add(colonnade);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.5;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 26, 6), solid(0x1a2030));
      mast.position.set(sx + Math.cos(a) * 38, 13, sz + Math.sin(a) * 29);
      scene.add(mast);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.6, 0.5), glow(0xeaf2ff, 1.25));
      lamp.position.set(mast.position.x, 26.5, mast.position.z);
      lamp.lookAt(sx, 4, sz);
      scene.add(lamp);
    }
    addCol(sx - 41, sx + 41, sz - 33, sz + 33, 0, 17);
    world.pois.push({ name: 'SOLDIER FIELD 2287', pos: new THREE.Vector3(sx + 44, 0, sz), desc: 'Da Bears, orbital division' });

    // container port — gantry cranes + stacked containers + dock lights
    const px0 = SHORE - 60, pz0 = 300;
    const boxGeo = new THREE.BoxGeometry(6, 2.6, 2.4);
    const stacks = new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.35 }), 90);
    const ccol = new THREE.Color();
    const palette = [0xb33939, 0x227093, 0xcc8e35, 0x218c74, 0x474787];
    let ci = 0;
    for (let gx = 0; gx < 6; gx++) for (let gz = 0; gz < 5; gz++) {
      const hgt = 1 + ((rnd() * 3) | 0);
      for (let k = 0; k < hgt && ci < 90; k++) {
        dummy.position.set(px0 - 12 + gx * 7.5, 1.3 + k * 2.7, pz0 + gz * 5.4);
        dummy.rotation.set(0, (rnd() - 0.5) * 0.06, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        stacks.setMatrixAt(ci, dummy.matrix);
        stacks.setColorAt(ci, ccol.setHex(pick(rnd, palette)).multiplyScalar(0.7));
        ci++;
      }
      addCol(px0 - 12 + gx * 7.5 - 3.2, px0 - 12 + gx * 7.5 + 3.2, pz0 + gz * 5.4 - 1.4, pz0 + gz * 5.4 + 1.4, 0, 9);
    }
    stacks.count = ci;
    stacks.instanceColor.needsUpdate = true;
    stacks.frustumCulled = false;
    scene.add(stacks);
    for (let k = 0; k < 2; k++) {
      const cr = new THREE.Group();
      const legGeo = new THREE.BoxGeometry(1, 22, 1);
      for (const ex of [-9, 9]) for (const ez of [-3.5, 3.5]) {
        const leg = new THREE.Mesh(legGeo, solid(0x39415e, 0.5, 0.5));
        leg.position.set(ex, 11, ez);
        cr.add(leg);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(34, 1.4, 2), solid(0x39415e, 0.5, 0.5));
      beam.position.set(-4, 22, 0);
      cr.add(beam);
      const cabLight = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.4), glow(NEON.amber, 1.2));
      cabLight.position.set(-16, 21, 0);
      cr.add(cabLight);
      cr.position.set(px0 + 2, 0, pz0 + 10 + k * 26);
      scene.add(cr);
      addCol(cr.position.x - 10, cr.position.x + 10, cr.position.z - 4.2, cr.position.z + 4.2, 0, 23);
    }
    world.pois.push({ name: 'CALUMET DOCKS', pos: new THREE.Vector3(px0 + 24, 0, pz0 + 14), desc: 'Container port & gantry cranes' });
  }

  // ════════════════ THE BEAN (Cloud Gate remix) + statues ════════════════
  {
    const bean = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 28, 20),
      new THREE.MeshStandardMaterial({ color: 0xe8eef8, roughness: 0.04, metalness: 1.0, envMapIntensity: 1.7 })
    );
    bean.scale.set(1.35, 0.62, 0.8);
    bean.position.set(17, 3.4, -26);
    scene.add(bean);
    world.raycastTargets.push(bean);
    addCol(10.4, 23.6, -29.6, -22.4, 0, 7);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 8, 0.5, 20), solid(0x2a3145, 0.4, 0.6));
    plinth.position.set(17, 0.25, -26);
    scene.add(plinth);
    world.pois.push({ name: 'THE BEAN', pos: new THREE.Vector3(17, 1, -20), desc: 'Cloud Gate 2287 — see yourself in neon' });

    const statue = (x, z, name) => {
      const g = new THREE.Group();
      const ped = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4), solid(0x2c3450, 0.5, 0.5));
      ped.position.y = 1.1;
      g.add(ped);
      const fig = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.7, 4, 8), solid(0x171d2e, 0.35, 0.8));
      fig.position.y = 3.6;
      g.add(fig);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), solid(0x171d2e, 0.35, 0.8));
      head.position.y = 4.9;
      g.add(head);
      const up = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(64, 'rgba(160,220,255,0.7)'), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
      up.scale.set(4, 6, 1);
      up.position.y = 3.4;
      g.add(up);
      g.position.set(x, 0, z);
      scene.add(g);
      addCol(x - 1.4, x + 1.4, z - 1.4, z + 1.4, 0, 6);
    };
    statue(-17, -26, 'founder');
  }

  // ════════════════ RESERVED BLOCKS ════════════════
  const res = world.reserved || {};

  // ── GRANT PARK: lawn, paths, trees, pond ──
  for (const blk of res.park || []) {
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(C.BLOCK, 0.3, C.BLOCK), solid(0x14301f, 0.85, 0.05));
    lawn.position.set(blk.cx, -0.15, blk.cz);
    scene.add(lawn);
    const path = new THREE.Mesh(new THREE.BoxGeometry(C.BLOCK, 0.06, 3), solid(0x2a3142, 0.7, 0.2));
    path.position.set(blk.cx, 0.06, blk.cz);
    scene.add(path);
    const path2 = path.clone();
    path2.rotation.y = Math.PI / 2;
    scene.add(path2);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(9, 20),
      new THREE.MeshStandardMaterial({ color: 0x0e1b30, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.5 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(blk.cx + 16, 0.05, blk.cz + 14);
    scene.add(pond);
    scatterTrees(blk.x0 + 4, blk.z0 + 4, C.BLOCK - 8, C.BLOCK - 8, 26, [blk.cx, blk.cz, 4]);
    world.pois.push({ name: 'GRANT PARK', pos: new THREE.Vector3(blk.cx, 0.5, blk.cz), desc: 'Green heart of New Chicago' });
  }

  // ── SUBURB ROW: little homes, yards, trees ──
  {
    const homeGeo = (() => {
      const base = new THREE.BoxGeometry(5.2, 3, 6.2);
      base.translate(0, 1.5, 0);
      const roof = new THREE.CylinderGeometry(2.9, 2.9, 5.4, 3, 1);
      roof.rotateZ(Math.PI / 2);
      roof.rotateY(Math.PI / 2);
      roof.scale(1, 0.62, 1.05);
      roof.translate(0, 3.9, 0);
      return BufferGeometryUtils.mergeGeometries([base, roof]);
    })();
    const homes = new THREE.InstancedMesh(homeGeo, solid(0x2c3142, 0.6, 0.3), 36);
    const winGeo = new THREE.PlaneGeometry(1.1, 0.9);
    const wins = new THREE.InstancedMesh(winGeo, glow(0xffc66b, 0.85), 36);
    let hi = 0;
    for (const blk of res.suburb || []) {
      for (let k = 0; k < 12 && hi < 36; k++) {
        const hx = blk.x0 + 6 + (k % 6) * 10.2;
        const hz = blk.z0 + (k < 6 ? 12 : 46);
        dummy.position.set(hx, 0, hz);
        dummy.rotation.set(0, (k < 6 ? Math.PI : 0) + (rnd() - 0.5) * 0.12, 0);
        dummy.scale.setScalar(0.92 + rnd() * 0.25);
        dummy.updateMatrix();
        homes.setMatrixAt(hi, dummy.matrix);
        dummy.position.set(hx, 1.7, hz + (k < 6 ? -3.16 : 3.16));
        dummy.updateMatrix();
        wins.setMatrixAt(hi, dummy.matrix);
        addCol(hx - 2.7, hx + 2.7, hz - 3.2, hz + 3.2, 0, 5.8);
        hi++;
      }
      scatterTrees(blk.x0 + 3, blk.z0 + 24, C.BLOCK - 6, 16, 8);
    }
    homes.count = wins.count = hi;
    homes.frustumCulled = wins.frustumCulled = false;
    scene.add(homes, wins);
  }

  // ── HOLY NAME CATHEDRAL (gothic) ──
  for (const blk of res.cathedral || []) {
    const cxx = blk.cx, czz = blk.cz;
    const g = new THREE.Group();
    const stone = solid(0x262433, 0.7, 0.2);
    const nave = new THREE.Mesh(new THREE.BoxGeometry(20, 18, 42), stone);
    nave.position.set(cxx, 9, czz);
    g.add(nave);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.5, 42, 3, 1), stone);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.scale.set(1, 0.75, 1);
    roof.position.set(cxx, 21.5, czz);
    g.add(roof);
    // twin towers + spires
    for (const e of [-1, 1]) {
      const tw = new THREE.Mesh(new THREE.BoxGeometry(7, 30, 7), stone);
      tw.position.set(cxx + e * 7.5, 15, czz + 23);
      g.add(tw);
      const sp = new THREE.Mesh(new THREE.ConeGeometry(4.4, 14, 4), stone);
      sp.position.set(cxx + e * 7.5, 37, czz + 23);
      sp.rotation.y = Math.PI / 4;
      g.add(sp);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), glow(NEON.amber, 0.9));
      cross.position.set(cxx + e * 7.5, 45, czz + 23);
      g.add(cross);
    }
    // rose window + pointed windows (canvas emissive)
    const rose = new THREE.Mesh(new THREE.CircleGeometry(3.4, 16),
      glow(NEON.purple, 0.85));
    rose.position.set(cxx, 13, czz + 26.6);
    g.add(rose);
    const [wc, wctx] = makeCanvas(64, 128);
    wctx.fillStyle = '#05040c'; wctx.fillRect(0, 0, 64, 128);
    wctx.fillStyle = '#caa2ff';
    wctx.beginPath();
    wctx.moveTo(12, 110); wctx.lineTo(12, 50);
    wctx.quadraticCurveTo(32, 14, 52, 50);
    wctx.lineTo(52, 110); wctx.closePath(); wctx.fill();
    const winTex = canvasTexture(wc);
    for (let k = 0; k < 6; k++) {
      for (const e of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 4.4),
          new THREE.MeshBasicMaterial({ map: winTex, toneMapped: true }));
        win.position.set(cxx + e * 10.05, 10.5, czz - 16 + k * 6.4);
        win.rotation.y = e * Math.PI / 2;
        g.add(win);
        // flying buttress
        const but = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9, 1.6), stone);
        but.position.set(cxx + e * 11.6, 5.5, czz - 16 + k * 6.4);
        but.rotation.z = -e * 0.32;
        g.add(but);
      }
    }
    scene.add(g);
    world.raycastTargets.push(nave);
    addCol(cxx - 10.2, cxx + 10.2, czz - 21, czz + 21, 0, 30);
    addCol(cxx - 11.2, cxx + 11.2, czz + 19.5, czz + 26.6, 0, 46);
    world.pois.push({ name: 'HOLY NAME CATHEDRAL', pos: new THREE.Vector3(cxx, 1, czz + 34), desc: 'Gothic relic of Old Town' });
    scatterTrees(blk.x0 + 2, blk.z0 + 2, C.BLOCK - 4, 10, 6);
  }

  // ── CITY HALL ──
  for (const blk of res.cityhall || []) {
    const cxx = blk.cx, czz = blk.cz;
    const civic = solid(0x2e3450, 0.55, 0.35);
    const body = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 24), civic);
    body.position.set(cxx, 7, czz);
    scene.add(body);
    world.raycastTargets.push(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(7.5, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), solid(0x3a4a72, 0.3, 0.7));
    dome.position.set(cxx, 14, czz);
    scene.add(dome);
    const domeGlow = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.12, 6, 24), glow(NEON.blue, 1.0));
    domeGlow.rotation.x = Math.PI / 2;
    domeGlow.position.set(cxx, 14.2, czz);
    scene.add(domeGlow);
    const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 0.7, 9, 8), solid(0x4a5478, 0.5, 0.3), 6);
    for (let k = 0; k < 6; k++) {
      dummy.position.set(cxx - 12.5 + k * 5, 4.5, czz + 13.2);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
      dummy.updateMatrix();
      cols.setMatrixAt(k, dummy.matrix);
    }
    cols.frustumCulled = false;
    scene.add(cols);
    // steps (walkable)
    for (let k = 0; k < 3; k++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(36 - k * 0, 0.5, 2.2), civic);
      st.position.set(cxx, 0.25 + k * 0.5, czz + 15.4 + (2 - k) * 2.2);
      scene.add(st);
      world.surfaces.push({ minX: cxx - 18, maxX: cxx + 18, minZ: st.position.z - 1.1, maxZ: st.position.z + 1.1, y: 0.5 + k * 0.5 });
    }
    addCol(cxx - 17, cxx + 17, czz - 12, czz + 12, 0, 15);
    world.pois.push({ name: 'CITY HALL', pos: new THREE.Vector3(cxx, 1, czz + 22), desc: 'Seat of the New Chicago mayor' });
    statueAt(cxx + 22, czz + 18);
  }

  // ── YARDS FUSION PLANT ──
  for (const blk of res.plant || []) {
    const cxx = blk.cx, czz = blk.cz;
    // containment sphere + pulsing torus
    const core = new THREE.Mesh(new THREE.SphereGeometry(9, 18, 14), solid(0x2a3148, 0.35, 0.75));
    core.position.set(cxx - 12, 9, czz - 10);
    scene.add(core);
    const ringT = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.5, 8, 30), glow(NEON.lime, 1.1));
    ringT.rotation.x = Math.PI / 2;
    ringT.position.copy(core.position);
    scene.add(ringT);
    addCol(cxx - 22, cxx - 2, czz - 20, czz, 0, 19);
    // cooling towers
    for (const e of [0, 1]) {
      const prof = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        prof.push(new THREE.Vector2(7 - 2.6 * Math.sin(t * Math.PI * 0.82), t * 24));
      }
      const ct = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), solid(0x333a52, 0.6, 0.3));
      ct.position.set(cxx + 12, 0, czz - 14 + e * 22);
      scene.add(ct);
      world.raycastTargets.push(ct);
      addCol(cxx + 5, cxx + 19, czz - 21 + e * 22, czz - 7 + e * 22, 0, 25);
      // steam plume
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(64, 'rgba(210,220,240,0.5)'), transparent: true, opacity: 0, depthWrite: false }));
      spr.position.set(ct.position.x, 25, ct.position.z);
      scene.add(spr);
      const ph = rnd() * 9;
      world.updateFns.push((dt, t) => {
        const k = (t * 0.22 + ph) % 1;
        spr.position.y = 25 + k * 14;
        spr.material.opacity = 0.3 * Math.sin(k * Math.PI);
        spr.scale.set(8 + k * 12, 6 + k * 9, 1);
      });
    }
    // smokestacks + strobes + tanks
    for (let k = 0; k < 3; k++) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 34, 8), solid(0x232839, 0.6, 0.3));
      st.position.set(cxx - 18 + k * 7, 17, czz + 16);
      scene.add(st);
      addCol(st.position.x - 1.6, st.position.x + 1.6, czz + 14.4, czz + 17.6, 0, 35);
      const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 5), glow(NEON.red, 1.5));
      strobe.position.set(st.position.x, 34.6, st.position.z);
      scene.add(strobe);
      const ph = k * 0.45;
      world.updateFns.push((dt, t) => { strobe.visible = ((t + ph) % 1.3) < 0.16; });
    }
    for (let k = 0; k < 3; k++) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 6, 12), solid(0x39415e, 0.5, 0.5));
      tank.position.set(cxx + 14 - k * 10, 3, czz + 22);
      scene.add(tank);
      addCol(tank.position.x - 4.2, tank.position.x + 4.2, czz + 17.8, czz + 26.2, 0, 7);
    }
    world.updateFns.push((dt, t) => {
      ringT.material.color.setHex(NEON.lime).multiplyScalar(0.8 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.1)));
    });
    world.pois.push({ name: 'YARDS FUSION PLANT', pos: new THREE.Vector3(cxx, 1, czz + 30), desc: 'Tokamak heart of the grid' });
  }

  // ════════════════ ROOFTOP WATER TOWERS (Wrigleyville) ════════════════
  {
    const wtGeo = (() => {
      const tank = new THREE.CylinderGeometry(1.7, 1.9, 2.6, 9);
      tank.translate(0, 2.6, 0);
      const cap = new THREE.ConeGeometry(2.0, 1.3, 9);
      cap.translate(0, 4.5, 0);
      const legs = new THREE.CylinderGeometry(1.55, 1.85, 1.4, 9, 1, true);
      legs.translate(0, 0.7, 0);
      return BufferGeometryUtils.mergeGeometries([tank, cap, legs]);
    })();
    const cands = world.buildings.filter(b => b.dk === 'STACKS' && !b.t2 && b.w > 13).slice(0, 16);
    const wt = new THREE.InstancedMesh(wtGeo, solid(0x33291f, 0.7, 0.25), cands.length);
    cands.forEach((b, i) => {
      dummy.position.set(b.x + b.w * 0.22, b.h, b.z - b.d * 0.18);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.scale.setScalar(0.9 + rnd() * 0.5);
      dummy.updateMatrix();
      wt.setMatrixAt(i, dummy.matrix);
    });
    wt.frustumCulled = false;
    scene.add(wt);
  }

  // ════════════════ TELECOM LATTICE TOWERS ════════════════
  for (const [tx, tz] of [[-H + 30, -H + 36], [H - 44, H - 40]]) {
    const lat = new THREE.Mesh(
      new THREE.ConeGeometry(4.2, 64, 4, 8, true),
      new THREE.MeshBasicMaterial({ color: 0x39415e, wireframe: true })
    );
    lat.position.set(tx, 32, tz);
    scene.add(lat);
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), glow(NEON.red, 1.5));
    strobe.position.set(tx, 64.8, tz);
    scene.add(strobe);
    world.updateFns.push((dt, t) => { strobe.visible = ((t + tx) % 1.5) < 0.18; });
    addCol(tx - 2.5, tx + 2.5, tz - 2.5, tz + 2.5, 0, 65);
  }

  // ════════════════ ZEPPELINS (searchlights + neon marquees) ════════════════
  for (let zi = 0; zi < 3; zi++) {
    const g = new THREE.Group();
    // hull is modeled along +X; lookAt() steers -Z — the inner group
    // turns the body 90° so the nose leads the travel direction
    const inner = new THREE.Group();
    inner.rotation.y = -Math.PI / 2;   // Object3D.lookAt steers +Z (not -Z): nose +X → +Z
    g.add(inner);
    const hull = new THREE.Mesh(new THREE.SphereGeometry(7, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a3148, roughness: 0.45, metalness: 0.55 }));
    hull.scale.set(2.7, 1, 1);
    inner.add(hull);
    const gond = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 2.2), solid(0x1a2030, 0.4, 0.6));
    gond.position.y = -7.2;
    inner.add(gond);
    for (const e of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.2, 0.35), solid(0x232c44, 0.5, 0.5));
      fin.position.set(-16.5, e * 2.2, 0);
      fin.rotation.x = e * 0.5;
      inner.add(fin);
    }
    // neon marquees on both flanks — share the animated LED canvas
    for (const e of [-1, 1]) {
      const mq = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5),
        new THREE.MeshBasicMaterial({ map: world.ledTex }));
      mq.position.set(0, 0.4, e * 7.15);
      mq.rotation.y = e > 0 ? 0 : Math.PI;
      inner.add(mq);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(22.6, 0.18, 0.18), glow(NEON.cyan, 1.0));
      trim.position.set(0, 3.3, e * 7.1);
      inner.add(trim);
    }
    // sweeping searchlight
    const beam = new THREE.Mesh(new THREE.ConeGeometry(10, 130, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beam.geometry.translate(0, -65, 0);
    const pivot = new THREE.Group();
    pivot.position.y = -7;
    pivot.add(beam);
    inner.add(pivot);
    scene.add(g);
    // ground contact: lit pool where the beam lands (and the ambush trigger)
    const spotGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(96, 'rgba(220,238,255,0.95)'), color: 0xcfe6ff,
      transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    spotGlow.scale.set(16, 16, 1);
    scene.add(spotGlow);
    const spotPos = new THREE.Vector3();
    world.spotlights = world.spotlights || [];
    world.spotlights.push(spotPos);
    const _sq = new THREE.Quaternion(), _sd = new THREE.Vector3(), _so = new THREE.Vector3();
    const ph = zi * 2.1, rad = 200 + zi * 90, hgt = 150 + zi * 18, w = 0.022 - zi * 0.004;
    world.updateFns.push((dt, t) => {
      const a = t * w + ph;
      g.position.set(Math.cos(a) * rad, hgt + Math.sin(t * 0.3 + ph) * 5, Math.sin(a) * rad * 0.8);
      const ta = a + 0.05;
      g.lookAt(Math.cos(ta) * rad, g.position.y, Math.sin(ta) * rad * 0.8);
      pivot.rotation.x = Math.sin(t * 0.3 + ph) * 0.35;
      pivot.rotation.z = Math.cos(t * 0.23 + ph) * 0.35;
      // stretch the beam to the street and park the pool there
      pivot.getWorldQuaternion(_sq);
      pivot.getWorldPosition(_so);
      _sd.set(0, -1, 0).applyQuaternion(_sq);
      if (_sd.y < -0.25) {
        const reach = -_so.y / _sd.y;
        beam.scale.y = reach / 130;
        spotPos.set(_so.x + _sd.x * reach, 0, _so.z + _sd.z * reach);
        spotGlow.position.set(spotPos.x, 0.4, spotPos.z);
        spotGlow.material.opacity = 0.42 + Math.sin(t * 2.2 + ph) * 0.1;
      } else {
        spotPos.set(99999, 0, 99999);   // beam pointing skyward — no pool
        spotGlow.material.opacity = 0;
      }
    });
  }

  // ════════════════ ARCHITECTURE GARDEN — real Chicago towers ════════════════
  // 12 buildings extracted from the user's NewChicago.glb print model
  // (models/NewChicagoLandmarks.glb, Y-up, recentered per tower).
  for (const blk of (res.models || [])) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(C.BLOCK, 0.6, C.BLOCK), solid(0x232a3c, 0.5, 0.5));
    plinth.position.set(blk.cx, 0.3, blk.cz);
    scene.add(plinth);
    world.surfaces.push({ minX: blk.x0, maxX: blk.x0 + C.BLOCK, minZ: blk.z0, maxZ: blk.z0 + C.BLOCK, y: 0.6 });
    world.pois.push({ name: 'ARCHITECTURE GARDEN', pos: new THREE.Vector3(blk.cx, 1, blk.cz), desc: 'Old Chicago, cast in monument' });
    new (THREE.TextureLoader)();  // no-op keepalive
    import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      new GLTFLoader().load('../models/NewChicagoLandmarks.glb', (g) => {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x2c3450, roughness: 0.3, metalness: 0.8, envMapIntensity: 1.2,
          emissive: 0x0c1a28, emissiveIntensity: 0.8,
        });
        const towers = g.scene.children.slice();
        towers.forEach((node, i) => {
          const h = (node.userData && node.userData.h) || 0.05;
          const target = 8 + (h / 0.087) * 18;          // monument scale — tallest ≈ 26u
          const sc = target / h;
          const gx = blk.x0 + 9 + (i % 4) * 15.4;
          const gz = blk.z0 + 10 + ((i / 4) | 0) * 21.5;
          node.traverse(m => {
            if (m.isMesh) {
              m.material = mat;
              world.raycastTargets.push(m);
              m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 24),
                new THREE.LineBasicMaterial({ color: new THREE.Color(0x00f0ff).multiplyScalar(1.5), toneMapped: false, transparent: true, opacity: 1.0 })));
            }
          });
          const wrap = new THREE.Group();
          wrap.add(node);
          node.scale.setScalar(sc);
          wrap.position.set(gx, 0.6, gz);
          wrap.rotation.y = (rnd() - 0.5) * 0.3;
          scene.add(wrap);
          const fw = ((node.userData && node.userData.fw) || 0.02) * sc;
          addCol(gx - fw / 2, gx + fw / 2, gz - fw / 2, gz + fw / 2, 0, target + 2);
          // corner studs instead of a full glow plate (footprints are wide)
          for (const [ex, ez] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const stud = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), glow(NEON.cyan, 0.9));
            stud.position.set(gx + ex * (fw / 2 + 0.5), 0.72, gz + ez * (fw / 2 + 0.5));
            scene.add(stud);
          }
        });
      }, undefined, () => {});
    });
  }

  // ════════════════ STREETSCAPE — vendors, markets, alleys, graffiti ════════════════
  {
    const B = world.buildings;
    // ── graffiti: gang-coded tags on building bases ──
    const tagTex = (seed) => {
      const [c, ctx] = makeCanvas(160, 96);
      const r2 = mulberry32(seed);
      ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff';
      for (let k = 0; k < 7; k++) {
        ctx.beginPath();
        ctx.moveTo(10 + r2() * 140, 12 + r2() * 70);
        ctx.bezierCurveTo(10 + r2() * 140, 12 + r2() * 70, 10 + r2() * 140, 12 + r2() * 70, 10 + r2() * 140, 12 + r2() * 70);
        ctx.stroke();
      }
      ctx.font = 'bold 30px Rajdhani, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(['SAINTS', 'BORG BOYZ', '2287', 'LOOP RATS'][seed % 4], 18 + r2() * 30, 56);
      const t = canvasTexture(c);
      return t;
    };
    const gangColor = { OLD: [0x00f0ff, 0xff3355], FOUNDRY: [0x53ffe9, 0xffb300], MARKET: [0xff2bd6, 0x9d4cff] };
    for (let v = 0; v < 2; v++) {
      const cands = B.filter(b => gangColor[b.dk] && b.w > 10).sort(() => rnd() - 0.5).slice(0, 36);
      const geo = new THREE.PlaneGeometry(3.6, 2.2);
      const mat = new THREE.MeshBasicMaterial({ map: tagTex(v * 2 + 1), transparent: true, opacity: 0.85 });
      const mesh = new THREE.InstancedMesh(geo, mat, cands.length);
      const col = new THREE.Color();
      cands.forEach((b, i) => {
        const side = (rnd() * 4) | 0;
        const off = [[b.w / 2 + 0.18, 0, Math.PI / 2], [-b.w / 2 - 0.18, 0, -Math.PI / 2], [0, b.d / 2 + 0.18, 0], [0, -b.d / 2 - 0.18, Math.PI]][side];
        dummy.position.set(b.x + off[0] + (rnd() - 0.5) * b.w * 0.4 * (off[0] === 0 ? 1 : 0), 1.7, b.z + off[1] + (rnd() - 0.5) * b.d * 0.4 * (off[1] === 0 ? 1 : 0));
        dummy.rotation.set(0, off[2], (rnd() - 0.5) * 0.12);
        dummy.scale.setScalar(0.8 + rnd() * 0.8);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, col.setHex(pick(rnd, gangColor[b.dk])).multiplyScalar(0.9));
      });
      mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }

    // ── food vendors + street markets (stall rows) ──
    const stallGeo = (() => {
      const counter = new THREE.BoxGeometry(3.2, 1.1, 1.6); counter.translate(0, 0.55, 0);
      const post = new THREE.BoxGeometry(0.12, 2.4, 0.12);
      const posts = [];
      for (const ex of [-1.5, 1.5]) for (const ez of [-0.7, 0.7]) {
        const p = post.clone(); p.translate(ex, 1.2, ez); posts.push(p);
      }
      const canopy = new THREE.CylinderGeometry(1.35, 1.35, 3.5, 3, 1);
      canopy.rotateZ(Math.PI / 2); canopy.rotateY(Math.PI / 2);
      canopy.scale(1, 0.5, 1);
      canopy.translate(0, 2.75, 0);
      return BufferGeometryUtils.mergeGeometries([counter, ...posts, canopy]);
    })();
    const H2 = C.HALF;
    const spots = [];
    for (let k = 0; k < 10; k++) spots.push([-150 + k * 32, H2 - C.CELL - C.ROAD / 2 - 3.4, 0]);           // Mag Mile arcade row
    for (let k = 0; k < 6; k++) spots.push([-H2 + 2 * C.CELL + 10 + k * 9, -40 + (k % 2) * 6, Math.PI / 2]); // Old Town market lane
    for (let k = 0; k < 4; k++) spots.push([-34 + k * 19, 44, Math.PI]);                                     // plaza food row
    const stalls = new THREE.InstancedMesh(stallGeo, solid(0x2a3148, 0.55, 0.35), spots.length);
    const stripGeo = new THREE.BoxGeometry(3.4, 0.16, 0.16);
    const strips = new THREE.InstancedMesh(stripGeo, glow(0xffffff, 1.0), spots.length);
    const scol = new THREE.Color();
    spots.forEach(([x, z, ry], i) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, ry + (rnd() - 0.5) * 0.2, 0);
      dummy.scale.setScalar(0.95 + rnd() * 0.2);
      dummy.updateMatrix();
      stalls.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 2.15;
      dummy.updateMatrix();
      strips.setMatrixAt(i, dummy.matrix);
      strips.setColorAt(i, scol.setHex(pick(rnd, NEON_LIST)).multiplyScalar(1.1));
      addCol(x - 1.7, x + 1.7, z - 1, z + 1, 0, 3);
      if (i % 3 === 0) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(64, 'rgba(225,230,245,0.5)'), transparent: true, opacity: 0, depthWrite: false }));
        spr.position.set(x, 1.6, z);
        scene.add(spr);
        const ph2 = rnd() * 9;
        world.updateFns.push((dt, t) => {
          const k2 = (t * 0.4 + ph2) % 1;
          spr.position.y = 1.4 + k2 * 4;
          spr.material.opacity = 0.3 * Math.sin(k2 * Math.PI);
          spr.scale.set(1.6 + k2 * 2.4, 1.6 + k2 * 2.6, 1);
        });
      }
    });
    strips.instanceColor.needsUpdate = true;
    stalls.frustumCulled = strips.frustumCulled = false;
    scene.add(stalls, strips);
    world.pois.push({ name: 'MAXWELL ST MARKET', pos: new THREE.Vector3(-H2 + 2 * C.CELL + 32, 1, -37), desc: 'Old Town stalls & street food' });

    // ── string lights over the market lanes ──
    {
      const pts = [], cols = [];
      const strand = (x0, z0, x1, z1, n) => {
        for (let k = 0; k <= n; k++) {
          const t2 = k / n;
          pts.push(x0 + (x1 - x0) * t2, 3.4 - Math.sin(t2 * Math.PI) * 0.7, z0 + (z1 - z0) * t2);
          const c2 = new THREE.Color(pick(rnd, NEON_LIST));
          cols.push(c2.r * 1.4, c2.g * 1.4, c2.b * 1.4);
        }
      };
      for (let k = 0; k < 9; k++) strand(-150 + k * 32, H2 - C.CELL - C.ROAD / 2 + 2, -118 + k * 32, H2 - C.CELL - C.ROAD / 2 - 8, 14);
      for (let k = 0; k < 5; k++) strand(-H2 + 2 * C.CELL + 10 + k * 9, -44, -H2 + 2 * C.CELL + 19 + k * 9, -32, 12);
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      g2.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
      const lights = new THREE.Points(g2, new THREE.PointsMaterial({
        map: glowTexture(32, 'rgba(255,255,255,1)'), size: 0.55, vertexColors: true,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
      }));
      lights.frustumCulled = false;
      scene.add(lights);
    }

    // ── skybridges → lit underpasses beneath ──
    {
      const pairs = [];
      for (const b of B) {
        if (b.h < 46 || pairs.length >= 6) continue;
        const m = B.find(o => o !== b && o.h > 40 && Math.abs(o.z - b.z) < 8 &&
          o.x - b.x > b.w / 2 + 12 && o.x - b.x < b.w / 2 + o.w / 2 + 30);
        if (m) pairs.push([b, m]);
      }
      for (const [a2, b2] of pairs) {
        const x0 = a2.x + a2.w / 2, x1 = b2.x - b2.w / 2;
        const len = x1 - x0, cx2 = (x0 + x1) / 2, cz2 = (a2.z + b2.z) / 2;
        const hgt2 = Math.min(a2.h, b2.h) * 0.45;
        const br = new THREE.Mesh(new THREE.BoxGeometry(len, 3.2, 4.2), solid(0x232c44, 0.4, 0.6));
        br.position.set(cx2, hgt2, cz2);
        scene.add(br);
        world.raycastTargets.push(br);
        const band = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 4.3), glow(0x9fd8ff, 0.5));
        band.position.set(cx2, hgt2 + 0.4, cz2);
        scene.add(band);
        // underpass glow on the street below
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(len, 6),
          new THREE.MeshBasicMaterial({ map: glowTexture(64, 'rgba(160,210,255,0.5)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(cx2, 0.06, cz2);
        scene.add(pool);
        addCol(x0, x1, cz2 - 2.1, cz2 + 2.1, hgt2 - 1.6, hgt2 + 1.6);
      }
    }

    // ── service corridors: piped narrow gaps + hazard lights ──
    {
      let made = 0;
      for (const b of B) {
        if (made >= 8) break;
        const m = B.find(o => o !== b && Math.abs(o.z - b.z) < 6 && o.x - b.x > b.w / 2 + 2.2 && o.x - b.x < b.w / 2 + o.w / 2 + 6);
        if (!m || b.dk === 'CORE') continue;
        made++;
        const gx = (b.x + b.w / 2 + m.x - m.w / 2) / 2, gz = (b.z + m.z) / 2;
        for (let k = 0; k < 3; k++) {
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 5), solid(0x39415e, 0.5, 0.6));
          pipe.rotation.x = Math.PI / 2;
          pipe.position.set(b.x + b.w / 2 + 0.25, 2 + k * 1.1, gz);
          scene.add(pipe);
        }
        const hz = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), glow(0xffb300, 1.3));
        hz.position.set(gx, 2.6, gz);
        scene.add(hz);
        const ph3 = rnd() * 2;
        world.updateFns.push((dt, t) => { hz.visible = ((t + ph3) % 1.6) < 0.9; });
      }
    }

    // ── rooftop clutter: AC units + vents on random roofs ──
    {
      const acGeo = (() => {
        const box = new THREE.BoxGeometry(2.2, 1.2, 1.6); box.translate(0, 0.6, 0);
        const fan = new THREE.CylinderGeometry(0.55, 0.55, 0.3, 8); fan.translate(0.5, 1.25, 0);
        return BufferGeometryUtils.mergeGeometries([box, fan]);
      })();
      const cands = B.filter(b => !b.t2 && b.w > 12 && rnd() < 0.5).slice(0, 70);
      const ac = new THREE.InstancedMesh(acGeo, solid(0x222a3c, 0.6, 0.4), cands.length);
      cands.forEach((b, i) => {
        dummy.position.set(b.x + (rnd() - 0.5) * b.w * 0.4, b.h, b.z + (rnd() - 0.5) * b.d * 0.4);
        dummy.rotation.set(0, rnd() * Math.PI, 0);
        dummy.scale.setScalar(0.8 + rnd() * 0.7);
        dummy.updateMatrix();
        ac.setMatrixAt(i, dummy.matrix);
      });
      ac.frustumCulled = false;
      scene.add(ac);
    }
  }

  // ── helpers ──
  function statueAt(x, z) {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(2, 1.8, 2), solid(0x2c3450, 0.5, 0.5));
    ped.position.set(x, 0.9, z);
    scene.add(ped);
    const fig = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.5, 4, 8), solid(0x171d2e, 0.35, 0.8));
    fig.position.set(x, 3.0, z);
    scene.add(fig);
    addCol(x - 1.2, x + 1.2, z - 1.2, z + 1.2, 0, 5);
  }

  let treePool = null;
  function treeMesh() {
    if (treePool) return treePool;
    const trunk = new THREE.CylinderGeometry(0.18, 0.26, 2.2, 5);
    trunk.translate(0, 1.1, 0);
    const crown = new THREE.IcosahedronGeometry(1.5, 0);
    crown.scale(1, 1.25, 1);
    crown.translate(0, 3.2, 0);
    treePool = {
      trunkGeo: trunk, crownGeo: crown,
      trunks: [], crowns: [],
    };
    return treePool;
  }
  function scatterTrees(x0, z0, w, d, n, avoid = null) {
    for (let k = 0; k < n; k++) {
      const x = x0 + rnd() * w, z = z0 + rnd() * d;
      if (avoid && Math.hypot(x - avoid[0], z - avoid[1]) < avoid[2]) continue;
      treeSpots.push([x, z, 0.8 + rnd() * 0.7]);
    }
  }
  function treeRow(x, z0, z1, step, axis) {
    for (let z = z0; z <= z1; z += step) treeSpots.push([x, z, 0.85 + rnd() * 0.5]);
  }
  // build instanced trees once all scatter calls have run
  world._finishTrees = () => {
    return;   // leafy trees removed — the world is a dystopian desert (only wasteland flora remains)
    if (!treeSpots.length) return;
    const tp = treeMesh();
    const trunks = new THREE.InstancedMesh(tp.trunkGeo, solid(0x2b2118, 0.8, 0.1), treeSpots.length);
    const crowns = new THREE.InstancedMesh(tp.crownGeo,
      new THREE.MeshStandardMaterial({ color: 0x1b3a26, roughness: 0.85, metalness: 0.05, emissive: 0x0a2014, emissiveIntensity: 0.4 }),
      treeSpots.length);
    treeSpots.forEach(([x, z, s], i) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      crowns.setMatrixAt(i, dummy.matrix);
    });
    trunks.frustumCulled = crowns.frustumCulled = false;
    scene.add(trunks, crowns);
  };
  // ════════════ LAKE LIFE — ships, jetty+lighthouse, fireworks, harbor, island ════════════
  {
    const lrnd = mulberry32(C.SEED + 333);
    const winMat = (c, k) => glow(c, k);
    // ---- a reusable ship hull builder (hull + decks + lit windows + funnels) ----
    const makeShip = (len, wid, decks, hullCol, accent) => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(len, 7, wid), solid(hullCol, 0.5, 0.5)); hull.position.y = 2.5; g.add(hull);
      const bow = new THREE.Mesh(new THREE.CylinderGeometry(wid / 2, wid / 2, 7, 16, 1, false, 0, Math.PI), solid(hullCol, 0.5, 0.5));
      bow.rotation.z = Math.PI / 2; bow.position.set(len / 2, 2.5, 0); bow.scale.set(1, 0.6, 1); g.add(bow);
      for (let d = 0; d < decks; d++) {
        const dl = len - 8 - d * (len * 0.12), dw = wid - 1.5 - d * 1.2;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(dl, 3.4, dw), solid(0xe9eef6, 0.6, 0.2));
        deck.position.set(-d * 1.5, 6 + d * 3.6, 0); g.add(deck);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(dl, 0.5, dw + 0.1), winMat(accent, 1.0));
        strip.position.set(-d * 1.5, 5.2 + d * 3.6, 0); g.add(strip);
      }
      for (const fx of [-len * 0.12, len * 0.06]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 5, 10), solid(0x33405c, 0.5, 0.4)); f.position.set(fx, decks * 3.6 + 7.5, 0); g.add(f); }
      return g;
    };

    // ---- cruise ships drifting along the lake (wrap around) ----
    const cruisers = [];
    for (let i = 0; i < 2; i++) {
      const s = makeShip(64, 14, 3, 0x12203a, pick(lrnd, NEON_LIST));
      s.position.set(SHORE - 180 - i * 230, 0, -H + 120 + i * 360);
      scene.add(s); cruisers.push({ s, sp: 7 + i * 3, dir: i % 2 ? -1 : 1 });
    }
    world.pois.push({ name: 'LAKE CRUISE', pos: new THREE.Vector3(SHORE - 180, 4, -H + 120), desc: 'Mishigami pleasure cruisers' });
    world.updateFns.push((dt, t) => {
      for (const c of cruisers) {
        c.s.position.z += c.dir * c.sp * dt;
        if (c.s.position.z > H + 200) c.s.position.z = -H - 200;
        if (c.s.position.z < -H - 200) c.s.position.z = H + 200;
        c.s.rotation.y = c.dir > 0 ? 0 : Math.PI;
        c.s.position.y = Math.sin(t * 0.6 + c.s.position.x) * 0.3;
      }
    });

    // ---- many small boats bobbing on the lake (instanced) ----
    const boatGeo = (() => { const h = new THREE.BoxGeometry(4.2, 1.2, 1.8); h.translate(0, 0.6, 0); const c = new THREE.BoxGeometry(1.8, 1.1, 1.4); c.translate(-0.4, 1.6, 0); return BufferGeometryUtils.mergeGeometries([h, c]); })();
    const NB = 30, boats = new THREE.InstancedMesh(boatGeo, solid(0xcfd6e4, 0.6, 0.3), NB), bst = [];
    for (let i = 0; i < NB; i++) bst.push({ x: SHORE - 60 - lrnd() * 520, z: -H + lrnd() * C.SPAN, ph: lrnd() * 9, yaw: lrnd() * 6, drift: (lrnd() - 0.5) * 2 });
    boats.frustumCulled = false; scene.add(boats);
    const bdum = new THREE.Object3D();
    world.updateFns.push((dt, t) => { for (let i = 0; i < NB; i++) { const b = bst[i]; b.z += b.drift * dt; if (b.z > H) b.z = -H; if (b.z < -H) b.z = H; bdum.position.set(b.x, 0.2 + Math.sin(t * 1.2 + b.ph) * 0.25, b.z); bdum.rotation.set(Math.sin(t + b.ph) * 0.06, b.yaw, Math.cos(t * 1.1 + b.ph) * 0.05); bdum.updateMatrix(); boats.setMatrixAt(i, bdum.matrix); } boats.instanceMatrix.needsUpdate = true; });

    // ---- breakwater JETTY + LIGHTHOUSE with a sweeping beam ----
    {
      const jz = -H + 250, jLen = 120;
      const jetty = new THREE.Mesh(new THREE.BoxGeometry(jLen, 2.2, 7), solid(0x3a3f4d, 0.85, 0.15));
      jetty.position.set(SHORE - jLen / 2, 0.4, jz); scene.add(jetty);
      world.surfaces.push({ minX: SHORE - jLen, maxX: SHORE, minZ: jz - 3.5, maxZ: jz + 3.5, y: 1.5 });
      const lx = SHORE - jLen + 4;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, 14, 14), solid(0xe8ecf2, 0.7, 0.1)); base.position.set(lx, 7, jz); scene.add(base);
      for (let b = 0; b < 3; b++) { const band = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.4, 2, 14), glow(NEON.red, 0.8)); band.position.set(lx, 3 + b * 4.5, jz); scene.add(band); }
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 12), glow(0xffe9b0, 1.2)); lantern.position.set(lx, 15.5, jz); scene.add(lantern);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 90, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      beam.rotation.z = Math.PI / 2; beam.position.set(lx, 15.5, jz); const beamPivot = new THREE.Group(); beamPivot.position.set(lx, 15.5, jz); beam.position.set(0, 0, 0); beam.position.x = -45; beamPivot.add(beam); scene.add(beamPivot);
      world.pois.push({ name: 'HARBOR LIGHT', pos: new THREE.Vector3(lx, 2, jz), desc: 'Mishigami breakwater lighthouse' });
      world.updateFns.push((dt, t) => { beamPivot.rotation.y = t * 0.7; lantern.material.opacity = 0.9 + 0.1 * Math.sin(t * 4); });
    }

    // ---- FIREWORKS BARGE ----
    {
      const barge = new THREE.Mesh(new THREE.BoxGeometry(20, 1.6, 11), solid(0x20242e, 0.6, 0.4)); barge.position.set(SHORE - 170, 0.4, -120); scene.add(barge);
      const FW = 200, pos = new Float32Array(FW * 3).fill(-9999), col = new Float32Array(FW * 3);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.0, map: glowTexture(32, 'rgba(255,255,255,1)'), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
      pts.frustumCulled = false; scene.add(pts);
      const parts = []; let timer = 2; const lx2 = SHORE - 170, lz2 = -120;
      world.updateFns.push((dt, t) => {
        timer -= dt;
        if (timer <= 0) { parts.push({ x: lx2 + (lrnd() - 0.5) * 8, y: 2, z: lz2 + (lrnd() - 0.5) * 6, vx: (lrnd() - 0.5) * 3, vy: 34 + lrnd() * 12, vz: (lrnd() - 0.5) * 3, life: 1.5, shell: true, col: new THREE.Color(pick(lrnd, NEON_LIST)) }); timer = 1.3 + lrnd() * 2.4; }
        for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.vy -= 17 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.shell && (p.vy < 3 || p.life < 0.2)) { for (let k = 0; k < 44; k++) { const a = lrnd() * Math.PI * 2, e = Math.acos(2 * lrnd() - 1), sp = 9 + lrnd() * 10; parts.push({ x: p.x, y: p.y, z: p.z, vx: Math.sin(e) * Math.cos(a) * sp, vy: Math.cos(e) * sp, vz: Math.sin(e) * Math.sin(a) * sp, life: 1.1 + lrnd() * 0.6, shell: false, col: p.col }); } parts.splice(i, 1); continue; }
          if (p.life <= 0) parts.splice(i, 1);
        }
        const n = Math.min(parts.length, FW);
        for (let i = 0; i < n; i++) { const p = parts[i], f = Math.max(0, Math.min(1, p.life)); pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; col[i * 3] = p.col.r * f; col[i * 3 + 1] = p.col.g * f; col[i * 3 + 2] = p.col.b * f; }
        for (let i = n; i < FW; i++) pos[i * 3 + 1] = -9999;
        geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      });
      world.pois.push({ name: 'FIREWORKS BARGE', pos: new THREE.Vector3(lx2, 2, lz2), desc: 'Nightly pyrotechnics over Mishigami' });
    }

    // ---- SHIPPING HARBOR at the south end: cranes, container stacks, cargo ship ----
    {
      const hz = H - 160, hx = SHORE - 40;
      const contColors = [0xc0492f, 0x2f6cc0, 0x2fa34a, 0xc7a52f, 0x8a3fb0];
      const cont = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 2.6, 2.6), solid(0xffffff, 0.7, 0.3), 120);
      const cdum = new THREE.Object3D(), ccol = new THREE.Color(); let ci = 0;
      for (let row = 0; row < 5; row++) for (let cidx = 0; cidx < 8; cidx++) for (let stack = 0; stack < (1 + ((row + cidx) % 3)); stack++) {
        if (ci >= 120) break;
        cdum.position.set(hx - 10 - row * 7, 1.4 + stack * 2.7, hz - 24 + cidx * 6.4); cdum.updateMatrix();
        cont.setMatrixAt(ci, cdum.matrix); cont.setColorAt(ci, ccol.setHex(contColors[(row + cidx + stack) % contColors.length])); ci++;
      }
      cont.count = ci; cont.instanceColor.needsUpdate = true; cont.frustumCulled = false; scene.add(cont);
      addCol(hx - 50, hx, hz - 28, hz + 28, 0, 9);
      // gantry cranes
      for (let k = 0; k < 3; k++) {
        const cz = hz - 18 + k * 18, g = new THREE.Group();
        for (const e of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 26, 1.2), solid(0xb24a2a, 0.5, 0.5)); leg.position.set(hx - 4, 13, cz + e * 6); g.add(leg); }
        const boom = new THREE.Mesh(new THREE.BoxGeometry(40, 1.4, 1.4), glow(NEON.amber, 0.6)); boom.position.set(hx - 16, 26, cz); g.add(boom);
        scene.add(g);
      }
      // a docked cargo ship
      const cargo = makeShip(70, 16, 1, 0x223047, NEON.amber); cargo.position.set(hx - 60, 0, hz + 8); cargo.rotation.y = Math.PI; scene.add(cargo);
      world.pois.push({ name: 'GAGARIN HARBOR', pos: new THREE.Vector3(hx - 20, 2, hz), desc: 'New Chicago container terminal' });
    }

    // ---- MILLIONAIRE ISLAND with mansions + ferries to shore ----
    {
      const ix = SHORE - 320, iz = 60, ir = 64;
      const isle = new THREE.Mesh(new THREE.CylinderGeometry(ir, ir + 6, 4, 36), solid(0x1d3324, 0.9, 0.05));
      isle.position.set(ix, 0.4, iz); scene.add(isle);
      const beach = new THREE.Mesh(new THREE.CylinderGeometry(ir + 9, ir + 11, 1.4, 36), solid(0x59513e, 0.9, 0.05)); beach.position.set(ix, -0.2, iz); scene.add(beach);
      addCol(ix - ir, ix + ir, iz - ir, iz + ir, 0, 3.5);
      world.surfaces.push({ minX: ix - ir + 4, maxX: ix + ir - 4, minZ: iz - ir + 4, maxZ: iz + ir - 4, y: 2.4 });
      // mansions ringed around the island
      for (let m = 0; m < 6; m++) {
        const a = (m / 6) * Math.PI * 2, mx = ix + Math.cos(a) * ir * 0.55, mz = iz + Math.sin(a) * ir * 0.55;
        const w = 14 + lrnd() * 8, d = 11 + lrnd() * 6, h = 9 + lrnd() * 7;
        const man = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), solid(0x2c3550, 0.5, 0.35)); man.position.set(mx, 2.4 + h / 2, mz); scene.add(man);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.5, 0.6, d + 1.5), glow(pick(lrnd, NEON_LIST), 0.7)); roof.position.set(mx, 2.4 + h + 0.3, mz); scene.add(roof);
        const win = new THREE.Mesh(new THREE.BoxGeometry(w - 1, h - 2, d - 1), winMat(0xffe6a8, 0.45)); win.position.set(mx, 2.4 + h / 2, mz); win.material.transparent = true; win.material.opacity = 0.5; scene.add(win);
        addCol(mx - w / 2, mx + w / 2, mz - d / 2, mz + d / 2, 0, 2.4 + h);
      }
      scatterTrees(ix - ir * 0.7, iz - ir * 0.7, ir * 1.4, ir * 1.4, 22, [ix, iz, 22]);
      world.pois.push({ name: 'PLATINUM ISLE', pos: new THREE.Vector3(ix, 3, iz), desc: 'Billionaires’ island estates' });
      // docks: island + mainland, and two ferries shuttling between them
      const mainDockX = SHORE - 6, mainDockZ = iz;
      const islDockX = ix + ir, islDockZ = iz;
      for (const [dx, dz] of [[mainDockX - 8, mainDockZ], [islDockX + 6, islDockZ]]) { const dk = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 6), solid(0x2a3145, 0.5, 0.4)); dk.position.set(dx, 0.3, dz); scene.add(dk); }
      const ferries = [];
      for (let f = 0; f < 2; f++) { const fy = makeShip(16, 6, 1, 0x2a3a52, NEON.cyan); scene.add(fy); ferries.push({ fy, p: f * 0.5 }); }
      world.updateFns.push((dt, t) => {
        for (const fr of ferries) {
          fr.p = (fr.p + dt * 0.04) % 1; const tri = fr.p < 0.5 ? fr.p * 2 : (1 - fr.p) * 2;
          fr.fy.position.set(mainDockX + (islDockX - mainDockX) * tri, Math.sin(t + fr.p * 9) * 0.2, mainDockZ);
          fr.fy.rotation.y = fr.p < 0.5 ? Math.PI : 0;
        }
      });
      world.pois.push({ name: 'ISLE FERRY', pos: new THREE.Vector3(mainDockX - 8, 1, mainDockZ), desc: 'Shuttles to Platinum Isle' });
    }
  }

  // ════════════ PARK ACTIVITY — fountain, holo tree, strollers, drones, path lights ════════════
  for (const blk of res.park || []) {
    const cx = blk.cx, cz = blk.cz;
    // fountain: basin + reflective water + animated jet spray
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.6, 0.8, 20), solid(0x223047, 0.3, 0.6));
    basin.position.set(cx, 0.4, cz); scene.add(basin);
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.6, 20),
      new THREE.MeshStandardMaterial({ color: 0x0e2a40, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.5 }));
    water.rotation.x = -Math.PI / 2; water.position.set(cx, 0.82, cz); scene.add(water);
    const sprayPts = [], sprayPh = [];
    for (let i = 0; i < 40; i++) { sprayPts.push(cx + (rnd() - 0.5) * 1.4, 1, cz + (rnd() - 0.5) * 1.4); sprayPh.push(rnd() * Math.PI * 2); }
    const sprayGeo = new THREE.BufferGeometry();
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sprayPts), 3));
    const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ map: glowTexture(32, 'rgba(180,220,255,0.9)'), size: 0.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x9fd8ff }));
    spray.frustumCulled = false; scene.add(spray);
    world.updateFns.push((dt, t) => { const p = spray.geometry.attributes.position.array; for (let i = 0; i < 40; i++) { const k = (t * 1.4 + sprayPh[i]) % 1; p[i * 3 + 1] = 1 + Math.sin(k * Math.PI) * 3.0; } spray.geometry.attributes.position.needsUpdate = true; });
    // holographic tree centerpiece
    const holoTree = new THREE.Mesh(new THREE.ConeGeometry(3, 7, 8),
      new THREE.MeshBasicMaterial({ color: NEON.lime, wireframe: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    holoTree.position.set(cx, 6.5, cz); scene.add(holoTree);
    world.updateFns.push((dt, t) => { holoTree.rotation.y += dt * 0.3; holoTree.material.opacity = 0.3 + 0.15 * Math.sin(t * 2); });
    // path bollard lights
    for (let i = -2; i <= 2; i++) for (const [bx, bz] of [[cx + i * 8, cz], [cx, cz + i * 8]]) {
      const boll = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.2, 8), solid(0x2a3142, 0.6, 0.4));
      boll.position.set(bx, 0.6, bz); scene.add(boll);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), glow(NEON.cyan, 1.2));
      cap.position.set(bx, 1.3, bz); scene.add(cap);
    }
    // strollers circulating the paths
    const N = 12, people = new THREE.InstancedMesh(humanoidGeo(), new THREE.MeshStandardMaterial({ color: 0x6a7390, roughness: 0.7 }), N);
    const pcol = new THREE.Color(), pState = [];
    for (let i = 0; i < N; i++) { pState.push({ r: 9 + rnd() * 18, a: rnd() * Math.PI * 2, sp: (0.5 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1) }); people.setColorAt(i, pcol.setHSL(rnd(), 0.4, 0.6)); }
    people.instanceColor.needsUpdate = true; people.frustumCulled = false; scene.add(people);
    const pdum = new THREE.Object3D();
    world.updateFns.push((dt, t) => { for (let i = 0; i < N; i++) { const s = pState[i]; s.a += dt * s.sp / Math.max(5, s.r); const x = cx + Math.cos(s.a) * s.r, z = cz + Math.sin(s.a) * s.r; pdum.position.set(x, 0, z); pdum.rotation.y = -s.a + (s.sp > 0 ? 0 : Math.PI); pdum.updateMatrix(); people.setMatrixAt(i, pdum.matrix); } people.instanceMatrix.needsUpdate = true; });
    // drifting drones above the park
    const droneGeo = (() => { const bx = new THREE.BoxGeometry(0.5, 0.2, 0.5); const r = new THREE.TorusGeometry(0.4, 0.06, 6, 12); r.rotateX(Math.PI / 2); return BufferGeometryUtils.mergeGeometries([bx, r]); })();
    const D = 6, drones = new THREE.InstancedMesh(droneGeo, glow(NEON.magenta, 1.0), D), dState = [];
    for (let i = 0; i < D; i++) dState.push({ r: 6 + rnd() * 16, a: rnd() * 6, h: 8 + rnd() * 10, sp: 0.3 + rnd() * 0.4, ph: rnd() * 6 });
    drones.frustumCulled = false; scene.add(drones);
    const ddum = new THREE.Object3D();
    world.updateFns.push((dt, t) => { for (let i = 0; i < D; i++) { const s = dState[i]; s.a += dt * s.sp / 4; const x = cx + Math.cos(s.a) * s.r, z = cz + Math.sin(s.a) * s.r, y = s.h + Math.sin(t + s.ph) * 1.2; ddum.position.set(x, y, z); ddum.rotation.y = t * 2 + s.ph; ddum.updateMatrix(); drones.setMatrixAt(i, ddum.matrix); } drones.instanceMatrix.needsUpdate = true; });
    world.pois.push({ name: 'PARK FOUNTAIN', pos: new THREE.Vector3(cx, 1, cz), desc: 'Grant Park plaza & fountain' });
  }

  // ════════════ CRIME ALLEYS — dumpsters, barrel fires, flicker lights, steam ════════════
  {
    const arnd = mulberry32(C.SEED + 5151);
    const B = (world.buildings || []).filter(b => !b.glbTower && !b.arcade && (b.dk === 'OLD' || b.dk === 'MARKET' || b.dk === 'FOUNDRY')).sort(() => arnd() - 0.5).slice(0, 14);
    const dumps = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1.4, 1.2), solid(0x243018, 0.7, 0.3), B.length * 2);
    const ddum = new THREE.Object3D(); let di = 0; const fxList = [];
    B.forEach(b => {
      const side = (arnd() * 4) | 0;
      const ox = [b.w / 2 + 1.6, -b.w / 2 - 1.6, 0, 0][side], oz = [0, 0, b.d / 2 + 1.6, -b.d / 2 - 1.6][side];
      const ax = side < 2 ? 0 : 1, az = side < 2 ? 1 : 0;
      const x = b.x + ox, z = b.z + oz;
      for (const o of [-2.5, 2.5]) { ddum.position.set(x + ax * o, 0.7, z + az * o); ddum.rotation.y = (side < 2 ? 0 : Math.PI / 2) + (arnd() - 0.5) * 0.3; ddum.updateMatrix(); if (di < dumps.count) dumps.setMatrixAt(di++, ddum.matrix); }
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 8), solid(0x141414, 0.8, 0.3)); barrel.position.set(x + ax, 0.5, z + az); scene.add(barrel);
      const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(32, 'rgba(255,160,60,1)'), color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      fire.position.set(x + ax, 1.2, z + az); fire.scale.set(1.4, 1.8, 1); scene.add(fire);
      const door = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(32, 'rgba(255,60,80,1)'), color: 0xff3355, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
      door.position.set(x - ax * 3, 2.5, z - az * 3); door.scale.set(0.9, 0.9, 1); scene.add(door);
      const steamPts = []; for (let i = 0; i < 10; i++) steamPts.push(x + (arnd() - 0.5), 0.5 + i * 0.5, z + (arnd() - 0.5));
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(steamPts), 3));
      const steam = new THREE.Points(sg, new THREE.PointsMaterial({ map: glowTexture(32, 'rgba(160,170,190,0.5)'), size: 1.6, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
      steam.frustumCulled = false; scene.add(steam);
      fxList.push({ fire, door, steam, base: steamPts.slice(), ph: arnd() * 6 });
    });
    dumps.count = di; dumps.instanceMatrix.needsUpdate = true; dumps.frustumCulled = false; scene.add(dumps);
    world.updateFns.push((dt, t) => {
      for (const f of fxList) {
        const fl = 0.65 + 0.3 * Math.sin(t * 17 + f.ph) + (Math.sin(t * 41 + f.ph) > 0.8 ? 0.2 : 0);
        f.fire.material.opacity = Math.min(1, Math.max(0.4, fl));
        f.fire.scale.set(1.2 + 0.3 * Math.sin(t * 12 + f.ph), 1.7 + 0.4 * Math.sin(t * 15 + f.ph), 1);
        f.door.material.opacity = 0.35 + 0.4 * (Math.sin(t * 9 + f.ph) > 0.3 ? 1 : 0.2);
        const p = f.steam.geometry.attributes.position.array;
        for (let i = 0; i < 10; i++) p[i * 3 + 1] = f.base[i * 3 + 1] + ((t * 0.6 + i * 0.15) % 2.2);
        f.steam.geometry.attributes.position.needsUpdate = true;
      }
    });
  }

  // ════════════ WILDERNESS & MOUNTAINS — ranges beyond the city (E / N / S; lake is W) ════════════
  {
    const wrnd = mulberry32(C.SEED + 909);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.95, metalness: 0.05, flatShading: true });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xdfe8f2, roughness: 0.7, metalness: 0.05, emissive: 0x26303f, emissiveIntensity: 0.4, flatShading: true });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x231b12, roughness: 0.97, metalness: 0.0 });   // dusty wasteland flats
    const rock = [], snow = [];
    const peak = (x, z, r, h) => {
      const c = new THREE.ConeGeometry(r, h, 7 + (wrnd() * 4 | 0), 1); c.translate(x, h / 2 - 1, z); rock.push(c);
      const ch = h * (0.22 + wrnd() * 0.12); const sc = new THREE.ConeGeometry(r * (ch / h) * 1.1, ch, 7, 1); sc.translate(x, h - ch / 2 - 1, z); snow.push(sc);
    };
    const apron = (cx, cz, w, d) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), grassMat); m.rotation.x = -Math.PI / 2; m.position.set(cx, -0.25, cz); m.frustumCulled = false; scene.add(m); };
    const FAR = H + 1400;
    apron(H + 760, 0, 1560, FAR * 2);
    apron(0, -(H + 760), FAR * 2, 1560);
    apron(0, H + 760, FAR * 2, 1560);
    const ridge = (axis, sign) => {
      for (let row = 0; row < 2; row++) {
        const dist = H + 380 + row * 340;
        for (let k = -9; k <= 9; k++) {
          const along = k * 150 + (wrnd() - 0.5) * 80;
          const r = 70 + wrnd() * 110, h = 110 + wrnd() * 200 + row * 60;
          if (axis === 'x') peak(sign * dist, along, r, h); else peak(along, sign * dist, r, h);
        }
      }
    };
    ridge('x', 1); ridge('z', -1); ridge('z', 1);
    if (rock.length) { const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(rock), rockMat); m.frustumCulled = false; scene.add(m); }
    if (snow.length) { const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(snow), snowMat); m.frustumCulled = false; scene.add(m); }
    // ── WASTELAND flora — sparse Joshua trees + boulders (a badlands, not a forest) ──
    {
      const jtGeo = (() => {
        const P = [];
        const tr = new THREE.CylinderGeometry(0.45, 0.7, 5.5, 6); tr.translate(0, 2.75, 0); P.push(tr);
        for (let a = 0; a < 4; a++) {
          const ang = a * 1.57 + 0.5, up = 3.6 + (a % 2) * 1.3;
          const arm = new THREE.CylinderGeometry(0.24, 0.32, 2.6, 5); arm.rotateZ(0.8); arm.rotateY(ang); arm.translate(Math.cos(ang) * 1.2, up, Math.sin(ang) * 1.2); P.push(arm);
          const tuft = new THREE.ConeGeometry(0.75, 1.4, 6); tuft.translate(Math.cos(ang) * 2.0, up + 1.2, Math.sin(ang) * 2.0); P.push(tuft);
        }
        const top = new THREE.ConeGeometry(0.8, 1.6, 6); top.translate(0, 5.9, 0); P.push(top);
        return BufferGeometryUtils.mergeGeometries(P);
      })();
      const jtMat = new THREE.MeshStandardMaterial({ color: 0x2b3324, roughness: 0.9, metalness: 0.05, flatShading: true });
      const rockGeo = new THREE.IcosahedronGeometry(1, 0);
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x2c2820, roughness: 0.96, metalness: 0.04, flatShading: true });
      const rects = [[H + 50, H + 680, -H, H], [-H, H, -(H + 680), -(H + 50)], [-H, H, H + 50, H + 680]];
      const NJ = 150, jt = new THREE.InstancedMesh(jtGeo, jtMat, NJ), jd = new THREE.Object3D();
      for (let i = 0; i < NJ; i++) { const r = rects[i % 3]; jd.position.set(r[0] + wrnd() * (r[1] - r[0]), 0, r[2] + wrnd() * (r[3] - r[2])); jd.rotation.y = wrnd() * 6; jd.scale.setScalar(0.7 + wrnd() * 1.2); jd.updateMatrix(); jt.setMatrixAt(i, jd.matrix); }
      jt.frustumCulled = false; scene.add(jt);
      const NR = 110, rk = new THREE.InstancedMesh(rockGeo, rockMat, NR), rd = new THREE.Object3D();
      for (let i = 0; i < NR; i++) { const r = rects[i % 3]; rd.position.set(r[0] + wrnd() * (r[1] - r[0]), 0.3, r[2] + wrnd() * (r[3] - r[2])); rd.rotation.set(wrnd() * 6, wrnd() * 6, wrnd() * 6); rd.scale.set(1 + wrnd() * 4.5, 0.7 + wrnd() * 2.5, 1 + wrnd() * 4.5); rd.updateMatrix(); rk.setMatrixAt(i, rd.matrix); }
      rk.frustumCulled = false; scene.add(rk);
      // rock mesas / buttes — the badlands silhouette
      const mesaGeo = new THREE.CylinderGeometry(0.72, 1, 1, 7, 1);
      const NM = 18, ms = new THREE.InstancedMesh(mesaGeo, rockMat, NM), md = new THREE.Object3D();
      for (let i = 0; i < NM; i++) { const r = rects[i % 3]; const w = 18 + wrnd() * 42, h = 22 + wrnd() * 72; md.position.set(r[0] + wrnd() * (r[1] - r[0]), h / 2 - 2, r[2] + wrnd() * (r[3] - r[2])); md.rotation.y = wrnd() * 6; md.scale.set(w, h, w * (0.7 + wrnd() * 0.5)); md.updateMatrix(); ms.setMatrixAt(i, md.matrix); }
      ms.frustumCulled = false; scene.add(ms);
    }
    world.pois.push({ name: 'THE WASTES', pos: new THREE.Vector3(H + 420, 6, 0), desc: 'Irradiated badlands beyond New Chicago' });
  }

  // ════════════ NEW CHICAGO RIVER — through downtown, crossed by bridges ════════════
  {
    const RW = C.ROAD * 1.15;
    // central E-W road line, nudged off the spire plaza at z=0
    let zR = -H + 2 * C.CELL - C.ROAD / 2, best = 1e9;
    for (let i = 1; i < C.GRID; i++) { const z = -H + i * C.CELL - C.ROAD / 2; const d = Math.abs(z - C.CELL); if (d < best && Math.abs(z) > C.CELL * 0.6) { best = d; zR = z; } }
    const span = C.SPAN;
    // flowing water
    const wmat = new THREE.MeshStandardMaterial({ color: 0x0b2536, roughness: 0.07, metalness: 0.9, envMapIntensity: 1.4 });
    wmat.onBeforeCompile = (sh) => { sh.uniforms.uTime = world.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed.z += sin(position.x * 0.05 + uTime * 0.9) * 0.22;`); };
    const water = new THREE.Mesh(new THREE.PlaneGeometry(span, RW, 140, 2), wmat);
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0.07, zR); scene.add(water); world.raycastTargets.push(water);
    const crossings = []; for (let i = 1; i < C.GRID; i++) crossings.push(-H + i * C.CELL - C.ROAD / 2);
    // embankment walls between crossings (gaps left for the bridges)
    const bankMat = solid(0x232a36, 0.7, 0.2), bankGeo = [];
    const edges = [-span / 2, ...crossings, span / 2];
    for (let s = 0; s < edges.length - 1; s++) {
      let a = edges[s], b = edges[s + 1];
      if (s > 0) a += C.ROAD * 0.75; if (s < edges.length - 2) b -= C.ROAD * 0.75;
      if (b - a < 2) continue;
      for (const e of [-1, 1]) {
        const g = new THREE.BoxGeometry(b - a, 2.4, 1.3); g.translate((a + b) / 2, 0.4, zR + e * (RW / 2)); bankGeo.push(g);
        addCol(a, b, zR + e * (RW / 2) - 0.65, zR + e * (RW / 2) + 0.65, -1, 1.7);
      }
    }
    if (bankGeo.length) { const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(bankGeo), bankMat); m.frustumCulled = false; scene.add(m); }
    for (const e of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(span, 0.12, 0.14), glow(NEON.cyan, 0.7)); r.position.set(0, 1.6, zR + e * (RW / 2)); scene.add(r); }
    // bridges at each N-S crossing — walkable decks with rails + a glowing arch
    for (const cx of crossings) {
      const dW = C.ROAD, dD = RW + 5;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(dW, 0.5, dD), solid(0x2a3145, 0.5, 0.5));
      deck.position.set(cx, 0.55, zR); scene.add(deck);
      world.surfaces.push({ minX: cx - dW / 2, maxX: cx + dW / 2, minZ: zR - dD / 2, maxZ: zR + dD / 2, y: 0.8 });
      for (const e of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(dW, 0.7, 0.14), glow(NEON.magenta, 0.85)); rail.position.set(cx, 1.15, zR + e * (dD / 2 - 0.2)); scene.add(rail);
        addCol(cx - dW / 2, cx + dW / 2, zR + e * (dD / 2) - 0.15, zR + e * (dD / 2) + 0.15, 0.5, 2.2);
      }
      const arch = new THREE.Mesh(new THREE.TorusGeometry(RW * 0.55, 0.5, 6, 14, Math.PI), glow(NEON.cyan, 0.5));
      arch.rotation.y = Math.PI / 2; arch.position.set(cx, 0.4, zR); scene.add(arch);
    }
    world.pois.push({ name: 'NEW CHICAGO RIVER', pos: new THREE.Vector3(0, 1, zR), desc: 'The river through downtown — cross at the bridges' });
  }

  // ════════════ STREET CROWDS — pedestrians on the sidewalks ════════════
  {
    const prnd = mulberry32(C.SEED + 6161);
    const NPED = 48;
    const ped = new THREE.InstancedMesh(humanoidGeo(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.1 }), NPED);
    const pcol = new THREE.Color(), st = [];
    for (let i = 0; i < NPED; i++) {
      const gi = 1 + (prnd() * (C.GRID - 1) | 0);
      const roadP = -H + gi * C.CELL - C.ROAD / 2;
      const lane = roadP + (prnd() < 0.5 ? 1 : -1) * (C.ROAD / 2 + 1.6);   // sidewalk just off a road
      st.push({ axisX: prnd() < 0.5, lane, a: prnd() * 6, sp: (0.7 + prnd() * 0.8) * (prnd() < 0.5 ? -1 : 1), base: -H + prnd() * C.SPAN, range: 9 + prnd() * 16 });
      ped.setColorAt(i, pcol.setHSL(prnd(), 0.4, 0.5 + prnd() * 0.25));
    }
    ped.instanceColor.needsUpdate = true; ped.frustumCulled = false; scene.add(ped);
    const pd = new THREE.Object3D();
    world.updateFns.push((dt, t) => {
      for (let i = 0; i < NPED; i++) {
        const s = st[i]; s.a += dt * s.sp / 6; const off = Math.sin(s.a) * s.range, mv = Math.cos(s.a) * s.sp;
        const x = s.axisX ? s.base + off : s.lane, z = s.axisX ? s.lane : s.base + off;
        pd.position.set(x, Math.abs(Math.sin(s.a * 9)) * 0.05, z);
        pd.rotation.y = s.axisX ? (mv > 0 ? Math.PI / 2 : -Math.PI / 2) : (mv > 0 ? 0 : Math.PI);
        pd.updateMatrix(); ped.setMatrixAt(i, pd.matrix);
      }
      ped.instanceMatrix.needsUpdate = true;
    });
  }

  // ════════════ BLADE RUNNER STREET DRESSING — dense neon, steam, cross-cables ════════════
  {
    const srnd = mulberry32(C.SEED + 4747);
    // shared vertical neon sign textures (kana/kanji + brand homages)
    const mkSign = (lines, fg) => {
      const [c, ctx] = makeCanvas(128, 384);
      ctx.fillStyle = '#0a0712'; ctx.fillRect(0, 0, 128, 384);
      ctx.strokeStyle = fg; ctx.lineWidth = 7; ctx.strokeRect(9, 9, 110, 366);
      ctx.fillStyle = fg; ctx.shadowColor = fg; ctx.shadowBlur = 22; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const n = lines.length;
      lines.forEach((ln, i) => { ctx.font = `bold ${ln.length > 2 ? 44 : 78}px "Orbitron", "Hiragino Sans", sans-serif`; ctx.fillText(ln, 64, (i + 0.5) * (366 / n) + 9); });
      return canvasTexture(c);
    };
    const defs = [
      [['電', '気'], '#00f0ff'], [['酒'], '#ff2bd6'], [['麺', '屋'], '#ffb300'],
      [['ATARI'], '#53ffe9'], [['薬'], '#ff3355'], [['新', '世', '界'], '#9d4cff'],
      [['CASH'], '#3d7bff'], [['ラーメン'], '#ff2bd6'], [['東', '京'], '#00f0ff'],
      [['ネオ', 'バー'], '#ffb300'], [['カジノ'], '#ff3355'], [['OFF', 'WORLD'], '#53ffe9'],
    ];
    const tex = defs.map(([lines, fg]) => ({ mat: new THREE.MeshBasicMaterial({ map: mkSign(lines, fg), toneMapped: false, side: THREE.DoubleSide }), geos: [] }));
    for (const b of world.buildings) {
      if (b.h < 8 || b.glbTower) continue;
      const faces = [[b.w / 2, 0, 1, 0], [-b.w / 2, 0, -1, 0], [0, b.d / 2, 0, 1], [0, -b.d / 2, 0, -1]];
      const count = 1 + (srnd() * 3 | 0);
      for (let k = 0; k < count; k++) {
        if (srnd() > 0.72) continue;
        const [ox, oz, nx, nz] = faces[srnd() * 4 | 0];
        const sh = 2.4 + srnd() * 2.2, sw = sh * 0.32;
        const y = 3 + srnd() * Math.min(b.h - 5, 16);
        const along = (nx !== 0 ? (srnd() - 0.5) * Math.max(0.2, b.d - 2.5) : (srnd() - 0.5) * Math.max(0.2, b.w - 2.5));
        const px = b.x + ox + nx * 0.45 + (nx !== 0 ? 0 : along), pz = b.z + oz + nz * 0.45 + (nx !== 0 ? along : 0);
        const t = tex[srnd() * tex.length | 0];
        const g = new THREE.PlaneGeometry(sw, sh); g.rotateY(Math.atan2(nx, nz)); g.translate(px, y, pz); t.geos.push(g);
      }
    }
    for (const t of tex) if (t.geos.length) { const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(t.geos), t.mat); m.frustumCulled = false; scene.add(m); }

    // cross-street cables strung over the roads
    const wireGeo = [];
    for (let i = 0; i < 70; i++) {
      const gi = 1 + (srnd() * (C.GRID - 1) | 0), rp = -H + gi * C.CELL - C.ROAD / 2;
      const along = -H + srnd() * C.SPAN, y = 9 + srnd() * 16, span = C.ROAD + 7;
      const g = new THREE.CylinderGeometry(0.06, 0.06, span, 4);
      if (srnd() < 0.5) { g.rotateX(Math.PI / 2); g.translate(along, y, rp); }
      else { g.rotateZ(Math.PI / 2); g.translate(rp, y, along); }
      wireGeo.push(g);
    }
    if (wireGeo.length) { const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(wireGeo), new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.9, metalness: 0.2 })); m.frustumCulled = false; scene.add(m); }

    // drifting street steam from road vents (whitish haze, not additive)
    const spots = [];
    for (let i = 0; i < 40; i++) { const gi = 1 + (srnd() * (C.GRID - 1) | 0), rp = -H + gi * C.CELL - C.ROAD / 2, al = -H + srnd() * C.SPAN; spots.push(srnd() < 0.5 ? { x: al, z: rp } : { x: rp, z: al }); }
    const NS = 320, sp = new Float32Array(NS * 3), sb = [];
    for (let i = 0; i < NS; i++) { const s = spots[i % spots.length]; const bx = s.x + (srnd() - 0.5) * 3.5, bz = s.z + (srnd() - 0.5) * 3.5; sb.push({ x: bx, z: bz, ph: srnd(), sp: 0.25 + srnd() * 0.4, h: 7 + srnd() * 9 }); sp[i * 3] = bx; sp[i * 3 + 2] = bz; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const steam = new THREE.Points(sg, new THREE.PointsMaterial({ map: glowTexture(48, 'rgba(180,190,210,0.5)'), size: 6, transparent: true, opacity: 0.13, depthWrite: false, sizeAttenuation: true, color: 0x8893a8 }));
    steam.frustumCulled = false; scene.add(steam);
    world.updateFns.push((dt, t) => { const p = sg.attributes.position.array; for (let i = 0; i < NS; i++) { const b = sb[i]; p[i * 3 + 1] = ((t * b.sp + b.ph) % 1) * b.h; } sg.attributes.position.needsUpdate = true; });
  }

  // ════════════ CYBERPUNK SKYLINE — rooftop neon, aviation lights, screens, puddles ════════════
  {
    const crnd = mulberry32(C.SEED + 8181);
    const tall = world.buildings.filter(b => !b.arcade && b.h > 48);

    // ── red aviation warning lights blinking on every tall structure ──
    {
      const pts = [], ph = [];
      for (const b of tall) { pts.push(b.x, b.h + 1.5, b.z); ph.push(crnd() * 6); if (b.h > 90) { pts.push(b.x + b.w * 0.35, b.h + 1, b.z + b.d * 0.35); ph.push(crnd() * 6); } }
      const N = ph.length, pos = new Float32Array(pts), col = new Float32Array(N * 3);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTexture(32, 'rgba(255,80,80,1)'), size: 4.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
      m.frustumCulled = false; scene.add(m);
      world.updateFns.push((dt, t) => { for (let i = 0; i < N; i++) { const on = Math.sin(t * 2.4 + ph[i]) > 0 ? 1 : 0.12; col[i * 3] = on; col[i * 3 + 1] = on * 0.12; col[i * 3 + 2] = on * 0.12; } g.attributes.color.needsUpdate = true; });
    }

    // ── big rooftop neon (horizontal kanji + brand) ──
    {
      const mkRoof = (txt, fg) => {
        const [c, ctx] = makeCanvas(512, 128);
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = fg; ctx.shadowColor = fg; ctx.shadowBlur = 30; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 92px "Hiragino Sans", "Orbitron", sans-serif'; ctx.fillText(txt, 256, 66);
        return canvasTexture(c);
      };
      const defs = [['24時間営業', '#ff3355'], ['歌舞伎町', '#ff2bd6'], ['電脳市場', '#00f0ff'], ['営業中', '#ffb300'], ['新世界', '#9d4cff'], ['KIROSHI', '#53ffe9'], ['満員御礼', '#ff3355'], ['ARASAKA', '#3d7bff']];
      const tex = defs.map(([txt, fg]) => ({ mat: new THREE.MeshBasicMaterial({ map: mkRoof(txt, fg), transparent: true, toneMapped: false, side: THREE.DoubleSide }), geos: [] }));
      for (const b of tall) {
        if (crnd() > 0.5) continue;
        const w = Math.min(b.w, b.d) * (0.7 + crnd() * 0.3), h = w * 0.26;
        const dir = crnd() * 4 | 0, ry = dir * Math.PI / 2;
        const t = tex[crnd() * tex.length | 0];
        const g = new THREE.PlaneGeometry(w, h); g.rotateY(ry); g.translate(b.x, b.h + h / 2 + 0.5, b.z); t.geos.push(g);
      }
      for (const t of tex) if (t.geos.length) { const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(t.geos), t.mat); m.frustumCulled = false; scene.add(m); }
    }

    // ── a few huge vertical mega-screens on the tallest towers ──
    {
      const big = tall.filter(b => b.h > 80).sort((a, b) => b.h - a.h).slice(0, 6);
      for (const b of big) {
        const dir = crnd() * 4 | 0, nx = [1, -1, 0, 0][dir], nz = [0, 0, 1, -1][dir];
        const sw = Math.min(b.w, b.d) * 0.8, sh = Math.min(b.h * 0.5, 46);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: world.ledTex, toneMapped: false }));
        scr.position.set(b.x + nx * (b.w / 2 + 0.4), b.h * 0.55, b.z + nz * (b.d / 2 + 0.4));
        scr.rotation.y = Math.atan2(nx, nz); scene.add(scr);
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(sw + 1.2, sh + 1.2), glow(NEON.cyan, 0.5));
        frame.position.copy(scr.position).add(new THREE.Vector3(nx * -0.1, 0, nz * -0.1)); frame.rotation.y = scr.rotation.y; scene.add(frame);
      }
    }

    // ── sky searchlight shafts rising from rooftops ──
    {
      const beams = [];
      const hosts = tall.filter(b => b.h > 70).sort(() => crnd() - 0.5).slice(0, 9);
      for (const b of hosts) {
        const beam = new THREE.Mesh(new THREE.ConeGeometry(7, 320, 14, 1, true),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(pick(crnd, NEON_LIST)), transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        beam.position.set(b.x, b.h + 160, b.z); scene.add(beam);
        beams.push({ beam, ph: crnd() * 6 });
      }
      world.updateFns.push((dt, t) => { for (const o of beams) { o.beam.rotation.z = Math.sin(t * 0.15 + o.ph) * 0.12; o.beam.material.opacity = 0.04 + 0.025 * (0.5 + 0.5 * Math.sin(t * 0.6 + o.ph)); } });
    }

    // ── puddles — reflective patches mirroring the neon on the wet ground ──
    {
      const puddle = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14),
        new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.04, metalness: 0.98, envMapIntensity: 1.6 }), 140);
      const d = new THREE.Object3D();
      for (let i = 0; i < 140; i++) {
        d.position.set(-H + crnd() * C.SPAN, 0.03, -H + crnd() * C.SPAN);
        d.rotation.set(-Math.PI / 2, 0, crnd() * 6);
        d.scale.set(1.5 + crnd() * 4, 1 + crnd() * 3, 1);
        d.updateMatrix(); puddle.setMatrixAt(i, d.matrix);
      }
      puddle.frustumCulled = false; scene.add(puddle);
    }
  }

  // ════════════ WET-STREET POLISH — warm pools, god-rays, a parked spinner ════════════
  {
    const wrnd = mulberry32(C.SEED + 2929);
    // warm light pools spilling onto the pavement near storefronts
    {
      const tex = glowTexture(96, 'rgba(255,185,95,0.9)'); const geos = [];
      for (const b of world.buildings) {
        if (b.h < 7 || b.glbTower || wrnd() > 0.4) continue;
        const f = [[b.w / 2, 0, 1, 0], [-b.w / 2, 0, -1, 0], [0, b.d / 2, 0, 1], [0, -b.d / 2, 0, -1]][wrnd() * 4 | 0];
        const px = b.x + f[0] + f[2] * (1.4 + wrnd() * 2.2), pz = b.z + f[1] + f[3] * (1.4 + wrnd() * 2.2), r = 2.5 + wrnd() * 3.5;
        const g = new THREE.PlaneGeometry(r * 2, r * 2); g.rotateX(-Math.PI / 2); g.translate(px, 0.05, pz); geos.push(g);
      }
      if (geos.length) { const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb060, toneMapped: false })); m.frustumCulled = false; scene.add(m); }
    }
    // god-ray shafts under the streetlights, catching the steam
    {
      const sl = world._streetLights, geos = [];
      if (sl && sl.cols.length) { const step = Math.max(1, (sl.cols.length / 60) | 0); for (let i = 0; i < sl.cols.length; i += step) { const c = sl.cols[i]; const cone = new THREE.ConeGeometry(2.6, 9, 12, 1, true); cone.translate(c.x, 4.5, c.z); geos.push(cone); } }
      if (geos.length) { const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.frustumCulled = false; scene.add(m); }
    }
    // a parked NCPD spinner, hovering over a central avenue intersection
    {
      const sx = -H + 5 * C.CELL - C.ROAD / 2, sz = -H + 6 * C.CELL - C.ROAD / 2;
      const sp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.15, 4.2, 6, 12), solid(0x0f1320, 0.3, 0.75)); body.rotation.z = Math.PI / 2; body.scale.set(1, 1, 0.66); sp.add(body);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x16203a, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.55 })); canopy.position.set(0.7, 0.65, 0); sp.add(canopy);
      for (const e of [-1, 1]) {
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.5, 12), solid(0x090b12, 0.3, 0.75)); pod.rotation.x = Math.PI / 2; pod.position.set(-1.7, -0.25, e * 1.55); sp.add(pod);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.12, 8, 18), glow(NEON.cyan, 1.3)); ring.rotation.y = Math.PI / 2; ring.position.set(-1.7, -0.25, e * 1.55); sp.add(ring);
      }
      const side = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 0.06), glow(NEON.cyan, 1.1)); side.position.set(0, 0.15, 0.78); sp.add(side);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.5), glow(NEON.red, 1.0)); bar.position.set(0.5, 1.05, 0); sp.add(bar);
      sp.position.set(sx, 2.4, sz); sp.rotation.y = 0.5; scene.add(sp);
      world.pois.push({ name: 'NCPD SPINNER', pos: new THREE.Vector3(sx, 1, sz), desc: 'A parked police spinner, hovering' });
      world.updateFns.push((dt, t) => { sp.position.y = 2.4 + Math.sin(t * 1.4) * 0.14; bar.material.color.setHex(Math.sin(t * 7) > 0 ? 0xff2233 : 0x2244ff); });
    }
  }

  world._finishTrees();
}
