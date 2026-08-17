import { hasReleaseSignal, stripHtml } from './utils.mjs';

const company = (definition) => ({ group: 'companies', ...definition });
const technology = (definition) => ({ group: 'technology', ...definition });
const format = (definition) => ({ group: 'formats', ...definition });

export const TOPIC_DEFINITIONS = [
  company({ id: 'openai', name: 'OpenAI / ChatGPT', description: 'OpenAI、ChatGPT、GPT、Codex 与 Sora', officialUrl: 'https://chatgpt.com/', pattern: /\bopenai\b|\bchatgpt\b|\bgpt(?:[- .]?\d+(?:\.\d+)?)?\b|\bcodex\b|\bsora\b/i, officialSourceIds: ['openai'] }),
  company({ id: 'anthropic', name: 'Anthropic / Claude', description: 'Claude 系列模型、安全研究与开发工具', officialUrl: 'https://claude.com/', pattern: /\banthropic\b|\bclaude\b|\b(?:opus|sonnet|haiku|fable)\s*\d/i, officialSourceIds: [] }),
  company({ id: 'google', name: 'Google / Gemini', description: 'Gemini、DeepMind、Gemma 与 Google AI 产品', officialUrl: 'https://gemini.google.com/', pattern: /\bgemini\b|\bdeepmind\b|\bgemma\b|\bveo(?:[- .]?\d+)?\b|nano banana|weathernext|diffusiongemma|google ai/i, officialSourceIds: ['google-ai', 'deepmind'] }),
  company({ id: 'deepseek', name: 'DeepSeek', description: 'DeepSeek 模型、开源权重、API 与推理能力', officialUrl: 'https://chat.deepseek.com/', pattern: /\bdeepseek\b|深度求索/i, officialSourceIds: [] }),
  company({ id: 'qwen', name: '通义千问 Qwen', description: 'Qwen 系列模型、千问产品与开源生态', officialUrl: 'https://chat.qwen.ai/', pattern: /\bqwen(?:[- .]?\d[\w.-]*)?\b|通义千问|千问(?:开放平台|app|模型|智能)?/i, officialSourceIds: ['qwen-releases', 'qwen-agent-releases'] }),
  company({ id: 'kimi', name: 'Kimi / 月之暗面', description: 'Kimi 模型、Agent、长上下文与产品迭代', officialUrl: 'https://www.kimi.com/', pattern: /\bkimi(?:[- .]?[a-z]?\d[\w.-]*)?\b|\bmoonshot(?: ai)?\b|月之暗面/i, officialSourceIds: [] }),
  company({ id: 'minimax', name: 'MiniMax', description: 'MiniMax 的文本、视频、语音、音乐与 Agent 产品', officialUrl: 'https://www.minimax.io/', pattern: /\bmini[\s-]?max(?:[- .]?[a-z]?\d[\w.-]*)?\b|稀宇科技/i, officialSourceIds: [] }),
  company({ id: 'glm', name: '智谱 GLM', description: 'GLM 系列模型、智谱产品与开发平台', officialUrl: 'https://chat.z.ai/', pattern: /\bglm(?:[- .]?\d[\w.-]*)?\b|\bchatglm\b|智谱(?:清言)?|\bz\.ai\b/i, officialSourceIds: [] }),
  company({ id: 'grok', name: 'xAI / Grok', description: 'Grok 模型、xAI 产品与实时信息能力', officialUrl: 'https://grok.com/', pattern: /\bgrok(?:[- .]?\d[\w.-]*)?\b|\bxai\b|\bx\.ai\b|\bspacexai\b/i, officialSourceIds: [] }),
  company({ id: 'llama', name: 'Meta / Llama', description: 'Llama、Meta AI 与 Meta 开源模型生态', officialUrl: 'https://ai.meta.com/llama/', pattern: /\bllama(?:[- .]?\d[\w.-]*)?\b|\bmeta ai\b|\bmuse (?:glimmer|spark)\b/i, officialSourceIds: [] }),

  technology({ id: 'agent', name: 'Agent 智能体', description: '自主执行、工具调用与多智能体', pattern: /\bagents?\b|智能体|多智能体|自主执行|tool use|工具使用/i, match: (item) => item.category === 'agent' }),
  technology({ id: 'coding', name: 'AI 编码', description: '编程代理、代码生成与开发流程', pattern: /\bai coding\b|\bcoding agent\b|\bcodex\b|claude code|代码生成|编程代理|软件工程|写代码|代码修复/i }),
  technology({ id: 'reasoning', name: '推理能力', description: '思维链、测试时计算与复杂问题', pattern: /\breasoning\b|chain[- ]of[- ]thought|test[- ]time|推理能力|思维链|复杂推理|数学推理/i }),
  technology({ id: 'multimodal', name: '多模态', description: '文本、图像、视频与音频协同', pattern: /\bmultimodal\b|vision[- ]language|多模态|视觉语言|图文理解|全模态/i }),
  technology({ id: 'video', name: 'AI 视频', description: '视频生成、编辑与世界模型', pattern: /\bvideo generation\b|text[- ]to[- ]video|视频生成|生成视频|视频模型|seedance|\bveo\b|\bsora\b/i }),
  technology({ id: 'embodied', name: '具身智能', description: '机器人、物理世界与行动', pattern: /\brobot(?:ics)?\b|humanoid|具身智能|机器人|物理世界模型/i }),
  technology({ id: 'open-source', name: '开源生态', description: '开放权重、许可证、框架与社区', pattern: /\bopen[ -]source\b|\bopen[ -]weights?\b|开源|开放权重|许可证/i, match: (item) => item.category === 'opensource' || item.contentType === 'opensource' }),
  technology({ id: 'engineering', name: '部署工程', description: '推理服务、部署、成本与可观测性', pattern: /\binference\b|\bdeployment\b|\bserving\b|quantization|推理服务|模型部署|量化|吞吐|延迟|算力成本/i }),
  technology({ id: 'safety', name: '安全对齐', description: '评测、攻击、防护、对齐与治理', pattern: /\bai safety\b|\balignment\b|jailbreak|red team|安全对齐|越狱|红队|模型攻击|网络安全|水印机制/i }),
  technology({ id: 'mcp', name: 'MCP 与工具调用', description: '工具协议、插件与本地工作流', pattern: /\bmcp\b|model context protocol|tool call|工具调用|工具协议/i }),

  format({ id: 'model-releases', name: '模型发布', description: '新模型、版本、权重与 API', match: (item, corpus) => item.category === 'models' || (hasReleaseSignal(corpus) && /模型|model|权重|parameter/i.test(corpus)) }),
  format({ id: 'product-updates', name: '产品更新', description: '应用功能、平台与商业化', match: (item) => item.category === 'products' }),
  format({ id: 'papers', name: '论文研究', description: '论文、实验与研究解读', match: (item) => item.contentType === 'paper' || item.sourceType === 'paper' }),
  format({ id: 'benchmarks', name: '评测基准', description: '排行榜、基准和实测对比', match: (item, corpus) => item.contentType === 'benchmark' || /\bbenchmarks?\b|leaderboard|评测|基准测试|排行榜/i.test(corpus) }),
  format({ id: 'tutorials', name: '教程实践', description: '可复用配置、提示词与实用方法', match: (item) => item.category === 'tips' || item.contentType === 'practical' }),
  format({ id: 'opinions', name: '大佬观点', description: '研究者、开发者和行业人物观点', match: (item) => item.category === 'opinion' || item.contentType === 'opinion' }),
  format({ id: 'trends', name: '现象与趋势', description: '生态变化、用户实践与行业趋势', match: (_item, corpus) => /趋势|现象|采用率|使用率|市场变化|industry trend|adoption/i.test(corpus) }),
  format({ id: 'industry', name: '行业动态', description: '商业合作、公司动态与产业变化', match: (item) => item.category === 'business' || item.contentType === 'industry' }),
  format({ id: 'policy', name: '政策监管', description: '法规、治理、安全与合规', match: (item) => item.category === 'policy' })
];

export const TOPIC_GROUPS = [
  { id: 'companies', title: '公司与模型', note: '按厂商与模型系追踪：谁发布了什么，又赢了哪一局' },
  { id: 'technology', title: '技术方向', note: '按问题和技术路径深挖，适合从主题切入阅读' },
  { id: 'formats', title: '内容形态', note: '按阅读目的浏览：发布、论文、教程、观点和政策' }
];

const clean = (value) => stripHtml(String(value || ''));
const companyDefinitions = TOPIC_DEFINITIONS.filter((topic) => topic.group === 'companies');

function officialSourceMatch(item, topic) {
  const ids = new Set(topic.officialSourceIds || []);
  return (item.sources || []).some((source) => ids.has(source.id));
}

export function classifyItemTopics(item) {
  const title = [item.titleZh, item.titleOriginal].map(clean).filter(Boolean).join(' ');
  const models = (item.models || []).map(clean).join(' ');
  const structured = [...(item.topics || []), ...(item.keywords || [])].map(clean).join(' ');
  const companyIds = companyDefinitions
    .filter((topic) => topic.pattern.test(`${title} ${models}`) || officialSourceMatch(item, topic))
    .map((topic) => topic.id);
  if (!companyIds.length) {
    for (const topic of companyDefinitions) if (topic.pattern.test(structured)) companyIds.push(topic.id);
  }

  const technicalCorpus = `${title} ${models} ${structured}`;
  const technologyIds = TOPIC_DEFINITIONS
    .filter((topic) => topic.group === 'technology' && (topic.pattern.test(technicalCorpus) || topic.match?.(item, technicalCorpus)))
    .map((topic) => topic.id);
  const formatCorpus = `${title} ${structured}`;
  const formatIds = TOPIC_DEFINITIONS
    .filter((topic) => topic.group === 'formats' && topic.match(item, formatCorpus))
    .map((topic) => topic.id);
  return [...new Set([...companyIds, ...technologyIds, ...formatIds])];
}

function publicTopic(topic) {
  const { pattern: _pattern, match: _match, officialSourceIds: _sourceIds, ...metadata } = topic;
  return metadata;
}

export function buildTopicIndex(items, generatedAt = new Date().toISOString()) {
  const buckets = new Map(TOPIC_DEFINITIONS.map((topic) => [topic.id, []]));
  const unclassifiedItemIds = [];
  const multiCompanyItemIds = [];
  for (const item of items) {
    const topicIds = classifyItemTopics(item);
    for (const topicId of topicIds) buckets.get(topicId)?.push(item.id);
    const companyCount = topicIds.filter((id) => companyDefinitions.some((topic) => topic.id === id)).length;
    if (companyCount > 1) multiCompanyItemIds.push(item.id);
    if (!topicIds.length) unclassifiedItemIds.push(item.id);
  }
  return {
    schemaVersion: 1,
    generatedAt,
    groups: TOPIC_GROUPS,
    topics: TOPIC_DEFINITIONS.map((topic) => {
      const itemIds = [...new Set(buckets.get(topic.id))];
      return { ...publicTopic(topic), count: itemIds.length, itemIds };
    }),
    audit: { totalItems: items.length, unclassifiedItemIds, multiCompanyItemIds }
  };
}
