import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFrontmatter, buildMarkdownFromApi, renderBookmarkSections, renderReviewSections } from '../src/render.mjs';

describe('buildFrontmatter', () => {
  it('generates valid YAML frontmatter', () => {
    const fm = buildFrontmatter({
      title: '测试书名',
      author: '作者',
      bookId: '123',
      noteUpdatedIso: '2024-01-01T00:00:00.000Z',
      highlightCount: 5,
      reviewCount: 3,
      tags: ['reading', 'weread'],
    });
    assert.ok(fm.startsWith('---'));
    assert.ok(fm.endsWith('---'));
    assert.ok(fm.includes('title: "测试书名"'));
    assert.ok(fm.includes('author: "作者"'));
    assert.ok(fm.includes('bookId: "123"'));
    assert.ok(fm.includes('source: weread'));
    assert.ok(fm.includes('highlightCount: 5'));
    assert.ok(fm.includes('reviewCount: 3'));
    assert.ok(fm.includes('  - reading'));
    assert.ok(fm.includes('  - weread'));
  });

  it('escapes special characters in title', () => {
    const fm = buildFrontmatter({
      title: 'say "hello"',
      author: '',
      bookId: '',
      noteUpdatedIso: '',
      highlightCount: 0,
      reviewCount: 0,
    });
    assert.ok(fm.includes('title: "say \\"hello\\""'));
  });

  it('defaults author to 未知', () => {
    const fm = buildFrontmatter({ title: 'x', bookId: '', noteUpdatedIso: '', highlightCount: 0, reviewCount: 0 });
    assert.ok(fm.includes('author: "未知"'));
  });
});

describe('renderBookmarkSections', () => {
  it('returns empty string for empty bookmarks', () => {
    assert.equal(renderBookmarkSections([]), '');
  });

  it('renders bookmarks grouped by chapter', () => {
    const bookmarks = [
      { bookmarkId: 'b1', chapterUid: 1, chapterName: '第一章', createTime: 1700000000, markText: 'highlight text' },
    ];
    const result = renderBookmarkSections(bookmarks);
    assert.ok(result.includes('### 第一章'));
    assert.ok(result.includes('<!-- bookmarkId: b1 -->'));
    assert.ok(result.includes('> highlight text'));
  });
});

describe('renderReviewSections', () => {
  it('returns empty string for empty reviews', () => {
    assert.equal(renderReviewSections([]), '');
  });

  it('renders reviews with quote and note', () => {
    const reviews = [
      { reviewId: 'r1', review: { reviewId: 'r1', chapterUid: 1, chapterName: '第一章', createTime: 1700000000, abstract: 'the quote', content: 'my thought' } },
    ];
    const result = renderReviewSections(reviews);
    assert.ok(result.includes('### 第一章'));
    assert.ok(result.includes('<!-- reviewId: r1 -->'));
    assert.ok(result.includes('> **摘录**：the quote'));
    assert.ok(result.includes('> **想法**：my thought'));
  });
});

describe('buildMarkdownFromApi', () => {
  it('produces complete markdown with frontmatter', () => {
    const book = { bookId: '123', title: '测试', author: '作者', sort: 1700000000 };
    const bookmarks = [
      { bookmarkId: 'b1', chapterUid: 1, chapterName: '第一章', createTime: 1700000000, markText: 'text' },
    ];
    const md = buildMarkdownFromApi(book, bookmarks, []);
    assert.ok(md.startsWith('---'));
    assert.ok(md.includes('# 测试'));
    assert.ok(md.includes('## 划线'));
    assert.ok(!md.includes('## 想法'));
  });

  it('omits bookmark/review sections when empty', () => {
    const book = { bookId: '123', title: '测试', author: '', sort: 0 };
    const md = buildMarkdownFromApi(book, [], []);
    assert.ok(!md.includes('## 划线'));
    assert.ok(!md.includes('## 想法'));
    assert.ok(!md.includes('## 已删除'));
  });
});
