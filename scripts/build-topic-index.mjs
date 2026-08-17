import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTopicIndex } from '../src/lib/topic-taxonomy.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(rootDir, 'data');
const index = JSON.parse(await fs.readFile(path.join(dataDir, 'index.json'), 'utf8'));
const topicIndex = buildTopicIndex(index.items || [], new Date().toISOString());
const output = path.join(dataDir, 'topic-index.json');
const temporary = `${output}.tmp`;
await fs.writeFile(temporary, `${JSON.stringify(topicIndex, null, 2)}\n`, 'utf8');
await fs.rename(temporary, output);

const audit = {
  generatedAt: topicIndex.generatedAt,
  totalItems: topicIndex.audit.totalItems,
  unclassified: topicIndex.audit.unclassifiedItemIds.length,
  multiCompany: topicIndex.audit.multiCompanyItemIds.length,
  topics: Object.fromEntries(topicIndex.topics.map((topic) => [topic.id, topic.count]))
};
console.log(JSON.stringify(audit, null, 2));
