// 日期工具（E-028 / E-029）
//
// 规则来源：themes/fluid/scripts/helpers/fmt-item-date.js。
// 时区处理不依赖 moment：用 Intl.DateTimeFormat + Asia/Shanghai，避免新增依赖。
//
// 关键语义：
//   · _data 里无引号日期被 js-yaml 解析成「UTC 壁钟」的 Date；
//   · 文章 front matter 的三种写法（无引号 / 引号字符串 / 带 +08:00 的 ISO）都要还原成
//     「北京时间的同一壁钟」，否则 URL 的 /YYYY/MM/DD/ 会跨天（现站 URL 是验收基线）。

const TZ = 'Asia/Shanghai';
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ALL_DIGITS_RE = /^\d+$/;

type Parts = { year: string; month: string; day: string; hour: string; minute: string; second: string };

function partsInTz(date: Date, timeZone = TZ): Parts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** 按 moment 的常用 token 格式化（只支持本项目用到的 token） */
export function formatWithPattern(date: Date, pattern: string, timeZone = TZ): string {
  const p = partsInTz(date, timeZone);
  return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, token => {
    switch (token) {
      case 'YYYY':
        return p.year;
      case 'MM':
        return p.month;
      case 'DD':
        return p.day;
      case 'HH':
        return p.hour;
      case 'mm':
        return p.minute;
      case 'ss':
        return p.second;
      default:
        return token;
    }
  });
}

/**
 * 前台「模块条目日期」统一格式化（禁止模板直出 Date）。
 * 规则逐条对齐 fmt-item-date.js。
 */
export function fmtItemDate(value: unknown, format?: string): string {
  const fmt = format || 'YYYY-MM-DD';
  if (value == null || value === '') return '';

  let date: Date | null = null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    date = value;
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    date = new Date(value);
  } else {
    const s = String(value).trim();
    if (!s) return '';
    if (DATE_ONLY_RE.test(s)) return s;
    if (ALL_DIGITS_RE.test(s)) date = new Date(Number(s));
    else if (ISO_RE.test(s)) date = new Date(s);
    else return s; // 人写的格式化文本，原样透传
  }

  if (!date || Number.isNaN(date.getTime())) return '';
  return formatWithPattern(date, fmt);
}

/** 文章 front matter 日期 → 绝对时刻（按 +08:00 壁钟解释无时区写法） */
export function parsePostDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    // js-yaml 把 `2023-04-18 23:14:00` 解析成 UTC 的同一组数字；
    // 现站把它当作北京时间壁钟，这里用 UTC 分量重建成 +08:00 的绝对时刻。
    return new Date(
      Date.UTC(
        raw.getUTCFullYear(),
        raw.getUTCMonth(),
        raw.getUTCDate(),
        raw.getUTCHours(),
        raw.getUTCMinutes(),
        raw.getUTCSeconds()
      ) - 8 * 3600 * 1000
    );
  }

  const s = String(raw).trim();
  if (!s) return null;

  const tzMatch = /(?:Z|[+-]\d{2}:?\d{2})$/.exec(s);
  if (tzMatch) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d, h = '00', mi = '00', se = '00'] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se) - 8 * 3600 * 1000);
}

/** 常用格式：YYYY-MM-DD / YYYY-MM-DD HH:mm / MM-DD / YYYY */
export function formatDate(value: unknown, format = 'YYYY-MM-DD'): string {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value as any);
  if (Number.isNaN(date.getTime())) return '';
  return formatWithPattern(date, format);
}
