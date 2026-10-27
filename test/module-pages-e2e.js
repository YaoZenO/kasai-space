/**
 * P1-9 前台模块页端到端验证 + IA-1 数据诚信防复发断言（D0-2）
 *
 * 目的：证明「后台富文本录入 → YAML 落盘 → Hexo 生成详情页/列表页」整条链路可用；
 *       并断言生产数据（source/_data/*.yml）不得含 example.com 外链与「【测试】」标题条目。
 *
 * 做法（关键：不手工拼 YAML，避免构造出非法文件）：
 *   1. 备份 source/_data/{projects,games}.yml
 *   2. 走后台真实写入链路：validate.validateItem() → yaml.updateItems() 落盘
 *   3. 进程内调用 Hexo API 生成（不 fork 子进程，Windows/沙箱下 spawn 会 EBUSY）
 *   4. 断言 public/ 下页面与渲染结果（含「空 section 不渲染」）
 *   5. finally 中无条件还原原始数据文件，并用真实数据全量重建 public/（E-019）
 *   6. 还原后做数据诚信扫描；扫描函数目录参数化，变异验证走临时目录坏样本
 *      （塞坏条目 → 断言 FAIL → 移除 → PASS），不碰真实数据文件
 *
 * 运行：node test/module-pages-e2e.js
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Hexo = require('hexo');

const yaml = require('../api/_lib/yaml.js');
const validate = require('../api/_lib/validate.js');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'source', '_data');
const PUBLIC = path.join(ROOT, 'public');

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
function backup(name) {
  BACKUP[name] = fs.readFileSync(path.join(DATA_DIR, name + '.yml'), 'utf8');
}
function restore(name) {
  if (BACKUP[name] != null) {
    fs.writeFileSync(path.join(DATA_DIR, name + '.yml'), BACKUP[name], 'utf8');
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

// 清理本次测试生成的页面（public/projects、public/games 完全由模块页生成器产出，
// 属本测试自有产物）。不清理的话，跑完测试直接起服务会看到 e2e-* 测试页。
function cleanGenerated() {
  for (const dir of ['projects', 'games']) {
    try {
      fs.rmSync(path.join(PUBLIC, dir), { recursive: true, force: true });
    } catch (e) {
      console.log('      （提示：' + dir + ' 测试页未能自动清理，运行 npm run build 即可覆盖）');
    }
  }
}

// E-019 防复发：删掉整个 public/ 并用还原后的真实数据重新生成。
// 少了这一步，跑完测试的 public/ 里会留着 /games/、/projects/e2e-rich/ 死链
// （测试数据的 hexo.generate 是全量生成过的，只还原 yml 不够）。
async function rebuildClean() {
  let removed = false;
  try {
    fs.rmSync(PUBLIC, { recursive: true, force: true });
    removed = true;
  } catch (e) {
    // Windows 下若有进程的工作目录在 public/（如本地静态服务），整目录删除会被锁住；
    // 某些环境还会对「单轮批量删除超过阈值」做拦截（E-066）——两者表现相同：删除失败。
    console.log('      （提示：public/ 未能整体删除——' + (e && e.message) + '；已启用强制全量兜底）');
  }
  //
  // 兜底（E-066）：public/ 删不掉时，Hexo 会拿 db.json 做增量判断。
  // 而本测试刚把 yml 还原成原始内容，源 hash 回到「未修改」状态，
  // Hexo 于是跳过生成——含测试条目的旧 index.html 原地不动，E-019 断言必定红。
  // 删掉 db.json 就断掉了这条增量捷径：无论 public/ 在不在，都会全量重生成并覆盖旧产物。
  // db.json 是构建数据库且已在 .gitignore 第 3 行，删除安全（下次构建会自行重建）。
  if (!removed || fs.existsSync(PUBLIC)) {
    try {
      fs.rmSync(path.join(ROOT, 'db.json'), { force: true });
    } catch (e2) {
      console.log('      （提示：db.json 未能删除，重建可能仍是增量——' + (e2 && e2.message) + '）');
    }
  }
  try {
    const fresh = new Hexo(ROOT, { silent: true });
    await fresh.init();
    await fresh.load();
    await fresh.call('generate');
  } catch (e) {
    console.log('      （提示：public/ 重建失败，请手动 npm run build — ' + (e && e.message) + '）');
  }
  // 补齐 main.css 的产物 hash。
  //
  // 契约说明（2026-10-18）：asset-version.js 的 main.css 版本号注册在 after_generate 与 exit，
  // 生产链路（`hexo generate`，含 Vercel）两条都会触发；但本测试用的
  // `hexo.call('generate')` 是**进程内**调用，实测不触发这两个 filter，
  // 于是测试跑完 public/ 里的 main.css 版本号是空的（test/asset-version.js 的产物断言会红）。
  // 这里显式补一次，把契约写在测试侧而不是藏在过滤器里。
  //
  // 失败必须显式抛出，不能只打提示：曾经这里吞掉了一个 ReferenceError
  // （filter 模块顶层直接用 hexo 全局，裸 require 时不存在），表现是「补写没生效」
  // 但测试仍然绿，真正的红是 test/asset-version.js 里的产物断言，报错点离病因很远。
  const { stampAll } = require('../themes/fluid/scripts/filters/asset-version.js');
  stampAll(PUBLIC);
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

    console.log('\n[2] hexo generate');
    const hexo = new Hexo(ROOT, { silent: true });
    await hexo.init();
    await hexo.load();
    await hexo.call('generate');

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
          const slug = it.slug || encodeURIComponent(String(it.title));
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
    ok('游戏列表页是封面网格（games-wall），不是均质卡片阵列', () => {
      // 主人 2026-10-19 定「封面网格」。修订后 R-3 允许非均质拼贴、禁止均质阵列，
      // 这条断言把形态锁住：游戏分支不得回退到 module-grid。
      assert.ok(gameList.includes('class="games-wall"'), '游戏列表页不是 games-wall 形态');
      assert.ok(!gameList.includes('class="module-grid"'), '游戏列表页仍渲染均质 module-grid');
      const tiles = (gameList.match(/class="games-tile[ "]/g) || []).length;
      assert.ok(tiles >= 5, `games-tile 数量异常：${tiles}（真实 5 条 + 测试 1 条应 ≥5）`);
    });
    ok('项目列表页仍是行式卡片网格（未被游戏改动牵连）', () => {
      const projListNow = readPage(path.join('projects', 'index.html'));
      assert.ok(projListNow.includes('class="module-grid"'), '项目列表页丢了 module-grid');
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
      const cells = (home.match(/class="wall-cell[ "]/g) || []).length;
      assert.ok(cells >= 3, `首页入口格数量异常：${cells}`);
    });
    ok('墨底区块与两栏容器平级（否则墨底通不了铺）', () => {
      // 2026-10-19 实测：ink-band 放进 .home-cols 里会变成两栏网格的第三个格子，
      // 只占第一列宽（@1440 只有 623px，右侧 697px 是纸面空白）。
      // 断言模板结构：feedRows 守卫之前，home-cols 必须已经闭合。
      const tpl = fs.readFileSync(path.join(ROOT, 'themes/fluid/layout/index.ejs'), 'utf8');
      const colsStart = tpl.indexOf('<div class="home-wrap home-cols');
      const bandGuard = tpl.indexOf('<% if (feedRows.length) { %>', colsStart);
      assert.ok(colsStart !== -1 && bandGuard !== -1, '模板结构变化：找不到 home-cols 或 feedRows 守卫');
      assert.ok(tpl.slice(colsStart, bandGuard).trimEnd().endsWith('</div>'),
        'home-cols 在 ink-band 之前没有闭合 —— 墨底会变成两栏网格的第三个格子，只占第一列宽');
    });
  } finally {
    restore('projects');
    restore('games');
    cleanGenerated();
    // E-019：本测试的 hexo.generate 是用测试数据全量生成过的，
    // 只还原 yml 不够——index.html、新增标签页等产物仍留着测试条目。
    await rebuildClean();
    console.log('\n[8] 还原原始数据文件 + 全量重建 public/');
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

  ok('public/ 无测试数据残留（E-019/E-021 防复发断言）', () => {
    // 只校验测试自身产物被清掉，与仓库真实内容解耦（E-021：不能假设某模块永远为空，
    // 主人有真实游戏/项目数据时 public/games、public/projects 合法存在）
    assert.ok(!fs.existsSync(path.join(PUBLIC, 'projects', 'e2e-rich')), 'public/projects/e2e-rich 仍存在');
    assert.ok(!fs.existsSync(path.join(PUBLIC, 'games', 'e2e-game')), 'public/games/e2e-game 仍存在');
    const home = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    assert.ok(!home.includes('e2e-rich'), '首页仍含测试条目 e2e-rich');
    assert.ok(!home.includes('e2e-game'), '首页仍含测试条目 e2e-game');
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

  console.log('\n' + pass + ' 项断言通过');
  console.log('提示：public/ 已用真实数据全量重建，工作区可直接预览或部署。');
}

main().catch((e) => {
  console.error('\nE2E 执行失败：', e && e.message ? e.message : e);
  process.exitCode = 1;
});
