import { clamp } from './utils.mjs';

const VALID_CATEGORIES = new Set(['models', 'products', 'business', 'research', 'policy', 'opensource', 'other']);

export function aiConfig(env = process.env) {
  return {
    apiKey: env.AI_API_KEY || '',
    baseUrl: (env.AI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, ''),
    model: env.AI_MODEL || 'qwen-flash',
    timeoutMs: Number(env.AI_TIMEOUT_MS || 30000),
    dailyLimit: Number(env.AI_DAILY_LIMIT || 100),
    concurrency: Number(env.AI_CONCURRENCY || 2)
  };
}

export function validateAiPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('AI response is not an object');
  const required = ['titleZh', 'titleEn', 'summaryZh', 'summaryEn', 'category', 'keywords', 'importance', 'reasonZh', 'reasonEn'];
  for (const key of required) if (payload[key] == null) throw new Error(`AI response missing ${key}`);
  if (!VALID_CATEGORIES.has(payload.category)) payload.category = 'other';
  if (!Array.isArray(payload.keywords)) payload.keywords = [];
  return {
    titleZh: String(payload.titleZh).slice(0, 240),
    titleEn: String(payload.titleEn).slice(0, 240),
    summaryZh: String(payload.summaryZh).slice(0, 800),
    summaryEn: String(payload.summaryEn).slice(0, 800),
    category: payload.category,
    keywords: payload.keywords.map(String).slice(0, 8),
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
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are an AI news editor. Return JSON only with titleZh,titleEn,summaryZh,summaryEn,category,keywords,importance,reasonZh,reasonEn. category must be models,products,business,research,policy,opensource,other. importance is 1-100. Be factual and concise; do not invent details.'
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
  return {
    ...event,
    titleZh: event.titleZh || (isZh ? event.titleOriginal : ''),
    titleEn: event.titleEn || (!isZh ? event.titleOriginal : ''),
    summaryZh: event.summaryZh || (isZh ? event.summaryOriginal : ''),
    summaryEn: event.summaryEn || (!isZh ? event.summaryOriginal : ''),
    keywords: event.keywords || [],
    processingError: error ? String(error.message || error).slice(0, 240) : null
  };
}

