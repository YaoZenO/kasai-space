'use strict';
// 首页「刻度」结构与交互契约（2026-11-15 改版）。
//
// 这套断言的存在理由来自三条真实故障（ERRORS.md）：
//   E-163 收尾写成 <footer>，被 body.is-home footer 整块隐藏 → 元素在产物里、页面不渲染；
//   E-164 脚本尾部被截断成语法错误，交互全失效而外观正常 → 只跑构建永远发现不了；
//   E-165 共享类上写死压图配色，复用到纸面后白字压纸底 → 截图才看得见。
// 因此这里同时锁四层：模板、CSS、产物 DOM、脚本语法。
//
// 运行：node test/home-measure.js（已串入 npm test）

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let passed = 0;
function ok(label, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS', label);
  } catch (e) {
    console.error('  FAIL', label, '—', e.message);
    process.exitCode = 1;
  }
}

const PAGE = 'src/pages/index.astro';
const JS = 'source/js/home-measure.js';
const page = read(PAGE);
const siteCss = read('source/css/site.css');
const homeJs = read(JS);

// §4.25 取样：从本节标题到下一个顶层分节（E-159 教训：终点必须取下一个分节，不按字符数切）
const S25_START = siteCss.indexOf('/* ===== 4.25 ');
const S25_END = siteCss.indexOf('/* ===== 5. ', S25_START);
const s25 = S25_START === -1 || S25_END === -1 ? '' : siteCss.slice(S25_START, S25_END);

console.log('源文件契约（模板 / CSS / 脚本）');

ok('首页样式段取样有效（§4.25 存在且非空）', () => {
  assert.ok(S25_START > 0, 'site.css 找不到 §4.25 首页「刻度」段');
  assert.ok(S25_END > S25_START, '§4.25 取样终点失效（找不到 §5）');
  assert.ok(s25.length > 4000, '§4.25 取样过短，取样口径可能又漂了');
});

// E-163：首页收尾不能用 footer 标签，否则被 body.is-home footer 规则整块隐藏
ok('E-163 防复发 1/2：首页模板不得出现 <footer（会被全站 is-home 规则隐藏）', () => {
  assert.ok(!/<footer[\s>]/.test(page),
    'index.astro 里出现了 <footer —— body.is-home footer{display:none} 会让它整块消失，'
    + '首页收尾请用 <div class="mz-foot">');
});

ok('E-164 防复发 1/2：交互脚本语法必须可解析（源码与产物各一次）', () => {
  execFileSync(process.execPath, ['--check', path.join(ROOT, JS)], { stdio: 'pipe' });
  if (exists('dist/js/home-measure.js')) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, 'dist/js/home-measure.js')], { stdio: 'pipe' });
  }
});

// E-165：压图配色只能挂在照片容器上，不能写在跨上下文复用的基类里
ok('E-165 防复发：.mz-kicker 基类不得出现纸色（只能由 .mz-plate 覆盖）', () => {
  const base = s25.match(/^\.mz-kicker\s*\{[^}]*\}/m);
  assert.ok(base, 'site.css §4.25 缺少 .mz-kicker 基础规则');
  assert.ok(!/#fdfaf4|rgba\(253,\s*250,\s*244/.test(base[0]),
    '.mz-kicker 基类里写了纸色——它同时用于纸面区块（档案 / 去处），会出现白字压纸底');
  const plate = s25.match(/\.mz-plate\s+\.mz-kicker\s*\{[^}]*\}/);
  assert.ok(plate, '缺少 .mz-plate .mz-kicker 覆盖规则');
  assert.ok(/#fdfaf4|rgba\(253,\s*250,\s*244/.test(plate[0]),
    '.mz-plate .mz-kicker 没有换成纸色，压图文字会落在墨色上');
});

// E-064：构建压缩器会吃掉「+」两侧空格，加法 calc 会静默失效
ok('E-064 防复发：§4.25 不得出现加法 calc / 渐变（A14）', () => {
  // 只看声明层：注释里写「不要用 calc(a + b)」是在解释规则，不是违规（本套件首跑就被自己的
  // 说明文字判红过——断言必须区分「代码」与「讲代码的话」）。
  const decl = s25.replace(/\/\*[\s\S]*?\*\//g, '');
  const additive = decl.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /calc\([^)]*\+[^)]*\)/.test(l));
  assert.deepStrictEqual(additive, [],
    '本节出现加法 calc（压缩后声明会失效）：' + additive.map(([n, l]) => n + ': ' + l.trim()).join(' / '));
  assert.ok(!/gradient/i.test(decl), '§4.25 出现渐变（A14 反 AI 味口径）');
});

ok('减少动态效果分支存在，且覆盖图纸钉住与入场编排', () => {
  const reduce = s25.slice(s25.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(reduce.length > 400, '§4.25 缺少 prefers-reduced-motion: reduce 分支');
  assert.match(reduce, /\.mz-hero\s*\{[^}]*height:\s*auto/, 'reduce 下图纸舞台未改 auto（仍会钉住）');
  assert.match(reduce, /\.mz-plate\s*\{[^}]*position:\s*relative/,
    'reduce 下图纸仍是 sticky —— 减少动效时不应保留钉住位移');
  assert.match(reduce, /\.mz-id > \*[\s\S]{0,80}animation:\s*none/, 'reduce 下入场编排未关闭');
});

// E-168：入场动画的 both 填充会压住滚动退场的 opacity，入场动画只能挂在子元素上
ok('E-168 防复发：.mz-clock 自身不得挂 animation（会压死滚动退场）', () => {
  const clock = s25.match(/^\.mz-clock\s*\{[^}]*\}/m);
  assert.ok(clock, '§4.25 缺少 .mz-clock 规则');
  assert.ok(!/animation\s*:/.test(clock[0]),
    '.mz-clock 上挂了 animation —— both 填充会把 opacity 钉成 1，'
    + '滚动退场 calc 失效、读数会被仪表上沿横切。入场动画请挂到 .mz-clock > *');
  assert.match(s25, /\.mz-clock\s*>\s*\*\s*\{[^}]*animation\s*:/,
    '缺少 .mz-clock > * 的入场动画（读数入场会没有编排）');
});

// 仪表在导航下方钉住会在悬浮胶囊下切出半截标题（本次已回退该方案）
ok('仪表不钉住：不得回到 position: sticky', () => {
  const inst = s25.match(/^\.mz-inst\s*\{[^}]*\}/m);
  assert.ok(inst, '§4.25 缺少 .mz-inst 规则');
  assert.ok(!/position:\s*sticky/.test(inst[0]),
    '.mz-inst 又变成 sticky —— 站点导航是悬浮胶囊、没有实心条，钉住的仪表会在导航下方切出半截标题');
});

console.log('\n产物契约（dist/index.html，需先 npm run astro:build）');

if (!exists('dist/index.html')) {
  console.log('  SKIP 无 dist/index.html，先跑 npm run astro:build');
} else {
  const home = read('dist/index.html');

  ok('E-163 防复发 2/2：产物必须渲染出首页收尾', () => {
    assert.ok(home.includes('class="mz-foot"'), '产物缺 .mz-foot —— 收尾又被隐藏了');
  });

  ok('刻度尺语义完整：role=slider + 值域 + 可读值 + 说明', () => {
    assert.match(home, /role="slider"/, '缺少 role="slider"');
    for (const attr of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-describedby']) {
      assert.match(home, new RegExp(attr + '="'), '刻度尺缺少 ' + attr);
    }
    assert.match(home, /tabindex="0"/, '刻度尺不可聚焦');
    assert.ok(/aria-valuetext="[^"]+年[^"]+月[^"]+日/.test(home), 'aria-valuetext 不是可读日期');
    assert.match(home, /data-min="\d+" data-max="\d+"/, '刻度尺缺少 data-min/data-max');
  });

  ok('档案行数 = 内嵌数据条数，且没有空链接 / 死链', () => {
    const json = home.match(/<script type="application\/json" id="mz-data">([\s\S]*?)<\/script>/);
    assert.ok(json, '产物缺 #mz-data（交互脚本的唯一数据源）');
    const recs = JSON.parse(json[1].replace(/\\u003c/g, '<'));
    const rows = (home.match(/class="mz-rec"/g) || []).length;
    assert.strictEqual(rows, recs.length, `档案行数 ${rows} ≠ 内嵌数据 ${recs.length}`);
    for (const r of recs) {
      assert.ok(r.d && /^\d{4}-\d{2}-\d{2}$/.test(r.d), '记录日期格式不对：' + r.d);
      assert.ok(r.t, '记录缺标题');
      assert.ok(r.h && r.h !== '#', '记录缺落点：' + r.t);
      assert.ok(!/^\/collections\/[^/]+\/$/.test(r.h),
        'collections 没有详情路由，出现死链：' + r.h);
    }
  });

  // E-167：刻度单位是「月」，条数与时间跨度必须对得上，条上必须带月份与条数
  ok('E-167 防复发：月密度条数与时间跨度月数一致，条数之和 = 记录数', () => {
    const min = Number(home.match(/data-min="(\d+)"/)[1]);
    const max = Number(home.match(/data-max="(\d+)"/)[1]);
    const start = new Date(min * 86400000);
    const end = new Date(max * 86400000);
    const months = (end.getUTCFullYear() * 12 + end.getUTCMonth())
      - (start.getUTCFullYear() * 12 + start.getUTCMonth()) + 1;

    const bars = [...home.matchAll(/<i class="mz-bar[^"]*" data-month="([\d-]+)" data-count="(\d+)"/g)];
    assert.strictEqual(bars.length, months,
      `月条数 ${bars.length} ≠ 跨期月数 ${months}（刻度又按日布点或漏月了）`);
    const sum = bars.reduce((acc, m) => acc + Number(m[2]), 0);
    const json = JSON.parse(home.match(/id="mz-data">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<'));
    assert.strictEqual(sum, json.length, `月条计数之和 ${sum} ≠ 记录数 ${json.length}`);
    for (const m of bars) assert.match(m[1], /^\d{4}-\d{2}$/, '月条缺合法 data-month：' + m[1]);
  });

  ok('交互脚本被产物引用且盖了内容 hash（/js/ 是 immutable 一年缓存）', () => {
    assert.match(home, /src="\/js\/home-measure\.js\?v=[0-9a-f]{8}"/,
      'home-measure.js 未以 ?v=<hash> 引入');
  });

  ok('页面主体内容在禁用 JS 时依然完整（读数是增强，不是内容）', () => {
    // 刻度、月条、档案行、去处全部服务端渲染；脚本只改状态
    assert.ok(home.includes('class="mz-scale"'), '刻度尺不是服务端渲染');
    assert.ok(home.includes('class="mz-list"'), '档案列表不是服务端渲染');
    assert.ok(home.includes('class="mz-door"'), '去处不是服务端渲染');
  });
}

console.log(`\nRESULT: ${passed} 项断言通过${process.exitCode ? '，存在失败' : ''}`);
process.exit(process.exitCode || 0);
