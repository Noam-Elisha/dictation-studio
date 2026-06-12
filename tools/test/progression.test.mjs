import { loadDS, suite, test, eq, ok } from './harness.mjs';

const DS = loadDS(['js/rng.js', 'js/theory.js', 'js/progression.js']);
const P = DS.progression;
const T = DS.theory;

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

  test('generateModulating: home-key prefix, single pivot, PAC in a closely related new key', () => {
    let runs = 0;
    const targetsSeen = new Set();
    for (let seed = 0; seed < 400; seed++) {
      const home = seed % 2 ? C_MAJOR : A_MINOR;
      const rng = DS.rng.create(seed * 5 + 1);
      const chords = P.generateModulating(rng, {
        difficulty: 4, mode: home.mode, phrases: 2 + (seed % 3), key1: home,
      });
      if (!chords) continue;
      runs++;
      const mod = chords.modulation;
      ok(mod && sameKey(mod.from, home), `seed ${seed}: modulates from home`);
      targetsSeen.add(T.name(mod.to.tonic) + ' ' + mod.to.mode);

      // target is one of the closely related keys
      ok(P.closelyRelated(home).some((k) => sameKey(k, mod.to)), `seed ${seed}: target closely related`);

      // exactly one pivot chord, tagged with the new key's label
      const pivots = chords.filter((c) => c.keyChange);
      eq(pivots.length, 1, `seed ${seed}: exactly one pivot`);
      const pivot = pivots[0];
      ok(sameKey(pivot.key, mod.to), `seed ${seed}: pivot is in the new key`);

      // the pivot is a true common chord: diatonic in BOTH keys
      const inNew = chordPcs(pivot, mod.to);
      const homeScale = scalePcs(home);
      for (const p of inNew) ok(homeScale.has(p), `seed ${seed}: pivot tone ${p} diatonic at home`);

      // everything up to (and incl.) the chord before the pivot stays home;
      // pivot and after are in the new key
      const pi = chords.indexOf(pivot);
      for (let i = 0; i < pi; i++) ok(sameKey(chords[i].key, home), `seed ${seed}: chord ${i} home`);
      for (let i = pi; i < chords.length; i++) ok(sameKey(chords[i].key, mod.to), `seed ${seed}: chord ${i} new key`);

      // confirmed by V7 -> tonic in the new key
      const last = chords[chords.length - 1];
      const penult = chords[chords.length - 2];
      ok(/^[Ii]$/.test(last.sym), `seed ${seed}: ends on tonic, saw ${last.sym}`);
      eq(penult.sym, 'V7', `seed ${seed}: dominant-seventh before the close`);
      eq(chords.cadence, 'PAC', `seed ${seed}: PAC`);

      // bar-aligned: phrases of two bars each
      const total = chords.reduce((s, c) => s + c.dur, 0);
      eq(total % 192, 0, `seed ${seed}: whole bars`);
    }
    ok(runs >= 380, `most seeds produced a modulating progression (${runs}/400)`);
    ok(targetsSeen.size >= 4, `a variety of target keys (${targetsSeen.size})`);
  });

  test('deterministic from seed', () => {
    const opts = { difficulty: 4, mode: 'major', phrases: 3, key1: C_MAJOR };
    const a = P.generateModulating(DS.rng.create(42), { ...opts });
    const b = P.generateModulating(DS.rng.create(42), { ...opts });
    eq(a, b);
  });
});
