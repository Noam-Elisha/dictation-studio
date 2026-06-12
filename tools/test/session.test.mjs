import { loadDS, suite, test, eq, close, ok } from './harness.mjs';

const DS = loadDS([
  'js/rng.js',
  'js/theory.js',
  'js/progression.js',
  'js/voicing.js',
  'js/synth.js',
  'js/session.js',
]);

const N = (step, alter, oct, dur, extra = {}) =>
  ({ step, alter, oct, dur, tieStart: false, tieEnd: false, fermata: false, ...extra });

const C_MAJOR = { tonic: { step: 0, alter: 0 }, mode: 'major' };

function excerptOf(voices, over = {}) {
  return {
    kind: voices.length === 1 ? 'melodic' : 'harmonic',
    source: 'test', key: C_MAJOR, sig: 0,
    num: 4, den: 4, mlen: 192, upbeat: 0, tpq: 48,
    voices, romans: null, meta: {}, ...over,
  };
}

suite('synth: event building (pure)', () => {
  test('ticks to seconds at tempo', () => {
    const ex = excerptOf([[N(0, 0, 4, 48), N(1, 0, 4, 96)]]);
    const { events, totalSec } = DS.synth.buildExcerptEvents(ex, { bpm: 60 });
    eq(events.length, 2);
    close(events[0].t, 0);
    close(events[0].dur, 1);
    close(events[1].t, 1);
    close(events[1].dur, 2);
    close(totalSec, 3);
    eq(events[0].midi, 60);
  });

  test('tied notes merge into one event', () => {
    const ex = excerptOf([[N(4, 0, 4, 48, { tieStart: true }), N(4, 0, 4, 48, { tieEnd: true }), N(2, 0, 4, 48)]]);
    const { events } = DS.synth.buildExcerptEvents(ex, { bpm: 60 });
    eq(events.length, 2);
    close(events[0].dur, 2);
    close(events[1].t, 2);
  });

  test('fermata stretch (1.5x) holds the chord and shifts what follows, all voices', () => {
    const ex = excerptOf([
      [N(2, 0, 5, 48, { fermata: true }), N(0, 0, 5, 48)],
      [N(4, 0, 4, 48, { fermata: true }), N(4, 0, 4, 48)],
      [N(0, 0, 4, 48, { fermata: true }), N(2, 0, 4, 48)],
      [N(0, 0, 3, 48, { fermata: true }), N(0, 0, 3, 48)],
    ]);
    const stretched = DS.synth.buildExcerptEvents(ex, { bpm: 60, honorFermatas: true });
    const plain = DS.synth.buildExcerptEvents(ex, { bpm: 60, honorFermatas: false });
    close(plain.totalSec, 2);
    // a 48-tick fermata at 60bpm (1s) held 1.5x adds 0.5s -> total 2.5s
    close(stretched.totalSec, 2.5);
    const late = stretched.events.filter((e) => e.t > 1.4);
    eq(late.length, 4, 'second chord shifted in every voice');
  });

  test('voicesPlayed filter and voice tagging', () => {
    const ex = excerptOf([
      [N(2, 0, 5, 48)], [N(4, 0, 4, 48)], [N(0, 0, 4, 48)], [N(0, 0, 3, 48)],
    ]);
    const all = DS.synth.buildExcerptEvents(ex, { bpm: 60 });
    eq(all.events.length, 4);
    eq(new Set(all.events.map((e) => e.voice)).size, 4);
    const outer = DS.synth.buildExcerptEvents(ex, { bpm: 60, voicesPlayed: [0, 3] });
    eq(outer.events.length, 2);
    eq(outer.events.map((e) => e.voice).sort().join(','), '0,3');
  });

  test('cadence events end on the tonic note', () => {
    const { events, totalSec } = DS.synth.buildCadenceEvents(C_MAJOR);
    ok(events.length >= 17, `4 chords + tonic, got ${events.length}`);
    ok(totalSec > 3 && totalSec < 10, `totalSec ${totalSec}`);
    const last = events[events.length - 1];
    eq(last.midi % 12, 0, 'tonic pitch class');
  });
});

suite('session: phase planning (pure)', () => {
  test('establish first + count-in first', () => {
    const phases = DS.session.planPhases({
      plays: 3, establish: 'first', countIn: 'first', autoReveal: false,
    });
    eq(phases, ['establish', 'countin', 'play', 'gap', 'play', 'gap', 'play']);
  });

  test('establish every + auto-reveal adds final gap', () => {
    const phases = DS.session.planPhases({
      plays: 2, establish: 'every', countIn: 'off', autoReveal: true,
    });
    eq(phases, ['establish', 'play', 'gap', 'establish', 'play', 'gap', 'reveal']);
  });

  test('no extras', () => {
    eq(DS.session.planPhases({ plays: 1, establish: 'off', countIn: 'off', autoReveal: false }), ['play']);
  });
});
