import { loadDS, suite, test, eq, ok } from './harness.mjs';

const DS = loadDS([
  'js/data/chorales-data.js',
  'js/rng.js',
  'js/theory.js',
  'js/progression.js',
  'js/voicing.js',
  'js/nct.js',
  'js/melody.js',
  'js/excerpt.js',
]);
const T = DS.theory;

suite('excerpt: bach', () => {
  test('fixed chor001 phrase 1 reconstructs exactly', () => {
    const ex = DS.excerpt.fromBach(DS.rng.create(1), {
      mode: 'harmonic',
      fixed: { choraleId: 'chor001', s: 0, e: 576, shift: 0 },
    });
    eq(ex.kind, 'harmonic');
    eq(ex.source, 'bach');
    eq([T.name(ex.key.tonic), ex.key.mode], ['G', 'major']);
    eq([ex.num, ex.den, ex.mlen, ex.upbeat], [3, 4, 144, 48]);
    eq(ex.voices.length, 4);
    const totals = ex.voices.map((v) => v.reduce((s, n) => s + n.dur, 0));
    eq(totals, [576, 576, 576, 576]);
    eq(ex.voices[0][0], { step: 4, alter: 0, oct: 4, dur: 48, tieStart: false, tieEnd: false, fermata: false });
    ok(ex.voices[0][ex.voices[0].length - 1].fermata, 'phrase ends with fermata');
    eq(ex.romans, null);
    eq(ex.meta.choraleId, 'chor001');
    eq(ex.meta.bwv, '269');
  });

  test('transposition respells key and shifts every voice', () => {
    const ex = DS.excerpt.fromBach(DS.rng.create(1), {
      mode: 'harmonic',
      fixed: { choraleId: 'chor001', s: 0, e: 576, shift: -2 },
    });
    eq([T.name(ex.key.tonic), ex.key.mode], ['F', 'major']);
    eq(ex.sig, -1);
    eq(ex.voices[0][0], { step: 3, alter: 0, oct: 4, dur: 48, tieStart: false, tieEnd: false, fermata: false });
    eq(ex.meta.shift, -2);
    eq(T.name(T.parseName(ex.meta.originalKey)), 'G');
  });

  test('melodic excerpt takes a single voice', () => {
    const sop = DS.excerpt.fromBach(DS.rng.create(1), {
      mode: 'melodic', melodicVoice: 'soprano',
      fixed: { choraleId: 'chor001', s: 0, e: 576, shift: 0 },
    });
    eq(sop.voices.length, 1);
    eq(sop.voices[0][0].oct, 4);
    const bass = DS.excerpt.fromBach(DS.rng.create(1), {
      mode: 'melodic', melodicVoice: 'bass',
      fixed: { choraleId: 'chor001', s: 0, e: 576, shift: 0 },
    });
    eq(bass.voices[0][0].oct, 2);
  });

  test('random excerpts respect bounds, sig cap, phrase counts', () => {
    for (let seed = 0; seed < 120; seed++) {
      const rng = DS.rng.create(seed);
      const ex = DS.excerpt.fromBach(rng, {
        mode: 'harmonic',
        difficulty: 1 + (seed % 3),
        length: ['short', 'medium', 'long'][seed % 3],
        transpose: true,
        keyMode: 'any',
      });
      ok(ex, `seed ${seed} produced an excerpt`);
      ok(Math.abs(ex.sig) <= 5, `seed ${seed}: sig ${ex.sig}`);
      let lo = 999;
      let hi = -999;
      for (const v of ex.voices) for (const n of v) {
        if (n.step < 0) continue;
        const m = T.midi(n);
        lo = Math.min(lo, m);
        hi = Math.max(hi, m);
      }
      // untransposed originals can reach the corpus floor (C2=36); transposed
      // excerpts stay within [38,81]. Either way nothing should exceed [36,81].
      ok(lo >= 36 && hi <= 81, `seed ${seed}: range ${lo}-${hi}`);
      const totals = ex.voices.map((v) => v.reduce((s, n) => s + n.dur, 0));
      ok(totals.every((t) => t === totals[0]), `seed ${seed}: aligned voices`);
      ok(ex.upbeat >= 0 && ex.upbeat < ex.mlen, `seed ${seed}: upbeat ${ex.upbeat}`);
    }
  });

  test('keyMode filter works', () => {
    for (let seed = 0; seed < 40; seed++) {
      const ex = DS.excerpt.fromBach(DS.rng.create(seed), {
        mode: 'melodic', melodicVoice: 'soprano', difficulty: 1, length: 'short',
        keyMode: 'minor', transpose: false,
      });
      eq(ex.key.mode, 'minor', `seed ${seed}`);
    }
  });
});

suite('excerpt: generated', () => {
  test('harmonic carries romans aligned to bass notes and fills bars', () => {
    const ex = DS.excerpt.fromGenerated(DS.rng.create(7), {
      mode: 'harmonic', difficulty: 2, length: 'medium', keyMode: 'major',
    });
    eq(ex.kind, 'harmonic');
    eq(ex.voices.length, 4);
    ok(ex.voices[3].length >= ex.romans.length, 'bass has at least one note per chord');
    eq(ex.romans[0].tick, 0);
    const total = ex.voices[0].reduce((s, n) => s + n.dur, 0);
    eq(total % ex.mlen, 0);
    ok([96, 192].includes(ex.voices[0][ex.voices[0].length - 1].dur), 'final chord held (half or whole)');
    ok(ex.meta.seedUsed !== undefined, 'records seed');
  });

  test('deterministic from seed', () => {
    const a = DS.excerpt.fromGenerated(DS.rng.create(99), { mode: 'harmonic', difficulty: 3, harmonicPhrases: 2, keyMode: 'any' });
    const b = DS.excerpt.fromGenerated(DS.rng.create(99), { mode: 'harmonic', difficulty: 3, harmonicPhrases: 2, keyMode: 'any' });
    eq(a, b);
  });

  test('harmonicPhrases yields N fermata-ended phrases', () => {
    for (const phrases of [1, 2, 3, 4]) {
      let okCount = 0;
      for (let seed = 0; seed < 40; seed++) {
        const ex = DS.excerpt.fromGenerated(DS.rng.create(seed * 3 + phrases), {
          mode: 'harmonic', difficulty: 2 + (seed % 3), harmonicPhrases: phrases, keyMode: seed % 2 ? 'major' : 'minor',
        });
        if (!ex) continue;
        okCount++;
        // count fermatas in the soprano = number of phrase endings
        const fermatas = ex.voices[0].filter((n) => n.fermata).length;
        eq(fermatas, phrases, `phrases=${phrases} seed ${seed}: ${fermatas} fermatas`);
        // total fills whole bars
        const total = ex.voices[0].reduce((s, n) => s + n.dur, 0);
        eq(total % 192, 0, 'whole bars');
        // every voice agrees in total duration
        for (let v = 1; v < 4; v++)
          eq(ex.voices[v].reduce((s, n) => s + n.dur, 0), total, `voice ${v} duration`);
      }
      ok(okCount >= 35, `phrases=${phrases}: ${okCount}/40 generated`);
    }
  });

  test('melodic honors meter and pickup settings', () => {
    const ex = DS.excerpt.fromGenerated(DS.rng.create(3), {
      mode: 'melodic', difficulty: 2, length: 'medium', keyMode: 'minor', meter: '3/4', pickup: true,
    });
    eq([ex.num, ex.den], [3, 4]);
    eq(ex.voices.length, 1);
    ok(ex.upbeat === 0 || ex.upbeat === 48, 'upbeat sane');
    eq(ex.key.mode, 'minor');
  });

  test('fixed key honored', () => {
    const ex = DS.excerpt.fromGenerated(DS.rng.create(11), {
      mode: 'harmonic', difficulty: 1, length: 'short', keyMode: 'fixed', fixedKey: 'Eb major',
    });
    eq([T.name(ex.key.tonic), ex.key.mode], ['Eb', 'major']);
    eq(ex.sig, -3);
  });

  test('difficulty 4 modulates sometimes (more on longer exercises), never below', () => {
    const rate = (difficulty, phrases) => {
      let mod = 0, total = 0;
      for (let seed = 0; seed < 300; seed++) {
        const ex = DS.excerpt.fromGenerated(DS.rng.create(seed * 13 + phrases), {
          mode: 'harmonic', difficulty, harmonicPhrases: phrases, keyMode: seed % 2 ? 'major' : 'minor',
        });
        ok(ex, `d${difficulty} p${phrases} seed ${seed} produced an excerpt`);
        total++;
        if (ex.meta.modulation) mod++;
      }
      return mod / total;
    };
    // never below difficulty 4, nor for single-phrase exercises
    eq(rate(3, 3), 0, 'no modulation at D3');
    eq(rate(4, 1), 0, 'no modulation for a single phrase');
    // present at D4, and more frequent as the exercise grows
    const r2 = rate(4, 2), r3 = rate(4, 3), r4 = rate(4, 4);
    ok(r2 > 0.1, `D4 two-phrase modulates sometimes (${r2.toFixed(2)})`);
    ok(r2 < r3 && r3 < r4, `longer exercises modulate more often (${r2.toFixed(2)} < ${r3.toFixed(2)} < ${r4.toFixed(2)})`);
  });

  test('a modulating excerpt carries a labelled pivot and stays voice-aligned', () => {
    let checked = 0;
    for (let seed = 0; seed < 2000 && checked < 30; seed++) {
      const ex = DS.excerpt.fromGenerated(DS.rng.create(seed * 7 + 1), {
        mode: 'harmonic', difficulty: 4, harmonicPhrases: 3, keyMode: seed % 2 ? 'major' : 'minor',
      });
      if (!ex || !ex.meta.modulation) continue;
      checked++;
      // at least one roman is a key-change label ("G:ii6"); each is one lyric
      // token (only pivot labels contain a colon; normal numerals never do),
      // and the last one names the final key
      const tagged = ex.romans.filter((r) => r.label.includes(':'));
      ok(tagged.length >= 1, `seed ${seed}: a key-change label`);
      for (const t of tagged) ok(!/\s/.test(t.label), `seed ${seed}: label is a single token`);
      const to = ex.meta.modulation.to;
      const norm = (s) => s.replace(/♯/g, '#').replace(/♭/g, 'b');
      ok(norm(tagged[tagged.length - 1].label).startsWith(T.name(to.tonic) + ':'),
        `seed ${seed}: last label names the final key`);
      // four voices, all the same total duration, whole bars
      const totals = ex.voices.map((v) => v.reduce((s, n) => s + n.dur, 0));
      ok(totals.every((t) => t === totals[0]), `seed ${seed}: voices aligned`);
      eq(totals[0] % 192, 0, `seed ${seed}: whole bars`);
    }
    ok(checked >= 30, `found modulating excerpts to check (${checked})`);
  });

  test('soak: generated harmonic always valid across seeds', () => {
    for (let seed = 0; seed < 150; seed++) {
      const ex = DS.excerpt.fromGenerated(DS.rng.create(seed), {
        mode: 'harmonic',
        difficulty: 1 + (seed % 4),
        length: ['short', 'medium', 'long'][seed % 3],
        keyMode: seed % 2 ? 'major' : 'minor',
      });
      ok(ex && ex.romans.length >= 3, `seed ${seed} produced chords`);
      ok(Math.abs(ex.sig) <= 5, `seed ${seed} sig`);
    }
  });
});
