// 首页「刻度」交互（2026-11-15）
// 职责只有三件：
//   1) 把刻度尺上的光标移动到某一天，并把当天记录写进读数条与 aria-valuetext；
//   2) 让档案行与尺上齿点互相点亮；
//   3) 给图纸写滚动进度 --mz-p，并切换仪表的钉住状态。
// 数据全部来自构建期渲染的 #mz-data（真实条目），这里不生成任何内容。
// 无依赖；无 JS 时刻度、齿点、档案与链接照常可用（服务端已渲染）。

(function () {
  'use strict';

  var root = document.querySelector('.mz');
  var scale = document.querySelector('[data-mz-scale]');
  var dataEl = document.getElementById('mz-data');
  if (!root || !scale || !dataEl) return;

  var recs = [];
  try {
    recs = JSON.parse(dataEl.textContent || '[]');
  } catch (err) {
    recs = [];
  }

  var MIN = parseInt(scale.getAttribute('data-min'), 10);
  var MAX = parseInt(scale.getAttribute('data-max'), 10);
  if (!isFinite(MIN) || !isFinite(MAX)) return;
  var SPAN = Math.max(1, MAX - MIN);
  var DAY_MS = 86400000;

  var curEl = scale.querySelector('[data-mz-cur]');
  var dateEl = document.querySelector('[data-mz-date]');
  var sayEl = document.querySelector('[data-mz-say]');
  var listEl = document.querySelector('[data-mz-list]');
  var readEl = scale.parentNode ? scale.parentNode.querySelector('[data-mz-read]') : null;
  var recEls = Array.prototype.slice.call(document.querySelectorAll('.mz-rec'));
  var barEls = Array.prototype.slice.call(document.querySelectorAll('.mz-bar'));

  // 按日期分组：doc 里同一天可能有多条（例：5 个游戏都在 2026-10-18）
  var groups = {};
  for (var i = 0; i < recs.length; i++) {
    var r = recs[i];
    if (!r || !r.d) continue;
    (groups[r.d] || (groups[r.d] = [])).push(r);
  }
  var dayKeys = Object.keys(groups).sort();

  // 每月条数：读数为「这一天没有记录」时补一句本月总量，仍然是真实数据
  var monthTotals = {};
  for (var mk = 0; mk < recs.length; mk++) {
    var mkey = String(recs[mk].d || '').slice(0, 7);
    if (mkey) monthTotals[mkey] = (monthTotals[mkey] || 0) + 1;
  }

  var cursor = MAX;

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function ymdOf(dayNo) {
    var d = new Date(dayNo * DAY_MS);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function dayNoOf(ymd) {
    var p = String(ymd).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY_MS;
  }

  function clampDay(dayNo) {
    return Math.max(MIN, Math.min(MAX, dayNo));
  }

  function spokenDate(ymd) {
    var p = ymd.split('-');
    return p[0] + ' 年 ' + Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日';
  }

  // 松手时若距某个「有记录的日子」足够近就吸附过去（触摸端的主要命中方式）
  function nearestRecordDay(dayNo, tolerancePx) {
    if (!dayKeys.length) return null;
    var rect = scale.getBoundingClientRect();
    var pxPerDay = rect.width / SPAN;
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < dayKeys.length; i++) {
      var d = dayNoOf(dayKeys[i]);
      var dist = Math.abs(d - dayNo) * pxPerDay;
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return bestDist <= tolerancePx ? best : null;
  }

  function renderReadout(ymd) {
    var list = groups[ymd] || [];
    if (dateEl) dateEl.textContent = ymd;

    if (sayEl) {
      if (!list.length) {
        var mk = ymd.slice(0, 7);
        var inMonth = monthTotals[mk] || 0;
        sayEl.textContent = (ymd === ymdOf(MAX) ? '今天还没有记录' : '这一天没有记录')
          + (inMonth ? ' · 本月 ' + inMonth + ' 条' : '');
      } else {
        var kinds = {};
        for (var k = 0; k < list.length; k++) kinds[list[k].k] = 1;
        var kindNames = Object.keys(kinds);
        sayEl.textContent = list.length + ' 条记录 · ' + kindNames.join(' / ');
      }
    }

    if (listEl) {
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      var shown = list.slice(0, 2);
      for (var j = 0; j < shown.length; j++) {
        var href = shown[j].h;
        if (href) {
          var a = document.createElement('a');
          a.href = href;
          a.textContent = shown[j].t;
          listEl.appendChild(a);
        } else {
          var span = document.createElement('span');
          span.textContent = shown[j].t;
          listEl.appendChild(span);
        }
      }
      if (list.length > shown.length) {
        var more = document.createElement('span');
        more.textContent = '另有 ' + (list.length - shown.length) + ' 条';
        more.style.color = 'var(--sec-text-color)';
        listEl.appendChild(more);
      }
    }

    if (readEl) readEl.classList.toggle('mz-read--empty', list.length === 0);

    for (var m = 0; m < recEls.length; m++) {
      recEls[m].classList.toggle('is-hit', recEls[m].getAttribute('data-day') === ymd);
    }
  }

  function setCursor(dayNo, opts) {
    opts = opts || {};
    cursor = clampDay(dayNo);
    var ymd = ymdOf(cursor);
    var ratio = (cursor - MIN) / SPAN;

    if (curEl) curEl.style.setProperty('--x', (ratio * 100).toFixed(4) + '%');

    var list = groups[ymd] || [];
    var valueText = spokenDate(ymd) + '，' + (list.length ? list.length + ' 条记录：' + list[0].t : (cursor === MAX ? '今天还没有记录' : '没有记录'));
    scale.setAttribute('aria-valuenow', String(cursor - MIN));
    scale.setAttribute('aria-valuetext', valueText);

    renderReadout(ymd);

    if (opts.focusReadout && list.length && listEl && listEl.firstChild) {
      // 键盘跳到记录时，读数条里的第一条是可直接 Enter 的落点
      var first = listEl.querySelector('a');
      if (first) first.focus();
    }
  }

  function dayFromClientX(clientX) {
    var rect = scale.getBoundingClientRect();
    if (rect.width <= 0) return cursor;
    var ratio = (clientX - rect.left) / rect.width;
    ratio = Math.max(0, Math.min(1, ratio));
    return clampDay(Math.round(MIN + ratio * SPAN));
  }

  // --- 指针：拖动 / 点击；松手时向最近的齿点吸附（触摸端的主要命中方式） ---
  var dragging = false;
  var dragMoved = false;

  scale.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragging = true;
    dragMoved = false;
    scale.classList.add('is-dragging');
    try { scale.setPointerCapture(e.pointerId); } catch (err) {}
    setCursor(dayFromClientX(e.clientX));
    e.preventDefault();
  });

  scale.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    dragMoved = true;
    setCursor(dayFromClientX(e.clientX));
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    scale.classList.remove('is-dragging');
    try { scale.releasePointerCapture(e.pointerId); } catch (err) {}
    if (dragMoved) {
      var snapped = nearestRecordDay(cursor, 24);
      if (snapped !== null && snapped !== cursor) setCursor(snapped);
    }
  }

  scale.addEventListener('pointerup', endDrag);
  scale.addEventListener('pointercancel', endDrag);
  scale.addEventListener('lostpointercapture', function () {
    if (dragging) {
      dragging = false;
      scale.classList.remove('is-dragging');
    }
  });

  // --- 键盘：逐日 / 逐周 / 跳记录 / 首尾 / 复位 ---
  function stepPin(direction) {
    var ymd = ymdOf(cursor);
    var idx = dayKeys.indexOf(ymd);
    if (direction > 0) {
      for (var i = 0; i < dayKeys.length; i++) {
        if (dayNoOf(dayKeys[i]) > cursor) return dayNoOf(dayKeys[i]);
      }
      return null;
    }
    for (var j = dayKeys.length - 1; j >= 0; j--) {
      if (dayNoOf(dayKeys[j]) < cursor) return dayNoOf(dayKeys[j]);
    }
    void idx;
    return null;
  }

  scale.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 7 : 1;
    var next = null;

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = cursor - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = cursor + step;
        break;
      case 'PageUp':
        next = stepPin(-1);
        break;
      case 'PageDown':
        next = stepPin(1);
        break;
      case 'Home':
        next = MIN;
        break;
      case 'End':
        next = MAX;
        break;
      case 'Escape':
        next = MAX;
        break;
      default:
        return;
    }

    if (next === null) return;
    e.preventDefault();
    setCursor(next);
  });

  // --- 档案行 ↔ 月条：悬停或聚焦时点亮它所在月份的那根条 ---
  function lightMonth(day) {
    var month = day ? String(day).slice(0, 7) : '';
    for (var i = 0; i < barEls.length; i++) {
      barEls[i].classList.toggle('is-lit', barEls[i].getAttribute('data-month') === month);
    }
  }

  for (var n = 0; n < recEls.length; n++) {
    (function (el) {
      var day = el.getAttribute('data-day');
      el.addEventListener('pointerenter', function () { lightMonth(day); });
      el.addEventListener('focusin', function () { lightMonth(day); });
      el.addEventListener('pointerleave', function () { lightMonth(null); });
      el.addEventListener('focusout', function () { lightMonth(null); });
    })(recEls[n]);
  }

  // --- 图纸滚动进度：只写一个 --mz-p，位移与缩放交给 CSS ---
  var hero = document.querySelector('[data-mz-hero]');
  var plate = document.querySelector('[data-mz-plate]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var heroTop = 0;
  var pinRange = 0;
  var ticking = false;
  var lastP = -1;

  function measure() {
    if (!hero || !plate) return;
    var rect = hero.getBoundingClientRect();
    heroTop = rect.top + (window.pageYOffset || 0);
    pinRange = Math.max(1, hero.offsetHeight - plate.offsetHeight);
  }

  function frame() {
    ticking = false;

    if (!hero || !plate || reduce.matches) {
      if (lastP !== 0) {
        root.style.setProperty('--mz-p', '0');
        lastP = 0;
      }
      return;
    }

    var scrolled = (window.pageYOffset || 0) - heroTop;
    var p = Math.max(0, Math.min(1, scrolled / pinRange));
    if (Math.abs(p - lastP) > 0.002 || (p === 0 && lastP !== 0) || (p === 1 && lastP !== 1)) {
      root.style.setProperty('--mz-p', p.toFixed(4));
      lastP = p;
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(frame);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    measure();
    onScroll();
  });

  if (reduce.addEventListener) {
    reduce.addEventListener('change', onScroll);
  }

  measure();
  setCursor(MAX);
  frame();
})();
