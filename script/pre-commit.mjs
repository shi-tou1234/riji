#!/usr/bin/env node
/**
 * pre-commit 钩子：每次提交前问一句「这段要不要写进开发日记？」
 *
 *   选「写」→ 把这次 staged 的 diff 交给 opencode，让它按 script/diary-style.md
 *             的文风规范写好一篇 .md 落到 src/content/diary/，
 *             然后跟代码一起进这次 commit。
 *   选「不写」→ 直接放行，什么都不发生。
 *
 * 两种情况会静默跳过，绝不卡住提交：
 *   · 非交互环境（GitHub Actions、脚本批处理、IDE 内嵌 git）
 *   · DIARY_SKIP=1（也可以写 SKIP_DIARY=1）
 *
 * 用哪个模型：不传 --model，直接沿用 opencode 当前的默认模型，
 * 也就是你此刻跟我对话用的那个。想临时换一个，设 DIARY_MODEL。
 *
 * 可调的环境变量：
 *   DIARY_MODEL    临时指定模型，如 opencode-go/space-bunny-free
 *   DIARY_TIMEOUT  AI 写稿超时秒数，默认 300
 *   DIARY_DRAFT=1  生成的日记写 draft: true（不发布），默认 false 直接发布
 *   DIARY_STRICT=1 AI 写失败时中止提交，而不是放行
 *   OPENCODE_BIN   指定 opencode 可执行文件路径
 *
 * 风格规范住在 script/diary-style.md。改那个文件，就改了以后所有日记的写法。
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const DIARY_DIR = join(REPO, 'src', 'content', 'diary');
const STYLE_MD = join(HERE, 'diary-style.md');

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

// 从正文里截一句当摘要：去掉 markdown 记号，压掉空白，掐到 30 字以内
function summaryOf(body) {
  const first = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('|') && !l.startsWith('-'));
  if (!first) return '';
  const clean = first
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[*_`>]/g, '')
    .trim();
  return clean.length > 30 ? clean.slice(0, 30) : clean;
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

/* ── 组 prompt ────────────────────────────────────────────── */

const fileList = fileRows.map(([f, s]) => `- ${f}  (${s})`).join('\n');

// 风格规范是硬约束。读不到就直接不写——宁可让提交过，也不写一篇跑偏的。
let style = '';
try {
  style = readFileSync(STYLE_MD, 'utf8');
} catch {
  console.error(bold(`\n✗ 读不到文风规范：${STYLE_MD}`));
  console.error(dim('  没有它就没法保证文风，先把 script/diary-style.md 补回来。\n'));
  process.exit(STRICT ? 1 : 0);
}

const prompt = [
  '给这个仓库写一篇开发日记，落到 `src/content/diary/` 下。',
  '',
  '## 第一件事：读文风规范',
  '',
  '先完整读一遍 `script/diary-style.md`，那是硬约束，不是建议。',
  '禁止清单里的东西一条都不许出现，写完必须按里面那份自查表逐条过一遍。',
  '',
  '**特别注意**：目录里那些旧日记是过去写的，风格已经废弃了，',
  '不要去学它们的排版和措辞，更不要学它们出现 commit 序号和增删行数的习惯。',
  '只按 `diary-style.md` 写。',
  '',
  '## 这次提交发生了什么',
  '',
  'commit message：',
  commitMsg ? commitMsg.split('\n').map((l) => `  ${l}`).join('\n') : '  （没写，用下面的 diff 自己判断）',
  '',
  `改动 ${fileRows.length} 个文件：`,
  fileList,
  '',
  diff ? '```diff\n' + diff + (diffTruncated ? '\n…（diff 太长，已截断）' : '') + '\n```' : '',
  '',
  '## 注意',
  '',
  `今天是 ${today()}，日记日期填 ${today()}。`,
  '上面这些文件名、diff、增删行数**只是给你理解发生了什么用的素材**，',
  '它们绝不允许出现在日记正文里。读者是一个完全不懂技术的人，',
  '看到 `Header.astro` 或者 `+385 / −0` 这种东西只会划走。',
  '',
  '把每处改动翻译成一个不懂技术的人能听懂的画面：他看见的是什么、之前什么样、现在什么样。',
  '比如「顶栏右上角那个『关于』的小入口，手机上老是被挤到屏幕外面去，今天终于老实待住了」，',
  '而不是「修复 Header.astro 的响应式布局」。',
  '',
  '## 文风规范全文',
  '',
  '```markdown',
  style,
  '```',
  '',
  '## 输出格式（重要）',
  '',
  '**不要写文件，不要用任何工具改这个仓库里的任何东西。**',
  '你只负责把日记的正文输出来，存文件是钩子自己的事。',
  '',
  '请按下面这个格式输出，一行多余的话都不要有：',
  '',
  '```',
  '@@@TITLE',
  '这里写标题，不要加书名号，不要加引号',
  '@@@END',
  '```',
  '',
  '只输出上面这一块。`@@@END` 之后不要写任何解释、总结或客套话。',
].join('\n');

/* ── 跑 ────────────────────────────────────────────────────── */

const cmd = /\.(cmd|bat)$/i.test(bin) ? 'cmd.exe' : bin;

// 它在一个空目录里干活，看不见这个仓库。
// 素材（文风规范、diff、commit message）都已经拼进 prompt 里了，
// 它不需要读仓库的任何文件，也不需要写任何文件——只负责吐字。
// 这样即使开了 --auto（不然它会卡在权限确认上等输入），
// 它能碰到的也只有一个空文件夹。
const sandbox = mkdtempSync(join(tmpdir(), 'diary-'));
try {
  writeFileSync(join(sandbox, 'AGENTS.md'), '这是一个空目录。不要读写任何文件，只输出文字。\n', 'utf8');
} catch {
  /* 写不进去也无所谓 */
}

const baseArgs = ['run', '--auto', prompt];
const args = /\.(cmd|bat)$/i.test(bin) ? ['/d', '/c', bin, ...baseArgs] : baseArgs;

// 不传 --model 就沿用 opencode 当前的默认模型
const model = process.env.DIARY_MODEL;
if (model) args.push('--model', model);

console.error(dim(`  正在写稿（最长 ${Math.round(TIMEOUT / 1000)} 秒，用 ${model || '当前默认模型'}）…`));

const result = await new Promise((resolve) => {
  let child;
  try {
    child = spawn(cmd, args, {
      cwd: sandbox,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' },
    });
  } catch (err) {
    resolve({ code: -1, reason: String(err), out: '' });
    return;
  }

  let out = '';
  child.stdout.on('data', (d) => (out += d.toString()));

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
    finish({ code: -1, reason: `超时 ${Math.round(TIMEOUT / 1000)} 秒`, out });
  }, TIMEOUT);

  child.on('error', (err) => finish({ code: -1, reason: String(err), out }));
  child.on('close', (code) => finish({ code, reason: `退出码 ${code}`, out }));
});

if (process.env.DIARY_VERBOSE === '1' && result.code === 0) {
  console.error(dim('  ── 原文 ──'));
  console.error(dim(result.out.trim()));
  console.error(dim('  ──────────'));
}

// 空文件夹没用了
try {
  rmSync(sandbox, { recursive: true, force: true });
} catch {
  /* 临时目录留在系统 temp 里也无所谓 */
}

function fail(msg, hint) {
  if (STRICT) {
    console.error(bold(`\n✗ ${msg}\n  ${hint}\n`));
    process.exit(1);
  }
  console.error(bold(`\n✗ ${msg}\n  ${dim(`${hint}\n  已放行本次提交。`)}\n`));
  process.exit(0);
}

if (result.code !== 0) {
  fail(`opencode 没写成（${result.reason}）`, '重跑一次就好，或设 DIARY_SKIP=1 临时关闭。');
}

/* ── 从输出里把日记抠出来，自己落盘 ────────────────────────── */

const m = result.out.match(/@@@TITLE\s*\r?\n([\s\S]*?)\r?\n?@@@END/);
if (!m) {
  fail(
    'opencode 的输出里找不到约定的日记内容',
    '它可能没按格式来。设 DIARY_VERBOSE=1 能看到原文，或者重跑一次（免费模型偶尔会跑偏）。',
  );
}

// 只取 END 之后的正文——END 之后的话是它自己的絮叨，不属于日记
const title = m[1].trim();
const body = result.out.slice(m.index + m[0].length);
if (!title || !body.trim()) {
  fail('opencode 给的标题或正文是空的', '重跑一次就好。');
}

// 标题里的路径分隔符和 Windows 非法字符会直接把文件写到别处去
const safeTitle = title.replace(/[\\/:*?"<>|]/g, '').trim();
if (!safeTitle) {
  fail(`标题「${title}」去掉非法字符后空了`, '换个说法重跑。');
}

const fileName = `${today()}-${safeTitle}.md`;

// 同名不覆盖，那天已经有一篇同名日记了
if (existsSync(join(DIARY_DIR, fileName))) {
  fail(`今天已经有一篇《${safeTitle}》了`, '换个标题重跑，或者把这一篇并进原来那篇。');
}

const full = [
  '---',
  `title: ${title}`,
  `date: ${today()}`,
  'summary: ' + (summaryOf(body) || '今天写代码写了一天。'),
  `draft: ${DRAFT ? 'true' : 'false'}`,
  '---',
  '',
  body.trim(),
  '',
].join('\n');

const relPath = join('src', 'content', 'diary', fileName);
try {
  writeFileSync(join(DIARY_DIR, fileName), full, 'utf8');
} catch (err) {
  fail(`写文件失败：${err.message}`, '检查一下 src/content/diary/ 的权限。');
}

git(['add', '--', relPath]);
console.error(green(`  + ${relPath}`));
console.error(green(`\n  已并入这次提交。`));
if (DRAFT) console.error(dim('  draft: true，记得改成 false 才会发布。'));
console.error('');
process.exit(0);
