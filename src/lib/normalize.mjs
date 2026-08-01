import { sha256, stripHtml } from './utils.mjs';

const TRACKING_PARAMS = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^ref$/i, /^source$/i];

export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/$/, '') || '/';
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function normalizeItem(item) {
  const normalizedUrl = normalizeUrl(item.url);
  const title = stripHtml(item.title);
  const description = stripHtml(item.description);
  return {
    ...item,
    title,
    description,
    normalizedUrl,
    fingerprint: sha256(`${title.toLowerCase()}\n${description.slice(0, 400).toLowerCase()}`)
  };
}

