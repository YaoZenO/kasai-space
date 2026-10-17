/* global hexo */
// 前台「模块条目日期」统一格式化（E-028）。
//
// 背景：source/_data/*.yml 里写成 2026-10-18 的日期，被 js-yaml 解析成 Date 对象，
// EJS 的 <%= %> 对 Date 调用 toString()，页面上就显示
// 「Sun Oct 18 2026 00:00:00 GMT+0000 (Coordinated Universal Time)」。
// 期望展示的是「2026-10-18」。这里给模板一个 helper 统一处理，禁止模板再直出 Date。
//
// 用法：
//   <%= fmtItemDate(it.date) %>                     → 2026-10-18
//   <%= fmtItemDate(it.date, 'YYYY-MM-DD HH:mm') %> → 自定义格式
//
// 规则（按优先级）：
//   1. 空值 / 非法值 → ''（模板用 if (it.date) 兜底，这里再兜一次）
//   2. 纯日期字符串 YYYY-MM-DD → 原样返回（没有时区成分，不存在偏移问题）
//   3. Date 对象 / 毫秒时间戳（数字或数字串）→ 按站点配置时区取「年-月-日」
//   4. 带时区的 ISO 串 → 同上
//   5. 其它（人写的格式化文本）→ 原样透传，不猜测
//
// 时间戳是必要的：首页「近期动态」的聚合排序用 date.valueOf() 存毫秒数，
// 直接交给 helper 必须能还原成日期，否则会原样输出 1792281600000 这种裸数字。
//
// 位置约束：必须放在 themes/fluid/scripts/ 下——hexo server 预览也会加载主题脚本；
// 放到项目根 scripts/ 则只在 hexo generate 时加载，预览会报 helper 未定义。
// 且必须自包含：Hexo 用 vm 逐个执行 scripts/ 下的文件，子目录里的文件同样是
// 被当作独立脚本执行而非被 require 的模块，跨文件 require 会解析失败。

'use strict';

const moment = require('moment-timezone');

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ALL_DIGITS_RE = /^\d+$/;
const DEFAULT_FORMAT = 'YYYY-MM-DD';

hexo.extend.helper.register('fmtItemDate', function (value, format) {
  const fmt = format || DEFAULT_FORMAT;
  if (value == null || value === '') return '';
  let m;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    m = moment(value);
  } else if (typeof value === 'number') {
    // 毫秒时间戳（首页动态聚合用 date.valueOf()）
    if (!isFinite(value)) return '';
    m = moment(value);
  } else {
    const s = String(value).trim();
    if (!s) return '';
    if (DATE_ONLY_RE.test(s)) return s;
    if (ALL_DIGITS_RE.test(s)) {
      m = moment(Number(s));
    } else if (ISO_RE.test(s)) {
      m = moment(s);
    } else {
      return s; // 人写的格式化文本，原样透传
    }
  }
  if (!m.isValid()) return '';
  // this.config 是站点配置（_config.yml），与 Hexo 内置 date() helper 同源
  const tz = this && this.config && this.config.timezone;
  if (tz) m = m.tz(tz);
  return m.format(fmt);
});
