import { loadDS, suite, test, eq, ok } from './harness.mjs';

const DS = loadDS(['js/rng.js', 'js/theory.js', 'js/abc.js']);

const N = (step, alter, oct, dur, extra = {}) => ({ step, alter, oct, dur, ...extra });

function melodicExcerpt(notes, { key, sig, num = 4, den = 4, upbeat = 0 }) {
  return {
    kind: 'melodic', source: 'test', key, sig,
    num, den, mlen: (num * 192) / den, upbeat, tpq: 48,
    voices: [notes], romans: null, meta: {},
  };
}

const G_MAJOR = { tonic: { step: 4, alter: 0 }, mode: 'major' };
const C_MAJOR = { tonic: { step: 0, alter: 0 }, mode: 'major' };

suite('abc: accidental state machine', () => {
  test('key-signature notes bare; naturals and restorations explicit; octave-specific; resets at barline', () => {
    const notes = [
      N(3, 1, 4, 48), // F#4 -> in key: bare F
      N(3, 0, 4, 48), // F natural -> =F
      N(3, 1, 4, 48), // F#4 again -> ^F (state was natural)
      N(3, 1, 5, 48), // F#5 -> bare f (different octave, untouched state)
      // barline
      N(3, 0, 4, 48), // =F (fresh measure)
      N(3, 1, 4, 48), // ^F
      N(3, 1, 4, 48), // F (state already sharp)
      N(3, 1, 5, 48), // f
    ];
    const abc = DS.abc.fromExcerpt(melodicExcerpt(notes, { key: G_MAJOR, sig: 1 }));
    ok(abc.includes('M:4/4'), 'meter');
    ok(abc.includes('L:1/32'), 'unit');
    ok(abc.includes('K:G'), 'key');
    ok(abc.includes('F8 =F8 ^F8 f8 | =F8 ^F8 F8 f8 |]'), `music line wrong:\n${abc}`);
  });

  test('upbeat produces a short first measure', () => {
    const notes = [N(0, 0, 5, 48), N(1, 0, 5, 48), N(2, 0, 5, 48), N(3, 0, 5, 48), N(4, 0, 5, 48)];
    const abc = DS.abc.fromExcerpt(melodicExcerpt(notes, { key: C_MAJOR, sig: 0, upbeat: 48 }));
    ok(abc.includes('c8 | d8 e8 f8 g8 |]'), `upbeat handling wrong:\n${abc}`);
  });

  test('ties, fermatas, rests', () => {
    const notes = [
      N(0, 0, 4, 96, { tieStart: true }),
      N(0, 0, 4, 96, { tieEnd: true, fermata: true }),
      N(-1, 0, 0, 96), // rest
      N(4, 0, 4, 96),
    ];
    const abc = DS.abc.fromExcerpt(melodicExcerpt(notes, { key: C_MAJOR, sig: 0, num: 2 }));
    ok(abc.includes('C16- | !fermata!C16 | z16 | G16 |]'), `tie/fermata/rest wrong:\n${abc}`);
  });

  test('eighths beam by beat (no space inside a beat)', () => {
    const notes = [
      N(0, 0, 5, 24), N(1, 0, 5, 24), N(2, 0, 5, 24), N(3, 0, 5, 24),
      N(4, 0, 5, 96),
    ];
    const abc = DS.abc.fromExcerpt(melodicExcerpt(notes, { key: C_MAJOR, sig: 0, num: 2 }));
    ok(abc.includes('c4d4 e4f4 | g16 |]'), `beaming wrong:\n${abc}`);
  });

  test('low register chooses bass clef', () => {
    const notes = [N(0, 0, 3, 96), N(4, 0, 2, 96)];
    const abc = DS.abc.fromExcerpt(melodicExcerpt(notes, { key: C_MAJOR, sig: 0, num: 2 }));
    ok(abc.includes('clef=bass'), `expected bass clef:\n${abc}`);
    ok(abc.includes('C,16 | G,,16 |]'), `low octaves wrong:\n${abc}`);
  });
});

suite('abc: SATB + romans', () => {
  test('grand staff with stems, voices, aligned roman lyrics', () => {
    const excerpt = {
      kind: 'harmonic', source: 'test', key: C_MAJOR, sig: 0,
      num: 4, den: 4, mlen: 192, upbeat: 0, tpq: 48,
      voices: [
        [N(2, 0, 4, 96), N(3, 0, 4, 96), N(1, 0, 4, 192)], // S: E4 F4 D4
        [N(0, 0, 4, 96), N(0, 0, 4, 96), N(6, 0, 3, 192)], // A: C4 C4 B3
        [N(4, 0, 3, 96), N(5, 0, 3, 96), N(4, 0, 3, 192)], // T: G3 A3 G3
        [N(0, 0, 3, 96), N(3, 0, 2, 96), N(4, 0, 2, 192)], // B: C3 F2 G2
      ],
      romans: [
        { label: 'I', tick: 0 },
        { label: 'IV', tick: 96 },
        { label: 'V7', tick: 192 },
      ],
      meta: {},
    };
    const abc = DS.abc.fromExcerpt(excerpt, { showRomans: true });
    ok(abc.includes('%%score {(S A) | (T B)}'), 'score directive');
    ok(abc.includes('V:S clef=treble stem=up'), 'S voice def');
    ok(abc.includes('V:B clef=bass stem=down'), 'B voice def');
    ok(abc.includes('[V:S] E16 F16 | D32 |]'), `S line:\n${abc}`);
    ok(abc.includes('[V:B] C,16 F,,16 | G,,32 |]'), `B line:\n${abc}`);
    ok(abc.includes('w: I IV V7'), `romans lyrics:\n${abc}`);
  });

  test('roman numerals align by tick; bass passing tone gets a skip syllable', () => {
    const excerpt = {
      kind: 'harmonic', source: 'test', key: C_MAJOR, sig: 0,
      num: 4, den: 4, mlen: 192, upbeat: 0, tpq: 48,
      voices: [
        [N(2, 0, 4, 48), N(2, 0, 4, 48), N(1, 0, 4, 48), N(2, 0, 4, 48)], // S (one bar of quarters)
        [N(0, 0, 4, 48), N(0, 0, 4, 48), N(0, 0, 4, 48), N(0, 0, 4, 48)], // A
        [N(4, 0, 3, 48), N(4, 0, 3, 48), N(0, 0, 4, 48), N(4, 0, 3, 48)], // T
        // Bass: C3 (I, split) D3 passing | E3 (I6) | G2 (V) | C3 (I) — D3@24 is the NCT
        [N(0, 0, 3, 24), N(1, 0, 3, 24), N(2, 0, 3, 48), N(4, 0, 2, 48), N(0, 0, 3, 48)],
      ],
      romans: [
        { label: 'I', tick: 0 }, { label: 'I6', tick: 48 },
        { label: 'V', tick: 96 }, { label: 'I', tick: 144 },
      ],
      meta: {},
    };
    const abc = DS.abc.fromExcerpt(excerpt, { showRomans: true });
    // 5 bass notes; the passing D3 (tick 24, not a chord onset) gets a '*'
    ok(abc.includes('w: I * I6 V I'), `roman alignment wrong:\n${abc}`);
  });

  test('romans hidden unless requested', () => {
    const excerpt = {
      kind: 'harmonic', source: 'test', key: C_MAJOR, sig: 0,
      num: 4, den: 4, mlen: 192, upbeat: 0, tpq: 48,
      voices: [
        [N(2, 0, 4, 192)], [N(0, 0, 4, 192)], [N(4, 0, 3, 192)], [N(0, 0, 3, 192)],
      ],
      romans: [{ label: 'I', tick: 0 }],
      meta: {},
    };
    const abc = DS.abc.fromExcerpt(excerpt, { showRomans: false });
    ok(!abc.includes('w:'), 'no lyric line');
  });

  test('negative sig renders flat key', () => {
    const excerpt = melodicExcerpt([N(6, -1, 4, 192)], { key: { tonic: { step: 3, alter: 0 }, mode: 'major' }, sig: -1 });
    const abc = DS.abc.fromExcerpt(excerpt);
    ok(abc.includes('K:F'), `key line:\n${abc}`);
    ok(abc.includes('B16') || abc.includes('B32'), `Bb bare under signature:\n${abc}`);
  });
});
