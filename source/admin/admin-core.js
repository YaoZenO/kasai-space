/* 管理后台共享层：状态、DOM 工具、API、通用交互、视图切换。
 * 不依赖任何其他 admin-*.js —— 依赖方向只能是别人指向这里，避免循环。
 * 跨模块调用统一走 hooks 注册表（各功能模块在 init() 时登记自己的入口函数）。
 */
'use strict';

// ---------- 状态 ----------
export const S = {
  login: '',
  mockMode: false,
  data: null, // content-list 响应
  tab: 'posts',
  editor: null, // 文章编辑器状态
  itemEditor: null, // 数据条目编辑器状态 {module, index|null}
  imageModule: 'posts', // 图片页当前上传/筛选目录
  lastListSha: null,
  pollTimer: null,
  pollStartedAt: 0,
  lastDeployUrl: '',
  busy: false,
};

// 跨模块入口注册表：由各功能模块 init() 填充，core 与 list 通过它调用
export const hooks = {
  renderList: null,       // list 模块
  stopPolling: null,      // deploy 模块（showLogin 时停掉轮询）
  openPostEditor: null,   // post 模块
  openItemEditor: null,   // item 模块
  uploadImages: null,     // media 模块
  imageActions: null,     // media 模块
  renderSiteEditor: null, // site 模块（list 调度）
  setDeployCommitted: null, // deploy 模块
  saveCurrentEditing: null, // post 模块
  composerInsert: null,     // post 模块：把一张已有图片作为图片块插入正文
};

export const $ = (id) => document.getElementById(id);

export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// ---------- Toast / 弹窗 ----------
let toastTimer = null;
export function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms || 2600);
}

export function confirmDialog(title, text, okText) {
  return new Promise((resolve) => {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    $('confirm-ok').textContent = okText || '确认';
    const m = $('modal-confirm');
    m.hidden = false;
    const done = (v) => {
      m.hidden = true;
      $('confirm-ok').onclick = null;
      $('confirm-cancel').onclick = null;
      resolve(v);
    };
    $('confirm-ok').onclick = () => done(true);
    $('confirm-cancel').onclick = () => done(false);
  });
}

// ---------- API ----------
export class ApiError extends Error {
  constructor(status, payload) {
    super((payload && payload.error) || 'API_ERROR');
    this.status = status;
    this.payload = payload || {};
  }
}

export async function api(path, opts) {
  const o = Object.assign({ headers: {} }, opts);
  if (o.body !== undefined && typeof o.body !== 'string') {
    o.headers['Content-Type'] = 'application/json';
    o.body = JSON.stringify(o.body);
  }
  let res;
  try {
    res = await fetch(path, o);
  } catch (e) {
    throw new ApiError(0, { error: 'NETWORK', hint: '网络请求失败，请检查连接后重试' });
  }
  let payload = {};
  try {
    payload = await res.json();
  } catch (e) { /* 非 JSON 响应 */ }
  if (res.status === 401) {
    showLogin(payload.error === 'SERVER_NOT_CONFIGURED' ? '服务端尚未配置完成' : '登录已过期，请重新登录');
    throw new ApiError(401, payload);
  }
  if (res.status === 403 && payload.error === 'NOT_ADMIN') {
    showLogin('当前账号不是站点管理员');
    throw new ApiError(403, payload);
  }
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

// 并发保护：同一时间只允许一个保存类操作，避免连点产生重复提交
export function guard(fn) {
  return async (...args) => {
    if (S.busy) {
      toast('上一步操作还在进行中…');
      return;
    }
    S.busy = true;
    try {
      await fn(...args);
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 401 || e.status === 403))) handleOpError(e);
    } finally {
      S.busy = false;
    }
  };
}

// ---------- 冲突与操作错误 ----------
export function handleOpError(e) {
  if (e instanceof ApiError && e.status === 409 && e.payload.conflict) {
    $('modal-conflict').hidden = false;
    $('conflict-reload').onclick = async () => {
      $('modal-conflict').hidden = true;
      await reloadList();
      toast('已加载服务器最新内容');
    };
    $('conflict-overwrite').onclick = async () => {
      $('modal-conflict').hidden = true;
      try {
        // 拉取最新 headSha 后强制覆盖（跳过文件级 sha 校验）
        // 只需要 headSha，走 summary 模式少 N 次草稿请求
        const fresh = await api('/api/content-list?summary=1');
        S.data = fresh;
        S.lastListSha = fresh.headSha;
        await hooks.saveCurrentEditing({ headSha: fresh.headSha, force: true });
      } catch (err) {
        handleOpError(err);
      }
    };
    return;
  }
  toast(e.payload && e.payload.hint ? e.payload.hint : (e.message || '操作失败'));
}

// ---------- 列表数据 ----------
// opts.summary=true 走轻量模式：跳过草稿逐篇读取，首屏少 N 次请求。
export async function reloadList(opts) {
  const summary = !!(opts && opts.summary);
  S.data = await api('/api/content-list' + (summary ? '?summary=1' : ''));
  S.lastListSha = S.data.headSha;
  if (hooks.renderList) hooks.renderList();
}

// summary 模式下草稿只有文件名；进入文章 tab 时若发现缺标题，再全量拉一次补齐。
export async function ensureDraftTitles() {
  const drafts = (S.data && S.data.drafts) || [];
  if (!drafts.length) return;
  if (drafts.every((d) => d.title)) return;
  await reloadList();
}

// ---------- 视图切换 ----------
export function showLogin(errText) {
  if (hooks.stopPolling) hooks.stopPolling();
  $('view-app').hidden = true;
  $('view-login').hidden = false;
  const e = $('login-error');
  if (errText) {
    e.textContent = errText;
    e.hidden = false;
  } else e.hidden = true;
}

export function showApp() {
  $('view-login').hidden = true;
  $('view-app').hidden = false;
  $('whoami').textContent = S.login;
  switchTab(S.tab || 'posts');
}

export function switchTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('view-list').hidden = false;
  $('view-post-editor').hidden = true;
  $('view-data-editor').hidden = true;
  $('view-site-editor').hidden = true;
  if (hooks.renderList) hooks.renderList();
  // 启动若走了 summary 模式，这里按需补齐草稿标题
  if (tab === 'posts') ensureDraftTitles();
}

// ---------- 通用列表构件 ----------
// 统一头部组件：kicker + 标题 + 计数 + 主操作按钮同排（右侧主区上半部分唯一结构）
export function pageHead(box, { kicker, title, count, action }) {
  const head = el('div', 'page-head');
  const main = el('div', 'page-head-main');
  if (kicker) main.appendChild(el('span', 'page-kicker', kicker));
  main.appendChild(el('h2', null, title));
  head.appendChild(main);
  const side = el('div', 'page-head-side');
  if (count) side.appendChild(el('span', 'list-count', count));
  if (action) {
    const btn = el('button', 'btn btn-primary', action.label);
    btn.onclick = action.fn;
    side.appendChild(btn);
  }
  head.appendChild(side);
  box.appendChild(head);
  return head;
}

export function subHead(box, label, count) {
  const p = el('div', 'sub-head');
  p.appendChild(el('b', null, label));
  if (count != null) p.appendChild(el('span', null, String(count)));
  box.appendChild(p);
  return p;
}

export function emptyState(title, hint) {
  const p = el('p', 'empty', title);
  if (hint) p.appendChild(el('span', 'empty-hint', hint));
  return p;
}
