export const HOME_INDEX_LIMIT = 240;
export const SEARCH_SUMMARY_LIMIT = 72;
export const SEARCH_TOPIC_LIMIT = 4;
export const SEARCH_KEYWORD_LIMIT = 4;

export function listSourceTypes(item) {
  const listed = Array.isArray(item.sourceTypes) ? item.sourceTypes : [];
  const fromSources = (item.sources || []).map((source) => source?.type).filter(Boolean);
  const types = [...listed, ...fromSources];
  if (item.sourceType) types.unshift(item.sourceType);
  return [...new Set(types.filter(Boolean))];
}

export function toListRecord(item) {
  const topics = item.topics?.length ? item.topics : (item.keywords || []);
  const record = {
    id: item.id,
    publishedAt: item.publishedAt,
    importance: item.importance,
    category: item.category,
    contentType: item.contentType,
    evidenceLevel: item.evidenceLevel,
    sourceType: item.sourceType,
    titleZh: item.titleZh || item.titleOriginal || '',
    summaryZh: item.summaryZh || item.summaryOriginal || '',
    importanceReasonZh: item.importanceReasonZh || '',
    originalUrl: item.originalUrl,
    models: item.models || [],
    topics,
    keywords: item.keywords || [],
    sourceName: item.sourceName || item.sources?.[0]?.name || '',
    sourceTypes: listSourceTypes(item)
  };
  if (item.publishedPrecision && item.publishedPrecision !== 'minute') record.publishedPrecision = item.publishedPrecision;
  if (!record.keywords.length) delete record.keywords;
  if (!record.models.length) delete record.models;
  if (!record.topics.length) delete record.topics;
  if (!record.importanceReasonZh) delete record.importanceReasonZh;
  if (record.sourceTypes.length === 1 && record.sourceTypes[0] === record.sourceType) delete record.sourceTypes;
  else if (!record.sourceTypes.length) delete record.sourceTypes;
  return record;
}

export function toSearchRecord(item) {
  const list = toListRecord(item);
  const topics = (list.topics || []).slice(0, SEARCH_TOPIC_LIMIT);
  const seen = new Set(topics);
  const keywords = (list.keywords || []).filter((keyword) => keyword && !seen.has(keyword) && !(list.titleZh || '').includes(keyword)).slice(0, SEARCH_KEYWORD_LIMIT);
  const record = {
    id: list.id,
    publishedAt: list.publishedAt,
    importance: list.importance,
    category: list.category,
    contentType: list.contentType,
    evidenceLevel: list.evidenceLevel,
    sourceType: list.sourceType,
    titleZh: list.titleZh,
    summaryZh: (list.summaryZh || '').slice(0, SEARCH_SUMMARY_LIMIT),
    originalUrl: list.originalUrl,
    sourceName: list.sourceName,
    models: (list.models || []).slice(0, 4),
    topics,
    keywords
  };
  if (list.publishedPrecision === 'date') record.publishedPrecision = 'date';
  if (!record.summaryZh) delete record.summaryZh;
  if (!record.keywords.length) delete record.keywords;
  if (!record.models.length) delete record.models;
  if (!record.topics.length) delete record.topics;
  return record;
}

function dictionaryIndex(list, value) {
  const key = value || '';
  let index = list.indexOf(key);
  if (index < 0) {
    index = list.length;
    list.push(key);
  }
  return index;
}

export function buildSearchIndex(items, generatedAt, windowDays) {
  const categories = [];
  const contentTypes = [];
  const evidenceLevels = [];
  const sourceTypes = [];
  const sources = [];
  const rows = items.map((item) => {
    const record = toSearchRecord(item);
    const row = [
      record.id,
      record.publishedAt,
      record.importance,
      dictionaryIndex(categories, record.category),
      dictionaryIndex(contentTypes, record.contentType),
      dictionaryIndex(evidenceLevels, record.evidenceLevel),
      dictionaryIndex(sourceTypes, record.sourceType),
      record.titleZh || '',
      record.summaryZh || '',
      record.originalUrl || '',
      dictionaryIndex(sources, record.sourceName),
      record.models || [],
      record.topics || []
    ];
    if (record.publishedPrecision === 'date' || record.keywords?.length) {
      row.push(record.publishedPrecision === 'date' ? 'd' : 0);
    }
    if (record.keywords?.length) row.push(record.keywords.join('|'));
    return row;
  });
  return {
    v: 1,
    generatedAt,
    windowDays,
    itemCount: rows.length,
    categories,
    contentTypes,
    evidenceLevels,
    sourceTypes,
    sources,
    items: rows
  };
}

export function selectHomeIndexItems(items) {
  return items
    .filter((item) => !(item.contentType === 'paper' && item.importance < 78))
    .slice(0, HOME_INDEX_LIMIT);
}
