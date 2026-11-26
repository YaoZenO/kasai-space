/* global window, document, requestAnimationFrame */

'use strict';

// 文字详情页 & 项目详情页阅读增强引擎（2026-11-26）：
//   1. 实时阅读进度（侧栏百分比 + 进度条 + 项目页垂直标尺连线）；
//   2. 专注阅读模式切换（平滑隐藏侧栏、正文居中加宽，Esc 或再次点击复位）；
//   3. 正文图片原地原生 <dialog> 灯箱放大（点击图片查看原图与 alt 图注）；
//   4. 项目详情页四段章节 Scroll-Spy 高亮。
(function () {
  var article = document.querySelector('.post-content, .pj-main');
  if (!article) return;

  // 1. 阅读进度计算（rAF 节流）
  var pctEl = document.querySelector('[data-rr-pct]');
  var barEl = document.querySelector('[data-rr-bar]');
  var pjLinks = Array.prototype.slice.call(document.querySelectorAll('[data-pj-toc-link]'));
  var pjSections = pjLinks
    .map(function (a) {
      var id = (a.getAttribute('href') || '').replace(/^#/, '');
      return id ? document.getElementById(id) : null;
    })
    .filter(Boolean);

  var raf = 0;
  function updateProgress() {
    raf = 0;
    var rect = article.getBoundingClientRect();
    var total = Math.max(1, article.offsetHeight - window.innerHeight * 0.65);
    var scrolled = Math.min(total, Math.max(0, -rect.top + window.innerHeight * 0.2));
    var ratio = Math.min(1, Math.max(0, scrolled / total));
    var pct = Math.round(ratio * 100);

    if (pctEl) pctEl.textContent = pct + '%';
    if (barEl) barEl.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';

    if (pjSections.length) {
      var activeIdx = 0;
      var probe = window.innerHeight * 0.32;
      for (var i = 0; i < pjSections.length; i += 1) {
        if (pjSections[i].getBoundingClientRect().top <= probe) {
          activeIdx = i;
        }
      }
      pjLinks.forEach(function (link, idx) {
        var li = link.closest('li');
        var isCur = idx === activeIdx;
        var isDone = idx < activeIdx;
        link.classList.toggle('is-active', isCur);
        link.setAttribute('aria-current', isCur ? 'location' : 'false');
        if (li) {
          li.classList.toggle('is-active', isCur);
          li.classList.toggle('is-done', isDone);
        }
      });
    }
  }

  window.addEventListener(
    'scroll',
    function () {
      if (!raf) raf = requestAnimationFrame(updateProgress);
    },
    { passive: true }
  );
  window.addEventListener('resize', function () {
    if (!raf) raf = requestAnimationFrame(updateProgress);
  });
  updateProgress();

  // 2. 专注阅读模式切换
  var focusBtns = Array.prototype.slice.call(document.querySelectorAll('[data-rr-focus]'));
  if (focusBtns.length) {
    var shell = document.querySelector('.post-wrap, .pj-shell');
    var setFocus = function (on) {
      if (!shell) return;
      shell.classList.toggle('is-focus-mode', on);
      focusBtns.forEach(function (btn) {
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        var lbl = btn.querySelector('[data-rr-focus-label]');
        if (lbl) lbl.textContent = on ? '退出专注' : '专注阅读';
      });
    };
    focusBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = !(shell && shell.classList.contains('is-focus-mode'));
        setFocus(next);
      });
    });
  }

  // 3. 正文图片原地灯箱 <dialog>
  var imgs = Array.prototype.slice.call(article.querySelectorAll('.markdown-body img'));
  if (imgs.length && typeof window.HTMLDialogElement !== 'undefined') {
    var dlg = document.getElementById('rr-lightbox');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'rr-lightbox';
      dlg.className = 'rr-lightbox';
      dlg.setAttribute('aria-label', '图片预览');
      dlg.innerHTML =
        '<div class="rr-lb-in">' +
        '<button type="button" class="rr-lb-close" data-rr-lb-close aria-label="关闭预览">关闭</button>' +
        '<img class="rr-lb-img" data-rr-lb-img src="" alt="" />' +
        '<p class="rr-lb-cap" data-rr-lb-cap hidden></p>' +
        '</div>';
      document.body.appendChild(dlg);
    }
    var lbImg = dlg.querySelector('[data-rr-lb-img]');
    var lbCap = dlg.querySelector('[data-rr-lb-cap]');
    var lbClose = dlg.querySelector('[data-rr-lb-close]');

    imgs.forEach(function (img) {
      if (img.closest('a')) return;
      img.classList.add('rr-zoomable');
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      var open = function () {
        var src = img.currentSrc || img.getAttribute('src') || '';
        if (!src) return;
        if (lbImg) {
          lbImg.src = src;
          lbImg.alt = img.alt || '';
        }
        if (lbCap) {
          if (img.alt) {
            lbCap.textContent = img.alt;
            lbCap.hidden = false;
          } else {
            lbCap.hidden = true;
          }
        }
        if (!dlg.open) dlg.showModal();
      };
      img.addEventListener('click', open);
      img.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      });
    });

    if (lbClose) {
      lbClose.addEventListener('click', function () {
        dlg.close();
      });
    }
    dlg.addEventListener('click', function (ev) {
      if (ev.target === dlg) dlg.close();
    });
  }
})();
