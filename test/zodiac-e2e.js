'use strict';
// 生肖页（/zodiac/、/zodiac/<动物>/）端到端验证。
// 2026-10-25 重构为「生肖主题页」后同步更新：
//   —— 标题只写生肖名、删性格板块、章节化内容、右栏目录 + 进度环 + 移动抽屉。
//
// 为什么要有这一套（与 holidays-e2e.js 同一理由）：
//   这一族页面由一个数据文件（zodiac.yml）+ 一个 helper 算出来，模板里没有一句
//   手写日期。「数据写错 / 算错」不会有任何报错——页面照常生成、样式照常漂亮，
//   只是某个年份算错了。所以这里锁三层：
//     ① 数据自洽：干支、起止、与节假日页春节日期一致、配对关系锚点；
//     ② 计算正确：引导段、日期解析的跨时区不变式；
//     ③ 产物落地：13 个页面真的存在且非 0 字节、目录/进度环/抽屉落地、
//        蓝色术语链落到节假日页、CSS 段完整。
//
// 运行：node test/zodiac-e2e.js
// 前置：npm run build（产物断言依赖 public/）。public/ 不存在时产物段 SKIP，
//       但 public/ 存在而页面缺失一律判 FAIL——那说明构建真的漏了这些页。

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const {
  buildAnimal, buildOverview, ganzhiOf, relationsOf, yearSpan,
  toKey, weekdayOf, spanDays, addDays, ANIMALS, ANIMAL_SLUG
} = require('../themes/fluid/scripts/helpers/zodiac-data.js');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, process.env.SITE_OUT || 'dist');

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

const raw = yaml.load(fs.readFileSync(path.join(ROOT, 'source', '_data', 'zodiac.yml'), 'utf8'));
const holidaysRaw = yaml.load(fs.readFileSync(path.join(ROOT, 'source', '_data', 'holidays.yml'), 'utf8'));
const ov = buildOverview(raw);

const PAGES = ['rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig'];

/* 拼音列是否保住了 table-cell。拼音列是 <td class="cal-pinyin">，而 .cal-pinyin 基线
   是 display:inline —— 一旦被 inline / block 覆盖，单元格就脱离表格布局（被包进匿名
   单元格），高度只剩文字行高，底边线比同行高约 2px、与左右接不上。返回 null 表示正常，
   否则返回出错的那段规则文本。真实 CSS 与变异样本共用这一个判据。 */
function pinyinCellRule(css) {
  const at = css.indexOf('td.cal-pinyin');
  if (at === -1) return 'site.css 里没有 td.cal-pinyin 规则';
  const block = css.slice(at, css.indexOf('}', at));
  return /display:\s*table-cell/.test(block) ? null : block.slice(0, 90);
}

console.log('生肖页数据与计算');

// ---------- ① 数据自洽 ----------

ok('十二个生肖，key 唯一，位次与地支一一对应', () => {
  assert.ok(ov, 'buildOverview 返回 null —— zodiac.yml 的 animals 缺失');
  assert.strictEqual(ov.rows.length, 12, '生肖不是 12 个');
  assert.strictEqual(new Set(ov.rows.map((r) => r.key)).size, 12, '有重复 key');
  ov.rows.forEach((r, i) => {
    assert.strictEqual(r.animal, ANIMALS[i], '第 ' + (i + 1) + ' 位不是 ' + ANIMALS[i]);
    assert.strictEqual(r.position, i + 1, r.animal + ' 的位次不是 ' + (i + 1));
    assert.strictEqual(ANIMAL_SLUG[r.animal], r.key, r.animal + ' 的 slug 与 ANIMAL_SLUG 不一致');
  });
});

ok('featured 年份正好覆盖 2021-2032，一个不重不漏', () => {
  const years = ov.rows.map((r) => r.featured).sort((a, b) => a - b);
  assert.deepStrictEqual(years,
    [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032],
    'featured 年份不是 2021-2032 连续十二年');
});

// 干支是整个页面族的地基：写错一个，引导段、年份表、称号全跟着错。
// 这里按传统规则逐条钉死（参考站公布值与本站一致）。
ok('十二个 featured 年份的干支 / 五行 / 阴阳全部正确', () => {
  const expect = {
    rat: [2032, '壬子', '水', '阳'], ox: [2021, '辛丑', '金', '阴'],
    tiger: [2022, '壬寅', '水', '阳'], rabbit: [2023, '癸卯', '水', '阴'],
    dragon: [2024, '甲辰', '木', '阳'], snake: [2025, '乙巳', '木', '阴'],
    horse: [2026, '丙午', '火', '阳'], goat: [2027, '丁未', '火', '阴'],
    monkey: [2028, '戊申', '土', '阳'], rooster: [2029, '己酉', '土', '阴'],
    dog: [2030, '庚戌', '金', '阳'], pig: [2031, '辛亥', '金', '阴']
  };
  Object.keys(expect).forEach((k) => {
    const [y, gz, el, yy] = expect[k];
    const a = buildAnimal(raw, k);
    assert.ok(a, k + ' 页数据缺失');
    assert.strictEqual(a.featured, y, k + ' 的 featured 不是 ' + y);
    assert.strictEqual(a.ganzhi, gz, k + ' 的干支不是 ' + gz + '（实际 ' + a.ganzhi + '）');
    assert.strictEqual(a.element, el, k + ' 的五行不是 ' + el);
    assert.strictEqual(a.yinyang, yy, k + ' 的阴阳不是 ' + yy);
    // 2026-10-25 起标题只写生肖名，不绑定具体年份（主人明确要求）
    assert.strictEqual(a.title, a.animal + '年', k + ' 的页标题不是纯生肖名：' + a.title);
  });
});

// 生肖年起止与节假日页的春节日期必须同源。两个模块各存一份日期，
// 没有任何机制保证它们一致——这条就是把机制补上。
ok('生肖年起止与 holidays.yml 的春节日期一致（跨模块一致性）', () => {
  const sf = raw.meta.springFestival;
  Object.keys(sf).forEach((y) => {
    const year = Number(y);
    if (year > 2033) return;
    const cj = holidaysRaw.years.find((v) => Number(v.year) === year);
    assert.ok(cj, 'holidays.yml 缺 ' + year + ' 年');
    const chunjie = (cj.holidays || []).find((h) => h.id === 'chunjie');
    assert.ok(chunjie, year + ' 年缺春节数据');
    assert.strictEqual(sf[y], toKey(chunjie.date),
      year + ' 年春节日期两处不一致：zodiac.yml=' + sf[y] + ' holidays.yml=' + toKey(chunjie.date));
  });
  // 反向：每个 featured 年都能算出起止
  ov.rows.forEach((r) => {
    const a = buildAnimal(raw, r.key);
    assert.ok(a.span, r.key + ' 算不出起止——springFestival 缺 ' + r.featured + ' 或 ' + (r.featured + 1));
  });
});

ok('八个代表年生肖年起止与官方春节一致', () => {
  const expect = {
    ox: ['2021-02-12', '2022-01-31'], tiger: ['2022-02-01', '2023-01-21'],
    rabbit: ['2023-01-22', '2024-02-09'], horse: ['2026-02-17', '2027-02-05'],
    goat: ['2027-02-06', '2028-01-25'], rat: ['2032-02-11', '2033-01-30'],
    dog: ['2030-02-03', '2031-01-22'], pig: ['2031-01-23', '2032-02-10']
  };
  const sf = raw.meta.springFestival;
  Object.keys(expect).forEach((k) => {
    const a = buildAnimal(raw, k);
    assert.strictEqual(a.span.start, expect[k][0], k + ' 年起止起点错');
    assert.strictEqual(a.span.end, expect[k][1], k + ' 年起止终点错');
    // 终点必须是「次年春节前一天」，不能差一天（E-048 同型：区间写错统计全对不上）
    assert.strictEqual(a.span.start, sf[String(a.featured)], k + ' 年起点不是春节当天');
    assert.strictEqual(addDays(a.span.end, 1), sf[String(a.featured + 1)],
      k + ' 年终点不是次年春节前一天');
  });
});

ok('同一生肖每 12 年一轮，且每个年份的干支都算对', () => {
  const a = buildAnimal(raw, 'horse');
  assert.strictEqual(a.occurrences.length, 11, '马年不是 11 个（1920-2060）');
  assert.strictEqual(a.occurrences[0].year, 1930, '马年列表不是从 1930 开始');
  assert.strictEqual(a.occurrences[a.occurrences.length - 1].year, 2050, '马年列表不是到 2050');
  assert.strictEqual(a.occurrences.filter((o) => o.current).length, 1, '当前年高亮行不是 1 行');
  a.occurrences.forEach((o) => {
    const g = ganzhiOf(o.year);
    assert.strictEqual(o.ganzhi, g.ganzhi, o.year + ' 干支错');
    assert.strictEqual(o.title, g.title, o.year + ' 称号错');
    assert.strictEqual(o.year % 12, a.featured % 12, o.year + ' 不是马年');
  });
  // 同干支六十年一轮
  assert.deepStrictEqual(a.sameGanzhi, [1966, 2026, 2086], '同干支年份错');
});

ok('配对关系锚点：鼠（猴龙三合 / 牛六合 / 冲马 / 害羊 / 刑兔）', () => {
  const rel = (k) => {
    const out = {};
    buildAnimal(raw, k).relations.forEach((r) => { out[r.name] = r.partners.join(''); });
    return out;
  };
  const rat = rel('rat');
  assert.strictEqual(rat['三合'], '猴龙', '鼠的三合不是猴、龙');
  assert.strictEqual(rat['六合'], '牛', '鼠的六合不是牛');
  assert.strictEqual(rat['六冲'], '马', '鼠的六冲不是马');
  assert.strictEqual(rat['六害'], '羊', '鼠的六害不是羊');
  assert.strictEqual(rat['相刑'], '兔', '鼠的相刑不是兔');
  const horse = rel('horse');
  assert.strictEqual(horse['三合'], '虎狗', '马的三合不是虎、狗');
  assert.strictEqual(horse['六合'], '羊', '马的六合不是羊');
  assert.strictEqual(horse['六冲'], '鼠', '马的六冲不是鼠');
  const pig = rel('pig');
  assert.strictEqual(pig['三合'], '兔羊', '猪的三合不是兔、羊');
  assert.strictEqual(pig['六冲'], '蛇', '猪的六冲不是蛇');
  // 六合十二对全表（子丑、寅亥、卯戌、辰酉、巳申、午未）——曾经索引写错让马年六合算出「鸡」
  const liuhe = { rat: '牛', ox: '鼠', tiger: '猪', rabbit: '狗', dragon: '鸡', snake: '猴', horse: '羊', goat: '马', monkey: '蛇', rooster: '龙', dog: '兔', pig: '虎' };
  Object.keys(liuhe).forEach((k) => {
    assert.strictEqual(rel(k)['六合'], liuhe[k], k + ' 的六合不是 ' + liuhe[k]);
  });
});

// 2026-10-25 重构后的章节结构：每个生肖 8-9 节，
// 「传统配对」「吉祥象征」由 helper 注入（计算产物不进数据文件）。
// 2026-10-25 重构后的章节结构：数据 8-9 节 + helper 注入 2 节
// （「传统配对」插在寓意后、「吉祥象征」插在传说/名人后）= 10-11 节。
ok('章节结构完整：10-11 节，配对与吉祥节由 helper 注入', () => {
  ov.rows.forEach((r) => {
    const a = buildAnimal(raw, r.key);
    const ids = a.sections.map((s) => s.id);
    assert.ok(ids.length >= 10 && ids.length <= 11, r.key + ' 的章节数是 ' + ids.length);
    ['what', 'word', 'language', 'meaning', 'relations', 'luck', 'vocab', 'faq', 'end'].forEach((id) => {
      assert.ok(ids.indexOf(id) !== -1, r.key + ' 缺章节 ' + id);
    });
    // 目录顺序 = 章节顺序（模板与 JS 都按它渲染）
    a.sections.forEach((s) => { assert.ok(s.title, r.key + ' 有章节缺标题'); });
    // 名人节只出现在有数据的五个生肖
    const hasFamous = ids.indexOf('famous') !== -1;
    const sourced = ['tiger', 'rabbit', 'dragon', 'snake', 'goat'].indexOf(r.key) !== -1;
    assert.strictEqual(hasFamous, sourced, r.key + ' 的名人节与数据不符');
  });
});

// 主人 2026-10-25 明确删除的板块：性格优缺点。防复发——数据里不得再出现。
ok('性格板块已删除（主人明确要求，防复发）', () => {
  ov.rows.forEach((r) => {
    const src = raw.animals.find((a) => a.key === r.key);
    assert.ok(!src.pros && !src.cons && !src.theme, r.key + ' 又出现了性格数据');
    const a = buildAnimal(raw, r.key);
    assert.ok(a.pros === undefined && a.cons === undefined, r.key + ' 的 helper 输出又带了性格字段');
  });
});

ok('词汇表每行四项齐全', () => {
  ov.rows.forEach((r) => {
    const a = buildAnimal(raw, r.key);
    assert.ok(a.vocab.length >= 10, r.key + ' 的词汇少于 10 行');
    a.vocab.forEach((v) => {
      assert.ok(v.t && v.p && v.m, r.key + ' 有词汇行缺字段：' + JSON.stringify(v));
    });
  });
});

// ---------- ① 配图授权（复刻节假日页三层锁：数据三要素 → 文件是真的 → 产物带出） ----------

const IMG_DIR = path.join(ROOT, 'source/img/zodiac');
const META_IMAGES = (raw.meta && raw.meta.images) || {};

ok('十二张配图授权三要素齐全（CC 授权的使用条件）', () => {
  PAGES.forEach((k) => {
    const m = META_IMAGES[k];
    assert.ok(m, 'meta.images 缺少 ' + k);
    assert.match(m.file, /^\/img\/zodiac\/[a-z]+\.jpg$/, k + ' 的 file 路径不对：' + m.file);
    assert.ok((m.alt || '').length >= 4, k + ' 缺 alt 文字');
    assert.ok((m.author || '').length >= 2, k + ' 缺作者署名');
    assert.match(m.license || '', /^(CC0|CC BY|CC BY-SA|公有领域|Public domain)/, k + ' 的授权写错了：' + m.license);
    assert.match(m.page || '', /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, k + ' 的原文件页不是 Commons 链接');
  });
  // 反查：数据里的每个键都必须是十二生肖之一，不能出现挂在没人用的键上的图
  Object.keys(META_IMAGES).forEach((k) => {
    assert.ok(PAGES.indexOf(k) !== -1, 'meta.images 里有不该有的键：' + k);
  });
});

ok('配图文件存在、确实是 JPEG、体积足够', () => {
  PAGES.forEach((k) => {
    const f = path.join(IMG_DIR, k + '.jpg');
    assert.ok(fs.existsSync(f), '缺少配图文件：source/img/zodiac/' + k + '.jpg');
    const buf = fs.readFileSync(f);
    // JPEG magic：FF D8
    assert.strictEqual(buf[0], 0xFF, k + '.jpg 不是 JPEG（首字节不是 FF）');
    assert.strictEqual(buf[1], 0xD8, k + '.jpg 不是 JPEG（第二字节不是 D8）');
    assert.ok(buf.length > 50 * 1024, k + '.jpg 只有 ' + buf.length + ' 字节，像是下载被截断');
  });
});

// E-042 同型：中文长文案里出现「汉字-空格-汉字」就是折行标量插进了空格。
// 页面文案一律单行书写，这条把纪律变成断言。
ok('页面文案没有折叠标量插进来的空格（E-042 防复发）', () => {
  const cjkSpaceCjk = /[\u4e00-\u9fff] [\u4e00-\u9fff]/;
  ov.rows.forEach((r) => {
    const a = buildAnimal(raw, r.key);
    a.sections.forEach((s) => {
      assert.ok(!cjkSpaceCjk.test(s.body), r.key + '/' + s.id + ' 的正文里出现「汉字 空格 汉字」');
    });
    a.faq.forEach((f) => {
      assert.ok(!cjkSpaceCjk.test(f.q), r.key + ' 的问题里有可疑空格');
      assert.ok(!cjkSpaceCjk.test(f.a), r.key + ' 的回答里有可疑空格');
    });
    assert.ok(!cjkSpaceCjk.test(a.lede), r.key + ' 的引导段里有可疑空格');
  });
  assert.ok(!cjkSpaceCjk.test(ov.prose), '索引页正文里有可疑空格');
  assert.ok(!cjkSpaceCjk.test(ov.lede), '索引页引导段里有可疑空格');
});

// ---------- ② 计算正确 ----------

ok('引导段由数据算出：日期、同干支年都在句子里', () => {
  const a = buildAnimal(raw, 'horse');
  assert.ok(a.lede.indexOf('2026 年是干支丙午、五行属火的马年') !== -1, '引导段缺干支与五行');
  assert.ok(a.lede.indexOf('2026 年 2 月 17 日（周二）') !== -1, '引导段缺起始日期（或星期算错）');
  assert.ok(a.lede.indexOf('2027 年 2 月 5 日结束') !== -1, '引导段缺结束日期');
  assert.ok(a.lede.indexOf('1966 年') !== -1 && a.lede.indexOf('2086 年') !== -1, '引导段缺同干支年');
  // 2026-02-17 确实是周二（与节假日页同一判据）
  assert.strictEqual(weekdayOf('2026-02-17'), 2, '2026-02-17 不是周二');
});

ok('toKey 对 Date 与字符串输入得到同一结果（跨时区不变式）', () => {
  const d = new Date(Date.UTC(2026, 1, 17));
  assert.strictEqual(toKey(d), '2026-02-17', 'Date 输入解析错');
  assert.strictEqual(toKey('2026-02-17'), '2026-02-17', '字符串输入解析错');
  assert.strictEqual(toKey('2026-2-7'), '2026-02-07', '单位数月日没补零');
  assert.strictEqual(toKey(''), null, '空值应返回 null');
  assert.strictEqual(toKey('下周'), null, '非法值应返回 null');
});

ok('基本信息表六行齐全，起止行是纯日期 <time>（E-028）', () => {
  const a = buildAnimal(raw, 'horse');
  assert.strictEqual(a.facts.length, 6, '基本信息不是 6 行');
  const spanRow = a.facts.find((f) => f.k === '生肖年起止');
  assert.ok(/<time datetime="2026-02-17">2026-02-17<\/time> → <time datetime="2027-02-05">2027-02-05<\/time>/.test(spanRow.v),
    '起止行的 <time> 格式不对：' + spanRow.v);
  const gz = a.facts.find((f) => f.k === '干支');
  assert.strictEqual(gz.v, '丙午（bǐng wǔ）', '干支行不带拼音或值不对');
});

ok('无数据不渲染：幸运行为空的页面只留五行对应与说明', () => {
  const ox = buildAnimal(raw, 'ox');
  assert.strictEqual(ox.luck.length, 1, '牛年没有民间幸运数据，应只剩五行传统对应一行');
  assert.strictEqual(ox.luck[0].k, '五行传统对应');
  const horse = buildAnimal(raw, 'horse');
  assert.ok(horse.luck.length >= 5, '马年的幸运数据行过少');
});

// ---------- ③ 产物落地 ----------

if (!fs.existsSync(PUBLIC)) {
  console.log('  - SKIP 产物断言（没有 public/，先跑 npm run build）');
} else {
  ok('布局模板能独立编译（E-045：编译失败时 Hexo 会静默产出残页）', () => {
    const ejs = require('ejs');
    ['zodiac.ejs', 'library.ejs'].forEach((f) => {
      const src = fs.readFileSync(path.join(ROOT, 'themes/fluid/layout', f), 'utf8');
      let err = null;
      try { ejs.compile(src, { filename: f }); } catch (e) { err = e; }
      assert.strictEqual(err, null, f + ' 编译失败：' + (err && err.message.split('\n')[0]));
    });
  });

  ok('索引页与十二个生肖页全部生成且非 0 字节（E-029 / E-038）', () => {
    const idx = path.join(PUBLIC, 'zodiac', 'index.html');
    assert.ok(fs.existsSync(idx), 'public/zodiac/index.html 不存在 —— 构建漏了索引页');
    assert.ok(fs.statSync(idx).size > 15000, '索引页只有 ' + fs.statSync(idx).size + ' 字节');
    PAGES.forEach((k) => {
      const abs = path.join(PUBLIC, 'zodiac', k, 'index.html');
      assert.ok(fs.existsSync(abs), '缺页面：zodiac/' + k + '/index.html');
      const size = fs.statSync(abs).size;
      assert.ok(size > 15000, 'zodiac/' + k + '/ 只有 ' + size + ' 字节，像是渲染中断');
    });
  });

  ok('生肖页关键内容齐全：生肖名标题、章节、目录、进度环、抽屉、上下页', () => {
    PAGES.forEach((k) => {
      const h = fs.readFileSync(path.join(PUBLIC, 'zodiac', k, 'index.html'), 'utf8');
      const a = buildAnimal(raw, k);
      // 标题只写生肖名（不绑定年份）
      assert.ok(h.indexOf('>' + a.title + '</h1>') !== -1, k + ' 页标题不是「' + a.title + '」');
      assert.ok(h.indexOf(a.ganzhi) !== -1, k + ' 页缺干支');
      assert.ok(h.indexOf(a.span.start) !== -1 && h.indexOf(a.span.end) !== -1, k + ' 页缺起止日期');
      // 章节：数量与数据一致，锚点齐全
      const secCount = (h.match(/<section class="z-section" id="sec-/g) || []).length;
      assert.strictEqual(secCount, a.sections.length, k + ' 页章节数（' + secCount + '）与数据（' + a.sections.length + '）不符');
      a.sections.forEach((s) => {
        assert.ok(h.indexOf('id="sec-' + s.id + '"') !== -1, k + ' 页缺章节锚点 sec-' + s.id);
        assert.ok(h.indexOf('href="#sec-' + s.id + '"') !== -1, k + ' 页目录缺 ' + s.title);
      });
      // 目录 / 进度环 / 收起按钮 / 移动抽屉 / FAB
      assert.ok(h.indexOf('z-toc-list') !== -1, k + ' 页缺目录列表');
      assert.ok(h.indexOf('zProgressRing') !== -1, k + ' 页缺进度环');
      assert.ok(h.indexOf('z-toc-toggle') !== -1, k + ' 页缺目录收起按钮');
      assert.ok(h.indexOf('z-toc-fab') !== -1 && h.indexOf('z-toc-sheet') !== -1, k + ' 页缺移动端目录抽屉');
      assert.ok(h.indexOf('已读 0%') !== -1, k + ' 页缺进度初始文案');
      // 生肖导航条（全宽横排）+ 当前项 + 上下页
      assert.ok(h.indexOf('z-nav-strip') !== -1, k + ' 页缺生肖导航条');
      assert.ok(h.indexOf('z-nav-current') !== -1, k + ' 页没标当前生肖');
      assert.ok(h.indexOf('href="/zodiac/' + a.prev.key + '/"') !== -1, k + ' 页缺上一生肖链接');
      assert.ok(h.indexOf('href="/zodiac/' + a.next.key + '/"') !== -1, k + ' 页缺下一生肖链接');
      // 词汇表：每个词都在页面上
      a.vocab.slice(0, 5).forEach((v) => {
        assert.ok(h.indexOf(v.t) !== -1, k + ' 页缺词汇 ' + v.t);
      });
      // 引导段由 helper 算出，整句落在页面上
      assert.ok(h.indexOf(a.lede.slice(0, 30)) !== -1, k + ' 页缺引导段');
      // 交互脚本
      assert.ok(/zodiac\.js\?v=/.test(h), k + ' 页没引 zodiac.js（或没带版本号）');
    });
  });

  ok('蓝色术语链：鼠年页链到猪年，节假日页链到生肖页', () => {
    const rat = fs.readFileSync(path.join(PUBLIC, 'zodiac', 'rat', 'index.html'), 'utf8');
    assert.ok(rat.indexOf('class="z-link" href="/zodiac/pig/"') !== -1, '鼠年页缺到猪年的蓝色术语链');
    // 节假日页：2026 链到马年（十六个年份全量断言见下一节）
    const hol = fs.readFileSync(path.join(PUBLIC, 'holidays', '2026', 'index.html'), 'utf8');
    assert.ok(hol.indexOf('class="z-link" href="/zodiac/horse/"') !== -1, '节假日 2026 页缺到马年的蓝色术语链');
  });

  ok('配图落到页面上，署名与授权齐全（产物层，授权条件）', () => {
    PAGES.forEach((k) => {
      const h = fs.readFileSync(path.join(PUBLIC, 'zodiac', k, 'index.html'), 'utf8');
      const img = META_IMAGES[k];
      // 注意 src 会带内容 hash 查询串（asset-version 扩展到 img），只比前缀
      assert.ok(h.indexOf('src="' + img.file) !== -1, k + ' 页没渲染配图');
      assert.ok(h.indexOf(img.alt) !== -1, k + ' 页缺配图 alt');
      assert.ok(h.indexOf(img.author) !== -1, k + ' 页缺配图署名');
      assert.ok(h.indexOf(img.license) !== -1, k + ' 页缺授权声明');
      assert.ok(h.indexOf(img.page) !== -1, k + ' 页缺原文件页链接');
    });
  });

  ok('索引页：生肖卡 12 张 + 出生年份表 + 五行表 + 三合相冲表', () => {
    const h = fs.readFileSync(path.join(PUBLIC, 'zodiac', 'index.html'), 'utf8');
    // 2026-11-06（PLAN-V3 §7 P6）：七列「一览表」换成 12 张生肖卡。
    // 生肖名链因此只剩出生年份表的 12 个，卡片单独计数。
    const cardCount = (h.match(/class="z-card"/g) || []).length;
    assert.strictEqual(cardCount, 12, '索引页生肖卡不是 12 张');
    const animalCells = (h.match(/z-animal-link/g) || []).length;
    assert.strictEqual(animalCells, 12, '索引页生肖名链不是 12 个（出生年份表）');
    assert.ok(h.indexOf('1948 · 1960 · 1972 · 1984 · 1996 · 2008 · 2020 · 2032') !== -1,
      '索引页缺鼠年出生年份行');
    assert.ok(h.indexOf('1959 · 1971 · 1983 · 1995 · 2007 · 2019 · 2031 · 2043') !== -1,
      '索引页缺猪年出生年份行');
    assert.ok(h.indexOf('甲 · 乙') !== -1 && h.indexOf('壬 · 癸') !== -1, '索引页缺五行表');
    assert.ok(h.indexOf('三者合成水局') !== -1, '索引页缺三合表');
    assert.ok(h.indexOf('六冲，正对相对') !== -1, '索引页缺相冲表');
    assert.ok(h.indexOf('GB/T 33661-2017') !== -1, '索引页缺国标说明');
  });

  ok('节假日页十六个年份都带蓝色生肖术语链，指向对应生肖页', () => {
    // 节假日页覆盖 2021-2036，生肖页覆盖 2021-2032；2033-2036 的术语链指向
    // 同一动物的生肖页（该页的年份表里有这些年份），所以按动物映射而不是按年份。
    holidaysRaw.years.forEach((y) => {
      const yr = Number(y.year);
      const abs = path.join(PUBLIC, 'holidays', String(yr), 'index.html');
      assert.ok(fs.existsSync(abs), '缺节假日页：holidays/' + yr + '/');
      const h = fs.readFileSync(abs, 'utf8');
      const animal = y.zodiac && y.zodiac.animal;
      assert.ok(animal, 'holidays.yml ' + yr + ' 年缺 zodiac.animal');
      const slug = ANIMAL_SLUG[animal];
      assert.ok(slug, yr + ' 年的生肖「' + animal + '」没有对应生肖页');
      assert.ok(h.indexOf('href="/zodiac/' + slug + '/"') !== -1,
        'holidays/' + yr + '/ 的引导段没链到 /zodiac/' + slug + '/');
      assert.ok(h.indexOf('class="z-link"') !== -1, 'holidays/' + yr + '/ 的术语链没有 z-link 类');
    });
  });

  ok('术语链 token 存在且与全站强调色同值（V6.5 后强调色即陶土深调，不再是稀缺例外色）', () => {
    const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
    const at = css.indexOf('.cal-page {');
    const scoped = css.slice(at, css.indexOf('}', at));
    assert.ok(scoped.indexOf('--z-link: #a8482c') !== -1, '.cal-page 里没有定义 --z-link: #a8482c');
    assert.ok(css.indexOf('.cal-page a.z-link {') !== -1, '缺 .z-link 规则');
  });

  ok('§4.13 生肖样式段完整（E-052 同型：整份覆盖写最容易丢的就是新段）', () => {
    const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
    const must = [
      '.z-nav-strip', '.z-nav-current', '.z-figure', '.z-layout', '.z-section-title',
      '.z-toc {', '.z-toc-list', '.z-toc-toggle', '.z-ring-fill', '.z-toc-progress-text',
      '.z-toc-fab', '.z-toc-sheet', '.z-toc-overlay', '.z-facts', '.z-luck', '.z-vocab',
      '.z-relations', '.z-pager', '.z-pos', '.z-animal-link', '.cal-page a.z-link {',
      '.lb-layout', '.lb-guide', '.lb-entries', '.lb-topic-more',
    ];
    const missing = must.filter((s) => css.indexOf(s) === -1);
    assert.deepStrictEqual(missing, [], 'site.css 丢了这些样式：' + missing.join('、'));
  });

  ok('拼音列保持 table-cell（整行底边线才接得上，主人 2026-10-26 指出）', () => {
    const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
    const err = pinyinCellRule(css);
    assert.strictEqual(err, null, '拼音列掉出表格布局：' + err);
    // ② 窄屏隐藏拼音只能限定 span；整列 display:none 会让数据行比表头少一格
    assert.ok(css.indexOf('.cal-table span.cal-pinyin { display: none; }') !== -1, '窄屏隐藏规则没限定 span');
    assert.ok(css.indexOf('.cal-table .cal-pinyin { display: none; }') === -1, '窄屏还在整列隐藏拼音（数据行会少一格）');
  });

  ok('表格列数：表头与每个数据行格数一致（拼音列不能被藏掉）', () => {
    // 2026-11-06：索引页的 z-animals 七列表已换成生肖卡（卡数由上面那条断言守着），
    // 这里只剩详情页的 z-vocab 表需要核对列数。
    const tables = [['horse', 'z-vocab']];
    tables.forEach(([page, cls]) => {
      const file = page === 'index'
        ? path.join(PUBLIC, 'zodiac', 'index.html')
        : path.join(PUBLIC, 'zodiac', page, 'index.html');
      const h = fs.readFileSync(file, 'utf8');
      const start = h.indexOf(cls);
      assert.ok(start !== -1, page + ' 页没有 ' + cls + ' 表');
      const t = h.slice(start, h.indexOf('</table>', start));
      const headN = (t.match(/<th scope="col">/g) || []).length;
      assert.ok(headN >= 4, cls + ' 表头列数异常：' + headN);
      const rows = t.split('<tr>').slice(1);
      assert.ok(rows.length >= 12, cls + ' 数据行过少：' + rows.length);
      rows.forEach((r, i) => {
        const n = (r.match(/<t[hd][ >]/g) || []).length;
        assert.strictEqual(n, headN, cls + ' 第 ' + (i + 1) + ' 行格数 ' + n + ' ≠ 表头 ' + headN);
      });
    });
  });

  ok('资料库页生成：专题卡片墙（卡片数 = 专题数，计数按数据现算）', () => {
    const idx = path.join(PUBLIC, 'library', 'index.html');
    assert.ok(fs.existsSync(idx), 'public/library/index.html 不存在 —— 构建漏了资料库页');
    assert.ok(fs.statSync(idx).size > 5000, '资料库页内容过少');
    const h = fs.readFileSync(idx, 'utf8');
    assert.ok(h.indexOf('资料库') !== -1, '缺标题');

    // 2026-11-04（PLAN-V3 §5）：本页从「平铺全部条目」改为「专题卡片墙」，
    // 旧断言数的是 lb-entry 行数，改版后必然假红，这里改成数卡片。
    const libData = yaml.load(fs.readFileSync(path.join(ROOT, 'source/_data/library.yml'), 'utf8'));
    const topics = (libData && libData.topics) || [];
    assert.ok(topics.length >= 5, 'library.yml 专题数少于 5（生肖/节假日/节日文化/城市榜/城市档案）');

    const cards = (h.match(/class="lb-card"/g) || []).length;
    assert.strictEqual(cards, topics.length,
      '卡片数不对（页面 ' + cards + '，library.yml ' + topics.length + '）—— 新增专题时这里会自动纳入');

    // 每张卡必须链到自己的专题页，并渲染标题
    for (const t of topics) {
      const link = t.link || '/library/';
      assert.ok(h.indexOf('href="' + link + '"') !== -1, '缺专题卡链接：' + t.key + ' → ' + link);
      assert.ok(h.indexOf(t.title) !== -1, '缺专题卡标题：' + t.title);
    }

    // 导读栏与条目列表已随改版撤除，重新出现说明改回去了
    assert.ok(h.indexOf('lb-guide') === -1, '导读栏已撤，页面不应再出现 lb-guide');
    assert.ok(h.indexOf('lb-entry') === -1, '条目列表已撤，页面不应再出现 lb-entry');

    // 计数必须来自数据（写死过两次：2026-10-27 两次加专题都是 14→26→28，E-020/E-021）
    const zodiacCount = ((yaml.load(fs.readFileSync(path.join(ROOT, 'source/_data/zodiac.yml'), 'utf8')) || {}).animals || []).length;
    const cityCount = ((yaml.load(fs.readFileSync(path.join(ROOT, 'source/_data/cities.yml'), 'utf8')) || {}).cities || []).length;
    assert.ok(h.indexOf('lb-card-count">' + zodiacCount + ' <span class="lb-card-unit">个生肖') !== -1,
      '生肖卡计数与 zodiac.yml 不一致');
    assert.ok(h.indexOf('lb-card-count">' + cityCount + ' <span class="lb-card-unit">座城市') !== -1,
      '城市卡计数与 cities.yml 不一致');
  });

  ok('导航与页面互链存在（辅助导航含节假日 / 资料库入口）', () => {
    const index = path.join(PUBLIC, 'index.html');
    assert.ok(fs.existsSync(index), 'dist/index.html 不存在（先跑 npm run astro:build）');
    const home = fs.readFileSync(index, 'utf8');
    // 2026-10-25 起生肖入口改走资料库（/library/），导航里不再直接暴露 /zodiac/
    assert.ok(home.indexOf('href="/library/"') !== -1, '首页导航里没有 /library/ 入口');
    assert.ok(home.indexOf('href="/holidays/"') !== -1, '首页导航里没有 /holidays/ 入口');
    assert.ok(home.indexOf('site-nav-aux') !== -1, '首页缺辅助导航组');
  });

  ok('日期渲染为纯日期，没有机器串（E-028）', () => {
    PAGES.forEach((k) => {
      const h = fs.readFileSync(path.join(PUBLIC, 'zodiac', k, 'index.html'), 'utf8');
      assert.ok(h.indexOf('GMT') === -1, k + ' 页出现 GMT 字样');
      const bad = [];
      const re = /<time datetime="([^"]*)">([^<]*)<\/time>/g;
      let m;
      while ((m = re.exec(h)) !== null) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(m[1])) bad.push('datetime 非纯日期：' + m[1]);
        if (/\d{1,2}:\d{2}/.test(m[2])) bad.push('可见文本带时间：' + m[2]);
      }
      assert.ok(h.indexOf('<time datetime=') !== -1, k + ' 页没有 <time>，断言会空转');
      assert.deepStrictEqual(bad, [], bad.join(' / '));
    });
  });
}

// ---------- ④ 断言自检（变异样本必须被抓到，否则断言空转） ----------

ok('自检：把 featured 年份改错必须被抓到', () => {
  const bad = JSON.parse(JSON.stringify(raw));
  bad.animals.find((a) => a.key === 'horse').featured = 2027;
  const a = buildAnimal(bad, 'horse');
  assert.notStrictEqual(a.ganzhi, '丙午', '干支没跟着年份变——断言会空转');
});

ok('自检：删掉春节日期必须让起止算不出来', () => {
  const bad = JSON.parse(JSON.stringify(raw));
  delete bad.meta.springFestival['2027'];
  const a = buildAnimal(bad, 'horse');
  assert.strictEqual(a.span, null, '删了次年春节还能算出起止——断言会空转');
});

ok('自检：两个 helper 的 ANIMAL_SLUG 必须一致（跨文件无 require，靠这条锁）', () => {
  const cal = fs.readFileSync(path.join(ROOT, 'themes/fluid/scripts/helpers/holiday-calendar.js'), 'utf8');
  Object.keys(ANIMAL_SLUG).forEach((animal) => {
    assert.ok(cal.indexOf(animal + ": '" + ANIMAL_SLUG[animal] + "'") !== -1,
      'holiday-calendar.js 缺 ' + animal + ' → ' + ANIMAL_SLUG[animal] + ' 的映射');
  });
});

ok('自检：模板编译断言对语法错误确实会失败（E-045 防复发）', () => {
  const ejs = require('ejs');
  const broken = '<% if (x) { %><p>unclosed</p>';
  let err = null;
  try { ejs.compile(broken, { filename: 'x.ejs' }); } catch (e) { err = e; }
  assert.ok(err, '自检样本应当编译失败，否则断言空转');
});

ok('自检：作用域断言的取样逻辑有效（E-031 同型防空转）', () => {
  const broken = '.cal-page {\n  background: transparent;\n  --accent: #c4463a;\n}';
  const at = broken.indexOf('.cal-page {');
  const scoped = broken.slice(at, broken.indexOf('}', at));
  assert.ok(scoped.indexOf('--accent: #a8482c') === -1, '变异样本应当不命中 V6.5 陶土深调，否则断言空转');
});

ok('自检：拼音列写成 block / inline 必须被抓到（底边线错位防复发）', () => {
  const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
  const mutated = css.replace(/(td\.cal-pinyin[\s\S]*?display: )table-cell/, '$1block');
  assert.notStrictEqual(mutated, css, '变异没生效——自检空转');
  assert.ok(pinyinCellRule(mutated), '拼音列写成 block 没被抓到');
  assert.ok(pinyinCellRule('.cal-pinyin { display: inline; }'), '拼音列写成 inline 没被抓到');
});

console.log('\nRESULT: ' + pass + ' 项断言通过' + (process.exitCode ? '，存在失败' : ''));
process.exit(process.exitCode || 0);
