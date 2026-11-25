/* global window, document, navigator, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, MutationObserver, getComputedStyle */

'use strict';

// 关于页动态引擎 & 全站联系方式复制（2026-10-28 创建，2026-11-25 重构为零边框人物长卷）
//
// 职责：
//   1. 全站 [data-copy] 点击复制 + toast（首页与 /about/ 共用）；
//   2. /about/ 底层程序化经纬/等高线画布（#ab-bg-canvas）；
//   3. /about/ 随章节实时变形的几何图腾画布（#ab-specimen-canvas）+ 指针磁吸；
//   4. /about/ Sticky 滚动叙事章节联动、数字标尺进视口计数、轻量视差与磁吸链接；
//   5. /about/ 微信二维码原生 <dialog> 查看器。
(function () {
  var TOAST_ID = 'about-copy-toast';
  var hideTimer = null;

  function ensureToast() {
    var el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      el.className = 'about-copy-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  function toast(msg) {
    var el = ensureToast();
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 2400);
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = !!document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return legacyCopy(text);
        }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  // 1. 全站复制委托
  document.addEventListener('click', function (ev) {
    var target = ev.target;
    if (!target || !target.closest) return;
    var trigger = target.closest('[data-copy]');
    if (!trigger) return;
    ev.preventDefault();
    var text = trigger.getAttribute('data-copy') || '';
    if (!text) return;
    writeClipboard(text).then(function (ok) {
      toast(ok ? '已复制：' + text : '复制没成功，地址是：' + text);
    });
  });

  var monograph = document.querySelector('[data-ab-monograph]');
  var bgCanvasCheck = document.getElementById('ab-bg-canvas');
  if (!monograph && !bgCanvasCheck) return;

  var reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;

  // 读取当前主题色（亮/暗自动同步）
  var palette = { ink: '#1b1712', accent: '#a8482c' };
  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    var ink = (cs.getPropertyValue('--text-color') || '').trim();
    var acc = (cs.getPropertyValue('--accent') || '').trim();
    if (ink) palette.ink = ink;
    if (acc) palette.accent = acc;
  }
  readPalette();

  if (typeof MutationObserver !== 'undefined') {
    var mo = new MutationObserver(function () {
      readPalette();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-user-color-scheme', 'data-sun-scheme', 'class'],
    });
  }

  // 2. 微信二维码原生 <dialog>
  var qrDialog = document.getElementById('ab-qr-dialog');
  var qrTriggers = Array.prototype.slice.call(document.querySelectorAll('[data-ab-qr]'));
  if (qrDialog && typeof qrDialog.showModal === 'function' && qrTriggers.length) {
    qrTriggers.forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (!qrDialog.open) qrDialog.showModal();
      });
    });
    var qrClose = qrDialog.querySelector('[data-ab-qr-close]');
    if (qrClose) {
      qrClose.addEventListener('click', function () {
        qrDialog.close();
      });
    }
    qrDialog.addEventListener('click', function (ev) {
      if (ev.target === qrDialog) qrDialog.close();
    });
  }

  // 3. 单块三线切换（点击 / 键盘方向键切换，右侧单舞台展开 + 左侧图腾实时变形）
  var chapters = monograph ? Array.prototype.slice.call(monograph.querySelectorAll('[data-ab-chapter]')) : [];
  var jumpBtns = monograph ? Array.prototype.slice.call(monograph.querySelectorAll('[data-ab-jump]')) : [];
  var activeNumEl = monograph ? monograph.querySelector('[data-ab-active-num]') : null;
  var activeCapEl = monograph ? monograph.querySelector('[data-ab-active-caption]') : null;
  var progressEl = monograph ? monograph.querySelector('[data-ab-progress]') : null;
  var CAPTIONS = ['LOCAL-FIRST SYSTEMS', 'DIGITAL SPACE', 'DATA CURATION'];

  var activeChapter = 0;

  function setChapter(idx, focusBtn) {
    if (!chapters.length || idx < 0 || idx >= chapters.length) return;
    activeChapter = idx;

    chapters.forEach(function (ch, i) {
      var on = i === idx;
      ch.classList.toggle('is-active', on);
      if (on) ch.removeAttribute('hidden');
      else ch.setAttribute('hidden', 'hidden');
    });
    jumpBtns.forEach(function (btn, i) {
      var on = i === idx;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.setAttribute('tabindex', on ? '0' : '-1');
    });
    if (activeNumEl) {
      activeNumEl.textContent = String(idx + 1).padStart(2, '0');
    }
    if (activeCapEl && CAPTIONS[idx]) {
      activeCapEl.textContent = CAPTIONS[idx];
    }
    if (progressEl && chapters.length > 0) {
      var pct = Math.round(((idx + 1) / chapters.length) * 100);
      progressEl.style.height = pct + '%';
    }
    if (focusBtn && jumpBtns[idx]) {
      jumpBtns[idx].focus();
    }
  }

  if (monograph) {
    monograph.setAttribute('data-ab-ready', '1');
    setChapter(0, false);
  }

  jumpBtns.forEach(function (btn, idx) {
    btn.addEventListener('click', function () {
      setChapter(idx, false);
    });
    btn.addEventListener('keydown', function (ev) {
      var key = ev.key;
      if (key === 'ArrowDown' || key === 'ArrowRight') {
        ev.preventDefault();
        setChapter((idx + 1) % jumpBtns.length, true);
      } else if (key === 'ArrowUp' || key === 'ArrowLeft') {
        ev.preventDefault();
        setChapter((idx - 1 + jumpBtns.length) % jumpBtns.length, true);
      } else if (key === 'Home') {
        ev.preventDefault();
        setChapter(0, true);
      } else if (key === 'End') {
        ev.preventDefault();
        setChapter(jumpBtns.length - 1, true);
      }
    });
  });

  // 滚动驱动：背景经纬与首屏水印/肖像轻量视差
  var parallaxEls = Array.prototype.slice.call(document.querySelectorAll('[data-ab-parallax]'));
  var scrollY = window.scrollY || 0;
  var scrollRaf = 0;

  function onScrollFrame() {
    scrollRaf = 0;
    scrollY = window.scrollY || 0;

    if (!reducedMotion && parallaxEls.length) {
      parallaxEls.forEach(function (el) {
        var speed = parseFloat(el.getAttribute('data-ab-parallax')) || 0;
        var offset = Math.max(-90, Math.min(90, scrollY * speed));
        el.style.transform = 'translate3d(0, ' + offset.toFixed(1) + 'px, 0)';
      });
    }
  }

  window.addEventListener(
    'scroll',
    function () {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(onScrollFrame);
    },
    { passive: true }
  );
  onScrollFrame();

  // 3b. /now/ 阶段快照时间轴：滚动高亮对应月份节点 + 点击平滑跳转
  var nwTimeline = document.querySelector('[data-nw-timeline]');
  if (nwTimeline) {
    var nwLinks = Array.prototype.slice.call(nwTimeline.querySelectorAll('[data-nw-jump]'));
    var nwEntries = Array.prototype.slice.call(nwTimeline.querySelectorAll('[data-nw-entry]'));
    var setNwActive = function (id) {
      nwLinks.forEach(function (a) {
        a.classList.toggle('is-active', a.getAttribute('data-nw-jump') === id);
      });
    };
    nwLinks.forEach(function (a) {
      a.addEventListener('click', function (ev) {
        var id = a.getAttribute('data-nw-jump');
        var target = id ? document.getElementById(id) : null;
        if (!target) return;
        ev.preventDefault();
        setNwActive(id);
        target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      });
    });
    if (typeof IntersectionObserver !== 'undefined' && nwEntries.length) {
      var nwIo = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) setNwActive(e.target.getAttribute('data-nw-entry'));
          });
        },
        { rootMargin: '-18% 0px -60% 0px', threshold: 0.05 }
      );
      nwEntries.forEach(function (el) {
        nwIo.observe(el);
      });
    }
  }

  // 4. 磁吸编辑链接（桌面精细指针）
  if (finePointer && !reducedMotion) {
    var magnets = Array.prototype.slice.call(document.querySelectorAll('[data-ab-magnet]'));
    magnets.forEach(function (el) {
      el.addEventListener('pointermove', function (ev) {
        var r = el.getBoundingClientRect();
        var dx = ((ev.clientX - r.left) / r.width - 0.5) * 9;
        var dy = ((ev.clientY - r.top) / r.height - 0.5) * 6;
        el.style.transform = 'translate3d(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px, 0)';
      });
      el.addEventListener('pointerleave', function () {
        el.style.transform = '';
      });
    });
  }

  // 5. 巨型数字标尺进视口计数
  var countEls = Array.prototype.slice.call(document.querySelectorAll('[data-ab-count]'));
  if (countEls.length && !reducedMotion && typeof IntersectionObserver !== 'undefined') {
    var runCount = function (el) {
      var target = Number(el.getAttribute('data-ab-count'));
      var unit = el.getAttribute('data-ab-unit') || '';
      if (!target || target <= 1) return;
      var start = target > 100 ? target - 8 : 0;
      var duration = 560;
      var t0 = 0;
      var step = function (ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / duration);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = Math.round(start + (target - start) * eased);
        el.textContent = String(val) + unit;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    var countIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          runCount(entry.target);
          countIo.unobserve(entry.target);
        });
      },
      { threshold: 0.3 }
    );
    countEls.forEach(function (el) {
      countIo.observe(el);
    });
  }

  // 6. 底层程序化经纬/等高线画布（#ab-bg-canvas）
  var bgCanvas = document.getElementById('ab-bg-canvas');
  var bgCtx = bgCanvas && bgCanvas.getContext ? bgCanvas.getContext('2d') : null;
  var bgW = 0;
  var bgH = 0;
  var ptrX = 0.5;
  var ptrY = 0.4;

  if (finePointer) {
    window.addEventListener(
      'pointermove',
      function (ev) {
        ptrX = ev.clientX / (window.innerWidth || 1);
        ptrY = ev.clientY / (window.innerHeight || 1);
      },
      { passive: true }
    );
  }

  function resizeBg() {
    if (!bgCanvas || !bgCtx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    bgW = window.innerWidth || 1200;
    bgH = window.innerHeight || 800;
    bgCanvas.width = Math.round(bgW * dpr);
    bgCanvas.height = Math.round(bgH * dpr);
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawBg(time) {
    if (!bgCtx || !bgW || !bgH) return;
    bgCtx.clearRect(0, 0, bgW, bgH);

    var lines = 7;
    var scrollPhase = scrollY * 0.0018;
    var t = time * 0.00028;

    for (var i = 0; i < lines; i++) {
      var ratio = (i + 1) / (lines + 1);
      var baseY = bgH * (0.12 + ratio * 0.78);
      bgCtx.beginPath();
      for (var x = 0; x <= bgW; x += 28) {
        var nx = x / bgW;
        var wave =
          Math.sin(nx * 4.2 + t + i * 0.7 + scrollPhase) * 22 +
          Math.cos(nx * 2.1 - t * 0.7 + i * 1.1) * 14;
        var distPtr = Math.hypot(nx - ptrX, baseY / bgH - ptrY);
        var pull = distPtr < 0.36 ? (1 - distPtr / 0.36) * 24 : 0;
        var y = baseY + wave + pull * (ptrY - baseY / bgH);
        if (x === 0) bgCtx.moveTo(x, y);
        else bgCtx.lineTo(x, y);
      }
      bgCtx.strokeStyle = i === 2 || i === 5 ? palette.accent : palette.ink;
      bgCtx.globalAlpha = i === 2 || i === 5 ? 0.075 : 0.045;
      bgCtx.lineWidth = 1;
      bgCtx.stroke();
    }
    bgCtx.globalAlpha = 1;
  }

  // 7. 标志性几何图腾画布（#ab-specimen-canvas）：随章节 0/1/2 实时变形 + 指针磁吸
  var spCanvas = document.getElementById('ab-specimen-canvas');
  var spCtx = spCanvas && spCanvas.getContext ? spCanvas.getContext('2d') : null;
  var spW = 0;
  var spH = 0;
  var spVisible = true;
  var spPtr = { active: false, x: 0, y: 0 };

  var NODE_COUNT = 36;
  // 三套归一化坐标 [-1, 1]：0 私有系统拓扑 / 1 独立空间等距建筑 / 2 数字策展星环
  var formations = [[], [], []];
  (function buildFormations() {
    var i, angle, r;
    // Formation 0: Relational graph + timeline ticks
    for (i = 0; i < NODE_COUNT; i++) {
      if (i < 12) {
        // Horizontal timeline ticks
        formations[0].push({ x: -0.78 + (i / 11) * 1.56, y: 0.44 + (i % 2 === 0 ? -0.05 : 0.05) });
      } else if (i < 24) {
        // Inner ring nodes
        angle = ((i - 12) / 12) * Math.PI * 2;
        r = i % 3 === 0 ? 0.24 : 0.52;
        formations[0].push({ x: Math.cos(angle) * r, y: -0.14 + Math.sin(angle) * r * 0.78 });
      } else {
        // Outer satellite nodes
        angle = ((i - 24) / 12) * Math.PI * 2 + 0.26;
        r = 0.76;
        formations[0].push({ x: Math.cos(angle) * r, y: -0.14 + Math.sin(angle) * r * 0.62 });
      }
    }

    // Formation 1: Isometric architectural layers (3 stacked planes, 12 pts each)
    for (i = 0; i < NODE_COUNT; i++) {
      var layer = Math.floor(i / 12); // 0, 1, 2
      var idx = i % 12;
      var gx = (idx % 4) - 1.5; // -1.5..1.5
      var gy = Math.floor(idx / 4) - 1; // -1..1
      var isoX = (gx - gy) * 0.28;
      var isoY = (gx + gy) * 0.14 + (layer - 1) * 0.44;
      formations[1].push({ x: isoX, y: isoY });
    }

    // Formation 2: Cartographic constellation + 24 solar-term ring
    for (i = 0; i < NODE_COUNT; i++) {
      if (i < 24) {
        angle = (i / 24) * Math.PI * 2 - Math.PI / 2;
        r = i % 2 === 0 ? 0.78 : 0.68;
        formations[2].push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      } else {
        angle = ((i - 24) / 12) * Math.PI * 2 + 0.4;
        r = 0.18 + ((i * 37) % 10) * 0.036;
        formations[2].push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      }
    }
  })();

  var currentNodes = formations[0].map(function (p) {
    return { x: p.x, y: p.y };
  });

  function resizeSpecimen() {
    if (!spCanvas || !spCtx) return;
    var rect = spCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    spW = rect.width;
    spH = rect.height;
    spCanvas.width = Math.round(spW * dpr);
    spCanvas.height = Math.round(spH * dpr);
    spCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  if (spCanvas) {
    spCanvas.addEventListener('pointermove', function (ev) {
      var rect = spCanvas.getBoundingClientRect();
      spPtr.active = true;
      spPtr.x = ev.clientX - rect.left;
      spPtr.y = ev.clientY - rect.top;
    });
    spCanvas.addEventListener('pointerleave', function () {
      spPtr.active = false;
    });
    if (typeof IntersectionObserver !== 'undefined') {
      var spIo = new IntersectionObserver(function (entries) {
        spVisible = entries[0] ? entries[0].isIntersecting : true;
      });
      spIo.observe(spCanvas);
    }
  }

  function drawSpecimen(time) {
    if (!spCtx || !spW || !spH || !spVisible) return;
    spCtx.clearRect(0, 0, spW, spH);

    var target = formations[activeChapter] || formations[0];
    var cx = spW * 0.5;
    var cy = spH * 0.5;
    var scale = Math.min(spW, spH) * 0.43;
    var t = time * 0.0008;
    var ease = reducedMotion ? 1 : 0.085;

    // 柔和旋转与位置插值
    var pts = [];
    for (var i = 0; i < NODE_COUNT; i++) {
      currentNodes[i].x += (target[i].x - currentNodes[i].x) * ease;
      currentNodes[i].y += (target[i].y - currentNodes[i].y) * ease;

      var bx = currentNodes[i].x;
      var by = currentNodes[i].y;
      var driftX = reducedMotion ? 0 : Math.sin(t + i * 0.45) * 0.018;
      var driftY = reducedMotion ? 0 : Math.cos(t * 0.9 + i * 0.38) * 0.018;
      var sx = cx + (bx + driftX) * scale;
      var sy = cy + (by + driftY) * scale;

      if (spPtr.active && !reducedMotion) {
        var dx = spPtr.x - sx;
        var dy = spPtr.y - sy;
        var dist = Math.hypot(dx, dy);
        if (dist < 110 && dist > 1) {
          var force = (1 - dist / 110) * 16;
          sx += (dx / dist) * force;
          sy += (dy / dist) * force;
        }
      }
      pts.push({ x: sx, y: sy });
    }

    // 底层辅助几何轨道环 / 轴线
    spCtx.save();
    spCtx.strokeStyle = palette.ink;
    spCtx.globalAlpha = 0.12;
    spCtx.lineWidth = 1;
    if (activeChapter === 0) {
      spCtx.beginPath();
      spCtx.moveTo(cx - scale * 0.84, cy + scale * 0.44);
      spCtx.lineTo(cx + scale * 0.84, cy + scale * 0.44);
      spCtx.stroke();
      spCtx.beginPath();
      spCtx.arc(cx, cy - scale * 0.14, scale * 0.52, 0, Math.PI * 2);
      spCtx.stroke();
    } else if (activeChapter === 1) {
      for (var l = 0; l < 3; l++) {
        var ly = cy + (l - 1) * scale * 0.44;
        spCtx.beginPath();
        spCtx.moveTo(cx, ly - scale * 0.34);
        spCtx.lineTo(cx + scale * 0.72, ly);
        spCtx.lineTo(cx, ly + scale * 0.34);
        spCtx.lineTo(cx - scale * 0.72, ly);
        spCtx.closePath();
        spCtx.stroke();
      }
    } else {
      spCtx.beginPath();
      spCtx.arc(cx, cy, scale * 0.78, 0, Math.PI * 2);
      spCtx.stroke();
      spCtx.beginPath();
      spCtx.arc(cx, cy, scale * 0.46, 0, Math.PI * 2);
      spCtx.stroke();
    }
    spCtx.restore();

    // 节点间邻近连线
    var maxDist = scale * 0.52;
    for (var a = 0; a < NODE_COUNT; a++) {
      for (var b = a + 1; b < NODE_COUNT; b++) {
        var d = Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
        if (d < maxDist) {
          var alpha = (1 - d / maxDist) * 0.26;
          spCtx.beginPath();
          spCtx.moveTo(pts[a].x, pts[a].y);
          spCtx.lineTo(pts[b].x, pts[b].y);
          spCtx.strokeStyle = a % 7 === 0 ? palette.accent : palette.ink;
          spCtx.globalAlpha = alpha;
          spCtx.lineWidth = 1;
          spCtx.stroke();
        }
      }
    }

    // 指针磁吸高亮丝线
    if (spPtr.active && !reducedMotion) {
      for (var m = 0; m < NODE_COUNT; m++) {
        var md = Math.hypot(pts[m].x - spPtr.x, pts[m].y - spPtr.y);
        if (md < 96) {
          spCtx.beginPath();
          spCtx.moveTo(spPtr.x, spPtr.y);
          spCtx.lineTo(pts[m].x, pts[m].y);
          spCtx.strokeStyle = palette.accent;
          spCtx.globalAlpha = (1 - md / 96) * 0.45;
          spCtx.lineWidth = 1;
          spCtx.stroke();
        }
      }
    }

    // 绘制节点
    for (var k = 0; k < NODE_COUNT; k++) {
      var isAccent = k % 6 === 0;
      spCtx.beginPath();
      spCtx.arc(pts[k].x, pts[k].y, isAccent ? 3.2 : 2, 0, Math.PI * 2);
      spCtx.fillStyle = isAccent ? palette.accent : palette.ink;
      spCtx.globalAlpha = isAccent ? 0.92 : 0.48;
      spCtx.fill();
    }
    spCtx.globalAlpha = 1;
  }

  resizeBg();
  resizeSpecimen();

  var resizeTimer = 0;
  window.addEventListener(
    'resize',
    function () {
      if (resizeTimer) return;
      resizeTimer = requestAnimationFrame(function () {
        resizeTimer = 0;
        resizeBg();
        resizeSpecimen();
        if (reducedMotion) {
          drawBg(0);
          drawSpecimen(0);
        }
      });
    },
    { passive: true }
  );

  // 主动画循环：页面隐藏时自动暂停，reduce 模式下只绘静态一帧
  var loopRaf = 0;
  function tick(ts) {
    if (!document.hidden) {
      drawBg(ts);
      drawSpecimen(ts);
    }
    loopRaf = requestAnimationFrame(tick);
  }

  if (reducedMotion) {
    drawBg(0);
    drawSpecimen(0);
  } else {
    loopRaf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && loopRaf) {
        cancelAnimationFrame(loopRaf);
        loopRaf = 0;
      } else if (!document.hidden && !loopRaf) {
        loopRaf = requestAnimationFrame(tick);
      }
    });
  }
})();
