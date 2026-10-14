/* 数据条目编辑器：项目 / 游戏 / 收藏三种类型各自独立的表单。
 * 依赖 core 与 media；入口在 init() 登记到 core.hooks。
 */
'use strict';

import { S, $, el, api, toast, hooks, handleOpError, guard, reloadList, switchTab } from './admin-core.js';
import { uploadOneImage, sitePath, openImagePicker } from './admin-media.js';

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

export function openItemEditor(module, index) {
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

export function init() {
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
      hooks.setDeployCommitted(null);
      toast('已保存并提交');
      await reloadList();
      switchTab(ie.module);
    });
  });

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

  // 登记给 core / list 使用的入口
  hooks.openItemEditor = openItemEditor;
}
