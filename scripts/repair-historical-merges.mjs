import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEditorialRepairs } from '../src/lib/editorial-repairs.mjs';
import { readSeenData, writeDataFiles } from '../src/lib/storage.mjs';
import { dateKeyInTimeZone } from '../src/lib/utils.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(rootDir, 'data');

const repairs = new Map([
  ['cc559c8d7865a53b', {
    label: 'Qwen3.8-Max',
    removeWhen: (source) => /minimax|nemotron|qwen[- ]image/i.test(`${source.title || ''} ${source.url || ''}`)
  }]
]);

const search = JSON.parse(await fs.readFile(path.join(dataDir, 'search.json'), 'utf8'));
const status = JSON.parse(await fs.readFile(path.join(dataDir, 'status.json'), 'utf8'));
const seen = await readSeenData(dataDir);
let removedReports = 0;

const repairedItems = search.items.map((item) => {
  const repair = repairs.get(item.id);
  if (!repair) return item;
  const removed = (item.sources || []).filter(repair.removeWhen);
  const sources = (item.sources || []).filter((source) => !repair.removeWhen(source));
  if (!removed.length || !sources.length) return item;
  removedReports += removed.length;
  const foreignAssets = /minimax|nemotron|nvidia/i;
  console.log(`${repair.label}: removed ${removed.length} unrelated reports`);
  return {
    ...item,
    sources,
    images: (item.images || []).filter((url) => !foreignAssets.test(url)),
    resourceLinks: (item.resourceLinks || []).filter((url) => !foreignAssets.test(url))
  };
});

const editorial = applyEditorialRepairs(repairedItems);
const finalItems = editorial.items;

if (!removedReports && !editorial.changed) {
  console.log('No historical or editorial repairs required.');
  process.exit(0);
}

const todayKey = dateKeyInTimeZone(status.finishedAt || new Date());
await writeDataFiles(dataDir, finalItems, status, todayKey, seen);
console.log(`Repaired ${removedReports} report merges and ${editorial.changed} editorial titles.`);
