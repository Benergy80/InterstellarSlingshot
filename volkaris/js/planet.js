// ════════════════════════════════════════════════════════════════
// VOLKARIS — the planet
//
// A small spherical fortress-world. Terrain is an analytically
// displaced sphere (the same height function drives both the mesh
// and object placement). Districts wrap the equator like a maze:
//
//   CRASH SITE → SCRAP MARKET → THE CIRCUIT (red light) →
//   NEON ACROPOLIS (downtown) → FOUNDRY RUINS → THE DUNES →
//   THE OBSIDIAN PYRAMID (Overlord Vex) →→ secret tunnel →→
//   PORT MERIDIAN (your ship — the goal)
//
// Paths wind, split and reconnect; catwalks, skybridges, canyon
// trenches and neon-lit tunnels layer the routes vertically. The
// horizon always curves away just out of view, so the world only
// ever reveals what's just ahead.
//
// Rendering: everything static merges into THREE meshes —
//   solid (lambert, vertex colors) · glow (basic, vertex colors,
//   toneMapped:false) · plus a handful of textured sign planes.
// Collision: one merged BufferGeometry + three-mesh-bvh, queried by
// raycasts from the player/NPCs (Messenger does the same off-thread).
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import {
  C, NEON, NEON_LIST, GROUND, mulberry32, pick, lerp, clamp, smooth,
  sphDir, tangentFrame, surfaceMatrix, fbm3, noise3, makeCanvas, canvasTexture, hexCss,
} from './config.js';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const R = C.R;

// ── District table ──────────────────────────────────────────────
// lat/lon in degrees; pad = flattened radius (u); ring = crater rim
export const DISTRICTS = [
  { key: 'crash',    name: 'CRASH SITE',          lat:   2, lon:   0, pad: 11 },
  { key: 'market',   name: 'SCRAP MARKET',        lat:   8, lon:  52, pad: 19 },
  { key: 'circuit',  name: 'THE CIRCUIT',         lat:  -6, lon: 108, pad: 17 },
  { key: 'downtown', name: 'NEON ACROPOLIS',      lat:  38, lon: 162, pad: 21 },
  { key: 'ruins',    name: 'FOUNDRY RUINS',       lat:  -4, lon: 212, pad: 19 },
  { key: 'dunes',    name: 'THE PINK DUNES',      lat: -20, lon: 252, pad: 13 },
  { key: 'pyramid',  name: 'THE OBSIDIAN PYRAMID',lat: -40, lon: 288, pad: 25 },
  { key: 'port',     name: 'PORT MERIDIAN',       lat:  30, lon: 318, pad: 16, ring: 9 },
];

// Path net: winding waypoint chains (lat, lon) between districts.
// Mid-points are hand-jittered so routes snake around terrain.
const PATHS = [
  // main loop
  ['crash',  [2,0],   [10,14], [1,27], [12,40],  'market'],
  ['market', [8,52],  [-4,68], [10,82], [-10,96], 'circuit'],
  ['circuit',[-6,108],[6,122], [20,134],[32,148], 'downtown'],
  ['downtown',[38,162],[26,178],[8,190], [-6,202],'ruins'],
  ['ruins',  [-4,212],[-16,226],[-24,240],[-20,252],'dunes'],
  ['dunes',  [-20,252],[-30,264],[-38,276],[-40,288],'pyramid'],
  // shortcuts & spurs that loop back
  ['market', [8,52],  [24,60], [34,74],  [30,90],  'circuit'],   // high road
  ['ruins',  [-4,212],[8,204], [18,196], null,     'downtown'],  // service climb
  ['crash',  [2,0],   [-12,348],[-24,336],[-34,310],'pyramid'],  // the processional
  ['downtown',[38,162],[48,180],[52,220], [44,268], 'port'],     // canyon rim road (long way)
  ['pyramid',[-40,288],[-20,298],[0,306], [16,312], 'port'],     // pilgrim steps
];

// ── Terrain height (ANALYTIC — mesh and placement share this) ───
const _v = new THREE.Vector3();
const districtDirs = DISTRICTS.map(d => ({ ...d, dir: sphDir(d.lat, d.lon) }));

// Path chains with SERPENTINE wobble — streets wind like Venice
// alleys, wrapping around terrain features instead of ruling lines.
// Both terrain flattening and ribbon rendering share these chains.
const pathSamples = [];
const pathChains = [];
function latLonOf(entry) {
  if (Array.isArray(entry)) return entry;
  const d = DISTRICTS.find(x => x.key === entry);
  return [d.lat, d.lon];
}
for (const chain of PATHS) {
  const pts = chain.filter(Boolean).map(latLonOf);
  const dirs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = sphDir(pts[i][0], pts[i][1]), b = sphDir(pts[i + 1][0], pts[i + 1][1]);
    const axis = new THREE.Vector3().crossVectors(a, b).normalize();
    const n = 22;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const p = new THREE.Vector3().lerpVectors(a, b, t).normalize();
      const perp = new THREE.Vector3().crossVectors(p, axis).normalize();
      // two bends per leg, ±~2.5u — enough to hide what's next
      const wob = Math.sin(t * Math.PI * 2 + i * 1.7) * 0.042;
      p.addScaledVector(perp, wob).normalize();
      dirs.push(p);
    }
  }
  dirs.push(sphDir(pts[pts.length - 1][0], pts[pts.length - 1][1]));
  pathChains.push(dirs);
  for (const p of dirs) pathSamples.push(p);
}

const LAKE_DIR = sphDir(20, 133);   // between the Circuit and downtown
const ISLE_DIR = sphDir(20, 134.5); // shrine islet inside the lake bowl
const VOLCANO_DIR = sphDir(-54, 168); // Mount Cindral — deep southern wilds,
                                      // far from every district and road

// ── Cave bores (module level: the terrain function carves their
// mouth trenches, buildPlanet sweeps their interiors) ──
const CAVE_DEFS = [
  [[16, 20], [27, 32]],      // under Mt. Kessler (crash → market shortcut)
  [[-22, 70], [-32, 82]],    // through The Fang
  [[4, 238], [12, 252]],     // under Vexhorn (ruins → dunes)
  [[-6, 324], [-12, 338]],   // under The Sentinel (processional)
  [[48, 116], [58, 128]],    // Northwatch, exits above the lake
];
const CAVE_DATA = CAVE_DEFS.map(([[laA, loA], [laB, loB]]) => ({
  a: sphDir(laA, loA), b: sphDir(laB, loB), rA: 0, rB: 0,
}));
let CARVE = false;   // flipped on after mouth heights are sampled
const _cv1 = new THREE.Vector3(), _cv2 = new THREE.Vector3();

// Named mountains — Skyrim drama on a 60u ball. Kept OFF the street
// net so they wall the maze instead of blocking it. [lat, lon, height, spread²]
const PEAKS = [
  [22, 25, 17, 55],     // Mt. Kessler — between crash site and market
  [-28, 75, 20, 70],    // The Fang — south of the market/circuit road
  [55, 120, 16, 60],    // Northwatch — above the lake
  [8, 245, 19, 75],     // Vexhorn — between dunes and ruins
  [-8, 330, 15, 55],    // The Sentinel — over the processional
  [60, 300, 14, 50],    // Port Ridge north
];
const PEAK_DIRS = PEAKS.map(([la, lo, h, sp]) => ({ dir: sphDir(la, lo), h, sp }));

export function terrainHeight(dir) {
  // base mountains — bright violet badlands
  let amp = C.TERRAIN_AMP;
  const n = fbm3(_v.copy(dir).multiplyScalar(2.35), 4) * 2 - 1;
  const ridge = Math.pow(Math.abs(fbm3(_v.copy(dir).multiplyScalar(1.2), 3) * 2 - 1), 1.4) * 1.6;
  let h = (n * 0.55 + ridge * 0.9) * amp;

  // flatten inside districts (smooth falloff from pad edge)
  let damp = 1;
  for (const d of districtDirs) {
    const angDist = dir.angleTo(d.dir) * R;         // arc distance in u
    const t = clamp((angDist - d.pad) / 14, 0, 1);  // gentle apron, not a cliff wall
    damp = Math.min(damp, smooth(t));
    // crater rim around the spaceport — a mountain ring that hides it
    if (d.ring) {
      const rimDist = Math.abs(angDist - (d.pad + 5));
      h += Math.exp(-(rimDist * rimDist) / 40) * d.ring * smooth(clamp((angDist - 3) / 7, 0, 1));
    }
  }
  // flatten along path corridors
  let pd = 1e9;
  for (const p of pathSamples) {
    const dd = dir.distanceToSquared(p);
    if (dd < pd) pd = dd;
  }
  const pathDist = Math.sqrt(pd) * R;               // ≈ arc distance
  damp = Math.min(damp, smooth(clamp((pathDist - 2.6) / 9, 0, 1)));

  // named PEAKS rise above everything (damped by streets/pads too,
  // so a road passing a mountain's foot cuts a pass, not a wall)
  let peaks = 0;
  for (const p of PEAK_DIRS) {
    const d2 = dir.angleTo(p.dir) * R;
    peaks += Math.exp(-(d2 * d2) / p.sp) * p.h;
  }

  // Mount Cindral — a volcano: a tall gaussian cone with a crater bowl
  // bitten out of its summit, so the rim rings a sunken molten throat
  const volDist = dir.angleTo(VOLCANO_DIR) * R;
  if (volDist < 42) {
    peaks += Math.exp(-(volDist * volDist) / 55) * 21
           - Math.exp(-(volDist * volDist) / 9) * 7;
  }

  // Lake Voltaine — a glowing basin like Messenger's bay
  const lakeDist = dir.angleTo(LAKE_DIR) * R;
  const bowl = Math.exp(-(lakeDist * lakeDist) / 130) * 5.5;

  // shrine islet — added OUTSIDE the street damp (a path waypoint
  // crosses the lake here, so a damped bump would never surface)
  const isleDist = dir.angleTo(ISLE_DIR) * R;
  const isle = isleDist < 10 ? Math.exp(-(isleDist * isleDist) / 7) * 6.4 : 0;

  let result = R + (h + peaks) * damp - bowl + isle;

  // cave-mouth trenches: cut the terrain skin open at both ends of
  // each bore so you can walk in under the mountain
  if (CARVE) {
    for (const c of CAVE_DATA) {
      _cv1.subVectors(c.b, c.a);
      const t = clamp(_cv2.subVectors(dir, c.a).dot(_cv1) / _cv1.lengthSq(), 0, 1);
      _cv2.copy(c.a).addScaledVector(_cv1, t).normalize();
      const lat2 = dir.angleTo(_cv2) * R;
      if (lat2 > 3.6) continue;
      const floorR = c.rA + (c.rB - c.rA) * t - Math.sin(t * Math.PI) * 1.4;
      const mouthness = Math.max(
        smooth(clamp((0.34 - t) / 0.34, 0, 1)),
        smooth(clamp((t - 0.66) / 0.34, 0, 1)));
      const lateral = smooth(clamp((3.6 - lat2) / 1.8, 0, 1));
      const cut = lateral * mouthness;
      const target = floorR + 0.15;
      if (cut > 0 && result > target) result += (target - result) * cut;
    }
  }
  return result;
}
// sample mouth heights on the UNCARVED terrain, then enable carving
for (const c of CAVE_DATA) {
  c.rA = terrainHeight(c.a) - 0.2;
  c.rB = terrainHeight(c.b) - 0.2;
}
CARVE = true;

export function surfacePoint(dir, out = new THREE.Vector3()) {
  return out.copy(dir).normalize().multiplyScalar(terrainHeight(dir));
}

// ════════════════════════════════════════════════════════════════
export function buildPlanet(scene, models = {}) {
  const rnd = mulberry32(C.SEED);
  const uTime = { value: 0 };

  const solidParts = [];   // {geo} with vertex colors — lambert
  const glowParts = [];    // emissive, toneMapped:false
  const collParts = [];    // collision-only (also every solid part collides)
  const signs = [];        // textured planes (few draw calls)
  const dynamic = [];      // {mesh, update(dt, t)} animated bits

  const _c = new THREE.Color();
  function colorize(geo, hex, jitter = 0) {
    _c.set(hex);
    if (jitter) {
      const hsl = {}; _c.getHSL(hsl);
      _c.setHSL(hsl.h + (rnd() - 0.5) * jitter * 0.1, clamp(hsl.s + (rnd() - 0.5) * jitter, 0, 1), clamp(hsl.l + (rnd() - 0.5) * jitter, 0, 1));
    }
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }

  // add a geometry in a local surface frame.
  // frame: Matrix4 from surfaceMatrix(); local: pre-transform within it
  function addSolid(geo, frame, hex, { jitter = 0, collide = true } = {}) {
    geo.applyMatrix4(frame);
    colorize(geo, hex, jitter);
    solidParts.push(geo);
    if (collide) collParts.push(geo);
    return geo;
  }
  function addGlow(geo, frame, hex, boost = 1.35) {
    geo.applyMatrix4(frame);
    _c.set(hex).multiplyScalar(boost);   // ≤1.4 or bloom clips white (NC lesson)
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    glowParts.push(geo);
    return geo;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const T = (geo, x, y, z, ry = 0, rx = 0, rz = 0) => {
    if (rx || ry || rz) geo.rotateX(rx), geo.rotateY(ry), geo.rotateZ(rz);
    geo.translate(x, y, z);
    return geo;
  };

  // ── frame helper: stand at (lat°, lon°) + local u offsets ──
  function frameAt(lat, lon, yaw = 0, sink = 0.25) {
    const dir = sphDir(lat, lon);
    return surfaceMatrix(dir, terrainHeight(dir) - sink, yaw);
  }
  // frame at exact unit dir
  function frameAtDir(dir, yaw = 0, sink = 0.25) {
    return surfaceMatrix(dir, terrainHeight(dir) - sink, yaw);
  }

  // ── RIDEABLE ELEVATORS — glass paternoster platforms ──
  // Platform meshes are render-only (NOT in the static BVH); instead
  // they CARRY the player: main calls planet.carryRiders(playerState, dt)
  // each frame BEFORE player physics. Public contract:
  //   elevators = [{ pos: Vector3 (platform centre, live), r: 1.7 }]
  // (entries also expose .up and .delta, used by carryRiders).
  const elevators = [];
  const elevRigs = [];
  const ELEV_SPEED = 3.5, ELEV_PAUSE = 2;   // u/s travel, seconds dwell
  // terrain height at frame-local (lx, lz), expressed as a frame-local y —
  // tangent-plane offsets float above the curving surface (≈d²/2R), so
  // anything meant to touch ground away from a frame's origin needs this
  function localGroundY(frame, lx, lz) {
    const wp = new THREE.Vector3(lx, 0, lz).applyMatrix4(frame);
    const dir2 = wp.normalize();
    const gp = dir2.clone().multiplyScalar(terrainHeight(dir2));
    return gp.sub(new THREE.Vector3().setFromMatrixPosition(frame))
      .dot(new THREE.Vector3().setFromMatrixColumn(frame, 1));
  }
  function makeElevator(frame, lx, lz, y0, y1, phase, hex) {
    // twin glow tracks + boarding pad (static, merged; seated at y0)
    const railH = (y1 - y0) + 2.4;
    for (const sz of [-1, 1]) {
      addGlow(T(box(0.12, railH, 0.12), lx, y0 + railH / 2 - 0.9, lz + sz * 1.9), frame.clone(), hex, 0.95);
      addSolid(T(box(0.26, 0.9, 0.26), lx, y0 - 0.35, lz + sz * 1.9), frame.clone(), 0x241e4e);
    }
    addSolid(T(new THREE.CylinderGeometry(2.0, 2.2, 0.34, 12), lx, y0 - 0.28, lz), frame.clone(), 0x201a44);
    addGlowRaw(T(new THREE.TorusGeometry(1.8, 0.07, 5, 20), lx, y0 - 0.08, lz, 0, Math.PI / 2)
      .applyMatrix4(frame.clone()), hex, 1.1);
    // the platform itself — glass disc + neon rim (rendered live)
    const plat = new THREE.Group();
    plat.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.22, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(0.45), transparent: true, opacity: 0.48, toneMapped: false, depthWrite: false })));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.08, 5, 22),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.2), toneMapped: false }));
    rim.rotation.x = Math.PI / 2;
    plat.add(rim);
    plat.quaternion.setFromRotationMatrix(frame);
    signs.push(plat);
    const base = new THREE.Vector3(lx, 0, lz).applyMatrix4(frame.clone());
    const up = new THREE.Vector3().setFromMatrixColumn(frame, 1).normalize();
    const el = { pos: base.clone().addScaledVector(up, y0), r: 1.7, up, delta: new THREE.Vector3() };
    plat.position.copy(el.pos);
    elevators.push(el);
    elevRigs.push({ el, plat, base, up, y0, y1, phase, prev: el.pos.clone() });
    return el;
  }
  dynamic.push({ update(dt, t) {
    for (const rig of elevRigs) {
      const travel = rig.y1 - rig.y0, T2 = travel / ELEV_SPEED, cyc = 2 * (T2 + ELEV_PAUSE);
      let ph = (t + rig.phase) % cyc;
      if (ph < 0) ph += cyc;
      let y;
      if (ph < T2) y = rig.y0 + travel * (ph / T2);
      else if (ph < T2 + ELEV_PAUSE) y = rig.y1;
      else if (ph < 2 * T2 + ELEV_PAUSE) y = rig.y1 - travel * ((ph - T2 - ELEV_PAUSE) / T2);
      else y = rig.y0;
      rig.plat.position.copy(rig.base).addScaledVector(rig.up, y);
      rig.el.pos.copy(rig.plat.position);
      rig.el.delta.subVectors(rig.el.pos, rig.prev);
      rig.prev.copy(rig.el.pos);
    }
  } });
  const _crRel = new THREE.Vector3();
  function carryRiders(playerState, dt) {
    for (const el of elevators) {
      _crRel.subVectors(playerState.pos, el.pos);
      const v = _crRel.dot(el.up);
      const h2 = _crRel.lengthSq() - v * v;
      if (h2 > el.r * el.r) continue;
      const rise = v - 0.11;                       // height above the platform surface
      if (rise < -0.5 || rise > 1.4) continue;
      playerState.pos.add(el.delta);               // ride the platform
      playerState.vel.addScaledVector(el.up, -playerState.vel.dot(el.up));  // gravity doesn't fight the lift
    }
  }

  // ════════════ TERRAIN SPHERE ════════════
  {
    const geo = new THREE.SphereGeometry(1, C.TERRAIN_DETAIL, C.TERRAIN_DETAIL / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const d = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      const h = terrainHeight(d);
      pos.setXYZ(i, d.x * h, d.y * h, d.z * h);
      // vertex color: violet rock shaded by height + pink dust in flats
      const rel = (h - R) / C.TERRAIN_AMP;                    // -1..+2ish
      const dust = clamp(1 - Math.abs(rel) * 2.2, 0, 1);      // flats → dusty pink
      _c.copy(GROUND.rockLo).lerp(GROUND.rockHi, clamp(rel * 0.5 + 0.55, 0, 1));
      _c.lerp(GROUND.sand, dust * 0.42);
      // snow-glow caps on the high peaks
      const cap = smooth(clamp((h - (R + 9)) / 5, 0, 1));
      if (cap > 0) _c.lerp(new THREE.Color(0xf6e7ff), cap * 0.85);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    solidParts.push(geo);
    collParts.push(geo.clone());
  }

  // ════════════ PATH RIBBONS (glowing edge lines) ════════════
  function ribbon(pts, width = 3.4, edgeHex = NEON.cyan) {
    // pts: array of unit dirs. Build a strip conforming to terrain +0.07
    const centers = [], lefts = [];
    for (let i = 0; i < pts.length; i++) {
      const p = surfacePoint(pts[i]).multiplyScalar(1 + 0.0006);
      const next = pts[Math.min(i + 1, pts.length - 1)], prev = pts[Math.max(i - 1, 0)];
      const fwd = surfacePoint(next, new THREE.Vector3()).sub(surfacePoint(prev, new THREE.Vector3())).normalize();
      const up = pts[i].clone().normalize();
      const left = new THREE.Vector3().crossVectors(up, fwd).normalize();
      centers.push(p); lefts.push(left);
    }
    const mk = (w0, w1, lift) => {
      const verts = [], idx = [];
      for (let i = 0; i < centers.length; i++) {
        const up = pts[i].clone().normalize().multiplyScalar(lift);
        const a = centers[i].clone().addScaledVector(lefts[i], w0).add(up);
        const b = centers[i].clone().addScaledVector(lefts[i], w1).add(up);
        verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
        if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    // dark road bed + two neon edge lines (the synthwave grid look)
    const bed = mk(-width / 2, width / 2, 0.05);
    colorize(bed, 0x140b2e);
    solidParts.push(bed);
    collParts.push(bed.clone());
    addGlowRaw(mk(-width / 2 - 0.22, -width / 2 + 0.08, 0.09), edgeHex, 1.15);
    addGlowRaw(mk(width / 2 - 0.08, width / 2 + 0.22, 0.09), edgeHex, 1.15);
  }
  function addGlowRaw(geo, hex, boost = 1.2) {
    _c.set(hex).multiplyScalar(boost);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    glowParts.push(geo);
  }

  const pathEdgeColors = [NEON.cyan, NEON.magenta, NEON.amber, NEON.lime, NEON.pink, NEON.purple, NEON.orange, NEON.blue, NEON.cyan, NEON.magenta, NEON.amber];
  pathChains.forEach((dirs, ci) => {
    ribbon(dirs, 3.2, pathEdgeColors[ci % pathEdgeColors.length]);
  });

  // ════════════ SIGNAGE ════════════
  function textSign(text, { w = 7, h = 1.8, fg = '#00f6ff', bg = 'rgba(6,2,20,0.92)', font = 900, size = 92 } = {}) {
    const [cv, ctx] = makeCanvas(512, Math.round(512 * h / w));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = fg; ctx.lineWidth = 10; ctx.strokeRect(8, 8, cv.width - 16, cv.height - 16);
    ctx.fillStyle = fg;
    ctx.font = `${font} ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = fg; ctx.shadowBlur = 26;
    ctx.fillText(text, cv.width / 2, cv.height / 2 + 4);
    const tex = canvasTexture(cv);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide })
    );
    return m;
  }
  function placeSign(mesh, lat, lon, yaw, x, y, z) {
    mesh.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
    mesh.applyMatrix4(frameAt(lat, lon, yaw, 0));
    signs.push(mesh);
  }

  // fingerposts at junctions — the maze needs whispers, not a map
  const POSTS = [
    ['ORBITAL LOOP ↑ STAIRS', 10, 50, 40, NEON.cyan],
    ['ORBITAL LOOP ↑', -8, 106, 130, NEON.cyan],
    ['ORBITAL LOOP ↑', -2, 210, 60, NEON.cyan],
    ['MARKET →', 4, 14, 100, NEON.amber],
    ['← CRASH SITE · THE CIRCUIT →', 6, 60, 118, NEON.cyan],
    ['ACROPOLIS ↑', -8, 100, 30, NEON.magenta],
    ['FOUNDRY RUINS →', 34, 172, 140, NEON.orange],
    ['THE DUNES ↓', -10, 218, 155, NEON.pink],
    ['PYRAMID — KEEP OUT', -24, 258, 145, NEON.red],
    ['PILGRIM STEPS · NO ENTRY', -28, 296, 60, NEON.red],
  ];
  for (const [txt, lat, lon, yaw, hex] of POSTS) {
    const s = textSign(txt, { w: 5.4, h: 1.15, fg: hexCss(hex), size: 64 });
    const postFrame = frameAt(lat, lon, yaw, 0);
    addSolid(T(box(0.18, 3.1, 0.18), 0, 1.55, 0), postFrame.clone(), 0x2a2140);
    placeSign(s, lat, lon, yaw, 0, 3.0, 0);
  }

  // ════════════ BUILDING KIT ════════════
  // Every tower is recorded so the detail layer (billboards, strobes,
  // searchlights, megaboards) can dress the skyline after the fact.
  const towerSpots = [];
  // A window-striped tower block: solid body + glow strips
  function tower(frame, w, h, d, bodyHex, glowHex, { strips = true, cap = true } = {}) {
    addSolid(T(box(w, h, d), 0, h / 2, 0), frame.clone(), bodyHex, { jitter: 0.06 });
    towerSpots.push({ frame: frame.clone(), w, h, d });
    if (strips) {
      const rows = Math.max(2, Math.floor(h / 3.2));
      for (let r = 0; r < rows; r++) {
        const y = 2.0 + r * (h - 3) / rows;
        if (rnd() < 0.24) continue;   // dark floors
        const g = box(w + 0.08, 0.5, d + 0.08);
        T(g, 0, y, 0);
        addGlow(g, frame.clone(), rnd() < 0.5 ? glowHex : pick(rnd, NEON_LIST), 1.05);
      }
    }
    if (cap) {
      const g = box(w * 0.5, 0.6, d * 0.5);
      T(g, 0, h + 0.3, 0);
      addGlow(g, frame.clone(), glowHex, 1.25);
    }
    // towers get the future-deco treatment too (bands, fins, halos)
    if (typeof futureDeco === 'function') futureDeco(frame, w, h, d, { rich: 0.55 });
    // rooftop clutter (NC landmarks: water towers + AC units) — makes
    // rooftop runs and AV overflights pay off
    if (h > 6 && rnd() < 0.35) {   // water tower
      const ox = (rnd() - 0.5) * w * 0.4, oz = (rnd() - 0.5) * d * 0.4;
      const tank = new THREE.CylinderGeometry(0.7, 0.7, 1.3, 7);
      addSolid(T(tank, ox, h + 1.55, oz), frame.clone(), 0x3a3060);
      const cone2 = new THREE.ConeGeometry(0.75, 0.5, 7);
      addSolid(T(cone2, ox, h + 2.45, oz), frame.clone(), 0x2a2450);
      for (let l = 0; l < 3; l++) {
        const a2 = l / 3 * Math.PI * 2;
        addSolid(T(box(0.09, 0.95, 0.09), ox + Math.cos(a2) * 0.5, h + 0.48, oz + Math.sin(a2) * 0.5),
          frame.clone(), 0x241e46, { collide: false });
      }
    } else if (h > 4 && rnd() < 0.4) {   // AC unit + fan ring
      const ox = (rnd() - 0.5) * w * 0.45, oz = (rnd() - 0.5) * d * 0.45;
      addSolid(T(box(1.1, 0.7, 0.9), ox, h + 0.35, oz), frame.clone(), 0x39325e);
      const fan = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 8);
      addSolid(T(fan, ox, h + 0.76, oz), frame.clone(), 0x1c1838, { collide: false });
    }
  }

  // A shanty stack: 2–4 offset boxes, catwalk planks, awning, signs
  function shanty(frame, base = 3.2, floors = 3) {
    let y = 0, wPrev = base;
    for (let f = 0; f < floors; f++) {
      const w = base * (1 - f * 0.12) * (0.85 + rnd() * 0.3);
      const h = 2.3 + rnd() * 0.9;
      const ox = (rnd() - 0.5) * 1.0, oz = (rnd() - 0.5) * 1.0;
      addSolid(T(box(w, h, w * (0.8 + rnd() * 0.4)), ox, y + h / 2, oz),
        frame.clone(), pick(rnd, [0x3b2a6e, 0x274b8a, 0x6e2a5c, 0x2a6e62, 0x584a8c]), { jitter: 0.12 });
      if (rnd() < 0.75) {  // window slit
        const g = box(w * 0.55, 0.34, 0.1);
        T(g, ox, y + h * 0.6, oz + w * 0.45);
        addGlow(g, frame.clone(), pick(rnd, NEON_LIST), 1.1);
      }
      y += h;
      wPrev = w;
    }
    if (rnd() < 0.6) {   // roof aerial
      addSolid(T(box(0.08, 1.6, 0.08), 0, y + 0.8, 0), frame.clone(), 0x222244, { collide: false });
    }
    return y;   // total height
  }

  // catwalk plank between two local points (world positions)
  function plank(a, b, width = 1.1, hex = 0x33285a, rail = true) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const up = mid.clone().normalize();
    const len = a.distanceTo(b);
    const fwd = b.clone().sub(a).normalize();
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const realUp = new THREE.Vector3().crossVectors(fwd, right).normalize();
    const m = new THREE.Matrix4().makeBasis(right, realUp, fwd).setPosition(mid);
    addSolid(T(box(width, 0.14, len), 0, 0, 0), m.clone(), hex, { jitter: 0.08 });
    if (rail) {
      addGlowViaMatrix(T(box(0.06, 0.06, len), width / 2, 0.55, 0), m.clone(), NEON.cyan, 0.9);
      addGlowViaMatrix(T(box(0.06, 0.06, len), -width / 2, 0.55, 0), m.clone(), NEON.magenta, 0.9);
      addSolid(T(box(0.05, 0.55, 0.05), width / 2, 0.27, len / 2 - 0.1), m.clone(), 0x222244);
      addSolid(T(box(0.05, 0.55, 0.05), -width / 2, 0.27, -len / 2 + 0.1), m.clone(), 0x222244);
    }
  }
  function addGlowViaMatrix(geo, m, hex, boost) {
    geo.applyMatrix4(m);
    addGlowRaw(geo, hex, boost);
  }

  // stairs: run of thin boxes climbing +y over +z
  function stairs(frame, width, rise, run, steps = 8) {
    for (let i = 0; i < steps; i++) {
      const g = box(width, rise / steps + 0.12, run / steps + 0.24);
      T(g, 0, (i + 0.5) * rise / steps, (i + 0.5) * run / steps);
      addSolid(g, frame.clone(), 0x2c2152, { jitter: 0.05 });
    }
  }

  // neon-lit tunnel following local +z, with floor/walls/roof
  function tunnel(frame, w, h, len, hex = NEON.cyan) {
    addSolid(T(box(w, 0.3, len), 0, -0.15, len / 2), frame.clone(), 0x1c1440);
    addSolid(T(box(0.3, h, len), -w / 2, h / 2, len / 2), frame.clone(), 0x241a4e);
    addSolid(T(box(0.3, h, len), w / 2, h / 2, len / 2), frame.clone(), 0x241a4e);
    addSolid(T(box(w + 0.6, 0.3, len), 0, h + 0.15, len / 2), frame.clone(), 0x1c1440);
    // ceiling light strip
    addGlow(T(box(0.3, 0.06, len * 0.94), 0, h - 0.08, len / 2), frame.clone(), hex, 1.2);
  }

  // ════════════ DISTRICTS ════════════

  // — CRASH SITE — your smoking escape pod
  {
    const f = frameAt(2, 0, 20);
    const pod = new THREE.SphereGeometry(1.7, 10, 8);
    pod.scale(1, 0.78, 1.35);
    addSolid(T(pod, 2.5, 0.9, -3), f.clone(), 0x8a93b0);
    addSolid(T(box(0.5, 0.2, 2.2), 3.6, 0.15, -1.2, 0.5), f.clone(), 0x6a7390);
    addGlow(T(box(0.9, 0.35, 0.12), 2.5, 1.1, -1.72), f.clone(), NEON.amber, 1.3);
    // scorch ring
    addGlowRaw(T(new THREE.RingGeometry(2.6, 3.0, 24), 0, 0, 0, 0, -Math.PI / 2).applyMatrix4(
      new THREE.Matrix4().makeTranslation(0, 0, 0).multiply(frameAt(2, 0, 0, 0.1)).multiply(new THREE.Matrix4().makeTranslation(2.5, 0.12, -3))), NEON.orange, 0.8);
    const gate = textSign('FIND THE SPACEPORT — ESCAPE VOLKARIS', { w: 8.4, h: 1.3, fg: hexCss(NEON.lime), size: 56 });
    placeSign(gate, 4.5, 3, 105, 0, 3.4, 0);
  }

  // — SCRAP MARKET — dense shanty bazaar, two catwalk levels
  {
    const anchor = DISTRICTS[1];
    const roofTops = [];
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2, dist = 4 + rnd() * 13;
      const lat = anchor.lat + Math.cos(a) * dist / R * 57.3;
      const lon = anchor.lon + Math.sin(a) * dist / R * 57.3 / Math.cos(anchor.lat * 0.0174);
      const f = frameAt(lat, lon, rnd() * 360);
      const hgt = shanty(f, 2.6 + rnd() * 1.6, 2 + (rnd() * 2.4 | 0));
      if (rnd() < 0.5) {
        roofTops.push(new THREE.Vector3().setFromMatrixPosition(f).addScaledVector(
          new THREE.Vector3().setFromMatrixColumn(f, 1), hgt + 0.1));
      }
    }
    // catwalks between random rooftop pairs (the upper maze layer)
    for (let i = 0; i + 1 < roofTops.length; i += 2) {
      if (roofTops[i].distanceTo(roofTops[i + 1]) < 17) plank(roofTops[i], roofTops[i + 1]);
    }
    // market stalls with awnings down the central lane
    for (let i = 0; i < 10; i++) {
      const f = frameAt(anchor.lat - 3 + rnd() * 6, anchor.lon - 14 + i * 3.4, (rnd() * 40 - 20));
      addSolid(T(box(2.4, 1.0, 1.4), 0, 0.5, 0), f.clone(), pick(rnd, [0x5c2a8a, 0x2a5c8a, 0x8a2a62]), { jitter: 0.1 });
      addSolid(T(box(2.8, 0.12, 1.9), 0, 2.05, 0.15, 0, -0.16), f.clone(), pick(rnd, [0xff7a1a, 0xff2fd6, 0x00f6ff]));
      addSolid(T(box(0.1, 2.0, 0.1), -1.28, 1.0, 0.8), f.clone(), 0x222244);
      addSolid(T(box(0.1, 2.0, 0.1), 1.28, 1.0, 0.8), f.clone(), 0x222244);
      if (rnd() < 0.7) addGlow(T(box(1.6, 0.3, 0.08), 0, 1.75, 0.9), f.clone(), pick(rnd, NEON_LIST), 1.2);
    }
    const gate = textSign('SCRAP MARKET', { fg: hexCss(NEON.amber) });
    placeSign(gate, anchor.lat + 4, anchor.lon - 13, 118, 0, 4.6, 0);
    // arch legs
    const gf = frameAt(anchor.lat + 4, anchor.lon - 13, 118);
    addSolid(T(box(0.5, 4.6, 0.5), -3.6, 2.3, 0), gf.clone(), 0x38286a);
    addSolid(T(box(0.5, 4.6, 0.5), 3.6, 2.3, 0), gf.clone(), 0x38286a);
    // secret passage: behind the last stall, a hatch tunnel dives toward the ruins
    const tf = frameAt(anchor.lat + 9, anchor.lon + 10, 262, 0.2);
    tunnel(tf, 2.4, 2.6, 20, NEON.lime);
    const hint = textSign('EAR TO THE GROUND: THE FOUNDRY HIDES A DOOR', { w: 6, h: 1, fg: hexCss(NEON.lime), size: 44 });
    placeSign(hint, anchor.lat + 9, anchor.lon + 8.4, 82, 0, 2.2, 0);
  }

  // — THE CIRCUIT — red light district: neon arches, holo dancers, bars
  {
    const a = DISTRICTS[2];
    // boulevard of glowing arches
    for (let i = 0; i < 7; i++) {
      const f = frameAt(a.lat + (i - 3) * 2.2, a.lon - 14 + i * 5.2, 96 + i * 4);
      const arch = new THREE.TorusGeometry(4.2, 0.16, 8, 20, Math.PI);
      T(arch, 0, 0.2, 0);
      addGlow(arch, f.clone(), i % 2 ? NEON.magenta : NEON.pink, 1.25);
      addSolid(T(box(0.4, 0.4, 0.4), -4.2, 0.2, 0), f.clone(), 0x2c2152);
      addSolid(T(box(0.4, 0.4, 0.4), 4.2, 0.2, 0), f.clone(), 0x2c2152);
    }
    // clubs: black boxes drenched in signage
    const names = ['NEON EDEN', 'CHROME KITTY', 'ZERO-G', 'PINK CIRCUIT', 'HOLO HOLO', 'THE JACK-IN'];
    for (let i = 0; i < 6; i++) {
      const lat = a.lat + (rnd() - 0.5) * 20, lon = a.lon + (rnd() - 0.5) * 24;
      const f = frameAt(lat, lon, rnd() * 360);
      const w = 5 + rnd() * 4, h = 4.5 + rnd() * 5, d = 5 + rnd() * 3;
      tower(f, w, h, d, 0x180f36, pick(rnd, [NEON.magenta, NEON.pink, NEON.red]), { strips: false });
      addGlow(T(box(w * 0.9, 0.22, 0.1), 0, h * 0.75, d / 2 + 0.1), f.clone(), NEON.magenta, 1.3);
      addGlow(T(box(0.22, h * 0.8, 0.1), -w / 2 - 0.12, h * 0.45, d / 2 - 1), f.clone(), NEON.pink, 1.25);
      const s = textSign(names[i], { w: Math.min(6, w), h: 1.2, fg: hexCss(pick(rnd, [NEON.magenta, NEON.pink, NEON.cyan])), size: 68 });
      placeSign(s, lat, lon, (Math.atan2(f.elements[8], f.elements[10]) * 57.3), 0, h + 0.9, 0);
    }
    // holo-dancer pylons — pulsing additive silhouettes (cheap + reliable)
    for (let i = 0; i < 4; i++) {
      const f = frameAt(a.lat - 4 + i * 2.4, a.lon + 3 + i * 3.1, rnd() * 360, 0.1);
      const sil = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.34, 1.0, 4, 8),
        new THREE.MeshBasicMaterial({ color: NEON.pink, transparent: true, opacity: 0.55, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      sil.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 2.2, 0).premultiply(f));
      signs.push(sil);
      dynamic.push({ mesh: sil, phase: rnd() * 6, update(dt, t) {
        sil.material.opacity = 0.35 + 0.25 * Math.sin(t * 2.2 + this.phase);
        sil.scale.y = 1 + 0.12 * Math.sin(t * 3.1 + this.phase);
      } });
      const pl = frameAt(a.lat - 4 + i * 2.4, a.lon + 3 + i * 3.1, 0, 0.1);
      addSolid(T(new THREE.CylinderGeometry(0.7, 0.9, 0.5, 10), 0, 0.25, 0), pl.clone(), 0x2c2152);
      addGlow(T(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 10), 0, 0.55, 0), pl.clone(), NEON.pink, 1.2);
    }
    const gate = textSign('THE CIRCUIT', { fg: hexCss(NEON.magenta) });
    placeSign(gate, a.lat + 3, a.lon - 10, 100, 0, 5.2, 0);
    const gf2 = frameAt(a.lat + 3, a.lon - 10, 100);
    addSolid(T(box(0.5, 5.2, 0.5), -3.6, 2.6, 0), gf2.clone(), 0x38286a);
    addSolid(T(box(0.5, 5.2, 0.5), 3.6, 2.6, 0), gf2.clone(), 0x38286a);
  }

  // — NEON ACROPOLIS — downtown towers + skybridges (vertical maze)
  {
    const a = DISTRICTS[3];
    const towerTops = [];
    for (let i = 0; i < 14; i++) {
      const ang = rnd() * Math.PI * 2, dist = 4 + rnd() * 15;
      const lat = a.lat + Math.cos(ang) * dist / R * 57.3;
      const lon = a.lon + Math.sin(ang) * dist / R * 57.3 / Math.cos(a.lat * 0.0174);
      const f = frameAt(lat, lon, rnd() * 360);
      const w = 5 + rnd() * 5, h = 9 + rnd() * 14, d = 5 + rnd() * 5;
      tower(f, w, h, d, pick(rnd, [0x201646, 0x1a1240, 0x261a52]), pick(rnd, NEON_LIST));
      if (h > 12 && rnd() < 0.85) {
        towerTops.push({
          pos: new THREE.Vector3().setFromMatrixPosition(f).addScaledVector(new THREE.Vector3().setFromMatrixColumn(f, 1), h + 0.1),
          h,
        });
      }
      // entrance glow
      addGlow(T(box(2.0, 2.6, 0.14), 0, 1.3, d / 2 + 0.05), f.clone(), NEON.cyan, 1.1);
    }
    // skybridges between tower tops of similar height
    towerTops.sort((p, q) => p.h - q.h);
    for (let i = 0; i + 1 < towerTops.length; i += 2) {
      const A = towerTops[i], B = towerTops[i + 1];
      if (A.pos.distanceTo(B.pos) < 22) plank(A.pos, B.pos, 1.6);
    }
    // plaza obelisk — a beacon you can see over the horizon glow
    const f = frameAt(a.lat, a.lon, 0);
    addSolid(T(new THREE.CylinderGeometry(0.8, 1.6, 15, 6), 0, 7.5, 0), f.clone(), 0x120c2e);
    addGlow(T(new THREE.CylinderGeometry(0.26, 0.26, 14.4, 6), 0, 7.5, 0), f.clone(), NEON.cyan, 0.85);
    const gate = textSign('NEON ACROPOLIS', { fg: hexCss(NEON.cyan) });
    placeSign(gate, a.lat - 5, a.lon - 12, 150, 0, 5.4, 0);
    const gf3 = frameAt(a.lat - 5, a.lon - 12, 150);
    addSolid(T(box(0.5, 5.4, 0.5), -3.6, 2.7, 0), gf3.clone(), 0x38286a);
    addSolid(T(box(0.5, 5.4, 0.5), 3.6, 2.7, 0), gf3.clone(), 0x38286a);
  }

  // — FOUNDRY RUINS — skeletal factories, chimneys, crashed freighter
  {
    const a = DISTRICTS[4];
    for (let i = 0; i < 8; i++) {
      const lat = a.lat + (rnd() - 0.5) * 26, lon = a.lon + (rnd() - 0.5) * 30;
      const f = frameAt(lat, lon, rnd() * 360);
      // broken frame: columns + partial beams, walkable upper slab
      const w = 7 + rnd() * 5, d = 6 + rnd() * 4, h = 6 + rnd() * 7;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        addSolid(T(box(0.6, h, 0.6), sx * w / 2, h / 2, sz * d / 2), f.clone(), 0x241c3e, { jitter: 0.1 });
      }
      if (rnd() < 0.75) addSolid(T(box(w + 0.6, 0.4, d + 0.6), 0, h, 0), f.clone(), 0x2c2444);
      if (rnd() < 0.5) addSolid(T(box(w * 0.7, 0.3, 1.4), 0, h * 0.55, 0, 0, 0, 0.18), f.clone(), 0x241c3e);
      if (rnd() < 0.6) {
        addSolid(T(new THREE.CylinderGeometry(0.9, 1.2, h + 4, 8), w / 2 + 1.6, (h + 4) / 2, 0), f.clone(), 0x1e1636);
        addGlow(T(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8), w / 2 + 1.6, h + 4.1, 0), f.clone(), NEON.orange, 1.1);
      }
    }
    // crashed freighter (the game's GLB if it loaded, else a hull box)
    if (models.Freighter) {
      const ship = models.Freighter.clone();
      ship.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
      const f = frameAt(a.lat + 6, a.lon + 9, 205, -0.8);
      ship.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.34).premultiply(new THREE.Matrix4().makeRotationY(1.2)).premultiply(new THREE.Matrix4().makeTranslation(0, 2.4, 0)).premultiply(f));
      ship.scale.multiplyScalar(2.4);
      signs.push(ship);   // rendered as-is
      // collision hull under it
      addSolid(T(box(9, 3.4, 22, 0.3), 0, 1.7, 0), f.clone(), 0x3a3550, { jitter: 0 });
    } else {
      const f = frameAt(a.lat + 6, a.lon + 9, 205, -0.5);
      addSolid(T(box(8, 3.2, 20), 0, 1.6, 0, 0.25, 0, 0.1), f.clone(), 0x4a4468);
      addGlow(T(box(1.2, 1.2, 0.3), 0, 2.2, 10.2), f.clone(), NEON.orange, 1.2);
    }
    // the market secret tunnel surfaces here, behind a chimney
    const tf = frameAt(a.lat - 2, a.lon - 14, 40, 0.2);
    tunnel(tf, 2.4, 2.6, 18, NEON.lime);
    const gate = textSign('FOUNDRY RUINS', { fg: hexCss(NEON.orange) });
    placeSign(gate, a.lat + 5, a.lon - 12, 208, 0, 4.8, 0);
  }

  // — THE PINK DUNES — open badlands, hoodoo rocks, one lone bar
  {
    const a = DISTRICTS[5];
    for (let i = 0; i < 9; i++) {
      const f = frameAt(a.lat + (rnd() - 0.5) * 22, a.lon + (rnd() - 0.5) * 26, rnd() * 360);
      const hh = 2 + rnd() * 6;
      addSolid(T(new THREE.CylinderGeometry(0.7 + rnd() * 0.8, 1.4 + rnd() * 1.2, hh, 7), 0, hh / 2, 0),
        f.clone(), pick(rnd, [0xb0538e, 0x9a4bd6, 0xd66a9e]), { jitter: 0.14 });
    }
    const f = frameAt(a.lat + 2, a.lon + 4, 250);
    addSolid(T(box(5, 3.4, 4), 0, 1.7, 0), f.clone(), 0x24104a);
    addGlow(T(box(4.2, 0.3, 0.12), 0, 3.0, 2.06), f.clone(), NEON.amber, 1.3);
    const s = textSign('LAST LIGHT SALOON', { w: 4.6, h: 1, fg: hexCss(NEON.amber), size: 56 });
    placeSign(s, a.lat + 2, a.lon + 4, 250, 0, 4.1, 0);
  }

  // — THE OBSIDIAN PYRAMID — Overlord Vex's fortress
  const pyramidInfo = {};
  {
    const a = DISTRICTS[6];
    const f = frameAt(a.lat, a.lon, 320, 0.6);
    const B = 22, H = 18;   // base half-width, height
    // 4 triangular faces built as custom geometry, front face has a gate slot
    function face(rotY, gate = false) {
      const g = new THREE.BufferGeometry();
      const verts = [];
      const A = [-B, 0, B], Bv = [B, 0, B], apex = [0, H, 0];
      if (!gate) {
        verts.push(...A, ...Bv, ...apex);
      } else {
        // leave a 6-wide × 9-tall doorway in the middle of the face
        const gw = 3.4, gh = 7;
        verts.push(
          -B, 0, B, -gw, 0, B, -gw * 0.65, gh, B * (1 - gh / H),
          -B, 0, B, -gw * 0.65, gh, B * (1 - gh / H), 0, H, 0,
          gw, 0, B, B, 0, B, 0, H, 0,
          gw, 0, B, 0, H, 0, gw * 0.65, gh, B * (1 - gh / H),
          -gw * 0.65, gh, B * (1 - gh / H), gw * 0.65, gh, B * (1 - gh / H), 0, H, 0
        );
      }
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      g.computeVertexNormals();
      g.rotateY(rotY);
      return g;
    }
    for (let i = 0; i < 4; i++) {
      addSolid(face(i * Math.PI / 2, i === 0), f.clone(), 0x0b0a18, { jitter: 0 });
    }
    // neon edge rails: corner → apex, built as oriented cylinders
    function glowSegment(a, b, radius, hex, frame, boost = 0.95) {
      const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
      const len = av.distanceTo(bv);
      const e = new THREE.CylinderGeometry(radius, radius, len, 6);
      e.translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), bv.clone().sub(av).normalize());
      e.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(av));
      addGlow(e, frame.clone(), hex, boost);
    }
    for (const [cx, cz] of [[-B, -B], [B, -B], [-B, B], [B, B]]) {
      glowSegment([cx, 0, cz], [0, H, 0], 0.22, NEON.red, f);
    }
    addGlow(T(new THREE.SphereGeometry(1.6, 10, 8), 0, H + 1.2, 0), f.clone(), NEON.red, 1.35);
    // interior: throne hall floor, columns, throne dais + secret door
    addSolid(T(box(20, 0.5, 20), 0, 0.25, 4), f.clone(), 0x141026);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      addSolid(T(new THREE.CylinderGeometry(0.8, 0.9, 10, 8), sx * 6, 5, 16 - k * 8), f.clone(), 0x1c1632);
      addGlow(T(box(0.2, 8.6, 0.2), sx * 6.9, 5, 16 - k * 8), f.clone(), NEON.red, 0.9);
    }
    addSolid(T(box(8, 1.2, 6), 0, 0.6, -8), f.clone(), 0x1c1030);       // dais
    addSolid(T(box(8, 0.4, 1.2), 0, 0.2, -4.4), f.clone(), 0x1c1030);   // dais step 1
    addSolid(T(box(8, 0.8, 1.2), 0, 0.4, -5.4), f.clone(), 0x1c1030);   // dais step 2
    addSolid(T(box(2.2, 3.4, 0.8), 0, 2.3, -10.4), f.clone(), 0x241436); // throne back
    addSolid(T(box(2.2, 0.8, 1.6), 0, 1.0, -9.6), f.clone(), 0x241436);  // seat
    addGlow(T(box(2.4, 0.14, 0.9), 0, 1.44, -9.55), f.clone(), NEON.red, 1.2);
    pyramidInfo.throne = new THREE.Vector3(0, 1.3, -9.4).applyMatrix4(f.clone());
    pyramidInfo.gate = new THREE.Vector3(0, 1, B + 2).applyMatrix4(f.clone());
    pyramidInfo.hall = new THREE.Vector3(0, 1, 6).applyMatrix4(f.clone());

    // ★ THE SECRET PASSAGE ★ — behind the throne, a red-lit bore
    // tunnel runs toward Port Meridian (surfaces at the pilgrim steps' end)
    const tf = frameAt(a.lat + 1.5, a.lon + 2.8, 148, 0.4);
    tunnel(tf, 2.4, 2.7, 26, NEON.red);
    const s = textSign('AUTHORIZED: VEX ONLY', { w: 3.6, h: 0.8, fg: hexCss(NEON.red), size: 44 });
    placeSign(s, a.lat + 1.5, a.lon + 2.8, 148, 0, 3.1, 1);

    // throne hall lighting — the red gloom of the Overlord
    {
      const hall = new THREE.PointLight(0xff3355, 3.2, 46, 1.2);
      hall.position.copy(new THREE.Vector3(0, 9, 4).applyMatrix4(f.clone()));
      signs.push(hall);
      const gate = new THREE.PointLight(0xff7a1a, 1.6, 26, 1.4);
      gate.position.copy(new THREE.Vector3(0, 6, B - 6).applyMatrix4(f.clone()));
      signs.push(gate);
    }

    // perimeter watch pylons
    for (let i = 0; i < 6; i++) {
      const ang = i / 6 * 360;
      const lat2 = a.lat + Math.cos(ang * 0.0174) * 26 / 1.05, lon2 = a.lon + Math.sin(ang * 0.0174) * 30 / Math.max(0.3, Math.cos(a.lat * 0.0174));
      const pf = frameAt(lat2, lon2, ang + 90);
      addSolid(T(box(0.8, 7, 0.8), 0, 3.5, 0), pf.clone(), 0x140f28);
      addGlow(T(box(1.0, 0.5, 1.0), 0, 7.3, 0), pf.clone(), NEON.red, 1.2);
    }
  }

  // — PORT MERIDIAN — the goal, hidden inside a crater ring
  const portInfo = {};
  {
    const a = DISTRICTS[7];
    const f = frameAt(a.lat, a.lon, 40, 0.3);
    // landing pad
    addSolid(T(new THREE.CylinderGeometry(11, 11.8, 0.8, 24), 0, 0.4, 0), f.clone(), 0x181233);
    addGlowRaw(T(new THREE.TorusGeometry(10.4, 0.18, 6, 40), 0, 0.86, 0, 0, Math.PI / 2)
      .applyMatrix4(f.clone()), NEON.lime, 1.3);
    // pad number + beacons
    for (let i = 0; i < 8; i++) {
      const ang = i / 8 * Math.PI * 2;
      const bx = Math.cos(ang) * 13.4, bz = Math.sin(ang) * 13.4;
      addSolid(T(box(0.3, 2.4, 0.3), bx, 1.2, bz), f.clone(), 0x222244);
      const bg = T(box(0.42, 0.42, 0.42), bx, 2.6, bz);
      addGlow(bg, f.clone(), i % 2 ? NEON.lime : NEON.cyan, 1.35);
    }
    // control tower
    addSolid(T(new THREE.CylinderGeometry(1.2, 1.6, 14, 8), 16, 7, -6), f.clone(), 0x1c1640);
    addSolid(T(new THREE.CylinderGeometry(3.2, 3.2, 2.6, 8), 16, 15, -6), f.clone(), 0x241a4e);
    addGlow(T(new THREE.CylinderGeometry(3.3, 3.3, 0.5, 8), 16, 15, -6), f.clone(), NEON.cyan, 1.2);
    // fuel silos
    for (const [sx, sz] of [[-14, 8], [-10, 14], [-16, 1]]) {
      addSolid(T(new THREE.CylinderGeometry(2.2, 2.2, 6, 10), sx, 3, sz), f.clone(), 0x30265c);
      addGlow(T(new THREE.TorusGeometry(2.24, 0.1, 6, 16), sx, 5.2, sz, 0, Math.PI / 2), f.clone(), NEON.amber, 1.1);
    }

    // ── the full spaceport treatment ──
    // control tower crown: angled glass cap, warm-lit, + walkable
    // catwalk ring where the freight lifts dock
    addSolid(T(new THREE.CylinderGeometry(4.4, 3.9, 0.35, 14), 16, 16.45, -6), f.clone(), 0x241e4e);
    addSolid(T(new THREE.CylinderGeometry(3.5, 2.5, 1.8, 8), 16, 17.25, -6), f.clone(), 0x2c2458);
    addGlow(T(new THREE.CylinderGeometry(3.42, 2.9, 0.6, 8), 16, 17.45, -6), f.clone(), 0xffd9a0, 1.15);
    addSolid(T(new THREE.CylinderGeometry(3.7, 3.7, 0.3, 8), 16, 18.25, -6), f.clone(), 0x1c1640);
    for (const a0 of [0.35, Math.PI + 0.35]) {   // railing arcs, gaps at the lift docks
      const railA = new THREE.TorusGeometry(4.25, 0.06, 5, 18, Math.PI - 0.7);
      railA.rotateZ(a0);
      railA.rotateX(Math.PI / 2);
      railA.translate(16, 17.4, -6);
      addGlow(railA, f.clone(), NEON.amber, 1.0);
    }
    // rotating radar bar on the crown
    {
      const radar = new THREE.Group();
      radar.applyMatrix4(f.clone().multiply(new THREE.Matrix4().makeTranslation(16, 18.4, -6)));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.9, 6),
        new THREE.MeshBasicMaterial({ color: 0x241e4e }));
      mast.position.y = 0.45;
      radar.add(mast);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.3),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.lime).multiplyScalar(1.15), toneMapped: false }));
      bar.position.y = 0.95;
      radar.add(bar);
      signs.push(radar);
      dynamic.push({ update(dt, t) { bar.rotation.y = t * 1.5; } });
    }
    // tower lifts: pad level ↔ crown catwalk (paternoster pair);
    // dock pads seated on the real terrain, not the tangent plane
    {
      const yW = localGroundY(f, 16 - 5.7, -6) + 0.45;
      const yE = localGroundY(f, 16 + 5.7, -6) + 0.45;
      makeElevator(f.clone(), 16 - 5.7, -6, yW, 16.5, 0, NEON.amber);
      makeElevator(f.clone(), 16 + 5.7, -6, yE, 16.5, (16.5 - yE) / ELEV_SPEED + ELEV_PAUSE, NEON.amber);
    }

    // own surface frame at f-local (cx, cz), yawed so local +z faces the pad
    function apronFrame(cx, cz) {
      const wp = new THREE.Vector3(cx, 0, cz).applyMatrix4(f.clone());
      const dir2 = wp.normalize();
      const { up: au, east: ae, north: an } = tangentFrame(dir2);
      const toward = new THREE.Vector3().setFromMatrixPosition(f.clone())
        .sub(surfacePoint(dir2, new THREE.Vector3()));
      toward.addScaledVector(au, -toward.dot(au)).normalize();
      return frameAtDir(dir2, Math.atan2(toward.dot(ae), toward.dot(an)) * 57.29578, 0.3);
    }

    // two open hangars flanking the north beacon, doors facing the pad
    function hangar(cx, cz, withShuttle) {
      const hf = apronFrame(cx, cz);
      const hw = 8.4, hd = 5.6, hh = 4.6, wt = 0.35;
      addSolid(T(box(hw, 0.25, hd), 0, 0.12, 0), hf.clone(), 0x181233);                          // slab
      addSolid(T(box(hw, hh, wt), 0, hh / 2, -hd / 2 + wt / 2), hf.clone(), 0x2a2154, { jitter: 0.06 });
      addSolid(T(box(wt, hh, hd), -hw / 2 + wt / 2, hh / 2, 0), hf.clone(), 0x2a2154, { jitter: 0.06 });
      addSolid(T(box(wt, hh, hd), hw / 2 - wt / 2, hh / 2, 0), hf.clone(), 0x2a2154, { jitter: 0.06 });
      addSolid(T(box(hw + 0.5, 0.35, hd + 0.5), 0, hh + 0.17, 0), hf.clone(), 0x241a4e);         // roof
      addGlow(T(box(hw * 0.7, 0.1, 0.3), 0, hh - 0.18, -0.6), hf.clone(), NEON.cyan, 1.1);       // ceiling strip
      addGlow(T(box(0.08, hh * 0.7, 0.08), -hw / 2 + 0.3, hh * 0.4, hd / 2 - 0.15), hf.clone(), NEON.lime, 1.15);
      addGlow(T(box(0.08, hh * 0.7, 0.08), hw / 2 - 0.3, hh * 0.4, hd / 2 - 0.15), hf.clone(), NEON.lime, 1.15);
      addGlow(T(box(hw * 0.9, 0.12, 0.12), 0, hh + 0.4, hd / 2 + 0.1), hf.clone(), NEON.orange, 1.2); // lintel
      if (withShuttle) {   // parked procedural shuttle, nose toward the door
        addSolid(T(new THREE.CylinderGeometry(0.65, 0.8, 3.4, 10), 0, 1.05, -0.4, 0, Math.PI / 2), hf.clone(), 0x8a93b0);
        addSolid(T(new THREE.ConeGeometry(0.62, 1.1, 10), 0, 1.05, 1.85, 0, Math.PI / 2), hf.clone(), 0x9aa2bc);
        addSolid(T(box(3.6, 0.1, 1.1), 0, 0.85, -0.7), hf.clone(), 0x6a7390);                    // wings
        addSolid(T(box(0.1, 1.0, 0.9), 0, 1.95, -1.75), hf.clone(), 0x6a7390);                   // tail fin
        for (const sk of [-1, 1]) addSolid(T(box(0.16, 0.42, 2.2), sk * 0.7, 0.24, -0.3), hf.clone(), 0x4a5470);
        addGlow(T(box(0.5, 0.5, 0.1), 0, 1.05, -2.2), hf.clone(), NEON.cyan, 1.2);               // idle engine
        addGlow(T(box(0.5, 0.16, 0.1), 0, 1.3, 1.2), hf.clone(), NEON.amber, 1.1);               // canopy strip
      }
    }
    hangar(6.12, 14.78, true);
    hangar(-6.12, 14.78, false);

    // pad edge lights — studs ringing the landing pad, seated on terrain
    for (let i = 0; i < 20; i++) {
      const ang2 = i / 20 * Math.PI * 2;
      const lx2 = Math.cos(ang2) * 12.4, lz2 = Math.sin(ang2) * 12.4;
      addGlow(T(box(0.3, 0.22, 0.3), lx2, localGroundY(f, lx2, lz2) + 0.12, lz2), f.clone(),
        i % 2 ? NEON.lime : NEON.magenta, 1.3);
    }

    // DEPARTURES board on a stand
    {
      const [bcv, bctx] = makeCanvas(512, 320);
      bctx.fillStyle = 'rgba(4,2,16,0.94)'; bctx.fillRect(0, 0, 512, 320);
      bctx.strokeStyle = hexCss(NEON.cyan); bctx.lineWidth = 6; bctx.strokeRect(5, 5, 502, 310);
      bctx.font = '900 44px Orbitron, sans-serif'; bctx.textBaseline = 'alphabetic';
      bctx.fillStyle = hexCss(NEON.cyan); bctx.textAlign = 'center';
      bctx.shadowColor = hexCss(NEON.cyan); bctx.shadowBlur = 16;
      bctx.fillText('DEPARTURES', 256, 62);
      bctx.font = '700 30px Orbitron, sans-serif'; bctx.shadowBlur = 8;
      const rows = [
        ['NEON CITY', 'BOARDING', '#5dffb2'], ['KEPLER GATE', 'DELAYED', '#ffc400'],
        ['VEGA SPRAWL', 'ON TIME', '#00f6ff'], ['SOL RELAY', 'CANCELLED', '#ff2e4d'],
      ];
      rows.forEach(([dst, st, cc], i) => {
        const ry2 = 128 + i * 48;
        bctx.textAlign = 'left'; bctx.fillStyle = '#e8e2ff'; bctx.shadowColor = '#e8e2ff';
        bctx.fillText(dst, 34, ry2);
        bctx.textAlign = 'right'; bctx.fillStyle = cc; bctx.shadowColor = cc;
        bctx.fillText(st, 478, ry2);
      });
      const bf = apronFrame(12.5, 3);
      addSolid(T(box(0.16, 2.4, 0.16), -1.9, 1.2, 0), bf.clone(), 0x241e4e);
      addSolid(T(box(0.16, 2.4, 0.16), 1.9, 1.2, 0), bf.clone(), 0x241e4e);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.9),
        new THREE.MeshBasicMaterial({ map: canvasTexture(bcv), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
      board.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 3.8, 0).premultiply(bf));
      signs.push(board);
      addGlow(T(box(4.8, 0.1, 0.1), 0, 5.35, 0), bf.clone(), NEON.cyan, 1.2);
    }

    // extra fuel silos + a transfer pipe beside the control tower
    // (the SE apron — the pilgrim steps enter the crater further west)
    {
      const siloBases = [];
      for (const [sx2, sz2] of [[10.8, -12.4], [14.2, -9.6]]) {
        const sf2 = apronFrame(sx2, sz2);
        addSolid(T(new THREE.CylinderGeometry(1.9, 1.9, 5.2, 10), 0, 2.5, 0), sf2.clone(), 0x30265c);
        addGlow(T(new THREE.TorusGeometry(1.94, 0.09, 5, 14), 0, 4.3, 0, 0, Math.PI / 2), sf2.clone(), NEON.amber, 1.1);
        siloBases.push(new THREE.Vector3(0, 0.9, 0).applyMatrix4(sf2));
      }
      const midP = siloBases[0].clone().add(siloBases[1]).multiplyScalar(0.5);
      const fwdP = siloBases[1].clone().sub(siloBases[0]);
      const lenP = fwdP.length(); fwdP.normalize();
      const upP = midP.clone().normalize();
      const rtP = new THREE.Vector3().crossVectors(upP, fwdP).normalize();
      const ruP = new THREE.Vector3().crossVectors(fwdP, rtP).normalize();
      addSolid(T(box(0.24, 0.24, lenP), 0, 0, 0),
        new THREE.Matrix4().makeBasis(rtP, ruP, fwdP).setPosition(midP), 0x2a3a6e, { collide: false });
    }

    // perimeter fence — posts + thin glow lines, gated where streets cross
    {
      const pDir = sphDir(a.lat, a.lon);
      const { east: fE, north: fN } = tangentFrame(pDir);
      const posts = [];
      const NP = 22, FR = 19.5;
      for (let i = 0; i < NP; i++) {
        const ang2 = i / NP * Math.PI * 2;
        const d2 = pDir.clone().multiplyScalar(R)
          .addScaledVector(fE, Math.cos(ang2) * FR).addScaledVector(fN, Math.sin(ang2) * FR).normalize();
        let pd2 = 1e9;
        for (const ps of pathSamples) { const dd = d2.distanceToSquared(ps); if (dd < pd2) pd2 = dd; }
        if (Math.sqrt(pd2) * R < 3.4) { posts.push(null); continue; }   // street gate
        const pf2 = frameAtDir(d2, 0, 0.2);
        addSolid(T(box(0.18, 1.9, 0.18), 0, 0.95, 0), pf2.clone(), 0x241e4e);
        addGlow(T(box(0.26, 0.14, 0.26), 0, 1.95, 0), pf2.clone(), NEON.lime, 1.1);
        posts.push(surfacePoint(d2, new THREE.Vector3()).addScaledVector(d2, 1.5));
      }
      for (let i = 0; i < NP; i++) {
        const A2 = posts[i], B2 = posts[(i + 1) % NP];
        if (!A2 || !B2) continue;
        const mid = A2.clone().add(B2).multiplyScalar(0.5);
        const fwd = B2.clone().sub(A2);
        const len = fwd.length(); fwd.normalize();
        const upv = mid.clone().normalize();
        const rt = new THREE.Vector3().crossVectors(upv, fwd).normalize();
        const ru = new THREE.Vector3().crossVectors(fwd, rt).normalize();
        const m2 = new THREE.Matrix4().makeBasis(rt, ru, fwd).setPosition(mid);
        addGlowViaMatrix(box(0.06, 0.06, len), m2, NEON.lime, 0.85);
      }
    }

    const s = textSign('PORT MERIDIAN — DEPARTURES', { w: 9, h: 1.4, fg: hexCss(NEON.lime), size: 56 });
    placeSign(s, a.lat - 3.4, a.lon - 4, 132, 0, 4.8, 0);
    portInfo.padCenter = new THREE.Vector3(0, 1.0, 0).applyMatrix4(f.clone());
    portInfo.shipFrame = f.clone();
    portInfo.dir = sphDir(a.lat, a.lon);
  }

  // ════════════ ENTERABLE BUILDINGS — exteriors AND interiors ════════
  // A hollow shell with a real doorway: floor, three walls, a split
  // front wall with a lintel, roof — and furniture inside. The merged
  // BVH makes the interior walkable for free.
  function enterable(f, zoneKey) {
    const w = 5.5 + rnd() * 2.5, d = 5.5 + rnd() * 2.5, h = 3.6 + rnd() * 1.6;
    const th = 0.35, doorW = 1.7, doorH = 2.7;
    const hues = {
      market: [0x3b2a6e, 0x274b8a, 0x6e2a5c], circuit: [0x22103e, 0x2a0f30],
      downtown: [0x201646, 0x261a52], ruins: [0x2a2248, 0x241c3e],
    }[zoneKey] ?? [0x3b2a6e];
    const hue = pick(rnd, hues);
    addSolid(T(box(w, 0.3, d), 0, 0.15, 0), f.clone(), 0x1a1436);                       // floor
    addSolid(T(box(w, h, th), 0, h / 2, -d / 2 + th / 2), f.clone(), hue, { jitter: 0.1 }); // back
    addSolid(T(box(th, h, d), -w / 2 + th / 2, h / 2, 0), f.clone(), hue, { jitter: 0.1 }); // left
    addSolid(T(box(th, h, d), w / 2 - th / 2, h / 2, 0), f.clone(), hue, { jitter: 0.1 });  // right
    const seg = (w - doorW) / 2;
    addSolid(T(box(seg, h, th), -(doorW + seg) / 2, h / 2, d / 2 - th / 2), f.clone(), hue, { jitter: 0.1 });
    addSolid(T(box(seg, h, th), (doorW + seg) / 2, h / 2, d / 2 - th / 2), f.clone(), hue, { jitter: 0.1 });
    addSolid(T(box(doorW + 0.2, h - doorH, th), 0, doorH + (h - doorH) / 2, d / 2 - th / 2), f.clone(), hue); // lintel
    addSolid(T(box(w + 0.3, 0.3, d + 0.3), 0, h + 0.15, 0), f.clone(), hue, { jitter: 0.08 }); // roof
    // door glow + interior dressing
    addGlow(T(box(doorW + 0.3, 0.1, 0.12), 0, doorH + 0.1, d / 2 + 0.02), f.clone(), pick(rnd, NEON_LIST), 1.2);
    addGlow(T(box(w * 0.5, 0.08, 0.4), 0, h - 0.12, 0), f.clone(), pick(rnd, [NEON.cyan, NEON.amber, NEON.pink]), 0.9); // ceiling strip
    // furnishing layout, chosen by seed
    const layout = (rnd() * 3) | 0;
    if (layout === 0) {           // shopfront: counter + crates
      addSolid(T(box(w * 0.5, 0.9, 0.8), 0, 0.75, -d / 2 + 1.0), f.clone(), 0x241a4e);     // counter
      addSolid(T(box(0.8, 0.7, 0.8), -w / 2 + 1.0, 0.65, 0.4, rnd()), f.clone(), 0x30265c); // crate
      addSolid(T(box(0.6, 0.5, 0.6), w / 2 - 1.1, 0.55, -0.6, rnd()), f.clone(), 0x2a3a6e); // crate
    } else if (layout === 1) {    // dive bar: side counter, stools, lit shelf
      addSolid(T(box(0.8, 1.0, d * 0.6), -w / 2 + 1.2, 0.65, -0.4), f.clone(), 0x241a4e);   // bar counter
      for (let st2 = 0; st2 < 3; st2++) {
        addSolid(T(new THREE.CylinderGeometry(0.26, 0.3, 0.62, 8), -w / 2 + 2.2, 0.46, -d * 0.28 + st2 * d * 0.24),
          f.clone(), 0x30265c);
      }
      addSolid(T(box(0.3, 1.5, d * 0.5), -w / 2 + th + 0.16, h - 1.35, -0.4), f.clone(), 0x1c1444); // back shelf
      addGlow(T(box(0.1, 0.08, d * 0.45), -w / 2 + th + 0.34, h - 0.7, -0.4), f.clone(),
        pick(rnd, [NEON.magenta, NEON.amber, NEON.pink]), 1.1);                             // bottle glow
    } else {                      // workshop: bench, lit tool wall, crate stack
      addSolid(T(box(w * 0.55, 0.85, 0.9), 0, 0.6, -d / 2 + 0.95), f.clone(), 0x2c2452);    // bench
      addSolid(T(box(w * 0.4, 1.1, 0.1), 0, 1.9, -d / 2 + th + 0.07), f.clone(), 0x1c1840); // tool board
      addGlow(T(box(w * 0.36, 0.06, 0.06), 0, 2.5, -d / 2 + th + 0.12), f.clone(), NEON.lime, 1.0);
      addSolid(T(box(0.7, 0.6, 0.7), w / 2 - 1.0, 0.5, 0.5, rnd()), f.clone(), 0x30265c);   // crates
      addSolid(T(box(0.55, 0.5, 0.55), w / 2 - 1.05, 1.05, 0.55, rnd()), f.clone(), 0x2a3a6e);
    }
    return h;
  }

  // ════════════ VENICE WARRENS — enclosed winding district streets ════
  // A recursive-backtracker maze per district: the WALLS are buildings,
  // so every district is a warren of narrow enclosed alleys that guide
  // you like Venice — with sottoporteghi (passages UNDER buildings) and
  // a small campo (plaza) at the heart.
  // ════════════ FUTURE DECO ════════════
  // Afrofuturist dressing for plain block buildings: window matrices,
  // gold trim bands, vertical fin ribs, chevron sigils, halo rings and
  // crown fins. Everything merges into the existing solid/glow streams
  // (deco never colliders — the box beneath already blocks).
  function futureDeco(f, w, h, d, { rich = 1 } = {}) {
    if (h < 2.4) return;
    const DECO_GOLD = 0xc9a227, DECO_BRONZE = 0x7a5c1e;   // in-function: tower() calls before the outer consts would initialize
    // art goes on the broad face; its normal axis depends on the box
    const onX = d > w;                       // warren walls are thin in x
    const fw = onX ? d : w;                  // width along the face
    const off = (onX ? w : d) / 2 + 0.05;    // proud of the wall
    const P = (u, y, s = 1) => onX ? [off * s, y, u] : [u, y, off * s];
    // 1) window matrix — future panes, some dark
    if (rnd() < 0.5 * rich) {
      const rows = Math.min(4, Math.max(2, Math.floor(h / 2.1)));
      const cols = Math.min(4, Math.max(2, Math.floor(fw / 1.5)));
      const winHex = pick(rnd, [0xfff2cc, 0x9adfff, 0x00f6ff, 0xffd27a]);
      const side = rnd() < 0.5 ? 1 : -1;
      for (let r2 = 0; r2 < rows; r2++) for (let c2 = 0; c2 < cols; c2++) {
        if (rnd() < 0.32) continue;
        const u = (c2 + 0.5) / cols * (fw - 0.6) - (fw - 0.6) / 2;
        const y = 1.1 + (r2 + 0.5) * (h - 1.8) / rows;
        const g = onX ? box(0.07, 0.52, 0.36) : box(0.36, 0.52, 0.07);
        addGlow(T(g, ...P(u, y, side)), f.clone(), winHex, 0.8);
      }
    }
    // 2) gold trim band wrapping the crown line
    if (rnd() < 0.42 * rich) {
      addSolid(T(box(w + 0.14, 0.2, d + 0.14), 0, h * (0.68 + rnd() * 0.2), 0),
        f.clone(), rnd() < 0.7 ? DECO_GOLD : DECO_BRONZE, { collide: false });
    }
    // 3) vertical fin ribs
    if (rnd() < 0.34 * rich) {
      const nR = 2 + (rnd() * 2 | 0);
      const side = rnd() < 0.5 ? 1 : -1;
      for (let k = 0; k < nR; k++) {
        const u = (k + 1) / (nR + 1) * fw - fw / 2;
        const g = onX ? box(0.16, h * 0.78, 0.14) : box(0.14, h * 0.78, 0.16);
        addSolid(T(g, ...P(u, h * 0.42, side)), f.clone(),
          rnd() < 0.6 ? DECO_GOLD : 0x2c2452, { collide: false });
      }
    }
    // 4) chevron sigil — the triangular motif
    if (rnd() < 0.24 * rich) {
      const y = h * (0.45 + rnd() * 0.3);
      const hex = pick(rnd, [DECO_GOLD, 0xff7a1a, 0x00f6ff, 0xff2fd6]);
      const side = rnd() < 0.5 ? 1 : -1;
      addGlow(T(onX ? box(0.08, 0.7, 0.14) : box(0.14, 0.7, 0.08), ...P(-0.28, y, side), 0, 0, 0.55), f.clone(), hex, 0.95);
      addGlow(T(onX ? box(0.08, 0.7, 0.14) : box(0.14, 0.7, 0.08), ...P(0.28, y, side), 0, 0, -0.55), f.clone(), hex, 0.95);
      addGlow(T(onX ? box(0.08, 0.3, 0.3) : box(0.3, 0.3, 0.08), ...P(0, y + 0.75, side)), f.clone(), hex, 1.05);
    }
    // 5) rooftop feature: halo ring on a mast, or a crown fin
    if (rnd() < 0.3 * rich) {
      if (rnd() < 0.55) {
        addSolid(T(box(0.12, 1.1, 0.12), 0, h + 0.55, 0), f.clone(), 0x241e46, { collide: false });
        const halo = new THREE.TorusGeometry(Math.min(w, d) * 0.32 + 0.3, 0.07, 5, 14);
        addSolid(T(halo, 0, h + 1.35, 0, 0, Math.PI / 2), f.clone(), DECO_GOLD, { collide: false });
      } else {
        addSolid(T(box(Math.min(w, 1.6), 1.6, 0.16), 0, h + 0.7, 0, 0, 0, 0.18), f.clone(),
          rnd() < 0.5 ? DECO_GOLD : 0x2c2452, { collide: false });
      }
    }
  }

  function warren(anchor, cellsN, cellSize, style) {
    const { east, north } = tangentFrame(anchor.dir);
    const base = anchor.dir.clone().multiplyScalar(R);
    const dirAt = (lx, lz) => _v.copy(base).addScaledVector(east, lx).addScaledVector(north, lz).clone().normalize();
    const cN = cellsN;
    const visited = Array.from({ length: cN }, () => Array(cN).fill(false));
    const wallsV = Array.from({ length: cN + 1 }, () => Array(cN).fill(true));
    const wallsH = Array.from({ length: cN }, () => Array(cN + 1).fill(true));
    const c0 = cN >> 1;
    const stack = [[c0, c0]];
    visited[c0][c0] = true;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const nbrs = [];
      if (cx > 0 && !visited[cx - 1][cy]) nbrs.push([cx - 1, cy, 'V', cx, cy]);
      if (cx < cN - 1 && !visited[cx + 1][cy]) nbrs.push([cx + 1, cy, 'V', cx + 1, cy]);
      if (cy > 0 && !visited[cx][cy - 1]) nbrs.push([cx, cy - 1, 'H', cx, cy]);
      if (cy < cN - 1 && !visited[cx][cy + 1]) nbrs.push([cx, cy + 1, 'H', cx, cy + 1]);
      if (!nbrs.length) { stack.pop(); continue; }
      const [nx, ny, o, wx, wy] = nbrs[(rnd() * nbrs.length) | 0];
      if (o === 'V') wallsV[wx][wy] = false; else wallsH[wx][wy] = false;
      visited[nx][ny] = true;
      stack.push([nx, ny]);
    }
    // extra openings → loops, not a strict tree (mazes need mercy)
    for (let x = 1; x < cN; x++) for (let y = 0; y < cN; y++) if (rnd() < 0.14) wallsV[x][y] = false;
    for (let x = 0; x < cN; x++) for (let y = 1; y < cN; y++) if (rnd() < 0.14) wallsH[x][y] = false;
    // campo: clear the centre cell's walls
    wallsV[c0][c0] = wallsV[c0 + 1][c0] = false;
    wallsH[c0][c0] = wallsH[c0][c0 + 1] = false;

    const half = cN * cellSize / 2;
    const styles = {
      market: { hues: [0x3b2a6e, 0x274b8a, 0x6e2a5c, 0x2a6e62], hMin: 3.2, hMax: 6.4, th: 2.0, glowP: 0.75 },
      circuit: { hues: [0x180f36, 0x22103e, 0x2a0f30], hMin: 4.2, hMax: 8.0, th: 2.2, glowP: 0.95 },
      downtown: { hues: [0x201646, 0x1a1240, 0x261a52], hMin: 6.0, hMax: 12.0, th: 2.4, glowP: 0.8 },
    };
    const st = styles[style] ?? styles.market;
    function wallBuilding(lx, lz, alongNorth) {
      const r2 = Math.hypot(lx, lz);
      if (r2 > anchor.pad - 1.5) return;                 // stay on the pad
      const dirW = dirAt(lx, lz);
      const f = surfaceMatrix(dirW, terrainHeight(dirW) - 0.4, alongNorth ? 0 : 90);
      const h = st.hMin + rnd() * (st.hMax - st.hMin);
      const len = cellSize + 0.5;
      if (rnd() < 0.16) {
        // sottoportego — the alley passes UNDER this building
        addSolid(T(box(st.th, 2.7, 1.1), 0, 1.35, -len / 2 + 0.6), f.clone(), pick(rnd, st.hues), { jitter: 0.1 });
        addSolid(T(box(st.th, 2.7, 1.1), 0, 1.35, len / 2 - 0.6), f.clone(), pick(rnd, st.hues), { jitter: 0.1 });
        addSolid(T(box(st.th, h - 2.7, len), 0, 2.7 + (h - 2.7) / 2, 0), f.clone(), pick(rnd, st.hues), { jitter: 0.1 });
        addGlow(T(box(st.th * 0.5, 0.1, len * 0.8), 0, 2.6, 0), f.clone(), pick(rnd, NEON_LIST), 1.1);
      } else {
        addSolid(T(box(st.th, h, len), 0, h / 2, 0), f.clone(), pick(rnd, st.hues), { jitter: 0.12 });
        if (rnd() < st.glowP) {
          addGlow(T(box(st.th + 0.08, 0.28, len * (0.4 + rnd() * 0.5)), 0, 1.6 + rnd() * (h - 2.4), 0),
            f.clone(), pick(rnd, NEON_LIST), 1.1);
        }
        if (rnd() < 0.25) {   // rooftop shack — the upper layer
          addSolid(T(box(st.th * 0.8, 1.8, len * 0.4), 0, h + 0.9, (rnd() - 0.5) * len * 0.4), f.clone(), pick(rnd, st.hues), { jitter: 0.14 });
        }
        futureDeco(f, st.th, h, len, { rich: 0.8 });
      }
    }
    for (let x = 0; x <= cN; x++) for (let y = 0; y < cN; y++) {
      if (!wallsV[x][y]) continue;
      wallBuilding((x - cN / 2) * cellSize, (y + 0.5 - cN / 2) * cellSize, true);
    }
    for (let x = 0; x < cN; x++) for (let y = 0; y <= cN; y++) {
      if (!wallsH[x][y]) continue;
      wallBuilding((x + 0.5 - cN / 2) * cellSize, (y - cN / 2) * cellSize, false);
    }
  }
  warren(districtDirs[1], 5, 6.0, 'market');
  warren(districtDirs[2], 5, 5.6, 'circuit');
  warren(districtDirs[3], 5, 6.6, 'downtown');

  // ════════════ ARCHED BRIDGES — climb up, over and around ════════════
  function archBridge(dirs, idx) {
    const p = dirs[idx];
    const prev = dirs[Math.max(0, idx - 1)], next = dirs[Math.min(dirs.length - 1, idx + 1)];
    const up = p.clone().normalize();
    const tang = surfacePoint(next, new THREE.Vector3()).sub(surfacePoint(prev, new THREE.Vector3())).normalize();
    const perp = new THREE.Vector3().crossVectors(up, tang).normalize();
    const realTang = new THREE.Vector3().crossVectors(perp, up).normalize();
    const deckH = 3.4;
    const m = new THREE.Matrix4().makeBasis(perp, up, realTang)
      .setPosition(surfacePoint(p, new THREE.Vector3()).addScaledVector(up, deckH));
    // deck spanning the street + glow rails
    addSolid(T(box(8.2, 0.35, 2.0), 0, 0, 0), m.clone(), 0x2c2152, { jitter: 0.06 });
    addGlowViaMatrix(T(box(8.2, 0.08, 0.08), 0, 0.42, 0.95), m.clone(), NEON.cyan, 1.0);
    addGlowViaMatrix(T(box(8.2, 0.08, 0.08), 0, 0.42, -0.95), m.clone(), NEON.magenta, 1.0);
    // ramps down both ends
    for (const sx of [-1, 1]) {
      const ramp = box(4.9, 0.3, 2.0);
      T(ramp, sx * (4.1 + 2.05), -deckH / 2 + 0.75, 0, 0, 0, sx * -0.62);
      addSolid(ramp, m.clone(), 0x2c2152, { jitter: 0.06 });
    }
  }
  pathChains.forEach((dirs, ci) => {
    for (let k = 28; k < dirs.length - 10; k += 34) {
      // skip bridges inside district pads (the warrens own those streets)
      let inPad = false;
      for (const d of districtDirs) if (dirs[k].angleTo(d.dir) * R < d.pad) { inPad = true; break; }
      if (!inPad) archBridge(dirs, k + ((ci * 7) % 9));
    }
  });

  // ════════════ SWITCHBACK CLIMBS onto tall features ════════════
  {
    let built = 0;
    for (let k = 15; k < pathSamples.length && built < 10; k += 23) {
      const p = pathSamples[k];
      const up = p.clone().normalize();
      const { east, north } = tangentFrame(p);
      for (const side of [east, north, east.clone().negate(), north.clone().negate()]) {
        const off = p.clone().multiplyScalar(R).addScaledVector(side, 7).normalize();
        const rise = terrainHeight(off) - terrainHeight(p);
        if (rise > 5 && rise < 14) {
          // stairs from the street shoulder up the flank + a viewing ledge
          const m = new THREE.Matrix4().makeBasis(
            new THREE.Vector3().crossVectors(up, side).normalize(), up.clone(), side.clone())
            .setPosition(surfacePoint(p, new THREE.Vector3()).addScaledVector(side, 2.2));
          for (let s2 = 0; s2 < 12; s2++) {
            const g = box(2.4, 0.5, 0.9);
            T(g, 0, (s2 + 0.5) * rise * 0.8 / 12, 2 + s2 * 0.45);
            addSolid(g, m.clone(), 0x342a5e, { jitter: 0.06 });
          }
          const ledge = box(3.4, 0.4, 3.0);
          T(ledge, 0, rise * 0.8 + 0.1, 2 + 12 * 0.45 + 1.2);
          addSolid(ledge, m.clone(), 0x342a5e);
          addGlowViaMatrix(T(box(3.4, 0.08, 0.08), 0, rise * 0.8 + 0.55, 2 + 12 * 0.45 + 2.6), m.clone(), NEON.amber, 1.1);
          built++;
          break;
        }
      }
    }
  }

  // ════════════ CAVES — tunnels bored THROUGH the hills ════════════
  // Each cave runs beneath the terrain between two mouths, dipping to
  // depth then rising out the far side. Glow veins light the way.
  // They are shortcuts under the mountains — find them.

  // sweep a smooth U-channel along the bore line — continuous strips,
  // no ring seams to snag on
  function sweepStrip(pts, frames, x0, x1, y0, y1, hex, glow = false) {
    const verts = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const { side, up } = frames[i];
      const a2 = pts[i].clone().addScaledVector(side, x0).addScaledVector(up, y0);
      const b2 = pts[i].clone().addScaledVector(side, x1).addScaledVector(up, y1);
      verts.push(a2.x, a2.y, a2.z, b2.x, b2.y, b2.z);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.setIndex(idx);
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    if (glow) addGlowRaw(ng, hex, 1.0);
    else { colorize(ng, hex); solidParts.push(ng); collParts.push(ng.clone()); }
  }
  for (const cave of CAVE_DATA) {
    const { a, b, rA, rB } = cave;
    const N2 = 30;
    const pts = [], frames = [];
    for (let i = 0; i <= N2; i++) {
      const t = i / N2;
      const d = new THREE.Vector3().copy(a).lerp(b, t).normalize();
      const r0 = rA + (rB - rA) * t - Math.sin(t * Math.PI) * 1.4;
      pts.push(d.clone().multiplyScalar(r0));
      const up = d.clone();
      const fwd = new THREE.Vector3().copy(b).sub(a).normalize();
      const side = new THREE.Vector3().crossVectors(d, fwd).normalize();
      frames.push({ side, up });
      // glow veins
      if (i % 3 === 1) {
        const m = new THREE.Matrix4().makeBasis(side, up, new THREE.Vector3().crossVectors(side, d).normalize())
          .setPosition(d.clone().multiplyScalar(r0));
        addGlow(T(box(0.12, 1.6, 0.3), (i % 6 === 1 ? -2.15 : 2.15), 1.5, 0), m.clone(),
          pick(rnd, [NEON.cyan, NEON.purple, NEON.lime]), 1.0);
      }
    }
    // floor / walls / roof as smooth ribbons (roof stops short of mouths)
    sweepStrip(pts, frames, -2.3, 2.3, 0, 0, 0x1b1338);                       // floor
    sweepStrip(pts, frames, -2.3, -2.3, 0, 3.5, 0x241a44);                    // left wall
    sweepStrip(pts, frames, 2.3, 2.3, 3.5, 0, 0x241a44);                      // right wall
    sweepStrip(pts.slice(3, N2 - 2), frames.slice(3, N2 - 2), -2.7, 2.7, 3.5, 3.5, 0x17102e); // roof
    // mouth markers: rock portal + a breadcrumb glow at both ends
    for (const dd of [a, b]) {
      const mf = frameAtDir(dd, 0, 0.3);
      addSolid(T(box(0.9, 4.4, 0.9), -2.2, 2.2, 0), mf.clone(), 0x2a2150, { jitter: 0.1 });
      addSolid(T(box(0.9, 4.4, 0.9), 2.2, 2.2, 0), mf.clone(), 0x2a2150, { jitter: 0.1 });
      addSolid(T(box(5.2, 0.9, 0.9), 0, 4.6, 0), mf.clone(), 0x2a2150, { jitter: 0.1 });
      addGlow(T(box(4.4, 0.14, 0.2), 0, 4.1, 0), mf.clone(), NEON.purple, 1.15);
    }
  }

  // ════════════ WILDERNESS FILL — the WHOLE planet is built ════════════
  // Fibonacci-scatter structures over every part of the sphere that isn't
  // a street or a district pad, so the paths read as canyons through one
  // continuous built object (the Messenger lesson: the planet IS the maze).
  const fillTops = [];
  {
    const N = 560;
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - 2 * (i + 0.5) / N;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const th = ga * i;
      const dir = new THREE.Vector3(rr * Math.cos(th), y, rr * Math.sin(th));
      // zone = nearest district (styles the structure)
      let zone = districtDirs[0], minA = 1e9;
      for (const d of districtDirs) {
        const a = dir.angleTo(d.dir) * R;
        if (a < minA) { minA = a; zone = d; }
      }
      if (minA < zone.pad * 0.95) continue;          // districts fill themselves
      // keep the streets open — clearance scales with the footprint
      let pd = 1e9;
      for (const p of pathSamples) { const dd = dir.distanceToSquared(p); if (dd < pd) pd = dd; }
      const streetDist = Math.sqrt(pd) * R;
      const w = 3.5 + rnd() * 3.5, d2 = 3.5 + rnd() * 3.5;
      if (streetDist < 2.0 + Math.max(w, d2) / 2) continue;
      // keep the lake open
      if (dir.angleTo(LAKE_DIR) * R < 13) continue;
      // keep Mount Cindral's cone bare — volcanic rock, not real estate
      if (dir.angleTo(VOLCANO_DIR) * R < 15) continue;
      const jd = dir.clone();   // slight jitter off the lattice
      jd.applyAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 0.03).normalize();
      const f = frameAtDir(jd, rnd() * 360, 0.6);
      const nearStreet = streetDist < 6.5;
      let hgt = 0;
      // some street-adjacent buildings are ENTERABLE (door + interior),
      // door turned to face the street so you can actually find it
      if (nearStreet && rnd() < 0.2 && ['market', 'circuit', 'downtown', 'ruins'].includes(zone.key)) {
        let nearest = pathSamples[0], nd = 1e9;
        for (const ps of pathSamples) { const dd = jd.distanceToSquared(ps); if (dd < nd) { nd = dd; nearest = ps; } }
        const { up: eu, east: ee, north: en } = tangentFrame(jd);
        const toward = surfacePoint(nearest, new THREE.Vector3()).sub(surfacePoint(jd, new THREE.Vector3()));
        toward.addScaledVector(eu, -toward.dot(eu)).normalize();
        const yawDeg = Math.atan2(toward.dot(ee), toward.dot(en)) * 57.29578;
        enterable(frameAtDir(jd, yawDeg, 0.6), zone.key);
        continue;
      }
      switch (zone.key) {
        case 'market': case 'crash':
          hgt = shanty(f, 2.4 + rnd() * 1.4, 2 + (rnd() * 2 | 0));
          break;
        case 'circuit': {
          hgt = 3.5 + rnd() * 4;
          addSolid(T(box(w, hgt, d2), 0, hgt / 2, 0), f.clone(), pick(rnd, [0x180f36, 0x22103e, 0x2a0f30]), { jitter: 0.1 });
          if (rnd() < 0.85) addGlow(T(box(w * 0.8, 0.2, 0.1), 0, hgt * (0.4 + rnd() * 0.5), d2 / 2 + 0.08), f.clone(), pick(rnd, [NEON.magenta, NEON.pink, NEON.red, NEON.purple]), 1.15);
          if (rnd() < 0.4) addGlow(T(box(0.18, hgt * 0.7, 0.1), w / 2 + 0.1, hgt * 0.5, 0), f.clone(), pick(rnd, NEON_LIST), 1.1);
          futureDeco(f, w, hgt, d2);
          break;
        }
        case 'downtown': {
          hgt = 6 + rnd() * 9;
          tower(f, w, hgt, d2, pick(rnd, [0x201646, 0x1a1240, 0x261a52]), pick(rnd, NEON_LIST), { cap: rnd() < 0.4 });
          break;
        }
        case 'ruins': {
          hgt = 4 + rnd() * 5;
          if (rnd() < 0.5) {
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
              addSolid(T(box(0.5, hgt, 0.5), sx * w / 2, hgt / 2, sz * d2 / 2), f.clone(), 0x241c3e, { jitter: 0.1 });
            }
            if (rnd() < 0.7) addSolid(T(box(w + 0.5, 0.35, d2 + 0.5), 0, hgt, 0), f.clone(), 0x2c2444);
          } else {
            addSolid(T(box(w, hgt * 0.6, d2), 0, hgt * 0.3, 0, rnd() * 0.3, 0, (rnd() - 0.5) * 0.12), f.clone(), 0x2a2248, { jitter: 0.12 });
          }
          break;
        }
        case 'dunes': {
          hgt = 2.5 + rnd() * 4.5;
          addSolid(T(new THREE.CylinderGeometry(0.6 + rnd() * 0.8, 1.3 + rnd() * 1.2, hgt, 7), 0, hgt / 2, 0),
            f.clone(), pick(rnd, [0xb0538e, 0x9a4bd6, 0xd66a9e]), { jitter: 0.14 });
          break;
        }
        case 'pyramid': {
          hgt = 3 + rnd() * 6;
          addSolid(T(box(w * 0.8, hgt, d2 * 0.8), 0, hgt / 2, 0, rnd() * 0.4), f.clone(), pick(rnd, [0x0f0d20, 0x161226, 0x1a1030]), { jitter: 0.06 });
          if (rnd() < 0.3) addGlow(T(box(0.3, 0.3, 0.3), 0, hgt + 0.2, 0), f.clone(), NEON.red, 1.1);
          futureDeco(f, w * 0.8, hgt, d2 * 0.8, { rich: 0.7 });
          break;
        }
        case 'port': {
          hgt = 2 + rnd() * 3;
          addSolid(T(box(1 + rnd() * 1.6, hgt, 1 + rnd() * 1.6), 0, hgt / 2, 0, rnd()), f.clone(),
            pick(rnd, [0x30265c, 0x2a3a6e, 0x3a2c5e]), { jitter: 0.1 });
          if (rnd() < 0.5) futureDeco(f, 1.8, hgt, 1.8, { rich: 0.6 });
          break;
        }
      }
      // remember street-adjacent rooftops for over-street bridges
      if (nearStreet && hgt > 3 && rnd() < 0.4) {
        fillTops.push(new THREE.Vector3().setFromMatrixPosition(f).addScaledVector(
          new THREE.Vector3().setFromMatrixColumn(f, 1), hgt + 0.1));
      }
    }
    // bridge rooftops ACROSS streets — the upper layer of the maze
    let bridges = 0;
    for (let i = 0; i < fillTops.length && bridges < 26; i++) {
      for (let j = i + 1; j < fillTops.length; j++) {
        const dd = fillTops[i].distanceTo(fillTops[j]);
        if (dd > 6 && dd < 15) { plank(fillTops[i], fillTops[j], 1.2); bridges++; break; }
      }
    }
  }

  // ════════════ LAKE VOLTAINE — glowing teal water ════════════
  {
    const water = new THREE.Mesh(
      new THREE.SphereGeometry(R - 1.5, 96, 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x18e0d0).multiplyScalar(0.55),
        transparent: true, opacity: 0.82, toneMapped: false,
      })
    );
    water.renderOrder = 1;
    signs.push(water);   // rendered, not merged, not collidable
    dynamic.push({ update(dt, t) { water.material.opacity = 0.76 + Math.sin(t * 0.8) * 0.05; } });
    // shore glow ring
    const shore = new THREE.Mesh(
      new THREE.TorusGeometry(11.4, 0.12, 6, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(1.1), toneMapped: false })
    );
    shore.position.copy(LAKE_DIR).multiplyScalar(R - 1.45);
    shore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), LAKE_DIR);
    signs.push(shore);
  }

  // ════════════ STREET FURNITURE (everywhere) ════════════
  for (let i = 0; i < 60; i++) {
    const p = pathSamples[(rnd() * pathSamples.length) | 0];
    const lat = Math.asin(p.y) * 57.3, lon = Math.atan2(p.z, p.x) * 57.3;
    const off = (rnd() - 0.5) * 3;
    const f = frameAt(lat + off * 0.2, lon + (rnd() - 0.5) * 0.8, rnd() * 360);
    if (rnd() < 0.6) {   // neon lamp post
      addSolid(T(box(0.14, 3.4, 0.14), 2.2, 1.7, 0), f.clone(), 0x222244);
      addGlow(T(box(0.5, 0.16, 0.16), 2.2, 3.4, 0), f.clone(), pick(rnd, NEON_LIST), 1.3);
    } else {             // scrap pile / crate
      addSolid(T(box(0.8 + rnd(), 0.6 + rnd() * 0.6, 0.8 + rnd()), 2.6, 0.4, 0, rnd()), f.clone(),
        pick(rnd, [0x3a2c5e, 0x2c3a5e, 0x5e2c4e]), { jitter: 0.12 });
    }
  }

  // ════════════ LANDMARKS ════════════

  // — MOUNT CINDRAL — the volcano at (-54°, 168°). The cone + crater
  // live in terrainHeight; this block dresses the summit: a pulsing
  // lava throat, glowing flank cracks, embers and a smoke column.
  {
    const vrnd = mulberry32(7301);
    const vUp = VOLCANO_DIR.clone();
    const { east: vE, north: vN } = tangentFrame(VOLCANO_DIR);
    const craterR = terrainHeight(VOLCANO_DIR);

    // molten pool seated at the crater floor (edges tuck under the rim)
    const lavaMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff5a1a).multiplyScalar(1.3), toneMapped: false,
    });
    const lavaGeo = new THREE.CircleGeometry(3.75, 28);
    lavaGeo.rotateX(-Math.PI / 2);
    const lava = new THREE.Mesh(lavaGeo, lavaMat);
    lava.applyMatrix4(surfaceMatrix(VOLCANO_DIR, craterR + 0.3));
    signs.push(lava);
    const lavaA = new THREE.Color(0xff5a1a).multiplyScalar(1.1);
    const lavaB = new THREE.Color(0xffa63a).multiplyScalar(1.38);
    dynamic.push({ update(dt, t) {
      lavaMat.color.copy(lavaA).lerp(lavaB, 0.5 + 0.5 * Math.sin(t * 1.6));
    } });

    // lava-crack ribbons running down the outer flank
    const _cp = new THREE.Vector3();
    for (const az of [0.4, 2.5, 4.6]) {
      const tang = vE.clone().multiplyScalar(Math.cos(az)).addScaledVector(vN, Math.sin(az));
      let prev = null;
      for (let d = 3.6; d < 13.6; d += 1.4) {
        const pd = _cp.copy(VOLCANO_DIR).multiplyScalar(R).addScaledVector(tang, d).clone().normalize();
        const p = pd.multiplyScalar(terrainHeight(pd) + 0.12);
        if (prev) {
          const midDir = prev.clone().add(p).normalize();
          const mid = midDir.multiplyScalar(terrainHeight(midDir) + 0.14);
          const upv = mid.clone().normalize();
          const fwd = p.clone().sub(prev).normalize();
          const right = new THREE.Vector3().crossVectors(upv, fwd).normalize();
          const m = new THREE.Matrix4().makeBasis(right, upv, fwd).setPosition(mid);
          addGlowViaMatrix(box(0.42 + vrnd() * 0.25, 0.2, prev.distanceTo(p) + 0.25), m,
            d < 8 ? 0xff5a1a : 0xc23a12, 1.28 - d * 0.05);
        }
        prev = p;
      }
    }

    // embers — one Points cloud drifting up out of the throat
    const EMBERS = 36;
    const ePos = new Float32Array(EMBERS * 3);
    const eOff = new Float32Array(EMBERS * 2);
    const eSpd = new Float32Array(EMBERS), ePh = new Float32Array(EMBERS);
    for (let i = 0; i < EMBERS; i++) {
      const a = vrnd() * Math.PI * 2, r2 = vrnd() * 2.2;
      eOff[i * 2] = Math.cos(a) * r2; eOff[i * 2 + 1] = Math.sin(a) * r2;
      eSpd[i] = 1.1 + vrnd() * 1.5; ePh[i] = vrnd() * 8;
    }
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({
      color: new THREE.Color(0xff8a3a).multiplyScalar(1.3), size: 0.34,
      transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    embers.frustumCulled = false;
    signs.push(embers);
    const eBase = vUp.clone().multiplyScalar(craterR + 0.4);
    dynamic.push({ update(dt, t) {
      for (let i = 0; i < EMBERS; i++) {
        const hgt = (ePh[i] + t * eSpd[i]) % 8;
        const sw = eOff[i * 2] + Math.sin(t * 1.7 + i) * 0.25, sn = eOff[i * 2 + 1];
        ePos[i * 3]     = eBase.x + vUp.x * hgt + vE.x * sw + vN.x * sn;
        ePos[i * 3 + 1] = eBase.y + vUp.y * hgt + vE.y * sw + vN.y * sn;
        ePos[i * 3 + 2] = eBase.z + vUp.z * hgt + vE.z * sw + vN.z * sn;
      }
      eGeo.attributes.position.needsUpdate = true;
    } });

    // smoke column — translucent grey sprites looping upward
    const [scv, sctx] = makeCanvas(64, 64);
    const grad = sctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(205,198,220,0.85)');
    grad.addColorStop(1, 'rgba(205,198,220,0)');
    sctx.fillStyle = grad; sctx.fillRect(0, 0, 64, 64);
    const smokeTex = canvasTexture(scv);
    const smokes = [];
    for (let i = 0; i < 4; i++) {
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, color: 0x8a8598, transparent: true, opacity: 0.16, depthWrite: false,
      }));
      signs.push(sm); smokes.push(sm);
    }
    dynamic.push({ update(dt, t) {
      for (let i = 0; i < 4; i++) {
        const hgt = (t * 1.2 + i * 3.6) % 14;
        const sm = smokes[i];
        sm.position.copy(eBase).addScaledVector(vUp, 1.4 + hgt);
        const sc = 2.4 + hgt * 0.55;
        sm.scale.set(sc, sc, 1);
        sm.material.opacity = 0.17 * (1 - hgt / 14);
      }
    } });
  }

  // — SHRINE ISLET — a tiny ancient ruin rising out of Lake Voltaine
  // (the bump itself lives in terrainHeight at ISLE_DIR)
  {
    const irnd = mulberry32(5501);
    const f0 = frameAtDir(ISLE_DIR, 25, 0.35);
    // stone plinth + four weathered pillars
    addSolid(T(new THREE.CylinderGeometry(2.1, 2.5, 0.5, 12), 0, 0.12, 0), f0.clone(), 0x7d719e, { jitter: 0.06 });
    for (const [px, pz] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]]) {
      addSolid(T(new THREE.CylinderGeometry(0.17, 0.22, 2.0, 6), px, 1.35, pz), f0.clone(), 0x9a8fb8, { jitter: 0.08 });
    }
    // broken lintel ring + cracked dome over the pillars
    addSolid(T(new THREE.TorusGeometry(1.62, 0.14, 6, 14, Math.PI * 1.55), 0, 2.42, 0, 0.7, Math.PI / 2), f0.clone(), 0x8f84ae);
    addSolid(T(new THREE.SphereGeometry(1.55, 10, 6, 0, Math.PI * 1.5, 0, Math.PI / 2), 0, 2.46, 0, 2.3), f0.clone(), 0x877cab);
    // the sigil — a glowing ring set into the plinth
    addGlow(T(new THREE.TorusGeometry(0.6, 0.07, 6, 18), 0, 0.44, 0, 0, Math.PI / 2), f0.clone(), NEON.purple, 1.15);
    addGlow(T(box(0.52, 0.05, 0.1), 0, 0.44, 0), f0.clone(), NEON.purple, 1.15);
    // scrap-palms around the waterline
    for (const [pla, plo] of [[20.9, 135.6], [19.3, 134.9], [20.3, 133.4]]) {
      const pf = frameAt(pla, plo, irnd() * 360, 0.25);
      addSolid(T(new THREE.CylinderGeometry(0.08, 0.14, 1.9, 5), 0.12, 0.95, 0, 0, 0, 0.16), pf.clone(), 0x6e5a48);
      for (let b = 0; b < 5; b++) {
        const blade = box(0.16, 0.05, 1.25);
        blade.translate(0, 0, 0.58);                       // pivot at the inner end
        blade.rotateX(0.3 + irnd() * 0.35);                // droop
        blade.rotateY(b * Math.PI * 2 / 5 + irnd() * 0.4); // fan
        blade.translate(0.24, 1.92, 0);
        addSolid(blade, pf.clone(), pick(irnd, [0x3a7a5e, 0x2e6e52, 0x4a8a5a]), { collide: false });
      }
    }
    // floating dock plank toward the nearest (eastern) shore
    let shoreDir = null;
    for (let lo = 136; lo < 147; lo += 0.35) {
      const d = sphDir(20, lo);
      if (terrainHeight(d) > 58.85) { shoreDir = d; break; }
    }
    if (shoreDir) {
      plank(sphDir(20, 135.3).multiplyScalar(58.78),
        surfacePoint(shoreDir, new THREE.Vector3()).multiplyScalar(1.002), 0.9);
    }
  }

  // — SPACESHIP WRECKAGE — four more downed hulls scattered planet-wide
  function wreckSite(frame, seed, scale = 1) {
    const wr = mulberry32(seed);
    const s = scale;
    // scorch ring under everything
    const scorch = new THREE.CircleGeometry(4.4 * s, 20);
    scorch.rotateX(-Math.PI / 2);
    addSolid(T(scorch, 0, 0.09, 0), frame.clone(), 0x0b0816, { collide: false });
    // half-buried hull section, listing hard
    addSolid(T(new THREE.CylinderGeometry(1.5 * s, 1.9 * s, 7 * s, 10),
      0, 0.7 * s, 0, wr() * Math.PI, 0.28, 1.25 + wr() * 0.2), frame.clone(), 0x59627f, { jitter: 0.08 });
    // broken ribs jutting out of the ground
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.TorusGeometry((1.6 + wr() * 0.7) * s, 0.11 * s, 6, 10, Math.PI * (0.6 + wr() * 0.35));
      T(rib, (wr() - 0.5) * 5 * s, 0.15, (wr() - 0.5) * 6 * s, wr() * Math.PI * 2, -0.35 + wr() * 0.7, wr() * 0.6);
      addSolid(rib, frame.clone(), 0x4a5470, { jitter: 0.1 });
    }
    // scattered plate debris
    for (let i = 0; i < 7; i++) {
      const a = wr() * Math.PI * 2, d = (1.6 + wr() * 4.2) * s;
      addSolid(T(box((0.5 + wr() * 0.9) * s, 0.1, (0.4 + wr() * 0.8) * s),
        Math.cos(a) * d, 0.1, Math.sin(a) * d, wr() * Math.PI, 0, (wr() - 0.5) * 0.3),
        frame.clone(), pick(wr, [0x4a5470, 0x59627f, 0x3c4560]), { jitter: 0.1 });
    }
    // sparking bits
    addGlow(T(box(0.3 * s, 0.3 * s, 0.3 * s), 1.1 * s, 0.9 * s, 0.6 * s),
      frame.clone(), pick(wr, [NEON.amber, NEON.orange, NEON.cyan]), 1.3);
    if (wr() < 0.8) addGlow(T(box(0.2 * s, 0.5 * s, 0.12 * s), -1.6 * s, 0.4 * s, -1.2 * s),
      frame.clone(), pick(wr, [NEON.cyan, NEON.red, NEON.lime]), 1.2);
  }
  wreckSite(frameAt(-30, 234, 70, 0.5), 3101, 1.0);    // dunes approach (nudged off the ruins→dunes road)
  wreckSite(frameAt(-16, 213, 205, 0.5), 3102, 1.15);  // foundry ruins southern outskirts
  wreckSite(frameAt(-48, 160, 320, 0.7), 3103, 0.9);   // Mount Cindral's flank
  wreckSite(frameAt(52, 60, 140, 0.5), 3104, 1.25);    // northern wilderness
  // the northern site took down a whole freighter — half-buried, listing ~25°
  if (models.Freighter) {
    const ship = models.Freighter.clone();
    ship.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    const f = frameAt(52.5, 62.5, 95, -0.2);
    ship.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.44)
      .premultiply(new THREE.Matrix4().makeRotationY(2.2))
      .premultiply(new THREE.Matrix4().makeTranslation(0, 1.2, 0))
      .premultiply(f));
    ship.scale.multiplyScalar(2.4);
    signs.push(ship);
    // collision hull under it, matching the list
    addSolid(T(box(8.5, 3.0, 20), 0, 1.0, 0, 2.2, 0, 0.44), f.clone(), 0x3a3550, { jitter: 0 });
  }

  // — THE IVORY SPIRE — a floating rock island above the lake carrying
  // a white futurist palace. STATIC (so the BVH stays valid, and every
  // top surface is landable); only the shard ring animates.
  const ivoryInfo = {};
  {
    const frnd = mulberry32(9107);
    const iDir = sphDir(26, 140);
    const M = surfaceMatrix(iDir, R + 34);
    const isle = new THREE.Group();
    isle.applyMatrix4(M);

    const rockParts = [], palParts = [], glowP = [];
    const col = (geo, hex) => colorize(geo, hex, 0);
    const glowCol = (geo, hex, boost = 1.15) => {
      _c.set(hex).multiplyScalar(boost);
      const n = geo.attributes.position.count;
      const cc = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { cc[i * 3] = _c.r; cc[i * 3 + 1] = _c.g; cc[i * 3 + 2] = _c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      return geo;
    };

    // jagged rock — a cone pointing DOWN, vertices kinked by noise
    const rock = new THREE.ConeGeometry(7.8, 11, 14, 5, true);
    rock.rotateX(Math.PI);                 // apex down
    rock.translate(0, -6.2, 0);            // base ring at y = -0.7
    {
      const pos = rock.attributes.position;
      const vv = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        vv.fromBufferAttribute(pos, i);
        const depth = clamp((-0.7 - vv.y) / 3, 0, 1);   // keep the top ring clean
        const kink = 1 + (noise3(_v.set(vv.x * 0.55, vv.y * 0.55, vv.z * 0.55)) - 0.5) * 0.55 * depth;
        pos.setXYZ(i, vv.x * kink,
          vv.y + (noise3(_v.set(vv.z * 0.7, vv.x * 0.7, vv.y * 0.7)) - 0.5) * 1.2 * depth,
          vv.z * kink);
      }
      rock.computeVertexNormals();
    }
    rockParts.push(col(rock, 0x453264));
    // flat top slab ~14u across + thin pale-grass surface
    rockParts.push(col(T(new THREE.CylinderGeometry(7.1, 7.9, 1.3, 22), 0, -0.65, 0), 0x50406f));
    rockParts.push(col(T(new THREE.CylinderGeometry(7.0, 7.0, 0.14, 22), 0, 0.05, 0), 0xb9d4a4));

    // the palace — ivory towers, golden dome, slender bridges
    const IVORY = 0xf2ead8, PALE = 0xe8dfc9, GOLD = 0xd8a72c;
    const TWRS = [                          // [x, z, radius, height]
      [0, 0, 1.35, 12],
      [2.7, 1.4, 0.9, 7.5],
      [-2.5, 2.0, 0.8, 6.2],
      [1.8, -2.7, 1.0, 8.6],
      [-2.4, -2.1, 0.72, 5.0],
      [3.6, -1.2, 0.62, 4.2],
      [-3.9, -0.1, 0.85, 9.4],
    ];
    for (let i = 0; i < TWRS.length; i++) {
      const [tx, tz, tr, th] = TWRS[i];
      palParts.push(col(T(new THREE.CylinderGeometry(tr, tr * 1.18, th, 12), tx, th / 2, tz), IVORY));
      // walkable parapet disc at each top
      palParts.push(col(T(new THREE.CylinderGeometry(tr * 1.25, tr * 1.05, 0.3, 12), tx, th + 0.15, tz), IVORY));
      if (i > 0) palParts.push(col(T(new THREE.SphereGeometry(tr * 0.85, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), tx, th + 0.3, tz), PALE));
      // vertical glowing window slits — cyan + warm white
      const slits = 2 + (i % 3);
      for (let k = 0; k < slits; k++) {
        const g = box(0.14, th * (0.35 + frnd() * 0.4), 0.07);
        g.translate(0, 0, tr + 0.05);
        g.rotateY(frnd() * Math.PI * 2);
        g.translate(tx, th * 0.45, tz);
        glowP.push(glowCol(g, k % 2 ? 0xfff1cf : NEON.cyan, 1.12));
      }
    }
    // golden dome + beacon spire on the central tower
    palParts.push(col(T(new THREE.SphereGeometry(1.7, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 12.3, 0), GOLD));
    palParts.push(col(T(new THREE.CylinderGeometry(0.07, 0.16, 3.2, 6), 0, 14.9, 0), PALE));
    const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c8).multiplyScalar(1.35), toneMapped: false });
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), beaconMat);
    beacon.position.set(0, 16.7, 0);
    isle.add(beacon);
    const bcA = new THREE.Color(0xfff2c8).multiplyScalar(0.85), bcB = new THREE.Color(0xfff2c8).multiplyScalar(1.4);
    dynamic.push({ update(dt, t) {
      beaconMat.color.copy(bcA).lerp(bcB, 0.5 + 0.5 * Math.sin(t * 2.4));
      beacon.rotation.y = t * 0.8;
    } });
    // grand door glow at the central tower's base
    glowP.push(glowCol(T(box(0.8, 1.8, 0.1), 0, 0.95, 1.42), 0xfff1cf, 1.2));
    // slender bridges between the central tower and three satellites
    for (const [ai, bi] of [[0, 1], [0, 3], [0, 6]]) {
      const A = TWRS[ai], B = TWRS[bi];
      const hB = Math.min(A[3], B[3]) - 0.4;
      const dx = B[0] - A[0], dz = B[1] - A[1];
      const len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
      const deck = box(0.9, 0.16, len);
      deck.rotateY(yaw);
      deck.translate((A[0] + B[0]) / 2, hB, (A[1] + B[1]) / 2);
      palParts.push(col(deck, IVORY));
      const strip = box(0.12, 0.06, len * 0.92);
      strip.rotateY(yaw);
      strip.translate((A[0] + B[0]) / 2, hB - 0.14, (A[1] + B[1]) / 2);
      glowP.push(glowCol(strip, NEON.cyan, 1.0));
    }

    const rockGeo = BufferGeometryUtils.mergeGeometries(rockParts, false);
    const rockMesh = new THREE.Mesh(rockGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    rockMesh.castShadow = rockMesh.receiveShadow = true;
    isle.add(rockMesh);
    const palGeo = BufferGeometryUtils.mergeGeometries(palParts, false);
    const palMesh = new THREE.Mesh(palGeo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.55, metalness: 0.3,
    }));
    palMesh.castShadow = palMesh.receiveShadow = true;
    isle.add(palMesh);
    isle.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(glowP, false),
      new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));

    // LANDABLE: bake the island's solid geometry (with its world matrix
    // composed in) into the standard collision merge — static, so the
    // one shared BVH stays valid
    for (const g of [rockGeo, palGeo]) {
      const cg = g.clone();
      cg.applyMatrix4(M);
      collParts.push(cg);
    }

    // ring of rock shards slowly orbiting the island (render-only)
    const shardPivot = new THREE.Group();
    const shardParts = [];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + frnd();
      const g = new THREE.IcosahedronGeometry(0.55 + frnd() * 0.6, 0);
      g.translate(Math.cos(a) * (10.5 + frnd() * 2.5), -3 + frnd() * 6, Math.sin(a) * (10.5 + frnd() * 2.5));
      shardParts.push(col(g, 0x51406f));
    }
    shardPivot.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(shardParts, false),
      new THREE.MeshLambertMaterial({ vertexColors: true })));
    isle.add(shardPivot);
    dynamic.push({ update(dt, t) { shardPivot.rotation.y = t * 0.1; } });

    // faint volumetric beam from the underside down toward the lake
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(6, 26, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x9fe8ff, transparent: true, opacity: 0.04, toneMapped: false,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    beam.position.set(0, -24, 0);   // apex tucked into the rock tip
    isle.add(beam);

    signs.push(isle);   // joins the planet group with the other live objects
    ivoryInfo.dir = iDir;
    ivoryInfo.center = new THREE.Vector3().setFromMatrixPosition(M);
    ivoryInfo.topRadius = R + 34;
  }

  // — THE SPIRE — the planet's tallest building, on the Acropolis'
  // north-west shoulder at (44°, 152°): ~10u off the plaza so the
  // MAGENTA SKYLINE monorail (which passes downtown at r≈77–78) clears
  // the tower axis by 12.1u and the lift columns by 13.0u (verified
  // against the sampled curve; yaw 110 turns the lifts away from it).
  // Strobe tops out at r≈90.8 — under the R+92 ceiling, well below the
  // Ivory Spire palace (r94) and clear of every rail path.
  const spireInfo = {};
  {
    const sDir = sphDir(44, 152);
    const fs = frameAtDir(sDir, 110, 0.5);
    const srnd = mulberry32(4407);
    const TIERS = [[7.4, 8], [6.0, 7], [4.8, 6], [3.4, 5.5]];   // [width, height] — setbacks
    let sy = 0;
    for (const [tw, thH] of TIERS) {
      addSolid(T(box(tw, thH, tw), 0, sy + thH / 2, 0), fs.clone(), 0x1a1148, { jitter: 0.04 });
      const rows2 = Math.max(2, Math.floor(thH / 2.6));
      for (let r2 = 0; r2 < rows2; r2++) {           // window bands
        if (srnd() < 0.2) continue;
        addGlow(T(box(tw + 0.08, 0.34, tw + 0.08), 0, sy + 1.3 + r2 * (thH - 1.8) / rows2, 0),
          fs.clone(), r2 % 2 ? NEON.cyan : NEON.magenta, 1.05);
      }
      for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {   // corner glow edges
        addGlow(T(box(0.09, thH * 0.92, 0.09), ex * (tw / 2 + 0.06), sy + thH / 2, ez * (tw / 2 + 0.06)),
          fs.clone(), NEON.purple, 0.9);
      }
      sy += thH;
    }
    // observation deck — walkable ring at 21u, railed, lift docks on ±x
    addSolid(T(new THREE.CylinderGeometry(5.2, 4.4, 0.5, 18), 0, 21.25, 0), fs.clone(), 0x241e4e);
    addGlowRaw(T(new THREE.TorusGeometry(5.05, 0.09, 5, 30), 0, 21.55, 0, 0, Math.PI / 2)
      .applyMatrix4(fs.clone()), NEON.cyan, 1.15);
    for (const a0 of [0.5, Math.PI + 0.5]) {          // railing arcs, gaps at the docks
      const railA = new THREE.TorusGeometry(4.95, 0.06, 5, 22, Math.PI - 1.0);
      railA.rotateZ(a0);
      railA.rotateX(Math.PI / 2);
      railA.translate(0, 22.55, 0);
      addGlow(railA, fs.clone(), NEON.cyan, 1.0);
    }
    for (let i = 0; i < 12; i++) {                    // railing posts
      const ang3 = i / 12 * Math.PI * 2;
      if (Math.abs(Math.sin(ang3)) < 0.4) continue;   // skip the dock gaps
      addSolid(T(box(0.08, 1.0, 0.08), Math.cos(ang3) * 4.92, 22.05, Math.sin(ang3) * 4.92),
        fs.clone(), 0x241e4e, { collide: false });
    }
    addGlowRaw(T(new THREE.TorusGeometry(4.7, 0.12, 5, 26), 0, 20.9, 0, 0, Math.PI / 2)
      .applyMatrix4(fs.clone()), NEON.magenta, 1.1);  // under-deck ring
    // rooftop landing pad (AVs / jetpacks)
    addSolid(T(new THREE.CylinderGeometry(2.8, 2.8, 0.3, 14), 0, 26.65, 0), fs.clone(), 0x181233);
    addGlowRaw(T(new THREE.TorusGeometry(2.3, 0.08, 5, 22), 0, 26.85, 0, 0, Math.PI / 2)
      .applyMatrix4(fs.clone()), NEON.lime, 1.25);
    addGlow(T(box(1.3, 0.06, 0.2), 0, 26.83, 0), fs.clone(), NEON.lime, 1.25);
    // beacon mast + red strobe
    addSolid(T(new THREE.CylinderGeometry(0.09, 0.22, 3.8, 6), 0, 28.7, 0), fs.clone(), 0x241e4e, { collide: false });
    const strobeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.red), toneMapped: false });
    const strobe = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), strobeMat);
    strobe.position.copy(new THREE.Vector3(0, 30.8, 0).applyMatrix4(fs.clone()));
    signs.push(strobe);
    const strA = new THREE.Color(NEON.red).multiplyScalar(0.22);
    const strB = new THREE.Color(NEON.red).multiplyScalar(1.38);
    dynamic.push({ update(dt, t) {
      strobeMat.color.copy(strA).lerp(strB, Math.pow(Math.max(0, Math.sin(t * 2.6)), 10));
    } });
    // scrolling LED band near the top (self-contained canvas ticker)
    const [lcv, lctx] = makeCanvas(1024, 64);
    lctx.fillStyle = '#07031a'; lctx.fillRect(0, 0, 1024, 64);
    lctx.font = '900 40px Orbitron, sans-serif';
    lctx.textBaseline = 'middle';
    lctx.fillStyle = hexCss(NEON.cyan); lctx.shadowColor = hexCss(NEON.cyan); lctx.shadowBlur = 14;
    lctx.fillText('◆ THE SPIRE ◆ NEON ACROPOLIS', 10, 34);
    lctx.fillStyle = hexCss(NEON.magenta); lctx.shadowColor = hexCss(NEON.magenta);
    lctx.fillText('◆ PORT CURFEW IN EFFECT', 640, 34);
    const ledTex = canvasTexture(lcv, { repeat: [3, 1] });
    const led = new THREE.Mesh(
      new THREE.CylinderGeometry(3.55, 3.55, 1.0, 20, 1, true),
      new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false, side: THREE.DoubleSide })
    );
    led.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 24.9, 0).premultiply(fs.clone()));
    signs.push(led);
    dynamic.push({ update(dt, t) { ledTex.offset.x = (t * 0.06) % 1; } });
    // entrance glow at the base
    addGlow(T(box(2.2, 2.8, 0.14), 0, 1.4, TIERS[0][0] / 2 + 0.06), fs.clone(), NEON.cyan, 1.15);
    // glass lifts: street ↔ observation deck, opposite faces, alternating
    {
      const yA = localGroundY(fs, 6.85, 0) + 0.45;
      const yB = localGroundY(fs, -6.85, 0) + 0.45;
      makeElevator(fs.clone(), 6.85, 0, yA, 21.4, 0, NEON.cyan);
      makeElevator(fs.clone(), -6.85, 0, yB, 21.4, (21.4 - yB) / ELEV_SPEED + ELEV_PAUSE, NEON.magenta);
    }
    spireInfo.dir = sDir;
    spireInfo.base = surfacePoint(sDir, new THREE.Vector3());
    spireInfo.deckY = 21.5;                            // local height of the deck surface
    spireInfo.top = sDir.clone().multiplyScalar(terrainHeight(sDir) + 30.8);
  }

  // ════════════ MERGE + MATERIALS ════════════
  const group = new THREE.Group();

  const solidGeo = BufferGeometryUtils.mergeGeometries(solidParts.map(g => {
    const c = g.index ? g.toNonIndexed() : g;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', c.attributes.position);
    out.setAttribute('normal', c.attributes.normal || undefined);
    out.setAttribute('color', c.attributes.color);
    if (!c.attributes.normal) out.computeVertexNormals();
    return out;
  }), false);
  const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const solidMesh = new THREE.Mesh(solidGeo, solidMat);
  solidMesh.receiveShadow = true;
  solidMesh.castShadow = true;
  group.add(solidMesh);

  const glowGeo = BufferGeometryUtils.mergeGeometries(glowParts.map(g => {
    const c = g.index ? g.toNonIndexed() : g;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', c.attributes.position);
    out.setAttribute('color', c.attributes.color);
    return out;
  }), false);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  group.add(glowMesh);

  for (const s of signs) group.add(s);
  scene.add(group);

  // ════════════ COLLISION BVH ════════════
  const collGeo = BufferGeometryUtils.mergeGeometries(collParts.map(g => {
    const c = g.index ? g.toNonIndexed() : g;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', c.attributes.position.clone());
    return out;
  }), false);
  collGeo.boundsTree = new MeshBVH(collGeo);
  const collMesh = new THREE.Mesh(collGeo, new THREE.MeshBasicMaterial({ visible: false }));
  collMesh.raycast = acceleratedRaycast;
  scene.add(collMesh);
  const collMeshes = [collMesh];

  // late structures (monorail stations etc.) get their own BVH mesh
  function addColliders(group) {
    group.updateMatrixWorld(true);
    const geos = [];
    group.traverse(o => {
      if (!o.isMesh) return;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
      g.applyMatrix4(o.matrixWorld);
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', g.attributes.position);
      geos.push(out);
    });
    if (!geos.length) return;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    merged.boundsTree = new MeshBVH(merged);
    const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ visible: false }));
    m.raycast = acceleratedRaycast;
    scene.add(m);
    collMeshes.push(m);
  }

  const ray = new THREE.Raycaster();
  ray.firstHitOnly = true;

  // ground query: cast from pos+up*castUp toward planet center.
  // returns {point, normal, dist} or null
  const _origin = new THREE.Vector3(), _dirDown = new THREE.Vector3();
  function groundHit(pos, castUp = 2.2, maxDown = 60) {
    const up = _dirDown.copy(pos).normalize();
    _origin.copy(pos).addScaledVector(up, castUp);
    ray.set(_origin, up.clone().negate());
    ray.far = castUp + maxDown;
    // take the first WALKABLE hit — skip ceilings/roof undersides so a
    // ray cast from inside a cave roof slab doesn't snap you onto it
    ray.firstHitOnly = false;
    const hits = ray.intersectObjects(collMeshes, false);
    ray.firstHitOnly = true;
    const posH = pos.dot(up);
    for (const hit of hits) {
      if (hit.face.normal.dot(up) < 0.25) continue;          // ceilings
      if (hit.point.dot(up) > posH + 0.55) continue;         // surfaces ABOVE us
      return { point: hit.point, normal: hit.face.normal.clone(), dist: hit.distance - castUp };
    }
    return null;
  }
  // generic directional probe (walls, ceilings, camera)
  function probe(pos, dir, far) {
    ray.set(pos, dir);
    ray.far = far;
    return ray.intersectObjects(collMeshes, false)[0] || null;
  }

  function districtAt(pos) {
    const d = pos.clone().normalize();
    let best = null, bd = 1e9;
    for (const k of districtDirs) {
      const a = d.angleTo(k.dir) * R;
      if (a < bd) { bd = a; best = k; }
    }
    return bd < best.pad + 10 ? best : null;
  }

  return {
    group, uTime, collMesh, groundHit, probe, addColliders,
    districts: districtDirs, districtAt,
    pyramidInfo, portInfo, ivoryInfo, spireInfo,
    pathSamples, pathChains, towerSpots,
    terrainHeight, surfacePoint,
    elevators, carryRiders,
    dynamic,
    update(dt, t) { for (const d of dynamic) d.update(dt, t); },
  };
}
