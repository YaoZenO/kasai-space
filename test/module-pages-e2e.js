/**
 * P1-9 前台模块页端到端验证
 *
 * 目的：证明「后台富文本录入 → YAML 落盘 → Hexo 生成详情页/列表页」整条链路可用。
 *
 * 做法（关键：不手工拼 YAML，避免构造出非法文件）：
 *   1. 备份 source/_data/{projects,games}.yml
 *   2. 走后台真实写入链路：validate.validateItem() → yaml.updateItems() 落盘
 *   3. 进程内调用 Hexo API 生成（不 fork 子进程，Windows/沙箱下 spawn 会 EBUSY）
 *   4. 断言 public/ 下页面与渲染结果（含「空 section 不渲染」）
 *   5. finally 中无条件还原原始数据文件
 *
 * 运行：node test/module-pages-e2e.js
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
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

function readPage(rel) {
  const p = path.join(PUBLIC, rel);
  assert.ok(fs.existsSync(p), '页面不存在: ' + rel);
  return fs.readFileSync(p, 'utf8');
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
    ok('process / outcome 段内容存在', () => {
      assert.ok(projHtml.includes('过程内容'), '缺少 process');
      assert.ok(projHtml.includes('成果内容'), '缺少 outcome');
    });
    ok('空字段 tech 不渲染对应小节（真实数据铁律）', () => {
      assert.ok(!projHtml.includes('技术方案'), 'tech 为空却渲染了「技术方案」小节');
    });
    ok('原有条目 Ties 详情页仍生成', () =>
      assert.ok(fs.existsSync(path.join(PUBLIC, 'projects', 'Ties', 'index.html'))));

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

    console.log('\n[7] 首页联动');
    const home = readPage('index.html');
    ok('首页模块入口链接可用（无 HTML 实体转义）', () => {
      assert.ok(home.includes('href="/projects/"'), '首页缺少 /projects/ 链接');
      assert.ok(!home.includes('&#34;/projects/'), '链接被转义成实体，浏览器点不动');
    });
  } finally {
    restore('projects');
    restore('games');
    cleanGenerated();
    console.log('\n[8] 还原原始数据文件 + 清理测试生成的页面');
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

  console.log('\n' + pass + ' 项断言通过');
  console.log('提示：public/projects 与 public/games 已清理，需重新 npm run build 生成正式页面。');
}

main().catch((e) => {
  console.error('\nE2E 执行失败：', e && e.message ? e.message : e);
  process.exitCode = 1;
});
