// SATB voice-leading engine. harmonize() realizes a chord-spec progression
// (from DS.progression) as four voices via beam search over candidate
// voicings; validate() re-derives every hard rule from the raw result,
// independent of the search (it shares the low-level rule predicates, which
// are themselves pinned by planted-violation tests).
//
// Voices are ordered [S, A, T, B]; pitches are {step, alter, oct}.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});
  const T = DS.theory;

  const RANGES = [
    [60, 79], // S  C4-G5
    [55, 74], // A  G3-D5
    [48, 67], // T  C3-G4
    [40, 60], // B  E2-C4
  ];
  const MAX_ADJACENT = [12, 12, 19]; // S-A, A-T, T-B in semitones

  // ---- helpers -------------------------------------------------------------

  function spellTone(key, tone) {
    return T.degreeNote(key, tone[0], tone[1]);
  }

  // Chord context: spelled tones, role pitch-classes, resolution targets.
  function context(key, spec) {
    const tones = spec.tones.map((t) => spellTone(key, t));
    const pcs = tones.map((p) => T.pc({ ...p, oct: 4 }));
    const ltPc = spec.lt != null ? pcs[spec.lt] : null;
    const sevPc = spec.seventh != null ? pcs[spec.seventh] : null;
    const alteredPcs = new Set(
      spec.tones.filter((t) => t[1] !== 0).map((t) => T.pc({ ...spellTone(key, t), oct: 4 }))
    );
    let rPc = null;
    let rFifthPc = null;
    if (spec.rT != null) {
      // honor the raised leading tone: resolution target of V in minor is
      // still the tonic; for secondaries the catalog degree is enough
      const target = T.degreeNote(key, spec.rT, 0);
      rPc = T.pc({ ...target, oct: 4 });
      rFifthPc = (rPc + 7) % 12;
    }
    let ltResolveTo = null;
    if (ltPc != null) ltResolveTo = (ltPc + 1) % 12;
    const rolePc = { root: pcs[0], third: pcs[1], fifth: pcs.length > 2 ? pcs[2] : null };
    return { spec, tones, pcs, ltPc, sevPc, alteredPcs, rPc, rFifthPc, ltResolveTo, rolePc, key };
  }

  // Upper-voice tone-index multisets (indices into spec.tones).
  function upperSets(spec) {
    const n = spec.tones.length;
    const banDouble = (i) =>
      i === spec.lt || i === spec.seventh || spec.tones[i][1] !== 0;
    if (spec.cad64) return [[0, 1, 2]];
    if (n === 4) {
      const rem = [0, 1, 2, 3].filter((i) => i !== spec.bass);
      const sets = [rem];
      if (spec.bass === 0 && !banDouble(0)) sets.push([0, 1, 3]); // omit 5th
      return sets;
    }
    const others = [0, 1, 2].filter((i) => i !== spec.bass);
    const sets = [];
    for (let dbl = 0; dbl < 3; dbl++) {
      if (banDouble(dbl)) continue;
      sets.push([...others, dbl]);
    }
    if (spec.bass === 0 && !banDouble(0)) sets.push([0, 0, 1]); // tripled root, omit 5th
    return sets;
  }

  function permutations3(arr) {
    const seen = new Set();
    const out = [];
    const idx = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ];
    for (const p of idx) {
      const perm = [arr[p[0]], arr[p[1]], arr[p[2]]];
      const k = perm.join(',');
      if (!seen.has(k)) {
        seen.add(k);
        out.push(perm);
      }
    }
    return out;
  }

  function octaveOptions(pitch, [lo, hi]) {
    const out = [];
    for (let oct = 1; oct <= 6; oct++) {
      const p = { ...pitch, oct };
      const m = T.midi(p);
      if (m >= lo && m <= hi) out.push({ p, m });
    }
    return out;
  }

  // All in-range, well-ordered voicings for one chord.
  function candidates(ctx, opts = {}) {
    const { spec, tones } = ctx;
    const out = [];
    const bassTone = tones[spec.bass];
    for (const bass of octaveOptions(bassTone, RANGES[3])) {
      for (const set of upperSets(spec)) {
        for (const perm of permutations3(set)) {
          // perm = tone indices for [T, A, S]
          const tOpts = octaveOptions(tones[perm[0]], RANGES[2]);
          for (const t of tOpts) {
            if (t.m < bass.m || t.m - bass.m > MAX_ADJACENT[2]) continue;
            const aOpts = octaveOptions(tones[perm[1]], RANGES[1]);
            for (const a of aOpts) {
              if (a.m < t.m || a.m - t.m > MAX_ADJACENT[1]) continue;
              const sOpts = octaveOptions(tones[perm[2]], RANGES[0]);
              for (const s of sOpts) {
                if (s.m < a.m || s.m - a.m > MAX_ADJACENT[0]) continue;
                if (opts.sopranoPcs && !opts.sopranoPcs.has(T.pc(s.p))) continue;
                out.push({
                  pitches: [s.p, a.p, t.p, bass.p],
                  midis: [s.m, a.m, t.m, bass.m],
                });
              }
            }
          }
        }
      }
    }
    return out;
  }

  function isAugmentedMove(a, b) {
    const iv = T.intervalBetween(a, b);
    let d = Math.abs(iv.d);
    let s = Math.abs(iv.s);
    if (d === 0) return false; // chromatic semitone is fine
    while (d >= 7) {
      d -= 7;
      s -= 12;
    }
    const MAJ_PERF = [0, 2, 4, 5, 7, 9, 11];
    return s > MAJ_PERF[d];
  }

  const PERFECT_ICS = new Set([0, 7]);
  const ic = (hi, lo) => (((hi - lo) % 12) + 12) % 12;

  // Hard inter-chord rules. Returns null if ok, else reason string.
  function transitionError(prevCtx, prev, curCtx, cur) {
    const pm = prev.midis;
    const cm = cur.midis;

    // melodic motion limits + augmented intervals (bass may leap a 6th)
    for (let v = 0; v < 4; v++) {
      const dist = Math.abs(cm[v] - pm[v]);
      if (dist > 12) return `melodic leap too large in voice ${v}`;
      if (dist === 10 || dist === 11) return `melodic leap of ${dist} semitones in voice ${v}`;
      if (dist === 9 && v !== 3) return `melodic leap of M6 in voice ${v}`;
      if (isAugmentedMove(prev.pitches[v], cur.pitches[v]))
        return `melodic augmented interval in voice ${v}`;
    }

    // parallel / antiparallel perfect intervals
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const prevIc = ic(pm[i], pm[j]);
        const curIc = ic(cm[i], cm[j]);
        if (!PERFECT_ICS.has(curIc)) continue;
        const bothMoved = pm[i] !== cm[i] && pm[j] !== cm[j];
        if (bothMoved && prevIc === curIc) return `parallel perfect (${i},${j})`;
      }
    }

    // direct (hidden) perfect into outer voices with soprano leap
    {
      const curIc = ic(cm[0], cm[3]);
      const sMove = cm[0] - pm[0];
      const bMove = cm[3] - pm[3];
      if (
        PERFECT_ICS.has(curIc) &&
        ic(pm[0], pm[3]) !== curIc &&
        sMove !== 0 &&
        bMove !== 0 &&
        Math.sign(sMove) === Math.sign(bMove) &&
        Math.abs(sMove) > 2
      )
        return 'direct perfect interval in outer voices';
    }

    // overlap between adjacent voices
    for (let v = 0; v < 3; v++) {
      if (cm[v + 1] > pm[v]) return `overlap: voice ${v + 1} above previous voice ${v}`;
      if (cm[v] < pm[v + 1]) return `overlap: voice ${v} below previous voice ${v + 1}`;
    }

    const curPcSet = new Set(cm.map((m) => ((m % 12) + 12) % 12));

    // Re-voicings of the same harmony (e.g. V -> V6, V7 -> V65) move tendency
    // tones freely between voices; only the motion rules above apply.
    const sameHarmony =
      prevCtx.spec.cad64 === curCtx.spec.cad64 &&
      JSON.stringify([...prevCtx.pcs].sort()) === JSON.stringify([...curCtx.pcs].sort());

    // leading-tone treatment
    if (!sameHarmony && prevCtx.ltPc != null) {
      for (let v = 0; v < 4; v++) {
        if (((pm[v] % 12) + 12) % 12 !== prevCtx.ltPc) continue;
        const move = cm[v] - pm[v];
        const curPc = ((cm[v] % 12) + 12) % 12;
        if (curPc === prevCtx.ltPc) continue; // retained (e.g. V -> V7)
        if (prevCtx.rPc != null && curPcSet.has(prevCtx.rPc)) {
          const outer = v === 0 || v === 3;
          if (move === 1) continue;
          // an augmented sixth's raised 4th is not a true leading tone: it must
          // rise a semitone to scale degree 5, so the frustrated-LT escape
          // (inner voice falling to the fifth) does not apply here
          if (prevCtx.spec.aug6) return `augmented-sixth #4 must rise in voice ${v}`;
          if (!outer && (move === -3 || move === -4) && curPc === prevCtx.rFifthPc) continue;
          return `leading tone not resolved in voice ${v}`;
        }
        if (Math.abs(move) > 2) return `leading tone leaps in voice ${v}`;
      }
    }

    // chordal seventh resolves down by step
    if (!sameHarmony && prevCtx.sevPc != null) {
      for (let v = 0; v < 4; v++) {
        if (((pm[v] % 12) + 12) % 12 !== prevCtx.sevPc) continue;
        const move = cm[v] - pm[v];
        const curPc = ((cm[v] % 12) + 12) % 12;
        if (curPc === prevCtx.sevPc && move === 0) continue; // suspended
        if (move === -1 || move === -2) continue;
        return `seventh not resolved down in voice ${v}`;
      }
    }

    // chordal seventh must be PREPARED: held as a common tone from the previous
    // chord, or failing that approached by step — never leapt into.
    if (!sameHarmony && curCtx.sevPc != null) {
      for (let v = 0; v < 4; v++) {
        if (((cm[v] % 12) + 12) % 12 !== curCtx.sevPc) continue;
        if (Math.abs(cm[v] - pm[v]) > 2) return `seventh approached by leap in voice ${v}`;
      }
    }

    // cadential 6/4 voice obligations
    if (prevCtx.spec.cad64 && curCtx.spec.fn === 'D' && !curCtx.spec.cad64) {
      const tonicPc = prevCtx.rolePc.root;
      const thirdPc = prevCtx.rolePc.third;
      const fifthPc = prevCtx.rolePc.fifth;
      for (let v = 0; v < 3; v++) {
        // upper voices only; bass holds the dominant
        const pPc = ((pm[v] % 12) + 12) % 12;
        const move = cm[v] - pm[v];
        if (pPc === tonicPc && move !== -1) return `cad64: 4th must fall to leading tone (voice ${v})`;
        if (pPc === thirdPc && !(move === -1 || move === -2))
          return `cad64: 6th must fall to 5th (voice ${v})`;
        if (pPc === fifthPc && !(move === 0 || move === -1 || move === -2))
          return `cad64: common tone must hold or fall (voice ${v})`;
      }
    }

    return null;
  }

  // Doubling / completeness errors within one chord. null if ok.
  function chordError(ctx, cand) {
    const counts = new Map();
    for (const m of cand.midis) {
      const pc = ((m % 12) + 12) % 12;
      counts.set(pc, (counts.get(pc) || 0) + 1);
    }
    if (ctx.ltPc != null && (counts.get(ctx.ltPc) || 0) > 1) return 'doubled leading tone';
    if (ctx.sevPc != null && (counts.get(ctx.sevPc) || 0) > 1) return 'doubled seventh';
    for (const pc of ctx.alteredPcs) {
      if (pc !== ctx.ltPc && pc !== ctx.sevPc && (counts.get(pc) || 0) > 1)
        return 'doubled altered tone';
    }
    if (!counts.has(ctx.rolePc.root)) return 'incomplete: missing root';
    if (!counts.has(ctx.rolePc.third)) return 'incomplete: missing third';
    if (ctx.sevPc != null && !counts.has(ctx.sevPc)) return 'incomplete: missing seventh';
    if (ctx.spec.cad64) {
      const bassPc = ((cand.midis[3] % 12) + 12) % 12;
      if ((counts.get(bassPc) || 0) !== 2) return 'cad64 must double the bass';
    }
    return null;
  }

  // ---- soft costs ----------------------------------------------------------

  function transitionCost(prev, cur, rng) {
    const W = [1.0, 0.8, 0.8, 0.6];
    let cost = 0;
    const bMove = cur.midis[3] - prev.midis[3];
    for (let v = 0; v < 4; v++) {
      const move = cur.midis[v] - prev.midis[v];
      cost += Math.abs(move) * W[v] * 0.35;
      if (v < 3 && move !== 0 && bMove !== 0 && Math.sign(move) !== Math.sign(bMove)) cost -= 0.7;
      if (v > 0 && v < 3 && Math.abs(move) > 5) cost += 1.5;
    }
    const sMove = Math.abs(cur.midis[0] - prev.midis[0]);
    if (sMove === 0) cost += 1.1;
    if (sMove === 1 || sMove === 2) cost -= 1.0;
    cost += chordShapeCost(cur);
    return cost + rng() * 0.6;
  }

  function chordShapeCost(cand) {
    let cost = 0;
    const pcs = cand.midis.map((m) => ((m % 12) + 12) % 12);
    const counts = new Map();
    for (const pc of pcs) counts.set(pc, (counts.get(pc) || 0) + 1);
    if (counts.size === 3 && cand.midis.length === 4) {
      // some pc doubled — mild preferences handled via roles below
    }
    if (counts.size === 2) cost += 1.2; // very thin sonority
    if (cand.midis[0] - cand.midis[1] > 9) cost += 0.4;
    if (cand.midis[1] - cand.midis[2] > 9) cost += 0.4;
    // two voices on the exact same pitch (esp. S=A) is muddy — discourage it
    for (let v = 0; v < 3; v++) if (cand.midis[v] === cand.midis[v + 1]) cost += 1.6;
    // keep the soprano off the floor of its range so chromatic pre-dominants
    // (♭VI, augmented sixths with their low ♭6 bass) don't drag the upper
    // voices into a cramped, muddy register
    if (cand.midis[0] < 64) cost += (64 - cand.midis[0]) * 0.25;
    return cost;
  }

  // Soft lookahead: 0 if some voice is within a step of the coming seventh's
  // pitch class (so it can prepare it), else a penalty. Skipped when the same
  // seventh simply continues (it is already a common tone).
  function prepCost(cand, nextSevPc, ownSevPc) {
    if (nextSevPc === ownSevPc) return 0;
    for (const m of cand.midis) {
      const pcm = ((m % 12) + 12) % 12;
      const d = ((nextSevPc - pcm) % 12 + 12) % 12;
      if (Math.min(d, 12 - d) <= 2) return 0;
    }
    return 6;
  }

  // ---- beam search ---------------------------------------------------------

  // Keep the beam diverse in soprano pitch class so a final soprano
  // constraint (PAC/IAC) can't strand every surviving state.
  function prune(states, K) {
    states.sort((a, b) => a.cost - b.cost);
    const bySop = new Map();
    const rest = [];
    for (const s of states) {
      const pc = ((s.cand.midis[0] % 12) + 12) % 12;
      if (!bySop.has(pc)) bySop.set(pc, s);
      else rest.push(s);
    }
    const out = [...bySop.values()];
    for (const s of rest) {
      if (out.length >= K) break;
      out.push(s);
    }
    out.sort((a, b) => a.cost - b.cost);
    return out.slice(0, Math.max(K, bySop.size));
  }

  function harmonize(rng, key, chords, opts = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = harmonizeOnce(rng, key, chords, opts);
      if (result) return result;
    }
    return null;
  }

  function harmonizeOnce(rng, key, chords, opts = {}) {
    const K = opts.beam || 14;
    const ctxs = chords.map((spec) => context(spec.key || key, spec));
    const candLists = ctxs.map((ctx, i) => {
      const isLast = i === chords.length - 1;
      const sopranoPcs =
        isLast && chords[i].sopranoEnd
          ? new Set(chords[i].sopranoEnd.map((deg) => T.pc({ ...T.degreeNote(chords[i].key || key, deg, 0), oct: 4 })))
          : null;
      let cands = candidates(ctx, { sopranoPcs });
      cands = cands.filter((c) => !chordError(ctx, c));
      return cands;
    });
    if (candLists.some((l) => l.length === 0)) return null;

    let beam = prune(
      candLists[0].map((c) => ({
        cand: c,
        cost: chordShapeCost(c) + rng() * 0.8,
        parent: null,
      })),
      K * 2
    );

    for (let i = 1; i < chords.length; i++) {
      // anticipate the next chord's seventh: prefer voicings of chord i that
      // already have a voice on (or a step from) chord i+1's seventh, so it can
      // be prepared without a leap
      const nextSevPc = i + 1 < chords.length ? ctxs[i + 1].sevPc : null;
      const next = [];
      for (const state of beam) {
        for (const cand of candLists[i]) {
          if (transitionError(ctxs[i - 1], state.cand, ctxs[i], cand)) continue;
          let cost = state.cost + transitionCost(state.cand, cand, rng);
          if (nextSevPc != null) cost += prepCost(cand, nextSevPc, ctxs[i].sevPc);
          next.push({ cand, cost, parent: state });
        }
      }
      if (!next.length) return null;
      beam = prune(next, K);
    }

    // small weighted choice among the best finals for variety
    const top = beam.slice(0, Math.min(4, beam.length));
    const pickWeights = top.map((s, i) => [s, [4, 2, 1, 1][i]]);
    let state = DS.rng.weighted(rng, pickWeights);
    const out = [];
    while (state) {
      out.unshift(state.cand.pitches);
      state = state.parent;
    }
    return out;
  }

  // ---- independent validator ------------------------------------------------

  function validate(key, chords, voices) {
    const errs = [];
    const ctxs = chords.map((spec) => context(spec.key || key, spec));
    const midis = voices.map((ch) => ch.map((p) => T.midi(p)));

    voices.forEach((ch, i) => {
      const m = midis[i];
      for (let v = 0; v < 4; v++) {
        if (m[v] < RANGES[v][0] || m[v] > RANGES[v][1])
          errs.push(`chord ${i}: range violation in voice ${v}`);
      }
      for (let v = 0; v < 3; v++) {
        if (m[v] < m[v + 1]) errs.push(`chord ${i}: crossing between ${v} and ${v + 1}`);
        if (m[v] - m[v + 1] > MAX_ADJACENT[v]) errs.push(`chord ${i}: spacing too wide (${v},${v + 1})`);
      }
      const counts = new Map();
      for (const mm of m) counts.set(((mm % 12) + 12) % 12, (counts.get(((mm % 12) + 12) % 12) || 0) + 1);
      const ctx = ctxs[i];
      if (ctx.ltPc != null && (counts.get(ctx.ltPc) || 0) > 1) errs.push(`chord ${i}: doubled leading tone`);
      if (ctx.sevPc != null && (counts.get(ctx.sevPc) || 0) > 1) errs.push(`chord ${i}: doubled seventh`);
      for (const pc of ctx.alteredPcs)
        if (pc !== ctx.ltPc && pc !== ctx.sevPc && (counts.get(pc) || 0) > 1)
          errs.push(`chord ${i}: doubled altered tone`);
      if (!counts.has(ctx.rolePc.third)) errs.push(`chord ${i}: incomplete (no third)`);
    });

    for (let i = 1; i < voices.length; i++) {
      const err = transitionError(
        ctxs[i - 1],
        { midis: midis[i - 1], pitches: voices[i - 1] },
        ctxs[i],
        { midis: midis[i], pitches: voices[i] }
      );
      if (err) errs.push(`chords ${i - 1}->${i}: ${err}`);
    }
    return errs;
  }

  DS.voicing = { harmonize, validate, RANGES };
})();
