'use strict';
// POST /api/content-restore —— 从回收站恢复（原路径、原文件名，永久链接不变）
const { route } = require('./_lib/router');
const content = require('./_lib/content');

module.exports = route(async ({ body }) =>
  Object.assign({ ok: true, status: 'committed' }, await content.restore(body)),
{ methods: ['POST'] });
