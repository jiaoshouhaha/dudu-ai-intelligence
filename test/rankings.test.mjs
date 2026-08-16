import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenComposite, normalizeArenaCategory, normalizeOpenEvalCategory } from '../scripts/fetch-rankings.mjs';

test('LM Arena normalization keeps only overall rows and exposes uncertainty', () => {
  const category = normalizeArenaCategory({ id: 'text', name: '文本综合', icon: '文', useCase: '写作', description: '盲测', metric: 'Arena 评分', scoreKind: 'rating' }, [
    { model_name: 'gpt-test', organization: 'OpenAI', license: 'Proprietary', rating: 1400, rating_lower: 1390, rating_upper: 1410, vote_count: 5000, rank: 1, category: 'overall', leaderboard_publish_date: '2026-08-12' },
    { model_name: 'ignored-style-row', organization: 'Other', license: 'MIT', rating: 1500, rank: 1, category: 'style', leaderboard_publish_date: '2026-08-12' },
    { model_name: 'qwen-open', organization: 'Qwen', license: 'Apache-2.0', rating: 1380, rating_lower: 1360, rating_upper: 1400, vote_count: 800, rank: 2, category: 'overall', leaderboard_publish_date: '2026-08-12' }
  ]);
  assert.equal(category.items.length, 2);
  assert.equal(category.items[0].displayName, 'GPT Test');
  assert.equal(category.items[0].lower, 1390);
  assert.equal(category.items[1].open, true);
  assert.equal(category.updatedAt, '2026-08-12');
});

test('OpenEvals category sorts by the selected benchmark instead of aggregate score', () => {
  const category = normalizeOpenEvalCategory({ id: 'coding', name: '代码修复', icon: '码', useCase: '修仓库', description: '真实仓库', metric: 'SWE Verified', field: 'sweVerified_score' }, [
    { model_id: 'a', model_name: 'A/Model-A', provider: 'A', model_type: 'open', license: 'MIT', sweVerified_score: 62, aggregate_score: 99, coverage_count: 1 },
    { model_id: 'b', model_name: 'B/Model-B', provider: 'B', model_type: 'open', license: 'Apache-2.0', sweVerified_score: 76, aggregate_score: 70, coverage_count: 5 }
  ]);
  assert.equal(category.items[0].model, 'B/Model-B');
  assert.equal(category.items[0].score, 76);
  assert.equal(category.items[1].model, 'A/Model-A');
});

test('open composite requires broad coverage and uses percentile ranks', () => {
  const rows = [
    { model_id: 'broad-best', model_name: 'Open/Broad-Best', provider: 'Open', model_type: 'open', license: 'MIT', aime2026_score: 90, gpqa_score: 80, hle_score: 40, mmluPro_score: 85, sweVerified_score: 75, terminalBench_score: 55 },
    { model_id: 'broad-second', model_name: 'Open/Broad-Second', provider: 'Open', model_type: 'open', license: 'MIT', aime2026_score: 80, gpqa_score: 70, hle_score: 30, mmluPro_score: 75, sweVerified_score: 65, terminalBench_score: 45 },
    { model_id: 'one-score', model_name: 'Open/One-Score', provider: 'Open', model_type: 'open', license: 'MIT', aime2026_score: 100 },
    { model_id: 'closed', model_name: 'Closed/Best', provider: 'Closed', model_type: 'closed', license: 'Proprietary', aime2026_score: 99, gpqa_score: 99, hle_score: 99, mmluPro_score: 99, sweVerified_score: 99, terminalBench_score: 99 }
  ];
  const category = buildOpenComposite(rows);
  assert.deepEqual(category.items.map((item) => item.model), ['Open/Broad-Best', 'Open/Broad-Second']);
  assert.equal(category.items[0].coverageCount, 6);
  assert.ok(category.items[0].score > category.items[1].score);
});
