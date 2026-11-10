export function beijingDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function newsPathForDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? `./data/news/${date}.json` : '';
}

export function newsPathForId(id, lookup) {
  if (!id || !lookup?.dates) return '';
  return newsPathForDate(lookup.dates[id]);
}
