# Riji (我的日记本) 📓

一个基于 Electron + React + TypeScript 开发的现代个人日记应用。

## ✨ 功能特点

- **富文本编辑**：集成 Tiptap 编辑器，支持基础文本格式、占位符等。
- **多媒体支持**：支持在日记中插入图片和 YouTube 视频。
- **本地存储**：使用 IndexedDB (`idb`) 进行本地数据持久化，确保隐私与离线可用。
- **现代 UI**：基于 Tailwind CSS 和 Framer Motion 构建，具有流畅的动画效果和响应式设计。
- **跨平台桌面端**：通过 Electron 运行，提供原生窗口体验。

## 🛠️ 技术栈

- **前端框架**: [React 18](https://reactjs.org/)
- **构建工具**: [Vite](https://vitejs.dev/)
- **桌面框架**: [Electron](https://www.electronjs.org/)
- **编辑器**: [Tiptap](https://tiptap.dev/)
- **样式**: [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)
- **动画**: [Framer Motion](https://www.framer.com/motion/)
- **数据存储**: IndexedDB (via `idb`)

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 开发模式运行
在开发环境下同时启动 Vite 服务和 Electron：
```bash
npm run electron:dev
```

### 3. 构建应用
打包生成 Windows 平台的可执行文件 (`.exe`)：
```bash
npm run electron:build
```
生成的安装包将位于 `release` 目录下。

## 📁 项目结构
- `src/`: React 前端源代码。
- `electron/`: Electron 主进程配置。
- `index.html`: 应用入口文件。
- `启动日记本.bat`: 用于 Windows 的便捷启动脚本。

---
Made with ❤️ by [shi-tou1234](https://github.com/shi-tou1234)