(function () {
  'use strict';

  // 节日文化页交互（/library/<slug>/）：复刻 zodiac 页三件套 + 年份表渐进增强——
  //   ① 阅读进度环：SVG stroke-dashoffset 随滚动百分比走，配「已读 N%」文字；
  //   ② 目录 scrollspy：当前所在章节在目录里高亮；
  //   ③ 目录收起展开（桌面 chevron）+ 移动端底部抽屉；
  //   ④ 逐年日期表「最近 5 年 / 展开 11 年」：无 JS 时 11 行全部可见（html 不挂 js 类），
  //      有 JS 时先给 <html> 挂 js 类、表格按 data-collapsed 收起第 6–11 行（S12）。
  // 目录与表格的 DOM 主干由模板渲染——无 JS 时锚点跳转与全表阅读仍然可用，
  // 这里只做增强，不生成 DOM 主干（与节假日页 / 生肖页「无脚本时内容完整可读」同律）。
  // 依赖：无（原生 JS，defer 加载，DOM 就绪后执行）。脚本不修改 zodiac.js。

  var CIRC = 97.4; // r=15.5 的圆周长，与模板里 stroke-dasharray 一致

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    // 渐进增强开关：CSS 里所有「有 JS 才收起」的规则都锚在 html.js 上
    document.documentElement.classList.add('js');

    var toc = document.querySelector('.fs-toc');
    if (!toc) return;

    var ring = document.getElementById('fsProgressRing');
    var progressText = toc.querySelector('.fs-toc-progress-text');
    var sections = Array.prototype.slice.call(document.querySelectorAll('.fs-section[id]'));
    var links = Array.prototype.slice.call(document.querySelectorAll('.fs-toc-list a'));

    function update() {
      // ① 进度环：按整页滚动百分比
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var pct = max > 0 ? Math.round((doc.scrollTop / max) * 100) : 0;
      if (pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      if (ring) ring.style.strokeDashoffset = String(CIRC * (1 - pct / 100));
      if (progressText) progressText.textContent = '已读 ' + pct + '%';

      // ② scrollspy：最后一个顶边越过 120px 线的章节算当前章（与 zodiac 同口径）
      var currentId = sections.length ? sections[0].id : null;
      for (var i = 0; i < sections.length; i += 1) {
        if (sections[i].getBoundingClientRect().top <= 120) currentId = sections[i].id;
      }
      links.forEach(function (a) {
        var isActive = a.getAttribute('href') === '#' + currentId;
        a.classList.toggle('is-active', isActive);
        if (isActive) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        update();
        ticking = false;
      });
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();

    // ③ 收起展开：切换 class，chevron 用 CSS 旋转
    var toggle = toc.querySelector('.fs-toc-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var collapsed = toc.classList.toggle('is-collapsed');
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggle.setAttribute('aria-label', collapsed ? '展开目录' : '收起目录');
      });
    }

    // ④ 年份表展开 / 收起：切 data-collapsed 与 aria-expanded，文案双向
    //    （展开全部 11 年 ↓ / 收起至最近 5 年 ↑）。高度变化直切，无过渡。
    var yearsTable = document.querySelector('.fs-years');
    var yearsToggle = document.querySelector('.fs-years-toggle');
    if (yearsTable && yearsToggle) {
      yearsToggle.addEventListener('click', function () {
        var collapsed = yearsTable.getAttribute('data-collapsed') !== 'true';
        yearsTable.setAttribute('data-collapsed', collapsed ? 'true' : 'false');
        yearsToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        yearsToggle.textContent = collapsed ? '展开全部 11 年 ↓' : '收起至最近 5 年 ↑';
      });
    }

    // ⑤ 移动端抽屉：FAB 打开、遮罩 / 关闭按钮 / 点链接后关闭；Esc 关闭
    var fab = document.querySelector('.fs-toc-fab');
    var sheet = document.querySelector('.fs-toc-sheet');
    var overlay = document.querySelector('.fs-toc-overlay');
    if (!fab || !sheet || !overlay) return;

    function openSheet() {
      sheet.classList.add('is-open');
      sheet.setAttribute('aria-hidden', 'false');
      overlay.classList.add('is-open');
    }
    function closeSheet() {
      sheet.classList.remove('is-open');
      sheet.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('is-open');
    }

    fab.addEventListener('click', openSheet);
    overlay.addEventListener('click', closeSheet);
    var closeBtn = sheet.querySelector('.fs-toc-sheet-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSheet);
    sheet.addEventListener('click', function (ev) {
      if (ev.target.closest('a')) closeSheet();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && sheet.classList.contains('is-open')) closeSheet();
    });
  });
})();
