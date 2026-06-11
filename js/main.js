// Boot: sanity-check dependencies, then hand over to the UI.
(function () {
  'use strict';

  function fatal(msg) {
    const el = document.getElementById('banner');
    if (el) {
      el.textContent = msg;
      el.hidden = false;
      el.style.borderColor = 'var(--missed)';
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (!window.DS_CHORALES || !window.DS_CHORALES.list || !window.DS_CHORALES.list.length) {
      fatal('Chorale data failed to load (js/data/chorales-data.js missing?). Generated exercises may still work.');
    }
    if (!window.ABCJS) {
      fatal('Notation library failed to load (js/vendor/abcjs-basic-min.js missing). Answers cannot be engraved.');
      return;
    }
    try {
      window.DS.ui.init();
    } catch (e) {
      console.error(e);
      fatal(`Something went wrong while starting the app: ${e.message}`);
    }
  });
})();
