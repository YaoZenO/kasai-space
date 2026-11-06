// open_graph / description meta：移植 hexo 的 open_graph helper 输出形态
// （node_modules/hexo/dist/plugins/helper/open_graph.js）。
//
// 只实现当前站点会走到的分支：非文章页（type=website）、twitter_card 取主题配置。

import { siteConfig, themeConfig } from './site-config';

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHTML(str: string): string {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function localeToTerritory(lang?: string): string | undefined {
  if (!lang) return undefined;
  const s = String(lang);
  if (s.length === 5) {
    const territory = s.includes('-') ? s.split('-') : s.split('_');
    if (territory.length === 2) return territory[0].toLowerCase() + '_' + territory[1].toUpperCase();
  }
  return undefined;
}

function meta(name: string, content?: string, escape = true): string {
  const c = content && escape ? escapeHTML(content) : content;
  return c ? `<meta name="${name}" content="${c}">` : `<meta name="${name}">`;
}

function og(name: string, content?: string, escape = true): string {
  const c = content && escape ? escapeHTML(content) : content;
  return c ? `<meta property="${name}" content="${c}">` : `<meta property="${name}">`;
}

export interface OpenGraphOptions {
  title?: string;
  description?: string;
  /** description 已是「Hexo 渲染后 strip_html → 截断 → 转义」的成品（页面摘要走这条） */
  descriptionPreformatted?: boolean;
  url: string;
  type?: 'website' | 'article';
  images?: string[];
  keywords?: string[];
  date?: Date | null;
  updated?: Date | null;
  language?: string;
  author?: string;
}

export function openGraphTags(opts: OpenGraphOptions): string {
  const description = opts.description || siteConfig.description || '';
  const keywords = (opts.keywords && opts.keywords.length ? opts.keywords : undefined) || siteConfig.keywords || false;
  const title = opts.title || siteConfig.title;
  const type = opts.type || 'website';
  const url = opts.url;
  const siteName = siteConfig.title;
  const language = opts.language || siteConfig.language;
  const author = opts.author || siteConfig.author;

  const lines: string[] = [];

  if (description) {
    const clean = opts.descriptionPreformatted
      ? description.replace(/\n/g, ' ')
      : escapeHTML(stripHTML(description).substring(0, 200).trim()).replace(/\n/g, ' ');
    lines.push(meta('description', clean, !opts.descriptionPreformatted));
  }
  lines.push(og('og:type', type));
  lines.push(og('og:title', title));
  lines.push(og('og:url', url, false));
  lines.push(og('og:site_name', siteName));
  if (description) {
    const clean = opts.descriptionPreformatted
      ? description.replace(/\n/g, ' ')
      : escapeHTML(stripHTML(description).substring(0, 200).trim()).replace(/\n/g, ' ');
    lines.push(og('og:description', clean, false));
  }
  const locale = localeToTerritory(language);
  if (locale) lines.push(og('og:locale', locale, false));

  const images = (opts.images || [])
    .map(p => (p.startsWith('http') ? p : new URL(p, url || siteConfig.url).toString()))
    .filter(u => !u.startsWith('data:'));
  images.forEach(p => lines.push(og('og:image', p, false)));

  if (opts.date instanceof Date && !Number.isNaN(opts.date.valueOf())) {
    lines.push(og('article:published_time', opts.date.toISOString(), false));
  }
  if (opts.updated instanceof Date && !Number.isNaN(opts.updated.valueOf())) {
    lines.push(og('article:modified_time', opts.updated.toISOString(), false));
  }
  if (author) lines.push(og('article:author', author));
  if (keywords) {
    const list = Array.isArray(keywords) ? keywords : [keywords];
    list
      .map((k: any) => (k && k.name ? k.name : k))
      .filter(Boolean)
      .sort()
      .forEach(k => lines.push(og('article:tag', k)));
  }

  lines.push(meta('twitter:card', themeConfig.open_graph?.twitter_card || 'summary'));
  if (images.length) lines.push(meta('twitter:image', images[0], false));

  return lines.join('\n');
}
