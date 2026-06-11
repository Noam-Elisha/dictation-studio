# Dictation Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A zero-build static website for melodic/harmonic dictation practice from real Bach chorales and rule-generated 4-part writing, per `docs/superpowers/specs/2026-06-11-dictation-practice-design.md`.

**Architecture:** Classic scripts on a `window.DS` namespace (works from `file://`). Build-time Node pipeline converts the kern corpus into a committed JS data file. Pure-logic modules (theory, generators, ABC conversion, kern parsing) are dependency-free and tested in Node by loading the same files the browser uses. UI/audio layered on top.

**Tech Stack:** Vanilla JS, abcjs 6.4.4 (vendored) for engraving, Web Audio API for sound, Node ≥ 20 for tooling/tests, Playwright MCP for browser verification.

**Executor note:** This plan is executed inline by the planning agent (full context retained). Interfaces below are binding; implementation code lives in the repo, with TDD for every pure-logic module (test first → red → implement → green → commit).

---

## Binding conventions

- **Ticks:** 48 per quarter note (`tpq`). 32nd note = 6 ticks; reject anything finer in the pipeline.
- **Voice order everywhere in app code:** index 0 = Soprano, 1 = Alto, 2 = Tenor, 3 = Bass. (Kern files are B,T,A,S left→right; the parser reverses.)
- **Pitch:** `{step, alter, oct}` — `step` 0–6 = C–B letters, `alter` −2…+2, `oct` = scientific octave of the letter (C4 = middle C; midi(C4)=60). Rests use `step: -1`.
- **Note:** pitch + `{dur, tieStart, tieEnd, fermata}` (ticks; booleans).
- **Key:** `{tonic: {step, alter}, mode: 'major'|'minor'}`.
- **Excerpt model** (consumed by abc.js, synth scheduling, UI):
  `{kind, source, key, num, den, mlen, upbeat, tpq, voices: [[note…]×1|4], romans: [{label, tick}]|null, meta}`
  `upbeat` = ticks in the partial first measure (0 = starts on a downbeat). `meta` carries ids/seed/title/transposition for history & redo.
- **Voice ranges for generation (MIDI, hard):** S 60–79 (C4–G5), A 55–74 (G3–D5), T 48–67 (C3–G4), B 40–60 (E2–C4).
- **Generated meters:** harmonic = 4/4 only (half-note rhythm). Melodic = 4/4 or 3/4 (setting), rhythm vocabulary defined per meter.
- **Bach transposition window:** derived from the excerpt's *actual* per-voice min/max pitches — allowed semitone shift `s ∈ [−6, +6]` with `bassMin+s ≥ 38 (D2)`, `sopMax+s ≤ 81 (A5)`, and resulting key `|fifths| ≤ 6` (choose simpler enharmonic). Shift 0 always allowed.
- **Final gap:** none after last playing (state → finished, manual reveal); with auto-reveal ON, one final gap (writing time) runs, then reveal.
- **abc.js melodic output:** single staff, no `%%score`, no lyrics line; clef chosen by register (bass clef when the line's center sits below C4 — covers Bach-bass-source melodic excerpts).
- **Establish-key "every playing":** the session timeline re-inserts the cadence before each playing (not just the first).
- **Acknowledged spec deviations (deliberate):** generated harmonic uses half-note harmonic rhythm with odd chord counts 5/7/9 (spec said per-beat, 4–10) so cadences land on strong beats; chorale-keep target relaxed to ≥ 250; soak coverage = 250 seeds × major/minor per difficulty (= 500/difficulty, matching spec intent).
- **Difficulty control:** 1–4 for generated sources; when source = Bach, the same control shows 3 buckets (easy/medium/hard).
- **Tempo bounds:** 40–120 BPM (default 72 harmonic, 80 melodic). **Fixed-key list:** all tonics with |fifths| ≤ 6 for the chosen mode.
- **Compact chorale note tuple (data file only):** `[step, alter, oct, dur, flags]`, flags bitmask 1=tieStart 2=tieEnd 4=fermata; rest = step −1.
- **Generated harmonic meter:** 4/4, half-note harmonic rhythm, final chord = whole note on a downbeat ⇒ chord counts odd (5/7/9), cadence lands on a strong beat.
- **localStorage keys:** `ds.settings.v1`, `ds.presets.v1`, `ds.history.v1`, `ds.stats.v1`.

## File map

| File | Responsibility |
|---|---|
| `tools/kern-parser.mjs` | Pure kern → chorale-object parser (exported; used by build + tests) |
| `tools/build-chorales.mjs` | Walk corpus, validate/filter, phrase + difficulty analysis, emit `js/data/chorales-data.js` |
| `tools/fetch-chorales.mjs` | (Optional re-run) download corpus zip to `tools/cache/` |
| `tools/fetch-fonts.mjs` | Done — vendored fonts |
| `tools/test/run.mjs` | Tiny test runner (`node tools/test/run.mjs [filter]`); loads browser files via `vm` into a `DS` sandbox |
| `tools/test/*.test.mjs` | Suites: kern, theory, progression, voicing, melody, abc, excerpt |
| `js/rng.js` | mulberry32 PRNG: `create(seed)`, `int`, `pick`, `weighted`, `shuffle`, `newSeed` |
| `js/theory.js` | Spelling, midi, key signatures (`fifths`), scales w/ minor inflections, intervals, `transposeNote/Key` |
| `js/progression.js` | Difficulty-graded functional grammar → chord specs `{sym, tones:[{degree,alter}…], bassIdx, dur}` |
| `js/voicing.js` | `harmonize(rng, key, chords)` beam search → 4 voices; `validate(key, chords, voices)` independent rule checker |
| `js/melody.js` | `generate(rng, {difficulty,key,bars,num,den,pickup})` → notes |
| `js/excerpt.js` | Bach excerpt extraction (phrase spans, transposition window, respelling) + generated assembly → excerpt model |
| `js/abc.js` | Excerpt → ABC string: SATB grand staff, stems, beaming by beat, measure-scoped accidental state, ties, fermatas, RN as `w:` lyrics under bass |
| `js/synth.js` | AudioContext mgmt, piano-ish voice, click, per-voice gains, lookahead scheduler (`Player`), cadence builder |
| `js/session.js` | Exercise state machine: idle→establishing→countin→playing(k)→gap(k)→finished→revealed; timers, extra-play/skip/stop; emits events |
| `js/storage.js` | Guarded localStorage: settings, presets (+2 built-ins), history (≤200, redo payloads), stats |
| `js/ui.js` | DOM wiring: settings rail, stage, countdown ring, reveal (abcjs render, mute/solo), history, presets, shortcuts, a11y |
| `js/main.js` | Boot, data presence check, error banner |
| `index.html`, `css/style.css`, `fonts/` | Markup, design system, vendored fonts |

Script load order: vendor → data → rng → theory → progression → voicing → melody → excerpt → abc → synth → storage → session → ui → main.

## Domain rules locked for voicing.js (hard = reject; soft = cost)

Hard: ranges; adjacent spacing S–A, A–T ≤ P8 (T–B ≤ P12); no crossing; no overlap vs. previous chord; no parallel/antiparallel P5/P8/P1 between any pair; no direct (hidden) 5th/8ve into S/B pair unless soprano moves by step; LT in S/B resolves to 1̂ at V(7)→I/i (inner LT may drop to 5̂); chordal 7th resolves down by step (or holds); never double LT, 7th, or any altered tone; cadential 6/4 doubles bass; no melodic aug 2nd/aug 4th+ in any voice; voices move ≤ P8 (B may leap ≤ P8, others ≤ m6 unless octave); complete chords except V7/I may omit 5th w/ doubled root; triads: prefer doubled root, allow doubled 3rd (never LT) / 5th.
Soft costs: total semitone motion; reward contrary/oblique vs. bass; S stepwise bonus; repeated S pitch penalty (>2 in a row); inner leap > P4 penalty; unison penalty; incomplete-chord penalty.

## Tasks

### Task A: Test runner + rng + theory (TDD)
**Files:** `tools/test/run.mjs`, `tools/test/theory.test.mjs`, `js/rng.js`, `js/theory.js`
- [x] Runner: loads listed browser scripts via `node:vm` into shared `{DS:{}}` sandbox; `t.eq/ok/throws`; exit 1 on failure; per-suite summary
- [x] Failing tests: spelling (`name({step:3,alter:1})==='F#'`), midi (C4=60, B#3=60, Cb4=59), `fifths` (G maj=1, F maj=−1, f# min=3, ab min=−7), key signature accidental map, scale of d minor / A major, `intervalBetween(C4,E4) = {d:2,s:4}`, `transposeNote(F#4, up m3) = A4`, `transposeKey(D major, down M2) = C major`, round-trip transposition
- [x] Run → red; implement `js/rng.js`, `js/theory.js`; run → green
- [x] Commit `feat: theory + rng with node test harness`

### Task B: Kern parser + data pipeline
**Files:** `tools/kern-parser.mjs`, `tools/test/kern.test.mjs`, `tools/build-chorales.mjs`, `js/data/chorales-data.js` (generated, committed)
- [x] Failing tests: parse chor001 fixture head (key G major, 3/4, pickup 48 ticks, first bass note G2 q, fermata flags on m4 chords, beam letters stripped, ties, dotted durs); duration-mismatch fixture rejected; spine-split fixture rejected
- [x] Implement parser: metadata (`!!!OTL@EN`, `!!!SCT`), interp lines (`*k[…]`, `*X:`, `*M`, clefs ignored), tokens (recip+dots → ticks; kern octaves; `r`; `[`,`]`,`_` ties; `;` fermata; strip `LJKkq…` decorations), barline-aligned validation per measure across spines, pickup detection, reverse to S,A,T,B
- [x] Build script: parse all 370; reject splits/graces/mid-piece key-or-meter changes/duration errors/<3 phrases? (no — ≥2 fermatas required); phrase spans from soprano fermata note-ends; per-phrase stats (chromatic ratio, 16th density, soprano leap ratio, length) → difficulty terciles; emit compact `window.DS_CHORALES`; print report (kept/rejected & why)
- [x] Target: ≥ 250 chorales kept; spot-check chor001 against source by eye
- [x] Commit `feat: bach chorale data pipeline`

### Task C: Progression + voicing (TDD + soak)
**Files:** `js/progression.js`, `js/voicing.js`, `tools/test/progression.test.mjs`, `tools/test/voicing.test.mjs`
- [x] Failing tests — progression: D1 vocab ⊆ {I,I6,IV,V,V7,vi,I64cad}; starts on I/i; ends with chosen cadence formula; D3 minor may include Phrygian HC; secondary dominants only D3+; tone spelling (V in minor has raised 7̂; viio7/V correct); lengths odd 5–9
- [x] Failing tests — voicing: `validate` catches planted parallel 5ths/8ves, range, spacing, overlap, unresolved LT/7th, doubled LT; `harmonize` on fixed I-IV-V7-I returns valid complete voicing
- [x] Soak: 4 difficulties × major/minor × 150 seeds → `harmonize` success ≥ 99% (internal retry allowed), `validate` returns zero violations for every success
- [x] Implement; green; commit `feat: progression grammar + SATB voice-leading engine`

### Task D: Melody generator (TDD + soak)
**Files:** `js/melody.js`, `tools/test/melody.test.mjs`
- [x] Failing tests: total duration = bars·mlen (+pickup handling); range ≤ 10th & within C4–G5; no aug 2nds; leaps ≤ P5 (D1–2) with compensation; ends 2̂→1̂ or 7̂→1̂ on long final; minor: ascending 6̂/7̂ raised toward tonic, descending natural; rhythm values from difficulty vocab; soak 4×2×150 seeds
- [x] Implement; green; commit `feat: melodic dictation generator`

### Task E: Excerpt + ABC (TDD)
**Files:** `js/excerpt.js`, `js/abc.js`, `tools/test/excerpt.test.mjs`, `tools/test/abc.test.mjs`
- [x] Failing tests — excerpt: Bach phrase slice has aligned voice durations & correct `upbeat`; transposition window respects ranges & |fifths| ≤ 6; respelled key correct; generated harmonic assembly: chords→notes, romans ticks correct, meter fill exact; melodic assembly
- [x] Failing tests — abc: golden header (`%%score {(S A) | (T B)}`, clefs, `K:`, `M:`, `L:1/32`); accidental logic (F# in G major emitted bare; F natural emits `=F`; accidental persists in measure → second F# after natural re-emits `^F`; octave-specific); ties `-`, fermata `!fermata!`, beat-grouped beaming spaces, bar `|` placement incl. upbeat, RN `w:` line count matches bass notes (skip-syllable `*` for held bass)
- [x] Implement both; green; commit `feat: excerpt assembly + ABC engraving conversion`

### Task F: Synth + session + storage
**Files:** `js/synth.js`, `js/session.js`, `js/storage.js` (+ `tools/test/session.test.mjs` for plan-building math)
- [x] Synth: lazy ctx; `Player` with 25 ms lookahead loop & 120 ms horizon, `stop()` cancels cleanly (no stuck tones — track live nodes, fast release on master); piano voice (triangle + 2f sine partial, exp decay, lowpass, velocity); woodblock-ish click; per-voice `GainNode[4]` + master soft compressor; `buildCadence(key)` via voicing on I-IV-V7-I + tonic octave
- [x] Session: timeline builder — events from excerpt at tempo (fermata ×2 toggle), schedules: establish? → count-in? → N plays with gap countdowns (200 ms UI tick, skippable, extra-play inserts another play, stop→idle); auto-reveal toggle; emits `state`, `tick`, `playProgress`
- [x] Tested in Node: pure helpers (`excerptToEvents` timing incl. fermata stretch & per-voice selection, gap schedule math)
- [x] Commit `feat: audio engine + practice session state machine + storage`

### Task G: UI (frontend-design skill) + boot
**Files:** `index.html`, `css/style.css`, `js/ui.js`, `js/main.js`
- [ ] Invoke superpowers/frontend-design for visual direction ("engraver's desk": warm paper, ink, oxblood accent, Fraunces display + Inter UI + Noto Music accents, hairline staff-rule motifs)
- [ ] Settings rail (mode/source/difficulty/key/length/transpose; tempo/plays/gap/establish/count-in/fermata/voices-played/per-voice levels (advanced); first-note toggle; auto-reveal); presets row (built-ins + save/delete)
- [ ] Stage: givens chips; state hero (idle → establishing → count-in → "Playing k of N" w/ progress bar → countdown ring → finished); transport (Start/Stop, Play again, Skip wait, Reveal)
- [ ] Reveal: abcjs render (responsive width), RN under bass via lyrics, replay + per-voice mute/solo, transposition note ("originally in X"), self-grade trio → stats; New / Redo
- [ ] History list (mode, source, key, grade, date, redo) + stats line; About/licenses modal; shortcuts (Space/P/S/R/N) + help; `aria-live` status; reduced-motion
- [ ] Commit `feat: full UI`

### Task H: Browser verification + design iteration
- [ ] Playwright over `file://…/index.html`: console clean on load; run melodic+harmonic flows (2 plays, short gap) → reveal shows SVG; redo reproduces identical ABC; history persists after reload; mobile 390px layout sane
- [ ] Screenshots desktop/mobile → iterate design per frontend-design eye (spacing, hierarchy, states) until professional
- [ ] Commit fixes

### Task I: README + finish
- [ ] README: what/why, quick start (double-click `index.html` or any static host), feature tour, practice-method notes, regenerating data, licenses/attribution (abcjs MIT; Bach encodings craigsapp/bach-370-chorales; fonts OFL)
- [ ] `.gitignore` (`tools/cache/`), superpowers:verification-before-completion (full test run + browser pass), final commit
