# 5idream Workspace

本仓库用于抓取 `https://www.5idream.net/` 的“我的活动”信息，并把这些能力包装成可供 agent 调用的 MCP 服务。

仓库包含两个子项目：

- [apps/5idream-scraper](/D:/Documents/codex/apps/5idream-scraper)
  - 用 Playwright 处理扫码登录、活动列表扫描、详情提取、增量同步
- [apps/5idream-mcp](/D:/Documents/codex/apps/5idream-mcp)
  - 用 stdio MCP 把 scraper 的能力暴露成 tools

## 适合谁用

- 想在本地自动抓取到梦空间活动信息的人
- 想让 agent 通过 MCP 读取活动内容并生成整理文档、todo、方案的人
- 想把登录、抓取、分析流程本地化的人

## 快速开始

### 1. 安装依赖

在仓库根目录执行：

```powershell
cd D:\Documents\codex
npm install
npx playwright install chromium
```

### 2. 扫码登录

```powershell
npm run scraper:login
```

会自动打开 5idream 首页，尝试点击“登录”，等待你扫码，登录态保存到：

`apps/5idream-scraper/playwright/.auth/5idream.json`

### 3. 抓取当前未结束活动

```powershell
npm run scraper:extract
```

当前抓取逻辑会：

- 自动进入“我的活动”
- 只保留当前未结束活动
- 先扫描当前活动列表摘要
- 删除本地已经过期的旧活动文件
- 只补抓本地缺失的活动详情
- 更新活动索引和当前列表快照

### 4. 如需给 agent 使用，启动 MCP

```powershell
npm run mcp:start
```

## 根目录命令

在仓库根目录可直接执行：

```powershell
npm run scraper:login
npm run scraper:open
npm run scraper:detect
npm run scraper:extract
npm run mcp:start
```

## 常见工作流

### 工作流 A：只想自己抓取活动

1. `npm install`
2. `npx playwright install chromium`
3. `npm run scraper:login`
4. `npm run scraper:extract`
5. 查看输出目录中的 Markdown、JSON、截图

### 工作流 B：想让 agent 帮你分析活动

1. `npm run scraper:login`
2. `npm run scraper:extract`
3. `npm run mcp:start`
4. 让 agent 通过 `5idream` MCP 读取活动 Markdown 并生成总结文档

## 输出目录

抓取结果位于：

- [md](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/md)
- [attachments](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/attachments)

其中主要文件包括：

- `md/*.md`
  - 每个活动的结构化 Markdown
- `attachments/*.json`
  - 每个活动的结构化数据
- `attachments/*.txt`
  - 页面原始文本
- `attachments/*.png`
  - 页面截图
- [index.json](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/attachments/index.json)
  - 当前已成功落盘的活动索引
- [current-list.json](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/attachments/current-list.json)
  - 当前列表页扫描得到的未结束活动摘要

## 当前功能

- 扫码登录并保存登录态
- 登录失效时在抓取流程中自动恢复
- 扫描当前未结束活动
- 增量同步本地活动文档
- 通过 MCP 暴露抓取与读取能力
- 基于活动 Markdown 继续生成整理文档

## 目录结构

```text
D:\Documents\codex
├─ apps
│  ├─ 5idream-scraper
│  └─ 5idream-mcp
├─ output
│  └─ doc
├─ package.json
└─ 5idream.code-workspace
```

## 子项目说明

- [apps/5idream-scraper/README.md](/D:/Documents/codex/apps/5idream-scraper/README.md)
  - 看抓取脚本如何使用
- [apps/5idream-mcp/README.md](/D:/Documents/codex/apps/5idream-mcp/README.md)
  - 看 MCP 服务如何接入 agent

## 已知限制

- 登录仍然依赖人工扫码
- 页面结构依赖站点当前 DOM 和文案
- 如果站点活动列表结构大改，选择器可能需要继续调整
- `extract_activities` 通过 MCP 调用时可能受调用方超时限制影响；直接跑本地脚本更稳定
