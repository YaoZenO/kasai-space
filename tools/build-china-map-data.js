#!/usr/bin/env node
/**
 * 生成省级边界路径数据：themes/fluid/data/china-provinces.json
 *
 * 用途：城市档案页的「在中国的方位」小地图（构建期静态 SVG，无运行时地图 SDK）。
 *
 * 数据来源（2026-11-02 获取）：
 *   DataV.GeoAtlas 全国省级边界 https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
 *   含 34 个省级行政区（含台湾省、香港、澳门）与 adcode=100000_JD 的南海断续线要素。
 *
 * 合规纪律（不可改）：
 *   1) 只做投影与抽稀，**不改动任何边界**——不合并、不补点、不删省级单位；
 *   2) 每个省级区划无条件保留面积最大的主体多边形（澳门仅 33 km²，按面积阈值过滤会
 *      整块消失，等于在地图上抹掉一个省级行政区）；
 *   3) 南海断续线（adcode 100000_JD）全部保留，不参与面积过滤与抽稀放大。
 *
 * 用法：node tools/build-china-map-data.js [本地 geojson 路径]
 *   不带参数时从上面的 URL 现取（需要网络）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';
const OUT = path.join(__dirname, '..', 'themes', 'fluid', 'data', 'china-provinces.json');

// 抽稀容差（度）。0.05 度约 5 km，在 800px 宽的地图上不足 1px，肉眼不可辨。
const TOLERANCE = 0.05;
// 小岛保留阈值（平方度）。主体多边形不受此限。
const MIN_RING_AREA = 0.005;
// 经度压缩比：按中纬度取余弦，避免等距投影把中国画得过胖
const MID_LAT_COS = Math.cos((30 * Math.PI) / 180);

// 主图下边界（投影后的 y，-纬度）。取海南岛南端（18.15°N）略南一点。
//
// 为什么要把主图裁到海南以南：全国从 53.5°N 一路到 3.4°N，其中 7～18°N 这一段
// 只有南海断续线和几个礁点，纵向却占掉整幅图的四成——主图直接铺满会让下半张
// 全是空白，读起来像「地图只画了一半」。中国地图的通行做法是主图裁到大陆＋海南，
// 再在右下角用带边框的插图单列南海诸岛，断续线完整画在插图里。
const MAIN_SOUTH_Y = -18.4;

function perpDist(p, a, b) {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const tc = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + tc * dx), y - (y1 + tc * dy));
}

function simplify(points, tol) {
  if (points.length <= 2) return points;
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > tol) {
    const left = simplify(points.slice(0, idx + 1), tol);
    const right = simplify(points.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

function ringsOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') return geom.coordinates.reduce((a, p) => a.concat(p), []);
  return [];
}

function ringArea(ring) {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

async function loadGeo(localPath) {
  if (localPath) return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('拉取边界数据失败：HTTP ' + res.status);
  return res.json();
}

(async () => {
  const geo = await loadGeo(process.argv[2]);
  const provinces = [];
  let nineDash = '';

  // 省域与断续线分开统计包围盒：主图只按省域裁，插图只按断续线（+台湾）取景。
  const newBounds = () => ({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const provBounds = newBounds();
  const nineBounds = newBounds();
  const track = (b, x, y) => {
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y;
    if (y > b.maxY) b.maxY = y;
  };

  for (const f of geo.features || []) {
    const props = f.properties || {};
    const adcode = String(props.adcode || '');
    const isNine = adcode === '100000_JD';
    const rings = ringsOf(f.geometry);
    const projected = rings.map((ring) =>
      ring.map(([lon, lat]) => [lon * MID_LAT_COS, -lat])
    );

    let mainIdx = -1;
    let mainArea = -1;
    rings.forEach((r, i) => {
      const a = ringArea(r);
      if (a > mainArea) {
        mainArea = a;
        mainIdx = i;
      }
    });

    const bbox = newBounds();
    let d = '';
    projected.forEach((pts, ri) => {
      if (!isNine && ri !== mainIdx && ringArea(rings[ri]) < MIN_RING_AREA) return;
      const simp = simplify(pts, isNine ? TOLERANCE / 4 : TOLERANCE)
        .map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
      if (simp.length < 2) return;
      simp.forEach(([x, y]) => track(bbox, x, y));
      // 坐标对之间必须有分隔空格：写成 x+' '+y 再 join('') 会把两组数字粘成
      // 「-40.58101.77」这种非法数值，SVG 解析失败、渲染成一堆横线（踩过）
      d += 'M' + simp.map(([x, y]) => x + ' ' + y).join(' ') + (isNine ? '' : 'Z');
    });

    if (isNine) {
      nineDash = d;
      track(nineBounds, bbox.minX, bbox.minY);
      track(nineBounds, bbox.maxX, bbox.maxY);
    } else {
      // 中心点：直辖市与港澳面积太小，单靠填色在图上只有针尖大小，
      // 必须再用一个定位标记指出来，否则读者找不到「我在哪」
      let cx = null;
      let cy = null;
      const c = props.center || props.centroid;
      if (Array.isArray(c) && c.length === 2) {
        cx = Math.round(c[0] * MID_LAT_COS * 100) / 100;
        cy = Math.round(-c[1] * 100) / 100;
      }
      provinces.push({ adcode, name: props.name || adcode, cx, cy, d, bbox });
      track(provBounds, bbox.minX, bbox.minY);
      track(provBounds, bbox.maxX, bbox.maxY);
    }
  }

  const num = (n) => Math.round(n * 100) / 100;

  // 主图：取省域包围盒。左右留白不对称——左边是新疆（本身顶到边），右边要留出
  // 南海诸岛插图的位置（插图压在东海一侧的空白海面上），所以右侧多放 3 个单位。
  const pad = 0.4;
  const rightPad = 3.0;
  const mainX = num(provBounds.minX - pad);
  const mainY = num(provBounds.minY - pad);
  const mainW = num(provBounds.maxX + rightPad - mainX);
  const mainH = num(MAIN_SOUTH_Y - mainY);

  // 插图：南海诸岛取景。上边缘要带上台湾（断续线北端与台湾同纬度带，
  // 只按断续线取景会把台湾切掉一半，插图里的海岸线就断了）。
  const taiwan = provinces.find((p) => /^台湾/.test(p.name));
  const ipad = 0.7;
  const insetTop = Math.min(nineBounds.minY, taiwan ? taiwan.bbox.minY : nineBounds.minY) - 0.5;
  const insX0 = num(nineBounds.minX - ipad);
  const insY0 = num(insetTop);
  const insW0 = num(nineBounds.maxX + ipad - insX0);
  const insH0 = num(nineBounds.maxY + ipad - insY0);

  // 插图在主图里的落位：右下角贴边，宽度取主图的 17.5%（纸图上南海诸岛插图的常规档位），
  // 高度按插图自身长宽比推出；左边必须离大陆东岸足够远，否则上海这类贴海的城市，
  // 定位圆环会和小图挤在一起（第一版就是这样，圆环几乎贴着插图边框）。
  const boxW = num(mainW * 0.175);
  const boxH = num(boxW * (insH0 / insW0));
  const inset = {
    viewBox: [insX0, insY0, insW0, insH0].join(' '),
    x: num(mainX + mainW - 0.5 - boxW),
    y: num(mainY + mainH - 0.7 - boxH),
    width: boxW,
    height: boxH
  };

  const out = {
    source: SOURCE_URL,
    fetched: '2026-11-02',
    projection: '等距圆柱 + 中纬度余弦压缩（x = lon·cos30°, y = −lat），仅投影与抽稀，未改动边界',
    tolerance: TOLERANCE,
    main: { viewBox: [mainX, mainY, mainW, mainH].join(' '), aspect: num(mainW / mainH) },
    inset,
    // 断续线的包围盒（minX minY maxX maxY）：留给测试断言「插图取景盖住了整条线」，
    // 否则哪天取景窗改小了，画出来的断续线会断头，而页面上只表现为「图有点怪」
    nineBox: [num(nineBounds.minX), num(nineBounds.minY), num(nineBounds.maxX), num(nineBounds.maxY)],
    provinces: provinces.map((p) => ({ adcode: p.adcode, name: p.name, cx: p.cx, cy: p.cy, d: p.d })),
    nineDash
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));

  // 路径语法自检（E-094）：坐标对之间漏掉分隔空格时，两组数字会粘成
  // 「-40.58101.77」这种非法数值，浏览器不报错、只画出一堆横线。
  // 校验按命令字母切分：'ZM' 这种命令连写是合法的，不能当成粘连误报；
  // 只检查每个命令的参数串是否为成对的合法数字。
  const badPaths = [];
  const checkD = (d, label) => {
    const s = String(d || '');
    if (!s) return badPaths.push(label + '（空路径）');
    const segs = s.match(/[A-Za-z][^A-Za-z]*/g) || [];
    for (const seg of segs) {
      const cmd = seg[0];
      const args = seg.slice(1).trim();
      if (cmd === 'Z' || cmd === 'z') {
        if (args) return badPaths.push(label + '（闭合命令带参数）');
        continue;
      }
      if (!args) return badPaths.push(label + '（命令缺参数）');
      const toks = args.split(/\s+/);
      const bad = toks.find((t) => !/^-?\d+(\.\d+)?$/.test(t));
      if (bad) return badPaths.push(label + '（非法数值 ' + bad + '）');
      if (toks.length % 2 !== 0) return badPaths.push(label + '（坐标不成对）');
    }
  };
  provinces.forEach((p) => checkD(p.d, p.name));
  if (nineDash) checkD(nineDash, '南海断续线');

  const bytes = Buffer.byteLength(JSON.stringify(out));
  console.log('省级单位：', provinces.length, '（应为 34）');
  console.log('九段线 path 长度：', nineDash.length);
  console.log('主图 viewBox：', out.main.viewBox, '（比高', out.main.aspect, '）');
  console.log('插图 viewBox：', inset.viewBox, '落位', inset.x, inset.y, inset.width, inset.height);
  console.log('输出：', OUT, (bytes / 1024).toFixed(0) + 'KB');

  // 版面自检：插图必须完整落在主图里，否则会被外层 viewBox 裁掉一角，
  // 南海诸岛少一块 —— 这类错误在页面上只表现为「图有点怪」，肉眼很难判定。
  const over = [];
  if (!(mainH > 0)) over.push('主图高度不为正（MAIN_SOUTH_Y 与省域包围盒冲突）');
  if (inset.x < mainX || inset.y < mainY) over.push('插图越出主图左上边界');
  if (inset.x + inset.width > mainX + mainW + 0.001) over.push('插图越出主图右边界');
  if (inset.y + inset.height > mainY + mainH + 0.001) over.push('插图越出主图下边界');
  if (!(inset.width > 4 && inset.height > 6)) over.push('插图尺寸过小，看不清南海诸岛');
  if (over.length) {
    console.error('!! 版面自检失败：\n  ' + over.join('\n  '));
    process.exitCode = 1;
  }
  if (badPaths.length) {
    console.error('!! 路径语法不合法（渲染会出错）：\n  ' + badPaths.slice(0, 8).join('\n  '));
    process.exitCode = 1;
  }
  const missing = provinces.filter((p) => !p.d).map((p) => p.name);
  if (missing.length) {
    console.error('!! 这些省级单位没有路径：', missing.join('、'));
    process.exitCode = 1;
  }
})();
