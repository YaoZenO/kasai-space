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
  nineDash: '#9a9184',
  // 插图的底取纸色系而不是纯白：右下角本来就是空白海面，纯白会亮成一块「空格子」，
  // 只有跟纸面同调 + 稍深的边框，才读得成一张单独的小图。
  insetBg: '#f7f3e9',
  insetStroke: '#c9bfab',
  insetLabel: '#8c8377'
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

  // 南海诸岛插图（右下角带边框的小图）。
  // 主图裁到海南以南，7～18°N 那段空白与断续线全部挪进这张插图——这是中国地图的
  // 通行版面；不裁则版心下半张全是空的，裁了不补插图则等于把断续线裁没了。
  // 插图与主图共用同一份 <g>（用 <use> 引用，不复制 59KB 路径），
  // 但插图放大倍率不同，描边要按倍率折算，否则细线会粗成一片。
  const ins = raw.inset;
  let insetSvg = '';
  if (ins && raw.nineDash) {
    const box = ins.viewBox.split(/\s+/).map(Number);
    const scale = ins.width / box[2];
    const k = (v) => Math.round((v / scale) * 1000) / 1000;
    const r2 = (v) => Math.round(v * 100) / 100;
    const frame = k(0.12);
    const fx = r2(box[0] + frame / 2);
    const fy = r2(box[1] + frame / 2);
    const fw = r2(box[2] - frame);
    const fh = r2(box[3] - frame);
    insetSvg =
      '<svg x="' + ins.x + '" y="' + ins.y + '" width="' + ins.width + '" height="' + ins.height + '" ' +
      'viewBox="' + ins.viewBox + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      // 底色在内、边框在最外层：边框若先画，顶部的陆地会把上边框整个盖掉，
      // 只剩左、右、下三条边（第一版就是这样，看着像图被裁掉了一截）。
      '<rect x="' + box[0] + '" y="' + box[1] + '" width="' + box[2] + '" height="' + box[3] + '" ' +
      'fill="' + COLOR.insetBg + '"/>' +
      '<use href="#cn-land" fill="' + COLOR.land + '" stroke="' + COLOR.landStroke + '" ' +
      'stroke-width="' + k(0.09) + '" stroke-linejoin="round"/>' +
      // 本省在 defs 的陆地组里是被排除的（主图里单独高亮）。插图若不补这一笔，
      // 广东、海南这些落在插图里的省份会留下一个洞。
      '<path d="' + target.d + '" fill="' + COLOR.active + '" stroke="' + COLOR.activeStroke + '" ' +
      'stroke-width="' + k(0.09) + '" stroke-linejoin="round"/>' +
      '<path d="' + raw.nineDash + '" fill="none" stroke="' + COLOR.nineDash + '" ' +
      'stroke-width="' + k(0.1) + '" stroke-dasharray="' + k(0.55) + ' ' + k(0.4) + '" ' +
      'stroke-linecap="round"/>' +
      // 图内小标注：这张小图面积小、内容本来就是大片海面，不写名字会被当成一个空框
      '<text x="' + r2(box[0] + box[2] / 2) + '" y="' + r2(box[1] + box[3] - 1.1) + '" ' +
      'font-size="1.4" font-family="serif" text-anchor="middle" ' +
      'letter-spacing="0.15" fill="' + COLOR.insetLabel + '">南海诸岛</text>' +
      '<rect x="' + fx + '" y="' + fy + '" width="' + fw + '" height="' + fh + '" ' +
      'fill="none" stroke="' + COLOR.insetStroke + '" stroke-width="' + frame + '"/>' +
      '</svg>';
  }

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + raw.main.viewBox + '" ' +
    'role="img" aria-label="' + provinceName + '在中国的位置">' +
    '<defs><g id="cn-land">' + parts.join('') + '</g></defs>' +
    '<use href="#cn-land" fill="' + COLOR.land + '" stroke="' + COLOR.landStroke + '" ' +
    'stroke-width="0.09" stroke-linejoin="round"/>' +
    '<path d="' + target.d + '" fill="' + COLOR.active + '" stroke="' + COLOR.activeStroke + '" ' +
    'stroke-width="0.09" stroke-linejoin="round"/>' +
    marker +
    insetSvg +
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

module.exports = { load, adcodeOf, svgFor, fileNameOf, aspectOf, DATA_FILE };
