'use strict';
// 内容域逻辑：列表、文章/草稿、数据模块、图片、回收站。
// 不变量：
//  - 已发布文章的文件名与 date 字段永不因编辑而改变（永久链接稳定）
//  - 草稿位于仓库根 _drafts/（source/ 之外），回收站位于 _trash/（source/ 之外），均不进入 Hexo 构建
//  - 所有变更都是单次原子提交；manifest 与内容同 commit 更新

const crypto = require('node:crypto');
const config = require('./config');
const store = require('./store');
const yaml = require('./yaml');
const posts = require('./posts');
const { HttpError } = require('./http');

const POSTS_DIR = 'source/_posts';
const DRAFTS_DIR = '_drafts';
const TRASH_DIR = '_trash';
const IMG_DIR = 'source/img';
const DATA_DIR = 'source/_data';
const MODULES = ['projects', 'games', 'collections'];
const SITE_PATH = `${DATA_DIR}/site.yml`;
const MANIFEST_PATH = `${TRASH_DIR}/manifest.json`;

// ---------- 时间 ----------

// 固定 +08:00 时区，避免 Vercel 构建机 UTC 时区导致日期偏移
function nowCst() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+08:00`;
}

function stamp() {
  return nowCst().replace(/[-:T+]/g, '').slice(0, 12);
}

// ---------- 基础校验 ----------

function assertSlug(slug) {
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new HttpError(400, 'BAD_SLUG', { hint: 'slug 仅允许小写字母、数字与中划线' });
  }
  return slug;
}

function assertModule(m) {
  if (!MODULES.includes(m)) throw new HttpError(400, 'BAD_MODULE');
  return m;
}

function slugify(title) {
  const s = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || `post-${stamp()}`;
}

function normTags(v) {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  return String(v || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
}

// ---------- 列表 ----------

async function listAll() {
  const tree = await store.getTree();
  const paths = tree.filter((e) => e.type === 'blob').map((e) => e.path);
  const posts_ = [];
  const drafts = [];
  const images = [];
  for (const p of paths) {
    if (p.startsWith(`${POSTS_DIR}/`) && p.endsWith('.md')) posts_.push({ path: p, name: p.slice(POSTS_DIR.length + 1) });
    else if (p.startsWith(`${DRAFTS_DIR}/`) && p.endsWith('.md')) drafts.push({ path: p, name: p.slice(DRAFTS_DIR.length + 1) });
    else if (p.startsWith(`${IMG_DIR}/`) && /\.(jpe?g|png|webp|gif)$/i.test(p)) images.push(p);
  }
  const data = {};
  for (const m of MODULES) {
    const p = `${DATA_DIR}/${m}.yml`;
    const entry = paths.includes(p);
    data[m] = entry ? yaml.parseItems((await store.getFile(p)).content) : [];
  }
  // 站点身份配置（site.yml 不存在时返回空配置）
  const site = paths.includes(SITE_PATH)
    ? yaml.parseSite((await store.getFile(SITE_PATH)).content)
    : { intro: '', motto: '', avatar: '', identity_words: [] };
  let trash = [];
  if (paths.includes(MANIFEST_PATH)) {
    try {
      trash = JSON.parse((await store.getFile(MANIFEST_PATH)).content).items || [];
    } catch (e) {
      trash = [];
    }
  }
  // 草稿标题
  const draftsFull = await Promise.all(
    drafts.map(async (d) => {
      const f = await store.getFile(d.path);
      return Object.assign({}, d, { title: posts.extractTitle(f.content, d.name), sha: f.sha });
    })
  );
  return { posts: posts_, drafts: draftsFull, data, site, images: images.sort(), trash, headSha: await store.getHead(), mockMode: store.mockMode };
}

// ---------- 单文件读取 ----------

async function getPostFile(path) {
  const inPosts = path.startsWith(`${POSTS_DIR}/`);
  const inDrafts = path.startsWith(`${DRAFTS_DIR}/`);
  if (!inPosts && !inDrafts) throw new HttpError(400, 'BAD_PATH');
  const f = await store.getFile(path);
  const parsed = posts.parseFrontMatter(f.content);
  return {
    path,
    isDraft: inDrafts,
    frontmatter: {
      title: parsed.fm.title || '',
      date: parsed.fm.date || '',
      tags: normTags(parsed.fm.tags),
      categories: normTags(parsed.fm.categories),
      featured: !!parsed.fm.featured,
      cover: parsed.fm.cover || '',
    },
    body: parsed.body || '',
    sha: f.sha,
    headSha: await store.getHead(),
  };
}

// ---------- 草稿与发布 ----------

function buildPostText(title, tags, categories, body, date, extra) {
  const fm = { title, tags: normTags(tags), categories: normTags(categories) };
  if (date) fm.date = date;
  const ex = extra || {};
  if (ex.featured !== undefined && ex.featured !== null) fm.featured = !!ex.featured;
  if (ex.cover) fm.cover = String(ex.cover).trim();
  return posts.serializeFrontMatter(fm, []) + (body || '').replace(/^\r?\n/, '');
}

async function saveDraft(input) {
  const slug = assertSlug(input.slug);
  const text = buildPostText(input.title || 'Untitled', input.tags, input.categories, input.body, null, input);
  const changes = [];
  let headExpected = input.expectedHeadSha;
  if (input.prevSlug && input.prevSlug !== slug) {
    assertSlug(input.prevSlug);
    changes.push({ path: `${DRAFTS_DIR}/${input.prevSlug}.md`, delete: true });
  }
  if (input.sha) {
    const cur = await store.getFile(`${DRAFTS_DIR}/${slug}.md`).catch(() => null);
    if (cur && cur.sha !== input.sha) {
      const e = new HttpError(409, 'CONFLICT');
      e.conflictPayload = { current: { slug, content: cur.content, sha: cur.sha } };
      throw e;
    }
  }
  changes.push({ path: `${DRAFTS_DIR}/${slug}.md`, contentUtf8: text });
  const r = await store.commitFiles(changes, `后台：保存草稿 ${slug}`, headExpected);
  return { path: `${DRAFTS_DIR}/${slug}.md`, slug, sha: r.fileShas[`${DRAFTS_DIR}/${slug}.md`], headSha: r.headSha, commitSha: r.commitSha };
}

// 从草稿发布：date 缺失则注入当前时间；草稿与正式文同 commit 一增一删
async function publishDraft(input) {
  const slug = assertSlug(input.slug);
  const draftPath = `${DRAFTS_DIR}/${slug}.md`;
  const draft = await store.getFile(draftPath).catch(() => {
    throw new HttpError(404, 'DRAFT_NOT_FOUND');
  });
  const parsed = posts.parseFrontMatter(draft.content);
  const date = parsed.fm.date || nowCst();
  const postText = buildPostText(parsed.fm.title || input.title || 'Untitled', parsed.fm.tags, parsed.fm.categories, parsed.body, date, parsed.fm);
  const r = await store.commitFiles(
    [
      { path: `${POSTS_DIR}/${slug}.md`, contentUtf8: postText },
      { path: draftPath, delete: true },
    ],
    `后台：发布文章 ${slug}`,
    input.expectedHeadSha
  );
  return { path: `${POSTS_DIR}/${slug}.md`, permalink: permalinkFor(slug, date), date, headSha: r.headSha, commitSha: r.commitSha };
}

// 直接发布（不经过草稿）
async function publishNew(input) {
  const slug = assertSlug(input.slug);
  const postPath = `${POSTS_DIR}/${slug}.md`;
  const existing = await store.getFile(postPath).catch(() => null);
  if (existing) throw new HttpError(409, 'POST_EXISTS', { path: postPath });
  const date = nowCst();
  const text = buildPostText(input.title || 'Untitled', input.tags, input.categories, input.body, date, input);
  const r = await store.commitFiles([{ path: postPath, contentUtf8: text }], `后台：发布文章 ${slug}`, input.expectedHeadSha);
  return { path: postPath, permalink: permalinkFor(slug, date), date, headSha: r.headSha, commitSha: r.commitSha };
}

function permalinkFor(slug, date) {
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return `/${slug}/`;
  return `/${m[1]}/${m[2]}/${m[3]}/${slug}/`;
}

// 编辑已发布文章：文件名与 date 锁定（patch 中删除 date），标题可改但文件名不变
async function updatePost(input) {
  const path = String(input.path || '');
  if (!path.startsWith(`${POSTS_DIR}/`) || !path.endsWith('.md')) throw new HttpError(400, 'BAD_PATH');
  const cur = await store.getFile(path).catch(() => {
    throw new HttpError(404, 'POST_NOT_FOUND');
  });
  if (input.sha && cur.sha !== input.sha) {
    const e = new HttpError(409, 'CONFLICT');
    e.conflictPayload = { current: normalizePostFile(cur.content), sha: cur.sha };
    throw e;
  }
  const parsed = posts.parseFrontMatter(cur.content);
  const fm = {
    title: input.title !== undefined ? input.title : parsed.fm.title,
    tags: input.tags !== undefined ? normTags(input.tags) : normTags(parsed.fm.tags),
    categories: input.categories !== undefined ? normTags(input.categories) : normTags(parsed.fm.categories),
  };
  // featured / cover：显式传入则替换，否则沿用原值
  fm.featured = input.featured !== undefined ? !!input.featured : parsed.fm.featured;
  fm.cover = input.cover !== undefined ? String(input.cover || '').trim() : parsed.fm.cover;
  // date 与文件名锁死：显式沿用原值
  fm.date = parsed.fm.date || nowCst();
  const text = posts.serializeFrontMatter(fm, parsed.unknownLines) + (input.body !== undefined ? input.body : parsed.body || '');
  const r = await store.commitFiles([{ path, contentUtf8: text }], `后台：更新文章 ${path.slice(POSTS_DIR.length + 1, -3)}`, input.expectedHeadSha);
  return { path, sha: r.fileShas[path], headSha: r.headSha, commitSha: r.commitSha };
}

function normalizePostFile(content) {
  const parsed = posts.parseFrontMatter(content);
  return {
    frontmatter: { title: parsed.fm.title || '', date: parsed.fm.date || '', tags: normTags(parsed.fm.tags), categories: normTags(parsed.fm.categories) },
    body: parsed.body || '',
  };
}

// ---------- 数据模块 ----------

async function saveData(input) {
  const m = assertModule(input.module);
  const item = {};
  for (const k of ['title', 'link', 'desc', 'cover', 'date']) {
    if (input.item && input.item[k] !== undefined && input.item[k] !== null) item[k] = String(input.item[k]).trim();
  }
  if (!item.title) throw new HttpError(400, 'TITLE_REQUIRED');
  const p = `${DATA_DIR}/${m}.yml`;
  const file = (await store.getFile(p).catch(() => null)) || { content: 'items: []\n', sha: null };
  const items = yaml.parseItems(file.content);
  const idx = input.index === null || input.index === undefined ? -1 : Number(input.index);
  if (idx === -1) items.push(item);
  else {
    if (idx < 0 || idx >= items.length) throw new HttpError(400, 'BAD_INDEX');
    items[idx] = item;
  }
  const text = yaml.updateItems(file.content, items);
  const r = await store.commitFiles([{ path: p, contentUtf8: text }], `后台：${idx === -1 ? '新增' : '更新'}${m}条目「${item.title}」`, input.expectedHeadSha);
  return { path: p, items: items.length, headSha: r.headSha, commitSha: r.commitSha };
}

// ---------- 站点身份配置 ----------

async function saveSite(input) {
  const cfg = {
    intro: String(input.intro == null ? '' : input.intro).trim(),
    motto: String(input.motto == null ? '' : input.motto).trim(),
    avatar: String(input.avatar == null ? '' : input.avatar).trim(),
    identity_words: Array.isArray(input.identity_words)
      ? input.identity_words.map((s) => String(s).trim()).filter(Boolean)
      : String(input.identity_words || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
  };
  const file = (await store.getFile(SITE_PATH).catch(() => null)) || { content: '', sha: null };
  const text = yaml.updateSite(file.content, cfg);
  const r = await store.commitFiles([{ path: SITE_PATH, contentUtf8: text }], '后台：更新站点身份配置', input.expectedHeadSha);
  return { path: SITE_PATH, site: cfg, headSha: r.headSha, commitSha: r.commitSha };
}

// ---------- 回收站 ----------

function newTrashId() {
  return crypto.randomBytes(4).toString('hex');
}

async function loadManifest() {
  try {
    const f = await store.getFile(MANIFEST_PATH);
    return JSON.parse(f.content);
  } catch (e) {
    return { items: [] };
  }
}

// 删除文章/草稿/图片/数据条目 → 移入 _trash（同 commit 更新 manifest）
async function deleteItem(input) {
  const path = String(input.path || '');
  const id = newTrashId();
  const manifest = await loadManifest();
  const changes = [];
  let entry;
  if (path.startsWith(`${POSTS_DIR}/`) || path.startsWith(`${DRAFTS_DIR}/`) || path.startsWith(`${IMG_DIR}/`)) {
    const type = path.startsWith(`${POSTS_DIR}/`) ? 'post' : path.startsWith(`${DRAFTS_DIR}/`) ? 'draft' : 'image';
    const base = path.split('/').pop();
    const trashPath = `${TRASH_DIR}/${type}s/${id}-${base}`;
    const file = await store.getFile(path).catch(() => {
      throw new HttpError(404, 'NOT_FOUND');
    });
    // 图片为二进制：用 base64 移动，避免 UTF-8 转换损坏
    if (type === 'image') {
      changes.push({ path: trashPath, contentBase64: file.contentBase64 });
    } else {
      changes.push({ path: trashPath, contentUtf8: file.content });
    }
    changes.push({ path, delete: true });
    entry = { id, type, originalPath: path, title: input.title || base, trashPath, deletedAt: nowCst() };
  } else if (input.module) {
    const m = assertModule(input.module);
    const idx = Number(input.index);
    const p = `${DATA_DIR}/${m}.yml`;
    const file = await store.getFile(p).catch(() => {
      throw new HttpError(404, 'NOT_FOUND');
    });
    const items = yaml.parseItems(file.content);
    if (idx < 0 || idx >= items.length) throw new HttpError(400, 'BAD_INDEX');
    const removed = items.splice(idx, 1)[0];
    const trashPath = `${TRASH_DIR}/data/${m}-${id}.json`;
    changes.push({ path: trashPath, contentUtf8: JSON.stringify({ module: m, index: idx, item: removed, deletedAt: nowCst() }, null, 2) });
    changes.push({ path: p, contentUtf8: yaml.updateItems(file.content, items) });
    entry = { id, type: 'data', module: m, index: idx, title: removed.title || '', trashPath, deletedAt: nowCst() };
  } else {
    throw new HttpError(400, 'BAD_DELETE_TARGET');
  }
  manifest.items.unshift(entry);
  changes.push({ path: MANIFEST_PATH, contentUtf8: JSON.stringify(manifest, null, 2) });
  const r = await store.commitFiles(changes, `后台：删除「${entry.title || path}」（可恢复）`, input.expectedHeadSha);
  return { trashId: id, headSha: r.headSha, commitSha: r.commitSha };
}

async function restore(input) {
  const trashId = String(input.trashId || '');
  const manifest = await loadManifest();
  const idx = manifest.items.findIndex((e) => e.id === trashId);
  if (idx === -1) throw new HttpError(404, 'TRASH_NOT_FOUND');
  const entry = manifest.items[idx];
  const trashFile = await store.getFile(entry.trashPath);
  const snapshot = entry.type === 'data' ? JSON.parse(trashFile.content) : null;
  const changes = [];
  if (entry.type === 'data') {
    const m = assertModule(snapshot.module);
    const p = `${DATA_DIR}/${m}.yml`;
    const file = await store.getFile(p);
    const items = yaml.parseItems(file.content);
    const at = Math.min(Math.max(snapshot.index, 0), items.length);
    items.splice(at, 0, snapshot.item);
    changes.push({ path: p, contentUtf8: yaml.updateItems(file.content, items) });
  } else {
    // 图片为二进制：base64 原样写回，避免 UTF-8 转换损坏
    changes.push({ path: entry.originalPath, contentBase64: trashFile.contentBase64 });
  }
  changes.push({ path: entry.trashPath, delete: true });
  manifest.items.splice(idx, 1);
  changes.push({ path: MANIFEST_PATH, contentUtf8: JSON.stringify(manifest, null, 2) });
  const r = await store.commitFiles(changes, `后台：从回收站恢复「${entry.title}」`, input.expectedHeadSha);
  const restoredPath = entry.type === 'data' ? `${DATA_DIR}/${entry.module}.yml` : entry.originalPath;
  return { type: entry.type, originalPath: restoredPath, headSha: r.headSha, commitSha: r.commitSha };
}

// ---------- 图片 ----------

async function uploadImage(input) {
  const m = String(input.module || 'posts');
  if (!['posts', 'projects', 'games', 'collections', 'avatar'].includes(m)) throw new HttpError(400, 'BAD_MODULE');
  const name = String(input.filename || 'image.jpg');
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (!config.IMAGE_EXT.includes(ext)) throw new HttpError(400, 'BAD_EXT');
  const buf = Buffer.from(input.dataBase64 || '', 'base64');
  if (!buf.length) throw new HttpError(400, 'EMPTY_FILE');
  if (buf.length > config.MAX_IMAGE_BYTES) throw new HttpError(413, 'TOO_LARGE', { hint: '图片过大（压缩后上限 4MB），请裁剪后再试' });
  const safe = name
    .slice(0, -(ext.length + 1))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'img';
  const p = `${IMG_DIR}/${m}/${stamp()}-${safe}.${ext}`;
  const r = await store.commitFiles([{ path: p, contentBase64: buf.toString('base64') }], `后台：上传图片 ${p}`, input.expectedHeadSha);
  return { path: p, commitSha: r.commitSha, headSha: r.headSha };
}

module.exports = {
  MODULES,
  MANIFEST_PATH,
  POSTS_DIR,
  DRAFTS_DIR,
  IMG_DIR,
  nowCst,
  slugify,
  normTags,
  listAll,
  getPostFile,
  saveDraft,
  publishDraft,
  publishNew,
  updatePost,
  saveData,
  saveSite,
  deleteItem,
  restore,
  uploadImage,
};
