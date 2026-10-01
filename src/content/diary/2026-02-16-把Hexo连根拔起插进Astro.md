---
title: "博客 · 2026-02-16"
date: 2026-02-16
summary: "把 Hexo 连根拔起，插进 Astro。"
draft: false
---

> Momo Blog（Astro 静态博客，中英双语 + 浏览器里直接发文的后台）
> 当天 60 次提交 · +19360 / −7600 · 涉及 `src/pages/admin.astro`、`src/components/comment/Comments.svelte`、`src/components/misc/Search.astro`、`astro.config.mjs`
>
> **今日状态**：把 Hexo 连根拔起，插进 Astro。

六十次提交。起点是一个只有一行 README 的空仓库，终点是一个能双语、能发文、能搜索的 Astro 博客。

中间还夹着一次刚搭好就反悔的换框架。

## 先搭了个 Hexo，转身就换成了 Astro

最早两笔很老实：`.github/workflows/pages.yml`、`_config.yml`、`package-lock.json`、`yarn.lock`，标准 Hexo 脚手架，`source/_posts` 里躺着 hello-world 和 welcome。

第三笔 `c45f434` 直接把整个 Momo 主题搬了进来。

这一刀砍得干净：`pnpm-lock.yaml` 加进 5041 行，`package-lock.json`（2725 行）和 `yarn.lock`（1575 行）当场进垃圾桶，`_config.yml` 少了 105 行，`scaffolds/` 里三份模板也一起走。

Astro 这边是全新的一间屋 —— `Header.astro` 360 行、`markdown.css` 731 行、六个 remark / rehype 插件一字排开。

（半小时前还在给 Hexo 装主题，半小时后就把它连锅端了。当时并不觉得浪费，只觉得「这个更顺手」。）

## 后台从零长出来，又瘦了一轮

`admin.astro` 是这一天真正的主角，第一次出现就 336 行，接着又 173 行。跨设备登录（密码哈希落在 `public/admin-security.json`）、后台可编辑的友链、头部 GitHub 与邮箱图标、复制邮箱时弹一条 toast。

然后功能开始长歪：先支持删任意一篇，再支持删「选中的那一篇」，删错了就用 `post: delete selected` 补回来。《一场不赶路的出走》当天就被这样删掉一次、又写回来一次。

再往后是 `4b67ee2` —— 后台 UI 砍掉 431 行，换来 283 行新的 `admin-service.ts`。功能没少，代码瘦了一圈。

## 那批示例文章跟着陪葬

`2233bdf` 清样例内容，删掉的行比留下的多得多：`test/` 下 katex、special、toc、card、draft、video、alert 八个目录中英文各一份，`markdown` 那两份 330 / 328 行的样稿，还有 intro 下的 comment、config、publish-blog。

真要说今天那 7600 行删减的最大一块，其实不是文章，是 Hexo 时代的 `package-lock.json` 和 `yarn.lock`，加起来 4300 行。骨架换了，锁文件就得跟着换。

## 评论区一直在喊「加载中」

`Comments.svelte` 这一天被按着改了九回：加超时、加快捷的 load-more 状态与重试反馈、HTTP 失败时保住已加载的列表、服务不可用时退回空状态、后端限流消息当成提交失败、页面加载就 hydrate 免得一直转圈。

搜索那边配了键盘快捷键和 focus trap，还把全局监听去重了一遍 —— 导航和搜索各挂一份同款监听，那种重复迟早让按钮按两下才动。

## 顺手的那几件

主题切换改成明暗直接对切，不再绕道；行内图片解码在 `rehype-figure-plugin.mjs` 里稳了一下；图片骨架屏和空评论提示；封面图铺满整个框，不再被顺手塞进正文；后台多图上传不用手填 slug。动效系统 `global.css` 一天里来回改了两次。

还有《一场不赶路的出走》—— 三门、台州、括苍，山村民宿、东湖、国清寺，配了八张照片。文字不算多，图不少。

---

今天 +19360 / −7600。加进去的大头是 `pnpm-lock.yaml` 那 5041 行锁文件，删掉的大头是两代包管理留下的旧账。

博客这东西第一天都是从「一个 README」开始的，剩下的全是慢慢长的部分。

（今天最值得记的其实是那句「删错了就补回来」。第一天就学会了怎么反悔。） ✿