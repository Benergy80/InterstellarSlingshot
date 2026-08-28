// ════════════════════════════════════════════════════════════════
// VOLKARIS — HUD: objective, sector readout, suit bars, toasts,
// crosshair, hit vignette, pause/death/win overlays.
// ════════════════════════════════════════════════════════════════
export function createHUD() {
  const $ = (id) => document.getElementById(id);
  const el = {
    launch: $('launch'), status: $('launch-status'), btnEnter: $('btn-enter'),
    hud: $('hud'), sector: $('sector'), objective: $('objective'),
    hp: $('bar-hp'), energy: $('bar-energy'), hover: $('bar-hover'),
    clock: $('clock'), toast: $('toast'), toastTitle: $('toast-title'), toastSub: $('toast-sub'),
    vignette: $('vignette'), pause: $('pause'), win: $('win'), crosshair: $('crosshair'),
    prompt: $('prompt'),
  };
  let toastTimer = null;

  // ── monorail map: an azimuthal "you are here" transit map ──
  const MAP_R = 96;                 // canvas half-size
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = mapCanvas.height = MAP_R * 2;
  mapCanvas.id = 'monomap';
  mapCanvas.style.cssText =
    'position:fixed;right:20px;bottom:110px;width:172px;height:172px;z-index:11;' +
    'border-radius:50%;pointer-events:none;opacity:0;transition:opacity 0.4s;' +
    'background:radial-gradient(circle,rgba(8,4,26,0.82),rgba(8,4,26,0.62));' +
    'box-shadow:0 0 18px rgba(0,246,255,0.25),inset 0 0 20px rgba(0,0,0,0.5);';
  (document.getElementById('hud') || document.body).appendChild(mapCanvas);
  const mctx = mapCanvas.getContext('2d');
  let transitRef = null;
  const _MP = { fwd: null };
  // project a unit direction Q into map-local x,y around player dir P,
  // with player.heading as map-north. Returns null if on the far side.
  function projectDir(Q, P, fwd, right) {
    const dot = Math.max(-1, Math.min(1, Q.x * P.x + Q.y * P.y + Q.z * P.z));
    const theta = Math.acos(dot);
    if (theta > 2.0) return null;                       // beyond ~115° — off-map
    // tangent component of Q at P
    const tx = Q.x - dot * P.x, ty = Q.y - dot * P.y, tz = Q.z - dot * P.z;
    const a = tx * fwd.x + ty * fwd.y + tz * fwd.z;      // forward
    const b = tx * right.x + ty * right.y + tz * right.z; // right
    const bearing = Math.atan2(b, a);
    const rr = (theta / 2.0) * (MAP_R - 10);
    return [MAP_R + rr * Math.sin(bearing), MAP_R - rr * Math.cos(bearing)];
  }
  function drawMonoMap(player) {
    if (!transitRef) return;
    const s = player.state;
    const riding = s.mode === 'ride';
    mapCanvas.style.opacity = riding ? '1' : '0.5';
    mapCanvas.style.width = mapCanvas.style.height = riding ? '210px' : '150px';
    const P = s.pos.clone().normalize();
    const up = P;
    // map-north = player heading (tangent); right = fwd × up
    const fwd = s.heading.clone();
    fwd.addScaledVector(up, -(fwd.x * up.x + fwd.y * up.y + fwd.z * up.z));
    const fl = Math.hypot(fwd.x, fwd.y, fwd.z) || 1; fwd.multiplyScalar(1 / fl);
    const right = { x: fwd.y * up.z - fwd.z * up.y, y: fwd.z * up.x - fwd.x * up.z, z: fwd.x * up.y - fwd.y * up.x };
    mctx.clearRect(0, 0, MAP_R * 2, MAP_R * 2);
    // rim + heading tick
    mctx.strokeStyle = 'rgba(0,246,255,0.35)'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(MAP_R, MAP_R, MAP_R - 3, 0, Math.PI * 2); mctx.stroke();
    // lines
    const ridingKey = transitRef.ridingLineKey ? transitRef.ridingLineKey() : null;
    for (const line of transitRef.lines) {
      const isRiding = line.key === ridingKey;
      mctx.strokeStyle = cssHex(line.hex);
      mctx.lineWidth = isRiding ? 5 : (riding ? 3 : 2);
      mctx.globalAlpha = isRiding ? 1 : (ridingKey ? 0.4 : 0.9);   // dim the others while aboard
      if (isRiding) { mctx.shadowColor = cssHex(line.hex); mctx.shadowBlur = 8; }
      else mctx.shadowBlur = 0;
      mctx.beginPath();
      let started = false;
      const N = 120;
      for (let i = 0; i <= N; i++) {
        const pt = line.curve.getPointAt((i / N) % 1);
        const q = pt.clone().normalize();
        const xy = projectDir(q, P, fwd, right);
        if (!xy) { started = false; continue; }
        if (!started) { mctx.moveTo(xy[0], xy[1]); started = true; }
        else mctx.lineTo(xy[0], xy[1]);
      }
      mctx.stroke();
      // stations
      for (const st of line.stations) {
        const xy = projectDir(st.dir, P, fwd, right);
        if (!xy) continue;
        mctx.globalAlpha = 1;
        mctx.fillStyle = cssHex(line.hex);
        mctx.beginPath(); mctx.arc(xy[0], xy[1], 3.5, 0, Math.PI * 2); mctx.fill();
        mctx.strokeStyle = 'rgba(255,255,255,0.85)'; mctx.lineWidth = 1.5; mctx.stroke();
      }
      // live train (lead car)
      const car = line.cars[0];
      if (car) {
        const xy = projectDir(car.position.clone().normalize(), P, fwd, right);
        if (xy) {
          mctx.fillStyle = '#fff';
          mctx.beginPath(); mctx.arc(xy[0], xy[1], 2.6, 0, Math.PI * 2); mctx.fill();
        }
      }
    }
    mctx.globalAlpha = 1;
    mctx.shadowBlur = 0;
    // NEXT STOP readout while riding — a little sightseeing info
    if (riding && transitRef.riderNextStop) {
      const next = transitRef.riderNextStop();
      if (next) {
        mctx.font = '700 15px "Share Tech Mono", monospace';
        mctx.textAlign = 'center';
        mctx.fillStyle = 'rgba(8,4,26,0.7)';
        mctx.fillRect(6, MAP_R * 2 - 30, MAP_R * 2 - 12, 22);
        mctx.fillStyle = '#5dffb2';
        mctx.fillText('▶ ' + next, MAP_R, MAP_R * 2 - 14);
        mctx.textAlign = 'left';
      }
    }
    // player at centre, arrow pointing up (map-north = heading)
    mctx.fillStyle = '#5dffb2';
    mctx.beginPath();
    mctx.moveTo(MAP_R, MAP_R - 8);
    mctx.lineTo(MAP_R - 5, MAP_R + 6);
    mctx.lineTo(MAP_R + 5, MAP_R + 6);
    mctx.closePath(); mctx.fill();
  }
  function cssHex(h) { return '#' + ('000000' + (h >>> 0).toString(16)).slice(-6); }

  const api = {
    bindTransit(t) { transitRef = t; },
    setProgress(f, label) {
      if (el.status) el.status.textContent = label;
    },
    ready(onEnter) {
      el.status.textContent = 'DROP ZONE LOCKED — READY';
      el.btnEnter.disabled = false;
      el.btnEnter.textContent = 'DEPLOY THE CAPTAIN';
      el.btnEnter.addEventListener('click', () => {
        el.launch.classList.add('hidden');
        el.hud.classList.remove('hidden');
        onEnter();
      }, { once: true });
    },
    toast(title, sub = '') {
      el.toastTitle.textContent = title;
      el.toastSub.textContent = sub;
      el.toast.classList.remove('hidden');
      requestAnimationFrame(() => el.toast.classList.add('show'));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        el.toast.classList.remove('show');
        setTimeout(() => el.toast.classList.add('hidden'), 400);
      }, 3400);
    },
    hitFlash() {
      el.vignette.classList.add('hit');
      setTimeout(() => el.vignette.classList.remove('hit'), 160);
    },
    showPause(on) { el.pause.classList.toggle('hidden', !on); },
    showWin() {
      el.win.classList.remove('hidden');
      el.hud.classList.add('hidden');
    },
    setCrosshair(x, y) {
      el.crosshair.style.left = x + 'px';
      el.crosshair.style.top = y + 'px';
    },
    setLock(on, name) {
      el.crosshair.classList.toggle('lock', !!on);
      el.crosshair.textContent = on ? '◎' : '◈';
      el.sector.dataset.lock = on && name ? name : '';
    },
    setPrompt(text) {
      el.prompt.textContent = text ?? '';
      el.prompt.classList.toggle('hidden', !text);
    },
    update(player, planet, dayFactor, t) {
      const s = player.state;
      el.hp.style.width = `${(s.hp / 100) * 100}%`;
      el.energy.style.width = `${s.energy}%`;
      el.hover.style.width = `${(s.hoverFuel / 1.1) * 100}%`;
      const d = planet.districtAt(s.pos);
      el.sector.textContent = d ? d.name : 'THE WASTES';
      // day clock — sun icon flips to moon at night
      const hrs = ((t / 240) % 1) * 24;
      el.clock.textContent = `${dayFactor > 0.4 ? '☀' : '☾'} ${String(Math.floor(hrs)).padStart(2, '0')}:${String(Math.floor((hrs % 1) * 60)).padStart(2, '0')}`;
      drawMonoMap(player);
    },
  };
  window.VK_HUD = api;   // fx reaches the win screen through this
  return api;
}
