#!/usr/bin/env node
/**
 * apply-city-metrics.js — 把「已人工核验的批量指标」外科手术式写入 cities.yml
 *
 * 存在理由（E-069）：采集脚本曾经把推算值直接写进数据文件，污染了 79 行。
 * 这里的做法反过来——脚本**不产出任何数值**，只负责把人工从权威页面抄下来、
 * 写进 batches/*.json 的值落库；每个值必须自带 source / asOf / unit，
 * 三缺一直接抛错退出，不给「有值但无出处」留口子。
 *
 * 输入：tools/city-metrics-batches/<batch>.json
 *   {
 *     "source": { "key": "...", "name": "...", "asOf": "..." },   // 会登记进 cities.yml 的 sources[]
 *     "field": "gdp",
 *     "unit": "亿元",
 *     "rows": [ { "name": "嘉兴", "slug": "jiaxing", "province": "浙江省", "level": "地级市", "v": 7851.1 }, ... ]
 *   }
 *
 * 行为：
 *   - 城市不存在 → 追加新条目（name / slug / province / level / metrics）
 *   - 城市存在   → 只补缺失的 province / level / 指标，**不覆盖已有值**
 *   - 已有同名指标且数值不同 → 抛错（口径冲突必须人工裁决，不许静默覆盖）
 *
 * 用法：node tools/apply-city-metrics.js tools/city-metrics-batches/gdp-zhejiang-jiangsu-shandong.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'source', '_data', 'cities.yml');

function die(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

function main() {
  const batchPath = process.argv[2];
  if (!batchPath) die('用法：node tools/apply-city-metrics.js <batch.json>');

  const batch = JSON.parse(fs.readFileSync(path.resolve(batchPath), 'utf8'));
  const src = batch.source || {};
  for (const k of ['key', 'name', 'asOf']) {
    if (!src[k]) die('batch.source 缺字段：' + k);
  }
  const field = batch.field;
  const unit = batch.unit;
  if (!field || !unit) die('batch 缺 field / unit');
  const rows = Array.isArray(batch.rows) ? batch.rows : [];
  if (!rows.length) die('batch.rows 为空');

  for (const r of rows) {
    if (!r.name || !r.slug) die('行缺 name / slug：' + JSON.stringify(r));
    if (typeof r.v !== 'number' || !isFinite(r.v)) die('行缺合法数值 v：' + r.name);
  }

  // 换行符必须按原文件还原：cities.yml 在 Windows 工作区是 CRLF，
  // 若直接 split('\n') / join('\n')，每行尾的 \r 会让 `.` 无法跨到 `$`（\r 是行终止符），
  // 正则全部失配；写回时还会把 1600 行整体改成 LF，整文件 diff。
  const raw = fs.readFileSync(TARGET, 'utf8');
  const EOL = raw.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  let lines = raw.split(EOL);
  const stats = { added: 0, province: 0, level: 0, metric: 0, appended: 0, same: 0 };

  // ---- 1) 登记 source（若不存在）----
  const srcKey = '"' + src.key + '"';
  if (lines.some((l) => l.indexOf('key: ' + srcKey) !== -1)) {
    console.log('· source 已登记：' + src.key);
  } else {
    const srcIdx = lines.findIndex((l) => l.trim() === 'sources:');
    if (srcIdx === -1) die('cities.yml 里找不到 sources:');
    let end = srcIdx + 1;
    while (end < lines.length && (lines[end].trim() === '' || /^\s{2,}/.test(lines[end]))) end++;
    const block = [
      '  - key: "' + src.key + '"',
      '    name: "' + src.name + '"',
      '    asOf: "' + src.asOf + '"'
    ];
    lines.splice(end, 0, ...block);
    console.log('+ source 登记：' + src.key);
  }

  // ---- 2) 建立城市条目块索引（每块从 `  - name:` 起，到下一个 `  - name:` 之前）----
  function indexBlocks() {
    const starts = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^  - name: /.test(lines[i])) starts.push(i);
    }
    return starts.map((s, i) => ({ start: s, end: i + 1 < starts.length ? starts[i + 1] : lines.length }));
  }

  function slugOf(block) {
    for (let i = block.start; i < block.end; i++) {
      const m = /^    slug: (.+)$/.exec(lines[i]);
      if (m) return m[1].trim();
    }
    return null;
  }

  const newEntries = [];

  for (const r of rows) {
    const blocks = indexBlocks();
    const hit = blocks.find((b) => slugOf(b) === r.slug);

    if (!hit) {
      // E-076 防复发：城市库里躺着一批「省份前缀 + 城市名」的消歧名条目
      // （早期从公开榜单直接导入，如「广东广州」与「广州」并存），它们没有 province / metrics，
      // 一旦再按标准名新增同一座城市，就会变成同一城市两条档案、索引页列两遍。
      // 命中就中止，逼着先人工把两条归并，再由本脚本补数据。
      if (r.province) {
        const short = r.province.replace(/(省|市|自治区|特别行政区)$/, '');
        for (const b of blocks) {
          const nm = /^  - name: (.+)$/.exec(lines[b.start]);
          if (!nm) continue;
          const n = nm[1].trim();
          if (n === short + r.name || n === short + '·' + r.name) {
            die(
              '命名冲突：库里已有消歧名条目「' + n + '」（slug ' + slugOf(b) + '）与要新增的「' +
                r.name + '」是同一城市，先人工归并（改 name / slug 并同步榜单引用）再落库'
            );
          }
        }
      }

      const ml = ['      ' + field + ': { v: ' + r.v + ', unit: "' + unit + '", asOf: "' + src.asOf + '", source: "' + src.key + '" }'];
      const blk = ['  - name: ' + r.name, '    slug: ' + r.slug];
      if (r.province) blk.push('    province: ' + r.province);
      if (r.level) blk.push('    level: ' + r.level);
      blk.push('    metrics:');
      newEntries.push(blk.concat(ml).join(EOL));
      stats.appended++;
      continue;
    }

    // 已有城市：补 province / level
    let blockLines = lines.slice(hit.start, hit.end);
    const hasProv = blockLines.some((l) => /^    province: /.test(l));
    const hasLevel = blockLines.some((l) => /^    level: /.test(l));
    const slugLine = blockLines.findIndex((l) => /^    slug: /.test(l));
    const insertAt = hasLevel ? -1 : 0;

    const addLines = [];
    if (!hasProv && r.province) addLines.push('    province: ' + r.province);
    if (!hasLevel && r.level) addLines.push('    level: ' + r.level);

    if (addLines.length) {
      lines.splice(hit.start + slugLine + 1, 0, ...addLines);
      if (!hasProv && r.province) stats.province++;
      if (!hasLevel && r.level) stats.level++;
      // splice 后块位移，重新取块
      const b2 = indexBlocks().find((b) => slugOf(b) === r.slug);
      hit.start = b2.start;
      hit.end = b2.end;
      blockLines = lines.slice(hit.start, hit.end);
    }

    // 补指标
    const metricRe = new RegExp('^      ' + field + ': \\{ v: ([0-9.]+)');
    const existing = blockLines.find((l) => metricRe.test(l));
    if (existing) {
      const v = parseFloat(metricRe.exec(existing)[1]);
      if (Math.abs(v - r.v) > 1e-9) {
        die('口径冲突：' + r.name + ' 已有 ' + field + '=' + v + '，本批为 ' + r.v + '（需人工裁决）');
      }
      stats.same++;
      continue;
    }

    const emptyMetrics = blockLines.findIndex((l) => /^    metrics: \{\}$/.test(l));
    if (emptyMetrics !== -1) {
      // metrics: {} → 展开成块
      const abs = hit.start + emptyMetrics;
      lines.splice(abs, 1, '    metrics:', '      ' + field + ': { v: ' + r.v + ', unit: "' + unit + '", asOf: "' + src.asOf + '", source: "' + src.key + '" }');
      stats.metric++;
      continue;
    }

    const metricsLine = blockLines.findIndex((l) => /^    metrics:$/.test(l));
    if (metricsLine === -1) die('城市 ' + r.name + ' 的块里既没有 metrics: {} 也没有 metrics:');
    const absM = hit.start + metricsLine;
    lines.splice(absM + 1, 0, '      ' + field + ': { v: ' + r.v + ', unit: "' + unit + '", asOf: "' + src.asOf + '", source: "' + src.key + '" }');
    stats.metric++;
    void insertAt;
  }

  if (newEntries.length) {
    // 追加到 cities 列表末尾（去掉文件尾部空行后再拼）
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push(newEntries.join(EOL));
    lines.push('');
  }

  // 写回前最后一道闸：slug 必须全局唯一。
  // E-072 就是这么来的——首版用 split('\n') 读 CRLF 文件，行尾 \r 让 `(.+)$` 全部失配，
  // 28 行全被判成「新城市」，差一步就把 28 个重复 slug 写进数据文件。
  // 换行符修好之后仍保留这道检查：任何原因导致的重复都必须在落盘前炸掉。
  const seen = new Map();
  for (const b of indexBlocks()) {
    const s = slugOf(b);
    if (!s) continue;
    if (seen.has(s)) die('写回中止：slug 重复 ' + s);
    seen.set(s, true);
  }

  fs.writeFileSync(TARGET, lines.join(EOL), 'utf8');
  console.log('✓ 完成：新增城市 ' + stats.appended + '，补 province ' + stats.province + '，补 level ' + stats.level + '，写入指标 ' + stats.metric + '，已存在同值 ' + stats.same);
}

main();
