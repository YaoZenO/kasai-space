'use strict';
// 搜索索引与搜索页断言（PLAN-V3 §4 / P3）。
//
// 这套机制最容易悄悄坏的地方是「索引少了一类内容」——旧 local-search 就是这样，
// 只索引文章和 Markdown 页，600+ 资料页一条都进不去，而构建不报任何错。
// 所以这里按类型逐一核对数量，并且逐条验证 URL 确实有产物，防止死链。
//
// 依赖 public/ 已构建（npm test 的其它套件同样如此）。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, process.env.SITE_OUT || 'dist');
const INDEX = path.join(PUBLIC, 'search-index.json');

// 城市条数从数据现算，不写死：cities.yml 会随城市合并/新增变动，
// 硬编码会在每次数据改动后假红（2026-11-14 县/镇并入上级市时踩到）。
const CITY_COUNT = (yaml.load(fs.readFileSync(path.join(ROOT, 'source', '_data', 'cities.yml'), 'utf8')).cities || []).length;

let pass = 0;
function ok(name, fn) {
  try {
    fn();
    pass += 1;
    console.log('  PASS ' + name);
  } catch (e) {
    console.error('  FAIL ' + name);
    console.error('       ' + (e && e.message));
    process.exitCode = 1;
  }
}

if (!fs.existsSync(INDEX)) {
  console.error('  FAIL 找不到 public/search-index.json —— 先跑一次 npm run build');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const items = Array.isArray(data.items) ? data.items : [];
const byType = {};
items.forEach((i) => { byType[i.c] = (byType[i.c] || 0) + 1; });

ok('S1 索引条数与内容一致（count 字段与实际条目数相同）', () => {
  assert.strictEqual(data.count, items.length);
});

ok('S2 规模：索引覆盖全站，不再只有文章', () => {
  // 至少要把「全部城市 + 全部榜单」收进去，才算覆盖了资料页而不只是文章。
  assert.ok(items.length >= CITY_COUNT + (byType.rank || 0),
    '索引只有 ' + items.length + ' 条（城市 ' + CITY_COUNT + ' + 榜单 ' + (byType.rank || 0) + '），疑似某类页面没被收录');
});

ok('S3 全站十一类内容全部在列', () => {
  ['post', 'project', 'game', 'collection', 'page', 'city', 'rank', 'zodiac', 'festival', 'holiday', 'topic'].forEach((c) => {
    assert.ok((byType[c] || 0) > 0, '缺少类型 ' + c);
  });
});

ok('S4 数量对得上：城市与数据条数一致 · 生肖 12 · 节日 12 · 节假日 16', () => {
  assert.strictEqual(byType.city, CITY_COUNT,
    '索引城市条数 ' + byType.city + ' 与 cities.yml 的 ' + CITY_COUNT + ' 不符——有城市漏收或重复');
  assert.strictEqual(byType.zodiac, 12);
  assert.strictEqual(byType.festival, 12);
  assert.strictEqual(byType.holiday, 16);
});

ok('S5 URL 不含 index.html（规范成目录形式）', () => {
  const bad = items.filter((i) => /index\.html/.test(i.u));
  assert.strictEqual(bad.length, 0, '发现 ' + bad.length + ' 条带 index.html：' + bad.slice(0, 3).map((i) => i.u).join(', '));
});

ok('S6 没有重复 URL（同一页只出现一次）', () => {
  const seen = {};
  const dup = [];
  items.forEach((i) => {
    if (seen[i.u]) dup.push(i.u);
    seen[i.u] = 1;
  });
  assert.strictEqual(dup.length, 0, '重复：' + dup.slice(0, 5).join(', '));
});

ok('S7 每条 URL 都有对应产物（防死链）', () => {
  const missing = [];
  items.forEach((i) => {
    let u = String(i.u || '').split('#')[0];
    if (!u) { missing.push('(空)'); return; }
    let rel = u.replace(/^\//, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const fp = path.join(PUBLIC, rel);
    if (!fs.existsSync(fp)) missing.push(i.u);
  });
  assert.strictEqual(missing.length, 0, '缺产物 ' + missing.length + ' 条：' + missing.slice(0, 5).join(', '));
});

ok('S8 城市条目带拼音别名（支持 shenzhen 这类查询）', () => {
  const sz = items.find((i) => i.u === '/city/shenzhen/');
  assert.ok(sz, '索引里找不到深圳');
  assert.ok(sz.k && /shenzhen/i.test(sz.k), '深圳的拼音别名缺失或不对：' + sz.k);
});

ok('S9 搜索页产物存在且带索引脚本', () => {
  const page = path.join(PUBLIC, 'search', 'index.html');
  assert.ok(fs.existsSync(page), '缺少 /search/ 页面');
  const html = fs.readFileSync(page, 'utf8');
  assert.ok(html.indexOf('site-search.js') >= 0, '搜索页没有挂 site-search.js');
  assert.ok(html.indexOf('sr-input') >= 0, '搜索页缺少输入框');
});

ok('S10 旧机制已彻底下线（弹窗、local-search.js、local-search.xml）', () => {
  const home = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  assert.ok(home.indexOf('modalSearch') < 0, '首页仍有搜索弹窗 DOM');
  assert.ok(home.indexOf('local-search.js') < 0, '首页仍在加载 local-search.js');
  assert.ok(!fs.existsSync(path.join(PUBLIC, 'local-search.xml')), '旧的 local-search.xml 仍在产出');
});

ok('S11 导航搜索入口指向 /search/', () => {
  const home = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const m = home.match(/id="search-btn"[^>]*href="([^"]+)"/);
  assert.ok(m, '导航里找不到搜索按钮');
  assert.strictEqual(m[1], '/search/');
});

ok('S12 体积可控（索引不超过 300KB）', () => {
  const kb = fs.statSync(INDEX).size / 1024;
  assert.ok(kb < 300, '索引 ' + kb.toFixed(1) + 'KB，超出预算');
});

console.log('\nRESULTS: ' + pass + ' 项断言通过');
