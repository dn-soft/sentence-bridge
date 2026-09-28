/* 문장 다리 — 문항 → 코스 만들기 (문장 다리, 낱말 풍선)
 * 사람 손 없이 모든 단원 파일에서 같은 규칙으로 만든다. 검증 도구(tools/validate.mjs)도 이 파일을 그대로 쓴다.
 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  var C = SB.content = {};

  C.MAX_BLOCK_TOKENS = 6;    // 한 다리에서 밟아야 하는 블록 수 최대 (넘으면 앞부분을 미리 놓아 준다)
  C.BRIDGES_PER_COURSE = 4;  // 한 판의 문장 다리 수
  C.WORDS_PER_COURSE = 6;    // 한 판의 낱말 풍선 관문 수 (3·4학년)
  // 5·6학년은 문장이 길어 다리 하나가 오래 걸리므로 낱말 관문을 하나 줄여 한 판을 3~5분에 맞춘다
  C.wordsPerCourse = function (grade) { return grade >= 5 ? 5 : C.WORDS_PER_COURSE; };
  C.OPTIONS_PER_WORD = 3;    // 낱말 관문 풍선 수 (정답 1 + 오답 2)

  // 비교용 정규화: 소문자, 앞뒤 문장부호 제거 (가운데 ' - : 는 둔다)
  C.norm = function (w) {
    return String(w).toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  };
  // 복수형·같은 말 거르기용 뿌리
  C.stem = function (w) {
    var n = C.norm(w).replace(/[^a-z0-9]/g, '');
    if (n.length > 4 && /ies$/.test(n)) return n.slice(0, -3) + 'y';
    if (n.length > 3 && /(ses|xes|ches|shes)$/.test(n)) return n.slice(0, -2);
    if (n.length > 2 && /s$/.test(n) && !/ss$/.test(n)) return n.slice(0, -1);
    return n;
  };

  // 문장 → 블록 낱말들. 마지막 마침표·물음표·느낌표는 블록에서 빼고 다리 끝에 붙인다.
  C.tokenize = function (en) {
    var raw = String(en).trim().split(/\s+/).filter(Boolean);
    var end = '';
    if (raw.length) {
      var last = raw[raw.length - 1];
      // U.S. / U.K. / p.m. 같은 줄임말은 마침표가 낱말의 일부 → 그대로 둔다
      if (!ABBR.test(last)) {
        var m = last.match(/^(.*?)([.?!]+)$/);
        if (m && m[1].length) { raw[raw.length - 1] = m[1]; end = m[2]; }
      }
    }
    return { tokens: raw, end: end };
  };

  // 문장 안의 낱말을 오답 블록 후보 모양으로 (대문자는 고유명사·I만 유지)
  var ABBR = /^([A-Za-z]\.){2,}[?!]?$/;
  function distractorForm(tok, isFirst) {
    var t0 = String(tok).replace(/[?!,]+$/, '');
    var w = ABBR.test(t0) ? t0 : String(tok).replace(/^["'(]+|["'),.?!:;]+$/g, '');
    if (!w) return '';
    var isI = /^I($|'[a-z]+$)/.test(w);
    var cap = /^[A-Z]/.test(w);
    if (cap && !isI && isFirst) w = w.charAt(0).toLowerCase() + w.slice(1);
    return w;
  }

  function koKey(ko) { return String(ko || '').replace(/[\s.,?!~]/g, ''); }

  function uniqueBy(arr, keyFn) {
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      var k = keyFn(arr[i]);
      if (!k || seen[k]) continue;
      seen[k] = 1; out.push(arr[i]);
    }
    return out;
  }

  // 단원 안에서 쓸 수 있는 문장·낱말 목록
  C.unitPools = function (stage) {
    var items = stage.items || [];
    var sentences = uniqueBy(items.filter(function (i) { return i.t === 's' && C.tokenize(i.en).tokens.length >= 2; }), function (i) { return C.norm(i.en.replace(/\s+/g, '_')); });
    var words = uniqueBy(items.filter(function (i) { return i.t === 'w' && C.norm(i.en); }), function (i) { return C.norm(i.en); });
    // 한 낱말짜리 "sentence"는 낱말로 쓴다
    items.forEach(function (i) {
      if (i.t === 's' && C.tokenize(i.en).tokens.length < 2 && !words.some(function (w) { return C.norm(w.en) === C.norm(i.en); })) words.push(i);
    });
    // 오답 블록 후보: 다른 문장의 낱말 (어느 문장에서 왔는지 같이 기억 → 뜻이 같은 문장의 낱말은 뺄 수 있게)
    var tokenPool = [];
    sentences.forEach(function (s) {
      s.en.trim().split(/\s+/).forEach(function (t, idx) {
        var f = distractorForm(t, idx === 0);
        if (f) tokenPool.push({ w: f, ko: koKey(s.ko), img: s.img || '' });
      });
    });
    words.forEach(function (w) { if (!/\s/.test(w.en)) tokenPool.push({ w: distractorForm(w.en, true), ko: koKey(w.ko), img: w.img || '' }); });
    return { sentences: sentences, words: words, tokenPool: tokenPool };
  };

  // 문장 다리 한 개
  C.makeBridge = function (item, pools, rand, grade) {
    var tk = C.tokenize(item.en);
    var all = tk.tokens.slice();
    var given = [];
    var tokens = all;
    if (all.length > C.MAX_BLOCK_TOKENS) {
      given = all.slice(0, all.length - C.MAX_BLOCK_TOKENS);
      tokens = all.slice(given.length);
    }
    var bad = {};
    all.forEach(function (t) { bad[C.norm(t)] = 1; bad[C.stem(t)] = 1; });
    var hasDigit = /\d/.test(item.en);
    var myKo = koKey(item.ko), myImg = item.img || '';
    // 뜻이 같거나 그림이 같은 문장(예: Hi, everyone. / Hello, everyone. 둘 다 "모두 안녕.")의 낱말은 오답으로 쓰지 않는다
    var sameMeaning = {};
    pools.tokenPool.forEach(function (e) { if ((myKo && e.ko === myKo) || (myImg && e.img === myImg)) sameMeaning[C.norm(e.w)] = 1; });
    var cands = uniqueBy(pools.tokenPool.map(function (e) { return e.w; }), function (t) { return C.norm(t); }).filter(function (w) {
      var n = C.norm(w);
      if (!n || bad[n] || bad[C.stem(w)] || sameMeaning[n]) return false;
      if (/\d/.test(n) && !hasDigit) return false;
      return true;
    });
    var nd = (grade >= 5 && tokens.length <= 4) ? 2 : 1;
    // 길이가 비슷한 후보를 먼저 (너무 뻔한 오답을 줄인다)
    var avg = tokens.reduce(function (s, t) { return s + t.length; }, 0) / Math.max(1, tokens.length);
    cands = SB.shuffle(cands, rand).sort(function (a, b) { return Math.abs(a.length - avg) - Math.abs(b.length - avg); });
    var near = cands.slice(0, Math.max(nd, 6));
    var distractors = SB.shuffle(near, rand).slice(0, nd);
    if (!distractors.length) {
      // 후보가 없으면 단원 낱말에서
      var ws = pools.words.map(function (w) { return distractorForm(w.en, true); }).filter(function (w) { return w && !bad[C.norm(w)] && !/\s/.test(w); });
      distractors = SB.shuffle(ws, rand).slice(0, nd);
    }
    return {
      type: 'bridge', id: item.id, en: item.en, ko: item.ko, img: item.img, aud: item.aud, ms: item.ms || 0,
      tokens: tokens, given: given, end: tk.end, distractors: distractors,
    };
  };

  // 낱말 풍선 관문 한 개
  C.makeWordGate = function (item, pools, rand) {
    var n = C.norm(item.en), st = C.stem(item.en);
    var cands = pools.words.filter(function (w) {
      if (w === item) return false;
      if (C.norm(w.en) === n || C.stem(w.en) === st) return false;
      if (w.img && item.img && w.img === item.img) return false;
      if (w.aud && item.aud && w.aud === item.aud) return false;
      if (w.ko && item.ko && w.ko.replace(/\s/g, '') === item.ko.replace(/\s/g, '')) return false;
      return true;
    });
    cands = SB.shuffle(cands, rand);
    var wrong = cands.slice(0, C.OPTIONS_PER_WORD - 1).map(function (w) { return w.en; });
    var options = SB.shuffle([item.en].concat(wrong), rand);
    return {
      type: 'word', id: item.id, en: item.en, ko: item.ko, img: item.img, aud: item.aud, ms: item.ms || 0,
      options: options, answer: item.en,
    };
  };

  C.courseCount = function (stage) {
    var p = C.unitPools(stage);
    return Math.max(1, Math.ceil(p.sentences.length / C.BRIDGES_PER_COURSE), Math.ceil(p.words.length / C.wordsPerCourse(stage.grade)));
  };

  // 코스 k: 단원의 문장·낱말을 섞은 뒤 차례로 잘라 쓴다 → 여러 번 하면 단원 전체를 돈다
  C.buildCourse = function (stage, k) {
    var pools = C.unitPools(stage);
    var base = SB.rng(SB.hash(stage.id));
    var sents = SB.shuffle(pools.sentences, base);
    var words = SB.shuffle(pools.words, base);
    var nC = C.courseCount(stage);
    k = ((k | 0) % nC + nC) % nC;
    var rand = SB.rng(SB.hash(stage.id + ':' + k));
    var nb = Math.min(C.BRIDGES_PER_COURSE, sents.length);
    var WPC = C.wordsPerCourse(stage.grade);
    var nw = Math.min(WPC, words.length);
    var bridges = [], gates = [];
    for (var i = 0; i < nb; i++) bridges.push(C.makeBridge(sents[(k * C.BRIDGES_PER_COURSE + i) % sents.length], pools, rand, stage.grade));
    for (var j = 0; j < nw; j++) gates.push(C.makeWordGate(words[(k * WPC + j) % words.length], pools, rand));
    // 순서: 낱말 관문을 다리 앞마다 고르게 나눠 넣는다 (예: 낱말 → 다리 → 낱말 낱말 → 다리 …)
    // 슬롯(다리 앞) 채우는 순서: 2번째, 4번째, 1번째, 3번째 … → 4다리·6낱말이면 [1,2,1,2]
    var seq = [];
    var per = [];
    for (var b = 0; b < Math.max(1, nb); b++) per.push(0);
    for (var q = 0; q < nw; q++) per[[1, 3, 0, 2][q % 4] % per.length]++;
    var gi = 0;
    for (var s = 0; s < Math.max(nb, 1); s++) {
      for (var c = 0; c < per[s] && gi < gates.length; c++) seq.push(gates[gi++]);
      if (bridges[s]) seq.push(bridges[s]);
    }
    while (gi < gates.length) seq.push(gates[gi++]);
    return { stageId: stage.id, grade: stage.grade, index: k, count: nC, sequence: seq, bridges: bridges.length, words: gates.length };
  };

  // 블록 낱말이 이번에 밟아야 할 낱말과 같은가 (같은 글자 블록은 서로 바꿔도 된다)
  C.sameToken = function (a, b) { return String(a) === String(b); };

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
