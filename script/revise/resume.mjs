#!/usr/bin/env node
/**
 * 找出上次中断时还没修订完的篇目，按日期比对得出，然后生成新分片。
 *   node script/revise/resume.mjs
 * 会先把「要重跑的那些日期」在 .revise-out/ 里的旧产出删掉，
 * 免得重跑换了标题之后留下孤儿文件。
 */

import { existsSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const SRC = join(REPO, 'src', 'content', 'diary');
const OUT = join(REPO, '.revise-out');
const MANIFESTS = join(REPO, '.revise-manifests');
const TEST_DIR = 'D:\\项目\\测试\\开发日记';
const WORKERS = Number(process.env.REVISE_WORKERS || 4);

// 源文件按日期分组
const byDate = new Map();
const add = (p) => {
  const m = p.match(/(\d{4}-\d{2}-\d{2})/);
  const d = m ? m[1] : '????';
  if (!byDate.has(d)) byDate.set(d, []);
  byDate.get(d).push(p);
};
for (const f of readdirSync(SRC)) if (f.endsWith('.md')) add(join(SRC, f));
if (existsSync(TEST_DIR)) for (const f of readdirSync(TEST_DIR)) if (f.endsWith('.md')) add(join(TEST_DIR, f));

// 产出按日期分组
const outByDate = new Map();
if (existsSync(OUT)) {
  for (const f of readdirSync(OUT)) {
    if (!f.endsWith('.md')) continue;
    const d = f.slice(0, 10);
    outByDate.set(d, (outByDate.get(d) || 0) + 1);
  }
}

// 哪个日期的产出少于源文件数，就是没做完
const missing = [];
const redoDates = [];
for (const [d, files] of [...byDate].sort()) {
  const got = outByDate.get(d) || 0;
  if (got < files.length) {
    redoDates.push(d);
    missing.push(...files);
  }
}

console.log(`源 ${[...byDate.values()].flat().length} 篇，已产出 ${[...outByDate.values()].reduce((a, b) => a + b, 0)} 篇`);
console.log(`未完成的日期：${redoDates.length} 个`);
if (missing.length === 0) {
  console.log('\n全部做完了。');
  process.exit(0);
}

// 清掉这些日期的旧产出，防止重跑换标题后留下孤儿
if (existsSync(OUT)) {
  for (const f of readdirSync(OUT)) {
    if (f.endsWith('.md') && redoDates.includes(f.slice(0, 10))) {
      rmSync(join(OUT, f), { force: true });
    }
  }
}

mkdirSync(MANIFESTS, { recursive: true });
const shards = Array.from({ length: WORKERS }, () => []);
missing.forEach((t, i) => shards[i % WORKERS].push(t));

shards.forEach((s, i) => {
  const p = join(MANIFESTS, `resume-${i}.txt`);
  writeFileSync(p, s.join('\n'), 'utf8');
});

console.log(`待重跑 ${missing.length} 篇：`);
for (const d of redoDates) console.log(`  ${d}  源 ${byDate.get(d).length} 篇`);
console.log('');
for (let i = 0; i < shards.length; i++) {
  if (shards[i].length) console.log(`shard-${i}: ${shards[i].length} 篇`);
}