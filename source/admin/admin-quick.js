/* 快捷入口「发一条」（2026-10-19，主人拍板「先③再①」中的③）。
 *
 * 目的：打开后台第一屏就能开始发布，不必先想「这条内容该进哪个 tab」。
 * 浮动按钮展开菜单 → 切到对应 tab 并直接打开该 tab 的**新建表单**。
 *
 * 边界：本模块只做「导航到新建表单」，不复制任何保存 / 校验逻辑——
 * 保存仍走 admin-post.js / admin-item.js 的既有路径（hooks.openPostEditor /
 * hooks.openItemEditor），避免出现第二套提交流程。聚合发布页（①）后续单独做。
 */
'use strict';

import { $, hooks, switchTab, toast } from './admin-core.js?v=20261024';

/* 菜单项与目标 tab 的映射。images 没有「新建表单」，只切 tab（上传区在该页顶部）。 */
const QUICK = [
  { key: 'post', label: '写文章', hint: 'Markdown + 块编辑器' },
  { key: 'projects', label: '发项目', hint: '项目档案' },
  { key: 'games', label: '发游戏', hint: '游戏记录' },
  { key: 'collections', label: '发收藏', hint: '外链 / 资源' },
  { key: 'images', label: '传图片', hint: '上传到图库' },
];

export function init() {
  const fab = $('fab-compose');
  const menu = $('fab-menu');
  if (!fab || !menu) return;

  const close = () => {
    menu.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    menu.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    const first = menu.querySelector('.fab-item');
    if (first) first.focus();
  };

  fab.onclick = () => (menu.hidden ? open() : close());

  QUICK.forEach((q) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fab-item';
    btn.setAttribute('role', 'menuitem');
    btn.dataset.quick = q.key;
    const label = document.createElement('span');
    label.className = 'fab-item-label';
    label.textContent = q.label;
    const hint = document.createElement('span');
    hint.className = 'fab-item-hint';
    hint.textContent = q.hint;
    btn.appendChild(label);
    btn.appendChild(hint);
    btn.onclick = () => {
      close();
      run(q.key);
    };
    menu.appendChild(btn);
  });

  // 点菜单外 / Esc 关闭。菜单 hidden 时不响应，避免无谓遍历。
  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (!menu.contains(e.target) && !fab.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      close();
      fab.focus();
    }
  });
}

function run(key) {
  if (key === 'images') {
    switchTab('images');
    return;
  }
  if (key === 'post') {
    switchTab('posts');
    if (hooks.openPostEditor) hooks.openPostEditor(null);
    else toast('文章编辑器还在加载，请稍候再试');
    return;
  }
  switchTab(key);
  if (hooks.openItemEditor) hooks.openItemEditor(key, null);
  else toast('编辑器还在加载，请稍候再试');
}
