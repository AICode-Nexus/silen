# 翻译分析

## 文档定位

- 类型：Silen 产品与工程架构设计规范。
- 领域：静态文档生成、站内检索、CLI、MCP、CI 与无模型 AI 能力。
- 目标读者：Silen 维护者、开发者、设计评审者。
- 原文语气：规范性、克制、可验收；大量使用 `must`、`will not` 与明确边界。
- 翻译策略：保留全部章节、编号、命令、路径、JSON 字段和约束强度；中文采用技术文档表达，不增加解释性内容。

## 核心术语

| 英文 | 统一译法 |
| --- | --- |
| model-free | 无模型 |
| AI quality loop | AI 质量闭环 |
| retrieval quality gate | 检索质量门禁 |
| production search index | 生产搜索索引 |
| evaluation suite | 评测集 |
| evaluation runner | 评测运行器 |
| audit | 审计 |
| eval / evaluation | 评测 |
| top-K | Top K |
| ranked result | 排序结果 |
| diagnostic score | 诊断分数 |
| source of truth | 事实来源 |
| workspace cache | 工作区缓存 |
| read-only | 只读 |
| blocking issue | 阻断问题 |
| non-blocking notice | 非阻断提示 |
| side effect | 副作用 |
| setup failure | 运行前置错误 |
| Ask AI | Ask AI |
| Agent Contract | Agent Contract |
| MCP | MCP |
| CI | CI |

## 保留规则

- `Silen`、`Ask AI`、`Agent Contract`、`MCP`、`CI`、`MiniSearch` 保留英文产品或技术名称。
- 命令、代码、文件路径、JSON 键名、退出码和版本号不得翻译。
- `route` 在正文中译为“路由”，JSON 字段 `route` 保持不变。
- `heading` 在正文中根据语境译为“章节标题”，JSON 字段 `heading` 保持不变。
- `issues` 与 `notices` 在描述数据结构时保留字段名，并分别解释为阻断问题与非阻断提示。
- `must` 保持为强制要求，“will not”保持为明确不做事项。

## 理解重点

1. “无模型”是默认完整能力，不是 Ask AI 不可用时的降级方案。
2. 评测对象必须是读者实际使用的 `search-index.json`，不能换成 `ai-index.json` 或 MCP 工作区搜索。
3. 分数仅用于诊断，是否通过由预期路由及可选章节标题在 Top K 中出现决定。
4. 直接 CLI 审计和 MCP 预检具有不同的配置执行信任边界。
5. `.silen/ai/index.json` 是可选缓存，缺失或过期不能再阻断发布。
6. Ask AI 始终是独立的可选端点能力；未配置时不显示控件，也不打包客户端代码。
