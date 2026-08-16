import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = resolve(ROOT, 'data/model-rankings.json');
const HF_ROWS_API = 'https://datasets-server.huggingface.co/rows';
const LMARENA_DATASET = 'lmarena-ai/leaderboard-dataset';
const OPENEVALS_DATASET = 'OpenEvals/leaderboard-data';
const MAX_ITEMS = 15;

const LMARENA_CATEGORIES = [
  { id: 'text', config: 'text', name: '文本综合', icon: '文', useCase: '日常对话、写作、总结与通用问答', description: '真实用户盲测，更接近普通人的综合使用感受。', metric: 'Arena 评分', scoreKind: 'rating' },
  { id: 'webdev', config: 'webdev', name: '网页与前端', icon: '页', useCase: '生成网页、前端界面与交互原型', description: '根据真实网页生成结果进行对战投票。', metric: 'Arena 评分', scoreKind: 'rating' },
  { id: 'vision', config: 'vision', name: '图片理解', icon: '图', useCase: '看图问答、截图分析与视觉理解', description: '衡量模型对图片内容的理解和回答质量。', metric: 'Arena 评分', scoreKind: 'rating' },
  { id: 'document', config: 'document', name: '长文档处理', icon: '档', useCase: '阅读报告、合同、PDF 与长资料', description: '针对文档阅读、提取和归纳任务的用户盲测。', metric: 'Arena 评分', scoreKind: 'rating' },
  { id: 'search', config: 'search', name: '联网搜索', icon: '搜', useCase: '实时检索、资料研究与带来源回答', description: '比较模型联网搜索和组织答案的实际效果。', metric: 'Arena 评分', scoreKind: 'rating' },
  { id: 'agent', config: 'agent', name: 'Agent 办事', icon: '办', useCase: '让模型调用工具、操作网页并完成任务', description: '根据智能体在真实任务中的完成情况排名。', metric: '任务得分', scoreKind: 'ratio' }
];

const OPENEVAL_CATEGORIES = [
  { id: 'coding', name: '代码修复', icon: '码', useCase: '修复真实 GitHub 仓库问题', description: 'SWE-bench Verified：模型解决真实软件工程问题的比例。', metric: 'SWE Verified', field: 'sweVerified_score' },
  { id: 'terminal', name: '终端与工程', icon: '终', useCase: '命令行、环境配置和工程任务', description: 'Terminal-Bench：在终端环境完成真实任务的能力。', metric: 'Terminal Bench', field: 'terminalBench_score' },
  { id: 'reasoning', name: '知识与推理', icon: '理', useCase: '复杂问答、专业知识与多步推理', description: 'MMLU-Pro：比传统 MMLU 更难的知识与推理测试。', metric: 'MMLU-Pro', field: 'mmluPro_score' },
  { id: 'math', name: '数学推理', icon: '数', useCase: '竞赛数学、计算与严谨推导', description: 'AIME 2026：高难度数学竞赛题表现。', metric: 'AIME 2026', field: 'aime2026_score' }
];

const CORE_FIELDS = ['aime2026_score', 'gpqa_score', 'hle_score', 'mmluPro_score', 'sweVerified_score', 'terminalBench_score'];

function rowsUrl(dataset, config, split, offset = 0, length = 100) {
  const params = new URLSearchParams({ dataset, config, split, offset: String(offset), length: String(length) });
  return `${HF_ROWS_API}?${params}`;
}

async function fetchJson(url, { attempts = 3, timeoutMs = 20000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'dudu-ai-intelligence/1.0' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((done) => setTimeout(done, attempt * 750));
    }
  }
  throw new Error(`无法读取 ${url}: ${lastError?.message || lastError}`);
}

function humanizeModelName(value = '') {
  const dictionary = new Map([
    ['gpt', 'GPT'], ['glm', 'GLM'], ['qwen', 'Qwen'], ['kimi', 'Kimi'], ['llama', 'Llama'],
    ['claude', 'Claude'], ['gemini', 'Gemini'], ['grok', 'Grok'], ['deepseek', 'DeepSeek'],
    ['minimax', 'MiniMax'], ['mistral', 'Mistral'], ['flash', 'Flash'], ['pro', 'Pro'], ['max', 'Max'],
    ['high', 'High'], ['preview', 'Preview'], ['thinking', 'Thinking'], ['instruct', 'Instruct']
  ]);
  return String(value)
    .replace(/_/g, '-')
    .split('-')
    .filter(Boolean)
    .map((part) => dictionary.get(part.toLowerCase()) || (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
    .replace(/\b(\d+) (\d+)\b/g, '$1.$2');
}

function publicLicense(license = '') {
  return !/proprietary|unknown|closed/i.test(license);
}

export function normalizeArenaCategory(meta, rows) {
  const seen = new Set();
  const candidates = rows
    .filter((row) => row?.category === 'overall')
    .sort((a, b) => Number(a.rank) - Number(b.rank));
  const items = [];
  for (const row of candidates) {
    const key = String(row.model_name || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const isAgent = meta.scoreKind === 'ratio';
    const rawScore = isAgent ? Number(row.score) : Number(row.rating);
    if (!Number.isFinite(rawScore)) continue;
    items.push({
      rank: items.length + 1,
      model: row.model_name,
      displayName: humanizeModelName(row.model_name),
      organization: row.organization || '—',
      license: row.license || '—',
      open: publicLicense(row.license),
      score: isAgent ? rawScore * 100 : rawScore,
      lower: isAgent ? Number(row.score_ci_lower) * 100 : Number(row.rating_lower),
      upper: isAgent ? Number(row.score_ci_upper) * 100 : Number(row.rating_upper),
      sampleCount: Number(isAgent ? row.session_count : row.vote_count) || 0,
      sampleLabel: isAgent ? '次会话' : '次投票'
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return {
    id: meta.id,
    name: meta.name,
    icon: meta.icon,
    useCase: meta.useCase,
    description: meta.description,
    metric: meta.metric,
    sourceId: 'lmarena',
    sourceUrl: 'https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset',
    updatedAt: candidates[0]?.leaderboard_publish_date || null,
    scoreKind: meta.scoreKind,
    items
  };
}

export function normalizeOpenEvalCategory(meta, rows) {
  const candidates = rows
    .filter((row) => Number.isFinite(Number(row?.[meta.field])))
    .sort((a, b) => Number(b[meta.field]) - Number(a[meta.field]))
    .slice(0, MAX_ITEMS);
  return {
    id: meta.id,
    name: meta.name,
    icon: meta.icon,
    useCase: meta.useCase,
    description: meta.description,
    metric: meta.metric,
    sourceId: 'openevals',
    sourceUrl: 'https://huggingface.co/datasets/OpenEvals/leaderboard-data',
    updatedAt: null,
    scoreKind: 'percent',
    items: candidates.map((row, index) => ({
      rank: index + 1,
      model: row.model_name,
      displayName: humanizeModelName(String(row.model_name || '').split('/').at(-1)),
      organization: row.provider || String(row.model_name || '').split('/')[0] || '—',
      license: row.license || '—',
      open: row.model_type === 'open',
      score: Number(row[meta.field]),
      coverageCount: Number(row.coverage_count) || 0,
      parametersBillions: Number(row.parameters_billions) || null
    }))
  };
}

function percentileRanks(rows, field) {
  const scored = rows.filter((row) => Number.isFinite(Number(row?.[field]))).sort((a, b) => Number(b[field]) - Number(a[field]));
  const denominator = Math.max(1, scored.length - 1);
  return new Map(scored.map((row, index) => [row.model_id, 100 * (1 - index / denominator)]));
}

export function buildOpenComposite(rows) {
  const percentiles = new Map(CORE_FIELDS.map((field) => [field, percentileRanks(rows, field)]));
  const items = rows.map((row) => {
    const scores = CORE_FIELDS.map((field) => percentiles.get(field).get(row.model_id)).filter(Number.isFinite);
    if (row.model_type !== 'open' || scores.length < 4) return null;
    return { row, score: scores.reduce((sum, value) => sum + value, 0) / scores.length, coverage: scores.length };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, MAX_ITEMS);
  return {
    id: 'open-overall',
    name: '开源模型综合',
    icon: '开',
    useCase: '本地部署、可控成本与二次开发',
    description: '本站将六项核心公开基准换算为百分位后等权平均，至少覆盖四项；不混入闭源模型。',
    metric: '多基准百分位',
    sourceId: 'openevals',
    sourceUrl: 'https://huggingface.co/datasets/OpenEvals/leaderboard-data',
    updatedAt: null,
    scoreKind: 'percentile',
    methodology: 'AIME 2026、GPQA、Humanity’s Last Exam、MMLU-Pro、SWE-bench Verified 与 Terminal-Bench 等权百分位，至少覆盖 4 项。',
    items: items.map(({ row, score, coverage }, index) => ({
      rank: index + 1,
      model: row.model_name,
      displayName: humanizeModelName(String(row.model_name || '').split('/').at(-1)),
      organization: row.provider || String(row.model_name || '').split('/')[0] || '—',
      license: row.license || '—',
      open: true,
      score,
      coverageCount: coverage,
      parametersBillions: Number(row.parameters_billions) || null
    }))
  };
}

async function fetchAllRows(dataset, config, split) {
  const first = await fetchJson(rowsUrl(dataset, config, split, 0, 100));
  const rows = (first.rows || []).map((item) => item.row);
  for (let offset = 100; offset < Number(first.num_rows_total || 0); offset += 100) {
    const page = await fetchJson(rowsUrl(dataset, config, split, offset, 100));
    rows.push(...(page.rows || []).map((item) => item.row));
  }
  return rows;
}

async function fetchTopRows(dataset, config, split, length = 100) {
  const page = await fetchJson(rowsUrl(dataset, config, split, 0, length));
  return (page.rows || []).map((item) => item.row);
}

async function buildRankings() {
  const [arenaResults, openRows, openMeta] = await Promise.all([
    Promise.all(LMARENA_CATEGORIES.map(async (meta) => ({ meta, rows: await fetchTopRows(LMARENA_DATASET, meta.config, 'latest') }))),
    fetchAllRows(OPENEVALS_DATASET, 'default', 'train'),
    fetchJson('https://huggingface.co/api/datasets/OpenEvals/leaderboard-data')
  ]);
  const arenaCategories = arenaResults.map(({ meta, rows }) => normalizeArenaCategory(meta, rows));
  const openUpdatedAt = openMeta.lastModified || null;
  const openCategories = OPENEVAL_CATEGORIES.map((meta) => ({ ...normalizeOpenEvalCategory(meta, openRows), updatedAt: openUpdatedAt }));
  const composite = { ...buildOpenComposite(openRows), updatedAt: openUpdatedAt };
  const categories = [...arenaCategories, ...openCategories, composite];
  const arenaUpdatedAt = arenaCategories.map((item) => item.updatedAt).filter(Boolean).sort().at(-1) || null;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: [
      { id: 'lmarena', name: 'LM Arena', type: '真实用户盲测', url: 'https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset', updatedAt: arenaUpdatedAt },
      { id: 'openevals', name: 'OpenEvals / Hugging Face', type: '公开可复现基准', url: 'https://huggingface.co/datasets/OpenEvals/leaderboard-data', updatedAt: openUpdatedAt }
    ],
    categories,
    notes: [
      '榜单反映特定评测中的表现，不代表模型在所有任务上都更强。',
      '分数接近或置信区间重叠时，应视为同一梯队，并结合价格、速度和隐私要求选择。',
      '新模型会随公开数据源更新进入榜单；没有足够公开样本的模型暂不排名。'
    ]
  };
}

function comparablePayload(value) {
  const copy = structuredClone(value);
  delete copy.generatedAt;
  return JSON.stringify(copy);
}

async function writeIfChanged(payload) {
  let existing = null;
  try { existing = JSON.parse(await readFile(OUTPUT_PATH, 'utf8')); } catch { /* first run */ }
  if (existing && comparablePayload(existing) === comparablePayload(payload)) return { changed: false, payload: existing };
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  const tempPath = `${OUTPUT_PATH}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(tempPath, OUTPUT_PATH);
  return { changed: true, payload };
}

export async function run() {
  const result = await writeIfChanged(await buildRankings());
  console.log(JSON.stringify({ changed: result.changed, generatedAt: result.payload.generatedAt, categories: result.payload.categories.map((item) => ({ id: item.id, items: item.items.length, updatedAt: item.updatedAt })) }, null, 2));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => { console.error(error); process.exitCode = 1; });
}
