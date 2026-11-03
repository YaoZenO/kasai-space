/* global hexo */

'use strict';

// 全站搜索索引（PLAN-V3 §4 / P3）。
//
// 解决的问题：主题自带的 local-search 只遍历 locals.posts 与 locals.pages，
// 而站内 600+ 个资料页（城市档案 / 榜单 / 生肖 / 节日 / 节假日）全部由 generator
// 返回 { path, data, layout } 直接挂路由，**不是 Page 模型**，所以一条都进不了索引——
// 实测 public/local-search.xml 长期只有 6 条 entry（等于文章数）。
//
// 本生成器从数据文件直接构造索引，不依赖页面模型，因此新增一类页面只要在这里
// 加一段，不需要动模板。
//
// 字段用短名压体积（431 座城市 + 143 个榜 + 其余，总量约 60–80KB，gzip 后 20KB 上下）：
//   t 标题 / u 路径 / c 类型 / s 摘要 / k 别名（拼音或分组名）
//
// 同时产出 /search/ 页面的路由。

function clip(s, n) {
  const t = String(s || '')
    .replace(/<pre[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

hexo.extend.generator.register('site-search', function (locals) {
  const data = locals.data || {};
  const items = [];

  // ① 文章
  const posts = locals.posts ? locals.posts.sort('-date').toArray() : [];
  posts.forEach(function (p) {
    if (!p || !p.title) return;
    const url = '/' + String(p.path || '').replace(/^\//, '');
    items.push({
      t: p.title,
      u: url,
      c: 'post',
      s: clip(p.description || p.excerpt || p.content, 80),
      k: ''
    });
  });

  // ② Markdown 页面（关于 / 现在 / 友链 等）
  // 注意：generator 挂的页面也会出现在 locals.pages 里（路径形如 holidays/2022/index.html），
  // 它们已经由下面各自的类型收录，这里必须跳过，否则同一条内容会出现两次。
  const pages = locals.pages ? locals.pages.toArray() : [];
  pages.forEach(function (p) {
    if (!p || !p.title) return;
    const raw = String(p.path || '').replace(/^\//, '');
    if (/^(holidays|zodiac|library|city|cityrank|search)\//.test(raw)) return;
    // 规范化：about/index.html → /about/
    const url = '/' + raw.replace(/index\.html$/, '');
    items.push({ t: p.title, u: url, c: 'page', s: clip(p.description || p.content, 70), k: '' });
  });

  // ③ 城市档案
  arr(data.cities && data.cities.cities).forEach(function (c) {
    if (!c || !c.name || !c.slug) return;
    const fieldCount = c.metrics ? Object.keys(c.metrics).length : 0;
    items.push({
      t: c.name,
      u: '/city/' + c.slug + '/',
      c: 'city',
      s: [c.province, c.level, fieldCount ? '档案 ' + fieldCount + ' 项' : '']
        .filter(Boolean).join(' · '),
      k: c.slug
    });
  });

  // ④ 城市排行榜
  arr(data.cityrank && data.cityrank.groups).forEach(function (g) {
    arr(g && g.ranks).forEach(function (r) {
      if (!r || !r.slug || !r.title) return;
      items.push({
        t: r.title,
        u: '/cityrank/' + r.slug + '/',
        c: 'rank',
        s: clip(r.lede, 70),
        k: g.title || ''
      });
    });
  });

  // ⑤ 十二生肖
  arr(data.zodiac && data.zodiac.animals).forEach(function (a, i) {
    if (!a || !a.key || !a.animal) return;
    items.push({
      t: a.animal + '年',
      u: '/zodiac/' + a.key + '/',
      c: 'zodiac',
      s: [
        '第 ' + (i + 1) + ' 位',
        a.branch ? '地支「' + a.branch + '」' : '',
        a.featured ? '本轮 ' + a.featured : ''
      ].filter(Boolean).join(' · '),
      k: a.pinyin || ''
    });
  });

  // ⑥ 节日文化（/library/<key>/）
  arr(data.festivals && data.festivals.festivals).forEach(function (f) {
    if (!f || !f.key || !f.name) return;
    items.push({
      t: f.name,
      u: '/library/' + f.key + '/',
      c: 'festival',
      s: clip(f.desc || f.lede, 70),
      k: f.pinyin || ''
    });
  });

  // ⑦ 节假日年份（/holidays/<year>/）
  arr(data.holidays && data.holidays.years).forEach(function (y) {
    if (!y || !y.year) return;
    const count = arr(y.holidays).length;
    items.push({
      t: y.year + ' 年节假日',
      u: '/holidays/' + y.year + '/',
      c: 'holiday',
      s: [count ? count + ' 个法定节假日' : '', y.official ? '官方安排' : '预计安排']
        .filter(Boolean).join(' · '),
      k: String(y.year)
    });
  });

  // ⑧ 资料库专题入口
  // URL 固定带 #topic-<key> 锚点：专题的 link 往往就是某个具体内容页
  // （如 festivals 专题的 link 是 /library/yuandan/），直接用会和 ⑥ 的节日页撞车，
  // 去重后会把专题入口整个丢掉。带锚点既保留了「搜专题名能进专题」的能力，
  // 又不会产生重复 URL —— /library/ 页面里每个专题的 section 都有这个 id。
  arr(data.library && data.library.topics).forEach(function (tp) {
    if (!tp || !tp.title) return;
    items.push({
      t: tp.title,
      u: '/library/' + (tp.key ? '#topic-' + tp.key : ''),
      c: 'topic',
      s: clip(tp.desc, 70),
      k: '资料库'
    });
  });

  // ⑨ 导航级固定页：这些由 generator 渲染，不在 locals.pages 里，
  // 不显式补进来就永远搜不到（「友链」「归档」尤其明显）。
  [
    { t: '文字归档', u: '/archives/', s: '按年份浏览全部文章' },
    { t: '项目', u: '/projects/', s: '做过的项目与作品' },
    { t: '游戏', u: '/games/', s: '在玩与玩过的游戏记录' },
    { t: '收藏', u: '/collections/', s: '收藏与整理的内容' },
    { t: '友链', u: '/links/', s: '友情链接' }
  ].forEach(function (p) {
    items.push({ t: p.t, u: p.u, c: 'page', s: p.s, k: '' });
  });

  // 兜底去重：同一 URL 只保留第一次出现的（先 push 的是更具体的类型）
  const seen = {};
  const unique = [];
  items.forEach(function (it) {
    if (!it.u || seen[it.u]) return;
    seen[it.u] = 1;
    unique.push(it);
  });

  const payload = JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    count: unique.length,
    items: unique
  });

  return [
    { path: 'search-index.json', data: payload },
    { path: 'search/index.html', data: { title: '搜索', hide_banner: true }, layout: 'search' }
  ];
});
