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
const mainCssPath = path.join(ROOT, 'public/css/main.css');

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
  console.log('  SKIP 主题 hack 耦合检查（无 public/css/main.css，先跑 hexo generate）');
}

// 方向 A：墨底整屏区块（2026-10-19 落地，R-1 豁免的唯一一处反相）
ok('墨底 token 已定义（--surface-ink / --on-ink）', () => {
  assert.match(siteCss, /--surface-ink:\s*#2a251d/, '缺少 --surface-ink');
  assert.match(siteCss, /--on-ink:\s*#f5f1e9/, '缺少 --on-ink（墨底上的纸色）');
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

console.log(`\nRESULT: ${passed} 项断言通过${process.exitCode ? '，存在失败' : ''}`);
process.exit(process.exitCode || 0);
