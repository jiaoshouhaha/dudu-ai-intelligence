export function expandSearchIndex(data) {
  const rows = data?.items || [];
  if (!rows.length || !Array.isArray(rows[0])) return rows;
  return rows.map((row) => {
    const [id, publishedAt, importance, category, contentType, evidenceLevel, sourceType, titleZh, summaryZh, originalUrl, sourceIndex, models, topics, precision, keywords] = row;
    const item = {
      id,
      publishedAt,
      importance,
      category: data.categories?.[category] || 'other',
      contentType: data.contentTypes?.[contentType] || '',
      evidenceLevel: data.evidenceLevels?.[evidenceLevel] || '',
      sourceType: data.sourceTypes?.[sourceType] || '',
      titleZh: titleZh || '',
      summaryZh: summaryZh || '',
      originalUrl: originalUrl || '',
      sourceName: data.sources?.[sourceIndex] || '',
      models: models || [],
      topics: topics || []
    };
    if (precision === 'd') item.publishedPrecision = 'date';
    if (keywords) item.keywords = String(keywords).split('|').filter(Boolean);
    return item;
  });
}
