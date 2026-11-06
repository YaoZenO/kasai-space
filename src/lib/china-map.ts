// 中国省级小地图：移植 themes/fluid/scripts/helpers/china-map.js。
//
// 做法：构建期把 themes/fluid/data/china-provinces.json 的省级边界路径拼成静态 SVG，
// 一省一份（cn-<adcode>.svg），本省填 accent、其余填纸色。
// 合规纪律：路径数据只做投影与抽稀，不改动边界；台湾、港澳、南海断续线为独立要素。

import fs from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.join(process.cwd(), 'themes', 'fluid', 'data', 'china-provinces.json');

const COLOR = {
  land: '#e9e2d4',
  landStroke: '#d3ccbc',
  active: '#a8482c',
  activeStroke: '#8c3a22',
  nineDash: '#9a9184',
  tag: '#8c3a22',
};

const ACTIVE_STROKE = 0.12;
const TAG_SIZE = 1.0;

let CACHE: { raw: any; byName: Record<string, any> } | null = null;

function load() {
  if (CACHE) return CACHE;
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const byName: Record<string, any> = {};
  for (const p of raw.provinces) byName[p.name] = p;
  CACHE = { raw, byName };
  return CACHE;
}

const SUFFIX = /(维吾尔自治区|壮族自治区|回族自治区|特别行政区|自治区|地区|省|市)$/;

function coreOf(name: string): string {
  return String(name || '').replace(/^中国/, '').replace(SUFFIX, '');
}

function resolveName(provinceName: string): string | null {
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

function adcodeOf(provinceName: string): number | null {
  const { byName } = load();
  const key = resolveName(provinceName);
  return key ? byName[key].adcode : null;
}

function shortName(name: string): string {
  return String(name).replace(/^中国/, '').replace(SUFFIX, '');
}

// 指引线朝哪边：默认朝右（东侧多为海面），右边 2.4 个单位内有别的省级单位就朝左，
// 免得两个标注叠在一起（澳门右边就是香港）。
function tagSide(target: any, raw: any): number {
  for (const p of raw.provinces) {
    if (p.adcode === target.adcode) continue;
    if (typeof p.cx !== 'number' || typeof p.cy !== 'number') continue;
    if (Math.abs(p.cy - target.cy) < 0.8 && p.cx > target.cx && p.cx - target.cx < 2.4) return -1;
  }
  return 1;
}

function tagFor(target: any, raw: any): string {
  if (!target || !target.d) return '';
  if (Math.max(target.bw || 0, target.bh || 0) >= TAG_SIZE) return '';
  if (typeof target.cx !== 'number' || typeof target.cy !== 'number') return '';
  const dir = tagSide(target, raw);
  const ax = target.cx;
  const ay = target.cy;
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

export function svgFor(provinceName: string): string | null {
  const { raw, byName } = load();
  const key = resolveName(provinceName);
  const target = key ? byName[key] : null;
  if (!target) return null;

  const parts: string[] = [];
  for (const p of raw.provinces) {
    if (!p.d) continue;
    if (p.adcode === target.adcode) continue;
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
    '<path d="' + target.d + '" fill="' + COLOR.active + '" stroke="' + COLOR.activeStroke + '" ' +
    'stroke-width="' + ACTIVE_STROKE + '" stroke-linejoin="round"/>' +
    tagFor(target, raw) +
    '</svg>'
  );
}

export function fileNameOf(provinceName: string): string | null {
  const code = adcodeOf(provinceName);
  return code ? 'img/map/cn-' + code + '.svg' : null;
}

export function aspectOf(): number | null {
  const { raw } = load();
  return raw.main && raw.main.aspect ? raw.main.aspect : null;
}
