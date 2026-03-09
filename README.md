# 5idream Playwright Helpers

可用命令：

- npm run login：打开 5idream 首页，手动扫码登录并保存登录态
- npm run open：复用已保存的登录态打开页面
- npm run detect：探测公开页面是否存在账号密码登录表单

首次使用前先安装依赖：

npm install
npx playwright install chromium

登录态文件位置：

playwright/.auth/5idream.json

如果后续仍然看到扫码页，说明登录态失效，需要重新执行 npm run login。
