/* 节假日页（/holidays/）年历一览的悬停说明。
 *
 * 设计约束：
 *   1. 纯增强。关掉脚本，上方的法定节假日表与下方的节日列表仍然完整可读，
 *      年历格子只是图形总览，不承载唯一信息。
 *   2. 浮层内容一律用 textContent 写入，不拼 innerHTML。数据虽然是自己写的 YAML，
 *      但「数据 → HTML 字符串」这条路一旦打开，以后加字段就会变成注入口子。
 *   3. 不做动效（DESIGN-LANGUAGE §6.1 白名单里没有浮层淡入，浮层出现即出现）。
 *   4. 位置用 position: fixed + 视口坐标，横向越界时翻到格子左侧，纵向钳在视口内。
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
  var GAP = 10;     // 浮层与格子之间的间距
  var EDGE = 12;    // 浮层与视口边缘的最小距离

  var tip = document.createElement('div');
  tip.className = 'cal-tip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;

  var elDate = document.createElement('p');
  elDate.className = 'cal-tip-date';
  var elKind = document.createElement('p');
  elKind.className = 'cal-tip-kind';
  var elName = document.createElement('p');
  elName.className = 'cal-tip-name';
  var elDesc = document.createElement('p');
  elDesc.className = 'cal-tip-desc';
  var elExtra = document.createElement('p');
  elExtra.className = 'cal-tip-extra';
  var elArrange = document.createElement('p');
  elArrange.className = 'cal-tip-arrange';
  var elLink = document.createElement('a');
  elLink.className = 'cal-tip-link';

  [elDate, elKind, elName, elDesc, elExtra, elArrange, elLink].forEach(function (el) {
    tip.appendChild(el);
  });
  document.body.appendChild(tip);

  var hideTimer = null;
  var pinned = false;

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
    // 普通工作日不进 payload（省体积），这里兜一个状态词，保证每张浮层都有状态行
    setText(elKind, rec.k || '工作日');
    setText(elName, rec.n ? (rec.p ? rec.n + ' ' + rec.p : rec.n) : '');
    setText(elDesc, rec.d || '');
    setText(elExtra, rec.x || '');
    setText(elArrange, rec.a || '');

    if (rec.h) {
      elLink.textContent = '查看放假安排';
      elLink.setAttribute('href', '#' + rec.h);
      elLink.hidden = false;
    } else {
      elLink.textContent = '';
      elLink.removeAttribute('href');
      elLink.hidden = true;
    }
  }

  function place(cell) {
    var r = cell.getBoundingClientRect();
    var tw = tip.offsetWidth;
    var th = tip.offsetHeight;

    var left = r.right + GAP;
    if (left + tw > window.innerWidth - EDGE) left = r.left - tw - GAP;
    if (left < EDGE) left = EDGE;

    var top = r.top + r.height / 2 - th / 2;
    var maxTop = window.innerHeight - th - EDGE;
    if (top > maxTop) top = maxTop;
    if (top < EDGE) top = EDGE;

    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }

  function show(cell) {
    clearTimeout(hideTimer);
    fill(cell);
    tip.hidden = false;
    place(cell);
  }

  function hide() {
    tip.hidden = true;
    pinned = false;
  }

  function scheduleHide() {
    if (pinned) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 140);
  }

  function cellOf(node) {
    return node && node.closest ? node.closest('.cal-cell') : null;
  }

  grid.addEventListener('mouseover', function (e) {
    var cell = cellOf(e.target);
    if (cell) {
      pinned = false;
      show(cell);
    }
  });

  grid.addEventListener('mouseout', function (e) {
    var to = e.relatedTarget;
    if (to && to.closest && to.closest('.cal-tip')) return;
    scheduleHide();
  });

  // 触屏：点一下就地钉住，点别处再收起。鼠标点击同样走这里，
  // 行为一致（点一下固定住，方便去点浮层里的链接）。
  grid.addEventListener('click', function (e) {
    var cell = cellOf(e.target);
    if (!cell) return;
    if (pinned) {
      hide();
      return;
    }
    pinned = true;
    show(cell);
  });

  document.addEventListener('click', function (e) {
    if (!pinned) return;
    if (cellOf(e.target) || (e.target.closest && e.target.closest('.cal-tip'))) return;
    hide();
  });

  tip.addEventListener('mouseenter', function () {
    clearTimeout(hideTimer);
  });
  tip.addEventListener('mouseleave', scheduleHide);

  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hide();
  });
})();
