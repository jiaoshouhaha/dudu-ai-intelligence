import { jaccard, stableId, tokenizeTitle } from './utils.mjs';

export function dedupeItems(items, threshold = 0.72) {
  const events = [];
  for (const item of items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))) {
    const match = events.find((event) => {
      if (event.normalizedUrl === item.normalizedUrl || event.fingerprint === item.fingerprint) return true;
      return jaccard(tokenizeTitle(event.titleOriginal), tokenizeTitle(item.title)) >= threshold;
    });

    const source = {
      id: item.sourceId,
      name: item.sourceName,
      type: item.sourceType,
      url: item.url,
      publishedAt: item.publishedAt
    };

    if (match) {
      if (!match.sources.some((existing) => existing.url === source.url)) match.sources.push(source);
      match.publishedAt = match.publishedAt < item.publishedAt ? item.publishedAt : match.publishedAt;
      match.authority = Math.max(match.authority, item.authority);
      continue;
    }

    events.push({
      id: stableId(item.normalizedUrl || item.fingerprint),
      normalizedUrl: item.normalizedUrl,
      originalUrl: item.url,
      titleOriginal: item.title,
      summaryOriginal: item.description,
      originalLanguage: item.language,
      author: item.author,
      category: item.category,
      sourceType: item.sourceType,
      authority: item.authority,
      publishedAt: item.publishedAt,
      sources: [source]
    });
  }
  return events;
}

