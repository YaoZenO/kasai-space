/* global hexo */

'use strict';

// 前台静态资源缓存破坏（2026-10-15 建立，2026-10-18 扩充到 main.css）。
//
// 后台（source/admin/）的手法是手填 ?v=YYYYMMDD 并由测试断言两处一致，那套对后台成立，
// 因为后台改动频次低、且改动必然伴随一次发布。前台不成立：改一次 site.css 就要记得 bump 一次，
// 忘了就是线上看不到改动（要靠 Ctrl+F5）。
//
// 这里改为按文件内容算短 hash：内容不变 → hash 不变（浏览器沿用缓存，不产生多余下载）；
// 内容一变 → URL 立刻变（无需人工介入）。配置里仍然写干净的 /css/site.css，版本号只在生成期附加。
//
// 2026-10-18 扩充原因（REVIEW-2026-10-18-PM.md §八-1，已实证）：
//   主人改 `themes/fluid/_config.yml` 的 color 段（如 line_color）时，
//   site.css 的 hash 不变 → 浏览器继续用旧 site.css；
//   而 main.css 由 styl 从 _config.yml 编译而来，内容确实变了，但它在 css.ejs 里是**裸拼 URL**，
//   不带任何版本参数 → 浏览器直接命中本地旧副本 → **主人看不到改动**。
//   即「只改 _config.yml 不改 site.css」是 100% 上线不了的组合，与 MEMORY.md 记的
//   「只改 _config.yml 颜色时 main.css 不会重编译」是同源问题的两个面：
//   那一面是「产物没重新编译」，这一面是「重编译了但 URL 没变，浏览器仍用旧副本」。
//
// main.css 的 hash 不能用 fileHash()——它在 source/ 下不存在，内容在生成后才落在 public/。
// 改为在 after_generate 之后按**产物文件内容**算，这是唯一可靠的时序（此时 main.css 已写盘）。

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

// 取任意绝对路径文件的短 hash；文件不存在返回 null。
function absHash(absPath) {
  let buf;
  try {
    buf = fs.readFileSync(absPath);
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

// ---- main.css 的产物内容 hash（2026-10-18 新增）----
//
// 为什么不能用 after_render:html（实测否决，勿改回）：
//   逐页渲染发生在 CSS 编译之前。实测冷启动（clean 后首次 generate）：
//   after_render:html 触发 205 次，但「触发时 public/css/main.css 已存在」的次数为 **0**——
//   那一刻产物 CSS 还没写盘，hash 恒为 null。Vercel 生产构建是干净 checkout，
//   正是这条冷启动路径，因此 after_render:html 在生产上必然失效。
//
// 为什么不能只靠 after_generate：
//   正常 `hexo generate` 会触发（生产链路成立）；但 test/module-pages-e2e.js 用
//   `hexo.call('generate')` 程序化重建 public/（E-019 纪律要求），该路径实测不触发
//   after_generate，测试跑完版本号被清掉 → 产物断言失败。
//
// 因此注册 after_generate + exit 双重保险，并在 after_generate 时**扫盘改写**已落盘的 HTML
// （after_generate 阶段 HTML 已全部写完）。E2E 那条程序化路径由 test/module-pages-e2e.js
// 的 rebuildClean() 显式调用 stampAll 补齐，契约写在测试侧而非隐藏在此。
//
// 实操纪律：验证本机制时禁止跑 `hexo clean` —— clean 会清空产物，
// 期间任何产物层读数都不可信（2026-10-18 踩过，见 ERRORS.md）。

// 给 HTML 里的 <link href="/css/main.css..."> 盖上版本参数。
// 只认本主题自己的 /css/main.css，不碰外链、不碰其它文件、不碰已带 ?v= 的（幂等）。
function stampMainCss(html, publicDir) {
  if (!html || !publicDir) return html;
  const mainPath = path.join(publicDir, 'css', 'main.css');
  const h = absHash(mainPath);
  if (!h) return html;
  const stamp = '?v=' + h;

  return String(html).replace(
    /(<link[^>]+href=")\/css\/main\.css((?:\?[^"]*)?)("[^>]*>)/g,
    function (m, pre, query, post) {
      // 已带 v= 的，替换成新 hash；没带的，直接追加。两者都保证「只有一个版本参数」。
      if (/[?&]v=/.test(query || '')) return pre + '/css/main.css' + stamp + post;
      // 没带 v 但带了别的查询串（理论上不该有）：保留原查询串并追加 v
      if (query) return pre + '/css/main.css&v=' + h + post;
      return pre + '/css/main.css' + stamp + post;
    }
  );
}

// 扫盘改写 public/ 下所有前台 HTML（排除 admin/ —— 后台有 E-018 独立的手填版本号机制）。
// 幂等：已带正确 hash 的文件改写后内容不变，不会产生无谓写盘。
function stampAll(publicDir) {
  if (!publicDir) return;
  const mainPath = path.join(publicDir, 'css', 'main.css');
  if (!absHash(mainPath)) return; // main.css 还没编译出来，本轮不处理

  let files;
  try {
    files = fs.readdirSync(publicDir, { recursive: true });
  } catch (e) {
    return;
  }
  files.forEach(function (rel) {
    const name = String(rel).replace(/\\/g, '/');
    if (!/\.html$/i.test(name)) return;
    if (name.indexOf('admin/') === 0) return;
    const abs = path.join(publicDir, name);
    let html;
    try {
      html = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      return;
    }
    const out = stampMainCss(html, publicDir);
    if (out !== html) {
      try {
        fs.writeFileSync(abs, out);
      } catch (e) {
        /* 单个文件写失败不应中断整个构建 */
      }
    }
  });
}

// 挂 filter。hexo 是 Hexo 注入的全局；裸 require（测试里直接取 stampAll）时它不存在，
// 此时跳过注册即可——纯函数不需要 hexo。2026-10-18 踩过：顶层直接 require('hexo').extend
// 会在 E2E 补写时抛 ReferenceError，被 try/catch 静默吞掉，表现为「补写没生效」。
if (typeof hexo !== 'undefined' && hexo && hexo.extend && hexo.extend.filter) {
  hexo.extend.filter.register('before_generate', function () {
    const cfg = hexo.theme && hexo.theme.config;
    if (!cfg) return;
    const dir = hexo.source_dir;
    if (!dir) return;
    // 只有自己维护的资源需要：主题自带 css/js 随主题升级整体换路径，不在此列。
    // main.css 例外——它由本主题的 _config.yml 编译而来，主人会直接改那份配置，见上方注释。
    if (cfg.custom_css) cfg.custom_css = versionedUrl(cfg.custom_css, dir);
    if (cfg.custom_js) cfg.custom_js = versionedUrl(cfg.custom_js, dir);
  });

  // 生产链路：hexo generate（含 Vercel）走这里。
  hexo.extend.filter.register('after_generate', function () {
    stampAll(hexo.public_dir);
  });

  // 兜底：进程正常退出前再扫一次。CLI 路径 after_generate 已覆盖，此处防的是
  // 「after_generate 未触发但进程仍正常退出」的情形（如某些 CI 调用方式）。
  hexo.extend.filter.register('exit', function () {
    stampAll(hexo.public_dir);
  });
}

module.exports = { versionedUrl, fileHash, absHash, stampMainCss, stampAll };

