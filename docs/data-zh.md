# 数据结构文档

本文档全面概述了 Cherry Studio App 中使用的数据结构，按存储类型组织。

## 目录

- [Preference 系统（偏好设置）](#preference-系统偏好设置)
- [Topic 系统（对话话题管理）](#topic-系统对话话题管理)
- [Assistant 系统（AI 助手管理）](#assistant-系统ai-助手管理)
- [Provider 系统（LLM 服务提供商管理）](#provider-系统llm-服务提供商管理)
- [MCP 系统（Model Context Protocol 管理）](#mcp-系统model-context-protocol-管理)
- [WebSearch Provider 系统（网页搜索提供商管理）](#websearch-provider-系统网页搜索提供商管理)
- [Redux Store 结构](#redux-store-结构)
- [SQLite 数据库架构](#sqlite-数据库架构)
- [数据关系](#数据关系)
- [存储考虑](#存储考虑)

---

## Preference 系统（偏好设置）

Cherry Studio 使用基于 SQLite 的 PreferenceService 管理所有用户配置和应用状态。这是一个高性能、类型安全的解决方案，取代了部分 Redux store。

### 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
└───────────────┬─────────────────────────────────────────────┘
                │ usePreference() hooks
                │ (useSyncExternalStore)
                ▼
┌─────────────────────────────────────────────────────────────┐
│               PreferenceService (Singleton)                  │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ Lazy Cache   │ Subscribers  │ Request Queue           │  │
│  │ Map<K, V>    │ Map<K, Set>  │ Map<K, Promise<void>>   │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
│         │                                                     │
│         │ Optimistic Updates with Rollback                   │
│         ▼                                                     │
└─────────────────────────────────────────────────────────────┘
                │
                │ Drizzle ORM
                ▼
┌─────────────────────────────────────────────────────────────┐
│          SQLite Database (preference table)                  │
│   ┌────────┬──────────┬─────────────┬────────────────┐      │
│   │ key    │ value    │ description │ updated_at     │      │
│   ├────────┼──────────┼─────────────┼────────────────┤      │
│   │ TEXT   │ JSON     │ TEXT        │ INTEGER        │      │
│   └────────┴──────────┴─────────────┴────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### PreferenceService 特性

#### 1. **懒加载（Lazy Loading）**

- 首次访问时才从数据库加载
- 减少应用启动时间
- 降低内存占用

#### 2. **乐观更新（Optimistic Updates）**

- UI 立即更新，无需等待数据库写入
- 后台异步同步到 SQLite
- 失败时自动回滚

#### 3. **请求队列（Request Queue）**

- 序列化同一 key 的更新操作
- 防止竞态条件
- 保证数据一致性

#### 4. **React 18 集成**

- 基于 `useSyncExternalStore`
- 完美支持并发渲染
- 自动订阅/取消订阅

#### 5. **类型安全**

- 基于 TypeScript 的类型推断
- 根据 key 自动推导 value 类型
- 编译时类型检查

### Preference 表结构

```sql
CREATE TABLE preference (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT,                      -- JSON 格式存储
  description TEXT,                -- 字段说明
  created_at INTEGER,              -- 创建时间戳
  updated_at INTEGER               -- 更新时间戳
);
```

### Preference 项目定义

应用中共有 **10 个** preference 项，分为 5 个类别：

#### 用户配置（User Configuration）

```typescript
{
  'user.avatar': string              // 用户头像图片路径或 URL
  'user.name': string                // 用户显示名称
  'user.id': string                  // 唯一用户标识符（UUID）
}
```

**默认值：**

- `user.avatar`: `''` (空字符串)
- `user.name`: `'Cherry Studio'`
- `user.id`: 自动生成 UUID

#### UI 配置（UI Configuration）

```typescript
{
  'ui.theme_mode': ThemeMode         // 应用主题模式
}

enum ThemeMode {
  light = 'light',    // 浅色主题
  dark = 'dark',      // 深色主题
  system = 'system'   // 跟随系统
}
```

**默认值：**

- `ui.theme_mode`: `ThemeMode.system`

#### Topic 状态（Topic State）

```typescript
{
  'topic.current_id': string         // 当前活跃的对话话题 ID
}
```

**默认值：**

- `topic.current_id`: `''` (空字符串，表示无活跃话题)

#### WebSearch 配置（Web Search Configuration）

```typescript
{
  'websearch.search_with_time': boolean           // 在搜索查询中添加当前日期
  'websearch.max_results': number                 // 最大搜索结果数量 (1-20)
  'websearch.override_search_service': boolean    // 覆盖默认搜索服务设置
  'websearch.content_limit': number | undefined   // 搜索结果内容长度限制（字符数）
}
```

**默认值：**

- `websearch.search_with_time`: `true`
- `websearch.max_results`: `5`
- `websearch.override_search_service`: `true`
- `websearch.content_limit`: `2000`

#### App 状态（App State）

```typescript
{
  'app.initialized': boolean         // 应用是否已完成首次初始化
  'app.initialization_version': number // 应用数据初始化的当前版本
}
```

**默认值：**

- `app.initialized`: `false`
- `app.initialization_version`: `0`

### 使用方法

#### 基础用法

```typescript
import { usePreference } from '@/hooks/usePreference'

function ThemeSettings() {
  const [theme, setTheme] = usePreference('ui.theme_mode')

  return (
    <Select
      value={theme}
      onChange={(newTheme) => setTheme(newTheme)}
    />
  )
}
```

#### 批量操作

```typescript
import { useMultiplePreferences } from '@/hooks/usePreference'

function UserProfile() {
  const preferences = useMultiplePreferences([
    'user.avatar',
    'user.name',
    'ui.theme_mode'
  ])

  const { values, setters, isLoading } = preferences

  return (
    <div>
      <Avatar src={values['user.avatar']} />
      <Input
        value={values['user.name']}
        onChange={(e) => setters['user.name'](e.target.value)}
      />
    </div>
  )
}
```

#### 非 React 上下文使用

```typescript
import { preferenceService } from '@/services/PreferenceService'

// 同步读取（从缓存）
const theme = preferenceService.getCached('ui.theme_mode')

// 异步读取（懒加载）
const theme = await preferenceService.get('ui.theme_mode')

// 更新值（乐观更新）
await preferenceService.set('ui.theme_mode', 'dark')
```

#### 专用 Hooks

应用提供了多个专用 hooks 以简化常见用例：

```typescript
// 用户设置
import { useSettings } from '@/hooks/useSettings'
const { avatar, userName, userId, theme, setAvatar, setUserName, setTheme } = useSettings()

// App 状态
import { useAppState } from '@/hooks/useAppState'
const { initialized, welcomeShown, setInitialized, setWelcomeShown } = useAppState()

// WebSearch 设置
import { useWebsearch } from '@/hooks/useWebsearch'
const { searchWithTime, maxResults, setMaxResults } = useWebsearch()

// Topic 状态
import { useCurrentTopic } from '@/hooks/useTopic'
const { currentTopicId, setCurrentTopicId } = useCurrentTopic()
```

### 数据持久化流程

#### 读取流程

```
1. usePreference('key') 调用
   ↓
2. 检查 PreferenceService 缓存
   ↓
3. 缓存命中？
   ├─ 是 → 返回缓存值
   └─ 否 → 从 SQLite 加载
              ↓
          存入缓存
              ↓
          返回值
```

#### 写入流程

```
1. setPreference(newValue) 调用
   ↓
2. 保存旧值（用于回滚）
   ↓
3. 立即更新缓存（乐观更新）
   ↓
4. 通知所有订阅者（UI 更新）
   ↓
5. 异步写入 SQLite
   ├─ 成功 → 完成
   └─ 失败 → 回滚缓存
              ↓
          通知订阅者
              ↓
          抛出错误
```

### 性能优化

1. **懒加载**：只加载使用的 preference，避免一次性加载所有配置
2. **内存缓存**：已加载的值保存在内存中，避免重复数据库查询
3. **请求队列**：合并同一 key 的并发更新，减少数据库写入次数
4. **乐观更新**：UI 立即响应，不等待数据库操作完成

### 类型定义

完整类型定义位于 `src/shared/data/preference/preferenceTypes.ts`：

```typescript
export interface PreferenceSchemas {
  default: {
    // User Configuration
    'user.avatar': string
    'user.name': string
    'user.id': string

    // UI Configuration
    'ui.theme_mode': ThemeMode

    // Topic State
    'topic.current_id': string

    // Web Search Configuration
    'websearch.search_with_time': boolean
    'websearch.max_results': number
    'websearch.override_search_service': boolean
    'websearch.content_limit': number | undefined

    // App State
    'app.initialized': boolean
    'app.initialization_version': number
  }
}

export type PreferenceKeyType = keyof PreferenceSchemas['default']
```

---

## Topic 系统（对话话题管理）

Cherry Studio 使用 TopicService 管理所有对话话题（topics），采用与 PreferenceService 类似的架构设计，提供高性能、类型安全的话题管理解决方案。

### 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
└───────────────┬─────────────────────────────────────────────┘
                │ useCurrentTopic() / useTopic(id) hooks
                │ (useSyncExternalStore)
                ▼
┌─────────────────────────────────────────────────────────────┐
│               TopicService (Singleton)                       │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ Current      │ LRU Cache    │ All Topics Cache        │  │
│  │ Topic        │ (5 topics)   │ (TTL: 5min)            │  │
│  │ Cache (1)    │ Map<id, T>   │ Map<id, Topic>         │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ Subscribers  │ Request Queue│ Load Promises           │  │
│  │ Map<id, Set> │ Map<id, Prom>│ Map<id, Promise>        │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
│         │                                                     │
│         │ Optimistic Updates with Rollback                   │
│         ▼                                                     │
└─────────────────────────────────────────────────────────────┘
                │
                │ Drizzle ORM
                ▼
┌─────────────────────────────────────────────────────────────┐
│          SQLite Database (topics table)                      │
│   ┌────────┬──────────┬─────────┬─────────┬──────────┐      │
│   │ id     │assistant │ name    │created  │updated   │      │
│   │        │_id       │         │_at      │_at       │      │
│   ├────────┼──────────┼─────────┼─────────┼──────────┤      │
│   │ TEXT   │ TEXT     │ TEXT    │ INTEGER │ INTEGER  │      │
│   └────────┴──────────┴─────────┴─────────┴──────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### TopicService 特性

#### 1. **三层缓存策略**

**当前主题缓存（Current Topic Cache）**

- 存储当前活跃的话题
- 最高优先级，永不驱逐
- 与 `preference: topic.current_id` 同步

**LRU 缓存（Least Recently Used Cache）**

- 存储最近访问的 5 个话题
- 使用 LRU 算法自动驱逐最旧项
- 访问时更新顺序
- 切换主题时自动管理

**所有话题缓存（All Topics Cache）**

- 缓存所有话题列表
- 5 分钟 TTL（生存时间）
- 用于话题列表显示
- 支持强制刷新

#### 2. **乐观更新（Optimistic Updates）**

- 所有 CRUD 操作立即更新缓存
- UI 零延迟响应
- 后台异步同步到 SQLite
- 失败时自动回滚所有缓存

#### 3. **智能缓存管理**

```typescript
// 访问话题的缓存查找顺序
getTopic(topicId) 流程：
1. 检查是否是当前主题 → 从 currentTopicCache 返回（最快）
2. 检查 LRU 缓存 → 从 topicCache 返回（快）
3. 检查是否正在加载 → 等待进行中的加载
4. 从数据库加载 → 加入 LRU 缓存并返回（慢）
```

```typescript
// 切换主题的缓存管理
switchToTopic(topicId) 流程：
1. 使用 getTopic(topicId) 获取新主题（利用缓存）
2. 将旧的当前主题移入 LRU 缓存
3. 从 LRU 缓存移除新主题（避免重复）
4. 更新 currentTopicCache
5. 同步到 preference: topic.current_id
```

#### 4. **订阅系统（Subscription System）**

支持四种订阅类型：

- **当前主题订阅**：`subscribeCurrentTopic()` - 监听当前活跃主题变化
- **特定主题订阅**：`subscribeTopic(id)` - 监听指定主题的变化
- **全局订阅**：`subscribeAll()` - 监听所有主题变化
- **列表订阅**：`subscribeAllTopics()` - 监听主题列表变化

#### 5. **并发控制（Concurrency Control）**

**请求队列（Request Queue）**

- 序列化同一主题的更新操作
- 防止竞态条件
- 保证数据一致性

**加载去重（Load Deduplication）**

- 跟踪进行中的加载操作
- 防止重复加载同一主题
- 共享加载 Promise

#### 6. **React 18 深度集成**

- 基于 `useSyncExternalStore`
- 完美支持并发渲染
- 自动订阅/取消订阅
- 零 re-render 开销

### 使用方法

#### 当前主题管理

```typescript
import { useCurrentTopic } from '@/hooks/useTopic'

function ChatScreen() {
  const {
    currentTopic,        // 当前主题对象
    currentTopicId,      // 当前主题 ID
    isLoading,          // 加载状态
    switchTopic,        // 切换主题
    createNewTopic,     // 创建新主题
    renameTopic,        // 重命名主题
    deleteTopic         // 删除主题
  } = useCurrentTopic()

  const handleSwitchTopic = async (topicId: string) => {
    await switchTopic(topicId)  // 乐观更新，立即切换
  }

  const handleCreateTopic = async () => {
    const newTopic = await createNewTopic(assistant)
    // 自动切换到新主题
  }

  return (
    <div>
      <h1>{currentTopic?.name}</h1>
      <button onClick={handleCreateTopic}>新对话</button>
    </div>
  )
}
```

#### 特定主题查询

```typescript
import { useTopic } from '@/hooks/useTopic'

function TopicDetail({ topicId }: { topicId: string }) {
  const {
    topic,              // 主题对象（使用 LRU 缓存）
    isLoading,          // 加载状态
    updateTopic,        // 更新主题
    renameTopic,        // 重命名主题
    deleteTopic         // 删除主题
  } = useTopic(topicId)

  if (isLoading) return <Loading />

  return (
    <div>
      <h2>{topic.name}</h2>
      <button onClick={() => renameTopic('新名称')}>重命名</button>
      <button onClick={deleteTopic}>删除</button>
    </div>
  )
}
```

#### 主题列表

```typescript
import { useTopics } from '@/hooks/useTopic'

function TopicList() {
  const { topics, isLoading } = useTopics()

  return (
    <ul>
      {topics.map(topic => (
        <li key={topic.id}>{topic.name}</li>
      ))}
    </ul>
  )
}
```

#### 非 React 上下文使用

```typescript
import { topicService } from '@/services/TopicService'

// 获取当前主题（同步，从缓存）
const currentTopic = topicService.getCurrentTopic()

// 获取当前主题（异步，懒加载）
const currentTopic = await topicService.getCurrentTopicAsync()

// 获取特定主题（使用三层缓存）
const topic = await topicService.getTopic(topicId)

// 获取特定主题（仅从缓存，同步）
const topic = topicService.getTopicCached(topicId)

// 创建新主题（乐观更新）
const newTopic = await topicService.createTopic(assistant)

// 切换主题（乐观更新 + LRU 缓存管理）
await topicService.switchToTopic(topicId)

// 更新主题（乐观更新）
await topicService.updateTopic(topicId, { name: '新名称' })

// 重命名主题（乐观更新）
await topicService.renameTopic(topicId, '新名称')

// 删除主题（乐观更新）
await topicService.deleteTopic(topicId)
```

### 缓存性能优化

#### LRU 缓存工作原理

```typescript
// 场景：用户依次访问 5 个主题
访问 Topic A → LRU: [A]
访问 Topic B → LRU: [A, B]
访问 Topic C → LRU: [A, B, C]
访问 Topic D → LRU: [A, B, C, D]
访问 Topic E → LRU: [A, B, C, D, E]  // 缓存已满

// 再次访问 Topic A（从 LRU 缓存获取）
访问 Topic A → LRU: [B, C, D, E, A]  // A 移到最后（最新）
                  ✅ LRU cache hit!    // 无需查询数据库

// 访问新的 Topic F
访问 Topic F → LRU: [C, D, E, A, F]  // B 被驱逐（最旧）
                  ⚠️ Database load     // 首次访问需要查询数据库
```

#### 切换主题的缓存优化

```typescript
// 场景：在主题间频繁切换
当前主题: A

切换到 B:
  - 从 LRU 获取 B ✅ (如果之前访问过)
  - A 移入 LRU 缓存
  - B 成为当前主题

切换回 A:
  - 从 LRU 获取 A ✅ (刚刚放入)
  - B 移入 LRU 缓存
  - A 成为当前主题

// 结果：在最近访问的 6 个主题间切换无需查询数据库
```

### 数据持久化流程

#### 读取流程

```
1. useCurrentTopic() / useTopic(id) 调用
   ↓
2. 检查当前主题缓存
   ↓
3. 缓存命中？
   ├─ 是 → 返回缓存值（最快）
   └─ 否 → 检查 LRU 缓存
              ↓
          缓存命中？
              ├─ 是 → 返回缓存值（快）
              └─ 否 → 从 SQLite 加载（慢）
                         ↓
                     加入 LRU 缓存
                         ↓
                     返回值
```

#### 写入流程

```
1. updateTopic(id, data) 调用
   ↓
2. 保存所有缓存的旧值（用于回滚）
   ↓
3. 立即更新所有缓存（乐观更新）
   - 当前主题缓存（如果是当前主题）
   - LRU 缓存（如果存在）
   - 所有主题缓存（如果存在）
   ↓
4. 通知所有订阅者（UI 立即更新）
   ↓
5. 异步写入 SQLite
   ├─ 成功 → 完成
   └─ 失败 → 回滚所有缓存
              ↓
          通知订阅者
              ↓
          抛出错误
```

### 调试和性能监控

TopicService 提供了完整的调试工具：

#### 控制台日志

开发环境自动记录所有缓存操作：

```typescript
// 缓存命中
[TopicService] Returning current topic from cache: abc123
[TopicService] LRU cache hit for topic: xyz789

// 数据库加载
[TopicService] Loading topic from database: def456
[TopicService] Loaded topic from database and cached: def456

// 缓存管理
[TopicService] Added topic to LRU cache: def456 (cache size: 3)
[TopicService] Evicted oldest topic from LRU cache: old123
[TopicService] Moved previous current topic to LRU cache: abc123
```

#### 缓存状态查询

```typescript
import { topicService } from '@/services/TopicService'

// 获取详细缓存状态
const status = topicService.getCacheStatus()
console.log('LRU Cache size:', status.lruCache.size)
console.log('Cached topics:', status.lruCache.topicIds)
console.log('Access order:', status.lruCache.accessOrder)

// 打印格式化的缓存状态
topicService.logCacheStatus()
// 输出：
// ==================== TopicService Cache Status ====================
// Current Topic: abc123-def456-ghi789
// Current Topic Subscribers: 2
//
// LRU Cache:
//   - Size: 3/5
//   - Cached Topics: [xyz789, old123, new456]
//   - Access Order (oldest→newest): [xyz789, old123, new456]
//
// All Topics Cache:
//   - Size: 15
//   - Valid: true
//   - Age: 42s
// ================================================================
```

#### 可视化调试组件

```typescript
import { TopicCacheDebug } from '@/componentsV2/debug'

function ChatScreen() {
  return (
    <View>
      {/* 开发环境显示缓存调试信息 */}
      {__DEV__ && <TopicCacheDebug />}

      <YourChatContent />
    </View>
  )
}
```

详细调试指南请参考：`docs/topic-cache-debug.md`

### 性能优化总结

相比之前的架构，TopicService 提供了以下性能提升：

| 操作           | 之前              | 现在         | 提升            |
| -------------- | ----------------- | ------------ | --------------- |
| 切换到最近主题 | 数据库查询        | LRU 缓存命中 | ~100x 更快      |
| 访问当前主题   | useLiveQuery 订阅 | 内存缓存     | ~50x 更快       |
| 更新主题名称   | 等待数据库写入    | 乐观更新     | 零延迟 UI       |
| 并发更新       | 可能冲突          | 请求队列     | 无冲突          |
| 重复加载       | 多次查询          | 去重         | 减少 N-1 次查询 |

### 类型定义

完整类型定义位于 `src/types/assistant.ts`：

```typescript
export interface Topic {
  id: string // 主题唯一 ID
  assistantId: string // 关联的助手 ID
  name: string // 主题名称
  createdAt: number // 创建时间戳
  updatedAt: number // 更新时间戳
  isLoading?: boolean // 是否正在加载（可选）
}
```

### 最佳实践

```typescript
// ✅ 推荐：使用 React hooks
const { currentTopic, switchTopic } = useCurrentTopic()
const { topic, renameTopic } = useTopic(topicId)

// ✅ 推荐：利用乐观更新
await renameTopic('新名称') // UI 立即更新，无需等待

// ✅ 推荐：在非 React 上下文使用 topicService
const topic = await topicService.getTopic(topicId)

// ✅ 推荐：使用缓存友好的访问模式
// 在最近访问的 6 个主题间切换，全部从缓存获取
for (const topicId of recentTopicIds.slice(0, 6)) {
  await switchTopic(topicId) // ✅ LRU cache hit!
}

// ⚠️ 注意：所有 setter 都是异步的
await renameTopic('新名称') // 或者
renameTopic('新名称').catch(console.error)

// ❌ 避免：不要在 React 组件外使用 hooks
// 应该使用 topicService.getTopic()

// ❌ 避免：不要直接操作数据库
// 应该使用 TopicService 的方法
```

---

## Assistant 系统（AI 助手管理）

Cherry Studio 使用 AssistantService 管理所有 AI 助手配置，采用与 TopicService 相同的架构设计，提供高性能、类型安全的助手管理解决方案。

### 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
└───────────────┬─────────────────────────────────────────────┘
                │ useAssistant(id) / useAssistants() hooks
                │ (useSyncExternalStore)
                ▼
┌─────────────────────────────────────────────────────────────┐
│               AssistantService (Singleton)                   │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ System       │ LRU Cache    │ All Assistants Cache    │  │
│  │ Assistants   │ (10 assts)   │ (TTL: 5min)            │  │
│  │ Cache (3)    │ Map<id, A>   │ Map<id, Assistant>     │  │
│  │ (永久)       │              │                         │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ Subscribers  │ Request Queue│ Load Promises           │  │
│  │ Map<id, Set> │ Map<id, Prom>│ Map<id, Promise>        │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
│         │                                                     │
│         │ Optimistic Updates with Rollback                   │
│         ▼                                                     │
└─────────────────────────────────────────────────────────────┘
                │
                │ Drizzle ORM
                ▼
┌─────────────────────────────────────────────────────────────┐
│          SQLite Database (assistants table)                  │
│   ┌────────┬──────────┬─────────┬─────────┬──────────┐      │
│   │ id     │ name     │ type    │created  │updated   │      │
│   │        │          │         │_at      │_at       │      │
│   ├────────┼──────────┼─────────┼─────────┼──────────┤      │
│   │ TEXT   │ TEXT     │ TEXT    │ INTEGER │ INTEGER  │      │
│   └────────┴──────────┴─────────┴─────────┴──────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### AssistantService 特性

#### 1. **三层缓存策略**

**系统助手永久缓存（System Assistants Cache）**

- 存储系统内置助手（default, quick, translate）
- 最高优先级，永不驱逐
- 应用启动时自动加载
- 频繁访问无需查询数据库

**LRU 缓存（Least Recently Used Cache）**

- 存储最近访问的 10 个助手
- 使用 LRU 算法自动驱逐最旧项
- 访问时更新顺序
- 适合用户助手的频繁访问

**所有助手缓存（All Assistants Cache）**

- 缓存所有助手列表
- 5 分钟 TTL（生存时间）
- 用于助手列表显示
- 支持强制刷新

#### 2. **乐观更新（Optimistic Updates）**

- 所有 CRUD 操作立即更新缓存
- UI 零延迟响应
- 后台异步同步到 SQLite
- 失败时自动回滚所有缓存

#### 3. **智能缓存管理**

```typescript
// 访问助手的缓存查找顺序
getAssistant(assistantId) 流程：
1. 检查系统助手缓存 → 从 systemAssistantsCache 返回（最快）
2. 检查 LRU 缓存 → 从 assistantCache 返回（快）
3. 检查是否正在加载 → 等待进行中的加载
4. 从数据库加载 → 加入 LRU 缓存并返回（慢）
```

```typescript
// 系统助手的特殊优化
系统助手 (default, quick, translate):
- 永久驻留内存
- 访问时无需任何数据库查询
- 支持高频调用场景（如自动命名、翻译）
```

#### 4. **订阅系统（Subscription System）**

支持四种订阅类型：

- **特定助手订阅**：`subscribeAssistant(id)` - 监听指定助手的变化
- **全局订阅**：`subscribeAllAssistants()` - 监听所有助手变化
- **内置助手订阅**：`subscribeBuiltInAssistants()` - 监听内置助手变化
- **列表订阅**：支持监听助手列表的增删改

#### 5. **并发控制（Concurrency Control）**

**请求队列（Request Queue）**

- 序列化同一助手的更新操作
- 防止竞态条件
- 保证数据一致性

**加载去重（Load Deduplication）**

- 跟踪进行中的加载操作
- 防止重复加载同一助手
- 共享加载 Promise

#### 6. **React 18 深度集成**

- 基于 `useSyncExternalStore`
- 完美支持并发渲染
- 自动订阅/取消订阅
- 零 re-render 开销

### 使用方法

#### 单个助手管理

```typescript
import { useAssistant } from '@/hooks/useAssistant'

function AssistantDetail({ assistantId }: { assistantId: string }) {
  const {
    assistant,          // 助手对象（使用三层缓存）
    isLoading,          // 加载状态
    updateAssistant     // 更新助手
  } = useAssistant(assistantId)

  if (isLoading) return <Loading />

  const handleUpdate = async () => {
    await updateAssistant({ name: '新名称' })  // 乐观更新
  }

  return (
    <div>
      <h2>{assistant.name}</h2>
      <button onClick={handleUpdate}>重命名</button>
    </div>
  )
}
```

#### 所有助手列表

```typescript
import { useAssistants } from '@/hooks/useAssistant'

function AssistantList() {
  const {
    assistants,         // 所有助手（缓存 5 分钟）
    isLoading,          // 加载状态
    updateAssistants    // 批量更新
  } = useAssistants()

  return (
    <ul>
      {assistants.map(assistant => (
        <li key={assistant.id}>{assistant.name}</li>
      ))}
    </ul>
  )
}
```

#### 用户创建的助手

```typescript
import { useExternalAssistants } from '@/hooks/useAssistant'

function MyAssistants() {
  const {
    assistants,         // 用户创建的助手（type: external）
    isLoading,          // 加载状态
    updateAssistants    // 批量更新
  } = useExternalAssistants()

  return (
    <div>
      <h2>我的助手</h2>
      {assistants.map(assistant => (
        <AssistantCard key={assistant.id} assistant={assistant} />
      ))}
    </div>
  )
}
```

#### 内置助手

```typescript
import { useBuiltInAssistants } from '@/hooks/useAssistant'

function BuiltInAssistantList() {
  const {
    builtInAssistants,      // 内置助手（从系统缓存）
    resetBuiltInAssistants  // 重置为默认
  } = useBuiltInAssistants()

  return (
    <div>
      {builtInAssistants.map(assistant => (
        <AssistantCard key={assistant.id} assistant={assistant} />
      ))}
      <button onClick={resetBuiltInAssistants}>重置为默认</button>
    </div>
  )
}
```

#### 非 React 上下文使用

```typescript
import { assistantService } from '@/services/AssistantService'

// 获取助手（使用三层缓存）
const assistant = await assistantService.getAssistant(assistantId)

// 获取助手（仅从缓存，同步）
const assistant = assistantService.getAssistantCached(assistantId)

// 创建新助手（乐观更新）
const newAssistant = await assistantService.createAssistant({
  id: uuid(),
  name: '我的助手',
  prompt: '...',
  type: 'external'
})

// 更新助手（乐观更新）
await assistantService.updateAssistant(assistantId, { name: '新名称' })

// 删除助手（乐观更新）
await assistantService.deleteAssistant(assistantId)

// 获取用户创建的助手
const externalAssistants = await assistantService.getExternalAssistants()

// 清理所有缓存（用于数据恢复后）
assistantService.invalidateCache()
```

### 缓存性能优化

#### 系统助手的极致优化

```typescript
// 场景：频繁调用系统助手（如自动命名、翻译）
await assistantService.getAssistant('quick') // ✅ 从系统缓存，0ms
await assistantService.getAssistant('translate') // ✅ 从系统缓存，0ms
await assistantService.getAssistant('default') // ✅ 从系统缓存，0ms

// 无论调用多少次，都是内存访问，无数据库开销
for (let i = 0; i < 1000; i++) {
  await assistantService.getAssistant('quick') // ✅ 永远从缓存
}
```

#### LRU 缓存工作原理

```typescript
// 场景：用户依次访问 10 个助手
访问 Assistant A → LRU: [A]
访问 Assistant B → LRU: [A, B]
...
访问 Assistant J → LRU: [A, B, C, D, E, F, G, H, I, J]  // 缓存已满

// 再次访问 Assistant A（从 LRU 缓存获取）
访问 Assistant A → LRU: [B, C, D, E, F, G, H, I, J, A]  // A 移到最后
                  ✅ LRU cache hit!                        // 无需查询数据库

// 访问新的 Assistant K
访问 Assistant K → LRU: [C, D, E, F, G, H, I, J, A, K]  // B 被驱逐
                  ⚠️ Database load                         // 首次访问需要数据库
```

### 数据持久化流程

#### 读取流程

```
1. useAssistant(id) / assistantService.getAssistant(id) 调用
   ↓
2. 检查系统助手缓存（default, quick, translate）
   ↓
3. 缓存命中？
   ├─ 是 → 返回缓存值（最快，0ms）
   └─ 否 → 检查 LRU 缓存
              ↓
          缓存命中？
              ├─ 是 → 返回缓存值（快）
              └─ 否 → 从 SQLite 加载（慢）
                         ↓
                     加入 LRU 缓存
                         ↓
                     返回值
```

#### 写入流程

```
1. updateAssistant(id, data) 调用
   ↓
2. 保存所有缓存的旧值（用于回滚）
   ↓
3. 立即更新所有缓存（乐观更新）
   - 系统助手缓存（如果是系统助手）
   - LRU 缓存（如果存在）
   - 所有助手缓存（如果存在）
   ↓
4. 通知所有订阅者（UI 立即更新）
   ↓
5. 异步写入 SQLite
   ├─ 成功 → 完成
   └─ 失败 → 回滚所有缓存
              ↓
          通知订阅者
              ↓
          抛出错误
```

### 性能优化总结

相比之前的架构，AssistantService 提供了以下性能提升：

| 操作         | 之前           | 现在         | 提升            |
| ------------ | -------------- | ------------ | --------------- |
| 访问系统助手 | 数据库查询     | 系统缓存命中 | ~100x 更快      |
| 访问最近助手 | 数据库查询     | LRU 缓存命中 | ~100x 更快      |
| 更新助手     | 等待数据库写入 | 乐观更新     | 零延迟 UI       |
| 并发更新     | 可能冲突       | 请求队列     | 无冲突          |
| 重复加载     | 多次查询       | 去重         | 减少 N-1 次查询 |

### 助手类型

```typescript
export interface Assistant {
  id: string // 助手唯一 ID
  name: string // 助手名称
  prompt: string // 系统提示词
  type: 'system' | 'external' // system: 系统内置, external: 用户创建
  emoji?: string // 助手图标
  description?: string // 助手描述
  model?: Model // 默认模型
  defaultModel?: Model // 快速助手默认模型
  settings?: AssistantSettings // 助手设置（JSON）
  enableWebSearch?: boolean // 启用网页搜索
  enableGenerateImage?: boolean // 启用图像生成
  webSearchProviderId?: string // 搜索服务提供商 ID
  tags?: string[] // 标签
  group?: string[] // 分组
  createdAt?: number // 创建时间戳
  updatedAt?: number // 更新时间戳
}
```

### 最佳实践

```typescript
// ✅ 推荐：使用 React hooks
const { assistant, updateAssistant } = useAssistant(assistantId)
const { assistants } = useAssistants()

// ✅ 推荐：利用乐观更新
await updateAssistant({ name: '新名称' }) // UI 立即更新，无需等待

// ✅ 推荐：在非 React 上下文使用 assistantService
const assistant = await assistantService.getAssistant(assistantId)

// ✅ 推荐：高频访问系统助手无需担心性能
for (const topic of topics) {
  const quickAssistant = await assistantService.getAssistant('quick')
  // ✅ 永远从系统缓存获取，零开销
}

// ⚠️ 注意：所有 update/delete 都是异步的
await updateAssistant({ name: '新名称' }) // 或者
updateAssistant({ name: '新名称' }).catch(console.error)

// ❌ 避免：不要在 React 组件外使用 hooks
// 应该使用 assistantService.getAssistant()

// ❌ 避免：不要直接操作数据库
// 应该使用 AssistantService 的方法
```

---

## Provider 系统（LLM 服务提供商管理）

Cherry Studio 使用 ProviderService 管理所有 LLM 服务提供商配置（OpenAI、Anthropic、Google 等），采用与 AssistantService 类似的架构设计，提供高性能、类型安全的提供商管理解决方案。

### 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
└───────────────┬─────────────────────────────────────────────┘
                │ useProvider(id) / useAllProviders() hooks
                │ (useSyncExternalStore / useLiveQuery)
                ▼
┌─────────────────────────────────────────────────────────────┐
│               ProviderService (Singleton)                    │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ Default      │ LRU Cache    │ All Providers Cache     │  │
│  │ Provider     │ (10 provs)   │ (TTL: 5min)            │  │
│  │ Cache (1)    │ Map<id, P>   │ Map<id, Provider>      │  │
│  │ (永久)       │              │                         │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ Subscribers  │ Update Queue │ Load Promises           │  │
│  │ Map<id, Set> │ Map<id, Prom>│ Map<id, Promise>        │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
│         │                                                     │
│         │ Optimistic Updates with Rollback                   │
│         ▼                                                     │
└─────────────────────────────────────────────────────────────┘
                │
                │ Drizzle ORM
                ▼
┌─────────────────────────────────────────────────────────────┐
│          SQLite Database (providers table)                   │
│   ┌────────┬──────────┬─────────┬─────────┬──────────┐      │
│   │ id     │ type     │ api_key │enabled  │models    │      │
│   │        │          │         │         │          │      │
│   ├────────┼──────────┼─────────┼─────────┼──────────┤      │
│   │ TEXT   │ TEXT     │ TEXT    │ INTEGER │ TEXT     │      │
│   └────────┴──────────┴─────────┴─────────┴──────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### ProviderService 特性

#### 1. **三层缓存策略**

**默认 Provider 永久缓存（Default Provider Cache）**

- 存储默认的 LLM Provider
- 最高优先级，永不驱逐
- 应用中最频繁访问的 Provider
- 从 `preference: settings.default_provider_id` 同步

**LRU 缓存（Least Recently Used Cache）**

- 存储最近访问的 10 个 Provider
- 使用 LRU 算法自动驱逐最旧项
- 访问时更新顺序
- 适合用户频繁切换的 Provider

**所有 Provider 缓存（All Providers Cache）**

- 缓存所有 Provider 列表
- 5 分钟 TTL（生存时间）
- 用于 Provider 列表显示
- 支持强制刷新

#### 2. **乐观更新（Optimistic Updates）**

- 所有 CRUD 操作立即更新缓存
- UI 零延迟响应
- 后台异步同步到 SQLite
- 失败时自动回滚所有缓存

#### 3. **智能缓存管理**

```typescript
// 访问 Provider 的缓存查找顺序
getProvider(providerId) 流程：
1. 检查默认 Provider 缓存 → 从 defaultProviderCache 返回（最快）
2. 检查 LRU 缓存 → 从 providerCache 返回（快）
3. 检查是否正在加载 → 等待进行中的加载
4. 从数据库加载 → 加入 LRU 缓存并返回（慢）
```

```typescript
// 默认 Provider 的特殊优化
默认 Provider:
- 永久驻留内存
- 访问时无需任何数据库查询
- 支持高频调用场景（每次 AI 对话）
- 自动与 preference 同步
```

#### 4. **订阅系统（Subscription System）**

支持四种订阅类型：

- **特定 Provider 订阅**：`subscribeProvider(id)` - 监听指定 Provider 的变化
- **默认 Provider 订阅**：`subscribeDefaultProvider()` - 监听默认 Provider 变化
- **全局订阅**：`subscribeAllProviders()` - 监听所有 Provider 变化
- **列表订阅**：支持监听 Provider 列表的增删改

#### 5. **并发控制（Concurrency Control）**

**更新队列（Update Queue）**

- 序列化同一 Provider 的更新操作
- 防止竞态条件
- 保证数据一致性

**加载去重（Load Deduplication）**

- 跟踪进行中的加载操作
- 防止重复加载同一 Provider
- 共享加载 Promise

#### 6. **React 18 深度集成**

- 基于 `useSyncExternalStore`（单个 Provider）
- 使用 Drizzle `useLiveQuery`（所有 Provider 列表）
- 完美支持并发渲染
- 自动订阅/取消订阅
- 零 re-render 开销

### 使用方法

#### 单个 Provider 管理

```typescript
import { useProvider } from '@/hooks/useProviders'

function ProviderDetail({ providerId }: { providerId: string }) {
  const {
    provider,           // Provider 对象（使用三层缓存）
    isLoading,          // 加载状态
    updateProvider      // 更新 Provider
  } = useProvider(providerId)

  if (isLoading) return <Loading />

  const handleUpdate = async () => {
    await updateProvider({ apiKey: 'new-key' })  // 乐观更新
  }

  return (
    <div>
      <h2>{provider.name}</h2>
      <button onClick={handleUpdate}>更新 API Key</button>
    </div>
  )
}
```

#### 默认 Provider 管理

```typescript
import { useDefaultProvider } from '@/hooks/useProviders'

function ChatScreen() {
  const {
    provider,               // 默认 Provider（永久缓存）
    isLoading,              // 加载状态
    setDefaultProvider,     // 切换默认 Provider
    updateProvider          // 更新 Provider
  } = useDefaultProvider()

  const handleSwitchProvider = async (newProviderId: string) => {
    await setDefaultProvider(newProviderId)  // 乐观更新
  }

  return (
    <div>
      <h1>当前默认: {provider?.name}</h1>
      <button onClick={() => handleSwitchProvider('openai')}>
        切换到 OpenAI
      </button>
    </div>
  )
}
```

#### 所有 Provider 列表

```typescript
import { useAllProviders } from '@/hooks/useProviders'

function ProviderList() {
  const { providers, isLoading } = useAllProviders()

  return (
    <ul>
      {providers.map(provider => (
        <li key={provider.id}>
          {provider.name} - {provider.enabled ? '已启用' : '已禁用'}
        </li>
      ))}
    </ul>
  )
}
```

#### 非 React 上下文使用

```typescript
import { providerService } from '@/services/ProviderService'

// 获取 Provider（使用三层缓存）
const provider = await providerService.getProvider(providerId)

// 获取 Provider（仅从缓存，同步）
const provider = providerService.getProviderCached(providerId)

// 获取默认 Provider（同步，从缓存）
const defaultProvider = providerService.getDefaultProvider()

// 获取默认 Provider（异步，懒加载）
const defaultProvider = await providerService.getDefaultProviderAsync()

// 更新 Provider（乐观更新）
await providerService.updateProvider(providerId, { enabled: true })

// 设置默认 Provider（乐观更新 + 缓存切换）
await providerService.setDefaultProvider(providerId)

// 创建新 Provider（乐观更新）
const newProvider = await providerService.createProvider({
  id: uuid(),
  name: 'My LLM',
  type: 'openai',
  apiKey: 'sk-...',
  enabled: true
})

// 删除 Provider（乐观更新）
await providerService.deleteProvider(providerId)

// 清理所有缓存（用于数据恢复后）
providerService.invalidateCache()
```

### 缓存性能优化

#### 默认 Provider 的极致优化

```typescript
// 场景：频繁调用默认 Provider（每次 AI 对话）
await providerService.getDefaultProviderAsync() // ✅ 从默认缓存，0ms
await providerService.getDefaultProviderAsync() // ✅ 从默认缓存，0ms

// 无论调用多少次，都是内存访问，无数据库开销
for (let i = 0; i < 1000; i++) {
  const provider = providerService.getDefaultProvider() // ✅ 永远从缓存
}
```

#### LRU 缓存工作原理

```typescript
// 场景：用户依次访问 10 个 Provider
访问 Provider A → LRU: [A]
访问 Provider B → LRU: [A, B]
...
访问 Provider J → LRU: [A, B, C, D, E, F, G, H, I, J]  // 缓存已满

// 再次访问 Provider A（从 LRU 缓存获取）
访问 Provider A → LRU: [B, C, D, E, F, G, H, I, J, A]  // A 移到最后
                  ✅ LRU cache hit!                        // 无需查询数据库

// 访问新的 Provider K
访问 Provider K → LRU: [C, D, E, F, G, H, I, J, A, K]  // B 被驱逐
                  ⚠️ Database load                         // 首次访问需要数据库
```

### 数据持久化流程

#### 读取流程

```
1. useProvider(id) / providerService.getProvider(id) 调用
   ↓
2. 检查默认 Provider 缓存
   ↓
3. 缓存命中？
   ├─ 是 → 返回缓存值（最快，0ms）
   └─ 否 → 检查 LRU 缓存
              ↓
          缓存命中？
              ├─ 是 → 返回缓存值（快）
              └─ 否 → 从 SQLite 加载（慢）
                         ↓
                     加入 LRU 缓存
                         ↓
                     返回值
```

#### 写入流程

```
1. updateProvider(id, data) 调用
   ↓
2. 保存所有缓存的旧值（用于回滚）
   ↓
3. 立即更新所有缓存（乐观更新）
   - 默认 Provider 缓存（如果是默认 Provider）
   - LRU 缓存（如果存在）
   - 所有 Provider 缓存（如果存在）
   ↓
4. 通知所有订阅者（UI 立即更新）
   ↓
5. 异步写入 SQLite
   ├─ 成功 → 完成
   └─ 失败 → 回滚所有缓存
              ↓
          通知订阅者
              ↓
          抛出错误
```

### 架构问题与改进建议

基于代码分析，ProviderService 存在以下潜在问题：

#### ⚠️ 问题 1: **混合数据获取策略导致的不一致**

**问题所在：**

- `useProvider` 使用 `useSyncExternalStore` + ProviderService 缓存
- `useAllProviders` 使用 Drizzle 的 `useLiveQuery`，直接查询数据库

**影响：**

```typescript
// useProviders.ts:18-19
const query = db.select().from(providersSchema)
const { data: rawProviders } = useLiveQuery(query)
// ❌ 绕过了 ProviderService 的 allProvidersCache
```

当通过 `providerService.updateProvider()` 更新时：

1. ProviderService 更新了 `allProvidersCache` ✅
2. 但 `useLiveQuery` 需要等待 SQLite 写入完成才能响应 ⏱️
3. 导致 `useAllProviders` 的更新比 `useProvider` **慢一个事务周期**

**建议修复：**

```typescript
// 方案 1: 统一使用 ProviderService 缓存
export function useAllProviders() {
  const subscribe = useCallback(callback => {
    return providerService.subscribeAllProviders(callback)
  }, [])

  const getSnapshot = useCallback(() => {
    return providerService.getAllProvidersCached()
  }, [])

  const providers = useSyncExternalStore(subscribe, getSnapshot, () => [])

  return { providers, isLoading: providers.length === 0 }
}
```

#### ⚠️ 问题 2: **缓存一致性风险**

**问题所在：**

```typescript
// ProviderService.ts:735-738
if (this.allProvidersCache.size > 0 || this.allProvidersCacheTimestamp !== null) {
  this.allProvidersCache.set(provider.id, provider)
}
```

**风险场景：**

1. App 启动后，`allProvidersCache` 为空
2. 调用 `createProvider()` 创建新 Provider
3. 由于缓存为空，**不会更新 allProvidersCache**
4. 之后调用 `getAllProviders()` 时，可能返回过期数据

**建议修复：**

```typescript
// 无条件更新缓存，或者在缓存为空时主动初始化
this.allProvidersCache.set(provider.id, provider)
if (this.allProvidersCacheTimestamp === null) {
  this.allProvidersCacheTimestamp = Date.now()
}
```

#### ⚠️ 问题 3: **内存泄漏风险 - 异步操作未清理**

**问题所在：**

```typescript
// useProviders.ts:121-142
useEffect(() => {
  if (!provider) {
    setIsLoading(true)
    providerService
      .getProvider(providerId)
      .then(() => setIsLoading(false))
      .catch(error => {
        logger.error(`Failed to load provider ${providerId}:`, error as Error)
        setIsLoading(false)
      })
  }
}, [provider, providerId, isValidId])
// ❌ 缺少 cleanup function
```

**风险：** 如果组件在 Promise pending 时卸载，`setIsLoading` 会在卸载后调用

**建议修复：**

```typescript
useEffect(() => {
  let cancelled = false

  if (!provider) {
    setIsLoading(true)
    providerService
      .getProvider(providerId)
      .then(() => {
        if (!cancelled) setIsLoading(false)
      })
      .catch(error => {
        if (!cancelled) {
          logger.error(`Failed to load provider:`, error)
          setIsLoading(false)
        }
      })
  }

  return () => {
    cancelled = true
  }
}, [provider, providerId, isValidId])
```

#### ⚠️ 问题 4: **TTL 缓存策略可能不适合移动端**

**问题所在：**

```typescript
// ProviderService.ts:138
private readonly CACHE_TTL = 5 * 60 * 1000 // 5 分钟
```

**移动端特性：**

- App 可能长时间在后台
- 恢复时缓存可能已过期但数据库未变
- 频繁的缓存失效会导致不必要的数据库查询

**建议：**

```typescript
// 方案 1: 使用版本号而非时间戳
private allProvidersCacheVersion: number = 0

// 每次写入时增加版本
async updateProvider() {
  // ...
  this.allProvidersCacheVersion++
}

// 方案 2: 监听 App 状态，后台时暂停 TTL 计时
AppState.addEventListener('change', (state) => {
  if (state === 'background') {
    this.pauseCacheTTL()
  }
})
```

### 性能优化总结

相比直接查询数据库，ProviderService 提供了以下性能提升：

| 操作              | 直接查询       | ProviderService | 提升            |
| ----------------- | -------------- | --------------- | --------------- |
| 访问默认 Provider | 数据库查询     | 默认缓存命中    | ~100x 更快      |
| 访问最近 Provider | 数据库查询     | LRU 缓存命中    | ~100x 更快      |
| 更新 Provider     | 等待数据库写入 | 乐观更新        | 零延迟 UI       |
| 并发更新          | 可能冲突       | 更新队列        | 无冲突          |
| 重复加载          | 多次查询       | 去重            | 减少 N-1 次查询 |

### Provider 类型

完整类型定义位于 `src/types/assistant.ts`：

```typescript
export interface Provider {
  id: string // Provider 唯一 ID
  name: string // Provider 名称
  type: string // openai, anthropic, google, 等
  apiKey?: string // API 密钥
  apiHost?: string // API 地址
  apiVersion?: string // API 版本
  models?: Model[] // 可用模型列表
  enabled?: boolean // 是否启用
  isSystem?: boolean // 系统内置 vs 用户添加
  isAuthed?: boolean // 认证状态
  rateLimit?: number // 速率限制
  isNotSupportArrayContent?: boolean // 是否支持数组内容
  notes?: string // 备注
  createdAt?: number // 创建时间戳
  updatedAt?: number // 更新时间戳
}
```

### 最佳实践

```typescript
// ✅ 推荐：使用 React hooks
const { provider, updateProvider } = useProvider(providerId)
const { provider: defaultProvider } = useDefaultProvider()
const { providers } = useAllProviders()

// ✅ 推荐：利用乐观更新
await updateProvider({ enabled: true }) // UI 立即更新，无需等待

// ✅ 推荐：在非 React 上下文使用 providerService
const provider = await providerService.getProvider(providerId)

// ✅ 推荐：高频访问默认 Provider 无需担心性能
for (const message of messages) {
  const provider = providerService.getDefaultProvider()
  // ✅ 永远从默认缓存获取，零开销
}

// ✅ 推荐：使用缓存友好的访问模式
// 在最近访问的 11 个 Provider 间切换，全部从缓存获取
for (const providerId of recentProviderIds.slice(0, 11)) {
  await providerService.getProvider(providerId) // ✅ LRU cache hit!
}

// ⚠️ 注意：所有 update/delete 都是异步的
await updateProvider({ enabled: true }) // 或者
updateProvider({ enabled: true }).catch(console.error)

// ⚠️ 注意：useAllProviders 使用 useLiveQuery，可能有轻微延迟
// 如需即时更新，考虑迁移到 useSyncExternalStore

// ❌ 避免：不要在 React 组件外使用 hooks
// 应该使用 providerService.getProvider()

// ❌ 避免：不要直接操作数据库
// 应该使用 ProviderService 的方法
```

---

## MCP 系统（Model Context Protocol 管理）

Cherry Studio 使用 McpService 管理所有 MCP 服务器配置，采用简化的缓存架构，提供高性能、类型安全的 MCP 管理解决方案。

### 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
└───────────────┬─────────────────────────────────────────────┘
                │ useMcpServer(id) / useMcpServers() hooks
                │ (useSyncExternalStore / useLiveQuery)
                ▼
┌─────────────────────────────────────────────────────────────┐
│               McpService (Singleton)                         │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ LRU Cache    │ All Servers  │ Tools (不缓存)         │  │
│  │ (20 servers) │ Cache        │ 每次重新获取           │  │
│  │ Map<id, M>   │ (TTL: 5min)  │                         │  │
│  │              │ Map<id, MCP> │                         │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ Subscribers  │ Update Queue │ Load Promises           │  │
│  │ Map<id, Set> │ Map<id, Prom>│ Map<id, Promise>        │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
│         │                                                     │
│         │ Optimistic Updates with Rollback                   │
│         ▼                                                     │
└─────────────────────────────────────────────────────────────┘
                │
                │ Drizzle ORM
                ▼
┌─────────────────────────────────────────────────────────────┐
│          SQLite Database (mcp table)                         │
│   ┌────────┬──────────┬─────────┬─────────┬──────────┐      │
│   │ id     │ name     │ type    │enabled  │disabled  │      │
│   │        │          │         │         │_tools    │      │
│   ├────────┼──────────┼─────────┼─────────┼──────────┤      │
│   │ TEXT   │ TEXT     │ TEXT    │ INTEGER │ TEXT     │      │
│   └────────┴──────────┴─────────┴─────────┴──────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### McpService 特性

#### 1. **简化的两层缓存策略**

**LRU 缓存（Least Recently Used Cache）**

- 存储最近访问的 20 个 MCP 服务器
- 使用 LRU 算法自动驱逐最旧项
- 访问时更新顺序
- 无永久缓存（与 Assistant 不同）

**所有服务器缓存（All Servers Cache）**

- 缓存所有 MCP 服务器列表
- 5 分钟 TTL（生存时间）
- 用于 MCP 市场列表显示
- 支持强制刷新

**工具列表（Tools）**

- ⚠️ **不缓存**：每次调用 `getMcpTools()` 都重新获取
- 确保工具列表始终是最新的
- 支持 `disabledTools` 过滤

#### 2. **乐观更新（Optimistic Updates）**

- 所有 CRUD 操作立即更新缓存
- UI 零延迟响应
- 后台异步同步到 SQLite
- 失败时自动回滚所有缓存

#### 3. **智能缓存管理**

```typescript
// 访问 MCP 服务器的缓存查找顺序
getMcpServer(mcpId) 流程：
1. 检查 LRU 缓存 → 从 mcpCache 返回（快）
2. 检查是否正在加载 → 等待进行中的加载
3. 从数据库加载 → 加入 LRU 缓存并返回（慢）
```

```typescript
// 工具列表获取（不缓存）
getMcpTools(mcpId) 流程：
1. 获取 MCP 服务器配置
2. 从 BUILTIN_TOOLS 获取工具定义
3. 根据 disabledTools 过滤
4. 返回可用工具列表（每次都是新数据）
```

#### 4. **订阅系统（Subscription System）**

支持三种订阅类型：

- **特定服务器订阅**：`subscribeMcpServer(id)` - 监听指定 MCP 服务器的变化
- **全局订阅**：`subscribeAll()` - 监听所有 MCP 服务器变化
- **列表订阅**：`subscribeAllMcpServers()` - 监听服务器列表变化

#### 5. **并发控制（Concurrency Control）**

**更新队列（Update Queue）**

- 序列化同一服务器的更新操作
- 防止竞态条件
- 保证数据一致性

**加载去重（Load Deduplication）**

- 跟踪进行中的加载操作
- 防止重复加载同一服务器
- 共享加载 Promise

#### 6. **React 18 深度集成**

- 基于 `useSyncExternalStore`（单个 MCP 服务器）
- 使用 Drizzle `useLiveQuery`（所有 MCP 服务器列表）
- 完美支持并发渲染
- 自动订阅/取消订阅
- 零 re-render 开销

### 使用方法

#### 单个 MCP 服务器管理

```typescript
import { useMcpServer } from '@/hooks/useMcp'

function McpServerDetail({ mcpId }: { mcpId: string }) {
  const {
    mcpServer,          // MCP 服务器对象（使用 LRU 缓存）
    isLoading,          // 加载状态
    updateMcpServer,    // 更新服务器
    deleteMcpServer     // 删除服务器
  } = useMcpServer(mcpId)

  if (isLoading) return <Loading />

  const handleToggleActive = async () => {
    await updateMcpServer({ isActive: !mcpServer.isActive })  // 乐观更新
  }

  return (
    <div>
      <h2>{mcpServer.name}</h2>
      <button onClick={handleToggleActive}>
        {mcpServer.isActive ? '停用' : '激活'}
      </button>
    </div>
  )
}
```

#### 所有 MCP 服务器列表

```typescript
import { useMcpServers } from '@/hooks/useMcp'

function McpMarketScreen() {
  const {
    mcpServers,         // 所有 MCP 服务器（useLiveQuery）
    isLoading,          // 加载状态
    updateMcpServers    // 批量更新
  } = useMcpServers()

  return (
    <ul>
      {mcpServers.map(server => (
        <li key={server.id}>
          {server.name} - {server.isActive ? '已激活' : '未激活'}
        </li>
      ))}
    </ul>
  )
}
```

#### 活跃的 MCP 服务器

```typescript
import { useActiveMcpServers } from '@/hooks/useMcp'

function ActiveMcpList() {
  const {
    activeMcpServers,   // 仅激活的服务器（isActive: true）
    isLoading,          // 加载状态
    updateMcpServers    // 批量更新
  } = useActiveMcpServers()

  return (
    <div>
      <h2>活跃的 MCP 服务器</h2>
      {activeMcpServers.map(server => (
        <McpServerCard key={server.id} server={server} />
      ))}
    </div>
  )
}
```

#### MCP 工具列表（不缓存）

```typescript
import { useMcpTools } from '@/hooks/useMcp'

function McpToolsList({ mcpId }: { mcpId: string }) {
  const {
    tools,              // 工具列表（每次重新获取）
    isLoading,          // 加载状态
    refetch             // 手动刷新
  } = useMcpTools(mcpId)

  return (
    <div>
      <h3>可用工具</h3>
      <button onClick={refetch}>刷新</button>
      {tools.map(tool => (
        <div key={tool.id}>
          <h4>{tool.name}</h4>
          <p>{tool.description}</p>
        </div>
      ))}
    </div>
  )
}
```

#### 非 React 上下文使用

```typescript
import { mcpService } from '@/services/McpService'

// 获取 MCP 服务器（使用 LRU 缓存）
const mcpServer = await mcpService.getMcpServer(mcpId)

// 获取 MCP 服务器（仅从缓存，同步）
const mcpServer = mcpService.getMcpServerCached(mcpId)

// 获取所有 MCP 服务器（缓存 5 分钟）
const allServers = await mcpService.getAllMcpServers()

// 强制刷新所有服务器
const allServers = await mcpService.getAllMcpServers(true)

// 获取活跃的 MCP 服务器
const activeServers = await mcpService.getActiveMcpServers()

// 获取 MCP 工具（不缓存，自动过滤 disabledTools）
const tools = await mcpService.getMcpTools(mcpId)

// 创建新 MCP 服务器（乐观更新）
const newServer = await mcpService.createMcpServer({
  id: uuid(),
  name: 'My MCP Server',
  type: 'custom',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-fetch'],
  isActive: true
})

// 更新 MCP 服务器（乐观更新）
await mcpService.updateMcpServer(mcpId, { isActive: true })

// 删除 MCP 服务器（乐观更新）
await mcpService.deleteMcpServer(mcpId)

// 清理所有缓存（用于数据恢复后）
mcpService.invalidateCache()
```

### 缓存性能优化

#### LRU 缓存工作原理

```typescript
// 场景：用户依次访问 20 个 MCP 服务器
访问 MCP A → LRU: [A]
访问 MCP B → LRU: [A, B]
...
访问 MCP T → LRU: [A, B, C, ..., T]  // 缓存已满（20 个）

// 再次访问 MCP A（从 LRU 缓存获取）
访问 MCP A → LRU: [B, C, ..., T, A]  // A 移到最后（最新）
              ✅ LRU cache hit!        // 无需查询数据库

// 访问新的 MCP U
访问 MCP U → LRU: [C, D, ..., T, A, U]  // B 被驱逐（最旧）
              ⚠️ Database load           // 首次访问需要数据库
```

#### 工具列表性能特性

```typescript
// 场景：频繁查询 MCP 工具列表
await mcpService.getMcpTools(mcpId) // ⚠️ 数据库查询 + 过滤
await mcpService.getMcpTools(mcpId) // ⚠️ 再次查询（不缓存）

// 为什么不缓存？
// 1. 工具配置可能随时变化（disabledTools）
// 2. 确保始终获取最新的工具状态
// 3. 查询频率较低，性能影响可控
```

### 数据持久化流程

#### 读取流程

```
1. useMcpServer(id) / mcpService.getMcpServer(id) 调用
   ↓
2. 检查 LRU 缓存
   ↓
3. 缓存命中？
   ├─ 是 → 返回缓存值（快）
   └─ 否 → 从 SQLite 加载（慢）
              ↓
          加入 LRU 缓存
              ↓
          返回值
```

#### 写入流程

```
1. updateMcpServer(id, data) 调用
   ↓
2. 保存所有缓存的旧值（用于回滚）
   ↓
3. 立即更新所有缓存（乐观更新）
   - LRU 缓存（如果存在）
   - 所有服务器缓存（如果存在）
   ↓
4. 通知所有订阅者（UI 立即更新）
   ↓
5. 异步写入 SQLite
   ├─ 成功 → 完成
   └─ 失败 → 回滚所有缓存
              ↓
          通知订阅者
              ↓
          抛出错误
```

### 调试和性能监控

McpService 提供了完整的调试工具：

#### 控制台日志

开发环境自动记录所有缓存操作：

```typescript
// 缓存命中
[McpService] LRU cache hit for MCP server: abc123
[McpService] Returning all MCP servers from cache (age: 42s)

// 数据库加载
[McpService] Loading MCP server from database: def456
[McpService] Loaded MCP server from database and cached: def456

// 缓存管理
[McpService] Added MCP server to LRU cache: def456 (cache size: 15)
[McpService] Evicted oldest MCP server from LRU cache: old123
```

#### 缓存状态查询

```typescript
import { mcpService } from '@/services/McpService'

// 获取详细缓存状态
const status = mcpService.getCacheStatus()
console.log('LRU Cache size:', status.lruCache.size)
console.log('Cached servers:', status.lruCache.items)

// 打印格式化的缓存状态
mcpService.logCacheStatus()
// 输出：
// ==================== McpService Cache Status ====================
// LRU Cache:
//   - Size: 15/20
//   - Cached Servers: [abc123, def456, ...]
//
// All Servers Cache:
//   - Size: 25
//   - Valid: true
//   - Age: 42s
// ================================================================
```

#### 可视化调试组件

```typescript
import { McpCacheDebug } from '@/componentsV2/features/MCP/McpCacheDebug'

function DebugScreen() {
  return (
    <View>
      {/* 开发环境显示缓存调试信息 */}
      {__DEV__ && <McpCacheDebug />}
    </View>
  )
}
```

### 性能优化总结

相比之前的简单实现，McpService 提供了以下性能提升：

| 操作                | 之前           | 现在         | 提升            |
| ------------------- | -------------- | ------------ | --------------- |
| 访问最近 MCP 服务器 | 数据库查询     | LRU 缓存命中 | ~100x 更快      |
| 获取所有服务器      | 每次查询数据库 | 缓存 5 分钟  | ~100x 更快      |
| 更新服务器          | 等待数据库写入 | 乐观更新     | 零延迟 UI       |
| 并发更新            | 可能冲突       | 更新队列     | 无冲突          |
| 重复加载            | 多次查询       | 去重         | 减少 N-1 次查询 |
| 获取工具列表        | -              | 不缓存       | 确保数据新鲜    |

### MCP 类型定义

完整类型定义位于 `src/types/mcp.ts`：

```typescript
export interface MCPServer {
  id: string // MCP 服务器唯一 ID
  name: string // 服务器名称
  description?: string // 服务器描述
  type: 'builtin' | 'custom' // builtin: 内置, custom: 用户添加
  command: string // 启动命令
  args?: string[] // 命令参数（JSON 数组）
  env?: Record<string, string> // 环境变量（JSON 对象）
  isActive?: boolean // 是否激活
  disabledTools?: string[] // 禁用的工具列表
  createdAt?: number // 创建时间戳
  updatedAt?: number // 更新时间戳
}

export interface MCPTool {
  id: string // 工具唯一 ID
  name: string // 工具名称
  description: string // 工具描述
  inputSchema: object // 输入参数 JSON Schema
}
```

### 架构设计决策

#### 为什么不缓存工具列表？

**决策理由：**

1. **数据新鲜性**：工具的启用/禁用状态（disabledTools）可能随时变化
2. **访问频率低**：工具列表通常在配置页面查询，不是高频操作
3. **数据量小**：单个 MCP 服务器的工具数量有限（~10-50 个）
4. **一致性保证**：每次获取都是最新状态，避免缓存不一致

**性能影响：**

- 查询一次工具列表：~10-20ms（数据库查询 + 过滤）
- 相比 UI 渲染时间（~50-100ms），影响可忽略

#### 为什么没有永久缓存？

**与 Assistant 系统的对比：**

- Assistant 有系统助手（default, quick, translate），需要永久缓存
- MCP 没有"系统 MCP 服务器"的概念，所有服务器地位平等
- LRU(20) 足够覆盖用户的常用 MCP 服务器

**设计优势：**

- 架构更简单，易于维护
- 无需区分"系统"和"用户"MCP 服务器
- LRU 自动管理，无需手动维护永久缓存

### 最佳实践

```typescript
// ✅ 推荐：使用 React hooks
const { mcpServer, updateMcpServer } = useMcpServer(mcpId)
const { mcpServers } = useMcpServers()
const { activeMcpServers } = useActiveMcpServers()
const { tools } = useMcpTools(mcpId)

// ✅ 推荐：利用乐观更新
await updateMcpServer({ isActive: true }) // UI 立即更新，无需等待

// ✅ 推荐：在非 React 上下文使用 mcpService
const mcpServer = await mcpService.getMcpServer(mcpId)
const tools = await mcpService.getMcpTools(mcpId)

// ✅ 推荐：使用缓存友好的访问模式
// 在最近访问的 20 个服务器间切换，全部从缓存获取
for (const mcpId of recentMcpIds.slice(0, 20)) {
  await mcpService.getMcpServer(mcpId) // ✅ LRU cache hit!
}

// ⚠️ 注意：工具列表不缓存，频繁调用会有性能开销
// 如果需要多次使用工具列表，建议在组件中缓存
const { tools } = useMcpTools(mcpId) // ✅ React 组件会缓存结果

// ⚠️ 注意：所有 update/delete 都是异步的
await updateMcpServer({ isActive: true }) // 或者
updateMcpServer({ isActive: true }).catch(console.error)

// ⚠️ 注意：useMcpServers 使用 useLiveQuery，可能有轻微延迟
// useMcpServer 使用 useSyncExternalStore，响应更快

// ❌ 避免：不要在 React 组件外使用 hooks
// 应该使用 mcpService.getMcpServer()

// ❌ 避免：不要直接操作数据库
// 应该使用 McpService 的方法

// ❌ 避免：不要缓存工具列表在应用全局状态中
// 工具状态可能随时变化，应该每次重新获取
```

---

## WebSearch Provider 系统（网页搜索提供商管理）

Cherry Studio 使用 WebSearchProviderService 管理所有网页搜索服务提供商配置（Google、Searxng、Tavily 等），采用与 McpService 相同的架构设计，提供高性能、类型安全的搜索提供商管理解决方案。

### 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
└───────────────┬─────────────────────────────────────────────┘
                │ useWebSearchProvider(id) / useWebsearchProviders() hooks
                │ (useSyncExternalStore / useLiveQuery)
                ▼
┌─────────────────────────────────────────────────────────────┐
│            WebSearchProviderService (Singleton)              │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ LRU Cache    │ All Providers│                         │  │
│  │ (5 providers)│ Cache        │                         │  │
│  │ Map<id, P>   │ (TTL: 5min)  │                         │  │
│  │              │ Map<id, WSP> │                         │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ Subscribers  │ Update Queue │ Load Promises           │  │
│  │ Map<id, Set> │ Map<id, Prom>│ Map<id, Promise>        │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
│         │                                                     │
│         │ Optimistic Updates with Rollback                   │
│         ▼                                                     │
└─────────────────────────────────────────────────────────────┘
                │
                │ Drizzle ORM
                ▼
┌─────────────────────────────────────────────────────────────┐
│       SQLite Database (websearch_providers table)           │
│   ┌────────┬──────────┬─────────┬─────────┬──────────┐      │
│   │ id     │ name     │ type    │api_key  │engines   │      │
│   │        │          │         │         │          │      │
│   ├────────┼──────────┼─────────┼─────────┼──────────┤      │
│   │ TEXT   │ TEXT     │ TEXT    │ TEXT    │ TEXT     │      │
│   └────────┴──────────┴─────────┴─────────┴──────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### WebSearchProviderService 特性

#### 1. **简化的两层缓存策略**

**LRU 缓存（Least Recently Used Cache）**

- 存储最近访问的 5 个搜索提供商
- 使用 LRU 算法自动驱逐最旧项
- 访问时更新顺序
- 移动端优化（5 个缓存，小于 MCP 的 20 个）
- 无永久缓存（与 Provider 系统不同）

**所有提供商缓存（All Providers Cache）**

- 缓存所有搜索提供商列表
- 5 分钟 TTL（生存时间）
- 用于搜索提供商列表显示
- 支持强制刷新

#### 2. **乐观更新（Optimistic Updates）**

- 所有 CRUD 操作立即更新缓存
- UI 零延迟响应
- 后台异步同步到 SQLite
- 失败时自动回滚所有缓存

#### 3. **智能缓存管理**

```typescript
// 访问搜索提供商的缓存查找顺序
getProvider(providerId) 流程：
1. 检查 LRU 缓存 → 从 providerCache 返回（快）
2. 检查是否正在加载 → 等待进行中的加载
3. 从数据库加载 → 加入 LRU 缓存并返回（慢）
```

#### 4. **订阅系统（Subscription System）**

支持三种订阅类型：

- **特定提供商订阅**：`subscribeProvider(id)` - 监听指定提供商的变化
- **全局订阅**：`subscribeAll()` - 监听所有提供商变化
- **列表订阅**：`subscribeAllProviders()` - 监听提供商列表变化

#### 5. **并发控制（Concurrency Control）**

**更新队列（Update Queue）**

- 序列化同一提供商的更新操作
- 防止竞态条件
- 保证数据一致性

**加载去重（Load Deduplication）**

- 跟踪进行中的加载操作
- 防止重复加载同一提供商
- 共享加载 Promise

#### 6. **React 18 深度集成**

- 基于 `useSyncExternalStore`（单个提供商 - 新 hook）
- 使用 Drizzle `useLiveQuery`（提供商列表 - 旧 hooks 保持兼容）
- 完美支持并发渲染
- 自动订阅/取消订阅
- 零 re-render 开销

### 使用方法

#### 单个搜索提供商管理（新 Hook）

```typescript
import { useWebSearchProvider } from '@/hooks/useWebsearchProviders'

function WebSearchProviderDetail({ providerId }: { providerId: string }) {
  const {
    provider,           // 搜索提供商对象（使用 LRU 缓存）
    isLoading,          // 加载状态
    updateProvider,     // 更新提供商
    deleteProvider      // 删除提供商
  } = useWebSearchProvider(providerId)

  if (isLoading) return <Loading />

  const handleUpdate = async () => {
    await updateProvider({ apiKey: 'new-key' })  // 乐观更新
  }

  return (
    <div>
      <h2>{provider.name}</h2>
      <button onClick={handleUpdate}>更新 API Key</button>
      <button onClick={deleteProvider}>删除</button>
    </div>
  )
}
```

#### 搜索提供商列表（旧 Hook - 保持兼容）

```typescript
import { useWebsearchProviders } from '@/hooks/useWebsearchProviders'

function WebSearchProviderList() {
  const {
    freeProviders,      // 免费提供商（local-* 开头）
    apiProviders,       // API 提供商
    isLoading           // 加载状态
  } = useWebsearchProviders()

  return (
    <div>
      <h3>免费提供商</h3>
      <ul>
        {freeProviders.map(provider => (
          <li key={provider.id}>{provider.name}</li>
        ))}
      </ul>

      <h3>API 提供商</h3>
      <ul>
        {apiProviders.map(provider => (
          <li key={provider.id}>{provider.name}</li>
        ))}
      </ul>
    </div>
  )
}
```

#### 所有搜索提供商（旧 Hook - 保持兼容）

```typescript
import { useAllWebSearchProviders } from '@/hooks/useWebsearchProviders'

function AllProvidersScreen() {
  const {
    providers,          // 所有搜索提供商（useLiveQuery）
    isLoading           // 加载状态
  } = useAllWebSearchProviders()

  return (
    <ul>
      {providers.map(provider => (
        <li key={provider.id}>
          {provider.name} - {provider.type}
        </li>
      ))}
    </ul>
  )
}
```

#### 非 React 上下文使用

```typescript
import { webSearchProviderService } from '@/services/WebSearchProviderService'

// 获取搜索提供商（使用 LRU 缓存）
const provider = await webSearchProviderService.getProvider(providerId)

// 获取搜索提供商（仅从缓存，同步）
const provider = webSearchProviderService.getProviderCached(providerId)

// 获取所有搜索提供商（缓存 5 分钟）
const allProviders = await webSearchProviderService.getAllProviders()

// 强制刷新所有提供商
const allProviders = await webSearchProviderService.getAllProviders(true)

// 创建新搜索提供商（乐观更新）
const newProvider = await webSearchProviderService.createProvider({
  id: uuid(),
  name: 'My Search API',
  type: 'api',
  apiKey: 'sk-...'
})

// 更新搜索提供商（乐观更新）
await webSearchProviderService.updateProvider(providerId, { apiKey: 'new-key' })

// 删除搜索提供商（乐观更新）
await webSearchProviderService.deleteProvider(providerId)

// 清理所有缓存（用于数据恢复后）
webSearchProviderService.invalidateCache()
```

### 缓存性能优化

#### LRU 缓存工作原理

```typescript
// 场景：用户依次访问 5 个搜索提供商
访问 Provider A → LRU: [A]
访问 Provider B → LRU: [A, B]
访问 Provider C → LRU: [A, B, C]
访问 Provider D → LRU: [A, B, C, D]
访问 Provider E → LRU: [A, B, C, D, E]  // 缓存已满

// 再次访问 Provider A（从 LRU 缓存获取）
访问 Provider A → LRU: [B, C, D, E, A]  // A 移到最后（最新）
                  ✅ LRU cache hit!        // 无需查询数据库

// 访问新的 Provider F
访问 Provider F → LRU: [C, D, E, A, F]  // B 被驱逐（最旧）
                  ⚠️ Database load         // 首次访问需要数据库
```

#### 为什么选择 LRU(5) 而不是 LRU(20)？

**移动端特性考虑：**

- 搜索提供商的使用频率比 MCP 服务器更集中
- 用户通常只使用 1-3 个常用搜索提供商
- 移动端内存更宝贵，5 个缓存足够覆盖常用场景
- 减少内存占用，提升应用性能

**实际效果：**

```typescript
// 典型使用场景：用户在 Google 和 Searxng 间切换
访问 Google  → LRU: [Google]
访问 Searxng → LRU: [Google, Searxng]
访问 Google  → LRU: [Searxng, Google]  // ✅ 缓存命中
访问 Searxng → LRU: [Google, Searxng]  // ✅ 缓存命中

// 即使只有 2 个提供商频繁切换，LRU(5) 也完全覆盖
```

### 数据持久化流程

#### 读取流程

```
1. useWebSearchProvider(id) / webSearchProviderService.getProvider(id) 调用
   ↓
2. 检查 LRU 缓存
   ↓
3. 缓存命中？
   ├─ 是 → 返回缓存值（快）
   └─ 否 → 从 SQLite 加载（慢）
              ↓
          加入 LRU 缓存
              ↓
          返回值
```

#### 写入流程

```
1. updateProvider(id, data) 调用
   ↓
2. 保存所有缓存的旧值（用于回滚）
   ↓
3. 立即更新所有缓存（乐观更新）
   - LRU 缓存（如果存在）
   - 所有提供商缓存（如果存在）
   ↓
4. 通知所有订阅者（UI 立即更新）
   ↓
5. 异步写入 SQLite
   ├─ 成功 → 完成
   └─ 失败 → 回滚所有缓存
              ↓
          通知订阅者
              ↓
          抛出错误
```

### 调试和性能监控

WebSearchProviderService 提供了完整的调试工具：

#### 控制台日志

开发环境自动记录所有缓存操作：

```typescript
// 缓存命中
[WebSearch Provider Service] LRU cache hit for WebSearch provider: google
[WebSearch Provider Service] Returning all providers from cache (age: 42s)

// 数据库加载
[WebSearch Provider Service] Loading WebSearch provider from database: tavily
[WebSearch Provider Service] Loaded provider from database and cached: tavily

// 缓存管理
[WebSearch Provider Service] Added provider to LRU cache: tavily (cache size: 3)
[WebSearch Provider Service] Evicted oldest provider from LRU cache: searxng
```

#### 缓存状态查询

```typescript
import { webSearchProviderService } from '@/services/WebSearchProviderService'

// 获取详细缓存状态
const status = webSearchProviderService.getCacheStatus()
console.log('LRU Cache size:', status.lruCache.size)
console.log('Cached providers:', status.lruCache.items)

// 打印格式化的缓存状态
webSearchProviderService.logCacheStatus()
// 输出：
// ============ WebSearchProviderService Cache Status ============
// LRU Cache:
//   - Size: 3/5
//   - Cached Providers: [google, tavily, searxng]
//
// All Providers Cache:
//   - Size: 8
//   - Valid: true
//   - Age: 42s
// ================================================================
```

### 性能优化总结

相比之前的简单实现，WebSearchProviderService 提供了以下性能提升：

| 操作               | 之前           | 现在         | 提升            |
| ------------------ | -------------- | ------------ | --------------- |
| 访问最近搜索提供商 | 数据库查询     | LRU 缓存命中 | ~100x 更快      |
| 获取所有提供商     | 每次查询数据库 | 缓存 5 分钟  | ~100x 更快      |
| 更新提供商         | 等待数据库写入 | 乐观更新     | 零延迟 UI       |
| 并发更新           | 可能冲突       | 更新队列     | 无冲突          |
| 重复加载           | 多次查询       | 去重         | 减少 N-1 次查询 |

### WebSearch Provider 类型定义

完整类型定义位于 `src/types/websearch.ts`：

```typescript
export interface WebSearchProvider {
  id: string // 搜索提供商唯一 ID
  name: string // 提供商名称
  type: 'free' | 'api' // free: 免费服务, api: API 服务
  apiKey?: string // API 密钥（API 服务需要）
  apiHost?: string // API 地址
  engines?: string[] // 搜索引擎列表（JSON 数组）
  url?: string // 服务 URL
  basicAuthUsername?: string // Basic Auth 用户名
  basicAuthPassword?: string // Basic Auth 密码
  contentLimit?: number // 内容长度限制
  usingBrowser?: boolean // 是否使用浏览器模式
  createdAt?: number // 创建时间戳
  updatedAt?: number // 更新时间戳
}
```

### 架构设计决策

#### 为什么没有默认提供商缓存？

**与 Provider 系统的对比：**

- Provider 系统有默认 LLM Provider（全局单一）
- WebSearch Provider **没有全局默认**，而是每个 Assistant 独立配置（`webSearchProviderId`）
- 每次搜索使用的提供商由 Assistant 决定，不是全局配置

**设计优势：**

- 架构更简单，避免不必要的缓存层
- 与实际使用场景匹配（per-Assistant 而非 global）
- 参考 McpService 的简化架构

#### 为什么 LRU 缓存只有 5 个？

**移动端优化考虑：**

- 搜索提供商数量通常有限（5-10 个）
- 用户常用的提供商更少（1-3 个）
- 5 个缓存足够覆盖 99% 的使用场景
- 减少内存占用，提升移动端性能

**对比其他服务：**

- TopicService: LRU(5) - 话题切换频繁
- AssistantService: LRU(10) - 助手种类较多
- ProviderService: LRU(10) - LLM 提供商较多
- **McpService: LRU(20)** - MCP 服务器可能很多
- **WebSearchProviderService: LRU(5)** - 搜索提供商使用集中

#### 为什么保留 useLiveQuery 的旧 Hooks？

**兼容性考虑：**

- `useWebsearchProviders()` 和 `useAllWebSearchProviders()` 在多处使用
- 立即迁移会影响现有功能稳定性
- 采用渐进式迁移策略

**迁移策略：**

1. ✅ 已完成：创建新架构（WebSearchProviderService）
2. ✅ 已完成：添加新 Hook（`useWebSearchProvider`）
3. ⏳ 待进行：逐步迁移使用 `useWebsearchProviders` 的组件
4. ⏳ 待进行：所有组件迁移完成后，统一使用 useSyncExternalStore

### 最佳实践

```typescript
// ✅ 推荐：使用新的单个提供商 Hook
const { provider, updateProvider } = useWebSearchProvider(providerId)

// ✅ 推荐：利用乐观更新
await updateProvider({ apiKey: 'new-key' }) // UI 立即更新，无需等待

// ✅ 推荐：在非 React 上下文使用 webSearchProviderService
const provider = await webSearchProviderService.getProvider(providerId)

// ✅ 推荐：使用缓存友好的访问模式
// 在最近访问的 5 个提供商间切换，全部从缓存获取
for (const providerId of recentProviderIds.slice(0, 5)) {
  await webSearchProviderService.getProvider(providerId) // ✅ LRU cache hit!
}

// ✅ 推荐：旧 Hooks 仍可正常使用（向后兼容）
const { freeProviders, apiProviders } = useWebsearchProviders() // ✅ 仍然可用
const { providers } = useAllWebSearchProviders() // ✅ 仍然可用

// ⚠️ 注意：所有 update/delete 都是异步的
await updateProvider({ apiKey: 'new-key' }) // 或者
updateProvider({ apiKey: 'new-key' }).catch(console.error)

// ⚠️ 注意：旧 Hooks 使用 useLiveQuery，可能有轻微延迟
// 新 Hook (useWebSearchProvider) 使用 useSyncExternalStore，响应更快

// ⚠️ 注意：WebSearchTool 现在使用异步加载
// Tool 的 execute 函数会自动加载提供商，无需预加载

// ❌ 避免：不要在 React 组件外使用 hooks
// 应该使用 webSearchProviderService.getProvider()

// ❌ 避免：不要直接操作数据库
// 应该使用 WebSearchProviderService 的方法
```

### 与 WebSearchService 的集成

WebSearchProviderService 与现有的 WebSearchService 完美集成：

```typescript
// src/services/WebSearchService.ts

import { webSearchProviderService } from '@/services/WebSearchProviderService'

class WebSearchService {
  // ✅ 使用新服务获取提供商（同步，从缓存）
  public getWebSearchProvider(providerId?: string): WebSearchProvider | undefined {
    if (!providerId) return
    const provider = webSearchProviderService.getProviderCached(providerId)
    return provider ?? undefined
  }

  // ✅ 检查提供商是否启用（异步，懒加载）
  public async isWebSearchEnabled(providerId?: string): Promise<boolean> {
    if (!providerId) return false
    const provider = await webSearchProviderService.getProvider(providerId)
    if (!provider) return false
    // ... 验证逻辑
  }
}
```

**重要修复：WebSearchTool 异步加载**

之前的问题：

- WebSearchTool 在创建时同步获取提供商
- 如果缓存为空，返回 `undefined`
- 导致工具调用失败，AI 多次重试

现在的解决方案（`src/aiCore/tools/WebSearchTool.ts`）:

```typescript
export const webSearchToolWithPreExtractedKeywords = (
  webSearchProviderId: string,
  extractedKeywords: { question: string[]; links?: string[] },
  requestId: string
) => {
  return tool({
    name: 'builtin_web_search',
    execute: async ({ additionalContext }) => {
      // ✅ 异步加载提供商（首次访问时从数据库加载，后续从缓存）
      const webSearchProvider = await webSearchProviderService.getProvider(webSearchProviderId)

      // ✅ 错误处理
      if (!webSearchProvider) {
        logger.error(`WebSearch provider not found: ${webSearchProviderId}`)
        return { query: '', results: [] }
      }

      // ✅ 提供商已加载，安全使用
      return await WebSearchService.processWebsearch(webSearchProvider, extractResults, requestId)
    }
  })
}
```

**修复效果：**

- 提供商在需要时异步加载
- 缓存命中时加载很快（~1ms）
- 缓存未命中时从数据库加载（~10-20ms）
- 避免了多次重试问题
- 提供清晰的错误日志

---

## Redux Store 结构

应用状态通过 Redux Toolkit 管理，并通过 AsyncStorage 进行持久化。

### Store Slices

#### `assistant` - 助手管理

```typescript
interface AssistantsState {
  builtInAssistants: Assistant[] // 内置 AI 助手配置（已废弃）
}
```

**说明：**

- ⚠️ **已废弃**：内置助手管理已迁移到 AssistantService
- 系统内置助手（default, quick, translate）现由 AssistantService 管理
- 用户自定义的助手存储在 SQLite `assistants` 表中
- 通过 `useBuiltInAssistants()` hook 访问内置助手

---

## SQLite 数据库架构

应用使用 SQLite 与 Drizzle ORM 进行持久数据存储。所有表都使用基于文本的主键以保持一致性。

### 核心表

#### `assistants` - AI 助手配置

```sql
CREATE TABLE assistants (
  id TEXT PRIMARY KEY NOT NULL UNIQUE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'system',  -- system: 系统内置, external: 用户创建
  emoji TEXT,
  description TEXT,
  model TEXT,
  default_model TEXT,
  settings TEXT,                        -- JSON 配置
  enable_web_search INTEGER,            -- 0/1 boolean
  enable_generate_image INTEGER,
  knowledge_recognition TEXT,
  tags TEXT,                            -- JSON 数组
  group TEXT,
  websearch_provider_id TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_assistants_type ON assistants(type);
```

#### `topics` - 对话话题

```sql
CREATE TABLE topics (
  id TEXT PRIMARY KEY NOT NULL UNIQUE,
  assistant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  isLoading INTEGER                     -- 0/1 boolean, 话题是否正在加载
);

-- 性能索引
CREATE INDEX idx_topics_assistant_id ON topics(assistant_id);
CREATE INDEX idx_topics_created_at ON topics(created_at);
CREATE INDEX idx_topics_assistant_id_created_at ON topics(assistant_id, created_at);
CREATE INDEX idx_topics_updated_at ON topics(updated_at);
```

#### `messages` - 聊天消息

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL UNIQUE,
  role TEXT NOT NULL,                   -- user, assistant, system
  assistant_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  status TEXT NOT NULL,                 -- processing, success, error, 等
  model_id TEXT,
  model TEXT,
  type TEXT,
  useful INTEGER,                       -- 用户反馈 (0/1)
  ask_id TEXT,                         -- 分组相关消息
  mentions TEXT,                       -- 提及的 JSON 数组
  usage TEXT,                          -- JSON 使用统计
  metrics TEXT,                        -- JSON 性能指标
  multi_model_message_style TEXT,
  fold_selected INTEGER
);

-- 性能索引
CREATE INDEX idx_messages_topic_id ON messages(topic_id);
CREATE INDEX idx_messages_assistant_id ON messages(assistant_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

#### `message_blocks` - 消息内容块

消息可以包含多个不同类型的内容块（文本、代码、图片、工具调用等）。

```sql
CREATE TABLE message_blocks (
  id TEXT PRIMARY KEY NOT NULL UNIQUE,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL,                   -- text, code, image, tool, thinking, citation, translation
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  status TEXT NOT NULL,                 -- processing, success, error
  model TEXT,                          -- JSON 模型配置
  metadata TEXT,                       -- JSON 元数据
  error TEXT,                          -- JSON 错误信息

  -- 通用内容字段
  content TEXT,                        -- 主要内容
  language TEXT,                       -- 代码块的编程语言
  url TEXT,                           -- 图片块的 URL
  file TEXT,                          -- 附件的 JSON FileMetadata

  -- 工具块特定
  tool_id TEXT,
  tool_name TEXT,
  arguments TEXT,                      -- JSON 工具参数

  -- 翻译块特定
  source_block_id TEXT,
  source_language TEXT,
  target_language TEXT,

  -- 引用块特定
  response TEXT,                       -- JSON WebSearchResponse
  knowledge TEXT,                      -- JSON KnowledgeReference[]

  -- 思考块特定
  thinking_millsec INTEGER,

  -- 主文本块特定
  knowledge_base_ids TEXT,             -- JSON 字符串数组
  citation_references TEXT             -- JSON 引用参考
);

-- 性能索引
CREATE INDEX idx_message_blocks_message_id ON message_blocks(message_id);
CREATE INDEX idx_message_blocks_type ON message_blocks(type);
```

### 配置表

#### `providers` - LLM 服务提供商

```sql
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                   -- openai, anthropic, google, 等
  name TEXT NOT NULL,
  api_key TEXT,
  api_host TEXT,
  api_version TEXT,
  models TEXT,                         -- 可用模型的 JSON 数组
  enabled INTEGER,                     -- 0/1 boolean
  is_system INTEGER,                   -- 系统提供 vs 用户添加
  is_authed INTEGER,                   -- 认证状态
  rate_limit INTEGER,
  is_not_support_array_content INTEGER,
  notes TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
```

#### `websearch_providers` - 网页搜索服务

```sql
CREATE TABLE websearch_providers (
  id TEXT PRIMARY KEY,
  name TEXT,
  type TEXT,                           -- free, api
  api_key TEXT,
  api_host TEXT,
  engines TEXT,                        -- 搜索引擎的 JSON 数组
  url TEXT,
  basic_auth_username TEXT,
  basic_auth_password TEXT,
  content_limit INTEGER,
  using_browser INTEGER,               -- 0/1 boolean
  created_at INTEGER,
  updated_at INTEGER
);
```

#### `preference` - 用户偏好设置

```sql
CREATE TABLE preference (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT,                          -- JSON 格式存储所有类型
  description TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
```

**说明：**

- 存储所有用户配置和应用状态
- 由 PreferenceService 管理
- 详见本文档 "Preference 系统" 章节

### 存储和知识表

#### `files` - 上传的文件

```sql
CREATE TABLE files (
  id TEXT PRIMARY KEY NOT NULL UNIQUE,
  origin_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL,
  ext TEXT NOT NULL,
  count INTEGER NOT NULL,              -- 引用计数
  type TEXT NOT NULL,                  -- image, document, audio, video
  mime_type TEXT NOT NULL,
  md5 TEXT NOT NULL
);

CREATE INDEX idx_files_md5 ON files(md5);
```

#### `knowledges` - 知识库

```sql
CREATE TABLE knowledges (
  id TEXT PRIMARY KEY NOT NULL UNIQUE,
  name TEXT NOT NULL,
  model TEXT NOT NULL,                 -- 嵌入模型
  dimensions INTEGER NOT NULL,         -- 向量维度
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version TEXT NOT NULL,
  document_count INTEGER,
  chunk_size INTEGER,
  chunk_overlap INTEGER,
  threshold INTEGER,
  rerank_model TEXT,
  items TEXT NOT NULL                  -- JSON 知识项目数组
);

CREATE INDEX idx_knowledges_name ON knowledges(name);
```

#### `mcp` - MCP (Model Context Protocol) 服务器配置

```sql
CREATE TABLE mcp (
  id TEXT PRIMARY KEY NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                  -- builtin, custom
  command TEXT NOT NULL,
  args TEXT,                           -- JSON 数组
  env TEXT,                            -- JSON 对象
  enabled INTEGER,                     -- 0/1 boolean
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_mcp_enabled ON mcp(enabled);
```

---

## 数据关系

### 主要关系

```
assistants (1) ──────────< (N) topics
    │                          │
    │                          │
    └──────────< (N) messages <┘
                     │
                     │
                     └──────────< (N) message_blocks

websearch_providers (1) ────────< (N) assistants
                                      (通过 websearch_provider_id)

AssistantService Cache Structure:
┌─────────────────────────────────────┐
│ System Cache (永久)                 │
│  - default, quick, translate        │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│ LRU Cache (10 项)                   │
│  - 最近访问的助手                    │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│ All Assistants Cache (TTL 5min)    │
│  - 完整助手列表                      │
└─────────────────────────────────────┘
```

### 数据流

#### 1. 创建新对话

```
用户选择助手
    ↓
创建新 topic
    ↓
设置 topic.assistant_id = assistant.id
    ↓
更新 preference: topic.current_id = topic.id
```

#### 2. 发送消息

```
用户输入消息
    ↓
创建 message (role: user)
    ↓
设置 message.topic_id 和 message.assistant_id
    ↓
创建 message_block (type: text, content: 用户输入)
    ↓
AI 生成回复
    ↓
创建 message (role: assistant)
    ↓
创建多个 message_blocks (text, code, image, 等)
```

#### 3. 网页搜索

```
消息包含搜索请求
    ↓
获取 assistant.websearch_provider_id
    ↓
查询 websearch_providers 表
    ↓
使用提供商 API 执行搜索
    ↓
创建 message_block (type: citation)
    ↓
在 response 字段存储搜索结果 JSON
```

#### 4. 文件上传

```
用户上传文件
    ↓
计算文件 MD5
    ↓
检查 files 表是否存在相同 MD5
    ├─ 存在 → 增加 count（引用计数）
    └─ 不存在 → 创建新记录
    ↓
在 message_block.file 中引用文件 ID
```

---

## 存储考虑

### Preference (SQLite)

**存储位置：** SQLite 数据库 `preference` 表
**管理方式：** PreferenceService
**持久化：** 自动持久化到本地数据库

**优势：**

- 类型安全的 API
- 懒加载，按需读取
- 乐观更新，UI 响应迅速
- 自动回滚机制
- 与 React 18 深度集成

**适用场景：**

- 用户配置（头像、用户名、主题等）
- 应用状态（初始化标志、欢迎页面状态）
- UI 状态（当前话题 ID）
- 功能配置（搜索设置等）

### Redux Store

**存储位置：** AsyncStorage (React Native)
**持久化：** 通过 redux-persist 自动持久化

**当前使用：**

- `assistant` slice：内置助手配置

**适用场景：**

- 全局共享的应用状态
- 需要跨组件同步的数据

### SQLite 数据库

**存储位置：** 本地设备存储（通过 Expo SQLite）
**管理方式：** Drizzle ORM
**迁移：** 自动管理版本迁移

**优势：**

- 关系型数据，支持复杂查询
- 索引优化，查询性能高
- 事务支持，数据一致性保证
- 本地存储，离线可用

**适用场景：**

- 实体数据（助手、话题、消息）
- 关系数据（一对多、多对多）
- 大量数据存储
- 需要复杂查询的数据

### 存储选择指南

| 数据类型   | 推荐存储     | 原因                       |
| ---------- | ------------ | -------------------------- |
| 用户配置   | Preference   | 类型安全，乐观更新，懒加载 |
| 应用状态   | Preference   | 简单键值对，快速访问       |
| 实体数据   | SQLite       | 需要关系查询，支持索引     |
| 大量数据   | SQLite       | 高效存储和检索             |
| 运行时状态 | Memory/State | 生命周期短，无需持久化     |
| 临时缓存   | Memory/State | 生命周期短，无需持久化     |

---

## 最佳实践

### Preference 使用

```typescript
// ✅ 推荐：使用专用 hooks
const { theme, setTheme } = useSettings()

// ✅ 推荐：批量操作使用 useMultiplePreferences
const prefs = useMultiplePreferences(['user.name', 'user.avatar'])

// ⚠️ 注意：setter 是异步的
await setTheme('dark') // 或者
setTheme('dark').catch(console.error)

// ❌ 避免：不要在非 React 上下文使用 hooks
// 应该使用 preferenceService.get/set
```

### SQLite 操作

```typescript
// ✅ 推荐：使用 Drizzle ORM
const topics = await db.select().from(topicsTable).where(eq(topicsTable.assistant_id, assistantId))

// ✅ 推荐：使用索引字段查询
const messages = await db
  .select()
  .from(messagesTable)
  .where(eq(messagesTable.topic_id, topicId))
  .orderBy(desc(messagesTable.created_at))

// ❌ 避免：不要直接使用 SQL 字符串（除非必要）
```

---

## 数据迁移

从旧版本迁移到新架构时：

1. **Redux → Preference 迁移**：
   - 旧的 `settings`、`topic`、`websearch`、`app` slices 已迁移到 Preference
   - `runtime` slice 已被删除（未使用的功能）
   - 数据会在首次启动时自动从 Redux AsyncStorage 迁移到 SQLite（如需要）

2. **数据库架构更新**：
   - 使用 Drizzle ORM 自动管理迁移
   - 迁移文件位于 `drizzle/` 目录
   - 应用启动时自动执行待执行的迁移

3. **向后兼容**：
   - PreferenceService 会在读取不存在的 key 时返回默认值
   - 确保平滑升级体验

---

## 总结

Cherry Studio 采用混合存储策略：

- **Preference System (SQLite)**: 管理所有用户配置和应用状态（10 项）
- **Topic System (Service + Cache)**: 管理对话话题，提供三层缓存和乐观更新
- **Assistant System (Service + Cache)**: 管理 AI 助手配置，提供三层缓存和乐观更新
- **Provider System (Service + Cache)**: 管理 LLM 服务提供商，提供三层缓存和乐观更新
- **MCP System (Service + Cache)**: 管理 MCP 服务器配置，提供两层缓存和乐观更新
- **Redux Store**: 遗留的内置助手配置（已废弃，迁移到 AssistantService）
- **SQLite Database**: 存储所有实体数据和关系数据

### 核心架构特点

**Preference System**

- 懒加载，按需读取
- 乐观更新，零延迟 UI
- 基于 useSyncExternalStore
- 自动回滚机制

**Topic System**

- 三层缓存：当前主题 + LRU(5) + 全量缓存(TTL 5min)
- 智能缓存管理，自动驱逐
- 乐观更新，所有 CRUD 操作零延迟
- 完整的订阅系统
- 并发控制，防止竞态

**Assistant System**

- 三层缓存：系统助手(永久) + LRU(10) + 全量缓存(TTL 5min)
- 系统助手永久驻留内存，极致性能优化
- 乐观更新，所有 CRUD 操作零延迟
- 完整的订阅系统
- 并发控制，防止竞态
- 支持高频访问场景（自动命名、翻译）

**Provider System**

- 三层缓存：默认 Provider(永久) + LRU(10) + 全量缓存(TTL 5min)
- 默认 Provider 永久驻留内存，极致性能优化
- 乐观更新，所有 CRUD 操作零延迟
- 完整的订阅系统
- 并发控制，防止竞态
- 支持高频访问场景（每次 AI 对话）
- ⚠️ 存在架构不一致问题（useAllProviders 使用 useLiveQuery，需要统一）

**MCP System**

- 两层缓存：LRU(20) + 全量缓存(TTL 5min)
- 简化的缓存策略，无永久缓存
- 工具列表不缓存，确保数据新鲜
- 乐观更新，所有 CRUD 操作零延迟
- 完整的订阅系统
- 并发控制，防止竞态
- 调试工具支持（McpCacheDebug 组件）

**性能优势**

- ✅ 类型安全（TypeScript 全面覆盖）
- ✅ 高性能（缓存命中率 ~90%+，系统助手/默认 Provider 100%）
- ✅ 良好的开发体验（hooks + 调试工具）
- ✅ 数据持久化（SQLite + 乐观更新）
- ✅ 离线支持（本地优先）
- ✅ 易于维护和扩展（单例 + 清晰架构）

**最佳实践建议**

- 简单配置使用 Preference System
- 对话相关使用 Topic System
- AI 助手相关使用 Assistant System
- LLM 提供商相关使用 Provider System
- MCP 服务器相关使用 MCP System
- 实体数据直接使用 SQLite + Drizzle ORM
- 临时状态使用 React State / Memory

**性能对比**

| 系统       | 缓存策略                      | 最快访问                     | 适用场景           |
| ---------- | ----------------------------- | ---------------------------- | ------------------ |
| Preference | 懒加载 + 内存缓存             | ~1ms                         | 用户配置、应用状态 |
| Topic      | 当前主题 + LRU(5) + TTL       | ~0ms (当前), ~1ms (LRU)      | 对话管理           |
| Assistant  | 系统助手 + LRU(10) + TTL      | ~0ms (系统), ~1ms (LRU)      | AI 助手管理        |
| Provider   | 默认 Provider + LRU(10) + TTL | ~0ms (默认), ~1ms (LRU)      | LLM 提供商管理     |
| MCP        | LRU(20) + TTL                 | ~1ms (LRU), ~0ms (all cache) | MCP 服务器管理     |
| SQLite     | 索引查询                      | ~10-50ms                     | 实体数据、关系查询 |
