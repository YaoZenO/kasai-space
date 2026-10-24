#!/usr/bin/env node
/**
 * perf-baseline.js — 首屏字体与首页冷缓存基线测量（只读）
 *
 * 存在理由：E-054。首屏字体量曾经靠「理论最小字体集」人工推导成 1.61 MB，
 * 实际是 2.77 MB，漏了 1.16 MB。原因是推导口径错了：实际会下载哪些字体，
 * 取决于 `site.css` 里**声明过**的 font-weight，而不是「理论上应该需要哪些」。
 *
 * 本脚本不经过人工推导，直接：
 *   1) 扫 source/css/site.css 的全部 font-weight 声明，取并集
 *   2) 解析同文件里的 @font-face（family / weight / src）
 *   3) 对每个字体族，按 CSS 字体匹配规则选出会被命中的字重档
 *   4) 累加 public/fonts 下对应文件的实际字节
 *
 * 用法：  node tools/perf-baseline.js
 * 输出：  首屏字体文件数 / 首屏字体字节 / 首页冷缓存总量（估算）
 *
 * 报告里的首屏数字一律以本脚本输出为准。手写数字视为无效。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_CSS = path.join(ROOT, 'source', 'css', 'site.css');
const FONTS_DIR = path.join(ROOT, 'public', 'fonts');
const INDEX_HTML = path.join(ROOT, 'public', 'index.html');

function fail(msg) {
  console.error('[perf-baseline] ' + msg);
  process.exit(1);
}

if (!fs.existsSync(SITE_CSS)) fail('找不到 source/css/site.css，先跑一次 npm run build');
if (!fs.existsSync(FONTS_DIR)) fail('找不到 public/fonts，先跑一次 npm run build');

const css = fs.readFileSync(SITE_CSS, 'utf8');

/* ---------- 1) 收集 CSS 里声明过的 font-weight ---------- */
const declaredWeights = new Set();
for (const m of css.matchAll(/font-weight\s*:\s*([0-9]{3}|bold|normal|[1-9]00)/g)) {
  const raw = m[1];
  declaredWeights.add(raw === 'bold' ? 700 : raw === 'normal' ? 400 : parseInt(raw, 10));
}
// font 简写里的字重（如 font: 600 1rem/1.4 "X"）
for (const m of css.matchAll(/[^-a-zA-Z]font\s*:\s*(?:[1-9]00|bold|normal)\s/g)) {
  const w = m[0].replace(/font\s*:\s*/, '').trim();
  declaredWeights.add(w === 'bold' ? 700 : w === 'normal' ? 400 : parseInt(w, 10));
}

/* ---------- 2) 解析 @font-face ---------- */
const faces = [];
for (const m of css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
  const body = m[1];
  const fam = /font-family\s*:\s*["']?([^;"']+)["']?\s*;/.exec(body);
  const wt = /font-weight\s*:\s*([^;]+);/.exec(body);
  const src = /src\s*:\s*[^;]*url\(["']?([^"')]+)["']?\)/.exec(body);
  const ur = /unicode-range\s*:\s*([^;]+);/.exec(body);
  if (!fam || !src) continue;
  const weightSpec = wt ? wt[1].trim() : '400';
  faces.push({
    family: fam[1].trim().replace(/["']/g, ''),
    weightSpec,
    weights: weightSpec.split(/\s+/).map((w) => (w === 'bold' ? 700 : w === 'normal' ? 400 : parseInt(w, 10))),
    file: src[1],
    hasUnicodeRange: !!ur,
  });
}

/* ---------- 3) CSS 字体匹配：对每个族选出会被命中的字重档 ---------- */
// 规则（简化自 CSS Fonts 4 §5.2）：给定目标字重 w，
//   - 先找 >= w 的可用档中最小者（w 在 400..500 之间时优先 500 以下降序、再 500 以上升序）
//   - 没有则找 < w 的最大者
function pickFace(group, target) {
  const single = group.filter((f) => f.weights.length === 1);
  const pool = single.length ? single : group;
  const exact = pool.find((f) => f.weights.includes(target));
  if (exact) return exact;

  const nums = pool.flatMap((f) => f.weights).filter((n) => !Number.isNaN(n));
  if (!nums.length) return null;

  let candidate = null;
  if (target >= 400 && target <= 500) {
    const below = nums.filter((n) => n >= target && n <= 500).sort((a, b) => a - b)[0];
    const above = nums.filter((n) => n > 500).sort((a, b) => a - b)[0];
    const belowDesc = nums.filter((n) => n < target).sort((a, b) => b - a)[0];
    candidate = below ?? above ?? belowDesc;
  } else if (target < 400) {
    const below = nums.filter((n) => n < target).sort((a, b) => b - a)[0];
    const above = nums.filter((n) => n >= target).sort((a, b) => a - b)[0];
    candidate = below ?? above;
  } else {
    const above = nums.filter((n) => n > target).sort((a, b) => a - b)[0];
    const below = nums.filter((n) => n < target).sort((a, b) => b - a)[0];
    candidate = above ?? below;
  }
  if (candidate == null) return null;
  return pool.find((f) => f.weights.includes(candidate)) || null;
}

const byFamily = new Map();
for (const f of faces) {
  if (!byFamily.has(f.family)) byFamily.set(f.family, []);
  byFamily.get(f.family).push(f);
}

const triggered = new Map(); // file -> { family, weight, bytes }
for (const [family, group] of byFamily) {
  for (const w of declaredWeights) {
    if (Number.isNaN(w)) continue;
    const f = pickFace(group, w);
    if (!f) continue;
    const rel = f.file.replace(/^\/+/, '');
    const abs = path.join(ROOT, 'public', rel);
    if (!fs.existsSync(abs)) continue;
    triggered.set(rel, {
      family,
      weight: f.weightSpec,
      bytes: fs.statSync(abs).size,
      unicodeRange: f.hasUnicodeRange,
    });
  }
}

/* ---------- 4) 输出 ---------- */
const pad = (s, n) => String(s).padEnd(n);
const num = (n) => n.toLocaleString('en-US');

const rows = [...triggered.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
const totalFontBytes = rows.reduce((s, r) => s + r[1].bytes, 0);

// E-055 防复发：先列清每个字体族**实际存在**哪些字重档。
// 任何「把字重收敛到 N 档」的建议都必须先过这一关——没有对应文件就不可能落地。
console.log('');
console.log('=== 字体族 × 实际存在的字重档（E-055 防复发）===');
console.log('');
console.log(pad('字体族', 22) + pad('可用字重档', 24) + '文件');
console.log('-'.repeat(90));
for (const [family, group] of [...byFamily.entries()].sort()) {
  const ws = [...new Set(group.map((f) => f.weightSpec))].join(' / ');
  console.log(pad(family, 22) + pad(ws, 24) + group.map((f) => path.basename(f.file)).join(', '));
}
console.log('-'.repeat(90));
console.log('⚠️ 提出「收敛字重到 X 档」类方案前，先确认该族**存在** X 档文件；');
console.log('   不存在就只能靠浏览器合成加粗，性质完全不同（见 E-055）。');
console.log('');

let htmlBytes = 0;
if (fs.existsSync(INDEX_HTML)) htmlBytes = fs.statSync(INDEX_HTML).size;

// 首页 HTML 里声明的静态子资源（不含 CSS 内部发现的字体）
//
// 只统计浏览器**真的会下载**的资源。以下 `href` 不算：
//   - rel="alternate"（atom.xml / rss）—— 是订阅发现链接，浏览器不请求
//   - rel="canonical" —— 只是声明规范 URL
//   - rel="preconnect" / "dns-prefetch" —— 只建连接，不取字节
// 这条口径曾经缺失：atom.xml 66 KB 被算进「首屏子资源」，让总量虚高。
const subRes = new Set();
if (fs.existsSync(INDEX_HTML)) {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  // 先把「不产生字节请求」的 <link> 整条剔除，再收集 href/src
  const htmlForRes = html.replace(/<link\b[^>]*\brel="(?:alternate|canonical|preconnect|dns-prefetch|author|license|me)"[^>]*>/gi, ' ');
  for (const m of htmlForRes.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    if (/^https?:/.test(m[1]) || m[1].startsWith('//')) continue;
    subRes.add(m[1]);
  }
}
let subBytes = 0;
for (const u of subRes) {
  const p = path.join(ROOT, 'public', u.split('?')[0].replace(/^\/+/, ''));
  if (fs.existsSync(p)) subBytes += fs.statSync(p).size;
}

console.log('');
console.log('=== 首屏字体基线（由 CSS 字重声明反查，非人工推导）===');
console.log('');
console.log('CSS 中声明过的 font-weight： ' + [...declaredWeights].filter((n) => !Number.isNaN(n)).sort((a, b) => a - b).join(', '));
console.log('');
console.log(pad('字体文件', 34) + pad('字体族', 20) + pad('字重', 10) + pad('unicode-range', 15) + '字节');
console.log('-'.repeat(96));
for (const [file, info] of rows) {
  console.log(
    pad(file.replace(/^fonts\//, ''), 34) +
      pad(info.family, 20) +
      pad(info.weight, 10) +
      pad(info.unicodeRange ? '有' : '❌ 无', 15) +
      num(info.bytes)
  );
}
console.log('-'.repeat(96));
console.log(pad('首屏字体文件数', 34) + rows.length);
console.log(pad('首屏字体总字节', 34) + num(totalFontBytes));
console.log('');
console.log('=== 首页冷缓存总量（原始字节，未压缩口径）===');
console.log(pad('HTML 本体', 34) + num(htmlBytes));
console.log(pad('HTML 声明的子资源', 34) + num(subBytes) + '  (' + subRes.size + ' 个)');
console.log(pad('CSS 内部发现的字体', 34) + num(totalFontBytes));
console.log(pad('合计', 34) + num(htmlBytes + subBytes + totalFontBytes));
console.log('');
console.log('注 1：字体为 woff2，brotli 几乎零收益，线上按原始字节传输。');
console.log('     CSS/JS/HTML 为可压缩文本，线上约为原始字节的 20~30%。');
console.log('');
console.log('注 2：本表是「全站 font-weight 声明并集」的**上界口径**。');
console.log('     某一页真实触发的字体可能更少。');
console.log('     2026-10-23 起中文改走系统字体栈（见 site.css 注释与 E-060），');
console.log('     自托管字体只剩 3 个拉丁字体（Archivo / Fraunces / Nunito Sans），');
console.log('     上界口径与单页真实触发集已经一致。');
console.log('     若日后重新引入中文字体，本脚本仍只保证不下界，单页真实集须另行核对。');
console.log('');
