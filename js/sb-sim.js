/* 문장 다리 — 게임 규칙 시뮬레이션 (그리기와 분리 → Node에서도 그대로 돌려 검증한다)
 *
 * 한 걸음(step) = 1/60초. 입력: { left, right, jump } (누르고 있는지)
 * 밖으로 알리는 일은 events 배열에 쌓는다 (소리·화면·HUD가 가져가 쓴다).
 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  var PH = SB.physics;

  var EMOTE_DUR = { joy: 0.66, oops: 0.66, hint: 0.6, listen: 0 };

  function Sim(level, charId, opts) {
    opts = opts || {};
    this.L = level;
    this.charId = charId;
    this.cfg = PH.CHARS[charId] || PH.CHARS.tomi;
    this.t = 0;
    this.frame = 0;
    this.events = [];
    this.violations = [];
    this.done = false;
    this.p = {
      x: level.spawn.x, y: level.spawn.y, vx: 0, vy: 0, w: this.cfg.w, h: this.cfg.h,
      facing: 1, grounded: true, coyote: 0, jumpBuf: 0, prevJump: false,
      state: 'normal', lock: 0, anim: 'idle', landT: 0, skidT: 0, idleT: 0, listenT: 0,
      emote: null, emoteT: 0, emoteQ: [], wallPush: 0, standing: null, celebrate: null, ride: null, rescue: null,
      lastSafeX: level.spawn.x,
    };
    this.stats = {
      decisions: 0, firstTry: 0, mistakes: 0, hints: 0, rescues: 0,
      stars: 0, starTotal: level.stars.length, words: [], sentences: [], time: 0, grade: level.grade,
    };
    this.ci = 0;
  }
  SB.Sim = Sim;

  Sim.prototype.emit = function (type, data) { var e = data || {}; e.type = type; e.t = this.t; this.events.push(e); };
  Sim.prototype.current = function () {
    var C = this.L.challenges;
    while (this.ci < C.length && C[this.ci].state === 'done') this.ci++;
    return C[this.ci] || null;
  };
  Sim.prototype.near = function (list, x, r) {
    var out = [];
    for (var i = 0; i < list.length; i++) { var s = list[i]; if (s.x < x + r && s.x + s.w > x - r) out.push(s); }
    return out;
  };

  Sim.prototype.queueEmote = function (name) { this.p.emoteQ.push(name); };

  Sim.prototype.activate = function (ch) {
    if (ch.state !== 'waiting') return;
    ch.state = 'active';
    ch.idleT = 0;
    this.emit('challengeStart', { ch: ch });
    this.playPrompt(ch);
  };
  Sim.prototype.playPrompt = function (ch) {
    var s = ch.spec;
    if (s.aud) { this.emit('voice', { aud: s.aud, ms: s.ms }); this.p.listenT = Math.max(this.p.listenT, (s.ms || 1200) / 1000); }
  };

  // ------------------------------------------------------------------ 블록을 밟았을 때
  Sim.prototype.onBlock = function (b) {
    var p = this.p;
    var ch = this.L.challenges[b.ch];
    if (!ch) return;
    if (ch.state === 'waiting') this.activate(ch);
    if (ch.state !== 'active' || b.state !== 'idle') return;
    var need = ch.spec.tokens[ch.next];
    ch.idleT = 0;
    if (b.token && SB.content.sameToken(b.text, need)) {
      // 정답: 블록 위에서 잠깐 기뻐한 뒤 블록이 다리로 날아간다
      b.state = 'taken';
      var plank = ch.planks[ch.spec.given.length + ch.next];
      plank.placed = true; plank.fromBlock = b; b.plank = plank;
      this.stats.decisions++;
      if (ch.stepMistakes === 0) this.stats.firstTry++;
      ch.stepMistakes = 0;
      ch.blocks.forEach(function (o) { o.hint = false; });
      ch.next++;
      p.state = 'celebrate'; p.celebrate = { t: 0.36, block: b };
      p.vx = 0; p.vy = 0; p.y = b.y;
      p.emote = 'joy'; p.emoteT = 0.36;
      this.emit('stepCorrect', { n: ch.next, total: ch.spec.tokens.length, text: b.text, ch: ch });
      if (ch.next >= ch.spec.tokens.length) ch.pendingComplete = true;
    } else {
      // 오답: 블록이 흔들리며 발이 빠진다 (아프지 않게 살짝 비틀)
      b.state = 'wobble'; b.t = 0; b.passT = 0.55;
      // 오답 블록을 발판 삼아 뛰지 못하게: 서 있음·코요테 시간·점프 예약을 모두 없앤다
      p.vy = 50; p.lock = 0.2; p.grounded = false; p.coyote = 0; p.jumpBuf = 0; p.standing = null;
      ch.stepMistakes++; ch.mistakes++;
      this.stats.mistakes++;
      this.queueEmote('oops');
      this.emit('stepWrong', { text: b.text, ch: ch, count: ch.stepMistakes });
      if (ch.stepMistakes === 1) { this.emit('tip', { key: 'listenAgain', ch: ch }); this.playPrompt(ch); }
      if (ch.stepMistakes >= 2) this.giveHint(ch);
    }
  };
  Sim.prototype.giveHint = function (ch) {
    if (ch.type === 'bridge') {
      var need = ch.spec.tokens[ch.next];
      ch.blocks.forEach(function (o) { o.hint = o.state === 'idle' && o.token && SB.content.sameToken(o.text, need); });
    } else {
      ch.balloons.forEach(function (o) { o.hint = o.correct; });
      this.emit('tip', { key: 'meaning', ch: ch });
    }
    this.stats.hints++;
    this.queueEmote('hint');
    this.emit('hint', { ch: ch });
    this.playPrompt(ch);
  };

  // ------------------------------------------------------------------ 풍선을 잡았을 때
  Sim.prototype.onBalloon = function (bl, ch) {
    var p = this.p;
    ch.idleT = 0;
    if (bl.correct) {
      this.stats.decisions++;
      if (ch.mistakes === 0) this.stats.firstTry++;
      this.stats.words.push({ en: ch.spec.en, ko: ch.spec.ko, img: ch.spec.img, aud: ch.spec.aud, first: ch.mistakes === 0 });
      bl.state = 'carry';
      ch.balloons.forEach(function (o) { if (o !== bl && o.state !== 'popped') o.state = 'fade'; o.hint = false; });
      p.state = 'ride'; p.vx = 0; p.vy = 0;
      p.ride = { bl: bl, ch: ch, phase: 0, dx: p.x - bl.x };
      this.emit('balloonCorrect', { text: bl.text, ch: ch });
      if (ch.spec.aud) this.emit('voice', { aud: ch.spec.aud, ms: ch.spec.ms, quiet: true });
    } else {
      bl.state = 'popped'; bl.respawnT = 1.6; bl.t = 0;
      var away = p.x < bl.x ? -1 : 1;
      p.vx = 100 * away; p.vy = -150; p.lock = 0.32;
      ch.mistakes++;
      this.stats.mistakes++;
      this.queueEmote('oops');
      this.emit('balloonWrong', { text: bl.text, ch: ch, count: ch.mistakes });
      if (ch.mistakes === 1) { this.emit('tip', { key: 'meaning', ch: ch }); this.playPrompt(ch); }
      if (ch.mistakes >= 2) this.giveHint(ch);
    }
  };

  Sim.prototype.startRescue = function () {
    var p = this.p, L = this.L;
    var pit = null;
    for (var i = 0; i < L.pits.length; i++) if (p.x > L.pits[i].x0 - 16 && p.x < L.pits[i].x1 + 16) { pit = L.pits[i]; break; }
    var tx = pit ? pit.respawnX : p.lastSafeX;
    p.state = 'rescue';
    p.rescue = { t: 0, fx: p.x, fy: p.y, tx: tx, ty: L.G - 30 };
    p.vx = 0; p.vy = 0;
    this.stats.rescues++;
    this.emit('rescue', {});
  };

  // ------------------------------------------------------------------ 한 걸음
  Sim.prototype.step = function (input) {
    input = input || {};
    var dt = PH.DT, p = this.p, cfg = this.cfg, L = this.L, self = this;
    this.t += dt; this.frame++;
    if (!this.done) this.stats.time = this.t;

    var ch = this.current();
    if (ch && ch.state === 'waiting' && p.x >= ch.zoneX0) this.activate(ch);

    p.lock = Math.max(0, p.lock - dt);
    p.listenT = Math.max(0, p.listenT - dt);
    p.landT = Math.max(0, p.landT - dt);
    p.skidT = Math.max(0, p.skidT - dt);

    var pressed = !!input.jump && !p.prevJump;
    p.prevJump = !!input.jump;

    if (p.state === 'celebrate') {
      p.celebrate.t -= dt;
      if (p.celebrate.t <= 0) {
        var b = p.celebrate.block;
        b.state = 'flying'; b.t = 0; b.off = true;
        // 정답 블록도 발판이 되지 않는다: 블록이 날아가면 그대로 떨어진다 (점프 불가)
        p.state = 'normal'; p.celebrate = null; p.vy = 0; p.grounded = false; p.coyote = 0; p.jumpBuf = 0; p.standing = null;
      }
    } else if (p.state === 'ride') {
      this.updateRide(dt);
    } else if (p.state === 'rescue') {
      var r = p.rescue;
      r.t += dt;
      var e = SB.ease.inOutSine(Math.min(1, r.t / 1.3));
      p.x = SB.lerp(r.fx, r.tx, e);
      p.y = SB.lerp(r.fy, r.ty, e) - Math.sin(Math.PI * e) * 34;
      if (r.t >= 1.3) { p.state = 'normal'; p.rescue = null; p.vx = 0; p.vy = 0; p.grounded = false; }
    } else if (p.state === 'normal' || p.state === 'clear') {
      var dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (p.lock > 0 || p.state === 'clear') dir = 0;
      if (pressed && p.lock <= 0 && p.state === 'normal') p.jumpBuf = cfg.buffer; else p.jumpBuf = Math.max(0, p.jumpBuf - dt);
      var acc = p.grounded ? cfg.acc : cfg.airAcc;
      if (dir !== 0) {
        if (p.grounded && p.vx * dir < 0 && Math.abs(p.vx) > 50) p.skidT = 0.18;
        p.vx = SB.approach(p.vx, dir * cfg.maxRun, (p.vx * dir < 0 ? acc * 1.6 : acc) * dt);
        p.facing = dir;
        p.idleT = 0;
      } else {
        p.vx = SB.approach(p.vx, 0, (p.grounded ? cfg.dec : cfg.airAcc * 0.35) * dt);
      }
      if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
        p.vy = -cfg.jumpV; p.grounded = false; p.coyote = 0; p.jumpBuf = 0; p.idleT = 0;
        this.emit('jump', {});
      }
      if (!input.jump && p.vy < -cfg.jumpCut) p.vy = -cfg.jumpCut;
      p.vy = Math.min(p.vy + cfg.gravity * dt, cfg.maxFall);

      var solids = this.near(L.solids, p.x, 48);
      var ones = this.near(L.oneWays, p.x, 48);
      var wasGrounded = p.grounded, wasOn = p.standing;
      var res = PH.move(p, dt, solids, ones, function (o) { return o.kind === 'block' && o.passT > 0; });
      p.grounded = !!res.ground;
      p.standing = res.ground;
      if (p.grounded) p.coyote = cfg.coyote; else p.coyote = Math.max(0, p.coyote - dt);
      if (!wasGrounded && p.grounded) { p.landT = 0.1; this.emit('land', {}); }
      if (res.landedOneWay && res.landedOneWay.kind === 'block' && wasOn !== res.landedOneWay) this.onBlock(res.landedOneWay);
      p.wallPush = res.hitWall !== 0 && res.hitWall === dir && p.grounded ? p.wallPush + dt : 0;
      if (p.grounded && res.ground && (res.ground.kind === 'ground' || res.ground.kind === 'plank')) {
        var safe = true;
        for (var i = 0; i < L.pits.length; i++) if (p.x > L.pits[i].x0 - 28 && p.x < L.pits[i].x1 + 28) safe = false;
        if (safe) p.lastSafeX = p.x;
      }
      if (p.y > L.G + 90) this.startRescue();
      if (!dir && p.grounded && !input.jump) p.idleT += dt;
    }

    // 감정 표현(emote) 대기열: 땅에 서면 차례로
    if (p.emoteT > 0) p.emoteT -= dt;
    if (p.emoteT <= 0 && p.emoteQ.length && p.grounded && p.landT <= 0 && p.state === 'normal') {
      p.emote = p.emoteQ.shift(); p.emoteT = EMOTE_DUR[p.emote] || 0.5;
    }

    this.updateObjects(dt);

    // 별조각
    var hw = p.w / 2;
    for (var s = 0; s < L.stars.length; s++) {
      var st = L.stars[s];
      if (!st.taken && Math.abs(st.x - p.x) < hw + 5 && st.y > p.y - p.h - 5 && st.y < p.y + 5) {
        st.taken = true; this.stats.stars++;
        this.emit('star', { x: st.x, y: st.y });
      }
    }

    // 풍선 잡기
    // (오답 풍선에 밀려나는 동안에는 다른 풍선에 닿아도 세지 않는다 — 한 번 실수가 두 번으로 세어지지 않게)
    if (ch && ch.type === 'word' && (ch.state === 'active' || ch.state === 'waiting') && p.state === 'normal' && p.lock <= 0) {
      for (var k = 0; k < ch.balloons.length; k++) {
        var bl = ch.balloons[k];
        if (bl.state !== 'idle') continue;
        var bw = Math.max(18, bl.lw);
        if (p.x + hw > bl.x - bw / 2 && p.x - hw < bl.x + bw / 2 && p.y - p.h < bl.y + 24 && p.y > bl.y - 10) {
          if (ch.state === 'waiting') this.activate(ch);
          this.onBalloon(bl, ch);
          break;
        }
      }
    }

    // 막혀서 오래 머물면 힌트 (소리 다시 + 반짝임)
    if (ch && ch.state === 'active' && p.state === 'normal') {
      ch.idleT += dt;
      if (ch.idleT > 16) { ch.idleT = 0; this.giveHint(ch); }
    }

    // 도착
    if (!this.done && L.goal && p.state === 'normal' && p.x > L.goal.x && !this.current()) {
      this.done = true; p.state = 'clear';
      var acc2 = this.stats.decisions ? this.stats.firstTry / this.stats.decisions : 1;
      this.stats.accuracy = acc2;
      this.stats.starsEarned = acc2 >= 0.9 ? 3 : acc2 >= 0.7 ? 2 : 1;
      this.emit('clear', { stats: this.stats });
    }

    // 퀴즈를 건너뛰었는지 감시 (있으면 안 되는 일 — 검증 도구가 확인)
    for (var q = 0; q < L.challenges.length; q++) {
      var c2 = L.challenges[q];
      if (c2.state === 'done' || c2.state === 'building') continue;
      if (p.x - hw > c2.gateX + 1 && p.state !== 'ride') {
        this.violations.push({ t: this.t, ch: q, type: c2.type, x: p.x, gateX: c2.gateX, state: c2.state });
      }
      break; // 앞에 있는 풀지 않은 관문 하나만 보면 된다
    }

    this.pickAnim();
  };

  Sim.prototype.updateRide = function (dt) {
    var p = this.p, r = p.ride, bl = r.bl, ch = r.ch, G = this.L.G;
    var hang = 32;
    if (r.phase === 0) {
      bl.y -= 88 * dt;
      if (bl.y + hang <= ch.rideFeetY) r.phase = 1;
    } else if (r.phase === 1) {
      bl.x += 96 * dt;
      if (bl.x + r.dx >= ch.releaseX) r.phase = 2;
    } else if (r.phase === 2) {
      bl.y += 64 * dt;
      if (bl.y + hang >= G - 12) {
        p.state = 'normal'; p.ride = null; p.vx = 0; p.vy = 0; p.grounded = false;
        bl.state = 'away'; bl.t = 0;
        ch.state = 'done';
        this.queueEmote('joy');
        this.emit('wordDone', { ch: ch });
        return;
      }
    }
    r.dx = SB.approach(r.dx, 0, 20 * dt);
    p.x = bl.x + r.dx; p.y = bl.y + hang;
  };

  Sim.prototype.updateObjects = function (dt) {
    var L = this.L;
    for (var i = 0; i < L.challenges.length; i++) {
      var c = L.challenges[i];
      if (c.type === 'word') { this.updateBalloons(c, dt); continue; }
      if (c.state === 'waiting') continue;
      {
        for (var j = 0; j < c.blocks.length; j++) {
          var b = c.blocks[j];
          b.t += dt;
          if (b.passT > 0) b.passT -= dt;
          if (b.state === 'wobble' && b.t > 0.55) { b.state = 'idle'; b.t = 0; }
          if (b.state === 'flying' && b.t >= 0.42) { b.state = 'placed'; b.plank.lit = 1; this.emit('plankPlaced', { plank: b.plank, ch: c }); }
          if (b.state === 'poof' && b.t > 0.4) b.state = 'gone';
        }
        if (c.state === 'active' && c.pendingComplete) {
          // 마지막 블록까지 판자 자리에 도착하면 다리 완성
          var moving = c.blocks.filter(function (o) { return o.state === 'taken' || o.state === 'flying'; }).length;
          var allPlaced = c.planks.every(function (pl) { return pl.placed; });
          if (moving === 0 && allPlaced) {
            c.state = 'building'; c.buildT = 0;
            c.planks.forEach(function (pl) { pl.off = false; });
            c.blocks.forEach(function (o) { if (o.state === 'idle' || o.state === 'wobble') { o.state = 'poof'; o.t = 0; o.off = true; } });
            c.buildDur = Math.max(1.4, (c.spec.ms || 1200) / 1000 + 0.4);
            this.stats.sentences.push({ en: c.spec.en, ko: c.spec.ko, img: c.spec.img, aud: c.spec.aud, first: c.mistakes === 0 });
            this.emit('bridgeComplete', { ch: c });
            if (c.spec.aud) { this.emit('voice', { aud: c.spec.aud, ms: c.spec.ms }); this.p.listenT = Math.max(this.p.listenT, (c.spec.ms || 1200) / 1000); }
            this.queueEmote('joy');
          }
        }
        if (c.state === 'building') {
          c.buildT += dt;
          if (c.buildT >= c.buildDur) { c.state = 'done'; this.emit('bridgeDone', { ch: c }); }
        }
      }
    }
  };

  Sim.prototype.updateBalloons = function (c, dt) {
    for (var k = 0; k < c.balloons.length; k++) {
      var bl = c.balloons[k];
      bl.t += dt;
      if (bl.state === 'popped') {
        bl.respawnT -= dt;
        if (bl.respawnT <= 0) { bl.state = 'idle'; bl.t = 0; bl.x = bl.hx; bl.y = bl.hy; }
      } else if (bl.state === 'away') {
        bl.y -= 50 * dt;
      }
    }
  };

  Sim.prototype.pickAnim = function () {
    var p = this.p, a;
    if (p.state === 'ride') a = 'ride';
    else if (p.state === 'rescue') a = 'rescue';
    else if (p.state === 'celebrate') a = 'joy';
    else if (p.state === 'clear') a = p.grounded ? 'clear' : (p.vy < 0 ? 'jump' : 'fall');
    else if (!p.grounded) a = p.vy < 0 ? 'jump' : 'fall';
    else if (p.landT > 0) a = 'land';
    else if (p.emoteT > 0 && p.emote && Math.abs(p.vx) < 30) a = p.emote;
    else if (p.wallPush > 0.08) a = 'push';
    else if (p.skidT > 0) a = 'skid';
    else if (Math.abs(p.vx) > 10) a = 'run';
    else if (p.listenT > 0) a = 'listen';
    else if (p.idleT > 6) a = 'idle_long';
    else a = 'idle';
    p.anim = a;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
