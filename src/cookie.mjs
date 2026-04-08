import { chromium } from 'playwright';

const WEREAD_COOKIE_URLS = [
  'https://weread.qq.com/',
  'https://weread.qq.com/api/user/notebook',
  'https://weread.qq.com/web/book/bookmarklist?bookId=1',
  'https://weread.qq.com/web/review/list?bookId=1&listType=4&syncKey=0&mine=1',
];

export function cookieMatchesHost(cookie, host = 'weread.qq.com') {
  const domain = String(cookie?.domain || '').replace(/^\./, '');
  return Boolean(domain) && (host === domain || host.endsWith(`.${domain}`));
}

export function buildCookieHeader(cookies, host = 'weread.qq.com') {
  return (cookies || [])
    .filter((cookie) => cookieMatchesHost(cookie, host) && cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

async function closeBrowser(browser, primaryError) {
  if (!browser || typeof browser.close !== 'function') return;
  try {
    await browser.close();
  } catch (closeError) {
    if (!primaryError) throw closeError;
  }
}

export async function extractCookieFromBrowserWithConnector(cdpUrl, connectOverCDP = chromium.connectOverCDP.bind(chromium)) {
  const browser = await connectOverCDP(cdpUrl);
  let primaryError = null;
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('无可用浏览器上下文，请确认已启动带远程调试的 Chrome');
    const cookieHeader = buildCookieHeader(await context.cookies(...WEREAD_COOKIE_URLS));
    if (!cookieHeader) throw new Error('浏览器中未找到 weread.qq.com 的 cookie，请先在该浏览器中登录微信读书');
    return cookieHeader;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeBrowser(browser, primaryError);
  }
}

export async function extractCookieFromBrowser(cdpUrl) {
  return extractCookieFromBrowserWithConnector(cdpUrl);
}

export async function getCookieForApi(args) {
  if (args.cookie) return args.cookie;
  if (args.cookieFrom === 'browser') return extractCookieFromBrowser(args.cdp);
  throw new Error('API 模式需要 cookie，请通过 --cookie、WEREAD_COOKIE 或 --cookie-from browser 提供');
}
