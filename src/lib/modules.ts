// 模块数据层：复刻 themes/fluid/scripts/generators/module-pages.js 的取值规则。
// 只读 source/_data/<module>.yml；无数据不生成页面。
// 长文本在构建期渲染为 HTML（与 Hexo 的 hexo.render.render({ engine: 'markdown' }) 同口径）。

import { getData } from './data';
import { renderMarkdown } from './markdown';

export type ModuleKey = 'projects' | 'games' | 'collections';

/** 各模块的详情页长文字段（顺序即详情页 section 顺序） */
const LONG_FIELDS: Record<ModuleKey, string[]> = {
  projects: ['background', 'process', 'tech', 'outcome'],
  games: ['gameplay'],
  collections: [],
};

/** 条目详情页 slug：与 module-pages.js 的 slugOf 一致（缺省用标题编码） */
export function slugOf(item: any): string {
  return item.slug || encodeURIComponent(String(item.title));
}

export function detailPath(key: ModuleKey, item: any): string {
  return '/' + key + '/' + slugOf(item) + '/';
}

/** 取模块条目（仅保留有 title 的），并为详情页预渲染长文 */
export function getModuleItems(key: ModuleKey): any[] {
  const items: any[] = (getData()[key]?.items || []).filter((it: any) => it && it.title);
  for (const it of items) {
    for (const field of LONG_FIELDS[key]) {
      const text = it[field];
      if (!text || !String(text).trim()) continue;
      it[`${field}_html`] = renderMarkdown(String(text));
    }
  }
  return items;
}
