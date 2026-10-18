/* global hexo */
// 摘要文本清洗 helper（VD-8，2026-10-18）。
//
// 背景：首页大卡 / 最新文字 / 归档精选摘录三处的摘要走 strip_html，但
// hexo-util 的 stripHTML 只去标签、不解码 HTML 实体；EJS 的 <%= %> 再转义一次，
// 页面上就出现字面的 `&amp;amp;`。另外正文开头的代码块被剥标签后，highlight.js
// 的行号会粘在摘要开头（如「1if (!featuredPost …)」）。
//
// 本 helper 统一做三件事：
//   1. 去掉多行 <pre> 代码块（摘要里不应出现整段代码；行号问题从根上消失；
//      行内 <code> 保留其文字，否则句子会出现「写的是 。」这类空洞）
//   2. stripHTML 去其余标签
//   3. 解码常见 HTML 实体（&amp; &lt; &gt; &quot; &#39; &nbsp;）+ 折叠空白；
//      若仍有行号残留（≥2 处「数字+标识符」），按行号规则剔除
//
// 位置约束：与 fmt-item-date.js 相同——必须放 themes/fluid/scripts/helpers/ 下，
// 且实现与注册同文件（Hexo 用 vm 逐个执行脚本，跨文件 require 会解析失败）。

'use strict';

const { stripHTML } = require('hexo-util');

const ENTITY_RE = /&(amp|lt|gt|quot|#39|#x27|nbsp);/g;
const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' '
};
// highlight.js 行号：数字紧贴标识符/符号（如 1if、2const、3{）
const LINE_NO_RE = /\b\d{1,3}(?=[A-Za-z_$([{!<'"])/g;

hexo.extend.helper.register('excerptText', function (post, len) {
  if (!post || post.encrypt) return '';
  const max = len || 90;
  const raw = post.description || post.excerpt || post.content || '';
  if (!raw) return '';

  let text = String(raw).replace(/<pre[\s\S]*?<\/pre>/gi, ' ');

  text = stripHTML(text);
  text = text.replace(ENTITY_RE, function (m) { return ENTITY_MAP[m] || m; });

  // 行号兜底：出现两处及以上「数字+标识符」才判定为代码行号，避免误伤「3D 打印」
  const hits = text.match(LINE_NO_RE) || [];
  if (hits.length >= 2) {
    text = text.replace(LINE_NO_RE, '');
  }

  return text.replace(/\s+/g, ' ').trim().substring(0, max).trim();
});
