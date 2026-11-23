/**
 * 图片引用完整性断言：产物 HTML 里出现的每个站内图片地址，必须有对应文件存在。
 *
 * 由来：2026-11-24 清理 BLG 专题页 5 张 VCG 系照片时发现，全站已有断言里没有一条
 * 校验 `<img src>` 指向的文件是否真在产物中——`asset-version.js` 只管 css hash，
 * `module-pages-e2e.js` 只管页面文件是否存在。结果是「删了图、页面继续引用」这种
 * 断图可以带着全绿构建直接上线。本文件把这条静默失败变成硬断言。
 *
 * 做法：
 *   1. 递归遍历 dist/ 下所有 .html
 *   2. 抽取 src / srcset / content（og:image 等）里的站内图片路径，去掉 query 与 hash
 *   3. 断言 dist 下存在同名文件
 *   4. dist 不存在时 SKIP 并说明（与 asset-version.js 同一约定：不误判为失败）
 *   5. 变异自检：在临时目录造一个指向不存在图片的 HTML，断言扫描函数能抓出来
 *      （不碰 dist/，不碰真实页面 —— E-004 / E-002）
 *
 * 运行：node test/img-refs.js（已串入 npm test，排在 astro:build 之后）
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const IMG_EXT = /\.(?:jpe?g|png|webp|avif|gif|svg|ico)(?:\?|#|$)/i;

let passed = 0;
function ok(label, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS', label);
  } catch (e) {
    console.error('  FAIL', label, '—', e.message);
    process.exitCode = 1;
  }
}

function walkHtml(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkHtml(p, out);
    else if (ent.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/**
 * 扫描一个产物根目录，返回 { total, missing[] }。
 * missing 里每条是「图片地址  ← 首个引用它的页面」，便于直接定位。
 */
function scanImages(rootDir) {
  const pages = walkHtml(rootDir, []);
  const refs = new Map();

  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    const attr = /\b(?:src|srcset|content)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let m;
    while ((m = attr.exec(html)) !== null) {
      const value = m[1] !== undefined ? m[1] : m[2];
      for (const chunk of String(value).split(',')) {
        const raw = chunk.trim().split(/\s+/)[0];
        if (!raw) continue;
        if (/^(?:https?:)?\/\//i.test(raw) || raw.startsWith('data:')) continue;
        if (!raw.startsWith('/')) continue;
        if (!IMG_EXT.test(raw)) continue;
        const clean = raw.split('?')[0].split('#')[0];
        if (!refs.has(clean)) refs.set(clean, path.relative(rootDir, page));
      }
    }
  }

  const missing = [];
  for (const [p, page] of refs) {
    let abs;
    try {
      abs = path.join(rootDir, decodeURIComponent(p));
    } catch {
      abs = path.join(rootDir, p);
    }
    if (!fs.existsSync(abs)) missing.push(p + '  \u2190 ' + page);
  }
  return { total: refs.size, missing };
}

// ---------- 变异自检：扫描器本身必须能抓出断图 ----------
ok('自检：扫描器能抓出指向不存在文件的 /img 引用', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'img-refs-'));
  try {
    fs.writeFileSync(
      path.join(tmp, 'index.html'),
      '<img src="/img/not-there.jpg" alt="x"><img src="/img/ok.jpg"><img src="https://example.com/a.jpg">'
    );
    fs.mkdirSync(path.join(tmp, 'img'));
    fs.writeFileSync(path.join(tmp, 'img', 'ok.jpg'), 'x');
    const res = scanImages(tmp);
    if (res.missing.length !== 1) {
      throw new Error('应恰好抓到 1 条断图，实际 ' + res.missing.length + ' 条');
    }
    if (!res.missing[0].includes('/img/not-there.jpg')) {
      throw new Error('抓到的不是预期路径：' + res.missing[0]);
    }
    if (res.total !== 2) {
      throw new Error('站内图片引用应为 2 条（外链不计），实际 ' + res.total);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- 真实产物 ----------
if (!fs.existsSync(DIST)) {
  console.log('  SKIP 产物断言（dist/ 不存在，先跑 npm run astro:build）');
} else {
  ok('dist/ 内所有页面引用的站内图片均真实存在', () => {
    const res = scanImages(DIST);
    if (res.total === 0) {
      throw new Error('一条站内图片引用都没扫到，扫描器可能失效（预期应为数百条）');
    }
    if (res.missing.length) {
      const head = res.missing.slice(0, 20).join('\n      ');
      throw new Error(
        '发现 ' + res.missing.length + ' 条断图（共 ' + res.total + ' 条引用）：\n      ' + head
      );
    }
    console.log('      ' + res.total + ' 条站内图片引用全部命中');
  });
}

console.log('\nRESULT: ' + passed + ' 项断言通过' + (process.exitCode ? '，存在失败' : ''));
