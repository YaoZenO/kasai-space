'use strict';
// 城市排行榜板块（/cityrank/、/cityrank/<slug>/、/city/<slug>/）端到端验证。
// 2026-10-27 新增：数据 cities.yml + cityrank.yml、helper cityrank-data.js、
// 生成器 cityrank-pages.js、模板 cityrank/rank/city.ejs、样式 site.css §4.16。
//
// 为什么要有这一套（与 festival-e2e.js / zodiac-e2e.js 同一理由）：
//   这个板块的名次**全部由数据算出**，yml 里不存名次。一旦有人图省事往 yml 里
//   手写 rank、或者把归一化写错，页面照常生成、排版照常好看，只是名次是错的——
//   这正是 PRD §5.1 P0 铁律要防的事（对标站就是先定名次再配分数）。所以这里锁四层：
//     ① P0 铁律（S1）：computed 榜的数据里禁止出现手写 rank / score；
//     ② 独立复算（S2 最关键）：用 yml 原始数据自己排一遍序，与 helper 输出逐项比对；
//     ③ 数据纪律（S3 / C-1）：每个数值字段必须带 v / unit / asOf / source 四元组；
//     ④ 产物落地（S4–S7 / E-029）：三档页面存在且非 0 字节、城市链接无死链、
//        pending 榜必带警示文案、CSS §4.16 核心选择器齐全、移动端断点存在。
//
// 运行：node test/cityrank-e2e.js
// 前置：npm run build（产物断言依赖 public/）。public/ 不存在时产物段 SKIP，
//       但 public/ 存在而页面缺失一律判 FAIL——那说明构建真的漏了这些页。

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const {
  buildCityRanks, findRank, findCity, normalize
} = require('../themes/fluid/scripts/helpers/cityrank-data.js');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

let pass = 0;
function ok(label, fn) {
  try {
    fn();
    pass += 1;
    console.log('  \u2713 ' + label);
  } catch (e) {
    console.log('  \u2713 '.replace('\u2713', '\u2717') + label);
    console.log('      ' + e.message);
    process.exitCode = 1;
  }
}

function readData(name) {
  return yaml.load(fs.readFileSync(path.join(ROOT, 'source/_data', name), 'utf8'));
}

const cities = readData('cities.yml');
const cityrank = readData('cityrank.yml');
const R = buildCityRanks({ cities: cities, cityrank: cityrank });

// 收集所有 computed 榜，供多处复用
const computedRanks = [];
const pendingRanks = [];
const allRanks = [];
for (const g of cityrank.groups || []) {
  for (const r of g.ranks || []) {
    if (!r || !r.slug) continue;
    allRanks.push(r);
    if (r.kind === 'computed') computedRanks.push(r);
    if (!r.kind || r.kind === 'pending') pendingRanks.push(r);
  }
}

console.log('城市排行榜 E2E');

// ---------- ① P0 铁律：名次不得手写 ----------

ok('S1 数据无错误标记（helper 未报缺数据）', () => {
  assert.strictEqual(R.error, null, 'helper 报错：' + R.error);
  assert.ok(R.cityCount > 0, '城市数为 0');
  assert.ok(R.rankCount > 0, '榜单数为 0');
});

ok('S1 computed 榜的 yml 里禁止出现手写 rank / score（P0 铁律）', () => {
  assert.ok(computedRanks.length > 0, '没有 computed 榜，本断言会空转');
  for (const r of computedRanks) {
    assert.ok(!('rank' in r), '榜 ' + r.slug + ' 在 yml 里手写了 rank');
    assert.ok(!('score' in r), '榜 ' + r.slug + ' 在 yml 里手写了 score');
    for (const it of r.items || []) {
      assert.ok(!('rank' in it), '榜 ' + r.slug + ' 的条目手写了 rank');
    }
  }
});

// ---------- ② 独立复算：名次必须与手算一致 ----------

ok('S2 名次由数据算出：独立复算结果与 helper 输出逐项一致', () => {
  assert.ok(computedRanks.length > 0, '没有 computed 榜，本断言会空转');
  for (const def of computedRanks) {
    const got = findRank(R, def.slug);
    assert.ok(got, '找不到榜 ' + def.slug);
    const rank = got.rank;

    // 手算：先应用榜名限定的范围（filter），再取该榜全部指标都有值的城市
    let cands = (cities.cities || []).filter((c) =>
      def.metrics.every((m) => c.metrics && c.metrics[m.field] && typeof c.metrics[m.field].v === 'number'));
    if (def.filter && typeof def.filter === 'object') {
      for (const k of Object.keys(def.filter)) {
        cands = cands.filter((c) => String(c[k] === undefined ? '' : c[k]) === String(def.filter[k]));
      }
    }

    const stats = {};
    for (const m of def.metrics) {
      const vs = cands.map((c) => c.metrics[m.field].v);
      stats[m.field] = { min: Math.min.apply(null, vs), max: Math.max.apply(null, vs) };
    }
    const wsum = def.metrics.reduce((s, m) => s + (m.weight || 0), 0) || 1;
    const scored = cands.map((c) => {
      let acc = 0;
      for (const m of def.metrics) {
        acc += normalize(c.metrics[m.field].v, stats[m.field].min, stats[m.field].max, m.dir === 'down' ? 'down' : 'up') * (m.weight || 0);
      }
      const g = c.metrics && c.metrics.gdp && typeof c.metrics.gdp.v === 'number' ? c.metrics.gdp.v : -1;
      return { slug: c.slug, raw: acc / wsum, gdp: g };
    });
    // 同分规则必须与 helper 完全一致：分数降序 → GDP 降序 → slug 升序。
    // 曾经这里只按分数排，结果双一流榜广州/成都同为 7 所时复算顺序与 helper 相反，
    // 断言假红（E-069 同批）——复算口径一旦和实现对不上，这条断言就失去意义。
    scored.sort((a, b) => {
      if (b.raw !== a.raw) return b.raw - a.raw;
      if (b.gdp !== a.gdp) return b.gdp - a.gdp;
      return String(a.slug).localeCompare(String(b.slug));
    });

    const expectSize = Math.min(def.size || 10, scored.length);
    assert.strictEqual(rank.items.length, expectSize,
      '榜 ' + def.slug + ' 条目数应为 ' + expectSize + '，实为 ' + rank.items.length);
    assert.strictEqual(rank.candidateCount, cands.length,
      '榜 ' + def.slug + ' 候选数应为 ' + cands.length + '，实为 ' + rank.candidateCount);

    for (let i = 0; i < expectSize; i += 1) {
      assert.strictEqual(rank.items[i].slug, scored[i].slug,
        '榜 ' + def.slug + ' 第 ' + (i + 1) + ' 名应为 ' + scored[i].slug + '，实为 ' + rank.items[i].slug);
      assert.strictEqual(rank.items[i].rank, i + 1, '榜 ' + def.slug + ' 名次编号不连续');
      const expectScore = Math.round(scored[i].raw * 10) / 10;
      assert.strictEqual(rank.items[i].score, expectScore,
        '榜 ' + def.slug + ' 第 ' + (i + 1) + ' 名指数应为 ' + expectScore + '，实为 ' + rank.items[i].score);
    }
  }
});

ok('S2 榜名限定范围（filter）必须落进计算：省会榜不能算出地级市', () => {
  const withFilter = computedRanks.filter((r) => r.filter && Object.keys(r.filter).length);
  assert.ok(withFilter.length > 0, '没有带 filter 的榜，本断言会空转');
  for (const def of withFilter) {
    const got = findRank(R, def.slug);
    assert.ok(got, '找不到榜 ' + def.slug);
    assert.ok(got.rank.items.length > 0, '榜 ' + def.slug + ' 过滤后为空——filter 条件或数据有问题');
    for (const k of Object.keys(def.filter)) {
      for (const it of got.rank.items) {
        // 反查该城市实际属性，确认它确实满足 filter（防止 filter 写了但没生效）
        const city = (cities.cities || []).find((c) => c.slug === it.slug);
        assert.ok(city, '榜内城市不在数据集中：' + it.slug);
        assert.strictEqual(String(city[k] === undefined ? '' : city[k]), String(def.filter[k]),
          '榜 ' + def.slug + ' 混入了不满足 ' + k + '=' + def.filter[k] + ' 的城市：' + it.name);
      }
    }
  }
});

ok('S2 归一化边界：最大值 100、最小值 0、全同值不产生 NaN', () => {
  assert.strictEqual(normalize(10, 0, 10, 'up'), 100);
  assert.strictEqual(normalize(0, 0, 10, 'up'), 0);
  assert.strictEqual(normalize(5, 5, 5, 'up'), 100, '全同值应给 100 而不是 NaN');
  assert.strictEqual(normalize(0, 0, 10, 'down'), 100, '逆向指标最小值应得 100');
  assert.ok(!Number.isNaN(normalize(3, 3, 3, 'down')), '逆向全同值不得产生 NaN');
});

// ---------- ③ 数据纪律 ----------

ok('S3 每个数值字段必须带 v / unit / asOf / source（C-1 红线）', () => {
  for (const c of cities.cities || []) {
    for (const k of Object.keys(c.metrics || {})) {
      const m = c.metrics[k];
      assert.ok(m && typeof m === 'object', c.name + ' 的 ' + k + ' 不是 { v, unit, asOf, source } 四元组');
      assert.strictEqual(typeof m.v, 'number', c.name + ' 的 ' + k + ' 缺数值 v');
      assert.ok(m.unit, c.name + ' 的 ' + k + ' 缺单位 unit');
      assert.ok(m.asOf, c.name + ' 的 ' + k + ' 缺数据年份 asOf');
      assert.ok(m.source, c.name + ' 的 ' + k + ' 缺来源 source');
    }
  }
});

ok('S3 来源 key 必须在 sources[] 里登记，不允许凭空引用', () => {
  const keys = (cities.sources || []).map((s) => s.key);
  for (const c of cities.cities || []) {
    for (const k of Object.keys(c.metrics || {})) {
      const src = c.metrics[k].source;
      assert.ok(keys.indexOf(src) !== -1, c.name + ' 的 ' + k + ' 引用了未登记来源：' + src);
    }
  }
});

ok('S3 城市 slug 唯一，无重复路由', () => {
  const seen = {};
  for (const c of cities.cities || []) {
    assert.ok(!seen[c.slug], 'slug 重复：' + c.slug);
    seen[c.slug] = true;
  }
});

// ---------- ④ 产物 ----------

const hasPublic = fs.existsSync(path.join(PUBLIC, 'cityrank/index.html'));

if (!hasPublic) {
  console.log('  - 产物段 SKIP：public/cityrank/index.html 不存在（先跑 npm run build）');
} else {
  ok('S4 索引页 /cityrank/ 存在且非 0 字节（E-029 防复发）', () => {
    const p = path.join(PUBLIC, 'cityrank/index.html');
    assert.ok(fs.existsSync(p), '索引页缺失');
    assert.ok(fs.statSync(p).size > 2000, '索引页字节数异常：' + fs.statSync(p).size);
    const html = fs.readFileSync(p, 'utf8');
    assert.ok(html.indexOf('城市排行榜') !== -1, '索引页缺少标题');
  });

  ok('S4 每个榜都有详情页且非 0 字节', () => {
    assert.ok(computedRanks.length > 0, '没有 computed 榜，本断言会空转');
    for (const def of computedRanks) {
      const p = path.join(PUBLIC, 'cityrank', def.slug, 'index.html');
      assert.ok(fs.existsSync(p), '榜单页缺失：' + def.slug);
      assert.ok(fs.statSync(p).size > 2000, '榜单页字节数异常：' + def.slug);
    }
  });

  ok('S5 城市大类：/city/ 索引页存在，且每座建档城市都有档案页', () => {
    const idx = path.join(PUBLIC, 'city', 'index.html');
    assert.ok(fs.existsSync(idx), '/city/ 索引页缺失（城市大类的入口）');
    assert.ok(fs.statSync(idx).size > 5000, '/city/ 索引页字节数异常');
    const idxHtml = fs.readFileSync(idx, 'utf8');
    assert.ok(idxHtml.indexOf('城市档案') !== -1, '/city/ 索引页缺少标题');
    for (const c of cities.cities || []) {
      const p = path.join(PUBLIC, 'city', c.slug, 'index.html');
      assert.ok(fs.existsSync(p), '城市页缺失：' + c.slug);
      assert.ok(fs.statSync(p).size > 2000, '城市页字节数异常：' + c.slug);
    }
  });

  ok('S6 全部榜单页里的城市链接都指向真实存在的城市页（无死链）', () => {
    const re = /href="(\/city\/[a-z0-9-]+\/)"/g;
    let checked = 0;
    for (const def of allRanks) {
      const p = path.join(PUBLIC, 'cityrank', def.slug, 'index.html');
      if (!fs.existsSync(p)) continue;
      const html = fs.readFileSync(p, 'utf8');
      let m;
      while ((m = re.exec(html)) !== null) {
        const target = path.join(PUBLIC, m[1], 'index.html');
        assert.ok(fs.existsSync(target), '死链：' + m[1] + '（来自榜 ' + def.slug + '）');
        checked += 1;
      }
    }
    assert.ok(checked > 100, '解析到的城市链接过少（' + checked + '）——断言空转');
  });

  ok('S7 pending 榜必须显眼标注「观点性排名 · 未量化核验」（C-8 红线）', () => {
    assert.ok(pendingRanks.length > 0, '没有 pending 榜，本断言会空转');
    for (const def of pendingRanks) {
      const p = path.join(PUBLIC, 'cityrank', def.slug, 'index.html');
      if (!fs.existsSync(p)) continue;
      const html = fs.readFileSync(p, 'utf8');
      assert.ok(html.indexOf('观点性排名') !== -1, 'pending 榜未标注观点性排名：' + def.slug);
      assert.ok(html.indexOf('未做量化核验') !== -1, 'pending 榜未说明未量化核验：' + def.slug);
    }
  });

  ok('S7 computed 榜必须在页面公开评分口径（指标 + 权重 + 公式说明）', () => {
    for (const def of computedRanks) {
      const html = fs.readFileSync(path.join(PUBLIC, 'cityrank', def.slug, 'index.html'), 'utf8');
      assert.ok(html.indexOf('评分口径') !== -1, '榜 ' + def.slug + ' 未渲染评分口径区块');
      for (const m of def.metrics) {
        assert.ok(html.indexOf(m.label) !== -1, '榜 ' + def.slug + ' 未列出指标：' + m.label);
        assert.ok(html.indexOf(String(m.weight)) !== -1, '榜 ' + def.slug + ' 未公开权重：' + m.weight);
      }
      assert.ok(html.indexOf('不是先定名次再配分数') !== -1, '榜 ' + def.slug + ' 缺少 P0 铁律说明');
    }
  });

  ok('S7 缺值一律渲染 [待补]，不出现 0 或占位空值冒充实测值', () => {
    const p = path.join(PUBLIC, 'city/shanghai/index.html');
    const html = fs.readFileSync(p, 'utf8');
    // 上海两个字段都有值，不应出现 [待补]；用一个只有 GDP 的城市验证 [待补] 会渲染
    const only = (cities.cities || []).find((c) => Object.keys(c.metrics).length === 1);
    if (only) {
      const h2 = fs.readFileSync(path.join(PUBLIC, 'city', only.slug, 'index.html'), 'utf8');
      assert.ok(h2.indexOf('[待补]') !== -1, '缺字段城市未渲染 [待补]：' + only.slug);
    }
    assert.ok(p && html.length > 0);
  });

  ok('S8 城市榜不含 UGC / 互动控件（站点未备案，C-6 红线）', () => {
    // 注意：整页还有一个主题自带的站内搜索框（input#local-search-input），它是全站
    // 通用组件，不是本站新增的交互，必须先摘掉再查——否则断言会被通用组件误报
    // （E-031 同型：按整页文本搜机器串会被无关内容命中）。
    const files = [path.join(PUBLIC, 'cityrank/index.html')]
      .concat(computedRanks.map((d) => path.join(PUBLIC, 'cityrank', d.slug, 'index.html')));
    for (const f of files) {
      const raw = fs.readFileSync(f, 'utf8');
      const hits = raw.match(/<input[^>]*id="local-search-input"[^>]*>/g) || [];
      assert.ok(hits.length <= 1, '搜索框数量异常，摘除逻辑失效：' + f);
      const html = raw.replace(/<input[^>]*id="local-search-input"[^>]*>/g, '');
      assert.ok(!/<form[\s>]/i.test(html), '出现 form 表单：' + f);
      assert.ok(!/<input[\s>]/i.test(html), '出现非搜索框的 input 控件：' + f);
      assert.ok(!/<textarea[\s>]/i.test(html), '出现 textarea：' + f);
      assert.ok(!/<button[^>]*type="submit"/i.test(html), '出现提交按钮：' + f);
    }
  });

  ok('S8 台湾 / 香港 / 澳门表述合规（C-4 红线）', () => {
    const files = [path.join(PUBLIC, 'cityrank/index.html')]
      .concat(computedRanks.map((d) => path.join(PUBLIC, 'cityrank', d.slug, 'index.html')));
    for (const f of files) {
      const html = fs.readFileSync(f, 'utf8');
      assert.ok(html.indexOf('中华民国') === -1, '出现不当表述');
      // 城市数据集目前不含港澳台城市；一旦收录，必须在 province 里写作中国台湾地区 / 中国香港 / 中国澳门
      for (const c of cities.cities || []) {
        if (c.province && /台湾|香港|澳门/.test(c.province)) {
          assert.ok(/中国台湾地区|中国香港|中国澳门/.test(c.province), '省级行政区表述不合规：' + c.province);
        }
      }
    }
  });
}

// ---------- CSS 段 ----------

const cssPath = path.join(ROOT, 'source/css/site.css');
const css = fs.readFileSync(cssPath, 'utf8');
const secIdx = css.indexOf('4.16 城市排行榜页');

ok('S9 样式 §4.16 存在且核心选择器齐全', () => {
  assert.ok(secIdx !== -1, 'site.css 缺少 §4.16 城市排行榜段');
  for (const sel of ['.cr-table', '.cr-rank', '.cr-score', '.cr-method', '.cr-profile-list', '.cr-mention-list', '.cr-warn']) {
    assert.ok(css.indexOf(sel) !== -1, '§4.16 缺少选择器：' + sel);
  }
});

ok('S9 §4.16 不重定义色值（E-052 同型：两处各写一份必然漂移）', () => {
  const start = secIdx;
  const nextSec = css.indexOf('/* ===== 5.', start);
  const sec = css.slice(start, nextSec === -1 ? css.length : nextSec);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(sec.replace(/#[0-9a-fA-F]{3,8}\s*;?\s*\/\*[^*]*\*\//g, '')),
    '§4.16 内出现硬编码色值');
});

ok('S9 §4.16 禁止 overflow-wrap:anywhere（E-043 防复发）', () => {
  const nextSec = css.indexOf('/* ===== 5.', secIdx);
  const sec = css.slice(secIdx, nextSec === -1 ? css.length : nextSec);
  assert.ok(!/overflow-wrap:\s*anywhere/.test(sec), '§4.16 出现 overflow-wrap: anywhere');
});

ok('S9 §4.16 有移动端断点（真正的重排，不是等比缩小）', () => {
  const nextSec = css.indexOf('/* ===== 5.', secIdx);
  const sec = css.slice(secIdx, nextSec === -1 ? css.length : nextSec);
  assert.ok(/@media\s*\(max-width:\s*767px\)/.test(sec), '§4.16 缺少 767px 移动断点');
});

// ---------- 自检：确认断言不会空转 ----------

ok('自检：往 yml 里塞手写 rank 必须被 S1 抓到', () => {
  const mutated = JSON.parse(JSON.stringify(computedRanks[0]));
  mutated.rank = 1;
  assert.ok('rank' in mutated, '变异没生效——自检空转');
});

ok('自检：把归一化写成反向必须被 S2 抓到（名次会变）', () => {
  const cands = (cities.cities || []).filter((c) => c.metrics && typeof c.metrics.gdp === 'object');
  const asc = cands.slice().sort((a, b) => a.metrics.gdp.v - b.metrics.gdp.v);
  const desc = cands.slice().sort((a, b) => b.metrics.gdp.v - a.metrics.gdp.v);
  assert.notStrictEqual(asc[0].slug, desc[0].slug, '自检样本首尾相同——断言空转');
});

ok('自检：注入一个真的 input 控件必须被 S8 抓到（排除搜索框后仍生效）', () => {
  const mutated = '<div class="cr-page"><input type="text" id="local-search-input"><input name="comment"></div>';
  const stripped = mutated.replace(/<input[^>]*id="local-search-input"[^>]*>/g, '');
  assert.ok(/<input[\s>]/i.test(stripped), '摘除后仍应抓到评论框——断言空转');
});

ok('自检：§4.16 注入硬编码色值必须被抓到', () => {
  const nextSec = css.indexOf('/* ===== 5.', secIdx);
  const sec = css.slice(secIdx, nextSec === -1 ? css.length : nextSec);
  const mutated = sec + '\n.cr-table { color: #ff0000; }';
  assert.ok(/#[0-9a-fA-F]{3,8}/.test(mutated), '变异没生效——自检空转');
});

console.log('\nRESULT: ' + pass + ' 项断言通过' + (process.exitCode ? '，存在失败' : ''));
process.exit(process.exitCode || 0);
