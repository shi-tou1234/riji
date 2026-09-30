/**
 * 内部链接要手动带 base 前缀，否则部署到 GitHub Pages 的子路径下会 404。
 * Astro 不会自动改写手写的绝对路径。
 */
const BASE = import.meta.env.BASE_URL;

export function withBase(path: string): string {
  return `${BASE}${path.replace(/^\//, '')}`;
}
