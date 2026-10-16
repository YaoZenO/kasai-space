'use strict';
// 前台静态资源缓存破坏锁定（2026-10-15）。
// 目的：site.css 改完必须让线上立刻拿到新文件，且「内容没变时不该让用户重新下载」。
// 锁的是两件事：① hash 算法与拼法正确（内容变 → URL 变，内容不变 → URL 不变）；
// ② filter 真的注册并真的改到了 theme.config（只测纯函数会漏掉「脚本没挂上」这种静默失效）。
//
// 运行：node test/asset-version.js

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'source');

// Hexo 加载主题 scripts/ 时注入全局 hexo。单测里自建最小替身并捕获注册的回调，
// 之后手动调用它，等价于跑一次 before_generate。
const registered = [];
global.hexo = {
  source_dir: SRC,
  theme: { config: { custom_css: '/css/site.css', custom_js: '' } },
  extend: { filter: { register: (name, fn) => registered.push({ name, fn }) } },
};

const { versionedUrl, fileHash } = require(path.join(ROOT, 'themes/fluid/scripts/filters/asset-version.js'));

let passed = 0;
function ok(label, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS', label);
  } catch (e) {
    console.error('  FAIL', label, '—', e.message);
    process.exitCode = 1;
  }
}

console.log('前台资源缓存破坏（site.css 内容 hash）');

const cssBuf = fs.readFileSync(path.join(SRC, 'css/site.css'));
const expectHash = crypto.createHash('sha1').update(cssBuf).digest('hex').slice(0, 8);

ok('脚本注册了 before_generate filter', () => {
  assert.ok(registered.some((r) => r.name === 'before_generate'), '未注册 before_generate');
});

ok('fileHash 等于 site.css 的 sha1 前 8 位', () => {
  assert.strictEqual(fileHash(SRC, '/css/site.css'), expectHash);
});

ok('站内路径附加 ?v=<hash8>', () => {
  assert.strictEqual(versionedUrl('/css/site.css', SRC), `/css/site.css?v=${expectHash}`);
});

ok('幂等：对已带版本号的 URL 重算结果相同（server 热更新依赖此性质）', () => {
  const once = versionedUrl('/css/site.css', SRC);
  assert.strictEqual(versionedUrl(once, SRC), once);
});

ok('文件不存在时原样返回，不制造坏链接', () => {
  assert.strictEqual(versionedUrl('/css/nope.css', SRC), '/css/nope.css');
});

ok('外链不处理（http/https/协议相对）', () => {
  assert.strictEqual(versionedUrl('https://cdn.example.com/a.css', SRC), 'https://cdn.example.com/a.css');
  assert.strictEqual(versionedUrl('//cdn.example.com/a.css', SRC), '//cdn.example.com/a.css');
});

ok('空值原样返回', () => {
  assert.strictEqual(versionedUrl('', SRC), '');
  assert.strictEqual(versionedUrl(null, SRC), '');
});

ok('拒绝越出 source 目录的相对路径', () => {
  assert.strictEqual(fileHash(SRC, '/../package.json'), null);
});

ok('内容变化 → hash 变化；内容不变 → hash 不变', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'assetv-'));
  try {
    const f = path.join(tmp, 'a.css');
    fs.writeFileSync(f, 'body{}');
    const h1 = fileHash(tmp, '/a.css');
    const h1b = fileHash(tmp, '/a.css');
    fs.writeFileSync(f, 'body{color:red}');
    const h2 = fileHash(tmp, '/a.css');
    assert.strictEqual(h1, h1b, '同内容两次 hash 不一致');
    assert.notStrictEqual(h1, h2, '内容变了 hash 没变，线上就不会刷新');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

ok('filter 生效：把 theme.config.custom_css 改成带版本号的 URL', () => {
  const fn = registered.find((r) => r.name === 'before_generate').fn;
  const cfg = global.hexo.theme.config;
  cfg.custom_css = '/css/site.css';
  cfg.custom_js = '';
  fn.call(global.hexo);
  assert.strictEqual(cfg.custom_css, `/css/site.css?v=${expectHash}`);
  assert.strictEqual(cfg.custom_js, '', '空 custom_js 不应被改写');
});

ok('filter 连跑两次结果稳定（不会叠加出 ?v=..?v=..）', () => {
  const fn = registered.find((r) => r.name === 'before_generate').fn;
  const cfg = global.hexo.theme.config;
  fn.call(global.hexo);
  const first = cfg.custom_css;
  fn.call(global.hexo);
  assert.strictEqual(cfg.custom_css, first);
  assert.strictEqual((first.match(/\?/g) || []).length, 1);
});

ok('配置文件里的 custom_css 保持干净（版本号只在生成期附加）', () => {
  const cfg = fs.readFileSync(path.join(ROOT, 'themes/fluid/_config.yml'), 'utf8');
  const m = cfg.match(/^custom_css:\s*(\S+)\s*$/m);
  assert.ok(m, '未找到 custom_css');
  assert.strictEqual(m[1], '/css/site.css', `custom_css 被写死了版本号：${m[1]}`);
});

// E-025 防复发：css()/js() helper 会给「不以 .css/.js 结尾」的 URL 追加后缀，
// 碰上带 ?v=<hash> 的地址会拼出 site.css?v=xxx.css（404）。模板必须手写 <link>/<script>。
ok('模板不用 css()/js() helper 处理带版本号的自定义资源', () => {
  const cssEjs = fs.readFileSync(path.join(ROOT, 'themes/fluid/layout/_partials/css.ejs'), 'utf8');
  const jsEjs = fs.readFileSync(path.join(ROOT, 'themes/fluid/layout/_partials/scripts.ejs'), 'utf8');
  assert.ok(!/css\(theme\.custom_css\)/.test(cssEjs), 'css.ejs 改回了 css(theme.custom_css)，会拼出 404 后缀');
  assert.ok(!/js\(theme\.custom_js\)/.test(jsEjs), 'scripts.ejs 改回了 js(theme.custom_js)，会拼出 404 后缀');
  assert.ok(/url_for\(theme\.custom_css\)/.test(cssEjs), 'css.ejs 未用 url_for 输出自定义样式');
});

// 产物形态断言：public/ 由 test:pages 在本测试之前重建，通常存在；不存在则跳过并说明。
{
  const indexFile = path.join(ROOT, 'public/index.html');
  if (!fs.existsSync(indexFile)) {
    console.log('  SKIP 产物形态断言（public/index.html 不存在，先跑 npm run test:pages 或 npm run build）');
  } else {
    const html = fs.readFileSync(indexFile, 'utf8');
    ok('产物中 site.css 链接带 8 位 hash 且无多余后缀', () => {
      assert.match(html, /href="\/css\/site\.css\?v=[0-9a-f]{8}"/, 'site.css 未带版本号');
      assert.ok(!/site\.css\?v=[0-9a-f]+\.css/.test(html), 'site.css 被拼上了 .css 后缀（404 形态）');
    });
  }
}

console.log(`\nRESULT: ${passed} 项断言通过${process.exitCode ? '，存在失败' : ''}`);
process.exit(process.exitCode || 0);
