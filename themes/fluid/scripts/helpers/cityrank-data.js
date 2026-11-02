'use strict';

// 城市排行榜板块（/cityrank/、/cityrank/<slug>/、/city/<slug>/）的计算层。
//
// 为什么要有这一层（与 festival-data.js / zodiac-data.js 同一理由）：
//   1. **名次必须只在一个地方被算出来**。PRD §5.1 P0 铁律：名次是计算结果，
//      严禁「先定名次再配分数」（对标站正是这么做的，见 PRD §1.2.1 逆向结论）。
//      因此 computed 榜的 yml 里不存名次，只存指标与权重，名次在这里现算。
//   2. 缺数据不静默（E-047 同型）：缺任一指标的城市**不进候选池**，不按 0 分处理；
//      候选数不足 size 的榜照常输出并在页面标注实际候选数，不凑数。
//   3. 位置约束：放 themes/fluid/scripts/helpers/ 下且自包含——跨文件 require 在
//      Hexo 的 vm 加载上下文里解析失败（AGENTS.md §5.2）。
//
// 用法（模板内）：var R = buildCityRanks(site.data)
// 用法（测试内）：const { buildCityRanks, cityMentions } = require('.../cityrank-data.js')

// 取指标的数值。字段写成 { v, unit, asOf, source } 四元组；不符合的一律按缺失处理，
// 不允许裸数字混入（否则「有值但无来源」会绕过 CITY-RANK-CONTENT §7 C-1 红线）。
function metricValue(city, field) {
  if (!city || !city.metrics) return null;
  const m = city.metrics[field];
  if (!m || typeof m !== 'object') return null;
  const v = m.v;
  if (typeof v !== 'number' || !isFinite(v)) return null;
  return v;
}

// 归一化到 0–100。dir='up' 越大越好，'down' 越小越好。
// scale='log'（默认 'linear'，不写即线性）：规模型指标取自然对数后再归一化。
//
// 为什么规模量要用对数（E-081，主人 2026-10-30 拍板）：
//   GDP 这类量在候选池里是极端右偏分布——经济强市榜 329 座里最高是最低的 1085 倍。
//   线性 min-max 把这个倍数原样映射到 0–100，结果唯一的极端最大值把整个刻度拽走：
//   上海 100、第 10 名南京只剩 34.2、中位数城市只有 4.0，90% 的城市在 16 以下。
//   指数读起来像「不及格」，实际只是分布形态的副产品。
//   对数按「倍数关系」定距（南京是上海的 1/2.9、是池底的 372 倍，两个事实在 log 空间
//   都是等距的），与联合国 HDI 对收入维度取 ln 的处理一致。
//   适用判定（写在 yml 的 scale 字段，页面公开，见 test/cityrank-e2e.js S14）：
//   池内 max/min ≥ 10 倍且最小值 > 0 的规模量（gdp / pop / area_km2 / metro_km /
//   universities）。气温、纬度这类区间量（差值有意义、倍数无意义，且可能为负）
//   一律线性。
//
// max===min（全部同值）时统一给 100，避免除零产生 NaN 静默污染排序。
// 兜底：标了 log 但池内出现非正值时回退线性——宁可刻度不完美，也不能产出 NaN。
// （这条回退是防御性的，正常不该触发；S14 断言锁死「标 log 的指标池内 min 必须 > 0」。）
function normalize(x, min, max, dir, scale) {
  if (max === min) return 100;
  let r;
  if (scale === 'log' && min > 0 && max > 0) {
    r = Math.log(x / min) / Math.log(max / min);
  } else {
    r = (x - min) / (max - min);
  }
  return (dir === 'down' ? 1 - r : r) * 100;
}

function round1(n) { return Math.round(n * 10) / 10; }

// ---------------------------------------------------------------------------
// 榜单与分组的排序规则（主人 2026-10-31 拍板，此前没有规则）
//
// 背景：yml 里的数组顺序就是当初抓取对标站的序号。后果是「晋江十大强镇」（镇级）
// 插在「山东十大城市」和「江苏十大城市」之间，省级榜被外卖、富硒食品这类
// 无关榜单打断——主人看到后直接问「这个是怎么排序的？」。
// 所以这里把顺序**从数据算出来**，yml 的手写顺序不再决定页面顺序。
//
// 三层：
//   第一层 可核验优先：computed（本站算得出）→ fact（权威名次）→ pending（参考榜）
//   第二层 空间尺度：nation（全国）→ province（省级）→ region（跨省区域）→ town（镇域）
//   第三层 同级定序：省级按 GB/T 2260 行政区划代码，其余按登记序
//
// 组间：按「可核验榜占比」降序（占比相同比可核验榜数量），「参考榜」组固定垫底。
// 判定数据来自两个字段：kind（已有）与 scope（由 tools/tag-cityrank-scope.js 标注）。
// 两者任一缺失都排到该层末尾并会在测试里 FAIL（test/cityrank-e2e.js S16）。
// ---------------------------------------------------------------------------

const KIND_ORDER = { computed: 0, fact: 1, pending: 2 };
const SCOPE_ORDER = { nation: 0, province: 1, region: 2, town: 3 };

// GB/T 2260 省级行政区划代码（前两位），省级榜按它定序
const PROVINCE_CODE = {
  北京: 11, 天津: 12, 河北: 13, 山西: 14, 内蒙古: 15,
  辽宁: 21, 吉林: 22, 黑龙江: 23,
  上海: 31, 江苏: 32, 浙江: 33, 安徽: 34, 福建: 35, 江西: 36, 山东: 37,
  河南: 41, 湖北: 42, 湖南: 43, 广东: 44, 广西: 45, 海南: 46,
  重庆: 50, 四川: 51, 贵州: 52, 云南: 53, 西藏: 54,
  陕西: 61, 甘肃: 62, 青海: 63, 宁夏: 64, 新疆: 65,
  台湾: 71, 香港: 81, 澳门: 82
};

function provinceCode(rank) {
  const src = (rank.filter && rank.filter.province) || rank.title || '';
  for (const name of Object.keys(PROVINCE_CODE)) {
    if (src.indexOf(name) !== -1) return PROVINCE_CODE[name];
  }
  return 999; // 认不出省份的省级榜落在该段末尾
}

function rankSortKey(r) {
  return [
    KIND_ORDER[r.kind] === undefined ? 9 : KIND_ORDER[r.kind],
    SCOPE_ORDER[r.scope] === undefined ? 9 : SCOPE_ORDER[r.scope],
    r.scope === 'province' ? provinceCode(r) : 0,
    r._idx
  ];
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function sortRanks(ranks) {
  return ranks.slice().sort((a, b) => compareKeys(rankSortKey(a), rankSortKey(b)));
}

function verifiableCount(g) {
  return (g.ranks || []).filter((r) => r.kind === 'computed' || r.kind === 'fact').length;
}

// 例外：门面组固定置顶（主人 2026-10-31 拍板）。
// 「综合与经济」装的是板块的主榜（经济强市、人口大市、快递量…），按占比算它排第二，
// 但它是这个板块的门面，位置不该被一个只有 18 条榜的组抢走。
const PINNED_GROUP_KEYS = ['economy'];

function sortGroups(groups) {
  return groups
    // 空组不进页面（2026-11-02 待审组清空后，参考榜组不再渲染「/ 0」占位）
    .filter((g) => (g.ranks || []).length > 0)
    .slice().sort((a, b) => {
    // ① 门面组固定置顶（彼此之间按 yml 登记序）
    const pa = PINNED_GROUP_KEYS.indexOf(a.key);
    const pb = PINNED_GROUP_KEYS.indexOf(b.key);
    if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    if (pa !== -1 && pb !== -1) return a._gi - b._gi;
    // ②「参考榜」组固定垫底：它装的是等主人逐条审定的榜单，不该和数据榜抢位置
    const qa = a.key === 'pending' ? 1 : 0;
    const qb = b.key === 'pending' ? 1 : 0;
    if (qa !== qb) return qa - qb;
    const ra = verifiableCount(a) / ((a.ranks || []).length || 1);
    const rb = verifiableCount(b) / ((b.ranks || []).length || 1);
    if (rb !== ra) return rb - ra;
    const ca = verifiableCount(a);
    const cb = verifiableCount(b);
    if (cb !== ca) return cb - ca;
    return a._gi - b._gi;
  });
}

// 说明列：只写数据事实，不写主观形容（CITY-RANK-CONTENT §3）。
// 取权重最高的两个指标输出实际值，如「地区生产总值 56708.71 亿元 · 常住人口 2485.41 万人」。
function reasonOf(metrics, values) {
  const ordered = metrics.slice().sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 2);
  const parts = [];
  for (const m of ordered) {
    const v = values[m.field];
    if (v === null || v === undefined) continue;
    parts.push(m.label + ' ' + fmtNum(v) + (m.unit ? ' ' + m.unit : ''));
  }
  return parts.join(' · ');
}

function fmtNum(v) {
  if (typeof v !== 'number') return String(v);
  // 整数原样，小数最多两位（GDP 56708.71 / 人口 2485.41 这类常见精度）
  return String(Math.round(v * 100) / 100);
}

// 计算一个 computed 榜。返回 { items, candidateCount, skipped }
// filter（可选）：先按城市自身属性缩小候选池，例如 { level: '省会' } 只算省会城市。
// 没有它，「面积最大的十大省会城市」会把那曲这类地级市也算进来——榜名限定了范围，
// 计算就必须跟着限定（否则算出来的名次与榜名不符，是隐性错误）。
function computeRank(rank, cities) {
  const metrics = Array.isArray(rank.metrics) ? rank.metrics.filter((m) => m && m.field) : [];
  if (!metrics.length) return { items: [], candidateCount: 0, skipped: 'no-metrics' };

  let pool = cities;
  if (rank.filter && typeof rank.filter === 'object') {
    const keys = Object.keys(rank.filter);
    pool = cities.filter((c) => keys.every((k) => String(c[k] === undefined ? '' : c[k]) === String(rank.filter[k])));
  }

  // 候选池：所有指标都有值的城市（缺失即出局，不按 0 分处理）
  const candidates = pool.filter((c) => metrics.every((m) => metricValue(c, m.field) !== null));

  const stats = {};
  for (const m of metrics) {
    let min = Infinity;
    let max = -Infinity;
    for (const c of candidates) {
      const v = metricValue(c, m.field);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    stats[m.field] = { min: min, max: max };
  }

  const wsum = metrics.reduce((s, m) => s + (typeof m.weight === 'number' ? m.weight : 0), 0) || 1;

  const scored = candidates.map((c) => {
    const values = {};
    let acc = 0;
    for (const m of metrics) {
      const v = metricValue(c, m.field);
      values[m.field] = v;
      const s = normalize(v, stats[m.field].min, stats[m.field].max, m.dir === 'down' ? 'down' : 'up', m.scale);
      acc += s * (typeof m.weight === 'number' ? m.weight : 0);
    }
    return {
      slug: c.slug,
      name: c.name,
      province: c.province,
      level: c.level,
      score: round1(acc / wsum),
      raw: acc / wsum,
      values: values,
      reason: reasonOf(metrics, values),
      gdp: metricValue(c, 'gdp')
    };
  });

  // 稳定排序：分数降序 → GDP 降序 → slug 升序（同分规则明确，PRD §5.4）
  scored.sort((a, b) => {
    if (b.raw !== a.raw) return b.raw - a.raw;
    const ga = a.gdp === null ? -1 : a.gdp;
    const gb = b.gdp === null ? -1 : b.gdp;
    if (gb !== ga) return gb - ga;
    return String(a.slug).localeCompare(String(b.slug));
  });

  const size = typeof rank.size === 'number' && rank.size > 0 ? rank.size : 10;
  const top = scored.slice(0, size);
  top.forEach((it, i) => { it.rank = i + 1; });

  return { items: top, candidateCount: candidates.length, skipped: null };
}

// 主入口：data = { cities: {...}, cityrank: {...} }
function buildCityRanks(data) {
  if (!data || !data.cityrank) return { error: '数据源缺失：source/_data/cityrank.yml 未加载' };
  const cr = data.cityrank;
  const cityData = data.cities || {};
  const cities = Array.isArray(cityData.cities) ? cityData.cities : [];
  if (!cities.length) return { error: '数据源缺失：source/_data/cities.yml 里没有城市' };

  const groupsIn = Array.isArray(cr.groups) ? cr.groups : [];
  const groups = [];
  // 登记序：yml 里的原始下标，用作第三层排序的兜底（同一档内保持录入先后）
  let gi = 0;
  let ri = 0;

  // slug → 省份反查表（供名单类榜单补省份列）
  const provOf = {};
  for (const c of cities) { if (c && c.slug) provOf[c.slug] = c.province || ''; }

  for (const g of groupsIn) {
    const ranksIn = Array.isArray(g.ranks) ? g.ranks : [];
    const ranks = [];
    for (const r of ranksIn) {
      if (!r || !r.slug) continue;
      if (r.kind === 'computed') {
        const c = computeRank(r, cities);
        ranks.push({
          slug: r.slug,
          title: r.title,
          kind: 'computed',
          scope: r.scope || '',
          _idx: ri++,
          size: r.size || 10,
          lede: r.lede || '',
          metrics: r.metrics || [],
          filter: r.filter || null,
          note: r.note || '',
          items: c.items,
          candidateCount: c.candidateCount,
          skipped: c.skipped
        });
      } else {
        // fact / pending：名次不在本站计算，页面必须按 kind 标注口径。
        // 名次按 yml 中的数组顺序生成（1 起）——这两类榜的名次来自权威结果或公开榜单，
        // 不是算出来的，但页面仍需要 rank 字段做编号，这里统一补齐。
        // 省份从 cities.yml 反查：名单类榜单（fact / pending）本身不携带行政归属，
        // 但表格里给出「哪个省」能显著提升可读性，且这一列是结构性事实、不涉统计口径。
        const rawItems = Array.isArray(r.items) ? r.items : [];
        const items = rawItems.map((it, i) => ({
          rank: i + 1,
          slug: it.slug,
          name: it.name,
          province: provOf[it.slug] || '',
          reason: it.note || '',
          score: null,
          gdp: null
        }));
        const hasProv = items.some((x) => x.province);
        ranks.push({
          slug: r.slug,
          title: r.title,
          kind: r.kind === 'fact' ? 'fact' : 'pending',
          scope: r.scope || '',
          _idx: ri++,
          size: r.size || 10,
          lede: r.lede || '',
          metrics: [],
          note: r.note || '',
          items: items,
          hasProvince: hasProv,
          candidateCount: rawItems.length,
          skipped: null
        });
      }
    }
    groups.push({
      key: g.key,
      title: g.title,
      kicker: g.kicker || '',
      desc: g.desc || '',
      _gi: gi++,
      // 排序在 helper 里算，yml 的手写顺序不再决定页面顺序（2026-10-31 主人拍板）
      ranks: sortRanks(ranks)
    });
  }

  let rankCount = 0;
  for (const g of groups) rankCount += g.ranks.length;

  return {
    error: null,
    meta: cr.meta || {},
    groups: sortGroups(groups),
    cities: cities,
    cityCount: cities.length,
    rankCount: rankCount,
    citySources: Array.isArray(cityData.sources) ? cityData.sources : [],
    cityMeta: cityData.meta || {}
  };
}

// 某城市在所有榜里的上榜记录（城市页用）
function cityMentions(R, citySlug) {
  if (!R || R.error || !Array.isArray(R.groups)) return [];
  const out = [];
  for (const g of R.groups) {
    const hits = [];
    for (const r of g.ranks) {
      const it = r.items.find((x) => x.slug === citySlug);
      if (it) hits.push({ group: g.title, slug: r.slug, title: r.title, rank: it.rank, score: it.score, kind: r.kind });
    }
    if (hits.length) out.push({ group: g.title, hits: hits });
  }
  return out;
}

// 某城市上榜次数（城市索引页用来排序：上榜越多越靠前）
function cityMentionCount(R, citySlug) {
  if (!R || R.error || !Array.isArray(R.groups)) return 0;
  let n = 0;
  for (const g of R.groups) {
    for (const r of g.ranks) {
      if ((r.items || []).some((x) => x.slug === citySlug)) n += 1;
    }
  }
  return n;
}

// 取单个城市
function findCity(R, citySlug) {
  if (!R || R.error || !Array.isArray(R.cities)) return null;
  return R.cities.find((c) => c.slug === citySlug) || null;
}

// ---------------------------------------------------------------------------
// 城市建页判定（2026-11-01 方向一/四重构：生成器与省级聚合必须用同一口径）
// 与 cityrank-pages.js 的既有口径一致：有已核验指标、或至少上过一次榜，才建城市页。
// 口径只写这一份——两处各写一份必然漂移（E-052 同型教训）。
// ---------------------------------------------------------------------------
function cityHasPage(R, c) {
  if (!c) return false;
  if (c.metrics && Object.keys(c.metrics).length > 0) return true;
  return cityMentionCount(R, c.slug) > 0;
}

// ---------------------------------------------------------------------------
// 指标分位（2026-11-01 方向一：城市页画像）
// 对城市的每个已采字段，在该字段的候选池（全库有值城市）内给出「从高到低第几位」。
//
// 口径说明（页面必须原样转达给读者）：
//   1. 分位是**位次事实**，不是优劣判断——1 月均温从高到低第 30 位只是排序位置，
//      不含「好/差」评价，与 computed 榜「指标方向 + 权重」的指数完全两回事。
//   2. 候选池 = 全库该字段有值的城市（缺值不参与，与榜单候选池同一规则）。
//   3. 同值按 slug 升序定序——与榜单同分规则的兜底键一致，位次稳定可复算。
// ---------------------------------------------------------------------------
function cityMetricStandings(R, city) {
  if (!R || R.error || !Array.isArray(R.cities) || !city || !city.metrics) return {};
  const out = {};
  for (const field of Object.keys(city.metrics)) {
    const pool = [];
    for (const c of R.cities) {
      const v = metricValue(c, field);
      if (v !== null) pool.push({ slug: c.slug, v: v });
    }
    if (pool.length < 2) continue; // 只有自己有值的字段没有「位次」可言，不标注
    pool.sort((a, b) => (b.v - a.v) || String(a.slug).localeCompare(String(b.slug)));
    let rank = 0;
    for (let i = 0; i < pool.length; i += 1) {
      if (pool[i].slug === city.slug) { rank = i + 1; break; }
    }
    if (rank > 0) out[field] = { rank: rank, total: pool.length };
  }
  return out;
}

// ---------------------------------------------------------------------------
// 省级聚合（2026-11-01 方向四：/city/province/<slug>/）
// 按城市记录的 province 字段归组。三个硬规则：
//   1. province 为空的城市不进省级聚合（归属待补的不硬凑分组）；
//   2. 省内没有任何可建页城市（cityHasPage 全 false）的省不生成省级页——
//      否则页面里全是死链或空壳（DESIGN-LANGUAGE §1 无数据不生成）；
//   3. 顺序按 GB/T 2260 行政区划代码升序，与省级榜排序同一把尺子。
// ---------------------------------------------------------------------------
const PROVINCE_PINYIN = {
  北京: 'beijing', 天津: 'tianjin', 河北: 'hebei', 山西: 'shanxi',
  内蒙古: 'neimenggu', 辽宁: 'liaoning', 吉林: 'jilin', 黑龙江: 'heilongjiang',
  上海: 'shanghai', 江苏: 'jiangsu', 浙江: 'zhejiang', 安徽: 'anhui',
  福建: 'fujian', 江西: 'jiangxi', 山东: 'shandong', 河南: 'henan',
  湖北: 'hubei', 湖南: 'hunan', 广东: 'guangdong', 广西: 'guangxi',
  海南: 'hainan', 重庆: 'chongqing', 四川: 'sichuan', 贵州: 'guizhou',
  云南: 'yunnan', 西藏: 'xizang', 陕西: 'shaanxi', 甘肃: 'gansu',
  青海: 'qinghai', 宁夏: 'ningxia', 新疆: 'xinjiang',
  台湾: 'taiwan', 香港: 'xianggang', 澳门: 'aomen'
};

// 「浙江省 / 广西壮族自治区 / 北京市」→「浙江 / 广西 / 北京」
function provinceBaseName(name) {
  return String(name || '')
    .replace(/(维吾尔|壮族|回族)?自治区$/, '')
    .replace(/特别行政区$/, '')
    .replace(/省$/, '')
    .replace(/市$/, '');
}

function provinceSlug(name) {
  const raw = String(name || '');
  // 合规全称（C-4：中国台湾地区 / 中国香港 / 中国澳门）不参与后缀剥离，直接整名映射
  const FULL = { 中国台湾地区: 'taiwan', 中国香港: 'xianggang', 中国澳门: 'aomen' };
  if (FULL[raw]) return FULL[raw];
  const base = provinceBaseName(raw);
  return PROVINCE_PINYIN[base] || '';
}

function provinceNameCode(name) {
  const base = provinceBaseName(name);
  return PROVINCE_CODE[base] === undefined ? 999 : PROVINCE_CODE[base];
}

function cityProvinces(R) {
  if (!R || R.error || !Array.isArray(R.cities)) return [];
  const map = {};
  for (const c of R.cities) {
    if (!c || !c.province) continue;
    if (!map[c.province]) map[c.province] = [];
    map[c.province].push(c);
  }
  const out = [];
  for (const name of Object.keys(map)) {
    const slug = provinceSlug(name);
    if (!slug) continue; // 认不出拼音的省级行政区不硬造路由，测试会盯着这种情况
    const cities = map[name];
    const pageCount = cities.filter((c) => cityHasPage(R, c)).length;
    if (!pageCount) continue;
    out.push({
      name: name,
      slug: slug,
      code: provinceNameCode(name),
      cities: cities,
      pageCount: pageCount,
      total: cities.length
    });
  }
  out.sort((a, b) => (a.code - b.code) || a.name.localeCompare(b.name));
  return out;
}

// 取单个榜
function findRank(R, rankSlug) {
  if (!R || R.error || !Array.isArray(R.groups)) return null;
  for (const g of R.groups) {
    const r = g.ranks.find((x) => x.slug === rankSlug);
    if (r) return { group: g, rank: r };
  }
  return null;
}

if (typeof hexo !== 'undefined' && hexo.extend && hexo.extend.helper) {
  hexo.extend.helper.register('buildCityRanks', buildCityRanks);
  hexo.extend.helper.register('cityMentions', cityMentions);
  hexo.extend.helper.register('cityMentionCount', cityMentionCount);
  hexo.extend.helper.register('findCity', findCity);
  hexo.extend.helper.register('findRank', findRank);
  hexo.extend.helper.register('cityHasPage', cityHasPage);
  hexo.extend.helper.register('cityMetricStandings', cityMetricStandings);
  hexo.extend.helper.register('cityProvinces', cityProvinces);
  hexo.extend.helper.register('provinceSlug', provinceSlug);
}

module.exports = {
  buildCityRanks: buildCityRanks,
  cityMentions: cityMentions,
  cityMentionCount: cityMentionCount,
  findCity: findCity,
  findRank: findRank,
  metricValue: metricValue,
  normalize: normalize,
  computeRank: computeRank,
  sortRanks: sortRanks,
  sortGroups: sortGroups,
  rankSortKey: rankSortKey,
  provinceCode: provinceCode,
  cityHasPage: cityHasPage,
  cityMetricStandings: cityMetricStandings,
  cityProvinces: cityProvinces,
  provinceSlug: provinceSlug,
  provinceBaseName: provinceBaseName,
  provinceNameCode: provinceNameCode
};
