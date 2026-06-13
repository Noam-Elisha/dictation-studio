// Roman-numeral progression generator. Output chords are key-independent
// specs: tones as [scaleDegree 1..7, chromaticAlter] pairs (relative to the
// major scale / NATURAL minor scale of the eventual key), with bass tone
// index, leading-tone / seventh roles, and durations in ticks.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});
  const T = DS.theory;

  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---- chord catalog ------------------------------------------------------
  // {tones, bass, lt, seventh, cad64, fn: T|PD|D, rT: degree the chord's LT
  //  pulls toward (secondary dominants & dominants)}
  function C(tones, bass, opts = {}) {
    return { tones, bass, lt: null, seventh: null, cad64: false, fn: 'T', rT: null, ...opts };
  }

  const CAT = {
    major: {
      I: C([[1, 0], [3, 0], [5, 0]], 0),
      I6: C([[1, 0], [3, 0], [5, 0]], 1),
      I64c: C([[1, 0], [3, 0], [5, 0]], 2, { cad64: true, fn: 'D' }),
      ii: C([[2, 0], [4, 0], [6, 0]], 0, { fn: 'PD' }),
      ii6: C([[2, 0], [4, 0], [6, 0]], 1, { fn: 'PD' }),
      ii65: C([[2, 0], [4, 0], [6, 0], [1, 0]], 1, { seventh: 3, fn: 'PD' }),
      IV: C([[4, 0], [6, 0], [1, 0]], 0, { fn: 'PD' }),
      IV6: C([[4, 0], [6, 0], [1, 0]], 1, { fn: 'PD' }),
      V: C([[5, 0], [7, 0], [2, 0]], 0, { lt: 1, fn: 'D', rT: 1 }),
      V6: C([[5, 0], [7, 0], [2, 0]], 1, { lt: 1, fn: 'D', rT: 1 }),
      V7: C([[5, 0], [7, 0], [2, 0], [4, 0]], 0, { lt: 1, seventh: 3, fn: 'D', rT: 1 }),
      V65: C([[5, 0], [7, 0], [2, 0], [4, 0]], 1, { lt: 1, seventh: 3, fn: 'D', rT: 1 }),
      V43: C([[5, 0], [7, 0], [2, 0], [4, 0]], 2, { lt: 1, seventh: 3, fn: 'D', rT: 1 }),
      V42: C([[5, 0], [7, 0], [2, 0], [4, 0]], 3, { lt: 1, seventh: 3, fn: 'D', rT: 1 }),
      vi: C([[6, 0], [1, 0], [3, 0]], 0),
      iii: C([[3, 0], [5, 0], [7, 0]], 0),
      iii6: C([[3, 0], [5, 0], [7, 0]], 1),
      viio6: C([[7, 0], [2, 0], [4, 0]], 1, { lt: 0, fn: 'D', rT: 1 }),
      'V/V': C([[2, 0], [4, 1], [6, 0]], 0, { lt: 1, fn: 'PD', rT: 5 }),
      'V7/V': C([[2, 0], [4, 1], [6, 0], [1, 0]], 0, { lt: 1, seventh: 3, fn: 'PD', rT: 5 }),
      'V65/V': C([[2, 0], [4, 1], [6, 0], [1, 0]], 1, { lt: 1, seventh: 3, fn: 'PD', rT: 5 }),
      'viio7/V': C([[4, 1], [6, 0], [1, 0], [3, -1]], 0, { lt: 0, seventh: 3, fn: 'PD', rT: 5 }),
      'V/ii': C([[6, 0], [1, 1], [3, 0]], 0, { lt: 1, fn: 'T', rT: 2 }),
      'V7/ii': C([[6, 0], [1, 1], [3, 0], [5, 0]], 0, { lt: 1, seventh: 3, fn: 'T', rT: 2 }),
      'V/vi': C([[3, 0], [5, 1], [7, 0]], 0, { lt: 1, fn: 'T', rT: 6 }),
      'V7/vi': C([[3, 0], [5, 1], [7, 0], [2, 0]], 0, { lt: 1, seventh: 3, fn: 'T', rT: 6 }),
      'V7/IV': C([[1, 0], [3, 0], [5, 0], [7, -1]], 0, { lt: 1, seventh: 3, fn: 'T', rT: 4 }),
      iv: C([[4, 0], [6, -1], [1, 0]], 0, { fn: 'PD' }),
      bVI: C([[6, -1], [1, 0], [3, -1]], 0, { fn: 'PD' }),
      N6: C([[2, -1], [4, 0], [6, -1]], 1, { fn: 'PD' }),
      It6: C([[6, -1], [1, 0], [4, 1]], 0, { lt: 2, fn: 'PD', rT: 5, aug6: true }),
      Fr43: C([[6, -1], [1, 0], [2, 0], [4, 1]], 0, { lt: 3, fn: 'PD', rT: 5, aug6: true }),
      Ger65: C([[6, -1], [1, 0], [3, -1], [4, 1]], 0, { lt: 3, fn: 'PD', rT: 5, aug6: true }),
    },
    minor: {
      i: C([[1, 0], [3, 0], [5, 0]], 0),
      i6: C([[1, 0], [3, 0], [5, 0]], 1),
      i64c: C([[1, 0], [3, 0], [5, 0]], 2, { cad64: true, fn: 'D' }),
      iio6: C([[2, 0], [4, 0], [6, 0]], 1, { fn: 'PD' }),
      'iiø65': C([[2, 0], [4, 0], [6, 0], [1, 0]], 1, { seventh: 3, fn: 'PD' }),
      iv: C([[4, 0], [6, 0], [1, 0]], 0, { fn: 'PD' }),
      iv6: C([[4, 0], [6, 0], [1, 0]], 1, { fn: 'PD' }),
      V: C([[5, 0], [7, 1], [2, 0]], 0, { lt: 1, fn: 'D', rT: 1 }),
      V6: C([[5, 0], [7, 1], [2, 0]], 1, { lt: 1, fn: 'D', rT: 1 }),
      V7: C([[5, 0], [7, 1], [2, 0], [4, 0]], 0, { lt: 1, seventh: 3, fn: 'D', rT: 1 }),
      V65: C([[5, 0], [7, 1], [2, 0], [4, 0]], 1, { lt: 1, seventh: 3, fn: 'D', rT: 1 }),
      V43: C([[5, 0], [7, 1], [2, 0], [4, 0]], 2, { lt: 1, seventh: 3, fn: 'D', rT: 1 }),
      V42: C([[5, 0], [7, 1], [2, 0], [4, 0]], 3, { lt: 1, seventh: 3, fn: 'D', rT: 1 }),
      VI: C([[6, 0], [1, 0], [3, 0]], 0),
      III: C([[3, 0], [5, 0], [7, 0]], 0),
      VII: C([[7, 0], [2, 0], [4, 0]], 0, { fn: 'PD', rT: 3 }),
      viio6: C([[7, 1], [2, 0], [4, 0]], 1, { lt: 0, fn: 'D', rT: 1 }),
      viio7: C([[7, 1], [2, 0], [4, 0], [6, 0]], 0, { lt: 0, seventh: 3, fn: 'D', rT: 1 }),
      'V/V': C([[2, 0], [4, 1], [6, 1]], 0, { lt: 1, fn: 'PD', rT: 5 }),
      'V7/V': C([[2, 0], [4, 1], [6, 1], [1, 0]], 0, { lt: 1, seventh: 3, fn: 'PD', rT: 5 }),
      'viio7/V': C([[4, 1], [6, 1], [1, 0], [3, 0]], 0, { lt: 0, seventh: 3, fn: 'PD', rT: 5 }),
      'V/iv': C([[1, 0], [3, 1], [5, 0]], 0, { lt: 1, fn: 'T', rT: 4 }),
      'V7/iv': C([[1, 0], [3, 1], [5, 0], [7, 0]], 0, { lt: 1, seventh: 3, fn: 'T', rT: 4 }),
      N6: C([[2, -1], [4, 0], [6, 0]], 1, { fn: 'PD' }),
      It6: C([[6, 0], [1, 0], [4, 1]], 0, { lt: 2, fn: 'PD', rT: 5, aug6: true }),
      Fr43: C([[6, 0], [1, 0], [2, 0], [4, 1]], 0, { lt: 3, fn: 'PD', rT: 5, aug6: true }),
      Ger65: C([[6, 0], [1, 0], [3, 0], [4, 1]], 0, { lt: 3, fn: 'PD', rT: 5, aug6: true }),
    },
  };

  // Forced continuation after secondary-function chords.
  const RESOLUTION = {
    'V/V': ['V', 'V7'],
    'V7/V': ['V', 'V7'],
    'V65/V': ['V'],
    'viio7/V': ['V'],
    'V/ii': ['ii', 'ii6'],
    'V7/ii': ['ii', 'ii6'],
    'V/vi': ['vi'],
    'V7/vi': ['vi'],
    'V7/IV': ['IV', 'IV6'],
    'V/iv': ['iv', 'iv6'],
    'V7/iv': ['iv', 'iv6'],
    VII: ['III'],
  };

  // ---- body transition tables by difficulty -------------------------------
  function table(difficulty, mode) {
    const t = {};
    const add = (from, pairs) => {
      t[from] = (t[from] || []).concat(pairs);
    };
    if (mode === 'major') {
      add('I', [['IV', 3], ['V', 2], ['V7', 1.2], ['I6', 1.5], ['vi', 0.8]]);
      add('I6', [['IV', 2.5], ['V', 2]]);
      add('IV', [['V', 2.5], ['V7', 1.5], ['I', 1], ['I6', 0.8]]);
      add('V', [['I', 2.5], ['I6', 1.2], ['vi', 0.85]]);
      add('V7', [['I', 2.5], ['vi', 0.7]]);
      add('vi', [['IV', 2.5]]);
      if (difficulty >= 2) {
        add('I', [['ii6', 1.5], ['V65', 0.5]]);
        add('I', [['viio6', 0.5]]);
        add('I6', [['viio6', 0.6]]);
        add('I', [['vi', 0.5]]);
        add('I6', [['ii6', 2], ['ii', 1], ['IV6', 0.8], ['V43', 0.5]]);
        add('IV', [['ii6', 1.2], ['viio6', 0.5], ['V42', 0.6], ['ii65', 0.6]]);
        add('IV6', [['V', 1.5], ['V6', 1], ['ii65', 0.8]]);
        add('ii', [['V', 2], ['V7', 1.5], ['viio6', 0.6], ['ii6', 0.6]]);
        add('ii6', [['V', 2.5], ['V7', 1.8], ['viio6', 0.6], ['V65', 0.6]]);
        // ii65 -> V (triad): its own 7th resolves into V, avoiding an
        // unpreparable second 7th (V7's seventh can't be reached from ii65
        // without a leap)
        add('ii65', [['V', 3]]);
        add('viio6', [['I', 2], ['I6', 2.2]]);
        add('V6', [['I', 3]]);
        add('V65', [['I', 3]]);
        add('V43', [['I', 1.5], ['I6', 2.5]]);
        add('V42', [['I6', 3]]);
        add('V', [['V42', 0.8], ['vi', 0.4]]);
        add('vi', [['ii6', 2], ['ii', 1], ['V', 0.6]]);
      }
      if (difficulty >= 3) {
        add('I', [['iii', 0.9]]);
        add('iii', [['IV', 1.3], ['vi', 1.8], ['ii6', 1.0], ['I6', 0.6]]);
        add('vi', [['iii', 1.3]]);
        add('I', [['V7/IV', 1.5], ['V/V', 1.2], ['V7/V', 1.2], ['V/vi', 1.0], ['V7/vi', 0.9], ['V/ii', 0.7], ['V7/ii', 0.9], ['viio7/V', 0.8]]);
        add('I6', [['V/V', 1.1], ['V7/IV', 1.0], ['V7/vi', 0.6]]);
        add('IV', [['V/V', 1.0], ['V7/V', 0.8]]);
        add('IV6', [['V7/V', 0.5]]);
        add('vi', [['V/V', 1.0], ['V65/V', 0.7], ['V/ii', 0.4]]);
        add('ii6', [['V/V', 0.6]]);
        add('ii', [['V7/V', 0.4]]);
      }
      if (difficulty >= 4) {
        add('I', [['iv', 0.9], ['bVI', 0.7], ['V7/IV', 0.8]]);
        add('I6', [['iv', 0.6]]);
        add('iv', [['V', 1.2], ['V7', 1.0], ['ii6', 0.4]]);
        add('bVI', [['IV', 0.8], ['ii6', 0.6], ['V', 0.6]]);
      }
    } else {
      add('i', [['iv', 3], ['V', 2], ['V7', 1.2], ['i6', 1.5], ['VI', 0.8]]);
      add('i6', [['iv', 2.5], ['V', 2]]);
      add('iv', [['V', 2.5], ['V7', 1.5], ['i', 1], ['i6', 0.8]]);
      add('V', [['i', 2.5], ['i6', 1.2], ['VI', 0.85]]);
      add('V7', [['i', 2.5], ['VI', 0.7]]);
      add('VI', [['iv', 2.5]]);
      if (difficulty >= 2) {
        add('i', [['viio6', 0.5]]);
        add('i6', [['viio6', 0.6]]);
        add('i', [['iio6', 1.2], ['VII', 0.6], ['V65', 0.5]]);
        add('i6', [['iio6', 1.8], ['iiø65', 1], ['V43', 0.4]]);
        add('iv', [['iio6', 0.6], ['V42', 0.6], ['viio6', 0.4]]);
        add('iv6', [['V', 2], ['V7', 1]]);
        add('iio6', [['V', 2.5], ['V7', 1.8], ['V65', 0.6]]);
        add('iiø65', [['V', 3]]); // -> V triad (see ii65 note in major)
        add('viio6', [['i', 2], ['i6', 2.2]]);
        add('V6', [['i', 3]]);
        add('V65', [['i', 3]]);
        add('V43', [['i', 1.5], ['i6', 2.5]]);
        add('V42', [['i6', 3]]);
        add('V', [['V42', 0.8]]);
        add('i', [['VII', 1.5]]); // open the relative-major area more often
        add('VII', [['III', 3]]);
        add('III', [['iv', 1.3], ['iio6', 1], ['VI', 1.3], ['iv6', 0.6]]);
        add('VI', [['iio6', 1.5], ['iiø65', 0.8]]);
        add('i', [['iv6', 0.4]]);
      }
      if (difficulty >= 3) {
        add('i', [['V/V', 1.1], ['V7/V', 1.1], ['V/iv', 1.0], ['V7/iv', 0.9], ['viio7/V', 0.8], ['VII', 1.0]]);
        add('i6', [['V7/V', 0.6], ['V/iv', 0.5]]);
        add('VI', [['V/V', 0.7], ['V7/V', 0.5]]);
        add('iv', [['V/V', 0.7]]);
        add('III', [['V/iv', 0.7], ['V7/iv', 0.5]]);
        add('VII', [['III', 2.5]]);
      }
      if (difficulty >= 4) {
        add('i', [['viio7', 0.7]]);
        add('i6', [['viio7', 0.5]]);
        add('viio7', [['i', 2], ['i6', 1]]);
        add('III', [['VII', 0.5]]);
      }
    }
    return t;
  }

  // ---- cadence templates ---------------------------------------------------
  // Each: {syms, type, minD, modes}
  const CADENCES = [
    { syms: ['V7', 'I'], type: 'PAC', minD: 1 },
    { syms: ['V', 'I'], type: 'PAC', minD: 1 },
    { syms: ['IV', 'V7', 'I'], type: 'PAC', minD: 1 },
    { syms: ['IV', 'V', 'I'], type: 'PAC', minD: 1 },
    { syms: ['I64c', 'V7', 'I'], type: 'PAC', minD: 1 },
    { syms: ['ii6', 'V7', 'I'], type: 'PAC', minD: 2 },
    { syms: ['ii6', 'V', 'I'], type: 'PAC', minD: 2 },
    { syms: ['ii65', 'V', 'I'], type: 'PAC', minD: 2 },
    { syms: ['ii6', 'I64c', 'V7', 'I'], type: 'PAC', minD: 2 },
    { syms: ['IV', 'I64c', 'V7', 'I'], type: 'PAC', minD: 2 },
    { syms: ['V6', 'I'], type: 'IAC', minD: 2 },
    { syms: ['IV', 'V6', 'I'], type: 'IAC', minD: 2 },
    { syms: ['IV', 'V'], type: 'HC', minD: 1 },
    { syms: ['I6', 'V'], type: 'HC', minD: 1 },
    { syms: ['ii6', 'V'], type: 'HC', minD: 2 },
    { syms: ['V7', 'vi'], type: 'DC', minD: 3 },
    { syms: ['IV', 'V7', 'vi'], type: 'DC', minD: 3 },
    { syms: ['N6', 'I64c', 'V7', 'I'], type: 'PAC', minD: 4 },
    { syms: ['Ger65', 'I64c', 'V7', 'I'], type: 'PAC', minD: 4 },
    { syms: ['It6', 'I64c', 'V7', 'I'], type: 'PAC', minD: 4 },
    { syms: ['Fr43', 'I64c', 'V7', 'I'], type: 'PAC', minD: 4 },
    { syms: ['N6', 'V'], type: 'HC', minD: 4 },
    { syms: ['It6', 'V'], type: 'HC', minD: 4 },
    { syms: ['Fr43', 'V'], type: 'HC', minD: 4 },
    { syms: ['Ger65', 'I64c', 'V'], type: 'HC', minD: 4 },
    { syms: ['V7/V', 'V'], type: 'HC', minD: 3 },
    { syms: ['IV', 'I'], type: 'PC', minD: 2 },          // plagal
    { syms: ['ii6', 'V', 'vi'], type: 'DC', minD: 3 },   // extra deceptive
    { syms: ['IV', 'V', 'vi'], type: 'DC', minD: 2 },
  ];
  const CADENCE_WEIGHT = { PAC: 4.5, IAC: 1.2, HC: 2.2, DC: 1.2, PHC: 1.0, PC: 1.0 };

  function minorize(syms) {
    const map = { I: 'i', I6: 'i6', I64c: 'i64c', IV: 'iv', ii6: 'iio6', ii65: 'iiø65', vi: 'VI' };
    return syms.map((s) => map[s] || s);
  }

  // cadenceClass: 'authentic' (PAC/IAC only, for a final phrase) | 'open'
  // (favor half/Phrygian cadences, for an internal phrase) | undefined (any).
  function pickCadence(rng, difficulty, mode, maxLen, cadenceClass, chromatic) {
    let pool = CADENCES.filter((c) => c.minD <= difficulty && c.syms.length <= maxLen);
    if (mode === 'minor' && difficulty >= 3)
      pool = pool.concat([{ syms: ['iv6', 'V'], type: 'PHC', minD: 3 }]);
    if (cadenceClass === 'authentic') pool = pool.filter((c) => c.type === 'PAC' || c.type === 'IAC');
    if (!pool.length) pool = CADENCES.filter((c) => c.type === 'PAC' && c.syms.length <= maxLen);
    // Favor spicier (higher-minD) cadences as difficulty rises, so chromatic
    // cadences (N6, augmented sixths, Phrygian) actually surface at D3-D4.
    const weighted = pool.map((c) => {
      let w = (CADENCE_WEIGHT[c.type] / Math.sqrt(c.syms.length)) * (1 + 0.7 * c.minD);
      if (cadenceClass === 'open') w *= (c.type === 'HC' || c.type === 'PHC' || c.type === 'PC') ? 3 : c.type === 'DC' ? 1.5 : 0.3;
      // augmented sixths and the Neapolitan are striking — keep them a bit
      // rarer, except at difficulty 5 which leans into the chromaticism
      if (!chromatic && c.syms.some((s) => s === 'N6' || s === 'It6' || s === 'Fr43' || s === 'Ger65')) w *= 0.6;
      return [c, w];
    });
    const chosen = DS.rng.weighted(rng, weighted);
    const syms = mode === 'minor' ? minorize(chosen.syms) : chosen.syms.slice();
    return { syms, type: chosen.type };
  }

  // ---- body walk -----------------------------------------------------------
  const CADENCE_ONLY = new Set(['I64c', 'i64c', 'N6', 'It6', 'Fr43', 'Ger65']);

  // Can `from` move to `to` without making voice-leading impossible?
  // A chordal 7th must be able to hold or fall by step; a leading tone must
  // be able to hold or resolve.
  function tendencyCompatible(from, to) {
    const toDegrees = new Set(to.tones.map((t) => t[0]));
    if (from.seventh != null) {
      const d7 = from.tones[from.seventh][0];
      const down = d7 === 1 ? 7 : d7 - 1;
      if (!toDegrees.has(d7) && !toDegrees.has(down)) return false;
    }
    if (from.lt != null && from.rT != null) {
      const dLt = from.tones[from.lt][0];
      if (!toDegrees.has(dLt) && !toDegrees.has(from.rT)) return false;
    }
    return true;
  }

  function canPrecede(t, fromSym, toSym, mode) {
    const from = CAT[mode][fromSym];
    const to = CAT[mode][toSym];
    if (!tendencyCompatible(from, to)) return false;
    const edges = t[fromSym];
    if (edges && edges.some(([s, w]) => s === toSym && w > 0)) return true;
    if (RESOLUTION[fromSym]) return RESOLUTION[fromSym].includes(toSym);
    if (toSym === 'I64c' || toSym === 'i64c') return from.fn !== 'D' || from.rT === 5;
    if (toSym.startsWith('V')) return true; // anything may approach the dominant
    return from.fn !== 'D';
  }

  // a chord that colours the harmony (secondary dominant or a borrowed chord)
  const isColour = (s) => /\//.test(s) || /^(bVI|bVII|iv|iio6|iiø65|viio7)$/.test(s);

  function walkBody(rng, t, start, len, cadenceHead, mode, chromatic) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const out = [start];
      let ok = true;
      while (out.length < len) {
        const cur = out[out.length - 1];
        const remaining = len - out.length;
        let options = (t[cur] || []).filter(
          ([s, w]) =>
            w > 0 && s !== cur && !CADENCE_ONLY.has(s) &&
            tendencyCompatible(CAT[mode][cur], CAT[mode][s])
        );
        if (RESOLUTION[cur]) options = RESOLUTION[cur].map((s) => [s, 1]);
        // a secondary needs room for its resolution before the cadence
        if (remaining === 1) options = options.filter(([s]) => !RESOLUTION[s]);
        if (!options.length) {
          ok = false;
          break;
        }
        // difficulty 5 leans chromatic — favour secondaries and borrowed chords
        if (chromatic) options = options.map(([s, w]) => [s, isColour(s) ? w * 2.4 : w]);
        out.push(DS.rng.weighted(rng, options));
      }
      if (!ok) continue;
      const last = out[out.length - 1];
      if (RESOLUTION[last]) continue;
      if (!canPrecede(t, last, cadenceHead, mode)) continue;
      if (last === cadenceHead) continue;
      return out;
    }
    return null;
  }

  // Harmonic rhythm: one chord per beat (quarter note) for the body, with the
  // occasional half note, and a held (half/whole) final chord. Bar-aligned in
  // 4/4 so phrases land cleanly. The chord count follows from the rhythm.
  const BODY_BARS = [
    [[48, 48, 48, 48], 6.5],
    [[96, 48, 48], 1], [[48, 48, 96], 1], [[48, 96, 48], 0.7],
    [[96, 96], 0.4],
  ];
  const FINAL_BARS = [
    [[48, 48, 96], 4.5], // two quarters then a half-note cadence chord on beat 3
    [[96, 96], 1.5],
    [[192], 1.2], // whole-bar final
  ];

  function buildRhythm(rng, bars) {
    const durs = [];
    for (let b = 0; b < bars - 1; b++) durs.push(...DS.rng.weighted(rng, BODY_BARS));
    durs.push(...DS.rng.weighted(rng, FINAL_BARS));
    return durs;
  }

  function legacyDurations(length) {
    // count-based fallback used by some tests: all quarters, whole-note final
    const durs = [];
    for (let i = 0; i < length - 1; i++) durs.push(48);
    durs.push(192);
    return durs;
  }

  function generate(rng, { difficulty, mode, bars, length, cadenceClass, chromatic }) {
    difficulty = Math.min(4, Math.max(1, difficulty || 1)); // no harmony beyond D4
    const t = table(difficulty, mode);
    const tonic = mode === 'minor' ? 'i' : 'I';
    const durations = length ? legacyDurations(length) : buildRhythm(rng, bars || 3);
    const M = durations.length;
    for (let attempt = 0; attempt < 40; attempt++) {
      const cadence = pickCadence(rng, difficulty, mode, M - 1, cadenceClass, chromatic);
      const bodyLen = M - cadence.syms.length;
      if (bodyLen < 1) continue;
      const body = walkBody(rng, t, tonic, bodyLen, cadence.syms[0], mode, chromatic);
      if (!body) continue;
      const syms = body.concat(cadence.syms);
      const chords = syms.map((sym, i) => ({ ...clone(CAT[mode][sym]), sym, dur: durations[i] }));
      const last = chords[chords.length - 1];
      if (cadence.type === 'PAC') last.sopranoEnd = [1];
      if (cadence.type === 'IAC') last.sopranoEnd = [3, 5];
      chords.cadence = cadence.type;
      return chords;
    }
    // fallback: guaranteed simple authentic phrase over the same rhythm
    const base = mode === 'minor' ? ['i', 'iv', 'V7', 'i'] : ['I', 'IV', 'V7', 'I'];
    const syms = [tonic];
    while (syms.length < M - 3) syms.push(syms.length % 2 ? base[1] : tonic);
    const all = syms.concat(base.slice(1)).slice(0, M);
    while (all.length < M) all.splice(all.length - 1, 0, tonic);
    const chords = all.map((sym, i) => ({ ...clone(CAT[mode][sym]), sym, dur: durations[i] }));
    chords[chords.length - 1].sopranoEnd = [1];
    chords.cadence = 'PAC';
    return chords;
  }

  // ---- single-phrase, beat-stream rhythm ----------------------------------
  // ---- harmonic expansion (prolongation) ---------------------------------
  // Expand one harmonic FUNCTION over time: a short sym-chain whose first and
  // last chord keep the function, with subordinate (inner) chords on weak
  // beats. This applies to EVERY function — predominant and dominant expansion
  // matter as much as tonic. Every sym already exists in CAT[mode].
  // Prolongation = expanding ONE harmony in time by departing to a subordinate
  // chord and returning. Every chain is therefore [X, connector, X'] (X' is X or
  // an inversion of it); a bare quality/inversion shuffle (I->I6, ii->ii6) is NOT
  // a prolongation. The connector is the dominant of the prolonged chord:
  //   - the tonic's own dominant V (or a neighbour IV, or a passing V43/vii°6
  //     between root and first inversion) — DIATONIC, available from D2;
  //   - a non-tonic chord's APPLIED dominant (ii-V/ii-ii6, V-V/V-V) — chromatic,
  //     so gated to D3+ in composeBody (where secondary dominants enter).
  const PROLONG = {
    major: {
      // tonic: dominant/subdominant neighbours, and bass-passing 1-2-3 / 3-2-1
      T: [['I', 'V', 'I'], ['I', 'V6', 'I'], ['I', 'V7', 'I'], ['I', 'IV', 'I'],
          ['I', 'V43', 'I6'], ['I', 'viio6', 'I6'], ['I6', 'V43', 'I']],
      // predominant tonicised by its applied dominant
      PD: [['ii', 'V/ii', 'ii6'], ['ii', 'V7/ii', 'ii6'], ['IV', 'V7/IV', 'IV6']],
      // dominant tonicised by its applied dominant (V of V)
      D: [['V', 'V/V', 'V'], ['V', 'V7/V', 'V']],
    },
    minor: {
      T: [['i', 'V', 'i'], ['i', 'V6', 'i'], ['i', 'V7', 'i'], ['i', 'iv', 'i'],
          ['i', 'V43', 'i6'], ['i', 'viio6', 'i6'], ['i6', 'V43', 'i']],
      PD: [['iv', 'V7/iv', 'iv6'], ['iv', 'V/iv', 'iv6']],
      D: [['V', 'V/V', 'V'], ['V', 'V7/V', 'V']],
    },
  };

  // A seam over walkBody (used only by buildPhrase, so the legacy generate()
  // path is untouched). It is a walk-with-prolongation builder: at each step it
  // may, with a difficulty-graded probability, expand the CURRENT function in
  // place by appending a PROLONG chain (an idiomatic passing/neighbour
  // elaboration of the same function) instead of taking a single walk-step. The
  // chord COUNT is unchanged — the chain consumes slots that the walk would
  // otherwise have filled one-by-one, so the phrase length stays budget-bound;
  // prolongation only changes the *content* of those slots. D1 never prolongs
  // (plain block-chord walk). Falls back to a plain walk if attempts fail.
  //
  // P_PROLONG is the per-step probability of expanding the current function with
  // a PROLONG chain. Kept moderate, and rising only gently with difficulty, so
  // the extra inner chords don't push soprano leaps past the leap-recovery soak
  // (voicing.test.mjs) — prolongation still surfaces in well over a third of D2+
  // bodies at these rates.
  const P_PROLONG = { 1: 0, 2: 0.22, 3: 0.28, 4: 0.30 };
  // Probability (per composeBody call, D3+) that the WHOLE body is rendered as a
  // descending-fifths sequence instead of a prolongation walk. These are the
  // *attempt* rates: sequenceBody returns null for some (mode, len, cadenceHead)
  // combinations, so the effective sequence rate is lower. The chromatic UI tier
  // (D5, harmonised at D4 with chromatic=true) leans into sequences hardest.
  const P_SEQ = { 3: 0.25, 4: { plain: 0.4, chromatic: 0.5 } };
  function composeBody(rng, t, len, cadenceHead, mode, difficulty, chromatic) {
    const tonic = mode === 'minor' ? 'i' : 'I';
    if (difficulty <= 1) return walkBody(rng, t, tonic, len, cadenceHead, mode, chromatic);
    // D3+: occasionally render the entire body as a descending-fifths sequence.
    // Call sequenceBody at most ONCE per composeBody (its voicing-probe gate is
    // costly), never inside the walk-attempt loop; fall through on null.
    if (difficulty >= 3 && len >= 3) {
      const pSeqRaw = P_SEQ[difficulty];
      const pSeq = typeof pSeqRaw === 'number' ? pSeqRaw : (chromatic ? pSeqRaw.chromatic : pSeqRaw.plain);
      if (pSeq && rng() < pSeq) {
        const seq = sequenceBody(rng, mode, len, difficulty, chromatic, cadenceHead);
        if (seq) return seq;
      }
    }
    const pProlong = P_PROLONG[difficulty] != null ? P_PROLONG[difficulty] : 0.42;
    for (let attempt = 0; attempt < 80; attempt++) {
      const out = [tonic];
      let ok = true;
      while (out.length < len) {
        const cur = out[out.length - 1];
        const remaining = len - out.length;
        // Try a prolongation chain that expands the current chord's function.
        // Predominant and dominant areas prolong more readily than the tonic
        // (fnBoost) and prefer the longer, more audible expansions, so PD/D
        // expansion actually surfaces rather than hiding behind the tonic's.
        const fn = CAT[mode][cur].fn;
        const fnBoost = fn === 'PD' ? 1.9 : fn === 'D' ? 1.4 : 1.0;
        if (!RESOLUTION[cur] && rng() < pProlong * fnBoost) {
          // applied-dominant (chromatic) chains only once secondaries are in play
          const allowApplied = difficulty >= 3;
          const pool = (PROLONG[mode][fn] || []).filter(
            (chain) => chain[0] === cur && chain.length - 1 <= remaining && chain.length >= 2 &&
              (allowApplied || !chain.some((s) => s.includes('/')))
          );
          if (pool.length) {
            const chain = DS.rng.weighted(rng, pool.map((c) => [c, c.length - 1]));
            for (let k = 1; k < chain.length; k++) out.push(chain[k]);
            continue; // walk resumes from the chain's last chord
          }
        }
        // Otherwise take a single weighted walk-step (mirrors walkBody).
        let options = (t[cur] || []).filter(
          ([s, w]) =>
            w > 0 && s !== cur && !CADENCE_ONLY.has(s) &&
            tendencyCompatible(CAT[mode][cur], CAT[mode][s])
        );
        if (RESOLUTION[cur]) options = RESOLUTION[cur].map((s) => [s, 1]);
        if (remaining === 1) options = options.filter(([s]) => !RESOLUTION[s]);
        if (!options.length) { ok = false; break; }
        if (chromatic) options = options.map(([s, w]) => [s, isColour(s) ? w * 2.4 : w]);
        out.push(DS.rng.weighted(rng, options));
      }
      if (!ok) continue;
      if (out.length !== len) continue; // a chain may overshoot the budget
      const last = out[out.length - 1];
      if (RESOLUTION[last]) continue;
      if (!canPrecede(t, last, cadenceHead, mode)) continue;
      if (last === cadenceHead) continue;
      return out;
    }
    // Prolongation attempts exhausted — fall back to a plain walk so composeBody
    // always returns a len-long array.
    return walkBody(rng, t, tonic, len, cadenceHead, mode, chromatic);
  }

  // ---- descending-fifths sequences ----------------------------------------
  // A sequence body is a fragment of the diatonic circle-of-fifths chain
  // descending from the tonic (each root a fifth below the previous). The
  // diminished step (vii° / II°) is rendered first-inversion (viio6 / iio6) for
  // voiceability; ii6 / iio6 likewise sit in first inversion, the idiomatic
  // pre-dominant shape. Three rendering modes colour the same skeleton.
  const SEQ_ORDER = {
    // Major avoids the diatonic vii°6 -> iii step (it leaves the leading tone
    // unresolved — a no-no in strict writing): use the clean iii - vi - ii6 - V
    // descending-fifths tail, opened on the tonic. Minor's VII is a real major
    // chord, so its full diatonic circle of fifths is fine.
    major: ['I', 'iii', 'vi', 'ii6', 'V'],
    minor: ['i', 'iv', 'VII', 'III', 'VI', 'iio6', 'V'],
  };
  // First-inversion substitutions that exist in the catalogue (smooth-bass
  // rendering). Chords absent here (vi, VII, VI, iv, III) have no `6` entry and
  // stay root; viio6/ii6/iio6 are already inverted in SEQ_ORDER.
  const SEQ_INV = {
    major: { I: 'I6', IV: 'IV6', iii: 'iii6', V: 'V6' },
    minor: { i: 'i6', iv: 'iv6', V: 'V6' },
  };
  // Applied-dominant insertions: each diatonic target in the chain may be
  // preceded by its secondary dominant (D4+/chromatic only). The secondary
  // resolves immediately into the target it precedes, which RESOLUTION confirms.
  // Keyed by the chain target sym -> the applied-dominant sym to insert.
  const SEQ_APPLIED = {
    major: { vi: 'V7/vi', ii6: 'V/ii', V: 'V/V' },
    minor: { iv: 'V7/iv', V: 'V/V' },
  };
  // Canonical keys used to voice-check sequence fragments. The voicing engine is
  // transposition-equivariant over these diatonic shapes, so a fragment that
  // voices cleanly here voices in any key of that mode.
  const SEQ_KEY = {
    major: { tonic: { step: 0, alter: 0 }, mode: 'major' }, // C major
    minor: { tonic: { step: 5, alter: 0 }, mode: 'minor' }, // A minor
  };

  // Voiceability is the bar: a candidate fragment must voice cleanly into a
  // minimal authentic cadence. Grammar (tendencyCompatible/canPrecede) accepts a
  // few tails that the voicer can't realise reliably — most notably the minor
  // submediant (VI) terminating the chain before V7 (...III VI V7): it voices at
  // best ~half the time and never in root position. We require ROBUST
  // voiceability — every probe seed must come out clean — so a coin-flip tail is
  // rejected, not admitted on a lucky seed (the integrating caller and the tests
  // each get a single voicing attempt, so "voices sometimes" isn't enough). If
  // the voicing engine isn't loaded (progression.js used standalone), fall back
  // to a grammar-only pass.
  // Memoised: seqVoices is a pure function of (mode, frag) — fixed key and
  // seeds — and only a few dozen distinct fragments ever occur, so without this
  // the 8 voicing probes per call dominate the soak AND the app's per-exercise
  // generation latency. Each distinct fragment is probed once, then free.
  const seqVoicesCache = new Map();
  function seqVoices(mode, frag) {
    const voicing = DS.voicing;
    if (!voicing) return true; // standalone: no engine to check against
    const ck = mode + '|' + frag.join(',');
    if (seqVoicesCache.has(ck)) return seqVoicesCache.get(ck);
    const key = SEQ_KEY[mode];
    const cadTonic = mode === 'minor' ? 'i' : 'I';
    const syms = frag.concat(['V7', cadTonic]);
    const chords = syms.map((s) => chordSpec(s, mode));
    chords[chords.length - 1].sopranoEnd = [1];
    let voiceable = true;
    for (let seed = 0; seed < 8 && voiceable; seed++) {
      const v = voicing.harmonize(DS.rng.create(seed * 101 + 7), key, chords);
      if (!(v && voicing.validate(key, chords, v).length === 0)) voiceable = false;
    }
    seqVoicesCache.set(ck, voiceable);
    return voiceable;
  }

  // Build a `len`-long descending-fifths fragment from the tonic, or null if it
  // can't connect to `cadenceHead`, if len < 3, or if a rendering can't be
  // built. Not wired into composeBody (Task 12 integrates it); the caller falls
  // back on null.
  function sequenceBody(rng, mode, len, difficulty, chromatic, cadenceHead) {
    if (len < 3) return null;
    const order = SEQ_ORDER[mode];
    if (!order || len > order.length) return null;
    const t = table(difficulty, mode);

    // Mode-selection weights, keyed off difficulty + chromatic (per the spec).
    // Applied-dominant is D4+ / chromatic only.
    let weights;
    if (difficulty >= 4 && chromatic) weights = { root: 0.25, smooth: 0.25, applied: 0.5 };
    else if (difficulty >= 4) weights = { root: 0.4, smooth: 0.3, applied: 0.3 };
    else weights = { root: 0.8, smooth: 0.2, applied: 0 };

    // Render the full order (length order.length) under the chosen mode, always
    // opening on the tonic in root position, then slice to `len`.
    const renderRoot = () => order.slice();
    const renderSmooth = () => {
      const inv = SEQ_INV[mode];
      // Alternate: invert every other chord where an inversion exists, but keep
      // position 0 (the tonic) root — composeBody opens the body on I/i root.
      return order.map((sym, i) => (i > 0 && i % 2 === 1 && inv[sym] ? inv[sym] : sym));
    };
    const renderApplied = () => {
      // Greedily expand the chain up to `len`, inserting a target's applied
      // dominant before it only when BOTH the secondary and its resolution fit
      // in the remaining budget — so the slice never ends on a dangling
      // secondary. Position 0 (tonic) is never preceded.
      const applied = SEQ_APPLIED[mode];
      const out = [];
      for (let i = 0; i < order.length && out.length < len; i++) {
        const sym = order[i];
        const sec = i > 0 ? applied[sym] : null;
        // need room for [sec, sym]; otherwise just the target
        if (sec && CAT[mode][sec] && out.length + 2 <= len && rng() < 0.6) out.push(sec);
        out.push(sym);
      }
      return out;
    };

    const builders = [];
    if (weights.root > 0) builders.push([renderRoot, weights.root]);
    if (weights.smooth > 0) builders.push([renderSmooth, weights.smooth]);
    if (weights.applied > 0) builders.push([renderApplied, weights.applied]);

    // Try the weighted choice first, then fall through to the others so a
    // valid fragment is preferred over null when one exists.
    const ordered = [];
    const chosen = DS.rng.weighted(rng, builders);
    ordered.push(chosen);
    for (const [b] of builders) if (b !== chosen) ordered.push(b);

    for (const build of ordered) {
      const full = build();
      if (full.length < len) continue;
      const frag = full.slice(0, len);
      if (frag.length !== len) continue;
      // never strand an applied dominant at the tail (its resolution got sliced)
      const last = frag[frag.length - 1];
      if (RESOLUTION[last]) continue;
      // every adjacent pair must be voice-leadable, and the tail must be able to
      // precede the cadence head
      let okSeq = true;
      for (let i = 1; i < frag.length && okSeq; i++)
        if (!tendencyCompatible(CAT[mode][frag[i - 1]], CAT[mode][frag[i]])) okSeq = false;
      if (!okSeq) continue;
      if (!canPrecede(t, last, cadenceHead, mode)) continue;
      if (last === cadenceHead) continue;
      // final gate: it must actually voice (catches grammar-legal-but-
      // unvoiceable tails, e.g. minor ...III VI before V7)
      if (!seqVoices(mode, frag)) continue;
      return frag;
    }
    return null;
  }

  const TPQ = 48, BAR = 192;
  const onStrong = (tick) => tick % BAR === 0 || tick % BAR === 96;

  // Lay `n` chords as quarter notes from `startPhase`; the last chord is the
  // cadence (its dur is `finalDur`, with a fermata). If the cadence would land
  // on a weak beat, lengthen exactly one earlier chord that *starts on a strong
  // beat* from a quarter to a half — a single +48 shift always moves a weak
  // landing onto a strong one, and a half that starts on a strong beat stays
  // within its bar, so no note crosses a barline. Returns the dur array.
  function assignBeatStream(n, startPhase, finalDur) {
    const durs = new Array(n).fill(TPQ);
    durs[n - 1] = finalDur;
    const finalStart = startPhase + TPQ * (n - 1);
    if (!onStrong(finalStart)) {
      // find the first non-final chord that begins on a strong beat; the chord
      // just before the cadence always qualifies, so this never fails for n>=2.
      for (let i = 0; i < n - 1; i++) {
        if (onStrong(startPhase + TPQ * i)) { durs[i] = 2 * TPQ; break; }
      }
    }
    return durs;
  }

  // The cadence note value follows the beat it lands on (chorale convention):
  //  - a downbeat (beat 1) cadence is a HALF note (it fills beats 1-2);
  //  - a beat-3 cadence is a half note, OR a quarter with a pickup into the
  //    next phrase (so the next phrase begins on beat 4).
  // The piece's final cadence is always a half note (nothing picks up after it).
  function cadenceDur(rng, cadStart, isFinal) {
    const phase = ((cadStart % BAR) + BAR) % BAR;
    if (phase === 0) return 2 * TPQ; // beat 1 -> half
    // beat 3 -> usually a quarter with a pickup into the next phrase; only
    // occasionally a half. (The piece's final cadence is always a half.)
    return isFinal || rng() < 0.25 ? 2 * TPQ : TPQ;
  }

  // Build one self-contained phrase as a beat-stream of quarters (with one
  // possible half to align the cadence) ending in a fermata-bearing cadence
  // chord. `beatBudget` is the rough chord count; `cadenceClass` steers the
  // cadence ('authentic' for a final phrase, 'open' for an internal one).
  // The closing chord's note value follows its landing beat (see cadenceDur).
  function buildPhrase(rng, { mode, difficulty, startPhase, beatBudget, cadenceClass, chromatic, isFinal }) {
    difficulty = Math.min(4, Math.max(1, difficulty || 1));
    const t = table(difficulty, mode);
    const tonic = mode === 'minor' ? 'i' : 'I';
    // a phrase needs at least one body chord plus the shortest cadence (2 chords)
    const budget = Math.max(3, beatBudget | 0);
    startPhase = ((startPhase | 0) % BAR + BAR) % BAR;

    for (let attempt = 0; attempt < 40; attempt++) {
      // cap the cadence so at least one body chord remains, but never below the
      // shortest cadence (2 chords) — pickCadence has no 1-chord cadence
      const maxCad = Math.max(2, budget - 1);
      const cadence = pickCadence(rng, difficulty, mode, maxCad, cadenceClass, chromatic);
      const bodyLen = budget - cadence.syms.length;
      if (bodyLen < 1) continue;
      const body = composeBody(rng, t, bodyLen, cadence.syms[0], mode, difficulty, chromatic);
      if (!body) continue;
      const syms = body.concat(cadence.syms);
      const durs = assignBeatStream(syms.length, startPhase, TPQ);
      let cadStart = startPhase;
      for (let i = 0; i < durs.length - 1; i++) cadStart += durs[i];
      durs[durs.length - 1] = cadenceDur(rng, cadStart, isFinal);
      const chords = syms.map((sym, i) => ({ ...clone(CAT[mode][sym]), sym, dur: durs[i] }));
      const last = chords[chords.length - 1];
      last.fermata = true;
      if (cadence.type === 'PAC') last.sopranoEnd = [1];
      if (cadence.type === 'IAC') last.sopranoEnd = [3, 5];
      chords.cadence = cadence.type;
      return chords;
    }

    // fallback: guaranteed authentic phrase over the same budget
    const base = mode === 'minor' ? ['i', 'iv', 'V7', 'i'] : ['I', 'IV', 'V7', 'I'];
    const syms = [tonic];
    while (syms.length < budget - 3) syms.push(syms.length % 2 ? base[1] : tonic);
    const all = syms.concat(base.slice(1)).slice(0, budget);
    while (all.length < budget) all.splice(all.length - 1, 0, tonic);
    const durs = assignBeatStream(all.length, startPhase, TPQ);
    let cadStart = startPhase;
    for (let i = 0; i < durs.length - 1; i++) cadStart += durs[i];
    durs[durs.length - 1] = cadenceDur(rng, cadStart, isFinal);
    const chords = all.map((sym, i) => ({ ...clone(CAT[mode][sym]), sym, dur: durs[i] }));
    const last = chords[chords.length - 1];
    last.fermata = true;
    last.sopranoEnd = [1];
    chords.cadence = 'PAC';
    return chords;
  }

  // Build a phrase whose cadence preferentially lands on beat 3 (phase 96) — the
  // anacrusis landing that keeps the music flowing across the barline (the next
  // phrase picks up on beat 4). Where the cadence lands is fixed by the phrase's
  // chord count and starting phase, so we try the base budget, then nearby ones,
  // and return the first attempt that lands on beat 3; otherwise the last try.
  // (A final/isFinal phrase that lands on beat 3 also closes the bar, since its
  // closing half note fills beats 3-4.)
  function buildPhraseToBeat3(rng, baseBudget, opts) {
    let chosen = null;
    for (const off of [0, 1, -1, 2, -2, 3, 4, 5]) {
      const beatBudget = baseBudget + off;
      if (beatBudget < 3) continue; // buildPhrase floors at 3
      const ph = buildPhrase(rng, { ...opts, beatBudget });
      chosen = ph;
      let cadStart = opts.startPhase;
      for (let i = 0; i < ph.length - 1; i++) cadStart += ph[i].dur;
      if ((((cadStart % BAR) + BAR) % BAR) === 96) break; // landed on beat 3
    }
    return chosen;
  }

  // A multi-phrase progression built from `buildPhrase`. The piece starts on a
  // downbeat (phase 0); each phrase is appended to a flat stream and a running
  // `phase = total % BAR` is threaded into the next, so an internal phrase may
  // cadence mid-bar (on beat 3) and the next picks up on the following beat (an
  // implicit anacrusis). Internal phrases are 'open' (half cadences); the last
  // is 'authentic'. Its closing chord is a half note (`isFinal`), so the piece
  // only closes the bar when that cadence lands on beat 3 — we rebuild the final
  // phrase over nearby beat budgets until the running total is a whole number of
  // bars. Returns one flat chord array with `.phraseEnds` (chord index ending
  // each phrase, for fermatas) and `.cadence` (the final cadence type).
  function generatePhrases(rng, { difficulty, mode, phrases, chromatic }) {
    const all = [];
    const phraseEnds = [];
    let lastType = 'PAC';
    let phase = 0; // the piece begins on a downbeat

    for (let p = 0; p < phrases - 1; p++) {
      // Internal phrases run a ~7–8 chord budget, nudged to land the cadence on
      // beat 3 (an anacrusis into the next phrase). The soprano-leap soak
      // (voicing.test.mjs) is normalised per leap rather than per phrase, so
      // longer phrases don't trip it.
      const baseBudget = 7 + Math.floor(rng() * 2);
      const ph = buildPhraseToBeat3(rng, baseBudget, {
        mode, difficulty, startPhase: phase, cadenceClass: 'open', chromatic, isFinal: false,
      });
      for (const c of ph) all.push(c);
      phase = (phase + ph.reduce((a, c) => a + c.dur, 0)) % BAR;
      phraseEnds.push(all.length - 1);
      lastType = ph.cadence;
    }

    // The final phrase must close the bar. A phrase that cadences on beat 3
    // closes it (the closing half note fills beats 3-4), so reuse the same
    // beat-3-preferring builder, here authentic and isFinal.
    const baseTotal = all.reduce((a, c) => a + c.dur, 0);
    const basePhase = baseTotal % BAR;
    const baseBudget = 7 + Math.floor(rng() * 2);
    const chosen = buildPhraseToBeat3(rng, baseBudget, {
      mode, difficulty, startPhase: basePhase, cadenceClass: 'authentic', chromatic, isFinal: true,
    });
    for (const c of chosen) all.push(c);
    phraseEnds.push(all.length - 1);
    lastType = chosen.cadence;

    all.phraseEnds = phraseEnds;
    all.cadence = lastType;
    return all;
  }

  // ---- modulation ----------------------------------------------------------

  // The pitch classes of the diatonic triad on `degree` of `key` (natural
  // scale; natural minor for minor).
  function triadPcs(key, degree) {
    const sc = T.scale(key);
    const at = (d) => sc[(((degree - 1 + d) % 7) + 7) % 7];
    return new Set([at(0), at(2), at(4)].map((p) => T.pc({ ...p, oct: 0 })));
  }
  function sameSet(a, b) {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  // Closely related keys (signature differs by at most one accidental).
  function closelyRelated(key) {
    const specs =
      key.mode === 'major'
        ? [[5, 'major', 'V'], [4, 'major', 'IV'], [6, 'minor', 'vi'], [2, 'minor', 'ii'], [3, 'minor', 'iii']]
        : [[3, 'major', 'III'], [5, 'minor', 'v'], [4, 'minor', 'iv'], [6, 'major', 'VI'], [7, 'major', 'VII']];
    return specs.map(([deg, mode, label]) => {
      const t = T.degreeNote(key, deg, 0);
      return { tonic: { step: t.step, alter: t.alter }, mode, label };
    });
  }

  // A diatonic-common-chord pivot: a predominant/tonic/submediant in key2 whose
  // pitches are also diatonic in key1.
  function findPivot(key1, key2) {
    for (const dg2 of [2, 4, 6, 1]) {
      const pcs2 = triadPcs(key2, dg2);
      for (let dg1 = 1; dg1 <= 7; dg1++) if (sameSet(pcs2, triadPcs(key1, dg1))) return dg2;
    }
    return null;
  }
  function pivotSym(mode, degree) {
    return mode === 'major'
      ? { 1: 'I', 2: 'ii6', 4: 'IV', 6: 'vi' }[degree]
      : { 1: 'i', 2: 'iio6', 4: 'iv', 6: 'VI' }[degree];
  }

  // Closely related targets that stay within five accidentals and have a
  // diatonic common-chord pivot from `key`.
  function modTargets(key) {
    return closelyRelated(key).filter(
      (k) => Math.abs(T.fifths(k)) <= 5 && findPivot(key, k) != null
    );
  }
  const MOD_W = { V: 3, vi: 2.5, III: 2.5, IV: 1.5, iv: 1.2, v: 0.9, ii: 0.6, iii: 0.6, VI: 0.6, VII: 0.5 };

  // `count` non-adjacent phrase indices in [0, phrases) to modulate at. Pivots
  // are never adjacent (no two modulations in a row, any difficulty) so a freshly
  // reached key always gets at least one phrase to settle before the next pivot.
  function pickModIndices(rng, phrases, count) {
    const sets = [];
    const rec = (start, chosen) => {
      if (chosen.length === count) { sets.push(chosen.slice()); return; }
      for (let i = start; i < phrases; i++) {
        if (chosen.length && i - chosen[chosen.length - 1] < 2) continue;
        chosen.push(i); rec(i + 1, chosen); chosen.pop();
      }
    };
    rec(0, []);
    return sets.length ? DS.rng.pick(rng, sets) : [];
  }

  // One pivoting phrase that confirms newKey: tonic(cur) | pivot(new) | V7(new) |
  // tonic(new). Harmonic content and the per-chord key/keyChange tags are fixed;
  // the rhythm is a flexible beat-stream from `startPhase` (quarters, plus one
  // half if needed to land the cadence on a strong beat — never crosses a
  // barline). The closing tonic bears the fermata (a half if `isFinal`, else a
  // quarter so the next phrase picks up on the next beat).
  function modPhrase(rng, curKey, newKey, dg2, startPhase, isFinal) {
    const tonicC = curKey.mode === 'minor' ? 'i' : 'I';
    const tonicN = newKey.mode === 'minor' ? 'i' : 'I';
    const preN = newKey.mode === 'minor' ? 'iio6' : 'ii6';
    const cad64N = newKey.mode === 'minor' ? 'i64c' : 'I64c';
    const pivot = pivotSym(newKey.mode, dg2);
    const label = T.name(newKey.tonic).replace('#', '♯').replace('b', '♭') + ':';
    // establish the current key (tonic), pivot into the new key (the common
    // chord carries the key-change label), then a full new-key cadence so the
    // phrase reaches ~2 bars: predominant - cadential 6/4 - V7 - tonic.
    const cells = [[tonicC, curKey, {}], [pivot, newKey, { keyChange: label }]];
    if (preN !== pivot) cells.push([preN, newKey, {}]);
    cells.push([cad64N, newKey, {}], ['V7', newKey, {}], [tonicN, newKey, { sopranoEnd: [1] }]);
    const durs = assignBeatStream(cells.length, startPhase, TPQ);
    let cadStart = startPhase;
    for (let i = 0; i < durs.length - 1; i++) cadStart += durs[i];
    durs[durs.length - 1] = cadenceDur(rng, cadStart, isFinal);
    const mk = (sym, key, dur, extra) => ({ ...clone(CAT[key.mode][sym]), sym, dur, key, ...extra });
    const out = cells.map(([sym, key, extra], i) => mk(sym, key, durs[i], extra));
    out[out.length - 1].fermata = true;
    return out;
  }

  // A multi-phrase progression with a progressive tonal plan: the first phrase
  // establishes the home key, one or more interior phrases pivot to a closely
  // related key (never two pivots in a row), and the last phrase confirms the
  // destination with an authentic cadence. Each modulation lands via a diatonic
  // common-chord pivot. Stay-phrases use ordinary open cadences (authentic on
  // the last). Each chord carries its governing `key`; every pivot carries a
  // `keyChange` label.
  function generateModulating(rng, { difficulty, mode, phrases, key1, chromatic }) {
    // Pivots occupy only the MIDDLE phrases (indices 1 .. phrases-2): the first
    // phrase establishes the home key and the last confirms the destination, and
    // no two pivots are adjacent. So modulation needs >= 3 phrases; with fewer,
    // the middle band is empty, nothing modulates, and we return null (the caller
    // falls back to a single-key plan). Non-adjacency caps the count over a band
    // of `midCount` phrases at ceil(midCount/2); we allow at most 2.
    const midCount = Math.max(0, phrases - 2);
    const maxMods = Math.min(2, Math.ceil(midCount / 2));
    let nMods = maxMods >= 1 ? 1 : 0;
    if (maxMods > 1) nMods = DS.rng.weighted(rng, [[1, 0.7], [2, 0.3]]);
    // pick within the middle band [0, midCount), then shift to real phrase
    // indices [1, phrases-1).
    const modAt = new Set(pickModIndices(rng, midCount, nMods).map((i) => i + 1));

    let curKey = key1;
    const all = [];
    const phraseEnds = [];
    const path = [key1];
    let modulated = false;
    let phase = 0; // the piece begins on a downbeat

    // ---- internal phrases (modulating or stay) ----------------------------
    for (let p = 0; p < phrases - 1; p++) {
      let phraseChords = null;

      if (modAt.has(p)) {
        const targets = modTargets(curKey);
        if (targets.length) {
          const newKey = DS.rng.weighted(rng, targets.map((t) => [t, MOD_W[t.label] || 0.5]));
          const dg2 = findPivot(curKey, newKey);
          if (dg2 != null) {
            phraseChords = modPhrase(rng, curKey, newKey, dg2, phase, false);
            curKey = newKey;
            path.push({ tonic: newKey.tonic, mode: newKey.mode });
            modulated = true;
          }
        }
      }

      if (!phraseChords) {
        phraseChords = buildPhraseToBeat3(rng, 7 + Math.floor(rng() * 2), {
          mode: curKey.mode, difficulty, startPhase: phase,
          cadenceClass: 'open', chromatic, isFinal: false,
        });
        for (const c of phraseChords) c.key = curKey;
      }

      for (const c of phraseChords) all.push(c);
      phase = (phase + phraseChords.reduce((a, c) => a + c.dur, 0)) % BAR;
      phraseEnds.push(all.length - 1);
    }

    if (!modulated) return null; // caller falls back to a non-modulating plan

    // ---- final phrase: a stay-phrase that closes the bar ------------------
    // Same as generatePhrases: an authentic, isFinal phrase nudged to cadence on
    // beat 3, which closes the bar (its closing half note fills beats 3-4).
    const baseTotal = all.reduce((a, c) => a + c.dur, 0);
    const basePhase = baseTotal % BAR;
    const chosen = buildPhraseToBeat3(rng, 7 + Math.floor(rng() * 2), {
      mode: curKey.mode, difficulty, startPhase: basePhase,
      cadenceClass: 'authentic', chromatic, isFinal: true,
    });
    for (const c of chosen) c.key = curKey;
    for (const c of chosen) all.push(c);
    phraseEnds.push(all.length - 1);

    all.phraseEnds = phraseEnds;
    all.cadence = chosen.cadence;
    all.modulation = { from: key1, to: { tonic: curKey.tonic, mode: curKey.mode }, path };
    return all;
  }

  // Display label, e.g. viio6 -> vii°6, I64c -> I64
  function display(sym) {
    return sym
      .replace('64c', '64')
      .replace(/viio/, 'vii°')
      .replace(/^iio/, 'ii°');
  }

  function chordSpec(sym, mode) {
    const spec = CAT[mode][sym];
    if (!spec) throw new Error(`unknown chord ${sym} in ${mode}`);
    return { ...clone(spec), sym };
  }

  DS.progression = {
    generate, generatePhrases, generateModulating, closelyRelated, chordSpec, display,
    _composeBody: composeBody, _buildPhrase: buildPhrase, _PROLONG: PROLONG,
    _sequenceBody: sequenceBody,
  };
})();
