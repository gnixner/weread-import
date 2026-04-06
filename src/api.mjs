import { cleanText } from './utils.mjs';
import { WereadApiError, WereadAuthError } from './errors.mjs';

const WEREAD_BASE = 'https://weread.qq.com';
const USER_AGENT = process.env.WEREAD_USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const AUTH_ERROR_CODES = [-1, -2, -100, -2010, -2012];

function appendCacheBuster(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_=${Date.now()}`;
}

export async function wereadFetchJson(url, cookie, { method = 'GET', body, extraHeaders = {} } = {}) {
  const finalUrl = method === 'GET' ? appendCacheBuster(url) : url;
  const headers = {
    'user-agent': USER_AGENT,
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    cookie,
    ...extraHeaders,
  };
  if (body) headers['content-type'] = 'application/json;charset=UTF-8';
  const res = await fetch(finalUrl, { method, headers, body });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new WereadApiError(`响应非合法 JSON: ${url}\n${text.slice(0, 500)}`);
  }
  if (!res.ok) {
    const code = data?.errcode ?? data?.errCode ?? data?.data?.errcode ?? data?.data?.errCode ?? 0;
    if (AUTH_ERROR_CODES.includes(Number(code)) || res.status === 401) {
      throw new WereadAuthError(`HTTP ${res.status} 错误: ${url}\n${text.slice(0, 500)}`);
    }
    throw new WereadApiError(`HTTP ${res.status} 错误: ${url}\n${text.slice(0, 500)}`);
  }
  const businessErrCode = data?.errCode ?? data?.errcode ?? 0;
  const businessErrMsg = data?.errMsg ?? data?.errmsg ?? '';
  if (businessErrCode && Number(businessErrCode) !== 0) {
    const isAuth = /login|auth|expire|token/i.test(businessErrMsg) || AUTH_ERROR_CODES.includes(Number(businessErrCode));
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
