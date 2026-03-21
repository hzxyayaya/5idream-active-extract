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

async function pageShowsQrOverlay(page) {
  const selectors = [
    '.messageMask:visible',
    '.loginmessageMask:visible',
    '#login-qrecode',
    '#log-login-qrecode',
  ];

  for (const selector of selectors) {
    const visible = await page.locator(selector).first().isVisible().catch(() => false);
    if (visible) {
      return true;
    }
  }

  const content = await page.locator('body').innerText().catch(() => '');
  return /扫一扫登录|扫码登录|到梦空间APP扫一扫登录/i.test(content);
}

async function waitForLogin(page) {
  const pollIntervalMs = 1500;
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const stillShowsQrLogin = await pageShowsQrOverlay(page);
    const stillShowsLoginEntry = await page.locator('a.logBtn.loginBtn, .indexloginBtn').first().isVisible().catch(() => false);
    const showsLoggedInUi = await page.locator('.loginquit, .userinfo, #navschoolname').first().isVisible().catch(() => false);
    const looksLoggedIn = showsLoggedInUi || (!stillShowsQrLogin && !stillShowsLoginEntry);

    if (looksLoggedIn) {
      return;
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  throw new Error('Timed out after '+ (LOGIN_TIMEOUT_MS / 1000) + 's waiting for login completion.');
}

async function clickLoginEntry(page) {
  const strategies = [
    async () => {
      await page.getByText('登录', { exact: true }).click({ timeout: 5000 });
    },
    async () => {
      await page.locator('a.logBtn.loginBtn').click({ timeout: 5000 });
    },
    async () => {
      await page.locator('.indexloginBtn').click({ timeout: 5000 });
    },
    async () => {
      await page.evaluate(() => {
        const selectors = ['a.logBtn.loginBtn', '.indexloginBtn', 'a.logBtn'];
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          if (node) {
            node.click();
            return true;
          }
        }

        const nodes = Array.from(document.querySelectorAll('a, button, div, span'));
        const loginNode = nodes.find((node) => node.textContent && node.textContent.trim() === '登录');
        if (loginNode) {
          loginNode.click();
          return true;
        }

        return false;
      });
    },
  ];

  for (const strategy of strategies) {
    try {
      await strategy();
      await page.waitForTimeout(1200);
      if (await pageShowsQrOverlay(page)) {
        return true;
      }
    } catch {
      // Try the next click strategy.
    }
  }

  return await pageShowsQrOverlay(page);
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

  await page.waitForTimeout(3000);
  const clicked = await clickLoginEntry(page);
  if (clicked) {
    console.log('已点击首页登录入口，请扫码完成登录。');
  } else {
    console.log('未找到明显的首页登录入口，直接等待登录完成。');
  }

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
