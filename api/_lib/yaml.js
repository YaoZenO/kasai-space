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
