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
  const rnd = mulberry32(C.SEED + 77);
  const list = [];

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

  function addNPC(kind, rig, dirUnit, opts = {}) {
    const npc = {
      kind, rig,
      pos: new THREE.Vector3(),
      hp: opts.hp ?? 60,
      maxHp: opts.hp ?? 60,
      speed: opts.speed ?? 2.2,
      loop: opts.loop ?? null,
      wpIdx: 0,
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

  // market: merchants at stalls + strolling civilians + a robot porter
  for (let i = 0; i < 3; i++) {
    const m = addNPC('merchant', makeMerch(rnd), sphDir(D.market.lat - 2 + i * 2.2, D.market.lon - 10 + i * 3.2),
      { fixed: true, clip: i === 1 ? 'wave' : 'lean', name: 'merchant' });
    m.rig.group.rotateY(rnd() * 6.28);
  }
  for (let i = 0; i < 5; i++) {
    addNPC('civ', makeCiv(rnd), sphDir(D.market.lat + (rnd() - 0.5) * 8, D.market.lon + (rnd() - 0.5) * 10),
      { loop: makeLoop(D.market.lat, D.market.lon, 9), speed: 1.8 + rnd(), name: 'civ' });
  }
  addNPC('robot', makeRobot(rnd), sphDir(D.market.lat + 3, D.market.lon + 4),
    { loop: makeLoop(D.market.lat, D.market.lon, 12), speed: 2.6, name: 'robot' });

  // the circuit: night crowd + robots
  for (let i = 0; i < 4; i++) {
    addNPC('civ', makeCiv(rnd), sphDir(D.circuit.lat + (rnd() - 0.5) * 8, D.circuit.lon + (rnd() - 0.5) * 10),
      { loop: makeLoop(D.circuit.lat, D.circuit.lon, 8), speed: 1.6 + rnd() * 0.8 });
  }
  for (let i = 0; i < 2; i++) {
    addNPC('robot', makeRobot(rnd), sphDir(D.circuit.lat - 3 + i * 5, D.circuit.lon + 6),
      { loop: makeLoop(D.circuit.lat, D.circuit.lon, 11), speed: 2.9 });
  }

  // downtown: commuters
  for (let i = 0; i < 4; i++) {
    addNPC('civ', makeCiv(rnd), sphDir(D.downtown.lat + (rnd() - 0.5) * 10, D.downtown.lon + (rnd() - 0.5) * 12),
      { loop: makeLoop(D.downtown.lat, D.downtown.lon, 10), speed: 2.4 + rnd() });
  }
  addNPC('robot', makeRobot(rnd), sphDir(D.downtown.lat - 4, D.downtown.lon + 2),
    { loop: makeLoop(D.downtown.lat, D.downtown.lon, 13), speed: 3.1 });

  // dunes: the saloon keeper
  addNPC('merchant', makeMerch(rnd), sphDir(D.dunes.lat + 2, D.dunes.lon + 3.4),
    { fixed: true, clip: 'lean', name: 'saloon keeper' });

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
    return makeGLTFRig(kay.Astronaut, {
      scale: 1.55, clipMap: ASTRO_CIV_MAP,
      tints: astroTints({ main: 0x16101e, dark: 0x0a0610, accent: 0xff2fd6, visor: 0xff2fd6 }, 0.3),
    });
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
  const makeVultyrRig = () => kay.Sentinel
    ? makeGLTFRig(kay.Sentinel, { scale: 1.18, clipMap: SENTINEL_MAP })
    : makeVultyr();
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
  function applyHit(npc, dmg, at) {
    if (npc.state === 'dead') return;
    npc.hp -= dmg;
    // civvies scatter, troopers retaliate
    if (npc.kind === 'civ' || npc.kind === 'merchant' || npc.kind === 'robot') {
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
            npc.pos.addScaledVector(_fwd, dt * 1.1);
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
      const seesPlayer = isHostile && dist < 26 && !player.state.dead;

      if (seesPlayer) npc.state = 'combat';
      else if (npc.state === 'combat') npc.state = 'roam';

      if (npc.state === 'combat') {
        // face + shoot; brakkus advances
        _fwd.copy(pPos).sub(npc.pos);
        _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize();
        faceAlong(npc, _fwd, dt);
        if (npc.kind === 'brakkus' && dist > 9) {
          npc.pos.addScaledVector(_fwd, npc.speed * dt);
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
            damage: npc.kind === 'brakkus' ? 22 : 9,
          });
          audio.sfx('laser');
        }
      } else if (npc.state === 'flee') {
        npc.rig.setAim(0, 0);
        _fwd.copy(npc.pos).sub(pPos);
        _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize();
        npc.pos.addScaledVector(_fwd, npc.speed * 2.1 * dt);
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
          npc.wpIdx = (npc.wpIdx + 1) % npc.loop.length;
          if (Math.random() < 0.25) { npc.state = 'idle'; npc.stateT = 2 + Math.random() * 3; npc.rig.play('idle'); }
        } else {
          _fwd.divideScalar(d2);
          npc.pos.addScaledVector(_fwd, npc.speed * dt);
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

  return { list, update, hitTest, applyHit, vex, vultyr, brakkus };
}
