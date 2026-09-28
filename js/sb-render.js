/* 문장 다리 — 그리기
 * 캔버스는 낮은 해상도(월드 픽셀)로 그리고 CSS가 정수 배율로 키운다(image-rendering: pixelated) → 확대해도 흐리지 않다.
 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  var A = SB.art;
  var R = SB.render = {};

  R.MIN_W = 400; R.MIN_H = 220;
  R.sprites = { manifest: null, sheets: {} };
  R.images = {};     // 그림 키 → Image
  R.particles = [];
  R.floaters = [];

  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    R.cam = { x: 0, y: 0 };
    R.resize();
  };
  // 정수 배율 계산: 가로 400·세로 220 월드 픽셀 이상 보이게 가장 큰 정수 배율
  R.resize = function () {
    var c = R.canvas, host = c.parentElement;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var cssW = Math.max(1, host.clientWidth), cssH = Math.max(1, host.clientHeight);
    var devW = Math.round(cssW * dpr), devH = Math.round(cssH * dpr);
    // 세로 화면은 가로 폭이 좁으니 최소 폭을 줄여 캐릭터가 너무 작아지지 않게 한다
    var minW = window.innerHeight > window.innerWidth * 1.1 ? 256 : R.MIN_W;
    var scale = Math.max(1, Math.floor(Math.min(devH / R.MIN_H, devW / minW)));
    var vw = Math.ceil(devW / scale), vh = Math.ceil(devH / scale);
    if (c.width !== vw || c.height !== vh) { c.width = vw; c.height = vh; }
    c.style.width = (vw * scale / dpr) + 'px';
    c.style.height = (vh * scale / dpr) + 'px';
    R.vw = vw; R.vh = vh; R.scale = scale; R.dpr = dpr;
    R.ctx.imageSmoothingEnabled = false;
    if (R.theme) R.bg = A.makeBackground(R.theme, vh + 20, R.bgSeed || 1);
  };

  R.loadSprites = function (manifest, base) {
    R.sprites.manifest = manifest;
    var ids = Object.keys(manifest.characters);
    return Promise.all(ids.map(function (id) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () { R.sprites.sheets[id] = img; res(); };
        img.onerror = function () { console.warn('스프라이트를 못 불러옴', id); res(); };
        img.src = (base || '') + manifest.characters[id].sheet;
      });
    }));
  };

  // 캐릭터 한 프레임 그리기 (다른 캔버스에도 쓸 수 있게)
  R.drawSprite = function (ctx, charId, anim, t, x, y, flip, scale) {
    var m = R.sprites.manifest, img = R.sprites.sheets[charId];
    if (!m || !img) return;
    var a = m.animations[anim] || m.animations.idle;
    var n = a.frames, f = Math.floor(t * a.fps);
    f = a.loop ? f % n : Math.min(f, n - 1);
    var fw = m.frameWidth, fh = m.frameHeight, s = scale || 1;
    var dx = Math.round(x - m.anchorX * s), dy = Math.round(y - m.anchorY * s);
    ctx.save();
    if (flip) { ctx.translate(Math.round(x) * 2, 0); ctx.scale(-1, 1); dx = Math.round(x - (fw - m.anchorX) * s); }
    ctx.drawImage(img, f * fw, a.row * fh, fw, fh, dx, dy, fw * s, fh * s);
    ctx.restore();
  };

  // ------------------------------------------------------------------ 레벨 준비
  R.prepareLevel = function (level, charId) {
    R.level = level;
    R.charId = charId;
    R.theme = A.theme(level.grade);
    R.bgSeed = SB.hash(level.stageId);
    R.tiles = A.makeTiles(R.theme, R.bgSeed);
    R.deco = A.makeDeco(R.theme);
    R.bg = A.makeBackground(R.theme, R.vh + 20, R.bgSeed);
    R.sun = A.sunOrPlanet(R.theme.sun);
    R.wallArt = A.wall(R.theme);
    R.frame68 = A.frame(70, 70);
    R.frame44 = A.frame(46, 46);
    R.frame68g = A.frame(70, 70, true);
    R.stars = A.starBits();
    R.goalArt = A.goal(R.theme);
    R.signArt = { start: A.sign('start'), toBridge: A.sign('toBridge'), toWord: A.sign('toWord') };
    R.postArt = A.post();
    R.speaker = A.speaker();
    var rs = SB.rng(R.bgSeed + 9);
    R.skyStars = [];
    for (var i = 0; i < 60; i++) R.skyStars.push({ x: rs() * 1024, y: rs() * 120, p: rs() * 6 });
    R.anim = { name: 'idle', t: 0 };
    R.particles = []; R.floaters = [];
    R.cam.x = 0;
    R.cam.y = level.G + 40 - R.vh;
    R.flash = 0;
    R.shake = 0;
  };

  function drawRepeat(ctx, img, factor, y, camX) {
    if (!img) return;
    var w = img.width;
    var off = -Math.floor((camX * factor) % w);
    for (var x = off - w; x < R.vw + w; x += w) ctx.drawImage(img, x, y);
  }

  // ------------------------------------------------------------------ 카메라
  R.updateCamera = function (sim, dt) {
    var p = sim.p, L = sim.L, vw = R.vw;
    var tx = p.x + p.facing * 34 - vw * 0.42;
    var ch = sim.current();
    var area = null;
    if (ch && ch.type === 'bridge' && (ch.state === 'active' || ch.state === 'waiting' && p.x > ch.zoneX0 - 80)) area = [ch.zoneX0 - 20, ch.pit.x0 + 70];
    if (ch && ch.type === 'word' && (ch.state === 'active' || ch.state === 'waiting' && p.x > ch.zoneX0 - 80)) area = [ch.zoneX0 - 10, ch.wall.x + ch.wall.w + 16];
    if (area && p.state !== 'ride') {
      if (area[1] - area[0] <= vw) tx = (area[0] + area[1]) / 2 - vw / 2;
      else tx = SB.clamp(tx, area[0], area[1] - vw);
      tx = SB.clamp(tx, p.x - vw + 56, p.x - 56);
    }
    tx = SB.clamp(tx, 0, Math.max(0, L.width - vw));
    var k = 1 - Math.exp(-dt * (p.state === 'ride' ? 3.5 : 5));
    R.cam.x += (tx - R.cam.x) * k;
    R.cam.y = L.G + (R.vh < 240 ? 34 : 44) - R.vh;
  };

  // ------------------------------------------------------------------ 입자
  R.spawn = function (kind, x, y, n, opts) {
    opts = opts || {};
    for (var i = 0; i < (n || 1); i++) {
      var a = opts.angle !== undefined ? opts.angle : Math.random() * Math.PI * 2;
      var sp = (opts.speed || 40) * (0.5 + Math.random() * 0.8);
      R.particles.push({
        kind: kind, x: x + (opts.spread ? (Math.random() - 0.5) * opts.spread : 0), y: y,
        vx: Math.cos(a) * sp + (opts.vx || 0), vy: Math.sin(a) * sp + (opts.vy || 0),
        g: opts.g === undefined ? 60 : opts.g, life: 0, max: (opts.life || 0.6) * (0.7 + Math.random() * 0.6),
        color: opts.colors ? opts.colors[Math.floor(Math.random() * opts.colors.length)] : opts.color || '#FFFFFF',
      });
    }
  };
  R.floatText = function (text, x, y, color) { R.floaters.push({ text: text, x: x, y: y, t: 0, color: color || '#FFFFFF' }); };

  var CHAR_FX = {
    tomi: { jump: ['#80FFD9', '#FFFFFF'], land: ['#FFD2C8', '#FFFFFF'] },
    vesta: { jump: ['#FCD742', '#FFFFFF', '#78D6FF'], land: ['#E8D8F8', '#FFFFFF'] },
    bansuk: { jump: ['#FFF6DC', '#FAEA5A'], land: ['#FFF6DC', '#F2D9B0'] },
  };

  // 시뮬레이션 사건 → 그림 효과
  R.onEvent = function (e, sim) {
    var p = sim.p, fx = CHAR_FX[R.charId] || CHAR_FX.tomi;
    switch (e.type) {
      case 'jump': R.spawn('dust', p.x, p.y - 1, 4, { speed: 26, g: -10, life: 0.35, colors: fx.jump, spread: 8, angle: Math.PI / 2 }); break;
      case 'land': R.spawn('dust', p.x, p.y - 1, R.charId === 'bansuk' ? 7 : 4, { speed: 30, g: -20, life: 0.3, colors: fx.land, spread: 10 }); break;
      case 'stepCorrect': {
        var b = e.ch.blocks.filter(function (o) { return o.state === 'taken'; })[0];
        var bx = b ? b.x + b.w / 2 : p.x, by = b ? b.y : p.y;
        R.spawn('spark', bx, by, 10, { speed: 60, g: 30, life: 0.6, colors: ['#FFE66B', '#FFFFFF', '#7EF0B0'] });
        R.spawn('note', bx + 6, by - 8, 1, { speed: 10, g: -30, life: 0.9, color: '#3B2748', angle: -Math.PI / 2 });
        break;
      }
      case 'stepWrong': R.spawn('dust', p.x, p.y - 20, 5, { speed: 24, g: 20, life: 0.4, colors: ['#E8E4F0', '#FFFFFF'] }); R.shake = 0.12; break;
      case 'plankPlaced': R.spawn('spark', e.plank.x + e.plank.w / 2, e.plank.y + 4, 8, { speed: 40, g: 20, life: 0.5, colors: ['#A8ECFF', '#FFFFFF'] }); break;
      case 'bridgeComplete': {
        var c = e.ch;
        c.planks.forEach(function (pl, i) { setTimeout(function () { R.spawn('confetti', pl.x + pl.w / 2, pl.y - 2, 6, { speed: 70, g: 120, life: 1.1, colors: ['#FF6B6B', '#FFC93C', '#7ED957', '#4FB8FF', '#B784FF'], angle: -Math.PI / 2 }); }, i * 90); });
        break;
      }
      case 'balloonCorrect': R.spawn('spark', p.x, p.y - 30, 12, { speed: 60, g: 20, life: 0.7, colors: ['#FFE66B', '#FFFFFF'] }); break;
      case 'balloonWrong': {
        var bl = e.ch.balloons.filter(function (o) { return o.state === 'popped'; })[0];
        if (bl) {
          var col = A.BALLOON_COLORS[bl.color % A.BALLOON_COLORS.length];
          R.spawn('confetti', bl.x, bl.y, 12, { speed: 70, g: 60, life: 0.5, colors: [col.base, col.hl, col.sh] });
          R.spawn('ring', bl.x, bl.y, 1, { speed: 0, g: 0, life: 0.25, color: '#FFFFFF' });
        }
        break;
      }
      case 'star': R.spawn('spark', e.x, e.y, 6, { speed: 40, g: 0, life: 0.4, colors: ['#FFE66B', '#FFFFFF'] }); break;
      case 'rescue': R.spawn('bubble', p.x, p.y - 10, 8, { speed: 20, g: -30, life: 1.2, color: '#BDEBFF', spread: 16 }); break;
      case 'clear': {
        var gx = sim.L.goal.x + 20, gy = sim.L.goal.y;
        for (var k = 0; k < 5; k++) (function (k) { setTimeout(function () { R.spawn('confetti', gx - 60 + Math.random() * 120, gy - 40 - Math.random() * 30, 24, { speed: 90, g: 80, life: 1.2, colors: ['#FF6B6B', '#FFC93C', '#7ED957', '#4FB8FF', '#B784FF', '#FFFFFF'] }); }, k * 260); })(k);
        break;
      }
      default: break;
    }
  };

  function updateParticles(dt) {
    var ps = R.particles;
    for (var i = ps.length - 1; i >= 0; i--) {
      var q = ps[i];
      q.life += dt;
      if (q.life >= q.max) { ps.splice(i, 1); continue; }
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= 0.98;
    }
    for (var j = R.floaters.length - 1; j >= 0; j--) { var f = R.floaters[j]; f.t += dt; f.y -= 14 * dt; if (f.t > 1) R.floaters.splice(j, 1); }
  }

  // ------------------------------------------------------------------ 그리기
  R.draw = function (sim, dt, now) {
    var ctx = R.ctx, L = sim.L, th = R.theme, vw = R.vw, vh = R.vh;
    if (!L || !th) return;
    updateParticles(dt);
    if (R.shake > 0) R.shake -= dt;
    var sx = R.shake > 0 ? Math.round(Math.sin(now * 90) * 1.5) : 0;
    var camX = Math.round(R.cam.x) + sx, camY = Math.round(R.cam.y);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    // 하늘
    ctx.drawImage(R.bg.sky, 0, 0, vw, vh);
    if (th.stars) {
      for (var s = 0; s < R.skyStars.length; s++) {
        var st = R.skyStars[s];
        var tw = Math.sin(now * 2 + st.p) > 0.3;
        ctx.fillStyle = tw ? '#FFFFFF' : 'rgba(255,255,255,0.45)';
        var sxp = Math.floor((st.x - camX * 0.03) % vw); if (sxp < 0) sxp += vw;
        ctx.fillRect(sxp, Math.floor(st.y * (vh / 220)), 1, 1);
      }
    }
    ctx.drawImage(R.sun, Math.round(vw * 0.72 - camX * 0.02), Math.round(10 + (vh - 220) * 0.2));
    var groundScreen = L.G - camY;
    var bgH = R.bg.far.height;
    drawRepeat(ctx, R.bg.far, 0.1, groundScreen - bgH + 34, camX);
    drawRepeat(ctx, R.bg.clouds, 0.18, Math.round(groundScreen - 170 - (vh - 220) * 0.3), camX + now * 6);
    drawRepeat(ctx, R.bg.far2, 0.2, groundScreen - bgH + 40, camX);
    drawRepeat(ctx, R.bg.hill, 0.42, groundScreen - bgH + 28, camX);
    // 구덩이 아래 구름 바다
    ctx.fillStyle = th.cloud;
    ctx.globalAlpha = 0.85;
    for (var cx0 = -((camX * 0.8) % 24) - 24; cx0 < vw + 24; cx0 += 24) {
      ctx.beginPath(); ctx.arc(Math.round(cx0), groundScreen + 42, 13, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(-camX, -camY);
    var x0 = camX - 32, x1 = camX + vw + 32;

    drawGround(ctx, L, x0, x1, camY);
    drawDeco(ctx, L, x0, x1);
    drawSigns(ctx, sim, x0, x1, now);
    drawChallenges(ctx, sim, x0, x1, now);
    drawStars(ctx, L, x0, x1, now);
    drawGoal(ctx, sim, now);
    drawPlayer(ctx, sim, dt, now);
    drawParticles(ctx);
    ctx.restore();

    if (R.flash > 0) { R.flash -= dt; ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.5, R.flash) + ')'; ctx.fillRect(0, 0, vw, vh); }
  };

  function drawGround(ctx, L, x0, x1, camY) {
    var T = 16, bottom = camY + R.vh + 16, kinds = R.tiles.kinds;
    for (var i = 0; i < L.solids.length; i++) {
      var s = L.solids[i];
      if (s.kind !== 'ground' && s.kind !== 'step') continue;
      if (s.x + s.w < x0 || s.x > x1) continue;
      var end = s.x + s.w;
      var yEnd = s.kind === 'step' ? s.y + s.h : bottom;
      // 조각의 시작점부터 16px씩 (마지막 조각은 잘린 폭)
      var first = s.x + Math.max(0, Math.floor((x0 - s.x) / T)) * T;
      for (var x = first; x < end && x < x1; x += T) {
        var w = Math.min(T, end - x);
        var isLeft = x === s.x, isRight = x + w >= end;
        var col = Math.floor(x / T);
        for (var y = s.y; y < yEnd; y += T) {
          var top = y === s.y;
          var k = top ? (isLeft ? 'topL' : isRight ? 'topR' : (col % 3 === 0 ? 'top2' : 'top'))
                      : (isLeft ? 'fillL' : isRight ? 'fillR' : ((col + Math.floor(y / T)) % 4 === 0 ? 'fill2' : 'fill'));
          var ti = kinds.indexOf(k);
          // 오른쪽 끝 조각은 타일의 오른쪽 부분을 써서 가장자리 테두리가 보이게
          var srcX = ti * T + (isRight && !isLeft ? T - w : 0);
          var h = Math.min(T, yEnd - y);
          ctx.drawImage(R.tiles.atlas, srcX, 0, w, h, x, y, w, h);
        }
        if (s.kind === 'step') { ctx.fillStyle = R.theme.dirtDk; ctx.fillRect(x, s.y + s.h - 1, w, 1); }
      }
    }
  }
  function drawDeco(ctx, L, x0, x1) {
    for (var i = 0; i < L.deco.length; i++) {
      var d = L.deco[i];
      if (d.x < x0 || d.x > x1) continue;
      var arr = R.deco[d.kind];
      if (!arr) continue;
      var img = arr[d.v % arr.length];
      ctx.drawImage(img, Math.round(d.x - img.width / 2), d.y - img.height + 1);
    }
  }
  function drawPicture(ctx, key, x, y, size) {
    var img = key && R.images[key];
    if (img && img.complete && img.naturalWidth) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, x, y, size, size);
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.fillStyle = '#EDE6F7'; ctx.fillRect(x, y, size, size);
      ctx.drawImage(R.speaker, Math.round(x + size / 2 - 5), Math.round(y + size / 2 - 4));
    }
  }
  function drawSigns(ctx, sim, x0, x1, now) {
    var L = sim.L;
    for (var i = 0; i < L.signs.length; i++) {
      var g = L.signs[i];
      if (g.x < x0 - 60 || g.x > x1 + 60) continue;
      if (g.kind === 'picture') {
        // 문장 그림판: 기둥 + 액자
        var ch = L.challenges[g.ch];
        ctx.drawImage(R.postArt, g.x - 3, g.y - 22);
        var fy = g.y - 22 - 44;
        ctx.drawImage(R.frame44, g.x - 23, fy);
        drawPicture(ctx, g.img, g.x - 19, fy + 4, 38);
        if (ch && ch.state === 'active' && sim.p.listenT > 0) { ctx.drawImage(R.speaker, g.x + 14, fy - 8 + (Math.sin(now * 10) > 0 ? 0 : -1)); }
      } else if (g.kind === 'end') {
        var ch2 = L.challenges[g.ch];
        var lit = ch2 && (ch2.state === 'building' || ch2.state === 'done');
        var art = A.endPost(g.text, lit);
        ctx.drawImage(art, g.x - 9, g.y - art.height);
      } else if (R.signArt[g.kind]) {
        var sa = R.signArt[g.kind];
        ctx.drawImage(sa, g.x - 11, g.y - sa.height);
      }
    }
  }
  function drawChallenges(ctx, sim, x0, x1, now) {
    var L = sim.L;
    for (var i = 0; i < L.challenges.length; i++) {
      var c = L.challenges[i];
      if (c.type === 'bridge') {
        if (c.pit.x1 < x0 - 40 || c.zoneX0 > x1 + 40) continue;
        drawBridge(ctx, sim, c, now);
      } else {
        if (c.wall.x + c.wall.w < x0 - 80 || c.zoneX0 > x1 + 40) continue;
        drawWordGate(ctx, sim, c, now);
      }
    }
  }
  function drawBridge(ctx, sim, c, now) {
    var perfect = c.mistakes === 0;
    var solid = c.state === 'building' || c.state === 'done';
    // 기둥과 밧줄
    ctx.drawImage(R.postArt, c.pit.x0 - 6, L_G(sim) - 20);
    ctx.drawImage(R.postArt, c.pit.x1, L_G(sim) - 20);
    if (solid) {
      ctx.fillStyle = '#8A5A2A';
      var span = c.pit.x1 - c.pit.x0 + 6;
      for (var x = 0; x <= span; x++) {
        var t = x / span, yy = Math.round(L_G(sim) - 17 + Math.sin(Math.PI * t) * 6);
        ctx.fillRect(c.pit.x0 - 3 + x, yy, 1, 1);
      }
    }
    // 판자
    var litUpTo = -1;
    if (c.state === 'building') litUpTo = Math.floor((c.buildT / Math.max(0.5, c.buildDur - 0.3)) * c.planks.length);
    for (var i = 0; i < c.planks.length; i++) {
      var pl = c.planks[i];
      var style = solid ? (perfect ? 'gold' : 'wood') : pl.placed ? 'ghost' : 'slot';
      var art = A.plank(pl.text, pl.w, style === 'slot' ? 'slot' : style);
      var dy = 0;
      if (c.state === 'building' && i <= litUpTo && i >= litUpTo - 1) dy = -2;
      if (!solid && !pl.placed) { ctx.globalAlpha = 0.85; ctx.drawImage(A.plank('', pl.w, 'slot'), pl.x, pl.y); ctx.globalAlpha = 1; }
      else ctx.drawImage(art, pl.x, pl.y + dy);
      if (c.state === 'building' && i === litUpTo) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(pl.x, pl.y + dy, pl.w, 12); }
    }
    // 블록
    for (var j = 0; j < c.blocks.length; j++) {
      var b = c.blocks[j];
      if (b.state === 'placed' || b.state === 'gone') continue;
      var bx = b.x, by = b.y, style2 = 'normal';
      if (b.state === 'wobble') { bx += Math.round(Math.sin(b.t * 45) * 2 * (1 - b.t / 0.55)); style2 = 'wrong'; }
      if (b.state === 'taken') style2 = 'taken';
      if (b.state === 'idle' && b.hint) style2 = Math.sin(now * 8) > -0.2 ? 'hint' : 'normal';
      if (b.state === 'idle') by += Math.round(Math.sin(now * 2 + j * 1.3) * 1);
      if (b.state === 'flying') {
        var t2 = Math.min(1, b.t / 0.42), e = SB.ease.inOutSine(t2);
        var pl2 = b.plank;
        bx = SB.lerp(b.x, pl2.x + pl2.w / 2 - b.w / 2, e);
        by = SB.lerp(b.y, pl2.y - 1, e) - Math.sin(Math.PI * e) * 26;
        style2 = 'taken';
      }
      if (b.state === 'poof') { ctx.globalAlpha = Math.max(0, 1 - b.t / 0.4); by -= b.t * 20; }
      ctx.drawImage(A.block(b.text, b.w, style2), Math.round(bx), Math.round(by));
      ctx.globalAlpha = 1;
      if (b.state === 'idle' && b.hint) {
        // 반짝이
        var k2 = Math.floor(now * 6) % 4;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(Math.round(bx + (k2 < 2 ? -2 : b.w + 1)), Math.round(by + (k2 % 2 ? 2 : 10)), 1, 1);
        ctx.fillStyle = '#FFE66B';
        ctx.fillRect(Math.round(bx + b.w / 2), Math.round(by - 4 - (k2 % 2)), 1, 2);
      }
    }
  }
  function L_G(sim) { return sim.L.G; }
  function drawWordGate(ctx, sim, c, now) {
    var w = c.wall;
    ctx.drawImage(R.wallArt, w.x, w.y);
    var done = c.state === 'done';
    ctx.drawImage(done ? R.frame68g : R.frame68, w.x + 5, w.y + 10);
    drawPicture(ctx, w.img, w.x + 9, w.y + 14, 62);
    if (c.state === 'active' && sim.p.listenT > 0) ctx.drawImage(R.speaker, w.x + 35, w.y + 84 + (Math.sin(now * 10) > 0 ? 0 : -1));
    if (done) { ctx.fillStyle = '#FFE66B'; var k = Math.floor(now * 4) % 3; ctx.fillRect(w.x + 8 + k * 30, w.y + 6, 2, 2); }
    // 풍선
    for (var i = 0; i < c.balloons.length; i++) {
      var b = c.balloons[i];
      if (b.state === 'popped' || b.state === 'carry') continue;
      var bob = b.state === 'idle' ? Math.round(Math.sin(now * 2.2 + i * 2) * 2) : 0;
      var alpha = 1, bx = b.x, by = b.y + bob, size = 1;
      if (b.state === 'fade' || b.state === 'away') { alpha = Math.max(0, 1 - b.t / 1.2); by -= b.t * 30; }
      if (b.state === 'idle' && b.t < 0.35 && b.respawnT <= 0 && b.t > 0) size = 0.6 + (b.t / 0.35) * 0.4;
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      var img = A.balloon(b.color, size < 1 ? 0.7 : 1);
      // 끈
      ctx.fillStyle = '#6B5A7A';
      ctx.fillRect(Math.round(bx), Math.round(by + 10), 1, 6);
      ctx.drawImage(img, Math.round(bx - img.width / 2), Math.round(by - img.height / 2 - 1));
      var tag = A.tag(b.text, b.lw, b.hint && Math.sin(now * 8) > -0.2);
      ctx.drawImage(tag, Math.round(bx - b.lw / 2), Math.round(by + 15));
      if (b.hint && b.state === 'idle') {
        var k3 = Math.floor(now * 6) % 4;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(Math.round(bx + (k3 < 2 ? -12 : 11)), Math.round(by - 6 + k3 * 3), 1, 1);
        ctx.fillStyle = '#FFE66B';
        ctx.fillRect(Math.round(bx - 1), Math.round(by - 14 - (k3 % 2)), 2, 1);
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawStars(ctx, L, x0, x1, now) {
    var f = Math.floor(now * 8) % 4;
    for (var i = 0; i < L.stars.length; i++) {
      var s = L.stars[i];
      if (s.taken || s.x < x0 || s.x > x1) continue;
      ctx.drawImage(R.stars[f], Math.round(s.x - 4), Math.round(s.y - 4 + Math.sin(now * 3 + i) * 1));
    }
  }
  function drawGoal(ctx, sim, now) {
    var g = sim.L.goal;
    if (!g) return;
    ctx.drawImage(R.goalArt, Math.round(g.x - 12), sim.L.G - R.goalArt.height);
    if (Math.floor(now * 3) % 2) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(g.x + 20, sim.L.G - 84, 1, 1); ctx.fillRect(g.x + 14, sim.L.G - 88, 1, 1); }
  }
  function drawPlayer(ctx, sim, dt, now) {
    var p = sim.p;
    if (R.anim.name !== p.anim) { R.anim.name = p.anim; R.anim.t = 0; }
    else R.anim.t += dt * (p.anim === 'run' ? Math.max(0.6, Math.abs(p.vx) / sim.cfg.maxRun) : 1);
    var flip = p.facing < 0 && !(p.anim === 'clear' || p.anim === 'select_idle');
    // 풍선 타기: 풍선을 캐릭터 위에
    if (p.state === 'ride' && p.ride) {
      var bl = p.ride.bl;
      var m = R.sprites.manifest.characters[R.charId];
      var ax = m.rideAnchor[0] - R.sprites.manifest.anchorX, ay = m.rideAnchor[1] - R.sprites.manifest.anchorY;
      var hx = p.x + (flip ? -ax : ax), hy = p.y + ay;
      var img = A.balloon(bl.color, 1);
      ctx.fillStyle = '#6B5A7A';
      var topY = bl.y + 9;
      for (var y = Math.round(topY); y < hy; y++) ctx.fillRect(Math.round(SB.lerp(bl.x, hx, (y - topY) / Math.max(1, hy - topY))), y, 1, 1);
      ctx.drawImage(img, Math.round(bl.x - img.width / 2), Math.round(bl.y - img.height / 2 - 1));
    }
    R.drawSprite(ctx, R.charId, p.anim, R.anim.t, p.x, p.y, flip);
  }
  function drawParticles(ctx) {
    for (var i = 0; i < R.particles.length; i++) {
      var q = R.particles[i];
      var a = 1 - q.life / q.max;
      ctx.globalAlpha = Math.max(0, Math.min(1, a * 1.4));
      ctx.fillStyle = q.color;
      var x = Math.round(q.x), y = Math.round(q.y);
      if (q.kind === 'spark') { ctx.fillRect(x, y, 1, 1); if (a > 0.5) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); } }
      else if (q.kind === 'confetti') ctx.fillRect(x, y, 2, 2);
      else if (q.kind === 'dust') ctx.fillRect(x, y, a > 0.5 ? 2 : 1, a > 0.5 ? 2 : 1);
      else if (q.kind === 'bubble') { ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y + 1, 1, 1); }
      else if (q.kind === 'ring') { var rr = 4 + q.life * 40; ctx.strokeStyle = q.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke(); }
      else if (q.kind === 'note') {
        // 8분음표 (5×7)
        ctx.fillRect(x, y + 4, 3, 2); ctx.fillRect(x + 2, y - 1, 1, 5); ctx.fillRect(x + 3, y - 1, 1, 1); ctx.fillRect(x + 4, y, 1, 2);
      }
    }
    ctx.globalAlpha = 1;
    for (var j = 0; j < R.floaters.length; j++) {
      var f = R.floaters[j];
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      var img = A.text(f.text, f.color, { outline: '#3B2748' });
      ctx.drawImage(img, Math.round(f.x - img.width / 2), Math.round(f.y));
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ 메뉴 뒤 배경 (들판이 천천히 흘러가고 캐릭터가 달린다)
  R.prepareMenu = function () {
    R.menu = { theme: A.theme(3), t: 0 };
    R.menu.tiles = A.makeTiles(R.menu.theme, 77);
    R.menu.deco = A.makeDeco(R.menu.theme);
    R.menu.bg = A.makeBackground(R.menu.theme, R.vh + 20, 77);
    R.menu.sun = A.sunOrPlanet('sun');
    R.menu.vh = R.vh;
  };
  R.drawMenu = function (dt, now, charId) {
    var M = R.menu;
    if (!M) return;
    if (M.vh !== R.vh) { M.bg = A.makeBackground(M.theme, R.vh + 20, 77); M.vh = R.vh; }
    var ctx = R.ctx, vw = R.vw, vh = R.vh;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var camX = Math.floor(now * 26);
    ctx.drawImage(M.bg.sky, 0, 0, vw, vh);
    ctx.drawImage(M.sun, Math.round(vw * 0.75), 12);
    var gy = vh - 40, bh = M.bg.far.height;
    drawRepeat(ctx, M.bg.far, 0.1, gy - bh + 34, camX);
    drawRepeat(ctx, M.bg.clouds, 0.18, gy - 170, camX + now * 6);
    drawRepeat(ctx, M.bg.far2, 0.2, gy - bh + 40, camX);
    drawRepeat(ctx, M.bg.hill, 0.42, gy - bh + 28, camX);
    var T = 16, kinds = M.tiles.kinds;
    for (var x = -((camX) % T) - T; x < vw + T; x += T) {
      var col = Math.floor((x + camX) / T);
      ctx.drawImage(M.tiles.atlas, kinds.indexOf(col % 3 === 0 ? 'top2' : 'top') * T, 0, T, T, x, gy, T, T);
      for (var y = gy + T; y < vh; y += T) ctx.drawImage(M.tiles.atlas, kinds.indexOf('fill') * T, 0, T, T, x, y, T, T);
      if (col % 5 === 0) { var g = M.deco.grass[col % 4]; ctx.drawImage(g, x + 3, gy - g.height + 1); }
      if (col % 11 === 3) { var f = M.deco.flower[col % 4]; ctx.drawImage(f, x + 6, gy - f.height + 1); }
    }
    if (R.sprites.sheets[charId]) R.drawSprite(ctx, charId, 'run', now, Math.round(vw * 0.22), gy, false, 1);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
