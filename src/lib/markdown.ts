// Markdown 渲染：对齐 Hexo 的 marked 渲染器 + hexo-util highlight。
//
// 为什么不直接用 Astro 的 Shiki 管线：现站代码块是 highlight.js 的
// <figure class="highlight"><table><td class="gutter">…</table> 结构，
// 主题的 highlight.styl 只认这套 DOM/类名。换成 Shiki 会让所有代码块失去样式，
// 违反「视觉以现站为准」。所以这里复用 Hexo 自己的渲染产物形态。

import { Marked } from 'marked';
import { createRequire } from 'node:module';
import { siteConfig, themeConfig } from './site-config';

const require = createRequire(process.cwd() + '/');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  highlight,
  slugize,
  encodeURL,
  escapeHTML: escapeHtml,
  unescapeHTML,
  isExternalLink,
  stripHTML,
} = require('hexo-util') as any;

const SITE_URL = String(siteConfig.url || '');
const CODE_CFG = (themeConfig.code && themeConfig.code.highlight) || {};
const LINE_NUMBER = CODE_CFG.line_number !== false;
const PREPEND_ROOT = CODE_CFG.prependRoot !== false;

/** Hexo url_for 的等价实现：只处理「站点内相对路径」 */
function urlForPath(p: string): string {
  if (!p) return '/';
  if (/^(https?:)?\/\//.test(p)) return p;
  if (p.startsWith('/') || p.startsWith('#')) return p;
  return '/' + p;
}

/** hexo-renderer-marked 的 smartypants（逐字复刻，引号必须被吞掉而不是回填） */
function smartypants(text: string): string {
  return (
    text
      // em-dashes
      .replace(/---/g, '\u2014')
      // en-dashes
      .replace(/--/g, '\u2013')
      // opening singles
      .replace(/(^|[-\u2014/([{"\s])'/g, '$1\u2018')
      // closing singles & apostrophes
      .replace(/'/g, '\u2019')
      // opening doubles
      .replace(/(^|[-\u2014/([{\u2018\s])"/g, '$1\u201c')
      // closing doubles
      .replace(/"/g, '\u201d')
      // ellipses
      .replace(/\.{3}/g, '\u2026')
  );
}

/** Hexo 用 escapeSwigTag 把代码块里的 {} 实体化，避免被模板引擎当变量 */
function escapeSwigTag(html: string): string {
  return html.replace(/{/g, '&#123;').replace(/}/g, '&#125;');
}

const renderer = {
  heading(this: any, { tokens, depth }: any) {
    const text = this.parser.parseInline(tokens);
    // 与 hexo-renderer-marked 的 anchorId 完全一致：
    //   slugize(stripHTML(unescape(text)).trim(), { transform: modifyAnchors })
    // 现站标题 id 形如「一、先把单位钉死：B-和-T-都不是字节」，空格要变成 `-`。
    const unescapedText = unescapeHTML(text);
    let id = slugize(String(stripHTML(unescapedText)).trim(), {
      transform: this.options.modifyAnchors,
    });
    const ids = this.options._headingId || (this.options._headingId = {});
    if (Object.prototype.hasOwnProperty.call(ids, id)) {
      id = `${id}-${ids[id]}`;
      ids[id] += 1;
    } else {
      ids[id] = 0;
    }
    const hrefId = escapeHtml(id);
    // Hexo 的标题渲染不追加换行，下一块紧跟在同一行
    return `<h${depth} id="${hrefId}"><a href="#${hrefId}" class="headerlink" title="${escapeHtml(
      unescapedText
    )}"></a>${text}</h${depth}>`;
  },

  link(this: any, { href, title, tokens }: any) {
    const text = this.parser.parseInline(tokens);
    let out = `<a href="${encodeURL(href)}"`;
    if (title) out += ` title="${escapeHtml(title)}"`;
    if (isExternalLink(href, SITE_URL, [])) {
      out += ' target="_blank" rel="noopener"';
    }
    out += `>${text}</a>`;
    return out;
  },

  image(this: any, { href, title, text }: any) {
    const src = PREPEND_ROOT ? urlForPath(href) : href;
    let out = `<img src="${encodeURL(src)}" alt="${escapeHtml(text || '')}"`;
    if (title) out += ` title="${escapeHtml(title)}"`;
    out += '>';
    return out;
  },

  code(this: any, { text, lang, codeBlockStyle }: any) {
    // 缩进式代码块：Hexo 只给 <pre><code> 补 hljs 类，不做 figure 包裹
    if (codeBlockStyle === 'indented') {
      return `<pre><code class="hljs">${escapeHtml(text)}</code></pre>\n`;
    }
    const result = highlight(text, {
      lang: lang || '',
      hljs: true,
      autoDetect: true,
      gutter: LINE_NUMBER,
      firstLine: 1,
      line_threshold: 0,
      wrap: false,
      tab: '',
    });
    // Hexo 在 markdown 解析前就渲染围栏代码块，并用 escapeSwigTag 实体化大括号
    return escapeSwigTag(result) + '\n';
  },
};

const tokenizer = {
  // 与 hexo-renderer-marked 一致：普通文本过 smartypants，raw block / URL 开头不动
  inlineText(this: any, src: string) {
    const cap = this.rules.inline.text.exec(src);
    if (cap) {
      const text =
        this.lexer.state.inRawBlock || this.rules.inline.url.exec(src)
          ? cap[0]
          : escapeHtml(smartypants(cap[0]));
      return { type: 'text', raw: cap[0], text };
    }
    return undefined;
  },
};

const md = new Marked({ gfm: true, breaks: true });
md.use({ renderer, tokenizer });

/** 渲染文章正文。返回现站同形态的 HTML（已含标题锚点、代码高亮、外链属性）。 */
export function renderMarkdown(body: string): string {
  const html = md.parse(body, {
    gfm: true,
    breaks: true,
    modifyAnchors: 0,
    prependRoot: true,
    _headingId: {},
  }) as string;
  return html;
}
