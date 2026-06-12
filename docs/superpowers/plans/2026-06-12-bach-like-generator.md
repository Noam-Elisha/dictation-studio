# Bach-like Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated harmonic-dictation exercises sound like real Bach chorales — richer chord vocabulary (mediant, leading-tone passing chords), descending-fifths sequences, harmonic expansion (prolongation) on every function, varied cadences, and a denser quarter-note rhythm with fermata-cadences and flexible mid-bar phrasing — all graded by difficulty.

**Architecture:** Nearly all work is in `js/progression.js` (the Roman-numeral grammar). A new phrase-body builder composes three "moves" — the existing Markov walk, prolongation expansions, and descending-fifths sequences — to fill a phrase; a reworked rhythm layer lays chords as a quarter-note beat-stream with fermata-cadences on strong beats and no note crossing a barline. The chord-spec format and the `generatePhrases`/`generateModulating` output contract (flat chord array + `.phraseEnds`) are unchanged, so `voicing.js`/`nct.js`/`excerpt.js`/`abc.js` need verification, not restructuring.

**Tech Stack:** Zero-build vanilla JS on `window.DS`; Node `node:vm` test harness (`tools/test/run.mjs`, `harness.mjs`); the corpus-analysis tool `tools/analysis/bach-vs-generator.mjs`.

**Spec:** [docs/superpowers/specs/2026-06-12-bach-like-generator-design.md](../specs/2026-06-12-bach-like-generator-design.md) — read it first for full design rationale.

---

## Orientation (read before starting)

- **Chord catalogue** `CAT[mode]` (`js/progression.js:19-82`): each chord is `C(tones, bass, opts)` where `tones` are `[degree 1..7, chromaticAlter]` pairs relative to the major / natural-minor scale, `bass` is the index into `tones` of the bass note, and `opts` may set `lt` (leading-tone tone index), `seventh`, `fn` (`T`/`PD`/`D`), `rT` (degree the lt resolves to), `cad64`, `aug6`. Default `fn` is `T`.
- **Transition tables** `table(difficulty, mode)` (`:101-189`): difficulty-graded weighted edges, built with `add(from, [[to, weight], …])`.
- **Body walk** `walkBody(rng, t, start, len, cadenceHead, mode, chromatic)` (`:286-317`): random walk over the table producing `len` syms ending compatibly before `cadenceHead`. Uses `tendencyCompatible` (`:257`) and `canPrecede` (`:271`).
- **Cadences** `CADENCES` / `CADENCE_WEIGHT` / `pickCadence` (`:193-249`).
- **Rhythm** `BODY_BARS` / `FINAL_BARS` / `buildRhythm` (`:322-338`) — **this is what §5/§6 replace**. `tpq` (ticks per quarter) = 48; a bar in 4/4 = 192 ticks; strong beats are ticks where `t % 192 ∈ {0, 96}`.
- **Orchestrators** `generate` (`:348`), `generatePhrases` (`:384`), `generateModulating` (`:494`, with `modPhrase` `:474`).
- **Consumer** `excerpt.js:198-298`: generated harmonic is hardcoded 4/4 (`num:4, den:4, mlen:192, upbeat:0`); fermatas are placed by walking each voice to the phrase-end chord's tick position (`:251-266`).
- **Engraver constraint** `abc.js` `measuresOf` (`:46-57`): **throws `note crosses barline` if any single note's span overshoots a barline.** Ties across a barline are fine (two notes); a single long note is not.
- **Tests:** `tools/test/voicing.test.mjs`, `tools/test/progression.test.mjs`, `tools/test/nct.test.mjs`. Run all: `node tools/test/run.mjs`. Filter: `node tools/test/run.mjs progression`.
- **Soak invariant (must stay green):** `voicing.test.mjs` — every difficulty/mode/seed → 0 hard-rule violations, ≤16% unvoiceable.

**Test helpers** (`harness.mjs`): `loadDS([...files])`, `suite`, `test`, `eq(actual, expected[, msg])`, `ok(cond[, msg])`. Standard preamble:
```js
import { loadDS, suite, test, eq, ok } from './harness.mjs';
const DS = loadDS(['js/rng.js', 'js/theory.js', 'js/progression.js', 'js/voicing.js']);
const T = DS.theory, V = DS.voicing, P = DS.progression;
const C_MAJOR = { tonic: { step: 0, alter: 0 }, mode: 'major' };
const A_MINOR = { tonic: { step: 5, alter: 0 }, mode: 'minor' };
```

**Shared invariant helper** — add to `progression.test.mjs` near the top, used by several tasks. Both
helpers take an optional starting `phase` (a single `buildPhrase` may begin mid-bar; a whole piece from
`generatePhrases` begins at phase 0):
```js
const TPQ = 48, BAR = 192;
const strongBeat = (tick) => tick % BAR === 0 || tick % BAR === 96;
// returns true if any chord's span crosses a barline, given the stream's starting tick phase
function crossesBarline(chords, phase = 0) {
  let t = phase;
  for (const c of chords) {
    if (Math.floor((t + c.dur - 1) / BAR) !== Math.floor(t / BAR)) return true;
    t += c.dur;
  }
  return false;
}
function startTicks(chords, phase = 0) { const out = []; let t = phase; for (const c of chords) { out.push(t); t += c.dur; } return out; }
```

---

## Phase 1 — Colour-chord vocabulary (§1)

### Task 1: Add `iii`/`iii6` to the major catalogue

**Files:**
- Modify: `js/progression.js` (`CAT.major`, after the `vi` entry ~`:35`)
- Test: `tools/test/progression.test.mjs`

- [ ] **Step 1: Write the failing test**
```js
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
});
```
- [ ] **Step 2: Run it, expect FAIL** — `node tools/test/run.mjs progression` → `unknown chord iii in major`.
- [ ] **Step 3: Implement** — in `CAT.major`, after `vi:`:
```js
      iii: C([[3, 0], [5, 0], [7, 0]], 0),
      iii6: C([[3, 0], [5, 0], [7, 0]], 1),
```
- [ ] **Step 4: Run it, expect PASS.** If `validate` fails on a doubled leading tone (degree 7), note it — the voicer may need a guard (see Task 12); for now confirm the chord at least *exists* and most seeds voice.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "Add iii/iii6 to the major chord catalogue"`

### Task 2: Wire vii°6 passing motion and richer `vi`/`iii` edges

**Files:**
- Modify: `js/progression.js` `table()` (`:106-187`)
- Test: `tools/test/progression.test.mjs`

- [ ] **Step 1: Write the failing test** — assert the new edges are reachable and that a D3 major walk can contain `iii`, a D2 walk can contain the `I–vii°6–I6` passing motion. Sample many seeds:
```js
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
```
- [ ] **Step 2: Run it, expect FAIL.**
- [ ] **Step 3: Implement** — add to `table()`:
  - Major, inside `if (difficulty >= 2)`:
    ```js
    add('I', [['viio6', 0.5]]);
    add('I6', [['viio6', 0.6]]);
    add('I', [['vi', 0.5]]);           // more paths into vi
    ```
  - Major, inside `if (difficulty >= 3)`:
    ```js
    add('I', [['iii', 0.4]]);
    add('iii', [['IV', 1.5], ['vi', 1.2], ['ii6', 1.0], ['I6', 0.6]]);
    add('vi', [['iii', 0.8]]);
    ```
  - Minor, inside `if (difficulty >= 2)`:
    ```js
    add('i', [['viio6', 0.5]]);
    add('i6', [['viio6', 0.6]]);
    ```
- [ ] **Step 4: Run it, expect PASS.** Then run the full suite: `node tools/test/run.mjs` — soak still green.
- [ ] **Step 5: Commit** — `git commit -am "Wire vii°6 passing motion and iii/vi edges (graded D2/D3)"`

---

## Phase 2 — Cadence variety (§4)

### Task 3: Diversify cadences, push internal phrases off PAC

**Files:**
- Modify: `js/progression.js` `CADENCES` (`:193-220`), `CADENCE_WEIGHT` (`:221`), `pickCadence` (`:230-249`)
- Test: `tools/test/progression.test.mjs`

- [ ] **Step 1: Write the failing test** — over many `cadenceClass:'open'` phrases, PAC share should be a minority:
```js
test('internal (open) phrases are mostly non-PAC', () => {
  let pac = 0, n = 0;
  for (let s = 0; s < 800; s++) {
    const d = 2 + (s % 3);
    const ch = P.generate(DS.rng.create(s + d * 1000), { difficulty: d, mode: s % 2 ? 'major' : 'minor', bars: 2, cadenceClass: 'open' });
    n++; if (ch.cadence === 'PAC') pac++;
  }
  ok(pac / n < 0.4, `open-phrase PAC share ${(pac / n).toFixed(2)} should be < 0.40`);
});
```
- [ ] **Step 2: Run it, expect FAIL** (currently ~0.5+).
- [ ] **Step 3: Implement** —
  - Add templates to `CADENCES`:
    ```js
    { syms: ['IV', 'I'], type: 'PC', minD: 2 },          // plagal
    { syms: ['ii6', 'V', 'vi'], type: 'DC', minD: 3 },   // extra deceptive
    { syms: ['IV', 'V', 'vi'], type: 'DC', minD: 2 },
    ```
  - Add `PC: 1.0` to `CADENCE_WEIGHT`, and in `pickCadence`'s `cadenceClass === 'open'` multiplier, treat `PC` like `HC` (strong boost) and drop the PAC factor from `0.6` to `0.3`:
    ```js
    if (cadenceClass === 'open') w *= (c.type === 'HC' || c.type === 'PHC' || c.type === 'PC') ? 3 : c.type === 'DC' ? 1.5 : 0.3;
    ```
  - `minorize` map (`:223`): ensure plagal `['IV','I']` maps correctly (`IV→iv`, `I→i`).
- [ ] **Step 4: Run it, expect PASS.** Full suite green.
- [ ] **Step 5: Commit** — `git commit -am "Diversify cadences; push internal phrases off PAC"`

---

## Phase 3 — Harmonic rhythm + flexible phrasing (§5, §6)

The flexible beat-stream rhythm goes into a **new** `buildPhrase` function used by the multi-phrase
orchestrators. **`generate()` is left untouched** — it keeps its `bars:`/`length:` signature and the
existing bar-aligned rhythm — so every existing `bars:`/`length:` caller (in `nct.test.mjs`,
`voicing.test.mjs`, and `progression.test.mjs`) keeps passing unchanged. Harmonic content is
the plain walk for now, wrapped behind a shared `composeBody` helper that prolongation (Phase 4) and
sequences (Phase 5) will extend. The shipped path is `generatePhrases`/`generateModulating` → `buildPhrase`.

### Task 4: `buildPhrase` — flexible beat-stream rhythm (single phrase)

**Files:**
- Modify: `js/progression.js` — add `composeBody(rng, t, len, cadenceHead, mode, difficulty, chromatic)` (initially a thin wrapper that just calls `walkBody`) and `buildPhrase(rng, {mode, difficulty, startPhase, beatBudget, cadenceClass, chromatic, isFinal})`; export both as `_composeBody`/`_buildPhrase` (add these test-only exports — and later `_PROLONG`, `_sequenceBody` — to the `DS.progression = {…}` object at `progression.js:568`). **Do not touch** `generate`, `buildRhythm`, or `BODY_BARS`/`FINAL_BARS`.
- Test: `tools/test/progression.test.mjs`

**Design (the joint-sizing mechanism):** lay the phrase's chords as quarter notes (48) from `startPhase`. Strong beats are `tick % 192 ∈ {0, 96}`. The phrase-final (cadence) chord must land on a strong beat: lay all quarters, compute the final chord's phase; if it is on a weak beat (`{48,144}`), lengthen exactly one body chord that *starts on a strong beat* from a quarter to a half (96) — a single +48 shift always moves a weak-beat landing onto a strong one ({48→96, 144→0}), and a half on a strong beat stays within its bar (so no note crosses a barline). The phrase-final chord always gets `fermata:true`; it is a **half** when `isFinal` (the piece's last chord), else a **quarter** (the next phrase picks up on the following beat). Whole notes (192) never appear. *Edge case:* if the body is a single chord starting on a weak beat (no strong-beat body chord to lengthen), lengthen the cadence's first chord instead, or re-pick `beatBudget` ±1.

- [ ] **Step 1: Write the failing test** (the rhythm invariants, over varied start phases and `isFinal`):
```js
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
});
```
- [ ] **Step 2: Run it, expect FAIL** (`_buildPhrase` undefined).
- [ ] **Step 3: Implement** `composeBody` (call `walkBody`) and `buildPhrase`: pick a cadence (`pickCadence`), `composeBody` the body sized to `beatBudget - cadence.syms.length`, then a rhythm assigner that (a) assigns quarters, (b) lengthens one strong-beat body chord to a half to land the cadence on a strong beat, (c) sets `fermata:true` on the final chord — a **half if `isFinal`**, else a quarter. Map syms→chord specs with the assigned durations. Return the chord array (with `.cadence`). Leave `generate`/`buildRhythm` alone.
- [ ] **Step 4: Run it, expect PASS.** Then `node tools/test/run.mjs` — every existing suite still green (nothing called `generate` differently).
- [ ] **Step 5: Commit** — `git commit -am "Add buildPhrase: flexible beat-stream rhythm with fermata-cadences"`

### Task 5: Drive `generatePhrases` from `buildPhrase` (pickups across the barline)

**Files:**
- Modify: `js/progression.js` `generatePhrases` (`:384-398`) — replace its per-phrase `generate(bars:2)` calls with `buildPhrase`, threading a running beat-phase so phrases cadence mid-bar and the next picks up on the following beat; mark the last phrase `isFinal`.
- Test: `tools/test/progression.test.mjs`

- [ ] **Step 1: Write the failing test:**
```js
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
```
- [ ] **Step 2: Run it, expect FAIL.**
- [ ] **Step 3: Implement** — `generatePhrases` accumulates `phase = total % 192`, calls `buildPhrase({startPhase: phase, beatBudget: 5 + rngInt(0..4), isFinal: p === phrases-1, …})`, appends chords, records `phraseEnds`. Preserve the `.phraseEnds`/`.cadence` contract. **Size the final phrase so its cadence lands on beat 3** (`tick % 192 === 96`), so the half-note final closes the bar (`total % 192 === 0`); use the ±1 `beatBudget` lever if the natural sizing would land it on beat 1. (A final on beat 1 would leave a stray 2-beat last measure — legal in `abc.js`, but a clean bar-close is preferred.)
- [ ] **Step 4: Run it, expect PASS.** Full suite green — confirm `voicing.test.mjs` "phrase soprano lines sing" (uses `generatePhrases`) still passes.
- [ ] **Step 5: Commit** — `git commit -am "generatePhrases: flexible mid-bar cadences and pickups via buildPhrase"`

### Task 6: Drive `generateModulating` from `buildPhrase`; fix `modPhrase`

**Files:**
- Modify: `js/progression.js` `modPhrase` (`:474-485`), `generateModulating` (`:494-552`)
- Test: `tools/test/progression.test.mjs`

- [ ] **Step 1: Write the failing test** — `generateModulating` output obeys the same invariants (no 192 final, fermata phrase-ends on strong beats, no barline crossing, `total % 192 === 0`) across D4/D5 seeds that actually modulate (loop until several return non-null).
- [ ] **Step 2: Run it, expect FAIL** (`modPhrase` ends on `192`).
- [ ] **Step 3: Implement** — rework `modPhrase` so the confirming `tonic(new)` is a fermata half on a strong beat (not a 192 whole note), and thread the running `startPhase` through `generateModulating` exactly as `generatePhrases` does (stay-phrases via `buildPhrase`), including the final-phrase bar-close (cadence on beat 3 → `total % 192 === 0`).
- [ ] **Step 4: Run it, expect PASS.** Full suite green.
- [ ] **Step 5: Commit** — `git commit -am "Flexible rhythm for modulating phrases"`

### Task 7: Soak the shipped path (`generatePhrases`/`generateModulating`)

The existing soak (`voicing.test.mjs`) exercises `generate(length:…)` — the *legacy* path. Add a soak over the **shipped** path so prolongation/sequences (Phases 4–5) are guaranteed to voice.

**Files:**
- Test: `tools/test/voicing.test.mjs` (add a test) — or `progression.test.mjs`; keep it with the other soak.

- [ ] **Step 1: Write the soak** — over every difficulty 1–5 (pass `chromatic` for 5), both modes, ~150 seeds each: `generatePhrases` (and `generateModulating` where it returns non-null) → `V.harmonize` → `V.validate`. Assert 0 hard-rule violations and unvoiceable rate ≤ 16% (mirror the existing soak's thresholds at `voicing.test.mjs:163-167`).
- [ ] **Step 2: Run it, expect PASS** (with only Phase 1–3 content it should comfortably pass; it becomes the guard for Phases 4–5).
- [ ] **Step 3: Commit** — `git commit -am "Soak the shipped generatePhrases/generateModulating path"`

### Task 8: Browser verification — rhythm & engraving

**Files:** none (verification). Use the preview tooling.

- [ ] **Step 1** — start the preview server; generate harmonic exercises at D1, D3, D5 (difficulty + source = generated). Reveal the answer.
- [ ] **Step 2** — confirm **no console error** (a `note crosses barline` throw in `abc.js` would surface here). Check `preview_console_logs`.
- [ ] **Step 3** — confirm the engraving: continuous 4/4 barring, fermatas on mid-bar cadence chords, phrases picking up across barlines, no whole-note padding. Screenshot.
- [ ] **Step 4** — play; confirm fermata-held cadences sound right (≈1.5× hold) and the harmony moves in quarters with no dead held chords.
- [ ] **Step 5: Commit** any tweaks; otherwise note verification passed.

---

## Phase 4 — Harmonic expansion / prolongation (§3)

### Task 9: Prolongation templates (tonic, predominant, dominant)

**Files:**
- Modify: `js/progression.js` — add a `PROLONG` table keyed by `mode` then function, listing expansion sym-chains.
- Test: `tools/test/progression.test.mjs`

- [ ] **Step 1: Write the failing test** — each template, voiced standalone, validates clean; predominant templates exist for both modes (non-tonic emphasis):
```js
test('prolongation templates voice cleanly and include non-tonic (PD) expansions', () => {
  const PROLONG = P._PROLONG;             // exported for testing
  ok(PROLONG.major.PD.length >= 4 && PROLONG.major.D.length >= 1, 'PD emphasised, D present');
  for (const mode of ['major', 'minor']) {
    const key = mode === 'major' ? C_MAJOR : A_MINOR;
    for (const fn of ['T', 'PD', 'D']) for (const chain of PROLONG[mode][fn]) {
      const chords = chain.map((s) => P.chordSpec(s, mode));
      const v = V.harmonize(DS.rng.create(3), key, chords);
      ok(v && V.validate(key, chords, v).length === 0, `${mode}/${fn} [${chain}] voices clean`);
    }
  }
});
```
- [ ] **Step 2: Run it, expect FAIL.**
- [ ] **Step 3: Implement** `PROLONG` (paste-ready below; matches spec §3) and export it as `_PROLONG` for tests. Every sym already exists in `CAT[mode]`:
```js
const PROLONG = {
  major: {
    T: [['I','viio6','I6'], ['I','V6','I'], ['I','V43','I6'], ['I6','V6','I'], ['I','IV','I'], ['I','I6']],
    PD: [['IV','ii6'], ['ii','ii6'], ['IV','IV6','ii6'], ['IV','ii65'], ['ii6','ii65'], ['IV','ii']],
    D: [['V','V7'], ['V6','V65']],
  },
  minor: {
    T: [['i','viio6','i6'], ['i','V6','i'], ['i','iv','i'], ['i','i6']],
    PD: [['iv','iio6'], ['iv','iv6','iio6'], ['iv','iiø65']],
    D: [['V','V7']],
  },
};
```
- [ ] **Step 4: Run it, expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "Add prolongation templates (tonic, predominant, dominant)"`

### Task 10: Compose prolongation into the phrase-body builder (D2+)

**Files:**
- Modify: `js/progression.js` — `composeBody` (Task 4, used by `buildPhrase`). Add a "prolong the current function" move, gated `difficulty >= 2`, with chromatic inner chords only at `difficulty >= 3`.
- Test: `tools/test/progression.test.mjs`

- [ ] **Step 1: Write the failing test** — D1 contains no prolongation (plain block chords); D2+ produces measurably more chords-per-phrase and surfaces non-tonic expansions; everything still voices:
```js
test('prolongation: off at D1, on at D2+, non-tonic expansions appear, still voices', () => {
  const density = (d) => { let n = 0, k = 0; for (let s = 0; s < 200; s++) { const ch = P.generatePhrases(DS.rng.create(s + d * 99), { difficulty: d, mode: 'major', phrases: 2 }); n += ch.length; k++; } return n / k; };
  ok(density(2) > density(1) * 1.1, 'D2 denser than D1');
  // voicing soak is covered by voicing.test.mjs; here just confirm a sample voices
  const ch = P.generatePhrases(DS.rng.create(5), { difficulty: 3, mode: 'major', phrases: 3 });
  const v = V.harmonize(DS.rng.create(5), C_MAJOR, ch);
  ok(v && V.validate(C_MAJOR, ch, v).length === 0, 'D3 prolonged phrase voices clean');
});
```
- [ ] **Step 2: Run it, expect FAIL.**
- [ ] **Step 3: Implement** — in `composeBody`, at each step, with a difficulty-graded probability, instead of a single walk step, splice a `PROLONG[mode][fn]` chain matching the current chord's `fn` (the inner chords land on the upcoming weak beats; `buildPhrase`'s rhythm assigner already handles strong/weak placement). Respect the remaining `len` budget and `tendencyCompatible`. Gate: no prolongation at D1; diatonic at D2; allow chromatic inner chords at D3+. (Because `composeBody` is only reached through `buildPhrase`, the legacy `generate` path stays plain — its callers are unaffected.)
- [ ] **Step 4: Run it, expect PASS.** Full suite incl. soak green.
- [ ] **Step 5: Commit** — `git commit -am "Compose prolongation into phrase bodies (D2+, non-tonic emphasised)"`

---

## Phase 5 — Descending-fifths sequences (§2)

### Task 11: `sequenceBody` with three rendering modes

**Files:**
- Modify: `js/progression.js` — add `sequenceBody(rng, mode, len, difficulty, chromatic, cadenceHead)`; integration into `composeBody` happens in Task 12.
- Test: `tools/test/progression.test.mjs`

- [ ] **Step 1: Write the failing test** — `sequenceBody` returns a valid chain ending on a predominant that connects to the cadence head, for each rendering mode; integrated, sequences appear at D3+ and voice:
```js
test('sequenceBody produces valid descending-fifths fragments that voice', () => {
  let made = 0;
  for (let s = 0; s < 300 && made < 80; s++) {
    const seq = P._sequenceBody(DS.rng.create(s), 'major', 4, 4, false, 'V7');
    if (!seq) continue; made++;
    const chords = seq.concat(['V7', 'I']).map((x) => P.chordSpec(x, 'major'));
    chords[chords.length - 1].sopranoEnd = [1];
    const v = V.harmonize(DS.rng.create(s), C_MAJOR, chords);
    ok(v && V.validate(C_MAJOR, chords, v).length === 0, `seq [${seq}] voices clean`);
  }
  ok(made >= 50, `exercised sequenceBody (${made})`);
});
```
- [ ] **Step 2: Run it, expect FAIL.**
- [ ] **Step 3: Implement** `sequenceBody` (export `_sequenceBody`): walk the diatonic fifth order (major `I,IV,viio6,iii,vi,ii6,V`; minor `i,iv,VII,III,VI,iio6,V`), take a fragment of length `len` ending on a predominant; render per mode (root-position / smooth-inversion / applied-dominant chain) weighted by `difficulty`+`chromatic` (spec §2 table). Return `null` if it can't connect to `cadenceHead`.
- [ ] **Step 4: Run it, expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "Add descending-fifths sequenceBody (three rendering modes)"`

### Task 12: Integrate sequences; voicer guard for `iii` if needed

**Files:**
- Modify: `js/progression.js` `composeBody` (try `sequenceBody` per the §2 gating table before a plain walk, gated `difficulty >= 3`).
- Modify (only if Task 1/soak shows it): `js/voicing.js` — if `iii`/sequences double the leading tone awkwardly, add a soft doubling penalty for degree 7 in non-dominant chords.
- Test: `tools/test/progression.test.mjs`, `tools/test/voicing.test.mjs` (both soaks)

- [ ] **Step 1: Write/extend the test** — at D3+, sequences appear in `generatePhrases` output and both soaks stay green.
- [ ] **Step 2: Run, expect FAIL** (sequences not yet wired into `composeBody`).
- [ ] **Step 3: Implement** the gating in `composeBody`. Run the soaks (`node tools/test/run.mjs voicing`). **If** the unvoiceable rate exceeds 16% or hard-rule violations appear, add the minimal voicer guard and/or down-weight the offending rendering (e.g. prefer `vii°6` over root `vii°` in sequences).
- [ ] **Step 4: Run, expect PASS** — full suite green incl. soak.
- [ ] **Step 5: Commit** — `git commit -am "Integrate sequences into phrase bodies (graded D3+)"`

---

## Phase 6 — Verification, tuning & deploy

### Task 13: Extend the analysis tool to the chromatic path

**Files:**
- Modify: `tools/analysis/bach-vs-generator.mjs` `analyzeGen` (loops `difficulty 2..4`) — add a pass with `chromatic:true` (UI D5).

- [ ] **Step 1** — add the chromatic sample; re-run `node tools/analysis/bach-vs-generator.mjs`.
- [ ] **Step 2: Commit** — `git commit -am "Sample the chromatic (D5) path in the analysis tool"`

### Task 14: Tune weights to the spec targets *(measure-and-adjust, not red-green)*

**Files:** `js/progression.js` (edge/prolongation/sequence/cadence weights).

- [ ] **Step 1** — run `node tools/analysis/bach-vs-generator.mjs`; record the deltas.
- [ ] **Step 2** — adjust weights toward the spec targets: **iii ~6%, vi ~8%, vii° ~5%, I ~30%, PAC ~50%, descending-fifths spread beyond V→I/ii→V.** These are *target ranges* (the objective is movement, not an exact match) — iterate a few times.
- [ ] **Step 3** — after each change, re-run the **full test suite** (`node tools/test/run.mjs`) to confirm invariants + soak stay green.
- [ ] **Step 4: Commit** — `git commit -am "Tune generator weights toward Bach corpus targets"`

### Task 15: Full regression + browser listen

- [ ] **Step 1** — `node tools/test/run.mjs` → **all suites pass** (paste the summary line; 0 failures).
- [ ] **Step 2** — browser: generate D1–D5, reveal, **listen and look** at each. Confirm: no console errors; sequences/prolongations sound like chorale motion; cadences varied; D1 still plain; no awkward `iii` or voice-leading; no whole-note padding; mid-bar fermatas + pickups render correctly.
- [ ] **Step 3** — if anything sounds wrong, return to the relevant phase; otherwise proceed.

### Task 16: Deploy

- [ ] **Step 1** — confirm the working tree is committed and the full suite is green.
- [ ] **Step 2** — push to `main` (GitHub Pages deploys from `main`): `git push`.
- [ ] **Step 3** — poll the Pages build (`gh run list`/`gh run watch`) until green; spot-check the live site.

---

## Notes for the executor

- **DRY/YAGNI:** keep everything in `js/progression.js` unless it crosses ~850 lines and feels unwieldy — only then extract the rhythm/phrase-form helpers into `js/phrase.js` (don't pre-split).
- **TDD:** Phases 1–2, 4–5 are clean red-green. Phase 3 invariants are red-green. **Task 14 is measure-and-tune** — its evidence is the analysis-tool output and a green suite, not a single pass/fail assertion. Per @superpowers:verification-before-completion, never claim a target hit without pasting the fresh analysis numbers, and never claim the suite passes without the fresh run summary.
- **The hard constraint:** no single note may cross a barline (`abc.js` throws). Every rhythm task asserts `!crossesBarline(...)`. If a `note crosses barline` error ever appears in the browser, a rhythm task regressed.
- **Soaks are sacred:** both the legacy soak (`generate(length:…)`, `voicing.test.mjs`) and the shipped-path soak (`generatePhrases`/`generateModulating`, Task 7) must stay at 0 hard-rule violations, ≤16% unvoiceable, after every task. `generate()` is never given a new signature, so the legacy soak and every existing `bars:`/`length:` caller (`nct.test.mjs`, `voicing.test.mjs`, `progression.test.mjs`) are unaffected by Phase 3.
