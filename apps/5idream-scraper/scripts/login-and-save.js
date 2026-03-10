const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = 'https://www.5idream.net/';
const AUTH_DIR = path.join(__dirname, '..', 'playwright', '.auth');
const STORAGE_STATE = path.join(AUTH_DIR, '5idream.json');
const LOGIN_TIMEOUT_MS = 3 * 60 * 1000;

function ensureAuthDir() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function logPageSignals(page) {
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      console.log('[nav] ' + frame.url());
    }
  });

  page.on('response', (response) => {
    const url = response.url();
    if (/login|user|auth|passport|sso/i.test(url)) {
      console.log('[resp] ' + response.status() + ' ' + url);
    }
  });
}

async function waitForLogin(page) {
  const startUrl = page.url();
  const pollIntervalMs = 1500;
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const currentUrl = page.url();
    const content = await page.locator('body').innerText().catch(() => '');
    const stillShowsQrLogin = /扫一扫登录|扫码登录|到梦空间APP扫一扫登录/i.test(content);
    const looksLoggedIn = currentUrl !== startUrl || /退出|个人中心|我的活动|我的学分|消息中心/i.test(content);

    if (looksLoggedIn && !stillShowsQrLogin) {
      return;
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  throw new Error('Timed out after '+ (LOGIN_TIMEOUT_MS / 1000) + 's waiting for login completion.');
}

async function main() {
  ensureAuthDir();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  logPageSignals(page);

  await page.goto(BASE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  console.log('请在 180 秒内使用 到梦空间 APP 扫码登录。');

  await waitForLogin(page);

  await context.storageState({ path: STORAGE_STATE });
  console.log('登录态已保存: ' + STORAGE_STATE);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
