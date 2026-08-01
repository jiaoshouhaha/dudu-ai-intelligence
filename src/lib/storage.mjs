import fs from 'node:fs/promises';
import path from 'node:path';

function dayKey(iso) {
  return iso.slice(0, 10);
}

export async function readExistingData(dataDir) {
  try {
    const search = JSON.parse(await fs.readFile(path.join(dataDir, 'search.json'), 'utf8'));
    return Array.isArray(search.items) ? search.items : [];
  } catch {
    return [];
  }
}

export function validateEvent(event) {
  const required = ['id', 'titleOriginal', 'originalUrl', 'publishedAt', 'importance', 'sources'];
  for (const key of required) if (event[key] == null) throw new Error(`Event ${event.id || 'unknown'} missing ${key}`);
  if (!Array.isArray(event.sources) || !event.sources.length) throw new Error(`Event ${event.id} has no sources`);
  if (event.importance < 1 || event.importance > 100) throw new Error(`Event ${event.id} has invalid score`);
}

export async function writeDataFiles(dataDir, items, status, retentionDays = 365) {
  items.forEach(validateEvent);
  await fs.mkdir(path.join(dataDir, 'news'), { recursive: true });

  const cutoff = Date.now() - retentionDays * 864e5;
  const retained = items
    .filter((item) => new Date(item.publishedAt).valueOf() >= cutoff)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const byDay = Map.groupBy(retained, (item) => dayKey(item.publishedAt));
  for (const [day, dayItems] of byDay) {
    await atomicJson(path.join(dataDir, 'news', `${day}.json`), { generatedAt: status.finishedAt, items: dayItems });
  }

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

