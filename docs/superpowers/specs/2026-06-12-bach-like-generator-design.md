# Bach-like Generator — Design

**Date:** 2026-06-12
**Status:** Approved (brainstormed with user)

## Purpose

Make generated harmonic-dictation exercises *sound* like real chorales rather than a tidy theory
exercise — in **both** their harmonic vocabulary and their rhythmic/phrase shape. Driven by a corpus
analysis ([tools/analysis/bach-vs-generator.mjs](../../../tools/analysis/bach-vs-generator.mjs)) that
quantified where the generator's chord usage diverges from the 366-chorale Bach corpus, plus the
observation that the phrase engine emits too few harmonic events to let any of that vocabulary breathe.

**Objective (user's choice): graded musical realism, not a statistical match.** Higher difficulties
(D3–D5) should sound like chorales; D1–D2 stay harmonically plain (but rhythmically alive). Move the
numbers toward Bach clearly, but do **not** chase an exact distribution match.

## Background — the measured gaps

The analyzer walks every beat of all 366 chorales, identifies each chord by template-matching the four
sounding pitches, and labels it by root scale-degree relative to the chorale's key (any non-diatonic
chord tone ⇒ "chromatic"). The same labeling is applied to ~50k generator chords (`generatePhrases`,
D2–D4). Validated by dumping individual chorales — it correctly traces real harmony, including
secondary dominants and tonicizations.

| Metric | Bach | Generator | Gap |
|---|---|---|---|
| `I` share | 23% | **40%** | tonic-saturated |
| `V` share | 20% | 27% | dominant-heavy |
| `iii` share | 8% | **1.4%** | mediant nearly absent |
| `vi` share | 9% | 3.6% | submediant underused |
| `vii°` share | 6% | 1.8% | leading-tone chord starved |
| chromatic share | 17% | 6% | far less applied harmony |
| PAC at phrase ends | 26% | **71%** | cadence monotony |
| descending-5th root motion | 37% | 50% | concentrated in `V→I`/`ii→V` |

### Root causes — vocabulary (traced to [js/progression.js](../../../js/progression.js))

- **`iii` is structurally impossible in major** — no entry in `CAT.major` (the 1.4% is all minor-mode `III`).
- **`vii°` is starved** — major has only `viio6`, reachable from `IV`/`ii`/`ii6` at weight 0.5–0.6;
  nothing routes the `I → vii°6 → I6` passing motion.
- **`vi` is pigeonholed** as a deceptive target / pre-predominant; few paths lead *into* it.
- **`I` saturates** because every phrase is 2 bars, starts on tonic, and usually cadences on tonic.
- **Cadences are 71% PAC** — `CADENCE_WEIGHT.PAC = 4.5` dwarfs `HC = 2.2`, and the internal-phrase
  ("open") downweight isn't strong enough to overcome the larger PAC template pool.
- **Descending-fifths are concentrated** in `V→I` and `ii→V`. Bach spreads the same motion through
  circle-of-fifths chains (`I–IV–vii°–iii–vi–ii–V`) that exercise iii / vi / vii° at once.

### Root causes — rhythm & phrase form

Even with a richer vocabulary, the phrase engine gives it nowhere to live. The harmonic rhythm is built
from bar templates (`BODY_BARS`/`FINAL_BARS`) whose finals are half- and whole-note-heavy, so a typical
2-bar phrase is **four chords then a held note**. `modPhrase` is worse — it *always* ends on a 192-tick
whole note. Phrases are rigidly bar-aligned (every phrase = a whole number of bars, cadence filling the
last bar). The result: too few harmonic events per phrase, and long dead notes where motion should be.

Two complementary fixes (below): a denser quarter-note rhythm with **fermata-cadences instead of held
notes**, and ways to **fill phrases with meaningful motion** — harmonic expansion (prolongation) and the
descending-fifths sequences.

## Design

The work splits into **harmonic content** (sections 1–4) and **rhythm & phrase form** (sections 5–6).
Nearly everything lives in `js/progression.js`; the chord specs it emits stay in the existing format and
the `generatePhrases`/`generateModulating` output contract (a flat chord array with `.phraseEnds`) is
unchanged, so downstream consumers (`voicing.js`, `nct.js`, `excerpt.js`) need no structural change.

**Difficulty plumbing (important — the grammar never sees difficulty 5).** `excerpt.js` clamps the UI
difficulty to `harmDiff = Math.min(4, difficulty)` and sets a separate `chromatic = difficulty >= 5`
boolean (`excerpt.js:209-210`); `generate()` re-clamps to 4 (`progression.js:349`). So
`generate` / `table` / `walkBody` / `pickCadence` / the new helpers receive `difficulty ∈ {1..4}`
**plus** the `chromatic` flag (already threaded through `generate`, `walkBody`, and `pickCadence`).
**"D5" in this document means *difficulty 4 grammar + `chromatic` = true*** — the existing convention.
New gating keys off both signals; no branch tests `difficulty === 5`.

---

### A. Harmonic content

#### 1. Colour-chord vocabulary & passing motion *(graded tuning)*

- Add `iii` and `iii6` to `CAT.major`: `iii = C([[3,0],[5,0],[7,0]], 0)`, `iii6` = same with bass 1.
  Function `T` (tonic-area / mediant); no `lt` flag (degree 7 is the chordal fifth, not a tendency tone).
  The tone list `[[3,0],[5,0],[7,0]]` is deliberate — the chordal fifth is the *natural* degree 7,
  matching the existing minor `III` (`progression.js:68`) and the catalogue's major-scale-relative
  convention, which is precisely why no `lt` is set.
- Add transition edges in `table()`:
  - **D2 (major):** `I → vii°6` and `I6 → vii°6` (enabling `I–vii°6–I6` and `I6–vii°6–I`;
    `viio6 → I`/`I6` already exist). More paths into `vi`.
  - **D3 (major):** `I → iii` (small), `iii → IV`, `iii → vi`, `iii → ii6`, `vi → iii`.
- Minor already has `III`/`VI`/`VII`; add the analogous `i–viio6–i6` passing motion at D2.

#### 2. Descending-fifths sequences

A new internal function renders a circle-of-fifths fragment as a phrase body and dovetails into the cadence.

- **Interface:** `sequenceBody(rng, mode, len, difficulty, chromatic, cadenceHead) → symArray | null`.
  Returns `null` (caller falls back to the ordinary walk) if it cannot connect to `cadenceHead`. Takes
  both `difficulty` (1–4) and the `chromatic` flag so it can apply the "D5" behaviour.
- **Diatonic fifth order** (from tonic):
  - major: `I → IV → vii°6 → iii → vi → ii6 → V`
  - minor: `i → iv → VII → III → VI → iio6 → V` (naturally passes through the relative major `III`/`VI`).
- The fragment ends on a predominant (`vi` or `ii6`/`iio6`) so the chosen cadence (`V–I` or `ii6–V–I`)
  completes it. Length adapts to the available body length.
- **Three rendering modes**, selected per occurrence (weighted by difficulty for variety):
  1. **Root-position** — recognisable down-a-fifth / up-a-fourth bass; `vii°` rendered as `vii°6` where
     voicing needs it. Best for ear-training clarity.
  2. **Smooth-inversion** — alternating root / 6-3 chords for a smoother bass.
  3. **Applied-dominant chain** — diatonic targets preceded by their secondary dominants
     (`…–V/ii–ii–V/V–V…`); more chromatic. D4+ only.
- **Gating** (probability a phrase body is a sequence, and rendering weights), keyed off the actual
  signals the grammar receives:
  | Signal | use-sequence p | rendering weights |
  |---|---|---|
  | difficulty 1–2 | 0 | — |
  | difficulty 3 | ~0.25 | root 0.8, smooth 0.2 |
  | difficulty 4, `chromatic` false (UI D4) | ~0.4 | root 0.4, smooth 0.3, dominant-chain 0.3 |
  | difficulty 4, `chromatic` true (UI D5) | ~0.5 | root 0.25, smooth 0.25, dominant-chain 0.5 (longer chains) |

#### 3. Harmonic expansion (prolongation) *(new)*

Expand a single harmonic **function** over time with subordinate chords on weak beats — holding and
deepening one function instead of progressing away from it. Where a sequence *moves* the harmony, a
prolongation *holds* it; alternating the two is how a chorale phrase breathes, and both add meaningful
events (the direct fix for "too few chords").

- **Expansion templates**, keyed by function (first and last chord keep the function):
  - **Tonic (major):** `[I, IV, I]` and `[I, I6]` *(basic — D1)*; `[I, vii°6, I6]`, `[I, V6, I]`,
    `[I, V43, I6]`, `[I6, V6, I]` *(passing/neighbour — D2+)*.
  - **Tonic (minor):** the analogues with `i`, `iv`, `viio6`, `V6`.
  - **Predominant:** `[ii, ii6]`, `[IV, ii6]`, `[IV, IV6]` *(D2+)*.
  - **Dominant:** `[V, V7]`, `[V6, V65]` *(D3+)*; the cadential six-four `[I64c, V7]` already exists in
    the cadence templates.
- **Integration:** prolongation, the ordinary Markov walk, and sequences become the three "moves" a
  reworked phrase-body builder composes to fill a phrase's beats, ending on a pre-cadential chord. A
  prolongation/sequence emits several chords at once; the walk emits one. Inner (subordinate) chords land
  on weak beats, framing chords on stronger beats. Inner chords obey the existing
  `tendencyCompatible` voice-leading check (they are standard chords, so they do).
- **Grading:** basic tonic expansion from **D1** (fundamental, and needed to fill the now-longer phrases
  without raising harmonic difficulty); passing/neighbour and predominant/dominant expansions phase in at
  **D2–D3**, matching the colour-chord schedule.

#### 4. Cadence variety

- Strengthen the internal-phrase ("open") path in `pickCadence`: downweight PAC harder
  (the current `×0.6` → ~`×0.3`) and raise HC / DC. Final phrases stay authentic (unchanged).
- Add a couple of templates to `CADENCES`: plagal `['IV','I']` and more deceptive
  `['ii6','V','vi']` / `['IV','V','vi']`. Keep chromatic cadences (N6, aug 6) as-is.
- Target: overall PAC share `71% → ~50%`. (Cannot reach Bach's 26% — every phrase's *final* cadence is
  authentic by design; this is the intended ceiling.)

---

### B. Rhythm & phrase form

#### 5. Harmonic rhythm — fewer held notes *(new)*

- Reweight so **quarter-note** harmonic motion dominates, **half notes are uncommon**, and **whole notes
  essentially never** appear in generated progressions.
- **The cadence chord becomes a quarter or half *with a fermata*** — not a whole note. The perceived
  hold is the fermata (playback already stretches fermatas ×1.5, `synth.js`), exactly as chorales notate
  cadences. This kills the dead held notes while keeping cadential weight.
- Replace the half/whole-heavy bar templates (`BODY_BARS`/`FINAL_BARS`) with a beat-stream that emits
  mostly 48-tick events, occasional 96, and 192 essentially never. Cadence chords get a `fermata`-bound
  short duration (see §6 for placement).
- **Half notes (96) may start only on beats 1 or 3** (`tick % 192 ∈ {0, 96}`) so they never span a
  barline; quarters may start anywhere. This is the no-barline-crossing constraint (§6) applied to the
  rhythm stream.
- **Fix `modPhrase`** (currently `[…, tonic 192]`) to end on the same short fermata-cadence.
- Applies at **all difficulties** — a dead whole-note ending hurts D1 as much as D5.

#### 6. Flexible phrase structure — mid-bar cadences & pickups *(new)*

- A phrase need not fill whole bars. It is a stream of (mostly quarter) chords ending on a cadence chord
  that lands on a **strong beat** — beat 1 or beat 3 in 4/4 (`tick % 192 ∈ {0, 96}`) — carrying a
  fermata. The next phrase begins on the following beat (a weak beat = an implicit pickup).
- **Phrase lengths vary** (in beats), so cadences fall on different strong beats and phrases overlap the
  barline via pickups — like real chorales (e.g. *a full bar, then two beats, then a fermata on beat 3,
  then a pickup into the next bar*).
- The piece still starts on a **downbeat** (`upbeat: 0`, unchanged) and the total length stays a
  **whole number of bars** (the final cadence completes the last bar). Continuous 4/4 barring, no leading
  anacrusis.
- **Hard constraint — no note may cross a barline.** `abc.js` (`measuresOf`, lines 46–57) starts a
  measure only on an exact barline hit and **throws** `note crosses barline` if a note's accumulated
  span overshoots the barline; there is no tie- or measure-splitting. (Ties *across* a barline are fine —
  they are two notes.) So the rhythm generator must keep every single note within its bar: **half notes
  only on beats 1/3, quarters anywhere, no whole notes**, and the NCT layer must not lengthen a note
  across a barline. This invariant — not "mid-bar fermatas" — is the real reason §6 is a generator
  concern.
- **Feasibility (verified against the code):** generated harmonic is hardcoded 4/4, `mlen: 192`,
  `upbeat: 0` (`excerpt.js:283-287`); fermata placement walks each voice to the phrase-end chord's *tick
  position* (`excerpt.js:251-266`), so mid-bar fermata *placement* already works; abcjs then bars by
  accumulated duration. ⇒ the change is essentially all in `progression.js`; `excerpt.js`/`abc.js` need
  **no restructuring provided the no-barline-crossing invariant above holds** (verify, don't assume).
- **Implementation shape:** the multi-phrase orchestrators (`generatePhrases`/`generateModulating`)
  drive a phrase builder that knows the running beat position, chooses each phrase's length so its
  cadence lands on a strong beat, flags the fermata there, and lets the next phrase pick up immediately.
  Concretely this is the dual of today's `bodyLen = M - cadence.syms.length`: given the phrase's beat
  budget and starting beat-phase, pick the cadence template and body length *together* so the cadence
  chord falls on `tick % 192 ∈ {0, 96}` and the running total closes the final bar (`total % 192 == 0`).
  `generate()`'s rhythm parameters change (a target beat-length + starting beat-phase replace `bars`);
  its chord-array output contract is unchanged. The legacy count-based `length`/`legacyDurations` path
  stays for existing tests.

---

### 7. Difficulty grading map

Harmonic content is graded; **rhythm & phrase form (§5–§6) apply at every difficulty** (they are texture,
not harmonic difficulty).

| Level | Harmonic content | Rhythm & form |
|---|---|---|
| **D1** | `I, IV, V(7), vi`; simple cadences; basic tonic expansion (`I–IV–I`, `I–I6`). Plain. | quarter-note motion, fermata-cadences (no whole notes), flexible phrasing |
| **D2** | + `vii°6` passing & expansions; more `vi`; more cadence variety (HC, deceptive). | ″ |
| **D3** | + `iii` & mediant motion; short root-position sequences; predominant/dominant expansion; applied dominants *(existing)*. | ″ |
| **D4** | + longer/varied sequences; smooth-inversion & dominant-chain renderings; chromatic cadences *(existing)*. | ″ |
| **D5** | *(= D4 grammar + `chromatic` flag.)* All renderings incl. long dominant chains; max NCT embellishment + modulation *(existing)*. | ″ (densest) |

## Components & files

| File | Change |
|---|---|
| `js/progression.js` | **Primary.** Catalogue (`iii`/`iii6`); `table()` edges; `sequenceBody`; prolongation templates + phrase-body builder; rhythm/phrase-form rework (beat-stream, fermata-cadences, flexible lengths, strong-beat cadence alignment); `modPhrase` fix; `pickCadence`/`CADENCES`/`CADENCE_WEIGHT` rebalance. *If the module grows unwieldy, extract the rhythm/phrase-form helpers into `js/phrase.js` — decide during planning.* |
| `js/excerpt.js` | Verify only — assembly/fermata placement is tick-position based and should need no structural change. Enforce the "total = whole bars" invariant if it isn't already guaranteed. |
| `js/abc.js` | Verify only — `measuresOf` **throws if a note crosses a barline** (lines 46–57). No change; the rhythm generator must satisfy the no-barline-crossing invariant so this never fires. |
| `js/voicing.js` | Verify — prolongation chords (`V6`, `V43`, `ii6`…) are standard; `iii` and the sequence chains are the real risk. Adjust only if the soak test regresses. |
| `js/nct.js` | Verify — embellishment must respect the new (mid-bar) phrase boundaries/fermatas **and must not lengthen a note across a barline**; the existing no-tie-across-fermata and beat-articulation rules should carry over. |
| `tools/test/progression.test.mjs` | Extend (file already exists). **Rewrite** the existing "quarter-note harmonic rhythm" assertions — they currently require half/whole-note finals (`[96,192].includes(final.dur)`) which §5 inverts. Add: `iii` voiceable; `sequenceBody` & prolongations produce valid chains; **no 192-tick durations**; **no note crosses a barline**; cadence chords carry a fermata and sit on a strong beat; total ticks `% 192 == 0`; cadence mix shifted off PAC. |
| `tools/analysis/bach-vs-generator.mjs` | Re-run as a regression; extend `analyzeGen` to also sample the `chromatic` (UI D5) path. |

## Risks & mitigations

- **Voicing failure on sequences / `iii`** (beam search may reject more chains). Mitigation: the excerpt
  layer already regenerates on failure (100% exercise success); the soak test bounds the regen rate.
- **`iii` doubling the leading tone** — the voicer's LT-doubling rule keys off `lt`, which `iii` lacks;
  verify voicings don't double degree 7 awkwardly.
- **Rhythm/phrase rework breaking invariants** — a note crossing a barline *throws* in `abc.js`; a
  cadence off a strong beat or a non-whole-bar total mis-bars the engraving. Mitigation: assert the
  invariants (no note crosses a barline, strong-beat cadence, fermata present, `total % 192 == 0`, no
  whole notes) in `progression.test.mjs`.
- **Flexible phrasing × NCT interaction** — embellishment across a mid-bar pickup or up to a mid-bar
  fermata. Mitigation: re-verify the articulation / no-tie-across-fermata rules; browser-listen.
- **More chords per phrase ⇒ more voicing work**, slightly higher unvoiceable rate — bounded by the soak
  test and absorbed by regeneration.
- **`progression.js` growing large** — flag for a `js/phrase.js` extraction if it crosses a
  maintainability threshold.
- **Sequences sounding mechanical / D3 too hard** — gating probabilities and the analysis-script check
  keep it in range.

## Verification & success criteria

1. **Regression via the analysis script.** Re-run `tools/analysis/bach-vs-generator.mjs`; success is
   *clear movement* (not a match): iii `1.4→~6%`, vi `3.6→~8%`, vii° `1.8→~5%`, I `40→~30%`,
   PAC `71→~50%`, descending-fifths spread beyond `V→I`/`ii→V`. Extend `analyzeGen` to also sample the
   `chromatic` path so the D4+`chromatic` (UI D5) renderings are exercised.
2. **Rhythm/phrase invariants (node).** Over many seeds and all difficulties: **no note crosses a
   barline** (re-walk each voice; no note's span passes a `% 192` boundary); no 192-tick durations;
   every phrase-end chord carries a fermata and sits on a strong beat (`tick % 192 ∈ {0, 96}`); total
   ticks `% 192 == 0`; half notes are uncommon.
3. **Voicing stays correct.** The existing soak test (every difficulty/mode/seed → 0 hard-rule
   violations, ≤16% unvoiceable) stays green.
4. **It still sounds — and looks — right.** Generate D1–D5 in the browser: engraving shows continuous
   barring with mid-bar fermatas and pickups; audio has fermata-held cadences (no dead whole notes) and
   varied phrase lengths; sequences and prolongations sound like chorale motion, cadences varied, no
   awkward `iii` or voice-leading.
5. **Tests pass.** Extended `progression.test.mjs` plus the existing `voicing.test.mjs` / `nct.test.mjs`.
