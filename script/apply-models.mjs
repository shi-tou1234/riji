#!/usr/bin/env node
// 从 Token Monitor 的按天归档回填「这一天用了什么模型」。
//
// 数据：%APPDATA%/Token Monitor/daily-history-archive.json（Token Monitor
// 自行采集归档，键 = 日期，observations 键 = [client, modelId]，带 tokens）。
// 覆盖 2026-04-28 起（更早的天 opencode 老会话已被清掉，无数据可考，
// 那些日记就不写 models）。单日模型可能多达十几个，按 token 排序取前三。
//
// 幂等：frontmatter 已有 models 行就跳过。

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIARY = join(root, 'src', 'content', 'diary');
const ARCHIVE = join(process.env.APPDATA, 'Token Monitor', 'daily-history-archive.json');
const TOP = 3;

async function main() {
  const archive = JSON.parse(await readFile(ARCHIVE, 'utf8'));
  const days = archive.days ?? {};

  const files = (await readdir(DIARY)).filter((f) => f.endsWith('.md'));
  let filled = 0;
  let present = 0;
  const noData = [];

  for (const f of files) {
    const date = f.slice(0, 10);
    const path = join(DIARY, f);
    const raw = await readFile(path, 'utf8');
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    if (fm[1].includes('\nmodels:')) {
      present++;
      continue;
    }

    const rec = days[date];
    if (!rec?.observations) {
      noData.push(date);
      continue;
    }

    // 同一模型可能挂在多个 client 下，按 modelId 聚合 token
    const byModel = new Map();
    for (const o of Object.values(rec.observations)) {
      byModel.set(o.modelId, (byModel.get(o.modelId) ?? 0) + (o.tokens ?? 0));
    }
    const models = [...byModel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP)
      .map(([m]) => m);
    if (!models.length) {
      noData.push(date);
      continue;
    }

    const line = `models: [${models.join(', ')}]`;
    const header = `${fm[1]}\n${line}`;
    await writeFile(path, raw.replace(fm[1], header), 'utf8');
    filled++;
  }

  console.log(`回填 ${filled} 篇；已有 ${present} 篇；无数据 ${noData.length} 天`);
  if (noData.length) {
    const span = noData[0] + ' → ' + noData[noData.length - 1];
    console.log(`（无数据天示例：${span}，共 ${noData.length} 天，多为 4 月底之前）`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
