import { normalizeUrl } from './normalize.mjs';

const TITLE_OVERRIDES = new Map([
  [
    normalizeUrl('https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai'),
    'Anthropic 开放内部 AI 培训体系，Claude Academy 面向公众上线'
  ]
]);

export function applyEditorialRepairs(items) {
  let changed = 0;
  const repaired = items.map((item) => {
    const titleZh = TITLE_OVERRIDES.get(normalizeUrl(item.originalUrl));
    if (!titleZh || item.titleZh === titleZh) return item;
    changed += 1;
    return { ...item, titleZh };
  });
  return { items: repaired, changed };
}
