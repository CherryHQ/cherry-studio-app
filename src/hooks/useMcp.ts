import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { loggerService } from '@/services/LoggerService'
import { mcpClientService } from '@/services/mcp/McpClientService'
import { clearOAuthTokens, hasOAuthTokens } from '@/services/mcp/oauth'
import { mcpService } from '@/services/McpService'
import type { BatchUpdateResult, MCPServer, OAuthTriggerResult } from '@/types/mcp'
import type { MCPTool } from '@/types/tool'

const logger = loggerService.withContext('useMcp')

/**
 * React Hook for managing a specific MCP server (Refactored with useSyncExternalStore)
 *
 * Uses McpService with optimistic updates for zero-latency UX.
 * Integrates with React 18's useSyncExternalStore for efficient re-renders.
 *
 * @param mcpId - The MCP server ID to manage
 *
 * @example
 * ```typescript
 * function McpServerDetail({ mcpId }) {
 *   const {
 *     mcpServer,
 *     isLoading,
 *     updateMcpServer,
 *     deleteMcpServer
 *   } = useMcpServer(mcpId)
 *
 *   return (
 *     <div>
 *       MCP Server: {mcpServer?.name}
 *       <button onClick={() => updateMcpServer({ isActive: true })}>
 *         Activate
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useMcpServer(mcpId: string) {
  // ==================== Subscription (useSyncExternalStore) ====================

  /**
   * Subscribe to MCP server changes
   */
  const subscribe = useCallback(
    (callback: () => void) => {
      logger.verbose(`Subscribing to MCP server changes: ${mcpId}`)
      return mcpService.subscribeMcpServer(mcpId, callback)
    },
    [mcpId]
  )

  /**
   * Get MCP server snapshot (synchronous)
   */
  const getSnapshot = useCallback(() => {
    return mcpService.getMcpServerCached(mcpId)
  }, [mcpId])

  /**
   * Server snapshot (for SSR compatibility - not used in React Native)
   */
  const getServerSnapshot = useCallback(() => {
    return null
  }, [])

  // Use useSyncExternalStore for reactive updates
  const mcpServer = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // ==================== Loading State ====================

  /**
   * Track if we're loading the MCP server from database
   */
  const [isLoading, setIsLoading] = useState(false)

  /**
   * Validate mcpId
   */
  const isValidId = mcpId && mcpId.length > 0

  /**
   * Load MCP server on mount if not cached
   */
  useEffect(() => {
    if (!mcpServer && isValidId) {
      setIsLoading(true)
      mcpService
        .getMcpServer(mcpId)
        .then(() => {
          setIsLoading(false)
        })
        .catch(error => {
          logger.error(`Failed to load MCP server ${mcpId}:`, error as Error)
          setIsLoading(false)
        })
    }
  }, [mcpServer, mcpId, isValidId])

  // ==================== Action Methods ====================

  /**
   * Update MCP server (optimistic)
   */
  const updateMcpServer = useCallback(
    async (updates: Partial<Omit<MCPServer, 'id'>>) => {
      try {
        await mcpService.updateMcpServer(mcpId, updates)
      } catch (error) {
        logger.error(`Failed to update MCP server ${mcpId}:`, error as Error)
        throw error
      }
    },
    [mcpId]
  )

  /**
   * Delete MCP server (optimistic)
   */
  const deleteMcpServer = useCallback(async () => {
    try {
      await mcpService.deleteMcpServer(mcpId)
    } catch (error) {
      logger.error(`Failed to delete MCP server ${mcpId}:`, error as Error)
      throw error
    }
  }, [mcpId])

  // ==================== Return Values ====================

  return {
    mcpServer,
    isLoading,
    updateMcpServer,
    deleteMcpServer
  }
}

/**
 * React Hook for getting all MCP servers
 *
 * Uses McpService with caching for optimal performance.
 *
 * @example
 * ```typescript
 * function McpServerList() {
 *   const { mcpServers, isLoading, updateMcpServers } = useMcpServers()
 *
 *   if (isLoading) return <Loading />
 *
 *   return (
 *     <ul>
 *       {mcpServers.map(server => (
 *         <li key={server.id}>{server.name}</li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 */
export function useMcpServers() {
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  /**
   * Subscribe to changes
   */
  const subscribe = useCallback((callback: () => void) => {
    logger.verbose('Subscribing to all MCP servers changes')
    return mcpService.subscribeAllMcpServers(callback)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      // Reload when any MCP server changes
      loadAllMcpServers()
    })

    loadAllMcpServers()

    return unsubscribe
  }, [subscribe])

  const loadAllMcpServers = async () => {
    try {
      setIsLoading(true)
      setLoadError(null)
      const allMcpServers = await mcpService.getAllMcpServers()
      // Filter to show supported server types (inMemory and streamableHttp)
      const supportedServers = allMcpServers.filter(
        server => server.type === 'inMemory' || server.type === 'streamableHttp'
      )
      setMcpServers(supportedServers)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Failed to load all MCP servers:', error as Error)
      setLoadError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Update multiple MCP servers with proper error handling
   * Uses Promise.allSettled to handle partial failures
   */
  const updateMcpServers = useCallback(async (updates: MCPServer[]): Promise<BatchUpdateResult<MCPServer>> => {
    const results = await Promise.allSettled(
      updates.map(async mcpServer => {
        await mcpService.updateMcpServer(mcpServer.id, mcpServer)
        return mcpServer
      })
    )

    const succeeded: MCPServer[] = []
    const failed: { item: MCPServer; error: string }[] = []

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        succeeded.push(result.value)
      } else {
        const errorMessage = result.reason instanceof Error ? result.reason.message : 'Unknown error'
        failed.push({ item: updates[index], error: errorMessage })
        logger.error(`Failed to update MCP server ${updates[index].name}:`, result.reason as Error)
      }
    })

    return {
      succeeded,
      failed,
      totalSucceeded: succeeded.length,
      totalFailed: failed.length
    }
  }, [])

  return {
    mcpServers,
    isLoading,
    loadError,
    updateMcpServers
  }
}

/**
 * React Hook for managing active MCP servers
 *
 * Uses McpService's getActiveMcpServers method for efficient filtering.
 *
 * @example
 * ```typescript
 * function ActiveMcpServerList() {
 *   const { activeMcpServers, isLoading, updateMcpServers } = useActiveMcpServers()
 *
 *   if (isLoading) return <Loading />
 *
 *   return (
 *     <div>
 *       Active Servers: {activeMcpServers.length}
 *       {activeMcpServers.map(server => (
 *         <div key={server.id}>{server.name}</div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useActiveMcpServers() {
  const [activeMcpServers, setActiveMcpServers] = useState<MCPServer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Subscribe to changes
   */
  const subscribe = useCallback((callback: () => void) => {
    logger.verbose('Subscribing to active MCP servers changes')
    return mcpService.subscribeAllMcpServers(callback)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      // Reload when any MCP server changes
      loadActiveMcpServers()
    })

    loadActiveMcpServers()

    return unsubscribe
  }, [subscribe])

  const loadActiveMcpServers = async () => {
    try {
      setIsLoading(true)
      const activeServers = await mcpService.getActiveMcpServers()
      // Filter to show supported server types (inMemory and streamableHttp)
      const supportedActiveServers = activeServers.filter(
        server => server.type === 'inMemory' || server.type === 'streamableHttp'
      )
      setActiveMcpServers(supportedActiveServers)
    } catch (error) {
      logger.error('Failed to load active MCP servers:', error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateMcpServers = useCallback(async (updates: MCPServer[]) => {
    for (const mcpServer of updates) {
      await mcpService.updateMcpServer(mcpServer.id, mcpServer)
    }
  }, [])

  return {
    activeMcpServers,
    isLoading,
    updateMcpServers
  }
}

/**
 * React Hook for fetching MCP tools for a specific server (with caching)
 *
 * Tools are cached with 5-minute TTL by McpService.
 * On mount and mcpId changes, cached tools are returned immediately if available.
 * Use `refetch()` to force refresh from source.
 *
 * @param mcpId - The MCP server ID
 * @param includeDisabled - Include disabled tools in result (for UI display, default: false)
 *
 * @example
 * ```typescript
 * function McpToolsList({ mcpId }) {
 *   const { tools, isLoading, refetch } = useMcpTools(mcpId)
 *
 *   return (
 *     <div>
 *       Tools: {tools.length}
 *       {tools.map(tool => (
 *         <div key={tool.id}>{tool.name}</div>
 *       ))}
 *       <button onClick={refetch}>Refresh Tools</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useMcpTools(mcpId: string, includeDisabled = false) {
  const [tools, setTools] = useState<MCPTool[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Fetch tools on mount and when mcpId changes
   * Uses cache by default (forceRefresh = false)
   */
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!mcpId || mcpId.length === 0) {
        setTools([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        // Use cached tools if available
        const fetchedTools = await mcpService.getMcpTools(mcpId, false, includeDisabled)
        if (!cancelled) {
          setTools(fetchedTools)
          setIsLoading(false)
        }
      } catch (error) {
        if (!cancelled) {
          logger.error(`Failed to fetch tools for MCP server ${mcpId}:`, error as Error)
          setTools([])
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [mcpId, includeDisabled])

  /**
   * Refetch tools manually (force refresh from source)
   */
  const refetch = useCallback(async () => {
    if (!mcpId || mcpId.length === 0) {
      setTools([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      // Force refresh from source, bypassing cache
      const fetchedTools = await mcpService.getMcpTools(mcpId, true, includeDisabled)
      setTools(fetchedTools)
    } catch (error) {
      logger.error(`Failed to refetch tools for MCP server ${mcpId}:`, error as Error)
      setTools([])
    } finally {
      setIsLoading(false)
    }
  }, [mcpId, includeDisabled])

  return {
    tools,
    isLoading,
    refetch
  }
}

/**
 * React Hook for previewing MCP tools before saving a server
 *
 * Fetches tools directly from an MCP server using URL and headers,
 * without requiring a saved server. Useful for create mode.
 *
 * @param baseUrl - The MCP server URL
 * @param headers - Optional custom headers
 *
 * @example
 * ```typescript
 * function McpCreatePreview({ url, headers }) {
 *   const { tools, isLoading, fetchTools } = useMcpToolsPreview(url, headers)
 *
 *   return (
 *     <div>
 *       <button onClick={fetchTools}>Preview Tools</button>
 *       {tools.map(tool => <div key={tool.name}>{tool.name}</div>)}
 *     </div>
 *   )
 * }
 * ```
 */
export function useMcpToolsPreview(baseUrl?: string, headers?: Record<string, string>) {
  const [tools, setTools] = useState<MCPTool[]>([])
  const [isLoading, setIsLoading] = useState(false)

  /**
   * Fetch tools from the MCP server
   */
  const fetchTools = useCallback(async () => {
    if (!baseUrl) {
      logger.warn('Cannot fetch tools: no server URL')
      return
    }

    const tempServerId = `preview-${Date.now()}`
    setIsLoading(true)
    try {
      // Create a temporary server config for preview
      const tempServer: MCPServer = {
        id: tempServerId,
        name: 'Preview',
        type: 'streamableHttp',
        baseUrl,
        headers,
        isActive: true
      }

      const fetchedTools = await mcpClientService.listTools(tempServer)
      setTools(fetchedTools)
    } catch (error) {
      logger.error('Failed to preview tools:', error as Error)
      setTools([])
    } finally {
      await mcpClientService.closeClient(tempServerId)
      setIsLoading(false)
    }
  }, [baseUrl, headers])

  return {
    tools,
    isLoading,
    fetchTools
  }
}

/**
 * React Hook for managing OAuth authentication for an MCP server
 *
 * Provides OAuth status, trigger, and clear functionality.
 *
 * @param serverUrl - The base URL of the MCP server
 *
 * @example
 * ```typescript
 * function McpOAuthSection({ serverUrl }) {
 *   const {
 *     isAuthenticated,
 *     isAuthenticating,
 *     triggerOAuth,
 *     clearAuth,
 *     checkAuthStatus
 *   } = useMcpOAuth(serverUrl)
 *
 *   return (
 *     <div>
 *       {isAuthenticated ? (
 *         <button onClick={clearAuth}>Disconnect</button>
 *       ) : (
 *         <button onClick={triggerOAuth} disabled={isAuthenticating}>
 *           {isAuthenticating ? 'Connecting...' : 'Connect'}
 *         </button>
 *       )}
 *     </div>
 *   )
 * }
 * ```
 */
export function useMcpOAuth(serverUrl?: string) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState<OAuthTriggerResult | null>(null)

  /**
   * Check current OAuth status
   */
  const checkAuthStatus = useCallback(() => {
    if (!serverUrl) {
      setIsAuthenticated(false)
      return false
    }

    const hasTokens = hasOAuthTokens(serverUrl)
    setIsAuthenticated(hasTokens)
    return hasTokens
  }, [serverUrl])

  /**
   * Check auth status on mount and when serverUrl changes
   */
  useEffect(() => {
    checkAuthStatus()
  }, [checkAuthStatus])

  /**
   * Trigger OAuth flow manually
   * Returns structured result with success status and error details
   */
  const triggerOAuth = useCallback(async (): Promise<OAuthTriggerResult> => {
    if (!serverUrl) {
      logger.warn('Cannot trigger OAuth: no server URL')
      const result: OAuthTriggerResult = {
        success: false,
        error: 'No server URL provided',
        errorCode: 'NO_URL'
      }
      setAuthError(result)
      return result
    }

    setIsAuthenticating(true)
    setAuthError(null)

    try {
      const result = await mcpClientService.triggerOAuth(serverUrl)
      if (result.success) {
        setIsAuthenticated(true)
      } else {
        setAuthError(result)
      }
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('OAuth trigger failed:', error as Error)
      const result: OAuthTriggerResult = {
        success: false,
        error: errorMessage,
        errorCode: 'UNKNOWN'
      }
      setAuthError(result)
      return result
    } finally {
      setIsAuthenticating(false)
    }
  }, [serverUrl])

  /**
   * Clear OAuth tokens (disconnect)
   */
  const clearAuth = useCallback(() => {
    if (!serverUrl) {
      return
    }

    clearOAuthTokens(serverUrl)
    setIsAuthenticated(false)
    setAuthError(null)
    logger.info('OAuth tokens cleared')
  }, [serverUrl])

  return {
    isAuthenticated,
    isAuthenticating,
    authError,
    triggerOAuth,
    clearAuth,
    checkAuthStatus
  }
}
