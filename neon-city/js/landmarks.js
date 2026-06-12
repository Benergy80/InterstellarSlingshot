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
import { C, NEON, NEON_LIST, mulberry32, pick, clamp, makeCanvas, canvasTexture, glowTexture, hexCss } from './config.js';

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
  world._finishTrees();
}
