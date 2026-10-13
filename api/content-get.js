'use strict';
// GET /api/content-get?path=source/_posts/x.md —— 读取单篇文章/草稿
const { route } = require('./_lib/router');
const content = require('./_lib/content');

module.exports = route(({ req }) => {
  const url = new URL(req.url, 'http://x');
  return content.getPostFile(url.searchParams.get('path') || '');
}, { methods: ['GET'], body: false });
