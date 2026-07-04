// ════════════════════════════════════════════════════════════════
// VOLKARIS — transit: the ORBITAL LOOP monorail network + vehicles
// (the NEON CITY monorail & AV concepts, bent around a sphere)
//
//   · THREE monorail lines weave curved paths around the whole
//     planet at different altitude bands — layered city, crossing
//     over and under each other without ever colliding:
//       AZURE LOOP        cyan    equator corridor, alt +11..+19
//       MAGENTA SKYLINE   magenta southern high line, alt +14..+25
//       AMBER UNDERGROUND amber   low weave, alt +8..+13 — bores
//                         THROUGH Mt. Kessler, threads gateway
//                         buildings, and skims the lake shore
//     Wherever a line dips below the terrain it runs in a TUNNEL
//     (dark bore, glow rings, portal hoops at the mouths).
//   · Riders stand INSIDE the hollow glass cars — board with E at
//     a station (or beside any dwelling car) and look around
//     freely while the world curves past.
//   · Ambient air traffic streams along tilted orbit lanes; ground
//     speeders run the street chains; pilotable AVs + a speeder.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { C, NEON, NEON_LIST, mulberry32, pick, clamp, lerp, sphDir, tangentFrame, makeCanvas, canvasTexture } from './config.js';

const R = C.R;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _YUP = new THREE.Vector3(0, 1, 0);
const _pdX = new THREE.Vector3(1, 0, 0), _pdnX = new THREE.Vector3(-1, 0, 0);
const _pdZ = new THREE.Vector3(0, 0, 1), _pdnZ = new THREE.Vector3(0, 0, -1);

// [lat, lon, altitude] control knots — closed weaving curves.
// Altitude bands are disjoint enough at every crossing that the
// lines layer instead of colliding (audited at build).
const LINE_DEFS = [
  {
    key: 'AZURE LOOP', hex: NEON.cyan,
    ctrl: [
      [8, 52, 12], [0, 78, 16], [-6, 108, 11], [6, 128, 18], [16, 150, 12],
      [8, 180, 15], [-4, 212, 11], [10, 246, 15], [6, 274, 19], [16, 304, 13],
      [20, 334, 12], [14, 6, 12], [12, 30, 15],
    ],
    stops: ['market', 'circuit', 'ruins'],
  },
  {
    key: 'MAGENTA SKYLINE', hex: NEON.magenta,
    ctrl: [
      [38, 162, 18], [22, 186, 23], [0, 202, 25], [-22, 218, 17], [-40, 252, 21],
      [-42, 288, 15], [-28, 312, 20], [-6, 330, 24], [14, 340, 21], [37, 330, 21],
      [44, 288, 22], [54, 248, 25], [50, 206, 20],
    ],
    stops: ['downtown', 'pyramid', 'port'],
  },
  {
    key: 'AMBER UNDERGROUND', hex: NEON.amber,
    ctrl: [
      [2, 0, 9], [12, 12, 8], [22, 25, 9], [28, 42, 8], [20, 64, 12],
      [24, 90, 6.5], [20, 116, 11], [20, 138, 8], [30, 152, 12], [40, 176, 9],
      [28, 202, 13], [2, 224, 8], [-12, 252, 12], [-20, 272, 9], [-12, 300, 11],
      [-2, 328, 9], [0, 352, 11],
    ],
    stops: ['crash', 'dunes'],
  },
];

export function buildTransit(scene, planet, audio) {
  const rnd = mulberry32(C.SEED + 311);
  const stations = [];        // flat, across lines (demo + HUD friendly)
  const lines = [];
  const lifts = [];           // station access lifts (carry the player up)
  // merge an array of geometries into one positions-only BufferGeometry
  function mergePos(geos) {
    let vtx = 0;
    const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
    for (const g of parts) vtx += g.attributes.position.count;
    const pos = new Float32Array(vtx * 3);
    let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array, o * 3); o += g.attributes.position.count; }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return merged;
  }
  const gatewayGroup = new THREE.Group();
  const platGroup = new THREE.Group();
  const platMat = new THREE.MeshStandardMaterial({ color: 0x241e4e, roughness: 0.6, metalness: 0.4 });

  // ════════════ LINES: curve, rail, tunnels, pylons ════════════
  for (const def of LINE_DEFS) {
    const pts = def.ctrl.map(([la, lo, al]) => sphDir(la, lo).multiplyScalar(R + al));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.6);
    const length = curve.getLength();
    const line = { ...def, curve, length, cars: [], stations: [] };

    // sample once for tunnels/pylons
    const NS = 480;
    const samples = [];
    const _pd = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
                 new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
                 new THREE.Vector3(0.7, 0, 0.7), new THREE.Vector3(-0.7, 0, -0.7)];
    for (let i = 0; i < NS; i++) {
      const p = curve.getPointAt(i / NS);
      const d = p.clone().normalize();
      const ter = planet.terrainHeight(d);
      const clear = p.length() - ter;
      const under = p.length() < ter + 0.9;
      // BUILDING clip: the rail point sits inside/grazing a solid box
      // (not terrain) → it needs a cave bored through the building
      let blocked = false;
      if (!under && clear > 0.5 && clear < 17) {
        let hits = 0;
        for (const dd of _pd) if (planet.probe(p, dd, 1.7)) hits++;
        blocked = hits >= 4;
      }
      samples.push({ t: i / NS, p, d, under, blocked, clear });
    }

    // rail tube + glow
    const railGeo = new THREE.TubeGeometry(curve, 360, 0.22, 6, true);
    const rail = new THREE.Mesh(railGeo,
      new THREE.MeshStandardMaterial({ color: 0x2a2452, roughness: 0.4, metalness: 0.7 }));
    scene.add(rail);
    const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 360, 0.07, 4, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(def.hex).multiplyScalar(1.1), toneMapped: false }));
    glow.scale.setScalar(1.001);
    scene.add(glow);

    // ── tunnels: contiguous under-terrain spans get a bored tube ──
    {
      const spans = [];
      let s0 = -1;
      for (let i = 0; i <= NS; i++) {
        // bore a tunnel through terrain OR through a clipped building
        const under = i < NS ? (samples[i].under || samples[i].blocked) : false;
        if (under && s0 < 0) s0 = i;
        if (!under && s0 >= 0) { spans.push([Math.max(0, s0 - 2), Math.min(NS - 1, i + 1)]); s0 = -1; }
      }
      const ringGeos = [];
      const mouthDark = [];
      for (const [a, b] of spans) {
        if (b - a < 2) continue;
        // the straddle car rides ABOVE the rail (roof ≈ rail+2.9), so the
        // bore is offset OUTWARD to centre on the car body and given a
        // wide radius — the car never clips the tunnel on any line
        const boreR = 3.6, boreLift = 1.3;
        const sub = [];
        for (let i = a; i <= b; i++) sub.push(samples[i].p.clone().addScaledVector(samples[i].d, boreLift));
        const subCurve = new THREE.CatmullRomCurve3(sub, false, 'centripetal');
        const bore = new THREE.Mesh(
          new THREE.TubeGeometry(subCurve, Math.max(8, (b - a)), boreR, 14, false),
          new THREE.MeshStandardMaterial({ color: 0x120c26, roughness: 0.95, metalness: 0.05, side: THREE.BackSide }));
        scene.add(bore);
        const subLen = subCurve.getLength();
        const nRings = Math.max(2, Math.floor(subLen / 7));
        for (let r2 = 0; r2 <= nRings; r2++) {
          const tt = r2 / nRings;
          const p = subCurve.getPointAt(tt);
          const tang = subCurve.getTangentAt(tt);
          const mouth = r2 === 0 || r2 === nRings;
          const g = new THREE.TorusGeometry(mouth ? boreR + 0.5 : boreR - 0.4, mouth ? 0.3 : 0.08, 6, 24);
          const m4 = new THREE.Matrix4().lookAt(new THREE.Vector3(), tang, p.clone().normalize());
          m4.setPosition(p);
          g.applyMatrix4(m4);
          ringGeos.push(g);
          // a recessed dark CAVE-MOUTH set into the mountainside so the
          // entrance reads as a real, generous opening
          if (mouth) {
            const md = new THREE.CylinderGeometry(boreR + 0.3, boreR + 0.3, 3.6, 18, 1, true);
            md.rotateX(Math.PI / 2);
            const mm = new THREE.Matrix4().lookAt(new THREE.Vector3(), tang, p.clone().normalize());
            mm.setPosition(p.clone().addScaledVector(tang, r2 === 0 ? 1.6 : -1.6));
            md.applyMatrix4(mm);
            mouthDark.push(md);
          }
        }
      }
      if (mouthDark.length) {
        const merged = mergePos(mouthDark);
        const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
          color: 0x0a0618, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
        scene.add(m);
      }
      if (ringGeos.length) {
        let vtx = 0;
        const parts = ringGeos.map(g => g.toNonIndexed());
        for (const g of parts) vtx += g.attributes.position.count;
        const pos = new Float32Array(vtx * 3);
        let o = 0;
        for (const g of parts) { pos.set(g.attributes.position.array, o * 3); o += g.attributes.position.count; }
        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const rings = new THREE.Mesh(merged,
          new THREE.MeshBasicMaterial({ color: new THREE.Color(def.hex).multiplyScalar(0.9), toneMapped: false, wireframe: false }));
        scene.add(rings);
      }
    }

    // ── support pylons where the rail flies clear of the deck ──
    {
      const pylons = [];
      for (let i = 0; i < NS; i += 16) {
        const s = samples[i];
        if (s.under || s.blocked || s.clear < 2.5 || s.clear > 26) continue;
        const len = s.clear;
        const g = new THREE.CylinderGeometry(0.22, 0.38, len, 6);
        g.translate(0, len / 2, 0);
        const { up, east, north } = tangentFrame(s.d);
        const f = new THREE.Matrix4().makeBasis(east, up, north)
          .setPosition(up.clone().multiplyScalar(s.p.length() - len - 0.2 + len));
        // base sits on terrain: position pylon base at terrain height
        f.setPosition(up.clone().multiplyScalar(planet.terrainHeight(s.d) - 0.3));
        g.applyMatrix4(f);
        pylons.push(g);
      }
      if (pylons.length) {
        let vtx = 0;
        const parts = pylons.map(g => g.toNonIndexed());
        for (const g of parts) vtx += g.attributes.position.count;
        const pos = new Float32Array(vtx * 3), nor = new Float32Array(vtx * 3);
        let o = 0;
        for (const g of parts) {
          pos.set(g.attributes.position.array, o * 3);
          nor.set(g.attributes.normal.array, o * 3);
          o += g.attributes.position.count;
        }
        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        const mesh = new THREE.Mesh(merged,
          new THREE.MeshStandardMaterial({ color: 0x241e46, roughness: 0.5, metalness: 0.5 }));
        mesh.castShadow = true;
        scene.add(mesh);
      }
    }

    line.samples = samples;
    lines.push(line);
  }

  // ── build-time audit: the lines must layer, never collide ──
  {
    for (let a = 0; a < lines.length; a++) {
      for (let b = a + 1; b < lines.length; b++) {
        let minD = 1e9;
        for (let i = 0; i < 160; i++) {
          const pa = lines[a].curve.getPointAt(i / 160);
          for (let j2 = 0; j2 < 160; j2++) {
            const d = pa.distanceToSquared(lines[b].curve.getPointAt(j2 / 160));
            if (d < minD) minD = d;
          }
        }
        if (Math.sqrt(minD) < 3.4) {
          console.warn(`[TRANSIT] lines ${lines[a].key} and ${lines[b].key} pass within ${Math.sqrt(minD).toFixed(1)}u`);
        }
      }
    }
  }

  // ── gateway buildings: the AMBER line passes straight THROUGH ──
  {
    const amber = lines[2];
    const cands = amber.samples.filter(s => !s.under && s.clear > 2.6 && s.clear < 7.5);
    const picksN = Math.min(3, cands.length);
    for (let k = 0; k < picksN; k++) {
      const s = cands[Math.floor((k + 0.35) * cands.length / picksN)];
      const tang = amber.curve.getTangentAt(s.t);
      const up = s.d.clone();
      const side = new THREE.Vector3().crossVectors(tang, up).normalize();
      const ter = planet.terrainHeight(s.d);
      const railH = s.p.length();
      const towerH = railH - ter + 6.5;
      const gwMat = new THREE.MeshStandardMaterial({ color: pick(rnd, [0x2c2152, 0x1f2a4e, 0x3a2148]), roughness: 0.55, metalness: 0.5 });
      // WIDE opening: pillars pushed out so the straddle car clears with
      // room; the passage reads as a tunnel through the building
      const SIDE = 5.6;                       // pillar centre offset
      for (const sd of [-1, 1]) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(4.6, towerH, 5.2), gwMat);
        const fm = new THREE.Matrix4().makeBasis(tang, up.clone(), side)
          .setPosition(up.clone().multiplyScalar(ter + towerH / 2 - 0.3).addScaledVector(side, sd * SIDE));
        tower.applyMatrix4(fm);
        tower.castShadow = tower.receiveShadow = true;
        gatewayGroup.add(tower);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.4, 0.14),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(pick(rnd, NEON_LIST)).multiplyScalar(1.1), toneMapped: false }));
        strip.applyMatrix4(new THREE.Matrix4().makeTranslation(0, towerH * 0.22, 2.66).premultiply(fm));
        gatewayGroup.add(strip);
      }
      // lintel raised so it clears the lifted straddle car (roof ≈ rail+3)
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.6, 2 * SIDE + 4.6), gwMat);
      const lm = new THREE.Matrix4().makeBasis(tang, up.clone(), side)
        .setPosition(up.clone().multiplyScalar(railH + 6.6));
      lintel.applyMatrix4(lm);
      lintel.castShadow = true;
      gatewayGroup.add(lintel);
      // glowing PORTAL FRAMES front & back — the tunnel mouths
      for (const fz of [-2.6, 2.6]) {
        const pf = new THREE.Matrix4().makeBasis(tang, up.clone(), side)
          .setPosition(up.clone().multiplyScalar(railH + 1.6).addScaledVector(tang, fz));
        // top bar
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 2 * SIDE),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.amber).multiplyScalar(1.25), toneMapped: false }));
        top.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 3.1, 0).premultiply(pf));
        gatewayGroup.add(top);
        for (const gs of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.6, 0.28),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.amber).multiplyScalar(1.1), toneMapped: false }));
          post.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.3, gs * (SIDE - 2.0)).premultiply(pf));
          gatewayGroup.add(post);
        }
      }
    }
    scene.add(gatewayGroup);
    planet.addColliders(gatewayGroup);
  }

  // ════════════ STATIONS (per line, on the curve) ════════════
  function nearestT(curve, dir) {
    let bt = 0, bd = 1e9;
    for (let i = 0; i < 400; i++) {
      const t = i / 400;
      const d = curve.getPointAt(t).normalize().distanceToSquared(dir);
      if (d < bd) { bd = d; bt = t; }
    }
    return bt;
  }

  for (const line of lines) {
    for (const stopKey of line.stops) {
      const d = planet.districts.find(x => x.key === stopKey);
      if (!d) continue;
      const t = nearestT(line.curve, d.dir);
      const pt = line.curve.getPointAt(t);
      const tang = line.curve.getTangentAt(t);
      const stDir = pt.clone().normalize();
      const up = stDir.clone();
      const side = new THREE.Vector3().crossVectors(tang, up).normalize();
      // platform sits level with the straddle car's floor (rail + CAR_LIFT
      // - ~1), so you step straight across instead of popping up, and the
      // canopy rides higher above the raised car
      const platH = pt.length() + 0.35;
      const st = { key: stopKey, name: `${d.name} · ${line.key}`, line, t, dir: stDir };

      const fm = new THREE.Matrix4().makeBasis(tang, up.clone(), side)
        .setPosition(up.clone().multiplyScalar(platH).addScaledVector(side, 2.2));
      const plat = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 3.6), platMat);
      plat.applyMatrix4(fm);
      plat.castShadow = plat.receiveShadow = true;
      platGroup.add(plat);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 0.16),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.amber).multiplyScalar(1.2), toneMapped: false }));
      strip.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.34, -1.6).premultiply(fm));
      platGroup.add(strip);
      st.platformPos = new THREE.Vector3().setFromMatrixPosition(fm).addScaledVector(up, 0.6);
      st.boardPos = st.platformPos.clone();

      // canopy + name bar + beacon in the line's color
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 3.4), platMat);
      canopy.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 3.6, 0).premultiply(fm));
      platGroup.add(canopy);
      for (const px of [-4, 4]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.6, 0.22), platMat);
        post.applyMatrix4(new THREE.Matrix4().makeTranslation(px, 1.9, 1.3).premultiply(fm));
        platGroup.add(post);
      }
      const nameBar = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.5, 0.14),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(line.hex).multiplyScalar(1.15), toneMapped: false }));
      nameBar.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 3.1, 1.7).premultiply(fm));
      platGroup.add(nameBar);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 5), platMat);
      mast.applyMatrix4(new THREE.Matrix4().makeTranslation(5.6, 3, 1.4).premultiply(fm));
      platGroup.add(mast);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(line.hex).multiplyScalar(1.3), toneMapped: false }));
      beacon.applyMatrix4(new THREE.Matrix4().makeTranslation(5.6, 6.2, 1.4).premultiply(fm));
      platGroup.add(beacon);

      // live ETA holo board
      const [cv, ctx] = makeCanvas(512, 128);
      const tex = canvasTexture(cv);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
      board.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 2.5, 1.78).premultiply(fm));
      platGroup.add(board);
      st.eta = { cv, ctx, tex };

      // ── access RAMP (reliable backup) — the original segmented ramp,
      // always walkable up to the deck ──
      const groundH = planet.terrainHeight(stDir);
      const rise = platH - groundH;
      if (rise > 1.5) {
        const grade = 0.42;
        const run = rise / grade;
        const segs = Math.max(3, Math.ceil(run / 4));
        const segRun = run / segs, segRise = rise / segs;
        const segLen = Math.hypot(segRun, segRise) + 0.6;
        const pitch = Math.atan2(segRise, segRun);
        for (let i = 0; i <= segs; i++) {
          const tOff = (6 + (i + 0.5) * segRun) / line.length;
          const p2 = line.curve.getPointAt((t + tOff) % 1);
          const su = p2.clone().normalize();
          const stang = line.curve.getTangentAt((t + tOff) % 1);
          const sside = new THREE.Vector3().crossVectors(stang, su).normalize();
          const h = platH - (i + 0.5) * segRise;
          const seg = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.5, 2.6), platMat);
          seg.receiveShadow = true;
          const sm = new THREE.Matrix4().makeBasis(stang, su.clone(), sside)
            .setPosition(su.clone().multiplyScalar(h).addScaledVector(sside, 2.2));
          seg.applyMatrix4(new THREE.Matrix4().makeRotationZ(-pitch).premultiply(sm));
          platGroup.add(seg);
          const rail2 = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.07, 0.07),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.amber).multiplyScalar(1.1), toneMapped: false }));
          rail2.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1.0, 1.25).premultiply(
            new THREE.Matrix4().makeRotationZ(-pitch).premultiply(sm)));
          platGroup.add(rail2);
        }
        const aFoot = (6 + run) / line.length;
        const dF = line.curve.getPointAt((t + aFoot) % 1).normalize();
        const tangF = line.curve.getTangentAt((t + aFoot) % 1);
        const sF = new THREE.Vector3().crossVectors(tangF, dF).normalize();
        st.rampFoot = dF.clone().multiplyScalar(planet.terrainHeight(dF) + 0.4).addScaledVector(sF, 2.2);
        st.rampTop = st.boardPos.clone();
      }

      // ── access LIFT (scenic alternative): a glowing platform that
      // rises from the street to the deck. Step on and it carries you. ──
      {
        // lift column just off the platform edge — but not INSIDE a
        // building/pyramid. Try both sides; pick the clear one, else skip.
        const colClear = (dir) => {
          const mid = dir.clone().multiplyScalar((planet.terrainHeight(dir) + platH) / 2);
          let hits = 0;
          for (const dd of [_pdX, _pdnX, _pdZ, _pdnZ]) if (planet.probe(mid, dd, 3.0)) hits++;
          return hits < 3;
        };
        let liftDir = up.clone().multiplyScalar(platH).addScaledVector(side, 5.2).normalize();
        let skipLift = false;
        if (!colClear(liftDir)) {
          const other = up.clone().multiplyScalar(platH).addScaledVector(side, -5.2).normalize();
          if (colClear(other)) liftDir = other;
          else skipLift = true;    // both sides blocked (deep in a structure) → ramp only
        }
        const groundR = planet.terrainHeight(liftDir);
        const deckR = platH + 0.15;
        if (!skipLift && deckR - groundR > 1.5) {
          // twin glowing guide rails (full travel height)
          for (const gs of [-1, 1]) {
            const railLen = deckR - groundR + 0.5;
            const rg = new THREE.CylinderGeometry(0.1, 0.1, railLen, 6);
            rg.translate(0, 0, 0);
            const { up: lu, east: le, north: ln } = tangentFrame(liftDir);
            const rm = new THREE.Matrix4().makeBasis(le, lu, ln)
              .setPosition(liftDir.clone().multiplyScalar((groundR + deckR) / 2).addScaledVector(le, gs * 1.7));
            const rail = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
              color: new THREE.Color(line.hex).multiplyScalar(1.05), toneMapped: false }));
            rail.applyMatrix4(rm);
            platGroup.add(rail);   // rails are static — safe to bake
          }
          // the moving disc (NOT baked into the BVH — it carries you).
          // Bigger pad + it dips FLUSH to the street so you just walk on.
          const disc = new THREE.Group();
          const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.3, 18),
            new THREE.MeshStandardMaterial({ color: 0x2a2452, roughness: 0.5, metalness: 0.6 }));
          disc.add(deck);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.1, 6, 22),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(line.hex).multiplyScalar(1.2), toneMapped: false }));
          ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
          disc.add(ring);
          scene.add(disc);
          const { up: lu } = tangentFrame(liftDir);
          lifts.push({
            disc, dir: liftDir, up: lu.clone(),
            lo: groundR - 0.15, hi: deckR + 0.1,   // dips flush to the ground
            r: groundR - 0.15, dirn: 1, speed: 3.0, dwell: 0,
            botDwell: 4.5,                          // long wait at the bottom to step on
            prev: new THREE.Vector3(),
          });
          // lift base (the demo keeps using the ramp's rampFoot)
          st.liftBase = liftDir.clone().multiplyScalar(groundR + 0.4);
        }
      }
      // a guaranteed GROUND boarding point at the foot of the ramp: press
      // E anywhere near here while the train dwells and you're aboard
      st.groundBoard = (st.rampFoot ?? st.liftBase ?? st.boardPos).clone();

      line.stations.push(st);
      stations.push(st);
    }
    line.stations.sort((a, b) => a.t - b.t);
  }
  scene.add(platGroup);
  planet.addColliders(platGroup);

  // ════════════ TRAINS: one per line, hollow glass cars ════════════
  // The car rides ABOVE the beam (straddle-monorail): the whole body is
  // lifted by CAR_LIFT so the glowing rail runs UNDER the floor instead
  // of through the standing rider's chest. Struts + skid drop to the rail.
  const CAR_LIFT = 1.5;
  // SPACE-AGE PILL: a sleek capsule hull (rounded nose & tail) in tinted
  // glass so you see the rider inside and out, on an opaque floor, riding
  // the beam on bogie struts.
  function buildCar(hex, lead) {
    const car = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x35306a, roughness: 0.3, metalness: 0.75 });
    // the pill hull — a capsule laid along the travel axis (Z)
    const hull = new THREE.Mesh(
      new THREE.CapsuleGeometry(1.35, 3.2, 8, 24),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex).multiplyScalar(0.55), metalness: 0.55, roughness: 0.22,
        transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false,
      }));
    hull.rotation.x = Math.PI / 2;
    hull.castShadow = true;
    car.add(hull);
    // bright chrome nose & tail caps for the sleek look
    for (const zz of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.34, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x9fb4dd, metalness: 0.85, roughness: 0.18 }));
      cap.rotation.x = zz > 0 ? -Math.PI / 2 : Math.PI / 2;
      cap.position.z = zz * 2.55;
      car.add(cap);
    }
    // glowing accent lines running the length of the pill
    for (const sy of [-0.9, 0.9]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 4.4),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.25), toneMapped: false }));
      stripe.position.set(sy, 0.0, 0);
      car.add(stripe);
    }
    // opaque floor + benches you stand/sit on
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 4.8),
      new THREE.MeshStandardMaterial({ color: 0x241e46, roughness: 0.6, metalness: 0.4 }));
    floor.position.y = -1.02;
    floor.castShadow = true;
    car.add(floor);
    for (const s of [-1, 1]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 4.0), bodyMat);
      bench.position.set(s * 0.82, -0.66, 0);
      car.add(bench);
    }
    // bogie struts down to the rail beam
    for (const bz of [-1.8, 1.8]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.45, CAR_LIFT + 0.4, 0.45), bodyMat);
      strut.position.set(0, -1.12 - (CAR_LIFT + 0.4) / 2 + 0.1, bz);
      car.add(strut);
    }
    // head / tail lamps
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(lead ? NEON.amber : hex).multiplyScalar(1.4), toneMapped: false }));
    head.position.set(0, 0.1, 3.7);
    car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2e4d).multiplyScalar(1.2), toneMapped: false }));
    tail.position.set(0, 0.1, -3.5);
    car.add(tail);
    // glowing skid straddling the rail beam
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 5.0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.15), toneMapped: false }));
    skid.position.y = -CAR_LIFT;
    car.add(skid);
    return car;
  }

  for (const line of lines) {
    for (let i = 0; i < 3; i++) {
      const car = buildCar(line.hex, i === 0);
      scene.add(car);
      line.cars.push(car);
    }
    line.train = {
      t: line.stations[0]?.t ?? 0,
      speed: 0,
      cruise: 24 / line.length,     // u/s → curve-parameter/s
      state: 'dwell',
      dwellT: 5 + rnd() * 6,
      nextIdx: 1 % Math.max(1, line.stations.length),
    };
  }

  const CAR_GAP_U = 6.6;   // meters between car centers
  function placeCar(line, car, t) {
    const tt = ((t % 1) + 1) % 1;
    const p = line.curve.getPointAt(tt);
    const tang = line.curve.getTangentAt(tt);
    const up = _v.copy(p).normalize();
    // RIGHT-handed: X = up×tang, Y = up, Z = tang (nose leads)
    const side = _v2.crossVectors(up, tang).normalize();
    _m.makeBasis(side, up, tang);
    // ride above the beam so the rail runs under the floor, not through the rider
    car.position.copy(p).addScaledVector(up, CAR_LIFT);
    car.quaternion.setFromRotationMatrix(_m);
  }

  // ── rider wiring (which line the player boarded) ──
  let riderLine = null;

  // ════════════ AMBIENT AIR TRAFFIC ════════════
  const airCraft = [];
  {
    const geoBody = new THREE.BoxGeometry(0.7, 0.35, 2.0);
    for (let i = 0; i < 10; i++) {
      const grp = new THREE.Group();
      const b = new THREE.Mesh(geoBody, new THREE.MeshStandardMaterial({
        color: pick(rnd, [0x3a3560, 0x4a3050, 0x2a4060]), roughness: 0.4, metalness: 0.7,
      }));
      grp.add(b);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.3),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(pick(rnd, NEON_LIST)).multiplyScalar(1.25), toneMapped: false }));
      tail.position.z = -1.1;
      grp.add(tail);
      scene.add(grp);
      const nrm = sphDir(rnd() * 120 - 60, rnd() * 360);
      const uu = new THREE.Vector3(1, 0, 0).cross(nrm).normalize();
      if (uu.lengthSq() < 0.1) uu.set(0, 0, 1);
      airCraft.push({
        grp, nrm, u: uu, w: new THREE.Vector3().crossVectors(nrm, uu).normalize(),
        r: R + 26 + rnd() * 9, a: rnd() * Math.PI * 2,
        sp: (0.05 + rnd() * 0.05) * (rnd() < 0.5 ? 1 : -1),
      });
    }
  }

  // ════════════ PILOTABLE VEHICLES ════════════
  function makeAV(hex) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x2e2a58, roughness: 0.35, metalness: 0.8 }));
    body.castShadow = true;
    grp.add(body);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.3),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.1), toneMapped: false, transparent: true, opacity: 0.85 }));
    canopy.position.set(0, 0.5, 0.4);
    grp.add(canopy);
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 1.4), body.material);
      fin.position.set(s * 1.1, -0.1, -0.6);
      fin.rotation.z = s * -0.16;
      grp.add(fin);
    }
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.orange).multiplyScalar(1.25), toneMapped: false }));
    engine.position.set(0, 0, -1.75);
    grp.add(engine);
    grp.userData.engine = engine;
    return grp;
  }
  const vehicles = [];
  function parkVehicle(kind, districtKey, latOff, lonOff, hex) {
    const d = planet.districts.find(x => x.key === districtKey);
    const dir = sphDir(d.lat + latOff, d.lon + lonOff);
    const grp = makeAV(hex);
    const { up, east, north } = tangentFrame(dir);
    const h = planet.terrainHeight(dir);
    _m.makeBasis(east, up, north).setPosition(up.clone().multiplyScalar(h + 0.7));
    grp.position.setFromMatrixPosition(_m);
    grp.quaternion.setFromRotationMatrix(_m);
    scene.add(grp);
    vehicles.push({ kind, grp, home: grp.position.clone(), occupied: false });
  }
  parkVehicle('av', 'market', -3, 6, NEON.cyan);
  parkVehicle('av', 'ruins', 4, -5, NEON.magenta);
  parkVehicle('speeder', 'dunes', 1.5, 5.5, NEON.amber);

  // ════════════ GROUND TRAFFIC (street chains) ════════════
  const groundCars = [];
  let carBodies = null, carGlows = null;
  {
    const chains = [...planet.pathChains].sort((a, b) => b.length - a.length).slice(0, 6);
    const N = 20;
    carBodies = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.05, 0.42, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x322a5e, roughness: 0.35, metalness: 0.8 }), N);
    carBodies.castShadow = true;
    carGlows = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.8, 0.1, 1.9),
      new THREE.MeshBasicMaterial({ toneMapped: false }), N);
    for (let i = 0; i < N; i++) {
      const chain = chains[i % chains.length];
      groundCars.push({
        chain,
        s: rnd() * (chain.length - 2),
        dirF: rnd() < 0.5 ? 1 : -1,
        speed: 2.2 + rnd() * 1.6,
      });
      carGlows.setColorAt(i, new THREE.Color(pick(rnd, NEON_LIST)).multiplyScalar(1.2));
    }
    if (carGlows.instanceColor) carGlows.instanceColor.needsUpdate = true;
    scene.add(carBodies);
    scene.add(carGlows);
  }
  const _gv = new THREE.Vector3(), _m2 = new THREE.Matrix4();
  function placeGroundCar(i, car) {
    const n2 = car.chain.length;
    const i0 = clamp(Math.floor(car.s), 0, n2 - 2);
    const f = car.s - i0;
    _v.lerpVectors(car.chain[i0], car.chain[i0 + 1], f).normalize();
    const ahead = car.chain[clamp(i0 + (car.dirF > 0 ? 1 : -1), 0, n2 - 1)];
    const up = _v3.copy(_v);
    const tang = _v2.copy(ahead).sub(_v);
    tang.addScaledVector(up, -tang.dot(up));
    if (tang.lengthSq() < 1e-8) tang.copy(up).cross(car.chain[0]);
    tang.normalize();
    const side = _gv.crossVectors(up, tang).normalize();
    const h = planet.terrainHeight(_v) + 0.5;
    _m.makeBasis(side, up, tang).setPosition(up.x * h, up.y * h, up.z * h);
    carBodies.setMatrixAt(i, _m);
    carGlows.setMatrixAt(i, _m2.makeTranslation(0, -0.28, 0).premultiply(_m));
  }

  // ════════════ ETA BOARDS ════════════
  let etaClock = 0;
  function drawETA() {
    for (const st of stations) {
      if (!st.eta) continue;
      const train = st.line.train;
      const { cv, ctx, tex } = st.eta;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = 'rgba(8,4,26,0.88)';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = 'rgba(0,246,255,0.7)';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, cv.width - 8, cv.height - 8);
      ctx.font = '700 44px "Share Tech Mono", monospace';
      ctx.textBaseline = 'middle';
      let msg, hue;
      const atSt = st.line.stations[(train.nextIdx + st.line.stations.length - 1) % st.line.stations.length];
      if (train.state === 'dwell' && atSt === st) {
        msg = `▶ BOARDING  :0${Math.max(0, Math.ceil(train.dwellT))}`.slice(0, 24);
        hue = '#5dffb2';
      } else {
        let raw = st.t - (train.t % 1);
        while (raw < 0) raw += 1;
        let stops = 0;
        for (const s2 of st.line.stations) {
          if (s2 === st) continue;
          let d2 = s2.t - (train.t % 1);
          while (d2 < 0) d2 += 1;
          if (d2 < raw) stops++;
        }
        const eta = raw / train.cruise + stops * 8 + (train.state === 'dwell' ? train.dwellT : 0);
        const mm = Math.floor(eta / 60), ss = Math.floor(eta % 60);
        msg = `NEXT LOOP  ${mm}:${ss < 10 ? '0' : ''}${ss}`;
        hue = '#00f6ff';
      }
      ctx.fillStyle = hue;
      ctx.shadowColor = hue; ctx.shadowBlur = 14;
      ctx.fillText(msg, 26, cv.height / 2);
      ctx.shadowBlur = 0;
      tex.needsUpdate = true;
    }
  }

  // ════════════ API ════════════
  return {
    stations, lines, vehicles,

    boardableStation(pos) {
      for (const line of lines) {
        if (line.train.state !== 'dwell' || !line.stations.length) continue;
        const st = line.stations[(line.train.nextIdx + line.stations.length - 1) % line.stations.length];
        if (pos.distanceTo(st.boardPos) < 7) return st;
        for (const c of line.cars) if (pos.distanceTo(c.position) < 4.5) return st;
        // guaranteed: press E anywhere near the station's GROUND base
        if (st.groundBoard && pos.distanceTo(st.groundBoard) < 9) return st;
      }
      return null;
    },
    setRider(st) { riderLine = st ? st.line : null; },
    ridingLineKey() { return riderLine ? riderLine.key : null; },
    riderNextStop() {
      if (!riderLine || !riderLine.stations.length) return null;
      const st = riderLine.stations[riderLine.train.nextIdx % riderLine.stations.length];
      return st ? st.name.split(' · ')[0] : null;
    },
    dwelling() { return riderLine ? riderLine.train.state === 'dwell' : false; },
    riderStation() {
      if (!riderLine) return null;
      return riderLine.stations[(riderLine.train.nextIdx + riderLine.stations.length - 1) % riderLine.stations.length];
    },
    carAnchor(out) {
      const line = riderLine ?? lines[0];
      const c = line.cars[1];
      // INSIDE the car: feet on the floor, not floating on the roof
      _v.copy(c.position).normalize();
      out.copy(c.position).addScaledVector(_v, -0.9);
      return out;
    },
    carForward(out) {
      const line = riderLine ?? lines[0];
      const tt = (((line.train.t - CAR_GAP_U / line.length) % 1) + 1) % 1;
      out.copy(line.curve.getTangentAt(tt));
      return out;
    },
    vehicleNear(pos) {
      for (const v of vehicles) {
        if (!v.occupied && pos.distanceTo(v.grp.position) < 4.2) return v;
      }
      return null;
    },

    update(dt, t, playerPos) {
      // ── per-line train state machines ──
      for (const line of lines) {
        const train = line.train;
        if (!line.stations.length) continue;
        if (train.state === 'dwell') {
          train.dwellT -= dt;
          train.speed = 0;
          if (train.dwellT <= 0) {
            train.state = 'run';
            if (playerPos && line.cars[1].position.distanceTo(playerPos) < 40) audio.sfx('doors');
          }
        } else {
          // stop so the CENTRE car (cars[1], where the rider stands) lands
          // at the station, not the lead car — train.t leads by one gap
          const gap = CAR_GAP_U / line.length;
          const target = (line.stations[train.nextIdx].t + gap) % 1;
          let delta = target - (train.t % 1);
          while (delta < 0) delta += 1;
          const easedMax = clamp(delta * 0.8 * (line.length / 24), 0.2, 1) * train.cruise;
          train.speed = lerp(train.speed, easedMax, dt * 1.4);
          train.t += train.speed * dt;
          if (delta < 0.004) {
            train.state = 'dwell';
            train.dwellT = 8;
            train.nextIdx = (train.nextIdx + 1) % line.stations.length;
            if (playerPos && line.cars[1].position.distanceTo(playerPos) < 40) audio.sfx('chime');
          }
        }
        for (let i = 0; i < line.cars.length; i++) {
          placeCar(line, line.cars[i], train.t - i * CAR_GAP_U / line.length);
        }
      }

      // ── ambient air traffic ──
      for (const a of airCraft) {
        a.a += a.sp * dt;
        const p = _v.copy(a.u).multiplyScalar(Math.cos(a.a)).addScaledVector(a.w, Math.sin(a.a)).normalize();
        const nxt = _v2.copy(a.u).multiplyScalar(Math.cos(a.a + 0.02 * Math.sign(a.sp)))
          .addScaledVector(a.w, Math.sin(a.a + 0.02 * Math.sign(a.sp))).normalize();
        a.grp.position.copy(p).multiplyScalar(a.r);
        _m.lookAt(a.grp.position, _v3.copy(nxt).multiplyScalar(a.r), p);
        a.grp.quaternion.setFromRotationMatrix(_m);
      }
      // engine shimmer on parked vehicles
      for (const v of vehicles) {
        if (!v.occupied) v.grp.userData.engine.material.opacity = 0.7 + Math.sin(t * 4 + v.home.x) * 0.2;
      }

      // ── ground traffic ──
      for (let i = 0; i < groundCars.length; i++) {
        const car = groundCars[i];
        car.s += car.speed * car.dirF * dt;
        if (car.s >= car.chain.length - 1.01) { car.s = car.chain.length - 1.01; car.dirF = -1; }
        if (car.s <= 0.01) { car.s = 0.01; car.dirF = 1; }
        placeGroundCar(i, car);
      }
      carBodies.instanceMatrix.needsUpdate = true;
      carGlows.instanceMatrix.needsUpdate = true;

      // ── station lifts: paternoster travel, disc position each frame ──
      for (const L of lifts) {
        L.prev.copy(L.disc.position);
        if (L.dwell > 0) { L.dwell -= dt; }
        else {
          L.r += L.dirn * L.speed * dt;
          if (L.r >= L.hi) { L.r = L.hi; L.dirn = -1; L.dwell = 2.5; }
          if (L.r <= L.lo) { L.r = L.lo; L.dirn = 1; L.dwell = L.botDwell ?? 3.5; }
        }
        L.disc.position.copy(L.dir).multiplyScalar(L.r);
        L.disc.quaternion.setFromUnitVectors(_YUP, L.up);
      }

      // ── ETA boards at ~3 Hz ──
      etaClock -= dt;
      if (etaClock <= 0) { etaClock = 0.34; drawETA(); }
    },

    lifts,
    // called from main each frame BEFORE player physics: if the player is
    // standing on a rising lift disc, carry them up with it
    carryRiders(playerState, dt) {
      if (playerState.mode !== 'walk') return;   // never tug a rider/pilot
      for (const L of lifts) {
        _v2.copy(playerState.pos).sub(L.disc.position);
        const along = _v2.dot(L.up);
        const horiz = _v3.copy(_v2).addScaledVector(L.up, -along).length();
        // generous catch (2.4 pad). Snap the player's feet ONTO the deck
        // surface so they stand on it (no floating), and ride its motion.
        if (horiz < 2.5 && along > -0.6 && along < 1.9) {
          playerState.pos.addScaledVector(L.up, 0.18 - along);   // stand on the deck top
          const vlift = L.dwell <= 0 ? L.dirn * L.speed : 0;
          const rv = playerState.vel.dot(L.up);
          playerState.vel.addScaledVector(L.up, vlift - rv);
          playerState.grounded = true;                           // it's solid footing
          playerState.onLift = 0.3;                              // suppress terrain snap
        }
      }
    },
  };
}
