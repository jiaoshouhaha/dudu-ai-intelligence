import fs from 'node:fs/promises';
import { normalizeItem } from './normalize.mjs';
import { dedupeItems } from './dedupe.mjs';
import { scoreEvent } from './score.mjs';
import { aiConfig, enrichEvents, finalizeFallback } from './ai-client.mjs';
import { translateEventsToChinese, translationConfig } from './translate.mjs';
import { readExistingData, readSeenData, writeDataFiles } from './storage.mjs';
import { dateKeyInTimeZone, hasReleaseSignal, modelEntities } from './utils.mjs';
import { parseSourceResponse } from './source-adapters.mjs';
import { isSameEvent, mergeEventReports } from './event-merge.mjs';

export async function fetchSource(source, options) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.feedTimeoutMs);
  try {
    const response = await options.fetchImpl(source.url, {
      headers: { 'user-agent': 'SignalAI/1.0 (+personal RSS reader)' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const items = await parseSourceResponse(response, source, options.now);
    const limitedItems = source.maxItems ? items.slice(0, Number(source.maxItems)) : items;
    return { sourceId: source.id, ok: true, count: limitedItems.length, durationMs: Date.now() - started, items: limitedItems };
  } catch (error) {
    return { sourceId: source.id, ok: false, count: 0, durationMs: Date.now() - started, error: String(error.message || error), items: [] };
  } finally {
    clearTimeout(timer);
  }
}

function isMajorRelease(event) {
  const corpus = `${event.titleOriginal} ${event.summaryOriginal}`;
  const models = modelEntities(corpus);
  return (event.sourceType === 'official' && models.size > 0 && hasReleaseSignal(corpus)) ||
    /(?:new|latest|flagship|frontier|preview|release|launch|model|发布|上线|开源|正式版|权重|参数)/i.test(corpus);
}

function candidateRank(event) {
  const major = isMajorRelease(event);
  const official = event.sourceType === 'official' || event.authority >= 94;
  const practical = event.category === 'tips' || event.contentType === 'practical';
  const paper = event.sourceType === 'paper' || event.contentType === 'paper';
  const lane = major ? 0 : official ? 1 : practical ? 2 : paper ? 4 : 3;
  const priority = event.sourcePriority || event.authority || 0;
  // Within the official lane, prefer the source's editorial priority before the
  // rule score. This prevents a newly-added first-party feed from being
  // perpetually crowded out by slightly higher-scoring aggregator items.
  return official && !major
    ? [lane, -priority, -(event.importance || 0), -new Date(event.publishedAt).valueOf()]
    : [lane, -(event.importance || 0), -priority, -new Date(event.publishedAt).valueOf()];
}

export function selectCandidateEvents(events, maxNew) {
  const sorted = [...events].sort((left, right) => {
    const a = candidateRank(left);
    const b = candidateRank(right);
    for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
    return 0;
  });
  const papers = sorted.filter((event) => event.sourceType === 'paper' || event.contentType === 'paper').slice(0, 2);
  return [...sorted.filter((event) => event.sourceType !== 'paper' && event.contentType !== 'paper'), ...papers]
    .sort((left, right) => {
      const a = candidateRank(left);
      const b = candidateRank(right);
      for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
      return 0;
    })
    .slice(0, maxNew);
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
  const existingByEvent = [];
  for (const item of (await readExistingData(resolvedDataDir)).filter((event) => new Date(event.publishedAt).valueOf() >= windowCutoff)) {
    const match = existingByEvent.find((old) => isSameEvent(old, item));
    if (match) Object.assign(match, mergeEventReports(match, item));
    else existingByEvent.push(item);
  }
  for (const incoming of freshEvents) {
    const match = existingByEvent.find((old) => isSameEvent(old, incoming));
    if (match) Object.assign(match, mergeEventReports(match, incoming));
  }
  const existing = existingByEvent;
  const seen = await readSeenData(resolvedDataDir);
  const seenCutoff = now.valueOf() - 7 * 864e5;
  const retainedSeen = Object.fromEntries(Object.entries(seen).filter(([, lastSeenAt]) => new Date(lastSeenAt).valueOf() >= seenCutoff));
  const existingIds = new Set(existing.map((item) => item.id));
  const maxNew = Number(process.env.MAX_NEW_ITEMS_PER_RUN || 80);
  const detailBackfillLimit = Math.min(2, maxNew);
  const matchesExisting = (event) => existing.some((old) =>
    isSameEvent(old, event)
  );
  const duplicateEvents = freshEvents.filter((event) => matchesExisting(event));
  const newEvents = selectCandidateEvents(freshEvents
    .filter((event) => !existingIds.has(event.id) && !retainedSeen[event.id] && !matchesExisting(event))
    , Math.max(1, maxNew - detailBackfillLimit));
  const detailBackfill = existing
    .filter((event) => !event.detailZh || !event.readerImpactZh || !event.howItWorksZh)
    .slice(0, detailBackfillLimit);
  const enrichedCandidates = await enrichEvents([...newEvents, ...detailBackfill], aiConfig());
  const enriched = enrichedCandidates.slice(0, newEvents.length);
  const backfilledDetails = enrichedCandidates.slice(newEvents.length);
  const backfillById = new Map(backfilledDetails.map((event) => [event.id, event]));
  const refreshedExisting = existing.map((event) => backfillById.get(event.id) || finalizeFallback(event));
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
    detailBackfilled: backfilledDetails.filter((event) => event.detailZh).length,
    pendingTranslation: translated.length - merged.length,
    totalEvents: merged.length,
    priorityEvents: newEvents.filter(isMajorRelease).length,
    schedule: 'GitHub Actions best effort · 每 30 分钟一次',
    sources: results.map(({ items: _items, ...result }) => result)
  };
  const retained = await writeDataFiles(resolvedDataDir, merged, status, todayKey, retainedSeen);
  return { status, items: retained };
}

export async function loadSources(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
