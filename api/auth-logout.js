'use strict';
// GET|POST /api/auth-logout —— 清除会话
const session = require('./_lib/session');
const { respondError } = require('./_lib/http');

module.exports = async (req, res) => {
  try {
    const proto = (req.headers['x-forwarded-proto'] || 'http').startsWith('https') ? 'https' : 'http';
    session.clearSession(res, proto);
    res.statusCode = 302;
    res.setHeader('Location', '/admin/');
    return res.end();
  } catch (e) {
    return respondError(res, e);
  }
};
