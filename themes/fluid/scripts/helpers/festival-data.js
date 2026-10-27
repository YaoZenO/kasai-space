'use strict';

// 节日文化详情页族（/library/<slug>/）的数据整理层。
//
// 为什么要有这一层，而不是在 .ejs 里现算（与 zodiac-data.js / holiday-calendar.js 同一理由）：
//   1. 跨源取数规则必须只写一遍：法定 6 个取 holidays.yml 的 holidays[]（按 id），
//      传统 6 个取 festivals[]（按中文名）。其中 dongzhi 在 festivals[] 与 terms[] 都有——
//      terms[] 是只有日期的裸记录（无农历、无 note），必须取 festivals[]，这里写死（PRD §4.1）；
//      qingming 既是法定假日又是节气，holidays.yml 的 holidays[] 与 terms[] 都有，必须取 holidays[]。
//   2. 日期只在一个地方被「解析」一次——YAML 里带引号的日期也可能被后续改动去掉引号，
//      js-yaml 会解析成 UTC 零点的 Date 对象（E-028），toKey 统一兜住。
//   3. 星期用 Date.UTC + getUTCDay 计算，本地构建（+08:00）与 Vercel（UTC）一致。
//
// 位置约束：必须放在 themes/fluid/scripts/ 下且自包含——跨文件 require 在 Hexo 的
// vm 加载上下文里解析失败（AGENTS.md §5.2），所以 toKey 等工具函数在本文件内有一份拷贝。
//
// 数据来源（PRD §5.1 方案 C，单一真相）：本 helper 不持有任何日期。逐年日期、农历、
// 放假区间、调休上班日、「官方 / 预计」口径全部现算自 holidays.yml；festivals.yml 只存
// 内容文案与静态素材。
//
// 用法（模板内）：var f = buildFestival(site.data.festivals, site.data.holidays, page.festival)
// 用法（测试内）：const { buildFestival, currentYearOf, FESTIVAL_KEY } = require('.../festival-data.js')
//
// 缺数据不静默（E-047）：任何一级取不到数据都返回 { error: '…' }，模板据此渲染
// 显眼的错误占位而不是空白页。

function pad2(n) { return n < 10 ? '0' + n : String(n); }

// 把 Date / 'YYYY-MM-DD' 统一成 'YYYY-MM-DD'。非法值返回 null，调用方按缺数据处理。
// 与 zodiac-data.js 同口径：js-yaml 的 Date 是 UTC 零点，必须用 UTC getter。
function toKey(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.getUTCFullYear() + '-' + pad2(value.getUTCMonth() + 1) + '-' + pad2(value.getUTCDate());
  }
  var m = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return m[1] + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[3]));
}

function keyToParts(key) {
  var p = String(key).split('-');
  return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
}

// 日期加 n 天（调休上班日常落在假期结束之后几天，取窗口要用它）
function addDays(key, n) {
  var p = keyToParts(key);
  var t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}

// 0 = 周日 … 6 = 周六
function weekdayOf(key) {
  var p = keyToParts(key);
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

var WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function cnDate(key) {
  var p = keyToParts(key);
  return p.y + ' 年 ' + p.m + ' 月 ' + p.d + ' 日';
}

function mdCn(key) {
  var p = keyToParts(key);
  return p.m + ' 月 ' + p.d + ' 日';
}

// ---------- slug → holidays.yml 取数入口的显式映射表 ----------
// source: 'holidays' = 该年的 holidays[]（按 id，法定节日专用）
//         'festivals' = 该年的 festivals[]（按 name，传统节日与冬至专用）
// dongzhi 故意不用 terms[]：terms 里只有 { name, pinyin, date }，是裸记录（PRD §4.1 陷阱）。
var FESTIVAL_KEY = {
  yuandan:   { source: 'holidays',  key: 'yuandan' },
  chunjie:   { source: 'holidays',  key: 'chunjie' },
  qingming:  { source: 'holidays',  key: 'qingming' },
  duanwu:    { source: 'holidays',  key: 'duanwu' },
  zhongqiu:  { source: 'holidays',  key: 'zhongqiu' },
  guoqing:   { source: 'holidays',  key: 'guoqing' },
  yuanxiao:  { source: 'festivals', key: '元宵节' },
  qixi:      { source: 'festivals', key: '七夕节' },
  zhongyuan: { source: 'festivals', key: '中元节' },
  chongyang: { source: 'festivals', key: '重阳节' },
  dongzhi:   { source: 'festivals', key: '冬至' },
  laba:      { source: 'festivals', key: '腊八节' }
};

// 「当前年份」采用数据驱动口径：holidays.yml 里最新的 official === true 的年份。
// 不用构建日期（new Date()）——页面不写「今年」，构建可复现（AGENTS.md §5.2）。
function currentYearOf(holidaysRaw) {
  var years = (holidaysRaw && Array.isArray(holidaysRaw.years)) ? holidaysRaw.years : [];
  var max = null;
  for (var i = 0; i < years.length; i += 1) {
    var y = years[i];
    if (y && y.official === true && (max == null || y.year > max)) max = y.year;
  }
  return max;
}

// 从某一年的数据里取一个节日的当日记录（holidays[] 按 id / festivals[] 按 name）
function recordInYear(yearEntry, mapping) {
  if (!yearEntry) return null;
  var list = mapping.source === 'holidays' ? (yearEntry.holidays || []) : (yearEntry.festivals || []);
  for (var i = 0; i < list.length; i += 1) {
    var r = list[i];
    if (!r) continue;
    if (mapping.source === 'holidays' ? r.id === mapping.key : r.name === mapping.key) return r;
  }
  return null;
}

// 该年里落在假期窗口 [start−7, end+7] 内的调休上班日（拼假用的周末上班日，
// 常出现在假期开始前或结束后几天，所以窗口向两端各放宽一周）
function makeupInRange(makeupList, startKey, endKey) {
  var out = [];
  var lo = addDays(startKey, -7);
  var hi = addDays(endKey, 7);
  var list = Array.isArray(makeupList) ? makeupList : [];
  for (var i = 0; i < list.length; i += 1) {
    var k = toKey(list[i]);
    if (!k) continue;
    if (k >= lo && k <= hi) out.push(k);
  }
  return out;
}

// 逐年表：默认取 currentYear 起共 11 行（2026–2036）。数据不足按实际行数返回，
// 由测试断言行数，不在 helper 里硬凑。
function tableRowsFor(mapping, holidaysRaw, fromYear, rowCount) {
  var years = (holidaysRaw && Array.isArray(holidaysRaw.years)) ? holidaysRaw.years : [];
  var sorted = years.filter(function (y) { return y && y.year >= fromYear; })
    .sort(function (a, b) { return a.year - b.year; })
    .slice(0, rowCount);
  return sorted.map(function (y) {
    var label = y.label || (y.official === false ? '预计' : '官方');
    var rec = recordInYear(y, mapping);
    if (!rec) return { year: y.year, label: label, missing: true };
    var date = toKey(rec.date);
    if (!date) return { year: y.year, label: label, missing: true };
    var row = {
      year: y.year,
      label: label,
      official: y.official === true,
      date: date,
      weekday: WEEK_CN[weekdayOf(date)],
      lunar: (y.lunar && y.lunar[date]) || ''
    };
    if (rec.start && rec.end) {
      row.start = toKey(rec.start);
      row.end = toKey(rec.end);
      row.days = Number(rec.days) || 1;
      row.makeup = makeupInRange(y.makeup, row.start, row.end);
      row.arrange = rec.arrange || '';
    }
    return row;
  });
}

// 章节序列：内容章节（sections[]）+ 注入的词汇/问答两个结构性小节。
// vocab/faq 的标题全站统一，且这两节没有正文（只有表），所以不进 festivals.yml 的
// sections[]，由 helper 注入——目录、正文、锚点仍然单一来源。
var VOCAB_SECTION = { id: 'vocab', title: '词汇表与祝福语', kind: 'vocab' };
var FAQ_SECTION = { id: 'faq', title: '常见问题', kind: 'faq' };

function orderedSections(srcSections) {
  var out = [];
  var injected = false;
  (Array.isArray(srcSections) ? srcSections : []).forEach(function (s) {
    if (!s || !s.id) return;
    out.push(s);
    if (s.id === 'food' && !injected) {
      out.push(VOCAB_SECTION);
      out.push(FAQ_SECTION);
      injected = true;
    }
  });
  if (!injected) { // 兜底：数据异常时仍保证两节存在（放最后，不静默丢节）
    out.push(VOCAB_SECTION);
    out.push(FAQ_SECTION);
  }
  return out;
}

// ---------- 主入口 ----------

function buildFestival(festivalsRaw, holidaysRaw, slug, pageYear) {
  var fdata = festivalsRaw || {};
  var hdata = holidaysRaw || {};
  var list = Array.isArray(fdata.festivals) ? fdata.festivals : [];
  var mapping = FESTIVAL_KEY[slug];

  if (!mapping) {
    return { error: 'festival-data: 未知 slug「' + slug + '」（FESTIVAL_KEY 无此项）' };
  }
  var src = null;
  for (var i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].key === slug) { src = list[i]; break; }
  }
  if (!src) {
    return { error: 'festival-data: festivals.yml 缺少 key 为「' + slug + '」的条目（E-047）' };
  }
  var cur = Number(pageYear) || currentYearOf(hdata);
  if (!cur) {
    return { error: 'festival-data: holidays.yml 没有 official === true 的年份，无法确定当前年份（E-047）' };
  }
  var years = (hdata.years || []).filter(function (y) { return y && y.year >= cur; });
  if (!years.length) {
    return { error: 'festival-data: holidays.yml 没有 ' + cur + ' 年及以后的数据（E-047）' };
  }

  var isLegal = mapping.source === 'holidays';
  var rows = tableRowsFor(mapping, hdata, cur, 11);
  if (!rows.length) {
    return { error: 'festival-data: ' + slug + ' 在 ' + cur + ' 年及以后没有任何逐年记录（E-047）' };
  }
  var missingRows = rows.filter(function (r) { return r.missing; });
  if (missingRows.length) {
    return { error: 'festival-data: ' + slug + ' 缺少年份记录：' + missingRows.map(function (r) { return r.year; }).join(', ') + '（E-047）' };
  }
  var currentRow = rows[0];

  // facts：前三行是静态素材（festivals.yml），后三行由本 helper 计算（PRD §6.1 行序固定）
  var facts = (Array.isArray(src.facts) ? src.facts : []).map(function (r) { return { k: r.k, v: r.v }; });
  if (isLegal) {
    var stat = Number(src.statutory) || 0;
    facts.push({ k: '是否法定节假日', v: '是' });
    facts.push({ k: '法定放假天数', v: stat + ' 天（法定假日天数，与调休后的连休天数不是一回事）' });
  } else {
    facts.push({ k: '是否法定节假日', v: '否' });
    facts.push({ k: '法定放假天数', v: '无（不放假，不在《放假办法》第二条的七项之内）' });
  }
  facts.push({
    k: cur + ' 年当天',
    v: '<time datetime="' + currentRow.date + '">' + mdCn(currentRow.date) + '</time>（' + currentRow.weekday + '）'
  });

  // {{year}} 占位符统一替换为当前年份（内容文案里的「今年」不写死）
  function fill(text) { return String(text == null ? '' : text).replace(/\{\{year\}\}/g, String(cur)); }

  var sections = orderedSections(src.sections).map(function (s) {
    return {
      id: s.id,
      title: s.title || '',
      kind: s.kind || (s.body ? 'prose' : ''),
      body: s.body ? fill(s.body) : (s.body === '' ? '' : null)
    };
  });

  var images = (fdata.meta && fdata.meta.images) || {};
  var image = images[slug] || null;

  return {
    slug: slug,
    key: src.key,
    name: src.name || '',
    pinyin: src.pinyin || '',
    kind: src.kind || (isLegal ? 'legal' : 'traditional'),
    desc: fill(src.desc || ''),
    lede: fill(src.lede || ''),
    facts: facts,
    legal: isLegal,
    statutory: isLegal ? (Number(src.statutory) || 0) : 0,
    calendarTable: src.calendarTable === true, // true = 年份表走「放假日历表」变体（yuandan/guoqing）
    tableMode: src.calendarTable === true ? 'calendar' : 'date',
    tableRows: rows,
    tableYears: [rows[0].year, rows[rows.length - 1].year],
    currentYear: cur,
    currentRow: currentRow,
    sections: sections,
    vocab: Array.isArray(src.vocab) ? src.vocab : [],
    greetingsLabel: src.greetingsLabel || '祝福语',
    greetings: Array.isArray(src.greetings) ? src.greetings : [],
    faq: Array.isArray(src.faq) ? src.faq : [],
    image: image,
    imageCss: !!(image && image.css === true),
    notice: (fdata.meta && fdata.meta.notice) || '',
    updated: toKey(fdata.meta && fdata.meta.updated) || ''
  };
}

if (typeof hexo !== 'undefined' && hexo && hexo.extend && hexo.extend.helper) {
  hexo.extend.helper.register('buildFestival', buildFestival);
  hexo.extend.helper.register('festivalCurrentYear', currentYearOf);
}

module.exports = {
  FESTIVAL_KEY,
  toKey,
  weekdayOf,
  WEEK_CN,
  cnDate,
  mdCn,
  addDays,
  currentYearOf,
  recordInYear,
  makeupInRange,
  tableRowsFor,
  orderedSections,
  buildFestival
};
