// @ts-check
import { defineConfig } from 'astro/config';

// 部署到 GitHub Pages 时改这里：仓库名 = base，最后一段不能少斜杠。
// 本地 `pnpm dev` 不受影响。
const BASE = '/riji/';

export default defineConfig({
  site: 'https://shi-tou1234.github.io',
  base: BASE,
  // 日记是纯文字，没有配图，关掉图片服务省掉 sharp 依赖
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  markdown: {
    // Astro 内置 Shiki，零额外依赖。主题跟主博客保持一致。
    shikiConfig: {
      theme: 'one-dark-pro',
      wrap: false,
    },
  },
});
