import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSearchIndex, toListRecord } from '../src/lib/catalog.mjs';
import { readExistingData } from '../src/lib/storage.mjs';
import { dateKeyInTimeZone } from '../src/lib/utils.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(rootDir, 'data');

async function readJson(name, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, name), 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(name, value) {
  const file = path.join(dataDir, name);
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value));
  await fs.rename(temporary, file);
  return fs.stat(file);
}

const index = await readJson('index.json', { items: [] });
const archive = await readJson('archive.json', {});
const retained = await readExistingData(dataDir);
retained.sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
if (!retained.length) throw new Error('No retained news found in data/news or data/search.json');

const generatedAt = index.generatedAt || archive.generatedAt || new Date().toISOString();
const windowDays = archive.retentionDays || 180;
const homeItems = (index.items || []).map(toListRecord);
const searchIndex = buildSearchIndex(retained, generatedAt, windowDays);
const lookup = {
  generatedAt,
  windowDays,
  dates: Object.fromEntries(retained.map((item) => [item.id, dateKeyInTimeZone(item.publishedAt)]))
};

const indexStat = await writeJson('index.json', {
  generatedAt,
  windowDays,
  itemCount: homeItems.length,
  items: homeItems
});
const searchStat = await writeJson('search-index.json', searchIndex);
const lookupStat = await writeJson('lookup.json', lookup);
await fs.rm(path.join(dataDir, 'search.json'), { force: true });

console.log(JSON.stringify({
  homeItems: homeItems.length,
  searchItems: searchIndex.itemCount,
  lookupIds: Object.keys(lookup.dates).length,
  indexBytes: indexStat.size,
  searchIndexBytes: searchStat.size,
  lookupBytes: lookupStat.size
}, null, 2));
