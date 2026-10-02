#!/usr/bin/env node
/**
 * 扫一遍目录里的日记，看有没有违反文风规范的地方。
 * 只是报告，不改文件——改是 AI 的活，这里只负责抓漏网之鱼。
 *
 *   node script/revise/check.mjs <目录...>
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('用法：node script/revise/check.mjs <目录...>');
  process.exit(1);
}

const RULES = [
  ['提交序号', /`?\b[0-9a-f]{7,40}\b`?/g, '六位以上十六进制串'],
  ['增删行数', /[+＋]\s?\d{2,}\s*/g, '加号后面跟两位以上数字'],
  ['减删行数', /[−–—-]\s?\d{2,}\s*[/／]/g, '减号后面跟数字再跟斜杠'],
  ['代码后缀', /\.(astro|tsx|ts|jsx|js|mjs|cjs|css|scss|vue|json|md|yml|yaml)\b/gi, '英文文件名后缀'],
  ['术语·重构', /重构/g, ''],
  ['术语·组件', /组件/g, ''],
  ['术语·部署', /部署/g, ''],
  ['术语·依赖', /依赖/g, ''],
  ['术语·缓存', /缓存/g, ''],
  ['术语·重构/接口', /(API|接口)/g, ''],
  ['术语·变量/函数', /(变量|函数|调试|编译|提交|仓库|分支|合并|版本控制)/g, ''],
  ['emoji', /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ''],
  ['颜文字', /[（(][^）)]*[ω⊙≖∀＞^_][^）)]*[）)]/g, '(◕ᴗ◕✿) 这类'],
];

function filesOf(p) {
  try {
    return readdirSync(p, { withFileTypes: true }).flatMap((e) => {
      const f = join(p, e.name);
      if (e.isDirectory()) return filesOf(f);
      return f.endsWith('.md') ? [f] : [];
    });
  } catch {
    return [];
  }
}

const all = targets.flatMap(filesOf);
if (all.length === 0) {
  console.error('没找到 .md 文件');
  process.exit(1);
}

console.log(`扫了 ${all.length} 篇\n`);

let bad = 0;
const report = [];

for (const f of all) {
  const text = readFileSync(f, 'utf8');
  // frontmatter 不算正文
  const body = text.replace(/^---[\s\S]*?\n---\n/, '');
  const hits = [];
  for (const [name, re, note] of RULES) {
    const m = body.match(re);
    if (m && m.length) hits.push([name, [...new Set(m)].slice(0, 4), m.length]);
  }
  if (hits.length) {
    bad++;
    report.push({ f, hits });
  }
}

for (const { f, hits } of report) {
  console.log(`✗ ${f.split(/[\\/]/).pop()}`);
  for (const [name, samples, n] of hits) {
    console.log(`    ${name.padEnd(12)} ×${String(n).padEnd(3)} ${samples.map((s) => JSON.stringify(s)).join(' ')}`);
  }
  console.log('');
}

console.log(`\n干净 ${all.length - bad} / ${all.length}`);