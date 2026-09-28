/* 문장 다리 — 시작, 화면 흐름, 입력, 게임 루프 */
(function () {
  'use strict';
  var SB = window.SB, R = SB.render, AU = SB.audio, UI = SB.ui, $ = UI.$;
  var DT = SB.physics.DT;
  var IMG_BASE = 'data/media/img/';

  // ------------------------------------------------------------------ 주소창 옵션 (자동 플레이·시험용)
  var Q = {};
  location.search.replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); Q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '1'); });
  var AUTOPLAY = Q.autoplay === '1';
  var SHOTS = Q.shots === '1';
  var SPEED = +(Q.speed || 1);

  // ------------------------------------------------------------------ 저장 (이 기기에서만, 실패해도 게임은 된다)
  var KEY = 'sb.v1';
  var save = (function () { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  save.settings = save.settings || { music: true, sfx: true, char: 'tomi', pub: 'CJ', grade: 3 };
  save.units = save.units || {};
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 저장 못 해도 계속 */ } }
  var S = save.settings;

  // ------------------------------------------------------------------ 상태
  var G = { mode: 'menu', paused: false, shotWait: false, sim: null, bot: null, course: null, stage: null, charId: S.char || 'tomi', acc: 0, clearT: -1, sel: { pub: S.pub || 'CJ', grade: S.grade || 3 } };
  SB.game = G;

  // ------------------------------------------------------------------ 입력
  var keys = {};
  var touch = { left: false, right: false, jump: false };
  var KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump', KeyK: 'jump', KeyX: 'jump' };
  window.addEventListener('keydown', function (e) {
    var k = KEYMAP[e.code];
    if (G.mode === 'play' && !G.paused) {
      if (k) { keys[k] = true; e.preventDefault(); }
      if (e.code === 'KeyS' || e.code === 'KeyL') { replay(); e.preventDefault(); }
    }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (G.mode === 'play') { G.paused ? resume() : pause(); e.preventDefault(); } }
  });
  window.addEventListener('keyup', function (e) { var k = KEYMAP[e.code]; if (k) keys[k] = false; });
  window.addEventListener('blur', function () { keys = {}; touch.left = touch.right = touch.jump = false; });
  function readInput() { return { left: !!(keys.left || touch.left), right: !!(keys.right || touch.right), jump: !!(keys.jump || touch.jump) }; }

  // 터치 버튼: 손가락을 옆 버튼으로 미끄러뜨려도 따라간다
  var pointers = {};
  function btnAt(x, y) { var el = document.elementFromPoint(x, y); while (el && el !== document.body) { if (el.id === 't-left' || el.id === 't-right' || el.id === 't-jump') return el.id; el = el.parentElement; } return null; }
  function applyTouch() {
    touch.left = touch.right = touch.jump = false;
    Object.keys(pointers).forEach(function (id) { var b = pointers[id]; if (b === 't-left') touch.left = true; if (b === 't-right') touch.right = true; if (b === 't-jump') touch.jump = true; });
    ['t-left', 't-right', 't-jump'].forEach(function (id) { $(id).classList.toggle('on', Object.keys(pointers).some(function (p) { return pointers[p] === id; })); });
  }
  var pad = $('touch');
  pad.addEventListener('pointerdown', function (e) { var b = btnAt(e.clientX, e.clientY); if (b) { pointers[e.pointerId] = b; applyTouch(); e.preventDefault(); } });
  pad.addEventListener('pointermove', function (e) { if (pointers[e.pointerId] === undefined) return; var b = btnAt(e.clientX, e.clientY); if (b && b !== 't-jump' && pointers[e.pointerId] !== 't-jump') { pointers[e.pointerId] = b; applyTouch(); } });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { pad.addEventListener(ev, function (e) { delete pointers[e.pointerId]; applyTouch(); }); });
  pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  UI.touchMode = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  window.addEventListener('touchstart', function () { if (!UI.touchMode) { UI.touchMode = true; if (G.mode === 'play') $('touch').hidden = false; } }, { passive: true });

  // ------------------------------------------------------------------ 캔버스
  R.init($('game'));
  window.addEventListener('resize', function () { R.resize(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (G.mode === 'play' && !G.paused && !AUTOPLAY) pause(); AU.suspend(); } else AU.resume(); });

  // ------------------------------------------------------------------ 버튼 연결
  function on(id, fn) { $(id).addEventListener('click', function (e) { AU.unlock(); AU.sfx('click'); fn(e); }); }
  on('btn-start', function () { AU.unlock(); if (S.music) AU.startMusic(); goChar(); });
  on('btn-help', function () { $('help-keys').innerHTML = UI.keysHtml(UI.touchMode); UI.overlay('scr-help', true); });
  on('btn-help-close', function () { UI.overlay('scr-help', false); });
  on('btn-sound-title', function () { setSound(!(S.music || S.sfx)); });
  on('btn-char-back', function () { goTitle(); });
  on('btn-stage-back', function () { goChar(); });
  on('btn-intro-back', function () { goStage(); });
  on('btn-go', function () { play(); });
  on('btn-pause', function () { pause(); });
  on('btn-resume', function () { resume(); });
  on('btn-restart', function () { startStage(G.stage.id, G.course.index); });
  on('btn-to-stage', function () { quitToStage(); });
  on('btn-music', function () { S.music = !S.music; AU.setMusic(S.music); if (S.music) AU.startMusic(); persist(); syncToggles(); });
  on('btn-sfx', function () { S.sfx = !S.sfx; AU.setSfx(S.sfx); persist(); syncToggles(); });
  on('btn-units', function () { quitToStage(); });
  on('btn-again', function () { startStage(G.stage.id, (G.course.index + 1) % G.course.count); });
  on('btn-next', function () { var n = nextUnit(G.stage.id); if (n) startStage(n); });
  $('btn-listen').addEventListener('click', function () { AU.unlock(); replay(); });
  function setSound(onv) { S.music = onv; S.sfx = onv; AU.setMusic(onv); AU.setSfx(onv); if (onv) AU.startMusic(); persist(); syncToggles(); }
  function syncToggles() {
    $('btn-music').setAttribute('aria-pressed', S.music); $('btn-music').textContent = S.music ? '배경음악 켜짐' : '배경음악 꺼짐';
    $('btn-sfx').setAttribute('aria-pressed', S.sfx); $('btn-sfx').textContent = S.sfx ? '효과음 켜짐' : '효과음 꺼짐';
    var t = $('btn-sound-title'); t.setAttribute('aria-pressed', S.music || S.sfx); t.textContent = (S.music || S.sfx) ? '소리 켜짐' : '소리 꺼짐';
  }
  AU.setSfx(S.sfx); AU.musicOn = S.music;
  syncToggles();

  // ------------------------------------------------------------------ 화면 흐름
  function goTitle() { G.mode = 'menu'; $('hud').hidden = true; $('touch').hidden = true; UI.show('scr-title'); }
  function goChar() {
    G.mode = 'menu'; $('hud').hidden = true; $('touch').hidden = true;
    UI.buildCharCards(G.charId, function (id) {
      G.charId = id; S.char = id; persist();
      AU.sfx('select'); AU.sfx('joy', { char: id });
      setTimeout(goStage, AUTOPLAY ? 900 : 650);
    });
    UI.show('scr-char');
  }
  function goStage() {
    G.mode = 'menu'; $('hud').hidden = true; $('touch').hidden = true;
    UI.buildStageSelect(SB.catalog, G.sel, save.units, function (id) { AU.sfx('select'); startStage(id); });
    S.pub = G.sel.pub; S.grade = G.sel.grade; persist();
    UI.show('scr-stage');
  }
  function quitToStage() { AU.stopVoice(); G.sim = null; G.paused = false; goStage(); }
  function nextUnit(id) {
    var list = SB.catalog.units.slice().sort(function (a, b) { return a.pub.localeCompare(b.pub) || a.grade - b.grade || a.lesson - b.lesson; });
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i + 1] && list[i + 1].pub === list[i].pub ? list[i + 1].id : null;
    return null;
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('불러오기 실패: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadStage(id) {
    if (SB.stages[id]) return Promise.resolve(SB.stages[id]);
    return loadScript('data/stages/' + id + '.js').then(function () { if (!SB.stages[id]) throw new Error('단원 자료가 없어요: ' + id); return SB.stages[id]; });
  }
  function loadImages(keys) {
    return Promise.all(keys.filter(Boolean).map(function (k) {
      if (R.images[k]) return Promise.resolve();
      return new Promise(function (res) {
        var img = new Image();
        var done = function () { res(); };
        img.onload = done; img.onerror = done;
        setTimeout(done, 6000);
        img.src = IMG_BASE + k + '.jpg';
        R.images[k] = img;
      });
    }));
  }

  function startStage(id, courseIndex) {
    AU.stopVoice();
    $('loading').hidden = false; $('loading-text').textContent = '준비하고 있어요…';
    G.mode = 'menu';
    loadStage(id).then(function (stage) {
      var u = save.units[id] || {};
      var k = courseIndex !== undefined ? courseIndex : (Q.course !== undefined && AUTOPLAY ? +Q.course : (u.next || 0));
      var course = SB.content.buildCourse(stage, k);
      var level = SB.level.build(course);
      G.stage = stage; G.course = course;
      G.sim = new SB.Sim(level, G.charId);
      G.bot = AUTOPLAY ? new SB.Bot(G.sim, { mistakeRate: +(Q.mistakes || 0), seed: +(Q.seed || 3), thinkDelay: +(Q.think || 0), pitOnce: Q.pit === '1' }) : null;
      G.acc = 0; G.clearT = -1; G.paused = false;
      G.shotFlags = {};
      R.prepareLevel(level, G.charId);
      var imgs = [], auds = [];
      course.sequence.forEach(function (s) { imgs.push(s.img); auds.push(s.aud); });
      return Promise.all([loadImages(imgs), AU.preloadVoice(auds)]);
    }).then(function () {
      $('loading').hidden = true;
      showIntro();
    }).catch(function (e) {
      console.error(e);
      $('loading-text').textContent = '자료를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.';
      setTimeout(function () { $('loading').hidden = true; goStage(); }, 2500);
    });
  }

  function showIntro() {
    var st = G.stage, c = G.course;
    var pub = SB.catalog.publishers[st.pub] || { name: st.pub };
    $('intro-unit').textContent = pub.name + (pub.author ? '(' + pub.author + ')' : '') + ' · ' + st.grade + '학년 ' + st.lesson + '단원';
    $('intro-topic').textContent = st.topic;
    $('intro-meta').textContent = '문장 다리 ' + c.bridges + '개 · 낱말 풍선 ' + c.words + '개 · ' + (c.index + 1) + '/' + c.count + '번째 판';
    $('intro-keys').innerHTML = UI.keysHtml(UI.touchMode);
    UI.mini($('intro-char'), G.charId, 'idle', 3);
    G.mode = 'intro';
    UI.show('scr-intro');
    shot('intro');
    if (AUTOPLAY) setTimeout(play, 1200);
  }

  function play() {
    AU.unlock();
    if (S.music) AU.startMusic();
    UI.show(null);
    $('hud').hidden = false;
    $('touch').hidden = !UI.touchMode;
    $('rotate-tip').hidden = !(UI.touchMode && window.innerHeight > window.innerWidth);
    if (!$('rotate-tip').hidden) setTimeout(function () { $('rotate-tip').hidden = true; }, 5000);
    UI.hudInit(G.sim, G.course);
    G.mode = 'play';
    keys = {};
    setTimeout(function () { shot('play-start'); }, 1500 / SPEED);
  }
  function pause() { if (G.mode !== 'play') return; G.paused = true; keys = {}; UI.show('scr-pause'); AU.stopVoice(); }
  function resume() { G.paused = false; UI.show(null); }

  function replay() {
    if (!G.sim) return;
    var ch = G.sim.current();
    if (ch && ch.state !== 'waiting') G.sim.playPrompt(ch);
    flushEvents();
  }

  function finish() {
    var st = G.sim.stats;
    var id = G.stage.id;
    var u = save.units[id] || { best: 0, plays: 0 };
    u.best = Math.max(u.best || 0, st.starsEarned || 1);
    u.plays = (u.plays || 0) + 1;
    u.next = (G.course.index + 1) % G.course.count;
    save.units[id] = u; persist();
    $('hud').hidden = true; $('touch').hidden = true;
    UI.showResult({ stats: st, charId: G.charId, imgBase: IMG_BASE, hasNext: !!nextUnit(id) });
    G.mode = 'result';
    UI.show('scr-result');
    if (AUTOPLAY) {
      window.SB_AUTOPLAY_RESULT = { stage: id, course: G.course.index, char: G.charId, stats: st, violations: G.sim.violations };
      setTimeout(function () {
        var sendDone = function () { if (window.__sbDone) window.__sbDone(JSON.stringify(window.SB_AUTOPLAY_RESULT)); };
        if (SHOTS && window.__sbShot) { G.afterShot = sendDone; shot('result'); } else sendDone();
      }, 2200);
    }
  }

  // ------------------------------------------------------------------ 사건 처리 (소리·화면)
  var firstTip = {};
  function flushEvents() {
    var sim = G.sim;
    if (!sim) return;
    var evs = sim.events.splice(0, sim.events.length);
    evs.forEach(handle);
  }
  function handle(e) {
    var sim = G.sim;
    R.onEvent(e, sim);
    switch (e.type) {
      case 'jump': AU.sfx('jump', { char: G.charId }); break;
      case 'land': AU.sfx('land', { char: G.charId }); break;
      case 'voice':
        AU.voice(e.aud, { quiet: e.quiet });
        var lb = $('btn-listen'); lb.classList.add('playing'); clearTimeout(lb._t); lb._t = setTimeout(function () { lb.classList.remove('playing'); }, (e.ms || 1200) + 200);
        break;
      case 'challengeStart':
        UI.hudUpdate(sim, true);
        if (e.ch.type === 'bridge' && !firstTip.bridge) { firstTip.bridge = 1; UI.toast('뜻을 보고 블록을 순서대로 밟아요!', 'hint', 2200); }
        if (e.ch.type === 'word' && !firstTip.word) { firstTip.word = 1; UI.toast('그림에 맞는 풍선을 잡아요!', 'hint', 2200); }
        shotOnce('start-' + e.ch.idx, 0.9);
        break;
      case 'stepCorrect':
        AU.sfx('step', { n: e.n }); UI.promptFlash('ok'); UI.hudUpdate(sim, true);
        if (e.n === 2) shotOnce('bridge-steps-' + e.ch.idx, 0.25);
        break;
      case 'stepWrong':
        AU.sfx('wrong'); UI.promptFlash('no'); UI.hudUpdate(sim, true);
        if (e.count === 1) UI.toast(UI.pick(['다시 들어 볼까요?', '괜찮아요, 다시 해 봐요!', '소리를 잘 들어 봐요!']), 'soft');
        shotOnce('oops', 0.35);
        break;
      case 'hint':
        AU.sfx('hint');
        UI.toast(e.ch.type === 'bridge' ? '반짝이는 블록을 밟아 봐요!' : '반짝이는 풍선을 잡아 봐요!', 'hint', 1800);
        UI.hudUpdate(sim, true);
        shotOnce('hint', 0.2);
        break;
      case 'tip': UI.hudUpdate(sim, true); break;
      case 'plankPlaced': AU.sfx('place'); break;
      case 'bridgeComplete':
        AU.sfx('bridge'); AU.sfx('joy', { char: G.charId });
        R.flash = 0.18;
        UI.toast(e.ch.mistakes === 0 ? '완벽해요! 금빛 다리!' : '다리가 생겼어요!', 'good', 1500);
        UI.hudUpdate(sim, true);
        shotOnce('bridge-done-' + e.ch.idx, 0.9);
        break;
      case 'bridgeDone': UI.hudUpdate(sim, true); break;
      case 'balloonCorrect':
        AU.sfx('collect'); AU.sfx('joy', { char: G.charId });
        UI.toast(UI.pick(['낱말을 모았어요!', '딩동댕! 맞았어요!', '잘했어요!']), 'good');
        shotOnce('ride-' + e.ch.idx, 0.7);
        break;
      case 'balloonWrong':
        AU.sfx('pop'); AU.sfx('wrong'); UI.promptFlash('no'); UI.hudUpdate(sim, true);
        if (e.count === 1) UI.toast('뜻을 보고 다시 골라요!', 'soft');
        shotOnce('balloon-oops', 0.3);
        break;
      case 'wordDone': UI.hudUpdate(sim, true); break;
      case 'star': AU.sfx('star'); $('starnum').textContent = sim.stats.stars; break;
      case 'rescue':
        AU.sfx('bubble');
        var rc = sim.current();
        if (rc && rc.type === 'bridge' && !firstTip.pit) { firstTip.pit = 1; UI.toast('문장을 다 만들면 다리가 생겨요!', 'hint', 2400); }
        else UI.toast('방울이 구해 줬어요!', 'soft');
        shotOnce('rescue', 0.5);
        break;
      case 'clear':
        AU.sfx('clear');
        UI.toast('도착! 스테이지 클리어!', 'good', 1800);
        G.clearT = 0;
        shotOnce('goal', 0.9);
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ 스크린샷 (자동 플레이 검증용, CDP가 __sbShot을 붙였을 때만)
  var shotQueue = [];
  function shot(label) {
    if (!SHOTS || !window.__sbShot) return;
    G.shotWait = true;
    window.__sbShot(label);
  }
  SB.resumeFromShot = function () { G.shotWait = false; if (G.afterShot) { var f = G.afterShot; G.afterShot = null; f(); } };
  function shotOnce(label, delaySec) {
    if (!SHOTS || !window.__sbShot || G.shotFlags[label]) return;
    G.shotFlags[label] = 1;
    shotQueue.push({ label: label, at: G.sim.t + (delaySec || 0) });
  }
  SB.debugState = function () {
    var s = G.sim; if (!s) return { mode: G.mode };
    var c = s.current();
    var el = (performance.now() - perf.since) / 1000;
    return { mode: G.mode, t: s.t, x: s.p.x, y: s.p.y, anim: s.p.anim, state: s.p.state, ch: c && { idx: c.idx, type: c.type, state: c.state }, stats: s.stats, violations: s.violations.length, done: s.done,
      perf: { frames: perf.frames, avgWorkMs: perf.frames ? +(perf.work / perf.frames).toFixed(2) : 0, worstWorkMs: +perf.worst.toFixed(1), view: R.vw + 'x' + R.vh + ' @' + R.scale + 'x', elapsed: +el.toFixed(1) } };
  };

  // ------------------------------------------------------------------ 루프
  var lastT = performance.now() / 1000;
  // 처음 하는 아이를 위한 상황별 도움말 (한 번씩만)
  var tipT = { under: 0 };
  function contextTips(sim) {
    var p = sim.p, ch = sim.current();
    if (!ch || ch.state !== 'active' || p.state !== 'normal') { tipT.under = 0; return; }
    if (ch.type === 'bridge' && !firstTip.under && p.grounded && Math.abs(p.vx) < 5) {
      var under = ch.blocks.some(function (b) { return b.state === 'idle' && p.x > b.x && p.x < b.x + b.w; });
      tipT.under = under ? tipT.under + DT : 0;
      if (tipT.under > 1.6) { firstTip.under = 1; UI.toast('블록 밑에서 점프하면 올라가요!', 'hint', 2200); }
    }
    if (ch.type === 'word' && !firstTip.wall && p.wallPush > 1.4) { firstTip.wall = 1; UI.toast('맞는 풍선을 잡으면 벽을 넘어가요!', 'hint', 2200); }
  }
  function stepOnce() {
    var sim = G.sim;
    var inp = G.bot ? G.bot.input() : readInput();
    sim.step(inp);
    flushEvents();
    contextTips(sim);
    for (var i = shotQueue.length - 1; i >= 0; i--) {
      if (sim.t >= shotQueue[i].at) { var q = shotQueue.splice(i, 1)[0]; R.updateCamera(sim, 0.2); R.draw(sim, 0, performance.now() / 1000); shot(q.label); return; }
    }
    if (sim.done && G.clearT >= 0) {
      G.clearT += DT;
      if (G.clearT > 2.2 && G.mode === 'play') finish();
    }
  }
  // 성능 기록 (저사양 기기 점검용): 프레임 수, 한 프레임 처리 시간
  var perf = SB.perf = { frames: 0, work: 0, worst: 0, since: performance.now() };
  function loop(ts) {
    requestAnimationFrame(loop);
    var w0 = performance.now();
    loopBody(ts);
    var w = performance.now() - w0;
    if (G.mode === 'play') { perf.frames++; perf.work += w; if (w > perf.worst) perf.worst = w; }
  }
  function loopBody(ts) {
    var t = ts / 1000, dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    UI.tickMinis(dt);
    if (G.mode === 'play' && G.sim) {
      if (!G.paused && !G.shotWait) {
        G.acc += dt * SPEED;
        var n = 0, maxN = 8 * Math.max(1, SPEED);
        while (G.acc >= DT && n < maxN && !G.shotWait && G.mode === 'play') { stepOnce(); G.acc -= DT; n++; }
        if (n >= maxN) G.acc = 0;
      }
      if (G.mode === 'play') {
        R.updateCamera(G.sim, G.paused ? 0 : dt);
        R.draw(G.sim, G.paused ? 0 : dt, t);
        UI.hudUpdate(G.sim);
      }
    } else if (G.mode !== 'play') {
      R.drawMenu(dt, t, G.charId);
    }
  }

  // ------------------------------------------------------------------ 시작
  function boot() {
    if (!window.SB_SPRITES || !SB.catalog) {
      $('loading').hidden = false;
      $('loading-text').textContent = '게임 파일이 빠져 있어요 (assets/sprites/manifest.js 또는 data/catalog.js).';
      return;
    }
    R.loadSprites(window.SB_SPRITES, '').then(function () {
      R.prepareMenu();
      var tc = $('title-chars');
      ['tomi', 'vesta', 'bansuk'].forEach(function (id) { var c = document.createElement('canvas'); tc.appendChild(c); UI.mini(c, id, 'select_idle', 3); });
      requestAnimationFrame(loop);
      if (AUTOPLAY) {
        G.charId = Q.char || 'tomi';
        AU.unlock(); // 자동 플레이(시험)는 사용자 터치 없이 소리 경로까지 확인한다
        UI.show('scr-title');
        setTimeout(function () {
          shot('title');
          setTimeout(function () {
            goChar();
            setTimeout(function () {
              var card = document.querySelector('.char-card[data-id="' + G.charId + '"]');
              shot('char-select');
              setTimeout(function () {
                if (card) card.click();
                setTimeout(function () { shot('char-chosen'); setTimeout(function () { startStage(Q.stage || 'CJ-3-1'); }, 400); }, 450);
              }, 400);
            }, 900);
          }, 600);
        }, 900);
      } else if (Q.stage) {
        if (Q.char) G.charId = Q.char;
        startStage(Q.stage, Q.course !== undefined ? +Q.course : undefined);
      } else {
        UI.show('scr-title');
      }
    });
  }
  boot();
})();
