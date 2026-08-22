import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { parseClaudeBlog, parseOpenAiDeveloperBlog } from '../src/lib/official-blog-adapters.mjs';

const openaiHtml = await fs.readFile(new URL('./fixtures/openai-developer-blog.html', import.meta.url), 'utf8');
const claudeHtml = await fs.readFile(new URL('./fixtures/claude-blog.html', import.meta.url), 'utf8');
const now = new Date('2026-08-22T05:00:00Z');

test('parses the OpenAI Codex harness article and excludes blog navigation', () => {
  const source = { id: 'openai-developer', name: 'OpenAI Developer Blog', type: 'official', authority: 100, priority: 104, category: 'agent', language: 'en' };
  const items = parseOpenAiDeveloperBlog(openaiHtml, source, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Codex as a platform: build on the open agent harness');
  assert.equal(items[0].url, 'https://learn.chatgpt.com/blog/codex-as-a-platform');
  assert.equal(items[0].publishedAt, '2026-08-19T12:00:00.000Z');
  assert.equal(items[0].publishedPrecision, 'date');
  assert.match(items[0].description, /products and workflows/);
});

test('parses the Claude teaching article with its official date', () => {
  const source = { id: 'claude-blog', name: 'Claude Blog', type: 'official', authority: 100, priority: 103, category: 'products', language: 'en' };
  const items = parseClaudeBlog(claudeHtml, source, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Anthropic's approach to teaching and learning AI");
  assert.equal(items[0].url, 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai');
  assert.equal(items[0].publishedAt, '2026-08-20T12:00:00.000Z');
  assert.equal(items[0].publishedPrecision, 'date');
  assert.match(items[0].description, /internal employee training/);
});

test('fails loudly when a changed page yields no valid article cards', () => {
  const source = { id: 'claude-blog', name: 'Claude Blog', type: 'official', authority: 100, priority: 103, category: 'products', language: 'en' };
  assert.throws(() => parseClaudeBlog('<html><body>changed</body></html>', source, now), /no valid blog entries/);
});

test('uses BlogPosting JSON-LD and preserves an exact publication time', () => {
  const source = { id: 'claude-blog', name: 'Claude Blog', type: 'official', authority: 100, priority: 103, category: 'products', language: 'en' };
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', headline: 'Structured update', description: 'Structured description', url: 'https://claude.com/blog/structured-update', datePublished: '2026-08-21T09:30:00Z' })}</script>`;
  const [item] = parseClaudeBlog(html, source, now);
  assert.equal(item.title, 'Structured update');
  assert.equal(item.publishedAt, '2026-08-21T09:30:00.000Z');
  assert.equal(item.publishedPrecision, 'minute');
});
