// Excerpt model -> ABC notation string for abcjs rendering.
// Handles the engraving-level accidental logic: the key signature supplies
// defaults, an explicit accidental holds for the rest of the measure for
// that letter+octave, and barlines reset the state.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});
  const T = DS.theory;

  const MAJOR_OF_SIG = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
  const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];

  function sigMapOf(sig) {
    const map = {};
    if (sig > 0) for (let i = 0; i < sig; i++) map[SHARP_ORDER[i]] = 1;
    if (sig < 0) for (let i = 0; i < -sig; i++) map[FLAT_ORDER[i]] = -1;
    return map;
  }

  function pitchStr(note) {
    const letter = LETTERS[note.step];
    if (note.oct >= 5) return letter.toLowerCase() + "'".repeat(note.oct - 5);
    return letter + ','.repeat(4 - note.oct);
  }

  const ACC = { '-2': '__', '-1': '_', 0: '=', 1: '^', 2: '^^' };

  // Split one voice into measure token-strings. Returns {measures, counts}
  // where counts[i] = number of sounding tokens in measure i (for lyrics).
  function measuresOf(notes, ctx, showFermata = true) {
    const measures = [];
    const counts = [];
    const noteTicks = []; // per-measure start ticks of each sounding token
    let cur = '';
    let count = 0;
    let curTicks = [];
    let tick = 0;
    let nextBar = ctx.upbeat || ctx.mlen;
    let acc = new Map();
    const gridOffset = ctx.upbeat ? ctx.mlen - ctx.upbeat : 0;

    for (const n of notes) {
      if (tick === nextBar) {
        measures.push(cur);
        counts.push(count);
        noteTicks.push(curTicks);
        cur = '';
        count = 0;
        curTicks = [];
        nextBar += ctx.mlen;
        acc = new Map();
      } else if (tick > nextBar) {
        throw new Error(`note crosses barline at tick ${tick}`);
      } else if (cur !== '' && (tick + gridOffset) % ctx.beat === 0) {
        cur += ' ';
      }
      let tok = '';
      if (n.fermata && showFermata) tok += '!fermata!';
      if (n.step < 0) {
        tok += 'z';
      } else {
        const key = `${n.step}:${n.oct}`;
        const current = acc.has(key) ? acc.get(key) : ctx.sigMap[n.step] || 0;
        if (n.alter !== current) {
          tok += ACC[n.alter];
          acc.set(key, n.alter);
        }
        tok += pitchStr(n);
      }
      const units = n.dur / 6;
      if (units !== 1) tok += units;
      if (n.tieStart) tok += '-';
      cur += tok;
      curTicks.push({ tick, rest: n.step < 0 });
      count++;
      tick += n.dur;
    }
    measures.push(cur);
    counts.push(count);
    noteTicks.push(curTicks);
    return { measures, counts, noteTicks };
  }

  function systemsOf(measures, barsPerSystem) {
    const out = [];
    for (let i = 0; i < measures.length; i += barsPerSystem)
      out.push(measures.slice(i, i + barsPerSystem));
    return out;
  }

  function joinSystem(system, isLast) {
    return system.join(' | ') + (isLast ? ' |]' : ' |');
  }

  function fromExcerpt(excerpt, opts = {}) {
    const sig = excerpt.sig != null ? excerpt.sig : T.fifths(excerpt.key);
    const ctx = {
      mlen: excerpt.mlen,
      upbeat: excerpt.upbeat || 0,
      beat: excerpt.den === 2 ? 96 : 48,
      sigMap: sigMapOf(sig),
    };
    const barsPerSystem = excerpt.num === 3 && excerpt.den === 4 ? 5 : 4;
    const head = [`X:1`, `M:${excerpt.num}/${excerpt.den}`, `L:1/32`];

    if (excerpt.voices.length === 1) {
      const notes = excerpt.voices[0];
      const sounding = notes.filter((n) => n.step >= 0);
      const mean =
        sounding.reduce((s, n) => s + T.midi(n), 0) / Math.max(1, sounding.length);
      const clef = mean < 57 ? ' clef=bass' : '';
      const { measures } = measuresOf(notes, ctx);
      const systems = systemsOf(measures, barsPerSystem);
      const body = systems.map((sys, i) => joinSystem(sys, i === systems.length - 1));
      return head.concat([`K:${MAJOR_OF_SIG[sig + 7]}${clef}`], body).join('\n') + '\n';
    }

    // SATB grand staff
    const names = ['S', 'A', 'T', 'B'];
    const defs = [
      'V:S clef=treble stem=up',
      'V:A clef=treble stem=down',
      'V:T clef=bass stem=up',
      'V:B clef=bass stem=down',
    ];
    // one fermata per staff: soprano (top of the treble staff) and tenor
    // (top of the bass staff); alto/bass repeat the same held chord silently
    const per = excerpt.voices.map((v, vi) => measuresOf(v, ctx, vi === 0 || vi === 2));
    const nMeasures = per[0].measures.length;
    const systems = [];
    for (let i = 0; i < nMeasures; i += barsPerSystem) systems.push([i, Math.min(i + barsPerSystem, nMeasures)]);

    const showRomans = opts.showRomans !== false && excerpt.romans && excerpt.romans.length;
    // Roman numerals sit under the bass aligned by tick: a bass note that
    // begins a chord gets its label, a bass passing tone gets a skip syllable.
    const romanByTick = new Map((excerpt.romans || []).map((r) => [r.tick, r.label]));
    const lines = [];
    systems.forEach(([a, b], si) => {
      const isLast = si === systems.length - 1;
      names.forEach((name, vi) => {
        lines.push(`[V:${name}] ` + joinSystem(per[vi].measures.slice(a, b), isLast));
        if (name === 'B' && showRomans) {
          const labels = [];
          for (let m = a; m < b; m++)
            for (const t of per[3].noteTicks[m])
              labels.push(t.rest ? '' : romanByTick.has(t.tick) ? romanByTick.get(t.tick) : '*');
          lines.push('w: ' + labels.join(' '));
        }
      });
    });
    return head
      .concat(['%%score {(S A) | (T B)}'], defs, [`K:${MAJOR_OF_SIG[sig + 7]}`], lines)
      .join('\n') + '\n';
  }

  DS.abc = { fromExcerpt };
})();
