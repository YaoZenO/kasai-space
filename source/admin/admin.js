/* 管理后台前端：无依赖原生 JS 单页。 */
'use strict';

(function () {
  // ---------- 状态 ----------
  const S = {
    login: '',
    mockMode: false,
    data: null, // content-list 响应
    tab: 'posts',
    editor: null, // 文章编辑器状态
    itemEditor: null, // 数据条目编辑器状态 {module, index|null}
    imageModule: 'posts', // 图片页当前上传/筛选目录
    lastListSha: null,
    pollTimer: null,
    pollTries: 0,
    busy: false,
  };

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // ---------- Toast / 弹窗 ----------
  let toastTimer = null;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms || 2600);
  }

  function confirmDialog(title, text, okText) {
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
  class ApiError extends Error {
    constructor(status, payload) {
      super((payload && payload.error) || 'API_ERROR');
      this.status = status;
      this.payload = payload || {};
    }
  }

  async function api(path, opts) {
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

  // ---------- 视图切换 ----------
  function showLogin(errText) {
    stopPolling();
    $('view-app').hidden = true;
    $('view-login').hidden = false;
    const e = $('login-error');
    if (errText) {
      e.textContent = errText;
      e.hidden = false;
    } else e.hidden = true;
  }

  function showApp() {
    $('view-login').hidden = true;
    $('view-app').hidden = false;
    $('whoami').textContent = S.login;
    switchTab(S.tab || 'posts');
  }

  function switchTab(tab) {
    S.tab = tab;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('view-list').hidden = false;
    $('view-post-editor').hidden = true;
    $('view-data-editor').hidden = true;
    $('view-site-editor').hidden = true;
    renderList();
  }

  // ---------- 列表渲染 ----------
  function renderList() {
    const box = $('view-list');
    box.textContent = '';
    if (!S.data) {
      box.appendChild(el('p', 'empty', '加载中…'));
      return;
    }
    const d = S.data;
    if (S.tab === 'posts') {
      renderPostsList(box, d);
    } else if (['projects', 'games', 'collections'].includes(S.tab)) {
      renderDataList(box, S.tab, d.data[S.tab] || []);
    } else if (S.tab === 'images') {
      renderImages(box, d.images || []);
    } else if (S.tab === 'site') {
      renderSiteEditor(box, d.site || {});
    } else if (S.tab === 'trash') {
      renderTrash(box, d.trash || []);
    }
  }

  function renderPostsList(box, d) {
    const head = el('div', 'list-head');
    head.appendChild(el('h2', null, '文章'));
    head.appendChild(el('span', 'list-count', `${d.posts.length} 篇 · 草稿 ${d.drafts.length}`));
    box.appendChild(head);

    const newBtn = el('button', 'btn btn-primary', '新建文章');
    newBtn.style.marginBottom = '.9rem';
    newBtn.onclick = () => openPostEditor(null);
    box.appendChild(newBtn);

    if (d.drafts.length) {
      box.appendChild(el('p', 'list-count', '草稿'));
      const dl = el('div', 'card-list');
      d.drafts.forEach((dr) => {
        const c = el('div', 'card');
        const body = el('div', 'card-body');
        body.appendChild(el('div', 'card-title', dr.title || dr.name));
        body.appendChild(el('div', 'card-sub', dr.name));
        c.appendChild(body);
        const acts = el('div', 'card-actions');
        const edit = el('button', 'btn btn-mini', '编辑');
        edit.onclick = () => openPostEditor(dr.path);
        acts.appendChild(edit);
        c.appendChild(acts);
        dl.appendChild(c);
      });
      box.appendChild(dl);
    }

    box.appendChild(el('p', 'list-count', '已发布'));
    if (!d.posts.length) {
      box.appendChild(el('p', 'empty', '还没有已发布文章'));
      return;
    }
    const list = el('div', 'card-list');
    d.posts.forEach((p) => {
      const c = el('div', 'card');
      const body = el('div', 'card-body');
      body.appendChild(el('div', 'card-title', p.name));
      body.appendChild(el('div', 'card-sub', p.path));
      c.appendChild(body);
      const acts = el('div', 'card-actions');
      const edit = el('button', 'btn btn-mini', '编辑');
      edit.onclick = () => openPostEditor(p.path);
      acts.appendChild(edit);
      c.appendChild(acts);
      list.appendChild(c);
    });
    box.appendChild(list);
  }

  function renderDataList(box, module, items) {
    const labels = { projects: '项目', games: '游戏', collections: '收藏' };
    const head = el('div', 'list-head');
    head.appendChild(el('h2', null, labels[module]));
    head.appendChild(el('span', 'list-count', `${items.length} 条`));
    box.appendChild(head);

    const newBtn = el('button', 'btn btn-primary', '新增条目');
    newBtn.style.marginBottom = '.9rem';
    newBtn.onclick = () => openItemEditor(module, null);
    box.appendChild(newBtn);

    if (!items.length) {
      box.appendChild(el('p', 'empty', '暂无条目。为空时首页不会渲染该模块。'));
      return;
    }
    const list = el('div', 'card-list');
    items.forEach((it, i) => {
      const c = el('div', 'card');
      if (it.cover) {
        const img = el('img', 'card-thumb');
        img.src = it.cover;
        img.loading = 'lazy';
        img.onerror = () => img.remove();
        c.appendChild(img);
      }
      const body = el('div', 'card-body');
      body.appendChild(el('div', 'card-title', it.title || '(未命名)'));
      const subs = [it.desc, it.date].filter(Boolean).join(' · ');
      if (subs) body.appendChild(el('div', 'card-sub', subs));
      c.appendChild(body);
      const acts = el('div', 'card-actions');
      const edit = el('button', 'btn btn-mini', '编辑');
      edit.onclick = () => openItemEditor(module, i);
      acts.appendChild(edit);
      const del = el('button', 'btn btn-quiet', '删除');
      del.onclick = async () => {
        const ok = await confirmDialog('删除条目', `确定删除「${it.title || '未命名'}」吗？内容会移入回收站，可恢复。`, '删除');
        if (!ok) return;
        try {
          await api('/api/content-delete', { method: 'POST', body: { module, index: i, title: it.title, expectedHeadSha: S.lastListSha } });
          toast('已删除并提交');
          await reloadList();
        } catch (e) {
          handleOpError(e);
        }
      };
      acts.appendChild(del);
      c.appendChild(acts);
      list.appendChild(c);
    });
    box.appendChild(list);
  }

  function renderImages(box, images) {
    const head = el('div', 'list-head');
    head.appendChild(el('h2', null, '图片'));
    head.appendChild(el('span', 'list-count', `${images.length} 张`));
    box.appendChild(head);

    // 目录选择：按内容板块分目录存放（文章/项目/游戏/收藏/头像）
    const MODULES = [
      ['posts', '文章'], ['projects', '项目'], ['games', '游戏'], ['collections', '收藏'], ['avatar', '头像'],
    ];
    const modRow = el('div', 'upload-modules');
    MODULES.forEach(([key, label]) => {
      const chip = el('button', 'module-chip' + (S.imageModule === key ? ' active' : ''), label);
      chip.type = 'button';
      chip.onclick = () => {
        S.imageModule = key;
        renderList();
      };
      modRow.appendChild(chip);
    });
    box.appendChild(modRow);

    const row = el('div', 'upload-row');
    const input = el('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    const btn = el('button', 'btn btn-primary', `上传到 /img/${S.imageModule}/（自动压缩）`);
    btn.onclick = () => input.click();
    input.onchange = () => uploadImages(input.files, S.imageModule).finally(() => (input.value = ''));
    row.appendChild(btn);
    row.appendChild(input);
    if (S.imageModule !== 'avatar') {
      row.appendChild(el('p', 'list-count', `该目录图片可直接用作条目封面，路径前缀 /img/${S.imageModule}/…`));
    }
    box.appendChild(row);

    // 只显示当前目录的图片
    const scoped = images.filter((p) => p.startsWith(`source/img/${S.imageModule}/`));
    if (!scoped.length) {
      const label = (MODULES.find((m) => m[0] === S.imageModule) || ['', S.imageModule])[1];
      box.appendChild(el('p', 'empty', `「${label}」目录暂无图片`));
      return;
    }
    const grid = el('div', 'image-grid');
    scoped.forEach((p) => {
      const cell = el('div', 'image-cell');
      const img = el('img');
      img.src = p.replace(/^source/, '');
      img.loading = 'lazy';
      img.onclick = () => imageActions(p);
      const name = el('div', 'image-name', p.split('/').pop());
      cell.appendChild(img);
      cell.appendChild(name);
      grid.appendChild(cell);
    });
    box.appendChild(grid);
  }

  function renderTrash(box, items) {
    const head = el('div', 'list-head');
    head.appendChild(el('h2', null, '回收站'));
    head.appendChild(el('span', 'list-count', `${items.length} 项`));
    box.appendChild(head);
    if (!items.length) {
      box.appendChild(el('p', 'empty', '回收站是空的'));
      return;
    }
    const typeLabel = { post: '文章', draft: '草稿', data: '条目', image: '图片' };
    const list = el('div', 'card-list');
    items.forEach((t) => {
      const c = el('div', 'card');
      const body = el('div', 'card-body');
      body.appendChild(el('div', 'card-title', t.title || t.originalPath));
      body.appendChild(el('div', 'card-sub', `${typeLabel[t.type] || t.type} · 原 ${t.originalPath} · ${t.deletedAt || ''}`));
      c.appendChild(body);
      const acts = el('div', 'card-actions');
      const res = el('button', 'btn btn-mini', '恢复');
      res.onclick = async () => {
        const ok = await confirmDialog('恢复内容', `恢复「${t.title || t.originalPath}」到原位置？已存在同名文件时会并排追加。`, '恢复');
        if (!ok) return;
        try {
          await api('/api/content-restore', { method: 'POST', body: { trashId: t.id, expectedHeadSha: S.lastListSha } });
          toast('已恢复并提交');
          await reloadList();
        } catch (e) {
          handleOpError(e);
        }
      };
      acts.appendChild(res);
      c.appendChild(acts);
      list.appendChild(c);
    });
    box.appendChild(list);
  }

  // ---------- 冲突与操作错误 ----------
  function handleOpError(e) {
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
          const fresh = await api('/api/content-list');
          S.data = fresh;
          S.lastListSha = fresh.headSha;
          await saveCurrentEditing({ headSha: fresh.headSha, force: true });
        } catch (err) {
          handleOpError(err);
        }
      };
      return;
    }
    toast(e.payload && e.payload.hint ? e.payload.hint : (e.message || '操作失败'));
  }

  async function reloadList() {
    S.data = await api('/api/content-list');
    S.lastListSha = S.data.headSha;
    renderList();
  }

  // ---------- 文章编辑器 ----------
  function slugifyClient(title) {
    const s = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
    return s;
  }

  async function openPostEditor(path) {
    try {
      let mode, frontmatter, body, sha, name;
      if (!path) {
        mode = 'new';
        frontmatter = { title: '', tags: [], categories: [] };
        body = '';
        name = '';
      } else {
        const f = await api('/api/content-get?path=' + encodeURIComponent(path));
        mode = f.isDraft ? 'draft' : 'published';
        frontmatter = f.frontmatter;
        body = f.body;
        sha = f.sha;
        name = path.split('/').pop().replace(/\.md$/, '');
      }
      S.editor = { mode, path: path || null, sha: sha || null, slug: name, dirty: false };
      $('view-list').hidden = true;
      $('view-data-editor').hidden = true;
      $('view-site-editor').hidden = true;
      $('view-post-editor').hidden = false;
      $('post-title').value = frontmatter.title || '';
      $('post-slug').value = name;
      $('post-slug').disabled = mode === 'published';
      $('post-tags').value = (frontmatter.tags || []).join(',');
      $('post-categories').value = (frontmatter.categories || []).join(',');
      $('post-cover').value = frontmatter.cover || '';
      $('post-featured').checked = !!frontmatter.featured;
      $('post-body').value = body;
      updateWordCount();
      $('post-preview').hidden = true;
      $('post-body').hidden = false;
      const pl = $('post-permalink');
      if (mode === 'published') {
        pl.textContent = `永久链接锁定：/${(frontmatter.date || '').slice(0, 10).replace(/-/g, '/').replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, '$1/$2/$3')}/${name}/`;
      } else if (mode === 'draft') {
        pl.textContent = '草稿（不会被构建发布）';
      } else {
        pl.textContent = '新文章';
      }
      if (mode === 'new') {
        $('btn-save-draft').textContent = '保存草稿';
        $('btn-publish').textContent = '直接发布';
      } else if (mode === 'draft') {
        $('btn-save-draft').textContent = '保存草稿';
        $('btn-publish').textContent = '发布草稿';
      } else {
        $('btn-save-draft').hidden = true;
        $('btn-publish').textContent = '保存修改';
      }
      if (mode !== 'published') $('btn-save-draft').hidden = false;
    } catch (e) {
      handleOpError(e);
    }
  }

  function collectEditor() {
    return {
      title: $('post-title').value.trim(),
      slug: $('post-slug').value.trim().toLowerCase(),
      tags: $('post-tags').value,
      categories: $('post-categories').value,
      cover: $('post-cover').value.trim(),
      featured: $('post-featured').checked,
      body: $('post-body').value,
    };
  }

  function updateWordCount() {
    const t = $('post-body').value;
    const cn = (t.match(/[\u4e00-\u9fff]/g) || []).length;
    const words = (t.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
    $('post-wordcount').textContent = cn + words ? `${cn + words} 字` : '';
  }
  $('post-body').addEventListener('input', updateWordCount);

  async function saveCurrentEditing(opts) {
    const o = opts || {};
    const e = collectEditor();
    if (!e.title) {
      toast('标题不能为空');
      return;
    }
    if (!e.slug) {
      e.slug = slugifyClient(e.title) || 'post-' + Date.now();
      $('post-slug').value = e.slug;
    }
    const ed = S.editor;
    if (ed.mode === 'published') {
      const r = await api('/api/content-save', {
        method: 'POST',
        body: {
          kind: 'post', action: 'update',
          path: ed.path, title: e.title, tags: e.tags, categories: e.categories, body: e.body,
          cover: e.cover, featured: e.featured,
          sha: o.force ? null : ed.sha, expectedHeadSha: o.headSha || S.lastListSha,
        },
      });
      ed.sha = r.sha;
      S.lastListSha = r.headSha;
      setDeployCommitted(r.commitSha);
      toast('修改已保存并提交');
    } else {
      const r = await api('/api/content-save', {
        method: 'POST',
        body: {
          kind: 'post', action: 'save-draft',
          slug: e.slug, prevSlug: ed.slug && ed.slug !== e.slug ? ed.slug : null,
          title: e.title, tags: e.tags, categories: e.categories, body: e.body,
          cover: e.cover, featured: e.featured,
          sha: o.force ? null : ed.sha, expectedHeadSha: o.headSha || S.lastListSha,
        },
      });
      ed.sha = r.sha;
      ed.slug = e.slug;
      ed.path = r.path;
      S.lastListSha = r.headSha;
      setDeployCommitted(r.commitSha);
      toast('草稿已保存');
    }
  }

  async function publishCurrentEditing() {
    const ed = S.editor;
    const e = collectEditor();
    if (!e.title) {
      toast('标题不能为空');
      return;
    }
    if (ed.mode === 'published') {
      return saveCurrentEditing();
    }
    let slug = e.slug || slugifyClient(e.title) || 'post-' + Date.now();
    const dateGuess = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '/');
    const ok = await confirmDialog('发布确认', `将发布为 /${dateGuess}/${slug}/（以实际发布日期为准）。发布后永久链接固定，标题可改但链接不变。`, '发布');
    if (!ok) return;
    if (ed.mode === 'draft') {
      // 先落草稿（若有未保存修改），再整体发布
      await saveCurrentEditing();
      const r = await api('/api/content-save', { method: 'POST', body: { kind: 'post', action: 'publish-draft', slug: S.editor.slug, expectedHeadSha: S.lastListSha } });
      S.lastListSha = r.headSha;
      setDeployCommitted(r.commitSha);
      toast(`已发布 ${r.permalink}`);
    } else {
      const r = await api('/api/content-save', {
        method: 'POST',
        body: { kind: 'post', action: 'publish-new', slug, title: e.title, tags: e.tags, categories: e.categories, body: e.body, cover: e.cover, featured: e.featured, expectedHeadSha: S.lastListSha },
      });
      S.lastListSha = r.headSha;
      setDeployCommitted(r.commitSha);
      toast(`已发布 ${r.permalink}`);
    }
    await reloadList();
    switchTab('posts');
  }

  $('btn-save-draft').onclick = guard(async () => {
    await saveCurrentEditing();
    await reloadList();
  });
  $('btn-publish').onclick = guard(publishCurrentEditing);

  function guard(fn) {
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

  // 预览
  $('btn-toggle-preview').onclick = () => {
    const pv = $('post-preview');
    const show = pv.hidden;
    if (show) pv.innerHTML = renderMarkdown($('post-body').value);
    pv.hidden = !show;
    $('post-body').hidden = show;
    $('btn-toggle-preview').textContent = show ? '编辑' : '预览';
  };

  // 简易 Markdown 预览（仅用于后台快速校对，不做完整渲染）
  function renderMarkdown(md) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = esc(md);
    html = html.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`);
    html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>');
    html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.split(/\n{2,}/).map((b) => (/^<(h\d|pre|ul|ol|img|blockquote)/.test(b.trim()) ? b : `<p>${b.replace(/\n/g, '<br>')}</p>`)).join('\n');
    return html;
  }

  // ---------- 数据条目编辑器 ----------
  const MODULE_META = {
    projects: {
      label: '项目',
      linkLabel: '链接（GitHub 仓库 / 演示地址 / 相关文章，可空）',
      linkPlaceholder: 'https://github.com/YaoZenO/xxx',
      coverHint: '上传后存入 /img/projects/，建议 16:9 横图；首页有真实条目才渲染该板块。',
    },
    games: {
      label: '游戏',
      linkLabel: '链接（游戏页面 / 商店 / 攻略地址，可空）',
      linkPlaceholder: 'https://store.steampowered.com/app/xxx',
      coverHint: '上传后存入 /img/games/；玩过的游戏记录在这里，首页按真实条目数展示。',
    },
    collections: {
      label: '收藏',
      linkLabel: '链接（原文 / 资源地址，可空）',
      linkPlaceholder: 'https://example.com/article',
      coverHint: '上传后存入 /img/collections/；收藏的文章、工具、资源都可以放。',
    },
  };

  function openItemEditor(module, index) {
    const item = index === null ? {} : S.data.data[module][index];
    S.itemEditor = { module, index };
    const meta = MODULE_META[module] || {};
    $('view-list').hidden = true;
    $('view-post-editor').hidden = true;
    $('view-site-editor').hidden = true;
    $('view-data-editor').hidden = false;
    $('item-module-badge').textContent = `${meta.label || module}条目 · ${index === null ? '新增' : '编辑'}`;
    $('item-link-label').textContent = meta.linkLabel || '链接（http(s):// 或站内路径，可空）';
    $('item-link').placeholder = meta.linkPlaceholder || '';
    $('item-cover-hint').textContent = meta.coverHint || '直接上传会存入该板块专属目录。';
    $('item-title').value = item.title || '';
    $('item-link').value = item.link || '';
    $('item-desc').value = item.desc || '';
    $('item-cover').value = item.cover || '';
    $('item-date').value = item.date || '';
  }

  // 条目编辑器内直接上传封面（存入该板块专属目录，成功后自动回填路径）
  $('btn-item-cover-upload').onclick = guard(async () => {
    const ie = S.itemEditor;
    if (!ie) return;
    const input = el('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        await uploadOneImage(file, ie.module);
        await reloadList();
        const l = S.data;
        const mine = (l.images || []).filter((p) => p.startsWith(`source/img/${ie.module}/`)).sort();
        const latest = mine[mine.length - 1];
        $('item-cover').value = latest ? sitePath(latest) : '';
        toast('封面上传成功，路径已回填');
      } catch (e) {
        handleOpError(e);
      }
    };
    input.click();
  });

  $('btn-save-item').onclick = guard(async () => {
    const ie = S.itemEditor;
    if (!ie) return;
    const body = {
      kind: 'data', module: ie.module, index: ie.index,
      item: { title: $('item-title').value, link: $('item-link').value, desc: $('item-desc').value, cover: $('item-cover').value, date: $('item-date').value },
      expectedHeadSha: S.lastListSha,
    };
    await api('/api/content-save', { method: 'POST', body });
    setDeployCommitted(null);
    toast('条目已保存并提交');
    await reloadList();
    switchTab(ie.module);
  });

  // ---------- 站点身份设置 ----------
  function renderSiteEditor(box, site) {
    const head = el('div', 'list-head');
    head.appendChild(el('h2', null, '站点身份'));
    head.appendChild(el('span', 'list-count', 'source/_data/site.yml'));
    box.appendChild(head);
    box.appendChild(el('p', 'list-count', '配置首页左侧身份域与页脚。留空的项不渲染，不会伪造内容。'));
    fillSiteEditor(site);
  }

  function fillSiteEditor(site) {
    $('site-intro').value = site.intro || '';
    $('site-motto').value = site.motto || '';
    $('site-avatar').value = site.avatar || '';
    $('site-identity').value = (site.identity_words || []).join('\n');
  }

  $('btn-save-site').onclick = guard(async () => {
    const body = {
      kind: 'site',
      intro: $('site-intro').value,
      motto: $('site-motto').value,
      avatar: $('site-avatar').value,
      identity_words: $('site-identity').value,
      expectedHeadSha: S.lastListSha,
    };
    await api('/api/content-save', { method: 'POST', body });
    setDeployCommitted(null);
    toast('站点身份已保存并提交');
    await reloadList();
  });

  // 设置页头像直传（存入 /img/avatar/，成功后回填路径）
  $('btn-site-avatar-upload').onclick = guard(async () => {
    const input = el('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        await uploadOneImage(file, 'avatar');
        await reloadList();
        const mine = (S.data.images || []).filter((p) => p.startsWith('source/img/avatar/')).sort();
        const latest = mine[mine.length - 1];
        $('site-avatar').value = latest ? sitePath(latest) : '';
        toast('头像上传成功，路径已回填');
      } catch (e) {
        handleOpError(e);
      }
    };
    input.click();
  });

  // ---------- 图片 ----------
  // 压缩上限：Vercel 函数请求体限 4.5MB，base64 会放大约 1.37 倍，
  // 因此压缩产物必须控制在 2.5MB 以内，超限则逐级降低尺寸与质量重试。
  const UPLOAD_BLOB_LIMIT = 2.5 * 1024 * 1024;

  function drawToBlob(img, max, quality, isPng) {
    let w = img.width, h = img.height;
    if (Math.max(w, h) > max) {
      const k = max / Math.max(w, h);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const type = isPng ? 'image/png' : 'image/jpeg';
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  async function compressImage(file) {
    const isPng = /png$/i.test(file.type);
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new ApiError(400, { error: 'BAD_IMAGE', hint: `${file.name} 不是可识别的图片文件` }));
        i.src = url;
      });
      // 逐级降参：1600/0.85 → 1280/0.75 → 1024/0.7；PNG 过大时转 JPG
      const attempts = isPng
        ? [[1600, undefined, true], [1280, undefined, true], [1024, undefined, true], [1280, 0.85, false]]
        : [[1600, 0.85, false], [1280, 0.75, false], [1024, 0.7, false]];
      for (const [max, quality, asPng] of attempts) {
        const blob = await drawToBlob(img, max, quality, asPng);
        if (blob && blob.size <= UPLOAD_BLOB_LIMIT) return { blob, ext: asPng ? 'png' : 'jpg' };
      }
      const last = await drawToBlob(img, 1024, 0.7, false);
      if (last && last.size <= UPLOAD_BLOB_LIMIT) return { blob: last, ext: 'jpg' };
      throw new ApiError(413, { error: 'TOO_LARGE', hint: `${file.name} 多次压缩后仍过大，请先裁剪图片再上传` });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function uploadOneImage(file, module) {
    const { blob, ext } = await compressImage(file);
    const b64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = () => reject(new ApiError(400, { error: 'READ_FAIL', hint: `${file.name} 读取失败` }));
      r.readAsDataURL(blob);
    });
    await api('/api/upload-image', {
      method: 'POST',
      body: { module, filename: (file.name || 'image').replace(/\.[^.]+$/, '') + '.' + ext, dataBase64: b64, expectedHeadSha: S.lastListSha },
    });
  }

  async function uploadImages(files, module) {
    if (!files || !files.length) return;
    if (files.length > 6) {
      toast('一次最多上传 6 张');
      return;
    }
    let done = 0;
    for (const file of files) {
      try {
        await uploadOneImage(file, module);
        done += 1;
        toast(`已上传 ${file.name} → /img/${module}/`);
      } catch (e) {
        handleOpError(e);
      }
    }
    if (done) await reloadList();
  }

  function sitePath(p) {
    return String(p || '').replace(/^source/, '');
  }

  function imageActions(repoPath) {
    const sp = sitePath(repoPath);
    const actions = [
      { label: '复制图片路径', fn: () => navigator.clipboard && navigator.clipboard.writeText(sp).then(() => toast('已复制 ' + sp)) },
      { label: '插入到文章正文', fn: () => insertToBody(`![](${sp})`) },
      { label: '设为当前条目封面', fn: () => { const f = $('item-cover'); if (f) { f.value = sp; toast('已设为封面路径：' + sp); } } },
      { label: '设为文章封面', fn: () => { const f = $('post-cover'); if (f) { f.value = sp; toast('已设为封面路径：' + sp); } } },
      {
        label: '删除此图片', danger: true,
        fn: async () => {
          const ok = await confirmDialog('删除图片', `删除 ${sp}？会移入回收站，可恢复。`, '删除');
          if (!ok) return;
          try {
            await api('/api/content-delete', { method: 'POST', body: { path: repoPath, title: repoPath.split('/').pop(), expectedHeadSha: S.lastListSha } });
            toast('已删除并提交');
            await reloadList();
          } catch (e) {
            handleOpError(e);
          }
        },
      },
    ];
    const html = actions.map((a, i) => `<button class="btn btn-block" data-i="${i}" style="margin-bottom:.5rem;${a.danger ? 'color:#b03a2e' : ''}">${a.label}</button>`).join('');
    const box = $('picker-grid');
    box.innerHTML = '';
    const p = el('div');
    p.innerHTML = `<p class="confirm-text" style="overflow-wrap:anywhere">${sp}</p>` + html;
    box.appendChild(p);
    p.querySelectorAll('button[data-i]').forEach((b) => {
      b.onclick = () => {
        $('modal-picker').hidden = true;
        actions[Number(b.dataset.i)].fn();
      };
    });
    $('modal-picker').hidden = false;
  }

  function insertToBody(text) {
    const ta = $('post-body');
    const start = ta.selectionStart || ta.value.length;
    const end = ta.selectionEnd || ta.value.length;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.dispatchEvent(new Event('input'));
    if ($('view-post-editor').hidden) toast('已记录，请回到文章编辑器粘贴：' + text);
  }

  $('btn-insert-image').onclick = () => {
    if (!S.data || !S.data.images.length) {
      toast('还没有图片，请先到「图片」页上传');
      return;
    }
    const grid = $('picker-grid');
    grid.innerHTML = '';
    S.data.images.forEach((p) => {
      const img = el('img');
      img.src = sitePath(p);
      img.loading = 'lazy';
      img.onclick = () => {
        $('modal-picker').hidden = true;
        insertToBody(`![](${sitePath(p)})`);
      };
      grid.appendChild(img);
    });
    $('modal-picker').hidden = false;
  };

  // 通用图库选择器：点击图片 → 回调(站点路径)
  function openImagePicker(onPick) {
    if (!S.data || !S.data.images.length) {
      toast('还没有图片，请先到「图片」页上传，或直接用「上传封面」');
      return;
    }
    const grid = $('picker-grid');
    grid.innerHTML = '';
    S.data.images.forEach((p) => {
      const img = el('img');
      img.src = sitePath(p);
      img.loading = 'lazy';
      img.onclick = () => {
        $('modal-picker').hidden = true;
        onPick(sitePath(p));
      };
      grid.appendChild(img);
    });
    $('modal-picker').hidden = false;
  }

  // 封面选择（条目编辑器 / 文章编辑器 / 设置页头像）
  $('btn-item-cover-pick').onclick = () => openImagePicker((sp) => { $('item-cover').value = sp; });
  $('post-cover').addEventListener('dblclick', () => openImagePicker((sp) => { $('post-cover').value = sp; }));

  // ---------- 部署状态 ----------
  function setDeployCommitted(commitSha) {
    stopPolling();
    const pill = $('deploy-pill');
    pill.hidden = false;
    pill.dataset.state = 'committed';
    pill.textContent = '已提交';
    if (commitSha) startPolling(commitSha);
  }

  function startPolling(commitSha) {
    stopPolling();
    S.pollTries = 0;
    S.pollTimer = setInterval(async () => {
      S.pollTries += 1;
      if (S.pollTries > 45) {
        stopPolling();
        setPill('committed', '已提交（构建跟踪超时）');
        return;
      }
      try {
        const st = await api('/api/deploy-status?sha=' + encodeURIComponent(commitSha));
        if (!st.available) {
          setPill('committed', '已提交（部署状态查询未配置）');
          return; // 不停止轮询，配置生效前保持已提交语义
        }
        const mine = (st.deployments || []).find((x) => x.sha === commitSha);
        if (!mine) {
          setPill('committed', '已提交，等待构建');
          return;
        }
        if (mine.state === 'READY') {
          stopPolling();
          setPill('ready', '部署成功');
          toast('部署成功，站点已更新');
        } else if (mine.state === 'ERROR' || mine.state === 'CANCELED') {
          stopPolling();
          setPill('error', '部署失败');
          toast('部署失败，请到 Vercel 控制台查看日志');
        } else if (mine.state === 'BUILDING' || mine.state === 'INITIALIZING') {
          setPill('building', '构建中');
        } else {
          setPill('building', '构建排队中');
        }
      } catch (e) { /* 下次重试 */ }
    }, 8000);
  }

  function stopPolling() {
    if (S.pollTimer) clearInterval(S.pollTimer);
    S.pollTimer = null;
  }

  function setPill(state, text) {
    const pill = $('deploy-pill');
    pill.hidden = false;
    pill.dataset.state = state;
    pill.textContent = text;
  }

  // ---------- 事件绑定 ----------
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
  $('post-title').addEventListener('blur', () => {
    const ed = S.editor;
    if (ed && ed.mode !== 'published' && !$('post-slug').value) {
      $('post-slug').value = slugifyClient($('post-title').value);
    }
  });

  // ---------- 启动 ----------
  (async function boot() {
    try {
      const s = await api('/api/session-check');
      S.login = s.login;
      S.mockMode = !!s.mockMode;
      await reloadList();
      showApp();
    } catch (e) {
      // showLogin 已在 api() 中触发
      if (e.status === 0) showLogin('网络异常，请刷新重试');
    }
  })();
})();
