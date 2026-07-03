// ════════════════════════════════════════════════════════════════
// VOLKARIS — transit: the ORBITAL LOOP monorail + vehicles
// (the NEON CITY monorail & AV concepts, bent around a sphere)
//
//   · An elevated monorail rides a great circle around the whole
//     planet, threading the equator districts. Three stations with
//     switchback stair towers; the train dwells, you board with E,
//     and the ride shows you the world curving away below.
//   · Ambient air traffic streams along tilted orbit lanes.
//   · Pilotable vehicles: two AVs (fly free — thrust where you
//     look, no gravity) and a ground speeder (drives — hugs the
//     deck). ENTER/E to board, slow down low to land and exit.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { C, NEON, NEON_LIST, mulberry32, pick, clamp, lerp, sphDir, tangentFrame, makeCanvas, canvasTexture } from './config.js';

const R = C.R;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export function buildTransit(scene, planet, audio) {
  const rnd = mulberry32(C.SEED + 311);
  const RAIL_R = R + 13;

  // ── the loop: a great circle through market & ruins ──
  const dirA = planet.districts.find(d => d.key === 'market').dir;
  const dirB = planet.districts.find(d => d.key === 'ruins').dir;
  const n = new THREE.Vector3().crossVectors(dirA, dirB).normalize();   // circle normal
  const u = dirA.clone().normalize();
  const w = new THREE.Vector3().crossVectors(n, u).normalize();
  const circleAt = (a, out = new THREE.Vector3()) =>
    out.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).normalize();

  // ── rail tube + glow strip (merged ring) ──
  {
    const pts = [];
    for (let i = 0; i <= 200; i++) pts.push(circleAt(i / 200 * Math.PI * 2).multiplyScalar(RAIL_R));
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const rail = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 220, 0.22, 6, true),
      new THREE.MeshStandardMaterial({ color: 0x2a2452, roughness: 0.4, metalness: 0.7 })
    );
    scene.add(rail);
    const glow = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 220, 0.07, 4, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(1.1), toneMapped: false })
    );
    glow.scale.setScalar(1.002);
    scene.add(glow);
    // support pylons down to terrain every ~15°
    const pylons = [];
    for (let i = 0; i < 24; i++) {
      const d = circleAt(i / 24 * Math.PI * 2);
      const ground = planet.terrainHeight(d);
      const len = RAIL_R - ground;
      if (len < 2) continue;
      const g = new THREE.CylinderGeometry(0.24, 0.4, len, 6);
      g.translate(0, len / 2, 0);
      const f = new THREE.Matrix4();
      const { up, east, north } = tangentFrame(d);
      f.makeBasis(east, up, north).setPosition(up.clone().multiplyScalar(ground - 0.3));
      g.applyMatrix4(f);
      pylons.push(g);
    }
    if (pylons.length) {
      const merged = new THREE.BufferGeometry();
      // quick merge (positions+normals only)
      let vtx = 0;
      for (const g of pylons) { const c = g.toNonIndexed(); g.userData._c = c; vtx += c.attributes.position.count; }
      const pos = new Float32Array(vtx * 3), nor = new Float32Array(vtx * 3);
      let o = 0;
      for (const g of pylons) {
        const c = g.userData._c;
        pos.set(c.attributes.position.array, o * 3);
        nor.set(c.attributes.normal.array, o * 3);
        o += c.attributes.position.count;
      }
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: 0x241e46, roughness: 0.5, metalness: 0.5 }));
      mesh.castShadow = true;
      scene.add(mesh);
    }
  }

  // ── stations: nearest circle point to three districts ──
  function stationAngleFor(dir) {
    // project onto circle plane, find angle in (u, w) basis
    const p = dir.clone().addScaledVector(n, -dir.dot(n)).normalize();
    return Math.atan2(p.dot(w), p.dot(u));
  }
  const stations = ['market', 'circuit', 'ruins'].map(key => {
    const d = planet.districts.find(x => x.key === key);
    const a = stationAngleFor(d.dir);
    const dir = circleAt(a);
    return { key, name: d.name + ' LOOP', angle: a, dir: dir.clone() };
  }).sort((p, q) => p.angle - q.angle);

  const platGroup = new THREE.Group();
  const platMat = new THREE.MeshStandardMaterial({ color: 0x241e4e, roughness: 0.6, metalness: 0.4 });
  for (const st of stations) {
    const up = st.dir.clone();
    // rail tangent + a RIGHT-handed frame (X=tang, Y=up, Z=tang×up) —
    // a left-handed basis here mirrors everything placed with it
    const tang = _v.copy(circleAt(st.angle + 0.02)).sub(circleAt(st.angle - 0.02)).normalize();
    const side = new THREE.Vector3().crossVectors(tang, up).normalize();
    const platH = RAIL_R - 1.2;
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

    // canopy on posts — the stop should read as a STATION from a distance
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 3.4), platMat);
    canopy.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 3.6, 0).premultiply(fm));
    platGroup.add(canopy);
    for (const px of [-4, 4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.6, 0.22), platMat);
      post.applyMatrix4(new THREE.Matrix4().makeTranslation(px, 1.9, 1.3).premultiply(fm));
      platGroup.add(post);
    }
    // glowing name bar under the canopy edge + a tall beacon mast
    const nameBar = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.5, 0.14),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(1.15), toneMapped: false }));
    nameBar.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 3.1, 1.7).premultiply(fm));
    platGroup.add(nameBar);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 5), platMat);
    mast.applyMatrix4(new THREE.Matrix4().makeTranslation(5.6, 3, 1.4).premultiply(fm));
    platGroup.add(mast);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.magenta).multiplyScalar(1.3), toneMapped: false }));
    beacon.applyMatrix4(new THREE.Matrix4().makeTranslation(5.6, 6.2, 1.4).premultiply(fm));
    platGroup.add(beacon);

    // live ETA holo board — NEXT m:ss / BOARDING :ss (NC station signs)
    const [cv, ctx] = makeCanvas(512, 128);
    const tex = canvasTexture(cv);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    board.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 2.5, 1.78).premultiply(fm));
    platGroup.add(board);
    st.eta = { cv, ctx, tex };

    // ── access ramp: segmented so it follows the sphere down to the
    // street (solid slopes — stairs read as walls to the controller) ──
    const groundH = planet.terrainHeight(st.dir);
    const rise = platH - groundH;
    if (rise > 1.5) {
      const grade = 0.42;                       // rise per horizontal unit
      const run = rise / grade;                 // total horizontal run
      const segs = Math.max(3, Math.ceil(run / 4));
      const segRun = run / segs, segRise = rise / segs;
      const segLen = Math.hypot(segRun, segRise) + 0.6;   // overlap seals seams
      const pitch = Math.atan2(segRise, segRun);
      // ramp endpoints for wayfinding (the demo pilot walks foot → top)
      {
        const aFoot = (6 + run) / RAIL_R;
        const dF = circleAt(st.angle + aFoot);
        const sF = _v3.crossVectors(_v2.copy(circleAt(st.angle + aFoot + 0.01)).sub(circleAt(st.angle + aFoot - 0.01)).normalize(), dF).normalize();
        st.rampFoot = dF.clone().multiplyScalar(groundH + 0.4).addScaledVector(sF, 2.2);
        st.rampTop = st.boardPos.clone();
      }
      for (let i = 0; i <= segs; i++) {
        // arc-length along the rail from the platform end, at descending height
        const aOff = (6 + (i + 0.5) * segRun) / RAIL_R;
        const d = circleAt(st.angle + aOff);
        const su = d.clone();
        const stang = _v2.copy(circleAt(st.angle + aOff + 0.01)).sub(circleAt(st.angle + aOff - 0.01)).normalize();
        const sside = _v3.crossVectors(stang, su).normalize();
        const h = platH - (i + 0.5) * segRise;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.5, 2.6), platMat);
        seg.receiveShadow = true;
        const sm = new THREE.Matrix4().makeBasis(stang, su.clone(), sside)
          .setPosition(su.clone().multiplyScalar(h).addScaledVector(sside, 2.2));
        seg.applyMatrix4(new THREE.Matrix4().makeRotationZ(-pitch).premultiply(sm));
        platGroup.add(seg);
        // guard rail glow so the way up is legible at night
        const rail2 = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.07, 0.07),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.amber).multiplyScalar(1.1), toneMapped: false }));
        rail2.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1.0, 1.25).premultiply(
          new THREE.Matrix4().makeRotationZ(-pitch).premultiply(sm)));
        platGroup.add(rail2);
      }
    }
  }
  scene.add(platGroup);
  // ramps + platforms must be walkable → fold into the collision BVH
  planet.addColliders(platGroup);

  // ── the train: 3 cars chasing an angle around the loop.
  // Cars are authored nose-forward along +Z (the travel direction). ──
  const CAR_GAP = 0.055;   // radians between cars
  const cars = [];
  for (let i = 0; i < 3; i++) {
    const car = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x35306a, roughness: 0.3, metalness: 0.75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.7, 5.0), bodyMat);
    body.position.z = -0.3;
    body.castShadow = true;
    car.add(body);
    // tapered nose — the train visibly LEADS with the front car
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.95, 1.3, 4, 1), bodyMat);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, 0, 2.8);
    nose.castShadow = true;
    car.add(nose);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 4.4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(1.05), toneMapped: false }));
    glass.position.set(0, 0.35, -0.3);
    car.add(glass);
    // headlight (front, warm) + tail lamp (rear, red)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.amber).multiplyScalar(1.4), toneMapped: false }));
    head.position.set(0, -0.15, 3.3);
    car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2e4d).multiplyScalar(1.2), toneMapped: false }));
    tail.position.set(0, 0, -2.85);
    car.add(tail);
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 5.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(i === 0 ? NEON.magenta : NEON.purple).multiplyScalar(1.15), toneMapped: false }));
    skid.position.y = -1.05;
    car.add(skid);
    scene.add(car);
    cars.push(car);
  }
  const train = {
    angle: stations[0].angle,
    speed: 0,
    cruise: 0.062,          // rad/s ≈ 26 u/s at RAIL_R
    state: 'dwell',         // dwell | run
    dwellT: 6,
    nextIdx: 1,
  };
  function placeCar(car, a) {
    const d = circleAt(a);
    const up = d.clone();
    const tang = _v.copy(circleAt(a + 0.01)).sub(circleAt(a - 0.01)).normalize();
    // RIGHT-handed basis with +Z along travel: X=up×tang, Y=up, Z=tang
    // (X×Y = (up×tang)×up = tang = Z). The old left-handed basis mirrored
    // the car and pointed it the wrong way down the rail.
    const side = _v2.crossVectors(up, tang).normalize();
    _m.makeBasis(side, up, tang).setPosition(up.clone().multiplyScalar(RAIL_R + 1.15));
    car.position.setFromMatrixPosition(_m);
    car.quaternion.setFromRotationMatrix(_m);
  }

  // ── ambient air traffic: tilted orbit lanes ──
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
        r: R + 15 + rnd() * 9, a: rnd() * Math.PI * 2,
        sp: (0.05 + rnd() * 0.05) * (rnd() < 0.5 ? 1 : -1),
      });
    }
  }

  // ── pilotable vehicles ──
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
  parkVehicle('av', 'market', -3, 6, NEON.cyan);       // fly free
  parkVehicle('av', 'ruins', 4, -5, NEON.magenta);     // fly free
  parkVehicle('speeder', 'dunes', 1.5, 5.5, NEON.amber); // hugs the ground

  // ── ground traffic: speeders running the actual street chains ──
  const groundCars = [];
  let carBodies = null, carGlows = null;
  {
    const chains = [...planet.pathChains].sort((a, b) => b.length - a.length).slice(0, 5);
    const N = 14;
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
        speed: 2.2 + rnd() * 1.6,           // samples/sec along the chain
      });
      carGlows.setColorAt(i, new THREE.Color(pick(rnd, NEON_LIST)).multiplyScalar(1.2));
    }
    if (carGlows.instanceColor) carGlows.instanceColor.needsUpdate = true;
    scene.add(carBodies);
    scene.add(carGlows);
  }
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
    const side = _gv.crossVectors(up, tang).normalize();   // X = up×tang → right-handed with Z=tang
    const h = planet.terrainHeight(_v) + 0.5;
    _m.makeBasis(side, up, tang).setPosition(up.x * h, up.y * h, up.z * h);
    carBodies.setMatrixAt(i, _m);
    carGlows.setMatrixAt(i, _m2.makeTranslation(0, -0.28, 0).premultiply(_m));
  }
  const _gv = new THREE.Vector3(), _m2 = new THREE.Matrix4();

  // ── station ETA boards ──
  let etaClock = 0;
  function drawETA() {
    const atIdx = (train.nextIdx + stations.length - 1) % stations.length;
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      if (!st.eta) continue;
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
      if (train.state === 'dwell' && i === atIdx) {
        msg = `▶ BOARDING  :0${Math.max(0, Math.ceil(train.dwellT))}`.slice(0, 24);
        hue = '#5dffb2';
      } else {
        let raw = st.angle - (train.angle % (Math.PI * 2));
        while (raw < 0) raw += Math.PI * 2;
        while (raw >= Math.PI * 2) raw -= Math.PI * 2;
        let stops = 0;
        for (const s2 of stations) {
          if (s2 === st) continue;
          let d2 = s2.angle - (train.angle % (Math.PI * 2));
          while (d2 < 0) d2 += Math.PI * 2;
          while (d2 >= Math.PI * 2) d2 -= Math.PI * 2;
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

  // ── API ──
  return {
    stations, train, cars, vehicles,

    // a train is boardable if it's dwelling and you're on the platform
    boardableStation(pos) {
      if (train.state !== 'dwell') return null;
      const st = stations[(train.nextIdx + stations.length - 1) % stations.length];
      if (pos.distanceTo(st.boardPos) < 7) return st;
      for (const c of cars) if (pos.distanceTo(c.position) < 4.5) return st;
      return null;
    },
    dwelling() { return train.state === 'dwell'; },
    carAnchor(out) {
      // riders stand on the middle car
      out.copy(cars[1].position).addScaledVector(_v.copy(cars[1].position).normalize(), 1.7);
      return out;
    },
    carForward(out) {
      const a = train.angle - CAR_GAP;
      out.copy(circleAt(a + 0.01)).sub(circleAt(a - 0.01)).normalize();
      return out;
    },
    vehicleNear(pos) {
      for (const v of vehicles) {
        if (!v.occupied && pos.distanceTo(v.grp.position) < 4.2) return v;
      }
      return null;
    },

    update(dt, t, playerPos) {
      // ── train state machine ──
      if (train.state === 'dwell') {
        train.dwellT -= dt;
        train.speed = 0;
        if (train.dwellT <= 0) {
          train.state = 'run';
          audio.sfx('doors');
        }
      } else {
        const target = stations[train.nextIdx].angle;
        let delta = target - train.angle;
        while (delta < 0) delta += Math.PI * 2;
        while (delta > Math.PI * 2) delta -= Math.PI * 2;
        // ease in/out near stations
        const easedMax = clamp(delta * 0.8, 0.012, train.cruise);
        train.speed = lerp(train.speed, easedMax, dt * 1.4);
        train.angle += train.speed * dt;
        if (delta < 0.006) {
          train.state = 'dwell';
          train.dwellT = 8;
          train.nextIdx = (train.nextIdx + 1) % stations.length;
          audio.sfx('chime');
        }
      }
      for (let i = 0; i < cars.length; i++) placeCar(cars[i], train.angle - i * CAR_GAP);

      // ── ambient traffic ──
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

      // ── ground traffic along the street chains ──
      for (let i = 0; i < groundCars.length; i++) {
        const car = groundCars[i];
        car.s += car.speed * car.dirF * dt;
        if (car.s >= car.chain.length - 1.01) { car.s = car.chain.length - 1.01; car.dirF = -1; }
        if (car.s <= 0.01) { car.s = 0.01; car.dirF = 1; }
        placeGroundCar(i, car);
      }
      carBodies.instanceMatrix.needsUpdate = true;
      carGlows.instanceMatrix.needsUpdate = true;

      // ── ETA boards at ~3 Hz ──
      etaClock -= dt;
      if (etaClock <= 0) { etaClock = 0.34; drawETA(); }
    },
  };
}
