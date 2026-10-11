// =============================================================================
// SCALE PROBE — body sizes and spacing, for `scripts/shot.mjs --eval`.
//   node scripts/shot.mjs --root . --out .critic/scale2 --name probe --mode play \
//        --shots 12 --size 1280x720 --eval scripts/scale-probe.js
// Prints one JSON line: per kind { n, r:[min,p10,med,p90,max], host:[...], near:[...] }
// plus a spacing audit. Radius = _hyBodyR(body) x world scale (the one true radius).
// Kinds: sol-planet, sol-moon, sun, galaxy-planet, galaxy-star, gateway-*,
// nebula-planet, nebula-star, heart-world, outer-planet, outer-star, proc-planet,
// proc-moon, proc-star, moon (other), blackhole, other.
// =============================================================================
const ie = eval;
const P = ie('planets'), V = THREE.Vector3;
const sol = window.localSystemOffset;
const solV = new V(sol.x, sol.y, sol.z);
const ws = new V(), wp = new V();
const trueR = (o) => {
    let r = (typeof _hyBodyR === 'function') ? _hyBodyR(o) : ((o.geometry && o.geometry.parameters && o.geometry.parameters.radius) || (o.userData && o.userData.radius) || 0);
    o.getWorldScale(ws);
    return r * Math.max(ws.x, ws.y, ws.z);
};
const bodies = [];
const sysKey = (u, o) => {
    if (u.systemCenter && u.systemCenter === sol) return 'sol';
    if (u.isLocalStar) return 'sol';
    if (u.isProcedural) return 'proc' + u.procSystem;
    if (u.heartWorld) return 'heart' + u.nebulaId;
    if (u.parentPlanet) return sysKey(u.parentPlanet.userData, u.parentPlanet);
    if (u.systemCenter) return 'sc' + Math.round(u.systemCenter.x) + ',' + Math.round(u.systemCenter.z);
    if (u.clusterCenter && u.nebulaId !== undefined) return 'sc' + Math.round(o.position.x) + ',' + Math.round(o.position.z);
    if (u.type === 'blackhole') return 'bh' + o.id;
    if (u.type === 'star') return 'sc' + Math.round(o.position.x) + ',' + Math.round(o.position.z);
    return 'solo' + o.id;
};
const kindOf = (u) => {
    const pre = u.isProcedural ? 'proc' : (u.nebulaId !== undefined ? 'nebula' : (u.isLocalGateway ? 'gateway' : (typeof u.galaxyId === 'number' ? 'galaxy' : null)));
    if (u.type === 'blackhole') return 'blackhole';
    if (u.heartWorld) return 'heart-world';
    if (u.isLocalStar || (u.type === 'star' && u.systemCenter === sol)) return 'sun';
    if (u.systemCenter === sol || (u.parentPlanet && u.parentPlanet.userData.systemCenter === sol)) return u.parentPlanet ? 'sol-moon' : 'sol-planet';
    const cls = u.type === 'star' ? 'star' : ((u.parentPlanet || u.bodyClass === 'moon' || u.type === 'moon') ? 'moon' : 'planet');
    return (pre || 'local') + '-' + cls;
};
for (const o of P) {
    const u = o && o.userData;
    if (!u || u.type === 'asteroid' || u.isAsteroid) continue;
    if (!o.isMesh && !o.isGroup && !o.isObject3D) continue;
    o.getWorldPosition(wp);
    let host = null;
    if (u.parentPlanet) host = u.parentPlanet.getWorldPosition(new V());
    else if (u.pgParent) host = u.pgParent.getWorldPosition(new V());
    else if (u.systemCenter) host = new V(u.systemCenter.x, u.systemCenter.y, u.systemCenter.z);
    bodies.push({ o, k: kindOf(u), s: sysKey(u, o), r: trueR(o), p: wp.clone(), h: host ? wp.distanceTo(host) : null, name: u.name || '' });
}
// outer interstellar systems: groups not in planets[]
(window.outerInterstellarSystems || []).forEach((g, gi) => {
    g.traverse((c) => {
        const u = c.userData || {};
        if (c === g || !c.isMesh) return;
        if (u.type !== 'star' && u.type !== 'planet' && u.type !== 'moon' && u.type !== 'outer_planet') return;
        if (P.indexOf(c) >= 0) return;
        c.getWorldPosition(wp);
        bodies.push({ o: c, k: 'outer-' + (u.type === 'star' ? 'star' : (u.type === 'moon' ? 'moon' : 'planet')), s: 'outer' + gi, r: trueR(c), p: wp.clone(), h: wp.distanceTo(g.getWorldPosition(new V())), name: u.name || '' });
    });
});
// nearest other body
for (let i = 0; i < bodies.length; i++) {
    let best = Infinity;
    const a = bodies[i];
    for (let j = 0; j < bodies.length; j++) {
        if (i === j) continue;
        const d = a.p.distanceTo(bodies[j].p) - bodies[j].r - a.r;
        if (d < best) best = d;
    }
    a.n = best;
}
const q = (arr) => {
    if (!arr.length) return null;
    arr = arr.slice().sort((x, y) => x - y);
    const at = (f) => Math.round(arr[Math.min(arr.length - 1, Math.floor(f * (arr.length - 1)))]);
    return [at(0), at(0.1), at(0.5), at(0.9), at(1)];
};
const kinds = {};
bodies.forEach((b) => { (kinds[b.k] = kinds[b.k] || []).push(b); });
const hist = {};
Object.keys(kinds).sort().forEach((k) => {
    const L = kinds[k];
    hist[k] = { n: L.length, r: q(L.map((b) => b.r)), host: q(L.filter((b) => b.h != null).map((b) => b.h)), near: q(L.map((b) => b.n)) };
});
// spacing audit
const K = (window.HY_SCALE && window.HY_SCALE.PLACE_K) || 8;
const CL = (window.HY_BH && window.HY_BH.CLEAR_RADII) || 6;
const big = bodies.filter((b) => b.r >= 60 && !/moon/.test(b.k));
let placeV = 0; const placeW = [];
for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) {
    const a = big[i], b = big[j];
    if (a.s === b.s) continue;
    if (a.k === 'blackhole' && b.k === 'blackhole') continue;
    // a galaxy's own systems vs its own core: that rule is CLEAR_RADII (bhV below)
    const own = (h, o) => h.k === 'blackhole' && o.k !== 'blackhole' && (
        (typeof o.o.userData.galaxyId === 'number' && o.o.userData.galaxyId === h.o.userData.galaxyId && !h.o.userData.isCompanionCore) ||
        (o.o.userData.isLocalGateway && h.o.userData.isLocalGateway));
    if (own(a, b) || own(b, a)) continue;
    const d = a.p.distanceTo(b.p), req = K * (a.r + b.r);
    if (d < req) { placeV++; placeW.push([Math.round(d / (a.r + b.r) * 10) / 10, a.name.slice(0, 22), b.name.slice(0, 22)]); }
}
placeW.sort((x, y) => x[0] - y[0]);
const holes = bodies.filter((b) => b.k === 'blackhole');
let bhV = 0; const bhW = [];
bodies.forEach((b) => {
    if (b.k === 'blackhole') return;
    holes.forEach((h) => {
        const d = b.p.distanceTo(h.p);
        if (d < CL * h.r) { bhV++; bhW.push([Math.round(d / h.r * 10) / 10, b.name.slice(0, 22), h.name.slice(0, 22)]); }
    });
});
bhW.sort((x, y) => x[0] - y[0]);
// asteroids inside a hole's clear zone (reported, not fixed here)
let rockBH = 0;
for (const o of P) {
    const u = o && o.userData;
    if (!u || u.type !== 'asteroid') continue;
    o.getWorldPosition(wp);
    for (const h of holes) if (wp.distanceTo(h.p) < CL * h.r) { rockBH++; break; }
}
// foreign bodies inside a nebula cloud
const NC = ie('typeof nebulaClouds !== "undefined" ? nebulaClouds : []');
let nebV = 0; const nebW = [];
NC.forEach((n, ni) => {
    const nr = (n.userData && n.userData.size) || 0;
    if (!nr) return;
    const c = n.getWorldPosition(new V());
    bodies.forEach((b) => {
        if (b.o.userData.nebulaId !== undefined || b.k === 'heart-world') return;
        const d = b.p.distanceTo(c);
        if (d < nr) { nebV++; if (nebW.length < 8) nebW.push([Math.round(d), Math.round(nr), b.k, b.name.slice(0, 20)]); }
    });
});
// extents
const bb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
bodies.forEach((b) => {
    const t = (window.trueDistanceFromOrigin && window.worldOriginOffset) ? b.p.clone().add(window.worldOriginOffset) : b.p;
    ['x', 'y', 'z'].forEach((a, i) => { bb.min[i] = Math.min(bb.min[i], t[a]); bb.max[i] = Math.max(bb.max[i], t[a]); });
});
bb.min = bb.min.map(Math.round); bb.max = bb.max.map(Math.round);
const cam = ie('camera');
const sun = bodies.find((b) => b.k === 'sun');
const start = { camToSun: sun ? Math.round(cam.position.distanceTo(sun.p)) : null, sunR: sun ? Math.round(sun.r) : null };
// nebula star systems: distance from their own cloud, in cloud radii
const nebSys = [];
bodies.forEach((b) => {
    const u = b.o.userData;
    if (b.k !== 'nebula-star' || !NC[u.nebulaId]) return;
    const n = NC[u.nebulaId], nr = (n.userData && n.userData.size) || 1;
    nebSys.push(Math.round(b.p.distanceTo(n.getWorldPosition(new V())) / nr * 100) / 100);
});
const nebSize = q(NC.map((n) => (n.userData && n.userData.size) || 0));
const cores = holes.filter((h) => h.o.userData.isGalacticCore && !h.o.userData.isCompanionCore && !h.o.userData.isSagittariusA);
const coreToSol = Math.round(Math.min(...cores.map((h) => h.p.distanceTo(solV))));
let coreGap = Infinity; cores.forEach((a, i) => cores.forEach((b, j) => { if (j > i) coreGap = Math.min(coreGap, a.p.distanceTo(b.p)); }));
coreGap = Math.round(coreGap);
const holesAt = holes.map((h) => [h.name.slice(0, 14), Math.round(h.r), Math.round(h.p.length() / 100) * 100]);
// what the camera sees of Sol right now: [name, distance, on-screen diameter px, in frame]
cam.updateMatrixWorld(); const _fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
const _H = (ie('renderer') && ie('renderer').domElement.clientHeight) || 720;
const solView = bodies.filter((b) => b.k === 'sol-planet' || b.k === 'sun').map((b) => {
    const d = b.p.distanceTo(cam.position);
    const px = 2 * Math.atan(b.r / Math.max(d, b.r + 1)) / (cam.fov * Math.PI / 180) * _H;
    return [b.name, Math.round(d), Math.round(px), _fr.intersectsSphere(new THREE.Sphere(b.p, b.r))];
});
const nebDist = NC.map((n) => Math.round(n.getWorldPosition(new V()).distanceTo(solV))).sort((a, b) => a - b);
return { hist, audit: { placeK: K, placeV, placeWorst: placeW.slice(0, 10), bhClear: CL, bhV, bhWorst: bhW.slice(0, 8), rockBH, nebV, nebWorst: nebW }, bbox: bb, start, sol: [sol.x, sol.z], nebFromSol: [nebDist[0], nebDist[Math.floor(nebDist.length / 2)], nebDist[nebDist.length - 1], nebDist.length], nebSize, nebSysInCloudRadii: q(nebSys), holesAt, coreToSol, coreGap, solEdge: window._hySolEdge && window._hySolEdge(), solView, far: cam.far, fog: ie('scene').fog ? [ie('scene').fog.near, ie('scene').fog.far] : null };
