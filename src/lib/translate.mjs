const SPLIT_MARKER = '[SIGNAL_SPLIT]';

export function translationConfig(env = process.env) {
  return {
    baseUrl: env.TRANSLATION_BASE_URL || 'https://translate.googleapis.com/translate_a/single',
    concurrency: Math.max(1, Number(env.TRANSLATION_CONCURRENCY || 3)),
    timeoutMs: Math.max(1000, Number(env.TRANSLATION_TIMEOUT_MS || 20000)),
    retries: Math.max(0, Number(env.TRANSLATION_RETRIES || 2))
  };
}

function parseTranslation(payload) {
  const segments = Array.isArray(payload?.[0]) ? payload[0] : [];
  return segments.map((segment) => String(segment?.[0] || '')).join('').trim();
}

async function requestTranslation(input, config, fetchImpl) {
  const url = new URL(config.baseUrl);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', 'zh-CN');
  url.searchParams.set('dt', 't');
  const body = new URLSearchParams({ q: input });

  let lastError;
  for (let attempt = 0; attempt <= config.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'SignalAI/1.0 personal news translator' },
        body,
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Translation HTTP ${response.status}`);
      const output = parseTranslation(await response.json());
      if (!output) throw new Error('Translation returned empty text');
      return output;
    } catch (error) {
      lastError = error;
      if (attempt < config.retries) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export async function translateEventToChinese(event, config = translationConfig(), fetchImpl = fetch) {
  if (event.titleZh && event.summaryZh) return event;
  if (event.originalLanguage === 'zh') {
    return { ...event, titleZh: event.titleZh || event.titleOriginal, summaryZh: event.summaryZh || event.summaryOriginal, translationMode: 'original' };
  }

  const sourceText = `${event.titleOriginal}\n${SPLIT_MARKER}\n${(event.summaryOriginal || event.titleOriginal).slice(0, 700)}`;
  const translated = await requestTranslation(sourceText, config, fetchImpl);
  const [titleZh, ...summaryParts] = translated.split(SPLIT_MARKER);
  const summaryZh = summaryParts.join(SPLIT_MARKER).trim();
  if (!titleZh?.trim() || !summaryZh) throw new Error('Translation marker was not preserved');
  return {
    ...event,
    titleZh: titleZh.trim(),
    summaryZh,
    translationMode: 'public-endpoint',
    translationError: null
  };
}

export async function translateEventsToChinese(events, config = translationConfig(), fetchImpl = fetch) {
  const results = new Array(events.length);
  let cursor = 0;
  async function worker() {
    while (cursor < events.length) {
      const index = cursor++;
      try {
        results[index] = await translateEventToChinese(events[index], config, fetchImpl);
      } catch (error) {
        results[index] = { ...events[index], translationError: String(error.message || error).slice(0, 240) };
      }
    }
  }
  await Promise.all(Array.from({ length: config.concurrency }, worker));
  return results;
}
