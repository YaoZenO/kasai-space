// /atom.xml：Atom 订阅源（复刻 hexo-generator-feed 的 atom 分支）。
// 与插件一致：按 -date 排序、取前 limit 篇（配置 limit=20）、summary 截断 140、
// content 去掉控制字符后用 CDATA 输出、分类与标签带各自 permalink。

import { generateAtomFeed } from 'feedsmith';
import hexoUtil from 'hexo-util';
import { getPosts, taxonomyHref } from '../lib/posts';
import { siteConfig } from '../lib/site-config';

// hexo-util 是 CommonJS，Node 22 不支持具名导入，必须走默认导入（E-112）。
const { encodeURL } = hexoUtil as typeof import('hexo-util');

const SITE = String(siteConfig.url || 'https://www.040925.xyz');
const LIMIT = Number(siteConfig.feed?.limit) || 20;

function fullUrl(href: string): string {
  return SITE + href;
}

function entryDescription(desc: any, content: string): string {
  if (desc) return String(desc);
  return String(content || '').substring(0, 140);
}

function stripControl(s: string): string {
  return s.replace(/[\x00-\x1F\x7F]/g, '');
}

export async function GET() {
  const all = getPosts().slice().sort((a, b) => b.date.getTime() - a.date.getTime());
  const posts = LIMIT ? all.slice(0, LIMIT) : all;
  const currentYear = new Date().getFullYear();

  const entries = posts.map((p) => {
    const link = encodeURL(fullUrl(p.href));
    const categories: { term: string; scheme: string }[] = [];
    for (const name of p.categories) {
      categories.push({ term: name, scheme: encodeURL(fullUrl(taxonomyHref('categories', name))) });
    }
    for (const name of p.tags) {
      categories.push({ term: name, scheme: encodeURL(fullUrl(taxonomyHref('tags', name))) });
    }
    return {
      title: p.title,
      id: link,
      links: [{ href: link }],
      summary: entryDescription('', p.content),
      content: stripControl(p.content),
      published: p.date,
      updated: p.updated || p.date,
      authors: siteConfig.author ? [{ name: String(siteConfig.author), email: siteConfig.email }] : [],
      categories,
    };
  });

  const xml = generateAtomFeed(
    {
      title: siteConfig.title,
      id: encodeURL(fullUrl('/')),
      subtitle: siteConfig.subtitle || siteConfig.description,
      updated: posts[0]?.updated || posts[0]?.date || new Date(),
      links: [
        { href: encodeURL(fullUrl('/')), rel: 'alternate' },
        { href: encodeURL(fullUrl('/atom.xml')), rel: 'self' },
      ],
      generator: { text: 'Hexo', uri: 'https://hexo.io/' },
      rights: siteConfig.author ? `All rights reserved ${currentYear}, ${siteConfig.author}` : undefined,
      authors: siteConfig.author ? [{ name: String(siteConfig.author), email: siteConfig.email }] : [],
      entries,
      language: siteConfig.language,
    },
    { lenient: true },
  );

  return new Response(xml, {
    headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
  });
}
