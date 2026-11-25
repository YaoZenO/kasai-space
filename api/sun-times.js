'use strict';
// GET /api/sun-times —— 当地真实日出/日落（Phase 4A，2026-11-11）
//
// 【只读声明】本端点只读、无副作用、不返回任何请求头原始值；不写数据库、不写文件、
// 不调外部服务、不记录访问日志、不存储任何访客数据；访客 IP 不外发任何第三方。
// 无副作用只读自检端点，与 session-check.js 同款守卫（auth:false 让未登录访客可读）。
//
// 只读 Vercel 边缘已经解析好的地理请求头（x-vercel-ip-latitude / -longitude /
// -timezone），用标准天文公式（太阳中心 −0.833°，含大气折射修正）算当日日出日落。
// 天文公式出处（公开可核查）：
//   · NOAA Global Monitoring Laboratory, "Solar Calculation Details",
//     https://gml.noaa.gov/grad/solcalc/calcdetails.html
//   · Meeus, Jean. Astronomical Algorithms, 2nd ed., Willmann-Bell, 1998, ch. 25.
//   采用标准日出日落高度 h0 = −0.833°（含大气折射 34′ 与太阳视半径 16′），
//   不取民用暮光 −6°；极昼/极夜时 arccos 无解即视为不可用。
//
// 返回的全部是派生结果：
//   date    目标时区当日日期（YYYY-MM-DD），只用于缓存跨天语义
//   sunrise / sunset   UTC epoch 毫秒（绝对时刻，与客户端 Date.now() 同一基准）
//   fp      取整经纬度 + 时区偏移分钟的 sha1 前 8 位（仅用于判断「是否换地区」）
// 不下发 IP、原始请求头、完整精度经纬度明文、时区名、访问时间或任何身份/行踪数据。
//
// 本地开发读不到平台请求头、头缺失/非法、时区无效、极昼极夜（天文公式无解）
// 一律返回 { available: false }，前端据此干净降级到系统偏好（规范 §3.5 第 4 类）。
const crypto = require('node:crypto');
const { route } = require('./_lib/router');
const { handleSteam } = require('./_lib/steam');

const DEG = Math.PI / 180;
const DAY_MS = 86400000;
// 标准天文日出日落：太阳中心位于地平线下 0.833°（含大气折射），不是民用暮光 −6°。
const ZENITH = 90.833;

function rad(d) { return d * DEG; }
function deg(r) { return r / DEG; }
function norm360(x) { return ((x % 360) + 360) % 360; }

// NOAA Solar Calculator 的太阳几何：由儒略世纪数求太阳赤纬（度）与均时差（分钟）。
function solarGeometry(T) {
  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T)
    + Math.sin(rad(3 * M)) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const meanObliq = 23 + (26 + ((21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60)) / 60;
  const obliqCorr = meanObliq + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(obliqCorr)) * Math.sin(rad(appLong))));
  const y = Math.tan(rad(obliqCorr / 2)) ** 2;
  const eqTime = 4 * deg(
    y * Math.sin(2 * rad(L0))
    - 2 * e * Math.sin(rad(M))
    + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
    - 0.5 * y * y * Math.sin(4 * rad(L0))
    - 1.25 * e * e * Math.sin(2 * rad(M))
  );
  return { decl, eqTime };
}

// 目标时区在给定 UTC 时刻的偏移（分钟）。只取数值，不下发时区名明文。
function tzOffsetMinutes(now, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(now));
  } catch (err) {
    return null;
  }
  const pick = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : NaN;
  };
  const asUTC = Date.UTC(pick('year'), pick('month') - 1, pick('day'),
    pick('hour') % 24, pick('minute'), pick('second'));
  if (!Number.isFinite(asUTC)) return null;
  return Math.round((asUTC - now) / 60000);
}

// 目标时区当日日期（YYYY-MM-DD）。只下发派生日期，不下发时区名。
function localDate(now, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(now));
  } catch (err) {
    return null;
  }
  const pick = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? p.value : '';
  };
  const y = pick('year'), m = pick('month'), d = pick('day');
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) return null;
  return `${y}-${m}-${d}`;
}

// 算「目标时区当日」的日出/日落绝对 UTC 时刻。
// 基准取 date 对应的 UTC 日 00:00（NOAA 公式的 720 即 UTC 日正午）：无论东经还是
// 西经，目标时区当日 D 的太阳正午都落在 UTC 日 D 内，故 U = D 恒成立。 sunriseMin
// 允许为负（东经日出落在 UTC 前一日晚间），得到的是绝对 UTC 时刻，不是当地钟点。
// 客户端直接与 Date.now() 在同一基准比较（R-D），彻底避免「设备本地钟点裸比异地日出日落」。
function sunTimesUTC(date, lat, lon) {
  const [Y, M, D] = date.split('-').map(Number);
  const utcDayStart = Date.UTC(Y, M - 1, D);
  const julianDay = (utcDayStart + DAY_MS / 2) / DAY_MS + 2440587.5;
  const T = (julianDay - 2451545.0) / 36525;
  const { decl, eqTime } = solarGeometry(T);
  const cosH = (Math.cos(rad(ZENITH)) - Math.sin(rad(lat)) * Math.sin(rad(decl)))
    / (Math.cos(rad(lat)) * Math.cos(rad(decl)));
  // 极昼 / 极夜：时角无解，视为「日出日落不可用」，不得估算或硬编码冒充。
  if (!Number.isFinite(cosH) || cosH < -1 || cosH > 1) return null;
  const H = deg(Math.acos(cosH));
  const sunriseMin = 720 - 4 * (lon + H) - eqTime;
  const sunsetMin = 720 - 4 * (lon - H) - eqTime;
  const sunrise = utcDayStart + sunriseMin * 60000;
  const sunset = utcDayStart + sunsetMin * 60000;
  if (!Number.isFinite(sunrise) || !Number.isFinite(sunset)
    || sunset <= sunrise || sunset - sunrise > DAY_MS) return null;
  return { sunrise, sunset };
}

function header(req, name) {
  const v = req && req.headers ? req.headers[name] : '';
  return typeof v === 'string' ? v.trim() : '';
}

// 浏览器只上报一个整数：设备当前 UTC 偏移（分钟）。不下发时区名、IP、坐标或任何身份字段。
// 仅用于「网络出口时区与设备时区明显不一致（代理 / VPN / 漫游 / CDN 出口跨区）」时修正经度。
// 缺失或非法一律返回 null，保持原有「只读平台地理头」行为，向后兼容旧客户端。
function deviceTzOffset(req) {
  try {
    const raw = new URL(req && req.url ? req.url : '/', 'http://local').searchParams.get('tzoff');
    if (raw === null || !/^-?\d{1,4}$/.test(raw)) return null;
    const v = Number(raw);
    if (!Number.isInteger(v) || v < -720 || v > 840) return null;
    return v;
  } catch (err) {
    return null;
  }
}

module.exports = route(async ({ req, res }) => {
  try {
    const kind = new URL(req && req.url ? req.url : '/', 'http://local').searchParams.get('kind');
    if (kind === 'steam') {
      await handleSteam(res);
      return;
    }
  } catch { /* ignore malformed url */ }

  const latRaw = header(req, 'x-vercel-ip-latitude');
  const lonRaw = header(req, 'x-vercel-ip-longitude');
  const tz = header(req, 'x-vercel-ip-timezone');
  const lat = Number(latRaw), lon = Number(lonRaw);
  if (!latRaw || !lonRaw || !tz
    || !Number.isFinite(lat) || !Number.isFinite(lon)
    || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    // 本地开发无头 / 头缺失 / 头非法：干净降级，不猜位置、不估算时刻。
    return { available: false };
  }

  const now = Date.now();
  const off = tzOffsetMinutes(now, tz);
  const devOff = deviceTzOffset(req);
  // 出口 IP 时区与设备时区相差 > 90 分钟：平台地理头定位到的是代理出口，不是访客所在地。
  // 以设备时区中央经线（4 分钟 / 度）反推经度，纬度仍取平台头；当地日期一并按设备时区算。
  // 判定始终由端点返回 UTC 绝对时刻后与 Date.now() 比较，不拿设备本地钟点裸比。
  const mismatched = devOff !== null && off !== null && Math.abs(devOff - off) > 90;
  const effLon = mismatched ? devOff / 4 : lon;
  let date = localDate(now, tz);
  if (mismatched) date = new Date(now + devOff * 60000).toISOString().slice(0, 10);
  const times = date ? sunTimesUTC(date, lat, effLon) : null;
  if (off === null || !date || !times) return { available: false };

  // 坐标/时区指纹：取整派生值哈希，仅用于判断「是否换地区」；不下发原始值。
  // 校正生效时把 corrected 偏移计入指纹，避免同一地区在两种定位源间复用旧缓存。
  const quant = (v) => Math.round(v * 10) / 10;
  const fpOffset = mismatched ? devOff : off;
  const fp = crypto.createHash('sha1')
    .update(`${quant(lat)},${quant(effLon)},${fpOffset}`)
    .digest('hex').slice(0, 8);

  return {
    available: true,
    date,
    sunrise: Math.round(times.sunrise),
    sunset: Math.round(times.sunset),
    fp,
  };
}, { methods: ['GET'], body: false, origin: false, auth: false });
