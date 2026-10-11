'use strict';
// POST /api/content-delete —— 删除到回收站（同 commit 更新 manifest，可恢复）
const { requireSession } = require('./_lib/session');
const { json, readJson, respondError, originAllowed } = require('./_lib/http');
const content = require('./_lib/content');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED', hint: '仅支持 POST 请求' });
    if (!originAllowed(req)) return json(res, 403, { error: 'BAD_ORIGIN', hint: '跨站请求被拒绝' });
    requireSession(req);
    const body = await readJson(req);
    const r = await content.deleteItem(body);
    return json(res, 200, Object.assign({ ok: true, status: 'committed' }, r));
  } catch (e) {
    return respondError(res, e);
  }
};
