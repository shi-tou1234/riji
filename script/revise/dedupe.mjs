#!/usr/bin/env node
/**
 * 同日期重跑会产生同源的不同标题版本（标题每次生成都不一样）。
 * 靠正文相似度挑出同源的那几份，保留最早落盘的那个，其余删掉。
 *   node script/revise/dedupe.mjs          预演
 *   node script/revise/dedupe.mjs --go     真删
 */

import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = '.revise-out';
const GO = process.argv.includes('--go');

// shingle 集合求 Jaccard，够用了
function shingles(text, k = 12) {
  const body = text.replace(/^---[\s\S]*?\n---\n/, '').replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i + k <= body.length; i += 3) set.add(body.slice(i, i + k));
  return set;
}
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ name: f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
  .sort((x, y) => x.mtime - y.mtime); // 早的在前，优先保留

const dupes = [];
for (let i = 0; i < files.length; i++) {
  for (let j = i + 1; j < files.length; j++) {
    if (files[i].name.slice(0, 10) !== files[j].name.slice(0, 10)) continue; // 只比同日期
    const a = shingles(readFileSync(files[i].path, 'utf8'));
    const b = shingles(readFileSync(files[j].path, 'utf8'));
    const sim = jaccard(a, b);
    if (sim > 0.45) dupes.push({ keep: files[i], drop: files[j], sim });
  }
}

console.log(`\n发现 ${dupes.length} 对同源（日期间相似度 > 45%）\n`);
for (const d of dupes) {
  console.log(`  ${(d.sim * 100).toFixed(0)}%  保留「${d.keep.name.slice(11, 40)}」`);
  console.log(`        删除「${d.drop.name.slice(11, 40)}」`);
}

if (!GO) {
  console.log('\n这是预演。确认后加 --go。');
  process.exit(0);
}

// 只删每对的后者，且不重复删
const toDrop = new Set(dupes.map((d) => d.drop.name));
for (const n of toDrop) rmSync(join(dir, n), { force: true });
console.log(`\n✓ 删除 ${toDrop.size} 篇同源重复，剩 ${readdirSync(dir).filter((f) => f.endsWith('.md')).length} 篇`);