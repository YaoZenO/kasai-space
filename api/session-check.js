'use strict';
// GET /api/session-check —— 会话自检：401 未登录 / 403 非管理员 / 200 管理员
const config = require('./_lib/config');
const { requireSession } = require('./_lib/session');
const { json, respondError } = require('./_lib/http');

module.exports = async (req, res) => {
  try {
    const payload = requireSession(req);
    return json(res, 200, { ok: true, login: payload.sub, exp: payload.exp, mockMode: config.mockMode });
  } catch (e) {
    return respondError(res, e);
  }
};
