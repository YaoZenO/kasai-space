/* global hexo */

'use strict';

// 内容模块页生成器：为 projects / games 的每个条目生成详情页，并生成模块列表页。
// 数据来源：source/_data/<module>.yml（后台维护）；无数据不生成任何页面（真实数据铁律）。
// 长文本在生成期预渲染为 HTML（hexo.render.marked），布局只负责排版。

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

const MODULES = [
  { key: 'projects', layout: 'project', indexTitle: '项目', longFields: ['background', 'process', 'tech', 'outcome'] },
  { key: 'games', layout: 'game', indexTitle: '游戏', longFields: ['gameplay'] },
];

hexo.extend.generator.register('module-pages', async function (locals) {
  const data =
    (locals && locals.site && locals.site.data) ||
    (locals && locals.data) ||
    (this && this.site && this.site.data) ||
    {};
  const routes = [];

  for (const mod of MODULES) {
    const items = (data[mod.key] && data[mod.key].items) || [];
    const valid = items.filter((it) => it && it.title);
    if (!valid.length) continue;

    for (const it of valid) {
      for (const f of mod.longFields) {
        const text = it[f];
        if (!text || !String(text).trim()) continue;
        // 注意 engine 必须是 'markdown'——'marked' 不是已注册的扩展名，
        // Hexo 找不到渲染器时会「静默返回原文」，不会报错（踩过）。
        // 因此下面额外做一次「输出 == 输入」判定，避免再出现未渲染的裸 Markdown 上线。
        let html;
        try {
          html = await hexo.render.render({ text: String(text), engine: 'markdown' });
        } catch (e) {
          html = '';
        }
        if (!html || String(html).trim() === String(text).trim()) {
          html = `<pre>${escapeHtml(String(text))}</pre>`;
        }
        it[`${f}_html`] = html;
      }
      const slug = it.slug || encodeURIComponent(String(it.title));
      routes.push({
        path: `${mod.key}/${slug}/index.html`,
        layout: mod.layout,
        data: {
          title: it.title,
          __modulePage: true,
          moduleKey: mod.key,
          moduleTitle: mod.indexTitle,
          item: it,
        },
      });
    }

    routes.push({
      path: `${mod.key}/index.html`,
      layout: 'module-index',
      data: {
        title: mod.indexTitle,
        __moduleIndex: true,
        moduleKey: mod.key,
        moduleTitle: mod.indexTitle,
        items: valid,
      },
    });
  }
  return routes;
});
