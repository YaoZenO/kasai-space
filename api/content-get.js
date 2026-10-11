'use strict';
// GET /api/content-get?path=source/_posts/x.md —— 读取单篇文章/草稿
const { requireSession } = require('./_lib/session');
const { json, respondError, originAllowed } = require('./_lib/http');
const content = require('./_lib/content');

module.exports = async (req, res) => {
  try {
    if (!originAllowed(req)) return json(res, 403, { error: 'BAD_ORIGIN', hint: '跨站请求被拒绝' });
    requireSession(req);
    const url = new URL(req.url, 'http://x');
    const path = url.searchParams.get('path') || '';
    const data = await content.getPostFile(path);
    return json(res, 200, data);
  } catch (e) {
    return respondError(res, e);
  }
};
