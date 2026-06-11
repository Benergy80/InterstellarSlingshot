// ════════════════════════════════════════════════════════════════
// NEON CITY — synthesized audio
// All Web Audio oscillators/noise, no asset files — same approach
// as the mothergame's synth SFX layer. Ambient city drone + rain
// bed + one-shot SFX (laser, missile, boom, jump, chime, thunder…).
// ════════════════════════════════════════════════════════════════

export function createAudio() {
  let ctx = null;
  let master = null, sfxBus = null, ambBus = null;
  let muted = false;
  let rainGain = null;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.8;
      sfxBus.connect(master);
      ambBus = ctx.createGain();
      ambBus.gain.value = 0.65;
      ambBus.connect(master);
      return true;
    } catch { return false; }
  }

  function noiseBuffer(seconds = 2) {
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;   // pinkish
      data[i] = last * 3.2;
    }
    return buf;
  }

  function startAmbient() {
    if (!ensure() || started) return;
    started = true;

    // Low city drone — two detuned saws through a dark lowpass
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 130; lp.Q.value = 0.6;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.16;
    lp.connect(droneGain).connect(ambBus);
    for (const [f, d] of [[55, 0], [55.6, 4], [110.3, -6]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      const g = ctx.createGain(); g.gain.value = 0.33;
      o.connect(g).connect(lp);
      o.start();
    }
    // slow LFO breathing on the filter
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain(); lfoG.gain.value = 38;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();

    // Wind / distant traffic — looped noise through bandpass
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(3);
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.4;
    const windG = ctx.createGain(); windG.gain.value = 0.08;
    noise.connect(bp).connect(windG).connect(ambBus);
    noise.start();
    const wlfo = ctx.createOscillator();
    wlfo.frequency.value = 0.11;
    const wlfoG = ctx.createGain(); wlfoG.gain.value = 0.035;
    wlfo.connect(wlfoG).connect(windG.gain);
    wlfo.start();

    // Rain bed — bright filtered noise, toggleable
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noiseBuffer(2.4);
    rainSrc.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2400;
    rainGain = ctx.createGain(); rainGain.gain.value = 0.055;
    rainSrc.connect(hp).connect(rainGain).connect(ambBus);
    rainSrc.start();

    // Sub heartbeat of the city — soft pulse
    const pulse = ctx.createOscillator();
    pulse.type = 'sine'; pulse.frequency.value = 33;
    const pg = ctx.createGain(); pg.gain.value = 0.05;
    const plfo = ctx.createOscillator(); plfo.frequency.value = 0.21;
    const plfoG = ctx.createGain(); plfoG.gain.value = 0.03;
    plfo.connect(plfoG).connect(pg.gain);
    pulse.connect(pg).connect(ambBus);
    pulse.start(); plfo.start();
  }

  function env(g, t0, a, peak, d, sustain = 0) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t0 + a + d);
  }

  const sfxDefs = {
    laser(t0) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(960, t0);
      o.frequency.exponentialRampToValueAtTime(140, t0 + 0.13);
      const g = ctx.createGain();
      env(g, t0, 0.004, 0.16, 0.13);
      o.connect(g).connect(sfxBus);
      o.start(t0); o.stop(t0 + 0.16);
    },
    missile(t0) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(0.8);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(300, t0);
      f.frequency.exponentialRampToValueAtTime(2400, t0 + 0.5);
      const g = ctx.createGain();
      env(g, t0, 0.02, 0.3, 0.55);
      n.connect(f).connect(g).connect(sfxBus);
      n.start(t0); n.stop(t0 + 0.7);
    },
    boom(t0) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(1.4);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t0);
      f.frequency.exponentialRampToValueAtTime(70, t0 + 1.0);
      const g = ctx.createGain();
      env(g, t0, 0.008, 0.65, 1.05);
      n.connect(f).connect(g).connect(sfxBus);
      n.start(t0); n.stop(t0 + 1.2);
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(64, t0);
      sub.frequency.exponentialRampToValueAtTime(30, t0 + 0.7);
      const sg = ctx.createGain();
      env(sg, t0, 0.01, 0.5, 0.75);
      sub.connect(sg).connect(sfxBus);
      sub.start(t0); sub.stop(t0 + 0.85);
    },
    jump(t0) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(260, t0);
      o.frequency.exponentialRampToValueAtTime(620, t0 + 0.16);
      const g = ctx.createGain();
      env(g, t0, 0.01, 0.14, 0.18);
      o.connect(g).connect(sfxBus);
      o.start(t0); o.stop(t0 + 0.22);
    },
    land(t0) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(0.3);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 260;
      const g = ctx.createGain();
      env(g, t0, 0.004, 0.4, 0.22);
      n.connect(f).connect(g).connect(sfxBus);
      n.start(t0); n.stop(t0 + 0.3);
    },
    landSoft(t0) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(0.2);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 340;
      const g = ctx.createGain();
      env(g, t0, 0.003, 0.12, 0.12);
      n.connect(f).connect(g).connect(sfxBus);
      n.start(t0); n.stop(t0 + 0.18);
    },
    chime(t0) {
      for (const [f, dt, p] of [[880, 0, 0.12], [1318.5, 0.14, 0.1]]) {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain();
        env(g, t0 + dt, 0.005, p, 0.5);
        o.connect(g).connect(sfxBus);
        o.start(t0 + dt); o.stop(t0 + dt + 0.6);
      }
    },
    doors(t0) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(0.5);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 0.8;
      const g = ctx.createGain();
      env(g, t0, 0.06, 0.1, 0.35);
      n.connect(f).connect(g).connect(sfxBus);
      n.start(t0); n.stop(t0 + 0.5);
    },
    ui(t0) {
      const o = ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = 1240;
      const g = ctx.createGain();
      env(g, t0, 0.002, 0.07, 0.07);
      o.connect(g).connect(sfxBus);
      o.start(t0); o.stop(t0 + 0.1);
    },
    shieldUp(t0) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(160, t0);
      o.frequency.exponentialRampToValueAtTime(720, t0 + 0.3);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
      const g = ctx.createGain();
      env(g, t0, 0.02, 0.12, 0.32);
      o.connect(f).connect(g).connect(sfxBus);
      o.start(t0); o.stop(t0 + 0.4);
    },
    shieldDown(t0) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(620, t0);
      o.frequency.exponentialRampToValueAtTime(120, t0 + 0.3);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = ctx.createGain();
      env(g, t0, 0.02, 0.12, 0.3);
      o.connect(f).connect(g).connect(sfxBus);
      o.start(t0); o.stop(t0 + 0.4);
    },
    warp(t0) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t0);
      o.frequency.exponentialRampToValueAtTime(980, t0 + 0.8);
      const g = ctx.createGain();
      env(g, t0, 0.05, 0.16, 0.85);
      o.connect(g).connect(sfxBus);
      o.start(t0); o.stop(t0 + 1.0);
    },
    thunder(t0) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(2.6);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t0);
      f.frequency.exponentialRampToValueAtTime(60, t0 + 2.2);
      const g = ctx.createGain();
      env(g, t0, 0.12, 0.4, 2.3);
      n.connect(f).connect(g).connect(sfxBus);
      n.start(t0); n.stop(t0 + 2.6);
    },
  };

  return {
    resume() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      startAmbient();
    },
    sfx(name) {
      if (!ctx || muted || !sfxDefs[name]) return;
      try { sfxDefs[name](ctx.currentTime); } catch { /* ignore */ }
    },
    setRain(on) {
      if (rainGain) rainGain.gain.linearRampToValueAtTime(on ? 0.055 : 0.0001, ctx.currentTime + 0.6);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
}
