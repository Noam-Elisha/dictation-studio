// Non-chord-tone embellishment. Takes the block SATB voicing (one pitch per
// voice per chord, quarter-note harmonic rhythm) and weaves in the off-beat
// figures that make four-part writing sound like real chorales:
//   passing tones, neighbor tones, escape tones (diatonic and chromatic),
//   plus on-beat suspensions and accented passing tones.
//
// Density is calibrated to the Bach corpus (~0.86 of the four voices carry an
// eighth-note figure on a typical beat at the top difficulty) and scaled down
// for easier exercises. Any voice — including the bass — may be embellished,
// and multiple voices may move at once; every tentative figure is validated
// against the whole texture so it introduces no parallel perfects, no voice
// crossing, no out-of-range note and no augmented melodic leap.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});
  const T = DS.theory;
  const RANGES = [
    [60, 79], // S
    [55, 74], // A
    [48, 67], // T
    [40, 62], // B (a touch lower than the generator floor for passing tones)
  ];
  const STEP_PC = [0, 2, 4, 5, 7, 9, 11];
  const E = 24; // eighth note

  // per-voice, per-beat probability of attempting a figure, by difficulty
  const P_BASE = { 1: 0.09, 2: 0.24, 3: 0.36, 4: 0.46 };
  // chance an attempted figure is an on-beat (suspension / accented passing) vs off-beat
  const P_ONBEAT = { 1: 0.16, 2: 0.24, 3: 0.32, 4: 0.36 };

  function ic(hi, lo) {
    return (((hi - lo) % 12) + 12) % 12;
  }
  const isPerfect = (i) => i === 0 || i === 7;

  function isAugmented(a, b) {
    const iv = T.intervalBetween(a, b);
    let d = Math.abs(iv.d);
    let s = Math.abs(iv.s);
    if (d === 0) return false;
    while (d >= 7) {
      d -= 7;
      s -= 12;
    }
    return s > STEP_PC[d];
  }

  function diatonicStep(key, p, dir) {
    const sc = T.scale(key);
    const absStep = p.oct * 7 + p.step + dir;
    const step = ((absStep % 7) + 7) % 7;
    const oct = Math.floor(absStep / 7);
    const alter = (sc.find((x) => x.step === step) || { alter: 0 }).alter;
    return { step, alter, oct };
  }
  // adjacent lower letter, a half step below (chromatic lower neighbor: G->F#)
  function chromaticHalf(p, dir) {
    const absStep = p.oct * 7 + p.step + dir;
    const step = ((absStep % 7) + 7) % 7;
    const oct = Math.floor(absStep / 7);
    const natMidi = 12 * (oct + 1) + STEP_PC[step];
    return { step, alter: T.midi(p) + dir - natMidi, oct };
  }

  const note = (p, dur, extra) => ({
    step: p.step, alter: p.alter, oct: p.oct, dur,
    tieStart: false, tieEnd: false, fermata: false, ...extra,
  });

  // ---- candidate figures ----------------------------------------------------

  // Off-beat figure decorating the END of chord i (the last eighth) in voice v,
  // connecting p1 (chord i) to p2 (chord i+1).
  function offbeatCandidates(key, p1, p2, difficulty) {
    const out = [];
    const iv = T.intervalBetween(p1, p2);
    const adv = difficulty >= 3;
    if (Math.abs(iv.d) === 2 && (Math.abs(iv.s) === 3 || Math.abs(iv.s) === 4)) {
      // passing tone filling a third with the diatonic note between
      out.push({ type: 'passing', pitch: diatonicStep(key, p1, Math.sign(iv.d)) });
    } else if (iv.d === 0 && iv.s === 0) {
      out.push({ type: 'upper neighbor', pitch: diatonicStep(key, p1, 1) });
      out.push({ type: 'lower neighbor', pitch: diatonicStep(key, p1, -1) });
      if (adv) out.push({ type: 'chromatic neighbor', pitch: chromaticHalf(p1, -1) });
    } else if (Math.abs(iv.d) === 1 && Math.abs(iv.s) <= 2 && adv) {
      // a plain step: prefer an anticipation — sound the next chord tone early
      // (approached by step, left by repetition); the échappée stays as a rare
      // alternative (assemble() weights anticipation far higher).
      out.push({ type: 'anticipation', pitch: { step: p2.step, alter: p2.alter, oct: p2.oct } });
      out.push({ type: 'escape', pitch: diatonicStep(key, p1, -Math.sign(iv.d)) });
    }
    return out.filter((c) => c.pitch.alter >= -2 && c.pitch.alter <= 2);
  }

  // On-beat (accented) figure occupying the START of chord i+1 (the first
  // eighth) in voice v, resolving to the chord tone p2 = block[i+1][v]. Both
  // options approach the dissonance by step / prepared common tone — never a
  // leap into the dissonance (no appoggiatura).
  //  - suspension: p1 (chord i) is held over (tied), then falls a step to p2
  //  - accented passing tone: p1 and p2 a third apart, the diatonic note
  //    between struck on the beat (stepwise in and out)
  function onbeatCandidates(key, p1, p2, difficulty) {
    const out = [];
    const iv = T.intervalBetween(p1, p2);
    if (iv.d === -1 && (iv.s === -1 || iv.s === -2)) {
      out.push({ type: 'suspension', pitch: p1, tie: true });
    }
    if (difficulty >= 3 && Math.abs(iv.d) === 2 && (Math.abs(iv.s) === 3 || Math.abs(iv.s) === 4)) {
      out.push({ type: 'accented passing', pitch: diatonicStep(key, p1, Math.sign(iv.d)), tie: false });
    }
    return out.filter((c) => c.pitch.alter >= -2 && c.pitch.alter <= 2);
  }

  // ---- texture grid + validation --------------------------------------------

  function buildVoice(block, chords, v, off, on) {
    const out = [];
    for (let i = 0; i < chords.length; i++) {
      const onb = on[v].get(i); // figure at the START of chord i
      const offb = off[v].get(i); // figure at the END of chord i
      const nextSus = on[v].get(i + 1); // tied suspension starting next chord?
      const head = block[i][v];
      let headDur = chords[i].dur;
      if (onb) {
        out.push(note(onb.pitch, E, { tieEnd: !!onb.tie }));
        headDur -= E;
      }
      // tie chord i's tail into a tied suspension on chord i+1 (same pitch)
      const tieTail = !offb && nextSus && nextSus.tie;
      if (offb) {
        out.push(note(head, headDur - E));
        out.push(note(offb, E));
      } else {
        out.push(note(head, headDur, { tieStart: tieTail }));
      }
    }
    return out;
  }

  function buildAll(block, chords, off, on) {
    return [0, 1, 2, 3].map((v) => buildVoice(block, chords, v, off, on));
  }

  const pc = (m) => ((m % 12) + 12) % 12;

  function activeChordIndex(tick, ctx) {
    for (let i = 0; i < ctx.starts.length; i++)
      if (tick >= ctx.starts[i] && tick < ctx.starts[i] + ctx.durs[i]) return i;
    return ctx.starts.length - 1;
  }

  // A sonority is dissonant when a non-chord tone forms a literal second
  // (one or two semitones) with another sounding voice.
  function dissonant(sonority, chordPcs) {
    for (let a = 0; a < 4; a++)
      for (let b = a + 1; b < 4; b++) {
        if (sonority[a] == null || sonority[b] == null) continue;
        const d = Math.abs(sonority[a] - sonority[b]);
        if (d !== 1 && d !== 2) continue;
        if (!chordPcs.has(pc(sonority[a])) || !chordPcs.has(pc(sonority[b]))) return true;
      }
    return false;
  }

  // Validate a tick window: (1) no parallel perfects, and (2) no two
  // consecutive dissonant sonorities — a non-chord-tone clash must resolve to
  // a consonance before the next one.
  function windowValid(voices, lo, hi, ctx) {
    const vo = voices.map((vl) => {
      const arr = [];
      let t = 0;
      for (const n of vl) {
        arr.push({ t, m: n.step < 0 ? null : T.midi(n) });
        t += n.dur;
      }
      return arr;
    });
    const onsets = new Set();
    for (const arr of vo) for (const e of arr) if (e.t >= lo && e.t < hi) onsets.add(e.t);
    const ticks = [...onsets].sort((a, b) => a - b);
    if (!ticks.length) return true;
    const pitchAt = (vi, tick) => {
      let cur = vo[vi][0];
      for (const e of vo[vi]) {
        if (e.t <= tick) cur = e;
        else break;
      }
      return cur.m;
    };
    const sonorityAt = (tick) => [0, 1, 2, 3].map((vi) => pitchAt(vi, tick));
    // seed from the sonority just before the window so motion/dissonance INTO
    // the first in-window onset is checked too
    let prev = sonorityAt(ticks[0] - 1);
    let prevDiss = dissonant(prev, ctx.chordPcs[activeChordIndex(ticks[0] - 1, ctx)]);
    for (const tick of ticks) {
      const chord = sonorityAt(tick);
      for (let a = 0; a < 4; a++)
        for (let b = a + 1; b < 4; b++) {
          if (prev[a] == null || prev[b] == null || chord[a] == null || chord[b] == null) continue;
          const before = ic(Math.max(prev[a], prev[b]), Math.min(prev[a], prev[b]));
          const after = ic(Math.max(chord[a], chord[b]), Math.min(chord[a], chord[b]));
          const moved = prev[a] !== chord[a] && prev[b] !== chord[b];
          if (moved && isPerfect(after) && before === after) return false;
        }
      const diss = dissonant(chord, ctx.chordPcs[activeChordIndex(tick, ctx)]);
      if (diss && prevDiss) return false; // two dissonant sonorities in a row
      prev = chord;
      prevDiss = diss;
    }
    return true;
  }

  // basic per-voice legality of a single inserted pitch against the held chord
  function pitchOK(pitch, neighbors, v, around) {
    const m = T.midi(pitch);
    if (m < RANGES[v][0] || m > RANGES[v][1]) return false;
    if (v > 0 && neighbors[v - 1] != null && m > neighbors[v - 1]) return false;
    if (v < 3 && neighbors[v + 1] != null && m < neighbors[v + 1]) return false;
    for (const p of around) if (isAugmented(p, pitch) === true) return false;
    return true;
  }

  // ---- assembly -------------------------------------------------------------

  function assemble(rng, key, chords, block, opts = {}) {
    const difficulty = Math.min(4, Math.max(1, opts.difficulty || 1));
    const n = chords.length;
    const off = [new Map(), new Map(), new Map(), new Map()];
    const on = [new Map(), new Map(), new Map(), new Map()];
    if (opts.embellish === false) return buildAll(block, chords, off, on);

    const starts = [];
    let acc = 0;
    for (const c of chords) {
      starts.push(acc);
      acc += c.dur;
    }
    const total = acc;
    const pBase = P_BASE[difficulty];
    const pOn = P_ONBEAT[difficulty];
    const diss = {
      starts,
      durs: chords.map((c) => c.dur),
      chordPcs: block.map((ch) => new Set(ch.map((p) => pc(T.midi(p))))),
    };
    const skip = opts.skipChords || new Set(); // phrase-end chords stay clean (held)

    for (let i = 0; i < n - 1; i++) {
      if (chords[i].dur < 2 * E) continue;
      if (skip.has(i)) continue; // don't embellish out of a held phrase ending
      let placed = 0;
      for (const v of DS.rng.shuffle(rng, [0, 1, 2, 3])) {
        if (rng() >= pBase * Math.pow(0.62, placed)) continue;
        const held = block[i].map((p) => T.midi(p));
        const p1 = block[i][v];
        const p2 = block[i + 1][v];

        // choose off-beat vs on-beat; on-beat needs chord i+1 to have room
        const wantOn = rng() < pOn && chords[i + 1].dur >= 2 * E && !on[v].has(i + 1) && !skip.has(i + 1);
        let chosen = null;
        let kind = 'off';
        if (wantOn) {
          // an on-beat figure sounds on chord i+1's downbeat, so spell it in
          // that chord's key (matters once a phrase has modulated)
          const cands = onbeatCandidates(chords[i + 1].key || key, p1, p2, difficulty).filter((c) =>
            // check both the approach (p1->figure) and resolution (figure->p2)
            pitchOK(c.pitch, block[i + 1].map((p) => T.midi(p)), v, [p1, p2])
          );
          if (cands.length) {
            chosen = DS.rng.pick(rng, cands);
            kind = 'on';
          }
        }
        if (!chosen) {
          // a quarter chord has room for only one figure; don't add an off-beat
          // tail to a chord that already carries an on-beat figure
          if (on[v].has(i)) continue;
          // an off-beat figure sounds within chord i's span, so spell it in
          // that chord's key (matters once a phrase has modulated)
          let cands = offbeatCandidates(chords[i].key || key, p1, p2, difficulty).filter((c) =>
            pitchOK(c.pitch, held, v, [p1, p2])
          );
          if (!cands.length) continue;
          // neighbor tones (on a repeated note) are easy to overuse — never put
          // one right after this voice's previous figure (that produces a voice
          // just oscillating between two notes in eighths), and thin them out
          if (cands.every((c) => /neighbor/.test(c.type))) {
            if (off[v].has(i - 1) || on[v].has(i - 1)) continue;
            if (rng() < 0.35) continue;
          }
          // step motions: usually leave plain (anticipations are idiomatically
          // sparse, mostly cadential); when embellished, strongly prefer an
          // anticipation over the (leapy) échappée
          if (cands.every((c) => c.type === 'anticipation' || c.type === 'escape')) {
            if (rng() < 0.5) continue;
            const ant = cands.filter((c) => c.type === 'anticipation');
            const esc = cands.filter((c) => c.type === 'escape');
            cands = ant.length && rng() < 0.85 ? ant : esc.length ? esc : cands;
          }
          chosen = DS.rng.pick(rng, cands);
          kind = 'off';
        }

        // tentatively place, validate the affected window, keep or revert
        if (kind === 'on') {
          on[v].set(i + 1, chosen);
          const lo = starts[i + 1] - E;
          const hi = Math.min(total, starts[i + 1] + chords[i + 1].dur + 1);
          if (windowValid(buildAll(block, chords, off, on), lo, hi, diss)) placed++;
          else on[v].delete(i + 1);
        } else {
          off[v].set(i, chosen.pitch);
          const lo = starts[i];
          const hi = Math.min(total, starts[i] + chords[i].dur + chords[i + 1].dur + 1);
          if (windowValid(buildAll(block, chords, off, on), lo, hi, diss)) placed++;
          else off[v].delete(i);
        }
      }
    }

    return deAlternate(buildAll(block, chords, off, on));
  }

  // Safety net: collapse any voice that ends up oscillating between two notes
  // in straight eighths (X Y X Y) by holding the second pair as a plain note —
  // removing a neighbor only reduces dissonance, never adds a parallel.
  function deAlternate(voices) {
    for (const notes of voices) {
      const isE = (n) => n.dur === E && n.step >= 0 && !n.tieStart && !n.tieEnd;
      let i = 0;
      while (i + 3 < notes.length) {
        if (
          isE(notes[i]) && isE(notes[i + 1]) && isE(notes[i + 2]) && isE(notes[i + 3]) &&
          T.midi(notes[i]) === T.midi(notes[i + 2]) &&
          T.midi(notes[i + 1]) === T.midi(notes[i + 3]) &&
          T.midi(notes[i]) !== T.midi(notes[i + 1])
        ) {
          notes[i + 2].dur += notes[i + 3].dur; // hold the second X, drop its neighbor
          notes.splice(i + 3, 1);
        } else {
          i++;
        }
      }
    }
    return voices;
  }

  DS.nct = { assemble, offbeatCandidates, onbeatCandidates };
})();
