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
import { C, NEON, NEON_LIST, mulberry32, pick, clamp, lerp, sphDir, tangentFrame } from './config.js';

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
  for (const st of stations) {
    const { up, east, north } = tangentFrame(st.dir);
    // platform beside the rail
    const f = new THREE.Matrix4().makeBasis(east, up, north)
      .setPosition(up.clone().multiplyScalar(RAIL_R - 1.2));
    // orient platform so its long axis follows the rail tangent
    const tang = _v.copy(circleAt(st.angle + 0.02)).sub(circleAt(st.angle - 0.02)).normalize();
    const side = new THREE.Vector3().crossVectors(up, tang).normalize();
    const fm = new THREE.Matrix4().makeBasis(tang, up.clone(), side)
      .setPosition(up.clone().multiplyScalar(RAIL_R - 1.2).addScaledVector(side, 2.2));
    const plat = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 3.2),
      new THREE.MeshStandardMaterial({ color: 0x241e4e, roughness: 0.6, metalness: 0.4 }));
    plat.applyMatrix4(fm);
    plat.castShadow = plat.receiveShadow = true;
    platGroup.add(plat);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(10, 0.08, 0.16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.amber).multiplyScalar(1.2), toneMapped: false }));
    strip.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.34, -1.5).premultiply(fm));
    platGroup.add(strip);
    st.platformPos = new THREE.Vector3().setFromMatrixPosition(fm).addScaledVector(up, 0.6);
    st.boardPos = st.platformPos.clone();

    // switchback stair tower from ground to platform
    const groundH = planet.terrainHeight(st.dir);
    const rise = (RAIL_R - 1.2) - groundH;
    const flights = Math.max(2, Math.round(rise / 4.5));
    for (let fl = 0; fl < flights; fl++) {
      const y0 = groundH + fl * rise / flights;
      const dirF = fl % 2 ? 1 : -1;
      for (let s = 0; s < 8; s++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.8),
          plat.material);
        const local = new THREE.Matrix4().makeBasis(tang, up.clone(), side)
          .setPosition(up.clone().multiplyScalar(y0 + (s + 0.5) * rise / flights / 8)
            .addScaledVector(side, 4.4)
            .addScaledVector(tang, dirF * (s * 0.55 - 2.2)));
        step.applyMatrix4(local);
        platGroup.add(step);
      }
      // landing
      const land = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 1.6), plat.material);
      land.applyMatrix4(new THREE.Matrix4().makeBasis(tang, up.clone(), side)
        .setPosition(up.clone().multiplyScalar(y0 + rise / flights)
          .addScaledVector(side, 4.4).addScaledVector(tang, dirF * 2.6)));
      platGroup.add(land);
    }
  }
  scene.add(platGroup);
  // stairs + platforms must be walkable → fold into the collision BVH
  planet.addColliders(platGroup);

  // ── the train: 3 cars chasing an angle around the loop ──
  const CAR_GAP = 0.055;   // radians between cars
  const cars = [];
  for (let i = 0; i < 3; i++) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.7, 5.6),
      new THREE.MeshStandardMaterial({ color: 0x35306a, roughness: 0.3, metalness: 0.75 }));
    body.castShadow = true;
    car.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 5.0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(1.05), toneMapped: false }));
    glass.position.y = 0.35;
    car.add(glass);
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
    const side = _v2.crossVectors(up, tang).normalize();
    _m.makeBasis(tang, up, side).setPosition(up.clone().multiplyScalar(RAIL_R + 1.15));
    car.position.setFromMatrixPosition(_m);
    car.quaternion.setFromRotationMatrix(_m);
    // cars face along +x of that basis; rotate body so length runs along tangent
    car.rotateY(Math.PI / 2);
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

  // ── API ──
  return {
    stations, train, cars, vehicles,

    // a train is boardable if it's dwelling and you're on the platform
    boardableStation(pos) {
      if (train.state !== 'dwell') return null;
      const st = stations[(train.nextIdx + stations.length - 1) % stations.length];
      return pos.distanceTo(st.boardPos) < 5 ? st : null;
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
    },
  };
}
