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
