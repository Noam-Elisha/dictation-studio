// Roman-numeral progression generator. Output chords are key-independent
// specs: tones as [scaleDegree 1..7, chromaticAlter] pairs (relative to the
// major scale / NATURAL minor scale of the eventual key), with bass tone
// index, leading-tone / seventh roles, and durations in ticks.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});

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
      Ger65: C([[6, -1], [1, 0], [3, -1], [4, 1]], 0, { lt: 3, fn: 'PD', rT: 5 }),
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
      Ger65: C([[6, 0], [1, 0], [3, 0], [4, 1]], 0, { lt: 3, fn: 'PD', rT: 5 }),
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
      add('V', [['I', 2.5], ['I6', 1.2], ['vi', 0.6]]);
      add('V7', [['I', 2.5], ['vi', 0.5]]);
      add('vi', [['IV', 2.5]]);
      if (difficulty >= 2) {
        add('I', [['ii6', 1.5], ['V65', 0.5]]);
        add('I6', [['ii6', 2], ['ii', 1], ['IV6', 0.8], ['V43', 0.5]]);
        add('IV', [['ii6', 1.2], ['viio6', 0.5], ['V42', 0.6], ['ii65', 0.6]]);
        add('IV6', [['V', 1.5], ['V6', 1], ['ii65', 0.8]]);
        add('ii', [['V', 2], ['V7', 1.5], ['viio6', 0.6], ['ii6', 0.6]]);
        add('ii6', [['V', 2.5], ['V7', 1.8], ['viio6', 0.6], ['V65', 0.6]]);
        add('ii65', [['V', 2.5], ['V7', 1.5]]);
        add('viio6', [['I', 2], ['I6', 2.2]]);
        add('V6', [['I', 3]]);
        add('V65', [['I', 3]]);
        add('V43', [['I', 1.5], ['I6', 2.5]]);
        add('V42', [['I6', 3]]);
        add('V', [['V42', 0.8], ['vi', 0.4]]);
        add('vi', [['ii6', 2], ['ii', 1], ['V', 0.6]]);
      }
      if (difficulty >= 3) {
        add('I', [['V7/IV', 0.8], ['V/V', 0.6], ['V7/V', 0.6], ['V/vi', 0.5], ['V7/ii', 0.5]]);
        add('I6', [['V/V', 0.7], ['V7/IV', 0.6]]);
        add('IV', [['V/V', 0.6]]);
        add('vi', [['V/V', 0.6], ['V65/V', 0.4]]);
        add('ii6', [['V/V', 0.4]]);
        add('V', [['viio7/V', 0]]); // placeholder so the key exists
        add('I', [['viio7/V', 0.35]]);
      }
      if (difficulty >= 4) {
        add('I', [['iv', 0.5], ['bVI', 0.3]]);
        add('I6', [['iv', 0.4]]);
        add('iv', [['V', 1.5], ['V7', 1]]);
        add('bVI', [['IV', 1], ['V', 0.8]]);
      }
    } else {
      add('i', [['iv', 3], ['V', 2], ['V7', 1.2], ['i6', 1.5], ['VI', 0.8]]);
      add('i6', [['iv', 2.5], ['V', 2]]);
      add('iv', [['V', 2.5], ['V7', 1.5], ['i', 1], ['i6', 0.8]]);
      add('V', [['i', 2.5], ['i6', 1.2], ['VI', 0.6]]);
      add('V7', [['i', 2.5], ['VI', 0.5]]);
      add('VI', [['iv', 2.5]]);
      if (difficulty >= 2) {
        add('i', [['iio6', 1.2], ['VII', 0.6], ['V65', 0.5]]);
        add('i6', [['iio6', 1.8], ['iiø65', 1], ['V43', 0.4]]);
        add('iv', [['iio6', 0.6], ['V42', 0.6], ['viio6', 0.4]]);
        add('iv6', [['V', 2], ['V7', 1]]);
        add('iio6', [['V', 2.5], ['V7', 1.8], ['V65', 0.6]]);
        add('iiø65', [['V', 2.2], ['V7', 1.6]]);
        add('viio6', [['i', 2], ['i6', 2.2]]);
        add('V6', [['i', 3]]);
        add('V65', [['i', 3]]);
        add('V43', [['i', 1.5], ['i6', 2.5]]);
        add('V42', [['i6', 3]]);
        add('V', [['V42', 0.8]]);
        add('VII', [['III', 3]]);
        add('III', [['iv', 1.5], ['iio6', 1], ['VI', 0.8], ['iv6', 0.6]]);
        add('VI', [['iio6', 1.5], ['iiø65', 0.8]]);
        add('i', [['iv6', 0.4]]);
      }
      if (difficulty >= 3) {
        add('i', [['V/V', 0.5], ['V7/V', 0.5], ['V/iv', 0.6], ['V7/iv', 0.5], ['viio7/V', 0.35]]);
        add('VI', [['V/V', 0.4]]);
        add('iv', [['V/V', 0.4]]);
        add('III', [['V/iv', 0.4]]);
      }
      if (difficulty >= 4) {
        add('i', [['viio7', 0.5]]);
        add('i6', [['viio7', 0.4]]);
        add('viio7', [['i', 2], ['i6', 1]]);
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
    { syms: ['ii65', 'V7', 'I'], type: 'PAC', minD: 2 },
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
    { syms: ['N6', 'V'], type: 'HC', minD: 4 },
  ];
  const CADENCE_WEIGHT = { PAC: 4.5, IAC: 1.2, HC: 2.2, DC: 1.2, PHC: 1.0 };

  function minorize(syms) {
    const map = { I: 'i', I6: 'i6', I64c: 'i64c', IV: 'iv', ii6: 'iio6', ii65: 'iiø65', vi: 'VI' };
    return syms.map((s) => map[s] || s);
  }

  function pickCadence(rng, difficulty, mode, maxLen) {
    let pool = CADENCES.filter((c) => c.minD <= difficulty && c.syms.length <= maxLen);
    if (mode === 'minor' && difficulty >= 3)
      pool = pool.concat([{ syms: ['iv6', 'V'], type: 'PHC', minD: 3 }]);
    const weighted = pool.map((c) => [c, CADENCE_WEIGHT[c.type] / Math.sqrt(c.syms.length)]);
    const chosen = DS.rng.weighted(rng, weighted);
    const syms = mode === 'minor' ? minorize(chosen.syms) : chosen.syms.slice();
    return { syms, type: chosen.type };
  }

  // ---- body walk -----------------------------------------------------------
  const CADENCE_ONLY = new Set(['I64c', 'i64c', 'N6', 'Ger65']);

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

  function walkBody(rng, t, start, len, cadenceHead, mode) {
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

  function generate(rng, { difficulty, mode, length }) {
    const t = table(difficulty, mode);
    const tonic = mode === 'minor' ? 'i' : 'I';
    for (let attempt = 0; attempt < 40; attempt++) {
      const cadence = pickCadence(rng, difficulty, mode, length - 1);
      const bodyLen = length - cadence.syms.length;
      if (bodyLen < 1) continue;
      const body = walkBody(rng, t, tonic, bodyLen, cadence.syms[0], mode);
      if (!body) continue;
      const syms = body.concat(cadence.syms);
      const chords = syms.map((sym, i) => ({
        ...clone(CAT[mode][sym]),
        sym,
        dur: i === syms.length - 1 ? 192 : 96,
      }));
      const last = chords[chords.length - 1];
      if (cadence.type === 'PAC') last.sopranoEnd = [1];
      if (cadence.type === 'IAC') last.sopranoEnd = [3, 5];
      chords.cadence = cadence.type;
      return chords;
    }
    // fallback: guaranteed simple authentic phrase
    const base = mode === 'minor' ? ['i', 'iv', 'V7', 'i'] : ['I', 'IV', 'V7', 'I'];
    const syms = [tonic];
    while (syms.length < length - 3) syms.push(syms.length % 2 ? base[1] : tonic);
    const all = syms.concat(base.slice(1));
    const chords = all.slice(0, length).map((sym, i) => ({
      ...clone(CAT[mode][sym]),
      sym,
      dur: i === length - 1 ? 192 : 96,
    }));
    chords[chords.length - 1].sopranoEnd = [1];
    chords.cadence = 'PAC';
    return chords;
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

  DS.progression = { generate, chordSpec, display };
})();
