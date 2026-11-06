// /img/map/cn-<adcode>.svg：省级小地图（一省一份），复刻 cityrank-pages.js 末尾的 SVG 路由。
// 只输出城市页真正引用到的省份，避免多写无人用的文件。

import { getData } from '../../../lib/data';
import { buildCityRanks, cityHasPage } from '../../../lib/cityrank-data';
import { fileNameOf, svgFor } from '../../../lib/china-map';

export function getStaticPaths() {
  const R = buildCityRanks(getData());
  if (R.error) return [];

  const provinces = new Set<string>();
  for (const c of R.cities) {
    if (!cityHasPage(R, c)) continue;
    if (c.province && fileNameOf(c.province)) provinces.add(c.province);
  }

  return [...provinces].map((province) => ({
    params: { code: fileNameOf(province)!.replace('img/map/', '').replace('.svg', '') },
    props: { province },
  }));
}

export async function GET({ props }: any) {
  const svg = svgFor(props.province);
  return new Response(svg ?? '', {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
}
