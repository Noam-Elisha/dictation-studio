# Bach-like Generator — Design

**Date:** 2026-06-12
**Status:** Approved (brainstormed with user)

## Purpose

Bring the rule-based four-part progression generator's harmonic statistics closer to the 366-chorale
Bach corpus, so generated harmonic-dictation exercises *sound* like real chorales rather than a tidy
theory exercise. Driven by a corpus analysis ([tools/analysis/bach-vs-generator.mjs](../../../tools/analysis/bach-vs-generator.mjs))
that quantified where the generator diverges from Bach.

**Objective (user's choice): graded musical realism, not a statistical match.** Higher difficulties
(D3–D5) should sound like chorales; D1–D2 stay deliberately plain. Move the numbers toward Bach
clearly, but do **not** chase an exact distribution match.

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

### Root causes (traced to [js/progression.js](../../../js/progression.js))

- **`iii` is structurally impossible in major** — no entry in `CAT.major` (the 1.4% is all minor-mode `III`).
- **`vii°` is starved** — major has only `viio6`, reachable from `IV`/`ii`/`ii6` at weight 0.5–0.6;
  nothing routes the `I → vii°6 → I6` passing motion.
- **`vi` is pigeonholed** as a deceptive target / pre-predominant; few paths lead *into* it.
- **`I` saturates** because every phrase is 2 bars, starts on tonic, and usually cadences on tonic.
- **Cadences are 71% PAC** — `CADENCE_WEIGHT.PAC = 4.5` dwarfs `HC = 2.2`, and the internal-phrase
  ("open") downweight isn't strong enough to overcome the larger PAC template pool.
- **Descending-fifths are concentrated** in `V→I` and `ii→V`. Bach spreads the same motion through
  circle-of-fifths chains (`I–IV–vii°–iii–vi–ii–V`) that exercise iii / vi / vii° at once.

These gaps share root causes and a single principled lever (the sequence), which is the heart of the design.

## Design

All changes are contained in `js/progression.js` (the grammar module). The chord specs it emits stay
in the existing format, so downstream consumers (`voicing.js`, `nct.js`, `excerpt.js`) need no
interface changes. Each component below is independently testable.

**Difficulty plumbing (important — the grammar never sees difficulty 5).** `excerpt.js` clamps the UI
difficulty to `harmDiff = Math.min(4, difficulty)` and sets a separate `chromatic = difficulty >= 5`
boolean (`excerpt.js:209-210`); `generate()` re-clamps to 4 (`progression.js:349`). So
`generate` / `table` / `walkBody` / `pickCadence` / the new `sequenceBody` receive
`difficulty ∈ {1..4}` **plus** the `chromatic` flag (already threaded through `generate`, `walkBody`,
and `pickCadence`). **"D5" in this document means *difficulty 4 grammar + `chromatic` = true*** — the
existing convention. The new sequence gating keys off both signals; no new difficulty integer is
introduced, and no branch tests `difficulty === 5`.

### 1. Colour-chord vocabulary & passing motion *(graded tuning)*

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

### 2. Descending-fifths sequences

A new internal function renders a circle-of-fifths fragment as a phrase body and dovetails into the cadence.

- **Interface:** `sequenceBody(rng, mode, len, difficulty, chromatic, cadenceHead) → symArray | null`.
  Returns `null` (caller falls back to `walkBody`) if it cannot connect to `cadenceHead`. Takes both
  `difficulty` (1–4) and the `chromatic` flag so it can apply the "D5" behaviour (see plumbing note).
- **Diatonic fifth order** (from tonic):
  - major: `I → IV → vii°6 → iii → vi → ii6 → V`
  - minor: `i → iv → VII → III → VI → iio6 → V` (naturally passes through the relative major `III` and `VI`).
- The fragment ends on a predominant (`vi` or `ii6`/`iio6`) so the chosen cadence (`V–I` or `ii6–V–I`)
  completes it. Length adapts to the available body length (`bodyLen` in `generate`).
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
- **Integration:** in `generate()`, try `sequenceBody(...)` before `walkBody(...)`; on `null`, fall
  back to the existing random walk. No change to the rhythm/length framework.

### 3. Cadence variety

- Strengthen the internal-phrase ("open") path in `pickCadence`: downweight PAC harder
  (the current `×0.6` → ~`×0.3`) and raise HC / DC. Final phrases stay authentic (unchanged).
- Add a couple of templates to `CADENCES`: plagal `['IV','I']` and more deceptive
  `['ii6','V','vi']` / `['IV','V','vi']`. Keep chromatic cadences (N6, aug 6) as-is.
- Target: overall PAC share `71% → ~50%`. (Cannot reach Bach's 26% — every phrase's *final* cadence is
  authentic by design; this is the intended ceiling.)

### 4. Difficulty grading map

| Level | What's new (cumulative) |
|---|---|
| **D1** | *Unchanged.* `I, IV, V(7), vi`; mostly PAC, occasional HC. Deliberately plain. |
| **D2** | `vii°6` passing motion; more cadence variety (HC, deceptive); more paths into `vi`. |
| **D3** | `iii` + mediant motions; short, occasional, root-position sequences; applied dominants *(existing)*. |
| **D4** | Longer/more frequent sequences; smooth-inversion + applied-dominant renderings; chromatic cadences *(existing)*. |
| **D5** | *(= D4 grammar + `chromatic` flag, not a difficulty-5 integer.)* All renderings incl. long dominant chains; max NCT embellishment + modulation *(existing)*. |

## Components & files

| File | Change |
|---|---|
| `js/progression.js` | Catalogue (`iii`/`iii6`), `table()` edges, new `sequenceBody`, `generate()` hook, `pickCadence`/`CADENCES`/`CADENCE_WEIGHT` rebalance. Primary. |
| `js/voicing.js` | Likely none — verify `iii` and the sequence chains voice cleanly; adjust only if the soak test regresses. |
| `tools/test/progression.test.mjs` | Extend (file already exists): `iii` in catalogue & voiceable; `sequenceBody` produces valid chains at D3–D5; cadence mix shifts away from PAC. |
| `tools/analysis/bach-vs-generator.mjs` | No change — re-run as a regression check. |

## Risks & mitigations

- **Voicing failure on sequences / `iii`** (beam search may reject more chains). Mitigation: the excerpt
  layer already regenerates on failure (100% exercise success); the soak test bounds the regen rate;
  adjust rendering if `vii°` root or long dominant chains prove hard.
- **`iii` doubling the leading tone** — the voicer's LT-doubling rule keys off `lt`, which `iii` lacks,
  so it won't auto-reject; verify voicings don't double degree 7 awkwardly.
- **Sequences sounding mechanical** — mitigated by rendering variety and the per-phrase gating probability.
- **Over-shooting / making D3 too hard** — graded gating + the analysis-script check keep movement in range.

## Verification & success criteria

1. **Regression via the analysis script.** Re-run `tools/analysis/bach-vs-generator.mjs`; success is
   *clear movement* (not a match): iii `1.4→~6%`, vi `3.6→~8%`, vii° `1.8→~5%`, I `40→~30%`,
   PAC `71→~50%`, descending-fifths spread beyond `V→I`/`ii→V`. The script currently samples D2–D4
   only (`analyzeGen` loops `difficulty 2..4`); extend it to also sample the `chromatic` path so the
   D4+`chromatic` (UI D5) sequence renderings are exercised in the regression.
2. **Voicing stays correct.** The existing soak test (every difficulty/mode/seed → 0 hard-rule
   violations, ≤16% unvoiceable) stays green.
3. **It still sounds good.** Generate D2–D5 in the browser and listen — sequences should sound like
   chorale sequences, cadences varied, no awkward `iii` or voice-leading.
4. **Tests pass.** New `progression.test.mjs` assertions plus the existing `voicing.test.mjs` /
   `nct.test.mjs` suites.
