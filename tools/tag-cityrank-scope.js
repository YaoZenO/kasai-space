#!/usr/bin/env node
/**
 * tag-cityrank-scope.js — 给 cityrank.yml 的每个榜标注空间尺度 scope
 *
 * 存在理由：2026-10-31 主人拍板「榜单顺序要定规则」，规则的第二层是空间尺度
 * （全国 → 省级 → 区域 → 镇域）。这一层必须来自数据本身，不能靠人记住
 * 「第 30 条是镇级榜」——人记不住，yml 的手写顺序也不可信（正是晋江镇级榜
 * 插在省级榜中间的原因）。
 *
 * 本脚本**不产出数值**，只做分类标注：判定规则全部写在下面，判定结果逐条打印，
 * 人工核对后才允许写回（默认 dry-run，加 --write 才落盘）。
 *
 * 用法：node tools/tag-cityrank-scope.js          # 只打印判定结果
 *       node tools/tag-cityrank-scope.js --write  # 核对无误后写回 yml
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'source', '_data', 'cityrank.yml');

// GB/T 2260 省级行政区名称（用于从榜名反查尺度）
const PROVINCES = ('北京 天津 河北 山西 内蒙古 辽宁 吉林 黑龙江 上海 江苏 浙江 安徽 福建 江西 ' +
  '山东 河南 湖北 湖南 广东 广西 海南 重庆 四川 贵州 云南 西藏 陕西 甘肃 青海 宁夏 新疆 台湾').split(' ');

// 跨省区域名
const REGIONS = ['东北', '东部', '中部', '北方', '南方', '西北', '西南', '西部',
  '华东', '华中', '华北', '华南', '环渤海', '长三角', '珠三角', '京津冀'];

function judge(r) {
  const t = r.title || '';
  const items = Array.isArray(r.items) ? r.items : [];

  // 镇域：条目名以「镇」结尾的占到多数，或榜名直说镇
  const townish = items.filter((x) => /镇$/.test(x.name || '')).length;
  if (townish >= 3 || /强镇|镇区/.test(t)) return 'town';

  // 省级：带 province filter 的榜，或榜名以省名开头
  if (r.filter && r.filter.province) return 'province';
  if (/台湾地区/.test(t)) return 'province';
  for (const pv of PROVINCES) {
    if (t.indexOf(pv) === 0 && /城市|市$|排行榜/.test(t)) return 'province';
  }

  // 区域：榜名里出现跨省区域名（「中国东部十大旅游城市」这种区域名不在开头，
  // 只认开头的规则会漏掉东/中部两条，故按包含判定）
  for (const rg of REGIONS) {
    if (t.indexOf(rg) !== -1) return 'region';
  }

  return 'nation';
}

function main() {
  const write = process.argv.indexOf('--write') !== -1;
  const d = yaml.load(fs.readFileSync(TARGET, 'utf8'));
  const map = {};
  const stat = {};

  for (const g of d.groups || []) {
    console.log('=== ' + g.key + ' | ' + g.title);
    for (const r of g.ranks || []) {
      const s = judge(r);
      map[r.slug] = s;
      stat[s] = (stat[s] || 0) + 1;
      if (s !== 'nation') console.log('   ' + s.padEnd(9) + ' | ' + r.slug + ' | ' + r.title);
    }
  }
  console.log('--- 统计 ---');
  console.log(stat);
  console.log('nation 之外的共 ' + Object.keys(map).filter((k) => map[k] !== 'nation').length + ' 条，上面已逐条列出，请人工核对');

  if (!write) {
    console.log('\n（dry-run：未写回。核对无误后加 --write）');
    return;
  }

  const EOL = fs.readFileSync(TARGET, 'utf8').indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  const original = fs.readFileSync(TARGET, 'utf8');
  const lines = original.split(EOL);
  let cur = null;
  let done = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^      - slug: (.+)$/.exec(lines[i]);
    if (m) {
      cur = m[1].trim().replace(/^"|"$/g, '');
      continue;
    }
    if (cur && /^        kind: /.test(lines[i])) {
      const scope = map[cur];
      if (!scope) throw new Error('榜 ' + cur + ' 没有判定结果');
      // 已标过就跳过（重复执行不留重复键）
      let has = false;
      for (let j = i + 1; j < lines.length && !/^      - slug: /.test(lines[j]); j++) {
        if (/^        scope: /.test(lines[j])) has = true;
      }
      if (!has) {
        // 紧跟 kind 行插入：往块尾插会落到 `metrics:` 与它的列表项之间，
        // 那两行的缩进是 8 / 10 空格，插进去直接把 YAML 打断（2026-10-31 踩过）。
        lines.splice(i + 1, 0, '        scope: "' + scope + '"');
        done++;
      }
      cur = null;
    }
  }
  const next = lines.join(EOL);
  // 写回前的最后一道闸：新文本必须能被解析，且榜数不丢。
  // 上面那次插错位置的破坏就是靠这一步挡住的——宁可不动文件，也不写一份坏 YAML。
  try {
    const chk = yaml.load(next);
    let n = 0;
    for (const g of chk.groups || []) n += (g.ranks || []).length;
    if (n !== Object.keys(map).length) throw new Error('解析后榜数 ' + n + ' ≠ 原 ' + Object.keys(map).length);
  } catch (e) {
    console.error('✗ 写回中止：新文本无法解析（' + e.message + '），文件保持原样');
    process.exit(1);
  }
  fs.writeFileSync(TARGET, next, 'utf8');
  console.log('✓ 写回完成：新增 scope 字段 ' + done + ' 条');
}

main();
