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
    // 启动若走了 summary 模式，这里按需补齐草稿标题
    if (tab === 'posts') ensureDraftTitles();
  }

  // ---------- 列表渲染 ----------
  // 统一头部组件：kicker + 标题 + 计数 + 主操作按钮同排（右侧区域上半部分唯一结构）
  function pageHead(box, { kicker, title, count, action }) {
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

  function subHead(box, label, count) {
    const p = el('div', 'sub-head');
    p.appendChild(el('b', null, label));
    if (count != null) p.appendChild(el('span', null, String(count)));
    box.appendChild(p);
    return p;
  }

  function emptyState(title, hint) {
    const p = el('p', 'empty', title);
    if (hint) p.appendChild(el('span', 'empty-hint', hint));
    return p;
  }

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
    pageHead(box, {
      kicker: 'POSTS',
      title: '文章',
      count: `${d.posts.length} 篇`,
      action: { label: '新建文章', fn: () => openPostEditor(null) },
    });

    if (d.drafts.length) {
      subHead(box, '草稿', `${d.drafts.length} 篇`);
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

    subHead(box, '已发布', `${d.posts.length} 篇`);
    if (!d.posts.length) {
      box.appendChild(emptyState('暂无已发布文章'));
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
    const kickers = { projects: 'PROJECTS', games: 'GAMES', collections: 'COLLECTIONS' };
    const btnLabels = { projects: '新增项目', games: '新增游戏', collections: '新增收藏' };
    const hints = {
      projects: '支持背景 / 过程 / 技术 / 成果长篇介绍',
      games: '支持分类 / 玩法 / 截图 / 下载试玩链接',
      collections: '文章、工具、资源等收藏链接',
    };
    pageHead(box, {
      kicker: kickers[module],
      title: labels[module],
      count: `${items.length} 条`,
      action: { label: btnLabels[module], fn: () => openItemEditor(module, null) },
    });

    if (!items.length) {
      box.appendChild(emptyState(`暂无${labels[module]}条目`, hints[module] + '；为空时首页不会渲染该板块'));
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
      const subs = [it.summary || it.desc, it.date].filter(Boolean).join(' · ');
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
    // 目录选择：按内容板块分目录存放（文章/项目/游戏/收藏/头像）
    const MODULES = [
      ['posts', '文章'], ['projects', '项目'], ['games', '游戏'], ['collections', '收藏'], ['avatar', '头像'],
    ];
    const input = el('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    input.onchange = () => uploadImages(input.files, S.imageModule).finally(() => (input.value = ''));

    pageHead(box, {
      kicker: 'IMAGES',
      title: '图片',
      count: `${images.length} 张`,
      action: { label: '上传图片', fn: () => input.click() },
    });

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
    box.appendChild(input);
    if (S.imageModule !== 'avatar') {
      box.appendChild(el('p', 'list-count', `上传目录 /img/${S.imageModule}/，可直接用作该板块条目封面`));
    }

    // 只显示当前目录的图片
    const scoped = images.filter((p) => p.startsWith(`source/img/${S.imageModule}/`));
    if (!scoped.length) {
      const label = (MODULES.find((m) => m[0] === S.imageModule) || ['', S.imageModule])[1];
      box.appendChild(emptyState(`「${label}」目录暂无图片`));
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
    pageHead(box, { kicker: 'TRASH', title: '回收站', count: `${items.length} 项` });
    if (!items.length) {
      box.appendChild(emptyState('回收站是空的', '删除的文章 / 条目 / 图片会先移到这里，可随时恢复'));
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
          // 只需要 headSha，走 summary 模式少 N 次草稿请求
          const fresh = await api('/api/content-list?summary=1');
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

  // opts.summary=true 走轻量模式：跳过草稿逐篇读取，首屏少 N 次请求。
  async function reloadList(opts) {
    const summary = !!(opts && opts.summary);
    S.data = await api('/api/content-list' + (summary ? '?summary=1' : ''));
    S.lastListSha = S.data.headSha;
    renderList();
  }

  // summary 模式下草稿只有文件名；进入文章 tab 时若发现缺标题，再全量拉一次补齐。
  async function ensureDraftTitles() {
    const drafts = (S.data && S.data.drafts) || [];
    if (!drafts.length) return;
    if (drafts.every((d) => d.title)) return;
    await reloadList();
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

  // ---------- 数据条目编辑器（三类型各自独立表单） ----------
  const MODULE_META = {
    projects: { label: '项目', form: 'projects' },
    games: { label: '游戏', form: 'games' },
    collections: { label: '收藏', form: 'collections' },
  };

  function showItemForm(module) {
    document.querySelectorAll('.item-form').forEach((f) => {
      f.hidden = f.dataset.form !== module;
    });
  }

  // 富文本区：插图按钮 + 字数统计（供项目/游戏长文共用）
  function bindRichTextarea(btnId, taId) {
    $(btnId).onclick = () => openImagePicker((sp) => insertToTextarea($(taId), `![](${sp})`));
    const ta = $(taId);
    const wc = document.querySelector(`.wordcount[data-wc="${taId}"]`);
    const update = () => {
      const t = ta.value;
      const cn = (t.match(/[\u4e00-\u9fff]/g) || []).length;
      const words = (t.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
      if (wc) wc.textContent = cn + words ? `${cn + words} 字` : '';
    };
    ta.addEventListener('input', update);
    update();
  }

  function insertToTextarea(ta, text) {
    const start = ta.selectionStart || ta.value.length;
    const end = ta.selectionEnd || ta.value.length;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  }

  // 游戏媒体区：路径列表的增删
  const S_media = [];
  function renderMediaList() {
    const box = $('game-media-list');
    box.textContent = '';
    S_media.forEach((p, i) => {
      const row = el('div', 'media-row');
      const img = el('img');
      img.src = p;
      img.loading = 'lazy';
      img.onerror = () => img.remove();
      const name = el('span', 'media-name', p.split('/').pop());
      const del = el('button', 'btn btn-quiet', '移除');
      del.onclick = () => { S_media.splice(i, 1); renderMediaList(); };
      row.appendChild(img);
      row.appendChild(name);
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  // 游戏链接对 repeater：{label, url}
  const S_links = [];
  function renderLinkRows() {
    const box = $('game-link-rows');
    box.textContent = '';
    S_links.forEach((l, i) => {
      const row = el('div', 'link-row');
      const label = el('input');
      label.type = 'text';
      label.placeholder = '名称，如 下载';
      label.value = l.label || '';
      label.oninput = () => { S_links[i].label = label.value; };
      const url = el('input');
      url.type = 'text';
      url.placeholder = 'https://…';
      url.value = l.url || '';
      url.oninput = () => { S_links[i].url = url.value; };
      const del = el('button', 'btn btn-quiet', '移除');
      del.onclick = () => { S_links.splice(i, 1); renderLinkRows(); };
      row.appendChild(label);
      row.appendChild(url);
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function openItemEditor(module, index) {
    const item = index === null ? {} : (S.data.data[module][index] || {});
    S.itemEditor = { module, index };
    const meta = MODULE_META[module] || {};
    $('view-list').hidden = true;
    $('view-post-editor').hidden = true;
    $('view-site-editor').hidden = true;
    $('view-data-editor').hidden = false;
    $('item-module-badge').textContent = `${meta.label || module}条目 · ${index === null ? '新增' : '编辑'}`;
    showItemForm(module);

    if (module === 'projects') {
      $('item-title').value = item.title || '';
      $('item-slug').value = item.slug || '';
      $('item-cover').value = item.cover || '';
      $('item-date').value = item.date || '';
      $('item-tags').value = (item.tags || []).join(', ');
      $('item-link').value = item.link || '';
      $('item-summary').value = item.summary || item.desc || '';
      $('item-bg').value = item.background || '';
      $('item-process').value = item.process || '';
      $('item-tech').value = item.tech || '';
      $('item-outcome').value = item.outcome || '';
      ['item-bg', 'item-process', 'item-tech', 'item-outcome'].forEach((id) => $(id).dispatchEvent(new Event('input')));
    } else if (module === 'games') {
      $('game-title').value = item.title || '';
      $('game-slug').value = item.slug || '';
      $('game-cover').value = item.cover || '';
      $('game-genre').value = item.genre || '';
      $('game-platform').value = item.platform || '';
      $('game-status').value = item.status || '';
      $('game-summary').value = item.summary || '';
      $('game-gameplay').value = item.gameplay || '';
      $('game-gameplay').dispatchEvent(new Event('input'));
      $('game-video').value = item.video || '';
      $('game-date').value = item.date || '';
      S_media.length = 0;
      (item.media || []).forEach((m) => S_media.push(m));
      renderMediaList();
      S_links.length = 0;
      (item.links || []).forEach((l) => S_links.push({ label: l.label || '', url: l.url || '' }));
      renderLinkRows();
    } else {
      $('coll-title').value = item.title || '';
      $('coll-link').value = item.link || '';
      $('coll-desc').value = item.desc || '';
      $('coll-cover').value = item.cover || '';
      $('coll-date').value = item.date || '';
    }
  }

  function collectItemEditor() {
    const ie = S.itemEditor;
    if (!ie) return null;
    if (ie.module === 'projects') {
      return {
        kind: 'data', module: 'projects', index: ie.index,
        item: {
          slug: $('item-slug').value.trim(),
          title: $('item-title').value.trim(),
          cover: $('item-cover').value.trim(),
          date: $('item-date').value.trim(),
          tags: $('item-tags').value,
          link: $('item-link').value.trim(),
          summary: $('item-summary').value.trim(),
          background: $('item-bg').value,
          process: $('item-process').value,
          tech: $('item-tech').value,
          outcome: $('item-outcome').value,
        },
        expectedHeadSha: S.lastListSha,
      };
    }
    if (ie.module === 'games') {
      return {
        kind: 'data', module: 'games', index: ie.index,
        item: {
          slug: $('game-slug').value.trim(),
          title: $('game-title').value.trim(),
          cover: $('game-cover').value.trim(),
          genre: $('game-genre').value.trim(),
          platform: $('game-platform').value.trim(),
          status: $('game-status').value.trim(),
          summary: $('game-summary').value.trim(),
          gameplay: $('game-gameplay').value,
          media: S_media.slice(),
          video: $('game-video').value.trim(),
          date: $('game-date').value.trim(),
          links: S_links.filter((l) => l.label.trim() && l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
        },
        expectedHeadSha: S.lastListSha,
      };
    }
    return {
      kind: 'data', module: 'collections', index: ie.index,
      item: {
        title: $('coll-title').value.trim(),
        link: $('coll-link').value.trim(),
        desc: $('coll-desc').value.trim(),
        cover: $('coll-cover').value.trim(),
        date: $('coll-date').value.trim(),
      },
      expectedHeadSha: S.lastListSha,
    };
  }

  // 保存按钮（三表单各一个，class 绑定）
  document.querySelectorAll('.btn-save-item').forEach((btn) => {
    btn.onclick = guard(async () => {
      const ie = S.itemEditor;
      if (!ie) return;
      const body = collectItemEditor();
      if (!body.item.title) {
        toast('标题不能为空');
        return;
      }
      await api('/api/content-save', { method: 'POST', body });
      setDeployCommitted(null);
      toast('已保存并提交');
      await reloadList();
      switchTab(ie.module);
    });
  });

  // 封面直传（三类型各自目录）
  function bindCoverUpload(btnId, inputId, module) {
    $(btnId).onclick = guard(async () => {
      const input = el('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          await uploadOneImage(file, module);
          await reloadList();
          const mine = (S.data.images || []).filter((p) => p.startsWith(`source/img/${module}/`)).sort();
          const latest = mine[mine.length - 1];
          $(inputId).value = latest ? sitePath(latest) : '';
          toast('上传成功，路径已回填');
        } catch (e) {
          handleOpError(e);
        }
      };
      input.click();
    });
  }

  // 富文本插图按钮 + 字数
  bindRichTextarea('btn-insert-bg', 'item-bg');
  bindRichTextarea('btn-insert-process', 'item-process');
  bindRichTextarea('btn-insert-tech', 'item-tech');
  bindRichTextarea('btn-insert-outcome', 'item-outcome');
  bindRichTextarea('btn-insert-gameplay', 'game-gameplay');

  // 封面：图库选择 + 直传
  $('btn-item-cover-pick').onclick = () => openImagePicker((sp) => { $('item-cover').value = sp; });
  $('btn-game-cover-pick').onclick = () => openImagePicker((sp) => { $('game-cover').value = sp; });
  $('btn-coll-cover-pick').onclick = () => openImagePicker((sp) => { $('coll-cover').value = sp; });
  bindCoverUpload('btn-item-cover-upload', 'item-cover', 'projects');
  bindCoverUpload('btn-game-cover-upload', 'game-cover', 'games');
  bindCoverUpload('btn-coll-cover-upload', 'coll-cover', 'collections');

  // 游戏媒体区：批量直传
  $('btn-game-media-upload').onclick = guard(async () => {
    const input = el('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      for (const file of files) {
        try {
          await uploadOneImage(file, 'games');
          await reloadList();
          const mine = (S.data.images || []).filter((p) => p.startsWith('source/img/games/')).sort();
          const latest = mine[mine.length - 1];
          if (latest) S_media.push(sitePath(latest));
          toast(`已上传 ${file.name}`);
        } catch (e) {
          handleOpError(e);
        }
      }
      renderMediaList();
    };
    input.click();
  });

  // 游戏链接对：添加
  $('btn-game-link-add').onclick = () => {
    S_links.push({ label: '', url: '' });
    renderLinkRows();
  };

  // ---------- 站点身份设置 ----------
  // 设置 tab 直接展示编辑器视图（无列表态）；进入时填充表单
  function renderSiteEditor(box, site) {
    const filled = ['intro', 'motto', 'avatar'].filter((k) => site && site[k]).length + ((site && site.identity_words && site.identity_words.length) ? 1 : 0);
    fillSiteEditor(site);
    $('view-list').hidden = true;
    $('view-site-editor').hidden = false;
    $('site-hint').textContent = `已配置 ${filled}/4 · 保存后自动提交，部署完成后首页生效`;
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
      // 启动走 summary 模式：跳过草稿逐篇读取，首屏更快
      await reloadList({ summary: true });
      showApp();
    } catch (e) {
      // showLogin 已在 api() 中触发
      if (e.status === 0) showLogin('网络异常，请刷新重试');
    }
  })();
})();
