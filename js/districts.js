/* =──────────────────────────────────────────────────────────────
  03 · 七区 — builds the survey map, the tabs and the dossier panel
  ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var section = document.getElementById('act-dist');
  if (!section) return;

  var DATA = window.NC_DISTRICTS || [];
  var MAP = window.NC_MAP || {};
  if (!DATA.length) return;

  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.getElementById('distMap');
  var tabsEl = document.getElementById('distTabs');
  var panel = document.getElementById('distPanel');
  var coordsEl = document.getElementById('distCoords');
  var wrap = document.getElementById('distMapWrap');
  var active = null;

  function svgEl(name, attrs) {
    var e = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function esc(s) { return String(s).replace(/</g, '&lt;'); }

  /* ───────────────────────────────────────────── map construction ── */
  function buildMap() {
    if (!svg) return;
    svg.innerHTML = '';

    var defs = svgEl('defs');

    var wg = svgEl('linearGradient', { id: 'ncWater', x1: '0', y1: '0', x2: '1', y2: '1' });
    [[0, '#050b12'], [55, '#061018'], [100, '#04080e']].forEach(function (s) {
      wg.appendChild(svgEl('stop', { offset: s[0] + '%', 'stop-color': s[1] }));
    });
    defs.appendChild(wg);

    var hatch = svgEl('pattern', {
      id: 'ncHatch', width: '8', height: '8', patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(35)'
    });
    hatch.appendChild(svgEl('line', {
      x1: '0', y1: '0', x2: '0', y2: '8',
      stroke: 'rgba(237,233,223,.16)', 'stroke-width': '1'
    }));
    defs.appendChild(hatch);

    // faint survey grid
    var gridPat = svgEl('pattern', { id: 'ncGrid', width: '50', height: '50', patternUnits: 'userSpaceOnUse' });
    gridPat.appendChild(svgEl('path', { d: 'M50 0 H0 V50', fill: 'none', stroke: 'rgba(237,233,223,.055)', 'stroke-width': '1' }));
    defs.appendChild(gridPat);

    svg.appendChild(defs);

    // water + land
    svg.appendChild(svgEl('path', { d: MAP.water, fill: 'url(#ncWater)' }));
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: 1000, height: 660, fill: 'url(#ncGrid)' }));

    var waterText = svgEl('text', {
      transform: 'translate(44,470) rotate(-74)',
      fill: 'rgba(0,229,255,.30)',
      'font-family': "'JetBrains Mono', monospace",
      'font-size': '8.4',
      'letter-spacing': '.34em'
    });
    waterText.textContent = 'PACIFIC OCEAN / 太平洋';
    svg.appendChild(waterText);

    svg.appendChild(svgEl('path', { d: MAP.land, class: 'nc-land' }));
    svg.appendChild(svgEl('path', { d: MAP.land, class: 'nc-hatch' }));

    // roads
    (MAP.roads || []).forEach(function (d) {
      svg.appendChild(svgEl('polyline', { points: d, class: 'nc-road' }));
    });
    if (MAP.highway) svg.appendChild(svgEl('polyline', { points: MAP.highway, class: 'nc-hwy' }));

    // survey frame ticks
    var ticks = svgEl('g', { class: 'nc-ticks' });
    for (var tx = 40; tx < 1000; tx += 40) {
      var majorX = tx % 200 === 0;
      ticks.appendChild(svgEl('line', { x1: tx, y1: 0, x2: tx, y2: majorX ? 8 : 3.5 }));
      ticks.appendChild(svgEl('line', { x1: tx, y1: 660, x2: tx, y2: majorX ? 652 : 656.5 }));
    }
    for (var ty = 40; ty < 660; ty += 40) {
      var majorY = ty % 200 === 0;
      ticks.appendChild(svgEl('line', { x1: 0, y1: ty, x2: majorY ? 8 : 3.5, y2: ty }));
      ticks.appendChild(svgEl('line', { x1: 1000, y1: ty, x2: majorY ? 992 : 996.5, y2: ty }));
    }
    svg.appendChild(ticks);

    // sector polygons + labels
    DATA.forEach(function (d, i) {
      if (d.points) {
        var p = svgEl('path', {
          d: 'M' + d.points.trim().split(/\s+/).join(' L') + ' Z',
          class: 'nc-dist',
          'data-id': d.id,
          tabindex: '0',
          role: 'button',
          'aria-label': d.cn + ' ' + d.en
        });
        p.style.setProperty('--d', d.color);
        p.setAttribute('data-cursor', d.cn);
        svg.appendChild(p);
      }

      var g = svgEl('g', { class: 'nc-label', transform: 'translate(' + d.label[0] + ',' + d.label[1] + ')', 'data-id': d.id });
      var idx = svgEl('text', { class: 'nc-label__idx', 'text-anchor': 'middle', y: '-19' });
      idx.textContent = String(i + 1).padStart(2, '0') + ' / SECTOR';
      var cn = svgEl('text', { class: 'nc-label__cn', 'text-anchor': 'middle', y: '0' });
      cn.textContent = d.cn;
      var en = svgEl('text', { class: 'nc-label__en', 'text-anchor': 'middle', y: '14' });
      en.textContent = d.en;
      g.appendChild(cn); g.appendChild(en); g.appendChild(idx);
      svg.appendChild(g);
    });

    // city centre marker
    var c = MAP.cross || [560, 400];
    var cross = svgEl('g', { class: 'nc-cross', transform: 'translate(' + c[0] + ',' + c[1] + ')' });
    cross.appendChild(svgEl('circle', { r: '4' }));
    cross.appendChild(svgEl('line', { x1: '-9', y1: '0', x2: '-5', y2: '0' }));
    cross.appendChild(svgEl('line', { x1: '5', y1: '0', x2: '9', y2: '0' }));
    cross.appendChild(svgEl('line', { x1: '0', y1: '-9', x2: '0', y2: '-5' }));
    cross.appendChild(svgEl('line', { x1: '0', y1: '5', x2: '0', y2: '9' }));
    svg.appendChild(cross);

    // interaction
    var paths = svg.querySelectorAll('.nc-dist');
    Array.prototype.forEach.call(paths, function (p) {
      var id = p.getAttribute('data-id');
      p.addEventListener('click', function () { select(id, true); });
      p.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id, true); }
      });
      p.addEventListener('pointerenter', function () { window.NC && window.NC.sound('blip', 'hover'); });
    });
  }

  /* ─────────────────────────────────────────────── tabs + panel ─── */
  function buildTabs() {
    if (!tabsEl) return;
    tabsEl.innerHTML = '';
    DATA.forEach(function (d, i) {
      var b = document.createElement('button');
      b.className = 'dist__tab';
      b.type = 'button';
      b.setAttribute('data-id', d.id);
      b.setAttribute('data-cursor', d.cn);
      b.style.setProperty('--d', d.color);
      b.innerHTML = '<s>' + String(i + 1).padStart(2, '0') + '</s>' + d.cn;
      b.addEventListener('click', function () { select(d.id, true); });
      tabsEl.appendChild(b);
    });
  }

  function bars(d) {
    return '' +
      '<div class="dist__bars">' +
        '<div class="dist__bar"><i><span>危险度</span><span>' + d.danger + '</span></i>' +
          '<div class="meter"><span class="meter__fill" style="width:' + d.danger + '%"></span></div></div>' +
        '<div class="dist__bar"><i><span>富裕度</span><span>' + d.wealth + '</span></i>' +
          '<div class="meter"><span class="meter__fill" style="width:' + d.wealth + '%"></span></div></div>' +
      '</div>';
  }

  function renderPanel(d, i) {
    if (!panel) return;
    panel.style.setProperty('--d', d.color);
    panel.innerHTML = '' +
      '<div class="dist__idx">' + String(i + 1).padStart(2, '0') + '</div>' +
      '<div class="dist__head">' +
        '<p class="dist__kicker">SECTOR ' + String(i + 1).padStart(2, '0') + ' · 已锁定</p>' +
        '<h3 class="dist__name">' + esc(d.cn) + '</h3>' +
        '<p class="dist__en">' + esc(d.en) + '</p>' +
      '</div>' +
      '<p class="dist__mood">' + d.mood + '</p>' +
      (d.threat ? '<p class="dist__threat">' + esc(d.threat) + '<s>NCPD // 官方威胁评级</s></p>' : '') +
      '<div class="dist__facts">' +
        '<div class="dist__fact"><span>势力</span><b>' + esc(d.faction) + '</b></div>' +
        '<div class="dist__fact"><span>子区</span><b>' + esc(d.sub) + '</b></div>' +
        '<div class="dist__fact"><span>地标</span><b>' + esc(d.places) + '</b></div>' +
        '<div class="dist__fact" style="border:0;padding-bottom:2px"><span>评级</span><b style="flex:1">' +
          '<span style="display:block">' + bars(d) + '</span></b></div>' +
      '</div>' +
      '<figure class="dist__media"><img alt="' + esc(d.en) + ' 视觉记录" src="' + esc(d.img) + '">' +
        '<figcaption>' + esc(d.cap) + '</figcaption></figure>';

    var img = panel.querySelector('img');
    if (img) {
      img.addEventListener('error', function () {
        var fig = img.parentNode;
        if (!fig || fig.classList.contains('is-empty')) return;
        fig.classList.add('is-empty');
        img.remove();
        var span = document.createElement('span');
        span.className = 'dist__nofeed';
        span.textContent = 'NO VISUAL FEED / 无视觉记录';
        fig.insertBefore(span, fig.firstChild);
      });
    }

    panel.classList.remove('is-swap');
    void panel.offsetWidth;
    panel.classList.add('is-swap');
  }

  function select(id, fromUser) {
    var idx = -1;
    for (var i = 0; i < DATA.length; i++) if (DATA[i].id === id) { idx = i; break; }
    if (idx < 0) return;
    var d = DATA[idx];
    active = id;

    if (svg) {
      Array.prototype.forEach.call(svg.querySelectorAll('.nc-dist'), function (p) {
        p.classList.toggle('is-on', p.getAttribute('data-id') === id);
      });
      Array.prototype.forEach.call(svg.querySelectorAll('.nc-label'), function (g) {
        g.style.opacity = g.getAttribute('data-id') === id ? '1' : '';
      });
    }
    if (tabsEl) {
      Array.prototype.forEach.call(tabsEl.children, function (b) {
        b.classList.toggle('is-on', b.getAttribute('data-id') === id);
      });
    }
    section.style.setProperty('--accent', d.color);
    var head = section.querySelector('.sec-head__idx');
    if (head) head.style.color = d.color;

    renderPanel(d, idx);
    if (fromUser) window.NC && window.NC.sound('blip', 'confirm');
  }

  /* coordinate readout while surveying */
  function bindCoords() {
    if (!wrap || !coordsEl || !svg) return;
    wrap.addEventListener('pointermove', function (e) {
      var r = svg.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width;
      var y = (e.clientY - r.top) / r.height;
      if (x < 0 || y < 0 || x > 1 || y > 1) return;
      coordsEl.textContent =
        'X ' + (x * 1000).toFixed(0).padStart(3, '0') +
        ' / Y ' + (y * 660).toFixed(0).padStart(3, '0') +
        '  ·  34°' + (38 + y * 0.4).toFixed(2) + '′N';
    });
  }

  function init() {
    if (!DATA.length) return;
    buildMap();
    buildTabs();
    bindCoords();
    select(DATA[0].id, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
