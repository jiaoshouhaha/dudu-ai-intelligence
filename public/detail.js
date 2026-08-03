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
  addTextList($('#actionSteps'), steps);
  $('#actionSection').hidden = steps.length === 0;
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
    const item = (data.items || []).find((entry) => entry.id === id);
    if (!item) showError('链接可能已过期，或新闻已移出当前时间窗口。');
    else render(item);
  } catch (error) {
    showError(`暂时无法读取新闻详情：${error.message}`);
  }
}
