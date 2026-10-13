'use strict';
// 回收站域：删除（soft）→ _trash/ 并更新 manifest；恢复（还原到原路径与文件名）。
// 不变量：所有变更都是单次原子提交，manifest 与内容同 commit 更新。

const crypto = require('node:crypto');
const store = require('../store');
const yaml = require('../yaml');
const registry = require('../modules');
const { HttpError } = require('../http');
const { assertModule, nowCst, POSTS_DIR, DRAFTS_DIR, IMG_DIR, DATA_DIR, TRASH_DIR, MANIFEST_PATH } = require('../shared');

function newTrashId() {
  return crypto.randomBytes(4).toString('hex');
}

async function loadManifest() {
  try {
    const f = await store.getFile(MANIFEST_PATH);
    return JSON.parse(f.content);
  } catch (e) {
    return { items: [] };
  }
}

// 删除文章/草稿/图片/数据条目 → 移入 _trash（同 commit 更新 manifest）
async function deleteItem(input) {
  const path = String(input.path || '');
  const id = newTrashId();
  const manifest = await loadManifest();
  const changes = [];
  let entry;
  if (path.startsWith(`${POSTS_DIR}/`) || path.startsWith(`${DRAFTS_DIR}/`) || path.startsWith(`${IMG_DIR}/`)) {
    const type = path.startsWith(`${POSTS_DIR}/`) ? 'post' : path.startsWith(`${DRAFTS_DIR}/`) ? 'draft' : 'image';
    const base = path.split('/').pop();
    const trashPath = `${TRASH_DIR}/${type}s/${id}-${base}`;
    const file = await store.getFile(path).catch(() => {
      throw new HttpError(404, 'NOT_FOUND');
    });
    // 图片为二进制：用 base64 移动，避免 UTF-8 转换损坏
    if (type === 'image') {
      changes.push({ path: trashPath, contentBase64: file.contentBase64 });
    } else {
      changes.push({ path: trashPath, contentUtf8: file.content });
    }
    changes.push({ path, delete: true });
    entry = { id, type, originalPath: path, title: input.title || base, trashPath, deletedAt: nowCst() };
  } else if (input.module) {
    const m = assertModule(input.module, await registry.load());
    const idx = Number(input.index);
    const p = `${DATA_DIR}/${m}.yml`;
    const file = await store.getFile(p).catch(() => {
      throw new HttpError(404, 'NOT_FOUND');
    });
    const items = yaml.parseItems(file.content);
    if (idx < 0 || idx >= items.length) throw new HttpError(400, 'BAD_INDEX');
    const removed = items.splice(idx, 1)[0];
    const trashPath = `${TRASH_DIR}/data/${m}-${id}.json`;
    changes.push({ path: trashPath, contentUtf8: JSON.stringify({ module: m, index: idx, item: removed, deletedAt: nowCst() }, null, 2) });
    changes.push({ path: p, contentUtf8: yaml.updateItems(file.content, items) });
    entry = { id, type: 'data', module: m, index: idx, title: removed.title || '', trashPath, deletedAt: nowCst() };
  } else {
    throw new HttpError(400, 'BAD_DELETE_TARGET');
  }
  manifest.items.unshift(entry);
  changes.push({ path: MANIFEST_PATH, contentUtf8: JSON.stringify(manifest, null, 2) });
  const r = await store.commitFiles(changes, `后台：删除「${entry.title || path}」（可恢复）`, input.expectedHeadSha);
  return { trashId: id, headSha: r.headSha, commitSha: r.commitSha };
}

async function restore(input) {
  const trashId = String(input.trashId || '');
  const manifest = await loadManifest();
  const idx = manifest.items.findIndex((e) => e.id === trashId);
  if (idx === -1) throw new HttpError(404, 'TRASH_NOT_FOUND');
  const entry = manifest.items[idx];
  const trashFile = await store.getFile(entry.trashPath);
  const snapshot = entry.type === 'data' ? JSON.parse(trashFile.content) : null;
  const changes = [];
  if (entry.type === 'data') {
    const m = assertModule(snapshot.module, await registry.load());
    const p = `${DATA_DIR}/${m}.yml`;
    const file = await store.getFile(p);
    const items = yaml.parseItems(file.content);
    const at = Math.min(Math.max(snapshot.index, 0), items.length);
    items.splice(at, 0, snapshot.item);
    changes.push({ path: p, contentUtf8: yaml.updateItems(file.content, items) });
  } else {
    // 图片为二进制：base64 原样写回，避免 UTF-8 转换损坏
    changes.push({ path: entry.originalPath, contentBase64: trashFile.contentBase64 });
  }
  changes.push({ path: entry.trashPath, delete: true });
  manifest.items.splice(idx, 1);
  changes.push({ path: MANIFEST_PATH, contentUtf8: JSON.stringify(manifest, null, 2) });
  const r = await store.commitFiles(changes, `后台：从回收站恢复「${entry.title}」`, input.expectedHeadSha);
  const restoredPath = entry.type === 'data' ? `${DATA_DIR}/${entry.module}.yml` : entry.originalPath;
  return { type: entry.type, originalPath: restoredPath, headSha: r.headSha, commitSha: r.commitSha };
}

module.exports = { newTrashId, loadManifest, deleteItem, restore };
