// zh-CN 文案（只收录迁移实际用到的键，取值逐字来自 themes/fluid/languages/zh-CN.yml）

export const zhCN = {
  home: { menu: '首页', title: '首页' },
  archive: { menu: '归档', title: '归档', subtitle: '归档', post_total: '共计 %d 篇文章' },
  category: { menu: '主题', title: '主题', subtitle: '主题', post_total: '共计 %d 篇文章', more: 'More...' },
  tag: { menu: '关键词', title: '关键词', subtitle: '关键词', post_total: '共计 %d 篇文章' },
  page404: { menu: '页面不存在', title: '页面不存在', subtitle: '页面不存在' },
  search: { title: '搜索', keyword: '关键词' },
  noscript_warning: '博客在允许 JavaScript 运行的环境下浏览效果更佳',
  // 2026-11-09：与 themes/fluid/languages/zh-CN.yml 同源，只用功能性文案「浅色 / 深色」。
  // light = 点击后切到浅色（当前深色时显示）；dark = 点击后切到深色（当前浅色时显示）。
  darkmode: { light: '浅色', dark: '深色' },
  about: { menu: '关于', title: '关于', subtitle: '关于' },
  links: { menu: '友链', title: '友链', subtitle: '友情链接' },
  post: {
    toc: '目录',
    prev_post: '上一篇',
    next_post: '下一篇',
    updated: '本文最后更新于 %s',
    meta: {
      wordcount: '%s 字',
      min2read: '%s 分钟',
      views: '{} 次',
    },
    copyright: {
      author: '作者',
      posted: '发布于',
      updated: '更新于',
      licensed: '许可协议',
      CC: 'CC - 知识共享许可协议',
      BY: 'BY - 署名',
      SA: 'SA - 相同方式共享',
      NC: 'NC - 非商业性使用',
      ND: 'ND - 禁止演绎',
      ZERO: 'CC0 - 无版权',
    },
  },
  footer: { pv: '总访问量 {} 次', uv: '总访客数 {} 人' },
} as const;

type Dict = typeof zhCN;

/** 取文案，缺失返回空串（不静默造文案） */
export function t<K extends keyof Dict>(key: K): Dict[K] {
  return zhCN[key];
}
