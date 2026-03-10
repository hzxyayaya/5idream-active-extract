# 5idream MCP Server

这个目录是一个独立的 MCP `stdio` 服务，用来包装上层目录里的 5idream Playwright 脚本。

它不会改动上层已有脚本，只是把这些能力暴露成 MCP tools，方便 agent 调用：

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

在这个目录下执行：

```powershell
cd D:\Documents\codex\apps\5idream-mcp
npm install
```

## 启动

```powershell
npm start
```

这个服务通过标准输入输出和 MCP client 通信，不监听 HTTP 端口。

启动后，服务会调用上层项目中的这些脚本：

- `D:\Documents\codex\apps\5idream-scraper\scripts\login-and-save.js`
- `D:\Documents\codex\apps\5idream-scraper\scripts\open-with-state.js`
- `D:\Documents\codex\apps\5idream-scraper\scripts\detect-login-options.js`
- `D:\Documents\codex\apps\5idream-scraper\scripts\extract-active-activities.js`

## 依赖的上层输出目录

服务会读取这些结果目录：

- Markdown: `D:\Documents\codex\apps\5idream-scraper\outputs\activities\md`
- 附件: `D:\Documents\codex\apps\5idream-scraper\outputs\activities\attachments`

## 推荐工作流

1. 先调用 `login_5idream`
2. 再调用 `extract_activities`
3. 调用 `get_activity_index`
4. 按需调用 `get_activity_markdown`
5. 让 agent 基于 Markdown 内容做分析和建议

## 接入思路

如果你的 agent 支持通过命令启动本地 MCP 进程，就把它配置成启动：

```powershell
node D:\Documents\codex\apps\5idream-mcp\server.js
```

或者在目录里执行：

```powershell
cd D:\Documents\codex\apps\5idream-mcp
npm start
```

适合在本地 agent 里作为子进程直接调用。
