/* 管理后台入口：ES module。
 *
 * 拆分结构（P2-2，单文件 ≤300 行）：
 *   admin-core.js    共享层：状态、DOM 工具、API、通用交互、视图切换（不依赖其他模块）
 *   admin-list.js    列表渲染（依赖 core）
 *   admin-post.js    文章编辑器  ┐
 *   admin-item.js    数据条目编辑器├─ 登录成功后才动态加载，登录页不加载编辑器代码
 *   admin-site.js    站点身份设置  │
 *   admin-media.js   图片上传与图库│
 *   admin-deploy.js  部署轮询      ┘
 *
 * 跨模块调用统一走 admin-core.js 的 hooks 注册表，避免模块间循环依赖。
 */
'use strict';

import { S, hooks, $, api, showLogin, showApp, switchTab, reloadList } from './admin-core.js';
import { renderList } from './admin-list.js';

// ---------- 启动 ----------
(async function boot() {
  try {
    const s = await api('/api/session-check');
    S.login = s.login;
    S.mockMode = !!s.mockMode;

    // 列表渲染先就绪；启动走 summary 模式（跳过草稿逐篇读取，首屏更快）
    hooks.renderList = renderList;
    await reloadList({ summary: true });

    // 登录成功才加载编辑器等重模块——登录页不下载这部分代码
    const [post, item, site, media, deploy] = await Promise.all([
      import('./admin-post.js'),
      import('./admin-item.js'),
      import('./admin-site.js'),
      import('./admin-media.js'),
      import('./admin-deploy.js'),
    ]);
    post.init();
    item.init();
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
