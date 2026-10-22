/* 节假日页的年历常驻详情卡。
 *
 * 与参考站对齐的交互（主人 2026-10-22 明确要求）：
 *   1. 常驻 —— 鼠标移开格子不消失，用户可以慢慢读、去点卡片里的链接；
 *      只有点右上角的 ×、按 Esc、或点到页面别处才收起。
 *   2. 位置固定在格子左侧（格子在最右列时，卡片盖在表格上方），
 *      左侧放不下就翻到右侧，都放不下才回落到格子上方；
 *      纵向以格子为中心并钳在视口内。
 *   3. 内容居中排布，与参考站的 .hc-tip 一致。
 *   4. 纯增强：脚本不加载时，左表与下方节日列表仍完整可读。
 *
 * 内容一律 textContent 写入，不拼 innerHTML——「数据 → HTML 字符串」这条路一旦打开，
 * 以后加字段就会变成注入口子。
 */

(function () {
  'use strict';

  var grid = document.querySelector('[data-cal-grid]');
  var dataEl = document.getElementById('cal-day-data');
  if (!grid || !dataEl) return;

  var map = {};
  try {
    map = JSON.parse(dataEl.textContent || '{}') || {};
  } catch (e) {
    map = {};
  }

  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var GAP = 14;   // 卡片与格子/视口的间距
  var EDGE = 12;  // 卡片与视口边缘的最小距离

  // ---- 建卡片（一次，复用）----
  var panel = document.createElement('div');
  panel.className = 'cal-panel';
  panel.setAttribute('role', 'tooltip');
  panel.setAttribute('aria-hidden', 'true');
  panel.hidden = true;

  var media = document.createElement('div');
  media.className = 'cal-panel-media';
  var img = document.createElement('img');
  img.className = 'cal-panel-img';
  img.alt = '';
  img.hidden = true;
  media.appendChild(img);

  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'cal-panel-close';
  close.setAttribute('aria-label', '关闭');
  close.textContent = '×';

  function mk(cls) { var e = document.createElement('p'); e.className = cls; return e; }
  var elDate = mk('cal-panel-date');
  var elLunar = mk('cal-panel-lunar');
  var elKicker = mk('cal-panel-kicker');
  var elName = mk('cal-panel-name');
  var elPinyin = mk('cal-panel-pinyin');
  var elDayNo = mk('cal-panel-dayno');
  var elDesc = mk('cal-panel-desc');
  var elExtra = mk('cal-panel-extra');
  var foot = document.createElement('div');
  foot.className = 'cal-panel-foot';
  var elArrange = mk('cal-panel-arrange');
  var elStat = mk('cal-panel-stat');
  var elLink = document.createElement('a');
  elLink.className = 'cal-panel-link';
  foot.appendChild(elArrange);
  foot.appendChild(elStat);
  foot.appendChild(elLink);

  [elDate, elLunar, elKicker, elName, elPinyin, elDayNo, elDesc, elExtra, foot].forEach(function (el) {
    panel.appendChild(el);
  });
  panel.insertBefore(media, panel.firstChild);
  panel.appendChild(close);
  document.body.appendChild(panel);

  function setText(el, value) {
    el.textContent = value || '';
    el.hidden = !value;
  }

  function fill(cell) {
    var key = cell.getAttribute('data-date') || '';
    var w = Number(cell.getAttribute('data-w'));
    var rec = map[key] || {};
    var weekday = isNaN(w) ? '' : WEEK[w];

    setText(elDate, weekday ? key + ' · ' + weekday : key);
    setText(elLunar, rec.lunar || '');
    setText(elKicker, rec.kicker || '');
    setText(elName, rec.name || '');
    setText(elPinyin, rec.pinyin || '');
    setText(elDayNo, rec.dayNo || '');
    setText(elDesc, rec.desc || '');
    setText(elExtra, rec.extra || '');
    setText(elArrange, rec.arrange || '');
    setText(elStat, rec.statutory || '');
    foot.hidden = !rec.arrange && !rec.statutory && !rec.anchor;

    if (rec.anchor) {
      elLink.textContent = '查看放假安排';
      elLink.setAttribute('href', '#' + rec.anchor);
      elLink.hidden = false;
    } else {
      elLink.textContent = '';
      elLink.removeAttribute('href');
      elLink.hidden = true;
    }

    if (rec.img) {
      img.src = rec.img;
      img.alt = rec.alt || '';
      img.hidden = false;
      media.hidden = false;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      media.hidden = true;
    }
  }

  function place(cell) {
    var g = grid.getBoundingClientRect();
    var r = cell.getBoundingClientRect();
    var w = panel.offsetWidth;
    var h = panel.offsetHeight;
    var left = g.left - GAP - w;

    if (left < EDGE) left = g.right + GAP;              // 格子在最右列：优先放左边
    if (left + w > window.innerWidth - EDGE) {           // 左边也放不下：翻到右边
      left = g.right + GAP;
    }
    if (left + w > window.innerWidth - EDGE) {           // 右边也放不下：格子上方
      left = r.left + r.width / 2 - w / 2;
    }
    if (left < EDGE) left = EDGE;
    if (left + w > window.innerWidth - EDGE) left = window.innerWidth - w - EDGE;

    var top = r.top + r.height / 2 - h / 2;
    if (top > window.innerHeight - h - EDGE) top = window.innerHeight - h - EDGE;
    if (top < EDGE) top = EDGE;

    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }

  function open(cell) {
    fill(cell);
    panel.hidden = false;
    panel.setAttribute('data-date', cell.getAttribute('data-date'));
    place(cell);
  }

  function closePanel() {
    panel.hidden = true;
  }

  function cellOf(node) {
    return node && node.closest ? node.closest('.cal-cell') : null;
  }

  // 悬停即开、移开不走（常驻）
  grid.addEventListener('mouseover', function (e) {
    var cell = cellOf(e.target);
    if (cell) open(cell);
  });

  // 触屏 / 鼠标点击：同一格再点一次收起
  grid.addEventListener('click', function (e) {
    var cell = cellOf(e.target);
    if (!cell) return;
    if (!panel.hidden && panel.getAttribute('data-date') === cell.getAttribute('data-date')) {
      closePanel();
      return;
    }
    open(cell);
  });

  close.addEventListener('click', closePanel);

  document.addEventListener('click', function (e) {
    if (panel.hidden) return;
    if (cellOf(e.target)) return;
    if (e.target.closest && e.target.closest('.cal-panel')) return;
    closePanel();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePanel();
  });

  // 滚动 / 缩放时卡片跟着走，不收起（收起会让「想读的内容」突然消失）
  function reposition() {
    if (panel.hidden) return;
    var cell = grid.querySelector('.cal-cell[data-date="' + panel.getAttribute('data-date') + '"]');
    if (cell) place(cell);
  }
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
})();
