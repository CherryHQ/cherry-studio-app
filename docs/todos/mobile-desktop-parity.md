# Mobile Desktop Parity TODOs

Status: active

本文记录第一部分一致性修复完成后，桌面端已有但移动端尚未实现的能力。它不是桌面功能的完整镜像清单，只覆盖本轮已经确认的 Assistant、Topic、Model、Provider、Web Search 及其直接依赖。

优先级定义：

- P0：启用双端同步或导入前必须完成，否则可能产生重复数据、悬空引用或不可解释的降级。
- P1：已确认的产品能力缺口，可以独立排期。
- P2：当前架构明确排除的桌面域，需要单独立项后再迁移。

## P0: Sync And Import Contracts

### MOB-TODO-001: Assistant MCP And Knowledge Import

当前状态：MCP 已在移动端实现：`mcp_server` 主表
（`src/backend/infrastructure/db/schemas/mcpServer.ts`）、`McpServerService`、运行时
`src/backend/infrastructure/ai/mcp`（`McpService`）、管理 UI
（`src/frontend/features/settings/McpScreen/`，路由 `src/app/(tabs)/settings/mcp/`）均已落地；
`assistant_mcp_server` 关联表带双侧外键，Assistant 创建和更新 DTO 可写 `mcpServerIds`。
Knowledge 仍缺：移动端只保留 `assistant_knowledge_base` 关联表（无 Knowledge 侧外键），能读取并
原样保留已有关系 ID，DTO 不允许写入；没有 Knowledge Base 主表、Service、运行时或管理 UI。

完成条件：

- 定义独立的同步或导入接口，不通过 `CreateAssistantDto`、`UpdateAssistantDto` 写关系。
- 导入时校验目标实体，或定义目标实体尚未同步时的暂存与补偿规则。
- 主域迁移后补齐目标侧 FK，并在加约束前清理历史悬空关系。
- 无关 Assistant 更新继续保证关系数据不丢失。

依赖：MOB-TODO-012 中的 Knowledge 主域迁移。

### MOB-TODO-002: Default Assistant Deduplication

当前状态：桌面端和移动端都会在 fresh install 创建各自的持久化默认 Assistant。双端数据尚未同步，因此目前把它们视为普通 bootstrap 数据。

完成条件：

- 定义同步身份，不依赖两端随机生成的 UUID 相同。
- 确定首次合并时保留、合并或隐藏重复默认 Assistant 的规则。
- 同时处理默认 Assistant 自带的空 Topic 和 root Message，避免生成重复空会话。
- 添加双端各自已 seed 后再首次同步的集成测试。

## P1: Assistant And Topic

### MOB-TODO-003: Physical Topic Duplication

当前状态：移动端不接受 `CreateTopicDto.sourceNodeId`，新 Topic 的 `activeNodeId` 固定为 `null`。移动端没有桌面端的物理复制式分支 API。

完成条件：

- 新增独立的 Topic duplicate/copy API，而不是恢复跨 Topic 的 `sourceNodeId` 引用。
- 在一个事务中复制所需 Message 路径并重建 parent 关系。
- 新 Topic 拥有自己的唯一 root Message，所有 Message 必须归属新 Topic。
- 覆盖复制失败回滚、软删除消息、附件和分支 active node 测试。

### MOB-TODO-004: Assistant Management Parity

当前状态：移动端没有桌面端完整的 Assistant 搜索、排序/增量列表过滤，以及删除 Assistant 时可选级联删除 Topic 的能力。

完成条件：

- 增加 Assistant 实体搜索。
- 按产品需要补充 `sortBy`、`sortOrder`、`updatedAtFrom` 等列表参数。
- 明确删除 Assistant 时 Topic 的保留、解绑或级联删除交互，并把选择传入事务化 Service API。
- 保持所有排序和定位只作用于 `deleted_at IS NULL` 行。

## P1: Model And Provider

### MOB-TODO-005: Model Editing And User Overrides

当前状态：移动端 ModelService 支持读取、创建、批量创建和 reconcile，但没有桌面端完整的单项更新、批量更新、单项删除、批量删除和通用 batch upsert。`userOverrides` 在移动端尚未形成完整的写入记账流程。

完成条件：

- 实现 Model 更新、删除和批量操作，并保持 provider scope、默认模型保护和 pin 清理语义。
- 用户修改 registry 可补全字段时，正确维护 `userOverrides`。
- registry enrichment 不覆盖用户已落库的 reasoning、pricing、limits 等字段。
- 为大批量查询和写入提供 SQLite bind 参数上限测试。

### MOB-TODO-006: Provider Management Parity

当前状态：移动端没有桌面端完整的 Provider 排序、专用 add-api-key 流程和 endpoint type 列表过滤。移动端 `batchUpsert` 会为 preset provider 回填 catalog 更新，这一行为暂时有意保留。

完成条件：

- 根据移动端设置页工作流补齐 Provider 排序和 API key 添加能力。
- 在确有调用方需要时增加 endpoint type 过滤。
- 保持 endpoint config、adapter family 和 API key 轮换语义与桌面共享契约兼容。

待桌面确认：桌面 `ProviderService.batchUpsert` 的 insert-only 行为是否有意。确认前不要删除移动端 catalog 回填。

### MOB-TODO-007: CherryAI Managed Provider Policy

当前状态：移动端支持 CherryAI 请求签名，但没有桌面端的托管 Provider 写保护，也没有等价的开箱默认模型播种策略。

完成条件：

- 产品接入 CherryAI 登录、免费额度或托管 catalog 时，定义哪些 Provider 字段禁止普通更新和删除。
- 确定 fresh install 是否启用 CherryAI，以及默认模型如何与 `chat.default_model_id` 协同。
- 为受保护更新、删除、seeding 和无效默认模型回退增加测试。

待桌面确认：desktop registry 忽略 `override.pricing` 是否为缺陷。确认前继续保留移动端 pricing override 优先合并。

## P1: Web Search

### MOB-TODO-008: Unsupported Search Provider Drivers

当前状态：`firecrawl`、`exa-mcp`、`fetch` ID 会被持久化并保留，但移动端 registry 使用 `UnsupportedProvider`，设置页不会把它们展示为可选 provider。

完成条件：

- 分别实现所需 provider driver、认证、override schema 和错误分类。
- 在 driver 可用前继续保留原 ID，不得静默映射或清空同步值。
- 增加设置页可见性、匿名/鉴权请求、临时错误和永久配置错误测试。

### MOB-TODO-009: Web Fetch Tool And Fetch Settings

当前状态：移动端没有 `web_fetch` 工具。`chat.web_search.default_fetch_urls_provider` preference 和 provider capability 仍保留，但默认 fetch provider 选择器已隐藏。

完成条件：

- 定义并实现移动端 `web_fetch` 工具契约、URL 校验、超时、取消和结果裁剪。
- 接入 `WebSearchService.fetchUrls`，并与 provider-native URL context 明确区分。
- 只有工具端到端可用后才恢复默认 fetch provider 选择器。
- 覆盖未配置 provider、Unsupported provider、部分失败和恶意 URL 测试。

### MOB-TODO-010: Web Search Settings Parity

当前状态：黑名单过滤逻辑已存在，但移动端没有编辑 excluded domains 的 UI。同步进来的黑名单会生效，却无法在移动端查看或修改。

完成条件：

- 提供黑名单列表、匹配模式和正则表达式编辑 UI。
- 在保存前复用运行时校验，清楚标识无效规则。
- 支持删除、重排或禁用规则，并覆盖同步值的可见性测试。

### MOB-TODO-011: Provider Depth And Regional Routing

当前状态：Jina 已支持匿名 search/reader，但没有桌面端的中国大陆 API host 路由。移动端 Searxng 只使用搜索摘要，没有桌面端的 engine discovery 和结果正文抓取深度。

完成条件：

- 为 Jina 定义地区选择或可靠的 host fallback，覆盖 search 和 reader。
- 为 Searxng 增加 engine discovery；如要抓正文，先确定 React Native 可用的解析方案、并发上限和超时预算。
- 保持 `cutoff_limit` 的 token 单位，并在正文抓取后继续执行黑名单和 token 裁剪。

## P2: Desktop Domains Not Migrated

### MOB-TODO-012: Deferred Desktop Runtime Domains

当前状态：移动端架构明确没有迁移以下完整桌面域：Agent Session、Knowledge、Job、Translate、
Miniapp 和 Agent Workspace。当前存在的类型、消息部件或 Assistant 关联 ID 只用于兼容，不代表
对应业务已实现。MCP 已落地（见 MOB-TODO-001 的证据路径）；Painting 已存在
（`PaintingService`、`src/backend/infrastructure/db/schemas/painting.ts`、`src/app/paintings/`
路由）；File 部分落地（`FileEntryService`、
`src/backend/infrastructure/db/schemas/file.ts`、`fileRelations.ts`），尚非完整桌面 File 域。

完成条件：每个域单独建立 PRD 和 ADR，明确 schema、Service、同步边界、移动端运行时限制、权限、离线行为和 UI 后再实施。不要把这些域作为一次数据层对齐的附带工作整体迁入。

## Confirm Before Implementation

以下问题需要桌面端确认，但不阻塞当前移动端运行：

- Desktop `ProviderService.batchUpsert` 是否有意保持 insert-only。
- Desktop registry 忽略 `override.pricing` 是否为缺陷。
- Desktop agent 参数链路未传外部搜索 provider ID 是否为漏接线；当前移动端采用外部与内建搜索互斥，OpenRouter 内建搜索模型和 sonar 强制使用内建搜索。

## Intentional Differences, Not TODOs

以下行为已在本轮确定，不应作为缺口回滚：

- 通用 Assistant DTO 不写 Knowledge 关系；未来使用独立导入接口。
- `CreateTopicDto` 不接受 `sourceNodeId`；未来使用物理复制 API。
- 持久化 `user_model` 不保存 `ownedBy`。
- fresh DB 的 search/fetch 默认 provider 保持 `null`。
- Unsupported provider ID 保留原值并返回永久配置错误。
- Assistant settings 保持 passthrough，以读取桌面端未来新增字段。
