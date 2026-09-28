/* 문장 다리 — 자동 플레이 봇
 * 사람처럼 ← → 점프 버튼만 누른다 (순간이동·규칙 우회 없음). 검증 도구와 브라우저 자동 플레이가 같이 쓴다.
 *   mistakeRate: 0~1, 가끔 일부러 틀리게 해서 오답·힌트 흐름도 확인한다.
 *   mode: 'solve'(정답 찾기) | 'skip'(퀴즈를 무시하고 앞으로만 달리며 최대로 뛰기 → 통과하면 안 됨)
 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};

  function Bot(sim, opts) {
    opts = opts || {};
    this.sim = sim;
    this.rand = SB.rng(opts.seed || 7);
    this.mistakeRate = opts.mistakeRate || 0;
    this.mode = opts.mode || 'solve';
    this.think = opts.thinkDelay || 0;   // 고르기 전에 생각하는 시간(초) — 아이 플레이 시간 추정용
    this.pitOnce = !!opts.pitOnce;       // 한 번은 일부러 구덩이에 빠져 본다 (방울 구조 확인용)
    this.wait = 0;
    this.lastChoiceKey = '';
    this.jumpHold = 0;
    this.choice = null;
    this.stuckT = 0;
    this.lastX = sim.p.x;
    this.wiggle = 0;
  }
  SB.Bot = Bot;

  function stopDist(sim) {
    var v = Math.abs(sim.p.vx), d = sim.cfg.dec;
    return (v * v) / (2 * d) + 1;
  }
  function supportAhead(sim, x) {
    var L = sim.L;
    for (var i = 0; i < L.solids.length; i++) {
      var s = L.solids[i];
      if (s.kind === 'bound' || s.off) continue;
      if (x >= s.x && x <= s.x + s.w && s.y >= L.G - 20 && s.y <= L.G + 1) return true;
    }
    for (var k = 0; k < L.oneWays.length; k++) {
      var o = L.oneWays[k];
      if ((o.kind === 'plank') && !o.off && x >= o.x && x <= o.x + o.w) return true;
    }
    return false;
  }
  function stepAhead(sim, x, feetY) {
    var L = sim.L;
    for (var i = 0; i < L.solids.length; i++) {
      var s = L.solids[i];
      if (s.kind !== 'step' && s.kind !== 'wall') continue;
      if (x >= s.x && x <= s.x + s.w && s.y < feetY - 2) return s;
    }
    return null;
  }

  Bot.prototype.input = function () {
    var sim = this.sim, p = sim.p;
    var inp = { left: false, right: false, jump: false };
    if (p.state !== 'normal') { this.jumpHold = 0; return inp; }

    // 점프 버튼 유지
    if (this.jumpHold > 0) {
      this.jumpHold -= SB.physics.DT;
      inp.jump = true;
    }
    var ch = sim.current();
    var targetX = null, wantJump = false, precise = false;
    // 생각하는 시간: 새 문제·새 칸을 만나면 소리를 듣고 잠깐 멈춘다
    if (this.think > 0 && ch && ch.state === 'active') {
      var ck = ch.idx + ':' + (ch.next || 0) + ':' + (ch.mistakes || 0);
      if (ck !== this.lastChoiceKey) { this.lastChoiceKey = ck; this.wait = this.think + (ch.next === 0 && !ch.mistakes ? (ch.spec.ms || 1200) / 1000 : 0); }
      if (this.wait > 0) { this.wait -= SB.physics.DT; return { left: false, right: false, jump: false }; }
    }
    // 방울 구조 보기: 첫 문장 다리에서 한 번 구덩이로 걸어 들어간다
    if (this.pitOnce && ch && ch.type === 'bridge' && ch.state === 'active' && !sim.stats.rescues) {
      return { left: false, right: true, jump: false };
    }

    if (this.mode === 'skip') {
      // 퀴즈 무시: 앞으로 최고 속도로 달리다가 구덩이·벽 앞에서 최대로 뛴다
      inp.right = true;
      if (p.grounded && (!supportAhead(sim, p.x + 10) || stepAhead(sim, p.x + 14, p.y))) { inp.jump = true; this.jumpHold = 0.6; }
      return inp;
    }

    if (ch && ch.type === 'bridge' && ch.state === 'active' && !ch.pendingComplete) {
      var need = ch.spec.tokens[ch.next];
      if (!this.choice || this.choice.ch !== ch || this.choice.next !== ch.next || this.choice.m !== ch.mistakes || !this.choice.b || this.choice.b.state !== 'idle') {
        var idle = ch.blocks.filter(function (b) { return b.state === 'idle'; });
        var good = idle.filter(function (b) { return b.token && SB.content.sameToken(b.text, need); });
        var bad = idle.filter(function (b) { return !(b.token && SB.content.sameToken(b.text, need)); });
        var pickBad = bad.length && this.rand() < this.mistakeRate;
        var list = pickBad ? bad : good;
        list.sort(function (a, b) { return Math.abs(a.x + a.w / 2 - p.x) - Math.abs(b.x + b.w / 2 - p.x); });
        this.choice = { ch: ch, next: ch.next, m: ch.mistakes, b: list[0] };
      }
      var b = this.choice.b;
      if (b) { targetX = b.x + b.w / 2; precise = true; wantJump = true; }
    } else if (ch && ch.type === 'bridge' && ch.state === 'active' && ch.pendingComplete) {
      targetX = p.x; // 다리가 완성될 때까지 기다린다
    } else if (ch && ch.type === 'word' && ch.state === 'active') {
      if (!this.choice || this.choice.ch !== ch || this.choice.m !== ch.mistakes || !this.choice.b || this.choice.b.state !== 'idle') {
        var ib = ch.balloons.filter(function (o) { return o.state === 'idle'; });
        var ok = ib.filter(function (o) { return o.correct; });
        var no = ib.filter(function (o) { return !o.correct; });
        var pb = no.length && this.rand() < this.mistakeRate;
        this.choice = { ch: ch, m: ch.mistakes, b: (pb ? no : ok)[0] || null };
      }
      if (this.choice.b) { targetX = this.choice.b.x; precise = true; wantJump = true; }
    }

    if (targetX === null) {
      // 앞으로 가기 (관문 밖) — 다음 관문이나 도착점 쪽
      inp.right = true;
      if (p.grounded) {
        var gapAhead = !supportAhead(sim, p.x + 14) || !supportAhead(sim, p.x + 22);
        var st = stepAhead(sim, p.x + 16, p.y);
        if ((gapAhead && !(ch && ch.type === 'bridge' && ch.state !== 'building' && ch.state !== 'done' && p.x > ch.pit.x0 - 40)) || (st && st.kind === 'step')) {
          inp.jump = true; this.jumpHold = 0.5;
        }
      }
    } else {
      var dx = targetX - p.x;
      var tol = precise ? 2.5 : 6;
      if (Math.abs(dx) > tol + (Math.sign(dx) === Math.sign(p.vx) ? stopDist(sim) : 0)) {
        if (dx > 0) inp.right = true; else inp.left = true;
      }
      if (wantJump && Math.abs(dx) <= tol + 1 && p.grounded && Math.abs(p.vx) < 25 && this.jumpHold <= 0) {
        inp.jump = true; this.jumpHold = 0.5;
      }
    }

    // 끼임 방지: 오래 제자리면 살짝 흔들기
    if (Math.abs(p.x - this.lastX) < 0.5 && !inp.jump) this.stuckT += SB.physics.DT; else this.stuckT = 0;
    this.lastX = p.x;
    if (this.stuckT > 3) { this.wiggle = 0.4; this.stuckT = 0; }
    if (this.wiggle > 0) { this.wiggle -= SB.physics.DT; inp.left = !inp.left; inp.right = !inp.right; if (p.grounded) { inp.jump = true; this.jumpHold = 0.3; } }
    return inp;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
