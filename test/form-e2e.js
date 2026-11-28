// 文字族 e2e（PAGE-FORM-PLAN §4.6.2 / §4.6.12，S1）
// 覆盖 /archives/ 三级、/tags/、/categories/：页头无 kicker、年份轨道与列表一致、
// 关键词数量与改名文案、无输入控件。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const yaml = require('js-yaml');

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

function hasClass(html, cls) {
  return new RegExp(`class="[^"]*\\b${cls}\\b`).test(html);
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

// ---- S2：项目 / 游戏 / 收藏（PAGE-FORM-PLAN §4.6.3–4.6.5）----
const dataItems = (name) => {
  const file = path.join(ROOT, 'source', '_data', name + '.yml');
  if (!fs.existsSync(file)) return [];
  return ((yaml.load(fs.readFileSync(file, 'utf8')) || {}).items || []).filter((it) => it && it.title);
};
const moduleSlug = (it) => it.slug || encodeURIComponent(String(it.title));

const projectsIndex = read('projects/index.html');
const projectItems = dataItems('projects');

ok(projectsIndex.length > 0, '缺少 /projects/ 产物');
ok(!projectsIndex.includes('page-head-kicker'), '/projects/ 仍带文章壳 kicker');
ok(projectsIndex.includes('<h1 class="pj-title">项目</h1>'), '/projects/ 标题不是「项目」');
ok(/class="stat-band[ "]/.test(projectsIndex), '/projects/ 缺首屏数字带');
ok(count(projectsIndex, /class="pj-card[ "]/g) === projectItems.length,
  `/projects/ 卡片数 ${count(projectsIndex, /class="pj-card[ "]/g)} ≠ 数据 ${projectItems.length}`);
for (const it of projectItems) {
  ok(projectsIndex.includes(`href="/projects/${moduleSlug(it)}/"`), `/projects/ 缺少 ${it.title} 的详情链接`);
}
const projectTagCount = new Set(projectItems.flatMap((it) => it.tags || [])).size;
ok(new RegExp(`<dt>技术栈</dt><dd>${projectTagCount}</dd>`).test(projectsIndex),
  `/projects/ 技术栈数不是去重后的 ${projectTagCount}`);
ok(!/<input\b/i.test(projectsIndex), '/projects/ 出现输入控件');

for (const it of projectItems) {
  const rel = `projects/${moduleSlug(it)}/index.html`;
  const h = read(rel);
  ok(h.length > 0, `缺少 ${rel}`);
  ok(!h.includes('page-head-kicker'), `${rel} 仍带 kicker`);
  ok(hasClass(h, 'cal-crumb'), `${rel} 缺面包屑`);
  ok(hasClass(h, 'pj-facts'), `${rel} 缺属性条`);
  for (const [id, field] of [
    ['background', 'background'],
    ['process', 'process'],
    ['tech', 'tech'],
    ['outcome', 'outcome'],
  ]) {
    const has = Boolean(it[field] && String(it[field]).trim());
    ok((h.includes(`id="sec-${id}"`)) === has,
      `${rel} 的 ${field} 段渲染状态与数据不一致（应为 ${has ? '渲染' : '不渲染'}）`);
  }
  ok(!/<input\b/i.test(h), `${rel} 出现输入控件`);
}

const gamesIndex = read('games/index.html');
const gameItems = dataItems('games');
ok(gamesIndex.length > 0, '缺少 /games/ 产物');
// 不比字面 class：Astro 给带 scoped <style> 的组件插入 data-astro-cid-* 属性（E-180）
ok(/<h1 class="gm-title"[^>]*>游戏<\/h1>/.test(gamesIndex), '/games/ 标题不是「游戏」');
ok(gamesIndex.includes('class="gm-wall"'), '/games/ 不是封面墙');
ok(!gamesIndex.includes('page-head-kicker'), '/games/ 仍带文章壳 kicker');
ok(count(gamesIndex, /class="gm-tile[ "]/g) === gameItems.length,
  `/games/ 瓦片数 ${count(gamesIndex, /class="gm-tile[ "]/g)} ≠ 数据 ${gameItems.length}`);
ok(count(gamesIndex, /class="gm-tile-img"/g) === gameItems.filter((it) => it.cover).length,
  '/games/ 封面数与数据不一致');
ok(count(gamesIndex, /class="gm-status"/g) === gameItems.filter((it) => it.status).length,
  '/games/ 状态角标数与数据不一致');
ok(!/<input\b/i.test(gamesIndex), '/games/ 出现输入控件');

for (const it of gameItems) {
  const rel = `games/${moduleSlug(it)}/index.html`;
  const h = read(rel);
  ok(h.length > 0, `缺少 ${rel}`);
  ok(!h.includes('page-head-kicker'), `${rel} 仍带 kicker`);
  ok(h.includes('class="gm-facts"'), `${rel} 缺属性条`);
  for (const [label, value] of [
    ['平台', it.platform],
    ['类型', it.genre],
    ['状态', it.status],
  ]) {
    if (value) ok(h.includes(`<dt>${label}</dt>`), `${rel} 属性条缺「${label}」`);
  }
  ok(!/<input\b/i.test(h), `${rel} 出现输入控件`);
}

const collectionsIndex = read('collections/index.html');
const collectionItems = dataItems('collections');
ok(collectionsIndex.length > 0, '缺少 /collections/ 产物');
ok(collectionsIndex.includes('<h1 class="cl-title">收藏</h1>'), '/collections/ 标题不是「收藏」');
ok(!collectionsIndex.includes('page-head-kicker'), '/collections/ 仍带文章壳 kicker');
ok(count(collectionsIndex, /class="cl-card"/g) === collectionItems.length,
  `/collections/ 卡片数 ${count(collectionsIndex, /class="cl-card"/g)} ≠ 数据 ${collectionItems.length}`);
ok(!collectionsIndex.includes('module-grid'), '/collections/ 仍在铺空网格');
ok(!/<input\b/i.test(collectionsIndex), '/collections/ 出现输入控件');
const clCards = collectionsIndex.match(/<(?:a|div) class="cl-card"[^>]*>/g) || [];
for (const tag of clCards) {
  if (tag.startsWith('<a') && /href="https?:\/\//.test(tag)) {
    ok(tag.includes('target="_blank"') && tag.includes('rel="noopener"'),
      '收藏外链卡缺 target=_blank / rel=noopener');
  }
}

// ---- S3：关于 / 友链（作者档案页 Author Dossier + 首页 About Me 同源校验）----
const aboutIndex = read('about/index.html');
const homeIndexHtml = read('index.html');
const postFiles = fs
  .readdirSync(path.join(ROOT, 'source', '_posts'))
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'));
const postYears = postFiles
  .map((f) => {
    const raw = fs.readFileSync(path.join(ROOT, 'source', '_posts', f), 'utf8');
    const m = /^date:\s*(\d{4})/m.exec(raw);
    return m ? m[1] : '';
  })
  .filter(Boolean);
const sinceYear = postYears.length ? String(Math.min(...postYears.map(Number))) : '—';
const aboutSource = fs.readFileSync(path.join(ROOT, 'source', 'about', 'index.md'), 'utf8');
const aboutFmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(aboutSource);
const aboutFm = aboutFmMatch ? yaml.load(aboutFmMatch[1]) || {} : {};
const aboutPillars = Array.isArray(aboutFm.pillars) ? aboutFm.pillars : [];
const aboutParagraphs = aboutSource
  .replace(/^---[\s\S]*?---\r?\n/, '')
  .split(/\r?\n\s*\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

ok(aboutIndex.length > 0, '缺少 /about/ 产物');
ok(!aboutIndex.includes('page-head-kicker'), '/about/ 仍带文章壳 kicker');
ok(/class="ab-name[ "]/.test(aboutIndex), '/about/ 缺身份署名标题');
ok(aboutIndex.includes('id="ab-bg-canvas"'), '/about/ 缺底层程序化经纬画布');
ok(aboutIndex.includes('id="ab-specimen-canvas"'), '/about/ 缺标志性变形几何图腾画布');
ok(aboutIndex.includes('class="ab-metrics-list"'), '/about/ 缺巨型数字标尺');
ok(count(aboutIndex, /class="ab-metric-item"/g) === 4, '/about/ 数字标尺不是四项');
ok(new RegExp(`<dt>文字</dt>\\s*<dd[^>]*>\\s*${postFiles.length} 篇\\s*</dd>`).test(aboutIndex),
  `/about/ 文章数不是现算的 ${postFiles.length} 篇`);
ok(new RegExp(`<dt>项目</dt>\\s*<dd[^>]*>\\s*${projectItems.length} 个\\s*</dd>`).test(aboutIndex),
  `/about/ 项目数不是现算的 ${projectItems.length} 个`);
ok(new RegExp(`<dt>游戏与赛事</dt>\\s*<dd[^>]*>\\s*${gameItems.length} \\+ 2\\s*</dd>`).test(aboutIndex),
  `/about/ 游戏与赛事不是现算的 ${gameItems.length} + 2`);
ok(new RegExp(`<dt>建站</dt>\\s*<dd[^>]*>\\s*${sinceYear}\\s*</dd>`).test(aboutIndex),
  `/about/ 建站年份不是最早文章的 ${sinceYear}`);
ok(aboutIndex.includes('data-copy="'), '/about/ 复制邮箱图标回归（缺 data-copy）');
ok(aboutIndex.includes('qr-trigger'), '/about/ 二维码图标回归（缺 qr-trigger）');
ok(aboutIndex.includes('class="qr-img"'), '/about/ 二维码结构回归（缺 qr-img）');
ok(aboutIndex.includes('id="ab-qr-dialog"'), '/about/ 缺微信二维码原生 dialog');
ok(aboutPillars.length === 3, `/about/ 主线数据源 pillars 应为 3 条（实际 ${aboutPillars.length}）`);
ok(count(aboutIndex, /data-ab-jump="/g) === aboutPillars.length,
  `/about/ 章节跳转数 ≠ pillars 数量 ${aboutPillars.length}`);
ok(count(aboutIndex, /data-ab-chapter="/g) === aboutPillars.length,
  `/about/ 叙事章节数 ≠ pillars 数量 ${aboutPillars.length}`);
aboutPillars.forEach((p, idx) => {
  ok(aboutIndex.includes(p.line), `/about/ 缺少第 ${idx + 1} 条主线文案：${p.line}`);
  ok(homeIndexHtml.includes(p.line), `首页缺少第 ${idx + 1} 条主线文案（与 /about/ 失同步）：${p.line}`);
});
ok(!aboutIndex.includes('考研'), '/about/ 仍残留过时的「考研」文案');
ok(!aboutIndex.includes('热爱健身'), '/about/ 仍残留旧版口语化文案');
ok(!aboutIndex.includes('屏幕之外'), '/about/ 仍残留已删除的「屏幕之外」文案');
ok(aboutIndex.includes('Be water, my friend.'), '/about/ 缺原版引言 Be water, my friend.');
ok(/class="ab-now-more" href="\/now\/"/.test(aboutIndex), '/about/ 缺 /now/ 出口');
ok(!/<input\b/i.test(aboutIndex), '/about/ 出现输入控件');

const linksIndex = read('links/index.html');
const themeLinks = (yaml.load(
  fs.readFileSync(path.join(ROOT, 'themes', 'fluid', '_config.yml'), 'utf8')
) || {}).links || {};
const linkItems = (themeLinks.items || []).filter((it) => it && it.title && it.link);

ok(linksIndex.length > 0, '缺少 /links/ 产物');
ok(!linksIndex.includes('page-head-kicker'), '/links/ 仍带文章壳 kicker');
ok(!linksIndex.includes('共 0 个'), '/links/ 仍在显示「共 0 个」');
ok(!linksIndex.includes('module-grid'), '/links/ 仍在使用旧 module-grid');
ok(!/<input\b/i.test(linksIndex), '/links/ 出现输入控件');
if (linkItems.length === 0) {
  ok(linksIndex.includes('class="lk-exchange"'), '/links/ 0 条时缺「交换链接」信息卡');
  ok(!linksIndex.includes('class="lk-wall"'), '/links/ 0 条时仍在铺空链接墙');
  ok(linksIndex.includes('/atom.xml'), '/links/ 0 条时缺 RSS 入口');
} else {
  ok(count(linksIndex, /class="lk-card"/g) === linkItems.length,
    `/links/ 卡片数 ${count(linksIndex, /class="lk-card"/g)} ≠ 数据 ${linkItems.length}`);
  const lkCards = linksIndex.match(/<a class="lk-card"[^>]*>/g) || [];
  for (const tag of lkCards) {
    ok(tag.includes('target="_blank"') && tag.includes('rel="noopener"'),
      '友链卡缺 target=_blank / rel=noopener');
  }
}

// ---- S4：节日详情 12 页（PAGE-FORM-PLAN §4.6.8）----
// 只换页头：无 kicker / 无 page-head，面包屑 + 标题 + 一句导语 + 属性条 + 四格日期带；
// 正文两栏、目录、进度环、12 节日导航条保持原样。四格逐格与数据文件现算比对。
const festYml = yaml.load(fs.readFileSync(path.join(ROOT, 'source', '_data', 'festivals.yml'), 'utf8')) || {};
const holYml = yaml.load(fs.readFileSync(path.join(ROOT, 'source', '_data', 'holidays.yml'), 'utf8')) || {};

const FEST_MAP = {
  yuandan: ['holidays', 'yuandan'],
  chunjie: ['holidays', 'chunjie'],
  qingming: ['holidays', 'qingming'],
  duanwu: ['holidays', 'duanwu'],
  zhongqiu: ['holidays', 'zhongqiu'],
  guoqing: ['holidays', 'guoqing'],
  yuanxiao: ['festivals', '元宵节'],
  qixi: ['festivals', '七夕节'],
  zhongyuan: ['festivals', '中元节'],
  chongyang: ['festivals', '重阳节'],
  dongzhi: ['festivals', '冬至'],
  laba: ['festivals', '腊八节'],
};

const pad2 = (n) => (n < 10 ? '0' + n : String(n));
function keyOf(v) {
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`;
  }
  const m = String(v == null ? '' : v).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}` : '';
}
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function weekdayOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  return WEEK_CN[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

const festivalYears = (holYml.years || []).filter((y) => y && y.official === true);
const fsCur = Math.max(...festivalYears.map((y) => y.year));
const fsCurEntry = (holYml.years || []).find((y) => y && y.year === fsCur);
const fsRowCount = (holYml.years || []).filter((y) => y && y.year >= fsCur).length;
const festNames = {};
(festYml.festivals || []).forEach((it) => {
  if (it && it.key) festNames[it.key] = it.name || '';
});

Object.keys(FEST_MAP).forEach((s) => {
  const rel = `library/${s}/`;
  const h = read(rel + 'index.html');
  ok(h.length > 0, `缺少 ${rel} 产物`);
  if (!h) return;

  ok(!h.includes('page-head'), `${rel} 仍是文章壳（page-head）`);
  ok(hasClass(h, 'fc-head'), `${rel} 缺节日档案头`);
  ok(hasClass(h, 'fc-title'), `${rel} 缺档案头标题`);
  ok(h.includes(festNames[s]), `${rel} 标题不是数据里的「${festNames[s]}」`);
  ok(hasClass(h, 'cal-crumb'), `${rel} 缺面包屑`);
  ok(hasClass(h, 'fc-meta'), `${rel} 缺属性条`);
  ok(!/<input\b/i.test(h), `${rel} 出现输入控件`);

  const bandAt = h.indexOf('fc-stats');
  const band = bandAt === -1 ? '' : h.slice(bandAt, h.indexOf('</dl>', bandAt));
  const cells = Array.from(band.matchAll(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/g)).map((m) => [m[1], m[2]]);
  ok(cells.length === 4, `${rel} 日期带不是四格（实际 ${cells.length}）`);

  const [src, lookup] = FEST_MAP[s];
  const rec = src === 'holidays'
    ? (fsCurEntry.holidays || []).find((r) => r && r.id === lookup)
    : (fsCurEntry.festivals || []).find((r) => r && r.name === lookup);
  ok(!!rec, `${rel} 在 ${fsCur} 年数据里取不到「${lookup}」`);
  if (rec) {
    const key = keyOf(rec.date);
    const [, mm, dd] = key.split('-').map(Number);
    const expect = [
      [`${fsCur} 年（${weekdayOf(key)}）`, `${mm} 月 ${dd} 日`],
      ['农历', (fsCurEntry.lunar && fsCurEntry.lunar[key]) || '—'],
      ['放假', src === 'holidays' ? `${Number(rec.days) || 0} 天` : '不放假'],
      ['收录年份', `${fsRowCount} 年`],
    ];
    expect.forEach(([label, value], i) => {
      ok(cells[i] && cells[i][0] === label && cells[i][1] === value,
        `${rel} 第 ${i + 1} 格应为「${label} / ${value}」，实际「${(cells[i] || []).join(' / ')}」`);
    });
  }

  ok(h.includes('class="fs-toc"') && h.includes('class="fs-nav-strip"'),
    `${rel} 目录 / 12 节日导航条回归`);
  ok(/<section class="fs-section" id="sec-/.test(h), `${rel} 正文章节回归`);
  ok(h.includes('fsProgressRing') && /festival\.js\?v=/.test(h), `${rel} 进度环 / 脚本回归`);
});

// ---- S6：/search/、/zodiac/ 用 pg-hd 通用页头，/now/ 用零边框编辑长卷页头，/404/ 保留 ----
['search/index.html', 'zodiac/index.html'].forEach((rel) => {
  const h = read(rel);
  ok(h.length > 0, `缺少 ${rel} 产物`);
  if (!h) return;
  ok(!h.includes('page-head'), `${rel} 仍挂 page-head`);
  ok(!h.includes('page-head-kicker'), `${rel} 仍有文章壳 kicker`);
  ok(/class="pg-hd[ "]/.test(h), `${rel} 缺 pg-hd 页头`);
  ok(/class="pg-hd-title[ "]/.test(h), `${rel} 缺页头标题`);
});

ok(!read('search/index.html').includes('>SEARCH<'), '/search/ 仍输出 SEARCH kicker 文案');
const zodiacNoWatermark = read('zodiac/index.html').replace(
  /<[^>]*class="[^"]*\bab-watermark\b[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/g,
  ''
);
ok(!zodiacNoWatermark.includes('>ZODIAC<'), '/zodiac/ 仍输出 ZODIAC kicker 文案');
ok(count(read('search/index.html'), /<input\b/gi) === 1, '/search/ 搜索框数量应为 1');
ok(count(read('now/index.html'), /<input\b/gi) === 0, '/now/ 出现输入控件');
ok(count(read('zodiac/index.html'), /<input\b/gi) === 0, '/zodiac/ 出现输入控件');

const nowHtml = read('now/index.html');
ok(nowHtml.length > 0, '缺少 now/index.html 产物');
ok(!nowHtml.includes('page-head'), '/now/ 仍挂 page-head');
ok(nowHtml.includes('class="nw-hero"'), '/now/ 缺编辑页头 nw-hero');
ok(nowHtml.includes('class="nw-timeline"'), '/now/ 缺阶段快照时间轴 nw-timeline');
ok(nowHtml.includes('Antigravity'), '/now/ 缺 AI 协作里的 Antigravity');
ok(!nowHtml.includes('考研'), '/now/ 仍残留过时的「考研」文案');
ok(!nowHtml.includes('不追更'), '/now/ 仍残留已否决的「不追更」文案');
ok(nowHtml.includes('about-body') && nowHtml.includes('markdown-body'),
  '/now/ 正文轨丢失（about-body / markdown-body）');
ok(/img-lazyload\.js/.test(nowHtml), '/now/ 丢失 markdown 运行时插件');

const notFound = read('404.html');
ok(notFound.length > 0, '缺少 404.html 产物');
ok(notFound.includes('class="page-head"') && notFound.includes('page-head-kicker'),
  '404 的 kicker 被误删（状态码页应保留）');
ok(notFound.includes('>404<'), '404 kicker 文案不是 404');

console.log(`\nRESULT: ${pass} 项断言通过${fail ? '，存在失败' : ''}`);
process.exit(fail ? 1 : 0);
