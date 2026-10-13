'use strict';
// GET /api/content-list —— 文章、草稿、数据模块、图片、回收站全量列表
const { route } = require('./_lib/router');
const content = require('./_lib/content');

module.exports = route(() => content.listAll(), { methods: ['GET'], body: false });
