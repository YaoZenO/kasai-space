// 页面摘要：对齐 head.ejs 的 strip_html(page.excerpt).substring(0,200).trim() 行为。
// 只用于 <meta description>/og:description，不参与页面正文渲染。
// 块间距规律来自 Hexo 渲染产物：标题与下一块紧邻（0 空格）、段落之间 1 个、
// 列表项各 1 个、列表结束到下个块 2 个。

function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/[ \t]+/g, ' ');
}

/**
 * 与 Hexo 渲染后 strip_html 的文本形态对齐：先生成纯文本，再按 HTML 属性转义。
 * Hexo 的 markdown 渲染器会把正文里的 `/` 输出成 `&#x2F;`，这里同样处理，
 * 保证 description 与现站逐字一致；实体在浏览器里仍显示为原字符。
 */
function escapeHtmlLikeHexo(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

export function excerptFromMarkdown(md: string, limit = 200): string {
  const blocks = (md || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\n{2,}/);

  let out = '';
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    if (/^#{1,6}\s/.test(block)) {
      // 标题：去掉标记，且不追加换行（下一块紧邻）
      out += stripInline(block.replace(/^#{1,6}\s+/, ''));
      continue;
    }

    if (/^(?:[-*+]|\d+\.)\s/m.test(block)) {
      // 列表：每项前 1 个换行，列表结束额外 1 个（合计 2 个空格）
      out += block
        .split(/\r?\n/)
        .map(line => '\n' + stripInline(line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')))
        .join('') + '\n\n';
      continue;
    }

    if (/^>/.test(block)) {
      out += block
        .split(/\r?\n/)
        .map(line => stripInline(line.replace(/^>\s?/, '')))
        .join('\n') + '\n';
      continue;
    }

    out += stripInline(block) + '\n';
  }

  // 先转义再截断，和现站「渲染后 strip_html → substring(200)」的计数口径一致
  return escapeHtmlLikeHexo(out.replace(/\n/g, ' ')).trim().substring(0, limit).trim();
}

/** 首页大卡 / 精选摘录用的纯文本摘要（对齐 theme scripts/helpers/excerpt-text.js） */
export function excerptText(raw: string, len = 90): string {
  if (!raw) return '';
  let text = String(raw).replace(/<pre[\s\S]*?<\/pre>/gi, ' ');
  text = text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  // 先命名实体（可把 &amp;#x2F; 还原成 &#x2F;），再数字实体，顺序不可颠倒
  text = text.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, m => {
    const map: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&#x27;': "'",
      '&nbsp;': ' ',
    };
    return map[m] || m;
  });
  text = text.replace(/&#(?:[xX][0-9a-fA-F]+|\d+);/g, m => {
    const body = m.slice(2, -1);
    const code = /^[xX]/.test(body) ? parseInt(body.slice(1), 16) : parseInt(body, 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
    try {
      return String.fromCodePoint(code);
    } catch {
      return m;
    }
  });
  // highlight.js 行号残留兜底
  const LINE_NO_RE = /\b\d{1,3}(?=[A-Za-z_$([{!<'"])/g;
  const hits = text.match(LINE_NO_RE) || [];
  if (hits.length >= 2) text = text.replace(LINE_NO_RE, '');
  return text.replace(/\s+/g, ' ').trim().substring(0, len).trim();
}
