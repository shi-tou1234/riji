/** 中文长日期：2026 年 9 月 30 日 */
export function formatDateCN(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

/**
 * 粗略阅读时长。中文按 400 字/分钟，英文按 200 词/分钟，
 * 再按 600 字符/分钟兜底（代码块、表格这些也占体积）。
 */
export function readingTime(text: string): number {
  if (!text) return 1;
  const cjk = (text.match(/[\u4e00-\u9fa5\u3040-\u30ff]/g) ?? []).length;
  const words = (text.replace(/[\u4e00-\u9fa5\u3040-\u30ff]/g, ' ').match(/[A-Za-z0-9]+/g) ?? [])
    .length;
  const minutes = cjk / 400 + words / 200 + text.length / 6000;
  return Math.max(1, Math.round(minutes));
}

/** 首段当摘要：去掉代码块、引用标记和强调符号 */
export function excerpt(markdown: string, len = 90): string {
  const body = markdown
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^[#>\-*\s]+/, '').replace(/[*_`[\]()]/g, '').trim())
    .find((p) => p.length > 10);
  if (!body) return '';
  return body.length > len ? `${body.slice(0, len).trimEnd()}…` : body;
}
