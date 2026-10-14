'use strict';
// GET /api/content-list —— 文章、草稿、数据模块、图片、回收站全量列表
// ?summary=1 —— 轻量模式：跳过草稿逐篇读取（草稿只回 path/name），
//              其余字段与全量模式完全一致。后台启动用它，避免首屏等草稿标题。
const { route } = require('./_lib/router');
const content = require('./_lib/content');

module.exports = route(({ req }) => {
  const url = new URL(req.url, 'http://x');
  return content.listAll({ summary: url.searchParams.get('summary') === '1' });
}, { methods: ['GET'], body: false });
