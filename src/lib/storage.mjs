import fs from 'node:fs/promises';
import path from 'node:path';
import { clamp, dateKeyInTimeZone } from './utils.mjs';

export async function readExistingData(dataDir) {
  try {
    const search = JSON.parse(await fs.readFile(path.join(dataDir, 'search.json'), 'utf8'));
    return Array.isArray(search.items) ? search.items : [];
  } catch {
    return [];
  }
}

export async function readSeenData(dataDir) {
  try {
    const seen = JSON.parse(await fs.readFile(path.join(dataDir, 'seen.json'), 'utf8'));
    return seen?.events && typeof seen.events === 'object' ? seen.events : {};
  } catch {
    return {};
  }
}

export function validateEvent(event) {
  const required = ['id', 'titleOriginal', 'originalUrl', 'publishedAt', 'importance', 'sources'];
  for (const key of required) if (event[key] == null) throw new Error(`Event ${event.id || 'unknown'} missing ${key}`);
  if (!Array.isArray(event.sources) || !event.sources.length) throw new Error(`Event ${event.id} has no sources`);
  if (event.importance < 1 || event.importance > 100) throw new Error(`Event ${event.id} has invalid score`);
}

export async function writeDataFiles(dataDir, items, status, todayKey, seenEvents = {}) {
  items.forEach(validateEvent);
  const newsDir = path.join(dataDir, 'news');
  await fs.mkdir(newsDir, { recursive: true });
  const retentionDays = Math.max(1, Math.ceil(Number(process.env.NEWS_WINDOW_HOURS || 4320) / 24));
  const cutoff = Date.parse(`${todayKey}T00:00:00+08:00`) - (retentionDays - 1) * 864e5;
  const retained = items
    .filter((item) => new Date(item.publishedAt).valueOf() >= cutoff)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .map((item) => addEventDerivedData(item, status.finishedAt));

  for (const file of await fs.readdir(newsDir)) {
    if (/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) {
      const fileDate = Date.parse(`${file.slice(0, 10)}T00:00:00+08:00`);
      if (fileDate < cutoff) await fs.unlink(path.join(newsDir, file));
    }
  }
  const byDate = new Map();
  for (const item of retained) {
    const date = dateKeyInTimeZone(item.publishedAt);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(item);
  }
  await Promise.all([...byDate.entries()].map(([date, dateItems]) => atomicJson(path.join(newsDir, `${date}.json`), { generatedAt: status.finishedAt, date, items: dateItems })));

  const archive = buildArchive(retained, status.finishedAt, retentionDays);

  const indexItems = retained.slice(0, 240);
  const categories = Object.entries(Object.groupBy(retained.slice(0, 120), (item) => item.category))
    .map(([name, categoryItems]) => ({ name, count: categoryItems.length }))
    .sort((a, b) => b.count - a.count);
  const keywords = new Map();
  const models = new Map();
  const topics = new Map();
  const contentTypes = new Map();
  for (const item of retained.slice(0, 160)) {
    for (const keyword of item.keywords || []) keywords.set(keyword, (keywords.get(keyword) || 0) + 1);
    for (const model of item.models || []) models.set(model, (models.get(model) || 0) + 1);
    for (const topic of item.topics || []) topics.set(topic, (topics.get(topic) || 0) + 1);
    if (item.contentType) contentTypes.set(item.contentType, (contentTypes.get(item.contentType) || 0) + 1);
  }

  await Promise.all([
    atomicJson(path.join(dataDir, 'index.json'), { generatedAt: status.finishedAt, items: indexItems }),
    atomicJson(path.join(dataDir, 'search.json'), { generatedAt: status.finishedAt, items: retained }),
    atomicJson(path.join(dataDir, 'seen.json'), { generatedAt: status.finishedAt, retentionDays: 7, events: seenEvents }),
    atomicJson(path.join(dataDir, 'archive.json'), archive),
    atomicJson(path.join(dataDir, 'trends.json'), {
      generatedAt: status.finishedAt,
      categories,
      keywords: rankCounts(keywords, 16),
      models: rankCounts(models, 16),
      topics: rankCounts(topics, 24),
      contentTypes: rankCounts(contentTypes, 12)
    }),
    atomicJson(path.join(dataDir, 'status.json'), status)
  ]);
  return retained;
}

function addEventDerivedData(item, generatedAt) {
  const reports = (item.sources || [])
    .map((source) => ({ ...source, title: source.title || item.titleOriginal }))
    .sort((a, b) => new Date(b.publishedAt || item.publishedAt) - new Date(a.publishedAt || item.publishedAt));
  const ageHours = Math.max(0, (new Date(generatedAt) - new Date(item.publishedAt)) / 36e5);
  const sourceLift = Math.min(24, reports.length * 7);
  const current = Math.round(clamp((item.importance || 50) + sourceLift - ageHours * 1.5, 8, 100));
  const heatHistory = Array.from({ length: 12 }, (_, index) => {
    const hoursAgo = (11 - index) * 2;
    return { label: hoursAgo === 0 ? '现在' : `${hoursAgo}小时前`, value: Math.round(clamp(current - (hoursAgo * 0.8) + sourceLift * 0.35, 8, 100)) };
  });
  return {
    ...item,
    reportCount: reports.length,
    reportTimeline: reports,
    heat: { current, peak: Math.max(current, ...heatHistory.map((point) => point.value)), history: heatHistory, note: '根据公开报道数量、来源权威度与时效估算' }
  };
}

function buildArchive(items, generatedAt, retentionDays) {
  const months = new Map();
  for (const item of items) {
    const date = dateKeyInTimeZone(item.publishedAt);
    const month = date.slice(0, 7);
    if (!months.has(month)) months.set(month, new Map());
    const days = months.get(month);
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(item);
  }
  return {
    generatedAt,
    retentionDays,
    months: [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, days]) => ({
      month,
      days: [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, dayItems]) => ({
        date,
        count: dayItems.length,
        highlights: dayItems.slice().sort((a, b) => b.importance - a.importance).slice(0, 5).map((item) => ({ id: item.id, titleZh: item.titleZh || item.titleOriginal, importance: item.importance, category: item.category }))
      }))
    }))
  };
}

function rankCounts(map, limit) {
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

async function atomicJson(file, value) {
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temp, file);
}
