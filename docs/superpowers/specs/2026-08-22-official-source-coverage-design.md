# 官方信源补全与重要新闻漏抓修复设计

日期：2026-08-22

## 背景

当前自动抓取共配置 20 个来源。最近一次任务中，旧 Microsoft Blog RSS `https://blogs.microsoft.com/feed/` 被 Cloudflare 挑战拦截并返回 HTTP 403，因此页面显示“1 个来源暂时失败”。同时出现两类重要内容覆盖不足：

- OpenAI Developer Blog 发布的 “Codex as a platform: build on the open agent harness” 没有进入站点。现有 OpenAI 来源只读取 `openai.com/news/rss.xml`，并不覆盖 Developer Blog。
- Anthropic 关于内部 AI 培训体系的文章已经通过 AI HOT 聚合源进入站点，但没有直接监控 Claude / Anthropic 官方博客，标题也没有突出“开放内部 AI 培训体系”，导致用户难以识别其核心价值。

这不是 DeepSeek API 是否调用的问题，而是发现层没有覆盖相应官方发布入口。DeepSeek 负责翻译、整理和判断，前提是抓取器先发现文章。

## 目标

在不增加付费新闻 API 的前提下，补齐官方网页来源、修复失效 RSS，并让同一事件优先保留更完整、更权威的版本。

成功标准：

- Microsoft 来源恢复正常，不再因旧 RSS 的 403 使任务持续告警。
- OpenAI Developer Blog 新文章可以在下一轮扫描中被发现，包括 Codex Harness、SDK、Agent 工程方法等非新闻中心内容。
- Claude / Anthropic Blog 新文章可以被直接发现，包括产品、教育、使用方法和内部实践公开内容。
- “Codex 开源 Harness” 被补录，并链接到 OpenAI 官方文章。
- Anthropic 文章标题调整为突出内部培训体系，正文准确说明 Claude Academy、4D AI Fluency Framework 及其与内部员工入职培训的关系。
- 同一事件同时来自官方网页和聚合源时只展示一条，保留官方链接，并吸收信息更完整版本的摘要、标签和相关入口。
- 任一新增网页解析器失败时，不影响其他来源继续抓取；状态页能显示具体失败来源与原因。

## 方案选择

采用“官方网页直连 + RSS + 聚合源兜底”的混合方案。

相比只依赖聚合网站，该方案更及时、权威，能保留一手链接；相比只监控 RSS 和 GitHub Releases，它可以覆盖没有 RSS、也不属于软件版本发布的博客内容。AI HOT 继续承担补充发现和交叉验证作用，但不再是 OpenAI Developer Blog 与 Claude Blog 的唯一入口。

## 信源调整

### Microsoft

将现有 `microsoft-ai` 来源从旧的 Blogs RSS 替换为 Microsoft Source 的 AI 专题 RSS：

`https://news.microsoft.com/source/topics/ai/feed/`

保留来源 ID 以避免历史数据和状态统计断裂，显示名称调整为“Microsoft Source AI”。该地址为标准 RSS，当前可直接返回内容，不需要绕过 Cloudflare。

### OpenAI Developer Blog

新增高优先级官方网页来源，监控 OpenAI Developer Blog 的文章索引。首个需要补录的官方文章为：

`https://learn.chatgpt.com/blog/codex-as-a-platform`

来源解析优先读取页面中的结构化数据和文章元信息，包括 canonical URL、标题、发布时间、摘要及文章链接；不依赖屏幕位置、颜色或容易变化的展示型 CSS 类名。

该来源用于发现 Codex、API、Agents、SDK、开发工具和工程实践文章。分类由文章标题、摘要和结构化标签决定，不把整个来源强制归入单一栏目。

### Claude / Anthropic Blog

新增高优先级官方网页来源，监控 Claude Blog 文章列表及文章结构化元信息。首个需要校正的官方文章为：

`https://claude.com/blog/anthropics-approach-to-teaching-and-learning-ai`

官方标题可以保存在原文字段中，站内中文标题采用用户确认的表达：

“Anthropic 开放内部 AI 培训体系，Claude Academy 面向公众上线”

摘要需要明确区分事实与解读：Anthropic 将借鉴内部员工培训的方法通过 Claude Academy 对外提供，内容包含 4D AI Fluency Framework、持续学习和入职培训经验；不得夸大为完整公开全部内部机密资料。

## 解析器架构

现有抓取管线只区分 RSS / Atom 与 `aihot-json`。本次为来源增加显式 `format`，由抓取管线按格式分派到独立适配器：

- `rss`：继续使用现有 Feed 解析器。
- `aihot-json`：继续使用现有 AI HOT 适配器。
- `openai-developer-html`：解析 OpenAI Developer Blog 索引和文章元信息。
- `claude-blog-html`：解析 Claude Blog 索引和文章元信息。

网页适配器输出与 RSS 相同的标准候选结构：来源 ID、原文标题、URL、发布时间、摘要、作者和发现时间。后续的时效过滤、DeepSeek 整理、分类、去重与数据写入继续复用现有流程。

每个适配器独立捕获解析错误。若页面结构改变，任务状态记录来源 ID、HTTP 状态或“未找到有效文章”的明确错误，其余来源仍然完成。

为减少网页结构变化造成的维护成本，解析优先级为：

1. JSON-LD / 页面内结构化数据。
2. canonical、Open Graph、`time` 等语义化元信息。
3. 已限定在文章列表区域内的链接规则。

不会使用浏览器截图识别，也不会尝试绕过登录、验证码或反爬挑战。

## 补录与标题校正

实施完成后运行一次受控补录：

1. 将 Codex Harness 官方文章作为候选交给现有 DeepSeek 整理流程，生成中文标题、摘要、价值说明、分类与标签。
2. 将已经存在的 Anthropic 教学文章与官方 URL 对齐，按确认后的 B 方案更新站内中文标题；若聚合源版本与官方版本并存，则合并为同一事件。
3. 重新生成当天新闻索引、搜索索引、主题索引、归档与状态数据。

补录只处理明确指定的漏抓文章，不伪造发布时间，也不批量重写其他历史新闻。

## 权威来源优先与重复处理

候选进入现有去重流程时增加来源权威信号：

1. 官方发布、官方博客或作者原文。
2. 权威媒体及具有独立信息的实测文章。
3. 聚合转载或二次摘要。

同一 canonical URL 必须直接合并。不同 URL 但标题实体、版本号、发布时间窗口和核心事件高度一致时进入事件级去重。保留规则为：

- 主记录优先采用官方 URL、官方发布时间和官方来源名。
- 中文内容优先保留事实更完整、信息密度更高的版本。
- 聚合报道若提供官方文章没有的可靠背景，可作为交叉验证和补充链接，不再单独占据时间线。
- 不能确定是否为同一事件时不强行合并，避免误删不同阶段的后续进展。

## 调度与成本

新增来源沿用现有约每 30 分钟的 GitHub Actions 扫描，无需新的定时服务。抓取网页本身不产生 DeepSeek 费用；只有发现未处理的新候选后，才调用 DeepSeek 进行中文整理。

同一 canonical URL、内容指纹或事件指纹已经处理过时跳过 API 调用。这样既避免重复新闻，也避免对相同文章反复扣费。

## 测试与验收

自动测试覆盖：

- Microsoft 新 RSS 可以解析出至少一条带标题、URL 和时间的候选。
- OpenAI Developer Blog 固定页面样本能解析 Codex Harness 文章。
- Claude Blog 固定页面样本能解析 Anthropic 教学文章。
- 网页适配器返回统一候选结构，管线能继续执行时效过滤和整理。
- 单个网页适配器抛错时，其他来源结果仍被写入，状态中准确记录失败来源。
- 官方文章与 AI HOT 的同事件副本被合并，主记录保留官方链接。
- 已处理文章在后续轮次不再次调用 DeepSeek。
- Anthropic 站内标题使用确认后的 B 方案，原始官方标题仍保留在数据中。

发布前执行完整单元测试、项目检查和一次实时抓取烟雾测试。验收时检查：

- 页面不再显示 Microsoft 来源失败。
- 两条指定新闻都能在首页搜索到并打开中文详情页。
- “查看原文”分别指向 OpenAI 与 Claude 官方文章。
- GitHub Actions 最近一次定时任务成功，来源统计与页面状态一致。

## 风险与回退

- 官方博客 HTML 结构可能变化：使用固定网页样本测试，解析失败时只标记单源故障，AI HOT 仍作兜底。
- 网页文章可能没有可靠发布时间：优先使用结构化发布时间；缺失时不把抓取时间冒充发布时间，并降低其“最新”排序可信度。
- 官方与媒体报道信息量不同：合并时保留补充链接和来源说明，不把未经官方证实的信息写成事实。
- 新来源造成候选数量上升：继续使用时间窗口、canonical 去重和事件去重，只让真正的新文章进入 DeepSeek。

若新增网页适配器在生产环境连续失败，可单独禁用该来源并保留 Microsoft RSS 替换和既有聚合源，不影响其余自动抓取系统。
