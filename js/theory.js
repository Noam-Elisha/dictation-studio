// Music theory core: spelled pitches, keys, scales, intervals, transposition.
// Pitch: {step, alter, oct} — step 0..6 = C..B, oct is the scientific octave
// of the LETTER (so B#3 sounds like C4 but stays in octave 3).
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});

  const STEP_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const STEP_PC = [0, 2, 4, 5, 7, 9, 11]; // semitones above C for natural letters
  // Position of each natural letter on the line of fifths (C=0).
  const STEP_LOF = [0, 2, 4, -1, 1, 3, 5];
  const ALTER_SUFFIX = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: 'x' };

  function name(p) {
    return STEP_NAMES[p.step] + ALTER_SUFFIX[p.alter];
  }

  function parseName(s) {
    const step = STEP_NAMES.indexOf(s[0].toUpperCase());
    const rest = s.slice(1);
    const alter = rest === 'bb' ? -2 : rest === 'b' ? -1 : rest === '#' ? 1 : rest === 'x' || rest === '##' ? 2 : 0;
    return { step, alter };
  }

  function midi(p) {
    return 12 * (p.oct + 1) + STEP_PC[p.step] + p.alter;
  }

  function pc(p) {
    return ((STEP_PC[p.step] + p.alter) % 12 + 12) % 12;
  }

  // Line-of-fifths position of a spelled pitch (octave-free).
  function lof(p) {
    return STEP_LOF[p.step] + 7 * p.alter;
  }

  // Key signature as count of sharps (positive) / flats (negative).
  function fifths(key) {
    return lof(key.tonic) - (key.mode === 'minor' ? 3 : 0);
  }

  const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
  const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

  // {step: alter} for every letter altered by the key signature.
  function keyAccidentals(key) {
    const f = fifths(key);
    const map = {};
    if (f > 0) for (let i = 0; i < f; i++) map[SHARP_ORDER[i]] = 1;
    if (f < 0) for (let i = 0; i < -f; i++) map[FLAT_ORDER[i]] = -1;
    return map;
  }

  // Seven spelled degrees (natural minor for minor mode), octave-free.
  function scale(key) {
    const acc = keyAccidentals(key);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const step = (key.tonic.step + i) % 7;
      out.push({ step, alter: acc[step] || 0 });
    }
    return out;
  }

  // degree 1..7, alterAdj chromatic adjustment (+1 raised, -1 lowered).
  function degreeNote(key, degree, alterAdj = 0) {
    const base = scale(key)[(degree - 1) % 7];
    return { step: base.step, alter: base.alter + alterAdj };
  }

  // Directed interval between spelled pitches: d = letter steps, s = semitones.
  function intervalBetween(a, b) {
    const d = b.oct * 7 + b.step - (a.oct * 7 + a.step);
    const s = midi(b) - midi(a);
    return { d, s };
  }

  function transposeNote(p, iv) {
    const absStep = p.oct * 7 + p.step + iv.d;
    const step = ((absStep % 7) + 7) % 7;
    const oct = Math.floor(absStep / 7);
    const naturalMidi = 12 * (oct + 1) + STEP_PC[step];
    const alter = midi(p) + iv.s - naturalMidi;
    return { step, alter, oct };
  }

  function transposeKey(key, iv) {
    const t = transposeNote({ ...key.tonic, oct: 4 }, iv);
    return { tonic: { step: t.step, alter: t.alter }, mode: key.mode };
  }

  // For a semitone shift, choose the letter distance that lands on the
  // simplest enharmonic key (fewest accidentals; ties prefer natural tonic,
  // then the sharp side).
  function bestIntervalForShift(key, s) {
    if (s === 0) return { d: 0, s: 0 };
    let best = null;
    for (let d = -7; d <= 7; d++) {
      const iv = { d, s };
      const k2 = transposeKey(key, iv);
      if (Math.abs(k2.tonic.alter) > 1) continue;
      const f = fifths(k2);
      if (Math.abs(f) > 7) continue;
      const score = Math.abs(f) * 10 + Math.abs(k2.tonic.alter) * 2 - (f > 0 ? 1 : 0);
      if (!best || score < best.score) best = { iv, score };
    }
    return best ? best.iv : { d: 0, s: 0 };
  }

  DS.theory = {
    STEP_NAMES,
    name,
    parseName,
    midi,
    pc,
    lof,
    fifths,
    keyAccidentals,
    scale,
    degreeNote,
    intervalBetween,
    transposeNote,
    transposeKey,
    bestIntervalForShift,
  };
})();
