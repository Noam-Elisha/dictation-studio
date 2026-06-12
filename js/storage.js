// localStorage persistence with graceful degradation: if storage is
// unavailable (file:// quirks, private mode, quota) everything keeps working
// in memory for the session.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});

  const KEYS = {
    settings: 'ds.settings.v1',
    presets: 'ds.presets.v1',
    history: 'ds.history.v1',
  };

  const memory = {};
  let degraded = false;

  function read(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      degraded = true;
      return key in memory ? memory[key] : fallback;
    }
  }

  function write(key, value) {
    memory[key] = value;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      degraded = true;
    }
  }

  const DEFAULT_SETTINGS = {
    mode: 'harmonic', // melodic | harmonic
    source: 'bach', // bach | generated
    difficulty: 2,
    keyMode: 'any', // any | major | minor | fixed
    fixedKey: 'C major',
    length: 'medium', // short | medium | long (bach phrases, melodic bars)
    harmonicPhrases: 2, // generated harmonic: number of phrases (1-4)
    meter: 'any', // any | 4/4 | 3/4  (melodic)
    melodicVoice: 'soprano', // soprano | bass (bach melodic)
    transpose: true, // bach: random transposition
    pickup: false, // generated melodic upbeat
    bpm: 60,
    plays: 3,
    gapSec: 30,
    establish: 'first', // off | first | every
    countIn: 'off', // off | first | every
    honorFermatas: true,
    voicesPlayed: [0, 1, 2, 3], // indices into S,A,T,B
    timbre: 'piano', // piano (sampled) | synth
    autoReveal: false,
    showFirstNote: false,
    showRomans: true,
    voiceLevels: [1, 0.85, 0.85, 1],
  };

  // Old builds stored voicesPlayed as a string; normalize to an index array.
  const VOICES_FROM_STRING = { all: [0, 1, 2, 3], outer: [0, 3], soprano: [0], bass: [3] };
  function normalizeSettings(s) {
    if (typeof s.voicesPlayed === 'string') s.voicesPlayed = VOICES_FROM_STRING[s.voicesPlayed] || [0, 1, 2, 3];
    if (!Array.isArray(s.voicesPlayed) || !s.voicesPlayed.length)
      s.voicesPlayed = [0, 1, 2, 3];
    s.voicesPlayed = s.voicesPlayed.filter((i) => i >= 0 && i < 4);
    if (!s.voicesPlayed.length) s.voicesPlayed = [0, 1, 2, 3];
    return s;
  }

  const BUILTIN_PRESETS = [
    {
      name: 'Exam simulation',
      builtin: true,
      settings: { plays: 3, gapSec: 45, establish: 'first', countIn: 'off', autoReveal: false, honorFermatas: true },
    },
    {
      name: 'Quick drill',
      builtin: true,
      settings: { plays: 2, gapSec: 10, establish: 'first', countIn: 'first', autoReveal: true },
    },
  ];

  function loadSettings() {
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) });
  }

  function saveSettings(settings) {
    write(KEYS.settings, settings);
  }

  function listPresets() {
    return BUILTIN_PRESETS.concat(read(KEYS.presets, []));
  }

  function savePreset(name, settings) {
    const presets = read(KEYS.presets, []).filter((p) => p.name !== name);
    presets.push({ name, settings: { ...settings } });
    write(KEYS.presets, presets);
  }

  function deletePreset(name) {
    write(KEYS.presets, read(KEYS.presets, []).filter((p) => p.name !== name));
  }

  const HISTORY_CAP = 200;

  // entry: {id, ts, label, settings, rebuild, grade, plays, extras}
  function pushHistory(entry) {
    const history = read(KEYS.history, []);
    history.unshift(entry);
    write(KEYS.history, history.slice(0, HISTORY_CAP));
    return entry.id;
  }

  function listHistory() {
    return read(KEYS.history, []);
  }

  function updateHistory(id, patch) {
    const history = read(KEYS.history, []);
    const e = history.find((h) => h.id === id);
    if (e) Object.assign(e, patch);
    write(KEYS.history, history);
  }

  function clearHistory() {
    write(KEYS.history, []);
  }

  function stats() {
    const out = {};
    for (const h of listHistory()) {
      if (h.grade == null) continue;
      const key = `${h.settings.mode}/${h.settings.source}`;
      out[key] = out[key] || { n: 0, grades: [0, 0, 0] };
      out[key].n++;
      out[key].grades[h.grade]++;
    }
    return out;
  }

  DS.storage = {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
    listPresets,
    savePreset,
    deletePreset,
    pushHistory,
    listHistory,
    updateHistory,
    clearHistory,
    stats,
    normalizeSettings,
    isDegraded: () => degraded,
  };
})();
