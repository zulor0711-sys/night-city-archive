/* =──────────────────────────────────────────────────────────────
  NIGHT CITY ARCHIVE — core runtime
  boot · cursor · rain · reveal · rail/scene · parallax · audio gate
  Classic script, no modules (the page must run from file://).
  ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CAPTURE = !!window.__NC_CAPTURE__;

  var AUDIO = function () { return window.NCAudio || null; };
  var sound = function (fn) {
    try { var a = AUDIO(); if (a && typeof a[fn] === 'function') { return a[fn].apply(a, Array.prototype.slice.call(arguments, 1)); } } catch (e) {}
  };

  /* ══════════════════════════════════════════════════ 1 · BOOT ══ */

  var BOOT_LINES = [
    ['NET//ARCHIVE 神经系统握手', 'OK', 'ok'],
    ['解析存档节点 07 / 城市记忆', 'OK', 'ok'],
    ['记忆碎片 012 / 316', '47%', ''],
    ['情感残留扫描', '存在（异常）', 'warn'],
    ['检索 2023.08.20 核爆影像', '已加密', 'warn'],
    ['检测到精神污染指数', '越过阈值', 'bad'],
    ['警告：继续接入可能损害记忆完整性', '', 'bad'],
    ['准备建立神经连接', '…', '']
  ];

  var SCRAMBLE = '01#$/\\<>[]{}=+*ABCDEFGHXYZ夜之城义体记忆';

  function scramble(el, text, speed, done) {
    var i = 0;
    (function tick() {
      i += 1;
      var shown = text.slice(0, i);
      var noise = '';
      for (var k = 0; k < Math.min(3, text.length - i); k++) {
        noise += SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
      }
      el.textContent = shown + noise;
      if (i < text.length) {
        setTimeout(tick, speed * (0.4 + Math.random() * 0.9));
      } else {
        el.textContent = text;
        if (done) done();
      }
    })();
  }

  function runBoot() {
    var log = $('#bootLog');
    var gate = $('#bootGate');
    if (!log || !gate) return;

    if (CAPTURE || REDUCED) {
      var frag = '';
      BOOT_LINES.forEach(function (l) {
        frag += '<span class="' + l[2] + '">&gt; ' + l[0] + ' ' + (l[1] ? '·'.repeat(2) + ' ' + l[1] : '') + '\n</span>';
      });
      log.innerHTML = frag;
      gate.classList.add('is-on');
      var cb = $('#bootBar');
      if (cb) cb.style.width = '100%';
      return;
    }

    log.innerHTML = '';
    var idx = 0;

    function next() {
      if (idx >= BOOT_LINES.length) {
        gate.classList.add('is-on');
        return;
      }
      var line = BOOT_LINES[idx++];
      var row = document.createElement('span');
      row.className = line[2] || '';
      row.textContent = '> ';
      log.appendChild(row);

      var label = document.createElement('span');
      row.appendChild(label);

      scramble(label, line[0], 11, function () {
        if (line[1]) {
          /* 点线的列宽跟着视口走：手机上再按 26 列排会顶到屏幕外 */
          var colTarget = window.innerWidth < 720 ? 15 : 26;
          var pad = Math.max(2, colTarget - line[0].length);
          var tail = document.createElement('span');
          tail.textContent = '\u00a0' + '·'.repeat(pad) + ' ' + line[1];
          tail.style.color = line[2] === 'bad' ? 'var(--mag)' : (line[2] === 'warn' ? 'var(--yellow)' : 'var(--ink-dim)');
          row.appendChild(tail);
        }
        log.appendChild(document.createTextNode('\n'));
        var pct = $('#bootPct');
        if (pct) pct.textContent = 'INTEGRITY ' + String(47 + idx * 7).padStart(3, '0') + '%';
        var bar = $('#bootBar');
        if (bar) bar.style.width = Math.round((idx / BOOT_LINES.length) * 100) + '%';
        setTimeout(next, 150 + Math.random() * 160);
      });
    }

    setTimeout(next, 420);
  }

  function dismissBoot(instant) {
    var boot = $('#boot');
    var flash = $('#flash');
    if (!boot) return;
    document.body.classList.remove('is-locked');

    if (flash && !instant && !REDUCED) {
      flash.classList.add('is-on');
      setTimeout(function () { flash.classList.remove('is-on'); }, 110);
    }
    setTimeout(function () { boot.classList.add('is-gone'); }, instant ? 0 : 120);
    setTimeout(function () { boot.style.display = 'none'; }, instant ? 0 : 800);
    $('#act-hero') && $('#act-hero').classList.add('is-ready');
    sound('bootSequence');
    sound('setScene', 'hero');
  }

  /* ══════════════════════════════════════════════ 2 · AUDIO GATE ══ */

  var audioOn = false;

  function setAudio(on) {
    audioOn = on;
    var btn = $('#audioBtn');
    var st = $('#audioState');
    var st2 = $('.end-audio');
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (st) st.textContent = on ? 'ON' : 'OFF';
    if (st2) st2.textContent = on ? 'ON' : 'OFF';
    try {
      var a = AUDIO();
      if (!a) return;
      if (on) { a.init && a.init(); a.setEnabled && a.setEnabled(true); }
      else { a.setEnabled && a.setEnabled(false); }
    } catch (e) {}
  }

  function jackIn() {
    var done = false;
    var after = function () {
      if (done) return;
      done = true;
      dismissBoot(false);
    };
    // never let a slow / suspended audio context trap the visitor in boot
    setTimeout(after, 900);
    try {
      var a = AUDIO();
      if (a && a.init) {
        var p = a.init();
        if (p && p.then) {
          p.then(function () { setAudio(true); after(); }).catch(after);
          return;
        }
      }
    } catch (e) {}
    setAudio(true);
    after();
  }

  /* ══════════════════════════════════════════════ 3 · CUSTOM CURSOR ══ */

  function initCursor() {
    var cur = $('#cur');
    var label = $('#curLabel');
    if (!cur || window.matchMedia('(pointer: coarse)').matches) return;

    var mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;
    var active = false;
    var lastHot = null, lastBlip = 0;

    addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!active) { active = true; cx = mx; cy = my; cur.style.opacity = '1'; }
    }, { passive: true });

    addEventListener('pointerover', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('a,button,[data-cursor]') : null;
      if (t) {
        cur.classList.add('is-hot');
        var txt = t.getAttribute('data-cursor') || t.getAttribute('aria-label') || 'SELECT';
        if (label) label.textContent = txt;
        if (t !== lastHot) {
          lastHot = t;
          var now = performance.now();
          if (now - lastBlip > 70) { lastBlip = now; sound('blip', 'hover'); }
        }
      } else {
        cur.classList.remove('is-hot');
        lastHot = null;
      }
    }, { passive: true });

    addEventListener('pointerdown', function () { cur.classList.add('is-down'); });
    addEventListener('pointerup', function () { cur.classList.remove('is-down'); });
    document.addEventListener('mouseleave', function () { cur.classList.add('is-hidden'); });
    document.addEventListener('mouseenter', function () { cur.classList.remove('is-hidden'); });

    (function loop() {
      cx += (mx - cx) * 0.22;
      cy += (my - cy) * 0.22;
      cur.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
      requestAnimationFrame(loop);
    })();
  }

  /* ══════════════════════════════════════════════════════ 4 · RAIN ══ */

  function initRain() {
    var cv = $('#rain');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0;
    var drops = [];
    var COUNT = window.innerWidth < 760 ? 90 : 190;

    function size() {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed(d, initial) {
      d.x = Math.random() * (w + 200) - 100;
      d.y = initial ? Math.random() * h : -Math.random() * h * 0.5 - 20;
      d.len = 10 + Math.random() * 44;
      d.sp = 560 + Math.random() * 980;
      d.a = 0.05 + Math.random() * 0.2;
      d.tilt = 0.14 + Math.random() * 0.1;
      d.wd = 0.5 + Math.random() * 0.9;
    }

    drops.length = 0;
    for (var i = 0; i < COUNT; i++) { var d = {}; seed(d, true); drops.push(d); }
    size();
    addEventListener('resize', function () { size(); drops.forEach(function (d) { seed(d, true); }); });

    var last = performance.now();

    (function frame(now) {
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      for (var i = 0; i < drops.length; i++) {
        var d = drops[i];
        d.y += d.sp * dt;
        d.x -= d.sp * d.tilt * dt * 0.35;
        if (d.y > h + 60) seed(d, false);
        ctx.strokeStyle = 'rgba(196,226,255,' + d.a + ')';
        ctx.lineWidth = d.wd;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * d.tilt * 0.35, d.y - d.len);
        ctx.stroke();
      }
      requestAnimationFrame(frame);
    })(last);
  }

  /* ═══════════════════════════════════════════ 5 · REVEAL / SCENE ══ */

  function initReveal() {
    var items = $$('.reveal');
    if (!('IntersectionObserver' in window) || REDUCED) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { io.observe(el); });
  }

  function initChrome() {
    var sections = $$('[data-scene]');
    var rail = $('#rail');
    var sceneEl = $('#topbarScene');
    var current = null;

    if (rail) {
      sections.forEach(function (s) {
        var b = document.createElement('button');
        b.className = 'rail__item';
        b.type = 'button';
        b.setAttribute('data-target', s.id);
        b.setAttribute('data-cursor', '跳转');
        b.innerHTML = '<span class="rail__name">' + (s.getAttribute('data-name') || '') + '</span>' +
                      '<span class="rail__num">' + (s.getAttribute('data-index') || '') + '</span>';
        b.addEventListener('click', function () {
          sound('blip', 'click');
          s.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
        });
        rail.appendChild(b);
      });
    }

    function setScene(s) {
      if (!s || s === current) return;
      current = s;
      var scene = s.getAttribute('data-scene');
      var idx = s.getAttribute('data-index');
      var name = s.getAttribute('data-name');
      var en = { hero: 'CITY', city: 'CITY', districts: 'DISTRICTS', bd: 'BRAINDANCE',
                 chrome: 'CHROME', tarot: 'TAROT', interlude: 'INTERLUDE', end: 'END' }[scene] || '';
      if (sceneEl) sceneEl.innerHTML = '<b>' + (idx || '--') + '</b> / ' + name + ' ' + en;
      if (rail) {
        $$('.rail__item', rail).forEach(function (b) {
          b.classList.toggle('is-active', b.getAttribute('data-target') === s.id);
        });
      }
      sound('setScene', scene);
    }

    function onScroll() {
      var mid = innerHeight * 0.5;
      var found = null;
      for (var i = 0; i < sections.length; i++) {
        var r = sections[i].getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) { found = sections[i]; break; }
      }
      if (!found) {
        for (var j = 0; j < sections.length; j++) {
          if (sections[j].getBoundingClientRect().bottom > mid) { found = sections[j]; break; }
        }
      }
      setScene(found);
    }

    var ticking = false;
    addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { onScroll(); ticking = false; });
    }, { passive: true });

    onScroll();
  }

  /* ═══════════════════════════════════════ 5.5 · LIGHT SECTIONS ══ */
  /* the acid-yellow act needs the chrome to flip to black ink */
  function initLightChrome() {
    var lights = $$('[data-light]');
    if (!lights.length) return;
    var topbar = $('#topbar');
    var rail = $('#rail');

    function check() {
      var probe = 26;
      var lightAtBar = false;
      var lightInView = false;
      for (var i = 0; i < lights.length; i++) {
        var r = lights[i].getBoundingClientRect();
        if (r.top < probe && r.bottom > probe) lightAtBar = true;
        if (r.top < innerHeight && r.bottom > 0) lightInView = true;
      }
      if (topbar) topbar.classList.toggle('is-light', lightAtBar);
      if (rail) rail.classList.toggle('is-dim', lightInView);
    }

    addEventListener('scroll', check, { passive: true });
    addEventListener('resize', check);
    check();
  }

  /* ══════════════════════════════════════════════ 6 · PARALLAX ══ */

  function initParallax() {
    if (REDUCED) return;
    var media = $('#heroMedia');
    var img = $('#heroImg');
    if (!media) return;

    var sy = 0, mx = 0, my = 0, tmx = 0, tmy = 0;

    addEventListener('scroll', function () { sy = window.scrollY; }, { passive: true });
    addEventListener('pointermove', function (e) {
      tmx = (e.clientX / innerWidth - 0.5);
      tmy = (e.clientY / innerHeight - 0.5);
    }, { passive: true });

    (function loop() {
      mx += (tmx - mx) * 0.06;
      my += (tmy - my) * 0.06;
      var vis = clamp(1 - sy / (innerHeight * 1.1), 0, 1);
      media.style.transform = 'translate3d(' + (mx * -18).toFixed(2) + 'px,' +
        (sy * 0.22 + my * -12).toFixed(2) + 'px,0)';
      if (img) img.style.transform = 'scale(' + (1.06 + (1 - vis) * 0.05).toFixed(4) + ')';
      requestAnimationFrame(loop);
    })();
  }

  /* ══════════════════════════════════════════════ 7 · HUD CLOCK ══ */

  function initClock() {
    var el = $('#clock');
    if (!el) return;
    function tick() {
      var d = new Date();
      var p = function (n) { return String(n).padStart(2, '0'); };
      el.textContent = 'NC ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ══════════════════════════════════════════════ 8 · GLITCH ══ */

  function initGlitch() {
    var targets = $$('.glitch');
    if (REDUCED) return;
    targets.forEach(function (t) {
      t.addEventListener('pointerenter', function () {
        t.classList.add('is-live');
        setTimeout(function () { t.classList.remove('is-live'); }, 320);
      });
    });
    // an occasional atmosphere glitch on the big title
    setInterval(function () {
      if (document.hidden) return;
      var t = $('.hero__cn');
      if (!t) return;
      if (t.getBoundingClientRect().bottom < 0) return;
      t.classList.add('is-live');
      setTimeout(function () { t.classList.remove('is-live'); }, 180);
    }, 7000);
  }

  /* ══════════════════════════════════════════ 9.5 · STATE PROBES ══ */
  /* ?capture=1&test=chrome=4 / tarot=15 / bd=thermal,audio
     drives real UI clicks so states can be screenshotted, nothing else. */
  function runProbe(spec) {
    if (!spec) return;
    spec.split(';').forEach(function (part) {
      var kv = part.split('=');
      var key = (kv[0] || '').trim();
      var val = (kv[1] || '').trim();

      if (key === 'chrome') {
        var rows = $$('#chromeList .chrome__row').slice(0, parseInt(val, 10) || 0);
        rows.forEach(function (r) { r.click(); });
      } else if (key === 'tarot') {
        var card = $('#tarotWall .tcard[data-i="' + (parseInt(val, 10) || 0) + '"]');
        if (card) card.click();
      } else if (key === 'dist') {
        var tab = $('.dist__tab[data-id="' + val + '"]');
        if (tab) tab.click();
      } else if (key === 'bd') {
        val.split(',').forEach(function (layer) {
          var b = $('#bdLayers .bd__layer[data-layer="' + layer.trim() + '"]');
          if (b && !b.classList.contains('is-on')) b.click();
        });
      }
    });
  }

  /* ══════════════════════════════════════════════ 9 · WIRING ══ */

  function init() {
    runBoot();
    initCursor();
    initRain();
    initReveal();
    initChrome();
    initLightChrome();
    initParallax();
    initClock();
    initGlitch();

    var gate = $('#gate');
    if (gate) gate.addEventListener('click', jackIn);

    /* dev helper: ?autojack=1 walks the real boot→entry path unattended */
    if (/[?&]autojack=1/.test(location.search) && gate) {
      setTimeout(function () { gate.click(); }, 500);
    }

    var ab = $('#audioBtn');
    if (ab) ab.addEventListener('click', function () {
      sound('blip', 'click');
      setAudio(!audioOn);
    });
    var ab2 = $('#audioBtn2');
    if (ab2) ab2.addEventListener('click', function () {
      sound('blip', 'click');
      setAudio(!audioOn);
    });

    var rs = $('#restart');
    if (rs) rs.addEventListener('click', function () {
      sound('blip', 'confirm');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    if (CAPTURE) {
      var capBoot = window.__NC_CAPTURE__.boot;
      if (!capBoot) dismissBoot(true);
      var s = window.__NC_CAPTURE__.section;
      document.documentElement.style.scrollBehavior = 'auto';
      if (s) {
        var el = document.getElementById(s);
        if (el) {
          el.classList.add('is-target');
          el.classList.add('is-ready');
          // in solo mode the scene observer never fires — label the bar by hand
          var sc = $('#topbarScene');
          if (sc && el.getAttribute('data-index')) {
            var EN = { hero: 'CITY', districts: 'DISTRICTS', bd: 'BRAINDANCE', chrome: 'CHROME',
                       tarot: 'TAROT', interlude: 'INTERLUDE', end: 'END' };
            sc.innerHTML = '<b>' + el.getAttribute('data-index') + '</b> / ' +
                           el.getAttribute('data-name') + ' ' + (EN[el.getAttribute('data-scene')] || '');
          }
        }
      }
      $$('.reveal').forEach(function (r) { r.classList.add('is-in'); });
      var h = $('#act-hero'); if (h) h.classList.add('is-ready');
      runProbe(window.__NC_CAPTURE__.test);
    }

    // expose a tiny api for the act modules
    window.NC = {
      sound: sound,
      reduce: REDUCED,
      capture: CAPTURE,
      q: $,
      qa: $$,
      audioOn: function () { return audioOn; }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
