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
  { key: 'crash',    name: 'CRASH SITE',          lat:   2, lon:   0, pad: 18 },
  { key: 'market',   name: 'SCRAP MARKET',        lat:   8, lon:  52, pad: 34 },
  { key: 'circuit',  name: 'THE CIRCUIT',         lat:  -6, lon: 108, pad: 30 },
  { key: 'downtown', name: 'NEON ACROPOLIS',      lat:  38, lon: 162, pad: 40 },
  { key: 'ruins',    name: 'FOUNDRY RUINS',       lat:  -4, lon: 212, pad: 38 },
  { key: 'dunes',    name: 'THE PINK DUNES',      lat: -20, lon: 252, pad: 26 },
  { key: 'pyramid',  name: 'THE OBSIDIAN PYRAMID',lat: -40, lon: 288, pad: 46 },
  { key: 'port',     name: 'PORT MERIDIAN',       lat:  30, lon: 318, pad: 30, ring: 14 },
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

// path corridor samples for terrain flattening
const pathSamples = [];
function latLonOf(entry) {
  if (Array.isArray(entry)) return entry;
  const d = DISTRICTS.find(x => x.key === entry);
  return [d.lat, d.lon];
}
for (const chain of PATHS) {
  const pts = chain.filter(Boolean).map(latLonOf);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = sphDir(pts[i][0], pts[i][1]), b = sphDir(pts[i + 1][0], pts[i + 1][1]);
    const n = 14;
    for (let k = 0; k <= n; k++) {
      pathSamples.push(new THREE.Vector3().lerpVectors(a, b, k / n).normalize());
    }
  }
}

export function terrainHeight(dir) {
  // base mountains — bright violet badlands
  let amp = C.TERRAIN_AMP;
  const n = fbm3(_v.copy(dir).multiplyScalar(2.35), 4) * 2 - 1;
  const ridge = Math.pow(Math.abs(fbm3(_v.copy(dir).multiplyScalar(1.2), 3) * 2 - 1), 1.4) * 1.6;
  let h = (n * 0.7 + ridge * 0.55) * amp;

  // flatten inside districts (smooth falloff from pad edge)
  let damp = 1;
  for (const d of districtDirs) {
    const angDist = dir.angleTo(d.dir) * R;         // arc distance in u
    const t = clamp((angDist - d.pad) / 16, 0, 1);  // 0 inside → 1 outside
    damp = Math.min(damp, smooth(t));
    // crater rim around the spaceport — a mountain ring that hides it
    if (d.ring) {
      const rimDist = Math.abs(angDist - (d.pad + 8));
      h += Math.exp(-(rimDist * rimDist) / 90) * d.ring * smooth(clamp((angDist - 4) / 10, 0, 1));
    }
  }
  // flatten along path corridors
  let pd = 1e9;
  for (const p of pathSamples) {
    const dd = dir.distanceToSquared(p);
    if (dd < pd) pd = dd;
  }
  const pathDist = Math.sqrt(pd) * R;               // ≈ arc distance
  damp = Math.min(damp, smooth(clamp((pathDist - 3.4) / 9, 0, 1)));

  return R + h * damp;
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
  PATHS.forEach((chain, ci) => {
    const pts = chain.filter(Boolean).map(latLonOf);
    const dirs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = sphDir(pts[i][0], pts[i][1]), b = sphDir(pts[i + 1][0], pts[i + 1][1]);
      const n = 16;
      for (let k = 0; k < n; k++) dirs.push(new THREE.Vector3().lerpVectors(a, b, k / n).normalize());
    }
    dirs.push(sphDir(pts[pts.length - 1][0], pts[pts.length - 1][1]));
    ribbon(dirs, 3.4, pathEdgeColors[ci % pathEdgeColors.length]);
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
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, dist = 6 + rnd() * 24;
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
      if (roofTops[i].distanceTo(roofTops[i + 1]) < 26) plank(roofTops[i], roofTops[i + 1]);
    }
    // market stalls with awnings down the central lane
    for (let i = 0; i < 10; i++) {
      const f = frameAt(anchor.lat - 3 + rnd() * 6, anchor.lon - 12 + i * 2.6, (rnd() * 40 - 20));
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
    tunnel(tf, 2.4, 2.6, 30, NEON.lime);
    const hint = textSign('EAR TO THE GROUND: THE FOUNDRY HIDES A DOOR', { w: 6, h: 1, fg: hexCss(NEON.lime), size: 44 });
    placeSign(hint, anchor.lat + 9, anchor.lon + 8.4, 82, 0, 2.2, 0);
  }

  // — THE CIRCUIT — red light district: neon arches, holo dancers, bars
  {
    const a = DISTRICTS[2];
    // boulevard of glowing arches
    for (let i = 0; i < 7; i++) {
      const f = frameAt(a.lat + (i - 3) * 1.6, a.lon - 8 + i * 2.6, 96 + i * 4);
      const arch = new THREE.TorusGeometry(4.2, 0.16, 8, 20, Math.PI);
      T(arch, 0, 0.2, 0);
      addGlow(arch, f.clone(), i % 2 ? NEON.magenta : NEON.pink, 1.25);
      addSolid(T(box(0.4, 0.4, 0.4), -4.2, 0.2, 0), f.clone(), 0x2c2152);
      addSolid(T(box(0.4, 0.4, 0.4), 4.2, 0.2, 0), f.clone(), 0x2c2152);
    }
    // clubs: black boxes drenched in signage
    const names = ['NEON EDEN', 'CHROME KITTY', 'ZERO-G', 'PINK CIRCUIT', 'HOLO HOLO', 'THE JACK-IN'];
    for (let i = 0; i < 6; i++) {
      const lat = a.lat + (rnd() - 0.5) * 14, lon = a.lon + (rnd() - 0.5) * 16;
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
      const ang = rnd() * Math.PI * 2, dist = 5 + rnd() * 30;
      const lat = a.lat + Math.cos(ang) * dist / R * 57.3;
      const lon = a.lon + Math.sin(ang) * dist / R * 57.3 / Math.cos(a.lat * 0.0174);
      const f = frameAt(lat, lon, rnd() * 360);
      const w = 6 + rnd() * 6, h = 14 + rnd() * 26, d = 6 + rnd() * 6;
      tower(f, w, h, d, pick(rnd, [0x201646, 0x1a1240, 0x261a52]), pick(rnd, NEON_LIST));
      if (h > 18 && rnd() < 0.8) {
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
      if (A.pos.distanceTo(B.pos) < 34) plank(A.pos, B.pos, 1.6);
    }
    // plaza obelisk — a beacon you can see over the horizon glow
    const f = frameAt(a.lat, a.lon, 0);
    addSolid(T(new THREE.CylinderGeometry(0.8, 1.6, 22, 6), 0, 11, 0), f.clone(), 0x120c2e);
    addGlow(T(new THREE.CylinderGeometry(0.28, 0.28, 21, 6), 0, 11, 0), f.clone(), NEON.cyan, 0.85);
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
      const lat = a.lat + (rnd() - 0.5) * 16, lon = a.lon + (rnd() - 0.5) * 18;
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
    tunnel(tf, 2.4, 2.6, 26, NEON.lime);
    const gate = textSign('FOUNDRY RUINS', { fg: hexCss(NEON.orange) });
    placeSign(gate, a.lat + 5, a.lon - 12, 208, 0, 4.8, 0);
  }

  // — THE PINK DUNES — open badlands, hoodoo rocks, one lone bar
  {
    const a = DISTRICTS[5];
    for (let i = 0; i < 9; i++) {
      const f = frameAt(a.lat + (rnd() - 0.5) * 14, a.lon + (rnd() - 0.5) * 16, rnd() * 360);
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
    const B = 46, H = 34;   // base half-width, height
    // 4 triangular faces built as custom geometry, front face has a gate slot
    function face(rotY, gate = false) {
      const g = new THREE.BufferGeometry();
      const verts = [];
      const A = [-B, 0, B], Bv = [B, 0, B], apex = [0, H, 0];
      if (!gate) {
        verts.push(...A, ...Bv, ...apex);
      } else {
        // leave a 6-wide × 9-tall doorway in the middle of the face
        const gw = 4.4, gh = 9;
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
    addSolid(T(box(30, 0.5, 30), 0, 0.25, 8), f.clone(), 0x141026);
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
    tunnel(tf, 2.6, 2.8, 46, NEON.red);
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
      const lat2 = a.lat + Math.cos(ang * 0.0174) * 20, lon2 = a.lon + Math.sin(ang * 0.0174) * 24;
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
    return bd < best.pad + 22 ? best : null;
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
