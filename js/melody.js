// Melodic dictation generator: a singable diatonic line with leap
// compensation, correct minor-mode inflections, and a stepwise cadential
// ending (2-1 or 7-1) onto a held tonic.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});
  const T = DS.theory;

  const LO = 60; // C4
  const HI = 81; // A5

  // rhythm vocabularies in ticks per measure (final measure is one held note)
  const VOCAB = {
    '4/4': {
      1: [[48, 48, 48, 48], [96, 48, 48], [48, 48, 96], [96, 96]],
      2: [[72, 24, 48, 48], [48, 48, 72, 24], [24, 24, 48, 96], [48, 24, 24, 48, 48]],
      3: [[24, 24, 24, 24, 48, 48], [48, 24, 24, 24, 24, 48], [72, 24, 24, 24, 48]],
      4: [[24, 48, 24, 48, 48], [48, 24, 48, 24, 48]],
    },
    '3/4': {
      1: [[48, 48, 48], [96, 48], [48, 96]],
      2: [[72, 24, 48], [48, 24, 24, 48], [24, 24, 48, 48]],
      3: [[24, 24, 24, 24, 48], [48, 24, 24, 24, 24]],
      4: [[24, 48, 24, 48]],
    },
  };

  function isAugmented(a, b) {
    const iv = T.intervalBetween(a, b);
    let d = Math.abs(iv.d);
    let s = Math.abs(iv.s);
    if (d === 0) return false;
    while (d >= 7) {
      d -= 7;
      s -= 12;
    }
    return s > [0, 2, 4, 5, 7, 9, 11][d];
  }

  // Diatonic position grid: position 0 = tonic in octave 4, +1 per scale step.
  function gridFor(key) {
    const scale = T.scale(key);
    const tonicAbs = 4 * 7 + key.tonic.step;
    return function posToPitch(pos) {
      const abs = tonicAbs + pos;
      const degree = ((pos % 7) + 7) % 7; // 0 = tonic
      return { step: ((abs % 7) + 7) % 7, alter: scale[degree].alter, oct: Math.floor(abs / 7) };
    };
  }

  function rhythmFor(rng, { difficulty, bars, num }) {
    const vocab = VOCAB[`${num}/4`];
    const ticks = [];
    for (let b = 0; b < bars - 1; b++) {
      const pool = [];
      for (let d = 1; d <= difficulty; d++) for (const pat of vocab[d] || []) pool.push([pat, d === difficulty ? 2 : 1]);
      ticks.push(...DS.rng.weighted(rng, pool));
    }
    return ticks;
  }

  function generate(rng, opts) {
    const { difficulty, key, bars } = opts;
    const num = opts.num || 4;
    const mlen = (num * 192) / 4;
    const maxLeap = difficulty <= 2 ? 7 : 12;
    const minor = key.mode === 'minor';
    const posToPitch = gridFor(key);
    const midiAt = (pos) => T.midi(posToPitch(pos));
    const degreeAt = (pos) => ((pos % 7) + 7) % 7; // 0 = tonic ... 6 = leading/subtonic

    for (let attempt = 0; attempt < 30; attempt++) {
      const rhythm = rhythmFor(rng, { difficulty, bars, num });
      const K = rhythm.length;

      // anchor on 1/3/5 in a comfortable register
      const anchors = [0, 2, 4, 7, 9, 11, -3].filter((p) => {
        const m = midiAt(p);
        return m >= 62 && m <= 76;
      });
      const positions = [DS.rng.pick(rng, anchors)];
      let prevDelta = 0;
      let repeats = 0;
      let dead = false;

      const DELTAS = [
        [0, 0.5], [1, 3], [-1, 3], [2, 1.3], [-2, 1.3], [3, 0.5], [-3, 0.5], [4, 0.35], [-4, 0.35],
      ];
      if (difficulty >= 3) DELTAS.push([5, 0.12], [-5, 0.12], [7, 0.1], [-7, 0.1]);

      for (let i = 1; i <= K - 2; i++) {
        const cur = positions[i - 1];
        const options = DELTAS.filter(([d]) => {
          const next = cur + d;
          const m = midiAt(next);
          if (m < LO || m > HI) return false;
          const semis = m - midiAt(cur);
          if (Math.abs(semis) > maxLeap) return false;
          if (isAugmented(posToPitch(cur), posToPitch(next))) return false;
          if (Math.abs(prevDelta) >= 2 && Math.abs(midiAt(cur) - midiAt(cur - prevDelta)) >= 5) {
            // previous move was a real leap: must step back the other way
            if (Math.abs(d) !== 1 || Math.sign(d) === Math.sign(prevDelta)) return false;
          }
          if (d === 0 && repeats >= 1) return false;
          if (minor) {
            const deg = degreeAt(next);
            if (deg === 5 && Math.abs(d) !== 1) return false; // 6th degree by step only
            if (deg === 6 && d >= 2 && degreeAt(cur) !== 4) return false; // up-leap to 7 only from 5
          }
          return true;
        });
        if (!options.length) {
          dead = true;
          break;
        }
        const d = DS.rng.weighted(rng, options);
        positions.push(cur + d);
        repeats = d === 0 ? repeats + 1 : 0;
        prevDelta = d;
      }
      if (dead) continue;

      // steer the ending: penult = 2 or 7 adjacent to a nearby tonic
      const cur = positions[positions.length - 1];
      const lastWasLeap = Math.abs(prevDelta) >= 2 && Math.abs(midiAt(cur) - midiAt(cur - prevDelta)) >= 5;
      const cands = [];
      for (let fin = -7; fin <= 14; fin += 7) {
        for (const dir of [1, -1]) {
          const pen = fin + dir;
          const mPen = midiAt(pen);
          const mFin = midiAt(fin);
          if (mPen < LO || mPen > HI || mFin < LO || mFin > HI) continue;
          const semisIn = mPen - midiAt(cur);
          if (Math.abs(semisIn) > maxLeap) continue;
          if (pen === cur && positions.length >= 2 && positions[positions.length - 2] === cur) continue;
          if (isAugmented(posToPitch(cur), posToPitch(pen))) continue;
          if (lastWasLeap && (Math.abs(pen - cur) !== 1 || Math.sign(pen - cur) === Math.sign(prevDelta)))
            continue;
          if (Math.abs(semisIn) >= 5 && Math.sign(fin - pen) === Math.sign(pen - cur)) continue;
          if (minor && degreeAt(pen) === 5) continue; // don't end via 6th degree
          cands.push([{ pen, fin }, 1 / (1 + Math.abs(pen - cur))]);
        }
      }
      if (!cands.length) continue;
      const { pen, fin } = DS.rng.weighted(rng, cands);
      positions.push(pen);

      const notes = positions.map((p, i) => ({ ...posToPitch(p), dur: rhythm[i] }));
      notes.push({ ...posToPitch(fin), dur: mlen });

      // minor-mode inflections (positions[i] aligns with notes[i]; the final
      // held note sits at index positions.length with position `fin`)
      if (minor) {
        const posAt = (i) => (i < positions.length ? positions[i] : fin);
        // raise any degree-7 note that steps up to the tonic
        for (let i = 0; i < notes.length - 1; i++) {
          if (degreeAt(posAt(i)) === 6 && posAt(i + 1) === posAt(i) + 1) notes[i].alter += 1;
        }
        // then raise degree-6 notes stepping up into a raised 7
        for (let i = 0; i < notes.length - 1; i++) {
          if (degreeAt(posAt(i)) !== 5 || posAt(i + 1) !== posAt(i) + 1) continue;
          const natural7 = posToPitch(posAt(i) + 1).alter;
          if (notes[i + 1].alter === natural7 + 1) notes[i].alter += 1;
        }
      }

      // D4 (major): one chromatic passing tone
      if (difficulty >= 4 && !minor && rng() < 0.45) {
        for (let i = 0; i < notes.length - 2; i++) {
          const a = notes[i];
          const b = notes[i + 1];
          if (a.alter !== 0 || (a.dur !== 48 && a.dur !== 96)) continue;
          const iv = T.intervalBetween(a, b);
          if (Math.abs(iv.d) !== 1 || Math.abs(iv.s) !== 2) continue;
          const half = a.dur / 2;
          const chrom = { step: a.step, alter: iv.s > 0 ? 1 : -1, oct: a.oct, dur: half };
          a.dur = half;
          notes.splice(i + 1, 0, chrom);
          break;
        }
      }

      // optional one-beat upbeat within a 3rd of the opening note
      let upbeat = 0;
      if (opts.pickup) {
        const first = positions[0];
        const ups = [first - 1, first - 2, first + 1, first - 3].filter((p) => {
          const m = midiAt(p);
          if (m < LO || m > HI) return false;
          if (Math.abs(m - midiAt(first)) > 4) return false;
          if (minor && (degreeAt(p) === 5 || degreeAt(p) === 6)) return false;
          return !isAugmented(posToPitch(p), posToPitch(first));
        });
        if (ups.length) {
          notes.unshift({ ...posToPitch(DS.rng.pick(rng, ups)), dur: 48 });
          upbeat = 48;
        }
      }

      return { notes, upbeat };
    }

    // deterministic fallback: simple stepwise line, always legal
    const posToPitchF = gridFor(key);
    const rhythm = [];
    for (let b = 0; b < bars - 1; b++) rhythm.push(...(num === 3 ? [48, 48, 48] : [48, 48, 48, 48]));
    const notes = [];
    const path = [0, 1, 2, 3, 4, 3, 2, 1];
    for (let i = 0; i < rhythm.length - 1; i++) notes.push({ ...posToPitchF(path[i % path.length]), dur: rhythm[i] });
    notes.push({ ...posToPitchF(1), dur: rhythm[rhythm.length - 1] });
    const last = { ...posToPitchF(0), dur: mlen };
    notes.push(last);
    return { notes, upbeat: 0 };
  }

  DS.melody = { generate };
})();
