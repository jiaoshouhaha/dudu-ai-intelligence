import { parseFeed } from './feed-parser.mjs';
import { parseClaudeBlog, parseOpenAiDeveloperBlog } from './official-blog-adapters.mjs';
import { extractImageUrls, extractResourceLinks } from './utils.mjs';

const AIHOT_CATEGORY_MAP = {
  'ai-models': 'models',
  'ai-products': 'products',
  industry: 'business',
  paper: 'research',
  tip: 'tips'
};

export function parseAihotItems(payload, source) {
  if (!payload || !Array.isArray(payload.items)) throw new Error('AI HOT response has no items array');
  return payload.items
    .map((item) => ({
      sourceId: `${source.id}:${item.id}`,
      sourceName: item.source?.name || source.name,
      sourceType: item.category === 'tip' ? 'practitioner' : 'aggregator',
      authority: Math.max(source.authority || 70, Number(item.score) || 0),
      sourcePriority: source.priority || source.authority || 0,
      category: AIHOT_CATEGORY_MAP[item.category] || source.category || 'other',
      language: 'zh',
      title: item.title || item.originalTitle || '',
      description: item.summary || item.originalTitle || '',
      images: extractImageUrls([item.images, item.image, item.media, item.attachments, item.summary]),
      resourceLinks: extractResourceLinks([item.links, item.summary, item.description, item.attachments]),
      author: item.source?.name || '',
      url: item.links?.original || item.links?.aihot || '',
      publishedAt: item.publishedAt || item.discoveredAt,
      discoveredAt: item.discoveredAt || null,
      contentTypeHint: item.category === 'tip' ? 'practical' : null,
      evidenceLevelHint: item.category === 'tip' ? 'practitioner' : null,
      attribution: item.attribution || { name: 'AI HOT', url: item.links?.aihot }
    }))
    .filter((item) => item.title && /^https?:\/\//i.test(item.url));
}

export async function parseSourceResponse(response, source, now = new Date()) {
  const format = source.format || 'rss';
  if (format === 'aihot-json') return parseAihotItems(await response.json(), source);
  const body = await response.text();
  if (format === 'rss') return parseFeed(body, source, now);
  if (format === 'openai-developer-html') return parseOpenAiDeveloperBlog(body, source, now);
  if (format === 'claude-blog-html') return parseClaudeBlog(body, source, now);
  throw new Error(`Unsupported source format: ${format}`);
}
