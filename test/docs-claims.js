'use strict';
// 文档引用可核对性锁定（E-015 防复发）。
// 目的：账本里曾出现「PRD『发布前验证』要求有技术抓手」这种凭空引用——
// PRD.md 里根本没有该条款。这类句子不报错、不影响构建，谁都不会发现，
// 直到有人拿它当验收依据。这里用断言把「引用外部文档必须给出位置」变成硬失败。
//
// 规则：ENGINEERING.md 中凡出现 PRD / 产品需求 字样的行，
//       同行内必须有可核对的位置——§ 章节号、成对的「」原文，或 PRD.md:行号。
//
// 运行：node test/docs-claims.js

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TARGET = 'ENGINEERING.md';

const text = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
const lines = text.split(/\r?\n/);

// 可核对位置的三种形态
const hasSection = (s) => s.includes('§');
const hasQuote = (s) => /「[^」]*」/.test(s);
const hasFileLine = (s) => /PRD\.md:\d+/.test(s);

const offenders = [];
lines.forEach((line, i) => {
  if (!/PRD|产品需求/.test(line)) return;
  if (hasSection(line) || hasQuote(line) || hasFileLine(line)) return;
  offenders.push(`${i + 1}: ${line.trim()}`);
});

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

console.log('文档引用可核对性（ENGINEERING.md）');

ok(`${TARGET} 中所有 PRD 引用均给出可核对位置`, () => {
  assert.strictEqual(
    offenders.length,
    0,
    `以下行提到 PRD 却没有给出 § 章节号 / 「」原文 / PRD.md:行号：\n  ${offenders.join('\n  ')}`,
  );
});

// 反向锁：断言本身必须真的能抓到违规，否则规则是空转的
ok('规则对无位置的引用确实会失败（自检）', () => {
  const bad = '验收标准：PRD 要求支持预览部署';
  assert.ok(/PRD|产品需求/.test(bad), '自检样本应命中关键词');
  assert.ok(
    !(hasSection(bad) || hasQuote(bad) || hasFileLine(bad)),
    '自检样本不应被判定为合规',
  );
});

console.log(`\nRESULT: ${passed} 项断言通过${process.exitCode ? '，存在失败' : ''}`);
process.exit(process.exitCode || 0);
