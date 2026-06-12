// Harmonic analysis — compares chord-progression statistics of the Bach chorale
// corpus against the rule-based generator (chord vocabulary, transitions, root
// motion, cadences, chromatic usage).
//   Run:  node tools/analysis/bach-vs-generator.mjs
//   Spot-check the chord identifier on one chorale:  DBG=<index> node tools/analysis/bach-vs-generator.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadDS } from '../test/harness.mjs';

const DS = loadDS(['js/rng.js', 'js/theory.js', 'js/progression.js', 'js/voicing.js']);
const T = DS.theory;
const sb = {}; sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(readFileSync('js/data/chorales-data.js', 'utf8'), sb);
const CH = sb.DS_CHORALES;

const pc = (step, alter) => (((T.midi({ step, alter, oct: 0 }) % 12) + 12) % 12);

// diatonic pitch classes of a key: major scale, or natural minor + raised 7
function diatonic(key) {
  const sc = T.scale(key).map((p) => pc(p.step, p.alter));
  const set = new Set(sc);
  if (key.mode === 'minor') set.add((sc[6] + 1) % 12); // leading tone
  return { byDegree: sc, set };
}

const TEMPLATES = [
  [[0, 4, 7], 'maj'], [[0, 3, 7], 'min'], [[0, 3, 6], 'dim'], [[0, 4, 8], 'aug'],
  [[0, 4, 7, 10], 'dom7'], [[0, 3, 7, 10], 'min7'], [[0, 3, 6, 10], 'hdim7'],
  [[0, 3, 6, 9], 'dim7'], [[0, 4, 7, 11], 'maj7'],
];

function identify(pcs, bass) {
  const S = new Set(pcs);
  let best = null;
  for (let r = 0; r < 12; r++) for (const [ivs, q] of TEMPLATES) {
    const Tt = new Set(ivs.map((i) => (r + i) % 12));
    let matched = 0; for (const p of S) if (Tt.has(p)) matched++;
    let missing = 0; for (const p of Tt) if (!S.has(p)) missing++;
    let score = matched - 0.6 * (S.size - matched) - 0.25 * missing - 0.05 * ivs.length;
    if (bass === r) score += 0.4; else if (Tt.has(bass)) score += 0.1;
    if (!best || score > best.score) best = { root: r, q, set: Tt, score };
  }
  return best;
}

// label a chord by root scale-degree (1..7) or 'chr' if any sounding chord tone
// is non-diatonic
function label(chord, dia, soundingPcs) {
  const tones = [...chord.set].filter((p) => soundingPcs.has(p));
  if (tones.some((p) => !dia.set.has(p))) return 'chr';
  const deg = dia.byDegree.indexOf(chord.root);
  return deg >= 0 ? String(deg + 1) : 'chr';
}

// ---- analyse the Bach corpus ----
function analyzeBach() {
  const freq = {}, bigram = {}, rootMove = {}, cad = {}, secDom = {};
  let total = 0;
  for (const c of CH.list) {
    const key = { tonic: T.parseName(c.key), mode: c.mode };
    const dia = diatonic(key);
    // per-voice [ {start, n} ]
    const tl = c.v.map((voice) => { const a = []; let t = 0; for (const n of voice) { a.push({ s: t, e: t + n[3], n }); t += n[3]; } return a; });
    const noteAt = (vi, tick) => { for (const x of tl[vi]) if (tick >= x.s && tick < x.e) return x.n; return null; };
    const seq = [];
    for (let tick = 0; tick < c.total; tick += CH.tpq) {
      const notes = [0, 1, 2, 3].map((vi) => noteAt(vi, tick)).filter((n) => n && n[0] >= 0);
      if (notes.length < 3) continue;
      const pcs = notes.map((n) => pc(n[0], n[1]));
      const bassN = noteAt(3, tick);
      const bass = bassN && bassN[0] >= 0 ? pc(bassN[0], bassN[1]) : pcs[pcs.length - 1];
      const ch = identify(pcs, bass);
      const lab = label(ch, dia, new Set(pcs));
      const fermata = notes.some((n) => (n[4] & 4) !== 0);
      const prev = seq[seq.length - 1];
      if (!prev || prev.lab !== lab || prev.root !== ch.root) seq.push({ lab, root: ch.root, fermata, q: ch.q });
      else if (fermata) prev.fermata = true;
    }
    // secondary-dominant detection: a chromatic major/dom chord resolving down a 5th
    for (let i = 0; i < seq.length - 1; i++) {
      if (seq[i].lab === 'chr' && (seq[i].q === 'maj' || seq[i].q === 'dom7')
        && seq[i + 1].root === (seq[i].root + 5) % 12) {
        const tgt = dia.byDegree.indexOf(seq[i + 1].root);
        secDom[tgt >= 0 ? 'V/' + (tgt + 1) : 'V/chr'] = (secDom[tgt >= 0 ? 'V/' + (tgt + 1) : 'V/chr'] || 0) + 1;
      }
    }
    // tabulate
    for (let i = 0; i < seq.length; i++) {
      freq[seq[i].lab] = (freq[seq[i].lab] || 0) + 1; total++;
      if (i > 0) {
        const k = seq[i - 1].lab + '->' + seq[i].lab;
        bigram[k] = (bigram[k] || 0) + 1;
        const mv = ((seq[i].root - seq[i - 1].root) % 12 + 12) % 12;
        rootMove[mv] = (rootMove[mv] || 0) + 1;
      }
      if (seq[i].fermata && i > 0) { const k = seq[i - 1].lab + '->' + seq[i].lab; cad[k] = (cad[k] || 0) + 1; }
    }
  }
  return { freq, bigram, rootMove, cad, total, secDom };
}

// ---- analyse generator output (map syms -> degree/chr) ----
const SYM_DEG = {
  I: 1, I6: 1, I64c: 1, i: 1, i6: 1, i64c: 1,
  ii: 2, ii6: 2, ii65: 2, iio6: 2, 'iiø65': 2,
  iii: 3, III: 3, vi: 6, VI: 6, viio6: 7, viio7: 7, VII: 7,
  IV: 4, IV6: 4, iv: 4, iv6: 4,
  V: 5, V6: 5, V7: 5, V65: 5, V43: 5, V42: 5,
};
function genLabel(sym, mode) {
  if (sym.includes('/') || ['bVI', 'bVII', 'N6', 'It6', 'Fr43', 'Ger65'].includes(sym)) return 'chr';
  if (mode === 'major' && (sym === 'iv' || sym === 'iv6')) return 'chr'; // borrowed iv
  return String(SYM_DEG[sym] || '?');
}
function analyzeGen() {
  const freq = {}, bigram = {}, rootMove = {}, cad = {}, chrSym = {};
  let total = 0;
  const degPc = (key, deg) => pc(T.degreeNote(key, deg, 0).step, T.degreeNote(key, deg, 0).alter);
  for (let difficulty = 2; difficulty <= 4; difficulty++) {
    for (let seed = 0; seed < 1500; seed++) {
      const mode = seed % 2 ? 'major' : 'minor';
      const key = { tonic: mode === 'major' ? { step: 0, alter: 0 } : { step: 5, alter: 0 }, mode };
      const chords = DS.progression.generatePhrases(DS.rng.create(seed * 7 + difficulty * 13), { difficulty, mode, phrases: 2 });
      const ends = new Set(chords.phraseEnds);
      for (const c of chords) if (genLabel(c.sym, mode) === 'chr') chrSym[c.sym] = (chrSym[c.sym] || 0) + 1;
      const raw = chords.map((c, i) => ({ lab: genLabel(c.sym, mode), root: rootPc(key, c), fermata: ends.has(i) }));
      const seq = []; // collapse repeats, same as the Bach pass
      for (const x of raw) { const p = seq[seq.length - 1]; if (!p || p.lab !== x.lab || p.root !== x.root) seq.push(x); else if (x.fermata) p.fermata = true; }
      for (let i = 0; i < seq.length; i++) {
        freq[seq[i].lab] = (freq[seq[i].lab] || 0) + 1; total++;
        if (i > 0) {
          bigram[seq[i - 1].lab + '->' + seq[i].lab] = (bigram[seq[i - 1].lab + '->' + seq[i].lab] || 0) + 1;
          const mv = ((seq[i].root - seq[i - 1].root) % 12 + 12) % 12;
          rootMove[mv] = (rootMove[mv] || 0) + 1;
        }
        if (seq[i].fermata && i > 0) { const k = seq[i - 1].lab + '->' + seq[i].lab; cad[k] = (cad[k] || 0) + 1; }
      }
    }
  }
  return { freq, bigram, rootMove, cad, total, chrSym };
}
function rootPc(key, c) {
  const t = c.tones[0]; return pc(T.degreeNote(key, t[0], t[1]).step, T.degreeNote(key, t[0], t[1]).alter);
}

// ---- validation: dump one chorale's identified chords with note names ----
if (process.env.DBG) {
  const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const QSYM = { maj: '', min: 'm', dim: '°', aug: '+', dom7: '7', min7: 'm7', hdim7: 'ø7', dim7: '°7', maj7: 'M7' };
  const idx = Number(process.env.DBG);
  const c = CH.list[idx];
  const key = { tonic: T.parseName(c.key), mode: c.mode };
  const dia = diatonic(key);
  console.log(`\n${c.id} BWV ${c.bwv} "${c.title}" — ${c.key} ${c.mode}`);
  const tl = c.v.map((voice) => { const a = []; let t = 0; for (const n of voice) { a.push({ s: t, e: t + n[3], n }); t += n[3]; } return a; });
  const noteAt = (vi, tick) => { for (const x of tl[vi]) if (tick >= x.s && tick < x.e) return x.n; return null; };
  const out = [];
  let prev = null;
  for (let tick = 0; tick < c.total; tick += CH.tpq) {
    const notes = [0, 1, 2, 3].map((vi) => noteAt(vi, tick)).filter((n) => n && n[0] >= 0);
    if (notes.length < 3) continue;
    const pcs = notes.map((n) => pc(n[0], n[1]));
    const bassN = noteAt(3, tick);
    const bass = bassN && bassN[0] >= 0 ? pc(bassN[0], bassN[1]) : pcs[pcs.length - 1];
    const ch = identify(pcs, bass);
    const lab = label(ch, dia, new Set(pcs));
    const ferm = notes.some((n) => (n[4] & 4) !== 0);
    const txt = NAMES[ch.root] + QSYM[ch.q] + '(' + lab + ')' + (ferm ? '𝄐' : '');
    if (txt !== prev) out.push(txt);
    prev = txt;
  }
  console.log(out.join('  '));
  process.exit(0);
}

const bach = analyzeBach();
const gen = analyzeGen();

function pctTable(label, ...sources) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', 'chr'];
  console.log('\n=== ' + label + ' (root scale-degree, % of chords) ===');
  console.log('deg   ' + sources.map((s) => s.name.padStart(8)).join(''));
  for (const k of keys) {
    const row = sources.map((s) => ((100 * (s.d.freq[k] || 0) / s.d.total).toFixed(1) + '%').padStart(8)).join('');
    console.log(('°' + k).padEnd(6) + row);
  }
}
pctTable('CHORD VOCABULARY', { name: 'Bach', d: bach }, { name: 'Generator', d: gen });

function topBigrams(d, n) {
  return Object.entries(d.bigram).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${k} ${(100 * v / (d.total - 0)).toFixed(1)}%`);
}
console.log('\n=== TOP TRANSITIONS — Bach ==='); console.log(topBigrams(bach, 14).join('\n'));
console.log('\n=== TOP TRANSITIONS — Generator ==='); console.log(topBigrams(gen, 14).join('\n'));

function rootMotionPct(d) {
  const tot = Object.values(d.rootMove).reduce((a, b) => a + b, 0);
  const g = (semis) => (100 * (d.rootMove[semis] || 0) / tot).toFixed(1) + '%';
  return { down5th: g(5), up5th: g(7), step_up: g(2), step_down: g(10), third_down: g(8), third_up: g(4), semitone: ((100 * ((d.rootMove[1] || 0) + (d.rootMove[11] || 0)) / tot)).toFixed(1) + '%', same: g(0) };
}
console.log('\n=== ROOT MOTION ===');
console.log('motion        Bach     Gen');
const rmB = rootMotionPct(bach), rmG = rootMotionPct(gen);
for (const k of Object.keys(rmB)) console.log(k.padEnd(14) + rmB[k].padStart(6) + '  ' + rmG[k].padStart(6));

console.log('\n=== CADENCES (chord into the fermata) ===');
const cadPct = (d) => Object.entries(d.cad).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${(100 * v / Object.values(d.cad).reduce((a, b) => a + b, 0)).toFixed(0)}%`);
console.log('Bach:', cadPct(bach).join('  '));
console.log('Gen :', cadPct(gen).join('  '));
console.log('\n=== CHROMATIC VOCABULARY ===');
const totSD = Object.values(bach.secDom).reduce((a, b) => a + b, 0);
console.log('Bach applied dominants (which degree they tonicise):');
console.log('  ' + Object.entries(bach.secDom).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${(100 * v / totSD).toFixed(0)}%`).join('  '));
const totCS = Object.values(gen.chrSym).reduce((a, b) => a + b, 0);
console.log('Generator chromatic chords (raw syms):');
console.log('  ' + Object.entries(gen.chrSym).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${(100 * v / totCS).toFixed(0)}%`).join('  '));

console.log('\nBach chords analysed:', bach.total, '| Generator chords:', gen.total);
