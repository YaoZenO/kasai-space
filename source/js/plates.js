// /plates/ 发牌字母索引台：省份切换联动。
//
// 约定（与 source/js/zodiac.js、holidays 内联脚本一致）：
//   - 无依赖原生 JS；
//   - 不生成 DOM 主干，只切换展示状态（is-active / hidden / aria-selected）；
//   - 关闭 JS 时，第一块面板（北京）已经由服务端直出可见，其余面板的完整对照表
//     在下方「各省发牌机关代号对照表」静态表格里始终可读，信息不丢失。
//
// 行为：点击省份 tab → 高亮该 tab、显示对应 A–Z 字母带面板、隐藏其余面板。
// 键盘：tab 是原生 <button>，Tab 键聚焦、Enter/Space 激活均可。

(function () {
  'use strict';

  var tabs = document.querySelectorAll('.plt-tab[role="tab"]');
  var panels = document.querySelectorAll('.plt-band-panel[role="tabpanel"]');
  if (!tabs.length || !panels.length) return;

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

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      activate(t.getAttribute('data-region'));
    });
  });
})();
