// Web Audio engine: a piano-ish synthesized voice, count-in clicks, the
// key-establishing cadence, and a stop-safe lookahead scheduler.
// Event building (ticks -> seconds, tie merging, fermata stretch) is pure
// and unit-tested in Node; everything touching AudioContext is browser-only.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});
  const T = DS.theory;

  // ---- pure: timeline building --------------------------------------------

  // Fermata intervals from the first voice (chorale fermatas are aligned).
  function fermataSpans(excerpt) {
    const spans = [];
    let tick = 0;
    for (const n of excerpt.voices[0]) {
      if (n.fermata) spans.push([tick, tick + n.dur]);
      tick += n.dur;
    }
    return spans;
  }

  // Map a tick to seconds, stretching fermata spans by FERMATA_MUL.
  const FERMATA_MUL = 2;
  function tickClock(excerpt, bpm, honorFermatas) {
    const secPerTick = 60 / bpm / 48;
    const spans = honorFermatas ? fermataSpans(excerpt) : [];
    return function secAt(tick) {
      let sec = tick * secPerTick;
      for (const [a, b] of spans) {
        const overlap = Math.max(0, Math.min(tick, b) - a);
        sec += overlap * secPerTick * (FERMATA_MUL - 1);
      }
      return sec;
    };
  }

  // events: [{midi, t, dur, voice, vel}], times in seconds from excerpt start
  function buildExcerptEvents(excerpt, opts = {}) {
    const bpm = opts.bpm || 72;
    const secAt = tickClock(excerpt, bpm, !!opts.honorFermatas);
    const voicesPlayed = opts.voicesPlayed || excerpt.voices.map((_, i) => i);
    const events = [];
    let lastTick = 0;

    excerpt.voices.forEach((notes, vi) => {
      let tick = 0;
      let pending = null; // tie accumulation
      for (const n of notes) {
        const startTick = tick;
        tick += n.dur;
        lastTick = Math.max(lastTick, tick);
        if (n.step < 0) continue;
        if (!voicesPlayed.includes(vi)) continue;
        if (pending && n.tieEnd) {
          pending.endTick = startTick + n.dur;
          if (!n.tieStart) {
            events.push(pending);
            pending = null;
          }
          continue;
        }
        const ev = {
          midi: T.midi(n),
          startTick,
          endTick: startTick + n.dur,
          voice: vi,
          vel: vi === 0 ? 0.95 : vi === 3 ? 0.9 : 0.75,
        };
        if (n.tieStart) pending = ev;
        else events.push(ev);
      }
      if (pending) events.push(pending);
    });

    for (const ev of events) {
      ev.t = secAt(ev.startTick);
      ev.dur = secAt(ev.endTick) - ev.t;
      delete ev.startTick;
      delete ev.endTick;
    }
    events.sort((a, b) => a.t - b.t);
    return { events, totalSec: secAt(lastTick) };
  }

  // I-IV-V7-I (or i-iv-V7-i) block chords, then the bare tonic.
  function buildCadenceEvents(key) {
    const P = DS.progression;
    const chords = ['I', 'IV', 'V7', 'I'].map((sym) =>
      P.chordSpec(key.mode === 'minor' ? { I: 'i', IV: 'iv', V7: 'V7' }[sym] || sym : sym, key.mode)
    );
    const rng = DS.rng.create(20260611);
    const voices = DS.voicing.harmonize(rng, key, chords);
    const events = [];
    const chordDur = 0.95;
    const lastDur = 1.5;
    voices.forEach((chord, i) => {
      const t = i * chordDur;
      const dur = i === voices.length - 1 ? lastDur : chordDur * 0.96;
      chord.forEach((p, vi) => {
        events.push({ midi: T.midi(p), t, dur, voice: null, vel: vi === 0 || vi === 3 ? 0.8 : 0.6 });
      });
    });
    const tTonic = (voices.length - 1) * chordDur + lastDur + 0.35;
    const tonicMidi = T.midi({ ...key.tonic, oct: 3 });
    events.push({ midi: tonicMidi, t: tTonic, dur: 1.4, voice: null, vel: 0.9 });
    events.push({ midi: tonicMidi + 12, t: tTonic, dur: 1.4, voice: null, vel: 0.75 });
    return { events, totalSec: tTonic + 1.6 };
  }

  function buildCountInEvents(num, bpm) {
    const beat = 60 / bpm;
    const events = [];
    for (let i = 0; i < num; i++) events.push({ click: true, t: i * beat, accent: i === 0 });
    return { events, totalSec: num * beat };
  }

  // ---- browser audio --------------------------------------------------------

  let ctx = null;
  let masterGain = null;
  let voiceGains = null;

  // Instrument: 'piano' (sampled, default) or 'synth' (oscillator voice).
  let timbre = 'piano';
  let pianoBank = null; // sorted [{midi, buffer}]
  let pianoReady = null; // Promise resolved once samples are decoded

  function setTimbre(name) {
    timbre = name === 'synth' ? 'synth' : 'piano';
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // Decode the embedded base64 piano samples once; resolves to nothing, fills
  // pianoBank. Falls back to an empty bank (-> synth voice) if data is absent.
  function ensurePiano() {
    if (pianoReady) return pianoReady;
    ensureContext();
    const data = window.DS_PIANO;
    if (!data || !data.samples) {
      pianoBank = [];
      pianoReady = Promise.resolve();
      return pianoReady;
    }
    pianoReady = Promise.all(
      Object.entries(data.samples).map(
        ([midi, b64]) =>
          new Promise((resolve) => {
            try {
              ctx.decodeAudioData(
                b64ToBytes(b64).buffer.slice(0),
                (buffer) => resolve({ midi: Number(midi), buffer }),
                () => resolve(null)
              );
            } catch (e) {
              resolve(null);
            }
          })
      )
    ).then((arr) => {
      pianoBank = arr.filter(Boolean).sort((a, b) => a.midi - b.midi);
    });
    return pianoReady;
  }

  function ensureContext() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 18;
      comp.ratio.value = 5;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      comp.connect(ctx.destination);
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(comp);
      voiceGains = [0, 1, 2, 3].map(() => {
        const g = ctx.createGain();
        g.connect(masterGain);
        return g;
      });
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setVoiceLevel(voice, level) {
    ensureContext();
    voiceGains[voice].gain.value = level;
  }

  // Sampled piano: nearest anchor, pitch-shifted, with a damper-like release.
  function pianoVoice(dest, midi, t, dur, vel, sources) {
    if (!pianoBank || !pianoBank.length) return synthVoice(dest, midi, t, dur, vel);
    let best = pianoBank[0];
    for (const s of pianoBank)
      if (Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
    const src = ctx.createBufferSource();
    src.buffer = best.buffer;
    src.playbackRate.value = Math.pow(2, (midi - best.midi) / 12);
    const g = ctx.createGain();
    const peak = vel * 0.6;
    g.gain.setValueAtTime(peak, t); // sample carries its own attack
    const tEnd = t + Math.max(0.12, dur);
    g.gain.setTargetAtTime(0.0001, tEnd, 0.14); // damper
    src.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(tEnd + 0.7);
    if (sources) sources.push(src);
    return tEnd + 0.7;
  }

  function synthVoice(dest, midi, t, dur, vel) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(7000, f * 7);
    filter.Q.value = 0.4;
    gain.connect(filter);
    filter.connect(dest);

    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = f;
    const g1 = ctx.createGain();
    g1.gain.value = 0.75;
    o1.connect(g1);
    g1.connect(gain);

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    o2.detune.value = 3;
    const g2 = ctx.createGain();
    g2.gain.value = 0.22 * Math.max(0.25, 1 - (midi - 48) / 50);
    o2.connect(g2);
    g2.connect(gain);

    const o3 = ctx.createOscillator();
    o3.type = 'sine';
    o3.frequency.value = f;
    o3.detune.value = -4;
    const g3 = ctx.createGain();
    g3.gain.value = 0.3;
    o3.connect(g3);
    g3.connect(gain);

    const peak = vel * 0.32;
    const g = gain.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + 0.012);
    g.exponentialRampToValueAtTime(peak * 0.55, t + 0.28);
    g.setTargetAtTime(peak * 0.32, t + 0.28, 0.9); // slow singing decay
    const tEnd = t + Math.max(0.06, dur);
    g.cancelScheduledValues(tEnd);
    g.setTargetAtTime(0.0001, tEnd, 0.045);
    const tStop = tEnd + 0.35;
    for (const o of [o1, o2, o3]) {
      o.start(t);
      o.stop(tStop);
    }
    return tStop;
  }

  function clickSound(dest, t, accent) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = accent ? 1860 : 1320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.34, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 0.09);
    return t + 0.09;
  }

  // Lookahead player. Each play() routes notes through per-segment gain
  // nodes (chained into the per-voice gains), so stop() can fade everything
  // out fast without touching other segments.
  function createPlayer() {
    let timer = null;
    let stopped = false;

    function play(events, totalSec, { onDone } = {}) {
      ensureContext();
      stopped = false;
      const perVoice = [0, 1, 2, 3].map((i) => {
        const g = ctx.createGain();
        g.connect(voiceGains[i]);
        return g;
      });
      const plain = ctx.createGain();
      plain.connect(masterGain);
      const kill = [plain, ...perVoice];
      const liveSources = [];

      let idx = 0;
      let t0 = 0;
      const HORIZON = 0.2;
      function begin() {
        if (stopped) return;
        t0 = ctx.currentTime + 0.12;
        timer = setInterval(() => {
          if (stopped) return;
          const now = ctx.currentTime;
          while (idx < events.length && t0 + events[idx].t < now + HORIZON) {
            const ev = events[idx++];
            if (ev.click) clickSound(plain, t0 + ev.t, ev.accent);
            else {
              const dest = ev.voice == null ? plain : perVoice[ev.voice];
              if (timbre === 'piano') pianoVoice(dest, ev.midi, t0 + ev.t, ev.dur, ev.vel, liveSources);
              else synthVoice(dest, ev.midi, t0 + ev.t, ev.dur, ev.vel);
            }
          }
          if (now > t0 + totalSec + 0.25) {
            clearInterval(timer);
            timer = null;
            if (!stopped && onDone) onDone();
          }
        }, 25);
      }

      // Piano needs its samples decoded first (one-time, ~tens of ms).
      if (timbre === 'piano') ensurePiano().then(begin);
      else begin();

      return {
        stop() {
          stopped = true;
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
          const now = ctx.currentTime;
          for (const s of liveSources) {
            try {
              s.stop(now + 0.06);
            } catch (e) { /* not started or already stopped */ }
          }
          for (const g of kill) {
            try {
              g.gain.setTargetAtTime(0.0001, now, 0.03);
              setTimeout(() => g.disconnect(), 250);
            } catch (e) { /* already gone */ }
          }
        },
      };
    }

    return { play };
  }

  DS.synth = {
    buildExcerptEvents,
    buildCadenceEvents,
    buildCountInEvents,
    ensureContext,
    setVoiceLevel,
    setTimbre,
    ensurePiano,
    createPlayer,
  };
})();
