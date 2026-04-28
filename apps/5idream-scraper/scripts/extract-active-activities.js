const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = 'https://www.5idream.net/';
const STORAGE_STATE = path.join(__dirname, '..', 'playwright', '.auth', '5idream.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'outputs', 'activities');
const MARKDOWN_DIR = path.join(OUTPUT_DIR, 'md');
const ATTACHMENTS_DIR = path.join(OUTPUT_DIR, 'attachments');
const INDEX_PATH = path.join(ATTACHMENTS_DIR, 'index.json');
const CURRENT_LIST_PATH = path.join(ATTACHMENTS_DIR, 'current-list.json');
const MANUAL_LOGIN_WAIT_MS = Number.parseInt(process.env.FIVEIDREAM_MANUAL_LOGIN_WAIT_MS || '20000', 10);
const LOGIN_POLL_INTERVAL_MS = 1500;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeReadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function fileExists(filePath) {
  return !!filePath && fs.existsSync(filePath);
}

function shortHash(value) {
  let hash = 0;
  const input = String(value || '');

  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(36).slice(0, 8);
}

function buildItemSignature(item) {
  return [
    item.title || '',
    item.activityTimeLine || '',
    item.activityLocationLine || '',
  ].join(' | ');
}

function buildFileBase(item) {
  return sanitizeFileName((item.title || 'untitled') + '-' + shortHash(buildItemSignature(item)));
}

function loadExistingIndex() {
  const entries = safeReadJson(INDEX_PATH, []);
  const map = new Map();

  for (const entry of entries) {
    if (!entry || !entry.signature) {
      continue;
    }

    const hasAllFiles =
      fileExists(entry.markdownPath) &&
      fileExists(entry.textPath) &&
      fileExists(entry.metaPath) &&
      fileExists(entry.imagePath);

    if (hasAllFiles) {
      map.set(entry.signature, entry);
    }
  }

  return map;
}

function cleanupOutputs(indexEntries) {
  const keepMarkdown = new Set(indexEntries.map((entry) => path.basename(entry.markdownPath)).filter(Boolean));
  const keepAttachments = new Set(
    ['index.json', 'current-list.json', ...indexEntries.flatMap((entry) => [
      path.basename(entry.textPath),
      path.basename(entry.metaPath),
      path.basename(entry.imagePath),
    ])].filter(Boolean)
  );

  for (const file of fs.readdirSync(MARKDOWN_DIR)) {
    if (!keepMarkdown.has(file)) {
      fs.rmSync(path.join(MARKDOWN_DIR, file), { force: true });
    }
  }

  for (const file of fs.readdirSync(ATTACHMENTS_DIR)) {
    if (!keepAttachments.has(file)) {
      fs.rmSync(path.join(ATTACHMENTS_DIR, file), { force: true });
    }
  }
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

function detectOrderedMarker(line) {
  const patterns = [
    { regex: /^([一二三四五六七八九十百千]+)、\s*/, level: 0 },
    { regex: /^(\d+)[.、]\s*/, level: 0 },
    { regex: /^[（(]([一二三四五六七八九十百千]+)[）)]\s*/, level: 1 },
    { regex: /^[（(](\d+)[）)]\s*/, level: 1 },
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern.regex);
    if (match) {
      return {
        level: pattern.level,
        marker: match[0],
        content: line.slice(match[0].length).trim(),
      };
    }
  }

  return null;
}

function splitListCandidates(text) {
  return text
    .replace(/([。；：!?])\s*(?=(?:[一二三四五六七八九十百千]+、|\d+[.、]|[（(][一二三四五六七八九十百千]+[）)]|[（(]\d+[）)]))/g, '$1\n')
    .replace(/\s+(?=(?:[一二三四五六七八九十百千]+、|\d+[.、]|[（(][一二三四五六七八九十百千]+[）)]|[（(]\d+[）)]))/g, '\n')
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatOrderedList(text) {
  const lines = splitListCandidates(text);
  const counters = [];
  const output = [];

  for (const line of lines) {
    const marker = detectOrderedMarker(line);
    if (!marker) {
      if (output.length) {
        output[output.length - 1] += ' ' + line;
      } else {
        output.push(line);
      }
      continue;
    }

    counters[marker.level] = (counters[marker.level] || 0) + 1;
    counters.length = marker.level + 1;

    const indent = '   '.repeat(marker.level);
    output.push(indent + counters[marker.level] + '. ' + (marker.content || ''));
  }

  return output.join('\n');
}

function formatListLikeContent(value) {
  const text = normalizeText(value);
  if (!text) {
    return '';
  }

  const orderedList = formatOrderedList(text);
  if (orderedList !== text) {
    return orderedList;
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
    '- 活动时间: ' + (sections.activityTime || '未提取到'),
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

  const activityTimeMatch = normalized.match(/活动时间[:：]?\s*([^\n]+)/);
  const activityTime = activityTimeMatch ? activityTimeMatch[1].trim() : '';

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
    activityTime,
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

async function pageShowsLogin(page) {
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

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const showsLoginText = /扫一扫登录|扫码登录|到梦空间APP扫一扫登录|请重新登录/i.test(bodyText);
  const showsLoginEntry = await page
    .locator('a.logBtn.loginBtn, .indexloginBtn')
    .first()
    .isVisible()
    .catch(() => false);

  return showsLoginText || showsLoginEntry;
}

async function waitForManualLogin(page) {
  const deadline = Date.now() + Math.max(MANUAL_LOGIN_WAIT_MS, 0);

  while (Date.now() < deadline) {
    const stillShowsQrLogin = await pageShowsLogin(page);
    const showsLoggedInUi = await page
      .locator('.loginquit, .userinfo, #navschoolname')
      .first()
      .isVisible()
      .catch(() => false);

    if (!stillShowsQrLogin || showsLoggedInUi) {
      return true;
    }

    await page.waitForTimeout(LOGIN_POLL_INTERVAL_MS);
  }

  const stillShowsQrLogin = await pageShowsLogin(page);
  const showsLoggedInUi = await page
    .locator('.loginquit, .userinfo, #navschoolname')
    .first()
    .isVisible()
    .catch(() => false);
  return !stillShowsQrLogin || showsLoggedInUi;
}

async function clickLoginButton(page) {
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
      if (await pageShowsLogin(page)) {
        return true;
      }
    } catch {
      // Try next strategy.
    }
  }

  return await pageShowsLogin(page);
}

async function ensureLoggedIn(page) {
  await page.goto(BASE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  await page.waitForLoadState('networkidle').catch(() => {});

  if (await pageShowsLogin(page)) {
    await page.waitForTimeout(3000);
    await clickLoginButton(page);
    await page.waitForLoadState('networkidle').catch(() => {});
    console.log('检测到登录页，等待最多 ' + MANUAL_LOGIN_WAIT_MS + 'ms 供手动完成登录。');
    const loggedIn = await waitForManualLogin(page);

    if (!loggedIn) {
      throw new Error(
        'Stored login state is no longer valid, and manual login did not complete within ' +
        MANUAL_LOGIN_WAIT_MS +
        'ms. Run npm run login again or increase FIVEIDREAM_MANUAL_LOGIN_WAIT_MS.'
      );
    }

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.context().storageState({ path: STORAGE_STATE });
    console.log('登录态已刷新保存: ' + STORAGE_STATE);
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

  await page.waitForTimeout(1500);

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

  throw new Error('Entered 我的活动, but no activity cards were visible on the default list or 我报名的.');
}

async function collectCards(page) {
  const cards = page.locator('div').filter({ has: page.locator('text=活动地点') });
  const count = await cards.count();
  const items = [];
  const seen = new Set();

  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);
    const text = (await card.innerText().catch(() => '')).trim();
    if (!text || !/活动地点/.test(text) || !/活动时间/.test(text)) {
      continue;
    }

     const locationMatches = text.match(/活动地点/g) || [];
     const timeMatches = text.match(/活动时间/g) || [];
     if (locationMatches.length !== 1 || timeMatches.length !== 1) {
       continue;
     }

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const title = lines.find((line) => !/^(我报名的|全部|已结束|报名中|进行中|未知)$/.test(line)) || 'untitled';
    if (title === '我报名的') {
      continue;
    }

    const activityTimeLine = lines.find((line) => /活动时间/.test(line)) || '';
    const activityLocationLine = lines.find((line) => /活动地点/.test(line)) || '';
    const signature = [title, activityTimeLine, activityLocationLine].join(' | ');
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);

    items.push({
      index: i,
      text,
      status: /已结束/.test(text) ? '已结束' : (/报名中/.test(text) ? '报名中' : (/进行中/.test(text) ? '进行中' : '未知')),
      title,
      signature,
      activityTimeLine,
      activityLocationLine,
    });
  }

  return { cards, items };
}

async function goToNextPage(page) {
  const firstCardTextBefore = await page
    .locator('div')
    .filter({ has: page.locator('text=活动地点') })
    .first()
    .innerText()
    .catch(() => '');

  const nextCandidates = [
    page.getByRole('link', { name: '下一页', exact: true }),
    page.getByRole('button', { name: '下一页', exact: true }),
    page.locator('a').filter({ hasText: '下一页' }),
    page.locator('button').filter({ hasText: '下一页' }),
    page.locator('li').filter({ hasText: '下一页' }),
    page.locator('[class*="next"]').filter({ hasText: '下一页' }),
  ];

  for (const locator of nextCandidates) {
    const candidate = locator.first();
    if (!(await candidate.isVisible().catch(() => false))) {
      continue;
    }

    const className = await candidate.getAttribute('class').catch(() => '');
    const text = (await candidate.innerText().catch(() => '')).trim();
    const ariaDisabled = await candidate.getAttribute('aria-disabled').catch(() => '');
    if (/disabled|forbid/.test(String(className || '')) || ariaDisabled === 'true' || !text) {
      return false;
    }

    const previousUrl = page.url();
    await candidate.click().catch(() => {});
    await page.waitForTimeout(1800);

    const firstCardTextAfter = await page
      .locator('div')
      .filter({ has: page.locator('text=活动地点') })
      .first()
      .innerText()
      .catch(() => '');
    const changed = previousUrl !== page.url() || firstCardTextAfter !== firstCardTextBefore;
    if (changed) {
      return true;
    }
  }

  const clickedNumericNext = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('a, button, li, span'));
    const pageNodes = nodes
      .map((node) => {
        const text = (node.textContent || '').trim();
        if (!/^\d+$/.test(text)) {
          return null;
        }

        const element = node;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return null;
        }

        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) {
          return null;
        }

        const className = `${element.className || ''} ${element.parentElement?.className || ''}`.toLowerCase();
        const ariaCurrent = (element.getAttribute('aria-current') || element.parentElement?.getAttribute('aria-current') || '').toLowerCase();
        const isCurrent =
          ariaCurrent === 'page' ||
          /(active|current|cur|selected|on)/.test(className);

        return {
          text,
          page: Number(text),
          isCurrent,
          className,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.page - b.page);

    if (!pageNodes.length) {
      return false;
    }

    let currentPage = pageNodes.find((node) => node.isCurrent)?.page;
    if (!currentPage) {
      currentPage = Math.min(...pageNodes.map((node) => node.page));
    }

    const nextPage = pageNodes.find((node) => node.page > currentPage);
    if (!nextPage) {
      return false;
    }

    const clickable = nodes.find((node) => (node.textContent || '').trim() === String(nextPage.page));
    if (!clickable) {
      return false;
    }

    clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }).catch(() => false);

  if (clickedNumericNext) {
    await page.waitForTimeout(1800);

    const firstCardTextAfter = await page
      .locator('div')
      .filter({ has: page.locator('text=活动地点') })
      .first()
      .innerText()
      .catch(() => '');
    if (firstCardTextAfter !== firstCardTextBefore) {
      return true;
    }
  }

  return false;
}

async function getCurrentActivitiesPageNumber(page) {
  return await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('a, button, li, span'));
    const pageNodes = nodes
      .map((node) => {
        const text = (node.textContent || '').trim();
        if (!/^\d+$/.test(text)) {
          return null;
        }

        const element = node;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return null;
        }

        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) {
          return null;
        }

        const className = `${element.className || ''} ${element.parentElement?.className || ''}`.toLowerCase();
        const ariaCurrent = (element.getAttribute('aria-current') || element.parentElement?.getAttribute('aria-current') || '').toLowerCase();
        const isCurrent =
          ariaCurrent === 'page' ||
          /(active|current|cur|selected|on)/.test(className);

        return {
          page: Number(text),
          isCurrent,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.page - b.page);

    if (!pageNodes.length) {
      return 1;
    }

    return pageNodes.find((node) => node.isCurrent)?.page || Math.min(...pageNodes.map((node) => node.page));
  }).catch(() => 1);
}

async function goToPageNumber(page, targetPageNumber) {
  const firstCardTextBefore = await page
    .locator('div')
    .filter({ has: page.locator('text=活动地点') })
    .first()
    .innerText()
    .catch(() => '');

  const currentPageNumber = await getCurrentActivitiesPageNumber(page);
  if (currentPageNumber === targetPageNumber) {
    return true;
  }

  const clicked = await page.evaluate((target) => {
    const nodes = Array.from(document.querySelectorAll('a, button, li, span'));
    const candidates = nodes.filter((node) => {
      const text = (node.textContent || '').trim();
      if (text !== String(target)) {
        return false;
      }

      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      const rect = node.getBoundingClientRect();
      return !!rect.width && !!rect.height;
    });

    const candidate = candidates[0];
    if (!candidate) {
      return false;
    }

    candidate.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, targetPageNumber).catch(() => false);

  if (!clicked) {
    return false;
  }

  await page.waitForTimeout(1800);

  const firstCardTextAfter = await page
    .locator('div')
    .filter({ has: page.locator('text=活动地点') })
    .first()
    .innerText()
    .catch(() => '');

  if (firstCardTextAfter !== firstCardTextBefore) {
    return true;
  }

  return (await getCurrentActivitiesPageNumber(page)) === targetPageNumber;
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

async function collectCurrentActivities(page) {
  const summaries = [];
  let pageNumber = 1;

  while (true) {
    const { items } = await collectCards(page);
    const pendingItems = items.filter((item) => item.status !== '已结束');

    for (const item of pendingItems) {
      summaries.push({
        title: item.title,
        status: item.status,
        signature: item.signature,
        activityTimeLine: item.activityTimeLine,
        activityLocationLine: item.activityLocationLine,
        pageNumber,
      });
    }

    if (!pendingItems.length && items.length) {
      break;
    }

    const moved = await goToNextPage(page);
    if (!moved) {
      break;
    }

    pageNumber += 1;
    await page.waitForTimeout(1500);
  }

  return summaries;
}

async function goToActivitiesPage(page, targetPageNumber) {
  await openMyActivities(page);
  const moved = await goToPageNumber(page, targetPageNumber);
  if (!moved) {
    throw new Error('Could not navigate to activity page ' + targetPageNumber + '.');
  }
}

async function syncActivityOutputs(page, currentActivities, existingIndex) {
  const results = [];

  for (const item of currentActivities) {
    const existingEntry = existingIndex.get(item.signature);
    if (existingEntry) {
      console.log('Keeping existing: ' + existingEntry.title + ' [' + item.status + ']');
      results.push({
        ...existingEntry,
        status: item.status,
        pageNumber: item.pageNumber,
        signature: item.signature,
      });
      continue;
    }

    await goToActivitiesPage(page, item.pageNumber);

    const { cards, items } = await collectCards(page);
    const targetItem = items.find((candidate) => candidate.signature === item.signature);
    if (!targetItem) {
      console.warn('Skipping missing card from current page scan: ' + item.title);
      continue;
    }

    const card = cards.nth(targetItem.index);
    await card.scrollIntoViewIfNeeded().catch(() => {});

    const fileBase = buildFileBase(item);
    console.log('Extracting: ' + fileBase + ' [' + item.status + ']');

    const popup = await openDetailFromCard(card);
    const targetPage = popup || page;
    const result = await extractCurrentPage(targetPage, fileBase);
    results.push({
      ...result,
      status: item.status,
      pageNumber: item.pageNumber,
      signature: item.signature,
    });

    if (popup) {
      await popup.close().catch(() => {});
      await page.bringToFront();
    } else {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }

    await page.waitForTimeout(1200);
  }

  return results;
}

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(MARKDOWN_DIR);
  ensureDir(ATTACHMENTS_DIR);

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-proxy-server'],
  });
  const context = await browser.newContext(getContextOptions());
  const page = await context.newPage();
  const existingIndex = loadExistingIndex();

  await ensureLoggedIn(page);
  await openMyActivities(page);

  const currentActivities = await collectCurrentActivities(page);
  fs.writeFileSync(CURRENT_LIST_PATH, JSON.stringify(currentActivities, null, 2) + '\n');

  if (!currentActivities.length) {
    throw new Error('No non-ended activities were found under 我的活动.');
  }

  const results = await syncActivityOutputs(page, currentActivities, existingIndex);

  if (!results.length) {
    throw new Error('No non-ended activities were found under 我的活动.');
  }

  cleanupOutputs(results);
  fs.writeFileSync(INDEX_PATH, JSON.stringify(results, null, 2) + '\n');

  console.log('Done. Extracted count: ' + results.length);
  console.log('Output directory: ' + OUTPUT_DIR);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
