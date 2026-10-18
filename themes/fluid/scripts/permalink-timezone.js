/* global hexo */
// 构建时区兜底（IA-3，2026-10-18）
//
// 背景：Hexo 的 permalink（/年/月/日/标题/）用**构建机系统时区**格式化文章日期。
// Vercel 与 GitHub Actions 构建机默认 UTC，比北京时间慢 8 小时；凌晨 0:00–8:00
// 发布的文章，链接日期会比页面显示日期少一天（线上 /04/23 vs 页面 4 月 24 日）。
//
// Vercel 把 `TZ` 列为保留环境变量名，无法在 dashboard 设置，因此在此脚本里、
// 早于任何 post 处理的加载阶段把进程时区对齐到站点配置的 timezone。
// 效果：本地 / GitHub Actions / Vercel 三处构建出的文章链接完全一致。
//
// 注意：hello 阶段加载的脚本会在 hexo 初始化时执行（早于 processor / generator），
// 因此在这里设置 process.env.TZ 能覆盖后续所有日期格式化；Node 会在下次取本地
// 时间时重新读取该变量（已用 TZ=UTC 构建实测验证）。

'use strict';

const tz = (hexo.config && hexo.config.timezone) || 'Asia/Shanghai';
process.env.TZ = tz;
