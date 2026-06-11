# Dictation Practice — Design

**Date:** 2026-06-11
**Status:** Approved (autonomous session — user directed "figure out what's needed and go build it")

## Purpose

A static website for practicing **melodic** and **harmonic dictation** in preparation for grad-school
entrance exams. The site plays an excerpt (a real Bach chorale phrase or a well-generated 4-part
progression / melody) under exam-like conditions — a fixed number of playings separated by timed
silent gaps — while the notated answer stays hidden. Afterward the answer is revealed as engraved
notation (plus Roman numerals for generated harmonic exercises) for self-checking on paper.

**Success criteria**

- Works offline by double-clicking `index.html` (no server, no network at runtime) and on any static host.
- Real Bach chorales with correct pitches/rhythms/fermatas; generated exercises that obey
  common-practice voice-leading rules (machine-verified, zero hard-rule violations across soak tests).
- Exam-realistic flow: key established first, count-in, N playings with countdown gaps, answer hidden
  until revealed, givens shown (key, meter, length, optional first note).
- Clean, professional, distinctive visual design; responsive; keyboard-operable.
- Reproducible exercises (seeded), practice history and self-assessment stats persisted locally.

## Approach decisions (alternatives considered)

| Concern | Chosen | Alternatives rejected |
|---|---|---|
| Notation rendering | **abcjs** (vendored `abcjs-basic-min.js`), internal model → ABC string | VexFlow (manual multi-measure layout is fiddly/risky); hand-rolled SVG (reinventing engraving) |
| Audio | **Custom Web Audio synth** + lookahead scheduler | abcjs synth / Tone.js samplers (network soundfonts, less control over multi-pass timed scheduling) |
| Bach data | **Build-time pipeline**: kern corpus (craigsapp/bach-370-chorales) → Node parser → compact JS data file committed to repo | Runtime fetch (breaks `file://`); hand-encoding (tiny, error-prone corpus) |
| Architecture | **Zero-build vanilla JS**, classic scripts on a `window.DS` namespace, no `fetch()`/ES-modules at runtime | ES modules (blocked on `file://`); framework + bundler (build step contradicts "static & robust") |

## Features

### Modes

1. **Melodic dictation** — a single line.
   Sources: *Generated melody* (difficulty 1–4), *Bach soprano*, *Bach bass*.
2. **Harmonic dictation** — 4-part writing.
   Sources: *Generated progression* (difficulty 1–4; answer includes Roman numerals),
   *Bach chorale phrase* (answer is the full SATB score).

### Exercise parameters

- Difficulty 1–4 (generated sources); Bach phrases bucketed easy/medium/hard by chromatic + rhythmic density.
- Key: random major, random minor, any, or a fixed key picked from a list.
- Length: generated harmonic = chord count (4–10); generated melodic = bars (2–8); Bach = 1–2 phrases (fermata-delimited).
- **Random transposition** of Bach excerpts (toggle) — defeats memorization; transposition window computed
  so every voice stays inside safe absolute ranges, and the resulting key signature stays ≤ 6 accidentals.

### Playback parameters

- Tempo (40–120 BPM), number of playings (1–10), gap between playings (5–120 s) with a visible countdown (skippable).
  After the final playing: straight to "finished" (manual reveal); if auto-reveal is on, one final timed gap
  (writing time) runs first, then the answer appears.
- **Establish key** before first playing: I–IV–V7–I cadence + tonic note (toggle: off / first playing / every playing).
- Count-in clicks (one bar, toggle). Honor fermatas (~2× lengthening, toggle).
- Voices played: all / outer only / bass only / soprano only (scaffolding for harmonic work).
- Per-voice volume (advanced), and per-voice mute/solo in the reveal view for study.
- Auto-reveal after the final gap (toggle) or manual reveal.

### Givens (exam realism)

Always shown while practicing: key, meter, length in bars; optional first note (melodic) /
first bass note (harmonic) behind a toggle.

### Flow

Setup → Start → [establish key] → [count-in] → playing 1 of N → countdown gap → … → playing N →
**Reveal** → engraved answer (+ Roman numerals when generated harmonic) + replay with mute/solo →
self-grade (Got it / Close / Missed) → New / Redo.

"Play again now" during practice grants an extra playing (tracked). Stop always available.
The answer area is fully hidden (not merely blurred) until reveal.

### Persistence (localStorage, degrade gracefully if unavailable)

- Settings auto-saved; named presets + built-ins ("Exam simulation", "Quick drill").
- History (≤ 200 entries): timestamp, mode, settings summary, seed/excerpt id, self-grade, extra plays; one-click **Redo**.
- Simple stats per mode/difficulty (attempts, grade distribution).

### Reproducibility

Every exercise is identified by `{settings, seed}` (generated) or `{choraleId, phraseSpan, transposition}` (Bach);
the same id reconstructs the identical exercise.

### Keyboard shortcuts

Space = start/stop, P = extra playing, S = skip gap, R = reveal, N = new exercise.

## Generation quality

### Progressions (per difficulty)

- D1: I, I6, IV, V, V7 (root), vi (rare deceptive), cadential 6/4; 4–6 chords.
- D2: + ii/ii6, viio6, passing I64, V6/V65/V42→I6, IV6.
- D3: + ii65, secondary dominants (V/V, V/IV, V/ii, V/vi, viio7/V), deceptive cadence, Phrygian half cadence in minor; 6–8 chords.
- D4: + mode mixture (iv, ♭VI), Neapolitan 6, Ger+6, brief tonicization of V or relative; 7–10 chords.
- Functional grammar (T→PD→D→T) as a weighted transition table; cadence type chosen (PAC/IAC/HC/deceptive)
  and enforced at the end; harmonic rhythm one chord per beat with lengthened final chord.

### SATB voicing (beam search over candidate voicings)

Hard rules (validated independently in tests): voice ranges (B E2–C4, T C3–G4, A G3–D5, S C4–G5),
spacing ≤ octave S–A and A–T, no crossing/overlap, no parallel or antiparallel 5ths/8ves/unisons,
no direct 5th/8ve into outer voices with soprano leaping, leading tone resolves (up to 1̂ in outer voices,
may fall a 3rd in inner voice at authentic cadence), chordal 7th resolves down by step, never doubled LT or 7th,
cadential 6/4 doubles the bass, melodic augmented 2nds banned. Soft costs: minimal total motion,
contrary motion vs. bass, stepwise soprano, complete chords (5th omittable on V7→I root–root), no inner-voice leaps > P5.

### Melodies

Weighted scale-walk with leap compensation (leap → step back the other way), tonal anchors (begin 1̂/3̂/5̂,
end with 2̂–1̂ or 7̂–1̂), rhythm vocabulary per meter and difficulty (incl. pickup option),
correct minor inflections (raised 6̂/7̂ ascending toward 1̂), range ≤ a 10th, singable. D4 adds chromatic
neighbors and modest syncopation.

### Verification

Soak tests: ≥ 500 seeds per difficulty through an independent rule validator — **zero** hard-rule violations
allowed. Melody tests assert range, interval legality, tonal ending. These run in Node (`node tools/test/run.mjs`).

## Bach data pipeline (build-time, committed output)

1. `tools/fetch-chorales.mjs` — download the kern corpus (GitHub zip) into `tools/cache/` (not committed).
2. `tools/build-chorales.mjs` — parse each `.krn`: spelled pitches (step/alter/octave), durations (incl. dots)
   in ticks (48/quarter), ties, fermatas, rests, barlines, pickup, key signature, mode, meter, BWV/title.
   **Reject** chorales with spine splits (`*^`), grace notes, mid-piece key/meter changes, or any
   measure whose voices disagree in total duration. Extract phrase spans from fermatas; compute difficulty stats.
3. Output `js/data/chorales-data.js` (`window.DS_CHORALES = …`, compact arrays), committed so the site
   never needs the pipeline at runtime. Expect ~300+ chorales to survive validation.

Attribution/licensing: the music is public domain; the kern encodings are credited to Craig Sapp's
`bach-370-chorales` (license noted in README and in-app About).

## Module layout

```
index.html                      css/style.css            fonts/ (vendored woff2 + fonts.css)
js/vendor/abcjs-basic-min.js    js/data/chorales-data.js (generated)
js/rng.js         seeded PRNG (mulberry32), seed helpers
js/theory.js      pitch {step,alter,oct} ⇄ midi, keys, scales, intervals, proper transposition/respelling
js/progression.js difficulty grammars → Roman-numeral chord sequence
js/voicing.js     chords → SATB (beam search) + independent rule validator
js/melody.js      melodic generator
js/excerpt.js     unified excerpt model; Bach phrase extraction + transposition; generated assembly
js/abc.js         excerpt model → ABC string (grand staff SATB w/ stem directions, RN as aligned lyrics)
js/synth.js       Web Audio piano-ish synth, click, cadence builder, lookahead scheduler (stop-safe)
js/session.js     exercise state machine (idle/establishing/playing/waiting/done/revealed), timers, events
js/storage.js     settings/presets/history/stats with localStorage guards
js/ui.js          DOM wiring, rendering, countdown ring, shortcuts, a11y live regions
js/main.js        boot
tools/            fetch + build pipeline, kern parser, node test runner + tests
```

Script load order in `index.html` defines dependency order; everything hangs off `window.DS`.

## Visual design

"Engraver's desk": warm paper surface, ink-dark text, deep oxblood/burgundy accent, hairline rules echoing
staff lines, an elegant vendored serif for display (e.g., Fraunces or Source Serif 4) + a clean UI face with
tabular numerals for timers; Noto Music (vendored) for inline ♯/♭/𝄞 accents. Countdown rendered as a ring
timer; status changes announced via `aria-live`. Light theme primary; `prefers-reduced-motion` respected.
No purple-gradient AI-slop aesthetics.

## Error handling

- AudioContext created/resumed inside the Start click handler (autoplay policy).
- Data file missing → visible error banner instead of dead controls.
- localStorage unavailable/full → in-memory fallback, banner once.
- Generator dead-ends → bounded internal retry with fresh seed (soak tests keep this rare).

## Testing

- **Node tests** (no framework, `tools/test/run.mjs`): kern parser fixtures, theory spelling/transposition,
  voicing validator (planted-violation cases), generator soaks, ABC golden outputs.
- **Browser tests** (Playwright via MCP): page loads from `file://` with clean console; full exercise flow
  (short timings) reaches reveal; SVG notation present; history persists across reload; screenshots
  (desktop + mobile) for design iteration.

## Out of scope (v1)

Note-entry with auto-grading; interval/chord-ID drills; PWA manifest; automatic Roman-numeral analysis
of Bach phrases (answers show the full score instead — labeling Bach with auto-RNs risks teaching wrong analyses).
