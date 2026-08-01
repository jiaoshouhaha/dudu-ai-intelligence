import fs from 'node:fs/promises';
import { parseFeed } from './feed-parser.mjs';
import { normalizeItem } from './normalize.mjs';
import { dedupeItems } from './dedupe.mjs';
import { scoreEvent } from './score.mjs';
import { aiConfig, enrichEvents, finalizeFallback } from './ai-client.mjs';
import { readExistingData, writeDataFiles } from './storage.mjs';

async function fetchSource(source, options) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.feedTimeoutMs);
  try {
    const response = await options.fetchImpl(source.url, {
      headers: { 'user-agent': 'SignalAI/1.0 (+personal RSS reader)' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const items = parseFeed(await response.text(), source, options.now);
    return { sourceId: source.id, ok: true, count: items.length, durationMs: Date.now() - started, items };
  } catch (error) {
    return { sourceId: source.id, ok: false, count: 0, durationMs: Date.now() - started, error: String(error.message || error), items: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function runPipeline({ rootDir, sources, fetchImpl = fetch, now = new Date(), fixtureXml = null }) {
  const startedAt = now.toISOString();
  const dataDir = new URL('../../data/', import.meta.url).pathname.replace(/\/src\/lib\/\.\.\/\.\.\/data\/$/, '/data/');
  const resolvedDataDir = rootDir ? `${rootDir}/data` : dataDir;
  const options = {
    fetchImpl: fixtureXml ? async () => ({ ok: true, text: async () => fixtureXml }) : fetchImpl,
    feedTimeoutMs: Number(process.env.FEED_TIMEOUT_MS || 15000),
    now
  };
  const enabledSources = sources.filter((source) => source.enabled !== false);
  const results = await Promise.all(enabledSources.map((source) => fetchSource(source, options)));
  const normalized = results.flatMap((result) => result.items).map(normalizeItem);
  const freshEvents = dedupeItems(normalized).map((event) => scoreEvent(event, now));
  const existing = await readExistingData(resolvedDataDir);
  const existingIds = new Set(existing.map((item) => item.id));
  const maxNew = Number(process.env.MAX_NEW_ITEMS_PER_RUN || 80);
  const newEvents = freshEvents.filter((event) => !existingIds.has(event.id)).slice(0, maxNew);
  const enriched = await enrichEvents(newEvents, aiConfig());
  const refreshedExisting = existing.map((event) => finalizeFallback(event));
  const merged = [...enriched, ...refreshedExisting.filter((old) => !enriched.some((item) => item.id === old.id))];
  const finishedAt = new Date().toISOString();
  const status = {
    startedAt,
    finishedAt,
    mode: aiConfig().apiKey ? 'ai' : 'rules',
    sourceCount: enabledSources.length,
    successfulSources: results.filter((result) => result.ok).length,
    failedSources: results.filter((result) => !result.ok).length,
    fetchedItems: normalized.length,
    newEvents: enriched.length,
    totalEvents: merged.length,
    sources: results.map(({ items: _items, ...result }) => result)
  };
  const retained = await writeDataFiles(resolvedDataDir, merged, status, Number(process.env.RETENTION_DAYS || 365));
  return { status, items: retained };
}

export async function loadSources(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

