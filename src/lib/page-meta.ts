// 读取 source/ 下页面 Markdown 的 front matter 字段（日期等）。
// 只读，不改 source；结果缓存，避免每个页面重复读盘。

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { parsePostDate } from './dates';

const ROOT = process.cwd();
const cache = new Map<string, any>();

export function pageFrontMatter(relPath: string): Record<string, any> {
  if (cache.has(relPath)) return cache.get(relPath);
  let data: Record<string, any> = {};
  const full = path.join(ROOT, 'source', relPath);
  if (fs.existsSync(full)) {
    const text = fs.readFileSync(full, 'utf8');
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (m) {
      const parsed = yaml.load(m[1]);
      if (parsed && typeof parsed === 'object') data = parsed as Record<string, any>;
    }
  }
  cache.set(relPath, data);
  return data;
}

/**
 * head 里 article:* 的时间：只用可复现的显式字段，绝不用文件 mtime。
 * 顺序：published = date ?? show_updated；modified = updated ?? published。
 * 文件 mtime 在 Vercel 上等于部署时刻（每次构建都变），会让同一个提交
 * 产出不同 HTML，既污染缓存也失去「内容何时改过」的意义（E-028 同源问题）。
 */
export function pageDates(relPath: string): { published?: Date; modified?: Date } {
  const fm = pageFrontMatter(relPath);
  const publishedRaw = fm.date ?? fm.show_updated;
  const modifiedRaw = fm.updated ?? publishedRaw;
  return {
    published: publishedRaw ? parsePostDate(publishedRaw) ?? undefined : undefined,
    modified: modifiedRaw ? parsePostDate(modifiedRaw) ?? undefined : undefined,
  };
}
