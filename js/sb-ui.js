/* 문장 다리 — 화면(DOM) 다루기: 메뉴, 캐릭터 카드, 단원 고르기, HUD, 결과 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  var UI = SB.ui = {};
  var $ = function (id) { return document.getElementById(id); };
  UI.$ = $;

  var SCREENS = ['scr-title', 'scr-char', 'scr-stage', 'scr-intro', 'scr-pause', 'scr-result', 'scr-help'];
  UI.show = function (id) {
    SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
    var el = id && $(id);
    if (el) {
      var f = el.querySelector('[autofocus], .btn.primary, .char-card, .unit, .btn');
      if (f && !UI.touchMode) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }, 30);
    }
  };
  UI.overlay = function (id, on) { $(id).hidden = !on; };

  // ------------------------------------------------------------------ 작은 캔버스 애니메이션 (카드·결과)
  var minis = [];
  UI.mini = function (canvas, charId, anim, scale) {
    var s = scale || 1;
    canvas.width = 40 * s; canvas.height = 40 * s;
    var m = { canvas: canvas, ctx: canvas.getContext('2d'), charId: charId, anim: anim, t: 0, scale: s };
    m.ctx.imageSmoothingEnabled = false;
    for (var i = minis.length - 1; i >= 0; i--) if (minis[i].canvas === canvas) minis.splice(i, 1);
    minis.push(m);
    return m;
  };
  UI.tickMinis = function (dt) {
    for (var i = 0; i < minis.length; i++) {
      var m = minis[i];
      if (!m.canvas.isConnected || m.canvas.offsetParent === null) continue;
      m.t += dt;
      var man = SB.render.sprites.manifest;
      if (!man) continue;
      var a = man.animations[m.anim];
      if (a && !a.loop && m.t * a.fps >= a.frames + 6 && m.then) { m.anim = m.then; m.t = 0; m.then = null; }
      m.ctx.clearRect(0, 0, m.canvas.width, m.canvas.height);
      SB.render.drawSprite(m.ctx, m.charId, m.anim, m.t, 20 * m.scale, 38 * m.scale, false, m.scale);
    }
  };

  // ------------------------------------------------------------------ 알림 (토스트)
  var toastTimer = null;
  UI.toast = function (text, kind, ms) {
    var t = $('toast');
    t.textContent = text;
    t.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, ms || 1300);
  };
  UI.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  // ------------------------------------------------------------------ 캐릭터 카드
  var CHAR_TXT = {
    tomi: { chip: '통통 미끄러져요', ds: '다리 없는 기록 로봇. 떠서 미끄러지듯 움직여요.' },
    vesta: { chip: '또박또박 딱 멈춰요', ds: '행성 베스타의 별 요정. 짧은 다리로 씩씩하게 달려요.' },
    bansuk: { chip: '말랑말랑 통통 튀어요', ds: '"뀨!" 말랑한 달걀 고양이. 통통 튀며 다녀요.' },
  };
  UI.buildCharCards = function (current, onPick) {
    var box = $('char-cards');
    box.innerHTML = '';
    var man = SB.render.sprites.manifest;
    Object.keys(man.characters).forEach(function (id) {
      var c = man.characters[id];
      var b = document.createElement('button');
      b.className = 'char-card' + (id === current ? ' on' : '');
      b.dataset.id = id;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-label', c.name);
      var cv = document.createElement('canvas');
      b.appendChild(cv);
      var txt = document.createElement('div');
      txt.innerHTML = '<div class="nm">' + c.name + '</div><div class="chip">' + CHAR_TXT[id].chip + '</div><div class="ds">' + CHAR_TXT[id].ds + '</div>';
      b.appendChild(txt);
      var mini = UI.mini(cv, id, 'select_idle', 4);
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(box.children, function (o) { o.classList.toggle('on', o === b); });
        mini.anim = 'select_chosen'; mini.t = 0; mini.then = 'select_idle';
        onPick(id);
      });
      box.appendChild(b);
    });
  };

  // ------------------------------------------------------------------ 단원 고르기
  UI.buildStageSelect = function (catalog, sel, progress, onPick) {
    var pubs = Object.keys(catalog.publishers).sort(function (a, b) { return ['CJ', 'DA', 'DK', 'YBMC', 'YBMK'].indexOf(a) - ['CJ', 'DA', 'DK', 'YBMC', 'YBMK'].indexOf(b); });
    if (pubs.indexOf(sel.pub) < 0) sel.pub = pubs[0];
    var tabs = $('pub-tabs');
    tabs.innerHTML = '';
    pubs.forEach(function (p) {
      var info = catalog.publishers[p];
      var b = document.createElement('button');
      b.className = 'tab'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', p === sel.pub ? 'true' : 'false');
      b.innerHTML = info.name + (info.author ? '<small>' + info.author + '</small>' : '<small>&nbsp;</small>');
      b.addEventListener('click', function () { sel.pub = p; SB.audio.sfx('click'); UI.buildStageSelect(catalog, sel, progress, onPick); });
      tabs.appendChild(b);
    });
    var grades = {};
    catalog.units.forEach(function (u) { if (u.pub === sel.pub) grades[u.grade] = 1; });
    var gl = Object.keys(grades).map(Number).sort();
    if (gl.indexOf(sel.grade) < 0) sel.grade = gl[0];
    var gb = $('grade-btns');
    gb.innerHTML = '';
    gl.forEach(function (g) {
      var b = document.createElement('button');
      b.className = 'tab'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', g === sel.grade ? 'true' : 'false');
      b.textContent = g + '학년';
      b.addEventListener('click', function () { sel.grade = g; SB.audio.sfx('click'); UI.buildStageSelect(catalog, sel, progress, onPick); });
      gb.appendChild(b);
    });
    var grid = $('unit-grid');
    grid.innerHTML = '';
    catalog.units.filter(function (u) { return u.pub === sel.pub && u.grade === sel.grade; })
      .sort(function (a, b) { return a.lesson - b.lesson; })
      .forEach(function (u) {
        var best = (progress[u.id] && progress[u.id].best) || 0;
        var b = document.createElement('button');
        b.className = 'unit';
        b.innerHTML = '<span class="no">' + u.lesson + '단원</span><span class="tp">' + esc(u.topic) + '</span><span class="st">' +
          [1, 2, 3].map(function (i) { return '<span class="' + (i <= best ? 'on' : '') + '">★</span>'; }).join('') + '</span>';
        b.setAttribute('aria-label', u.grade + '학년 ' + u.lesson + '단원 ' + u.topic + ', 별 ' + best + '개');
        b.addEventListener('click', function () { onPick(u.id); });
        grid.appendChild(b);
      });
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  UI.esc = esc;

  UI.keysHtml = function (touch) {
    if (touch) return '<span>◀ ▶ 움직이기</span><span><b>점프</b> 뛰기</span><span>🔊 다시 듣기</span>';
    return '<span><kbd>←</kbd> <kbd>→</kbd> 움직이기</span><span><kbd>Space</kbd> 또는 <kbd>↑</kbd> 점프</span><span><kbd>S</kbd> 다시 듣기</span><span><kbd>Esc</kbd> 멈추기</span>';
  };

  // ------------------------------------------------------------------ HUD
  var hud = { course: null, lastKey: '' };
  UI.hudInit = function (sim, course) {
    hud.course = course; hud.lastKey = '';
    var pr = $('progress');
    pr.innerHTML = '';
    sim.L.challenges.forEach(function (c) { var i = document.createElement('i'); if (c.type === 'bridge') i.className = 'b'; pr.appendChild(i); });
    $('starnum').textContent = '0';
    UI.hudUpdate(sim, true);
  };
  UI.hudUpdate = function (sim, force) {
    var ch = sim.current();
    var key = ch ? ch.idx + ':' + ch.state + ':' + (ch.next || 0) + ':' + (ch.mistakes || 0) : 'none';
    if (!force && key === hud.lastKey) return;
    hud.lastKey = key;
    var items = $('progress').children;
    sim.L.challenges.forEach(function (c, i) {
      if (!items[i]) return;
      items[i].className = (c.type === 'bridge' ? 'b ' : '') + (c.state === 'done' || c.state === 'building' ? 'done' : ch && c === ch ? 'cur' : '');
    });
    var kind = $('prompt-kind'), main = $('prompt-main'), slots = $('prompt-slots'), box = $('prompt');
    box.classList.remove('empty');
    if (!ch) {
      kind.textContent = '거의 다 왔어요';
      main.textContent = '별 문으로 들어가요! →';
      slots.innerHTML = '';
      return;
    }
    var nb = sim.L.challenges.filter(function (c) { return c.type === ch.type; });
    var ord = nb.indexOf(ch) + 1;
    if (ch.state === 'waiting') {
      kind.textContent = ch.type === 'bridge' ? '다음: 문장 다리 ' + ord + '/' + nb.length : '다음: 낱말 풍선 ' + ord + '/' + nb.length;
      main.textContent = '앞으로 가요! →';
      slots.innerHTML = '';
      box.classList.add('empty');
      return;
    }
    if (ch.type === 'bridge') {
      kind.textContent = '문장 다리 ' + ord + '/' + nb.length + ' · 뜻을 보고 블록을 순서대로 밟아요';
      main.textContent = ch.spec.ko;
      var html = [];
      var done = ch.state === 'building' || ch.state === 'done';
      ch.spec.given.forEach(function (w) { html.push('<span class="s given">' + esc(w) + '</span>'); });
      var last = ch.spec.tokens.length - 1;
      ch.spec.tokens.forEach(function (w, i) {
        var on = i < ch.next;
        var end = i === last && ch.spec.end ? '<span class="end">' + esc(ch.spec.end) + '</span>' : '';
        html.push('<span class="s ' + (done ? 'done' : on ? 'on' : '') + '">' + (on || done ? esc(w) : '&nbsp;&nbsp;&nbsp;') + '</span>' + end);
      });
      slots.innerHTML = html.join('');
    } else {
      kind.textContent = '낱말 풍선 ' + ord + '/' + nb.length;
      if (ch.mistakes > 0 && ch.spec.ko) main.textContent = '뜻: ' + ch.spec.ko;
      else main.textContent = ch.spec.img ? '그림을 보고 소리를 들어요. 맞는 풍선을 잡아요!' : '소리를 듣고 맞는 풍선을 잡아요!';
      slots.innerHTML = '';
    }
  };
  UI.promptFlash = function (kind) {
    var b = $('prompt');
    b.classList.remove('flash-ok', 'flash-no');
    void b.offsetWidth;
    b.classList.add(kind === 'ok' ? 'flash-ok' : 'flash-no');
    setTimeout(function () { b.classList.remove('flash-ok', 'flash-no'); }, 420);
  };

  // ------------------------------------------------------------------ 결과
  UI.showResult = function (o) {
    var st = o.stats;
    $('result-title').textContent = '스테이지 클리어!';
    var stars = $('result-stars');
    stars.innerHTML = '<span>★</span><span>★</span><span>★</span>';
    var spans = stars.children;
    for (var i = 0; i < 3; i++) (function (i) {
      setTimeout(function () { spans[i].classList.add('shown'); if (i < st.starsEarned) { spans[i].classList.add('on'); SB.audio.sfx('star'); } }, 500 + i * 380);
    })(i);
    var msg = st.starsEarned === 3 ? '완벽해요! 문장 박사예요!' : st.starsEarned === 2 ? '잘했어요! 조금만 더 하면 별 세 개!' : '끝까지 해냈어요! 또 하면 더 잘할 거예요!';
    $('result-msg').textContent = msg;
    var min = Math.floor(st.time / 60), sec = Math.round(st.time % 60);
    $('result-stats').innerHTML =
      '<div>문장 <b>' + st.sentences.length + '</b>개 완성</div>' +
      '<div>낱말 <b>' + st.words.length + '</b>개 모음</div>' +
      '<div>한 번에 맞힘 <b>' + st.firstTry + '/' + st.decisions + '</b></div>' +
      '<div>별조각 <b>' + st.stars + '/' + st.starTotal + '</b></div>' +
      '<div>걸린 시간 <b>' + min + '분 ' + sec + '초</b></div>';
    var book = $('word-book');
    book.innerHTML = '';
    st.words.forEach(function (w) {
      var b = document.createElement('button');
      b.className = 'word-card';
      b.innerHTML = (w.img ? '<img alt="" src="' + o.imgBase + w.img + '.jpg">' : '') + '<span class="w">' + esc(w.en) + '</span><span class="k">' + esc(w.ko) + '</span>' + (w.first ? '<span class="first" title="한 번에 맞힘">★</span>' : '');
      b.addEventListener('click', function () { SB.audio.voice(w.aud); });
      book.appendChild(b);
    });
    var sl = $('sentence-list');
    sl.innerHTML = '';
    st.sentences.forEach(function (s) {
      var li = document.createElement('li');
      li.innerHTML = '<button class="icon-btn" aria-label="듣기"><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/></svg></button><div><div class="en">' + esc(s.en) + (s.first ? ' <span style="color:#FFC93C">★</span>' : '') + '</div><div class="ko">' + esc(s.ko) + '</div></div>';
      li.querySelector('button').addEventListener('click', function () { SB.audio.voice(s.aud); });
      sl.appendChild(li);
    });
    UI.mini($('result-char'), o.charId, 'clear', 3);
    $('btn-next').hidden = !o.hasNext;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
