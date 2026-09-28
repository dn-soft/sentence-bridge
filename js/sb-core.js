/* 문장 다리 — 공통 도구 (브라우저와 Node 검증 도구가 함께 쓴다) */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  SB.VERSION = '1.0.0';

  // 씨앗이 있는 난수 (같은 씨앗이면 같은 결과 → 같은 코스, 같은 검증)
  SB.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  SB.hash = function (str) {
    var h = 2166136261;
    str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  SB.shuffle = function (arr, rand) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  SB.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  SB.lerp = function (a, b, t) { return a + (b - a) * t; };
  SB.approach = function (v, target, delta) {
    if (v < target) return Math.min(v + delta, target);
    if (v > target) return Math.max(v - delta, target);
    return v;
  };
  SB.ease = {
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };

  // 데이터 파일(data/*.js)이 부르는 등록 함수
  SB.stages = SB.stages || {};
  SB.catalog = SB.catalog || null;
  SB.registerStage = function (s) { SB.stages[s.id] = s; if (SB.onStage) SB.onStage(s); };
  SB.registerCatalog = function (c) { SB.catalog = c; if (SB.onCatalog) SB.onCatalog(c); };

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
