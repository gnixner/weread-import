import { cleanText } from './utils.mjs';
import { WereadApiError, WereadAuthError } from './errors.mjs';

const WEREAD_BASE = 'https://weread.qq.com';

export async function wereadFetchJson(url, cookie, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'application/json, text/plain, */*',
      cookie,
      ...extraHeaders,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new WereadApiError(`响应非合法 JSON: ${url}\n${text.slice(0, 500)}`);
  }
  if (!res.ok) {
    throw new WereadApiError(`HTTP ${res.status} 错误: ${url}\n${text.slice(0, 500)}`);
  }
  const businessErrCode = data?.errCode ?? data?.errcode ?? 0;
  const businessErrMsg = data?.errMsg ?? data?.errmsg ?? '';
  if (businessErrCode && Number(businessErrCode) !== 0) {
    const isAuth = /login|auth|expire|token/i.test(businessErrMsg) || [-1, -2, -100].includes(Number(businessErrCode));
    const ErrClass = isAuth ? WereadAuthError : WereadApiError;
    throw new ErrClass(`业务错误 ${businessErrCode}: ${url}\n${businessErrMsg || text.slice(0, 500)}`);
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

export async function getNotebookBooks(cookie) {
  return normalizeBookshelfBooks(await wereadFetchJson(`${WEREAD_BASE}/api/user/notebook`, cookie));
}

export async function getBookmarks(cookie, bookId) {
  const data = await wereadFetchJson(`${WEREAD_BASE}/web/book/bookmarklist?bookId=${encodeURIComponent(bookId)}`, cookie);
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];
  const chapterMap = new Map(chapters.map((item) => [String(item.chapterUid), cleanText(item.title || '')]));
  const updated = Array.isArray(data.updated) ? data.updated : [];
  return updated.map((item) => ({
    ...item,
    chapterName: item.chapterName || item.chapterTitle || chapterMap.get(String(item.chapterUid)) || '',
  }));
}

export async function getReviews(cookie, bookId) {
  const data = await wereadFetchJson(`${WEREAD_BASE}/web/review/list?bookId=${encodeURIComponent(bookId)}&listType=4&syncKey=0&mine=1`, cookie);
  return Array.isArray(data.reviews) ? data.reviews : [];
}
