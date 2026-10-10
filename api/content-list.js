'use strict';
// GET /api/content-list —— 文章、草稿、数据模块、图片、回收站全量列表
const { requireSession } = require('./_lib/session');
const { json, respondError, originAllowed } = require('./_lib/http');
const content = require('./_lib/content');

module.exports = async (req, res) => {
  try {
    if (!originAllowed(req)) return json(res, 403, { error: 'BAD_ORIGIN' });
    requireSession(req);
    const data = await content.listAll();
    return json(res, 200, data);
  } catch (e) {
    return respondError(res, e);
  }
};
