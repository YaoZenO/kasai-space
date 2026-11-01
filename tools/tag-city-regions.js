#!/usr/bin/env node
/**
 * tag-city-regions.js — 给 cities.yml 的城市标注区域归属
 *
 * 存在理由：站内有一批区域榜（华东 / 华南 / 西北十大旅游城市、环渤海十三市…），
 * 要靠 `filter` 限定候选范围，而 filter 只能按字段匹配——城市必须先有区域字段。
 * 区域归属是常识性地理划分，但**不能靠人一条条记**：晋江那次就是「没有规则、
 * 全凭手写顺序」翻的车（E-083 同源教训）。所以映射表写死在这里，默认 dry-run
 * 打印统计，人工核对后才 --write。
 *
 * 本脚本**不产出数值**，只写区域分类；分类依据写在下面并同步进采集台账。
 *
 * 用法：node tools/tag-city-regions.js          # 只打印统计
 *       node tools/tag-city-regions.js --write  # 核对后写回
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'source', '_data', 'cities.yml');

// ① 七大区（地理大区通行划分）
const REGION_BY_PROVINCE = {
  北京市: '华北', 天津市: '华北', 河北省: '华北', 山西省: '华北', 内蒙古自治区: '华北',
  辽宁省: '东北', 吉林省: '东北', 黑龙江省: '东北',
  上海市: '华东', 江苏省: '华东', 浙江省: '华东', 安徽省: '华东', 福建省: '华东',
  江西省: '华东', 山东省: '华东', 中国台湾地区: '台湾',
  河南省: '华中', 湖北省: '华中', 湖南省: '华中',
  广东省: '华南', 广西壮族自治区: '华南', 海南省: '华南', 中国香港: '华南', 中国澳门: '华南',
  重庆市: '西南', 四川省: '西南', 贵州省: '西南', 云南省: '西南', 西藏自治区: '西南',
  陕西省: '西北', 甘肃省: '西北', 青海省: '西北', 宁夏回族自治区: '西北', 新疆维吾尔自治区: '西北'
};

// ② 三大地带（国家统计局口径：东部 / 中部 / 西部；港澳台不在该划分内，不标）
const BELT_BY_PROVINCE = {
  北京市: '东部', 天津市: '东部', 河北省: '东部', 辽宁省: '东部', 上海市: '东部',
  江苏省: '东部', 浙江省: '东部', 福建省: '东部', 山东省: '东部', 广东省: '东部',
  广西壮族自治区: '东部', 海南省: '东部',
  山西省: '中部', 内蒙古自治区: '中部', 吉林省: '中部', 黑龙江省: '中部', 安徽省: '中部',
  江西省: '中部', 河南省: '中部', 湖北省: '中部', 湖南省: '中部',
  重庆市: '西部', 四川省: '西部', 贵州省: '西部', 云南省: '西部', 西藏自治区: '西部',
  陕西省: '西部', 甘肃省: '西部', 青海省: '西部', 宁夏回族自治区: '西部', 新疆维吾尔自治区: '西部'
};

// ③ 南北（秦岭—淮河线）：先按省级主体归属，跨界的省份再按城市名例外
// 省级主体算北方（跨界的城市在下面按名例外）
const NORTH_PROVINCES = ['北京市', '天津市', '河北省', '山西省', '内蒙古自治区', '辽宁省',
  '吉林省', '黑龙江省', '山东省', '河南省', '陕西省', '甘肃省',
  '青海省', '宁夏回族自治区', '新疆维吾尔自治区'];
// 省级主体算南方
const SOUTH_PROVINCES = ['上海市', '江苏省', '浙江省', '安徽省', '福建省', '江西省',
  '湖北省', '湖南省', '广东省', '广西壮族自治区', '海南省', '重庆市', '四川省', '贵州省',
  '云南省', '西藏自治区', '中国香港', '中国澳门', '中国台湾地区'];
// 跨界省份里的「南方城市」（其余算北方）
const SOUTH_CITY_IN_NORTH_PROVINCE = {
  河南省: ['信阳', '南阳', '驻马店'],
  陕西省: ['汉中', '安康', '商洛'],
  甘肃省: ['陇南']
};
// 跨界省份里的「北方城市」（其余算南方）
const NORTH_CITY_IN_SOUTH_PROVINCE = {
  江苏省: ['徐州', '连云港', '宿迁'],
  安徽省: ['淮北', '亳州', '宿州', '蚌埠', '阜阳', '淮南']
};

// ④ 环渤海（沿海城市 + 京津；不含内陆的沈阳、济南、石家庄）
const BOHAI_CITIES = ['北京', '天津', '秦皇岛', '唐山', '沧州', '大连', '丹东', '营口',
  '盘锦', '锦州', '葫芦岛', '青岛', '烟台', '威海', '潍坊', '东营', '滨州', '日照'];

function classify(city) {
  const p = city.province || '';
  const name = city.name || '';
  const out = {};
  if (REGION_BY_PROVINCE[p]) out.region = REGION_BY_PROVINCE[p];
  if (BELT_BY_PROVINCE[p]) out.belt = BELT_BY_PROVINCE[p];
  if (NORTH_PROVINCES.indexOf(p) !== -1) {
    out.zone = (SOUTH_CITY_IN_NORTH_PROVINCE[p] || []).indexOf(name) !== -1 ? '南方' : '北方';
  } else if (SOUTH_PROVINCES.indexOf(p) !== -1) {
    out.zone = (NORTH_CITY_IN_SOUTH_PROVINCE[p] || []).indexOf(name) !== -1 ? '北方' : '南方';
  }
  if (BOHAI_CITIES.indexOf(name) !== -1) out.bohai = '环渤海';
  return out;
}

function main() {
  const write = process.argv.indexOf('--write') !== -1;
  const cities = yaml.load(fs.readFileSync(TARGET, 'utf8')).cities || [];
  const stat = { region: {}, belt: {}, zone: {}, bohai: 0 };
  const skip = [];
  const plan = new Map();

  for (const c of cities) {
    const cls = classify(c);
    if (!Object.keys(cls).length) { skip.push(c.name); continue; }
    plan.set(c.slug, cls);
    for (const k of ['region', 'belt', 'zone']) {
      if (cls[k]) stat[k][cls[k]] = (stat[k][cls[k]] || 0) + 1;
    }
    if (cls.bohai) stat.bohai += 1;
  }

  console.log('region:', stat.region);
  console.log('belt:  ', stat.belt);
  console.log('zone:  ', stat.zone);
  console.log('环渤海:', stat.bohai, '座');
  console.log('未标注（省份缺失或不在映射表内）:', skip.length, '座，例如', skip.slice(0, 8).join('、'));

  if (!write) {
    console.log('\n（dry-run：未写回。核对无误后加 --write）');
    return;
  }

  const raw = fs.readFileSync(TARGET, 'utf8');
  const EOL = raw.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  const lines = raw.split(EOL);
  let done = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^    slug: (.+)$/.exec(lines[i]);
    if (!m) continue;
    const slug = m[1].trim().replace(/^"|"$/g, '');
    const cls = plan.get(slug);
    if (!cls) continue;
    // 块内找 level / province 行作为插入锚点（**不能拿 metrics: 当锚点**——
    // 它后面跟着 6 空格缩进的指标行，插在中间会把 YAML 打断，见 E-084）；
    // 两者都没有就插在 slug 行之后。
    let anchor = i;
    for (let j = i + 1; j < lines.length && !/^  - name: /.test(lines[j]); j++) {
      if (/^    (level|province): /.test(lines[j])) anchor = j;
    }
    const add = [];
    for (const k of ['region', 'belt', 'zone', 'bohai']) {
      if (!cls[k]) continue;
      const re = new RegExp('^    ' + k + ': ');
      let has = false;
      for (let j = i + 1; j < lines.length && !/^  - name: /.test(lines[j]); j++) {
        if (re.test(lines[j])) has = true;
      }
      if (!has) add.push('    ' + k + ': ' + cls[k]);
    }
    if (add.length) {
      lines.splice(anchor + 1, 0, ...add);
      done += add.length;
    }
  }
  const next = lines.join(EOL);
  // 写回闸：必须还能解析，且城市数不丢
  const chk = yaml.load(next);
  if (!chk || (chk.cities || []).length !== cities.length) {
    throw new Error('写回中止：解析后城市数 ' + ((chk && chk.cities) || []).length + ' ≠ 原 ' + cities.length);
  }
  fs.writeFileSync(TARGET, next, 'utf8');
  console.log('✓ 写回完成：新增字段 ' + done + ' 条');
}

main();
