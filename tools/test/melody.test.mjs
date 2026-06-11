import { loadDS, suite, test, eq, ok } from './harness.mjs';

const DS = loadDS(['js/rng.js', 'js/theory.js', 'js/melody.js']);
const T = DS.theory;

const C_MAJOR = { tonic: { step: 0, alter: 0 }, mode: 'major' };
const D_MINOR = { tonic: { step: 1, alter: 0 }, mode: 'minor' };

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

function checkMelody(m, key, { bars, num, den, difficulty }, label) {
  const mlen = (num * 192) / den;
  const total = m.notes.reduce((s, n) => s + n.dur, 0);
  eq(total, bars * mlen + m.upbeat, `${label}: duration fills bars (+upbeat)`);

  const last = m.notes[m.notes.length - 1];
  eq(last.dur, mlen, `${label}: final note holds a full bar`);
  eq(T.pc(last), T.pc({ ...key.tonic, oct: 4 }), `${label}: ends on tonic`);

  const penult = m.notes[m.notes.length - 2];
  const approach = T.intervalBetween(penult, last);
  ok(Math.abs(approach.s) <= 2 && Math.abs(approach.d) === 1, `${label}: stepwise 2-1 or 7-1 ending`);

  const maxLeap = difficulty <= 2 ? 7 : 12;
  for (let i = 1; i < m.notes.length; i++) {
    const a = m.notes[i - 1];
    const b = m.notes[i];
    const mi = T.midi(b);
    ok(mi >= 60 && mi <= 81, `${label}: note ${i} in range (${mi})`);
    const leap = Math.abs(T.midi(b) - T.midi(a));
    ok(leap <= maxLeap, `${label}: leap ${leap} exceeds limit at ${i}`);
    ok(!isAugmented(a, b), `${label}: augmented interval at ${i}`);
  }

  // leap compensation away from the cadential approach
  for (let i = 1; i < m.notes.length - 2; i++) {
    const prev = T.midi(m.notes[i - 1]);
    const cur = T.midi(m.notes[i]);
    const next = T.midi(m.notes[i + 1]);
    const leap = cur - prev;
    if (Math.abs(leap) >= 5) {
      const after = next - cur;
      ok(
        after !== 0 && Math.sign(after) !== Math.sign(leap) && Math.abs(after) <= 2,
        `${label}: leap of ${leap} at ${i} not compensated (then ${after})`
      );
    }
  }

  const allowed = new Set([24, 48, 72, 96, 144, 192]);
  for (const n of m.notes) ok(allowed.has(n.dur), `${label}: odd duration ${n.dur}`);
}

suite('melody: generator', () => {
  test('deterministic for a seed', () => {
    const a = DS.melody.generate(DS.rng.create(5), { difficulty: 2, key: C_MAJOR, bars: 4, num: 4, den: 4 });
    const b = DS.melody.generate(DS.rng.create(5), { difficulty: 2, key: C_MAJOR, bars: 4, num: 4, den: 4 });
    eq(a, b);
  });

  test('soak: all constraints across difficulties, modes, meters', () => {
    for (let difficulty = 1; difficulty <= 4; difficulty++) {
      for (const [key, name] of [[C_MAJOR, 'C'], [D_MINOR, 'd']]) {
        for (let seed = 0; seed < 250; seed++) {
          const meter = seed % 2 ? { num: 4, den: 4 } : { num: 3, den: 4 };
          const opts = { difficulty, key, bars: 2 + (seed % 3) * 2, ...meter };
          const m = DS.melody.generate(DS.rng.create(seed + difficulty * 10000), opts);
          checkMelody(m, key, opts, `d${difficulty} ${name} seed ${seed}`);
        }
      }
    }
  });

  test('minor: leading tone raised when rising to tonic, natural descending', () => {
    let raised = 0;
    let naturalDesc = 0;
    for (let seed = 0; seed < 400; seed++) {
      const m = DS.melody.generate(DS.rng.create(seed), {
        difficulty: 2, key: D_MINOR, bars: 4, num: 4, den: 4,
      });
      for (let i = 0; i < m.notes.length - 1; i++) {
        const n = m.notes[i];
        const next = m.notes[i + 1];
        if (n.step !== 0) continue; // degree 7 of d minor is C
        const iv = T.intervalBetween(n, next);
        if (iv.d === 1 && T.pc(next) === 2) {
          eq(n.alter, 1, `seed ${seed}: 7 rising to tonic must be raised`);
          raised++;
        }
        if (iv.d < 0 && n.alter === 0) naturalDesc++;
      }
    }
    ok(raised > 50, `saw raised LT->tonic motions (${raised})`);
    ok(naturalDesc > 20, `saw natural descending 7ths (${naturalDesc})`);
  });

  test('pickup adds an upbeat that fits', () => {
    for (let seed = 0; seed < 60; seed++) {
      const m = DS.melody.generate(DS.rng.create(seed), {
        difficulty: 2, key: C_MAJOR, bars: 4, num: 4, den: 4, pickup: true,
      });
      ok(m.upbeat > 0 && m.upbeat <= 48, `seed ${seed}: upbeat ${m.upbeat}`);
    }
  });
});
