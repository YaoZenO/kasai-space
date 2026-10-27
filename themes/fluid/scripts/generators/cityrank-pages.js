/* global hexo */

'use strict';

// 城市排行榜页面生成器：/cityrank/ 索引页 + /cityrank/<slug>/ 榜单页 + /city/<slug>/ 城市页。
// 数据来源：source/_data/cityrank.yml（榜单定义）+ source/_data/cities.yml（城市数据）。
// 无数据不生成任何页面（真实数据铁律，DESIGN-LANGUAGE §1 第 2 条）。
//
// 名次一律由 helper 现算（PRD §5.1 P0 铁律），这里只负责把结果挂到路由上。

const { buildCityRanks } = require('../helpers/cityrank-data.js');

hexo.extend.generator.register('cityrank-pages', function (locals) {
  const data =
    (locals && locals.site && locals.site.data) ||
    (locals && locals.data) ||
    (this && this.site && this.site.data) ||
    {};

  const R = buildCityRanks(data);
  if (R.error) return [];

  const routes = [];

  routes.push({
    path: 'cityrank/index.html',
    layout: 'cityrank',
    data: {
      title: (R.meta && R.meta.title) || '城市排行榜',
      __cityrankIndex: true
    }
  });

  for (const g of R.groups) {
    for (const r of g.ranks) {
      routes.push({
        path: 'cityrank/' + r.slug + '/index.html',
        layout: 'rank',
        data: {
          title: r.title,
          __cityrank: true,
          rankSlug: r.slug,
          groupKey: g.key
        }
      });
    }
  }

  // 城市页：为数据集中每一座城市生成（只要它有任一已核验字段就有内容）。
  // 早期版本只为上榜城市生成，导致 31 座城市里 18 座查无此页——档案页的价值在于
  // 「城市本身的数据」，与它进没进前十无关；无内容的城市由模板按 [待补] 渲染。
  for (const c of R.cities) {
    const hasData = c.metrics && Object.keys(c.metrics).length > 0;
    if (!hasData) continue;
    routes.push({
      path: 'city/' + c.slug + '/index.html',
      layout: 'city',
      data: {
        title: c.name,
        __city: true,
        citySlug: c.slug
      }
    });
  }

  return routes;
});
