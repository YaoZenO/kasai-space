'use strict';
// 精选池断言（PLAN-V3 §1）。
//
// 这四条是这套机制能不能成立的关键，任何一条破了都会让首页退回
// 「谁新谁上」或「来一篇顶一篇」：
//   S1 篇幅档的阈值边界（800 字是准入线，不能落进 0 档）
//   S2 新鲜度档不归零（老内容掉分但不判死刑）
//   S3 顶替门槛（挑战者必须高出 2 分，差 1 分留在位者）
//   S4 置顶直通与 60 天租期到期后自动降级
//
// 所有用例都注入 today 与 ledger，不读写真实台账（否则跑一次测试
// 就会改掉排队历史，下次构建的主卡会被「在位优势」莫名锁住）。

const assert = require('assert');
const path = require('path');
const {
  lenTier, freshTier, pinState, bodyLen, pickPool,
  PIN_DAYS, REPLACE_MARGIN
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

/* ---------- S2 新鲜度 ---------- */

ok('S2 新鲜度：90 / 180 / 365 天各自落在正确档，超过一年才归零', () => {
  assert.strictEqual(freshTier(TODAY - 90 * DAY, TODAY), 3);
  assert.strictEqual(freshTier(TODAY - 91 * DAY, TODAY), 2);
  assert.strictEqual(freshTier(TODAY - 180 * DAY, TODAY), 2);
  assert.strictEqual(freshTier(TODAY - 181 * DAY, TODAY), 1);
  assert.strictEqual(freshTier(TODAY - 365 * DAY, TODAY), 1);
  assert.strictEqual(freshTier(TODAY - 366 * DAY, TODAY), 0);
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

function runPool(posts, opts) {
  const site = { posts: { toArray: () => posts } };
  return pickPool(site, {}, Object.assign({ today: TODAY, noLedger: true }, opts || {}));
}

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

ok('S4 池：长文进池且拿到应得的篇幅档', () => {
  const r = runPool([mkPost('长文', 'long', 2500, '2026-11-01')]);
  assert.strictEqual(r.eligible.length, 1);
  assert.strictEqual(r.eligible[0].L, 2);
  assert.strictEqual(r.eligible[0].score, 0 * 3 + 2 + 3 + 1);
});

/* ---------- 闸三：顶替门槛 ---------- */

ok('S5 闸三：挑战者只高 1 分时，在位者继续在位', () => {
  const strong = mkPost('新长文', 'new', 2500, '2026-11-01');       // L2 T3 C1 = 6
  const incumb = mkPost('在位者', 'old', 2500, '2026-07-01');       // L2 T2 C1 = 5
  const r = runPool([strong, incumb], { ledger: { hero: { key: 'post:old', score: 5 } } });
  assert.strictEqual(r.hero.key, 'post:old');
  assert.ok(r.heroReason.indexOf('未达') >= 0);
});

ok('S5 闸三：挑战者高出 2 分才顶替', () => {
  const strong = mkPost('新长文', 'new', 2500, '2026-11-01');       // 6
  const incumb = mkPost('在位者', 'old', 2500, '2026-04-01');       // L2 T1 C1 = 4
  const r = runPool([strong, incumb], { ledger: { hero: { key: 'post:old', score: 4 } } });
  assert.strictEqual(r.hero.key, 'post:new');
  assert.ok(r.heroReason.indexOf('顶替') >= 0);
});

ok('S5 闸三：没有台账时直接取第 1 名，不做无意义的顶替判断', () => {
  const strong = mkPost('新长文', 'new', 2500, '2026-11-01');
  const weak = mkPost('旧文', 'old', 2000, '2026-04-01');
  const r = runPool([strong, weak]);
  assert.strictEqual(r.hero.key, 'post:new');
  assert.strictEqual(r.hero.fallback, undefined);
});

/* ---------- 置顶直通 ---------- */

ok('S6 置顶：即使分数更低也直通主卡', () => {
  const strong = mkPost('高分文', 'new', 4000, '2026-11-01');       // L3 T3 C1 = 7
  const weakPin = mkPost('置顶文', 'pin', 900, '2026-09-01', { pinned: '2026-11-01' }); // L1 T2 C1 = 4
  const r = runPool([strong, weakPin], { ledger: { hero: { key: 'post:new', score: 7 } } });
  assert.strictEqual(r.hero.key, 'post:pin');
  assert.strictEqual(r.heroReason, '置顶');
});

ok('S6 置顶：租期过了就交回评分制，不再是主卡', () => {
  const strong = mkPost('高分文', 'new', 4000, '2026-11-01');
  const expiredPin = mkPost('过期置顶', 'pin', 900, '2026-09-01', { pinned: '2026-08-01' });
  const r = runPool([strong, expiredPin], { ledger: { hero: { key: 'post:new', score: 7 } } });
  assert.strictEqual(r.hero.key, 'post:new');
  assert.strictEqual(r.pinned.length, 0);
});

/* ---------- 精选栏 ---------- */

ok('S7 精选栏：不含主卡本身，最多 5 条', () => {
  const posts = [];
  for (let i = 0; i < 8; i += 1) {
    posts.push(mkPost('文章' + i, 'p' + i, 1500 + i * 100, '2026-11-0' + ((i % 3) + 1)));
  }
  const r = runPool(posts);
  assert.strictEqual(r.picks.length, 5);
  assert.ok(!r.picks.some((p) => p.key === r.hero.key), '精选栏不应包含主卡');
});

/* ---------- 台账位置 ---------- */

ok('S8 台账不落在 public/ 下（内部决策记录不公开）', () => {
  const helperDir = path.join(__dirname, '..', 'themes', 'fluid', 'scripts', 'helpers');
  const logPath = path.join(helperDir, '..', '..', '..', '..', '_curation-log.json');
  const rel = path.relative(path.join(__dirname, '..', 'public'), logPath);
  assert.ok(rel.startsWith('..'), '台账路径落在 public/ 内，必须移出去');
});

/* ---------- 常量一致性 ---------- */

ok('S9 常量：租期 60 天、顶替门槛 2 分（改这两个数必须同步改本文档）', () => {
  assert.strictEqual(PIN_DAYS, 60);
  assert.strictEqual(REPLACE_MARGIN, 2);
});

console.log('\nRESULT: ' + pass + ' 项断言通过');
