import { loadDS, suite, test, eq, ok } from './harness.mjs';

const DS = loadDS(['js/rng.js', 'js/theory.js', 'js/progression.js', 'js/voicing.js']);
const P = DS.progression;
const T = DS.theory;
const V = DS.voicing;

const D1_MAJOR = new Set(['I', 'I6', 'IV', 'V', 'V7', 'vi', 'I64c']);
const D1_MINOR = new Set(['i', 'i6', 'iv', 'V', 'V7', 'VI', 'i64c']);

// Beat-stream rhythm helpers (shared by the rhythm-invariant suites). Both take
// an optional starting `phase` (the tick the first chord begins on).
const TPQ = 48, BAR = 192;
const strongBeat = (tick) => tick % BAR === 0 || tick % BAR === 96;
function crossesBarline(chords, phase = 0) {
  let t = phase;
  for (const c of chords) {
    if (Math.floor((t + c.dur - 1) / BAR) !== Math.floor(t / BAR)) return true;
    t += c.dur;
  }
  return false;
}
function startTicks(chords, phase = 0) { const out = []; let t = phase; for (const c of chords) { out.push(t); t += c.dur; } return out; }

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

  test('generateModulating: pivots in the middle phrases, never first/last/adjacent, valid pivots, PAC close', () => {
    let runs = 0, withTwo = 0, firstMod = 0, lastMod = 0, adjMod = 0;
    let twoPhrasePieces = 0, twoPhraseNulls = 0;
    const targetsSeen = new Set();
    for (let seed = 0; seed < 600; seed++) {
      const home = seed % 2 ? C_MAJOR : A_MINOR;
      const rng = DS.rng.create(seed * 5 + 1);
      const phrases = 2 + (seed % 5); // 2..6 (the app uses 2..4; 5-6 exercise 2 pivots)
      const chords = P.generateModulating(rng, { difficulty: 4, mode: home.mode, phrases, key1: home });
      // a two-phrase piece has no middle phrase, so it never modulates -> null
      if (phrases === 2) { twoPhrasePieces++; if (!chords) twoPhraseNulls++; }
      if (!chords) continue;
      runs++;
      const mod = chords.modulation;
      ok(mod && sameKey(mod.from, home), `seed ${seed}: starts from home`);
      targetsSeen.add(T.name(mod.to.tonic) + ' ' + mod.to.mode);

      // the opening chord is always the home tonic
      ok(sameKey(chords[0].key, home), `seed ${seed}: opens at home`);

      // pivots = chords tagged with a key change; map each to its phrase index
      const pivotIdx = chords.map((c, i) => (c.keyChange ? i : -1)).filter((i) => i >= 0);
      ok(pivotIdx.length >= 1, `seed ${seed}: at least one modulation`);
      const phraseOf = (ci) => chords.phraseEnds.findIndex((e) => ci <= e);
      const pivotPhrases = [...new Set(pivotIdx.map(phraseOf))].sort((a, b) => a - b);
      if (pivotPhrases.length >= 2) withTwo++;
      if (pivotPhrases.includes(0)) firstMod++;            // never the first phrase
      if (pivotPhrases.includes(phrases - 1)) lastMod++;   // never the last phrase
      for (let k = 1; k < pivotPhrases.length; k++)
        if (pivotPhrases[k] - pivotPhrases[k - 1] < 2) adjMod++; // never two in a row

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

      // bar-aligned: whole number of bars
      eq(chords.reduce((s, c) => s + c.dur, 0) % 192, 0, `seed ${seed}: whole bars`);
    }
    ok(runs >= 440, `most >=3-phrase seeds produced a modulating progression (${runs}/600)`);
    eq(firstMod, 0, 'no modulation in the first phrase');
    eq(lastMod, 0, 'no modulation in the last phrase');
    eq(adjMod, 0, 'no two modulations in a row');
    ok(withTwo > 0, `two modulations occur in longer pieces (${withTwo})`);
    eq(twoPhraseNulls, twoPhrasePieces, 'two-phrase pieces never modulate');
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

suite('progression: prolongation', () => {
  test('expansion templates depart-and-return, voice cleanly, and emphasise non-tonic (PD/D)', () => {
    const PROLONG = P._PROLONG;
    // the core of a prolongation: leave the prolonged chord for a connector and
    // return — never a bare inversion/quality shuffle. So >= 3 chords, and the
    // second chord (the connector) differs from the chord being prolonged.
    for (const mode of ['major', 'minor']) for (const fn of ['T', 'PD', 'D'])
      for (const chain of PROLONG[mode][fn]) {
        ok(chain.length >= 3, `${mode}/${fn} [${chain.join(' ')}] departs and returns (>= 3 chords)`);
        ok(chain[1] !== chain[0], `${mode}/${fn} [${chain.join(' ')}] has a real connector`);
      }
    ok(PROLONG.major.PD.length >= 3 && PROLONG.major.D.length >= 1, 'PD emphasised, D present');
    ok(PROLONG.minor.PD.length >= 2, 'minor PD present');
    for (const mode of ['major', 'minor']) {
      const key = mode === 'major' ? C_MAJOR : A_MINOR;
      for (const fn of ['T', 'PD', 'D']) for (const chain of PROLONG[mode][fn]) {
        const chords = chain.map((s) => P.chordSpec(s, mode));
        let ok1 = false;
        for (let seed = 0; seed < 6 && !ok1; seed++) {
          const v = V.harmonize(DS.rng.create(seed), key, chords);
          if (v && V.validate(key, chords, v).length === 0) ok1 = true;
        }
        ok(ok1, `${mode}/${fn} [${chain.join(' ')}] voices clean`);
      }
    }
  });

  test('prolongation fills D2+ bodies (not D1), incl. non-tonic, and the count stays budget-bound', () => {
    const PROLONG = P._PROLONG;
    // Some PROLONG chains are also reachable as ordinary walk paths — I-V-I,
    // I-V7-I and I-IV-I just chain two plain edges — so the D1 block-chord walk
    // emits them incidentally; they are not evidence of an *inserted*
    // prolongation. Every other chain needs a chord the D1 walk lacks (V6, V43,
    // vii°6, or an applied dominant), so its appearance as a contiguous
    // subsequence is an unambiguous prolongation signal. Scan only those
    // (measured: D1 emits the excluded chains, never the rest).
    const WALK_REPRO = new Set(['I V I', 'I V7 I', 'I IV I', 'i V i', 'i V7 i', 'i iv i']);
    const sig = (chains) => chains.filter((ch) => !WALK_REPRO.has(ch.join(' ')));
    const chainsFor = (mode) => sig([].concat(PROLONG[mode].T, PROLONG[mode].PD, PROLONG[mode].D));
    const hasChain = (syms, mode) => chainsFor(mode).some((ch) => {
      for (let i = 0; i + ch.length <= syms.length; i++) if (ch.every((s, j) => syms[i + j] === s)) return true;
      return false;
    });
    const rate = (d) => {
      let hit = 0, n = 0;
      for (let s = 0; s < 300; s++) {
        const mode = s % 2 ? 'major' : 'minor';
        const ch = P.generatePhrases(DS.rng.create(s * 3 + d * 97), { difficulty: d, mode, phrases: 2 });
        n++; if (hasChain(ch.map((c) => c.sym), mode)) hit++;
      }
      return hit / n;
    };
    ok(rate(1) < 0.06, `D1 essentially never prolongs (${rate(1).toFixed(2)})`);
    ok(rate(2) > 0.30, `D2 frequently prolongs (${rate(2).toFixed(2)})`);
    // a non-tonic (PD/D) chain shows up across many D3 phrases
    let pdHit = false;
    for (let s = 0; s < 300 && !pdHit; s++) {
      const ch = P.generatePhrases(DS.rng.create(s + 5000), { difficulty: 3, mode: 'major', phrases: 3 }).map((c) => c.sym);
      pdHit = sig([].concat(PROLONG.major.PD, PROLONG.major.D)).some((c) => { for (let i = 0; i + c.length <= ch.length; i++) if (c.every((x, j) => ch[i + j] === x)) return true; return false; });
    }
    ok(pdHit, 'non-tonic (predominant/dominant) prolongation appears at D3');
  });
});

suite('progression: rhythm invariants', () => {
  test('buildPhrase emits a fermata beat-stream — no whole notes, no barline crossings, cadence on a strong beat', () => {
    for (let s = 0; s < 600; s++) {
      const d = 1 + (s % 4);
      const phase = [0, 48, 96, 144][s % 4];
      const ph = P._buildPhrase(DS.rng.create(s * 9 + d), {
        mode: s % 2 ? 'major' : 'minor', difficulty: d, startPhase: phase,
        beatBudget: 6 + (s % 6), cadenceClass: s % 3 ? 'open' : 'authentic', chromatic: false, isFinal: s % 5 === 0,
      });
      ok(ph.every((c) => c.dur !== 192), 'no whole notes');
      ok(ph.every((c) => c.dur === 48 || c.dur === 96), 'only quarters and halves');
      ok(!crossesBarline(ph, phase), 'no note crosses a barline');
      const st = startTicks(ph, phase);
      ph.forEach((c, i) => { if (c.dur === 96) ok(strongBeat(st[i]), `half at tick ${st[i]} on a strong beat`); });
      ok(strongBeat(st[st.length - 1]), 'cadence on a strong beat');
      ok(ph[ph.length - 1].fermata === true, 'cadence carries a fermata');
    }
  });

  test('generatePhrases: phrase-ends on strong beats with fermatas, pickups, no barline crossings', () => {
    let midBar = 0, ends = 0;
    for (let s = 0; s < 500; s++) {
      const d = 1 + (s % 4);
      const all = P.generatePhrases(DS.rng.create(s * 11 + d), { difficulty: d, mode: s % 2 ? 'major' : 'minor', phrases: 2 + (s % 3) });
      ok(!crossesBarline(all), 'no note crosses a barline');           // whole piece starts at phase 0
      ok(all.every((c) => c.dur !== 192), 'no whole notes');
      ok(all.reduce((a, c) => a + c.dur, 0) % 192 === 0, 'piece closes the final bar');
      const st = startTicks(all);
      for (const e of all.phraseEnds) { ok(strongBeat(st[e]), `phrase-end ${e} on a strong beat`); ok(all[e].fermata === true, 'fermata'); ends++; if (st[e] % 192 === 96) midBar++; }
    }
    ok(midBar / ends > 0.1, `some phrase-ends fall on beat 3 (pickups): ${midBar}/${ends}`);
  });

  test('generateModulating obeys the rhythm invariants and closes the bar', () => {
    let made = 0;
    for (let s = 0; s < 1200 && made < 200; s++) {
      const d = 4 + (s % 2); // 4 and 5
      const chromatic = d >= 5;
      const mode = s % 2 ? 'major' : 'minor';
      const key1 = { tonic: mode === 'major' ? { step: 0, alter: 0 } : { step: 5, alter: 0 }, mode };
      const all = P.generateModulating(DS.rng.create(s * 13 + d), { difficulty: Math.min(4, d), mode, phrases: 2 + (s % 3), key1, chromatic });
      if (!all) continue;
      made++;
      ok(!crossesBarline(all), 'no note crosses a barline');
      ok(all.every((c) => c.dur !== 192), 'no whole notes');
      ok(all.reduce((a, c) => a + c.dur, 0) % 192 === 0, 'piece closes the final bar');
      const st = startTicks(all);
      for (const e of all.phraseEnds) { ok(strongBeat(st[e]), `phrase-end ${e} on a strong beat`); ok(all[e].fermata === true, 'fermata'); }
      ok(all.modulation && all.phraseEnds && all.cadence, 'contract preserved');
    }
    ok(made >= 150, `exercised modulating pieces (${made})`);
  });

  test('cadence note value follows the landing beat; phrases run ~2 measures', () => {
    let badCad = 0, totalBeats = 0, nPhrases = 0, short = 0;
    for (let d = 1; d <= 4; d++) for (let s = 0; s < 200; s++) {
      const mode = s % 2 ? 'major' : 'minor';
      const all = P.generatePhrases(DS.rng.create(s * 7 + d * 131), { difficulty: d, mode, phrases: 2 + (s % 3) });
      const st = startTicks(all);
      let prevEnd = 0;
      for (const e of all.phraseEnds) {
        nPhrases++;
        const phase = st[e] % BAR, dur = all[e].dur;
        if (phase === 0) { if (dur !== 96) badCad++; }                  // beat 1 -> half
        else if (phase === 96) { if (dur !== 96 && dur !== 48) badCad++; } // beat 3 -> half or quarter
        else badCad++;                                                  // never off a strong beat
        const beats = (st[e] + dur - prevEnd) / TPQ; prevEnd = st[e] + dur;
        totalBeats += beats; if (beats < 6) short++;
      }
    }
    eq(badCad, 0, 'every cadence is on a strong beat with the right note value (beat 1 -> half, beat 3 -> half/quarter)');
    ok(totalBeats / nPhrases >= 7, `phrases average ~2 measures (${(totalBeats / nPhrases).toFixed(1)} beats)`);
    ok(short / nPhrases < 0.1, `few phrases shorter than 1.5 measures (${(100 * short / nPhrases).toFixed(0)}%)`);
  });
});

suite('progression: sequences', () => {
  test('sequenceBody produces valid descending-fifths fragments that voice', () => {
    let made = 0, byMode = { major: 0, minor: 0 };
    for (let s = 0; s < 600 && made < 120; s++) {
      const mode = s % 2 ? 'major' : 'minor';
      const key = mode === 'major' ? C_MAJOR : A_MINOR;
      const d = 3 + (s % 2); // 3 and 4
      const seq = P._sequenceBody(DS.rng.create(s), mode, 4 + (s % 3), d, d >= 4 && s % 3 === 0, mode === 'major' ? 'V7' : 'V');
      if (!seq) continue;
      made++; byMode[mode]++;
      const cad = mode === 'major' ? ['V7', 'I'] : ['V7', 'i'];
      const chords = seq.concat(cad).map((x) => P.chordSpec(x, mode));
      chords[chords.length - 1].sopranoEnd = [1];
      const v = V.harmonize(DS.rng.create(s), key, chords);
      ok(v && V.validate(key, chords, v).length === 0, `${mode} seq [${seq.join(' ')}] voices clean`);
    }
    ok(made >= 80, `exercised sequenceBody (${made})`);
    ok(byMode.major > 0 && byMode.minor > 0, 'both modes produce sequences');
  });

  test('sequences surface in D3+ bodies but never below', () => {
    // a descending-fifths signature: I->IV->viio6 (major) / i->iv->VII (minor) as a contiguous run
    const sig = (syms, mode) => {
      const run = mode === 'major' ? ['I', 'iii', 'vi'] : ['i', 'iv', 'VII'];
      for (let i = 0; i + run.length <= syms.length; i++) if (run.every((s, j) => syms[i + j] === s)) return true;
      return false;
    };
    const rate = (d) => {
      let hit = 0, n = 0;
      for (let s = 0; s < 400; s++) {
        const mode = s % 2 ? 'major' : 'minor';
        const ch = P.generatePhrases(DS.rng.create(s * 5 + d * 31), { difficulty: d, mode, phrases: 2 });
        n++; if (sig(ch.map((c) => c.sym), mode)) hit++;
      }
      return hit / n;
    };
    ok(rate(2) < 0.02, `no sequences below D3 (${rate(2).toFixed(3)})`);
    ok(rate(3) > 0.06, `sequences appear at D3 (${rate(3).toFixed(3)})`);
    ok(rate(4) > rate(3), `sequences more frequent at D4 (${rate(4).toFixed(3)} > ${rate(3).toFixed(3)})`);
  });
});
