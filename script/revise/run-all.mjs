#!/usr/bin/env node
/**
 * 并行修订全部日记。batch.mjs 一次一篇，这里负责把任务摊给几个 worker 同时跑。
 *
 *   node script/revise/run-all.mjs
 *
 * 产出先落在 .revise-out/，不直接覆盖原文件——
 * 跑完你验收满意了，再自己挪过去。跑砸了原日记一根汗毛都不会掉。
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT = join(REPO, '.revise-out');
const MANIFESTS = join(REPO, '.revise-manifests');

const WORKERS = Number(process.env.REVISE_WORKERS || 4);
const TEST_DIR = 'D:\\项目\\测试\\开发日记';

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

/* ── 收集任务 ──────────────────────────────────────────────── */

const tasks = [];

// 站点里的 232 篇
for (const f of readdirSync(join(REPO, 'src', 'content', 'diary'))) {
  if (f.endsWith('.md')) tasks.push(join(REPO, 'src', 'content', 'diary', f));
}
// 测试目录里的 13 篇（并入站点）
if (existsSync(TEST_DIR)) {
  for (const f of readdirSync(TEST_DIR)) {
    if (f.endsWith('.md')) tasks.push(join(TEST_DIR, f));
  }
}

// 轮转分片，天然负载均衡（长短不一的活儿会散开）
const shards = Array.from({ length: WORKERS }, () => []);
tasks.forEach((t, i) => shards[i % WORKERS].push(t));

/* ── 写清单 ────────────────────────────────────────────────── */

const { mkdirSync } = await import('node:fs');
mkdirSync(OUT, { recursive: true });
mkdirSync(MANIFESTS, { recursive: true });

const logFile = join(MANIFESTS, 'errors.log');
writeFileSync(logFile, '', 'utf8');

const manifestPaths = shards.map((s, i) => {
  const p = join(MANIFESTS, `shard-${i}.txt`);
  writeFileSync(p, s.join('\n'), 'utf8');
  return { p, n: s.length };
});

console.error(bold(`\n共 ${tasks.length} 篇，分 ${WORKERS} 个 worker`));
for (const { p, n } of manifestPaths) console.error(dim(`  ${n} 篇 → ${p.replace(REPO, '.')}`));
console.error(dim(`  产出到 ${OUT.replace(REPO, '.')}（不覆盖原文件）`));
console.error(dim(`  失败记录：${logFile.replace(REPO, '.')}\n`));

/* ── 开跑 ──────────────────────────────────────────────────── */

const t0 = Date.now();
let done = 0;

await Promise.all(
  manifestPaths.map(({ p, n }) =>
    new Promise((resolveP) => {
      if (n === 0) return resolveP();
      const child = spawn(process.execPath, [join(HERE, 'batch.mjs'), '--out', OUT, '--manifest', p], {
        cwd: REPO,
        stdio: ['ignore', 'inherit', 'inherit'],
        windowsHide: true,
        env: process.env,
      });
      child.on('close', () => resolveP());
    }),
  ),
);

const mins = ((Date.now() - t0) / 60000).toFixed(1);

/* ── 汇报 ──────────────────────────────────────────────────── */

const produced = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith('.md')) : [];
console.error(bold(`\n跑完了，耗时 ${mins} 分钟`));
console.error(`  产出 ${green(produced.length + ' 篇')} / ${tasks.length}`);

const failed = tasks.length - produced.length;
if (failed > 0) {
  console.error(red(`  少了 ${failed} 篇`));
  appendFileSync(logFile, `\n# 总计 ${failed} 篇未产出\n`);
}

void dim;
process.exit(0);