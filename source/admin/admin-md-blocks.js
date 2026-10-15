/* Markdown ⇄ 块 的纯转换（无 DOM 依赖，可在 Node 下单测）。
 * 由 admin-composer.js 消费；test/md-blocks.js 锁定往返幂等性。
 *
 * 约定：
 *  - 只把「独占一行且前后均为空行」的图片提为图片块；行内图片留在文字块中原样保留。
 *  - 文字块首尾空行剥离，块间以一个空行连接；未被编辑过的图片块原样输出 rawLine。
 *  - CRLF 归一为 LF（良性规范化，Hexo 渲染无差别）。
 *  因此「打开文章 → 不改正文 → 保存」与原文在渲染层面等价，不产生伪 diff。
 */
'use strict';

const IMG_LINE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

function stripBlankEdges(text) {
  return String(text || '').replace(/^\n+/, '').replace(/\n+$/, '');
}

export function parseBlocks(md) {
  const src = String(md || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
  if (!src) return [{ type: 'text', text: '', fresh: true }];
  const lines = src.split('\n');
  const blocks = [];
  let buf = [];
  const flush = () => {
    if (buf.length) {
      const text = stripBlankEdges(buf.join('\n'));
      if (text) blocks.push({ type: 'text', text });
      buf = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : '';
    const next = i < lines.length - 1 ? lines[i + 1] : '';
    const m = line.trim().match(IMG_LINE_RE);
    if (m && prev.trim() === '' && next.trim() === '') {
      flush();
      blocks.push({ type: 'image', path: m[2], alt: m[1], rawLine: line });
    } else {
      buf.push(line);
    }
  }
  flush();
  return blocks.length ? blocks : [{ type: 'text', text: '', fresh: true }];
}

export function serializeBlocks(blocks) {
  const parts = [];
  for (const b of blocks || []) {
    if (b.type === 'image') {
      parts.push(b.touched || !b.rawLine ? `![${b.alt || ''}](${b.path})` : b.rawLine);
    } else if (b.text || !b.fresh) {
      // 用户清空的旧块保留一个空行；只有从未输入过的新块才跳过
      parts.push(b.text);
    }
  }
  return parts.join('\n\n') + '\n';
}
