import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { parseClaudeBlog, parseOpenAiDeveloperBlog } from '../src/lib/official-blog-adapters.mjs';

const openaiHtml = await fs.readFile(new URL('./fixtures/openai-developer-blog.html', import.meta.url), 'utf8');
const openaiRealHtml = await fs.readFile(new URL('./fixtures/openai-developer-blog-real.html', import.meta.url), 'utf8');
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

test('parses real OpenAI resource-item cards without treating navigation or image text as articles', () => {
  const source = { id: 'openai-developer', name: 'OpenAI Developer Blog', type: 'official', authority: 100, priority: 104, category: 'agent', language: 'en' };
  const items = parseOpenAiDeveloperBlog(openaiRealHtml, source, now);
  const codex = items.find((item) => item.url.endsWith('/blog/codex-as-a-platform'));
  const yearEnd = items.find((item) => item.url.endsWith('/blog/openai-for-developers-2025'));
  const legacy = items.find((item) => item.url.endsWith('/blog/legacy-august-update'));

  assert.equal(items.length, 4);
  assert.equal(codex.title, 'Codex as a platform: build on the open agent harness');
  assert.equal(codex.url, 'https://developers.openai.com/blog/codex-as-a-platform');
  assert.equal(codex.publishedAt, '2026-08-19T12:00:00.000Z');
  assert.equal(codex.publishedPrecision, 'date');
  assert.match(codex.description, /products and workflows/);
  assert.equal(yearEnd.publishedAt, '2025-12-30T12:00:00.000Z');
  assert.equal(legacy.publishedAt, '2025-08-18T12:00:00.000Z');
  assert.ok(items.every((item) => !item.title.startsWith('Aug 19')));
});

test('keeps December in the previous year when the latest OpenAI cards are scanned in January', () => {
  const source = { id: 'openai-developer', name: 'OpenAI Developer Blog', type: 'official', authority: 100, priority: 104, category: 'agent', language: 'en' };
  const html = `
    <a class="resource-item" href="/blog/january-update"><img alt="January update"><div>Jan 12</div><div>January update</div><p>Current update.</p></a>
    <a class="resource-item" href="/blog/december-update"><img alt="December update"><div>Dec 30</div><div>December update</div><p>Previous update.</p></a>`;
  const items = parseOpenAiDeveloperBlog(html, source, new Date('2027-01-15T05:00:00Z'));
  assert.equal(items.find((item) => item.title === 'January update').publishedAt, '2027-01-12T12:00:00.000Z');
  assert.equal(items.find((item) => item.title === 'December update').publishedAt, '2026-12-30T12:00:00.000Z');
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
