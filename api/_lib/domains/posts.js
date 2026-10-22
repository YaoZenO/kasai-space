'use strict';
// 文章 / 草稿域。
// 不变量：已发布文章的文件名与 date 字段永不因编辑而改变（永久链接稳定）。

const store = require('../store');
const posts = require('../posts');
const { HttpError } = require('../http');
const { assertSlug, normTags, nowCst, POSTS_DIR, DRAFTS_DIR, PRIVATE_DIR } = require('../shared');

async function getPostFile(path) {
  const inPosts = path.startsWith(`${POSTS_DIR}/`);
  const inDrafts = path.startsWith(`${DRAFTS_DIR}/`);
  const inPrivate = path.startsWith(`${PRIVATE_DIR}/`);
  if (!inPosts && !inDrafts && !inPrivate) throw new HttpError(400, 'BAD_PATH');
  // headSha 与内容读取并行：编辑入口原本是 getFile → getHead 两次串行往返，
  // 每次点「编辑」都白等一次 GitHub 请求（E-017 卡顿的主因之一）。
  const [f, headSha] = await Promise.all([store.getFile(path), store.getHead()]);
  const parsed = posts.parseFrontMatter(f.content);
  return {
    path,
    isDraft: inDrafts,
    isPrivate: inPrivate,
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
    headSha,
  };
}

function buildPostText(title, tags, categories, body, date, extra) {
  const fm = { title, tags: normTags(tags), categories: normTags(categories) };
  if (date) fm.date = date;
  const ex = extra || {};
  if (ex.featured !== undefined && ex.featured !== null) fm.featured = !!ex.featured;
  if (ex.cover) fm.cover = String(ex.cover).trim();
  return posts.serializeFrontMatter(fm, []) + (body || '').replace(/^\r?\n/, '');
}

function permalinkFor(slug, date) {
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return `/${slug}/`;
  return `/${m[1]}/${m[2]}/${m[3]}/${slug}/`;
}

function normalizePostFile(content) {
  const parsed = posts.parseFrontMatter(content);
  return {
    frontmatter: { title: parsed.fm.title || '', date: parsed.fm.date || '', tags: normTags(parsed.fm.tags), categories: normTags(parsed.fm.categories) },
    body: parsed.body || '',
  };
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

// 已发布文章转为私密（2026-10-22，P2-12 主人要求「只想自己看、不删除」）：
// 整文原样移入私密区，一增一删同 commit；date / 标题 / 正文逐字保留，
// 日后发布按原 date 回到 _posts，permalink 不变。
// 私密区在 source/ 之外（PRIVATE_DIR，与 _drafts / _trash 同一约定），
// Hexo 任何模式下都不会渲染——线上立即不可见，且不依赖 render_drafts 配置。
// 与草稿是两回事：草稿是「没写完」，私密是「写完了只是不给别人看」（2026-10-22 分离）。
async function unpublishPost(input) {
  const path = String(input.path || '');
  if (!path.startsWith(`${POSTS_DIR}/`) || !path.endsWith('.md')) throw new HttpError(400, 'BAD_PATH');
  const slug = path.slice(POSTS_DIR.length + 1, -3);
  assertSlug(slug);
  const cur = await store.getFile(path).catch(() => {
    throw new HttpError(404, 'POST_NOT_FOUND');
  });
  if (input.sha && cur.sha !== input.sha) {
    const e = new HttpError(409, 'CONFLICT');
    e.conflictPayload = { current: normalizePostFile(cur.content), sha: cur.sha };
    throw e;
  }
  // 私密区已有同名文章时拒绝：那篇可能是另一内容，静默覆盖会丢东西
  const clash = await store.getFile(`${PRIVATE_DIR}/${slug}.md`).catch(() => null);
  if (clash) {
    const e = new HttpError(409, 'PRIVATE_EXISTS', { hint: '私密区里已有同名文章，请先发布或删除那篇' });
    e.conflictPayload = { current: normalizePostFile(clash.content), sha: clash.sha };
    throw e;
  }
  const r = await store.commitFiles(
    [
      { path: `${PRIVATE_DIR}/${slug}.md`, contentUtf8: cur.content },
      { path, delete: true },
    ],
    `后台：文章转为私密 ${slug}`,
    input.expectedHeadSha
  );
  return { path: `${PRIVATE_DIR}/${slug}.md`, slug, headSha: r.headSha, commitSha: r.commitSha };
}

// 私密文章发布回线上（unpublishPost 的逆操作）：date 原样保留时
// permalink 与转私密前一致；已发布位有同名文章时拒绝（POST_EXISTS）。
async function publishPrivatePost(input) {
  const slug = assertSlug(input.slug);
  const privatePath = `${PRIVATE_DIR}/${slug}.md`;
  const cur = await store.getFile(privatePath).catch(() => {
    throw new HttpError(404, 'PRIVATE_NOT_FOUND');
  });
  const postPath = `${POSTS_DIR}/${slug}.md`;
  const existing = await store.getFile(postPath).catch(() => null);
  if (existing) throw new HttpError(409, 'POST_EXISTS', { path: postPath });
  const parsed = posts.parseFrontMatter(cur.content);
  const date = parsed.fm.date || nowCst();
  const postText = buildPostText(parsed.fm.title || 'Untitled', parsed.fm.tags, parsed.fm.categories, parsed.body, date, parsed.fm);
  const r = await store.commitFiles(
    [
      { path: postPath, contentUtf8: postText },
      { path: privatePath, delete: true },
    ],
    `后台：发布私密文章 ${slug}`,
    input.expectedHeadSha
  );
  return { path: postPath, slug, permalink: permalinkFor(slug, date), date, headSha: r.headSha, commitSha: r.commitSha };
}

// 编辑已发布文章：文件名与 date 锁定，标题可改但文件名不变
// 2026-10-22 起同时接受私密区路径：私密文章的「保存修改」走同一条链路，锁定语义一致。
async function updatePost(input) {
  const path = String(input.path || '');
  const inPosts = path.startsWith(`${POSTS_DIR}/`) && path.endsWith('.md');
  const inPrivate = path.startsWith(`${PRIVATE_DIR}/`) && path.endsWith('.md');
  if (!inPosts && !inPrivate) throw new HttpError(400, 'BAD_PATH');
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

module.exports = {
  getPostFile,
  buildPostText,
  permalinkFor,
  normalizePostFile,
  saveDraft,
  publishDraft,
  publishNew,
  unpublishPost,
  publishPrivatePost,
  updatePost,
};
