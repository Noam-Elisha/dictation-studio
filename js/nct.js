// Non-chord-tone embellishment. Takes the block SATB voicing (one pitch per
// voice per chord) and weaves in passing tones, neighbor tones and escape
// tones (diatonic and chromatic) as short off-beat notes, so generated
// harmonic dictation sounds like real four-part writing rather than block
// chords.
//
// Safety: only S/A/T are embellished (the bass stays one-note-per-chord so the
// Roman-numeral alignment is preserved), at most one voice per chord, and every
// candidate is rejected if it would introduce a parallel perfect interval,
// cross a neighboring voice, leave the voice's range, or make an augmented leap.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});
  const T = DS.theory;
  const RANGES = [
    [60, 79], // S
    [55, 74], // A
    [48, 67], // T
    [40, 60], // B
  ];

  const STEP_PC = [0, 2, 4, 5, 7, 9, 11];
  const E = 24; // embellishment length in ticks (an eighth note)

  const PROB = { 1: 0.06, 2: 0.2, 3: 0.34, 4: 0.46 };

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

  // diatonic pitch one letter-step from `p` in direction dir (+1/-1)
  function diatonicStep(key, p, dir) {
    const sc = T.scale(key);
    const absStep = p.oct * 7 + p.step + dir;
    const step = ((absStep % 7) + 7) % 7;
    const oct = Math.floor(absStep / 7);
    const alter = (sc.find((x) => x.step === step) || { alter: 0 }).alter;
    return { step, alter, oct };
  }

  // a semitone away keeping p's own letter (chromatic passing: G->G#->A,
  // A->Ab->G) — raise when ascending, lower when descending
  function chromaticPass(p, dir) {
    return { step: p.step, alter: p.alter + dir, oct: p.oct };
  }

  // a semitone away spelled with the adjacent lower letter (chromatic lower
  // neighbor: C->B, G->F#) — a leading-tone-style half step below
  function chromaticHalf(p, dir) {
    const absStep = p.oct * 7 + p.step + dir;
    const step = ((absStep % 7) + 7) % 7;
    const oct = Math.floor(absStep / 7);
    const natMidi = 12 * (oct + 1) + STEP_PC[step];
    const alter = T.midi(p) + dir - natMidi;
    return { step, alter, oct };
  }

  // Candidate NCTs connecting p1 (chord i) to p2 (chord i+1) in this voice.
  function candidates(key, p1, p2, difficulty) {
    const out = [];
    const iv = T.intervalBetween(p1, p2);
    const adv = difficulty >= 3;

    if (Math.abs(iv.d) === 2 && (Math.abs(iv.s) === 3 || Math.abs(iv.s) === 4)) {
      // passing tone through a third
      out.push({ type: 'passing', pitch: diatonicStep(key, p1, Math.sign(iv.d)) });
    } else if (Math.abs(iv.d) === 1 && Math.abs(iv.s) === 2 && adv) {
      // chromatic passing tone through a whole step (G->G#->A)
      out.push({ type: 'chromatic passing', pitch: chromaticPass(p1, Math.sign(iv.s)) });
    } else if (iv.d === 0 && iv.s === 0) {
      // neighbor tones (voice repeats)
      out.push({ type: 'upper neighbor', pitch: diatonicStep(key, p1, 1) });
      out.push({ type: 'lower neighbor', pitch: diatonicStep(key, p1, -1) });
      if (adv) out.push({ type: 'lower neighbor', pitch: chromaticHalf(p1, -1) });
    } else if (Math.abs(iv.d) === 1 && Math.abs(iv.s) <= 2 && adv) {
      // escape tone: step away opposite, then leap to p2
      out.push({ type: 'escape', pitch: diatonicStep(key, p1, -Math.sign(iv.d)) });
    }
    return out.filter((c) => c.pitch.alter >= -2 && c.pitch.alter <= 2);
  }

  // Would adding `nct` in voice v (others holding chord i, then all moving to
  // chord i+1) create a parallel perfect with any other voice?
  function makesParallel(nct, p2, blockNow, blockNext, v) {
    const a1 = T.midi(nct);
    const a2 = T.midi(p2);
    if (a1 === a2) return false;
    for (let w = 0; w < 4; w++) {
      if (w === v) continue;
      const b1 = T.midi(blockNow[w]);
      const b2 = T.midi(blockNext[w]);
      if (b1 === b2) continue;
      const before = ic(Math.max(a1, b1), Math.min(a1, b1));
      const after = ic(Math.max(a2, b2), Math.min(a2, b2));
      if (isPerfect(after) && before === after) return true;
    }
    return false;
  }

  function valid(nct, p1, p2, blockNow, blockNext, v) {
    const m = T.midi(nct);
    if (m < RANGES[v][0] || m > RANGES[v][1]) return false;
    if (v > 0 && m >= T.midi(blockNow[v - 1])) return false; // would cross/eq upper voice
    if (v < 3 && m <= T.midi(blockNow[v + 1])) return false; // would cross/eq lower voice
    if (isAugmented(p1, nct) || isAugmented(nct, p2)) return false;
    if (makesParallel(nct, p2, blockNow, blockNext, v)) return false;
    return true;
  }

  const note = (p, dur) => ({ step: p.step, alter: p.alter, oct: p.oct, dur, tieStart: false, tieEnd: false, fermata: false });

  // chords: progression specs with .dur; block: harmonize() result (chord-major).
  // Returns [[S notes], [A notes], [T notes], [B notes]] with NCTs woven in.
  function assemble(rng, key, chords, block, opts = {}) {
    const difficulty = opts.difficulty || 1;
    const n = chords.length;
    const prob = opts.embellish === false ? 0 : PROB[Math.min(4, Math.max(1, difficulty))] || 0;

    // Decide embellishments against the immutable block: emb[v][i] = nct pitch.
    // At most one voice embellished per chord (one moving voice per slot keeps
    // the parallel check valid).
    const emb = [{}, {}, {}, {}];
    for (let i = 0; i < n - 1; i++) {
      if (chords[i].dur < 2 * E) continue;
      if (rng() >= prob) continue;
      for (const v of DS.rng.shuffle(rng, [0, 1, 2])) {
        const p1 = block[i][v];
        const p2 = block[i + 1][v];
        const cands = candidates(key, p1, p2, difficulty).filter((c) =>
          valid(c.pitch, p1, p2, block[i], block[i + 1], v)
        );
        if (!cands.length) continue;
        emb[v][i] = DS.rng.pick(rng, cands).pitch;
        break;
      }
    }

    // Build each voice in one pass so indices stay aligned with chords.
    return [0, 1, 2, 3].map((v) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const nct = emb[v][i];
        if (nct) {
          out.push(note(block[i][v], chords[i].dur - E));
          out.push(note(nct, E));
        } else {
          out.push(note(block[i][v], chords[i].dur));
        }
      }
      return out;
    });
  }

  DS.nct = { assemble, candidates, valid };
})();
