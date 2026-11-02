/* 节假日页的年历常驻详情卡 + 一览聚焦高亮。
 *
 * 交互照参考站（studycli.org 的 holiday-calendar.js）实现，两处按主人此前的明确要求保留：
 *   1. 只有**有内容的格子**才弹卡——法定节假日、其他节日、节气。
 *      普通工作日和周末不出卡（周末除了「周末」两个字没别的内容，弹框只是噪音）。
 *   2. 常驻 —— 鼠标从假期格移到旁边的普通格时，卡片**保持原样**，不换成那一格的内容，
 *      也不会消失；只有点 ×、按 Esc、点到页面别处才收起。
 *      （这是 2026-10-22 主人「移开不消失，我可以慢慢读」的要求；参考站是 280ms 后收起，
 *       那条路会让「想细看的内容」自己跑掉，所以没照搬。）
 *
 * 一览聚焦（照参考站 .hc-gl.is-hl + i.hl）：
 *   悬停左表某一行，或悬停一览里某个假期格 → 一览中该假期的格子保持不透明，其余降到
 *   0.28，同时左表对应行高亮。看一眼「国庆放的是哪几天」不用去数格子。
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
  img.loading = 'lazy';
  img.decoding = 'async';
  img.hidden = true;
  media.appendChild(img);
  // 自由授权图的署名行：作者 / 授权 + 链回 Commons 原文件页。授权要求，不能省。
  var credit = document.createElement('a');
  credit.className = 'cal-panel-credit';
  credit.target = '_blank';
  credit.rel = 'noopener nofollow';
  credit.hidden = true;
  media.appendChild(credit);

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

  var shownImg = '';

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
      // 同一张图不重复赋 src：重复赋值会打断已有的加载/解码，连续划过同一假期时像在重载。
      if (shownImg !== rec.img) {
        img.src = rec.img;
        img.alt = rec.alt || '';
        shownImg = rec.img;
      }
      img.hidden = false;
      media.hidden = false;
      credit.textContent = rec.credit || '';
      credit.hidden = !rec.credit;
      if (rec.creditUrl) credit.setAttribute('href', rec.creditUrl);
      else credit.removeAttribute('href');
    } else {
      shownImg = '';
      img.removeAttribute('src');
      img.hidden = true;
      credit.textContent = '';
      credit.hidden = true;
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

  // ---- 一览聚焦（参考站 light()）----
  // 按假期 id 预分组 + 记住当前高亮：每次换格只改「旧假期那几天」与「新假期那几天」，
  // 不再遍历 365 个格子逐个 classList.toggle。快速划过时原来的全量遍历会连续触发
  // 几百次样式失效，是「移动跟不上」的另一半原因。
  var groups = Object.create(null);
  Array.prototype.forEach.call(grid.querySelectorAll('.cal-cell[data-h]'), function (c) {
    var key = c.getAttribute('data-h');
    if (key) (groups[key] || (groups[key] = [])).push(c);
  });

  var rowMap = Object.create(null);
  Array.prototype.forEach.call(document.querySelectorAll('.cal-table tbody tr[data-h]'), function (tr) {
    rowMap[tr.getAttribute('data-h')] = tr;
  });

  var hlKey = '';
  var hlRow = null;

  function light(key, row) {
    key = key || '';
    row = row || null;
    if (key === hlKey && row === hlRow) return;

    if (hlKey && groups[hlKey]) {
      groups[hlKey].forEach(function (c) { c.classList.remove('is-hl'); });
    }
    if (hlRow) hlRow.classList.remove('is-hl');

    hlKey = key;
    hlRow = row;

    if (key && groups[key]) {
      groups[key].forEach(function (c) { c.classList.add('is-hl'); });
      grid.classList.add('is-hl');
    } else {
      grid.classList.remove('is-hl');
    }
    if (hlRow) hlRow.classList.add('is-hl');
  }

  function clearLight() {
    light('', null);
  }

  // ---- 开卡 / 关卡 ----
  var current = null;
  var rafId = 0;
  var queued = null;

  function rowOf(key) {
    return (key && rowMap[key]) || null;
  }

  function open(cell) {
    fill(cell);
    panel.hidden = false;
    panel.setAttribute('data-date', cell.getAttribute('data-date'));
    if (current) current.classList.remove('is-tip');
    current = cell;
    cell.classList.add('is-tip');
    var key = cell.getAttribute('data-h') || '';
    // 开的是节日/节气格时没有假期分组，必须把上一张卡留下的高亮清掉，
    // 否则卡片已经在讲另一个日子，年历里还亮着上一个假期。
    if (key) light(key, rowOf(key));
    else clearLight();
    place(cell);
  }

  function closePanel() {
    panel.hidden = true;
    if (current) current.classList.remove('is-tip');
    current = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      queued = null;
    }
    clearLight();
  }

  // 只有有内容的格子才弹卡；普通格一律不理（卡片保持原样，不换内容也不消失）
  function openable(cell) {
    return Boolean(cell && map[cell.getAttribute('data-date')]);
  }

  function cellOf(node) {
    return node && node.closest ? node.closest('.cal-cell') : null;
  }

  // 同一帧内只开一张卡：快速划过连续假期（春节、国庆一划就是七八格）时，
  // 原来的写法每格都同步重排一次卡片，连起来就是明显的掉帧。
  grid.addEventListener('pointerover', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var cell = cellOf(e.target);
    if (!openable(cell) || cell === current) return;
    queued = cell;
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = 0;
      var next = queued;
      queued = null;
      if (next) open(next);
    });
  });

  // 触屏：格子太小，点到空格时往左右找一格有内容的（参考站同款做法）
  grid.addEventListener('click', function (e) {
    var cell = cellOf(e.target);
    if (!openable(cell)) {
      if (cell) {
        var near = cell.previousElementSibling || cell.nextElementSibling;
        cell = openable(near) ? near : null;
      }
      if (!cell) return;
    }
    if (!panel.hidden && panel.getAttribute('data-date') === cell.getAttribute('data-date')) {
      closePanel();
      return;
    }
    open(cell);
  });

  // 左表行悬停 / 键盘聚焦：只点亮一览与行，不弹卡（参考站同款）
  Array.prototype.forEach.call(document.querySelectorAll('.cal-table tbody tr[data-h]'), function (tr) {
    var key = tr.getAttribute('data-h');
    tr.addEventListener('mouseenter', function () { light(key, tr); });
    tr.addEventListener('mouseleave', clearLight);
    tr.addEventListener('focusin', function () { light(key, tr); });
    tr.addEventListener('focusout', clearLight);
  });

  close.addEventListener('click', closePanel);

  document.addEventListener('click', function (e) {
    if (panel.hidden) return;
    if (cellOf(e.target)) return;
    if (e.target.closest && e.target.closest('.cal-panel')) return;
    if (e.target.closest && e.target.closest('.cal-table')) return;
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
