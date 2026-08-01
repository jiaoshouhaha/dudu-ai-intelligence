import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { loadSources, runPipeline } from '../src/lib/pipeline.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = await loadSources(path.join(rootDir, 'config', 'sources.json'));
const fixtureMode = process.argv.includes('--fixture');
const freshMode = process.argv.includes('--fresh');
const fixtureXml = fixtureMode ? await fs.readFile(path.join(rootDir, 'test', 'fixtures', 'sample-rss.xml'), 'utf8') : null;
const selectedSources = fixtureMode ? sources.slice(0, 3) : sources;

if (freshMode) {
  await fs.rm(path.join(rootDir, 'data'), { recursive: true, force: true });
}

const { status } = await runPipeline({ rootDir, sources: selectedSources, fixtureXml });
console.log(JSON.stringify(status, null, 2));
if (!fixtureMode && status.successfulSources === 0) process.exitCode = 1;
