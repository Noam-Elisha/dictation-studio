// Non-chord-tone embellishment. Takes the block SATB voicing (one pitch per
// voice per chord, quarter-note harmonic rhythm) and weaves in the off-beat
// figures that make four-part writing sound like real chorales:
//   passing tones, neighbor tones, escape tones (diatonic and chromatic),
//   plus on-beat suspensions and accented passing tones.
//
// Density is calibrated to the Bach corpus (~0.86 of the four voices carry an
// eighth-note figure on a typical beat at the top difficulty) and scaled down
// for easier exercises. Any voice — including the bass — may be embellished,
// and multiple voices may move at once; every tentative figure is validated
// against the whole texture so it introduces no parallel perfects, no voice
// crossing, no out-of-range note and no augmented melodic leap.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});
  const T = DS.theory;
  const RANGES = [
    [60, 79], // S
    [55, 74], // A
    [48, 67], // T
    [40, 62], // B (a touch lower than the generator floor for passing tones)
  ];
  const STEP_PC = [0, 2, 4, 5, 7, 9, 11];
  const E = 24; // eighth note
  const Q = 48; // quarter note
  // a figure decorating a 2-beat (half-note) chord is a quarter note, not an
  // eighth — eighth-note motion is too quick under a slow harmonic rhythm
  const figDur = (chordDur) => (chordDur >= 96 ? Q : E);

  // per-voice, per-beat probability of attempting a figure, by difficulty.
  // Difficulty 5 is richer than 4 but not saturated — a clear step up, not a
  // wall of motion (it leans on suspensions and passing tones).
  const P_BASE = { 1: 0.09, 2: 0.24, 3: 0.36, 4: 0.46, 5: 0.52 };
  // chance an attempted figure is an on-beat (suspension / accented passing) vs
  // off-beat. Difficulty 5 leans toward suspensions but not so hard that the
  // texture is a thicket of ties.
  const P_ONBEAT = { 1: 0.16, 2: 0.24, 3: 0.32, 4: 0.36, 5: 0.44 };

  function ic(hi, lo) {
    return (((hi - lo) % 12) + 12) % 12;
  }
  const isPerfect = (i) => i === 0 || i === 7;

  function isAugmented(a, b) {
    const iv = T.intervalBetween(a, b);
    let d = Math.abs(iv.d);
    let s = Math.abs(iv.s);
    if (d === 0) return false;
    while (d >= 7) {
      d -= 7;
      s -= 12;
    }
    return s > STEP_PC[d];
  }

  function diatonicStep(key, p, dir) {
    const sc = T.scale(key);
    const absStep = p.oct * 7 + p.step + dir;
    const step = ((absStep % 7) + 7) % 7;
    const oct = Math.floor(absStep / 7);
    const alter = (sc.find((x) => x.step === step) || { alter: 0 }).alter;
    return { step, alter, oct };
  }
  // adjacent lower letter, a half step below (chromatic lower neighbor: G->F#)
  function chromaticHalf(p, dir) {
    const absStep = p.oct * 7 + p.step + dir;
    const step = ((absStep % 7) + 7) % 7;
    const oct = Math.floor(absStep / 7);
    const natMidi = 12 * (oct + 1) + STEP_PC[step];
    return { step, alter: T.midi(p) + dir - natMidi, oct };
  }

  const note = (p, dur, extra) => ({
    step: p.step, alter: p.alter, oct: p.oct, dur,
    tieStart: false, tieEnd: false, fermata: false, ...extra,
  });

  // ---- candidate figures ----------------------------------------------------

  // Off-beat figure decorating the END of chord i (the last eighth) in voice v,
  // connecting p1 (chord i) to p2 (chord i+1).
  function offbeatCandidates(key, p1, p2, difficulty) {
    const out = [];
    const iv = T.intervalBetween(p1, p2);
    const adv = difficulty >= 3;
    if (Math.abs(iv.d) === 2 && (Math.abs(iv.s) === 3 || Math.abs(iv.s) === 4)) {
      // passing tone filling a third with the diatonic note between
      out.push({ type: 'passing', pitch: diatonicStep(key, p1, Math.sign(iv.d)) });
    } else if (iv.d === 0 && iv.s === 0) {
      out.push({ type: 'upper neighbor', pitch: diatonicStep(key, p1, 1) });
      out.push({ type: 'lower neighbor', pitch: diatonicStep(key, p1, -1) });
      if (adv) out.push({ type: 'chromatic neighbor', pitch: chromaticHalf(p1, -1) });
    } else if (Math.abs(iv.d) === 1 && Math.abs(iv.s) <= 2 && adv) {
      // a plain step: prefer an anticipation — sound the next chord tone early
      // (approached by step, left by repetition); the échappée stays as a rare
      // alternative (assemble() weights anticipation far higher).
      out.push({ type: 'anticipation', pitch: { step: p2.step, alter: p2.alter, oct: p2.oct } });
      out.push({ type: 'escape', pitch: diatonicStep(key, p1, -Math.sign(iv.d)) });
    }
    return out.filter((c) => c.pitch.alter >= -2 && c.pitch.alter <= 2);
  }

  // On-beat (accented) figure occupying the START of chord i+1 (the first
  // eighth) in voice v, resolving to the chord tone p2 = block[i+1][v]. Both
  // options approach the dissonance by step / prepared common tone — never a
  // leap into the dissonance (no appoggiatura).
  //  - suspension: p1 (chord i) is held over (tied), then falls a step to p2
  //  - accented passing tone: p1 and p2 a third apart, the diatonic note
  //    between struck on the beat (stepwise in and out)
  function onbeatCandidates(key, p1, p2, difficulty) {
    const out = [];
    const iv = T.intervalBetween(p1, p2);
    if (iv.d === -1 && (iv.s === -1 || iv.s === -2)) {
      out.push({ type: 'suspension', pitch: p1, tie: true });
    }
    if (difficulty >= 3 && Math.abs(iv.d) === 2 && (Math.abs(iv.s) === 3 || Math.abs(iv.s) === 4)) {
      out.push({ type: 'accented passing', pitch: diatonicStep(key, p1, Math.sign(iv.d)), tie: false });
    }
    return out.filter((c) => c.pitch.alter >= -2 && c.pitch.alter <= 2);
  }

  // ---- texture grid + validation --------------------------------------------

  function buildVoice(block, chords, v, off, on) {
    const out = [];
    for (let i = 0; i < chords.length; i++) {
      const onb = on[v].get(i); // figure at the START of chord i
      const offb = off[v].get(i); // figure at the END of chord i
      const nextSus = on[v].get(i + 1); // tied suspension starting next chord?
      const head = block[i][v];
      const fig = figDur(chords[i].dur);
      let headDur = chords[i].dur;
      if (onb) {
        out.push(note(onb.pitch, fig, { tieEnd: !!onb.tie }));
        headDur -= fig;
      }
      // tie chord i's tail into a tied suspension on chord i+1 (same pitch)
      const tieTail = !offb && nextSus && nextSus.tie;
      if (offb) {
        out.push(note(head, headDur - fig));
        out.push(note(offb, fig));
      } else {
        out.push(note(head, headDur, { tieStart: tieTail }));
      }
    }
    return out;
  }

  function buildAll(block, chords, off, on) {
    return [0, 1, 2, 3].map((v) => buildVoice(block, chords, v, off, on));
  }

  const pc = (m) => ((m % 12) + 12) % 12;

  function activeChordIndex(tick, ctx) {
    for (let i = 0; i < ctx.starts.length; i++)
      if (tick >= ctx.starts[i] && tick < ctx.starts[i] + ctx.durs[i]) return i;
    return ctx.starts.length - 1;
  }

  // A sonority is dissonant when a non-chord tone forms a literal second
  // (one or two semitones) with another sounding voice.
  function dissonant(sonority, chordPcs) {
    for (let a = 0; a < 4; a++)
      for (let b = a + 1; b < 4; b++) {
        if (sonority[a] == null || sonority[b] == null) continue;
        const d = Math.abs(sonority[a] - sonority[b]);
        if (d !== 1 && d !== 2) continue;
        if (!chordPcs.has(pc(sonority[a])) || !chordPcs.has(pc(sonority[b]))) return true;
      }
    return false;
  }

  // Validate a tick window: (1) no parallel perfects, (2) no two consecutive
  // dissonant sonorities — a non-chord-tone clash must resolve to a consonance
  // before the next one — and (3) no cross relation: the same letter with two
  // different accidentals sounding at once (e.g. E natural against E flat),
  // which reads as one note with the accidental on only one voice and sounds
  // a half step off.
  function windowValid(voices, lo, hi, ctx) {
    const vo = voices.map((vl) => {
      const arr = [];
      let t = 0;
      for (const n of vl) {
        arr.push({ t, m: n.step < 0 ? null : T.midi(n), step: n.step, alter: n.alter });
        t += n.dur;
      }
      return arr;
    });
    const onsets = new Set();
    for (const arr of vo) for (const e of arr) if (e.t >= lo && e.t < hi) onsets.add(e.t);
    const ticks = [...onsets].sort((a, b) => a - b);
    if (!ticks.length) return true;
    const entryAt = (vi, tick) => {
      let cur = vo[vi][0];
      for (const e of vo[vi]) {
        if (e.t <= tick) cur = e;
        else break;
      }
      return cur;
    };
    const sonorityAt = (tick) => [0, 1, 2, 3].map((vi) => entryAt(vi, tick).m);
    // seed from the sonority just before the window so motion/dissonance INTO
    // the first in-window onset is checked too
    let prev = sonorityAt(ticks[0] - 1);
    let prevDiss = dissonant(prev, ctx.chordPcs[activeChordIndex(ticks[0] - 1, ctx)]);
    for (const tick of ticks) {
      const ents = [0, 1, 2, 3].map((vi) => entryAt(vi, tick));
      const chord = ents.map((e) => e.m);
      for (let a = 0; a < 4; a++)
        for (let b = a + 1; b < 4; b++) {
          if (chord[a] == null || chord[b] == null) continue;
          if (ents[a].step === ents[b].step && ents[a].alter !== ents[b].alter) return false; // cross relation
          if (prev[a] == null || prev[b] == null) continue;
          const before = ic(Math.max(prev[a], prev[b]), Math.min(prev[a], prev[b]));
          const after = ic(Math.max(chord[a], chord[b]), Math.min(chord[a], chord[b]));
          const moved = prev[a] !== chord[a] && prev[b] !== chord[b];
          if (moved && isPerfect(after) && before === after) return false;
        }
      const diss = dissonant(chord, ctx.chordPcs[activeChordIndex(tick, ctx)]);
      if (diss && prevDiss) return false; // two dissonant sonorities in a row
      prev = chord;
      prevDiss = diss;
    }
    return true;
  }

  // basic per-voice legality of a single inserted pitch against the held chord
  function pitchOK(pitch, neighbors, v, around) {
    const m = T.midi(pitch);
    if (m < RANGES[v][0] || m > RANGES[v][1]) return false;
    if (v > 0 && neighbors[v - 1] != null && m > neighbors[v - 1]) return false;
    if (v < 3 && neighbors[v + 1] != null && m < neighbors[v + 1]) return false;
    for (const p of around) if (isAugmented(p, pitch) === true) return false;
    return true;
  }

  // ---- assembly -------------------------------------------------------------

  function assemble(rng, key, chords, block, opts = {}) {
    const difficulty = Math.min(5, Math.max(1, opts.difficulty || 1));
    // difficulty 5 reuses the difficulty-4 figure vocabulary, just denser
    const candDiff = Math.min(4, difficulty);
    const n = chords.length;
    const off = [new Map(), new Map(), new Map(), new Map()];
    const on = [new Map(), new Map(), new Map(), new Map()];
    if (opts.embellish === false) return buildAll(block, chords, off, on);

    const starts = [];
    let acc = 0;
    for (const c of chords) {
      starts.push(acc);
      acc += c.dur;
    }
    const total = acc;
    const pBase = P_BASE[difficulty];
    const pOn = P_ONBEAT[difficulty];
    const diss = {
      starts,
      durs: chords.map((c) => c.dur),
      chordPcs: block.map((ch) => new Set(ch.map((p) => pc(T.midi(p))))),
    };
    const skip = opts.skipChords || new Set(); // phrase-end chords stay clean (held)

    // difficulty 5 sweeps twice and lets a couple of voices move per chord;
    // everything else makes a single, sparser pass. Neighbour figures are also
    // kept off adjacent beats so they don't cluster.
    const passes = difficulty >= 5 ? 2 : 1;
    const decayBase = difficulty >= 5 ? 0.7 : 0.62;
    const neighborChords = new Set();

    for (let pass = 0; pass < passes; pass++)
    for (let i = 0; i < n - 1; i++) {
      if (chords[i].dur < 2 * E) continue;
      if (skip.has(i)) continue; // don't embellish out of a held phrase ending
      let placed = 0;
      for (const v of DS.rng.shuffle(rng, [0, 1, 2, 3])) {
        if (rng() >= pBase * Math.pow(decayBase, placed)) continue;
        const held = block[i].map((p) => T.midi(p));
        const p1 = block[i][v];
        const p2 = block[i + 1][v];

        // choose off-beat vs on-beat; on-beat needs chord i+1 to have room and
        // to not already carry a figure (an off-beat there would collide on a
        // later pass, leaving a zero-length head). A suspension also holds
        // chord i's tail as its preparation, so chord i must not already carry
        // an off-beat figure of its own (that would orphan the tie).
        const wantOn =
          rng() < pOn && chords[i + 1].dur >= 2 * E &&
          !on[v].has(i + 1) && !off[v].has(i + 1) && !off[v].has(i) && !skip.has(i + 1);
        let chosen = null;
        let kind = 'off';
        if (wantOn) {
          // an on-beat figure sounds on chord i+1's downbeat, so spell it in
          // that chord's key (matters once a phrase has modulated)
          const cands = onbeatCandidates(chords[i + 1].key || key, p1, p2, candDiff).filter((c) =>
            // check both the approach (p1->figure) and resolution (figure->p2)
            pitchOK(c.pitch, block[i + 1].map((p) => T.midi(p)), v, [p1, p2])
          );
          if (cands.length) {
            chosen = DS.rng.pick(rng, cands);
            kind = 'on';
          }
        }
        if (!chosen) {
          // one figure per voice per chord — skip if this voice already carries
          // an on- or off-beat figure here (the latter matters across passes).
          // Also leave chord i's tail alone if chord i+1 holds a tied suspension
          // that uses it as preparation (an off-beat here would orphan the tie).
          if (on[v].has(i) || off[v].has(i)) continue;
          if (on[v].has(i + 1) && on[v].get(i + 1).tie) continue;
          // an off-beat figure sounds within chord i's span, so spell it in
          // that chord's key (matters once a phrase has modulated)
          let cands = offbeatCandidates(chords[i].key || key, p1, p2, candDiff).filter((c) =>
            pitchOK(c.pitch, held, v, [p1, p2])
          );
          if (!cands.length) continue;
          // neighbor tones (on a repeated note) are easy to overuse — never put
          // one right after this voice's previous figure (that produces a voice
          // just oscillating between two notes in eighths), and thin them out.
          // Difficulty 5 already packs the texture, so thin them harder there.
          if (cands.every((c) => /neighbor/.test(c.type))) {
            if (off[v].has(i - 1) || on[v].has(i - 1)) continue;
            // no two neighbours on adjacent beats (in any voice) — they cluster
            if (neighborChords.has(i - 1) || neighborChords.has(i + 1)) continue;
            // difficulty 5 is about suspensions and passing tones — neighbours
            // (which make a voice bounce between two notes) stay very rare
            if (rng() < (difficulty >= 5 ? 0.95 : 0.35)) continue;
          }
          // step motions: usually leave plain (anticipations are idiomatically
          // sparse, mostly cadential); when embellished, strongly prefer an
          // anticipation over the (leapy) échappée. Difficulty 5 skips most of
          // them — it expresses stepwise motion through suspensions instead.
          if (cands.every((c) => c.type === 'anticipation' || c.type === 'escape')) {
            if (rng() < (difficulty >= 5 ? 0.8 : 0.5)) continue;
            const ant = cands.filter((c) => c.type === 'anticipation');
            const esc = cands.filter((c) => c.type === 'escape');
            cands = ant.length && rng() < 0.85 ? ant : esc.length ? esc : cands;
          }
          chosen = DS.rng.pick(rng, cands);
          kind = 'off';
        }

        // tentatively place, validate, keep or revert. A single sparse pass only
        // needs to re-check the locally affected window; difficulty 5 makes
        // several dense passes whose figures can interact across those windows,
        // so it validates the whole texture each time (that is exactly what
        // "as many figures as stay clean" means).
        const full = difficulty >= 5;
        if (kind === 'on') {
          on[v].set(i + 1, chosen);
          const lo = full ? 0 : starts[i + 1] - E;
          const hi = full ? total : Math.min(total, starts[i + 1] + chords[i + 1].dur + 1);
          if (windowValid(buildAll(block, chords, off, on), lo, hi, diss)) placed++;
          else on[v].delete(i + 1);
        } else {
          off[v].set(i, chosen.pitch);
          const lo = full ? 0 : starts[i];
          const hi = full ? total : Math.min(total, starts[i] + chords[i].dur + chords[i + 1].dur + 1);
          if (windowValid(buildAll(block, chords, off, on), lo, hi, diss)) {
            placed++;
            if (/neighbor/.test(chosen.type)) neighborChords.add(i);
          } else off[v].delete(i);
        }
      }
    }

    const voices = deAlternate(buildAll(block, chords, off, on), diss, total);
    ensureBeatOnsets(voices, total);
    return voices;
  }

  // Keep a pulse: every beat needs someone striking a fresh note. If all the
  // voices that begin a note on the beat are tied into it (and none is struck),
  // break one tie — preferring the bass — so that voice re-articulates, even if
  // it just repeats its note. A beat held by genuinely long notes (a half-note
  // chord, no ties) is left alone.
  function ensureBeatOnsets(voices, total) {
    const startAt = voices.map((notes) => {
      const m = new Map();
      let t = 0;
      for (let i = 0; i < notes.length; i++) { m.set(t, i); t += notes[i].dur; }
      return m;
    });
    for (let bt = 0; bt < total; bt += 48) {
      let struck = false;
      const tied = [];
      for (let v = 0; v < 4; v++) {
        const idx = startAt[v].get(bt);
        if (idx == null) continue; // a long note spans the beat — no onset here
        const n = voices[v][idx];
        if (n.step < 0) continue;
        if (!n.tieEnd) { struck = true; break; }
        tied.push({ v, idx });
      }
      if (struck || !tied.length) continue;
      tied.sort((a, b) => b.v - a.v); // bass first, then tenor, alto, soprano
      const { v, idx } = tied[0];
      voices[v][idx].tieEnd = false;
      if (idx > 0) voices[v][idx - 1].tieStart = false;
    }
    return voices;
  }

  // Safety net: collapse any voice that ends up oscillating between two notes
  // (X Y X Y, in eighths or quarters) by holding the second X and dropping its
  // neighbour Y — but only when that Y is a non-chord tone (never throw away a
  // real harmony note). Each collapse is checked against the whole texture and
  // reverted if it would introduce a parallel or a clash.
  function deAlternate(voices, ctx, total) {
    for (const notes of voices) {
      const short = (n) => n.dur <= Q && n.step >= 0 && !n.tieStart && !n.tieEnd;
      let i = 0;
      let tick = 0;
      while (i + 3 < notes.length) {
        const osc =
          short(notes[i]) && short(notes[i + 1]) && short(notes[i + 2]) && short(notes[i + 3]) &&
          T.midi(notes[i]) === T.midi(notes[i + 2]) &&
          T.midi(notes[i + 1]) === T.midi(notes[i + 3]) &&
          T.midi(notes[i]) !== T.midi(notes[i + 1]);
        const t3 = tick + notes[i].dur + notes[i + 1].dur + notes[i + 2].dur;
        const dropOk =
          osc && (!ctx || !ctx.chordPcs[activeChordIndex(t3, ctx)].has(pc(T.midi(notes[i + 3]))));
        if (dropOk) {
          const removed = notes[i + 3];
          notes[i + 2].dur += removed.dur; // hold the second X, drop its neighbor
          notes.splice(i + 3, 1);
          if (ctx && !windowValid(voices, 0, total, ctx)) {
            notes.splice(i + 3, 0, removed); // revert: keep the oscillation
            notes[i + 2].dur -= removed.dur;
            tick += notes[i].dur;
            i++;
          }
        } else {
          tick += notes[i].dur;
          i++;
        }
      }
    }
    return voices;
  }

  // Split any note whose span crosses a barline into tied pieces, one per bar it
  // spans. abc.js renders ties but THROWS on a single note that overshoots a
  // barline; NCT figures and deAlternate merges near a mid-bar barline (which
  // flexible phrasing makes common) can produce such notes. Rests are split
  // without ties.
  function splitAtBarlines(voices, mlen) {
    return voices.map((notes) => {
      const out = [];
      let t = 0;
      for (const n of notes) {
        let start = t, remaining = n.dur, first = true;
        while (remaining > 0) {
          const barEnd = (Math.floor(start / mlen) + 1) * mlen;
          const seg = Math.min(remaining, barEnd - start);
          const last = seg === remaining;
          const piece = { ...n, dur: seg };
          if (n.step >= 0) {
            piece.tieEnd = first ? !!n.tieEnd : true;   // a split adds a tie into each later piece
            piece.tieStart = last ? !!n.tieStart : true; // ...and out of each earlier piece
          }
          if (!first) piece.fermata = false;            // the onset (and its fermata) stays on the first piece
          out.push(piece);
          start += seg; remaining -= seg; first = false;
        }
        t += n.dur;
      }
      return out;
    });
  }

  DS.nct = { assemble, offbeatCandidates, onbeatCandidates, splitAtBarlines };
})();
