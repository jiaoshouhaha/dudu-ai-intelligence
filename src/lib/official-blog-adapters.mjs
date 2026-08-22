import { load } from 'cheerio';
import { extractImageUrls, extractResourceLinks, stripHtml } from './utils.mjs';

const MONTHS = new Map([
  ['jan', 0], ['january', 0], ['feb', 1], ['february', 1], ['mar', 2], ['march', 2],
  ['apr', 3], ['april', 3], ['may', 4], ['jun', 5], ['june', 5], ['jul', 6],
  ['july', 6], ['aug', 7], ['august', 7], ['sep', 8], ['september', 8], ['oct', 9],
  ['october', 9], ['nov', 10], ['november', 10], ['dec', 11], ['december', 11]
]);
const DATE_PATTERN = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/i;

function publicationFromText(value, now) {
  const match = String(value || '').match(DATE_PATTERN);
  if (!match) return null;
  let year = Number(match[3] || now.getUTCFullYear());
  const month = MONTHS.get(match[1].toLowerCase());
  const day = Number(match[2]);
  let result = new Date(Date.UTC(year, month, day, 12));
  if (!match[3] && result.valueOf() > now.valueOf() + 7 * 864e5) {
    year -= 1;
    result = new Date(Date.UTC(year, month, day, 12));
  }
  return { publishedAt: result.toISOString(), publishedPrecision: 'date' };
}

function publicationFromValue(value, now) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(raw)) {
    return publicationFromText(raw, now);
  }
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.valueOf())) return null;
  return {
    publishedAt: parsed.toISOString(),
    publishedPrecision: /T\d{2}:\d{2}/.test(raw) ? 'minute' : 'date'
  };
}

function structuredPosts($, source, now, policy) {
  const nodes = [];
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.some((type) => ['Article', 'BlogPosting', 'NewsArticle'].includes(type))) nodes.push(value);
    if (value['@graph']) visit(value['@graph']);
    if (value.itemListElement) visit(value.itemListElement);
    if (value.item) visit(value.item);
  };
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      visit(JSON.parse($(element).text()));
    } catch {
      // A malformed structured-data block falls back to semantic article cards.
    }
  });
  return nodes.flatMap((node) => {
    const rawUrl = typeof node.url === 'string' ? node.url : node.mainEntityOfPage?.['@id'];
    let url;
    try {
      url = new URL(rawUrl, policy.baseUrl);
    } catch {
      return [];
    }
    const publication = publicationFromValue(node.datePublished || node.dateCreated, now);
    if (!policy.hosts.has(url.hostname) || !policy.path.test(url.pathname) || !node.headline || !publication) return [];
    return [{
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      authority: source.authority,
      sourcePriority: source.priority || source.authority || 0,
      category: source.category,
      language: source.language,
      title: stripHtml(node.headline),
      description: stripHtml(node.description || '').slice(0, 1200),
      images: extractImageUrls([node.image]),
      resourceLinks: [],
      author: source.name,
      url: url.href,
      ...publication
    }];
  });
}

function parseBlogCards(html, source, now, policy) {
  const $ = load(html);
  const items = structuredPosts($, source, now, policy);
  const seen = new Set(items.map((item) => item.url));
  $('a[href]').each((_, element) => {
    const link = $(element);
    let url;
    try {
      url = new URL(link.attr('href'), policy.baseUrl);
    } catch {
      return;
    }
    if (!policy.hosts.has(url.hostname) || !policy.path.test(url.pathname) || seen.has(url.href)) return;
    const card = link.closest('article, li, .w-dyn-item, [data-blog-card], [role="listitem"]').first();
    const scope = card.length ? card : link.parent();
    const title = stripHtml(scope.find('h1,h2,h3,h4').first().text() || link.attr('aria-label') || link.text());
    const description = stripHtml(scope.find('p').first().text()).slice(0, 1200);
    const publication = publicationFromValue(scope.find('time[datetime]').first().attr('datetime') || scope.text(), now);
    if (!title || !publication) return;
    seen.add(url.href);
    items.push({
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      authority: source.authority,
      sourcePriority: source.priority || source.authority || 0,
      category: source.category,
      language: source.language,
      title,
      description,
      images: extractImageUrls([scope.html()]),
      resourceLinks: extractResourceLinks([description]),
      author: source.name,
      url: url.href,
      ...publication
    });
  });
  if (!items.length) throw new Error(`${source.id} page has no valid blog entries`);
  return items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

export function parseOpenAiDeveloperBlog(html, source, now = new Date()) {
  return parseBlogCards(html, source, now, {
    baseUrl: 'https://developers.openai.com/blog',
    hosts: new Set(['developers.openai.com', 'learn.chatgpt.com']),
    path: /^\/blog\/[a-z0-9][a-z0-9-]+\/?$/i
  });
}

export function parseClaudeBlog(html, source, now = new Date()) {
  return parseBlogCards(html, source, now, {
    baseUrl: 'https://claude.com/blog',
    hosts: new Set(['claude.com']),
    path: /^\/blog\/[a-z0-9][a-z0-9-]+\/?$/i
  });
}
