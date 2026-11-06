// 站点配置与主题配置（构建期从 YAML 读取，模块级缓存）
//
// 注意：js-yaml 会把无引号的 `2026-10-18` 解析成 Date 对象（E-028 根源）。
// 模板层一律走 src/lib/dates.ts 的 fmtItemDate，禁止把 Date 直接交给模板。

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// 构建期工作目录即仓库根（Astro 由仓库根启动）。
// 不能用 import.meta.url：Astro 会把模块打包进 dist/.prerender，路径会指向产物目录。
const ROOT = process.cwd();
const SITE_CONFIG_PATH = path.join(ROOT, '_config.yml');
const THEME_CONFIG_PATH = path.join(ROOT, 'themes', 'fluid', '_config.yml');

function readYaml(file: string): Record<string, any> {
  return (yaml.load(fs.readFileSync(file, 'utf8')) as Record<string, any>) || {};
}

// 同一构建进程内只读一次
const siteConfig: Record<string, any> = readYaml(SITE_CONFIG_PATH);
const themeConfig: Record<string, any> = readYaml(THEME_CONFIG_PATH);

const separator: string = themeConfig.title_join_string || themeConfig.tab_title_separator || ' - ';

const navbarMenu: any[] = themeConfig.navbar?.menu || [];
const navbarAuxMenu: any[] = themeConfig.navbar?.aux_menu || [];
const footerContent: string = themeConfig.footer?.content || '';
const staticPrefix: Record<string, string> = themeConfig.static_prefix || {};

const canonicalEnable = Boolean(themeConfig.canonical?.enable);
const openGraphEnable = Boolean(themeConfig.open_graph?.enable);
const darkModeEnable = Boolean(themeConfig.dark_mode?.enable);
const highlightEnable = Boolean(themeConfig.code?.highlight?.enable);
const lazyloadOnlyPost = Boolean(themeConfig.lazyload?.enable && themeConfig.lazyload?.onlypost);
const scrollTopEnable = Boolean(themeConfig.scroll_top_arrow?.enable);

/** 文章/页面标题的完整文档标题 */
function documentTitle(pageTitle?: string): string {
  return pageTitle ? [pageTitle, siteConfig.title].join(separator) : String(siteConfig.title || '');
}

/** 主题 translations 中实际用到的键（zh-CN） */
export { siteConfig, themeConfig, separator, navbarMenu, navbarAuxMenu, footerContent, staticPrefix };
export {
  canonicalEnable,
  openGraphEnable,
  darkModeEnable,
  highlightEnable,
  lazyloadOnlyPost,
  scrollTopEnable,
  documentTitle,
};
