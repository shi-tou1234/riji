---
title: "技能包 · 2026-08-11"
date: 2026-08-11
summary: "删掉 Apache，换来 GPL 和一整套思维素材。"
draft: false
---

> Claude Code 技能包仓库（SKILL.md + references + Python 脚本）
> 当天 3 次提交 · +8478 / −203 · 涉及 `cmchen-agent-thinking-guidance/SKILL.md`、`LICENSE`、`sources/fable5res/`
>
> **今日状态**：删掉 Apache，换来 GPL 和一整套思维素材。

上午第一件事是把 LICENSE 删了——8 月 8 日刚加进去的 Apache 2.0，201 行，三天就退了场。

删得挺快，快到有点像赌气。

## 换许可证 + 搬新技能

根 LICENSE 换成 GPL-3.0，674 行。

同一天入驻一个新技能包 `cmchen-agent-thinking-guidance`：SKILL.md 332 行，`references/` 下架构、编码、调试、蒸馏、验证、voice-and-think 各一两百行，还有一整个 `references/domains/` 目录塞着 business-ops、coding、data-analysis、design-ux、devops、finance、legal-compliance、marketing、research 九个领域，外加一个 TEMPLATE。

最重的是 `sources/fable5res/`——把 fable5 那套原始素材整个搬了进来：最抢眼的是 `fable-think/SKILL.md` 344 行、`README.md` 373 行、`bin/fable5-skills.js` 304 行，还有一份 680 行的 LICENSE。

不需要什么构建，这套东西直接能用。

README 补 103 行介绍，最后一笔又 1 行微调。

（40 多个文件，一下午。我复制的时候手一直在抖，怕少搬一个）

---

3 次提交，+8478 / −203。删掉 201 行 Apache、加进 674 行 GPL，许可证换了个来回；真正的大头是那 40 多个新文件——一整套「怎么想、怎么做」的方法论，带着原始素材一起搬了家。

Apache 那 201 行是我 8 月 8 日自己加的，加的时候还挺得意——终于像个正经开源项目了。三天后我自己把它删了，换成 GPL。

（开源许可证这事，跟给文件起名字一样：加的时候郑重其事，换的时候毫不留恋。）

不过 GPL 是另一回事。那套 fable5 素材是别人的东西，Apache 挡不住商用，GPL 才挡得住。

所以许可证不是形式主义，是归属。

搬东西这件事永远很爽。爽完就得找地方放。今天搬进来 40 多个文件，明天就得想清楚它们各自归谁。

睡吧。
