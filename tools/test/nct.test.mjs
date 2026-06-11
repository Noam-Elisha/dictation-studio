import { loadDS, suite, test, eq, ok } from './harness.mjs';

const DS = loadDS([
  'js/rng.js', 'js/theory.js', 'js/progression.js', 'js/voicing.js', 'js/nct.js',
]);
const T = DS.theory;
const C_MAJOR = { tonic: { step: 0, alter: 0 }, mode: 'major' };
const A_MINOR = { tonic: { step: 5, alter: 0 }, mode: 'minor' };

const ic = (hi, lo) => (((hi - lo) % 12) + 12) % 12;
const isPerf = (i) => i === 0 || i === 7;

function isAug(a, b) {
  const iv = T.intervalBetween(a, b);
  let d = Math.abs(iv.d), s = Math.abs(iv.s);
  if (d === 0) return false;
  while (d >= 7) { d -= 7; s -= 12; }
  return s > [0, 2, 4, 5, 7, 9, 11][d];
}

// Reconstruct the sounding 4-voice "slices" from embellished voices and verify
// no parallel perfects appear between consecutive distinct sonorities.
function checkNoParallels(voices, label) {
  // event boundaries: merge all voices onto a tick grid
  const starts = voices.map((v) => {
    const s = [];
    let t = 0;
    for (const n of v) { s.push({ t, n }); t += n.dur; }
    return { notes: s, total: t };
  });
  const total = starts[0].total;
  for (const s of starts) eq(s.total, total, `${label}: voice length mismatch`);
  // boundary ticks
  const ticks = new Set([0]);
  for (const s of starts) for (const e of s.notes) ticks.add(e.t);
  const sorted = [...ticks].filter((t) => t < total).sort((a, b) => a - b);
  const pitchAt = (vi, t) => {
    const ns = starts[vi].notes;
    let cur = ns[0].n;
    for (const e of ns) { if (e.t <= t) cur = e.n; else break; }
    return cur;
  };
  let prev = null;
  for (const t of sorted) {
    const chord = [0, 1, 2, 3].map((vi) => T.midi(pitchAt(vi, t)));
    if (prev) {
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
        const before = ic(Math.max(prev[a], prev[b]), Math.min(prev[a], prev[b]));
        const after = ic(Math.max(chord[a], chord[b]), Math.min(chord[a], chord[b]));
        const moved = prev[a] !== chord[a] && prev[b] !== chord[b];
        if (moved && isPerf(after) && before === after)
          ok(false, `${label}: parallel perfect (${a},${b}) at tick ${t}`);
      }
    }
    prev = chord;
  }
}

suite('nct: embellishment', () => {
  test('soak: no parallels, ranges kept, bass unembellished, durations preserved', () => {
    const RANGES = [[60, 79], [55, 74], [48, 67], [40, 60]];
    let embellishedCount = 0, totalRuns = 0;
    for (let difficulty = 1; difficulty <= 4; difficulty++) {
      for (const key of [C_MAJOR, A_MINOR]) {
        for (let seed = 0; seed < 180; seed++) {
          const rng = DS.rng.create(seed * 11 + difficulty * 777 + (key === A_MINOR ? 1 : 0));
          const chords = DS.progression.generate(rng, { difficulty, mode: key.mode, length: [5, 7, 9][seed % 3] });
          const block = DS.voicing.harmonize(rng, key, chords);
          if (!block) continue;
          totalRuns++;
          const voices = DS.nct.assemble(rng, key, chords, block, { difficulty });
          const label = `d${difficulty} ${key.mode} seed ${seed}`;

          // bass is exactly one note per chord
          eq(voices[3].length, chords.length, `${label}: bass embellished`);
          // total duration per voice equals the progression length
          const tot = chords.reduce((s, c) => s + c.dur, 0);
          for (let v = 0; v < 4; v++)
            eq(voices[v].reduce((s, nt) => s + nt.dur, 0), tot, `${label}: voice ${v} duration`);
          // ranges + no augmented melodic steps within a voice
          for (let v = 0; v < 4; v++) {
            for (let i = 0; i < voices[v].length; i++) {
              const m = T.midi(voices[v][i]);
              ok(m >= RANGES[v][0] && m <= RANGES[v][1], `${label}: v${v} note ${i} out of range (${m})`);
              if (i > 0) ok(!isAug(voices[v][i - 1], voices[v][i]), `${label}: v${v} augmented step at ${i}`);
            }
            if (voices[v].length > chords.length) embellishedCount++;
          }
          checkNoParallels(voices, label);
        }
      }
    }
    ok(embellishedCount > 200, `expected many embellishments, saw ${embellishedCount}`);
  });

  test('difficulty 1 stays nearly plain; difficulty 4 adds many', () => {
    const d1 = densitySafe(1), d4 = densitySafe(4);
    ok(d4 > d1, `d4 (${d4.toFixed(3)}) should embellish more than d1 (${d1.toFixed(3)})`);
    ok(d1 < 0.06, `d1 should be sparse (${d1.toFixed(3)})`);
  });
});

// extra notes per chord, averaged over many progressions
function densitySafe(difficulty) {
  let extra = 0, base = 0;
  for (let seed = 0; seed < 250; seed++) {
    const rng = DS.rng.create(seed * 9 + difficulty * 13);
    const chords = DS.progression.generate(rng, { difficulty, mode: 'major', length: 7 });
    const block = DS.voicing.harmonize(rng, C_MAJOR, chords);
    if (!block) continue;
    const voices = DS.nct.assemble(rng, C_MAJOR, chords, block, { difficulty });
    for (let v = 0; v < 3; v++) extra += voices[v].length - chords.length;
    base += chords.length;
  }
  return extra / base;
}
