/* global hexo */

'use strict';

// 前台静态资源缓存破坏（2026-10-15）。
//
// 后台（source/admin/）的手法是手填 ?v=YYYYMMDD 并由测试断言两处一致，那套对后台成立，
// 因为后台改动频次低、且改动必然伴随一次发布。前台不成立：改一次 site.css 就要记得 bump 一次，
// 忘了就是线上看不到改动（要靠 Ctrl+F5）。
//
// 这里改为按文件内容算短 hash：内容不变 → hash 不变（浏览器沿用缓存，不产生多余下载）；
// 内容一变 → URL 立刻变（无需人工介入）。配置里仍然写干净的 /css/site.css，版本号只在生成期附加。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 取 source 目录下文件的短 hash；文件缺失返回 null，调用方保持原 URL，不制造坏链接。
function fileHash(sourceDir, urlPath) {
  const rel = String(urlPath || '').replace(/^\//, '');
  if (!rel || rel.indexOf('..') !== -1) return null;
  let buf;
  try {
    buf = fs.readFileSync(path.join(sourceDir, rel));
  } catch (e) {
    return null;
  }
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

// 给站内资源 URL 附加 ?v=<hash8>。幂等：对已带版本号的 URL 重算结果相同（server 热更新需要）。
// 外链、空值、已带其它查询串的资源一律原样返回。
function versionedUrl(url, sourceDir) {
  const raw = String(url || '');
  if (!raw) return raw;
  if (/^(https?:)?\/\//.test(raw)) return raw;
  const base = raw.split('?')[0];
  const h = fileHash(sourceDir, base);
  return h ? base + '?v=' + h : raw;
}

hexo.extend.filter.register('before_generate', function () {
  const cfg = hexo.theme && hexo.theme.config;
  if (!cfg) return;
  const dir = hexo.source_dir;
  if (!dir) return;
  // 只有自己维护的资源需要：主题自带 css/js 随主题升级整体换路径，不在此列。
  if (cfg.custom_css) cfg.custom_css = versionedUrl(cfg.custom_css, dir);
  if (cfg.custom_js) cfg.custom_js = versionedUrl(cfg.custom_js, dir);
});

module.exports = { versionedUrl, fileHash };
