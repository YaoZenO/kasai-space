'use strict';
// Steam 只读游玩时长与近两周在玩代理逻辑（由 api/sun-times.js?kind=steam 经 vercel.json /api/steam 重写复用，
// 以满足 Vercel Hobby 计划最多 12 个 Serverless Functions 的硬上限，见 E-193）。
//
// 环境变量（在 Vercel 项目设置里配置，绝不写入仓库、绝不下发给浏览器）：
//   STEAM_API_KEY   Steam Web API Key（https://steamcommunity.com/dev/apikey）
//   STEAM_ID        17 位 SteamID64，或自定义个人资料后缀 / 完整 steamcommunity 链接
//                   （非 17 位数字时自动调用 ResolveVanityURL 解析）
//
// 隐私要求：Steam 个人资料「游戏详情」须设为公开，且不勾选「始终保密游戏总时间」。
// 缺失配置或上游异常一律返回 { available: false }，前端优雅降级。

const STEAM_API = 'https://api.steampowered.com';
const TIMEOUT_MS = 6000;

async function fetchJson(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const mProf = /steamcommunity\.com\/profiles\/(\d{17})/i.exec(s);
  if (mProf) return mProf[1];
  const mId = /steamcommunity\.com\/id\/([^/?#]+)/i.exec(s);
  if (mId) return mId[1];
  return s.replace(/^\/+|\/+$/g, '');
}

async function resolveSteamId64(key, rawId) {
  const cleaned = normalizeInput(rawId);
  if (!cleaned) return null;
  if (/^\d{17}$/.test(cleaned)) return cleaned;

  const url = `${STEAM_API}/ISteamUser/ResolveVanityURL/v0001/?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(cleaned)}`;
  const data = await fetchJson(url);
  if (data && data.response && data.response.success === 1 && /^\d{17}$/.test(String(data.response.steamid || ''))) {
    return String(data.response.steamid);
  }
  return null;
}

function headerImg(appid) {
  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
}

function roundHours(mins) {
  return Math.round(((Number(mins) || 0) / 60) * 10) / 10;
}

function sendJson(res, obj, cacheControl) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.end(JSON.stringify(obj));
}

async function handleSteam(res) {
  const key = String(process.env.STEAM_API_KEY || '').trim();
  const rawId = String(process.env.STEAM_ID || '').trim();
  const CACHE_OK = 'public, s-maxage=1800, stale-while-revalidate=3600';
  const CACHE_FALLBACK = 'public, s-maxage=60';

  if (!key || !rawId) {
    sendJson(res, { available: false, reason: 'unconfigured' }, CACHE_FALLBACK);
    return;
  }

  const steamId = await resolveSteamId64(key, rawId);
  if (!steamId) {
    sendJson(res, { available: false, reason: 'invalid_id' }, CACHE_FALLBACK);
    return;
  }

  const ownedUrl =
    `${STEAM_API}/IPlayerService/GetOwnedGames/v0001/?key=${encodeURIComponent(key)}` +
    `&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`;
  const recentUrl =
    `${STEAM_API}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${encodeURIComponent(key)}` +
    `&steamid=${steamId}&count=6&format=json`;

  const [ownedData, recentData] = await Promise.all([fetchJson(ownedUrl), fetchJson(recentUrl)]);
  const ownedGames = (ownedData && ownedData.response && Array.isArray(ownedData.response.games))
    ? ownedData.response.games
    : [];
  const recentGames = (recentData && recentData.response && Array.isArray(recentData.response.games))
    ? recentData.response.games
    : [];

  if (!ownedGames.length && !recentGames.length) {
    sendJson(res, { available: false, reason: 'private_or_empty' }, CACHE_FALLBACK);
    return;
  }

  let totalMins = 0;
  let recentMins = 0;
  const byApp = {};

  for (const g of ownedGames) {
    const mins = Number(g.playtime_forever) || 0;
    const mins2w = Number(g.playtime_2weeks) || 0;
    totalMins += mins;
    byApp[String(g.appid)] = {
      hoursTotal: roundHours(mins),
      hours2w: roundHours(mins2w),
    };
  }

  for (const g of recentGames) {
    const mins2w = Number(g.playtime_2weeks) || 0;
    const mins = Number(g.playtime_forever) || 0;
    recentMins += mins2w;
    byApp[String(g.appid)] = {
      hoursTotal: roundHours(mins),
      hours2w: roundHours(mins2w),
    };
  }

  const top = ownedGames
    .filter((g) => (Number(g.playtime_forever) || 0) > 0 && g.name)
    .sort((a, b) => (Number(b.playtime_forever) || 0) - (Number(a.playtime_forever) || 0))
    .slice(0, 12)
    .map((g) => ({
      appid: g.appid,
      name: String(g.name),
      hoursTotal: roundHours(g.playtime_forever),
      hours2w: roundHours(g.playtime_2weeks),
      img: headerImg(g.appid),
      url: `https://store.steampowered.com/app/${g.appid}/`,
    }));

  const recent = recentGames
    .filter((g) => g.name)
    .map((g) => ({
      appid: g.appid,
      name: String(g.name),
      hours2w: roundHours(g.playtime_2weeks),
      hoursTotal: roundHours(g.playtime_forever),
      img: headerImg(g.appid),
      url: `https://store.steampowered.com/app/${g.appid}/`,
    }));

  sendJson(res, {
    available: true,
    summary: {
      totalGames: ownedData?.response?.game_count || ownedGames.length,
      totalHours: Math.round(totalMins / 60),
      recentHours: roundHours(recentMins),
    },
    recent,
    top,
    byApp,
  }, CACHE_OK);
}

module.exports = { handleSteam };
