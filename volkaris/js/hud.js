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

  const api = {
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
    },
  };
  window.VK_HUD = api;   // fx reaches the win screen through this
  return api;
}
