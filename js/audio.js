/* ============================================================================
 * NCAudio — a fully procedural WebAudio sound engine for NIGHT CITY ARCHIVE.
 *
 * Exposes a single global, `window.NCAudio`, from a classic IIFE (no modules,
 * no fetch, no sample files, runs from file://).
 *
 * Design intent: a rain-soaked night city seen from a 200th-floor window; a
 * dying machine still humming; a braindance editor's layered audio; cheap
 * neon advertising; a burnt-out chrome arm twitching. Everything is built
 * from oscillators, code-generated noise, biquad filters, a generated
 * convolution reverb and a master limiter. No per-frame node creation: sound
 * is either a persistent bed or a scheduled one-shot that cleans itself up.
 *
 * Signal flow
 *   beds / layers ─┐
 *   one-shot SFX ──┼─► busBed / busSfx / busUi ─► masterInput
 *   reverb send ───┴─► convolver ─► reverbReturn ─► masterInput
 *   masterInput ─► 24 Hz high-pass ─► limiter (DynamicsCompressor)
 *               ─► masterGain (user volume) ─► muteGain (enable) ─► destination
 *
 * Autoplay: nothing is created until init() is called. Call init() from a
 * real user gesture (click / key) — the page's "JACK IN" button does this.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ════════════════════════════════════════════════════════════════════════
   * 1. CONFIGURATION & MODULE STATE
   * ════════════════════════════════════════════════════════════════════════ */

  const VERSION = '1.0.0';
  const MASTER_CEILING = 0.9;   // full-scale ceiling at volume = 1 (limiter ahead)
  const MAX_VOICES = 20;        // concurrent one-shot SFX events (CPU guard)
  const BED_FADE = 2.5;         // scene crossfade, seconds
  const LAYER_FADE = 1.2;       // bdLayer crossfade, seconds
  const DEFAULT_VOLUME = 0.8;
  const DEFAULT_INTENSITY = 0.5;
  const LAYER_NAMES = ['visual', 'audio', 'thermal'];
  const LAYER_LEVEL = { visual: 3.2, audio: 3.6, thermal: 3.4 };

  // The page owns section names; tolerate the extra act names it may scroll to.
  const SCENE_ALIAS = { districts: 'city', interlude: 'bd', hero: 'hero' };

  let ctx = null;                 // AudioContext
  let ready = false;              // graph exists and is usable
  let disposed = false;
  let unavailable = false;        // WebAudio missing / init failed
  let initPromise = null;

  let enabled = true;
  let volume = DEFAULT_VOLUME;
  let intensity = DEFAULT_INTENSITY;

  let masterInput = null, masterGain = null, muteGain = null, limiter = null;
  let masterHP = null, softClip = null;
  let busBed = null, busSfx = null, busUi = null, bdLayerBus = null;
  let reverbSend = null, reverbReturn = null, convolver = null;
  let noiseBuffer = null;

  let currentScene = null, currentBed = null, pendingScene = null;
  let activeVoices = 0;
  let layerWanted = { visual: false, audio: false, thermal: false };
  const layers = {};
  const liveBeds = new Set();
  const liveVoiceNodes = new Set();  // nodes owned by scheduled one-shot SFX
  const cleanupTimers = new Set();   // every setTimeout/setInterval we own
  const SCENE_BUILDERS = {};
  const LAYER_BUILDERS = {};

  const DEBUG = global.NCAUDIO_DEBUG === true;
  const log = (...a) => { if (DEBUG) { try { console.log('[NCAudio]', ...a); } catch (e) { /* ignore */ } } };
  const warn = (...a) => { if (DEBUG) { try { console.warn('[NCAudio]', ...a); } catch (e) { /* ignore */ } } };

  /* ════════════════════════════════════════════════════════════════════════
   * 2. TINY UTILITIES — numbers, timers, node factories, automation
   * ════════════════════════════════════════════════════════════════════════ */

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const now = () => (ctx ? ctx.currentTime : 0);

  const remember = (id) => { cleanupTimers.add(id); return id; };
  const forget = (id) => { cleanupTimers.delete(id); };
  function clearAllTimers() {
    cleanupTimers.forEach((id) => { try { clearTimeout(id); } catch (e) {} try { clearInterval(id); } catch (e) {} });
    cleanupTimers.clear();
  }

  const mkGain = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const mkOsc = (type, freq, detune) => {
    const n = ctx.createOscillator();
    n.type = type;
    n.frequency.value = freq;
    if (detune) n.detune.value = detune;
    return n;
  };
  const mkFilter = (type, freq, q, gainDb) => {
    const n = ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = freq;
    n.Q.value = q == null ? 0.7 : q;
    if (gainDb) n.gain.value = gainDb;
    return n;
  };
  const mkNoise = () => {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer;
    n.loop = true;
    return n;
  };

  /** Schedule a smooth ramp from the parameter's current value (safe everywhere). */
  function fadeParam(param, target, seconds) {
    if (!ctx || !param) return;
    const t = ctx.currentTime;
    const v = num(target, 0);
    const dur = Math.max(0.01, num(seconds, 0.1));
    try {
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(t);
      else { const cur = param.value; param.cancelScheduledValues(t); param.setValueAtTime(cur, t); }
      param.linearRampToValueAtTime(v, t + dur);
    } catch (e) { warn('fadeParam', e); }
  }

  const setAt = (param, v, t) => { try { param.setValueAtTime(v, t); } catch (e) { warn('setAt', e); } };
  function rampTo(param, v, t, dur, curve) {
    try {
      if (curve === 'exp') param.exponentialRampToValueAtTime(Math.max(0.0001, v), t + Math.max(0.001, dur));
      else param.linearRampToValueAtTime(v, t + Math.max(0.001, dur));
    } catch (e) { warn('rampTo', e); }
  }
  /** Classic percussive envelope: near-silence -> peak -> near-silence. */
  function env(param, at, peak, attack, decay) {
    setAt(param, 0.0001, at);
    rampTo(param, Math.max(0.0001, peak), at, attack);
    rampTo(param, 0.0001, at + attack, Math.max(0.01, decay), 'exp');
  }

  /** Connect `src` to `dst` through a StereoPanner; optionally pan over time. */
  function panOut(reg, src, dst, pan, at, panTo, dur) {
    if (!ctx || !ctx.createStereoPanner) { src.connect(dst); return dst; }
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(num(pan, 0), -1, 1);
    src.connect(p);
    p.connect(dst);
    if (reg && reg.node) reg.node(p);
    if (panTo != null && at != null) {
      try {
        p.pan.setValueAtTime(p.pan.value, at);
        p.pan.linearRampToValueAtTime(clamp(panTo, -1, 1), at + Math.max(0.01, num(dur, 1)));
      } catch (e) { warn('pan ramp', e); }
    }
    return p;
  }

  const kill = (n) => {
    if (!n) return;
    try { if (typeof n.stop === 'function') n.stop(); } catch (e) { /* already stopped */ }
    try { n.disconnect(); } catch (e) { /* already gone */ }
  };
  const drain = (nodes) => { for (let i = 0; i < nodes.length; i++) kill(nodes[i]); };

  /* One-shot voice helpers: every created node is registered for teardown. */
  const vOsc = (r, type, f, at, det) => r.src(mkOsc(type, f, det), at);
  const vNoise = (r, at) => r.src(mkNoise(), at, rnd(0, 2));
  const vFilter = (r, type, f, q, g) => r.node(mkFilter(type, f, q, g));
  const vGain = (r, v) => r.node(mkGain(v == null ? 0 : v));

  /* ════════════════════════════════════════════════════════════════════════
   * 3. MASTER GRAPH, NOISE SOURCE, GENERATED REVERB
   * ════════════════════════════════════════════════════════════════════════ */

  function makeNoiseBuffer(seconds) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Stereo, decorrelated noise impulse: cheap but musical plate-ish tail. */
  function makeImpulse(seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    const pre = Math.floor(rate * 0.012);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const p = i / len;
        const e = Math.pow(1 - p, decay);
        d[i] = (Math.random() * 2 - 1) * e * (i < pre ? 0.25 : 1);
      }
    }
    return buf;
  }

  function buildGraph() {
    masterHP = mkFilter('highpass', 24, 0.7);
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;

    masterInput = mkGain(1);
    masterGain = mkGain(volumeToGain(volume));
    muteGain = mkGain(enabled ? 1 : 0);

    masterInput.connect(masterHP);
    masterHP.connect(limiter);
    limiter.connect(masterGain);
    masterGain.connect(muteGain);
    // Final safety: a gentle tanh soft-clipper means a pathological pile-up of
    // voices can never reach digital full scale. At normal program levels
    // (peaks <= ~0.3) it is effectively transparent.
    if (typeof ctx.createWaveShaper === 'function') {
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = 0.9 * Math.tanh(x / 0.9);
      }
      softClip = ctx.createWaveShaper();
      softClip.curve = curve;
      softClip.oversample = 'none';
      muteGain.connect(softClip);
      softClip.connect(ctx.destination);
    } else {
      muteGain.connect(ctx.destination);
    }

    busBed = mkGain(2.0);
    busSfx = mkGain(1.5);
    busUi = mkGain(1.0);
    busBed.connect(masterInput);
    busSfx.connect(masterInput);
    busUi.connect(masterInput);

    bdLayerBus = mkGain(0);
    bdLayerBus.connect(busBed);

    // Generated plate-ish reverb. Let the browser normalize the impulse so
    // send levels stay predictable across sample rates.
    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(2.8, 2.6);
    reverbSend = mkGain(1);
    reverbReturn = mkGain(0.55);
    reverbSend.connect(convolver);
    convolver.connect(reverbReturn);
    reverbReturn.connect(masterInput);

    noiseBuffer = makeNoiseBuffer(3.0);
  }

  const volumeToGain = (v) => MASTER_CEILING * Math.pow(clamp(v, 0, 1), 1.35);

  /* ════════════════════════════════════════════════════════════════════════
   * 4. AMBIENT BED FRAMEWORK
   *
   * A bed is a persistent graph that starts silent, fades in on setScene()
   * and fades out + tears itself down on the next scene. Beds additionally
   * provide `event()` for transient, self-cleaning layers (heartbeats, bells,
   * sirens) and `every()` / `later()` for their own scheduled movement.
   * ════════════════════════════════════════════════════════════════════════ */

  function makeBed(name, destination) {
    const out = mkGain(0);
    out.connect(destination);
    const startAt = now() + 0.03;
    const allNodes = new Set([out]);
    const sources = [];
    const timers = new Set();
    const eventTimers = new Set();
    const transient = new Set();
    let dead = false;

    const bed = {
      name,
      out,
      startAt,
      intensity: null,
      get dead() { return dead; },
      node(n) { allNodes.add(n); return n; },
      src(n) { allNodes.add(n); sources.push(n); return n; },
      osc(type, f, det) { const o = bed.src(mkOsc(type, f, det)); o.start(startAt); return o; },
      noise() { const n = bed.src(mkNoise()); n.start(startAt); return n; },
      g(v) { return bed.node(mkGain(v == null ? 0 : v)); },
      f(type, freq, q, gdb) { return bed.node(mkFilter(type, freq, q, gdb)); },
      pan(src, dest, pan) { return panOut(bed, src, dest, pan); },

      /** Transient sub-graph, fully stopped + disconnected after `duration`. */
      event(duration, build) {
        if (dead) return;
        const local = new Set();
        const srcs = [];
        const t = now();
        const reg = {
          node(n) { allNodes.add(n); local.add(n); transient.add(n); return n; },
          src(n, when, ...args) {
            allNodes.add(n); local.add(n); transient.add(n);
            srcs.push(n);
            n.start(when == null ? t : when, ...args);
            return n;
          }
        };
        try { build(t, reg); } catch (e) { warn('bed event', name, e); }
        const end = t + duration;
        srcs.forEach((s) => { try { s.stop(end); } catch (e) {} });
        const id = setTimeout(() => {
          forget(id); eventTimers.delete(id);
          local.forEach(kill);
          local.forEach((n) => transient.delete(n));
        }, Math.max(80, (end - now()) * 1000 + 300));
        remember(id); eventTimers.add(id);
        return id;
      },

      every(ms, fn) {
        if (dead) return;
        const id = setInterval(() => { if (!dead) { try { fn(); } catch (e) { warn('bed interval', name, e); } } }, ms);
        timers.add(id); remember(id);
        return id;
      },

      later(ms, fn) {
        if (dead) return;
        const id = setTimeout(() => {
          forget(id); timers.delete(id);
          if (!dead) { try { fn(); } catch (e) { warn('bed later', name, e); } }
        }, Math.max(16, ms));
        timers.add(id); remember(id);
        return id;
      },

      fadeTo(v, seconds) { fadeParam(out.gain, v, seconds); },

      dispose() {
        if (dead) return;
        dead = true;
        timers.forEach((id) => { forget(id); try { clearTimeout(id); } catch (e) {} try { clearInterval(id); } catch (e) {} });
        timers.clear();
        eventTimers.forEach((id) => { forget(id); try { clearTimeout(id); } catch (e) {} });
        eventTimers.clear();
        transient.forEach(kill); transient.clear();
        sources.forEach((s) => { try { s.stop(); } catch (e) {} });
        allNodes.forEach((n) => { try { n.disconnect(); } catch (e) {} });
        try { out.disconnect(); } catch (e) {}
        liveBeds.delete(bed);
      }
    };
    liveBeds.add(bed);
    return bed;
  }

  function buildBed(name) {
    const builder = SCENE_BUILDERS[name];
    if (!builder) return null;
    try { return builder(); } catch (e) { warn('buildBed', name, e); return null; }
  }

  function retireBed(bed, seconds) {
    try { bed.fadeTo(0, seconds); } catch (e) {}
    remember(setTimeout(() => { try { bed.dispose(); } catch (e) {} }, seconds * 1000 + 350));
  }

  /* ════════════════════════════════════════════════════════════════════════
   * 5. SCENE BEDS
   *
   * Each builder returns a bed whose out gain starts at 0 (setScene fades it
   * in). Layer levels are chosen so a full bed peaks around 0.2–0.3 before
   * the master limiter and sits roughly -30…-24 dBFS RMS.
   * ════════════════════════════════════════════════════════════════════════ */

  /* hero — vast, cold, distant; rain in the air, no rhythm. */
  function buildHero() {
    const b = makeBed('hero', busBed);
    const t = b.startAt;

    // Structural hum: three detuned saws under a very dark low-pass.
    const humLP = b.f('lowpass', 210, 0.8);
    const humG = b.g(0.05);
    humLP.connect(humG).connect(b.out);
    [[55, -8], [55, 7], [82.407, -3]].forEach((n) => {
      const o = b.osc('sawtooth', n[0], n[1]);
      o.connect(humLP);
    });
    // Sub-octave body, felt more than heard.
    const sub = b.osc('sine', 27.5);
    sub.connect(b.g(0.045)).connect(b.out);

    // Movement bus: intensity() scales this without touching the cold hum.
    const move = b.g(1);
    move.connect(b.out);

    // Detuned A-minor-ish pad with two very slow LFOs (no rhythm, just drift).
    const padLP = b.f('lowpass', 300, 1.1);
    const padG = b.g(0.024);
    padLP.connect(padG).connect(move);
    [[110, 5, 1], [110, -6, 1], [164.81, 3, 0.55], [220, -4, 0.4]].forEach((n) => {
      const o = b.osc('sawtooth', n[0], n[1]);
      o.connect(b.g(n[2])).connect(padLP);
    });
    const ampLfo = b.osc('sine', 0.033);
    ampLfo.connect(b.g(0.006)).connect(padG.gain);
    const cutLfo = b.osc('sine', 0.045);
    cutLfo.connect(b.g(70)).connect(padLP.frequency);

    // Airy rain: white noise, gently band-limited, slow breathing.
    const rain = b.noise();
    const rainG = b.g(0.05);
    rain.connect(b.f('highpass', 550, 0.6)).connect(b.f('lowpass', 6500, 0.5)).connect(rainG);
    b.pan(rainG, move, -0.15);
    const rainLfo = b.osc('sine', 0.028);
    rainLfo.connect(b.g(0.012)).connect(rainG.gain);

    // Wind layer, panned right and wider than the rain.
    const air = b.noise();
    const airG = b.g(0.022);
    air.connect(b.f('bandpass', 380, 0.7)).connect(airG);
    b.pan(airG, move, 0.35);

    // Reverb: rain and pad get a long, distant space.
    padG.connect(b.g(0.5)).connect(reverbSend);
    rainG.connect(b.g(0.25)).connect(reverbSend);

    // Rare far siren glides (self-scheduling, self-cleaning).
    const siren = () => b.event(4.8, (et, r) => {
      const o = vOsc(r, 'sine', rnd(480, 640), et);
      const f0 = o.frequency.value;
      setAt(o.frequency, f0, et);
      rampTo(o.frequency, f0 * 1.5, et + 0.2, 2.0);
      rampTo(o.frequency, f0 * 1.12, et + 2.2, 1.6);
      const lp = vFilter(r, 'lowpass', 950, 1.4);
      const gn = vGain(r, 0);
      o.connect(lp).connect(gn);
      panOut(r, gn, b.out, rnd(-0.7, 0.7), et);
      setAt(gn.gain, 0.0001, et);
      rampTo(gn.gain, 0.024, et + 0.15, 1.5);
      rampTo(gn.gain, 0.0001, et + 2.6, 1.7, 'exp');
      gn.connect(vGain(r, 0.7)).connect(reverbSend);
    });
    const sirenLoop = () => b.later(rnd(10000, 18000), () => { siren(); sirenLoop(); });
    sirenLoop();

    b.intensity = (x) => {
      fadeParam(move.gain, 0.7 + 0.6 * x, 0.9);
      fadeParam(padLP.frequency, 250 + 140 * x, 1.4);
      fadeParam(rainG.gain, 0.04 + 0.03 * x, 1.2);
    };
    return b;
  }

  /* city — dense, close; heartbeat sub pulse and high metallic shimmer. */
  function buildCity() {
    const b = makeBed('city', busBed);
    const t = b.startAt;

    const lowLP = b.f('lowpass', 165, 1.0);
    const lowG = b.g(0.055);
    lowLP.connect(lowG).connect(b.out);
    [[43.654, -9], [55, 8], [55, -6]].forEach((n) => {
      const o = b.osc('sawtooth', n[0], n[1]);
      o.connect(lowLP);
    });
    b.osc('sine', 32.7).connect(b.g(0.04)).connect(b.out);

    const move = b.g(1);
    move.connect(b.out);

    // Pad with more motion than hero, then moving traffic noise.
    const padLP = b.f('lowpass', 420, 1.3);
    const padG = b.g(0.019);
    padLP.connect(padG).connect(move);
    [[82.407, 4], [82.407, -5], [110, 3], [164.814, -4]].forEach((n) => {
      const o = b.osc('sawtooth', n[0], n[1]);
      o.connect(b.g(0.8)).connect(padLP);
    });
    b.osc('sine', 0.08).connect(b.g(120)).connect(padLP.frequency);

    const traffic = b.noise();
    const tBP = b.f('bandpass', 420, 1.2);
    const tG = b.g(0.028);
    traffic.connect(tBP).connect(tG);
    if (ctx.createStereoPanner) {
      const pan = b.node(ctx.createStereoPanner());
      pan.pan.value = 0;
      tG.connect(pan).connect(move);
      b.osc('sine', 0.035).connect(b.g(0.7)).connect(pan.pan);
    } else {
      tG.connect(move);
    }
    b.osc('sine', 0.02).connect(b.g(120)).connect(tBP.frequency);

    // Rain closer than hero.
    const rain = b.noise();
    const rainG = b.g(0.06);
    rain.connect(b.f('highpass', 900, 0.5)).connect(b.f('lowpass', 5200, 0.4)).connect(rainG);
    b.pan(rainG, move, 0.2);

    // Metallic shimmer: narrow high sines + a thin noise whisper.
    const shimmer = b.g(1);
    shimmer.connect(move);
    [[2637, 0.0028, 0.35], [3520, 0.0018, -0.3]].forEach((n) => {
      const o = b.osc('sine', n[0]);
      const g = b.g(n[1]);
      o.connect(g);
      b.pan(g, shimmer, n[2]);
    });
    const shNoise = b.noise();
    shNoise.connect(b.f('highpass', 7800, 0.6)).connect(b.g(0.006)).connect(shimmer);

    // Heartbeat: two sub thumps per ~1.05 s beat, firmly under the mix.
    const thump = (r, at, peak, f0, f1) => {
      const o = r.src(mkOsc('sine', f0), at);
      setAt(o.frequency, f0, at);
      rampTo(o.frequency, f1, at + 0.01, 0.16, 'exp');
      const lp = vFilter(r, 'lowpass', 130, 1.0);
      const gn = vGain(r, 0);
      o.connect(lp).connect(gn).connect(b.out);
      setAt(gn.gain, 0.0001, at);
      rampTo(gn.gain, peak, at + 0.01, 0.012);
      rampTo(gn.gain, 0.0001, at + 0.03, 0.24, 'exp');
    };
    b.every(1050, () => b.event(0.8, (et, r) => {
      thump(r, et, 0.085, 58, 38);
      thump(r, et + 0.23, 0.05, 52, 34);
    }));

    b.intensity = (x) => {
      fadeParam(move.gain, 0.72 + 0.55 * x, 0.9);
      fadeParam(padLP.frequency, 380 + 120 * x, 1.2);
      fadeParam(shimmer.gain, 0.45 + 0.9 * x, 0.9);
    };
    return b;
  }

  /* bd — braindance: filtered, warm-yet-unnatural, slow chord, reverse swells. */
  function buildBd() {
    const b = makeBed('bd', busBed);
    const t = b.startAt;

    const move = b.g(1);
    move.connect(b.out);

    // Warm-but-synthetic chord: triangle + sine pairs, gently detuned.
    const chordLP = b.f('lowpass', 820, 1.5);
    const chordAmp = b.g(0.32);
    chordLP.connect(chordAmp).connect(move);
    [146.83, 174.61, 220, 329.63].forEach((f) => {
      [['triangle', 4], ['sine', -5]].forEach((pair) => {
        const o = b.osc(pair[0], f, pair[1]);
        o.connect(b.g(0.08)).connect(chordLP);
      });
    });
    b.osc('sine', 0.05).connect(b.g(240)).connect(chordLP.frequency);
    b.osc('sine', 0.07).connect(b.g(0.08)).connect(chordAmp.gain);

    // Sub + a warm breath of noise; the "memory" body.
    b.osc('sine', 73.42).connect(b.g(0.05)).connect(move);
    b.osc('sine', 36.71).connect(b.g(0.03)).connect(b.out);
    const breath = b.noise();
    const breathG = b.g(0.03);
    breath.connect(b.f('lowpass', 500, 1.1)).connect(breathG);
    b.pan(breathG, move, -0.25);
    b.osc('sine', 0.04).connect(b.g(0.012)).connect(breathG.gain);

    // Unnatural edge: a quiet inharmonic FM sparkle.
    const fmMod = b.osc('sine', 220);
    const fmIndex = b.g(30);
    const fmCar = b.osc('sine', 440);
    fmMod.connect(fmIndex).connect(fmCar.frequency);
    fmCar.connect(b.f('highpass', 600, 0.7)).connect(b.g(0.006)).connect(move);

    chordAmp.connect(b.g(0.5)).connect(reverbSend);
    breathG.connect(b.g(0.3)).connect(reverbSend);

    // Occasional reversed-sounding swells: exponentially rising envelope, hard cut.
    const swell = () => b.event(5.2, (et, r) => {
      const n = vNoise(r, et);
      const bp = vFilter(r, 'bandpass', 260, 1.4);
      setAt(bp.frequency, 260, et);
      rampTo(bp.frequency, 1900, et + 0.2, 3.4);
      const gn = vGain(r, 0);
      n.connect(bp).connect(gn);
      panOut(r, gn, b.out, rnd(-0.4, 0.4), et);
      setAt(gn.gain, 0.0001, et);
      rampTo(gn.gain, 0.055, et, 3.5, 'exp');
      rampTo(gn.gain, 0.0001, et + 3.55, 0.22, 'exp');
      gn.connect(vGain(r, 0.6)).connect(reverbSend);
      [110, 138.59, 164.81].forEach((f) => {
        const o = vOsc(r, 'sine', f * 0.5, et);
        setAt(o.frequency, f * 0.5, et);
        rampTo(o.frequency, f, et + 0.2, 3.4);
        const og = vGain(r, 0);
        o.connect(og);
        panOut(r, og, b.out, rnd(-0.5, 0.5), et);
        setAt(og.gain, 0.0001, et);
        rampTo(og.gain, 0.014, et, 3.5, 'exp');
        rampTo(og.gain, 0.0001, et + 3.55, 0.22, 'exp');
      });
    });
    const swellLoop = () => b.later(rnd(11000, 17000), () => { swell(); swellLoop(); });
    swellLoop();

    b.intensity = (x) => {
      fadeParam(move.gain, 0.75 + 0.5 * x, 0.9);
      fadeParam(chordLP.frequency, 700 + 280 * x, 1.4);
      fadeParam(breathG.gain, 0.025 + 0.015 * x, 1.2);
    };
    return b;
  }

  /* chrome — cold, surgical, high-frequency tension, slow rising drone + beat. */
  function buildChrome() {
    const b = makeBed('chrome', busBed);
    const t = b.startAt;

    // Drone that rises imperceptibly over three minutes.
    const droneLP = b.f('lowpass', 230, 1.6);
    const droneG = b.g(0.065);
    droneLP.connect(droneG).connect(b.out);
    [[55, -9], [55, 9]].forEach((n) => {
      const o = b.osc('sawtooth', n[0], n[1]);
      setAt(o.frequency, n[0], t);
      rampTo(o.frequency, n[0] * 1.12, t, 180);
      o.connect(droneLP);
    });

    const move = b.g(1);
    move.connect(b.out);
    const tension = b.g(1);
    tension.connect(move);
    [[1174.66, 0.0046, 0.4], [1760, 0.0029, -0.45], [2637, 0.0016, 0.2]].forEach((n) => {
      const o = b.osc('sine', n[0]);
      const g = b.g(n[1]);
      o.connect(g);
      b.pan(g, tension, n[2]);
    });

    // Cold air + surgical high band.
    const air = b.noise();
    const airG = b.g(0.018);
    air.connect(b.f('highpass', 3500, 0.6)).connect(airG);
    b.pan(airG, move, -0.3);

    // Beat: metronomic tick, occasional sub thud, no warmth in the reverb.
    let beat = 0;
    b.every(1150, () => {
      beat += 1;
      b.event(0.7, (et, r) => {
        const n = vNoise(r, et);
        const bp = vFilter(r, 'bandpass', rnd(1400, 2400), 6);
        const gn = vGain(r, 0);
        n.connect(bp).connect(gn);
        panOut(r, gn, b.out, beat % 2 ? 0.25 : -0.25, et);
        setAt(gn.gain, 0.0001, et);
        rampTo(gn.gain, 0.022, et, 0.003);
        rampTo(gn.gain, 0.0001, et + 0.005, 0.03, 'exp');
        if (beat % 4 === 0) {
          const o = vOsc(r, 'sine', 55, et);
          setAt(o.frequency, 55, et);
          rampTo(o.frequency, 38, et + 0.01, 0.18, 'exp');
          const og = vGain(r, 0);
          o.connect(og).connect(b.out);
          setAt(og.gain, 0.0001, et);
          rampTo(og.gain, 0.065, et + 0.01, 0.01);
          rampTo(og.gain, 0.0001, et + 0.02, 0.22, 'exp');
        }
        if (beat % 2 === 0) {
          const p = vOsc(r, 'sine', 3520, et);
          const pg = vGain(r, 0);
          p.connect(pg);
          panOut(r, pg, b.out, -0.5, et);
          setAt(pg.gain, 0.0001, et);
          rampTo(pg.gain, 0.012, et, 0.004);
          rampTo(pg.gain, 0.0001, et + 0.01, 0.1, 'exp');
        }
      });
    });

    b.intensity = (x) => {
      fadeParam(move.gain, 0.7 + 0.55 * x, 0.8);
      fadeParam(droneLP.frequency, 200 + 80 * x, 1.0);
    };
    return b;
  }

  /* tarot — sparse, reverberant, FM bell tones, lots of space. */
  function buildTarot() {
    const b = makeBed('tarot', busBed);

    // Sparse low foundation.
    b.osc('sine', 41.2).connect(b.g(0.05)).connect(b.out);
    b.osc('sine', 55).connect(b.g(0.03)).connect(b.out);
    const air = b.noise();
    const airG = b.g(0.018);
    air.connect(b.f('bandpass', 300, 0.8)).connect(airG);
    b.pan(airG, b.out, -0.2);
    b.osc('sine', 0.02).connect(b.g(0.006)).connect(airG.gain);
    airG.connect(b.g(0.5)).connect(reverbSend);

    const NOTES = [174.61, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0];
    const bell = () => b.event(5.6, (et, r) => {
      const f = pick(NOTES);
      const carrier = vOsc(r, 'sine', f, et);
      const mod = vOsc(r, 'sine', f * 1.414, et);
      const modG = vGain(r, f * 1.8);
      mod.connect(modG).connect(carrier.frequency);
      setAt(modG.gain, f * 1.8, et);
      rampTo(modG.gain, f * 0.15, et + 0.2, 1.6, 'exp');
      const amp = vGain(r, 0);
      carrier.connect(amp);
      panOut(r, amp, b.out, rnd(-0.6, 0.6), et);
      setAt(amp.gain, 0.0001, et);
      rampTo(amp.gain, 0.09, et, 0.006);
      rampTo(amp.gain, 0.0001, et + 0.1, 3.6, 'exp');
      amp.connect(vGain(r, 0.9)).connect(reverbSend);
      // additive octave partial for a glassier strike
      const p2 = vOsc(r, 'sine', f * 2, et);
      const a2 = vGain(r, 0);
      p2.connect(a2);
      panOut(r, a2, b.out, rnd(-0.8, 0.8), et);
      setAt(a2.gain, 0.0001, et);
      rampTo(a2.gain, 0.02, et, 0.005);
      rampTo(a2.gain, 0.0001, et + 0.04, 2.8, 'exp');
    });
    const bellLoop = () => b.later(rnd(5200, 8800), () => { bell(); bellLoop(); });
    bellLoop();

    // Very occasional low resonance swell under the bells.
    const lowSwell = () => b.event(6.5, (et, r) => {
      const o = vOsc(r, 'sine', 82.41, et);
      const g = vGain(r, 0);
      o.connect(g);
      panOut(r, g, b.out, rnd(-0.3, 0.3), et);
      setAt(g.gain, 0.0001, et);
      rampTo(g.gain, 0.032, et, 2.4);
      rampTo(g.gain, 0.0001, et + 2.4, 3.6, 'exp');
      g.connect(vGain(r, 0.8)).connect(reverbSend);
    });
    const swellLoop = () => b.later(rnd(18000, 26000), () => { lowSwell(); swellLoop(); });
    swellLoop();

    b.intensity = (x) => {
      fadeParam(airG.gain, 0.014 + 0.01 * x, 1.0);
    };
    return b;
  }

  /* end — elegiac: hero's motif, slower, lower, more reverb, decaying. */
  function buildEnd() {
    const b = makeBed('end', busBed);
    const t = b.startAt;

    // The whole bed sinks very slowly over three minutes.
    const fadeG = b.g(1);
    fadeG.connect(b.out);
    try { fadeG.gain.linearRampToValueAtTime(0.72, t + 180); } catch (e) {}

    const humLP = b.f('lowpass', 150, 0.8);
    const humG = b.g(0.05);
    humLP.connect(humG).connect(fadeG);
    [[41.2, -7], [41.2, 6], [55, -2]].forEach((n) => {
      const o = b.osc('sawtooth', n[0], n[1]);
      o.connect(humLP);
    });
    b.osc('sine', 20.6).connect(b.g(0.05)).connect(fadeG);

    const move = b.g(1);
    move.connect(fadeG);

    const padLP = b.f('lowpass', 240, 1.2);
    const padG = b.g(0.02);
    padLP.connect(padG).connect(move);
    [[82.41, 4], [82.41, -5], [110, 3], [164.81, -3]].forEach((n) => {
      const o = b.osc('sawtooth', n[0], n[1]);
      o.connect(b.g(0.75)).connect(padLP);
    });
    b.osc('sine', 0.022).connect(b.g(0.005)).connect(padG.gain);
    b.osc('sine', 0.03).connect(b.g(45)).connect(padLP.frequency);

    // Quieter, farther rain; a high elegiac tone with slow vibrato.
    const rain = b.noise();
    const rainG = b.g(0.035);
    rain.connect(b.f('highpass', 700, 0.5)).connect(b.f('lowpass', 6000, 0.4)).connect(rainG);
    b.pan(rainG, move, -0.2);
    const elegy = b.osc('triangle', 329.63);
    const elegyG = b.g(0.006);
    elegy.connect(elegyG);
    b.pan(elegyG, move, 0.4);
    b.osc('sine', 0.12).connect(b.g(0.003)).connect(elegyG.gain);

    padG.connect(b.g(0.6)).connect(reverbSend);
    rainG.connect(b.g(0.4)).connect(reverbSend);
    humG.connect(b.g(0.2)).connect(reverbSend);

    // Slow descending glides instead of hero's sirens.
    const fall = () => b.event(7.5, (et, r) => {
      const o = vOsc(r, 'sine', 440, et);
      setAt(o.frequency, 440, et);
      rampTo(o.frequency, 220, et + 0.4, 4.4);
      const lp = vFilter(r, 'lowpass', 700, 1.2);
      const gn = vGain(r, 0);
      o.connect(lp).connect(gn);
      panOut(r, gn, b.out, rnd(-0.5, 0.5), et);
      setAt(gn.gain, 0.0001, et);
      rampTo(gn.gain, 0.016, et + 0.5, 1.8);
      rampTo(gn.gain, 0.0001, et + 2.3, 3.2, 'exp');
      gn.connect(vGain(r, 0.75)).connect(reverbSend);
    });
    const fallLoop = () => b.later(rnd(19000, 27000), () => { fall(); fallLoop(); });
    fallLoop();

    b.intensity = (x) => {
      fadeParam(move.gain, 0.72 + 0.5 * x, 1.0);
      fadeParam(padLP.frequency, 210 + 90 * x, 1.5);
    };
    return b;
  }

  SCENE_BUILDERS.hero = buildHero;
  SCENE_BUILDERS.city = buildCity;
  SCENE_BUILDERS.bd = buildBd;
  SCENE_BUILDERS.chrome = buildChrome;
  SCENE_BUILDERS.tarot = buildTarot;
  SCENE_BUILDERS.end = buildEnd;

  /* ════════════════════════════════════════════════════════════════════════
   * 6. BRAINDANCE LAYERS — independently crossfaded loops over the bd bed
   * ════════════════════════════════════════════════════════════════════════ */

  /* visual — shimmering choir-ish pad. */
  function buildLayerVisual() {
    const b = makeBed('layer-visual', bdLayerBus);
    const t = b.startAt;
    const lp = b.f('lowpass', 1600, 0.8);
    const trem = b.g(1);
    const outG = b.g(1);
    lp.connect(trem).connect(outG).connect(b.out);
    [440, 493.88, 587.33, 659.25].forEach((f, i) => {
      const o = b.osc(i % 2 ? 'triangle' : 'sine', f, rnd(-6, 6));
      const g = b.g(0.012);
      o.connect(g);
      b.pan(g, lp, (i - 1.5) * 0.35);
    });
    b.osc('sine', 0.09).connect(b.g(0.18)).connect(trem.gain);
    b.osc('sine', 0.05).connect(b.g(250)).connect(lp.frequency);
    outG.connect(b.g(0.5)).connect(reverbSend);
    b.intensity = (x) => { fadeParam(outG.gain, 0.7 + 0.4 * x, 0.8); };
    return b;
  }

  /* audio — rhythmic pulse/percussion, machine tight. */
  function buildLayerAudio() {
    const b = makeBed('layer-audio', bdLayerBus);
    let step = 0;
    b.every(360, () => {
      step += 1;
      b.event(0.5, (et, r) => {
        const n = vNoise(r, et);
        const bp = vFilter(r, 'bandpass', rnd(1600, 3200), 4);
        const gn = vGain(r, 0);
        n.connect(bp).connect(gn);
        panOut(r, gn, b.out, step % 2 ? 0.35 : -0.35, et);
        setAt(gn.gain, 0.0001, et);
        rampTo(gn.gain, 0.05, et, 0.002);
        rampTo(gn.gain, 0.0001, et + 0.004, 0.05, 'exp');
        if (step % 4 === 0) {
          const o = vOsc(r, 'sine', 62, et);
          setAt(o.frequency, 62, et);
          rampTo(o.frequency, 44, et + 0.01, 0.16, 'exp');
          const og = vGain(r, 0);
          o.connect(og).connect(b.out);
          setAt(og.gain, 0.0001, et);
          rampTo(og.gain, 0.07, et + 0.01, 0.012);
          rampTo(og.gain, 0.0001, et + 0.02, 0.22, 'exp');
        }
        if (step % 2 === 0) {
          const p = vOsc(r, 'square', 1180, et);
          const pf = vFilter(r, 'lowpass', 2400, 0.8);
          const pg = vGain(r, 0);
          p.connect(pf).connect(pg);
          panOut(r, pg, b.out, step % 4 ? 0.2 : -0.2, et);
          setAt(pg.gain, 0.0001, et);
          rampTo(pg.gain, 0.02, et, 0.003);
          rampTo(pg.gain, 0.0001, et + 0.004, 0.03, 'exp');
        }
      });
    });
    return b;
  }

  /* thermal — low pressure rumble + crackle. */
  function buildLayerThermal() {
    const b = makeBed('layer-thermal', bdLayerBus);
    const t = b.startAt;
    const rumble = b.g(1);
    rumble.connect(b.out);
    b.osc('sine', 38).connect(b.g(0.03)).connect(rumble);
    b.osc('sine', 57).connect(b.g(0.012)).connect(rumble);
    const noise = b.noise();
    const noiseLP = b.f('lowpass', 180, 1.1);
    const noiseG = b.g(0.04);
    noise.connect(noiseLP).connect(noiseG).connect(rumble);
    b.osc('sine', 0.028).connect(b.g(0.01)).connect(noiseG.gain);
    b.osc('sine', 0.017).connect(b.g(60)).connect(noiseLP.frequency);
    rumble.connect(b.g(0.25)).connect(reverbSend);

    const crackle = () => b.event(0.25, (et, r) => {
      const n = vNoise(r, et);
      const bp = vFilter(r, 'bandpass', rnd(1800, 3400), 1.2);
      const gn = vGain(r, 0);
      n.connect(bp).connect(gn);
      panOut(r, gn, b.out, rnd(-0.8, 0.8), et);
      setAt(gn.gain, 0.0001, et);
      rampTo(gn.gain, rnd(0.012, 0.028), et, 0.002);
      rampTo(gn.gain, 0.0001, et + 0.004, rnd(0.02, 0.06), 'exp');
      gn.connect(vGain(r, 0.2)).connect(reverbSend);
    });
    const crackleLoop = () => b.later(rnd(500, 1400), () => { crackle(); crackleLoop(); });
    crackleLoop();
    return b;
  }

  LAYER_BUILDERS.visual = buildLayerVisual;
  LAYER_BUILDERS.audio = buildLayerAudio;
  LAYER_BUILDERS.thermal = buildLayerThermal;

  function ensureLayer(name) {
    if (layers[name]) return layers[name];
    const builder = LAYER_BUILDERS[name];
    if (!builder) return null;
    try { layers[name] = builder(); } catch (e) { warn('build layer', name, e); return null; }
    return layers[name];
  }

  /* ════════════════════════════════════════════════════════════════════════
   * 7. ONE-SHOT VOICE FRAMEWORK
   * ════════════════════════════════════════════════════════════════════════ */

  function canPlay() { return ready && !disposed && enabled && !!ctx; }

  /**
   * Run a self-contained sound. `build(t, r)` receives the start time and a
   * registrar; every node it registers is disconnected after `duration`.
   */
  function play(duration, build) {
    if (!canPlay()) return false;
    if (activeVoices >= MAX_VOICES) return false;
    activeVoices += 1;
    const t = now() + 0.012;
    const nodes = [];
    const sources = [];
    const reg = {
      node(n) { nodes.push(n); return n; },
      src(n, when, ...args) {
        nodes.push(n); sources.push(n);
        n.start(when == null ? t : when, ...args);
        return n;
      }
    };
    try { build(t, reg); } catch (e) { warn('voice build', e); }
    nodes.forEach((n) => liveVoiceNodes.add(n));
    const end = t + duration;
    sources.forEach((s) => { try { s.stop(end); } catch (e) {} });
    const id = remember(setTimeout(() => {
      forget(id);
      nodes.forEach((n) => liveVoiceNodes.delete(n));
      drain(nodes);
      activeVoices = Math.max(0, activeVoices - 1);
    }, Math.max(60, (end - now()) * 1000 + 400)));
    return true;
  }

  /* ════════════════════════════════════════════════════════════════════════
   * 8. UI BLIPS — tiny, dry, quiet interface sounds (< 120 ms)
   *
   * Each routes into busUi at roughly -24 dBFS peak before the master.
   * ════════════════════════════════════════════════════════════════════════ */

  function uiVoice(duration, build) {
    play(duration, (t, r) => build(t, r));
  }

  function uiTone(r, t, opts) {
    const o = vOsc(r, opts.type || 'sine', opts.f0, t);
    if (opts.f1) {
      setAt(o.frequency, opts.f0, t);
      rampTo(o.frequency, opts.f1, t, opts.glide || 0.04, opts.glideCurve || 'exp');
    }
    const gn = vGain(r, 0);
    let tail = gn;
    if (opts.lowpass) {
      const lp = vFilter(r, 'lowpass', opts.lowpass, opts.q || 0.9);
      o.connect(lp).connect(gn);
    } else o.connect(gn);
    if (opts.highpass) {
      tail = vFilter(r, 'highpass', opts.highpass, 0.7);
      gn.connect(tail);
    }
    panOut(r, tail, busUi, opts.pan || 0, t);
    env(gn.gain, t, opts.peak == null ? 0.08 : opts.peak, opts.attack || 0.004, opts.decay || 0.04);
    if (opts.reverb) gn.connect(vGain(r, opts.reverb)).connect(reverbSend);
    return gn;
  }

  const BLIPS = {
    hover(t, r) {
      uiTone(r, t, { type: 'sine', f0: 1760, f1: 1320, peak: 0.11, decay: 0.055, pan: rnd(-0.15, 0.15) });
    },
    click(t, r) {
      uiTone(r, t, { type: 'square', f0: 740, f1: 520, lowpass: 2400, peak: 0.12, decay: 0.04, pan: 0 });
      const n = vNoise(r, t);
      const g = vGain(r, 0);
      n.connect(vFilter(r, 'highpass', 1800, 0.8)).connect(g);
      panOut(r, g, busUi, 0, t);
      env(g.gain, t, 0.06, 0.001, 0.012);
    },
    confirm(t, r) {
      uiTone(r, t, { type: 'triangle', f0: 660, peak: 0.1, decay: 0.05 });
      uiTone(r, t + 0.055, { type: 'triangle', f0: 990, peak: 0.11, decay: 0.06 });
    },
    error(t, r) {
      uiTone(r, t, { type: 'sawtooth', f0: 220, f1: 110, lowpass: 900, q: 4, peak: 0.11, decay: 0.09 });
      uiTone(r, t, { type: 'square', f0: 55, lowpass: 300, peak: 0.06, decay: 0.08 });
    },
    deny(t, r) {
      uiTone(r, t, { type: 'square', f0: 140, lowpass: 420, peak: 0.09, decay: 0.03 });
      uiTone(r, t + 0.055, { type: 'square', f0: 110, lowpass: 420, peak: 0.08, decay: 0.04 });
    },
    type(t, r) {
      const n = vNoise(r, t);
      const g = vGain(r, 0);
      n.connect(vFilter(r, 'bandpass', rnd(1800, 3200), 2.2)).connect(g);
      panOut(r, g, busUi, rnd(-0.2, 0.2), t);
      env(g.gain, t, 0.07, 0.001, rnd(0.012, 0.03));
      uiTone(r, t, { type: 'square', f0: 1800, lowpass: 3200, peak: 0.024, decay: 0.008 });
    },
    tick(t, r) {
      uiTone(r, t, { type: 'sine', f0: 2093, peak: 0.085, attack: 0.001, decay: 0.02 });
    }
  };

  function blipInternal(kind) {
    if (!canPlay()) return;
    const key = typeof kind === 'string' && BLIPS[kind] ? kind : 'tick';
    uiVoice(0.14, (t, r, send) => {
      // shared tiny reverb send for all blips
      BLIPS[key](t, r);
      void send;
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
   * 9. TRANSITIONS — whoosh / scan sweep, both panned
   * ════════════════════════════════════════════════════════════════════════ */

  function whooshInternal() {
    play(1.2, (t, r) => {
      const n = vNoise(r, t);
      const bp = vFilter(r, 'bandpass', 260, 1.4);
      setAt(bp.frequency, 260, t);
      rampTo(bp.frequency, 2900, t + 0.02, 0.35);
      rampTo(bp.frequency, 480, t + 0.37, 0.7);
      const gn = vGain(r, 0);
      n.connect(bp).connect(gn);
      panOut(r, gn, busSfx, -0.85, t, 0.85, 1.0);
      setAt(gn.gain, 0.0001, t);
      rampTo(gn.gain, 0.2, t + 0.02, 0.26);
      rampTo(gn.gain, 0.0001, t + 0.3, 0.75, 'exp');
      gn.connect(vGain(r, 0.3)).connect(reverbSend);
    });
  }

  function scanSweepInternal() {
    play(1.7, (t, r) => {
      const o = vOsc(r, 'sine', 240, t);
      setAt(o.frequency, 240, t);
      rampTo(o.frequency, 2600, t + 0.01, 1.05, 'exp');
      const gn = vGain(r, 0);
      o.connect(gn);
      panOut(r, gn, busSfx, -0.9, t, 0.9, 1.1);
      setAt(gn.gain, 0.0001, t);
      rampTo(gn.gain, 0.1, t + 0.02, 0.06);
      rampTo(gn.gain, 0.0001, t + 0.08, 1.0, 'exp');

      const n = vNoise(r, t);
      const hp = vFilter(r, 'highpass', 600, 0.8);
      const ng = vGain(r, 0);
      n.connect(hp).connect(ng);
      panOut(r, ng, busSfx, 0.7, t, -0.7, 1.1);
      setAt(ng.gain, 0.0001, t);
      rampTo(ng.gain, 0.05, t + 0.02, 0.08);
      rampTo(ng.gain, 0.0001, t + 0.1, 0.95, 'exp');

      const p = vOsc(r, 'sine', 2093, t + 1.15);
      const pg = vGain(r, 0);
      p.connect(pg);
      panOut(r, pg, busSfx, 0.6, t + 1.15);
      setAt(pg.gain, 0.0001, t + 1.15);
      rampTo(pg.gain, 0.05, t + 1.15, 0.004);
      rampTo(pg.gain, 0.0001, t + 1.154, 0.3, 'exp');
      pg.connect(vGain(r, 0.6)).connect(reverbSend);
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
   * 10. BOOT SEQUENCE — ~4.5 s, internally scheduled from a single timestamp
   *
   * relay clicks → capacitor charge (rising sine) → hard-drive chatter →
   * low confirm thud.
   * ════════════════════════════════════════════════════════════════════════ */

  function bootSequenceInternal() {
    play(5.4, (t, r) => {
      const send = (node, amount) => node.connect(vGain(r, amount)).connect(reverbSend);

      const relayClick = (at, cf, level, pan) => {
        const n = vNoise(r, at);
        const bp = vFilter(r, 'bandpass', cf, 1.4);
        const gn = vGain(r, 0);
        n.connect(bp).connect(gn);
        panOut(r, gn, busSfx, pan, at);
        setAt(gn.gain, 0.0001, at);
        rampTo(gn.gain, level, at, 0.0015);
        rampTo(gn.gain, 0.0001, at + 0.002, 0.03, 'exp');
        send(gn, 0.15);
        // metallic body so the click reads on small speakers
        const o = vOsc(r, 'triangle', 210, at);
        const og = vGain(r, 0);
        o.connect(vFilter(r, 'lowpass', 1600, 0.8)).connect(og);
        panOut(r, og, busSfx, pan, at);
        setAt(og.gain, 0.0001, at);
        rampTo(og.gain, level * 0.7, at, 0.001);
        rampTo(og.gain, 0.0001, at + 0.002, 0.028, 'exp');
      };
      relayClick(t + 0.02, 1500, 0.16, -0.3);
      relayClick(t + 0.17, 1900, 0.14, 0.4);
      relayClick(t + 0.38, 1100, 0.18, -0.1);

      // Capacitor charge: two sines gliding up five octaves under an opening filter.
      const capAt = t + 0.45;
      const cap1 = vOsc(r, 'sine', 80, capAt);
      setAt(cap1.frequency, 80, capAt);
      rampTo(cap1.frequency, 1350, capAt, 3.05, 'exp');
      const cap2 = vOsc(r, 'sine', 160.7, capAt);
      setAt(cap2.frequency, 160.7, capAt);
      rampTo(cap2.frequency, 2700, capAt, 3.05, 'exp');
      const capLP = vFilter(r, 'lowpass', 1200, 2.0);
      const capG = vGain(r, 0);
      cap1.connect(capLP);
      cap2.connect(vGain(r, 0.35)).connect(capLP);
      capLP.connect(capG);
      panOut(r, capG, busSfx, 0.1, capAt);
      setAt(capLP.frequency, 1200, capAt);
      rampTo(capLP.frequency, 5200, capAt + 0.1, 3.0);
      setAt(capG.gain, 0.0001, capAt);
      rampTo(capG.gain, 0.06, capAt, 1.4);
      rampTo(capG.gain, 0.1, capAt + 2.45, 0.55);
      rampTo(capG.gain, 0.0001, capAt + 3.1, 0.25, 'exp');
      send(capG, 0.2);

      // Hard-drive chatter: dense band-passed noise bursts with servo ticks.
      for (let i = 0; i < 14; i++) {
        const at = t + 0.75 + (i / 14) * 2.75 + rnd(0, 0.09);
        const dur = rnd(0.025, 0.075);
        const n = vNoise(r, at);
        const bp = vFilter(r, 'bandpass', rnd(1100, 2900), 3.5);
        const gn = vGain(r, 0);
        n.connect(bp).connect(gn);
        panOut(r, gn, busSfx, rnd(-0.6, 0.6), at);
        setAt(gn.gain, 0.0001, at);
        rampTo(gn.gain, rnd(0.04, 0.08), at, 0.003);
        rampTo(gn.gain, 0.0001, at + dur, 0.02, 'exp');
        if (i % 3 === 0) {
          const o = vOsc(r, 'square', rnd(700, 1400), at);
          const og = vGain(r, 0);
          o.connect(vFilter(r, 'lowpass', 2600, 0.8)).connect(og);
          panOut(r, og, busSfx, rnd(-0.5, 0.5), at);
          setAt(og.gain, 0.0001, at);
          rampTo(og.gain, 0.012, at, 0.002);
          rampTo(og.gain, 0.0001, at + 0.005, 0.012, 'exp');
        }
      }

      // Low confirm thud.
      const at = t + 4.05;
      const o = vOsc(r, 'sine', 62, at);
      setAt(o.frequency, 62, at);
      rampTo(o.frequency, 33, at + 0.005, 0.35, 'exp');
      const lp = vFilter(r, 'lowpass', 140, 1.1);
      const gn = vGain(r, 0);
      o.connect(lp).connect(gn);
      panOut(r, gn, busSfx, 0, at);
      setAt(gn.gain, 0.0001, at);
      rampTo(gn.gain, 0.42, at, 0.008);
      rampTo(gn.gain, 0.0001, at + 0.06, 0.6, 'exp');
      const n = vNoise(r, at);
      const ng = vGain(r, 0);
      n.connect(vFilter(r, 'lowpass', 320, 0.8)).connect(ng);
      panOut(r, ng, busSfx, 0, at);
      env(ng.gain, at, 0.2, 0.005, 0.25);
      send(gn, 0.35);
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
   * 11. STINGS
   * ════════════════════════════════════════════════════════════════════════ */

  /* Rising impact for the tarot/hero reveal. */
  function startStingInternal() {
    play(3.6, (t, r) => {
      // low impact
      const hit = vOsc(r, 'sine', 96, t);
      setAt(hit.frequency, 96, t);
      rampTo(hit.frequency, 34, t + 0.01, 0.4, 'exp');
      const hg = vGain(r, 0);
      hit.connect(vFilter(r, 'lowpass', 200, 1.0)).connect(hg);
      panOut(r, hg, busSfx, 0, t);
      setAt(hg.gain, 0.0001, t);
      rampTo(hg.gain, 0.38, t, 0.004);
      rampTo(hg.gain, 0.0001, t + 0.04, 0.7, 'exp');
      hg.connect(vGain(r, 0.4)).connect(reverbSend);
      const hn = vNoise(r, t);
      const hng = vGain(r, 0);
      hn.connect(vFilter(r, 'lowpass', 400, 0.8)).connect(hng);
      panOut(r, hng, busSfx, 0, t);
      env(hng.gain, t, 0.16, 0.004, 0.35);

      // riser: detuned saws sweeping up under an opening filter
      const riserLP = vFilter(r, 'lowpass', 320, 1.6);
      const riserG = vGain(r, 0);
      riserLP.connect(riserG);
      panOut(r, riserG, busSfx, -0.4, t, 0.5, 1.8);
      [110, 138.59].forEach((f, i) => {
        const o = vOsc(r, 'sawtooth', f, t + 0.05, i ? 6 : -6);
        setAt(o.frequency, f, t + 0.05);
        rampTo(o.frequency, f * 4, t + 0.1, 1.55);
        o.connect(riserLP);
      });
      setAt(riserLP.frequency, 300, t + 0.05);
      rampTo(riserLP.frequency, 3600, t + 0.1, 1.5);
      setAt(riserG.gain, 0.0001, t + 0.05);
      rampTo(riserG.gain, 0.075, t + 0.1, 0.95);
      rampTo(riserG.gain, 0.0001, t + 1.05, 0.85, 'exp');
      riserG.connect(vGain(r, 0.3)).connect(reverbSend);

      // noise sweep
      const n = vNoise(r, t);
      const bp = vFilter(r, 'bandpass', 400, 1.5);
      const ng = vGain(r, 0);
      n.connect(bp).connect(ng);
      panOut(r, ng, busSfx, -0.6, t, 0.6, 1.5);
      setAt(bp.frequency, 400, t);
      rampTo(bp.frequency, 6000, t + 0.05, 1.4);
      setAt(ng.gain, 0.0001, t);
      rampTo(ng.gain, 0.1, t + 0.05, 1.2);
      rampTo(ng.gain, 0.0001, t + 1.25, 0.6, 'exp');
      ng.connect(vGain(r, 0.4)).connect(reverbSend);

      // bell ping
      const pingAt = t + 1.55;
      [1760, 2637].forEach((f, i) => {
        const p = vOsc(r, 'sine', f, pingAt);
        const pg = vGain(r, 0);
        p.connect(pg);
        panOut(r, pg, busSfx, i ? 0.3 : -0.2, pingAt);
        setAt(pg.gain, 0.0001, pingAt);
        rampTo(pg.gain, i ? 0.02 : 0.045, pingAt, 0.005);
        rampTo(pg.gain, 0.0001, pingAt + 0.02, 1.4, 'exp');
        pg.connect(vGain(r, 0.7)).connect(reverbSend);
      });
    });
  }

  /* Long decaying tail for the finale. */
  function endStingInternal() {
    play(9.8, (t, r) => {
      const chordLP = vFilter(r, 'lowpass', 900, 0.8);
      const chordG = vGain(r, 1);
      chordLP.connect(chordG).connect(busSfx);
      const notes = [
        [41.2, 0.09, 0.0], [61.74, 0.06, 0.0], [82.41, 0.047, 0.0],
        [110, 0.033, 0.0], [164.81, 0.022, 1]
      ];
      notes.forEach((n) => {
        const o = vOsc(r, n[2] ? 'triangle' : 'sine', n[0], t);
        const g = vGain(r, 0);
        o.connect(g).connect(chordLP);
        setAt(g.gain, 0.0001, t);
        rampTo(g.gain, n[1], t, 1.2);
        rampTo(g.gain, 0.0001, t + 1.2, 7.8, 'exp');
      });
      chordG.connect(vGain(r, 0.85)).connect(reverbSend);

      const air = vNoise(r, t);
      const ag = vGain(r, 0);
      air.connect(vFilter(r, 'bandpass', 700, 0.7)).connect(ag);
      panOut(r, ag, busSfx, 0.3, t);
      setAt(ag.gain, 0.0001, t);
      rampTo(ag.gain, 0.02, t + 0.4, 2.0);
      rampTo(ag.gain, 0.0001, t + 2.4, 6.5, 'exp');
      ag.connect(vGain(r, 0.6)).connect(reverbSend);

      const sh = vOsc(r, 'sine', 1318.51, t + 0.4);
      const shg = vGain(r, 0);
      sh.connect(shg);
      panOut(r, shg, busSfx, -0.4, t + 0.4);
      setAt(shg.gain, 0.0001, t + 0.4);
      rampTo(shg.gain, 0.014, t + 0.4, 2.0);
      rampTo(shg.gain, 0.0001, t + 2.4, 6.0, 'exp');
      shg.connect(vGain(r, 0.8)).connect(reverbSend);
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
   * 12. ENGINE CONTROL — init / enable / volume / scene / layers / dispose
   * ════════════════════════════════════════════════════════════════════════ */

  function initEngine() {
    if (initPromise) return initPromise;
    initPromise = new Promise((resolve) => {
      try {
        if (ready) { resolve(); return; }
        disposed = false;
        const AC = global.AudioContext || global.webkitAudioContext;
        if (typeof AC !== 'function') { unavailable = true; resolve(); return; }
        try { ctx = new AC(); } catch (e) {
          try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e2) { ctx = null; }
        }
        if (!ctx) { unavailable = true; resolve(); return; }
        buildGraph();
        ready = true;
        unavailable = false;
        kickResume();
        if (pendingScene) {
          const p = pendingScene;
          pendingScene = null;
          setSceneInternal(p);
        }
        LAYER_NAMES.forEach((n) => { if (layerWanted[n]) layerInternal(n, true); });
        fadeParam(muteGain.gain, enabled ? 1 : 0, 0.05);
        log('init ok', ctx.sampleRate + ' Hz', 'state=' + ctx.state);
      } catch (e) {
        warn('init failed', e);
        teardownBrokenGraph();
        unavailable = true;
      }
      resolve();
    });
    return initPromise;
  }

  function kickResume() {
    if (!ctx || typeof ctx.resume !== 'function') return;
    try {
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (e) { warn('resume', e); }
  }

  function setEnabledInternal(on) {
    enabled = !!on;
    if (!ready) return;
    if (enabled) kickResume();
    fadeParam(muteGain.gain, enabled ? 1 : 0, 0.15);
    log('enabled', enabled);
  }

  function setMasterVolumeInternal(v) {
    const next = clamp(num(v, volume), 0, 1);
    volume = next;
    if (ready) fadeParam(masterGain.gain, volumeToGain(next), 0.12);
  }

  function setIntensityInternal(x) {
    intensity = clamp(num(x, intensity), 0, 1);
    if (currentBed && typeof currentBed.intensity === 'function') {
      try { currentBed.intensity(intensity); } catch (e) { warn('intensity', e); }
    }
  }

  function setSceneInternal(name) {
    let key = typeof name === 'string' ? name : null;
    if (!key) return;
    if (!SCENE_BUILDERS[key]) key = SCENE_ALIAS[key] || null;
    if (!key) return;
    pendingScene = key;
    if (!ready || disposed) return;   // applied right after init
    if (currentScene === key) return;

    const next = buildBed(key);
    if (!next) return;
    if (currentBed) retireBed(currentBed, BED_FADE);
    currentBed = next;
    currentScene = key;
    next.fadeTo(1, BED_FADE);
    if (typeof next.intensity === 'function') {
      try { next.intensity(intensity); } catch (e) { warn('scene intensity', e); }
    }
    fadeParam(bdLayerBus.gain, key === 'bd' ? 1 : 0, BED_FADE);
    log('scene', key);
  }

  function layerInternal(name, on) {
    if (LAYER_NAMES.indexOf(name) < 0) return;
    const want = !!on;
    layerWanted[name] = want;
    if (!ready || disposed) return;
    const layer = ensureLayer(name);
    if (!layer) return;
    fadeParam(layer.out.gain, want ? (LAYER_LEVEL[name] || 0.8) : 0, LAYER_FADE);
    log('layer', name, want);
  }

  function teardownBrokenGraph() {
    [masterInput, masterHP, limiter, masterGain, muteGain, softClip, busBed, busSfx, busUi,
      bdLayerBus, reverbSend, convolver, reverbReturn].forEach(kill);
    masterInput = masterHP = limiter = masterGain = muteGain = softClip = null;
    busBed = busSfx = busUi = bdLayerBus = null;
    reverbSend = convolver = reverbReturn = null;
    try { if (ctx && typeof ctx.close === 'function') { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); } } catch (e) {}
    ctx = null;
    ready = false;
  }

  function disposeInternal() {
    if (disposed) return;
    disposed = true;
    ready = false;
    currentScene = null;
    pendingScene = null;
    currentBed = null;
    clearAllTimers();
    liveVoiceNodes.forEach(kill);
    liveVoiceNodes.clear();
    liveBeds.forEach((bed) => { try { bed.dispose(); } catch (e) {} });
    liveBeds.clear();
    LAYER_NAMES.forEach((n) => {
      if (layers[n]) { try { layers[n].dispose(); } catch (e) {} delete layers[n]; }
      layerWanted[n] = false;
    });
    [masterInput, masterHP, limiter, masterGain, muteGain, softClip, busBed, busSfx, busUi,
      bdLayerBus, reverbSend, convolver, reverbReturn].forEach(kill);
    masterInput = masterHP = limiter = masterGain = muteGain = softClip = null;
    busBed = busSfx = busUi = bdLayerBus = null;
    reverbSend = convolver = reverbReturn = null;
    noiseBuffer = null;
    activeVoices = 0;
    try {
      if (ctx && typeof ctx.close === 'function') {
        const p = ctx.close();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (e) { warn('close', e); }
    ctx = null;
    initPromise = null;
    log('disposed');
  }

  /* ════════════════════════════════════════════════════════════════════════
   * 13. PUBLIC API (every method is exception-proof; safe before init)
   * ════════════════════════════════════════════════════════════════════════ */

  const guard = (fn) => function () {
    try { return fn.apply(null, arguments); } catch (e) { warn('api', e); }
  };

  function apiInit() {
    try { return initEngine(); } catch (e) { warn('init', e); return Promise.resolve(); }
  }

  const NCAudio = {
    version: VERSION,
    init: apiInit,
    isEnabled: () => enabled,
    setEnabled: guard(setEnabledInternal),
    setMasterVolume: guard(setMasterVolumeInternal),
    blip: guard(blipInternal),
    whoosh: guard(whooshInternal),
    scanSweep: guard(scanSweepInternal),
    bootSequence: guard(bootSequenceInternal),
    setScene: guard(setSceneInternal),
    bdLayer: guard(layerInternal),
    startSting: guard(startStingInternal),
    endSting: guard(endStingInternal),
    setIntensity: guard(setIntensityInternal),
    dispose: guard(disposeInternal)
  };

  global.NCAudio = NCAudio;
})(typeof window !== 'undefined' ? window : this);
