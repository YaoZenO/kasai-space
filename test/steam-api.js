'use strict';
// Steam 只读代理接口与游戏页产物回归测试（E-192 防复发）
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handler = require('../api/steam.js');

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
  delete process.env.STEAM_API_KEY;
  delete process.env.STEAM_ID;

  try {
    // 1. 未配置环境变量时：200 + { available: false, reason: 'unconfigured' } + 非 no-store 缓存头
    const res1 = makeRes();
    await handler({ method: 'GET', headers: {}, url: '/api/steam' }, res1);
    assert.equal(res1.statusCode, 200, 'GET /api/steam unconfigured should return 200');
    const data1 = JSON.parse(res1.body);
    assert.equal(data1.available, false, 'should degrade with available: false');
    assert.equal(data1.reason, 'unconfigured', 'reason should be unconfigured');
    assert.match(res1.headers['cache-control'] || '', /s-maxage=/, 'Cache-Control must not be overwritten by json() no-store');

    // 2. 非 GET 方法：405
    const res2 = makeRes();
    await handler({ method: 'POST', headers: {}, url: '/api/steam' }, res2);
    assert.equal(res2.statusCode, 405, 'POST /api/steam should return 405');

    // 3. 游戏页产物结构检查（若已构建 dist/）
    const gamesHtmlPath = path.join(__dirname, '..', 'dist', 'games', 'index.html');
    if (fs.existsSync(gamesHtmlPath)) {
      const html = fs.readFileSync(gamesHtmlPath, 'utf8');
      assert.ok(Buffer.byteLength(html, 'utf8') > 10000, 'dist/games/index.html should be non-empty');
      assert.ok(html.includes('id="gm-dialog"'), 'dist/games/index.html must include #gm-dialog');
      assert.ok(html.includes('id="gm-steam-section"'), 'dist/games/index.html must include #gm-steam-section');
      assert.match(html, /\/js\/games-steam\.js\?v=[0-9a-f]{8}/, 'games-steam.js must be stamped');
    }

    console.log('steam-api: PASS (3 assertions)');
  } finally {
    if (prevKey !== undefined) process.env.STEAM_API_KEY = prevKey;
    if (prevId !== undefined) process.env.STEAM_ID = prevId;
  }
}

run().catch((err) => {
  console.error('steam-api: FAIL', err);
  process.exit(1);
});
