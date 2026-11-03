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

// 取景：省域包围盒与断续线包围盒的并集，一幅画到底（2026-11-04 主人改判）。
//
// 曾试过「主图裁到海南以南 + 右下角插图单列南海诸岛」的纸图版面——那是印刷品为了
// 省纸面的折衷，放在网页上反而像把南海切下去另装了一格：读者看到的是「右下角多了
// 个框」，不是「这是同一张图」。现在恢复完整取景：3°N 到 54°N 全在框内，断续线
// 与大陆同框，省域的方位关系一眼可读。
// 代价是纵向多出约 200px 的南海海面——这是完整性必须付的成本，不再用插图回避。
const FRAME_PAD = 0.5;

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
      // 中心点：港澳这类面积过小的省级单位，填色在图上只有几个像素，
      // 需要用它挂一条指引线把小名字标出来（见 helpers/china-map.js）
      let cx = null;
      let cy = null;
      const c = props.center || props.centroid;
      if (Array.isArray(c) && c.length === 2) {
        cx = Math.round(c[0] * MID_LAT_COS * 100) / 100;
        cy = Math.round(-c[1] * 100) / 100;
      }
      provinces.push({
        adcode,
        name: props.name || adcode,
        cx,
        cy,
        d,
        // 投影后的外接尺寸：模板据此判断「这块填色是不是只有几个像素」，
        // 决定要不要补一条指引线 + 名字。写死名单会在换数据时悄悄失效。
        bw: Math.round((bbox.maxX - bbox.minX) * 100) / 100,
        bh: Math.round((bbox.maxY - bbox.minY) * 100) / 100
      });
      track(provBounds, bbox.minX, bbox.minY);
      track(provBounds, bbox.maxX, bbox.maxY);
    }
  }

  const num = (n) => Math.round(n * 100) / 100;

  // 单幅取景：省域 ∪ 断续线，四周留同样的白。
  // 左右不再额外加宽——插图撤掉后右侧不需要留它的位置了。
  const minX = Math.min(provBounds.minX, nineBounds.minX) - FRAME_PAD;
  const minY = Math.min(provBounds.minY, nineBounds.minY) - FRAME_PAD;
  const maxX = Math.max(provBounds.maxX, nineBounds.maxX) + FRAME_PAD;
  const maxY = Math.max(provBounds.maxY, nineBounds.maxY) + FRAME_PAD;
  const mainX = num(minX);
  const mainY = num(minY);
  const mainW = num(maxX - mainX);
  const mainH = num(maxY - mainY);

  const out = {
    source: SOURCE_URL,
    fetched: '2026-11-02',
    projection: '等距圆柱 + 中纬度余弦压缩（x = lon·cos30°, y = −lat），仅投影与抽稀，未改动边界',
    tolerance: TOLERANCE,
    main: { viewBox: [mainX, mainY, mainW, mainH].join(' '), aspect: num(mainW / mainH) },
    // 断续线的包围盒（minX minY maxX maxY）：留给测试断言「取景盖住了整条线」，
    // 否则哪天取景窗改小了，画出来的断续线会断头，而页面上只表现为「图有点怪」
    nineBox: [num(nineBounds.minX), num(nineBounds.minY), num(nineBounds.maxX), num(nineBounds.maxY)],
    provinces: provinces.map((p) => ({ adcode: p.adcode, name: p.name, cx: p.cx, cy: p.cy, bw: p.bw, bh: p.bh, d: p.d })),
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
  console.log('输出：', OUT, (bytes / 1024).toFixed(0) + 'KB');

  // 取景自检：单幅地图必须同时容下所有省域与整条断续线。少容一条断续线，
  // 页面上只表现为「图有点怪」，肉眼很难判定是取景窗小了还是路径画错了。
  const over = [];
  if (!(mainH > 0)) over.push('主图高度不为正');
  const [nx0, ny0, nx1, ny1] = [nineBounds.minX, nineBounds.minY, nineBounds.maxX, nineBounds.maxY];
  if (nx0 < mainX || ny0 < mainY || nx1 > mainX + mainW || ny1 > mainY + mainH) {
    over.push('取景窗没盖住整条南海断续线：窗 ' + out.main.viewBox + '，线 ' + out.nineBox.join(' '));
  }
  if (provBounds.minX < mainX || provBounds.minY < mainY ||
      provBounds.maxX > mainX + mainW || provBounds.maxY > mainY + mainH) {
    over.push('取景窗没盖住全部省域');
  }
  if (over.length) {
    console.error('!! 取景自检失败：\n  ' + over.join('\n  '));
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
