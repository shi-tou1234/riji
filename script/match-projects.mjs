#!/usr/bin/env node
// 篇级来源项目匹配（两跳）：
//   现役日记 ──同日期+bigram──▶ git 旧树(3e7b91b^，重写前的 232 篇)
//            ──近重复内容──▶ D:\项目\开发日记\<项目目录>\<日期>.md ──▶ 项目名
//
// 第一跳：重写不改日期；同一天多篇时用中文 bigram 重叠度挑（重写保住了
// 具体名词，够分辨）。第二跳：导入「只做结构适配不改写正文」，旧树与源
// 文件近乎逐字相同，同日多源时同样用 bigram。
//
// 结果写回 frontmatter projects: [展示名]；低置信度只报告不落盘。

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIARY = join(root, 'src', 'content', 'diary');
const SRC = 'D:\\项目\\开发日记';
const REV = '3e7b91b^';

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

function bigrams(text) {
  const t = text.replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

function overlap(a, b) {
  let hit = 0;
  for (const g of a) if (b.has(g)) hit++;
  return hit / Math.max(1, Math.min(a.size, b.size));
}

function stripFm(raw) {
  return raw.replace(/^---[\s\S]*?---/, '');
}

/** 日期推断盖不住/盖错了的，按文件名片段人工指派（越具体越靠前，优先于自动匹配） */
const MANUAL = [
  ['删掉一叠用不上的说明书', ['磁盘管家']],
  ['旧日记搬进新家', ['本站']],
  ['自己电脑上全绿', ['桌面文件筐']],
  ['他说字有点多', ['磁盘管家']],
  // —— 9.14 的 11 篇「项目雷达」小时日志：一篇常跨多个项目 ——
  ['今天修的都是些「看不见」的毛病', ['学业记录']],
  ['共享三个标签', ['学业记录']],
  ['同一天，我把两个文件弄坏了三次', ['链接导航']],
  ['图还是会画', ['智能车']],
  ['差点去改一段明明没问题的代码', ['学业记录']],
  ['我删了一行，整个页面白了', ['学业记录', '智能车']],
  ['我差点发布一条自己都开不过去的赛道', ['智能车']],
  ['没人验证过的保证', ['学业记录']],
  ['用户一句话，我九十页作业全撕了', ['学业记录']],
  ['说明里吹的那个程序', ['学业记录']],
  ['那一晚我一直在修同一类', ['智能车']],
];

function manualFor(name) {
  const hit = MANUAL.find(([frag]) => name.includes(frag));
  return hit ? hit[1] : null;
}

async function main() {
  // 1) 源目录：日期 → [{ proj, grams }]
  const srcByDate = new Map();
  for (const d of (await readdir(SRC, { withFileTypes: true })).filter((x) => x.isDirectory)) {
    const short = PROJ[d.name];
    if (!short) continue;
    const dir = join(SRC, d.name);
    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.md'))) {
      const date = f.replace(/\.md$/, '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const grams = bigrams(await readFile(join(dir, f), 'utf8'));
      if (!srcByDate.has(date)) srcByDate.set(date, []);
      srcByDate.get(date).push({ proj: short, grams });
    }
  }

  // 2) git 旧树 232 篇 → 匹配源文件 → 项目
  const rawList = execFileSync(
    'git',
    ['-c', 'core.quotepath=false', 'ls-tree', '-z', '--name-only', REV, '--', 'src/content/diary/'],
    { cwd: root, maxBuffer: 20 * 1024 * 1024 },
  );
  const oldFiles = rawList.toString('utf8').split('\0').filter(Boolean);
  const oldByDate = new Map();
  let srcMiss = 0;
  for (const path of oldFiles) {
    const date = decodeURIComponent(path.split('/').pop().replace(/\.md$/, '')).slice(0, 10);
    const grams = bigrams(
      stripFm(execFileSync('git', ['show', `${REV}:${path}`], { cwd: root, maxBuffer: 20 * 1024 * 1024 }).toString('utf8')),
    );
    const cands = srcByDate.get(date) ?? [];
    let proj = null;
    let score = 0;
    if (cands.length === 1) {
      proj = cands[0].proj;
      score = overlap(grams, cands[0].grams);
    } else if (cands.length > 1) {
      let best = null;
      for (const c of cands) {
        const s = overlap(grams, c.grams);
        if (!best || s > best.score) best = { proj: c.proj, score: s };
      }
      proj = best.proj;
      score = best.score;
    }
    if (!proj) {
      srcMiss++;
      continue;
    }
    if (!oldByDate.has(date)) oldByDate.set(date, []);
    oldByDate.get(date).push({ proj, grams, score });
  }
  console.log(`旧树 ${oldFiles.length} 篇，对上源目录 ${oldFiles.length - srcMiss} 篇，无源 ${srcMiss} 篇`);

  // 3) 现役日记 → 旧树 → 项目
  const files = (await readdir(DIARY)).filter((f) => f.endsWith('.md'));
  let exact = 0;
  let fuzzy = 0;
  const lowConfidence = [];
  const unmatched = [];
  const byProj = {};

  for (const f of files) {
    const date = f.slice(0, 10);
    const manual = manualFor(f);
    const cands = manual ? [] : (oldByDate.get(date) ?? []);
    if (cands.length === 0 && !manual) {
      unmatched.push(f);
      continue;
    }

    let proj;
    let score = 1;
    if (manual) {
      proj = manual.join(', ');
    } else if (cands.length === 1) {
      proj = cands[0].proj;
      exact++;
    } else {
      const grams = bigrams(stripFm(await readFile(join(DIARY, f), 'utf8')).slice(0, 900));
      let best = null;
      for (const c of cands) {
        const s = overlap(grams, c.grams);
        if (!best || s > best.score) best = { proj: c.proj, score: s };
      }
      proj = best.proj;
      score = best.score;
      fuzzy++;
    }
    if (score < 0.3) lowConfidence.push(`${f}  →  ${proj}  (${Number(score).toFixed(2)})`);
    byProj[proj] = (byProj[proj] || 0) + 1;

    const path = join(DIARY, f);
    const raw = await readFile(path, 'utf8');
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    const line = `projects: [${proj}]`;
    const header = fm[1].includes('\nprojects:')
      ? fm[1].replace(/\nprojects:\s*\[[^\]]*\]/, `\n${line}`)
      : `${fm[1]}\n${line}`;
    if (header !== fm[1]) await writeFile(path, raw.replace(fm[1], header), 'utf8');
  }

  console.log(`唯一候选直配 ${exact} 篇；同日多候选模糊匹配 ${fuzzy} 篇`);
  for (const [k, v] of Object.entries(byProj).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(14)} ${v}`);
  }
  if (lowConfidence.length) {
    console.log(`\n? 置信度低（<0.3），请人工核对：`);
    for (const l of lowConfidence) console.log(`  ${l}`);
  }
  if (unmatched.length) {
    console.log(`\n? 旧树里没有同日期原件的 ${unmatched.length} 篇（需手工指派）：`);
    for (const f of unmatched) console.log(`  ${f}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
