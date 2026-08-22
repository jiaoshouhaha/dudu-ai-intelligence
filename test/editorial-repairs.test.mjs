import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEditorialRepairs } from '../src/lib/editorial-repairs.mjs';

test('renames the Anthropic teaching story without changing official metadata', () => {
  const original = {
    id: '286e067a509a7c4e',
    originalUrl: 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai',
    titleOriginal: 'Anthropic 如何开展 AI 教学',
    titleZh: 'Anthropic 发布 Claude Academy：面向全球用户的 AI 教学平台',
    detailZh: '原有详情',
    publishedAt: '2026-08-20T16:00:00Z',
    sources: [{ url: 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai' }]
  };

  const result = applyEditorialRepairs([original]);

  assert.equal(result.changed, 1);
  assert.equal(result.items[0].titleZh, 'Anthropic 开放内部 AI 培训体系，Claude Academy 面向公众上线');
  assert.equal(result.items[0].titleOriginal, original.titleOriginal);
  assert.equal(result.items[0].detailZh, '原有详情');
  assert.equal(result.items[0].publishedAt, original.publishedAt);
});

test('editorial repair is idempotent and ignores unrelated items', () => {
  const item = { originalUrl: 'https://example.com/other', titleZh: '其他新闻' };

  const once = applyEditorialRepairs([item]);
  const twice = applyEditorialRepairs(once.items);

  assert.equal(once.changed, 0);
  assert.equal(twice.changed, 0);
  assert.deepEqual(twice.items, [item]);
});
