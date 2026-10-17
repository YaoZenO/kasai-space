'use strict';
// 回归测试：模块条目日期格式（E-028）。
// 背景：source/_data/*.yml 的 date 被 js-yaml 解析成 Date 对象后，模板用
// <%= new Date(it.date) %> 直出，页面上变成
// 「Sun Oct 18 2026 00:00:00 GMT+0000 (Coordinated Universal Time)」。
// 本测试锁死三件事：
//   1. themes/fluid/scripts/helpers/fmt-item-date.js 里 fmtItemDate 的行为（含非法值、时区边界）；
//   2. 模板里不得再出现直出的 new Date( / it.date 裸输出；
//   3. 已构建的 public/ HTML 里不得出现机器串日期。
// 用法：node test/module-dates.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const HELPER = path.join(ROOT, 'themes/fluid/scripts/helpers/fmt-item-date.js');

// Hexo 加载主题脚本的方式：读文件 → 包进
// (async function(exports, require, module, __filename, __dirname, hexo){…}) → vm 执行。
// 这里用同样的方式加载，才能验证「Hexo 真的能注册出这个 helper」：
// 若有人把它挪到项目根 scripts/、或拆成跨文件 require，这个加载会先失败。
function loadHelper() {
  const src = fs.readFileSync(HELPER, 'utf8');
  const mod = { exports: {} };
  const fn = vm.runInThisContext(
    `(async function(exports, require, module, __filename, __dirname, hexo){${src}\n});`,
    HELPER
  );
  const registered = {};
  const fakeHexo = { extend: { helper: { register: (name, f) => { registered[name] = f; } } } };
  fn(mod.exports, require, mod, HELPER, path.dirname(HELPER), fakeHexo);
  assert(typeof registered.fmtItemDate === 'function', 'helper 未注册为 fmtItemDate');
  return registered.fmtItemDate;
}

const assertThemeScriptLocation = () => {
  assert(fs.existsSync(HELPER), '缺少主题脚本 themes/fluid/scripts/helpers/fmt-item-date.js');
  assert(!fs.existsSync(path.join(ROOT, 'scripts/fmt-item-date-helper.js')), '根 scripts/ 里不应再放 helper（hexo server 不加载根 scripts/）');
  assert(!fs.existsSync(path.join(ROOT, 'themes/fluid/scripts/fmt-item-date-helper.js')), '顶层重复副本应删除，避免两处注册同一 helper');
};

let failures = 0;
let passed = 0;
function ok(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}
function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label || 'value'}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// 模拟模板里的 this（helper 通过 this.config 取站点配置）
const TZ = { config: { timezone: 'Asia/Shanghai' } };
const UTC = { config: { timezone: 'UTC' } };

console.log('\n[0] helper 注册位置');
ok('helper 位于主题 scripts/helpers/ 且可被 Hexo 加载注册', assertThemeScriptLocation);
const fmtItemDate = loadHelper();

console.log('\n[1] fmtItemDate 行为');
ok('Date 对象（js-yaml 解析 YYYY-MM-DD 的产物）→ 2026-10-18', () => {
  eq(fmtItemDate.call(TZ, new Date('2026-10-18')), '2026-10-18');
});
ok('纯日期字符串原样返回（不受时区影响）', () => {
  eq(fmtItemDate.call(TZ, '2026-10-15'), '2026-10-15');
});
ok('带时区的 ISO 串按配置时区取日期', () => {
  eq(fmtItemDate.call(TZ, '2026-10-17T16:30:00.000Z'), '2026-10-18'); // UTC 16:30 = 东八区次日 00:30
  eq(fmtItemDate.call(UTC, '2026-10-17T16:30:00.000Z'), '2026-10-17');
});
ok('自定义格式', () => {
  // 注意：Date 对象是绝对时刻；yml 里的 2026-10-18 被解析成 UTC 00:00，
  // 换算到 Asia/Shanghai 就是 08:00。helper 只负责「按配置时区显示」，不做日历重解释。
  eq(fmtItemDate.call(TZ, new Date('2026-10-18'), 'YYYY-MM-DD HH:mm'), '2026-10-18 08:00');
  eq(fmtItemDate.call(UTC, new Date('2026-10-18'), 'YYYY-MM-DD HH:mm'), '2026-10-18 00:00');
  eq(fmtItemDate.call(TZ, '2026-10-15', 'YYYY-MM-DD HH:mm'), '2026-10-15');
});
ok('空值 / 非法值不炸、不输出机器串', () => {
  eq(fmtItemDate.call(TZ, ''), '');
  eq(fmtItemDate.call(TZ, null), '');
  eq(fmtItemDate.call(TZ, undefined), '');
  eq(fmtItemDate.call(TZ, new Date('not a date')), '');
  eq(fmtItemDate.call(TZ, '   '), '');
});
ok('结果永不含 EJS 直出 Date 的机器串特征', () => {
  const samples = [new Date('2026-10-18'), '2026-10-18', new Date(Date.now())];
  for (const s of samples) {
    const out = fmtItemDate.call(TZ, s);
    assert(!/GMT|Coordinated Universal Time/.test(out), `输出含机器串: ${out}`);
  }
});
ok('毫秒时间戳（首页动态聚合的 date.valueOf()）→ 日期，不得输出裸数字', () => {
  const ts = new Date('2026-10-18').valueOf(); // 1792281600000 形态
  const out = fmtItemDate.call(TZ, ts);
  eq(out, '2026-10-18');
  assert(!/^\d{6,}$/.test(out), `输出了裸时间戳: ${out}`);
  eq(fmtItemDate.call(TZ, String(ts)), '2026-10-18', '数字字符串形态');
  eq(fmtItemDate.call(UTC, ts), '2026-10-18', 'UTC 时区下同一天');
});
ok('非法时间戳不炸、输出空串', () => {
  eq(fmtItemDate.call(TZ, NaN), '');
  eq(fmtItemDate.call(TZ, Infinity), '');
});

console.log('\n[2] 模板禁用直出 Date');
const LAYOUT_DIR = path.join(ROOT, 'themes/fluid/layout');
const MODULE_TPL = ['game.ejs', 'project.ejs', 'module-index.ejs'];
for (const f of MODULE_TPL) {
  const src = fs.readFileSync(path.join(LAYOUT_DIR, f), 'utf8');
  ok(`${f}: 不出现 <%= new Date(`, () => {
    assert(!/<%=[^%]*new Date\(/.test(src), '发现 <%= new Date(...) %>：Date 直出会渲染成机器串');
  });
  ok(`${f}: 不出现 <%= it.date %> 裸输出`, () => {
    assert(!/<%=\s*it\.date\s*%>/.test(src), '发现 <%= it.date %>：未经格式化的原值输出');
  });
  ok(`${f}: 日期经 fmtItemDate 输出`, () => {
    assert(/fmtItemDate\(/.test(src), '未使用 fmtItemDate helper');
  });
  ok(`${f}: <time> 的 datetime 是 YYYY-MM-DD`, () => {
    const bad = (src.match(/<time[^>]*>/g) || []).filter((t) => !/datetime="<%=\s*fmtItemDate\(/.test(t));
    assert(!bad.length, `存在非 fmtItemDate 的 <time>: ${bad[0]}`);
  });
}
// 全局：任何前台模板都不得把 Date 对象直接交给 <%= %> 输出
// （只用 Date 的数值 / 年份属性，或先经 fmtItemDate/date() 格式化，都不算）
function rawDateOutputs(src) {
  const hits = [];
  const re = /<%=([\s\S]*?)%>/g;
  let m;
  while ((m = re.exec(src))) {
    const expr = m[1];
    if (!/\bnew Date\s*\(/.test(expr)) continue;
    // 已经交给格式化函数的不算直出
    if (/\b(date|full_date|fmtItemDate|moment|time_tag)\s*\(/.test(expr)) continue;
    // 取属性（getFullYear / valueOf …）得到的是数值或数字字符串，不是机器串
    if (/\.\s*(getFullYear|getMonth|getDate|getTime|valueOf|getHours|getMinutes|toISOString|getFullYear)\s*\(/.test(expr)) continue;
    hits.push(expr.trim());
  }
  return hits;
}
ok('themes/fluid/layout 下无任何模板把 Date 对象直出', () => {
  const bad = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!n.endsWith('.ejs')) continue;
      const hits = rawDateOutputs(fs.readFileSync(p, 'utf8'));
      if (hits.length) bad.push(`${path.relative(ROOT, p)} → ${hits[0]}`);
    }
  })(LAYOUT_DIR);
  assert(!bad.length, `模板直出 Date: ${bad.join(' | ')}`);
});

console.log('\n[3] 构建产物回归（public/ 存在时）');
const PUBLIC = path.join(ROOT, 'public');
if (!fs.existsSync(PUBLIC)) {
  console.log('  SKIP  public/ 不存在（先 npm run build）');
} else {
  const RAW_RE = /GMT[+-]\d{4}|Coordinated Universal Time/;
  const bad = [];
  let count = 0;
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!n.endsWith('.html')) continue;
      count++;
      if (RAW_RE.test(fs.readFileSync(p, 'utf8'))) bad.push(path.relative(PUBLIC, p).replace(/\\/g, '/'));
    }
  })(PUBLIC);
  ok(`public/ 共 ${count} 个 HTML，无机器串日期`, () => {
    assert(!bad.length, `含机器串日期: ${bad.slice(0, 8).join(', ')}`);
  });
  // E-029：Hexo 渲染抛错时会写入 0 字节 HTML，但构建仍报「N files generated」、退出码 0。
  // 只看构建输出与退出码会完全漏掉，必须直接量字节数。
  ok('public/ 下无 0 字节 HTML（E-029：渲染失败静默产出空页面）', () => {
    const empties = [];
    (function walk(d) {
      for (const n of fs.readdirSync(d)) {
        const p = path.join(d, n);
        if (fs.statSync(p).isDirectory()) { walk(p); continue; }
        if (!n.endsWith('.html')) continue;
        if (fs.statSync(p).size === 0) empties.push(path.relative(PUBLIC, p).replace(/\\/g, '/'));
      }
    })(PUBLIC);
    assert(!empties.length, `0 字节页面（渲染失败）：${empties.slice(0, 10).join(', ')}`);
  });
  ok('关键页面有真实内容（首页 / 三个模块列表页）', () => {
    for (const f of ['index.html', 'games/index.html', 'projects/index.html', 'collections/index.html']) {
      const p = path.join(PUBLIC, f);
      assert(fs.existsSync(p), `缺页面 ${f}`);
      const size = fs.statSync(p).size;
      assert(size > 1000, `${f} 仅 ${size} 字节，疑似渲染失败`);
    }
  });
  ok('模块页 <time> 内容为 YYYY-MM-DD 形式', () => {
    const targets = ['games/index.html', 'projects/index.html', 'collections/index.html'];
    const problems = [];
    for (const t of targets) {
      const p = path.join(PUBLIC, t);
      if (!fs.existsSync(p)) continue;
      // 只取 <time …>内容</time> 这一整段（内容里不含其它标签）
      const times = fs.readFileSync(p, 'utf8').match(/<time\b[^>]*>[^<]*<\/time>/g) || [];
      for (const tag of times) {
        const inner = tag.replace(/^<time\b[^>]*>/, '').replace(/<\/time>$/, '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(inner)) problems.push(`${t}: 内容「${inner}」`);
        if (!/datetime="\d{4}-\d{2}-\d{2}"/.test(tag)) problems.push(`${t}: datetime 非 ISO 日期 → ${tag}`);
      }
    }
    assert(!problems.length, problems.slice(0, 5).join(' | '));
  });
}

console.log(`\n结果：${passed} 通过，${failures} 失败\n`);
process.exit(failures ? 1 : 0);
