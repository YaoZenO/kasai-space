'use strict';

// 前台静态资源版本号（helper 形态）。
//
// 为什么不复用 filters/asset-version.js 的 versionedUrl：
//   那个函数在 before_generate 里改写 theme 配置，只服务 custom_css / custom_js 两项；
//   这里需要的是「模板里对任意一个 source/ 下的文件取内容 hash」，用途不同，
//   但 hash 算法必须与它一致（sha1 前 8 位），否则同一套缓存策略会出现两种 URL 形态。
//
// 为什么不用 js() / css() helper：
//   给带 ?v= 的 URL 走 hexo 的 js() helper，它会给路径追加 .js 后缀，产物变成
//   /js/holidays.js?v=xxx.js → 404（E-025 已踩过）。模板里手写 <script src>。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function versionedAsset(url) {
  const raw = String(url || '');
  if (!raw) return raw;
  if (/^(https?:)?\/\//.test(raw)) return raw;

  const base = raw.split('?')[0];
  const sourceDir = (typeof hexo !== 'undefined' && hexo && hexo.source_dir) ? hexo.source_dir : null;
  if (!sourceDir) return raw;

  const rel = base.replace(/^\//, '');
  if (!rel || rel.indexOf('..') !== -1) return raw;

  let buf;
  try {
    buf = fs.readFileSync(path.join(sourceDir, rel));
  } catch (e) {
    // 文件不存在就保持原 URL：宁可不带版本号，也不制造坏链接
    return raw;
  }
  const h = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
  return base + '?v=' + h;
}

if (typeof hexo !== 'undefined' && hexo && hexo.extend && hexo.extend.helper) {
  hexo.extend.helper.register('versionedAsset', versionedAsset);
}

module.exports = { versionedAsset };
