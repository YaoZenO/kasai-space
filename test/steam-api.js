'use strict';
// Steam 只读代理接口、Vercel 12 函数上限与游戏页产物回归测试（E-192 / E-193 防复发）
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const handler = require('../api/sun-times.js');

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
    for (const sel of ['.gm-st-recent', '.gm-st-img', '.gm-st-row', '.gm-st-thumb', '.gm-st-bar', '.gm-d-btn']) {
      assert.ok(globalMatch[1].includes(sel), `<style is:global> 必须包含动态样式选择器 ${sel}`);
    }

    // 5. 游戏页产物结构检查（若已构建 dist/）
    const gamesHtmlPath = path.join(ROOT, 'dist', 'games', 'index.html');
    if (fs.existsSync(gamesHtmlPath)) {
      const html = fs.readFileSync(gamesHtmlPath, 'utf8');
      assert.ok(Buffer.byteLength(html, 'utf8') > 10000, 'dist/games/index.html should be non-empty');
      assert.ok(html.includes('id="gm-dialog"'), 'dist/games/index.html must include #gm-dialog');
      assert.ok(html.includes('id="gm-steam-section"'), 'dist/games/index.html must include #gm-steam-section');
      assert.match(html, /\/js\/games-steam\.js\?v=[0-9a-f]{8}/, 'games-steam.js must be stamped');
    }

    console.log(`steam-api: PASS (6 assertions, api/*.js=${topApiFiles.length}/12)`);
  } finally {
    if (prevKey !== undefined) process.env.STEAM_API_KEY = prevKey;
    if (prevId !== undefined) process.env.STEAM_ID = prevId;
  }
}

run().catch((err) => {
  console.error('steam-api: FAIL', err);
  process.exit(1);
});
