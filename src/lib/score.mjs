import { clamp } from './utils.mjs';

const IMPACT_TERMS = /launch|release|announce|funding|acquire|regulation|benchmark|open.?source|模型|发布|融资|收购|监管|开源|突破/i;
const NOVELTY_TERMS = /first|new|novel|state.?of.?the.?art|突破|首个|首次|最新|新型/i;

export function scoreEvent(event, now = new Date()) {
  const ageHours = Math.max(0, (now - new Date(event.publishedAt)) / 36e5);
  const authority = clamp(event.authority, 0, 100);
  const corpus = `${event.titleOriginal} ${event.summaryOriginal}`;
  const impact = IMPACT_TERMS.test(corpus) ? 82 : event.sourceType === 'official' ? 72 : 55;
  const novelty = NOVELTY_TERMS.test(corpus) ? 82 : 58;
  const recency = clamp(100 - ageHours * 2.2, 20, 100);
  const verification = clamp(45 + event.sources.length * 18 + (event.sourceType === 'official' ? 20 : 0), 0, 100);
  const total = Math.round(authority * 0.25 + impact * 0.25 + novelty * 0.2 + recency * 0.15 + verification * 0.15);

  const reasons = [];
  if (authority >= 90) reasons.push('来自高权威一手或研究来源');
  if (impact >= 80) reasons.push('可能对行业或产品生态产生较广影响');
  if (novelty >= 80) reasons.push('包含明显的新发布或技术进展');
  if (event.sources.length > 1) reasons.push(`已有 ${event.sources.length} 个来源相互印证`);
  if (recency >= 85) reasons.push('发布时间较近');

  return {
    ...event,
    importance: clamp(total, 1, 100),
    importanceReasonZh: reasons.slice(0, 3).join('；') || '综合来源、时效与内容信号计算',
    importanceReasonEn: 'Rule-based score from source authority, impact, novelty, recency and corroboration.',
    scoringMode: 'rules'
  };
}

