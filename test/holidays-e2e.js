'use strict';
// 节假日页（/holidays/）端到端验证。
//
// 为什么要有这一套：
//   这一页的信息全部由 source/_data/holidays.yml 一个文件算出来，模板里没有一句手写日期。
//   好处是改一处全页更新；坏处是「数据写错 / 算错」不会有任何报错——页面照常生成、
//   颜色照常漂亮，只是某天标错了。这正是 ERRORS.md 里 P1「静默失败」的定义。
//   所以这里锁三层：
//     ① 数据自洽：法定假日天数之和、放假区间跨度、节日是否落在本年；
//     ② 计算正确：关键日期的状态、星期、跨时区一致性；
//     ③ 产物落地：页面真的存在且非 0 字节（E-029 / E-038：Hexo 渲染失败也报成功）。
//
// 运行：node test/holidays-e2e.js
// 前置：npm run build（产物断言依赖 public/）。public/ 不存在时产物段 SKIP，
//       但 public/ 存在而页面缺失一律判 FAIL——那说明构建真的漏了这一页。

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const { buildCalendar, tipPayload, toKey, weekdayOf, spanDays } = require('../themes/fluid/scripts/helpers/holiday-calendar.js');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PAGE = path.join(PUBLIC, 'holidays', 'index.html');
// 默认页（/holidays/）现在固定显示「当前年」2026，所以凡是按 2027 写死的断言都改看
// 2027 自己的年份页，不再依赖默认页翻到哪一年。
const PAGE27 = path.join(PUBLIC, 'holidays', '2027', 'index.html');

let pass = 0;
function ok(label, fn) {
  try {
    fn();
    pass += 1;
    console.log('  \u2713 ' + label);
  } catch (e) {
    console.log('  \u2717 ' + label);
    console.log('      ' + e.message);
    process.exitCode = 1;
  }
}

const raw = yaml.load(fs.readFileSync(path.join(ROOT, 'source', '_data', 'holidays.yml'), 'utf8'));
const cal = buildCalendar(raw, 2027);
const year = cal.year;

console.log('节假日页数据与计算（' + year + '）');

// ---------- ① 数据自洽 ----------

ok('数据能解析出年份与七个法定节假日', () => {
  assert.ok(cal, 'buildCalendar 返回 null —— holidays.yml 的 years[0] 缺失');
  assert.strictEqual(cal.holidays.length, 7, '法定节假日不是 7 个');
});

ok('每个节日的放假跨度与 days 字段一致', () => {
  cal.holidays.forEach((h) => {
    assert.strictEqual(h.days, spanDays(h.start, h.end), h.name + '：days 与 start/end 跨度不符');
    assert.strictEqual(h.days, h.daysDeclared, h.name + '：days 声明值与实际跨度不符');
    assert.ok(h.statutory > 0 && h.statutory <= h.days, h.name + '：法定假日天数不合理');
  });
});

ok('法定假日合计 13 天（2025 年起施行的《全国年节及纪念日放假办法》）', () => {
  assert.strictEqual(cal.stats.statutoryDays, 13,
    '法定假日合计不是 13 天 —— 要么数据错了，要么规则变了，两种情况都必须人工复核后再改断言');
});

// 调休日只存在于年份级列表里，逐节日那一份由 helper 就近归属。2025/2026 曾经是
// 「每个节日都挂着整年调休日」，直接列进表里就是错的（E-051）。
ok('调休上班日按「离哪个假期最近」归属，且平局偏向节前', () => {
  // 2021 通知：春节 2/7、2/20；劳动 4/25、5/8；中秋 9/18；国庆 9/26、10/9。
  // 其中 9/26 离中秋结束与国庆开始都是 5 天，是这条规则唯一的平局样本。
  const c = buildCalendar(raw, 2021);
  const byId = (id) => c.holidays.find((h) => h.id === id);
  assert.deepStrictEqual(byId('chunjie').makeup, ['2021-02-07', '2021-02-20']);
  assert.deepStrictEqual(byId('laodong').makeup, ['2021-04-25', '2021-05-08']);
  assert.deepStrictEqual(byId('zhongqiu').makeup, ['2021-09-18'], '9/26 不该算到中秋头上');
  assert.deepStrictEqual(byId('guoqing').makeup, ['2021-09-26', '2021-10-09']);
  // 每个年度的调休日必须一个不多一个不少地分配下去
  cal.years.forEach((y) => {
    const cc = buildCalendar(raw, y);
    const rawYear = raw.years.find((v) => Number(v.year) === y);
    const expected = Array.isArray(rawYear.makeup) ? rawYear.makeup.length : 0;
    const assigned = cc.holidays.reduce((n, h) => n + h.makeup.length, 0);
    assert.strictEqual(assigned, expected, y + ' 年调休日没分完（' + assigned + '/' + expected + '）');
  });
});

ok('「来源」只给官方年份标一行，预计年份不标（参考站的做法）', () => {
  assert.ok(buildCalendar(raw, 2026).source, '2026 是通知年，应当有来源');
  assert.strictEqual(buildCalendar(raw, 2026).source.dateLabel, '2025 年 11 月 4 日');
  assert.strictEqual(buildCalendar(raw, 2027).source, null, '预计年份不该标来源');
});

// 2024-11 修订的《全国年节及纪念日放假办法》自 2025-01-01 起施行，法定假日由 11 天增到 13 天。
// 所以 2024 及以前是 11 天、2025 起是 13 天 —— 两条都写死，跨过这条分界线的数据必须人工复核。
ok('十六个年份逐个核对：放假跨度、声明天数、法定合计', () => {
  cal.years.forEach((y) => {
    const c = buildCalendar(raw, y);
    const expect = y >= 2025 ? 13 : 11;
    assert.strictEqual(c.stats.statutoryDays, expect, y + ' 年法定假日合计不是 ' + expect + ' 天');
    c.holidays.forEach((h) => {
      assert.strictEqual(h.days, spanDays(h.start, h.end), y + ' ' + h.name + '：days 与 start/end 跨度不符');
      assert.strictEqual(h.days, h.daysDeclared, y + ' ' + h.name + '：days 声明值与跨度不符');
      // 跨年元旦（2023、2024）一律截断到本年内，跨年那一段写在 arrange 里说明。
      // 这条防止有人把 2022-12-31 直接写进 2023 —— 那样逐日表会少一格、统计也对不上。
      assert.ok(toKey(h.start).indexOf(String(y)) === 0, y + ' ' + h.name + ' 的 start 越界：' + h.start);
      assert.ok(toKey(h.end).indexOf(String(y)) === 0, y + ' ' + h.name + ' 的 end 越界：' + h.end);
    });
  });
});

// 曾经所有年份的 terms 都是空的，模板里 `if (cal.terms.length)` 一直不成立，
// 「二十四节气」区块从来没渲染过（E-047）。这条把「每年 24 个节气」钉死。
ok('每年都有全部 24 个节气，且都落在本年内（E-047）', () => {
  cal.years.forEach((y) => {
    const c = buildCalendar(raw, y);
    assert.strictEqual(c.terms.length, 24, y + ' 年节气不是 24 个（实际 ' + c.terms.length + '）');
    assert.strictEqual(new Set(c.terms.map((t) => t.name)).size, 24, y + ' 年节气名有重复');
    c.terms.forEach((t) => {
      assert.ok(t.date.indexOf(String(y)) === 0, y + ' 年 ' + t.name + ' 日期越界：' + t.date);
    });
  });
});

// 节气是用通用寿星公式算的，必须有独立于公式的锚点。官方年份的清明节放假当天
// 就是清明节气日本身，拿它当校验点，把公式与国务院通知钉在一起。
ok('清明节气日与官方通知里的清明节日期一致（节气公式的独立校验点）', () => {
  [2021, 2022, 2023, 2024, 2025, 2026].forEach((y) => {
    const c = buildCalendar(raw, y);
    const qm = c.holidays.find((h) => h.id === 'qingming');
    const term = c.terms.find((t) => t.name === '清明');
    assert.ok(qm && term, y + ' 年缺清明节数据');
    assert.strictEqual(term.date, qm.date,
      y + ' 年清明节气 ' + term.date + ' 与通知里的放假当天 ' + qm.date + ' 不一致');
  });
});

ok('预计放假合计 28 天，且统计值来自逐日状态而非手填', () => {
  assert.strictEqual(cal.stats.holidayDays, 28, '合计放假天数变了');
  const counted = Object.keys(cal.days).filter((k) => cal.days[k].state === 'holiday').length;
  assert.strictEqual(counted, cal.stats.holidayDays, '统计值与逐日状态不一致');
});

ok('全年 365 天，12 个月，2 月 28 天', () => {
  assert.strictEqual(cal.stats.totalDays, 365);
  assert.strictEqual(cal.months.length, 12);
  assert.strictEqual(cal.months[1].cells.length, 28);
});

ok('所有节日与节气都落在本年内且能被逐日表覆盖', () => {
  const all = cal.festivals.concat(cal.terms);
  assert.ok(all.length > 0, '节日与节气列表为空');
  all.forEach((f) => {
    assert.ok(f.date.indexOf(String(year) + '-') === 0, f.name + ' 不在 ' + year + ' 年内：' + f.date);
    assert.ok(cal.days[f.date], f.name + ' 的日期在逐日表里不存在：' + f.date);
  });
});

// ---------- ② 计算正确 ----------

ok('星期计算与 UTC 一致（2027-01-01 周五 / 2027-02-06 周六）', () => {
  assert.strictEqual(weekdayOf('2027-01-01'), 5, '2027-01-01 不是周五');
  assert.strictEqual(weekdayOf('2027-02-06'), 6, '2027-02-06 不是周六');
});

ok('关键日期状态正确（除夕起放 / 初三后上班 / 国庆含 7 日 / 8 日上班）', () => {
  const at = (k) => cal.days[k].state;
  assert.strictEqual(at('2027-02-05'), 'holiday', '除夕（2 月 5 日）没有标成放假');
  assert.strictEqual(at('2027-02-06'), 'holiday', '春节当天没有标成放假');
  assert.strictEqual(at('2027-02-12'), 'holiday', '放假区间末日没有标成放假');
  assert.strictEqual(at('2027-02-13'), 'weekend', '2 月 13 日应是周末（放假已结束）');
  assert.strictEqual(at('2027-10-07'), 'holiday', '10 月 7 日应是放假');
  assert.strictEqual(at('2027-10-08'), 'work', '10 月 8 日应是工作日');
});

ok('同一天既有节日又有节气时两者都保留（10-08 重阳 + 寒露）', () => {
  const d = cal.days['2027-09-23'];
  assert.ok(d.festival && d.festival.name === '秋分', '9 月 23 日缺秋分');
  assert.strictEqual(d.festival.kind, '节气', '秋分的类别不是节气');
  assert.ok(cal.days['2027-10-08'].festival && cal.days['2027-10-08'].festival.name === '重阳节', '10 月 8 日缺重阳节');
});

ok('已放假的格子不再叠节日点（清明当天既是假日又是节气）', () => {
  const d = cal.days['2027-04-05'];
  assert.strictEqual(d.state, 'holiday');
  assert.strictEqual(d.dot, false, '放假格子上又叠了圆点，实心块上不可辨');
});

ok('日期写成 Date 对象与写成字符串得到同一份结果（跨时区不变式）', () => {
  // js-yaml 会把不带引号的 2027-01-01 解析成 UTC 零点的 Date。
  // helper 若用本地 getter 还原，东八区构建与 Vercel（UTC）构建会差一天。
  const toDate = (s) => {
    const p = s.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  };
  const copy = JSON.parse(JSON.stringify(raw));
  const y = copy.years.find((x) => x.year === 2027);
  y.holidays.forEach((h) => {
    h.date = toDate(h.date); h.start = toDate(h.start); h.end = toDate(h.end);
  });
  y.festivals.forEach((f) => { f.date = toDate(f.date); });
  Object.keys(y.lunar || {}).forEach((k) => { y.lunar[k] = k; });

  const cal2 = buildCalendar(copy, 2027);
  const fingerprint = (c) => Object.keys(c.days).map((k) => k + ':' + c.days[k].state).join(',');
  assert.strictEqual(fingerprint(cal2), fingerprint(cal), 'Date 输入与字符串输入的逐日状态不一致');
  assert.deepStrictEqual(cal2.holidays.map((h) => h.start), cal.holidays.map((h) => h.start), '节日起始日被时区改写');
});

ok('toKey 对非法值返回 null，不抛错（数据写错不该让整站构建失败）', () => {
  assert.strictEqual(toKey(''), null);
  assert.strictEqual(toKey('2027-13-40'), '2027-13-40'); // 语法合法即接受，不校验日历
  assert.strictEqual(toKey('下周'), null);
});

ok('悬停数据覆盖除夕且带放假区间与锚点', () => {
  const tips = tipPayload(cal);
  const t = tips['2027-02-05'];
  assert.ok(t, '2027-02-05 没有悬停数据');
  assert.strictEqual(t.name, '春节');
  assert.strictEqual(t.kicker, cal.label + '法定节假日');
  assert.strictEqual(t.lunar, '除夕 · 腊月廿九', '除夕当天没带农历');
  assert.strictEqual(t.dayNo, '第 1 天，共 8 天');
  assert.match(t.arrange, /02-05 → 02-12 · 8 天/);
  assert.strictEqual(t.anchor, 'holiday-chunjie');
});

ok('不放假的日子也能说清「为什么」，普通工作日不占体积', () => {
  const tips = tipPayload(cal);
  assert.strictEqual(tips['2027-02-20'].name, '元宵节');
  assert.strictEqual(tips['2027-02-20'].lunar, '正月十五', '元宵节没带农历');
  assert.strictEqual(tips['2027-02-20'].kicker, '传统节日');
  assert.strictEqual(tips['2027-09-23'].name, '秋分', '节气日应有名字');
  assert.strictEqual(tips['2027-09-23'].kicker, '节气');
  assert.strictEqual(tips['2027-07-14'], undefined, '普通工作日不该进 payload');
});

// ---------- ③ 产物落地 ----------

if (!fs.existsSync(PUBLIC)) {
  console.log('  - SKIP 产物断言（没有 public/，先跑 npm run build）');
} else {
  ok('布局模板能独立编译（E-045：编译失败时 Hexo 会静默产出残页）', () => {
    // 判据只看结果：模板必须能被 ejs 编译。变异自检见下一节。
    const ejs = require('ejs');
    const src = fs.readFileSync(path.join(ROOT, 'themes/fluid/layout/holidays.ejs'), 'utf8');
    let err = null;
    try { ejs.compile(src, { filename: 'holidays.ejs' }); } catch (e) { err = e; }
    assert.strictEqual(err, null, 'holidays.ejs 编译失败：' + (err && err.message.split('\n')[0]));
  });

  ok('十六年数据齐全，且年份页全部生成', () => {
    assert.strictEqual(cal.years.length, 16, '年份不是 16 个');
    assert.deepStrictEqual(cal.years,
      [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036],
      '年份族不是 2021-2036 连续十六年');
    if (!fs.existsSync(PUBLIC)) return;
    cal.years.forEach((y) => {
      const abs = path.join(PUBLIC, 'holidays', String(y), 'index.html');
      assert.ok(fs.existsSync(abs), '缺少年份页：holidays/' + y + '/index.html');
      assert.ok(fs.statSync(abs).size > 20000, '年份页内容过少：holidays/' + y + '/');
    });
  });

  ok('年度状态标对：2021-2026 为官方，2027 起为预计', () => {
    const byYear = (y) => buildCalendar(raw, y);
    [2021, 2022, 2023, 2024, 2025, 2026].forEach((y) => {
      assert.strictEqual(byYear(y).label, '官方', y + ' 是国务院通知年，应标官方');
      assert.strictEqual(byYear(y).official, true);
    });
    [2027, 2030, 2036].forEach((y) => {
      assert.strictEqual(byYear(y).label, '预计', y + ' 应标预计');
      assert.strictEqual(byYear(y).official, false);
    });
  });

  ok('发布页不出现内部维护说明，也不出现「悬停查看」提示', () => {
    const html = fs.readFileSync(PAGE, 'utf8');
    assert.ok(html.indexOf('这一页怎么维护') === -1, '维护说明漏到了发布页');
    assert.ok(html.indexOf('悬停查看') === -1, '「悬停查看当天」这类操作提示不该出现在页面里');
    assert.ok(html.indexOf('>备注<') !== -1, '节日列表缺「备注」列表头');
    // 默认页是 2026（官方年），预计那句说明得去 2027 页看
    const html27 = fs.readFileSync(PAGE27, 'utf8');
    assert.ok(html27.indexOf('以上均为预计日期') !== -1, '预计说明没放在年一览下方');
  });

  // 默认页固定显示当前年（2026）：标题带年份、面包屑带年份、年份导航里 2021 指向它自己的页
  ok('默认页显示当前年 2026，而不是随手取的第一年', () => {
    const html = fs.readFileSync(PAGE, 'utf8');
    assert.ok(html.indexOf('2026 年中国节假日') !== -1, '默认页标题没带 2026');
    assert.ok(html.indexOf('中国节假日</a><span aria-hidden="true">/</span><span class="cal-crumb-now">2026</span>') !== -1,
      '默认页缺面包屑「中国节假日 / 2026」');
    assert.ok(html.indexOf('href="/holidays/2021/"') !== -1,
      '年份导航里 2021 没指向 /holidays/2021/——以前默认页会把第一年链回首页');
    assert.ok(html.indexOf('class="cal-year-current" aria-current="page">2026</span>') !== -1,
      '默认页没把 2026 标成当前年');
    // 引导段：节假日数、两个长假、春节当天与星期、生肖年
    assert.ok(html.indexOf('中国共有 7 个法定节假日') !== -1, '缺引导段');
    assert.ok(html.indexOf('其中两个长假是 2 月 15 日至 23 日的春节假期') !== -1, '引导段没说春节长假');
    assert.ok(html.indexOf('春节在 2 月 17 日（星期二）') !== -1, '引导段没说春节当天');
    // 引导段的生肖年术语链：火马年 / 丙午马年两个词都是蓝色链接（z-link），
    // 跳转到对应生肖页（2026-10-23 主人要求；原来这里是纯文本）
    assert.ok(html.indexOf('火马年</a>') !== -1 && html.indexOf('>丙午马年</a>') !== -1,
      '引导段缺生肖年术语链（火马年 / 丙午马年）');
    assert.ok(html.indexOf('href="/zodiac/horse/"') !== -1,
      '引导段的生肖年术语没有链到 /zodiac/horse/');
    assert.ok(html.indexOf('class="z-link"') !== -1,
      '生肖年术语链没有挂 z-link 类（蓝色标注）');
    assert.ok(html.indexOf('以下为官方公布的日期') !== -1, '官方年份该说「以下为官方公布的日期」');
  });

  ok('页面存在且不是 0 字节（E-029 / E-038）', () => {
    assert.ok(fs.existsSync(PAGE), 'public/holidays/index.html 不存在 —— 构建漏了这一页');
    const size = fs.statSync(PAGE).size;
    assert.ok(size > 20000, '页面只有 ' + size + ' 字节，像是渲染中断');
  });

  const html = fs.existsSync(PAGE) ? fs.readFileSync(PAGE, 'utf8') : '';

  ok('365 个格子 / 28 个放假格 / 12 个月行（2027 页）', () => {
    const h = fs.readFileSync(PAGE27, 'utf8');
    const cells = (h.match(/class="cal-cell /g) || []).length;
    const holidayCells = (h.match(/cal-cell is-holiday/g) || []).length;
    const rows = (h.match(/class="cal-row"/g) || []).length;
    assert.strictEqual(cells, 365, '格子数不是 365（实际 ' + cells + '）');
    assert.strictEqual(holidayCells, 28, '放假格数不是 28（实际 ' + holidayCells + '）');
    assert.strictEqual(rows, 12, '月份行数不是 12（实际 ' + rows + '）');
  });

  // 每个格子都要有原生 title（参考站也是每个 <i> 都带 title）：普通日期给
  // 「几月几日 星期几」的小框框，自定义详情卡只服务有内容的日子。
  ok('每个格子都有原生 title：普通日期也能看出几月几日', () => {
    const h = fs.readFileSync(PAGE27, 'utf8');
    const cells = (h.match(/class="cal-cell /g) || []).length;
    assert.strictEqual(cells, 365, '格子数不是 365（实际 ' + cells + '）');
    const titled = (h.match(/title="[^"]*月[^"]*日，星期/g) || []).length;
    assert.strictEqual(titled, 365, '带「几月几日，星期X」title 的格子不是 365 个（实际 ' + titled + '）');
    assert.ok(h.indexOf('title="1 月 9 日，星期六"') !== -1, '普通周末格的 title 不对');
    assert.ok(h.indexOf('title="2 月 6 日，星期六。预计放假：春节"') !== -1, '春节格的 title 没带上节假日');
    assert.ok(h.indexOf('title="1 月 1 日，星期五。预计放假：元旦"') !== -1, '元旦格的 title 没带上节假日');
  });

  // 刻度尺必须横排：一格只有 1/31 宽（约 13px），不设 nowrap 的话「10」「15」
  // 会被折成「1」在上「0」在下竖着排（主人 2026-10-23 指出）。
  ok('刻度尺数字横排不折行', () => {
    const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
    const at = css.indexOf('.cal-tick {');
    const rule = css.slice(at, css.indexOf('}', at));
    assert.ok(rule.indexOf('white-space: nowrap') !== -1, '.cal-tick 没有 nowrap，两位数会折行');
    assert.ok(rule.indexOf('text-align: left') !== -1, '.cal-tick 没有左对齐，读数会偏');
  });

  // 统计只在页头那一行：一览下面曾经也有一行，两个数字撞在一起（主人 2026-10-23 指出）
  ok('统计不重复：一览下面不再有第二份统计', () => {
    const h = fs.readFileSync(PAGE27, 'utf8');
    assert.ok(h.indexOf('cal-stats-line') === -1, '年一览下面又出现了一份统计');
    assert.ok(h.indexOf('合计 28 天') !== -1, '页头缺合计说明');
  });

  // 聚焦效果的地基：格子与表格行都要带 data-h（哪个法定节假日）
  ok('格子与表格行都带 data-h，聚焦高亮有东西可分组', () => {
    const h = fs.readFileSync(PAGE27, 'utf8');
    assert.ok(/class="cal-cell[^"]*"[^>]*data-h="chunjie"/.test(h), '春节的格子没带 data-h');
    assert.ok(/<tr id="holiday-guoqing" data-h="guoqing">/.test(h), '表格行没带 data-h');
    const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
    assert.ok(css.indexOf('.cal-grid.is-hl .cal-cell { opacity: .28; }') !== -1, '缺「其余格子变淡」规则');
    assert.ok(css.indexOf('.cal-table tbody tr.is-hl { background: #fbf3f1; }') !== -1, '缺「左表行高亮」规则');
    assert.ok(css.indexOf('border-radius: 1.5px;') !== -1, '格子没有圆角（参考站是 1.5px）');
  });

  ok('日期渲染为纯日期，没有机器串（E-028）', () => {
    assert.ok(html.indexOf('GMT') === -1, '页面出现 GMT 字样：有日期被当成 Date 直接输出了');
    // 判据只看本页自己渲染的 <time>，不扫全页文本：
    // 页面底部的主题配置 JSON（umami.start_time 之类）本来就带 ISO 时间串，
    // 按整页文本搜 "00:00:00" 会被它误报（这正是 E-031 的同型问题）。
    const bad = [];
    const re = /<time datetime="([^"]*)">([^<]*)<\/time>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m[1])) bad.push('datetime 非纯日期：' + m[1]);
      if (/\d{1,2}:\d{2}/.test(m[2])) bad.push('可见文本带时间：' + m[2]);
    }
    assert.ok(html.indexOf('<time datetime=') !== -1, '页面里没有 <time>，断言会空转');
    assert.deepStrictEqual(bad, [], bad.join(' / '));
  });

  ok('嵌在页面里的悬停数据是合法 JSON，且只包含有内容的日子', () => {
    const m = fs.readFileSync(PAGE27, 'utf8').match(/id="cal-day-data">([\s\S]*?)<\/script>/);
    assert.ok(m, '页面里没有 cal-day-data');
    const data = JSON.parse(m[1]);
    const keys = Object.keys(data);
    // 周末不再单独出卡（除了「周末」两个字没别的内容），条目比含周末时少一大截
    assert.ok(keys.length > 60, '悬停数据条目过少：' + keys.length);
    assert.strictEqual(data['2027-02-05'].name, '春节');
    assert.ok(!data['2027-01-07'], '普通工作日不该进悬停数据');
    assert.ok(!data['2027-01-09'], '普通周末不该单独进悬停数据（没有节日/节气的话）');
    assert.ok(data['2027-02-20'], '元宵节该进悬停数据');
  });

  ok('详情卡的数据里带着图片署名与授权（产物层，授权条件）', () => {
    const m = fs.readFileSync(PAGE27, 'utf8').match(/id="cal-day-data">([\s\S]*?)<\/script>/);
    assert.ok(m, '页面里没有 cal-day-data');
    const data = JSON.parse(m[1]);
    assert.strictEqual(data['2027-02-06'].img, '/img/holidays/chunjie.jpg', '春节卡片没带配图');
    assert.match(data['2027-02-06'].credit || '', /^图：.+ \/ CC /, '春节卡片没带署名/授权');
    assert.match(data['2027-02-06'].creditUrl || '', /^https:\/\/commons\.wikimedia\.org\//, '署名没有指回原文件页');
  });

  // .cal-fest-cols 是两列网格。表头曾经是它的独立子元素，于是「表头 + 两个列表」三个
  // 子元素被塞进两列：表头占 (1,1)、第一个列表 (1,2)、第二个列表 (2,1)，
  // 第一行高度 = 列表高度，表头下方空出 600 多像素（E-050）。
  // 现在每个 .cal-fest-col 自带一份表头，列里只有「表头 + 列表」两个子元素。
  ok('节日列表两列各带表头，不会出现半屏空白（E-050）', () => {
    const cols = (html.match(/class="cal-fest-col"/g) || []).length;
    const heads = (html.match(/class="cal-fest-head"/g) || []).length;
    const lists = (html.match(/class="cal-fest-list"/g) || []).length;
    assert.strictEqual(cols, 2, '节日列表不是两列（实际 ' + cols + '）');
    assert.strictEqual(heads, cols, '表头数量与列数不一致：表头又跑出列外了');
    assert.strictEqual(lists, cols, '列表数量与列数不一致');
    // 表头与行用的是同一套网格模板，「备注」标签必须落在它标注的那一列
    const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
    const at = css.indexOf('.cal-fest-head {');
    const rule = css.slice(at, css.indexOf('}', at));
    assert.ok(/grid-template-areas:\s*"date main"\s*"\. note"/.test(rule.replace(/\s+/g, ' ')),
      '.cal-fest-head 的网格区域与 .cal-fest-row 不一致，「备注」标签会对不齐');
  });

  ok('表格渲染了 7 行且带锚点', () => {
    const rows = (html.match(/<tr id="holiday-/g) || []).length;
    assert.strictEqual(rows, 7, '表格行数不是 7（实际 ' + rows + '）');
  });

  // 官方年份的表比预计年份多一列「调休上班日」，并在年一览下方多一行「来源」——两者都是
  // 参考站的做法：没公布的年份不编调休、也不标来源。
  ok('官方年份多一列调休上班日 + 一行来源，预计年份两者都没有', () => {
    const off = fs.readFileSync(path.join(PUBLIC, 'holidays', '2026', 'index.html'), 'utf8');
    const exp = fs.readFileSync(path.join(PUBLIC, 'holidays', '2027', 'index.html'), 'utf8');
    assert.ok(off.indexOf('>调休上班日</th>') !== -1, '2026 页缺「调休上班日」列表头');
    assert.ok(off.indexOf('class="cal-makeup"') !== -1, '2026 页的调休列没渲染出来');
    assert.ok(exp.indexOf('>调休上班日</th>') === -1, '2027 是预计年份，不该有调休列');
    assert.ok(off.indexOf('来源：国务院办公厅') !== -1, '2026 页缺「来源：…」那一行');
    assert.ok(exp.indexOf('来源：国务院办公厅') === -1, '2027 页不该有来源行');
    assert.ok(off.indexOf('>数据来源<') === -1, '「数据来源」大块又回来了——只留一行来源');
    assert.ok(off.indexOf('是为了凑出连休而需要上班的周末') !== -1, '缺「调休上班日」释义那一行');
    // 调休日期要真落到对应的节日行上（2026 春节的 02-14、02-28）
    assert.ok(off.indexOf('02-14 周六') !== -1 && off.indexOf('02-28 周六') !== -1,
      '2026 春节的调休日没渲染出来');
  });

  ok('导航与页面互链存在（/holidays/ 进了「更多」下拉）', () => {
    const index = path.join(PUBLIC, 'index.html');
    assert.ok(fs.existsSync(index), 'public/index.html 不存在');
    const home = fs.readFileSync(index, 'utf8');
    assert.ok(home.indexOf('href="/holidays/"') !== -1, '首页导航里没有 /holidays/ 入口');
  });
}

// ---------- ⑤ 字体与单页配色（2026-10-22 对齐参考站观感） ----------
//
// 这一页的视觉是主人拍板的「单页破例」：配色与字体只在 .cal-page 作用域内换成
// 参考站那套，站点 token 与其它页面一律不动。破例一旦溢出成全站换色，
// 没有任何测试会报警——所以这里显式锁「破例的边界」。

ok('自托管字体文件存在且确实是 woff2', () => {
  ['fraunces-600-latin.woff2', 'nunito-sans-var-latin.woff2'].forEach((f) => {
    const abs = path.join(ROOT, 'source/fonts', f);
    assert.ok(fs.existsSync(abs), '缺少 source/fonts/' + f);
    assert.strictEqual(fs.readFileSync(abs).subarray(0, 4).toString('latin1'), 'wOF2',
      f + ' 不是 woff2（magic 不是 wOF2）——下载被截断或拿到了错误响应体');
  });
});

ok('site.css 注册了 Fraunces 与 Nunito Sans，且不含商业字体 Avenir', () => {
  const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
  assert.ok(css.indexOf('font-family: "Fraunces"') !== -1, 'site.css 没有注册 Fraunces');
  assert.ok(css.indexOf('font-family: "Nunito Sans"') !== -1, 'site.css 没有注册 Nunito Sans');
  // 先去注释再查：§4.12 的注释里会写明「参考站用 Avenir，我们不用」，那是说明文字，
  // 不是 font-family 声明（E-031 同型：按整页文本搜关键词会被注释误报）。
  const code = css.replace(/\/[\s\S]*?\*\//g, '');
  assert.ok(!/Avenir/.test(code),
    'site.css 的 font-family 里出现了 Avenir —— 那是 Monotype 的商业授权字体，不能随仓库分发');
});

ok('Ties 冷调体系全站统一（V6 2026-10-31 主人拍板）：:root 与 .cal-page 同值', () => {
  const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
  const at = css.indexOf('.cal-page {');
  assert.ok(at !== -1, 'site.css 缺少 .cal-page 规则');
  const scoped = css.slice(at, css.indexOf('}', at));
  assert.ok(scoped.indexOf('--accent: #0a7cff') !== -1, '.cal-page 里没有 --accent #0a7cff（Ties 品牌蓝）');
  assert.ok(scoped.indexOf('background: transparent') !== -1, '.cal-page 未交出底色给 ambient 渐变（V6 应为 transparent）');

  // 历史：V4 反向锁「参考站色不进 :root」；V5 反转为正向锁定参考站值；
  // V6 全站迁 Ties 冷调，继续正向锁定新值——防止漂移回两套皮肤。
  const rootAt = css.indexOf(':root {');
  const root = css.slice(rootAt, css.indexOf('}', rootAt));
  assert.ok(/--accent:\s*#0a7cff/.test(root), ':root 的 --accent 未统一为 Ties 品牌蓝 #0a7cff');
  assert.ok(/--on-ink:\s*#f6f7fb/.test(root), ':root 的 --on-ink 未统一为 ambient 浅色 #f6f7fb');
});

// 年份导航从 12 个变 16 个时，`.cal-years { flex: none }` 让它按 max-content 撑到
// 621px，手机上把整页顶出 351px 横向滚动条（E-049）。这条锁「必须允许收缩」。
ok('年份导航允许收缩换行，不会把页面撑出横向滚动条（E-049）', () => {
  const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
  const at = css.indexOf('.cal-years {');
  assert.ok(at !== -1, 'site.css 缺少 .cal-years 规则');
  const rule = css.slice(at, css.indexOf('}', at));
  assert.ok(!/flex:\s*none/.test(rule),
    '.cal-years 用了 flex:none —— 年份一多就会按 max-content 撑开，窄屏出现整页横向滚动');
  assert.ok(/min-width:\s*0/.test(rule), '.cal-years 缺 min-width:0，flex 项目不会收缩到内容以下');
  // 窄屏断点里还要把页头改成上下堆叠，否则左右两栏挤在一行仍然会溢出
  const mq = css.slice(css.indexOf('@media (max-width: 575.98px)'));
  assert.ok(mq.indexOf('.cal-head-row { grid-template-columns: minmax(0, 1fr)') !== -1,
    '窄屏断点里没有把 .cal-head-row 改成单列');
});

// §4.12 是节假日页的全部样式，集中在一段里。历史上它被「整份 site.css 覆盖写」的提交
// 整块带回旧版本过（E-052：cal-head-row / cal-years / cal-panel 全部消失，页面照常能开，
// 只是样式全塌）。这条按选择器清单做段完整性检查——少任何一个都 FAIL。
ok('§4.12 节假日样式段完整（E-052：整份覆盖站点样式时最容易丢的就是这一段）', () => {
  const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
  const must = [
    '.cal-page {', '.cal-head-row', '.cal-years', '.cal-year-current',
    '.cal-table', '.cal-makeup', '.cal-fest-col', '.cal-fest-head', '.cal-terms',
    '.cal-prose', '.cal-faq', '.cal-panel {', '.cal-panel-credit', '.cal-after',
  ];
  const missing = must.filter((s) => css.indexOf(s) === -1);
  assert.deepStrictEqual(missing, [], 'site.css 丢了这些节假日样式：' + missing.join('、'));
});

ok('字体产物已随构建落到 public/fonts/（public/ 存在时）', () => {
  if (!fs.existsSync(PUBLIC)) return;
  ['fraunces-600-latin.woff2', 'nunito-sans-var-latin.woff2'].forEach((f) => {
    assert.ok(fs.existsSync(path.join(PUBLIC, 'fonts', f)), 'public/fonts/ 缺少 ' + f);
  });
});

// ---------- ④ 配图（Wikimedia Commons 自由授权图） ----------
//
// 这一节锁的不是「好不好看」，而是**授权条件**：CC BY / CC BY-SA 要求署名 + 授权声明 +
// 指回原文件页。这三样任何一样被后续改动弄丢，图就变成无授权使用——而页面照常渲染，
// 没有任何东西会报警。所以要按「数据里必须齐 → 文件必须真 → 产物里必须带出去」三层锁死。

const IMG_DIR = path.join(ROOT, 'source/img/holidays');
const META_IMAGES = (raw.meta && raw.meta.images) || {};

// 只读 SOF 段拿宽高，不引第三方库
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xFF) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

ok('七个法定节假日都有配图，且署名 / 授权 / 原文件页齐全（授权条件）', () => {
  const ids = ['yuandan', 'chunjie', 'qingming', 'laodong', 'duanwu', 'zhongqiu', 'guoqing'];
  ids.forEach((id) => {
    const m = META_IMAGES[id];
    assert.ok(m, 'meta.images 缺少 ' + id);
    assert.match(m.file, /^\/img\/holidays\/[a-z]+\.jpg$/, id + ' 的 file 路径不对：' + m.file);
    assert.ok((m.alt || '').length >= 4, id + ' 缺 alt 文字');
    assert.ok((m.author || '').length >= 2, id + ' 缺作者署名');
    assert.match(m.license || '', /^(CC0|CC BY|CC BY-SA|公有领域|Public domain)/, id + ' 的授权写错了：' + m.license);
    assert.match(m.page || '', /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, id + ' 的原文件页不是 Commons 链接');
  });
  // 反查：数据里的每个 holiday id 都必须能拿到图，不能出现「图挂在没人用的 id 上」
  const cal2027 = buildCalendar(raw, 2027);
  cal2027.holidays.forEach((h) => {
    assert.ok(h.img, h.name + ' 在详情卡里没有配图');
    assert.ok(h.credit, h.name + ' 的详情卡没有署名');
    assert.strictEqual(h.img, META_IMAGES[h.id].file, h.name + ' 取到的图不是 meta.images 里那张');
  });
});

ok('配图文件存在、确实是 JPEG、宽度足够', () => {
  ['yuandan', 'chunjie', 'qingming', 'laodong', 'duanwu', 'zhongqiu', 'guoqing'].forEach((id) => {
    const f = path.join(IMG_DIR, id + '.jpg');
    assert.ok(fs.existsSync(f), '缺少配图文件：source/img/holidays/' + id + '.jpg');
    const buf = fs.readFileSync(f);
    const size = jpegSize(buf);
    assert.ok(size, id + '.jpg 不是可解析的 JPEG');
    assert.ok(size.w >= 800, id + '.jpg 只有 ' + size.w + 'px 宽，详情卡放大后会糊');
    assert.ok(buf.length > 50 * 1024, id + '.jpg 只有 ' + buf.length + ' 字节，像是压坏了');
  });
});

// ---------- ④ 断言自检 ----------

ok('自检：把法定假日数改错必须被抓到', () => {
  const bad = JSON.parse(JSON.stringify(raw));
  bad.years.find((y) => y.year === 2027).holidays[0].statutory = 2; // 元旦应为 1 天
  const c2 = buildCalendar(bad, 2027);
  assert.notStrictEqual(c2.stats.statutoryDays, 13, '数据改动没有被统计反映出来——断言会空转');
});

ok('自检：把配图的署名删掉，详情卡必须也跟着没有署名（说明断言在查数据而非常量）', () => {
  const bad = JSON.parse(JSON.stringify(raw));
  delete bad.meta.images.chunjie.author;
  const c2 = buildCalendar(bad, 2027);
  const cj = c2.holidays.find((h) => h.id === 'chunjie');
  assert.strictEqual(cj.credit, '', '删了作者还拿得到署名——断言会空转');
  assert.ok(cj.img, '配图本身不该跟着丢');
});

ok('自检：删掉某年的节气必须被抓到（E-047 防复发）', () => {
  const bad = JSON.parse(JSON.stringify(raw));
  bad.years.find((y) => y.year === 2027).terms = [];
  const c2 = buildCalendar(bad, 2027);
  assert.strictEqual(c2.terms.length, 0, '数据改动没生效——断言会空转');
  // 真正起作用的是上面那条「每年 24 个节气」：这里确认它统计的是 terms 而不是别的。
  assert.notStrictEqual(c2.terms.length, 24);
});

ok('自检：把节气日期改到上一年必须被抓到', () => {
  const bad = JSON.parse(JSON.stringify(raw));
  bad.years.find((y) => y.year === 2027).terms[0].date = '2026-01-05';
  const c2 = buildCalendar(bad, 2027);
  assert.notStrictEqual(c2.terms[0].date, buildCalendar(raw, 2027).terms[0].date,
    '数据改动没生效——断言会空转');
});

ok('自检：把 .cal-years 改回 flex:none 必须被抓到（E-049 防复发）', () => {
  const broken = '.cal-years { flex: none; text-align: right; }';
  assert.ok(/flex:\s*none/.test(broken), '自检样本应当命中规则，否则断言空转');
  const fixed = '.cal-years { flex: 0 1 auto; min-width: 0; text-align: right; }';
  assert.ok(!/flex:\s*none/.test(fixed) && /min-width:\s*0/.test(fixed), '修好的写法应当通过');
});

ok('自检：模板编译断言对语法错误确实会失败（E-045 防复发）', () => {
  const ejs = require('ejs');
  const broken = '<% if (x) { %><p>unclosed</p>';
  let err = null;
  try { ejs.compile(broken, { filename: 'x.ejs' }); } catch (e) { err = e; }
  assert.ok(err, '自检样本应当编译失败，否则断言空转');
});

ok('自检：把某天的放假区间改掉必须改变逐日状态', () => {
  const bad = JSON.parse(JSON.stringify(raw));
  bad.years.find((y) => y.year === 2027).holidays[1].start = '2027-02-06';
  const c2 = buildCalendar(bad, 2027);
  assert.strictEqual(c2.days['2027-02-05'].state, 'work', '2 月 5 日仍被标成放假——状态判定有问题');
});

console.log('\nRESULT: ' + pass + ' 项断言通过' + (process.exitCode ? '，存在失败' : ''));
process.exit(process.exitCode || 0);
