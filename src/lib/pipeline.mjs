import fs from 'node:fs/promises';
import { parseFeed } from './feed-parser.mjs';
import { normalizeItem } from './normalize.mjs';
import { dedupeItems } from './dedupe.mjs';
import { scoreEvent } from './score.mjs';
import { aiConfig, enrichEvents, finalizeFallback } from './ai-client.mjs';
import { translateEventsToChinese, translationConfig } from './translate.mjs';
import { readExistingData, readSeenData, writeDataFiles } from './storage.mjs';
import { dateKeyInTimeZone, jaccard, tokenizeTitle } from './utils.mjs';

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
  const todayKey = dateKeyInTimeZone(now, 'Asia/Shanghai');
  const windowHours = Number(process.env.NEWS_WINDOW_HOURS || 36);
  const windowCutoff = now.valueOf() - windowHours * 36e5;
  const results = await Promise.all(enabledSources.map((source) => fetchSource(source, options)));
  const normalized = results
    .flatMap((result) => result.items)
    .map(normalizeItem)
    .filter((item) => new Date(item.publishedAt).valueOf() >= windowCutoff && new Date(item.publishedAt).valueOf() <= now.valueOf() + 5 * 60e3);
  const freshEvents = dedupeItems(normalized).map((event) => scoreEvent(event, now));
  const existing = (await readExistingData(resolvedDataDir))
    .filter((event) => new Date(event.publishedAt).valueOf() >= windowCutoff);
  const seen = await readSeenData(resolvedDataDir);
  const seenCutoff = now.valueOf() - 7 * 864e5;
  const retainedSeen = Object.fromEntries(Object.entries(seen).filter(([, lastSeenAt]) => new Date(lastSeenAt).valueOf() >= seenCutoff));
  const existingIds = new Set(existing.map((item) => item.id));
  const maxNew = Number(process.env.MAX_NEW_ITEMS_PER_RUN || 80);
  const matchesExisting = (event) => existing.some((old) =>
    old.id === event.id ||
    old.normalizedUrl === event.normalizedUrl ||
    jaccard(tokenizeTitle(old.titleOriginal), tokenizeTitle(event.titleOriginal)) >= 0.72
  );
  const duplicateEvents = freshEvents.filter((event) => matchesExisting(event));
  const newEvents = freshEvents
    .filter((event) => !existingIds.has(event.id) && !retainedSeen[event.id] && !matchesExisting(event))
    .slice(0, maxNew);
  const enriched = await enrichEvents(newEvents, aiConfig());
  const refreshedExisting = existing.map((event) => finalizeFallback(event));
  const mergedBeforeTranslation = [...enriched, ...refreshedExisting.filter((old) => !enriched.some((item) => item.id === old.id))];
  const translated = await translateEventsToChinese(mergedBeforeTranslation, translationConfig(), fetchImpl);
  const merged = translated.filter((event) => event.titleZh && event.summaryZh);
  const seenAt = now.toISOString();
  for (const event of [...merged, ...duplicateEvents]) retainedSeen[event.id] = seenAt;
  const finishedAt = new Date().toISOString();
  const status = {
    startedAt,
    finishedAt,
    date: todayKey,
    timezone: 'Asia/Shanghai',
    windowHours,
    mode: aiConfig().apiKey ? 'deepseek' : 'rules',
    sourceCount: enabledSources.length,
    successfulSources: results.filter((result) => result.ok).length,
    failedSources: results.filter((result) => !result.ok).length,
    fetchedItems: normalized.length,
    newEvents: enriched.length,
    pendingTranslation: translated.length - merged.length,
    totalEvents: merged.length,
    sources: results.map(({ items: _items, ...result }) => result)
  };
  const retained = await writeDataFiles(resolvedDataDir, merged, status, todayKey, retainedSeen);
  return { status, items: retained };
}

export async function loadSources(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
