// 城市页配图登记：只认 cityphotos.yml 里备注了来源的条目，缺图/缺来源一律不展示照片。
// 同时按 JPEG 的 SOF 段读取真实像素，供 <img width height> 在加载前占位（防 CLS）。

import fs from 'node:fs';
import path from 'node:path';

export function readJpegSize(file: string): { w: number; h: number } | null {
  try {
    const b = fs.readFileSync(file);
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) {
        i += 1;
        continue;
      }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  } catch (e) {
    /* 读不到尺寸就不写 width/height，CSS 仍按原比例排 */
  }
  return null;
}

export function cityPhoto(slug: string, registry: any) {
  const entry = registry && registry[slug];
  if (!entry || !entry.credit) return null;
  const file = path.join(process.cwd(), 'source', 'img', 'cities', slug + '.jpg');
  if (!fs.existsSync(file)) return null;
  const size = readJpegSize(file);
  return {
    src: '/img/cities/' + slug + '.jpg',
    credit: entry.credit,
    width: size ? size.w : null,
    height: size ? size.h : null,
  };
}
