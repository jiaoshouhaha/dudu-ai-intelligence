import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeItems } from '../src/lib/dedupe.mjs';
import { mergeEventReports } from '../src/lib/event-merge.mjs';
import { normalizeItem } from '../src/lib/normalize.mjs';
import { isOfficialPublicationUrl } from '../src/lib/source-preference.mjs';

test('recognizes new OpenAI and Claude official publication hosts', () => {
  assert.equal(isOfficialPublicationUrl('https://learn.chatgpt.com/blog/codex-as-a-platform'), true);
  assert.equal(isOfficialPublicationUrl('https://developers.openai.com/blog/codex-as-a-platform'), true);
  assert.equal(isOfficialPublicationUrl('https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai'), true);
  assert.equal(isOfficialPublicationUrl('https://example.com/repost'), false);
});

test('same-run dedupe keeps the official identity and the richer reliable summary', () => {
  const aggregate = normalizeItem({ sourceId: 'aggregate', sourceName: 'Aggregator', sourceType: 'aggregator', authority: 76, sourcePriority: 76, category: 'agent', language: 'en', title: 'Codex open agent harness is now a platform', description: 'A detailed account of the CLI, app-server, SDK, embedding model, and integration boundaries.', url: 'https://example.com/codex-harness', publishedAt: '2026-08-19T13:00:00Z' });
  const official = normalizeItem({ sourceId: 'openai-developer', sourceName: 'OpenAI Developer Blog', sourceType: 'official', authority: 100, sourcePriority: 104, category: 'agent', language: 'en', title: 'Codex as a platform: build on the open agent harness', description: 'Build Codex into products.', url: 'https://learn.chatgpt.com/blog/codex-as-a-platform', publishedAt: '2026-08-19T12:00:00Z' });
  const [event] = dedupeItems([aggregate, official], 0.6);
  assert.equal(event.originalUrl, official.url);
  assert.equal(event.titleOriginal, official.title);
  assert.equal(event.summaryOriginal, aggregate.description);
  assert.equal(event.sources.length, 2);
});

test('cross-run merge promotes an official canonical URL without discarding Chinese detail', () => {
  const current = { id: 'one', normalizedUrl: 'https://example.com/repost', originalUrl: 'https://example.com/repost', titleOriginal: 'Anthropic AI teaching', summaryOriginal: 'A longer verified description of the public curriculum and internal training origin.', titleZh: '已有中文标题', detailZh: '已有中文详情', sourceType: 'aggregator', authority: 76, sourcePriority: 76, publishedAt: '2026-08-20T13:00:00Z', sources: [{ url: 'https://example.com/repost' }] };
  const incoming = { ...current, normalizedUrl: 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai', originalUrl: 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai', titleOriginal: "Anthropic's approach to teaching and learning AI", summaryOriginal: 'Official description.', sourceType: 'official', authority: 100, sourcePriority: 103, sources: [{ url: 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai' }] };
  const merged = mergeEventReports(current, incoming);
  assert.equal(merged.originalUrl, incoming.originalUrl);
  assert.equal(merged.summaryOriginal, current.summaryOriginal);
  assert.equal(merged.titleZh, '已有中文标题');
  assert.equal(merged.detailZh, '已有中文详情');
  assert.equal(merged.sources.length, 2);
});
