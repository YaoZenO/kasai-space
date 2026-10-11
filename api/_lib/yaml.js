'use strict';
// 数据模块 YAML 手术：只重写 items: 列表，完整保留文件头部注释与其他行。
// 支持的 value 形态：标量 / flow 数组（[a, b]）/ 块标量（key: |-）/ 对象块列表（links: - label/url）。
// 遇到不认识的行报错而不是猜；不假设具体 schema（字段白名单由 validate.js 按模块定义）。

function splitItemsBlock(text) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^items:\s*(\[\s*\])?\s*(#.*)?$/.test(l));
  if (idx === -1) throw new Error('YAML_NO_ITEMS_KEY');
  const header = lines.slice(0, idx);
  const body = lines.slice(idx + 1);
  return { header, body };
}

function indentOf(line) {
  return (line.match(/^(\s*)/) || ['', ''])[1].length;
}

function parseScalar(raw) {
  let v = (raw || '').trim();
  if (v === '' || v === '~' || v === 'null') return '';
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    try {
      return JSON.parse(v);
    } catch (e) {
      return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  // 去掉行内注释（" #" 分隔；URL 片段 # 不受影响）
  const hash = v.indexOf(' #');
  if (hash !== -1) v = v.slice(0, hash).trim();
  return v;
}

function parseFlowList(raw) {
  let v = (raw || '').trim();
  if (v === '' || v === '[]') return [];
  if (!(v.startsWith('[') && v.endsWith(']'))) return [parseScalar(v)];
  const inner = v.slice(1, -1);
  const out = [];
  let cur = '';
  let inStr = false;
  let quote = '';
  for (const ch of inner) {
    if (inStr) {
      if (ch === quote) inStr = false;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
    } else if (ch === ',') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// 键值行：冒号后必须跟空格或行尾——否则是含冒号的纯标量（如 URL），不能当成对象字段
const KV_RE = /^([A-Za-z_][\w-]*):(?:\s+(.*))?\s*$/;
const BLOCK_SCALAR_RE = /^[|>][+-]?\d*$/;

function parseItems(text) {
  const { body } = splitItemsBlock(text);
  const items = [];
  let current = null;
  const st = { blockKey: null, blockIndent: 0, blockLines: [], listKey: null, listIndent: 0, listRows: [], listRow: null };

  const flushBlock = () => {
    if (current && st.blockKey !== null) {
      const lines = st.blockLines.slice();
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      current[st.blockKey] = lines.join('\n');
    }
    st.blockKey = null;
    st.blockLines = [];
  };
  const flushList = () => {
    if (current && st.listKey !== null) {
      if (st.listRow) st.listRows.push(st.listRow);
      current[st.listKey] = st.listRows;
    }
    st.listKey = null;
    st.listRows = [];
    st.listRow = null;
  };

  // 把 key/value 写入 current；块标量与块列表在此开头，由外层状态机续行
  const assign = (key, rawVal, keyIndent, lineIdx) => {
    const v = (rawVal || '').trim();
    if (BLOCK_SCALAR_RE.test(v)) {
      st.blockKey = key;
      st.blockIndent = keyIndent;
      st.blockLines = [];
      return;
    }
    if (v.startsWith('[') && v.endsWith(']')) {
      current[key] = parseFlowList(v);
      return;
    }
    if (v === '') {
      // 空值：向后看第一个非空行，若是更深缩进的 "- " 则视为对象块列表
      let j = lineIdx + 1;
      while (j < body.length && !body[j].trim()) j++;
      if (j < body.length) {
        const m = body[j].match(/^(\s*)-\s+(.*)$/);
        if (m && indentOf(body[j]) > keyIndent) {
          st.listKey = key;
          st.listIndent = keyIndent;
          st.listRows = [];
          st.listRow = null;
          return;
        }
      }
      current[key] = '';
      return;
    }
    current[key] = parseScalar(v);
  };

  for (let i = 0; i < body.length; i++) {
    const line = body[i];

    // —— 块标量内容行（空行保留；更深缩进归内容；否则块结束）——
    if (st.blockKey !== null) {
      if (line.trim() === '') { st.blockLines.push(''); continue; }
      if (indentOf(line) > st.blockIndent) {
        st.blockLines.push(line.slice(st.blockIndent + 2).replace(/\s+$/, ''));
        continue;
      }
      flushBlock();
    }

    // —— 对象块列表内容行 ——
    if (st.listKey !== null) {
      if (line.trim() === '') continue;
      if (indentOf(line) > st.listIndent) {
        const dash = line.trim().match(/^-\s*(.*)$/);
        if (dash) {
          if (st.listRow) st.listRows.push(st.listRow);
          st.listRow = null;
          const content = dash[1];
          if (content.trim() === '') { st.listRow = {}; continue; } // "- " 独占一行，字段在后续行
          const kv = content.match(KV_RE);
          if (kv) { st.listRow = {}; st.listRow[kv[1]] = parseScalar(kv[2]); }
          else st.listRows.push(parseScalar(content)); // 纯标量元素（路径/URL），不能丢
          continue;
        }
        const kv = line.trim().match(KV_RE);
        if (kv && st.listRow) { st.listRow[kv[1]] = parseScalar(kv[2]); continue; }
        flushList();
      } else {
        flushList();
      }
    }

    if (!line.trim() || line.trim().startsWith('#')) continue;

    const dash = line.match(/^(\s*)-\s+(.*)$/);
    if (dash) {
      flushBlock();
      flushList();
      if (current) items.push(current);
      current = {};
      const kv = dash[2].match(KV_RE);
      if (kv) assign(kv[1], kv[2], indentOf(line) + 2, i);
      continue;
    }
    const kv = line.match(/^\s+([A-Za-z_][\w-]*):(?:\s+(.*))?\s*$/);
    if (kv && current) {
      assign(kv[1], kv[2], indentOf(line), i);
      continue;
    }
    throw new Error('YAML_UNSUPPORTED_LINE: ' + line.trim().slice(0, 60));
  }
  flushBlock();
  flushList();
  if (current) items.push(current);
  // 过滤全空条目（items: [] 的情况）
  return items.filter((it) => Object.keys(it).length > 0);
}

function needsQuoting(v) {
  if (v === '') return true;
  if (/^\s|\s$/.test(v)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(v)) return true;
  if (/[:#]/.test(v)) return true;
  return false;
}

function serializeScalar(v) {
  const s = String(v == null ? '' : v);
  if (!needsQuoting(s)) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// flow 数组仅在所有元素都"干净"时使用，否则退回块列表
function flowSafe(s) {
  return typeof s === 'string' && s !== '' && !/[\n,[\]{}#&*!|>'"%@`:]/.test(s) && !/^\s|\s$/.test(s);
}

const KEY_INDENT = 4; // "  - " 之后的键缩进

// 单个 key/value 的序列化行（value 可为多行字符串 → 块标量）
function serializeEntry(key, value, indent) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}${key}: []`;
    if (value.every((x) => typeof x === 'string' && flowSafe(x))) {
      return `${pad}${key}: [${value.join(', ')}]`;
    }
    const lines = [`${pad}${key}:`];
    for (const el of value) {
      if (el && typeof el === 'object' && !Array.isArray(el)) {
        const entries = Object.keys(el);
        if (!entries.length) { lines.push(`${inner}- {}`); continue; }
        entries.forEach((k, idx) => {
          const prefix = idx === 0 ? `${inner}- ` : `${inner}  `;
          lines.push(prefix + serializeEntry(k, el[k], 0).trimStart());
        });
      } else {
        lines.push(`${inner}- ${serializeScalar(el)}`);
      }
    }
    return lines.join('\n');
  }
  const s = String(value == null ? '' : value);
  if (s.includes('\n')) {
    const content = s.split('\n').map((l) => (l === '' ? '' : inner + l)).join('\n');
    return `${pad}${key}: |-\n${content}`;
  }
  return `${pad}${key}: ${serializeScalar(s)}`;
}

// 按固定键序输出，未提供值省略；title 优先保证可读性
function serializeItem(item) {
  const keys = Object.keys(item).filter((k) => item[k] !== undefined && item[k] !== null);
  keys.sort((a, b) => (a === 'title' ? -1 : b === 'title' ? 1 : 0));
  if (!keys.length) return '  - {}';
  // 所有键统一按 KEY_INDENT 生成；首行再把前导缩进换成 "- "（保证块标量/块列表缩进合法）
  const lines = keys.map((k) => serializeEntry(k, item[k], KEY_INDENT));
  lines[0] = '  - ' + lines[0].slice(KEY_INDENT);
  return lines.join('\n');
}

function serializeItems(headerLines, items) {
  const out = headerLines.slice();
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  if (out.length) out.push('');
  if (!items.length) {
    out.push('items: []');
    out.push('');
    return out.join('\n');
  }
  out.push('items:');
  for (const it of items) out.push(serializeItem(it));
  out.push('');
  return out.join('\n');
}

function updateItems(text, items) {
  const { header } = splitItemsBlock(text);
  return serializeItems(header, items);
}

// ---------- site.yml（站点身份配置） ----------
// 扁平 schema：intro / motto / avatar / identity_words（flow 数组）。
// 头部注释原样保留；仅重写已知键行。

const SITE_KEYS = ['intro', 'motto', 'avatar', 'identity_words'];

const SITE_DEFAULT_HEADER = [
  '# 站点身份配置 —— 后台「设置」页维护，也可手动编辑',
  '# intro          首页身份域的一句话介绍',
  '# motto          首页页脚座右铭（空则显示 SINCE 年份与站名）',
  '# avatar         头像图片路径（空则用主题配置 /img/avatar/）',
  '# identity_words 身份词竖列，后台设置里每行一个',
];

function parseFlowList(raw) {
  let v = (raw || '').trim();
  if (v === '' || v === '[]') return [];
  if (!(v.startsWith('[') && v.endsWith(']'))) return [parseScalar(v)];
  const inner = v.slice(1, -1);
  const out = [];
  let cur = '';
  let inStr = false;
  let quote = '';
  for (const ch of inner) {
    if (inStr) {
      if (ch === quote) inStr = false;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
    } else if (ch === ',') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseSite(text) {
  const cfg = { intro: '', motto: '', avatar: '', identity_words: [] };
  for (const line of String(text || '').split(/\r?\n/)) {
    const kv = line.match(/^(intro|motto|avatar|identity_words)\s*:\s*(.*)$/);
    if (!kv) continue;
    if (kv[1] === 'identity_words') cfg.identity_words = parseFlowList(kv[2]);
    else cfg[kv[1]] = parseScalar(kv[2]);
  }
  return cfg;
}

function serializeSiteLine(key, value) {
  if (key === 'identity_words') {
    const list = Array.isArray(value) ? value : [];
    return `identity_words: [${list.map((s) => serializeScalar(String(s))).join(', ')}]`;
  }
  return `${key}: ${serializeScalar(value == null ? '' : value)}`;
}

function updateSite(text, cfg) {
  const lines = String(text || '').split(/\r?\n/);
  const firstKeyIdx = lines.findIndex((l) => SITE_KEYS.some((k) => new RegExp(`^${k}\\s*:`).test(l)));
  const header = firstKeyIdx === -1 ? lines.slice() : lines.slice(0, firstKeyIdx);
  // 去掉头部末尾空行，稍后统一补一个
  while (header.length && header[header.length - 1].trim() === '') header.pop();
  const out = header.length ? header.slice() : SITE_DEFAULT_HEADER.slice();
  out.push('');
  for (const k of SITE_KEYS) out.push(serializeSiteLine(k, cfg && cfg[k]));
  out.push('');
  return out.join('\n');
}

module.exports = { parseItems, updateItems, needsQuoting, parseSite, updateSite };
