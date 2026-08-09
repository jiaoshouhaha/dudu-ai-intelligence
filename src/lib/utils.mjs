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

const MODEL_ENTITY_PATTERNS = [
  ['qwen3.8-max', /qwen\s*3[._-]?8\s*[- ]?max|qwen3\.8|max/i],
  ['qwen', /qwen|通义千问/i],
  ['deepseek', /deepseek|深度求索/i],
  ['gpt', /\bgpt(?:[- .]?\d+(?:\.\d+)?)?|chatgpt|codex|openai/i],
  ['claude', /claude|anthropic/i],
  ['gemini', /gemini|deepmind/i],
  ['grok', /grok|xai/i],
  ['kimi', /\bkimi\b|moonshot|月之暗面/i],
  ['glm', /\bglm\b|智谱/i],
  ['llama', /llama|meta ai/i],
  ['minimax', /minimax|mini max/i]
];

export function modelEntities(value) {
  const corpus = stripHtml(value);
  return new Set(MODEL_ENTITY_PATTERNS.filter(([, pattern]) => pattern.test(corpus)).map(([name]) => name));
}

export function hasReleaseSignal(value) {
  return /launch|release|announce|available|publish|introduc|model|new|flagship|open.?weight|parameter|发布|上线|开源|推出|亮相|更新|预览|正式版|权重|参数/i.test(stripHtml(value));
}

export function extractImageUrls(value) {
  const urls = new Set();
  const add = (candidate, hint = '') => {
    if (typeof candidate !== 'string' || !/^https?:\/\//i.test(candidate)) return;
    const clean = candidate.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').trim();
    if (!clean) return;
    const imageLike = /image|thumbnail|poster|\.png(?:[?#]|$)|\.jpe?g(?:[?#]|$)|\.webp(?:[?#]|$)|\.gif(?:[?#]|$)|\.svg(?:[?#]|$)/i.test(`${hint} ${clean}`);
    if (imageLike) urls.add(clean);
  };
  const visit = (node, hint = '') => {
    if (node == null) return;
    if (typeof node === 'string') {
      for (const match of node.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)) add(match[1], 'image');
      for (const match of node.matchAll(/https?:\/\/[^\s"'<>]+/gi)) add(match[0], hint);
      return;
    }
    if (Array.isArray(node)) return node.forEach((entry) => visit(entry, hint));
    if (typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) visit(child, `${hint} ${key}`);
    }
  };
  visit(value);
  return [...urls].slice(0, 8);
}

export function extractResourceLinks(value) {
  const links = new Set();
  const imagePattern = /\.(?:png|jpe?g|webp|gif|svg)(?:[?#]|$)/i;
  const add = (candidate) => {
    if (typeof candidate !== 'string' || !/^https?:\/\//i.test(candidate)) return;
    const clean = candidate.replace(/[),.;，。！？）】]+$/, '').replace(/&amp;/gi, '&').trim();
    if (clean && !imagePattern.test(clean)) links.add(clean);
  };
  const visit = (node) => {
    if (node == null) return;
    if (typeof node === 'string') {
      for (const match of node.matchAll(/https?:\/\/[^\s"'<>]+/gi)) add(match[0]);
      return;
    }
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node === 'object') Object.values(node).forEach(visit);
  };
  visit(value);
  return [...links].slice(0, 12);
}

export function titleSimilarity(left, right) {
  const a = tokenizeTitle(left);
  const b = tokenizeTitle(right);
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return { score: jaccard(a, b), intersection };
}

export function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
