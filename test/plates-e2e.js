'use strict';
// 车牌字母编号探索页（/plates/）端到端验证。
// 数据来源：source/_data/plates.yml（转录自 GA 36-2018 附录 A 表 A.1）。
//
// 锁三层：
//   ① 数据自洽：31 个省级行政区、省会（首府）固定 A、code 单个大写字母、无 I、
//      直辖市全序列、多字母城市 / 共用代号锚点；
//   ② 与标准锚点一致：云南无 B、宁夏吴忠/固原同 C、佛山 E/X/Y、青岛 B/U 等；
//   ③ 产物落地：dist/plates/index.html 存在且非 0 字节、A–Z 字母带完整、
//      静态对照表行数与数据一致、脚本带 hash、CSS 段存在。
//
// 运行：node test/plates-e2e.js
// 前置：npm run astro:build（产物断言依赖 dist/）。dist/ 不存在时产物段 SKIP，
//       但 dist/ 存在而页面缺失一律判 FAIL——那说明构建真的漏了。

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, process.env.SITE_OUT || 'dist');

let pass = 0;
function ok(label, fn) {
  try {
    fn();
    pass += 1;
    console.log('  \u2713 ' + label);
  } catch (e) {
    console.log('  \u2717 ' + label);
    console.log('      ' + e.message);
    process.exitCode = 1;
  }
}

const raw = yaml.load(fs.readFileSync(path.join(ROOT, 'source', '_data', 'plates.yml'), 'utf8'));
const regions = Array.isArray(raw.regions) ? raw.regions : [];
const special = Array.isArray(raw.special) ? raw.special : [];
const rules = Array.isArray(raw.rules) ? raw.rules : [];
const updates = Array.isArray(raw.updates) ? raw.updates : [];
const stories = Array.isArray(raw.stories) ? raw.stories : [];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/* ---------------- ① 数据自洽 ---------------- */
console.log('\n[plates] 数据自洽');

ok('有 31 个省级行政区（23 省 + 5 自治区 + 4 直辖市）', () => {
  assert.strictEqual(regions.length, 31, 'regions 数量应为 31');
});

ok('直辖市恰好 4 个，且 codes 为 full', () => {
  const muni = regions.filter((r) => r.kind === 'municipality');
  assert.strictEqual(muni.length, 4, '直辖市应为 4 个');
  muni.forEach((r) => assert.strictEqual(r.codes, 'full', r.name + ' 的 codes 应为 full'));
});

ok('省 + 自治区合计 27 个', () => {
  const others = regions.filter((r) => r.kind !== 'municipality');
  assert.strictEqual(others.length, 27, '省/自治区应为 27 个');
});

ok('每个 region 有 key/name/abbr/kind', () => {
  regions.forEach((r) => {
    assert.ok(r.key, '缺 key');
    assert.ok(r.name, '缺 name');
    assert.ok(r.abbr, '缺 abbr');
    assert.ok(r.kind, '缺 kind');
  });
});

ok('每个省（非直辖市）的省会（首府）固定为 A', () => {
  regions.filter((r) => r.kind !== 'municipality').forEach((r) => {
    const hasA = (r.allocations || []).some((a) => a.code === 'A');
    assert.ok(hasA, r.name + ' 应有 A 代号');
  });
});

ok('code 均为单个大写字母，且不含 I', () => {
  regions.filter((r) => r.kind !== 'municipality').forEach((r) => {
    (r.allocations || []).forEach((a) => {
      assert.match(a.code, /^[A-Z]$/, r.name + ' 的 code 非法: ' + a.code);
      assert.notStrictEqual(a.code, 'I', r.name + ' 使用了 I');
    });
  });
});

ok('place 非空', () => {
  regions.filter((r) => r.kind !== 'municipality').forEach((r) => {
    (r.allocations || []).forEach((a) => {
      assert.ok(a.place && a.place.length > 0, r.name + ' 的 place 为空');
    });
  });
});

/* ---------------- ② 标准锚点（GA 36-2018 表 A.1） ---------------- */
console.log('\n[plates] 标准锚点');

function codesOf(abbr) {
  const r = regions.find((x) => x.abbr === abbr);
  return r ? (r.allocations || []).map((a) => a.code) : [];
}

ok('云南无 B（A 直接到 C）', () => {
  const c = codesOf('云');
  assert.ok(c.includes('A'), '云南应有 A');
  assert.ok(!c.includes('B'), '云南不应有 B');
  assert.ok(c.includes('C'), '云南应有 C');
});

ok('宁夏：宁 C 归吴忠，宁 D 归固原', () => {
  const r = regions.find((x) => x.abbr === '宁');
  const map = {};
  (r.allocations || []).forEach((a) => { map[a.place] = a.code; });
  assert.strictEqual(map['吴忠市'], 'C', '吴忠应为 C');
  assert.strictEqual(map['固原市'], 'D', '固原应为 D');
});

ok('佛山对应 E/X/Y 三个代号', () => {
  const r = regions.find((x) => x.abbr === '粤');
  const f = (r.allocations || []).filter((a) => a.place === '佛山市').map((a) => a.code).sort();
  assert.deepStrictEqual(f, ['E', 'X', 'Y']);
});

ok('青岛对应 B/U 两个代号', () => {
  const r = regions.find((x) => x.abbr === '鲁');
  const q = (r.allocations || []).filter((a) => a.place === '青岛市').map((a) => a.code).sort();
  assert.deepStrictEqual(q, ['B', 'U']);
});

ok('哈尔滨对应 A/L 两个代号', () => {
  const r = regions.find((x) => x.abbr === '黑');
  const h = (r.allocations || []).filter((a) => a.place === '哈尔滨市').map((a) => a.code).sort();
  assert.deepStrictEqual(h, ['A', 'L']);
});

ok('新疆伊犁对应 D/F 两个代号', () => {
  const r = regions.find((x) => x.abbr === '新');
  const y = (r.allocations || []).filter((a) => a.place === '伊犁哈萨克自治州').map((a) => a.code).sort();
  assert.deepStrictEqual(y, ['D', 'F']);
});

ok('特殊代号为 O / Z / W 三条', () => {
  const codes = special.map((s) => s.code).sort();
  assert.deepStrictEqual(codes, ['O', 'W', 'Z']);
});

/* ---------------- ②b 2018 年后变化（主人点名要的 豫 V） ---------------- */
console.log('\n[plates] 2018 年后变化');

function byAbbr(abbr, place) {
  const r = regions.find((x) => x.abbr === abbr);
  return (r ? r.allocations : []).filter((a) => a.place === place);
}

ok('郑州对应 A/V，且豫 V 标注 2020-09-16', () => {
  const rows = byAbbr('豫', '郑州市');
  assert.deepStrictEqual(rows.map((a) => a.code).sort(), ['A', 'V']);
  assert.strictEqual(rows.find((a) => a.code === 'V').since, '2020-09-16');
});

ok('苏州对应 E/U，且苏 U 标注 2019-01-05', () => {
  const rows = byAbbr('苏', '苏州市');
  assert.deepStrictEqual(rows.map((a) => a.code).sort(), ['E', 'U']);
  assert.strictEqual(rows.find((a) => a.code === 'U').since, '2019-01-05');
});

ok('西安对应 A/U，且陕 U 标注 2020-04-01', () => {
  const rows = byAbbr('陕', '西安市');
  assert.deepStrictEqual(rows.map((a) => a.code).sort(), ['A', 'U']);
  assert.strictEqual(rows.find((a) => a.code === 'U').since, '2020-04-01');
});

ok('武汉对应 A/W，且鄂 W 标注 2022-04-26', () => {
  const rows = byAbbr('鄂', '武汉市');
  assert.deepStrictEqual(rows.map((a) => a.code).sort(), ['A', 'W']);
  assert.strictEqual(rows.find((a) => a.code === 'W').since, '2022-04-26');
});

ok('济南对应 A/S（2019 年莱芜并入，鲁 S 归济南）', () => {
  assert.deepStrictEqual(byAbbr('鲁', '济南市').map((a) => a.code).sort(), ['A', 'S']);
  assert.strictEqual(byAbbr('鲁', '莱芜市').length, 0, '不应再有莱芜市');
});

ok('2018 年后更新条目为 7 条', () => {
  assert.strictEqual(updates.length, 7, 'updates 应为 7 条');
});

ok('字母故事为 5 条', () => {
  assert.strictEqual(stories.length, 5, 'stories 应为 5 条');
});

ok('编号规则为 7 条', () => {
  assert.strictEqual(rules.length, 7, 'rules 应为 7 条');
});

ok('覆盖港澳台之外的 31 个省级行政区（不含港澳台简称）', () => {
  // 31 个省级行政区 = 23 省 + 5 自治区 + 4 直辖市，不含香港/澳门/台湾
  const abbrs = regions.map((r) => r.abbr);
  assert.ok(!abbrs.includes('港'), '不应含港');
  assert.ok(!abbrs.includes('澳'), '不应含澳');
  assert.ok(!abbrs.includes('台'), '不应含台');
});

/* ---------------- ③ 产物落地 ---------------- */
console.log('\n[plates] 产物落地');

const pagePath = path.join(OUT, 'plates', 'index.html');
if (!fs.existsSync(OUT)) {
  console.log('  （dist/ 不存在，产物段 SKIP；请先 npm run astro:build）');
} else {
  ok('dist/plates/index.html 存在且非 0 字节', () => {
    assert.ok(fs.existsSync(pagePath), '页面缺失');
    assert.ok(fs.statSync(pagePath).size > 0, '页面为 0 字节');
  });

  if (fs.existsSync(pagePath)) {
    const html = fs.readFileSync(pagePath, 'utf8');

    ok('页面有且只有一个 h1', () => {
      const n = (html.match(/<h1\b/g) || []).length;
      assert.strictEqual(n, 1, 'h1 数量应为 1，实际 ' + n);
    });

    ok('canonical 指向 /plates/', () => {
      assert.ok(html.includes('canonical') && html.includes('/plates/'), 'canonical 缺失或错误');
    });

    ok('北京面板（首个）有恰好 26 个 A–Z 字母格', () => {
      // 所有省份面板都直出（hidden 隐藏），只统计第一个 panel（北京，全序列）的字母格
      const firstPanel = html.indexOf('plt-band-panel');
      const secondPanel = html.indexOf('plt-band-panel', firstPanel + 1);
      const seg = secondPanel > firstPanel ? html.slice(firstPanel, secondPanel) : html.slice(firstPanel);
      const letters = (seg.match(/class="plt-cell-letter">([A-Z])<\/span>/g) || []).length;
      assert.strictEqual(letters, 26, '北京面板应恰好 26 个字母，实际 ' + letters);
    });

    ok('直辖市字母带把 I / O 标为通用特殊位，不当作已分配', () => {
      assert.ok(
        html.includes('class="plt-cell plt-cell--special" title="I（通用特殊位）"'),
        'I 未标为通用特殊位'
      );
      assert.ok(
        html.includes('class="plt-cell plt-cell--special" title="O（通用特殊位）"'),
        'O 未标为通用特殊位'
      );
    });

    ok('静态对照表行数等于数据 allocation 总数', () => {
      const dataRows = regions.filter((r) => r.kind !== 'municipality')
        .reduce((n, r) => n + (r.allocations || []).length, 0);
      const rendered = (html.match(/class="plt-code"/g) || []).length;
      assert.strictEqual(rendered, dataRows, `对照表行 ${rendered} 应等于数据 ${dataRows}`);
    });

    ok('脚本引用带 8 位 hash', () => {
      assert.match(html, /\/js\/plates\.js\?v=[0-9a-f]{8}/, 'plates.js 引用缺 hash');
    });

    ok('dist/js/plates.js 存在且非空', () => {
      const js = path.join(OUT, 'js', 'plates.js');
      assert.ok(fs.existsSync(js), 'plates.js 缺失');
      assert.ok(fs.statSync(js).size > 0, 'plates.js 为空');
    });

    ok('含车牌结构示意（plt-plate）', () => {
      assert.ok(html.includes('plt-plate'), '车牌示意缺失');
      assert.ok(html.includes('发牌机关代号'), '发牌机关代号说明缺失');
    });

    ok('含排序规则解释与开封 / 绵阳例证', () => {
      assert.ok(html.includes('字母不是按城市大小排的'), '规则标题缺失');
      assert.ok(html.includes('开封'), '开封例证缺失');
      assert.ok(html.includes('绵阳'), '绵阳例证缺失');
      assert.ok(html.includes('1954'), '开封 1954 省会搬迁缺失');
    });

    ok('故事区覆盖 5 条并带原因', () => {
      ['云 B', '粤 E / X / Y', '豫 A / V', '川 A / G', '京 / 津 / 沪 / 渝'].forEach((s) =>
        assert.ok(html.includes(s), s + ' 故事缺失')
      );
      assert.ok(html.includes('plt-story-src'), '故事出处缺失');
    });

    ok('2018 年后更新表为 7 行', () => {
      const n = (html.match(/class="plt-upd-date"/g) || []).length;
      assert.strictEqual(n, 7, '更新表应为 7 行，实际 ' + n);
      assert.ok(html.includes('字母还在变'), '更新章节标题缺失');
    });

    ok('详表标注 2018 年后新增年份', () => {
      assert.ok(html.includes('plt-since'), '新增年份标签缺失');
    });

    ok('完整对照表折叠在 details 里', () => {
      assert.ok(html.includes('class="plt-appendix"'), '折叠表缺失');
    });
  }
}

console.log('\n[plates] 通过 ' + pass + ' 项断言');
if (process.exitCode) {
  console.log('[plates] 存在失败断言');
  process.exit(1);
}
