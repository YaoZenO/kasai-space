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
//
// 移植自 themes/fluid/scripts/helpers/holiday-calendar.js（Hexo helper → Astro ESM）。
// 算法与注释保持原样，只做两处改动：
//   1. module.exports → 具名 export；
//   2. 删除文件末尾 hexo.extend.helper.register(...) 注册段（Astro 不走 Hexo helper）。

const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEK_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// 生肖动物名 → 生肖页 slug（/zodiac/<slug>/）。与 zodiac-data.js 的 ANIMAL_SLUG 一致，
// 两边各自维护（Hexo 的 vm 上下文里跨文件 require 会失败，AGENTS.md §5.2）——
// test/zodiac-e2e.js 锁死两边相同。数据里没有对应动物时留空，引导段少一句链接。
const ANIMAL_SLUG: Record<string, string> = {
  鼠: 'rat', 牛: 'ox', 虎: 'tiger', 兔: 'rabbit', 龙: 'dragon', 蛇: 'snake',
  马: 'horse', 羊: 'goat', 猴: 'monkey', 鸡: 'rooster', 狗: 'dog', 猪: 'pig'
};

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

// 把 Date / 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm...' 统一成 'YYYY-MM-DD'。
// 非法值返回 null，调用方跳过，不抛错（数据文件写错不该让整站构建失败）。
function toKey(value: any): string | null {
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

function keyToParts(key: string): { y: number; m: number; d: number } {
  const p = String(key).split('-');
  return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
}

// 0 = 周日 … 6 = 周六
function weekdayOf(key: string): number {
  const { y, m, d } = keyToParts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(key: string, n: number): string {
  const { y, m, d } = keyToParts(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}

// 含首尾的天数；end < start 视为 1 天（数据写反时不至于渲染出负数的格子）
function spanDays(startKey: string, endKey?: string): number {
  const a = keyToParts(startKey);
  const b = keyToParts(endKey || startKey);
  const diff = Math.round(
    (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000
  );
  return diff < 0 ? 1 : diff + 1;
}

function md(key: string): string {
  const { m, d } = keyToParts(key);
  return pad2(m) + '-' + pad2(d);
}

function mdCn(key: string): string {
  const { m, d } = keyToParts(key);
  return m + ' 月 ' + d + ' 日';
}

// 配图按节日类型挂在 meta.images 上，不随年份重复；单个节假日自己写了 img 时以它为准。
// 图片是 Wikimedia Commons 的自由授权图，署名与授权是使用条件，必须一路带到详情卡。
function normalizeHoliday(raw: any, label: string, images: any): any {
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

function normalizeFestival(raw: any): any {
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

function normalizeTerm(raw: any): any {
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
function cnDate(key: string): string {
  const { y, m, d } = keyToParts(key);
  return y + ' 年 ' + m + ' 月 ' + d + ' 日';
}

function sourceOf(data: any, src: any): any {
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
function buildCalendar(raw: any, wantYear?: any): any {
  const data = raw || {};
  const years = Array.isArray(data.years) ? data.years : [];
  let src = years[0];
  if (wantYear != null && wantYear !== '') {
    const hit = years.find((y: any) => Number(y.year) === Number(wantYear));
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

  // 生肖年：春节落进公历哪一年，就算那一年的生肖（2026-02-17 起 = 丙午马年，
  // 与参考站一致）。数据里没有就留空，引导段自动少一句。
  const official = Boolean(src.official || (data.meta && data.meta.official));
  const zodiac = (src.zodiac && src.zodiac.ganzhi)
    ? { ganzhi: String(src.zodiac.ganzhi), animal: String(src.zodiac.animal || ''), element: String(src.zodiac.element || '') }
    : null;

  const holidays = (Array.isArray(src.holidays) ? src.holidays : [])
    .map((h: any) => normalizeHoliday(h, label, images))
    .filter(Boolean)
    .sort((a: any, b: any) => (a.start < b.start ? -1 : 1));
  holidays.forEach((h: any) => { if (!h.lunar) h.lunar = yearLunar; });

  // ---- 调休上班日归属 ----
  // 数据里只有年份级的 makeup 列表，逐节日那一份以前是手工复制进去的，2025/2026 被复制成
  // 「每个节日都挂着整年 5~6 个调休日」——表里一列出来就是错的。改成按「离哪个假期最近」
  // 自动归属：调休日一定紧挨着它服务的那个假期（节前或节后），这个规则对十六年全部成立。
  //
  // 平局要偏向「节前」：2021-09-26 离中秋结束（09-21）和离国庆开始（10-01）都是 5 天，
  // 官方通知里它是国庆的节前调休日。所以打分写成 gap*2 + (节后 ? 1 : 0)。
  holidays.forEach((h: any) => { h.makeup = []; });
  (Array.isArray(src.makeup) ? src.makeup : []).map(toKey).filter(Boolean).forEach((mk: any) => {
    let best: any = null;
    let bestScore = Infinity;
    holidays.forEach((h: any) => {
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
  holidays.forEach((h: any) => {
    h.makeupLabel = h.makeup.map((mk: string) => md(mk) + ' ' + WEEK_CN[weekdayOf(mk)]);
  });

  const festivals = (Array.isArray(src.festivals) ? src.festivals : [])
    .map(normalizeFestival)
    .filter(Boolean)
    .sort((a: any, b: any) => (a.date < b.date ? -1 : 1));

  const terms = (Array.isArray(src.terms) ? src.terms : [])
    .map(normalizeTerm)
    .filter(Boolean)
    .sort((a: any, b: any) => (a.date < b.date ? -1 : 1));

  // ---- 逐日状态表 ----
  // 优先级（后者覆盖前者）：工作日 → 周末 → 调休上班 → 放假日
  // 节日 / 节气不覆盖底色，只加一个标记点（dot）：它们和「是否休息」是两个维度。
  const days: any = Object.create(null);
  const index: any = { festival: Object.create(null), term: Object.create(null), holiday: Object.create(null) };

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

  festivals.forEach((f: any) => {
    if (days[f.date]) {
      days[f.date].festival = f;
      index.festival[f.date] = f;
    }
  });
  terms.forEach((t: any) => {
    if (days[t.date]) {
      // 同一天既有节日又有节气时，节日优先展示，节气保留在 term 里供悬停说明使用
      days[t.date].term = t;
      index.term[t.date] = t;
    }
  });
  holidays.forEach((h: any) => {
    index.holiday[h.id] = h;
    // 先落调休上班日，再落放假区间：两者万一在数据里重叠，放假优先
    // （调休上班日按定义落在放假区间之外，这条顺序只是防数据写错时不出现
    //  「区间内某天被标成要上班」的矛盾状态）。
    h.makeup.forEach((mk: string) => {
      if (days[mk]) {
        days[mk].state = 'makeup';
        // 记住这个调休日服务的是哪个假期，供一览格子打 data-h（聚焦高亮按它分组）
        days[mk].makeupOf = h;
      }
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

  Object.keys(days).forEach((k: string) => {
    const r = days[k];
    r.dot = Boolean(r.festival || r.term);
    // 已经整格填了砖红的放假日不再叠点：实心块本身信息量更大，点在其上不可辨
    if (r.state === 'holiday') r.dot = false;
  });

  // ---- 格子的原生 title ----
  // 参考站：<i title="1月9日，周六">（普通格）/ <i title="1 月 1 日，星期五。预计放假：元旦">（假期格）。
  // 浏览器自带的那个小框框就是「几月几日」的来源；自定义详情卡只服务有内容的日子。
  function cellTip(rec: any, label: string): string {
    const base = mdCn(rec.key) + '，' + WEEK_FULL[rec.w];
    if (rec.holiday) return base + '。' + label + '放假：' + rec.holiday.name;
    if (rec.state === 'makeup') return base + '。调休上班';
    if (rec.festival) return base + '。' + rec.festival.kind + '：' + rec.festival.name;
    if (rec.term) return base + '。节气：' + rec.term.name;
    return base;
  }

  // ---- 12 行月历 ----
  const months: any[] = [];
  for (let m = 1; m <= 12; m += 1) {
    const cells: any[] = [];
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
        // 该格属于哪个法定节假日（调休日算它服务的那一个），聚焦高亮按这个分组
        hid: (rec.holiday && rec.holiday.id) || (rec.makeupOf && rec.makeupOf.id) || '',
        name: (rec.holiday && rec.holiday.name) || (rec.festival && rec.festival.name) || (rec.term && rec.term.name) || '',
        // 原生 title：普通日期也要有个「几月几日 星期几」的小框框（参考站每个格子都有
        // title，自定义详情卡只给有内容的那些）。这里一次算好，模板直接输出。
        tip: cellTip(rec, label),
      });
    }
    months.push({ m: m, label: m + ' 月', cells: cells });
  }

  // ---- 统计（页面上的数字全部是数出来的，不手填）----
  const stats = {
    holidayCount: holidays.length,
    holidayDays: holidays.reduce((s: number, h: any) => s + h.days, 0),
    statutoryDays: holidays.reduce((s: number, h: any) => s + h.statutory, 0),
    festivalCount: festivals.length,
    termCount: terms.length,
    weekendDays: Object.keys(days).filter((k: string) => days[k].state === 'weekend').length,
    makeupDays: Object.keys(days).filter((k: string) => days[k].state === 'makeup').length,
    totalDays: Object.keys(days).length,
  };

  // ---- 页头引导段（参考站 .hc-lede）----
  // 节假日数 + 两个长假 + 春节当天与星期 + 生肖年 + 正式/预计说明。
  // 全部由数据算出，不手写——否则十六个年份各有各的说法，必然有一年忘了改。
  const byId = (id: string) => holidays.find((h: any) => h.id === id);
  const cj = byId('chunjie');
  const gq = byId('guoqing');
  let lede = '';
  if (cj && gq) {
    // 两个长假固定说春节与国庆（按开始时间排先后），不按天数挑——
    // 天数每年都变，按天数挑会让「两个长假」的所指年年不同。
    const two = [cj, gq].sort((a: any, b: any) => (a.start < b.start ? -1 : 1));
    const parts: string[] = [];
    parts.push(year + ' 年，中国共有 ' + holidays.length + ' 个法定节假日。');
    // 同一个月时省略第二个日期前的月份（「2 月 5 日至 12 日」），与参考站写法一致
    const range = (a: string, b: string) => {
      const pa = keyToParts(a); const pb = keyToParts(b);
      return pa.m === pb.m
        ? pa.m + ' 月 ' + pa.d + ' 日至 ' + pb.d + ' 日'
        : mdCn(a) + '至' + mdCn(b);
    };
    parts.push('其中两个长假是 ' + range(two[0].start, two[0].end) + '的'
      + (two[0].id === 'chunjie' ? '春节假期' : two[0].name)
      + '，以及 ' + range(two[1].start, two[1].end) + '的'
      + (two[1].id === 'guoqing' ? '国庆黄金周' : two[1].name) + '。');
    parts.push('春节在 ' + mdCn(cj.date) + '（' + WEEK_FULL[weekdayOf(cj.date)] + '）。');
    if (zodiac && zodiac.ganzhi) {
      // 生肖年术语链（火马年 / 丙午马年）蓝色标注并跳转到对应生肖页
      // （主人 2026-10-23 要求，与参考站同款）。链接由数据算出，模板不含手写 URL。
      const slug = ANIMAL_SLUG[zodiac.animal] || '';
      const open = slug ? '<a class="z-link" href="/zodiac/' + slug + '/">' : '';
      const shut = slug ? '</a>' : '';
      parts.push('这一天也是' + open + zodiac.element + zodiac.animal + '年' + shut + ' '
        + open + zodiac.ganzhi + zodiac.animal + '年' + shut + '的开始。');
    }
    parts.push(official ? '以下为官方公布的日期。' : '以上均为预计日期。');
    lede = parts.join('');
  }

  // ---- 常见问题（按年份现算）----
  // 2026-11-09 主人反馈：底部 FAQ 不管打开哪一年都在讲 2027。
  // 原因是以前直接取 yml 的 meta.faq，而那份文案是照着 2027 写的。
  // 现在只保留与年份无关的通用问题，其余用当年数据现算，避免十六个年份互相串台。
  const genericFaq = (data.meta && Array.isArray(data.meta.faq) ? data.meta.faq : [])
    .filter((item: any) => !/\d{4}\s*年/.test(String((item && item.q) || '')));
  const answerOf = (h: any) => h.startLabel + '（' + WEEK_CN[weekdayOf(h.start)] + '）至 '
    + h.endLabel + '（' + WEEK_CN[weekdayOf(h.end)] + '）放假，连休 ' + h.days
    + ' 天，其中法定假日 ' + h.statutory + ' 天。';
  const faq: any[] = [];
  faq.push(official
    ? {
      q: year + ' 年的放假安排是什么？',
      a: '全年放假 ' + stats.holidayDays + ' 天（含调休），其中法定假日 ' + stats.statutoryDays
        + ' 天，调休补班 ' + stats.makeupDays + ' 天。具体区间见上方日历与月份明细。',
    }
    : {
      q: year + ' 年的放假安排官方公布了吗？',
      a: '还没有。国务院办公厅通常在前一年 11 月前后发布次年通知。本页 ' + year
        + ' 年的放假区间是按《全国年节及纪念日放假办法》与近年调休惯例推算的预期值，'
        + '节日当天的公历日期本身是确定的。',
    });
  if (cj) {
    faq.push({
      q: year + ' 年春节是哪一天？',
      a: mdCn(cj.date) + '，' + WEEK_FULL[weekdayOf(cj.date)] + '，'
        + (cj.lunarNote ? cj.lunarNote + '。' : '') + answerOf(cj),
    });
  }
  if (gq) faq.push({ q: year + ' 年国庆放几天？', a: answerOf(gq) });
  const zq = byId('zhongqiu');
  if (zq) {
    faq.push({
      q: year + ' 年中秋是哪一天？',
      a: mdCn(zq.date) + '，' + WEEK_FULL[weekdayOf(zq.date)] + '。' + answerOf(zq),
    });
  }
  faq.push(...genericFaq);

  return {
    year: year,
    lede: lede,
    years: years.map((y: any) => y.year),
    current: Number(src.year),
    prose: (data.meta && data.meta.prose) || '',
    faq: faq,
    label: label,
    official: official,
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
function tipPayload(cal: any): any {
  const out: any = Object.create(null);
  if (!cal) return out;

  const dateLabel = (key: string) => {
    const { y, m, d } = keyToParts(key);
    return y + '年' + m + '月' + d + '日 ' + WEEK_CN[weekdayOf(key)];
  };

  Object.keys(cal.days).forEach((k: string) => {
    const r = cal.days[k];
    // 普通工作日与周末都不出卡（参考站也只有 data-k / data-w 的格子才弹卡）。
    // 周末除了「周末」两个字没别的内容，弹个框只是噪音。
    const isPlain = !r.holiday && !r.festival && !r.term;
    if (isPlain) return;

    const tip: any = { s: r.state, date: dateLabel(k) };

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
      const extra: string[] = [];
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

function holidayCalendar(raw: any, year?: any): any {
  return buildCalendar(raw, year);
}

// ---- 页面视图派生（12 月宫格 / 按季分组的 24 节气 / 其他节日 / 月份明细）----
// 这些是「页面怎么摆」的数据，不是节假日规则本身，所以单独一个函数：
// buildCalendar 的返回契约被 EJS 模板与测试共用，不要往里塞版式细节。
const SEASON_TERMS = [
  { name: '春', range: '2–4 月', terms: ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨'] },
  { name: '夏', range: '5–7 月', terms: ['立夏', '小满', '芒种', '夏至', '小暑', '大暑'] },
  { name: '秋', range: '8–10 月', terms: ['立秋', '处暑', '白露', '秋分', '寒露', '霜降'] },
  { name: '冬', range: '11–1 月', terms: ['立冬', '小雪', '大雪', '冬至', '小寒', '大寒'] },
];

// 公历固定的三个节日 + 清明，卡片上不写农历
const SOLAR_NOTE: Record<string, string> = {
  yuandan: '公历 1 月 1 日',
  qingming: '节气日',
  laodong: '公历 5 月 1 日',
  guoqing: '公历 10 月 1 日',
};

function calendarView(cal: any): any {
  if (!cal) return null;
  const monthOf = (key: string) => keyToParts(key).m;

  // 24 节气按名称归季（不按日期）：冬季那一组跨年（11 月立冬 → 次年 1 月大寒），
  // 按日期排会把「小寒 / 大寒」挤到四季的第一组去。
  const termByName = new Map<string, any>();
  cal.terms.forEach((t: any) => termByName.set(t.name, t));
  const seasons = SEASON_TERMS.map((s) => ({
    name: s.name,
    range: s.range,
    terms: s.terms
      .map((n) => termByName.get(n))
      .filter(Boolean)
      .map((t: any) => ({ name: t.name, label: t.dateLabel })),
  }));

  // 其他节日：yml 的 festivals 里混着 4 个节气（春分 / 夏至 / 秋分 / 冬至），
  // 它们已经在「二十四节气」块里出现过一次，这里剔除，避免同一页重复两遍。
  const otherFestivals = cal.festivals.filter((f: any) => f.kind !== '节气');

  // 焦点月 = 放假天数最多的那个月（2026 是 2 月，春节 9 天）。默认展开它的明细，
  // 这样首屏滚到宫格时右下角已经有内容，不用等人去点。
  let focusMonth = 1;
  let bestDays = -1;
  for (let m = 1; m <= 12; m += 1) {
    const d = cal.holidays
      .filter((h: any) => monthOf(h.start) === m)
      .reduce((sum: number, h: any) => sum + h.days, 0);
    if (d > bestDays) { bestDays = d; focusMonth = m; }
  }

  const monthTiles = cal.months.map((mo: any) => {
    const m = mo.m;
    const segs = cal.holidays.filter((h: any) => monthOf(h.start) === m);
    const works = cal.holidays
      .reduce((acc: string[], h: any) => acc.concat(h.makeup), [])
      .filter((k: string) => monthOf(k) === m)
      .sort();
    const fests = otherFestivals
      .filter((f: any) => monthOf(f.date) === m)
      .concat(cal.terms.filter((t: any) => monthOf(t.date) === m))
      .sort((a: any, b: any) => (a.date < b.date ? -1 : 1));

    // 春节期间显示「除夕 / 春节」两个具体日子（示意稿里已确认的写法），
    // 其余月份列出当月的其他节日与节气。
    const chunjie = segs.find((h: any) => h.id === 'chunjie');
    const festText = chunjie
      ? '除夕 ' + mdCn(addDays(chunjie.date, -1)) + ' · 春节 ' + mdCn(chunjie.date)
      : fests.map((f: any) => f.name + '（' + f.dateLabel + '）').join('、');

    const segDays = segs.reduce((sum: number, h: any) => sum + h.days, 0);

    return {
      m: m,
      pad: mo.cells.length ? mo.cells[0].w : 0,
      cells: mo.cells,
      tags: segs.map((h: any) => h.name),
      badge: segDays > 0 ? segDays + ' 天' : '',
      panel: {
        segs: segs.map((h: any) => ({
          label: h.startLabel + '–' + h.endLabel,
          arrange: h.arrange,
          days: h.days,
          statutory: h.statutory,
        })),
        works: works.map((k: string) => mdCn(k)).join('、'),
        fests: festText,
      },
    };
  });

  return {
    seasons: seasons,
    otherFestivals: otherFestivals,
    focusMonth: focusMonth,
    monthTiles: monthTiles,
    // 图文卡左上那枚「日期性质」胶囊：公历固定的节日写公历，清明写节气日，
    // 春节 / 端午 / 中秋才写农历。统一用 h.lunar 会给出「元旦 = 冬月十三」
    // 这种看着像农历节日的错位信息。
    cards: cal.holidays.map((h: any) => ({
      ...h,
      lunarNote: SOLAR_NOTE[h.id]
        || ('农历 ' + ((h.lunar && h.lunar[h.date]) || h.dateLabel)),
    })),
    // 无脚本兜底要一份「全年的调休上班日」清单，这里一次算好（周一并到周日序里）
    makeupLabels: cal.holidays
      .reduce((acc: string[], h: any) => acc.concat(h.makeup), [])
      .sort()
      .map((k: string) => mdCn(k) + ' ' + WEEK_CN[weekdayOf(k)]),
    chips: {
      holidayCount: cal.stats.holidayCount,
      holidayDays: cal.stats.holidayDays,
      makeupDays: cal.stats.makeupDays,
      termCount: cal.stats.termCount,
    },
  };
}

export {
  WEEK_CN,
  toKey,
  weekdayOf,
  daysInMonth,
  addDays,
  spanDays,
  buildCalendar,
  tipPayload,
  holidayCalendar,
  calendarView,
};
