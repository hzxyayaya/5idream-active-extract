# 5idream Playwright Helpers

这个项目用于通过 Playwright 访问 `https://www.5idream.net/`，保存登录态，并提取“我的活动”里处于“报名中”或“进行中”的活动详情。

当前目录位置：

`D:\Documents\codex\apps\5idream-scraper`

## 可用命令

- `npm run login`
  - 打开 5idream 首页，等待你手动扫码登录，并保存登录态
- `npm run open`
  - 复用已保存的登录态打开首页，用于确认登录状态是否仍然有效
- `npm run detect`
  - 探测公开页面是否存在账号密码登录表单
- `npm run extract-activities`
  - 进入“我的活动”
  - 识别“报名中”或“进行中”的活动卡片
  - 打开活动详情页
  - 提取结构化内容并输出 Markdown、JSON、截图和原始文本

## 安装

```powershell
npm install
npx playwright install chromium
```

## 登录态

首次使用先执行：

```powershell
npm run login
```

登录态会保存到：

`playwright/.auth/5idream.json`

如果之后重新打开仍然出现扫码页，说明登录态已经失效，需要重新执行 `npm run login`。

## 活动提取

执行：

```powershell
npm run extract-activities
```

当前提取逻辑会优先处理“报名中”和“进行中”的活动，并输出以下字段：

- 活动时间
- 活动介绍
- 参与须知
- 学分设置
- 活动内容

如果正文里存在编号条目或列表内容，脚本会尽量把它们整理成单列的 Markdown 列表。

## 输出目录

输出位于：

`outputs/activities`

其中：

- `outputs/activities/md`
  - 保存主内容 Markdown 文件
- `outputs/activities/attachments`
  - 保存附件型产物：
  - 原始文本 `.txt`
  - 结构化数据 `.json`
  - 页面截图 `.png`
  - 汇总索引 `index.json`

## 当前限制

- 站点登录依赖扫码，不能直接用普通网页账号密码流替代
- 页面结构不是公开 API，脚本依赖当前页面布局和文案
- 如果活动详情页的结构发生变化，提取字段可能需要继续调整
