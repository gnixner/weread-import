export function sanitizeFileName(name) {
  return String(name || '未命名书籍').replace(/[《》]/g, '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function cleanText(text) {
  return String(text || '').replace(/\u200b/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function yamlScalar(value) {
  const text = String(value ?? '');
  return JSON.stringify(text);
}

export function reviewPayload(item) {
  return item?.review || item || {};
}

const GARBAGE_PATTERNS = [
  /wr_vid=\d+/,
  /wr_skey=\w+/,
  /标记读完/,
  /复制全部笔记/,
  /复制划线/,
  /写想法/,
  /查询书友想法/,
  /暂无评论/,
  /评论详情/,
  /推荐值\s*\d/,
  /会员卡可读/,
  /扫一扫登录/,
  /上一页下一页/,
  /公开发\s*表/,
];

export function isGarbageContent(text) {
  if (!text || text.trim().length < 10) return true;
  return GARBAGE_PATTERNS.some((p) => p.test(text));
}
