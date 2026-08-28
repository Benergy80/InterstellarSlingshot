// ════════════════════════════════════════════════════════════════
// VOLKARIS — DETAIL / ATMOSPHERE LAYER
//
// The Neon City dressing pass ported onto a 60u sphere: hero ad
// billboards, Vex propaganda screens, a shared LED ticker, plaza
// holograms, aviation strobes, searchlights, steam, barrel fires,
// string lights, vending machines, warm light pools — plus rain,
// forked lightning and a rolling weather cycle, all reoriented per
// frame to the local "down" of wherever the captain is standing.
//
// Budget: ~29 steady-state draw calls. Everything static merges;
// everything repeated instances; everything sparkly is ONE Points.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import {
  C, NEON, NEON_LIST, mulberry32, pick, clamp,
  tangentFrame, surfaceMatrix, makeCanvas, canvasTexture, hexCss,
} from './config.js';

const R = C.R;

// ── module-scope scratch (update() allocates nothing) ──
const _Y = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _c1 = new THREE.Color();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _AXZ = new THREE.Vector3(0, 0, 1);

// ── tiny texture helpers (NC fx.js glow/streak) ──
function glowTex(size, rgba) {
  const [c, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, rgba);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
function streakTex() {
  const [c, ctx] = makeCanvas(16, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(6, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

// ════════════════════════════════════════════════════════════════
export function buildDetails(scene, planet, audio, hud) {
  const rnd = mulberry32(C.SEED + 777);
  const { towerSpots, pathSamples, districts, terrainHeight, portInfo } = planet;
  const updates = [];   // fns(dt, t, playerPos, camera)
  // instanced street props (dumpsters, vending machines) never bake into
  // the collision BVH by traversal — invisible per-instance proxies here
  // get registered via planet.addColliders so players, NPCs and BOLTS
  // all treat them as solid
  const propColliders = new THREE.Group();
  function addPropCollider(geo, matrix) {
    const m = new THREE.Mesh(geo);
    m.matrixAutoUpdate = false;
    m.matrix.copy(matrix);
    m.visible = false;
    propColliders.add(m);
  }

  const byHeight = [...towerSpots].sort((a, b) => b.h - a.h);
  const distOf = key => districts.find(d => d.key === key);

  // tangent-plane nudge of a unit dir by (east u, north u) — build-time only
  function offsetDir(dir, dx, dz) {
    const { east, north } = tangentFrame(dir);
    return dir.clone().addScaledVector(east, dx / R).addScaledVector(north, dz / R).normalize();
  }
  // path samples inside a district pad (+slack u)
  function samplesIn(key, slack = 4) {
    const d = distOf(key);
    return d ? pathSamples.filter(p => p.angleTo(d.dir) * R < d.pad + slack) : [];
  }
  // billboard plane glued to one face of a tower, UV-remapped into an atlas cell
  function facePlane(spot, bw, bh, y, side, cell, COLS, ROWS) {
    const g = new THREE.PlaneGeometry(bw, bh);
    const uv = g.attributes.uv, col = cell % COLS, row = (cell / COLS) | 0;
    const vLo = 1 - (row + 1) / ROWS;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / COLS, vLo + uv.getY(i) / ROWS);
    const off = 0.35;
    if (side === 0) g.translate(0, y, spot.d / 2 + off);
    else if (side === 1) { g.rotateY(Math.PI); g.translate(0, y, -spot.d / 2 - off); }
    else if (side === 2) { g.rotateY(Math.PI / 2); g.translate(spot.w / 2 + off, y, 0); }
    else { g.rotateY(-Math.PI / 2); g.translate(-spot.w / 2 - off, y, 0); }
    g.applyMatrix4(spot.frame);
    return g;
  }
  function vcolor(geo, hex, boost = 1.2) {
    _c1.set(hex).multiplyScalar(boost);
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c1.r; col[i * 3 + 1] = _c1.g; col[i * 3 + 2] = _c1.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }

  // ════════════ 1 · HERO BILLBOARDS — canvas ads + scanline/blink ════════════
  // One 4×2 atlas, one merged geometry, one draw call for all 12 boards.
  {
    const ads = [
      { main: 'VOLT-COLA',   sub: 'TASTE THE CURRENT',            color: NEON.cyan },
      { main: 'ORBITAL LOOP', sub: 'RIDE THE RING · ALWAYS ON TIME', color: NEON.lime },
      { main: 'VEX-CORP',    sub: 'POWER FOR THE PYRAMID',        color: NEON.purple },
      { main: 'JETPACK REPAIR', sub: 'WE FIX FLAMEOUTS · BAY 9',  color: NEON.amber },
      { main: 'NOODLE BAR',  sub: 'HOT BOWLS · ZERO QUESTIONS',   color: NEON.pink },
      { main: 'SCRAP MARKET', sub: 'BUY · SELL · SURVIVE',        color: NEON.orange },
      { main: 'LAST LIGHT',  sub: 'COLD DRINKS AT WORLD\'S END',  color: NEON.amber },
      { main: 'CHROME KITTY', sub: 'THE CIRCUIT NEVER SLEEPS',    color: NEON.magenta },
    ];
    const COLS = 4, ROWS = 2, CW = 512, CH = 288;
    const [cv, ctx] = makeCanvas(COLS * CW, ROWS * CH);
    ads.forEach((ad, i) => {
      const x0 = (i % COLS) * CW, y0 = ((i / COLS) | 0) * CH;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + CH);
      g.addColorStop(0, '#0a0518'); g.addColorStop(1, '#170a2e');
      ctx.fillStyle = g; ctx.fillRect(x0, y0, CW, CH);
      ctx.strokeStyle = hexCss(ad.color, 0.8); ctx.lineWidth = 8;
      ctx.strokeRect(x0 + 8, y0 + 8, CW - 16, CH - 16);
      ctx.shadowColor = hexCss(ad.color, 1); ctx.shadowBlur = 26;
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 62px Orbitron, monospace';
      ctx.fillText(ad.main, x0 + CW / 2, y0 + 140);
      ctx.shadowBlur = 8;
      ctx.font = '30px Rajdhani, sans-serif';
      ctx.fillStyle = hexCss(ad.color, 1);
      ctx.fillText(ad.sub, x0 + CW / 2, y0 + 198);
    });
    const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(cv), side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = planet.uTime;
      shader.fragmentShader = 'uniform float uTime;\n' + shader.fragmentShader
        .replace('#include <map_fragment>', `
          #include <map_fragment>
          float hCell = floor(vMapUv.x * ${COLS}.0) + floor(vMapUv.y * ${ROWS}.0) * ${COLS}.0;
          float hPh = hCell * 1.7;
          float scan = 0.86 + 0.14 * step(0.5, fract(vMapUv.y * 90.0 - uTime * 7.0));
          float blink = step(0.06, fract(sin(floor(uTime * 2.0 + hPh) * 91.7) * 43758.5));
          diffuseColor.rgb *= scan * mix(0.35, 1.0, blink) * 1.25;
        `);
    };
    const geos = [];
    byHeight.slice(0, 12).forEach((s, k) => {
      const bw = Math.min(s.w * 1.3, 7.4), bh = bw * 0.56;
      geos.push(facePlane(s, bw, bh, clamp(s.h * 0.68, 3, s.h - bh / 2 - 0.4), k % 4, k % ads.length, COLS, ROWS));
    });
    if (geos.length) {
      const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), mat);
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  // ════════════ 2 · PROPAGANDA BILLBOARDS — Overlord Vex, glitch shader ════════════
  {
    const props = [
      { party: 'MINISTRY OF SIGHT',   slogan: 'VEX\nSEES ALL',            by: 'Curfew is kindness',            paid: 'Obsidian Council' },
      { party: 'PORT AUTHORITY',      slogan: 'REPORT SUSPICIOUS\nCAPTAINS', by: 'Off-worlders walk among us', paid: 'Harbor Watch' },
      { party: 'CIVIC SUPPLY',        slogan: 'THE PYRAMID\nPROVIDES',    by: 'Ration day is a gift',          paid: 'Vex-Corp Logistics' },
      { party: 'TRANSIT DECREE 12',   slogan: 'OBEY\nTHE ORBIT',          by: 'The Loop runs for Vex',         paid: 'Orbital Loop Authority' },
      { party: 'MINISTRY OF JOY',     slogan: 'SMILE FOR\nTHE WATCHERS',  by: 'Happiness audits weekly',       paid: 'Bureau of Morale' },
      { party: 'DECREE 88',           slogan: 'PILGRIM STEPS\nCLOSED',    by: 'Trespass is treason',           paid: 'Pyramid Guard' },
      { party: 'HARBOR EDICT',        slogan: 'NO SHIP\nLEAVES',          by: 'Impound protects you',          paid: 'Port Meridian Command' },
      { party: 'ONE VOLKARIS',        slogan: 'UNITY\nTHROUGH VEX',       by: 'Eight districts, one will',     paid: 'Obsidian Council' },
      { party: 'DREAM OFFICE',        slogan: 'THE OVERLORD\nDREAMS FOR YOU', by: 'Sleep is scheduled',        paid: 'Ministry of Night' },
      { party: 'SIGNAL CORPS',        slogan: 'YOUR STATIC\nIS HEARD',    by: 'Every channel is his channel',  paid: 'Vex Broadcast Node 1' },
    ];
    const COLS = 4, ROWS = 3, CW = 512, CH = 288;
    const [cv, ctx] = makeCanvas(COLS * CW, ROWS * CH);
    props.forEach((p, i) => {
      const x0 = (i % COLS) * CW, y0 = ((i / COLS) | 0) * CH;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + CH);
      g.addColorStop(0, '#080611'); g.addColorStop(1, '#150a24');
      ctx.fillStyle = g; ctx.fillRect(x0, y0, CW, CH);
      ctx.fillStyle = hexCss(NEON.red, 0.9); ctx.fillRect(x0, y0, 26, CH);   // side bar
      ctx.fillStyle = '#0a0a12'; ctx.textAlign = 'center';
      ctx.font = 'bold 22px Orbitron, monospace'; ctx.fillText('▲', x0 + 13, y0 + 150);
      ctx.strokeStyle = hexCss(NEON.magenta, 0.85); ctx.lineWidth = 7;
      ctx.strokeRect(x0 + 8, y0 + 8, CW - 16, CH - 16);
      ctx.shadowColor = hexCss(NEON.magenta, 1); ctx.shadowBlur = 12;
      ctx.fillStyle = hexCss(NEON.magenta, 1); ctx.textAlign = 'left';
      ctx.font = 'bold 26px Rajdhani, sans-serif'; ctx.fillText(p.party, x0 + 46, y0 + 52);
      const lines = p.slogan.split('\n');
      ctx.fillStyle = '#fff'; ctx.shadowBlur = 22; ctx.textAlign = 'center';
      ctx.font = 'bold 48px Orbitron, monospace';
      lines.forEach((ln, j) => ctx.fillText(ln, x0 + 268, y0 + 116 + j * 56));
      ctx.shadowBlur = 8; ctx.fillStyle = hexCss(NEON.amber, 1);
      ctx.font = '27px Rajdhani, sans-serif'; ctx.fillText(p.by, x0 + 268, y0 + 232);
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(200,210,235,0.55)';
      ctx.font = '15px Rajdhani, sans-serif';
      ctx.fillText('BY ORDER OF ' + p.paid.toUpperCase() + ' · VOLKARIS', x0 + 268, y0 + 262);
    });
    const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(cv), side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = planet.uTime;
      shader.fragmentShader = 'uniform float uTime;\n' + shader.fragmentShader
        .replace('#include <map_fragment>', `
          #ifdef USE_MAP
          float gT = uTime;
          float cw = 1.0 / ${COLS}.0;
          float cx0 = floor(vMapUv.x / cw) * cw;
          float uPhase = (floor(vMapUv.x / cw) + floor(vMapUv.y * ${ROWS}.0) * ${COLS}.0) * 2.3;
          float burst = step(0.84, fract(sin(floor(gT * 6.0 + uPhase) * 45.13) * 271.7));
          vec2 gUv = vMapUv;
          float band = floor(vMapUv.y * 26.0);
          float bandRand = fract(sin(band * 12.9898 + floor(gT * 14.0) * 7.77) * 43758.5453);
          float slip = step(0.7, bandRand) * (bandRand - 0.85) * (0.04 + burst * 0.16);
          gUv.x = clamp(gUv.x + slip, cx0 + 0.002, cx0 + cw - 0.002);
          float ca = 0.0035 + burst * 0.02 * bandRand;
          vec4 cR = texture2D(map, gUv + vec2(ca, 0.0));
          vec4 cG = texture2D(map, gUv);
          vec4 cB = texture2D(map, gUv - vec2(ca, 0.0));
          vec4 sampledDiffuseColor = vec4(cR.r, cG.g, cB.b, cG.a);
          diffuseColor *= sampledDiffuseColor;
          float scan = 0.84 + 0.16 * step(0.5, fract(vMapUv.y * 130.0 - gT * 6.0));
          float blink = 0.78 + 0.22 * step(0.5, fract(gT * 0.6 + uPhase));
          float drop = 1.0 - 0.55 * step(0.965, fract(sin(floor(gT * 9.0 + uPhase * 3.0) * 91.7) * 4385.5));
          diffuseColor.rgb *= scan * blink * drop;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0) - diffuseColor.rgb, burst * step(0.9, bandRand) * 0.7);
          #endif
        `);
    };
    const geos = [];
    byHeight.slice(12, 22).forEach((s, k) => {
      const bw = Math.min(s.w * 1.2, 6), bh = bw * 0.56;
      geos.push(facePlane(s, bw, bh, clamp(s.h * 0.45, 2.4, s.h - bh / 2 - 0.4), (k + 1) % 4, k % props.length, COLS, ROWS));
    });
    if (geos.length) {
      const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), mat);
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  // ════════════ 3 · LED TICKER — one shared canvas, 20 boards + circuit megascreen ════════════
  let ledTex;   // shared with the zeppelin marquee (§16)
  {
    const [lc, lctx] = makeCanvas(512, 128);
    ledTex = canvasTexture(lc);
    const msgs = [
      'ORBITAL LOOP ON TIME', 'VULTYR PATROL ADVISORY — SECTOR 4',
      'SPACEPORT LOCKDOWN LIFTED — PERMITS REQUIRED', 'CURFEW 22:00 BY ORDER OF VEX',
      'SCRAP PRICES UP 12%', 'LAKE VOLTAINE GLOW LEVELS: NORMAL',
      'MISSING: ONE ESCAPE-POD PILOT — REWARD', 'THE PYRAMID PROVIDES',
    ];
    const hueArr = ['#00f0ff', '#ff2bd6', '#ffb300', '#53ffe9', '#ff3355'];
    let mi = 0, acc = 0, scrollX = 0;
    updates.push((dt) => {   // ~11 Hz redraw
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
    const mids = byHeight.filter(s => s.h > 5.5 && s.h < 14).sort(() => rnd() - 0.5).slice(0, 20);
    const boards = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(5.4, 1.35),
      new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false, side: THREE.DoubleSide }),
      mids.length + 1);
    const dummy = new THREE.Object3D(), local = new THREE.Matrix4();
    mids.forEach((s, i) => {
      const side = (rnd() * 4) | 0, off = 0.4;
      const p = [[0, 0, s.d / 2 + off, 0], [0, 0, -s.d / 2 - off, Math.PI],
                 [s.w / 2 + off, 0, 0, Math.PI / 2], [-s.w / 2 - off, 0, 0, -Math.PI / 2]][side];
      dummy.position.set(p[0], 2.4 + rnd() * Math.max(0.5, s.h - 4), p[2]);
      dummy.rotation.set(0, p[3], 0);
      dummy.scale.setScalar(0.6 + rnd() * 0.6);
      dummy.updateMatrix();
      local.multiplyMatrices(s.frame, dummy.matrix);
      boards.setMatrixAt(i, local);
    });
    { // the big screen over the Circuit
      const d = distOf('circuit');
      const dir = offsetDir(d.dir, 6, -8);
      dummy.position.set(0, 5.2, 0);
      dummy.rotation.set(0, (rnd() * Math.PI * 2), 0);
      dummy.scale.set(2.6, 2.6, 1);
      dummy.updateMatrix();
      local.multiplyMatrices(surfaceMatrix(dir, terrainHeight(dir)), dummy.matrix);
      boards.setMatrixAt(mids.length, local);
    }
    boards.frustumCulled = false;
    scene.add(boards);
  }

  // ════════════ 4 · CITY HOLOGRAMS — wireframe projections + beams + pads ════════════
  {
    const holos = [];
    const padGeos = [], beamGeos = [];
    const holoMat = (c, op) => new THREE.MeshBasicMaterial({
      color: new THREE.Color(c), wireframe: true, transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    // Icosahedron is non-indexed while Torus/Cone/Box are indexed —
    // normalize before merging or mergeGeometries returns null
    const ni = (g) => (g.index ? g.toNonIndexed() : g);
    const makeForm = (kind, c) => {
      if (kind === 'planet') {
        const g = BufferGeometryUtils.mergeGeometries([
          ni(new THREE.IcosahedronGeometry(1.9, 1)),
          ni(new THREE.TorusGeometry(2.9, 0.16, 5, 22).rotateX(1.2)),
        ]);
        return new THREE.Mesh(g, holoMat(c, 0.45));
      }
      if (kind === 'ship') {
        const g = BufferGeometryUtils.mergeGeometries([
          ni(new THREE.ConeGeometry(0.8, 3.2, 7).rotateX(Math.PI / 2)),
          ni(new THREE.BoxGeometry(3.8, 0.16, 1.1)),
        ]);
        return new THREE.Mesh(g, holoMat(c, 0.55));
      }
      return new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.55, 7, 18), holoMat(c, 0.5));
    };
    const kinds = ['planet', 'ship', 'torus'];
    const cols = [NEON.cyan, NEON.magenta, NEON.lime, NEON.purple, NEON.blue];
    districts.forEach((d, n) => {
      const dir = offsetDir(d.dir, (rnd() - 0.5) * 10, (rnd() - 0.5) * 10);
      const up = dir.clone();
      const r = terrainHeight(dir);
      const hgt = 7 + rnd() * 5;
      const c = cols[n % cols.length];
      const pivot = new THREE.Group();
      pivot.position.copy(up).multiplyScalar(r + hgt);
      pivot.quaternion.setFromUnitVectors(_Y, up);
      const form = makeForm(kinds[n % kinds.length], c);
      form.scale.setScalar(0.8 + rnd() * 0.7);
      pivot.add(form);
      scene.add(pivot);
      const beam = new THREE.ConeGeometry(1.5, hgt, 12, 1, true);
      beam.translate(0, hgt / 2, 0);
      beam.applyMatrix4(surfaceMatrix(dir, r));
      beamGeos.push(vcolor(beam, c, 1));
      const padG = new THREE.CylinderGeometry(1.3, 1.45, 0.28, 14);
      padG.translate(0, 0.14, 0);
      padG.applyMatrix4(surfaceMatrix(dir, r));
      padGeos.push(vcolor(padG, c, 1.15));
      holos.push({ form, ph: rnd() * 9, spin: 0.25 + rnd() * 0.5 });
    });
    const beams = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(beamGeos),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beams.frustumCulled = false;
    scene.add(beams);
    const pads = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(padGeos),
      new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    pads.frustumCulled = false;
    scene.add(pads);
    updates.push((dt, t) => {
      for (const h of holos) {
        h.form.rotation.y += dt * h.spin;
        const flick = 0.4 + 0.16 * Math.sin(t * 3 + h.ph) + (Math.sin(t * 47 + h.ph) > 0.93 ? -0.22 : 0);
        h.form.material.opacity = Math.max(0.12, flick);
      }
      beams.material.opacity = 0.04 + 0.03 * (0.5 + 0.5 * Math.sin(t * 2));
    });
  }

  // ════════════ 5 · AVIATION STROBES — one Points, per-point phase blink ════════════
  {
    const talls = towerSpots.filter(s => s.h > 11);
    const N = talls.length + 1;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), ph = new Float32Array(N);
    talls.forEach((s, i) => {
      _v1.setFromMatrixPosition(s.frame).addScaledVector(_v2.setFromMatrixColumn(s.frame, 1), s.h + 0.7);
      pos[i * 3] = _v1.x; pos[i * 3 + 1] = _v1.y; pos[i * 3 + 2] = _v1.z;
      ph[i] = rnd() * 6;
    });
    { // the pyramid tip — Vex's own warning light
      const dir = distOf('pyramid').dir;
      _v1.copy(dir).multiplyScalar(terrainHeight(dir) + 18.8);
      const i = N - 1;
      pos[i * 3] = _v1.x; pos[i * 3 + 1] = _v1.y; pos[i * 3 + 2] = _v1.z;
      ph[i] = 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const strobes = new THREE.Points(g, new THREE.PointsMaterial({
      map: glowTex(32, 'rgba(255,80,80,1)'), size: 1.6, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    strobes.frustumCulled = false;
    scene.add(strobes);
    updates.push((dt, t) => {
      for (let i = 0; i < N; i++) {
        const on = Math.sin(t * 2.4 + ph[i]) > 0 ? 1 : 0.12;
        col[i * 3] = on; col[i * 3 + 1] = on * 0.12; col[i * 3 + 2] = on * 0.12;
      }
      g.attributes.color.needsUpdate = true;
    });
  }

  // ════════════ 6 · SEARCHLIGHTS — port sweep, pyramid menace, rooftop shafts ════════════
  {
    const beams = [];
    const beamMat = (hex, op = 0.05) => new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex), transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    function skyBeam(pos, coneR, coneH, hex, sway = 0.4) {
      const up = pos.clone().normalize();
      const pivot = new THREE.Group();
      pivot.position.copy(pos);
      pivot.quaternion.setFromUnitVectors(_Y, up);
      const geo = new THREE.ConeGeometry(coneR, coneH, 14, 1, true);
      geo.translate(0, coneH / 2, 0);
      const beam = new THREE.Mesh(geo, beamMat(hex));
      pivot.add(beam);
      scene.add(pivot);
      beams.push({ beam, ph: rnd() * 6, sway });
    }
    // two crossing sweeps over Port Meridian
    {
      const { east, north } = tangentFrame(portInfo.dir);
      skyBeam(portInfo.padCenter.clone().addScaledVector(east, 12).addScaledVector(north, -6), 3.4, 85, 0x9fdcff);
      skyBeam(portInfo.padCenter.clone().addScaledVector(east, -12).addScaledVector(north, 7), 3.4, 85, 0x9fdcff);
    }
    // one magenta menace from the pyramid apex
    {
      const dir = distOf('pyramid').dir;
      skyBeam(dir.clone().multiplyScalar(terrainHeight(dir) + 18.4), 4.6, 95, NEON.magenta, 0.28);
    }
    // faint shafts off the three tallest rooftops
    byHeight.slice(0, 3).forEach(s => {
      _v1.setFromMatrixPosition(s.frame).addScaledVector(_v2.setFromMatrixColumn(s.frame, 1), s.h);
      skyBeam(_v1.clone(), 2.0, 55, pick(rnd, [NEON.cyan, NEON.pink, NEON.lime]), 0.12);
    });
    updates.push((dt, t) => {
      for (const o of beams) {
        o.beam.rotation.z = Math.sin(t * 0.21 + o.ph) * o.sway;
        o.beam.rotation.x = Math.cos(t * 0.17 + o.ph) * o.sway;
        o.beam.material.opacity = 0.04 + 0.025 * (0.5 + 0.5 * Math.sin(t * 0.6 + o.ph));
      }
    });
  }

  // ════════════ 7 · STEAM VENTS — one Points, looping rise, sin fade ════════════
  {
    const spots = [...samplesIn('market', 6), ...samplesIn('circuit', 6)];
    const N = Math.min(14, spots.length);
    const base = new Float32Array(N * 3), ups = new Float32Array(N * 3);
    const sp = new Float32Array(N), ph = new Float32Array(N);
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const p = spots[(rnd() * spots.length) | 0];
      const dir = offsetDir(p, (rnd() - 0.5) * 4, (rnd() - 0.5) * 4);
      _v1.copy(dir).multiplyScalar(terrainHeight(dir) + 0.4);
      base[i * 3] = _v1.x; base[i * 3 + 1] = _v1.y; base[i * 3 + 2] = _v1.z;
      ups[i * 3] = dir.x; ups[i * 3 + 1] = dir.y; ups[i * 3 + 2] = dir.z;
      sp[i] = 0.25 + rnd() * 0.3; ph[i] = rnd() * 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const steam = new THREE.Points(g, new THREE.PointsMaterial({
      map: glowTex(48, 'rgba(200,210,235,0.55)'), size: 3.2, vertexColors: true,
      transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    steam.frustumCulled = false;
    scene.add(steam);
    updates.push((dt, t) => {
      for (let i = 0; i < N; i++) {
        const k = (t * sp[i] + ph[i]) % 1;
        const lift = 0.4 + k * 4.2, fade = Math.sin(k * Math.PI) * 0.5;
        pos[i * 3] = base[i * 3] + ups[i * 3] * lift;
        pos[i * 3 + 1] = base[i * 3 + 1] + ups[i * 3 + 1] * lift;
        pos[i * 3 + 2] = base[i * 3 + 2] + ups[i * 3 + 2] * lift;
        col[i * 3] = fade * 0.72; col[i * 3 + 1] = fade * 0.78; col[i * 3 + 2] = fade * 0.92;
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
    });
  }

  // ════════════ 8 · ALLEY DRESSING — dumpsters, barrel fires, red doorways ════════════
  {
    const spots = [...samplesIn('market', 8), ...samplesIn('ruins', 8), ...samplesIn('circuit', 6)];
    const NB = Math.min(9, spots.length);
    // dumpster + barrel merged, instanced once
    const dumpGeo = BufferGeometryUtils.mergeGeometries([
      new THREE.BoxGeometry(2.0, 1.2, 1.1).translate(0, 0.6, 0),
      new THREE.CylinderGeometry(0.36, 0.36, 0.95, 8).translate(1.7, 0.48, 0.2),
    ]);
    const dumps = new THREE.InstancedMesh(dumpGeo,
      new THREE.MeshLambertMaterial({ color: 0x1d1830 }), NB);
    const dummy = new THREE.Object3D();
    const N = NB * 2;   // fire + doorway glow per spot
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), ph = new Float32Array(NB);
    for (let i = 0; i < NB; i++) {
      const p = spots[(rnd() * spots.length) | 0];
      const dir = offsetDir(p, (rnd() - 0.5) * 5, (rnd() - 0.5) * 5);
      const m = surfaceMatrix(dir, terrainHeight(dir) - 0.05, rnd() * 360);
      dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
      dummy.applyMatrix4(m);
      dummy.updateMatrix();
      dumps.setMatrixAt(i, dummy.matrix);
      addPropCollider(dumpGeo, dummy.matrix);
      _v1.set(1.7, 1.15, 0.2).applyMatrix4(m);        // fire over the barrel
      pos[i * 6] = _v1.x; pos[i * 6 + 1] = _v1.y; pos[i * 6 + 2] = _v1.z;
      _v1.set(-2.6, 2.2, 1.4).applyMatrix4(m);        // red doorway glow
      pos[i * 6 + 3] = _v1.x; pos[i * 6 + 4] = _v1.y; pos[i * 6 + 5] = _v1.z;
      ph[i] = rnd() * 6;
    }
    dumps.frustumCulled = false;
    scene.add(dumps);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const glows = new THREE.Points(g, new THREE.PointsMaterial({
      map: glowTex(32, 'rgba(255,170,80,1)'), size: 1.7, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    glows.frustumCulled = false;
    scene.add(glows);
    updates.push((dt, t) => {
      for (let i = 0; i < NB; i++) {
        // 3-sine barrel flicker
        const fl = clamp(0.6 + 0.22 * Math.sin(t * 17 + ph[i]) + 0.14 * Math.sin(t * 11.3 + ph[i] * 2) + (Math.sin(t * 41 + ph[i]) > 0.8 ? 0.2 : 0), 0.3, 1);
        col[i * 6] = fl; col[i * 6 + 1] = fl * 0.55; col[i * 6 + 2] = fl * 0.16;
        const dr = 0.3 + 0.4 * (Math.sin(t * 9 + ph[i]) > 0.3 ? 1 : 0.2);   // doorway
        col[i * 6 + 3] = dr; col[i * 6 + 4] = dr * 0.14; col[i * 6 + 5] = dr * 0.2;
      }
      g.attributes.color.needsUpdate = true;
    });
  }

  // ════════════ 9 · STRING LIGHTS — sagging strands over the market ════════════
  {
    const spots = samplesIn('market', 5);
    const pts = [], cols = [];
    let strands = 0;
    for (let i = 0; i < spots.length && strands < 10; i += 3) {
      const a = spots[i];
      let b = null;
      for (let j = i + 4; j < spots.length; j += 2) {
        const d = a.distanceTo(spots[j]) * R;
        if (d > 5 && d < 12) { b = spots[j]; break; }
      }
      if (!b) continue;
      strands++;
      const lift = 4.2 + rnd() * 1.6, n = 11;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const dir = _v1.copy(a).lerp(b, t).normalize();
        const sag = Math.sin(t * Math.PI) * 1.3;
        _v2.copy(dir).multiplyScalar(terrainHeight(dir) + lift - sag);
        pts.push(_v2.x, _v2.y, _v2.z);
        _c1.set(pick(rnd, NEON_LIST));
        cols.push(_c1.r * 1.4, _c1.g * 1.4, _c1.b * 1.4);
      }
    }
    if (pts.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
      const lights = new THREE.Points(g, new THREE.PointsMaterial({
        map: glowTex(32, 'rgba(255,255,255,1)'), size: 0.5, vertexColors: true,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
      }));
      lights.frustumCulled = false;
      scene.add(lights);
    }
  }

  // ════════════ 10 · VENDING MACHINES — instanced boxes + neon panels ════════════
  {
    const spots = [...samplesIn('market', 5), ...samplesIn('circuit', 5), ...samplesIn('downtown', 5), ...samplesIn('port', 5)];
    const N = Math.min(14, spots.length);
    const geo = new THREE.BoxGeometry(1.1, 1.9, 0.8);
    geo.translate(0, 0.95, 0);
    const boxes = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x141024 }), N);
    const panels = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.8, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), N);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const p = spots[(rnd() * spots.length) | 0];
      const dir = offsetDir(p, (rnd() - 0.5) * 4.4, (rnd() - 0.5) * 4.4);
      const m = surfaceMatrix(dir, terrainHeight(dir) - 0.05, rnd() * 360);
      dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
      dummy.applyMatrix4(m);
      dummy.updateMatrix();
      boxes.setMatrixAt(i, dummy.matrix);
      addPropCollider(geo, dummy.matrix);
      dummy.translateY(1.05); dummy.translateZ(0.42);
      dummy.updateMatrix();
      panels.setMatrixAt(i, dummy.matrix);
      panels.setColorAt(i, _c1.setHex(pick(rnd, NEON_LIST)).multiplyScalar(1.4));
    }
    if (panels.instanceColor) panels.instanceColor.needsUpdate = true;
    boxes.frustumCulled = panels.frustumCulled = false;
    scene.add(boxes, panels);
  }

  // ════════════ 11 · WARM LIGHT POOLS + GOD-RAY CONES ════════════
  {
    const poolGeos = [], rayGeos = [];
    for (let i = 0; i < 20; i++) {
      const p = pathSamples[(rnd() * pathSamples.length) | 0];
      const dir = offsetDir(p, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3);
      const m = surfaceMatrix(dir, terrainHeight(dir) + 0.08);
      const r = 1.6 + rnd() * 1.8;
      const q = new THREE.PlaneGeometry(r * 2, r * 2);
      q.rotateX(-Math.PI / 2);
      q.applyMatrix4(m);
      poolGeos.push(q);
      if (rnd() < 0.55) {
        const cone = new THREE.ConeGeometry(1.5, 5, 10, 1, true);
        cone.translate(0, 2.5, 0);
        cone.applyMatrix4(m);
        rayGeos.push(cone);
      }
    }
    const pools = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(poolGeos),
      new THREE.MeshBasicMaterial({ map: glowTex(96, 'rgba(255,185,95,0.9)'), color: 0xffb060, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    pools.frustumCulled = false;
    scene.add(pools);
    if (rayGeos.length) {
      const rays = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(rayGeos),
        new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      rays.frustumCulled = false;
      scene.add(rays);
    }
  }

  // ════════════ 12 · HERO TOWER WINDOWS — GPU hashed panes on shell boxes ════════════
  // NC makeTowerWindowMat, sphere-adapted: panes hash the tower's LOCAL
  // coordinates (baked as attributes BEFORE the frame transform), so the
  // grid stays axis-aligned to each building no matter how it sits on the
  // ball. All 7 shells merge into ONE mesh / ONE material.
  {
    const shellGeos = [];
    byHeight.slice(0, 7).forEach((s, k) => {
      const g = new THREE.BoxGeometry(s.w + 0.3, s.h, s.d + 0.3);
      g.translate(0, s.h / 2, 0);
      // bake local-space position/normal + per-tower seed, then transform
      g.setAttribute('aLocal', g.attributes.position.clone());
      g.setAttribute('aLNorm', g.attributes.normal.clone());
      const n = g.attributes.position.count, seed = new Float32Array(n).fill(k * 1.618 + 0.7);
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      g.applyMatrix4(s.frame);
      shellGeos.push(g);
    });
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c2030, roughness: 0.45, metalness: 0.45 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = planet.uTime;
      shader.vertexShader = `
        attribute vec3 aLocal; attribute vec3 aLNorm; attribute float aSeed;
        varying vec3 vLPos; varying vec3 vLNorm; varying float vSeed;
      ` + shader.vertexShader
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          vLPos = aLocal; vLNorm = aLNorm; vSeed = aSeed;
        `);
      shader.fragmentShader = `
        uniform float uTime;
        varying vec3 vLPos; varying vec3 vLNorm; varying float vSeed;
        float nh2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      ` + shader.fragmentShader
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          diffuseColor.rgb *= (0.42 + 0.58 * smoothstep(0.0, 6.0, vLPos.y));
        `)
        .replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          {
            float side = 1.0 - step(0.6, abs(vLNorm.y));
            float fc = abs(vLNorm.x) > abs(vLNorm.z) ? vLPos.z : vLPos.x;
            vec2 cuv = vec2(fc, vLPos.y) / vec2(1.5, 1.8);
            vec2 id = floor(cuv); vec2 f = fract(cuv);
            float inWin = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.76);
            float lit = step(0.45, nh2(id + vSeed * 13.7));
            float hc = nh2(id * 1.7 + vSeed * 7.3);
            vec3 wcol = hc < 0.32 ? vec3(1.0, 0.72, 0.38) : (hc < 0.85 ? vec3(0.45, 0.83, 1.0) : vec3(1.0, 0.35, 0.75));
            float vary = 0.35 + 0.65 * nh2(id * 2.3 + vSeed * 3.1);
            float fl = nh2(id + floor(uTime * 1.7) + vSeed);
            float flicker = mix(1.0, step(0.22, fl), step(0.958, nh2(id * 3.1 + vSeed)));
            float ground = step(1.6, vLPos.y);
            totalEmissiveRadiance += inWin * lit * vary * flicker * wcol * 0.95 * side * ground;
          }
        `);
    };
    if (shellGeos.length) {
      const shells = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(shellGeos), mat);
      shells.frustumCulled = false;
      scene.add(shells);
    }
  }

  // ════════════ 13 · PORT OPERATIONS — two ships cycling the pad ════════════
  // parked → spool → ascend (local up) → cruise (dir rotates around a
  // tangent axis, over the horizon) → await → descend back to the pad.
  {
    const engineTex = glowTex(96, 'rgba(140,210,255,1)');
    function shipGeo() {
      const hull = new THREE.CapsuleGeometry(0.6, 2.6, 4, 10);
      hull.rotateX(Math.PI / 2);                       // nose +Z
      const parts = [vcolor(hull, 0x3a4468, 1)];
      for (const e of [-1, 1]) {
        parts.push(vcolor(new THREE.BoxGeometry(1.9, 0.14, 1.0).translate(e * 1.1, 0, -1.15), 0x2a3252, 1));
      }
      parts.push(vcolor(new THREE.SphereGeometry(0.4, 10, 8).translate(0, 0.34, 1.15), 0x73e8ff, 1.3));
      return BufferGeometryUtils.mergeGeometries(parts);
    }
    const shipMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const ships = [];
    [[6.5, 4], [-6, -5]].forEach(([ox, oz], i) => {
      const padDir = offsetDir(portInfo.dir, ox, oz);
      const baseR = terrainHeight(padDir) + 1.15;      // pad deck + skids
      const qBase = new THREE.Quaternion().setFromRotationMatrix(surfaceMatrix(padDir, baseR, rnd() * 360));
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(shipGeo(), shipMat));
      const eng = new THREE.Sprite(new THREE.SpriteMaterial({
        map: engineTex, color: 0x8fd4ff, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      eng.scale.set(2.6, 1.3, 1);
      eng.position.y = -0.55;
      grp.add(eng);
      grp.position.copy(padDir).multiplyScalar(baseR);
      grp.quaternion.copy(qBase);
      scene.add(grp);
      ships.push({
        grp, eng, padDir, baseR, qBase,
        d: padDir.clone(), ax: new THREE.Vector3(), ang: 0, av: 0,
        state: 'parked', t: 8 + rnd() * 16, yaw: 0, ph: rnd() * 9,
      });
    });
    updates.push((dt, t) => {
      for (const sh of ships) {
        switch (sh.state) {
          case 'parked':
            sh.t -= dt;
            if (sh.t <= 0) { sh.state = 'spool'; sh.t = 3.2; }
            break;
          case 'spool': {
            sh.t -= dt;
            const k = 1 - sh.t / 3.2;
            sh.eng.material.opacity = k * 0.85;
            sh.grp.position.copy(sh.padDir).multiplyScalar(sh.baseR + Math.sin(t * 30) * 0.04 * k);
            if (sh.t <= 0) { sh.state = 'ascend'; sh.t = 0; }
            break;
          }
          case 'ascend': {
            sh.t += dt;
            const k = Math.min(1, sh.t / 8), e = k * k * (3 - 2 * k);
            sh.grp.position.copy(sh.padDir).multiplyScalar(sh.baseR + e * 26);
            sh.yaw += dt * 0.15;
            _q1.setFromAxisAngle(_Y, sh.yaw);
            sh.grp.quaternion.copy(sh.qBase).multiply(_q1);
            sh.eng.material.opacity = 0.85;
            if (k >= 1) {
              sh.state = 'cruise';
              // random tangent axis: the ship arcs off over the horizon
              const th = sh.ph;
              _v1.set(-sh.padDir.z, 0, sh.padDir.x).normalize();        // east
              _v2.crossVectors(_v1, sh.padDir).normalize();              // north
              sh.ax.copy(_v1).multiplyScalar(Math.cos(th)).addScaledVector(_v2, Math.sin(th)).normalize();
              sh.d.copy(sh.padDir);
              sh.ang = 0; sh.av = 0;
            }
            break;
          }
          case 'cruise': {
            sh.av = Math.min(0.14, sh.av + dt * 0.045);
            sh.d.applyAxisAngle(sh.ax, sh.av * dt).normalize();
            sh.ang += sh.av * dt;
            sh.grp.position.copy(sh.d).multiplyScalar(sh.baseR + 26);
            _v1.crossVectors(sh.ax, sh.d).normalize();                   // travel dir
            _v2.crossVectors(sh.d, _v1);                                 // right = up × fwd
            _m4.makeBasis(_v2, sh.d, _v1);
            sh.grp.quaternion.setFromRotationMatrix(_m4);
            sh.grp.quaternion.multiply(_q1.setFromAxisAngle(_AXZ, -0.18)); // bank
            sh.eng.material.opacity = Math.max(0.3, sh.eng.material.opacity - dt * 0.4);
            if (sh.ang > 2.1) { sh.state = 'await'; sh.t = 8 + rnd() * 14; sh.eng.material.opacity = 0; sh.grp.visible = false; }
            break;
          }
          case 'await':
            sh.t -= dt;
            if (sh.t <= 0) {
              sh.state = 'descend'; sh.t = 0;
              sh.d.copy(offsetDir(sh.padDir, 10, -8));   // arrival vector (event-scale alloc)
              sh.grp.visible = true;
            }
            break;
          case 'descend': {
            sh.t += dt;
            const k = Math.min(1, sh.t / 10), e = 1 - (1 - k) * (1 - k);
            sh.d.lerp(sh.padDir, e * 0.12).normalize();
            sh.grp.position.copy(sh.d).multiplyScalar(sh.baseR + (1 - e) * 24);
            sh.grp.quaternion.slerp(sh.qBase, Math.min(1, dt * 1.4));
            sh.eng.material.opacity = 0.3 + 0.55 * e;
            if (k >= 1) {
              sh.state = 'parked'; sh.t = 12 + rnd() * 20;
              sh.yaw = 0;
              sh.d.copy(sh.padDir);
              sh.grp.position.copy(sh.padDir).multiplyScalar(sh.baseR);
              sh.grp.quaternion.copy(sh.qBase);
              sh.eng.material.opacity = 0;
            }
            break;
          }
        }
      }
    });
  }

  // ════════════ 14 · GRAFFITI — gang tags near market + ruins walls ════════════
  {
    const [cv, ctx] = makeCanvas(160, 96);
    const r2 = mulberry32(C.SEED + 31);
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = '#ffffff';
    for (let k = 0; k < 7; k++) {
      ctx.beginPath();
      ctx.moveTo(10 + r2() * 140, 12 + r2() * 70);
      ctx.bezierCurveTo(10 + r2() * 140, 12 + r2() * 70, 10 + r2() * 140, 12 + r2() * 70, 10 + r2() * 140, 12 + r2() * 70);
      ctx.stroke();
    }
    ctx.font = 'bold 30px Rajdhani, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('VEX LIES', 18 + r2() * 30, 56);
    const marketSpots = samplesIn('market', 6), ruinSpots = samplesIn('ruins', 6);
    const N = 10;
    const tags = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.9, 1.2),
      new THREE.MeshBasicMaterial({ map: canvasTexture(cv), transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      N);
    const gang = { market: [NEON.amber, NEON.pink], ruins: [NEON.orange, NEON.red] };
    const dummy = new THREE.Object3D(), local = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const fromMarket = i % 2 === 0 && marketSpots.length;
      const spots = fromMarket ? marketSpots : ruinSpots;
      if (!spots.length) continue;
      const p = spots[(rnd() * spots.length) | 0];
      const dir = offsetDir(p, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6);
      dummy.position.set(0, 1.1 + rnd() * 0.7, 0);
      dummy.rotation.set(0, 0, (rnd() - 0.5) * 0.14);
      dummy.scale.setScalar(0.8 + rnd() * 0.8);
      dummy.updateMatrix();
      local.multiplyMatrices(surfaceMatrix(dir, terrainHeight(dir), rnd() * 360), dummy.matrix);
      tags.setMatrixAt(i, local);
      tags.setColorAt(i, _c1.setHex(pick(rnd, gang[fromMarket ? 'market' : 'ruins'])).multiplyScalar(0.9));
    }
    if (tags.instanceColor) tags.instanceColor.needsUpdate = true;
    tags.frustumCulled = false;
    scene.add(tags);
  }

  // ════════════ 15 · CROSS-ALLEY CABLES — sagging spans over the streets ════════════
  {
    const spots = [...samplesIn('market', 6), ...samplesIn('circuit', 6), ...samplesIn('downtown', 6)];
    const geos = [];
    const seg = (a, b) => {
      _v3.subVectors(b, a);
      const len = _v3.length();
      const g = new THREE.CylinderGeometry(0.035, 0.035, len, 4, 1, true);
      g.translate(0, len / 2, 0);
      _q1.setFromUnitVectors(_Y, _v3.divideScalar(len));
      g.applyMatrix4(_m4.makeRotationFromQuaternion(_q1).setPosition(a));
      geos.push(g);
    };
    const A = new THREE.Vector3(), B = new THREE.Vector3(), M = new THREE.Vector3();
    for (let i = 0; i < 40 && spots.length; i++) {
      const p = spots[(rnd() * spots.length) | 0];
      const az = rnd() * Math.PI * 2, reach = 2.6 + rnd() * 1.8;
      const dA = offsetDir(p, Math.cos(az) * reach, Math.sin(az) * reach);
      const dB = offsetDir(p, -Math.cos(az) * reach, -Math.sin(az) * reach);
      A.copy(dA).multiplyScalar(terrainHeight(dA) + 3.4 + rnd() * 2.4);
      B.copy(dB).multiplyScalar(terrainHeight(dB) + 3.4 + rnd() * 2.4);
      M.addVectors(A, B).multiplyScalar(0.5).addScaledVector(p, -0.45);   // sag toward the planet
      seg(A, M); seg(M, B);
    }
    if (geos.length) {
      const cables = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos),
        new THREE.MeshBasicMaterial({ color: 0x0a0c16 }));
      cables.frustumCulled = false;
      scene.add(cables);
    }
  }

  // ════════════ 16 · ZEPPELIN — LED marquee airship on a slow orbit ════════════
  {
    const grp = new THREE.Group();
    // hull + gondola + fins, nose along +Z, one vertex-colored mesh
    const hull = new THREE.SphereGeometry(1.6, 16, 10);
    hull.scale(1, 1, 2.6);
    const bodyParts = [vcolor(hull, 0x2a3148, 1)];
    bodyParts.push(vcolor(new THREE.BoxGeometry(1.0, 0.6, 2.4).translate(0, -1.75, 0.2), 0x1a2030, 1));
    for (const e of [-1, 1]) {
      bodyParts.push(vcolor(new THREE.BoxGeometry(0.24, 1.9, 1.6).rotateX(e * 0.5).translate(0, e * 0.8, -3.8), 0x232c44, 1));
    }
    grp.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(bodyParts),
      new THREE.MeshLambertMaterial({ vertexColors: true })));
    // flank marquees share the LED ticker canvas — merged, one draw
    const mqGeos = [];
    for (const e of [-1, 1]) {
      const mq = new THREE.PlaneGeometry(4.4, 1.1);
      mq.rotateY(e * Math.PI / 2);
      mq.translate(e * 1.72, 0.15, 0);
      mqGeos.push(mq);
    }
    grp.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(mqGeos),
      new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false })));
    // downward searchlight
    const beamGeo = new THREE.ConeGeometry(2.6, 24, 12, 1, true);
    beamGeo.translate(0, -12, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xcfe6ff, transparent: true, opacity: 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    const pivot = new THREE.Group();
    pivot.position.y = -1.8;
    pivot.add(beam);
    grp.add(pivot);
    scene.add(grp);
    // orbit: tilted great circle at R+20
    const zAxis = offsetDir(distOf('downtown').dir, 30, -44);
    const zDir0 = new THREE.Vector3().crossVectors(zAxis, distOf('market').dir).normalize();
    updates.push((dt, t) => {
      const a = t * 0.014;
      _q1.setFromAxisAngle(zAxis, a);
      _v1.copy(zDir0).applyQuaternion(_q1);                    // radial dir
      grp.position.copy(_v1).multiplyScalar(R + 20 + Math.sin(t * 0.3) * 1.2);
      _v2.crossVectors(zAxis, _v1).normalize();                // travel dir
      _v3.crossVectors(_v1, _v2);                              // right = up × fwd
      _m4.makeBasis(_v3, _v1, _v2);
      grp.quaternion.setFromRotationMatrix(_m4);
      pivot.rotation.x = Math.sin(t * 0.3) * 0.3;
      pivot.rotation.z = Math.cos(t * 0.23) * 0.3;
    });
  }

  // ════════════ 17 · FIREWORKS over Lake Voltaine — pooled Points sim ════════════
  {
    const lakeDir = new THREE.Vector3(
      Math.cos(20 * Math.PI / 180) * Math.cos(133 * Math.PI / 180),
      Math.sin(20 * Math.PI / 180),
      Math.cos(20 * Math.PI / 180) * Math.sin(133 * Math.PI / 180));   // sphDir(20,133) = LAKE_DIR
    const { east: lkE, north: lkN } = tangentFrame(lakeDir);
    const FW = 220;
    const pos = new Float32Array(FW * 3).fill(-9999), col = new Float32Array(FW * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 1.3, map: glowTex(32, 'rgba(255,255,255,1)'), vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    // preallocated particle pool — zero allocation at runtime
    const parts = [];
    for (let i = 0; i < FW; i++) parts.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, shell: false, r: 0, g: 0, b: 0 });
    const free = () => { for (let i = 0; i < FW; i++) if (parts[i].life <= 0) return parts[i]; return null; };
    let timer = 5;
    updates.push((dt, t) => {
      timer -= dt;
      if (timer <= 0) {   // launch a shell off the lake
        timer = 6 + rnd() * 3;
        const p = free();
        if (p) {
          p.pos.copy(lakeDir).multiplyScalar(R - 0.5)
            .addScaledVector(lkE, (rnd() - 0.5) * 8).addScaledVector(lkN, (rnd() - 0.5) * 8);
          p.vel.copy(lakeDir).multiplyScalar(17 + rnd() * 6)
            .addScaledVector(lkE, (rnd() - 0.5) * 3).addScaledVector(lkN, (rnd() - 0.5) * 3);
          p.life = 1.6; p.shell = true;
          _c1.set(pick(rnd, NEON_LIST));
          p.r = _c1.r; p.g = _c1.g; p.b = _c1.b;
        }
      }
      for (let i = 0; i < FW; i++) {
        const p = parts[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        p.vel.addScaledVector(lakeDir, -15 * dt);   // gravity along local -up
        p.pos.addScaledVector(p.vel, dt);
        if (p.shell && (p.vel.dot(lakeDir) < 2 || p.life < 0.2)) {   // burst
          p.shell = false; p.life = 0;
          for (let k = 0; k < 36; k++) {
            const q = free();
            if (!q) break;
            const a = rnd() * Math.PI * 2, e2 = Math.acos(2 * rnd() - 1), sp2 = 4.5 + rnd() * 5;
            q.pos.copy(p.pos);
            q.vel.set(Math.sin(e2) * Math.cos(a) * sp2, Math.cos(e2) * sp2, Math.sin(e2) * Math.sin(a) * sp2);
            q.life = 1.1 + rnd() * 0.6; q.shell = false;
            q.r = p.r; q.g = p.g; q.b = p.b;
          }
        }
      }
      for (let i = 0; i < FW; i++) {
        const p = parts[i];
        if (p.life <= 0) { pos[i * 3 + 1] = -9999; continue; }
        const f = clamp(p.life, 0, 1);
        pos[i * 3] = p.pos.x; pos[i * 3 + 1] = p.pos.y; pos[i * 3 + 2] = p.pos.z;
        col[i * 3] = p.r * f; col[i * 3 + 1] = p.g * f; col[i * 3 + 2] = p.b * f;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    });
  }

  // ════════════ 18b · WEATHERING — rust/grime streaks + graffiti ════════
  // Decal quads on building faces, keyed to each district's identity:
  // rust in the Foundry, grime + tags in the street districts, and the
  // Dunes / Pyramid / Port kept pristine.
  {
    const streakTexC = (r, g, b) => {
      const [c, ctx] = makeCanvas(8, 48);
      const grd = ctx.createLinearGradient(0, 0, 0, 48);
      grd.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grd.addColorStop(0.14, `rgba(${r},${g},${b},0.5)`);
      grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 8, 48);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = `rgba(${(r * 0.55) | 0},${(g * 0.55) | 0},${(b * 0.55) | 0},0.4)`; ctx.fillRect(1 + i * 2.4, 5, 1, 40); }
      return canvasTexture(c);
    };
    const rustMat = new THREE.MeshBasicMaterial({ map: streakTexC(160, 88, 40), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85 });
    // pale mineral / water stains — read as light drips down the dark facades
    const grimeMat = new THREE.MeshBasicMaterial({ map: streakTexC(148, 138, 152), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.5 });
    const [tc, tctx] = makeCanvas(64, 32);
    const cols = ['#ff2fd6', '#00f6ff', '#7dff5d', '#ff7a1a'];
    tctx.lineWidth = 3; tctx.lineCap = 'round';
    for (let s = 0; s < 4; s++) { tctx.strokeStyle = cols[(rnd() * cols.length) | 0]; tctx.beginPath(); let x = 5 + rnd() * 10, y = 5 + rnd() * 22; tctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += 8 + rnd() * 8; y = 5 + rnd() * 22; tctx.lineTo(x, y); } tctx.stroke(); }
    const tagMat = new THREE.MeshBasicMaterial({ map: canvasTexture(tc), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.92, toneMapped: false });

    const rustGeos = [], grimeGeos = [], tagGeos = [];
    const addDecal = (geos, sw, sh, bframe, w, d, cy, face, span) => {
      const g = new THREE.PlaneGeometry(sw, sh);
      const off = 0.07, m = new THREE.Matrix4();
      if (face === 0) m.makeTranslation((rnd() - 0.5) * w * span, cy, d / 2 + off);
      else if (face === 1) { m.makeRotationY(Math.PI); m.setPosition((rnd() - 0.5) * w * span, cy, -d / 2 - off); }
      else if (face === 2) { m.makeRotationY(Math.PI / 2); m.setPosition(w / 2 + off, cy, (rnd() - 0.5) * d * span); }
      else { m.makeRotationY(-Math.PI / 2); m.setPosition(-w / 2 - off, cy, (rnd() - 0.5) * d * span); }
      g.applyMatrix4(bframe.clone().multiply(m));
      geos.push(g);
    };
    for (const sp of towerSpots) {
      if (sp.h < 4) continue;
      _v1.setFromMatrixPosition(sp.frame).normalize();
      let best = null, bd = -2;
      for (const dd of districts) { const dot = _v1.dot(dd.dir); if (dot > bd) { bd = dot; best = dd; } }
      const key = best && best.key;
      if (key === 'dunes' || key === 'pyramid' || key === 'port') continue;   // pristine
      const rust = key === 'ruins';
      const geos = rust ? rustGeos : grimeGeos;
      const nStreaks = rust ? 3 + ((rnd() * 3) | 0) : 1 + ((rnd() * 2) | 0);
      for (let i = 0; i < nStreaks; i++) {
        const sh = 1.4 + rnd() * Math.min(4, sp.h * 0.4);
        const top = 1.5 + rnd() * (sp.h - 1.5);
        addDecal(geos, 0.3 + rnd() * 0.5, sh, sp.frame, sp.w, sp.d, top - sh / 2, (rnd() * 4) | 0, 0.8);
      }
      if ((key === 'market' || key === 'circuit' || key === 'crash') && rnd() < 0.5)
        addDecal(tagGeos, 0.9 + rnd() * 0.7, 0.5 + rnd() * 0.4, sp.frame, sp.w, sp.d, 1.0 + rnd() * 1.4, (rnd() * 4) | 0, 0.7);
    }
    const ni = (g) => (g.index ? g.toNonIndexed() : g);
    if (rustGeos.length) scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(rustGeos.map(ni)), rustMat));
    if (grimeGeos.length) scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(grimeGeos.map(ni)), grimeMat));
    if (tagGeos.length) scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(tagGeos.map(ni)), tagMat));
  }

  // ════════════ 18 · SCREEN SHAKE — trauma² camera jitter ════════════
  let trauma = 0;
  const shake = (amt) => { trauma = Math.min(1, trauma + amt); };

  // ════════════ 19 · WEATHER — rain, lightning, storm cycle ════════════
  const flash = { value: 0 };
  let rainOn = false;

  // — rain: camera-following Points in a group whose -Y is local down —
  const RAIN_H = 26;
  const rainGrp = new THREE.Group();
  scene.add(rainGrp);
  const rainTime = { value: 0 };
  let rain;
  {
    const N = 1800, RR = 24;
    const pos = new Float32Array(N * 3), spd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * RR;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rnd() * RAIN_H;
      pos[i * 3 + 2] = Math.sin(a) * r;
      spd[i] = 20 + rnd() * 14;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: rainTime, uTex: { value: streakTex() }, uOpacity: { value: 0.5 } },
      vertexShader: `
        attribute float aSpeed;
        uniform float uTime;
        void main() {
          vec3 p = position;
          p.y = mod(position.y - uTime * aSpeed, ${RAIN_H.toFixed(1)});
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 60.0 / -mv.z;
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
    rain = new THREE.Points(g, mat);
    rain.frustumCulled = false;
    rain.visible = false;
    rainGrp.add(rain);
    updates.push((dt, t, playerPos) => {
      rainTime.value += dt;
      _v1.copy(playerPos).normalize();                       // local up
      rainGrp.quaternion.setFromUnitVectors(_Y, _v1);        // -Y → local down
      rainGrp.position.copy(playerPos).addScaledVector(_v1, 6 - RAIN_H / 2);
    });
  }

  // — STORM CLOUDS that roll in WITH the rain (the NEON CITY ceiling) —
  {
    const cloudGrp = new THREE.Group();
    scene.add(cloudGrp);
    // lighter storm-grey so the deck reads against sky AND at night (Ben:
    // "I don't see clouds when it rains") — bigger, denser, lower ceiling
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0x59627f, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const cloudMat2 = new THREE.MeshBasicMaterial({ color: 0x6a5f82, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const puff = new THREE.SphereGeometry(1, 10, 7);
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2, r = 3 + rnd() * 34;
      const m = new THREE.Mesh(puff, rnd() < 0.5 ? cloudMat : cloudMat2);
      const s = 7 + rnd() * 11;
      m.scale.set(s, s * 0.4, s);
      m.position.set(Math.cos(a) * r, 15 + rnd() * 7, Math.sin(a) * r);
      m.frustumCulled = false;
      cloudGrp.add(m);
    }
    let cloudOp = 0;
    updates.push((dt, t, playerPos) => {
      _v1.copy(playerPos).normalize();
      cloudGrp.quaternion.setFromUnitVectors(_Y, _v1);
      cloudGrp.position.copy(playerPos);
      const target = rainOn ? 0.92 : 0;                       // fade in with the storm
      cloudOp += (target - cloudOp) * (1 - Math.pow(0.2, dt));
      cloudMat.opacity = cloudOp;
      cloudMat2.opacity = cloudOp * 0.9;
      // lightning underlights the cloud deck
      if (flash.value > 0.01) { cloudMat.opacity = Math.min(1, cloudOp + flash.value * 0.5); }
    });
  }

  // — forked lightning above the player's tangent plane —
  {
    const boltMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 2.3, 2.6), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const SEG = 12;
    const segGeo = new THREE.CylinderGeometry(0.28, 0.05, 1, 5);
    const segs = [];
    for (let i = 0; i < SEG; i++) {
      const m = new THREE.Mesh(segGeo, boltMat);
      m.visible = false; m.frustumCulled = false;
      scene.add(m);
      segs.push(m);
    }
    const placeSeg = (m, a, b) => {
      _v3.subVectors(b, a);
      const len = _v3.length();
      if (len < 0.001) { m.visible = false; return; }
      _v3.divideScalar(len);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(_Y, _v3);
      m.scale.set(1, len, 1);
      m.visible = true;
    };
    const _a = new THREE.Vector3(), _b = new THREE.Vector3();
    function strike(playerPos) {
      for (const m of segs) m.visible = false;
      const up = _v1.copy(playerPos).normalize();
      _v2.set(-up.z, 0, up.x);
      if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0);
      const east = _v2.normalize(), north = _v4.crossVectors(east, up).normalize();
      const pr = playerPos.length();
      let ex = (rnd() - 0.5) * 70, nz = (rnd() - 0.5) * 70;
      let rad = pr + 42;
      const trunk = 8;
      let si = 0;
      _a.copy(up).multiplyScalar(rad).addScaledVector(east, ex).addScaledVector(north, nz);
      for (let i = 1; i <= trunk && si < SEG; i++) {
        ex += (rnd() - 0.5) * 8; nz += (rnd() - 0.5) * 8;
        rad = pr + 42 - (i / trunk) * 46;
        _b.copy(up).multiplyScalar(rad).addScaledVector(east, ex).addScaledVector(north, nz);
        placeSeg(segs[si++], _a, _b);
        _a.copy(_b);
      }
      // one branch off the mid-trunk
      ex += (rnd() - 0.5) * 6; nz += (rnd() - 0.5) * 6;
      _a.copy(up).multiplyScalar(pr + 42 - 0.45 * 46).addScaledVector(east, ex).addScaledVector(north, nz);
      for (let j = 0; j < 3 && si < SEG; j++) {
        ex += (rnd() - 0.5) * 12; nz += (rnd() - 0.5) * 12;
        _b.copy(up).multiplyScalar(_a.length() - 6 - rnd() * 5).addScaledVector(east, ex).addScaledVector(north, nz);
        placeSeg(segs[si++], _a, _b);
        _a.copy(_b);
      }
    }
    let next = 4 + rnd() * 5, flashT = 0;
    updates.push((dt, t, playerPos) => {
      if (flashT > 0) {
        flashT -= dt;
        const k = Math.max(0, flashT) * 6;
        const burst = (Math.sin(flashT * 42) > -0.2 ? 1 : 0.25) * Math.min(1, k);
        boltMat.opacity = burst * 0.9;
        flash.value = burst;
        if (flashT <= 0) {
          boltMat.opacity = 0;
          flash.value = 0;
          for (const m of segs) m.visible = false;
        }
      } else {
        next -= dt;
        if (next <= 0 && rainOn) {
          strike(playerPos);
          flashT = 0.34;
          next = (rnd() < 0.4 ? 0.14 : 3) + rnd() * 7;   // occasional double-strikes
          setTimeout(() => audio.sfx('thunder'), 500 + Math.random() * 1600);
          shake(0.3);
        }
      }
    });
  }

  // — weather cycle: clear ↔ storm, rain ~35% of the time —
  {
    let wxT = 45 + rnd() * 45;   // first front rolls in after ~a minute
    updates.push((dt) => {
      wxT -= dt;
      if (wxT > 0) return;
      rainOn = !rainOn;
      wxT = rainOn ? 50 + rnd() * 40 : 95 + rnd() * 80;
      rain.visible = rainOn;
      if (audio.setRain) audio.setRain(rainOn);
      hud.toast(
        rainOn ? 'STORM FRONT' : 'SKIES CLEARING',
        rainOn ? 'Ion rain over the sector — mind the lightning' : 'Volkaris weather grid');
    });
  }

  // — shake applier: LAST in the update list, and details.update runs
  // after player.update in main, so the camera pose is already set for
  // this frame; jitter along the camera's own right/up axes decays out —
  updates.push((dt, t, playerPos, camera) => {
    trauma = Math.max(0, trauma - dt * 1.6);
    if (trauma <= 0.001 || !camera) return;
    const s = trauma * trauma;
    _v1.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _v2.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(_v1, (Math.random() - 0.5) * s * 0.3)
                   .addScaledVector(_v2, (Math.random() - 0.5) * s * 0.24);
    _q1.setFromAxisAngle(_AXZ, (Math.random() - 0.5) * s * 0.02);
    camera.quaternion.multiply(_q1);
  });

  // ════════════ API ════════════
  return {
    update(dt, t, playerPos, camera) {
      for (const fn of updates) fn(dt, t, playerPos, camera);
    },
    flash,                       // {value: 0..1} lightning flash level
    raining: () => rainOn,
    setRain: (v) => { rainOn = !!v; rain.visible = rainOn; if (audio.setRain) audio.setRain(rainOn); },
    shake,                       // shake(amount 0..1) — melee hits, explosions
    colliders: propColliders,    // register via planet.addColliders
  };
}
