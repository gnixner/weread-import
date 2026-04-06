import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkdownFromDom } from '../src/dom.mjs';

describe('buildMarkdownFromDom', () => {
  it('returns markdown for valid copied content', () => {
    const result = buildMarkdownFromDom({
      title: '测试书名 - 作者 - 微信读书',
      copied: '想要在低迷的时候维持效率，有三个关键词：坦白、舍弃和启动。',
      panelText: '',
    });
    assert.ok(result);
    assert.ok(result.includes('title: "测试书名"'));
    assert.ok(!result.includes('微信读书'));
    assert.ok(result.includes('坦白、舍弃和启动'));
  });

  it('returns null for empty content', () => {
    assert.equal(buildMarkdownFromDom({ title: '书名', copied: '', panelText: '' }), null);
  });

  it('returns null for garbage cookie content', () => {
    assert.equal(buildMarkdownFromDom({
      title: '书名',
      copied: 'wr_vid=123; wr_skey=abc; wr_rt=xyz',
      panelText: '',
    }), null);
  });

  it('returns null for garbage UI content', () => {
    assert.equal(buildMarkdownFromDom({
      title: '书名',
      copied: '',
      panelText: '标记读完 推荐值 91.1% 复制全部笔记 上一页下一页',
    }), null);
  });

  it('falls back to panelText when copied is empty', () => {
    const result = buildMarkdownFromDom({
      title: '书名',
      copied: '',
      panelText: '这是一段有效的笔记内容，包含了读书时的思考和感悟。',
    });
    assert.ok(result);
    assert.ok(result.includes('读书时的思考'));
  });
});
