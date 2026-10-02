#!/usr/bin/env node
/** 干净重跑：输出到 .revise-out2/，全程记录 源→产出 映射。node script/revise/run-clean.mjs */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT = join(REPO, '.revise-out2');
const MANIFESTS = join(REPO, '.revise-manifests');

const shards = [0, 1, 2, 3].map((i) => join(MANIFESTS, `full-${i}.txt`));
const t0 = Date.now();

await Promise.all(
  shards.map((p) =>
    new Promise((res) => {
      const c = spawn(process.execPath, [join(HERE, 'batch.mjs'), '--out', OUT, '--manifest', p], {
        cwd: REPO,
        stdio: ['ignore', 'inherit', 'inherit'],
        windowsHide: true,
        env: process.env,
      });
      c.on('close', res);
    }),
  ),
);

console.error(`\n全部完成，耗时 ${((Date.now() - t0) / 60000).toFixed(1)} 分钟`);
process.exit(0);