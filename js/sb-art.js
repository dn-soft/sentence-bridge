/* 문장 다리 — 세상(땅·블록·판자·풍선·벽·배경) 픽셀 아트를 코드로 그린다.
 * 캐릭터와 같은 규칙: 4단계 명암, 빛은 왼쪽 위, 테두리는 검정이 아닌 가장 어두운 색.
 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  var A = SB.art = {};

  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  A.canvas = cv;
  function ctxOf(c) { var x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; }
  function R(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function P(ctx, x, y, col) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, 1, 1); }
  function rng(seed) { return SB.rng(seed); }

  // ------------------------------------------------------------------ 테마 (학년마다 하늘·땅 색)
  A.THEMES = {
    3: { name: '초록 들판', skyTop: '#7CCBFF', skyBot: '#DDF5FF', far: '#A9CFF3', far2: '#8FBDE8', hill: '#86D08E', hillSh: '#62B474', tree: '#4FAE64', treeHi: '#7DD37F', cloud: '#FFFFFF', cloudSh: '#D6EEFF',
      grassHi: '#A8EE7C', grass: '#6BD06A', grassSh: '#3FA457', grassDk: '#2A7A45', dirtHi: '#EDB57A', dirt: '#D8995A', dirtSh: '#B4733F', dirtDk: '#7A4A2A', sun: 'sun', stars: false },
    4: { name: '노을 언덕', skyTop: '#FF9E7C', skyBot: '#FFE3B5', far: '#EFA6B9', far2: '#DB8CA8', hill: '#A3CC6B', hillSh: '#80B04F', tree: '#6A9E45', treeHi: '#9CCB5F', cloud: '#FFF3E6', cloudSh: '#FFD0B8',
      grassHi: '#BFE675', grass: '#8CCB4E', grassSh: '#5E9F3A', grassDk: '#3F7330', dirtHi: '#EEB681', dirt: '#D69058', dirtSh: '#AE6A3C', dirtDk: '#744426', sun: 'sunset', stars: false },
    5: { name: '별빛 저녁', skyTop: '#6B63D6', skyBot: '#F6B4D1', far: '#9A8FE6', far2: '#8274D6', hill: '#5CBFA4', hillSh: '#44A08C', tree: '#3E9C84', treeHi: '#6AC9A6', cloud: '#F4E8FF', cloudSh: '#CDB8F2',
      grassHi: '#8DEBC0', grass: '#57C79C', grassSh: '#379C7E', grassDk: '#236F62', dirtHi: '#E3AE8A', dirt: '#C98B69', dirtSh: '#A06550', dirtDk: '#6A3F3E', sun: 'planet', stars: true },
    6: { name: '수정 숲', skyTop: '#3F4DA8', skyBot: '#9CD2F2', far: '#6A7CCB', far2: '#5667B8', hill: '#4FAFC0', hillSh: '#3C8FA6', tree: '#3E86A0', treeHi: '#67B8CC', cloud: '#E8F4FF', cloudSh: '#B7D2F0',
      grassHi: '#8CF0DD', grass: '#4FCCB4', grassSh: '#2FA08F', grassDk: '#1F6F6E', dirtHi: '#C9B0E0', dirt: '#A98BC6', dirtSh: '#8067A6', dirtDk: '#51407A', sun: 'planet2', stars: true },
  };
  A.theme = function (grade) { return A.THEMES[grade] || A.THEMES[3]; };

  // ------------------------------------------------------------------ 땅 타일 (16×16)
  // kinds: top, fill, topL, topR, fillL, fillR (L/R = 구덩이 쪽 가장자리)
  A.makeTiles = function (th, seed) {
    var T = 16, kinds = ['top', 'fill', 'topL', 'topR', 'fillL', 'fillR', 'top2', 'fill2'];
    var atlas = cv(T * kinds.length, T), c = ctxOf(atlas);
    kinds.forEach(function (k, i) {
      var ox = i * T, r = rng(seed + i * 17);
      var isTop = k.indexOf('top') === 0;
      // 흙
      R(c, ox, 0, T, T, th.dirt);
      for (var n = 0; n < 7; n++) { var px = ox + Math.floor(r() * 14) + 1, py = Math.floor(r() * 14) + 1; P(c, px, py, th.dirtSh); if (r() < 0.5) P(c, px + 1, py, th.dirtSh); if (r() < 0.4) P(c, px, py - 1, th.dirtHi); }
      if (!isTop) for (var y = 12; y < T; y++) for (var x = 0; x < T; x++) if ((x + y) % 3 === 0) P(c, ox + x, y, th.dirtSh);
      if (isTop) {
        // 풀 (위 4줄) + 물결 경계
        R(c, ox, 0, T, 4, th.grass);
        R(c, ox, 0, T, 1, th.grassHi);
        for (var x2 = 0; x2 < T; x2++) {
          var d = 4 + ((x2 + i) % 5 === 0 ? 1 : 0) + (x2 % 7 === 3 ? 1 : 0);
          R(c, ox + x2, 4, 1, d - 4 + 1, th.grassSh);
          P(c, ox + x2, d + 1, th.dirtSh);
          if (x2 % 4 === 1) P(c, ox + x2, 1, th.grassHi);
        }
      }
      // 가장자리
      if (k === 'topL' || k === 'fillL') {
        R(c, ox, 0, 1, T, th.dirtDk); R(c, ox + 1, 0, 1, T, th.dirtSh);
        if (k === 'topL') { R(c, ox, 0, 1, 5, th.grassDk); R(c, ox + 1, 0, 1, 4, th.grassSh); c.clearRect(ox, 0, 1, 1); }
      }
      if (k === 'topR' || k === 'fillR') {
        R(c, ox + T - 1, 0, 1, T, th.dirtDk); R(c, ox + T - 2, 0, 1, T, th.dirtSh);
        if (k === 'topR') { R(c, ox + T - 1, 0, 1, 5, th.grassDk); R(c, ox + T - 2, 0, 1, 4, th.grassSh); c.clearRect(ox + T - 1, 0, 1, 1); }
      }
    });
    return { atlas: atlas, kinds: kinds, T: T };
  };

  // 풀잎·꽃·돌·버섯
  A.makeDeco = function (th) {
    var out = {};
    function mk(w, h, fn) { var c = cv(w, h); fn(ctxOf(c)); return c; }
    out.grass = [0, 1, 2, 3].map(function (v) {
      return mk(9, 6, function (c) {
        var cols = [th.grassSh, th.grass, th.grassHi];
        var blades = [[1, 3], [3, 5], [5, 4], [7, 2]];
        blades.forEach(function (b, i) { if ((v + i) % 4 === 3) return; for (var y = 6 - b[1]; y < 6; y++) P(c, b[0] + (y < 3 && i % 2 ? 1 : 0), y, cols[(i + v) % 3]); });
      });
    });
    var petals = ['#FF8FB1', '#FFE066', '#FFFFFF', '#9FD7FF'];
    out.flower = petals.map(function (pc) {
      return mk(7, 9, function (c) {
        R(c, 3, 4, 1, 5, th.grassSh); P(c, 2, 6, th.grass); P(c, 4, 7, th.grass);
        P(c, 3, 0, pc); P(c, 2, 1, pc); P(c, 4, 1, pc); P(c, 3, 2, pc);
        P(c, 3, 1, '#FFD23F');
      });
    });
    out.stone = [0, 1].map(function (v) {
      return mk(8, 5, function (c) {
        R(c, 1, 1, 6 - v, 3, '#B9B4C7'); R(c, 2, 0, 4 - v, 1, '#B9B4C7'); R(c, 2, 1, 2, 1, '#E2DEEC');
        R(c, 1, 4, 6 - v, 1, '#7F7897'); P(c, 0, 2, '#7F7897'); P(c, 0, 3, '#7F7897'); P(c, 7 - v, 2, '#7F7897'); P(c, 7 - v, 3, '#7F7897');
      });
    });
    out.mushroom = [mk(8, 8, function (c) {
      R(c, 1, 1, 6, 3, '#FF6B6B'); R(c, 2, 0, 4, 1, '#FF6B6B'); R(c, 0, 2, 1, 2, '#C03A48'); R(c, 7, 2, 1, 2, '#C03A48'); R(c, 1, 4, 6, 1, '#C03A48');
      P(c, 2, 1, '#FFFFFF'); P(c, 5, 2, '#FFFFFF'); P(c, 3, 3, '#FFE0E0');
      R(c, 3, 5, 2, 3, '#FFF1DC'); P(c, 4, 7, '#E6CBA6');
    })];
    return out;
  };

  // ------------------------------------------------------------------ 낱말 글자 캐시
  var textCache = {};
  A.text = function (text, color, opts) {
    opts = opts || {};
    var key = text + '|' + color + '|' + (opts.shadow || '') + '|' + (opts.outline || '') + '|' + (opts.scale || 1);
    if (textCache[key]) return textCache[key];
    var s = opts.scale || 1, pad = opts.outline ? 1 : 0;
    var c = cv(SB.font.measure(text) * s + pad * 2 + 1, SB.font.height * s + pad * 2 + 2);
    SB.font.draw(ctxOf(c), text, pad, pad, color, opts);
    textCache[key] = c;
    return c;
  };

  // ------------------------------------------------------------------ 낱말 블록 (높이 14)
  var blockCache = {};
  A.block = function (text, w, style) {
    var key = text + '|' + w + '|' + style;
    if (blockCache[key]) return blockCache[key];
    var h = 14, c = cv(w, h), x = ctxOf(c);
    var S = {
      normal: { dk: '#6B3E26', base: '#FFF3DA', hl: '#FFFFFF', sh: '#EACB99', rim: '#F2B84B', ink: '#3B2748' },
      hint: { dk: '#8A5A00', base: '#FFF8C4', hl: '#FFFFFF', sh: '#F4DD7A', rim: '#FFC21A', ink: '#3B2748' },
      taken: { dk: '#2E8A5A', base: '#E4FFE9', hl: '#FFFFFF', sh: '#A8EBC0', rim: '#4FD08A', ink: '#1E5A3A' },
      wrong: { dk: '#9A3A4A', base: '#FFE4E4', hl: '#FFFFFF', sh: '#F2B0B6', rim: '#FF8A96', ink: '#6A2A3A' },
    }[style || 'normal'];
    R(x, 1, 0, w - 2, h, S.dk); R(x, 0, 1, w, h - 2, S.dk);
    R(x, 1, 1, w - 2, h - 2, S.base);
    R(x, 2, 1, w - 4, 1, S.hl);
    R(x, 1, h - 3, w - 2, 2, S.sh);
    // 금테(안쪽 테두리) 모서리 장식
    P(x, 2, 2, S.rim); P(x, w - 3, 2, S.rim); P(x, 2, h - 4, S.rim); P(x, w - 3, h - 4, S.rim);
    var t = A.text(text, S.ink);
    x.drawImage(t, Math.round((w - SB.font.measure(text)) / 2), 3);
    blockCache[key] = c;
    return c;
  };

  // ------------------------------------------------------------------ 다리 판자 (높이 12, 위 8px만 밟는 면)
  var plankCache = {};
  A.plank = function (text, w, style) {
    var key = text + '|' + w + '|' + style;
    if (plankCache[key]) return plankCache[key];
    var h = 12, c = cv(w, h), x = ctxOf(c);
    if (style === 'slot') {
      // 아직 빈 자리: 점선 테두리
      x.fillStyle = 'rgba(160,230,255,0.16)'; x.fillRect(1, 1, w - 2, h - 2);
      for (var i = 0; i < w; i += 3) { P(x, i, 0, '#A8ECFF'); P(x, i, h - 1, '#A8ECFF'); }
      for (var j = 0; j < h; j += 3) { P(x, 0, j, '#A8ECFF'); P(x, w - 1, j, '#A8ECFF'); }
    } else if (style === 'ghost') {
      // 낱말은 놓였지만 문장이 덜 끝나서 아직 못 밟는 판자
      x.fillStyle = 'rgba(120,210,255,0.42)'; x.fillRect(1, 1, w - 2, h - 2);
      R(x, 1, 0, w - 2, 1, '#D8F6FF'); R(x, 1, h - 1, w - 2, 1, '#6CC6F0'); R(x, 0, 1, 1, h - 2, '#D8F6FF'); R(x, w - 1, 1, 1, h - 2, '#6CC6F0');
      x.drawImage(A.text(text, '#FFFFFF', { shadow: '#2A6FA8' }), Math.round((w - SB.font.measure(text)) / 2), 1);
    } else {
      var gold = style === 'gold';
      var col = gold ? { dk: '#8A5A00', base: '#FFD24D', hl: '#FFF0A6', sh: '#E0A21E', ink: '#5A3600' } : { dk: '#6B3E26', base: '#D9A05B', hl: '#F2C585', sh: '#B07A3E', ink: '#4A2A16' };
      R(x, 0, 0, w, h, col.dk);
      R(x, 1, 1, w - 2, h - 2, col.base);
      R(x, 1, 1, w - 2, 1, col.hl);
      R(x, 1, h - 3, w - 2, 2, col.sh);
      // 나무결 / 못
      for (var k = 3; k < w - 3; k += 7) P(x, k, h - 5, col.sh);
      P(x, 2, 3, col.dk); P(x, w - 3, 3, col.dk);
      x.drawImage(A.text(text, col.ink), Math.round((w - SB.font.measure(text)) / 2), 1);
    }
    plankCache[key] = c;
    return c;
  };

  // ------------------------------------------------------------------ 풍선 + 이름표
  A.BALLOON_COLORS = [
    { hl: '#FFC2C2', base: '#FF6B6B', sh: '#D94A55', dk: '#8E2A3A' },
    { hl: '#BDE6FF', base: '#4FB8FF', sh: '#2E8AD8', dk: '#1C4F8E' },
    { hl: '#D6F7B8', base: '#7ED957', sh: '#52B03C', dk: '#2F6E2A' },
    { hl: '#FFF0B0', base: '#FFC93C', sh: '#E0A21E', dk: '#8A5A00' },
    { hl: '#E6D6FF', base: '#B784FF', sh: '#8A5CD8', dk: '#4E3290' },
  ];
  var balloonCache = {};
  A.balloon = function (ci, size) {
    var key = ci + '|' + (size || 1);
    if (balloonCache[key]) return balloonCache[key];
    var col = A.BALLOON_COLORS[ci % A.BALLOON_COLORS.length];
    var s = size || 1, rr = 9 * s;
    var w = Math.ceil(rr * 2 + 2), h = Math.ceil(rr * 2 + 5), c = cv(w, h), x = ctxOf(c);
    var cx = w / 2, cy = rr + 1;
    for (var y = 0; y < h; y++) for (var xx = 0; xx < w; xx++) {
      var dx = (xx + 0.5 - cx) / rr, dy = (y + 0.5 - cy) / (rr * 1.08);
      var d = dx * dx + dy * dy;
      if (d <= 1) {
        var col2 = col.base;
        if (d > 0.72 && (dx > 0.1 || dy > 0.2)) col2 = col.sh;
        if (dx < -0.2 && dy < -0.2 && d < 0.55 && d > 0.18) col2 = col.hl;
        P(x, xx, y, col2);
      } else if (d <= 1.25 && y < cy + rr * 1.1) {
        P(x, xx, y, col.dk);
      }
    }
    // 반사광 점
    P(x, Math.round(cx - rr * 0.45), Math.round(cy - rr * 0.5), '#FFFFFF');
    // 매듭
    var ky = Math.round(cy + rr * 1.05);
    R(x, Math.round(cx) - 1, ky, 3, 1, col.dk); P(x, Math.round(cx), ky + 1, col.dk); R(x, Math.round(cx) - 1, ky + 2, 3, 1, col.sh);
    balloonCache[key] = c;
    return c;
  };
  var tagCache = {};
  A.tag = function (text, w, hint) {
    var key = text + '|' + w + '|' + (hint ? 1 : 0);
    if (tagCache[key]) return tagCache[key];
    var h = 13, c = cv(w, h), x = ctxOf(c);
    var dk = hint ? '#8A5A00' : '#6B3E26', base = hint ? '#FFF6BE' : '#FFF3DA';
    R(x, 1, 0, w - 2, h, dk); R(x, 0, 1, w, h - 2, dk);
    R(x, 1, 1, w - 2, h - 2, base); R(x, 2, 1, w - 4, 1, '#FFFFFF'); R(x, 1, h - 2, w - 2, 1, hint ? '#F2D66A' : '#E9CB98');
    P(x, Math.floor(w / 2), 1, dk); // 끈 구멍
    x.drawImage(A.text(text, '#3B2748'), Math.round((w - SB.font.measure(text)) / 2), 2);
    tagCache[key] = c;
    return c;
  };

  // ------------------------------------------------------------------ 그림 벽 (80×104) — 그림은 그릴 때 위에 얹는다
  A.wall = function (th) {
    var w = 80, h = 104, c = cv(w, h), x = ctxOf(c);
    var dk = '#5E5873', sh = '#8F89A6', base = '#B8B3C8', hl = '#D9D5E7';
    R(x, 0, 0, w, h, dk);
    R(x, 1, 1, w - 2, h - 1, base);
    for (var row = 0; row * 8 < h; row++) {
      var y = 1 + row * 8;
      R(x, 1, y + 7, w - 2, 1, sh);
      for (var bx = (row % 2) * 8 + 1; bx < w - 1; bx += 16) R(x, bx, y, 1, 7, sh);
      R(x, 1, y, w - 2, 1, hl);
    }
    // 위 장식 (돌 난간)
    R(x, 0, 0, w, 4, dk); R(x, 1, 1, w - 2, 2, hl);
    void th;
    return c;
  };
  A.frame = function (w, h, gold) {
    var c = cv(w, h), x = ctxOf(c);
    var dk = gold ? '#8A5A00' : '#6B3E26', base = gold ? '#FFD24D' : '#C98A4A', hl = gold ? '#FFF0A6' : '#E8B377';
    R(x, 0, 0, w, h, dk); R(x, 1, 1, w - 2, h - 2, base); R(x, 1, 1, w - 2, 1, hl); R(x, 1, 1, 1, h - 2, hl);
    R(x, 3, 3, w - 6, h - 6, dk);
    R(x, 4, 4, w - 8, h - 8, '#FFF6E0');
    return c;
  };

  // ------------------------------------------------------------------ 별조각 (7×7, 4장)
  A.starBits = function () {
    var shapes = [
      ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
      ['...#...', '..###..', '.#####.', '..###..', '..###..', '..#.#..', '..#.#..'],
      ['...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...'],
      ['...#...', '..###..', '.#####.', '..###..', '..###..', '..#.#..', '..#.#..'],
    ];
    return shapes.map(function (g, i) {
      var c = cv(9, 9), x = ctxOf(c);
      for (var y = 0; y < 7; y++) for (var xx = 0; xx < 7; xx++) if (g[y][xx] === '#') {
        // 테두리
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var ny = y + d[1], nx = xx + d[0]; if (ny < 0 || ny > 6 || nx < 0 || nx > 6 || g[ny][nx] !== '#') P(x, nx + 1, ny + 1, '#B06A10'); });
      }
      for (var y2 = 0; y2 < 7; y2++) for (var x2 = 0; x2 < 7; x2++) if (g[y2][x2] === '#') P(x, x2 + 1, y2 + 1, (x2 < 3 && y2 < 3) ? '#FFF6B0' : (x2 > 3 || y2 > 4) ? '#F2A81D' : '#FFD84A');
      void i;
      return c;
    });
  };

  // ------------------------------------------------------------------ 표지판·기둥·도착 문
  A.sign = function (kind) {
    var c = cv(22, 24), x = ctxOf(c);
    R(x, 10, 10, 2, 14, '#6B3E26'); R(x, 10, 10, 1, 14, '#A86B35');
    R(x, 1, 1, 20, 12, '#6B3E26'); R(x, 2, 2, 18, 10, '#D9A05B'); R(x, 2, 2, 18, 1, '#F2C585'); R(x, 2, 10, 18, 2, '#B07A3E');
    if (kind === 'start' || kind === 'go') {
      // 화살표
      R(x, 5, 6, 9, 2, '#FFFFFF'); for (var i = 0; i < 4; i++) R(x, 12 + i - 2, 4 + i, 1, 6 - i * 2 + 0, '#FFFFFF');
      P(x, 15, 6, '#FFFFFF'); P(x, 15, 7, '#FFFFFF'); P(x, 14, 5, '#FFFFFF'); P(x, 14, 8, '#FFFFFF'); P(x, 13, 4, '#FFFFFF'); P(x, 13, 9, '#FFFFFF');
    } else if (kind === 'toBridge') {
      // 작은 다리 그림
      for (var k = 0; k < 4; k++) R(x, 4 + k * 4, 7, 3, 2, '#FFF3DA');
      R(x, 4, 5, 15, 1, '#FFF3DA'); P(x, 4, 6, '#FFF3DA'); P(x, 18, 6, '#FFF3DA');
    } else if (kind === 'toWord') {
      // 작은 풍선 그림
      R(x, 8, 3, 5, 5, '#FF6B6B'); R(x, 9, 2, 3, 7, '#FF6B6B'); P(x, 9, 3, '#FFC2C2'); R(x, 10, 9, 1, 2, '#FFF3DA');
    }
    return c;
  };
  A.endPost = function (text, lit) {
    var c = cv(18, 34), x = ctxOf(c);
    R(x, 8, 14, 3, 20, '#6B3E26'); R(x, 8, 14, 1, 20, '#A86B35');
    var dk = lit ? '#8A5A00' : '#6B3E26', base = lit ? '#FFD24D' : '#E9D2B0';
    R(x, 2, 0, 14, 14, dk); R(x, 1, 1, 16, 12, dk); R(x, 2, 1, 14, 12, base); R(x, 3, 2, 12, 1, lit ? '#FFF0A6' : '#FFF6E6');
    var mark = text || '★';
    if (mark === '★') { R(x, 8, 4, 2, 6, '#FFFFFF'); R(x, 6, 6, 6, 2, '#FFFFFF'); }
    else {
      var t = A.text(mark, lit ? '#5A3600' : '#6B3E26', { scale: 1 });
      x.drawImage(t, Math.round(9 - SB.font.measure(mark) / 2), 3);
    }
    return c;
  };
  A.post = function () {
    var c = cv(6, 22), x = ctxOf(c);
    R(x, 1, 0, 4, 22, '#6B3E26'); R(x, 2, 1, 2, 21, '#C98A4A'); R(x, 2, 1, 1, 21, '#E8B377'); R(x, 0, 0, 6, 3, '#6B3E26'); R(x, 1, 1, 4, 1, '#E8B377');
    return c;
  };
  A.goal = function (th) {
    var w = 64, h = 88, c = cv(w, h), x = ctxOf(c);
    function pillar(px) {
      R(x, px, 24, 10, 64, '#5E5873'); R(x, px + 1, 25, 8, 63, '#B8B3C8'); R(x, px + 1, 25, 2, 63, '#D9D5E7'); R(x, px + 7, 25, 2, 63, '#8F89A6');
      for (var y = 32; y < 88; y += 10) R(x, px + 1, y, 8, 1, '#8F89A6');
    }
    pillar(4); pillar(50);
    // 아치
    for (var i = 0; i < 48; i++) {
      var t = i / 47, ay = 26 - Math.round(Math.sin(Math.PI * t) * 10);
      R(x, 8 + i, ay - 3, 1, 5, '#5E5873'); R(x, 8 + i, ay - 2, 1, 3, '#D9D5E7');
    }
    // 큰 별 (베스타 별)
    var g = ['.....#.....', '....###....', '...#####...', '###########', '.#########.', '..#######..', '..###.###..', '.###...###.', '.##.....##.'];
    var ox = 21, oy = 1;
    for (var y2 = 0; y2 < g.length; y2++) for (var x2 = 0; x2 < 11; x2++) if (g[y2][x2] === '#') {
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var ny = y2 + d[1], nx = x2 + d[0]; if (ny < 0 || ny >= g.length || nx < 0 || nx > 10 || g[ny][nx] !== '#') P(x, ox + nx, oy + ny, '#173C86'); });
    }
    for (var y3 = 0; y3 < g.length; y3++) for (var x3 = 0; x3 < 11; x3++) if (g[y3][x3] === '#') P(x, ox + x3, oy + y3, (x3 < 5 && y3 < 4) ? '#78D6FF' : (x3 > 6 || y3 > 5) ? '#1C6DC2' : '#2391E1');
    P(x, ox + 5, oy + 4, '#FCD742'); P(x, ox + 4, oy + 4, '#FCD742'); P(x, ox + 6, oy + 4, '#FCD742'); P(x, ox + 5, oy + 3, '#FFE98A');
    void th;
    return c;
  };

  // ------------------------------------------------------------------ 배경 (반복되는 가로 띠)
  A.makeBackground = function (th, H, seed) {
    var W = 512, out = {};
    // 하늘: 계단식 그라데이션
    var sky = cv(4, H), s = ctxOf(sky);
    var bands = 14;
    for (var i = 0; i < bands; i++) {
      var t = i / (bands - 1);
      s.fillStyle = mix(th.skyTop, th.skyBot, t);
      s.fillRect(0, Math.floor(i * H / bands), 4, Math.ceil(H / bands) + 1);
    }
    out.sky = sky;
    // 먼 산 두 겹
    out.far = ridge(W, H, th.far2, th.far, seed + 1, 0.55, 46, 26);
    out.far2 = ridge(W, H, th.far, mix(th.far, '#FFFFFF', 0.25), seed + 2, 0.62, 30, 18);
    // 가까운 언덕 + 둥근 나무
    var hill = cv(W, H), hx = ctxOf(hill), r = rng(seed + 3);
    var base = H - 30;
    for (var x = 0; x < W; x++) {
      var y = base - 16 - Math.round(Math.sin((x / W) * Math.PI * 4 + 1) * 9 + Math.sin((x / W) * Math.PI * 10) * 3);
      R(hx, x, y, 1, H - y, th.hill);
      R(hx, x, y, 1, 1, mix(th.hill, '#FFFFFF', 0.3));
      if ((x * 7) % 11 === 0) R(hx, x, y + 6, 1, H, th.hillSh);
    }
    for (var n = 0; n < 9; n++) {
      var tx = Math.floor(r() * W), ty = base - 22 - Math.round(Math.sin((tx / W) * Math.PI * 4 + 1) * 9);
      tree(hx, tx, ty, th, r);
    }
    out.hill = hill;
    // 구름
    var cl = cv(W, 90), cx = ctxOf(cl), rc = rng(seed + 4);
    for (var k = 0; k < 5; k++) cloud(cx, Math.floor(rc() * (W - 60)), 8 + Math.floor(rc() * 60), th, rc);
    out.clouds = cl;
    out.W = W;
    return out;
  };
  function ridge(W, H, colA, colB, seed, level, amp, amp2) {
    var c = cv(W, H), x = ctxOf(c), r = rng(seed);
    var ph = [r() * 6, r() * 6, r() * 6];
    for (var i = 0; i < W; i++) {
      var t = (i / W) * Math.PI * 2;
      var y = Math.round(H * level - (Math.sin(t * 2 + ph[0]) * 0.5 + 0.5) * amp - Math.abs(Math.sin(t * 5 + ph[1])) * amp2 * 0.6 - Math.sin(t * 11 + ph[2]) * 3);
      R(x, i, y, 1, H - y, colA);
      R(x, i, y, 1, 2, colB);
    }
    return c;
  }
  function tree(x, tx, ty, th, r) {
    var h = 10 + Math.floor(r() * 8);
    R(x, tx, ty, 2, h, '#6B4A3A');
    var rad = 6 + Math.floor(r() * 4);
    for (var yy = -rad; yy <= rad; yy++) for (var xx = -rad; xx <= rad; xx++) {
      if (xx * xx + yy * yy <= rad * rad) P(x, tx + xx, ty - 2 + yy, (xx < -1 && yy < -1) ? th.treeHi : (xx + yy > rad * 0.6) ? mix(th.tree, '#000000', 0.18) : th.tree);
    }
  }
  function cloud(x, cx, cy, th, r) {
    var puffs = 3 + Math.floor(r() * 3);
    for (var i = 0; i < puffs; i++) {
      var px = cx + i * 9, py = cy + (i % 2 ? -3 : 0), rr = 7 + Math.floor(r() * 4);
      for (var yy = -rr; yy <= rr; yy++) for (var xx = -rr; xx <= rr; xx++) if (xx * xx + yy * yy * 1.6 <= rr * rr) P(x, px + xx, py + yy, yy > rr * 0.35 ? th.cloudSh : th.cloud);
    }
  }
  function mix(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    var g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    var bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  A.mix = mix;

  A.sunOrPlanet = function (kind) {
    var c = cv(48, 48), x = ctxOf(c);
    if (kind === 'sun' || kind === 'sunset') {
      var core = kind === 'sun' ? '#FFF3A0' : '#FFE08A', edge = kind === 'sun' ? '#FFD84A' : '#FFB05A';
      for (var y = 0; y < 48; y++) for (var xx = 0; xx < 48; xx++) {
        var d = Math.hypot(xx - 23.5, y - 23.5);
        if (d < 13) P(x, xx, y, d < 9 ? core : edge);
        else if (d < 16 && (xx + y) % 2 === 0) P(x, xx, y, edge);
      }
    } else {
      var body = kind === 'planet' ? ['#FFD6A0', '#F2A8C0', '#C98AD8'] : ['#C8F0FF', '#8FC8F0', '#6A8FD8'];
      for (var y2 = 0; y2 < 48; y2++) for (var x2 = 0; x2 < 48; x2++) {
        var d2 = Math.hypot(x2 - 24, y2 - 24);
        if (d2 < 12) P(x, x2, y2, d2 < 6 ? body[0] : (x2 + y2 > 50 ? body[2] : body[1]));
      }
      // 고리
      for (var a = 0; a < 360; a += 2) {
        var rad = a * Math.PI / 180, rx = 24 + Math.cos(rad) * 20, ry = 24 + Math.sin(rad) * 5;
        if (!(Math.sin(rad) < 0 && Math.hypot(rx - 24, ry - 24) < 12)) P(x, Math.round(rx), Math.round(ry), '#FFFFFF');
      }
    }
    return c;
  };

  // 아이콘(HUD용 아님, 세상 안의 스피커 표시)
  A.speaker = function () {
    var c = cv(11, 9), x = ctxOf(c);
    R(x, 1, 3, 2, 3, '#3B2748'); R(x, 3, 2, 1, 5, '#3B2748'); R(x, 4, 1, 1, 7, '#3B2748');
    P(x, 6, 3, '#3B2748'); P(x, 6, 5, '#3B2748'); P(x, 7, 4, '#3B2748'); P(x, 8, 2, '#3B2748'); P(x, 8, 6, '#3B2748'); P(x, 9, 3, '#3B2748'); P(x, 9, 4, '#3B2748'); P(x, 9, 5, '#3B2748');
    return c;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
