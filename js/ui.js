// DOM wiring: settings rail, practice stage, reveal view, history, shortcuts.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});
  const T = DS.theory;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let settings = null;
  let session = null;
  let current = null; // {excerpt, settings, rebuild, historyId, revealed, peeked, studyVoices}

  // ---------- helpers ----------

  const GLYPH = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
  function prettyPitch(p, withOctave = true) {
    const acc = GLYPH[p.alter] ? `<span class="noto">${GLYPH[p.alter]}</span>` : '';
    return `${T.STEP_NAMES[p.step]}${acc}${withOctave ? p.oct : ''}`;
  }
  function prettyKey(key) {
    return `${prettyPitch({ ...key.tonic, oct: 0 }, false)} ${key.mode}`;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function timeAgo(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 90) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function banner(msg, isError = true) {
    const el = $('#banner');
    el.textContent = msg;
    el.hidden = false;
    el.style.borderColor = isError ? 'var(--missed)' : 'var(--close)';
    clearTimeout(banner._t);
    banner._t = setTimeout(() => { el.hidden = true; }, 7000);
  }

  // ---------- settings binding ----------

  function radioSet(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
  }
  function radioGet(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
  }

  function buildDifficultySeg() {
    const seg = $('#difficulty-seg');
    const isBach = settings.source === 'bach';
    // difficulty 5 (maximal embellishment) only applies to generated harmony
    const maxGen = settings.mode === 'harmonic' ? 5 : 4;
    const opts = isBach
      ? [[1, 'Easy'], [2, 'Medium'], [3, 'Hard']]
      : Array.from({ length: maxGen }, (_, i) => [i + 1, String(i + 1)]);
    const titles = isBach
      ? { 1: 'mostly diatonic, simple rhythms', 2: 'some chromaticism', 3: 'chromatic, busy inner voices' }
      : { 1: 'I IV V V7 vi', 2: '+ ii, inversions, cadential 6/4', 3: '+ secondary dominants, deceptive', 4: '+ mixture, Neapolitan, aug. sixth, modulation', 5: 'difficulty-4 harmony, maximally embellished with passing tones & suspensions' };
    const max = isBach ? 3 : maxGen;
    const val = Math.min(settings.difficulty, max);
    settings.difficulty = val; // don't let a hidden difficulty leak into generation
    seg.classList.toggle('seg-4', !isBach && maxGen === 4);
    seg.classList.toggle('seg-5', !isBach && maxGen === 5);
    seg.innerHTML = opts
      .map(
        ([v, label]) =>
          `<label title="${titles[v] || ''}"><input type="radio" name="difficulty" value="${v}" ${v === val ? 'checked' : ''}><span>${label}</span></label>`
      )
      .join('');
    $$('input[name="difficulty"]').forEach((el) =>
      el.addEventListener('change', () => {
        settings.difficulty = Number(radioGet('difficulty'));
        persist();
      })
    );
  }

  function buildFixedKeyOptions() {
    const sel = $('#sel-fixedkey');
    const opts = [];
    for (const mode of ['major', 'minor']) {
      for (let step = 0; step < 7; step++) {
        for (let alter = -1; alter <= 1; alter++) {
          const key = { tonic: { step, alter }, mode };
          if (Math.abs(T.fifths(key)) > 5) continue;
          const name = `${T.name(key.tonic)} ${mode}`;
          opts.push(name);
        }
      }
    }
    sel.innerHTML = opts.map((n) => `<option value="${n}">${n.replace('#', '♯').replace('b', '♭')}</option>`).join('');
  }

  // The length control adapts: generated harmonic chooses 1-4 phrases (stored
  // in harmonicPhrases); Bach chooses 1-3 phrases and melodic chooses bars
  // (both stored in length as short/medium/long).
  function buildLengthSeg() {
    const seg = $('#length-seg');
    const { mode, source } = settings;
    let opts;
    let isPhrases = false;
    if (source === 'generated' && mode === 'harmonic') {
      opts = [[1, '1'], [2, '2'], [3, '3'], [4, '4']];
      isPhrases = true;
    } else if (source === 'bach') {
      opts = [['short', '1 phrase'], ['medium', '2 phrases'], ['long', '3 phrases']];
    } else {
      opts = [['short', '2 bars'], ['medium', '4 bars'], ['long', '6 bars']];
    }
    const label = $('#length-label');
    if (label) label.textContent = isPhrases ? 'Length (phrases)' : 'Length';
    const current = isPhrases ? settings.harmonicPhrases : settings.length;
    seg.classList.toggle('seg-4', opts.length === 4);
    seg.innerHTML = opts
      .map(
        ([v, label]) =>
          `<label><input type="radio" name="lengthsel" value="${v}" ${String(v) === String(current) ? 'checked' : ''}><span>${label}</span></label>`
      )
      .join('');
    $$('#length-seg input').forEach((el) =>
      el.addEventListener('change', () => {
        if (isPhrases) settings.harmonicPhrases = Number(el.value);
        else settings.length = el.value;
        persist();
      })
    );
  }

  function applyVisibility() {
    const { mode, source } = settings;
    $('#row-melodicvoice').hidden = !(mode === 'melodic' && source === 'bach');
    // generated harmonic is always 4/4; everything else can filter by meter
    $('#row-meter').hidden = mode === 'harmonic' && source === 'generated';
    $('#row-transpose').hidden = source !== 'bach';
    $('#row-voicesplayed').hidden = mode !== 'harmonic';
    $('#row-fermatas').hidden = source !== 'bach';
    $('#sel-fixedkey').hidden = settings.keyMode !== 'fixed';
  }

  function applyTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const btn = $('#btn-theme');
    if (btn) {
      btn.textContent = dark ? '☀' : '☾';
      btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    }
  }

  function settingsToUI() {
    radioSet('mode', settings.mode);
    radioSet('source', settings.source);
    radioSet('melodicVoice', settings.melodicVoice);
    radioSet('meter', settings.meter);
    radioSet('establish', settings.establish);
    radioSet('countIn', settings.countIn);
    radioSet('timbre', settings.timbre);
    $$('input[name="voicesPlayed"]').forEach((el) => {
      el.checked = settings.voicesPlayed.includes(Number(el.value));
    });
    $('#sel-keymode').value = settings.keyMode;
    $('#sel-fixedkey').value = settings.fixedKey;
    $('#chk-transpose').checked = settings.transpose;
    $('#chk-fermatas').checked = settings.honorFermatas;
    $('#chk-autoreveal').checked = settings.autoReveal;
    $('#rng-bpm').value = settings.bpm;
    $('#out-bpm').textContent = `${settings.bpm} bpm`;
    $('#rng-gap').value = settings.gapSec;
    $('#out-gap').textContent = `${settings.gapSec} s`;
    $('#out-plays').textContent = settings.plays;
    buildDifficultySeg();
    buildLengthSeg();
    applyVisibility();
  }

  function persist() {
    DS.storage.saveSettings(settings);
    applyVisibility();
  }

  function wireSettings() {
    for (const name of ['mode', 'source', 'melodicVoice', 'meter', 'establish', 'countIn']) {
      $$(`input[name="${name}"]`).forEach((el) =>
        el.addEventListener('change', () => {
          settings[name] = radioGet(name);
          if (name === 'mode' || name === 'source') {
            buildDifficultySeg();
            buildLengthSeg();
          }
          persist();
        })
      );
    }
    $$('input[name="voicesPlayed"]').forEach((el) =>
      el.addEventListener('change', () => {
        const sel = $$('input[name="voicesPlayed"]:checked').map((c) => Number(c.value));
        if (!sel.length) {
          el.checked = true; // never allow zero voices
          return;
        }
        settings.voicesPlayed = sel.sort((a, b) => a - b);
        persist();
      })
    );
    $$('input[name="timbre"]').forEach((el) =>
      el.addEventListener('change', () => {
        settings.timbre = radioGet('timbre');
        if (DS.synth.setTimbre) DS.synth.setTimbre(settings.timbre);
        persist();
      })
    );
    $('#sel-keymode').addEventListener('change', (e) => { settings.keyMode = e.target.value; persist(); });
    $('#sel-fixedkey').addEventListener('change', (e) => { settings.fixedKey = e.target.value; persist(); });
    $('#chk-transpose').addEventListener('change', (e) => { settings.transpose = e.target.checked; persist(); });
    $('#chk-fermatas').addEventListener('change', (e) => { settings.honorFermatas = e.target.checked; persist(); });
    $('#chk-autoreveal').addEventListener('change', (e) => { settings.autoReveal = e.target.checked; persist(); });
    $('#rng-bpm').addEventListener('input', (e) => {
      settings.bpm = Number(e.target.value);
      $('#out-bpm').textContent = `${settings.bpm} bpm`;
      persist();
    });
    $('#rng-gap').addEventListener('input', (e) => {
      settings.gapSec = Number(e.target.value);
      $('#out-gap').textContent = `${settings.gapSec} s`;
      persist();
    });
    $('.stepper .step-dec').addEventListener('click', () => {
      settings.plays = Math.max(1, settings.plays - 1);
      $('#out-plays').textContent = settings.plays;
      persist();
    });
    $('.stepper .step-inc').addEventListener('click', () => {
      settings.plays = Math.min(10, settings.plays + 1);
      $('#out-plays').textContent = settings.plays;
      persist();
    });
  }

  // ---------- presets ----------

  function renderPresets() {
    const sel = $('#sel-preset');
    sel.innerHTML = DS.storage
      .listPresets()
      .map((p) => `<option value="${esc(p.name)}">${esc(p.name)}${p.builtin ? '' : ' ·'}</option>`)
      .join('');
  }

  function wirePresets() {
    $('#btn-apply-preset').addEventListener('click', () => {
      const name = $('#sel-preset').value;
      const preset = DS.storage.listPresets().find((p) => p.name === name);
      if (!preset) return;
      Object.assign(settings, preset.settings);
      DS.storage.normalizeSettings(settings);
      settingsToUI();
      persist();
      banner(`Preset “${name}” applied.`, false);
    });
    $('#btn-save-preset').addEventListener('click', () => {
      const name = $('#inp-preset-name').value.trim();
      if (!name) return banner('Give the preset a name first.');
      DS.storage.savePreset(name, settings);
      $('#inp-preset-name').value = '';
      renderPresets();
      $('#sel-preset').value = name;
      banner(`Preset “${name}” saved.`, false);
    });
  }

  // ---------- givens ----------

  function excerptBars(ex) {
    const total = ex.voices[0].reduce((s, n) => s + n.dur, 0);
    const body = ex.upbeat ? total - ex.upbeat : total;
    return Math.ceil(body / ex.mlen);
  }

  function renderGivens() {
    const el = $('#givens');
    if (!current) {
      el.innerHTML = `<p class="hero-sub">Configure an exercise on the left, then press Start. Key, meter and length are always given — first notes on request.</p>`;
      return;
    }
    const ex = current.excerpt;
    const chips = [];
    chips.push(['Key', prettyKey(ex.key)]);
    chips.push(['Meter', `${ex.num}/${ex.den}`]);
    if (ex.kind === 'harmonic' && ex.source === 'generated') chips.push(['Chords', String(ex.romans.length)]);
    else chips.push(['Bars', `${excerptBars(ex)}${ex.upbeat ? ' + upbeat' : ''}`]);
    chips.push(['Tempo', `${current.settings.bpm}`]);
    let html = chips
      .map(([k, v]) => `<dl class="given"><dt>${k}</dt><dd>${v}</dd></dl>`)
      .join('');

    let firstNote;
    if (ex.voices.length === 1) firstNote = prettyPitch(ex.voices[0].find((n) => n.step >= 0));
    else {
      const b = ex.voices[3].find((n) => n.step >= 0);
      const s = ex.voices[0].find((n) => n.step >= 0);
      firstNote = `B: ${prettyPitch(b)} · S: ${prettyPitch(s)}`;
    }
    html += `<dl class="given peek"><dt>First note</dt><dd id="peek-note" role="button" tabindex="0" title="click to ${current.peeked ? 'hide' : 'peek'}">${current.peeked ? firstNote : '· · ·'}</dd></dl>`;
    el.innerHTML = html;
    const peek = $('#peek-note');
    if (peek) {
      const toggle = () => {
        current.peeked = !current.peeked;
        renderGivens();
      };
      peek.addEventListener('click', toggle);
      peek.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    }
  }

  // ---------- stage hero + transport ----------

  function dots(playsDone, total, nowPlaying) {
    let s = '<div class="play-dots" aria-hidden="true">';
    for (let i = 0; i < total; i++) {
      const cls = i < playsDone - (nowPlaying ? 1 : 0) ? 'done' : i === playsDone - 1 && nowPlaying ? 'now' : '';
      s += `<i class="${cls}"></i>`;
    }
    return s + '</div>';
  }

  function heroHTML(state, info) {
    switch (state) {
      case 'idle':
        return `<div class="hero-state">Ready when you are.</div>
          <p class="hero-sub">The excerpt stays hidden — listen, write, then reveal. <strong>Space</strong> starts.</p>`;
      case 'establishing':
        return `<div class="hero-state hero-live">Establishing the key…</div>
          <p class="hero-sub">I – IV – V⁷ – I, then the tonic alone.</p>`;
      case 'countin':
        return `<div class="hero-state hero-live">Count-in…</div>`;
      case 'playing':
        return `${dots(session.playsDone, session.totalPlays, true)}
          <div class="hero-state hero-live">Playing — ${info.play} of ${info.total}</div>`;
      case 'waiting':
        return `${dots(session.playsDone, session.totalPlays, false)}
          <div class="ring-wrap">
            <svg width="168" height="168" viewBox="0 0 168 168" aria-hidden="true">
              <circle class="ring-track" cx="84" cy="84" r="76"></circle>
              <circle class="ring-fill" id="ring-fill" cx="84" cy="84" r="76" stroke-dasharray="477.5" stroke-dashoffset="0"></circle>
            </svg>
            <div class="ring-num"><span id="ring-sec">–</span><small>write</small></div>
          </div>`;
      case 'finished':
        return `${dots(session.playsDone, session.totalPlays, false)}
          <div class="hero-state">${info.stopped ? 'Stopped.' : 'Write it down.'}</div>
          <p class="hero-sub">Reveal when you're ready${info.stopped ? '' : ' — or play it once more'}.</p>`;
      case 'revealed':
        return `<div class="hero-state">Check your work.</div>
          <p class="hero-sub">Compare against the engraving below, replay voices, then grade yourself.</p>`;
    }
    return '';
  }

  function transportHTML(state) {
    const b = (id, cls, label, title = '') => `<button type="button" id="${id}" class="btn ${cls}" title="${title}">${label}</button>`;
    switch (state) {
      case 'idle':
        return b('t-start', 'primary', 'Start exercise', 'Space');
      case 'establishing':
      case 'countin':
      case 'playing':
        return b('t-stop', 'neutral', 'Stop', 'Space');
      case 'waiting':
        return [
          b('t-skip', 'neutral', 'Skip wait', 'S'),
          b('t-extra', 'ghost', 'Play again now', 'P'),
          b('t-reveal', 'primary', 'Reveal answer', 'R'),
          b('t-stop', 'neutral', 'Stop', ''),
        ].join('');
      case 'finished':
        return [
          b('t-extra', 'ghost', 'Play once more', 'P'),
          b('t-reveal', 'primary', 'Reveal answer', 'R'),
          b('t-new', 'neutral', 'New exercise', 'N'),
        ].join('');
      case 'revealed':
        return [
          b('t-new', 'primary', 'New exercise', 'N'),
          b('t-redo', 'neutral', 'Redo this one', ''),
        ].join('');
    }
    return '';
  }

  function wireTransport() {
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('#t-start', startExercise);
    on('#t-stop', () => session.stop());
    on('#t-skip', () => session.skipGap());
    on('#t-extra', () => session.extraPlay());
    on('#t-reveal', () => session.reveal());
    on('#t-new', startExercise);
    on('#t-redo', () => current && redoExercise({ settings: current.settings, rebuild: current.rebuild }));
  }

  function renderStage(state, info = {}) {
    $('#hero').innerHTML = heroHTML(state, info);
    $('#transport').innerHTML = transportHTML(state);
    wireTransport();
  }

  // ---------- answer ----------

  function shiftDescription(meta) {
    if (!meta || !meta.shift) return '';
    const dir = meta.shift > 0 ? 'up' : 'down';
    const n = Math.abs(meta.shift);
    return ` · transposed ${dir} ${n} semitone${n > 1 ? 's' : ''} from ${meta.originalKey} ${meta.originalMode}`;
  }

  function answerMetaText(ex) {
    if (ex.source === 'bach') {
      const m = ex.meta;
      const modal = m.modal ? ` (${m.modal === 'dor' ? 'dorian' : m.modal === 'phr' ? 'phrygian' : m.modal === 'mix' ? 'mixolydian' : m.modal})` : '';
      return `BWV ${m.bwv} · “${m.title}”${modal}${shiftDescription(m)}`;
    }
    const m = ex.meta;
    return `generated · difficulty ${m.difficulty}${m.cadence ? ` · ${m.cadence}` : ''}${m.seedUsed != null ? ` · seed ${m.seedUsed}` : ''}`;
  }

  function renderAnswerHidden() {
    $('#answer-hidden').hidden = false;
    $('#answer-body').hidden = true;
    $('#answer-meta').textContent = '';
    $('#notation').innerHTML = '';
  }

  function renderAnswer() {
    const ex = current.excerpt;
    $('#answer-hidden').hidden = true;
    $('#answer-body').hidden = false;
    $('#answer-meta').textContent = answerMetaText(ex);

    renderNotation();
    renderStudyControls();
    renderGradeRow();
  }

  // Engrave at the container's real width so abcjs lays the music out at native
  // size and breaks systems to fit, instead of shrinking a fixed-width layout
  // down to ~40% on a phone.
  function renderNotation() {
    if (!current || !current.excerpt) return;
    const host = $('#notation');
    const avail = host.clientWidth || (host.parentElement && host.parentElement.clientWidth) || 320;
    const staffwidth = Math.max(260, Math.min(740, Math.round(avail)));
    const abcStr = DS.abc.fromExcerpt(current.excerpt, { showRomans: current.settings.showRomans });
    host.innerHTML = '';
    window.ABCJS.renderAbc(host, abcStr, {
      responsive: 'resize',
      scale: avail < 480 ? 1 : 1.06,
      paddingleft: 0,
      paddingright: 0,
      paddingtop: 8,
      staffwidth,
      stretchlast: false,
      selectTypes: false,
      add_classes: true,
    });
    current._notationWidth = staffwidth;
  }

  function renderStudyControls() {
    const ex = current.excerpt;
    const el = $('#study-controls');
    current.studyVoices = ex.voices.map(() => true);
    const pills =
      ex.voices.length === 4
        ? `<div class="voice-pills" role="group" aria-label="Voices to replay">${['S', 'A', 'T', 'B']
            .map((v, i) => `<button type="button" class="voice-pill" data-voice="${i}" aria-pressed="true">${v}</button>`)
            .join('')}</div>`
        : '';
    const romansToggle =
      ex.romans && ex.romans.length
        ? `<label class="check" style="margin:0"><input type="checkbox" id="chk-romans" ${current.settings.showRomans ? 'checked' : ''}><span>Roman numerals</span></label>`
        : '';
    el.innerHTML = `
      <button type="button" class="btn-small" id="btn-replay">▶ Replay</button>
      ${pills}
      ${romansToggle}
      <div class="study-right"><span class="hero-sub" style="font-size:12px">replays follow your tempo setting</span></div>`;

    const voiceLevels = () => current.studyVoices.map((on) => (on ? 1 : 0));
    $('#btn-replay').addEventListener('click', () => {
      if (!current.studyVoices.some(Boolean)) return banner('Unmute at least one voice.');
      session.playReveal({ voiceLevels: voiceLevels() });
    });
    $$('.voice-pill').forEach((pill) =>
      pill.addEventListener('click', () => {
        const i = Number(pill.dataset.voice);
        current.studyVoices[i] = !current.studyVoices[i];
        pill.setAttribute('aria-pressed', String(current.studyVoices[i]));
        // take effect immediately, even mid-replay
        DS.synth.setVoiceLevel(i, current.studyVoices[i] ? 1 : 0);
      })
    );
    const chkRomans = $('#chk-romans');
    if (chkRomans)
      chkRomans.addEventListener('change', (e) => {
        current.settings.showRomans = e.target.checked;
        settings.showRomans = e.target.checked;
        persist();
        renderAnswer();
      });
  }

  function renderGradeRow() {
    const el = $('#grade-row');
    const grades = [
      ['g-ok', 'Nailed it'],
      ['g-close', 'Close'],
      ['g-missed', 'Missed it'],
    ];
    el.innerHTML =
      `<span class="grade-label">Self-grade</span>` +
      grades.map(([cls, label], i) => `<button type="button" class="${cls}" data-grade="${i}">${label}</button>`).join('');
    $$('#grade-row button').forEach((btn) =>
      btn.addEventListener('click', () => {
        const grade = Number(btn.dataset.grade);
        DS.storage.updateHistory(current.historyId, { grade });
        $$('#grade-row button').forEach((b) => b.classList.remove('chosen'));
        btn.classList.add('chosen');
        renderHistory();
        renderStatsChip();
      })
    );
  }

  // ---------- history ----------

  function historyLabel(h) {
    const s = h.settings;
    const what = `${s.mode === 'harmonic' ? 'Harmonic' : 'Melodic'} · ${s.source === 'bach' ? 'Bach' : `Gen. D${s.difficulty}`}`;
    return what;
  }

  function renderHistory() {
    const list = DS.storage.listHistory();
    const el = $('#history-list');
    $('#history-empty').hidden = list.length > 0;
    el.innerHTML = list
      .slice(0, 40)
      .map(
        (h) => `<li>
          <span class="h-dot ${h.grade != null ? `g${h.grade}` : ''}"></span>
          <span class="h-what">${esc(historyLabel(h))}</span>
          <span class="h-detail">${esc(h.detail || '')}</span>
          <span class="h-when">${timeAgo(h.ts)}</span>
          <button type="button" class="btn-small" data-redo="${h.id}">Redo</button>
        </li>`
      )
      .join('');
    $$('#history-list [data-redo]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const h = DS.storage.listHistory().find((x) => String(x.id) === btn.dataset.redo);
        if (h) redoExercise(h);
      })
    );
  }

  function renderStatsChip() {
    const stats = DS.storage.stats();
    let n = 0;
    let ok = 0;
    for (const k of Object.keys(stats)) {
      n += stats[k].n;
      ok += stats[k].grades[0];
    }
    $('#stats-chip').textContent = n ? `${n} graded · ${Math.round((ok / n) * 100)}% nailed` : '';
  }

  // ---------- exercise lifecycle ----------

  function buildExcerpt(s, rebuild) {
    if (rebuild && rebuild.type === 'bach') {
      return DS.excerpt.fromBach(DS.rng.create(1), {
        mode: s.mode,
        melodicVoice: s.melodicVoice,
        fixed: rebuild.fixed,
      });
    }
    if (rebuild && rebuild.type === 'generated') {
      return DS.excerpt.fromGenerated(DS.rng.create(rebuild.seed), { ...s, seed: rebuild.seed });
    }
    if (s.source === 'bach') {
      const ex = DS.excerpt.fromBach(DS.rng.create(DS.rng.newSeed()), s);
      return ex;
    }
    const seed = DS.rng.newSeed();
    return DS.excerpt.fromGenerated(DS.rng.create(seed), { ...s, seed });
  }

  function detailFor(ex) {
    if (ex.source === 'bach') return `${prettyKeyPlain(ex.key)} · BWV ${ex.meta.bwv}`;
    return `${prettyKeyPlain(ex.key)} · seed ${ex.meta.seedUsed}`;
  }
  function prettyKeyPlain(key) {
    return `${T.name(key.tonic).replace('#', '♯').replace('b', '♭')} ${key.mode}`;
  }

  function startExercise() {
    const s = { ...settings };
    let excerpt;
    try {
      excerpt = buildExcerpt(s, null);
    } catch (e) {
      console.error(e);
      excerpt = null;
    }
    if (!excerpt) return banner('Could not build an exercise with these settings — try loosening them.');

    const rebuild =
      excerpt.source === 'bach'
        ? {
            type: 'bach',
            fixed: {
              choraleId: excerpt.meta.choraleId,
              s: excerpt.meta.span[0],
              e: excerpt.meta.span[1],
              shift: excerpt.meta.shift,
            },
          }
        : { type: 'generated', seed: excerpt.meta.seedUsed };

    launch(excerpt, s, rebuild);
  }

  function redoExercise(h) {
    const s = { ...settings, ...h.settings };
    let excerpt;
    try {
      excerpt = buildExcerpt(s, h.rebuild);
    } catch (e) {
      console.error(e);
      excerpt = null;
    }
    if (!excerpt) return banner('Could not rebuild that exercise.');
    Object.assign(settings, h.settings);
    settingsToUI();
    launch(excerpt, s, h.rebuild);
  }

  function launch(excerpt, s, rebuild) {
    current = { excerpt, settings: s, rebuild, revealed: false, peeked: false, studyVoices: null };
    current.historyId = Date.now() + Math.floor(Math.random() * 999);
    DS.storage.pushHistory({
      id: current.historyId,
      ts: Date.now(),
      settings: {
        mode: s.mode, source: s.source, difficulty: s.difficulty, length: s.length,
        harmonicPhrases: s.harmonicPhrases,
        keyMode: s.keyMode, fixedKey: s.fixedKey, meter: s.meter, melodicVoice: s.melodicVoice,
        transpose: s.transpose, pickup: s.pickup,
      },
      rebuild,
      detail: detailFor(excerpt),
      grade: null,
    });
    renderHistory();
    renderGivens();
    renderAnswerHidden();
    session.start(excerpt, s);
  }

  // ---------- countdown ----------

  function onGapTick({ remaining, gapSec }) {
    const fill = $('#ring-fill');
    const num = $('#ring-sec');
    if (!fill || !num) return;
    const frac = Math.max(0, Math.min(1, remaining / gapSec));
    fill.style.strokeDashoffset = String(477.5 * (1 - frac));
    fill.classList.toggle('urgent', remaining <= 5.2);
    num.textContent = String(Math.ceil(remaining));
  }

  // ---------- keyboard ----------

  function wireKeyboard() {
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'select', 'textarea', 'button'].includes(tag)) return;
      if ($('#dlg-about').open) return;
      const state = session.state;
      if (e.code === 'Space') {
        e.preventDefault();
        if (state === 'idle' || state === 'revealed' || state === 'finished') startExercise();
        else session.stop();
      } else if (e.key === 'p' || e.key === 'P') session.extraPlay();
      else if (e.key === 's' || e.key === 'S') session.skipGap();
      else if ((e.key === 'r' || e.key === 'R') && state !== 'idle') session.reveal();
      else if (e.key === 'n' || e.key === 'N') startExercise();
    });
  }

  // ---------- init ----------

  DS.ui = {
    init() {
      settings = DS.storage.loadSettings();
      session = DS.session.create();
      if (DS.synth.setTimbre) DS.synth.setTimbre(settings.timbre);

      buildFixedKeyOptions();
      settingsToUI();
      wireSettings();
      renderPresets();
      wirePresets();
      renderGivens();
      renderStage('idle');
      renderHistory();
      renderStatsChip();
      wireKeyboard();

      // Re-engrave the answer when the usable width changes (rotate, resize).
      // Width-gated so mobile address-bar height changes don't trigger work.
      let resizeT = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeT);
        resizeT = setTimeout(() => {
          if (!current || !current.revealed) return;
          const avail = Math.max(260, Math.min(740, Math.round($('#notation').clientWidth || 0)));
          if (Math.abs(avail - (current._notationWidth || 0)) > 8) renderNotation();
        }, 160);
      });

      $('#btn-about').addEventListener('click', () => $('#dlg-about').showModal());
      applyTheme(settings.theme);
      $('#btn-theme').addEventListener('click', () => {
        settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
        applyTheme(settings.theme);
        persist();
      });
      $('#btn-clear-history').addEventListener('click', () => {
        DS.storage.clearHistory();
        renderHistory();
        renderStatsChip();
      });

      session.on('state', (info) => {
        renderStage(info.state, info);
        if (info.state === 'revealed' && !current.revealed) {
          current.revealed = true;
          renderAnswer();
          $('#answer-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        if (info.state === 'waiting') onGapTick({ remaining: info.remaining, gapSec: info.gapSec });
      });
      session.on('gapTick', onGapTick);

      if (DS.storage.isDegraded())
        banner('Browser storage is unavailable — settings and history will not survive a reload.', false);
    },
  };
})();
