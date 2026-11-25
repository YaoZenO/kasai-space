// 数据层：只读 source/_data/*.yml，不改写、不补默认值。
// 缺失文件返回 null 并警告（迁移期宁可显式缺，也不要静默造数据）。

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// 构建期工作目录即仓库根（同 site-config.ts：不能用 import.meta.url）
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'source', '_data');

const FILES = [
  'site',
  'modules',
  'projects',
  'games',
  'collections',
  'cityrank',
  'cities',
  'cityphotos',
  'holidays',
  'festivals',
  'library',
  'zodiac',
  'plates',
] as const;

export type DataKey = (typeof FILES)[number];
export type DataMap = Record<DataKey, any>;

let cache: DataMap | null = null;

function loadOne(name: DataKey): any {
  const file = path.join(DATA_DIR, `${name}.yml`);
  try {
    return yaml.load(fs.readFileSync(file, 'utf8')) ?? null;
  } catch (err) {
    console.warn(`[data] 读取失败 ${name}.yml:`, (err as Error).message);
    return null;
  }
}

export function getData(): DataMap {
  if (cache) return cache;
  const out = {} as DataMap;
  for (const name of FILES) out[name] = loadOne(name);
  cache = out;
  return out;
}
