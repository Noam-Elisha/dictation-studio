import { loadDS, suite, test, eq, ok } from './harness.mjs';

const DS = loadDS(['js/rng.js', 'js/theory.js', 'js/progression.js', 'js/voicing.js']);
const T = DS.theory;
const V = DS.voicing;
const P = DS.progression;

const C_MAJOR = { tonic: { step: 0, alter: 0 }, mode: 'major' };
const A_MINOR = { tonic: { step: 5, alter: 0 }, mode: 'minor' };

// hand-built voicing helper: [S, A, T, B] as note names with octaves
function chordOf(...names) {
  return names.map((n) => {
    const m = n.match(/^([A-Ga-g][#bx]*)(\d)$/);
    return { ...T.parseName(m[1]), oct: Number(m[2]) };
  });
}

suite('voicing: validator catches planted violations', () => {
  const I = P.chordSpec('I', 'major');
  const ii = P.chordSpec('ii', 'major');
  const V7 = P.chordSpec('V7', 'major');
  const Vc = P.chordSpec('V', 'major');

  test('parallel fifths and octaves', () => {
    const voices = [
      chordOf('C5', 'E4', 'G3', 'C3'),
      chordOf('D5', 'F4', 'A3', 'D3'), // S/B parallel octaves, T/B parallel fifths
    ];
    const errs = V.validate(C_MAJOR, [I, ii], voices);
    ok(errs.some((e) => e.includes('parallel')), `expected parallels, got: ${errs.join('; ')}`);
  });

  test('range violation', () => {
    const errs = V.validate(C_MAJOR, [I], [chordOf('A5', 'E4', 'G3', 'C3')]);
    ok(errs.some((e) => e.includes('range')), errs.join('; '));
  });

  test('spacing violation S-A beyond an octave', () => {
    const errs = V.validate(C_MAJOR, [I], [chordOf('G5', 'E4', 'C4', 'C3')]);
    ok(errs.some((e) => e.includes('spacing')), errs.join('; '));
  });

  test('doubled leading tone', () => {
    const errs = V.validate(C_MAJOR, [Vc], [chordOf('B4', 'B3', 'G3', 'G2')]);
    ok(errs.some((e) => e.includes('double')), errs.join('; '));
  });

  test('unresolved chordal seventh', () => {
    const voices = [
      chordOf('F4', 'D4', 'B3', 'G2'), // V7 (5th omitted, 7th in soprano)
      chordOf('G4', 'C4', 'C4', 'C3'), // 7th leaps up to G
    ];
    const errs = V.validate(C_MAJOR, [V7, I], voices);
    ok(errs.some((e) => e.includes('seventh')), errs.join('; '));
  });

  test('leading tone in soprano must rise to tonic at V-I', () => {
    const voices = [
      chordOf('B4', 'D4', 'G3', 'G2'),
      chordOf('G4', 'E4', 'E3', 'C3'), // soprano LT falls to G (no other violation)
    ];
    const errs = V.validate(C_MAJOR, [Vc, I], voices);
    eq(errs.length > 0, true, 'caught something');
    ok(errs.every((e) => e.includes('leading')), `expected only LT error: ${errs.join('; ')}`);
  });

  test('voice overlap', () => {
    const voices = [
      chordOf('C5', 'G4', 'E4', 'C3'),
      chordOf('E5', 'D5', 'G4', 'C3'), // alto D5 above previous soprano C5
    ];
    const errs = V.validate(C_MAJOR, [I, I], voices);
    ok(errs.some((e) => e.includes('overlap')), errs.join('; '));
  });

  test('melodic augmented second', () => {
    const iv = P.chordSpec('iv', 'minor');
    const Vm = P.chordSpec('V', 'minor');
    const voices = [
      chordOf('F4', 'C4', 'A3', 'D3'), // iv in a minor: D F A
      chordOf('G#4', 'B3', 'B3', 'E3'), // soprano F->G# aug 2nd
    ];
    const errs = V.validate(A_MINOR, [iv, Vm], voices);
    ok(errs.some((e) => e.includes('augmented')), errs.join('; '));
  });

  test('seventh approached by leap', () => {
    // V7's seventh (F) is leapt into in the soprano (C5 -> F5, a fifth)
    const voices = [
      chordOf('C5', 'G4', 'E4', 'C3'),
      chordOf('F5', 'B4', 'D4', 'G2'),
    ];
    const errs = V.validate(C_MAJOR, [I, V7], voices);
    ok(errs.some((e) => e.includes('seventh approached by leap')), errs.join('; '));
  });

  test('seventh prepared by step is accepted', () => {
    // F (V7 seventh) approached by step from G in the soprano
    const voices = [
      chordOf('G4', 'E4', 'C4', 'C3'),
      chordOf('F4', 'D4', 'B3', 'G2'),
    ];
    const errs = V.validate(C_MAJOR, [I, V7], voices);
    ok(!errs.some((e) => e.includes('seventh approached')), errs.join('; '));
  });

  test('clean I-IV-V-I passes with no violations', () => {
    const IV = P.chordSpec('IV', 'major');
    const voices = [
      chordOf('E4', 'C4', 'G3', 'C3'),
      chordOf('F4', 'C4', 'A3', 'F2'),
      chordOf('D4', 'B3', 'G3', 'G2'),
      chordOf('C4', 'C4', 'E3', 'C3'),
    ];
    const errs = V.validate(C_MAJOR, [I, IV, Vc, I], voices);
    eq(errs, [], 'expected clean');
  });
});

suite('voicing: harmonize', () => {
  test('I-IV-V7-I comes out valid, complete, PAC soprano', () => {
    const chords = [
      P.chordSpec('I', 'major'),
      P.chordSpec('IV', 'major'),
      P.chordSpec('V7', 'major'),
      { ...P.chordSpec('I', 'major'), sopranoEnd: [1] },
    ];
    const rng = DS.rng.create(42);
    const voices = V.harmonize(rng, C_MAJOR, chords);
    ok(voices, 'harmonize returned a result');
    eq(voices.length, 4, '4 chords');
    eq(V.validate(C_MAJOR, chords, voices), []);
    const lastS = voices[3][0];
    eq(T.pc(lastS), T.pc({ ...C_MAJOR.tonic, oct: 4 }), 'soprano ends on tonic');
  });

  test('soak: every difficulty/mode/seed yields zero hard-rule violations', () => {
    let fails = 0;
    let total = 0;
    let violations = [];
    for (let difficulty = 1; difficulty <= 4; difficulty++) {
      for (const mode of ['major', 'minor']) {
        const key = mode === 'major' ? C_MAJOR : A_MINOR;
        for (let seed = 0; seed < 250; seed++) {
          total++;
          const rng = DS.rng.create(seed * 7 + difficulty * 1000 + (mode === 'minor' ? 500000 : 0));
          const chords = P.generate(rng, { difficulty, mode, length: [5, 7, 9][seed % 3] });
          const voices = V.harmonize(rng, key, chords);
          if (!voices) {
            fails++;
            continue;
          }
          const errs = V.validate(key, chords, voices);
          if (errs.length) {
            violations.push(
              `d${difficulty} ${mode} seed ${seed}: ${chords.map((c) => c.sym).join(' ')} :: ${errs[0]}`
            );
          }
        }
      }
    }
    eq(violations.slice(0, 5), [], `violations (${violations.length}/${total})`);
    // Requiring every chordal seventh to be prepared makes some progressions
    // unvoiceable; the excerpt layer simply regenerates (100% exercise success),
    // so a higher single-progression failure rate is expected and acceptable.
    ok(fails / total <= 0.16, `harmonize failure rate ${fails}/${total}`);
  });

  test('augmented-sixth #4 always rises a semitone to scale degree 5', () => {
    const AUG6 = new Set(['It6', 'Fr43', 'Ger65']);
    let checked = 0;
    for (const key of [C_MAJOR, A_MINOR]) {
      for (let seed = 0; seed < 1500 && checked < 150; seed++) {
        const rng = DS.rng.create(seed * 3 + (key === A_MINOR ? 1 : 0));
        const chords = P.generate(rng, { difficulty: 4, mode: key.mode, bars: 3 });
        const i = chords.findIndex((c) => AUG6.has(c.sym));
        if (i < 0 || i + 1 >= chords.length) continue;
        const block = V.harmonize(rng, key, chords);
        if (!block) continue;
        checked++;
        const tone = chords[i].tones[chords[i].lt];
        const sharp4 = ((T.midi({ ...T.degreeNote(key, tone[0], tone[1]), oct: 0 }) % 12) + 12) % 12;
        for (let v = 0; v < 4; v++) {
          if (((T.midi(block[i][v]) % 12) + 12) % 12 !== sharp4) continue;
          eq(T.midi(block[i + 1][v]) - T.midi(block[i][v]), 1, `${key.mode} seed ${seed}: #4 rises`);
        }
      }
    }
    ok(checked >= 100, `exercised augmented sixths (${checked})`);
  });

  test('validator rejects an augmented sixth whose #4 falls to the fifth', () => {
    const It6 = P.chordSpec('It6', 'major'); // Ab C F#, resolves to V
    const Vc = P.chordSpec('V', 'major');
    // F# (the raised 4th) sits in the alto and slips down to D instead of up to G
    const voices = [chordOf('C5', 'F#4', 'C4', 'Ab2'), chordOf('B4', 'D4', 'G3', 'G2')];
    const errs = V.validate(C_MAJOR, [It6, Vc], voices);
    ok(errs.some((e) => /augmented-sixth/.test(e)), `expected a #4-rise violation, got: ${errs.join('; ')}`);
  });
});
