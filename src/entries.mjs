import { cleanText, reviewPayload } from './utils.mjs';

export function parseBookmarkIdPosition(bookmarkId) {
  const match = String(bookmarkId || '').match(/^[^_]+_\d+_(\d+)(?:-(\d+))?$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

export function comparableBookmarkEntry(entry) {
  return {
    id: String(entry.id || ''),
    chapterUid: String(entry.chapterUid ?? ''),
    chapterName: cleanText(entry.chapterName || '章节名'),
    createdIso: String(entry.createdIso || ''),
    quote: cleanText(entry.quote || ''),
  };
}

export function comparableReviewEntry(entry) {
  return {
    id: String(entry.id || ''),
    chapterUid: String(entry.chapterUid ?? ''),
    chapterName: cleanText(entry.chapterName || '章节名'),
    createdIso: String(entry.createdIso || ''),
    quote: cleanText(entry.quote || ''),
    note: cleanText(entry.note || ''),
  };
}

export function buildBookmarkEntries(bookmarks) {
  return bookmarks.map((item) => {
    const position = parseBookmarkIdPosition(item.bookmarkId);
    return {
      id: item.bookmarkId || '',
      chapterUid: item.chapterUid ?? '',
      chapterName: cleanText(item.chapterName || item.chapterTitle || '章节名'),
      createdIso: item.createTime ? new Date(item.createTime * 1000).toISOString() : '',
      sortTime: item.createTime || 0,
      sortPositionStart: position ? position.start : null,
      sortPositionEnd: position ? position.end : null,
      quote: cleanText(item.markText || ''),
    };
  });
}

export function buildReviewEntries(reviews) {
  return reviews.map((item) => {
    const p = reviewPayload(item);
    return {
      id: item.reviewId || p.reviewId || '',
      chapterUid: p.chapterUid ?? item.chapterUid ?? '',
      chapterName: cleanText(p.chapterName || p.chapterTitle || item.chapterName || item.chapterTitle || '章节名'),
      createdIso: (p.createTime || item.createTime) ? new Date((p.createTime || item.createTime) * 1000).toISOString() : '',
      sortTime: p.createTime || item.createTime || 0,
      quote: cleanText(p.abstract || p.markText || item.abstract || ''),
      note: cleanText(p.content || item.content || ''),
    };
  });
}

export function groupByChapter(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = `${e.chapterName}__${e.chapterUid}`;
    if (!map.has(key)) map.set(key, { chapterName: e.chapterName || '章节名', chapterUid: e.chapterUid, items: [] });
    map.get(key).items.push(e);
  }
  return Array.from(map.values())
    .map((g) => ({
      ...g,
      items: g.items.sort((a, b) => {
        const hasPositionA = Number.isFinite(a.sortPositionStart);
        const hasPositionB = Number.isFinite(b.sortPositionStart);
        if (hasPositionA && hasPositionB) {
          return a.sortPositionStart - b.sortPositionStart
            || (a.sortPositionEnd || 0) - (b.sortPositionEnd || 0)
            || (a.sortTime || 0) - (b.sortTime || 0)
            || a.id.localeCompare(b.id);
        }
        return (a.sortTime || 0) - (b.sortTime || 0) || a.id.localeCompare(b.id);
      }),
    }))
    .sort((a, b) => String(a.chapterUid).localeCompare(String(b.chapterUid)) || a.chapterName.localeCompare(b.chapterName, 'zh-Hans-CN'));
}

export function collectBookmarkIds(bookmarks) {
  return bookmarks.map((item) => item.bookmarkId).filter(Boolean).sort();
}

export function collectReviewIds(reviews) {
  return reviews.map((item) => item.reviewId || item.review?.reviewId).filter(Boolean).sort();
}
