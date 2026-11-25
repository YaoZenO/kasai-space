#!/usr/bin/env node
/**
 * 旧分类 URL 永久重定向断言（issue #22 / E-188）。
 *
 * 背景：分类从 7 条收敛为 4 个主题时，只改了文章分类字段、删了 URL 基线里的旧分类行，
 * `vercel.json` 的 redirects 没有任何断言覆盖——于是 7 条旧路径线上直接 404，
 * 构建、`npm test`、CI 全绿。
 *
 * 本文件锁两件事：
 *   [1] 7 条旧分类（带/不带尾斜杠共 14 条）必须存在，且指向对应新主题；
 *   [2] 所有 redirects 的形状合规：source 带前导斜杠、destination 是站内绝对路径、
 *       永久跳转（permanent: true 或 statusCode 301/308）、source 不重复。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

// 旧分类 → 新主题。这张表是 issue #22 的事实来源（2026-11-19 线上实测 404）。
const LEGACY = {
  个人感悟: '随笔与思考',
  名词解释: '技术与工程',
  城市数据: '数据与考据',
  学习路线: '技术与工程',
  职业发展: '产品与设计',
  设计资源: '产品与设计',
  踩坑记录: '技术与工程',
};

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

const rules = Array.isArray(cfg.redirects) ? cfg.redirects : [];

// source / destination 允许写成原样中文或百分号编码两种形式（Vercel 侧两种都见过），
// 断言统一解码后比对，避免把「换了写法」误判成「漏了规则」。
function norm(p) {
  try {
    return decodeURIComponent(String(p));
  } catch (err) {
    return String(p);
  }
}

// [1] 旧分类覆盖
if (rules.length === 0) {
  bad('vercel.json 没有任何 redirects，旧分类路径无从迁移');
} else {
  const problems = [];
  for (const from of Object.keys(LEGACY)) {
    const to = LEGACY[from];
    for (const suffix of ['', '/']) {
      const src = '/categories/' + from + suffix;
      const dst = '/categories/' + to + '/';
      const hits = rules.filter((r) => norm(r.source) === src);
      if (hits.length === 0) {
        problems.push(src + ' 缺失');
      } else if (hits.length > 1) {
        problems.push(src + ' 重复 ' + hits.length + ' 条');
      } else if (norm(hits[0].destination) !== dst) {
        problems.push(src + ' 指向 ' + hits[0].destination + '，应为 ' + dst);
      } else if (hits[0].permanent !== true) {
        problems.push(src + ' 不是永久跳转');
      }
    }
  }
  if (problems.length) {
    bad('旧分类重定向不完整：' + problems.join('；'));
  } else {
    ok('7 条旧分类 × 带/不带尾斜杠共 ' + Object.keys(LEGACY).length * 2 + ' 条永久重定向齐全');
  }
}

// [2] 规则形状
const malformed = rules
  .map((r, i) => {
    if (typeof r.source !== 'string' || !r.source.startsWith('/')) return i + '.source 不以 / 开头';
    if (typeof r.destination !== 'string' || !r.destination.startsWith('/')) return i + '.destination 不是站内绝对路径';
    const permanent = r.permanent === true || r.statusCode === 301 || r.statusCode === 308;
    if (!permanent) return i + ' 不是永久跳转（permanent/statusCode）';
    return null;
  })
  .filter(Boolean);

if (malformed.length) {
  bad('redirects 形状不合规：' + malformed.join('；'));
} else {
  ok('全部 ' + rules.length + ' 条 redirects 形状合规（前导斜杠 / 站内路径 / 永久）');
}

// [3] source 不得重复（重复时只有第一条生效，后面的静默失效）
const seen = new Map();
const dupes = [];
for (const r of rules) {
  seen.set(r.source, (seen.get(r.source) || 0) + 1);
}
for (const [src, n] of seen) {
  if (n > 1) dupes.push(src + ' ×' + n);
}
if (dupes.length) {
  bad('redirects source 重复：' + dupes.join('；'));
} else {
  ok('redirects source 无重复');
}

console.log('');
if (fail) {
  console.log('RESULT: ' + fail + ' 项断言失败，' + pass + ' 项通过');
  process.exit(1);
}
console.log('RESULT: ' + pass + ' 项断言通过');
