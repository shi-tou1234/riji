/** 中文长日期：2026 年 9 月 30 日 */
export function formatDateCN(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

/** 中文数字：题签用（2026 → 二〇二六） */
const CN_DIGITS = '〇一二三四五六七八九';

/** 项目名 → 稳定色相（0-359）：来源标记的小色点用 */
export function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return h;
}

export function cnNum(n: number): string {
  return String(n)
    .split('')
    .map((d) => CN_DIGITS[Number(d)])
    .join('');
}

/** 月份是 1~12，要能说「十月」「十一月」「十二月」，不能只逐位念 */
const CN_MONTH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

export function cnMonth(m: number): string {
  return CN_MONTH[m - 1];
}

/** 「九月」；跨了年份才带上年：「2025年三月」 */
export function cnMonthLabel(year: number, month: number, latestYear: number): string {
  return year === latestYear ? `${cnMonth(month)}月` : `${year}年${cnMonth(month)}月`;
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

/** 首段当摘要：去掉代码块、每行的引用/列表标记和行内强调符号；
 *  引子里的「今日状态：」标签换成破折号，读起来才是一句话 */
export function excerpt(markdown: string, len = 90): string {
  const body = markdown
    .replace(/\r\n?/g, '\n') /* CRLF 先拍平，别让 \r 混进任何一行 */
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n/)
    .map((p) => {
      const joined = p
        .replace(/^\s*[#>\-*]+\s?/gm, '')
        .split('\n')
        .map((l) => l.replace(/[*_`[\]()]/g, '').trim())
        .filter(Boolean)
        .join('');
      return joined.replace(/^(.*?)今日状态[:：]\s*/, '$1——');
    })
    .find((p) => p.length > 10);
  if (!body) return '';
  return body.length > len ? `${body.slice(0, len).trimEnd()}…` : body;
}
