import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteOrigin = (process.env.SITE_ORIGIN || 'https://jiaoshouhaha.github.io/dudu-ai-intelligence').replace(/\/$/, '');
const publicDir = path.join(rootDir, 'public');

function xml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let lookup = { dates: {}, generatedAt: '' };
try {
  lookup = JSON.parse(await fs.readFile(path.join(rootDir, 'data', 'lookup.json'), 'utf8'));
} catch {
  lookup = { dates: {}, generatedAt: '' };
}

const lastmod = String(lookup.generatedAt || '').slice(0, 10);
const staticPages = ['index.html', 'archive.html', 'topics.html', 'rankings.html'];
const details = Object.entries(lookup.dates || {})
  .filter(([id, date]) => id && /^\d{4}-\d{2}-\d{2}$/.test(date))
  .sort((left, right) => right[1].localeCompare(left[1]) || left[0].localeCompare(right[0]));

const urls = [
  ...staticPages.map((page) => `${siteOrigin}/${page}`),
  ...details.map(([id]) => `${siteOrigin}/detail.html?id=${encodeURIComponent(id)}`)
];

const body = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map((loc) => `  <url><loc>${xml(loc)}</loc>${lastmod ? `<lastmod>${xml(lastmod)}</lastmod>` : ''}</url>`),
  '</urlset>',
  ''
].join('\n');

await fs.mkdir(publicDir, { recursive: true });
await fs.writeFile(path.join(publicDir, 'sitemap.xml'), body);
await fs.writeFile(path.join(publicDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}/sitemap.xml\n`);
console.log(`Wrote sitemap.xml (${urls.length} URLs) and robots.txt`);
