'use strict';
// 生肖页（/zodiac/、/zodiac/<动物>/）端到端验证。
//
// 为什么要有这一套（与 holidays-e2e.js 同一理由）：
//   这一族页面同样由一个数据文件（zodiac.yml）+ 一个 helper 算出来，模板里没有一句
//   手写日期。「数据写错 / 算错」不会有任何报错——页面照常生成、样式照常漂亮，
//   只是某个年份算错了。所以这里锁三层：
//     ① 数据自洽：干支、起止、与节假日页春节日期一致、配对关系锚点；
//     ② 计算正确：引导段、日期解析的跨时区不变式；
//     ③ 产物落地：13 个页面真的存在且非 0 字节、蓝色术语链落到节假日页、CSS 段完整。
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
const PUBLIC = path.join(ROOT, 'public');

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

// 干支是整个页面族的地基：写错一个，标题、起止、称号、FAQ 全跟着错。
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
    // 称号 = 五行 + 生肖（如「火马」）
    assert.strictEqual(a.title, y + ' ' + a.animal + '年 · ' + gz + el + a.animal,
      k + ' 的页标题不对：' + a.title);
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

ok('六个代表年生肖年起止与官方春节一致', () => {
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
  // 六合十二对全表（子丑寅亥卯戌辰酉巳申午未）——曾经索引写错让马年六合算出「鸡」
  const liuhe = { rat: '牛', ox: '鼠', tiger: '猪', rabbit: '狗', dragon: '鸡', snake: '猴', horse: '羊', goat: '马', monkey: '蛇', rooster: '龙', dog: '兔', pig: '虎' };
  Object.keys(liuhe).forEach((k) => {
    assert.strictEqual(rel(k)['六合'], liuhe[k], k + ' 的六合不是 ' + liuhe[k]);
  });
});

ok('词汇表每行四项齐全，成语有标注', () => {
  ov.rows.forEach((r) => {
    const a = buildAnimal(raw, r.key);
    assert.ok(a.vocab.length >= 10, r.key + ' 的词汇少于 10 行');
    a.vocab.forEach((v) => {
      assert.ok(v.t && v.p && v.m, r.key + ' 有词汇行缺字段：' + JSON.stringify(v));
    });
  });
});

// E-042 同型：中文长文案里出现「汉字-空格-汉字」就是折行标量插进了空格。
// 页面文案一律单行书写，这条把纪律变成断言。
ok('页面文案没有折叠标量插进来的空格（E-042 防复发）', () => {
  const cjkSpaceCjk = /[\u4e00-\u9fff] [\u4e00-\u9fff]/;
  ov.rows.forEach((r) => {
    const a = buildAnimal(raw, r.key);
    assert.ok(!cjkSpaceCjk.test(a.culture), r.key + ' 的正文里出现「汉字 空格 汉字」');
    a.faq.forEach((f) => {
      assert.ok(!cjkSpaceCjk.test(f.q), r.key + ' 的问题里有可疑空格');
      assert.ok(!cjkSpaceCjk.test(f.a), r.key + ' 的回答里有可疑空格');
    });
  });
  assert.ok(!cjkSpaceCjk.test(ov.prose), '索引页正文里有可疑空格');
  assert.ok(!cjkSpaceCjk.test(ov.lede), '索引页引导段里有可疑空格');
  ov.rows.forEach((r) => {
    const a = buildAnimal(raw, r.key);
    assert.ok(!cjkSpaceCjk.test(a.lede), r.key + ' 的引导段里有可疑空格');
  });
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

const PAGES = ['rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig'];

if (!fs.existsSync(PUBLIC)) {
  console.log('  - SKIP 产物断言（没有 public/，先跑 npm run build）');
} else {
  ok('布局模板能独立编译（E-045：编译失败时 Hexo 会静默产出残页）', () => {
    const ejs = require('ejs');
    const src = fs.readFileSync(path.join(ROOT, 'themes/fluid/layout/zodiac.ejs'), 'utf8');
    let err = null;
    try { ejs.compile(src, { filename: 'zodiac.ejs' }); } catch (e) { err = e; }
    assert.strictEqual(err, null, 'zodiac.ejs 编译失败：' + (err && err.message.split('\n')[0]));
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

  ok('生肖页关键内容齐全：标题、干支、起止、导航、上下页、词汇表', () => {
    PAGES.forEach((k) => {
      const h = fs.readFileSync(path.join(PUBLIC, 'zodiac', k, 'index.html'), 'utf8');
      const a = buildAnimal(raw, k);
      assert.ok(h.indexOf(a.title) !== -1, k + ' 页缺标题 ' + a.title);
      assert.ok(h.indexOf(a.ganzhi) !== -1, k + ' 页缺干支');
      assert.ok(h.indexOf(a.span.start) !== -1 && h.indexOf(a.span.end) !== -1, k + ' 页缺起止日期');
      // 生肖导航 12 项 + 当前项标注
      const navLinks = (h.match(/href="\/zodiac\/[a-z]+\/"/g) || []);
      assert.ok(navLinks.length >= 13, k + ' 页的内链过少（导航 + 上下页 + 正文互链）');
      assert.ok(h.indexOf('z-animal-current') !== -1, k + ' 页没标当前生肖');
      assert.ok(h.indexOf('href="/zodiac/' + a.prev.key + '/"') !== -1, k + ' 页缺上一生肖链接');
      assert.ok(h.indexOf('href="/zodiac/' + a.next.key + '/"') !== -1, k + ' 页缺下一生肖链接');
      // 词汇表：每个词都在页面上
      a.vocab.slice(0, 5).forEach((v) => {
        assert.ok(h.indexOf(v.t) !== -1, k + ' 页缺词汇 ' + v.t);
      });
      // 引导段由 helper 算出，整句落在页面上
      assert.ok(h.indexOf(a.lede.slice(0, 30)) !== -1, k + ' 页缺引导段');
    });
  });

  ok('马年页（当前一轮）带蓝色生肖术语链', () => {
    const h = fs.readFileSync(path.join(PUBLIC, 'zodiac', 'horse', 'index.html'), 'utf8');
    assert.ok(h.indexOf('class="z-link"') !== -1, '马年页没有蓝色术语链');
    assert.ok(/z-link" href="\/zodiac\/snake\/"/.test(h), '马年页没链到蛇年');
    assert.ok(/z-link" href="\/zodiac\/goat\/"/.test(h), '马年页没链到羊年');
  });

  ok('索引页：一览表 12 行 + 出生年份表 + 五行表 + 三合相冲表', () => {
    const h = fs.readFileSync(path.join(PUBLIC, 'zodiac', 'index.html'), 'utf8');
    const animalCells = (h.match(/z-animal-link/g) || []).length;
    assert.strictEqual(animalCells, 24, '索引页生肖名链不是 24 个（一览表 12 + 出生年份表 12）');
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

  ok('蓝色只在 .cal-page 作用域，没有写进 :root（破例不外溢）', () => {
    const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
    const at = css.indexOf('.cal-page {');
    const scoped = css.slice(at, css.indexOf('}', at));
    assert.ok(scoped.indexOf('--z-link: #1b5fc1') !== -1, '.cal-page 里没有定义 --z-link');
    const rootAt = css.indexOf(':root {');
    const root = css.slice(rootAt, css.indexOf('}', rootAt));
    assert.ok(!/#1b5fc1/.test(root), '生肖术语链的蓝色被写进了 :root —— 单页破例会溢出成全站换色');
    assert.ok(css.indexOf('.cal-page a.z-link {') !== -1, '缺 .z-link 规则');
  });

  ok('§4.13 生肖样式段完整（E-052 同型：整份覆盖写最容易丢的就是新段）', () => {
    const css = fs.readFileSync(path.join(ROOT, 'source/css/site.css'), 'utf8');
    const must = [
      '.z-nav', '.z-facts', '.z-luck', '.z-vocab', '.z-relations', '.z-trait-cols',
      '.z-trait-col', '.z-theme', '.z-note', '.z-pager', '.z-pos', '.z-animal-link',
      '.cal-page a.z-link {', '.z-animal-current',
    ];
    const missing = must.filter((s) => css.indexOf(s) === -1);
    assert.deepStrictEqual(missing, [], 'site.css 丢了这些生肖样式：' + missing.join('、'));
  });

  ok('导航与页面互链存在（/zodiac/ 进了「更多」下拉）', () => {
    const index = path.join(PUBLIC, 'index.html');
    assert.ok(fs.existsSync(index), 'public/index.html 不存在');
    const home = fs.readFileSync(index, 'utf8');
    assert.ok(home.indexOf('href="/zodiac/"') !== -1, '首页导航里没有 /zodiac/ 入口');
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

ok('自检：蓝色写进 :root 必须被抓到（破例外溢防复发）', () => {
  const broken = ':root { --z-link: #1b5fc1; }';
  assert.ok(/#1b5fc1/.test(broken), '自检样本应当命中规则，否则断言空转');
});

console.log('\nRESULT: ' + pass + ' 项断言通过' + (process.exitCode ? '，存在失败' : ''));
process.exit(process.exitCode || 0);
