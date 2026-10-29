/* =──────────────────────────────────────────────────────────────
  04 · 记忆 / BRAINDANCE — scrub a memory, switch the senses on/off
  ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var root = document.getElementById('act-bd');
  if (!root) return;

  var stage = document.getElementById('bdStage');
  var img = document.getElementById('bdImg');
  var heat = document.getElementById('bdHeat');
  var range = document.getElementById('bdRange');
  var fill = document.getElementById('bdFill');
  var head = document.getElementById('bdHead');
  var tc = document.getElementById('bdTc');
  var log = document.getElementById('bdLog');
  var playBtn = document.getElementById('bdPlay');
  var badge = document.getElementById('bdBadge');
  var wave = document.getElementById('bdWave');
  var layersEl = document.getElementById('bdLayers');

  if (!stage || !range) return;

  /* the memory transcript — an original piece written for this page */
  var LINES = [
    { t: 0,  cn: '她坐在窗边，雨还在下。',
              en: 'She sits by the window. The rain has not stopped.' },
    { t: 18, cn: '外面是两万盏霓虹，没有一盏是为她亮的。',
              en: 'Twenty thousand neon signs outside. Not one of them is for her.' },
    { t: 36, cn: '我数了她的呼吸，四十七次。',
              en: 'I counted her breaths. Forty-seven.' },
    { t: 52, cn: '然后我看到她左手的义体接口——和我的型号一样。',
              en: 'Then I saw the socket on her left hand. Same model as mine.' },
    { t: 68, cn: '这条记忆不是我的。我从来没坐过那个位置。',
              en: 'This memory is not mine. I have never sat in that chair.' },
    { t: 84, cn: '但雨声是真的。手臂的疼也是真的。',
              en: 'But the rain is real. And so is the pain in the arm.' },
    { t: 96, cn: '如果记忆可以被购买，那到底是谁在活着？',
              en: 'If memory can be bought, then who is it that lives?' }
  ];

  var state = {
    t: 0,
    visual: true,
    audio: false,
    thermal: false,
    playing: false,
    raf: 0
  };

  /* ------------------------------------------------------- rendering -- */
  function pad(n) { return String(Math.floor(n)).padStart(2, '0'); }

  function render() {
    var t = state.t;

    // timeline
    if (fill) fill.style.width = t + '%';
    if (head) head.style.left = t + '%';

    // timecode: 4 "seconds" per percent, film-style frames
    var total = t * 4.2;
    var hh = 0, mm = Math.floor(total / 60), ss = Math.floor(total % 60), ff = Math.floor((total % 1) * 24);
    if (tc) tc.innerHTML = pad(hh) + ':' + pad(mm) + ':' + pad(ss) + '<em>:' + pad(ff) + '</em>';

    // transcript
    var idx = 0;
    for (var i = 0; i < LINES.length; i++) if (t >= LINES[i].t) idx = i;
    if (log) {
      Array.prototype.forEach.call(log.children, function (el, i) {
        el.classList.toggle('is-on', i === idx);
        el.classList.toggle('is-past', i < idx);
      });
      var act = log.children[idx];
      if (act && log.scrollHeight > log.clientHeight + 4) {
        var target = act.offsetTop - log.clientHeight * 0.32;
        log.scrollTop += (target - log.scrollTop) * 0.35;
      }
    }

    // thermal intensity tracks the timeline a little (hotter in the middle)
    if (state.thermal && heat) {
      var heatAmt = 0.75 + Math.sin(t / 100 * Math.PI) * 0.22;
      heat.style.opacity = heatAmt.toFixed(2);
    }
  }

  function setLayer(name, on) {
    state[name] = on;
    stage.classList.toggle('is-' + (name === 'thermal' ? 'thermal' : name), on);
    if (name === 'visual') stage.classList.toggle('is-novisual', !on);

    var btn = layersEl && layersEl.querySelector('[data-layer="' + name + '"]');
    if (btn) btn.classList.toggle('is-on', on);

    if (badge) {
      var b = badge.querySelector('[data-badge="' + name + '"]');
      if (b) b.classList.toggle('on', on);
    }
    window.NC && window.NC.sound('blip', on ? 'click' : 'deny');
    window.NC && window.NC.sound('bdLayer', name, on);
    render();
  }

  function seek(t) {
    state.t = Math.max(0, Math.min(100, t));
    render();
  }

  /* ------------------------------------------------------- waveform --- */
  function initWave() {
    if (!wave) return;
    var cv = wave.querySelector('canvas');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var w = 0, h = 0;
    var bars = 96;
    var seeded = [];
    for (var i = 0; i < bars; i++) {
      seeded.push(0.2 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * .37)) * .8);
    }

    function size() {
      w = wave.clientWidth; h = wave.clientHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    addEventListener('resize', size);

    (function draw() {
      ctx.clearRect(0, 0, w, h);
      var bw = w / bars;
      var headX = (state.t / 100) * w;
      for (var i = 0; i < bars; i++) {
        var v = seeded[i] * (0.6 + Math.abs(Math.sin((i + performance.now() / 420))) * .5);
        var bh = v * h * 0.8;
        var x = i * bw;
        ctx.fillStyle = x < headX ? 'rgba(0,229,255,.55)' : 'rgba(138,77,255,.28)';
        ctx.fillRect(x + bw * 0.25, (h - bh) / 2, bw * 0.5, bh);
      }
      ctx.fillStyle = 'rgba(252,238,10,.9)';
      ctx.fillRect(headX, 0, 1, h);
      requestAnimationFrame(draw);
    })();
  }

  /* ----------------------------------------------------------- play --- */
  function togglePlay() {
    state.playing = !state.playing;
    if (playBtn) {
      playBtn.classList.toggle('is-on', state.playing);
      playBtn.querySelector('span').textContent = state.playing ? '暂停 / PAUSE' : '播放 / PLAY';
    }
    window.NC && window.NC.sound('blip', 'click');
    if (state.playing) loop();
    else cancelAnimationFrame(state.raf);
  }

  var lastT = 0;
  function loop(now) {
    if (!state.playing) return;
    var dt = now ? (now - (lastT || now)) / 1000 : 0;
    lastT = now || 0;
    if (dt > 0) seek(state.t + dt * 3.4);
    if (state.t >= 100) { seek(0); }
    state.raf = requestAnimationFrame(loop);
  }

  /* ----------------------------------------------------------- init --- */
  function init() {
    // build transcript
    if (log) {
      log.innerHTML = LINES.map(function (l) {
        return '<span class="bd__line"><em>' + ('0' + l.t).slice(-2) + '%</em>' + l.cn +
               '<br><span style="font-family:var(--f-mono);font-size:9px;letter-spacing:.06em;opacity:.45">' +
               l.en + '</span></span>';
      }).join('');
    }

    // build badges
    if (badge) {
      badge.innerHTML = '<span data-badge="visual" class="on">视觉 VIS</span>' +
                        '<span data-badge="audio">音频 AUD</span>' +
                        '<span data-badge="thermal">热成像 THM</span>';
    }

    // layer buttons
    if (layersEl) {
      var meta = [
        ['visual', '视觉层', 'VISUAL', '#00e5ff'],
        ['audio', '音频层', 'AUDIO', '#c8ff2e'],
        ['thermal', '热成像', 'THERMAL', '#ff6a00']
      ];
      layersEl.innerHTML = meta.map(function (m) {
        return '<button class="bd__layer' + (m[0] === 'visual' ? ' is-on' : '') + '" type="button" ' +
               'data-layer="' + m[0] + '" data-cursor="' + m[1] + '" style="--l:' + m[3] + '">' +
               '<i></i><b>' + m[1] + '</b><s>' + m[2] + '</s></button>';
      }).join('');
      layersEl.addEventListener('click', function (e) {
        var b = e.target.closest('.bd__layer');
        if (!b) return;
        var n = b.getAttribute('data-layer');
        setLayer(n, !state[n]);
      });
    } else {
      stage.classList.add('is-novisual');
    }

    // initial layer classes
    stage.classList.toggle('is-novisual', !state.visual);

    // seek by dragging anywhere on the stage
    stage.addEventListener('pointerdown', function (e) {
      var r = stage.getBoundingClientRect();
      seek(((e.clientX - r.left) / r.width) * 100);
    });

    // range input mirrors the state
    range.addEventListener('input', function () { seek(parseFloat(range.value)); });

    if (playBtn) playBtn.addEventListener('click', togglePlay);

    // keyboard
    addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') { seek(state.t + 2); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { seek(state.t - 2); e.preventDefault(); }
    });

    if (img) img.addEventListener('error', function () { img.style.opacity = '0'; });

    initWave();
    // opening frame: a slow sweep to 12% so the section is already alive
    seek(9);
    if (range) range.value = 9;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
