#!/usr/bin/env node
// 生成一篇日记草稿：pnpm new "标题"  /  pnpm new "标题" 2026-10-05
// 只做一件事——把文件骨架摆好，剩下交给 agent 或你自己写。

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src', 'content', 'diary');

const title = process.argv[2];
if (!title) {
  console.error('用法：pnpm new "标题" [YYYY-MM-DD]');
  process.exit(1);
}

const pad = (n) => String(n).padStart(2, '0');
const given = process.argv[3];
const now = new Date();
const [y, m, d] = given
  ? given.split('-').map(Number)
  : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
const date = `${y}-${pad(m)}-${pad(d)}`;

// 文件名去掉路径分隔符和 Windows 非法字符
const safe = title.replace(/[\\/:*?"<>|]/g, '').trim();
const file = join(dir, `${date}-${safe}.md`);

const body = `---
title: ${title}
date: ${date}
summary: ''
draft: true
---

在这里写正文。写完把上面的 \`draft: true\` 改成 \`false\`，或者跑 \`pnpm new\` 时用 \`--publish\`。
`;

await mkdir(dir, { recursive: true });
await writeFile(file, body, 'utf8');
console.log(`已创建 ${file}`);
console.log('（draft: true 时不会出现在站上）');
