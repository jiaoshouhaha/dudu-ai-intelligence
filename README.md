# SIGNAL/AI

每小时自动收集全球 AI 新闻的中文个人情报站。它会抓取公开 RSS、合并重复报道、把标题与摘要翻译为中文，并生成透明的重要度评分。页面只展示中文内容，每条新闻保留原始来源链接。

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

## 可选 AI 增强

复制 `.env.example` 中的变量到你自己的环境。程序使用兼容 OpenAI Chat Completions 的接口，推荐国内可访问的阿里云百炼按量 API：

```bash
export AI_API_KEY="你的密钥"
export AI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export AI_MODEL="qwen-flash"
pnpm fetch
```

不要把真实密钥写进 `.env.example` 或提交到 Git。

## GitHub 每小时更新

`.github/workflows/update-news.yml` 会在每小时第 17 分钟运行，也支持从 Actions 页面手动触发。

启用 AI 增强时，在仓库设置中添加：

- Actions Secret：`AI_API_KEY`
- Actions Variable：`AI_BASE_URL`
- Actions Variable：`AI_MODEL`
- 可选 Actions Variable：`AI_DAILY_LIMIT`

不添加任何变量时，工作流仍会使用规则评分正常更新。

## 数据与隐私

- `data/news/YYYY-MM-DD.json`：日期分片
- `data/index.json`：首页索引
- `data/search.json`：一年内搜索数据
- `data/trends.json`：趋势汇总
- `data/status.json`：来源健康状态

网站只展示 RSS 提供的元数据与中文短摘要，并始终链接原文。收藏和已读状态只保存在浏览器本地。
