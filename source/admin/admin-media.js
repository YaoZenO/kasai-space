/* 图片域：压缩、上传、图库选择、图片操作。
 * 依赖 core；被 list / item / site 通过 core.hooks 调用的入口在 init() 登记。
 */
'use strict';

import { S, $, el, api, toast, confirmDialog, handleOpError, hooks, ApiError, reloadList, busyStart, busyEnd, markListStale } from './admin-core.js?v=20261101';
// 压缩上限：Vercel 函数请求体限 4.5MB，base64 会放大约 1.37 倍，
// 因此压缩产物必须控制在 2.5MB 以内，超限则逐级降低尺寸与质量重试。
const UPLOAD_BLOB_LIMIT = 2.5 * 1024 * 1024;

export function sitePath(p) {
  return String(p || '').replace(/^source/, '');
}

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
  const r = await api('/api/upload-image', {
    method: 'POST',
    body: { module, filename: (file.name || 'image').replace(/\.[^.]+$/, '') + '.' + ext, dataBase64: b64, expectedHeadSha: S.lastListSha },
  });
  // 每次成功上传都推进本地 headSha：否则连传第二张时 expectedHeadSha 还是旧 head，
  // 服务端判定 HEAD_MOVED 直接 409（E-016）。放在这里而不是各调用方，是因为
  // 上传入口不止一处（图片页批量上传、发布器插图）。
  if (r && r.headSha) S.lastListSha = r.headSha;
  return r;
}

export async function uploadImages(files, module) {
  if (!files || !files.length) return;
  if (files.length > 6) {
    toast('一次最多上传 6 张');
    return;
  }
  // 多图上传是数秒级长操作：忙态条覆盖整个循环（逐张 toast 之外的总进度反馈）
  busyStart();
  let done = 0;
  try {
    for (const file of files) {
      try {
        const r = await uploadOneImage(file, module);
        done += 1;
        // unchanged：仓库里已有同 sha 内容，服务端未产生 commit
        toast(r && r.unchanged ? `${file.name} 内容未变化，未产生新提交` : `已上传 ${file.name} → /img/${module}/`);
      } catch (e) {
        handleOpError(e);
      }
    }
    if (done) {
      // 轻量刷新：图片清单来自 tree，summary 模式已含（Issue #2）
      markListStale();
      await reloadList({ summary: true });
    }
  } finally {
    busyEnd();
  }
}

export function imageActions(repoPath) {
  const sp = sitePath(repoPath);
  const actions = [
    { label: '复制图片路径', fn: () => navigator.clipboard && navigator.clipboard.writeText(sp).then(() => toast('已复制 ' + sp)) },
    { label: '插入到文章', fn: () => { if (hooks.composerInsert) hooks.composerInsert(sp); else toast('请先打开文章编辑器'); } },
    { label: '设为当前条目封面', fn: () => { const f = $('item-cover'); if (f) { f.value = sp; toast('已设为封面路径：' + sp); } } },
    { label: '设为文章封面', fn: () => { const f = $('post-cover'); if (f) { f.value = sp; toast('已设为封面路径：' + sp); } } },
    {
      label: '删除此图片', danger: true,
      fn: async () => {
        const ok = await confirmDialog('删除图片', `删除 ${sp}？会移入回收站，可恢复。`, '删除');
        if (!ok) return;
        busyStart();
        try {
          await api('/api/content-delete', { method: 'POST', body: { path: repoPath, title: repoPath.split('/').pop(), expectedHeadSha: S.lastListSha } });
          toast('已删除并提交');
          markListStale();
          await reloadList({ summary: true });
        } catch (e) {
          handleOpError(e);
        } finally {
          busyEnd();
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

// 通用图库选择器：点击图片 → 回调(站点路径)
export function openImagePicker(onPick) {
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

export function init() {
  // 文章正文插图已并入块编辑器（admin-composer.js）的工具条，这里不再单独绑定。
  // 图库选择器的「插入到文章」走 hooks.composerInsert，编辑器未打开时给出提示。

  // 登记给 list 模块使用的入口
  hooks.uploadImages = uploadImages;
  hooks.imageActions = imageActions;
}

export { uploadOneImage };
