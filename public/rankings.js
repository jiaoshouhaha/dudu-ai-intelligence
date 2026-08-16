const $ = (selector) => document.querySelector(selector);
const menu = $('#menuToggle');
const sidebar = $('#sidebar');
const backdrop = $('#sidebarBackdrop');
let data;
let activeId = new URLSearchParams(location.search).get('category') || 'text';

function closeMenu() {
  sidebar.classList.remove('open');
  backdrop.hidden = true;
  menu.setAttribute('aria-expanded', 'false');
}
menu.addEventListener('click', () => {
  const open = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', open);
  backdrop.hidden = !open;
  menu.setAttribute('aria-expanded', String(open));
});
backdrop.addEventListener('click', closeMenu);

const formatDate = (value) => value ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(value)) : '—';
const compact = (value) => new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
const scoreText = (category, item) => {
  if (category.scoreKind === 'rating') return Math.round(item.score).toLocaleString('zh-CN');
  if (category.scoreKind === 'ratio' || category.scoreKind === 'percent') return `${item.score.toFixed(1)}%`;
  return `${item.score.toFixed(1)} 分`;
};

function createNeedButton(category) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'need-card';
  button.role = 'tab';
  button.dataset.category = category.id;
  button.setAttribute('aria-selected', String(category.id === activeId));
  const icon = document.createElement('span'); icon.className = 'need-icon'; icon.textContent = category.icon;
  const name = document.createElement('strong'); name.textContent = category.name;
  const use = document.createElement('small'); use.textContent = category.useCase;
  button.append(icon, name, use);
  button.addEventListener('click', () => selectCategory(category.id));
  return button;
}

function makeGuide(category) {
  const [first, second] = category.items;
  const bestOpen = category.items.find((item) => item.open);
  const items = [
    { label: '首选', model: first?.displayName || '暂无数据', note: first ? `${category.metric} ${scoreText(category, first)}` : '等待公开评测' },
    { label: '同梯队备选', model: second?.displayName || '暂无数据', note: first && second ? `与第一名相差 ${Math.abs(first.score - second.score).toFixed(1)}` : '结合价格与速度选择' },
    { label: '开源优先', model: bestOpen?.displayName || '本榜暂无开源模型', note: bestOpen ? `当前榜单第 ${bestOpen.rank} 名，可关注部署成本与许可证` : '可切换到“开源模型综合”' }
  ];
  const container = $('#choiceGuide');
  container.replaceChildren(...items.map((item) => {
    const div = document.createElement('div'); div.className = 'guide-item';
    const label = document.createElement('span'); label.textContent = item.label;
    const model = document.createElement('strong'); model.textContent = item.model;
    const note = document.createElement('small'); note.textContent = item.note;
    div.append(label, model, note); return div;
  }));
}

function makePodium(category) {
  $('#podium').replaceChildren(...category.items.slice(0, 3).map((item) => {
    const article = document.createElement('article'); article.className = 'podium-card';
    const rank = document.createElement('span'); rank.className = 'podium-rank'; rank.textContent = String(item.rank).padStart(2, '0');
    const org = document.createElement('span'); org.textContent = item.organization;
    const name = document.createElement('h3'); name.textContent = item.displayName;
    const license = document.createElement('p'); license.textContent = item.open ? `开放权重 · ${item.license}` : item.license;
    const score = document.createElement('p'); score.className = 'podium-score'; score.textContent = `${category.metric} ${scoreText(category, item)}`;
    article.append(rank, org, name, license, score); return article;
  }));
}

function evidenceText(category, item) {
  if (item.sampleCount) return `${compact(item.sampleCount)} ${item.sampleLabel}`;
  const parts = [];
  if (item.coverageCount) parts.push(`覆盖 ${item.coverageCount} 项基准`);
  if (item.parametersBillions) parts.push(`${item.parametersBillions}B 参数`);
  return parts.join(' · ') || '公开评测结果';
}

function makeRows(category) {
  $('#rankingRows').replaceChildren(...category.items.slice(3).map((item) => {
    const row = document.createElement('tr');
    const rank = document.createElement('td'); rank.className = 'rank-number'; rank.textContent = String(item.rank).padStart(2, '0');
    const model = document.createElement('td'); model.className = 'model-cell';
    const modelName = document.createElement('strong'); modelName.textContent = item.displayName;
    if (item.open) { const badge = document.createElement('span'); badge.className = 'model-badge'; badge.textContent = '开放权重'; modelName.append(badge); }
    const org = document.createElement('small'); org.textContent = `${item.organization} · ${item.license}`; model.append(modelName, org);
    const score = document.createElement('td'); score.className = 'score-cell';
    const scoreValue = document.createElement('strong'); scoreValue.textContent = scoreText(category, item);
    const interval = document.createElement('small'); interval.textContent = Number.isFinite(item.lower) && Number.isFinite(item.upper) ? `区间 ${scoreText(category, { score: item.lower })}–${scoreText(category, { score: item.upper })}` : category.metric;
    score.append(scoreValue, interval);
    const evidence = document.createElement('td'); evidence.className = 'evidence-cell'; evidence.textContent = evidenceText(category, item);
    row.append(rank, model, score, evidence); return row;
  }));
}

function selectCategory(id, updateUrl = true) {
  const category = data.categories.find((item) => item.id === id) || data.categories[0];
  activeId = category.id;
  document.querySelectorAll('.need-card').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.category === activeId)));
  $('#rankingSource').textContent = `${category.sourceId === 'lmarena' ? 'LM ARENA · 真实用户盲测' : 'OPENEVALS · 公开基准'} · 更新于 ${formatDate(category.updatedAt)}`;
  $('#rankingTitle').textContent = `${category.name}排名`;
  $('#rankingDescription').textContent = `${category.useCase}。${category.description}`;
  $('#sourceLink').href = category.sourceUrl;
  makeGuide(category); makePodium(category); makeRows(category);
  $('#methodology').textContent = `排名口径：${category.methodology || category.description} 榜单只比较当前公开数据中的模型；分数相近时请结合价格、响应速度、上下文长度和隐私要求试用。`;
  if (updateUrl) history.replaceState(null, '', `${location.pathname}?category=${encodeURIComponent(activeId)}`);
}

function renderSources() {
  $('#sourceCards').replaceChildren(...data.sources.map((source) => {
    const article = document.createElement('article'); article.className = 'source-card';
    const header = document.createElement('header'); const title = document.createElement('h3'); title.textContent = source.name;
    const link = document.createElement('a'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '查看数据 ↗'; header.append(title, link);
    const copy = document.createElement('p'); copy.textContent = source.id === 'lmarena' ? '匿名用户对两个模型回答进行盲选，适合观察真实使用偏好；评分会随新增投票变化。' : '汇集多个公开基准的模型结果，适合比较代码、终端、数学和复杂推理等明确任务。';
    const date = document.createElement('small'); date.textContent = `${source.type} · 数据日期 ${formatDate(source.updatedAt)}`;
    article.append(header, copy, date); return article;
  }));
}

try {
  const response = await fetch('./data/model-rankings.json');
  if (!response.ok) throw new Error(`数据请求失败（${response.status}）`);
  data = await response.json();
  if (!data.categories?.length) throw new Error('榜单暂时为空');
  if (!data.categories.some((item) => item.id === activeId)) activeId = data.categories[0].id;
  $('#categoryNav').replaceChildren(...data.categories.map(createNeedButton));
  $('#rankingNotes').replaceChildren(...(data.notes || []).map((note) => { const li = document.createElement('li'); li.textContent = note; return li; }));
  $('#refreshTime').textContent = `自动更新于 ${new Date(data.generatedAt).toLocaleString('zh-CN', { hour12: false })}`;
  $('#sourceSummary').textContent = `${data.sources.length} 个公开数据源 · ${data.categories.length} 类能力榜单 · 每 30 分钟检查新版本`;
  $('#rankingStatus').textContent = '榜单数据正常'; $('#rankingUpdated').textContent = `更新 ${formatDate(data.generatedAt)}`; $('#rankingHealth').classList.add('ok');
  renderSources(); selectCategory(activeId, false);
} catch (error) {
  $('#refreshTime').textContent = '暂时无法读取榜单';
  $('#sourceSummary').textContent = error.message;
  $('#rankingStatus').textContent = '榜单读取异常'; $('#rankingHealth').classList.add('warn');
  $('#rankingPanel').innerHTML = `<p class="methodology">${error.message}。自动任务会继续重试，请稍后刷新。</p>`;
}
