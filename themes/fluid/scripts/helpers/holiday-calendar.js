'use strict';

// 节假日页（/holidays/）的数据整理层。
//
// 为什么要有这一层，而不是在 .ejs 里现算：
//   1. 365 个格子的状态判定（放假 / 周末 / 节日 / 普通）需要一条明确的优先级，
//      散在模板里既不好读也没法测；
//   2. 日期必须只在一个地方被「解析」一次。source/_data/*.yml 里不带引号的
//      YYYY-MM-DD 会被 js-yaml 解析成 UTC 零点的 Date 对象，模板直出就是
//      「Sat Feb 06 2027 00:00:00 GMT+0000」（E-028）。这里统一转成 'YYYY-MM-DD'
//      字符串，模板永远拿不到 Date；
//   3. 星期必须与构建机器的时区无关。全部用 Date.UTC + getUTCDay 计算，
//      本地构建（+08:00）与 Vercel（UTC）结果一致。
//
// 用法（模板内）：const cal = holidayCalendar(site.data.holidays)
// 用法（测试内）：const { buildCalendar, tipPayload } = require('.../holiday-calendar.js')
//
// 位置约束：必须放在 themes/fluid/scripts/ 下且自包含——跨文件 require 在 Hexo 的
// vm 加载上下文里会解析失败（AGENTS.md §5.2）。

const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

// 把 Date / 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm...' 统一成 'YYYY-MM-DD'。
// 非法值返回 null，调用方跳过，不抛错（数据文件写错不该让整站构建失败）。
function toKey(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    // js-yaml 的 Date 是 UTC 零点：必须用 UTC getter，用本地 getter 在东八区
    // 会把 00:00Z 读成前一天/同一天，在西半球会读成前一天。
    return value.getUTCFullYear() + '-' + pad2(value.getUTCMonth() + 1) + '-' + pad2(value.getUTCDate());
  }
  const m = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return m[1] + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[3]));
}

function keyToParts(key) {
  const p = String(key).split('-');
  return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
}

// 0 = 周日 … 6 = 周六
function weekdayOf(key) {
  const { y, m, d } = keyToParts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(key, n) {
  const { y, m, d } = keyToParts(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}

// 含首尾的天数；end < start 视为 1 天（数据写反时不至于渲染出负数的格子）
function spanDays(startKey, endKey) {
  const a = keyToParts(startKey);
  const b = keyToParts(endKey || startKey);
  const diff = Math.round(
    (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000
  );
  return diff < 0 ? 1 : diff + 1;
}

function md(key) {
  const { m, d } = keyToParts(key);
  return pad2(m) + '-' + pad2(d);
}

function mdCn(key) {
  const { m, d } = keyToParts(key);
  return m + ' 月 ' + d + ' 日';
}

// 配图按节日类型挂在 meta.images 上，不随年份重复；单个节假日自己写了 img 时以它为准。
// 图片是 Wikimedia Commons 的自由授权图，署名与授权是使用条件，必须一路带到详情卡。
function normalizeHoliday(raw, label, images) {
  const start = toKey(raw.start) || toKey(raw.date);
  const end = toKey(raw.end) || start;
  if (!start) return null;
  const date = toKey(raw.date) || start;
  const id = raw.id || date;
  const pic = (images && images[id]) || {};
  return {
    id: id,
    name: raw.name || '',
    pinyin: raw.pinyin || '',
    date: date,
    wDate: WEEK_CN[weekdayOf(date)],
    dateLabel: mdCn(date),
    dateMd: md(date),
    start: start,
    end: end,
    startMd: md(start),
    endMd: md(end),
    startLabel: mdCn(start),
    endLabel: mdCn(end),
    days: spanDays(start, end),
    daysDeclared: Number(raw.days) || 0,
    statutory: Number(raw.statutory) || 0,
    makeup: (Array.isArray(raw.makeup) ? raw.makeup : []).map(toKey).filter(Boolean),
    arrange: raw.arrange || '',
    desc: raw.desc || '',
    label: label,
    anchor: 'holiday-' + id,
    img: raw.img || pic.file || '',
    alt: raw.alt || pic.alt || '',
    credit: pic.author || '',
    creditLicense: pic.license || '',
    creditUrl: pic.page || '',
    lunar: (raw.lunar && typeof raw.lunar === 'object') ? raw.lunar : null,
  };
}

function normalizeFestival(raw) {
  const date = toKey(raw.date);
  if (!date) return null;
  return {
    name: raw.name || '',
    pinyin: raw.pinyin || '',
    date: date,
    dateMd: md(date),
    dateLabel: mdCn(date),
    wName: WEEK_CN[weekdayOf(date)],
    kind: raw.kind || '节日',
    note: raw.note || '',
    lunar: raw.lunar || '',
  };
}

function normalizeTerm(raw) {
  const date = toKey(raw.date);
  if (!date) return null;
  return {
    name: raw.name || '',
    pinyin: raw.pinyin || '',
    date: date,
    dateMd: md(date),
    dateLabel: mdCn(date),
    wName: WEEK_CN[weekdayOf(date)],
    kind: '节气',
    note: '',
  };
}

// 「来源」只给官方年份标一行（参考站也只在这类年份下标）：
//   meta.sources 按年份存 → sources: { "2026": { date, url, label } }
// 预计年份返回 null，页面上靠「以上均为预计日期」那段说明。
function cnDate(key) {
  const { y, m, d } = keyToParts(key);
  return y + ' 年 ' + m + ' 月 ' + d + ' 日';
}

function sourceOf(data, src) {
  if (!src || !src.official) return null;
  const map = (data.meta && data.meta.sources) || null;
  if (!map || Array.isArray(map)) return null;
  const s = map[String(src.year)];
  if (!s || !s.url) return null;
  const dk = toKey(s.date);
  return {
    url: s.url,
    label: s.label || '',
    date: dk || '',
    dateLabel: dk ? cnDate(dk) : '',
  };
}

// 主入口。数据为空时返回 null，模板据此渲染「还没填」的诚实空态。
// year 为页面 front-matter 里声明的年份；缺省或找不到时回落到第一年（默认年）。
function buildCalendar(raw, wantYear) {
  const data = raw || {};
  const years = Array.isArray(data.years) ? data.years : [];
  let src = years[0];
  if (wantYear != null && wantYear !== '') {
    const hit = years.find((y) => Number(y.year) === Number(wantYear));
    if (hit) src = hit;
  }
  if (!src || !src.year) return null;

  const year = Number(src.year);
  const label = src.label || (src.official || (data.meta && data.meta.official) ? '官方' : '预计');

  // 年份级农历映射（春节区间的「除夕 / 正月初N」等）挂到每个节假日上，
  // 供详情卡按日期取农历；单个节假日自己带 lunar 映射时以它为准。
  const yearLunar = (src.lunar && typeof src.lunar === 'object') ? src.lunar : null;

  // 配图按节日类型共用（meta.images），十六个年份共用同一套图，不在每年重复写一遍。
  const images = (data.meta && data.meta.images) || null;

  const holidays = (Array.isArray(src.holidays) ? src.holidays : [])
    .map((h) => normalizeHoliday(h, label, images))
    .filter(Boolean)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  holidays.forEach((h) => { if (!h.lunar) h.lunar = yearLunar; });

  // ---- 调休上班日归属 ----
  // 数据里只有年份级的 makeup 列表，逐节日那一份以前是手工复制进去的，2025/2026 被复制成
  // 「每个节日都挂着整年 5~6 个调休日」——表里一列出来就是错的。改成按「离哪个假期最近」
  // 自动归属：调休日一定紧挨着它服务的那个假期（节前或节后），这个规则对十六年全部成立。
  //
  // 平局要偏向「节前」：2021-09-26 离中秋结束（09-21）和离国庆开始（10-01）都是 5 天，
  // 官方通知里它是国庆的节前调休日。所以打分写成 gap*2 + (节后 ? 1 : 0)。
  holidays.forEach((h) => { h.makeup = []; });
  (Array.isArray(src.makeup) ? src.makeup : []).map(toKey).filter(Boolean).forEach((mk) => {
    let best = null;
    let bestScore = Infinity;
    holidays.forEach((h) => {
      let gap = 0;
      let after = false;
      if (mk < h.start) gap = spanDays(mk, h.start) - 1;
      else if (mk > h.end) { gap = spanDays(h.end, mk) - 1; after = true; }
      const score = gap * 2 + (after ? 1 : 0);
      if (score < bestScore) { bestScore = score; best = h; }
    });
    if (best) {
      best.makeup.push(mk);
      best.makeup.sort();
    }
  });
  holidays.forEach((h) => {
    h.makeupLabel = h.makeup.map((mk) => md(mk) + ' ' + WEEK_CN[weekdayOf(mk)]);
  });

  const festivals = (Array.isArray(src.festivals) ? src.festivals : [])
    .map(normalizeFestival)
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const terms = (Array.isArray(src.terms) ? src.terms : [])
    .map(normalizeTerm)
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // ---- 逐日状态表 ----
  // 优先级（后者覆盖前者）：工作日 → 周末 → 调休上班 → 放假日
  // 节日 / 节气不覆盖底色，只加一个标记点（dot）：它们和「是否休息」是两个维度。
  const days = Object.create(null);
  const index = { festival: Object.create(null), term: Object.create(null), holiday: Object.create(null) };

  for (let m = 1; m <= 12; m += 1) {
    const n = daysInMonth(year, m);
    for (let d = 1; d <= n; d += 1) {
      const key = year + '-' + pad2(m) + '-' + pad2(d);
      const w = weekdayOf(key);
      days[key] = {
        key: key,
        m: m,
        d: d,
        w: w,
        wName: WEEK_CN[w],
        state: w === 0 || w === 6 ? 'weekend' : 'work',
        holiday: null,
        festival: null,
        term: null,
        dot: false,
      };
    }
  }

  festivals.forEach((f) => {
    if (days[f.date]) {
      days[f.date].festival = f;
      index.festival[f.date] = f;
    }
  });
  terms.forEach((t) => {
    if (days[t.date]) {
      // 同一天既有节日又有节气时，节日优先展示，节气保留在 term 里供悬停说明使用
      days[t.date].term = t;
      index.term[t.date] = t;
    }
  });
  holidays.forEach((h) => {
    index.holiday[h.id] = h;
    // 先落调休上班日，再落放假区间：两者万一在数据里重叠，放假优先
    // （调休上班日按定义落在放假区间之外，这条顺序只是防数据写错时不出现
    //  「区间内某天被标成要上班」的矛盾状态）。
    h.makeup.forEach((mk) => {
      if (days[mk]) days[mk].state = 'makeup';
    });
    let k = h.start;
    for (let i = 0; i < h.days; i += 1) {
      if (days[k]) {
        days[k].state = 'holiday';
        days[k].holiday = h;
      }
      k = addDays(k, 1);
    }
  });

  Object.keys(days).forEach((k) => {
    const r = days[k];
    r.dot = Boolean(r.festival || r.term);
    // 已经整格填了砖红的放假日不再叠点：实心块本身信息量更大，点在其上不可辨
    if (r.state === 'holiday') r.dot = false;
  });

  // ---- 12 行月历 ----
  const months = [];
  for (let m = 1; m <= 12; m += 1) {
    const cells = [];
    const n = daysInMonth(year, m);
    for (let d = 1; d <= n; d += 1) {
      const rec = days[year + '-' + pad2(m) + '-' + pad2(d)];
      cells.push({
        key: rec.key,
        d: rec.d,
        w: rec.w,
        wName: rec.wName,
        state: rec.state,
        dot: rec.dot,
        name: (rec.holiday && rec.holiday.name) || (rec.festival && rec.festival.name) || (rec.term && rec.term.name) || '',
      });
    }
    months.push({ m: m, label: m + ' 月', cells: cells });
  }

  // ---- 统计（页面上的数字全部是数出来的，不手填）----
  const stats = {
    holidayCount: holidays.length,
    holidayDays: holidays.reduce((s, h) => s + h.days, 0),
    statutoryDays: holidays.reduce((s, h) => s + h.statutory, 0),
    festivalCount: festivals.length,
    termCount: terms.length,
    weekendDays: Object.keys(days).filter((k) => days[k].state === 'weekend').length,
    makeupDays: Object.keys(days).filter((k) => days[k].state === 'makeup').length,
    totalDays: Object.keys(days).length,
  };

  return {
    year: year,
    years: years.map((y) => y.year),
    current: Number(src.year),
    prose: (data.meta && data.meta.prose) || '',
    faq: (data.meta && Array.isArray(data.meta.faq) ? data.meta.faq : []),
    label: label,
    official: Boolean(src.official || (data.meta && data.meta.official)),
    zodiac: src.zodiac || '',
    updated: (data.meta && toKey(data.meta.updated)) || '',
    notice: (data.meta && data.meta.notice) || '',
    // 只有官方年份才有「来源」可标（参考站也只在这类年份下标一行）。
    // 预计年份不标来源——页面上「以上均为预计日期」那段已经说清了。
    source: sourceOf(data, src),
    holidays: holidays,
    festivals: festivals,
    terms: terms,
    months: months,
    days: days,
    stats: stats,
  };
}

// 常驻详情卡的数据：只带「有内容可说」的日子（非普通工作日），
// 普通工作日的日期与星期由格子上的 data 属性在浏览器端拼出来，没必要上传 365 份。
//
// 字段与参考站的详情卡一一对应（date / lunar / kicker / name / pinyin / dayNo /
// desc / arrange / statutory / img），浏览器端按这个顺序渲染。
function tipPayload(cal) {
  const out = Object.create(null);
  if (!cal) return out;

  const dateLabel = (key) => {
    const { y, m, d } = keyToParts(key);
    return y + '年' + m + '月' + d + '日 ' + WEEK_CN[weekdayOf(key)];
  };

  Object.keys(cal.days).forEach((k) => {
    const r = cal.days[k];
    const isPlain = r.state === 'work' && !r.festival && !r.term;
    if (isPlain) return;

    const tip = { s: r.state, date: dateLabel(k) };

    if (r.holiday) {
      const h = r.holiday;
      tip.kicker = h.label + '法定节假日';
      tip.name = h.name;
      tip.pinyin = h.pinyin;
      tip.lunar = (h.lunar && h.lunar[k]) || '';
      tip.dayNo = '第 ' + (spanDays(h.start, k)) + ' 天，共 ' + h.days + ' 天';
      tip.desc = h.desc;
      tip.arrange = h.label + '放假：' + h.startMd + ' → ' + h.endMd + ' · ' + h.days + ' 天';
      tip.statutory = '法定假日 ' + h.statutory + ' 天，其余由周末与调休补足';
      tip.anchor = h.anchor;
      tip.img = h.img;
      tip.alt = h.alt;
      // 自由授权图必须带署名与授权，卡里显示、链回 Commons 原文件页
      if (h.credit) {
        tip.credit = '图：' + h.credit + ' / ' + h.creditLicense;
        tip.creditUrl = h.creditUrl;
      }
      // 放假期间撞上节日或节气时，作为补充说明（例如清明当天也是清明节气）
      const extra = [];
      if (r.festival) extra.push(r.festival.kind + '：' + r.festival.name);
      if (r.term) extra.push('节气：' + r.term.name);
      if (extra.length) tip.extra = extra.join('；');
    } else {
      tip.kicker = r.state === 'weekend' ? '周末' : (r.state === 'makeup' ? '调休上班' : '工作日');
      if (r.festival) {
        tip.kicker = r.festival.kind;
        tip.name = r.festival.name;
        tip.pinyin = r.festival.pinyin;
        tip.lunar = r.festival.lunar || '';
        tip.desc = r.festival.note;
        if (r.term) tip.extra = '节气：' + r.term.name;
      } else if (r.term) {
        tip.kicker = '节气';
        tip.name = r.term.name;
        tip.pinyin = r.term.pinyin;
        tip.desc = '二十四节气之一';
      }
    }
    out[k] = tip;
  });
  return out;
}

function holidayCalendar(raw, year) {
  return buildCalendar(raw, year);
}

if (typeof hexo !== 'undefined' && hexo && hexo.extend && hexo.extend.helper) {
  hexo.extend.helper.register('holidayCalendar', holidayCalendar);
  hexo.extend.helper.register('holidayTips', tipPayload);
}

module.exports = {
  WEEK_CN,
  toKey,
  weekdayOf,
  daysInMonth,
  addDays,
  spanDays,
  buildCalendar,
  tipPayload,
  holidayCalendar,
};
