import { buildHomeQuery, isHighValue, isWithinHours, LATEST_HOURS, parseHomeQuery } from './home-query.js';
import { expandSearchIndex } from './search-index.js';

const SEARCH_RENDER_LIMIT = 240;
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
const initial = parseHomeQuery(location.search);
const state = {
  items: [],
  searchItems: null,
  searchFailed: false,
  searchLoading: false,
  windowDays: 180,
  trends: {},
  topicIndex: null,
  status: null,
  notice: '',
  ready: false,
  view: initial.view,
  category: initial.category,
  model: initial.model,
  topic: initial.topic,
  theme: initial.theme,
  sourceType: initial.sourceType,
  sort: initial.sort,
  query: initial.query,
  saved: new Set(JSON.parse(localStorage.getItem('signal-saved') || '[]')),
  read: new Set(JSON.parse(localStorage.getItem('signal-read') || '[]'))
};
const categoryNames = { all: '全部情报', models: '模型动态', products: 'AI 产品', agent: 'Agent 与编程', tips: '实用技巧', opensource: '开源项目', research: '研究论文', policy: '政策监管', business: '商业融资', opinion: '人物观点', other: '其他' };
const categoryDescriptions = { all: '按发布时间查看最近收录的 AI 新闻、工具和实践方法', models: '模型发布、能力更新、价格与实测', products: 'AI 产品上线、功能变化与使用体验', agent: 'Agent 工作流、AI 编程与自动化', tips: '可复用的配置、提示词、教程与降本方法', opensource: '值得关注的开源模型、框架和工具', research: '论文、评测、科学进展与研究解读', policy: '法规、治理、安全与合规动态', business: '公司战略、融资、并购与产业变化', opinion: '研究者、开发者和行业人物的观点', other: '其他值得关注的 AI 动态' };
const contentTypeNames = { official: '官方发布', practical: '实践方法', opensource: '开源项目', paper: '研究论文', benchmark: '实测对比', industry: '行业新闻', opinion: '人物观点' };
const evidenceNames = { primary: '一手来源', verified: '交叉验证', practitioner: '作者实测', unverified: '尚待验证' };
const $ = (selector) => document.querySelector(selector);
const els = { grid: $('#newsGrid'), template: $('#cardTemplate'), search: $('#searchInput'), source: $('#sourceFilter'), sort: $('#sortSelect'), active: $('#activeFilters'), empty: $('#emptyState'), emptyTitle: $('#emptyTitle'), emptyCopy: $('#emptyCopy'), status: $('#statusBanner'), models: $('#modelFilters'), update: $('#sideUpdated'), sideStatus: $('#sideStatus'), health: $('#healthDot'), today: $('#todayLabel'), title: $('#pageTitle'), description: $('#pageDescription'), resultCount: $('#resultCount'), nav: $('#sideNav'), menu: $('#menuToggle'), sidebar: $('#sidebar'), backdrop: $('#sidebarBackdrop'), searchHint: $('#searchHint') };

let searchPromise = null;

function localized(item, field) { return item[`${field}Zh`] || item[`${field}Original`] || ''; }
function escapeHtml(value = '') { const div = document.createElement('div'); div.textContent = String(value); return div.innerHTML; }
function escapeAttr(value = '') { return escapeHtml(value).replace(/`/g, '&#96;'); }
function formatTime(value, precision = 'minute') { const options = precision === 'date' ? { month: 'numeric', day: 'numeric' } : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }; return new Intl.DateTimeFormat('zh-CN', options).format(new Date(value)); }
function relativeTime(value) { const seconds = Math.round((new Date(value) - Date.now()) / 1000); const absolute = Math.abs(seconds); if (absolute < 60) return '刚刚'; for (const [size, label] of [[86400, '天'], [3600, '小时'], [60, '分钟']]) if (absolute >= size) { const count = Math.floor(absolute / size); return seconds < 0 ? `${count}${label}前` : `${count}${label}后`; } return formatTime(value); }
function persist() { localStorage.setItem('signal-saved', JSON.stringify([...state.saved])); localStorage.setItem('signal-read', JSON.stringify([...state.read])); }
function categoryOf(item) { if (categoryNames[item.category]) return item.category; if (item.contentType === 'practical') return 'tips'; if (item.contentType === 'opensource') return 'opensource'; if (item.contentType === 'paper') return 'research'; if (item.contentType === 'opinion') return 'opinion'; return item.category || 'other'; }
function sourceTypesOf(item) {
  if (item.sourceTypes?.length) return item.sourceTypes;
  const fromSources = (item.sources || []).map((source) => source.type).filter(Boolean);
  if (fromSources.length) return [...new Set(fromSources)];
  return item.sourceType ? [item.sourceType] : [];
}
function metadataOf(item) {
  const category = categoryOf(item);
  const contentType = item.contentType || (category === 'tips' ? 'practical' : category === 'opensource' ? 'opensource' : category === 'research' ? 'paper' : category === 'opinion' ? 'opinion' : item.sourceType === 'official' ? 'official' : 'industry');
  const evidence = item.evidenceLevel || (item.sourceType === 'official' || item.sourceType === 'paper' ? 'primary' : contentType === 'practical' ? 'practitioner' : 'unverified');
  return { category, contentType, evidence, models: item.models || [], topics: item.topics?.length ? item.topics : item.keywords || [] };
}
function sourceNameOf(item) { return item.sourceName || item.sources?.[0]?.name || '未知来源'; }
function activeTheme() { return state.topicIndex?.topics?.find((theme) => theme.id === state.theme) || null; }
function archiveCorpus() { return (state.query || state.view === 'saved') && state.searchItems ? state.searchItems : state.items; }
function haystack(item) {
  const meta = metadataOf(item);
  return [item.titleZh, item.titleOriginal, item.summaryZh, item.summaryOriginal, item.importanceReasonZh, sourceNameOf(item), ...meta.models, ...meta.topics, ...(item.keywords || []), ...(item.sources || []).map((source) => source.name)].filter(Boolean).join(' ').toLowerCase();
}
function filteredItems() {
  const query = state.query.trim().toLowerCase();
  const theme = activeTheme();
  const themeIds = theme ? new Set(theme.itemIds) : null;
  return archiveCorpus().filter((item) => {
    const meta = metadataOf(item);
    if (state.view === 'selected' && !isHighValue(item.importance, meta.evidence)) return false;
    if (state.view === 'latest' && !isWithinHours(item.publishedAt, LATEST_HOURS)) return false;
    if (state.view === 'saved' && !state.saved.has(item.id)) return false;
    if (state.category !== 'all' && meta.category !== state.category) return false;
    if (state.model && !meta.models.includes(state.model)) return false;
    if (state.topic && !meta.topics.includes(state.topic)) return false;
    if (state.theme && (!themeIds || !themeIds.has(item.id))) return false;
    if (state.sourceType !== 'all' && !sourceTypesOf(item).includes(state.sourceType)) return false;
    if (query && !haystack(item).includes(query)) return false;
    return true;
  }).sort((a, b) => state.sort === 'time' ? new Date(b.publishedAt) - new Date(a.publishedAt) : b.importance - a.importance);
}

function syncUrl(mode) {
  try {
    const next = buildHomeQuery(state);
    const current = location.search.replace(/^\?/, '');
    if (next === current) return;
    const path = `${location.pathname}${next ? `?${next}` : ''}${location.hash}`;
    history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', path);
  } catch {
    // Opening the file directly can reject history updates.
  }
}

function setMeta(selector, content) {
  const node = document.querySelector(selector);
  if (node) node.setAttribute('content', content);
}

function ensureSearchIndex() {
  if (state.searchItems || state.searchFailed || searchPromise) return searchPromise;
  state.searchLoading = true;
  searchPromise = fetch('./data/search-index.json').then(async (response) => {
    if (!response.ok) throw new Error(`搜索索引请求失败（${response.status}）`);
    const data = await response.json();
    state.searchItems = expandSearchIndex(data);
    state.windowDays = data.windowDays || state.windowDays;
    state.searchLoading = false;
    render();
  }).catch((error) => {
    state.searchLoading = false;
    state.searchFailed = true;
    state.notice = `180 天搜索暂时不可用，已改为搜索最近收录。（${error.message}）`;
    render();
  });
  return searchPromise;
}

function renderNavigation() {
  const counts = state.items.reduce((map, item) => {
    const category = categoryOf(item);
    map[category] = (map[category] || 0) + 1;
    return map;
  }, {
    all: state.items.length,
    latest: state.items.filter((item) => isWithinHours(item.publishedAt, LATEST_HOURS)).length,
    selected: state.items.filter((item) => isHighValue(item.importance, metadataOf(item).evidence)).length,
    saved: state.saved.size
  });
  document.querySelectorAll('[data-count]').forEach((node) => { node.textContent = counts[node.dataset.count] || 0; });
  document.querySelectorAll('.side-link').forEach((button) => {
    const active = button.dataset.view ? button.dataset.view === state.view : button.dataset.category === state.category && state.view === 'category';
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function renderModels() {
  const derived = new Map();
  for (const item of state.items) for (const model of metadataOf(item).models) derived.set(model, (derived.get(model) || 0) + 1);
  const models = state.trends.models?.length ? state.trends.models : [...derived].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  els.models.innerHTML = models.slice(0, 12).map((model) => `<button class="model-chip${state.model === model.name ? ' active' : ''}" data-model="${escapeAttr(model.name)}">${escapeHtml(model.name)} <strong>${model.count}</strong></button>`).join('');
  els.models.querySelectorAll('[data-model]').forEach((button) => button.addEventListener('click', () => {
    state.model = state.model === button.dataset.model ? '' : button.dataset.model;
    state.theme = '';
    syncUrl('push');
    render();
  }));
}

function renderPageMeta() {
  let title = categoryNames[state.category] || '全部情报';
  let description = categoryDescriptions[state.category] || categoryDescriptions.all;
  if (state.view === 'selected') {
    title = '高价值精选';
    description = '重要度不低于 75，且有一手来源、交叉验证或作者实测。取自最近收录，不限于今天。';
  } else if (state.view === 'latest') {
    title = '最近 24 小时';
    description = '只看过去 24 小时内发布的情报。首页保留更长的最近收录。';
  } else if (state.view === 'saved') {
    title = '我的收藏';
    description = '保存在这台设备上、且仍在 180 天归档内的情报';
  }
  if (state.model) {
    title = state.model;
    description = `与 ${state.model} 相关的发布、实测、方法和观点`;
  }
  const theme = activeTheme();
  if (theme) {
    title = theme.name;
    description = `${theme.description} · 来自统一主题索引的 ${theme.count} 条情报`;
  }
  els.title.textContent = title;
  els.description.textContent = description;
  const documentTitle = `${title} · 嘟嘟的 AI 情报站`;
  document.title = documentTitle;
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', documentTitle);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[property="og:url"]', location.href);
}

function renderGrid() {
  if (!state.ready) return;
  const pendingSearch = Boolean(state.query) && !state.searchItems && !state.searchFailed;
  const matched = pendingSearch ? [] : filteredItems();
  const items = matched.slice(0, SEARCH_RENDER_LIMIT);
  els.grid.replaceChildren();
  for (const item of items) {
    const meta = metadataOf(item);
    const card = els.template.content.firstElementChild.cloneNode(true);
    card.dataset.id = item.id;
    card.classList.toggle('is-read', state.read.has(item.id));
    const time = card.querySelector('time');
    time.innerHTML = `${relativeTime(item.publishedAt)}<br>${formatTime(item.publishedAt, item.publishedPrecision)}`;
    time.dateTime = item.publishedAt;
    card.querySelector('.source-name').textContent = sourceNameOf(item);
    card.querySelector('.content-type').textContent = contentTypeNames[meta.contentType] || 'AI 动态';
    card.querySelector('.evidence').textContent = evidenceNames[meta.evidence] || '待核实';
    card.querySelector('.score').textContent = `${item.importance} 分`;
    const link = card.querySelector('.title-link');
    link.href = `./detail.html?id=${encodeURIComponent(item.id)}`;
    link.textContent = localized(item, 'title');
    card.querySelector('.summary').textContent = localized(item, 'summary') || '中文摘要生成中';
    const reason = card.querySelector('.reason');
    if (item.importanceReasonZh) reason.textContent = `为什么值得关注：${item.importanceReasonZh}`;
    else reason.hidden = true;
    const tags = card.querySelector('.tag-row');
    tags.innerHTML = [...meta.models.map((name) => `<button class="tag model" data-card-model="${escapeAttr(name)}">${escapeHtml(name)}</button>`), ...meta.topics.slice(0, 5).map((name) => `<button class="tag" data-card-topic="${escapeAttr(name)}">${escapeHtml(name)}</button>`)].join('');
    tags.querySelectorAll('[data-card-model]').forEach((button) => button.addEventListener('click', () => {
      state.model = button.dataset.cardModel;
      state.topic = '';
      state.theme = '';
      syncUrl('push');
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    tags.querySelectorAll('[data-card-topic]').forEach((button) => button.addEventListener('click', () => {
      state.topic = button.dataset.cardTopic;
      state.model = '';
      state.theme = '';
      syncUrl('push');
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    const original = card.querySelector('.original-link');
    if (item.originalUrl) original.href = item.originalUrl;
    else original.hidden = true;
    const save = card.querySelector('.save-button');
    save.classList.toggle('saved', state.saved.has(item.id));
    save.textContent = state.saved.has(item.id) ? '★' : '☆';
    save.addEventListener('click', () => {
      if (state.saved.has(item.id)) state.saved.delete(item.id);
      else state.saved.add(item.id);
      persist();
      render();
    });
    const read = card.querySelector('.read-button');
    read.textContent = state.read.has(item.id) ? '标为未读' : '标为已读';
    read.addEventListener('click', () => {
      if (state.read.has(item.id)) state.read.delete(item.id);
      else state.read.add(item.id);
      persist();
      renderGrid();
    });
    [link, original].forEach((target) => target.addEventListener('click', () => { state.read.add(item.id); persist(); }));
    els.grid.append(card);
  }
  els.empty.hidden = pendingSearch || items.length > 0;
  if (!items.length && !pendingSearch) {
    els.emptyTitle.textContent = state.query ? '没有找到匹配的情报' : '这个分类暂时没有内容';
    els.emptyCopy.textContent = state.query
      ? `已在${searchScope()}中查找。可以换一个关键词，或清除筛选。`
      : '可以切换到首页，或清除搜索和筛选条件。';
  }
  if (pendingSearch) els.resultCount.textContent = `正在搜索${searchScope()}…`;
  else if (state.query && state.searchItems) {
    const clipped = matched.length > items.length ? `，先显示前 ${items.length} 条` : '';
    els.resultCount.textContent = `在${searchScope()}中匹配 ${matched.length} 条${clipped}`;
  } else if (state.query && state.searchFailed) els.resultCount.textContent = `显示 ${items.length} 条，当前只搜索最近收录`;
  else if (state.view === 'latest') els.resultCount.textContent = `显示 ${items.length} 条，过去 24 小时 ${matched.length} 条`;
  else if (state.view === 'selected') els.resultCount.textContent = `显示 ${items.length} 条，高价值精选 ${matched.length} 条`;
  else els.resultCount.textContent = `显示 ${items.length} 条，最近收录 ${state.items.length} 条`;
  const theme = activeTheme();
  els.active.innerHTML = [
    theme ? `<button class="filter-pill" data-clear="theme">主题：${escapeHtml(theme.name)} ×</button>` : '',
    state.model ? `<button class="filter-pill" data-clear="model">模型：${escapeHtml(state.model)} ×</button>` : '',
    state.topic ? `<button class="filter-pill" data-clear="topic">主题：${escapeHtml(state.topic)} ×</button>` : '',
    state.query ? `<button class="filter-pill" data-clear="query">“${escapeHtml(state.query)}” ×</button>` : ''
  ].join('');
  els.active.querySelectorAll('[data-clear]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.clear === 'query') {
      state.query = '';
      els.search.value = '';
    } else state[button.dataset.clear] = '';
    syncUrl('push');
    render();
  }));
}

function searchScope() {
  if (state.view === 'latest') return '过去 24 小时';
  if (state.view === 'selected') return '高价值精选';
  if (state.view === 'saved') return '我的收藏';
  if (state.view === 'category') return `「${categoryNames[state.category] || '当前分类'}」的 ${state.windowDays} 天归档`;
  return `最近 ${state.windowDays} 天`;
}

function searchHint() {
  if (state.view === 'latest') return '这里只搜索过去 24 小时。回到首页可搜索全部保留期。';
  if (state.view === 'selected') return '这里只搜索高价值精选。回到首页可搜索全部保留期。';
  if (state.view === 'saved') return '这里只搜索这台设备上的收藏。';
  if (state.view === 'category') return `在当前分类中搜索保留的 ${state.windowDays} 天，不限首页这批最近收录。`;
  return `首页列出最近收录。输入关键词会搜索保留的 ${state.windowDays} 天。`;
}

function renderStatus() {
  if (els.searchHint) els.searchHint.textContent = searchHint();
  if (!state.status) {
    els.status.hidden = !state.notice;
    els.status.textContent = state.notice || '';
    els.sideStatus.textContent = '尚未完成更新';
    els.update.textContent = '等待首次抓取';
    return;
  }
  const stale = Date.now() - new Date(state.status.finishedAt) > STALE_AFTER_MS;
  const partial = state.status.failedSources > 0;
  const updated = formatTime(state.status.finishedAt);
  els.status.hidden = !stale && !partial && !state.notice;
  els.status.textContent = stale
    ? `数据已超过 12 小时没有更新。上次成功更新：${updated}。`
    : partial
      ? `${state.status.failedSources} 个来源暂时失败，其余来源正常。上次成功更新：${updated}。`
      : state.notice;
  els.health.classList.toggle('ok', !stale && !partial);
  els.health.classList.toggle('warn', stale || partial);
  els.sideStatus.textContent = stale ? '更新延迟' : partial ? '部分来源失败' : '自动更新正常';
  els.update.textContent = `${updated} · ${state.status.successfulSources}/${state.status.sourceCount} 来源 · ${['ai', 'deepseek'].includes(state.status.mode) ? 'DeepSeek' : '规则整理'} · 约每 30 分钟扫描`;
}

function render() {
  if (!state.ready) return;
  if (els.search.value !== state.query) els.search.value = state.query;
  if ([...els.source.options].some((option) => option.value === state.sourceType)) els.source.value = state.sourceType;
  els.sort.value = state.sort;
  els.today.textContent = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(new Date());
  renderNavigation();
  renderModels();
  renderPageMeta();
  renderGrid();
  renderStatus();
}

function closeMenu() { els.sidebar.classList.remove('open'); els.backdrop.hidden = true; els.menu.setAttribute('aria-expanded', 'false'); }

function resetListFilters() {
  state.model = '';
  state.topic = '';
  state.theme = '';
  state.query = '';
  els.search.value = '';
}

els.nav.addEventListener('click', (event) => {
  const button = event.target.closest('.side-link');
  if (!button || (!button.dataset.view && !button.dataset.category)) return;
  resetListFilters();
  if (button.dataset.category) {
    state.view = 'category';
    state.category = button.dataset.category;
  } else {
    state.view = button.dataset.view;
    state.category = 'all';
  }
  if (state.view === 'latest') state.sort = 'time';
  els.sort.value = state.sort;
  if (state.view === 'saved') ensureSearchIndex();
  syncUrl('push');
  closeMenu();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
els.search.addEventListener('input', (event) => {
  const previous = state.query;
  state.query = event.target.value;
  if (!previous && state.query) syncUrl('push');
  else syncUrl('replace');
  if (state.query) ensureSearchIndex();
  renderGrid();
  renderStatus();
});
els.source.addEventListener('change', (event) => { state.sourceType = event.target.value; syncUrl('push'); renderGrid(); });
els.sort.addEventListener('change', (event) => { state.sort = event.target.value; syncUrl('push'); renderGrid(); });
$('#clearFilters').addEventListener('click', () => {
  state.view = 'all';
  state.category = 'all';
  state.model = '';
  state.topic = '';
  state.theme = '';
  state.sourceType = 'all';
  state.query = '';
  els.source.value = 'all';
  els.search.value = '';
  syncUrl('push');
  render();
});
els.menu.addEventListener('click', () => {
  const open = !els.sidebar.classList.contains('open');
  els.sidebar.classList.toggle('open', open);
  els.backdrop.hidden = !open;
  els.menu.setAttribute('aria-expanded', String(open));
});
els.backdrop.addEventListener('click', closeMenu);
window.addEventListener('popstate', () => {
  const next = parseHomeQuery(location.search);
  state.view = next.view;
  state.category = next.category;
  state.model = next.model;
  state.topic = next.topic;
  state.theme = next.theme;
  state.sourceType = next.sourceType;
  state.sort = next.sort;
  state.query = next.query;
  if (state.query || state.view === 'saved') ensureSearchIndex();
  render();
});

syncUrl('replace');
els.search.value = state.query;
els.sort.value = state.sort;
if ([...els.source.options].some((option) => option.value === state.sourceType)) els.source.value = state.sourceType;
if (state.query || state.view === 'saved') ensureSearchIndex();

try {
  const [index, trends, topicIndex, status] = await Promise.all([
    fetch('./data/index.json').then((response) => response.ok ? response.json() : { items: [] }),
    fetch('./data/trends.json').then((response) => response.ok ? response.json() : {}),
    fetch('./data/topic-index.json').then((response) => response.ok ? response.json() : null),
    fetch('./data/status.json').then((response) => response.ok ? response.json() : null)
  ]);
  state.items = index.items || [];
  state.windowDays = index.windowDays || state.windowDays;
  state.trends = trends || {};
  state.topicIndex = topicIndex;
  state.status = status;
  if (state.theme && !activeTheme()) {
    state.notice = '未找到这个主题，已保留当前新闻列表。';
    state.theme = '';
    syncUrl('replace');
  }
} catch (error) {
  state.notice = `数据读取失败：${error.message}`;
}
state.ready = true;
render();
