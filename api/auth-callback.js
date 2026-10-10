'use strict';
// GET /api/auth-callback —— OAuth 回调：
// 1) 校验 state（与 Cookie 双重提交比对，一次性）；
// 2) code 换用户令牌，仅用于读取登录名，用后即弃；
// 3) 仅允许 ADMIN_GITHUB_LOGIN；
// 4) 签发 HMAC 会话 Cookie。
const config = require('./_lib/config');
const store = require('./_lib/store');
const session = require('./_lib/session');
const { requestBaseUrl, parseCookies, setCookie, respondError } = require('./_lib/http');

const STATE_COOKIE = config.mockMode ? 'kasai_oauth_dev' : '__Host-kasai_oauth';

function html(res, status, title, msg) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;max-width:32rem;margin:15vh auto;padding:0 1rem;text-align:center"><h1>${title}</h1><p>${msg}</p><p><a href="/admin/">返回管理后台</a></p></body>`);
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const stateQ = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code') || '';
    const cookies = parseCookies(req);
    const stateCookie = cookies[STATE_COOKIE] || '';
    // 一次性消费 state cookie
    setCookie(res, STATE_COOKIE, '', { maxAge: 0, proto: (req.headers['x-forwarded-proto'] || 'http').startsWith('https') ? 'https' : 'http' });
    if (!stateQ || !stateCookie || stateQ !== stateCookie) {
      return html(res, 400, '登录失败', 'state 校验未通过，请返回重试（可能已超时）。');
    }
    const base = requestBaseUrl(req);
    const token = await store.exchangeCode(code, `${base}/api/auth-callback`);
    const login = await store.getLogin(token);
    // 用户令牌（token）到此处即丢弃，不存储、不下发
    if (login !== config.ADMIN_GITHUB_LOGIN) {
      return html(res, 403, '无权访问', `当前账号 ${login} 不是本站管理员。`);
    }
    session.issueSession(res, login, base.startsWith('https') ? 'https' : 'http');
    res.statusCode = 302;
    res.setHeader('Location', '/admin/');
    return res.end();
  } catch (e) {
    return html(res, 500, '登录失败', String((e && e.message) || e));
  }
};
