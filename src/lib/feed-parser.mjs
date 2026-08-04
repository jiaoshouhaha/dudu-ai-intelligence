import { XMLParser } from 'fast-xml-parser';
import { asArray, isoDate, stripHtml, text } from './utils.mjs';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', trimValues: true });

function atomLink(entry) {
  const links = asArray(entry.link);
  const preferred = links.find((link) => typeof link === 'object' && (!link.rel || link.rel === 'alternate'));
  return text(preferred || links[0]);
}

export function parseFeed(xml, source, now = new Date()) {
  const document = parser.parse(xml);
  const rssItems = asArray(document?.rss?.channel?.item);
  const atomItems = asArray(document?.feed?.entry);
  const rdfItems = asArray(document?.['rdf:RDF']?.item);
  const items = rssItems.length ? rssItems : atomItems.length ? atomItems : rdfItems;

  return items
    .map((item) => {
      const url = text(item.link) || atomLink(item) || text(item.guid) || text(item.id);
      const title = stripHtml(text(item.title));
      const description = stripHtml(
        text(item.description) || text(item.summary) || text(item.content) || text(item['content:encoded'])
      ).slice(0, 1200);
      const publishedAt = isoDate(
        text(item.pubDate) || text(item.published) || text(item.updated) || text(item['dc:date']),
        now
      );
      return {
        sourceId: source.id,
        sourceName: source.name,
        sourceType: source.type,
        authority: source.authority,
        sourcePriority: source.priority || source.authority || 0,
        category: source.category,
        language: source.language,
        title,
        description,
        author: text(item.author) || text(item['dc:creator']),
        url,
        publishedAt
      };
    })
    .filter((item) => item.title && /^https?:\/\//i.test(item.url));
}
