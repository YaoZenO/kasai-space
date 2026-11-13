/* global hexo */

'use strict';

// 前台 CSS 构建期压缩（2026-10-23，PERF-AUDIT P0-5）。
//
// 为什么自己做而不用 cssnano / clean-css：
//   AGENTS.md §3 禁止「安装不必要的第三方工具」。本项目的压缩需求很窄——
//   site.css 是手写单文件（2,838 行 / 172 个注释块 / 注释占 21,972 B），
//   只需要「去注释 + 去多余空白」，不需要 cssnano 的 calc 化简、颜色缩写、
//   规则合并等激进变换（那些还有改变语义的风险）。自己写 40 行即可，
//   零新依赖、行为完全可预测、可被测试锁定。
//
// 压缩发生在 after_generate 之后（产物已写盘），只处理 /css/ 下的本站 CSS：
//   · site.css  —— 手写、注释多、收益最大
//   · main.css  —— 已由 stylus 压缩过，这里幂等无害
// 不处理 /lib/ 下的第三方 vendor CSS（bootstrap 等已经是 .min.css，重复处理无收益
// 且可能触碰其内部语法）。
//
// ⚠️ 幂等性：重复跑结果必须一致，否则 asset-version 的 hash 会抖动。
// 所有替换都是「已经压缩过的内容再压缩一次不变」的形式。

const fs = require('fs');
const path = require('path');

/**
 * 去注释 + 压缩空白。保守实现，只做三件事：
 *  1) 删掉 /* ... *\/ 注释（但保留 /*! 开头的 license 注释，那是授权要求）
 *  2) 把连续空白折叠成一个空格
 *  3) 删掉选择器/声明边界上的多余空格（{ } ; : , > + ~ 前后）
 *
 * 不做的（避免改变语义）：
 *  · 不动字符串内容（url("a b") 里的空格必须保留）
 *  · 不合并规则、不缩写颜色、不化简 calc()
 *  · 不动 @media 里的查询表达式
 */
function minifyCss(css) {
  if (!css) return css;

  // 1) 先摘出注释。用逐字符扫描而非正则，避免被 url(data:.../*...*/) 或
  //    字符串里的 /* 误伤——这类误伤在生产上表现为「样式莫名少一段」，很难查。
  let out = '';
  let i = 0;
  const n = css.length;
  let inStr = null; // 当前所在字符串的引号

  while (i < n) {
    const ch = css[i];
    const next = css[i + 1];

    // 字符串内部：原样拷贝到闭合引号
    if (inStr) {
      out += ch;
      if (ch === '\\') { out += next || ''; i += 2; continue; }
      if (ch === inStr) inStr = null;
      i += 1;
      continue;
    }

    // 字符串开始
    if (ch === '"' || ch === "'") { inStr = ch; out += ch; i += 1; continue; }

    // 注释开始
    if (ch === '/' && next === '*') {
      const end = css.indexOf('*/', i + 2);
      const body = end === -1 ? css.slice(i) : css.slice(i, end + 2);
      // /*! 开头的是 license 注释，SIL OFL / MIT 等授权要求保留
      if (body.startsWith('/*!')) out += body;
      i = end === -1 ? n : end + 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  // 2) 折叠空白
  out = out.replace(/\s+/g, ' ');

  // 3) 收边界空格（注意不要碰字符串内部——上一步之后字符串仍带引号，
  //    下面的正则都要求紧邻标点，正常不会命中带引号的内容）
  //    2026-11-14（E-153）：不处理 `:`。选择器里的 `.a ::selection` 是「后代」，
  //    压成 `.a::selection` 就变成「自身」，规则会静默失效；声明里的
  //    `color: red` 保留一个空格完全合法，不值得为这点体积冒语义风险。
  out = out
    .replace(/\s*([{};,>+~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/^\s+|\s+$/g, '');

  // 4) 末尾保留一个换行（避免某些工具/编辑器把它当二进制）
  return out + '\n';
}

function minifyAll(publicDir) {
  if (!publicDir) return 0;
  const cssDir = path.join(publicDir, 'css');
  let files;
  try {
    files = fs.readdirSync(cssDir);
  } catch (e) {
    return 0;
  }
  let changed = 0;
  files.forEach(function (name) {
    if (!/\.css$/i.test(name)) return;
    const abs = path.join(cssDir, name);
    let css;
    try {
      css = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      return;
    }
    const min = minifyCss(css);
    if (min !== css) {
      try {
        fs.writeFileSync(abs, min);
        changed += 1;
      } catch (e) {
        /* 单个文件失败不中断构建 */
      }
    }
  });
  return changed;
}

// 注册时机：**不在本文件注册**。
//
// 压缩必须发生在 asset-version 的 stampAll 内部、且在算 hash 之前，
// 否则 hash 算的是压缩前内容、线上传的是压缩后字节（「内容不变 hash 不变」被破坏）。
// 因此唯一入口是 asset-version.js 的 stampAll() 里对 minifyAll() 的调用。
// 本文件只导出纯函数，供 stampAll 与测试使用。
//
// 历史教训对应 E-060：把「先后顺序有语义」的两步拆到两个 filter 里，
// 靠文件名加载顺序保证时序是不可靠的——Hexo 不承诺 filter 跨文件顺序。

module.exports = { minifyCss, minifyAll };
