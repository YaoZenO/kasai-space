/* global hexo */

'use strict';

// 跨类型精选池（PLAN-V3 §1）。
//
// 解决的旧问题：首页主卡原本按「最新日期」自动顶上去（无人工判断），
// 下方「精选内容」栏直接绑死 projects.yml 全量输出（不是评选）；
// 文字页摘录是手写 slug 清单，其中一条已失效也没人知道。
//
// 本 helper 把六类内容收进同一个池，用同一套分数排序。
//
// 主卡三层优先级（主人 2026-11-06 拍板）：
//   1 置顶     勾了 pinned 且未满 60 天 → 直接锁主卡
//   2 FEATURED 勾了 featured → 在 featured 里选内容分最高
//   3 自动保底 什么都没勾 → 前 3 名文章/项目按 30 天周期轮值
// 手动标记永远优先；轮值只在你没有表态时兜底。
//
// 计分：E×3 + L×2 + C（满分 10）。新鲜度 T 已退出计分（E-105）——
// 它曾与整个 L 跨度同权，导致 148 字的游戏压过 2736 字的长文。
//
// 置顶带 60 天租期，到期自动降级为普通精选，交回下层规则。
// 站是公开的，所以任何状态都不上页面，只在后台显示。
//
// 位置约束：必须放 themes/fluid/scripts/helpers/ 且自包含（AGENTS §5.2 /
// E-028）——Hexo 用 vm 逐个执行脚本，跨文件 require 会解析失败。
//
// 用法（模板）：var pool = buildCurationPool(site, site.data)
// 用法（测试）：const { buildCurationPool } = require('.../curation-pool.js')

const fs = require('fs');
const path = require('path');

// 置顶租期（天）。到期自动降级，不告警。
const PIN_DAYS = 60;
const DAY_MS = 86400000;

// 自动保底：主卡在前 3 名之间轮值，周期 30 天。
// 用固定基准日做整数取模，不依赖台账，也不依赖是否发新文。
const ROTATION_DAYS = 30;
const HERO_TOP_N = 3;
const ROTATION_EPOCH = Date.UTC(2026, 0, 1);

// 新文破例：发布 7 天内且内容分并列第 1，可当期直接上位。
const FRESH_OVERRIDE_DAYS = 7;

// 正文去标点：中文标点、全角符号、空白、常见 ASCII 标点一并去掉，
// 只留下「真的写了字」的部分，用来判断空壳与篇幅。
const PUNCT_RE = /[\s\u3000-\u303f\uff00-\uffef!-\/:-@\[-`{-~]/g;

const LOG_PATH = path.join(__dirname, '..', '..', '..', '..', '_curation-log.json');

/* ---------- 基础工具 ---------- */

// 把 Date / 'YYYY-MM-DD' / 时间戳统一成毫秒数。非法值返回 null。
// js-yaml 会把不带引号的日期解析成 UTC 零点的 Date（E-028），这里统一兜住。
function toTs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return isFinite(t) ? t : null;
  }
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'object' && typeof v.valueOf === 'function') {
    const t = v.valueOf();
    if (typeof t === 'number' && isFinite(t)) return t;
  }
  const t = Date.parse(String(v));
  return isFinite(t) ? t : null;
}

function textOf(html) {
  let s = String(html || '');
  // 代码块整段剔除：代码不是「写了多少字」的证据，留着会把篇幅虚高
  s = s.replace(/<pre[\s\S]*?<\/pre>/gi, ' ');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&[a-zA-Z#0-9]+;/g, ' ');
  return s;
}

function bodyLen(html) {
  return textOf(html).replace(PUNCT_RE, '').length;
}

// 篇幅档：0 / 1 / 2 / 3。
// cuts 是三个递增阈值：n < cuts[0] → 0；[cuts[0], cuts[1]) → 1；
// [cuts[1], cuts[2]) → 2；≥ cuts[2] → 3。
// 阈值只传三个——传四个会把 800–2000 这一段整段落进 0 档（2026-11-04 踩过，
// 表现为「1355 字的长文算成 0 档」，主卡被资料库专题顶掉）。
function lenTier(n, cuts) {
  if (n >= cuts[2]) return 3;
  if (n >= cuts[1]) return 2;
  if (n >= cuts[0]) return 1;
  return 0;
}

function slugOfPost(post) {
  const p = String(post.path || '');
  return post.slug || p.replace(/^\//, '').replace(/\/$/, '').split('/').pop();
}

function urlOfPost(post) {
  const p = String(post.path || '');
  return '/' + p.replace(/^\//, '');
}

/* ---------- 准入与计分：文章 ---------- */

const ARTICLE_MIN_CHARS = 800;

function articleEntry(post, today) {
  const body = bodyLen(post.content || post._content);
  const titleLen = bodyLen(post.title);
  const catCount = post.categories && post.categories.length ? post.categories.length : 0;
  const tagCount = post.tags && post.tags.length ? post.tags.length : 0;

  // 空壳：正文去掉标点后与标题一模一样（后台新建文章会把标题填进正文）
  const isShell = titleLen > 0 && body === titleLen;

  const E = post.featured ? 1 : 0;
  const manual = E === 1 || !!post.pinned;

  // 闸一：篇幅 + 分类 + 非空壳，三条全过才有资格参评。
  // 手动标记（featured / 置顶）可以越过篇幅门槛——主人点它就是因为「重要」，
  // 不该被 800 字的自动化门槛吞掉；但空壳仍然排除，避免首页出现只有标题的卡片。
  const baseEligible = body >= ARTICLE_MIN_CHARS && catCount > 0;
  const eligible = !isShell && (baseEligible || manual);

  const L = lenTier(body, [ARTICLE_MIN_CHARS, 2000, 4000]);
  // 完整度只看「编目是否齐」：分类 + 标签。
  // 不把封面算作必要条件——全站 6 篇文章一张封面都没有（实测 2026-11-04），
  // 用封面当门槛等于给所有文章系统性扣 1 分，跨类型比较就失真了。
  const C = (catCount > 0 && tagCount > 0) ? 1 : 0;

  return {
    kind: 'post',
    kindLabel: '文章',
    key: 'post:' + slugOfPost(post),
    title: post.title || '',
    url: urlOfPost(post),
    date: toTs(post.date),
    summary: post.description || '',
    cover: post.cover || '',
    eligible: eligible,
    reason: eligible ? '' : (body < ARTICLE_MIN_CHARS ? '篇幅不足' : (isShell ? '空壳' : '缺分类')),
    chars: body,
    E: E, L: L, C: C,
    score: E * 3 + L * 2 + C,
    pinned: post.pinned || false,
    _raw: post
  };
}

/* ---------- 准入与计分：项目 ---------- */

const PROJECT_SECTIONS = ['background', 'process', 'tech', 'outcome'];

function projectEntry(item, today) {
  let filled = 0;
  let total = 0;
  PROJECT_SECTIONS.forEach(function (k) {
    const n = bodyLen(item[k]);
    if (n > 0) filled += 1;
    total += n;
  });

  const tagCount = Array.isArray(item.tags) ? item.tags.length : 0;
  const E = item.featured ? 1 : 0;

  // 闸一：四段里至少三段有内容；手动标记可越过门槛。
  const eligible = filled >= 3 || E === 1 || !!item.pinned;

  const L = lenTier(total, [800, 2000, 4000]);
  const C = (item.summary && tagCount > 0 && item.link) ? 1 : 0;

  return {
    kind: 'project',
    kindLabel: '项目',
    key: 'project:' + (item.slug || item.title || ''),
    title: item.title || '',
    url: '/projects/' + (item.slug || encodeURIComponent(String(item.title || ''))) + '/',
    date: toTs(item.date),
    summary: item.summary || '',
    cover: item.cover || '',
    eligible: eligible,
    reason: eligible ? '' : '四段内容不足三段',
    chars: total,
    E: E, L: L, C: C,
    score: E * 3 + L * 2 + C,
    pinned: item.pinned || false,
    _raw: item
  };
}

/* ---------- 准入与计分：游戏 / 收藏 ---------- */

function gameEntry(item, today) {
  const body = bodyLen(item.gameplay);
  const summaryLen = bodyLen(item.summary);
  const E = item.featured ? 1 : 0;
  // 手动标记可越过「有简介」门槛。
  const eligible = !!(item.summary && (item.genre || item.platform)) || E === 1 || !!item.pinned;

  // 游戏与文章共用一把尺（800/2000/4000）。旧阈值 200/600/1500 让 479 字的
  // 游戏拿到 3 分、压过 1355 字文章，这是 E-105 的核心症状。
  // 后果是现有五款游戏（10–479 字）全部落在 0 档、只拿 1 分——
  // 想让某款游戏上首页，要么把内容写厚，要么后台手动勾 featured。
  const L = lenTier(body + summaryLen, [800, 2000, 4000]);
  const C = (item.genre && item.platform && item.cover) ? 1 : 0;

  return {
    kind: 'game',
    kindLabel: '游戏',
    key: 'game:' + (item.slug || item.title || ''),
    title: item.title || '',
    url: '/games/' + (item.slug || encodeURIComponent(String(item.title || ''))) + '/',
    date: toTs(item.date),
    summary: item.summary || '',
    cover: item.cover || '',
    eligible: eligible,
    reason: eligible ? '' : '缺简介或元字段',
    chars: body + summaryLen,
    E: E, L: L, C: C,
    score: E * 3 + L * 2 + C,
    pinned: item.pinned || false,
    _raw: item
  };
}

function collectionEntry(item, today) {
  const body = bodyLen(item.desc || item.summary);
  const E = item.featured ? 1 : 0;
  const eligible = !!(item.title && (item.desc || item.summary)) || E === 1 || !!item.pinned;

  const L = lenTier(body, [100, 300, 800]);
  const C = (item.summary && item.link) ? 1 : 0;

  return {
    kind: 'collection',
    kindLabel: '收藏',
    key: 'collection:' + (item.slug || item.title || ''),
    title: item.title || '',
    url: '/collections/' + (item.slug || encodeURIComponent(String(item.title || ''))) + '/',
    date: toTs(item.date),
    summary: item.summary || item.desc || '',
    cover: item.cover || '',
    eligible: eligible,
    reason: eligible ? '' : '缺简介',
    chars: body,
    E: E, L: L, C: C,
    score: E * 3 + L * 2 + C,
    pinned: item.pinned || false,
    _raw: item
  };
}

/* ---------- 准入与计分：资料库专题 ---------- */

// 专题以「整块」进池，不是把每个生肖/每座城市单独塞进来。
// 条目数用的是专题自己的 entries 长度——城市档案那种「431 座」的量级
// 由 library.yml 的 entries 表达不了，这里按 2 条起算，L 档位也相应收紧。
function topicEntry(topic, updatedTs, today) {
  const entries = Array.isArray(topic.entries) ? topic.entries.length : 0;
  const E = topic.featured ? 1 : 0;
  const eligible = entries >= 2 || E === 1 || !!topic.featuredAt;
  // 专题的厚度按条目数分档，但阈值要收紧：12 个条目（每个只有名称 + 一句注）
  // 的信息量远不如一篇 2000 字文章，给同一个档位会让所有专题系统性地压过文章。
  const L = lenTier(entries, [12, 24, 40]);
  const C = topic.link ? 1 : 0;

  return {
    kind: 'topic',
    kindLabel: '资料库',
    key: 'topic:' + (topic.key || topic.title || ''),
    title: topic.title || '',
    url: topic.link || '/library/',
    date: updatedTs,
    summary: topic.desc || '',
    cover: topic.cover || '',
    eligible: eligible,
    reason: eligible ? '' : '条目不足',
    chars: entries,
    E: E, L: L, C: C,
    score: E * 3 + L * 2 + C,
    pinned: topic.featuredAt || false,
    _raw: topic
  };
}

/* ---------- 置顶：租期与失效 ---------- */

// 置顶写的是「什么时候标的」（日期）。到期日 = 标记日 + 60 天。
// 只写 true 没有日期时，退回用条目自身的 date 兜底——宁可算得早一点失效，
// 也不要出现「一个 true 永远锁着首页」。
function pinState(entry, today) {
  if (!entry.pinned) return { active: false, used: false };
  const start = toTs(entry.pinned) || entry.date;
  if (!start) return { active: false, used: true, expired: true, start: null };
  const expire = start + PIN_DAYS * DAY_MS;
  const remain = Math.ceil((expire - today) / DAY_MS);
  if (today > expire) return { active: false, used: true, expired: true, start: start, expire: expire, remain: 0 };
  return { active: true, used: true, expired: false, start: start, expire: expire, remain: remain };
}

/* ---------- 台账 ---------- */

// 台账不进 public/：里面是内部决策记录（谁顶了谁、差几分），不该被访客看到。
// 写失败不影响构建——台账是辅助物证，不是页面依赖。
function readLedger() {
  try {
    const raw = fs.readFileSync(LOG_PATH, 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : null;
  } catch (e) {
    return null;
  }
}

function writeLedger(obj) {
  try {
    const text = JSON.stringify(obj, null, 2);
    let old = null;
    try { old = fs.readFileSync(LOG_PATH, 'utf8'); } catch (e) { old = null; }
    if (old === text) return;
    fs.writeFileSync(LOG_PATH, text, 'utf8');
  } catch (e) {
    // 只读部署环境（如 CI 只读挂载）写不了台账，构建照常继续
  }
}

/* ---------- 主流程 ---------- */

function pickPool(site, data, opts) {
  const options = opts || {};
  const today = typeof options.today === 'number' ? options.today : Date.now();
  const d = data || {};

  const list = [];

  // 文章
  const posts = (site && site.posts) ? site.posts.toArray() : [];
  posts.forEach(function (p) {
    if (p && p.title && !p.hide_home) list.push(articleEntry(p, today));
  });

  // 项目 / 游戏 / 收藏
  ['projects', 'games', 'collections'].forEach(function (key) {
    const mod = d[key];
    if (!mod || !Array.isArray(mod.items)) return;
    mod.items.forEach(function (it) {
      if (!it || !it.title) return;
      if (key === 'projects') list.push(projectEntry(it, today));
      else if (key === 'games') list.push(gameEntry(it, today));
      else list.push(collectionEntry(it, today));
    });
  });

  // 资料库专题
  const lib = d.library;
  if (lib && Array.isArray(lib.topics)) {
    const updated = (lib.meta && toTs(lib.meta.updated)) || null;
    lib.topics.forEach(function (tp) {
      if (!tp || !tp.title) return;
      list.push(topicEntry(tp, updated, today));
    });
  }

  // 闸一：只留过闸的
  const eligible = list.filter(function (e) { return e.eligible; });

  // 排序：分数降序；同分时新的在前；再同则按 key 稳定排序
  eligible.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    const ad = a.date || 0;
    const bd = b.date || 0;
    if (bd !== ad) return bd - ad;
    return String(a.key) < String(b.key) ? -1 : 1;
  });

  // 置顶：全部算一遍状态
  list.forEach(function (e) { e.pin = pinState(e, today); });
  const pinnedActive = list.filter(function (e) { return e.pin && e.pin.active; });

  // 主卡三层优先级：置顶 > FEATURED > 自动保底。
  // 手动标记是主人的意志入口，永远压过算法；轮值只在他没表态时兜底。
  let hero = null;
  let heroReason = '';

  if (pinnedActive.length) {
    // 第 1 层：置顶直通，不看分数；多篇置顶时取分最高的那一篇
    pinnedActive.sort(function (a, b) { return b.score - a.score; });
    hero = pinnedActive[0];
    heroReason = '置顶';
  } else if (eligible.length) {
    const featuredList = eligible.filter(function (e) { return e.E === 1; });

    if (featuredList.length) {
      // 第 2 层：勾了 featured 的内容里，内容分最高者当主卡。
      // eligible 已按分数降序，featuredList 保持该顺序，取第 1 个即可。
      hero = featuredList[0];
      heroReason = 'FEATURED 手动标记';
    } else {
      // 第 3 层：自动保底。
      // 主卡只从文章 / 项目里选——游戏、收藏、专题各有自己的模块入口，
      // 且资料库专题共享同一个 updated 日，放进来会靠日期挤掉文章。
      const textTop = eligible
        .filter(function (e) { return e.kind === 'post' || e.kind === 'project'; })
        .slice(0, HERO_TOP_N);

      if (textTop.length) {
        const maxScore = eligible[0].score;
        // 新文破例：发布 7 天内且内容分并列第 1 → 当期直接上位，之后回到轮值。
        const freshList = textTop.filter(function (e) {
          const d = toTs(e.date);
          return d && (today - d) <= FRESH_OVERRIDE_DAYS * DAY_MS && e.score === maxScore;
        });

        if (freshList.length) {
          hero = freshList[0];
          heroReason = '新文破例（发布 7 天内，内容分并列第 1）';
        } else {
          const idx = Math.floor((today - ROTATION_EPOCH) / DAY_MS / ROTATION_DAYS) % textTop.length;
          hero = textTop[idx];
          heroReason = '自动轮值（第 ' + (idx + 1) + '/' + textTop.length + ' 位，每 ' + ROTATION_DAYS + ' 天轮换）';
        }
      } else {
        // 池里只有游戏/专题等非文字内容：退回内容分第 1，不让首屏空着
        hero = eligible[0];
        heroReason = '自动：无文字类候选，取内容分第 1';
      }
    }
  } else {
    // 池空兜底（PLAN-V3 §1.3）：全站没有够格参评的内容时，退回最新一篇有正文的文章。
    // 首屏最大板块不能空着，但也不能谎称它是评选结果——模板据此写 LATEST 而不是 FEATURED。
    const fallbackList = list.filter(function (e) {
      return e.kind === 'post' && e.chars > 0;
    }).sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
    if (fallbackList.length) {
      hero = Object.assign({}, fallbackList[0], { fallback: true });
      heroReason = '兜底：无内容过准入闸，退回最新一篇';
    }
  }

  // 精选栏：去掉主卡，手动标记优先（置顶 > FEATURED），其余按内容分，取 5 条。
  // 这里不隐藏低分内容——它只是排在后面。
  const picks = eligible
    .filter(function (e) { return !hero || e.key !== hero.key; })
    .sort(function (a, b) {
      const pa = a.pin && a.pin.active ? 1 : 0;
      const pb = b.pin && b.pin.active ? 1 : 0;
      if (pb !== pa) return pb - pa;
      if (b.E !== a.E) return b.E - a.E;
      return 0; // 同层保持 eligible 的原始顺序（分数降序 → 日期降序）
    })
    .slice(0, 5);

  // 文字池：只从文章里选，供「文字」页的精选摘录用（PLAN-V3 §1.7）
  const textPool = eligible.filter(function (e) { return e.kind === 'post'; });
  const textPicks = textPool.filter(function (e) { return !hero || e.key !== hero.key; }).slice(0, 3);

  const result = {
    today: today,
    all: list,
    eligible: eligible,
    excluded: list.filter(function (e) { return !e.eligible; }),
    hero: hero,
    heroReason: heroReason,
    picks: picks,
    textPicks: textPicks,
    pinned: pinnedActive,
    pinDays: PIN_DAYS,
    rotationDays: ROTATION_DAYS
  };

  // 台账：只作审计快照，不再参与主卡决策。
  // 测试传 noLedger: true 时既不读也不写台账——否则跑一次测试就会改掉真实记录。
  const useLedger = options.noLedger !== true;
  const injected = options.ledger !== undefined;
  const ledger = injected ? options.ledger : (useLedger ? readLedger() : null);

  // 只在主卡变化时追加历史，避免每次渲染都写。
  const prevKeys = ledger && ledger.hero ? ledger.hero.key : null;
  const nowKey = hero ? hero.key : null;
  const changed = prevKeys !== nowKey;
  const history = (ledger && Array.isArray(ledger.history)) ? ledger.history.slice(-49) : [];
  if (changed && hero) {
    history.push({
      date: new Date(today).toISOString().slice(0, 10),
      key: hero.key,
      title: hero.title,
      kind: hero.kind,
      score: hero.score,
      breakdown: { E: hero.E, L: hero.L, C: hero.C },
      replaced: prevKeys,
      reason: heroReason
    });
  }

  if (useLedger && !injected) writeLedger({
    generatedAt: new Date(today).toISOString().slice(0, 10),
    pinDays: PIN_DAYS,
    rotationDays: ROTATION_DAYS,
    hero: hero ? {
      key: hero.key,
      title: hero.title,
      kind: hero.kind,
      score: hero.score,
      breakdown: { E: hero.E, L: hero.L, C: hero.C },
      reason: heroReason,
      pinned: !!(hero.pin && hero.pin.active),
      pinRemain: hero.pin ? hero.pin.remain : null
    } : null,
    picks: picks.map(function (e) {
      return { key: e.key, title: e.title, kind: e.kind, score: e.score };
    }),
    pinned: pinnedActive.map(function (e) {
      return { key: e.key, title: e.title, remain: e.pin.remain, expireAt: new Date(e.pin.expire).toISOString().slice(0, 10) };
    }),
    pool: eligible.map(function (e) {
      return { key: e.key, title: e.title, kind: e.kind, score: e.score, eligible: true };
    }),
    excluded: list.filter(function (e) { return !e.eligible; }).map(function (e) {
      return { key: e.key, title: e.title, reason: e.reason };
    }),
    history: history
  });

  return result;
}

/* ---------- 缓存 ---------- */

// 同一轮构建里 index.ejs 可能被多次渲染（分页），池算一次就够。
let CACHE = null;
let CACHE_DAY = null;

function buildCurationPool(site, data, opts) {
  const options = opts || {};
  const today = typeof options.today === 'number' ? options.today : Date.now();
  const dayKey = Math.floor(today / DAY_MS);
  if (CACHE && CACHE_DAY === dayKey && !options.noCache) return CACHE;
  CACHE = pickPool(site, data, { today: today });
  CACHE_DAY = dayKey;
  return CACHE;
}

if (typeof hexo !== 'undefined' && hexo.extend && hexo.extend.helper) {
  hexo.extend.helper.register('buildCurationPool', buildCurationPool);
}

module.exports = {
  buildCurationPool: buildCurationPool,
  pickPool: pickPool,
  pinState: pinState,
  bodyLen: bodyLen,
  lenTier: lenTier,
  PIN_DAYS: PIN_DAYS,
  ROTATION_DAYS: ROTATION_DAYS
};
