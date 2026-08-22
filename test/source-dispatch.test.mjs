import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { fetchSource, loadSources } from '../src/lib/pipeline.mjs';
import { parseSourceResponse } from '../src/lib/source-adapters.mjs';

const now = new Date('2026-08-22T05:00:00Z');
const openaiHtml = await fs.readFile(new URL('./fixtures/openai-developer-blog.html', import.meta.url), 'utf8');
const microsoftRss = await fs.readFile(new URL('./fixtures/microsoft-ai-rss.xml', import.meta.url), 'utf8');

test('dispatches OpenAI HTML through the official adapter', async () => {
  const source = { id: 'openai-developer', name: 'OpenAI Developer Blog', format: 'openai-developer-html', type: 'official', authority: 100, priority: 104, category: 'agent', language: 'en' };
  const response = { text: async () => openaiHtml };
  const items = await parseSourceResponse(response, source, now);
  assert.equal(items[0].url, 'https://learn.chatgpt.com/blog/codex-as-a-platform');
});

test('dispatches the replacement Microsoft RSS through the feed adapter', async () => {
  const source = { id: 'microsoft-ai', name: 'Microsoft Source AI', format: 'rss', type: 'official', authority: 96, category: 'products', language: 'en' };
  const items = await parseSourceResponse({ text: async () => microsoftRss }, source, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Microsoft expands an AI product');
  assert.equal(items[0].url, 'https://news.microsoft.com/source/features/ai/example/');
  assert.equal(items[0].publishedAt, '2026-08-21T12:00:00.000Z');
});

test('isolates an HTML parser failure in fetchSource', async () => {
  const source = { id: 'claude-blog', name: 'Claude Blog', url: 'https://claude.com/blog', format: 'claude-blog-html', type: 'official', authority: 100, category: 'products', language: 'en' };
  const result = await fetchSource(source, { now, feedTimeoutMs: 1000, fetchImpl: async () => ({ ok: true, text: async () => '<html>changed</html>' }) });
  assert.equal(result.ok, false);
  assert.equal(result.sourceId, 'claude-blog');
  assert.match(result.error, /no valid blog entries/);
});

test('source configuration replaces Microsoft and adds both official blogs', async () => {
  const sources = await loadSources(new URL('../config/sources.json', import.meta.url));
  const byId = new Map(sources.map((source) => [source.id, source]));
  assert.equal(byId.get('microsoft-ai').url, 'https://news.microsoft.com/source/topics/ai/feed/');
  assert.equal(byId.get('openai-developer').format, 'openai-developer-html');
  assert.equal(byId.get('claude-blog').format, 'claude-blog-html');
});
