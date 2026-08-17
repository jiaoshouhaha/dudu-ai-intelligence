const $ = (selector) => document.querySelector(selector);
const menu = $('#menuToggle');
const sidebar = $('#sidebar');
const backdrop = $('#sidebarBackdrop');

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

function makeTopicCard(topic) {
  const card = document.createElement('article');
  card.className = `topic-card${topic.officialUrl ? ' company-card' : ''}`;
  const main = document.createElement('a');
  main.className = 'topic-card-main';
  main.href = `./index.html?theme=${encodeURIComponent(topic.id)}`;
  const name = document.createElement('strong'); name.textContent = topic.name;
  const description = document.createElement('span'); description.textContent = topic.description;
  const count = document.createElement('small'); count.textContent = `查看 ${topic.count} 条本站情报 →`;
  main.append(name, description, count);
  card.append(main);
  if (topic.officialUrl) {
    const official = document.createElement('a');
    official.className = 'official-link';
    official.href = topic.officialUrl;
    official.target = '_blank';
    official.rel = 'noopener noreferrer';
    official.textContent = '官网 ↗';
    official.setAttribute('aria-label', `打开 ${topic.name} 官网`);
    card.append(official);
  }
  return card;
}

function renderGroups(data) {
  const topicsByGroup = Map.groupBy(data.topics || [], (topic) => topic.group);
  $('#topicGroups').replaceChildren(...(data.groups || []).map((group) => {
    const section = document.createElement('section'); section.className = 'topic-group';
    const header = document.createElement('header');
    const title = document.createElement('h2'); title.textContent = group.title;
    const note = document.createElement('p'); note.textContent = group.note;
    header.append(title, note); section.append(header);
    const grid = document.createElement('div'); grid.className = 'topic-grid';
    grid.replaceChildren(...(topicsByGroup.get(group.id) || []).map(makeTopicCard));
    section.append(grid); return section;
  }));
}

try {
  const response = await fetch('./data/topic-index.json');
  if (!response.ok) throw new Error(`主题索引请求失败（${response.status}）`);
  const data = await response.json();
  renderGroups(data);
  $('#topicState').textContent = `已整理 ${data.audit?.totalItems || 0} 条新闻 · 更新于 ${new Date(data.generatedAt).toLocaleString('zh-CN', { hour12: false })}`;
} catch (error) {
  $('#topicState').classList.add('error');
  $('#topicState').textContent = `主题索引暂不可用：${error.message}。新闻时间线仍可正常浏览。`;
}
