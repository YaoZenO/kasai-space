'use strict';
// Steam 只读代理接口、Vercel 12 函数上限与游戏页产物回归测试（E-192 / E-193 防复发）
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const handler = require('../api/sun-times.js');
const { parseAccountSpecs, aggregateAccounts, applyHeaderOverrides } = require('../api/_lib/steam.js');

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    end(chunk) { this.body = String(chunk || ''); },
  };
}

async function run() {
  const prevKey = process.env.STEAM_API_KEY;
  const prevId = process.env.STEAM_ID;
  const prevId2 = process.env.STEAM_ID_2;
  const prevIds = process.env.STEAM_IDS;
  delete process.env.STEAM_API_KEY;
  delete process.env.STEAM_ID;
  delete process.env.STEAM_ID_2;
  delete process.env.STEAM_IDS;

  try {
    // 0. Vercel Hobby 计划硬上限：api/ 顶层函数文件不得超过 12 个（E-193）
    const topApiFiles = fs.readdirSync(path.join(ROOT, 'api'), { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.js'))
      .map((d) => d.name);
    assert.ok(
      topApiFiles.length <= 12,
      `api/ 顶层函数超 Vercel Hobby 12 个上限（当前 ${topApiFiles.length} 个）：${topApiFiles.join(', ')}`
    );

    // 1. vercel.json 必须将 /api/steam 重写到 /api/sun-times?kind=steam
    const vercelCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const rw = (vercelCfg.rewrites || []).find((r) => r.source === '/api/steam');
    assert.ok(rw && rw.destination === '/api/sun-times?kind=steam', 'vercel.json 缺少 /api/steam -> /api/sun-times?kind=steam rewrite');

    // 2. 未配置环境变量时：200 + { available: false, reason: 'unconfigured' } + 非 no-store 缓存头（E-192）
    const res1 = makeRes();
    await handler({ method: 'GET', headers: {}, url: '/api/sun-times?kind=steam' }, res1);
    assert.equal(res1.statusCode, 200, 'GET /api/steam unconfigured should return 200');
    const data1 = JSON.parse(res1.body);
    assert.equal(data1.available, false, 'should degrade with available: false');
    assert.equal(data1.reason, 'unconfigured', 'reason should be unconfigured');
    assert.match(res1.headers['cache-control'] || '', /s-maxage=/, 'Cache-Control must not be overwritten by json() no-store');

    // 3. 非 GET 方法：405
    const res2 = makeRes();
    await handler({ method: 'POST', headers: {}, url: '/api/sun-times?kind=steam' }, res2);
    assert.equal(res2.statusCode, 405, 'POST /api/steam should return 405');

    // 4. 动态注入节点样式必须在 <style is:global> 中，避免 Astro scoped CSS 失配（E-194）
    const gamesSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'games', 'index.astro'), 'utf8');
    const globalMatch = gamesSrc.match(/<style\s+is:global>([\s\S]*?)<\/style>/);
    assert.ok(globalMatch, 'src/pages/games/index.astro 必须包含 <style is:global> 承载动态 Steam 节点样式');
    for (const sel of ['.gm-st-recent', '.gm-st-img', '.gm-st-row', '.gm-st-thumb', '.gm-st-bar', '.gm-d-btn', '.gm-st-tab']) {
      assert.ok(globalMatch[1].includes(sel), `<style is:global> 必须包含动态样式选择器 ${sel}`);
    }

    // 5. 多账号配置解析与聚合（去重游戏数、时长相加、分号视图、不泄露 steamId）
    const specs = parseAccountSpecs(
      '大号:76561198000000001, https://steamcommunity.com/id/alt-user/',
      '小号:76561198000000002'
    );
    assert.equal(specs.length, 3, 'should parse comma-separated and secondary env accounts');
    assert.deepEqual(specs[0], { label: '大号', rawId: '76561198000000001' });
    assert.deepEqual(specs[1], { label: '', rawId: 'alt-user' });
    assert.deepEqual(specs[2], { label: '小号', rawId: '76561198000000002' });

    const agg = aggregateAccounts([
      {
        label: '大号',
        declaredCount: 2,
        ownedGames: [
          { appid: 730, name: 'CS2', playtime_forever: 6000, playtime_2weeks: 120 },
          { appid: 570, name: 'Dota 2', playtime_forever: 600, playtime_2weeks: 0 },
        ],
        recentGames: [
          { appid: 730, name: 'CS2', playtime_forever: 6000, playtime_2weeks: 120 },
        ],
      },
      {
        label: '小号',
        declaredCount: 2,
        ownedGames: [
          { appid: 730, name: 'CS2', playtime_forever: 3000, playtime_2weeks: 60 },
          { appid: 1245620, name: 'Elden Ring', playtime_forever: 1200, playtime_2weeks: 180 },
        ],
        recentGames: [
          { appid: 1245620, name: 'Elden Ring', playtime_forever: 1200, playtime_2weeks: 180 },
          { appid: 730, name: 'CS2', playtime_forever: 3000, playtime_2weeks: 60 },
        ],
      },
    ]);
    assert.equal(agg.available, true);
    assert.equal(agg.summary.totalGames, 3, 'merged totalGames must deduplicate shared appids');
    assert.equal(agg.summary.totalHours, 180, 'merged totalHours must sum both accounts');
    assert.equal(agg.summary.recentHours, 6, 'merged recentHours must sum both accounts');
    assert.equal(agg.byApp['730'].hoursTotal, 150, 'shared appid hours must sum across accounts');
    assert.equal(agg.byApp['730'].hours2w, 3, 'shared appid 2w hours must sum across accounts');
    assert.equal(agg.accounts.length, 2, 'multi-account response must expose per-account views');
    assert.equal(agg.accounts[0].key, 'acc-1');
    assert.equal(agg.accounts[0].label, '大号');
    assert.equal(agg.accounts[1].byApp['730'].hoursTotal, 50);
    assert.ok(!JSON.stringify(agg).includes('76561198'), 'response must not leak raw steamId64');

    // 单号向后兼容：accounts 为空数组，不展示切换条
    const single = aggregateAccounts([
      {
        label: '主号',
        declaredCount: 5,
        ownedGames: [{ appid: 730, name: 'CS2', playtime_forever: 600 }],
        recentGames: [],
      },
    ]);
    assert.equal(single.accounts.length, 0, 'single account should keep accounts empty');
    assert.equal(single.summary.totalGames, 5, 'single account preserves declaredCount');

    // 5b. E-201 防复发：批量商店接口刷新带内容哈希的最新封面，避免旧无哈希 /header.jpg 停留在历史封面
    const steamLibSrc = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'steam.js'), 'utf8');
    assert.ok(
      steamLibSrc.includes('IStoreBrowseService/GetItems/v1'),
      'api/_lib/steam.js 必须通过 IStoreBrowseService/GetItems/v1 获取最新带哈希封面（E-201）'
    );
    const freshUrl = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/abc123/header.jpg?t=1';
    applyHeaderOverrides(agg, { '730': freshUrl });
    assert.equal(agg.top.find((g) => g.appid === 730).img, freshUrl, 'merged top header must use fresh hashed URL');
    assert.equal(agg.recent.find((g) => g.appid === 730).img, freshUrl, 'merged recent header must use fresh hashed URL');
    assert.equal(agg.accounts[0].top.find((g) => g.appid === 730).img, freshUrl, 'per-account header must use fresh hashed URL');

    // 6. 游戏页产物结构检查（若已构建 dist/）
    const gamesHtmlPath = path.join(ROOT, 'dist', 'games', 'index.html');
    if (fs.existsSync(gamesHtmlPath)) {
      const html = fs.readFileSync(gamesHtmlPath, 'utf8');
      assert.ok(Buffer.byteLength(html, 'utf8') > 10000, 'dist/games/index.html should be non-empty');
      assert.ok(html.includes('id="gm-dialog"'), 'dist/games/index.html must include #gm-dialog');
      assert.ok(html.includes('id="gm-steam-section"'), 'dist/games/index.html must include #gm-steam-section');
      assert.ok(html.includes('id="gm-steam-tabs"'), 'dist/games/index.html must include #gm-steam-tabs');
      assert.match(html, /\/js\/games-steam\.js\?v=[0-9a-f]{8}/, 'games-steam.js must be stamped');
    }

    console.log(`steam-api: PASS (8 assertions, api/*.js=${topApiFiles.length}/12)`);
  } finally {
    if (prevKey !== undefined) process.env.STEAM_API_KEY = prevKey;
    if (prevId !== undefined) process.env.STEAM_ID = prevId;
    if (prevId2 !== undefined) process.env.STEAM_ID_2 = prevId2;
    if (prevIds !== undefined) process.env.STEAM_IDS = prevIds;
  }
}

run().catch((err) => {
  console.error('steam-api: FAIL', err);
  process.exit(1);
});
