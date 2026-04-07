import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCookieHeader, cookieMatchesHost } from '../src/cookie.mjs';

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
