/* 列表渲染：文章 / 数据条目 / 图片 / 回收站四个 tab 的列表态。
 * 只依赖 core；跨模块动作通过 core.hooks 调取（避免循环依赖）。
 */
'use strict';

import { S, $, el, hooks, reloadList, pageHead, subHead, emptyState, api, toast, confirmDialog, handleOpError, guard, markListStale } from './admin-core.js?v=20261104';

export function renderList() {
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
    // 设置 tab 由 site 模块渲染（入口经 core.hooks 调取，避免本模块反向依赖它）
    if (hooks.renderSiteEditor) hooks.renderSiteEditor(box, d.site || {});
  } else if (S.tab === 'trash') {
    renderTrash(box, d.trash || []);
  }
}

function renderPostsList(box, d) {
  pageHead(box, {
    kicker: 'POSTS',
    title: '文章',
    count: `${d.posts.length} 篇`,
    action: { label: '新建文章', fn: () => hooks.openPostEditor(null) },
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
      edit.onclick = () => hooks.openPostEditor(dr.path);
      acts.appendChild(edit);
      acts.appendChild(postDeleteButton(dr.path, dr.title || dr.name, '草稿'));
      c.appendChild(acts);
      dl.appendChild(c);
    });
    box.appendChild(dl);
  }

  // 私密文章（2026-10-22 与草稿分离）：写完了、只是不给别人看。
  // 与草稿并列成独立分区，卡片上直接「发布」回线上，不必开编辑器。
  const priv = d.private || [];
  if (priv.length) {
    subHead(box, '私密', `${priv.length} 篇`);
    const plist = el('div', 'card-list');
    priv.forEach((p) => {
      const c = el('div', 'card');
      const body = el('div', 'card-body');
      body.appendChild(el('div', 'card-title', p.title || p.name));
      body.appendChild(el('div', 'card-sub', p.path));
      c.appendChild(body);
      const acts = el('div', 'card-actions');
      const edit = el('button', 'btn btn-mini', '编辑');
      edit.onclick = () => hooks.openPostEditor(p.path);
      acts.appendChild(edit);
      acts.appendChild(privatePublishButton(p));
      acts.appendChild(postDeleteButton(p.path, p.title || p.name, '私密文章'));
      c.appendChild(acts);
      plist.appendChild(c);
    });
    box.appendChild(plist);
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
    edit.onclick = () => hooks.openPostEditor(p.path);
    acts.appendChild(edit);
    acts.appendChild(postUnpublishButton(p));
    acts.appendChild(postDeleteButton(p.path, p.name, '文章'));
    c.appendChild(acts); // 缺这一行会让「编辑」「删除」两个按钮都不进 DOM（E-027）
    list.appendChild(c);
  });
  box.appendChild(list);
}

// 文章 / 草稿删除：移入回收站（可恢复）。与条目删除同一模式。
// 2026-10-18：改用 .btn-danger-quiet —— 之前是无边框无底色的幽灵文字（.btn-quiet），
// 主人实测「后台找不到删除文章的地方」。破坏性操作必须与「编辑」视觉对等。
function postDeleteButton(path, title, kind) {
  const del = el('button', 'btn btn-danger-quiet', '删除');
  // guard：串行化所有保存类操作。此前这些卡片按钮不受 S.busy 保护，
  // 连续删两张卡会带着同一个 expectedHeadSha 发出，第二张必撞 409。
  del.onclick = guard(async () => {
    const ok = await confirmDialog(`删除${kind}`, `确定删除「${title}」吗？文件会移入回收站，可恢复；正文引用的图片不会被删除。`, '删除');
    if (!ok) return;
    del.disabled = true;
    try {
      const r = await api('/api/content-delete', { method: 'POST', body: { path, title, expectedHeadSha: S.lastListSha } });
      S.lastListSha = r.headSha || S.lastListSha;
      toast('已移入回收站，可随时恢复');
      // 轻量刷新：列表只要清单与数据模块，草稿标题在文章 tab 按需补齐（Issue #2）
      markListStale();
      await reloadList({ summary: true });
    } catch (e) {
      del.disabled = false;
      handleOpError(e);
    }
  });
  return del;
}

// 文章转私密（卡片级按钮，2026-10-22 主人要求外置：不必开编辑器就能操作）。
// 与删除同形制但用强调色：不删内容，只改变「谁能看到」。
function postUnpublishButton(p) {
  const btn = el('button', 'btn btn-warn-quiet', '转私密');
  btn.onclick = guard(async () => {
    const ok = await confirmDialog('转为私密', `「${p.name}」将从线上消失：访客打不开、搜索引擎与站内搜索都找不到、首页不再显示。正文原样移入私密区保留，随时可以点「发布」放回去，日期和网址不变。注意：正文里已上传的图片，其网址仍可匿名访问。`, '转私密');
    if (!ok) return;
    btn.disabled = true;
    try {
      const r = await api('/api/content-save', { method: 'POST', body: { kind: 'post', action: 'unpublish', path: p.path, expectedHeadSha: S.lastListSha } });
      S.lastListSha = r.headSha || S.lastListSha;
      hooks.setDeployCommitted(r.commitSha);
      toast('已转为私密，部署完成后线上不可见');
      markListStale();
      await reloadList({ summary: true });
    } catch (e) {
      btn.disabled = false;
      handleOpError(e);
    }
  });
  return btn;
}

// 私密文章发布回线上（卡片级按钮，unpublish 的逆操作）：date 原样保留，permalink 不变
function privatePublishButton(p) {
  const btn = el('button', 'btn btn-warn-quiet', '发布');
  btn.onclick = guard(async () => {
    const ok = await confirmDialog('发布到线上', `将「${p.name}」从私密区发布到线上，日期和网址按原文保留。发布后访客立即可见。`, '发布');
    if (!ok) return;
    btn.disabled = true;
    try {
      const slug = p.name.replace(/\.md$/, '');
      const r = await api('/api/content-save', { method: 'POST', body: { kind: 'post', action: 'publish-private', slug, expectedHeadSha: S.lastListSha } });
      S.lastListSha = r.headSha || S.lastListSha;
      hooks.setDeployCommitted(r.commitSha);
      toast(`已发布 ${r.permalink}`);
      markListStale();
      await reloadList({ summary: true });
    } catch (e) {
      btn.disabled = false;
      handleOpError(e);
    }
  });
  return btn;
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
    action: { label: btnLabels[module], fn: () => hooks.openItemEditor(module, null) },
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
    edit.onclick = () => hooks.openItemEditor(module, i);
    acts.appendChild(edit);
    const del = el('button', 'btn btn-danger-quiet', '删除');
    del.onclick = guard(async () => {
      const ok = await confirmDialog('删除条目', `确定删除「${it.title || '未命名'}」吗？内容会移入回收站，可恢复。`, '删除');
      if (!ok) return;
      del.disabled = true;
      try {
        const r = await api('/api/content-delete', { method: 'POST', body: { module, index: i, title: it.title, expectedHeadSha: S.lastListSha } });
        S.lastListSha = r.headSha || S.lastListSha;
        toast('已移入回收站，可恢复');
        markListStale();
        await reloadList({ summary: true });
      } catch (e) {
        del.disabled = false;
        handleOpError(e);
      }
    });
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
  input.onchange = () => hooks.uploadImages(input.files, S.imageModule).finally(() => (input.value = ''));

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
    img.onclick = () => hooks.imageActions(p);
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
    res.onclick = guard(async () => {
      const ok = await confirmDialog('恢复内容', `恢复「${t.title || t.originalPath}」到原位置？已存在同名文件时会并排追加。`, '恢复');
      if (!ok) return;
      try {
        await api('/api/content-restore', { method: 'POST', body: { trashId: t.id, expectedHeadSha: S.lastListSha } });
        toast('已恢复并提交');
        markListStale();
        await reloadList({ summary: true });
      } catch (e) {
        handleOpError(e);
      }
    });
    acts.appendChild(res);
    c.appendChild(acts);
    list.appendChild(c);
  });
  box.appendChild(list);
}
