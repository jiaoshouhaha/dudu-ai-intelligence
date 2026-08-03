import { clamp } from './utils.mjs';

const VALID_CATEGORIES = new Set(['models', 'products', 'agent', 'tips', 'business', 'research', 'policy', 'opensource', 'opinion', 'other']);
const VALID_CONTENT_TYPES = new Set(['official', 'practical', 'opensource', 'paper', 'benchmark', 'industry', 'opinion']);
const VALID_EVIDENCE_LEVELS = new Set(['primary', 'verified', 'practitioner', 'unverified']);
const VALID_DETAIL_COMPLETENESS = new Set(['full', 'summary', 'limited']);
const MODEL_PATTERNS = [
  ['GPT / Codex', /\bgpt\b|codex|openai/i], ['Claude', /claude|anthropic/i], ['Gemini', /gemini|deepmind/i],
  ['DeepSeek', /deepseek/i], ['Qwen', /qwen|通义千问/i], ['Kimi', /\bkimi\b|moonshot|月之暗面/i],
  ['GLM', /\bglm\b|智谱/i], ['Llama', /llama|meta ai/i], ['Grok', /\bgrok\b|\bxai\b/i]
];

export function aiConfig(env = process.env) {
  return {
    apiKey: env.DEEPSEEK_API_KEY || '',
    baseUrl: (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
    model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    timeoutMs: Number(env.DEEPSEEK_TIMEOUT_MS || 30000),
    dailyLimit: Number(env.DEEPSEEK_DAILY_LIMIT || 100),
    concurrency: Number(env.DEEPSEEK_CONCURRENCY || 2)
  };
}

export function validateAiPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('AI response is not an object');
  const required = ['titleZh', 'titleEn', 'summaryZh', 'summaryEn', 'category', 'importance', 'reasonZh', 'reasonEn'];
  for (const key of required) if (payload[key] == null) throw new Error(`AI response missing ${key}`);
  if (!VALID_CATEGORIES.has(payload.category)) payload.category = 'other';
  if (!Array.isArray(payload.keywords)) payload.keywords = [];
  const contentType = VALID_CONTENT_TYPES.has(payload.contentType) ? payload.contentType : 'industry';
  const evidenceLevel = VALID_EVIDENCE_LEVELS.has(payload.evidenceLevel) ? payload.evidenceLevel : 'unverified';
  const cleanList = (value, limit, itemLimit) => Array.isArray(value)
    ? value.map((item) => String(item).trim().slice(0, itemLimit)).filter(Boolean).slice(0, limit)
    : [];
  return {
    titleZh: String(payload.titleZh).slice(0, 240),
    titleEn: String(payload.titleEn).slice(0, 240),
    summaryZh: String(payload.summaryZh).slice(0, 800),
    summaryEn: String(payload.summaryEn).slice(0, 800),
    category: payload.category,
    keywords: payload.keywords.map(String).slice(0, 8),
    topics: Array.isArray(payload.topics) ? payload.topics.map(String).slice(0, 8) : payload.keywords.map(String).slice(0, 8),
    models: Array.isArray(payload.models) ? payload.models.map(String).slice(0, 6) : [],
    contentType,
    evidenceLevel,
    detailZh: String(payload.detailZh || payload.summaryZh).slice(0, 2400),
    keyPointsZh: cleanList(payload.keyPointsZh, 5, 300),
    impactZh: String(payload.impactZh || payload.reasonZh).slice(0, 800),
    actionStepsZh: cleanList(payload.actionStepsZh, 5, 400),
    detailCompleteness: VALID_DETAIL_COMPLETENESS.has(payload.detailCompleteness) ? payload.detailCompleteness : 'summary',
    importance: clamp(Math.round(Number(payload.importance) || 1), 1, 100),
    reasonZh: String(payload.reasonZh).slice(0, 300),
    reasonEn: String(payload.reasonEn).slice(0, 300)
  };
}

function extractJson(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fenced?.[1] || content).trim());
}

export async function enrichEvent(event, config = aiConfig(), fetchImpl = fetch) {
  if (!config.apiKey) return event;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const prompt = {
    title: event.titleOriginal,
    summary: event.summaryOriginal,
    categoryHint: event.category,
    source: event.sources[0]?.name,
    publishedAt: event.publishedAt,
    ruleScore: event.importance
  };

  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        thinking: { type: 'disabled' },
        temperature: 0.1,
        max_tokens: 2800,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a Chinese AI intelligence editor. Return valid json only with titleZh,titleEn,summaryZh,summaryEn,category,contentType,topics,models,evidenceLevel,keywords,importance,reasonZh,reasonEn,detailZh,keyPointsZh,impactZh,actionStepsZh,detailCompleteness. category must be models,products,agent,tips,business,research,policy,opensource,opinion,other. contentType must be official,practical,opensource,paper,benchmark,industry,opinion. evidenceLevel must be primary,verified,practitioner,unverified. detailZh is a clear 2-4 paragraph Chinese explanation of what happened, its background and known facts. keyPointsZh is 2-5 concise factual points. impactZh explains practical impact for readers, developers or the industry. actionStepsZh contains 0-5 actionable steps only when the source supports them, especially for practical tips; otherwise return an empty array. detailCompleteness must be full,summary,limited based on source material richness. Practical configurations, reproducible workflows, code and cost-saving methods are valuable. Lower scores for hype or unsupported claims. importance is 1-100. Translate accurately. Use only facts present in the input, explicitly reflect limited source material, and never invent details.'
          },
          { role: 'user', content: JSON.stringify(prompt) }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI response has no content');
    const result = validateAiPayload(extractJson(content));
    return {
      ...event,
      titleZh: result.titleZh,
      titleEn: result.titleEn,
      summaryZh: result.summaryZh,
      summaryEn: result.summaryEn,
      category: result.category,
      keywords: result.keywords,
      topics: result.topics,
      models: result.models,
      contentType: result.contentType,
      evidenceLevel: result.evidenceLevel,
      detailZh: result.detailZh,
      keyPointsZh: result.keyPointsZh,
      impactZh: result.impactZh,
      actionStepsZh: result.actionStepsZh,
      detailCompleteness: result.detailCompleteness,
      importance: result.importance,
      importanceReasonZh: result.reasonZh,
      importanceReasonEn: result.reasonEn,
      scoringMode: 'ai',
      processingError: null
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichEvents(events, config = aiConfig()) {
  if (!config.apiKey || !events.length) return events.map(finalizeFallback);
  const limited = events.slice(0, config.dailyLimit);
  const results = new Array(events.length);
  let cursor = 0;

  async function worker() {
    while (cursor < limited.length) {
      const index = cursor++;
      try {
        results[index] = await enrichEvent(limited[index], config);
      } catch (error) {
        results[index] = finalizeFallback(limited[index], error);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, config.concurrency) }, worker));
  for (let index = limited.length; index < events.length; index += 1) results[index] = finalizeFallback(events[index]);
  return results;
}

export function finalizeFallback(event, error = null) {
  const isZh = event.originalLanguage === 'zh';
  const corpus = `${event.titleOriginal || ''} ${event.summaryOriginal || ''}`;
  const models = event.models?.length ? event.models : MODEL_PATTERNS.filter(([, pattern]) => pattern.test(corpus)).map(([name]) => name);
  const contentType = event.contentType || (event.category === 'tips' ? 'practical' : event.category === 'opensource' ? 'opensource' : event.category === 'research' ? 'paper' : event.category === 'opinion' ? 'opinion' : event.sourceType === 'official' ? 'official' : 'industry');
  const evidenceLevel = event.evidenceLevel || (event.sourceType === 'official' || event.sourceType === 'paper' ? 'primary' : contentType === 'practical' ? 'practitioner' : 'unverified');
  return {
    ...event,
    titleZh: event.titleZh || (isZh ? event.titleOriginal : ''),
    titleEn: event.titleEn || (!isZh ? event.titleOriginal : ''),
    summaryZh: event.summaryZh || (isZh ? event.summaryOriginal : ''),
    summaryEn: event.summaryEn || (!isZh ? event.summaryOriginal : ''),
    keywords: event.keywords || [],
    topics: event.topics?.length ? event.topics : (event.keywords || []).slice(0, 8),
    models: models.slice(0, 6),
    contentType,
    evidenceLevel,
    detailZh: event.detailZh || '',
    keyPointsZh: Array.isArray(event.keyPointsZh) ? event.keyPointsZh : [],
    impactZh: event.impactZh || event.importanceReasonZh || '',
    actionStepsZh: Array.isArray(event.actionStepsZh) ? event.actionStepsZh : [],
    detailCompleteness: VALID_DETAIL_COMPLETENESS.has(event.detailCompleteness) ? event.detailCompleteness : 'limited',
    processingError: error ? String(error.message || error).slice(0, 240) : null
  };
}
