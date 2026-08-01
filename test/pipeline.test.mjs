import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseFeed } from '../src/lib/feed-parser.mjs';
import { normalizeItem, normalizeUrl } from '../src/lib/normalize.mjs';
import { dedupeItems } from '../src/lib/dedupe.mjs';
import { scoreEvent } from '../src/lib/score.mjs';
import { finalizeFallback, validateAiPayload } from '../src/lib/ai-client.mjs';
import { runPipeline } from '../src/lib/pipeline.mjs';

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
});

test('fallback preserves original English and rule score without an API key', () => {
  const event = finalizeFallback({ titleOriginal: 'Original', summaryOriginal: 'Summary', originalLanguage: 'en', scoringMode: 'rules' });
  assert.equal(event.titleEn, 'Original');
  assert.equal(event.titleZh, '');
  assert.equal(event.processingError, null);
});

test('pipeline isolates a failed source and writes valid data files', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-ai-'));
  const sources = [source, { ...source, id: 'broken', url: 'https://broken.example/rss' }];
  const fetchImpl = async (url) => {
    if (url.includes('broken')) throw new Error('network unavailable');
    return { ok: true, text: async () => fixture };
  };
  const { status, items } = await runPipeline({ rootDir, sources, fetchImpl, now: new Date('2026-08-01T03:00:00Z') });
  assert.equal(status.successfulSources, 1);
  assert.equal(status.failedSources, 1);
  assert.equal(items.length, 3);
  const output = JSON.parse(await fs.readFile(path.join(rootDir, 'data', 'index.json'), 'utf8'));
  assert.equal(output.items.length, 3);
});

