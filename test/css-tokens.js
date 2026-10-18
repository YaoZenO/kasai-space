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

  ok('竖标 ::after 的 top 与归零状态联动（现为 0）', () => {
    const rule = siteCss.match(/\.rich-section h2::after\s*\{[^}]*\}/);
    assert.ok(rule, 'site.css 缺少 .rich-section h2::after 规则');
    assert.match(rule[0], /position:\s*absolute/, '竖标必须是 absolute，否则会进文档流、挤动版式');
    assert.match(rule[0], /top:\s*0(?:;|\s)/, 'top 不是 0：避让已归零、文字在盒顶，'
      + 'top 必须同步为 0，否则竖标掉到标题下方 78px（改归零规则时此处必须一起改）');
  });
} else {
  console.log('  SKIP 主题 hack 耦合检查（无 public/css/main.css，先跑 hexo generate）');
}

console.log(`\nRESULT: ${passed} 项断言通过${process.exitCode ? '，存在失败' : ''}`);
process.exit(process.exitCode || 0);
