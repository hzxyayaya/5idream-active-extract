const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = 'https://www.5idream.net/';
const STORAGE_STATE = path.join(__dirname, '..', 'playwright', '.auth', '5idream.json');

function getContextOptions() {
  if (fs.existsSync(STORAGE_STATE)) {
    return { storageState: STORAGE_STATE };
  }

  console.warn('未找到登录态文件: ' + STORAGE_STATE);
  console.warn('将直接打开页面，你需要先执行 npm run login 完成扫码登录。');
  return {};
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-proxy-server'],
  });
  const context = await browser.newContext(getContextOptions());
  const page = await context.newPage();

  await page.goto(BASE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  await page.waitForLoadState('networkidle').catch(() => {});

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const appearsLoggedOut = /扫一扫登录|扫码登录|到梦空间APP扫一扫登录/i.test(bodyText);

  if (appearsLoggedOut) {
    console.warn('当前仍处于未登录状态，已保存的登录态可能失效。');
  } else {
    console.log('页面看起来处于已登录状态。');
  }

  console.log('当前页面: ' + page.url());

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
