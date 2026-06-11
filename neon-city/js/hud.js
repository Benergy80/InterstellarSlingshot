// ════════════════════════════════════════════════════════════════
// NEON CITY — HUD
// Mirrors the mothergame's UI language: cyan panels, Orbitron
// headers, a round district radar (like its round galaxy map),
// achievement-style toasts, mouse-following crosshair, nav target
// diamond projected into the world.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { C, NEON } from './config.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export function createHUD() {
  const el = {
    launch: $('launch'), status: $('launch-status'), barFill: $('launch-bar-fill'),
    btnEnter: $('btn-enter'), btnDemo: $('btn-demo'),
    hud: $('hud'), pos: $('hud-pos'), speed: $('hud-speed'), fps: $('hud-fps'),
    clock: $('hud-clock'), wx: $('hud-wx'), sector: $('hud-sector'),
    targetName: $('hud-target-name'), targetDist: $('hud-target-dist'), mode: $('hud-mode'),
    barEnergy: $('bar-energy'), barHull: $('bar-hull'), barShield: $('bar-shield'), shieldState: $('shield-state'),
    crosshair: $('crosshair'), marker: $('target-marker'),
    markerLabel: document.querySelector('#target-marker .tm-label'),
    prompt: $('interact-prompt'), toast: $('toast'), toastTitle: $('toast-title'), toastSub: $('toast-sub'),
    demoBanner: $('demo-banner'), pause: $('pause-overlay'), shieldTint: $('shield-tint'),
    minimap: $('minimap'),
  };

  let toastTimer = null;
  let currentTarget = null;
  let clockBase = 23 * 60 + 47;
  let promptText = null;

  const hud = {
    // ── launch flow ──
    setProgress(pct, label) {
      el.barFill.style.width = `${(pct * 100) | 0}%`;
      if (label) el.status.innerHTML = `${label}<span class="dots"></span>`;
    },
    ready(onEnter, onDemo) {
      el.barFill.style.width = '100%';
      el.status.textContent = 'CITY GRID ONLINE — 11×11 BLOCKS · 2 RAIL LINES · 6 PADS';
      el.btnEnter.disabled = false;
      el.btnDemo.disabled = false;
      const go = (demo) => {
        el.launch.classList.add('fading');
        el.hud.classList.remove('hidden');
        setTimeout(() => el.launch.classList.add('hidden'), 1300);
        (demo ? onDemo : onEnter)();
      };
      el.btnEnter.addEventListener('click', () => go(false), { once: true });
      el.btnDemo.addEventListener('click', () => go(true), { once: true });
    },

    // ── messaging ──
    toast(title, sub = '') {
      el.toastTitle.textContent = title;
      el.toastSub.textContent = sub;
      el.toast.classList.remove('hidden');
      requestAnimationFrame(() => el.toast.classList.add('show'));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        el.toast.classList.remove('show');
        setTimeout(() => el.toast.classList.add('hidden'), 350);
      }, 3400);
    },
    setPrompt(text) {
      if (text === promptText) return;
      promptText = text;
      if (text) {
        el.prompt.textContent = text;
        el.prompt.classList.remove('hidden');
      } else {
        el.prompt.classList.add('hidden');
      }
    },
    setMode(text) { el.mode.textContent = text; },
    setDemo(on) { el.demoBanner.classList.toggle('hidden', !on); },
    showPause(on) { el.pause.classList.toggle('hidden', !on); },

    // ── crosshair (mouse-following, mothergame style) ──
    setCrosshair(x, y) {
      el.crosshair.style.left = `${x}px`;
      el.crosshair.style.top = `${y}px`;
    },
    setCrosshairInteract(on) { el.crosshair.classList.toggle('interact', on); },

    // ── status ──
    setShield(on) {
      el.shieldState.textContent = on ? 'ON' : 'OFF';
      el.shieldTint.classList.toggle('on', on);
    },
    setBars(state) {
      el.barEnergy.style.width = `${state.energy}%`;
      el.barHull.style.width = `${state.hull}%`;
      el.barShield.style.width = state.shield ? '100%' : '0%';
    },
    setTarget(poi) {
      currentTarget = poi;
      el.targetName.textContent = poi ? poi.name : '—';
      el.targetDist.textContent = poi ? (poi.desc || '') : '';
      el.marker.classList.toggle('hidden', !poi);
      if (poi) el.markerLabel.textContent = poi.name;
    },
    setWeather(rainOn) { el.wx.textContent = rainOn ? 'ACID RAIN ▼' : 'OVERCAST'; },

    // ── per-frame ──
    update(dt, t, player, traffic, camera, fps, world) {
      const p = player.state.pos;
      el.pos.textContent = `${p.x < 0 ? '−' : '+'}${Math.abs(p.x) | 0} ${p.z < 0 ? '−' : '+'}${Math.abs(p.z) | 0}`;
      if (world && world.districtAt) el.sector.textContent = world.districtAt(p.x, p.z).name;
      const spd = player.state.mode === 'ride' && player.state.ride
        ? player.state.ride.train.v : player.state.speed;
      el.speed.textContent = `${spd.toFixed(1)} m/s`;
      el.fps.textContent = `${fps | 0}`;
      const mins = (clockBase + t / 2.5) % (24 * 60);
      el.clock.textContent = `${String((mins / 60) | 0).padStart(2, '0')}:${String((mins % 60) | 0).padStart(2, '0')}`;

      // nav target distance + screen diamond
      if (currentTarget) {
        const d = p.distanceTo(currentTarget.pos);
        el.targetDist.textContent = `${d | 0} u — ${currentTarget.desc || ''}`;
        _v.copy(currentTarget.pos);
        _v.y += currentTarget.elevated ? 6 : 14;
        _v.project(camera);
        const behind = _v.z > 1;
        if (!behind && _v.x > -1.05 && _v.x < 1.05 && _v.y > -1.05 && _v.y < 1.05) {
          el.marker.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth - 9}px`;
          el.marker.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight - 9}px`;
          el.marker.style.opacity = '1';
        } else {
          el.marker.style.opacity = '0.0';
        }
      }
      drawMinimap(player, traffic);
    },
  };

  // ════════════════ MINIMAP (player-centered radar) ════════════════
  const mctx = el.minimap.getContext('2d');
  const RANGE = 360;     // world units shown across the radar
  const SZ = 220;

  // static layer: district tints + roads grid + rail rings + spaceport,
  // drawn once (after the world exists) at high res
  const staticCv = document.createElement('canvas');
  const STATIC_SZ = 1024;
  const WORLD_W = 1700;  // covers city + spaceport + margin
  hud.initMap = (world) => {
    const c = staticCv;
    c.width = c.height = STATIC_SZ;
    const x2px = (wx) => (wx + WORLD_W / 2) / WORLD_W * STATIC_SZ;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(2,10,18,0.92)';
    ctx.fillRect(0, 0, STATIC_SZ, STATIC_SZ);
    const H = C.HALF;
    // district tints
    if (world && world.districtOf) {
      const cellPx = C.CELL / WORLD_W * STATIC_SZ;
      const blockPx = C.BLOCK / WORLD_W * STATIC_SZ;
      for (let bx = 0; bx < C.GRID; bx++) for (let bz = 0; bz < C.GRID; bz++) {
        const D = world.districtOf(bx, bz);
        ctx.fillStyle = D.tint || 'rgba(0,240,255,0.06)';
        ctx.fillRect(x2px(-H + bx * C.CELL + C.ROAD / 2), x2px(-H + bz * C.CELL + C.ROAD / 2), blockPx, blockPx);
      }
    }
    // roads
    ctx.strokeStyle = 'rgba(0,240,255,0.30)';
    ctx.lineWidth = Math.max(1.5, C.ROAD / WORLD_W * STATIC_SZ * 0.55);
    for (let i = 1; i < C.GRID; i++) {
      const w = -H + i * C.CELL - C.ROAD / 2;
      ctx.beginPath(); ctx.moveTo(x2px(w), x2px(-H)); ctx.lineTo(x2px(w), x2px(H)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2px(-H), x2px(w)); ctx.lineTo(x2px(H), x2px(w)); ctx.stroke();
    }
    // city boundary
    ctx.strokeStyle = 'rgba(0,240,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x2px(-H), x2px(-H), (2 * H) / WORLD_W * STATIC_SZ, (2 * H) / WORLD_W * STATIC_SZ);
    // spaceport
    ctx.strokeStyle = 'rgba(255,179,0,0.55)';
    ctx.strokeRect(x2px(H + 6), x2px(-158), 262 / WORLD_W * STATIC_SZ, 316 / WORLD_W * STATIC_SZ);
    // monorail rings
    const ringRect = (i0, i1, color) => {
      const a = -H + i0 * C.CELL - C.ROAD / 2, b = -H + i1 * C.CELL - C.ROAD / 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x2px(a), x2px(a), (b - a) / WORLD_W * STATIC_SZ, (b - a) / WORLD_W * STATIC_SZ);
    };
    ringRect(4, 7, 'rgba(0,240,255,0.85)');
    ringRect(2, 9, 'rgba(255,43,214,0.85)');
    // enterable buildings — small lit squares
    if (world && world.interiors) {
      ctx.fillStyle = 'rgba(255,179,0,0.9)';
      for (const it of world.interiors) {
        const bb = it.bounds;
        ctx.fillRect(x2px((bb.minX + bb.maxX) / 2) - 2, x2px((bb.minZ + bb.maxZ) / 2) - 2, 4, 4);
      }
    }
    // plaza
    ctx.fillStyle = 'rgba(0,240,255,0.4)';
    ctx.beginPath(); ctx.arc(x2px(0), x2px(0), 4, 0, Math.PI * 2); ctx.fill();
  };
  hud.initMap(null);   // placeholder until the world exists

  function drawMinimap(player, traffic) {
    const p = player.state.pos;
    mctx.clearRect(0, 0, SZ, SZ);
    mctx.save();
    mctx.beginPath();
    mctx.arc(SZ / 2, SZ / 2, SZ / 2, 0, Math.PI * 2);
    mctx.clip();
    mctx.fillStyle = 'rgba(2,8,16,0.85)';
    mctx.fillRect(0, 0, SZ, SZ);

    const scale = SZ / RANGE;                       // px per world unit
    const sScale = (WORLD_W / STATIC_SZ);           // world units per static px
    const sw = RANGE / sScale;                      // static px across the view
    const sx = (p.x + WORLD_W / 2) / sScale - sw / 2;
    const sy = (p.z + WORLD_W / 2) / sScale - sw / 2;
    mctx.drawImage(staticCv, sx, sy, sw, sw, 0, 0, SZ, SZ);

    const toMap = (wx, wz, out) => {
      out[0] = (wx - p.x) * scale + SZ / 2;
      out[1] = (wz - p.z) * scale + SZ / 2;
    };
    const pt = [0, 0];

    // traffic dots
    if (traffic.carXZ) {
      mctx.fillStyle = 'rgba(190,210,255,0.8)';
      for (let i = 0; i < traffic.carXZ.length / 2; i += 2) {
        toMap(traffic.carXZ[i * 2], traffic.carXZ[i * 2 + 1], pt);
        if (pt[0] > 0 && pt[0] < SZ && pt[1] > 0 && pt[1] < SZ) mctx.fillRect(pt[0] - 1, pt[1] - 1, 2, 2);
      }
    }
    if (traffic.airXZ) {
      mctx.fillStyle = 'rgba(157,76,255,0.85)';
      for (let i = 0; i < traffic.airXZ.length / 2; i += 3) {
        toMap(traffic.airXZ[i * 2], traffic.airXZ[i * 2 + 1], pt);
        if (pt[0] > 0 && pt[0] < SZ && pt[1] > 0 && pt[1] < SZ) mctx.fillRect(pt[0] - 1.5, pt[1] - 1.5, 3, 3);
      }
    }
    // trains
    for (const tr of traffic.trains) {
      toMap(tr.headPos.x, tr.headPos.z, pt);
      mctx.fillStyle = `#${new THREE.Color(tr.color).getHexString()}`;
      mctx.beginPath(); mctx.arc(pt[0], pt[1], 3.2, 0, Math.PI * 2); mctx.fill();
    }
    // target POI
    if (currentTarget) {
      toMap(currentTarget.pos.x, currentTarget.pos.z, pt);
      const cx = Math.max(8, Math.min(SZ - 8, pt[0])), cy = Math.max(8, Math.min(SZ - 8, pt[1]));
      mctx.strokeStyle = 'rgba(255,179,0,0.95)';
      mctx.lineWidth = 1.6;
      mctx.save();
      mctx.translate(cx, cy);
      mctx.rotate(Math.PI / 4);
      mctx.strokeRect(-4, -4, 8, 8);
      mctx.restore();
    }
    // player arrow
    mctx.save();
    mctx.translate(SZ / 2, SZ / 2);
    mctx.rotate(-player.state.yaw);
    mctx.fillStyle = '#00f0ff';
    mctx.shadowColor = '#00f0ff';
    mctx.shadowBlur = 8;
    mctx.beginPath();
    mctx.moveTo(0, -7);
    mctx.lineTo(4.6, 5.5);
    mctx.lineTo(0, 3);
    mctx.lineTo(-4.6, 5.5);
    mctx.closePath();
    mctx.fill();
    mctx.restore();

    // radar sweep
    const tNow = performance.now() / 1000;
    const ang = (tNow * 0.8) % (Math.PI * 2);
    const grad = mctx.createConicGradient ? mctx.createConicGradient(ang, SZ / 2, SZ / 2) : null;
    if (grad) {
      grad.addColorStop(0, 'rgba(0,240,255,0.16)');
      grad.addColorStop(0.12, 'rgba(0,240,255,0)');
      grad.addColorStop(1, 'rgba(0,240,255,0)');
      mctx.fillStyle = grad;
      mctx.fillRect(0, 0, SZ, SZ);
    }
    mctx.restore();
  }

  return hud;
}
