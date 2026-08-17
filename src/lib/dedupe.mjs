import { hasReleaseSignal, modelEntities, stableId, titleSimilarity } from './utils.mjs';

export function dedupeItems(items, threshold = 0.72) {
  const events = [];
  for (const item of items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))) {
    const match = events.find((event) => {
      if (event.normalizedUrl === item.normalizedUrl || event.fingerprint === item.fingerprint) return true;
      const similarity = titleSimilarity(event.titleOriginal, item.title);
      if (similarity.score >= Math.min(threshold, 0.64) && similarity.intersection >= 3) return true;
      const sharedSpecificModel = [...modelEntities(event.titleOriginal)].some((name) => /\d/.test(name) && modelEntities(item.title).has(name));
      return sharedSpecificModel && hasReleaseSignal(event.titleOriginal) && hasReleaseSignal(item.title);
    });

    const source = {
      id: item.sourceId,
      name: item.sourceName,
      type: item.sourceType,
      url: item.url,
      publishedAt: item.publishedAt,
      title: item.title,
      authority: item.authority,
      sourcePriority: item.sourcePriority || item.authority || 0,
      images: item.images || [],
      resourceLinks: item.resourceLinks || []
    };

    if (match) {
      if (!match.sources.some((existing) => existing.url === source.url)) match.sources.push(source);
      match.publishedAt = match.publishedAt < item.publishedAt ? item.publishedAt : match.publishedAt;
      match.authority = Math.max(match.authority, item.authority);
      match.sourcePriority = Math.max(match.sourcePriority || 0, item.sourcePriority || item.authority || 0);
      match.images = [...new Set([...(match.images || []), ...(item.images || [])])].slice(0, 8);
      match.resourceLinks = [...new Set([...(match.resourceLinks || []), ...(item.resourceLinks || [])])].slice(0, 12);
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
      images: [...new Set(item.images || [])].slice(0, 8),
      resourceLinks: [...new Set(item.resourceLinks || [])].slice(0, 12),
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
