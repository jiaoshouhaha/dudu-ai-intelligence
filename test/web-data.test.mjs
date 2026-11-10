import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildSearchIndex, toListRecord, toSearchRecord } from '../src/lib/catalog.mjs';
import { readExistingData } from '../src/lib/storage.mjs';
import { beijingDateKey, newsPathForId } from '../public/detail-loader.js';
import { buildHomeQuery, isHighValue, isWithinHours, parseHomeQuery } from '../public/home-query.js';
import { expandSearchIndex } from '../public/search-index.js';

const fatItem = {
  id: 'abc123',
  titleOriginal: 'English title',
  summaryOriginal: 'English summary',
  titleZh: '中文标题',
  summaryZh: '中文摘要'.repeat(40),
  importanceReasonZh: '值得看'.repeat(30),
  originalUrl: 'https://example.com/story',
  publishedAt: '2026-08-01T16:30:00.000Z',
  publishedPrecision: 'minute',
  importance: 82,
  category: 'models',
  contentType: 'official',
  evidenceLevel: 'primary',
  sourceType: 'official',
  models: ['GPT'],
  topics: ['发布'],
  keywords: ['发布', '权重'],
  detailZh: '很长的正文',
  summaryEn: 'English summary',
  heat: { current: 10, history: [{ at: '2026-08-01T16:30:00.000Z', value: 0 }] },
  reportTimeline: [{ name: 'Official', url: 'https://example.com/story' }],
  sources: [{ name: 'Official', type: 'official', url: 'https://example.com/story' }]
};

test('list and search records keep card fields and drop article bodies', () => {
  const list = toListRecord(fatItem);
  const search = toSearchRecord(fatItem);
  for (const record of [list, search]) {
    assert.equal(record.id, 'abc123');
    assert.equal(record.titleZh, '中文标题');
    assert.equal(record.sourceName, 'Official');
    assert.equal(record.detailZh, undefined);
    assert.equal(record.heat, undefined);
    assert.equal(record.reportTimeline, undefined);
    assert.equal(record.summaryEn, undefined);
    assert.equal(record.sources, undefined);
  }
  assert.ok(list.summaryZh.length > search.summaryZh.length);
  assert.ok(search.summaryZh.length <= 72);
  assert.equal(search.importanceReasonZh, undefined);
  assert.deepEqual(search.keywords, ['权重']);
  const packed = buildSearchIndex([fatItem], '2026-11-10T00:00:00.000Z', 180);
  assert.equal(JSON.stringify(packed).includes('detailZh'), false);
  const [expanded] = expandSearchIndex(packed);
  assert.equal(expanded.titleZh, '中文标题');
  assert.equal(expanded.sourceName, 'Official');
  assert.equal(expanded.category, 'models');
  assert.equal(expanded.evidenceLevel, 'primary');
  assert.deepEqual(expanded.keywords, ['权重']);
  assert.deepEqual(expandSearchIndex({ items: [list] }), [list]);
});

test('homepage query round-trips view, filters, and search', () => {
  const state = { view: 'category', category: 'models', model: 'GPT', topic: '', theme: 'openai', sourceType: 'official', sort: 'importance', query: '权重' };
  const query = buildHomeQuery(state);
  assert.deepEqual(parseHomeQuery(query), state);
  assert.deepEqual(parseHomeQuery('?category=agent'), { view: 'category', category: 'agent', model: '', topic: '', theme: '', sourceType: 'all', sort: 'time', query: '' });
  assert.equal(parseHomeQuery('?view=nope&source=nope').view, 'all');
  assert.equal(parseHomeQuery('?view=latest').view, 'latest');
});

test('high-value and 24-hour helpers match the sidebar rules', () => {
  assert.equal(isHighValue(75, 'primary'), true);
  assert.equal(isHighValue(90, 'unverified'), false);
  assert.equal(isHighValue(74, 'verified'), false);
  const now = Date.parse('2026-11-10T12:00:00.000Z');
  assert.equal(isWithinHours('2026-11-10T00:00:00.000Z', 24, now), true);
  assert.equal(isWithinHours('2026-11-08T00:00:00.000Z', 24, now), false);
});

test('detail lookup resolves a Beijing date without the full archive', () => {
  assert.equal(beijingDateKey('2026-08-01T15:59:59Z'), '2026-08-01');
  assert.equal(beijingDateKey('2026-08-01T16:00:00Z'), '2026-08-02');
  assert.equal(newsPathForId('abc123', { dates: { abc123: '2026-05-16' } }), './data/news/2026-05-16.json');
  assert.equal(newsPathForId('missing', { dates: {} }), '');
  assert.equal(newsPathForId('bad', { dates: { bad: '../search.json' } }), '');
});

test('existing news is read from day files and ignores a fat search dump', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-read-'));
  const dataDir = path.join(root, 'data');
  await fs.mkdir(path.join(dataDir, 'news'), { recursive: true });
  await fs.writeFile(path.join(dataDir, 'news', '2026-05-16.json'), JSON.stringify({ items: [{ id: 'day', titleZh: '日文件' }] }));
  await fs.writeFile(path.join(dataDir, 'search.json'), JSON.stringify({ items: [{ id: 'fat', titleZh: '不该读取' }] }));
  const items = await readExistingData(dataDir);
  assert.deepEqual(items.map((item) => item.id), ['day']);
});

test('pages do not request the full-article search dump', async () => {
  for (const file of ['public/app.js', 'public/detail.js', 'public/archive.js']) {
    const source = await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(source.includes('data/search.json'), false, file);
  }
});
