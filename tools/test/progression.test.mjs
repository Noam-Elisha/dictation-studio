import { loadDS, suite, test, eq, ok } from './harness.mjs';

const DS = loadDS(['js/rng.js', 'js/theory.js', 'js/progression.js', 'js/voicing.js']);
const P = DS.progression;
const T = DS.theory;
const V = DS.voicing;

const D1_MAJOR = new Set(['I', 'I6', 'IV', 'V', 'V7', 'vi', 'I64c']);
const D1_MINOR = new Set(['i', 'i6', 'iv', 'V', 'V7', 'VI', 'i64c']);

const AUTH_FINAL = new Set(['I', 'i']);
const DOM = new Set(['V', 'V7', 'V6', 'V65']);
const DECEPTIVE = new Set(['vi', 'VI']);

function cadenceLooksValid(syms, mode) {
  const last = syms[syms.length - 1];
  const penult = syms[syms.length - 2];
  if (AUTH_FINAL.has(last)) return DOM.has(penult);
  if (DECEPTIVE.has(last)) return penult === 'V7' || penult === 'V';
  if (last === 'V') return !DOM.has(penult); // half cadence (incl. Phrygian iv6->V)
  return false;
}

suite('progression: grammar', () => {
  test('D1 major stays in vocabulary, starts on I, cadences', () => {
    for (let seed = 0; seed < 80; seed++) {
      const rng = DS.rng.create(seed);
      const chords = P.generate(rng, { difficulty: 1, mode: 'major', length: 7 });
      const syms = chords.map((c) => c.sym);
      eq(syms[0], 'I', `seed ${seed} starts on I`);
      for (const s of syms) ok(D1_MAJOR.has(s), `seed ${seed}: '${s}' outside D1 major vocab`);
      ok(cadenceLooksValid(syms, 'major'), `seed ${seed}: bad cadence ${syms.join(' ')}`);
    }
  });

  test('D1 minor vocabulary and raised leading tone in V', () => {
    for (let seed = 0; seed < 80; seed++) {
      const rng = DS.rng.create(seed);
      const chords = P.generate(rng, { difficulty: 1, mode: 'minor', length: 5 });
      for (const c of chords) {
        ok(D1_MINOR.has(c.sym), `seed ${seed}: '${c.sym}' outside D1 minor vocab`);
        if (/^V\d*$/.test(c.sym)) {
          const lt = c.tones[c.lt];
          eq([lt[0], lt[1]], [7, 1], 'V leading tone is raised 7');
        }
      }
    }
  });

  test('quarter-note harmonic rhythm: bar-aligned, mostly quarters, held final', () => {
    for (const bars of [2, 3, 4]) {
      let quarters = 0, totalChords = 0;
      for (let seed = 0; seed < 80; seed++) {
        const chords = P.generate(DS.rng.create(seed * 3 + bars), { difficulty: 2, mode: 'major', bars });
        const total = chords.reduce((s, c) => s + c.dur, 0);
        eq(total, bars * 192, `bars=${bars} seed ${seed}: fills ${bars} whole bars`);
        ok([96, 192].includes(chords[chords.length - 1].dur), `seed ${seed}: final held`);
        for (const c of chords) ok([48, 96, 192].includes(c.dur), `seed ${seed}: valid dur ${c.dur}`);
        quarters += chords.filter((c) => c.dur === 48).length;
        totalChords += chords.length;
      }
      // across many phrases the rhythm is predominantly quarter notes
      ok(quarters / totalChords >= 0.6, `bars=${bars}: mostly quarters on average (${(quarters / totalChords).toFixed(2)})`);
    }
  });

  test('secondary dominants appear at D3+, never below', () => {
    let secondaries = 0;
    for (let seed = 0; seed < 120; seed++) {
      const rng = DS.rng.create(seed);
      const chords = P.generate(rng, { difficulty: 2, mode: 'major', length: 9 });
      for (const c of chords) ok(!c.sym.includes('/'), `D2 must not contain ${c.sym}`);
      const rng3 = DS.rng.create(seed);
      const c3 = P.generate(rng3, { difficulty: 3, mode: 'major', length: 9 });
      secondaries += c3.filter((c) => c.sym.includes('/')).length;
    }
    ok(secondaries > 30, `expected plenty of secondaries at D3, saw ${secondaries}`);
  });

  test('secondary dominant resolves to its target immediately', () => {
    for (let seed = 0; seed < 150; seed++) {
      const rng = DS.rng.create(seed);
      const chords = P.generate(rng, { difficulty: 3, mode: 'major', length: 9 });
      const syms = chords.map((c) => c.sym);
      for (let i = 0; i < syms.length; i++) {
        const m = syms[i].match(/\/(.+)$/);
        if (!m) continue;
        ok(i + 1 < syms.length, `seed ${seed}: secondary ${syms[i]} at end`);
        const target = m[1];
        const next = syms[i + 1];
        ok(
          next === target || next.replace(/[0-9]+/g, '') === target || next.endsWith(`/${target}`),
          `seed ${seed}: ${syms[i]} -> ${next} (expected ${target}-family)`
        );
      }
    }
  });

  test('viio7/V spelled correctly in C major', () => {
    const spec = P.chordSpec('viio7/V', 'major');
    eq(spec.tones, [[4, 1], [6, 0], [1, 0], [3, -1]]); // F# A C Eb
    eq(spec.lt, 0);
    eq(spec.seventh, 3);
  });

  test('Neapolitan and Ger65 only at D4, in first inversion / correct tones', () => {
    const n6 = P.chordSpec('N6', 'minor');
    eq(n6.tones, [[2, -1], [4, 0], [6, 0]]);
    eq(n6.bass, 1);
    const ger = P.chordSpec('Ger65', 'minor');
    eq(ger.tones, [[6, 0], [1, 0], [3, 0], [4, 1]]);
    for (let seed = 0; seed < 100; seed++) {
      const rng = DS.rng.create(seed);
      const chords = P.generate(rng, { difficulty: 3, mode: 'minor', length: 7 });
      for (const c of chords) ok(!['N6', 'Ger65'].includes(c.sym), 'no N6/Ger65 below D4');
    }
  });

  test('augmented sixths spelled per mode, cadence-only at D4', () => {
    eq(P.chordSpec('It6', 'major').tones, [[6, -1], [1, 0], [4, 1]]); // Ab C F# in C
    eq(P.chordSpec('Fr43', 'major').tones, [[6, -1], [1, 0], [2, 0], [4, 1]]);
    eq(P.chordSpec('It6', 'minor').tones, [[6, 0], [1, 0], [4, 1]]); // natural ♭6 in minor
    eq(P.chordSpec('Fr43', 'minor').tones, [[6, 0], [1, 0], [2, 0], [4, 1]]);
    eq(P.chordSpec('It6', 'major').lt, 2);
    eq(P.chordSpec('Fr43', 'major').lt, 3);
    for (let seed = 0; seed < 150; seed++) {
      for (const mode of ['major', 'minor'])
        for (const c of P.generate(DS.rng.create(seed * 4), { difficulty: 3, mode, length: 7 }))
          ok(!['It6', 'Fr43', 'Ger65', 'N6'].includes(c.sym), `${c.sym} must not appear below D4`);
    }
  });

  test('cadential 64 always resolves to V-family then tonic-or-end', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = DS.rng.create(seed);
      const chords = P.generate(rng, { difficulty: 2, mode: 'major', length: 7 });
      const syms = chords.map((c) => c.sym);
      const i = syms.indexOf('I64c');
      if (i === -1) continue;
      ok(i + 1 < syms.length && ['V', 'V7'].includes(syms[i + 1]), `seed ${seed}: I64c -> ${syms[i + 1]}`);
    }
  });
});

const C_MAJOR = { tonic: { step: 0, alter: 0 }, mode: 'major' };
const A_MINOR = { tonic: { step: 5, alter: 0 }, mode: 'minor' };

const keyPc = (n) => T.pc({ step: n.step, alter: n.alter, oct: 0 });
const scalePcs = (key) => new Set(T.scale(key).map(keyPc));
const chordPcs = (chord, key) =>
  new Set(chord.tones.map(([deg, alt]) => keyPc(T.degreeNote(key, deg, alt))));
const sameKey = (a, b) => a.tonic.step === b.tonic.step && a.tonic.alter === b.tonic.alter && a.mode === b.mode;

suite('progression: modulation', () => {
  test('closely related keys differ by at most one accidental', () => {
    for (const home of [C_MAJOR, A_MINOR]) {
      const rel = P.closelyRelated(home);
      eq(rel.length, 5, 'five closely related keys');
      const homeFifths = T.fifths(home);
      for (const k of rel)
        ok(Math.abs(T.fifths(k) - homeFifths) <= 1, `${k.label} within one accidental`);
      // relative major/minor is always in the set
      const relMode = home.mode === 'major' ? 'minor' : 'major';
      ok(rel.some((k) => k.mode === relMode && T.fifths(k) === homeFifths), 'relative key present');
    }
  });

  test('generateModulating: progressive key plan, valid pivots, early/multiple modulation, PAC close', () => {
    let runs = 0, withTwo = 0, earlyMod = 0;
    const targetsSeen = new Set();
    for (let seed = 0; seed < 600; seed++) {
      const home = seed % 2 ? C_MAJOR : A_MINOR;
      const rng = DS.rng.create(seed * 5 + 1);
      const phrases = 2 + (seed % 3);
      const chords = P.generateModulating(rng, { difficulty: 4, mode: home.mode, phrases, key1: home });
      if (!chords) continue;
      runs++;
      const mod = chords.modulation;
      ok(mod && sameKey(mod.from, home), `seed ${seed}: starts from home`);
      targetsSeen.add(T.name(mod.to.tonic) + ' ' + mod.to.mode);

      // the opening chord is always the home tonic
      ok(sameKey(chords[0].key, home), `seed ${seed}: opens at home`);

      // pivots = chords tagged with a key change; at least one
      const pivotIdx = chords.map((c, i) => (c.keyChange ? i : -1)).filter((i) => i >= 0);
      ok(pivotIdx.length >= 1, `seed ${seed}: at least one modulation`);
      if (pivotIdx.length >= 2) withTwo++;
      if (pivotIdx.some((i) => i <= chords.phraseEnds[0])) earlyMod++;

      // key is piecewise constant, changing only at a pivot
      for (let i = 1; i < chords.length; i++) {
        const changed = !sameKey(chords[i].key, chords[i - 1].key);
        ok(changed === !!chords[i].keyChange, `seed ${seed}: key changes only at pivots (idx ${i})`);
      }

      // each pivot: new key closely related to the preceding key, within five
      // accidentals, and a true common chord (diatonic in both keys)
      for (const i of pivotIdx) {
        const prevKey = chords[i - 1].key, newKey = chords[i].key;
        ok(P.closelyRelated(prevKey).some((k) => sameKey(k, newKey)), `seed ${seed}: pivot ${i} closely related`);
        ok(Math.abs(T.fifths(newKey)) <= 5, `seed ${seed}: pivot ${i} within 5 accidentals`);
        const inNew = chordPcs(chords[i], newKey), prevScale = scalePcs(prevKey);
        for (const p of inNew) ok(prevScale.has(p), `seed ${seed}: pivot ${i} tone ${p} diatonic before`);
      }

      // ends with an authentic cadence (tonic preceded by a dominant) in the
      // final key
      const last = chords[chords.length - 1], penult = chords[chords.length - 2];
      ok(/^[Ii]$/.test(last.sym), `seed ${seed}: ends on tonic (${last.sym})`);
      ok(penult.fn === 'D', `seed ${seed}: dominant-function before close (${penult.sym})`);
      ok(sameKey(last.key, mod.to), `seed ${seed}: final key recorded`);
      ok(['PAC', 'IAC'].includes(chords.cadence), `seed ${seed}: authentic close (${chords.cadence})`);

      // bar-aligned: phrases of two bars each
      eq(chords.reduce((s, c) => s + c.dur, 0) % 192, 0, `seed ${seed}: whole bars`);
    }
    ok(runs >= 580, `most seeds produced a modulating progression (${runs}/600)`);
    ok(earlyMod > 0, `modulation sometimes happens in the first phrase (${earlyMod})`);
    ok(withTwo > 0, `two modulations sometimes occur (${withTwo})`);
    ok(targetsSeen.size >= 4, `a variety of final keys (${targetsSeen.size})`);
  });

  test('deterministic from seed', () => {
    const opts = { difficulty: 4, mode: 'major', phrases: 3, key1: C_MAJOR };
    const a = P.generateModulating(DS.rng.create(42), { ...opts });
    const b = P.generateModulating(DS.rng.create(42), { ...opts });
    eq(a, b);
  });
});

suite('progression: cadence variety', () => {
  test('internal (open) phrases are mostly non-PAC', () => {
    let pac = 0, n = 0;
    for (let s = 0; s < 800; s++) {
      const d = 2 + (s % 3);
      const ch = P.generate(DS.rng.create(s + d * 1000), { difficulty: d, mode: s % 2 ? 'major' : 'minor', bars: 2, cadenceClass: 'open' });
      n++; if (ch.cadence === 'PAC') pac++;
    }
    ok(pac / n < 0.4, `open-phrase PAC share ${(pac / n).toFixed(2)} should be < 0.40`);
  });
});

suite('progression: colour vocabulary', () => {
  test('iii exists in major, is a minor triad on degree 3, voices in context', () => {
    const iii = P.chordSpec('iii', 'major');
    eq(iii.tones, [[3, 0], [5, 0], [7, 0]]);
    eq(iii.lt, null);                 // degree 7 is the chordal fifth, not a tendency tone
    const chords = ['I', 'iii', 'vi', 'IV', 'V', 'I'].map((s) => P.chordSpec(s, 'major'));
    chords[chords.length - 1].sopranoEnd = [1];
    const voices = V.harmonize(DS.rng.create(7), C_MAJOR, chords);
    ok(voices, 'harmonized a progression containing iii');
    eq(V.validate(C_MAJOR, chords, voices), [], 'no voice-leading violations');
  });

  test('D2 routes I->vii°6->I6 passing motion; D3 reaches iii', () => {
    const seen = new Set();
    for (let s = 0; s < 400; s++) {
      for (const d of [2, 3]) {
        const ch = P.generate(DS.rng.create(s * 5 + d), { difficulty: d, mode: 'major', bars: 3 });
        for (let i = 1; i < ch.length; i++) seen.add(ch[i - 1].sym + '>' + ch[i].sym);
        ch.forEach((c) => seen.add('@' + c.sym));
      }
    }
    ok([...seen].some((k) => k === 'I>viio6' || k === 'I6>viio6'), 'vii°6 passing motion appears');
    ok(seen.has('@iii'), 'iii appears in D3 walks');
  });
});
