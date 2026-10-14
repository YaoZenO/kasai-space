/* 文章编辑器：草稿 / 已发布文章的打开、保存、发布与预览。
 * 依赖 core 与 media；入口在 init() 登记到 core.hooks。
 */
'use strict';

import { S, $, el, api, toast, confirmDialog, handleOpError, hooks, guard, reloadList, switchTab } from './admin-core.js';
import { insertToBody } from './admin-media.js';

function slugifyClient(title) {
  const s = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  return s;
}

export async function openPostEditor(path) {
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
  switchTab('posts');
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
  $('post-body').addEventListener('input', updateWordCount);

  $('btn-save-draft').onclick = guard(async () => {
    await saveCurrentEditing();
    await reloadList();
  });
  $('btn-publish').onclick = guard(publishCurrentEditing);

  // 预览
  $('btn-toggle-preview').onclick = () => {
    const pv = $('post-preview');
    const show = pv.hidden;
    if (show) pv.innerHTML = renderMarkdown($('post-body').value);
    pv.hidden = !show;
    $('post-body').hidden = show;
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
}
