'use strict';
// Markdown ⇄ 块 往返幂等性锁定（E-010 同类风险：往返不幂等会让「打开即保存」
// 产生大面积伪 diff，把用户原文改花）。
// 覆盖：纯文本 / 独立图片行 / 行内图片 / 首尾图片 / 改 alt / 空正文 / CRLF。
//
// 运行：node test/md-blocks.js

const assert = require('node:assert');
// Node 22.12+ 起 require() 可直接加载 ESM（无顶层 await），这里复用的正是
// 浏览器端同一个文件，避免「测试跑的是另一份拷贝」的假保证。
const { parseBlocks, serializeBlocks } = require('../source/admin/admin-md-blocks.js');

const roundtrip = (md) => serializeBlocks(parseBlocks(md));

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

console.log('Markdown ⇄ 块 往返（admin-md-blocks）');

const plain = '# 标题\n\n第一段。\n\n第二行 A\n第二行 B\n';
ok('纯文本往返逐字一致', () => assert.strictEqual(roundtrip(plain), plain));

const withImg = 'para1\n\n![alt 文字](/img/posts/a.jpg)\n\npara2\n';
ok('独立图片行往返逐字一致', () => assert.strictEqual(roundtrip(withImg), withImg));

const inline = '段落里有 ![inline](/img/x.png) 一张图，还有文字。\n\n另一段。\n';
ok('行内图片留在文字块，往返一致', () => assert.strictEqual(roundtrip(inline), inline));

const headImg = '![封面](/img/cover.jpg)\n\n正文第一段。\n';
ok('文件开头图片往返一致', () => assert.strictEqual(roundtrip(headImg), headImg));

const tailImg = '正文最后一段。\n\n![尾图](/img/tail.jpg)\n';
ok('文件结尾图片往返一致', () => assert.strictEqual(roundtrip(tailImg), tailImg));

ok('CRLF 归一为 LF（良性规范化）', () => {
  const crlf = 'a\r\n\r\n![x](/img/y.png)\r\n\r\nb\r\n';
  assert.strictEqual(roundtrip(crlf), 'a\n\n![x](/img/y.png)\n\nb\n');
});

ok('空正文往返为单个换行', () => assert.strictEqual(roundtrip(''), '\n'));
ok('无尾换行的正文补上尾换行（POSIX 惯例）', () => assert.strictEqual(roundtrip('abc'), 'abc\n'));

ok('改 alt 后输出标准 Markdown 形式', () => {
  const blocks = parseBlocks(withImg);
  const img = blocks.find((b) => b.type === 'image');
  img.alt = '新说明';
  img.touched = true;
  assert.strictEqual(serializeBlocks(blocks), 'para1\n\n![新说明](/img/posts/a.jpg)\n\npara2\n');
});

ok('从未输入的新空文字块不产生空行', () => {
  const blocks = [{ type: 'text', text: '', fresh: true }, { type: 'text', text: '正文' }];
  assert.strictEqual(serializeBlocks(blocks), '正文\n');
});

ok('图片块被删后不残留引用、不翻倍空行', () => {
  const blocks = parseBlocks(withImg).filter((b) => b.type !== 'image');
  assert.strictEqual(serializeBlocks(blocks), 'para1\n\npara2\n');
});

ok('多张图片顺序可感知（解析出正确数量与顺序）', () => {
  const md = 'a\n\n![1](/img/1.png)\n\nb\n\n![2](/img/2.png)\n\nc\n';
  const imgs = parseBlocks(md).filter((b) => b.type === 'image');
  assert.deepStrictEqual(imgs.map((i) => i.path), ['/img/1.png', '/img/2.png']);
  assert.strictEqual(serializeBlocks(parseBlocks(md)), md);
});

console.log(`\nRESULT: ${passed} 项断言通过${process.exitCode ? '，存在失败' : ''}`);
process.exit(process.exitCode || 0);
