// CSS 压缩：逐字移植 themes/fluid/scripts/filters/minify-css.js 的算法。
//
// 为什么不用 cssnano / clean-css：本项目只需要「去注释 + 去多余空白」，
// 不做 calc 化简、颜色缩写、规则合并（那些有改变语义的风险）。零新依赖。
//
// 幂等性：重复压缩结果一致，否则 asset-version 的 hash 会抖动（E-060 教训）。

/**
 * 去注释 + 压缩空白。
 * @param {string} css
 * @returns {string}
 */
export function minifyCss(css) {
  if (!css) return css;

  let out = '';
  let i = 0;
  const n = css.length;
  let inStr = null;

  while (i < n) {
    const ch = css[i];
    const next = css[i + 1];

    if (inStr) {
      out += ch;
      if (ch === '\\') {
        out += next || '';
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inStr = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      const end = css.indexOf('*/', i + 2);
      const body = end === -1 ? css.slice(i) : css.slice(i, end + 2);
      if (body.startsWith('/*!')) out += body;
      i = end === -1 ? n : end + 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  out = out.replace(/\s+/g, ' ');
  out = out
    .replace(/\s*([{};:,>+~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/^\s+|\s+$/g, '');

  return out + '\n';
}
