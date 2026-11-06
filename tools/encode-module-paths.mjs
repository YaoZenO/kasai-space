// 构建后处理：把「无 slug、由标题生成」的项目/游戏详情目录改成百分号编码名。
//
// 为什么需要这一步：现站 module-pages.js 对无 slug 的条目执行
// `encodeURIComponent(title)` 作为路由段，产物目录名因此是 %E6%A0%A1…；
// Astro 的 getStaticPaths 要求传原始参数（内部按需编码），产物目录会写成中文原名。
// 两种写法在服务端等价，但为与 URL 基线逐字节一致、并避免依赖服务器的百分号解码，
// 这里把这两类目录重命名成编码名。只处理「无 slug 的条目」，有 slug 的一律不动。

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const DATA = path.join(ROOT, 'source', '_data');

function encodeNonAscii(s) {
  return encodeURIComponent(s);
}

let renamed = 0;
for (const key of ['projects', 'games']) {
  const file = path.join(DATA, `${key}.yml`);
  if (!fs.existsSync(file)) continue;
  const items = (yaml.load(fs.readFileSync(file, 'utf8'))?.items || []).filter((it) => it && it.title);
  for (const it of items) {
    if (it.slug) continue; // 有显式 slug 的条目本来就由用户给出，不需编码
    const title = String(it.title);
    const encoded = encodeNonAscii(title);
    if (encoded === title) continue; // 纯 ASCII，无需重命名
    const from = path.join(DIST, key, title);
    const to = path.join(DIST, key, encoded);
    if (!fs.existsSync(from)) continue;
    if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
    fs.renameSync(from, to);
    renamed += 1;
    console.log(`[encode-module-paths] ${key}/${title} -> ${encoded}`);
  }
}

console.log('[encode-module-paths] 重命名目录数 =', renamed);
