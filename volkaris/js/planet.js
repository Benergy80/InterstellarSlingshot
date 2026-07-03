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
  sphDir, tangentFrame, surfaceMatrix, fbm3, makeCanvas, canvasTexture, hexCss,
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
    const t = clamp((angDist - d.pad) / 8, 0, 1);   // 0 inside → 1 outside
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
  damp = Math.min(damp, smooth(clamp((pathDist - 2.6) / 6, 0, 1)));

  // Lake Voltaine — a glowing basin like Messenger's bay
  const lakeDist = dir.angleTo(LAKE_DIR) * R;
  const bowl = Math.exp(-(lakeDist * lakeDist) / 130) * 5.5;

  return R + h * damp - bowl;
}

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
  // A window-striped tower block: solid body + glow strips
  function tower(frame, w, h, d, bodyHex, glowHex, { strips = true, cap = true } = {}) {
    addSolid(T(box(w, h, d), 0, h / 2, 0), frame.clone(), bodyHex, { jitter: 0.06 });
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
      addSolid(T(box(0.05, 0.55, 0.05), width / 2, 0.27, len / 2 - 0.1), m.clone(), 0x222244, { collide: false });
      addSolid(T(box(0.05, 0.55, 0.05), -width / 2, 0.27, -len / 2 + 0.1), m.clone(), 0x222244, { collide: false });
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
      addSolid(T(box(2.8, 0.12, 1.9), 0, 2.05, 0.15, 0, -0.16), f.clone(), pick(rnd, [0xff7a1a, 0xff2fd6, 0x00f6ff]) , { collide: false });
      addSolid(T(box(0.1, 2.0, 0.1), -1.28, 1.0, 0.8), f.clone(), 0x222244, { collide: false });
      addSolid(T(box(0.1, 2.0, 0.1), 1.28, 1.0, 0.8), f.clone(), 0x222244, { collide: false });
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
    const s = textSign('PORT MERIDIAN — DEPARTURES', { w: 9, h: 1.4, fg: hexCss(NEON.lime), size: 56 });
    placeSign(s, a.lat - 3.4, a.lon - 4, 132, 0, 4.8, 0);
    portInfo.padCenter = new THREE.Vector3(0, 1.0, 0).applyMatrix4(f.clone());
    portInfo.shipFrame = f.clone();
    portInfo.dir = sphDir(a.lat, a.lon);
  }

  // ════════════ VENICE WARRENS — enclosed winding district streets ════
  // A recursive-backtracker maze per district: the WALLS are buildings,
  // so every district is a warren of narrow enclosed alleys that guide
  // you like Venice — with sottoporteghi (passages UNDER buildings) and
  // a small campo (plaza) at the heart.
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
      const jd = dir.clone();   // slight jitter off the lattice
      jd.applyAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 0.03).normalize();
      const f = frameAtDir(jd, rnd() * 360, 0.6);
      const nearStreet = streetDist < 6.5;
      let hgt = 0;
      switch (zone.key) {
        case 'market': case 'crash':
          hgt = shanty(f, 2.4 + rnd() * 1.4, 2 + (rnd() * 2 | 0));
          break;
        case 'circuit': {
          hgt = 3.5 + rnd() * 4;
          addSolid(T(box(w, hgt, d2), 0, hgt / 2, 0), f.clone(), pick(rnd, [0x180f36, 0x22103e, 0x2a0f30]), { jitter: 0.1 });
          if (rnd() < 0.85) addGlow(T(box(w * 0.8, 0.2, 0.1), 0, hgt * (0.4 + rnd() * 0.5), d2 / 2 + 0.08), f.clone(), pick(rnd, [NEON.magenta, NEON.pink, NEON.red, NEON.purple]), 1.15);
          if (rnd() < 0.4) addGlow(T(box(0.18, hgt * 0.7, 0.1), w / 2 + 0.1, hgt * 0.5, 0), f.clone(), pick(rnd, NEON_LIST), 1.1);
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
          break;
        }
        case 'port': {
          hgt = 2 + rnd() * 3;
          addSolid(T(box(1 + rnd() * 1.6, hgt, 1 + rnd() * 1.6), 0, hgt / 2, 0, rnd()), f.clone(),
            pick(rnd, [0x30265c, 0x2a3a6e, 0x3a2c5e]), { jitter: 0.1 });
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
      addSolid(T(box(0.14, 3.4, 0.14), 2.2, 1.7, 0), f.clone(), 0x222244, { collide: false });
      addGlow(T(box(0.5, 0.16, 0.16), 2.2, 3.4, 0), f.clone(), pick(rnd, NEON_LIST), 1.3);
    } else {             // scrap pile / crate
      addSolid(T(box(0.8 + rnd(), 0.6 + rnd() * 0.6, 0.8 + rnd()), 2.6, 0.4, 0, rnd()), f.clone(),
        pick(rnd, [0x3a2c5e, 0x2c3a5e, 0x5e2c4e]), { jitter: 0.12 });
    }
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
    const hit = ray.intersectObject(collMesh, false)[0];
    if (!hit) return null;
    return { point: hit.point, normal: hit.face.normal.clone(), dist: hit.distance - castUp };
  }
  // generic directional probe (walls, ceilings, camera)
  function probe(pos, dir, far) {
    ray.set(pos, dir);
    ray.far = far;
    return ray.intersectObject(collMesh, false)[0] || null;
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
    group, uTime, collMesh, groundHit, probe,
    districts: districtDirs, districtAt,
    pyramidInfo, portInfo,
    pathSamples,
    terrainHeight, surfacePoint,
    dynamic,
    update(dt, t) { for (const d of dynamic) d.update(dt, t); },
  };
}
