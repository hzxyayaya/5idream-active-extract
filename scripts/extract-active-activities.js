const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = 'https://www.5idream.net/';
const STORAGE_STATE = path.join(__dirname, '..', 'playwright', '.auth', '5idream.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'outputs', 'activities');
const MARKDOWN_DIR = path.join(OUTPUT_DIR, 'md');
const ATTACHMENTS_DIR = path.join(OUTPUT_DIR, 'attachments');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeFileName(value) {
  return String(value || 'untitled')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'untitled';
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findAllHeadingPositions(text, heading) {
  const positions = [];
  let start = 0;

  while (start < text.length) {
    const index = text.indexOf(heading, start);
    if (index === -1) {
      break;
    }
    positions.push(index);
    start = index + heading.length;
  }

  return positions;
}

function extractSection(text, heading, nextHeadings, occurrence = 'last') {
  const positions = findAllHeadingPositions(text, heading);
  if (!positions.length) {
    return '';
  }

  const startIndex = occurrence === 'first' ? positions[0] : positions[positions.length - 1];
  const contentStart = startIndex + heading.length;

  let endIndex = text.length;
  for (const nextHeading of nextHeadings) {
    const nextIndex = text.indexOf(nextHeading, contentStart);
    if (nextIndex !== -1 && nextIndex < endIndex) {
      endIndex = nextIndex;
    }
  }

  return normalizeText(text.slice(contentStart, endIndex));
}

function formatListLikeContent(value) {
  const text = normalizeText(value);
  if (!text) {
    return '';
  }

  const numberedParts = text
    .replace(/([。；])\s*(\d+[.、])/g, '$1\n$2')
    .split(/\n(?=\d+[.、])/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (numberedParts.length > 1 || /^\d+[.、]/.test(numberedParts[0] || '')) {
    return numberedParts
      .map((part) => part.replace(/^(\d+)[.、]\s*/, '$1. '))
      .join('\n');
  }

  const lineParts = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (lineParts.length > 1) {
    return lineParts.map((part) => '- ' + part).join('\n');
  }

  return text;
}

function buildMarkdown(sections) {
  const parts = [
    '# ' + sections.title,
    '',
    '- 报名时间: ' + (sections.registrationTime || '未提取到'),
    '',
    '## 活动介绍',
    sections.introduction || '未提取到',
    '',
    '## 参与须知',
    sections.notes || '未提取到',
    '',
    '## 学分设置',
    sections.credits || '未提取到',
    '',
    '## 活动内容',
    sections.content || '未提取到',
    '',
  ];

  return parts.join('\n');
}

function extractStructuredSections(content, title, url) {
  const normalized = normalizeText(content);

  const registrationTimeMatch = normalized.match(/报名时间[:：]?\s*([^\n]+)/);
  const registrationTime = registrationTimeMatch ? registrationTimeMatch[1].trim() : '';

  const introduction = formatListLikeContent(
    extractSection(normalized, '活动介绍', ['参与须知', '奖项设置', '学分设置', '活动标签', '活动详情'], 'last')
  );
  const notes = formatListLikeContent(
    extractSection(normalized, '参与须知', ['奖项设置', '学分设置', '活动标签', '活动详情'], 'last')
  );
  const credits = formatListLikeContent(
    extractSection(normalized, '学分设置', ['活动标签', '活动详情', '相关附件', '到梦简介'], 'last')
  );
  const contentSection = formatListLikeContent(
    extractSection(normalized, '活动详情', ['相关附件', '到梦简介'], 'last') ||
    extractSection(normalized, '活动内容', ['相关附件', '到梦简介'], 'last') ||
    introduction
  );

  return {
    title,
    url,
    registrationTime,
    introduction,
    notes,
    credits,
    content: contentSection,
  };
}

function getContextOptions() {
  if (!fs.existsSync(STORAGE_STATE)) {
    throw new Error('Missing storage state. Run npm run login first.');
  }

  return { storageState: STORAGE_STATE };
}

async function ensureLoggedIn(page) {
  await page.goto(BASE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  await page.waitForLoadState('networkidle').catch(() => {});

  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (/扫一扫登录|扫码登录|到梦空间APP扫一扫登录/i.test(bodyText)) {
    throw new Error('Stored login state is no longer valid. Run npm run login again.');
  }
}

async function openMyActivities(page) {
  const hasActivityCards = async () => {
    const count = await page.locator('div').filter({ has: page.locator('text=活动地点') }).count().catch(() => 0);
    return count > 0;
  };

  if (await hasActivityCards()) {
    return;
  }

  const tabCandidates = [
    page.getByRole('link', { name: '我报名的', exact: true }),
    page.locator('a').filter({ hasText: '我报名的' }),
    page.locator('li').filter({ hasText: '我报名的' }),
    page.locator('span').filter({ hasText: '我报名的' }),
  ];

  for (const locator of tabCandidates) {
    const candidate = locator.first();
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click().catch(() => {});
      await page.waitForTimeout(1500);
      if (await hasActivityCards()) {
        return;
      }
    }
  }

  const navCandidates = [
    page.getByRole('link', { name: '我的活动', exact: true }),
    page.locator('header a').filter({ hasText: '我的活动' }),
    page.locator('.header a').filter({ hasText: '我的活动' }),
    page.locator('a').filter({ hasText: '我的活动' }),
  ];

  let navClicked = false;
  for (const locator of navCandidates) {
    const candidate = locator.first();
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click();
      navClicked = true;
      break;
    }
  }

  if (!navClicked) {
    throw new Error('Could not find a visible navigation link for 我的活动.');
  }

  let tabClicked = false;
  for (const locator of tabCandidates) {
    const candidate = locator.first();
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click().catch(() => {});
      tabClicked = true;
      break;
    }
  }

  await page.waitForTimeout(1500);

  if (await hasActivityCards()) {
    return;
  }

  if (!tabClicked) {
    throw new Error('Entered 我的活动, but could not find 我报名的 and no activity cards were visible.');
  }
}

async function collectCards(page) {
  const cards = page.locator('div').filter({ has: page.locator('text=活动地点') });
  const count = await cards.count();
  const items = [];

  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);
    const text = (await card.innerText().catch(() => '')).trim();
    if (!text || !/活动地点/.test(text) || !/活动时间/.test(text)) {
      continue;
    }

    items.push({
      index: i,
      text,
      status: /已结束/.test(text) ? '已结束' : (/报名中/.test(text) ? '报名中' : (/进行中/.test(text) ? '进行中' : '未知')),
      title: (text.split(/\r?\n/)[0] || 'untitled').trim(),
    });
  }

  return { cards, items };
}

async function openDetailFromCard(card) {
  const candidates = [
    card.locator('img').first(),
    card.locator('h1, h2, h3, h4').first(),
    card.locator('a').filter({ hasText: '查看报名' }).first(),
    card.locator('a').filter({ hasText: '上传附件' }).first(),
    card.locator('a').first(),
    card.locator('p').first(),
    card.locator('div').first(),
  ];

  for (const locator of candidates) {
    if (await locator.count().catch(() => 0)) {
      if (await locator.isVisible().catch(() => false)) {
        const popupPromise = card.page().context().waitForEvent('page', { timeout: 3000 }).catch(() => null);
        await locator.click().catch(async () => {
          await card.click();
        });
        const popup = await popupPromise;
        return popup;
      }
    }
  }

  await card.click();
  return null;
}

async function extractCurrentPage(page, baseName) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1500);

  const title = ((await page.locator('h1, h2, h3, .title').first().innerText().catch(() => '')) || baseName).trim();
  const content = normalizeText(await page.locator('body').innerText().catch(() => ''));
  const fileBase = sanitizeFileName(baseName);
  const structured = extractStructuredSections(content, title, page.url());
  const markdown = buildMarkdown(structured);

  const textPath = path.join(ATTACHMENTS_DIR, fileBase + '.txt');
  const markdownPath = path.join(MARKDOWN_DIR, fileBase + '.md');
  const imagePath = path.join(ATTACHMENTS_DIR, fileBase + '.png');
  const metaPath = path.join(ATTACHMENTS_DIR, fileBase + '.json');

  fs.writeFileSync(textPath, content, 'utf8');
  fs.writeFileSync(markdownPath, markdown, 'utf8');
  fs.writeFileSync(metaPath, JSON.stringify(structured, null, 2) + '\n');
  await page.screenshot({ path: imagePath, fullPage: true });

  return { title, url: page.url(), textPath, markdownPath, imagePath, metaPath };
}

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(MARKDOWN_DIR);
  ensureDir(ATTACHMENTS_DIR);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext(getContextOptions());
  const page = await context.newPage();

  await ensureLoggedIn(page);
  await openMyActivities(page);

  const { cards, items } = await collectCards(page);
  const activeItems = items.filter((item) => item.status === '报名中' || item.status === '进行中');

  if (!activeItems.length) {
    throw new Error('No 报名中 or 进行中 activities were found on the current page.');
  }
  const results = [];

  for (let i = 0; i < activeItems.length; i += 1) {
    const item = activeItems[i];
    const card = cards.nth(item.index);
    await card.scrollIntoViewIfNeeded().catch(() => {});

    const fileBase = String(i + 1).padStart(2, '0') + '-' + item.title;
    console.log('Extracting: ' + fileBase);

    const popup = await openDetailFromCard(card);
    const targetPage = popup || page;
    const result = await extractCurrentPage(targetPage, fileBase);
    results.push(result);

    if (popup) {
      await popup.close().catch(() => {});
      await page.bringToFront();
    } else {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await openMyActivities(page);
    }

    await page.waitForTimeout(1200);
  }

  const indexPath = path.join(ATTACHMENTS_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(results, null, 2) + '\n');

  console.log('Done. Extracted count: ' + results.length);
  console.log('Output directory: ' + OUTPUT_DIR);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
