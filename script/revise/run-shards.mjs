#!/usr/bin/env node
/** 并发跑一批分片清单：node script/revise/run-shards.mjs resume */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT = join(REPO, '.revise-out');
const MANIFESTS = join(REPO, '.revise-manifests');

const prefix = process.argv[2] || 'resume';
const shards = Array.from({ length: Number(process.env.REVISE_WORKERS || 4) }, (_, i) =>
  join(MANIFESTS, `${prefix}-${i}.txt`),
);

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