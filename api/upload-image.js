'use strict';
// POST /api/upload-image —— 图片上传提交进仓库（Vercel 函数本体不落盘）
// {module:'posts'|'projects'|'games'|'collections', filename, dataBase64, expectedHeadSha}
// 图片经 base64 后体积膨胀约 33%，故请求体上限高于普通端点（8MB）。
const { route } = require('./_lib/router');
const content = require('./_lib/content');

module.exports = route(async ({ body }) =>
  Object.assign({ ok: true, status: 'committed' }, await content.uploadImage(body)),
{ methods: ['POST'], maxBytes: 8 * 1024 * 1024 });
