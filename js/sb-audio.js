/* 문장 다리 — 소리
 * 효과음·배경음악은 Web Audio로 그 자리에서 합성한다(파일 없음). 원어민 목소리는 data/media/snd/*.mp3.
 * iOS는 첫 터치 때 unlock() 해야 소리가 난다.
 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  var AU = SB.audio = { ctx: null, enabled: true, musicOn: true, sfxOn: true, voiceBase: 'data/media/snd/' };
  var ctx, master, sfxGain, musicGain, voiceGain, noiseBuf;
  var buffers = {};      // 목소리 디코딩 결과
  var pending = {};
  var elem = null;       // file:// 등 fetch가 안 될 때 쓰는 <audio>
  var canFetch = typeof location !== 'undefined' && /^https?:/.test(location.protocol);

  AU.unlock = function () {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { AU.enabled = false; return; }
      ctx = AU.ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
      musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
      voiceGain = ctx.createGain(); voiceGain.gain.value = 1.0; voiceGain.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (!elem) { elem = new Audio(); elem.preload = 'auto'; }
    // iOS: 같은 audio 요소를 사용자 동작 안에서 한 번 재생해 두면 나중에도 재생된다
    try { elem.muted = true; var pr = elem.play(); if (pr && pr.catch) pr.catch(function () {}); elem.pause(); elem.muted = false; } catch (e) { /* 무시 */ }
  };

  function now() { return ctx.currentTime; }
  function env(g, t, a, peak, dcy, sustain, rel) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + dcy);
    if (rel) g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy + rel);
  }
  function tone(type, f0, f1, dur, vol, t, dest) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.005, vol, dur * 0.9, 0.0001, 0.02);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(dur, vol, t, filterF, type) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type || 'lowpass'; f.frequency.value = filterF || 1200;
    env(g, t, 0.003, vol, dur, 0.0001);
    s.connect(f); f.connect(g); g.connect(sfxGain);
    s.start(t); s.stop(t + dur + 0.05);
  }
  var NOTE = function (n) { return 440 * Math.pow(2, (n - 69) / 12); };
  // 정답 블록마다 한 칸씩 올라가는 소리 (도레미솔라도레미)
  var STEP_SCALE = [72, 74, 76, 79, 81, 84, 86, 88];

  AU.sfx = function (name, opts) {
    if (!ctx || !AU.sfxOn) return;
    opts = opts || {};
    var t = now() + 0.005, ch = opts.char;
    switch (name) {
      case 'jump':
        if (ch === 'tomi') { tone('square', 520, 1040, 0.09, 0.12, t); tone('square', 1040, 1040, 0.04, 0.06, t + 0.07); }
        else if (ch === 'vesta') { tone('triangle', 660, 990, 0.12, 0.2, t); tone('sine', 1980, 1980, 0.08, 0.06, t + 0.05); }
        else { var o = tone('sine', 700, 1500, 0.13, 0.22, t); void o; tone('sine', 1500, 1300, 0.05, 0.08, t + 0.12); }
        break;
      case 'land': noise(0.06, ch === 'bansuk' ? 0.18 : 0.1, t, 500); if (ch === 'bansuk') tone('sine', 220, 160, 0.08, 0.12, t); break;
      case 'step': {
        var n = STEP_SCALE[Math.min(STEP_SCALE.length - 1, (opts.n || 1) - 1)];
        tone('triangle', NOTE(n), NOTE(n), 0.22, 0.28, t);
        tone('sine', NOTE(n + 12), NOTE(n + 12), 0.12, 0.08, t);
        break;
      }
      case 'wrong': tone('sine', 330, 220, 0.2, 0.18, t); tone('triangle', 247, 196, 0.22, 0.08, t + 0.03); break;
      case 'bonk': noise(0.04, 0.08, t, 900); break;
      case 'bridge': [60, 64, 67, 72, 76].forEach(function (m, i) { tone('triangle', NOTE(m), NOTE(m), 0.3, 0.2, t + i * 0.07); }); tone('sine', NOTE(84), NOTE(84), 0.5, 0.06, t + 0.35); break;
      case 'place': tone('sine', 1200, 1600, 0.08, 0.08, t); break;
      case 'pop': noise(0.08, 0.2, t, 3000, 'highpass'); tone('sine', 600, 180, 0.12, 0.12, t); break;
      case 'collect': tone('square', NOTE(79), NOTE(79), 0.08, 0.08, t); tone('square', NOTE(84), NOTE(84), 0.16, 0.08, t + 0.08); tone('triangle', NOTE(91), NOTE(91), 0.2, 0.06, t + 0.16); break;
      case 'star': tone('square', 988, 988, 0.05, 0.06, t); tone('square', 1319, 1319, 0.12, 0.06, t + 0.05); break;
      case 'bubble': for (var i = 0; i < 4; i++) tone('sine', 400 + i * 120, 700 + i * 120, 0.08, 0.08, t + i * 0.09); break;
      case 'hint': tone('sine', NOTE(76), NOTE(76), 0.18, 0.14, t); tone('sine', NOTE(81), NOTE(81), 0.3, 0.14, t + 0.16); break;
      case 'joy':
        if (ch === 'tomi') { [0, 1, 2].forEach(function (i) { tone('square', 880 + i * 220, 880 + i * 220, 0.05, 0.05, t + i * 0.06); }); }
        else if (ch === 'vesta') { tone('triangle', 1318, 1318, 0.1, 0.08, t); tone('triangle', 1760, 1760, 0.2, 0.07, t + 0.08); }
        else { tone('sine', 900, 1700, 0.12, 0.14, t); tone('sine', 1100, 1900, 0.12, 0.1, t + 0.13); }
        break;
      case 'clear': [72, 76, 79, 84, 79, 84, 88].forEach(function (m, i) { tone('square', NOTE(m), NOTE(m), i === 6 ? 0.5 : 0.14, 0.09, t + i * 0.12); tone('triangle', NOTE(m - 12), NOTE(m - 12), 0.14, 0.08, t + i * 0.12); }); break;
      case 'click': tone('sine', 800, 900, 0.04, 0.08, t); break;
      case 'select': tone('triangle', NOTE(76), NOTE(76), 0.08, 0.12, t); tone('triangle', NOTE(83), NOTE(83), 0.14, 0.12, t + 0.07); break;
      default: break;
    }
  };

  // ------------------------------------------------------------------ 목소리
  AU.preloadVoice = function (keys) {
    if (!canFetch) return Promise.resolve();
    return Promise.all(keys.filter(Boolean).map(function (k) { return loadVoice(k).catch(function (e) { console.warn('목소리 미리 받기 실패', k, e && e.message); }); }));
  };
  function loadVoice(key) {
    if (buffers[key]) return Promise.resolve(buffers[key]);
    if (pending[key]) return pending[key];
    pending[key] = fetch(AU.voiceBase + key + '.mp3').then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (ab) {
        if (!ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw new Error('no audio'); var tmp = new AC(); return tmp.decodeAudioData(ab).then(function (b) { buffers[key] = b; return b; }); }
        return new Promise(function (res, rej) { ctx.decodeAudioData(ab, function (b) { buffers[key] = b; res(b); }, rej); });
      });
    return pending[key];
  }
  var current = null;
  AU.voice = function (key, opts) {
    opts = opts || {};
    if (!key || !AU.enabled) return;
    AU.stopVoice();
    duck(true);
    var done = function () { duck(false); };
    if (ctx && buffers[key]) {
      var s = ctx.createBufferSource();
      s.buffer = buffers[key];
      var g = ctx.createGain(); g.gain.value = opts.quiet ? 0.75 : 1;
      s.connect(g); g.connect(voiceGain);
      s.onended = done;
      s.start();
      current = s;
      return;
    }
    if (ctx && canFetch) {
      loadVoice(key).then(function () { AU.voice(key, opts); }).catch(function (e) { console.warn('목소리 디코딩 실패', key, e && e.message); playElem(key, done); });
      return;
    }
    playElem(key, done);
  };
  function playElem(key, done) {
    if (!elem) { elem = new Audio(); }
    elem.onended = done;
    elem.src = AU.voiceBase + key + '.mp3';
    elem.volume = 1;
    var pr = elem.play();
    if (pr && pr.catch) pr.catch(function () { done(); });
    current = elem;
  }
  AU.stopVoice = function () {
    if (!current) return;
    try { if (current.stop) current.stop(); else current.pause(); } catch (e) { /* 이미 끝남 */ }
    current = null;
    duck(false);
  };
  function duck(on) {
    if (!ctx || !musicGain) return;
    var t = now();
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setTargetAtTime(AU.musicOn && musicPlaying ? (on ? 0.02 : MUSIC_VOL) : 0, t, 0.08);
  }

  // ------------------------------------------------------------------ 배경음악 (가볍고 밝은 8비트, 16마디 반복)
  var MUSIC_VOL = 0.085;
  var musicPlaying = false, musicTimer = null, nextNoteTime = 0, stepIdx = 0;
  var BPM = 104, STEP = 60 / BPM / 2; // 8분음표
  // 멜로디 (MIDI 번호, 0=쉼) 8분음표 128칸 = 16마디
  var MEL = [
    72, 0, 76, 0, 79, 0, 76, 0, 77, 0, 81, 0, 79, 0, 0, 0,
    76, 0, 79, 0, 84, 0, 79, 0, 81, 0, 79, 0, 76, 0, 0, 0,
    74, 0, 77, 0, 81, 0, 77, 0, 79, 0, 77, 0, 76, 0, 74, 0,
    72, 0, 76, 0, 74, 0, 71, 0, 72, 0, 0, 0, 0, 0, 0, 0,
    76, 76, 0, 79, 0, 81, 79, 0, 77, 0, 76, 0, 74, 0, 0, 0,
    72, 72, 0, 76, 0, 79, 76, 0, 81, 0, 79, 0, 77, 0, 0, 0,
    74, 0, 74, 76, 77, 0, 79, 0, 81, 0, 83, 0, 84, 0, 79, 0,
    81, 0, 79, 0, 77, 0, 74, 0, 72, 0, 0, 0, 0, 0, 0, 0,
  ];
  var CHORDS = [[48, 55], [53, 60], [48, 55], [45, 52], [50, 57], [43, 50], [48, 55], [48, 55]];
  function scheduleStep(i, t) {
    var m = MEL[i % MEL.length];
    if (m) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = NOTE(m);
      env(g, t, 0.01, 0.16, STEP * 1.4, 0.0001);
      o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + STEP * 1.6);
    }
    var bar = Math.floor((i % MEL.length) / 16) % CHORDS.length;
    var beat = i % 16;
    if (beat % 4 === 0) {
      var ch = CHORDS[bar];
      var b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = 'triangle'; b.frequency.value = NOTE(ch[beat % 8 === 0 ? 0 : 1] - 12 + 12);
      env(bg, t, 0.01, 0.3, STEP * 1.8, 0.0001);
      b.connect(bg); bg.connect(musicGain); b.start(t); b.stop(t + STEP * 2);
    }
    if (beat % 2 === 1) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
      s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
      env(ng, t, 0.002, 0.05, 0.03, 0.0001);
      s.connect(f); f.connect(ng); ng.connect(musicGain); s.start(t); s.stop(t + 0.05);
    }
  }
  function tick() {
    if (!musicPlaying) return;
    while (nextNoteTime < ctx.currentTime + 0.25) { scheduleStep(stepIdx++, nextNoteTime); nextNoteTime += STEP; }
    musicTimer = setTimeout(tick, 60);
  }
  AU.startMusic = function () {
    if (!ctx || musicPlaying) return;
    musicPlaying = true; stepIdx = 0; nextNoteTime = ctx.currentTime + 0.1;
    musicGain.gain.setTargetAtTime(AU.musicOn ? MUSIC_VOL : 0, ctx.currentTime, 0.3);
    tick();
  };
  AU.stopMusic = function () {
    musicPlaying = false;
    if (musicTimer) clearTimeout(musicTimer);
    if (ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  };
  AU.setMusic = function (on) { AU.musicOn = on; if (ctx) musicGain.gain.setTargetAtTime(on && musicPlaying ? MUSIC_VOL : 0, ctx.currentTime, 0.1); };
  AU.setSfx = function (on) { AU.sfxOn = on; };
  AU.suspend = function () { if (ctx && ctx.state === 'running') ctx.suspend(); };
  AU.resume = function () { if (ctx && ctx.state === 'suspended') ctx.resume(); };

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);
