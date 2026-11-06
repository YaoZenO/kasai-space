// /sitemap.xml：站点地图（复刻 hexo-generator-sitemap：文章 + Markdown 页面按 updated 倒序，
// 再补首页、标签、分类；生成器挂的动态页不在页面模型里，旧站同样不收录）。

import fs from 'node:fs';
import path from 'node:path';
import { encodeURL } from 'hexo-util';
import { getPosts, getTags, getCategories } from '../lib/posts';
import { siteConfig } from '../lib/site-config';
import { pageDates } from '../lib/page-meta';

const SITE = String(siteConfig.url || 'https://www.040925.xyz');
const ROOT = path.join(process.cwd(), 'source');

function toDate(v: any): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

function collectPages(): { path: string; updated: Date | null }[] {
  const out: { path: string; updated: Date | null }[] = [];
  const push = (rel: string) => {
    const d = pageDates(rel);
    out.push({ path: rel.replace(/index\.md$/, 'index.html'), updated: d.modified || d.published || null });
  };

  for (const slug of ['about', 'now', 'festivals']) push(`${slug}/index.md`);

  // 目录首页（holidays/library/zodiac/index.md）也要收录，现站 sitemap 含这三条。
  for (const dir of ['holidays', 'library', 'zodiac'] as const) {
    push(`${dir}/index.md`);
    const full = path.join(ROOT, dir);
    for (const name of fs.readdirSync(full)) {
      if (name === 'index.md') continue;
      const rel = `${dir}/${name}/index.md`;
      if (fs.existsSync(path.join(ROOT, rel))) push(rel);
    }
  }
  return out;
}

function isoDay(d: Date | null): string | null {
  return d ? d.toISOString().substring(0, 10) : null;
}

export async function GET() {
  const now = new Date();

  // p.path / taxonomy path 均自带前导 `/`，直接拼接，避免出现 `//`。
  const posts = getPosts().map((p) => ({
    permalink: SITE + p.path,
    updated: p.updated || p.date,
  }));

  const pages = collectPages().map((p) => ({
    permalink: SITE + '/' + p.path,
    updated: p.updated,
  }));

  const rows = [...posts, ...pages].sort((a, b) => {
    const av = toDate(a.updated)?.getTime() || 0;
    const bv = toDate(b.updated)?.getTime() || 0;
    return bv - av;
  });

  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const r of rows) {
    parts.push('  <url>');
    parts.push(`    <loc>${encodeURL(r.permalink)}</loc>`);
    if (r.updated) parts.push(`    <lastmod>${isoDay(toDate(r.updated))}</lastmod>`);
    parts.push('    <changefreq>monthly</changefreq>');
    parts.push('    <priority>0.6</priority>');
    parts.push('  </url>');
  }
  parts.push('  <url>');
  parts.push(`    <loc>${encodeURL(SITE)}</loc>`);
  parts.push(`    <lastmod>${isoDay(now)}</lastmod>`);
  parts.push('    <changefreq>daily</changefreq>');
  parts.push('    <priority>1.0</priority>');
  parts.push('  </url>');
  for (const tag of getTags()) {
    parts.push('  <url>');
    parts.push(`    <loc>${encodeURL(SITE + tag.path)}</loc>`);
    parts.push(`    <lastmod>${isoDay(now)}</lastmod>`);
    parts.push('    <changefreq>weekly</changefreq>');
    parts.push('    <priority>0.2</priority>');
    parts.push('  </url>');
  }
  for (const cat of getCategories()) {
    parts.push('  <url>');
    parts.push(`    <loc>${encodeURL(SITE + cat.path)}</loc>`);
    parts.push(`    <lastmod>${isoDay(now)}</lastmod>`);
    parts.push('    <changefreq>weekly</changefreq>');
    parts.push('    <priority>0.2</priority>');
    parts.push('  </url>');
  }
  parts.push('</urlset>');

  return new Response(parts.join('\n') + '\n', {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
