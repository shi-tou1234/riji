#!/usr/bin/env node
// 把「一项目一目录、一天一文件」的开发日记，转成目标站要求的
// 「src/content/diary/YYYY-MM-DD-标题.md」扁平集合。
//
// 只做结构适配，不改写内容：
//   原 H1（项目 · 日期）→ frontmatter.title，正文里换成项目+元信息的一段
//   原 blockquote 元信息 → 保留为正文首段的引用块（目标站 schema 不吃这块）
//   原 ### ✦ 小节 → ## 小节（目标站 H1 已由 title 占用，目录只收 h2/h3）
//   summary → 取「今日状态」那句，首页卡片用
//
// 文件名：YYYY-MM-DD-{项目短名}-{当天状态摘要}.md
// 同一天可能有多个项目的日记，靠项目短名和摘要保证唯一。

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || 'D:\\项目\\开发日记';
const OUT = join(root, 'src', 'content', 'diary');

/** 项目目录名 → 站上展示用的短名 */
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

/** 抽出 frontmatter 里的项目说明（第一行 blockquote 的前半段） */
function projectNote(lines) {
  const q = lines.find((l) => l.startsWith('> ') && l.includes('·'));
  if (!q) return '';
  const m = q.match(/^>\s*(.+?)\s*·\s*当天/);
  return m ? m[1].trim() : '';
}

function stats(lines) {
  const q = lines.find((l) => l.startsWith('> ') && l.includes('当天'));
  if (!q) return '';
  const m = q.match(/当天\s*(\d+)\s*次提交\s*·\s*(\+\d+\s*\/\s*−\d+)/);
  return m ? `当天 ${m[1]} 次提交 · ${m[2]}` : '';
}

function filesOf(lines) {
  const q = lines.find((l) => l.startsWith('> 涉及 '));
  if (!q) return '';
  return q.replace(/^>\s*/, '').trim();
}

function status(lines) {
  const l = lines.find((x) => x.startsWith('**今日状态**：'));
  return l ? l.replace(/^\*\*今日状态\*\*：/, '').trim() : '';
}

/**
 * 文件名安全化：去掉 Windows 非法字符与路径分隔符。
 * 截断时优先在标点/助词处断，避免把词切一半（「…然后一口气」这种）。
 */
function slugify(s, max = 22) {
  let t = s
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[，。、！？：；（）「」『』…—·]/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (t.length > max) {
    const cut = t.slice(0, max);
    // 回退到最后一个「读得断」的位置：标点已被去掉，这里退到常见停顿词或量词
    const stop = Math.max(
      cut.lastIndexOf('的'), cut.lastIndexOf('了'), cut.lastIndexOf('把'),
      cut.lastIndexOf('在'), cut.lastIndexOf('又'), cut.lastIndexOf('先'),
      cut.lastIndexOf('才'), cut.lastIndexOf('就'), cut.lastIndexOf('上'),
      cut.lastIndexOf('下'), cut.lastIndexOf('再'), cut.lastIndexOf('从'),
      cut.lastIndexOf('给'), cut.lastIndexOf('跟'), cut.lastIndexOf('和'),
    );
    t = stop > max * 0.6 ? cut.slice(0, stop) : cut;
  }
  return t || '日记';
}

async function main() {
  const projects = (await readdir(SRC, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  await mkdir(OUT, { recursive: true });

  const used = new Set();
  let count = 0;
  const rows = [];

  for (const proj of projects) {
    const dir = join(SRC, proj);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
    for (const fn of files) {
      const raw = await readFile(join(dir, fn), 'utf8');
      const lines = raw.split(/\r?\n/);
      const date = fn.replace(/\.md$/, '');
      const short = PROJ[proj] || proj;
      const note = projectNote(lines);
      const st = stats(lines);
      const filesLine = filesOf(lines);
      const todayState = status(lines);

      // 标题：项目 · 日期（首页卡片和文章页都只出现一次）
      // 正文开头已用引用块和「今日状态」交代了当天发生了什么，标题不再复述
      const title = `${short} · ${date}`;

      // summary：给首页卡片，直接用当天状态那句话
      const summary = todayState.length > 60 ? `${todayState.slice(0, 58)}…` : todayState;

      // 正文：去掉原 H1 / 元信息 blockquote / 今日状态 / 首条分隔线，
      // 换成一段引用块（项目说明 + 统计 + 涉及文件），再接原正文。
      let body = lines.slice();
      let i = 0;
      // 跳过 H1
      while (i < body.length && !body[i].trim()) i++;
      if (i < body.length && body[i].startsWith('# ')) i++;
      // 跳到「今日状态」之后
      const stIdx = body.findIndex((l) => l.startsWith('**今日状态**：'));
      if (stIdx >= 0) i = stIdx + 1;
      // 吃掉紧随的空行与第一条 ---
      while (i < body.length && (body[i].trim() === '' || body[i].trim() === '---')) i++;
      body = body.slice(i);

      // ### ✦ → ##（H1 已被 title 占用；Toc 只收 h2/h3）
      body = body.map((l) => l.replace(/^### ✦\s*/, '## '));

      const head = [];
      if (note) head.push(`> ${note}`);
      if (st || filesLine) {
        head.push(`> ${[st, filesLine].filter(Boolean).join(' · ')}`.replace(/·\s*·/g, '·'));
      }
      head.push('>');
      head.push(`> **今日状态**：${todayState}`);

      const fm = [
        '---',
        `title: ${JSON.stringify(title)}`,
        `date: ${date}`,
        `summary: ${JSON.stringify(summary)}`,
        'draft: false',
        '---',
        '',
      ].join('\n');

      const out = [fm, ...head, '', ...body].join('\n').replace(/\n{4,}/g, '\n\n\n');

      let name = `${date}-${slugify(todayState)}.md`;
      let n = 2;
      while (used.has(name)) {
        name = `${date}-${slugify(short, 10)}-${slugify(todayState)}-${n}.md`;
        n++;
      }
      used.add(name);

      await writeFile(join(OUT, name), out, 'utf8');
      count++;
      rows.push({ proj, date, name, title });
    }
  }

  console.log(`已生成 ${count} 篇到 ${OUT}`);
  const byProj = {};
  for (const r of rows) byProj[r.proj] = (byProj[r.proj] || 0) + 1;
  for (const [k, v] of Object.entries(byProj).sort()) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
