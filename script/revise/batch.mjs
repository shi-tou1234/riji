#!/usr/bin/env node
/**
 * 批量修订旧日记的文风。
 *
 *   node script/revise/batch.mjs <文件...>          修订指定的日记
 *   node script/revise/batch.mjs --dir src/content/diary   修订整个目录
 *   node script/revise/batch.mjs --out <目录> <文件...>     输出到别处（不覆盖原文件）
 *
 * 走的是跟 pre-commit 一样的路子：opencode 在一个空临时目录里跑，
 * 看不见这个仓库，只能吐字，我们自己落盘。
 *
 * 环境变量：
 *   REVISE_MODEL    指定模型，不设就沿用 opencode 默认模型
 *   REVISE_TIMEOUT  单篇超时秒数，默认 240
 */

import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const STYLE_MD = join(HERE, '..', 'diary-style.md');

const TIMEOUT = Number(process.env.REVISE_TIMEOUT || 240) * 1000;

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

/* ── 参数 ──────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
let outDir = null;
let srcDir = null;
let manifest = null;
const files = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') outDir = resolve(argv[++i]);
  else if (a === '--dir') srcDir = resolve(argv[++i]);
  else if (a === '--manifest') manifest = resolve(argv[++i]);
  else files.push(resolve(a));
}

// 清单是给并行 worker 用的：Windows 命令行有长度上限，
// 245 个中文路径塞不进命令行，得从文件读。
if (manifest) {
  for (const line of readFileSync(manifest, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (s) files.push(resolve(s));
  }
}

if (srcDir) {
  for (const f of readdirSync(srcDir)) {
    if (f.endsWith('.md')) files.push(join(srcDir, f));
  }
}
files.sort();

if (files.length === 0) {
  console.error('用法：node script/revise/batch.mjs [--out 目录] [--dir 目录 | --manifest 清单] <文件...>');
  process.exit(1);
}

/* ── 找 opencode ───────────────────────────────────────────── */

function findOpencode() {
  const cands = [];
  if (process.env.OPENCODE_BIN) cands.push(process.env.OPENCODE_BIN);
  cands.push(
    join(homedir(), '.opencode', 'bin', 'opencode'),
    join(homedir(), '.bun', 'bin', 'opencode'),
    join(homedir(), 'AppData', 'Roaming', 'npm', 'opencode.cmd'),
  );
  if (process.env.LOCALAPPDATA) {
    cands.push(
      join(process.env.LOCALAPPDATA, 'Programs', '@opencodedesktop', 'resources', 'opencode-cli.exe'),
      join(process.env.LOCALAPPDATA, 'Programs', 'opencode', 'bin', 'opencode.exe'),
    );
  }
  for (const c of cands) if (c && existsSync(c)) return c;
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['opencode'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status === 0 && r.stdout) {
    const hit = r.stdout.split(/\r?\n/).map((s) => s.trim()).find((s) => s && existsSync(s) && !s.endsWith('.ps1'));
    if (hit) return hit;
  }
  return null;
}

const bin = findOpencode();
if (!bin) {
  console.error(red('找不到 opencode。设 OPENCODE_BIN 指向可执行文件。'));
  process.exit(1);
}

const style = readFileSync(STYLE_MD, 'utf8');

/* ── 单篇 ──────────────────────────────────────────────────── */

function buildPrompt(original) {
  return [
    '把这篇旧开发日记按新的文风规范重写一遍。',
    '',
    '## 铁律',
    '',
    '1. **保留原文中真实发生的事**。改了什么、踩了什么坑、最后怎么解决的、当时什么心情 —— 这些一个都不能丢，也不能再造。',
    '2. **删掉所有技术符号**：提交序号、增删行数、英文文件名、函数名、组件名、`.astro`/`.tsx` 这类后缀，全部不许出现。',
    '3. 旧文本里那些文件名和提交号，是「素材」不是「内容」。读懂它干了什么，然后用大白话把这个画面重新描一遍。',
    '4. 结构和篇幅可以变，但事情不能变。重写成一篇**新的日记**，不是逐句替换词语。',
    '5. 语气按规范来：元气活泼的甜美，写给完全不懂技术的人。',
    '',
    '## 旧日记原文',
    '',
    '```markdown',
    original,
    '```',
    '',
    '## 文风规范全文',
    '',
    '```markdown',
    style,
    '```',
    '',
    '## 输出格式',
    '',
    '**不要调用任何工具，不要写文件。** 只输出下面这两块，一行多余的话都不要有：',
    '',
    '```',
    '@@@TITLE',
    '这里写标题，不要加书名号，不要加引号',
    '@@@TITLEEND',
    '@@@INTRO',
    '> 这个网站（Astro 搭的小站，每天一篇开发日记）',
    '> 今天干了什么，一句话，大白话',
    '>',
    '> **今日状态**：一句话结论，带情绪',
    '@@@INTROEND',
    '@@@BODY',
    '这里直接写正文正文正文',
    '@@@BODYEND',
    '```',
    '',
    '`@@@TITLE` 到 `@@@TITLEEND` 之间只放标题，一行。',
    '`@@@INTRO` 到 `@@@INTROEND` 之间是**引言块**，四行（第三行只有一个 `>`）。',
    '`@@@BODY` 到 `@@@BODYEND` 之间是**正文**，直接从第一段开始写，不要再写引言块。',
    '`@@@BODYEND` 之后不要再有任何解释。',
  ].join('\n');
}

function runOnce(prompt) {
  const sandbox = mkdtempSync(join(tmpdir(), 'revise-'));
  try {
    writeFileSync(join(sandbox, 'AGENTS.md'), '这是一个空目录。不要读写任何文件，只输出文字。\n', 'utf8');
  } catch {
    /* 无所谓 */
  }

  // prompt 可能几万字（那种超长日志），塞进命令行会 ENAMETOOLONG。
  // 所以把 prompt 写进沙箱的 PROMPT.txt，用 -f 挂进去，让 opencode 去读。
  writeFileSync(join(sandbox, 'PROMPT.txt'), prompt, 'utf8');

  const isCmd = /\.(cmd|bat)$/i.test(bin);
  // opencode 新版对 -f 的相对路径解析不定（直接 spawn 时会报 File not found），
  // 一律给绝对路径。
  const base = ['run', '--auto', '-f', join(sandbox, 'PROMPT.txt'), '请读 PROMPT.txt，按里面的要求输出。只输出它要求的那几块，不要有额外解释。'];
  const args = isCmd ? ['/d', '/c', bin, ...base] : base;
  if (process.env.REVISE_MODEL) args.push('--model', process.env.REVISE_MODEL);

  const r = spawnSync(isCmd ? 'cmd.exe' : bin, args, {
    cwd: sandbox,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    timeout: TIMEOUT,
    killSignal: 'SIGKILL',
    env: { ...process.env, NO_COLOR: '1' },
  });

  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    /* 临时目录留着也无所谓 */
  }

  if (r.error) return { ok: false, why: r.error.code === 'ETIMEDOUT' ? `超时 ${TIMEOUT / 1000} 秒` : String(r.error.message) };
  if (r.status !== 0) return { ok: false, why: `退出码 ${r.status}` };
  return { ok: true, out: r.stdout || '' };
}

function pick(section, out) {
  // 惰性匹配 + 段名本身不能是另一个段名的前缀，所以逐个精确匹配
  const re = new RegExp(`\\r?\\n?@@@${section}\\r?\\n([\\s\\S]*?)\\r?\\n@@@${section}END`, 'i');
  const m = out.match(re);
  if (!m) return null;
  return m[1].trim();
}

function reviseOne(file) {
  const original = readFileSync(file, 'utf8');
  const r = runOnce(buildPrompt(original));
  if (!r.ok) return { file, ok: false, why: r.why };

  const title = pick('TITLE', r.out);
  const intro = pick('INTRO', r.out);
  const body = pick('BODY', r.out);

  if (!title || !intro || !body) {
    return { file, ok: false, why: '输出格式不对（缺 TITLE/INTRO/BODY）', raw: r.out };
  }

  // 旧日记的日期，保持不变。三个地方都找一遍：
  //   1) frontmatter 的 date:（站点里的日记）
  //   2) 文件名里的 YYYY-MM-DD（站点里的）
  //   3) 文件名里的 NN-YYYY-MM-DD- 时（测试目录里的按小时日志）
  const date =
    original.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ||
    basename(file).match(/(\d{4}-\d{2}-\d{2})/)?.[1] ||
    '2026-01-01';

  const full = ['---', `title: ${title}`, `date: ${date}`, 'draft: false', '---', '', intro, '', body, ''].join('\n');

  const dest = outDir ? join(outDir, `${date}-${title.replace(/[\\/:*?"<>|]/g, '').trim()}.md`) : file;
  writeFileSync(dest, full, 'utf8');

  // 记下「源文件 → 产出」的对应关系。
  // 事后靠标题猜同源极不可靠（重写后措辞全变，相似度全在 10% 以下），
  // 有了这张表，去重就是确定性的：同一个源出现多次，只留第一条。
  if (outDir) {
    const mapPath = join(outDir, '..', '.revise-manifests', 'map.tsv');
    appendFileSync(mapPath, `${file}\t${basename(dest)}\n`, 'utf8');
  }
  return { file, ok: true, title, dest };
}

/* ── 跑 ────────────────────────────────────────────────────── */

const model = process.env.REVISE_MODEL;
console.error(bold(`\n修订 ${files.length} 篇${model ? `（模型 ${model}）` : '（用当前默认模型）'}`));
if (outDir) console.error(dim(`输出到 ${outDir}`));
console.error(dim(`单篇最长 ${Math.round(TIMEOUT / 1000)} 秒\n`));

if (outDir && !existsSync(outDir)) {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(outDir, { recursive: true });
}

let ok = 0;
const failed = [];
const t0 = Date.now();

for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const label = `${String(i + 1).padStart(3)}/${files.length}`;
  process.stderr.write(dim(`  ${label}  ${f.replace(REPO, '.')} … `));

  const res = reviseOne(f);
  if (res.ok) {
    ok++;
    console.error(green('✓ ' + res.title));
  } else {
    failed.push(res);
    console.error(red('✗ ' + res.why));
    if (process.env.REVISE_DEBUG === '1' && res.raw) console.error(dim(res.raw.slice(0, 2000)));
  }
}

const mins = ((Date.now() - t0) / 60000).toFixed(1);
console.error(bold(`\n完成：成功 ${ok} / ${files.length}，耗时 ${mins} 分钟`));
if (failed.length) {
  console.error(red(`失败 ${failed.length} 篇：`));
  for (const f of failed) console.error(red(`  ${f.file.replace(REPO, '.')}  ${f.why}`));
}
console.error('');
process.exit(failed.length ? 1 : 0);