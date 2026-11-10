'use strict';
// 暗色模式端到端断言（2026-11-09，方案 §10 的 24 条验收口径里可自动化的部分）。
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

ok('§10-12：桌面 / 移动切换按钮各恰好 1 处，且为 button + aria', () => {
  [['nav.ejs', navEjs], ['SiteNav.astro', siteNavAstro]].forEach(([name, src]) => {
    const desktop = (src.match(/id="color-toggle-btn"/g) || []).length;
    const mobile = (src.match(/id="mobile-color-toggle-btn"/g) || []).length;
    assert.strictEqual(desktop, 1, name + ' 桌面 #color-toggle-btn 不是 1 处');
    assert.strictEqual(mobile, 1, name + ' 移动 #mobile-color-toggle-btn 不是 1 处');
    assert.match(src, /<button[^>]*id="color-toggle-btn"/, name + ' 桌面不是 button');
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

ok('§10-12：两个按钮都绑定 click，写入值只含 light / dark', () => {
  assert.match(colorSchemaJsCode, /colorToggleButtonSelector\s*=\s*'#color-toggle-btn'/);
  assert.match(colorSchemaJsCode, /mobileColorToggleButtonSelector\s*=\s*'#mobile-color-toggle-btn'/);
  assert.match(colorSchemaJsCode, /button\.addEventListener\('click'/);
  assert.match(colorSchemaJsCode, /mobileButton\.addEventListener\('click'/);
  assert.match(colorSchemaJsCode, /setLS\(colorSchemaStorageKey, currentSetting\)/);
  assert.ok(!/setLS\([^)]*['"]auto['"]/.test(colorSchemaJsCode), '写入了 auto');
  assert.ok(!/setAttribute\([^)]*['"]auto['"]/.test(colorSchemaJsCode), '把 auto 写进了属性');
  assert.match(colorSchemaJsCode, /var validColorSchemaKeys\s*=\s*\{\s*dark\s*:\s*true,\s*light\s*:\s*true\s*\}/);
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
const HY_BRANCHES = [
  ['跟随系统分支', FOLLOW_SEG, ':root:not([data-user-color-scheme])'],
  ['手动选择分支', MANUAL_SEG, '[data-user-color-scheme="dark"]'],
];

function hyRuleBody(seg, prefix, selector) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc(prefix) + ' ' + esc(selector) + '\\s*\\{([^}]*)\\}');
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
  const head = execFileSync('git', ['show', 'HEAD:source/css/site.css'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const grab = (s) => {
    const a = s.indexOf('/* ---- 4.12b');
    const b = s.indexOf('/* ===== 4.13', a);
    assert.ok(a > -1 && b > a, '找不到 4.12b 段的起止锚点');
    return s.slice(a, b);
  };
  const headSeg = grab(head);
  const curSeg = grab(siteCss);
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
  ok(name + '：桌面 / 移动切换按钮各恰好 1 处', () => {
    assert.strictEqual((html.match(/id="color-toggle-btn"/g) || []).length, 1);
    assert.strictEqual((html.match(/id="mobile-color-toggle-btn"/g) || []).length, 1);
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

console.log(`\nRESULT: ${passed} 项断言通过${skipped ? `，${skipped} 项 SKIP` : ''}${process.exitCode ? '，存在失败' : ''}`);
process.exit(process.exitCode || 0);
