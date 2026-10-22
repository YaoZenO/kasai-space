'use strict';
// 写操作入参校验：按模块字段白名单 + 类型/长度/格式。
// 铁律：未知字段一律拒绝（防止前后端字段漂移静默丢失数据）。
const { HttpError } = require('./http');

const MODULE_FIELDS = {
  collections: ['title', 'link', 'desc', 'cover', 'date'],
  projects: ['slug', 'title', 'date', 'summary', 'cover', 'link', 'tags', 'background', 'process', 'tech', 'outcome'],
  games: ['slug', 'title', 'date', 'cover', 'genre', 'platform', 'status', 'summary', 'gameplay', 'media', 'video', 'links'],
};

// 旧版 projects 条目携带的 desc 已被 summary 取代：保存时容忍并剥除，
// 避免存量数据（如「Ties」）堵死新字段白名单导致整个板块无法保存。
const DEPRECATED_FIELDS = { projects: ['desc'] };

const LONG_MAX = { background: 20000, process: 20000, tech: 20000, outcome: 20000, gameplay: 20000, summary: 500, desc: 500 };
const SHORT_MAX = 120;

function fail(field, msg) {
  throw new HttpError(400, 'BAD_FIELD', { hint: `${field}: ${msg}` });
}
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const isPathLike = (v) => /^(\/[\w\-./]+|https?:\/\/\S+)$/i.test(v);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isSlug = (v) => /^[a-z0-9][a-z0-9-]*$/.test(v);

function validateItem(module, raw) {
  const fields = MODULE_FIELDS[module];
  if (!fields) throw new HttpError(400, 'BAD_MODULE', { hint: '内容板块不存在' });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('item', '条目必须是对象');
  const item = raw;

  for (const k of Object.keys(item)) {
    if (!fields.includes(k) && !(DEPRECATED_FIELDS[module] || []).includes(k)) fail(k, '该板块不支持此字段');
  }
  for (const k of DEPRECATED_FIELDS[module] || []) delete item[k];
  if (!str(item.title).trim()) fail('title', '标题不能为空');
  if (str(item.title).length > SHORT_MAX) fail('title', `标题过长（≤${SHORT_MAX} 字符）`);
  if (item.slug != null && item.slug !== '' && !isSlug(item.slug)) fail('slug', '仅允许小写字母、数字与中划线');
  if (item.date != null && item.date !== '' && !isDate(item.date)) fail('date', '日期格式应为 YYYY-MM-DD');
  if (item.link != null && item.link !== '' && !isPathLike(item.link)) fail('link', '仅支持 http(s):// 链接或以 / 开头的站内路径');
  if (item.video != null && item.video !== '' && !/^https?:\/\/\S+$/.test(item.video)) fail('video', '视频链接应为 http(s):// 地址');
  if (item.cover != null && item.cover !== '' && !isPathLike(item.cover)) fail('cover', '封面应为站内路径或 http(s):// 地址');

  for (const [k, max] of Object.entries(LONG_MAX)) {
    if (item[k] != null && str(item[k]).length > max) fail(k, `内容过长（≤${max} 字符）`);
  }

  if (item.tags != null && item.tags !== '') {
    const arr = Array.isArray(item.tags) ? item.tags : str(item.tags).split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    if (arr.length > 12) fail('tags', '标签最多 12 个');
    for (const t of arr) if (str(t).length > 30) fail('tags', '单个标签 ≤30 字符');
    item.tags = arr; // 归一化为数组，避免字符串形态流入序列化层
  }

  if (item.media != null) {
    if (!Array.isArray(item.media)) fail('media', '截图媒体必须是数组');
    if (item.media.length > 24) fail('media', '截图最多 24 张');
    item.media.forEach((m, i) => {
      if (!isPathLike(str(m))) fail(`media[${i}]`, '媒体路径不合法（站内路径或 http(s):// 地址）');
    });
  }

  if (item.links != null) {
    if (!Array.isArray(item.links)) fail('links', '链接必须是数组');
    if (item.links.length > 8) fail('links', '链接最多 8 个');
    item.links.forEach((l, i) => {
      if (!l || typeof l !== 'object' || Array.isArray(l)) fail(`links[${i}]`, '链接格式不正确');
      if (!str(l.label).trim()) fail(`links[${i}].label`, '链接名称不能为空');
      if (!/^https?:\/\/\S+$/.test(str(l.url))) fail(`links[${i}].url`, '链接地址应为 http(s):// 地址');
    });
  }
  return item;
}

// ---------- 文章（post）校验 ----------
// 白名单必须与 source/admin/admin.js 实际发送的字段一致，漏一个就会让保存功能 400。
const POST_ACTIONS = ['save-draft', 'publish-draft', 'publish-new', 'update', 'unpublish', 'publish-private'];
const POST_FIELDS = [
  'kind', 'action', 'slug', 'prevSlug', 'path',
  'title', 'tags', 'categories', 'body', 'cover', 'featured',
  'sha', 'expectedHeadSha',
];
// 与 api/_lib/content.js 的 POSTS_DIR / DRAFTS_DIR 保持一致
const POST_PATH_RE = /^(source\/_posts|_drafts)\/[A-Za-z0-9._-]+\.md$/;

function validatePost(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('body', '请求体必须是对象');
  const b = raw;

  for (const k of Object.keys(b)) {
    if (!POST_FIELDS.includes(k)) fail(k, '文章保存不支持此字段');
  }

  const action = str(b.action);
  if (!POST_ACTIONS.includes(action)) fail('action', `不支持的操作（可选：${POST_ACTIONS.join(' / ')}）`);

  // 按 action 区分必填：update / unpublish 定位靠 path，其余靠 slug
  if (action === 'update' || action === 'unpublish') {
    if (!str(b.path).trim()) fail('path', '缺少文章路径');
  } else if (!str(b.slug).trim()) {
    fail('slug', '缺少文件名（slug）');
  }

  for (const k of ['slug', 'prevSlug']) {
    if (b[k] != null && b[k] !== '' && !isSlug(b[k])) fail(k, '仅允许小写字母、数字与中划线');
  }

  if (b.path != null && b.path !== '') {
    // 防目录穿越：只允许 _posts / _drafts 下的单层 .md，不允许 .. 与 /
    if (!POST_PATH_RE.test(str(b.path))) fail('path', '文章路径不合法（仅限 source/_posts/ 或 _drafts/ 下的 .md 文件）');
  }

  if (str(b.title).length > 200) fail('title', '标题过长（≤200 字符）');
  if (str(b.body).length > 200000) fail('body', '正文过长（≤200000 字符）');
  if (b.cover != null && b.cover !== '' && !isPathLike(b.cover)) fail('cover', '封面应为站内路径或 http(s):// 地址');

  // featured 必须归一化：updatePost 用 !!input.featured 取值，
  // 若前端误传字符串 "false"，!!"false" 会得到 true——静默反转用户意图。
  if (b.featured !== undefined && b.featured !== null) {
    if (b.featured === true || b.featured === 'true') b.featured = true;
    else if (b.featured === false || b.featured === 'false' || b.featured === '' ) b.featured = false;
    else fail('featured', '仅支持 true / false');
  }

  for (const k of ['tags', 'categories']) {
    if (b[k] == null || b[k] === '') continue;
    const arr = Array.isArray(b[k]) ? b[k] : str(b[k]).split(/[,，]/);
    if (arr.length > 12) fail(k, `${k === 'tags' ? '标签' : '分类'}最多 12 个`);
    for (const t of arr) if (str(t).trim().length > 30) fail(k, `单个${k === 'tags' ? '标签' : '分类'} ≤30 字符`);
    b[k] = arr.map((s) => str(s).trim()).filter(Boolean);
  }

  // sha 用于乐观锁比对，放宽格式（mock 与真实环境长度不同），但拒绝非字符串
  for (const k of ['sha', 'expectedHeadSha']) {
    if (b[k] == null || b[k] === '') continue;
    if (typeof b[k] !== 'string') fail(k, '应为字符串');
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(b[k])) fail(k, '格式不正确');
  }

  return b;
}

// 站点身份配置校验（P0 之后设置页的写入把关）
function validateSite(cfg) {
  const c = cfg || {};
  if (str(c.intro).length > 200) fail('intro', '介绍过长（≤200 字符）');
  if (str(c.motto).length > 120) fail('motto', '座右铭过长（≤120 字符）');
  if (c.avatar != null && c.avatar !== '' && !isPathLike(c.avatar)) fail('avatar', '头像应为站内路径或 http(s):// 地址');
  const words = Array.isArray(c.identity_words) ? c.identity_words : str(c.identity_words).split(/\r?\n/);
  if (words.filter((w) => str(w).trim()).length > 8) fail('identity_words', '身份词最多 8 个');
  for (const w of words) if (str(w).trim().length > 40) fail('identity_words', '单个身份词 ≤40 字符');
  return c;
}

module.exports = { validateItem, validateSite, validatePost, MODULE_FIELDS, POST_ACTIONS, POST_FIELDS };
