#!/usr/bin/env node
/**
 * 文章页导语（blurb）产物断言（issue #21 / E-191）。
 *
 * 背景：文章页改版时给页头加了导语样式，模板却写成 `post.data?.blurb`——
 * `Post` 接口里没有 `data` 这一层（`src/lib/posts.ts` 把 front matter 的 blurb
 * 直接挂在 `Post.blurb` 上），条件恒假，于是三篇写了导语的文章页头永远不显示，
 * 而构建、`npm test`、CI 全绿。类型层能拦住，但本仓库不跑 `astro check`。
 *
 * 本文件锁四件事：
 *   [1] 模板不得再出现 `post.data`（恒假条件的唯一来源）；
 *   [2] 至少有一篇文章带 blurb（否则下面几条在空集上永远「通过」）；
 *   [3] 每篇带 blurb 的文章，产物页头必须有 `.post-head-blurb`，且文字与 front matter 一致；
 *   [4] 反向：产物里出现 `.post-head-blurb` 的页数必须等于带 blurb 的文章数（防止串页/幽灵导语）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const DIST = path.join(ROOT, 'dist');
const LAYOUT = path.join(ROOT, 'src', 'layouts', 'PostLayout.astro');

let pass = 0;
let fail = 0;

function ok(msg) {
  pass += 1;
  console.log('  PASS ' + msg);
}

function bad(msg) {
  fail += 1;
  console.log('  FAIL ' + msg);
}

/** 与 src/lib/posts.ts 的 parseFrontMatter 同规则 */
function parseFrontMatter(raw) {
  const src = raw.replace(/^\uFEFF/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return {};
  return (yaml.load(m[1]) || {});
}

/** 与 posts.ts 的 permalink 一致：/YYYY/MM/DD/<slug>/ */
function permalink(fm, name) {
  const raw = fm.date ?? fm.published;
  let ymd = null;
  if (raw instanceof Date) {
    // 未加引号的 `date: 2026-10-21 23:30:00` 会被 js-yaml 解析成 Date 对象，
    // 且 js-yaml 把无时区的这串数字当成 UTC。src/lib/dates.ts 的 parsePostDate
    // 正是「取 UTC 分量当作 +08:00 壁钟」，所以这里也必须读 UTC 分量；
    // 读本地分量会在时区偏移下把 10/21 算成 10/22，permalink 直接对不上。
    const p2 = (n) => String(n).padStart(2, '0');
    ymd = [String(raw.getUTCFullYear()), p2(raw.getUTCMonth() + 1), p2(raw.getUTCDate())];
  } else {
    const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw ?? ''));
    if (d) ymd = [d[1], d[2], d[3]];
  }
  if (!ymd) return null;
  const slug = String(fm.slug || name);
  return ['', ...ymd, slug].join('/') + '/';
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function normText(s) {
  return decodeEntities(String(s)).replace(/\s+/g, ' ').trim();
}

// [1] 模板里的恒假条件。注释需要能解释这个坑，所以先剥掉 Astro 注释再查。
const layout = fs.readFileSync(LAYOUT, 'utf8');
const layoutCode = layout.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
if (/post\.data/.test(layoutCode)) {
  bad('PostLayout.astro 仍在读 post.data —— Post 没有该字段，条件恒假（应为 post.blurb）');
} else if (!/post\.blurb\s*&&/.test(layoutCode)) {
  bad('PostLayout.astro 找不到 `post.blurb && …` 的渲染条件');
} else {
  ok('模板读的是 post.blurb，没有 post.data 这一层');
}

// 收集带 blurb 的文章
const entries = fs
  .readdirSync(POSTS_DIR)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .sort();

const withBlurb = [];
for (const file of entries) {
  const name = file.replace(/\.md$/, '');
  const fm = parseFrontMatter(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));
  if (!fm || fm.blurb === undefined || fm.blurb === null || String(fm.blurb).trim() === '') continue;
  const url = permalink(fm, name);
  withBlurb.push({ name, url, blurb: String(fm.blurb) });
}

// [2] 空集保护
if (withBlurb.length === 0) {
  bad('source/_posts 里没有任何文章带 blurb —— 本套断言在空集上等于没跑');
} else {
  ok(withBlurb.length + ' 篇文章带 blurb：' + withBlurb.map((p) => p.name).join(', '));
}

// [3] 逐篇核对产物
const missing = [];
const mismatch = [];
for (const post of withBlurb) {
  if (!post.url) {
    missing.push(post.name + '（front matter 缺可解析的 date，拿不到 permalink）');
    continue;
  }
  const file = path.join(DIST, post.url, 'index.html');
  if (!fs.existsSync(file)) {
    missing.push(post.name + ' → ' + post.url + 'index.html 不存在');
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  const m = /<p class="post-head-blurb">([\s\S]*?)<\/p>/.exec(html);
  if (!m) {
    missing.push(post.name + ' 页头没有 .post-head-blurb');
    continue;
  }
  const got = normText(m[1]);
  const want = normText(post.blurb);
  if (got !== want) mismatch.push(post.name + '：产物「' + got + '」≠ front matter「' + want + '」');
}

if (missing.length) {
  bad('导语未渲染：' + missing.join('；'));
} else if (withBlurb.length) {
  ok(withBlurb.length + ' 篇文章页头都渲染出了导语');
}

if (mismatch.length) {
  bad('导语文案不一致：' + mismatch.join('；'));
} else if (withBlurb.length) {
  ok('导语文案与 front matter 逐字一致');
}

// [4] 反向：产物里的导语页数
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  bad('dist/ 不存在，先跑构建（npm run build）');
} else {
  const pagesWithBlurb = walk(DIST, []).filter((f) =>
    fs.readFileSync(f, 'utf8').includes('class="post-head-blurb"')
  );
  if (pagesWithBlurb.length !== withBlurb.length) {
    bad(
      '产物里含 .post-head-blurb 的页面 ' +
        pagesWithBlurb.length +
        ' 个，带 blurb 的文章 ' +
        withBlurb.length +
        ' 篇：' +
        pagesWithBlurb.map((f) => path.relative(DIST, f)).join(', ')
    );
  } else {
    ok('产物里含导语的页面数与带 blurb 的文章数一致（' + pagesWithBlurb.length + '）');
  }
}

console.log('');
if (fail) {
  console.log('RESULT: ' + fail + ' 项断言失败，' + pass + ' 项通过');
  process.exit(1);
}
console.log('RESULT: ' + pass + ' 项断言通过');
