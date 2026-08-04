import { hasReleaseSignal, jaccard, modelEntities, stableId, tokenizeTitle } from './utils.mjs';

export function dedupeItems(items, threshold = 0.72) {
  const events = [];
  for (const item of items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))) {
    const match = events.find((event) => {
      if (event.normalizedUrl === item.normalizedUrl || event.fingerprint === item.fingerprint) return true;
      if (jaccard(tokenizeTitle(event.titleOriginal), tokenizeTitle(item.title)) >= threshold) return true;
      const sharedModels = [...modelEntities(event.titleOriginal)].some((name) => modelEntities(item.title).has(name));
      return sharedModels && hasReleaseSignal(event.titleOriginal) && hasReleaseSignal(item.title);
    });

    const source = {
      id: item.sourceId,
      name: item.sourceName,
      type: item.sourceType,
      url: item.url,
      publishedAt: item.publishedAt,
      title: item.title,
      authority: item.authority,
      sourcePriority: item.sourcePriority || item.authority || 0
    };

    if (match) {
      if (!match.sources.some((existing) => existing.url === source.url)) match.sources.push(source);
      match.publishedAt = match.publishedAt < item.publishedAt ? item.publishedAt : match.publishedAt;
      match.authority = Math.max(match.authority, item.authority);
      match.sourcePriority = Math.max(match.sourcePriority || 0, item.sourcePriority || item.authority || 0);
      const prefersOfficialLink = /(?:qwen\.ai|openai\.com|deepseek\.com|anthropic\.com|deepmind\.google|blog\.google)/i.test(item.url || '') &&
        !/(?:qwen\.ai|openai\.com|deepseek\.com|anthropic\.com|deepmind\.google|blog\.google)/i.test(match.originalUrl || '');
      if ((item.sourceType === 'official' && match.sourceType !== 'official') || prefersOfficialLink) {
        match.normalizedUrl = item.normalizedUrl;
        match.originalUrl = item.url;
        match.titleOriginal = item.title;
        match.summaryOriginal = item.description;
        match.originalLanguage = item.language;
        match.author = item.author;
        match.sourceType = item.sourceType;
        match.category = item.category;
        match.contentType = item.contentTypeHint || match.contentType;
        match.evidenceLevel = item.evidenceLevelHint || match.evidenceLevel;
      }
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
      sourcePriority: item.sourcePriority || item.authority || 0,
      publishedAt: item.publishedAt,
      discoveredAt: item.discoveredAt || null,
      contentType: item.contentTypeHint || null,
      evidenceLevel: item.evidenceLevelHint || null,
      attribution: item.attribution || null,
      sources: [source]
    });
  }
  return events;
}
