/**
 * McpClientService - MCP Client connection management service
 *
 * Manages MCP client connections for external MCP servers (streamableHttp).
 * Provides client pooling, tool caching, and tool execution functionality.
 *
 * Design:
 * - Singleton pattern for global access
 * - Client pool with composite key (baseUrl + headers hash)
 * - Tools cache with 5-minute TTL
 * - Pending connections deduplication
 * - OAuth support via MobileOAuthProvider (requires forked transport)
 */

import { RNStreamableHTTPClientTransport } from '@cherrystudio/react-native-streamable-http'
import { Client } from '@modelcontextprotocol/sdk/client'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { InteractionManager } from 'react-native'

import { dismissDialog, presentDialog } from '@/componentsV2/base/Dialog/useDialogManager'
import i18n from '@/i18n'
import { loggerService } from '@/services/LoggerService'
import type { ConnectivityResult, MCPCallToolResponse, MCPServer, OAuthTriggerResult } from '@/types/mcp'
import type { MCPTool } from '@/types/tool'

import { createMobileOAuthProvider, performOAuthFlow } from './oauth'

const logger = loggerService.withContext('McpClientService')

/**
 * Generate a composite cache key for an MCP server connection
 * Includes baseUrl, headers, and type to detect config changes
 */
function generateServerKey(server: MCPServer): string {
  const headersHash = server.headers ? JSON.stringify(server.headers) : ''
  return `${server.id}:${server.baseUrl || ''}:${headersHash}:${server.type || ''}`
}

/**
 * Generate a unique tool ID for an MCP tool
 * Format: mcp:${serverId}:${toolName}
 */
function generateToolId(serverId: string, toolName: string): string {
  return `mcp:${serverId}:${toolName}`
}

/**
 * Convert MCP SDK Tool to MCPTool type
 */
function sdkToolToMcpTool(tool: Tool, server: MCPServer): MCPTool {
  return {
    id: generateToolId(server.id, tool.name),
    serverId: server.id,
    serverName: server.name,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as MCPTool['inputSchema'],
    isBuiltIn: false,
    type: 'mcp'
  }
}

function isUnauthorizedError(error: unknown): boolean {
  if (!error) return false
  const maybeStatus = (error as { status?: number }).status
  if (maybeStatus === 401) return true
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('401') || message.includes('Unauthorized')
}

interface ClientEntry {
  client: Client
  transport: RNStreamableHTTPClientTransport
  serverKey: string
}

interface ToolsCacheEntry {
  tools: MCPTool[]
  timestamp: number
}

class McpClientService {
  // ==================== Singleton ====================
  private static instance: McpClientService

  private constructor() {
    logger.debug('McpClientService instance created')
  }

  public static getInstance(): McpClientService {
    if (!McpClientService.instance) {
      McpClientService.instance = new McpClientService()
    }
    return McpClientService.instance
  }

  // ==================== Client Pool ====================

  /**
   * Connected clients indexed by server ID
   * Note: serverKey is stored in ClientEntry for validation
   */
  private clients = new Map<string, ClientEntry>()

  /**
   * Pending client connections to prevent duplicate concurrent connections
   */
  private pendingClients = new Map<string, Promise<Client>>()

  // ==================== Tools Cache ====================

  /**
   * Tools cache indexed by server ID
   * TTL: 5 minutes
   */
  private toolsCache = new Map<string, ToolsCacheEntry>()

  /**
   * Tools cache TTL in milliseconds (5 minutes)
   */
  private readonly TOOLS_TTL = 5 * 60 * 1000

  /**
   * Auth prompt cooldown to avoid repeated dialogs
   */
  private readonly AUTH_PROMPT_COOLDOWN = 30 * 1000

  /**
   * Track last auth prompt time per server
   */
  private authPromptedAt = new Map<string, number>()

  // ==================== Public API ====================

  /**
   * Get or create a client connection for an MCP server
   *
   * Handles:
   * - Connection reuse (same server key)
   * - Reconnection on config change
   * - Pending connection deduplication
   */
  public async getClient(server: MCPServer): Promise<Client> {
    const serverKey = generateServerKey(server)

    // Check if we have a valid cached client
    const existingEntry = this.clients.get(server.id)
    if (existingEntry && existingEntry.serverKey === serverKey) {
      logger.verbose(`Reusing existing client for server: ${server.name}`)
      return existingEntry.client
    }

    // If config changed, close old client
    if (existingEntry && existingEntry.serverKey !== serverKey) {
      logger.info(`Config changed for server ${server.name}, reconnecting...`)
      await this.closeClient(server.id)
    }

    // Check if connection is in progress
    const pendingConnection = this.pendingClients.get(server.id)
    if (pendingConnection) {
      logger.verbose(`Waiting for pending connection: ${server.name}`)
      return await pendingConnection
    }

    // Create new connection
    const connectionPromise = this.createClient(server, serverKey)
    this.pendingClients.set(server.id, connectionPromise)

    try {
      const client = await connectionPromise
      return client
    } finally {
      this.pendingClients.delete(server.id)
    }
  }

  /**
   * Close a client connection
   */
  public async closeClient(serverId: string): Promise<void> {
    const entry = this.clients.get(serverId)
    if (!entry) {
      return
    }

    logger.info(`Closing client for server: ${serverId}`)

    try {
      await entry.client.close()
    } catch (error) {
      logger.error(`Error closing client for ${serverId}:`, error as Error)
    }

    try {
      await entry.transport.close()
    } catch (error) {
      logger.error(`Error closing transport for ${serverId}:`, error as Error)
    }

    this.clients.delete(serverId)

    // Also invalidate tools cache
    this.toolsCache.delete(serverId)
  }

  /**
   * Get tools list for an MCP server
   *
   * Returns cached tools if valid, otherwise fetches from server.
   */
  public async listTools(server: MCPServer): Promise<MCPTool[]> {
    // Check SSE type - not yet supported
    if (server.type === 'sse') {
      logger.warn(`SSE transport not yet supported for server: ${server.name}`)
      return []
    }

    // Check cache
    const cached = this.toolsCache.get(server.id)
    if (cached && Date.now() - cached.timestamp < this.TOOLS_TTL) {
      logger.verbose(`Using cached tools for server: ${server.name}`)
      return cached.tools
    }

    // Fetch from server
    try {
      const client = await this.getClient(server)
      const response = await client.listTools()

      const tools = (response.tools || []).map(tool => sdkToolToMcpTool(tool, server))

      // Update cache
      this.toolsCache.set(server.id, {
        tools,
        timestamp: Date.now()
      })

      logger.info(`Fetched ${tools.length} tools from server: ${server.name}`)
      return tools
    } catch (error) {
      this.maybePromptAuth(server, error)
      logger.error(`Failed to list tools for server ${server.name}:`, error as Error)
      throw error
    }
  }

  /**
   * Call a tool on an MCP server
   */
  public async callTool(
    server: MCPServer,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPCallToolResponse> {
    // Check SSE type - not yet supported
    if (server.type === 'sse') {
      return {
        isError: true,
        content: [{ type: 'text', text: `SSE transport not yet supported for server: ${server.name}` }]
      }
    }

    try {
      const client = await this.getClient(server)

      logger.info(`Calling tool ${toolName} on server ${server.name}`, { args })

      const response = await client.callTool({
        name: toolName,
        arguments: args
      })

      logger.info(`Tool ${toolName} response:`, response)

      // Convert SDK response to MCPCallToolResponse
      const contentArray = Array.isArray(response.content) ? response.content : []
      return {
        isError: response.isError === true,
        content: contentArray.map(item => {
          if (typeof item === 'string') {
            return { type: 'text' as const, text: item }
          }
          // Handle different content types from MCP SDK
          if (typeof item === 'object' && item !== null && 'type' in item) {
            switch (item.type) {
              case 'text':
                return { type: 'text' as const, text: (item as { text?: string }).text || '' }
              case 'image':
                return {
                  type: 'image' as const,
                  data: (item as { data?: string }).data,
                  mimeType: (item as { mimeType?: string }).mimeType
                }
              case 'resource':
                return {
                  type: 'resource' as const,
                  resource: (item as { resource?: unknown }).resource as MCPCallToolResponse['content'][0]['resource']
                }
              default:
                return { type: 'text' as const, text: JSON.stringify(item) }
            }
          }
          return { type: 'text' as const, text: JSON.stringify(item) }
        })
      }
    } catch (error) {
      this.maybePromptAuth(server, error)
      logger.error(`Error calling tool ${toolName} on server ${server.name}:`, error as Error)
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error calling tool ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      }
    }
  }

  /**
   * Check connectivity to an MCP server
   * Returns structured result with error details
   */
  public async checkConnectivity(server: MCPServer): Promise<ConnectivityResult> {
    try {
      const client = await this.getClient(server)
      // Try listing tools as a health check
      await client.listTools()
      return { connected: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.warn(`Connectivity check failed for ${server.name}:`, error as Error)

      // Determine error code based on error message
      let errorCode: ConnectivityResult['errorCode'] = 'UNKNOWN'
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('OAuth')) {
        errorCode = 'AUTH_REQUIRED'
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        errorCode = 'TIMEOUT'
      } else if (
        errorMessage.includes('Network') ||
        errorMessage.includes('network') ||
        errorMessage.includes('fetch')
      ) {
        errorCode = 'NETWORK_ERROR'
      } else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
        errorCode = 'SERVER_ERROR'
      }

      return {
        connected: false,
        error: errorMessage,
        errorCode
      }
    }
  }

  /**
   * Cleanup all connections
   * Should be called when app is closing
   */
  public async cleanup(): Promise<void> {
    logger.info('Cleaning up all MCP client connections')

    const closePromises = Array.from(this.clients.keys()).map(serverId => this.closeClient(serverId))

    await Promise.allSettled(closePromises)

    this.clients.clear()
    this.pendingClients.clear()
    this.toolsCache.clear()

    logger.info('All MCP client connections cleaned up')
  }

  /**
   * Invalidate tools cache for a specific server
   */
  public invalidateToolsCache(serverId: string): void {
    this.toolsCache.delete(serverId)
    logger.verbose(`Invalidated tools cache for server: ${serverId}`)
  }

  /**
   * Invalidate all tools caches
   */
  public invalidateAllToolsCaches(): void {
    this.toolsCache.clear()
    logger.verbose('Invalidated all tools caches')
  }

  /**
   * Manually trigger OAuth flow for an MCP server
   *
   * This allows users to authenticate before making any requests,
   * rather than waiting for a 401 response to trigger the flow.
   *
   * @param serverUrl - The base URL of the MCP server
   * @returns Structured result with success status and error details
   */
  public async triggerOAuth(serverUrl: string): Promise<OAuthTriggerResult> {
    if (!serverUrl) {
      logger.warn('Cannot trigger OAuth: no server URL provided')
      return {
        success: false,
        error: 'No server URL provided',
        errorCode: 'NO_URL'
      }
    }

    logger.info(`Manually triggering OAuth flow for: ${serverUrl}`)

    try {
      // Use our custom OAuth flow that handles the complete flow:
      // 1. Discover OAuth metadata from the server
      // 2. Register client dynamically (if needed)
      // 3. Generate PKCE code_verifier and code_challenge
      // 4. Open browser for authorization
      // 5. Exchange authorization code for tokens
      // 6. Save tokens to storage
      const success = await performOAuthFlow(serverUrl)

      if (success) {
        return { success: true }
      } else {
        return {
          success: false,
          error: 'OAuth flow was cancelled',
          errorCode: 'USER_CANCELLED'
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('OAuth flow failed:', error as Error)

      // Determine error code based on error message
      let errorCode: OAuthTriggerResult['errorCode'] = 'UNKNOWN'
      if (errorMessage.includes('cancelled') || errorMessage.includes('Cancelled')) {
        errorCode = 'USER_CANCELLED'
      } else if (errorMessage.includes('discover') || errorMessage.includes('metadata')) {
        errorCode = 'DISCOVERY_FAILED'
      } else if (errorMessage.includes('register') || errorMessage.includes('registration')) {
        errorCode = 'REGISTRATION_FAILED'
      } else if (errorMessage.includes('token') || errorMessage.includes('exchange')) {
        errorCode = 'TOKEN_EXCHANGE_FAILED'
      } else if (errorMessage.includes('state') || errorMessage.includes('CSRF')) {
        errorCode = 'STATE_MISMATCH'
      }

      return {
        success: false,
        error: errorMessage,
        errorCode
      }
    }
  }

  // ==================== Private Methods ====================

  /**
   * Create a new client connection
   *
   * OAuth Support:
   * The transport injects stored tokens via authProvider and surfaces 401 errors
   * so the app can trigger manual OAuth via triggerOAuth().
   */
  private async createClient(server: MCPServer, serverKey: string): Promise<Client> {
    const baseUrl = server.baseUrl
    if (!baseUrl) {
      throw new Error(`No baseUrl configured for server: ${server.name}`)
    }

    logger.info(`Creating new client for server: ${server.name}`, { baseUrl })

    // Create OAuth provider for this server
    // The provider handles token storage and browser-based authorization
    const authProvider = createMobileOAuthProvider(baseUrl)

    // Create transport with custom headers and OAuth support
    const transport = new RNStreamableHTTPClientTransport(baseUrl, {
      requestInit: server.headers
        ? {
            headers: server.headers
          }
        : undefined,
      authProvider
    })

    // Set up transport event handlers
    transport.onmessage = message => {
      logger.verbose(`Transport message from ${server.name}:`, message)
    }

    transport.onerror = error => {
      logger.error(`Transport error from ${server.name}:`, error)
    }

    transport.onclose = () => {
      logger.info(`Transport closed for ${server.name}`)
      // Clean up client entry
      this.clients.delete(server.id)
    }

    // Create and connect client
    const client = new Client(
      {
        name: 'cherry-studio-app',
        version: '0.1.5' // TODO: Get from package.json
      },
      {
        capabilities: {}
      }
    )

    await client.connect(transport)

    // Store client entry
    this.clients.set(server.id, {
      client,
      transport,
      serverKey
    })

    logger.info(`Client connected for server: ${server.name}`)
    return client
  }

  private maybePromptAuth(server: MCPServer, error: unknown): void {
    if (!server.baseUrl) return
    if (!isUnauthorizedError(error)) return

    const lastPrompt = this.authPromptedAt.get(server.id) ?? 0
    const now = Date.now()
    if (now - lastPrompt < this.AUTH_PROMPT_COOLDOWN) {
      return
    }

    this.authPromptedAt.set(server.id, now)

    presentDialog('warning', {
      title: i18n.t('mcp.auth.auth_required_title'),
      content: i18n.t('mcp.auth.auth_required_content', { name: server.name || server.id }),
      confirmText: i18n.t('mcp.auth.connect'),
      cancelText: i18n.t('common.cancel'),
      showCancel: true,
      onConfirm: async () => {
        dismissDialog()
        await new Promise<void>(resolve => InteractionManager.runAfterInteractions(() => resolve()))
        const result = await this.triggerOAuth(server.baseUrl || '')
        if (!result.success && result.errorCode !== 'USER_CANCELLED') {
          presentDialog('error', {
            title: i18n.t('mcp.auth.oauth_failed'),
            content: result.error || i18n.t('mcp.auth.oauth_failed')
          })
        }
      }
    })
  }
}

// ==================== Exported Singleton Instance ====================

/**
 * Singleton instance of McpClientService
 *
 * @example
 * ```typescript
 * import { mcpClientService } from '@/services/mcp/McpClientService'
 *
 * // Get tools
 * const tools = await mcpClientService.listTools(server)
 *
 * // Call a tool
 * const result = await mcpClientService.callTool(server, 'toolName', { arg: 'value' })
 * ```
 */
export const mcpClientService = McpClientService.getInstance()
