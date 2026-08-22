# SIGNAL/AI

每约 30 分钟自动收集全球 AI 新闻。发现层同时读取公开 RSS、OpenAI Developer Blog、Claude Blog 与 AI HOT 补充源；只有发现尚未处理的新文章后，才调用 DeepSeek 生成中文整理。

站点会合并重复报道、生成透明的重要度评分，并优先保留官方来源链接。页面只展示中文内容，每条新闻保留原始来源链接。

## 本地运行

需要 Node.js 20+ 与 pnpm。

```bash
pnpm install
pnpm fetch
pnpm serve
```

浏览器打开 `http://127.0.0.1:4173`。

没有新闻源网络或只是预览界面时：

```bash
pnpm fetch:fixture
pnpm serve
```

## 中文翻译

默认使用无需密钥的英中翻译回退，翻译结果会写入数据文件，已经翻译的新闻不会重复请求。翻译失败的新事件不会进入中文首页。

如需替换翻译服务，可设置：

```bash
export TRANSLATION_BASE_URL="兼容端点"
```

## 可选 DeepSeek 增强

复制 `.env.example` 中的变量到你自己的环境。DeepSeek V4 Flash 会生成中文标题、摘要、分类、关键词和重要度理由：

```bash
export DEEPSEEK_API_KEY="你的密钥"
export DEEPSEEK_BASE_URL="https://api.deepseek.com"
export DEEPSEEK_MODEL="deepseek-v4-flash"
pnpm fetch
```

不要把真实密钥写进 `.env.example` 或提交到 Git。

## GitHub 自动更新

`.github/workflows/update-news.yml` 使用 `2,32 * * * *`，约每 30 分钟扫描一次，也支持从 Actions 页面手动触发。GitHub cron 为尽力执行，可能出现少量排队延迟。

启用 DeepSeek 增强时，在仓库设置中添加：

- Actions Secret：`DEEPSEEK_API_KEY`
- Actions Variable：`DEEPSEEK_BASE_URL`
- Actions Variable：`DEEPSEEK_MODEL`
- 可选 Actions Variable：`DEEPSEEK_DAILY_LIMIT`

不添加任何变量时，工作流仍会使用规则评分正常更新。

## 信源健康检查

只检查来源能否抓取和解析，不写入新闻数据，也不调用 DeepSeek：

```bash
pnpm check:sources -- --only microsoft-ai,openai-developer,claude-blog
```

## 数据与隐私

- `data/news/YYYY-MM-DD.json`：最近一次滚动快照
- `data/index.json`：最近 240 条首页索引
- `data/search.json`：最近 180 天搜索数据
- `data/archive.json`：按月份和北京时间日期组织的六个月归档索引
- `data/seen.json`：最近 7 天已见事件 ID，用于跨运行去重
- `data/trends.json`：趋势汇总
- `data/status.json`：来源健康状态

网站只展示 RSS 提供的元数据与中文短摘要，并始终链接原文。收藏和已读状态只保存在浏览器本地。

页面展示最近 180 天发布的新闻，并标注原始发布时间。即使昨天发布的内容今天才进入来源，也能进入滚动窗口。新闻退出页面后，其事件 ID 仍保留 7 天，避免再次翻译或重复发布。GitHub Actions 默认每 30 分钟扫描一次，云端 cron 可能有少量延迟。
