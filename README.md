# 5idream Workspace

这个仓库现在按 npm workspace 组织，包含两个 app：

- [apps/5idream-scraper](D:/Documents/codex/apps/5idream-scraper)
  - 负责 Playwright 登录、活动抓取和结果输出
- [apps/5idream-mcp](D:/Documents/codex/apps/5idream-mcp)
  - 负责把抓取项目包装成 MCP `stdio` 服务，供 agent 调用

## 目录结构

```text
D:\Documents\codex
├─ apps
│  ├─ 5idream-scraper
│  └─ 5idream-mcp
├─ package.json
└─ 5idream.code-workspace
```

## Workspace 命令

在仓库根目录可以直接执行：

```powershell
npm run scraper:login
npm run scraper:open
npm run scraper:detect
npm run scraper:extract
npm run mcp:start
```

## 安装建议

如果要按 workspace 方式统一管理依赖，在仓库根目录执行：

```powershell
cd D:\Documents\codex
npm install
```

## 编辑器管理

已经提供了一个 multi-root workspace 文件：

- [5idream.code-workspace](D:/Documents/codex/5idream.code-workspace)

用它打开后，会同时加载：

- `apps/5idream-scraper`
- `apps/5idream-mcp`

## 推荐工作流

1. 先在 `apps/5idream-scraper` 完成扫码登录和活动抓取
2. 再在 `apps/5idream-mcp` 启动 MCP 服务
3. 让 agent 通过 MCP tools 读取抓取结果、分析内容并给出建议
