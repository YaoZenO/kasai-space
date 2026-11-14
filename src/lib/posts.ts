// 文章数据层：只读 source/_posts/*.md，不改写源文件。
// 字段语义对齐 Hexo：permalink 用 :year/:month/:day/:title，分类/标签路径用 slugize。

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { createRequire } from 'node:module';
import { parsePostDate, formatWithPattern } from './dates';
import { renderMarkdown } from './markdown';
import { excerptFromMarkdown } from './excerpt';

const require = createRequire(process.cwd() + '/');
const { stripHTML, slugize, encodeURL } = require('hexo-util') as any;

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, 'source', '_posts');

export interface Post {
  /** 源文件名（不含扩展名） */
  name: string;
  slug: string;
  title: string;
  date: Date;
  updated: Date;
  /** 顶层分类名（本站均为扁平分类） */
  categories: string[];
  tags: string[];
  /** 站内路径，如 /2026/10/18/date-becomes-machine-string/ */
  path: string;
  /** href 用（非 ASCII 转百分号编码） */
  href: string;
  body: string;
  content: string;
  excerpt: string;
  wordcount: number;
  min2read: number;
  /** 首图：front matter 的 index_img / cover */
  cover?: string;
  /**
   * 首页策展用的一句话结论（front matter 的 blurb）。
   * 与 excerpt 分开：excerpt 是正文截取，blurb 是作者写给首页的那一句。
   * 首页「硬核思考」只读这个字段，绝不回退到正文截取——正文开头的「数据出处」块
   * 一旦被截进首页，就变成机械引用（2026-11-15 重构的硬约束）。
   */
  blurb?: string;
}

function parseFrontMatter(raw: string): { data: any; body: string } {
  const src = raw.replace(/^\uFEFF/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { data: {}, body: src };
  return { data: (yaml.load(m[1]) as any) || {}, body: src.slice(m[0].length) };
}

function toArray(v: any): string[] {
  if (v == null) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) {
    // 嵌套数组在 Hexo 里表示层级；本站没有层级，取最深一层
    return v.map(x => (Array.isArray(x) ? x[x.length - 1] : x)).filter(Boolean).map(String);
  }
  return [];
}

/** 分类/标签在站内的路径（Hexo 用 slugize 生成） */
export function taxonomyPath(type: 'categories' | 'tags', name: string): string {
  return `/${type}/${slugize(name)}/`;
}

export function taxonomyHref(type: 'categories' | 'tags', name: string): string {
  return encodeURL(taxonomyPath(type, name));
}

let cache: Post[] | null = null;

export function getPosts(): Post[] {
  if (cache) return cache;
  const files = fs
    .readdirSync(POSTS_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .sort();

  const posts: Post[] = [];
  for (const file of files) {
    const name = file.replace(/\.md$/, '');
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const { data: fm, body } = parseFrontMatter(raw);
    const slug = String(fm.slug || name);
    const date = parsePostDate(fm.date ?? fm.published);
    if (!date) {
      console.warn(`[posts] ${file} 缺少可用 date，跳过`);
      continue;
    }
    const updated = parsePostDate(fm.updated) ?? date;
    const content = renderMarkdown(body);
    const wordcount = stripHTML(content).replace(/\s/g, '').length;
    const awl = 2;
    const wpm = 60;
    const p = `/${formatWithPattern(date, 'YYYY')}/${formatWithPattern(date, 'MM')}/${formatWithPattern(
      date,
      'DD'
    )}/${slug}/`;
    posts.push({
      name,
      slug,
      title: String(fm.title || slug),
      date,
      updated,
      categories: toArray(fm.categories),
      tags: toArray(fm.tags),
      path: p,
      href: encodeURL(p),
      body,
      content,
      excerpt: fm.description ? String(fm.description) : excerptFromMarkdown(body, 110),
      wordcount,
      min2read: Math.floor(wordcount / (awl * wpm)) + 1,
      cover: fm.index_img || fm.cover || undefined,
      blurb: fm.blurb ? String(fm.blurb) : undefined,
    });
  }

  // Hexo 默认 index_generator.order_by: -date
  posts.sort((a, b) => b.date.getTime() - a.date.getTime() || a.name.localeCompare(b.name));
  cache = posts;
  return posts;
}

export interface Taxonomy {
  name: string;
  /** URL 段（Hexo 用 slugize 生成，如 "C++" → "C"） */
  slug: string;
  path: string;
  href: string;
  posts: Post[];
}

/**
 * 现站「同计数」条目的顺序来自 Hexo 的 db.json 历史插入记录，源码里无法复现。
 * 这里按现站实际渲染顺序冻结一份同序表（仅用于打破 count 相等的平局），
 * 新出现的条目排在已知条目之后，按拼音兜底。
 */
const KNOWN_ORDER: Record<'categories' | 'tags', string[]> = {
  categories: ['名词解释', '职业发展', '踩坑记录', '学习路线', '个人感悟', '城市数据', '设计资源'],
  tags: [
    '工程',
    '名词解释',
    '大模型',
    '面试',
    '产品经理',
    'Hexo',
    'C++',
    '学习路线',
    '随笔',
    '城市数据',
    '城市排行榜',
    '设计风格',
    '建站',
  ],
};

function orderRank(type: 'categories' | 'tags', name: string): number {
  const i = KNOWN_ORDER[type].indexOf(name);
  return i < 0 ? KNOWN_ORDER[type].length : i;
}

function collect(type: 'categories' | 'tags'): Taxonomy[] {
  const map = new Map<string, Post[]>();
  for (const post of getPosts()) {
    for (const name of post[type]) {
      const list = map.get(name) || [];
      list.push(post);
      map.set(name, list);
    }
  }
  return [...map.entries()]
    .map(([name, posts]) => ({
      name,
      slug: slugize(name),
      path: taxonomyPath(type, name),
      href: taxonomyHref(type, name),
      posts: posts.sort((a, b) => b.date.getTime() - a.date.getTime()),
    }))
    .sort(
      (a, b) =>
        b.posts.length - a.posts.length ||
        orderRank(type, a.name) - orderRank(type, b.name) ||
        a.name.localeCompare(b.name, 'zh-Hans-CN')
    );
}

export function getCategories(): Taxonomy[] {
  return collect('categories');
}

export function getTags(): Taxonomy[] {
  return collect('tags');
}

export interface ArchiveBucket {
  year: string;
  months: { month: string; posts: Post[] }[];
  posts: Post[];
}

export function getArchives(): ArchiveBucket[] {
  const map = new Map<string, Map<string, Post[]>>();
  for (const post of getPosts()) {
    const y = formatWithPattern(post.date, 'YYYY');
    const m = formatWithPattern(post.date, 'MM');
    if (!map.has(y)) map.set(y, new Map());
    const months = map.get(y)!;
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(post);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, months]) => {
      const monthList = [...months.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([month, posts]) => ({ month, posts }));
      return { year, months: monthList, posts: monthList.flatMap(x => x.posts) };
    });
}

/** 上一页/下一页（Hexo 按时间倒序：prev 是更新的，next 是更早的） */
export function getPrevNext(post: Post): { prev?: Post; next?: Post } {
  const posts = getPosts();
  const i = posts.findIndex(p => p.path === post.path);
  return { prev: i > 0 ? posts[i - 1] : undefined, next: i >= 0 && i < posts.length - 1 ? posts[i + 1] : undefined };
}
