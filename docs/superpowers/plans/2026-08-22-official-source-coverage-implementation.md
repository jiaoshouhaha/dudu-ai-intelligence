# Official Source Coverage Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the failed Microsoft source, directly monitor the OpenAI Developer Blog and Claude Blog, prefer official versions during deduplication, and publish the two missed/corrected stories.

**Architecture:** Add focused HTML adapters that convert official blog cards into the same raw item shape as RSS, then route all source formats through one dispatcher. Keep discovery, DeepSeek enrichment, translation, storage, and scheduling unchanged; centralize official-source preference so both same-run and cross-run merges retain the official link while preserving the richer summary.

**Tech Stack:** Node.js 20+ ESM, Cheerio 1.1.2, fast-xml-parser, `node:test`, pnpm, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-22-official-source-coverage-design.md`

## Global Constraints

- Do not add a paid news API; page fetching itself must not call DeepSeek.
- Keep the existing `microsoft-ai` source ID and replace only its name and URL.
- Add `openai-developer-html` and `claude-blog-html` as explicit source formats.
- Prefer JSON-LD/semantic metadata and article-card structure; do not use screenshots, login bypasses, CAPTCHA bypasses, or visual CSS coordinates.
- A parser failure must mark only that source failed and must not stop the other sources.
- Retain the official article URL for duplicate events while keeping the most information-dense reliable summary.
- The Anthropic Chinese title must be exactly `Anthropic 开放内部 AI 培训体系，Claude Academy 面向公众上线`.
- Keep the original official title in `titleOriginal`; do not present inferences as official facts.
- Preserve the existing 180-day archive, seven-day seen registry, approximately 30-minute GitHub Actions schedule, and `MAX_NEW_ITEMS_PER_RUN=12` cost guard.

## File Structure

- Create `src/lib/official-blog-adapters.mjs`: shared card extraction plus OpenAI- and Claude-specific URL policies.
- Modify `src/lib/source-adapters.mjs`: one response dispatcher for RSS, AI HOT JSON, OpenAI HTML, and Claude HTML.
- Modify `src/lib/pipeline.mjs`: export `fetchSource`, call the dispatcher, and consume reusable event merge helpers.
- Create `src/lib/source-preference.mjs`: official-domain recognition and deterministic source/summary preference.
- Create `src/lib/event-merge.mjs`: cross-run event matching and report merging currently embedded in the pipeline.
- Create `src/lib/editorial-repairs.mjs`: idempotent URL-based correction for the approved Anthropic title.
- Modify `src/lib/dedupe.mjs`: use the shared official-source preference for same-run duplicates.
- Modify `config/sources.json`: replace Microsoft RSS and add the two official blog sources.
- Create `scripts/check-sources.mjs`: read-only live source health command with optional source filtering.
- Modify `scripts/repair-historical-merges.mjs`: apply the editorial correction while preserving existing Qwen cleanup.
- Modify `package.json` and `pnpm-lock.yaml`: add Cheerio and the source-health command.
- Create `test/fixtures/openai-developer-blog.html`, `test/fixtures/claude-blog.html`, and `test/fixtures/microsoft-ai-rss.xml`: deterministic parser fixtures.
- Create `test/official-blog-adapters.test.mjs`, `test/source-dispatch.test.mjs`, `test/source-preference.test.mjs`, and `test/editorial-repairs.test.mjs`: focused tests for each new boundary.
- Modify `README.md`: document official HTML discovery, source health checks, and the actual 30-minute schedule.
- Modify `public/app.js` and `public/detail.js`: show date-only official metadata as a date rather than inventing an exact clock time.
- Regenerate only affected files under `data/` through the existing storage writer; never hand-edit generated indexes independently.

---

### Task 1: Parse OpenAI and Claude official blog cards

**Files:**
- Create: `src/lib/official-blog-adapters.mjs`
- Create: `test/fixtures/openai-developer-blog.html`
- Create: `test/fixtures/claude-blog.html`
- Create: `test/official-blog-adapters.test.mjs`
- Modify: `package.json:16-18`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: raw HTML string, a configured source object, and a `Date` representing the scan time.
- Produces: `parseOpenAiDeveloperBlog(html: string, source: Source, now: Date): RawSourceItem[]`.
- Produces: `parseClaudeBlog(html: string, source: Source, now: Date): RawSourceItem[]`.
- `RawSourceItem` uses the existing RSS shape plus honest time precision: `{ sourceId, sourceName, sourceType, authority, sourcePriority, category, language, title, description, images, resourceLinks, author, url, publishedAt, publishedPrecision }`.

- [ ] **Step 1: Add the HTML parser dependency**

Run:

```bash
pnpm add --save-exact cheerio@1.1.2
```

Expected: `package.json` contains `"cheerio": "1.1.2"` and `pnpm-lock.yaml` records the exact resolved dependency graph.

- [ ] **Step 2: Add representative server-rendered fixtures**

Create `test/fixtures/openai-developer-blog.html` with:

```html
<!doctype html>
<html><body><main>
  <article data-blog-card>
    <a href="https://learn.chatgpt.com/blog/codex-as-a-platform">
      <time>Aug 19</time>
      <h2>Codex as a platform: build on the open agent harness</h2>
      <p>Build Codex into the products and workflows your users already know.</p>
    </a>
  </article>
  <a href="/blog">All posts</a>
  <a href="/blog/topic/codex">Codex topic</a>
</main></body></html>
```

Create `test/fixtures/claude-blog.html` with:

```html
<!doctype html>
<html><body><main>
  <div class="w-dyn-item">
    <div>August 20, 2026</div>
    <a href="/blog/anthropics-approach-to-teaching-and-learning-ai">
      <h3>Anthropic's approach to teaching and learning AI</h3>
    </a>
    <p>How Claude Academy draws on Anthropic's internal employee training.</p>
  </div>
  <a href="/blog">Blog</a>
</main></body></html>
```

- [ ] **Step 3: Write failing parser tests**

Create `test/official-blog-adapters.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { parseClaudeBlog, parseOpenAiDeveloperBlog } from '../src/lib/official-blog-adapters.mjs';

const openaiHtml = await fs.readFile(new URL('./fixtures/openai-developer-blog.html', import.meta.url), 'utf8');
const claudeHtml = await fs.readFile(new URL('./fixtures/claude-blog.html', import.meta.url), 'utf8');
const now = new Date('2026-08-22T05:00:00Z');

test('parses the OpenAI Codex harness article and excludes blog navigation', () => {
  const source = { id: 'openai-developer', name: 'OpenAI Developer Blog', type: 'official', authority: 100, priority: 104, category: 'agent', language: 'en' };
  const items = parseOpenAiDeveloperBlog(openaiHtml, source, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Codex as a platform: build on the open agent harness');
  assert.equal(items[0].url, 'https://learn.chatgpt.com/blog/codex-as-a-platform');
  assert.equal(items[0].publishedAt, '2026-08-19T12:00:00.000Z');
  assert.equal(items[0].publishedPrecision, 'date');
  assert.match(items[0].description, /products and workflows/);
});

test('parses the Claude teaching article with its official date', () => {
  const source = { id: 'claude-blog', name: 'Claude Blog', type: 'official', authority: 100, priority: 103, category: 'products', language: 'en' };
  const items = parseClaudeBlog(claudeHtml, source, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Anthropic's approach to teaching and learning AI");
  assert.equal(items[0].url, 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai');
  assert.equal(items[0].publishedAt, '2026-08-20T12:00:00.000Z');
  assert.equal(items[0].publishedPrecision, 'date');
  assert.match(items[0].description, /internal employee training/);
});

test('fails loudly when a changed page yields no valid article cards', () => {
  const source = { id: 'claude-blog', name: 'Claude Blog', type: 'official', authority: 100, priority: 103, category: 'products', language: 'en' };
  assert.throws(() => parseClaudeBlog('<html><body>changed</body></html>', source, now), /no valid blog entries/);
});

test('uses BlogPosting JSON-LD and preserves an exact publication time', () => {
  const source = { id: 'claude-blog', name: 'Claude Blog', type: 'official', authority: 100, priority: 103, category: 'products', language: 'en' };
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', headline: 'Structured update', description: 'Structured description', url: 'https://claude.com/blog/structured-update', datePublished: '2026-08-21T09:30:00Z' })}</script>`;
  const [item] = parseClaudeBlog(html, source, now);
  assert.equal(item.title, 'Structured update');
  assert.equal(item.publishedAt, '2026-08-21T09:30:00.000Z');
  assert.equal(item.publishedPrecision, 'minute');
});
```

- [ ] **Step 4: Run the focused test and verify it fails**

Run:

```bash
node --test test/official-blog-adapters.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/official-blog-adapters.mjs`.

- [ ] **Step 5: Implement the shared card parser and source policies**

Create `src/lib/official-blog-adapters.mjs`:

```js
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
    try { visit(JSON.parse($(element).text())); } catch { /* malformed block falls back to cards */ }
  });
  return nodes.flatMap((node) => {
    const rawUrl = typeof node.url === 'string' ? node.url : node.mainEntityOfPage?.['@id'];
    let url;
    try { url = new URL(rawUrl, policy.baseUrl); } catch { return []; }
    const publication = publicationFromValue(node.datePublished || node.dateCreated, now);
    if (!policy.hosts.has(url.hostname) || !policy.path.test(url.pathname) || !node.headline || !publication) return [];
    return [{
      sourceId: source.id, sourceName: source.name, sourceType: source.type,
      authority: source.authority, sourcePriority: source.priority || source.authority || 0,
      category: source.category, language: source.language, title: stripHtml(node.headline),
      description: stripHtml(node.description || '').slice(0, 1200),
      images: extractImageUrls([node.image]), resourceLinks: [], author: source.name,
      url: url.href, ...publication
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
    try { url = new URL(link.attr('href'), policy.baseUrl); } catch { return; }
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
```

- [ ] **Step 6: Run parser tests**

Run:

```bash
node --test test/official-blog-adapters.test.mjs
```

Expected: 4 tests PASS.

- [ ] **Step 7: Commit the parser boundary**

```bash
git add package.json pnpm-lock.yaml src/lib/official-blog-adapters.mjs test/fixtures/openai-developer-blog.html test/fixtures/claude-blog.html test/official-blog-adapters.test.mjs
git commit -m "feat: parse official OpenAI and Claude blogs"
```

---

### Task 2: Route new formats, replace Microsoft RSS, and expose source health

**Files:**
- Modify: `src/lib/source-adapters.mjs:1-35`
- Modify: `src/lib/pipeline.mjs:1-32`
- Modify: `config/sources.json:2-7`
- Create: `test/fixtures/microsoft-ai-rss.xml`
- Create: `test/source-dispatch.test.mjs`
- Create: `scripts/check-sources.mjs`
- Modify: `package.json:6-15`

**Interfaces:**
- Consumes: Task 1 functions `parseOpenAiDeveloperBlog` and `parseClaudeBlog`.
- Produces: `parseSourceResponse(response: ResponseLike, source: Source, now: Date): Promise<RawSourceItem[]>`.
- Produces: `fetchSource(source: Source, options: { fetchImpl, feedTimeoutMs, now }): Promise<SourceResult>` exported from `src/lib/pipeline.mjs`.
- `SourceResult` is `{ sourceId, ok, count, durationMs, error?, items }`.

- [ ] **Step 1: Add a Microsoft Source RSS fixture**

Create `test/fixtures/microsoft-ai-rss.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Microsoft Source AI</title>
  <item>
    <title>Microsoft expands an AI product</title>
    <link>https://news.microsoft.com/source/features/ai/example/</link>
    <description>Official Microsoft AI product update.</description>
    <pubDate>Fri, 21 Aug 2026 12:00:00 GMT</pubDate>
  </item>
</channel></rss>
```

- [ ] **Step 2: Write failing dispatcher and configuration tests**

Create `test/source-dispatch.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { fetchSource, loadSources } from '../src/lib/pipeline.mjs';
import { parseSourceResponse } from '../src/lib/source-adapters.mjs';

const now = new Date('2026-08-22T05:00:00Z');
const openaiHtml = await fs.readFile(new URL('./fixtures/openai-developer-blog.html', import.meta.url), 'utf8');

test('dispatches OpenAI HTML through the official adapter', async () => {
  const source = { id: 'openai-developer', name: 'OpenAI Developer Blog', format: 'openai-developer-html', type: 'official', authority: 100, priority: 104, category: 'agent', language: 'en' };
  const response = { text: async () => openaiHtml };
  const items = await parseSourceResponse(response, source, now);
  assert.equal(items[0].url, 'https://learn.chatgpt.com/blog/codex-as-a-platform');
});

test('isolates an HTML parser failure in fetchSource', async () => {
  const source = { id: 'claude-blog', name: 'Claude Blog', url: 'https://claude.com/blog', format: 'claude-blog-html', type: 'official', authority: 100, category: 'products', language: 'en' };
  const result = await fetchSource(source, { now, feedTimeoutMs: 1000, fetchImpl: async () => ({ ok: true, text: async () => '<html>changed</html>' }) });
  assert.equal(result.ok, false);
  assert.equal(result.sourceId, 'claude-blog');
  assert.match(result.error, /no valid blog entries/);
});

test('source configuration replaces Microsoft and adds both official blogs', async () => {
  const sources = await loadSources(new URL('../config/sources.json', import.meta.url));
  const byId = new Map(sources.map((source) => [source.id, source]));
  assert.equal(byId.get('microsoft-ai').url, 'https://news.microsoft.com/source/topics/ai/feed/');
  assert.equal(byId.get('openai-developer').format, 'openai-developer-html');
  assert.equal(byId.get('claude-blog').format, 'claude-blog-html');
});
```

- [ ] **Step 3: Run the dispatcher tests and verify failure**

Run:

```bash
node --test test/source-dispatch.test.mjs
```

Expected: FAIL because `parseSourceResponse` and exported `fetchSource` do not exist and the configured sources are absent.

- [ ] **Step 4: Implement one source-response dispatcher**

Add imports and this export to `src/lib/source-adapters.mjs` while retaining `parseAihotItems`:

```js
import { parseFeed } from './feed-parser.mjs';
import { parseClaudeBlog, parseOpenAiDeveloperBlog } from './official-blog-adapters.mjs';

export async function parseSourceResponse(response, source, now = new Date()) {
  const format = source.format || 'rss';
  if (format === 'aihot-json') return parseAihotItems(await response.json(), source);
  const body = await response.text();
  if (format === 'rss') return parseFeed(body, source, now);
  if (format === 'openai-developer-html') return parseOpenAiDeveloperBlog(body, source, now);
  if (format === 'claude-blog-html') return parseClaudeBlog(body, source, now);
  throw new Error(`Unsupported source format: ${format}`);
}
```

In `src/lib/pipeline.mjs`, replace the direct RSS/AI HOT branch with this complete exported function:

```js
import { parseSourceResponse } from './source-adapters.mjs';

export async function fetchSource(source, options) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.feedTimeoutMs);
  try {
    const response = await options.fetchImpl(source.url, {
      headers: { 'user-agent': 'SignalAI/1.0 (+personal RSS reader)' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const items = await parseSourceResponse(response, source, options.now);
    const limitedItems = source.maxItems ? items.slice(0, Number(source.maxItems)) : items;
    return { sourceId: source.id, ok: true, count: limitedItems.length, durationMs: Date.now() - started, items: limitedItems };
  } catch (error) {
    return { sourceId: source.id, ok: false, count: 0, durationMs: Date.now() - started, error: String(error.message || error), items: [] };
  } finally {
    clearTimeout(timer);
  }
}
```

Remove the now-unused `parseFeed` and `parseAihotItems` imports from `src/lib/pipeline.mjs`; all format selection belongs to `parseSourceResponse`.

- [ ] **Step 5: Update source configuration**

Replace and insert the official entries in `config/sources.json`:

```json
{"id":"openai-developer","name":"OpenAI Developer Blog","url":"https://developers.openai.com/blog","format":"openai-developer-html","language":"en","category":"agent","type":"official","authority":100,"priority":104,"maxItems":25,"enabled":true},
{"id":"claude-blog","name":"Claude Blog","url":"https://claude.com/blog","format":"claude-blog-html","language":"en","category":"products","type":"official","authority":100,"priority":103,"maxItems":30,"enabled":true},
{"id":"microsoft-ai","name":"Microsoft Source AI","url":"https://news.microsoft.com/source/topics/ai/feed/","language":"en","category":"products","type":"official","authority":96,"priority":96,"maxItems":40,"enabled":true}
```

Keep the existing `openai` RSS source because it covers company announcements that the developer blog does not.

- [ ] **Step 6: Add the read-only source health command**

Create `scripts/check-sources.mjs`:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSource, loadSources } from '../src/lib/pipeline.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 && process.argv[onlyIndex + 1]
  ? new Set(process.argv[onlyIndex + 1].split(',').map((value) => value.trim()).filter(Boolean))
  : null;
const sources = (await loadSources(path.join(rootDir, 'config', 'sources.json')))
  .filter((source) => source.enabled !== false && (!only || only.has(source.id)));
const now = new Date();
const results = await Promise.all(sources.map((source) => fetchSource(source, {
  fetchImpl: fetch,
  feedTimeoutMs: Number(process.env.FEED_TIMEOUT_MS || 15000),
  now
})));
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}\t${result.sourceId}\t${result.count}\t${result.error || `${result.durationMs}ms`}`);
}
if (results.some((result) => !result.ok)) process.exitCode = 1;
```

Add to `package.json`:

```json
"check:sources": "NODE_USE_ENV_PROXY=1 node scripts/check-sources.mjs"
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --test test/official-blog-adapters.test.mjs test/source-dispatch.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 8: Commit source dispatch and configuration**

```bash
git add config/sources.json package.json scripts/check-sources.mjs src/lib/pipeline.mjs src/lib/source-adapters.mjs test/fixtures/microsoft-ai-rss.xml test/source-dispatch.test.mjs
git commit -m "feat: add resilient official news sources"
```

---

### Task 3: Prefer official identity while retaining richer duplicate content

**Files:**
- Create: `src/lib/source-preference.mjs`
- Create: `src/lib/event-merge.mjs`
- Modify: `src/lib/dedupe.mjs:1-47`
- Modify: `src/lib/pipeline.mjs:9-120`
- Create: `test/source-preference.test.mjs`

**Interfaces:**
- Produces: `isOfficialPublicationUrl(url: string): boolean`.
- Produces: `shouldPreferIncomingSource(current: object, incoming: object): boolean`.
- Produces: `chooseRicherSummary(current: string, incoming: string): string`.
- Produces: `isSameEvent(left: Event, right: Event): boolean`.
- Produces: `mergeEventReports(current: Event, incoming: Event): Event`.
- Consumes: normalized events and current `titleSimilarity`, `modelEntities`, and `hasReleaseSignal` behavior.

- [ ] **Step 1: Write failing source preference tests**

Create `test/source-preference.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeItems } from '../src/lib/dedupe.mjs';
import { mergeEventReports } from '../src/lib/event-merge.mjs';
import { normalizeItem } from '../src/lib/normalize.mjs';
import { isOfficialPublicationUrl } from '../src/lib/source-preference.mjs';

test('recognizes new OpenAI and Claude official publication hosts', () => {
  assert.equal(isOfficialPublicationUrl('https://learn.chatgpt.com/blog/codex-as-a-platform'), true);
  assert.equal(isOfficialPublicationUrl('https://developers.openai.com/blog/codex-as-a-platform'), true);
  assert.equal(isOfficialPublicationUrl('https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai'), true);
  assert.equal(isOfficialPublicationUrl('https://example.com/repost'), false);
});

test('same-run dedupe keeps the official identity and the richer reliable summary', () => {
  const aggregate = normalizeItem({ sourceId: 'aggregate', sourceName: 'Aggregator', sourceType: 'aggregator', authority: 76, sourcePriority: 76, category: 'agent', language: 'en', title: 'Codex open agent harness is now a platform', description: 'A detailed account of the CLI, app-server, SDK, embedding model, and integration boundaries.', url: 'https://example.com/codex-harness', publishedAt: '2026-08-19T13:00:00Z' });
  const official = normalizeItem({ sourceId: 'openai-developer', sourceName: 'OpenAI Developer Blog', sourceType: 'official', authority: 100, sourcePriority: 104, category: 'agent', language: 'en', title: 'Codex as a platform: build on the open agent harness', description: 'Build Codex into products.', url: 'https://learn.chatgpt.com/blog/codex-as-a-platform', publishedAt: '2026-08-19T12:00:00Z' });
  const [event] = dedupeItems([aggregate, official], 0.6);
  assert.equal(event.originalUrl, official.url);
  assert.equal(event.titleOriginal, official.title);
  assert.equal(event.summaryOriginal, aggregate.description);
  assert.equal(event.sources.length, 2);
});

test('cross-run merge promotes an official canonical URL without discarding Chinese detail', () => {
  const current = { id: 'one', normalizedUrl: 'https://example.com/repost', originalUrl: 'https://example.com/repost', titleOriginal: 'Anthropic AI teaching', summaryOriginal: 'A longer verified description of the public curriculum and internal training origin.', titleZh: '已有中文标题', detailZh: '已有中文详情', sourceType: 'aggregator', authority: 76, sourcePriority: 76, publishedAt: '2026-08-20T13:00:00Z', sources: [{ url: 'https://example.com/repost' }] };
  const incoming = { ...current, normalizedUrl: 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai', originalUrl: 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai', titleOriginal: "Anthropic's approach to teaching and learning AI", summaryOriginal: 'Official description.', sourceType: 'official', authority: 100, sourcePriority: 103, sources: [{ url: 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai' }] };
  const merged = mergeEventReports(current, incoming);
  assert.equal(merged.originalUrl, incoming.originalUrl);
  assert.equal(merged.summaryOriginal, current.summaryOriginal);
  assert.equal(merged.titleZh, '已有中文标题');
  assert.equal(merged.detailZh, '已有中文详情');
  assert.equal(merged.sources.length, 2);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test test/source-preference.test.mjs
```

Expected: FAIL because the two new modules do not exist.

- [ ] **Step 3: Implement official-domain and content preference helpers**

Create `src/lib/source-preference.mjs`:

```js
const OFFICIAL_HOSTS = new Set([
  'openai.com', 'developers.openai.com', 'learn.chatgpt.com', 'claude.com', 'anthropic.com',
  'qwen.ai', 'deepseek.com', 'deepmind.google', 'blog.google', 'news.microsoft.com'
]);

export function isOfficialPublicationUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
    return [...OFFICIAL_HOSTS].some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function identityScore(value) {
  const url = value.originalUrl || value.url || '';
  return (value.sourceType === 'official' ? 10000 : 0) +
    (isOfficialPublicationUrl(url) ? 5000 : 0) +
    Number(value.sourcePriority || value.authority || 0);
}

export function shouldPreferIncomingSource(current, incoming) {
  return identityScore(incoming) > identityScore(current);
}

export function chooseRicherSummary(current, incoming) {
  const left = String(current || '').trim();
  const right = String(incoming || '').trim();
  if (!left) return right;
  if (!right) return left;
  return right.length > left.length ? right : left;
}
```

- [ ] **Step 4: Extract and implement cross-run event merge**

Create `src/lib/event-merge.mjs` with the pipeline's current event matching logic and this merge boundary:

```js
import { chooseRicherSummary, shouldPreferIncomingSource } from './source-preference.mjs';
import { hasReleaseSignal, modelEntities, titleSimilarity } from './utils.mjs';

export function isSameEvent(left, right) {
  if (left.id === right.id || left.normalizedUrl === right.normalizedUrl) return true;
  const similarity = titleSimilarity(left.titleOriginal, right.titleOriginal);
  if (similarity.score >= 0.64 && similarity.intersection >= 3) return true;
  return [...modelEntities(left.titleOriginal)].some((name) => /\d/.test(name) && modelEntities(right.titleOriginal).has(name)) &&
    hasReleaseSignal(left.titleOriginal) && hasReleaseSignal(right.titleOriginal);
}

export function mergeEventReports(current, incoming) {
  const sources = [...(current.sources || [])];
  for (const source of incoming.sources || []) {
    if (!sources.some((existing) => existing.url === source.url)) sources.push(source);
  }
  const preferIncoming = shouldPreferIncomingSource(current, incoming);
  const identity = preferIncoming ? {
    normalizedUrl: incoming.normalizedUrl,
    originalUrl: incoming.originalUrl,
    titleOriginal: incoming.titleOriginal,
    originalLanguage: incoming.originalLanguage,
    author: incoming.author,
    category: incoming.category,
    sourceType: incoming.sourceType,
    publishedPrecision: incoming.publishedPrecision || current.publishedPrecision
  } : {};
  return {
    ...current,
    ...identity,
    summaryOriginal: chooseRicherSummary(current.summaryOriginal, incoming.summaryOriginal),
    publishedAt: new Date(current.publishedAt) > new Date(incoming.publishedAt) ? current.publishedAt : incoming.publishedAt,
    authority: Math.max(current.authority || 0, incoming.authority || 0),
    sourcePriority: Math.max(current.sourcePriority || 0, incoming.sourcePriority || 0),
    images: [...new Set([...(current.images || []), ...(incoming.images || [])])].slice(0, 8),
    resourceLinks: [...new Set([...(current.resourceLinks || []), ...(incoming.resourceLinks || [])])].slice(0, 12),
    sources
  };
}
```

Modify `src/lib/pipeline.mjs` to import `isSameEvent` and `mergeEventReports`, delete its nested `sameEvent` and `mergeReports`, and replace each call without changing surrounding candidate selection or API logic.

- [ ] **Step 5: Use the same preference in same-run dedupe**

In `src/lib/dedupe.mjs`, import the helpers and replace the duplicated official URL regex:

```js
import { chooseRicherSummary, shouldPreferIncomingSource } from './source-preference.mjs';

const incomingEventShape = {
  originalUrl: item.url,
  sourceType: item.sourceType,
  sourcePriority: item.sourcePriority,
  authority: item.authority
};
match.summaryOriginal = chooseRicherSummary(match.summaryOriginal, item.description);
if (shouldPreferIncomingSource(match, incomingEventShape)) {
  match.normalizedUrl = item.normalizedUrl;
  match.originalUrl = item.url;
  match.titleOriginal = item.title;
  match.originalLanguage = item.language;
  match.author = item.author;
  match.sourceType = item.sourceType;
  match.category = item.category;
  match.contentType = item.contentTypeHint || match.contentType;
  match.evidenceLevel = item.evidenceLevelHint || match.evidenceLevel;
}
```

When constructing each source report and each new event, also add:

```js
publishedPrecision: item.publishedPrecision || 'minute'
```

Do not assign `item.description` inside the identity block; `chooseRicherSummary` owns that decision. Date-only metadata must retain `publishedPrecision: 'date'` when promoted to the official identity.

- [ ] **Step 6: Run preference and existing pipeline tests**

Run:

```bash
node --test test/source-preference.test.mjs test/pipeline.test.mjs
```

Expected: all tests PASS, including the existing Qwen/MiniMax separation and failed-source isolation cases.

- [ ] **Step 7: Commit official-source preference**

```bash
git add src/lib/source-preference.mjs src/lib/event-merge.mjs src/lib/dedupe.mjs src/lib/pipeline.mjs test/source-preference.test.mjs
git commit -m "fix: prefer official reports during news dedupe"
```

---

### Task 4: Apply the approved Anthropic editorial correction idempotently

**Files:**
- Create: `src/lib/editorial-repairs.mjs`
- Create: `test/editorial-repairs.test.mjs`
- Modify: `scripts/repair-historical-merges.mjs:1-46`
- Modify: affected generated files under `data/`

**Interfaces:**
- Produces: `applyEditorialRepairs(items: Event[]): { items: Event[], changed: number }`.
- Consumes: canonical URL normalization from `src/lib/normalize.mjs`.
- Preserves: event IDs, official URL, `titleOriginal`, detail fields, source reports, and publication timestamps.

- [ ] **Step 1: Write the failing editorial repair test**

Create `test/editorial-repairs.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEditorialRepairs } from '../src/lib/editorial-repairs.mjs';

test('renames the Anthropic teaching story without changing official metadata', () => {
  const original = { id: '286e067a509a7c4e', originalUrl: 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai', titleOriginal: 'Anthropic 如何开展 AI 教学', titleZh: 'Anthropic 发布 Claude Academy：面向全球用户的 AI 教学平台', detailZh: '原有详情', publishedAt: '2026-08-20T16:00:00Z', sources: [{ url: 'https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai' }] };
  const result = applyEditorialRepairs([original]);
  assert.equal(result.changed, 1);
  assert.equal(result.items[0].titleZh, 'Anthropic 开放内部 AI 培训体系，Claude Academy 面向公众上线');
  assert.equal(result.items[0].titleOriginal, original.titleOriginal);
  assert.equal(result.items[0].detailZh, '原有详情');
  assert.equal(result.items[0].publishedAt, original.publishedAt);
});

test('editorial repair is idempotent and ignores unrelated items', () => {
  const item = { originalUrl: 'https://example.com/other', titleZh: '其他新闻' };
  const once = applyEditorialRepairs([item]);
  const twice = applyEditorialRepairs(once.items);
  assert.equal(once.changed, 0);
  assert.equal(twice.changed, 0);
  assert.deepEqual(twice.items, [item]);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
node --test test/editorial-repairs.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/editorial-repairs.mjs`.

- [ ] **Step 3: Implement the URL-based repair**

Create `src/lib/editorial-repairs.mjs`:

```js
import { normalizeUrl } from './normalize.mjs';

const TITLE_OVERRIDES = new Map([
  [normalizeUrl('https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai'),
    'Anthropic 开放内部 AI 培训体系，Claude Academy 面向公众上线']
]);

export function applyEditorialRepairs(items) {
  let changed = 0;
  const repaired = items.map((item) => {
    const titleZh = TITLE_OVERRIDES.get(normalizeUrl(item.originalUrl));
    if (!titleZh || item.titleZh === titleZh) return item;
    changed += 1;
    return { ...item, titleZh };
  });
  return { items: repaired, changed };
}
```

- [ ] **Step 4: Integrate the repair with the existing data repair command**

In `scripts/repair-historical-merges.mjs`, retain the Qwen source cleanup, then apply the pure repair before the no-op check:

```js
import { applyEditorialRepairs } from '../src/lib/editorial-repairs.mjs';

const editorial = applyEditorialRepairs(repairedItems);
const finalItems = editorial.items;
if (!removedReports && !editorial.changed) {
  console.log('No historical or editorial repairs required.');
  process.exit(0);
}
const todayKey = dateKeyInTimeZone(status.finishedAt || new Date());
await writeDataFiles(dataDir, finalItems, status, todayKey, seen);
console.log(`Repaired ${removedReports} report merges and ${editorial.changed} editorial titles.`);
```

- [ ] **Step 5: Run the focused test and commit repair code**

Run:

```bash
node --test test/editorial-repairs.test.mjs
```

Expected: 2 tests PASS.

Commit:

```bash
git add src/lib/editorial-repairs.mjs scripts/repair-historical-merges.mjs test/editorial-repairs.test.mjs
git commit -m "fix: clarify Anthropic training story title"
```

- [ ] **Step 6: Regenerate affected data from the single canonical search dataset**

Run:

```bash
pnpm repair:data
rg -n 'Anthropic 开放内部 AI 培训体系，Claude Academy 面向公众上线' data/index.json data/search.json data/news/2026-08-21.json
```

Expected: the repair command reports one editorial title change; the exact approved title appears in all three generated views and the original URL remains `https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai`.

- [ ] **Step 7: Inspect and commit only generated files changed by the repair**

Run:

```bash
git diff --stat -- data
git diff -- data/index.json data/search.json data/news/2026-08-21.json
git diff --name-only -- data
git add data/archive.json data/index.json data/news/2026-08-21.json data/search.json
git diff --cached --check
git commit -m "data: clarify Anthropic internal AI training story"
```

Expected changed paths are exactly `data/archive.json`, `data/index.json`, `data/news/2026-08-21.json`, and `data/search.json`. Stop and inspect before committing if another data path appears; never use `git add data` or `git add -A`.

---

### Task 5: Document, validate, and smoke-test all changed source paths

**Files:**
- Modify: `README.md:1-72`
- Modify: `public/app.js:13-25`
- Modify: `public/detail.js:6-8, 137-161, 252`
- Modify: `package.json:6-15` if the syntax check does not yet include `scripts/check-sources.mjs`.

**Interfaces:**
- Consumes: `pnpm check:sources -- --only microsoft-ai,openai-developer,claude-blog` from Task 2.
- Produces: contributor instructions that distinguish discovery fetching from DeepSeek enrichment and state the actual schedule.

- [ ] **Step 1: Update README source and schedule documentation**

Change the opening and automation sections to include these exact operational facts:

```markdown
每约 30 分钟自动收集全球 AI 新闻。发现层同时读取公开 RSS、OpenAI Developer Blog、Claude Blog 与 AI HOT 补充源；只有发现尚未处理的新文章后，才调用 DeepSeek 生成中文整理。

## 信源健康检查

只检查来源能否抓取和解析，不写入新闻数据，也不调用 DeepSeek：

```bash
pnpm check:sources -- --only microsoft-ai,openai-developer,claude-blog
```

GitHub Actions 使用 `2,32 * * * *`，约每 30 分钟扫描一次。GitHub cron 为尽力执行，可能出现少量排队延迟。
```

Remove the contradictory claim that the workflow runs only at 01:00, 07:00, 12:30, and 19:00.

- [ ] **Step 2: Render date-only publication metadata honestly**

In `public/app.js`, replace the formatter and its card call with:

```js
function formatTime(value, precision = 'minute') {
  const options = precision === 'date'
    ? { month: 'numeric', day: 'numeric' }
    : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
  return new Intl.DateTimeFormat('zh-CN', options).format(new Date(value));
}

time.innerHTML = `${relativeTime(item.publishedAt)}<br>${formatTime(item.publishedAt, item.publishedPrecision)}`;
```

In `public/detail.js`, use:

```js
function formatTime(value, precision = 'minute') {
  const options = precision === 'date'
    ? { dateStyle: 'long' }
    : { dateStyle: 'long', timeStyle: 'short', hour12: false };
  return new Intl.DateTimeFormat('zh-CN', options).format(new Date(value));
}

time.textContent = formatTime(report.publishedAt || item.publishedAt, report.publishedPrecision || item.publishedPrecision);
$('#publishTime').textContent = `发布时间：${formatTime(item.publishedAt, item.publishedPrecision)}`;
```

The heat-window endpoints remain timestamps because they describe generated heat samples, not claimed source publication times.

- [ ] **Step 3: Extend static syntax checks**

Ensure the `check` script includes the new operational script:

```json
"check": "node --check public/app.js && node --check public/rankings.js && node --check public/topics.js && node --check scripts/fetch-news.mjs && node --check scripts/fetch-rankings.mjs && node --check scripts/build-topic-index.mjs && node --check scripts/repair-historical-merges.mjs && node --check scripts/check-sources.mjs && node --check src/lib/topic-taxonomy.mjs"
```

- [ ] **Step 4: Run the complete deterministic test suite**

Run:

```bash
pnpm test
pnpm check
```

Expected: every `node:test` case passes and every listed JavaScript module passes `node --check`.

- [ ] **Step 5: Run a live read-only smoke check**

Run:

```bash
pnpm check:sources -- --only microsoft-ai,openai-developer,claude-blog
```

Expected output contains:

```text
PASS	microsoft-ai
PASS	openai-developer
PASS	claude-blog
```

Each count must be greater than zero. If the local network blocks an official domain, record the exact source/error and require the same command to pass in the GitHub Actions environment before merging; do not weaken the parser test or mark a zero-item source successful.

- [ ] **Step 6: Commit documentation and validation wiring**

```bash
git add README.md package.json public/app.js public/detail.js
git commit -m "docs: explain official source monitoring"
```

---

### Task 6: Publish, trigger enrichment, and verify the live site

**Files:**
- No new source files.
- GitHub Actions will update generated files under `data/` on `main` after the code merge.

**Interfaces:**
- Consumes: the `Update AI news` workflow, repository secret `DEEPSEEK_API_KEY`, and the three live official sources.
- Produces: a successful main-branch data commit and live GitHub Pages data containing both requested stories.

- [ ] **Step 1: Rebase on the newest automated data commits and rerun checks**

```bash
git fetch origin main
git rebase origin/main
pnpm test
pnpm check
git status --short
```

Expected: rebase succeeds, tests pass, and the worktree is clean. If generated data conflicts, keep the newer `origin/main` data and rerun `pnpm repair:data` so the approved Anthropic title is regenerated from the newest search dataset.

- [ ] **Step 2: Push the feature branch and open a pull request**

```bash
git push -u origin codex/source-coverage
gh pr create --base main --head codex/source-coverage --title "Fix official AI news source coverage" --body "Replaces the blocked Microsoft RSS, adds direct OpenAI Developer Blog and Claude Blog ingestion, prefers official duplicates, and corrects the Anthropic training story title."
```

Expected: GitHub returns a pull request URL.

- [ ] **Step 3: Wait for checks and merge**

```bash
gh pr checks codex/source-coverage --watch
gh pr merge codex/source-coverage --squash --delete-branch
```

Expected: required checks pass and the pull request is merged into `main`.

- [ ] **Step 4: Trigger the news workflow with the configured DeepSeek secret**

```bash
gh workflow run update-news.yml --ref main
sleep 3
NEWS_RUN_ID=$(gh run list --workflow update-news.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$NEWS_RUN_ID" --json databaseId,status,conclusion,url
```

```bash
gh run watch "$NEWS_RUN_ID" --exit-status
```

Expected: the run completes with `success`; the fetch step reports 22 enabled sources, all three changed/new sources succeed, and the data step commits new content when Codex is first discovered.

- [ ] **Step 5: Verify source health and both stories in published data**

Run this read-only check after GitHub Pages finishes deploying:

```bash
node --input-type=module -e "const base='https://jiaoshouhaha.github.io/dudu-ai-intelligence/data/'; const status=await fetch(base+'status.json').then(r=>r.json()); const search=await fetch(base+'search.json').then(r=>r.json()); const bySource=new Map(status.sources.map(s=>[s.sourceId,s])); for (const id of ['microsoft-ai','openai-developer','claude-blog']) { if (!bySource.get(id)?.ok) throw new Error(id+' failed: '+JSON.stringify(bySource.get(id))); } const codex=search.items.find(x=>x.originalUrl==='https://learn.chatgpt.com/blog/codex-as-a-platform'||/open agent harness/i.test(x.titleOriginal||'')); const anthropic=search.items.find(x=>x.originalUrl==='https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai'); if (!codex) throw new Error('Codex harness story missing'); if (!anthropic) throw new Error('Anthropic training story missing'); if (anthropic.titleZh!=='Anthropic 开放内部 AI 培训体系，Claude Academy 面向公众上线') throw new Error('Anthropic title mismatch: '+anthropic.titleZh); console.log(JSON.stringify({failedSources:status.failedSources,codex:{titleZh:codex.titleZh,url:codex.originalUrl},anthropic:{titleZh:anthropic.titleZh,url:anthropic.originalUrl}},null,2));"
```

Expected:

- `microsoft-ai`, `openai-developer`, and `claude-blog` all have `ok: true`.
- Codex article URL is the OpenAI official article.
- Anthropic article has the exact approved Chinese title and Claude official URL.
- The website no longer shows the previous Microsoft source-failure warning when `failedSources` is zero.

- [ ] **Step 6: If Codex is queued behind the 12-item cost guard, run one more bounded cycle**

Only when Step 5 reports `Codex harness story missing`, run exactly one additional cycle:

```bash
gh workflow run update-news.yml --ref main
sleep 3
SECOND_NEWS_RUN_ID=$(gh run list --workflow update-news.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$SECOND_NEWS_RUN_ID" --json databaseId,status,conclusion,url
gh run watch "$SECOND_NEWS_RUN_ID" --exit-status
```

Then repeat Step 5. Because unselected candidates are not added to the seven-day seen registry, the next bounded run can process the remaining official candidate without raising `MAX_NEW_ITEMS_PER_RUN` or the DeepSeek daily limit.

---

## Final Acceptance Checklist

- [ ] `pnpm test` passes on Node 20+ and in GitHub Actions Node 24.
- [ ] `pnpm check` passes.
- [ ] The three changed/new official sources each return at least one parsed item.
- [ ] A changed HTML layout yields a single-source failure with an actionable error rather than a silent zero count.
- [ ] Microsoft no longer uses `https://blogs.microsoft.com/feed/`.
- [ ] Codex Harness is discoverable from OpenAI Developer Blog and links to the official article.
- [ ] Anthropic's item uses the exact approved Chinese title and preserves the official URL.
- [ ] Duplicate aggregator reports do not create a second timeline item.
- [ ] Existing Chinese detail survives official-source promotion.
- [ ] The GitHub Actions run succeeds and GitHub Pages serves the refreshed data.
