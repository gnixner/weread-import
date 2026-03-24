import { chromium } from 'playwright';

export async function extractCookieFromBrowser(cdpUrl) {
  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('无可用浏览器上下文，请确认已启动带远程调试的 Chrome');
    const cookies = await context.cookies('https://weread.qq.com');
    const valid = cookies.filter((c) => c.name && c.value);
    if (!valid.length) throw new Error('浏览器中未找到 weread.qq.com 的 cookie，请先在该浏览器中登录微信读书');
    return valid.map((c) => `${c.name}=${c.value}`).join('; ');
  } finally {
    if (typeof browser.disconnect === 'function') {
      browser.disconnect();
    }
  }
}

export async function getCookieForApi(args) {
  if (args.cookie) return args.cookie;
  if (args.cookieFrom === 'browser') return extractCookieFromBrowser(args.cdp);
  throw new Error('API 模式需要 cookie，请通过 --cookie、WEREAD_COOKIE 或 --cookie-from browser 提供');
}
