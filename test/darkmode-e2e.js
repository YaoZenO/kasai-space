'use strict';
// 暗色模式端到端断言（2026-11-09，方案 §10 的 24 条验收口径里可自动化的部分）。
//
// 2026-11-11 修订：主人指出手机端切换按钮被塞进九宫格「更多」分组，改为顶栏
// .site-nav-actions 内唯一一个按钮（所有视口可见）。§10-12 两个断言与产物计数断言
// 已按新口径改写，并新增「防复发 1/4–4/4」四条断言锁死按钮位置与单按钮约束。
//
// 运行：node test/darkmode-e2e.js
// 依赖构建产物：先跑 `npx hexo clean && npm run build` 与 `npm run astro:build`；
// 产物不存在时相关断言标 SKIP（与其余 e2e 套件同一约定），源码层断言始终执行。
//
// 覆盖：§10 第 1/2/3/4(令牌级)/5/6/7(部分)/8/9/10/11/12/13/14(静态)/15/16(静态)/
//       17/18/19/20(部分)/21/22(静态)/23/24 条。
// 不覆盖（需真实浏览器 / CDP，见回传说明）：首帧像素底色、375/768/1440 实机无横向溢出、
//       真实点击后的 localStorage 往返、Tab 键运行时序列、照片 mask 合成后白字对比度。

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

let passed = 0;
let skipped = 0;
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
function skip(label, why) {
  skipped += 1;
  console.log('  SKIP', label, '—', why);
}

console.log('暗色模式 E2E（方案 §10 验收口径）');

// E-169：HEAD 比对必须先归一换行符。
// 本机 core.autocrlf=true —— 工作区文件是 CRLF，`git show HEAD:…` 出来的是 LF 的 blob，
// 两边直接逐字比对会恒失败（2026-11-15 在本机实测：2 条断言长期假红，且与代码无关）。
// 规矩：凡拿工作区内容跟 git blob 比的断言，两侧一律先过 lf()。
const lf = (s) => String(s).replace(/\r\n/g, '\n');
const gitShowLF = (rel) => lf(execFileSync('git', ['show', 'HEAD:' + rel],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));

const configYml = read('themes/fluid/_config.yml');
const siteCss = read('source/css/site.css');
const siteCssCode = stripComments(siteCss);
const baseStyl = read('themes/fluid/source/css/_variables/base.styl');
const colorSchemaStyl = read('themes/fluid/source/css/_pages/_base/color-schema.styl');
const colorSchemaJs = read('themes/fluid/source/js/color-schema.js');
const colorSchemaJsCode = stripComments(colorSchemaJs);
const navEjs = read('themes/fluid/layout/_partials/site/nav.ejs');
const siteNavAstro = read('src/components/SiteNav.astro');
const headEjs = read('themes/fluid/layout/_partials/head.ejs');
const headAstro = read('src/components/Head.astro');
const stylesAstro = read('src/components/Styles.astro');
const baseLayoutAstro = read('src/layouts/BaseLayout.astro');
const cssEjs = read('themes/fluid/layout/_partials/css.ejs');
const prepareAssets = stripComments(read('tools/prepare-assets.mjs'));
const designLang = read('DESIGN-LANGUAGE.md');
const proposal = read('DESIGN-DARKMODE-PROPOSAL-2026-11-09.md');
const pkg = JSON.parse(read('package.json'));
// Phase 4A 新增的三层自动层输入（源码层断言始终执行）
const sunSchemeJs = read('themes/fluid/source/js/sun-scheme.js');
const sunSchemeJsCode = stripComments(sunSchemeJs);
const sunTimesApi = read('api/sun-times.js');
const sunTimesApiCode = stripComments(sunTimesApi);

// §15 暗态段（成对双分支）的起止；源码层断言都只在这段里取暗值，避免误取浅色 :root。
// 起点取段头注释的 /* 处，保证 stripComments 能把整段说明（里面会引用浅色色值）剥干净。
const markerAt = siteCss.indexOf('===== 15. 暗色模式');
const darkStart = markerAt === -1 ? -1 : siteCss.lastIndexOf('/*', markerAt);
const darkSection = darkStart === -1 ? '' : siteCss.slice(darkStart);
const darkCode = stripComments(darkSection);

// WCAG 2.x 相对亮度 / 对比度
function lum(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error('不是 6 位 HEX：' + hex);
  const ch = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const lin = ch.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function darkToken(name) {
  const m = darkCode.match(new RegExp('--' + name + ':\\s*([^;]+);'));
  return m ? m[1].trim() : null;
}
function themeDark(key) {
  const m = configYml.match(new RegExp('^\\s*' + key + ':\\s*"?([^"\\n]+?)"?\\s*$', 'm'));
  return m ? m[1].trim() : null;
}
function allHex(s) {
  return (s.match(/#[0-9a-fA-F]{6}\b/g) || []).map((x) => x.toLowerCase());
}

// ---------- 配色红线（§10 第 1 / 2 / 3 / 4 条） ----------

const COLD_BLUE = ['#181c27', '#1f3144', '#252d38', '#435266', '#1589e9', '#30a9de', '#364151', '#46647e'];
const COLD_GRAY = ['#c4c6c9', '#a7a9ad', '#d0d0d0', '#687582', '#9da8b3'];
const darkLines = configYml.split('\n').filter((l) => /^\s*\w+_dark\s*:/.test(l)).join('\n').toLowerCase();

ok('§10-1：_config.yml 全部 *_dark 不命中冷蓝组 8 值', () => {
  const hits = COLD_BLUE.filter((c) => darkLines.includes(c));
  assert.deepStrictEqual(hits, [], '仍残留冷蓝组：' + hits.join(' '));
});

ok('§10-1：_config.yml 全部 *_dark 不命中 5 个冷灰', () => {
  const hits = COLD_GRAY.filter((c) => darkLines.includes(c));
  assert.deepStrictEqual(hits, [], '仍残留冷灰：' + hits.join(' '));
});

ok('§10-2：base.styl / color-schema.styl 无冷蓝灰残留', () => {
  const both = (baseStyl + '\n' + colorSchemaStyl).toLowerCase();
  ['#2d333b', 'rgba(99, 110, 123, .4)', '#3e4b5e'].forEach((c) => {
    assert.ok(!both.includes(c), '残留冷蓝灰：' + c);
  });
  assert.match(baseStyl, /\$highlight-bg-color-dark\s*=\s*#242019/);
  assert.match(baseStyl, /\$inlinecode-bg-color-dark\s*=\s*rgba\(229, 222, 210, \.10\)/);
  assert.match(colorSchemaStyl, /brightness\(\.97\)/);
  assert.match(colorSchemaStyl, /rgba\(36, 32, 25, \.35\)/);
});

ok('§10-3：暗态所有不透明 HEX 逐通道 R > G > B', () => {
  const pool = [...new Set([
    ...allHex(darkLines),
    ...allHex(darkCode),
  ])];
  assert.ok(pool.length >= 8, '暗态不透明色值样本太少，断言可能空转');
  const bad = pool.filter((hex) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return !(r > g && g > b);
  });
  assert.deepStrictEqual(bad, [], 'R>G>B 破口：' + bad.join(' '));
});

ok('§10-4：两档不透明纸色仍是 #1a1814 / #242019（令牌级）', () => {
  assert.strictEqual(themeDark('body_bg_color_dark'), '#1a1814');
  assert.strictEqual(themeDark('board_color_dark'), '#242019');
  assert.strictEqual(themeDark('highlight_bg_color_dark'), null);
  assert.match(baseStyl, /\$highlight-bg-color-dark\s*=\s*#242019/);
});

ok('§10-5：六类文字/交互色对 #1a1814 与 #242019 均 ≥4.5:1', () => {
  const tokens = [
    ['--accent', darkToken('accent')],
    ['--text-color', themeDark('text_color_dark')],
    ['--sec-text-color', themeDark('sec_text_color_dark')],
    ['--info-mark', darkToken('info-mark')],
    ['--post-link-color', themeDark('post_link_color_dark')],
    ['--navbar-text-color', themeDark('navbar_text_color_dark')],
  ];
  tokens.forEach(([name, val]) => assert.ok(val, '取不到 ' + name + ' 暗值'));
  const bad = [];
  for (const [name, val] of tokens) {
    for (const bg of ['#1a1814', '#242019']) {
      const c = contrast(val, bg);
      if (c < 4.5) bad.push(`${name}=${val} on ${bg} = ${c.toFixed(2)}:1`);
    }
  }
  assert.deepStrictEqual(bad, [], '不满足 AA：\n    ' + bad.join('\n    '));
});

ok('§10-5：反色块 / 名次角标 / 深陶土块字色 ≥4.5:1', () => {
  const pairs = [
    ['--on-ink on --surface-ink', darkToken('on-ink'), darkToken('surface-ink')],
    ['.cr-tile-rank', '#1b1712', '#fdfaf4'],
    ['.cell-orange', darkToken('on-ink'), darkToken('block-orange')],
  ];
  const bad = pairs.filter(([, a, b]) => contrast(a, b) < 4.5)
    .map(([n, a, b]) => `${n} = ${contrast(a, b).toFixed(2)}:1`);
  assert.deepStrictEqual(bad, [], '不满足 AA：' + bad.join(' / '));
});

// ---------- token 单源 / 后台（§10 第 6 / 7 / 8 / 9 条） ----------

ok('§10-6：site.css 首个 --accent 仍是 #a8482c，首个 --on-ink 仍是 #fdfaf4', () => {
  assert.match(siteCss, /--accent:\s*#a8482c/);
  assert.strictEqual(siteCss.match(/--accent:\s*([^;]+);/)[1].trim(), '#a8482c');
  assert.strictEqual(siteCss.match(/--on-ink:\s*([^;]+);/)[1].trim(), '#fdfaf4');
  assert.ok(siteCss.indexOf('--accent: #a8482c') < darkStart, '浅色 --accent 不再是首个定义');
});

ok('§10-6/9：source/admin/ 无改动（tracked diff 为空）', () => {
  const run = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  const unstaged = run(['diff', '--name-only', '--', 'source/admin/']);
  const staged = run(['diff', '--cached', '--name-only', '--', 'source/admin/']);
  assert.strictEqual(unstaged, '', 'source/admin/ 有未暂存改动：' + unstaged);
  assert.strictEqual(staged, '', 'source/admin/ 有已暂存改动：' + staged);
});

ok('§10-7：暗态段成对双分支，三种选择器齐全', () => {
  assert.ok(darkStart > -1, 'site.css 缺 §15 暗态段');
  assert.match(darkCode, /@media \(prefers-color-scheme: dark\)/);
  assert.match(darkCode, /:root:not\(\[data-user-color-scheme\]\)/);
  assert.match(darkCode, /\[data-user-color-scheme="dark"\]/);
  assert.match(darkCode, /@media not print/);
  // 两个分支的 token 块必须逐字一致（防止只改一边）
  const followAt = darkCode.indexOf('@media (prefers-color-scheme: dark)');
  const manualAt = darkCode.indexOf('@media not print');
  assert.ok(followAt > -1 && manualAt > followAt, '两个分支顺序不对');
  const tokenOf = (block) => (block.match(/--[a-z-]+:\s*[^;]+;/g) || []).filter((d) => !d.includes('background-color')).join('\n');
  // 各分支内的第一条 token 块（根节点）必须同值
  const grab = (from, to) => {
    const seg = darkCode.slice(from, to);
    const m = seg.match(/\{([^{}]*)\}/);
    return m ? tokenOf(m[1]) : '';
  };
  const a = grab(followAt, manualAt);
  const b = grab(manualAt, darkCode.length);
  assert.ok(a.length > 200 && b.length > 200, '分支 token 块取样失败');
  assert.strictEqual(a, b, '跟随系统分支与手动分支的暗值不一致');
});

ok('§10-8：.cal-page 作用域 5 变量 + .cal-pinyin 暗值已同步（6 处）', () => {
  const scoped = darkCode.match(/\.cal-page\s*\{([^}]*)\}/);
  assert.ok(scoped, '暗态段缺 .cal-page 作用域覆盖');
  ['--accent: #d97757', '--text-color: #e5ded2', '--sec-text-color: #b3aa9c',
    '--info-mark: #8f877a', '--z-link: #eea883'].forEach((d) => {
    assert.ok(scoped[1].includes(d), '.cal-page 暗态缺 ' + d);
  });
  assert.ok(/\.cal-page \.cal-pinyin[^{]*\{[^}]*color:\s*var\(--sec-text-color\)/.test(darkCode),
    '.cal-pinyin 暗态未同步');
  // 浅色作用域仍保持原值（不能把浅色也改掉）
  const lightScoped = siteCss.slice(siteCss.indexOf('.cal-page {'), siteCss.indexOf('}', siteCss.indexOf('.cal-page {')));
  assert.ok(lightScoped.includes('--accent: #a8482c'), '浅色 .cal-page 作用域被误改');
});

ok('§10-8：12 个 --fs-fig-* 主色一个未改、只出现在纹样规则内、不进 :root', () => {
  const SLUGS = ['qixi', 'yuandan', 'chunjie', 'qingming', 'duanwu', 'zhongqiu',
    'guoqing', 'yuanxiao', 'zhongyuan', 'chongyang', 'dongzhi', 'laba'];
  const EXPECT = {
    qixi: '#46586e', yuandan: '#b5793a', chunjie: 'var(--accent)', qingming: '#7e8e6a',
    duanwu: '#5e7a55', zhongqiu: '#33465c', guoqing: '#a03226', yuanxiao: '#bf6b2f',
    zhongyuan: '#3f4a52', chongyang: '#c09a3e', dongzhi: '#a5544a', laba: '#7a5c42',
  };
  SLUGS.forEach((s) => {
    const re = new RegExp('--fs-fig-' + s + ':\\s*([^;]+);');
    const m = siteCssCode.match(re);
    assert.ok(m, '缺 --fs-fig-' + s + ' 定义');
    assert.strictEqual(m[1].trim(), EXPECT[s], '--fs-fig-' + s + ' 主色被改动');
  });
  // 暗态段不得重定义任何纹样主色
  assert.ok(!/--fs-fig-[a-z]+\s*:/.test(darkCode), '暗态段重定义了 --fs-fig-*');
  // :root 内不得出现
  const rootBlock = siteCssCode.slice(siteCssCode.indexOf(':root {'), siteCssCode.indexOf('}', siteCssCode.indexOf(':root {')));
  assert.ok(rootBlock.indexOf('--fs-fig-') === -1, '--fs-fig-* 被写进了 :root');
  // 每条含 --fs-fig- 定义的规则，其选择器必须落在纹样块内
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(siteCssCode)) !== null) rules.push({ sel: m[1], body: m[2] });
  const offenders = rules.filter((r) => /--fs-fig-[a-z]+\s*:/.test(r.body)
    && !/fs-figure--css|fs-fig-/.test(r.sel));
  assert.deepStrictEqual(offenders.map((r) => r.sel.trim()), [], '--fs-fig-* 定义溢出纹样规则');
});

ok('§10-7：暗态段不新增 font-size / 圆角 / aspect-ratio / 布局量', () => {
  assert.ok(!/font-size\s*:/.test(darkCode), '暗态段改了字号');
  assert.ok(!/border-radius\s*:/.test(darkCode), '暗态段改了圆角');
  assert.ok(!/aspect-ratio\s*:/.test(darkCode), '暗态段改了宽高比');
  assert.ok(!/\b(?:margin|padding|grid-template|width|height)\s*:/.test(darkCode), '暗态段改了布局量');
});

// ---------- 功能接线 / 状态机（§10 第 10–16 条） ----------

ok('§10-10：源码模板输出 data-default-color-scheme 与 highlight-css-dark', () => {
  assert.match(read('themes/fluid/layout/layout.ejs'), /data-default-color-scheme/);
  assert.match(baseLayoutAstro, /data-default-color-scheme=\{darkModeEnable/);
  assert.match(cssEjs, /theme\.dark_mode\.enable[\s\S]{0,200}highlight-css-dark/);
  assert.match(stylesAstro, /import \{[^}]*darkModeEnable[^}]*\} from '\.\.\/lib\/site-config'/);
  assert.match(stylesAstro, /\{darkModeEnable && \([\s\S]{0,200}id="highlight-css-dark"/);
  assert.ok(/dark_mode:\s*\n[\s\S]{0,400}?enable:\s*true/.test(configYml), 'dark_mode.enable 未开启');
  assert.match(configYml, /default:\s*auto/);
});

ok('§10-11：prepare-assets.mjs 已去掉「dark_mode 关闭所以 dark 为 false」假设', () => {
  assert.ok(!/dark_mode 关闭，所以 dark 为 false/.test(prepareAssets), '旧假设注释仍在');
  assert.ok(!/highlightjs\.dark\s*=\s*false/.test(prepareAssets), 'dark 仍被写成 false');
  assert.match(prepareAssets, /highlightjs\.dark\s*=\s*\{[\s\S]*?dark\.css/);
  assert.match(prepareAssets, /compileStyl\('css\/highlight-dark\.styl'/);
});

ok('§10-12：顶栏切换按钮恰好 1 处、九宫格切换按钮 0 处，且为 button + aria（2026-11-11 修订）', () => {
  [['nav.ejs', navEjs], ['SiteNav.astro', siteNavAstro]].forEach(([name, src]) => {
    const desktop = (src.match(/id="color-toggle-btn"/g) || []).length;
    const mobile = (src.match(/id="mobile-color-toggle-btn"/g) || []).length;
    assert.strictEqual(desktop, 1, name + ' 顶栏 #color-toggle-btn 不是 1 处');
    assert.strictEqual(mobile, 0, name + ' 九宫格仍残留 #mobile-color-toggle-btn（应为 0）');
    assert.match(src, /<button[^>]*id="color-toggle-btn"/, name + ' 顶栏不是 button');
    assert.match(src, /aria-pressed="false"/, name + ' 缺 aria-pressed');
    assert.match(src, /aria-label="切换到深色模式"/, name + ' 缺功能性 aria-label');
  });
  // 顺序：搜索之后、汉堡之前；不在下拉面板内
  [['nav.ejs', navEjs], ['SiteNav.astro', siteNavAstro]].forEach(([name, src]) => {
    const s = src.indexOf('search-btn');
    const t = src.indexOf('color-toggle-btn');
    const h = src.indexOf('navbar-toggler-btn');
    assert.ok(s > -1 && t > s && h > t, name + ' 切换按钮不在搜索之后 / 汉堡之前');
    const actions = src.slice(src.indexOf('class="site-nav-actions"'), src.indexOf('class="site-nav-actions"') + 1200);
    assert.ok(actions.indexOf('color-toggle-btn') > -1 && actions.indexOf('dropdown-menu') === -1,
      name + ' 切换按钮不在 .site-nav-actions 或混进了 dropdown-menu');
  });
});

// 2026-11-11 防复发判据：顶栏唯一按钮必须在 .site-nav-actions 内、不带窄屏隐藏类，
// 且不得出现在九宫格 / 下拉 / 主列表内。源码与构建产物共用同一套判据。
function toggleOpenTag(src) {
  const btnAt = src.indexOf('id="color-toggle-btn"');
  assert.ok(btnAt > -1, '缺 #color-toggle-btn');
  const openStart = src.lastIndexOf('<button', btnAt);
  const openEnd = src.indexOf('>', btnAt);
  return src.slice(openStart, openEnd + 1);
}

function checkToggleInActions(name, src) {
  const btnAt = src.indexOf('id="color-toggle-btn"');
  assert.ok(btnAt > -1, name + ' 缺 #color-toggle-btn');
  // class 不得含任何 Bootstrap 窄屏隐藏 / 显示类
  const cls = (toggleOpenTag(src).match(/class="([^"]*)"/) || [])[1] || '';
  assert.ok(!/d-none|d-lg-|d-md-|d-sm-|d-xl-/.test(cls),
    name + ' #color-toggle-btn 仍带窄屏隐藏类：' + cls);
  // 必须落在 .site-nav-actions 容器内（该 div 在 navbar 的 </nav> 之前闭合）
  const actionsAt = src.indexOf('class="site-nav-actions"');
  assert.ok(actionsAt > -1 && btnAt > actionsAt, name + ' #color-toggle-btn 不在 .site-nav-actions 内');
  const navClose = src.indexOf('</nav>', actionsAt);
  assert.ok(navClose > btnAt, name + ' #color-toggle-btn 落在 .site-nav-actions 之外');
}

function checkToggleNotInMenus(name, src) {
  // 九宫格：#mobile-grid-menu 起点之后不得再出现该按钮
  const gridAt = src.indexOf('id="mobile-grid-menu"');
  assert.ok(gridAt === -1 || src.indexOf('id="color-toggle-btn"', gridAt) === -1,
    name + ' #color-toggle-btn 出现在 #mobile-grid-menu 内');
  // 中心区（含 .site-nav-list 与所有 .dropdown-menu）整体不得出现该按钮
  const centerAt = src.indexOf('class="site-nav-center"');
  const actionsAt = src.indexOf('class="site-nav-actions"');
  assert.ok(centerAt > -1 && actionsAt > centerAt,
    name + ' 结构顺序异常：.site-nav-center 应在 .site-nav-actions 之前');
  assert.ok(!src.slice(centerAt, actionsAt).includes('id="color-toggle-btn"'),
    name + ' #color-toggle-btn 出现在 .site-nav-list / .dropdown-menu 所在的中心区内');
  // 逐个 .dropdown-menu / .site-nav-list 块再核一次，防止结构重排绕过整体判据
  [['dropdown-menu', /class="dropdown-menu"/g, '</div>'],
    ['site-nav-list', /class="site-nav-list"/g, '</ul>']].forEach(([label, re, close]) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const end = src.indexOf(close, m.index);
      const block = src.slice(m.index, end === -1 ? m.index + 800 : end + close.length);
      assert.ok(!block.includes('id="color-toggle-btn"'),
        name + ' #color-toggle-btn 出现在 .' + label + ' 内');
    }
  });
}

const TOGGLE_SOURCES = [
  ['nav.ejs', navEjs],
  ['SiteNav.astro', siteNavAstro],
  ['dist/index.html', exists('dist/index.html') ? read('dist/index.html') : ''],
];

ok('§10-12：唯一切换按钮绑定 click，写入值只含 light / dark（2026-11-11 修订）', () => {
  assert.match(colorSchemaJsCode, /colorToggleButtonSelector\s*=\s*'#color-toggle-btn'/);
  assert.ok(!/mobileColorToggle(Button|Control)Selector/.test(colorSchemaJsCode),
    'color-schema.js 仍残留移动端切换选择器常量');
  assert.match(colorSchemaJsCode, /button\.addEventListener\('click'/);
  assert.ok(!/mobileButton\.addEventListener\('click'/.test(colorSchemaJsCode),
    'color-schema.js 仍给第二个按钮绑定 click');
  assert.match(colorSchemaJsCode, /setLS\(colorSchemaStorageKey, currentSetting\)/);
  assert.ok(!/setLS\([^)]*['"]auto['"]/.test(colorSchemaJsCode), '写入了 auto');
  assert.ok(!/setAttribute\([^)]*['"]auto['"]/.test(colorSchemaJsCode), '把 auto 写进了属性');
  assert.match(colorSchemaJsCode, /var validColorSchemaKeys\s*=\s*\{\s*dark\s*:\s*true,\s*light\s*:\s*true\s*\}/);
});

ok('防复发 1/4（2026-11-11）：源码两侧与产物，切换按钮在 .site-nav-actions 内且不含窄屏隐藏类', () => {
  TOGGLE_SOURCES.forEach(([name, src]) => {
    assert.ok(src, name + ' 内容为空，判据失效');
    checkToggleInActions(name, src);
  });
});

ok('防复发 2/4（2026-11-11）：源码两侧与产物，切换按钮不在 #mobile-grid-menu / .dropdown-menu / .site-nav-list 内', () => {
  TOGGLE_SOURCES.forEach(([name, src]) => {
    assert.ok(src, name + ' 内容为空，判据失效');
    checkToggleNotInMenus(name, src);
  });
});

ok('防复发 3/4（2026-11-11）：color-schema.js / nav.ejs / SiteNav.astro 均不含 mobile-color-toggle 字面量', () => {
  [['color-schema.js', colorSchemaJs], ['nav.ejs', navEjs], ['SiteNav.astro', siteNavAstro]]
    .forEach(([name, src]) => {
      assert.ok(!/mobile-color-toggle/.test(src), name + ' 仍残留 mobile-color-toggle 字面量');
    });
});

ok('防复发 4/4（2026-11-11）：产物 dist/index.html 中 mobile-color-toggle-btn / icon / label 均 0 处', () => {
  const html = exists('dist/index.html') ? read('dist/index.html') : '';
  assert.ok(html, 'dist/index.html 不存在，产物判据失效');
  ['mobile-color-toggle-btn', 'mobile-color-toggle-icon', 'mobile-color-toggle-label'].forEach((lit) => {
    assert.strictEqual((html.match(new RegExp(lit, 'g')) || []).length, 0,
      '产物仍残留 ' + lit);
  });
});

ok('§10-13：无时间兜底、无「等于默认值即清空」、LS 空时移除属性', () => {
  assert.ok(!/getHours/.test(colorSchemaJsCode), '仍有 getHours 时间兜底');
  assert.ok(!/new Date/.test(colorSchemaJsCode), '仍读本地时间');
  assert.ok(!/hours\s*>=\s*18|hours\s*<=\s*6|18:00|6:00/.test(colorSchemaJsCode), '仍有 18/6 时间判断');
  assert.ok(!/current\s*===\s*getDefaultColorSchema\(\)/.test(colorSchemaJsCode),
    '仍存在「切回默认即清空 LS」分支');
  assert.match(colorSchemaJsCode, /function resetSchemaAttributeAndLS\(\)\s*\{[\s\S]{0,200}removeAttribute\(userColorSchemaAttributeName\)/);
  assert.ok(!/setAttribute\(userColorSchemaAttributeName, getDefaultColorSchema\(\)\)/.test(colorSchemaJsCode),
    '仍在把系统偏好固化写进属性');
  assert.match(colorSchemaJsCode, /rootElement\.removeAttribute\(userColorSchemaAttributeName\)/);
  assert.match(colorSchemaJsCode, /systemPrefersDark\(\) \? 'dark' : 'light'/);
});

ok('§10-14：状态机 5 情形的静态不变量（两态 + 默认跟随系统）', () => {
  // ① 首次 dark / ② 首次 light：默认只由 matchMedia 决定
  assert.match(colorSchemaJsCode, /darkMediaQuery\s*=\s*'\(prefers-color-scheme: dark\)'/);
  assert.match(colorSchemaJsCode, /window\.matchMedia\(darkMediaQuery\)/);
  assert.match(colorSchemaJsCode, /return systemPrefersDark\(\) \? 'dark' : 'light'/);
  // ③ 未手动时系统切换跟随：change 监听存在，且只在属性不存在时同步 UI
  assert.match(colorSchemaJsCode, /mq\.addEventListener\('change', onChange\)|mq\.addListener\(onChange\)/);
  assert.match(colorSchemaJsCode, /if \(rootElement\.hasAttribute\(userColorSchemaAttributeName\)\) return/);
  // ④ 手动后不再随系统变：写属性 + LS 永久保留
  assert.match(colorSchemaJsCode, /else if \(hasManual \|\| schema\)[\s\S]{0,180}setAttribute\(userColorSchemaAttributeName, current\)/);
  assert.ok(!/getDefaultColorSchema\(\)\s*\)\s*\{[\s\S]{0,120}resetSchemaAttributeAndLS/.test(colorSchemaJsCode));
  // ⑤ 清除 LS 后回跟随：reset 同时删 LS 与属性
  assert.match(colorSchemaJsCode, /removeLS\(colorSchemaStorageKey\)/);
  // 无第三态
  assert.ok(!/['"]auto['"]/.test(colorSchemaJsCode), '代码里出现 auto 字面量');
});

ok('§10-15：首屏 FOUC 内联同步脚本在首个 CSS link 之前（两侧源码）', () => {
  const boot = /Fluid_Color_Scheme[\s\S]{0,200}data-user-color-scheme/;
  assert.match(headEjs, boot);
  assert.match(headAstro, boot);
  // Hexo：脚本出现在 css.ejs 引入之前
  assert.ok(headEjs.indexOf('Fluid_Color_Scheme') < headEjs.indexOf("partial('_partials/css.ejs')"),
    'Hexo 内联脚本晚于 css.ejs');
  // Astro：脚本出现在 <Styles> 之前
  assert.ok(headAstro.indexOf('darkModeBootScript') < headAstro.indexOf('<Styles'),
    'Astro 内联脚本晚于 <Styles>（首个 CSS link）');
  assert.match(headAstro, /darkModeEnable && <script is:inline/);
  assert.match(headEjs, /theme\.dark_mode && theme\.dark_mode\.enable/);
  // 只认两态
  assert.match(headEjs, /v === 'light' \|\| v === 'dark'/);
  assert.match(headAstro, /v === 'light' \|\| v === 'dark'/);
});

ok('§10-16：meta[name="theme-color"] 用 getComputedStyle 同步，跟随态也生效', () => {
  assert.match(colorSchemaJsCode, /function syncThemeColor\(\)/);
  assert.match(colorSchemaJsCode, /getComputedStyle\(rootElement\)\.getPropertyValue\('--navbar-bg-color'\)/);
  assert.match(colorSchemaJsCode, /meta\[name="theme-color"\]/);
  assert.match(colorSchemaJsCode, /setButtonIcon\(current\)[\s\S]{0,80}setHighlightCSS/);
  assert.match(colorSchemaJsCode, /syncThemeColor\(\);/);
  // 不再只在「属性存在」时才更新
  assert.ok(!/if \(document\.documentElement\.getAttribute\('data-user-color-scheme'\)\)[\s\S]{0,200}theme-color/.test(colorSchemaJsCode),
    'theme-color 仍被手动态条件挡住');
});

// ---------- 切换按钮 / 可访问性（§10 第 17–20 条） ----------

ok('§10-17：文案功能性、无新增口号 / 个人标识；两侧标签同源', () => {
  [['nav.ejs', navEjs], ['SiteNav.astro', siteNavAstro]].forEach(([name, src]) => {
    assert.match(src, /切换到深色模式/);
    assert.ok(!/开灯|关灯/.test(src), name + ' 仍有「开灯/关灯」旧文案');
  });
  assert.match(read('themes/fluid/languages/zh-CN.yml'), /light: '浅色'\s*\n\s*dark: '深色'/);
  assert.match(read('src/lib/i18n.ts'), /darkmode: \{ light: '浅色', dark: '深色' \}/);
});

ok('§10-18：切换按钮 DOM 无 emoji / 太阳月亮 / glow；focus-visible 口径不变', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  [navEjs, siteNavAstro].forEach((src) => {
    const block = src.slice(src.indexOf('id="color-toggle-btn"'), src.indexOf('id="color-toggle-btn"') + 500);
    assert.ok(!emoji.test(block), '切换按钮 DOM 含 emoji');
    assert.ok(!/太阳|月亮|sun|moon/i.test(block), '切换按钮含太阳/月亮字符');
    assert.ok(!/glow|gradient/i.test(block), '切换按钮含发光/渐变');
  });
  assert.match(siteCss, /#navbar button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  assert.match(siteCss, /outline-offset:\s*2px/);
});

ok('§10-19：导航下拉 margin-top: 0，切换按钮不进 dropdown-menu', () => {
  const rule = siteCssCode.match(/#navbar \.site-nav-list \.dropdown-menu\s*\{[^}]*\}/);
  assert.ok(rule, '缺 .dropdown-menu 规则');
  assert.match(rule[0], /margin-top:\s*0/);
  assert.match(rule[0], /padding:\s*0\.45rem/);
  assert.ok(!/id="color-toggle-btn"[\s\S]{0,80}dropdown-menu/.test(navEjs));
});

ok('§10-20：关闭态九宫格用 visibility:hidden 移出 Tab 序列（主题规则）', () => {
  const headerStyl = read('themes/fluid/source/css/_pages/_base/_widget/header.styl');
  assert.match(headerStyl, /visibility hidden/);
  assert.match(headerStyl, /&\.show[\s\S]{0,300}visibility visible/);
  assert.match(siteCss, /#mobile-grid-menu button\.mobile-grid-item/);
});

// ---------- 动效 / 页面（§10 第 21–24 条） ----------

ok('§10-21：过渡白名单只含颜色类属性、≤200ms；reduce 下全部 none', () => {
  const tr = darkCode.match(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?transition:\s*([^;]+);/);
  assert.ok(tr, '缺明暗过渡规则');
  const decl = tr[1];
  ['background-color', 'color', 'border-color', 'filter'].forEach((p) => assert.ok(decl.includes(p), '缺 ' + p));
  assert.ok(!/\b(?:margin|padding|width|height|font-size|border-radius|aspect-ratio|transform|opacity|top|left)\b/.test(decl),
    '过渡里混入布局 / 非白名单属性：' + decl);
  const times = (decl.match(/\.\d+s|0\.?\d*s|\d+ms/g) || []).map((t) =>
    t.endsWith('ms') ? parseInt(t, 10) : parseFloat(t) * 1000);
  assert.ok(times.length > 0 && times.every((t) => t <= 200), '过渡时长 >200ms 或取不到时长');
  assert.match(siteCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,300}transition:\s*none !important/);
  assert.match(siteCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,300}animation:\s*none !important/);
});

ok('§10-22：16:9 / 16:8 / 无图兜底仍在（静态结构，不替代实机三档截图）', () => {
  assert.match(siteCssCode, /\.cr-tile-cover\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(siteCssCode, /aspect-ratio:\s*16\s*\/\s*8/);
  assert.match(siteCssCode, /\.cr-tile-cover--none\s*\{/);
  assert.ok(!/aspect-ratio/.test(darkCode), '暗态段改了 aspect-ratio');
});

ok('§10-23：照片 mask 渐变结构保持、未被削弱', () => {
  const lightFeature = siteCssCode.match(/\.wall-feature-mask\s*\{[^}]*\}/);
  const lightCell = siteCssCode.match(/\.wall-cell-mask\s*\{[^}]*\}/);
  assert.ok(lightFeature && lightCell, '浅态 mask 规则丢失');
  assert.match(lightFeature[0], /rgba\(27, 23, 18, 0\.82\)/);
  assert.match(lightCell[0], /rgba\(27, 23, 18, 0\.82\)/);
  assert.match(darkCode, /\.wall-feature-mask\s*\{[^}]*rgba\(27,23,18,\.82\)/);
  assert.match(darkCode, /\.wall-cell-mask\s*\{[^}]*rgba\(27,23,18,\.82\)/);
  assert.match(darkCode, /rgba\(217,119,87,\.10\)/);
  assert.match(siteCssCode, /\.wall-cell-mask ~ \.wall-cell-body\s*\{[^}]*#fdfaf4/);
});

ok('§10-24：comments 段保持 enable: false，模板无新增 UGC 元素', () => {
  const seg = configYml.slice(configYml.indexOf('  comments:'), configYml.indexOf('  comments:') + 400);
  assert.match(seg, /enable:\s*false/);
  assert.ok(!/<form|giscus|utterances|disqus/i.test(navEjs + siteNavAstro), '导航出现 UGC / 评论元素');
});

ok('文档同步：DESIGN-LANGUAGE §2.5 已改为启用并保留冷蓝组禁令；方案头部已确认', () => {
  const sec25 = designLang.slice(designLang.indexOf('### 2.5 暗色模式规则'), designLang.indexOf('### 2.6'));
  assert.ok(designLang.indexOf('### 2.5 暗色模式规则') > -1, '§2.5 缺失');
  assert.match(sec25, /2026-11-09 主人确认启用，全量校准完成/);
  assert.ok(!/禁止启用/.test(sec25), '§2.5 仍写着禁止启用');
  assert.match(sec25, /Fluid 原厂 `_dark` 冷蓝组一个都不能用/);
  assert.match(designLang, /\| \*\*已清除\*\*（2026-11-09 全量校准/);
  assert.match(proposal, /已确认（2026-11-09 主人整组采纳 D1–D13）/);
});

ok('npm test 已串入 test:darkmode', () => {
  assert.ok(pkg.scripts['test:darkmode'], 'package.json 缺 test:darkmode');
  assert.ok(pkg.scripts.test.includes('test:darkmode'), 'npm test 未串入 darkmode 套件');
});

// ---------- 配置源存活（4 条：防「Hexo 已下线」误删仍在被 Astro 读取的主题目录） ----------

const yaml = require('js-yaml');
const THEME_CFG_REL = 'themes/fluid/_config.yml';
const themeCfg = yaml.load(read(THEME_CFG_REL));
// 17 个在 _config.yml 的 color 段，另有 2 个在 _variables/base.styl，合计 19 个 *_dark
const EXPECT_DARK = {
  body_bg_color_dark: '#1a1814',
  navbar_bg_color_dark: 'rgba(36,32,25,.62)',
  navbar_text_color_dark: '#e5ded2',
  subtitle_color_dark: '#b3aa9c',
  text_color_dark: '#e5ded2',
  sec_text_color_dark: '#b3aa9c',
  board_color_dark: '#242019',
  post_text_color_dark: '#e5ded2',
  post_heading_color_dark: '#e5ded2',
  post_link_color_dark: '#d97757',
  link_hover_color_dark: '#eea883',
  link_hover_bg_color_dark: 'rgba(217,119,87,.12)',
  line_color_dark: '#413a30',
  scrollbar_color_dark: '#4a4238',
  scrollbar_hover_color_dark: '#6b6255',
  button_bg_color_dark: 'transparent',
  button_hover_bg_color_dark: 'rgba(229,222,210,.06)',
};

ok('配置源存活 1/4：themes/fluid/_config.yml 存在且可解析', () => {
  assert.ok(exists(THEME_CFG_REL), 'themes/fluid/_config.yml 不存在——主题目录被误删');
  assert.ok(themeCfg && typeof themeCfg === 'object', '主题配置无法解析为对象');
  assert.ok(themeCfg.dark_mode && themeCfg.color, '主题配置缺 dark_mode / color 段');
});

ok('配置源存活 2/4：dark_mode.enable === true', () => {
  assert.strictEqual(themeCfg.dark_mode.enable, true, 'dark_mode.enable 不是 true');
  assert.strictEqual(themeCfg.dark_mode.default, 'auto');
});

ok('配置源存活 3/4：19 个 *_dark 校准值齐全', () => {
  Object.keys(EXPECT_DARK).forEach((k) => {
    assert.strictEqual(themeCfg.color[k], EXPECT_DARK[k], `_config.yml 的 ${k} 缺失或漂移`);
  });
  const ymlKeys = Object.keys(themeCfg.color).filter((k) => k.endsWith('_dark'));
  assert.strictEqual(ymlKeys.length, 17, 'color 段的 *_dark 键数不是 17');
  // 2 个在 _variables/base.styl
  assert.match(baseStyl, /\$highlight-bg-color-dark\s*=\s*#242019/);
  assert.match(baseStyl, /\$inlinecode-bg-color-dark\s*=\s*rgba\(229, 222, 210, \.10\)/);
});

ok('配置源存活 4/4：site-config.ts 引用主题配置、prepare-assets.mjs 的 THEME 指向 themes/fluid', () => {
  const siteCfg = read('src/lib/site-config.ts');
  assert.match(siteCfg, /themes['"]\s*,\s*['"]fluid['"]\s*,\s*['"]_config\.yml['"]/,
    'src/lib/site-config.ts 不再引用 themes/fluid/_config.yml');
  assert.match(siteCfg, /darkModeEnable\s*=\s*Boolean\(themeConfig\.dark_mode\?\.enable\)/);
  const prep = read('tools/prepare-assets.mjs');
  assert.match(prep, /const THEME\s*=\s*path\.join\(ROOT,\s*['"]themes['"]\s*,\s*['"]fluid['"]\)/,
    'prepare-assets.mjs 的 THEME 常量不再指向 themes/fluid');
  assert.match(prep, /readYaml\(path\.join\(THEME,\s*['"]_config\.yml['"]\)\)/);
  // 6 个 Astro 构建输入文件必须存在
  ['themes/fluid/_config.yml',
    'themes/fluid/source/css/_variables/base.styl',
    'themes/fluid/source/css/_pages/_base/color-schema.styl',
    'themes/fluid/source/js/color-schema.js',
    'themes/fluid/source/css/main.styl',
    'themes/fluid/source/css/_pages/_base/_widget/qrcode.styl'].forEach((f) => {
    assert.ok(exists(f), 'Astro 构建输入缺失：' + f);
  });
});

ok('暗态段硬边界标记唯一、年历页修补全部落在边界内（供 hunk 级隔离）', () => {
  const START = '/* ===== 15. 暗色模式（2026-11-09，本任务） ===== */';
  const END = '/* ===== /15. 暗色模式（本任务结束） ===== */';
  assert.strictEqual(siteCss.split(START).length - 1, 1, '起始边界标记不唯一或缺失');
  assert.strictEqual(siteCss.split(END).length - 1, 1, '结束边界标记不唯一或缺失');
  const a = siteCss.indexOf(START);
  const b = siteCss.indexOf(END);
  assert.ok(a > -1 && b > a, '边界标记顺序不对');
  const seg = siteCss.slice(a, b);
  assert.ok(seg.length > 1000, '边界内暗态段为空——取样失效');
  // 年历页暗态修补必须全部在 §15 边界内，且不得出现组件文件名 / 段号引用
  assert.ok(seg.includes('.hy-yearpick-panel'), '§15 缺年历页暗态修补');
  assert.ok(!seg.includes('HolidaysPage'), '§15 内混入组件文件名');
  assert.ok(!seg.includes('4.12b'), '§15 内混入段号引用');
});

// ---------- 年历页暗态修补（验收阻塞项：浅底亮字 1.28:1） ----------
// 只在 §15 两个成对分支内覆盖；4.12b 原段任何一行都不改。

const SEC15_START = '/* ===== 15. 暗色模式（2026-11-09，本任务） ===== */';
const SEC15_END = '/* ===== /15. 暗色模式（本任务结束） ===== */';
const SEC15_A = siteCss.indexOf(SEC15_START);
const SEC15_B = siteCss.indexOf(SEC15_END);
const SEC15_RAW = SEC15_A === -1 || SEC15_B === -1 ? '' : siteCss.slice(SEC15_A, SEC15_B);
const FOLLOW_AT = SEC15_RAW.indexOf('@media (prefers-color-scheme: dark)');
const MANUAL_AT = SEC15_RAW.indexOf('@media not print');
const FOLLOW_SEG = FOLLOW_AT === -1 ? '' : SEC15_RAW.slice(FOLLOW_AT, MANUAL_AT === -1 ? undefined : MANUAL_AT);
const MANUAL_SEG = MANUAL_AT === -1 ? '' : SEC15_RAW.slice(MANUAL_AT);

const HY_SELECTORS = [
  '.hy-yearpick-panel',
  '.hy-stats li',
  '.hy-card-media',
  '.hy-tag',
  '.hy-kind',
  '.hy-kind--accent',
];
const HY_LARGE = ['.hy-yearpick-panel', '.hy-stats li', '.hy-card-media'];
const HY_CHIPS = ['.hy-tag', '.hy-kind', '.hy-kind--accent'];
// 2026-11-11 Phase 4A：两份分支的选择器条件层已做最小扩展（声明块逐字不动），
// 判据随之适配；「两分支各 ≥5 条覆盖」「5 类选择器显式 background/color」的实质
// 与 WCAG 逐项实测一条不删，另补正向断言锁死时间层条件确实落在两分支里。
const HY_BRANCHES = [
  ['跟随系统分支', FOLLOW_SEG, ':root:not([data-user-color-scheme]):not([data-sun-scheme])'],
  ['手动选择分支', MANUAL_SEG, '[data-user-color-scheme="dark"]'],
];

ok('年历页修补（Phase 4A）：两分支都含时间层条件，声明块未漂移', () => {
  HY_BRANCHES.forEach(([name, seg, prefix]) => {
    // 分支① 用 :not 压制系统兜底；分支② 用逗号并列让时间态复用暗色声明
    assert.ok(seg.includes(name === '跟随系统分支' ? ':not([data-sun-scheme])'
      : '[data-sun-scheme="dark"]'), name + ' 缺时间层条件');
    assert.ok(seg.includes('data-user-color-scheme'), name + ' 原有手动属性条件丢失');
    const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.ok(new RegExp(esc + ' \\.hy-').test(seg), name + ' 扩展前缀与取样失配');
  });
  // 分支② 每条 .hy-* 规则都必须有逗号并列的时间态副本，且暗态段不引入新伪类
  assert.ok(!/:is\(/.test(darkCode), '暗态段引入了 :is()（自写 minifier 有 E-064 前科）');
  const manualPairs = (MANUAL_SEG.match(
    /\[data-sun-scheme="dark"\]:not\(\[data-user-color-scheme\]\) \.hy-/g) || []).length;
  assert.ok(manualPairs >= 6, '分支② 时间态 .hy-* 并列副本不足：' + manualPairs);
  // 既有字面量命中数不减（A8）：两套成对分支完整保留
  [':root:not([data-user-color-scheme])', '[data-user-color-scheme="dark"]',
    '@media (prefers-color-scheme: dark)', '@media not print'].forEach((lit) => {
    assert.ok(darkCode.includes(lit), '暗态段丢失字面量：' + lit);
  });
});

function hyRuleBody(seg, prefix, selector) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 分支② 已改逗号并列选择器，故允许原选择器后跟 , + 时间态副本，再进入声明块
  const re = new RegExp(esc(prefix) + ' ' + esc(selector) + '[^{]*\\{([^}]*)\\}');
  const m = re.exec(seg);
  return m ? m[1] : null;
}

ok('年历页修补 1/4：§15 两个分支各含 ≥5 条 .hy-* 覆盖规则', () => {
  HY_BRANCHES.forEach(([name, seg, prefix]) => {
    const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const n = (seg.match(new RegExp(esc + ' \\.hy-', 'g')) || []).length;
    assert.ok(n >= 5, name + ' 只有 ' + n + ' 条 .hy-* 覆盖规则（要求 ≥5）');
  });
});

ok('年历页修补 2/4：5 类选择器在两个分支都有显式 background/color 覆盖', () => {
  HY_BRANCHES.forEach(([name, seg, prefix]) => {
    HY_SELECTORS.forEach((sel) => {
      const body = hyRuleBody(seg, prefix, sel);
      assert.ok(body, name + ' 缺 ' + sel + ' 覆盖规则');
      assert.ok(/background\s*:/.test(body) || /color\s*:/.test(body),
        name + ' 的 ' + sel + ' 没有显式 background/color');
      if (HY_LARGE.includes(sel)) {
        assert.ok(!body.includes('--cream-on-dark'),
          name + ' 的 ' + sel + ' 仍在裸用 --cream-on-dark 作大面积面板底');
        assert.match(body, /background:\s*#242019/, name + ' 的 ' + sel + ' 暗面板底不对');
        assert.match(body, /color:\s*var\(--text-color\)/, name + ' 的 ' + sel + ' 文字未走亮纸字');
      }
      if (HY_CHIPS.includes(sel)) {
        assert.match(body, /background:\s*#fdfaf4/, name + ' 的 ' + sel + ' 纸片底不对');
        assert.match(body, /color:\s*#1b1712/, name + ' 的 ' + sel + ' 字色未改墨');
      }
    });
  });
});

ok('年历页修补 3/4：暗态字色对其底全部 ≥4.5:1（WCAG，逐项实测）', () => {
  const text = themeDark('text_color_dark');
  const sec = themeDark('sec_text_color_dark');
  assert.strictEqual(text, '#e5ded2', 'text_color_dark 漂移，WCAG 取值失效');
  assert.strictEqual(sec, '#b3aa9c', 'sec_text_color_dark 漂移，WCAG 取值失效');
  const PAIRS = [
    ['.hy-yearpick-panel 正文', text, '#242019'],
    ['.hy-yearpick-panel 次级', sec, '#242019'],
    ['.hy-stats li 正文', text, '#242019'],
    ['.hy-stats li 次级', sec, '#242019'],
    ['.hy-card-media 正文', text, '#242019'],
    ['.hy-card-media 次级', sec, '#242019'],
    ['.hy-tag', '#1b1712', '#fdfaf4'],
    ['.hy-kind', '#1b1712', '#fdfaf4'],
    ['.hy-kind--accent', '#1b1712', '#fdfaf4'],
  ];
  const bad = [];
  PAIRS.forEach(([label, fg, bg]) => {
    const c = contrast(fg, bg);
    if (c < 4.5) bad.push(`${label} ${fg} on ${bg} = ${c.toFixed(2)}:1`);
  });
  assert.deepStrictEqual(bad, [], '不满足 AA：\n    ' + bad.join('\n    '));
});

ok('年历页修补 4/4：4.12b 原段零改动（HEAD 逐字比对 + git diff -U0 校验）', () => {
  const head = gitShowLF('source/css/site.css');
  const grab = (s) => {
    const a = s.indexOf('/* ---- 4.12b');
    const b = s.indexOf('/* ===== 4.13', a);
    assert.ok(a > -1 && b > a, '找不到 4.12b 段的起止锚点');
    return s.slice(a, b);
  };
  const headSeg = grab(head);
  const curSeg = lf(grab(siteCss));
  // 主理人已批准保留的唯一一处 4.12b 改动：calc 等价改写（归属并行年历段，非本次修补）。
  // 该改动已在 4bef1e8 随节假日图例一并提交，HEAD 里同样是改写后的形态——
  // 原来「把 cur 改回 calc 再和 HEAD 比」的写法只适用于它还在工作区的时候，
  // 提交后会恒等失败（E-137）。现在直接逐字比对，并单独确认改写没被删掉。
  const APPROVED = /  \/\* E-064：[\s\S]*?无加法 calc。 \*\/\n  top: 100%;\n  margin-top: \.45rem;\n/;
  assert.match(curSeg, APPROVED, '4.12b 里已批准的 calc 等价改写被改掉或删除');
  assert.strictEqual(curSeg, headSeg,
    '4.12b 段出现了本任务新增的改动——暗态修补必须只写在 §15');

  // 附加机制：git diff -U0 落在 4.12b 行区间的 hunk 只能是那一处已批准的 calc 改写
  const diff = execFileSync('git', ['diff', '-U0', '--', 'source/css/site.css'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const lines = siteCss.split('\n');
  const secA = lines.findIndex((l) => l.includes('/* ---- 4.12b')) + 1;
  const secB = lines.findIndex((l, i) => i > secA && l.includes('/* ===== 4.13')) + 1;
  assert.ok(secA > 0 && secB > secA, '4.12b 行区间计算失败');
  const hunks = diff.split('\n').filter((l) => l.startsWith('@@'));
  const inSec = hunks.filter((h) => {
    const m = h.match(/\+(\d+)/);
    return m && Number(m[1]) >= secA && Number(m[1]) <= secB;
  });
  assert.ok(inSec.length <= 1,
    '4.12b 段出现多于 1 个 diff hunk，本任务可能新增了 4.12b 改动：' + inSec.join(' | '));
  // 本任务新增的暗态字面值绝不能出现在 4.12b 段
  ['background: #242019', 'color: #1b1712'].forEach((decl) => {
    assert.ok(!curSeg.includes(decl), '4.12b 段混入了本任务的暗态声明：' + decl);
  });
});

// ---------- 构建产物（§10 第 10 / 12 / 15 / 29 条） ----------
// 线上一直走 Astro（vercel.json: buildCommand=npm run astro:build / outputDirectory=dist）。
// 724fc3f 下线的是 Hexo CLI 与页面生成器，public/ 不再是上线产物。
// 故验收对象只取 dist/ 与 static-public/，且文件不存在即 FAIL，不许 SKIP。

const ASTRO_HTML = [
  ['dist/index.html', 'dist/index.html'],
];
for (const [name, rel] of ASTRO_HTML) {
  ok(name + '：产物存在且字节数 > 0（E-029 / 硬断言）', () => {
    assert.ok(exists(rel), name + ' 不存在——Astro 产物缺失，禁止 SKIP');
    assert.ok(fs.statSync(path.join(ROOT, rel)).size > 0, '产物 0 字节');
  });
  const html = exists(rel) ? read(rel) : '';
  ok(name + '：data-default-color-scheme 存在', () => {
    assert.match(html, /data-default-color-scheme="auto"/);
  });
  ok(name + '：顶栏切换按钮恰好 1 处、九宫格切换按钮 0 处（2026-11-11 修订）', () => {
    assert.strictEqual((html.match(/id="color-toggle-btn"/g) || []).length, 1);
    assert.strictEqual((html.match(/id="mobile-color-toggle-btn"/g) || []).length, 0);
  });
  ok(name + '：highlight-css-dark link 存在', () => {
    assert.match(html, /id="highlight-css-dark"/);
  });
  ok(name + '：首屏 FOUC 内联脚本早于首个 CSS link 且只认两态', () => {
    const boot = html.indexOf('Fluid_Color_Scheme');
    const firstCss = html.search(/<link[^>]+rel="stylesheet"/);
    assert.ok(boot > -1, '缺内联暗态判定脚本');
    assert.ok(firstCss > -1, '找不到首个 CSS link');
    assert.ok(boot < firstCss, 'FOUC 脚本晚于首个 CSS link');
    assert.match(html, /v === 'light' \|\| v === 'dark'/);
  });
}

const ASTRO_CSS = [
  ['dist/css/site.css', 'dist/css/site.css'],
  ['dist/css/main.css', 'dist/css/main.css'],
  ['static-public/css/main.css', 'static-public/css/main.css'],
];
for (const [name, rel] of ASTRO_CSS) {
  ok(name + '：产物存在（硬断言，禁止 SKIP）', () => {
    assert.ok(exists(rel), name + ' 不存在——Astro 产物缺失');
    assert.ok(fs.statSync(path.join(ROOT, rel)).size > 0, name + ' 为 0 字节');
  });
  const css = exists(rel) ? read(rel) : '';
  ok(name + '：含三种暗态选择器', () => {
    assert.match(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);
    assert.match(css, /:root:not\(\[data-user-color-schema\]\)|:root:not\(\[data-user-color-scheme\]\)/);
    assert.match(css, /\[data-user-color-scheme="dark"\]/);
  });
}

// 暗色高亮样式必须是真编译出来的（旧假设 dark=false 会产出 0 字节文件）
ok('dist/css/highlight-dark.css 非 0 字节（旧 dark=false 假设已清除 / 硬断言）', () => {
  const rel = 'dist/css/highlight-dark.css';
  assert.ok(exists(rel), rel + ' 不存在——Astro 产物缺失');
  assert.ok(fs.statSync(path.join(ROOT, rel)).size > 0,
    '暗态代码高亮仍是 0 字节：prepare-assets 没有真正编译 dark.css');
});

// ==========================================================================
// Phase 4A 验收口径 A1–A10（2026-11-11，时间驱动日夜模式）
// 同步断言照常执行；运行时状态机用 vm 注入 stub 的时钟 / 存储 / 网络，需 await
// microtask 排空，故放在末尾的 async 段里，RESULT 也随之移到段尾输出。
// ==========================================================================

const DAY = 86400000;
const HOUR = 3600000;
const BASE = 1762800000000;
const CACHE_FIXTURE = {
  date: '2026-11-11',
  sunrise: BASE,
  sunset: BASE + 10 * HOUR,
  fp: 'a1b2c3d4',
};
const CACHE_RAW = JSON.stringify(CACHE_FIXTURE);
const API_OK = {
  available: true,
  date: CACHE_FIXTURE.date,
  sunrise: CACHE_FIXTURE.sunrise,
  sunset: CACHE_FIXTURE.sunset,
  fp: CACHE_FIXTURE.fp,
};

console.log('\nPhase 4A 验收口径 A1–A14（三层：手动 > 时间层 > 系统层兜底）');

// ---------- R-B：时间计算隔离（§10-13 / §10-14 原断言一条未改，正向断言全部新增） ----------

ok('R-B：时间计算整体在独立模块；color-schema.js 只暴露统一 UI 同步入口', () => {
  assert.ok(exists('themes/fluid/source/js/sun-scheme.js'), '缺独立时间层模块');
  assert.ok(!/computeScheme|sunTimesUTC|sunrise|sunset|getHours/.test(colorSchemaJsCode),
    '时间计算被搬进 color-schema.js');
  assert.match(colorSchemaJsCode, /document\.addEventListener\('kasai:sun-scheme'/);
  assert.match(sunSchemeJsCode, /function computeScheme\(c, now\)/);
  assert.match(sunSchemeJsCode, /now >= c\.sunrise && now < c\.sunset/);
  assert.ok(!/getHours|18:00|6:00|hours\s*>=\s*18|hours\s*<=\s*6/.test(sunSchemeJsCode),
    '独立模块仍有硬编码钟点兜底');
  // 校正：getDefaultColorSchema() 语义不变，不在 color-schema.js 内维护时间层状态
  assert.match(colorSchemaJsCode, /return systemPrefersDark\(\) \? 'dark' : 'light'/);
  assert.ok(!/effectiveSunScheme|sunSchemeActive/.test(colorSchemaJsCode),
    'color-schema.js 仍维护时间层状态变量');
  // 改写后仍能抓到硬编码钟点兜底（A13）
  ['18:00', '6:00', 'hours >= 18', 'hours <= 6'].forEach((lit) => {
    const mutated = sunSchemeJsCode.replace('function computeScheme', lit + '\nfunction computeScheme');
    assert.ok(/18:00|6:00|hours\s*>=\s*18|hours\s*<=\s*6/.test(mutated), '钟点兜底检测失效：' + lit);
  });
});

ok('§2.6 / A12：两态不变、matchMedia 压制走 DOM 标记、toggle 读当前生效态', () => {
  assert.match(siteCss, /:not\(\[data-sun-scheme\]\)/);
  assert.ok(!/setAttribute\([^)]*data-user-color-scheme/.test(sunSchemeJsCode), '时间层写了手动属性');
  assert.match(sunSchemeJsCode, /setAttribute\(TIME_ATTR, scheme\)/);
  assert.match(colorSchemaJsCode, /if \(rootElement\.hasAttribute\('data-sun-scheme'\)\) return/);
  assert.match(colorSchemaJsCode, /var sunScheme = rootElement\.getAttribute\('data-sun-scheme'\)/);
  assert.match(colorSchemaJsCode, /currentSetting = invertColorSchemaObj\[sunScheme\]/);
  assert.ok(!/['"]auto['"]/.test(sunSchemeJsCode), '独立模块出现 auto 模式字面量');
  assert.ok(!/['"]auto['"]/.test(colorSchemaJsCode), 'color-schema.js 出现 auto 字面量');
  assert.match(configYml, /default:\s*auto/);
  assert.match(baseLayoutAstro, /data-default-color-scheme=\{darkModeEnable/);
  assert.match(headEjs, /v === 'light' \|\| v === 'dark'/);
  assert.match(headAstro, /v === 'light' \|\| v === 'dark'/);
});

// ---------- A11–A14 ----------

ok('A11/A12：§10-12 / §10-15 / §10-21 断言段与 HEAD 逐字一致（一条不改）', () => {
  const headTest = execFileSync('git', ['show', 'HEAD:test/darkmode-e2e.js'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const cur = read('test/darkmode-e2e.js');
  const seg = (s, a, b) => {
    const i = s.indexOf("ok('" + a);
    const j = s.indexOf("ok('" + b, i);
    return i === -1 || j === -1 ? '' : s.slice(i, j);
  };
  // §10-12 含 l.370–371（写入值只含 light/dark）；§10-15 含 l.448–449（只认两态）；
  // §10-21 含 l.503–515（过渡白名单 / ≤200ms / reduce 下 none !important）
  [['§10-12', '§10-13'], ['§10-15', '§10-16'], ['§10-21', '§10-22']].forEach(([a, b]) => {
    const h = seg(headTest, a, b);
    assert.ok(h.length > 100, a + ' HEAD 断言段取样失效');
    assert.strictEqual(seg(cur, a, b), h, a + ' 断言段被改写');
  });
  assert.match(siteCss, /transition:\s*none !important/);
  assert.match(siteCss, /animation:\s*none !important/);
  assert.match(cur, /times\.length > 0 && times\.every\(\(t\) => t <= 200\)/);
});

ok('A11：过渡口径沿用 §10-21 一条不改（过渡段与 HEAD 逐字一致）', () => {
  const headCss = gitShowLF('source/css/site.css');
  const grab = (s) => {
    const a = s.indexOf('@media (prefers-reduced-motion: no-preference)');
    const b = s.indexOf('/* ===== /15. 暗色模式', a);
    return a === -1 || b === -1 ? '' : s.slice(a, b);
  };
  assert.ok(grab(lf(siteCss)).length > 100, '过渡段取样失效');
  assert.strictEqual(grab(lf(siteCss)), grab(headCss), '明暗过渡段被改动');
  assert.match(siteCss, /transition:\s*none !important/);
  assert.match(siteCss, /animation:\s*none !important/);
  ['background-color', 'color', 'border-color', 'filter'].forEach((p) => {
    assert.ok(grab(siteCss).includes(p), '过渡白名单缺 ' + p);
  });
});

ok('A13：§10-13 / §10-14 与 HEAD 逐字一致（改写数 = 0，只新增）', () => {
  const headTest = execFileSync('git', ['show', 'HEAD:test/darkmode-e2e.js'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const grab = (s) => {
    const a = s.indexOf("ok('§10-13");
    const b = s.indexOf("ok('§10-15", a);
    return a === -1 || b === -1 ? '' : s.slice(a, b);
  };
  assert.ok(grab(headTest).length > 500, 'HEAD 断言段取样失效');
  const curTest = read('test/darkmode-e2e.js');
  assert.strictEqual(grab(curTest), grab(headTest),
    '§10-13 / §10-14 被改写（应为逐字原样）');
  // l.409–415 / l.432 / l.435–450 / §10-16~24 等既有断言段一条不删
  ['§10-15', '§10-16', '§10-17', '§10-18', '§10-19', '§10-20',
    '§10-21', '§10-22', '§10-23', '§10-24', '文档同步', 'npm test 已串入']
    .forEach((n) => assert.ok(curTest.includes("ok('" + n), '丢了既有断言段 ' + n));
  // 关键禁令仍逐条可执行
  ['!/getHours/', '!/new Date/', "!/['\"]auto['\"]/",
    '/if \\(rootElement\\.hasAttribute\\(userColorSchemaAttributeName\\)\\) return/']
    .forEach((lit) => assert.ok(read('test/darkmode-e2e.js').includes(lit.replace(/\\\//g, '/')),
      '丢了一条原断言：' + lit));
});

ok('A14：反 AI 味——新增可见 DOM / 文案 / CSS 声明层无 glow|gradient|emoji|太阳|月亮', () => {
  // 口径：§10-18 针对切换按钮 DOM 与视觉层文案；标识符命名
  //（sun-scheme.js / data-sun-scheme / sunrise / sunset / api/sun-times）是技术命名，
  // 不是可见 UI 文案，按 §6 反 AI 味清单不属约束范围。
  const visual = /glow|gradient|emoji|太阳|月亮|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/iu;
  // 只查本次 diff 的新增行：head.ejs 既有技术注释里的 ⚠️ 不是视觉元素，不应误伤
  ['src/components/Head.astro', 'themes/fluid/layout/_partials/head.ejs',
    'src/components/SiteNav.astro', 'themes/fluid/layout/_partials/site/nav.ejs']
    .forEach((rel) => {
      const d = execFileSync('git', ['diff', '-U0', '--', rel],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      d.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).forEach((l) => {
        assert.ok(!visual.test(l), rel + ' 新增行出现反 AI 味视觉词：' + l.trim());
      });
    });
  const diff = execFileSync('git', ['diff', '-U0', '--', 'source/css/site.css'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).forEach((l) => {
    assert.ok(!/gradient|glow|emoji|太阳|月亮/i.test(l), 'CSS 新增行含渐变/发光：' + l.trim());
  });
  [['nav.ejs', navEjs], ['SiteNav.astro', siteNavAstro]].forEach(([name, src]) => {
    const block = src.slice(src.indexOf('id="color-toggle-btn"'),
      src.indexOf('id="color-toggle-btn"') + 500);
    assert.ok(!visual.test(block) && !/sun|moon/i.test(block), name + ' 按钮 DOM 含反 AI 味元素');
  });
});

ok('资源管线：prepare-assets 复制新模块，产物里 /js/sun-scheme.js 带内容 hash 版本号', () => {
  assert.match(headAstro, /src="\/js\/sun-scheme\.js"/);
  assert.match(headEjs, /'sun-scheme\.js', 'defer'/);
  assert.match(prepareAssets, /THEME, 'source', 'js'/);
  assert.ok(exists('static-public/js/sun-scheme.js'), 'static-public 缺新模块');
  if (!exists('dist/index.html')) return;      // 产物不存在时静态断言已覆盖
  const html = read('dist/index.html');
  const m = /src="\/js\/sun-scheme\.js\?v=([0-9a-f]{8})"/.exec(html);
  assert.ok(m, '产物里新脚本未盖 ?v=hash（/js/(.*) 是 immutable 一年缓存）');
  const want = crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'dist/js/sun-scheme.js')))
    .digest('hex').slice(0, 8);
  assert.strictEqual(m[1], want, '产物版本号与盘上内容 hash 不一致');
});

ok('缓存只用于首屏 boot；异步模块每次页面加载都请求一次接口并覆盖缓存', () => {
  assert.match(sunSchemeJsCode, /function enterAuto\(\)[\s\S]{0,900}refresh\(\);/,
    'enterAuto 未无条件请求接口（缓存有效时跳过请求会让跨天数据长期不刷新）');
  assert.match(sunSchemeJsCode, /setLS\(CACHE_KEY, JSON\.stringify\(c\)\)/);
  assert.match(sunSchemeJsCode, /if \(hasManual\(\)\) return;\s*if \(typeof fetch/,
    'refresh 未在手动态短路');
  const astroBoot = (headAstro.match(/const darkModeBootScript = `([\s\S]*?)`;/) || [])[1] || '';
  assert.ok(!/fetch|await|Promise|setTimeout|async/.test(astroBoot), '首屏 boot 发了请求');
});

ok('端点只读声明与公式出处（不写库 / 不写文件 / 不外发 / 不记录日志）', () => {
  assert.match(sunTimesApi, /本端点只读、无副作用、不返回任何请求头原始值/);
  assert.match(sunTimesApi, /不写数据库、不写文件/);
  assert.match(sunTimesApi, /不调外部服务、不记录访问日志/);
  assert.match(sunTimesApi, /访客 IP 不外发任何第三方/);
  assert.match(sunTimesApi, /gml\.noaa\.gov\/grad\/solcalc\/calcdetails\.html/);
  assert.match(sunTimesApi, /Meeus/);
  assert.match(sunTimesApi, /methods: \['GET'\], body: false, origin: false, auth: false/);
  // 端点不引入任何第三方依赖（只用 Node 内置）
  assert.ok(!/require\(['"](?!node:|\.\/|_lib\/)/.test(sunTimesApi), '端点引入第三方依赖');
});

// ---------- A1 / A2 / A3：三层优先级与手动属性唯一写入者 ----------

ok('A3：属性唯一写入者——setAttribute 写 data-user-color-scheme 只落在 3 处，时间层模块 0 处', () => {
  const scanDirs = ['src', 'themes/fluid/source/js', 'themes/fluid/layout/_partials', 'api', 'tools'];
  const writeRe = /setAttribute\(\s*['"]data-user-color-scheme['"]|setAttribute\(userColorSchemaAttributeName/;
  const hits = [];
  function walk(dir) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.join(dir, ent.name);
      const p = path.join(ROOT, rel);
      if (ent.isDirectory()) { walk(rel); continue; }
      if (!/\.(js|astro|ejs|ts|mjs|css)$/.test(ent.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      const n = (src.match(new RegExp(writeRe.source, 'g')) || []).length;
      if (n) hits.push([rel.replace(/\\/g, '/'), n]);
    }
  }
  scanDirs.forEach(walk);
  const files = hits.map(([f]) => f).sort();
  assert.deepStrictEqual(files, [
    'src/components/Head.astro',
    'themes/fluid/layout/_partials/head.ejs',
    'themes/fluid/source/js/color-schema.js',
  ], '手动属性写入者集合漂移：' + JSON.stringify(hits));
  assert.strictEqual((sunSchemeJsCode.match(new RegExp(writeRe.source, 'g')) || []).length, 0,
    '时间层模块写了手动属性');
  assert.ok(!/setAttribute\(MANUAL_ATTR/.test(sunSchemeJsCode), '时间层模块用常量名绕过了写入判据');
});

ok('A1：CSS 两分支按逗号并列展开（含手动属性守卫），时间态 dark 复用手动分支声明', () => {
  // 按主理人机械等价展开：:is(A, B) → A, B；零 :is()，零兼容风险
  const PARALLEL = /\[data-user-color-scheme="dark"\],\s*\[data-sun-scheme="dark"\]:not\(\[data-user-color-scheme\]\)/;
  assert.match(darkCode, PARALLEL);
  // 分支①：追加 :not([data-sun-scheme])，时间层生效时系统兜底分支完全不参与
  assert.match(darkCode, /:root:not\(\[data-user-color-scheme\]\):not\(\[data-sun-scheme\]\)/);
  assert.ok(!/:is\(/.test(darkCode), '暗态段引入了 :is() 新伪类');
  assert.match(darkCode, /@media \(prefers-color-scheme: dark\)/);
  assert.match(darkCode, /@media not print/);
  // 同一扩展同步到 main.css 与 qrcode.styl 的源
  const styl = read('themes/fluid/source/css/_pages/_base/color-schema.styl');
  const qr = read('themes/fluid/source/css/_pages/_base/_widget/qrcode.styl');
  assert.match(styl, /:root:not\(\[data-user-color-scheme\]\):not\(\[data-sun-scheme\]\)/);
  assert.match(styl, PARALLEL);
  assert.match(qr, /\[data-user-color-scheme="dark"\] \.qr-img,\s*\[data-sun-scheme="dark"\]:not\(\[data-user-color-scheme\]\) \.qr-img/);
  assert.ok(!/:is\(/.test(styl + qr), 'styl 源引入了 :is() 新伪类');
  // 手动态残留由 CSS 守卫 + JS 清除双保险
  assert.match(sunSchemeJsCode, /function stopForManual\(\)/);
  assert.match(sunSchemeJsCode, /removeAttribute\(TIME_ATTR\)/);
});

ok('A14 补充：产物侧锁死 dist/css/site.css 与 dist/css/main.css 的 :is( 计数 == 0', () => {
  // 防复发：自写 minifier 与后续改动都不得把 :is() 带回产物
  ['dist/css/site.css', 'dist/css/main.css'].forEach((rel) => {
    assert.ok(exists(rel), rel + ' 不存在，产物侧判据失效');
    const c = read(rel);
    assert.strictEqual((c.match(/:is\(/g) || []).length, 0, rel + ' 残留 :is() 伪类');
    assert.ok(/data-sun-scheme/.test(c), rel + ' 缺时间层选择器');
    assert.ok(/\[data-user-color-scheme="dark"\]/.test(c), rel + ' 丢原有手动分支');
  });
});

ok('A14 补充 2：site.css 全文 / 两份 styl 全文 / static-public/css/*.css 均 :is( 零命中', () => {
  // 严过关建议改 #1：原断言只查暗态段与 dist 产物，变异落在暗态段之外会漏检。
  // 这里对源码全文与编译前资源目录全文扫描，覆盖任何位置的 :is() 回潮。
  ['source/css/site.css',
    'themes/fluid/source/css/_pages/_base/color-schema.styl',
    'themes/fluid/source/css/_pages/_base/_widget/qrcode.styl']
    .forEach((rel) => {
      assert.strictEqual((read(rel).match(/:is\(/g) || []).length, 0,
        rel + ' 全文出现 :is()');
    });
  const cssDir = path.join(ROOT, 'static-public', 'css');
  if (!fs.existsSync(cssDir)) return;   // 产物目录不存在时源码断言已覆盖
  const list = fs.readdirSync(cssDir).filter((n) => /\.css$/i.test(n));
  assert.ok(list.length > 0, 'static-public/css/ 无 CSS，取样失效');
  list.forEach((n) => {
    const c = fs.readFileSync(path.join(cssDir, n), 'utf8');
    assert.strictEqual((c.match(/:is\(/g) || []).length, 0,
      'static-public/css/' + n + ' 出现 :is()');
  });
});

ok('A1（真值表）：§2.5 状态机 11 类情形（含残留边界），三层优先级逐项成立', () => {
  // 与 CSS 选择器条件层的等价映射（按主理人机械展开式）：
  //   分支① @media dark : :root:not([data-user-color-scheme]):not([data-sun-scheme])
  //   分支② @media not print : [data-user-color-scheme="dark"],
  //          [data-sun-scheme="dark"]:not([data-user-color-scheme])
  // 任一分支命中即暗色，否则回落浅色 :root 默认值。
  const isDark = (manual, time, sysDark) => {
    const follow = sysDark && manual === null && time === null;
    const branch2 = manual === 'dark' || (time === 'dark' && manual === null);
    return follow || branch2;
  };
  const cases = [
    ['#1 手动 dark / 系统浅',          'dark',  null,   false, 'dark'],
    ['#1 手动 dark / 系统深',          'dark',  null,   true,  'dark'],
    ['#1 手动 light / 系统深',         'light', null,   true,  'light'],
    ['#2 时间暗 / 系统深',             null,   'dark',  true,  'dark'],
    ['#2 时间暗 / 系统浅',             null,   'dark',  false, 'dark'],
    ['#3 时间浅 / 系统深（压制系统）',  null,   'light', true,  'light'],
    ['#3 时间浅 / 系统浅',             null,   'light', false, 'light'],
    ['#4 降级 / 系统深（系统兜底）',    null,   null,   true,  'dark'],
    ['#4 降级 / 系统浅',               null,   null,   false, 'light'],
    ['边界 手动 light + 残留时间暗',   'light', 'dark',  true,  'light'],
    ['边界 手动 dark + 残留时间暗',    'dark',  'dark',  false, 'dark'],
  ];
  cases.forEach(([label, manual, time, sysDark, want]) => {
    assert.strictEqual(isDark(manual, time, sysDark) ? 'dark' : 'light', want, label);
  });
  // 真值表前提：两个分支的选择器字符串必须仍在 CSS 里
  assert.match(darkCode, /:root:not\(\[data-user-color-scheme\]\):not\(\[data-sun-scheme\]\)/);
  assert.match(darkCode, /\[data-user-color-scheme="dark"\],\s*\[data-sun-scheme="dark"\]:not\(\[data-user-color-scheme\]\)/);
});

ok('§2.5-8：只清 localStorage 的回落在 color-schema.js 内闭环，时间层不写 / 不删手动属性', () => {
  assert.match(colorSchemaJsCode, /window\.addEventListener\('storage'/);
  assert.match(colorSchemaJsCode, /if \(!getLS\(colorSchemaStorageKey\)\) applyCustomColorSchemaSettings\(\)/);
  assert.ok(!/setAttribute\([^)]*MANUAL_ATTR/.test(sunSchemeJsCode), '时间层写了手动属性');
  assert.ok(!/removeAttribute\(MANUAL_ATTR\)/.test(sunSchemeJsCode), '时间层删了手动属性');
});

// ---------- A6：不新增 UI ----------

ok('A6：head/nav 模板无新文案、无新增可见 DOM 节点、切换控件恒为 1', () => {
  const banned = /设置|偏好|时区|城市|定位|日出|日落|切换成功|夜间模式/;
  [['head.ejs', headEjs], ['Head.astro', headAstro], ['nav.ejs', navEjs], ['SiteNav.astro', siteNavAstro]]
    .forEach(([name, src]) => {
      assert.ok(!banned.test(src), name + ' 出现与模式相关的新文案');
    });
  [['head.ejs', headEjs], ['Head.astro', headAstro]].forEach(([name, src]) => {
    assert.strictEqual((src.match(/id="color-toggle-btn"/g) || []).length, 0,
      name + ' 不该承载切换按钮');
  });
  [['nav.ejs', navEjs], ['SiteNav.astro', siteNavAstro]].forEach(([name, src]) => {
    assert.strictEqual((src.match(/id="color-toggle-btn"/g) || []).length, 1, name + ' 切换按钮不是 1 处');
  });
  // 时间层模块不创建任何元素
  ['createElement', 'appendChild', 'insertAdjacentHTML', 'innerHTML', 'insertBefore'].forEach((lit) => {
    assert.ok(!sunSchemeJsCode.includes(lit), '时间层模块创建新 DOM：' + lit);
  });
  assert.ok(!/location\.reload/.test(sunSchemeJsCode), '时间层模块刷新了页面');
  // 两侧 head 都接入独立模块，且排在 color-schema.js 之后
  [['head.ejs', headEjs], ['Head.astro', headAstro]].forEach(([name, src]) => {
    const a = src.indexOf('color-schema.js');
    const b = src.indexOf('sun-scheme.js');
    assert.ok(a > -1 && b > a, name + ' 时间层模块未排在 color-schema.js 之后');
  });
});

// ---------- A7 / A8：暗色令牌未漂移、既有跟随系统分支未被破坏 ----------

ok('A7：git diff 无五个暗色令牌的增删行，出现次数与 HEAD 一致，无第三套暗色声明块', () => {
  const headCss = execFileSync('git', ['show', 'HEAD:source/css/site.css'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const diff = execFileSync('git', ['diff', '-U0', '--', 'source/css/site.css'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const changed = diff.split('\n').filter((l) => (l.startsWith('+') || l.startsWith('-'))
    && !l.startsWith('+++') && !l.startsWith('---'));
  const tokens = ['#1a1814', '#242019', '#e5ded2', '#b3aa9c', '#d97757'];
  tokens.forEach((t) => {
    assert.ok(!changed.some((l) => l.toLowerCase().includes(t)), 'diff 含暗色令牌增删行：' + t);
    const before = headCss.split(t).length - 1;
    const after = siteCss.split(t).length - 1;
    assert.strictEqual(after, before, t + ' 出现次数漂移');
  });
  assert.strictEqual((darkCode.match(/@media \(prefers-color-scheme: dark\)/g) || []).length, 1,
    '出现额外的系统偏好分支');
  assert.strictEqual((darkCode.match(/@media not print/g) || []).length, 1,
    '出现额外的手动分支');
});

ok('A8：既有跟随系统分支字面量命中数均不减（site.css 与两份 styl 源）', () => {
  const pairs = [
    ['source/css/site.css', siteCss],
    ['themes/fluid/source/css/_pages/_base/color-schema.styl',
      read('themes/fluid/source/css/_pages/_base/color-schema.styl')],
    ['themes/fluid/source/css/_pages/_base/_widget/qrcode.styl',
      read('themes/fluid/source/css/_pages/_base/_widget/qrcode.styl')],
  ];
  const literals = ['@media (prefers-color-scheme: dark)',
    ':root:not([data-user-color-scheme])', '[data-user-color-scheme="dark"]', '@media not print'];
  pairs.forEach(([rel, cur]) => {
    const before = execFileSync('git', ['show', 'HEAD:' + rel],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    literals.forEach((lit) => {
      const b = before.split(lit).length - 1;
      if (b === 0) return;
      const a = cur.split(lit).length - 1;
      assert.ok(a >= b, rel + ' 的 ' + lit + ' 命中数减少：' + b + ' -> ' + a);
    });
  });
});

// ---------- A9：FOUC 落点 ----------

ok('A9：两侧 boot 同步、零网络等待、手动优先立即结束、时间层只写独立标记', () => {
  // §10-15（l.435–450）一条未改，此处补正向断言
  const astroBoot = (headAstro.match(/const darkModeBootScript = `([\s\S]*?)`;/) || [])[1] || '';
  const ejsBoot = (headEjs.match(/<script>\s*([\s\S]*?)<\/script>/) || [])[1] || '';
  assert.ok(astroBoot && ejsBoot, '取不到两侧 boot 脚本');
  [['Astro', astroBoot], ['Hexo', ejsBoot]].forEach(([name, boot]) => {
    assert.ok(!/fetch|await|Promise|setTimeout|async/.test(boot), name + ' boot 含网络/异步等待');
    assert.match(boot, /v === 'light' \|\| v === 'dark'/);
    assert.match(boot, /setAttribute\('data-user-color-scheme', v\)/);
    assert.match(boot, /setAttribute\('data-sun-scheme'/);
    assert.match(boot, /return;/);
    assert.ok(!/location\.reload/.test(boot));
  });
  // 两侧逐行同源（Astro 模板字符串里的 \\d 归一后比对）
  const norm = (s) => s.replace(/\\\\d/g, '\\d').replace(/\s+/g, ' ').trim();
  assert.strictEqual(norm(astroBoot), norm(ejsBoot), '两侧 boot 脚本不同源');
  assert.ok(headAstro.indexOf('darkModeBootScript') < headAstro.indexOf('<Styles'),
    'Astro boot 晚于首个 CSS link');
  assert.ok(headEjs.indexOf('Fluid_Color_Scheme') < headEjs.indexOf("partial('_partials/css.ejs')"),
    'Hexo boot 晚于 css.ejs');
});

// ---------- A10：缓存字段白名单 ----------

ok('A10：缓存只写 4 个派生字段，键与字段无敏感数据；API 返回块不泄漏位置原始值', () => {
  assert.match(sunSchemeJsCode, /var CACHE_KEY\s*=\s*'Fluid_Sun_Scheme'/);
  assert.ok(!/\bip\b|x-vercel/i.test(CACHE_RAW + sunSchemeJsCode.match(/var CACHE_KEY.*/)[0]));
  const write = sunSchemeJsCode.match(/var c = \{([\s\S]*?)\n    \};/);
  assert.ok(write, '取不到缓存对象字面量');
  const keys = [...write[1].matchAll(/^\s*([a-zA-Z]+)\s*:/gm)].map((m) => m[1]).sort();
  assert.deepStrictEqual(keys, ['date', 'fp', 'sunrise', 'sunset'], '缓存字段超出白名单');
  ['ip', 'latitude', 'longitude', 'timezone', 'lat', 'lon', 'tz'].forEach((w) => {
    assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(write[1]), '缓存含敏感字段：' + w);
  });
  // A10 续篇：新模块整体不得出现原始头 / 原始精度坐标 / 地区名 / 访问痕迹
  ['x-vercel-ip-', 'latitude', 'longitude', 'timezone', '访问时间戳', '访问日志']
    .forEach((w) => assert.ok(!sunSchemeJsCode.includes(w), '时间层模块出现禁词：' + w));
  // 接口返回块只含 4 个派生字段 + available
  const retAt = sunTimesApiCode.indexOf('return {\n    available: true');
  const retEnd = sunTimesApiCode.indexOf('}, { methods', retAt);
  assert.ok(retAt > -1 && retEnd > retAt, '取不到 API 成功返回块');
  const ret = sunTimesApiCode.slice(retAt, retEnd);
  ['latitude', 'longitude', 'timezone', 'x-vercel'].forEach((w) => {
    assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(ret), 'API 返回块泄漏 ' + w);
  });
  ['available', 'date', 'sunrise', 'sunset', 'fp'].forEach((w) => {
    assert.ok(new RegExp('\\b' + w + '\\b').test(ret), 'API 返回块缺 ' + w);
  });
  // 端点用无副作用 GET 守卫，且本地无头 / 公式无解时干净降级
  assert.match(sunTimesApiCode, /methods: \['GET'\], body: false, origin: false, auth: false/);
  assert.match(sunTimesApiCode, /return \{ available: false \}/);
  assert.match(sunTimesApiCode, /cosH < -1 \|\| cosH > 1/);
});

// ---------- 运行时状态机（vm） ----------

function makeSandbox(opts) {
  const o = opts || {};
  const attrs = Object.assign({}, o.rootAttrs || {});
  const store = Object.assign({}, o.storage || {});
  const events = [];
  const docListeners = {};
  const winListeners = {};
  const mqListeners = [];
  const pendingWait = [];   // E-148：模拟 waitElementLoaded / MutationObserver 的异步回调时序
  const timers = [];
  let timerSeq = 0;
  let NOW = o.now;
  let SYSTEM_DARK = !!o.systemDark;
  let fetchImpl = o.fetch || (() => Promise.resolve({ ok: true, json: () => Promise.resolve(o.data) }));
  const fetchCalls = [];

  const root = {
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null; },
    setAttribute(n, v) { attrs[n] = String(v); },
    removeAttribute(n) { delete attrs[n]; },
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n); },
  };
  function makeEl() {
    const a = {};
    const el = {
      _attrs: a,
      _listeners: {},
      setAttribute(n, v) { a[n] = String(v); },
      getAttribute(n) { return Object.prototype.hasOwnProperty.call(a, n) ? a[n] : null; },
      removeAttribute(n) { delete a[n]; },
      classList: { replace() {}, add() {}, remove() {} },
      addEventListener(t, fn) { (el._listeners[t] = el._listeners[t] || []).push(fn); },
      click() { (el._listeners.click || []).forEach((f) => f()); },
    };
    return el;
  }
  // 真实 color-schema.js 会写这些元素；这里留出可断言的观测点，验证统一 UI 同步
  const ui = {
    icon: makeEl(), btn: makeEl(), meta: makeEl(),
    highlight: makeEl(), highlightDark: makeEl(),
  };
  const doc = {
    documentElement: root,
    hidden: false,
    addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
    dispatchEvent(ev) {
      events.push(ev);
      (docListeners[ev.type] || []).forEach((f) => f(ev));
      return true;
    },
    createEvent() {
      return { initCustomEvent(t, b, c, d) { this.type = t; this.detail = d; } };
    },
    querySelector(sel) {
      if (sel === 'meta[name="theme-color"]') return ui.meta;
      if (sel === '#color-toggle-icon') return ui.icon;
      if (sel === '#color-toggle-btn') return ui.btn;
      return null;
    },
    getElementById(id) {
      if (id === 'highlight-css') return ui.highlight;
      if (id === 'highlight-css-dark') return ui.highlightDark;
      return null;
    },
    querySelectorAll() { return []; },
  };
  const sandbox = {
    window: {
      addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
      matchMedia() {
        return {
          get matches() { return SYSTEM_DARK; },
          addEventListener(t, fn) { if (t === 'change') mqListeners.push(fn); },
          addListener(fn) { mqListeners.push(fn); },
        };
      },
    },
    document: doc,
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init && init.detail; }
    },
    Date: { now: () => NOW },
    setTimeout(fn, delay) {
      const id = ++timerSeq;
      timers.push({ id, fn, delay, done: false, cleared: false });
      return id;
    },
    clearTimeout(id) {
      const t = timers.find((x) => x.id === id);
      if (t) t.cleared = true;
    },
    fetch(url, init) { fetchCalls.push({ url, init }); return fetchImpl(url, init); },
    isFinite: Number.isFinite,
    getComputedStyle: () => ({ getPropertyValue: () => '#242019' }),
    Fluid: {
      utils: {
        // 默认同步立即执行（沿用既有场景）；deferWaitCallbacks 时把回调挂起，
        // 由 state.fireWaitCallbacks() 在「时间层事件派发之后」再触发，
        // 复刻真实 MutationObserver 异步重跑 applyCustomColorSchemaSettings() 的时序。
        waitElementLoaded(sel, cb) {
          if (o.deferWaitCallbacks) pendingWait.push({ sel: sel, cb: cb });
          else cb();
        },
        getBackgroundLightness() { return 0; },
      },
    },
  };
  return {
    sandbox, ui,
    state: {
      attrs, store, events, timers,
      get fetchCalls() { return fetchCalls; },
      setNow(v) { NOW = v; },
      setSystemDark(v) { SYSTEM_DARK = !!v; },
      fireMatchMediaChange() { mqListeners.forEach((f) => f()); },
      // E-148 关键时序：事件派发之后才重跑挂起的 waitElementLoaded 回调
      fireWaitCallbacks() {
        const list = pendingWait.splice(0);
        list.forEach((x) => x.cb());
        return list.length;
      },
      fireTimer(pred) {
        const t = timers.find((x) => !x.cleared && !x.done && (!pred || pred(x)));
        if (!t) return false;
        t.done = true;
        t.fn();
        return true;
      },
      fireStorage(key) { (winListeners.storage || []).forEach((f) => f({ key: key })); },
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// 双模块联跑：按真实 defer 顺序先 color-schema.js（统一 UI 同步入口），再 sun-scheme.js
function runModule(ctx, withColorSchema) {
  if (withColorSchema) vm.runInNewContext(colorSchemaJs, ctx.sandbox, { timeout: 2000 });
  vm.runInNewContext(sunSchemeJs, ctx.sandbox, { timeout: 2000 });
}

function assertNoManualAttr(st) {
  assert.strictEqual(st.attrs['data-user-color-scheme'], undefined,
    '时间层写了 data-user-color-scheme');
}

async function okAsync(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  PASS', label);
  } catch (e) {
    console.error('  FAIL', label, '—', e.message);
    process.exitCode = 1;
  }
}

(async function phase4ARuntime() {
  await okAsync('A1/A2：手动态恒定——时间层零 DOM 写入、零取接口、手动属性保留', async () => {
    const ctx = makeSandbox({
      now: BASE + 5 * HOUR,
      storage: { Fluid_Color_Scheme: 'dark', Fluid_Sun_Scheme: CACHE_RAW },
      rootAttrs: { 'data-user-color-scheme': 'dark' },
      data: API_OK,
    });
    runModule(ctx);
    await flush();
    assert.strictEqual(ctx.state.attrs['data-user-color-scheme'], 'dark');
    assert.strictEqual(ctx.state.attrs['data-sun-scheme'], undefined, '手动态残留时间标记');
    assert.strictEqual(ctx.state.fetchCalls.length, 0, '手动态仍取了接口');
    assert.strictEqual(ctx.state.timers.length, 0, '手动态仍设了切换定时器');
  });

  await okAsync('A1/A2：时间层白天 / 夜间——手动属性全程为 null，统一 UI 同步事件已派发', async () => {
    for (const [label, now, want] of [
      ['白天', BASE + 5 * HOUR, 'light'],
      ['夜间', BASE + 12 * HOUR, 'dark'],
      ['凌晨', BASE - HOUR, 'dark'],
    ]) {
      const ctx = makeSandbox({ now, storage: { Fluid_Sun_Scheme: CACHE_RAW }, data: API_OK });
      runModule(ctx);
      await flush();
      assert.strictEqual(ctx.state.attrs['data-sun-scheme'], want, label + ' 生效态不对');
      assertNoManualAttr(ctx.state);
      assert.ok(ctx.state.events.some((e) => e.type === 'kasai:sun-scheme'
        && e.detail.scheme === want && e.detail.active === true), label + ' 缺统一 UI 同步事件');
    }
  });

  await okAsync('A4：页面开着跨日落 / 跨日出自动翻转，无需刷新、手动属性仍为 null', async () => {
    // 跨日落：浅 -> 深
    const dusk = makeSandbox({
      now: CACHE_FIXTURE.sunset - 1000,
      storage: { Fluid_Sun_Scheme: CACHE_RAW }, data: API_OK,
    });
    runModule(dusk);
    await flush();
    assert.strictEqual(dusk.state.attrs['data-sun-scheme'], 'light');
    dusk.state.setNow(CACHE_FIXTURE.sunset + 1000);
    assert.ok(dusk.state.fireTimer((t) => t.delay === 1000), '缺日落切换定时器');
    assert.strictEqual(dusk.state.attrs['data-sun-scheme'], 'dark', '跨日落未翻转');
    assertNoManualAttr(dusk.state);
    // 跨日出：深 -> 浅
    const dawn = makeSandbox({
      now: CACHE_FIXTURE.sunrise - 1000,
      storage: { Fluid_Sun_Scheme: CACHE_RAW }, data: API_OK,
    });
    runModule(dawn);
    await flush();
    assert.strictEqual(dawn.state.attrs['data-sun-scheme'], 'dark');
    dawn.state.setNow(CACHE_FIXTURE.sunrise + 1000);
    assert.ok(dawn.state.fireTimer((t) => t.delay === 1000), '缺日出切换定时器');
    assert.strictEqual(dawn.state.attrs['data-sun-scheme'], 'light', '跨日出未翻转');
    assertNoManualAttr(dawn.state);
    assert.ok(!/location\.reload/.test(sunSchemeJsCode), '跨点切换刷新了页面');
  });

  await okAsync('A5：接口 500 / available:false / 抛错 / 缓存损坏，一律干净降级到系统层', async () => {
    const failures = [
      ['非 2xx', () => Promise.resolve({ ok: false })],
      ['available:false', () => Promise.resolve({ ok: true, json: () => Promise.resolve({ available: false }) })],
      ['网络异常', () => Promise.reject(new Error('offline'))],
      ['响应非法', () => Promise.resolve({ ok: true, json: () => Promise.resolve({ available: true, sunrise: 1 }) })],
    ];
    for (const [label, fetchImpl] of failures) {
      const ctx = makeSandbox({
        now: BASE + 5 * HOUR,
        storage: { Fluid_Sun_Scheme: CACHE_RAW },
        fetch: fetchImpl,
      });
      runModule(ctx);
      await flush();
      assert.strictEqual(ctx.state.attrs['data-sun-scheme'], undefined, label + ' 时间标记未清除');
      assertNoManualAttr(ctx.state);
      assert.ok(ctx.state.events.some((e) => e.detail && e.detail.active === false
        && e.detail.scheme === null), label + ' 未通知统一 UI 同步回系统层');
    }
    // 缓存损坏：首屏什么都不写，等接口回填
    const broken = makeSandbox({
      now: BASE + 5 * HOUR,
      storage: { Fluid_Sun_Scheme: '{bad json' }, data: API_OK,
    });
    runModule(broken);
    await flush();
    assert.strictEqual(broken.state.attrs['data-sun-scheme'], 'light', '缓存损坏后未由接口回填校正');
    assertNoManualAttr(broken.state);
  });

  await okAsync('A5（端点）：本地无头 / 头非法 / 极昼公式无解返回 available:false；可用时字段合法', async () => {
    const handler = require(path.join(ROOT, 'api', 'sun-times.js'));
    const call = async (headers) => {
      const res = { setHeader() {}, end(b) { this.body = b; } };
      await handler({ method: 'GET', headers }, res);
      return { status: res.statusCode || 200, body: JSON.parse(res.body) };
    };
    for (const headers of [{},
      { 'x-vercel-ip-latitude': 'abc', 'x-vercel-ip-longitude': '999', 'x-vercel-ip-timezone': 'Not/AZone' },
      { 'x-vercel-ip-latitude': '78.2232', 'x-vercel-ip-longitude': '15.6469', 'x-vercel-ip-timezone': 'Arctic/Longyearbyen' }]) {
      const r = await call(headers);
      assert.strictEqual(r.body.available, false, '未降级：' + JSON.stringify(headers));
    }
    const good = await call({
      'x-vercel-ip-latitude': '39.9042', 'x-vercel-ip-longitude': '116.4074',
      'x-vercel-ip-timezone': 'Asia/Shanghai',
    });
    assert.strictEqual(good.body.available, true);
    assert.deepStrictEqual(Object.keys(good.body).sort(),
      ['available', 'date', 'fp', 'sunrise', 'sunset']);
    assert.ok(good.body.sunset > good.body.sunrise);
    assert.ok(good.body.sunset - good.body.sunrise < DAY);
    assert.match(good.body.fp, /^[0-9a-f]{8}$/);
  });

  await okAsync('A2/§2.5-8：清除手动值后立刻回落到时间层，无需刷新', async () => {
    const ctx = makeSandbox({
      now: BASE + 5 * HOUR,
      storage: { Fluid_Color_Scheme: 'dark', Fluid_Sun_Scheme: CACHE_RAW },
      rootAttrs: { 'data-user-color-scheme': 'dark' },
      data: API_OK,
    });
    runModule(ctx);
    assert.strictEqual(ctx.state.fetchCalls.length, 0, '手动态不应取接口');
    delete ctx.state.store.Fluid_Color_Scheme;
    delete ctx.state.attrs['data-user-color-scheme'];
    ctx.state.fireStorage('Fluid_Color_Scheme');
    await flush();
    assert.strictEqual(ctx.state.attrs['data-sun-scheme'], 'light', '清除手动值后未回落');
    assertNoManualAttr(ctx.state);
  });

  await okAsync('A10（运行时）：接口回填只写 4 字段白名单缓存，且首屏无缓存时先稳定呈现系统层', async () => {
    const ctx = makeSandbox({ now: BASE + 5 * HOUR, storage: {}, data: API_OK });
    runModule(ctx);
    assert.strictEqual(ctx.state.attrs['data-sun-scheme'], undefined, '首屏无缓存却写了时间标记');
    assert.ok(ctx.state.events.some((e) => e.detail && e.detail.active === false),
      '首屏无缓存未稳定呈现系统层');
    await flush();
    const written = JSON.parse(ctx.state.store.Fluid_Sun_Scheme);
    assert.deepStrictEqual(Object.keys(written).sort(), ['date', 'fp', 'sunrise', 'sunset']);
    assert.strictEqual(ctx.state.attrs['data-sun-scheme'], 'light');
    assertNoManualAttr(ctx.state);
  });

  await okAsync('§2.6 统一 UI 同步：时间态暗 + 系统浅时，图标/aria/theme-color/代码高亮全部与底色一致', async () => {
    const ctx = makeSandbox({
      now: BASE + 12 * HOUR,
      storage: { Fluid_Sun_Scheme: CACHE_RAW },
      data: API_OK,
      systemDark: false,           // 系统浅、时间层暗：若无统一同步必然撕裂
    });
    runModule(ctx, true);
    await flush();
    assert.strictEqual(ctx.state.attrs['data-sun-scheme'], 'dark');
    assertNoManualAttr(ctx.state);
    assert.strictEqual(ctx.ui.btn._attrs['aria-pressed'], 'true', 'aria-pressed 仍是浅色语义');
    assert.strictEqual(ctx.ui.btn._attrs['aria-label'], '切换到浅色模式', 'aria-label 仍是浅色语义');
    assert.strictEqual(ctx.ui.icon._attrs['class'], 'iconfont icon-dark', '图标仍是浅色');
    assert.strictEqual(ctx.ui.icon._attrs.data, 'light');
    assert.strictEqual(ctx.ui.meta._attrs.content, '#242019', 'theme-color 未同步');
    assert.strictEqual(ctx.ui.highlight._attrs.disabled, '', '浅色高亮未禁用');
    assert.strictEqual(ctx.ui.highlightDark._attrs.disabled, undefined, '暗色高亮未启用');
  });

  await okAsync('§2.5-5：时间层生效时压制系统偏好变化；仅系统兜底态才跟随系统', async () => {
    const active = makeSandbox({
      now: BASE + 12 * HOUR,
      storage: { Fluid_Sun_Scheme: CACHE_RAW }, data: API_OK, systemDark: false,
    });
    runModule(active, true);
    await flush();
    assert.strictEqual(active.ui.btn._attrs['aria-pressed'], 'true');
    active.state.setSystemDark(true);
    active.state.fireMatchMediaChange();
    assert.strictEqual(active.ui.btn._attrs['aria-pressed'], 'true', '时间层生效却被系统偏好改写');
    assert.strictEqual(active.state.attrs['data-sun-scheme'], 'dark');
    assertNoManualAttr(active.state);

    const fallback = makeSandbox({
      now: BASE + 5 * HOUR, storage: {},
      fetch: () => Promise.resolve({ ok: false }), systemDark: false,
    });
    runModule(fallback, true);
    await flush();
    assert.strictEqual(fallback.state.attrs['data-sun-scheme'], undefined);
    assert.strictEqual(fallback.ui.btn._attrs['aria-pressed'], 'false', '系统兜底态初始应为浅');
    fallback.state.setSystemDark(true);
    fallback.state.fireMatchMediaChange();
    assert.strictEqual(fallback.ui.btn._attrs['aria-pressed'], 'true', '系统兜底态未跟随系统');
    assertNoManualAttr(fallback.state);
  });

  await okAsync('§2.5-8（只清 LS）：手动属性由 color-schema.js 自身清除，立刻回落时间层', async () => {
    const ctx = makeSandbox({
      now: BASE + 5 * HOUR,
      storage: { Fluid_Color_Scheme: 'dark', Fluid_Sun_Scheme: CACHE_RAW },
      rootAttrs: { 'data-user-color-scheme': 'dark' },
      data: API_OK,
    });
    runModule(ctx, true);
    assert.strictEqual(ctx.state.fetchCalls.length, 0, '手动态不应取接口');
    delete ctx.state.store.Fluid_Color_Scheme;   // 故意不移除 DOM 属性
    ctx.state.fireStorage('Fluid_Color_Scheme');
    await flush();
    assert.strictEqual(ctx.state.attrs['data-user-color-scheme'], undefined,
      '手动属性未被 applyCustomColorSchemaSettings 清除');
    assert.strictEqual(ctx.state.attrs['data-sun-scheme'], 'light', '未回落到时间层');
    assert.strictEqual(ctx.ui.btn._attrs['aria-pressed'], 'false', '回落后的 UI 未校正');
  });

  await okAsync('A1（动态）：时间层生效期间点击顶栏按钮，手动值立即接管', async () => {
    const ctx = makeSandbox({
      now: BASE + 12 * HOUR,
      storage: { Fluid_Sun_Scheme: CACHE_RAW }, data: API_OK, systemDark: false,
    });
    runModule(ctx, true);
    await flush();
    assert.strictEqual(ctx.state.attrs['data-sun-scheme'], 'dark');
    assertNoManualAttr(ctx.state);
    ctx.ui.btn.click();
    assert.ok(ctx.state.store.Fluid_Color_Scheme === 'light'
      || ctx.state.store.Fluid_Color_Scheme === 'dark', '点击未写入手动值');
    assert.ok(ctx.state.attrs['data-user-color-scheme'] === 'light'
      || ctx.state.attrs['data-user-color-scheme'] === 'dark', '点击未写手动属性');
    // CSS 逗号并列 + :not 守卫（手动优先），JS 的 stopForManual() 另做清除双保险
    assert.match(darkCode, /\[data-user-color-scheme="dark"\],\s*\[data-sun-scheme="dark"\]:not\(\[data-user-color-scheme\]\)/);
    assert.match(sunSchemeJsCode, /function stopForManual\(\)/);
    assert.match(sunSchemeJsCode, /if \(hasManual\(\)\) \{ stopForManual\(\); return; \}/);
  });

  // ------------------------------------------------------------------
  // E-148 防复发：现有 §2.6 vm 断言里 waitElementLoaded 是「同步立即执行」，
  // 发生在时间层派发事件之前，因此抓不到真实 MutationObserver 的异步覆盖时序。
  // 下面用 deferWaitCallbacks 把回调挂起，在 kasai:sun-scheme 事件派发之后
  // 再触发，断言 UI 与 data-sun-scheme 一致；并做变异自检证明检测有效。
  // ------------------------------------------------------------------
  function assertTimeLayerUi(ctx, want, label) {
    assert.strictEqual(ctx.state.attrs['data-sun-scheme'], want, label + ' 时间标记不对');
    assertNoManualAttr(ctx.state);
    assert.strictEqual(ctx.ui.btn._attrs['aria-pressed'], want === 'dark' ? 'true' : 'false',
      label + ' aria-pressed 与底色撕裂');
    assert.strictEqual(ctx.ui.btn._attrs['aria-label'],
      want === 'dark' ? '切换到浅色模式' : '切换到深色模式',
      label + ' aria-label 与底色撕裂');
    assert.strictEqual(ctx.ui.icon._attrs['class'], 'iconfont icon-' + want,
      label + ' icon class 与底色撕裂');
    if (want === 'dark') {
      assert.strictEqual(ctx.ui.highlight._attrs.disabled, '', label + ' 浅色高亮未禁用');
      assert.strictEqual(ctx.ui.highlightDark._attrs.disabled, undefined, label + ' 暗色高亮未启用');
    } else {
      assert.strictEqual(ctx.ui.highlight._attrs.disabled, undefined, label + ' 浅色高亮未启用');
      assert.strictEqual(ctx.ui.highlightDark._attrs.disabled, '', label + ' 暗色高亮未禁用');
    }
  }

  await okAsync('E-148 防复发（异步覆盖时序）：事件派发后重跑 applyCustomColorSchemaSettings，UI 仍与时间态一致', async () => {
    const cases = [
      ['time-dark / 系统浅', BASE + 12 * HOUR, false, 'dark'],
      ['time-light / 系统深', BASE + 5 * HOUR, true, 'light'],
    ];
    for (const [label, now, systemDark, want] of cases) {
      const ctx = makeSandbox({
        now: now,
        storage: { Fluid_Sun_Scheme: CACHE_RAW },
        data: API_OK,
        systemDark: systemDark,
        deferWaitCallbacks: true,
      });
      runModule(ctx, true);
      await flush();
      const emitted = ctx.state.events.filter((e) => e.type === 'kasai:sun-scheme');
      assert.ok(emitted.length > 0, label + ' 未派发统一 UI 同步事件');
      // 关键时序：模拟 waitElementLoaded / MutationObserver 回调在事件之后异步重跑
      const fired = ctx.state.fireWaitCallbacks();
      assert.ok(fired >= 2, label + ' 未模拟到异步重跑，取样失效：' + fired);
      assertTimeLayerUi(ctx, want, label);
    }
  });

  await okAsync('E-148 变异自检：current 改回原句后同一异步时序必然撕裂（检测有效性）', async () => {
    const FIXED = 'var current = schema || (hasManual ? stored : (validColorSchemaKeys[sunScheme] ? sunScheme : getDefaultColorSchema()));';
    const ORIGINAL = 'var current = schema || (hasManual ? stored : getDefaultColorSchema());';
    // 文件处于修复态则构造变异版；若正处于变异演示态，源码本身即变异版
    const mutant = colorSchemaJs.includes(FIXED)
      ? colorSchemaJs.replace(FIXED, ORIGINAL) : colorSchemaJs;
    assert.ok(!mutant.includes(FIXED), '变异版仍含修复句，自检失效');
    const ctx = makeSandbox({
      now: BASE + 12 * HOUR,
      storage: { Fluid_Sun_Scheme: CACHE_RAW },
      data: API_OK,
      systemDark: false,
      deferWaitCallbacks: true,
    });
    vm.runInNewContext(mutant, ctx.sandbox, { timeout: 2000 });
    vm.runInNewContext(sunSchemeJs, ctx.sandbox, { timeout: 2000 });
    await flush();
    ctx.state.fireWaitCallbacks();
    // 变异版会把 UI 覆盖成系统浅态，与 data-sun-scheme="dark" 撕裂
    assert.strictEqual(ctx.ui.btn._attrs['aria-pressed'], 'false', '变异版未撕裂，检测无效');
    assert.throws(() => assertTimeLayerUi(ctx, 'dark', '变异版'), /撕裂/,
      '主断言逻辑抓不到该缺陷，防复发失效');
  });

  // ===== 2026-11-14 主人反馈三项修补（E-150 / E-151 / E-152） =====
  const vercelJson = read('vercel.json');
  const sunTimesJs = read('api/sun-times.js');
  // sunSchemeJs 已在文件顶部定义（l.67），此处复用，勿重复声明（会造成 TDZ）。

  ok('E-152 防复发 1/2：首页与 .html 响应头禁止留存旧副本', () => {
    const v = JSON.parse(vercelJson);
    const cc = (src) => {
      const block = v.headers.find((h) => h.source === src);
      assert.ok(block, `vercel.json 缺少 ${src} 的 headers 段`);
      const h = block.headers.find((x) => x.key.toLowerCase() === 'cache-control');
      assert.ok(h, `${src} 缺少 Cache-Control`);
      return h.value;
    };
    assert.match(cc('/'), /no-store/, '根路径 HTML 未设 no-store');
    assert.match(cc('/(.*).html'), /no-store/, '.html 路径未设 no-store');
    assert.ok(!/max-age=[1-9]/.test(cc('/')), '根路径仍允许长缓存');
  });

  ok('E-152 防复发 2/2：首页产物按钮在顶栏、九宫格零切换格', () => {
    const html = read('dist/index.html');
    assert.ok(html.includes('id="color-toggle-btn"'), '首页产物缺切换按钮');
    assert.ok(!html.includes('mobile-color-toggle-btn'), '首页产物仍有九宫格切换格');
    assert.ok(html.indexOf('id="color-toggle-btn"') < html.indexOf('id="mobile-grid-menu"'),
      '切换按钮未排在九宫格之前（不在顶栏）');
  });

  ok('E-150 源码：端点读设备 UTC 偏移校正出口时区，前端只上报一个整数', () => {
    assert.ok(sunTimesJs.includes('deviceTzOffset'), '端点缺少 tzoff 解析');
    assert.ok(sunTimesJs.includes('mismatched') && sunTimesJs.includes('effLon'), '端点缺少经度校正');
    assert.ok(sunSchemeJs.includes('function apiUrl()') && sunSchemeJs.includes('fetch(apiUrl(), opts)'),
      '前端未把 tzoff 带上请求');
    assert.ok(!sunSchemeJs.includes('resolvedOptions') && !sunSchemeJs.includes('timeZone'),
      '前端不得下发时区名或 IANA 标识符');
  });

  await okAsync('E-150 运行时：设备 UTC+8 + 出口 America/Chicago 时按东经重算；时区一致时不校正', async () => {
    const handler = require(path.join(ROOT, 'api/sun-times.js'));
    const call = async (url) => {
      let out = null;
      const res = { statusCode: 0, setHeader() {}, end(b) { out = JSON.parse(b); } };
      await handler({
        method: 'GET', url,
        headers: {
          'x-vercel-ip-latitude': '41.8',
          'x-vercel-ip-longitude': '-87.6',
          'x-vercel-ip-timezone': 'America/Chicago',
        },
      }, res);
      return out;
    };
    const raw = await call('/api/sun-times');
    const fixed = await call('/api/sun-times?tzoff=480');
    assert.strictEqual(raw.available, true);
    assert.strictEqual(fixed.available, true);
    assert.deepStrictEqual(Object.keys(fixed).sort(), ['available', 'date', 'fp', 'sunrise', 'sunset'],
      '端点返回字段集合不得变化');
    assert.notStrictEqual(fixed.fp, raw.fp, '设备时区与出口时区不一致时未触发校正');
    const sunriseCST = new Date(fixed.sunrise + 8 * 3600000).getUTCHours();
    const sunsetCST = new Date(fixed.sunset + 8 * 3600000).getUTCHours();
    assert.ok(sunriseCST >= 4 && sunriseCST <= 10, `校正后日出不在北京白天窗口：${sunriseCST} 时`);
    assert.ok(sunsetCST >= 15 && sunsetCST <= 21, `校正后日落不在北京傍晚窗口：${sunsetCST} 时`);
    assert.strictEqual(fixed.date, new Date(Date.now() + 480 * 60000).toISOString().slice(0, 10),
      '校正后当地日期未按设备时区计算');
    const same = await call('/api/sun-times?tzoff=-360');
    assert.strictEqual(same.fp, raw.fp, '设备时区与出口时区一致时不应触发校正');
    assert.strictEqual(same.sunrise, raw.sunrise, '时区一致时日出时刻不应变化');
  });

  ok('E-151 防复发：首页「最近更新」暗态覆盖成对且落在既有 §15 两分支内', () => {
    const start = siteCss.indexOf('/* ===== 15. 暗色模式');
    const end = siteCss.indexOf('@media (prefers-reduced-motion: no-preference)', start);
    assert.ok(start > 0 && end > start, '§15 段取样失效');
    const seg = siteCss.slice(start, end);
    assert.strictEqual((seg.match(/@media \(prefers-color-scheme: dark\)/g) || []).length, 1,
      '不得新增系统偏好分支');
    assert.strictEqual((seg.match(/@media not print/g) || []).length, 1,
      '不得新增手动分支');
    assert.match(seg, /:root:not\(\[data-user-color-scheme\]\):not\(\[data-sun-scheme\]\) \.ink-band/,
      '缺少跟随系统暗态分支');
    assert.match(seg, /\[data-sun-scheme="dark"\]:not\(\[data-user-color-scheme\]\) \.ink-band/,
      '缺少时间层暗态分支');
    for (const cls of ['.col-title', '.feed-title', '.feed-date', '.feed-row']) {
      assert.ok(seg.includes(cls), `§15b 缺少 ${cls} 暗态覆盖`);
    }
    assert.ok(seg.includes('var(--board-bg-color)') && seg.includes('var(--text-color)'),
      '§15b 未改用暗面板 + 亮纸字');
    assert.ok(!seg.includes(':is('), '§15b 不得引入 :is()');
  });

  console.log(`\nRESULT: ${passed} 项断言通过${skipped ? `，${skipped} 项 SKIP` : ''}${process.exitCode ? '，存在失败' : ''}`);
  process.exit(process.exitCode || 0);
})();
