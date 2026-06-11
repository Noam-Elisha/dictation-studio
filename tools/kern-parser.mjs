// Parser for the **kern files in craigsapp/bach-370-chorales.
// Handles the subset of Humdrum **kern that corpus uses; anything outside it
// throws KernError so the build script can reject the chorale.
//
// Output pitches use the app convention: {step 0..6 = C..B, alter, oct}
// (rests use step -1), durations in ticks (48 per quarter), flags bitmask
// 1 = tieStart, 2 = tieEnd, 4 = fermata. Voices ordered S, A, T, B.

export class KernError extends Error {}

const TPW = 192; // ticks per whole note
const STEP_OF_LETTER = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };

function parseToken(raw, tick) {
  if (/[qQ]/.test(raw)) throw new KernError(`grace note: ${raw}`);
  if (raw.includes(' ')) throw new KernError(`multiple notes in one token: ${raw}`);

  const durMatch = raw.match(/(\d+)(\.*)/);
  if (!durMatch) throw new KernError(`no duration: ${raw}`);
  const base = TPW / Number(durMatch[1]);
  if (!Number.isInteger(base)) throw new KernError(`non-integer duration: ${raw}`);
  let dur = base;
  for (let i = 0; i < durMatch[2].length; i++) {
    const add = base / Math.pow(2, i + 1);
    if (!Number.isInteger(add)) throw new KernError(`non-integer dotted duration: ${raw}`);
    dur += add;
  }

  let flags = 0;
  if (raw.includes('[')) flags |= 1;
  if (raw.includes(']')) flags |= 2;
  if (raw.includes('_')) flags |= 1 | 2; // tie continuation
  if (raw.includes(';')) flags |= 4;

  if (raw.includes('r')) return { step: -1, alter: 0, oct: 0, dur, tick, flags };

  const pitchMatch = raw.match(/([a-g]+|[A-G]+)(##|#|--|-|n)?/);
  if (!pitchMatch) throw new KernError(`no pitch: ${raw}`);
  const letters = pitchMatch[1];
  if (!letters.split('').every((ch) => ch === letters[0]))
    throw new KernError(`mixed pitch letters: ${raw}`);
  const lower = letters[0] === letters[0].toLowerCase();
  const step = STEP_OF_LETTER[letters[0].toLowerCase()];
  const oct = lower ? 3 + letters.length : 4 - letters.length;
  const accStr = pitchMatch[2] || '';
  const alter = accStr === 'n' ? 0 : accStr.startsWith('#') ? accStr.length : -accStr.length;

  return { step, alter, oct, dur, tick, flags };
}

export function parseKern(text, id) {
  const lines = text.split(/\r?\n/);

  const meta = { titleEN: null, titleDE: null, title: null, bwv: null };
  let key = null;
  let modal = null;
  let sigFifths = null;
  let num = null;
  let den = null;
  let spineLabels = null;
  let started = false;
  let done = false;

  const spines = [[], [], [], []]; // raw note lists per column
  const ticks = [0, 0, 0, 0]; // running tick per column
  const segStart = [0, 0, 0, 0]; // tick at the start of the current measure

  function closeSegment(where) {
    const sums = ticks.map((t, i) => t - segStart[i]);
    if (!sums.every((s) => s === sums[0]))
      throw new KernError(`voice durations disagree at ${where}: ${sums.join(',')}`);
    for (let i = 0; i < 4; i++) segStart[i] = ticks[i];
    return sums[0];
  }

  let pickup = null;
  let firstSegment = true;

  for (const line of lines) {
    if (done || line === '') continue;

    if (line.startsWith('!!')) {
      const m = line.match(/^!!!([^:]+):\s*(.*)$/);
      if (!m) continue;
      const [, k, v] = m;
      if (k === 'OTL@EN') meta.titleEN = v;
      else if (k === 'OTL@@DE') meta.titleDE = v;
      else if (k === 'OTL') meta.title = v;
      else if (k === 'SCT') meta.bwv = (v.match(/BWV\s*(\S+)/) || [, v])[1];
      continue;
    }
    if (line.startsWith('!')) continue; // local comment row

    const cols = line.split('\t');

    if (line.startsWith('*')) {
      for (const tok of cols) {
        if (tok === '*^' || tok === '*+' || tok === '*x' || tok === '*v')
          throw new KernError(`spine manipulator ${tok}`);
      }
      const first = cols[0];
      if (first === '*-') {
        done = true;
        continue;
      }
      const mMeter = first.match(/^\*M(\d+)\/(\d+)$/);
      if (mMeter) {
        const [n2, d2] = [Number(mMeter[1]), Number(mMeter[2])];
        if (num !== null && (n2 !== num || d2 !== den) && started)
          throw new KernError('mid-piece meter change');
        num = n2;
        den = d2;
        continue;
      }
      const mKey = first.match(/^\*([a-gA-G])([#-]*):([a-z]*)$/);
      if (mKey) {
        const letter = mKey[1];
        const alter = mKey[2] === '#' ? 1 : mKey[2] === '-' ? -1 : 0;
        const m2 = mKey[3] || null; // dor, phr, mix, lyd, ...
        const MODAL_MODE = { dor: 'minor', phr: 'minor', aeo: 'minor', mix: 'major', lyd: 'major', ion: 'major' };
        const k2 = {
          tonic: { step: STEP_OF_LETTER[letter.toLowerCase()], alter },
          mode: m2
            ? MODAL_MODE[m2] || (letter === letter.toLowerCase() ? 'minor' : 'major')
            : letter === letter.toLowerCase()
              ? 'minor'
              : 'major',
        };
        if (key && started && JSON.stringify(k2) !== JSON.stringify(key))
          throw new KernError('mid-piece key change');
        key = k2;
        modal = m2;
        continue;
      }
      const mSig = first.match(/^\*k\[([a-g#\-]*)\]$/);
      if (mSig) {
        const accs = mSig[1].match(/[a-g][#-]/g) || [];
        const f2 = accs.length === 0 ? 0 : accs[0].endsWith('#') ? accs.length : -accs.length;
        if (sigFifths !== null && f2 !== sigFifths && started)
          throw new KernError('mid-piece key signature change');
        sigFifths = f2;
        continue;
      }
      if (first.startsWith('*I') && !first.startsWith('*IC') && !first.startsWith('*I"')) {
        spineLabels = cols.map((c) => c.replace('*I', ''));
      }
      continue;
    }

    if (line.startsWith('=')) {
      if (!started) continue; // opening barline before any notes
      const seg = closeSegment(line.split('\t')[0]);
      if (firstSegment) {
        const mlen = (num * TPW) / den;
        if (seg > mlen) throw new KernError(`opening segment longer than a measure (${seg})`);
        pickup = seg === mlen ? 0 : seg;
        firstSegment = false;
      }
      continue;
    }

    // data row
    if (cols.length !== 4) throw new KernError(`expected 4 spines, got ${cols.length}`);
    if (num === null || key === null) throw new KernError('data before key/meter');
    started = true;
    for (let i = 0; i < 4; i++) {
      const tok = cols[i];
      if (tok === '.') continue;
      const note = parseToken(tok, ticks[i]);
      spines[i].push(note);
      ticks[i] += note.dur;
    }
  }

  if (!started) throw new KernError('no notes');
  const finalSeg = closeSegment('end');
  if (firstSegment) pickup = 0; // no barlines at all (single measure piece)
  void finalSeg;

  const total = ticks[0];
  if (!ticks.every((t) => t === total)) throw new KernError('total voice durations differ');

  // Map spine columns (file order, typically bass..soprano) to S,A,T,B.
  let order;
  if (spineLabels) {
    const want = ['soprn', 'alto', 'tenor', 'bass'];
    order = want.map((w) => spineLabels.findIndex((l) => l.toLowerCase().startsWith(w)));
    if (order.some((i) => i < 0)) throw new KernError(`unrecognized voice labels: ${spineLabels}`);
  } else {
    order = [3, 2, 1, 0];
  }
  const voices = order.map((i) => spines[i]);

  const mlen = (num * TPW) / den;
  return {
    id,
    bwv: meta.bwv,
    title: meta.titleEN || meta.title || meta.titleDE || id,
    key,
    modal,
    sigFifths: sigFifths === null ? null : sigFifths,
    num,
    den,
    mlen,
    pickup: pickup ?? 0,
    total,
    voices,
  };
}
