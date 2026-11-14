// 文字族 e2e（PAGE-FORM-PLAN §4.6.2 / §4.6.12，S1）
// 覆盖 /archives/ 三级、/tags/、/categories/：页头无 kicker、年份轨道与列表一致、
// 关键词数量与改名文案、无输入控件。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, process.env.SITE_OUT || 'dist');

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.error('  ✗ ' + msg);
  }
}

function read(rel) {
  const p = path.join(OUT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

const archives = read('archives/index.html');
const tagsIndex = read('tags/index.html');
const catsIndex = read('categories/index.html');

function count(html, re) {
  return (html.match(re) || []).length;
}

// ---- 索引页：页头与结构 ----
ok(archives.length > 0, '缺少 /archives/ 产物');
ok(!archives.includes('page-head-kicker'), '/archives/ 仍带文章壳 kicker');
ok(/<h1 class="ar-title">文字<\/h1>/.test(archives), '/archives/ 标题不是「文字」');
ok(archives.includes('class="ar-lead"'), '/archives/ 缺一句结论');
ok(!/pick-desc|post-desc/.test(archives), '/archives/ 仍在输出正文摘要');

const trackCards = count(archives, /class="ar-track-year"/g);
ok(trackCards > 0, '/archives/ 缺年份轨道');

// 年份目录数（/archives/YYYY/）应与轨道格数一致
const yearDirs = fs.existsSync(path.join(OUT, 'archives'))
  ? fs.readdirSync(path.join(OUT, 'archives'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d{4}$/.test(d.name))
      .map((d) => d.name)
  : [];
ok(trackCards === yearDirs.length, `年份轨道 ${trackCards} 格，年份页 ${yearDirs.length} 个`);

// 轨道「N 篇」之和 = 列表行数 = 全站文章数
const trackBlocks = archives.split('class="ar-track-year"').slice(1).map((b) => b.split('</a>')[0]);
const trackMap = new Map();
for (const b of trackBlocks) {
  const y = (b.match(/\/archives\/(\d{4})\//) || [])[1];
  const n = Number((b.match(/class="ar-track-count">(\d+) 篇/) || [])[1] || -1);
  if (y) trackMap.set(y, n);
}
const trackSum = [...trackMap.values()].reduce((s, n) => s + n, 0);
const archiveRows = count(archives, /class="ar-row"/g);
ok(trackSum === archiveRows, `轨道篇数之和 ${trackSum} ≠ 列表 ${archiveRows} 行`);
ok(archiveRows > 0, '/archives/ 列表为空');

// 每行最多两个关键词
const rowBlocks = archives.split('class="ar-row"').slice(1);
ok(rowBlocks.every((b) => count(b.split('</div>')[0], /class="ar-row-tag"/g) <= 2),
  '/archives/ 有行超过两个关键词');

// 年份页：标题 = 该年，行数 = 该年篇数
for (const year of yearDirs) {
  const h = read(`archives/${year}/index.html`);
  ok(!h.includes('page-head-kicker'), `/archives/${year}/ 仍带 kicker`);
  ok(h.includes(`<h1 class="ar-title">${year} 年</h1>`), `/archives/${year}/ 标题不对`);
  const n = count(h, /class="ar-row"/g);
  const t = trackMap.get(year);
  ok(n > 0 && (t === undefined || n === t), `/archives/${year}/ 行数 ${n} 与轨道 ${t} 不一致`);
}

// ---- 关键词总览（改名 + chip 云）----
ok(tagsIndex.length > 0, '缺少 /tags/ 产物');
ok(tagsIndex.includes('<h1 class="ar-title">关键词</h1>'), '/tags/ 标题未改为「关键词」');
ok(!tagsIndex.includes('<h1 class="ar-title">标签</h1>'), '/tags/ 仍叫「标签」');
const chipCount = count(tagsIndex, /class="ar-tag ar-tag--[sml]"/g);
const tagDirs = fs.existsSync(path.join(OUT, 'tags'))
  ? fs.readdirSync(path.join(OUT, 'tags'), { withFileTypes: true }).filter((d) => d.isDirectory()).length
  : 0;
ok(chipCount === tagDirs, `chip ${chipCount} 个，关键词页 ${tagDirs} 个`);
ok(chipCount > 0, '/tags/ 没有关键词 chip');

// ---- 主题总览（改名 + 索引条）----
ok(catsIndex.length > 0, '缺少 /categories/ 产物');
ok(catsIndex.includes('<h1 class="ar-title">主题</h1>'), '/categories/ 标题未改为「主题」');
ok(!catsIndex.includes('<h1 class="ar-title">分类</h1>'), '/categories/ 仍叫「分类」');
const catRows = count(catsIndex, /class="ar-cat-row"/g);
const catDirs = fs.existsSync(path.join(OUT, 'categories'))
  ? fs.readdirSync(path.join(OUT, 'categories'), { withFileTypes: true }).filter((d) => d.isDirectory()).length
  : 0;
ok(catRows === catDirs, `主题索引 ${catRows} 行，主题页 ${catDirs} 个`);
ok(/class="ar-cat-date"/.test(catsIndex), '/categories/ 索引条缺最近日期');

// ---- 详情页：无 TAG / CATEGORY 头，有结论 ----
for (const dir of ['tags', 'categories']) {
  const root = path.join(OUT, dir);
  if (!fs.existsSync(root)) continue;
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const rel = path.join(dir, ent.name, 'index.html');
    const h = read(rel);
    if (!h) continue;
    ok(!h.includes('page-head-kicker'), `${rel} 仍带 kicker`);
    ok(/class="ar-lead">\d+ 篇/.test(h), `${rel} 结论格式不是「N 篇」`);
  }
}

// ---- 无输入控件（C-6 红线，搜索页除外）----
for (const [name, h] of [['/archives/', archives], ['/tags/', tagsIndex], ['/categories/', catsIndex]]) {
  ok(!/<input\b/i.test(h), `${name} 出现输入控件`);
}

console.log(`\nRESULT: ${pass} 项断言通过${fail ? '，存在失败' : ''}`);
process.exit(fail ? 1 : 0);
