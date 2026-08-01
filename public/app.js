const state = {
  items: [], trends: [], status: null, language: localStorage.getItem('signal-language') || 'zh',
  category: 'all', sourceType: 'all', sort: 'importance', query: '',
  saved: new Set(JSON.parse(localStorage.getItem('signal-saved') || '[]')),
  read: new Set(JSON.parse(localStorage.getItem('signal-read') || '[]'))
};

const labels = {
  zh: { latest: '最新动态', important: '同样重要', why: '为什么重要：', read: '标为已读', unread: '标为未读', noTranslation: '暂未生成中文，显示原文', trend: '趋势' },
  en: { latest: 'Latest intelligence', important: 'Also important', why: 'Why it matters: ', read: 'Mark as read', unread: 'Mark unread', noTranslation: 'Translation pending — showing original', trend: 'Trending' }
};
const categoryNames = {
  zh: { all: '全部', models: '模型', products: '产品', business: '商业', research: '研究', policy: '政策', opensource: '开源', other: '其他' },
  en: { all: 'All', models: 'Models', products: 'Products', business: 'Business', research: 'Research', policy: 'Policy', opensource: 'Open source', other: 'Other' }
};

const $ = (selector) => document.querySelector(selector);
const els = {
  lead: $('#leadStory'), important: $('#importantList'), grid: $('#newsGrid'), template: $('#cardTemplate'),
  language: $('#languageToggle'), searchToggle: $('#searchToggle'), searchPanel: $('#searchPanel'), search: $('#searchInput'),
  source: $('#sourceFilter'), sort: $('#sortSelect'), active: $('#activeFilters'), empty: $('#emptyState'),
  status: $('#statusBanner'), trend: $('#trendBar'), update: $('#updateLabel'), today: $('#todayLabel'), feedTitle: $('#feedTitle')
};

function localized(item, field) {
  const candidate = item[`${field}${state.language === 'zh' ? 'Zh' : 'En'}`];
  return candidate || item[`${field}Original`] || '';
}

function formatTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(state.language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function persist() {
  localStorage.setItem('signal-language', state.language);
  localStorage.setItem('signal-saved', JSON.stringify([...state.saved]));
  localStorage.setItem('signal-read', JSON.stringify([...state.read]));
}

function filteredItems() {
  const query = state.query.trim().toLowerCase();
  return state.items
    .filter((item) => state.category === 'all' || item.category === state.category)
    .filter((item) => state.sourceType === 'all' || item.sourceType === state.sourceType || item.sources.some((source) => source.type === state.sourceType))
    .filter((item) => !query || [item.titleOriginal, item.summaryOriginal, item.titleZh, item.titleEn, item.summaryZh, item.summaryEn, ...(item.keywords || []), ...item.sources.map((source) => source.name)].join(' ').toLowerCase().includes(query))
    .sort((a, b) => state.sort === 'time' ? new Date(b.publishedAt) - new Date(a.publishedAt) : b.importance - a.importance);
}

function renderLead() {
  const ranked = [...state.items].sort((a, b) => b.importance - a.importance);
  const lead = ranked[0];
  if (!lead) {
    els.lead.classList.remove('skeleton');
    els.lead.innerHTML = '<p class="eyebrow">NO DATA</p><h1>先运行一次新闻抓取</h1><p class="lead-summary">执行 <code>npm run fetch</code> 获取真实新闻，或执行 <code>npm run fetch:fixture</code> 生成演示数据。</p>';
    els.important.innerHTML = '';
    return;
  }
  els.lead.classList.remove('skeleton');
  els.lead.innerHTML = `
    <p class="eyebrow">TODAY'S LEAD · ${lead.importance}</p>
    <h1 id="leadTitle"><a href="${escapeAttr(lead.originalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localized(lead, 'title'))}</a></h1>
    <p class="lead-summary">${escapeHtml(localized(lead, 'summary') || labels[state.language].noTranslation)}</p>
    <p class="importance-reason"><strong>${labels[state.language].why}</strong>${escapeHtml(state.language === 'zh' ? lead.importanceReasonZh : lead.importanceReasonEn)}</p>
    <div class="story-meta"><strong>${escapeHtml(lead.sources[0]?.name || '')}</strong><span>${formatTime(lead.publishedAt)}</span><span>${lead.sources.length} source${lead.sources.length > 1 ? 's' : ''}</span><a href="${escapeAttr(lead.originalUrl)}" target="_blank" rel="noopener noreferrer">${state.language === 'zh' ? '阅读全文 ↗' : 'Read original ↗'}</a></div>`;
  els.important.innerHTML = `<h2>${labels[state.language].important.toUpperCase()}</h2>${ranked.slice(1, 4).map((item) => `
    <article class="important-item"><span class="item-score">${item.importance} · ${categoryNames[state.language][item.category] || item.category}</span><h3><a href="${escapeAttr(item.originalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localized(item, 'title'))}</a></h3><p>${escapeHtml(item.sources[0]?.name || '')} · ${formatTime(item.publishedAt)}</p></article>`).join('')}`;
}

function renderTrends() {
  const fallbackCounts = state.items.reduce((counts, item) => ({ ...counts, [item.category]: (counts[item.category] || 0) + 1 }), {});
  const trends = state.trends.length ? state.trends : Object.entries(fallbackCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  els.trend.innerHTML = `<strong>${labels[state.language].trend}</strong>${trends.map((trend) => `<button class="trend-button" data-trend="${escapeAttr(trend.name)}">${escapeHtml(categoryNames[state.language][trend.name] || trend.name)} <small>${trend.count}</small></button>`).join('')}`;
  els.trend.querySelectorAll('[data-trend]').forEach((button) => button.addEventListener('click', () => { state.category = button.dataset.trend; syncNav(); render(); document.querySelector('.feed-section').scrollIntoView(); }));
}

function renderGrid() {
  const items = filteredItems();
  els.grid.replaceChildren();
  for (const item of items) {
    const card = els.template.content.firstElementChild.cloneNode(true);
    card.dataset.id = item.id;
    card.classList.toggle('is-read', state.read.has(item.id));
    card.querySelector('.score').textContent = String(item.importance);
    card.querySelector('.category').textContent = categoryNames[state.language][item.category] || item.category;
    card.querySelector('time').textContent = formatTime(item.publishedAt);
    card.querySelector('time').dateTime = item.publishedAt;
    const link = card.querySelector('.title-link');
    link.href = item.originalUrl; link.textContent = localized(item, 'title');
    card.querySelector('.summary').textContent = localized(item, 'summary') || labels[state.language].noTranslation;
    card.querySelector('.reason').textContent = `${labels[state.language].why}${state.language === 'zh' ? item.importanceReasonZh : item.importanceReasonEn}`;
    card.querySelector('.source-name').textContent = `${item.sources[0]?.name || ''}${item.sources.length > 1 ? ` +${item.sources.length - 1}` : ''}`;
    const save = card.querySelector('.save-button');
    save.classList.toggle('saved', state.saved.has(item.id)); save.textContent = state.saved.has(item.id) ? '★' : '☆';
    save.addEventListener('click', () => { state.saved.has(item.id) ? state.saved.delete(item.id) : state.saved.add(item.id); persist(); renderGrid(); });
    const read = card.querySelector('.read-button');
    read.textContent = state.read.has(item.id) ? labels[state.language].unread : labels[state.language].read;
    read.addEventListener('click', () => { state.read.has(item.id) ? state.read.delete(item.id) : state.read.add(item.id); persist(); renderGrid(); });
    link.addEventListener('click', () => { state.read.add(item.id); persist(); });
    els.grid.append(card);
  }
  els.empty.hidden = items.length > 0;
  els.active.innerHTML = [state.category !== 'all' ? `<button class="filter-pill" data-clear="category">${categoryNames[state.language][state.category]} ×</button>` : '', state.query ? `<button class="filter-pill" data-clear="query">“${escapeHtml(state.query)}” ×</button>` : ''].join('');
  els.active.querySelectorAll('[data-clear]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.clear === 'query') { state.query = ''; els.search.value = ''; } else state.category = 'all'; syncNav(); render(); }));
}

function renderStatus() {
  if (!state.status) return;
  const stale = Date.now() - new Date(state.status.finishedAt) > 3 * 36e5;
  const partial = state.status.failedSources > 0;
  els.status.hidden = !stale && !partial;
  els.status.textContent = stale ? '数据已超过 3 小时未更新，请检查自动任务。' : `${state.status.failedSources} 个来源暂时更新失败，其余来源不受影响。`;
  els.update.textContent = `${state.language === 'zh' ? '最后更新' : 'Updated'} ${formatTime(state.status.finishedAt)} · ${state.status.mode === 'ai' ? 'AI' : state.language === 'zh' ? '规则评分' : 'Rule scoring'}`;
}

function syncNav() {
  document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.category === state.category || (state.category === 'all' && button.dataset.view === 'today')));
}

function render() {
  document.documentElement.lang = state.language === 'zh' ? 'zh-CN' : 'en';
  els.today.textContent = new Intl.DateTimeFormat(state.language === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'full' }).format(new Date());
  els.feedTitle.textContent = labels[state.language].latest;
  renderLead(); renderTrends(); renderGrid(); renderStatus();
}

function escapeHtml(value = '') { const div = document.createElement('div'); div.textContent = String(value); return div.innerHTML; }
function escapeAttr(value = '') { return escapeHtml(value).replace(/`/g, '&#96;'); }

els.language.addEventListener('click', () => { state.language = state.language === 'zh' ? 'en' : 'zh'; persist(); render(); });
els.searchToggle.addEventListener('click', () => { els.searchPanel.hidden = !els.searchPanel.hidden; if (!els.searchPanel.hidden) els.search.focus(); });
els.search.addEventListener('input', (event) => { state.query = event.target.value; renderGrid(); });
els.source.addEventListener('change', (event) => { state.sourceType = event.target.value; renderGrid(); });
els.sort.addEventListener('change', (event) => { state.sort = event.target.value; renderGrid(); });
$('#clearFilters').addEventListener('click', () => { state.category = 'all'; state.sourceType = 'all'; state.query = ''; els.source.value = 'all'; els.search.value = ''; syncNav(); render(); });
document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => { state.category = button.dataset.category; syncNav(); render(); document.querySelector('.feed-section').scrollIntoView(); }));
document.querySelector('[data-view="today"]').addEventListener('click', () => { state.category = 'all'; state.sort = 'importance'; els.sort.value = 'importance'; syncNav(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
document.querySelector('[data-view="latest"]').addEventListener('click', () => { state.category = 'all'; state.sort = 'time'; els.sort.value = 'time'; syncNav(); render(); document.querySelector('.feed-section').scrollIntoView(); });

try {
  const [index, trends, status] = await Promise.all([
    fetch('/data/index.json').then((response) => response.ok ? response.json() : { items: [] }),
    fetch('/data/trends.json').then((response) => response.ok ? response.json() : { categories: [] }),
    fetch('/data/status.json').then((response) => response.ok ? response.json() : null)
  ]);
  state.items = index.items || []; state.trends = trends.keywords?.length ? trends.keywords : trends.categories || []; state.status = status;
} catch (error) {
  els.status.hidden = false; els.status.textContent = `数据读取失败：${error.message}`;
}

render();
