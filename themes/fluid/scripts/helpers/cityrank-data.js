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

// min-max 归一化到 0–100。dir='up' 越大越好，'down' 越小越好。
// max===min（全部同值）时统一给 100，避免除零产生 NaN 静默污染排序。
function normalize(x, min, max, dir) {
  if (max === min) return 100;
  const r = (x - min) / (max - min);
  return (dir === 'down' ? 1 - r : r) * 100;
}

function round1(n) { return Math.round(n * 10) / 10; }

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
function computeRank(rank, cities) {
  const metrics = Array.isArray(rank.metrics) ? rank.metrics.filter((m) => m && m.field) : [];
  if (!metrics.length) return { items: [], candidateCount: 0, skipped: 'no-metrics' };

  // 候选池：所有指标都有值的城市（缺失即出局，不按 0 分处理）
  const candidates = cities.filter((c) => metrics.every((m) => metricValue(c, m.field) !== null));

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
      const s = normalize(v, stats[m.field].min, stats[m.field].max, m.dir === 'down' ? 'down' : 'up');
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
          size: r.size || 10,
          lede: r.lede || '',
          metrics: r.metrics || [],
          note: r.note || '',
          items: c.items,
          candidateCount: c.candidateCount,
          skipped: c.skipped
        });
      } else {
        // fact / pending：名次不在本站计算，页面必须按 kind 标注口径。
        // 名次按 yml 中的数组顺序生成（1 起）——这两类榜的名次来自权威结果或公开榜单，
        // 不是算出来的，但页面仍需要 rank 字段做编号，这里统一补齐。
        const rawItems = Array.isArray(r.items) ? r.items : [];
        ranks.push({
          slug: r.slug,
          title: r.title,
          kind: r.kind === 'fact' ? 'fact' : 'pending',
          size: r.size || 10,
          lede: r.lede || '',
          metrics: [],
          note: r.note || '',
          items: rawItems.map((it, i) => ({
            rank: i + 1,
            slug: it.slug,
            name: it.name,
            reason: it.note || '',
            score: null,
            gdp: null
          })),
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
      ranks: ranks
    });
  }

  let rankCount = 0;
  for (const g of groups) rankCount += g.ranks.length;

  return {
    error: null,
    meta: cr.meta || {},
    groups: groups,
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
}

module.exports = {
  buildCityRanks: buildCityRanks,
  cityMentions: cityMentions,
  cityMentionCount: cityMentionCount,
  findCity: findCity,
  findRank: findRank,
  metricValue: metricValue,
  normalize: normalize,
  computeRank: computeRank
};
