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
    itemEditor: null, // 数据条目编辑器状态 {module, index|null, expectedHeadSha}
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

    const row = el('div', 'upload-row');
    const input = el('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    const btn = el('button', 'btn btn-primary', '上传图片（自动压缩）');
    btn.onclick = () => input.click();
    input.onchange = () => uploadImages(input.files).finally(() => (input.value = ''));
    row.appendChild(btn);
    row.appendChild(input);
    box.appendChild(row);

    if (!images.length) {
      box.appendChild(el('p', 'empty', '暂无图片'));
      return;
    }
    const grid = el('div', 'image-grid');
    images.forEach((p) => {
      const cell = el('div', 'image-cell');
      const img = el('img');
      img.src = p;
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
      $('view-post-editor').hidden = false;
      $('post-title').value = frontmatter.title || '';
      $('post-slug').value = name;
      $('post-slug').disabled = mode === 'published';
      $('post-tags').value = (frontmatter.tags || []).join(',');
      $('post-categories').value = (frontmatter.categories || []).join(',');
      $('post-body').value = body;
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
      body: $('post-body').value,
    };
  }

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
        body: { kind: 'post', action: 'publish-new', slug, title: e.title, tags: e.tags, categories: e.categories, body: e.body, expectedHeadSha: S.lastListSha },
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
  function openItemEditor(module, index) {
    const item = index === null ? {} : S.data.data[module][index];
    S.itemEditor = { module, index };
    $('view-list').hidden = true;
    $('view-post-editor').hidden = true;
    $('view-data-editor').hidden = false;
    $('item-title').value = item.title || '';
    $('item-link').value = item.link || '';
    $('item-desc').value = item.desc || '';
    $('item-cover').value = item.cover || '';
    $('item-date').value = item.date || '';
  }

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

  // ---------- 图片 ----------
  async function compressImage(file) {
    const max = 1600;
    const isPng = /png$/i.test(file.type);
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
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
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
      return { blob, ext: isPng ? 'png' : 'jpg' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function uploadImages(files) {
    if (!files || !files.length) return;
    if (files.length > 6) {
      toast('一次最多上传 6 张');
      return;
    }
    for (const file of files) {
      try {
        const { blob, ext } = await compressImage(file);
        if (blob.size > 4 * 1024 * 1024) {
          toast(`${file.name} 压缩后仍过大，请裁剪后重试`);
          continue;
        }
        const b64 = await new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result.split(',')[1]);
          r.readAsDataURL(blob);
        });
        await api('/api/upload-image', {
          method: 'POST',
          body: { module: 'posts', filename: (file.name || 'image').replace(/\.[^.]+$/, '') + '.' + ext, dataBase64: b64, expectedHeadSha: S.lastListSha },
        });
        toast(`已上传 ${file.name}`);
      } catch (e) {
        handleOpError(e);
      }
    }
    await reloadList();
  }

  function imageActions(path) {
    const actions = [
      { label: '复制图片路径', fn: () => navigator.clipboard && navigator.clipboard.writeText(path).then(() => toast('已复制 ' + path)) },
      { label: '插入到文章正文', fn: () => insertToBody(`![](${path})`) },
      { label: '设为当前条目封面', fn: () => { $('item-cover').value = path; toast('已设为封面路径：' + path); } },
      {
        label: '删除此图片', danger: true,
        fn: async () => {
          const ok = await confirmDialog('删除图片', `删除 ${path}？会移入回收站，可恢复。`, '删除');
          if (!ok) return;
          try {
            await api('/api/content-delete', { method: 'POST', body: { path, title: path.split('/').pop(), expectedHeadSha: S.lastListSha } });
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
    p.innerHTML = `<p class="confirm-text" style="overflow-wrap:anywhere">${path}</p>` + html;
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
      img.src = p;
      img.loading = 'lazy';
      img.onclick = () => {
        $('modal-picker').hidden = true;
        insertToBody(`![](${p})`);
      };
      grid.appendChild(img);
    });
    $('modal-picker').hidden = false;
  };

  // 封面选择（条目编辑器）
  $('item-cover').addEventListener('dblclick', openCoverPicker);
  function openCoverPicker() {
    if (!S.data || !S.data.images.length) {
      toast('还没有图片，请先到「图片」页上传');
      return;
    }
    const grid = $('picker-grid');
    grid.innerHTML = '';
    S.data.images.forEach((p) => {
      const img = el('img');
      img.src = p;
      img.loading = 'lazy';
      img.onclick = () => {
        $('item-cover').value = p;
        $('modal-picker').hidden = true;
      };
      grid.appendChild(img);
    });
    $('modal-picker').hidden = false;
  }

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
