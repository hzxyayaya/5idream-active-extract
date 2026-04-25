# 5idream Scraper

这个项目负责：

- 打开 5idream 网页
- 处理扫码登录
- 检查登录态是否有效
- 进入“我的活动”
- 扫描当前未结束活动
- 增量抓取缺失详情
- 输出 Markdown、JSON、截图和索引文件

项目目录：

`D:\Documents\codex\apps\5idream-scraper`

## 安装

在仓库根目录执行：

```powershell
cd D:\Documents\codex
npm install
npx playwright install chromium
```

也可以只在当前目录执行：

```powershell
cd D:\Documents\codex\apps\5idream-scraper
npm install
npx playwright install chromium
```

## 可用命令

### 登录

```powershell
npm run login
```

作用：

- 打开 5idream 首页
- 自动尝试点击“登录”
- 等待你扫码
- 保存登录态

保存位置：

`playwright/.auth/5idream.json`

### 检查登录态

```powershell
npm run open
```

作用：

- 使用已保存的登录态打开首页
- 粗略检查当前是否仍然像“已登录”

### 检测公开登录方式

```powershell
npm run detect
```

作用：

- 检查公开页面是否存在账号密码登录表单

### 抓取活动

```powershell
npm run extract-activities
```

作用：

- 自动进入“我的活动”
- 扫描当前活动列表
- 只保留未结束活动
- 登录态失效时自动尝试恢复并等待扫码
- 先生成当前活动摘要
- 用当前摘要和本地索引做对比
- 删除本地已过期活动
- 只抓取本地缺失的活动详情
- 更新索引

## 登录恢复逻辑

如果你在执行 `extract-activities` 时发现登录态已过期，脚本会：

- 检测登录页或“请重新登录”状态
- 自动尝试点击“登录”
- 等待你扫码
- 在扫码成功后刷新保存新的登录态
- 然后继续抓取

也就是说，正常情况下不需要手动先重新执行 `npm run login`。

## 增量同步逻辑

当前抓取不是全量覆盖，而是按两阶段同步：

### 第一阶段：扫描当前列表

脚本先只获取当前未结束活动的摘要信息，包括：

- 标题
- 状态
- 活动时间
- 活动地点
- 页码
- 活动签名

这部分会写入：

- [current-list.json](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/attachments/current-list.json)

### 第二阶段：同步本地输出

脚本再读取：

- [index.json](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/attachments/index.json)

然后执行：

- 当前列表中不存在的旧活动：删除对应文件
- 当前列表中存在且本地已有的活动：直接保留
- 当前列表中存在但本地没有的活动：进入详情页补抓

## 输出目录

输出位于：

`outputs/activities`

主要结构：

- [md](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/md)
  - 每个活动 1 个 Markdown 文件
- [attachments](/D:/Documents/codex/apps/5idream-scraper/outputs/activities/attachments)
  - 每个活动的 `.json`、`.txt`、`.png`
  - `index.json`
  - `current-list.json`

## 主要输出文件说明

### `md/*.md`

活动详情整理后的 Markdown，包含：

- 活动时间
- 活动介绍
- 参与须知
- 学分设置
- 活动内容

Markdown 渲染会尽量识别这些编号形式并转成有序列表：

- `一、二、三、`
- `（一）（二）（三）`
- `1. 2. 3.`
- `（1）（2）（3）`

并会尽量保留层级关系。

### `attachments/index.json`

当前已成功落盘的活动详情索引。

### `attachments/current-list.json`

当前“我的活动”列表里未结束活动的摘要快照。

## 常用命令示例

在仓库根目录执行：

```powershell
npm run scraper:login
npm run scraper:extract
```

在当前目录执行：

```powershell
cd D:\Documents\codex\apps\5idream-scraper
npm run login
npm run extract-activities
```

## 适合的后续用途

抓取完成后，你可以继续让 agent：

- 读取活动 Markdown
- 生成活动整合文档
- 生成 todo/checklist
- 为每个活动整理提交方案
- 生成固定格式的 prompt

## 已知限制

- 登录仍需人工扫码
- 活动识别依赖当前页面结构
- 如果站点改版，可能需要调整选择器
- 如果执行过程被中途打断，`index.json` 可能不会及时更新，建议重新执行一次抓取完成同步
- 对特别不规整的长段落编号文本，Markdown 列表拆分仍可能需要人工复核
