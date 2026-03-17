#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const DEFAULT_OUTPUT = process.env.WEREAD_OUTPUT || path.resolve(process.cwd(), 'out', 'weread');
const DEFAULT_CDP = process.env.WEREAD_CDP_URL || 'http://127.0.0.1:9222';
const DEFAULT_TAGS = (process.env.WEREAD_TAGS || 'reading,weread').split(',').map((x) => x.trim()).filter(Boolean);
const WEREAD_BASE = 'https://weread.qq.com';

function parseArgs(argv) {
  const args = {
    all: false,
    book: null,
    bookId: null,
    author: null,
    output: DEFAULT_OUTPUT,
    cdp: DEFAULT_CDP,
    limit: null,
    force: false,
    tags: DEFAULT_TAGS,
    cookie: process.env.WEREAD_COOKIE || null,
    cookieFrom: 'manual',
    mode: process.env.WEREAD_IMPORT_MODE || 'auto',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') args.all = true;
    else if (arg === '--book') args.book = argv[++i] || null;
    else if (arg === '--book-id') args.bookId = argv[++i] || null;
    else if (arg === '--author') args.author = argv[++i] || null;
    else if (arg === '--output') args.output = argv[++i] || DEFAULT_OUTPUT;
    else if (arg === '--cdp') args.cdp = argv[++i] || DEFAULT_CDP;
    else if (arg === '--limit') args.limit = Number(argv[++i] || '0') || null;
    else if (arg === '--force') args.force = true;
    else if (arg === '--tags') args.tags = String(argv[++i] || '').split(',').map((x) => x.trim()).filter(Boolean);
    else if (arg === '--cookie') args.cookie = argv[++i] || null;
    else if (arg === '--cookie-from') args.cookieFrom = argv[++i] || 'manual';
    else if (arg === '--mode') args.mode = argv[++i] || 'auto';
  }
  if (!args.all && !args.book && !args.bookId) throw new Error('请传入 --all、--book <标题> 或 --book-id <ID>');
  return args;
}

function sanitizeFileName(name) {
  return String(name || '未命名书籍').replace(/[《》]/g, '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanText(text) {
  return String(text || '').replace(/\u200b/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function wereadFetchJson(url, cookie, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'application/json, text/plain, */*',
      cookie,
      ...extraHeaders,
    },
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    throw new Error(`请求失败 ${res.status}: ${url}\n${text.slice(0, 500)}`);
  }
  const businessErrCode = data?.errCode ?? data?.errcode ?? 0;
  const businessErrMsg = data?.errMsg ?? data?.errmsg ?? '';
  if (businessErrCode && Number(businessErrCode) !== 0) {
    throw new Error(`请求返回业务错误 ${businessErrCode}: ${url}\n${businessErrMsg || text.slice(0, 500)}`);
  }
  return data;
}

function normalizeBookshelfBooks(data) {
  return (data.books || []).map((item) => ({
    bookId: item.bookId || item.book?.bookId,
    title: item.book?.title || item.title,
    author: item.book?.author || item.author || '',
    sort: item.sort || 0,
    noteCount: item.noteCount || 0,
  })).filter((x) => x.bookId && x.title);
}

async function getNotebookBooks(cookie) {
  return normalizeBookshelfBooks(await wereadFetchJson(`${WEREAD_BASE}/api/user/notebook`, cookie));
}

async function getBookmarks(cookie, bookId) {
  const data = await wereadFetchJson(`${WEREAD_BASE}/web/book/bookmarklist?bookId=${encodeURIComponent(bookId)}`, cookie);
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];
  const chapterMap = new Map(chapters.map((item) => [String(item.chapterUid), cleanText(item.title || '')]));
  const updated = Array.isArray(data.updated) ? data.updated : [];
  return updated.map((item) => ({
    ...item,
    chapterName: item.chapterName || item.chapterTitle || chapterMap.get(String(item.chapterUid)) || '',
  }));
}

async function getReviews(cookie, bookId) {
  const data = await wereadFetchJson(`${WEREAD_BASE}/web/review/list?bookId=${encodeURIComponent(bookId)}&listType=4&syncKey=0&mine=1`, cookie);
  return Array.isArray(data.reviews) ? data.reviews : [];
}

async function loadState(outputDir) {
  const statePath = path.join(outputDir, '.weread-import-state.json');
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const data = JSON.parse(raw);
    return { path: statePath, data: data && typeof data === 'object' ? data : { books: {} } };
  } catch {
    return { path: statePath, data: { books: {} } };
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(state.path), { recursive: true });
  await fs.writeFile(state.path, `${JSON.stringify(state.data, null, 2)}\n`, 'utf8');
}

function reviewPayload(item) {
  return item?.review || item || {};
}

function collectBookmarkIds(bookmarks) {
  return bookmarks.map((item) => item.bookmarkId).filter(Boolean).sort();
}

function collectReviewIds(reviews) {
  return reviews.map((item) => item.reviewId || item.review?.reviewId).filter(Boolean).sort();
}

function comparableBookmarkEntry(entry) {
  return {
    id: String(entry.id || ''),
    chapterUid: String(entry.chapterUid ?? ''),
    chapterName: cleanText(entry.chapterName || '章节名'),
    createdIso: String(entry.createdIso || ''),
    quote: cleanText(entry.quote || ''),
  };
}

function comparableReviewEntry(entry) {
  return {
    id: String(entry.id || ''),
    chapterUid: String(entry.chapterUid ?? ''),
    chapterName: cleanText(entry.chapterName || '章节名'),
    createdIso: String(entry.createdIso || ''),
    quote: cleanText(entry.quote || ''),
    note: cleanText(entry.note || ''),
  };
}

function buildBookmarkEntries(bookmarks) {
  return bookmarks.map((item) => ({
    id: item.bookmarkId || '',
    chapterUid: item.chapterUid ?? '',
    chapterName: cleanText(item.chapterName || item.chapterTitle || '章节名'),
    createdIso: item.createTime ? new Date(item.createTime * 1000).toISOString() : '',
    sortTime: item.createTime || 0,
    quote: cleanText(item.markText || ''),
  }));
}

function buildReviewEntries(reviews) {
  return reviews.map((item) => {
    const p = reviewPayload(item);
    return {
      id: item.reviewId || p.reviewId || '',
      chapterUid: p.chapterUid ?? item.chapterUid ?? '',
      chapterName: cleanText(p.chapterName || p.chapterTitle || item.chapterName || item.chapterTitle || '章节名'),
      createdIso: (p.createTime || item.createTime) ? new Date((p.createTime || item.createTime) * 1000).toISOString() : '',
      sortTime: p.createTime || item.createTime || 0,
      quote: cleanText(p.abstract || p.markText || item.abstract || ''),
      note: cleanText(p.content || item.content || ''),
    };
  });
}

function groupByChapter(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = `${e.chapterName}__${e.chapterUid}`;
    if (!map.has(key)) map.set(key, { chapterName: e.chapterName || '章节名', chapterUid: e.chapterUid, items: [] });
    map.get(key).items.push(e);
  }
  return Array.from(map.values())
    .map((g) => ({ ...g, items: g.items.sort((a, b) => (a.sortTime || 0) - (b.sortTime || 0) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => String(a.chapterUid).localeCompare(String(b.chapterUid)) || a.chapterName.localeCompare(b.chapterName, 'zh-Hans-CN'));
}

function renderBookmarkSections(bookmarks) {
  const groups = groupByChapter(buildBookmarkEntries(bookmarks))
    .map((g) => ({ ...g, items: g.items.filter((e) => e.id && e.quote) }))
    .filter((g) => g.items.length);
  if (!groups.length) return '';
  return groups.map((g) => {
    const body = g.items.map((e) => [
      `<!-- bookmarkId: ${e.id} -->`,
      `<!-- time: ${e.createdIso} -->`,
      `<!-- chapterUid: ${e.chapterUid} -->`,
      '',
      `> ${e.quote}`,
    ].join('\n')).join('\n\n');
    return `### ${g.chapterName}\n\n${body}`;
  }).join('\n\n');
}

function renderReviewSections(reviews) {
  const groups = groupByChapter(buildReviewEntries(reviews))
    .map((g) => ({ ...g, items: g.items.filter((e) => e.id && (e.quote || e.note)) }))
    .filter((g) => g.items.length);
  if (!groups.length) return '';
  return groups.map((g) => {
    const body = g.items.map((e) => {
      const lines = [
        `<!-- reviewId: ${e.id} -->`,
        `<!-- time: ${e.createdIso} -->`,
        `<!-- chapterUid: ${e.chapterUid} -->`,
        '',
      ];
      if (e.quote) lines.push(`> **摘录**：${e.quote}`);
      if (e.quote && e.note) lines.push('>');
      if (e.note) lines.push(`> **想法**：${e.note}`);
      return lines.join('\n');
    }).join('\n\n');
    return `### ${g.chapterName}\n\n${body}`;
  }).join('\n\n');
}

function parseDeletedSections(markdown) {
  const m = markdown.match(/## 已删除\n\n([\s\S]*?)$/);
  const deleted = m ? m[1].trim() : '';
  const bookmark = (() => {
    const x = deleted.match(/### 划线\n\n([\s\S]*?)(?=\n### 想法|$)/);
    return x ? x[1].trim() : '';
  })();
  const review = (() => {
    const x = deleted.match(/### 想法\n\n([\s\S]*?)$/);
    return x ? x[1].trim() : '';
  })();
  return { bookmark, review };
}

function getTopLevelSection(markdown, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`## ${escaped}\\n\\n([\\s\\S]*?)(?=\\n## |$)`);
  const m = String(markdown || '').match(regex);
  return m ? m[1].trim() : '';
}

function parseEntryGroups(sectionMarkdown, idKind) {
  const text = String(sectionMarkdown || '').trim();
  if (!text) return [];
  const groups = [];
  const chapterRegex = /^###\s+(.+)$/gm;
  const matches = [...text.matchAll(chapterRegex)];
  for (let i = 0; i < matches.length; i += 1) {
    const chapterName = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const chapterBody = text.slice(start, end).trim();
    if (!chapterBody) continue;
    const entryRegex = new RegExp(`<!-- ${idKind}: ([^>]+) -->([\\s\\S]*?)(?=\\n<!-- ${idKind}: |$)`, 'g');
    const items = [];
    let m;
    while ((m = entryRegex.exec(chapterBody))) {
      items.push({ id: m[1].trim(), body: m[2].trim() });
    }
    if (items.length) groups.push({ chapterName, items });
  }
  return groups;
}

function parseMetadataComment(body, key) {
  const m = String(body || '').match(new RegExp(`<!-- ${key}: ([^>]+) -->`));
  return m ? m[1].trim() : '';
}

function extractComparableMapsFromMarkdown(markdown) {
  const bookmarkSection = getTopLevelSection(markdown, '划线');
  const reviewSection = getTopLevelSection(markdown, '想法');

  const bookmarkPairs = [];
  for (const group of parseEntryGroups(bookmarkSection, 'bookmarkId')) {
    for (const item of group.items) {
      const body = item.body.trim();
      const quote = cleanText(body.replace(/<!--[^>]*-->/g, '').replace(/^>\s?/gm, '').trim());
      const entry = comparableBookmarkEntry({
        id: item.id,
        chapterName: group.chapterName,
        chapterUid: parseMetadataComment(body, 'chapterUid'),
        createdIso: parseMetadataComment(body, 'time'),
        quote,
      });
      if (entry.id) bookmarkPairs.push([entry.id, entry]);
    }
  }
  const bookmarkEntryMap = Object.fromEntries(bookmarkPairs);

  const reviewPairs = [];
  for (const group of parseEntryGroups(reviewSection, 'reviewId')) {
    for (const item of group.items) {
      const body = item.body.trim();
      const quoteMatch = body.match(/> \*\*摘录\*\*：([^\n]*)/);
      const noteMatch = body.match(/> \*\*想法\*\*：([^\n]*)/);
      const entry = comparableReviewEntry({
        id: item.id,
        chapterName: group.chapterName,
        chapterUid: parseMetadataComment(body, 'chapterUid'),
        createdIso: parseMetadataComment(body, 'time'),
        quote: cleanText(quoteMatch ? quoteMatch[1] : ''),
        note: cleanText(noteMatch ? noteMatch[1] : ''),
      });
      if (entry.id) reviewPairs.push([entry.id, entry]);
    }
  }
  const reviewEntryMap = Object.fromEntries(reviewPairs);

  return { bookmarkEntryMap, reviewEntryMap };
}

function pickDeletedEntries(sectionMarkdown, idKind, deletedIds) {
  const deleted = new Set((deletedIds || []).filter(Boolean));
  if (!deleted.size) return '';
  const groups = parseEntryGroups(sectionMarkdown, idKind)
    .map((group) => ({
      chapterName: group.chapterName,
      items: group.items.filter((item) => deleted.has(item.id)),
    }))
    .filter((group) => group.items.length);
  if (!groups.length) return '';
  return groups.map((group) => {
    const body = group.items.map((item) => `<!-- ${idKind}: ${item.id} -->\n\n${item.body}`).join('\n\n');
    return `#### ${group.chapterName}\n\n${body}`;
  }).join('\n\n');
}

function mergeDeletedContent(existingDeleted, newlyDeleted, idKind = 'bookmarkId') {
  const mergedText = [normalizeDeletedContent(existingDeleted), normalizeDeletedContent(newlyDeleted)].filter(Boolean).join('\n\n');
  if (!mergedText) return '';

  const groups = [];
  const chapterRegex = /^####\s+(.+)$/gm;
  const matches = [...mergedText.matchAll(chapterRegex)];
  for (let i = 0; i < matches.length; i += 1) {
    const chapterName = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : mergedText.length;
    const chapterBody = mergedText.slice(start, end).trim();
    if (!chapterBody) continue;
    const entryRegex = new RegExp(`<!-- ${idKind}: ([^>]+) -->([\\s\\S]*?)(?=\\n<!-- ${idKind}: |$)`, 'g');
    const items = [];
    let m;
    while ((m = entryRegex.exec(chapterBody))) {
      const body = m[2].trim();
      items.push({
        id: m[1].trim(),
        time: parseMetadataComment(body, 'time'),
        chapterUid: parseMetadataComment(body, 'chapterUid'),
        body: body
          .replace(/<!-- time: [^>]+ -->/g, '')
          .replace(/<!-- chapterUid: [^>]+ -->/g, '')
          .trim(),
      });
    }
    if (items.length) groups.push({ chapterName, items });
  }

  const mergedGroups = new Map();
  for (const group of groups) {
    if (!mergedGroups.has(group.chapterName)) mergedGroups.set(group.chapterName, new Map());
    const itemMap = mergedGroups.get(group.chapterName);
    for (const item of group.items) if (!itemMap.has(item.id)) itemMap.set(item.id, item);
  }

  return Array.from(mergedGroups.entries()).map(([chapterName, itemMap]) => {
    const body = Array.from(itemMap.entries()).map(([id, item]) => {
      const lines = [`<!-- ${idKind}: ${id} -->`];
      if (item.time) lines.push(`<!-- time: ${item.time} -->`);
      if (item.chapterUid) lines.push(`<!-- chapterUid: ${item.chapterUid} -->`);
      if (item.body) lines.push('', item.body);
      return lines.join('\n');
    }).join('\n\n');
    return `#### ${chapterName}\n\n${body}`;
  }).join('\n\n');
}

function extractIds(text, kind) {
  const regex = new RegExp(`<!-- ${kind}: ([^>]+) -->`, 'g');
  const ids = [];
  let m;
  while ((m = regex.exec(text || ''))) ids.push(m[1].trim());
  return ids;
}

function computeMergeStats(prevIds, nextIds, prevEntries = null, nextEntries = null) {
  const prev = new Set(prevIds);
  const next = new Set(nextIds);
  let added = 0, updated = 0, retained = 0, deleted = 0;

  const prevMap = prevEntries instanceof Map ? prevEntries : null;
  const nextMap = nextEntries instanceof Map ? nextEntries : null;

  for (const id of next) {
    if (!prev.has(id)) {
      added++;
      continue;
    }
    if (prevMap && nextMap && prevMap.has(id) && nextMap.has(id)) {
      const prevValue = JSON.stringify(prevMap.get(id));
      const nextValue = JSON.stringify(nextMap.get(id));
      if (prevValue !== nextValue) updated++;
      else retained++;
    } else {
      retained++;
    }
  }
  for (const id of prev) if (!next.has(id)) deleted++;
  return { added, updated, retained, deleted };
}

function normalizeDeletedContent(text) {
  return String(text || '')
    .replace(/^###\s*划线\s*$/gm, '')
    .replace(/^###\s*想法\s*$/gm, '')
    .replace(/^###\s+(?!划线\s*$|想法\s*$)(.+)$/gm, '#### $1')
    .replace(/^- time:\s*(.*)$/gm, '<!-- time: $1 -->')
    .replace(/^- chapterUid:\s*(.*)$/gm, '<!-- chapterUid: $1 -->')
    .replace(/(<!-- (?:bookmarkId|reviewId): [^>]+ -->)\n\n(<!-- (?:time|chapterUid): [^>]+ -->)/g, '$1\n$2')
    .trim();
}

function buildDeletedSection(existingDeletedBookmark, existingDeletedReview) {
  const bookmarkText = normalizeDeletedContent(existingDeletedBookmark);
  const reviewText = normalizeDeletedContent(existingDeletedReview);
  const parts = [];
  if (bookmarkText) parts.push(`### 划线\n\n${bookmarkText}`);
  if (reviewText) parts.push(`### 想法\n\n${reviewText}`);
  return parts.join('\n\n');
}

function yamlScalar(value) {
  const text = String(value ?? '');
  return JSON.stringify(text);
}

function buildFrontmatter({ title, author, bookId, noteUpdatedIso, highlightCount, reviewCount, tags = DEFAULT_TAGS }) {
  const normalizedTags = Array.isArray(tags) ? tags.map((x) => String(x).trim()).filter(Boolean) : DEFAULT_TAGS;
  return [
    '---',
    `title: ${yamlScalar(title)}`,
    `author: ${yamlScalar(author || '未知')}`,
    `bookId: ${yamlScalar(bookId)}`,
    'source: weread',
    `lastNoteUpdate: ${yamlScalar(noteUpdatedIso)}`,
    `highlightCount: ${Number(highlightCount || 0)}`,
    `reviewCount: ${Number(reviewCount || 0)}`,
    'tags:',
    ...normalizedTags.map((tag) => `  - ${tag}`),
    '---',
  ].join('\n');
}

function buildMarkdownFromApi(book, bookmarks, reviews, existingMarkdown = '', options = {}) {
  const title = sanitizeFileName(book.title);
  const author = cleanText(book.author || '');
  const noteUpdatedIso = book.sort ? new Date(book.sort * 1000).toISOString() : '';
  const bookmarkBlocks = renderBookmarkSections(bookmarks);
  const reviewBlocks = renderReviewSections(reviews);

  const prevBookmarkIds = extractIds(existingMarkdown, 'bookmarkId');
  const prevReviewIds = extractIds(existingMarkdown, 'reviewId');
  const nextBookmarkIds = collectBookmarkIds(bookmarks);
  const nextReviewIds = collectReviewIds(reviews);
  const deletedBookmarkIds = prevBookmarkIds.filter((id) => !nextBookmarkIds.includes(id));
  const deletedReviewIds = prevReviewIds.filter((id) => !nextReviewIds.includes(id));

  const existingDeleted = existingMarkdown ? parseDeletedSections(existingMarkdown) : { bookmark: '', review: '' };
  const previousBookmarkSection = getTopLevelSection(existingMarkdown, '划线');
  const previousReviewSection = getTopLevelSection(existingMarkdown, '想法');
  const newlyDeletedBookmarks = pickDeletedEntries(previousBookmarkSection, 'bookmarkId', deletedBookmarkIds);
  const newlyDeletedReviews = pickDeletedEntries(previousReviewSection, 'reviewId', deletedReviewIds);
  const deletedBlocks = buildDeletedSection(
    mergeDeletedContent(existingDeleted.bookmark, newlyDeletedBookmarks, 'bookmarkId'),
    mergeDeletedContent(existingDeleted.review, newlyDeletedReviews, 'reviewId'),
  );

  const sections = [
    buildFrontmatter({
      title,
      author,
      bookId: book.bookId,
      noteUpdatedIso,
      highlightCount: bookmarks.length,
      reviewCount: reviews.length,
      tags: options.tags,
    }),
    `# ${title}`,
  ];
  if (bookmarkBlocks) sections.push(`## 划线\n\n${bookmarkBlocks}`);
  if (reviewBlocks) sections.push(`## 想法\n\n${reviewBlocks}`);
  if (deletedBlocks) sections.push(`## 已删除\n\n${deletedBlocks}`);
  return `${sections.join('\n\n')}\n`;
}

async function writeBook(outputDir, title, markdown) {
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `${sanitizeFileName(title)}.md`;
  const filePath = path.join(outputDir, fileName);
  await fs.writeFile(filePath, `${markdown.trim()}\n`, 'utf8');
  return { filePath, merged: true, mergeStats: null };
}

async function importOneBookByApi(book, outputDir, cookie, options = {}) {
  const [bookmarks, reviews] = await Promise.all([getBookmarks(cookie, book.bookId), getReviews(cookie, book.bookId)]);
  const fileName = `${sanitizeFileName(book.title)}.md`;
  const filePath = path.join(outputDir, fileName);
  let existing = '';
  try { existing = await fs.readFile(filePath, 'utf8'); } catch {}
  const prevBookmarkIds = extractIds(existing, 'bookmarkId');
  const prevReviewIds = extractIds(existing, 'reviewId');
  const nextBookmarkIds = collectBookmarkIds(bookmarks);
  const nextReviewIds = collectReviewIds(reviews);

  const previousStatePath = path.join(outputDir, '.weread-import-state.json');
  let previousBookState = null;
  try {
    const previousStateRaw = await fs.readFile(previousStatePath, 'utf8');
    const previousState = JSON.parse(previousStateRaw);
    previousBookState = previousState?.books?.[book.bookId] || null;
  } catch {}

  const nextBookmarkEntryMap = new Map(buildBookmarkEntries(bookmarks).map((entry) => {
    const normalized = comparableBookmarkEntry(entry);
    return [normalized.id, normalized];
  }));
  const nextReviewEntryMap = new Map(buildReviewEntries(reviews).map((entry) => {
    const normalized = comparableReviewEntry(entry);
    return [normalized.id, normalized];
  }));

  const fallbackComparableMaps = existing ? extractComparableMapsFromMarkdown(existing) : { bookmarkEntryMap: {}, reviewEntryMap: {} };
  const prevBookmarkEntryMap = new Map(Object.entries(previousBookState?.bookmarkEntryMap || fallbackComparableMaps.bookmarkEntryMap || {}));
  const prevReviewEntryMap = new Map(Object.entries(previousBookState?.reviewEntryMap || fallbackComparableMaps.reviewEntryMap || {}));

  const markdown = buildMarkdownFromApi(book, bookmarks, reviews, existing, options);
  const writeResult = await writeBook(outputDir, book.title, markdown);
  return {
    title: book.title,
    filePath: writeResult.filePath,
    merged: Boolean(existing),
    mergeStats: {
      bookmarks: computeMergeStats(prevBookmarkIds, nextBookmarkIds, prevBookmarkEntryMap, nextBookmarkEntryMap),
      reviews: computeMergeStats(prevReviewIds, nextReviewIds, prevReviewEntryMap, nextReviewEntryMap),
    },
    bookmarkCount: bookmarks.length,
    reviewCount: reviews.length,
    bookmarkIds: nextBookmarkIds,
    reviewIds: nextReviewIds,
    bookmarkEntryMap: Object.fromEntries(nextBookmarkEntryMap),
    reviewEntryMap: Object.fromEntries(nextReviewEntryMap),
    mode: 'api',
  };
}

async function resolveBooksForImport(args, cookie) {
  if (args.all) {
    const books = await getNotebookBooks(cookie);
    return args.limit ? books.slice(0, args.limit) : books;
  }
  if (args.bookId) {
    return [{ bookId: args.bookId, title: args.book || args.bookId, author: args.author || '', sort: 0 }];
  }
  if (args.book) {
    const books = await getNotebookBooks(cookie);
    const filtered = books.filter((b) => b.title.includes(args.book));
    if (!filtered.length) throw new Error(`notebook 中没找到匹配书名：${args.book}`);
    return args.limit ? filtered.slice(0, args.limit) : filtered;
  }
  throw new Error('无法解析要导入的书籍，请使用 --all、--book 或 --book-id');
}

async function ensureShelfPage(page) {
  await page.goto('https://weread.qq.com/web/shelf', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const text = await page.locator('body').innerText();
  if (/登录二维码|扫一扫登录/.test(text)) throw new Error('当前浏览器没有微信读书登录态，请先登录');
}

async function getShelfBooksByDom(page) {
  return await page.evaluate(() => Array.from(document.querySelectorAll('a[href*="/web/reader/"]')).map(a => ({ href: a.href, title: ((a.innerText || '').trim().split('\n').filter(Boolean)[0] || '') })).filter(x => x.href && x.title));
}

async function openNotesPanel(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1800);
  const opened = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], div, span'));
    const button = candidates.find((el) => ((el.innerText || '').trim() === '笔记' || (el.getAttribute('title') || '') === '笔记'));
    if (!button) return false;
    button.click();
    return true;
  });
  if (!opened) throw new Error('没找到“笔记”按钮，页面结构可能变了');
  await page.waitForTimeout(1200);
}

async function extractBookNotesByDom(page) {
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

function buildMarkdownFromDom({ title, copied, panelText }) {
  const cleanTitle = sanitizeFileName(title || '未命名书籍');
  const source = cleanText(copied || panelText || '');
  return `# ${cleanTitle}\n\n## 元信息\n\n- Source: 微信读书\n- Author: 未知\n- Book ID: \n- Last Note Update: \n\n## 想法\n\n${source}\n`;
}

async function importOneBookByDom(context, book, outputDir) {
  const page = await context.newPage();
  try {
    await page.goto(book.href, { waitUntil: 'domcontentloaded' });
    await openNotesPanel(page);
    const result = await extractBookNotesByDom(page);
    if (!result.ok) throw new Error(result.error || `抓取失败: ${book.title}`);
    const writeResult = await writeBook(outputDir, book.title || result.title, buildMarkdownFromDom(result));
    return { title: book.title, filePath: writeResult.filePath, merged: true, mode: 'dom' };
  } finally {
    await page.close();
  }
}

async function extractCookieFromBrowser(cdpUrl) {
  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('没有可用浏览器上下文，请确认远程调试浏览器已启动');
    const cookies = await context.cookies('https://weread.qq.com');
    const valid = cookies.filter((c) => c.name && c.value);
    if (!valid.length) throw new Error('浏览器里没有找到 weread.qq.com 的 cookie；请先在该浏览器登录微信读书');
    return valid.map((c) => `${c.name}=${c.value}`).join('; ');
  } finally {
    await browser.close();
  }
}

async function getCookieForApi(args) {
  if (args.cookie) return args.cookie;
  if (args.cookieFrom === 'browser') return extractCookieFromBrowser(args.cdp);
  throw new Error('API 模式需要 cookie：请使用 --cookie、WEREAD_COOKIE，或 --cookie-from browser');
}

async function importViaApi(args) {
  const cookie = await getCookieForApi(args);
  const state = await loadState(args.output);
  const books = await resolveBooksForImport(args, cookie);
  const limitedBooks = args.limit ? books.slice(0, args.limit) : books;
  const results = [];
  let skipped = 0;
  for (const book of limitedBooks) {
    const prev = state.data.books?.[book.bookId];
    const currentStamp = Number(book.sort || 0);
    if (!args.force && prev && Number(prev.lastNoteUpdate || 0) >= currentStamp && prev.fileName) {
      skipped += 1;
      console.log(`Skipped [api]: ${book.title} (unchanged)`);
      continue;
    }
    const res = await importOneBookByApi(book, args.output, cookie, { tags: args.tags });
    const prevBookmarkIds = Array.isArray(prev?.bookmarkIds) ? prev.bookmarkIds : [];
    const prevReviewIds = Array.isArray(prev?.reviewIds) ? prev.reviewIds : [];
    const addedBookmarkIds = res.bookmarkIds.filter((id) => !prevBookmarkIds.includes(id));
    const addedReviewIds = res.reviewIds.filter((id) => !prevReviewIds.includes(id));
    state.data.books[book.bookId] = {
      title: book.title,
      author: book.author || '',
      fileName: path.basename(res.filePath),
      lastNoteUpdate: currentStamp,
      lastImportedAt: new Date().toISOString(),
      bookmarkIds: res.bookmarkIds,
      reviewIds: res.reviewIds,
      bookmarkEntryMap: res.bookmarkEntryMap || {},
      reviewEntryMap: res.reviewEntryMap || {},
      bookmarkCount: res.bookmarkCount,
      reviewCount: res.reviewCount,
      lastDelta: { addedBookmarks: addedBookmarkIds.length, addedReviews: addedReviewIds.length },
      lastMergeStats: res.mergeStats || null,
      mode: 'api',
    };
    results.push(res);
    const delta = state.data.books[book.bookId].lastDelta;
    const mergeInfo = res.mergeStats ? `, merge(bookmarks a/u/r/d=${res.mergeStats.bookmarks.added}/${res.mergeStats.bookmarks.updated}/${res.mergeStats.bookmarks.retained}/${res.mergeStats.bookmarks.deleted}; reviews a/u/r/d=${res.mergeStats.reviews.added}/${res.mergeStats.reviews.updated}/${res.mergeStats.reviews.retained}/${res.mergeStats.reviews.deleted})` : '';
    console.log(`Imported [api]: ${res.title} -> ${res.filePath} (${res.merged ? 'merged' : 'new'}, highlights=${res.bookmarkCount}, reviews=${res.reviewCount}, +bookmarks=${delta.addedBookmarks}, +reviews=${delta.addedReviews}${mergeInfo})`);
  }
  await saveState(state);
  console.log(`Done. Imported ${results.length} book(s) by API. Skipped ${skipped} unchanged book(s).`);
}

async function importViaDom(args) {
  const browser = await chromium.connectOverCDP(args.cdp);
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('没有可用浏览器上下文，请确认远程调试浏览器已启动');
    const page = context.pages()[0] || await context.newPage();
    await ensureShelfPage(page);
    let books = await getShelfBooksByDom(page);
    if (args.book) books = books.filter((b) => b.title.includes(args.book));
    if (!books.length) throw new Error(args.book ? `书架里没找到匹配书名：${args.book}` : '没有可导入书籍');
    if (args.limit) books = books.slice(0, args.limit);
    const results = [];
    for (const book of books) {
      const res = await importOneBookByDom(context, book, args.output);
      results.push(res);
      console.log(`Imported [dom]: ${res.title} -> ${res.filePath} (${res.merged ? 'merged' : 'new'})`);
    }
    console.log(`Done. Imported ${results.length} book(s) by DOM.`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'api') return importViaApi(args);
  if (args.mode === 'dom') return importViaDom(args);
  if (args.cookie || args.cookieFrom === 'browser') {
    try {
      return await importViaApi(args);
    } catch (err) {
      console.warn(`[warn] API 模式失败，回退到 DOM: ${err.message}`);
    }
  }
  return importViaDom(args);
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exitCode = 1;
});
