#!/usr/bin/env node
/**
 * 区分「硬违规」和「误报」。
 * 硬违规 = 提交序号、增删行数、英文文件名后缀、emoji、颜文字 —— 这些绝对不许出现。
 * 软命中 = 「函数」「变量」「提交」这类日常词，可能只是碰巧包含，需要人眼判断。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith('.md'));

const HARD = [
  ['提交序号', /`?\b[0-9a-f]{7,40}\b`?/g],
  ['增删行数', /[+＋]\s?\d{2,}(?![\d年])/g],
  ['减删统计', /[−–—]\s?\d{2,}\s*[/／]/g],
  ['代码后缀', /\.(astro|tsx|jsx|mjs|cjs|scss|vue|json|yml|yaml)\b/gi],
  ['emoji', /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu],
  ['颜文字', /[（(][^）)]{0,4}[ω⊙≖∀＞^][^）)]{0,4}[）)]/g],
];

let hardBad = 0;
const detail = [];

for (const f of files) {
  const body = readFileSync(join(dir, f), 'utf8').replace(/^---[\s\S]*?\n---\n/, '');
  const hits = [];
  for (const [name, re] of HARD) {
    const m = body.match(re);
    if (m && m.length) {
      hits.push(`${name}×${m.length}: ${[...new Set(m)].slice(0, 3).join(' ')}`);
    }
  }
  if (hits.length) {
    hardBad++;
    detail.push([f, hits]);
  }
}

console.log(`共 ${files.length} 篇，硬违规 ${hardBad} 篇\n`);
for (const [f, hits] of detail) {
  console.log(`✗ ${f}`);
  for (const h of hits) console.log(`    ${h}`);
  console.log('');
}
console.log(hardBad === 0 ? '✓ 没有硬违规' : `\n需处理 ${hardBad} 篇`);