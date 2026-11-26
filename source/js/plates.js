// /plates/ 车牌字母编号探索：省份切换 + 冷知识卡联动。
//
// 约定（与 source/js/zodiac.js 一致）：
//   - 无依赖原生 JS；
//   - 不生成 DOM 主干，只切换展示状态（is-active / hidden / aria-selected）；
//   - 关闭 JS 时，第一块面板（北京）已由服务端直出可见，冷知识卡正文与折叠对照表
//     始终可读，信息不丢失。
//
// 行为：
//   1. 点击省份 tab → 高亮该 tab、显示对应 A–Z 字母带面板、隐藏其余；
//   2. 点击冷知识卡（.plt-freak[data-region]）→ 字母带切到对应省份并平滑滚动过去，
//      让卡片里说的「反常」在字母带上直接印证（如云南空缺的 B）。

(function () {
  'use strict';

  var tabs = document.querySelectorAll('.plt-tab[role="tab"]');
  var panels = document.querySelectorAll('.plt-band-panel[role="tabpanel"]');
  if (!tabs.length || !panels.length) return;

  var stage = document.getElementById('plt-stage');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function activate(key) {
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-region') === key;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach(function (p) {
      var on = p.getAttribute('data-region-panel') === key;
      p.classList.toggle('is-active', on);
      p.hidden = !on;
    });
  }

  function jumpTo(key) {
    activate(key);
    if (stage && typeof stage.scrollIntoView === 'function') {
      stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      activate(t.getAttribute('data-region'));
    });
  });

  // 冷知识卡联动（点击或 Enter/Space 触发）
  var freaks = document.querySelectorAll('.plt-freak[data-region]');
  freaks.forEach(function (f) {
    f.addEventListener('click', function () {
      jumpTo(f.getAttribute('data-region'));
    });
    f.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        jumpTo(f.getAttribute('data-region'));
      }
    });
  });
})();
