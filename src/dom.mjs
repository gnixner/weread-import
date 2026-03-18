import { sanitizeFileName, cleanText } from './utils.mjs';
import { buildFrontmatter, writeBook } from './render.mjs';

export async function ensureShelfPage(page) {
  await page.goto('https://weread.qq.com/web/shelf', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const text = await page.locator('body').innerText();
  if (/登录二维码|扫一扫登录/.test(text)) throw new Error('当前浏览器未登录微信读书，请先登录后重试');
}

export async function getShelfBooksByDom(page) {
  return await page.evaluate(() => Array.from(document.querySelectorAll('a[href*="/web/reader/"]')).map(a => ({ href: a.href, title: ((a.innerText || '').trim().split('\n').filter(Boolean)[0] || '') })).filter(x => x.href && x.title));
}

export async function openNotesPanel(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1800);
  const opened = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], div, span'));
    const button = candidates.find((el) => ((el.innerText || '').trim() === '笔记' || (el.getAttribute('title') || '') === '笔记'));
    if (!button) return false;
    button.click();
    return true;
  });
  if (!opened) throw new Error('未找到「笔记」按钮，页面结构可能已变更');
  await page.waitForTimeout(1200);
}

export async function extractBookNotesByDom(page) {
  return await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const notePanel = Array.from(document.querySelectorAll('*')).find((el) => (el.innerText || '').includes('我的笔记'));
    if (!notePanel) return { ok: false, error: 'note panel not found' };
    const copyButton = Array.from(document.querySelectorAll('*')).find((el) => (el.innerText || '').includes('复制全部笔记'));
    let copied = '';
    if (copyButton) {
      copyButton.click();
      await sleep(800);
      try { copied = await navigator.clipboard.readText(); } catch {}
    }
    return { ok: true, title: document.title || '未命名书籍', copied, panelText: (notePanel.innerText || '').trim() };
  });
}

export function buildMarkdownFromDom({ title, copied, panelText }) {
  const cleanTitle = sanitizeFileName(title || '未命名书籍');
  const source = cleanText(copied || panelText || '');
  const frontmatter = buildFrontmatter({
    title: cleanTitle,
    author: '未知',
    bookId: '',
    noteUpdatedIso: new Date().toISOString(),
    highlightCount: 0,
    reviewCount: 0,
  });
  return `${frontmatter}\n\n# ${cleanTitle}\n\n## 想法\n\n${source}\n`;
}

export async function importOneBookByDom(context, book, outputDir) {
  const page = await context.newPage();
  try {
    await page.goto(book.href, { waitUntil: 'domcontentloaded' });
    await openNotesPanel(page);
    const result = await extractBookNotesByDom(page);
    if (!result.ok) throw new Error(result.error || `DOM 提取失败: ${book.title}`);
    const writeResult = await writeBook(outputDir, book.title || result.title, buildMarkdownFromDom(result));
    return { title: book.title, filePath: writeResult.filePath, merged: false, mode: 'dom' };
  } finally {
    await page.close();
  }
}
