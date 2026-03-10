const { chromium } = require('playwright');

const TARGETS = [
  'https://www.5idream.net/',
  'https://report.5idream.net/login.html',
];

async function inspectPage(page, url) {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const inputs = await page.locator('input').evaluateAll((nodes) =>
    nodes.map((node) => ({
      type: node.getAttribute('type') || 'text',
      name: node.getAttribute('name') || '',
      id: node.getAttribute('id') || '',
      placeholder: node.getAttribute('placeholder') || '',
    }))
  );

  const buttons = await page.locator('button, input[type=button], input[type=submit], a').evaluateAll((nodes) =>
    nodes
      .map((node) => (node.innerText || node.getAttribute('value') || '').trim())
      .filter(Boolean)
      .slice(0, 20)
  );

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const hasPasswordField = inputs.some((input) => input.type.toLowerCase() === 'password');
  const hasUsernameHint = inputs.some((input) =>
    /user|phone|mobile|account|username|学号|手机号|账号/i.test(
      input.name + ' ' + input.id + ' ' + input.placeholder
    )
  );

  console.log('\n=== ' + url + ' ===');
  console.log('当前地址: ' + page.url());
  console.log('输入框: ' + JSON.stringify(inputs, null, 2));
  console.log('可见按钮/链接文本: ' + JSON.stringify(buttons, null, 2));
  console.log('判断结果: ' + ((hasPasswordField || hasUsernameHint) ? '疑似存在账号密码登录入口' : '未发现明显账号密码表单'));
  console.log('页面关键词摘要: ' + bodyText.slice(0, 300).replace(/\s+/g, ' '));
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  for (const url of TARGETS) {
    await inspectPage(page, url);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
