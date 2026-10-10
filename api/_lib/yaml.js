'use strict';
// 数据模块 YAML 手术：只重写 items: 列表，完整保留文件头部注释与其他行。
// 仅支持本项目的扁平 schema（title/link/desc/cover/date），遇到不认识的行报错而不是猜。

const DATA_KEYS = ['title', 'link', 'desc', 'cover', 'date'];

function splitItemsBlock(text) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^items:\s*(\[\s*\])?\s*(#.*)?$/.test(l));
  if (idx === -1) throw new Error('YAML_NO_ITEMS_KEY');
  const header = lines.slice(0, idx);
  const body = lines.slice(idx + 1);
  return { header, body };
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

function parseItems(text) {
  const { body } = splitItemsBlock(text);
  const items = [];
  let current = null;
  for (const line of body) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s*-\s+/.test(line)) {
      if (current) items.push(current);
      current = {};
      const rest = line.replace(/^\s*-\s+/, '');
      const kv = rest.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (kv) current[kv[1]] = parseScalar(kv[2]);
      continue;
    }
    if (/^\s+[A-Za-z_][\w-]*\s*:/.test(line) && current) {
      const kv = line.trim().match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (kv) current[kv[1]] = parseScalar(kv[2]);
      continue;
    }
    throw new Error('YAML_UNSUPPORTED_LINE: ' + line.trim().slice(0, 60));
  }
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

// 按固定键序输出，未提供值省略
function serializeItem(item) {
  const lines = ['  - '];
  const entries = [];
  for (const k of DATA_KEYS) {
    if (item[k] !== undefined && item[k] !== null) entries.push(`${k}: ${serializeScalar(item[k])}`);
  }
  for (const k of Object.keys(item)) {
    if (!DATA_KEYS.includes(k) && item[k] !== undefined && item[k] !== null) entries.push(`${k}: ${serializeScalar(item[k])}`);
  }
  if (!entries.length) return '  - {}';
  return '  - ' + entries.join('\n    ');
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

module.exports = { parseItems, updateItems, needsQuoting };
