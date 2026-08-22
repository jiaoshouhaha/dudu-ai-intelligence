import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSource, loadSources } from '../src/lib/pipeline.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 && process.argv[onlyIndex + 1]
  ? new Set(process.argv[onlyIndex + 1].split(',').map((value) => value.trim()).filter(Boolean))
  : null;
const sources = (await loadSources(path.join(rootDir, 'config', 'sources.json')))
  .filter((source) => source.enabled !== false && (!only || only.has(source.id)));
const now = new Date();
const results = await Promise.all(sources.map((source) => fetchSource(source, {
  fetchImpl: fetch,
  feedTimeoutMs: Number(process.env.FEED_TIMEOUT_MS || 15000),
  now
})));
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}\t${result.sourceId}\t${result.count}\t${result.error || `${result.durationMs}ms`}`);
}
if (results.some((result) => !result.ok)) process.exitCode = 1;
