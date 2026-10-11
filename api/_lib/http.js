'use strict';
// HTTP 工具：请求体读取、Cookie 解析/签发、JSON 响应、Origin 校验。
// 刻意只依赖 Node 原生 req/res 语义，保证在 Vercel Functions 与本地 dev server 中行为一致。

function readBody(req, maxBytes) {
  const limit = maxBytes || 6 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, maxBytes) {
  const buf = await readBody(req, maxBytes);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    const err = new Error('INVALID_JSON');
    err.statusCode = 400;
    throw err;
  }
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function requestBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  return `${proto}://${host}`;
}

// Cookie 安全属性：生产环境使用 __Host- 前缀（强制 Secure + Path=/ + 无 Domain）
function buildSetCookie(name, value, opts) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (opts && opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts && opts.httpOnly !== false) parts.push('HttpOnly');
  const proto = (opts && opts.proto) || 'https';
  if (proto === 'https') parts.push('Secure');
  return parts.join('; ');
}

function setCookie(res, name, value, opts) {
  const prev = res.getHeader('Set-Cookie');
  const item = buildSetCookie(name, value, opts);
  res.setHeader('Set-Cookie', prev ? [].concat(prev, item) : item);
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

// 统一错误出口：HttpError → 指定状态码；conflict → 409；其余 → 500
function respondError(res, err) {
  if (err && err.conflictPayload) {
    return json(res, err.statusCode || 409, Object.assign({ error: err.code || 'CONFLICT', conflict: true }, err.conflictPayload));
  }
  if (err && err.statusCode) {
    const extra = err.extra || {};
    return json(res, err.statusCode, Object.assign({ error: err.code || 'ERROR', hint: extra.hint || defaultHint(err.code) }, extra));
  }
  if (err && err.conflict) {
    // HEAD_MOVED 等乐观锁冲突：必须带 conflict:true（前端冲突弹窗契约）
    return json(res, 409, { error: 'CONFLICT', conflict: true, currentHead: err.currentHead || '', hint: '服务器内容已被其他操作修改，请加载最新版本或强制覆盖' });
  }
  console.error('[api]', err);
  // 500 不向前端泄漏内部细节（message/stack 只进服务端日志）
  return json(res, 500, { error: 'INTERNAL', hint: '服务端内部错误，请稍后重试；若持续出现请查看部署日志' });
}

// 错误码 → 默认中文提示（调用方可用 hint 覆盖）
const HINTS = {
  BAD_SLUG: 'slug 仅允许小写字母、数字与中划线',
  BAD_MODULE: '内容板块不存在',
  BAD_PATH: '文件路径不合法',
  BAD_INDEX: '条目序号不存在',
  BAD_ACTION: '不支持的操作类型',
  BAD_KIND: '不支持的保存类型',
  BAD_DELETE_TARGET: '删除目标不合法',
  TITLE_REQUIRED: '标题不能为空',
  POST_EXISTS: '已存在同名校发布文章，请更换 slug',
  POST_NOT_FOUND: '文章不存在',
  DRAFT_NOT_FOUND: '草稿不存在',
  NOT_FOUND: '文件不存在',
  TRASH_NOT_FOUND: '回收站条目不存在',
  EMPTY_FILE: '文件内容为空',
  TOO_LARGE: '文件过大',
  BAD_EXT: '不支持的图片格式',
  METHOD_NOT_ALLOWED: '请求方法不被允许',
  BAD_ORIGIN: '跨站请求被拒绝',
  UNAUTHENTICATED: '登录已过期，请重新登录',
  NOT_ADMIN: '当前账号不是站点管理员',
  SERVER_NOT_CONFIGURED: '服务端尚未配置完成',
};
function defaultHint(code) {
  return HINTS[code] || '请求被拒绝';
}

// CSRF 纵深防御：浏览器跨站 POST 必带 Origin，与当前 host 不符则拒绝。
// 缺失 Origin（curl / 旧客户端）放行，由 SameSite=Lax Cookie 兜底。
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  try {
    return new URL(origin).host === host;
  } catch (e) {
    return false;
  }
}

class HttpError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.statusCode = status;
    this.code = code;
    this.extra = extra || {};
  }
}

module.exports = { readBody, readJson, parseCookies, requestBaseUrl, setCookie, json, respondError, originAllowed, HttpError, hintFor: defaultHint };
