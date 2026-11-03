'use strict';
// 文章 front matter 解析与序列化。
// 规则：只接管 title/date/tags/categories 四个已知字段并原位替换；
// 其余未知 front matter 行原样保留；正文原样保留。
// 永久链接稳定性：文件名与 date 由调用方锁定，本层不做任何变更。

const KNOWN = ['title', 'date', 'tags', 'categories', 'featured', 'cover', 'pinned'];

function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, unknownLines: [], body: text, hasFrontMatter: false };
  const fmLines = m[1].split(/\r?\n/);
  const fm = {};
  const unknownLines = [];
  for (const line of fmLines) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) {
      unknownLines.push(line);
      continue;
    }
    const key = kv[1];
    let val = kv[2].trim();
    if (KNOWN.includes(key)) {
      if (key === 'featured') {
        fm.featured = val === 'true' || val === true;
      } else if (key === 'pinned') {
        // 置顶存的是「标记日期」（YYYY-MM-DD），首页据此算 60 天租期。
        // true 也接受（由域层补成当天），false / 空串视为未置顶。
        const pv = val.replace(/^["']|["']$/g, '');
        fm.pinned = (pv === 'true') ? true : (pv === 'false' || pv === '') ? false : pv;
      } else if (val.startsWith('[') && val.endsWith(']')) {
        const inner = val.slice(1, -1).trim();
        fm[key] = inner ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
      } else {
        fm[key] = val.replace(/^["']|["']$/g, '');
      }
    } else {
      unknownLines.push(line);
    }
  }
  return { fm, unknownLines, body: m[2], hasFrontMatter: true };
}

function serializeScalar(v) {
  const s = String(v == null ? '' : v);
  if (s === '') return '""';
  if (/[:#{}\[\]&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s)) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return s;
}

function serializeList(arr) {
  return '[' + arr.map((v) => serializeScalar(v)).join(',') + ']';
}

// 用新值替换已知字段，未知行插回已知字段块之后
function serializeFrontMatter(fm, unknownLines) {
  const lines = [];
  if (fm.title !== undefined) lines.push(`title: ${serializeScalar(fm.title)}`);
  if (fm.date !== undefined && fm.date !== '') lines.push(`date: ${serializeScalar(fm.date)}`);
  if (fm.tags !== undefined) lines.push(`tags: ${Array.isArray(fm.tags) ? serializeList(fm.tags) : serializeScalar(fm.tags)}`);
  if (fm.categories !== undefined) lines.push(`categories: ${Array.isArray(fm.categories) ? serializeList(fm.categories) : serializeScalar(fm.categories)}`);
  if (fm.featured !== undefined && fm.featured !== null) lines.push(`featured: ${fm.featured ? 'true' : 'false'}`);
  if (fm.cover !== undefined && fm.cover !== null && fm.cover !== '') lines.push(`cover: ${serializeScalar(fm.cover)}`);
  // 置顶：只在真的有值时才写行。取消置顶（false / null / 空）不写，
  // 靠「字段不存在」表达——比留一行 pinned: false 更干净。
  if (fm.pinned !== undefined && fm.pinned !== null && fm.pinned !== false && fm.pinned !== '') {
    lines.push(`pinned: ${fm.pinned === true ? 'true' : serializeScalar(fm.pinned)}`);
  }
  for (const l of unknownLines || []) lines.push(l);
  return `---\n${lines.join('\n')}\n---\n`;
}

function updatePostText(text, patch) {
  const { fm, unknownLines, body, hasFrontMatter } = parseFrontMatter(text);
  const merged = Object.assign({}, fm, patch.fm || {});
  const head = serializeFrontMatter(merged, unknownLines);
  return head + (patch.body !== undefined ? patch.body : body || '');
}

// 从文本提取标题（front matter title 优先，其次首个 # 标题，最后文件名）
function extractTitle(text, fallback) {
  const { fm } = parseFrontMatter(text);
  if (fm.title) return fm.title;
  const h1 = text.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return fallback;
}

module.exports = { parseFrontMatter, serializeFrontMatter, updatePostText, extractTitle };
