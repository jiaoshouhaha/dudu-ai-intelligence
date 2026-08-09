const $ = (selector) => document.querySelector(selector);
const categoryNames = { models:'模型动态',products:'AI 产品',agent:'Agent 与编程',tips:'实用技巧',opensource:'开源项目',research:'研究论文',policy:'政策监管',business:'商业融资',opinion:'人物观点',other:'其他' };
const contentTypeNames = { official:'官方发布',practical:'实践方法',opensource:'开源项目',paper:'研究论文',benchmark:'实测对比',industry:'行业新闻',opinion:'人物观点' };
const evidenceNames = { primary:'一手来源',verified:'交叉验证',practitioner:'作者实测',unverified:'尚待验证' };

function formatTime(value) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle:'long',timeStyle:'short',hour12:false }).format(new Date(value));
}

function addTextList(element, items) {
  element.replaceChildren(...items.map((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}

function addParagraphs(element, text) {
  const paragraphs = String(text || '').split(/\n{2,}/).map((value) => value.trim()).filter(Boolean);
  element.replaceChildren(...paragraphs.map((value) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = value;
    return paragraph;
  }));
}

function openMediaLightbox(url, caption) {
  const lightbox = $('#mediaLightbox');
  $('#mediaLightboxImage').src = url;
  $('#mediaLightboxImage').alt = caption;
  $('#mediaLightboxCaption').textContent = caption;
  lightbox.hidden = false;
  document.body.classList.add('lightbox-open');
  $('#mediaLightboxClose').focus();
}

function closeMediaLightbox() {
  $('#mediaLightbox').hidden = true;
  $('#mediaLightboxImage').removeAttribute('src');
  document.body.classList.remove('lightbox-open');
}

$('#mediaLightboxClose').addEventListener('click', closeMediaLightbox);
$('#mediaLightbox').addEventListener('click', (event) => {
  if (event.target.id === 'mediaLightbox') closeMediaLightbox();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#mediaLightbox').hidden) closeMediaLightbox();
});

function renderSourceMedia(item) {
  const images = [...new Set((item.images || []).filter((url) => /^https?:\/\//i.test(url)))].slice(0, 8);
  const section = $('#mediaSection');
  const grid = $('#mediaGrid');
  grid.replaceChildren(...images.map((url, index) => {
    const figure = document.createElement('figure');
    figure.className = 'media-figure';
    const image = document.createElement('img');
    image.src = url;
    image.alt = `${item.titleZh || item.titleOriginal} · 原文配图 ${index + 1}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.addEventListener('click', () => openMediaLightbox(url, caption.textContent));
    image.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMediaLightbox(url, caption.textContent);
      }
    });
    image.addEventListener('error', () => {
      figure.remove();
      section.hidden = !grid.children.length;
    });
    const caption = document.createElement('figcaption');
    caption.textContent = `原文配图 ${index + 1}`;
    figure.append(image, caption);
    return figure;
  }));
  section.hidden = images.length === 0;
}

function renderVisual(item) {
  const visual = item.visual;
  const section = $('#visualSection');
  const data = Array.isArray(visual?.data) ? visual.data.filter((point) => Number.isFinite(Number(point.value))) : [];
  if (!visual || visual.type === 'none' || data.length < 2) {
    section.hidden = true;
    return;
  }
  $('#visualTitle').textContent = visual.titleZh || '数据图表';
  $('#visualNote').textContent = [visual.noteZh, visual.unit ? `单位：${visual.unit}` : ''].filter(Boolean).join(' · ') || '根据原文明确数字整理，不包含推测值。';
  const values = data.map((point) => Number(point.value));
  const min = Math.min(0, ...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  $('#visualChart').replaceChildren(...data.map((point) => {
    const value = Number(point.value);
    const row = document.createElement('div');
    row.className = 'visual-row';
    const label = document.createElement('span');
    label.className = 'visual-label';
    label.textContent = point.label;
    const track = document.createElement('span');
    track.className = 'visual-track';
    const fill = document.createElement('span');
    fill.className = 'visual-fill';
    fill.style.width = `${Math.max(4, ((value - min) / range) * 100)}%`;
    track.append(fill);
    const number = document.createElement('strong');
    number.className = 'visual-value';
    number.textContent = point.display || `${value}${visual.unit || ''}`;
    row.append(label, track, number);
    return row;
  }));
  const highest = data.reduce((best, point) => Number(point.value) > Number(best.value) ? point : best, data[0]);
  const lowest = data.reduce((best, point) => Number(point.value) < Number(best.value) ? point : best, data[0]);
  const difference = Number(highest.value) - Number(lowest.value);
  $('#visualInsight').textContent = visual.insightZh || (difference
    ? `从原文数字看，${highest.label}为 ${highest.display || highest.value}${visual.unit || ''}，${lowest.label}为 ${lowest.display || lowest.value}${visual.unit || ''}，相差 ${difference}${visual.unit || ''}。这里只做数值对照，不代表因果关系。`
    : '原文给出的数字接近，图表主要用于并列查看。');
  section.hidden = false;
}

function renderIntelligence(item) {
  const heat = item.heat || {};
  const history = Array.isArray(heat.history) ? heat.history : [];
  const currentHeat = Number.isFinite(Number(heat.current)) ? heat.current : item.importance;
  const peakHeat = Number.isFinite(Number(heat.peak)) ? heat.peak : currentHeat;
  $('#heatSummary').textContent = `当前估算 ${currentHeat ?? '—'} · 峰值 ${peakHeat ?? '—'}`;
  if (history.length) {
    $('#heatWindow').textContent = `从 ${formatTime(history[0].at || heat.startedAt || item.publishedAt)} 开始，到 ${formatTime(history.at(-1).at || heat.endedAt || item.publishedAt)}；第一格代表新闻发布时刻。`;
  }
  const values = history.map((point) => Number(point.value) || 0);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const valueRange = Math.max(1, maxValue - minValue);
  $('#heatChart').replaceChildren(...history.map((point) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'heat-bar-wrap';
    const bar = document.createElement('span');
    bar.className = 'heat-bar';
    bar.style.height = `${Math.max(4, 10 + ((Number(point.value || 0) - minValue) / valueRange) * 86)}%`;
    bar.title = `${point.label || formatTime(point.at)}：${point.value}（${point.reports || 0} 条报道）`;
    const label = document.createElement('small');
    label.textContent = point.label;
    wrapper.append(bar, label);
    return wrapper;
  }));
  const reports = item.reportTimeline?.length ? item.reportTimeline : (item.sources || []);
  $('#reportCount').textContent = `${reports.length} 条公开报道 · 最新在前`;
  $('#reportTimeline').replaceChildren(...reports.map((report) => {
    const row = document.createElement('article');
    row.className = 'report-row';
    const time = document.createElement('time');
    time.textContent = formatTime(report.publishedAt || item.publishedAt);
    const body = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = report.title || item.titleZh || item.titleOriginal;
    const source = document.createElement('span');
    source.textContent = report.name || '公开来源';
    body.append(title, source);
    if (report.url) {
      const link = document.createElement('a');
      link.href = report.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '原文 ↗';
      body.append(link);
    }
    row.append(time, body);
    return row;
  }));
}

function renderRelevance(item) {
  const reader = String(item.readerImpactZh || '').trim();
  const user = String(item.userImpactZh || '').trim();
  $('#readerImpactContent').textContent = reader;
  $('#userImpactContent').textContent = user;
  $('#readerImpactCard').hidden = !reader;
  $('#userImpactCard').hidden = !user;
  $('#relevanceSection').hidden = !reader && !user;
  const how = String(item.howItWorksZh || '').trim();
  addParagraphs($('#howItWorksContent'), how);
  $('#howItWorksSection').hidden = !how;
  const interpretation = String(item.interpretationZh || '').trim();
  const limitations = String(item.limitationsZh || '').trim();
  addParagraphs($('#interpretationContent'), interpretation);
  addParagraphs($('#limitationsContent'), limitations ? `边界与待核实：${limitations}` : '');
  $('#interpretationSection').hidden = !interpretation && !limitations;
}

function renderResourceLinks(item) {
  const links = [...new Set((item.resourceLinks || []).filter((url) => /^https?:\/\//i.test(url) && url !== item.originalUrl))].slice(0, 12);
  const section = $('#resourceSection');
  const container = $('#resourceLinks');
  container.replaceChildren(...links.map((url) => {
    const link = document.createElement('a');
    link.className = 'resource-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    try {
      const parsed = new URL(url);
      const path = `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, '');
      link.textContent = /(?:github|gitlab)/i.test(parsed.hostname) ? `代码仓库 · ${path}` : /\.pdf(?:$|\?)/i.test(parsed.pathname) ? `PDF 文件 · ${path}` : path;
    } catch {
      link.textContent = url;
    }
    link.append(' ↗');
    return link;
  }));
  section.hidden = links.length === 0;
}

function render(item) {
  const source = item.sources?.[0]?.name || '未知来源';
  const detail = item.detailZh || item.summaryZh || '这条新闻的中文详情尚在生成中。';
  const points = item.keyPointsZh?.length ? item.keyPointsZh : [item.summaryZh, item.importanceReasonZh].filter(Boolean);
  const impact = item.impactZh || item.importanceReasonZh || '请结合原始来源判断这条信息的实际影响。';
  const steps = Array.isArray(item.actionStepsZh) ? item.actionStepsZh : [];
  const meta = [source, categoryNames[item.category] || 'AI 动态', contentTypeNames[item.contentType] || '行业新闻', evidenceNames[item.evidenceLevel] || '待核实', `${item.importance} 分`];

  $('#articleMeta').replaceChildren(...meta.map((value, index) => {
    const span = document.createElement('span');
    span.textContent = value;
    if (index === 0) span.className = 'source';
    return span;
  }));
  $('#articleTitle').textContent = item.titleZh || item.titleOriginal;
  $('#articleLead').textContent = item.summaryZh || item.summaryOriginal;
  addParagraphs($('#detailContent'), detail);
  addTextList($('#keyPoints'), points);
  $('#keyPointsSection').hidden = points.length === 0;
  $('#impactContent').textContent = impact;
  renderRelevance(item);
  addTextList($('#actionSteps'), steps);
  $('#actionSection').hidden = steps.length === 0;
  renderSourceMedia(item);
  renderVisual(item);
  renderIntelligence(item);
  renderResourceLinks(item);
  $('#limitedNotice').hidden = item.detailCompleteness !== 'limited' && Boolean(item.detailZh);
  $('#sourceName').textContent = `来源：${source}`;
  $('#publishTime').textContent = `发布时间：${formatTime(item.publishedAt)}`;
  $('#originalLink').href = item.originalUrl;

  const tags = [...(item.models || []).map((name) => ({ name, model:true })), ...(item.topics || item.keywords || []).slice(0, 6).map((name) => ({ name, model:false }))];
  $('#articleTags').replaceChildren(...tags.map(({ name, model }) => {
    const tag = document.createElement('span');
    tag.className = `article-tag${model ? ' model' : ''}`;
    tag.textContent = name;
    return tag;
  }));

  document.title = `${item.titleZh || item.titleOriginal} · 嘟嘟的 AI 情报站`;
  const read = new Set(JSON.parse(localStorage.getItem('signal-read') || '[]'));
  read.add(item.id);
  localStorage.setItem('signal-read', JSON.stringify([...read]));
  $('#loadingState').hidden = true;
  $('#detailArticle').hidden = false;
}

function showError(message) {
  $('#loadingState').hidden = true;
  $('#errorMessage').textContent = message;
  $('#errorState').hidden = false;
}

const id = new URLSearchParams(location.search).get('id');
if (!id) {
  showError('这个链接缺少新闻编号，请从首页重新打开。');
} else {
  try {
    const response = await fetch('./data/index.json');
    if (!response.ok) throw new Error(`数据请求失败（${response.status}）`);
    const data = await response.json();
    let item = (data.items || []).find((entry) => entry.id === id);
    if (!item) {
      const archiveResponse = await fetch('./data/search.json');
      if (archiveResponse.ok) item = ((await archiveResponse.json()).items || []).find((entry) => entry.id === id);
    }
    if (!item) showError('链接可能已过期，或新闻已移出当前时间窗口。');
    else render(item);
  } catch (error) {
    showError(`暂时无法读取新闻详情：${error.message}`);
  }
}
