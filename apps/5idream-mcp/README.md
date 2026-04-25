# 5idream MCP Server

这个目录提供一个本地 stdio MCP 服务，用来把 `apps/5idream-scraper` 的能力暴露给 agent。

项目目录：

`D:\Documents\codex\apps\5idream-mcp`

## 这个 MCP 能做什么

它本身不直接抓网页，而是包装上层 scraper 脚本，向 agent 提供这些能力：

- 登录 5idream
- 检查登录态
- 探测公开登录方式
- 抓取当前活动
- 列出活动 Markdown
- 读取单个活动 Markdown
- 列出附件
- 读取附件

这些 Markdown 已经包含 scraper 生成的结构化字段和列表渲染结果，适合继续让 agent 做总结、方案整理和待办提炼。

## 暴露的工具

- `login_5idream`
- `check_login_5idream`
- `detect_login_options`
- `extract_activities`
- `list_activity_markdown`
- `get_activity_markdown`
- `get_activity_index`
- `list_activity_attachments`
- `get_activity_attachment`

## 安装

建议直接在仓库根目录安装：

```powershell
cd D:\Documents\codex
npm install
```

如果只想在当前目录安装：

```powershell
cd D:\Documents\codex\apps\5idream-mcp
npm install
```

## 启动

在仓库根目录：

```powershell
npm run mcp:start
```

或者在当前目录：

```powershell
cd D:\Documents\codex\apps\5idream-mcp
npm start
```

这个服务通过 stdio 和 MCP client 通信，不监听 HTTP 端口。

## 它依赖哪些上层脚本

MCP 实际调用的是这些脚本：

- [login-and-save.js](/D:/Documents/codex/apps/5idream-scraper/scripts/login-and-save.js)
- [open-with-state.js](/D:/Documents/codex/apps/5idream-scraper/scripts/open-with-state.js)
- [detect-login-options.js](/D:/Documents/codex/apps/5idream-scraper/scripts/detect-login-options.js)
- [extract-active-activities.js](/D:/Documents/codex/apps/5idream-scraper/scripts/extract-active-activities.js)

## 依赖哪些输出目录

MCP 读取的是 scraper 的输出目录：

- [md](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/md)
- [attachments](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/attachments)

重点文件：

- [index.json](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/attachments/index.json)
- [current-list.json](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/attachments/current-list.json)

## 推荐调用顺序

### 场景 A：第一次使用

1. `login_5idream`
2. `extract_activities`
3. `list_activity_markdown`
4. `get_activity_markdown`

### 场景 B：已经登录过

1. `check_login_5idream`
2. `extract_activities`
3. `get_activity_index`
4. 按需读取 Markdown 和附件

## 典型用途

这个 MCP 很适合让 agent 做这些事：

- 生成活动整理文档
- 生成 checklist / todo
- 生成每个活动的处理方案
- 生成固定 prompt
- 基于活动文档继续做总结分析

## 集成方式

如果你的 agent 支持通过命令启动本地 MCP 进程，可以配置为启动：

```powershell
node D:\Documents\codex\apps\5idream-mcp\server.js
```

或者：

```powershell
cd D:\Documents\codex\apps\5idream-mcp
npm start
```

## 使用时要注意

- `extract_activities` 的执行时间取决于活动数量
- 如果登录态过期，调用过程中可能会等待人工扫码
- 如果 MCP client 对单次 tool call 超时限制较短，可能会超时
- 这种情况下，可以优先直接跑本地脚本：

```powershell
npm run scraper:extract
```

然后再让 MCP 读取已经生成的活动结果

## 已知限制

- 登录仍然依赖人工扫码
- 服务本身依赖 scraper 的输出目录
- 如果 scraper 还没成功跑完，某些读取类 tool 可能读不到最新内容
