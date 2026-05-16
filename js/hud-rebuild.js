/* ============================================================================
   HUD REBUILD — driver for the rebuilt panels.
   Drives ONLY the new widgets from real game state. The legacy real-data IDs
   (velocity / distance / energyBar / hullBar / shipShieldStatus / rep / enemy
   / location / weapons / missiles / targetLock / galaxies) keep being written
   by game-ui.js updateUI(); this module never touches them.
   No fabricated values: every readout maps to a real gameState / autopilot /
   ship-attitude source, or shows "—" when that source is absent.
   ============================================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  // ── Orientation gizmo: a stylised wireframe dart rotated by real ship
  //    attitude (cameraState.playerShipMesh, fallback camera). ─────────────
  var GIZMO = [
    // nose -> tail spine
    [[0, 0, 1.4], [0, 0, -1.0]],
    // wings
    [[0, 0, -1.0], [-1.0, 0, -1.4]], [[0, 0, -1.0], [1.0, 0, -1.4]],
    [[-1.0, 0, -1.4], [0, 0, 1.4]], [[1.0, 0, -1.4], [0, 0, 1.4]],
    // vertical fin
    [[0, 0, -1.0], [0, 0.7, -1.4]], [[0, 0.7, -1.4], [0, 0, 1.4]],
    // belly
    [[0, 0, -1.0], [0, -0.5, -1.3]], [[0, -0.5, -1.3], [0, 0, 1.0]]
  ];

  function drawOrient() {
    var cv = $('hudOrientCanvas');
    if (!cv || typeof THREE === 'undefined') return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);

    var src = (window.cameraState && window.cameraState.playerShipMesh) ||
              (typeof camera !== 'undefined' ? camera : null);
    if (!src || !src.quaternion) return;

    var q = src.quaternion;
    var v = new THREE.Vector3();
    var cx = W / 2, cy = H / 2, scale = 52;

    function proj(p) {
      v.set(p[0], p[1], p[2]).applyQuaternion(q);
      return [cx + v.x * scale, cy - v.y * scale - v.z * 10];
    }

    // backdrop rings
    ctx.strokeStyle = 'rgba(47,212,255,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, 60, 30, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, 30, 60, 0, 0, Math.PI * 2); ctx.stroke();

    // wireframe
    ctx.strokeStyle = 'rgba(47,212,255,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (var i = 0; i < GIZMO.length; i++) {
      var a = proj(GIZMO[i][0]), b = proj(GIZMO[i][1]);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();

    // real forward vector (ship +Z) as the red attitude arrow
    var f = proj([0, 0, 1.7]);
    ctx.strokeStyle = '#ff3b54';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(f[0], f[1]); ctx.stroke();
    ctx.fillStyle = '#ff3b54';
    ctx.beginPath(); ctx.arc(f[0], f[1], 3, 0, Math.PI * 2); ctx.fill();

    // axis labels
    ctx.fillStyle = 'rgba(47,212,255,0.8)';
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.textAlign = 'center';
    ctx.fillText('YAW', cx, 12);
    ctx.fillText('PITCH', cx, H - 4);
    ctx.textAlign = 'right';
    ctx.fillText('ROLL', W - 4, cy);
  }

  // ── helpers ────────────────────────────────────────────────────────────
  function setRing(id, pct) {
    var el = $(id);
    if (!el) return;
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    el.style.setProperty('--p', pct);
    var t = pct + '%';
    if (el.textContent !== t) el.textContent = t;
  }
  function setText(id, t) {
    var el = $(id);
    if (el && el.textContent !== t) el.textContent = t;
  }
  function fmtTime(s) {
    s = Math.max(0, Math.round(s));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h > 0 ? p(h) + ':' : '') + p(m) + ':' + p(ss);
  }
  function buildTicks(ol, current, max, suffix) {
    if (!ol) return;
    var steps = 6, html = '';
    for (var i = steps; i >= 0; i--) {
      var val = (max / steps) * i;
      var label = max >= 100 ? Math.round(val) : val.toFixed(1);
      var near = Math.abs(val - current) <= (max / steps) / 2;
      html += '<li class="' + (near ? 'on' : '') + '">' + label + '</li>';
    }
    if (ol._sig !== html) { ol.innerHTML = html; ol._sig = html; }
  }

  // ── main loop ──────────────────────────────────────────────────────────
  var hideProbe = null;

  function tick() {
    requestAnimationFrame(tick);

    var gs = (typeof gameState !== 'undefined') ? gameState : window.gameState;
    drawOrient();

    if (gs) {
      var maxV = gs.maxVelocity || 4.0;
      var velPct = (gs.velocity || 0) / maxV * 100;
      setRing('velRing', velPct);

      var maxE = gs.maxEnergy || 100;
      setText('energyPct', Math.round(Math.max(0, Math.min(100, (gs.energy || 0) / maxE * 100))) + '%');

      var maxH = gs.maxHull || 100;
      var hullPct = Math.max(0, Math.min(100, (gs.hull || 0) / maxH * 100));
      setText('hullPct', Math.round(hullPct) + '%');

      // Shields: real source is shieldSystem (game-shields.js)
      var sb = $('shieldBar');
      if (sb) {
        var ss = (typeof shieldSystem !== 'undefined' && shieldSystem) ? shieldSystem : null;
        var spct = 0;
        if (ss) {
          if (typeof ss.strength === 'number') spct = Math.max(0, Math.min(100, ss.strength * 100));
          else if (ss.active) spct = 100;
        }
        sb.style.width = spct + '%';
      }

      setText('hudTitleGalaxies', (gs.galaxiesCleared || 0) + '/8');
      setRing('hudSlingRing', (gs.slingshotCharge || 0) * 100);

      // Sector mirrors the real region label written by the map code
      var reg = $('currentGalaxyRegion');
      if (reg) setText('hudSector', reg.textContent || '—');

      // Centre scales — live current value on a fixed ladder
      var kmh = (gs.velocity || 0) * 1000;
      buildTicks($('hudVelTicks'), kmh, Math.max(8000, Math.ceil(maxV * 1000 / 1000) * 1000));
      var distLy = gs.distance || 0;
      buildTicks($('hudDistTicks'), distLy, Math.max(2, Math.ceil(distLy * 1.3)));

      // ETA — only when a real target and real motion exist
      var eta = '—';
      var tgt = gs.currentTarget;
      if (tgt && tgt.position && typeof camera !== 'undefined' && (gs.velocity || 0) > 0.001) {
        var tp = new THREE.Vector3();
        if (tgt.getWorldPosition) tgt.getWorldPosition(tp); else tp.copy(tgt.position);
        var d = camera.position.distanceTo(tp);
        var perSec = (gs.velocity || 0) * 60;
        if (perSec > 0.0001) eta = fmtTime(d / perSec);
      }
      setText('hudEta', eta);
    }

    // Autopilot bar — real demoPilot status
    var bar = $('hudAutoBar');
    if (bar) {
      var dp = window.demoPilot;
      if (dp && dp.active) {
        bar.classList.remove('hud2-off');
        var st = dp.status || (dp.driving ? 'Course locked' : 'Standby');
        setText('hudAutoStatus', st);
      } else {
        bar.classList.add('hud2-off');
      }
    }

    // Mirror the HUD's own hide / mobile state onto the free-floating
    // centre overlays so "M / Hide UI" and mobile-mode also hide them.
    if (!hideProbe) hideProbe = document.querySelector('.ui-panel.hud2.bottom-left');
    var hidden = false;
    if (hideProbe) {
      var cs = getComputedStyle(hideProbe);
      hidden = hideProbe.classList.contains('hidden') ||
               cs.display === 'none' || cs.visibility === 'hidden' ||
               parseFloat(cs.opacity) < 0.05 || hideProbe.offsetParent === null;
    }
    var aux = document.querySelectorAll('.hud2-aux');
    for (var k = 0; k < aux.length; k++) aux[k].classList.toggle('hud2-off', hidden);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }
})();
