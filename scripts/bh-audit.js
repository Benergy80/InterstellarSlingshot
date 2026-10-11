// =============================================================================
// BLACK-HOLE SYSTEM AUDIT — for `scripts/shot.mjs --eval` (package Q, bhplace).
//   node scripts/shot.mjs --root . --out .critic/bhplace --name audit --mode play \
//        --shots 10 --size 1280x720 --eval scripts/bh-audit.js
// Prints one JSON object: per black hole { name, g, pos (TRUE coords, k),
// R, swirl (outermost swirl/disc particle, in R), disc 5.6, clear 6, systems
// [name, dist in R, edge in R], belts [r0,r1 in R, n], rocks (min radii of any
// asteroid of that galaxy), table (getGalaxy3DPosition offset from the core),
// nearest core / nebula / outer system / Sol (centre distance, k) }, plus
// global checks: swirl overlaps, Sol planets vs Sgr A*, foreign bodies inside
// any hole's CLEAR_RADII, galaxy-id naming at each core.
// =============================================================================
const ie = eval;
const P = ie('planets'), V = THREE.Vector3;
const woo = window.worldOriginOffset || { x: 0, y: 0, z: 0 };
const T = (p) => new V(p.x + woo.x, p.y + woo.y, p.z + woo.z);   // current frame -> TRUE
const k1 = (n) => Math.round(n / 100) / 10;                         // world units -> k (1 dp)
const r1 = (n) => Math.round(n * 10) / 10;
const ws = new V();
const bodyR = (o) => {
    const r = (typeof _hyBodyR === 'function') ? _hyBodyR(o) : ((o.geometry && o.geometry.parameters && o.geometry.parameters.radius) || 0);
    o.getWorldScale(ws); return r * Math.max(ws.x, ws.y, ws.z);
};
const CL = (window.HY_BH && HY_BH.CLEAR_RADII) || 6;
const holes = P.filter((p) => p && p.userData && p.userData.type === 'blackhole');
const sol = window.localSystemOffset ? T(window.localSystemOffset) : null;
// swirl extent: outermost point of any Points child / large ring / dressing
const swirlOf = (bh) => {
    let ext = 0;
    const c = bh.getWorldPosition(new V());
    bh.updateMatrixWorld(true);
    const cand = new Set(bh.children);
    if (bh.userData.galaxyStars) cand.add(bh.userData.galaxyStars);
    if (bh.userData.starCluster) cand.add(bh.userData.starCluster);
    cand.forEach((ch) => {
        if (!ch || !ch.geometry || ch.userData.__hyFx) return;
        if (!(ch.isPoints || (ch.geometry.type === 'RingGeometry'))) return;
        const g = ch.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
        const bs = g.boundingSphere; ch.getWorldScale(ws);
        const wc = bs.center.clone().applyMatrix4(ch.matrixWorld);
        ext = Math.max(ext, wc.distanceTo(c) + bs.radius * Math.max(ws.x, ws.y, ws.z));
    });
    return ext;
};
const nebs = ((typeof nebulaClouds !== 'undefined' && nebulaClouds) || ie('typeof nebulaClouds!=="undefined"?nebulaClouds:[]'))
    .filter((n) => n && n.position && !(n.userData && n.userData.isEscort));
const outers = window.outerInterstellarSystems || [];
const stars = P.filter((p) => p && p.userData && p.userData.type === 'star' && !p.userData.isProcedural);
const sysPos = (s) => { const sc = s.userData.systemCenter; return sc ? T(sc) : T(s.getWorldPosition(new V())); };
// systems: the game's own grouping (_hyCollectSystems), edge = outermost orbit + reach
const COL = (typeof _hyCollectSystems === 'function') ? _hyCollectSystems() : { systems: [] };
const systemsOf = (bh) => COL.systems.filter((g) => g.own === bh).map((g) => ({
    name: (g.star && g.star.userData.name) || (g.members[0] && g.members[0].userData.name) || '?', c: T(g.center), edge: g.edge }));
const rocks = P.filter((p) => p && p.userData && (p.userData.type === 'asteroid' || p.userData.isAsteroid));
const out = { offset: [k1(woo.x), k1(woo.y), k1(woo.z)], holes: [], overlaps: [], intruders: [], sol: null };
const H = holes.map((bh) => {
    const u = bh.userData, R = bodyR(bh), c = T(bh.getWorldPosition(new V()));
    const sw = swirlOf(bh);
    const sys = (u.isSagittariusA || u.isCompanionCore) ? [] : systemsOf(bh);
    const sysExt = sys.reduce((m, s) => Math.max(m, s.c.distanceTo(c) + s.edge), 0);
    return { bh, u, R, c, sw, sys, ext: Math.max(sw, sysExt, CL * R) };
});
H.forEach((h) => {
    const u = h.u, R = h.R;
    const row = {
        name: u.name, g: u.galaxyId, kind: u.isSagittariusA ? 'sgr' : u.isCompanionCore ? 'companion' : u.isLocalGateway ? 'gateway' : (u.galaxyType && u.galaxyType.name) || '?',
        pos: [k1(h.c.x), k1(h.c.y), k1(h.c.z)], fromOrigin: k1(h.c.length()), R: Math.round(R),
        swirlR: r1(h.sw / R), discR: 5.6, clearR: CL, extentK: k1(h.ext),
        systems: h.sys.map((s) => [s.name.slice(0, 26), r1(s.c.distanceTo(h.c) / R), r1(s.edge / R)]),
    };
    // belts of this galaxy (not Sol's)
    if (u.isGalacticCore && !u.isCompanionCore && !u.isSagittariusA) {
        const mine = rocks.filter((a) => a.userData.galaxyId === u.galaxyId);
        const ds = mine.map((a) => T(a.getWorldPosition(new V())).distanceTo(h.c) / R).sort((a, b) => a - b);
        row.rocks = ds.length ? [ds.length, r1(ds[0]), r1(ds[Math.floor(ds.length / 2)]), r1(ds[ds.length - 1])] : [0];
    }
    if (typeof getGalaxy3DPosition === 'function' && typeof u.galaxyId === 'number' && u.isGalacticCore && !u.isCompanionCore) {
        row.tableOff = k1(T(getGalaxy3DPosition(u.galaxyId)).distanceTo(h.c));
    }
    let best = null;
    H.forEach((o) => { if (o === h) return; const d = o.c.distanceTo(h.c); if (!best || d < best[1]) best = [o.u.name.slice(0, 18), d, d - h.ext - o.ext]; });
    if (best) row.nearCore = [best[0], k1(best[1]), k1(best[2])];
    let nb = null; nebs.forEach((n) => { const d = T(n.getWorldPosition(new V())).distanceTo(h.c); if (!nb || d < nb[1]) nb = [(n.userData && n.userData.name || 'neb').slice(0, 18), d]; });
    if (nb) row.nearNebula = [nb[0], k1(nb[1])];
    let os = null; outers.forEach((o) => { const d = T(o.getWorldPosition(new V())).distanceTo(h.c); if (!os || d < os[1]) os = [(o.userData && o.userData.name || 'outer').slice(0, 18), d, (o.userData && o.userData._hyEdge) || 0]; });
    if (os) row.nearOuter = [os[0], k1(os[1]), k1(os[2])];
    if (sol) row.sol = k1(sol.distanceTo(h.c));
    // which galaxy the game says we are in at 8 R out from this hole
    if (typeof getCurrentGalaxyId === 'function' && typeof camera !== 'undefined') {
        const save = camera.position.clone();
        const _log = console.log; console.log = () => {};
        camera.position.copy(h.bh.getWorldPosition(new V())).add(new V(8 * R, 0, 0));
        try { row.idAt8R = getCurrentGalaxyId(); } catch (e) { row.idAt8R = 'err'; }
        console.log = _log; camera.position.copy(save);
    }
    out.holes.push(row);
});
// swirl/extent overlaps between holes
H.forEach((a, i) => H.forEach((b, j) => {
    if (j <= i) return;
    // the home galaxy (7): Sgr A*, the Companion and the Gateway share one swirl
    const home = (h) => h.u.isSagittariusA || h.u.isCompanionCore || h.u.isLocalGateway;
    if (home(a) && home(b)) return;
    const d = a.c.distanceTo(b.c);
    if (d < a.sw + b.sw) out.overlaps.push(['swirl', a.u.name.slice(0, 16), b.u.name.slice(0, 16), k1(d), k1(a.sw + b.sw)]);
    else if (d < a.ext + b.ext) out.overlaps.push(['extent', a.u.name.slice(0, 16), b.u.name.slice(0, 16), k1(d), k1(a.ext + b.ext)]);
}));
// foreign bodies inside any hole's CLEAR_RADII (non-asteroid bodies; asteroids counted)
H.forEach((h) => {
    let nRock = 0, minRock = Infinity;
    P.forEach((p) => {
        const u = p && p.userData; if (!u || p === h.bh || u.type === 'blackhole') return;
        const d = T(p.getWorldPosition(new V())).distanceTo(h.c) / h.R;
        if (d >= CL) return;
        if (u.type === 'asteroid' || u.isAsteroid) { nRock++; minRock = Math.min(minRock, d); return; }
        if (out.intruders.length < 30) out.intruders.push([h.u.name.slice(0, 16), (u.name || u.type || '?').slice(0, 24), r1(d)]);
    });
    if (nRock) out.intruders.push([h.u.name.slice(0, 16), 'asteroids x' + nRock, r1(minRock)]);
});
// Sol vs Sgr A*
const sgr = H.find((h) => h.u.isSagittariusA);
if (sol && sgr) {
    const pl = P.filter((p) => p && p.userData && p.userData.systemCenter === window.localSystemOffset && !p.userData.parentPlanet);
    out.sol = { pos: [k1(sol.x), k1(sol.y), k1(sol.z)], toSgrK: k1(sol.distanceTo(sgr.c)),
        edge: Math.round(window._hySolEdge ? window._hySolEdge() : 0),
        planetsInSgrR: pl.map((p) => [(p.userData.name || '').slice(0, 8), r1(T(p.getWorldPosition(new V())).distanceTo(sgr.c) / sgr.R), Math.round(p.userData.orbitRadius || 0)]).sort((a, b) => a[1] - b[1]).slice(0, 4) };
    const gw = H.find((h) => h.u.isLocalGateway);
    if (gw) out.sol.gatewayK = k1(gw.c.distanceTo(sol));
}
// asteroid rocks inside ARRIVE-style body clearance (3 radii) of any non-Sol star / planet
let rockHits = 0; const hitBy = {};
const bodies = P.filter((p) => p && p.userData && (p.userData.type === 'star' || p.userData.type === 'planet') && !p.userData.isLocal && !p.userData.isLocalStar && bodyR(p) > 100)
    .map((p) => ({ c: T(p.getWorldPosition(new V())), r: bodyR(p), n: (p.userData.name || '').slice(0, 20) }));
rocks.forEach((a) => { const q = T(a.getWorldPosition(new V())); for (const bd of bodies) { if (q.distanceTo(bd.c) < 3 * bd.r) { rockHits++; hitBy[bd.n] = (hitBy[bd.n] || 0) + 1; break; } } });
out.rocksNearBodies = [rockHits, Object.entries(hitBy).slice(0, 8)];
out.layout = window.__hyGalaxyLayout || null;
out.counts = { holes: H.length, nebulae: nebs.length, outers: outers.length, rocks: rocks.length, far: (typeof camera !== 'undefined') ? camera.far : 0 };
return out;
