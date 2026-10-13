'use strict';
// 图片域：上传到指定模块目录，Vercel 函数本体不落盘。

const store = require('../store');
const config = require('../config');
const { HttpError } = require('../http');
const { stamp, IMG_DIR } = require('../shared');

async function uploadImage(input) {
  // 图片归属目录 ≠ 内容模块：这里多了 posts（文章配图）与 avatar（头像），
  // 语义不同，不并入 modules.yml；内容模块改动时记得同步这里与 source/admin/admin.js:286
  const m = String(input.module || 'posts');
  if (!['posts', 'projects', 'games', 'collections', 'avatar'].includes(m)) throw new HttpError(400, 'BAD_MODULE');
  const name = String(input.filename || 'image.jpg');
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (!config.IMAGE_EXT.includes(ext)) throw new HttpError(400, 'BAD_EXT');
  const buf = Buffer.from(input.dataBase64 || '', 'base64');
  if (!buf.length) throw new HttpError(400, 'EMPTY_FILE');
  if (buf.length > config.MAX_IMAGE_BYTES) throw new HttpError(413, 'TOO_LARGE', { hint: '图片过大（压缩后上限 4MB），请裁剪后再试' });
  const safe = name
    .slice(0, -(ext.length + 1))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'img';
  const p = `${IMG_DIR}/${m}/${stamp()}-${safe}.${ext}`;
  const r = await store.commitFiles([{ path: p, contentBase64: buf.toString('base64') }], `后台：上传图片 ${p}`, input.expectedHeadSha);
  return { path: p, commitSha: r.commitSha, headSha: r.headSha };
}

module.exports = { uploadImage };
