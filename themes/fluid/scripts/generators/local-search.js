/* global hexo */

'use strict';

hexo.extend.generator.register('_hexo_generator_search', function(locals) {
  const config = this.theme.config;
  if (!config.search.enable) {
    return;
  }

  const nunjucks = require('nunjucks');
  const env = new nunjucks.Environment();
  const pathFn = require('path');
  const fs = require('fs');

  env.addFilter('uriencode', function(str) {
    return encodeURI(str);
  });

  env.addFilter('noControlChars', function(str) {
    // eslint-disable-next-line no-control-regex
    return str && str.replace(/[\x00-\x1F\x7F]/g, '');
  });

  env.addFilter('urlJoin', function(str) {
    const base = str[0];
    const relative = str[1];
    return relative
      ? base.replace(/\/+$/, '') + '/' + relative.replace(/^\/+/, '')
      : base;
  });

  // IA-6/T3-4：模板移出 theme source/，避免它作为静态资源被原样复制进 public/
  // （原位置会泄漏未渲染的 {% ... %} 模板，可公开访问）。
  // 位置必须在 scripts/ 之外：Hexo 会把 scripts/ 下所有文件当 JS 脚本加载，
  // 放在那里会报 "Unexpected token '<'" 并导致整个搜索索引不生成。
  const searchTmplSrc = pathFn.join(hexo.theme_dir, './templates/local-search.xml');
  const searchTmpl = nunjucks.compile(fs.readFileSync(searchTmplSrc, 'utf8'), env);

  const searchConfig = config.search;
  let searchField = searchConfig.field;
  const content = searchConfig.content && true;

  let posts, pages;

  if (searchField.trim() !== '') {
    searchField = searchField.trim();
    if (searchField === 'post') {
      posts = locals.posts.sort('-date');
    } else if (searchField === 'page') {
      pages = locals.pages;
    } else {
      posts = locals.posts.sort('-date');
      pages = locals.pages;
    }
  } else {
    posts = locals.posts.sort('-date');
  }

  const xml = searchTmpl.render({
    config : config,
    posts  : posts,
    pages  : pages,
    content: content,
    url    : hexo.config.root
  });

  return {
    path: searchConfig.generate_path || '/local-search.xml',
    data: xml
  };
});
