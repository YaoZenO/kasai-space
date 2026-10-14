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

console.log(`\nRESULT: ${passed} 项断言通过${process.exitCode ? '，存在失败' : ''}`);
process.exit(process.exitCode || 0);
