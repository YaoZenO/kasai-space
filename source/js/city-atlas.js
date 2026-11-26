/* global window, document */

'use strict';

// /city/ 城市档案交互图谱引擎（2026-11-26）：
//   1. 交互式中国省级热力 SVG 地图（悬停亮省 + 实时快报条 + 地图/宫格视图切换）；
//   2. Top 30 城市多维度实时重排（上榜次数 / GDP / 常住人口 / 地铁里程 / 高校数 / 行政面积）+ 分区筛选；
//   3. 2–3 城同屏 PK 对比实验室（底部对比托盘 + 原生 <dialog> 分组条形对比，含一键热门预设）。
(function () {
  var root = document.querySelector('.city-atlas');
  if (!root) return;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var rounded = Math.round(v * 10) / 10;
    var parts = String(rounded).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  // =========================================================================
  // 1. 地图 / 宫格视图切换 + 交互式中国 SVG 地图
  // =========================================================================
  var viewTabs = Array.prototype.slice.call(root.querySelectorAll('[data-atlas-view]'));
  var viewPanes = Array.prototype.slice.call(root.querySelectorAll('[data-atlas-pane]'));
  viewTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.getAttribute('data-atlas-view');
      viewTabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      viewPanes.forEach(function (p) {
        var on = p.getAttribute('data-atlas-pane') === target;
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
    });
  });

  var mapPaths = Array.prototype.slice.call(root.querySelectorAll('[data-map-prov]'));
  var readoutBox = root.querySelector('.ca-readout');
  var readoutName = readoutBox ? readoutBox.querySelector('[data-map-name]') : null;
  var readoutCount = readoutBox ? readoutBox.querySelector('[data-map-count]') : null;
  var readoutCities = readoutBox ? readoutBox.querySelector('[data-map-cities]') : null;
  var readoutGo = readoutBox ? readoutBox.querySelector('[data-map-go]') : null;

  function showProvince(el) {
    if (!el) return;
    mapPaths.forEach(function (p) {
      p.classList.toggle('is-active', p === el);
    });
    var name = el.getAttribute('data-map-name') || '';
    var count = el.getAttribute('data-map-count') || '0';
    var sample = el.getAttribute('data-map-sample') || '';
    var href = el.getAttribute('data-map-href') || '';
    if (readoutName) readoutName.textContent = name;
    if (readoutCount) readoutCount.textContent = count + ' 座城市';
    if (readoutCities) readoutCities.textContent = sample || '暂未收录代表城市';
    if (readoutGo) {
      if (href) {
        readoutGo.href = href;
        readoutGo.hidden = false;
      } else {
        readoutGo.hidden = true;
      }
    }
  }

  mapPaths.forEach(function (p) {
    p.addEventListener('mouseenter', function () { showProvince(p); });
    p.addEventListener('focus', function () { showProvince(p); });
    p.addEventListener('click', function () {
      var href = p.getAttribute('data-map-href');
      if (href) window.location.href = href;
    });
    p.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        var href = p.getAttribute('data-map-href');
        if (href) window.location.href = href;
      }
    });
  });

  // 默认高亮在册城市最多的省
  var defaultProv = root.querySelector('[data-map-default="true"]') || mapPaths[0];
  if (defaultProv) showProvince(defaultProv);

  // =========================================================================
  // 2. Top 30 城市多维度实时重排 + 地理分区筛选
  // =========================================================================
  var listEl = root.querySelector('[data-city-tiles]');
  if (!listEl) return;

  var tiles = Array.prototype.slice.call(listEl.querySelectorAll('.cr-tile'));
  var METRICS = {
    mentions: { label: '次上榜', unit: '次上榜', attr: 'data-mentions' },
    gdp: { label: 'GDP', unit: '亿元', attr: 'data-gdp' },
    pop: { label: '常住人口', unit: '万人', attr: 'data-pop' },
    metro: { label: '地铁里程', unit: 'km', attr: 'data-metro' },
    uni: { label: '高校数', unit: '所', attr: 'data-uni' },
    area: { label: '行政面积', unit: 'km²', attr: 'data-area' },
  };

  var curMetric = 'mentions';
  var curRegion = 'all';

  function numOf(el, attr) {
    var raw = el.getAttribute(attr);
    if (raw === null || raw === '') return null;
    var n = Number(raw);
    return isFinite(n) ? n : null;
  }

  function applySortAndFilter() {
    var m = METRICS[curMetric] || METRICS.mentions;
    var visible = tiles.filter(function (el) {
      var match = curRegion === 'all' || (el.getAttribute('data-region') || '') === curRegion;
      el.hidden = !match;
      return match;
    });

    visible.sort(function (a, b) {
      var va = numOf(a, m.attr);
      var vb = numOf(b, m.attr);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (vb !== va) return vb - va;
      return (numOf(b, 'data-mentions') || 0) - (numOf(a, 'data-mentions') || 0);
    });

    var maxVal = 0;
    visible.forEach(function (el) {
      var v = numOf(el, m.attr);
      if (v !== null && v > maxVal) maxVal = v;
    });

    var frag = document.createDocumentFragment();
    visible.forEach(function (el, idx) {
      var v = numOf(el, m.attr);
      var pct = v !== null && maxVal > 0 ? Math.max(4, Math.round((v / maxVal) * 100)) : 0;
      var rankEl = el.querySelector('.cr-tile-rank');
      var keyVal = el.querySelector('[data-key-val]');
      var keyUnit = el.querySelector('[data-key-unit]');
      var keyBar = el.querySelector('[data-key-bar]');
      if (rankEl) rankEl.textContent = String(idx + 1).padStart(2, '0');
      if (keyVal) keyVal.textContent = v === null ? '待补' : fmtNum(v);
      if (keyUnit) keyUnit.textContent = v === null ? '' : m.unit;
      if (keyBar) keyBar.style.width = pct + '%';
      frag.appendChild(el);
    });
    // 把隐藏的节点追加在末尾保持 DOM 完整
    tiles.forEach(function (el) {
      if (el.hidden) frag.appendChild(el);
    });
    listEl.appendChild(frag);

    var countHint = root.querySelector('[data-filter-count]');
    if (countHint) {
      countHint.textContent = curRegion === 'all'
        ? '共 ' + visible.length + ' 座 · 按「' + (curMetric === 'mentions' ? '上榜次数' : m.label) + '」排序'
        : curRegion + ' ' + visible.length + ' 座 · 按「' + (curMetric === 'mentions' ? '上榜次数' : m.label) + '」排序';
    }
  }

  var sortBtns = Array.prototype.slice.call(root.querySelectorAll('[data-sort-metric]'));
  sortBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      curMetric = btn.getAttribute('data-sort-metric') || 'mentions';
      sortBtns.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      applySortAndFilter();
    });
  });

  var regionBtns = Array.prototype.slice.call(root.querySelectorAll('[data-filter-region]'));
  regionBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      curRegion = btn.getAttribute('data-filter-region') || 'all';
      regionBtns.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      applySortAndFilter();
    });
  });

  // =========================================================================
  // 3. 多城同屏 PK 对比实验室（2–3 城）
  // =========================================================================
  var MAX_PK = 3;
  var selected = [];
  var bySlug = {};
  tiles.forEach(function (el) {
    var slug = el.getAttribute('data-slug');
    if (!slug) return;
    var photoEl = el.querySelector('.cr-tile-photo');
    bySlug[slug] = {
      slug: slug,
      name: el.getAttribute('data-name') || slug,
      meta: el.getAttribute('data-meta') || '',
      img: photoEl ? photoEl.getAttribute('src') || '' : '',
      href: el.getAttribute('data-href') || ('/city/' + slug + '/'),
      mentions: numOf(el, 'data-mentions'),
      gdp: numOf(el, 'data-gdp'),
      pop: numOf(el, 'data-pop'),
      metro: numOf(el, 'data-metro'),
      uni: numOf(el, 'data-uni'),
      area: numOf(el, 'data-area'),
      scenic: numOf(el, 'data-scenic'),
      el: el,
    };
  });

  var dock = document.getElementById('city-pk-dock');
  var dockChips = dock ? dock.querySelector('[data-pk-chips]') : null;
  var dockRun = dock ? dock.querySelector('[data-pk-open]') : null;
  var dockClear = dock ? dock.querySelector('[data-pk-clear]') : null;
  var dlg = document.getElementById('city-pk-dialog');
  var dlgBody = dlg ? dlg.querySelector('[data-pk-body]') : null;
  var dlgClose = dlg ? dlg.querySelector('[data-pk-close]') : null;

  function syncPkUi() {
    tiles.forEach(function (el) {
      var slug = el.getAttribute('data-slug');
      var on = selected.indexOf(slug) !== -1;
      el.classList.toggle('is-pk-picked', on);
      var btn = el.querySelector('[data-pk-toggle]');
      if (btn) {
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.textContent = on ? '✓ 已选' : '+ 对比';
      }
    });
    if (!dock || !dockChips || !dockRun) return;
    if (!selected.length) {
      dock.hidden = true;
      return;
    }
    dock.hidden = false;
    dockChips.innerHTML = selected
      .map(function (slug) {
        var c = bySlug[slug];
        return (
          '<span class="cpk-chip">' +
          esc(c ? c.name : slug) +
          '<button type="button" data-pk-rm="' + esc(slug) + '" aria-label="移除 ' + esc(c ? c.name : slug) + '">×</button>' +
          '</span>'
        );
      })
      .join('');
    dockRun.disabled = selected.length < 2;
    dockRun.textContent = selected.length < 2 ? '再选 1 城即可 PK' : '同屏对比 (' + selected.length + ' 城) →';
  }

  function togglePick(slug) {
    if (!bySlug[slug]) return;
    var i = selected.indexOf(slug);
    if (i !== -1) {
      selected.splice(i, 1);
    } else {
      if (selected.length >= MAX_PK) selected.shift();
      selected.push(slug);
    }
    syncPkUi();
  }

  root.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('[data-pk-toggle]') : null;
    if (btn) {
      ev.preventDefault();
      ev.stopPropagation();
      togglePick(btn.getAttribute('data-pk-toggle'));
      return;
    }
    var preset = ev.target && ev.target.closest ? ev.target.closest('[data-pk-preset]') : null;
    if (preset) {
      var list = (preset.getAttribute('data-pk-preset') || '').split(',').filter(function (s) { return !!bySlug[s]; });
      if (list.length >= 2) {
        selected = list.slice(0, MAX_PK);
        syncPkUi();
        openPkDialog();
      }
    }
  });

  if (dockChips) {
    dockChips.addEventListener('click', function (ev) {
      var rm = ev.target && ev.target.closest ? ev.target.closest('[data-pk-rm]') : null;
      if (!rm) return;
      togglePick(rm.getAttribute('data-pk-rm'));
    });
  }

  if (dockClear) {
    dockClear.addEventListener('click', function () {
      selected = [];
      syncPkUi();
    });
  }

  var PK_FIELDS = [
    { key: 'gdp', label: '地区生产总值 (GDP)', unit: '亿元' },
    { key: 'pop', label: '常住人口', unit: '万人' },
    { key: 'metro', label: '轨道交通里程', unit: 'km' },
    { key: 'uni', label: '普通高校数量', unit: '所' },
    { key: 'area', label: '行政区域面积', unit: 'km²' },
    { key: 'scenic', label: '5A 级景区', unit: '个' },
    { key: 'mentions', label: '本站上榜次数', unit: '次' },
  ];

  function openPkDialog() {
    if (!dlg || !dlgBody || selected.length < 2) return;
    var cities = selected.map(function (s) { return bySlug[s]; }).filter(Boolean);
    var headHtml =
      '<div class="cpk-cards" style="grid-template-columns:repeat(' + cities.length + ',minmax(0,1fr))">' +
      cities.map(function (c) {
        return (
          '<a class="cpk-head-card" href="' + esc(c.href) + '">' +
          (c.img ? '<img src="' + esc(c.img) + '" alt="' + esc(c.name) + '" />' : '') +
          '<div class="cpk-head-info"><b>' + esc(c.name) + '</b><span>' + esc(c.meta) + '</span></div>' +
          '</a>'
        );
      }).join('') +
      '</div>';

    var rowsHtml = PK_FIELDS.map(function (f) {
      var vals = cities.map(function (c) { return c[f.key]; });
      var maxV = 0;
      vals.forEach(function (v) { if (v !== null && v > maxV) maxV = v; });
      if (maxV === 0 && vals.every(function (v) { return v === null; })) return '';
      return (
        '<div class="cpk-metric">' +
        '<div class="cpk-metric-label">' + esc(f.label) + '</div>' +
        '<div class="cpk-bars">' +
        cities.map(function (c) {
          var v = c[f.key];
          var isMax = v !== null && maxV > 0 && v === maxV;
          var pct = v !== null && maxV > 0 ? Math.max(4, Math.round((v / maxV) * 100)) : 0;
          return (
            '<div class="cpk-bar-row' + (isMax ? ' is-lead' : '') + '">' +
            '<span class="cpk-bar-city">' + esc(c.name) + '</span>' +
            '<span class="cpk-bar-track"><i style="width:' + pct + '%"></i></span>' +
            '<span class="cpk-bar-val">' + (v === null ? '[待补]' : esc(fmtNum(v) + ' ' + f.unit)) + '</span>' +
            '</div>'
          );
        }).join('') +
        '</div></div>'
      );
    }).join('');

    dlgBody.innerHTML = headHtml + '<div class="cpk-metrics">' + rowsHtml + '</div>';
    if (typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
  }

  if (dockRun) dockRun.addEventListener('click', openPkDialog);
  if (dlgClose) dlgClose.addEventListener('click', function () { dlg.close(); });
  if (dlg) {
    dlg.addEventListener('click', function (ev) {
      if (ev.target === dlg) dlg.close();
    });
  }
})();
