import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFileName, cleanText, yamlScalar, isGarbageContent } from '../src/utils.mjs';

describe('sanitizeFileName', () => {
  it('removes book title brackets', () => {
    assert.equal(sanitizeFileName('《自卑与超越》'), '自卑与超越');
  });

  it('replaces illegal filesystem chars with space', () => {
    assert.equal(sanitizeFileName('a/b:c*d'), 'a b c d');
  });

  it('collapses multiple spaces', () => {
    assert.equal(sanitizeFileName('a   b'), 'a b');
  });

  it('defaults to 未命名书籍 for falsy input', () => {
    assert.equal(sanitizeFileName(null), '未命名书籍');
    assert.equal(sanitizeFileName(''), '未命名书籍');
    assert.equal(sanitizeFileName(undefined), '未命名书籍');
  });

  it('trims whitespace', () => {
    assert.equal(sanitizeFileName('  hello  '), 'hello');
  });
});

describe('cleanText', () => {
  it('removes zero-width spaces', () => {
    assert.equal(cleanText('hello\u200bworld'), 'helloworld');
  });

  it('replaces &nbsp; with space', () => {
    assert.equal(cleanText('a&nbsp;b'), 'a b');
  });

  it('replaces &amp; with &', () => {
    assert.equal(cleanText('a&amp;b'), 'a&b');
  });

  it('normalizes line endings', () => {
    assert.equal(cleanText('a\r\nb\rc'), 'a\nb\nc');
  });

  it('collapses triple+ newlines to double', () => {
    assert.equal(cleanText('a\n\n\n\nb'), 'a\n\nb');
  });

  it('returns empty string for falsy input', () => {
    assert.equal(cleanText(null), '');
    assert.equal(cleanText(undefined), '');
  });
});

describe('yamlScalar', () => {
  it('wraps value in JSON quotes', () => {
    assert.equal(yamlScalar('hello'), '"hello"');
  });

  it('escapes special characters', () => {
    assert.equal(yamlScalar('say "hi"'), '"say \\"hi\\""');
  });

  it('handles null/undefined', () => {
    assert.equal(yamlScalar(null), '""');
    assert.equal(yamlScalar(undefined), '""');
  });
});

describe('isGarbageContent', () => {
  it('detects cookie strings', () => {
    assert.equal(isGarbageContent('wr_vid=123; wr_skey=abc'), true);
  });

  it('detects UI chrome text', () => {
    assert.equal(isGarbageContent('标记读完 推荐 一般 不行'), true);
    assert.equal(isGarbageContent('我的笔记 复制全部笔记'), true);
    assert.equal(isGarbageContent('推荐值 91.1%'), true);
    assert.equal(isGarbageContent('会员卡可读 升级付费'), true);
    assert.equal(isGarbageContent('我的笔记复制划线写想法查询书友想法\n评论\n0\n暂无评论'), true);
    assert.equal(isGarbageContent('写想法公开发 表'), true);
  });

  it('detects empty or too-short content', () => {
    assert.equal(isGarbageContent(''), true);
    assert.equal(isGarbageContent(null), true);
    assert.equal(isGarbageContent('短'), true);
  });

  it('accepts valid note content', () => {
    assert.equal(isGarbageContent('想要在低迷的时候维持效率，有三个关键词：坦白、舍弃和启动。'), false);
  });
});
