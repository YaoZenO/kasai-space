/* global hexo */

'use strict';

// 中国省级小地图（2026-11-02，城市档案页「在中国的方位」）
//
// 做法：构建期把 themes/fluid/data/china-provinces.json 里的省级边界路径拼成静态 SVG，
// 每个省级行政区一份（cn-<adcode>.svg），本省填 accent、其余填纸色。
// 不引任何运行时地图 SDK，不请求任何第三方瓦片服务。
//
// 为什么一省一份而不是每页 inline：
//   全量路径约 53KB，城市页有 431 个，inline 会让 HTML 多出 20MB 以上；
//   一省一份共 34 个文件，单页只下一个（gzip 后约 14KB），且可被浏览器长期缓存。
//
// 合规纪律：路径数据只做投影与抽稀，不改动边界（见 tools/build-china-map-data.js）；
//   台湾、港澳、南海断续线为数据里的独立要素，缺任何一个都应让构建断言直接失败。
//   取景是**一幅画到底**：3°N 到 54°N 全在框内，南海诸岛与大陆同框，不另设插图。

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'china-provinces.json');

// 配色对齐 site.css 的 V6.5 暖纸色板：纸色填充 + 次级墨描边 + accent 高亮。
// SVG 由 <img> 加载，读不到页面 CSS 变量，因此这里写字面色值。
const COLOR = {
  land: '#e9e2d4',
  landStroke: '#d3ccbc',
  active: '#a8482c',
  activeStroke: '#8c3a22',
  nineDash: '#9a9184',
  tag: '#8c3a22'
};

// 本省填色 + 描边的线宽（用户单位）。0.12 个单位在 780px 宽的图上约 1.7px：
// 省界本来只有 1px，本省加粗一档才分得出来，又不至于把轮廓糊成一团。
const ACTIVE_STROKE = 0.12;

// 填色在图上不足这个边长（单位）时，补一条指引线 + 名字。
// 780px 宽的地图上 1 个单位约 14px，1.0 单位以下就是 14px 以内——
// 香港、澳门在这个尺度只有几像素，光靠颜色找不到。
const TAG_SIZE = 1.0;

let CACHE = null;

function load() {
  if (CACHE) return CACHE;
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const byName = {};
  for (const p of raw.provinces) byName[p.name] = p;
  CACHE = { raw, byName };
  return CACHE;
}

// 省级名称归一（2026-11-04）。
// 城市数据里写的是「中国香港」「中国台湾地区」，边界数据里是「香港特别行政区」
// 「台湾省」——直接按字面查会查不到，这两座城市的页面上就**悄悄没有地图**
// （不报错、不报警，只是少一块）。这里做三级归一：全名 → 去掉「中国」前缀 → 去后缀比对。
const SUFFIX = /(维吾尔自治区|壮族自治区|回族自治区|特别行政区|自治区|地区|省|市)$/;

function coreOf(name) {
  return String(name || '').replace(/^中国/, '').replace(SUFFIX, '');
}

function resolveName(provinceName) {
  const { byName } = load();
  if (!provinceName) return null;
  if (byName[provinceName]) return provinceName;
  const core = coreOf(provinceName);
  if (!core) return null;
  for (const key of Object.keys(byName)) {
    if (coreOf(key) === core) return key;
  }
  return null;
}

function adcodeOf(provinceName) {
  const { byName } = load();
  const key = resolveName(provinceName);
  return key ? byName[key].adcode : null;
}

// 图内小标注用的短名：香港特别行政区 → 香港，广西壮族自治区 → 广西
function shortName(name) {
  return String(name).replace(/^中国/, '').replace(SUFFIX, '');
}

// 指引线朝哪边：默认朝右（东侧多为海面，压不到别的省），
// 右边 2.4 个单位内有别的省级单位就改朝左，免得两个标注叠在一起（澳门右边就是香港）。
function tagSide(target, raw) {
  for (const p of raw.provinces) {
    if (p.adcode === target.adcode) continue;
    if (typeof p.cx !== 'number' || typeof p.cy !== 'number') continue;
    if (Math.abs(p.cy - target.cy) < 0.8 && p.cx > target.cx && p.cx - target.cx < 2.4) return -1;
  }
  return 1;
}

// 面积过小的省级单位：一圈细环指出位置 + 一条短引线 + 名字。
// 不用实心圆点——实心点会把本省整个盖掉（上海就吃过这个亏），
// 环只围不盖，填色仍然沿着本省的形状走。
function tagFor(target, raw) {
  if (!target || !target.d) return '';
  if (Math.max(target.bw || 0, target.bh || 0) >= TAG_SIZE) return '';
  if (typeof target.cx !== 'number' || typeof target.cy !== 'number') return '';
  const dir = tagSide(target, raw);
  const ax = target.cx;
  const ay = target.cy;
  // 引线要够长，名字才落得到开阔海面上；太短会贴着海岸线，和岸线糊成一片
  const lx = Math.round((ax + dir * 0.9) * 100) / 100;
  const tx = Math.round((ax + dir * 1.3) * 100) / 100;
  const ty = Math.round((ay + 0.32) * 100) / 100;
  return (
    '<circle cx="' + ax + '" cy="' + ay + '" r="0.5" fill="none" stroke="' +
    COLOR.active + '" stroke-width="0.09" opacity="0.75"/>' +
    '<line x1="' + ax + '" y1="' + ay + '" x2="' + lx + '" y2="' + ay + '" stroke="' +
    COLOR.activeStroke + '" stroke-width="0.06"/>' +
    '<text x="' + tx + '" y="' + ty + '" font-size="0.95" font-family="serif" ' +
    'text-anchor="' + (dir > 0 ? 'start' : 'end') + '" fill="' + COLOR.tag + '">' +
    shortName(target.name) + '</text>'
  );
}

function svgFor(provinceName) {
  const { raw, byName } = load();
  const key = resolveName(provinceName);
  const target = key ? byName[key] : null;
  if (!target) return null;

  const parts = [];
  for (const p of raw.provinces) {
    if (!p.d) continue;
    if (p.adcode === target.adcode) continue; // 高亮层单独画
    parts.push('<path d="' + p.d + '"/>');
  }

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + raw.main.viewBox + '" ' +
    'role="img" aria-label="' + shortName(target.name) + '在中国的位置">' +
    '<g fill="' + COLOR.land + '" stroke="' + COLOR.landStroke + '" stroke-width="0.09" ' +
    'stroke-linejoin="round">' + parts.join('') + '</g>' +
    (raw.nineDash
      ? '<path d="' + raw.nineDash + '" fill="none" stroke="' + COLOR.nineDash + '" ' +
        'stroke-width="0.1" stroke-dasharray="0.55 0.4" stroke-linecap="round"/>'
      : '') +
    // 本省：沿行政边界填 accent，不再用圆点标记——圆点盖住的是省的形状本身
    '<path d="' + target.d + '" fill="' + COLOR.active + '" stroke="' + COLOR.activeStroke + '" ' +
    'stroke-width="' + ACTIVE_STROKE + '" stroke-linejoin="round"/>' +
    tagFor(target, raw) +
    '</svg>'
  );
}

function fileNameOf(provinceName) {
  const code = adcodeOf(provinceName);
  return code ? 'img/map/cn-' + code + '.svg' : null;
}

// 主图宽高比，供模板写 <img width height>（只影响加载前的占位比例，防 CLS）
function aspectOf() {
  const { raw } = load();
  return raw.main && raw.main.aspect ? raw.main.aspect : null;
}

module.exports = { load, resolveName, adcodeOf, svgFor, fileNameOf, aspectOf, DATA_FILE };
