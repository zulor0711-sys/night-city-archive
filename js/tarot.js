/* =──────────────────────────────────────────────────────────────
  06 · 塔罗 — build a deck of twenty-two, draw, read
  Card sigils are procedurally drawn from a seeded PRNG so every
  arcana gets a unique occult-circuit diagram, deterministic per card.
  ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var root = document.getElementById('act-tarot');
  if (!root) return;

  var CARDS = window.NC_TAROT || [];
  if (!CARDS.length) return;

  var wall = document.getElementById('tarotWall');
  var big = document.getElementById('tarotBig');
  var kw = document.getElementById('tarotKw');
  var text = document.getElementById('tarotText');
  var drawBtn = document.getElementById('tarotDraw');
  var clearBtn = document.getElementById('tarotClear');

  /* deterministic pseudo-random */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* an occult-circuit sigil, unique per arcana */
  function sigil(n, vb) {
    var r = rng(n * 2654435761 + 1013904223);
    var p = [];
    var cx = 50, cy = vb ? 70 : 70;

    var rings = 1 + Math.floor(r() * 3);
    for (var i = 0; i < rings; i++) {
      p.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (10 + i * 12 + r() * 5).toFixed(1) + '"/>');
    }

    // radial spokes
    var spokes = 3 + Math.floor(r() * 5);
    for (var j = 0; j < spokes; j++) {
      var a = r() * Math.PI * 2;
      var r1 = 8 + r() * 10;
      var r2 = 22 + r() * 34;
      p.push('<line x1="' + (cx + Math.cos(a) * r1).toFixed(1) + '" y1="' + (cy + Math.sin(a) * r1).toFixed(1) +
             '" x2="' + (cx + Math.cos(a) * r2).toFixed(1) + '" y2="' + (cy + Math.sin(a) * r2).toFixed(1) + '"/>');
    }

    // a broken polygon
    var pts = 3 + Math.floor(r() * 3);
    var d = '';
    for (var k = 0; k < pts; k++) {
      var ang = (k / pts) * Math.PI * 2 + r() * 0.4;
      var rad = 16 + r() * 22;
      var x = cx + Math.cos(ang) * rad;
      var y = cy + Math.sin(ang) * rad;
      d += (k ? ' L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    }
    p.push('<path d="' + d + ' Z"/>');

    // pivot dots
    p.push('<circle cx="' + cx + '" cy="' + cy + '" r="1.6"/>');

    // horizon ticks
    p.push('<line x1="6" y1="' + (cy + 52) + '" x2="94" y2="' + (cy + 52) + '"/>');
    return '<svg viewBox="0 0 100 ' + (vb || 140) + '">' + p.join('') + '</svg>';
  }

  function eyeBack() {
    return '<svg viewBox="0 0 100 60">' +
      '<path d="M4 30 Q50 -6 96 30 Q50 66 4 30 Z" fill="none" stroke="rgba(237,233,223,.5)" stroke-width="1"/>' +
      '<circle cx="50" cy="30" r="11" fill="none" stroke="rgba(237,233,223,.5)" stroke-width="1"/>' +
      '<circle cx="50" cy="30" r="4" fill="rgba(252,238,10,.6)"/>' +
      '</svg>';
  }

  function buildWall() {
    if (!wall) return;
    wall.innerHTML = CARDS.map(function (c, i) {
      var tilt = ((i * 37) % 5 - 2) * 0.7;
      return '' +
        '<button class="tcard" type="button" data-i="' + i + '" style="--tilt:' + tilt + 'deg" ' +
          'data-cursor="' + c.cn + '" aria-label="' + c.cn + ' ' + c.en + '">' +
          '<span class="tcard__inner">' +
            '<span class="tcard__face tcard__back">' +
              '<span class="tcard__eye">' + eyeBack() + '</span>' +
            '</span>' +
            '<span class="tcard__face tcard__front" style="--c:' + (i % 3 === 0 ? '#fcee0a' : (i % 3 === 1 ? '#00e5ff' : '#ff2e63')) + '">' +
              '<span class="rm">' + c.roman + '</span>' +
              '<span class="tcard__sigil">' + sigil(c.n) + '</span>' +
              '<span><span class="tcard__cn">' + c.cn + '</span>' +
              '<span class="tcard__en">' + c.en + '</span></span>' +
              '<span class="bfooter"><span>NC-TAROT</span><span>' + String(c.n).padStart(2, '0') + '</span></span>' +
            '</span>' +
          '</span>' +
        '</button>';
    }).join('');

    wall.addEventListener('click', function (e) {
      var card = e.target.closest('.tcard');
      if (!card) return;
      var i = +card.getAttribute('data-i');
      if (card.classList.contains('is-open')) {
        card.classList.remove('is-open');
        window.NC && window.NC.sound('blip', 'click');
        return;
      }
      card.classList.add('is-open');
      reveal(i, true);
    });

    wall.addEventListener('pointerover', function (e) {
      if (e.target.closest('.tcard')) window.NC && window.NC.sound('blip', 'hover');
    });
  }

  function reveal(i, anim) {
    var c = CARDS[i];
    if (!c) return;

    if (big) {
      big.style.setProperty('--accent', i % 3 === 0 ? '#fcee0a' : (i % 3 === 1 ? '#00e5ff' : '#ff2e63'));
      big.innerHTML =
        '<span class="rm">' + c.roman + '</span>' +
        '<span class="sigil">' + sigil(c.n) + '</span>' +
        '<span><span class="cn">' + c.cn + '</span><br><span class="en">' + c.en + '</span></span>';
      big.classList.remove('is-live');
      if (anim) { void big.offsetWidth; big.classList.add('is-live'); }
    }
    if (kw) kw.textContent = c.kw;
    if (text) {
      text.style.opacity = '0';
      text.style.transform = 'translateY(5px)';
      setTimeout(function () {
        text.textContent = c.read;
        text.style.transition = 'opacity .5s, transform .5s';
        text.style.opacity = '1';
        text.style.transform = 'none';
      }, 120);
    }
    window.NC && window.NC.sound('startSting');
  }

  function draw() {
    var i = Math.floor(Math.random() * CARDS.length);
    if (wall) {
      var card = wall.querySelector('[data-i="' + i + '"]');
      if (card) {
        if (!card.classList.contains('is-open')) card.classList.add('is-open');
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
    reveal(i, true);
  }

  function clear() {
    if (wall) Array.prototype.forEach.call(wall.querySelectorAll('.tcard.is-open'), function (c) {
      c.classList.remove('is-open');
    });
    window.NC && window.NC.sound('blip', 'deny');
  }

  function init() {
    buildWall();
    // opening state: a deck face down, waiting
    if (big) {
      big.innerHTML =
        '<span class="rm">—</span>' +
        '<span class="sigil">' + eyeBack() + '</span>' +
        '<span><span class="cn">未抽取</span><br><span class="en">FACE DOWN</span></span>';
    }
    if (kw) kw.textContent = '牌面朝下 / NOT DRAWN';
    if (text) text.textContent = '二十二张牌散在这里。挑一张，或者让我替你抽。夜之城的墙上有它们全部的拷贝，但没人知道是谁画的第一张。';
    if (drawBtn) drawBtn.addEventListener('click', draw);
    if (clearBtn) clearBtn.addEventListener('click', clear);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
