'use strict';
// 无状态会话：HMAC-SHA256 签名载荷。函数无外部存储依赖。
// 载荷 {sub, iat, exp, jti}；校验顺序：签名 → 过期 → 管理员身份。

const crypto = require('node:crypto');
const config = require('./config');
const { parseCookies, HttpError } = require('./http');

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const mac = b64url(crypto.createHmac('sha256', config.SESSION_SECRET).update(body).digest());
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', config.SESSION_SECRET).update(body).digest();
  const given = Buffer.from(mac.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!payload || payload.v !== 1) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// 每个受保护端点调用：未登录 401，非管理员 403
function requireSession(req) {
  if (!config.SESSION_SECRET) throw new HttpError(503, 'SERVER_NOT_CONFIGURED');
  const cookies = parseCookies(req);
  const payload = verify(cookies[config.SESSION_COOKIE_NAME]);
  if (!payload) throw new HttpError(401, 'UNAUTHENTICATED');
  if (payload.sub !== config.ADMIN_GITHUB_LOGIN) throw new HttpError(403, 'NOT_ADMIN');
  return payload;
}

function issueSession(res, login, proto) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { v: 1, sub: login, iat: now, exp: now + config.SESSION_TTL_SECONDS, jti: crypto.randomBytes(8).toString('hex') };
  const { setCookie } = require('./http');
  setCookie(res, config.SESSION_COOKIE_NAME, sign(payload), { maxAge: config.SESSION_TTL_SECONDS, proto });
  return payload;
}

function clearSession(res, proto) {
  const { setCookie } = require('./http');
  setCookie(res, config.SESSION_COOKIE_NAME, '', { maxAge: 0, proto });
}

module.exports = { sign, verify, requireSession, issueSession, clearSession };
