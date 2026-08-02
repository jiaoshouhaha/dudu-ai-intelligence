import { createHash } from 'node:crypto';

export function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function text(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value === 'object') return text(value['#text'] ?? value.__cdata ?? value.href ?? '');
  return '';
}

export function stripHtml(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function stableId(value) {
  return sha256(value).slice(0, 16);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function isoDate(value, fallback = new Date()) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? fallback.toISOString() : parsed.toISOString();
}

export function dateKeyInTimeZone(value, timeZone = 'Asia/Shanghai') {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function tokenizeTitle(value) {
  return new Set(
    stripHtml(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

export function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
