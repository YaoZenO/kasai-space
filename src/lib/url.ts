// URL 工具：与 Hexo 的 url_for / url_join 行为对齐。
// 非 ASCII 路径保持原文（现站产物目录名即中文原名）。

export function urlFor(p = '/'): string {
  if (!p) return '/';
  if (/^(https?:)?\/\//.test(p)) return p;
  return p.startsWith('/') ? p : '/' + p;
}

export function urlJoin(...parts: string[]): string {
  return parts
    .map((s, i) => (i === 0 ? s.replace(/\/$/, '') : s.replace(/^\/|\/$/g, '')))
    .filter(Boolean)
    .join('/');
}

export function assetUrl(prefix: string, file: string): string {
  return urlJoin(prefix || '/js', file);
}

/** 当前路径归一：去掉 index.html，用于导航选中态 */
export function normalizePath(p: string): string {
  if (!p) return '/';
  return ('/' + p).replace(/index\.html$/, '');
}
