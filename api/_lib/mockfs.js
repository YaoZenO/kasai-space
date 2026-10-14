'use strict';
// 本地 mock 存储：用文件系统目录模拟 GitHub 仓库与 ref 语义。
// 仅在 ADMIN_DEV_MOCK=1 且非 Vercel 生产环境时启用（config.mockMode 已把关）。
// 首次调用时从真实工作区种子（source/_posts、source/_data），fixture 目录由
// ADMIN_DEV_FIXTURE_DIR 指定，默认放在仓库之外的临时目录。

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');

function fixtureRoot() {
  if (!config.fixtureDir) throw new Error('ADMIN_DEV_FIXTURE_DIR not set');
  return config.fixtureDir;
}

function indexFile() {
  return path.join(fixtureRoot(), '.adminfs.json');
}

function loadIndex() {
  const f = indexFile();
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveIndex(idx) {
  fs.writeFileSync(indexFile(), JSON.stringify(idx, null, 2), 'utf8');
}

function shaOf(content) {
  return crypto.createHash('sha1').update(content, 'utf8').digest('hex');
}

function shaOfBuffer(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

// 从真实工作区播种（只复制内容目录，绝不写入真实仓库）
function seed() {
  const root = fixtureRoot();
  fs.mkdirSync(root, { recursive: true });
  if (loadIndex()) return;
  const repoRoot = path.resolve(__dirname, '..', '..');
  const dirs = [
    { from: path.join(repoRoot, 'source', '_posts'), to: 'source/_posts' },
    { from: path.join(repoRoot, 'source', '_data'), to: 'source/_data' },
  ];
  const files = {};
  for (const d of dirs) {
    if (!fs.existsSync(d.from)) continue;
    for (const name of fs.readdirSync(d.from)) {
      const src = path.join(d.from, name);
      if (!fs.statSync(src).isFile()) continue;
      const rel = `${d.to}/${name}`;
      fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
      fs.copyFileSync(src, path.join(root, rel));
      files[rel] = shaOf(fs.readFileSync(src, 'utf8'));
    }
  }
  // 图片目录留空；回收站 manifest 初始化
  fs.mkdirSync(path.join(root, 'source', 'img'), { recursive: true });
  fs.mkdirSync(path.join(root, '_trash'), { recursive: true });
  fs.writeFileSync(path.join(root, '_trash', 'manifest.json'), JSON.stringify({ items: [] }, null, 2), 'utf8');
  files['_trash/manifest.json'] = shaOf(JSON.stringify({ items: [] }, null, 2));
  saveIndex({ head: shaOf('seed'), files });
}

async function getHead() {
  seed();
  return loadIndex().head;
}

async function getTree() {
  seed();
  const idx = loadIndex();
  return Object.keys(idx.files).map((p) => {
    const full = path.join(fixtureRoot(), p);
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch (e) { /* deleted */ }
    return { path: p, sha: idx.files[p], size, type: 'blob' };
  });
}

async function getFile(p) {
  seed();
  const idx = loadIndex();
  const full = path.join(fixtureRoot(), p);
  if (!idx.files[p] || !fs.existsSync(full)) {
    const err = new Error('NOT_FOUND ' + p);
    err.status = 404;
    throw err;
  }
  const buf = fs.readFileSync(full);
  return { content: buf.toString('utf8'), contentBase64: buf.toString('base64'), sha: idx.files[p] };
}

// changes: [{ path, contentUtf8 } | { path, contentBase64 } | { path, delete: true }]
async function commitFiles(changes, message, expectedHeadSha) {
  seed();
  const idx = loadIndex();
  if (expectedHeadSha && idx.head !== expectedHeadSha) {
    const err = new Error('HEAD_MOVED');
    err.conflict = true;
    err.currentHead = idx.head;
    throw err;
  }
  const fileShas = {};
  for (const change of changes) {
    const full = path.join(fixtureRoot(), change.path);
    if (change.delete) {
      if (fs.existsSync(full)) fs.rmSync(full);
      delete idx.files[change.path];
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (change.contentBase64 !== undefined) {
        fs.writeFileSync(full, Buffer.from(change.contentBase64, 'base64'));
        idx.files[change.path] = shaOfBuffer(Buffer.from(change.contentBase64, 'base64'));
      } else {
        fs.writeFileSync(full, change.contentUtf8, 'utf8');
        idx.files[change.path] = shaOfBuffer(Buffer.from(change.contentUtf8, 'utf8'));
      }
      fileShas[change.path] = idx.files[change.path];
    }
  }
  idx.head = shaOf(idx.head + '|' + message + '|' + Date.now());
  saveIndex(idx);
  return { commitSha: idx.head, headSha: idx.head, fileShas };
}

// mock 的 OAuth 刻意保持与真实流程**同样的两段结构**：code → token → login。
// 不图省事让 exchangeCode 直接返回登录名——那种写法会让 getLogin 变成
// 「原样返回入参」的隐式契约，一旦有人把 mock token 改成真实格式（gho_xxx），
// 登录就会静默 403，而现有测试根本发现不了。
async function exchangeCode(code) {
  if (code === 'mock-other') return 'mock-token:visitor-not-admin';
  return `mock-token:${config.ADMIN_GITHUB_LOGIN}`;
}

async function getLogin(accessToken) {
  if (typeof accessToken !== 'string' || !accessToken.startsWith('mock-token:')) {
    // 与真实实现一致：token 无效时抛错，由端点转为 500，而不是返回一个假登录名
    throw new Error('USER_INFO_FAILED');
  }
  return accessToken.slice('mock-token:'.length);
}

// 返回值与真实 GitHub Commit Status 的 state 集合保持一致
// （success | pending | failure | error）。deploy-status 的备用通道在真实模式
// 才会走到，mock 下不调用，此处仅保证返回值本身合法。
async function getCommitStatus() {
  return 'pending';
}

// 单文件快路径，与真实实现保持同语义：内容未变化时不产生 commit。
// 注意：mock 的 sha 是 sha1(buffer)，与 git blob sha 算法不同，
// 但只在 mock 内部自洽使用（冲突比对、去重判断），不影响对外行为。
async function putFileContent(p, contentBase64, message, expectedHeadSha) {
  seed();
  const idx = loadIndex();
  if (expectedHeadSha && idx.head !== expectedHeadSha) {
    const err = new Error('HEAD_MOVED');
    err.conflict = true;
    err.currentHead = idx.head;
    throw err;
  }
  const wantSha = shaOfBuffer(Buffer.from(contentBase64, 'base64'));
  if (idx.files[p] === wantSha) {
    return { commitSha: null, headSha: idx.head, fileShas: { [p]: wantSha }, unchanged: true };
  }
  return commitFiles([{ path: p, contentBase64 }], message, expectedHeadSha);
}

module.exports = { getHead, getTree, getFile, commitFiles, putFileContent, exchangeCode, getLogin, getCommitStatus };
