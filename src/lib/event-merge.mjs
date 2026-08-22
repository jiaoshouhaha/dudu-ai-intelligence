import { chooseRicherSummary, shouldPreferIncomingSource } from './source-preference.mjs';
import { hasReleaseSignal, modelEntities, titleSimilarity } from './utils.mjs';

export function isSameEvent(left, right) {
  if (left.id === right.id || left.normalizedUrl === right.normalizedUrl) return true;
  const similarity = titleSimilarity(left.titleOriginal, right.titleOriginal);
  if (similarity.score >= 0.64 && similarity.intersection >= 3) return true;
  return [...modelEntities(left.titleOriginal)].some((name) => /\d/.test(name) && modelEntities(right.titleOriginal).has(name)) &&
    hasReleaseSignal(left.titleOriginal) && hasReleaseSignal(right.titleOriginal);
}

export function mergeEventReports(current, incoming) {
  const sources = [...(current.sources || [])];
  for (const source of incoming.sources || []) {
    if (!sources.some((existing) => existing.url === source.url)) sources.push(source);
  }
  const preferIncoming = shouldPreferIncomingSource(current, incoming);
  const identity = preferIncoming ? {
    normalizedUrl: incoming.normalizedUrl,
    originalUrl: incoming.originalUrl,
    titleOriginal: incoming.titleOriginal,
    originalLanguage: incoming.originalLanguage,
    author: incoming.author,
    category: incoming.category,
    sourceType: incoming.sourceType,
    publishedPrecision: incoming.publishedPrecision || current.publishedPrecision
  } : {};
  return {
    ...current,
    ...identity,
    summaryOriginal: chooseRicherSummary(current.summaryOriginal, incoming.summaryOriginal),
    publishedAt: new Date(current.publishedAt) > new Date(incoming.publishedAt) ? current.publishedAt : incoming.publishedAt,
    authority: Math.max(current.authority || 0, incoming.authority || 0),
    sourcePriority: Math.max(current.sourcePriority || 0, incoming.sourcePriority || 0),
    images: [...new Set([...(current.images || []), ...(incoming.images || [])])].slice(0, 8),
    resourceLinks: [...new Set([...(current.resourceLinks || []), ...(incoming.resourceLinks || [])])].slice(0, 12),
    sources
  };
}
