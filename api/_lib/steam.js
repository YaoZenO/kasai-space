'use strict';
// Steam 只读游玩时长与近两周在玩代理逻辑（由 api/sun-times.js?kind=steam 经 vercel.json /api/steam 重写复用，
// 以满足 Vercel Hobby 计划最多 12 个 Serverless Functions 的硬上限，见 E-193）。
//
// 环境变量（在 Vercel 项目设置里配置，绝不写入仓库、绝不下发给浏览器）：
//   STEAM_API_KEY   Steam Web API Key（https://steamcommunity.com/dev/apikey）
//   STEAM_ID        单个或多个 Steam 账号（逗号/分号/换行分隔），每项支持：
//                   · 17 位 SteamID64
//                   · 自定义个人资料后缀 / 完整 steamcommunity 链接
//                   · 可选自定义名称前缀：「大号:76561198xxx,小号:76561198yyy」
//   STEAM_ID_2      可选，方便单独追加第二个账号（会自动与 STEAM_ID 合并）
//   STEAM_IDS       可选，多账号列表别名（会自动与 STEAM_ID 合并）
//
// 隐私要求：每个账号的 Steam 个人资料「游戏详情」须设为公开，且不勾选「始终保密游戏总时间」。
// 缺失配置或上游异常一律返回 { available: false }，前端优雅降级。

const STEAM_API = 'https://api.steampowered.com';
const TIMEOUT_MS = 6000;
const MAX_ACCOUNTS = 4;

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

function parseAccountSpecs(...rawValues) {
  const specs = [];
  for (const raw of rawValues) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const parts = text.split(/[,;\r\n]+/);
    for (const part of parts) {
      const token = part.trim();
      if (!token) continue;
      let label = '';
      let target = token;
      // 支持「标签:账号」写法，跳过 http:// 或 https:// 链接里的冒号
      const colonIdx = token.indexOf(':');
      if (colonIdx > 0 && !/^https?:\/\//i.test(token)) {
        const prefix = token.slice(0, colonIdx).trim();
        const rest = token.slice(colonIdx + 1).trim();
        if (prefix && rest) {
          label = prefix;
          target = rest;
        }
      }
      const cleaned = normalizeInput(target);
      if (cleaned) specs.push({ label, rawId: cleaned });
      if (specs.length >= MAX_ACCOUNTS) return specs;
    }
  }
  return specs;
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

function buildView(ownedGames, recentGames, declaredCount) {
  let totalMins = 0;
  let recentMins = 0;
  const byApp = {};
  const ownedMap = new Map();
  const recentMap = new Map();

  for (const g of ownedGames || []) {
    const appid = Number(g && g.appid);
    if (!appid) continue;
    const mins = Number(g.playtime_forever) || 0;
    const mins2w = Number(g.playtime_2weeks) || 0;
    totalMins += mins;
    const prev = ownedMap.get(appid);
    if (prev) {
      prev.mins += mins;
      prev.mins2w += mins2w;
      if (!prev.name && g.name) prev.name = String(g.name);
    } else {
      ownedMap.set(appid, { appid, name: g.name ? String(g.name) : '', mins, mins2w });
    }
  }

  for (const g of recentGames || []) {
    const appid = Number(g && g.appid);
    if (!appid) continue;
    const mins = Number(g.playtime_forever) || 0;
    const mins2w = Number(g.playtime_2weeks) || 0;
    recentMins += mins2w;
    const prev = recentMap.get(appid);
    if (prev) {
      prev.mins += mins;
      prev.mins2w += mins2w;
      if (!prev.name && g.name) prev.name = String(g.name);
    } else {
      recentMap.set(appid, { appid, name: g.name ? String(g.name) : '', mins, mins2w });
    }
    if (!ownedMap.has(appid)) {
      ownedMap.set(appid, { appid, name: g.name ? String(g.name) : '', mins, mins2w });
    }
  }

  for (const [appid, rec] of ownedMap.entries()) {
    const r = recentMap.get(appid);
    byApp[String(appid)] = {
      hoursTotal: roundHours(rec.mins),
      hours2w: roundHours(r ? r.mins2w : rec.mins2w),
    };
  }

  const top = Array.from(ownedMap.values())
    .filter((g) => g.mins > 0 && g.name)
    .sort((a, b) => b.mins - a.mins)
    .slice(0, 12)
    .map((g) => ({
      appid: g.appid,
      name: g.name,
      hoursTotal: roundHours(g.mins),
      hours2w: roundHours(g.mins2w),
      img: headerImg(g.appid),
      url: `https://store.steampowered.com/app/${g.appid}/`,
    }));

  const recent = Array.from(recentMap.values())
    .filter((g) => g.name)
    .sort((a, b) => b.mins2w - a.mins2w || b.mins - a.mins)
    .slice(0, 6)
    .map((g) => ({
      appid: g.appid,
      name: g.name,
      hours2w: roundHours(g.mins2w),
      hoursTotal: roundHours(g.mins),
      img: headerImg(g.appid),
      url: `https://store.steampowered.com/app/${g.appid}/`,
    }));

  const uniqueOwnedCount = ownedMap.size;
  const totalGames = declaredCount && declaredCount > uniqueOwnedCount ? declaredCount : uniqueOwnedCount;

  return {
    summary: {
      totalGames,
      totalHours: Math.round(totalMins / 60),
      recentHours: roundHours(recentMins),
    },
    recent,
    top,
    byApp,
  };
}

function aggregateAccounts(accountPayloads) {
  const valid = (accountPayloads || []).filter(
    (a) => a && ((a.ownedGames && a.ownedGames.length) || (a.recentGames && a.recentGames.length))
  );
  if (!valid.length) return null;

  if (valid.length === 1) {
    const one = valid[0];
    const view = buildView(one.ownedGames, one.recentGames, one.declaredCount);
    return {
      available: true,
      summary: view.summary,
      recent: view.recent,
      top: view.top,
      byApp: view.byApp,
      accounts: [],
    };
  }

  const allOwned = [];
  const allRecent = [];
  const accounts = valid.map((acc, idx) => {
    allOwned.push(...(acc.ownedGames || []));
    allRecent.push(...(acc.recentGames || []));
    const view = buildView(acc.ownedGames, acc.recentGames, acc.declaredCount);
    return {
      key: `acc-${idx + 1}`,
      label: acc.label || `账号 ${idx + 1}`,
      summary: view.summary,
      recent: view.recent,
      top: view.top,
      byApp: view.byApp,
    };
  });

  // 多号合并时库内游戏总数按 appid 去重，不累加单号 declaredCount
  const merged = buildView(allOwned, allRecent, 0);
  return {
    available: true,
    summary: merged.summary,
    recent: merged.recent,
    top: merged.top,
    byApp: merged.byApp,
    accounts,
  };
}

function sendJson(res, obj, cacheControl) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.end(JSON.stringify(obj));
}

async function fetchPersonaNames(key, steamIds) {
  const map = {};
  if (!steamIds.length) return map;
  const url = `${STEAM_API}/ISteamUser/GetPlayerSummaries/v0002/?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(steamIds.join(','))}`;
  const data = await fetchJson(url);
  const players = (data && data.response && Array.isArray(data.response.players)) ? data.response.players : [];
  for (const p of players) {
    if (p && p.steamid && p.personaname) {
      map[String(p.steamid)] = String(p.personaname).trim();
    }
  }
  return map;
}

async function handleSteam(res) {
  const key = String(process.env.STEAM_API_KEY || '').trim();
  const specs = parseAccountSpecs(process.env.STEAM_ID, process.env.STEAM_ID_2, process.env.STEAM_IDS);
  const CACHE_OK = 'public, s-maxage=1800, stale-while-revalidate=3600';
  const CACHE_FALLBACK = 'public, s-maxage=60';

  if (!key || !specs.length) {
    sendJson(res, { available: false, reason: 'unconfigured' }, CACHE_FALLBACK);
    return;
  }

  const resolvedList = await Promise.all(
    specs.map(async (sp) => ({
      label: sp.label,
      steamId: await resolveSteamId64(key, sp.rawId),
    }))
  );

  // 去重同一个 SteamID64，避免重复配置导致时长翻倍
  const seen = new Set();
  const uniqueAccounts = [];
  for (const item of resolvedList) {
    if (!item.steamId || seen.has(item.steamId)) continue;
    seen.add(item.steamId);
    uniqueAccounts.push(item);
  }

  if (!uniqueAccounts.length) {
    sendJson(res, { available: false, reason: 'invalid_id' }, CACHE_FALLBACK);
    return;
  }

  const needPersona = uniqueAccounts.length > 1 && uniqueAccounts.some((a) => !a.label);
  const [personaMap, fetchedAccounts] = await Promise.all([
    needPersona ? fetchPersonaNames(key, uniqueAccounts.map((a) => a.steamId)) : Promise.resolve({}),
    Promise.all(
      uniqueAccounts.map(async (acc) => {
        const ownedUrl =
          `${STEAM_API}/IPlayerService/GetOwnedGames/v0001/?key=${encodeURIComponent(key)}` +
          `&steamid=${acc.steamId}&include_appinfo=1&include_played_free_games=1&format=json`;
        const recentUrl =
          `${STEAM_API}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${encodeURIComponent(key)}` +
          `&steamid=${acc.steamId}&count=6&format=json`;
        const [ownedData, recentData] = await Promise.all([fetchJson(ownedUrl), fetchJson(recentUrl)]);
        const ownedGames = (ownedData && ownedData.response && Array.isArray(ownedData.response.games))
          ? ownedData.response.games
          : [];
        const recentGames = (recentData && recentData.response && Array.isArray(recentData.response.games))
          ? recentData.response.games
          : [];
        return {
          steamId: acc.steamId,
          label: acc.label,
          ownedGames,
          recentGames,
          declaredCount: Number(ownedData?.response?.game_count) || 0,
        };
      })
    ),
  ]);

  const payloads = fetchedAccounts.map((acc, idx) => ({
    label: acc.label || personaMap[acc.steamId] || `账号 ${idx + 1}`,
    ownedGames: acc.ownedGames,
    recentGames: acc.recentGames,
    declaredCount: acc.declaredCount,
  }));

  const aggregated = aggregateAccounts(payloads);
  if (!aggregated) {
    sendJson(res, { available: false, reason: 'private_or_empty' }, CACHE_FALLBACK);
    return;
  }

  sendJson(res, aggregated, CACHE_OK);
}

module.exports = { handleSteam, parseAccountSpecs, aggregateAccounts };
