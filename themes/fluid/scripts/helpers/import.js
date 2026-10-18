/* global hexo */

'use strict';

hexo.extend.helper.register('import_js', function(base, relative, ex = '') {
  if (!Array.isArray(this.page.script_snippets)) {
    this.page.script_snippets = [];
  }
  this.page.script_snippets.push(this.js_ex(base, relative, ex));
});

hexo.extend.helper.register('import_script', function(snippet) {
  if (!Array.isArray(this.page.script_snippets)) {
    this.page.script_snippets = [];
  }
  this.page.script_snippets.push(snippet);
});

hexo.extend.helper.register('import_css', function(base, relative, ex = '') {
  if (!Array.isArray(this.page.css_snippets)) {
    this.page.css_snippets = [];
  }
  this.page.css_snippets.push(this.css_ex(base, relative, ex));
});

// 非首屏关键 CSS 的异步加载（T3-3）：link 先以 media="print" 进入（不参与首屏渲染，
// 不阻塞），加载完成后 onload 切回 all。适用于 tooltip、灯箱、代码配色这类
// 「首屏不需要、晚几十毫秒到位无感知」的样式表。
// 不用 css_ex：它拼出的标签固定为 rel/href，加不了 media 与 onload。
hexo.extend.helper.register('import_css_async', function(base, relative) {
  if (!Array.isArray(this.page.css_snippets)) {
    this.page.css_snippets = [];
  }
  const href = this.url_join(base, relative);
  this.page.css_snippets.push(
    `<link rel="stylesheet" href="${href}" media="print" onload="this.media='all'">` +
      `<noscript><link rel="stylesheet" href="${href}"></noscript>`
  );
});
