// Practice session state machine.
// idle -> (establish) -> (countin) -> playing(k of N) -> waiting(gap) -> ...
//      -> finished -> revealed
// planPhases() is pure (Node-tested); run() drives timers + audio.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});

  function planPhases({ plays, establish, countIn, autoReveal }) {
    const phases = [];
    for (let k = 0; k < plays; k++) {
      if ((establish === 'first' && k === 0) || establish === 'every') phases.push('establish');
      if ((countIn === 'first' && k === 0) || countIn === 'every') phases.push('countin');
      phases.push('play');
      if (k < plays - 1) phases.push('gap');
    }
    if (autoReveal) {
      phases.push('gap');
      phases.push('reveal');
    }
    return phases;
  }

  function create() {
    const session = {
      state: 'idle',
      excerpt: null,
      settings: null,
      playsDone: 0,
      extraPlays: 0,
      totalPlays: 0,
      listeners: {},
      _phaseQueue: [],
      _player: null,
      _active: null,
      _gapTimer: null,
      _gapDeadline: 0,
    };

    function emit(name, payload) {
      (session.listeners[name] || []).forEach((fn) => fn(payload));
    }

    session.on = function (name, fn) {
      (session.listeners[name] = session.listeners[name] || []).push(fn);
      return session;
    };

    function setState(state, info = {}) {
      session.state = state;
      emit('state', { state, ...info });
    }

    function clearGap() {
      if (session._gapTimer) {
        clearInterval(session._gapTimer);
        session._gapTimer = null;
      }
    }

    function stopAudio() {
      if (session._active) {
        session._active.stop();
        session._active = null;
      }
    }

    function playSegment(events, totalSec, after) {
      session._active = session._player.play(events, totalSec, {
        onDone: () => {
          session._active = null;
          after();
        },
      });
    }

    function nextPhase() {
      const phase = session._phaseQueue.shift();
      if (!phase) {
        setState('finished', { plays: session.playsDone, total: session.totalPlays });
        return;
      }
      const s = session.settings;
      const ex = session.excerpt;

      if (phase === 'establish') {
        setState('establishing');
        const { events, totalSec } = DS.synth.buildCadenceEvents(ex.key);
        playSegment(events, totalSec, () => setTimeout(nextPhase, 700));
        return;
      }
      if (phase === 'countin') {
        setState('countin');
        const { events, totalSec } = DS.synth.buildCountInEvents(ex.num, s.bpm);
        playSegment(events, totalSec, nextPhase);
        return;
      }
      if (phase === 'play') {
        session.playsDone++;
        setState('playing', { play: session.playsDone, total: session.totalPlays });
        const { events, totalSec } = DS.synth.buildExcerptEvents(ex, {
          bpm: s.bpm,
          honorFermatas: s.honorFermatas,
          voicesPlayed: voicesPlayedFor(ex, s),
        });
        playSegment(events, totalSec, () => setTimeout(nextPhase, 350));
        return;
      }
      if (phase === 'gap') {
        setState('waiting', {
          play: session.playsDone,
          total: session.totalPlays,
          remaining: s.gapSec,
          gapSec: s.gapSec,
        });
        session._gapDeadline = Date.now() + s.gapSec * 1000;
        clearGap();
        session._gapTimer = setInterval(() => {
          const remaining = Math.max(0, (session._gapDeadline - Date.now()) / 1000);
          emit('gapTick', { remaining, gapSec: s.gapSec });
          if (remaining <= 0) {
            clearGap();
            nextPhase();
          }
        }, 200);
        return;
      }
      if (phase === 'reveal') {
        session.reveal();
        return;
      }
      nextPhase();
    }

    function voicesPlayedFor(ex, s) {
      if (ex.voices.length === 1) return [0];
      const vp = Array.isArray(s.voicesPlayed) ? s.voicesPlayed.filter((i) => i >= 0 && i < 4) : null;
      return vp && vp.length ? vp : [0, 1, 2, 3];
    }

    session.start = function (excerpt, settings) {
      session.stop(true);
      session.excerpt = excerpt;
      session.settings = settings;
      session.playsDone = 0;
      session.extraPlays = 0;
      session.totalPlays = settings.plays;
      session._player = DS.synth.createPlayer();
      session._phaseQueue = planPhases(settings);
      DS.synth.ensureContext();
      // clear any per-voice muting left over from a previous study replay
      for (let i = 0; i < 4; i++) DS.synth.setVoiceLevel(i, 1);
      nextPhase();
    };

    session.stop = function (silent) {
      clearGap();
      stopAudio();
      session._phaseQueue = [];
      if (!silent && session.excerpt) setState('finished', { stopped: true, plays: session.playsDone, total: session.totalPlays });
    };

    session.skipGap = function () {
      if (session.state !== 'waiting') return;
      clearGap();
      nextPhase();
    };

    session.extraPlay = function () {
      if (!session.excerpt || session.state === 'idle') return;
      if (session.state === 'playing' || session.state === 'establishing' || session.state === 'countin') return;
      clearGap();
      session.extraPlays++;
      session.totalPlays++;
      session._phaseQueue.unshift('play');
      nextPhase();
    };

    session.reveal = function () {
      if (!session.excerpt) return;
      clearGap();
      stopAudio();
      session._phaseQueue = [];
      setState('revealed', { plays: session.playsDone, extras: session.extraPlays });
    };

    // Post-reveal study playback. Every voice is scheduled and muting is done
    // by the live per-voice gains, so toggling S/A/T/B mid-replay is heard at
    // once (see DS.synth.setVoiceLevel).
    session.playReveal = function (opts = {}) {
      const ex = session.excerpt;
      if (!ex) return;
      stopAudio();
      const levels = opts.voiceLevels || [1, 1, 1, 1];
      for (let i = 0; i < 4; i++) DS.synth.setVoiceLevel(i, levels[i]);
      const { events, totalSec } = DS.synth.buildExcerptEvents(ex, {
        bpm: opts.bpm || session.settings.bpm,
        honorFermatas: session.settings.honorFermatas,
      });
      session._player = session._player || DS.synth.createPlayer();
      setState('revealed', { replaying: true });
      playSegment(events, totalSec, () => setState('revealed', { replaying: false }));
    };

    // Stop a study replay without leaving the revealed view.
    session.stopReveal = function () {
      stopAudio();
      if (session.state === 'revealed') setState('revealed', { replaying: false });
    };

    session.toIdle = function () {
      session.stop(true);
      session.excerpt = null;
      setState('idle');
    };

    return session;
  }

  DS.session = { planPhases, create };
})();
