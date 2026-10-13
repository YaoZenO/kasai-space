'use strict';
// POST /api/content-delete —— 删除到回收站（同 commit 更新 manifest，可恢复）
const { route } = require('./_lib/router');
const content = require('./_lib/content');

module.exports = route(async ({ body }) =>
  Object.assign({ ok: true, status: 'committed' }, await content.deleteItem(body)),
{ methods: ['POST'] });
