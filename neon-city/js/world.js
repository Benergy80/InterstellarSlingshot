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

// ════════════════ SIX DISTRICTS ════════════════
// Center 3×3 = Uptown Core; the rest of the grid splits into five 72°
// wedges. Each config drives heights, window density/palette/flicker,
// curb color, sign pool, and storefront probability.
export const DISTRICTS = {
  CORE:    { key: 'CORE', name: 'THE LOOP', short: 'LOOP', curb: 0x00f0ff, accent: 0x00f0ff, h: [90, 205], lots: [1, 2], fp: [22, 46], litP: 0.38, warm: 0.16, flick: 0.6, store: 0.25, tint: 'rgba(0,240,255,0.10)' },
  MARKET:  { key: 'MARKET', name: 'MAG MILE MARKET', short: 'MAG MILE', curb: 0xff2bd6, accent: 0xffb300, h: [10, 30], lots: [3, 5], fp: [11, 24], litP: 0.52, warm: 0.55, flick: 1.7, store: 0.95, tint: 'rgba(255,43,214,0.10)' },
  FOUNDRY: { key: 'FOUNDRY', name: 'BACK OF THE YARDS', short: 'YARDS', curb: 0xffb300, accent: 0xffb300, h: [16, 58], lots: [2, 3], fp: [16, 32], litP: 0.2, warm: 0.8, flick: 0.9, store: 0.2, tint: 'rgba(255,179,0,0.09)' },
  STACKS:  { key: 'STACKS', name: 'WRIGLEYVILLE STACKS', short: 'WRIGLEY', curb: 0x9d4cff, accent: 0x9d4cff, h: [30, 85], lots: [2, 4], fp: [14, 28], litP: 0.5, warm: 0.75, flick: 0.7, store: 0.45, tint: 'rgba(157,76,255,0.10)' },
  PLAZA:   { key: 'PLAZA', name: 'CORPORATE PLAZA', short: 'PLAZA', curb: 0x3d7bff, accent: 0x3d7bff, h: [55, 130], lots: [1, 3], fp: [18, 36], litP: 0.42, warm: 0.1, flick: 0.5, store: 0.3, tint: 'rgba(61,123,255,0.10)' },
  OLD:     { key: 'OLD', name: 'OLD TOWN', short: 'OLD TOWN', curb: 0xff3355, accent: 0x53ffe9, h: [10, 42], lots: [3, 5], fp: [11, 22], litP: 0.3, warm: 0.6, flick: 2.4, store: 0.7, tint: 'rgba(255,51,85,0.09)' },
};
const CENTER_B = (C.GRID - 1) / 2;
// blocks handed to landmarks.js: Grant Park, Holy Name cathedral, City Hall,
// the Yards fusion plant, and a row of lakefront suburb homes
const RESERVED = {
  '2,5': 'park', '3,8': 'cathedral', '6,1': 'cityhall', '9,6': 'plant', '7,2': 'models',
  '1,0': 'suburb', '2,0': 'suburb', '3,0': 'suburb',
};
export function districtOf(bx, bz) {
  if (Math.max(Math.abs(bx - CENTER_B), Math.abs(bz - CENTER_B)) <= 1) return DISTRICTS.CORE;
  const a = Math.atan2(bz - CENTER_B, bx - CENTER_B) * 180 / Math.PI; // 0° = east (+x, spaceport side)
  if (a >= -36 && a < 36) return DISTRICTS.FOUNDRY;    // east, toward the spaceport gate
  if (a >= 36 && a < 108) return DISTRICTS.MARKET;     // south band (arcade strip lives here)
  if (a >= 108) return DISTRICTS.OLD;                  // southwest
  if (a < -108) return DISTRICTS.STACKS;               // northwest
  return DISTRICTS.PLAZA;                              // north
}

export function buildWorld(scene, renderer) {
  const rnd = mulberry32(C.SEED);
  const world = {
    colliders: [],     // {minX,maxX,minZ,maxZ[,minY,maxY,enabled]} — block XZ motion
    surfaces: [],      // {minX,maxX,minZ,maxZ,y} — walkable elevated floors (y may mutate)
    pois: [],          // {name, pos:Vector3, desc}
    interactables: [], // {label, pos, radius, action()}
    uTime: { value: 0 },
    flicker: { value: 1 },
    updateFns: [],
    raycastTargets: [],   // meshes lasers can hit
    interiors: [],        // filled by interiors.js — {bounds, colliders, surfaces, group, ...}
    reserved: {},         // landmark blocks (park/cathedral/cityhall/plant/suburb)
    flagships: [],        // skylift towers {b, roofY}
    windowHitVecs: Array.from({ length: 16 }, () => new THREE.Vector3(0, -9999, 0)),
    activeInterior: null,
    update(dt, t, playerPos) {
      if (playerPos) {
        let act = null;
        for (const it of this.interiors) {
          const b = it.bounds;
          if (playerPos.x > b.minX - 2 && playerPos.x < b.maxX + 2 &&
              playerPos.z > b.minZ - 2 && playerPos.z < b.maxZ + 2) { act = it; break; }
        }
        this.activeInterior = act;
        for (const it of this.interiors) {
          const b = it.bounds;
          const dx = playerPos.x - (b.minX + b.maxX) / 2, dz = playerPos.z - (b.minZ + b.maxZ) / 2;
          it.group.visible = (dx * dx + dz * dz) < 90 * 90;
        }
        // one shared fill light follows you into whichever interior is active
        if (this.interiorLight) {
          this.interiorLight.visible = !!act;
          if (act) {
            this.interiorLight.position.set(playerPos.x, playerPos.y + 2.2, playerPos.z);
          }
        }
      }
      for (const f of this.updateFns) f(dt, t, playerPos);
    },
  };
  world.districtOf = districtOf;
  world.districtAt = (x, z) => {
    if (x > C.HALF) return { key: 'PORT', name: 'GAGARIN SPACEPORT', short: 'SPACEPORT' };
    const bx = clamp(Math.floor((x + C.HALF) / C.CELL), 0, C.GRID - 1);
    const bz = clamp(Math.floor((z + C.HALF) / C.CELL), 0, C.GRID - 1);
    return districtOf(bx, bz);
  };

  // Walkable height under (x,z) given current player y — picks the highest
  // surface at or below (py + step). Ground level 0 everywhere in-bounds.
  const scanSurfaces = (list, x, z, py, h) => {
    for (const s of list) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
        const sy = (typeof s.y === 'function') ? s.y(x, z) : s.y;
        if (sy <= py + 1.1 && sy > h) h = sy;
      }
    }
    return h;
  };
  world.groundHeightAt = (x, z, py = 0) => {
    let h = scanSurfaces(world.surfaces, x, z, py, 0);
    if (world.activeInterior) h = scanSurfaces(world.activeInterior.surfaces, x, z, py, h);
    return h;
  };

  const addBox = (minX, maxX, minZ, maxZ) => world.colliders.push({ minX, maxX, minZ, maxZ });

  // Is a shaft footprint clear of solid colliders and the monorail beam bands?
  world.shaftClear = (x, z, half) => {
    for (const c of world.colliders) {
      if (c.enabled !== undefined) continue;
      if (x + half + 0.6 > c.minX && x - half - 0.6 < c.maxX &&
          z + half + 0.6 > c.minZ && z - half - 0.6 < c.maxZ) return false;
    }
    const rails = [4, 7, 2, 9].map(i => -C.HALF + i * C.CELL - C.ROAD / 2);
    for (const r of rails) {
      const off = C.ROAD / 2 + 1.2;
      for (const line of [r - off, r + off]) {
        if (Math.abs(x - line) < half + 2.6 || Math.abs(z - line) < half + 2.6) {
          // only matters near the actual ring sides — cheap conservative test
          if (Math.abs(x - line) < half + 2.6 && Math.abs(z) < C.HALF) return false;
          if (Math.abs(z - line) < half + 2.6 && Math.abs(x) < C.HALF) return false;
        }
      }
    }
    return true;
  };

  // ════════════════ GATED ELEVATORS (floor stops, doors, no clipping) ════════════════
  // A cab that dwells at discrete stops; sliding door panel per stop; the
  // shaft's open side is blocked by per-stop gate colliders unless the cab
  // is parked there with doors open — you can never step into the void or
  // be pushed through a slab.
  world.makeElevator = ({ x, z, stops, gate, size = 3.4, color = 0x00f0ff, name = 'ELEVATOR', sets = null, parent = null }) => {
    const S = sets || { surfaces: world.surfaces, colliders: world.colliders, interactables: world.interactables };
    const half = size / 2;
    const gx = gate.dx, gz = gate.dz;          // unit direction of the opening
    const px = -gz, pz = gx;                   // axis the door slides along
    const elev = {
      x, z, stops, idx: 0, y: stops[0], target: 0,
      phase: 'idle', doorK: 0, speed: 11, name,
    };

    const grp = new THREE.Group();
    const solidMat = new THREE.MeshStandardMaterial({ color: 0x232c44, roughness: 0.35, metalness: 0.7 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x9fe2ff, transparent: true, opacity: 0.2, roughness: 0.12, metalness: 0.3,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.05), toneMapped: false });

    // cab — floor, ceiling, three glass sides (gate side open), glowing rim
    const cab = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(size, 0.3, size), solidMat);
    floor.position.y = 0.03;
    cab.add(floor);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(size, 0.18, size), solidMat);
    ceil.position.y = 2.95;
    cab.add(ceil);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(size + 0.06, 0.08, size + 0.06), trimMat);
    rim.position.y = 0.2;
    cab.add(rim);
    for (const [wx, wz] of [[-gx, -gz], [px, pz], [-px, -pz]]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(size - 0.1, 2.7), glassMat);
      wall.position.set(wx * (half - 0.05), 1.55, wz * (half - 0.05));
      wall.lookAt(cab.position.x, 1.55, cab.position.z);
      cab.add(wall);
    }
    const ceilLight = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.6, size * 0.6),
      new THREE.MeshBasicMaterial({ color: 0xfff3da, toneMapped: false }));
    ceilLight.rotation.x = Math.PI / 2;
    ceilLight.position.y = 2.85;
    cab.add(ceilLight);
    cab.position.set(x, elev.y, z);
    grp.add(cab);

    // guide rails up the two rear corners
    const topY = stops[stops.length - 1] + 3.4;
    for (const e of [1, -1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, topY - stops[0] + 1, 0.18), trimMat);
      rail.position.set(x - gx * half + px * half * e, (topY + stops[0]) / 2, z - gz * half + pz * half * e);
      grp.add(rail);
    }

    // per-stop door panel + frame + gate collider
    const panels = [];
    stops.forEach((sy, k) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(
        Math.abs(px) * (size + 0.3) + Math.abs(gx) * 0.22,
        0.22,
        Math.abs(pz) * (size + 0.3) + Math.abs(gz) * 0.22
      ), trimMat);
      frame.position.set(x + gx * (half + 0.12), sy + 2.85, z + gz * (half + 0.12));
      grp.add(frame);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(
        Math.abs(px) * (size - 0.25) + Math.abs(gx) * 0.14,
        2.62,
        Math.abs(pz) * (size - 0.25) + Math.abs(gz) * 0.14
      ), solidMat);
      panel.position.set(x + gx * (half + 0.12), sy + 1.45, z + gz * (half + 0.12));
      grp.add(panel);
      panels.push({ panel, sy, baseX: panel.position.x, baseZ: panel.position.z });
      S.colliders.push({
        minX: x + gx * half - (Math.abs(px) * half + 0.3), maxX: x + gx * half + (Math.abs(px) * half + 0.3),
        minZ: z + gz * half - (Math.abs(pz) * half + 0.3), maxZ: z + gz * half + (Math.abs(pz) * half + 0.3),
        minY: sy - 0.6, maxY: sy + 2.8,
        enabled: () => !(elev.idx === k && elev.phase === 'idle' && elev.doorK > 0.65),
      });
    });
    // gate side blocked at every height while the cab is anywhere but parked
    S.colliders.push({
      minX: x + gx * half - (Math.abs(px) * half + 0.3), maxX: x + gx * half + (Math.abs(px) * half + 0.3),
      minZ: z + gz * half - (Math.abs(pz) * half + 0.3), maxZ: z + gz * half + (Math.abs(pz) * half + 0.3),
      minY: stops[0] - 0.5, maxY: topY,
      enabled: () => elev.phase !== 'idle',
    });
    // three solid shaft sides, full height
    const sideDefs = [[-gx, -gz], [px, pz], [-px, -pz]];
    for (const [wx, wz] of sideDefs) {
      S.colliders.push({
        minX: x + wx * half - (Math.abs(wz) * half + 0.25), maxX: x + wx * half + (Math.abs(wz) * half + 0.25),
        minZ: z + wz * half - (Math.abs(wx) * half + 0.25), maxZ: z + wz * half + (Math.abs(wx) * half + 0.25),
        minY: stops[0] - 0.5, maxY: topY,
      });
    }
    // cab floor — walkable, moves
    S.surfaces.push({
      minX: x - half + 0.05, maxX: x + half - 0.05,
      minZ: z - half + 0.05, maxZ: z + half - 0.05,
      y: () => elev.y + 0.18,
    });
    (parent || scene).add(grp);
    elev.group = grp;

    elev.send = (k) => {
      k = clamp(k, 0, stops.length - 1);
      if (k === elev.idx && elev.phase === 'idle') return;
      elev.target = k;
      if (elev.phase === 'idle') elev.phase = 'closing';
    };

    let near = false;
    world.updateFns.push((dt, t, playerPos) => {
      if (playerPos) {
        const dx = playerPos.x - x, dz = playerPos.z - z;
        const dy = (playerPos.y - 1.75) - elev.y;
        near = (dx * dx + dz * dz) < 30 && dy > -2 && dy < 3;
      }
      switch (elev.phase) {
        case 'idle': {
          const want = near ? 1 : 0;
          elev.doorK += clamp(want - elev.doorK, -dt * 2.6, dt * 2.6);
          break;
        }
        case 'closing':
          elev.doorK -= dt * 2.6;
          if (elev.doorK <= 0) { elev.doorK = 0; elev.phase = 'moving'; }
          break;
        case 'moving': {
          const ty = stops[elev.target];
          const dy = ty - elev.y;
          const step = clamp(dy, -elev.speed * dt, elev.speed * dt);
          elev.y += step;
          if (Math.abs(ty - elev.y) < 0.02) { elev.y = ty; elev.idx = elev.target; elev.phase = 'opening'; }
          break;
        }
        case 'opening':
          elev.doorK += dt * 2.6;
          if (elev.doorK >= 1) { elev.doorK = 1; elev.phase = 'idle'; }
          break;
      }
      cab.position.y = elev.y;
      // animate the panel at the cab's floor; keep all others shut
      for (let k = 0; k < panels.length; k++) {
        const open = (k === elev.idx && elev.phase !== 'moving') ? elev.doorK : 0;
        const off = open * (size - 0.4);
        panels[k].panel.position.x = panels[k].baseX + px * off;
        panels[k].panel.position.z = panels[k].baseZ + pz * off;
      }
    });

    const floorOf = (feetY) => {
      let best = 0, bd = 1e9;
      stops.forEach((sy, k) => { const d = Math.abs(sy - feetY); if (d < bd) { bd = d; best = k; } });
      return bd < 2.4 ? best : -1;
    };
    S.interactables.push({
      pos: cab.position, radius: half + 2.8, horizontal: true,
      label: () => {
        const feetY = elev._feetY;
        if (feetY === undefined) return null;
        const onCab = Math.abs(feetY - (elev.y + 0.18)) < 1.2;
        if (onCab && elev.phase === 'idle') {
          const next = (elev.idx + 1) % stops.length;
          return stops.length === 2
            ? (elev.idx === 0 ? `${name} ▲` : `${name} ▼`)
            : `${name} → ${next === 0 ? 'GROUND' : 'FLOOR ' + next}`;
        }
        const f = floorOf(feetY);
        if (f >= 0 && f !== elev.idx && elev.phase === 'idle') return `CALL ${name}`;
        return null;
      },
      action: () => {
        const feetY = elev._feetY;
        if (feetY === undefined) return;
        const onCab = Math.abs(feetY - (elev.y + 0.18)) < 1.2;
        if (onCab) elev.send((elev.idx + 1) % stops.length);
        else {
          const f = floorOf(feetY);
          if (f >= 0) elev.send(f);
        }
      },
    });
    // the interactable needs the caller's feet height — player feeds it
    world.updateFns.push((dt, t, playerPos) => {
      if (playerPos) elev._feetY = playerPos.y - 1.75;
    });

    return elev;
  };

  // ─────────────────────────── LIGHTING ───────────────────────────
  const hemi = new THREE.HemisphereLight(0x564397, 0x16102a, 0.92);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fb4ff, 0.5);
  moon.position.set(-300, 500, -200);
  scene.add(moon);
  world.hemi = hemi;
  // ── day/night cycle (8 min) with a large sun + moon ──
  world.dayNight = { k: 0 };   // 0 = midnight, 1 = noon
  {
    const sunTex = glowTexture(128, 'rgba(255,225,170,1)');
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: 0xffe2a8, transparent: true, fog: false, depthWrite: false }));
    sun.scale.set(26000, 26000, 1);
    scene.add(sun);
    const [mc, mctx2] = makeCanvas(128, 128);
    const mg = mctx2.createRadialGradient(64, 64, 6, 64, 64, 62);
    mg.addColorStop(0, '#e8ecf4'); mg.addColorStop(0.85, '#b9c2d4'); mg.addColorStop(1, 'rgba(185,194,212,0)');
    mctx2.fillStyle = mg; mctx2.beginPath(); mctx2.arc(64, 64, 62, 0, Math.PI * 2); mctx2.fill();
    mctx2.fillStyle = 'rgba(120,130,150,0.55)';
    const mr = mulberry32(5);
    for (let i = 0; i < 12; i++) { mctx2.beginPath(); mctx2.arc(20 + mr() * 88, 20 + mr() * 88, 3 + mr() * 9, 0, Math.PI * 2); mctx2.fill(); }
    const moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(mc), transparent: true, fog: false, depthWrite: false }));
    moonSpr.scale.set(15000, 15000, 1);
    scene.add(moonSpr);
    const DAY = 480;             // seconds per full cycle
    const nightBg = new THREE.Color(C.FOG_COLOR), dayBg = new THREE.Color(0x7e96bd);
    const tmpC = new THREE.Color();
    world.updateFns.push((dt, t) => {
      const a = (t / DAY) * Math.PI * 2 - Math.PI / 2;   // start at midnight
      const elev = Math.sin(a);
      const k = clamp(elev * 1.6 + 0.5, 0, 1);           // day factor
      world.dayNight.k = k;
      sun.position.set(Math.cos(a) * 90000, Math.sin(a) * 90000, -28000);
      moonSpr.position.set(-Math.cos(a) * 90000, -Math.sin(a) * 90000, 30000);
      sun.material.opacity = clamp(elev * 3 + 0.4, 0, 1);
      moonSpr.material.opacity = clamp(-elev * 3 + 0.4, 0.0, 1);
      hemi.intensity = 0.92 + k * 1.25;
      moon.intensity = 0.5 + k * 0.9;
      moon.color.setHex(k > 0.4 ? 0xfff1d0 : 0x8fb4ff);
      moon.position.set(Math.cos(a) * 300, Math.max(140, Math.sin(a) * 500), -200);
      tmpC.lerpColors(nightBg, dayBg, k);
      if (scene.background && scene.background.isColor) scene.background.copy(tmpC);
      if (scene.fog) scene.fog.color.copy(tmpC);
    });
    world.sunRef = sun;
  }

  // fill light for enterable interiors — off until you step inside one
  const interiorLight = new THREE.PointLight(0xbfd9ff, 26, 34, 1.6);
  interiorLight.visible = false;
  scene.add(interiorLight);
  world.interiorLight = interiorLight;

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
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0.15 });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(140000, 32, 20), skyMat);
    sky.renderOrder = -10;
    scene.add(sky);
    // the mothergame's Hubble Ultra Deep Field skybox, planetside
    new THREE.TextureLoader().load('../images/hubble_ultra_deep_field_high_rez_edit1.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(2, 1);
      skyMat.map = t;
      skyMat.color = new THREE.Color(0.78, 0.8, 0.9);   // dim + 60% opacity, far layer
      skyMat.needsUpdate = true;
    });

    // Stars — upper hemisphere only
    const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, e = 0.12 + rnd() * 1.35, r = 120000;
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
      size: 2.6, sizeAttenuation: false, vertexColors: true, fog: false,
      transparent: true, opacity: 0.85, depthWrite: false,
    }));
    stars.renderOrder = -9;
    scene.add(stars);

    // white cloud layer (the mothergame's cloud skybox) — drifts in while raining
    const cloudMat = new THREE.MeshBasicMaterial({
      side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0,
      color: new THREE.Color(0.85, 0.88, 0.98),
    });
    {
      // procedural soft cloud bank (the repo has no real cloud photo —
      // IMG_FD98… turned out to be a phone screenshot of the game)
      const [cc, cctx] = makeCanvas(512, 256);
      cctx.fillStyle = '#0a0d16';
      cctx.fillRect(0, 0, 512, 256);
      const crnd = mulberry32(77);
      for (let i = 0; i < 150; i++) {
        const x = crnd() * 512, y = 50 + crnd() * 160, r = 26 + crnd() * 72;
        const g2 = cctx.createRadialGradient(x, y, 0, x, y, r);
        const a = 0.16 + crnd() * 0.24;
        g2.addColorStop(0, `rgba(225,230,242,${a})`);
        g2.addColorStop(1, 'rgba(225,230,242,0)');
        cctx.fillStyle = g2;
        cctx.fillRect(x - r, y - r, r * 2, r * 2);
        if (x < 100) { cctx.save(); cctx.translate(512, 0); cctx.fillRect(x - r, y - r, r * 2, r * 2); cctx.restore(); }
      }
      const t = canvasTexture(cc, { repeat: [3, 1] });
      cloudMat.map = t;
      cloudMat.needsUpdate = true;
    }
    // constant low-opacity atmosphere haze — separates building silhouettes
    // from the deep-field backdrop at the horizon
    {
      const [ac2, actx2] = makeCanvas(8, 256);
      const ag = actx2.createLinearGradient(0, 256, 0, 0);
      ag.addColorStop(0, 'rgba(116,134,178,0.85)');
      ag.addColorStop(0.35, 'rgba(96,112,158,0.38)');
      ag.addColorStop(0.7, 'rgba(80,96,140,0.08)');
      ag.addColorStop(1, 'rgba(80,96,140,0)');
      actx2.fillStyle = ag;
      actx2.fillRect(0, 0, 8, 256);
      const hazeMat = new THREE.MeshBasicMaterial({
        map: canvasTexture(ac2), side: THREE.BackSide, fog: false,
        depthWrite: false, transparent: true, opacity: 0.5,
      });
      const haze = new THREE.Mesh(new THREE.SphereGeometry(120000, 28, 16), hazeMat);
      haze.renderOrder = -9;
      scene.add(haze);
    }
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(130000, 28, 16), cloudMat);
    clouds.renderOrder = 0;          // in front of the deep layers, like the boss dome
    clouds.frustumCulled = false;
    scene.add(clouds);
    world.cloudMat = cloudMat;
    // nebula-style particle cloud bank — the mothergame's technique
    // (createNebula: ~1200 vertex-colored points, additive, soft sprites)
    {
      const N = 1100, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      const crnd2 = mulberry32(31337);
      const blobs = [];
      for (let b = 0; b < 9; b++) {
        blobs.push({
          x: (crnd2() - 0.5) * 2400, y: 380 + crnd2() * 320, z: (crnd2() - 0.5) * 2400,
          r: 220 + crnd2() * 380,
        });
      }
      for (let i = 0; i < N; i++) {
        const b = blobs[(crnd2() * blobs.length) | 0];
        const a = crnd2() * Math.PI * 2, e = (crnd2() - 0.5) * Math.PI;
        const r = Math.pow(crnd2(), 0.5) * b.r;
        pos[i * 3] = b.x + Math.cos(a) * Math.cos(e) * r * 1.6;
        pos[i * 3 + 1] = b.y + Math.sin(e) * r * 0.38;
        pos[i * 3 + 2] = b.z + Math.sin(a) * Math.cos(e) * r * 1.6;
        const w = 0.75 + crnd2() * 0.25;
        col[i * 3] = w; col[i * 3 + 1] = w * (0.92 + crnd2() * 0.08); col[i * 3 + 2] = w;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pm = new THREE.PointsMaterial({
        map: glowTexture(128, 'rgba(235,240,250,1)'),
        size: 210, sizeAttenuation: true, vertexColors: true,
        transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false,
      });
      const puffs = new THREE.Points(pg, pm);
      puffs.frustumCulled = false;
      puffs.renderOrder = -1;
      scene.add(puffs);
      world.cloudPuffs = pm;
      world.updateFns.push((dt) => { puffs.rotation.y += dt * 0.0035; });
    }
    world.updateFns.push((dt, t, playerPos) => {
      clouds.rotation.y += dt * 0.004;
      if (playerPos) clouds.position.set(playerPos.x, 0, playerPos.z);  // always envelops the player
    });

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
    let ci = 0;
    for (let bx = 0; bx < C.GRID; bx++) for (let bz = 0; bz < C.GRID; bz++) {
      const x0 = -H + bx * C.CELL + C.ROAD / 2, z0 = -H + bz * C.CELL + C.ROAD / 2;
      const col = new THREE.Color(districtOf(bx, bz).curb).multiplyScalar(0.55);
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
  function makeBuildingMaterial(brightness) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x171a26, roughness: 0.48, metalness: 0.42, envMapIntensity: 0.5,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = world.uTime;
      shader.uniforms.uBright = { value: brightness };
      shader.uniforms.uHits = { value: world.windowHitVecs };
      world._buildingShader = shader;
      shader.vertexShader = `
        attribute float aSeed;
        attribute vec3 aTuning;   // per-district: (lit density, warm ratio, flicker boost)
        varying vec2 vBoxUv;
        varying float vSeed;
        varying float vSideMask;
        varying float vBH;
        varying vec3 vTuning;
        varying vec3 vWorldPos;
      ` + shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec3 iS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        float faceW = abs(normal.x) > 0.5 ? iS.z : iS.x;
        vBoxUv = vec2(uv.x * faceW, uv.y * iS.y);
        vSideMask = 1.0 - step(0.5, abs(normal.y));
        vSeed = aSeed;
        vBH = iS.y;
        vTuning = aTuning;
        vWorldPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
      `);
      shader.fragmentShader = `
        uniform float uTime;
        uniform float uBright;
        varying vec2 vBoxUv;
        varying float vSeed;
        varying float vSideMask;
        varying float vBH;
        varying vec3 vTuning;
        varying vec3 vWorldPos;
        uniform vec3 uHits[16];
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
            float lit = step(1.0 - vTuning.x, h);
            float hc = nhash(id * 1.7 + vSeed * 7.3);
            vec3 warm = vec3(1.0, 0.72, 0.38);
            vec3 cool = vec3(0.45, 0.83, 1.0);
            vec3 tealc = vec3(0.32, 1.0, 0.86);
            float wThr = vTuning.y;
            vec3 wcol = hc < wThr ? warm : (hc < wThr + (1.0 - wThr) * 0.78 ? cool : tealc);
            float vary = 0.35 + 0.65 * nhash(id * 2.3 + vSeed * 3.1);  // per-window brightness spread
            float fl = nhash(id + floor(uTime * 1.7) + vSeed);
            float flicker = mix(1.0, step(0.22, fl), step(1.0 - 0.07 * vTuning.z, nhash(id * 3.1 + vSeed)));
            float ground = step(5.5, vBoxUv.y);
            float topFade = 1.0 - smoothstep(vBH - 2.0, vBH, vBoxUv.y);
            float intact = 1.0;
            for (int hi = 0; hi < 16; hi++) {
              intact *= 1.0 - step(distance(vWorldPos, uHits[hi]), 1.5);
            }
            totalEmissiveRadiance += inWin * lit * vary * flicker * wcol * uBright * vSideMask * ground * topFade * intact;
            diffuseColor.rgb *= mix(0.45, 1.0, intact);
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

  const districtBlocks = {};   // key -> [{bx,bz,cx,cz}]
  for (let bx = 0; bx < C.GRID; bx++) for (let bz = 0; bz < C.GRID; bz++) {
    const x0 = -H + bx * C.CELL + C.ROAD / 2;
    const z0 = -H + bz * C.CELL + C.ROAD / 2;
    const cx = x0 + C.BLOCK / 2, cz = z0 + C.BLOCK / 2;
    const isCenter = (bx === CENTER && bz === CENTER);
    const D = districtOf(bx, bz);
    (districtBlocks[D.key] = districtBlocks[D.key] || []).push({ bx, bz, cx, cz });
    if (isCenter) continue;   // Spire + plaza handled separately

    const isArcade = (D === DISTRICTS.MARKET && bz >= C.GRID - 2);
    const rkey = RESERVED[`${bx},${bz}`];
    if (rkey) {
      world.reserved[rkey] = world.reserved[rkey] || [];
      world.reserved[rkey].push({ bx, bz, x0, z0, cx, cz });
      continue;   // landmarks.js builds these blocks
    }
    const lots = D.lots[0] + ((rnd() * (D.lots[1] - D.lots[0] + 1)) | 0);

    // subdivide block into lots (simple scatter, district footprint range)
    for (let l = 0; l < lots; l++) {
      const w = D.fp[0] + rnd() * (D.fp[1] - D.fp[0]);
      const d = D.fp[0] + rnd() * (D.fp[1] - D.fp[0]);
      const px = x0 + 4 + w / 2 + rnd() * Math.max(1, C.BLOCK - w - 8);
      const pz = z0 + 4 + d / 2 + rnd() * Math.max(1, C.BLOCK - d - 8);
      let h = D.h[0] + rnd() * (D.h[1] - D.h[0]);
      if (isArcade) h = 11 + rnd() * 18;
      buildings.push({ x: px, z: pz, w, d, h, dk: D.key, D, arcade: isArcade });
    }
  }
  world.buildings = buildings;


  // Instance everything (tiers for variety: tall buildings get a set-back top)
  {
    const items = [];
    for (const b of buildings) {
      items.push({ x: b.x, z: b.z, w: b.w, d: b.d, y0: 0, h: b.h, seed: rnd() * 100, D: b.D });
      if (b.h > 70 && rnd() < 0.7) {
        const w2 = b.w * (0.5 + rnd() * 0.25), d2 = b.d * (0.5 + rnd() * 0.25), h2 = b.h * (0.25 + rnd() * 0.3);
        items.push({ x: b.x, z: b.z, w: w2, d: d2, y0: b.h, h: h2, seed: rnd() * 100, D: b.D });
        b.t2 = { w2, d2, h2 };
        if (rnd() < 0.5) towerTrims.push({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, accent: b.D.accent });
      } else if (b.h > 110) {
        towerTrims.push({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, accent: b.D.accent });
      }
      // collider — keep the ref so interiors can replace it with walls
      const col = { minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, minY: 0, maxY: b.h + (b.t2 ? 0 : 0.0) };
      b.collider = col;
      world.colliders.push(col);
      // storefront strip + sign spots on faces toward roads
      if (b.arcade || rnd() < b.D.store) storefronts.push(b);
      const nSigns = b.arcade ? 4 : (b.D === DISTRICTS.MARKET || b.D === DISTRICTS.OLD ? 3 : (rnd() < 0.75 ? 2 : 1));
      for (let s = 0; s < nSigns; s++) {
        const side = (rnd() * 4) | 0;
        const sh = 6 + rnd() * Math.min(b.h - 10, 26);
        const off = (rnd() - 0.5) * 0.5;
        if (side === 0) signSpots.push({ x: b.x + b.w / 2 + 0.35, y: sh, z: b.z + off * b.d, rotY: Math.PI / 2, arcade: b.arcade, dk: b.dk });
        if (side === 1) signSpots.push({ x: b.x - b.w / 2 - 0.35, y: sh, z: b.z + off * b.d, rotY: -Math.PI / 2, arcade: b.arcade, dk: b.dk });
        if (side === 2) signSpots.push({ x: b.x + off * b.w, y: sh, z: b.z + b.d / 2 + 0.35, rotY: 0, arcade: b.arcade, dk: b.dk });
        if (side === 3) signSpots.push({ x: b.x + off * b.w, y: sh, z: b.z - b.d / 2 - 0.35, rotY: Math.PI, arcade: b.arcade, dk: b.dk });
      }
    }

    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // origin at base
    const seeds = new Float32Array(items.length);
    const tuning = new Float32Array(items.length * 3);
    items.forEach((it, i) => {
      seeds[i] = it.seed;
      const D = it.D;
      tuning[i * 3] = it.far ? 0.08 : D.litP;
      tuning[i * 3 + 1] = it.far ? 0.4 : D.warm;
      tuning[i * 3 + 2] = it.far ? 0.4 : D.flick;
    });
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.setAttribute('aTuning', new THREE.InstancedBufferAttribute(tuning, 3));
    const mat = makeBuildingMaterial(0.95);
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
    world.buildingMesh = mesh;
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
      const col = new THREE.Color(tower.accent || NEON.cyan).multiplyScalar(1.15);
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
      { text: 'ネオン', color: NEON.magenta, vertical: true, pool: ['MARKET', 'OLD'] },
      { text: 'RAMEN', color: NEON.amber, vertical: true, pool: ['MARKET', 'OLD'] },
      { text: 'HOTEL', color: NEON.cyan, vertical: true, pool: ['STACKS', 'OLD'] },
      { text: '拉麺横丁', color: NEON.red, vertical: true, pool: ['MARKET'] },
      { text: 'CYBER', color: NEON.purple, vertical: true, pool: ['OLD', 'MARKET', 'STACKS'] },
      { text: 'オービタル', color: NEON.lime, vertical: true, pool: ['CORE', 'PLAZA'] },
      { text: 'PRINTWIRE', color: NEON.cyan, vertical: false, pool: ['PLAZA', 'CORE'] },
      { text: 'DMLS-3D', color: NEON.amber, vertical: false, sub: 'TITANIUM · DIRECT METAL', pool: ['FOUNDRY'] },
      { text: 'MAXCNC', color: NEON.magenta, vertical: false, sub: 'ROBOTIC FABRICATION', pool: ['FOUNDRY'] },
      { text: 'SLINGSHOT', color: NEON.blue, vertical: false, sub: 'TRANSIT AUTHORITY', pool: ['CORE', 'PLAZA'] },
      { text: 'ENERGY+', color: NEON.lime, vertical: false, pool: ['FOUNDRY', 'STACKS'] },
      { text: 'ホロ寿司', color: NEON.cyan, vertical: false, pool: ['MARKET'] },
      { text: 'DEEP DISH', color: NEON.red, vertical: false, sub: 'GIORDANIX · SINCE 2189', pool: ['MARKET', 'OLD'] },
      { text: 'MALÖRT', color: NEON.lime, vertical: true, pool: ['OLD'] },
      { text: 'WGN-9K', color: NEON.blue, vertical: false, pool: ['PLAZA', 'CORE'] },
      { text: 'SLINGSHOT', color: NEON.cyan, vertical: true, pool: ['CORE', 'PLAZA', 'MARKET', 'OLD', 'STACKS', 'FOUNDRY'] },
      { text: 'INTERSTELLAR', color: NEON.magenta, vertical: false, sub: 'SLINGSHOT — PLAY TONIGHT', pool: ['CORE', 'PLAZA', 'MARKET'] },
      { text: 'PLAY SLINGSHOT', color: NEON.amber, vertical: false, sub: 'EIGHT GALAXIES AWAIT', pool: ['MARKET', 'OLD', 'STACKS'] },
      { text: '8 GALAXIES', color: NEON.lime, vertical: false, sub: 'ONE SLINGSHOT', pool: ['FOUNDRY', 'PLAZA', 'OLD'] },
    ];
    const spots = [...signSpots];
    // shuffle deterministically
    for (let i = spots.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0;[spots[i], spots[j]] = [spots[j], spots[i]]; }
    for (const v of variants) {
      const take = v.vertical ? 20 : 14;
      // district-appropriate spots first, then anything left
      const mine = [];
      for (const s of spots) {
        if (mine.length >= take) break;
        if (!s.used && v.pool.includes(s.dk)) { s.used = true; mine.push(s); }
      }
      for (const s of spots) {
        if (mine.length >= take) break;
        if (!s.used) { s.used = true; mine.push(s); }
      }
      if (!mine.length) break;
      const tex = signCanvas(v.text, v.color, v.vertical, v.sub);
      const gw = v.vertical ? 2.6 : 10.5, gh = v.vertical ? 10.5 : 2.6;
      const geo = new THREE.PlaneGeometry(gw, gh);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
      if (v.pool.includes('OLD') || v.pool.includes('FOUNDRY')) {
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uTime = world.uTime;
          sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
            vec2 gUv = vMapUv;
            float gRow = step(0.94, fract(sin(floor(gUv.y * 24.0) * 91.7 + floor(uTime * 9.0) * 13.1) * 43758.5));
            gUv.x += gRow * 0.08 * sin(uTime * 60.0);
            vec4 sampledDiffuseColor = texture2D(map, gUv);
            diffuseColor *= sampledDiffuseColor;
            float blackout = step(0.93, fract(sin(floor(uTime * 3.0) * 47.9) * 23421.6));
            diffuseColor.rgb *= mix(1.0, 0.18, blackout);
          `);
        };
      }
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
      { main: 'NEW CHICAGO', sub: 'CROSSROADS OF EIGHT GALAXIES', color: NEON.magenta },
      { main: 'PRINTWIRE', sub: '194 WORLDS · ONE NETWORK', color: NEON.amber },
      { main: 'INTERSTELLAR', sub: 'SLINGSHOT — PLAY TONIGHT', color: NEON.purple },
      { main: 'SLINGSHOT', sub: 'GRAVITY IS A WEAPON', color: NEON.cyan },
      { main: 'SLINGSHOT', sub: 'RIDE THE BLACK HOLES', color: NEON.red },
      { main: 'BEAT THE BORG', sub: 'SLINGSHOT SEASON 8', color: NEON.lime },
      { main: 'SLINGSHOT', sub: 'FREE AT BENERGY80.GITHUB.IO', color: NEON.blue },
    ];
    const tall = buildings.filter(b => b.h > 80).sort((a, b) => b.h - a.h).slice(0, 14);
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

  // ─────────────────────── LED MEGABOARDS (Times Square pass) ───────────────────────
  {
    const [lc, lctx] = makeCanvas(512, 128);
    const ledTex = canvasTexture(lc);
    const msgs = ['PLAY INTERSTELLAR SLINGSHOT', 'EIGHT GALAXIES · ONE SHIP', 'BEAT THE BORG — SEASON 8', 'スリングショット 発進!', 'GRAVITY IS A WEAPON', 'NEW CHICAGO ♥ SLINGSHOT', 'RIDE THE BLACK HOLES'];
    let mi = 0, acc = 0, scrollX = 0;
    const hueArr = ['#00f0ff', '#ff2bd6', '#ffb300', '#53ffe9', '#ff3355'];
    world.updateFns.push((dt) => {
      acc += dt;
      if (acc < 0.09) return;
      scrollX += acc * 160;
      acc = 0;
      const msg = msgs[mi % msgs.length];
      lctx.fillStyle = '#04060d';
      lctx.fillRect(0, 0, 512, 128);
      lctx.font = 'bold 86px Orbitron, monospace';
      lctx.textBaseline = 'middle';
      const w = lctx.measureText(msg).width + 360;
      if (scrollX > w) { scrollX = 0; mi++; }
      lctx.fillStyle = hueArr[mi % hueArr.length];
      lctx.shadowColor = lctx.fillStyle; lctx.shadowBlur = 18;
      lctx.fillText(msg, 512 - scrollX, 66);
      ledTex.needsUpdate = true;
    });
    world.ledTex = ledTex;
    const ledMat = new THREE.MeshBasicMaterial({ map: ledTex });
    const boards = new THREE.InstancedMesh(new THREE.PlaneGeometry(18, 4.5), ledMat, 30);
    const dummy2 = new THREE.Object3D();
    const cands = buildings.filter(b => b.h > 42).sort(() => rnd() - 0.5).slice(0, 30);
    cands.forEach((b, i) => {
      const side = (rnd() * 4) | 0;
      const off = [[b.w / 2 + 0.65, 0, Math.PI / 2], [-b.w / 2 - 0.65, 0, -Math.PI / 2], [0, b.d / 2 + 0.65, 0], [0, -b.d / 2 - 0.65, Math.PI]][side];
      dummy2.position.set(b.x + off[0], 8 + rnd() * Math.min(b.h - 16, 40), b.z + off[1]);
      dummy2.rotation.set(0, off[2], 0);
      dummy2.scale.setScalar(0.7 + rnd() * 0.9);
      dummy2.updateMatrix();
      boards.setMatrixAt(i, dummy2.matrix);
    });
    boards.frustumCulled = false;
    scene.add(boards);
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
        'LAKE MICHIGAN FERRY DELAYED — KAIJU SIGHTING UNCONFIRMED  ◇  ',
        'DA BEARS CLINCH ORBITAL DIVISION — SOLDIER FIELD 2287 ERUPTS  ◇  ',
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
    world.colliders.push({ minX: cx - 15, maxX: cx + 15, minZ: cz - 15, maxZ: cz + 15, minY: 0, maxY: 226 });

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
      // south railing splits around the elevator-bridge gate
      { minX: cx - R - 0.4, maxX: cx - 1.9, minZ: cz + R - 0.1, maxZ: cz + R + 0.4, minY: deckY - 1, maxY: deckY + 2.4 },
      { minX: cx + 1.9, maxX: cx + R + 0.4, minZ: cz + R - 0.1, maxZ: cz + R + 0.4, minY: deckY - 1, maxY: deckY + 2.4 },
      { minX: cx - R - 0.4, maxX: cx - R + 0.1, minZ: cz - R, maxZ: cz + R, minY: deckY - 1, maxY: deckY + 2.4 },
      { minX: cx + R - 0.1, maxX: cx + R + 0.4, minZ: cz - R, maxZ: cz + R, minY: deckY - 1, maxY: deckY + 2.4 },
    );
    world.surfaces.push({ minX: cx - 20.6, maxX: cx + 20.6, minZ: cz - 20.6, maxZ: cz + 20.6, y: deckY });

    // ── Gated glass elevator, docked OUTSIDE the deck rim (no clipping
    // through the slab) — a short bridge crosses the railing gap.
    const spireElev = world.makeElevator({
      x: cx, z: cz + 24.9, stops: [0.6, deckY],
      gate: { dx: 0, dz: -1 },     // opens toward the tower / deck bridge
      size: 3.6, color: NEON.cyan, name: 'SPIRE ELEVATOR',
    });
    world.spireElevator = spireElev;
    {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.25, 3.6),
        new THREE.MeshStandardMaterial({ color: 0x232940, roughness: 0.4, metalness: 0.55 })
      );
      plate.position.set(cx, deckY - 0.13, cz + 21.4);
      scene.add(plate);
      world.raycastTargets.push(plate);
      const glowEdge = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(0.9), toneMapped: false });
      for (const e of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 3.6), glowEdge);
        strip.position.set(cx + e * 1.66, deckY + 0.02, cz + 21.4);
        scene.add(strip);
      }
      world.surfaces.push({ minX: cx - 1.7, maxX: cx + 1.7, minZ: cz + 19.9, maxZ: cz + 23.25, y: deckY });
      // bridge side rails so the gap is safe
      world.colliders.push(
        { minX: cx - 2.0, maxX: cx - 1.6, minZ: cz + 19.6, maxZ: cz + 23.3, minY: deckY - 1, maxY: deckY + 2.4 },
        { minX: cx + 1.6, maxX: cx + 2.0, minZ: cz + 19.6, maxZ: cz + 23.3, minY: deckY - 1, maxY: deckY + 2.4 },
      );
    }

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
    world.colliders.push({ minX: holo.position.x - 10, maxX: holo.position.x + 10, minZ: holo.position.z - 10, maxZ: holo.position.z + 10, minY: 0, maxY: 24 });
    world.updateFns.push((dt, t) => {
      holo.rotation.y += dt * 0.5;
      holoRing.rotation.z += dt * 0.3;
      holo.position.y = 16 + Math.sin(t * 0.8) * 1.2;
    });

    world.pois.push(
      { name: 'MILLENNIUM PLAZA', pos: new THREE.Vector3(cx, 1, cz - 26), desc: 'The Bean & Willis Spire forecourt' },
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
    world.colliders.push({ minX: tx - 6, maxX: tx + 6, minZ: tz - 6, maxZ: tz + 6, minY: 0, maxY: 60 });
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
      world.colliders.push({ minX: hx - 23, maxX: hx + 23, minZ: hz - 17, maxZ: hz + 17, minY: 0, maxY: 36 });
    }

    // Terminal connecting to the city
    const termX = SP.x0 + 9, termZ = 0;
    const term = new THREE.Mesh(new THREE.BoxGeometry(16, 12, 74),
      new THREE.MeshStandardMaterial({ color: 0x1b2136, roughness: 0.3, metalness: 0.5, emissive: 0x123a4a, emissiveIntensity: 0.7 }));
    term.position.set(termX, 6, termZ);
    scene.add(term);
    world.raycastTargets.push(term);
    world.colliders.push({ minX: termX - 8, maxX: termX + 8, minZ: termZ - 37, maxZ: termZ + 37, minY: 0, maxY: 13 });
    const termSign = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 4.6),
      new THREE.MeshBasicMaterial({ map: signCanvas("O'HARE ◇ ORBITAL", NEON.amber, false) })
    );
    termSign.position.set(termX - 8.2, 14.6, termZ);
    termSign.rotation.y = -Math.PI / 2;
    scene.add(termSign);

    world.pois.push({ name: "O'HARE ORBITAL", pos: new THREE.Vector3(SP.x0 + 30, 1, 0), desc: 'Orbital shuttles & atmospheric craft' });

    // perimeter walls (keep player on apron, gap to the city on the west)
    addBox(SP.x0 - 2, SP.x1, SP.z0 - 2, SP.z0);
    addBox(SP.x0 - 2, SP.x1, SP.z1, SP.z1 + 2);
    addBox(SP.x1, SP.x1 + 2, SP.z0, SP.z1);
  }

  // City boundary walls — east gate to the spaceport, west open to the lake
  addBox(-H, H, -H - 2, -H);
  addBox(-H, H, H, H + 2);
  addBox(H, H + 2, -H, SP.z0);
  addBox(H, H + 2, SP.z1, H);

  // ─────────────────────── ARCADE ALLEY + steam ───────────────────────
  {
    const z = H - C.CELL / 2 - C.ROAD / 2;
    world.pois.push({ name: 'MAG MILE ARCADE', pos: new THREE.Vector3(0, 1, H - C.CELL - 4), desc: 'Deep dish, pachinko & malört' });
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

  // ─────────────────────── WALLIZE (shared with interiors.js) ───────────────────────
  // Swap a building's solid AABB for four wall strips (optionally with a
  // doorway gap and a parapet top) so its inside / roof become real places.
  world.wallizeBuilding = (b, { gaps = [], maxY = null } = {}) => {
    const i = world.colliders.indexOf(b.collider);
    if (i >= 0) world.colliders.splice(i, 1);
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    const T = 0.6, MY = maxY === null ? b.h + 1.1 : maxY;
    const walls = [];
    const seg = (def) => { def.minY = 0; def.maxY = MY; walls.push(def); world.colliders.push(def); };
    const split = (side, a0, a1, fixed0, fixed1, horiz) => {
      const myGaps = gaps.filter(g => g.side === side).sort((p, q) => p.center - q.center);
      let cur = a0;
      for (const g of myGaps) {
        const g0 = g.center - g.width / 2, g1 = g.center + g.width / 2;
        if (g0 > cur) seg(horiz ? { minX: cur, maxX: g0, minZ: fixed0, maxZ: fixed1 } : { minX: fixed0, maxX: fixed1, minZ: cur, maxZ: g0 });
        cur = Math.max(cur, g1);
      }
      if (cur < a1) seg(horiz ? { minX: cur, maxX: a1, minZ: fixed0, maxZ: fixed1 } : { minX: fixed0, maxX: fixed1, minZ: cur, maxZ: a1 });
    };
    split('n', x0, x1, z0, z0 + T, true);
    split('s', x0, x1, z1 - T, z1, true);
    split('w', z0, z1, x0, x0 + T, false);
    split('e', z0, z1, x1 - T, x1, false);
    return walls;
  };

  // ─────────────────────── GATEWAY ARCHES (district borders) ───────────────────────
  {
    const seen = new Set();
    const archMat = new THREE.MeshStandardMaterial({ color: 0x1c2336, roughness: 0.4, metalness: 0.65 });
    let count = 0;
    const tryArch = (Da, Db, roadX, roadZ, alongZ) => {
      const key = [Da.key, Db.key].sort().join('|');
      if (Da === Db || seen.has(key) || count >= 10) return;
      seen.add(key);
      count++;
      const g = new THREE.Group();
      const span = C.ROAD + 3.6;
      const mkSign = (D) => {
        const [c, ctx] = makeCanvas(512, 96);
        ctx.fillStyle = 'rgba(4,6,14,0.9)'; ctx.fillRect(0, 0, 512, 96);
        const cc = hexCss(D.curb, 0.95);
        ctx.strokeStyle = cc; ctx.lineWidth = 5; ctx.strokeRect(5, 5, 502, 86);
        ctx.font = 'bold 44px Orbitron, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = cc; ctx.shadowBlur = 16;
        ctx.fillStyle = '#fff';
        ctx.fillText(`◊ ${D.name} ◊`, 256, 48);
        return new THREE.MeshBasicMaterial({ map: canvasTexture(c) });
      };
      for (const e of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 10, 0.9), archMat);
        const ox = alongZ ? e * span / 2 : 0, oz = alongZ ? 0 : e * span / 2;
        p.position.set(roadX + ox, 5, roadZ + oz);
        g.add(p);
        world.colliders.push({ minX: p.position.x - 0.55, maxX: p.position.x + 0.55, minZ: p.position.z - 0.55, maxZ: p.position.z + 0.55 });
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? span : 0.9, 1.5, alongZ ? 0.9 : span), archMat);
      lintel.position.set(roadX, 10.1, roadZ);
      g.add(lintel);
      const lintelGlow = new THREE.Mesh(
        new THREE.BoxGeometry(alongZ ? span : 0.24, 0.18, alongZ ? 0.24 : span),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(Db.curb).multiplyScalar(1.0), toneMapped: false })
      );
      lintelGlow.position.set(roadX, 9.3, roadZ);
      g.add(lintelGlow);
      // each face names the district you're entering
      const sA = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2), mkSign(Db));
      const sB = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2), mkSign(Da));
      if (alongZ) {  // road runs along z → faces look ±z
        sA.position.set(roadX, 8.2, roadZ - 0.7); sA.rotation.y = Math.PI;
        sB.position.set(roadX, 8.2, roadZ + 0.7);
      } else {       // faces look ±x
        sA.position.set(roadX - 0.7, 8.2, roadZ); sA.rotation.y = -Math.PI / 2;
        sB.position.set(roadX + 0.7, 8.2, roadZ); sB.rotation.y = Math.PI / 2;
      }
      g.add(sA, sB);
      scene.add(g);
    };
    for (let bx = 0; bx < C.GRID - 1; bx++) for (let bz = 0; bz < C.GRID; bz++) {
      const Da = districtOf(bx, bz), Db = districtOf(bx + 1, bz);
      const cz0 = -H + bz * C.CELL + C.ROAD / 2 + C.BLOCK / 2;
      tryArch(Da, Db, -H + (bx + 1) * C.CELL - C.ROAD / 2, cz0, false);
    }
    for (let bz = 0; bz < C.GRID - 1; bz++) for (let bx = 0; bx < C.GRID; bx++) {
      const Da = districtOf(bx, bz), Db = districtOf(bx, bz + 1);
      const cx0 = -H + bx * C.CELL + C.ROAD / 2 + C.BLOCK / 2;
      tryArch(Da, Db, cx0, -H + (bz + 1) * C.CELL - C.ROAD / 2, true);
    }
  }

  // ─────────────────────── DISTRICT POIs ───────────────────────
  for (const key of ['MARKET', 'FOUNDRY', 'STACKS', 'PLAZA', 'OLD']) {
    const blocks = (districtBlocks[key] || []);
    if (!blocks.length) continue;
    const mx = blocks.reduce((s, b) => s + b.cx, 0) / blocks.length;
    const mz = blocks.reduce((s, b) => s + b.cz, 0) / blocks.length;
    let best = blocks[0], bd = 1e9;
    for (const blk of blocks) {
      const d = (blk.cx - mx) ** 2 + (blk.cz - mz) ** 2;
      if (d < bd) { bd = d; best = blk; }
    }
    const D = DISTRICTS[key];
    world.pois.push({ name: D.name, pos: new THREE.Vector3(best.cx, 1, best.cz), desc: 'District heart' });
  }

  // ─────────────────────── FLAGSHIP ROOFTOP ELEVATORS ───────────────────────
  // One external glass lift per flagship district tower → walkable roof.
  for (const key of ['PLAZA', 'STACKS', 'FOUNDRY']) {
    const candidates = buildings.filter(b => b.dk === key && b.w >= 18 && b.d >= 18);
    if (!candidates.length) continue;
    const b = candidates.sort((p, q) => q.h - p.h)[0];
    const D = DISTRICTS[key];
    // cab 4.6u off a wall — pick the first face whose shaft is clear of
    // beams, pylons, lights and neighbors so the cab can't clip anything
    const faces = [
      { side: 's', ex: b.x, ez: b.z + b.d / 2 + 4.6 },
      { side: 'n', ex: b.x, ez: b.z - b.d / 2 - 4.6 },
      { side: 'e', ex: b.x + b.w / 2 + 4.6, ez: b.z },
      { side: 'w', ex: b.x - b.w / 2 - 4.6, ez: b.z },
    ];
    const face = faces.find(f => world.shaftClear(f.ex, f.ez, 1.8)) || faces[0];
    const ex = face.ex, ez = face.ez;
    world.wallizeBuilding(b, { gaps: [{ side: face.side, center: face.side === 'e' || face.side === 'w' ? ez : ex, width: 3.2 }] });
    const roofY = b.h + 0.02;
    const dir = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[face.side];
    const px = -dir[1], pz = dir[0];   // across-bridge axis
    world.makeElevator({
      x: ex, z: ez, stops: [0.6, roofY - 0.18],
      gate: { dx: -dir[0], dz: -dir[1] }, size: 3.2, color: D.accent, name: `${D.short} SKYLIFT`,
    });
    // dock bridge from the wall face to the cab gate
    const fx0 = ex - dir[0] * 4.6, fz0 = ez - dir[1] * 4.6;   // wall face point
    const bx = (fx0 + ex - dir[0] * 1.6) / 2, bz2 = (fz0 + ez - dir[1] * 1.6) / 2;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(Math.abs(px) * 3.0 + Math.abs(dir[0]) * 4.6, 0.22, Math.abs(pz) * 3.0 + Math.abs(dir[1]) * 4.6),
      new THREE.MeshStandardMaterial({ color: 0x232940, roughness: 0.4, metalness: 0.55 })
    );
    plate.position.set(bx, roofY - 0.11, bz2);
    scene.add(plate);
    const sw = (a, b2) => [Math.min(a, b2), Math.max(a, b2)];
    const [sx0, sx1] = sw(fx0 - dir[0] * 0.6, ex - dir[0] * 1.5);
    const [sz0, sz1] = sw(fz0 - dir[1] * 0.6, ez - dir[1] * 1.5);
    world.surfaces.push({
      minX: Math.abs(px) ? ex - 1.5 : sx0, maxX: Math.abs(px) ? ex + 1.5 : sx1,
      minZ: Math.abs(pz) ? ez - 1.5 : sz0, maxZ: Math.abs(pz) ? ez + 1.5 : sz1,
      y: roofY,
    });
    for (const e2 of [-1, 1]) {
      world.colliders.push({
        minX: (Math.abs(px) ? ex + e2 * 1.65 - 0.2 : Math.min(fx0, ex)) , maxX: (Math.abs(px) ? ex + e2 * 1.65 + 0.2 : Math.max(fx0, ex)),
        minZ: (Math.abs(pz) ? ez + e2 * 1.65 - 0.2 : Math.min(fz0, ez)), maxZ: (Math.abs(pz) ? ez + e2 * 1.65 + 0.2 : Math.max(fz0, ez)),
        minY: roofY - 1, maxY: roofY + 2.2,
      });
    }
    world.flagships.push({ b, roofY });
    // roof surface — ring around the set-back upper tier if there is one
    if (b.t2) {
      const rw = b.t2.w2 / 2 + 0.2, rd = b.t2.d2 / 2 + 0.2;
      const x0 = b.x - b.w / 2 + 0.3, x1 = b.x + b.w / 2 - 0.3, z0 = b.z - b.d / 2 + 0.3, z1 = b.z + b.d / 2 - 0.3;
      world.surfaces.push(
        { minX: x0, maxX: x1, minZ: z0, maxZ: b.z - rd, y: roofY },
        { minX: x0, maxX: x1, minZ: b.z + rd, maxZ: z1, y: roofY },
        { minX: x0, maxX: b.x - rw, minZ: b.z - rd, maxZ: b.z + rd, y: roofY },
        { minX: b.x + rw, maxX: x1, minZ: b.z - rd, maxZ: b.z + rd, y: roofY },
      );
      world.colliders.push({ minX: b.x - rw, maxX: b.x + rw, minZ: b.z - rd, maxZ: b.z + rd, minY: b.h, maxY: b.h + b.t2.h2 });
    } else {
      world.surfaces.push({ minX: b.x - b.w / 2 + 0.3, maxX: b.x + b.w / 2 - 0.3, minZ: b.z - b.d / 2 + 0.3, maxZ: b.z + b.d / 2 - 0.3, y: roofY });
    }
    b.hasRoofLift = true;
    world.pois.push({ name: `${D.short} SKYDECK`, pos: new THREE.Vector3(b.x, roofY, b.z), desc: `${D.name} rooftop`, elevated: true });
  }

  return world;
}
