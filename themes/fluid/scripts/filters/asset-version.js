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

// ---- 静态资源内容 hash 扩展（2026-10-23，PERF-AUDIT P1-3）----
//
// 为什么必须做这一步（P0-2 缓存头的前置条件）：
//   之前只有 main.css / site.css / holidays.js 带 hash。字体 4.18 MB、图片 5.09 MB、
//   lib 下的 CSS/JS 全是裸路径。裸路径 + 长期缓存 = 改图后用户永远吃旧副本，
//   所以那批资源只能设 max-age=0，每次导航都要 revalidate。
//   给它们盖上内容 hash 后，URL 随内容变，才敢上 immutable。
//
// 只处理这几种前缀：/fonts/ /img/ /lib/ /js/ /css/。
// 它们都是「内容变了 URL 就该变」的静态资产。
//
// ⚠️ 为什么 /js/ 与 /css/ 也必须在这里盖章（2026-10-23 踩到的坑）：
//   vercel.json 给 /js/(.*) 与 /css/(.*) 设了 immutable（一年不重验）。
//   而 /js/utils.js、/js/events.js、/js/plugins.js、/js/boot.js、/js/color-schema.js、
//   /js/local-search.js、/js/img-lazyload.js 与 /css/highlight.css 原本都是**裸路径无 hash**。
//   裸路径 + immutable = 改完代码用户永远吃旧副本（E-035 同型病，且更严重——
//   E-035 只是 max-age=0 下命中旧副本，这里是缓存一年）。
//   所以要么给它们盖章，要么不设 immutable。这里选盖章（更彻底）。
//   /js/holidays.js 已有 versionedAsset helper 盖章，此处幂等跳过。
const STAMP_PREFIXES = /^\/(fonts|img|lib|js|css)\//;

function stampStaticAssets(html, publicDir) {
  if (!html || !publicDir) return html;
  const cache = new Map(); // urlPath -> hash8 | null

  function hashOf(urlPath) {
    if (cache.has(urlPath)) return cache.get(urlPath);
    const rel = urlPath.replace(/^\/+/, '');
    let h = null;
    if (rel && rel.indexOf('..') === -1) {
      h = absHash(path.join(publicDir, rel));
    }
    cache.set(urlPath, h);
    return h;
  }

  return String(html).replace(
    /\b(href|src)="(\/(?:fonts|img|lib|js|css)\/[^"?#]+)(\?[^"]*)?"/g,
    function (m, attr, pathPart, query) {
      const h = hashOf(pathPart);
      if (!h) return m; // 文件不存在：原样返回
      const existing = query && /[?&]v=([0-9a-f]{8})/.exec(query);
      if (existing && existing[1] === h) return m; // 已经是最新 hash，不动
      return attr + '="' + pathPart + '?v=' + h + '"';
    }
  );
}

// CSS 内的 url(/fonts/...) 也要盖章，否则与 HTML 里的 preload 变成两个不同 URL：
//   preload 请求 /fonts/x.woff2?v=abc（HTML 已被 stampStaticAssets 盖章）
//   @font-face 请求 /fonts/x.woff2（CSS 未盖章）
// 浏览器视为两个资源 → **字体被下载两次**，preload 完全白费。
// 这是 P1-3 与 preload 的耦合点，必须成对处理。
function stampCssAssets(css, publicDir) {
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

// 扫盘改写 public/ 下所有前台 CSS（排除 admin/ 与 lib/ 之外的第三方 vendor 不动？——
// 这里只改 public/css/ 与 public/lib/ 下的 CSS，都是本站可改资源）。
function stampAllCss(publicDir) {
  if (!publicDir) return;
  let files;
  try {
    files = fs.readdirSync(publicDir, { recursive: true });
  } catch (e) {
    return;
  }
  files.forEach(function (rel) {
    const name = String(rel).replace(/\\/g, '/');
    if (!/\.css$/i.test(name)) return;
    if (name.indexOf('admin/') === 0) return;
    const abs = path.join(publicDir, name);
    let css;
    try {
      css = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      return;
    }
    const out = stampCssAssets(css, publicDir);
    if (out !== css) {
      try {
        fs.writeFileSync(abs, out);
      } catch (e) {
        /* 单个文件写失败不应中断整个构建 */
      }
    }
  });
}

// 扫盘改写 public/ 下所有前台 HTML（排除 admin/ —— 后台有 E-018 独立的手填版本号机制）。
// 幂等：已带正确 hash 的文件改写后内容不变，不会产生无谓写盘。
function stampAll(publicDir) {
  if (!publicDir) return;
  const mainPath = path.join(publicDir, 'css', 'main.css');
  if (!absHash(mainPath)) return; // main.css 还没编译出来，本轮不处理

  // ⚠️ 顺序铁律：先压缩 CSS，再算 hash、再盖章。
  // 若顺序反了，hash 算的是压缩前内容，而线上传输的是压缩后字节——
  // 「内容不变 hash 不变」的性质被破坏（每次构建都抖动），且 URL 与实际内容脱钩。
  // 因此把压缩放在这里而不是独立 filter：同一个函数内保证时序。
  try {
    require('./minify-css').minifyAll(publicDir);
  } catch (e) {
    /* 压缩失败不阻塞构建：宁可发未压缩的 CSS，也不能发不出页面 */
  }

  // 先改 CSS（把 @font-face 的 src 盖上 hash），再改 HTML。
  // 顺序无关正确性（两者各自幂等），但先 CSS 后 HTML 更符合直觉：HTML 引用的是最终 URL。
  stampAllCss(publicDir);

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
    const out = stampStaticAssets(stampMainCss(html, publicDir), publicDir);
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
    if (process.env.ASSET_VERSION_DEBUG) {
      const p = path.join(hexo.public_dir || '', 'css', 'main.css');
      console.log('[asset-version] after_generate main.css exists =', fs.existsSync(p));
    }
    stampAll(hexo.public_dir);
  });

  // 真正的写盘完成点：generateAfter 事件（after_generate 时 CSS 常尚未落盘，实测踩到）。
  if (typeof hexo.on === 'function') {
    hexo.on('generateAfter', function () {
      if (process.env.ASSET_VERSION_DEBUG) {
        const p = path.join(hexo.public_dir || '', 'css', 'main.css');
        console.log('[asset-version] generateAfter main.css exists =', fs.existsSync(p));
      }
      stampAll(hexo.public_dir);
    });
  }

  // 兜底：Hexo 自己的 exit filter。⚠️ 实测它在 CLI `hexo generate` 路径下**不触发**
  // （只有 `hexo.call('exit')` 之类显式调用才走），所以下面那条 process 级钩子才是主力。
  hexo.extend.filter.register('exit', function () {
    stampAll(hexo.public_dir);
  });

  // 主力：Node 进程级 exit（2026-10-19 实测补上）。
  //
  // 为什么必须到这一层：干净/全量构建时（Vercel 每次都是干净 checkout），
  // after_generate 与 generateAfter 触发的那一刻 public/css/main.css **尚未落盘**
  // （实测 exists = false），stampAll 会因拿不到 hash 直接返回；而 Hexo 的 exit filter
  // 在 CLI 下又不触发 → 全站 HTML 拿不到版本号。上一轮「41/42 覆盖」的验证是**假阳性**：
  // 那次跑的是增量构建，main.css 早就躺在盘上，after_generate 才有得盖。
  // 进程退出前所有写盘均已完成，这里扫盘盖章是唯一对全量构建也成立的时序。
  //
  // 只用同步 API：process 的 exit 事件里异步写盘不会被执行完。
  process.on('exit', function () {
    try {
      stampAll(hexo.public_dir);
    } catch (e) {
      /* 退出阶段的失败不应影响构建退出码 */
    }
  });
}

module.exports = { versionedUrl, fileHash, absHash, stampMainCss, stampStaticAssets, stampCssAssets, stampAllCss, stampAll };

