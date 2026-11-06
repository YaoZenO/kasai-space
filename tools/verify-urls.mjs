// URL 验收：把 dist/ 产物归一成 URL 清单，与 docs/astro-migration/URL-BASELINE.txt 比对。
//
// 用法：
//   node tools/verify-urls.mjs --mode=subset   # 阶段 1-4：产物 URL 不能超出基线，允许未实现
//   node tools/verify-urls.mjs --mode=exact    # 阶段 5：必须 702+404 全量一致
//
// 退出码：0 通过；1 有 extra（subset 模式）或 exact 模式下有 missing。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const BASELINE = path.join(ROOT, 'docs', 'astro-migration', 'URL-BASELINE.txt');

const modeArg = process.argv.find(a => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'subset';

function readBaseline() {
  const lines = fs.readFileSync(BASELINE, 'utf8').split(/\r?\n/);
  const urls = new Set();
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (!t.startsWith('/')) continue;
    urls.add(t);
  }
  return urls;
}

function walk(dir, base = '') {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + ent.name : ent.name;
    if (ent.isDirectory()) out.push(...walk(path.join(dir, ent.name), rel));
    else out.push(rel);
  }
  return out;
}

// 非 HTML 产物（订阅源 / 站点地图 / 搜索索引 / 根资源）：构建产物里存在即视为该 URL 已产出。
// 基线把这几条与 703 个 HTML 一起计入 708，verifier 必须同样识别，否则 exact 模式永远差 5 条。
const NON_HTML = new Set([
  '/atom.xml',
  '/sitemap.xml',
  '/search-index.json',
  '/robots.txt',
  '/favicon.ico',
]);

function distUrls() {
  if (!fs.existsSync(DIST)) {
    console.error('[verify-urls] dist/ 不存在，请先 astro build');
    process.exit(1);
  }
  const urls = new Set();
  for (const rel of walk(DIST)) {
    const name = rel.replace(/\\/g, '/');
    if (!/\.html$/i.test(name)) {
      const u = '/' + name;
      if (NON_HTML.has(u)) urls.add(u);
      continue;
    }
    if (name === '404.html') {
      urls.add('/404.html');
      continue;
    }
    if (name === 'index.html') {
      urls.add('/');
      continue;
    }
    if (name.endsWith('/index.html')) {
      urls.add('/' + name.slice(0, -'/index.html'.length) + '/');
      continue;
    }
    // 其它 HTML（目前不应存在）
    urls.add('/' + name);
  }
  return urls;
}

const baseline = readBaseline();
const actual = distUrls();

const extra = [...actual].filter(u => !baseline.has(u)).sort();
const missing = [...baseline].filter(u => !actual.has(u)).sort();

console.log(`[verify-urls] mode=${mode} | baseline=${baseline.size} | dist=${actual.size}`);
console.log(`[verify-urls] extra=${extra.length} missing=${missing.length}`);

if (extra.length) {
  console.log('\n[extra] 产物里存在但基线没有的 URL：');
  extra.forEach(u => console.log('  ' + u));
}

if (mode === 'exact' && missing.length) {
  console.log('\n[missing] 基线有但产物没有的 URL（前 40 条）：');
  missing.slice(0, 40).forEach(u => console.log('  ' + u));
  if (missing.length > 40) console.log(`  ... 其余 ${missing.length - 40} 条`);
}

if (mode === 'subset') {
  if (extra.length) {
    console.error('[verify-urls] 失败：subset 模式下不允许出现基线外 URL');
    process.exit(1);
  }
  console.log('[verify-urls] 通过（subset）：尚未实现的基线 URL 不计为失败');
  process.exit(0);
}

if (extra.length || missing.length) {
  console.error('[verify-urls] 失败：exact 模式要求全量一致');
  process.exit(1);
}

console.log('[verify-urls] 通过（exact）：全量 URL 与基线一致');
