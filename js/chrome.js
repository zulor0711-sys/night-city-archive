/* =──────────────────────────────────────────────────────────────
  05 · 义体 — ripperdoc fitting room
  Installing chrome costs humanity; the whole page feels it.
  ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var root = document.getElementById('act-chrome');
  if (!root) return;

  var WARES = window.NC_CHROME || [];
  var STATES = window.NC_HUMANITY || [];
  if (!WARES.length) return;

  var listEl = document.getElementById('chromeList');
  var ringEl = document.getElementById('chromeRing');
  var bigEl = document.getElementById('chromeBig');
  var statusEl = document.getElementById('chromeStatus');
  var countEl = document.getElementById('chromeCount');
  var resetEl = document.getElementById('chromeReset');
  var mPower = document.getElementById('mPower');
  var mMemory = document.getElementById('mMemory');
  var mCount = document.getElementById('mCount');
  var oPower = document.getElementById('oPower');
  var oMemory = document.getElementById('oMemory');
  var oCount = document.getElementById('oCount');

  var NS = 'http://www.w3.org/2000/svg';
  var CX = 200, CY = 200, R = 150, C = 2 * Math.PI * R;

  var installed = {};

  function svgEl(n, a) {
    var e = document.createElementNS(NS, n);
    if (a) for (var k in a) e.setAttribute(k, a[k]);
    return e;
  }

  function buildRing() {
    if (!ringEl) return;
    ringEl.innerHTML = '';

    // tick ring
    var ticks = svgEl('g', { class: 'ring__ticks' });
    for (var i = 0; i < 72; i++) {
      var a = (i / 72) * Math.PI * 2 - Math.PI / 2;
      var major = i % 9 === 0;
      var r1 = major ? 166 : 172;
      var r2 = 180;
      ticks.appendChild(svgEl('line', {
        x1: (CX + Math.cos(a) * r1).toFixed(1), y1: (CY + Math.sin(a) * r1).toFixed(1),
        x2: (CX + Math.cos(a) * r2).toFixed(1), y2: (CY + Math.sin(a) * r2).toFixed(1)
      }));
    }
    ringEl.appendChild(ticks);

    ringEl.appendChild(svgEl('circle', { class: 'ring__glow', cx: CX, cy: CY, r: R }));
    ringEl.appendChild(svgEl('circle', { class: 'ring__track', cx: CX, cy: CY, r: R }));

    var prog = svgEl('circle', {
      class: 'ring__prog', cx: CX, cy: CY, r: R,
      'stroke-dasharray': C.toFixed(2),
      'stroke-dashoffset': '0'
    });
    prog.id = 'ringProg';
    ringEl.appendChild(prog);

    // nodes + spokes for the eight slots
    WARES.forEach(function (w, i) {
      var ang = (i / WARES.length) * Math.PI * 2 - Math.PI / 2;
      var nx = CX + Math.cos(ang) * R;
      var ny = CY + Math.sin(ang) * R;

      var link = svgEl('line', {
        class: 'ring__link', 'data-i': i,
        x1: (CX + Math.cos(ang) * (R - 34)).toFixed(1),
        y1: (CY + Math.sin(ang) * (R - 34)).toFixed(1),
        x2: nx.toFixed(1), y2: ny.toFixed(1)
      });
      link.style.setProperty('--c', w.color);
      ringEl.appendChild(link);

      var node = svgEl('circle', {
        class: 'ring__node', 'data-i': i,
        cx: nx.toFixed(1), cy: ny.toFixed(1), r: 7
      });
      node.style.setProperty('--c', w.color);
      ringEl.appendChild(node);
    });
  }

  function statusFor(hw) {
    for (var i = 0; i < STATES.length; i++) if (hw >= STATES[i].min) return STATES[i];
    return STATES[STATES.length - 1];
  }

  function render() {
    var hw = 100;
    var power = 0;
    var count = 0;
    WARES.forEach(function (w, i) {
      if (installed[w.id]) { hw -= w.cost; power += w.gain; count++; }
    });
    hw = Math.max(0, hw);
    power = Math.min(100, power);
    var memory = Math.max(0, 100 - (100 - hw) * 1.5);

    // ring
    var prog = document.getElementById('ringProg');
    if (prog) {
      prog.setAttribute('stroke-dashoffset', (C * (1 - hw / 100)).toFixed(2));
      // full humanity reads as clean cyan; it goes amber, then blood
      var col = hw > 68 ? '#00e5ff' : (hw > 38 ? '#fcee0a' : '#ff1b1b');
      root.style.setProperty('--ring-c', col);
      if (ringEl) ringEl.style.setProperty('--ring-c', col);
    }
    if (ringEl) {
      Array.prototype.forEach.call(ringEl.querySelectorAll('.ring__node'), function (n) {
        n.classList.toggle('is-on', !!installed[WARES[+n.getAttribute('data-i')].id]);
      });
      Array.prototype.forEach.call(ringEl.querySelectorAll('.ring__link'), function (l) {
        l.classList.toggle('is-on', !!installed[WARES[+l.getAttribute('data-i')].id]);
      });
    }

    // centre readout
    if (bigEl) {
      bigEl.innerHTML = String(hw) + '<i>%</i>';
      bigEl.classList.toggle('is-low', hw < 34);
    }

    // meters
    if (mPower) mPower.style.width = power + '%';
    if (oPower) oPower.textContent = String(power).padStart(2, '0');
    if (mMemory) mMemory.style.width = memory + '%';
    if (oMemory) oMemory.textContent = String(Math.round(memory));
    if (mCount) mCount.style.width = (count / WARES.length * 100) + '%';
    if (oCount) oCount.textContent = count + '/' + WARES.length;
    if (countEl) countEl.textContent = '已装 ' + count + ' / ' + WARES.length;

    // status
    var st = statusFor(hw);
    if (statusEl) {
      statusEl.innerHTML = '<b>' + st.label + ' / ' + st.en + '</b>' + st.note;
      statusEl.style.borderLeftColor = hw < 34 ? 'var(--red)' : 'var(--line-2)';
    }

    // whole section reacts
    root.style.setProperty('--loss', ((100 - hw) / 100 * 0.65).toFixed(3));
    var chrome = root.querySelector('.chrome');
    if (chrome) chrome.classList.toggle('is-unstable', hw < 30);

    // sound bed
    if (window.NCAudio && window.NCAudio.setIntensity) {
      try { window.NCAudio.setIntensity((100 - hw) / 100); } catch (e) {}
    }
  }

  function buildList() {
    if (!listEl) return;
    listEl.innerHTML = WARES.map(function (w, i) {
      return '' +
        '<button class="chrome__row" type="button" data-id="' + w.id + '" data-cursor="植入">' +
          '<span class="chrome__sym" style="--c:' + w.color + '">' + w.sym + '</span>' +
          '<span>' +
            '<span class="chrome__name">' + w.cn + '</span>' +
            '<span class="chrome__sub">' + w.ware + ' · ' + w.en + '</span>' +
            '<span class="chrome__note">' + w.text + '</span>' +
          '</span>' +
          '<span class="chrome__cost">人性 <b>−' + w.cost + '</b></span>' +
        '</button>';
    }).join('');

    listEl.addEventListener('click', function (e) {
      var row = e.target.closest('.chrome__row');
      if (!row) return;
      var id = row.getAttribute('data-id');
      var w = null;
      for (var i = 0; i < WARES.length; i++) if (WARES[i].id === id) w = WARES[i];
      if (!w) return;

      if (installed[id]) {
        delete installed[id];
        window.NC && window.NC.sound('blip', 'deny');
      } else {
        installed[id] = true;
        window.NC && window.NC.sound('blip', 'confirm');
        window.NC && window.NC.sound('scanSweep');
      }
      row.classList.toggle('is-on', !!installed[id]);
      render();
    });

    // row style for installed colour
    listEl.addEventListener('pointerover', function (e) {
      var row = e.target.closest('.chrome__row');
      if (!row) return;
      window.NC && window.NC.sound('blip', 'hover');
    });
  }

  function init() {
    buildRing();
    buildList();
    if (resetEl) {
      resetEl.addEventListener('click', function () {
        installed = {};
        if (listEl) Array.prototype.forEach.call(listEl.querySelectorAll('.chrome__row'), function (r) {
          r.classList.remove('is-on');
        });
        window.NC && window.NC.sound('blip', 'deny');
        render();
      });
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
