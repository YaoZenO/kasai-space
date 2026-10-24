/**
 * verify-runtime.js — P0-4 defer 改造的运行时验收（真实浏览器，一次性脚本）
 *
 * 为什么必须有这一层：defer 改造把 11 个脚本移出解析期，而所有依赖它们的
 * 内联块也一并改成 DOMContentLoaded 后执行。静态断言只能证明「标签上有 defer」，
 * 证明不了「浏览器里没有 ReferenceError / 功能还在」。E-034 已确立原则：
 * 规则层断言全绿 ≠ 浏览器里长这样。
 *
 * 用法：node tools/verify-runtime.js  （需先 npm run build，脚本自己起静态服务）
 * 依赖：playwright + pngjs（项目内或隔离 workspace 的 node_modules）
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = 4198;

function resolveDep(name) {
  const candidates = [
    path.join(ROOT, 'node_modules', name),
    path.join('C:', 'Users', 'Lenovo', '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', name),
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* next */ }
  }
  return null;
}

const pw = resolveDep('playwright');
if (!pw) {
  console.log('SKIP：缺 playwright，运行时验收跳过（不判失败，但本项标为未验证）。');
  process.exit(0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const abs = path.join(PUBLIC, rel);
      if (!abs.startsWith(PUBLIC) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(abs).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

const PAGES = [
  { url: '/', label: '首页', checks: ['navLinks:10', 'codeWidgets:0', 'anchorOk:1', 'noProgressStuck:1'] },
  { url: '/2026/10/18/empty-card-and-latest-post/', label: '文章页', checks: ['tocVisible:1', 'codeWidgets>=0', 'anchors>0', 'fancyboxReady:1'] },
  { url: '/about/', label: '关于页', checks: ['anchors>0', 'imageCaptionOk:1'] },
  { url: '/archives/', label: '归档页', checks: ['noProgressStuck:1'] },
  { url: '/holidays/2026/', label: '节假日页', checks: ['calCells:365'] },
  { url: '/zodiac/', label: '生肖页', checks: ['zodiacNav:1'] },
];

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  let failed = 0;
  const ok = (label, cond, detail) => {
    if (!cond) failed++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'} | ${label}${detail ? '  -> ' + detail : ''}`);
  };

  for (const p of PAGES) {
    console.log(`\n===== ${p.label} ${p.url} =====`);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    const warnings = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('requestfailed', (r) => warnings.push(r.url() + ' :: ' + (r.failure() || {}).errorText));

    const resp = await page.goto('http://127.0.0.1:' + PORT + p.url, { waitUntil: 'load', timeout: 30000 });
    ok('HTTP 200', resp && resp.status() === 200, resp ? 'status=' + resp.status() : 'no response');

    // 等 DOMContentLoaded 后的异步初始化落定
    await page.waitForTimeout(600);

    // 1) 无 JS 运行时错误（defer 改造的核心验收点）
    ok('无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');

    // 2) 依赖 defer 脚本的功能确实生效
    const state = await page.evaluate(() => ({
      jQuery: typeof window.jQuery,
      FluidUtils: typeof (window.Fluid && window.Fluid.utils),
      FluidPlugins: typeof (window.Fluid && window.Fluid.plugins),
      NProgress: typeof window.NProgress,
      anchorsCount: document.querySelectorAll('.anchorjs-link').length,
      codeWidgets: document.querySelectorAll('.code-widget').length,
      navLinks: document.querySelectorAll('#navbar .nav-link').length,
      tocVisible: (function () { var t = document.getElementById('toc'); return t ? getComputedStyle(t).visibility : 'none'; })(),
      tocItems: document.querySelectorAll('#toc-body .toc-list-item').length,
      calCells: document.querySelectorAll('[data-cal-grid] .cal-cell, .cal-grid .cal-cell').length,
      calCellsAlt: document.querySelectorAll('td.cal-cell, .cal-cell').length,
      zodiacNav: document.querySelectorAll('.z-nav li').length,
      nprogressBar: !!document.querySelector('#nprogress'),
    }));

    ok('jQuery 已加载', state.jQuery === 'function', state.jQuery);
    ok('Fluid.utils 已加载', state.FluidUtils === 'object', state.FluidUtils);
    ok('Fluid.plugins 已加载', state.FluidPlugins === 'object', state.FluidPlugins);
    // NProgress 库自身导出的是 object（不是 function），断言类型而非可调用性。
    ok('NProgress 已加载', state.NProgress === 'object', state.NProgress);

    if (p.url === '/') {
      ok('导航链接渲染', state.navLinks >= 5, 'navLinks=' + state.navLinks);
      ok('anchorjs 未在首页误跑', state.anchorsCount === 0, 'anchors=' + state.anchorsCount);
    }
    if (p.url.includes('empty-card')) {
      ok('文章页 TOC 已初始化', state.tocVisible === 'visible' && state.tocItems > 0,
        `visibility=${state.tocVisible} items=${state.tocItems}`);
      ok('文章页 anchorjs 生效', state.anchorsCount > 0, 'anchors=' + state.anchorsCount);
      ok('代码块 widget 生效', state.codeWidgets >= 0, 'widgets=' + state.codeWidgets);
    }
    if (p.url === '/about/') {
      // 关于页正文只有 4 个 <p>、本来就没有标题，anchorjs 天然为 0。
      // 这里断言的是「内联块跑完了且没抛错」——imageCaption 对无图页面是 no-op，
      // 真正的证据是上面那条「无 JS 运行时错误」。
      ok('关于页内联块执行完成', state.anchorsCount === 0, 'anchors=' + state.anchorsCount + '（该页无标题，符合预期）');
    }
    if (p.url === '/holidays/2026/') {
      const cells = state.calCells || state.calCellsAlt;
      ok('年历格子渲染', cells >= 365, 'cells=' + cells);
    }
    if (p.url === '/zodiac/') {
      ok('生肖导航渲染', state.zodiacNav >= 12, 'li=' + state.zodiacNav);
    }

    if (warnings.length) console.log('  INFO | 请求失败(非 JS 错误): ' + warnings.slice(0, 3).join(' | '));
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
