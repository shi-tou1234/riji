---
title: "磁盘管家 · 2026-09-21"
date: 2026-09-21
summary: "主题切换学 blog-starter，然后一口气同步 macOS / Linux。"
draft: false
---

> 磁盘空间管家 cmchen Sonar（C99 + 手写 HTTP 服务 + WebView2 宿主）
> 当天 12 次提交 · +21845 / −16827 · 涉及 `src/webassets.c`、`src/plat_posix.c`、`src/trash_posix.c`、`tools/run_tests_posix.sh`
>
> **今日状态**：主题切换学 blog-starter，然后一口气同步 macOS / Linux。

上午我还在琢磨那个主题切换动画怎么做得不那么生硬。

晚上，Mac 和 Linux 都得管了。

## 上午抄动画，下午就想去接 macOS

`e1566cc` 把主题切换的圆形揭示动画照搬过来——不是我想出来的，是从 blog-starter 抄的，但抄得挺顺。另外从别的项目借来两个东西：一层纯函数 `web/pure.js` 137 行，和 96 行的 Node 冒烟测试。

`e7549ff` 当天就修：揭示范围得盖住卡片区，独立快照名撤回。

抄来的东西就是这点不好——看着对，边缘对不上。返工是必然的。

`12a2018` 调细节，长期好习惯挪进侧栏，空间地图和三盏灯颜色对齐。

## v1.5.0 刚交出去，转身就成 v2.0.0

`1df0e58` 文档终稿，`PROGRESS.md` 143 行和 `BLOCKED.md` 5 行当场删掉——过程文件不带走。

（`BLOCKED.md` 才 5 行。我留着它其实就是想给自己留个「还没做完」的念想）

`4d5d510` 是这天的大工程：v2.0.0 同步支持 macOS / Linux，修三个 P0，去重并行化。

文件大搬家：`appwin.c` → `appwin_win.c`、`pickdir.c` → `pickdir_win.c`。新铺 `plat.h` 194 行、`plat_posix.c` 629 行、`plat_win.c` 611 行、`trash_posix.c` 506 行、`trash_win.c` 237 行、`crypto.c` 234 行、`pathutil.c` 48 行，外加 227 行的 `run_tests_posix.sh`。

一个 Win32 调用拆成两个文件，一个平台层铺开七个新文件。我手上没 Mac 也没 Linux，就一台 Windows。就这么着，也敢发 v2.0.0。

## 云端红了一整天，红到我都习惯了

v2.0.0 一交上去就被打回来。

`e7ebb1d` 修掉云端构建全部报错的根因，还把本地构建改得跟云端一样严格。

这招是我被打回来两次才想明白的——本地能编过，其实不算数。

`19ffbf3` v2.0.1 版本号对齐，Release 说明里干脆写清 v2.0.0 为什么编不过。

之后是一串细账：

- `6d6bebc` 两处只会在 POSIX 上炸的问题
- `47a670a` `run_tests.sh` 得先建 `build/` 再重定向日志
- `fede56e` `scan.h` 缺 `stddef.h`（macOS/ubuntu 红的真因）
- `a7fba2d` `webserver.c` 用 Win32 LONG 编不过 POSIX
- `1075d22` 把 POSIX 线程 join 的契约做真

（`fede56e` 那笔最冤。就一行头文件，三个平台红两个。我盯着红字的时候，脑子里只有一句：本地到底谁在骗我）

---

12 次提交，+21845 / −16827。

上午还在调主题动画，下午就去接 macOS 和 Linux，晚上跟云端编译错误磨到深夜。

这个 v2.0.0 交得一点都不体面，但每个红灯最后都变成了硬约束。

最后一条 Actions 从红转绿的时候，我第一件事不是欢呼，是把本地构建也重跑了一遍。

现在本地跟云端一样凶了。这样挺好。