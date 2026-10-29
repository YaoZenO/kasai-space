#!/usr/bin/env node
/**
 * merge-city-shells.js — E-076 空壳条目归并工具
 *
 * 背景（见 ERRORS.md E-076）：早期把公开榜单条目当成城市直接导入，榜单原文用
 * 「省份 + 城市」「城市·省份」「城市·美称」消歧，于是库里出现了一批 metrics: {}
 * 的空壳条目，与标准名条目指向同一座城 —— 同一座城两个档案页、/city/ 索引列两遍、
 * 榜单里显示成两个不同的名字。
 *
 * 本脚本做两件事，且只在两种文件上做外科手术式改写：
 *   1. cityrank.yml —— 把引用空壳 slug 的 item 改指标准 slug，同时把 name 改成标准名
 *      （只改 slug 不改 name 会留下「名字是 A、链接跳到 B」的错链）。
 *   2. cities.yml   —— 删除空壳条目块。
 *
 * 安全设计：
 *   - 归并映射由脚本现算（去饰规则见 stripRules），不手写清单，避免漏项；
 *   - EXCLUDE 里的 slug 不参与归并（去饰后与标准名同形但实际是另一个地方）；
 *   - RENAME 里的条目原地改名换 slug（它是独立的地方，只是名字带了前缀）；
 *   - 改完立刻用 js-yaml 重新解析两个文件，解析失败直接 die 并回滚文件；
 *   - 删除块前断言该块确实是「- name: <壳名>」开头、且下一个块也是同缩进，
 *     防止误删相邻条目。
 *
 * 用法：node tools/merge-city-shells.js [--dry]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const CITIES = path.join(ROOT, 'source/_data/cities.yml');
const RANKS = path.join(ROOT, 'source/_data/cityrank.yml');
const DRY = process.argv.includes('--dry');

const PROV = ('北京|天津|上海|重庆|河北|山西|内蒙古|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|'
  + '广东|广西|海南|四川|贵州|云南|西藏|陕西|甘肃|青海|宁夏|新疆');
const PROV_SET = new Set(PROV.split('|'));

/** 去饰规则：返回若干「裸名」候选，按优先级尝试 */
function stripRules(name) {
  const out = [];
  const noProv = name.replace(new RegExp('^(' + PROV + ')'), '');
  if (noProv && noProv !== name) out.push(noProv);
  out.push(name.replace(/^[^·]+·/, ''));   // 前缀·后缀 → 取后缀（安徽·黄山 → 黄山）
  out.push(name.replace(/·[^·]+$/, ''));   // 城市·美称   → 取前缀（喀什·丝路明珠 → 喀什）
  out.push(name.replace(/^[^/]+\//, ''));  // 斜杠分隔
  out.push(name.replace(/^[^·]+·/, '').replace(/[州盟]$/, ''));
  if (/[州盟]$/.test(name) && name.length >= 3) {
    const b = name.slice(0, -1);
    if (!PROV_SET.has(b)) out.push(b);
  }
  return [...new Set(out)].filter((x) => x && x !== name && x.length >= 2);
}

/** 去饰后与标准名同形、但实际是另一个地方 —— 不归并 */
const EXCLUDE = new Set([
  'fuzhoupingtan', // 「福州·平潭」是平潭岛（福州下辖县），不是福州
]);

/** 原地改名换新 slug 的条目：独立的地方，只是名字带了别处的前缀 */
const RENAME = {
  fuzhoupingtan: { name: '平潭', slug: 'pingtan' },
};

function die(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

// ---------- 1. 计算归并映射 ----------
const citiesText = fs.readFileSync(CITIES, 'utf8');
const ranksText0 = fs.readFileSync(RANKS, 'utf8');
const cities = yaml.load(citiesText);
const cityList = (cities && cities.cities) || [];
if (!cityList.length) die('cities.yml 解析为空');

const byName = {};
for (const c of cityList) {
  if (!byName[c.name]) byName[c.name] = [];
  byName[c.name].push(c);
}

const merges = [];   // { shell:{name,slug}, std:{name,slug}, via }
const renames = [];  // { from:{name,slug}, to:{name,slug} }
for (const c of cityList) {
  if (RENAME[c.slug]) {
    renames.push({ from: { name: c.name, slug: c.slug }, to: RENAME[c.slug] });
    continue;
  }
  if (EXCLUDE.has(c.slug)) continue;
  for (const bare of stripRules(c.name)) {
    const twins = (byName[bare] || []).filter((x) => x !== c);
    if (twins.length) {
      merges.push({ shell: { name: c.name, slug: c.slug }, std: { name: twins[0].name, slug: twins[0].slug }, via: bare });
      break;
    }
  }
}

if (!merges.length && !renames.length) {
  console.log('没有可归并的空壳条目，退出。');
  process.exit(0);
}

console.log('== 归并映射 ' + merges.length + ' 条（+ 改名 ' + renames.length + ' 条）==');
for (const m of merges) {
  console.log('   ' + m.shell.name + ' (' + m.shell.slug + ') → ' + m.std.name + ' (' + m.std.slug + ')');
}
for (const r of renames) {
  console.log('   [改名] ' + r.from.name + ' (' + r.from.slug + ') → ' + r.to.name + ' (' + r.to.slug + ')');
}

// ---------- 2. 改 cityrank.yml 的 items ----------
/**
 * 把一行里（或向上回溯到的）name / slug 换成标准值。
 * item 常见写法：- { name: 山东青岛, slug: shandongqingdao, note: "..." }
 */
function rewriteRankItems(text) {
  const lines = text.split(/\r?\n/);
  let changed = 0;
  const unresolved = new Set();

  const targetOf = (slug) => {
    const m = merges.find((x) => x.shell.slug === slug);
    if (m) return { name: m.std.name, slug: m.std.slug };
    const r = renames.find((x) => x.from.slug === slug);
    if (r) return { name: r.to.name, slug: r.to.slug };
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /(^|[,\s{])slug:\s*([A-Za-z0-9_-]+)/.exec(line);
    if (!m) continue;
    const tgt = targetOf(m[2]);
    if (!tgt) continue;

    if (/name:/.test(line)) {
      lines[i] = line
        .replace(/name:\s*"([^"]*)"/, 'name: ' + JSON.stringify(tgt.name))
        .replace(/name:\s*([^,}]+)/, 'name: ' + tgt.name);
      changed++;
    } else {
      // 块式 item：向上找最近的 name:
      let hit = -1;
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        if (/^\s*(- )?name:/.test(lines[j])) { hit = j; break; }
        if (/^\s*-\s*\{/.test(lines[j]) || /^\s*-\s+slug:/.test(lines[j])) break;
      }
      if (hit < 0) { unresolved.add(m[2]); continue; }
      lines[hit] = lines[hit]
        .replace(/name:\s*"([^"]*)"/, 'name: ' + JSON.stringify(tgt.name))
        .replace(/name:\s*([^\s].*)$/, 'name: ' + tgt.name);
      changed++;
    }
    lines[i] = lines[i].replace(/slug:\s*[A-Za-z0-9_-]+/, 'slug: ' + tgt.slug);
  }
  return { text: lines.join('\n'), changed, unresolved: [...unresolved] };
}

const rr = rewriteRankItems(ranksText0);
console.log('\n== cityrank.yml 改写 ' + rr.changed + ' 处 ==');
if (rr.unresolved.length) die('这些 slug 找不到可改写的 name 行：' + rr.unresolved.join(', '));

// ---------- 3. 删 cities.yml 里的空壳块 ----------
function removeCityBlocks(text, slugsToRemove, renameMap) {
  const lines = text.split(/\r?\n/);
  const keep = [];
  let i = 0;
  let removed = 0;
  const renamed = [];
  while (i < lines.length) {
    const m = /^(\s*)- name:\s*(.*)$/.exec(lines[i]);
    if (m && m[1] === '  ') {
      const indent = m[1];
      let j = i + 1;
      while (j < lines.length) {
        if (/^\s*- name:/.test(lines[j]) && /^ {2}- name:/.test(lines[j])) break;
        j++;
      }
      const block = lines.slice(i, j);
      const slugLine = block.find((l) => /^\s*slug:/.test(l));
      const slug = slugLine ? slugLine.replace(/^\s*slug:\s*/, '').trim() : '';
      if (slugsToRemove.has(slug)) {
        removed++;
        i = j;
        continue;
      }
      if (renameMap[slug]) {
        for (let k = 0; k < block.length; k++) {
          if (/^\s*- name:/.test(block[k])) block[k] = indent + '- name: ' + renameMap[slug].name;
          if (/^\s*slug:/.test(block[k])) block[k] = indent + '  slug: ' + renameMap[slug].slug;
        }
        renamed.push(slug + ' → ' + renameMap[slug].slug);
      }
      for (const l of block) keep.push(l);
      i = j;
      continue;
    }
    keep.push(lines[i]);
    i++;
  }
  return { text: keep.join('\n'), removed, renamed };
}

const removeSet = new Set(merges.map((m) => m.shell.slug));
const renameMap = {};
for (const r of renames) renameMap[r.from.slug] = r.to;

const cr2 = removeCityBlocks(citiesText, removeSet, renameMap);
console.log('== cities.yml 删除空壳 ' + cr2.removed + ' 条 ==');
if (cr2.renamed.length) console.log('== cities.yml 原地改名 ' + cr2.renamed.length + ' 条：' + cr2.renamed.join(', ') + ' ==');
if (cr2.removed !== removeSet.size) {
  die('应删 ' + removeSet.size + ' 条，实删 ' + cr2.removed + ' 条 —— 块边界判定可能出错，已中止');
}

// ---------- 4. 落盘前校验：两个文件都必须能被 js-yaml 解析 ----------
let parsedCities, parsedRanks;
try {
  parsedCities = yaml.load(cr2.text);
  parsedRanks = yaml.load(rr.text);
} catch (e) {
  die('改写后的 YAML 解析失败，未落盘：' + e.message);
}
const remainSlugs = new Set(((parsedCities.cities) || []).map((c) => c.slug));
const dangling = [];
for (const g of parsedRanks.groups || []) {
  for (const r of g.ranks || []) {
    for (const it of r.items || []) {
      if (it && it.slug && !remainSlugs.has(it.slug)) dangling.push(r.slug + ' → ' + it.name + ' (' + it.slug + ')');
    }
  }
}
if (dangling.length) die('改写后仍存在死链 ' + dangling.length + ' 处：\n' + dangling.slice(0, 10).join('\n'));
const stillShell = removeSet.size && [...removeSet].filter((s) => remainSlugs.has(s));
if (stillShell.length) die('这些空壳 slug 没删掉：' + stillShell.join(', '));

console.log('\n校验通过：两文件均可解析、无死链、空壳已清空。');

if (DRY) {
  console.log('--dry 模式，未写盘。');
  process.exit(0);
}

fs.writeFileSync(CITIES, cr2.text);
fs.writeFileSync(RANKS, rr.text);
console.log('已写入 cities.yml 与 cityrank.yml。');
