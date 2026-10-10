'use strict';
// GitHub REST 客户端（真实模式）。零第三方依赖：fetch + node:crypto。
// 写入统一走 Git Data API（blob → tree → commit → update ref），支持原子多文件提交
// 与基于 ref 的冲突检测；令牌按需铸造、1 小时过期、仅存在于函数内存。

const crypto = require('node:crypto');
const config = require('./config');

const API = 'https://api.github.com';

// ---------- App 令牌 ----------

let cachedInstallationToken = null; // { token, expiresAt }

function appJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now - 30, exp: now + 8 * 60, iss: String(config.GITHUB_APP_ID) })).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  const sig = signer.sign(config.GITHUB_PRIVATE_KEY).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

async function installationToken() {
  if (cachedInstallationToken && cachedInstallationToken.expiresAt > Date.now() + 120 * 1000) {
    return cachedInstallationToken.token;
  }
  const res = await fetch(`${API}/app/installations/${config.GITHUB_INSTALLATION_ID}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${appJwt()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'kasai-admin' },
  });
  if (!res.ok) throw new Error(`INSTALLATION_TOKEN_FAILED ${res.status}`);
  const data = await res.json();
  cachedInstallationToken = { token: data.token, expiresAt: new Date(data.expires_at).getTime() };
  return cachedInstallationToken.token;
}

async function gh(method, path, body) {
  const token = await installationToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'kasai-admin',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 409 || res.status === 422) {
    const err = new Error(`GITHUB_CONFLICT ${res.status}`);
    err.conflict = true;
    err.body = await res.json().catch(() => ({}));
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`GITHUB_${res.status} ${path}`);
    err.status = res.status;
    err.body = await res.json().catch(() => ({}));
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- 读 ----------

async function getHead() {
  const ref = await gh('GET', `/repos/${config.REPO_FULL}/git/ref/heads/${config.BRANCH}`);
  return ref.object.sha;
}

async function getTree() {
  const tree = await gh('GET', `/repos/${config.REPO_FULL}/git/trees/${config.BRANCH}?recursive=1`);
  if (tree.truncated) throw new Error('TREE_TRUNCATED');
  return tree.tree.map((e) => ({ path: e.path, sha: e.sha, size: e.size, type: e.type }));
}

async function getFile(path) {
  const res = await gh('GET', `/repos/${config.REPO_FULL}/contents/${encodeURI(path)}?ref=${config.BRANCH}`);
  if (Array.isArray(res)) throw new Error('PATH_IS_DIR');
  return {
    content: Buffer.from(res.content || '', 'base64').toString('utf8'),
    contentBase64: res.content || '',
    sha: res.sha,
    encoding: 'utf8',
  };
}

// Git blob sha1（等价于 GitHub 的文件 sha），提交后本地计算返回，省一次请求
function gitBlobSha(contentUtf8) {
  const buf = Buffer.from(contentUtf8, 'utf8');
  const header = `blob ${buf.length}\0`;
  return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(header, 'utf8'), buf])).digest('hex');
}

function gitBlobShaB64(contentBase64) {
  const buf = Buffer.from(contentBase64, 'base64');
  const header = `blob ${buf.length}\0`;
  return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(header, 'utf8'), buf])).digest('hex');
}

// ---------- 写：原子多文件提交 ----------

// changes: [{ path, contentUtf8 } | { path, contentBase64 } | { path, delete: true }]
// expectedHeadSha: 乐观锁；不匹配视为冲突
async function commitFiles(changes, message, expectedHeadSha) {
  const headSha = await getHead();
  if (expectedHeadSha && headSha !== expectedHeadSha) {
    const err = new Error('HEAD_MOVED');
    err.conflict = true;
    err.currentHead = headSha;
    throw err;
  }
  const baseCommit = await gh('GET', `/repos/${config.REPO_FULL}/git/commits/${headSha}`);
  const treeEntries = [];
  const fileShas = {};
  for (const change of changes) {
    if (change.delete) {
      treeEntries.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
    } else {
      let b64;
      let sha;
      if (change.contentBase64 !== undefined) {
        b64 = change.contentBase64;
        sha = gitBlobShaB64(b64);
      } else {
        b64 = Buffer.from(change.contentUtf8, 'utf8').toString('base64');
        sha = gitBlobSha(change.contentUtf8);
      }
      const blob = await gh('POST', `/repos/${config.REPO_FULL}/git/blobs`, { content: b64, encoding: 'base64' });
      if (blob.sha !== sha) {
        // 本地计算与 GitHub 不一致（理论上不应发生），以 GitHub 为准
        sha = blob.sha;
      }
      treeEntries.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha });
      fileShas[change.path] = sha;
    }
  }
  const newTree = await gh('POST', `/repos/${config.REPO_FULL}/git/trees`, {
    base_tree: baseCommit.tree.sha,
    tree: treeEntries,
  });
  const newCommit = await gh('POST', `/repos/${config.REPO_FULL}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [headSha],
  });
  await gh('PATCH', `/repos/${config.REPO_FULL}/git/refs/heads/${config.BRANCH}`, { sha: newCommit.sha, force: false });
  return { commitSha: newCommit.sha, headSha: newCommit.sha, fileShas };
}

// ---------- OAuth（用户身份认证）----------

async function exchangeCode(code, redirectUri) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'kasai-admin' },
    body: JSON.stringify({
      client_id: config.GITHUB_CLIENT_ID,
      client_secret: config.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error('OAUTH_EXCHANGE_FAILED');
  const data = await res.json();
  if (data.error || !data.access_token) {
    const detail = data.error || 'no_access_token';
    const desc = data.error_description ? ` - ${data.error_description}` : '';
    throw new Error(`OAUTH_DENIED: ${detail}${desc}`);
  }
  return data.access_token;
}

async function getLogin(accessToken) {
  const res = await fetch(`${API}/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'kasai-admin' },
  });
  if (!res.ok) throw new Error('USER_INFO_FAILED');
  const u = await res.json();
  return u.login;
}

async function getCommitStatus(sha) {
  const data = await gh('GET', `/repos/${config.REPO_FULL}/commits/${sha}/status`);
  return data.state; // success | pending | failure | error
}

module.exports = { getHead, getTree, getFile, commitFiles, exchangeCode, getLogin, getCommitStatus, gitBlobSha };
