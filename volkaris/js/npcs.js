// ════════════════════════════════════════════════════════════════
// VOLKARIS — the locals (and the not-so-locals)
//
//   civilians  — bright-jacketed scavengers strolling district loops
//   merchants  — lean on their stalls, wave you over
//   robots     — dutiful boxy service units on errands
//   troopers   — Vex's soldiers; patrol, spot, and open fire
//   VULTYR     — the flying general: silver wings, pink sigil,
//                circles the fortress and dives with plasma
//   BRAKKUS    — the ground general: 2.7m of jade gunmetal stomping
//                the processional with an arm cannon
//   OVERLORD VEX — waits on the obsidian throne. Rises when you
//                enter the hall. You do not have to fight him —
//                but the tunnel out is behind his chair.
//
// Every rig is unique (distinct skeleton dressing, palette, clips,
// behaviors). All stand on spherical gravity like the Captain.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { C, NEON, mulberry32, pick, clamp, lerp, sphDir } from './config.js';
import { makeCivilian, makeMerchant, makeRobot, makeTrooper, makeVultyr, makeBrakkus, makeVex } from './rig.js';
import { makeGLTFRig, ASTRO_MAP, SENTINEL_MAP } from './gltfrig.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

// unarmed civilian variant of the Astronaut clip map — hands off the gun
const ASTRO_CIV_MAP = {
  ...ASTRO_MAP,
  idle: { name: 'Idle_Neutral' },
  lean: { name: 'Idle_Neutral', timeScale: 0.55 },
  sit: { name: 'Idle_Neutral', timeScale: 0.4 },
};

export function buildNPCs(scene, planet, fx, audio, hud, models = {}) {
  const kay = models.kay ?? {};
  // Everyone on Volkaris wears the same make of suit as the Captain —
  // the Astronaut rig — in their own colors. Unique identities live in
  // the tints, visor glows, scales and props.
  const civSuits = [
    { main: 0x4a7a8c, dark: 0x24303e, accent: 0x35d0c0, visor: 0x9adfd2 },   // teal scavenger
    { main: 0x8c5a3a, dark: 0x3a2620, accent: 0xff9a4a, visor: 0xffc890 },   // rust hauler
    { main: 0x6a5a8c, dark: 0x2a2440, accent: 0xc09aff, visor: 0xd0baff },   // mauve drifter
    { main: 0x5a8c4a, dark: 0x24361e, accent: 0x9dff9a, visor: 0xc0ffb8 },   // olive tinker
    { main: 0x8c4a6a, dark: 0x3a2030, accent: 0xff7ad0, visor: 0xffb8e6 },   // magenta rounder
    { main: 0x3a6a8a, dark: 0x1a2836, accent: 0x4ac0ff, visor: 0xa0e0ff },   // cobalt courier
    { main: 0x8a7a3a, dark: 0x38301a, accent: 0xffe04a, visor: 0xfff0a0 },   // ochre trader
    { main: 0x5c4a8a, dark: 0x241c3a, accent: 0xb87aff, visor: 0xd8b8ff },   // indigo pilgrim
  ];
  const astroTints = (s, glow = 0.22) => ({
    SciFi_Main: { color: s.main, metalness: 0.55, roughness: 0.5 },
    SciFi_MainDark: { color: s.dark, metalness: 0.5, roughness: 0.55 },
    SciFi_Light: { color: 0x9aa4b8, metalness: 0.45, roughness: 0.5 },
    SciFi_Light_Accent: { color: s.accent, emissive: s.accent, emissiveIntensity: glow },
    Grey: { color: 0x0c141e, emissive: s.visor, emissiveIntensity: glow + 0.1 },
  });
  const makeCiv = (rnd2) => {
    if (!kay.Astronaut) return makeCivilian(rnd2);
    const s = pick(rnd2, civSuits);
    return makeGLTFRig(kay.Astronaut, {
      scale: 0.84 + rnd2() * 0.08, clipMap: ASTRO_CIV_MAP, tints: astroTints(s),
    });
  };
  const makeMerch = (rnd2) => kay.Astronaut
    ? makeGLTFRig(kay.Astronaut, {
        scale: 0.9, clipMap: ASTRO_CIV_MAP,
        tints: astroTints({ main: 0xb8862c, dark: 0x3a2c14, accent: 0xffc400, visor: 0xffe6a0 }, 0.3),
      })
    : makeMerchant(rnd2);
  // Vex's soldiers: gunmetal suits, red visors, red sidearms
  const makeTrooperRig = () => {
    if (!kay.Astronaut) return makeTrooper();
    const r = makeGLTFRig(kay.Astronaut, {
      scale: 1.02, clipMap: ASTRO_MAP, withBlaster: true, blasterHex: 0xff2e4d,
      tints: astroTints({ main: 0x3a4254, dark: 0x181c28, accent: 0xff2e4d, visor: 0xff4a5e }, 0.34),
    });
    if (r.setGunRot) r.setGunRot(-1.623, 0.166, 1.751);
    return r;
  };
  // signature props — fixed to the rig GROUP, never bone-parented
  // (armature scale tracks turn parented props into building-sized
  // slabs; the group tracks position+facing, which is all these need)
  function addWings(rig, span = 2.6, hex = 0xd8e6f2) {
    const wings = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: hex, metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const wing = new THREE.Group();
      for (let f = 0; f < 3; f++) {
        const feather = new THREE.Mesh(new THREE.BoxGeometry(span * (0.55 - f * 0.12), 0.05, 0.5 - f * 0.1), mat);
        feather.position.set(s * span * (0.28 + f * 0.2), f * 0.24, -f * 0.1);
        feather.rotation.z = s * (0.28 + f * 0.16);
        wing.add(feather);
      }
      const glow = new THREE.Mesh(new THREE.BoxGeometry(span * 0.5, 0.03, 0.06),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.magenta).multiplyScalar(1.2), toneMapped: false }));
      glow.position.set(s * span * 0.35, 0.1, 0.26);
      glow.rotation.z = s * 0.3;
      wing.add(glow);
      wings.add(wing);
    }
    wings.position.set(0, 1.55, -0.35);
    rig.group.add(wings);
    rig.group.userData.wings = wings;
  }
  function addArmCannon(rig, scale = 1.45) {
    // pauldrons sell the bulk; the oversized blaster IS the cannon.
    // Props attach to the unscaled GROUP — offsets must account for
    // the rig's own scale or they pile up around the neck.
    const mat = new THREE.MeshStandardMaterial({ color: 0x1d3a2e, metalness: 0.7, roughness: 0.35 });
    for (const s of [-1, 1]) {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      pauldron.position.set(s * 0.5 * scale, 1.28 * scale, 0);
      rig.group.add(pauldron);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5), mat);
      spike.position.set(s * 0.64 * scale, 1.42 * scale, 0);
      spike.rotation.z = s * -0.7;
      rig.group.add(spike);
    }
    if (rig.setBlasterScale) rig.setBlasterScale(2.1);
  }
  function addCrown(rig, scale = 1.55) {
    const crown = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c0812, metalness: 0.9, roughness: 0.2 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 5, 12), mat);
    ring.rotation.x = Math.PI / 2;
    crown.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 4), mat);
      spike.position.set(Math.cos(a) * 0.34, 0.18, Math.sin(a) * 0.34);
      crown.add(spike);
    }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.magenta).multiplyScalar(1.4), toneMapped: false }));
    gem.position.y = 0.34;
    crown.add(gem);
    crown.position.set(0, 2.02 * scale, 0);
    rig.group.add(crown);
    rig.group.userData.crown = crown;
  }

  const rnd = mulberry32(C.SEED + 77);
  const list = [];

  // walls and props block the locals too — probe at chest height and
  // slide along whatever is hit instead of clipping through it
  const _mv = new THREE.Vector3(), _mv2 = new THREE.Vector3();
  function moveNPC(npc, moveDir, dist) {
    _mv2.copy(npc.pos).normalize();
    _mv.copy(npc.pos).addScaledVector(_mv2, 1.0);
    const hit = planet.probe(_mv, moveDir, dist + 0.7);
    if (hit) {
      const n = hit.face.normal;
      _mv.copy(moveDir).addScaledVector(n, -moveDir.dot(n));
      if (_mv.lengthSq() < 0.02) return false;   // dead-on into a wall
      _mv.normalize();
      npc.pos.addScaledVector(_mv, dist * 0.6);
      return true;
    }
    npc.pos.addScaledVector(moveDir, dist);
    return true;
  }

  function groundPose(dirUnit, npc) {
    const gh = planet.groundHit(_v.copy(dirUnit).multiplyScalar(planet.terrainHeight(dirUnit) + 3), 2, 30);
    const p = gh ? gh.point : planet.surfacePoint(dirUnit);
    npc.pos.copy(p);
  }

  function faceAlong(npc, tangentDir, dt) {
    _up.copy(npc.pos).normalize();
    _fwd.copy(tangentDir).addScaledVector(_up, -tangentDir.dot(_up)).normalize();
    _right.crossVectors(_fwd, _up).negate().normalize();
    _m.makeBasis(_right, _up, _fwd);
    _q.setFromRotationMatrix(_m);
    npc.rig.group.quaternion.slerp(_q, dt ? 1 - Math.pow(0.0001, dt) : 1);
  }

  // waypoint loop around an anchor (lat/lon degrees, radius u)
  function makeLoop(lat, lon, radius, n = 5) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
      const r = radius * (0.6 + rnd() * 0.5);
      pts.push(sphDir(
        lat + Math.cos(a) * r / C.R * 57.3,
        lon + Math.sin(a) * r / C.R * 57.3 / Math.max(0.25, Math.cos(lat * 0.0174))
      ));
    }
    return pts;
  }

  // A COMMUTE rides a contiguous slice of a real STREET chain — the paths
  // are carved clear of buildings, so a local walking one never cuts
  // through a wall (the circular makeLoop routes did, in the dense bazaar).
  const streetChains = (planet.pathChains || []).filter(c => c.length >= 4);
  function makeStreetRoute() {
    if (!streetChains.length) return null;
    const c = streetChains[(rnd() * streetChains.length) | 0];
    const len = Math.min(c.length, 4 + (rnd() * 7 | 0));
    const start = (rnd() * (c.length - len + 1)) | 0;
    return c.slice(start, start + len).map(v => v.clone());
  }
  // advance a waypoint index; street routes PING-PONG (reverse at the ends)
  // so they retrace the road instead of cutting straight back across it
  function advanceWp(npc) {
    if (npc.pingpong && npc.loop.length > 1) {
      let ni = npc.wpIdx + (npc.wpDir || 1);
      if (ni >= npc.loop.length) { ni = npc.loop.length - 2; npc.wpDir = -1; }
      else if (ni < 0) { ni = 1; npc.wpDir = 1; }
      npc.wpIdx = Math.max(0, Math.min(npc.loop.length - 1, ni));
    } else {
      npc.wpIdx = (npc.wpIdx + 1) % npc.loop.length;
    }
  }

  function addNPC(kind, rig, dirUnit, opts = {}) {
    const npc = {
      kind, rig,
      pos: new THREE.Vector3(),
      hp: opts.hp ?? 60,
      maxHp: opts.hp ?? 60,
      speed: opts.speed ?? 2.2,
      loop: opts.loop ?? null,
      pingpong: opts.pingpong ?? false,
      wpIdx: 0,
      wpDir: 1,
      state: 'roam',       // roam | idle | combat | dead
      stateT: rnd() * 4,
      shootT: 0,
      radius: opts.radius ?? 0.9,
      respawnT: 0,
      home: dirUnit.clone(),
      fixed: opts.fixed ?? false,
      clip: opts.clip ?? null,
      aggro: opts.aggro ?? false,
      name: opts.name,
      fly: opts.fly ?? null,
      onDead: opts.onDead ?? null,
    };
    groundPose(dirUnit, npc);
    rig.group.position.copy(npc.pos);
    faceAlong(npc, new THREE.Vector3(1, 0, 0).cross(dirUnit).normalize() || new THREE.Vector3(1, 0, 0), 0);
    if (npc.clip) rig.play(npc.clip);
    scene.add(rig.group);
    list.push(npc);
    return npc;
  }

  // ── populate districts ──
  const D = Object.fromEntries(planet.districts.map(d => [d.key, d]));

  // Merchants hold their stalls; the SALOON KEEPER holds the dunes bar —
  // these are the only rooted locals. Everyone else COMMUTES the streets.
  for (let i = 0; i < 3; i++) {
    const m = addNPC('merchant', makeMerch(rnd), sphDir(D.market.lat - 2 + i * 2.2, D.market.lon - 10 + i * 3.2),
      { fixed: true, clip: i === 1 ? 'wave' : 'lean', name: 'merchant' });
    m.rig.group.rotateY(rnd() * 6.28);
  }
  addNPC('merchant', makeMerch(rnd), sphDir(D.dunes.lat + 2, D.dunes.lon + 3.4),
    { fixed: true, clip: 'lean', name: 'saloon keeper' });

  // ── DAILY COMMUTERS: locals walking the whole planet's STREET network,
  // going about their routines. Routes ride real path chains, spawn at a
  // random point along the route facing either way, and ping-pong the road
  // — so people are everywhere AND never walk through walls. ──
  function addCommuter(kind, rig, speed, name) {
    const route = makeStreetRoute();
    if (!route || route.length < 2) return null;
    const si = (rnd() * route.length) | 0;
    const npc = addNPC(kind, rig, route[si], { loop: route, pingpong: true, speed, name });
    npc.wpIdx = si; npc.wpDir = rnd() < 0.5 ? 1 : -1;
    return npc;
  }
  for (let i = 0; i < 40; i++) addCommuter('civ', makeCiv(rnd), 1.5 + rnd() * 1.4, 'commuter');
  for (let i = 0; i < 5; i++) addCommuter('robot', makeRobot(rnd), 2.4 + rnd() * 0.6, 'porter');

  // pyramid: trooper patrols + BRAKKUS on the processional
  for (let i = 0; i < 4; i++) {
    addNPC('trooper', makeTrooperRig(), sphDir(D.pyramid.lat + 6 + (rnd() - 0.5) * 10, D.pyramid.lon + (rnd() - 0.5) * 14),
      {
        loop: makeLoop(D.pyramid.lat + 5, D.pyramid.lon, 13, 4),
        speed: 2.8, hp: 70, aggro: true, name: 'trooper',
      });
  }
  // two more troopers guarding the long canyon road to the port
  addNPC('trooper', makeTrooperRig(), sphDir(0, 306), { loop: makeLoop(0, 306, 10, 4), speed: 2.8, hp: 70, aggro: true });
  addNPC('trooper', makeTrooperRig(), sphDir(48, 182), { loop: makeLoop(48, 182, 10, 4), speed: 2.8, hp: 70, aggro: true });

  // BRAKKUS — 2.7m of jade gunmetal; same suit line as the Captain,
  // forged heavier, with an arm cannon burning red
  const makeBrakkusRig = () => {
    if (!kay.Astronaut) return makeBrakkus();
    const r = makeGLTFRig(kay.Astronaut, {
      scale: 1.45, clipMap: ASTRO_MAP, withBlaster: true, blasterHex: NEON.orange,
      tints: astroTints({ main: 0x2c6a52, dark: 0x122018, accent: 0xff7a1a, visor: 0xffa04a }, 0.4),
    });
    if (r.setGunRot) r.setGunRot(-1.623, 0.166, 1.751);
    addArmCannon(r);   // his signature: spiked pauldrons + the oversized cannon
    return r;
  };
  const brakkus = addNPC('brakkus', makeBrakkusRig(), sphDir(D.pyramid.lat - 18 + 34, D.pyramid.lon - 22),
    {
      loop: makeLoop(-34, 310, 13, 4),
      speed: 1.6, hp: 320, aggro: true, radius: 1.6, clip: 'stomp',
      name: 'BRAKKUS — GROUND GENERAL',
      onDead: () => hud.toast('BRAKKUS DOWN', 'The processional is clear'),
    });
  brakkus.shootEvery = 2.2;

  // OVERLORD VEX — on the throne inside the pyramid. Obsidian plate,
  // magenta furnace-glow seams, half a head taller than anyone alive.
  const makeVexRig = () => {
    if (!kay.Astronaut) return makeVex();
    const r = makeGLTFRig(kay.Astronaut, {
      scale: 1.55, clipMap: ASTRO_CIV_MAP,
      tints: astroTints({ main: 0x16101e, dark: 0x0a0610, accent: 0xff2fd6, visor: 0xff2fd6 }, 0.3),
    });
    addCrown(r, 1.55);   // the Overlord's obsidian crown
    return r;
  };
  const vex = addNPC('vex', makeVexRig(), D.pyramid.dir.clone(), {
    fixed: true, clip: 'sit', hp: 500, radius: 1.1,
    name: 'OVERLORD VEX',
    onDead: () => hud.toast('THE OVERLORD FALLS', 'Volkaris is free. The port is yours.'),
  });
  vex.pos.copy(planet.pyramidInfo.throne);
  vex.rig.group.position.copy(vex.pos);
  {  // face the gate
    const toGate = _v.copy(planet.pyramidInfo.gate).sub(planet.pyramidInfo.throne);
    faceAlong(vex, toGate, 0);
  }
  vex.risen = false;

  // VULTYR — the flying general. Ben's Silver Sentinel model takes the
  // role: chrome biped circling the fortress (procedural wings rig as
  // fallback when the GLB is missing)
  const makeVultyrRig = () => {
    if (!kay.Sentinel) return makeVultyr();
    const r = makeGLTFRig(kay.Sentinel, { scale: 1.18, clipMap: SENTINEL_MAP });
    addWings(r, 3.2);   // the sky general gets his silver wings back
    return r;
  };
  const vultyr = addNPC('vultyr', makeVultyrRig(), sphDir(D.pyramid.lat + 10, D.pyramid.lon), {
    hp: 260, radius: 1.2, clip: 'fly', name: 'VULTYR — SKY GENERAL',
    fly: { angle: 0, height: 9, radius: 18, diveT: 0 },
    onDead: () => hud.toast('VULTYR SHOT DOWN', 'The sky is clear'),
  });

  // ── combat helpers ──
  function hitTest(point, extra = 0) {
    for (const n of list) {
      if (n.state === 'dead') continue;
      _up.copy(n.pos).normalize();
      _v2.copy(n.pos).addScaledVector(_up, n.kind === 'brakkus' ? 1.6 : 1.0);
      const r = n.radius + extra * 0.2;
      if (point.distanceToSquared(_v2) < r * r) return n;
    }
    return null;
  }
  // ── power drops: downed hostiles leave a healing energy core ──
  const drops = [];
  const dropGeo = new THREE.IcosahedronGeometry(0.26, 0);
  const dropMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5dffb2).multiplyScalar(1.25), toneMapped: false });
  const dropRing = new THREE.RingGeometry(0.34, 0.46, 12);
  const dropRingMat = new THREE.MeshBasicMaterial({
    color: 0x5dffb2, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  function spawnDrop(pos) {
    const up = pos.clone().normalize();
    const core = new THREE.Mesh(dropGeo, dropMat);
    const ring = new THREE.Mesh(dropRing, dropRingMat.clone());
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    core.position.copy(pos).addScaledVector(up, 0.6);
    ring.position.copy(pos).addScaledVector(up, 0.15);
    scene.add(core); scene.add(ring);
    drops.push({ core, ring, base: core.position.clone(), up, ttl: 60, ph: Math.random() * 6 });
  }

  function applyHit(npc, dmg, at) {
    if (npc.state === 'dead') return;
    npc.hp -= dmg;
    const civilian = npc.kind === 'civ' || npc.kind === 'merchant' || npc.kind === 'robot';
    if (!civilian) npc.hp = 0;   // TEMP (Ben): hostiles drop in one hit
    // civvies scatter, troopers retaliate
    if (civilian) {
      npc.state = 'flee';
      npc.stateT = 3 + Math.random() * 2;
    } else {
      npc.state = 'combat';
    }
    if (npc.kind === 'vex' && !npc.risen) riseVex(npc);
    if (npc.hp <= 0) {
      npc.state = 'dead';
      npc.respawnT = npc.kind === 'trooper' ? 24 : -1;   // generals stay down
      npc.rig.play('die', { fade: 0.08, restart: true });
      audio.sfx('boom');
      // hostiles drop power cores (bosses drop a cluster)
      if (['trooper', 'vultyr', 'brakkus', 'vex'].includes(npc.kind)) {
        const n = npc.kind === 'trooper' ? 1 : 3;
        for (let i = 0; i < n; i++) {
          _v.copy(npc.pos);
          if (i > 0) {
            _up.copy(npc.pos).normalize();
            _v2.set(1, 0, 0).cross(_up).normalize().applyAxisAngle(_up, i * 2.1);
            _v.addScaledVector(_v2, 1.1);
          }
          spawnDrop(_v);
        }
      }
      if (npc.onDead) npc.onDead();
    }
  }

  function riseVex(npc) {
    npc.risen = true;
    npc.rig.play('throne', { fade: 0.2, restart: true });
    audio.sfx('alarm');
    hud.toast('OVERLORD VEX', '“A captain… out of uniform. Kneel.”');
    setTimeout(() => { if (npc.state !== 'dead') npc.rig.play('walk', { fade: 0.4 }); }, 2400);
  }

  // ── per-frame AI ──
  let playerAPI = null;
  function update(dt, t, player) {
    playerAPI = player;
    const pPos = player.state.pos;

    // ── power drops: bob, spin, expire, and heal on pickup ──
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.ttl -= dt;
      const take = pPos.distanceTo(d.base) < 1.9;
      if (take && player.heal) player.heal(30);
      if (take || d.ttl <= 0) {
        scene.remove(d.core); scene.remove(d.ring);
        drops.splice(i, 1);
        if (take) { fx.burst(d.base, 12, 4); hud.toast('POWER CORE', '+30 suit integrity'); }
        continue;
      }
      d.core.position.copy(d.base).addScaledVector(d.up, 0.35 + Math.sin(t * 2.4 + d.ph) * 0.16);
      d.core.rotation.y = t * 1.8 + d.ph;
      d.ring.material.opacity = 0.25 + Math.sin(t * 3 + d.ph) * 0.15;
    }

    for (const npc of list) {
      const dist = npc.pos.distanceTo(pPos);
      // sleep far NPCs — the horizon hides them anyway
      if (dist > 95) { npc.rig.group.visible = false; continue; }
      npc.rig.group.visible = true;
      if (dist > 65 && npc.state !== 'dead') { /* pose freeze but keep position */ continue; }

      if (npc.state === 'dead') {
        if (npc.respawnT > 0) {
          npc.respawnT -= dt;
          if (npc.respawnT <= 0) {
            npc.hp = npc.maxHp;
            npc.state = 'roam';
            groundPose(npc.home, npc);
            npc.rig.play(npc.clip ?? 'idle', { restart: true });
          }
        }
        npc.rig.update(dt);
        continue;
      }

      _up.copy(npc.pos).normalize();

      // ── VULTYR: powered flight ──
      if (npc.fly) {
        const f = npc.fly;
        const anchor = planet.districts.find(d => d.key === 'pyramid').dir;
        f.angle += dt * 0.25;
        const seek = dist < 30 && !player.state.dead;
        if (seek) f.diveT += dt; else f.diveT = Math.max(0, f.diveT - dt * 2);
        const dive = clamp(f.diveT * 0.5, 0, 0.72);
        // orbit point around the pyramid, dips toward the player when diving
        _v.copy(anchor).applyAxisAngle(anchor.clone().cross(new THREE.Vector3(0, 1, 0)).normalize().lengthSq() > 0.01 ? anchor.clone().cross(new THREE.Vector3(0, 1, 0)).normalize() : new THREE.Vector3(1, 0, 0), Math.sin(f.angle) * f.radius / C.R);
        _v.applyAxisAngle(anchor, f.angle).normalize();
        const targetPos = _v2.copy(_v).multiplyScalar(planet.terrainHeight(_v) + f.height * (1 - dive));
        if (seek) targetPos.lerp(_v.copy(pPos).addScaledVector(_up, 7), dive);
        const to = targetPos.sub(npc.pos);
        npc.pos.addScaledVector(to, clamp(dt * 1.4, 0, 1));
        npc.rig.group.position.copy(npc.pos);
        faceAlong(npc, to.lengthSq() > 0.01 ? to : npc.rig.group.getWorldDirection(_fwd), dt);
        // plasma when diving
        npc.shootT -= dt;
        if (seek && dive > 0.3 && npc.shootT <= 0 && dist < 40) {
          npc.shootT = 1.4;
          _v.copy(pPos).addScaledVector(_up, 1.2).sub(npc.pos).normalize();
          fx.spawnBolt(_v2.copy(npc.pos).addScaledVector(_v, 1.4), _v, { friendly: false, color: NEON.pink, speed: 60, damage: 12 });
          audio.sfx('laser');
        }
        npc.rig.update(dt);
        continue;
      }

      // ── VEX: throne drama ──
      if (npc.kind === 'vex') {
        if (!npc.risen && dist < 13) riseVex(npc);
        if (npc.risen && dist < 30 && dist > 3.4 && !player.state.dead) {
          // stalks the intruder, slow and inevitable
          _fwd.copy(pPos).sub(npc.pos);
          _fwd.addScaledVector(_up, -_fwd.dot(_up));
          if (_fwd.lengthSq() > 0.1) {
            _fwd.normalize();
            moveNPC(npc, _fwd, dt * 1.1);
            groundPose(npc.pos.clone().normalize(), npc);
            npc.rig.group.position.copy(npc.pos);
            faceAlong(npc, _fwd, dt);
            if (npc.risen && npc.rig.current() === 'sit') npc.rig.play('walk');
          }
          // brush of the overlord: heavy damage up close
          if (dist < 2.6) player.damage(20 * dt);
        }
        npc.rig.update(dt);
        continue;
      }

      // ── grounded units ──
      npc.stateT -= dt;
      const isHostile = npc.aggro;
      // sight requires LINE of sight — walls, towers and terrain all
      // break contact (they were sniping through buildings before)
      // a rider on the elevated loop is out of the fight — don't engage
      let seesPlayer = isHostile && dist < 26 && !player.state.dead && player.state.mode !== 'ride';
      if (seesPlayer && dist > 3) {
        _v2.copy(npc.pos).addScaledVector(_up, 1.4);
        _v.copy(pPos).addScaledVector(_up, 1.1).sub(_v2);
        const d2 = _v.length();
        const block = planet.probe(_v2, _v.normalize(), d2);
        if (block && block.distance < d2 - 0.8) seesPlayer = false;
      }

      if (seesPlayer) npc.state = 'combat';
      else if (npc.state === 'combat') npc.state = 'roam';

      if (npc.state === 'combat') {
        // face + shoot; brakkus advances
        _fwd.copy(pPos).sub(npc.pos);
        _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize();
        faceAlong(npc, _fwd, dt);
        if (npc.kind === 'brakkus' && dist > 9) {
          moveNPC(npc, _fwd, npc.speed * dt);
          groundPose(npc.pos.clone().normalize(), npc);
          npc.rig.group.position.copy(npc.pos);
          npc.rig.play('stomp');
        } else {
          npc.rig.play('idle');
        }
        npc.rig.setAim(0.1, 1);
        npc.shootT -= dt;
        if (npc.shootT <= 0) {
          npc.shootT = npc.shootEvery ?? 1.15;
          npc.rig.kickRecoil();
          _v.copy(pPos).addScaledVector(_up, 1.1).sub(_v2.copy(npc.pos).addScaledVector(_up, 1.3)).normalize();
          fx.spawnBolt(_v2.addScaledVector(_v, 0.8), _v, {
            friendly: false,
            color: npc.kind === 'brakkus' ? NEON.orange : NEON.red,
            speed: npc.kind === 'brakkus' ? 46 : 55,
            // trimmed after demo-pilot playtests: 9/22 made the pyramid
            // approach a meat grinder (3-5 deaths per run)
            damage: npc.kind === 'brakkus' ? 18 : 7,
          });
          audio.sfx('laser');
        }
      } else if (npc.state === 'flee') {
        npc.rig.setAim(0, 0);
        _fwd.copy(npc.pos).sub(pPos);
        _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize();
        moveNPC(npc, _fwd, npc.speed * 2.1 * dt);
        groundPose(npc.pos.clone().normalize(), npc);
        npc.rig.group.position.copy(npc.pos);
        faceAlong(npc, _fwd, dt);
        npc.rig.play('run', { timeScale: 1.15 });
        if (npc.stateT <= 0) { npc.state = 'roam'; npc.rig.play('walk'); }
      } else if (npc.fixed) {
        npc.rig.setAim(0, 0);
        // stationary character: occasionally swap idle flavor
        if (npc.stateT <= 0) {
          npc.stateT = 4 + Math.random() * 5;
          if (npc.kind === 'merchant' && Math.random() < 0.5 && dist < 14) npc.rig.play('wave');
          else npc.rig.play(npc.clip ?? 'idle');
        }
      } else if (npc.loop) {
        npc.rig.setAim(0, 0);
        // waypoint stroll
        const wp = npc.loop[npc.wpIdx];
        const target = planet.surfacePoint(wp, _v2);
        _fwd.copy(target).sub(npc.pos);
        _fwd.addScaledVector(_up, -_fwd.dot(_up));
        const d2 = _fwd.length();
        if (d2 < 1.4) {
          advanceWp(npc);
          if (Math.random() < 0.25) { npc.state = 'idle'; npc.stateT = 2 + Math.random() * 3; npc.rig.play('idle'); }
        } else {
          _fwd.divideScalar(d2);
          if (!moveNPC(npc, _fwd, npc.speed * dt)) {
            // boxed in — give up on this waypoint rather than grind a wall
            advanceWp(npc);
          }
          groundPose(npc.pos.clone().normalize(), npc);
          npc.rig.group.position.copy(npc.pos);
          faceAlong(npc, _fwd, dt);
          npc.rig.play(npc.kind === 'brakkus' ? 'stomp' : 'walk', { timeScale: npc.speed / 2.2 });
        }
        if (npc.state === 'idle' && npc.stateT <= 0) npc.state = 'roam';
      }
      npc.rig.update(dt);
    }
  }

  return { list, drops, update, hitTest, applyHit, vex, vultyr, brakkus };
}
