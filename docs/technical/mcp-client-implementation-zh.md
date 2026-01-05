# MCP Client 移动端实现计划

## 概述

为 Cherry Studio 移动端实现 MCP (Model Context Protocol) Client 功能，参考桌面端实现架构，适配 React Native 环境。

**范围限定**:

- ✅ 支持 HTTP/SSE + 内置工具传输
- ✅ 支持 MCP OAuth 认证 (Fork 传输层实现)
- ❌ 暂不需要用户审批功能
- ❌ 暂不需要资源 (Resources) 和提示词 (Prompts) 功能
- ❌ 不支持 stdio 传输 (移动端限制)

---

## 已完成的工作 ✅

### 1. 传输层 (`@cherrystudio/react-native-streamable-http` v1.0.0)

- `RNStreamableHTTPClientTransport` - 实现 MCP SDK Transport 接口
- `RNEventSourceParser` - SSE 事件流解析
- 支持 XMLHttpRequest + fetch 双重方式
- Session ID / Protocol Version 管理

### 2. 测试界面 (`src/screens/settings/test/StreamableHttpTestScreen.tsx`)

- 连接 MCP 服务器
- 获取工具列表 (`listTools`)
- 调用工具 (`callTool`)
- 连接状态管理
- 工具参数输入/结果展示

### 3. 现有基础设施

- `src/services/McpService.ts` - MCP 服务器配置管理 (LRU缓存、订阅系统)
- `src/config/mcp.ts` - 内置工具定义 (`BUILTIN_TOOLS`)
- `src/types/mcp.ts` - 完整类型定义
- `src/aiCore/utils/mcp.ts` - AI SDK 工具转换
- `src/aiCore/legacy/middleware/core/McpToolChunkMiddleware.ts` - 工具执行中间件 (已注释)
- `src/aiCore/tools/SystemTools.ts` - 内置系统工具实现

---

## 调用链分析

### 移动端 MCP 工具调用链 (新 AI Core 路径)

```
sequenceDiagram
    participant AI as AI Core (streamText)
    participant Utils as aiCore/utils/mcp.ts
    participant Tool as utils/mcpTool.ts
    participant Service as McpClientService
    participant Client as MCP SDK Client
    participant Server as MCP Server

    AI->>Utils: tool.execute() (from model tool_call)
    Utils->>Tool: callMCPTool(toolResponse)
    Tool->>Service: mcpClientService.callTool(server, name, args)
    Service->>Client: client.callTool({ name, arguments })
    Client->>Server: MCP callTool request
    Server-->>Client: MCP response
    Client-->>Service: CallToolResult
    Service-->>Tool: MCPCallToolResponse
    Tool-->>Utils: result
    Utils-->>AI: tool result → response pipeline
```

### 关键入口文件

| 文件                                   | 作用                                                |
| -------------------------------------- | --------------------------------------------------- |
| `src/aiCore/utils/mcp.ts`              | 将 MCPTool 转换为 AI SDK Tool，定义 `execute` 回调  |
| `src/utils/mcpTool.ts`                 | `callMCPTool()` - **核心工具执行函数 (当前未实现)** |
| `src/services/McpService.ts`           | MCP 服务器配置管理、`getMcpTools()`                 |
| `src/services/mcp/McpClientService.ts` | **待创建** - MCP 客户端连接管理                     |

### 与桌面端的区别

| 桌面端 (Electron)                  | 移动端 (React Native)                |
| ---------------------------------- | ------------------------------------ |
| Renderer → IPC → Main → MCPService | AI Core → mcpTool → McpClientService |
| `window.api.mcp.callTool()`        | `mcpClientService.callTool()`        |
| Main 进程管理连接                  | 单进程直接调用                       |

---

## 待实现功能

### Step 1: McpClientService 核心服务 🔴 P0

**新建文件**: `src/services/mcp/McpClientService.ts`

将测试界面中的客户端逻辑提取为可复用的单例服务。

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { RNStreamableHTTPClientTransport } from '@cherrystudio/react-native-streamable-http'

class McpClientService {
  private static instance: McpClientService
  private clients: Map<string, Client> = new Map()
  private pendingClients: Map<string, Promise<Client>> = new Map()
  private toolsCache: Map<string, { tools: MCPTool[]; timestamp: number }> = new Map()
  private readonly TOOLS_TTL = 5 * 60 * 1000 // 5 minutes

  public static getInstance(): McpClientService

  // 获取或创建客户端连接 (复用 StreamableHttpTestScreen 中的逻辑)
  public async getClient(server: MCPServer): Promise<Client>

  // 关闭客户端连接
  public async closeClient(serverId: string): Promise<void>

  // 获取工具列表 (带缓存)
  public async listTools(server: MCPServer): Promise<MCPTool[]>

  // 调用工具
  public async callTool(
    server: MCPServer,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPCallToolResponse>

  // 检查连接状态
  public async checkConnectivity(server: MCPServer): Promise<boolean>

  // 清理所有连接 (应用退出时调用)
  public async cleanup(): Promise<void>
}

export const mcpClientService = McpClientService.getInstance()
```

**实现要点**:

- 参考 `StreamableHttpTestScreen.tsx` 中的 `ensureClient()` 逻辑
- 使用 `RNStreamableHTTPClientTransport` 创建传输层
- 客户端池管理 (Map 存储，按复合 key 索引，避免 baseUrl/headers 变更导致复用旧连接)
- 工具列表缓存 (TTL: 5分钟)
- 错误处理和日志记录
- 传输层注入 `server.headers` (用于自定义鉴权 header)
- 统一工具映射：`listTools()` 需将 SDK tools 转为 `MCPTool`，并生成全局唯一 `id`
  - 建议规则：`mcp:${server.id}:${tool.name}`，确保多服务器不会冲突

---

### Step 2: 实现 callMCPTool 工具执行 🔴 P0

**修改文件**: `src/utils/mcpTool.ts` (L117-174)

当前 `callMCPTool` 函数抛出 `throw new Error('Not implemented')`，需要实现：

```typescript
import { mcpClientService } from '@/services/mcp/McpClientService'
import { mcpService } from '@/services/McpService'

export async function callMCPTool(
  toolResponse: MCPToolResponse,
  _topicId?: string,
  _modelName?: string
): Promise<MCPCallToolResponse> {
  const { tool, arguments: args } = toolResponse

  logger.info(`Calling Tool: ${tool.serverName} ${tool.name}`, tool)

  // 内置工具 - 本地执行 (已有 SystemTools 实现)
  if (tool.isBuiltIn) {
    const result = await callBuiltInTool(toolResponse)
    if (result) return result
    // 如果 callBuiltInTool 返回 undefined，继续尝试通过 MCP 调用
  }

  // 外部 MCP 服务器 - 通过 McpClientService 调用
  const server = await mcpService.getMcpServer(tool.serverId)
  if (!server) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Server ${tool.serverId} not found` }]
    }
  }

  try {
    return await mcpClientService.callTool(server, tool.name, args || {})
  } catch (error) {
    logger.error(`Error calling Tool: ${tool.serverName} ${tool.name}`, error as Error)
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error calling tool ${tool.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ]
    }
  }
}
```

---

### Step 3: 实现 getMcpServerByTool 🔴 P0

**修改文件**: `src/utils/mcpTool.ts` (L316-320)

当前 `getMcpServerByTool` 抛出 `throw new Error('Function not implemented.')`：

```typescript
export function getMcpServerByTool(tool: MCPTool): MCPServer | undefined {
  // 使用 McpService 获取服务器配置
  const server = mcpService.getMcpServerCached(tool.serverId)
  return server ?? undefined
}
```

---

### Step 4: 修改 McpService.getMcpTools 🔴 P0

**修改文件**: `src/services/McpService.ts` (L300-L322)

将静态配置改为动态获取 + 静态回退：

````typescript
public async getMcpTools(mcpId: string): Promise<MCPTool[]> {
  const mcpServer = await this.getMcpServer(mcpId)
  if (!mcpServer) return []

  let tools: MCPTool[] = []

  if (mcpServer.type === 'inMemory') {
    // 内置工具从静态配置获取
    tools = BUILTIN_TOOLS[mcpServer.id] || []
  } else if (mcpServer.type === 'streamableHttp' || mcpServer.type === 'sse') {
    // 外部服务器通过 MCP 协议动态获取
    try {
      tools = await mcpClientService.listTools(mcpServer)
    } catch (error) {
      logger.error(`Failed to list tools for ${mcpServer.name}`, error as Error)
      return []
    }
  }

  // 过滤禁用的工具
  return tools.filter(tool => !mcpServer.disabledTools?.includes(tool.name))
}

---

### 补充注意事项 (计划修订)

1. **工具 ID 一致性**
   - `listTools()` 必须生成稳定且唯一的 `tool.id`，否则多服务器工具会冲突。
   - 需保证 `openAIToolsToMcpTool()` 的 `id/name` 匹配逻辑可回溯到同一个工具。

2. **客户端 key 与配置变更**
   - `serverId` 不足以做缓存 key，需包含 `baseUrl/headers/type/timeout` 等关键字段。
   - 配置变更后要能触发新连接，避免复用旧会话。

3. **SSE 分支处理**
   - 若 Step 5 尚未实现 SSE 传输，`mcpServer.type === 'sse'` 应明确返回空或提示未支持，避免误走通道。

4. **超时与权限**
   - `server.timeout` 应映射到 `client.callTool()` 的 timeout 选项。
   - `server.headers` 需要透传到 transport 的 requestInit。

---

### Step 5: SSE 传输支持 (可选) 🟡 P1

**新建文件**: `src/services/mcp/transports/RNSSETransport.ts`

如果需要支持 SSE 类型的 MCP 服务器 (baseUrl 以 `/sse` 结尾)。

```typescript
import EventSource from 'react-native-sse'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport'

export class RNSSEClientTransport implements Transport {
  // 使用 react-native-sse 实现
  // 参考桌面端 SSEClientTransport 实现
}
````

---

### Step 6: UI 增强 🟡 P1

**修改文件**: `src/screens/mcp/` 相关界面

1. **添加服务器类型选择**
   - `inMemory` (内置)
   - `streamableHttp` (HTTP)
   - `sse` (SSE)

2. **连接状态显示**
   - 已连接 / 连接中 / 已断开

3. **连接测试按钮**
   - 调用 `mcpClientService.checkConnectivity()`

4. **工具列表预览**
   - 显示服务器提供的工具

---

### Step 7: MCP OAuth 支持 🟡 P1

为需要 OAuth 认证的 MCP 服务器提供支持。

#### 方案选择：Fork react-native-streamable-http

`react-native-streamable-http` **不支持** `authProvider` 选项，而官方 SDK 的 `StreamableHTTPClientTransport` 支持。

**两种实现方案对比**：

| 方案                    | 代码量  | 优点                                                                    | 缺点                                                  |
| ----------------------- | ------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| **Fork 传输层（推荐）** | ~50 行  | 复用 SDK `auth()` 函数；传输层自动处理 token；McpClientService 几乎不改 | 需维护 fork                                           |
| 应用层实现              | ~300 行 | 无外部依赖                                                              | 手动注入 token；OAuth 逻辑分散；重复实现 SDK 已有功能 |

**选择 Fork 方案的原因**：

1. SDK 的 `auth()` 函数已实现完整 OAuth 流程（元数据发现、PKCE、token 交换、刷新）
2. 代码更少，职责分离更清晰
3. OAuth 逻辑集中在传输层，McpClientService 保持简洁

#### 前置条件（已满足）

- ✅ `expo-web-browser`: ^15.0.7 已安装
- ✅ `expo-linking`: ^8.0.8 已安装
- ✅ App scheme: `cherry-studio` 已配置
- ✅ MMKV 存储已可用

#### 7.1 Fork 传输层

**Fork 仓库**: `react-native-streamable-http`

在 Fork 中添加 `authProvider` 支持（参考官方 SDK 实现）：

```typescript
// 1. 扩展构造函数选项
export interface RNStreamableHTTPClientTransportOptions {
  fetch?: typeof fetch
  requestInit?: RequestInit
  sessionId?: string
  authProvider?: OAuthClientProvider  // 新增
}

// 2. 修改 _commonHeaders() 注入 Bearer token
async _commonHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}

  // 从 authProvider 获取 token
  if (this._authProvider) {
    const tokens = await this._authProvider.tokens()
    if (tokens?.access_token) {
      headers['Authorization'] = `Bearer ${tokens.access_token}`
    }
  }
  // ... 其他 headers
  return headers
}

// 3. send() 方法添加 401 检测
async send(message: JSONRPCMessage): Promise<void> {
  const response = await fetch(this._url, { ... })

  if (response.status === 401 && this._authProvider) {
    // 调用 SDK 的 auth() 函数处理完整 OAuth 流程
    await auth(this._authProvider, { serverUrl: this._url })
    // 重试请求
    return this.send(message)
  }
  // ...
}
```

#### 7.2 MobileOAuthProvider

**新建文件**: `src/services/mcp/oauth/MobileOAuthProvider.ts`

实现 `OAuthClientProvider` 接口（SDK 需要）：

```typescript
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthTokens, OAuthClientMetadata } from '@modelcontextprotocol/sdk/shared/auth.js'
import * as WebBrowser from 'expo-web-browser'
import { mmkvStorage } from '@/storage/mmkv'

const STORAGE_PREFIX = 'mcp_oauth_'
const REDIRECT_URL = 'cherry-studio://oauth/callback'

export class MobileOAuthProvider implements OAuthClientProvider {
  private serverHash: string

  constructor(serverHash: string) {
    this.serverHash = serverHash
  }

  get redirectUrl(): string {
    return REDIRECT_URL
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Cherry Studio App'
    }
  }

  // SDK 调用此方法打开浏览器进行授权
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    const result = await WebBrowser.openAuthSessionAsync(authorizationUrl.toString(), this.redirectUrl)

    if (result.type !== 'success') {
      throw new Error(`OAuth flow cancelled: ${result.type}`)
    }

    // 解析回调 URL 获取授权码，SDK 会继续处理
    const callbackUrl = new URL(result.url)
    const code = callbackUrl.searchParams.get('code')
    if (!code) {
      throw new Error('No authorization code in callback')
    }

    // 注意：SDK 的 auth() 函数会从 redirectUrl 参数中获取 code
    // 这里需要将 code 传递给 SDK（具体实现取决于 SDK 版本）
  }

  // Token 存储方法
  async tokens(): Promise<OAuthTokens | undefined> {
    const data = mmkvStorage.getString(`${STORAGE_PREFIX}${this.serverHash}_tokens`)
    return data ? JSON.parse(data) : undefined
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    mmkvStorage.set(`${STORAGE_PREFIX}${this.serverHash}_tokens`, JSON.stringify(tokens))
  }

  // Code verifier 存储方法 (PKCE)
  async codeVerifier(): Promise<string> {
    const verifier = mmkvStorage.getString(`${STORAGE_PREFIX}${this.serverHash}_verifier`)
    return verifier || ''
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    mmkvStorage.set(`${STORAGE_PREFIX}${this.serverHash}_verifier`, codeVerifier)
  }

  // 客户端信息存储
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    const data = mmkvStorage.getString(`${STORAGE_PREFIX}${this.serverHash}_client`)
    return data ? JSON.parse(data) : undefined
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    mmkvStorage.set(`${STORAGE_PREFIX}${this.serverHash}_client`, JSON.stringify(info))
  }
}
```

#### 7.3 修改 McpClientService（极简）

**修改文件**: `src/services/mcp/McpClientService.ts`

只需在创建传输层时传入 `authProvider`：

```typescript
import { MobileOAuthProvider } from './oauth/MobileOAuthProvider'
import { generateHash } from '@/utils/hash'

private async createClient(server: MCPServer, serverKey: string): Promise<Client> {
  const baseUrl = server.baseUrl
  if (!baseUrl) {
    throw new Error(`No baseUrl configured for server: ${server.name}`)
  }

  // 创建 OAuth provider（如果需要）
  const serverHash = generateHash(baseUrl)
  const authProvider = new MobileOAuthProvider(serverHash)

  // 传输层自动处理 OAuth
  const transport = new RNStreamableHTTPClientTransport(baseUrl, {
    requestInit: server.headers ? { headers: server.headers } : undefined,
    authProvider  // Fork 后的传输层支持此选项
  })

  // ... 其他代码保持不变 ...
}
```

#### 7.4 更新 package.json

将依赖指向 Fork：

```json
{
  "dependencies": {
    "@cherrystudio/react-native-streamable-http": "github:kangfenmao/react-native-streamable-http#oauth"
  }
}
```

#### OAuth 流程图（Fork 方案）

```
用户尝试连接需要 OAuth 的 MCP 服务器
           │
           ▼
McpClientService.createClient(server)
           │
           ▼
创建 MobileOAuthProvider + RNStreamableHTTPClientTransport
           │
           ▼
Transport.send() 发送请求
           │
           ├─── 成功 ──────────────────────────────► 返回响应
           │
           └─── 401 Unauthorized ──┐
                                   │
           ┌───────────────────────┘
           ▼
Transport 检测到 authProvider 存在
           │
           ▼
调用 SDK auth(authProvider, { serverUrl })
           │
           ▼
SDK 自动处理完整 OAuth 流程：
  1. 发现 OAuth 元数据
  2. 生成 PKCE code_verifier
  3. 调用 authProvider.saveCodeVerifier()
  4. 调用 authProvider.redirectToAuthorization()
           │
           ▼
MobileOAuthProvider.redirectToAuthorization()
  → WebBrowser.openAuthSessionAsync(authUrl, redirectUrl)
           │
           ▼
用户在浏览器中完成授权
           │
           ▼
浏览器重定向到 cherry-studio://oauth/callback?code=xxx
           │
           ▼
openAuthSessionAsync 返回 result
           │
           ▼
SDK 继续处理：
  1. exchangeAuthorization() 交换 token
  2. 调用 authProvider.saveTokens()
           │
           ▼
Transport 重试原始请求（带 Authorization header）
           │
           ▼
返回响应
```

**Fork 方案的优势**：

- Transport 层自动处理 401 → OAuth 流程 → 重试
- SDK 的 `auth()` 函数处理所有复杂逻辑
- `MobileOAuthProvider` 只需实现存储接口
- `McpClientService` 几乎不需要修改

---

## 文件清单

### 新建文件

| 文件                                            | 描述                | 优先级 |
| ----------------------------------------------- | ------------------- | ------ |
| `src/services/mcp/McpClientService.ts`          | MCP 客户端核心服务  | P0     |
| `src/services/mcp/transports/RNSSETransport.ts` | SSE 传输 (可选)     | P1     |
| `src/services/mcp/oauth/MobileOAuthProvider.ts` | OAuth Provider 实现 | P1     |

### 修改文件

| 文件                                   | 修改内容                                                | 优先级 |
| -------------------------------------- | ------------------------------------------------------- | ------ |
| `src/utils/mcpTool.ts`                 | `callMCPTool` + `getMcpServerByTool` 实现               | P0     |
| `src/services/McpService.ts`           | `getMcpTools` 动态获取                                  | P0     |
| `src/services/mcp/McpClientService.ts` | 添加 authProvider 到传输层                              | P1     |
| `package.json`                         | 指向 Fork 的 @cherrystudio/react-native-streamable-http | P1     |

### 外部仓库

| 仓库                                                | 修改内容               | 优先级 |
| --------------------------------------------------- | ---------------------- | ------ |
| `@cherrystudio/react-native-streamable-http` (Fork) | 添加 authProvider 支持 | P1     |

---

## 实现顺序

```
Step 1: McpClientService (核心服务)
   ↓
Step 2: callMCPTool (工具调用)
   ↓
Step 3: getMcpServerByTool (服务器查找)
   ↓
Step 4: McpService.getMcpTools (动态获取)
   ↓
测试: 完整的 AI 对话中使用 MCP 工具
   ↓
Step 5: SSE 传输支持 (可选)
   ↓
Step 6: UI 增强 (可选)
   ↓
Step 7: MCP OAuth 支持 (可选)
   ↓
测试: 需要 OAuth 的 MCP 服务器
```

---

## 测试验证

### 测试场景

1. **单独测试** - 使用 `StreamableHttpTestScreen` 连接外部 MCP 服务器
2. **集成测试** - 在 AI 对话中触发工具调用，验证完整流程

### 验证清单

- [ ] `McpClientService.listTools()` 返回正确的工具列表
- [ ] `McpClientService.callTool()` 执行成功
- [ ] `McpService.getMcpTools()` 对外部服务器返回动态工具
- [ ] AI 对话中模型能发现并调用外部 MCP 工具
- [ ] 工具执行结果正确显示在消息中
- [ ] 内置工具 (fetch/time/calendar) 仍正常工作
- [ ] OAuth 流程: 首次连接需要 OAuth 的服务器触发授权
- [ ] OAuth 流程: 授权完成后自动重连成功
- [ ] OAuth 流程: Token 刷新正常工作
- [ ] OAuth 流程: 用户取消授权时正确处理错误

### 推荐测试服务器

- **Cloudflare AI Gateway MCP**
- **本地运行的 mcp-server-fetch (HTTP 模式)**
- **需要 OAuth 的 MCP 服务器** (用于测试 OAuth 流程)

---

## 代码参考

### 从测试界面复用的逻辑

`StreamableHttpTestScreen.tsx` 中可以直接复用到 `McpClientService`:

```typescript
// 连接逻辑 (L91-L143)
const transport = new RNStreamableHTTPClientTransport(url)
const client = new Client({ name: 'cherry-studio-app', version: '...' }, { capabilities: {} })
await client.connect(transport)

// 工具列表 (L145-L156)
const response = await client.listTools()

// 工具调用 (L176-L187)
const response = await client.callTool({ name: toolName, arguments: args })
```

### 桌面端参考

`cherry-studio/src/main/services/MCPService.ts` 中的设计模式:

- 客户端池 (`clients: Map<string, Client>`)
- 待连接队列 (`pendingClients: Map<string, Promise<Client>>`)
- 缓存策略 (`withCache` 高阶函数)
- 服务器 Key 生成 (`getServerKey`)
- 健康检查 (`ping`)
