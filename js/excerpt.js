// Builds the unified excerpt model from either source:
//   fromBach      — slice a phrase window out of a real chorale, optionally
//                   transposed within range- and key-signature-safe bounds
//   fromGenerated — progression+voicing (harmonic) or melody (melodic)
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});
  const T = DS.theory;

  const PHRASES_OF_LENGTH = { short: 1, medium: 2, long: 3 };
  const HARMONIC_BARS = { short: 2, medium: 3, long: 4 };
  const BARS_OF_LENGTH = { short: 2, medium: 4, long: 6 };

  function decode([step, alter, oct, dur, flags]) {
    return {
      step, alter, oct, dur,
      tieStart: !!(flags & 1),
      tieEnd: !!(flags & 2),
      fermata: !!(flags & 4),
    };
  }

  function windowsFor(ch, phraseCount) {
    const out = [];
    for (let i = 0; i + phraseCount <= ch.phrases.length; i++) {
      const s = ch.phrases[i][0];
      const e = ch.phrases[i + phraseCount - 1][1];
      const diffs = ch.phrases.slice(i, i + phraseCount).map((p) => p[2]);
      out.push({ s, e, idx: i, diff: Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) });
    }
    return out;
  }

  function sliceVoices(ch, s, e) {
    return ch.v.map((v) => {
      const notes = [];
      let tick = 0;
      for (const tup of v) {
        const n = decode(tup);
        if (tick >= s && tick + n.dur <= e) notes.push(n);
        tick += n.dur;
      }
      if (notes.length) {
        notes[0].tieEnd = false;
        notes[notes.length - 1].tieStart = false;
      }
      return notes;
    });
  }

  function rangeOf(voices) {
    let lo = 999;
    let hi = -999;
    for (const v of voices) {
      for (const n of v) {
        if (n.step < 0) continue;
        const m = T.midi(n);
        if (m < lo) lo = m;
        if (m > hi) hi = m;
      }
    }
    return [lo, hi];
  }

  function allowedShifts(key, sig, voices) {
    const [lo, hi] = rangeOf(voices);
    const out = [];
    for (let s = -6; s <= 6; s++) {
      if (s === 0) {
        out.push({ s: 0, iv: null });
        continue;
      }
      if (lo + s < 38 || hi + s > 81) continue;
      const iv = T.bestIntervalForShift(key, s);
      const newKey = T.transposeKey(key, iv);
      const dF = T.fifths(newKey) - T.fifths(key);
      if (Math.abs(T.fifths(newKey)) > 6) continue;
      if (Math.abs(sig + dF) > 6) continue;
      out.push({ s, iv });
    }
    return out;
  }

  function fromBach(rng, settings) {
    const data = window.DS_CHORALES;
    let ch;
    let span;
    let shift = 0;

    if (settings.fixed) {
      ch = data.list.find((c) => c.id === settings.fixed.choraleId);
      if (!ch) return null;
      span = { s: settings.fixed.s, e: settings.fixed.e, idx: -1 };
      shift = settings.fixed.shift || 0;
    } else {
      const phraseCount = PHRASES_OF_LENGTH[settings.length || 'short'] || 1;
      const wantDiff = Math.max(0, Math.min(2, (settings.difficulty || 1) - 1));
      const meterOk = (c) => {
        if (!settings.meter || settings.meter === 'any') return true;
        const [n, d] = settings.meter.split('/').map(Number);
        return c.num === n && c.den === d;
      };
      const modeOk = (c) =>
        !settings.keyMode || settings.keyMode === 'any' || c.mode === settings.keyMode;

      let pool = [];
      for (let widen = 0; widen <= 2 && !pool.length; widen++) {
        for (const c of data.list) {
          if (!modeOk(c) || !meterOk(c)) continue;
          for (const w of windowsFor(c, phraseCount)) {
            if (Math.abs(w.diff - wantDiff) <= widen) pool.push({ c, w });
          }
        }
      }
      if (!pool.length) return null;
      // Down-weight excerpts that open at the very start of a chorale and
      // gently favor deeper starts, so a multi-phrase excerpt isn't usually
      // the chorale's opening — the corpus has plenty of interior phrases.
      const pick = DS.rng.weighted(
        rng,
        pool.map((e) => [e, Math.min(2.2, 0.5 + 0.2 * e.w.idx)])
      );
      ch = pick.c;
      span = pick.w;
    }

    const key = { tonic: T.parseName(ch.key), mode: ch.mode };
    const mlen = (ch.num * 192) / ch.den;
    let voices = sliceVoices(ch, span.s, span.e);
    if (settings.mode === 'melodic')
      voices = [voices[settings.melodicVoice === 'bass' ? 3 : 0]];

    if (!settings.fixed && settings.transpose) {
      const options = allowedShifts(key, ch.sig, voices);
      shift = DS.rng.weighted(rng, options.map((o) => [o.s, o.s === 0 ? 0.7 : 1]));
    }

    let outKey = key;
    let sig = ch.sig;
    if (shift !== 0) {
      const iv = T.bestIntervalForShift(key, shift);
      outKey = T.transposeKey(key, iv);
      sig = ch.sig + (T.fifths(outKey) - T.fifths(key));
      voices = voices.map((v) =>
        v.map((n) => (n.step < 0 ? n : { ...n, ...T.transposeNote(n, iv) }))
      );
    }

    const phase = (((span.s - ch.pickup) % mlen) + mlen) % mlen;
    const upbeat = phase === 0 ? 0 : mlen - phase;

    return {
      kind: settings.mode || 'harmonic',
      source: 'bach',
      key: outKey,
      sig,
      num: ch.num,
      den: ch.den,
      mlen,
      upbeat,
      tpq: 48,
      voices,
      romans: null,
      meta: {
        choraleId: ch.id,
        bwv: ch.bwv,
        title: ch.title,
        modal: ch.modal || null,
        originalKey: ch.key,
        originalMode: ch.mode,
        span: [span.s, span.e],
        phraseIdx: span.idx,
        shift,
        melodicVoice: settings.mode === 'melodic' ? settings.melodicVoice || 'soprano' : null,
      },
    };
  }

  function randomKey(rng, settings) {
    if (settings.keyMode === 'fixed' && settings.fixedKey) {
      const [name, mode] = settings.fixedKey.split(' ');
      return { tonic: T.parseName(name), mode };
    }
    const mode =
      settings.keyMode === 'major' || settings.keyMode === 'minor'
        ? settings.keyMode
        : DS.rng.pick(rng, ['major', 'minor']);
    const tonics = [];
    for (let step = 0; step < 7; step++) {
      for (let alter = -1; alter <= 1; alter++) {
        const key = { tonic: { step, alter }, mode };
        if (Math.abs(T.fifths(key)) <= 6) tonics.push(key.tonic);
      }
    }
    return { tonic: DS.rng.pick(rng, tonics), mode };
  }

  function fromGenerated(rng, settings) {
    const key = randomKey(rng, settings);
    const sig = T.fifths(key);

    if (settings.mode === 'harmonic') {
      const bars = HARMONIC_BARS[settings.length || 'medium'] || 3;
      let chords = null;
      let voicesByChord = null;
      for (let attempt = 0; attempt < 10 && !voicesByChord; attempt++) {
        chords = DS.progression.generate(rng, {
          difficulty: settings.difficulty || 1,
          mode: key.mode,
          bars,
        });
        voicesByChord = DS.voicing.harmonize(rng, key, chords);
      }
      if (!voicesByChord) return null;

      const voices = DS.nct.assemble(rng, key, chords, voicesByChord, {
        difficulty: settings.difficulty || 1,
        embellish: settings.embellish,
      });
      const romans = [];
      let tick = 0;
      for (const c of chords) {
        romans.push({ label: DS.progression.display(c.sym), tick });
        tick += c.dur;
      }
      return {
        kind: 'harmonic',
        source: 'generated',
        key,
        sig,
        num: 4,
        den: 4,
        mlen: 192,
        upbeat: 0,
        tpq: 48,
        voices,
        romans,
        meta: {
          seedUsed: settings.seed != null ? settings.seed : null,
          difficulty: settings.difficulty || 1,
          length: settings.length || 'medium',
          cadence: chords.cadence || null,
        },
      };
    }

    // melodic
    const meter =
      settings.meter && settings.meter !== 'any'
        ? settings.meter
        : DS.rng.pick(rng, ['4/4', '4/4', '3/4']);
    const [num, den] = meter.split('/').map(Number);
    const bars = BARS_OF_LENGTH[settings.length || 'medium'] || 4;
    const m = DS.melody.generate(rng, {
      difficulty: settings.difficulty || 1,
      key,
      bars,
      num,
      den,
      pickup: !!settings.pickup,
    });
    const voices = [
      m.notes.map((n) => ({ ...n, tieStart: false, tieEnd: false, fermata: false })),
    ];
    return {
      kind: 'melodic',
      source: 'generated',
      key,
      sig,
      num,
      den,
      mlen: (num * 192) / den,
      upbeat: m.upbeat,
      tpq: 48,
      voices,
      romans: null,
      meta: {
        seedUsed: settings.seed != null ? settings.seed : null,
        difficulty: settings.difficulty || 1,
        length: settings.length || 'medium',
        meter,
      },
    };
  }

  DS.excerpt = { fromBach, fromGenerated };
})();
