// /plates/ 车牌字母编号探索：省级行政区切换。
//
// 约定（与 source/js/zodiac.js 一致）：
//   - 无依赖原生 JS；
//   - 不生成 DOM 主干，只切换展示状态（is-active / hidden / aria-selected）；
//   - 关闭 JS 时，首屏直辖市面板已由服务端直出可见，故事、更新表、折叠对照表
//     始终可读，信息不丢失。
//
// 行为：
//   1. 点击省份 tab → 高亮该 tab、显示对应 A–Z 字母带面板、隐藏其余；
//   2. tab 上按 ← → 可在省份之间移动（tablist 键盘约定）。

(function () {
  'use strict';

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.plt-tab[role="tab"]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.plt-band-panel[role="tabpanel"]'));
  if (!tabs.length || !panels.length) return;

  function activate(key) {
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-region') === key;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach(function (p) {
      var on = p.getAttribute('data-region-panel') === key;
      p.classList.toggle('is-active', on);
      p.hidden = !on;
    });
  }

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      activate(t.getAttribute('data-region'));
    });
    t.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var step = e.key === 'ArrowRight' ? 1 : -1;
      var next = tabs[(i + step + tabs.length) % tabs.length];
      next.focus();
      activate(next.getAttribute('data-region'));
    });
  });

  // 初始态：把首个 tab 设为可聚焦，其余移出 tab 序列
  if (!tabs.some(function (t) { return t.classList.contains('is-active'); })) {
    activate(tabs[0].getAttribute('data-region'));
  } else {
    tabs.forEach(function (t) {
      t.tabIndex = t.classList.contains('is-active') ? 0 : -1;
    });
  }
})();
