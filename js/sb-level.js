/* 문장 다리 — 코스 → 맵 만들기
 *
 * 퀴즈를 건너뛸 수 없게 하는 모양 (tools/validate.mjs 가 모든 코스·캐릭터로 확인):
 *  - 문장 다리 구덩이 폭은 가장 멀리 뛰는 점프보다 넉넉히 넓다 (MIN_PIT).
 *  - 다리 판자는 문장이 다 맞기 전에는 밟을 수 없다(유령 판자).
 *  - 낱말 블록은 밟는 순간 반응한다: 정답이면 날아가 판자가 되고, 오답이면 발이 빠진다 → 블록을 발판 삼아 뛸 수 없다.
 *  - 낱말 관문의 그림 벽은 가장 높은 점프보다 높다. 정답 풍선만 벽 너머로 데려다준다.
 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  var L = SB.level = {};

  L.G = 144;            // 땅 높이 (월드 y, 아래로 증가)
  L.MIN_PIT = 144;      // 다리 구덩이 최소 폭 (최대 점프 거리 약 84px + 여유)
  L.WALL_H = 104;       // 그림 벽 높이 (최대 점프 높이 약 74px + 여유)
  L.WALL_W = 80;
  L.BLOCK_H = 14;
  L.BLOCK_TOP = L.G - 52; // 블록 윗면 (밑으로 걸어 다닐 수 있고, 밑에서 뛰면 통과해 올라선다)
  L.BLOCK_GAP = 18;
  L.PLANK_H = 8;

  function textW(t) { return SB.font.measure(t); }
  function even(n) { return Math.ceil(n / 2) * 2; }

  L.build = function (course, seed) {
    var G = L.G;
    var rand = SB.rng((seed >>> 0) || SB.hash(course.stageId + '#' + course.index));
    var lv = {
      G: G, stageId: course.stageId, grade: course.grade, courseIndex: course.index,
      solids: [], oneWays: [], pits: [], challenges: [], stars: [], deco: [], signs: [],
      spawn: { x: 44, y: G }, goal: null, width: 0,
    };
    function ground(x0, x1, y) { if (x1 > x0) lv.solids.push({ kind: 'ground', x: x0, y: y === undefined ? G : y, w: x1 - x0, h: 400 }); }
    function pit(x0, x1, kind) { lv.pits.push({ x0: x0, x1: x1, respawnX: x0 - 22, kind: kind }); }
    function decoRun(x0, x1) {
      for (var x = x0 + 8; x < x1 - 8; x += 10 + Math.floor(rand() * 26)) {
        var r = rand();
        lv.deco.push({ kind: r < 0.45 ? 'grass' : r < 0.7 ? 'flower' : r < 0.85 ? 'stone' : 'mushroom', x: x, y: G, v: Math.floor(rand() * 4) });
      }
    }
    function starArc(x0, x1, y, n) {
      for (var i = 0; i < n; i++) {
        var t = n === 1 ? 0.5 : i / (n - 1);
        lv.stars.push({ x: SB.lerp(x0, x1, t), y: y - Math.sin(Math.PI * t) * 18, taken: false });
      }
    }

    // 왼쪽 끝 벽
    lv.solids.push({ kind: 'bound', x: -40, y: -2000, w: 40, h: 4000 });
    // 출발
    var x = 0;
    ground(0, 176);
    decoRun(60, 170);
    lv.signs.push({ kind: 'start', x: 84, y: G });
    x = 176;

    function connector(x0, kind) {
      var len;
      if (kind === 'gap') {
        ground(x0, x0 + 56); pit(x0 + 56, x0 + 88, 'gap'); ground(x0 + 88, x0 + 150);
        starArc(x0 + 48, x0 + 96, G - 34, 3);
        decoRun(x0, x0 + 50); decoRun(x0 + 96, x0 + 150);
        return x0 + 150;
      }
      if (kind === 'step') {
        ground(x0, x0 + 150);
        lv.solids.push({ kind: 'step', x: x0 + 44, y: G - 16, w: 64, h: 16 });
        starArc(x0 + 52, x0 + 100, G - 40, 3);
        decoRun(x0, x0 + 40); decoRun(x0 + 110, x0 + 150);
        return x0 + 150;
      }
      if (kind === 'plat') {
        ground(x0, x0 + 176);
        lv.oneWays.push({ kind: 'plat', x: x0 + 56, y: G - 44, w: 64, h: 10 });
        starArc(x0 + 62, x0 + 114, G - 64, 4);
        decoRun(x0, x0 + 176);
        return x0 + 176;
      }
      len = kind === 'long' ? 128 : 88;
      ground(x0, x0 + len);
      decoRun(x0, x0 + len);
      if (kind === 'long') starArc(x0 + 30, x0 + len - 30, G - 26, 3);
      return x0 + len;
    }

    // ------------------------------------------------ 문장 다리
    function bridge(x0, spec, idx) {
      var items = spec.tokens.map(function (t) { return { text: t, token: true }; })
        .concat(spec.distractors.map(function (t) { return { text: t, token: false }; }));
      // 섞기: 정답 순서 그대로 늘어서지 않게
      var order = SB.shuffle(items, rand);
      for (var tries = 0; tries < 6; tries++) {
        var same = order.filter(function (o) { return o.token; }).map(function (o) { return o.text; }).join(' ') === spec.tokens.join(' ');
        if (!same || spec.tokens.length < 2) break;
        order = SB.shuffle(items, rand);
      }
      var sx = x0 + 20;
      lv.signs.push({ kind: 'picture', x: sx, y: G, img: spec.img, ch: idx });
      var bx = x0 + 60;
      var blocks = order.map(function (o) {
        var w = Math.max(28, even(textW(o.text) + 12));
        var b = { kind: 'block', x: bx, y: L.BLOCK_TOP, w: w, h: L.BLOCK_H, text: o.text, token: o.token, state: 'idle', t: 0, passT: 0, hint: false, off: false, ch: idx, hx: bx, hy: L.BLOCK_TOP };
        bx += w + L.BLOCK_GAP;
        return b;
      });
      var rowEnd = bx - L.BLOCK_GAP;
      var pitX0 = Math.max(rowEnd + 36, x0 + 200);
      // 판자: 미리 놓인 낱말(given) + 밟아서 놓을 낱말
      var words = spec.given.concat(spec.tokens);
      var widths = words.map(function (t) { return Math.max(24, even(textW(t) + 10)); });
      var sum = widths.reduce(function (a, b) { return a + b; }, 0) + 2 * (words.length - 1);
      var pitW = Math.max(L.MIN_PIT, sum + 8);
      var scale = (pitW - 2 * (words.length - 1)) / (sum - 2 * (words.length - 1));
      var planks = [];
      var px = pitX0;
      for (var i = 0; i < words.length; i++) {
        var w = i === words.length - 1 ? (pitX0 + pitW - px) : Math.round(widths[i] * scale);
        planks.push({ kind: 'plank', x: px, y: G, w: w, h: L.PLANK_H, text: words[i], given: i < spec.given.length, placed: i < spec.given.length, off: true, ch: idx, lit: 0 });
        px += w + 2;
      }
      ground(x0, pitX0);
      pit(pitX0, pitX0 + pitW, 'bridge');
      var farX = pitX0 + pitW;
      lv.challenges.push({
        type: 'bridge', idx: idx, spec: spec, state: 'waiting', zoneX0: x0 + 16,
        blocks: blocks, planks: planks, pit: { x0: pitX0, x1: farX }, gateX: farX,
        next: 0, stepMistakes: 0, mistakes: 0, idleT: 0, buildT: 0, pendingComplete: false, endPunct: spec.end,
      });
      lv.oneWays.push.apply(lv.oneWays, blocks);
      lv.oneWays.push.apply(lv.oneWays, planks);
      decoRun(x0, x0 + 50);
      ground(farX, farX + 64);
      lv.signs.push({ kind: 'end', x: farX + 10, y: G, text: spec.end, ch: idx });
      decoRun(farX + 16, farX + 64);
      return farX + 64;
    }

    // ------------------------------------------------ 낱말 풍선 관문
    function wordGate(x0, spec, idx) {
      var balloons = [];
      var bxPrev = null, lwPrev = 0;
      var heights = SB.shuffle([0, -12, -5], rand);
      for (var i = 0; i < spec.options.length; i++) {
        var text = spec.options[i];
        var lw = Math.max(30, even(textW(text) + 10));
        var bxc = bxPrev === null ? x0 + 56 + lw / 2 : bxPrev + Math.max(40, lwPrev / 2 + lw / 2 + 18);
        var by = G - 62 + heights[i % heights.length];
        balloons.push({
          kind: 'balloon', x: bxc, y: by, hx: bxc, hy: by, r: 9, lw: lw, text: text, correct: text === spec.answer,
          state: 'idle', t: 0, respawnT: 0, hint: false, color: i, ch: idx,
        });
        bxPrev = bxc; lwPrev = lw;
      }
      var wallX = bxPrev + lwPrev / 2 + 34;
      var wall = { kind: 'wall', x: wallX, y: G - L.WALL_H, w: L.WALL_W, h: L.WALL_H, img: spec.img, ch: idx };
      lv.solids.push(wall);
      ground(x0, wallX + L.WALL_W + 72);
      lv.challenges.push({
        type: 'word', idx: idx, spec: spec, state: 'waiting', zoneX0: x0 + 16,
        balloons: balloons, wall: wall, gateX: wallX + L.WALL_W,
        rideFeetY: wall.y - 20, releaseX: wallX + L.WALL_W + 34, mistakes: 0, idleT: 0,
      });
      decoRun(x0, x0 + 40);
      decoRun(wallX + L.WALL_W + 8, wallX + L.WALL_W + 72);
      return wallX + L.WALL_W + 72;
    }

    var kinds = ['flat', 'gap', 'step', 'plat', 'long'];
    course.sequence.forEach(function (spec, i) {
      var k = i === 0 ? 'flat' : kinds[Math.floor(rand() * kinds.length)];
      x = connector(x, k);
      lv.signs.push({ kind: spec.type === 'bridge' ? 'toBridge' : 'toWord', x: x + 4, y: G });
      x = spec.type === 'bridge' ? bridge(x, spec, i) : wordGate(x, spec, i);
    });
    x = connector(x, 'long');
    // 도착: 별 문
    ground(x, x + 260);
    lv.goal = { x: x + 120, y: G - 64, w: 40, h: 64 };
    decoRun(x, x + 100);
    lv.solids.push({ kind: 'bound', x: x + 260, y: -2000, w: 40, h: 4000 });
    lv.width = x + 260;
    // 맞붙은 땅 조각은 하나로 합친다 (가장자리 테두리가 가운데에 생기지 않게, 충돌 검사도 줄어든다)
    var grounds = lv.solids.filter(function (s) { return s.kind === 'ground'; }).sort(function (a, b) { return a.x - b.x; });
    var merged = [];
    grounds.forEach(function (g) {
      var last = merged[merged.length - 1];
      if (last && g.y === last.y && g.x <= last.x + last.w + 0.5) last.w = Math.max(last.w, g.x + g.w - last.x);
      else merged.push({ kind: 'ground', x: g.x, y: g.y, w: g.w, h: g.h });
    });
    lv.solids = merged.concat(lv.solids.filter(function (s) { return s.kind !== 'ground'; }));
    lv.solids.sort(function (a, b) { return a.x - b.x; });
    return lv;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
