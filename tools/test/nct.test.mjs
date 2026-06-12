import { loadDS, suite, test, eq, ok } from './harness.mjs';

const DS = loadDS([
  'js/rng.js', 'js/theory.js', 'js/progression.js', 'js/voicing.js', 'js/nct.js',
]);
const T = DS.theory;
const C_MAJOR = { tonic: { step: 0, alter: 0 }, mode: 'major' };
const A_MINOR = { tonic: { step: 5, alter: 0 }, mode: 'minor' };
const RANGES = [[60, 79], [55, 74], [48, 67], [40, 62]];

const ic = (hi, lo) => (((hi - lo) % 12) + 12) % 12;
const isPerf = (i) => i === 0 || i === 7;

function isAug(a, b) {
  const iv = T.intervalBetween(a, b);
  let d = Math.abs(iv.d), s = Math.abs(iv.s);
  if (d === 0) return false;
  while (d >= 7) { d -= 7; s -= 12; }
  return s > [0, 2, 4, 5, 7, 9, 11][d];
}

// onsets + sounding pitch per voice
function gridOf(voices) {
  return voices.map((v) => {
    const arr = [];
    let t = 0;
    for (const n of v) { arr.push({ t, n }); t += n.dur; }
    return { notes: arr, total: t };
  });
}

function checkNoParallels(voices, label) {
  const g = gridOf(voices);
  const total = g[0].total;
  for (const s of g) eq(s.total, total, `${label}: voice length mismatch`);
  const ticks = new Set([0]);
  for (const s of g) for (const e of s.notes) if (e.t < total) ticks.add(e.t);
  const sorted = [...ticks].sort((a, b) => a - b);
  const pitchAt = (vi, t) => {
    let cur = g[vi].notes[0];
    for (const e of g[vi].notes) { if (e.t <= t) cur = e; else break; }
    return T.midi(cur.n);
  };
  let prev = null;
  for (const t of sorted) {
    const chord = [0, 1, 2, 3].map((vi) => pitchAt(vi, t));
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

// average number of voices that subdivide (carry an eighth figure) per beat
function voiceSubdivPerBeat(voices, total) {
  const g = gridOf(voices);
  let beats = 0, subdiv = 0;
  for (let bs = 0; bs + 48 <= total; bs += 48) {
    beats++;
    for (const s of g) {
      let onsets = 0;
      for (const e of s.notes) if (e.t >= bs && e.t < bs + 48) onsets++;
      if (onsets > 1) subdiv++;
    }
  }
  return beats ? subdiv / beats : 0;
}

suite('nct: embellishment', () => {
  test('soak: no parallels, ranges kept, durations preserved (all difficulties, both modes)', () => {
    let embellishedVoices = 0;
    for (let difficulty = 1; difficulty <= 4; difficulty++) {
      for (const key of [C_MAJOR, A_MINOR]) {
        for (let seed = 0; seed < 160; seed++) {
          const rng = DS.rng.create(seed * 11 + difficulty * 777 + (key === A_MINOR ? 1 : 0));
          const chords = DS.progression.generate(rng, { difficulty, mode: key.mode, bars: [2, 3, 4][seed % 3] });
          const block = DS.voicing.harmonize(rng, key, chords);
          if (!block) continue;
          const voices = DS.nct.assemble(rng, key, chords, block, { difficulty });
          const label = `d${difficulty} ${key.mode} seed ${seed}`;
          const tot = chords.reduce((s, c) => s + c.dur, 0);
          for (let v = 0; v < 4; v++) {
            eq(voices[v].reduce((s, nt) => s + nt.dur, 0), tot, `${label}: voice ${v} duration`);
            for (let i = 0; i < voices[v].length; i++) {
              const m = T.midi(voices[v][i]);
              ok(m >= RANGES[v][0] && m <= RANGES[v][1], `${label}: v${v} note ${i} out of range (${m})`);
              if (i > 0) ok(!isAug(voices[v][i - 1], voices[v][i]), `${label}: v${v} aug step at ${i}`);
            }
            if (voices[v].length > chords.length) embellishedVoices++;
          }
          checkNoParallels(voices, label);
        }
      }
    }
    ok(embellishedVoices > 500, `expected many embellished voices, saw ${embellishedVoices}`);
  });

  test('no two consecutive dissonant sonorities (NCT clashes resolve)', () => {
    const pc = (m) => ((m % 12) + 12) % 12;
    for (let difficulty = 2; difficulty <= 4; difficulty++) {
      for (let seed = 0; seed < 250; seed++) {
        const key = seed % 2 ? C_MAJOR : A_MINOR;
        const rng = DS.rng.create(seed * 7 + difficulty * 101);
        const chords = DS.progression.generate(rng, { difficulty, mode: key.mode, bars: 3 });
        const block = DS.voicing.harmonize(rng, key, chords);
        if (!block) continue;
        const voices = DS.nct.assemble(rng, key, chords, block, { difficulty });
        // chord spans + pitch-class sets
        const starts = [], durs = chords.map((c) => c.dur);
        let a2 = 0;
        for (const c of chords) { starts.push(a2); a2 += c.dur; }
        const chordPcs = block.map((ch) => new Set(ch.map((p) => pc(T.midi(p)))));
        const activeChord = (t) => { for (let i = 0; i < starts.length; i++) if (t >= starts[i] && t < starts[i] + durs[i]) return i; return starts.length - 1; };
        const g = gridOf(voices);
        const ticks = new Set([0]);
        for (const s of g) for (const e of s.notes) if (e.t < g[0].total) ticks.add(e.t);
        const pitchAt = (vi, t) => { let cur = g[vi].notes[0]; for (const e of g[vi].notes) { if (e.t <= t) cur = e; else break; } return T.midi(cur.n); };
        const sorted = [...ticks].sort((x, y) => x - y);
        const diss = (t) => {
          const son = [0, 1, 2, 3].map((vi) => pitchAt(vi, t));
          const cp = chordPcs[activeChord(t)];
          for (let x = 0; x < 4; x++) for (let y = x + 1; y < 4; y++) {
            const d = Math.abs(son[x] - son[y]);
            if ((d === 1 || d === 2) && (!cp.has(pc(son[x])) || !cp.has(pc(son[y])))) return true;
          }
          return false;
        };
        let prev = false;
        for (const t of sorted) {
          const d = diss(t);
          ok(!(d && prev), `d${difficulty} seed ${seed}: two consecutive dissonant sonorities at tick ${t}`);
          prev = d;
        }
      }
    }
  });

  test('density scales with difficulty and approaches Bach at D4', () => {
    function density(difficulty) {
      let sum = 0, runs = 0;
      for (let seed = 0; seed < 250; seed++) {
        const rng = DS.rng.create(seed * 9 + difficulty * 13);
        const chords = DS.progression.generate(rng, { difficulty, mode: seed % 2 ? 'major' : 'minor', bars: 3 });
        const key = seed % 2 ? C_MAJOR : A_MINOR;
        const block = DS.voicing.harmonize(rng, key, chords);
        if (!block) continue;
        const voices = DS.nct.assemble(rng, key, chords, block, { difficulty });
        sum += voiceSubdivPerBeat(voices, chords.reduce((s, c) => s + c.dur, 0));
        runs++;
      }
      return sum / runs;
    }
    const d = [1, 2, 3, 4].map(density);
    ok(d[0] < d[1] && d[1] < d[2] && d[2] < d[3], `monotonic density: ${d.map((x) => x.toFixed(2))}`);
    ok(d[0] < 0.2, `d1 sparse (${d[0].toFixed(2)})`);
    ok(d[3] >= 0.4, `d4 rich but not saturated (${d[3].toFixed(2)})`);
  });

  test('anticipations are present and far outnumber escapes', () => {
    const pc = (m) => ((m % 12) + 12) % 12;
    let anticipations = 0, escapes = 0;
    for (let seed = 0; seed < 600; seed++) {
      const key = seed % 2 ? C_MAJOR : A_MINOR;
      const rng = DS.rng.create(seed * 9 + 4);
      const chords = DS.progression.generate(rng, { difficulty: 4, mode: key.mode, bars: 3 });
      const block = DS.voicing.harmonize(rng, key, chords);
      if (!block) continue;
      const starts = [], durs = chords.map((c) => c.dur);
      let a = 0;
      for (const c of chords) { starts.push(a); a += c.dur; }
      const ac = (t) => { for (let i = 0; i < starts.length; i++) if (t >= starts[i] && t < starts[i] + durs[i]) return i; return starts.length - 1; };
      const cps = block.map((ch) => new Set(ch.map((p) => pc(T.midi(p)))));
      const voices = DS.nct.assemble(rng, key, chords, block, { difficulty: 4 });
      for (let v = 0; v < 4; v++) {
        const ns = voices[v];
        let t = 0;
        for (let i = 0; i < ns.length; i++) {
          const n = ns[i];
          if (n.dur <= 24 && !cps[ac(t)].has(pc(T.midi(n)))) {
            const prev = ns[i - 1], next = ns[i + 1];
            const cm = T.midi(n), pm = prev && T.midi(prev), nm = next && T.midi(next);
            if (next && nm === cm) anticipations++; // sounded early, left by repetition
            else if (prev && Math.abs(cm - pm) <= 2 && next && Math.abs(nm - cm) > 2) escapes++;
          }
          t += n.dur;
        }
      }
    }
    ok(anticipations > 200, `expected many anticipations, saw ${anticipations}`);
    ok(anticipations > escapes * 3, `anticipations (${anticipations}) should dwarf escapes (${escapes})`);
  });

  test('bass is embellished sometimes (passing tones in the bass)', () => {
    let bassExtra = 0;
    for (let seed = 0; seed < 300; seed++) {
      const rng = DS.rng.create(seed * 5 + 3);
      const chords = DS.progression.generate(rng, { difficulty: 4, mode: 'major', bars: 3 });
      const block = DS.voicing.harmonize(rng, C_MAJOR, chords);
      if (!block) continue;
      const voices = DS.nct.assemble(rng, C_MAJOR, chords, block, { difficulty: 4 });
      bassExtra += voices[3].length - chords.length;
    }
    ok(bassExtra > 30, `expected bass passing tones, saw ${bassExtra}`);
  });

  test('suspensions tie the preparation into the dissonance', () => {
    let suspensions = 0;
    for (let seed = 0; seed < 400; seed++) {
      const rng = DS.rng.create(seed * 7 + 2);
      const chords = DS.progression.generate(rng, { difficulty: 4, mode: 'major', bars: 4 });
      const block = DS.voicing.harmonize(rng, C_MAJOR, chords);
      if (!block) continue;
      const voices = DS.nct.assemble(rng, C_MAJOR, chords, block, { difficulty: 4 });
      for (const v of voices) {
        for (let i = 1; i < v.length; i++) {
          if (v[i].tieEnd) {
            suspensions++;
            ok(v[i - 1].tieStart, `tieEnd note at ${i} must follow a tieStart`);
            eq(T.midi(v[i - 1]), T.midi(v[i]), 'tied notes share a pitch');
          }
        }
      }
    }
    ok(suspensions > 10, `expected some tied suspensions, saw ${suspensions}`);
  });
});
