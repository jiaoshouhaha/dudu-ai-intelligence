import fs from 'node:fs/promises';
import path from 'node:path';

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
  const retained = items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  for (const file of await fs.readdir(newsDir)) {
    if (/^\d{4}-\d{2}-\d{2}\.json$/.test(file) && file !== `${todayKey}.json`) {
      await fs.unlink(path.join(newsDir, file));
    }
  }
  await atomicJson(path.join(newsDir, `${todayKey}.json`), { generatedAt: status.finishedAt, date: todayKey, items: retained });

  const indexItems = retained.slice(0, 180);
  const categories = Object.entries(Object.groupBy(retained.slice(0, 120), (item) => item.category))
    .map(([name, categoryItems]) => ({ name, count: categoryItems.length }))
    .sort((a, b) => b.count - a.count);
  const keywords = new Map();
  for (const item of retained.slice(0, 160)) {
    for (const keyword of item.keywords || []) keywords.set(keyword, (keywords.get(keyword) || 0) + 1);
  }

  await Promise.all([
    atomicJson(path.join(dataDir, 'index.json'), { generatedAt: status.finishedAt, items: indexItems }),
    atomicJson(path.join(dataDir, 'search.json'), { generatedAt: status.finishedAt, items: retained }),
    atomicJson(path.join(dataDir, 'seen.json'), { generatedAt: status.finishedAt, retentionDays: 7, events: seenEvents }),
    atomicJson(path.join(dataDir, 'trends.json'), {
      generatedAt: status.finishedAt,
      categories,
      keywords: [...keywords.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12)
    }),
    atomicJson(path.join(dataDir, 'status.json'), status)
  ]);
  return retained;
}

async function atomicJson(file, value) {
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temp, file);
}
