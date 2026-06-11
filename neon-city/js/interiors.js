// ════════════════════════════════════════════════════════════════
// NEON CITY — enterable building interiors
// A handful of buildings per district open up: sliding-door entries,
// inward-facing shells, stacked floor slabs with stairwell + elevator
// voids, switchback stairs, a gated interior elevator (roof stop on
// short towers), and seeded per-floor layouts (open plan / room
// dividers) with props. Each interior's colliders + surfaces are
// scoped — the player only scans them while inside that building.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { C, NEON, mulberry32, clamp, hexCss, makeCanvas, canvasTexture } from './config.js';

const FLOOR_H = 3.6;

export function buildInteriors(scene, world) {
  const rnd = mulberry32(C.SEED + 4242);
  const H = C.HALF;

  // ── pick 2–3 candidates per district, biggest footprints first ──
  const byDistrict = {};
  for (const b of world.buildings) {
    if (b.hasRoofLift || b.arcade) continue;
    if (b.w < 17 || b.d < 17 || b.h < 13) continue;
    (byDistrict[b.dk] = byDistrict[b.dk] || []).push(b);
  }
  const chosen = [];
  for (const key of Object.keys(byDistrict)) {
    const list = byDistrict[key].sort((p, q) => (q.w * q.d) - (p.w * p.d));
    const n = key === 'CORE' ? 2 : (key === 'MARKET' || key === 'OLD' ? 3 : 2);
    // skip overlapping picks (same block twins)
    const taken = [];
    for (const b of list) {
      if (taken.length >= n) break;
      if (taken.some(t => Math.abs(t.x - b.x) < 40 && Math.abs(t.z - b.z) < 40)) continue;
      taken.push(b);
    }
    chosen.push(...taken);
  }

  for (const b of chosen) buildOne(b);
  return world.interiors;

  // ════════════════ one enterable building ════════════════
  function buildOne(b) {
    const D = b.D;
    const accent = new THREE.Color(D.accent);
    const F = clamp(Math.floor((b.h - 3) / FLOOR_H), 2, 8);   // upper floors
    const roofAccess = b.h <= F * FLOOR_H + 6;                 // short tower → lift reaches the roof

    // door faces the nearest road (closest block edge)
    const bxI = clamp(Math.floor((b.x + H) / C.CELL), 0, C.GRID - 1);
    const bzI = clamp(Math.floor((b.z + H) / C.CELL), 0, C.GRID - 1);
    const ex0 = -H + bxI * C.CELL + C.ROAD / 2, ez0 = -H + bzI * C.CELL + C.ROAD / 2;
    const dists = [
      { side: 'n', d: (b.z - b.d / 2) - ez0, dx: 0, dz: -1 },
      { side: 's', d: (ez0 + C.BLOCK) - (b.z + b.d / 2), dx: 0, dz: 1 },
      { side: 'w', d: (b.x - b.w / 2) - ex0, dx: -1, dz: 0 },
      { side: 'e', d: (ex0 + C.BLOCK) - (b.x + b.w / 2), dx: 1, dz: 0 },
    ].sort((p, q) => p.d - q.d);
    const door = dists[0];
    const doorPos = new THREE.Vector3(
      b.x + door.dx * b.w / 2,
      0,
      b.z + door.dz * b.d / 2
    );
    if (door.dx === 0) doorPos.x = clamp(doorPos.x, b.x - b.w / 2 + 4, b.x + b.w / 2 - 4);
    else doorPos.z = clamp(doorPos.z, b.z - b.d / 2 + 4, b.z + b.d / 2 - 4);

    // walls with a doorway gap (also gives the roof a parapet)
    const gapCenter = door.dx === 0 ? doorPos.x : doorPos.z;
    world.wallizeBuilding(b, { gaps: [{ side: door.side, center: gapCenter, width: 3.0 }] });

    const group = new THREE.Group();
    scene.add(group);
    const interior = {
      b, group,
      colliders: [], surfaces: [],
      bounds: { minX: b.x - b.w / 2 - 3, maxX: b.x + b.w / 2 + 3, minZ: b.z - b.d / 2 - 3, maxZ: b.z + b.d / 2 + 3 },
    };
    world.interiors.push(interior);

    // local → world helpers (interior local frame: door side = +z)
    // rotate local coords so the door is always on local +z
    const rot = door.side === 's' ? 0 : door.side === 'n' ? Math.PI : door.side === 'e' ? -Math.PI / 2 : Math.PI / 2;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const W = (door.dx === 0 ? b.w : b.d);   // local width (x)
    const Dep = (door.dx === 0 ? b.d : b.w); // local depth (z), door at +z
    const toWorld = (lx, lz) => ({
      x: b.x + lx * cosR + lz * sinR,
      z: b.z - lx * sinR + lz * cosR,
    });
    // local AABB → world AABB (axis-aligned for 90° rotations)
    const rectW = (lx0, lz0, lx1, lz1) => {
      const a = toWorld(lx0, lz0), c = toWorld(lx1, lz1);
      return {
        minX: Math.min(a.x, c.x), maxX: Math.max(a.x, c.x),
        minZ: Math.min(a.z, c.z), maxZ: Math.max(a.z, c.z),
      };
    };
    const doorLX = (door.dx === 0)
      ? (doorPos.x - b.x) * cosR   // door offset along local x
      : -(doorPos.z - b.z) * sinR;

    const solidGeos = [], glowGeos = [];
    const pushBox = (arr, lx, lz, y, sx, sy, sz) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      if (Math.abs(sinR) > 0.5) g.rotateY(rot);
      const p = toWorld(lx, lz);
      g.translate(p.x, y, p.z);
      arr.push(g);
    };

    // ── interior shell (walls/ceiling seen from inside) ──
    const interiorH = (roofAccess ? b.h : F * FLOOR_H + 3.4);
    {
      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(b.w - 0.35, interiorH, b.d - 0.35),
        new THREE.MeshStandardMaterial({
          color: 0x1a2233, roughness: 0.65, metalness: 0.25, side: THREE.BackSide,
          emissive: 0x13202f, emissiveIntensity: 1.0,
        })
      );
      shell.position.set(b.x, interiorH / 2 - 0.05, b.z);
      group.add(shell);
      world.raycastTargets.push(shell);
    }

    // ── door vestibule + sliding panel + gate ──
    {
      const vest = new THREE.Group();
      const frameMat = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.1), toneMapped: false });
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x222a3e, roughness: 0.4, metalness: 0.6 });
      const fwd = { x: door.dx, z: door.dz };
      const sideAxis = { x: Math.abs(door.dz), z: Math.abs(door.dx) };  // along the wall
      const mk = (w, h, d, ox, oy, oz, mat) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(doorPos.x + ox, oy, doorPos.z + oz);
        vest.add(m);
        return m;
      };
      // posts + lintel (oriented by door axis)
      const pw = sideAxis.x * 0.3 + Math.abs(fwd.x) * 1.6;
      const pd = sideAxis.z * 0.3 + Math.abs(fwd.z) * 1.6;
      mk(pw, 3.6, pd, sideAxis.x * 1.8 + fwd.x * 0.5, 1.8, sideAxis.z * 1.8 + fwd.z * 0.5, wallMat);
      mk(pw, 3.6, pd, -(sideAxis.x * 1.8) + fwd.x * 0.5, 1.8, -(sideAxis.z * 1.8) + fwd.z * 0.5, wallMat);
      mk(sideAxis.x * 4.0 + Math.abs(fwd.x) * 1.7, 0.35, sideAxis.z * 4.0 + Math.abs(fwd.z) * 1.7, fwd.x * 0.5, 3.65, fwd.z * 0.5, wallMat);
      // glow frame edges
      mk(sideAxis.x * 0.14 + Math.abs(fwd.x) * 1.75, 3.5, sideAxis.z * 0.14 + Math.abs(fwd.z) * 1.75, sideAxis.x * 1.62 + fwd.x * 0.52, 1.75, sideAxis.z * 1.62 + fwd.z * 0.52, frameMat);
      mk(sideAxis.x * 0.14 + Math.abs(fwd.x) * 1.75, 3.5, sideAxis.z * 0.14 + Math.abs(fwd.z) * 1.75, -(sideAxis.x * 1.62) + fwd.x * 0.52, 1.75, -(sideAxis.z * 1.62) + fwd.z * 0.52, frameMat);
      // sliding panel
      const panel = mk(sideAxis.x * 2.9 + Math.abs(fwd.x) * 0.16, 3.3, sideAxis.z * 2.9 + Math.abs(fwd.z) * 0.16, fwd.x * 0.55, 1.65, fwd.z * 0.55, wallMat);
      const panelBase = panel.position.clone();
      group.add(vest);

      const doorState = { open: 0 };
      const gateCol = {
        minX: doorPos.x - (sideAxis.x * 1.6 + Math.abs(fwd.x) * 0.8), maxX: doorPos.x + (sideAxis.x * 1.6 + Math.abs(fwd.x) * 0.8),
        minZ: doorPos.z - (sideAxis.z * 1.6 + Math.abs(fwd.z) * 0.8), maxZ: doorPos.z + (sideAxis.z * 1.6 + Math.abs(fwd.z) * 0.8),
        minY: -0.5, maxY: 3.4,
        enabled: () => doorState.open < 0.7,
      };
      world.colliders.push(gateCol);   // global: must block even when interior isn't active
      world.updateFns.push((dt, t, playerPos) => {
        if (!playerPos) return;
        const dx = playerPos.x - doorPos.x, dz = playerPos.z - doorPos.z;
        const want = (dx * dx + dz * dz < 18 && playerPos.y < 4.5) ? 1 : 0;
        doorState.open += clamp(want - doorState.open, -dt * 2.2, dt * 2.2);
        const off = doorState.open * 2.75;
        panel.position.x = panelBase.x + sideAxis.x * off;
        panel.position.z = panelBase.z + sideAxis.z * off;
      });
    }

    // ── stair + shaft zones (local frame, door at +z, back wall at -z) ──
    const lw = W / 2 - 0.45, ld = Dep / 2 - 0.45;
    const backZ = -ld;
    const stairX0 = -lw, stairX1 = -lw + 3.4;
    const stairZ0 = backZ, stairZ1 = backZ + 6.8;
    const shaftX0 = lw - 3.4, shaftX1 = lw;
    const shaftZ0 = backZ, shaftZ1 = backZ + 3.4;
    const shaftC = toWorld((shaftX0 + shaftX1) / 2, (shaftZ0 + shaftZ1) / 2);

    // ── floor slabs (surfaces + visuals), leaving the two voids ──
    for (let k = 1; k <= F; k++) {
      const y = k * FLOOR_H;
      const slabTop = y + 0.13;
      const rects = [
        [ -lw, stairZ1, lw, ld ],                       // main floor (front of the service strip)
        [ stairX1, backZ, shaftX0, stairZ1 ],           // between stairwell and shaft
        [ shaftX0, shaftZ1, lw, stairZ1 ],              // in front of the shaft (elevator landing)
      ];
      for (const [x0, z0, x1, z1] of rects) {
        if (x1 - x0 < 0.5 || z1 - z0 < 0.5) continue;
        const r = rectW(x0, z0, x1, z1);
        interior.surfaces.push({ ...r, y: slabTop });
        pushBox(solidGeos, (x0 + x1) / 2, (z0 + z1) / 2, y, (x1 - x0), 0.26, (z1 - z0));
      }
    }
    // ceiling light strips on every level (incl. the lobby) + a cross strip
    for (let k = 0; k <= F; k++) {
      const cy = k * FLOOR_H + 3.38;
      pushBox(glowGeos, 0, (stairZ1 + ld) / 2, cy, Math.min(W - 4, 16), 0.1, 0.55);
      pushBox(glowGeos, 0, (stairZ1 + ld) / 2, cy, 0.55, 0.1, Math.max(2, ld - stairZ1 - 2));
    }
    // shaft trim glow at each landing
    for (let k = 0; k <= F; k++) {
      pushBox(glowGeos, (shaftX0 + shaftX1) / 2, shaftZ1 + 0.1, k * FLOOR_H + 2.9, 3.2, 0.12, 0.12);
    }

    // ── switchback stairs ──
    // Both flights meet the slab line at the FRONT of the stairwell
    // (z = stairZ1): west strip rises toward the back landing, east strip
    // arrives from it — so every floor connects cleanly at its slab edge.
    {
      const fx0 = stairX0 + 0.1, fx1 = stairX0 + 1.55;   // west strip (up)
      const gx0 = stairX0 + 1.85, gx1 = stairX1 - 0.1;   // east strip (down from above)
      const runZf = stairZ1;                              // front (floor connection)
      const runZb = backZ + 1.5;                          // back (landing edge)
      const landZ0 = backZ + 0.15, landZ1 = runZb;
      const localZ = (x, z) => (x - b.x) * sinR + (z - b.z) * cosR;
      for (let k = 0; k < F; k++) {
        const yb = k * FLOOR_H + (k === 0 ? 0 : 0.13);
        const yt = (k + 1) * FLOOR_H + 0.13;
        const half = (yt - yb) / 2;
        // west flight: floor k at the front → +half at the back landing
        {
          const r = rectW(fx0, runZb, fx1, runZf);
          interior.surfaces.push({
            ...r,
            y: (x, z) => yb + half * clamp((runZf - localZ(x, z)) / (runZf - runZb), 0, 1),
          });
        }
        // landing at the back
        {
          const r = rectW(stairX0 + 0.1, landZ0, stairX1 - 0.1, landZ1);
          interior.surfaces.push({ ...r, y: yb + half });
          pushBox(solidGeos, (stairX0 + stairX1) / 2, (landZ0 + landZ1) / 2, yb + half - 0.1, stairX1 - stairX0 - 0.2, 0.2, landZ1 - landZ0);
        }
        // east flight: landing → floor k+1 at the front
        {
          const r = rectW(gx0, runZb, gx1, runZf);
          interior.surfaces.push({
            ...r,
            y: (x, z) => yt - half * clamp((runZf - localZ(x, z)) / (runZf - runZb), 0, 1),
          });
        }
        // ramp visuals
        const runLen = Math.hypot(runZf - runZb, half);
        const ang = Math.atan2(half, runZf - runZb);
        for (const [sx0, sx1, slope] of [[fx0, fx1, -1], [gx0, gx1, 1]]) {
          const g = new THREE.BoxGeometry(sx1 - sx0, 0.18, runLen);
          g.rotateX(slope * ang);
          if (Math.abs(sinR) > 0.5) g.rotateY(rot);
          const p = toWorld((sx0 + sx1) / 2, (runZb + runZf) / 2);
          g.translate(p.x, yb + half / 2 + (slope === 1 ? half : 0), p.z);
          solidGeos.push(g);
          const gl = new THREE.BoxGeometry(sx1 - sx0 - 0.2, 0.05, runLen - 0.2);
          gl.rotateX(slope * ang);
          if (Math.abs(sinR) > 0.5) gl.rotateY(rot);
          gl.translate(p.x, yb + half / 2 + (slope === 1 ? half : 0) + 0.13, p.z);
          glowGeos.push(gl);
        }
      }
      // central divider between the two flights, full height
      const divider = rectW(fx1 + 0.02, runZb, gx0 - 0.02, runZf);
      interior.colliders.push({ ...divider, minY: 0, maxY: F * FLOOR_H + 2.5 });
      pushBox(solidGeos, (fx1 + gx0) / 2, (runZb + runZf) / 2, (F * FLOOR_H) / 2, 0.24, F * FLOOR_H, runZf - runZb);
      // side fence between the stairwell and the service strip (stops side falls;
      // entry is from the front line only)
      const fence = rectW(stairX1 - 0.06, backZ, stairX1 + 0.06, stairZ1 - 0.05);
      interior.colliders.push({ ...fence, minY: 0, maxY: F * FLOOR_H + 2.5 });
      pushBox(glowGeos, (fx1 + gx0) / 2, (runZb + runZf) / 2, F * FLOOR_H + 0.4, 0.1, 0.1, runZf - runZb);
      // stair entry beacon at the lobby
      pushBox(glowGeos, (stairX0 + stairX1) / 2, stairZ1 + 0.4, 2.9, 2.4, 0.18, 0.18);
    }

    // ── interior elevator (gated cab; roof stop on short towers) ──
    {
      const stops = [-0.14];
      for (let k = 1; k <= F; k++) stops.push(k * FLOOR_H - 0.05);
      if (roofAccess) stops.push(b.h - 0.16);
      const gateDir = { dx: Math.round(Math.abs(sinR) > 0.5 ? cosR * 0 + sinR : 0), dz: 0 };
      // local +z gate → world direction of local z axis
      const gz = { dx: Math.round(sinR), dz: Math.round(cosR) };
      world.makeElevator({
        x: shaftC.x, z: shaftC.z, stops,
        gate: gz, size: 3.1, color: D.accent, name: 'LIFT',
        sets: { surfaces: interior.surfaces, colliders: interior.colliders, interactables: world.interactables },
        parent: group,
      });
      if (roofAccess) {
        // penthouse cap where the shaft pokes through the roof
        pushBox(solidGeos, (shaftX0 + shaftX1) / 2, (shaftZ0 + shaftZ1) / 2 + 0.0, b.h + 1.6, 4.0, 3.2, 4.0);
        const roofR = rectW(-lw, backZ, lw, ld);
        world.surfaces.push({ ...roofR, y: b.h + 0.02 });   // global: you can land here from a hop too
      }
    }

    // ── seeded per-floor layouts ──
    for (let k = 1; k <= F; k++) {
      const y = k * FLOOR_H + 0.13;
      const arch = rnd() < 0.45 ? 'rooms' : 'open';
      if (arch === 'rooms') {
        // one cross wall with a doorway, on the main floor area
        const wz = stairZ1 + 2.5 + rnd() * Math.max(1, (ld - stairZ1 - 5));
        const gapAt = -lw + 3 + rnd() * (W - 7);
        for (const [x0, x1] of [[-lw + 0.2, gapAt - 1.4], [gapAt + 1.4, lw - 0.2]]) {
          if (x1 - x0 < 1.2) continue;
          pushBox(solidGeos, (x0 + x1) / 2, wz, y + 1.62, x1 - x0, 3.1, 0.2);
          const r = rectW(x0, wz - 0.12, x1, wz + 0.12);
          interior.colliders.push({ ...r, minY: y - 0.2, maxY: y + 3.2 });
        }
      }
      // props: crates / desks (visual clutter, no colliders)
      const nProps = 3 + (rnd() * 4) | 0;
      for (let p = 0; p < nProps; p++) {
        const pw = 0.7 + rnd() * 0.9, ph = 0.5 + rnd() * 0.9;
        const lx = -lw + 1.5 + rnd() * (W - 4);
        const lz = stairZ1 + 1.5 + rnd() * Math.max(1, ld - stairZ1 - 3);
        pushBox(solidGeos, lx, lz, y + ph / 2, pw, ph, pw * (0.7 + rnd() * 0.8));
      }
    }

    // lobby reception desk + holo board
    pushBox(solidGeos, doorLX, ld - 5.5, 0.55, 3.4, 1.1, 1.1);
    pushBox(glowGeos, doorLX, ld - 5.5, 1.18, 3.5, 0.08, 1.2);
    {
      const [c, ctx] = makeCanvas(256, 128);
      ctx.fillStyle = 'rgba(3,6,12,0.95)'; ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = hexCss(D.accent, 0.9); ctx.lineWidth = 4; ctx.strokeRect(4, 4, 248, 120);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 26px Orbitron, monospace';
      ctx.shadowColor = hexCss(D.accent, 1); ctx.shadowBlur = 10;
      ctx.fillText(D.short, 128, 42);
      ctx.font = '20px Rajdhani, sans-serif';
      ctx.fillText(`${F} FLOORS · LIFT + STAIRS`, 128, 78);
      if (roofAccess) ctx.fillText('ROOF ACCESS ◊', 128, 104);
      const p = toWorld(doorLX, ld - 6.4);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({ map: canvasTexture(c), side: THREE.DoubleSide }));
      board.position.set(p.x, 2.2, p.z);
      board.rotation.y = rot;
      group.add(board);
    }

    // merge the static interior into two draw calls
    if (solidGeos.length) {
      const solid = new THREE.Mesh(
        BufferGeometryUtils.mergeGeometries(solidGeos),
        new THREE.MeshStandardMaterial({ color: 0x2a3147, roughness: 0.55, metalness: 0.4 })
      );
      group.add(solid);
      world.raycastTargets.push(solid);
    }
    if (glowGeos.length) {
      const glow = new THREE.Mesh(
        BufferGeometryUtils.mergeGeometries(glowGeos),
        new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.85), toneMapped: false })
      );
      group.add(glow);
    }
  }
}
