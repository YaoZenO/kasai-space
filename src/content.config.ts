import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 页面声明 md：只读 source/about、source/now（正文需要渲染）。
// _posts 的集合在阶段 2 增加。
const pages = defineCollection({
  loader: glob({ pattern: ['about/index.md', 'now/index.md'], base: './source' }),
  schema: z
    .object({
      title: z.string().optional(),
      kicker: z.string().optional(),
      subtitle: z.string().optional(),
      layout: z.string().optional(),
      show_updated: z.any().optional(),
      date: z.any().optional(),
    })
    .passthrough(),
});

export const collections = { pages };
