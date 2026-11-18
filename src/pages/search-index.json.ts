// /search-index.json：站内搜索索引（逐函数移植 themes/fluid/scripts/generators/search-index.js）。
// 字段短名：t 标题 / u 路径 / c 类型 / s 摘要 / k 别名。顺序即生成器 push 顺序，
// 同一 URL 只保留第一条（先 push 的是更具体的类型）。

import fs from 'node:fs';
import path from 'node:path';
import { getPosts } from '../lib/posts';
import { getData } from '../lib/data';
import { detailPath } from '../lib/modules';
import { renderMarkdown } from '../lib/markdown';
import { pageFrontMatter } from '../lib/page-meta';

function clip(s: any, n: number): string {
  const t = String(s || '')
    .replace(/<pre[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function arr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

/** 读 md 页面：front matter + 渲染后的正文 HTML */
function pageBody(rel: string): { fm: any; html: string } {
  const full = path.join(process.cwd(), 'source', rel);
  let fm: any = {};
  let body = '';
  if (fs.existsSync(full)) {
    const text = fs.readFileSync(full, 'utf8');
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (m) {
      fm = pageFrontMatter(rel);
      body = text.slice(m[0].length);
    } else {
      fm = pageFrontMatter(rel);
      body = text;
    }
  }
  return { fm, html: body.trim() ? renderMarkdown(body) : '' };
}

export async function GET() {
  const data = getData();
  const items: any[] = [];

  // ① 文章
  for (const p of getPosts().slice().sort((a, b) => b.date.getTime() - a.date.getTime())) {
    if (!p || !p.title) continue;
    const url = '/' + String(p.path || '').replace(/^\//, '');
    items.push({ t: p.title, u: url, c: 'post', s: clip(p.content, 80), k: '' });
  }

  // ② Markdown 页面（about / now / festivals；其余前缀由下面各类型收录）
  for (const slug of ['about', 'now', 'festivals']) {
    const { fm, html } = pageBody(slug + '/index.md');
    const p = { title: fm.title, path: slug + '/index.html' };
    if (!p.title) continue;
    const raw = String(p.path).replace(/^\//, '');
    if (/^(holidays|zodiac|library|city|cityrank|search)\//.test(raw)) continue;
    const url = '/' + raw.replace(/index\.html$/, '');
    items.push({ t: p.title, u: url, c: 'page', s: clip(fm.description || html, 70), k: '' });
  }

  // ③ 城市档案
  for (const c of arr(data.cities?.cities)) {
    if (!c || !c.name || !c.slug) continue;
    const fieldCount = c.metrics ? Object.keys(c.metrics).length : 0;
    items.push({
      t: c.name,
      u: '/city/' + c.slug + '/',
      c: 'city',
      s: [c.province, c.level, fieldCount ? '档案 ' + fieldCount + ' 项' : ''].filter(Boolean).join(' · '),
      k: c.slug,
    });
  }

  // ④ 城市排行榜
  for (const g of arr(data.cityrank?.groups)) {
    for (const r of arr(g && g.ranks)) {
      if (!r || !r.slug || !r.title) continue;
      items.push({ t: r.title, u: '/cityrank/' + r.slug + '/', c: 'rank', s: clip(r.lede, 70), k: g.title || '' });
    }
  }

  // ⑤ 十二生肖
  arr(data.zodiac?.animals).forEach((a: any, i: number) => {
    if (!a || !a.key || !a.animal) return;
    items.push({
      t: a.animal + '年',
      u: '/zodiac/' + a.key + '/',
      c: 'zodiac',
      s: ['第 ' + (i + 1) + ' 位', a.branch ? '地支「' + a.branch + '」' : '', a.featured ? '本轮 ' + a.featured : '']
        .filter(Boolean)
        .join(' · '),
      k: a.pinyin || '',
    });
  });

  // ⑥ 节日文化
  for (const f of arr(data.festivals?.festivals)) {
    if (!f || !f.key || !f.name) continue;
    items.push({ t: f.name, u: '/library/' + f.key + '/', c: 'festival', s: clip(f.desc || f.lede, 70), k: f.pinyin || '' });
  }

  // ⑦ 节假日年份
  for (const y of arr(data.holidays?.years)) {
    if (!y || !y.year) continue;
    const count = arr(y.holidays).length;
    items.push({
      t: y.year + ' 年节假日',
      u: '/holidays/' + y.year + '/',
      c: 'holiday',
      s: [count ? count + ' 个法定节假日' : '', y.official ? '官方安排' : '预计安排'].filter(Boolean).join(' · '),
      k: String(y.year),
    });
  }

  // ⑧ 资料库专题入口（URL 带 #topic-<key> 锚点，避免与具体页撞车）
  for (const tp of arr(data.library?.topics)) {
    if (!tp || !tp.title) continue;
    items.push({
      t: tp.title,
      u: '/library/' + (tp.key ? '#topic-' + tp.key : ''),
      c: 'topic',
      s: clip(tp.desc, 70),
      k: '资料库',
    });
  }

  // ⑨ 个人项目（projects.yml）
  for (const it of arr(data.projects?.items)) {
    if (!it || !it.title) continue;
    items.push({
      t: String(it.title),
      u: detailPath('projects', it),
      c: 'project',
      s: clip(it.summary, 80),
      k: arr(it.tags).join(' '),
    });
  }

  // ⑩ 游戏与电竞专题（games.yml + 独立夺冠专题）
  for (const it of arr(data.games?.items)) {
    if (!it || !it.title) continue;
    items.push({
      t: String(it.title),
      u: detailPath('games', it),
      c: 'game',
      s: clip(it.summary || [it.genre, it.platform, it.status].filter(Boolean).join(' · '), 80),
      k: [it.slug, it.genre, it.platform].filter(Boolean).join(' '),
    });
  }
  items.push({
    t: 'BLG 夺冠：3-1 战胜 Gen.G，队史首冠',
    u: '/blg-champion/',
    c: 'game',
    s: '2026 英雄联盟全球总决赛，LPL 时隔五年再夺世界冠军，Knight 总决赛 MVP',
    k: 'BLG GenG S16 LOL 英雄联盟 全球总决赛 Knight 召唤师奖杯',
  });
  items.push({
    t: 'Falcons 3-0 FURIA：科隆 Major 夺冠，NiKo 圆梦',
    u: '/cologne-major-2026/',
    c: 'game',
    s: 'IEM Cologne Major 2026 决赛三张地图全部 13-8，m0NESY 获 MVP，NiKo 3067 天圆梦',
    k: 'Falcons FURIA CS2 IEM Cologne Major 科隆 NiKo m0NESY',
  });

  // ⑪ 收藏与策展（collections.yml）
  arr(data.collections?.items).forEach((it: any, idx: number) => {
    if (!it || !it.title) return;
    items.push({
      t: String(it.title),
      u: '/collections/#col-' + idx,
      c: 'collection',
      s: clip(it.desc, 80),
      k: '收藏 策展',
    });
  });

  // ⑫ 导航级固定页
  for (const p of [
    { t: '文字归档', u: '/archives/', s: '按年份浏览全部文章' },
    { t: '项目', u: '/projects/', s: '做过的项目与作品' },
    { t: '游戏', u: '/games/', s: '在玩与玩过的游戏记录' },
    { t: '收藏', u: '/collections/', s: '收藏与整理的内容' },
    { t: '友链', u: '/links/', s: '友情链接' },
  ]) {
    items.push({ t: p.t, u: p.u, c: 'page', s: p.s, k: '' });
  }

  // 兜底去重：同一 URL 只保留第一次出现的
  const seen: Record<string, number> = {};
  const unique: any[] = [];
  for (const it of items) {
    if (!it.u || seen[it.u]) continue;
    seen[it.u] = 1;
    unique.push(it);
  }

  const payload = JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    count: unique.length,
    items: unique,
  });

  return new Response(payload, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
