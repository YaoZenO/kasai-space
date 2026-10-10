'use strict';
// GET /api/auth-start —— 发起 GitHub OAuth 登录（身份认证，与仓库写权限无关）。
// state 随机数 + 短时 Cookie 双重提交，防 CSRF 与会话固定。
const crypto = require('node:crypto');
const config = require('./_lib/config');
const { requestBaseUrl, setCookie, respondError } = require('./_lib/http');

const STATE_COOKIE = config.mockMode ? 'kasai_oauth_dev' : '__Host-kasai_oauth';

module.exports = async (req, res) => {
  try {
    if (config.mockMode && config.requiredForRealMode().length && !config.GITHUB_CLIENT_ID) {
      // mock 模式：直接回调本地，模拟 GitHub 授权成功
      const state = crypto.randomBytes(24).toString('hex');
      const base = requestBaseUrl(req);
      setCookie(res, STATE_COOKIE, state, { maxAge: 600, proto: base.startsWith('https') ? 'https' : 'http' });
      res.statusCode = 302;
      res.setHeader('Location', `${base}/api/auth-callback?code=mock&state=${state}`);
      return res.end();
    }
    const missing = config.requiredForRealMode();
    if (missing.length) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end(`服务端未配置环境变量：${missing.join(', ')}`);
    }
    const state = crypto.randomBytes(24).toString('hex');
    const base = requestBaseUrl(req);
    setCookie(res, STATE_COOKIE, state, { maxAge: 600, proto: base.startsWith('https') ? 'https' : 'http' });
    const redirectUri = `${base}/api/auth-callback`;
    const url =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(config.GITHUB_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    res.statusCode = 302;
    res.setHeader('Location', url);
    return res.end();
  } catch (e) {
    return respondError(res, e);
  }
};
