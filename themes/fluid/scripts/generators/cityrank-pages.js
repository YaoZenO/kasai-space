/* global hexo */

'use strict';

// 城市排行榜页面生成器：/cityrank/ 索引页 + /cityrank/<slug>/ 榜单页 + /city/<slug>/ 城市页。
// 数据来源：source/_data/cityrank.yml（榜单定义）+ source/_data/cities.yml（城市数据）。
// 无数据不生成任何页面（真实数据铁律，DESIGN-LANGUAGE §1 第 2 条）。
//
// 名次一律由 helper 现算（PRD §5.1 P0 铁律），这里只负责把结果挂到路由上。

const { buildCityRanks, cityHasPage, cityProvinces } = require('../helpers/cityrank-data.js');

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

  // 城市大类索引页（/city/）：与榜单并列的一大类，按上榜次数排序列出全部建档城市。
  routes.push({
    path: 'city/index.html',
    layout: 'cityindex',
    data: {
      title: '城市档案',
      __cityIndex: true
    }
  });

  // 城市页：城市档案是与榜单并列的一大类，凡建档的城市都要有页——
  // 有已核验数据的展示档案表，暂时没有数据的只展示上榜记录并标注待补。
  // （早期版本要求「有 metrics 才生成」，会让榜单里的城市链接变成死链。）
  // 建页口径 2026-11-01 起走 helper 的 cityHasPage（省级聚合用同一份，不许两处各写一份）。
  for (const c of R.cities) {
    if (!cityHasPage(R, c)) continue;
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

  // 省级聚合页（/city/province/<slug>/，2026-11-01 方向四）：
  // 省内城市 + 省内各榜 + 省内城市在全国榜的表现，全部由数据现算。
  // 省内没有可建页城市的省份不生成（helper 已过滤），这里只负责挂路由。
  for (const p of cityProvinces(R)) {
    routes.push({
      path: 'city/province/' + p.slug + '/index.html',
      layout: 'province',
      data: {
        title: p.name,
        __cityProvince: true,
        provinceSlug: p.slug
      }
    });
  }

  return routes;
});
