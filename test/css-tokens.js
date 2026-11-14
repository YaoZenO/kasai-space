'use strict';
// 前台 / 后台 CSS token 一致性锁定（P2-3）。
// 目的：防止 --accent 在两处各自漂移——后台与前台的强调色一旦分叉，
// 视觉语言就断了，而这种问题不会报错、也不会被功能测试发现。
//
// 运行：node test/css-tokens.js

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function tokenOf(css, name) {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

const siteCss = read('source/css/site.css');
const adminCss = read('source/admin/admin.css');

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

// 需要两处等值的 token。新增token 时在此登记，否则不受保护。
const SHARED = ['accent'];

console.log('CSS token 一致性（前台 site.css × 后台 admin.css）');

for (const name of SHARED) {
  const a = tokenOf(adminCss, name);
  const b = tokenOf(siteCss, name);
  ok(`--${name} 两处等值（admin=${a} site=${b}）`, () => {
    assert.ok(a, `admin.css 缺少 --${name}`);
    assert.ok(b, `site.css 缺少 --${name}`);
    assert.strictEqual(a, b, `--${name} 两处不一致：admin.css=${a} / site.css=${b}`);
  });
}

// admin.css 独有 token 不许为空（防止误删导致样式整体失效）
for (const name of ['bg', 'ink', 'muted', 'line', 'card', 'ok', 'warn', 'err']) {
  ok(`admin.css --${name} 已定义`, () => assert.ok(tokenOf(adminCss, name), `admin.css 缺少 --${name}`));
}

// --- 主题 hack 的耦合契约（E-034 防复发）---
// site.css 的 `.rich-section h2::after` 用 `top: 5rem` 对齐主题锚点避让量
// （主题 `.markdown-body h2::before` 的 margin-top:-5rem + height:5rem 把文字推到盒内 78px 处）。
// 两端是硬耦合：主题一动，竖标就错位 70 多像素，而且不报错、构建照常成功。
// 这里把两端同时锁死：主题规则变了 → 报警要求重新实测校准；site.css 被按公式改小 → 报警。
const mainCssPath = path.join(ROOT, 'dist/css/main.css');

if (fs.existsSync(mainCssPath)) {
  const mainCss = fs.readFileSync(mainCssPath, 'utf8');
  const at = mainCss.indexOf('.markdown-body h2::before');
  const block = at === -1 ? '' : mainCss.slice(mainCss.indexOf('{', at), mainCss.indexOf('}', at));

  ok('主题锚点避让 hack 仍是 -5rem + visibility:hidden（文章页跳转依赖它）', () => {
    assert.ok(at !== -1, 'main.css 找不到 .markdown-body h2::before —— 主题升级改动了这条规则，'
      + '文章页的锚点跳转会失去避让，需复查 post 页面跳转位置');
    assert.match(block, /margin-top:\s*-5rem/, '避让量变了：不再是 -5rem');
    assert.match(block, /visibility:\s*hidden/, '避让 hack 不再隐藏 —— 文章页版式会变');
  });

  ok('模块页已把主题避让归零（.rich-section h2::before）', () => {
    const rule = siteCss.match(/\.rich-section h2::before\s*\{[^}]*\}/);
    assert.ok(rule, 'site.css 缺少 .rich-section h2::before 归零规则 —— 模块页每个标题上方会白留 80px');
    assert.match(rule[0], /margin-top:\s*0/, '避让未归零：margin-top 不是 0');
    assert.match(rule[0], /height:\s*0/, '避让未归零：height 不是 0');
  });

  ok('竖标 ::after 的 top 与归零状态联动（现为 .16em）', () => {
    const rule = siteCss.match(/\.rich-section h2::after\s*\{[^}]*\}/);
    assert.ok(rule, 'site.css 缺少 .rich-section h2::after 规则');
    assert.match(rule[0], /position:\s*absolute/, '竖标必须是 absolute，否则会进文档流、挤动版式');
    assert.match(rule[0], /top:\s*\.16em/, 'top 不是 .16em：'
      + '避让归零后盒顶比文字墨迹顶高约 4px，取 0 会视觉偏上、取 5rem 会掉到标题下方 78px。'
      + '撤销归零规则时此处必须改回 5rem');
  });
} else {
  console.log('  SKIP 主题 hack 耦合检查（无 dist/css/main.css，先跑 npm run astro:build）');
}

// 方向 A：墨底整屏区块（2026-10-19 落地，R-1 豁免的唯一一处反相）
ok('墨底 token 已定义（--surface-ink / --on-ink）', () => {
  assert.match(siteCss, /--surface-ink:\s*#1b1712/, '缺少 --surface-ink');
  assert.match(siteCss, /--on-ink:\s*#fdfaf4/, '缺少 --on-ink（墨底上的纸色）');
});

ok('墨底区块样式存在，且区块内不引入交互色', () => {
  // 按空行切块，只取含 .ink-band 的规则块——避免按字符数硬切时越界读到后面的 accent 规则。
  const blocks = siteCss.split(/\n\s*\n/).filter((b) => b.includes('.ink-band'));
  assert.ok(blocks.length > 0, 'site.css 缺少 .ink-band 规则');
  const band = blocks.join('\n');
  assert.match(band, /var\(--surface-ink\)/, '墨底没有用 --surface-ink');
  assert.ok(!/var\(--accent\)/.test(band),
    '墨底区块内出现了交互色 —— R-2：反相区块不得引入第二彩色，只用纸色透明度衍生');
});

// 首页主卡内容必须被行数上限锁死（E-090 防复发）。
// 主卡高度由 grid-auto-rows × 2 固定，且是 justify-content: flex-end + overflow: hidden：
// 内容一旦比卡片高，溢出方向是上边，FEATURED 元信息与标题顶部会被静默裁掉。
// 只有标题/摘要各自设上限，内容高度才是常量。
ok('首页主卡标题与摘要都有行数上限（E-090）', () => {
  // 2026-11-14：必须按「行首整条选择器」定位。无封面主卡新增了
  // `.wall-feature:not(.has-cover) .wall-feature-title` 覆盖，子串匹配会先命中它。
  const rule = (sel) => siteCss.match(new RegExp(`^\\s*${sel}\\s*\\{[^}]*\\}`, 'm'));
  const feature = rule('.wall-feature');
  const title = rule('.wall-feature-title');
  const desc = rule('.wall-feature-desc');
  assert.ok(feature, 'site.css 缺少 .wall-feature 规则');
  assert.match(feature[0], /padding:\s*24px/, '主卡内边距变了，需重新实测顶部留白');
  assert.ok(title, 'site.css 缺少 .wall-feature-title 规则');
  assert.match(title[0], /-webkit-line-clamp:\s*4/, '主卡标题没有 4 行上限：'
    + '超长标题会把内容顶到上边框，元信息被裁掉');
  assert.ok(desc, 'site.css 缺少 .wall-feature-desc 规则');
  assert.match(desc[0], /-webkit-line-clamp:\s*2/, '主卡摘要没有 2 行上限：'
    + '90 字摘要约 4 行，会把元信息顶出卡片');
});

// 2026-11-14（E-153）：主卡高度固定，短标题只有两行时内容约 280px，
// 原 justify-content: flex-end 会把 100px+ 空白全留在卡顶。无封面主卡必须
// 「元信息贴顶 + 标题组贴底」，否则空白会重新堆回顶部。
ok('首页无封面主卡：元信息贴顶（E-153）', () => {
  const body = siteCss.match(/\.wall-feature:not\(\.has-cover\)\s+\.wall-feature-body\s*\{[^}]*\}/);
  assert.ok(body, 'site.css 缺少 .wall-feature:not(.has-cover) .wall-feature-body 规则');
  assert.match(body[0], /flex:\s*1/, '无封面主卡内容体没有撑满卡高');
  const meta = siteCss.match(/\.wall-feature:not\(\.has-cover\)\s+\.wall-feature-meta\s*\{[^}]*\}/);
  assert.ok(meta, 'site.css 缺少 .wall-feature:not(.has-cover) .wall-feature-meta 规则');
  assert.match(meta[0], /margin-bottom:\s*auto/,
    '无封面主卡的元信息没有贴顶：短标题时卡顶会重新空出一大片');
  // 2026-11-14：空白改由正文填充。无封面卡标题 3 行 + 摘要 4 行是安全上限，
  // 两者之和仍小于内容高；若谁把行数调大，元信息会被顶出卡顶（E-090）。
  const titleNo = siteCss.match(/\.wall-feature:not\(\.has-cover\)\s+\.wall-feature-title\s*\{[^}]*\}/);
  assert.ok(titleNo, 'site.css 缺少无封面主卡标题的 3 行上限');
  assert.match(titleNo[0], /-webkit-line-clamp:\s*3/,
    '无封面主卡标题不是 3 行上限：与 4 行摘要叠加会溢出');
  const descNo = siteCss.match(/\.wall-feature:not\(\.has-cover\)\s+\.wall-feature-desc\s*\{[^}]*\}/);
  assert.ok(descNo, 'site.css 缺少无封面主卡摘要的 4 行上限');
  assert.match(descNo[0], /-webkit-line-clamp:\s*4/,
    '无封面主卡摘要不是 4 行：主卡会重新空掉下半张');
});

// 2026-11-14（E-153）：主卡是所有文章的固定容器，精选文章会轮换。最坏情况
// （标题顶满 3 行 + 摘要顶满 4 行）必须仍小于内容高，否则元信息会被卡顶裁掉。
// 把排版预算写成算术断言：任何一次调 --fs-hero / 行数上限 / 行高 / 行高 / padding，
// 都会在这里被拦下，不会等下一篇文章轮换到才发现。
ok('首页主卡最坏情况仍在卡高内（E-153）', () => {
  const px = (rem) => parseFloat(rem) * 16;
  const clampMax = siteCss.match(/--fs-hero:\s*clamp\([^)]*?([\d.]+)rem\)/);
  assert.ok(clampMax, '读不到 --fs-hero 的 clamp 上限');
  const heroFs = px(clampMax[1]);
  const wall = siteCss.match(/^\.wall\s*\{[^}]*\}/m)[0];
  const rows = parseFloat(wall.match(/grid-auto-rows:\s*(\d+)px/)[1]);
  const gap = parseFloat(wall.match(/gap:\s*(\d+)px/)[1]);
  const inner = rows * 2 + gap - 24 * 2;
  const title3 = heroFs * 1.12 * 3;
  const desc4 = px(0.94) * 1.85 * 4;
  // 元信息 / CTA 用继承行高 1.7 估算；标题与摘要的下边距按 1.15rem / 1.05rem。
  const fixed = px(0.76) * 1.7 + px(1.15) + title3 + px(1.05) + desc4 + px(0.85) * 1.7;
  assert.ok(fixed <= inner,
    `最坏情况内容高 ${fixed.toFixed(1)}px 超过卡内高 ${inner}px —— 下一篇文章轮换就会裁掉元信息`);
  assert.ok(inner - fixed >= 5,
    `最坏情况只剩 ${(inner - fixed).toFixed(1)}px 余量，排版一改就会溢出`);
});

// 2026-11-14（E-153）：全局 ::selection 用 --text-color（浅态是墨色），
// 落在墨底主卡 / 墨底带 / 压图文字上就是墨字压墨底——选中后文字整体消失。
ok('墨底容器选中态改用纸色（E-153）', () => {
  const rule = siteCss.match(/\.wall-feature::selection[^{]*\{[^}]*\}/);
  assert.ok(rule, 'site.css 缺少墨底主卡的 ::selection 覆盖');
  assert.match(rule[0], /color:\s*#fdfaf4/, '墨底主卡选中文字不是纸色，选中后不可读');
  assert.match(rule[0], /background:\s*rgba\(253,\s*250,\s*244/,
    '墨底主卡选中底不是纸色淡底，与墨底混在一起');
  assert.match(rule[0], /\.ink-band\s+::selection/, '墨底「最近更新」带未纳入选中态覆盖');
  assert.match(rule[0], /\.wall-cell-mask\s*~\s*\.wall-cell-body/,
    '压图入口格未纳入选中态覆盖');
});

// 2026-11-14（E-153 根因）：压缩器原正则 `\s*([{};:,>+~])\s*` 会把
// `.wall-feature ::selection` 压成 `.wall-feature::selection`——「后代」变「自身」，
// 卡内文字拿不到纸色选中样式，线上仍然墨字压墨底。这里锁死压缩语义。
ok('CSS 压缩器保留伪元素前的后代空格（E-153）', () => {
  const { minifyCss } = require(path.join(ROOT, 'themes/fluid/scripts/filters/minify-css.js'));
  const out = minifyCss('.card ::selection{color:#fdfaf4}');
  assert.match(out, /\.card ::selection/, '压缩后后代组合符被吃掉：' + out);
  assert.match(minifyCss('.card:hover{color:red}'), /\.card:hover/,
    '压缩后伪类前的选择器被改写');
  assert.match(minifyCss('.ink-band .feed-title:hover{color:red}'), /\.ink-band \.feed-title:hover/);
});

// 前台中文字号 ≥12px（VD-4 / T1-4）。中文小字低于 12px 在纸底上不可读，
// 这条锁死「新增样式时不许再写出 .7xrem 以下的中文」。
ok('前台字号全部 ≥12px（0.75rem）', () => {
  const bad = [];
  siteCss.split('\n').forEach((line, i) => {
    const m = line.match(/font-size:\s*([\d.]+)rem/);
    if (m && parseFloat(m[1]) < 0.75) bad.push(`L${i + 1}: ${m[1]}rem`);
  });
  assert.deepStrictEqual(bad, [], `存在 <12px 的字号：${bad.join(' / ')}`);
});

// 模块页页头字重必须与衬线标题轨同口径（600）。V5 标题轨收口到 600 后，
// 模块页页头仍是 700，衬线在 700 下笔画会糊（E-086）。
ok('模块页页头 H1 字重与标题轨一致（600）', () => {
  const rule = siteCss.match(/\.page-head-plain\s+\.page-head-title\s*\{[^}]*\}/);
  assert.ok(rule, 'site.css 缺少 .page-head-plain .page-head-title 规则');
  assert.match(rule[0], /font-weight:\s*600/,
    '模块页页头字重不是 600 —— 与全站衬线标题轨分叉，衬线 700 会加粗糊笔画');
});

// A10：头像圆形化（2026-10-21 主人确认）。圆角标尺的唯一例外，
// 且三件事是绑在一起的：圆形、去阴影、描边提到 --line-strong。
// 单独回退任一项都会让头像退化成「方卡贴圆角」或「圆形发虚」。
ok('头像是圆形、无阴影、描边走 hairline 墨量（A10）', () => {
  const rule = siteCss.match(/\.identity-avatar\s*\{[^}]*\}/);
  assert.ok(rule, 'site.css 缺少 .identity-avatar 规则');
  assert.match(rule[0], /border-radius:\s*50%/, '头像不是圆形 —— A10 已确认圆形化');
  assert.ok(!/box-shadow/.test(rule[0]),
    '头像还带着阴影：纸面体系里阴影只归浮层与可提起元素，圆形 + 阴影会发虚');
  assert.match(rule[0], /border:\s*1px solid var\(--line-strong\)/,
    '头像描边不是 1px --line-strong：圆形弧线感知弱于直线，'
    + '沿用 chip border 的墨 .10 会让边界发虚，须取 hairline 的墨 .24');
});

ok('圆角标尺：50% 只允许出现在头像一处 + §4.15 纹样块的几何作图（DESIGN §6.4）', () => {
  // 2026-10-27 节日纹样（§4.15 .fs-figure--css / .fs-fig-*）在 aria-hidden 装饰块内
  // 用 50% 画圆 / 拱弧——这是绘图手段不是容器圆角，DESIGN §6.4 明确不归头像例外管辖、
  // 验收以 .fs-fig-* 子元素规则为界。这里把 §4.15 段整体豁免，但两条底线不豁免：
  //   ① §4.15 之外 50% 仍然只允许头像一处；
  //   ② 纹样容器 .fs-figure-media 自身的圆角必须走 --r-tile（12px），不得 50%。
  const s15 = siteCss.indexOf('===== 4.15 节日文化页');
  const s5 = siteCss.indexOf('===== 5. 第三方组件纸面化');
  assert.ok(s15 > -1 && s5 > s15, 'site.css 找不到 §4.15 段——豁免范围判定失效');
  const outside = siteCss.slice(0, s15) + siteCss.slice(s5);
  const hits = outside.split('\n')
    .map((l, i) => ({ l: l.trim(), n: i + 1 }))
    .filter((x) => /border-radius:\s*50%/.test(x.l))
    .filter((x) => !x.l.startsWith('/*') && !x.l.startsWith('*'));
  assert.strictEqual(hits.length, 1,
    `§4.15 之外 50% 圆角出现在 ${hits.length} 处（L${hits.map((h) => h.n).join(', L')}）`
    + ' —— 圆角标尺的唯一例外是头像，不得扩散到其他容器');
  const media = siteCss.match(/\.fs-figure-media\s*\{[^}]*\}/);
  assert.ok(media, 'site.css 缺 .fs-figure-media 规则');
  assert.ok(!/50%/.test(media[0]), '纹样容器 .fs-figure-media 的圆角不得用 50%（须走 --r-tile）');
  assert.match(media[0], /border-radius:\s*var\(--r-tile\)/, '纹样容器圆角不是 var(--r-tile)');
});

ok('头像 96px 是 84px 的面积补偿（圆形 π/4≈0.785），不得无依据改尺寸', () => {
  const rule = siteCss.match(/\.identity-avatar\s*\{[^}]*\}/);
  assert.match(rule[0], /width:\s*96px/, '头像宽度不是 96px');
  assert.match(rule[0], /height:\s*96px/, '头像高度不是 96px');
  // 反算依据：84 / Math.sqrt(Math.PI / 4) = 94.75 → 取整 96 上下，
  // 断言锁定「宽高相等」这一真正约束，防止改成椭圆。
  const w = rule[0].match(/width:\s*(\d+)px/);
  const h = rule[0].match(/height:\s*(\d+)px/);
  assert.strictEqual(w[1], h[1], '头像宽高不相等 —— border-radius:50% 会渲染成椭圆');
});

// --- E-092：首屏左栏与内容墙共用上下边线（2026-11-01）---
// 内容墙高度恒为 2×196 + 14 = 406px。身份域只要带纵向内边距（原 1rem 0），
// 或头像下边距回到 1.6rem，左栏总高就会超过 406，两栏上下沿立刻错开
// （实测曾出现头像顶比墙顶低 16px、CTA 底比墙底低 53px）。这里锁死「零纵向内边距」，
// 与 E-072「内容墙固定行高与主卡跨行成对」构成闭环：
// 墙高变了会被 E-072 报，左栏预算变了会被本条报。
// 注意：站名换行行数 / tagline 文案长度变化不在本断言内，改动后须用
// Edge headless + CDP 量两栏上下沿坐标（做法见 ERRORS E-092），不能凭截图判断。
ok('首屏左栏与右墙共用基线：.identity 不得带纵向内边距（E-092）', () => {
  const rule = siteCss.match(/\.identity\s*\{[^}]*\}/);
  assert.ok(rule, 'site.css 缺少 .identity 规则');
  assert.match(rule[0], /padding:\s*0/, '身份域又有了内边距 —— 左栏会超出 406px 墙高，'
    + '首屏两栏上下沿将再次错开（E-092）');
  const av = siteCss.match(/\.identity-avatar\s*\{[^}]*\}/);
  assert.match(av[0], /margin-bottom:\s*1rem/, '头像下边距不是 1rem —— '
    + '纵向预算已按 406px 重算，改回 1.6rem 会让左栏重新高于内容墙（E-092）');
});

// --- E-040：站名词中断行（2026-10-21 主人反馈「Personal 都没在一行出现」）---
// 两件事绑死：① .identity-name 禁用 overflow-wrap:anywhere——它击穿 flex 子项的
// min-content（塌成 1 字符宽），同行元素一挤压就从词中间断行；
// ② A9 身份词铭牌已于 2026-10-21 被主人整块撤回（原话「01 Developer / 02 Writer
// 这哪好看」），模板不再渲染、样式整体删除；site.yml 的 identity_words 数据保留
// 但不渲染。这里锁死「样式不得静默回归」——.identity-words 重新出现在 site.css
// 即 FAIL：要恢复身份词展示，须先走 DESIGN-LANGUAGE §10 拍板流程并同步更新本断言。
ok('站名不得词中断行：.identity-name 禁用 overflow-wrap:anywhere（E-040）', () => {
  const rule = siteCss.match(/\.identity-name\s*\{[^}]*\}/);
  assert.ok(rule, 'site.css 缺少 .identity-name 规则');
  assert.ok(!/overflow-wrap:\s*anywhere/.test(rule[0]),
    '.identity-name 用了 overflow-wrap:anywhere —— 它把 flex 子项 min-content 击穿成 1 字符，'
    + '站名会被同行元素挤压成词中断行（线上曾显示成 Persona / l Space）。'
    + '超长单词保护用 break-word，不参与 min-content 塌陷');
});

// --- E-156：Bento 首屏三格必须同占两行（2026-11-14）---
// 只写 grid-column、漏 grid-row: span 2 时，「现在在做」缩成 196px，
// 入口格回填到首屏第二行，拼版整块错位；构建、既有断言与截图目测都不报错。
ok('Bento 首屏：现在在做与主卡同占两行、入口格各 3 列（E-156）', () => {
  const wall = siteCss.match(/^\.wall\s*\{[^}]*\}/m);
  assert.ok(wall, 'site.css 缺少 .wall 规则');
  assert.match(wall[0], /grid-template-columns:\s*repeat\(12,/,
    '首屏不是 12 列 Bento 网格');
  const now = siteCss.match(/^\.wall-now\s*\{[^}]*\}/m);
  assert.ok(now, 'site.css 缺少 .wall-now 规则');
  assert.match(now[0], /grid-row:\s*span 2/,
    '「现在在做」没有跨 2 行 —— 它会缩成 196px，入口格回填进首屏第二行');
  const cell = siteCss.match(/^\.wall-cell\s*\{[^}]*\}/m);
  assert.ok(cell, 'site.css 缺少 .wall-cell 规则');
  assert.match(cell[0], /grid-column:\s*span 3/,
    '入口格没有占 3 列 —— 四个模块格铺不满一行');
});

ok('A9 身份词铭牌样式不得回归（2026-10-21 主人撤回）', () => {
  assert.ok(!/\.identity-words/.test(siteCss),
    'site.css 出现了 .identity-words 规则 —— A9 铭牌已被主人整块撤回'
    + '（数据在 site.yml 保留但不渲染，首页模板已删除该块）。'
    + '如确需恢复身份词展示，先在 DESIGN-LANGUAGE §10 走拍板流程，再同步更新本断言');
});

// --- E-041：主卡标题尺度档回落（2026-10-21 主人反馈「太大、刺眼」）---
// --fs-hero 是单入口 token，但「改代码不改文档」曾让字阶表与实际值漂移过
// （D1-/D3 两行都漂过）。这里把代码值与 DESIGN-LANGUAGE 字阶表锁成一致：
// 只改一边即 FAIL，每一次调档都被迫显式过一次文档，不留静默漂移空间。
ok('--fs-hero 与 DESIGN-LANGUAGE 字阶表一致（E-041）', () => {
  const cssVal = tokenOf(siteCss, 'fs-hero');
  assert.ok(cssVal, 'site.css 缺少 --fs-hero');
  const doc = read('DESIGN-LANGUAGE.md');
  const row = doc.split('\n').find((l) => l.includes('--fs-hero'));
  assert.ok(row, 'DESIGN-LANGUAGE.md 字阶表缺少 --fs-hero 行');
  const m = row.match(/`(clamp\([^`]+\))`/);
  assert.ok(m, `字阶表行里找不到 clamp() 值：${row.trim()}`);
  assert.strictEqual(m[1], cssVal,
    `--fs-hero 代码与文档不一致：site.css=${cssVal} / DESIGN-LANGUAGE=${m[1]}。`
    + '调档必须两处同步改（E-041：方向 B 的 5.5rem 档已因刺眼回落，断崖主张暂停）');
});

// --- E-071：首页 <body class="is-home"> 必须原样输出 ---
// 模板里用不转义的输出拼 class；一旦改成转义输出，引号被转成 &#34;，
// 浏览器解析出的 class 名不是 is-home，`body.is-home footer` 永不命中，
// 首页会同时出现 .home-end 与全局页脚——构建不报错、退出码 0，只有看产物能发现。
const indexPath = path.join(ROOT, 'dist/index.html');
if (fs.existsSync(indexPath)) {
  const homeHtml = fs.readFileSync(indexPath, 'utf8');
  ok('首页产物 <body class="is-home"> 未被 HTML 转义（E-071）', () => {
    assert.match(homeHtml, /<body class="is-home"/,
      'dist/index.html 缺 <body class="is-home"> —— BaseLayout 可能又用回会转义的输出，'
      + '引号转义后 body.is-home 永不命中，首页双页脚会回归');
    assert.ok(!/class=&#34;/.test(homeHtml),
      '产物出现 class=&#34; —— 属性引号被转义输出吃掉（E-071）');
  });
  ok('非首页产物不得带 is-home 类', () => {
    const aboutPath = path.join(ROOT, 'dist/about/index.html');
    if (!fs.existsSync(aboutPath)) return;
    const html = fs.readFileSync(aboutPath, 'utf8');
    assert.ok(!/class="is-home"/.test(html),
      '非首页产物带了 is-home —— 全局页脚会被误藏（is_home() 判定或模板拼接出错）');
  });
} else {
  console.log('  SKIP 首页 is-home 产物断言（无 dist/index.html，先跑 npm run astro:build）');
}

ok('首页页脚收口规则存在：body.is-home footer 隐藏（E-071 另一半）', () => {
  const rule = siteCss.match(/body\.is-home footer\s*\{[^}]*\}/);
  assert.ok(rule, 'site.css 缺少 body.is-home footer 规则 —— 首页会同时出现 .home-end 与全局页脚');
  assert.match(rule[0], /display:\s*none/, 'body.is-home footer 没有 display:none');
});

// --- E-072：内容墙固定行高与主卡跨行必须成对出现 ---
// 行高改成固定像素后，min-height 大于行高的主卡必须显式跨行；
// 两条规则分居「基础」与「≤991 媒体块」，只改一条而漏另一条不会有任何报错。
function extractBraced(css, openBraceIdx) {
  let depth = 0;
  for (let i = openBraceIdx; i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(openBraceIdx + 1, i);
    }
  }
  return '';
}

ok('内容墙固定行高与主卡跨行成对（E-072）', () => {
  const base = siteCss.match(/\.wall\s*\{[^}]*\}/);
  assert.ok(base, 'site.css 缺少 .wall 规则');
  assert.match(base[0], /grid-auto-rows:\s*\d+px/,
    '.wall 行高不是固定像素值 —— 退回 auto/minmax 后每行被内容撑高，行基线不齐（D-4 回归）');

  const q = '@media (max-width: 991.98px) {';
  let block = null;
  let from = 0;
  for (;;) {
    const at = siteCss.indexOf(q, from);
    if (at === -1) break;
    const body = extractBraced(siteCss, siteCss.indexOf('{', at));
    if (body.includes('.wall {')) { block = body; break; }
    from = at + q.length;
  }
  assert.ok(block, 'site.css 找不到 ≤991 且含 .wall 的媒体块');
  assert.match(block, /\.wall\s*\{[^}]*grid-auto-rows:\s*\d+px/,
    '≤991 的 .wall 行高不是固定像素值（与基础档不一致）');
  const feat = block.match(/\.wall-feature\s*\{[^}]*\}/);
  assert.ok(feat, '≤991 媒体块缺少 .wall-feature 规则');
  assert.match(feat[0], /grid-row:\s*span 2/,
    '≤991 的 .wall-feature 没有 grid-row: span 2 —— 行高固定后 300px 主卡会溢出到'
    + '下一行、被自动排布的小格盖住（E-072）');
});

// E-104：面包屑分隔符曾用 `.cal-crumb span` 兜整类，特异性 (0,1,1) 压过
// `.cal-crumb-now` (0,1,0)，把「当前页名」也染成 22% 墨（对纸 1.6:1，等于看不见）。
// 锁三件事：分隔符不得再用元素名兜类、必须仍由 aria-hidden 定位、当前页名回到正文墨色。
ok('面包屑当前页不得被分隔符规则压成淡色（E-104）', () => {
  // 注释里会写到这条选择器本身（就是本条错误的说明），比对前先剥掉注释
  const css = siteCss.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    !/\.cal-crumb\s+span\b/.test(css),
    '.cal-crumb span 这类元素名兜底规则会压过 .cal-crumb-now（特异性 0,1,1 > 0,1,0）'
    + '——分隔符请用 [aria-hidden=\'true\'] 定位'
  );
  assert.match(
    css,
    /\.cal-crumb \[aria-hidden=['"]true['"]\]/,
    '分隔符定位丢失：斜杠会继承正文色，与当前页名同级，面包屑的层级就没了'
  );
  assert.match(
    css,
    /\.cal-crumb-now\s*\{[^}]*color:\s*var\(--text-color\)/,
    '.cal-crumb-now 不再指向 --text-color：当前页名会被压成次级色或更淡'
  );
});

// E-107：入口格标签原先是自由换行的 span，模块名一长就在 165px 的格子里折成三行
// （「最新 · Esports Manager 2026 mods」实测三行），把下面的格名顶到照片水印上。
// 标签是「这一格装什么」的一行索引，锁死单行省略：nowrap + hidden + ellipsis 三者缺一，
// 长名字就会重新撑开格子。
ok('入口格标签必须单行省略（E-107）', () => {
  const css = siteCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = css.match(/\.wall-cell-tag\s*\{([^}]*)\}/);
  assert.ok(m, '.wall-cell-tag 规则丢失');
  assert.match(m[1], /white-space:\s*nowrap/, '标签必须 nowrap：否则长模块名会折行撑高格子');
  assert.match(m[1], /overflow:\s*hidden/, '标签必须 overflow: hidden，否则省略号不生效');
  assert.match(m[1], /text-overflow:\s*ellipsis/, '标签必须 text-overflow: ellipsis');
});

console.log(`\nRESULT: ${passed} 项断言通过${process.exitCode ? '，存在失败' : ''}`);
process.exit(process.exitCode || 0);
