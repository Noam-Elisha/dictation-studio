// Seeded PRNG (mulberry32) + sampling helpers. Deterministic exercises:
// the same seed always reproduces the same generated material.
(function () {
  'use strict';
  const DS = (window.DS = window.DS || {});

  function create(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function int(rng, lo, hi) {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  // pairs: [[value, weight], ...]
  function weighted(rng, pairs) {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let roll = rng() * total;
    for (const [v, w] of pairs) {
      roll -= w;
      if (roll < 0) return v;
    }
    return pairs[pairs.length - 1][0];
  }

  function shuffle(rng, arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function newSeed() {
    return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  }

  DS.rng = { create, int, pick, weighted, shuffle, newSeed };
})();
