/* 块编辑器（composer）：文章正文的发布形态。
 * 把 Markdown 切成「文字块 + 图片块」交错排列，序列化回 Markdown——
 * 存储契约不变（Hexo 照旧渲染），交互升级为图文混排、拖拽排序、拖放/粘贴上传。
 *
 * 幂等约定（重要）：
 *  - 只把「独占一行且前后为空行」的图片提为图片块，行内图片留在文字块中原样保留；
 *  - 未被改动的图片块序列化时输出原始行 rawLine。
 *  因此「打开→原样保存」的正文与原文逐字一致，不产生伪 diff。
 */
'use strict';

import { el, toast, handleOpError, S } from './admin-core.js?v=20261024';
import { uploadOneImage, sitePath, openImagePicker } from './admin-media.js?v=20261024';
import { parseBlocks, serializeBlocks } from './admin-md-blocks.js?v=20261024';

const MAX_UPLOAD = 6;

// ---------- 编辑器 ----------

export function mountComposer(host, opts) {
  const onInput = (opts && opts.onInput) || (() => {});
  let blocks = [{ type: 'text', text: '', fresh: true }];
  let dragIndex = -1;

  function emit() { onInput(serializeBlocks(blocks)); }

  function rerender() {
    host.textContent = '';
    blocks.forEach((b, i) => host.appendChild(renderBlock(b, i)));
    host.appendChild(renderToolbar());
    emit();
  }

  // ---------- 块渲染 ----------

  function wrap(b, i) {
    const w = el('div', 'cps-block' + (b.type === 'image' ? ' cps-image' : ''));
    w.dataset.index = String(i);
    w.draggable = true;
    w.addEventListener('dragstart', (e) => {
      dragIndex = i;
      w.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
    });
    w.addEventListener('dragend', () => {
      dragIndex = -1;
      host.querySelectorAll('.cps-block').forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after'));
    });
    w.addEventListener('dragover', (e) => {
      if (dragIndex < 0 || dragIndex === i) return;
      e.preventDefault();
      const after = e.offsetY > w.clientHeight / 2;
      host.querySelectorAll('.cps-block').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      w.classList.add(after ? 'drop-after' : 'drop-before');
    });
    w.addEventListener('drop', (e) => {
      if (dragIndex < 0 || dragIndex === i) return;
      e.preventDefault();
      e.stopPropagation();
      const after = e.offsetY > w.clientHeight / 2;
      moveBlock(dragIndex, after ? i + 1 : i);
    });
    return w;
  }

  function moveBlock(from, to) {
    const [b] = blocks.splice(from, 1);
    blocks.splice(to > from ? to - 1 : to, 0, b);
    rerender();
  }

  function blockActions(b, i) {
    const bar = el('div', 'cps-ops');
    const mk = (label, title, fn, danger) => {
      const btn = el('button', 'cps-op' + (danger ? ' danger' : ''), label);
      btn.type = 'button';
      btn.title = title;
      btn.onclick = (ev) => { ev.stopPropagation(); fn(); };
      return btn;
    };
    bar.appendChild(mk('↑', '上移', () => moveBlock(i, i - 1)));
    bar.appendChild(mk('↓', '下移', () => moveBlock(i, i + 2)));
    if (b.type === 'image') {
      bar.appendChild(mk('🖼', '更换此图', () => pickImageAt(i)));
      bar.appendChild(mk('×', '移除此图（不动仓库文件）', () => { blocks.splice(i, 1); rerender(); }, true));
    } else {
      bar.appendChild(mk('🖼', '在此处插入图片', () => pickImageAt(i + 1)));
      bar.appendChild(mk('×', '删除此块', () => { blocks.splice(i, 1); rerender(); }, true));
    }
    return bar;
  }

  function renderTextBlock(b, i) {
    const w = wrap(b, i);
    w.appendChild(blockActions(b, i));
    const ta = el('textarea', 'cps-text');
    ta.value = b.text;
    ta.placeholder = '写点什么…（支持 Markdown）';
    ta.rows = 1;
    ta.spellcheck = false;
    const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
    ta.addEventListener('input', () => {
      b.text = ta.value;
      b.fresh = false;
      fit();
      emit();
    });
    w.appendChild(ta);
    requestAnimationFrame(fit);
    return w;
  }

  function renderImageBlock(b, i) {
    const w = wrap(b, i);
    w.appendChild(blockActions(b, i));
    if (b.pending) {
      w.appendChild(el('div', 'cps-pending', `上传中 ${b.name || ''}…`));
      return w;
    }
    const img = el('img', 'cps-thumb');
    img.src = sitePath(b.path);
    img.alt = b.alt || '';
    img.loading = 'lazy';
    img.onerror = () => { img.replaceWith(el('div', 'cps-pending', '图片加载失败：' + sitePath(b.path))); };
    w.appendChild(img);
    const alt = el('input', 'cps-alt');
    alt.type = 'text';
    alt.value = b.alt || '';
    alt.placeholder = '图片说明（alt，可空）';
    alt.addEventListener('input', () => { b.alt = alt.value; b.touched = true; emit(); });
    w.appendChild(alt);
    w.appendChild(el('div', 'cps-path', sitePath(b.path)));
    return w;
  }

  function renderBlock(b, i) {
    return b.type === 'image' ? renderImageBlock(b, i) : renderTextBlock(b, i);
  }

  // ---------- 工具条 ----------

  function renderToolbar() {
    const bar = el('div', 'cps-toolbar');
    const mk = (label, title, fn, primary) => {
      const btn = el('button', 'cps-add' + (primary ? ' primary' : ''), label);
      btn.type = 'button';
      btn.title = title;
      btn.onclick = fn;
      return btn;
    };
    bar.appendChild(mk('＋ 文字', '添加文字块', () => {
      blocks.push({ type: 'text', text: '', fresh: true });
      rerender();
      const tas = host.querySelectorAll('.cps-text');
      if (tas.length) tas[tas.length - 1].focus();
    }));
    bar.appendChild(mk('＋ 图片', '上传图片并插入', () => uploadFromDialog(blocks.length), true));
    bar.appendChild(mk('从图库选', '从已有图片中选择', () => pickImageAt(blocks.length)));
    const hint = el('span', 'cps-hint', '也可把图片拖进来 / 粘贴');
    bar.appendChild(hint);
    return bar;
  }

  // ---------- 图片插入 ----------

  function pickImageAt(at) {
    openImagePicker((sp) => {
      blocks.splice(at, 0, { type: 'image', path: sp.replace(/^\//, 'source'), alt: '' });
      rerender();
    });
  }

  function uploadFromDialog(at) {
    const input = el('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    input.onchange = () => {
      uploadFiles(input.files, at);
      input.remove();
    };
    host.appendChild(input);
    input.click();
  }

  // 上传串行执行：每张成功后 headSha 已在 uploadOneImage 内推进（E-016）
  async function uploadFiles(files, at) {
    const list = Array.from(files || []).filter((f) => /^image\//.test(f.type)).slice(0, MAX_UPLOAD);
    if (!list.length) { toast('没有可上传的图片文件'); return; }
    if (files.length > MAX_UPLOAD) toast(`一次最多插入 ${MAX_UPLOAD} 张，已截取前 ${MAX_UPLOAD} 张`);
    let idx = at;
    for (const f of list) {
      const pending = { type: 'image', path: '', alt: '', pending: true, name: f.name };
      blocks.splice(idx, 0, pending);
      idx += 1;
      rerender();
      try {
        const r = await uploadOneImage(f, S.imageModule || 'posts');
        pending.path = r.path;
        pending.pending = false;
        pending.name = '';
        pending.alt = f.name.replace(/\.[^.]+$/, '');
        pending.touched = true;
        toast(r && r.unchanged ? `${f.name} 内容未变化，未产生新提交` : `已插入 ${f.name}`);
      } catch (e) {
        blocks.splice(blocks.indexOf(pending), 1);
        handleOpError(e);
      }
      rerender();
    }
  }

  // ---------- 拖放 / 粘贴到编辑器 ----------

  host.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    host.classList.add('cps-dragover');
  });
  host.addEventListener('dragleave', () => host.classList.remove('cps-dragover'));
  host.addEventListener('drop', (e) => {
    host.classList.remove('cps-dragover');
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    uploadFiles(e.dataTransfer.files, blocks.length);
  });

  // ---------- 对外 ----------

  rerender();

  return {
    setValue(md) {
      blocks = parseBlocks(md);
      rerender();
    },
    getValue() { return serializeBlocks(blocks); },
    insertFiles(files, at) { return uploadFiles(files, at == null ? blocks.length : at); },
    // 插入一张仓库里已有的图片（站点路径 /img/...），供图库选择器复用
    insertPath(sitePathStr) {
      const p = String(sitePathStr || '').replace(/^\//, 'source');
      blocks.push({ type: 'image', path: p, alt: '', touched: true });
      rerender();
    },
  };
}

// 粘贴图片：仅在文章编辑器可见时接管，避免影响其他输入框
export function bindPaste(composer) {
  document.addEventListener('paste', (e) => {
    const view = document.getElementById('view-post-editor');
    if (!view || view.hidden) return;
    const items = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (!items.length) return;
    e.preventDefault();
    composer.insertFiles(items);
  });
}
