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
const cal = buildCalendar(raw);
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
  const d = cal.days['2027-10-08'];
  assert.ok(d.festival && d.festival.name === '重阳节', '10 月 8 日缺重阳节');
  assert.ok(d.term && d.term.name === '寒露', '10 月 8 日缺寒露节气');
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
  const y = copy.years[0];
  y.holidays.forEach((h) => {
    h.date = toDate(h.date); h.start = toDate(h.start); h.end = toDate(h.end);
  });
  y.festivals.forEach((f) => { f.date = toDate(f.date); });
  y.terms.forEach((t) => { t.date = toDate(t.date); });

  const cal2 = buildCalendar(copy);
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
  assert.strictEqual(t.n, '春节');
  assert.strictEqual(t.k, cal.label + '放假');
  assert.match(t.a, /02-05 → 02-12 · 8 天/);
  assert.strictEqual(t.h, 'holiday-chunjie');
});

ok('不放假的日子也能说清「为什么」，普通工作日不占体积', () => {
  const tips = tipPayload(cal);
  assert.strictEqual(tips['2027-02-20'].n, '元宵节');
  assert.match(tips['2027-02-20'].k, /周末/);
  assert.ok(tips['2027-01-05'].n === '小寒', '节气日应有名字');
  assert.strictEqual(tips['2027-07-14'], undefined, '普通工作日不该进 payload');
});

// ---------- ③ 产物落地 ----------

if (!fs.existsSync(PUBLIC)) {
  console.log('  - SKIP 产物断言（没有 public/，先跑 npm run build）');
} else {
  ok('页面存在且不是 0 字节（E-029 / E-038）', () => {
    assert.ok(fs.existsSync(PAGE), 'public/holidays/index.html 不存在 —— 构建漏了这一页');
    const size = fs.statSync(PAGE).size;
    assert.ok(size > 20000, '页面只有 ' + size + ' 字节，像是渲染中断');
  });

  const html = fs.existsSync(PAGE) ? fs.readFileSync(PAGE, 'utf8') : '';

  ok('365 个格子 / 28 个放假格 / 12 个月行', () => {
    const cells = (html.match(/class="cal-cell /g) || []).length;
    const holidayCells = (html.match(/cal-cell is-holiday/g) || []).length;
    const rows = (html.match(/class="cal-row"/g) || []).length;
    assert.strictEqual(cells, 365, '格子数不是 365（实际 ' + cells + '）');
    assert.strictEqual(holidayCells, 28, '放假格数不是 28（实际 ' + holidayCells + '）');
    assert.strictEqual(rows, 12, '月份行数不是 12（实际 ' + rows + '）');
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

  ok('嵌在页面里的悬停数据是合法 JSON，且含春节', () => {
    const m = html.match(/id="cal-day-data">([\s\S]*?)<\/script>/);
    assert.ok(m, '页面里没有 cal-day-data');
    const data = JSON.parse(m[1]);
    assert.ok(Object.keys(data).length > 140, '悬停数据条目过少：' + Object.keys(data).length);
    assert.strictEqual(data['2027-02-05'].n, '春节');
  });

  ok('表格渲染了 7 行且带锚点', () => {
    const rows = (html.match(/<tr id="holiday-/g) || []).length;
    assert.strictEqual(rows, 7, '表格行数不是 7（实际 ' + rows + '）');
  });

  ok('导航与页面互链存在（/holidays/ 进了「更多」下拉）', () => {
    const index = path.join(PUBLIC, 'index.html');
    assert.ok(fs.existsSync(index), 'public/index.html 不存在');
    const home = fs.readFileSync(index, 'utf8');
    assert.ok(home.indexOf('href="/holidays/"') !== -1, '首页导航里没有 /holidays/ 入口');
  });
}

// ---------- ④ 断言自检 ----------

ok('自检：把法定假日数改错必须被抓到', () => {
  const bad = JSON.parse(JSON.stringify(raw));
  bad.years[0].holidays[0].statutory = 2; // 元旦应为 1 天
  const c2 = buildCalendar(bad);
  assert.notStrictEqual(c2.stats.statutoryDays, 13, '数据改动没有被统计反映出来——断言会空转');
});

ok('自检：把某天的放假区间改掉必须改变逐日状态', () => {
  const bad = JSON.parse(JSON.stringify(raw));
  bad.years[0].holidays[1].start = '2027-02-06';
  const c2 = buildCalendar(bad);
  assert.strictEqual(c2.days['2027-02-05'].state, 'work', '2 月 5 日仍被标成放假——状态判定有问题');
});

console.log('\nRESULT: ' + pass + ' 项断言通过' + (process.exitCode ? '，存在失败' : ''));
process.exit(process.exitCode || 0);
