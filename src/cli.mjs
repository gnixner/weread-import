#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { WereadAuthError, WereadApiError } from './errors.mjs';
import { sanitizeFileName } from './utils.mjs';
import { getNotebookBooks, getBookmarks, getReviews } from './api.mjs';
import { getCookieForApi } from './cookie.mjs';
import { buildBookmarkEntries, buildReviewEntries, comparableBookmarkEntry, comparableReviewEntry, collectBookmarkIds, collectReviewIds } from './entries.mjs';
import { buildMarkdownFromApi, writeBook } from './render.mjs';
import { extractComparableMapsFromMarkdown, extractIds } from './markdown-parser.mjs';
import { computeMergeStats } from './merge.mjs';
import { loadState, saveState } from './state.mjs';
import { ensureShelfPage, getShelfBooksByDom, importOneBookByDom } from './dom.mjs';

const DEFAULT_OUTPUT = process.env.WEREAD_OUTPUT || path.resolve(process.cwd(), 'out', 'weread');
const DEFAULT_CDP = process.env.WEREAD_CDP_URL || 'http://127.0.0.1:9222';
const DEFAULT_TAGS = (process.env.WEREAD_TAGS || 'reading,weread').split(',').map((x) => x.trim()).filter(Boolean);

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
  if (!args.all && !args.book && !args.bookId) throw new Error('请指定 --all、--book <标题> 或 --book-id <ID>');
  return args;
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
    if (!filtered.length) throw new Error(`笔记本中未找到匹配「${args.book}」的书籍`);
    return args.limit ? filtered.slice(0, args.limit) : filtered;
  }
  throw new Error('无法确定要导入的书籍，请使用 --all、--book 或 --book-id');
}

async function importViaApi(args) {
  const cookie = await getCookieForApi(args);
  const state = await loadState(args.output);
  const books = await resolveBooksForImport(args, cookie);
  const results = [];
  let skipped = 0;
  for (const book of books) {
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
    if (!context) throw new Error('无可用浏览器上下文，请确认已启动带远程调试的 Chrome');
    const page = context.pages()[0] || await context.newPage();
    await ensureShelfPage(page);
    let books = await getShelfBooksByDom(page);
    if (args.book) books = books.filter((b) => b.title.includes(args.book));
    if (!books.length) throw new Error(args.book ? `书架中未找到匹配「${args.book}」的书籍` : '书架为空，没有可导入的书籍');
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
      if (err instanceof WereadAuthError) throw err;
      console.warn(`[warn] API 模式失败，回退到 DOM 模式: ${err.message}`);
    }
  }
  return importViaDom(args);
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exitCode = 1;
});
