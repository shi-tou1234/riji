#!/usr/bin/env node
/**
 * pre-commit 钩子：每次提交前问一句「这段要不要写进开发日记？」
 *
 *   选「写」→ 把这次 staged 的 diff 交给 opencode，让它照你既有文风写好一篇
 *             .md 落到 src/content/diary/，然后跟代码一起进这次 commit。
 *   选「不写」→ 直接放行，什么都不发生。
 *
 * 两种情况会静默跳过，绝不卡住提交：
 *   · 非交互环境（GitHub Actions、脚本批处理、IDE 内嵌 git）
 *   · DIARY_SKIP=1（也可以写 SKIP_DIARY=1）
 *
 * 可调的环境变量：
 *   DIARY_MODEL    指定模型，如 opencode-go/space-bunny-free
 *   DIARY_TIMEOUT  AI 写稿超时秒数，默认 300
 *   DIARY_DRAFT=1  生成的日记写 draft: true（不发布），默认 false 直接发布
 *   DIARY_STRICT=1 AI 写失败时中止提交，而不是放行
 *   OPENCODE_BIN   指定 opencode 可执行文件路径
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const DIARY_DIR = join(REPO, 'src', 'content', 'diary');

const TIMEOUT = Number(process.env.DIARY_TIMEOUT || 300) * 1000;
const DRAFT = process.env.DIARY_DRAFT === '1';
const STRICT = process.env.DIARY_STRICT === '1';

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

/* ── git 小工具 ───────────────────────────────────────────── */

function git(args) {
  return spawnSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
}

function gitText(args) {
  const r = git(args);
  return r.status === 0 ? (r.stdout || '') : '';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ── 出口条件：不该打扰就立刻安静退出 ───────────────────────── */

function bail(reason) {
  if (process.env.DIARY_VERBOSE === '1') console.error(dim(`  [diary] 跳过：${reason}`));
  process.exit(0);
}

if (process.env.DIARY_SKIP === '1' || process.env.SKIP_DIARY === '1') {
  bail('DIARY_SKIP=1');
}

// 没有暂存的东西没什么可写的
if (gitText(['diff', '--cached', '--name-only']).trim() === '') {
  bail('暂存区为空');
}

// CI / 批处理 / IDE 内嵌 git：没有 TTY 就不要提问
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  bail('非交互环境');
}

/* ── 收集这次提交的全部素材 ────────────────────────────────── */

const stagedNames = gitText(['diff', '--cached', '--name-only'])
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

// 只改了日记本身 → 没什么新东西可写
if (stagedNames.length > 0 && stagedNames.every((f) => f.replace(/\\/g, '/').startsWith('src/content/diary/'))) {
  bail('这次只动了日记文件');
}

// 本次改动
const numstat = gitText(['diff', '--cached', '--numstat']);
let plus = 0;
let minus = 0;
const fileRows = [];
for (const line of numstat.split(/\r?\n/)) {
  if (!line.includes('\t')) continue;
  const [a, d, ...rest] = line.split('\t');
  const file = rest.join('\t').trim();
  const na = Number(a);
  const nd = Number(d);
  const binary = a === '-' || d === '-';
  if (!binary) {
    plus += na;
    minus += nd;
  }
  fileRows.push([file, binary ? '二进制' : `+${na} / −${nd}`]);
}

// 当天累计（含本次）
let todayCount = Number(gitText(['rev-list', '--count', '--since=midnight', 'HEAD']).trim() || '0') + 1;
let dayPlus = plus;
let dayMinus = minus;
const dayNumstat = gitText(['log', '--since=midnight', '--numstat', '--format=']);
for (const line of dayNumstat.split(/\r?\n/)) {
  if (!line.includes('\t')) continue;
  const [a, d] = line.split('\t');
  const na = Number(a);
  const nd = Number(d);
  if (!Number.isNaN(na)) dayPlus += na;
  if (!Number.isNaN(nd)) dayMinus += nd;
}

// commit message（git 已经把待用信息写进 COMMIT_EDITMSG 了）
let commitMsg = '';
try {
  const editMsg = readFileSync(join(REPO, '.git', 'COMMIT_EDITMSG'), 'utf8');
  commitMsg = editMsg
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'))
    .join('\n')
    .trim();
} catch {
  /* 没有就算了，不影响 */
}

// 最近几篇日记，让 AI 自己读去学文风
let recent = [];
try {
  recent = readdirSync(DIARY_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, 3);
} catch {
  /* 目录不存在就算了 */
}

// diff 正文，长的截断
let diff = gitText(['diff', '--cached']);
const DIFF_CAP = 24000;
let diffTruncated = false;
if (diff.length > DIFF_CAP) {
  diff = diff.slice(0, DIFF_CAP);
  diffTruncated = true;
}

/* ── 问一句 ────────────────────────────────────────────────── */

const shortList = fileRows.slice(0, 8).map(([f, s]) => `  ${f}  ${dim(s)}`);
const moreFiles = fileRows.length > 8 ? `\n  ${dim(`…另外还有 ${fileRows.length - 8} 个文件`)}` : '';

console.error('');
console.error(bold(cyan('✎ 写一篇开发日记？')));
console.error(`  ${dim(`本次 ${fileRows.length} 个文件 · +${plus} / −${minus}`)}`);
if (shortList.length) console.error(shortList.join('\n') + moreFiles);
console.error(dim('  选 y → 交给 opencode 照你的文风写好，和代码一起提交'));
console.error(dim('  选 n 或直接回车 → 跳过，继续提交'));

const rl = createInterface({ input: process.stdin, output: process.stdout });
let answer = '';
try {
  answer = (await rl.question(green('  要写吗？[y/N] '))).trim().toLowerCase();
} finally {
  rl.close();
}

if (answer !== 'y' && answer !== 'yes' && answer !== '是') {
  console.error(dim('  已跳过，继续提交。'));
  process.exit(0);
}

/* ── 找 opencode ──────────────────────────────────────────── */

function findOpencode() {
  const candidates = [];
  if (process.env.OPENCODE_BIN) candidates.push(process.env.OPENCODE_BIN);
  candidates.push(
    join(homedir(), '.opencode', 'bin', 'opencode'),
    join(homedir(), '.bun', 'bin', 'opencode'),
    join(homedir(), 'AppData', 'Roaming', 'npm', 'opencode.cmd'),
  );
  const local = process.env.LOCALAPPDATA;
  if (local) {
    candidates.push(
      join(local, 'Programs', '@opencodedesktop', 'resources', 'opencode-cli.exe'),
      join(local, 'Programs', 'opencode', 'bin', 'opencode.exe'),
    );
  }
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  // 退到 PATH 里找
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(finder, ['opencode'], { encoding: 'utf8', windowsHide: true });
  if (r.status === 0 && r.stdout) {
    const hit = r.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && existsSync(s) && !s.endsWith('.ps1'));
    if (hit) return hit;
  }
  return null;
}

const bin = findOpencode();
if (!bin) {
  const msg = '找不到 opencode 命令，无法自动写日记';
  if (STRICT) {
    console.error(bold(`\n✗ ${msg}\n  可以设 OPENCODE_BIN 指向可执行文件，或设 DIARY_SKIP=1 临时关闭。\n`));
    process.exit(1);
  }
  console.error(bold(`\n✗ ${msg}\n  ${dim('已放行本次提交，可稍后手动补一篇。')}\n`));
  process.exit(0);
}

/* ── 组 prompt ────────────────────────────────────────────── */

const fileList = fileRows.map(([f, s]) => `- ${f}  (${s})`).join('\n');

const prompt = [
  '给这个仓库写一篇开发日记，落到 `src/content/diary/` 下。',
  '',
  '## 先学文风',
  ...(recent.length
    ? [
        '先读这几篇，把语感吃透再动笔：',
        ...recent.map((f) => `- src/content/diary/${f}`),
        '',
        '注意：别学它们的排版模板，要学的是那种第一人称、有具体数字、有情绪起伏的讲法。',
      ]
    : ['去 `src/content/diary/` 随便挑两篇最近的读一遍，照着那个语感写。']),
  '',
  '## 这次提交发生了什么',
  '',
  `commit message：`,
  commitMsg ? commitMsg.split('\n').map((l) => `  ${l}`).join('\n') : '  （没写，用下面的 diff 自己判断）',
  '',
  `改动文件 ${fileRows.length} 个，共 +${plus} / −${minus}：`,
  fileList,
  '',
  diff ? '```diff\n' + diff + (diffTruncated ? '\n…（diff 太长，已截断）' : '') + '\n```' : '',
  '',
  `今天是 ${today()}。这篇日记日期填 ${today()}。`,
  `当天累计 ${todayCount} 次提交、+${dayPlus} / −${dayMinus}（含本次），如果开头要写统计就用这个数。`,
  '',
  '## 硬性格式要求',
  '',
  '文件名：`' + today() + '-标题.md`，标题要具体、有画面感，别用「继续优化」「修了一些 bug」这种。',
  '写之前先看看今天有没有同名的文件，有就换个说法，别覆盖。',
  '',
  'frontmatter 四个字段，一个都不能少：',
  '',
  '```yaml',
  '---',
  'title: 具体标题（不要加书名号）',
  `date: ${today()}`,
  "summary: 一句话，20 字以内",
  `draft: ${DRAFT ? 'true' : 'false'}`,
  '---',
  '```',
  '',
  'frontmatter 之后是引言块，四行结构：',
  '',
  '```',
  '> 项目名 · 说明一句话',
  `> 当天 ${todayCount} 次提交 · +${dayPlus} / −${dayMinus} · 涉及 \`文件\`、\`文件\``,
  '>',
  '> **今日状态**：一句话结论',
  '```',
  '',
  '正文：',
  '· 用 `##` 分 2~4 节，节标题短一点，别写成小作文',
  '· 讲清楚「为什么这么改」「踩了什么坑」「哪笔改动最贵」，行数、文件名、函数名都要落到具体数字',
  '· 第一人称，口语，允许有括号里的碎碎念和吐槽',
  '· 结尾用 `---` 隔开写两三句收尾，跟开头呼应',
  '· 别写总结报告的口吻，别列「本次改动：1. 2. 3.」这种流水账',
  '',
  '## 只做这一件事',
  '',
  '写完那一个 .md 文件就停。不要 git add、不要 git commit、不要跑 pnpm build、不要改别的文件。',
  '最后一行只输出你写的文件名，例如：`已写入 src/content/diary/xxxx.md`',
].join('\n');

/* ── 跑 ────────────────────────────────────────────────────── */

const before = existsSync(DIARY_DIR) ? new Set(readdirSync(DIARY_DIR)) : new Set();

const cmd = /\.(cmd|bat)$/i.test(bin) ? 'cmd.exe' : bin;
const args = /\.(cmd|bat)$/i.test(bin) ? ['/d', '/c', bin, 'run', '--auto', prompt] : ['run', '--auto', prompt];
if (process.env.DIARY_MODEL) args.push('--model', process.env.DIARY_MODEL);

console.error(dim(`  正在写稿（最长 ${Math.round(TIMEOUT / 1000)} 秒）…`));

const result = await new Promise((resolve) => {
  let child;
  try {
    child = spawn(cmd, args, {
      cwd: REPO,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' },
    });
  } catch (err) {
    resolve({ code: -1, reason: String(err) });
    return;
  }

  let settled = false;
  const finish = (r) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(r);
  };

  const timer = setTimeout(() => {
    // Windows 上要连带子进程一起收掉，不然 opencode 会在后台继续跑
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGKILL');
    }
    finish({ code: -1, reason: `超时 ${Math.round(TIMEOUT / 1000)} 秒` });
  }, TIMEOUT);

  child.on('error', (err) => finish({ code: -1, reason: String(err) }));
  child.on('close', (code) => finish({ code, reason: `退出码 ${code}` }));
});

if (result.code !== 0) {
  const msg = `opencode 没写成（${result.reason}）`;
  if (STRICT) {
    console.error(bold(`\n✗ ${msg}\n  已中止本次提交，修好后重试，或设 DIARY_SKIP=1 跳过。\n`));
    process.exit(1);
  }
  console.error(bold(`\n✗ ${msg}\n  ${dim('已放行本次提交，日记可以稍后补。')}\n`));
  process.exit(0);
}

/* ── 校验产物，然后跟代码一起提交 ──────────────────────────── */

const after = existsSync(DIARY_DIR) ? readdirSync(DIARY_DIR) : [];
const created = after.filter((f) => f.endsWith('.md') && !before.has(f));

if (created.length === 0) {
  console.error(bold(`\n✗ opencode 跑完了，但 src/content/diary/ 里没有新文件`));
  console.error(dim(`  已放行本次提交。可以自己跑一次看看，或者设 DIARY_STRICT=1 让它拦住提交。\n`));
  process.exit(STRICT ? 1 : 0);
}

for (const f of created) {
  const p = join('src', 'content', 'diary', f);
  git(['add', '--', p]);
  console.error(green(`  + ${p}`));
}

console.error(green(`\n  ${created.length} 篇日记已并入这次提交。`));
if (DRAFT) console.error(dim('  draft: true，记得改成 false 才会发布。'));
console.error('');
process.exit(0);
