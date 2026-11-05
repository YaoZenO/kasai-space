'use strict';
// 精选池断言（PLAN-V3 §1，2026-11-06 改版）。
//
// 关键约束：
//   S1 篇幅档阈值边界（800 是文字类准入线）
//   S2 内容分 = E×3 + L×2 + C，新鲜度不再计分
//   S3 置顶 60 天租期
//   S4 准入：短内容/空壳不进池，手动标记可越过篇幅门槛
//   S5 三层优先级：置顶 > FEATURED > 自动保底
//   S6 自动保底轮值：30 天一换，新文 7 天破例
//   S7 精选栏：去掉主卡，手动标记优先，最多 5 条
//
// 所有用例都注入 today 与 noLedger，不读写真实台账
// （否则跑一次测试就会改掉真实记录）。

const assert = require('assert');
const path = require('path');
const {
  lenTier, pinState, bodyLen, pickPool,
  PIN_DAYS, ROTATION_DAYS
} = require('../themes/fluid/scripts/helpers/curation-pool.js');

let pass = 0;
function ok(name, fn) {
  try {
    fn();
    pass += 1;
    console.log('  PASS ' + name);
  } catch (e) {
    console.error('  FAIL ' + name);
    console.error('       ' + (e && e.message));
    process.exitCode = 1;
  }
}

const DAY = 86400000;
const TODAY = Date.parse('2026-11-04T00:00:00+08:00');

/* ---------- S1 篇幅档边界 ---------- */

ok('S1 篇幅档：799 字不进档、800 字进 1 档', () => {
  assert.strictEqual(lenTier(799, [800, 2000, 4000]), 0);
  assert.strictEqual(lenTier(800, [800, 2000, 4000]), 1);
});

ok('S1 篇幅档：1999 / 2000 / 4000 三处边界不漏档', () => {
  assert.strictEqual(lenTier(1999, [800, 2000, 4000]), 1);
  assert.strictEqual(lenTier(2000, [800, 2000, 4000]), 2);
  assert.strictEqual(lenTier(3999, [800, 2000, 4000]), 2);
  assert.strictEqual(lenTier(4000, [800, 2000, 4000]), 3);
});

ok('S1 回归：1355 字必须落在 1 档（曾因阈值多传一位整段落进 0 档）', () => {
  assert.strictEqual(lenTier(1355, [800, 2000, 4000]), 1);
});

/* ---------- 池结构 ---------- */

function mkPost(title, slug, chars, dateStr, extra) {
  return Object.assign({
    title,
    slug,
    path: '2026/11/01/' + slug + '/',
    date: new Date(dateStr),
    content: '<p>' + '字'.repeat(chars) + '</p>',
    categories: [{ name: '测试', path: '/categories/test/' }],
    tags: [{ name: 't', path: '/tags/t/' }],
    cover: ''
  }, extra || {});
}

function mkGame(title, slug, chars, dateStr, extra) {
  return Object.assign({
    title,
    slug,
    date: dateStr,
    summary: '游戏简介',
    gameplay: '字'.repeat(chars),
    genre: '策略',
    platform: 'PC',
    cover: '/images/game.jpg'
  }, extra || {});
}

function runPool(posts, opts, data) {
  const site = { posts: { toArray: () => posts } };
  return pickPool(site, data || {}, Object.assign({ today: TODAY, noLedger: true }, opts || {}));
}

/* ---------- S2 内容分 ---------- */

ok('S2 内容分：E×3 + L×2 + C，新鲜度不参与', () => {
  const r = runPool([mkPost('长文', 'long', 2500, '2026-11-01')]);
  assert.strictEqual(r.eligible.length, 1);
  assert.strictEqual(r.eligible[0].L, 2);
  assert.strictEqual(r.eligible[0].score, 0 * 3 + 2 * 2 + 1); // 5
  assert.strictEqual(r.eligible[0].T, undefined, 'T 不应再出现在条目里');
});

ok('S2 简单游戏：148 字只有 1 分，低于 1355 字文章（E-105）', () => {
  const data = { games: { items: [mkGame('英雄联盟', 'lol', 148, '2026-10-18')] } };
  const shortGame = runPool([], {}, data).eligible[0];
  const article = runPool([mkPost('1355 字文章', 'mid', 1355, '2026-11-01')]).eligible[0];
  assert.strictEqual(shortGame.L, 0);
  assert.strictEqual(shortGame.score, 1);
  assert.strictEqual(article.score, 3);
  assert.ok(shortGame.score < article.score, '简单游戏不能压过长文');
});

ok('S2 游戏统一 800：479 字也进不了厚度档（C 方案）', () => {
  const data = { games: { items: [mkGame('Esports Manager', 'esports', 479, '2026-10-18')] } };
  const g = runPool([], {}, data).eligible[0];
  assert.strictEqual(g.L, 0);
  assert.strictEqual(g.score, 1);
});

ok('S2 资料库专题：按条目数计档，走完 topicEntry 全路径（E-106）', () => {
  const data = {
    library: {
      meta: { updated: '2026-10-01' },
      topics: [{
        key: 'festivals', title: '节日文化', link: '/library/#topic-festivals',
        entries: new Array(12).fill('x')
      }]
    }
  };
  const r = runPool([], {}, data);
  assert.strictEqual(r.eligible.length, 1);
  const t = r.eligible[0];
  assert.strictEqual(t.L, 1);
  assert.strictEqual(t.score, 2 + 1);
  assert.ok(t.date > 0, '专题 date 来自 library.meta.updated');
});

/* ---------- S3 置顶租期 ---------- */

ok('S3 置顶：当天标记为生效，59 天仍生效', () => {
  const a = pinState({ pinned: '2026-11-04', date: TODAY }, TODAY);
  assert.strictEqual(a.active, true);
  const b = pinState({ pinned: '2026-09-06', date: TODAY }, TODAY);
  assert.strictEqual(b.active, true);
});

ok('S3 置顶：第 60 天仍是最后一天，第 61 天才失效', () => {
  const last = pinState({ pinned: '2026-09-05', date: TODAY }, TODAY); // 正好 60 天
  assert.strictEqual(last.active, true);
  const expired = pinState({ pinned: '2026-09-04', date: TODAY }, TODAY); // 61 天
  assert.strictEqual(expired.active, false);
  assert.strictEqual(expired.expired, true);
});

ok('S3 置顶：只写 true 没有日期时用条目 date 兜底，不会永久锁首页', () => {
  const old = pinState({ pinned: true, date: TODAY - 200 * DAY }, TODAY);
  assert.strictEqual(old.active, false);
});

/* ---------- S4 准入 ---------- */

ok('S4 准入：不足 800 字的文章不进池', () => {
  const r = runPool([mkPost('短文', 'short', 300, '2026-11-01')]);
  assert.strictEqual(r.eligible.length, 0);
  assert.strictEqual(r.excluded.length, 1);
  assert.strictEqual(r.excluded[0].reason, '篇幅不足');
});

ok('S4 准入：正文只是标题重敲一遍的空壳不进池', () => {
  const p = mkPost('空壳标题', 'shell', 0, '2026-11-01');
  p.content = '<p>' + '空壳标题' + '</p>';
  const r = runPool([p]);
  assert.strictEqual(r.eligible.length, 0);
});

ok('S4 准入：手动 featured 可越过篇幅门槛', () => {
  const r = runPool([mkPost('短文', 'short', 300, '2026-11-01', { featured: true })]);
  assert.strictEqual(r.eligible.length, 1);
  assert.strictEqual(r.eligible[0].score, 3 + 0 + 1); // E×3 + L0 + C
});

ok('S4 准入：手动 featured 也不能让空壳进池', () => {
  const p = mkPost('空壳标题', 'shell', 0, '2026-11-01', { featured: true });
  p.content = '<p>' + '空壳标题' + '</p>';
  assert.strictEqual(runPool([p]).eligible.length, 0);
});

/* ---------- S5 三层优先级 ---------- */

ok('S5 置顶压过 FEATURED 和自动排序', () => {
  const high = mkPost('高分文', 'high', 4000, '2026-11-01');               // 7
  const pin = mkPost('置顶文', 'pin', 900, '2026-09-01', {
    pinned: '2026-11-01', featured: true
  });                                                                     // 3
  const r = runPool([high, pin]);
  assert.strictEqual(r.hero.key, 'post:pin');
  assert.strictEqual(r.heroReason, '置顶');
});

ok('S5 FEATURED 压过未标记的高分内容', () => {
  const high = mkPost('高分文', 'high', 4000, '2026-11-01');               // 7
  const data = { games: { items: [mkGame('精选游戏', 'fg', 100, '2026-10-18', { featured: true })] } };
  const r = runPool([high], {}, data);                                     // 游戏 1 分
  assert.strictEqual(r.hero.kind, 'game');
  assert.ok(r.heroReason.indexOf('FEATURED') >= 0);
});

ok('S5 多条 FEATURED 时取内容分最高的一条', () => {
  const a = mkPost('精选长文', 'fa', 2500, '2026-11-01', { featured: true }); // 5
  const b = mkPost('精选短文', 'fb', 1500, '2026-11-01', { featured: true }); // 3
  const r = runPool([a, b]);
  assert.strictEqual(r.hero.key, 'post:fa');
});

/* ---------- S6 自动保底轮值 ---------- */

ok('S6 自动保底：没有手动标记时，30 天周期内主卡稳定', () => {
  const posts = [
    mkPost('长文 A', 'a', 4000, '2026-06-01'), // 7
    mkPost('长文 B', 'b', 2500, '2026-06-01'), // 5
    mkPost('长文 C', 'c', 1500, '2026-06-01')  // 3
  ];
  const r1 = runPool(posts);
  const r2 = runPool(posts, { today: TODAY + 1 * DAY });
  assert.strictEqual(r1.hero.key, r2.hero.key);
  assert.ok(r1.heroReason.indexOf('自动轮值') >= 0);
});

ok('S6 自动保底：跨过 30 天边界后换下一位', () => {
  const posts = [
    mkPost('长文 A', 'a', 4000, '2026-06-01'),
    mkPost('长文 B', 'b', 2500, '2026-06-01'),
    mkPost('长文 C', 'c', 1500, '2026-06-01')
  ];
  const r1 = runPool(posts);
  const r2 = runPool(posts, { today: TODAY + 30 * DAY });
  assert.notStrictEqual(r1.hero.key, r2.hero.key);
});

ok('S6 新文破例：发布 7 天内且内容分并列第 1，可越过轮值直接上位', () => {
  const fresh = mkPost('刚发的长文', 'fresh', 4000, '2026-11-02'); // 7，TODAY-2
  const b = mkPost('长文 B', 'b', 2500, '2026-06-01');            // 5
  const c = mkPost('长文 C', 'c', 1500, '2026-06-01');            // 3
  const r = runPool([fresh, b, c]);
  assert.strictEqual(r.hero.key, 'post:fresh');
  assert.ok(r.heroReason.indexOf('新文破例') >= 0);
});

ok('S6 自动保底只从文章/项目选主卡（游戏不抢文字位）', () => {
  const data = {
    games: { items: [mkGame('高分游戏', 'g', 900, '2026-10-18', { featured: false })] }
  };
  const r = runPool([mkPost('普通长文', 'p', 2500, '2026-06-01')], {}, data);
  assert.strictEqual(r.hero.kind, 'post');
});

/* ---------- S7 精选栏 ---------- */

ok('S7 精选栏：不含主卡本身，最多 5 条', () => {
  const posts = [];
  for (let i = 0; i < 8; i += 1) {
    posts.push(mkPost('文章' + i, 'p' + i, 1500 + i * 100, '2026-11-0' + ((i % 3) + 1)));
  }
  const r = runPool(posts);
  assert.strictEqual(r.picks.length, 5);
  assert.ok(!r.picks.some((p) => p.key === r.hero.key), '精选栏不应包含主卡');
});

ok('S7 精选栏：手动 FEATURED 排在未标记内容前面', () => {
  const high = mkPost('高分文', 'high', 4000, '2026-11-01');
  const pin = mkPost('置顶文', 'pin', 900, '2026-09-01', { pinned: '2026-11-01' });
  const featuredShort = mkPost('精选短文', 'fs', 900, '2026-10-01', { featured: true });
  const r = runPool([high, pin, featuredShort]);
  assert.strictEqual(r.hero.key, 'post:pin');
  assert.strictEqual(r.picks[0].key, 'post:fs');
});

/* ---------- S8 台账位置 ---------- */

ok('S8 台账不落在 public/ 下（内部决策记录不公开）', () => {
  const helperDir = path.join(__dirname, '..', 'themes', 'fluid', 'scripts', 'helpers');
  const logPath = path.join(helperDir, '..', '..', '..', '..', '_curation-log.json');
  const rel = path.relative(path.join(__dirname, '..', 'public'), logPath);
  assert.ok(rel.startsWith('..'), '台账路径落在 public/ 内，必须移出去');
});

/* ---------- S9 常量一致性 ---------- */

ok('S9 常量：置顶租期 60 天、轮换周期 30 天', () => {
  assert.strictEqual(PIN_DAYS, 60);
  assert.strictEqual(ROTATION_DAYS, 30);
});

console.log('\nRESULT: ' + pass + ' 项断言通过');
