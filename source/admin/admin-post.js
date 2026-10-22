/* 文章编辑器：草稿 / 已发布文章的打开、保存、发布、删除与预览。
 * 正文为块编辑器（admin-composer.js）：图文混排、拖拽排序、拖放/粘贴上传，
 * 序列化回 Markdown 后保存，存储契约与 Hexo 渲染均不变。
 * 依赖 core / media / composer；入口在 init() 登记到 core.hooks。
 */
'use strict';

import { S, $, api, toast, confirmDialog, handleOpError, hooks, guard, reloadList, switchTab, markDirty, clearDirty } from './admin-core.js?v=20261023';
import { mountComposer, bindPaste } from './admin-composer.js?v=20261023';

let composer = null;

function slugifyClient(title) {
  const s = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  return s;
}

function setEditorBusy(busy) {
  ['post-title', 'post-slug', 'post-tags', 'post-categories', 'post-cover', 'post-featured', 'btn-save-draft', 'btn-publish', 'btn-unpublish', 'btn-delete-post', 'btn-toggle-preview'].forEach((id) => {
    const n = $(id);
    if (n) n.disabled = busy;
  });
  $('post-permalink').textContent = busy ? '正在加载文章…' : '';
}

// 点击「编辑」到内容就绪之间有一段网络往返；先切视图并给出禁用态，
// 避免这段时间界面毫无反馈，看起来像卡死（E-017）。
async function openPostEditor(path) {
  try {
    let mode, frontmatter, body, sha, name;
    $('view-list').hidden = true;
    $('view-data-editor').hidden = true;
    $('view-site-editor').hidden = true;
    $('view-post-editor').hidden = false;
    $('post-preview').hidden = true;
    $('btn-toggle-preview').textContent = '预览';
    setEditorBusy(true);
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
    $('post-title').value = frontmatter.title || '';
    $('post-slug').value = name;
    $('post-slug').disabled = mode === 'published';
    $('post-tags').value = (frontmatter.tags || []).join(',');
    $('post-categories').value = (frontmatter.categories || []).join(',');
    $('post-cover').value = frontmatter.cover || '';
    $('post-featured').checked = !!frontmatter.featured;
    composer.setValue(body);
    updateWordCount();
    const pl = $('post-permalink');
    if (mode === 'published') {
      pl.textContent = `永久链接锁定：/${(frontmatter.date || '').slice(0, 10).replace(/-/g, '/')}/${name}/`;
    } else if (mode === 'draft') {
      pl.textContent = '草稿（不会被构建发布）';
    } else {
      pl.textContent = '新文章';
    }
    if (mode === 'new') {
      $('btn-save-draft').textContent = '保存草稿';
      $('btn-publish').textContent = '直接发布';
      $('btn-save-draft').hidden = false;
      $('btn-unpublish').hidden = true;
      $('btn-delete-post').hidden = true;
    } else if (mode === 'draft') {
      $('btn-save-draft').textContent = '保存草稿';
      $('btn-publish').textContent = '发布草稿';
      $('btn-save-draft').hidden = false;
      $('btn-unpublish').hidden = true;
      $('btn-delete-post').hidden = false;
      $('btn-delete-post').textContent = '删除草稿';
    } else {
      $('btn-save-draft').hidden = true;
      $('btn-publish').textContent = '保存修改';
      $('btn-unpublish').hidden = false;
      $('btn-delete-post').hidden = false;
      $('btn-delete-post').textContent = '删除文章';
    }
    // 表单全部填充完毕再清 dirty：程序化赋值不触发 input，不会被误标未保存
    clearDirty();
  } catch (e) {
    handleOpError(e);
  } finally {
    setEditorBusy(false);
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
    body: composer.getValue(),
  };
}

let wcTimer = null;
function updateWordCount() {
  clearTimeout(wcTimer);
  wcTimer = setTimeout(() => {
    const t = composer.getValue();
    const cn = (t.match(/[\u4e00-\u9fff]/g) || []).length;
    const words = (t.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
    $('post-wordcount').textContent = cn + words ? `${cn + words} 字` : '';
  }, 250);
}

export async function saveCurrentEditing(opts) {
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
    hooks.setDeployCommitted(r.commitSha);
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
    hooks.setDeployCommitted(r.commitSha);
    toast('草稿已保存');
  }
  clearDirty();
}

export async function publishCurrentEditing() {
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
    hooks.setDeployCommitted(r.commitSha);
    toast(`已发布 ${r.permalink}`);
  } else {
    const r = await api('/api/content-save', {
      method: 'POST',
      body: { kind: 'post', action: 'publish-new', slug, title: e.title, tags: e.tags, categories: e.categories, body: e.body, cover: e.cover, featured: e.featured, expectedHeadSha: S.lastListSha },
    });
    S.lastListSha = r.headSha;
    hooks.setDeployCommitted(r.commitSha);
    toast(`已发布 ${r.permalink}`);
  }
  await reloadList();
  clearDirty();
  switchTab('posts');
}

// 转为私密（2026-10-22，P2-12）：已发布文章整文移入草稿箱，线上立即不可见；
// 内容不删除，后台草稿区随时可打开发回，日期与 permalink 锁定保留。
// 与删除的区别说清：删除进回收站（可恢复但不在前台管线里），私密进草稿箱
// （仍是正式内容，只差一个「发布」动作）。
async function unpublishCurrentPost() {
  const ed = S.editor;
  if (!ed || ed.mode !== 'published' || !ed.path) return;
  const title = $('post-title').value.trim() || ed.path.split('/').pop();
  const ok = await confirmDialog(
    '转为私密',
    `「${title}」将从线上消失：访客打不开、搜索引擎与站内搜索都找不到、首页不再显示。正文原样移入草稿箱保留，你随时可以点「发布」放回去，日期和网址不变。注意：正文里已上传的图片，其网址仍可匿名访问。`,
    '转为私密',
  );
  if (!ok) return;
  const btn = $('btn-unpublish');
  btn.disabled = true;
  try {
    const r = await api('/api/content-save', {
      method: 'POST',
      body: { kind: 'post', action: 'unpublish', path: ed.path, sha: ed.sha, expectedHeadSha: S.lastListSha },
    });
    S.lastListSha = r.headSha;
    hooks.setDeployCommitted(r.commitSha);
    toast(`「${title}」已转为私密，部署完成后线上不可见`);
    clearDirty();
    await reloadList();
    switchTab('posts');
  } catch (e) {
    btn.disabled = false;
    handleOpError(e);
  }
}

// 删除当前文章 / 草稿 → 移入回收站（可恢复）
// 2026-10-18：确认弹窗写清「去哪恢复」，成功 toast 也带上去回收站的路径提示，
// 并给按钮加忙态禁用（防连点产生第二次提交）。
async function deleteCurrentPost() {
  const ed = S.editor;
  if (!ed || !ed.path) return;
  const isDraft = ed.mode === 'draft';
  const title = $('post-title').value.trim() || ed.path.split('/').pop();
  const ok = await confirmDialog(
    isDraft ? '删除草稿' : '删除文章',
    `确定删除「${title}」吗？文件会移入回收站（底部「回收站」标签页可随时恢复）；正文里引用的图片不会被删除。`,
    '删除',
  );
  if (!ok) return;
  const btn = $('btn-delete-post');
  btn.disabled = true;
  try {
    const r = await api('/api/content-delete', {
      method: 'POST',
      body: { path: ed.path, title, expectedHeadSha: S.lastListSha },
    });
    S.lastListSha = r.headSha || S.lastListSha;
    hooks.setDeployCommitted(r.commitSha);
    toast(`「${title}」已移入回收站，底部「回收站」标签页可恢复`);
    clearDirty();
    await reloadList();
    switchTab('posts');
  } catch (e) {
    btn.disabled = false;
    handleOpError(e);
  }
}

// 简易 Markdown 预览（仅用于后台快速校对，不做完整渲染）
function renderMarkdown(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = esc(md);
  html = html.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`);
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$2</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>');
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.split(/\n{2,}/).map((b) => (/^<(h\d|pre|ul|ol|img|blockquote)/.test(b.trim()) ? b : `<p>${b.replace(/\n/g, '<br>')}</p>`)).join('\n');
  return html;
}

export function init() {
  // 文章编辑器非正文字段（标题 / slug / 标签 / 分类 / 封面）输入时标记未保存；
  // 正文块编辑器走 composer 的 onInput（2026-10-21，切 tab / 关页面丢稿拦截）。
  // S.editor 守卫见 E-046：没有打开编辑器时不得置脏。
  document.addEventListener('input', (e) => {
    if (S.editor && e.target.closest && e.target.closest('#view-post-editor')) markDirty();
  });

  composer = mountComposer($('post-composer'), {
    onInput: () => {
      // 状态守卫（E-046）：mountComposer 挂载与 setValue 都会走 rerender → emit
      // 触发本回调，彼时可能没有打开任何编辑器（开机挂载）——不判 S.editor
      // 会把「挂载」误判成「用户输入」，开机即置脏、弹未保存确认。
      if (S.editor) {
        S.editor.dirty = true;
        markDirty();
      }
      updateWordCount();
    },
  });
  bindPaste(composer);

  $('btn-save-draft').onclick = guard(async () => {
    await saveCurrentEditing();
    await reloadList();
  });
  $('btn-publish').onclick = guard(publishCurrentEditing);
  $('btn-unpublish').onclick = guard(unpublishCurrentPost);
  $('btn-delete-post').onclick = guard(deleteCurrentPost);

  // 预览
  $('btn-toggle-preview').onclick = () => {
    const pv = $('post-preview');
    const show = pv.hidden;
    if (show) pv.innerHTML = renderMarkdown(composer.getValue());
    pv.hidden = !show;
    $('post-composer').hidden = show;
    $('btn-toggle-preview').textContent = show ? '编辑' : '预览';
  };

  // 标题失焦时自动补 slug（已发布文章 slug 锁定，不补）
  $('post-title').addEventListener('blur', () => {
    const ed = S.editor;
    if (ed && ed.mode !== 'published' && !$('post-slug').value) {
      $('post-slug').value = slugifyClient($('post-title').value);
    }
  });

  // 登记给 core / list 使用的入口
  hooks.openPostEditor = openPostEditor;
  hooks.saveCurrentEditing = saveCurrentEditing;
  hooks.composerInsert = (sp) => composer.insertPath(sp);
}
