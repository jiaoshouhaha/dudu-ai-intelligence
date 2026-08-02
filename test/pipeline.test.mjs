import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseFeed } from '../src/lib/feed-parser.mjs';
import { normalizeItem, normalizeUrl } from '../src/lib/normalize.mjs';
import { dedupeItems } from '../src/lib/dedupe.mjs';
import { scoreEvent } from '../src/lib/score.mjs';
import { aiConfig, enrichEvent, finalizeFallback, validateAiPayload } from '../src/lib/ai-client.mjs';
import { runPipeline } from '../src/lib/pipeline.mjs';
import { translateEventToChinese } from '../src/lib/translate.mjs';
import { dateKeyInTimeZone } from '../src/lib/utils.mjs';
import { parseAihotItems } from '../src/lib/source-adapters.mjs';

const fixture = await fs.readFile(new URL('./fixtures/sample-rss.xml', import.meta.url), 'utf8');
const source = { id: 'test', name: 'Test Feed', type: 'official', authority: 95, category: 'models', language: 'en', enabled: true, url: 'https://example.com/rss' };

test('parses RSS fields and strips HTML', () => {
  const items = parseFeed(fixture, source, new Date('2026-08-01T03:00:00Z'));
  assert.equal(items.length, 3);
  assert.equal(items[0].sourceName, 'Test Feed');
  assert.match(items[0].description, /released a new model/);
  assert.equal(items[0].publishedAt, '2026-08-01T01:30:00.000Z');
});

test('normalizes tracking parameters without removing meaningful query params', () => {
  assert.equal(normalizeUrl('https://www.Example.com/post/?utm_source=rss&id=7#top'), 'https://example.com/post?id=7');
});

test('deduplicates the same story and retains multiple sources', () => {
  const base = normalizeItem(parseFeed(fixture, source)[0]);
  const duplicate = { ...base, sourceId: 'second', sourceName: 'Second Source', url: `${base.url}&utm_medium=feed`, normalizedUrl: base.normalizedUrl };
  const events = dedupeItems([base, duplicate]);
  assert.equal(events.length, 1);
  assert.equal(events[0].sources.length, 2);
});

test('rule score is bounded and includes a transparent reason', () => {
  const event = dedupeItems(parseFeed(fixture, source).map(normalizeItem))[0];
  const scored = scoreEvent(event, new Date('2026-08-01T03:00:00Z'));
  assert.ok(scored.importance >= 1 && scored.importance <= 100);
  assert.equal(scored.scoringMode, 'rules');
  assert.match(scored.importanceReasonZh, /权威|影响|新发布|时间/);
});

test('AI payload validation clamps score and normalizes unknown categories', () => {
  const value = validateAiPayload({ titleZh: '中', titleEn: 'EN', summaryZh: '摘要', summaryEn: 'Summary', category: 'unknown', keywords: ['agent'], importance: 120, reasonZh: '理由', reasonEn: 'Reason' });
  assert.equal(value.importance, 100);
  assert.equal(value.category, 'other');
  assert.equal(value.contentType, 'industry');
  assert.equal(value.evidenceLevel, 'unverified');
});

test('parses AI HOT discovery items while preserving the original link and attribution', () => {
  const [item] = parseAihotItems({ items: [{ id: 'ayi-1', title: 'Codex 省额度工作流', summary: '使用 Sol 调度 Luna。', source: { name: 'X：AYI' }, links: { original: 'https://x.com/AYi_AInotes/status/1', aihot: 'https://aihot.example/items/1' }, publishedAt: '2026-08-02T10:47:27Z', discoveredAt: '2026-08-02T11:00:00Z', category: 'tip', score: 75, attribution: { name: 'AI HOT', url: 'https://aihot.example/items/1' } }] }, { id: 'aihot', name: 'AI HOT', authority: 76 });
  assert.equal(item.url, 'https://x.com/AYi_AInotes/status/1');
  assert.equal(item.category, 'tips');
  assert.equal(item.contentTypeHint, 'practical');
  assert.equal(item.evidenceLevelHint, 'practitioner');
  assert.equal(item.attribution.name, 'AI HOT');
});

test('DeepSeek defaults use V4 Flash and the official endpoint', () => {
  const config = aiConfig({});
  assert.equal(config.baseUrl, 'https://api.deepseek.com');
  assert.equal(config.model, 'deepseek-v4-flash');
  assert.equal(config.apiKey, '');
});

test('DeepSeek request disables thinking and asks for structured Chinese output', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url: String(url), body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ titleZh: '中文标题', titleEn: 'English title', summaryZh: '中文摘要', summaryEn: 'English summary', category: 'models', contentType: 'official', topics: ['推理'], models: ['DeepSeek'], evidenceLevel: 'primary', keywords: ['模型'], importance: 91, reasonZh: '影响广泛', reasonEn: 'Broad impact' }) } }] })
    };
  };
  const event = { titleOriginal: 'AI model launch', summaryOriginal: 'A model was released.', category: 'models', sources: [{ name: 'Official' }], publishedAt: '2026-08-01T17:00:00Z', importance: 80 };
  const result = await enrichEvent(event, { apiKey: 'test-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', timeoutMs: 1000 }, fetchImpl);
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(request.body.model, 'deepseek-v4-flash');
  assert.deepEqual(request.body.thinking, { type: 'disabled' });
  assert.deepEqual(request.body.response_format, { type: 'json_object' });
  assert.equal(result.titleZh, '中文标题');
  assert.equal(result.scoringMode, 'ai');
  assert.deepEqual(result.models, ['DeepSeek']);
  assert.equal(result.evidenceLevel, 'primary');
});

test('Beijing calendar date is used across the UTC day boundary', () => {
  assert.equal(dateKeyInTimeZone('2026-08-01T15:59:59Z'), '2026-08-01');
  assert.equal(dateKeyInTimeZone('2026-08-01T16:00:00Z'), '2026-08-02');
});

test('fallback preserves original English and rule score without an API key', () => {
  const event = finalizeFallback({ titleOriginal: 'Original', summaryOriginal: 'Summary', originalLanguage: 'en', scoringMode: 'rules' });
  assert.equal(event.titleEn, 'Original');
  assert.equal(event.titleZh, '');
  assert.equal(event.processingError, null);
});

test('no-key translator writes Chinese title and summary while preserving the original URL', async () => {
  const event = { titleOriginal: 'New AI model', summaryOriginal: 'It improves reasoning.', originalLanguage: 'en', originalUrl: 'https://example.com/original' };
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [[['新人工智能模型\n', ''], ['[SIGNAL_SPLIT]\n', ''], ['它提高了推理能力。', '']]]
  });
  const translated = await translateEventToChinese(event, { baseUrl: 'https://translate.test', timeoutMs: 1000, retries: 0 }, fetchImpl);
  assert.equal(translated.titleZh, '新人工智能模型');
  assert.equal(translated.summaryZh, '它提高了推理能力。');
  assert.equal(translated.originalUrl, 'https://example.com/original');
});

test('pipeline isolates a failed source and writes valid data files', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-ai-'));
  await fs.mkdir(path.join(rootDir, 'data', 'news'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'data', 'news', '2026-07-31.json'), '{}');
  const sources = [source, { ...source, id: 'broken', url: 'https://broken.example/rss' }];
  const fetchImpl = async (url) => {
    if (url.includes('broken')) throw new Error('network unavailable');
    return { ok: true, text: async () => fixture };
  };
  const originalTranslationBaseUrl = process.env.TRANSLATION_BASE_URL;
  process.env.TRANSLATION_BASE_URL = 'https://translate.test';
  const pipelineFetch = async (url) => {
    if (String(url).startsWith('https://translate.test')) return { ok: true, json: async () => [[['中文标题\n', ''], ['[SIGNAL_SPLIT]\n', ''], ['中文摘要', '']]] };
    return fetchImpl(url);
  };
  const { status, items } = await runPipeline({ rootDir, sources, fetchImpl: pipelineFetch, now: new Date('2026-08-01T03:00:00Z') });
  if (originalTranslationBaseUrl == null) delete process.env.TRANSLATION_BASE_URL;
  else process.env.TRANSLATION_BASE_URL = originalTranslationBaseUrl;
  assert.equal(status.successfulSources, 1);
  assert.equal(status.failedSources, 1);
  assert.equal(items.length, 3);
  const output = JSON.parse(await fs.readFile(path.join(rootDir, 'data', 'index.json'), 'utf8'));
  assert.equal(output.items.length, 3);
  await assert.rejects(fs.access(path.join(rootDir, 'data', 'news', '2026-07-31.json')));
  await fs.access(path.join(rootDir, 'data', 'news', '2026-08-01.json'));
  const seen = JSON.parse(await fs.readFile(path.join(rootDir, 'data', 'seen.json'), 'utf8'));
  assert.equal(Object.keys(seen.events).length, 3);

  const repeated = await runPipeline({ rootDir, sources, fetchImpl: pipelineFetch, now: new Date('2026-08-01T04:00:00Z') });
  assert.equal(repeated.status.newEvents, 0);
  assert.equal(repeated.items.length, 3);
});

test('failed translations remain retryable and are not added to seen registry', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-ai-retry-'));
  const originalTranslationBaseUrl = process.env.TRANSLATION_BASE_URL;
  process.env.TRANSLATION_BASE_URL = 'https://translate.test';
  const fetchImpl = async (url) => {
    if (String(url).startsWith('https://translate.test')) return { ok: false, status: 503 };
    return { ok: true, text: async () => fixture };
  };
  const { status, items } = await runPipeline({ rootDir, sources: [source], fetchImpl, now: new Date('2026-08-01T03:00:00Z') });
  if (originalTranslationBaseUrl == null) delete process.env.TRANSLATION_BASE_URL;
  else process.env.TRANSLATION_BASE_URL = originalTranslationBaseUrl;
  assert.equal(status.pendingTranslation, 3);
  assert.equal(items.length, 0);
  const seen = JSON.parse(await fs.readFile(path.join(rootDir, 'data', 'seen.json'), 'utf8'));
  assert.equal(Object.keys(seen.events).length, 0);
});
