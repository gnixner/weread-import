import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCookieHeader, cookieMatchesHost, extractCookieFromBrowserWithConnector, normalizeBrowserCookieError } from '../src/cookie.mjs';

describe('cookieMatchesHost', () => {
  it('matches host-only and parent-domain cookies for weread.qq.com', () => {
    assert.equal(cookieMatchesHost({ domain: 'weread.qq.com' }), true);
    assert.equal(cookieMatchesHost({ domain: '.weread.qq.com' }), true);
    assert.equal(cookieMatchesHost({ domain: '.qq.com' }), true);
    assert.equal(cookieMatchesHost({ domain: '.example.com' }), false);
  });
});

describe('buildCookieHeader', () => {
  it('builds a cookie header from all cookies applicable to weread.qq.com', () => {
    const header = buildCookieHeader([
      { name: 'wr_skey', value: 'a', domain: '.weread.qq.com' },
      { name: 'wr_gid', value: 'b', domain: 'weread.qq.com' },
      { name: '_clck', value: 'c', domain: '.qq.com' },
      { name: 'other', value: 'd', domain: '.example.com' },
    ]);
    assert.equal(header, 'wr_skey=a; wr_gid=b; _clck=c');
  });
});

describe('extractCookieFromBrowserWithConnector', () => {
  it('closes the browser after extracting cookies', async () => {
    const calls = [];
    const browser = {
      contexts() {
        calls.push('contexts');
        return [{
          async cookies(...urls) {
            calls.push(['cookies', ...urls]);
            return [
              { name: 'wr_gid', value: 'v', domain: 'weread.qq.com' },
              { name: 'wxuin', value: 'skip', domain: '.qq.com' },
            ];
          },
        }];
      },
      async close() {
        calls.push('close');
      },
    };

    const header = await extractCookieFromBrowserWithConnector('http://127.0.0.1:9222', async (cdpUrl) => {
      calls.push(`connect:${cdpUrl}`);
      return browser;
    });

    assert.equal(header, 'wr_gid=v; wxuin=skip');
    assert.deepEqual(calls, [
      'connect:http://127.0.0.1:9222',
      'contexts',
      [
        'cookies',
        'https://weread.qq.com/',
        'https://weread.qq.com/api/user/notebook',
        'https://weread.qq.com/web/book/bookmarklist?bookId=1',
        'https://weread.qq.com/web/review/list?bookId=1&listType=4&syncKey=0&mine=1',
      ],
      'close',
    ]);
  });

  it('preserves the primary error when browser cleanup also fails', async () => {
    const browser = {
      contexts() {
        return [];
      },
      async close() {
        throw new Error('cleanup failed');
      },
    };

    await assert.rejects(
      extractCookieFromBrowserWithConnector('http://127.0.0.1:9222', async () => browser),
      /无可用浏览器上下文/,
    );
  });
});

describe('normalizeBrowserCookieError', () => {
  it('explains the first-login requirement in isolated browser mode', () => {
    const error = normalizeBrowserCookieError(new Error('浏览器中未找到 weread.qq.com 的 cookie，请先在该浏览器中登录微信读书'), 'isolated');
    assert.match(error.message, /隔离浏览器中尚未登录微信读书/);
  });

  it('preserves the original error outside isolated mode', () => {
    const original = new Error('浏览器中未找到 weread.qq.com 的 cookie，请先在该浏览器中登录微信读书');
    const error = normalizeBrowserCookieError(original, 'legacy');
    assert.equal(error, original);
  });
});
