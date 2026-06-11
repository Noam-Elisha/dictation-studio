import { loadDS, suite, test, eq, ok } from './harness.mjs';

const DS = loadDS(['js/rng.js', 'js/theory.js']);
const T = DS.theory;

// pitch helpers
const P = (step, alter, oct) => ({ step, alter, oct });

suite('rng', () => {
  test('deterministic for same seed', () => {
    const a = DS.rng.create(1234);
    const b = DS.rng.create(1234);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    eq(seqA, seqB);
    ok(seqA[0] !== seqA[1], 'values vary');
  });
  test('different seeds differ', () => {
    const a = DS.rng.create(1);
    const b = DS.rng.create(2);
    ok(a() !== b());
  });
  test('int respects bounds inclusively', () => {
    const r = DS.rng.create(99);
    for (let i = 0; i < 200; i++) {
      const v = DS.rng.int(r, 3, 5);
      ok(v >= 3 && v <= 5, `int out of bounds: ${v}`);
    }
  });
  test('pick returns elements; weighted respects zero weights', () => {
    const r = DS.rng.create(7);
    ok(['a', 'b'].includes(DS.rng.pick(r, ['a', 'b'])));
    for (let i = 0; i < 100; i++) {
      eq(DS.rng.weighted(r, [['x', 0], ['y', 2]]), 'y');
    }
  });
});

suite('theory: spelling & midi', () => {
  test('name', () => {
    eq(T.name(P(3, 1, 4)), 'F#');
    eq(T.name(P(6, -1, 3)), 'Bb');
    eq(T.name(P(0, 0, 4)), 'C');
    eq(T.name(P(4, 2, 4)), 'Gx');
    eq(T.name(P(1, -2, 4)), 'Dbb');
  });
  test('midi: scientific octave of the letter', () => {
    eq(T.midi(P(0, 0, 4)), 60); // C4
    eq(T.midi(P(6, 1, 3)), 60); // B#3
    eq(T.midi(P(0, -1, 4)), 59); // Cb4
    eq(T.midi(P(5, 0, 4)), 69); // A4
    eq(T.midi(P(3, 1, 2)), 42); // F#2
  });
  test('pc', () => {
    eq(T.pc(P(0, 0, 4)), 0);
    eq(T.pc(P(6, 1, 3)), 0);
    eq(T.pc(P(5, -1, 4)), 8); // Ab
  });
});

suite('theory: keys & scales', () => {
  const KEY = (name, mode) => ({ tonic: T.parseName(name), mode });
  test('parseName', () => {
    eq(T.parseName('F#'), { step: 3, alter: 1 });
    eq(T.parseName('Bb'), { step: 6, alter: -1 });
    eq(T.parseName('C'), { step: 0, alter: 0 });
  });
  test('fifths', () => {
    eq(T.fifths(KEY('C', 'major')), 0);
    eq(T.fifths(KEY('G', 'major')), 1);
    eq(T.fifths(KEY('F', 'major')), -1);
    eq(T.fifths(KEY('B', 'major')), 5);
    eq(T.fifths(KEY('Gb', 'major')), -6);
    eq(T.fifths(KEY('A', 'minor')), 0);
    eq(T.fifths(KEY('F#', 'minor')), 3);
    eq(T.fifths(KEY('Ab', 'minor')), -7);
    eq(T.fifths(KEY('D#', 'minor')), 6);
    eq(T.fifths(KEY('Eb', 'minor')), -6);
  });
  test('keyAccidentals map (step -> alter)', () => {
    eq(T.keyAccidentals(KEY('A', 'major')), { 3: 1, 0: 1, 4: 1 }); // F# C# G#
    eq(T.keyAccidentals(KEY('F', 'major')), { 6: -1 }); // Bb
    eq(T.keyAccidentals(KEY('C', 'major')), {});
    eq(T.keyAccidentals(KEY('C', 'minor')), { 6: -1, 2: -1, 5: -1 }); // Bb Eb Ab
  });
  test('scale spelling (natural minor for minor mode)', () => {
    const dMinor = T.scale(KEY('D', 'minor')).map(T.name);
    eq(dMinor, ['D', 'E', 'F', 'G', 'A', 'Bb', 'C']);
    const aMajor = T.scale(KEY('A', 'major')).map(T.name);
    eq(aMajor, ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#']);
  });
  test('degreeNote with chromatic adjustment', () => {
    eq(T.name(T.degreeNote(KEY('A', 'minor'), 7, 1)), 'G#');
    eq(T.name(T.degreeNote(KEY('C', 'minor'), 6, 1)), 'A'); // raised 6th
    eq(T.name(T.degreeNote(KEY('C', 'major'), 2, -1)), 'Db'); // neapolitan root
  });
});

suite('theory: intervals & transposition', () => {
  const KEY = (name, mode) => ({ tonic: T.parseName(name), mode });
  test('intervalBetween (directed)', () => {
    eq(T.intervalBetween(P(0, 0, 4), P(2, 0, 4)), { d: 2, s: 4 }); // C4->E4 M3
    eq(T.intervalBetween(P(2, 0, 4), P(0, 0, 4)), { d: -2, s: -4 });
    eq(T.intervalBetween(P(0, 0, 4), P(0, 0, 5)), { d: 7, s: 12 });
    eq(T.intervalBetween(P(5, 0, 3), P(0, 1, 4)), { d: 2, s: 4 }); // A3->C#4
  });
  test('transposeNote preserves correct spelling', () => {
    eq(T.transposeNote(P(3, 1, 4), { d: 2, s: 3 }), P(5, 0, 4)); // F#4 +m3 = A4
    eq(T.transposeNote(P(6, -1, 3), { d: 1, s: 2 }), P(0, 0, 4)); // Bb3 +M2 = C4
    eq(T.transposeNote(P(0, 0, 4), { d: -1, s: -2 }), P(6, -1, 3)); // C4 -M2 = Bb3
    eq(T.transposeNote(P(2, 0, 4), { d: 3, s: 6 }), P(5, 1, 4)); // E4 +A4th = A#4
    eq(T.transposeNote(P(2, 0, 4), { d: 3, s: 4 }), P(5, -1, 4)); // E4 +d4th = Ab4
  });
  test('transposeKey', () => {
    const out = T.transposeKey(KEY('D', 'major'), { d: -1, s: -2 });
    eq([T.name(out.tonic), out.mode], ['C', 'major']);
  });
  test('bestIntervalForShift picks the simpler enharmonic key', () => {
    const c = KEY('C', 'major');
    const up1 = T.bestIntervalForShift(c, 1); // Db (-5) over C# (+7)
    eq(T.name(T.transposeKey(c, up1).tonic), 'Db');
    const g = KEY('G', 'major');
    const gUp1 = T.bestIntervalForShift(g, 1); // Ab (-4) over G# (+8)
    eq(T.name(T.transposeKey(g, gUp1).tonic), 'Ab');
    const down3 = T.bestIntervalForShift(c, -3); // A (3) over Bbb (-10)
    eq(T.name(T.transposeKey(c, down3).tonic), 'A');
    eq(T.bestIntervalForShift(c, 0), { d: 0, s: 0 });
  });
  test('round trip transposition', () => {
    const n = P(4, 1, 3); // G#3
    const up = { d: 4, s: 7 };
    const back = T.transposeNote(T.transposeNote(n, up), { d: -4, s: -7 });
    eq(back, n);
  });
});
