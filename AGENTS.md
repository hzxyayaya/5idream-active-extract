# AGENTS.md

## 5idream 活动流程

处理 5idream 活动抓取与整合时，优先使用项目内 skill，而不是 MCP 抓取。

显式调用方式：

```text
Use $5idream-local-activities at skills/5idream-local-activities to refresh local 5idream activities with the Node scraper and generate the latest Chinese integration markdown.
```

该 skill 会指导 agent：

- 在 `apps/5idream-scraper` 中直接运行 `node scripts/extract-active-activities.js`
- 使用 `apps/5idream-scraper/outputs/activities/attachments/current-list.json` 作为当前未结束活动的权威列表
- 读取 `apps/5idream-scraper/outputs/activities/md` 中的活动 Markdown
- 继承上一版整合文档顶部 Checklist 的主勾选和备注子项
- 生成新的中文整合 Markdown
- 将未完成活动排在前面，已完成活动排在后面

如果登录态失效：

- 允许用户扫码登录
- 登录完成后继续运行本地 Node 抓取脚本
