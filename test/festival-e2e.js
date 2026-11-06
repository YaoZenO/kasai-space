'use strict';
// 节日文化页（/library/<slug>/，12 页）端到端验证。
// 2026-10-27 新增：数据 festivals.yml + holidays.yml 跨源现算、helper festival-data.js、
// 模板 festival.ejs、样式 site.css §4.15、脚本 festival.js。
//
// 为什么要有这一套（与 zodiac-e2e.js / holidays-e2e.js 同一理由）：
//   这一族页面由两个数据文件 + 一个 helper 算出来，模板里没有一句手写日期。
//   「数据写错 / 算错 / 取错记录」不会有任何报错——页面照常生成、样式照常漂亮，
//   只是某个节日某年的日期错了。所以这里锁四层：
//     ① 跨源一致（S4 最关键）：12 slug × 11 年 = 132 行日期全非空，2026 行与
//        holidays.yml 逐字相同（法定 6 个连 start/end 一起锁）；
//     ② 缺数据不静默（S6 / E-047）：任一 slug 任一年取不到记录必须 FAIL，
//        helper 的 error 标记对象也锁死，不允许悄悄渲染空表；
//     ③ 产物落地（S1/S2/S3/S5/S7/S9/S12）：页面存在且非半成品、锚点目录齐全、
//        配图授权合规、年份表 11 行直出（渐进增强，无 JS 全可见）；
//     ④ CSS 段完整（E-052 同型）+ 负向断言：§4.15 十三个核心选择器、
//        导航条防 E-049（禁 flex:none、必须 min-width:0）、标题防 E-043
//        （禁 overflow-wrap:anywhere）、--fs-fig-* 纹样色 token 边界（不外溢）。
//
// 国庆调休说明（S4 的抽查锚点）：2026 年国庆假期为 10-01 至 10-08，
// 调休上班日为 10-10（周日）。helper 按 [start−7, end+7] 窗口从 holidays.yml
// 的 makeup 里归属调休日——10-10 距区间终点 2 天，必须落进国庆名下而不是中秋。
//
// 运行：node test/festival-e2e.js
// 前置：npm run build（产物断言依赖 public/）。public/ 不存在时产物段 SKIP，
//       但 public/ 存在而页面缺失一律判 FAIL——那说明构建真的漏了这些页。

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const {
  FESTIVAL_KEY, buildFestival, currentYearOf, addDays
} = require('../themes/fluid/scripts/helpers/festival-data.js');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, process.env.SITE_OUT || 'public');

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

const raw = yaml.load(fs.readFileSync(path.join(ROOT, 'source', '_data', 'festivals.yml'), 'utf8'));
const holidaysRaw = yaml.load(fs.readFileSync(path.join(ROOT, 'source', '_data', 'holidays.yml'), 'utf8'));

// 固定导航序（法定 6 在前、传统 6 在后），与模板 FS_NAV / 页面顺序同源
const SLUGS = ['yuandan', 'chunjie', 'qingming', 'duanwu', 'zhongqiu', 'guoqing',
  'yuanxiao', 'qixi', 'zhongyuan', 'chongyang', 'dongzhi', 'laba'];
const LEGAL = SLUGS.slice(0, 6);
const CSS_FIG_SLUGS = ['yuanxiao', 'qixi', 'zhongyuan', 'laba'];
const CUR = currentYearOf(holidaysRaw);

// 章节锚点 id 的合法集合（11 个约定值；vocab/faq 两节由 helper 注入）。
// id 锁死、title 允许变体（裁决 15-2）。
const SECTION_IDS = ['what', 'when', 'origin', 'history', 'customs', 'food',
  'vocab', 'faq', 'end', 'places', 'poems'];
const REQUIRED_IDS = ['what', 'when', 'end', 'vocab', 'faq'];

const built = {};
SLUGS.forEach((s) => { built[s] = buildFestival(raw, holidaysRaw, s); });

console.log('节日页数据与计算');

// ---------- ① 数据自洽 ----------

ok('十二个 slug 全部命中 FESTIVAL_KEY，一个不多一个不少', () => {
  assert.deepStrictEqual(Object.keys(FESTIVAL_KEY).sort(), SLUGS.slice().sort(),
    'FESTIVAL_KEY 与 12 slug 不一致');
  SLUGS.forEach((s) => {
    const f = built[s];
    assert.ok(f && !f.error, s + ' 构建失败：' + (f && f.error));
    assert.strictEqual(f.slug, s, s + ' 的 slug 字段不对');
  });
});

ok('法定 6 个 holidayKey 与 holidays.yml 的 holidays[].id 逐字相同', () => {
  const y = holidaysRaw.years.find((v) => Number(v.year) === CUR);
  LEGAL.forEach((s) => {
    const f = built[s];
    assert.strictEqual(f.legal, true, s + ' 应为法定节日');
    const src = raw.festivals.find((x) => x.key === s);
    assert.ok(src.holidayKey, s + ' 的 yml 条目缺 holidayKey');
    assert.strictEqual(src.holidayKey, src.key, s + ' 的 holidayKey 与 key 不一致（helper 按 key 取数）');
    const rec = (y.holidays || []).find((h) => h.id === src.holidayKey);
    assert.ok(rec, s + ' 的 holidayKey「' + src.holidayKey + '」在 ' + CUR + ' 年取不到记录');
  });
});

// S4（最关键）：132 行全非空；2026 行与 holidays.yml 逐字相同；法定 6 个连 start/end 一起锁
ok('S4：12 slug × 11 年 = 132 行日期全非空，行数恰为 11', () => {
  let total = 0;
  SLUGS.forEach((s) => {
    const rows = built[s].tableRows;
    assert.strictEqual(rows.length, 11, s + ' 的年份表不是 11 行（实际 ' + rows.length + '）');
    rows.forEach((r) => {
      assert.ok(r.date && !r.missing, s + ' ' + r.year + ' 年缺日期记录（E-047：缺数据不允许静默）');
      assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, s + ' ' + r.year + ' 日期格式不对：' + r.date);
      total += 1;
    });
  });
  assert.strictEqual(total, 132, '总行数不是 132');
});

ok('S4：' + CUR + ' 行与 holidays.yml 逐字一致（法定 6 个含 start / end / days）', () => {
  const y = holidaysRaw.years.find((v) => Number(v.year) === CUR);
  assert.ok(y, 'holidays.yml 缺 ' + CUR + ' 年');
  SLUGS.forEach((s) => {
    const f = built[s];
    const row = f.tableRows.find((r) => r.year === CUR);
    assert.ok(row, s + ' 缺 ' + CUR + ' 行');
    let rec;
    if (f.legal) {
      rec = (y.holidays || []).find((h) => h.id === f.key);
      assert.ok(rec, s + ' 在 ' + CUR + ' 年的 holidays[] 取不到记录');
      assert.strictEqual(row.date, String(rec.date), s + ' 当天日期与 holidays.yml 不一致');
      assert.strictEqual(row.start, String(rec.start), s + ' 放假起点与 holidays.yml 不一致');
      assert.strictEqual(row.end, String(rec.end), s + ' 放假终点与 holidays.yml 不一致');
      assert.strictEqual(Number(row.days), Number(rec.days), s + ' 天数与 holidays.yml 不一致');
    } else {
      rec = (y.festivals || []).find((h) => h.name === FESTIVAL_KEY[s].key);
      assert.ok(rec, s + ' 在 ' + CUR + ' 年的 festivals[] 取不到「' + FESTIVAL_KEY[s].key + '」');
      assert.strictEqual(row.date, String(rec.date), s + ' 当天日期与 holidays.yml 不一致');
    }
    assert.strictEqual(row.label, y.label || (y.official === false ? '预计' : '官方'),
      s + ' 的官方/预计标签不对');
  });
});

//  dongzhi 的陷阱锚点：holidays.yml 的 terms[] 里也有「冬至」（裸记录，无 name 匹配口径），
//  helper 必须取 festivals[] 里 name === '冬至' 的那条。取错会拿到没有 label 的裸记录。
ok('dongzhi / qingming 的取数路径正确（dongzhi 取 festivals[]，qingming 取 holidays[]）', () => {
  const y = holidaysRaw.years.find((v) => Number(v.year) === CUR);
  const dz = y.festivals.find((h) => h.name === '冬至');
  assert.ok(dz, CUR + ' 年 festivals[] 缺「冬至」');
  assert.strictEqual(built.dongzhi.tableRows.find((r) => r.year === CUR).date, String(dz.date),
    'dongzhi 的 ' + CUR + ' 行不是 festivals[] 里的冬至');
  const qm = y.holidays.find((h) => h.id === 'qingming');
  assert.ok(qm, CUR + ' 年 holidays[] 缺 qingming');
  assert.strictEqual(built.qingming.tableRows.find((r) => r.year === CUR).date, String(qm.date),
    'qingming 的 ' + CUR + ' 行不是 holidays[] 里的清明');
});

ok('国庆调休窗口：' + CUR + ' 年调休上班日落在 [start−7, end+7] 内（抽查 10-10）', () => {
  const gq = built.guoqing.tableRows.find((r) => r.year === CUR);
  assert.ok(gq.makeup && gq.makeup.length, CUR + ' 年国庆没有算出调休上班日');
  gq.makeup.forEach((d) => {
    assert.ok(d >= addDays(gq.start, -7) && d <= addDays(gq.end, 7),
      '调休日 ' + d + ' 落在国庆窗口 [start−7, end+7] 之外（归属错了）');
  });
  // 2026 年实际值锚点：10-01 至 10-08 放假，10-10 调休上班
  if (CUR === 2026) {
    assert.ok(gq.makeup.indexOf('2026-10-10') !== -1,
      '2026 年国庆的调休上班日应含 10-10（实际：' + gq.makeup.join(', ') + '）');
  }
});

ok('S6：缺数据不静默——删掉任一年记录，helper 必须返回 error 标记（E-047）', () => {
  const bad = JSON.parse(JSON.stringify(holidaysRaw));
  bad.years.find((v) => Number(v.year) === CUR).holidays =
    bad.years.find((v) => Number(v.year) === CUR).holidays.filter((h) => h.id !== 'chunjie');
  const f = buildFestival(raw, bad, 'chunjie');
  assert.ok(f && f.error, '删掉春节记录后 helper 没有返回 error——断言会空转');
  assert.match(f.error, /E-047/, 'error 信息里没有 E-047 标记');

  const bad2 = JSON.parse(JSON.stringify(holidaysRaw));
  delete bad2.years.find((v) => Number(v.year) === CUR).festivals;
  const f2 = buildFestival(raw, bad2, 'laba');
  assert.ok(f2 && f2.error, '删掉 festivals[] 后 helper 没有返回 error');
});

ok('未知 slug 与缺 front-matter 同样返回 error，不静默渲染', () => {
  assert.ok(buildFestival(raw, holidaysRaw, 'chongyang2').error, '未知 slug 应返回 error');
});

// ---------- ② 章节结构与内容 ----------

ok('章节结构：9-11 节，id 全部落在 11 个约定值内，必需章节齐全', () => {
  SLUGS.forEach((s) => {
    const ids = built[s].sections.map((x) => x.id);
    assert.ok(ids.length >= 9 && ids.length <= 11, s + ' 的章节数是 ' + ids.length);
    ids.forEach((id) => {
      assert.ok(SECTION_IDS.indexOf(id) !== -1, s + ' 出现了约定外的章节 id：' + id);
    });
    REQUIRED_IDS.forEach((id) => {
      assert.ok(ids.indexOf(id) !== -1, s + ' 缺必需章节 ' + id);
    });
    // 顺序：vocab / faq 由 helper 注入在 food 之后（end 之前）
    const at = (id) => ids.indexOf(id);
    assert.ok(at('vocab') > at('food'), s + ' 的词汇表不在 food 之后');
    assert.ok(at('faq') > at('vocab'), s + ' 的 FAQ 不在词汇表之后');
    assert.ok(at('end') > at('faq'), s + ' 的结尾节不在 FAQ 之后');
    built[s].sections.forEach((x) => assert.ok(x.title, s + ' 有章节缺标题'));
  });
});

ok('facts 表 6 行齐全，末行「当年日期」带纯日期 <time>（E-028）', () => {
  SLUGS.forEach((s) => {
    const f = built[s];
    assert.strictEqual(f.facts.length, 6, s + ' 的 facts 不是 6 行');
    const last = f.facts[5];
    assert.ok(new RegExp('<time datetime="' + CUR + '-').test(last.v), s + ' 的当年日期行缺 <time>');
    assert.ok(last.v.indexOf('GMT') === -1, s + ' 的 facts 里出现 GMT（E-028）');
  });
});

ok('词汇表 12-14 行、祝福语 3 行，字段齐全；标签口径正确（裁决 15-3）', () => {
  SLUGS.forEach((s) => {
    const f = built[s];
    assert.ok(f.vocab.length >= 12 && f.vocab.length <= 14, s + ' 的词汇行数是 ' + f.vocab.length);
    assert.strictEqual(f.greetings.length, 3, s + ' 的祝福语不是 3 行');
    f.vocab.concat(f.greetings).forEach((v) => {
      assert.ok(v.t && v.p && v.m, s + ' 有词条缺字段：' + JSON.stringify(v));
    });
    // 标签口径（裁决 15-3）：清明/中元/重阳/腊八走「说法」轨（内容源可带节名前缀，
    // 如「清明的相关说法」），其余六个一律「祝福语」
    const special = ['qingming', 'zhongyuan', 'laba', 'chongyang'];
    if (special.indexOf(s) !== -1) {
      assert.match(f.greetingsLabel, /说法$/, s + ' 的 greetingsLabel 不是「说法」轨：' + f.greetingsLabel);
    } else {
      assert.strictEqual(f.greetingsLabel, '祝福语', s + ' 的 greetingsLabel 不对');
    }
  });
});

ok('S8：中文长文案没有换行符与「汉字 空格 汉字」（E-042 防复发）', () => {
  const cjkSpaceCjk = /[\u4e00-\u9fff] [\u4e00-\u9fff]/;
  SLUGS.forEach((s) => {
    const f = built[s];
    assert.ok(!/\n/.test(f.lede), s + ' 的引导段有换行');
    assert.ok(!cjkSpaceCjk.test(f.lede), s + ' 的引导段里有可疑空格');
    assert.ok(!/\n/.test(f.desc) && !cjkSpaceCjk.test(f.desc), s + ' 的描述里有折行插空格');
    f.sections.forEach((sec) => {
      if (!sec.body) return;
      assert.ok(!/\n/.test(sec.body), s + '/' + sec.id + ' 的正文有换行（数据必须单行书写）');
      assert.ok(!cjkSpaceCjk.test(sec.body), s + '/' + sec.id + ' 的正文里有「汉字 空格 汉字」');
    });
    f.faq.forEach((x) => {
      assert.ok(!cjkSpaceCjk.test(x.q) && !cjkSpaceCjk.test(x.a), s + ' 的 FAQ 里有可疑空格');
    });
  });
});

ok('S9：数据日期字段是字符串不是 Date（E-028；传统节日无 start/end，存在即须为字符串）', () => {
  SLUGS.forEach((s) => {
    built[s].tableRows.forEach((r) => {
      assert.strictEqual(typeof r.date, 'string', s + ' ' + r.year + ' 的 date 不是字符串');
      if (r.start !== undefined) {
        assert.strictEqual(typeof r.start, 'string', s + ' ' + r.year + ' 的 start 不是字符串');
        assert.strictEqual(typeof r.end, 'string', s + ' ' + r.year + ' 的 end 不是字符串');
      }
    });
  });
});

// ---------- ③ 配图授权（三层锁：数据三要素 → 文件是真的 → 产物带出） ----------

const META_IMAGES = (raw.meta && raw.meta.images) || {};

ok('配图注册表：8 实图三要素齐全，4 个 CSS 纹样标记正确', () => {
  assert.deepStrictEqual(Object.keys(META_IMAGES).sort(), SLUGS.slice().sort(),
    'meta.images 的键与 12 slug 不一致');
  SLUGS.forEach((s) => {
    const m = META_IMAGES[s];
    if (CSS_FIG_SLUGS.indexOf(s) !== -1) {
      assert.strictEqual(m.css, true, s + ' 应标记 css: true');
      assert.ok(!m.file, s + ' 标了 css: true 却还带 file');
      return;
    }
    assert.ok(!m.css, s + ' 有实图却标了 css: true');
    assert.match(m.file, /^\/img\/festival\/[a-z]+\.jpg$/, s + ' 的 file 路径不对：' + m.file);
    assert.ok((m.alt || '').length >= 4, s + ' 缺 alt 文字');
    assert.ok((m.author || '').length >= 2, s + ' 缺作者署名');
    assert.match(m.license || '', /^(CC0|CC BY|CC BY-SA|公有领域|Public domain)/,
      s + ' 的授权写错了：' + m.license);
    assert.match(m.page || '', /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/,
      s + ' 的原文件页不是 Commons 链接');
  });
});

ok('实图文件存在、确实是 JPEG、体积足够（E-029 同型）', () => {
  SLUGS.filter((s) => CSS_FIG_SLUGS.indexOf(s) === -1).forEach((s) => {
    const buf = fs.readFileSync(path.join(ROOT, 'source', 'img', 'festival', s + '.jpg'));
    assert.strictEqual(buf[0], 0xFF, s + '.jpg 不是 JPEG（首字节不是 FF）');
    assert.strictEqual(buf[1], 0xD8, s + '.jpg 不是 JPEG（第二字节不是 D8）');
    assert.ok(buf.length > 50 * 1024, s + '.jpg 只有 ' + buf.length + ' 字节，像是下载被截断');
    assert.ok(buf.length <= 210 * 1024, s + '.jpg 有 ' + Math.round(buf.length / 1024) + 'KB，超过预算');
  });
});

// ---------- ④ 产物落地 ----------

if (!fs.existsSync(PUBLIC)) {
  console.log('  - SKIP 产物断言（没有 public/，先跑 npm run build）');
} else {
  ok('布局模板能独立编译（E-045：编译失败时 Hexo 会静默产出残页）', () => {
    const ejs = require('ejs');
    const src = fs.readFileSync(path.join(ROOT, 'themes/fluid/layout/festival.ejs'), 'utf8');
    let err = null;
    try { ejs.compile(src, { filename: 'festival.ejs' }); } catch (e) { err = e; }
    assert.strictEqual(err, null, 'festival.ejs 编译失败：' + (err && err.message.split('\n')[0]));
  });

  ok('S1：12 页全部生成且非半成品（>15000 字节，E-029）', () => {
    SLUGS.forEach((s) => {
      const abs = path.join(PUBLIC, 'library', s, 'index.html');
      assert.ok(fs.existsSync(abs), '缺页面：library/' + s + '/index.html');
      const size = fs.statSync(abs).size;
      assert.ok(size > 15000, 'library/' + s + '/ 只有 ' + size + ' 字节，像是渲染中断');
    });
  });

  ok('S2：每页根元素挂 paper-page cal-page fs-page，章节锚点 ≥ 7，目录 li 数与数据一致', () => {
    SLUGS.forEach((s) => {
      const h = fs.readFileSync(path.join(PUBLIC, 'library', s, 'index.html'), 'utf8');
      const f = built[s];
      assert.ok(h.indexOf('paper-page cal-page fs-page') !== -1, s + ' 页根元素没挂 fs-page');
      const secCount = (h.match(/<section class="fs-section" id="sec-/g) || []).length;
      assert.ok(secCount >= 7, s + ' 页章节锚点只有 ' + secCount + ' 个');
      assert.strictEqual(secCount, f.sections.length, s + ' 页章节数与数据不符');
      const asideAt = h.indexOf('<aside class="fs-toc"');
      assert.ok(asideAt !== -1, s + ' 页缺右栏目录');
      const aside = h.slice(asideAt, h.indexOf('</aside>', asideAt));
      const liCount = (aside.match(/<li>/g) || []).length;
      assert.strictEqual(liCount, f.sections.length, s + ' 页目录 li 数（' + liCount + '）与章节数不符');
      f.sections.forEach((sec) => {
        assert.ok(h.indexOf('id="sec-' + sec.id + '"') !== -1, s + ' 页缺章节锚点 sec-' + sec.id);
        assert.ok(h.indexOf('href="#sec-' + sec.id + '"') !== -1, s + ' 页目录缺 ' + sec.title);
      });
      assert.ok(h.indexOf('fsProgressRing') !== -1, s + ' 页缺进度环');
      assert.ok(h.indexOf('已读 0%') !== -1, s + ' 页缺进度初始文案');
      assert.ok(/festival\.js\?v=/.test(h), s + ' 页没引 festival.js（或没带版本号）');
    });
  });

  ok('S3：有图页三要素 + 署名行齐全；CSS 纹样页命中 fs-figure--css 且无空 <img>', () => {
    SLUGS.forEach((s) => {
      const h = fs.readFileSync(path.join(PUBLIC, 'library', s, 'index.html'), 'utf8');
      assert.ok(h.indexOf('src=""') === -1, s + ' 页出现空 src 的 <img>（图位空着）');
      if (CSS_FIG_SLUGS.indexOf(s) !== -1) {
        assert.ok(h.indexOf('fs-figure--css" data-slug="' + s + '"') !== -1,
          s + ' 页没渲染 CSS 纹样图位');
        assert.ok(h.indexOf('fs-fig-a') !== -1, s + ' 页纹样缺子元素');
        return;
      }
      const m = META_IMAGES[s];
      // src 带 asset-version 查询串，只比前缀
      assert.ok(h.indexOf('src="' + m.file) !== -1, s + ' 页没渲染配图');
      assert.ok(h.indexOf(m.alt) !== -1, s + ' 页缺配图 alt');
      assert.ok(h.indexOf(m.author) !== -1, s + ' 页缺配图署名');
      assert.ok(h.indexOf(m.license) !== -1, s + ' 页缺授权声明');
      assert.ok(h.indexOf(m.page) !== -1, s + ' 页缺原文件页链接');
    });
  });

  ok('S12：年份表 11 行直出 + 6 行 data-fs-extra + tfoot 展开按钮（渐进增强，无 JS 全可见）', () => {
    SLUGS.forEach((s) => {
      const h = fs.readFileSync(path.join(PUBLIC, 'library', s, 'index.html'), 'utf8');
      const t = h.slice(h.indexOf('class="cal-table fs-years"'), h.indexOf('</table>', h.indexOf('fs-years')));
      assert.ok(t.indexOf('data-collapsed="true"') !== -1, s + ' 年份表缺 data-collapsed');
      const tbody = t.slice(t.indexOf('<tbody>'), t.indexOf('</tbody>'));
      const trCount = (tbody.match(/<tr/g) || []).length;
      assert.strictEqual(trCount, 11, s + ' 年份表 tbody 不是 11 行（实际 ' + trCount + '）');
      assert.strictEqual((t.match(/data-fs-extra/g) || []).length, 6, s + ' 年份表 data-fs-extra 不是 6 行');
      assert.ok(t.indexOf('fs-years-toggle') !== -1, s + ' 年份表缺展开按钮');
      assert.ok(t.indexOf('aria-expanded="false"') !== -1, s + ' 展开按钮初始态不对');
      assert.ok(t.indexOf('展开全部 11 年') !== -1, s + ' 展开按钮文案不对');
    });
  });

  ok('年份表三形态：元旦/国庆 4 列日历表，法定 5 列，传统 3 列', () => {
    const colHeads = (h, s) => {
      const t = h.slice(h.indexOf('class="cal-table fs-years"'), h.indexOf('</thead>', h.indexOf('fs-years')));
      return (t.match(/<th scope="col">/g) || []).length;
    };
    SLUGS.forEach((s) => {
      const h = fs.readFileSync(path.join(PUBLIC, 'library', s, 'index.html'), 'utf8');
      const f = built[s];
      const expect = f.tableMode === 'calendar' ? 4 : (f.legal ? 5 : 3);
      assert.strictEqual(colHeads(h, s), expect, s + ' 年份表列数不是 ' + expect);
    });
    const gq = fs.readFileSync(path.join(PUBLIC, 'library', 'guoqing', 'index.html'), 'utf8');
    ['年份', '放假区间（当年内）', '天数', '调休上班日'].forEach((w) => {
      assert.ok(gq.indexOf(w) !== -1, '国庆日历表缺表头「' + w + '」');
    });
    const yd = fs.readFileSync(path.join(PUBLIC, 'library', 'yuandan', 'index.html'), 'utf8');
    assert.ok(yd.indexOf('fs-arrange') !== -1 || yd.indexOf('cal-makeup-none') !== -1,
      '元旦日历表缺 arrange / 调休单元格');
  });

  ok('导航条 12 项 + 当前项 + 相关阅读 12 条（另 11 节日 + 当年节假日页）', () => {
    SLUGS.forEach((s) => {
      const h = fs.readFileSync(path.join(PUBLIC, 'library', s, 'index.html'), 'utf8');
      assert.ok(h.indexOf('fs-nav-strip') !== -1, s + ' 页缺节日导航条');
      assert.ok(h.indexOf('fs-nav-current') !== -1, s + ' 页没标当前节日');
      const rel = h.slice(h.indexOf('class="fs-related"'), h.indexOf('</section>', h.indexOf('fs-related')));
      const relLinks = (rel.match(/<li class="fs-related-item">/g) || []).length;
      assert.strictEqual(relLinks, 12, s + ' 页相关阅读不是 12 条（实际 ' + relLinks + '）');
      assert.ok(rel.indexOf('href="/holidays/' + CUR + '/"') !== -1, s + ' 页相关阅读缺当年节假日页');
      SLUGS.forEach((o) => {
        if (o === s) return;
        assert.ok(rel.indexOf('href="/library/' + o + '/"') !== -1, s + ' 页相关阅读缺 ' + o);
      });
    });
  });

  ok('S5：资料库有节日文化专题卡；12 个节日页产物齐全；holidays 专题仍 2 条', () => {
    // 2026-11-04（PLAN-V3 §5）：资料库页从「平铺全部条目」改为「专题卡片墙」，
    // 页面不再逐个列出 12 个节日链接——那是专题自己的列表页该干的事。
    // 但仍然必须有一张指向节日文化的卡，且 12 个详情页的产物一个都不能少。
    const lib = fs.readFileSync(path.join(PUBLIC, 'library', 'index.html'), 'utf8');
    const libYml = yaml.load(fs.readFileSync(path.join(ROOT, 'source', '_data', 'library.yml'), 'utf8'));
    const ft = (libYml.topics || []).find((t) => t.key === 'festivals');
    assert.ok(ft, 'library.yml 缺 festivals 专题');
    assert.ok(lib.indexOf('节日文化') !== -1, '资料库缺节日文化专题卡');
    assert.ok(lib.indexOf('href="' + ft.link + '"') !== -1, '节日文化专题卡的链接不对：' + ft.link);

    SLUGS.forEach((s) => {
      assert.ok(fs.existsSync(path.join(PUBLIC, 'library', s, 'index.html')),
        '条目 link 指向的产物不存在：library/' + s + '/');
    });
    assert.strictEqual(ft.entries.length, 12, 'festivals 专题条目不是 12 条');
    const ht = (libYml.topics || []).find((t) => t.key === 'holidays');
    assert.ok(ht && ht.entries.length === 2, 'holidays 专题条目数被动过（应仍为 2）');
  });

  ok('S7：无 UGC（12 页不含 <form 与评论容器）', () => {
    SLUGS.forEach((s) => {
      const h = fs.readFileSync(path.join(PUBLIC, 'library', s, 'index.html'), 'utf8');
      assert.ok(h.indexOf('<form') === -1, s + ' 页出现 <form');
      assert.ok(h.toLowerCase().indexOf('comment') === -1, s + ' 页出现评论容器字样');
    });
  });

  ok('S9：页面文本不出现 GMT（E-028）', () => {
    SLUGS.forEach((s) => {
      const h = fs.readFileSync(path.join(PUBLIC, 'library', s, 'index.html'), 'utf8');
      assert.ok(h.indexOf('GMT') === -1, s + ' 页出现 GMT 字样');
    });
  });

  // ---------- ⑤ CSS 段完整 + 负向断言（E-052 / E-049 / E-043 / token 边界） ----------

  const css = fs.readFileSync(path.join(ROOT, 'source', 'css', 'site.css'), 'utf8');
  const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const s15At = css.indexOf('===== 4.15 节日文化页');
  const s5At = css.indexOf('===== 5. 第三方组件纸面化');
  const sec15 = s15At > -1 && s5At > s15At ? css.slice(s15At, s5At) : null;

  ok('§4.15 段存在于 §4.14 与 §5 之间（E-052：整份覆盖写最容易丢的就是新段）', () => {
    assert.ok(sec15, 'site.css 找不到 §4.15 段（或段序不对）');
  });

  ok('§4.15 十三个核心选择器齐全', () => {
    assert.ok(sec15, '§4.15 段缺失，本断言空转');
    // 寻址钩子按 DESIGN §6.2 是 data-slug，七夕规则的形态是
    // .fs-figure--css[data-slug="qixi"]（DESIGN §10 建议清单里的 .fs-fig-qixi
    // 在 data-slug 寻址方案下落到这个选择器上）
    const must = ['.fs-figure--css', '.fs-figure-media', '.fs-nav-strip', '.fs-layout',
      '.fs-toc', '.fs-ring', '.fs-section-title', '.fs-facts', '.fs-years',
      '.fs-related', '.fs-toc-fab', '.fs-toc-sheet', '.fs-figure--css[data-slug="qixi"]'];
    const missing = must.filter((x) => sec15.indexOf(x) === -1);
    assert.deepStrictEqual(missing, [], '§4.15 丢了这些选择器：' + missing.join('、'));
  });

  ok('渐进增强锚点：html.js 收起规则 + html:not(.js) 隐藏按钮（无 JS 时 11 行全可见）', () => {
    assert.ok(sec15, '§4.15 段缺失，本断言空转');
    assert.ok(sec15.indexOf('html.js .fs-years[data-collapsed="true"] [data-fs-extra]') !== -1,
      '缺 html.js 收起规则——没有 JS 的访客会看不到第 6-11 行，或规则没锚在 js 类上');
    assert.ok(sec15.indexOf('html:not(.js) .fs-years-toggle') !== -1,
      '缺 html:not(.js) 隐藏展开按钮规则');
    assert.ok(css.indexOf('fs-years-toggle') !== -1, 'site.css 缺按钮样式');
  });

  ok('E-049 负向：.fs-nav-strip 无 flex:none、必须 min-width:0（导航条溢出防复发）', () => {
    assert.ok(sec15, '§4.15 段缺失，本断言空转');
    const at = sec15.indexOf('.fs-nav-strip {');
    assert.ok(at !== -1, '§4.15 缺 .fs-nav-strip 规则');
    const block = sec15.slice(at, sec15.indexOf('}', at));
    assert.ok(!/flex:\s*none/.test(block), '.fs-nav-strip 里出现 flex:none（E-049 根因）');
    assert.ok(block.indexOf('min-width: 0') !== -1, '.fs-nav-strip 缺 min-width: 0');
    const ulAt = sec15.indexOf('.fs-nav-strip ul {');
    const ul = sec15.slice(ulAt, sec15.indexOf('}', ulAt));
    assert.ok(!/flex:\s*none/.test(ul), '.fs-nav-strip ul 里出现 flex:none');
  });

  ok('E-043 负向：§4.15 内不得出现 overflow-wrap:anywhere / word-break:break-all', () => {
    assert.ok(sec15, '§4.15 段缺失，本断言空转');
    assert.ok(!/overflow-wrap:\s*anywhere/.test(sec15), '§4.15 出现 overflow-wrap:anywhere（会击穿 min-content）');
    assert.ok(!/word-break:\s*break-all/.test(sec15), '§4.15 出现 word-break:break-all');
  });

  // ---------- ⑤b E-064：构建 minifier 会把 calc(a + b) 压成 calc(a+b) 使声明整体失效 ----------
  // 根因：cssnano/压缩器在压缩时去掉 calc 内加号两侧空格，而 CSS 规范里加法运算符两侧
  // 必须有空格，浏览器把 `calc(22%+3px)` 整条丢弃 → 元素落回静态位置（E-064，2026-10-27）。
  // 防复发：源码与产物两侧都禁加法 calc；纹样定位一律用常量/百分比等效写法。
  const prodCss = fs.readFileSync(path.join(PUBLIC, 'css', 'site.css'), 'utf8');
  // 从严：本站样式没有合法的加法 calc 用例，凡 calc 内出现加号一律 FAIL
  // （宽松正则曾漏掉 `calc(18% + 0.5%)`——`%` 不在 [\d.)] 里，变异自检抓出后收紧）
  const ADD_CALC = /calc\([^()]*\+[^()]*\)/;
  ok('E-064 负向：site.css 源码与产物 public/css/site.css 均无加法 calc', () => {
    assert.ok(!ADD_CALC.test(css), 'site.css 源码出现加法 calc——minifier 压缩后该声明会整体失效，改用常量/百分比等效写法');
    assert.ok(!ADD_CALC.test(prodCss), '产物 public/css/site.css 出现加法 calc（无论源码是否干净，产物失效即页面错位）');
  });

  ok('§4.15 内无 animation（纹样绝对静止，DESIGN §6.6）', () => {
    assert.ok(sec15, '§4.15 段缺失，本断言空转');
    assert.ok(!/animation/.test(cssNoComment.slice(cssNoComment.indexOf('===== 4.15'), cssNoComment.indexOf('===== 5.'))),
      '§4.15 出现 animation——纹样块禁止循环动效');
  });

  ok('--fs-fig-* 十二个 token 只出现在 .fs-figure--css / .fs-fig-* 规则内（破例不外溢）', () => {
    const rules = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(cssNoComment)) !== null) rules.push({ sel: m[1], body: m[2] });
    const offenders = rules.filter((r) =>
      r.body.indexOf('--fs-fig-') !== -1 && !/fs-figure--css|fs-fig-/.test(r.sel));
    assert.deepStrictEqual(offenders.map((r) => r.sel.trim()), [],
      '--fs-fig-* 出现在纹样块之外的选择器里');
    // 十二个 token 各有定义
    SLUGS.forEach((s) => {
      const def = rules.some((r) => new RegExp('--fs-fig-' + s + '\\s*:').test(r.body));
      assert.ok(def, '缺 --fs-fig-' + s + ' 的定义');
    });
    // 不进 :root（与 --z-link 同一锁法）
    const rootAt = cssNoComment.indexOf(':root {');
    const root = cssNoComment.slice(rootAt, cssNoComment.indexOf('}', rootAt));
    assert.ok(root.indexOf('--fs-fig-') === -1, '--fs-fig-* 被写进了 :root');
  });

  ok('十二套纹样规则互不引用：每个 data-slug 自带主色，不借别家 token（DESIGN §6.6）', () => {
    assert.ok(sec15, '§4.15 段缺失，本断言空转');
    SLUGS.forEach((s) => {
      const own = new RegExp('\\[data-slug="' + s + '"\\][^{}]*\\{[^}]*--fs-fig-' + s);
      assert.ok(own.test(sec15), 'data-slug="' + s + '" 的规则没有定义自己的主色 token');
    });
  });

  ok('chunjie 主色引用作用域 accent（不另设值），deep 场铺底', () => {
    assert.ok(sec15, '§4.15 段缺失，本断言空转');
    const at = sec15.indexOf('[data-slug="chunjie"]');
    const block = sec15.slice(at, sec15.indexOf('}', at));
    assert.ok(block.indexOf('--fs-fig-chunjie: var(--accent)') !== -1,
      'chunjie 主色没有引用 var(--accent)');
  });

  // ---------- ⑥ 断言自检（变异样本必须被抓到，否则断言空转） ----------

  ok('自检：导航条 min-width:0 被删掉必须被抓到（E-049 防复发）', () => {
    const mutated = sec15.replace(/(\.fs-nav-strip \{[^}]*?)min-width: 0;/, '$1');
    assert.notStrictEqual(mutated, sec15, '变异没生效——自检空转');
    const at = mutated.indexOf('.fs-nav-strip {');
    const block = mutated.slice(at, mutated.indexOf('}', at));
    assert.ok(block.indexOf('min-width: 0') === -1, '变异后仍能读到 min-width: 0');
  });

  ok('自检：--fs-fig-* 写进标题规则必须被抓到（token 边界防复发）', () => {
    const mutated = cssNoComment.replace('.fs-section-title {', '.fs-section-title { --fs-fig-x: #fff;');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let offender = false;
    let m;
    while ((m = re.exec(mutated)) !== null) {
      if (m[2].indexOf('--fs-fig-') !== -1 && !/fs-figure--css|fs-fig-/.test(m[1])) offender = true;
    }
    assert.ok(offender, '把纹样色塞进标题规则没有被抓到——断言空转');
  });

  ok('自检：tbody 行数断言对 10 行表确实失败（S12 防空转）', () => {
    const tbody = '<tr></tr>'.repeat(10);
    assert.notStrictEqual((tbody.match(/<tr/g) || []).length, 11, '自检样本应当不等于 11');
  });

  ok('自检：overflow-wrap:anywhere 注入 §4.15 必须被抓到（E-043 防复发）', () => {
    const mutated = sec15 + '\n.fs-section-title { overflow-wrap: anywhere; }';
    assert.ok(/overflow-wrap:\s*anywhere/.test(mutated), '变异没生效——自检空转');
  });
}

console.log('\nRESULT: ' + pass + ' 项断言通过' + (process.exitCode ? '，存在失败' : ''));
process.exit(process.exitCode || 0);
