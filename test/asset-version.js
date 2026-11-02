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

const { versionedUrl, fileHash, absHash, stampMainCss } = require(path.join(ROOT, 'themes/fluid/scripts/filters/asset-version.js'));

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
    ok('产物中 main.css 链接带 8 位 hash（改了 _config.yml 的颜色也要能被浏览器看到）', () => {
      assert.match(html, /href="\/css\/main\.css\?v=[0-9a-f]{8}"/,
        'main.css 未带版本号——改 _config.yml 颜色后浏览器会继续用旧副本，主人看不到改动');
    });
  }
}

// ---------------------------------------------------------------------------
// 2026-10-18 新增：main.css 的缓存破坏
//
// 问题（已实证）：main.css 由 styl 从 themes/fluid/_config.yml 的 color 段编译而来。
// 主人改那份配置 → site.css 内容不变 → 它的 hash 不变；main.css 内容变了，
// 但它在 css.ejs 里是裸拼 URL（href="/css/main.css"，无任何版本参数）→ 浏览器命中旧副本
// → **改了配置但主人看不到**。这条链路此前完全没有防复发机制。
//
// 这里锁：① 纯函数把 ?v=<产物 hash> 正确盖到 main.css 上；② 幂等（不叠加 ?v=..?v=..）；
// ③ 只影响 main.css，不碰 site.css 与外链；④ filter 注册在 after_generate（须等文件写盘）。
// ---------------------------------------------------------------------------
console.log('\nmain.css 缓存破坏（产物内容 hash）');

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maincss-'));
  try {
    fs.mkdirSync(path.join(tmp, 'css'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'css', 'main.css'), ':root{--line-color:#cfc6b2}');
    const h = absHash(path.join(tmp, 'css', 'main.css'));

    ok('absHash 等于 main.css 产物的 sha1 前 8 位', () => {
      assert.match(h, /^[0-9a-f]{8}$/, 'absHash 不是 8 位 hex');
      assert.strictEqual(h, crypto.createHash('sha1').update(fs.readFileSync(path.join(tmp, 'css', 'main.css'))).digest('hex').slice(0, 8));
    });

    ok('给裸拼的 main.css 链接盖上 ?v=<hash8>', () => {
      const out = stampMainCss('<link rel="stylesheet" href="/css/main.css">', tmp);
      assert.ok(out.includes(`href="/css/main.css?v=${h}"`), `未盖上版本号：${out}`);
    });

    ok('幂等：已带 v= 的链接重盖后不叠加版本参数', () => {
      const out = stampMainCss(`<link rel="stylesheet" href="/css/main.css?v=${h}">`, tmp);
      assert.strictEqual((out.match(/\?/g) || []).length, 1, `叠加出多个查询串：${out}`);
      assert.ok(out.includes(`?v=${h}`), '幂等重算后 hash 变了');
    });

    ok('只盖 main.css：site.css 的版本号不受影响', () => {
      const out = stampMainCss('<link href="/css/site.css?v=aaaaaaaa"><link href="/css/main.css">', tmp);
      assert.ok(out.includes('/css/site.css?v=aaaaaaaa'), 'site.css 的版本号被误改');
      assert.ok(out.includes(`/css/main.css?v=${h}`), 'main.css 未被盖上版本号');
    });

    ok('不碰外链与其它 css', () => {
      const html = '<link href="https://cdn.example.com/main.css"><link href="/css/other.css">';
      assert.strictEqual(stampMainCss(html, tmp), html, '误改了非 main.css 资源');
    });

    ok('main.css 产物缺失时原样返回，不制造坏链接', () => {
      const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'maincss-none-'));
      try {
        const html = '<link href="/css/main.css">';
        assert.strictEqual(stampMainCss(html, empty), html);
      } finally {
        fs.rmSync(empty, { recursive: true, force: true });
      }
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

ok('main.css 的 filter 注册在 after_generate 与 exit', () => {
  // 2026-10-18 实测否决了 after_render:html：逐页渲染发生在 CSS 编译之前，
  // 冷启动（Vercel 的干净 checkout 正是这条路径）下触发时 public/css/main.css 还不存在，
  // hash 恒为 null → 生产必然失效。详见 filter 文件内的注释。
  assert.ok(registered.some((r) => r.name === 'after_generate'),
    '未注册 after_generate —— 正常 hexo generate（含 Vercel）不会给 main.css 盖 hash');
  assert.ok(registered.some((r) => r.name === 'exit'),
    '未注册 exit 兜底');
});

ok('测试侧补写契约存在（E2E 的进程内调用不触发上述 filter）', () => {
  // test/module-pages-e2e.js 的 rebuildClean() 用 hexo.call('generate') 进程内重建 public/，
  // 实测不触发 after_generate / exit，因此那里必须显式调用 stampAll 补齐。
  // 缺了这一句，测试跑完 public/ 里 main.css 的版本号会被清空 → 下面的产物断言红。
  const e2e = fs.readFileSync(path.join(ROOT, 'test/module-pages-e2e.js'), 'utf8');
  assert.ok(/stampAll\(PUBLIC\)/.test(e2e),
    'rebuildClean() 里没有显式调用 stampAll —— E2E 跑完产物会丢 main.css 版本号');
});

// ---------------------------------------------------------------------------
// 2026-10-19 补：真·冷启动全量构建（Vercel 生产路径）的产物断言
//
// 上一轮的「41/42 覆盖」是**假阳性**——那次跑的是增量构建，main.css 早就在盘上，
// 于是 after_generate 有得盖。真实生产（Vercel 每次干净 checkout）是全量构建：
// 实测 after_generate 与 generateAfter 触发时 public/css/main.css exists = false，
// 而 Hexo 的 exit filter 在 CLI 下根本不触发 → 全站拿不到版本号，
// main.css 的缓存破坏在生产上等于没做（正是 E-035 要治的那个病）。
//
// 判据只看结果、不看实现：删光 public/ 后跑一次真实 CLI 构建，产物必须带 hash。
// ---------------------------------------------------------------------------
console.log('\n冷启动全量构建（模拟 Vercel 干净 checkout）');

{
  const PUBLIC = path.join(ROOT, 'public');
  const { execSync } = require('node:child_process');
  let out = '';
  try {
    fs.rmSync(PUBLIC, { recursive: true, force: true });
    // E-091（2026-11-01）：只删 public/ 不删 db.json，陈旧增量缓存会让 Hexo
    // 跳过重建、冷启动断言假红。与 E-087 同一修法：重建前无条件删 db.json。
    fs.rmSync(path.join(ROOT, 'db.json'), { force: true });
    out = execSync('npx hexo generate', { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    out = String((e && e.stdout) || '') + String((e && e.stderr) || '');
  }

  ok('冷启动构建成功产出 public/index.html', () => {
    assert.ok(fs.existsSync(path.join(PUBLIC, 'index.html')), `构建没有产出 index.html：${out.slice(-300)}`);
  });

  if (fs.existsSync(path.join(PUBLIC, 'index.html'))) {
    const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    const realHash = absHash(path.join(PUBLIC, 'css', 'main.css'));

    ok('全量构建也盖上版本号（此前只有增量构建能盖）', () => {
      assert.ok(realHash, '构建后 public/css/main.css 不存在');
      assert.ok(html.includes(`/css/main.css?v=${realHash}`),
        `index.html 的 main.css 没带正确版本号（应为 ?v=${realHash}）——全量构建路径失效`);
    });

    ok('全站覆盖：除 admin/ 外每个 HTML 都带版本号', () => {
      // E-092（2026-11-02）：早先实现是「先 walk 收集全部路径，再逐个 readFileSync」。
      // 遍历与读取之间若有进程在重建 public/（并行构建、编辑器索引、另一个会话跑测试），
      // 会出现「目录在、文件没了」的 ENOENT 假红——实测 947 个文件里只缺 1 个，
      // 紧接着单独构建该页却能正常产出。现在把遍历与读取合到同一轮，
      // 遇到文件瞬时消失则整轮重来一次；两轮都读不到才算真缺失，不掩盖真实失败。
      const collect = () => {
        const out = [];
        (function walk(dir) {
          for (const name of fs.readdirSync(dir)) {
            const abs = path.join(dir, name);
            if (fs.statSync(abs).isDirectory()) walk(abs);
            else if (/\.html$/i.test(name)) out.push(path.relative(PUBLIC, abs).replace(/\\/g, '/'));
          }
        })(PUBLIC);
        return out.filter((n) => !n.startsWith('admin/'));
      };

      let missing = [];
      let vanished = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        missing = [];
        vanished = null;
        for (const rel of collect()) {
          try {
            if (!fs.readFileSync(path.join(PUBLIC, rel), 'utf8').includes('main.css?v=')) missing.push(rel);
          } catch (e) {
            vanished = rel; // 遍历后文件被移除：整轮重来
            break;
          }
        }
        if (!vanished) break;
      }

      assert.strictEqual(vanished, null,
        `页面在断言期间消失（两轮都读不到）：${vanished} —— 构建期间是否有其它进程在重建 public/？`);
      assert.strictEqual(missing.length, 0,
        `${missing.length} 个页面缺少 main.css 版本号：${missing.slice(0, 5).join(', ')}`);
    });
  }
}

console.log(`\nRESULT: ${passed} 项断言通过${process.exitCode ? '，存在失败' : ''}`);
process.exit(process.exitCode || 0);
