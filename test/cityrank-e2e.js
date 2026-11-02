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
//        pending 榜页脚保留一条小字免责（主人 2026-11-01 拍板：警示框已删）、
//        CSS §4.16 核心选择器齐全、移动端断点存在。
//
// 运行：node test/cityrank-e2e.js
// 前置：npm run build（产物断言依赖 public/）。public/ 不存在时产物段 SKIP，
//       但 public/ 存在而页面缺失一律判 FAIL——那说明构建真的漏了这些页。

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const {
  buildCityRanks, findRank, findCity, normalize, sortRanks, provinceCode,
  cityHasPage, cityMetricStandings, cityProvinces, provinceSlug
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
        acc += normalize(c.metrics[m.field].v, stats[m.field].min, stats[m.field].max, m.dir === 'down' ? 'down' : 'up', m.scale) * (m.weight || 0);
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

// ---------- ②b 对数刻度（E-081，主人 2026-10-30 拍板）----------

ok('S14 对数刻度：公式、边界与非正值兜底', () => {
  // 对数刻度按倍数定距：min=100 / max=10000 时，几何中点 1000 应落在 50
  assert.strictEqual(normalize(10000, 100, 10000, 'up', 'log'), 100, '对数刻度最大值应为 100');
  assert.strictEqual(normalize(100, 100, 10000, 'up', 'log'), 0, '对数刻度最小值应为 0');
  assert.strictEqual(normalize(1000, 100, 10000, 'up', 'log'), 50, '几何中点应落在 50');
  // 线性刻度下同一个几何中点只有 9.1 —— 这正是「被极端最大值拽走」的量化证明
  assert.strictEqual(Math.round(normalize(1000, 100, 10000, 'up') * 10) / 10, 9.1, '线性刻度下几何中点应为 9.1');
  // 逆向（越小越好）同样支持对数
  assert.strictEqual(normalize(100, 100, 10000, 'down', 'log'), 100, '逆向对数最小值应为 100');
  // 兜底：标了 log 但池内出现非正值，必须回退线性而不是产出 NaN
  assert.ok(!Number.isNaN(normalize(5, -10, 10, 'up', 'log')), '非正值池不得产出 NaN');
  assert.strictEqual(normalize(5, -10, 10, 'up', 'log'), normalize(5, -10, 10, 'up'), '非正值池应回退线性');
});

ok('S14 标了 log 的指标其候选池必须恒为正（否则会静默回退线性）', () => {
  let checked = 0;
  for (const def of computedRanks) {
    const logFields = (def.metrics || []).filter((m) => m.scale === 'log').map((m) => m.field);
    if (!logFields.length) continue;
    let cands = (cities.cities || []).filter((c) =>
      def.metrics.every((m) => c.metrics && c.metrics[m.field] && typeof c.metrics[m.field].v === 'number'));
    if (def.filter && typeof def.filter === 'object') {
      for (const k of Object.keys(def.filter)) {
        cands = cands.filter((c) => String(c[k] === undefined ? '' : c[k]) === String(def.filter[k]));
      }
    }
    for (const f of logFields) {
      const vs = cands.map((c) => c.metrics[f].v);
      const min = Math.min.apply(null, vs);
      assert.ok(min > 0, '榜 ' + def.slug + ' 的 ' + f + ' 标了 log，但候选池最小值是 ' + min +
        '（对数不可用，会静默回退线性）');
      checked += 1;
    }
  }
  assert.ok(checked >= 20, '只校验了 ' + checked + ' 条，断言可能空转');
});

ok('S14 规模量必须走对数刻度：跨数量级且恒为正的指标不得漏标 scale: log', () => {
  // 判定规则（写进 helper 注释与 PRD §5.2）：池内 max/min ≥ 10 倍且最小值 > 0 → log。
  // 漏标会让该榜的指数退回被极端值拽走的线性刻度，且不会报错，属于静默退化。
  let checked = 0;
  for (const def of computedRanks) {
    let cands = (cities.cities || []).filter((c) =>
      def.metrics.every((m) => c.metrics && c.metrics[m.field] && typeof c.metrics[m.field].v === 'number'));
    if (def.filter && typeof def.filter === 'object') {
      for (const k of Object.keys(def.filter)) {
        cands = cands.filter((c) => String(c[k] === undefined ? '' : c[k]) === String(def.filter[k]));
      }
    }
    for (const m of def.metrics || []) {
      const vs = cands.map((c) => c.metrics[m.field].v);
      const min = Math.min.apply(null, vs);
      const max = Math.max.apply(null, vs);
      if (!(min > 0) || !(max / min >= 10)) continue;
      checked += 1;
      assert.strictEqual(m.scale, 'log',
        '榜 ' + def.slug + ' 的 ' + m.field + ' 跨 ' + (Math.round(max / min * 10) / 10) +
        ' 倍且恒为正，应标 scale: log（现为 ' + (m.scale || '未标') + '）');
    }
  }
  // 阈值取 15：省级榜池子小（如宁夏 5 市 GDP 倍差不足 10 倍）不进强制校验，
  // 但 GDP 仍是规模量，yml 里照样标了 log——本断言只锁「漏标」这一侧。
  assert.ok(checked >= 15, '只校验了 ' + checked + ' 条，断言可能空转');
});

ok('S14 页面必须公开每个指标的刻度（否则读者无法复算）', () => {
  for (const def of computedRanks) {
    const hasLog = (def.metrics || []).some((m) => m.scale === 'log');
    const html = fs.readFileSync(path.join(PUBLIC, 'cityrank', def.slug, 'index.html'), 'utf8');
    assert.ok(html.indexOf('刻度') !== -1, '榜 ' + def.slug + ' 的评分口径表缺「刻度」列');
    if (hasLog) {
      assert.ok(html.indexOf('对数') !== -1, '榜 ' + def.slug + ' 用了对数刻度但页面未标明');
    }
  }
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

  ok('S5 城市大类：/city/ 索引页存在，应建页的城市一个不缺', () => {
    const idx = path.join(PUBLIC, 'city', 'index.html');
    assert.ok(fs.existsSync(idx), '/city/ 索引页缺失（城市大类的入口）');
    assert.ok(fs.statSync(idx).size > 5000, '/city/ 索引页字节数异常');
    const idxHtml = fs.readFileSync(idx, 'utf8');
    assert.ok(idxHtml.indexOf('城市档案') !== -1, '/city/ 索引页缺少标题');
    // 建页口径必须与生成器一致（cityrank-pages.js）：有已核验指标、或至少上过一次榜才建页。
    // 两者皆无的城市不建页——DESIGN-LANGUAGE §1「无数据不生成页面」，不产生空壳页。
    // 反向必须锁死：该建页的城市一个都不能缺，缺一个就是全域死链（E-071）。
    const mentioned = new Set();
    for (const g of R.groups) {
      for (const r of g.ranks) for (const it of r.items || []) mentioned.add(it.slug);
    }
    let expected = 0;
    for (const c of cities.cities || []) {
      const hasData = c.metrics && Object.keys(c.metrics).length > 0;
      if (!hasData && !mentioned.has(c.slug)) continue;
      expected += 1;
      const p = path.join(PUBLIC, 'city', c.slug, 'index.html');
      assert.ok(fs.existsSync(p), '城市页缺失：' + c.slug);
      assert.ok(fs.statSync(p).size > 2000, '城市页字节数异常：' + c.slug);
    }
    assert.ok(expected > 300, '应建页城市数异常（' + expected + '）——断言可能空转');
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

  ok('S7 pending 榜页脚保留一条小字免责：观点性排名 + 未量化核验（C-8 口径 2026-11-01 更新）', () => {
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
  for (const sel of ['.cr-table', '.cr-rank', '.cr-score', '.cr-method', '.cr-profile-list', '.cr-mention-list']) {
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
// E-075：PRD 进度表曾把 15 个 computed 手写成 13 个。进度数字属于「事实」，
// 手写就一定会漂移，这里用 yml 现算的数字与文档比对，写错即 FAIL。
ok('S10 PRD 进度表里的 computed 数量必须由实际数据统计得出（禁止手写）', () => {
  const prd = fs.readFileSync(path.join(ROOT, 'CITY-RANK-PRD-2026-10-27.md'), 'utf8');
  const m = /（(\d+) 个 computed）/.exec(prd);
  assert.ok(m, 'PRD 进度表里找不到「（N 个 computed）」——断言锚点失效，先修格式');
  const actual = (cityrank.groups || []).reduce(
    (n, g) => n + (g.ranks || []).filter((r) => r && r.kind === 'computed').length,
    0
  );
  assert.strictEqual(Number(m[1]), actual, 'PRD 写 ' + m[1] + ' 个 computed，实际统计 ' + actual + ' 个');
});

// 榜单条目的 slug 必须指向同一座城市的档案页。
// 起因（E-077）：抚州的 slug 写成 fuzhou（福州的拼音），江西榜里点「抚州」会跳到福州档案；
// 同类还有榆林→玉林、伊春→宜春。slug 唯一不等于实体唯一，撞车后链接静默指错，页面上看不出来。
ok('S11 榜单条目的 slug 必须指向同名城市档案（防 slug 撞车错链）', () => {
  const bySlug = new Map();
  for (const c of cities.cities || []) bySlug.set(c.slug, c);
  const norm = (s) =>
    String(s || '')
      .replace(/[（(].*$/, '')
      .replace(/[·\s]/g, '')
      .trim();
  const bad = [];
  let scanned = 0;
  for (const g of cityrank.groups || []) {
    for (const r of g.ranks || []) {
      for (const it of r.items || []) {
        scanned++;
        const c = bySlug.get(it.slug);
        if (!c) {
          bad.push(r.slug + ' → ' + it.name + '：slug ' + it.slug + ' 没有对应城市条目');
          continue;
        }
        const a = norm(it.name);
        const b = norm(c.name);
        if (a === b || a.replace(/州$/, '') === b.replace(/州$/, '') || a.indexOf(b) !== -1 || b.indexOf(a) !== -1) {
          continue;
        }
        bad.push(r.slug + ' → 条目「' + it.name + '」(' + it.slug + ') 指向档案「' + c.name + '」');
      }
    }
  }
  assert.ok(scanned > 800, '只扫到 ' + scanned + ' 条，断言可能空转');
  assert.strictEqual(bad.length, 0, 'slug 与档案名不符（共 ' + bad.length + ' 条）：\n' + bad.slice(0, 10).join('\n'));
});

// ---------- ⑤ 本批数据的专项锁 ----------
// E-079：面积最小十大省会榜曾在 27 座省会只有 12 座有面积值、且各来源口径不一
// （陆地 / 行政区划、含不含海域）时被转成 computed，结果广州（7434）排第一，
// 而真正最小的海口（2304.8）、南京（6587）因缺值根本没进候选——名次对外失真。
// 这里锁死：数据补齐前该榜只能保持 pending，谁转谁 FAIL。
// E-079 原锁是「面积数据齐备前必须保持 pending」。2026-10-30 27 座省会面积已全部补齐
// （E-082），该榜转回 computed，锁随之升级为「省会面积必须 100% 覆盖」——
// 覆盖一旦回退，S15 的 90% 线与这条 100% 线会同时拦下。断言必须跟着特性一起改，
// 否则会出现「特性已恢复、旧断言还在拦」的假失败。
ok('S12 省会面积类榜：27 座省会面积必须全覆盖，缺一座即退回 pending（E-079 / E-082）', () => {
  const def = allRanks.find((r) => r.slug === 'mianjizuixiaodeshi-2');
  assert.ok(def, '找不到 mianjizuixiaodeshi-2——锚点失效');
  const caps = (cities.cities || []).filter((c) => c.level === '省会');
  assert.ok(caps.length >= 20, '省会只有 ' + caps.length + ' 座，level 标注可能出问题');
  const withArea = caps.filter((c) => c.metrics && typeof c.metrics.area_km2 === 'object');
  const complete = withArea.length === caps.length;
  assert.strictEqual(def.kind, complete ? 'computed' : 'pending',
    '省会面积覆盖 ' + withArea.length + '/' + caps.length + '，该榜 kind 应为 ' +
    (complete ? 'computed' : 'pending') + '，实际是 ' + def.kind +
    '——覆盖不齐时算出的最小 / 最大榜必然失真（E-079）');
});

// 气候四字段必须同源同年份。年鉴表是 2024 年实况值（非多年平均），一旦混入
// 其他年份或其他来源，气温 / 日照榜的 min-max 归一化口径就废了。
ok('S12 气候四字段必须统一来自 climateNBS2024 且 asOf=2024（防口径混杂）', () => {
  const fields = ['temp_jan', 'temp_jul', 'precip', 'sun_hours'];
  let checked = 0;
  for (const c of cities.cities || []) {
    for (const f of fields) {
      const m = c.metrics && c.metrics[f];
      if (!m) continue;
      assert.strictEqual(m.source, 'climateNBS2024', c.name + ' 的 ' + f + ' 来源不是气候年鉴');
      assert.strictEqual(String(m.asOf), '2024', c.name + ' 的 ' + f + ' 年份不是 2024');
      checked += 1;
    }
  }
  assert.ok(checked >= 100, '气候字段样本过少（' + checked + '）——断言可能空转');
});

// E-078：落库脚本检查「已有指标」的正则只认正数，1 月均温的负值（哈尔滨 -17.2）
// 会被判为「没有该指标」，重复跑就插重复键。这里锁死负值数据必须真的落进库。
ok('S12 1 月均温含负值城市，落库脚本须支持负号（E-078 防复发）', () => {
  const neg = (cities.cities || []).filter((c) => c.metrics && c.metrics.temp_jan && c.metrics.temp_jan.v < 0);
  assert.ok(neg.length >= 5, '负值气温城市仅 ' + neg.length + ' 座——可能落库时被正则截断');
  const haerbin = (cities.cities || []).find((c) => c.slug === 'haerbin');
  assert.ok(haerbin && haerbin.metrics && haerbin.metrics.temp_jan && haerbin.metrics.temp_jan.v < -10,
    '哈尔滨 1 月均温缺失或不是负值');
});

// E-080：PRD §2.1 给「最爱下雨的城市」定的指标是年降水日数（rain_days），
// 而《中国统计年鉴 2025》表 8-6 只有年降水量（precip，毫米）。压缩会话恢复后
// 曾误把该榜用 precip 转成 computed，口径与 PRD 冲突。锁死：rain_days 入库前必须 pending。
// 2026-11-02 核验：城市级降水日数无公开权威单源，该榜维持 pending（主人拍板保留）。
ok('S12 最爱下雨榜在 rain_days 数据入库前必须保持 pending（E-080 防复发）', () => {
  const def = allRanks.find((r) => r.slug === 'shidazuiaixiayudec');
  assert.ok(def, '找不到 shidazuiaixiayudec——锚点失效');
  assert.ok(!def.kind || def.kind === 'pending',
    '该榜被转成了 ' + def.kind + '：PRD §2.1 要求年降水日数，不能用年降水量代替');
  assert.ok(!(def.metrics || []).some((m) => m.field === 'precip'),
    '该榜直接用了 precip（年降水量）——与 PRD 的年降水日数口径冲突');
});

// S13 空壳消歧名条目清零（E-076 防复发）：库里不得同时存在「装饰名」与「标准名」两个档案
// 判定规则与 tools/merge-city-shells.js 的 stripRules 保持一致，改一边必须改另一边。
const PROV = ('北京|天津|上海|重庆|河北|山西|内蒙古|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|'
  + '广东|广西|海南|四川|贵州|云南|西藏|陕西|甘肃|青海|宁夏|新疆');
const PROV_SET = new Set(PROV.split('|'));
function stripRules(name) {
  const out = [];
  const noProv = name.replace(new RegExp('^(' + PROV + ')'), '');
  if (noProv && noProv !== name) out.push(noProv);
  out.push(name.replace(/^[^·]+·/, ''));
  out.push(name.replace(/·[^·]+$/, ''));
  out.push(name.replace(/^[^/]+\//, ''));
  out.push(name.replace(/^[^·]+·/, '').replace(/[州盟]$/, ''));
  if (/[州盟]$/.test(name) && name.length >= 3) {
    const b = name.slice(0, -1);
    if (!PROV_SET.has(b)) out.push(b);
  }
  return [...new Set(out)].filter((x) => x && x !== name && x.length >= 2);
}
// 去饰后同形但实际是另一个地方的，白名单放行（改这里必须同时改 merge-city-shells.js 的 EXCLUDE）
const SHELL_EXCLUDE = new Set(['fuzhoupingtan']);

ok('S13 城市库不得残留「省份前缀 / 城市·美称」空壳，与标准名并存（E-076 防复发）', () => {
  const list = (cities.cities || []).filter((c) => c && c.name);
  const byName = {};
  for (const c of list) { if (!byName[c.name]) byName[c.name] = []; byName[c.name].push(c); }
  const dupes = [];
  for (const c of list) {
    if (SHELL_EXCLUDE.has(c.slug)) continue;
    for (const bare of stripRules(c.name)) {
      const twins = (byName[bare] || []).filter((x) => x !== c);
      if (twins.length) { dupes.push(c.name + '(' + c.slug + ') 与 ' + twins[0].name + '(' + twins[0].slug + ')'); break; }
    }
  }
  assert.strictEqual(dupes.length, 0, '仍有 ' + dupes.length + ' 条空壳与标准名并存：\n' + dupes.slice(0, 10).join('\n'));
  assert.ok(list.length > 300, '城市样本仅 ' + list.length + ' 座——判重断言可能空转');
});

ok('自检：注入一条消歧名空壳必须被 S13 抓到', () => {
  const injected = { name: '广东深圳', slug: 'guangdongshenzhen' };
  const list = (cities.cities || []).concat([injected]);
  const byName = {};
  for (const c of list) { if (!byName[c.name]) byName[c.name] = []; byName[c.name].push(c); }
  let hit = null;
  for (const c of list) {
    for (const bare of stripRules(c.name)) {
      const twins = (byName[bare] || []).filter((x) => x !== c);
      if (twins.length) { hit = c.name; break; }
    }
    if (hit) break;
  }
  assert.strictEqual(hit, '广东深圳', '注入的空壳没被判重逻辑抓到——断言空转');
});

ok('S15 带 filter 的榜：filter 范围内指标覆盖率须 ≥90%（E-079 同类失真防线）', () => {
  let checked = 0;
  for (const def of computedRanks) {
    if (!def.filter) continue;
    let pool = cities.cities || [];
    for (const k of Object.keys(def.filter)) {
      pool = pool.filter((c) => String(c[k] === undefined ? '' : c[k]) === String(def.filter[k]));
    }
    assert.ok(pool.length > 0, '榜 ' + def.slug + ' 的 filter 筛出 0 座城市');
    const ok = pool.filter((c) => (def.metrics || []).every((m) => c.metrics && c.metrics[m.field] && typeof c.metrics[m.field].v === 'number'));
    const pct = ok.length / pool.length;
    assert.ok(pct >= 0.9,
      '榜 ' + def.slug + ' 在 filter ' + JSON.stringify(def.filter) + ' 范围内的指标覆盖只有 ' +
      ok.length + '/' + pool.length + '（' + Math.round(pct * 100) + '%）——' +
      '缺的若恰好落在榜首/榜尾方向，名次必然失真，先补数据再转 computed');
    checked += 1;
  }
  assert.ok(checked >= 10, '只校验了 ' + checked + ' 个带 filter 的榜，断言可能空转');
});

ok('S15 空气最好 / 污染最重两榜须保持 fact：年鉴 31 城覆盖不了生态环境部 168 城口径', () => {
  for (const slug of ['kongqizuihaodeshid', 'kongqiwuranzuiyanz']) {
    const def = allRanks.find((r) => r.slug === slug);
    assert.ok(def, '榜 ' + slug + ' 不存在——站点结构变了，本断言需要一起改');
    assert.strictEqual(def.kind, 'fact',
      '榜 ' + slug + ' 现在是 ' + def.kind + '。本站 pm25 / air_good_days 只有《中国统计年鉴 2025》表 8-16 的 31 座城市，' +
      '而该榜原名次引自生态环境部 168 个重点城市口径（含黄山、张家口、珠海、咸阳、焦作等），' +
      '改用年鉴数据会让这些主体城市全部出榜。要转 computed 必须先拿到 168 城量级的数据源，并同时改本断言');
  }
  // 反向自检：数据确实存在，说明这条锁不是因为「没数据所以没转」
  const withPm25 = (cities.cities || []).filter((c) => c.metrics && typeof c.metrics.pm25 === 'object');
  assert.ok(withPm25.length >= 25,
    'pm25 只有 ' + withPm25.length + ' 座城市，上一轮若没落库这条断言就失去意义');
});

// ---------- S16 排序规则（主人 2026-10-31 拍板） ----------
// 起因：主人翻索引页时发现「晋江十大强镇」夹在省级十大城市榜中间，问「这个是怎么排序的？」
// 答案是**没有规则**——yml 的数组顺序就是抓取序号。规则定下来之后必须有断言盯着，
// 否则下一次新增榜又会按「往 yml 末尾一插」的老习惯写回去。
console.log('\n排序规则（S16）');

const SCOPES = ['nation', 'province', 'region', 'town'];
const KIND_RANK = { computed: 0, fact: 1, pending: 2 };

ok('S16 每个榜都必须带合法 scope（第二层排序依赖它）', () => {
  for (const r of allRanks) {
    assert.ok(SCOPES.indexOf(r.scope) !== -1, '榜 ' + r.slug + ' 的 scope 缺失或非法：' + r.scope + '（用 tools/tag-cityrank-scope.js 标注）');
  }
});

ok('S16 组内第一层：可核验榜（computed / fact）必须全部排在观点性榜之前', () => {
  for (const g of R.groups) {
    let seenPending = false;
    for (const r of g.ranks) {
      if (r.kind === 'pending') seenPending = true;
      else {
        assert.ok(!seenPending,
          '组 ' + g.key + '：' + r.slug + '（' + r.kind + '）排在观点性榜之后');
      }
    }
  }
});

ok('S16 组内第二层：同一档内尺度只能 nation → province → region → town，不许回退', () => {
  for (const g of R.groups) {
    let curKind = null;
    let last = -1;
    for (const r of g.ranks) {
      const k = KIND_RANK[r.kind];
      if (k !== curKind) { curKind = k; last = -1; }
      const cur = SCOPES.indexOf(r.scope);
      assert.ok(cur >= last,
        '组 ' + g.key + '：' + r.slug + ' 的尺度 ' + r.scope + ' 回退到 ' + (last >= 0 ? SCOPES[last] : '起点'));
      last = cur;
    }
  }
});

ok('S16 组内第三层：同一档内的省级榜连成一段，且按 GB/T 2260 区划码递增', () => {
  // 「连成一段」只在**同一档内**成立：第一层（可核验优先）优先于第二层，
  // 所以 computed 的省级榜段与 pending 的省级榜段之间隔着 fact / pending 的全国榜，
  // 那是规则本身的结果，不是缺陷（台湾六大城市是 pending，落在后一段的省级位置）。
  for (const g of R.groups) {
    for (const kind of Object.keys(KIND_RANK)) {
      const idx = [];
      g.ranks.forEach((r, i) => { if (r.scope === 'province' && r.kind === kind) idx.push(i); });
      for (let i = 1; i < idx.length; i++) {
        assert.strictEqual(idx[i], idx[i - 1] + 1,
          '组 ' + g.key + '：' + kind + ' 档的省级榜被其它榜打断（' + g.ranks[idx[i - 1]].title + ' → ' + g.ranks[idx[i]].title + '）');
        const a = provinceCode(g.ranks[idx[i - 1]]);
        const b = provinceCode(g.ranks[idx[i]]);
        assert.ok(b > a,
          '组 ' + g.key + '：' + kind + ' 档省级榜未按区划码递增（' + g.ranks[idx[i - 1]].title + ' ' + a + ' → ' + g.ranks[idx[i]].title + ' ' + b + '）');
      }
    }
  }
  // 空转保护：至少有一个组的省级榜数量够多，否则这条断言等于没跑
  const total = R.groups.reduce((n, g) => n + g.ranks.filter((r) => r.scope === 'province').length, 0);
  assert.ok(total >= 20, '只覆盖到 ' + total + ' 条省级榜，断言可能空转');
});

ok('S16 镇域（town）榜只允许留在待审组，不进城市榜主序列', () => {
  for (const g of R.groups) {
    for (const r of g.ranks) {
      if (r.scope === 'town') {
        assert.strictEqual(g.key, 'pending', '镇域榜 ' + r.slug + ' 出现在 ' + g.key + ' 组，应只留在参考榜组');
      }
    }
  }
});

ok('S16 组间：门面组置顶，其余按可核验榜占比降序，参考榜组固定垫底', () => {
  const gs = R.groups;
  // 门面组例外（主人 2026-10-31 拍板）：综合与经济固定第一，不参与占比排序
  assert.strictEqual(gs[0].key, 'economy', '门面组 economy 不在第一位');
  // 2026-11-02 待审组清空后空组被 helper 滤掉；存在时必须垫底，且不得出现在中间
  const pendingIdx = gs.findIndex((g) => g.key === 'pending');
  if (pendingIdx !== -1) {
    assert.strictEqual(pendingIdx, gs.length - 1, '参考榜组不在最后一位');
  }
  const ratio = (g) => g.ranks.filter((r) => r.kind !== 'pending').length / (g.ranks.length || 1);
  for (let i = 2; i < gs.length; i++) {
    if (gs[i].key === 'pending') continue;
    assert.ok(ratio(gs[i]) <= ratio(gs[i - 1]) + 1e-9,
      '组顺序违反占比降序：' + gs[i - 1].key + ' ' + ratio(gs[i - 1]).toFixed(2) + ' 在 ' + gs[i].key + ' ' + ratio(gs[i]).toFixed(2) + ' 之前');
  }
  // 空组一律不得出现在输出里（参考榜组清空后不渲染「/ 0」占位）
  for (const g of gs) {
    assert.ok(g.ranks.length > 0, '空组 ' + g.key + ' 未被过滤，会渲染成空占位');
  }
});

ok('S16 顺序由数据算出：颠倒 yml 输入顺序，输出顺序必须不变', () => {
  // 这条是整套规则的根：顺序必须来自 kind / scope / 区划码，而不是 yml 里谁写在前面。
  for (const g of R.groups) {
    const a = g.ranks.map((r) => r.slug).join(',');
    const b = sortRanks(g.ranks.slice().reverse()).map((r) => r.slug).join(',');
    assert.strictEqual(b, a, '组 ' + g.key + ' 的顺序受输入顺序影响——排序没真正生效');
  }
});

if (fs.existsSync(path.join(PUBLIC, 'cityrank', 'index.html'))) {
  ok('S16 索引页的分组顺序与 helper 算出的顺序一致（产物层）', () => {
    const html = fs.readFileSync(path.join(PUBLIC, 'cityrank', 'index.html'), 'utf8');
    let prev = -1;
    for (const g of R.groups) {
      const i = html.indexOf(g.kicker);
      assert.ok(i > prev, '索引页里 ' + g.kicker + '（' + g.title + '）没有排在上一组之后');
      prev = i;
    }
  });
}

// ---------- S17 指标分位（2026-11-01 方向一：城市页画像） ----------
// 分位是排序位置的事实陈述（候选池内从高到低），不含优劣评价。
// 一旦 helper 的位次口径（降序 / slug 定序 / 池 < 2 不标注）漂移，页面就静默给出
// 另一套数字——所以独立复算全量比对，与 S2 对榜单名次的锁法同一思路。
console.log('\n指标分位（S17）');

ok('S17 分位现算：全量城市 × 全量字段与独立复算逐项一致', () => {
  let checked = 0;
  for (const c of cities.cities || []) {
    const got = cityMetricStandings(R, c);
    for (const field of Object.keys(c.metrics || {})) {
      const pool = (cities.cities || [])
        .map((x) => ({
          slug: x.slug,
          v: x.metrics && x.metrics[field] && typeof x.metrics[field].v === 'number' ? x.metrics[field].v : null
        }))
        .filter((x) => x.v !== null);
      if (pool.length < 2) {
        assert.ok(!got[field],
          c.name + ' 的 ' + field + ' 候选池不足 2 城，不应标注位次（无位次可言）');
        continue;
      }
      pool.sort((a, b) => (b.v - a.v) || String(a.slug).localeCompare(String(b.slug)));
      const expectRank = pool.findIndex((x) => x.slug === c.slug) + 1;
      assert.ok(got[field], c.name + ' 的 ' + field + ' 有候选池却没给出位次');
      assert.strictEqual(got[field].rank, expectRank,
        c.name + ' 的 ' + field + ' 位次应为 ' + expectRank + '，实为 ' + got[field].rank);
      assert.strictEqual(got[field].total, pool.length,
        c.name + ' 的 ' + field + ' 参比池应为 ' + pool.length + '，实为 ' + got[field].total);
      checked += 1;
    }
  }
  assert.ok(checked > 200, '只复算 ' + checked + ' 项——断言可能空转');
});

ok('S17 分位锚点：该字段最大值城市的位次必须是第 1 位', () => {
  const field = 'gdp';
  const maxCity = (cities.cities || [])
    .filter((c) => c.metrics && c.metrics[field] && typeof c.metrics[field].v === 'number')
    .sort((a, b) => b.metrics[field].v - a.metrics[field].v)[0];
  assert.ok(maxCity, '没有城市带 gdp——锚点失效');
  const st = cityMetricStandings(R, maxCity);
  assert.strictEqual(st[field].rank, 1,
    maxCity.name + ' 的 gdp 是全库最大值，位次应为 1，实为 ' + (st[field] && st[field].rank));
});

// ---------- S18 省级聚合（2026-11-01 方向四：/city/province/<slug>/） ----------
console.log('\n省级聚合（S18）');

ok('S18 归组：按 province 现算、区划码升序、归属字段不被篡改', () => {
  const provs = cityProvinces(R);
  assert.ok(provs.length >= 20, '省级聚合只有 ' + provs.length + ' 个——断言可能空转');
  let prev = -1;
  for (const p of provs) {
    assert.ok(p.slug, '省 ' + p.name + ' 没有路由 slug');
    assert.ok(p.pageCount > 0, '省 ' + p.name + ' 没有可建页城市，不应生成');
    assert.ok(p.cities.length >= p.pageCount, '省 ' + p.name + ' 页面数大于城市数');
    assert.ok(p.code >= prev, '省级聚合未按 GB/T 2260 区划码升序：' + p.name);
    prev = p.code;
    for (const c of p.cities) {
      assert.strictEqual(c.province, p.name, '城市 ' + c.name + ' 被归进了错误的省');
    }
  }
});

ok('S18 生成口径：有建页城市的省必须在列，全无建页城市的省不得在列', () => {
  const provs = cityProvinces(R);
  const inList = new Set(provs.map((p) => p.name));
  const byProv = {};
  for (const c of cities.cities || []) {
    if (!c.province) continue; // 归属待补的城市不进省级聚合
    if (!byProv[c.province]) byProv[c.province] = [];
    byProv[c.province].push(c);
  }
  let withPage = 0;
  for (const name of Object.keys(byProv)) {
    const anyPage = byProv[name].some((c) => cityHasPage(R, c));
    if (anyPage) withPage += 1;
    assert.strictEqual(inList.has(name), anyPage,
      '省 ' + name + ' 的生成与否与建页口径不符（有页=' + anyPage + '，在列=' + inList.has(name) + '）');
  }
  assert.ok(withPage >= 20, '有建页城市的省仅 ' + withPage + ' 个——断言可能空转');
});

if (fs.existsSync(path.join(PUBLIC, 'city', 'index.html'))) {
  ok('S18 产物：每个省都有非 0 字节聚合页，页内城市链接无死链', () => {
    const provs = cityProvinces(R);
    for (const p of provs) {
      const f = path.join(PUBLIC, 'city', 'province', p.slug, 'index.html');
      assert.ok(fs.existsSync(f), '省级页缺失：' + p.slug);
      assert.ok(fs.statSync(f).size > 2000, '省级页字节数异常：' + p.slug);
      const html = fs.readFileSync(f, 'utf8');
      const re = /href="(\/city\/[a-z0-9-]+\/)"/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        assert.ok(fs.existsSync(path.join(PUBLIC, m[1], 'index.html')),
          '省级页死链：' + m[1] + '（来自 ' + p.slug + '）');
      }
    }
  });

  ok('S17 产物：城市页带分位注记，/city/ 索引带按省导航', () => {
    const sh = fs.readFileSync(path.join(PUBLIC, 'city', 'shanghai', 'index.html'), 'utf8');
    assert.ok(sh.indexOf('城参比') !== -1, '上海页没有分位注记');
    assert.ok(sh.indexOf('从高到低第') !== -1, '上海页没有位次口径词');
    assert.ok(sh.indexOf('最好成绩') !== -1, '上海页上榜记录缺分组小结');
    const idx = fs.readFileSync(path.join(PUBLIC, 'city', 'index.html'), 'utf8');
    assert.ok(idx.indexOf('按省份浏览') !== -1, '/city/ 索引页缺按省导航');
    for (const p of cityProvinces(R)) {
      assert.ok(idx.indexOf('/city/province/' + p.slug + '/') !== -1,
        '索引页缺省级入口：' + p.slug);
    }
  });

  ok('S19 城市头图双闸：登记且有文件才渲染，未登记城市不得出现 /img/cities/ 引用（防无出处图与死链）', () => {
    const sh = fs.readFileSync(path.join(PUBLIC, 'city', 'shanghai', 'index.html'), 'utf8');
    assert.ok(sh.indexOf('/img/cities/shanghai.jpg') !== -1, '上海已登记且有照片，页面却没渲染头图');
    // 署名必须与登记表一致。2026-11-02 修：这里原先写死摄影师名「Freeman Zhou」，
    // 换图后断言恒真（`indexOf('credit') === -1` 短路），等于长期失效。
    const photos = yaml.load(fs.readFileSync(path.join(ROOT, 'source', '_data', 'cityphotos.yml'), 'utf8')) || {};
    const credit = photos.shanghai && photos.shanghai.credit;
    assert.ok(credit, 'cityphotos.yml 没登记上海头图署名');
    assert.ok(sh.indexOf(credit) !== -1, '头图署名与登记表不一致，页面应出现：' + credit);
    assert.ok(fs.existsSync(path.join(PUBLIC, 'img', 'cities', 'shanghai.jpg')),
      '头图文件没进产物（source/img/cities/ 未被 Hexo 复制）');
    // 未登记的城市不得出现任何 /img/cities/ 引用——生成器 cityPhoto 双闸的防死链面
    for (const c of cities.cities || []) {
      if (!c.slug || c.slug === 'shanghai') continue;
      const f = path.join(PUBLIC, 'city', c.slug, 'index.html');
      if (!fs.existsSync(f)) continue;
      const html = fs.readFileSync(f, 'utf8');
      assert.ok(html.indexOf('/img/cities/') === -1,
        '未登记头图的城市页出现图片引用（死链风险）：' + c.slug);
    }
  });

  // S20 位置图（2026-11-02）：合规红线级断言——省级单位一个都不能少，
  // 台湾/港澳必须在列，南海断续线必须在。数据换源或抽稀参数被改动时先红在这里。
  ok('S20 位置图：34 个省级单位齐全、含港澳台与南海断续线，直辖市有定位标记', () => {
    const dataFile = path.join(ROOT, 'themes', 'fluid', 'data', 'china-provinces.json');
    assert.ok(fs.existsSync(dataFile), '缺少位置图数据：themes/fluid/data/china-provinces.json');
    const map = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

    assert.strictEqual(map.provinces.length, 34,
      '省级单位应为 34 个（含港澳台），实际 ' + map.provinces.length);
    const names = map.provinces.map((p) => p.name);
    for (const need of ['台湾省', '香港特别行政区', '澳门特别行政区']) {
      assert.ok(names.indexOf(need) !== -1, '位置图数据缺省级单位：' + need);
    }
    assert.ok(map.nineDash && map.nineDash.length > 100, '位置图数据缺南海断续线要素');

    // 省级单位必须有实际路径：澳门只有 33 km²，抽稀或面积阈值一旦写错就会整块消失
    const empty = map.provinces.filter((p) => !p.d || p.d.length < 20).map((p) => p.name);
    assert.strictEqual(empty.length, 0, '这些省级单位没有路径：' + empty.join('、'));

    const sh = fs.readFileSync(path.join(PUBLIC, 'city', 'shanghai', 'index.html'), 'utf8');
    assert.ok(sh.indexOf('/img/map/cn-310000.svg') !== -1, '上海页没有引用位置图');

    const svgFile = path.join(PUBLIC, 'img', 'map', 'cn-310000.svg');
    assert.ok(fs.existsSync(svgFile), '位置图 SVG 没进产物');
    const svg = fs.readFileSync(svgFile, 'utf8');
    assert.ok(svg.indexOf('#a8482c') !== -1, '位置图没有高亮本省（缺 accent 填充）');
    assert.ok(/<circle[^>]*r="2\.6"/.test(svg),
      '位置图缺定位标记——直辖市/港澳面积太小，只靠填色在图上找不到');
    assert.ok(svg.indexOf('stroke-dasharray') !== -1, '位置图没画南海断续线');

    // 路径语法（E-094）：坐标对之间漏分隔空格会把两组数字粘成「-40.58101.77」，
    // 浏览器不报错、只画出一堆横线。按命令字母切分逐段校验——
    // 'ZM' 这种命令连写是合法的，不能当粘连误报。
    const badD = [];
    const checkD = (d, label) => {
      const s = String(d || '');
      if (!s) return badD.push(label + '（空路径）');
      const segs = s.match(/[A-Za-z][^A-Za-z]*/g) || [];
      for (const seg of segs) {
        const cmd = seg[0];
        const args = seg.slice(1).trim();
        if (cmd === 'Z' || cmd === 'z') {
          if (args) return badD.push(label + '（闭合命令带参数）');
          continue;
        }
        if (!args) return badD.push(label + '（命令缺参数）');
        const toks = args.split(/\s+/);
        const bad = toks.find((t) => !/^-?\d+(\.\d+)?$/.test(t));
        if (bad) return badD.push(label + '（非法数值 ' + bad + '）');
        if (toks.length % 2 !== 0) return badD.push(label + '（坐标不成对）');
      }
    };
    map.provinces.forEach((p) => checkD(p.d, p.name));
    checkD(map.nineDash, '南海断续线');
    assert.strictEqual(badD.length, 0, '位置图路径语法不合法：' + badD.slice(0, 5).join('；'));
  });
}

ok('自检：镇域榜混入主序列必须被 S16 抓到（变异样本自造，不依赖真实待审组样本）', () => {
  const bad = R.groups.map((g) => ({
    key: g.key,
    ranks: g.ranks.map((r) => Object.assign({}, r))
  }));
  const eco = bad.find((g) => g.key === 'economy');
  // 2026-11-02 待审组清空后不再有真实镇域榜可挪，改为构造变异样本
  eco.ranks.push({ slug: '_mutation_town_rank', scope: 'town', kind: 'pending', title: '变异样本' });
  let caught = false;
  for (const g of bad) {
    for (const r of g.ranks) {
      if (r.scope === 'town' && g.key !== 'pending') caught = true;
    }
  }
  assert.ok(caught, '镇域榜混入经济组却没被判出来');
});

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

ok('自检：认不出拼音的省级名必须拿不到 slug（不硬造路由）', () => {
  assert.strictEqual(provinceSlug('某未知地区'), '');
  assert.strictEqual(provinceSlug(''), '');
  assert.strictEqual(provinceSlug('浙江省'), 'zhejiang', '常规省份名必须能拿到 slug——自检样本失效');
});

console.log('\nRESULT: ' + pass + ' 项断言通过' + (process.exitCode ? '，存在失败' : ''));
process.exit(process.exitCode || 0);
