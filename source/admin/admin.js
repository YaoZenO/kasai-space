/* 管理后台入口：ES module。
 *
 * 拆分结构（P2-2，单文件 ≤300 行）：
 *   admin-core.js      共享层：状态、DOM 工具、API、通用交互、视图切换（不依赖其他模块）
 *   admin-list.js      列表渲染（依赖 core）
 *   admin-post.js      文章编辑器  ┐
 *   admin-item.js      数据条目编辑器├─ 登录成功后才动态加载，登录页不加载编辑器代码
 *   admin-site.js      站点身份设置  │
 *   admin-media.js     图片上传与图库│
 *   admin-composer.js  文章正文块编辑器（图文混排发布器，2026-10-15 新增）│
 *   admin-deploy.js    部署轮询      ┘
 *   admin-quick.js     快捷入口「发一条」（FAB + 菜单，只导航到新建表单）
 *   admin-md-blocks.js Markdown⇄块 纯转换（composer 与 test/md-blocks.js 共用）
 *
 * 跨模块调用统一走 admin-core.js 的 hooks 注册表，避免模块间循环依赖。
 */
'use strict';

import { S, hooks, $, api, showLogin, showApp, switchTab, reloadList } from './admin-core.js?v=20261022';
import { renderList } from './admin-list.js?v=20261022';
import { init as initQuick } from './admin-quick.js?v=20261022';

// ---------- 启动 ----------
(async function boot() {
  try {
    const s = await api('/api/session-check');
    S.login = s.login;
    S.mockMode = !!s.mockMode;

    // 列表渲染先就绪；启动走 summary 模式（跳过草稿逐篇读取，首屏更快）
    hooks.renderList = renderList;
    await reloadList({ summary: true });

    // 登录成功才加载编辑器等重模块——登录页不下载这部分代码。
    // ?v= 与 index.html 的 ASSET_V 保持一致（bump 时两处同步，admin-smoke 有断言锁）。
    const [post, item, site, media, deploy] = await Promise.all([
      import('./admin-post.js?v=20261022'),
      import('./admin-item.js?v=20261022'),
      import('./admin-site.js?v=20261022'),
      import('./admin-media.js?v=20261022'),
      import('./admin-deploy.js?v=20261022'),
    ]);
    post.init();
    item.init();
    initQuick();
    site.init();
    media.init();
    deploy.init();

    // 站点设置 tab 由 list 调度，入口登记到 hooks
    hooks.renderSiteEditor = site.renderSiteEditor;

    showApp();
  } catch (e) {
    // showLogin 已在 api() 中触发
    if (e.status === 0) showLogin('网络异常，请刷新重试');
  }
})();

// ---------- 全局事件（与具体编辑器无关） ----------
$('btn-login').onclick = () => {
  window.location.href = '/api/auth-start';
};
document.querySelectorAll('.tab').forEach((b) => {
  b.onclick = () => switchTab(b.dataset.tab);
});
document.querySelectorAll('[data-back]').forEach((b) => {
  b.onclick = () => {
    switchTab(S.tab);
  };
});
document.querySelectorAll('[data-close-modal]').forEach((b) => {
  b.onclick = () => (b.closest('.modal').hidden = true);
});

// 关页面 / 刷新前，编辑器有未保存内容时先拦一道（2026-10-21，
// REVIEW-2026-10-18-PM §2.4.1 摩擦③：此前无任何拦截，写一半刷新即丢稿）。
window.addEventListener('beforeunload', (e) => {
  if (S.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
