'use strict';
// GET /api/session-check —— 会话自检：401 未登录 / 403 非管理员 / 200 管理员
// 注意：本端点不做 Origin 校验（origin:false）。它是无副作用的只读自检，
// 改造前即如此，此处保持行为不变。
const config = require('./_lib/config');
const { route } = require('./_lib/router');

module.exports = route(({ session }) => ({
  ok: true,
  login: session.sub,
  exp: session.exp,
  mockMode: config.mockMode,
}), { methods: ['GET'], body: false, origin: false });
