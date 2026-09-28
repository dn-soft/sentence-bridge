/* 문장 다리 — 물리 (고정 시간 간격 1/60초). 브라우저와 검증 도구가 같은 코드를 쓴다.
 *
 * 공정성 원칙: 세 캐릭터의 최고 속도·점프 높이·중력은 같다. 다른 것은 가속·감속(손맛)뿐이라
 * 달려서 뛰는 최대 거리와 최대 높이가 같다 → 어느 캐릭터도 구덩이나 벽을 퀴즈 없이 넘을 수 없다.
 * (tools/validate.mjs 가 캐릭터마다 실제로 시뮬레이션해서 확인한다)
 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  var P = SB.physics = {};

  P.DT = 1 / 60;
  P.TILE = 16;
  var COMMON = {
    maxRun: 96,       // px/s
    jumpV: 380,       // 점프 순간 위로 속도
    gravity: 980,
    maxFall: 400,
    jumpCut: 170,     // 점프 버튼을 일찍 떼면 이 속도로 줄인다 (낮은 점프)
    coyote: 0.1,      // 발판에서 떨어진 직후에도 점프 허용 (아이들 손 느림 배려)
    buffer: 0.12,     // 착지 직전에 누른 점프도 받아 준다
    w: 12, h: 22,     // 부딪힘 상자 (그림보다 작게 잡아 억울한 충돌을 줄인다)
  };
  function mk(o) { var r = {}; var k; for (k in COMMON) r[k] = COMMON[k]; for (k in o) r[k] = o[k]; return r; }
  P.CHARS = {
    // 토미: 다리가 없어 미끄러지듯 — 천천히 붙고 천천히 멈춘다
    tomi: mk({ acc: 720, dec: 520, airAcc: 680, feel: 'glide' }),
    // 베스타: 짧은 다리로 또박또박 — 빨리 붙고 딱 멈춘다
    vesta: mk({ acc: 1300, dec: 1700, airAcc: 760, feel: 'snappy' }),
    // 반숙펫: 말랑하게 통통 — 중간 (착지할 때 눌리는 연출이 크다)
    bansuk: mk({ acc: 980, dec: 1150, airAcc: 720, feel: 'bouncy' }),
  };

  // 점프 최대 높이·거리 (이론값, 검증 도구가 시뮬레이션 값과 비교한다)
  P.jumpApex = function (c) { return (c.jumpV * c.jumpV) / (2 * c.gravity); };
  P.jumpAirTime = function (c) { return (2 * c.jumpV) / c.gravity; };

  function overlap(ax, ay, aw, ah, b) {
    return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;
  }
  P.overlap = overlap;

  // 몸(b: x=가운데, y=발) 이동과 충돌. solids: 막힌 상자, oneWays: 위에서만 서는 발판(블록·다리 판자).
  // 결과: { ground: 선 발판 또는 null, landedOneWay: 새로 올라선 발판, hitWall: -1|0|1, bonk: bool }
  P.move = function (b, dt, solids, oneWays, passFilter) {
    var res = { ground: null, landedOneWay: null, hitWall: 0, bonk: false };
    var hw = b.w / 2;
    // X
    var nx = b.x + b.vx * dt;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.off) continue;
      if (overlap(nx - hw, b.y - b.h + 0.01, b.w, b.h - 0.02, s)) {
        if (b.vx > 0) { nx = s.x - hw; res.hitWall = 1; }
        else if (b.vx < 0) { nx = s.x + s.w + hw; res.hitWall = -1; }
        b.vx = 0;
      }
    }
    b.x = nx;
    // Y
    var prevBottom = b.y;
    var ny = b.y + b.vy * dt;
    for (var j = 0; j < solids.length; j++) {
      var t = solids[j];
      if (t.off) continue;
      if (overlap(b.x - hw, ny - b.h, b.w, b.h, t)) {
        if (b.vy > 0) { ny = t.y; res.ground = t; }
        else if (b.vy < 0) { ny = t.y + t.h + b.h; res.bonk = true; }
        b.vy = 0;
      }
    }
    if (b.vy >= 0 && oneWays) {
      for (var k = 0; k < oneWays.length; k++) {
        var o = oneWays[k];
        if (o.off || (passFilter && passFilter(o))) continue;
        if (b.x + hw > o.x && b.x - hw < o.x + o.w && prevBottom <= o.y + 0.5 && ny >= o.y) {
          ny = o.y; b.vy = 0;
          res.ground = o;
          res.landedOneWay = o;
          break;
        }
      }
    }
    b.y = ny;
    return res;
  };

  // 발밑에 무언가 있는가 (서 있는지 확인용)
  P.supportAt = function (x, y, w, solids, oneWays) {
    var hw = w / 2;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.off) continue;
      if (x + hw > s.x && x - hw < s.x + s.w && Math.abs(s.y - y) < 0.6) return s;
    }
    if (oneWays) for (var k = 0; k < oneWays.length; k++) {
      var o = oneWays[k];
      if (o.off) continue;
      if (x + hw > o.x && x - hw < o.x + o.w && Math.abs(o.y - y) < 0.6) return o;
    }
    return null;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
