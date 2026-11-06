// 静态资源缓存破坏：逐字移植 themes/fluid/scripts/filters/asset-version.js。
//
// 规则（与现站一致，不重新设计）：
//   · hash = 文件内容的 sha1 前 8 位
//   · HTML 里所有 href/src 指向 /fonts|/img|/lib|/js|/css/ 的 URL 都盖 ?v=
//   · CSS 里 url(/fonts|/img|/lib/...) 也盖，避免 preload 与 @font-face 变成两个 URL
//   · 先压缩 CSS，再算 hash、再盖章（顺序反了 hash 会抖动）
//
// 与 Hexo 的差别只在调用时机：Astro 构建完成后由 tools/stamp-assets.mjs 扫 dist/。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { minifyCss } from './minify-css.mjs';

/** 任意绝对路径文件的短 hash；文件不存在返回 null */
export function absHash(absPath) {
  let buf;
  try {
    buf = fs.readFileSync(absPath);
  } catch {
    return null;
  }
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

/** 给 /css/main.css 的 <link> 盖版本参数（幂等） */
export function stampMainCss(html, publicDir) {
  if (!html || !publicDir) return html;
  const h = absHash(path.join(publicDir, 'css', 'main.css'));
  if (!h) return html;
  const stamp = '?v=' + h;

  return String(html).replace(
    /(<link[^>]+href=")\/css\/main\.css((?:\?[^"]*)?)("[^>]*>)/g,
    function (m, pre, query, post) {
      if (/[?&]v=/.test(query || '')) return pre + '/css/main.css' + stamp + post;
      if (query) return pre + '/css/main.css&v=' + h + post;
      return pre + '/css/main.css' + stamp + post;
    }
  );
}

/** 给 HTML 里所有站内静态资源盖 ?v=<hash8>（幂等） */
export function stampStaticAssets(html, publicDir) {
  if (!html || !publicDir) return html;
  const cache = new Map();

  function hashOf(urlPath) {
    if (cache.has(urlPath)) return cache.get(urlPath);
    const rel = urlPath.replace(/^\/+/, '');
    let h = null;
    if (rel && rel.indexOf('..') === -1) h = absHash(path.join(publicDir, rel));
    cache.set(urlPath, h);
    return h;
  }

  return String(html).replace(
    /\b(href|src)="(\/(?:fonts|img|lib|js|css)\/[^"?#]+)(\?[^"]*)?"/g,
    function (m, attr, pathPart, query) {
      const h = hashOf(pathPart);
      if (!h) return m;
      const existing = query && /[?&]v=([0-9a-f]{8})/.exec(query);
      if (existing && existing[1] === h) return m;
      return attr + '="' + pathPart + '?v=' + h + '"';
    }
  );
}

/** CSS 内 url() 盖章 */
export function stampCssAssets(css, publicDir) {
  if (!css || !publicDir) return css;
  const cache = new Map();
  function hashOf(urlPath) {
    if (cache.has(urlPath)) return cache.get(urlPath);
    const rel = urlPath.replace(/^\/+/, '');
    let h = null;
    if (rel && rel.indexOf('..') === -1) h = absHash(path.join(publicDir, rel));
    cache.set(urlPath, h);
    return h;
  }
  return String(css).replace(
    /url\((["']?)(\/(?:fonts|img|lib)\/[^)"'?#]+)(\?[^)"']*)?\1\)/g,
    function (m, q, pathPart, query) {
      const h = hashOf(pathPart);
      if (!h) return m;
      const existing = query && /[?&]v=([0-9a-f]{8})/.exec(query);
      if (existing && existing[1] === h) return m;
      return 'url(' + q + pathPart + '?v=' + h + q + ')';
    }
  );
}

/** 扫盘压缩 + 改写所有前台 CSS（排除 admin/） */
export function stampAllCss(publicDir) {
  if (!publicDir) return;
  let files;
  try {
    files = fs.readdirSync(publicDir, { recursive: true });
  } catch {
    return;
  }
  for (const rel of files) {
    const name = String(rel).replace(/\\/g, '/');
    if (!/\.css$/i.test(name)) continue;
    if (name.indexOf('admin/') === 0) continue;
    const abs = path.join(publicDir, name);
    let css;
    try {
      css = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const out = stampCssAssets(css, publicDir);
    if (out !== css) {
      try {
        fs.writeFileSync(abs, out);
      } catch {
        /* 单文件失败不中断构建 */
      }
    }
  }
}

/** 压缩 publicDir/css 下所有 CSS（幂等） */
export function minifyAll(publicDir) {
  if (!publicDir) return 0;
  const cssDir = path.join(publicDir, 'css');
  let files;
  try {
    files = fs.readdirSync(cssDir);
  } catch {
    return 0;
  }
  let changed = 0;
  for (const name of files) {
    if (!/\.css$/i.test(name)) continue;
    const abs = path.join(cssDir, name);
    let css;
    try {
      css = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const min = minifyCss(css);
    if (min !== css) {
      try {
        fs.writeFileSync(abs, min);
        changed += 1;
      } catch {
        /* 单文件失败不中断构建 */
      }
    }
  }
  return changed;
}

/** 扫盘压缩 CSS、盖章 CSS、盖章 HTML（排除 admin/） */
export function stampAll(publicDir) {
  if (!publicDir) return;
  const mainPath = path.join(publicDir, 'css', 'main.css');
  if (!absHash(mainPath)) return; // main.css 不存在则本轮不处理

  try {
    minifyAll(publicDir);
  } catch {
    /* 压缩失败不阻塞构建 */
  }

  stampAllCss(publicDir);

  let files;
  try {
    files = fs.readdirSync(publicDir, { recursive: true });
  } catch {
    return;
  }
  for (const rel of files) {
    const name = String(rel).replace(/\\/g, '/');
    if (!/\.html$/i.test(name)) continue;
    if (name.indexOf('admin/') === 0) continue;
    const abs = path.join(publicDir, name);
    let html;
    try {
      html = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const out = stampStaticAssets(stampMainCss(html, publicDir), publicDir);
    if (out !== html) {
      try {
        fs.writeFileSync(abs, out);
      } catch {
        /* 单文件失败不中断构建 */
      }
    }
  }
}
