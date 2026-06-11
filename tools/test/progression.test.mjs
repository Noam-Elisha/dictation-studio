import { loadDS, suite, test, eq, ok } from './harness.mjs';

const DS = loadDS(['js/rng.js', 'js/theory.js', 'js/progression.js']);
const P = DS.progression;

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

  test('lengths come out as requested and durations fill bars', () => {
    for (const length of [5, 7, 9]) {
      const rng = DS.rng.create(11 + length);
      const chords = P.generate(rng, { difficulty: 2, mode: 'major', length });
      eq(chords.length, length);
      const total = chords.reduce((s, c) => s + c.dur, 0);
      eq(total % 192, 0, 'fills whole 4/4 bars');
      eq(chords[chords.length - 1].dur, 192, 'final chord is a whole note');
      for (const c of chords.slice(0, -1)) eq(c.dur, 96);
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
