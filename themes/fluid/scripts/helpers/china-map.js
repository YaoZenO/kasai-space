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
  nineDash: '#9a9184'
};

let CACHE = null;

function load() {
  if (CACHE) return CACHE;
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const byName = {};
  for (const p of raw.provinces) byName[p.name] = p;
  CACHE = { raw, byName };
  return CACHE;
}

function adcodeOf(provinceName) {
  const { byName } = load();
  const hit = byName[provinceName];
  return hit ? hit.adcode : null;
}

function svgFor(provinceName) {
  const { raw, byName } = load();
  const target = byName[provinceName];
  if (!target) return null;

  const parts = [];
  for (const p of raw.provinces) {
    if (!p.d) continue;
    if (p.adcode === target.adcode) continue; // 高亮层单独画
    parts.push('<path d="' + p.d + '"/>');
  }

  // 定位标记：上海、澳门这类面积过小的省级单位，填色在图上只有几个像素，
  // 光靠颜色找不到，必须配一个圆环 + 实心点。
  const marker =
    typeof target.cx === 'number' && typeof target.cy === 'number'
      ? '<circle cx="' + target.cx + '" cy="' + target.cy + '" r="2.6" fill="none" ' +
        'stroke="' + COLOR.active + '" stroke-width="0.32" opacity="0.55"/>' +
        '<circle cx="' + target.cx + '" cy="' + target.cy + '" r="0.75" fill="' + COLOR.active + '"/>'
      : '';

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + raw.viewBox + '" ' +
    'role="img" aria-label="' + provinceName + '在中国的位置">' +
    '<g fill="' + COLOR.land + '" stroke="' + COLOR.landStroke + '" stroke-width="0.09" ' +
    'stroke-linejoin="round">' + parts.join('') + '</g>' +
    '<path d="' + target.d + '" fill="' + COLOR.active + '" stroke="' + COLOR.activeStroke + '" ' +
    'stroke-width="0.09" stroke-linejoin="round"/>' +
    (raw.nineDash
      ? '<path d="' + raw.nineDash + '" fill="none" stroke="' + COLOR.nineDash + '" ' +
        'stroke-width="0.1" stroke-dasharray="0.55 0.4" stroke-linecap="round"/>'
      : '') +
    marker +
    '</svg>'
  );
}

function fileNameOf(provinceName) {
  const code = adcodeOf(provinceName);
  return code ? 'img/map/cn-' + code + '.svg' : null;
}

module.exports = { load, adcodeOf, svgFor, fileNameOf, DATA_FILE };
