// 节日文化详情页族（/library/<slug>/）的数据整理层。
//
// 逐函数移植 themes/fluid/scripts/helpers/festival-data.js，逻辑不改：
//   · 跨源取数：法定 6 个取 holidays.yml 的 holidays[]（按 id），
//     传统 6 个取 festivals[]（按中文名）；dongzhi 必须取 festivals[]、qingming 必须取 holidays[]。
//   · 日期统一 toKey：js-yaml 的无引号日期会被解析成 UTC 零点的 Date 对象（E-028）。
//   · 星期用 Date.UTC + getUTCDay 计算，本地（+08:00）与 Vercel（UTC）一致。

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

export function toKey(value: any): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.getUTCFullYear() + '-' + pad2(value.getUTCMonth() + 1) + '-' + pad2(value.getUTCDate());
  }
  const m = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return m[1] + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[3]));
}

function keyToParts(key: string) {
  const p = String(key).split('-');
  return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
}

export function addDays(key: string, n: number): string {
  const p = keyToParts(key);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}

/** 0 = 周日 … 6 = 周六 */
export function weekdayOf(key: string): number {
  const p = keyToParts(key);
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

export const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function cnDate(key: string): string {
  const p = keyToParts(key);
  return p.y + ' 年 ' + p.m + ' 月 ' + p.d + ' 日';
}

export function mdCn(key: string): string {
  const p = keyToParts(key);
  return p.m + ' 月 ' + p.d + ' 日';
}

// ---------- slug → holidays.yml 取数入口的显式映射表 ----------
// source: 'holidays' = 该年的 holidays[]（按 id，法定节日专用）
//         'festivals' = 该年的 festivals[]（按 name，传统节日与冬至专用）
export const FESTIVAL_KEY: Record<string, { source: 'holidays' | 'festivals'; key: string }> = {
  yuandan: { source: 'holidays', key: 'yuandan' },
  chunjie: { source: 'holidays', key: 'chunjie' },
  qingming: { source: 'holidays', key: 'qingming' },
  duanwu: { source: 'holidays', key: 'duanwu' },
  zhongqiu: { source: 'holidays', key: 'zhongqiu' },
  guoqing: { source: 'holidays', key: 'guoqing' },
  yuanxiao: { source: 'festivals', key: '元宵节' },
  qixi: { source: 'festivals', key: '七夕节' },
  zhongyuan: { source: 'festivals', key: '中元节' },
  chongyang: { source: 'festivals', key: '重阳节' },
  dongzhi: { source: 'festivals', key: '冬至' },
  laba: { source: 'festivals', key: '腊八节' },
};

/** 「当前年份」采用数据驱动口径：holidays.yml 里最新的 official === true 的年份 */
export function currentYearOf(holidaysRaw: any): number | null {
  const years = holidaysRaw && Array.isArray(holidaysRaw.years) ? holidaysRaw.years : [];
  let max: number | null = null;
  for (const y of years) {
    if (y && y.official === true && (max == null || y.year > max)) max = y.year;
  }
  return max;
}

/** 从某一年的数据里取一个节日的当日记录（holidays[] 按 id / festivals[] 按 name） */
export function recordInYear(yearEntry: any, mapping: { source: string; key: string }): any {
  if (!yearEntry) return null;
  const list = mapping.source === 'holidays' ? yearEntry.holidays || [] : yearEntry.festivals || [];
  for (const r of list) {
    if (!r) continue;
    if (mapping.source === 'holidays' ? r.id === mapping.key : r.name === mapping.key) return r;
  }
  return null;
}

/** 该年里落在假期窗口 [start−7, end+7] 内的调休上班日 */
export function makeupInRange(makeupList: any[], startKey: string, endKey: string): string[] {
  const out: string[] = [];
  const lo = addDays(startKey, -7);
  const hi = addDays(endKey, 7);
  const list = Array.isArray(makeupList) ? makeupList : [];
  for (const item of list) {
    const k = toKey(item);
    if (!k) continue;
    if (k >= lo && k <= hi) out.push(k);
  }
  return out;
}

/** 逐年表：默认取 fromYear 起共 rowCount 行 */
export function tableRowsFor(
  mapping: { source: string; key: string },
  holidaysRaw: any,
  fromYear: number,
  rowCount: number,
): any[] {
  const years = holidaysRaw && Array.isArray(holidaysRaw.years) ? holidaysRaw.years : [];
  const sorted = years
    .filter((y: any) => y && y.year >= fromYear)
    .sort((a: any, b: any) => a.year - b.year)
    .slice(0, rowCount);

  return sorted.map((y: any) => {
    const label = y.label || (y.official === false ? '预计' : '官方');
    const rec = recordInYear(y, mapping);
    if (!rec) return { year: y.year, label, missing: true };
    const date = toKey(rec.date);
    if (!date) return { year: y.year, label, missing: true };
    const row: any = {
      year: y.year,
      label,
      official: y.official === true,
      date,
      weekday: WEEK_CN[weekdayOf(date)],
      lunar: (y.lunar && y.lunar[date]) || '',
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

const VOCAB_SECTION = { id: 'vocab', title: '词汇表与祝福语', kind: 'vocab' };
const FAQ_SECTION = { id: 'faq', title: '常见问题', kind: 'faq' };

export function orderedSections(srcSections: any[]): any[] {
  const out: any[] = [];
  let injected = false;
  (Array.isArray(srcSections) ? srcSections : []).forEach((s) => {
    if (!s || !s.id) return;
    out.push(s);
    if (s.id === 'food' && !injected) {
      out.push(VOCAB_SECTION);
      out.push(FAQ_SECTION);
      injected = true;
    }
  });
  if (!injected) {
    out.push(VOCAB_SECTION);
    out.push(FAQ_SECTION);
  }
  return out;
}

// ---------- 主入口 ----------

export function buildFestival(festivalsRaw: any, holidaysRaw: any, slug: string, pageYear?: number | string | null): any {
  const fdata = festivalsRaw || {};
  const hdata = holidaysRaw || {};
  const list = Array.isArray(fdata.festivals) ? fdata.festivals : [];
  const mapping = FESTIVAL_KEY[slug];

  if (!mapping) return { error: 'festival-data: 未知 slug「' + slug + '」（FESTIVAL_KEY 无此项）' };

  let src: any = null;
  for (const item of list) {
    if (item && item.key === slug) {
      src = item;
      break;
    }
  }
  if (!src) return { error: 'festival-data: festivals.yml 缺少 key 为「' + slug + '」的条目（E-047）' };

  const cur = Number(pageYear) || currentYearOf(hdata);
  if (!cur) return { error: 'festival-data: holidays.yml 没有 official === true 的年份，无法确定当前年份（E-047）' };

  const years = (hdata.years || []).filter((y: any) => y && y.year >= cur);
  if (!years.length) return { error: 'festival-data: holidays.yml 没有 ' + cur + ' 年及以后的数据（E-047）' };

  const isLegal = mapping.source === 'holidays';
  const rows = tableRowsFor(mapping, hdata, cur, 11);
  if (!rows.length) return { error: 'festival-data: ' + slug + ' 在 ' + cur + ' 年及以后没有任何逐年记录（E-047）' };

  const missingRows = rows.filter((r) => r.missing);
  if (missingRows.length) {
    return {
      error: 'festival-data: ' + slug + ' 缺少年份记录：' + missingRows.map((r) => r.year).join(', ') + '（E-047）',
    };
  }
  const currentRow = rows[0];

  // facts：前三行是静态素材（festivals.yml），后三行由 helper 计算（PRD §6.1 行序固定）
  const facts = (Array.isArray(src.facts) ? src.facts : []).map((r: any) => ({ k: r.k, v: r.v }));
  if (isLegal) {
    const stat = Number(src.statutory) || 0;
    facts.push({ k: '是否法定节假日', v: '是' });
    facts.push({ k: '法定放假天数', v: stat + ' 天（法定假日天数，与调休后的连休天数不是一回事）' });
  } else {
    facts.push({ k: '是否法定节假日', v: '否' });
    facts.push({ k: '法定放假天数', v: '无（不放假，不在《放假办法》第二条的七项之内）' });
  }
  facts.push({
    k: cur + ' 年当天',
    v: '<time datetime="' + currentRow.date + '">' + mdCn(currentRow.date) + '</time>（' + currentRow.weekday + '）',
  });

  const fill = (text: any) => String(text == null ? '' : text).replace(/\{\{year\}\}/g, String(cur));

  const sections = orderedSections(src.sections).map((s: any) => ({
    id: s.id,
    title: s.title || '',
    kind: s.kind || (s.body ? 'prose' : ''),
    body: s.body ? fill(s.body) : s.body === '' ? '' : null,
  }));

  const images = (fdata.meta && fdata.meta.images) || {};
  const image = images[slug] || null;

  return {
    slug,
    key: src.key,
    name: src.name || '',
    pinyin: src.pinyin || '',
    kind: src.kind || (isLegal ? 'legal' : 'traditional'),
    desc: fill(src.desc || ''),
    lede: fill(src.lede || ''),
    facts,
    legal: isLegal,
    statutory: isLegal ? Number(src.statutory) || 0 : 0,
    calendarTable: src.calendarTable === true,
    tableMode: src.calendarTable === true ? 'calendar' : 'date',
    tableRows: rows,
    tableYears: [rows[0].year, rows[rows.length - 1].year],
    currentYear: cur,
    currentRow,
    sections,
    vocab: Array.isArray(src.vocab) ? src.vocab : [],
    greetingsLabel: src.greetingsLabel || '祝福语',
    greetings: Array.isArray(src.greetings) ? src.greetings : [],
    faq: Array.isArray(src.faq) ? src.faq : [],
    image,
    imageCss: !!(image && image.css === true),
    notice: (fdata.meta && fdata.meta.notice) || '',
    updated: toKey(fdata.meta && fdata.meta.updated) || '',
  };
}
