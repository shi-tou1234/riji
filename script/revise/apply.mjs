#!/usr/bin/env node
/**
 * 把 .revise-out/ 里修订好的日记放回 src/content/diary/。
 *
 *   node script/revise/apply.mjs          # 先预演，看看会发生什么
 *   node script/revise/apply.mjs --go     # 真动手
 *
 * 新文件直接放进去；旧文件被覆盖前先备份到 .revise-backup/，
 * 万一改得不对可以原样退回去。
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const SRC = join(REPO, 'src', 'content', 'diary');
const OUT = join(REPO, '.revise-out');
const BACKUP = join(REPO, '.revise-backup');

const GO = process.argv.includes('--go');

if (!existsSync(OUT)) {
  console.error('没有 .revise-out/，先跑 run-all.mjs');
  process.exit(1);
}

const produced = readdirSync(OUT).filter((f) => f.endsWith('.md'));
if (produced.length === 0) {
  console.error('.revise-out/ 是空的');
  process.exit(1);
}

// 按日期归类，方便你看清那天多了几篇
const byDate = {};
for (const f of produced) {
  const d = f.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '????';
  (byDate[d] ||= []).push(f);
}

console.log(`\n准备放回 ${produced.length} 篇到 src/content/diary/`);
console.log(`当前该目录 ${readdirSync(SRC).filter((f) => f.endsWith('.md')).length} 篇\n`);

const overwrite = [];
const add = [];
for (const f of produced) {
  if (existsSync(join(SRC, f))) overwrite.push(f);
  else add.push(f);
}

console.log(`  覆盖同名 ${overwrite.length} 篇（先备份）`);
console.log(`  新增     ${add.length} 篇`);
console.log(`\n涉及日期：`);
for (const [d, fs] of Object.entries(byDate).sort()) {
  const n = fs.filter((f) => existsSync(join(SRC, f))).length;
  console.log(`  ${d}  ${fs.length} 篇${n ? `（其中 ${n} 篇覆盖同名）` : '（全新）'}`);
}

if (!GO) {
  console.log('\n这是预演。确认无误后加 --go 真正执行。');
  process.exit(0);
}

mkdirSync(BACKUP, { recursive: true });

// 覆盖之前先把旧的存一份
let backed = 0;
for (const f of overwrite) {
  copyFileSync(join(SRC, f), join(BACKUP, f));
  backed++;
}

for (const f of produced) {
  copyFileSync(join(OUT, f), join(SRC, f));
}

console.log(`\n✓ 放回 ${produced.length} 篇（备份了 ${backed} 篇旧文件到 .revise-backup/）`);
console.log(`  src/content/diary/ 现在有 ${readdirSync(SRC).filter((f) => f.endsWith('.md')).length} 篇`);
console.log(`\n想反悔：把 .revise-backup/ 里的文件拷回 src/content/diary/ 即可。`);

void rmSync;