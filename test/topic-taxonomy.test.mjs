import assert from 'node:assert/strict';
import test from 'node:test';
import { TOPIC_DEFINITIONS, buildTopicIndex, classifyItemTopics } from '../src/lib/topic-taxonomy.mjs';

const item = (overrides = {}) => ({ id: overrides.id || 'item', titleZh: '', titleOriginal: '', models: [], topics: [], keywords: [], sources: [], category: 'other', contentType: 'industry', sourceType: 'media', ...overrides });

test('Qwen3.8-Max belongs to Qwen but never MiniMax', () => {
  const topics = classifyItemTopics(item({ titleZh: 'Qwen3.8-Max 发布：2.4T 参数并开放权重', models: ['Qwen3.8-Max'], category: 'models' }));
  assert.ok(topics.includes('qwen'));
  assert.ok(!topics.includes('minimax'));
});

test('MiniMax-H3 belongs to MiniMax but not Qwen', () => {
  const topics = classifyItemTopics(item({ titleZh: 'MiniMax-H3 正式发布', models: ['MiniMax-H3'], category: 'models' }));
  assert.ok(topics.includes('minimax'));
  assert.ok(!topics.includes('qwen'));
});

test('explicit Qwen and MiniMax comparison appears in both company topics', () => {
  const topics = classifyItemTopics(item({ titleZh: 'Qwen 与 MiniMax 编程能力对比', models: ['Qwen', 'MiniMax'] }));
  assert.ok(topics.includes('qwen'));
  assert.ok(topics.includes('minimax'));
});

test('a competitor mentioned only in summary does not create a company topic', () => {
  const topics = classifyItemTopics(item({ titleZh: 'Qwen 新模型正式上线', summaryZh: '其价格低于 MiniMax。', models: ['Qwen'] }));
  assert.ok(topics.includes('qwen'));
  assert.ok(!topics.includes('minimax'));
});

test('official source id can classify a product title without a brand name', () => {
  const topics = classifyItemTopics(item({ titleZh: '全新多模态插件正式上线', sources: [{ id: 'qwen-agent-releases', name: 'Qwen Agent' }] }));
  assert.ok(topics.includes('qwen'));
});

test('topic index counts unique ids and records multi-company items', () => {
  const index = buildTopicIndex([
    item({ id: 'qwen', titleZh: 'Qwen3.8-Max 发布', models: ['Qwen3.8-Max'], category: 'models' }),
    item({ id: 'comparison', titleZh: 'Qwen 与 MiniMax 对比', models: ['Qwen', 'MiniMax'] })
  ], '2026-08-17T00:00:00.000Z');
  const qwen = index.topics.find((topic) => topic.id === 'qwen');
  assert.deepEqual(qwen.itemIds, ['qwen', 'comparison']);
  assert.equal(qwen.count, 2);
  assert.deepEqual(index.audit.multiCompanyItemIds, ['comparison']);
});

test('every company topic has a secure official product link', () => {
  const companyTopics = TOPIC_DEFINITIONS.filter((topic) => topic.group === 'companies');
  assert.equal(companyTopics.length, 10);
  for (const topic of companyTopics) assert.match(topic.officialUrl, /^https:\/\//);
});
