'use strict';
// 内容域共享层：路径常量 + 无状态工具函数。
// 只依赖 registry / http，不依赖任何 domains/* —— 保证无循环引用。

const registry = require('./modules');
const { HttpError } = require('./http');

const POSTS_DIR = 'source/_posts';
const DRAFTS_DIR = '_drafts';
// 私密文章：写完了、只是不给别人看。与 _drafts（没写完的草稿）是两件事，
// 分目录存放（2026-10-22 主人指出「私密怎么能放到草稿呢」后分离）。
// 与 _drafts / _trash 同约定：都在 source/ 之外，Hexo 任何模式不渲染。
const PRIVATE_DIR = '_private';
const TRASH_DIR = '_trash';
const IMG_DIR = 'source/img';
const DATA_DIR = 'source/_data';
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

// 模块列表来自 source/_data/modules.yml（单一数据源），读取失败时 load() 回退内置默认。
// 传入 list 是为了让调用点复用一次读取结果，不重复发请求。
function assertModule(m, list) {
  if (!registry.keysOf(list).includes(m)) throw new HttpError(400, 'BAD_MODULE');
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

module.exports = {
  POSTS_DIR,
  DRAFTS_DIR,
  PRIVATE_DIR,
  TRASH_DIR,
  IMG_DIR,
  DATA_DIR,
  SITE_PATH,
  MANIFEST_PATH,
  nowCst,
  stamp,
  assertSlug,
  assertModule,
  slugify,
  normTags,
};
