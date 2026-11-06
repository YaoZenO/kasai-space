'use strict';

// 生肖页（/zodiac/、/zodiac/<动物>/）的数据整理层。
// 移植自 themes/fluid/scripts/helpers/zodiac-data.js（Hexo helper → Astro ESM）。
// 算法与注释保持原样，只做三处改动：
//   1. module.exports → 具名 export；
//   2. 删除文件末尾 hexo.extend.helper.register(...) 注册段（Astro 不走 Hexo helper）；
//   3. 补 TypeScript 类型标注（strict 模式），Math.min.apply 换成展开调用。
//
// 为什么要有这一层，而不是在 .ejs 里现算（与 holiday-calendar.js 同一理由）：
//   1. 干支、起止日期、地支关系都是确定性计算，散在模板里不好读也没法测；
//   2. 日期必须只在一个地方被「解析」一次——source/_data/*.yml 里不带引号的
//      YYYY-MM-DD 会被 js-yaml 解析成 UTC 零点的 Date 对象（E-028）；
//   3. 星期用 Date.UTC + getUTCDay 计算，本地构建（+08:00）与 Vercel（UTC）一致。
//
// 位置约束：必须放在 themes/fluid/scripts/ 下且自包含——跨文件 require 在 Hexo 的
// vm 加载上下文里解析失败（AGENTS.md §5.2）。不依赖构建日期：页面不写「今年」。
//
// 用法（模板内）：const z = zodiacData(site.data.zodiac, 'horse')
//                const ov = zodiacOverview(site.data.zodiac)
// 用法（测试内）：const { buildAnimal, buildOverview } = require('.../zodiac-data.js')

var STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
var BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
var ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
var STEM_PINYIN = ['jiǎ', 'yǐ', 'bǐng', 'dīng', 'wù', 'jǐ', 'gēng', 'xīn', 'rén', 'guǐ'];
var BRANCH_PINYIN = ['zǐ', 'chǒu', 'yín', 'mǎo', 'chén', 'sì', 'wǔ', 'wèi', 'shēn', 'yǒu', 'xū', 'hài'];
// 天干对应的五行：甲乙木、丙丁火、戊己土、庚辛金、壬癸水
var STEM_ELEMENT = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
var ANIMAL_SLUG: Record<string, string> = {
  鼠: 'rat', 牛: 'ox', 虎: 'tiger', 兔: 'rabbit', 龙: 'dragon', 蛇: 'snake',
  马: 'horse', 羊: 'goat', 猴: 'monkey', 鸡: 'rooster', 狗: 'dog', 猪: 'pig'
};
// 三合（四位相隔的三个地支合成一局）与六合（一阳一阴相配）。
// 六合六对：子丑、寅亥、卯戌、辰酉、巳申、午未——曾把辰酉/巳申/午未的索引写错
// （马年六合算出「鸡」），测试已按「鼠六合牛、马六合羊、猪六合虎」钉死。
var SANHE_GROUPS = [
  { members: [8, 0, 4], ju: '水局' },   // 申子辰
  { members: [11, 3, 7], ju: '木局' },  // 亥卯未
  { members: [2, 6, 10], ju: '火局' },  // 寅午戌
  { members: [5, 9, 1], ju: '金局' }    // 巳酉丑
];
var LIUHE_PAIRS = [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]];
// 六害（相隔六位的压制关系）与六冲（正对相对）
var HAI_PAIRS = [[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]];
var XING_PAIRS = [[0, 3]];                 // 子卯相刑
var XING_TRIOS = [[1, 10, 7], [2, 5, 8]];  // 丑戌未 / 寅巳申
var XING_SELF = [4, 6, 9, 11];             // 辰午酉亥 自刑

function mod(n: number, m: number): number { return ((n % m) + m) % m; }

function pad2(n: number): string { return n < 10 ? '0' + n : String(n); }

// 把 Date / 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm...' 统一成 'YYYY-MM-DD'。
// 非法值返回 null，调用方跳过，不抛错（数据写错不该让整站构建失败）。
// 与 holiday-calendar.js 同口径：js-yaml 的 Date 是 UTC 零点，必须用 UTC getter。
function toKey(value: any): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.getUTCFullYear() + '-' + pad2(value.getUTCMonth() + 1) + '-' + pad2(value.getUTCDate());
  }
  var m = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return m[1] + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[3]));
}

function keyToParts(key: string): { y: number; m: number; d: number } {
  var p = String(key).split('-');
  return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
}

function addDays(key: string, n: number): string {
  var p = keyToParts(key);
  var t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}

function spanDays(startKey: string, endKey?: string): number {
  var a = keyToParts(startKey);
  var b = keyToParts(endKey || startKey);
  var diff = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
  return diff < 0 ? 1 : diff + 1;
}

// 0 = 周日 … 6 = 周六
function weekdayOf(key: string): number {
  var p = keyToParts(key);
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

var WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function cnDate(key: string): string {
  var p = keyToParts(key);
  return p.y + ' 年 ' + p.m + ' 月 ' + p.d + ' 日';
}

function mdCn(key: string): string {
  var p = keyToParts(key);
  return p.m + ' 月 ' + p.d + ' 日';
}

// ---------- 干支计算 ----------

// 公元 Y 年的干支：以公元 4 年（甲子年）为基准。生肖年以春节为界，
// 1 月 1 日到春节之间仍属上一年的干支——这一点在页面上有说明，不在这里隐晦处理。
function ganzhiOf(year: number): any {
  var s = mod(year - 4, 10);
  var b = mod(year - 4, 12);
  return {
    stem: STEMS[s],
    branch: BRANCHES[b],
    stemIndex: s,
    branchIndex: b,
    element: STEM_ELEMENT[s],
    yinyang: s % 2 === 0 ? '阳' : '阴',
    ganzhi: STEMS[s] + BRANCHES[b],
    pinyin: STEM_PINYIN[s] + ' ' + BRANCH_PINYIN[b],
    title: STEM_ELEMENT[s] + ANIMALS[b] // 如「火马」
  };
}

// ---------- 地支关系（三合 / 六合 / 六冲 / 六害 / 相刑） ----------

function relationsOf(branchIndex: number): any[] {
  var out: any[] = [];

  SANHE_GROUPS.forEach(function (g) {
    if (g.members.indexOf(branchIndex) === -1) return;
    var partners = g.members.filter(function (i) { return i !== branchIndex; });
    out.push({
      name: '三合',
      partners: partners.map(function (i) { return ANIMALS[i]; }),
      note: '三者合成' + g.ju + '，互相增强'
    });
  });

  LIUHE_PAIRS.forEach(function (p) {
    if (p.indexOf(branchIndex) === -1) return;
    var other = p[0] === branchIndex ? p[1] : p[0];
    out.push({
      name: '六合',
      partners: [ANIMALS[other]],
      note: '一阳一阴，气自然相合'
    });
  });

  out.push({
    name: '六冲',
    partners: [ANIMALS[mod(branchIndex + 6, 12)]],
    note: '在十二地支环上正对相对，传统上是最强的对立'
  });

  HAI_PAIRS.forEach(function (p) {
    if (p.indexOf(branchIndex) === -1) return;
    var other = p[0] === branchIndex ? p[1] : p[0];
    out.push({
      name: '六害',
      partners: [ANIMALS[other]],
      note: '互相压制、慢慢消耗'
    });
  });

  if (XING_SELF.indexOf(branchIndex) !== -1) {
    out.push({
      name: '相刑',
      partners: [ANIMALS[branchIndex]],
      note: '同属相自刑'
    });
  } else {
    XING_PAIRS.forEach(function (p) {
      if (p.indexOf(branchIndex) === -1) return;
      var other = p[0] === branchIndex ? p[1] : p[0];
      out.push({ name: '相刑', partners: [ANIMALS[other]], note: '相刑相伤' });
    });
    XING_TRIOS.forEach(function (t) {
      if (t.indexOf(branchIndex) === -1) return;
      var partners = t.filter(function (i) { return i !== branchIndex; });
      out.push({ name: '相刑', partners: partners.map(function (i) { return ANIMALS[i]; }), note: '相刑相伤' });
    });
  }

  return out;
}

// ---------- 生肖年跨度（以春节为界，GB/T 33661-2017） ----------

function yearSpan(featured: number, sf: any): { start: string; end: string } | null {
  var start = toKey(sf && sf[String(featured)]);
  var nextStart = toKey(sf && sf[String(featured + 1)]);
  if (!start || !nextStart) return null;
  return { start: start, end: addDays(nextStart, -1) };
}

// 同一生肖的公历年份（每 12 年一个），范围 1920-2060
function occurrencesOf(featured: number): any[] {
  var out: any[] = [];
  for (var y = 1920; y <= 2060; y += 1) {
    if (mod(y - featured, 12) !== 0) continue;
    var g = ganzhiOf(y);
    out.push({
      year: y,
      ganzhi: g.ganzhi,
      element: g.element,
      yinyang: g.yinyang,
      title: g.title,
      current: y === featured
    });
  }
  return out;
}

// ---------- 主入口：单个生肖页 ----------

// 2026-10-25 重构：页面从「某一年专页」改为「生肖主题页」。
// 数据里只写内容章节（sections）；「传统配对」「吉祥象征」两节由 helper 注入——
// 它们是计算产物（地支关系）与固定结构，不进数据文件，避免 12 个生肖各抄一遍。
// kind 决定模板的渲染方式：years=跟年份表 relations=配对表 luck=幸运表 vocab=词表 faq=折叠列表。

function buildAnimal(raw: any, wantKey: string): any {
  var data = raw || {};
  var list = Array.isArray(data.animals) ? data.animals : [];
  var src: any = null;
  for (var i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].key === wantKey) { src = list[i]; break; }
  }
  if (!src || !src.featured) return null;

  var sf = (data.meta && data.meta.springFestival) || {};
  var featured = Number(src.featured);
  var g = ganzhiOf(featured);
  var animal = src.animal || ANIMALS[g.branchIndex];
  var idx = ANIMALS.indexOf(animal);
  if (idx === -1) idx = g.branchIndex;
  var span = yearSpan(featured, sf);
  var elements = (data.meta && Array.isArray(data.meta.elements)) ? data.meta.elements : [];
  var elInfo: any = null;
  for (var e = 0; e < elements.length; e += 1) {
    if (elements[e].element === g.element) { elInfo = elements[e]; break; }
  }

  // 引导段：全部由数据算出，模板不含手写日期（与节假日页同律）
  var lede = '';
  if (span) {
    lede = featured + ' 年是干支' + g.ganzhi + '、五行属' + g.element + '的' + animal + '年，'
      + '传统上也称' + g.ganzhi + g.title + '年。生肖年从春节起算：'
      + '这一年的' + animal + '年从 ' + cnDate(span.start) + '（' + WEEK_CN[weekdayOf(span.start)] + '）开始，'
      + '到 ' + cnDate(span.end) + '结束。天干与地支配对成六十甲子，同一个干支组合六十年出现一次——'
      + '上一个' + g.ganzhi + '年是 ' + (featured - 60) + ' 年，下一个要等到 ' + (featured + 60) + ' 年。';
  }

  // 基本信息表（无数据不渲染）
  var facts = [
    { k: '干支', v: g.ganzhi + '（' + g.pinyin + '）' },
    { k: '五行 · 阴阳', v: g.element + ' · ' + g.yinyang },
    { k: '生肖位次', v: '第' + ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][idx] + '位' }
  ];
  if (span) {
    facts.push({
      k: '生肖年起止',
      v: '<time datetime="' + span.start + '">' + span.start + '</time> → <time datetime="' + span.end + '">' + span.end + '</time>（自春节起算）'
    });
  }
  facts.push({ k: '同一干支', v: (featured - 60) + ' · ' + featured + ' · ' + (featured + 60) + '（六十年一轮）' });
  facts.push({ k: '英文名称', v: 'Year of the ' + (src.english || '') });

  // 幸运数字与颜色：只渲染有值的行；五行传统对应始终渲染
  var luck: any[] = [];
  var luckRaw = src.luck || {};
  if (elInfo) {
    luck.push({ k: '五行传统对应', v: g.element + ' · ' + elInfo.direction + ' · ' + elInfo.color });
  }
  var luckRows = [
    ['幸运数字（民间说法）', luckRaw.numbers],
    ['避讳数字（民间说法）', luckRaw.avoidNumbers],
    ['幸运色（民间说法）', luckRaw.colors],
    ['避讳色（民间说法）', luckRaw.avoidColors],
    ['幸运花卉', luckRaw.flowers],
    ['吉利方位', luckRaw.directions],
    ['避讳方位', luckRaw.avoidDirections]
  ];
  luckRows.forEach(function (r) {
    if (r[1]) luck.push({ k: r[0], v: String(r[1]) });
  });

  // 章节列表：数据章节 + 注入的「传统配对」「吉祥象征」。
  // 目录由模板按这个顺序渲染，JS 的 scrollspy 也按它——单一来源。
  var ordered: any[] = [];
  var luckInjected = false;
  (Array.isArray(src.sections) ? src.sections : []).forEach(function (s: any) {
    if (!s || !s.title) return;
    ordered.push(s);
    if (s.id === 'meaning') {
      ordered.push({ id: 'relations', title: '传统配对', body: '', kind: 'relations' });
    }
    // 「吉祥象征」插在传说（或名人）之后；两个 id 都可能触发，只注入一次
    if (!luckInjected && (s.id === 'tales' || s.id === 'famous')) {
      ordered.push({ id: 'luck', title: '吉祥象征', body: '', kind: 'luck' });
      luckInjected = true;
    }
  });

  var prevKey = ANIMAL_SLUG[ANIMALS[mod(idx - 1, 12)]];
  var nextKey = ANIMAL_SLUG[ANIMALS[mod(idx + 1, 12)]];
  var images = (data.meta && data.meta.images) || {};

  return {
    key: src.key,
    animal: animal,
    pinyin: src.pinyin || '',
    english: src.english || '',
    featured: featured,
    title: animal + '年',
    intro: src.intro || '',
    ganzhi: g.ganzhi,
    element: g.element,
    yinyang: g.yinyang,
    branch: g.branch,
    position: idx + 1,
    positionCn: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][idx],
    lede: lede,
    span: span,
    spanDays: span ? spanDays(span.start, span.end) : 0,
    sameGanzhi: [featured - 60, featured, featured + 60],
    facts: facts,
    occurrences: occurrencesOf(featured),
    relations: relationsOf(g.branchIndex),
    luck: luck,
    luckNote: luckRaw.note || '',
    sections: ordered,
    vocab: Array.isArray(src.vocab) ? src.vocab : [],
    faq: Array.isArray(src.faq) ? src.faq : [],
    image: images[src.key] || null,
    prev: { key: prevKey, animal: ANIMALS[mod(idx - 1, 12)] },
    next: { key: nextKey, animal: ANIMALS[mod(idx + 1, 12)] },
    updated: toKey(data.meta && data.meta.updated) || ''
  };
}

// ---------- 主入口：索引页 ----------

function buildOverview(raw: any): any {
  var data = raw || {};
  var list = Array.isArray(data.animals) ? data.animals : [];
  if (!list.length) return null;
  var sf = (data.meta && data.meta.springFestival) || {};

  var rows = list.map(function (a: any) {
    var featured = Number(a.featured);
    var g = ganzhiOf(featured);
    var span = yearSpan(featured, sf);
    var idx = ANIMALS.indexOf(a.animal);
    // 出生年份：1948-2043 之间与该生肖同余的年份
    var years: number[] = [];
    for (var y = 1948; y <= 2043; y += 1) {
      if (mod(y - featured, 12) === 0) years.push(y);
    }
    return {
      key: a.key,
      animal: a.animal,
      pinyin: a.pinyin || '',
      english: a.english || '',
      branch: g.branch,
      position: idx + 1,
      featured: featured,
      ganzhi: g.ganzhi,
      element: g.element,
      title: g.title,
      span: span,
      birthYears: years
    };
  });

  // 三合与相冲总表（索引页用）
  var sanhe = SANHE_GROUPS.map(function (g) {
    return {
      animals: g.members.map(function (i) { return ANIMALS[i]; }),
      ju: g.ju
    };
  });
  var chong: string[][] = [];
  for (var b = 0; b < 6; b += 1) {
    chong.push([ANIMALS[b], ANIMALS[b + 6]]);
  }

  var featuredYears = rows.map(function (r: any) { return r.featured; });

  return {
    rows: rows,
    cycle: { from: Math.min(...featuredYears), to: Math.max(...featuredYears) },
    sanhe: sanhe,
    chong: chong,
    lede: (data.meta && data.meta.lede) || '',
    elements: (data.meta && Array.isArray(data.meta.elements)) ? data.meta.elements : [],
    prose: (data.meta && data.meta.prose) || '',
    faq: (data.meta && Array.isArray(data.meta.faq)) ? data.meta.faq : [],
    updated: toKey(data.meta && data.meta.updated) || ''
  };
}

function zodiacData(raw: any, key: string): any {
  return buildAnimal(raw, key);
}

export {
  STEMS,
  BRANCHES,
  ANIMALS,
  ANIMAL_SLUG,
  STEM_ELEMENT,
  toKey,
  weekdayOf,
  addDays,
  spanDays,
  ganzhiOf,
  relationsOf,
  yearSpan,
  occurrencesOf,
  buildAnimal,
  buildOverview,
  zodiacData
};
