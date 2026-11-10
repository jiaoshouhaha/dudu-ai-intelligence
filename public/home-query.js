export const HOME_VIEWS = ['all', 'latest', 'selected', 'saved', 'category'];
export const HOME_CATEGORIES = ['models', 'products', 'agent', 'tips', 'opensource', 'research', 'policy', 'business', 'opinion', 'other'];
export const HOME_SOURCES = ['all', 'official', 'practitioner', 'media', 'paper', 'community', 'aggregator'];
export const LATEST_HOURS = 24;
export const HIGH_VALUE_SCORE = 75;

export function isWithinHours(value, hours, now = Date.now()) {
  const time = new Date(value).valueOf();
  return Number.isFinite(time) && now - time <= hours * 3600e3 && time <= now + 5 * 60e3;
}

export function isHighValue(importance, evidence) {
  return Number(importance) >= HIGH_VALUE_SCORE && Boolean(evidence) && evidence !== 'unverified';
}

export function parseHomeQuery(search) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const requestedView = params.get('view') || '';
  const requestedCategory = params.get('category') || '';
  let view = HOME_VIEWS.includes(requestedView) ? requestedView : 'all';
  let category = 'all';
  if (view === 'category' && HOME_CATEGORIES.includes(requestedCategory)) category = requestedCategory;
  else if (view === 'category') view = 'all';
  else if (view === 'all' && HOME_CATEGORIES.includes(requestedCategory)) {
    view = 'category';
    category = requestedCategory;
  }
  const source = params.get('source') || 'all';
  return {
    view,
    category,
    model: params.get('model') || '',
    topic: params.get('topic') || '',
    theme: params.get('theme') || '',
    sourceType: HOME_SOURCES.includes(source) ? source : 'all',
    sort: params.get('sort') === 'importance' ? 'importance' : 'time',
    query: params.get('q') || ''
  };
}

export function buildHomeQuery(state) {
  const params = new URLSearchParams();
  if (state.view && state.view !== 'all') params.set('view', state.view);
  if (state.view === 'category' && state.category && state.category !== 'all') params.set('category', state.category);
  if (state.model) params.set('model', state.model);
  if (state.topic) params.set('topic', state.topic);
  if (state.theme) params.set('theme', state.theme);
  if (state.sourceType && state.sourceType !== 'all') params.set('source', state.sourceType);
  if (state.sort === 'importance') params.set('sort', 'importance');
  if (state.query) params.set('q', state.query);
  return params.toString();
}
