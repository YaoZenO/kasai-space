// 文章成品守卫：正文不得出现过程/占位措辞，front matter 日期不得晚于当前时间。
// 用法：node test/post-content-guard.js
'use strict';

const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '..', 'source', '_posts');
const BANNED = [
  ['需核实', '草稿占位词'],
  ['待确认', '草稿占位词'],
  ['TODO', '草稿占位词'],
  ['后续篇目', '写给自己的进度备注'],
  ['待补', '写给自己的进度备注'],
  ['本篇', '系列过程措辞'],
  ['后续补链接', '系列过程措辞'],
];

const errors = [];

function splitFrontMatter(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return { front: '', body: text };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { front: '', body: text };
  return {
    front: text.slice(4, end),
    body: text.slice(end + 4),
  };
}

function parseDate(front) {
  const match = front.match(/^date:\s*(.+?)\s*$/m);
  if (!match) return { date: null, raw: null };

  const raw = match[1].replace(/^['"]|['"]$/g, '');
  const normalized = raw
    .replace(/^(\d{4}-\d{2}-\d{2})$/, '$1T00:00:00+08:00')
    .replace(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/, '$1T$2+08:00');

  const date = new Date(normalized);
  return { date: Number.isNaN(date.getTime()) ? null : date, raw };
}

const files = fs.readdirSync(POSTS_DIR).filter((name) => name.endsWith('.md'));

for (const name of files) {
  const fullPath = path.join(POSTS_DIR, name);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const { front, body } = splitFrontMatter(raw);

  for (const [word, reason] of BANNED) {
    const lines = body.split('\n');
    lines.forEach((line, index) => {
      if (line.includes(word)) {
        errors.push(`${name}:${index + 1} 正文出现「${word}」（${reason}）`);
      }
    });
  }

  const { date, raw: rawDate } = parseDate(front);
  if (!date) {
    errors.push(`${name}: front matter 缺少可解析的 date（读到：${rawDate || '无'}）`);
  } else if (date.getTime() > Date.now()) {
    errors.push(
      `${name}: date ${date.toISOString()} 晚于当前时间 ${new Date().toISOString()}`
    );
  }
}

if (errors.length) {
  console.error(`文章成品守卫失败：${errors.length} 项`);
  errors.forEach((line) => console.error(`  - ${line}`));
  process.exit(1);
}

console.log(`文章成品守卫通过：${files.length} 篇，无占位措辞、无未来日期`);
