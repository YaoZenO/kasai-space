/**
 * P1-9 前台模块页端到端验证 + IA-1 数据诚信防复发断言（D0-2）
 *
 * 目的：证明「后台富文本录入 → YAML 落盘 → 前台生成详情页/列表页」整条链路可用；
 *       并断言生产数据（source/_data/*.yml）不得含 example.com 外链与「【测试】」标题条目。
 *
 * 做法（关键：不手工拼 YAML，避免构造出非法文件）：
 *   1. 备份 source/_data/{projects,games}.yml
 *   2. 走后台真实写入链路：validate.validateItem() → yaml.updateItems() 落盘
 *   3. 用 Astro 构建到独立产物目录（ASTRO_OUT_DIR=.astro/e2e-out），不碰 dist/
 *   4. 断言该目录下页面与渲染结果（含「空 section 不渲染」）
 *   5. finally 中无条件还原原始数据文件，并删除测试产物（E-019）
 *   6. 还原后做数据诚信扫描；扫描函数目录参数化，变异验证走临时目录坏样本
 *      （塞坏条目 → 断言 FAIL → 移除 → PASS），不碰真实数据文件
 *
 * 2026-11-09：Hexo 清理（T13）把对照基线从 `hexo generate` / public/ 换成 Astro 产物。
 *
 * 运行：node test/module-pages-e2e.js
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const yaml = require('../api/_lib/yaml.js');
const validate = require('../api/_lib/validate.js');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'source', '_data');
// 独立产物目录：与 dist/ 隔离，测试结束即删，不留 e2e-* 死链
const PUBLIC = path.join(ROOT, '.astro', 'e2e-out');

let pass = 0;
function ok(label, fn) {
  try {
    fn();
    pass += 1;
    console.log('  \u2713 ' + label);
  } catch (e) {
    console.log('  \u2717 ' + label);
    console.log('      ' + e.message);
    process.exitCode = 1;
  }
}

// ---------- 测试数据：完全按后台新增条目时的字段结构 ----------

// 摘要类元素（首页大卡 / 最新文字 / 归档精选）内部出现 `&amp;#...;` 或字面 `&#...;`
// 即说明 helper 没把实体解码干净（E-085）。返回样本便于定位。
function excerptLeaks(html) {
  const re = /<(?:p|span)[^>]*class="(?:wall-feature-desc|post-desc|pick-desc)"[^>]*>([\s\S]*?)<\/(?:p|span)>/g;
  const leaks = [];
  let m;
  while ((m = re.exec(html))) {
    if (/&(?:amp;)?&#/.test(m[1])) leaks.push(m[1].trim().slice(0, 60));
  }
  return leaks;
}

const RICH_PROJECT = {
  slug: 'e2e-rich',
  title: 'E2E 富文本项目',
  date: '2026-10-12',
  summary: '验证 markdown 分节渲染',
  cover: '',
  link: 'https://github.com/YaoZenO/e2e',
  tags: ['Hexo', '测试'],
  background:
    '## 背景标题\n\n第一段：为什么做。包含 **加粗** 与 `代码`。\n\n- 列表项一\n- 列表项二\n',
  process: '过程内容。',
  tech: '', // 故意留空 → 详情页不应出现「技术方案」小节
  outcome: '成果内容。',
};

const RICH_GAME = {
  slug: 'e2e-game',
  title: 'E2E 游戏条目',
  date: '2026-10-12',
  cover: '',
  genre: '策略',
  platform: 'PC',
  status: '在玩',
  summary: '验证游戏专属字段',
  gameplay: '**玩法**要点。',
  media: ['/img/games/a.jpg', '/img/games/b.jpg'],
  video: 'https://www.bilibili.com/video/BV1xx',
  links: [
    { label: '下载', url: 'https://example.com/dl' },
    { label: '试玩', url: 'https://example.com/play' },
  ],
};

// 块标量写入时规约尾部换行（见 yaml.js serializeEntry），往返按规约后比较
const norm = (s) => String(s).replace(/\n+$/, '');

// ---------- 备份 / 还原 ----------

const BACKUP = {};

// E-139 防复发：两个实例并发跑时，A 的 restore 与 B 的 updateItems 交叉写，
// 「数据文件已完整还原」是与本进程 BACKUP 比对的自证式断言，拦不住另一个实例的写入，
// 结果真实数据文件被留下 E2E 条目（2026-11-11 实测 games.yml / projects.yml 各多出 16 行）。
// 用进程锁把「同一时刻只有一个实例改真实数据文件」变成机制；被杀进程留下的锁按 PID 判活回收。
const LOCK_FILE = path.join(os.tmpdir(), 'kasai-module-pages-e2e.lock');

function acquireLock() {
  const mine = process.pid + ' ' + new Date().toISOString();
  try {
    fs.writeFileSync(LOCK_FILE, mine, { flag: 'wx' });
    return;
  } catch {
    let holder = '';
    try {
      holder = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    } catch {
      /* 锁刚好被释放，按下行重新抢占 */
    }
    const pid = Number(holder.split(/\s+/)[0]);
    let alive = false;
    if (pid) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (alive) {
      console.error(
        '\n✗ 另一个 test/module-pages-e2e.js 正在运行（PID ' + pid + '）。\n' +
          '  两个实例会交叉改写 source/_data/{projects,games}.yml，备份/还原断言会失效（E-139）。\n' +
          '  等它结束再跑，或先停掉那个进程。\n'
      );
      process.exit(1);
    }
    fs.writeFileSync(LOCK_FILE, mine);
  }
}

function releaseLock() {
  try {
    const holder = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    if (Number(holder.split(/\s+/)[0]) === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch {
    /* 锁已被回收或本进程从未拿到 */
  }
}

// E-083 防复发：上一轮跑一半被中断（构建卡住 / 进程被杀）时，E2E 条目会留在数据文件里。
// 下一轮直接 backup()，就会把「已污染的内容」当成原始基线，
// 于是 restore() 原样写回污染内容，而「数据文件已完整还原」是与 BACKUP 比对的
// 自证式断言——照样通过，污染就这么静默升级成基线。
// 所以备份前先查一遍：文件里还带 E2E 标记就中止，逼着先把残留删干净再跑。
const E2E_MARK = /(slug:\s*e2e-|example\.com)/i;

function backup(name) {
  const p = path.join(DATA_DIR, name + '.yml');
  const text = fs.readFileSync(p, 'utf8');
  if (E2E_MARK.test(text)) {
    console.error(
      '\n✗ ' + name + '.yml 里残留上一轮的 E2E 测试数据（slug: e2e-* 或 example.com）。\n' +
        '  先把这几行删掉再跑测试——否则本轮会把污染内容当成原始基线备份，\n' +
        '  还原断言将形同虚设（E-083）。\n'
    );
    process.exit(1);
  }
  BACKUP[name] = text;
}
function restore(name) {
  if (BACKUP[name] != null) {
    const p = path.join(DATA_DIR, name + '.yml');
    fs.writeFileSync(p, BACKUP[name], 'utf8');
    // E-070 防复发（自校验兜底）：restore 曾经「写了但盘上没生效」（2026-10-30，
    // 本地静态服务器占用 public/ 的会话里跑 E2E，残留留到了测试结束后），
    // 而还原是否成功原本只由几十行之后的远端断言判断，报错点离病因很远。
    // 现在写回后立即重读比对，不一致就地抛错——restore 失效绝不能静默。
    const back = fs.readFileSync(p, 'utf8');
    if (back !== BACKUP[name]) {
      throw new Error(
        'restore(' + name + ') 写回后重读不一致——文件被并发进程改写或写入被拦截。\n' +
          '  跑 E2E 前必须停掉占用 public/ 或 source/_data 的本地服务（E-066 同类条件）。'
      );
    }
  }
}

// 走后台真实写入链路：校验 → 序列化 → 落盘（保留头部注释）
function writeModule(name, extraItem) {
  const p = path.join(DATA_DIR, name + '.yml');
  const text = fs.readFileSync(p, 'utf8');
  const items = yaml.parseItems(text);
  const checked = validate.validateItem(name, extraItem);
  fs.writeFileSync(p, yaml.updateItems(text, items.concat([checked])), 'utf8');
}

// 用 Astro 构建到独立产物目录。测试只关心 module 页，产物隔离在 .astro/e2e-out，
// 全程不碰 dist/，因此跑完不需要「用真实数据再重建一次」（E-019 的动机随 public/ 一起消失）。
function buildSite() {
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build'], {
    cwd: ROOT,
    env: { ...process.env, ASTRO_OUT_DIR: PUBLIC },
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

// 清理本次测试的产物目录（e2e-* 测试条目只存在于这里）
function cleanGenerated() {
  try {
    fs.rmSync(PUBLIC, { recursive: true, force: true });
  } catch (e) {
    console.log('      （提示：测试产物目录未能删除——' + (e && e.message) + '；可直接删 .astro/e2e-out）');
  }
}

function readPage(rel) {
  const p = path.join(PUBLIC, rel);
  assert.ok(fs.existsSync(p), '页面不存在: ' + rel);
  return fs.readFileSync(p, 'utf8');
}

// ---------- 数据诚信扫描（IA-1 防复发，D0-2） ----------
// 目录参数化：默认扫真实 source/_data；变异验证传临时目录。
// 规则（规范 §8.7）：_data/*.yml 不得含 example.com 外链；不得含标题带「【测试】」的条目。
// 返回问题描述数组，空数组 = 通过。
function scanDataIntegrity(dir) {
  const problems = [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml'));
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    let items = null;
    try {
      items = yaml.parseItems(text);
    } catch (e) {
      items = null; // 无 items: 段或结构不支持（如 site.yml）→ 退化为原文扫描
    }
    if (items === null) {
      if (/example\.com/i.test(text)) {
        problems.push(f + ': 含 example.com 外链（无 items 段文件按原文扫描）');
      }
      continue;
    }
    for (const it of items) {
      const title = String(it.title || '');
      if (title.includes('【测试】')) {
        problems.push(f + ': 标题含「【测试】」的条目「' + title + '」');
      }
      // 递归遍历条目全部字符串值（含块标量长文与 links 对象数组），查 example.com 外链
      const stack = [it];
      while (stack.length) {
        const v = stack.pop();
        if (typeof v === 'string') {
          if (/example\.com/i.test(v)) {
            problems.push(f + ': 条目「' + title + '」含 example.com 外链「' + v.slice(0, 60) + '」');
          }
        } else if (Array.isArray(v)) {
          for (const x of v) stack.push(x);
        } else if (v && typeof v === 'object') {
          for (const k of Object.keys(v)) stack.push(v[k]);
        }
      }
    }
  }
  return problems;
}

// ---------- 主流程 ----------

async function main() {
  console.log('P1-9 前台模块页 E2E');

  acquireLock();
  backup('projects');
  backup('games');

  try {
    console.log('\n[1] 后台写入链路（validate → yaml → 落盘）');

    writeModule('projects', RICH_PROJECT);
    writeModule('games', RICH_GAME);

    // 落盘后必须能被自己的解析器读回，且与输入一致 —— 证明「后台存的 = 前台读的」
    const backP = yaml.parseItems(fs.readFileSync(path.join(DATA_DIR, 'projects.yml'), 'utf8'));
    const savedP = backP.find((i) => i.slug === 'e2e-rich');
    ok('项目条目往返一致（含 4 段长文与标签数组）', () => {
      assert.ok(savedP, '未找到 e2e-rich');
      assert.strictEqual(savedP.title, RICH_PROJECT.title);
      assert.strictEqual(savedP.background, norm(RICH_PROJECT.background));
      assert.strictEqual(savedP.process, norm(RICH_PROJECT.process));
      assert.strictEqual(savedP.tech, norm(RICH_PROJECT.tech));
      assert.strictEqual(savedP.outcome, norm(RICH_PROJECT.outcome));
      assert.deepStrictEqual(savedP.tags, RICH_PROJECT.tags);
    });

    ok('长文字段往返幂等（重复保存不产生 diff 抖动）', () => {
      const txt1 = fs.readFileSync(path.join(DATA_DIR, 'projects.yml'), 'utf8');
      const txt2 = yaml.updateItems(txt1, yaml.parseItems(txt1));
      assert.strictEqual(txt2, txt1, '二次保存后文件内容发生变化');
    });

    const backG = yaml.parseItems(fs.readFileSync(path.join(DATA_DIR, 'games.yml'), 'utf8'));
    const savedG = backG.find((i) => i.slug === 'e2e-game');
    ok('游戏条目往返一致（含 media 数组与 links 对象数组）', () => {
      assert.ok(savedG, '未找到 e2e-game');
      assert.strictEqual(savedG.genre, RICH_GAME.genre);
      assert.strictEqual(savedG.platform, RICH_GAME.platform);
      assert.strictEqual(savedG.status, RICH_GAME.status);
      assert.strictEqual(savedG.gameplay, norm(RICH_GAME.gameplay));
      assert.deepStrictEqual(savedG.media, RICH_GAME.media);
      assert.deepStrictEqual(savedG.links, RICH_GAME.links);
    });

    console.log('\n[2] astro build（产物隔离到 .astro/e2e-out）');
    buildSite();

    console.log('\n[3] 项目详情页');
    const projHtml = readPage(path.join('projects', 'e2e-rich', 'index.html'));
    ok('Markdown 标题被渲染为 h2', () => assert.ok(projHtml.includes('<h2'), '未找到 <h2>'));
    ok('Markdown 加粗被渲染为 strong', () => assert.ok(projHtml.includes('<strong>加粗</strong>')));
    ok('Markdown 行内代码被渲染为 code', () => assert.ok(projHtml.includes('<code>代码</code>')));
    ok('Markdown 列表被渲染为 li', () => assert.ok(projHtml.includes('<li>列表项一</li>')));
    ok('壳标题不会与正文首个 h2 相邻打堆', () => {
      // 2026-10-19：正文长文自带 h2 时不再渲染壳标题（模板按渲染后 HTML 行首判断）。
      // 两个 h2 直接相邻就是这个缺陷的特征——壳标题与正文第一个 ## 之间零内容、
      // 只隔 22px，读起来像两个标题打堆（Ties 四处 + lol 一处）。
      // 正文不以 h2 开头时壳标题仍渲染（它的职责是给没有小标题的长文一个概要）。
      for (const rel of [path.join('games', 'lol', 'index.html'), path.join('games', 'e2e-game', 'index.html'), path.join('projects', 'Ties', 'index.html'), path.join('projects', 'e2e-rich', 'index.html')]) {
        const html = readPage(rel);
        assert.ok(!/<h2[^>]*>[^<]*<\/h2>\s*<h2/.test(html),
          `${rel} 存在两个相邻 h2 —— 壳标题与正文小标题打堆`);
      }
    });
    ok('process / outcome 段内容存在', () => {
      assert.ok(projHtml.includes('过程内容'), '缺少 process');
      assert.ok(projHtml.includes('成果内容'), '缺少 outcome');
    });
    ok('空字段 tech 不渲染对应小节（真实数据铁律）', () => {
      assert.ok(!projHtml.includes('技术方案'), 'tech 为空却渲染了「技术方案」小节');
    });
    ok('原有条目 Ties 详情页仍生成', () =>
      assert.ok(fs.existsSync(path.join(PUBLIC, 'projects', 'Ties', 'index.html'))));

    // E-038 防复发：生成器脚本一旦语法错误，Hexo 只打印一行「Script load failed」
    // 就继续跑完整个构建，退出码仍是 0——详情页全部消失却不报错。
    // 这里按「数据条目 → 详情页」逐条核对（而不是只盯 Ties 一条），
    // 判据只看结果：每个条目都要有一个非空 HTML。
    ok('每个数据条目都有对应的详情页且非 0 字节（E-038 防复发）', () => {
      const mods = [
        { key: 'projects', file: 'projects.yml' },
        { key: 'games', file: 'games.yml' },
      ];
      for (const m of mods) {
        const text = fs.readFileSync(path.join(DATA_DIR, m.file), 'utf8');
        const items = yaml.parseItems(text).filter((it) => it && it.title);
        assert.ok(items.length > 0, m.file + ' 解析出 0 条条目，本断言失去意义');
        for (const it of items) {
          // Astro 的 getStaticPaths 拿原始值，产物目录是标题原文；
          // 生产构建后由 tools/encode-module-paths.mjs 改名为百分号编码（本测试不跑那一步）。
          const slug = it.slug || String(it.title);
          const rel = path.join(m.key, slug, 'index.html');
          const p = path.join(PUBLIC, rel);
          assert.ok(fs.existsSync(p), '缺少详情页: ' + rel);
          assert.ok(fs.statSync(p).size > 0, '详情页是 0 字节: ' + rel);
        }
      }
    });

    console.log('\n[4] 项目列表页');
    const projList = readPage(path.join('projects', 'index.html'));
    ok('列表页含两条条目', () => {
      assert.ok(projList.includes('e2e-rich'), '缺少 e2e-rich');
      assert.ok(projList.includes('Ties'), '缺少 Ties');
    });
    ok('列表页链接指向详情页', () =>
      assert.ok(projList.includes('href="/projects/e2e-rich/"'), '列表链接未指向详情页'));

    console.log('\n[5] 游戏详情页');
    const gameHtml = readPage(path.join('games', 'e2e-game', 'index.html'));
    ok('专属字段（分类/平台/状态）渲染', () => {
      assert.ok(gameHtml.includes('策略'), '缺少 genre');
      assert.ok(gameHtml.includes('PC'), '缺少 platform');
      assert.ok(gameHtml.includes('在玩'), '缺少 status');
    });
    ok('玩法介绍 Markdown 渲染', () => assert.ok(gameHtml.includes('<strong>玩法</strong>')));
    ok('截图区渲染 media 数组', () => {
      assert.ok(gameHtml.includes('/img/games/a.jpg'), '缺少截图 a');
      assert.ok(gameHtml.includes('/img/games/b.jpg'), '缺少截图 b');
    });
    ok('下载 / 试玩链接渲染', () => {
      assert.ok(gameHtml.includes('https://example.com/dl'), '缺少下载链接');
      assert.ok(gameHtml.includes('https://example.com/play'), '缺少试玩链接');
      assert.ok(gameHtml.includes('下载'), '缺少链接文案');
    });

    console.log('\n[6] 游戏列表页');
    const gameList = readPage(path.join('games', 'index.html'));
    ok('列表页含游戏条目', () => assert.ok(gameList.includes('e2e-game')));
    ok('游戏列表页是封面网格（gm-wall），不是均质卡片阵列', () => {
      // 主人 2026-10-19 定「封面网格」。修订后 R-3 允许非均质拼贴、禁止均质阵列，
      // 这条断言把形态锁住：游戏分支不得回退到 module-grid。
      // 2026-11-14（S2）：类名统一为 gm- 前缀，保留封面拼贴形态。
      assert.ok(gameList.includes('class="gm-wall"'), '游戏列表页不是 gm-wall 形态');
      assert.ok(!gameList.includes('class="module-grid"'), '游戏列表页仍渲染均质 module-grid');
      const tiles = (gameList.match(/class="gm-tile[ "]/g) || []).length;
      assert.ok(tiles >= 5, `gm-tile 数量异常：${tiles}（真实 5 条 + 测试 1 条应 ≥5）`);
    });
    ok('项目列表页仍是行式档案卡（未被游戏改动牵连）', () => {
      const projListNow = readPage(path.join('projects', 'index.html'));
      assert.ok(projListNow.includes('class="pj-list"'), '项目列表页丢了 pj-list');
      assert.ok(projListNow.includes('href="/projects/e2e-rich/"'), '项目卡片未指向详情页');
    });

    console.log('\n[7] 首页联动');
    const home = readPage('index.html');
    ok('首页模块入口链接可用（无 HTML 实体转义）', () => {
      assert.ok(home.includes('href="/projects/"'), '首页缺少 /projects/ 链接');
      assert.ok(!home.includes('&#34;/projects/'), '链接被转义成实体，浏览器点不动');
    });
    ok('标签不占首页入口格，但 /tags/ 页面仍可访问（方案 A）', () => {
      // 2026-10-19 主人拍板：标签降级为详情页检索。撤首页入口格、不删页面（R-8 保护数据，
      // permalink 不动）。这两条必须同时成立——只撤格会丢 URL，只留格等于没降级。
      assert.ok(!home.includes('href="/tags/"'), '首页仍有 /tags/ 入口格链接 —— 标签应降级为详情页检索');
      assert.ok(fs.existsSync(path.join(PUBLIC, 'tags', 'index.html')),
        '/tags/ 页面不存在 —— 方案 A 要求保留标签页与所有标签 URL');
      // 2026-11-14 首页改为「图带 + 近期动态 + 去处」，入口不再用 Bento 的 .wall-cell；
      // 2026-11-15 首页改为「图纸 + 刻度 + 档案」，入口仍在「去处」里。
      // 但「每个模块都有入口」这条不变量不变，改为直接认「去处」里的四条链接。
      for (const href of ['/projects/', '/games/', '/collections/', '/library/']) {
        assert.ok(home.includes(`href="${href}"`), `首页缺少 ${href} 入口 —— 「去处」应保留模块入口`);
      }
      assert.ok(home.includes('class="mz-doors"'), '首页缺少「去处」导航');
    });
    ok('首页「档案」结构自洽：档案在「去处」之前，且每条标题都有可点落点', () => {
      // 原断言锁的是「墨底区块不能被两栏网格当第三个格子吞掉」的版面层级问题；
      // 2026-11-14 首页改版后换成「时间线在去处之前」，2026-11-15 改版后是
      // 「档案列表 .mz-list 在去处 .mz-doors 之前」，同样的失效场景仍然成立：
      // 档案被挪到别处 / 生成死链。
      const tlStart = home.indexOf('class="mz-list"');
      const linksStart = home.indexOf('class="mz-doors"');
      assert.ok(tlStart !== -1 && linksStart > tlStart,
        '产物结构变化：找不到 mz-list，或「去处」不在档案之后');
      const list = home.slice(tlStart, linksStart);
      const rows = (list.match(/class="mz-rec"/g) || []).length;
      assert.ok(rows >= 1, '「档案」没有渲染任何行');
      const hrefs = [...list.matchAll(/class="mz-rec-link" href="([^"]*)"/g)].map((m) => m[1]);
      assert.ok(hrefs.length >= 1, '「档案」没有可点条目');
      for (const href of hrefs) {
        assert.ok(href && href !== '#', '「档案」出现空链接');
        // collections 没有 [slug] 详情路由，只能落列表页
        assert.ok(!/^\/collections\/[^/]+\/$/.test(href),
          `collections 详情页不存在，首页出现死链：${href}`);
      }
    });
  } finally {
    restore('projects');
    restore('games');
    cleanGenerated();
    releaseLock();
    console.log('\n[8] 还原原始数据文件 + 删除测试产物目录');
  }

  ok('数据文件已完整还原', () => {
    assert.strictEqual(
      fs.readFileSync(path.join(DATA_DIR, 'projects.yml'), 'utf8'),
      BACKUP.projects,
      'projects.yml 未还原'
    );
    assert.strictEqual(
      fs.readFileSync(path.join(DATA_DIR, 'games.yml'), 'utf8'),
      BACKUP.games,
      'games.yml 未还原'
    );
  });

  ok('测试产物目录已删除（E-019/E-021 防复发断言）', () => {
    // 产物隔离在 .astro/e2e-out，跑完整体删除，因此不可能留 e2e-* 页面；
    // 与仓库真实内容解耦（E-021：不能假设某模块永远为空）。
    assert.ok(!fs.existsSync(PUBLIC), '.astro/e2e-out 未被删除，测试页会残留');
  });

  // ---------- [9] 数据诚信：变异验证 + 生产数据扫描（D0-2 / IA-1 防复发） ----------
  // 变异验证用临时目录造坏样本，不碰真实数据文件（真实数据的扫描在上面还原之后做）。
  console.log('\n[9] 数据诚信断言（example.com 外链 / 【测试】标题）');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-integrity-'));
  try {
    const sample = path.join(tmpDir, 'projects.yml');
    const cleanText = ['# 变异验证样本（非生产数据）', 'items:', '  - title: 真实条目', '    link: "https://github.com/YaoZenO"', ''].join('\n');
    fs.writeFileSync(sample, cleanText, 'utf8');

    ok('干净样本通过数据诚信扫描', () => {
      assert.deepStrictEqual(scanDataIntegrity(tmpDir), [], '干净样本不应报问题');
    });

    fs.writeFileSync(
      sample,
      cleanText + '  - title: 【测试】变异样本\n    link: "https://example.com"\n',
      'utf8'
    );
    ok('含【测试】标题 + example.com 外链的坏样本被断言抓获', () => {
      const problems = scanDataIntegrity(tmpDir);
      assert.ok(problems.length >= 2, '应同时报出标题与外链两类问题，实际: ' + JSON.stringify(problems));
      assert.ok(problems.some((p) => p.includes('【测试】')), '未报出【测试】标题: ' + JSON.stringify(problems));
      assert.ok(problems.some((p) => p.includes('example.com')), '未报出 example.com 外链: ' + JSON.stringify(problems));
    });

    fs.writeFileSync(sample, cleanText, 'utf8');
    ok('移除坏条目后扫描恢复通过', () => {
      assert.deepStrictEqual(scanDataIntegrity(tmpDir), [], '移除坏样本后应恢复通过');
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // 生产数据扫描放在 finally 还原之后：本测试自身的 RICH_GAME 含 example.com 链接，
  // 还原前扫描会误报（E-031 同类教训：断言必须与测试自身造的数据解耦）。
  ok('生产数据无 example.com 外链与【测试】标题条目（IA-1）', () => {
    const problems = scanDataIntegrity(DATA_DIR);
    assert.deepStrictEqual(problems, [], problems.join('; '));
  });

  // ---------- [10] 摘要 HTML 实体泄漏（E-085 防复发） ----------
  // 摘要走 excerpt 逻辑：stripHTML 只去标签、不解码实体，模板再把 & 转义一次，
  // 页面就会出现字面的 `&#x2F;`。这里只看「摘要类元素」内部，不扫全文——
  // 代码块里的实体写法是合法内容。
  // 基线读真实产物（dist/，由 npm test 前置的 astro:build 产出）。
  console.log('\n[10] 摘要 HTML 实体泄漏断言');
  ok('首页 / 归档页摘要不出现未解码的 HTML 实体', () => {
    const out = path.join(ROOT, process.env.SITE_OUT || 'dist');
    for (const rel of ['index.html', 'archives/index.html']) {
      const file = path.join(out, rel);
      assert.ok(fs.existsSync(file), rel + ' 不存在（先跑 npm run astro:build）');
      const leaks = excerptLeaks(fs.readFileSync(file, 'utf8'));
      assert.deepStrictEqual(leaks, [], rel + ' 摘要里有未解码实体：' + JSON.stringify(leaks));
    }
  });

  console.log('\n' + pass + ' 项断言通过');
  console.log('提示：测试产物已清理，dist/ 未被本测试改动。');
}

main()
  // E-088：构建进程会挂在事件循环上，不显式退出的话脚本打完汇总就退不下去——
  // 进程一直活着并持有仓库文件，后续测试会看到「上一轮」留下的测试数据。
  .then(() => process.exit(process.exitCode || 0))
  .catch((e) => {
    releaseLock();
    console.error('\nE2E 执行失败：', e && e.message ? e.message : e);
    process.exit(1);
  });
