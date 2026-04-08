import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WereadAuthError } from '../src/errors.mjs';
import { createApiSessionManager, runWithApiSessionRetry } from '../src/session.mjs';

describe('createApiSessionManager', () => {
  it('acquires and closes a browser-backed session', async () => {
    const calls = [];
    const manager = await createApiSessionManager(
      { cookieFrom: 'browser', cdp: 'http://127.0.0.1:9222' },
      {
        async getCookieForApi() {
          calls.push('getCookie');
          return 'cookie-1';
        },
        async createWereadBrowserFetcher(cdpUrl) {
          calls.push(`fetcher:${cdpUrl}`);
          return {
            fetchJson() {},
            async close() {
              calls.push('closeFetcher');
            },
          };
        },
      },
    );

    const session = await manager.acquire();
    assert.equal(session.cookie, 'cookie-1');
    assert.equal(typeof session.detailFetchJson, 'function');
    assert.equal(manager.getState(), 'ready');
    assert.deepEqual(session.validation, {
      basicValidated: false,
      detailReady: false,
      detailBookId: null,
    });

    await manager.close();
    assert.deepEqual(calls, ['getCookie', 'fetcher:http://127.0.0.1:9222', 'closeFetcher']);
    assert.equal(manager.getState(), 'closed');
  });

  it('refreshes a browser-backed session and closes the previous fetcher', async () => {
    const calls = [];
    let fetcherIndex = 0;
    const manager = await createApiSessionManager(
      { cookieFrom: 'browser', cdp: 'http://127.0.0.1:9222' },
      {
        async getCookieForApi() {
          calls.push('getCookie');
          return 'cookie-1';
        },
        async extractCookieFromBrowser(cdpUrl) {
          calls.push(`refreshCookie:${cdpUrl}`);
          return 'cookie-2';
        },
        async createWereadBrowserFetcher() {
          fetcherIndex += 1;
          const label = `fetcher-${fetcherIndex}`;
          calls.push(label);
          return {
            fetchJson() {},
            async close() {
              calls.push(`close:${label}`);
            },
          };
        },
      },
    );

    await manager.acquire();
    const refreshed = await manager.refresh();
    assert.equal(refreshed.cookie, 'cookie-2');
    assert.equal(manager.getState(), 'ready');
    await manager.close();

    assert.deepEqual(calls, [
      'getCookie',
      'fetcher-1',
      'close:fetcher-1',
      'refreshCookie:http://127.0.0.1:9222',
      'fetcher-2',
      'close:fetcher-2',
    ]);
  });

  it('tracks basic validation and browser detail readiness separately', async () => {
    const calls = [];
    const manager = await createApiSessionManager(
      { cookieFrom: 'browser', cdp: 'http://127.0.0.1:9222' },
      {
        async getCookieForApi() {
          return 'cookie-1';
        },
        async createWereadBrowserFetcher() {
          return {
            async fetchJson(url) {
              calls.push(url);
              return { updated: [] };
            },
            async close() {},
          };
        },
      },
    );

    await manager.acquire();
    const basicReady = manager.markBasicValidated();
    assert.deepEqual(basicReady.validation, {
      basicValidated: true,
      detailReady: false,
      detailBookId: null,
    });

    const detailReady = await manager.ensureDetailReady('33628204');
    assert.deepEqual(detailReady.validation, {
      basicValidated: true,
      detailReady: true,
      detailBookId: '33628204',
    });

    await manager.ensureDetailReady('33628204');
    assert.deepEqual(calls, ['https://weread.qq.com/web/book/bookmarklist?bookId=33628204']);
    await manager.close();
  });

  it('marks detail readiness for manual sessions without a browser fetcher', async () => {
    const manager = await createApiSessionManager(
      { cookieFrom: 'manual', cookie: 'manual-cookie' },
      {
        async getCookieForApi(args) {
          return args.cookie;
        },
      },
    );

    await manager.acquire();
    manager.markBasicValidated();
    const detailReady = await manager.ensureDetailReady('33628204');
    assert.deepEqual(detailReady.validation, {
      basicValidated: true,
      detailReady: true,
      detailBookId: '33628204',
    });
    await manager.close();
  });
});

describe('runWithApiSessionRetry', () => {
  it('retries once after browser auth failure', async () => {
    const warnings = [];
    const calls = [];
    let runCount = 0;

    const result = await runWithApiSessionRetry(
      { cookieFrom: 'browser', cdp: 'http://127.0.0.1:9222' },
      async (session) => {
        runCount += 1;
        calls.push(`run:${runCount}:${session.cookie}`);
        if (runCount === 1) throw new WereadAuthError('expired');
        return 'ok';
      },
      {
        warn(message) {
          warnings.push(message);
        },
        async getCookieForApi() {
          calls.push('getCookie');
          return 'cookie-1';
        },
        async extractCookieFromBrowser() {
          calls.push('refreshCookie');
          return 'cookie-2';
        },
        async createWereadBrowserFetcher() {
          const id = `fetcher-${calls.filter((x) => x.startsWith('fetcher')).length + 1}`;
          calls.push(id);
          return {
            fetchJson() {},
            async close() {
              calls.push(`close:${id}`);
            },
          };
        },
      },
    );

    assert.equal(result, 'ok');
    assert.deepEqual(warnings, ['[warn] API cookie 已过期，正在从浏览器刷新...']);
    assert.deepEqual(calls, [
      'getCookie',
      'fetcher-1',
      'run:1:cookie-1',
      'close:fetcher-1',
      'refreshCookie',
      'fetcher-2',
      'run:2:cookie-2',
      'close:fetcher-2',
    ]);
  });

  it('converts repeated browser auth failures into a user-facing login message', async () => {
    await assert.rejects(
      runWithApiSessionRetry(
        { cookieFrom: 'browser', cdp: 'http://127.0.0.1:9222' },
        async () => {
          throw new WereadAuthError('expired');
        },
        {
          warn() {},
          async getCookieForApi() {
            return 'cookie-1';
          },
          async extractCookieFromBrowser() {
            throw new WereadAuthError('expired-again');
          },
          async createWereadBrowserFetcher() {
            return {
              fetchJson() {},
              async close() {},
            };
          },
        },
      ),
      /浏览器中的微信读书登录已过期/,
    );
  });

  it('converts manual auth failures into a cookie-expired message', async () => {
    await assert.rejects(
      runWithApiSessionRetry(
        { cookieFrom: 'manual', cookie: 'manual-cookie' },
        async () => {
          throw new WereadAuthError('expired');
        },
        {
          async getCookieForApi(args) {
            return args.cookie;
          },
        },
      ),
      /cookie 已过期，请更新 WEREAD_COOKIE 或使用 --cookie-from browser/,
    );
  });
});
