#!/usr/bin/env node
// 把来源项目写回每篇日记的 frontmatter.projects。
//
// 来源真相：D:\项目\开发日记\<项目目录>\<YYYY-MM-DD>.md（导入时的二维结构，
// 目录→展示名的映射与 script/import-diaries.mjs 保持一致）。
// 同一天写过几个项目，那天日记的 projects 就是几个的并集；
// 站点自己的日记（9.30 建站、10.1 的几篇）不在来源目录里，标「本站」，
// 由 EXCEPTIONS 按文件名逐篇指派，优先于日期推断。
//
// 可重复执行：frontmatter 里已有 projects 行就整行替换。

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'D:\\项目\\开发日记';
const DIARY = join(root, 'src', 'content', 'diary');

/** 项目目录名 → 站上展示用的短名（与 import-diaries.mjs 一致） */
const PROJ = {
  'cmchen-blog': '博客',
  'cmchen-blog-starter': '博客模板',
  'cmchen-page': '个人主页',
  'cmchen-desktopbox': '桌面文件筐',
  'cmchen-clock': '时钟',
  'cmchen-skill': '技能包',
  'cmchen-translate': '划词翻译',
  'cmchen-s-box': '工具箱',
  'study-platform': '学习工具台',
  'zhenzhibiao': '布尔化简',
  'links': '链接导航',
  'game': '小游戏',
  'homework': '磁盘管家',
  'study-record': '学业记录',
  'yulan': 'Markdown 预览器',
  'box': '元器件站',
  '2026car': '智能车',
};

/** 日期推断覆盖不到的篇目，按文件名片段指派（越具体越靠前） */
const EXCEPTIONS = [
  ['旧日记搬进新家', ['本站']],
  ['整排图标集体破图', ['桌面文件筐']],
  ['自己电脑上全绿', ['桌面文件筐']],
  ['他说字有点多', ['磁盘管家']],
];

function exceptionFor(name) {
  return EXCEPTIONS.find(([frag]) => name.includes(frag));
}

async function main() {
  // 1) 日期 → 项目展示名集合
  const byDate = new Map();
  for (const proj of (await readdir(SRC, { withFileTypes: true })).filter((d) => d.isDirectory)) {
    const dir = join(SRC, proj.name);
    const short = PROJ[proj.name];
    if (!short) {
      console.warn(`! 未知项目目录，跳过：${proj.name}`);
      continue;
    }
    for (const f of (await readdir(dir)).filter((f) => f.endsWith('.md'))) {
      const date = f.replace(/\.md$/, '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!byDate.has(date)) byDate.set(date, new Set());
      byDate.get(date).add(short);
    }
  }

  // 2) 逐篇回填
  const files = (await readdir(DIARY)).filter((f) => f.endsWith('.md'));
  let changed = 0;
  const unmatched = [];
  const byProj = {};

  for (const f of files) {
    const date = f.slice(0, 10);
    const path = join(DIARY, f);
    const raw = await readFile(path, 'utf8');
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) {
      console.warn(`! 没有 frontmatter，跳过：${f}`);
      continue;
    }

    const exc = exceptionFor(f);
    const names = exc ? exc[1] : [...(byDate.get(date) ?? [])];
    if (!names.length) {
      unmatched.push(f);
      continue;
    }
    names.forEach((n) => (byProj[n] = (byProj[n] || 0) + 1));

    const line = `projects: [${names.join(', ')}]`;
    let header = fm[1];
    header = header.includes('\nprojects:')
      ? header.replace(/\nprojects:\s*\[[^\]]*\]/, `\n${line}`)
      : `${header}\n${line}`;

    if (header !== fm[1]) {
      await writeFile(path, raw.replace(fm[1], header), 'utf8');
      changed++;
    }
  }

  console.log(`已回填 ${changed} 篇；共 ${files.length} 篇`);
  for (const [k, v] of Object.entries(byProj).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(14)} ${v}`);
  }
  if (unmatched.length) {
    console.log(`\n? 没找到来源日期的 ${unmatched.length} 篇（需要手工指派）：`);
    for (const f of unmatched) console.log(`  ${f}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
