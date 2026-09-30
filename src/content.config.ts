import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 日记集合。文件直接平铺在 src/content/diary/ 下，一个文件一篇，
 * 前缀 `_` 开头的文件会被忽略（可放草稿模板）。
 *
 * 文件名建议：YYYY-MM-DD-标题.md
 */
const diary = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/diary' }),
  schema: z.object({
    /** 标题，页面里只出现一次，文件名里的日期不重复展示 */
    title: z.string(),
    /** 日期，支持 2026-09-30 / 2026-09-30 09:30 / 2026-09-30T09:30:00Z */
    date: z.coerce.date(),
    /** 一句话摘要，首页卡片用；不写会从正文首段自动截取 */
    summary: z.string().default(''),
    /** 草稿不参与构建，也不出现在首页。写完改 false 即可发布 */
    draft: z.boolean().default(false),
  }),
});

/** 单页内容（关于页等），同样是一个 .md 一个文件，agent 可直接改写 */
const pages = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(''),
  }),
});

export const collections = { diary, pages };
