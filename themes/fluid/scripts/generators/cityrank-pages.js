/* global hexo */

'use strict';

// 城市排行榜页面生成器：/cityrank/ 索引页 + /cityrank/<slug>/ 榜单页 + /city/<slug>/ 城市页。
// 数据来源：source/_data/cityrank.yml（榜单定义）+ source/_data/cities.yml（城市数据）。
// 无数据不生成任何页面（真实数据铁律，DESIGN-LANGUAGE §1 第 2 条）。
//
// 名次一律由 helper 现算（PRD §5.1 P0 铁律），这里只负责把结果挂到路由上。

const { buildCityRanks, cityHasPage, cityProvinces } = require('../helpers/cityrank-data.js');
// 省级小地图（2026-11-02）：路径数据由 tools/build-china-map-data.js 预生成为
// themes/fluid/data/china-provinces.json，这里只负责拼 SVG 与挂路由。
const { svgFor: mapSvgFor, fileNameOf: mapFileNameOf, aspectOf: mapAspectOf } = require('../helpers/china-map.js');

const fs = require('fs');
const path = require('path');

// 城市头图（2026-11-01）：source/img/cities/<slug>.jpg 存在且在 cityphotos.yml 登记
// 才下发到页头；两道闸都过才渲染，缺任一即不出图（无出处图与死链都不允许）。
// 文件检测必须在生成器（Node 侧，有 fs）做，模板里不做存在性判断。
//
// 2026-11-02：头图改为**按原比例完整显示、不裁切**，因此必须把真实像素尺寸交给模板
// 写进 img 的 width/height——固定写成 300×200 会让浏览器按 3:2 预留版面，
// 竖幅图加载后高度突变、正文整体下跳（CLS）。尺寸现读 JPEG 的 SOF 段，不引图像库。
function readJpegSize(file) {
  try {
    const b = fs.readFileSync(file);
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xFF) { i += 1; continue; }
      const m = b[i + 1];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  } catch (e) {
    /* 读不到尺寸就不写 width/height，CSS 仍按原比例排 */
  }
  return null;
}

function cityPhoto(slug, registry) {
  const entry = registry && registry[slug];
  if (!entry || !entry.credit) return null;
  const file = path.join(__dirname, '..', '..', '..', '..',
    'source', 'img', 'cities', slug + '.jpg');
  if (!fs.existsSync(file)) return null;
  const size = readJpegSize(file);
  return {
    src: '/img/cities/' + slug + '.jpg',
    credit: entry.credit,
    width: size ? size.w : null,
    height: size ? size.h : null
  };
}

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
  //
  // cityMap（2026-11-02）：本城所在省级行政区的小地图，一省一份 SVG，
  // 路由在本函数末尾统一输出；这里只记住哪些省真的要出图。
  const mapProvinces = new Set();
  // 主图宽高比：模板里的 <img width height> 只用于加载前占位，比例来自数据文件，
  // 免得改了取景又要来改模板里的魔数
  const mapAspect = mapAspectOf() || 1.6;
  const mapW = 800;
  const mapH = Math.round(mapW / mapAspect);
  for (const c of R.cities) {
    if (!cityHasPage(R, c)) continue;
    const mapFile = c.province ? mapFileNameOf(c.province) : null;
    if (mapFile) mapProvinces.add(c.province);
    routes.push({
      path: 'city/' + c.slug + '/index.html',
      layout: 'city',
      data: {
        title: c.name,
        __city: true,
        citySlug: c.slug,
        cityPhoto: cityPhoto(c.slug, data.cityphotos),
        cityMap: mapFile ? { src: '/' + mapFile, province: c.province, width: mapW, height: mapH } : null
      }
    });
  }

  // 省级小地图 SVG：只输出城市页真正引用到的省份，避免多写无人用的文件。
  for (const provName of mapProvinces) {
    const file = mapFileNameOf(provName);
    const svg = mapSvgFor(provName);
    if (!file || !svg) continue;
    routes.push({ path: file, data: svg });
  }

  // 省级聚合页（/city/province/<slug>/，2026-11-01 方向四）：
  // 省内城市 + 省内各榜 + 省内城市在全国榜的表现，全部由数据现算。
  // 省内没有可建页城市的省份不生成（helper 已过滤），这里只负责挂路由。
  for (const p of cityProvinces(R)) {
    // 2026-11-06（主人指出「上海市还要再点一下上海」）：只有一座城市的省级单位
    // （直辖市 / 特别行政区）不生成省页——页里只有一座城市，中间层没有信息价值，
    // 索引页的省份导航已直连该城市档案页。这类 URL 由 vercel.json 重定向到城市页，
    // 已收藏的旧链接不会断。
    if (p.total === 1 && p.pageCount === 1) continue;
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
