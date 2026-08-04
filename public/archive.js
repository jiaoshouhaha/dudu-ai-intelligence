const $ = (selector) => document.querySelector(selector);
const formatDate = (value) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T00:00:00+08:00`));
const menu = $('#menuToggle');
const sidebar = $('#sidebar');
const backdrop = $('#sidebarBackdrop');
function closeMenu() { sidebar.classList.remove('open'); backdrop.hidden = true; }
menu.addEventListener('click', () => { const open = !sidebar.classList.contains('open'); sidebar.classList.toggle('open', open); backdrop.hidden = !open; });
backdrop.addEventListener('click', closeMenu);

try {
  const response = await fetch('./data/archive.json');
  if (!response.ok) throw new Error(`数据请求失败（${response.status}）`);
  const data = await response.json();
  $('#archiveState').textContent = `共保留 ${data.retentionDays || 180} 天 · 更新于 ${new Date(data.generatedAt).toLocaleString('zh-CN', { hour12: false })}`;
  $('#archiveMonths').replaceChildren(...(data.months || []).map((month, index) => {
    const section = document.createElement('section');
    section.className = 'archive-month';
    const heading = document.createElement('h2');
    heading.textContent = month.month;
    section.append(heading);
    const days = document.createElement('div');
    days.className = 'archive-days';
    for (const day of month.days || []) {
      const article = document.createElement('article');
      article.className = 'archive-day';
      const label = document.createElement('header');
      label.innerHTML = `<strong>${formatDate(day.date)}</strong><span>${day.count} 条</span>`;
      article.append(label);
      const list = document.createElement('div');
      list.className = 'archive-highlights';
      for (const item of day.highlights || []) {
        const link = document.createElement('a');
        link.href = `./detail.html?id=${encodeURIComponent(item.id)}`;
        link.innerHTML = `<span>${item.importance || '—'}</span><strong></strong>`;
        link.querySelector('strong').textContent = item.titleZh || '未命名新闻';
        list.append(link);
      }
      article.append(list);
      days.append(article);
    }
    section.append(days);
    if (index > 0) section.classList.add('collapsed');
    return section;
  }));
  document.querySelectorAll('.archive-month h2').forEach((heading) => heading.addEventListener('click', () => heading.parentElement.classList.toggle('collapsed')));
} catch (error) {
  $('#archiveState').textContent = `暂时无法读取归档：${error.message}`;
}
